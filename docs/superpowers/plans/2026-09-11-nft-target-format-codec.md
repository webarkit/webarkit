# NFT target format codec (`.wnft` 0.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the TypeScript reader and canonical writer for the `.wnft` NFT target format 0.2 in `packages/nft-tracker/src/target/format/`, with a deterministic fixture generator and the full conformance, evolution and robustness suites of §8.

**Architecture:** Four layers, each its own module and its own test file, each usable without the one above it. **Container** frames bytes (header, chunks, CRC-32) and knows nothing about JSON. **Manifest** turns the `JSON` chunk's bytes into a validated manifest object (strict UTF-8, I-JSON scan on the *text*, guarded `JSON.parse`, schema, accessors, resource limits). **Decode** runs the §6.1 order over both and materialises a `TargetDb`, viewing the `BIN` chunk zero-copy where alignment permits. **Encode** validates a `TargetDb` against every reader rule first (§7.3) and only then serialises it canonically. No layer throws for control flow: every entry point returns a result value.

**Tech Stack:** TypeScript 5.9 (strict), Vitest 4.1, `fast-check` 4 (new devDependency of `@webarkit/nft-tracker`), Node ≥ 18 at runtime. No runtime dependencies beyond `@webarkit/cv-backend-spec` — CRC-32 and the JSON scanner are written here.

**Spec:** [`docs/specs/nft-target-format.md`](../../specs/nft-target-format.md) — the source of truth. Task 1 amends it to **0.2 rev 2** with the eight corrections agreed before this plan was written; every later task reads the amended text.

---

## Global Constraints

- **Format version implemented:** exactly `"0.2"`. While the major is `0` a reader accepts nothing but its own exact minor (§7.1) — `"0.1"`, `"0.3"` and `"1.0"` are all `UNSUPPORTED_FORMAT_VERSION`.
- **Container version implemented:** `container_major` = `1`; any `container_minor` is accepted (§7.1).
- **Magic:** `"WKNF"` = `57 4B 4E 46`. **Header:** 16 bytes. **Chunk header:** 16 bytes. **Alignment:** every chunk's data starts 8-aligned; chunk padding to a multiple of 8 — `0x20` for `JSON`, `0x00` for every other chunk (§4.2).
- **CRC-32/ISO-HDLC:** reflected polynomial `0xEDB88320`, init and final XOR `0xFFFFFFFF`. Test vector: `"123456789"` → `0xCBF43926` (§4.2).
- **Resource limit defaults (§6.4), all overridable per call:** file 64 MiB (`67108864`), manifest 1 MiB (`1048576`), pyramid levels 32, keypoints per file 1 000 000, descriptor sets per file 16, patch size `P` 64.
- **No exceptions for control flow** (ADR-0001 point 7). `decode` and `encode` return `{ ok: true, … }` / `{ ok: false, error, detail }`. Exceptions stay reserved for contract violations.
- **Fixed-shape data** (ADR-0001 point 7): typed arrays and plain structs, no dynamic property bags. **Determinism:** the fixture generator takes no clock, no RNG that is not seeded, no environment.
- **Language:** every repository artifact — code, comments, commit messages, PR title and body — in English (AGENTS.md), whatever language the conversation uses.
- **Licence header:** every new `.ts` file in `packages/nft-tracker` carries the LGPL-3.0-or-later header block used by `packages/nft-tracker/src/target/types.ts`, with the file's own name on the first line. Copy it verbatim, changing only that name.
- **Commits:** Conventional Commits, scope `nft-tracker` for package changes, no scope for repo-wide ones (`docs:`, `chore:`). Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **Branch:** `feat/nft-target-format` in the worktree `D:\kalwalt-github\webarkit-format`. PR targets `dev`, never `master`.
- **Out of scope** (do not implement, do not test): descriptor-set selection against a backend's capabilities (§6.3), and therefore the error `NO_USABLE_DESCRIPTORS` and the warning `PRODUCER_MISMATCH`; anything in the tracker itself.
- **`WKNF_multiview` is not implemented.** The set of extensions this reader implements is empty, so that name in `extensionsRequired` yields `UNSUPPORTED_EXTENSION` and in `extensionsUsed` alone is pruned with a warning. Consequently `M ≠ N` or a repeated `kpIndex` is always `INCONSISTENT_DATA` (§5.6).

### Running commands on this machine

`.nvmrc` pins Node v24.18.0 and the local `nvm` shim fails inside the repo because only v24.20.0 is installed. Prefix every `npm`/`node` command with the real binary's directory (PowerShell):

```powershell
$env:PATH = "C:\Users\perda\AppData\Local\Author Software\nvm\installs\v24.20.0;" + $env:PATH
```

CI still uses exactly v24.18.0 via `node-version-file: ".nvmrc"`; v24.20.0 is the same major and satisfies `engines.node >= 18`. Dependencies are already installed in the worktree (`npm ci`, 53 packages). Baseline before Task 1: `npm run build`, `npm run typecheck`, `npm test` all green, 19 tests.

---

## File Structure

All paths relative to the repo root. `packages/nft-tracker/src/target/format/`:

| File | Responsibility |
|---|---|
| `crc32.ts` | CRC-32/ISO-HDLC over a `Uint8Array`. Nothing else. |
| `errors.ts` | `ErrorCode`, `WarningCode`, `Warning`, `DecodeResult`, `EncodeResult`. Types and unions only, no logic. |
| `limits.ts` | `DecodeLimits`, `DEFAULT_LIMITS` (§6.4), `DecodeOptions`, `resolveLimits`. |
| `known.ts` | Runtime lists of the descriptor kinds, norms, detector kinds and element types this build knows, with compile-time assertions that they match the contract's unions exactly. |
| `container.ts` | Header and chunk framing both ways (§4): `parseContainer`, `buildContainer`. Knows CRC-32 and byte offsets; knows nothing about JSON or accessors. `DataView` is used here and nowhere else except the accessor copy path. |
| `ijson.ts` | One tokenising pass over the manifest **text** performing the five I-JSON checks of §5 (a)–(e). Shared by the reader (§6.1 step 4) and the writer (§7.3). |
| `manifest.ts` | Bytes → validated manifest: strict UTF-8, `ijson`, guarded `JSON.parse`, format version and extensions (§6.1 step 5), schema and accessor validation (§5.2, §5.3, §5.4, step 6), resource limits (§6.4). |
| `arrays.ts` | Accessor → typed array: a zero-copy view when the absolute byte offset divides by the element size, a copy when it does not (§3). |
| `consistency.ts` | §6.1 step 7 in full, over the parsed manifest and the materialised arrays. Pure functions, no I/O. |
| `decode.ts` | Public `decode`. Orchestrates step 0 → step 7 in exactly the specified order and builds the `TargetDb`. |
| `canonical-json.ts` | Canonical serialisation: code-point key ordering for `params`/`info` (§7.3), value emission, and the manifest's own fixed key order. |
| `validate-target.ts` | §7.3's pre-serialisation validation of a `TargetDb`, mirroring every reader rule; returns the offending field path. |
| `encode.ts` | Public `encode`: validate, lay out accessors, build the `BIN` buffer, emit the manifest, frame. |
| `index.ts` | The format layer's public surface, re-exported by the package's `src/index.ts`. |

Tests mirror that tree under `packages/nft-tracker/test/target/format/`, one file per module, plus `conformance.test.ts` (§8.2, §8.3) and `robustness.test.ts` (§8.4), plus `fixtures-dir.ts` holding the single relative path from the test tree to the fixture corpus.

Fixtures and generator:

| Path | Responsibility |
|---|---|
| `packages/nft-tracker/scripts/generate-fixtures.mjs` | The committed deterministic generator (§8.1). Exports `buildFixtures()` returning a `Map<relativePath, Uint8Array>`; its `main()` writes them. Imports the **built** `dist/`, so `npm run build` precedes it. |
| `fixtures/nft-target/0.2/valid/` | Canonical files, each produced by `encode`. |
| `fixtures/nft-target/0.2/invalid/` | Broken files, hand-framed by the generator, each with its expected error code. |
| `fixtures/nft-target/0.2/warnings/` | Files that decode with an exact expected warning list. |
| `fixtures/nft-target/0.2/noncanonical/` | Valid but non-canonical files, each naming its `valid/` counterpart. |
| `fixtures/nft-target/0.2/expectations.json` | The generator's index: for every file, its category and its expected codes / counterpart. Committed, machine-read by `conformance.test.ts`. |

---

### Task 1: Amend the specification to 0.2 rev 2

Eight gaps were found in the 0.2 text while planning. The correction goes in the specification, not in a silent choice in the codec — so this task lands first and every later task quotes the amended text. All eight are clarifications: **no valid 0.2 file changes meaning and no byte changes**, which is why this is `0.2 rev 2` and not `0.3`, following the `0.1 rev 2` precedent in §12.

**Files:**
- Modify: `docs/specs/nft-target-format.md` (§3, §4.2, §5.2, §5.5, §5.6, §6.1, §6.2, §8.1, §12)
- Modify: `packages/nft-tracker/src/target/types.ts` — the `TargetDb` module doc comment says "format 0.1".

**Interfaces:**
- Consumes: nothing.
- Produces: the amended specification text every later task validates against. In particular the new warning code `UNKNOWN_EXTENSION_IGNORED`, used from Task 3 on.

- [ ] **Step 1: §4.2 — let an unknown chunk sit second when there is no `BIN`**

In the "Chunk rules" list, replace the second and third bullets with:

```markdown
- `BIN\0`, if present, MUST be the second chunk. There is at most one. It MUST be present if the manifest declares any accessor (§5.2).
- A chunk of an unknown type is ignored by readers (warning `UNKNOWN_CHUNK_SKIPPED`). It may sit in second place only when the file has no `BIN\0` chunk. This leaves room for future container minors.
```

The old "the second chunk, if present, MUST be `BIN\0`" forbade an unknown chunk in second place even in a file with no accessors, contradicting the stated purpose of the bullet that followed it.

- [ ] **Step 2: §5.2 — give the missing `BIN` chunk an error code**

Append to the "Accessor rules" list:

```markdown
- A file whose manifest declares at least one accessor and which has no `BIN\0` chunk is `BAD_LAYOUT`. The bound above treats an absent `BIN\0` as a chunk of length `0`, which already rejects every accessor with `count > 0`; this rule also covers the manifest whose accessors all have `count = 0`. The check belongs here, not to §6.1 step 1: a reader cannot know whether accessors exist until the manifest is parsed.
```

- [ ] **Step 3: §5.5 — state `levelStart[0] = 0` for keypoints**

In the `keypoints` field table, replace the `levelStart` row's Content cell with:

```markdown
Keypoints of level `l` are the indices `[levelStart[l], levelStart[l+1])`; `levelStart[0] = 0`, `levelStart[L] = N`, and `levelStart` is non-decreasing
```

§5.6 already spells this out for descriptor sets; leaving it implicit here was the only thing "closed" in §6.1 step 7 had to carry.

- [ ] **Step 4: §5.6 — say what happens when every set is dropped**

After the "**Unknown `elementType`.**" bullet, add a paragraph:

```markdown
**A file whose every set is dropped still decodes.** The decoded target then carries no descriptor set: §5.1's "at least one entry" is a rule about the file, which that file satisfies, not about the decoded target. Two consequences follow and are deliberate. Such a target is not re-encodable — the canonical writer returns `INVALID_TARGET` (§7.3), because the file it would have to emit is one §5.1 forbids. And choosing a set on it (§6.3) yields `NO_USABLE_DESCRIPTORS`, which is exactly what that error means.
```

- [ ] **Step 5: §6.1 — add the file-size check as step 0**

Immediately before the numbered list's item 1, insert:

```markdown
0. **File size.** The buffer is at most the file-size limit (§6.4), checked before a single byte is read: `LIMIT_EXCEEDED`. It is numbered `0` rather than folded into step 1 because it precedes even the magic — a buffer past the limit is rejected without being inspected, so a very large file that is not a `.wnft` at all reports `LIMIT_EXCEEDED`, not `BAD_MAGIC`. Any other order would have the reader checksum a file whose size it has not yet accepted, which is the cost the paragraph above exists to avoid.
```

- [ ] **Step 6: §6.2 — add the missing warning code**

Add a row to the warning table, between `UNKNOWN_CHUNK_SKIPPED` and `UNSUPPORTED_DESCRIPTOR_SET`:

```markdown
| `UNKNOWN_EXTENSION_IGNORED` | A name in `extensionsUsed` but not in `extensionsRequired` that the reader does not implement. Its payloads are ignored and the name is pruned from the decoded `extensionsUsed` (§7.3) |
```

§8.1 already required a `warnings/` fixture for an unknown optional extension and §8.2 item 5 an *exact* warning list for it, so the code was reachable by the test suite before it existed in the table.

- [ ] **Step 7: §3 and §8.1 — make the unaligned base reachable and stop calling it a file**

In §3, after "They MUST NOT read misaligned data through a view.", add:

```markdown
A reader therefore MUST accept a buffer that is not the whole allocation: in TypeScript an `ArrayBufferView`, whose `byteOffset` carries the base, alongside a bare `ArrayBuffer`. Without that the fallback is unreachable from JavaScript — an `ArrayBuffer` always starts at offset `0` — and so untestable.
```

In §8.1's `valid/` bullet, delete the phrase `unaligned-base variant (§3), ` from the list, then append to that same bullet:

```markdown
The unaligned base of §3 is **not** a fixture: a file's bytes cannot be misaligned, only its address can. It is exercised by decoding an existing `valid/` fixture copied to a non-8-aligned `byteOffset` inside a larger buffer.
```

- [ ] **Step 8: §8.1 — note the one error code no `invalid/` file can carry**

Append to the `invalid/` bullet:

```markdown
`NO_USABLE_DESCRIPTORS` is the one exception to "one file per error code": it is produced by the descriptor-set selection of §6.3, against a runtime backend's capabilities, not by decoding, so no file yields it on its own.
```

- [ ] **Step 9: §12 — record the revision**

Append to the revision-history list:

```markdown
- **0.2 rev 2** (2026-09-11) — editorial, from the first implementation: an unknown chunk may sit second when there is no `BIN\0` (§4.2); a missing `BIN\0` under a manifest that declares accessors is `BAD_LAYOUT` (§5.2); `keypoints.levelStart[0] = 0` stated (§5.5); a file whose every descriptor set is dropped still decodes (§5.6); the file-size limit is step 0 of the validation order (§6.1); the new warning `UNKNOWN_EXTENSION_IGNORED` (§6.2), which §8.1 already required a fixture for; readers accept a view so §3's copy fallback is reachable, and the unaligned base stops being listed as a fixture file (§3, §8.1). No change to the bytes or the meaning of any valid `0.2` file.
```

- [ ] **Step 10: fix the stale version in the types doc comment**

In `packages/nft-tracker/src/target/types.ts`, in the `TargetDb` module doc comment, change `(format 0.1)` to `(format 0.2)`.

- [ ] **Step 11: verify nothing else still claims 0.1**

```bash
grep -rn "format 0\.1\|nft-target/0\.1" docs packages --include=*.md --include=*.ts
```

Expected: only §12's revision-history entries for 0.1, which are history and must stay.

- [ ] **Step 12: commit**

Write the message to a file first — it is long and contains characters the shell would otherwise eat:

```bash
git add docs/specs/nft-target-format.md packages/nft-tracker/src/target/types.ts
git commit -F docs/superpowers/plans/.msg-task1.txt
```

with `.msg-task1.txt` holding:

```
docs(spec): clarify eight reader rules, format 0.2 rev 2

Eight gaps found while planning the first implementation. All are
clarifications: no valid 0.2 file changes meaning and no byte changes.

- 4.2: an unknown chunk may sit second when the file has no BIN chunk,
  which the old wording forbade while the next bullet promised room for
  future container minors.
- 5.2: a manifest that declares accessors with no BIN chunk is
  BAD_LAYOUT, including when every accessor has count 0.
- 5.5: keypoints.levelStart[0] = 0, as 5.6 already says for sets.
- 5.6: a file whose every set is dropped still decodes, to no sets.
- 6.1: the file-size limit is step 0, before the magic.
- 6.2: new warning UNKNOWN_EXTENSION_IGNORED, which 8.1 already
  required a fixture for and 8.2 an exact warning list.
- 3, 8.1: readers accept a view, so the copy fallback is reachable; the
  unaligned base stops being listed as a fixture file.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Delete `.msg-task1.txt` after committing; it must not be part of the tree.

---

### Task 2: CRC-32/ISO-HDLC

**Files:**
- Create: `packages/nft-tracker/src/target/format/crc32.ts`
- Test: `packages/nft-tracker/test/target/format/crc32.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `crc32(bytes: Uint8Array): number`, an unsigned 32-bit value.

- [ ] **Step 1: Write the failing test**

Create `packages/nft-tracker/test/target/format/crc32.test.ts` with the LGPL header block copied from `src/target/types.ts` (first line `crc32.test.ts`), then:

```ts
import { describe, it, expect } from "vitest";
import { crc32 } from "../../../src/target/format/crc32.js";

describe("crc32", () => {
    it("matches the specification's test vector (§4.2)", () => {
        expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    });

    it("returns the empty-input identity", () => {
        expect(crc32(new Uint8Array(0))).toBe(0x00000000);
    });

    it("returns an unsigned value when the high bit is set", () => {
        const c = crc32(new Uint8Array([0x00]));
        expect(c).toBe(0xd202ef8d);
        expect(c).toBeGreaterThan(0);
    });

    it("honours a subarray's bounds rather than the whole buffer", () => {
        const whole = new TextEncoder().encode("xx123456789xx");
        expect(crc32(whole.subarray(2, 11))).toBe(0xcbf43926);
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

From `packages/nft-tracker`:

```bash
npx vitest run test/target/format/crc32.test.ts
```

Expected: FAIL — cannot resolve `../../../src/target/format/crc32.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/nft-tracker/src/target/format/crc32.ts` with the LGPL header, then:

```ts
/**
 * CRC-32/ISO-HDLC (§4.2): reflected polynomial `0xEDB88320`, initial value
 * and final XOR `0xFFFFFFFF` — the variant used by zlib, PNG and Rust's
 * `crc32fast`, so that a chunk checksums the same in both implementations.
 *
 * Written here rather than taken from a dependency: it is fifteen lines, and
 * the format layer carries no runtime dependency of its own.
 */

/** Byte-at-a-time table, built once. */
const TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

/**
 * CRC-32 of `bytes`, as an unsigned 32-bit number.
 *
 * Respects the view's own bounds, so a chunk is checksummed through a
 * `subarray` of the file without copying it.
 */
export function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/crc32.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck -w @webarkit/nft-tracker
```

Expected: exit 0. The `!` non-null assertions are required — the package compiles with `strict`, and `noUncheckedIndexedAccess` is off but `TABLE[…]` is still `number | undefined` under `strict` only if that flag is on; keep the assertions either way, they cost nothing and survive the flag being turned on later.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/src/target/format/crc32.ts packages/nft-tracker/test/target/format/crc32.test.ts
git commit -m "feat(nft-tracker): add CRC-32/ISO-HDLC for .wnft chunk checksums

Table-driven, no dependency, pinned by the 4.2 test vector
(\"123456789\" -> 0xCBF43926).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Result types, resource limits and the known-value lists

Three small modules with no logic to speak of, folded into one task because none of them is worth a reviewer's gate on its own and every later task imports all three.

**Files:**
- Create: `packages/nft-tracker/src/target/format/errors.ts`
- Create: `packages/nft-tracker/src/target/format/limits.ts`
- Create: `packages/nft-tracker/src/target/format/known.ts`
- Test: `packages/nft-tracker/test/target/format/limits.test.ts`
- Test: `packages/nft-tracker/test/target/format/known.test.ts`

**Interfaces:**
- Consumes: `TargetDb` from `../types.js`; `DescriptorKind`, `DescriptorNorm`, `DetectorKind` from `@webarkit/cv-backend-spec`.
- Produces, used by every later task:
  - `type ErrorCode` — the twelve codes of §6.2 minus `NO_USABLE_DESCRIPTORS`, plus `INVALID_TARGET` from §7.3.
  - `type WarningCode = "UNKNOWN_CHUNK_SKIPPED" | "UNKNOWN_EXTENSION_IGNORED" | "UNSUPPORTED_DESCRIPTOR_SET"`.
  - `interface Warning { readonly code: WarningCode; readonly detail: string }`.
  - `type DecodeResult = { ok: true; target: TargetDb; warnings: readonly Warning[] } | { ok: false; error: ErrorCode; detail: string }`.
  - `type EncodeResult = { ok: true; bytes: Uint8Array } | { ok: false; error: "INVALID_TARGET"; detail: string }`.
  - `type Failure = { readonly error: ErrorCode; readonly detail: string }` — the internal shape every layer returns upward.
  - `interface DecodeLimits`, `const DEFAULT_LIMITS: DecodeLimits`, `interface DecodeOptions { readonly limits?: Partial<DecodeLimits> }`, `resolveLimits(o?: DecodeOptions): DecodeLimits`.
  - `KNOWN_DESCRIPTOR_KINDS`, `KNOWN_DESCRIPTOR_NORMS`, `KNOWN_DETECTOR_KINDS`, `KNOWN_ELEMENT_TYPES`, `IMPLEMENTED_EXTENSIONS`, `SUPPORTED_FORMAT_VERSION`, `SUPPORTED_CONTAINER_MAJOR`.

- [ ] **Step 1: Write the failing tests**

`test/target/format/limits.test.ts` (LGPL header first):

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_LIMITS, resolveLimits } from "../../../src/target/format/limits.js";

describe("resolveLimits", () => {
    it("uses the §6.4 defaults when given nothing", () => {
        expect(resolveLimits()).toEqual({
            maxFileBytes: 64 * 1024 * 1024,
            maxManifestBytes: 1024 * 1024,
            maxLevels: 32,
            maxKeypoints: 1_000_000,
            maxDescriptorSets: 16,
            maxPatchSize: 64,
        });
    });

    it("overrides only the named limits", () => {
        const r = resolveLimits({ limits: { maxKeypoints: 10 } });
        expect(r.maxKeypoints).toBe(10);
        expect(r.maxFileBytes).toBe(DEFAULT_LIMITS.maxFileBytes);
    });

    it("does not let a caller mutate the defaults", () => {
        const r = resolveLimits({ limits: { maxLevels: 2 } });
        expect(r).not.toBe(DEFAULT_LIMITS);
        expect(DEFAULT_LIMITS.maxLevels).toBe(32);
    });
});
```

`test/target/format/known.test.ts` (LGPL header first):

```ts
import { describe, it, expect } from "vitest";
import {
    IMPLEMENTED_EXTENSIONS,
    KNOWN_DESCRIPTOR_KINDS,
    KNOWN_DESCRIPTOR_NORMS,
    KNOWN_ELEMENT_TYPES,
    SUPPORTED_CONTAINER_MAJOR,
    SUPPORTED_FORMAT_VERSION,
} from "../../../src/target/format/known.js";

describe("known values", () => {
    it("knows exactly the contract's descriptor kinds", () => {
        expect([...KNOWN_DESCRIPTOR_KINDS].sort()).toEqual([
            "akaze", "beblid", "freak", "orb", "teblid",
        ]);
    });

    it("knows exactly the contract's norms, so hamming2 stays unknown (§5.6)", () => {
        expect([...KNOWN_DESCRIPTOR_NORMS].sort()).toEqual(["hamming", "l2"]);
        expect(KNOWN_DESCRIPTOR_NORMS as readonly string[]).not.toContain("hamming2");
    });

    it("knows the three element types the format defines (§5.6)", () => {
        expect([...KNOWN_ELEMENT_TYPES].sort()).toEqual(["bits", "f32", "u8"]);
    });

    it("implements no extension yet, so WKNF_multiview is unknown", () => {
        expect(IMPLEMENTED_EXTENSIONS).toEqual([]);
    });

    it("targets format 0.2 and container major 1", () => {
        expect(SUPPORTED_FORMAT_VERSION).toBe("0.2");
        expect(SUPPORTED_CONTAINER_MAJOR).toBe(1);
    });
});
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
npx vitest run test/target/format/limits.test.ts test/target/format/known.test.ts
```

Expected: FAIL, both files — modules not found.

- [ ] **Step 3: Write `errors.ts`**

```ts
import type { TargetDb } from "../types.js";

/**
 * Every failure a reader can report (§6.2), plus the writer's own
 * `INVALID_TARGET` (§7.3).
 *
 * `NO_USABLE_DESCRIPTORS` is deliberately absent: §6.2 defines it as the
 * outcome of choosing a set against a runtime backend's capabilities (§6.3),
 * which is not part of the codec. It belongs to whatever layer performs that
 * selection, and adding it here would promise a decode path that cannot
 * produce it.
 */
export type ErrorCode =
    | "BAD_MAGIC"
    | "UNSUPPORTED_CONTAINER"
    | "BAD_CONTAINER"
    | "CHECKSUM_MISMATCH"
    | "MANIFEST_TOO_LARGE"
    | "BAD_MANIFEST"
    | "UNSUPPORTED_FORMAT_VERSION"
    | "UNSUPPORTED_EXTENSION"
    | "BAD_LAYOUT"
    | "LIMIT_EXCEEDED"
    | "INCONSISTENT_DATA"
    | "INVALID_TARGET";

/**
 * Warnings a successful decode can carry (§6.2).
 *
 * `PRODUCER_MISMATCH` is absent for the same reason `NO_USABLE_DESCRIPTORS`
 * is: it compares the chosen set's `producer` with a runtime backend's
 * `capabilities.name`, and no backend is in play here.
 */
export type WarningCode =
    | "UNKNOWN_CHUNK_SKIPPED"
    | "UNKNOWN_EXTENSION_IGNORED"
    | "UNSUPPORTED_DESCRIPTOR_SET";

/**
 * One warning. `detail` names what triggered it — a chunk type, an extension
 * name, a descriptor-set index — so an application can act on it rather than
 * just count it, which is why §6.2 requires warnings in the result and not
 * only in the console.
 */
export interface Warning {
    readonly code: WarningCode;
    readonly detail: string;
}

/** A failure travelling up through the codec's internal layers. */
export interface Failure {
    readonly error: ErrorCode;
    readonly detail: string;
}

/** The reader's result. Never an exception (ADR-0001 point 7). */
export type DecodeResult =
    | { readonly ok: true; readonly target: TargetDb; readonly warnings: readonly Warning[] }
    | { readonly ok: false; readonly error: ErrorCode; readonly detail: string };

/**
 * The writer's result (§7.3). `detail` names the offending field path, e.g.
 * `"descriptorSets[1].params.seed"`, so the caller can find the value without
 * re-validating the target.
 */
export type EncodeResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly error: "INVALID_TARGET"; readonly detail: string };

/** Build a `Failure`. Shorthand used throughout the codec. */
export function fail(error: ErrorCode, detail: string): Failure {
    return { error, detail };
}
```

- [ ] **Step 4: Write `limits.ts`**

```ts
/**
 * Resource limits (§6.4). Readers MUST enforce them and MUST let them be
 * configured: a build serving files it produced itself can raise them, an
 * application loading a URL a user chose should not.
 */
export interface DecodeLimits {
    /** Whole file, bytes. Checked at §6.1 step 0, before anything is read. */
    readonly maxFileBytes: number;
    /** `JSON` chunk, bytes. Checked before the manifest is decoded (step 3). */
    readonly maxManifestBytes: number;
    readonly maxLevels: number;
    readonly maxKeypoints: number;
    readonly maxDescriptorSets: number;
    /** The patch edge `P`, not the patch count. */
    readonly maxPatchSize: number;
}

/** The defaults §6.4 suggests. */
export const DEFAULT_LIMITS: DecodeLimits = Object.freeze({
    maxFileBytes: 64 * 1024 * 1024,
    maxManifestBytes: 1024 * 1024,
    maxLevels: 32,
    maxKeypoints: 1_000_000,
    maxDescriptorSets: 16,
    maxPatchSize: 64,
});

export interface DecodeOptions {
    /** Overrides for individual limits; anything omitted keeps its default. */
    readonly limits?: Partial<DecodeLimits>;
}

/** Merge caller overrides onto {@link DEFAULT_LIMITS}, without mutating it. */
export function resolveLimits(options?: DecodeOptions): DecodeLimits {
    return { ...DEFAULT_LIMITS, ...options?.limits };
}
```

- [ ] **Step 5: Write `known.ts`**

```ts
import type {
    DescriptorKind,
    DescriptorNorm,
    DetectorKind,
} from "@webarkit/cv-backend-spec";

/** The only `format.version` this build reads or writes (§7.1). */
export const SUPPORTED_FORMAT_VERSION = "0.2";

/** The only `container_major` this build frames (§7.1). Any minor is fine. */
export const SUPPORTED_CONTAINER_MAJOR = 1;

/**
 * Descriptor families this build recognises. A set whose `kind` is not here
 * stays **present but unusable**, with `UNSUPPORTED_DESCRIPTOR_SET` (§5.6):
 * its element width is still known, so it round-trips unchanged.
 */
export const KNOWN_DESCRIPTOR_KINDS = [
    "orb", "freak", "beblid", "teblid", "akaze",
] as const satisfies readonly DescriptorKind[];

/**
 * Distance metrics this build recognises.
 *
 * §5.6's prose lists `"hamming2"` among the possibilities, and it is
 * deliberately **not** here: the contract's `DescriptorNorm` does not define
 * it, so a set using it is one this reader does not know, warns about and
 * preserves. That is the rule working, not a gap.
 */
export const KNOWN_DESCRIPTOR_NORMS = [
    "hamming", "l2",
] as const satisfies readonly DescriptorNorm[];

/** Detector families the contract enumerates. Informative only (§5.5). */
export const KNOWN_DETECTOR_KINDS = [
    "fast", "yape", "yape06", "orb", "akaze",
] as const satisfies readonly DetectorKind[];

/**
 * Element types the format defines (§5.6). Unlike `kind` and `norm`, an
 * unknown one makes a set uninterpretable — nothing says how wide an element
 * is — so such a set is dropped on decode rather than preserved.
 */
export const KNOWN_ELEMENT_TYPES = ["bits", "u8", "f32"] as const;

/**
 * Extensions this build implements — none yet.
 *
 * `WKNF_multiview` (§5.6) is specified but its adoption is blocked on
 * k-nearest matching in the contract (§11, Q3), so listing it here would
 * claim a ratio test this package cannot perform. The consequences are the
 * specified ones: the name in `extensionsRequired` is `UNSUPPORTED_EXTENSION`,
 * in `extensionsUsed` alone it is pruned with `UNKNOWN_EXTENSION_IGNORED`,
 * and `M ≠ N` is therefore always `INCONSISTENT_DATA`.
 */
export const IMPLEMENTED_EXTENSIONS: readonly string[] = [];

// The lists above must stay exactly the contract's unions, not merely a
// subset of them: a family the contract gains and this file does not would
// silently become "unknown" and every file carrying it would start warning.
// `satisfies` catches a value that is not in the union; these two catch a
// union member that is not in the value.
type MissingKind = Exclude<DescriptorKind, (typeof KNOWN_DESCRIPTOR_KINDS)[number]>;
type MissingNorm = Exclude<DescriptorNorm, (typeof KNOWN_DESCRIPTOR_NORMS)[number]>;
type MissingDetector = Exclude<DetectorKind, (typeof KNOWN_DETECTOR_KINDS)[number]>;
const _exhaustive: [MissingKind, MissingNorm, MissingDetector] extends [never, never, never]
    ? true
    : never = true;
void _exhaustive;
```

- [ ] **Step 6: Run the tests and make sure they pass**

```bash
npx vitest run test/target/format/limits.test.ts test/target/format/known.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck -w @webarkit/nft-tracker
```

Expected: exit 0. If `_exhaustive` errors, a contract union has gained a member: add it to the matching list rather than loosening the assertion — that error *is* the check doing its job.

- [ ] **Step 8: Commit**

```bash
git add packages/nft-tracker/src/target/format/errors.ts packages/nft-tracker/src/target/format/limits.ts packages/nft-tracker/src/target/format/known.ts packages/nft-tracker/test/target/format/limits.test.ts packages/nft-tracker/test/target/format/known.test.ts
git commit -m "feat(nft-tracker): add .wnft result types, limits and known values

Error and warning codes of 6.2 (minus the two that belong to the
backend-facing selection of 6.3), the configurable resource limits of
6.4, and the runtime lists of what this build recognises, pinned to the
contract's unions by a compile-time exhaustiveness assertion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Container — read path

**Files:**
- Create: `packages/nft-tracker/src/target/format/container.ts`
- Test: `packages/nft-tracker/test/target/format/container.test.ts`
- Test helper: `packages/nft-tracker/test/target/format/raw.ts` — hand-builds container bytes for tests that must produce files the writer never would.

**Interfaces:**
- Consumes: `crc32`, `Failure`/`fail` and `SUPPORTED_CONTAINER_MAJOR`.
- Produces:
  - `const MAGIC = "WKNF"`, `const HEADER_SIZE = 16`, `const CHUNK_HEADER_SIZE = 16`, `function align8(n: number): number`.
  - `interface Chunk { readonly type: string; readonly dataStart: number; readonly length: number }` — `dataStart` is an offset **into the given view**, `length` excludes padding.
  - `interface ParsedContainer { readonly json: Chunk; readonly bin: Chunk | null; readonly unknown: readonly Chunk[] }`
  - `function parseContainer(bytes: Uint8Array): { ok: true; value: ParsedContainer } | { ok: false } & Failure`
  - `function verifyChunkCrc(bytes: Uint8Array, chunk: Chunk, stored: number): boolean` — or the CRC check folded into `parseContainer`; see step 3.

- [ ] **Step 1: Write the test helper**

`test/target/format/raw.ts` (LGPL header first). It exists because `invalid/` cases are files the canonical writer refuses to emit, so they cannot be built through `encode`:

```ts
/**
 * Hand-built container bytes, for tests and for the fixture generator's
 * `invalid/` cases: files the canonical writer would never produce and
 * therefore cannot be built through `encode`.
 *
 * Every field is a parameter with a correct default, so a test overrides
 * exactly the one thing it is about and nothing else drifts.
 */
import { crc32 } from "../../../src/target/format/crc32.js";

export interface RawChunk {
    /** Exactly four ASCII characters, e.g. `"JSON"` or `"BIN\0"`. */
    readonly type: string;
    readonly data: Uint8Array;
    /** Overrides the computed CRC-32, to forge a mismatch. */
    readonly crc?: number;
    /** Overrides the stored length, to forge an out-of-bounds chunk. */
    readonly length?: number;
    /** Overrides the reserved word, which MUST be 0 (§4.2). */
    readonly reserved?: number;
}

export interface RawFile {
    readonly magic?: string;
    readonly containerMajor?: number;
    readonly containerMinor?: number;
    /** Overrides `total_length`, to forge a truncation mismatch. */
    readonly totalLength?: number;
    /** Overrides `flags`, which MUST be 0 (§4.1). */
    readonly flags?: number;
    readonly chunks: readonly RawChunk[];
}

const align8 = (n: number): number => (n + 7) & ~7;

export function buildRaw(file: RawFile): Uint8Array {
    const chunks = file.chunks;
    let total = 16;
    for (const c of chunks) total += 16 + align8(c.data.length);

    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    const ascii = (s: string, at: number): void => {
        for (let i = 0; i < 4; i += 1) out[at + i] = s.charCodeAt(i) & 0xff;
    };

    ascii(file.magic ?? "WKNF", 0);
    view.setUint16(4, file.containerMajor ?? 1, true);
    view.setUint16(6, file.containerMinor ?? 0, true);
    view.setUint32(8, file.totalLength ?? total, true);
    view.setUint32(12, file.flags ?? 0, true);

    let at = 16;
    for (const c of chunks) {
        view.setUint32(at, c.length ?? c.data.length, true);
        ascii(c.type, at + 4);
        view.setUint32(at + 8, c.crc ?? crc32(c.data), true);
        view.setUint32(at + 12, c.reserved ?? 0, true);
        out.set(c.data, at + 16);
        // §4.2: the JSON chunk pads with spaces, every other chunk with zeros.
        const pad = align8(c.data.length) - c.data.length;
        if (c.type === "JSON") out.fill(0x20, at + 16 + c.data.length, at + 16 + c.data.length + pad);
        at += 16 + align8(c.data.length);
    }
    return out;
}

/** A `JSON` chunk from manifest text. */
export const jsonChunk = (text: string): RawChunk => ({
    type: "JSON",
    data: new TextEncoder().encode(text),
});

/** A `BIN\0` chunk. The type's fourth byte is NUL, not a space. */
export const binChunk = (data: Uint8Array): RawChunk => ({
    type: "BIN\\0",
    data,
});
```

- [ ] **Step 2: Write the failing test**

`test/target/format/container.test.ts` (LGPL header first):

```ts
import { describe, it, expect } from "vitest";
import { parseContainer } from "../../../src/target/format/container.js";
import { binChunk, buildRaw, jsonChunk } from "./raw.js";

const ok = (r: ReturnType<typeof parseContainer>) => {
    if (!r.ok) throw new Error(`expected ok, got ${r.error}: ${r.detail}`);
    return r.value;
};
const err = (r: ReturnType<typeof parseContainer>) => {
    if (r.ok) throw new Error("expected a failure");
    return r.error;
};

const MANIFEST = '{"format":{"version":"0.2"}}';
const BIN = new Uint8Array([1, 2, 3, 4, 5]);

describe("parseContainer", () => {
    it("frames a JSON + BIN file and reports unpadded lengths", () => {
        const c = ok(parseContainer(buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] })));
        expect(c.json.length).toBe(MANIFEST.length);
        expect(c.json.dataStart).toBe(32);
        expect(c.bin?.length).toBe(5);
        // 16 header + 16 chunk header + 28 padded to 32 + 16 chunk header.
        expect(c.bin?.dataStart).toBe(80);
        expect(c.unknown).toEqual([]);
    });

    it("starts every chunk's data at an 8-aligned offset (§4.2)", () => {
        const c = ok(parseContainer(buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] })));
        expect(c.json.dataStart % 8).toBe(0);
        expect((c.bin?.dataStart ?? 1) % 8).toBe(0);
    });

    it("rejects a buffer too short to hold a header", () => {
        expect(err(parseContainer(new Uint8Array(15)))).toBe("BAD_CONTAINER");
    });

    it("rejects a wrong magic before anything else", () => {
        expect(err(parseContainer(buildRaw({ magic: "GLTF", chunks: [jsonChunk(MANIFEST)] })))).toBe("BAD_MAGIC");
    });

    it("rejects an unknown container major", () => {
        expect(err(parseContainer(buildRaw({ containerMajor: 2, chunks: [jsonChunk(MANIFEST)] })))).toBe("UNSUPPORTED_CONTAINER");
    });

    it("accepts a newer container minor (§7.1)", () => {
        expect(ok(parseContainer(buildRaw({ containerMinor: 7, chunks: [jsonChunk(MANIFEST)] })))).toBeDefined();
    });

    it("rejects a total_length that is not the buffer length", () => {
        expect(err(parseContainer(buildRaw({ totalLength: 999, chunks: [jsonChunk(MANIFEST)] })))).toBe("BAD_CONTAINER");
    });

    it("rejects a non-zero flags field", () => {
        expect(err(parseContainer(buildRaw({ flags: 1, chunks: [jsonChunk(MANIFEST)] })))).toBe("BAD_CONTAINER");
    });

    it("rejects a non-zero reserved word in a chunk header", () => {
        const raw = buildRaw({ chunks: [{ ...jsonChunk(MANIFEST), reserved: 1 }] });
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("rejects a chunk whose stored length runs past the file", () => {
        const raw = buildRaw({ chunks: [{ ...jsonChunk(MANIFEST), length: 4096 }] });
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("rejects a file whose first chunk is not JSON", () => {
        expect(err(parseContainer(buildRaw({ chunks: [binChunk(BIN), jsonChunk(MANIFEST)] })))).toBe("BAD_CONTAINER");
    });

    it("rejects a second JSON chunk", () => {
        expect(err(parseContainer(buildRaw({ chunks: [jsonChunk(MANIFEST), jsonChunk(MANIFEST)] })))).toBe("BAD_CONTAINER");
    });

    it("rejects two BIN chunks", () => {
        expect(err(parseContainer(buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN), binChunk(BIN)] })))).toBe("BAD_CONTAINER");
    });

    it("rejects a BIN chunk that is not second", () => {
        const raw = buildRaw({ chunks: [jsonChunk(MANIFEST), { type: "XTRA", data: BIN }, binChunk(BIN)] });
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("reports an unknown chunk after JSON and BIN", () => {
        const raw = buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN), { type: "XTRA", data: BIN }] });
        expect(ok(parseContainer(raw)).unknown.map((c) => c.type)).toEqual(["XTRA"]);
    });

    it("accepts an unknown chunk in second place when there is no BIN (§4.2, rev 2)", () => {
        const raw = buildRaw({ chunks: [jsonChunk(MANIFEST), { type: "XTRA", data: BIN }] });
        const c = ok(parseContainer(raw));
        expect(c.bin).toBeNull();
        expect(c.unknown.map((x) => x.type)).toEqual(["XTRA"]);
    });

    it("rejects a corrupted JSON chunk by checksum", () => {
        expect(err(parseContainer(buildRaw({ chunks: [{ ...jsonChunk(MANIFEST), crc: 0 }] })))).toBe("CHECKSUM_MISMATCH");
    });

    it("rejects a corrupted BIN chunk by checksum", () => {
        const raw = buildRaw({ chunks: [jsonChunk(MANIFEST), { ...binChunk(BIN), crc: 0 }] });
        expect(err(parseContainer(raw))).toBe("CHECKSUM_MISMATCH");
    });

    it("does not checksum an unknown chunk (§6.1 step 2 names only JSON and BIN)", () => {
        const raw = buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN), { type: "XTRA", data: BIN, crc: 0 }] });
        expect(ok(parseContainer(raw)).unknown).toHaveLength(1);
    });

    it("never throws on a truncated valid file, at any offset", () => {
        const whole = buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] });
        for (let n = 0; n < whole.length; n += 1) {
            const r = parseContainer(whole.subarray(0, n));
            expect(r.ok).toBe(false);
        }
    });
});
```

- [ ] **Step 3: Run it to make sure it fails**

```bash
npx vitest run test/target/format/container.test.ts
```

Expected: FAIL — `container.js` not found.

- [ ] **Step 4: Write the read path**

`src/target/format/container.ts` (LGPL header first). Read the §4.1/§4.2 tables while writing this; the field offsets below are theirs.

```ts
import { crc32 } from "./crc32.js";
import { fail, type Failure } from "./errors.js";
import { SUPPORTED_CONTAINER_MAJOR } from "./known.js";

export const MAGIC = "WKNF";
export const HEADER_SIZE = 16;
export const CHUNK_HEADER_SIZE = 16;

/** Round up to a multiple of 8 — the padding rule of §4.2. */
export function align8(n: number): number {
    return (n + 7) & ~7;
}

/**
 * One chunk located inside the buffer given to {@link parseContainer}.
 * `dataStart` is relative to that buffer's own start, and `length` excludes
 * the padding, exactly as `chunk_length` does.
 */
export interface Chunk {
    readonly type: string;
    readonly dataStart: number;
    readonly length: number;
}

export interface ParsedContainer {
    readonly json: Chunk;
    /** `null` when the file has no `BIN\0` chunk. */
    readonly bin: Chunk | null;
    /** Chunks of a type this build does not know; each warrants a warning. */
    readonly unknown: readonly Chunk[];
}

export type ParseResult =
    | { readonly ok: true; readonly value: ParsedContainer }
    | ({ readonly ok: false } & Failure);

const BIN_TYPE = "BIN\\0";

function readType(bytes: Uint8Array, at: number): string {
    return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

/**
 * §6.1 steps 1 and 2: frame the file and check the two checksums.
 *
 * Nothing here looks at JSON. The split matters because a reader must be able
 * to reject a container it cannot frame *before* it looks for the manifest
 * (§2), and because the fixture generator needs the framing on its own to
 * build files the writer refuses to produce.
 */
export function parseContainer(bytes: Uint8Array): ParseResult {
    if (bytes.length < HEADER_SIZE) {
        return { ok: false, ...fail("BAD_CONTAINER", `file is ${bytes.length} bytes, below the ${HEADER_SIZE}-byte header`) };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (readType(bytes, 0) !== MAGIC) {
        return { ok: false, ...fail("BAD_MAGIC", `magic is not "${MAGIC}"`) };
    }
    const major = view.getUint16(4, true);
    if (major !== SUPPORTED_CONTAINER_MAJOR) {
        return { ok: false, ...fail("UNSUPPORTED_CONTAINER", `container_major ${major} is not ${SUPPORTED_CONTAINER_MAJOR}`) };
    }
    // container_minor at offset 6 is read and ignored on purpose: a newer
    // minor only adds chunks a reader can skip (§7.1).
    const totalLength = view.getUint32(8, true);
    if (totalLength !== bytes.length) {
        return { ok: false, ...fail("BAD_CONTAINER", `total_length ${totalLength} is not the buffer length ${bytes.length}`) };
    }
    const flags = view.getUint32(12, true);
    if (flags !== 0) {
        return { ok: false, ...fail("BAD_CONTAINER", `flags is reserved and must be 0, got ${flags}`) };
    }

    const chunks: Chunk[] = [];
    const stored: number[] = [];
    let at = HEADER_SIZE;
    while (at < totalLength) {
        if (at + CHUNK_HEADER_SIZE > totalLength) {
            return { ok: false, ...fail("BAD_CONTAINER", `chunk header at ${at} runs past the file`) };
        }
        const length = view.getUint32(at, true);
        const type = readType(bytes, at + 4);
        const crc = view.getUint32(at + 8, true);
        const reserved = view.getUint32(at + 12, true);
        if (reserved !== 0) {
            return { ok: false, ...fail("BAD_CONTAINER", `chunk "${type}" reserved word must be 0, got ${reserved}`) };
        }
        const dataStart = at + CHUNK_HEADER_SIZE;
        // align8 of a u32 near 2^32 stays exact in Number, and the comparison
        // below catches the overflow the addition cannot produce here.
        const padded = align8(length);
        if (dataStart + padded > totalLength) {
            return { ok: false, ...fail("BAD_CONTAINER", `chunk "${type}" of ${length} bytes at ${dataStart} runs past the file`) };
        }
        chunks.push({ type, dataStart, length });
        stored.push(crc);
        at = dataStart + padded;
    }

    if (chunks.length === 0 || chunks[0]!.type !== "JSON") {
        return { ok: false, ...fail("BAD_CONTAINER", "the first chunk must be JSON") };
    }
    if (chunks.filter((c) => c.type === "JSON").length !== 1) {
        return { ok: false, ...fail("BAD_CONTAINER", "there must be exactly one JSON chunk") };
    }
    const binIndexes = chunks.map((c, i) => (c.type === BIN_TYPE ? i : -1)).filter((i) => i >= 0);
    if (binIndexes.length > 1) {
        return { ok: false, ...fail("BAD_CONTAINER", "there must be at most one BIN chunk") };
    }
    if (binIndexes.length === 1 && binIndexes[0] !== 1) {
        return { ok: false, ...fail("BAD_CONTAINER", "the BIN chunk must be the second chunk") };
    }
    const json = chunks[0]!;
    const bin = binIndexes.length === 1 ? chunks[1]! : null;

    // §6.1 step 2 checksums JSON and BIN only. An unknown chunk is skipped
    // whole, so verifying its CRC would reject a file over bytes this reader
    // never reads.
    for (const c of bin === null ? [json] : [json, bin]) {
        const i = chunks.indexOf(c);
        const actual = crc32(bytes.subarray(c.dataStart, c.dataStart + c.length));
        if (actual !== stored[i]) {
            return { ok: false, ...fail("CHECKSUM_MISMATCH", `chunk "${c.type}" checksum is ${actual}, stored ${stored[i]}`) };
        }
    }

    const unknown = chunks.filter((c) => c !== json && c !== bin);
    return { ok: true, value: { json, bin, unknown } };
}
```

- [ ] **Step 5: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/container.test.ts
```

Expected: PASS, 20 tests. The truncation loop is the one that catches an unguarded `DataView` read — if it throws rather than failing, a bounds check is missing above.

- [ ] **Step 6: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/container.ts packages/nft-tracker/test/target/format/container.test.ts packages/nft-tracker/test/target/format/raw.ts
git commit -m "feat(nft-tracker): parse the .wnft container

Header and chunk framing of 4, with the two checksums of 6.1 step 2.
Returns a failure for every malformation and never throws, including on
a valid file truncated at every byte offset.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Container — write path

**Files:**
- Modify: `packages/nft-tracker/src/target/format/container.ts` (append `buildContainer`)
- Modify: `packages/nft-tracker/test/target/format/container.test.ts` (append a `buildContainer` block)

**Interfaces:**
- Consumes: `crc32`, `align8`, `parseContainer`, `MAGIC`, `HEADER_SIZE`, `CHUNK_HEADER_SIZE`, `BIN_TYPE` from Task 4.
- Produces: `buildContainer(json: Uint8Array, bin: Uint8Array | null): Uint8Array` — the framing half of the canonical writer. Task 13 supplies the two payloads; Task 14's generator calls it directly to build files the writer refuses to emit.

- [ ] **Step 1: Write the failing test**

Append to `test/target/format/container.test.ts` (extend the existing import of `container.js` rather than adding a second one):

```ts
describe("buildContainer", () => {
    const json = new TextEncoder().encode(MANIFEST);

    it("frames what parseContainer reads back", () => {
        const c = ok(parseContainer(buildContainer(json, BIN)));
        expect(c.json.length).toBe(json.length);
        expect(c.bin?.length).toBe(BIN.length);
        expect(c.unknown).toEqual([]);
    });

    it("writes a total_length equal to the file it produced", () => {
        const bytes = buildContainer(json, BIN);
        expect(new DataView(bytes.buffer).getUint32(8, true)).toBe(bytes.length);
    });

    it("pads the JSON chunk with spaces and the BIN chunk with zeros (§4.2)", () => {
        const bytes = buildContainer(json, BIN);
        const c = ok(parseContainer(bytes));
        const jsonPad = bytes.subarray(c.json.dataStart + c.json.length, c.json.dataStart + align8(c.json.length));
        expect(jsonPad.length).toBeGreaterThan(0);
        expect([...jsonPad].every((b) => b === 0x20)).toBe(true);
        const binPad = bytes.subarray(c.bin!.dataStart + c.bin!.length, c.bin!.dataStart + align8(c.bin!.length));
        expect(binPad.length).toBeGreaterThan(0);
        expect([...binPad].every((b) => b === 0x00)).toBe(true);
    });

    it("starts every chunk's data 8-aligned, whatever the manifest length", () => {
        for (let extra = 0; extra < 9; extra += 1) {
            const padded = new TextEncoder().encode(MANIFEST + " ".repeat(extra));
            const c = ok(parseContainer(buildContainer(padded, BIN)));
            expect(c.json.dataStart % 8).toBe(0);
            expect(c.bin!.dataStart % 8).toBe(0);
        }
    });

    it("omits the BIN chunk when given none", () => {
        expect(ok(parseContainer(buildContainer(json, null))).bin).toBeNull();
    });

    it("frames an empty BIN chunk rather than omitting it", () => {
        const c = ok(parseContainer(buildContainer(json, new Uint8Array(0))));
        expect(c.bin).not.toBeNull();
        expect(c.bin!.length).toBe(0);
    });

    it("is byte-identical for the same input", () => {
        expect(buildContainer(json, BIN)).toEqual(buildContainer(json, BIN));
    });
});
```

`MANIFEST`, `BIN`, `ok` and `err` already exist at the top of the file from Task 4; add `align8` and `buildContainer` to its `container.js` import.

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/container.test.ts
```

Expected: FAIL — `buildContainer` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/target/format/container.ts`:

```ts
const JSON_PAD = 0x20;
const OTHER_PAD = 0x00;

function writeType(out: Uint8Array, at: number, type: string): void {
    for (let i = 0; i < 4; i += 1) out[at + i] = type.charCodeAt(i) & 0xff;
}

function writeChunk(
    out: Uint8Array,
    view: DataView,
    at: number,
    type: string,
    data: Uint8Array,
    pad: number,
): number {
    view.setUint32(at, data.length, true);
    writeType(out, at + 4, type);
    view.setUint32(at + 8, crc32(data), true);
    view.setUint32(at + 12, 0, true); // reserved, MUST be 0 (§4.2)
    out.set(data, at + CHUNK_HEADER_SIZE);
    const dataEnd = at + CHUNK_HEADER_SIZE + data.length;
    const chunkEnd = at + CHUNK_HEADER_SIZE + align8(data.length);
    out.fill(pad, dataEnd, chunkEnd);
    return chunkEnd;
}

/**
 * The framing half of the canonical writer (§7.3): header, then `JSON`, then
 * `BIN\0`, and no other chunk.
 *
 * `bin` is `null` only for a manifest that declares no accessor at all —
 * which no real target produces, since keypoints always carry arrays. An
 * empty `Uint8Array` is framed as a present, zero-length chunk rather than
 * omitted: the two are different files, and §5.2 (rev 2) distinguishes them.
 */
export function buildContainer(json: Uint8Array, bin: Uint8Array | null): Uint8Array {
    const total =
        HEADER_SIZE +
        CHUNK_HEADER_SIZE + align8(json.length) +
        (bin === null ? 0 : CHUNK_HEADER_SIZE + align8(bin.length));

    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);

    writeType(out, 0, MAGIC);
    view.setUint16(4, SUPPORTED_CONTAINER_MAJOR, true);
    view.setUint16(6, 0, true);
    view.setUint32(8, total, true);
    view.setUint32(12, 0, true); // flags, reserved

    let at = writeChunk(out, view, HEADER_SIZE, "JSON", json, JSON_PAD);
    if (bin !== null) at = writeChunk(out, view, at, BIN_TYPE, bin, OTHER_PAD);
    return out;
}
```

**Check the `BIN_TYPE` constant while you are here.** §4.2 spells the type `BIN\0` — `B`, `I`, `N`, NUL — so the constant must be the four-character string ending in `U+0000`, not one ending in a space. Write it as `const BIN_TYPE = "BIN" + String.fromCharCode(0);` if a literal NUL in the source is awkward, and make `raw.ts`'s `binChunk` helper use the same constant by importing it rather than repeating the spelling. Re-run the Task 4 tests after any change here.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run test/target/format/container.test.ts
```

Expected: PASS — the Task 4 cases plus these 7.

- [ ] **Step 5: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/container.ts packages/nft-tracker/test/target/format/container.test.ts packages/nft-tracker/test/target/format/raw.ts
git commit -m "feat(nft-tracker): frame the .wnft container

The writing half of 4: header, JSON chunk, BIN chunk, each padded to a
multiple of 8 with the byte 4.2 prescribes. Round-trips through
parseContainer and is byte-identical for identical input.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The I-JSON scanner

The crux of format 0.2. §6.1 step 4 requires all five checks of §5 **on the manifest text, before `JSON.parse`** — two of them (duplicate member names, out-of-range integer literals) are impossible afterwards, because the parser has already destroyed the evidence. One tokenising pass does all five and doubles as a syntax check.

> The implementation below was prototyped and run against 106 cases — every
> example in §5 and §8.1, the whole `invalid/` syntax corpus, and 200 000
> levels of array nesting — before this plan was written. Port it as it
> stands; it is not a sketch.

**Files:**
- Create: `packages/nft-tracker/src/target/format/ijson.ts`
- Test: `packages/nft-tracker/test/target/format/ijson.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface IJsonViolation { readonly path: string; readonly reason: string }`
  - `function scanIJson(text: string): IJsonViolation | null` — `null` means conforming I-JSON.
  - `function hasUnpairedSurrogate(s: string): boolean` — check (b), reused by the writer on in-memory strings.
  - `function hasNoncharacter(s: string): boolean` — check (e), same.
  - `const MAX_EXACT_INTEGER = 9007199254740991` — check (c)'s bound, reused by the writer.

- [ ] **Step 1: Write the failing test**

`test/target/format/ijson.test.ts` (LGPL header first). The two helpers at the top keep every non-ASCII code point and every JSON escape out of the source as literal characters, so the file stays readable and no editor can silently normalise a test input:

```ts
import { describe, it, expect } from "vitest";
import {
    hasNoncharacter,
    hasUnpairedSurrogate,
    scanIJson,
} from "../../../src/target/format/ijson.js";

/** A single backslash, so `\uXXXX` escapes below are built, not typed. */
const BS = "\\";
/** The JSON text `{"x":"<escape>"}` carrying one `\uXXXX` escape. */
const escaped = (...hex: string[]): string =>
    '{"x":"' + hex.map((h) => BS + "u" + h).join("") + '"}';
/** The JSON text `{"x":"<raw code point>"}`. */
const raw = (cp: number): string => '{"x":"' + String.fromCodePoint(cp) + '"}';

const reason = (text: string): string | null => scanIJson(text)?.reason ?? null;

describe("scanIJson — accepts conforming I-JSON", () => {
    it("accepts the manifest shapes the specification shows", () => {
        expect(scanIJson('{"format":{"version":"0.2"},"accessors":[{"offset":0,"count":3,"type":"f32"}]}')).toBeNull();
        expect(scanIJson('{"a":[1,-2,3.5,true,false,null,""],"b":{}}')).toBeNull();
        expect(scanIJson('{"a":[{"b":{}},[],{}],"c":[[[]]]}')).toBeNull();
        expect(scanIJson('  {"a" : 1 , "b" : [ 2 ] }  ')).toBeNull();
    });

    it("accepts 2^53 − 1, the boundary §8.1 requires to decode", () => {
        expect(scanIJson('{"seed":9007199254740991}')).toBeNull();
        expect(scanIJson('{"seed":-9007199254740991}')).toBeNull();
    });

    it("accepts a literal rounding to zero — every parser reads 0 (§5 d)", () => {
        expect(scanIJson('{"x":1e-400}')).toBeNull();
    });

    it("accepts a big magnitude written with an exponent or a fraction", () => {
        expect(scanIJson('{"x":1e20}')).toBeNull();
        expect(scanIJson('{"x":9007199254740993.0}')).toBeNull();
    });

    it("accepts a well-formed surrogate pair written as escapes", () => {
        expect(scanIJson(escaped("D83D", "DE00"))).toBeNull();
    });

    it("accepts the code point just past the U+FDD0..U+FDEF block", () => {
        expect(scanIJson(raw(0xfdf0))).toBeNull();
    });
});

describe("scanIJson — check (a), duplicate member names", () => {
    it("rejects a repeated name", () => {
        expect(reason('{"a":1,"a":2}')).toMatch(/duplicate/i);
    });

    it("rejects the same name written two ways, compared after unescaping", () => {
        expect(reason('{"a":1,"' + BS + 'u0061":2}')).toMatch(/duplicate/i);
    });

    it("rejects a duplicate nested inside params, and names the object", () => {
        const v = scanIJson('{"params":{"k":1,"k":2}}');
        expect(v?.reason).toMatch(/duplicate/i);
        expect(v?.path).toBe("$.params");
    });

    it("allows the same name in two different objects", () => {
        expect(scanIJson('{"a":{"k":1},"b":{"k":2}}')).toBeNull();
    });
});

describe("scanIJson — check (b), unpaired surrogate escapes", () => {
    it("rejects a lone high surrogate", () => {
        expect(reason(escaped("D800"))).toMatch(/surrogate/i);
    });

    it("rejects a lone low surrogate", () => {
        expect(reason(escaped("DC00"))).toMatch(/surrogate/i);
    });

    it("rejects a high surrogate followed by another high surrogate", () => {
        expect(reason(escaped("D800", "D800"))).toMatch(/surrogate/i);
    });

    it("rejects one in a member name", () => {
        expect(reason('{"' + BS + 'uD800":1}')).toMatch(/surrogate/i);
    });
});

describe("scanIJson — check (c), integer literals beyond ±(2^53 − 1)", () => {
    it("rejects 2^53 and −2^53", () => {
        expect(reason('{"seed":9007199254740992}')).toMatch(/integer/i);
        expect(reason('{"seed":-9007199254740992}')).toMatch(/integer/i);
    });

    it("rejects the value that would collapse onto 2^53", () => {
        expect(reason('{"seed":9007199254740993}')).toMatch(/integer/i);
    });

    it("rejects an integer literal far past any double", () => {
        expect(reason('{"seed":' + "9".repeat(400) + "}")).toMatch(/integer/i);
    });
});

describe("scanIJson — check (d), literals rounding to infinity", () => {
    it("rejects 1e400, -1e400 and 1.5e400", () => {
        expect(reason('{"x":1e400}')).toMatch(/infinit/i);
        expect(reason('{"x":-1e400}')).toMatch(/infinit/i);
        expect(reason('{"x":1.5e400}')).toMatch(/infinit/i);
    });
});

describe("scanIJson — check (e), Unicode noncharacters", () => {
    it("rejects a raw U+FFFF and U+FFFE, which strict UTF-8 accepts", () => {
        expect(reason(raw(0xffff))).toMatch(/noncharacter/i);
        expect(reason(raw(0xfffe))).toMatch(/noncharacter/i);
    });

    it("rejects the ends of the U+FDD0..U+FDEF block", () => {
        expect(reason(raw(0xfdd0))).toMatch(/noncharacter/i);
        expect(reason(raw(0xfdef))).toMatch(/noncharacter/i);
    });

    it("rejects an escaped U+FDD0 in a member name", () => {
        expect(reason('{"' + BS + 'uFDD0":1}')).toMatch(/noncharacter/i);
    });

    it("rejects a plane-end noncharacter, raw or escaped", () => {
        expect(reason(raw(0x1ffff))).toMatch(/noncharacter/i);
        expect(reason(raw(0x10fffe))).toMatch(/noncharacter/i);
        expect(reason(escaped("D83F", "DFFF"))).toMatch(/noncharacter/i);
    });
});

describe("scanIJson — syntax and termination", () => {
    it("rejects malformed JSON without throwing", () => {
        const bad = [
            "", "{", "}", "[1,]", '{"a"}', '{"a":}', "{a:1}", "'x'", "01", "+1",
            ".5", "1.", "tru", '{"a":1}x', "[1 2]", '{"a":1 "b":2}', "[", '{"a"',
            '{"a":1,}', "nul", "[,]", "{]", "--1", "1e", "0x1", "[1]]",
        ];
        for (const s of bad) expect(scanIJson(s), s).not.toBeNull();
    });

    it("rejects a raw control character inside a string", () => {
        expect(scanIJson('{"a":"' + String.fromCharCode(1) + '"}')).not.toBeNull();
    });

    it("never accepts text JSON.parse rejects", () => {
        const corpus = [
            '{"a":1}', "[1,2,3]", '"s"', "1", "true", "null", '{"a":[{"b":{}}]}',
            '{"a":1,}', "[,]", "{]", "--1", "1e", "0x1", "[1]]", "01", ".5", "1.",
        ];
        for (const s of corpus) {
            let parses = true;
            try { JSON.parse(s); } catch { parses = false; }
            if (!parses) expect(scanIJson(s), s).not.toBeNull();
        }
    });

    it("terminates on deep nesting instead of overflowing the stack", () => {
        expect(scanIJson("[".repeat(200_000) + "]".repeat(200_000))).toBeNull();
        expect(scanIJson('{"a":'.repeat(50_000) + "1" + "}".repeat(50_000))).toBeNull();
    });

    it("reports the path of the offending value", () => {
        expect(scanIJson('{"descriptorSets":[{"params":{"seed":1e400}}]}')?.path)
            .toBe("$.descriptorSets[0].params.seed");
        expect(scanIJson('{"a":[1,2,1e400]}')?.path).toBe("$.a[2]");
    });
});

describe("the helpers the writer reuses on in-memory values", () => {
    it("hasUnpairedSurrogate agrees with well-formedness", () => {
        expect(hasUnpairedSurrogate("ok")).toBe(false);
        expect(hasUnpairedSurrogate(String.fromCodePoint(0x1f600))).toBe(false);
        expect(hasUnpairedSurrogate(String.fromCharCode(0xd800))).toBe(true);
        expect(hasUnpairedSurrogate(String.fromCharCode(0xdc00) + "x")).toBe(true);
    });

    it("hasNoncharacter finds every family §5 (e) lists", () => {
        expect(hasNoncharacter("plain")).toBe(false);
        expect(hasNoncharacter(String.fromCharCode(0xfdd0))).toBe(true);
        expect(hasNoncharacter(String.fromCharCode(0xfdef))).toBe(true);
        expect(hasNoncharacter(String.fromCharCode(0xfdf0))).toBe(false);
        expect(hasNoncharacter(String.fromCharCode(0xfffe))).toBe(true);
        expect(hasNoncharacter(String.fromCharCode(0xffff))).toBe(true);
        expect(hasNoncharacter(String.fromCodePoint(0x1fffe))).toBe(true);
        expect(hasNoncharacter(String.fromCodePoint(0x10ffff))).toBe(true);
        expect(hasNoncharacter(String.fromCodePoint(0x1f600))).toBe(false);
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/ijson.test.ts
```

Expected: FAIL — `ijson.js` not found.

- [ ] **Step 3: Write the helpers**

`src/target/format/ijson.ts` (LGPL header first), then:

```ts
/**
 * The five I-JSON checks of §5, in one pass over the manifest **text**.
 *
 * Two of them cannot be done any other way. A duplicate member name is gone
 * after parsing — the parser kept one of the two and nothing records that
 * there was another — and an integer literal outside ±(2^53 − 1) has already
 * been rounded, so `9007199254740993` is `9007199254740992` by the time it is
 * a value. The other three could be done by walking the parsed tree; doing
 * all five here is one pass instead of two.
 *
 * The scan is iterative, with an explicit stack, so pathological nesting
 * terminates rather than overflowing. (`JSON.parse` may still throw a
 * `RangeError` on such input; §6.1 step 4 makes that `BAD_MANIFEST` too, and
 * the caller catches it.)
 *
 * It also rejects malformed JSON, which makes it a syntax check as well — but
 * the caller still parses inside `try`/`catch`, because agreeing with
 * `JSON.parse` on every input is not something this file promises.
 */

/** The largest integer an IEEE 754 double represents exactly — check (c). */
export const MAX_EXACT_INTEGER = 9007199254740991;

export interface IJsonViolation {
    /** Where the offending value sits, e.g. `$.descriptorSets[0].params.seed`. */
    readonly path: string;
    readonly reason: string;
}

/**
 * Check (b). A string is ill-formed when a high surrogate is not followed by
 * a low one, or a low one stands alone.
 *
 * Written out rather than taken from `String.prototype.isWellFormed`, which
 * needs Node 20 while this package's `engines` floor is Node 18.
 */
export function hasUnpairedSurrogate(s: string): boolean {
    for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
            if (next < 0xdc00 || next > 0xdfff) return true;
            i += 1;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            return true;
        }
    }
    return false;
}

/**
 * Check (e). The 66 noncharacters: U+FDD0..U+FDEF, and U+xFFFE / U+xFFFF at
 * the end of every plane.
 *
 * The plane-end families are recognised through the low surrogate alone: in
 * UTF-16 the low unit of U+xFFFE is always `0xDFFE` and of U+xFFFF always
 * `0xDFFF`, whatever the plane, and no other code point pairs to either. Code
 * units are compared numerically rather than matched by a regular expression
 * so that no source file in this package has to contain a noncharacter or a
 * lone surrogate as a literal.
 */
export function hasNoncharacter(s: string): boolean {
    for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c >= 0xfdd0 && c <= 0xfdef) return true;
        if (c === 0xfffe || c === 0xffff) return true;
        if (c >= 0xd800 && c <= 0xdbff) {
            const low = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
            if (low === 0xdffe || low === 0xdfff) return true;
        }
    }
    return false;
}
```

- [ ] **Step 4: Write the scanner**

Append to the same file. Two states — a value is expected, or the value just read is complete and the enclosing container decides what follows — which is what keeps the loop flat:

```ts
interface Frame {
    readonly kind: "object" | "array";
    /** Path of this container itself. */
    readonly path: string;
    /** Names seen so far; `null` for an array. Check (a). */
    readonly names: Set<string> | null;
    /** Path of the member currently being read, for reporting. */
    member: string;
    index: number;
}

// Sticky, so scanning a number costs its own length rather than a slice of
// the rest of the manifest.
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
    '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t",
};

export function scanIJson(text: string): IJsonViolation | null {
    const n = text.length;
    let i = 0;
    const stack: Frame[] = [];

    const here = (): string => (stack.length === 0 ? "$" : stack[stack.length - 1]!.member);
    const bad = (reason: string): IJsonViolation => ({ path: here(), reason });

    const skipWs = (): void => {
        while (i < n) {
            const c = text.charCodeAt(i);
            if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) break;
            i += 1;
        }
    };

    type StringRead = { readonly value: string } | { readonly violation: string };

    /** Reads the string at `text[i] === '"'`, returning its unescaped value. */
    const readString = (): StringRead => {
        i += 1;
        let out = "";
        for (;;) {
            if (i >= n) return { violation: "unterminated string" };
            const c = text.charCodeAt(i);
            if (c === 0x22) {
                i += 1;
                return { value: out };
            }
            if (c === 0x5c) {
                i += 1;
                if (i >= n) return { violation: "unterminated escape" };
                const e = text[i]!;
                i += 1;
                if (e === "u") {
                    const hex = text.slice(i, i + 4);
                    if (hex.length < 4 || !HEX4.test(hex)) {
                        return { violation: "malformed unicode escape" };
                    }
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                } else {
                    const simple = SIMPLE_ESCAPES[e];
                    if (simple === undefined) return { violation: `invalid escape: ${e}` };
                    out += simple;
                }
                continue;
            }
            if (c < 0x20) return { violation: "raw control character in a string" };
            out += text[i]!;
            i += 1;
        }
    };

    /** Checks (b) and (e) on an unescaped string, name or value alike. */
    const checkString = (s: string): string | null => {
        if (hasUnpairedSurrogate(s)) return "string contains an unpaired surrogate (§5 check b)";
        if (hasNoncharacter(s)) return "string contains a Unicode noncharacter (§5 check e)";
        return null;
    };

    const literal = (word: string): boolean => {
        if (text.startsWith(word, i)) {
            i += word.length;
            return true;
        }
        return false;
    };

    /**
     * Reads one value at `i`. `"opened"` means a non-empty container was
     * entered and its frame is now on the stack; `"closed"` means the value
     * is complete.
     */
    const readValue = (): IJsonViolation | "opened" | "closed" => {
        if (i >= n) return bad("unexpected end of input");
        const c = text[i]!;
        if (c === "{" || c === "[") {
            const kind = c === "{" ? "object" : "array";
            const path = here();
            i += 1;
            skipWs();
            if (i < n && text[i] === (kind === "object" ? "}" : "]")) {
                i += 1;
                return "closed";
            }
            stack.push({
                kind,
                path,
                names: kind === "object" ? new Set<string>() : null,
                member: path,
                index: 0,
            });
            return "opened";
        }
        if (c === '"') {
            const s = readString();
            if ("violation" in s) return bad(s.violation);
            const problem = checkString(s.value);
            return problem === null ? "closed" : bad(problem);
        }
        if (c === "t") return literal("true") ? "closed" : bad("invalid literal");
        if (c === "f") return literal("false") ? "closed" : bad("invalid literal");
        if (c === "n") return literal("null") ? "closed" : bad("invalid literal");

        NUMBER.lastIndex = i;
        const m = NUMBER.exec(text);
        if (m === null || m.index !== i) return bad("invalid value");
        const lit = m[0];
        i = NUMBER.lastIndex;
        if (INTEGER.test(lit)) {
            const v = BigInt(lit);
            if (v > BigInt(MAX_EXACT_INTEGER) || v < -BigInt(MAX_EXACT_INTEGER)) {
                return bad(`integer literal ${lit} is outside ±(2^53 − 1) (§5 check c)`);
            }
        }
        if (!Number.isFinite(Number(lit))) {
            return bad(`number literal ${lit} rounds to infinity (§5 check d)`);
        }
        return "closed";
    };

    /** Reads `"name" :` into the frame on top of the stack. */
    const readMember = (): IJsonViolation | null => {
        const frame = stack[stack.length - 1]!;
        skipWs();
        if (i >= n || text[i] !== '"') return { path: frame.path, reason: "expected a member name" };
        const s = readString();
        if ("violation" in s) return { path: frame.path, reason: s.violation };
        const problem = checkString(s.value);
        if (problem !== null) return { path: frame.path, reason: problem };
        if (frame.names!.has(s.value)) {
            return { path: frame.path, reason: `duplicate member name "${s.value}" (§5 check a)` };
        }
        frame.names!.add(s.value);
        frame.member = `${frame.path}.${s.value}`;
        skipWs();
        if (i >= n || text[i] !== ":") return { path: frame.member, reason: "expected ':'" };
        i += 1;
        return null;
    };

    let mode: "value" | "after" = "value";
    for (;;) {
        if (mode === "value") {
            skipWs();
            const r = readValue();
            if (typeof r === "object") return r;
            if (r === "opened") {
                const frame = stack[stack.length - 1]!;
                if (frame.kind === "object") {
                    const v = readMember();
                    if (v !== null) return v;
                } else {
                    frame.member = `${frame.path}[0]`;
                }
                continue; // still "value": the member's own value comes next
            }
            mode = "after";
            continue;
        }

        if (stack.length === 0) break;
        const frame = stack[stack.length - 1]!;
        skipWs();
        if (i >= n) return { path: frame.path, reason: "unexpected end of input" };
        const c = text[i]!;
        const close = frame.kind === "object" ? "}" : "]";
        if (c === close) {
            i += 1;
            stack.pop();
            continue; // still "after": the container is itself now a finished value
        }
        if (c !== ",") return { path: frame.member, reason: `expected ',' or '${close}'` };
        i += 1;
        if (frame.kind === "object") {
            const v = readMember();
            if (v !== null) return v;
        } else {
            frame.index += 1;
            frame.member = `${frame.path}[${frame.index}]`;
        }
        mode = "value";
    }

    skipWs();
    if (i !== n) return { path: "$", reason: "trailing content after the top-level value" };
    return null;
}
```

- [ ] **Step 5: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/ijson.test.ts
```

Expected: PASS, every case. Do not weaken a test to make it pass — each one is a clause of §5.

- [ ] **Step 6: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/ijson.ts packages/nft-tracker/test/target/format/ijson.test.ts
git commit -m "feat(nft-tracker): add the I-JSON scanner for .wnft manifests

One tokenising pass over the manifest text performs all five checks of
5: duplicate member names compared after unescaping, unpaired surrogate
escapes, integer literals beyond +/-(2^53 - 1), literals rounding to
infinity, and Unicode noncharacters in names and values alike. The first
two are impossible after JSON.parse, which is why 6.1 step 4 puts the
scan before it. Iterative, so deep nesting terminates instead of
overflowing the stack.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Manifest decoding — §6.1 steps 3, 4 and 5

Turns the `JSON` chunk's bytes into a parsed JSON value, with the version and extension gates passed. Stops short of the schema, which is Task 8: this task is about *getting a value at all* from untrusted bytes.

**Files:**
- Create: `packages/nft-tracker/src/target/format/manifest.ts`
- Test: `packages/nft-tracker/test/target/format/manifest.test.ts`

**Interfaces:**
- Consumes: `Failure`/`fail`, `Warning` (Task 3); `DecodeLimits` (Task 3); `scanIJson` (Task 6); `SUPPORTED_FORMAT_VERSION`, `IMPLEMENTED_EXTENSIONS` (Task 3).
- Produces:
  - `interface ManifestHead { readonly doc: Record<string, unknown>; readonly generator: string | undefined; readonly extensionsUsed: readonly string[]; readonly extensionsRequired: readonly string[] }`
  - `function decodeManifest(bytes: Uint8Array, limits: DecodeLimits): { ok: true; value: ManifestHead; warnings: readonly Warning[] } | ({ ok: false } & Failure)`
  - `extensionsUsed` in the result is already **pruned** to what this build implements (§7.3), which today is nothing.

- [ ] **Step 1: Write the failing test**

`test/target/format/manifest.test.ts` (LGPL header first):

```ts
import { describe, it, expect } from "vitest";
import { decodeManifest } from "../../../src/target/format/manifest.js";
import { DEFAULT_LIMITS } from "../../../src/target/format/limits.js";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const run = (s: string | Uint8Array, limits = DEFAULT_LIMITS) =>
    decodeManifest(typeof s === "string" ? utf8(s) : s, limits);
const errorOf = (r: ReturnType<typeof run>) => (r.ok ? null : r.error);

const MINIMAL = '{"format":{"version":"0.2"}}';

describe("decodeManifest — size (§6.1 step 3)", () => {
    it("rejects a manifest one byte above the limit, before decoding it", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: 16 };
        expect(errorOf(run('{"format":{"version":"0.2"}}', limits))).toBe("MANIFEST_TOO_LARGE");
    });

    it("accepts a manifest exactly at the limit", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: MINIMAL.length };
        expect(run(MINIMAL, limits).ok).toBe(true);
    });
});

describe("decodeManifest — text (§6.1 step 4)", () => {
    it("rejects bytes that are not strict UTF-8", () => {
        expect(errorOf(run(new Uint8Array([0x7b, 0xff, 0x7d])))).toBe("BAD_MANIFEST");
    });

    it("rejects a lone surrogate encoded raw in the UTF-8 bytes", () => {
        // ED A0 80 is the CESU-8 spelling of U+D800, which strict UTF-8 refuses.
        expect(errorOf(run(new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x7d])))).toBe("BAD_MANIFEST");
    });

    it("rejects each I-JSON violation as BAD_MANIFEST", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"a":1,"a":2}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{"version":"0.2"},"a":9007199254740992}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{"version":"0.2"},"a":1e400}'))).toBe("BAD_MANIFEST");
    });

    it("rejects text that is not JSON", () => {
        expect(errorOf(run("not json"))).toBe("BAD_MANIFEST");
    });

    it("rejects a top level that is not an object", () => {
        expect(errorOf(run("[1,2]"))).toBe("BAD_MANIFEST");
        expect(errorOf(run("null"))).toBe("BAD_MANIFEST");
        expect(errorOf(run('"s"'))).toBe("BAD_MANIFEST");
    });

    it("does not throw on pathological nesting", () => {
        const deep = '{"a":'.repeat(100_000) + "1" + "}".repeat(100_000);
        expect(() => run(deep)).not.toThrow();
        expect(run(deep).ok).toBe(false);
    });
});

describe("decodeManifest — version and extensions (§6.1 step 5)", () => {
    it("accepts exactly 0.2", () => {
        expect(run(MINIMAL).ok).toBe(true);
    });

    it("rejects every other version while the major is 0 (§7.1)", () => {
        for (const v of ["0.1", "0.3", "1.0", "0.2.0", "", "x"]) {
            expect(errorOf(run(`{"format":{"version":"${v}"}}`)), v).toBe("UNSUPPORTED_FORMAT_VERSION");
        }
    });

    it("rejects a malformed format object as BAD_MANIFEST, not as a version", () => {
        expect(errorOf(run("{}"))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{}}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{"version":2}}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":"0.2"}'))).toBe("BAD_MANIFEST");
    });

    it("carries the optional generator through", () => {
        const r = run('{"format":{"version":"0.2","generator":"gen 1.0"}}');
        expect(r.ok && r.value.generator).toBe("gen 1.0");
        expect(run(MINIMAL).ok && run(MINIMAL).value.generator).toBeUndefined();
    });

    it("rejects an unimplemented extension in extensionsRequired", () => {
        const r = run('{"format":{"version":"0.2"},"extensionsUsed":["WKNF_multiview"],"extensionsRequired":["WKNF_multiview"]}');
        expect(errorOf(r)).toBe("UNSUPPORTED_EXTENSION");
    });

    it("prunes an unimplemented extension used but not required, and warns", () => {
        const r = run('{"format":{"version":"0.2"},"extensionsUsed":["WKNF_multiview"]}');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.extensionsUsed).toEqual([]);
        expect(r.warnings.map((w) => w.code)).toEqual(["UNKNOWN_EXTENSION_IGNORED"]);
    });

    it("treats absent extension arrays as empty", () => {
        const r = run(MINIMAL);
        expect(r.ok && r.value.extensionsUsed).toEqual([]);
        expect(r.ok && r.value.extensionsRequired).toEqual([]);
    });

    it("rejects extension arrays that are not arrays of strings", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsUsed":"x"}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsRequired":[1]}'))).toBe("BAD_MANIFEST");
    });

    it("rejects a required extension that is not also used (§5.1)", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsRequired":["WKNF_x"],"extensionsUsed":[]}'))).toBe("BAD_MANIFEST");
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/manifest.test.ts
```

Expected: FAIL — `manifest.js` not found.

- [ ] **Step 3: Write the implementation**

`src/target/format/manifest.ts` (LGPL header first), then:

```ts
import { fail, type Failure, type Warning } from "./errors.js";
import { scanIJson } from "./ijson.js";
import { IMPLEMENTED_EXTENSIONS, SUPPORTED_FORMAT_VERSION } from "./known.js";
import type { DecodeLimits } from "./limits.js";

/**
 * The manifest, parsed and past the gates of §6.1 steps 3 to 5, but not yet
 * schema-checked: `doc` is still `unknown` field by field.
 */
export interface ManifestHead {
    readonly doc: Record<string, unknown>;
    readonly generator: string | undefined;
    /**
     * Already pruned to what this build implements (§7.3), so re-encoding
     * never advertises a payload that decoding threw away.
     */
    readonly extensionsUsed: readonly string[];
    readonly extensionsRequired: readonly string[];
}

export type ManifestResult =
    | { readonly ok: true; readonly value: ManifestHead; readonly warnings: readonly Warning[] }
    | ({ readonly ok: false } & Failure);

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * §6.1 steps 3 to 5, in that order: the size gate before any decoding, then
 * strict UTF-8, the I-JSON scan on the text, `JSON.parse` inside
 * `try`/`catch`, then the format version and the required extensions.
 *
 * The scan runs before the parse because two of its five checks cannot run
 * after it (§5). The parse is still guarded: this reader does not promise to
 * agree with `JSON.parse` on every malformed input, and pathological nesting
 * can raise a `RangeError` that step 4 makes `BAD_MANIFEST`.
 */
export function decodeManifest(bytes: Uint8Array, limits: DecodeLimits): ManifestResult {
    // Step 3 — size, before the manifest is decoded at all.
    if (bytes.length > limits.maxManifestBytes) {
        return { ok: false, ...fail("MANIFEST_TOO_LARGE", `JSON chunk is ${bytes.length} bytes, limit ${limits.maxManifestBytes}`) };
    }

    // Step 4 — strict UTF-8, the I-JSON checks, then the parse.
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
        return { ok: false, ...fail("BAD_MANIFEST", "the JSON chunk is not strict UTF-8") };
    }
    const violation = scanIJson(text);
    if (violation !== null) {
        return { ok: false, ...fail("BAD_MANIFEST", `${violation.path}: ${violation.reason}`) };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { ok: false, ...fail("BAD_MANIFEST", `JSON.parse failed: ${String(e)}`) };
    }
    if (!isObject(parsed)) {
        return { ok: false, ...fail("BAD_MANIFEST", "the manifest's top level must be an object") };
    }

    // Step 5 — format version, then extensions.
    const format = parsed["format"];
    if (!isObject(format)) {
        return { ok: false, ...fail("BAD_MANIFEST", "format must be an object") };
    }
    const version = format["version"];
    if (typeof version !== "string") {
        return { ok: false, ...fail("BAD_MANIFEST", "format.version must be a string") };
    }
    if (version !== SUPPORTED_FORMAT_VERSION) {
        // While the major is 0, only the exact minor is accepted (§7.1): a
        // 0.1 reader accepting a 0.3 file would silently misread it.
        return { ok: false, ...fail("UNSUPPORTED_FORMAT_VERSION", `format.version "${version}" is not "${SUPPORTED_FORMAT_VERSION}"`) };
    }
    const generatorValue = format["generator"];
    if (generatorValue !== undefined && typeof generatorValue !== "string") {
        return { ok: false, ...fail("BAD_MANIFEST", "format.generator must be a string when present") };
    }

    const usedValue = parsed["extensionsUsed"] ?? [];
    const requiredValue = parsed["extensionsRequired"] ?? [];
    if (!isStringArray(usedValue)) {
        return { ok: false, ...fail("BAD_MANIFEST", "extensionsUsed must be an array of strings") };
    }
    if (!isStringArray(requiredValue)) {
        return { ok: false, ...fail("BAD_MANIFEST", "extensionsRequired must be an array of strings") };
    }
    for (const name of requiredValue) {
        if (!usedValue.includes(name)) {
            return { ok: false, ...fail("BAD_MANIFEST", `extensionsRequired lists "${name}", which extensionsUsed does not (§5.1)`) };
        }
    }
    for (const name of requiredValue) {
        if (!IMPLEMENTED_EXTENSIONS.includes(name)) {
            return { ok: false, ...fail("UNSUPPORTED_EXTENSION", `extensionsRequired lists "${name}", which this reader does not implement`) };
        }
    }

    // §7.3: an unknown non-required extension is ignored, and its name is
    // pruned from extensionsUsed so re-encoding does not advertise a payload
    // that is no longer there.
    const warnings: Warning[] = [];
    const keptUsed: string[] = [];
    for (const name of usedValue) {
        if (IMPLEMENTED_EXTENSIONS.includes(name)) {
            keptUsed.push(name);
        } else {
            warnings.push({ code: "UNKNOWN_EXTENSION_IGNORED", detail: `extensionsUsed: ${name}` });
        }
    }

    return {
        ok: true,
        value: {
            doc: parsed,
            generator: generatorValue,
            extensionsUsed: keptUsed,
            extensionsRequired: requiredValue,
        },
        warnings,
    };
}
```

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/manifest.test.ts
```

Expected: PASS. If the CESU-8 case fails, check that `fatal: true` is actually set — without it `TextDecoder` substitutes U+FFFD and the file decodes.

- [ ] **Step 5: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/manifest.ts packages/nft-tracker/test/target/format/manifest.test.ts
git commit -m "feat(nft-tracker): decode the .wnft manifest text

Steps 3 to 5 of 6.1: the size gate before decoding, strict UTF-8, the
I-JSON scan on the text, a guarded JSON.parse, then the exact format
version 7.1 requires while the major is 0, and the extension gates -
unimplemented and required is an error, unimplemented and merely used is
pruned with a warning, as 7.3 requires.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Manifest schema and accessors — §6.1 step 6

Every required key present with the right type, every accessor inside the `BIN` chunk with the type and count its field fixes, every domain of §5.2 to §5.8, and every count within the limits of §6.4 — all **before** any array is materialised, so nothing allocates in proportion to a size that has not been checked.

**Files:**
- Modify: `packages/nft-tracker/src/target/format/manifest.ts` (append the schema half)
- Modify: `packages/nft-tracker/test/target/format/manifest.test.ts` (append a `validateManifest` block)

**Interfaces:**
- Consumes: `ManifestHead` (Task 7), `DecodeLimits`, `KNOWN_DESCRIPTOR_KINDS`, `KNOWN_DESCRIPTOR_NORMS`, `KNOWN_ELEMENT_TYPES`.
- Produces, consumed by Tasks 9 to 11:
  - `type AccessorType = "u8" | "u16" | "u32" | "f32"`; `const ELEMENT_SIZE: Record<AccessorType, number>`.
  - `interface Accessor { readonly offset: number; readonly count: number; readonly type: AccessorType }`.
  - `interface ManifestSpec` — the whole validated manifest, with every accessor reference resolved to an **index**, not yet to an array:
    ```ts
    interface ManifestSpec {
        readonly head: ManifestHead;
        readonly accessors: readonly Accessor[];
        readonly meta: { readonly widthPx: number; readonly heightPx: number;
                         readonly physicalSizeMm: readonly [number, number] | null };
        readonly pyramid: { readonly scaleStep: number;
                            readonly levelSizes: readonly (readonly [number, number])[] };
        readonly keypoints: {
            readonly count: number;
            readonly detector: { readonly kind: string; readonly params: Params };
            readonly levelStart: number; readonly x: number; readonly y: number;
            readonly angle: number; readonly score: number;
            readonly size: number | undefined; readonly level: number;
        };
        readonly descriptorSets: readonly SetSpec[];
        readonly patches: PatchSpec | undefined;
        readonly referenceImage: RefImageSpec | undefined;
        readonly info: TargetInfo | undefined;
    }
    ```
    with `SetSpec` carrying `kind`, `norm`, `elementType` (narrowed to a known one), `dimensions`, `bytesPerDescriptor`, `producer`, `params`, `count`, and the indices `levelStart`, `kpIndex`, `data`.
  - `function validateManifest(head: ManifestHead, binLength: number | null, limits: DecodeLimits): { ok: true; value: ManifestSpec; warnings: readonly Warning[] } | ({ ok: false } & Failure)`

- [ ] **Step 1: Write the failing test**

Append to `test/target/format/manifest.test.ts`. The helper builds a known-good manifest object and lets each case break exactly one thing:

```ts
// A 2-level, 3-keypoint, 1-set, 1-patch target. Every case below starts from
// this and changes one field, so a failure names the rule it broke.
const good = () => ({
    format: { version: "0.2" },
    meta: { widthPx: 8, heightPx: 4, physicalSizeMm: [80, 40] },
    pyramid: { scaleStep: 2, levelSizes: [[8, 4], [4, 2]] },
    keypoints: {
        count: 3,
        detector: { kind: "fast", params: { threshold: 20 } },
        levelStart: 0, x: 1, y: 2, angle: 3, score: 4, level: 5,
    },
    descriptorSets: [{
        kind: "orb", norm: "hamming", elementType: "bits", dimensions: 32,
        bytesPerDescriptor: 4, producer: "jsfeatnext", count: 3,
        levelStart: 6, kpIndex: 7, data: 8,
    }],
    patches: { patchSize: 2, count: 1, score: 9, left: 10, top: 11, level: 12, pixels: 13 },
    accessors: [
        { offset: 0, count: 3, type: "u32" },    // 0 keypoints.levelStart (L+1)
        { offset: 16, count: 3, type: "f32" },   // 1 x
        { offset: 32, count: 3, type: "f32" },   // 2 y
        { offset: 48, count: 3, type: "f32" },   // 3 angle
        { offset: 64, count: 3, type: "f32" },   // 4 score
        { offset: 80, count: 3, type: "u8" },    // 5 level
        { offset: 88, count: 3, type: "u32" },   // 6 set.levelStart
        { offset: 104, count: 3, type: "u32" },  // 7 set.kpIndex
        { offset: 120, count: 12, type: "u8" },  // 8 set.data (3 x 4 bytes)
        { offset: 136, count: 1, type: "f32" },  // 9 patches.score
        { offset: 144, count: 1, type: "u16" },  // 10 patches.left
        { offset: 152, count: 1, type: "u16" },  // 11 patches.top
        { offset: 160, count: 1, type: "u8" },   // 12 patches.level
        { offset: 168, count: 4, type: "u8" },   // 13 patches.pixels (1 x 2 x 2)
    ],
});

const BIN_LENGTH = 172;

const validate = (
    mutate: (m: ReturnType<typeof good>) => void = () => {},
    binLength: number | null = BIN_LENGTH,
    limits = DEFAULT_LIMITS,
) => {
    const m = good();
    mutate(m);
    const head = run(JSON.stringify(m));
    if (!head.ok) throw new Error(`the fixture itself failed step 5: ${head.error} ${head.detail}`);
    return validateManifest(head.value, binLength, limits);
};
const vErr = (r: ReturnType<typeof validate>) => (r.ok ? null : r.error);

describe("validateManifest — the known-good manifest", () => {
    it("accepts it with no warnings", () => {
        const r = validate();
        expect(r.ok).toBe(true);
        expect(r.ok && r.warnings).toEqual([]);
    });

    it("accepts an absent patches section", () => {
        expect(validate((m) => { delete (m as Record<string, unknown>)["patches"]; }).ok).toBe(true);
    });

    it("accepts an absent params, treating it as {} (§7.3)", () => {
        const r = validate((m) => { delete (m.keypoints.detector as Record<string, unknown>)["params"]; });
        expect(r.ok && r.value.keypoints.detector.params).toEqual({});
    });
});

describe("validateManifest — required keys and types (BAD_MANIFEST)", () => {
    for (const key of ["meta", "pyramid", "keypoints", "descriptorSets", "accessors"]) {
        it(`rejects a missing ${key}`, () => {
            expect(vErr(validate((m) => { delete (m as Record<string, unknown>)[key]; }))).toBe("BAD_MANIFEST");
        });
    }

    it("rejects an empty descriptorSets (§5.1 requires at least one entry)", () => {
        expect(vErr(validate((m) => { m.descriptorSets = []; }))).toBe("BAD_MANIFEST");
    });
});

describe("validateManifest — accessor domains (§5.2)", () => {
    it("rejects a fractional offset", () => {
        expect(vErr(validate((m) => { m.accessors[0]!.offset = 0.5; }))).toBe("BAD_MANIFEST");
    });

    it("rejects a negative count", () => {
        expect(vErr(validate((m) => { m.accessors[0]!.count = -1; }))).toBe("BAD_MANIFEST");
    });

    it("rejects a count above 2^32 − 1", () => {
        expect(vErr(validate((m) => { m.accessors[0]!.count = 4294967296; }))).toBe("BAD_MANIFEST");
    });

    it("rejects an unknown accessor type", () => {
        expect(vErr(validate((m) => { (m.accessors[0] as { type: string }).type = "i32"; }))).toBe("BAD_MANIFEST");
    });

    it("rejects an accessor reference that is not an index in range", () => {
        expect(vErr(validate((m) => { m.keypoints.x = 99; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.keypoints.x = -1; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.keypoints.x = 1.5; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { (m.keypoints as { x: unknown }).x = "1"; }))).toBe("BAD_MANIFEST");
    });
});

describe("validateManifest — accessor layout (BAD_LAYOUT)", () => {
    it("rejects an offset that is not a multiple of the element size", () => {
        expect(vErr(validate((m) => { m.accessors[1]!.offset = 18; }))).toBe("BAD_LAYOUT");
    });

    it("rejects an accessor running past the BIN chunk", () => {
        expect(vErr(validate(() => {}, 100))).toBe("BAD_LAYOUT");
    });

    it("rejects overlapping accessors", () => {
        expect(vErr(validate((m) => { m.accessors[2]!.offset = 16; }))).toBe("BAD_LAYOUT");
    });

    it("rejects a field whose accessor has the wrong type", () => {
        expect(vErr(validate((m) => { (m.accessors[1] as { type: string }).type = "u32"; }))).toBe("BAD_LAYOUT");
    });

    it("rejects a field whose accessor has the wrong count", () => {
        expect(vErr(validate((m) => { m.accessors[1]!.count = 2; }))).toBe("BAD_LAYOUT");
    });

    it("rejects a manifest with accessors and no BIN chunk (§5.2, rev 2)", () => {
        expect(vErr(validate(() => {}, null))).toBe("BAD_LAYOUT");
    });

    it("rejects a count × size product that would exceed the chunk", () => {
        expect(vErr(validate((m) => {
            m.accessors[8]!.count = 4294967295;
        }))).toBe("BAD_LAYOUT");
    });
});

describe("validateManifest — pyramid and meta domains (§5.3, §5.4)", () => {
    it("rejects a level size of 0 or above 2^16 − 1", () => {
        expect(vErr(validate((m) => { m.pyramid.levelSizes[1] = [0, 2]; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.pyramid.levelSizes[1] = [65536, 2]; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.pyramid.levelSizes[1] = [1.5, 2]; }))).toBe("BAD_MANIFEST");
    });

    it("rejects a scaleStep of 1 or less, or a non-finite one", () => {
        for (const s of [1, 0.5, 0, -2]) {
            expect(vErr(validate((m) => { m.pyramid.scaleStep = s; })), String(s)).toBe("BAD_MANIFEST");
        }
    });

    it("rejects zero levels", () => {
        expect(vErr(validate((m) => { m.pyramid.levelSizes = []; }))).toBe("BAD_MANIFEST");
    });

    it("rejects a physicalSizeMm entry that is not > 0", () => {
        expect(vErr(validate((m) => { m.meta.physicalSizeMm = [0, 40]; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.meta.physicalSizeMm = [-1, 40]; }))).toBe("BAD_MANIFEST");
    });

    it("accepts a null physicalSizeMm", () => {
        expect(validate((m) => { (m.meta as { physicalSizeMm: unknown }).physicalSizeMm = null; }).ok).toBe(true);
    });
});

describe("validateManifest — descriptor sets (§5.6)", () => {
    it("rejects a bytesPerDescriptor inconsistent with bits", () => {
        expect(vErr(validate((m) => { m.descriptorSets[0]!.bytesPerDescriptor = 5; }))).toBe("INCONSISTENT_DATA");
    });

    it("rejects bits whose dimensions is not a multiple of 8", () => {
        expect(vErr(validate((m) => {
            m.descriptorSets[0]!.dimensions = 33;
            m.descriptorSets[0]!.bytesPerDescriptor = 4;
        }))).toBe("INCONSISTENT_DATA");
    });

    it("rejects two sets with the same (kind, norm, dimensions, producer)", () => {
        expect(vErr(validate((m) => {
            m.descriptorSets.push({ ...m.descriptorSets[0]! });
        }))).toBe("INCONSISTENT_DATA");
    });

    it("keeps a set with an unknown kind and warns", () => {
        const r = validate((m) => { m.descriptorSets[0]!.kind = "wombat"; });
        expect(r.ok).toBe(true);
        expect(r.ok && r.value.descriptorSets).toHaveLength(1);
        expect(r.ok && r.warnings.map((w) => w.code)).toEqual(["UNSUPPORTED_DESCRIPTOR_SET"]);
    });

    it("keeps a set with an unknown norm and warns (hamming2 is not in the contract)", () => {
        const r = validate((m) => { m.descriptorSets[0]!.norm = "hamming2"; });
        expect(r.ok && r.value.descriptorSets).toHaveLength(1);
        expect(r.ok && r.warnings.map((w) => w.code)).toEqual(["UNSUPPORTED_DESCRIPTOR_SET"]);
    });

    it("drops a set with an unknown elementType and warns (§5.6)", () => {
        const r = validate((m) => { m.descriptorSets[0]!.elementType = "f16"; });
        expect(r.ok).toBe(true);
        expect(r.ok && r.value.descriptorSets).toEqual([]);
        expect(r.ok && r.warnings.map((w) => w.code)).toEqual(["UNSUPPORTED_DESCRIPTOR_SET"]);
    });
});

describe("validateManifest — resource limits (§6.4)", () => {
    it("rejects more levels than the limit", () => {
        expect(vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxLevels: 1 }))).toBe("LIMIT_EXCEEDED");
    });

    it("rejects more keypoints than the limit", () => {
        expect(vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxKeypoints: 2 }))).toBe("LIMIT_EXCEEDED");
    });

    it("rejects more descriptor sets than the limit", () => {
        expect(vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxDescriptorSets: 0 }))).toBe("LIMIT_EXCEEDED");
    });

    it("rejects a patch size above the limit", () => {
        expect(vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxPatchSize: 1 }))).toBe("LIMIT_EXCEEDED");
    });
});
```

Add `validateManifest` to the `manifest.js` import at the top of the file.

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/manifest.test.ts
```

Expected: FAIL — `validateManifest` is not exported.

- [ ] **Step 3: Write the validation primitives**

Append to `src/target/format/manifest.ts`:

```ts
export type AccessorType = "u8" | "u16" | "u32" | "f32";

export const ELEMENT_SIZE: Readonly<Record<AccessorType, number>> = {
    u8: 1, u16: 2, u32: 4, f32: 4,
};

export interface Accessor {
    readonly offset: number;
    readonly count: number;
    readonly type: AccessorType;
}

const U32_MAX = 0xffffffff;

/**
 * A JSON number with no fractional part in `[0, 2^32 − 1]` — the domain §5.2
 * fixes for `offset` and `count`, checked **before** any arithmetic uses
 * them, so the products below always have `u32` operands and stay exact in a
 * `Number`. `Number.isInteger` rejects `NaN` and `Infinity` on its own.
 */
const isU32 = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= U32_MAX;

const isIntegerInRange = (v: unknown, lo: number, hi: number): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const isFiniteNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
```

- [ ] **Step 4: Write `validateManifest`**

Continue in the same file. Work through §6.1 step 6 and §5.2 to §5.8 in order; every `return` below names the code the specification assigns. Keep the order: accessors first, because everything else references them.

```ts
export type ValidateResult =
    | { readonly ok: true; readonly value: ManifestSpec; readonly warnings: readonly Warning[] }
    | ({ readonly ok: false } & Failure);

export function validateManifest(
    head: ManifestHead,
    binLength: number | null,
    limits: DecodeLimits,
): ValidateResult {
    const doc = head.doc;
    const warnings: Warning[] = [];
    const bad = (detail: string) => ({ ok: false as const, ...fail("BAD_MANIFEST", detail) });
    const layout = (detail: string) => ({ ok: false as const, ...fail("BAD_LAYOUT", detail) });
    const limit = (detail: string) => ({ ok: false as const, ...fail("LIMIT_EXCEEDED", detail) });
    const inconsistent = (detail: string) => ({ ok: false as const, ...fail("INCONSISTENT_DATA", detail) });

    // --- accessors (§5.2) -------------------------------------------------
    const rawAccessors = doc["accessors"];
    if (!Array.isArray(rawAccessors)) return bad("accessors must be an array");
    const accessors: Accessor[] = [];
    for (let i = 0; i < rawAccessors.length; i += 1) {
        const a = rawAccessors[i];
        if (!isObject(a)) return bad(`accessors[${i}] must be an object`);
        if (!isU32(a["offset"])) return bad(`accessors[${i}].offset must be an integer in [0, 2^32 − 1]`);
        if (!isU32(a["count"])) return bad(`accessors[${i}].count must be an integer in [0, 2^32 − 1]`);
        const type = a["type"];
        if (typeof type !== "string" || !(type in ELEMENT_SIZE)) {
            return bad(`accessors[${i}].type must be one of u8, u16, u32, f32`);
        }
        accessors.push({ offset: a["offset"], count: a["count"], type: type as AccessorType });
    }
    // §5.2 rev 2: accessors with no BIN chunk is BAD_LAYOUT, including when
    // every count is 0 — the bound below would not catch that case.
    if (accessors.length > 0 && binLength === null) {
        return layout("the manifest declares accessors but the file has no BIN chunk");
    }
    const binBytes = binLength ?? 0;
    for (let i = 0; i < accessors.length; i += 1) {
        const a = accessors[i]!;
        const size = ELEMENT_SIZE[a.type];
        if (a.offset % size !== 0) {
            return layout(`accessors[${i}].offset ${a.offset} is not a multiple of ${size}`);
        }
        // Both operands are u32, so the product is exact below 2^53 and the
        // comparison cannot be fooled by a wrap.
        const end = a.offset + a.count * size;
        if (end > binBytes) {
            return layout(`accessors[${i}] ends at ${end}, past the BIN chunk's ${binBytes} bytes`);
        }
    }
    // Overlap (§5.2). A zero-length accessor owns no bytes, so it takes part
    // in no overlap and two of them may share an offset.
    const occupied = accessors
        .map((a, i) => ({ i, start: a.offset, end: a.offset + a.count * ELEMENT_SIZE[a.type] }))
        .filter((r) => r.end > r.start)
        .sort((p, q) => p.start - q.start);
    for (let k = 1; k < occupied.length; k += 1) {
        if (occupied[k]!.start < occupied[k - 1]!.end) {
            return layout(`accessors[${occupied[k]!.i}] overlaps accessors[${occupied[k - 1]!.i}]`);
        }
    }

    /** Resolves an accessor reference and checks the type and count its field fixes. */
    const ref = (
        value: unknown,
        path: string,
        type: AccessorType,
        count: number,
    ): number | ValidateResult => {
        if (!isIntegerInRange(value, 0, accessors.length - 1)) {
            return bad(`${path} must be an integer accessor index in [0, ${accessors.length})`);
        }
        const a = accessors[value]!;
        if (a.type !== type) return layout(`${path} expects an accessor of type ${type}, got ${a.type}`);
        if (a.count !== count) return layout(`${path} expects ${count} elements, got ${a.count}`);
        return value;
    };
    const isResult = (v: number | ValidateResult): v is ValidateResult => typeof v !== "number";
```

> Everything from here is mechanical: one `if` per rule, in the order §6.1
> step 6 lists them. Write `pyramid` first, because `L` is what fixes the
> `levelStart` counts; then `meta`, `keypoints`, `descriptorSets`, `patches`,
> `referenceImage`, `info`. The rules and their codes:
>
> | Rule | Code |
> |---|---|
> | `pyramid.levelSizes` a non-empty array of `[w, h]` pairs, each an integer in `[1, 2^16 − 1]` | `BAD_MANIFEST` |
> | `pyramid.scaleStep` finite and `> 1` | `BAD_MANIFEST` |
> | `levelSizes.length ≤ limits.maxLevels` | `LIMIT_EXCEEDED` |
> | `meta.widthPx`, `meta.heightPx` integers in `[1, 2^16 − 1]` | `BAD_MANIFEST` |
> | `meta.physicalSizeMm` `null`, or a 2-tuple of finite numbers `> 0` | `BAD_MANIFEST` |
> | `keypoints.count` a `u32`; `≤ limits.maxKeypoints` | `BAD_MANIFEST`; `LIMIT_EXCEEDED` |
> | `keypoints.detector.kind` a string; `params` absent or an object | `BAD_MANIFEST` |
> | `keypoints.levelStart` → `u32`, `L + 1`; `x`,`y`,`angle`,`score` → `f32`, `N`; `level` → `u8`, `N`; `size` absent or `f32`, `N` | via `ref` |
> | `descriptorSets` a non-empty array; `length ≤ limits.maxDescriptorSets` | `BAD_MANIFEST`; `LIMIT_EXCEEDED` |
> | per set: `kind`, `norm`, `elementType`, `producer` strings; `dimensions`, `bytesPerDescriptor`, `count` `u32` | `BAD_MANIFEST` |
> | per set: unknown `elementType` → **drop the set**, push `UNSUPPORTED_DESCRIPTOR_SET`, and validate nothing else about it | warning |
> | per set: unknown `kind` or `norm` → keep, push `UNSUPPORTED_DESCRIPTOR_SET` | warning |
> | per set: `bytesPerDescriptor` equal to `dimensions / 8` with `dimensions % 8 === 0` for `bits`, `dimensions` for `u8`, `4 × dimensions` for `f32` | `INCONSISTENT_DATA` |
> | per set: `levelStart` → `u32`, `L + 1`; `kpIndex` → `u32`, `M`; `data` → `u8` of `M × bytesPerDescriptor` for `bits`/`u8`, `f32` of `M × dimensions` for `f32` | via `ref` |
> | sets unique on `(kind, norm, dimensions, producer)` — over the sets **kept** | `INCONSISTENT_DATA` |
> | `patches` absent, or `patchSize` an integer in `[1, limits.maxPatchSize]` (above it `LIMIT_EXCEEDED`) and `count` a `u32` | `BAD_MANIFEST` / `LIMIT_EXCEEDED` |
> | `patches`: `score` → `f32`, `Q`; `left`,`top` → `u16`, `Q`; `level` → `u8`, `Q`; `pixels` → `u8`, `Q × P × P` | via `ref` |
> | `referenceImage` absent, or `level` a `u32`, `width`/`height` integers in `[1, 2^16 − 1]`, `pixels` → `u8` of `width × height` | `BAD_MANIFEST` / via `ref` |
> | `info` absent or an object | `BAD_MANIFEST` |
>
> `Q × P × P` and `width × height` are products of checked integers bounded by
> `2^16 − 1` and `2^32 − 1`, so they stay exact in a `Number`; compute them
> before calling `ref`, never after.
>
> Every unknown key, at every level, is simply not read — §5.1 requires
> readers to ignore them and §7.3 not to re-emit them, and not reading them is
> both.

- [ ] **Step 5: Run the tests and make sure they pass**

```bash
npx vitest run test/target/format/manifest.test.ts
```

Expected: PASS. Two traps to watch: the `type in ELEMENT_SIZE` guard must not accept inherited keys (`"toString"` is not a problem because `ELEMENT_SIZE` is a plain object literal, but prefer `Object.hasOwn(ELEMENT_SIZE, type)` if in doubt), and dropping a set must happen **before** its accessors are checked, or an unknown `elementType` produces `BAD_LAYOUT` instead of a warning.

- [ ] **Step 6: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/manifest.ts packages/nft-tracker/test/target/format/manifest.test.ts
git commit -m "feat(nft-tracker): validate the .wnft manifest schema and accessors

Step 6 of 6.1: every required key with its type, the accessor domains of
5.2 with checked arithmetic and an overlap test, the pyramid and meta
domains of 5.3 and 5.4, the descriptor-set rules of 5.6 - a set with an
unknown elementType dropped, one with an unknown kind or norm kept and
warned about - and every count against the limits of 6.4. Nothing is
materialised here: the result still carries accessor indices.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Accessor arrays — views where alignment permits, copies where it does not

**Files:**
- Create: `packages/nft-tracker/src/target/format/arrays.ts`
- Test: `packages/nft-tracker/test/target/format/arrays.test.ts`

**Interfaces:**
- Consumes: `Accessor`, `AccessorType`, `ELEMENT_SIZE` (Task 8).
- Produces:
  - `type AccessorArray = Uint8Array | Uint16Array | Uint32Array | Float32Array`
  - `function materialise(buffer: ArrayBuffer, binStart: number, accessor: Accessor): AccessorArray` — `binStart` is the **absolute** offset of the `BIN` chunk's data inside `buffer`.
  - `function isViewOf(array: AccessorArray, buffer: ArrayBuffer): boolean` — a test helper exported so the suite can tell a view from a copy without reaching into internals.

- [ ] **Step 1: Write the failing test**

`test/target/format/arrays.test.ts` (LGPL header first):

```ts
import { describe, it, expect } from "vitest";
import { isViewOf, materialise } from "../../../src/target/format/arrays.js";

/** A buffer whose BIN data starts at `base`, holding `bytes` from there. */
const at = (base: number, bytes: number[]): { buffer: ArrayBuffer; base: number } => {
    const buffer = new ArrayBuffer(base + bytes.length);
    new Uint8Array(buffer).set(bytes, base);
    return { buffer, base };
};

describe("materialise", () => {
    it("views a u8 array without copying", () => {
        const { buffer, base } = at(0, [1, 2, 3]);
        const a = materialise(buffer, base, { offset: 0, count: 3, type: "u8" });
        expect([...a]).toEqual([1, 2, 3]);
        expect(isViewOf(a, buffer)).toBe(true);
    });

    it("views a u32 array from an 8-aligned base", () => {
        const { buffer, base } = at(8, [1, 0, 0, 0, 2, 0, 0, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u32" });
        expect([...a]).toEqual([1, 2]);
        expect(isViewOf(a, buffer)).toBe(true);
    });

    it("copies a u32 array when the base is not a multiple of 4 (§3)", () => {
        const { buffer, base } = at(2, [1, 0, 0, 0, 2, 0, 0, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u32" });
        expect([...a]).toEqual([1, 2]);
        expect(isViewOf(a, buffer)).toBe(false);
    });

    it("copies a u16 array when the base is odd", () => {
        const { buffer, base } = at(1, [5, 0, 6, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u16" });
        expect([...a]).toEqual([5, 6]);
        expect(isViewOf(a, buffer)).toBe(false);
    });

    it("produces the same values through a view and through a copy", () => {
        const payload = [0, 0, 128, 63, 0, 0, 0, 64]; // 1.0, 2.0 as little-endian f32
        const viewed = materialise(at(8, payload).buffer, 8, { offset: 0, count: 2, type: "f32" });
        const copied = materialise(at(3, payload).buffer, 3, { offset: 0, count: 2, type: "f32" });
        expect([...viewed]).toEqual([1, 2]);
        expect([...copied]).toEqual([1, 2]);
    });

    it("honours the accessor's own offset inside the BIN chunk", () => {
        const { buffer, base } = at(8, [9, 9, 9, 9, 7, 0, 0, 0]);
        const a = materialise(buffer, base, { offset: 4, count: 1, type: "u32" });
        expect([...a]).toEqual([7]);
    });

    it("produces an empty array for a zero-count accessor", () => {
        const { buffer, base } = at(8, []);
        expect(materialise(buffer, base, { offset: 0, count: 0, type: "f32" }).length).toBe(0);
    });

    it("never lets a copy alias the source buffer", () => {
        const { buffer, base } = at(1, [5, 0, 6, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u16" });
        a[0] = 99;
        expect(new Uint8Array(buffer)[1]).toBe(5);
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/arrays.test.ts
```

Expected: FAIL — `arrays.js` not found.

- [ ] **Step 3: Write the implementation**

`src/target/format/arrays.ts` (LGPL header first), then:

```ts
import { ELEMENT_SIZE, type Accessor, type AccessorType } from "./manifest.js";

export type AccessorArray = Uint8Array | Uint16Array | Uint32Array | Float32Array;

type ArrayConstructorFor = {
    new (buffer: ArrayBuffer, byteOffset: number, length: number): AccessorArray;
};

const CONSTRUCTOR: Readonly<Record<AccessorType, ArrayConstructorFor>> = {
    u8: Uint8Array,
    u16: Uint16Array,
    u32: Uint32Array,
    f32: Float32Array,
};

/**
 * The array an accessor describes: a **view** into `buffer` when the absolute
 * byte offset divides by the element size, a **copy** when it does not (§3).
 *
 * The copy path is not hypothetical. A `.wnft` embedded in a larger buffer,
 * or handed over as a `Uint8Array` whose `byteOffset` is odd, puts the `BIN`
 * chunk at an address JavaScript refuses to view as `Uint32Array` — typed
 * arrays require the byte offset to be a multiple of the element size, and
 * §3 forbids reading misaligned data through a view. Inside a file the
 * question never arises: chunk data is 8-aligned and every accessor offset is
 * a multiple of its element size, so only the file's own base can misalign
 * anything.
 *
 * `binStart` is the absolute offset of the `BIN` chunk's data within
 * `buffer`, not within the caller's view of it.
 */
export function materialise(buffer: ArrayBuffer, binStart: number, accessor: Accessor): AccessorArray {
    const size = ELEMENT_SIZE[accessor.type];
    const Ctor = CONSTRUCTOR[accessor.type];
    const absolute = binStart + accessor.offset;
    if (absolute % size === 0) {
        return new Ctor(buffer, absolute, accessor.count);
    }
    // `slice` allocates a fresh buffer whose data starts at offset 0, which
    // is aligned for every element type by construction.
    const copy = new Uint8Array(buffer, absolute, accessor.count * size).slice();
    return new Ctor(copy.buffer, 0, accessor.count);
}

/** Whether `array` reads `buffer` directly rather than a copy of it. */
export function isViewOf(array: AccessorArray, buffer: ArrayBuffer): boolean {
    return array.buffer === buffer;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/arrays.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/arrays.ts packages/nft-tracker/test/target/format/arrays.test.ts
git commit -m "feat(nft-tracker): view or copy .wnft accessor arrays

3: a view when the absolute byte offset divides by the element size, a
copy when it does not, which is what happens when the file's own base is
not 8-aligned. A copy never aliases the source buffer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Data consistency — §6.1 step 7

Every cross-field rule, over arrays that already exist. This is the last gate before a `TargetDb` is built, and the only one that reads array *contents*.

**Files:**
- Create: `packages/nft-tracker/src/target/format/consistency.ts`
- Test: `packages/nft-tracker/test/target/format/consistency.test.ts`

**Interfaces:**
- Consumes: `ManifestSpec` (Task 8), `Failure`/`fail`, `AccessorArray` (Task 9).
- Produces:
  - `interface TargetArrays` — the materialised arrays, grouped as the `TargetDb` groups them: `keypoints` (`levelStart`, `x`, `y`, `angle`, `score`, `size?`, `level`), `sets` (one entry per kept descriptor set: `levelStart`, `kpIndex`, `data`), `patches?`, `referenceImage?`.
  - `function checkConsistency(spec: ManifestSpec, arrays: TargetArrays): Failure | null` — `null` means every rule holds. Every failure is `INCONSISTENT_DATA`.

- [ ] **Step 1: Write the failing test**

`test/target/format/consistency.test.ts` (LGPL header first). Build a small valid pair and break one thing per case:

```ts
import { describe, it, expect } from "vitest";
import { checkConsistency } from "../../../src/target/format/consistency.js";

// L = 2, N = 3 (two keypoints on level 0, one on level 1), M = 3, Q = 1, P = 2.
const spec = () => ({
    meta: { widthPx: 8, heightPx: 4, physicalSizeMm: null },
    pyramid: { scaleStep: 2, levelSizes: [[8, 4], [4, 2]] as [number, number][] },
    keypoints: { count: 3 },
    descriptorSets: [{ count: 3, bytesPerDescriptor: 4, elementType: "bits" as const }],
    patches: { patchSize: 2, count: 1 },
    referenceImage: undefined,
    head: { extensionsRequired: [] as readonly string[] },
});

const arrays = () => ({
    keypoints: {
        levelStart: new Uint32Array([0, 2, 3]),
        x: new Float32Array([1, 2, 3]),
        y: new Float32Array([1, 2, 3]),
        angle: new Float32Array([0, 0, 0]),
        score: new Float32Array([1, 1, 1]),
        size: undefined,
        level: new Uint8Array([0, 0, 1]),
    },
    sets: [{
        levelStart: new Uint32Array([0, 2, 3]),
        kpIndex: new Uint32Array([0, 1, 2]),
        data: new Uint8Array(12),
    }],
    patches: {
        score: new Float32Array([1]),
        left: new Uint16Array([0]),
        top: new Uint16Array([0]),
        level: new Uint8Array([0]),
        pixels: new Uint8Array(4),
    },
    referenceImage: undefined,
});

// The test file declares its own minimal structural types for these two
// literals rather than importing ManifestSpec wholesale: the checker only
// reads the fields above, and saying so here keeps the fixture readable.
type Spec = Parameters<typeof checkConsistency>[0];
type Arrays = Parameters<typeof checkConsistency>[1];

const check = (
    mutateSpec: (s: ReturnType<typeof spec>) => void = () => {},
    mutateArrays: (a: ReturnType<typeof arrays>) => void = () => {},
): string | null => {
    const s = spec();
    const a = arrays();
    mutateSpec(s);
    mutateArrays(a);
    return checkConsistency(s as unknown as Spec, a as unknown as Arrays)?.error ?? null;
};

describe("checkConsistency — the valid pair", () => {
    it("accepts it", () => {
        expect(check()).toBeNull();
    });
});

describe("checkConsistency — keypoint level ranges (§5.5)", () => {
    it("rejects levelStart[0] ≠ 0 (§5.5, rev 2)", () => {
        expect(check(() => {}, (a) => { a.keypoints.levelStart = new Uint32Array([1, 2, 3]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a levelStart that decreases", () => {
        expect(check(() => {}, (a) => { a.keypoints.levelStart = new Uint32Array([0, 3, 2]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects levelStart[L] ≠ N", () => {
        expect(check(() => {}, (a) => { a.keypoints.levelStart = new Uint32Array([0, 2, 2]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a level that disagrees with levelStart", () => {
        expect(check(() => {}, (a) => { a.keypoints.level = new Uint8Array([0, 1, 1]); })).toBe("INCONSISTENT_DATA");
    });
});

describe("checkConsistency — pyramid and meta (§5.3, §5.4)", () => {
    it("rejects meta that disagrees with levelSizes[0]", () => {
        expect(check((s) => { s.meta.widthPx = 9; })).toBe("INCONSISTENT_DATA");
        expect(check((s) => { s.meta.heightPx = 5; })).toBe("INCONSISTENT_DATA");
    });

    it("rejects levelSizes growing between two levels", () => {
        expect(check((s) => { s.pyramid.levelSizes = [[8, 4], [9, 2]]; })).toBe("INCONSISTENT_DATA");
        expect(check((s) => { s.pyramid.levelSizes = [[8, 4], [4, 5]]; })).toBe("INCONSISTENT_DATA");
    });

    it("accepts two levels of the same size", () => {
        expect(check((s) => { s.pyramid.levelSizes = [[8, 4], [8, 4]]; })).toBeNull();
    });
});

describe("checkConsistency — descriptor sets (§5.6)", () => {
    it("rejects levelStart[0] ≠ 0", () => {
        expect(check(() => {}, (a) => { a.sets[0]!.levelStart = new Uint32Array([1, 2, 3]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects levelStart[L] ≠ M", () => {
        expect(check(() => {}, (a) => { a.sets[0]!.levelStart = new Uint32Array([0, 2, 2]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a kpIndex past the keypoint count", () => {
        expect(check(() => {}, (a) => { a.sets[0]!.kpIndex = new Uint32Array([0, 1, 3]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a kpIndex referencing a keypoint of another level", () => {
        // Row 0 is in level 0's range but points at keypoint 2, which is level 1.
        expect(check(() => {}, (a) => { a.sets[0]!.kpIndex = new Uint32Array([2, 1, 0]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects M ≠ N without WKNF_multiview (§5.6)", () => {
        expect(check(
            (s) => { s.descriptorSets[0]!.count = 2; },
            (a) => {
                a.sets[0]!.levelStart = new Uint32Array([0, 2, 2]);
                a.sets[0]!.kpIndex = new Uint32Array([0, 1]);
                a.sets[0]!.data = new Uint8Array(8);
            },
        )).toBe("INCONSISTENT_DATA");
    });

    it("rejects a repeated kpIndex without WKNF_multiview", () => {
        expect(check(() => {}, (a) => { a.sets[0]!.kpIndex = new Uint32Array([0, 0, 2]); })).toBe("INCONSISTENT_DATA");
    });
});

describe("checkConsistency — patches (§5.7)", () => {
    it("rejects a patch on a level that does not exist", () => {
        expect(check(() => {}, (a) => { a.patches!.level = new Uint8Array([2]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a patch crossing the right edge of its level", () => {
        expect(check(() => {}, (a) => { a.patches!.left = new Uint16Array([7]); })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a patch crossing the bottom edge of its level", () => {
        expect(check(() => {}, (a) => { a.patches!.top = new Uint16Array([3]); })).toBe("INCONSISTENT_DATA");
    });

    it("accepts a patch flush against the right and bottom edges", () => {
        expect(check(() => {}, (a) => {
            a.patches!.left = new Uint16Array([6]);
            a.patches!.top = new Uint16Array([2]);
        })).toBeNull();
    });

    it("checks the level before indexing levelSizes with it", () => {
        expect(() => check(() => {}, (a) => { a.patches!.level = new Uint8Array([200]); })).not.toThrow();
    });
});

describe("checkConsistency — referenceImage (§5.8)", () => {
    it("rejects a level that does not exist, without indexing levelSizes", () => {
        expect(check((s) => {
            s.referenceImage = { level: 5, width: 8, height: 4 } as never;
        })).toBe("INCONSISTENT_DATA");
    });

    it("rejects a size that disagrees with its level", () => {
        expect(check((s) => {
            s.referenceImage = { level: 1, width: 8, height: 4 } as never;
        })).toBe("INCONSISTENT_DATA");
    });

    it("accepts a reference image matching its level", () => {
        expect(check((s) => {
            s.referenceImage = { level: 1, width: 4, height: 2 } as never;
        })).toBeNull();
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/consistency.test.ts
```

Expected: FAIL — `consistency.js` not found.

- [ ] **Step 3: Write the implementation**

`src/target/format/consistency.ts` (LGPL header first), then the checks in the order §6.1 step 7 lists them. Each returns `fail("INCONSISTENT_DATA", …)`; the helper below is the one non-obvious piece, because the same closed-range rule applies to keypoints and to every set:

```ts
/**
 * A `levelStart` array is **closed** when it starts at 0, never decreases and
 * ends at the element count (§5.5 rev 2, §5.6). Its length is `L + 1`, which
 * the schema has already checked, so this only reads contents.
 */
function checkClosedRange(
    levelStart: Uint32Array,
    total: number,
    what: string,
): Failure | null {
    if (levelStart[0] !== 0) {
        return fail("INCONSISTENT_DATA", `${what}.levelStart[0] is ${levelStart[0]}, must be 0`);
    }
    for (let l = 1; l < levelStart.length; l += 1) {
        if (levelStart[l]! < levelStart[l - 1]!) {
            return fail("INCONSISTENT_DATA", `${what}.levelStart decreases at ${l}`);
        }
    }
    const last = levelStart[levelStart.length - 1]!;
    if (last !== total) {
        return fail("INCONSISTENT_DATA", `${what}.levelStart ends at ${last}, must be ${total}`);
    }
    return null;
}
```

The remaining rules, in order, each `INCONSISTENT_DATA`:

1. `checkClosedRange(keypoints.levelStart, N, "keypoints")`.
2. For each level `l` and each index `i` in `[levelStart[l], levelStart[l+1])`: `keypoints.level[i] === l`.
3. `meta.widthPx === levelSizes[0][0]` and `meta.heightPx === levelSizes[0][1]`.
4. For each `l`: `levelSizes[l+1][0] <= levelSizes[l][0]` and `levelSizes[l+1][1] <= levelSizes[l][1]` (§5.4).
5. For each kept set `s`: `checkClosedRange(s.levelStart, M, "descriptorSets[i]")`; then for each level `l` and each row `r` in `[s.levelStart[l], s.levelStart[l+1])`: `s.kpIndex[r] < N` **first**, then `keypoints.level[s.kpIndex[r]] === l`.
6. Multi-view (§5.6): unless `head.extensionsRequired` contains `"WKNF_multiview"` — which it cannot, since a required extension this build does not implement was already `UNSUPPORTED_EXTENSION` at step 5 — require `M === N` and `kpIndex[r] === r` for every row. Write the guard against `extensionsRequired` anyway rather than hard-coding the rejection: it is the specification's condition, and it becomes live the day the extension is implemented.
7. For each patch `q`: `level[q] < L` **before** `levelSizes[level[q]]` is indexed; then `left[q] + P <= levelSizes[level[q]][0]` and `top[q] + P <= levelSizes[level[q]][1]` (§5.7).
8. If `referenceImage` is present: `level < L` **before** indexing, then `width === levelSizes[level][0]` and `height === levelSizes[level][1]` (§5.8).

Rules 2 and 5 are the two loops that touch every element; write them as plain indexed `for` loops over the typed arrays, never `Array.from`, so a million keypoints cost no allocation.

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/consistency.test.ts
```

Expected: PASS. The "checks the level before indexing" case fails loudly if rule 7 is written in the wrong order — that ordering is normative in §5.7 and §5.8, not a style preference.

- [ ] **Step 5: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/consistency.ts packages/nft-tracker/test/target/format/consistency.test.ts
git commit -m "feat(nft-tracker): check .wnft data consistency

Step 7 of 6.1: closed level ranges for keypoints and every set, levels
agreeing with them, meta equal to levelSizes[0], levelSizes
non-increasing, every kpIndex in range and on its own level, the
multi-view rule of 5.6, and patch and reference-image bounds - each
checked, as 5.7 and 5.8 require, before the level is used as an index.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: `decode` — the public reader

Wires Tasks 4 to 10 together in exactly the order of §6.1 and builds the `TargetDb`.

**Files:**
- Create: `packages/nft-tracker/src/target/format/decode.ts`
- Test: `packages/nft-tracker/test/target/format/decode.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `function decode(input: ArrayBuffer | ArrayBufferView, options?: DecodeOptions): DecodeResult`. This is the signature the rest of the package and the tracker use.

- [ ] **Step 1: Write the failing test**

`test/target/format/decode.test.ts` (LGPL header first). Fixture-driven coverage arrives in Task 16; this file pins the *orchestration* — the order of the gates, and the shape of what comes back:

```ts
import { describe, it, expect } from "vitest";
import { decode } from "../../../src/target/format/decode.js";
import { buildRaw, jsonChunk } from "./raw.js";

/**
 * A minimal but complete valid file, built by hand so this suite does not
 * depend on the encoder (Task 14) or the fixtures (Task 15). Keep it in step
 * with the manifest the Task 8 tests use.
 */
const validBytes = (): Uint8Array => {
    /* Build the BIN payload for: L = 1, N = 1, one orb set of 1 row of 4
       bytes, no patches. Accessors, in first-appearance order:
         0 keypoints.levelStart u32 x2 @ 0
         1 x f32 x1 @ 8      2 y f32 x1 @ 16     3 angle f32 x1 @ 24
         4 score f32 x1 @ 32 5 level u8 x1 @ 40
         6 set.levelStart u32 x2 @ 48            7 set.kpIndex u32 x1 @ 56
         8 set.data u8 x4 @ 64                                            */
    const bin = new Uint8Array(68);
    const dv = new DataView(bin.buffer);
    dv.setUint32(0, 0, true); dv.setUint32(4, 1, true);   // keypoints.levelStart
    dv.setFloat32(8, 3, true); dv.setFloat32(16, 4, true);
    dv.setFloat32(24, 0, true); dv.setFloat32(32, 1, true);
    bin[40] = 0;
    dv.setUint32(48, 0, true); dv.setUint32(52, 1, true); // set.levelStart
    dv.setUint32(56, 0, true);                            // set.kpIndex
    bin.set([1, 2, 3, 4], 64);

    const manifest = JSON.stringify({
        format: { version: "0.2" },
        meta: { widthPx: 8, heightPx: 4, physicalSizeMm: null },
        pyramid: { scaleStep: 2, levelSizes: [[8, 4]] },
        keypoints: {
            count: 1, detector: { kind: "fast", params: {} },
            levelStart: 0, x: 1, y: 2, angle: 3, score: 4, level: 5,
        },
        descriptorSets: [{
            kind: "orb", norm: "hamming", elementType: "bits", dimensions: 32,
            bytesPerDescriptor: 4, producer: "jsfeatnext", params: {},
            count: 1, levelStart: 6, kpIndex: 7, data: 8,
        }],
        accessors: [
            { offset: 0, count: 2, type: "u32" }, { offset: 8, count: 1, type: "f32" },
            { offset: 16, count: 1, type: "f32" }, { offset: 24, count: 1, type: "f32" },
            { offset: 32, count: 1, type: "f32" }, { offset: 40, count: 1, type: "u8" },
            { offset: 48, count: 2, type: "u32" }, { offset: 56, count: 1, type: "u32" },
            { offset: 64, count: 4, type: "u8" },
        ],
    });
    return buildRaw({ chunks: [jsonChunk(manifest), { type: "BIN\\0", data: bin }] });
};

describe("decode — a valid file", () => {
    it("returns the target and no warnings", () => {
        const r = decode(validBytes());
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.warnings).toEqual([]);
        expect(r.target.formatVersion).toBe("0.2");
        expect(r.target.meta).toEqual({ widthPx: 8, heightPx: 4, physicalSizeMm: null });
        expect(r.target.pyramid.levelSizes).toEqual([[8, 4]]);
        expect([...r.target.keypoints.x]).toEqual([3]);
        expect(r.target.descriptorSets).toHaveLength(1);
        expect([...r.target.descriptorSets[0]!.data]).toEqual([1, 2, 3, 4]);
        expect(r.target.patches).toBeUndefined();
        expect(r.target.extensionsUsed).toEqual([]);
    });

    it("accepts a bare ArrayBuffer as well as a view", () => {
        const bytes = validBytes();
        expect(decode(bytes).ok).toBe(true);
        expect(decode(bytes.buffer).ok).toBe(true);
    });

    it("decodes the same values from a non-8-aligned base (§3)", () => {
        const bytes = validBytes();
        const shifted = new Uint8Array(bytes.length + 3);
        shifted.set(bytes, 3);
        const a = decode(bytes);
        const b = decode(shifted.subarray(3));
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect([...b.target.keypoints.levelStart]).toEqual([...a.target.keypoints.levelStart]);
        expect([...b.target.keypoints.x]).toEqual([...a.target.keypoints.x]);
        expect([...b.target.descriptorSets[0]!.kpIndex]).toEqual([...a.target.descriptorSets[0]!.kpIndex]);
    });
});

describe("decode — the order of the gates (§6.1)", () => {
    it("checks the file size before the magic (step 0)", () => {
        const r = decode(buildRaw({ magic: "GLTF", chunks: [jsonChunk("{}")] }), { limits: { maxFileBytes: 8 } });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.error).toBe("LIMIT_EXCEEDED");
    });

    it("reports BAD_MAGIC when the size is fine", () => {
        const r = decode(buildRaw({ magic: "GLTF", chunks: [jsonChunk("{}")] }));
        expect(!r.ok && r.error).toBe("BAD_MAGIC");
    });

    it("checks the checksum before the manifest's content", () => {
        const r = decode(buildRaw({ chunks: [{ ...jsonChunk("not json at all"), crc: 0 }] }));
        expect(!r.ok && r.error).toBe("CHECKSUM_MISMATCH");
    });
});

describe("decode — warnings", () => {
    it("warns about an unknown chunk and still decodes", () => {
        const bytes = validBytes();
        // Rebuild with a trailing unknown chunk rather than patching bytes.
        const r = decode(bytes);
        expect(r.ok).toBe(true);
        // The fixture corpus (Task 15) carries the unknown-chunk case; this
        // assertion only guards that a clean file warns about nothing.
        expect(r.ok && r.warnings).toEqual([]);
    });
});

describe("decode — never throws", () => {
    it("returns a failure for every truncation of a valid file", () => {
        const whole = validBytes();
        for (let n = 0; n < whole.length; n += 1) {
            const r = decode(whole.subarray(0, n));
            expect(r.ok, `truncated at ${n}`).toBe(false);
        }
    });

    it("returns a failure for an empty buffer", () => {
        expect(decode(new ArrayBuffer(0)).ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/decode.test.ts
```

Expected: FAIL — `decode.js` not found.

- [ ] **Step 3: Write the implementation**

`src/target/format/decode.ts` (LGPL header first). The body is a straight run down §6.1; keep the comments naming the steps, because the order is normative and a later reader must be able to see it is preserved:

```ts
export function decode(input: ArrayBuffer | ArrayBufferView, options?: DecodeOptions): DecodeResult {
    const limits = resolveLimits(options);

    const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);

    // Step 0 — file size, before a single byte is read (§6.1 rev 2).
    if (bytes.byteLength > limits.maxFileBytes) {
        return { ok: false, error: "LIMIT_EXCEEDED", detail: `file is ${bytes.byteLength} bytes, limit ${limits.maxFileBytes}` };
    }

    // Steps 1 and 2 — framing and the two checksums.
    const container = parseContainer(bytes);
    if (!container.ok) return { ok: false, error: container.error, detail: container.detail };
    const { json, bin, unknown } = container.value;

    const warnings: Warning[] = unknown.map((c) => ({
        code: "UNKNOWN_CHUNK_SKIPPED" as const,
        detail: `chunk type "${c.type}"`,
    }));

    // Steps 3 to 5 — size, text, version, extensions.
    const head = decodeManifest(bytes.subarray(json.dataStart, json.dataStart + json.length), limits);
    if (!head.ok) return { ok: false, error: head.error, detail: head.detail };
    warnings.push(...head.warnings);

    // Step 6 — schema, accessors, limits.
    const spec = validateManifest(head.value, bin === null ? null : bin.length, limits);
    if (!spec.ok) return { ok: false, error: spec.error, detail: spec.detail };
    warnings.push(...spec.warnings);

    // Materialise. Every size involved has been checked, so this is the first
    // allocation proportional to the file's own numbers (§6.1 preamble).
    const binStart = bytes.byteOffset + (bin?.dataStart ?? 0);
    const arrays = materialiseAll(bytes.buffer, binStart, spec.value);

    // Step 7 — data consistency.
    const inconsistent = checkConsistency(spec.value, arrays);
    if (inconsistent !== null) {
        return { ok: false, error: inconsistent.error, detail: inconsistent.detail };
    }

    return { ok: true, target: buildTarget(spec.value, arrays), warnings };
}
```

`materialiseAll` calls `materialise` once per accessor reference in the `ManifestSpec`, in the same grouping `TargetArrays` declares. `buildTarget` assembles the `TargetDb` from `spec` and `arrays`: `formatVersion` from `SUPPORTED_FORMAT_VERSION`, `generator` from the head, the pruned `extensionsUsed`, `extensionsRequired`, `meta`, `pyramid`, `keypoints` (with `detector`), `descriptorSets` (narrowed on `elementType`, so a `"f32"` set carries the `Float32Array` and the other two a `Uint8Array`), and the optional `patches`, `referenceImage` and `info`. Omit an absent optional rather than setting it to `undefined`, so that `encode(decode(f))` cannot distinguish the two.

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/decode.test.ts
```

Expected: PASS. The truncation loop is the one that matters most here: any un-guarded read anywhere below `decode` shows up as a thrown exception rather than a failure.

- [ ] **Step 5: Run the whole suite**

```bash
npm test -w @webarkit/nft-tracker
```

Expected: every suite from Tasks 2 to 11 green.

- [ ] **Step 6: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/decode.ts packages/nft-tracker/test/target/format/decode.test.ts
git commit -m "feat(nft-tracker): add decode() for .wnft targets

Runs the gates of 6.1 in order - size, framing, checksums, manifest
size, text, version, extensions, schema, consistency - and only then
materialises arrays, so nothing allocates in proportion to a size that
has not been checked. Accepts a view as well as a bare ArrayBuffer, so
3's copy fallback is reachable. Returns a result, never throws.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Canonical JSON

§7.3 requires the same content to produce the same bytes. Two traps make that
harder than `JSON.stringify`, and both were confirmed experimentally before
this plan was written:

- `JSON.stringify({ 10: "a", 9: "b" })` yields `{"9":"b","10":"a"}`. JavaScript
  enumerates integer-like keys numerically and first, while §7.3 requires
  Unicode code-point order, which puts `"10"` before `"9"`.
- `["�", "\u{10000}"].sort()` puts the astral character first. The default
  comparator orders by UTF-16 **code unit**, and a high surrogate (`0xD800`)
  sorts below `0xFFFD`. Code-point order is the opposite.

So `params` and `info` are serialised explicitly, with a comparator that walks
code points.

**Files:**
- Create: `packages/nft-tracker/src/target/format/canonical-json.ts`
- Test: `packages/nft-tracker/test/target/format/canonical-json.test.ts`

**Interfaces:**
- Consumes: `JsonValue` from `../types.js`.
- Produces:
  - `function compareByCodePoint(a: string, b: string): number`
  - `function canonicalJson(value: JsonValue): string` — recursive, code-point-sorted object keys, no insignificant whitespace.
  - `function jsonString(s: string): string` — one quoted string, used by the manifest emitter too.
  - `function jsonNumber(n: number): string` — `JSON.stringify` of a finite number; **throws** on `NaN`/`Infinity`, which is a contract violation rather than a control-flow path, because the writer's own validation (Task 13) has already rejected them.

- [ ] **Step 1: Write the failing test**

`test/target/format/canonical-json.test.ts` (LGPL header first):

```ts
import { describe, it, expect } from "vitest";
import { canonicalJson, compareByCodePoint, jsonNumber } from "../../../src/target/format/canonical-json.js";

describe("compareByCodePoint", () => {
    it("orders ASCII by code point, not alphabetically", () => {
        expect(["b", "a", "C"].sort(compareByCodePoint).join("")).toBe("Cab");
    });

    it("puts a shorter string before its own extension", () => {
        expect(["ab", "a"].sort(compareByCodePoint)).toEqual(["a", "ab"]);
    });

    it("puts \"10\" before \"9\", unlike JavaScript's own key order (§7.3)", () => {
        expect(["9", "10"].sort(compareByCodePoint)).toEqual(["10", "9"]);
    });

    it("orders by code point, not by UTF-16 code unit", () => {
        const bmp = String.fromCharCode(0xfffd);
        const astral = String.fromCodePoint(0x10000);
        expect([bmp, astral].sort(compareByCodePoint)).toEqual([bmp, astral]);
        // The default comparator disagrees, which is the whole reason this exists.
        expect([bmp, astral].sort()).toEqual([astral, bmp]);
    });

    it("reports equality", () => {
        expect(compareByCodePoint("x", "x")).toBe(0);
    });
});

describe("canonicalJson", () => {
    it("emits no insignificant whitespace", () => {
        expect(canonicalJson({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
    });

    it("sorts object keys by code point, recursively", () => {
        expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
        expect(canonicalJson({ x: { "9": 1, "10": 2 } })).toBe('{"x":{"10":2,"9":1}}');
        expect(canonicalJson({ z: { b: { d: 1, c: 2 } }, a: 0 })).toBe('{"a":0,"z":{"b":{"c":2,"d":1}}}');
    });

    it("does not sort arrays", () => {
        expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    });

    it("emits the scalar forms", () => {
        expect(canonicalJson(null)).toBe("null");
        expect(canonicalJson(true)).toBe("true");
        expect(canonicalJson(false)).toBe("false");
        expect(canonicalJson("s")).toBe('"s"');
        expect(canonicalJson(0)).toBe("0");
        expect(canonicalJson(-1.5)).toBe("-1.5");
    });

    it("emits empty containers", () => {
        expect(canonicalJson({})).toBe("{}");
        expect(canonicalJson([])).toBe("[]");
    });

    it("round-trips through JSON.parse with the same values", () => {
        const v = { z: [1, { b: "x", a: null }], "10": true, "9": 1.25 };
        expect(JSON.parse(canonicalJson(v))).toEqual(v);
    });

    it("is byte-identical for two objects built in a different key order", () => {
        expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    });
});

describe("jsonNumber", () => {
    it("emits finite numbers", () => {
        expect(jsonNumber(1)).toBe("1");
        expect(jsonNumber(1.2599210498948732)).toBe("1.2599210498948732");
        expect(jsonNumber(-0)).toBe("0");
    });

    it("throws on NaN and Infinity rather than coercing them (§7.3)", () => {
        expect(() => jsonNumber(Number.NaN)).toThrow();
        expect(() => jsonNumber(Number.POSITIVE_INFINITY)).toThrow();
        expect(() => jsonNumber(Number.NEGATIVE_INFINITY)).toThrow();
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/canonical-json.test.ts
```

Expected: FAIL — `canonical-json.js` not found.

- [ ] **Step 3: Write the implementation**

`src/target/format/canonical-json.ts` (LGPL header first), then:

```ts
import type { JsonValue } from "../types.js";

/**
 * Unicode code-point order (§7.3).
 *
 * Not `a < b`: that compares UTF-16 code units, so an astral character, whose
 * first unit is a high surrogate in `0xD800..0xDBFF`, sorts below every BMP
 * character above `0xDBFF`. Iterating a string yields whole code points, which
 * is exactly the difference.
 */
export function compareByCodePoint(a: string, b: string): number {
    const ia = a[Symbol.iterator]();
    const ib = b[Symbol.iterator]();
    for (;;) {
        const x = ia.next();
        const y = ib.next();
        if (x.done === true) return y.done === true ? 0 : -1;
        if (y.done === true) return 1;
        const cx = x.value.codePointAt(0)!;
        const cy = y.value.codePointAt(0)!;
        if (cx !== cy) return cx - cy;
    }
}

/** One JSON string. `JSON.stringify` escapes deterministically. */
export function jsonString(s: string): string {
    return JSON.stringify(s);
}

/**
 * One JSON number.
 *
 * Throws on `NaN` and infinities instead of returning an error: §7.3 forbids
 * the writer from coercing them — `JSON.stringify` would emit `null` and the
 * file would decode cleanly with the value silently changed — and Task 13's
 * validation has already rejected any target carrying one. Reaching here with
 * a non-finite number is therefore a contract violation, which ADR-0001
 * point 7 reserves exceptions for.
 */
export function jsonNumber(n: number): string {
    if (!Number.isFinite(n)) {
        throw new TypeError(`canonical JSON cannot represent ${String(n)}; validate the target first`);
    }
    return JSON.stringify(n);
}

/**
 * Canonical serialisation of free-form content — `params` and `info` (§7.3).
 *
 * Their content is arbitrary, so it has no key order of its own; sorting is
 * what makes the round trip byte-identical. `JSON.stringify` cannot be used
 * for these two objects: it follows JavaScript's own enumeration order, which
 * puts integer-like keys first and numerically, so `{"10":a,"9":b}` would
 * serialise with `"9"` first.
 */
export function canonicalJson(value: JsonValue): string {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return jsonNumber(value);
    if (typeof value === "string") return jsonString(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const keys = Object.keys(value).sort(compareByCodePoint);
    const members = keys.map((k) => `${jsonString(k)}:${canonicalJson(value[k]!)}`);
    return `{${members.join(",")}}`;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/canonical-json.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/canonical-json.ts packages/nft-tracker/test/target/format/canonical-json.test.ts
git commit -m "feat(nft-tracker): add canonical JSON for .wnft params and info

7.3 orders the keys of params and info by Unicode code point. Neither
JSON.stringify nor the default array sort does that: the first follows
JavaScript's enumeration order, which puts integer-like keys first and
numerically, and the second compares UTF-16 code units, which sorts
astral characters below BMP ones. Both traps are pinned by a test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: The writer's validation — §7.3

> "The writer MUST NOT emit a file that a conforming reader would reject."

Everything §5 and §6 require of a file, checked against a `TargetDb` **before**
a byte is written, returning the offending field path. This task is the whole
content of §8.2 item 7, which is the test the user called out by name.

**Files:**
- Create: `packages/nft-tracker/src/target/format/validate-target.ts`
- Test: `packages/nft-tracker/test/target/format/validate-target.test.ts`

**Interfaces:**
- Consumes: `TargetDb`, `JsonValue`, `Params` (`../types.js`); `hasUnpairedSurrogate`, `hasNoncharacter`, `MAX_EXACT_INTEGER` (Task 6); `KNOWN_ELEMENT_TYPES`, `SUPPORTED_FORMAT_VERSION` (Task 3).
- Produces: `function validateTarget(target: TargetDb): { path: string } | null` — `null` when the target encodes to a file a conforming reader accepts; otherwise the path §7.3 puts in `detail`, e.g. `"descriptorSets[1].params.seed"`.

- [ ] **Step 1: Write the failing test**

`test/target/format/validate-target.test.ts` (LGPL header first). Build one good target and break one thing per case. §8.2 item 7 is the `params` block:

```ts
import { describe, it, expect } from "vitest";
import { validateTarget } from "../../../src/target/format/validate-target.js";
import type { JsonValue, TargetDb } from "../../../src/index.js";

/** L = 1, N = 1, one orb set of one row. The smallest legal target. */
const good = (): TargetDb => ({
    formatVersion: "0.2",
    extensionsUsed: [],
    extensionsRequired: [],
    meta: { widthPx: 8, heightPx: 4, physicalSizeMm: null },
    pyramid: { scaleStep: 2, levelSizes: [[8, 4]] },
    keypoints: {
        count: 1,
        detector: { kind: "fast", params: {} },
        levelStart: new Uint32Array([0, 1]),
        x: new Float32Array([3]), y: new Float32Array([4]),
        angle: new Float32Array([0]), score: new Float32Array([1]),
        level: new Uint8Array([0]),
    },
    descriptorSets: [{
        kind: "orb", norm: "hamming", elementType: "bits", dimensions: 32,
        bytesPerDescriptor: 4, producer: "jsfeatnext", params: {},
        count: 1,
        levelStart: new Uint32Array([0, 1]),
        kpIndex: new Uint32Array([0]),
        data: new Uint8Array([1, 2, 3, 4]),
    }],
});

/** The same target with one value planted inside the set's `params`. */
const withParam = (value: JsonValue): TargetDb => {
    const t = good();
    return {
        ...t,
        descriptorSets: [{ ...t.descriptorSets[0]!, params: { seed: value } }],
    } as TargetDb;
};

const pathOf = (t: TargetDb): string | null => validateTarget(t)?.path ?? null;

describe("validateTarget — the good target", () => {
    it("accepts it", () => {
        expect(validateTarget(good())).toBeNull();
    });
});

describe("validateTarget — §8.2 item 7: the writer rejects what the reader would", () => {
    it("rejects an unpaired surrogate in params (§5 check b)", () => {
        expect(pathOf(withParam(String.fromCharCode(0xd800)))).toBe("descriptorSets[0].params.seed");
    });

    it("rejects the integer 2^53 in params (§5 check c)", () => {
        expect(pathOf(withParam(9007199254740992))).toBe("descriptorSets[0].params.seed");
    });

    it("accepts 2^53 − 1, the boundary that must encode", () => {
        expect(validateTarget(withParam(9007199254740991))).toBeNull();
    });

    it("rejects a value that would serialise to infinity (§5 check d)", () => {
        expect(pathOf(withParam(Number.POSITIVE_INFINITY))).toBe("descriptorSets[0].params.seed");
        expect(pathOf(withParam(Number.NEGATIVE_INFINITY))).toBe("descriptorSets[0].params.seed");
    });

    it("rejects a Unicode noncharacter in params (§5 check e)", () => {
        expect(pathOf(withParam(String.fromCharCode(0xffff)))).toBe("descriptorSets[0].params.seed");
        expect(pathOf(withParam(String.fromCodePoint(0x10ffff)))).toBe("descriptorSets[0].params.seed");
    });

    it("rejects NaN, which JSON.stringify would coerce to null (§7.3)", () => {
        expect(pathOf(withParam(Number.NaN))).toBe("descriptorSets[0].params.seed");
    });

    it("checks params keys as well as values", () => {
        const t = good();
        const broken = {
            ...t,
            descriptorSets: [{ ...t.descriptorSets[0]!, params: { [String.fromCharCode(0xfdd0)]: 1 } }],
        } as TargetDb;
        expect(pathOf(broken)).toMatch(/^descriptorSets\[0\]\.params/);
    });

    it("checks nested params content and names the full path", () => {
        expect(pathOf(withParam({ inner: [1, 1e400] as unknown as JsonValue }))).toBe("descriptorSets[0].params.seed.inner[1]");
    });

    it("checks info the same way", () => {
        const t = { ...good(), info: { name: String.fromCharCode(0xfffe) } } as TargetDb;
        expect(pathOf(t)).toBe("info.name");
    });
});

describe("validateTarget — structural rules mirroring the reader", () => {
    it("rejects a format version this build does not read", () => {
        expect(pathOf({ ...good(), formatVersion: "0.3" })).toBe("formatVersion");
    });

    it("rejects an empty descriptorSets (§5.1)", () => {
        expect(pathOf({ ...good(), descriptorSets: [] })).toBe("descriptorSets");
    });

    it("rejects a scaleStep of 1 or less", () => {
        expect(pathOf({ ...good(), pyramid: { scaleStep: 1, levelSizes: [[8, 4]] } })).toBe("pyramid.scaleStep");
    });

    it("rejects a level size outside [1, 2^16 − 1]", () => {
        expect(pathOf({ ...good(), pyramid: { scaleStep: 2, levelSizes: [[0, 4]] } })).toMatch(/^pyramid\.levelSizes/);
        expect(pathOf({ ...good(), pyramid: { scaleStep: 2, levelSizes: [[65536, 4]] } })).toMatch(/^pyramid\.levelSizes/);
    });

    it("rejects meta that disagrees with levelSizes[0]", () => {
        expect(pathOf({ ...good(), meta: { widthPx: 9, heightPx: 4, physicalSizeMm: null } })).toMatch(/^meta\./);
    });

    it("rejects a physicalSizeMm entry that is not > 0", () => {
        expect(pathOf({ ...good(), meta: { widthPx: 8, heightPx: 4, physicalSizeMm: [0, 40] } })).toMatch(/^meta\.physicalSizeMm/);
    });

    it("rejects a bytesPerDescriptor inconsistent with elementType", () => {
        const t = good();
        expect(pathOf({ ...t, descriptorSets: [{ ...t.descriptorSets[0]!, bytesPerDescriptor: 5 }] }))
            .toBe("descriptorSets[0].bytesPerDescriptor");
    });

    it("rejects an array whose length disagrees with its count", () => {
        const t = good();
        expect(pathOf({
            ...t,
            keypoints: { ...t.keypoints, x: new Float32Array([1, 2]) },
        })).toBe("keypoints.x");
    });

    it("rejects a levelStart that is not closed", () => {
        const t = good();
        expect(pathOf({
            ...t,
            keypoints: { ...t.keypoints, levelStart: new Uint32Array([1, 1]) },
        })).toBe("keypoints.levelStart");
    });

    it("rejects M ≠ N without WKNF_multiview", () => {
        const t = good();
        expect(pathOf({
            ...t,
            descriptorSets: [{
                ...t.descriptorSets[0]!, count: 0,
                levelStart: new Uint32Array([0, 0]),
                kpIndex: new Uint32Array([]), data: new Uint8Array([]),
            }],
        })).toMatch(/^descriptorSets\[0\]/);
    });

    it("rejects two sets with the same (kind, norm, dimensions, producer)", () => {
        const t = good();
        expect(pathOf({ ...t, descriptorSets: [t.descriptorSets[0]!, t.descriptorSets[0]!] }))
            .toMatch(/^descriptorSets\[1\]/);
    });

    it("rejects a patch out of its level's bounds", () => {
        const t = good();
        expect(pathOf({
            ...t,
            patches: {
                patchSize: 2, count: 1,
                score: new Float32Array([1]),
                left: new Uint16Array([7]), top: new Uint16Array([0]),
                level: new Uint8Array([0]), pixels: new Uint8Array(4),
            },
        })).toMatch(/^patches/);
    });

    it("rejects an extension it does not implement", () => {
        expect(pathOf({ ...good(), extensionsUsed: ["WKNF_x"], extensionsRequired: ["WKNF_x"] }))
            .toMatch(/^extensions/);
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/validate-target.test.ts
```

Expected: FAIL — `validate-target.js` not found.

- [ ] **Step 3: Write the free-form content walker**

This is the §8.2 item 7 machinery. Everything else in the file is a
restatement of rules already written twice; this part is new:

```ts
/**
 * The four I-JSON checks that survive into memory, applied to `params` and
 * `info` (§7.3, §8.2 item 7).
 *
 * Check (a), key uniqueness, has no counterpart here: an in-memory object
 * cannot hold a duplicate member name, which is why §5 scopes that one to
 * construction.
 *
 * `NaN` is rejected for the reason §7.3 spells out: `JSON.stringify` turns it
 * into `null`, so a target carrying one would encode to a file that decodes
 * cleanly with the value silently changed — worse than a refused write.
 *
 * Returns the path of the first offending value, `null` if there is none.
 */
function checkFreeForm(value: JsonValue, path: string): string | null {
    if (typeof value === "number") {
        // (d), plus the NaN rule.
        if (!Number.isFinite(value)) return path;
        // (c): a value that will serialise as an integer literal must be one
        // every implementation reads back exactly.
        if (Number.isInteger(value) && Math.abs(value) > MAX_EXACT_INTEGER) return path;
        return null;
    }
    if (typeof value === "string") {
        // (b) and (e).
        return hasUnpairedSurrogate(value) || hasNoncharacter(value) ? path : null;
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            const bad = checkFreeForm(value[i]!, `${path}[${i}]`);
            if (bad !== null) return bad;
        }
        return null;
    }
    if (typeof value === "object" && value !== null) {
        for (const key of Object.keys(value)) {
            // Names are strings too, and (e) applies to them explicitly.
            if (hasUnpairedSurrogate(key) || hasNoncharacter(key)) return `${path}.${key}`;
            const bad = checkFreeForm(value[key]!, `${path}.${key}`);
            if (bad !== null) return bad;
        }
        return null;
    }
    return null; // boolean, null
}
```

Note `Number.isInteger(9007199254740992)` is `true` and its absolute value
exceeds `MAX_EXACT_INTEGER`, so check (c) fires — while `1e20`, also an
integer-valued double, would serialise as `100000000000000000000`, an integer
literal far outside the range, and is rejected too. That is correct and
deliberate: a reader would reject that literal.

- [ ] **Step 4: Write the structural rules**

Continue in the same file. `validateTarget` returns `{ path }` for the first
violation. The rules, each mirroring a reader rule already implemented, in
this order:

| Rule | Path reported |
|---|---|
| `formatVersion === SUPPORTED_FORMAT_VERSION` | `formatVersion` |
| every name in `extensionsRequired` is in `extensionsUsed`, and every name in either is one this build implements | `extensionsRequired` / `extensionsUsed` |
| `pyramid.levelSizes` non-empty; every entry an integer in `[1, 2^16 − 1]`; non-increasing | `pyramid.levelSizes[l][0\|1]` |
| `pyramid.scaleStep` finite and `> 1` | `pyramid.scaleStep` |
| `meta.widthPx`/`heightPx` equal to `levelSizes[0]` | `meta.widthPx` / `meta.heightPx` |
| `meta.physicalSizeMm` `null`, or two finite numbers `> 0` | `meta.physicalSizeMm[0\|1]` |
| `keypoints.count` an integer in `[0, 2^32 − 1]`; every keypoint array's `length` equal to `count` (`levelStart` to `L + 1`) | `keypoints.<field>` |
| `keypoints.levelStart` closed and non-decreasing; `level` agreeing with it | `keypoints.levelStart` / `keypoints.level` |
| `keypoints.detector.kind` a non-empty string; `params` free-form-checked | `keypoints.detector.kind` / `keypoints.detector.params…` |
| `descriptorSets` non-empty | `descriptorSets` |
| per set: `elementType` one of `KNOWN_ELEMENT_TYPES` | `descriptorSets[i].elementType` |
| per set: `dimensions` a positive integer; `bytesPerDescriptor` equal to `dimensions / 8` (with `dimensions % 8 === 0`), `dimensions`, or `4 × dimensions` per `elementType` | `descriptorSets[i].bytesPerDescriptor` |
| per set: `levelStart.length === L + 1`, closed at `count`; `kpIndex.length === count`; `data.length` equal to `count × bytesPerDescriptor` (or `count × dimensions` for `f32`) | `descriptorSets[i].<field>` |
| per set: every `kpIndex` below `N` and on the row's own level | `descriptorSets[i].kpIndex` |
| per set: `count === N` and `kpIndex[r] === r`, unless `WKNF_multiview` is required | `descriptorSets[i].count` / `.kpIndex` |
| sets unique on `(kind, norm, dimensions, producer)` | `descriptorSets[i]` |
| per set: `params` free-form-checked | `descriptorSets[i].params…` |
| `patches`, when present: `patchSize ≥ 1`; array lengths equal to `count` (`pixels` to `count × P × P`); every patch in its level's bounds | `patches.<field>` |
| `referenceImage`, when present: `level < L`; `width`/`height` equal to `levelSizes[level]`; `pixels.length === width × height` | `referenceImage.<field>` |
| `info`, when present: free-form-checked | `info…` |

Every one of these has a counterpart in `manifest.ts` or `consistency.ts`. Do
**not** try to share the code: the reader validates a parsed manifest with
accessor indices, the writer validates typed arrays already in memory, and the
two shapes are different enough that a shared abstraction would obscure both.
What must stay shared is the *rule list*, which is why the table above is
ordered like §5.

- [ ] **Step 5: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/validate-target.test.ts
```

Expected: PASS. Every case in the `§8.2 item 7` block must pass before this
task is done; that block is the acceptance criterion the user named.

- [ ] **Step 6: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/validate-target.ts packages/nft-tracker/test/target/format/validate-target.test.ts
git commit -m "feat(nft-tracker): validate a target before writing it

7.3: the writer must not emit a file a conforming reader would reject,
and must never coerce a value to make it serialisable. Mirrors every
domain and consistency rule of 5 and 6 over the in-memory target, and
applies the four I-JSON checks that survive into memory - plus NaN,
which JSON.stringify would turn into null - to the free-form content of
params and info. Reports the offending field path, which is 8.2 item 7.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: `encode` — the canonical writer

**Files:**
- Create: `packages/nft-tracker/src/target/format/encode.ts`
- Test: `packages/nft-tracker/test/target/format/encode.test.ts`

**Interfaces:**
- Consumes: `validateTarget` (Task 13), `canonicalJson`/`jsonString`/`jsonNumber` (Task 12), `buildContainer` (Task 5), `ELEMENT_SIZE` (Task 8), `decode` (Task 11, for the round-trip tests).
- Produces: `function encode(target: TargetDb): EncodeResult`.

- [ ] **Step 1: Write the failing test**

`test/target/format/encode.test.ts` (LGPL header first). Reuse the `good()`
builder from Task 13 by exporting it from a shared `test/target/format/targets.ts`
rather than copying it — move it there as the first change of this task:

```ts
import { describe, it, expect } from "vitest";
import { decode } from "../../../src/target/format/decode.js";
import { encode } from "../../../src/target/format/encode.js";
import { good, withParam } from "./targets.js";

const bytesOf = (r: ReturnType<typeof encode>): Uint8Array => {
    if (!r.ok) throw new Error(`expected ok, got ${r.error}: ${r.detail}`);
    return r.bytes;
};

describe("encode — refusal (§7.3)", () => {
    it("returns INVALID_TARGET and no bytes for a rejected target", () => {
        const r = encode(withParam(Number.NaN));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toBe("INVALID_TARGET");
        expect(r.detail).toContain("descriptorSets[0].params.seed");
        expect("bytes" in r).toBe(false);
    });

    it("refuses a target with no descriptor set (§5.6, rev 2)", () => {
        const r = encode({ ...good(), descriptorSets: [] });
        expect(!r.ok && r.error).toBe("INVALID_TARGET");
    });
});

describe("encode — the file it produces", () => {
    it("decodes back to the same target", () => {
        const t = good();
        const r = decode(bytesOf(encode(t)));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.warnings).toEqual([]);
        expect(r.target).toEqual(t);
    });

    it("is byte-identical for the same target", () => {
        expect(bytesOf(encode(good()))).toEqual(bytesOf(encode(good())));
    });

    it("puts the manifest keys in the specification's order (§7.3)", () => {
        const bytes = bytesOf(encode(good()));
        const text = new TextDecoder().decode(bytes.subarray(32)).replace(/ +$/, "");
        const manifest = text.slice(0, text.lastIndexOf("}") + 1);
        const order = [...manifest.matchAll(/"([a-zA-Z]+)":/g)].map((m) => m[1]);
        const top = ["format", "meta", "pyramid", "keypoints", "descriptorSets", "accessors"];
        let at = -1;
        for (const key of top) {
            const next = order.indexOf(key);
            expect(next, key).toBeGreaterThan(at);
            at = next;
        }
    });

    it("omits empty optional objects and arrays (§7.3)", () => {
        const text = new TextDecoder().decode(bytesOf(encode(good())));
        expect(text).not.toContain('"extensionsUsed"');
        expect(text).not.toContain('"extensionsRequired"');
        expect(text).not.toContain('"params"');
    });

    it("starts every accessor at a multiple of 8 (§7.3)", () => {
        const r = decode(bytesOf(encode(good())));
        expect(r.ok).toBe(true);
        // Read the offsets back out of the manifest text rather than trusting
        // the writer's own bookkeeping.
        const text = new TextDecoder().decode(bytesOf(encode(good())));
        for (const m of text.matchAll(/"offset":(\d+)/g)) {
            expect(Number(m[1]) % 8).toBe(0);
        }
    });

    it("sorts descriptorSets by kind, norm, dimensions, producer (§7.3)", () => {
        const t = good();
        const second = { ...t.descriptorSets[0]!, kind: "akaze" as const };
        const text = new TextDecoder().decode(bytesOf(encode({ ...t, descriptorSets: [t.descriptorSets[0]!, second] })));
        expect(text.indexOf('"akaze"')).toBeLessThan(text.indexOf('"orb"'));
    });

    it("sorts params keys by code point, not by JavaScript's key order", () => {
        const t = withParam(0);
        const withKeys = {
            ...t,
            descriptorSets: [{ ...t.descriptorSets[0]!, params: { "9": 1, "10": 2, b: 3, a: 4 } }],
        };
        const text = new TextDecoder().decode(bytesOf(encode(withKeys as never)));
        const params = text.slice(text.indexOf('"params":'));
        expect(params.indexOf('"10"')).toBeLessThan(params.indexOf('"9"'));
        expect(params.indexOf('"a"')).toBeLessThan(params.indexOf('"b"'));
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run test/target/format/encode.test.ts
```

Expected: FAIL — `encode.js` not found.

- [ ] **Step 3: Write the implementation**

`src/target/format/encode.ts` (LGPL header first). Four phases, in this order:

```ts
export function encode(target: TargetDb): EncodeResult {
    // 1. §7.3: validate before serialising, and emit nothing on failure.
    const invalid = validateTarget(target);
    if (invalid !== null) {
        return { ok: false, error: "INVALID_TARGET", detail: invalid.path };
    }
    // 2. Lay out the BIN chunk: accessors in the order their fields first
    //    appear in the manifest, each starting at a multiple of 8.
    const layout = layOutAccessors(target);
    // 3. Emit the manifest with the accessor indices that layout assigned.
    const manifest = emitManifest(target, layout.accessors);
    // 4. Frame.
    return { ok: true, bytes: buildContainer(new TextEncoder().encode(manifest), layout.bin) };
}
```

`layOutAccessors` walks the target in the §5.1 key order — `keypoints`
(`levelStart`, `x`, `y`, `angle`, `score`, `size` if present, `level`), then
each `descriptorSets` entry **after sorting** (`levelStart`, `kpIndex`,
`data`), then `patches` (`score`, `left`, `top`, `level`, `pixels`), then
`referenceImage.pixels` — assigning each array an offset rounded up to a
multiple of 8 and recording `{ offset, count, type }`. The `BIN` buffer's
length is the end of the **last** array, unpadded: `chunk_length` excludes
padding (§4.2), and `buildContainer` adds the padding itself.

`emitManifest` builds the text by hand, in the order the specification lists
the keys, because `JSON.stringify` cannot be trusted with order:

- `format`: `version`, then `generator` when present.
- `extensionsUsed`, `extensionsRequired`: sorted, **omitted when empty**.
- `meta`: `widthPx`, `heightPx`, `physicalSizeMm`.
- `pyramid`: `scaleStep`, `levelSizes`.
- `keypoints`: `count`, `detector` (`kind`, then `params` **omitted when empty**), `levelStart`, `x`, `y`, `angle`, `score`, `size` when present, `level`.
- `descriptorSets`, sorted by `kind`, `norm`, `dimensions`, `producer` with `compareByCodePoint` on the string fields: `kind`, `norm`, `elementType`, `dimensions`, `bytesPerDescriptor`, `producer`, `params` (omitted when empty), `count`, `levelStart`, `kpIndex`, `data`.
- `patches` when present: `patchSize`, `count`, `score`, `left`, `top`, `level`, `pixels`.
- `referenceImage` when present: `level`, `width`, `height`, `pixels`.
- `info` when present: through `canonicalJson`.
- `accessors`: each `offset`, `count`, `type`.

Use `jsonNumber` for every number and `jsonString` for every string, and
`canonicalJson` for `params` and `info` only. Numbers here are integers and
the two doubles `scaleStep` and `physicalSizeMm`; §7.3 and open question Q8
accept that two languages may format those differently, which is why
cross-implementation conformance compares manifests after parsing and requires
byte identity only for the `BIN` chunk (§8.2 item 4).

- [ ] **Step 4: Run the test and make sure it passes**

```bash
npx vitest run test/target/format/encode.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm test -w @webarkit/nft-tracker
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/src/target/format/encode.ts packages/nft-tracker/test/target/format/encode.test.ts packages/nft-tracker/test/target/format/targets.ts
git commit -m "feat(nft-tracker): add encode(), the canonical .wnft writer

7.3: validate first and emit nothing on failure, then lay the accessors
out in the order their fields appear, each at a multiple of 8, then emit
the manifest with the keys in the order the specification lists them,
descriptorSets sorted, empty optionals omitted, and params and info
serialised through the code-point-ordered writer. Byte-identical for the
same target.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: The fixture corpus and its generator

§8.1's fixtures are "produced by a committed, deterministic generator script
and never edited by hand". The `valid/` files go through `encode`, so they are
canonical by construction; every other category is framed directly with
`buildContainer`, because they are files the canonical writer refuses to
produce — that is what makes them useful.

**Files:**
- Create: `packages/nft-tracker/scripts/generate-fixtures.mjs`
- Create: `fixtures/nft-target/0.2/**` (generated, committed)
- Modify: `packages/nft-tracker/package.json` — add `"fixtures": "npm run build && node scripts/generate-fixtures.mjs"`
- Modify: `.gitattributes` — add `*.wnft binary`

**Interfaces:**
- Consumes: the built `dist/` — `encode`, `buildContainer`, `crc32`.
- Produces: `export function buildFixtures(): Map<string, Uint8Array>` keyed by path relative to `fixtures/nft-target/0.2/`, plus `main()` writing them. Task 16 imports `buildFixtures` to prove the committed corpus matches the generator.

- [ ] **Step 1: Make git treat `.wnft` as binary**

`.gitattributes` opens with `* text=auto eol=lf`. A `.wnft` file would be
classified by git's own heuristic, and a corpus whose files must be compared
byte for byte cannot rest on a heuristic. Add, under the existing "Binary
assets" block:

```gitattributes
# Conformance fixtures: compared byte for byte by the test suite, so line
# endings must never be touched. `* text=auto` above would otherwise leave
# this to git's content heuristic.
*.wnft binary
```

- [ ] **Step 2: Write the generator's skeleton and the valid corpus**

`packages/nft-tracker/scripts/generate-fixtures.mjs`. It is `.mjs` and imports
`../dist/`, so `npm run build` runs first — that is why the npm script chains
the two. Keep it dependency-free and deterministic: no clock, no RNG, no
environment.

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encode } from "../dist/target/format/encode.js";
import { buildContainer } from "../dist/target/format/container.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "..", "fixtures", "nft-target", "0.2");

/**
 * The base target every valid fixture varies: 64 x 48, two levels, 20
 * keypoints, one orb set, 4 patches of 8 x 8.
 *
 * Every value is computed from the index, never drawn at random: the corpus
 * has to reproduce byte for byte, and a seeded RNG would still tie the bytes
 * to one engine's generator.
 */
function baseTarget() {
    const L = 2;
    const N = 20;                       // 12 on level 0, 8 on level 1
    const levelStart = Uint32Array.from([0, 12, N]);
    const level = Uint8Array.from({ length: N }, (_, i) => (i < 12 ? 0 : 1));

    // Spread the keypoints over the level-0 image on a coarse lattice, so the
    // coordinates are exact in f32 and legible in minimal.json.
    const x = Float32Array.from({ length: N }, (_, i) => 4 + (i % 6) * 9);
    const y = Float32Array.from({ length: N }, (_, i) => 4 + Math.floor(i / 6) * 9);
    const angle = Float32Array.from({ length: N }, (_, i) => i * 0.25);
    const score = Float32Array.from({ length: N }, (_, i) => 100 - i);

    const bytesPerDescriptor = 32;      // 256-bit ORB
    const data = Uint8Array.from(
        { length: N * bytesPerDescriptor },
        (_, i) => (i * 37 + 11) & 0xff,
    );

    const P = 8;
    const Q = 4;
    return {
        formatVersion: "0.2",
        generator: "@webarkit/nft-tracker fixtures",
        extensionsUsed: [],
        extensionsRequired: [],
        meta: { widthPx: 64, heightPx: 48, physicalSizeMm: [128, 96] },
        pyramid: { scaleStep: 2, levelSizes: [[64, 48], [32, 24]] },
        keypoints: {
            count: N,
            detector: { kind: "fast", params: { threshold: 20 } },
            levelStart, x, y, angle, score, level,
        },
        descriptorSets: [{
            kind: "orb", norm: "hamming", elementType: "bits",
            dimensions: 256, bytesPerDescriptor, producer: "jsfeatnext",
            params: {},
            count: N,
            levelStart: levelStart.slice(),
            kpIndex: Uint32Array.from({ length: N }, (_, i) => i),
            data,
        }],
        patches: {
            patchSize: P,
            count: Q,
            score: Float32Array.from({ length: Q }, (_, q) => 50 - q),
            left: Uint16Array.from({ length: Q }, (_, q) => q * 8),
            top: Uint16Array.from({ length: Q }, (_, q) => q * 4),
            level: new Uint8Array(Q),        // all on level 0
            pixels: Uint8Array.from({ length: Q * P * P }, (_, i) => (i * 7) & 0xff),
        },
        info: { name: "fixture", compiler: { levels: 2, seed: 42 } },
    };
}
```

Check the patch bounds by hand once: with `P = 8` on level 0 (64 × 48), the
largest patch is `left = 24`, `top = 12`, so `24 + 8 ≤ 64` and `12 + 8 ≤ 48`.
`encode` would reject a mistake here (Task 13), but a generator that cannot
produce its own base target wastes a debugging session.

Build the `valid/` set by calling `encode` on variations of `baseTarget()`, and
throw if any `encode` returns `ok: false` — a generator that silently skips a
fixture is worse than one that fails:

| File | What it varies (§8.1) |
|---|---|
| `valid/minimal.wnft` | the base target: 64×48, 2 levels, ~20 keypoints, one `orb` set, `patches` |
| `valid/minimal.json` | its decoded values — manifest plus every array as a JSON list |
| `valid/several-sets.wnft` | three sets: `orb`, `teblid`, and a second `orb` from another `producer` |
| `valid/single-level.wnft` | `L = 1` |
| `valid/zero-keypoints.wnft` | `N = 0`, `M = 0`; every bulk accessor `count = 0` while `levelStart` keeps `L + 1` |
| `valid/no-patches.wnft` | `patches` absent (detection-only, milestone M1) |
| `valid/reference-image.wnft` | `referenceImage` present at level 0 |
| `valid/boundary-max-safe-integer.wnft` | `params: { "seed": 9007199254740991 }` — must decode; catches an off-by-one in check (c) |

`valid/minimal.json` is written with `JSON.stringify(value, null, 2)` over a
plain object holding the manifest's decoded fields with each typed array
turned into a plain array, so that §8.2 item 1 compares values rather than
bytes.

- [ ] **Step 3: Write the `invalid/` corpus**

These are framed by hand. A helper takes a manifest **string** and a `BIN`
buffer and returns bytes, so a fixture can carry text `JSON.stringify` could
never produce:

```js
const file = (manifestText, bin) =>
    buildContainer(new TextEncoder().encode(manifestText), bin);
```

Start from the manifest text `encode` produced for the base target, parse it
only when a structural change is needed, and otherwise patch the text. One
file per error code of §6.2:

| File | Expected | How |
|---|---|---|
| `invalid/bad-magic.wnft` | `BAD_MAGIC` | overwrite bytes 0..3 with `"GLTF"` |
| `invalid/unsupported-container.wnft` | `UNSUPPORTED_CONTAINER` | set `container_major` to 2 |
| `invalid/bad-container-total-length.wnft` | `BAD_CONTAINER` | set `total_length` to `length + 8` |
| `invalid/bad-container-no-json.wnft` | `BAD_CONTAINER` | reorder so `BIN` comes first |
| `invalid/bad-container-reserved.wnft` | `BAD_CONTAINER` | set the header's `flags` to 1 |
| `invalid/checksum-mismatch.wnft` | `CHECKSUM_MISMATCH` | flip one bit inside the `BIN` data |
| `invalid/manifest-too-large.wnft` | `MANIFEST_TOO_LARGE` | pad `info` with filler; decoded with `maxManifestBytes` lowered (see step 5) |
| `invalid/bad-manifest-not-json.wnft` | `BAD_MANIFEST` | manifest text `"not json"` |
| `invalid/bad-manifest-not-utf8.wnft` | `BAD_MANIFEST` | a `0xFF` byte inside the `JSON` chunk |
| `invalid/unsupported-format-version.wnft` | `UNSUPPORTED_FORMAT_VERSION` | `"version":"0.3"` |
| `invalid/unsupported-extension.wnft` | `UNSUPPORTED_EXTENSION` | `extensionsRequired:["WKNF_multiview"]` |
| `invalid/bad-layout-out-of-bounds.wnft` | `BAD_LAYOUT` | one accessor's `offset` pushed past the chunk |
| `invalid/limit-exceeded-keypoints.wnft` | `LIMIT_EXCEEDED` | decoded with `maxKeypoints` lowered |
| `invalid/inconsistent-meta.wnft` | `INCONSISTENT_DATA` | `meta.widthPx` ≠ `levelSizes[0][0]` |

Then one file per validation rule §8.1 enumerates:

`invalid/accessor-fractional-offset.wnft`, `accessor-negative-count.wnft`,
`accessor-count-above-u32.wnft`, `accessor-ref-not-index.wnft`
(all `BAD_MANIFEST`); `level-size-zero.wnft`, `level-size-above-u16.wnft`,
`scale-step-one.wnft` (`BAD_MANIFEST`); `level-sizes-growing.wnft`,
`set-levelstart-not-zero.wnft`, `set-levelstart-not-m.wnft`,
`kpindex-wrong-level.wnft`, `patch-level-out-of-range.wnft`,
`patch-crosses-right-edge.wnft`, `patch-crosses-bottom-edge.wnft`,
`reference-image-level-out-of-range.wnft` (all `INCONSISTENT_DATA`).

Then one file per I-JSON check, all `BAD_MANIFEST`:

| File | Manifest text carries |
|---|---|
| `invalid/ijson-duplicate-key.wnft` | `"widthPx"` twice in `meta` |
| `invalid/ijson-duplicate-key-escaped.wnft` | `"a"` and `"a"` in `info` — catches a reader that compared raw text instead of unescaped names |
| `invalid/ijson-unpaired-surrogate.wnft` | `"\uD800"` in an `info` value |
| `invalid/ijson-integer-2p53.wnft` | `params: { "seed": 9007199254740992 }` |
| `invalid/ijson-infinity.wnft` | `params: { "seed": 1e400 }` |
| `invalid/ijson-raw-noncharacter.wnft` | a **raw** U+FFFF in a `params` value — strict UTF-8 accepts it, only check (e) catches it |
| `invalid/ijson-noncharacter-in-name.wnft` | an escaped `"\\uFDD0"` as a member name |

Write the last two through explicit code points
(`String.fromCharCode(0xffff)`, `"\\u" + "FDD0"`) so no source file in the
repository has to contain a noncharacter literal.

- [ ] **Step 4: Write the `warnings/` and `noncanonical/` corpora**

`warnings/` — decode succeeds with exactly this list:

| File | Warnings |
|---|---|
| `warnings/unknown-chunk.wnft` | `UNKNOWN_CHUNK_SKIPPED` |
| `warnings/unknown-descriptor-kind.wnft` | `UNSUPPORTED_DESCRIPTOR_SET` — an unknown `kind` beside a valid `orb` set |
| `warnings/unknown-norm.wnft` | `UNSUPPORTED_DESCRIPTOR_SET` — `"hamming2"`, which the contract does not define |
| `warnings/unknown-element-type.wnft` | `UNSUPPORTED_DESCRIPTOR_SET` — dropped on decode, beside a valid set |
| `warnings/unknown-extension.wnft` | `UNKNOWN_EXTENSION_IGNORED` — `extensionsUsed` only (§6.2, rev 2) |

`noncanonical/` — decodes to the same values as its counterpart, and
`encode(decode(f))` equals **the counterpart**, not the input:

| File | Counterpart | What is non-canonical |
|---|---|---|
| `noncanonical/key-order.wnft` | `valid/minimal.wnft` | top-level keys in a different order |
| `noncanonical/whitespace.wnft` | `valid/minimal.wnft` | insignificant whitespace throughout |
| `noncanonical/explicit-empty-params.wnft` | `valid/minimal.wnft` | `"params":{}` written out |
| `noncanonical/unknown-top-level-key.wnft` | `valid/minimal.wnft` | an unrecognised top-level key |
| `noncanonical/unknown-extension-payload.wnft` | `valid/minimal.wnft` | an unknown non-required extension with a payload on a descriptor set |
| `noncanonical/unsorted-params.wnft` | a `valid/` file whose set carries `params: {"10":1,"9":2,"a":3}` | `params` keys unsorted, including `"9"` and `"10"` — catches a writer that used `JSON.stringify` |

The last one needs its own `valid/` counterpart, since `valid/minimal.wnft`
has no `params`: generate `valid/params-numeric-keys.wnft` alongside it.

- [ ] **Step 5: Write `expectations.json`**

The generator writes it too, so the index can never drift from the corpus:

```json
{
  "formatVersion": "0.2",
  "valid": [{ "file": "valid/minimal.wnft", "decoded": "valid/minimal.json" }],
  "invalid": [
    { "file": "invalid/bad-magic.wnft", "error": "BAD_MAGIC" },
    { "file": "invalid/limit-exceeded-keypoints.wnft", "error": "LIMIT_EXCEEDED",
      "limits": { "maxKeypoints": 4 } }
  ],
  "warnings": [{ "file": "warnings/unknown-chunk.wnft", "warnings": ["UNKNOWN_CHUNK_SKIPPED"] }],
  "noncanonical": [{ "file": "noncanonical/key-order.wnft", "canonical": "valid/minimal.wnft" }]
}
```

The optional `limits` object is how `MANIFEST_TOO_LARGE` and `LIMIT_EXCEEDED`
are tested without committing a 64 MiB file: the fixture is small and the test
decodes it with that limit lowered. §6.4 makes the limits configurable, so
this exercises the real code path.

- [ ] **Step 6: Generate and inspect**

```bash
npm run fixtures -w @webarkit/nft-tracker
git status --short fixtures/
```

Expected: every file listed above created. Open `valid/minimal.json` and read
it: it is the human-checkable statement of what the format means, and a wrong
value there would make §8.2 item 1 pass against a wrong decoder.

- [ ] **Step 7: Verify determinism**

```bash
npm run fixtures -w @webarkit/nft-tracker
git status --short fixtures/
```

Expected: no changes after the second run. If anything differs, find the
non-determinism — a `Date`, an unsorted `Object.keys`, a `Math.random` — and
remove it; do not commit a corpus that cannot be reproduced.

- [ ] **Step 8: Commit**

```bash
git add .gitattributes packages/nft-tracker/package.json packages/nft-tracker/scripts/generate-fixtures.mjs fixtures/
git commit -m "test(nft-tracker): add the .wnft 0.2 conformance fixtures

8.1's corpus, produced by a committed deterministic generator and never
edited by hand: valid files through encode (so canonical by
construction), and invalid, warning and non-canonical files framed
directly, since the canonical writer refuses to produce them. One
invalid file per error code of 6.2, per validation rule of 5.2 to 5.8,
and per I-JSON check of 5. expectations.json is generated with them, so
the index cannot drift from the corpus.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Conformance and evolution — §8.2 and §8.3

**Files:**
- Create: `packages/nft-tracker/test/target/format/fixtures-dir.ts`
- Create: `packages/nft-tracker/test/target/format/conformance.test.ts`

**Interfaces:**
- Consumes: `decode`, `encode`, `buildFixtures` (Task 15), the committed corpus.
- Produces: nothing importable — this is the acceptance suite.

- [ ] **Step 1: Write the path helper**

`test/target/format/fixtures-dir.ts` (LGPL header first). The relative depth
from the test tree to the repo root lives here and nowhere else:

```ts
import { fileURLToPath } from "node:url";

/** `fixtures/nft-target/0.2/`, resolved from this file's own location. */
export const FIXTURES_DIR = fileURLToPath(
    new URL("../../../../../fixtures/nft-target/0.2/", import.meta.url),
);
```

Five levels up: `format` → `target` → `test` → `nft-tracker` → `packages` →
the repo root.

- [ ] **Step 2: Write the conformance suite**

`test/target/format/conformance.test.ts` (LGPL header first). Every block below
is numbered for the §8.2 or §8.3 item it implements, so a reviewer can check
coverage without re-reading the specification:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { decode } from "../../../src/target/format/decode.js";
import { encode } from "../../../src/target/format/encode.js";
import { crc32 } from "../../../src/target/format/crc32.js";
import { buildFixtures } from "../../../scripts/generate-fixtures.mjs";
import { FIXTURES_DIR } from "./fixtures-dir.js";

const read = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES_DIR, rel)));
const expectations = JSON.parse(readFileSync(join(FIXTURES_DIR, "expectations.json"), "utf8"));

/** Typed arrays become plain arrays, so `toEqual` compares values. */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x) =>
    ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x));
```

Then:

1. **§8.2 item 1** — `decode(valid/minimal.wnft)` equals `valid/minimal.json`:
   compare `plain(result.target)` with the committed JSON.
2. **§8.2 item 2** — same-implementation round trip: for every `valid/` entry,
   `encode(decode(f)).bytes` is byte-identical to `f`.
3. **§8.2 item 3** — non-canonical inputs: for every `noncanonical/` entry, its
   decoded values equal those of its counterpart, and `encode(decode(f))`
   equals **the counterpart's bytes**, not the input's.
4. **§8.2 item 4** — cross-implementation. **Not runnable yet:** `crates/wnft-format`
   does not exist. Write the block as a documented `it.skip` naming what it
   will compare (`BIN` chunks byte-identical, manifests equal after parsing)
   and why it is skipped, so the gap is visible in the test output rather than
   only in this plan.
5. **§8.2 item 5** — every `invalid/` file yields exactly its expected error
   code (honouring its optional `limits`), and every `warnings/` file yields
   `ok` with exactly its expected warning list, compared as a sorted array of
   codes.
6. **§8.2 item 6** — the CRC-32 vector. Already covered in Task 2; assert it
   once more here so the conformance suite is self-contained.
7. **§8.2 item 7** — the writer rejects what the reader would. Covered in full
   by Task 13's suite; add one block here that re-asserts the five cases
   against the public `encode`, since item 7 is phrased in terms of `encode()`.
8. **The corpus matches its generator** — `buildFixtures()` reproduces every
   committed file byte for byte. This is what makes "never edited by hand"
   enforceable rather than aspirational.

Then §8.3, each its own `it`:

- A file declaring `0.3` is rejected with `UNSUPPORTED_FORMAT_VERSION`.
- Unknown keys at the top level and inside a descriptor set are ignored and not re-emitted (via `noncanonical/unknown-top-level-key.wnft`).
- Keys inside `params` and inside `info` are **data**: preserved and re-emitted unchanged, whatever they are.
- An unknown extension in `extensionsRequired` gives `UNSUPPORTED_EXTENSION`; the same name only in `extensionsUsed` is ignored, pruned, and warned about.
- A file with two descriptor sets, one of an unknown family: the other remains present and usable.
- `M ≠ N` without `WKNF_multiview` in `extensionsRequired` gives `INCONSISTENT_DATA`.
- **Backward-compatibility corpus:** every directory under `fixtures/nft-target/` is enumerated, and for each file this reader either decodes it correctly or rejects it with an explicit error — never throws, never misreads. Today that is only `0.2/`; written as a loop over the directory listing, it costs nothing now and covers `0.3/` automatically the day it is frozen.

- [ ] **Step 3: Run it**

```bash
npm test -w @webarkit/nft-tracker
```

Expected: PASS, with one documented skip (§8.2 item 4). A failure in item 2 or
item 3 usually means a key-order or omission bug in `emitManifest`, not a
decoder bug — compare the two manifests as text before suspecting anything else.

- [ ] **Step 4: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/test/target/format/conformance.test.ts packages/nft-tracker/test/target/format/fixtures-dir.ts
git commit -m "test(nft-tracker): add the .wnft conformance and evolution suites

8.2 items 1, 2, 3, 5, 6 and 7 against the committed corpus, plus a check
that the corpus still reproduces from its generator. Item 4,
cross-implementation, is a documented skip until crates/wnft-format
exists. 8.3's evolution rules including the backward-compatibility
corpus, written as a loop over every frozen version directory.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: Robustness against untrusted input — §8.4

**Files:**
- Modify: `packages/nft-tracker/package.json` — add `fast-check` to `devDependencies`
- Create: `packages/nft-tracker/test/target/format/robustness.test.ts`

**Interfaces:**
- Consumes: `decode`, `encode`, the corpus, `fast-check`.
- Produces: nothing importable.

- [ ] **Step 1: Add the dependency**

```bash
npm install --save-dev --workspace @webarkit/nft-tracker fast-check@^4
```

This is the package's only new dependency and it is a devDependency: the codec
itself keeps no runtime dependency beyond `@webarkit/cv-backend-spec`. Check
that `package-lock.json` changed and that `npm test` still passes before going
further.

- [ ] **Step 2: Write the truncation sweep**

§8.4's first bullet, and the single most valuable test in this plan — it is
what proves no read anywhere below `decode` is unguarded:

```ts
describe("§8.4 — truncation", () => {
    it("fails, and never throws, at every truncation of every valid fixture", () => {
        for (const entry of expectations.valid) {
            const whole = read(entry.file);
            for (let n = 0; n < whole.length; n += 1) {
                const r = decode(whole.subarray(0, n));
                expect(r.ok, `${entry.file} truncated at ${n}`).toBe(false);
            }
            expect(decode(whole).ok, entry.file).toBe(true);
        }
    });
});
```

The corpus is deliberately small — 64×48 targets, a few KB each — so this is
tens of thousands of decodes that each fail at step 0 or 1 and cost almost
nothing. If it runs slowly, the cause is a decoder doing work before its
bounds checks, which is the bug the test exists to find.

- [ ] **Step 3: Write the property-based fuzzing**

```ts
import fc from "fast-check";

describe("§8.4 — fuzzing", () => {
    const base = read("valid/minimal.wnft");

    it("never throws on a bit flip anywhere in a valid file", () => {
        fc.assert(
            fc.property(
                fc.nat({ max: base.length - 1 }),
                fc.integer({ min: 0, max: 7 }),
                (index, bit) => {
                    const mutated = base.slice();
                    mutated[index] ^= 1 << bit;
                    const r = decode(mutated);
                    // Either it fails, or the flip landed in padding the
                    // checksum does not cover, in which case it must still
                    // decode to something coherent.
                    expect(typeof r.ok).toBe("boolean");
                },
            ),
            { numRuns: 2000 },
        );
    });

    it("never throws on arbitrary bytes", () => {
        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
                expect(typeof decode(bytes).ok).toBe("boolean");
            }),
            { numRuns: 2000 },
        );
    });

    it("never throws on arbitrary bytes carrying a valid header", () => {
        // Random bytes almost never reach the manifest; splice a correct
        // 16-byte header on so the fuzzer exercises the chunk loop too.
        fc.assert(
            fc.property(fc.uint8Array({ minLength: 16, maxLength: 2048 }), (tail) => {
                const bytes = new Uint8Array(16 + tail.length);
                bytes.set(base.subarray(0, 16));
                bytes.set(tail, 16);
                new DataView(bytes.buffer).setUint32(8, bytes.length, true);
                expect(typeof decode(bytes).ok).toBe("boolean");
            }),
            { numRuns: 2000 },
        );
    });
});
```

- [ ] **Step 4: Write the size-arithmetic and manifest-attack cases**

§8.4's third and fourth bullets. Build these by patching the base fixture's
manifest text, so the rest of the file stays valid and the failure is
unambiguous:

- An accessor `count` chosen so `count × size` exceeds `2^32` → `BAD_LAYOUT`,
  with no allocation. Assert the code, and assert the call returns promptly;
  a decoder that allocated first would be caught by the process, not the
  assertion, so also keep the count above any plausible heap.
- An accessor `count` that fits in `u32` but runs past the chunk → `BAD_LAYOUT`.
- A `keypoints.count` above `maxKeypoints` → `LIMIT_EXCEEDED`.
- A manifest exactly one byte above `maxManifestBytes` → `MANIFEST_TOO_LARGE`,
  and exactly at it → decodes.
- Deeply nested JSON in `info` → `BAD_MANIFEST`, without throwing.
- Invalid UTF-8 in the `JSON` chunk → `BAD_MANIFEST`.

- [ ] **Step 5: Write the property-based round trip**

§8.4's last bullet. The arbitrary is the work here; three traps to respect:

- Generate `x`, `y`, `angle`, `score` and `size` through `Math.fround`, since
  they are stored as `f32` and a random double would not survive the trip.
- Generate `levelStart` by drawing per-level counts and taking a running sum,
  so it is closed and non-decreasing by construction rather than by rejection.
- Generate `kpIndex` as the identity, since `M = N` is what §5.6 requires
  without `WKNF_multiview`.

```ts
it("round-trips a random valid target", () => {
    fc.assert(
        fc.property(arbitraryTarget(), (target) => {
            const written = encode(target);
            expect(written.ok, written.ok ? "" : written.detail).toBe(true);
            if (!written.ok) return;
            const readBack = decode(written.bytes);
            expect(readBack.ok).toBe(true);
            if (!readBack.ok) return;
            expect(readBack.target).toEqual(target);
            // And the file the second pass writes is the same file.
            const again = encode(readBack.target);
            expect(again.ok && again.bytes).toEqual(written.bytes);
        }),
        { numRuns: 200 },
    );
});
```

Write `arbitraryTarget()` in the same file. If `encode` rejects a generated
target, that is a bug in the arbitrary or in the validator — investigate it,
never filter it away with `fc.pre`.

- [ ] **Step 6: Run it**

```bash
npm test -w @webarkit/nft-tracker
```

Expected: PASS. Record any counterexample `fast-check` shrinks to as its own
named regression test before fixing the bug, so it stays covered once the
random seed moves on.

- [ ] **Step 7: Typecheck, then commit**

```bash
npm run typecheck -w @webarkit/nft-tracker
git add packages/nft-tracker/package.json packages/nft-tracker/test/target/format/robustness.test.ts package-lock.json
git commit -m "test(nft-tracker): add the .wnft robustness suite

8.4: every valid fixture truncated at every byte offset, property-based
fuzzing over bit flips and arbitrary bytes, size arithmetic chosen to
overflow or to overrun the chunk, manifest attacks at and past the
limit, and a property-based round trip over randomly generated targets.
fast-check joins as a devDependency; the codec still has no runtime
dependency beyond the contract.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Public surface, documentation and full verification

**Files:**
- Create: `packages/nft-tracker/src/target/format/index.ts`
- Modify: `packages/nft-tracker/src/index.ts`
- Create: `packages/nft-tracker/README.md` (or modify, if one exists by then)
- Modify: `README.md` (root) — the `nft-tracker` paragraph
- Modify: `fixtures/nft-target/README.md` (create) — what the corpus is and how to regenerate it

**Interfaces:**
- Consumes: everything.
- Produces: the package's public codec surface.

- [ ] **Step 1: Write the format layer's index**

`src/target/format/index.ts` re-exports only what a consumer needs:
`decode`, `encode`, the `DecodeResult`, `EncodeResult`, `ErrorCode`,
`WarningCode`, `Warning`, `DecodeOptions`, `DecodeLimits` and
`DEFAULT_LIMITS`. Everything else — `parseContainer`, `scanIJson`,
`validateManifest`, `materialise` — stays internal: it is reachable by deep
import for the generator and the tests, and is not part of what the package
promises.

- [ ] **Step 2: Re-export from the package index**

Add to `src/index.ts`, beside the existing type exports:

```ts
export {
    DEFAULT_LIMITS,
    decode,
    encode,
} from "./target/format/index.js";
export type {
    DecodeLimits,
    DecodeOptions,
    DecodeResult,
    EncodeResult,
    ErrorCode,
    Warning,
    WarningCode,
} from "./target/format/index.js";
```

- [ ] **Step 3: Document the codec**

In `packages/nft-tracker/README.md`, a section covering: what `.wnft` is and
that `docs/specs/nft-target-format.md` is the source of truth; the two
entry points with their result shapes and the rule that neither throws;
that `decode` accepts a view so a file embedded at an unaligned base still
works; the configurable limits and their defaults; and the two honest gaps —
descriptor-set selection (§6.3) is not implemented here, and `WKNF_multiview`
is not implemented, so a file requiring it is rejected.

In the root `README.md`, update the `nft-tracker` paragraph to say the codec
exists. **Do not write installation instructions that assume `npm install
@webarkit/cv-backend-*` works** — neither package is published (AGENTS.md).

`fixtures/nft-target/README.md` says what the corpus is, that it is generated
and never hand-edited, how to regenerate it (`npm run fixtures -w
@webarkit/nft-tracker`), and that every released format version's directory is
frozen (§8.3).

- [ ] **Step 4: Full verification, from a clean tree**

The four commands CI runs, in CI's order, from the repo root:

```bash
npm ci
npm run build
npm run typecheck
npm test
```

All four must pass. Do not report this work complete on a partial run: AGENTS.md
is explicit that a change is not verified without actually running them.

- [ ] **Step 5: Confirm the corpus is still reproducible**

```bash
npm run fixtures -w @webarkit/nft-tracker
git status --short
```

Expected: clean. A dirty tree here means the codec's output changed without
the corpus being regenerated, which would make §8.2 item 2 pass against stale
bytes.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/src/target/format/index.ts packages/nft-tracker/src/index.ts packages/nft-tracker/README.md README.md fixtures/nft-target/README.md
git commit -m "feat(nft-tracker): export the .wnft codec, and document it

decode and encode become the package's public codec surface, with the
result types and the configurable limits. The internals stay internal.
Documents both honest gaps: descriptor-set selection (6.3) is not part
of the codec, and WKNF_multiview is not implemented, so a file requiring
it is rejected rather than half-read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

Run after the last task, against the amended specification.

**Spec coverage.** Walk §3 to §8 and name the task implementing each:
§3 conventions → Tasks 9, 11; §4 container → Tasks 2, 4, 5; §5 manifest →
Tasks 6, 7, 8, 10; §6.1 order → Task 11; §6.2 codes → Task 3; §6.3 → **out of
scope, by instruction**; §6.4 limits → Tasks 3, 8, 11; §7.1 versioning →
Tasks 3, 7; §7.3 canonical writer → Tasks 12, 13, 14; §8.1 fixtures → Task 15;
§8.2 → Task 16 (item 4 a documented skip); §8.3 → Task 16; §8.4 → Task 17.

**Known gaps, deliberate and stated rather than silent:**

1. **§8.2 item 4, cross-implementation**, cannot run: `crates/wnft-format` does
   not exist. Task 16 leaves a documented skip, and the corpus freezes the
   `BIN` chunks the Rust codec will be compared against.
2. **§6.3 and its two codes** (`NO_USABLE_DESCRIPTORS`, `PRODUCER_MISMATCH`)
   are out of scope by instruction, so `errors.ts` omits them and no `invalid/`
   fixture produces the first — which §8.1 now records as its one exception.
3. **`WKNF_multiview` is not implemented**, so the multi-view branch of §5.6 is
   reachable only as a rejection. The guard is written against
   `extensionsRequired` rather than hard-coded, so it becomes live unchanged
   the day the extension lands.

**Type consistency.** `Accessor`, `AccessorType` and `ELEMENT_SIZE` are declared
once in `manifest.ts` and imported by `arrays.ts` and `encode.ts`;
`ManifestSpec` and `TargetArrays` are the two shapes crossing task boundaries;
`Failure`/`fail` is the single internal failure shape. `decode` and `encode` are
the only public functions, and their result types come from `errors.ts`.

**One thing to watch during execution.** The `BIN_TYPE` constant is `"BIN\0"`,
with a NUL as the fourth byte, in `container.ts`, `raw.ts` and the generator.
Task 5 step 3 calls this out because a space is the easy mistake and it makes
every file subtly wrong in a way only the fixtures catch.

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-09-11-nft-target-format-codec.md`. Two execution
options:

1. **Subagent-driven (recommended)** — a fresh subagent per task, with a review
   between tasks. Fast iteration, and each task arrives at its implementer with
   no memory of the last one's shortcuts. Uses `superpowers:subagent-driven-development`.
2. **Inline execution** — the tasks run in this session, batched with
   checkpoints for review. Uses `superpowers:executing-plans`.

Either way the sequence afterwards is fixed by the original request:
`superpowers:verification-before-completion`, then a review by the
`nft-reviewer` agent, then `superpowers:finishing-a-development-branch` with a
pull request against `dev`.

**Task 1 is not optional and must land first.** Eight of its twelve steps
change rules the later tasks test against, and three of them (the new warning
code, the file-size step 0, the `BAD_LAYOUT` for a missing `BIN` chunk) have no
correct implementation under the unamended text.
