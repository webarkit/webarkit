# `@webarkit/nft-tracker`

Natural-feature tracking for planar image targets, written **above** the
[`CvBackend` contract](../cv-backend-spec) — the backend is injected by the
caller, so this package runs on any implementation of it.

> **Not published to npm, and pre-0.1.** Develop against it from the monorepo:
> `npm install` at the root symlinks the workspace packages together.

What exists today is the **target layer**: the in-memory shape of a trained
target, and the codec for the `.wnft` files that store one. The tracker itself
is the next milestone ([ADR-0001](../../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md)).

## The `.wnft` codec

[`docs/specs/nft-target-format.md`](../../docs/specs/nft-target-format.md) is
the source of truth; where this README and the specification disagree, the
specification wins. This build implements **format 0.2** and **container
major 1**.

```ts
import { decode, encode } from "@webarkit/nft-tracker";

const result = decode(await (await fetch("pinball.wnft")).arrayBuffer());
if (!result.ok) {
    // result.error is a code from §6.2; result.detail says which field.
    throw new Error(`${result.error}: ${result.detail}`);
}
for (const warning of result.warnings) {
    console.warn(warning.code, warning.detail);
}
const target = result.target; // a TargetDb
```

**Neither entry point throws.** Both return a result, as ADR-0001 point 7
requires: exceptions are reserved for contract violations, never for a bad
file. A `.wnft` may come from a URL an application's user chose, so a hostile
one has to be data, not an incident.

```ts
type DecodeResult =
    | { ok: true; target: TargetDb; warnings: readonly Warning[] }
    | { ok: false; error: ErrorCode; detail: string };

type EncodeResult =
    | { ok: true; bytes: Uint8Array }
    | { ok: false; error: "INVALID_TARGET"; detail: string };
```

`encode` is the **canonical** writer of §7.3: the same target always produces
the same bytes, and it validates the target against every rule a reader
applies *before* writing anything — so it never emits a file its own reader
would reject, and never coerces a value to make it serialisable. On failure
`detail` names the offending field path, e.g. `descriptorSets[1].params.seed`.

### Buffers and alignment

`decode` accepts a bare `ArrayBuffer` **or any view of one**:

```ts
decode(buffer);                    // the whole allocation
decode(new Uint8Array(buffer, 3)); // a file embedded at an unaligned offset
```

The view form is not a convenience. Arrays are read as zero-copy views into
the file wherever the alignment permits, and a file that does not start at an
8-aligned address — one embedded in a larger buffer, or in a WASM module —
puts its arrays at addresses JavaScript refuses to view. The codec detects
that and copies the affected arrays instead (§3); without the view form that
path would be unreachable.

### Resource limits

The defaults of §6.4, all overridable per call:

| Limit | Default |
|---|---|
| `maxFileBytes` | 64 MiB |
| `maxManifestBytes` | 1 MiB |
| `maxLevels` | 32 |
| `maxKeypoints` | 1 000 000 |
| `maxDescriptorSets` | 16 |
| `maxPatchSize` | 64 |

```ts
decode(bytes, { limits: { maxKeypoints: 50_000 } });
```

They are checked before anything is allocated in proportion to them — the
file-size limit before a single byte is read, which is why an oversized file
reports `LIMIT_EXCEEDED` rather than `BAD_MAGIC` even when it is not a `.wnft`
at all.

### Two things this does not do

- **It does not choose a descriptor set for a backend.** §6.3's selection
  intersects an application's preference order with a backend's
  `capabilities`, and probes the runtime backend for the descriptor width.
  That belongs to the tracker, which is where the backend is. Hence the codec
  never returns `NO_USABLE_DESCRIPTORS` or warns `PRODUCER_MISMATCH`.
- **It does not implement `WKNF_multiview`.** The format side is settled
  (§5.6), but adoption is blocked on k-nearest matching in the contract
  (§11, Q3), so claiming it would promise a ratio test this package cannot
  perform. A file with that name in `extensionsRequired` is rejected with
  `UNSUPPORTED_EXTENSION` rather than half-read, and one that merely lists it
  in `extensionsUsed` is ignored with `UNKNOWN_EXTENSION_IGNORED`.

## Conformance

The suites in `test/target/format/` implement §8.2, §8.3 and §8.4 against the
committed corpus in [`fixtures/nft-target/`](../../fixtures/nft-target). §8.2
item 4, cross-implementation conformance, is a documented skip until the Rust
codec exists.

```bash
npm run build      # the fixture generator imports dist/
npm test
npm run fixtures   # regenerate the corpus; it must produce no diff
```

## Licence

LGPL-3.0-or-later, with the linking exception carried in every source file.
