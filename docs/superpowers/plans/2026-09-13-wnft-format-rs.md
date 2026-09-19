# `crates/wnft-format` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `no_std` Rust codec for the `.wnft` NFT target format, written from the specification text rather than from the TypeScript codec, that decodes and re-encodes the shared conformance corpus exactly as the specification requires.

**Architecture:** A new Cargo workspace at the repository root (`members = ["crates/*"]`) holding one crate, `wnft-format`. The crate is layered exactly as §6.1 orders its validation gates — container framing, I-JSON scan, manifest schema, accessor materialisation, data consistency — so each gate is a module with its own tests and the normative order is visible in the call sequence rather than buried. Every array is **copied** out of the `BIN` chunk with `from_le_bytes`, never viewed through a pointer cast, which makes alignment a non-question in Rust and keeps the crate free of `unsafe`. The test suite is driven by `fixtures/nft-target/0.2/expectations.json`, which the TypeScript implementation generated and this crate only ever consumes.

**Tech Stack:** Rust 1.97 (edition 2024), `no_std` + `alloc` with a default `std` feature, `serde`/`serde_json` (`alloc` + `float_roundtrip`, no default features), `crc32fast` (no default features), `cargo-fuzz` + `libfuzzer-sys` for the out-of-CI fuzz target.

**Spec:** [`docs/specs/nft-target-format.md`](../../specs/nft-target-format.md) — format **0.2**, as amended by Task 0 of this plan (`0.2 rev 4`). Section references below (`§4.2`, `§6.1`, …) point into it and it travels with this plan: an executor reads both.

**Peer implementation:** [`packages/nft-tracker/src/target/format/`](../../../packages/nft-tracker/src/target/format/) (TypeScript). It is a **peer, not a reference.** Do not port it line by line — implement each rule from the specification text. It is useful for two things only: confirming the exact `detail`/code strings where this plan quotes them, and as a second opinion when the specification reads ambiguously. Any *new* disagreement found between the two, beyond the five Task 0 resolves, stops work and goes to the human — it means the specification is ambiguous or one codec has a bug, and that is decided before code is written, not after.

## Global Constraints

Copied verbatim from the specification and the repository's `AGENTS.md`. Every task's requirements implicitly include this section.

- **Language:** every repository artifact — code, comments, commit messages, PR titles and bodies, docs — is in **English**.
- **License:** `LGPL-3.0-or-later`. Every new `.rs` file carries the header block of Task 1 step 2, matching the npm packages' template.
- **Format version:** `0.2`. `SUPPORTED_FORMAT_VERSION = "0.2"`; while the major is `0` a reader accepts **only** that exact minor (§7.1) — anything else is `UNSUPPORTED_FORMAT_VERSION`.
- **Container version:** `container_major` MUST be `1`; any `container_minor` is accepted (§7.1).
- **Magic:** `"WKNF"` = `57 4B 4E 46`. File header 16 bytes, chunk header 16 bytes, chunk data padded to a multiple of 8 — `JSON` with `0x20`, everything else with `0x00` (§4.1, §4.2).
- **CRC-32:** CRC-32/ISO-HDLC, reflected polynomial `0xEDB88320`, init and final XOR `0xFFFFFFFF`. Test vector: `123456789` → `0xCBF43926` (§4.2).
- **Byte order:** little-endian throughout (§3).
- **Default limits (§6.4):** file 64 MiB; manifest 1 MiB; levels 32; keypoints 1,000,000; descriptor sets 16; patch size `P` 64; patches `Q` 65,536. All configurable.
- **No `unsafe`:** the crate declares `#![forbid(unsafe_code)]`.
- **Module visibility.** Every module is private (`mod container;`, not `pub mod`), and the items inside are declared **`pub`, not `pub(crate)`**. What keeps them out of the public API is the private module; what keeps them out of the docs is `#[doc(hidden)]` on `testing`. This matters mechanically: `pub use`-ing a `pub(crate)` item through the `pub mod testing` re-export is E0365 and will not compile. Each task adds the items it creates to `testing` as it creates them. **Where a code block below writes `pub(crate)`, read it as `pub`** — this rule governs.
- **Only two items are public API:** `decode` and `encode`, with the types they name. Everything else is reachable for the test suites through `testing` and is not covered by semver.
- **No panic on untrusted input:** every product and sum over file-supplied numbers uses `checked_mul` / `checked_add` **before** it is used to allocate or index; every index into file-supplied data goes through `.get()` / `.get_mut()`; no `unwrap()`, `expect()`, slicing with `[a..b]`, or arithmetic operators on values that came from the file. (`unwrap()` on a value this code just constructed itself is fine; in doubt, don't.)
- **Alignment:** unaligned reads are done by **copying** (`u32::from_le_bytes` on a 4-byte array, and the `u16`/`f32` equivalents). Never a pointer cast, never `bytemuck`.
- **Fixtures are read-only.** `fixtures/nft-target/0.2/` was generated by the TypeScript implementation. This crate **consumes** it and MUST NEVER regenerate, rewrite or add to it — the corpus's whole value is that one implementation produced it and the other did not (`fixtures/nft-target/README.md`).
- **Branch:** `feat/wnft-format-rs` in the worktree `D:\kalwalt-github\webarkit-rs`. PRs open against **`dev`**, never `master`.
- **Commits:** Conventional Commits — `feat(wnft-format): …`, `test(wnft-format): …`, `docs(specs): …`, `ci: …`, `chore: …`. Every commit message ends with the line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Cargo is not on this shell's `PATH`.** It lives at `C:\Users\perda\.cargo\bin`. Prefix commands, or run `export PATH="$PATH:/c/Users/perda/.cargo/bin"` once per Bash tool call. `thumbv7em-none-eabihf` is already an installed target.
- **Never round-trip a source file through PowerShell** (`Get-Content -Raw` then `Set-Content`) — it double-encodes every non-ASCII character, and this repo's sources are full of `§`. Edit with the Edit/Write tools or a POSIX tool.

## Deviation from the task brief, stated once

The brief asks for `encode(target: &Target) -> Vec<u8>`. That signature cannot satisfy §7.3, which requires the writer to **return `INVALID_TARGET` rather than emit bytes** for a target a conforming reader would reject, and it would make §8.2 item 7 untestable. This plan therefore implements:

```rust
pub fn encode(target: &Target) -> Result<Vec<u8>, EncodeError>;
```

with `EncodeError { code: ErrorCode::InvalidTarget, detail: String }`, mirroring the TypeScript `EncodeResult`. Everything else in the brief is implemented as asked.

## File Structure

```
Cargo.toml                                  workspace root: members = ["crates/*"], excludes the fuzz crate
.gitignore                                  + target/, fuzz artifacts
crates/wnft-format/
  Cargo.toml                                no_std + alloc, default feature "std"
  README.md                                 what the crate is, how to run the fuzzer (Task 9)
  src/
    lib.rs            crate docs, #![no_std], #![forbid(unsafe_code)], decode(), re-exports
    error.rs          ErrorCode, WarningCode, Warning, DecodeError, EncodeError, Decoded
    limits.rs         Limits + DEFAULT_LIMITS (§6.4)
    known.rs          supported versions, known kinds/norms/element types, implemented extensions
    crc32.rs          crc32() (§4.2)
    container.rs      parse_container / build_container (§4, §6.1 steps 1-2)
    ijson.rs          scan_ijson: the five I-JSON checks over the manifest *text* (§5)
    target.rs         Target and its sub-structs: the decoded, in-memory form
    arrays.rs         accessor -> owned Vec, by copy (§3)
    manifest.rs       decode_manifest (steps 3-5) + validate_manifest (step 6) (§5.1-§5.9)
    consistency.rs    check_consistency (step 7)
    validate_target.rs  the writer's pre-serialisation validation (§7.3)
    canonical_json.rs   canonical number/string emission for the manifest (§7.3)
    encode.rs         the canonical writer (§7.3)
  tests/
    crc32.rs          §8.2 item 6
    corpus.rs         §8.2 items 1, 2, 3, 5 and §8.4 truncation, driven by expectations.json
    writer.rs         §8.2 item 7 and §8.3's evolution tests
  fuzz/
    Cargo.toml        its own workspace; excluded from the root one
    fuzz_targets/decode.rs
.github/workflows/CI.yml                    + a `rust` job (Task 10)
AGENTS.md                                   + the Rust commands (Task 10)
docs/specs/nft-target-format.md             amended to 0.2 rev 4 (Task 0)
```

One module per validation gate, in §6.1's own order. `manifest.rs` is the largest because §5 is; it stays one file because its rules are a single ordered sequence over one document and splitting them by section would scatter the ordering the specification fixes.

---

### Task 0: Specification corrections (0.2 rev 4)

Five places where the specification and the TypeScript codec disagree, all resolved in the specification's favour of what the TypeScript already does. **No code changes in either implementation** — this task is spec-only. It goes first so that every later task implements a text that has no known ambiguity.

**Files:**
- Modify: `docs/specs/nft-target-format.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the normative text every later task implements. In particular it fixes `kpIndex[i] = i` as a **reader** rule and `patchSize >= 1` as a domain rule, both of which Tasks 7 and 6 implement.

- [ ] **Step 1: §5.6 — make the `kpIndex` identity a reader rule**

Replace the paragraph beginning "A reader that ignored `kpIndex`":

```markdown
A reader that ignored `kpIndex` would therefore silently produce a worse ratio test. For that reason, a `kpIndex` that is anything but the identity is allowed **only** when the extension `WKNF_multiview` is listed in `extensionsRequired`. Without it, a file MUST carry exactly one row per keypoint: `M = N` and `kpIndex[i] = i` for every `i`. Readers MUST check the identity as well as the row count, and report `INCONSISTENT_DATA` for either — a permutation has no repeated value and would otherwise pass while still meaning that row `i` does not describe keypoint `i`.
```

- [ ] **Step 2: §5.7 — give `patchSize` a domain**

In the `patches` table, replace the `patchSize` row:

```markdown
| `patchSize` | — | `P`, e.g. 8. MUST be a JSON number with no fractional part in `[1, 2^32 − 1]`. Unlike `dimensions` (§5.6), `0` is **not** legal: a patch of no pixels records a position at which nothing was sampled, whereas a zero-dimension descriptor still records a keypoint correspondence. A violation is `BAD_MANIFEST` |
```

- [ ] **Step 3: §5.3 and §5.8 — state the size domains and their error code**

In §5.3, replace the sentence beginning "`widthPx` and `heightPx` MUST equal":

```markdown
`widthPx` and `heightPx` MUST each be a JSON number with no fractional part in `[1, 2^16 − 1]` — a violation is `BAD_MANIFEST`, checked at §6.1 step 6 — and MUST equal `pyramid.levelSizes[0]`, which is `INCONSISTENT_DATA` at step 7. `physicalSizeMm` is `[width, height]` in millimetres, both `> 0`, or `null` if unknown.
```

In §5.8, replace the sentence beginning "`pixels` is a `u8` accessor":

```markdown
`pixels` is a `u8` accessor of `width × height` grayscale values, row-major. `level` MUST be a JSON number with no fractional part in `[0, 2^32 − 1]`, and `width` and `height` integers in `[1, 2^16 − 1]`; a violation of either domain is `BAD_MANIFEST` at §6.1 step 6. `level` MUST then be `< L`, checked **before** `levelSizes[level]` is indexed, and `width` and `height` MUST equal `pyramid.levelSizes[level]`. A violation of either is `INCONSISTENT_DATA`.
```

- [ ] **Step 4: §6.1 step 5 and step 6 — order and domains**

Replace step 5:

```markdown
5. **Format version and required extensions** (§7), in that order. Within the extensions, the subset rule of §5.1 — every name in `extensionsRequired` also in `extensionsUsed` — is checked first, as `BAD_MANIFEST`, and only then whether the reader implements each required name, as `UNSUPPORTED_EXTENSION`. A file breaking both therefore reports the structural failure rather than the capability one.
```

In step 6, after "the pyramid domains of §5.4 (…)", insert:

```markdown
the `meta` and `referenceImage` size domains of §5.3 and §5.8; the `patches.patchSize` domain of §5.7;
```

- [ ] **Step 5: §6.2 — extend the `BAD_MANIFEST` row**

```markdown
| `BAD_MANIFEST` | Not strict UTF-8, not JSON, not I-JSON (§5), not an object, required key missing, wrong type, a value outside the domain its section fixes, a name in `extensionsRequired` that `extensionsUsed` does not list (§5.1) |
```

- [ ] **Step 6: §8.2 item 3 and §8.3 — scope the comparisons**

Replace §8.2 item 3:

```markdown
3. **Non-canonical inputs:** every `noncanonical/` fixture decodes to the same values as its `valid/` counterpart, and `encode(decode(f))` equals **that counterpart** — not the input. This is what makes §7.3's "keeps only what it understands" testable rather than a disclaimer. "Equals" means byte identity for the implementation that wrote the corpus, and item 4's comparison — `BIN\0` byte-identical, manifests equal after parsing — for any other, since §7.3's last paragraph leaves number formatting free across languages (Q8).
```

In §8.3, replace the `M ≠ N` bullet:

```markdown
- `M ≠ N`, or a `kpIndex` that is not the identity, without `WKNF_multiview` in `extensionsRequired` → `INCONSISTENT_DATA`.
```

- [ ] **Step 7: §12 — revision history**

Append:

```markdown
- **0.2 rev 4** (2026-09-13) — editorial, from the second implementation: the `kpIndex` identity becomes a reader rule, not only a writer one, since a permutation has no repeated value and would otherwise decode (§5.6, §8.3); `patchSize` gains the domain `[1, 2^32 − 1]`, with the reason it differs from `dimensions` (§5.7); the `meta`, `referenceImage` and `patchSize` domains are stated with their error code and step, so that an out-of-range size is `BAD_MANIFEST` at step 6 rather than reaching step 7 (§5.3, §5.7, §5.8, §6.1, §6.2); the §5.1 subset rule gets a code and an order against `UNSUPPORTED_EXTENSION` (§6.1, §6.2); §8.2 item 3's byte identity is scoped the way item 4 already is, for an implementation reading a corpus another one wrote (§8.2). No change to the bytes or the meaning of any valid `0.2` file.
```

- [ ] **Step 8: Verify no other section contradicts the edits**

Run:

```bash
grep -n "kpIndex\|patchSize\|widthPx\|extensionsRequired" docs/specs/nft-target-format.md
```

Expected: every hit is consistent with the text above. §8.1's fixture list already asks for a `patch` fixture per rule; it needs no edit (the two new `invalid/` fixtures are a follow-up on the TypeScript generator, noted in the PR body, not in this plan).

- [ ] **Step 9: Commit**

```bash
git add docs/specs/nft-target-format.md
git commit -m "docs(specs): resolve five ambiguities found by the Rust codec (0.2 rev 4)

The kpIndex identity was a writer rule only, so a within-level permutation
decoded under the letter of §5.6 while the TypeScript reader rejected it;
patchSize had no domain, where §5.6 had ruled explicitly that dimensions
may be 0; meta and referenceImage sizes had no stated domain, so an
out-of-range one was INCONSISTENT_DATA in the text and BAD_MANIFEST in
practice; the §5.1 subset rule had no code and no order against
UNSUPPORTED_EXTENSION; and §8.2 item 3 asked for byte identity from an
implementation that did not write the corpus, which Q8 does not permit.

No change to the bytes or the meaning of any valid 0.2 file, and no code
change in either implementation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: Cargo workspace, crate skeleton, and CRC-32

The first executable deliverable: a workspace that builds, a crate that compiles on a bare-metal target with no `std`, and the one algorithm the specification pins with a published test vector.

**Files:**
- Create: `Cargo.toml`
- Create: `crates/wnft-format/Cargo.toml`
- Create: `crates/wnft-format/src/lib.rs`
- Create: `crates/wnft-format/src/crc32.rs`
- Modify: `.gitignore`
- Test: `crates/wnft-format/tests/crc32.rs`

**Interfaces:**
- Consumes: nothing.
- Produces: the crate `wnft_format`; `pub fn crc32(bytes: &[u8]) -> u32`; the `std` feature (default on) and the `no_std` + `alloc` baseline every later module is written against.

- [ ] **Step 1: Write the workspace root `Cargo.toml`**

```toml
# The Rust half of the repository. `crates/*` sits beside `packages/*` (npm
# workspaces) rather than inside it: the two toolchains share the repository and
# the `fixtures/` corpus, and nothing else.
[workspace]
resolver = "3"
members = ["crates/*"]
# cargo-fuzz generates a crate with its own `[workspace]`, and it is not part of
# the build or of CI (§8.4 runs it out of band). Listing it here keeps
# `cargo test --workspace` from reaching for libfuzzer on a machine that has no
# nightly toolchain.
exclude = ["crates/wnft-format/fuzz"]

[workspace.package]
edition = "2024"
rust-version = "1.85"
license = "LGPL-3.0-or-later"
repository = "https://github.com/webarkit/webarkit"

# Deliberately no `[workspace.lints]` table. The strict lints this crate needs
# belong to the *library* — see the inner attributes in
# `crates/wnft-format/src/lib.rs` — and a package's `[lints]` table applies to
# every target in the package, integration tests included. `unwrap_used`,
# `expect_used` and `panic` denied over `tests/` would fail the build on
# essentially every assertion, since `expect` and `assert!` are what a test is
# made of. The constraint is about how the library behaves on untrusted input,
# so the library is where it is expressed.

[profile.release]
# A wrap that slipped past the checked arithmetic of §6.1 would be a silent
# security bug; with this it is a loud crash the fuzzer finds instead. Debug
# builds check overflow already, and this makes release agree with them.
overflow-checks = true
```

- [ ] **Step 2: Write `crates/wnft-format/Cargo.toml`**

```toml
[package]
name = "wnft-format"
version = "0.1.0"
description = "Reader and canonical writer for the WebARKit .wnft NFT target format (format 0.2)"
edition.workspace = true
rust-version.workspace = true
license.workspace = true
repository.workspace = true

[features]
# On by default so that `cargo test` and ordinary consumers get std::error::Error
# and the standard allocator. `--no-default-features` is the no_std build CI
# checks against thumbv7em-none-eabihf.
default = ["std"]
std = ["serde/std", "serde_json/std"]

[dependencies]
# float_roundtrip is required by §6.1's note to Rust implementers: without it
# serde_json does not round-trip every f64 literal exactly.
serde_json = { version = "1.0", default-features = false, features = ["alloc", "float_roundtrip"] }
serde = { version = "1.0", default-features = false, features = ["alloc", "derive"] }

[dev-dependencies]
# The test suites link the crate plus these, not the crate's own dependencies —
# so serde and serde_json are declared twice on purpose, once for each side.
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
# A second opinion on the CRC-32 table. The crate itself does not use it: §4.2's
# checksum is part of the file format, so this crate spells it out, and
# crc32fast's only job is to keep that spelling honest (Task 1 step 4).
crc32fast = "1.4"
```

No `[lints]` table, for the reason the root `Cargo.toml` states: it would bind the test crates too. The lints live in `src/lib.rs`, next step.

- [ ] **Step 3: Write the license header template and `src/lib.rs`**

Every `.rs` file in this crate starts with this block, with `crc32.rs` replaced by the file's own name. Copy it verbatim — it is the npm packages' header with the file line changed.

```rust
/*
 *  crc32.rs
 *  wnft-format
 *
 *  This file is part of wnft-format - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  wnft-format is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  wnft-format is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with wnft-format.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */
```

`src/lib.rs`, after that header:

```rust
#![no_std]
#![forbid(unsafe_code)]
#![warn(missing_docs)]
// The crate reads untrusted input, so the panicking forms are denied outright
// rather than left to review: §6.1's promise is that a hostile file is a value,
// never an incident. These are inner attributes rather than a `[lints]` table
// because they must bind the library and NOT the test crates, whose whole idiom
// is `expect` and `assert!`.
//
// `clippy::arithmetic_side_effects` is deliberately absent. It fires on loop
// counters and on lengths this crate derived itself, and the only way through it
// is blanket `allow`s — which is worse than not having the lint. What it would
// have guarded is carried instead by the Global Constraint on checked
// arithmetic, by `overflow-checks = true` in the release profile, and by the
// fuzz target of §8.4.
#![deny(
    clippy::indexing_slicing,
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic
)]

//! Reader and canonical writer for the WebARKit `.wnft` NFT target format.
//!
//! The specification is the source of truth: `docs/specs/nft-target-format.md`,
//! format **0.2**. Section references throughout this crate (§4.2, §6.1, …)
//! point into it. Where this code and that document disagree, the document
//! wins and the code is the bug.
//!
//! This crate is the format's **second** implementation. The first is the
//! TypeScript codec in `packages/nft-tracker`. They are peers, and the point of
//! there being two is that a specification with one implementation is only a
//! description of that implementation (§1).
//!
//! # `no_std`
//!
//! The crate needs an allocator and nothing else, so a `.wnft` decodes on a
//! bare-metal target as well as on a desktop. The `std` feature, on by default,
//! adds `std::error::Error` impls and the standard allocator.
//!
//! # Untrusted input
//!
//! A `.wnft` may come from a URL an application's user chose (§6.1). Nothing
//! here panics on any input: every product and sum over a file-supplied number
//! is checked before it allocates or indexes, and every failure is a
//! [`DecodeError`] value rather than an unwind.

extern crate alloc;

mod crc32;

pub use crc32::crc32;
```

- [ ] **Step 4: Write the failing test**

`crates/wnft-format/tests/crc32.rs` (with the header block):

```rust
//! §8.2 item 6: the checksum variant §4.2 pins, by its published test vector.

use wnft_format::crc32;

#[test]
fn spec_test_vector() {
    // §4.2: "Test vector: the ASCII bytes `123456789` give `0xCBF43926`."
    assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
}

#[test]
fn empty_input_is_zero() {
    // Not in the specification, but implied by it: init and final XOR are both
    // 0xFFFFFFFF, so an empty message checksums to 0. A table built with the
    // wrong polarity fails this while still passing nothing else.
    assert_eq!(crc32(b""), 0);
}

#[test]
fn agrees_with_crc32fast_on_a_spread_of_inputs() {
    // The hand-written table is fifteen lines and easy to get subtly wrong.
    // crc32fast implements the same variant (§4.2 names it), so it is the
    // second opinion that keeps the table honest.
    for len in [0usize, 1, 7, 8, 9, 64, 255, 256, 1024] {
        let data: Vec<u8> = (0..len).map(|i| (i.wrapping_mul(31) % 251) as u8).collect();
        let mut hasher = crc32fast::Hasher::new();
        hasher.update(&data);
        assert_eq!(crc32(&data), hasher.finalize(), "length {len}");
    }
}
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test crc32
```

Expected: FAIL — `cannot find function crc32 in crate wnft_format` (or, if the module stub exists, a linker/compile error). It must not pass.

- [ ] **Step 6: Write the implementation**

`crates/wnft-format/src/crc32.rs`, after the header block:

```rust
//! CRC-32/ISO-HDLC (§4.2): reflected polynomial `0xEDB88320`, initial value and
//! final XOR `0xFFFFFFFF` — the variant zlib, PNG and `crc32fast` use, so that a
//! chunk checksums the same here and in the TypeScript codec.
//!
//! Written out rather than delegated, because the checksum is part of the file
//! format and a format's own definition of it should be readable in the crate
//! that claims to implement it — and because a `no_std` crate with an allocator
//! and nothing else is a cheaper thing to depend on. `crc32fast` is a
//! **dev**-dependency, and the test suite cross-checks the two.
//!
//! CRC-32 detects **accidental** corruption — a truncated download, a bad cache
//! entry, a damaged copy. It detects no tampering at all, because whoever
//! changes the data recomputes it; that is the transport's job (HTTPS,
//! Subresource Integrity), not this format's (§4.2).

/// The byte-at-a-time table, built at compile time.
const TABLE: [u32; 256] = {
    let mut table = [0u32; 256];
    let mut n = 0usize;
    while n < 256 {
        let mut c = n as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        table[n] = c;
        n += 1;
    }
    table
};

/// CRC-32 of `bytes`, as §4.2 defines it.
#[must_use]
pub fn crc32(bytes: &[u8]) -> u32 {
    let mut c: u32 = 0xFFFF_FFFF;
    for &b in bytes {
        // Both indices are masked to a byte, so neither can be out of range —
        // but `indexing_slicing` is denied crate-wide and this is data-derived,
        // so it goes through `get` like everything else.
        let index = ((c ^ u32::from(b)) & 0xFF) as usize;
        let entry = TABLE.get(index).copied().unwrap_or(0);
        c = entry ^ (c >> 8);
    }
    c ^ 0xFFFF_FFFF
}
```

Note: `arithmetic_side_effects` is denied, and `^`, `>>`, `&` are not arithmetic, so this compiles as written. If clippy objects to the `const` block's `+= 1`, allow it locally with a comment — the loop bounds are literals, not input.

- [ ] **Step 7: Write `.gitignore` additions**

Append to `.gitignore`:

```gitignore
# Rust build output. `crates/*/target` cannot occur with a workspace, but the
# fuzz crate is its own workspace and has its own.
/target/
crates/wnft-format/fuzz/target/
crates/wnft-format/fuzz/corpus/
crates/wnft-format/fuzz/artifacts/
crates/wnft-format/fuzz/coverage/
```

`Cargo.lock` is **committed**: this workspace produces a binary-ish artifact whose behaviour on untrusted input is the point, and a reproducible dependency set is part of that.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test crc32
```

Expected: PASS, 3 tests.

- [ ] **Step 9: Verify the `no_std` build holds from the start**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
```

Expected: success. If it fails here, it is a dependency feature problem and it is far cheaper to fix now than after twelve modules. `serde_json` without `std` needs `alloc`; `crc32fast` without `std` disables its runtime CPU detection, which is fine.

- [ ] **Step 10: Format and lint**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings
```

Expected: no diff from `fmt`, no warnings from clippy.

- [ ] **Step 11: Commit**

```bash
git add Cargo.toml Cargo.lock .gitignore crates/
git commit -m "feat(wnft-format): add the Cargo workspace, the crate, and CRC-32

The first executable piece: a no_std crate that builds for
thumbv7em-none-eabihf with no default features, and the one algorithm §4.2
pins with a published test vector. crc32fast is a dependency as well as a
hand-written table, and the suite cross-checks them — the table is fifteen
lines and easy to get subtly wrong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Error vocabulary and resource limits

The result types every later module returns. Small, but it goes early because nothing can be written without it, and because §6.2's codes are shared across implementations and so are worth pinning with a test of their own.

**Files:**
- Create: `crates/wnft-format/src/error.rs`
- Create: `crates/wnft-format/src/limits.rs`
- Modify: `crates/wnft-format/src/lib.rs`
- Test: `crates/wnft-format/tests/vocabulary.rs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `pub enum ErrorCode` — `BadMagic`, `UnsupportedContainer`, `BadContainer`, `ChecksumMismatch`, `ManifestTooLarge`, `BadManifest`, `UnsupportedFormatVersion`, `UnsupportedExtension`, `BadLayout`, `LimitExceeded`, `InconsistentData`, `InvalidTarget`; `ErrorCode::as_str(self) -> &'static str`.
  - `pub enum WarningCode` — `UnknownChunkSkipped`, `UnknownExtensionIgnored`, `UnsupportedDescriptorSet`; `WarningCode::as_str(self) -> &'static str`.
  - `pub struct Warning { pub code: WarningCode, pub detail: String }`
  - `pub struct DecodeError { pub code: ErrorCode, pub detail: String }`
  - `pub struct EncodeError { pub code: ErrorCode, pub detail: String }`
  - `pub struct Decoded { pub target: Target, pub warnings: Vec<Warning> }` (the `target` field lands in Task 5; until then `Decoded` is not yet declared — declare it in Task 5 and only the four items above here).
  - `pub struct Limits { … }`, `pub const DEFAULT_LIMITS: Limits`.
  - `pub(crate) fn fail(code: ErrorCode, detail: impl Into<String>) -> DecodeError`

`NO_USABLE_DESCRIPTORS` and `PRODUCER_MISMATCH` are **deliberately absent**, matching the TypeScript codec for the same documented reason: §6.2 defines both as outcomes of choosing a descriptor set against a *runtime backend's* capabilities (§6.3), and this crate knows nothing about a backend. §8.1 says so itself — "`NO_USABLE_DESCRIPTORS` is the one exception to 'one file per error code' … no file yields it on its own."

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/vocabulary.rs`:

```rust
//! The codes of §6.2 are shared by every implementation, so their spelling is
//! part of the contract, not an implementation detail. This pins it.

use wnft_format::{DEFAULT_LIMITS, ErrorCode, WarningCode};

#[test]
fn error_codes_spell_exactly_what_section_6_2_lists() {
    assert_eq!(ErrorCode::BadMagic.as_str(), "BAD_MAGIC");
    assert_eq!(ErrorCode::UnsupportedContainer.as_str(), "UNSUPPORTED_CONTAINER");
    assert_eq!(ErrorCode::BadContainer.as_str(), "BAD_CONTAINER");
    assert_eq!(ErrorCode::ChecksumMismatch.as_str(), "CHECKSUM_MISMATCH");
    assert_eq!(ErrorCode::ManifestTooLarge.as_str(), "MANIFEST_TOO_LARGE");
    assert_eq!(ErrorCode::BadManifest.as_str(), "BAD_MANIFEST");
    assert_eq!(
        ErrorCode::UnsupportedFormatVersion.as_str(),
        "UNSUPPORTED_FORMAT_VERSION"
    );
    assert_eq!(ErrorCode::UnsupportedExtension.as_str(), "UNSUPPORTED_EXTENSION");
    assert_eq!(ErrorCode::BadLayout.as_str(), "BAD_LAYOUT");
    assert_eq!(ErrorCode::LimitExceeded.as_str(), "LIMIT_EXCEEDED");
    assert_eq!(ErrorCode::InconsistentData.as_str(), "INCONSISTENT_DATA");
    // §7.3, the writer's own.
    assert_eq!(ErrorCode::InvalidTarget.as_str(), "INVALID_TARGET");
}

#[test]
fn warning_codes_spell_exactly_what_section_6_2_lists() {
    assert_eq!(WarningCode::UnknownChunkSkipped.as_str(), "UNKNOWN_CHUNK_SKIPPED");
    assert_eq!(
        WarningCode::UnknownExtensionIgnored.as_str(),
        "UNKNOWN_EXTENSION_IGNORED"
    );
    assert_eq!(
        WarningCode::UnsupportedDescriptorSet.as_str(),
        "UNSUPPORTED_DESCRIPTOR_SET"
    );
}

#[test]
fn default_limits_are_the_ones_section_6_4_suggests() {
    assert_eq!(DEFAULT_LIMITS.max_file_bytes, 64 * 1024 * 1024);
    assert_eq!(DEFAULT_LIMITS.max_manifest_bytes, 1024 * 1024);
    assert_eq!(DEFAULT_LIMITS.max_levels, 32);
    assert_eq!(DEFAULT_LIMITS.max_keypoints, 1_000_000);
    assert_eq!(DEFAULT_LIMITS.max_descriptor_sets, 16);
    assert_eq!(DEFAULT_LIMITS.max_patch_size, 64);
    assert_eq!(DEFAULT_LIMITS.max_patches, 65_536);
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test vocabulary
```

Expected: FAIL — `unresolved imports wnft_format::ErrorCode, wnft_format::WarningCode, wnft_format::DEFAULT_LIMITS`.

- [ ] **Step 3: Write `src/error.rs`**

```rust
//! The result vocabulary: the codes of §6.2, plus the writer's own
//! `INVALID_TARGET` (§7.3).
//!
//! §6.2 requires a reader to "return a result, never an exception", and
//! warnings to be "part of the returned result, not only logged", so an
//! application can act on one. Both are values here for that reason.
//!
//! `NO_USABLE_DESCRIPTORS` and `PRODUCER_MISMATCH` are deliberately absent.
//! §6.2 defines both as outcomes of choosing a descriptor set against a runtime
//! backend's capabilities (§6.3), and nothing in this crate knows what a backend
//! can consume — §8.1 makes the same point when it exempts
//! `NO_USABLE_DESCRIPTORS` from "one fixture per error code". Listing them here
//! would promise a decode path that cannot produce them.

use alloc::string::String;
use alloc::vec::Vec;

use crate::target::Target;

/// Every failure this codec can report (§6.2, §7.3).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ErrorCode {
    /// `magic` is not `"WKNF"`.
    BadMagic,
    /// `container_major` is one this build does not frame.
    UnsupportedContainer,
    /// Framing broken: length mismatch, chunk out of bounds, `JSON` missing or
    /// duplicated, `BIN\0` duplicated or out of place, non-zero reserved field.
    BadContainer,
    /// A chunk's CRC-32 does not match.
    ChecksumMismatch,
    /// The `JSON` chunk is above the manifest limit.
    ManifestTooLarge,
    /// Not strict UTF-8, not JSON, not I-JSON, not an object, a required key
    /// missing, a wrong type, or a value outside the domain its section fixes.
    BadManifest,
    /// `format.version` is not the one this build supports (§7.1).
    UnsupportedFormatVersion,
    /// A name in `extensionsRequired` this build does not implement.
    UnsupportedExtension,
    /// An accessor out of bounds, misaligned, overlapping, or with the wrong
    /// type or count.
    BadLayout,
    /// A count or size above the resource limits (§6.4).
    LimitExceeded,
    /// A rule of §6.1 step 7 violated, or a duplicate descriptor-set key.
    InconsistentData,
    /// The writer's own: a target a conforming reader would reject (§7.3).
    InvalidTarget,
}

impl ErrorCode {
    /// The code's spelling in §6.2, identical across implementations.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::BadMagic => "BAD_MAGIC",
            Self::UnsupportedContainer => "UNSUPPORTED_CONTAINER",
            Self::BadContainer => "BAD_CONTAINER",
            Self::ChecksumMismatch => "CHECKSUM_MISMATCH",
            Self::ManifestTooLarge => "MANIFEST_TOO_LARGE",
            Self::BadManifest => "BAD_MANIFEST",
            Self::UnsupportedFormatVersion => "UNSUPPORTED_FORMAT_VERSION",
            Self::UnsupportedExtension => "UNSUPPORTED_EXTENSION",
            Self::BadLayout => "BAD_LAYOUT",
            Self::LimitExceeded => "LIMIT_EXCEEDED",
            Self::InconsistentData => "INCONSISTENT_DATA",
            Self::InvalidTarget => "INVALID_TARGET",
        }
    }
}

impl core::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Warnings a successful decode can carry (§6.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum WarningCode {
    /// A chunk of a type this build does not know, skipped whole.
    UnknownChunkSkipped,
    /// A name in `extensionsUsed` but not `extensionsRequired` that this build
    /// does not implement. Its payloads are ignored and the name is pruned from
    /// the decoded `extensions_used` (§7.3).
    UnknownExtensionIgnored,
    /// A set with an unknown `kind`, `norm` or `elementType` (§5.6).
    UnsupportedDescriptorSet,
}

impl WarningCode {
    /// The code's spelling in §6.2, identical across implementations.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnknownChunkSkipped => "UNKNOWN_CHUNK_SKIPPED",
            Self::UnknownExtensionIgnored => "UNKNOWN_EXTENSION_IGNORED",
            Self::UnsupportedDescriptorSet => "UNSUPPORTED_DESCRIPTOR_SET",
        }
    }
}

impl core::fmt::Display for WarningCode {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// One warning. `detail` names what triggered it — a chunk type, an extension
/// name, a descriptor-set index — because acting on a warning needs to know
/// which thing it was about (§6.2).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Warning {
    /// The code.
    pub code: WarningCode,
    /// What triggered it.
    pub detail: String,
}

/// A decode failure. `detail` is free text for a human or a log; only `code` is
/// part of the cross-implementation contract.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodeError {
    /// The code (§6.2).
    pub code: ErrorCode,
    /// Free text naming what failed.
    pub detail: String,
}

/// An encode failure (§7.3). `code` is always [`ErrorCode::InvalidTarget`], and
/// `detail` names the offending field path, e.g.
/// `"descriptorSets[1].params.seed"`, so the caller can find the value without
/// re-validating the target itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncodeError {
    /// Always [`ErrorCode::InvalidTarget`].
    pub code: ErrorCode,
    /// The offending field path.
    pub detail: String,
}

/// A successful decode: the target, and every warning the file raised.
#[derive(Clone, Debug, PartialEq)]
pub struct Decoded {
    /// The decoded target.
    pub target: Target,
    /// Warnings, in the order the reader raised them (§6.2).
    pub warnings: Vec<Warning>,
}

impl core::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

impl core::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

#[cfg(feature = "std")]
impl std::error::Error for DecodeError {}

#[cfg(feature = "std")]
impl std::error::Error for EncodeError {}

/// Build a [`DecodeError`]. Shorthand used throughout the codec.
pub(crate) fn fail(code: ErrorCode, detail: impl Into<String>) -> DecodeError {
    DecodeError { code, detail: detail.into() }
}
```

**Note for this step:** `Decoded` references `crate::target::Target`, which Task 5 creates. Write `error.rs` in full now, but comment out **three things together**, as one block under a single `// Task 5: uncomment with `Decoded`.` marker: the `use crate::target::Target;` line, the `use alloc::vec::Vec;` line, and the `Decoded` struct. `Vec` is used *only* by `Decoded`, so leaving its import behind is an unused-import warning — and `-D warnings` would fail the very build this task ends with. Task 5 step 4 uncomments all three. The rest of the file compiles on its own.

Also add, at the top of `lib.rs` after `extern crate alloc;`:

```rust
#[cfg(feature = "std")]
extern crate std;
```

- [ ] **Step 4: Write `src/limits.rs`**

```rust
//! Resource limits (§6.4).
//!
//! A `.wnft` may come from a URL an application's user chose, so the reader is
//! exposed to untrusted input and must refuse to allocate in proportion to a
//! number it has not yet accepted. §6.4 requires these limits to be enforced
//! *and* to be configurable: a build serving files it produced itself can raise
//! them; an application loading a URL a user typed should not.

/// The limits a decode enforces.
///
/// Deliberately **not** `#[non_exhaustive]`, unlike the error enums: §6.4
/// requires these to be configurable, and the natural way to configure one is
/// `Limits { max_keypoints: 4, ..DEFAULT_LIMITS }` — which `#[non_exhaustive]`
/// forbids outside this crate. A field added later is a breaking change here,
/// and that is the right trade for a struct whose whole purpose is to be built
/// by the caller.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    /// The whole file, in bytes. Checked at §6.1 step 0, before a single byte is
    /// read — which is why a file past this limit reports `LIMIT_EXCEEDED` and
    /// not `BAD_MAGIC`, even when it is not a `.wnft` at all.
    pub max_file_bytes: usize,
    /// The `JSON` chunk, in bytes. Checked before the manifest is decoded.
    pub max_manifest_bytes: usize,
    /// Pyramid levels, `L`.
    pub max_levels: usize,
    /// Keypoints per file, `N`.
    pub max_keypoints: u32,
    /// Descriptor sets per file.
    pub max_descriptor_sets: usize,
    /// The patch edge, `P`.
    pub max_patch_size: u32,
    /// The number of patches, `Q`. Bounded transitively anyway — `Q × P × P`
    /// pixel bytes have to exist in the `BIN` chunk — but §6.4 exists so that a
    /// reader checks a count rather than reasoning about what some other check
    /// implies.
    pub max_patches: u32,
}

/// The defaults §6.4 suggests.
pub const DEFAULT_LIMITS: Limits = Limits {
    max_file_bytes: 64 * 1024 * 1024,
    max_manifest_bytes: 1024 * 1024,
    max_levels: 32,
    max_keypoints: 1_000_000,
    max_descriptor_sets: 16,
    max_patch_size: 64,
    max_patches: 65_536,
};

impl Default for Limits {
    fn default() -> Self {
        DEFAULT_LIMITS
    }
}
```

- [ ] **Step 5: Wire the modules into `lib.rs`**

Add to `src/lib.rs`:

```rust
mod error;
mod limits;

pub use error::{DecodeError, EncodeError, ErrorCode, Warning, WarningCode};
pub use limits::{DEFAULT_LIMITS, Limits};
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format
```

Expected: PASS, 6 tests (3 from `crc32`, 3 from `vocabulary`).

- [ ] **Step 7: Commit**

```bash
git add crates/wnft-format
git commit -m "feat(wnft-format): add the error vocabulary and the resource limits

The codes of §6.2 are shared across implementations, so their spelling is
part of the contract and is pinned by a test. NO_USABLE_DESCRIPTORS and
PRODUCER_MISMATCH are absent on purpose: both are outcomes of choosing a set
against a runtime backend's capabilities (§6.3), and this crate knows nothing
about a backend — §8.1 exempts the first from 'one fixture per error code'
for the same reason.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The container — §4 and §6.1 steps 1–2

Framing, and nothing else. This layer knows byte offsets, chunk headers and CRC-32; it knows nothing about JSON, accessors or targets. §2 requires a reader to reject a container it cannot frame *before* it looks for the manifest, and that split is what makes it possible.

**Files:**
- Create: `crates/wnft-format/src/container.rs`
- Create: `crates/wnft-format/src/known.rs`
- Modify: `crates/wnft-format/src/lib.rs`
- Test: `crates/wnft-format/tests/container.rs`

**Interfaces:**
- Consumes: `crc32` (Task 1); `ErrorCode`, `DecodeError`, `fail` (Task 2).
- Produces (all `pub` in private modules — see Global Constraints):
  - `struct Chunk { pub kind: [u8; 4], pub data_start: usize, pub length: usize }`, deriving `Clone, Copy, Debug, PartialEq, Eq`. `Copy` is load-bearing: `decode` and the tests both read `parsed.json` and `parsed.bin` independently, and without it the first read moves the field.
  - `struct ParsedContainer { pub json: Chunk, pub bin: Option<Chunk>, pub unknown: Vec<Chunk> }`
  - `fn parse_container(bytes: &[u8]) -> Result<ParsedContainer, DecodeError>`
  - `fn build_container(json: &[u8], bin: Option<&[u8]>) -> Vec<u8>`
  - `fn align8(n: usize) -> Option<usize>`
  - `known.rs`: `const SUPPORTED_FORMAT_VERSION: &str = "0.2";`, `const SUPPORTED_CONTAINER_MAJOR: u16 = 1;`, `MAGIC`, `JSON_TYPE`, `BIN_TYPE`, and the known-family lists Task 6 uses.

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/container.rs`. It reads real fixtures, so add the shared helper module first — `crates/wnft-format/tests/common/mod.rs`:

```rust
//! Locating the shared conformance corpus.
//!
//! `fixtures/nft-target/0.2/` was generated by the TypeScript implementation.
//! This crate consumes it and never regenerates it: a second implementation
//! that rebuilt the corpus from its own writer would be checking itself against
//! itself, and §8.2 item 4 would prove nothing.

use std::path::{Path, PathBuf};

/// The corpus root, resolved from the crate rather than the current directory.
pub fn corpus() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/nft-target/0.2")
        .canonicalize()
        .expect("the 0.2 fixture corpus must be present")
}

/// One fixture's bytes, by its path relative to the corpus root.
pub fn read(relative: &str) -> Vec<u8> {
    let path = corpus().join(relative);
    std::fs::read(&path).unwrap_or_else(|e| panic!("reading {}: {e}", path.display()))
}
```

`crates/wnft-format/tests/container.rs`:

```rust
//! §6.1 steps 1 and 2, against the fixtures that exercise them.

mod common;

use wnft_format::testing::parse_container;
use wnft_format::ErrorCode;

fn code(relative: &str) -> ErrorCode {
    parse_container(&common::read(relative))
        .expect_err("this fixture must not frame")
        .code
}

#[test]
fn a_valid_file_frames_into_json_then_bin() {
    let bytes = common::read("valid/minimal.wnft");
    let parsed = parse_container(&bytes).expect("minimal.wnft must frame");
    assert_eq!(&parsed.json.kind, b"JSON");
    assert_eq!(parsed.json.data_start, 32, "16-byte file header + 16-byte chunk header");
    let bin = parsed.bin.expect("minimal.wnft has a BIN chunk");
    assert_eq!(&bin.kind, b"BIN\0");
    assert!(parsed.unknown.is_empty());
    // §4.2: chunk data starts 8-aligned, so a reader could view it.
    assert_eq!(parsed.json.data_start % 8, 0);
    assert_eq!(bin.data_start % 8, 0);
}

#[test]
fn each_framing_fixture_yields_its_code() {
    assert_eq!(code("invalid/bad-magic.wnft"), ErrorCode::BadMagic);
    assert_eq!(
        code("invalid/unsupported-container.wnft"),
        ErrorCode::UnsupportedContainer
    );
    assert_eq!(
        code("invalid/bad-container-total-length.wnft"),
        ErrorCode::BadContainer
    );
    assert_eq!(code("invalid/bad-container-flags.wnft"), ErrorCode::BadContainer);
    assert_eq!(
        code("invalid/bad-container-json-not-first.wnft"),
        ErrorCode::BadContainer
    );
    assert_eq!(code("invalid/checksum-mismatch.wnft"), ErrorCode::ChecksumMismatch);
}

#[test]
fn an_unknown_chunk_is_reported_not_rejected() {
    // §4.2: an unknown chunk is ignored by readers, and may sit second when the
    // file has no BIN chunk. It warrants a warning, which decode() raises.
    let bytes = common::read("warnings/unknown-chunk.wnft");
    let parsed = parse_container(&bytes).expect("an unknown chunk must not break framing");
    assert_eq!(parsed.unknown.len(), 1);
}

#[test]
fn truncating_at_every_byte_never_panics() {
    // §8.4: "every valid fixture, truncated at every byte offset, yields
    // ok: false and never throws."
    //
    // **Not panicking is the claim that matters**, and it is the weaker one: a
    // reader that rejected everything would satisfy `is_err` and still be
    // useless, whereas one that unwinds on a truncated download has failed at
    // the thing §6.1 exists to guarantee. In Rust the assertion is the call
    // itself — an unwinding panic in a test thread fails the test — so every
    // iteration below asserts it by completing.
    let bytes = common::read("valid/minimal.wnft");
    for cut in 0..=bytes.len() {
        let head = bytes.get(..cut).expect("cut is within the buffer");
        let result = parse_container(head); // the no-panic assertion

        if cut == bytes.len() {
            // The positive control: the same loop, at full length, must frame.
            // Without it the test passes just as well against a `parse_container`
            // that returns Err unconditionally.
            assert!(result.is_ok(), "the untruncated file must frame");
        } else {
            // A consequence, not the point — and it holds here for a specific
            // reason worth stating: §4.1 requires `total_length` to equal the
            // buffer length, so no proper prefix of a valid file can itself be
            // a valid file. If that rule ever changes, this branch is what goes,
            // and the no-panic claim above stays.
            assert!(
                result.is_err(),
                "a {cut}-byte prefix must not frame as a whole file"
            );
        }
    }
}

#[test]
fn round_trips_through_build_container() {
    let bytes = common::read("valid/minimal.wnft");
    let parsed = parse_container(&bytes).expect("minimal.wnft must frame");
    let json = bytes
        .get(parsed.json.data_start..parsed.json.data_start + parsed.json.length)
        .expect("the JSON chunk is in bounds");
    let bin = parsed.bin.map(|b| {
        bytes
            .get(b.data_start..b.data_start + b.length)
            .expect("the BIN chunk is in bounds")
            .to_vec()
    });
    let rebuilt = wnft_format::testing::build_container(json, bin.as_deref());
    assert_eq!(rebuilt, bytes, "framing is deterministic and canonical (§7.3)");
}
```

`wnft_format::testing` is a `#[doc(hidden)]` module re-exporting the internals the test suites need. Add to `lib.rs`:

```rust
/// Internals the crate's own test suites reach for. Not part of the public API
/// and not covered by semver: the two public functions are `decode` and
/// `encode`.
#[doc(hidden)]
pub mod testing {
    pub use crate::container::{Chunk, ParsedContainer, build_container, parse_container};
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test container
```

Expected: FAIL — `unresolved import wnft_format::testing`.

- [ ] **Step 3: Write `src/known.rs`**

**Before writing the two family lists, read the unions they transcribe:**

```bash
grep -n "export type DescriptorKind\|export type DescriptorNorm" packages/cv-backend-spec/src/cv_backend.ts
```

At the time of writing, [`cv_backend.ts:111`](../../../packages/cv-backend-spec/src/cv_backend.ts:111) defines `DescriptorKind = "orb" | "freak" | "beblid" | "teblid" | "akaze"` and `DescriptorNorm = "hamming" | "l2"` — exactly the lists below. **If either union now differs, stop and report it before committing.** A kind in one codec's list and not the other's makes one warn and drop a set the other accepts, on a file no fixture contains, and the shared corpus cannot catch it.

```rust
//! What this build recognises.
//!
//! §5.6 needs at run time what the format's prose gives as a list: whether a
//! set's family, metric or element type is one this reader knows decides
//! whether the set is usable, preserved, or dropped.

/// The only `format.version` this build reads or writes (§7.1).
pub(crate) const SUPPORTED_FORMAT_VERSION: &str = "0.2";

/// The only `container_major` this build frames (§7.1). Any `container_minor` is
/// accepted: a newer minor only adds chunks a reader can skip.
pub(crate) const SUPPORTED_CONTAINER_MAJOR: u16 = 1;

/// `"WKNF"` (§4.1).
pub(crate) const MAGIC: [u8; 4] = *b"WKNF";

/// The `JSON` chunk type (§4.2).
pub(crate) const JSON_TYPE: [u8; 4] = *b"JSON";

/// The `BIN\0` chunk type (§4.2).
pub(crate) const BIN_TYPE: [u8; 4] = [b'B', b'I', b'N', 0];

/// Descriptor families this build recognises. A set whose `kind` is not here
/// stays **present but unusable**, with `UNSUPPORTED_DESCRIPTOR_SET` (§5.6): its
/// element width is still known, so it round-trips unchanged.
///
/// **Source of truth: the `DescriptorKind` union in
/// `packages/cv-backend-spec/src/cv_backend.ts`.** This list is a transcription
/// of it and must be resynced whenever that union changes — the TypeScript codec
/// pins the correspondence with a type-level exhaustiveness check, and Rust has
/// no view of the union at all, so here it is maintained by hand.
///
/// Getting it wrong is a divergence the shared corpus **cannot catch**: a kind
/// present in one list and missing from the other makes one codec warn and drop
/// a set the other accepts, on a file no fixture contains. Check the union, do
/// not recall it.
pub(crate) const KNOWN_DESCRIPTOR_KINDS: &[&str] =
    &["orb", "freak", "beblid", "teblid", "akaze"];

/// Distance metrics this build recognises. Same source of truth: the
/// `DescriptorNorm` union in `packages/cv-backend-spec/src/cv_backend.ts`, and
/// the same resync obligation.
///
/// §5.6's prose lists `"hamming2"` among the possibilities and it is
/// deliberately **not** here: the contract's `DescriptorNorm` does not define
/// it, so a set using it is one this reader does not know — warned about and
/// preserved. That is the rule working, not a gap in this list.
pub(crate) const KNOWN_DESCRIPTOR_NORMS: &[&str] = &["hamming", "l2"];

/// Element types the format defines (§5.6). Unlike `kind` and `norm`, an
/// unknown one makes a set uninterpretable, so such a set is dropped.
pub(crate) const KNOWN_ELEMENT_TYPES: &[&str] = &["bits", "u8", "f32"];

/// Extensions this build implements — none, because format 0.2 defines none to
/// implement.
///
/// `WKNF_multiview` is the only extension §5.6 names, and in 0.2 it defines **no
/// payload**: it is purely a permission, relaxing the `M = N` and identity-
/// `kpIndex` rules for a file that lists it in `extensionsRequired`. There is
/// nothing here for a codec to implement, and nothing this list could truthfully
/// claim. (What is blocked on k-nearest matching in the contract, Q3, is a
/// *tracker's* ability to run a correct ratio test over multi-view rows — not
/// this crate, which performs no matching at all.)
///
/// The consequences are exactly the specified ones: the name in
/// `extensionsRequired` gives `UNSUPPORTED_EXTENSION`, in `extensionsUsed` alone
/// it is pruned with `UNKNOWN_EXTENSION_IGNORED`, and `M != N` or a non-identity
/// `kpIndex` is therefore always `INCONSISTENT_DATA`.
pub(crate) const IMPLEMENTED_EXTENSIONS: &[&str] = &[];
```

- [ ] **Step 4: Write `src/container.rs`**

The rules to implement, in order, straight from §4 and §6.1 steps 1–2:

1. `bytes.len() >= 16`, else `BAD_CONTAINER`.
2. `magic == b"WKNF"`, else `BAD_MAGIC`.
3. `container_major == 1`, else `UNSUPPORTED_CONTAINER`. `container_minor` (offset 6) is read and ignored.
4. `total_length` (u32 at 8) equals `bytes.len()`, else `BAD_CONTAINER`.
5. `flags` (u32 at 12) is `0`, else `BAD_CONTAINER`.
6. Walk chunks from offset 16 to `total_length`: each needs 16 header bytes in bounds; `reserved` (u32 at +12) is `0`; `data_start + align8(chunk_length)` is within `total_length`. Any failure is `BAD_CONTAINER`.
7. First chunk is `JSON` and there is exactly one, else `BAD_CONTAINER`.
8. At most one `BIN\0`, and if present it is at index 1, else `BAD_CONTAINER`.
9. CRC-32 of the `JSON` chunk's data, and the `BIN\0` chunk's if present, against the stored value — else `CHECKSUM_MISMATCH`. **Not** the unknown chunks': a chunk skipped whole would otherwise reject a file over bytes this reader never reads.

The skeleton, with the parts that are easy to get wrong written out:

```rust
/// Round up to a multiple of 8 — the padding rule of §4.2. `None` on overflow,
/// which a `chunk_length` near `u32::MAX` reaches on a 32-bit target.
pub(crate) fn align8(n: usize) -> Option<usize> {
    n.checked_add(7).map(|m| m & !7)
}

/// Read a little-endian `u32` at `at`, by copy — never a pointer cast (§3).
fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    let end = at.checked_add(4)?;
    let slice = bytes.get(at..end)?;
    let array: [u8; 4] = slice.try_into().ok()?;
    Some(u32::from_le_bytes(array))
}

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    let end = at.checked_add(2)?;
    let slice = bytes.get(at..end)?;
    let array: [u8; 2] = slice.try_into().ok()?;
    Some(u16::from_le_bytes(array))
}

fn type_at(bytes: &[u8], at: usize) -> Option<[u8; 4]> {
    let end = at.checked_add(4)?;
    bytes.get(at..end)?.try_into().ok()
}
```

`parse_container` uses only those three readers plus `.get()`, so a truncated or hostile buffer produces a `DecodeError` rather than a panic — which is what lets `decode` promise never to unwind.

`build_container` is the framing half of the canonical writer (§7.3): header, then `JSON` padded with `0x20`, then `BIN\0` padded with `0x00`, and no other chunk. `bin` is `Some(&[])` for a manifest that declares only zero-length accessors — a present, zero-length chunk and an absent one are different files, and §5.2 rev 2 distinguishes them.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test container
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Format, lint, and re-check `no_std`**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
```

- [ ] **Step 7: Commit**

```bash
git add crates/wnft-format
git commit -m "feat(wnft-format): frame the container (§4, §6.1 steps 1-2)

Byte offsets, chunk headers and CRC-32; no JSON, no accessors, no target.
§2 requires a reader to reject a container it cannot frame before it looks
for the manifest, and that split is what makes it possible. Every read goes
through a bounds-checked helper that copies rather than casts, so the
truncation test of §8.4 returns errors instead of unwinding.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The I-JSON scan — §5 checks (a)–(e)

The five checks §5 requires, in one pass over the manifest **text**. Two of them cannot be done any other way: after parsing, a duplicate member name is gone, and an integer literal outside ±(2^53 − 1) has already been rounded.

**Files:**
- Create: `crates/wnft-format/src/ijson.rs`
- Modify: `crates/wnft-format/src/lib.rs`
- Test: `crates/wnft-format/tests/ijson.rs`

**Interfaces:**
- Consumes: `parse_container` (Task 3), to pull the `JSON` chunk out of a fixture.
- Produces:
  - `pub(crate) struct IJsonViolation { pub path: String, pub reason: String }`
  - `pub(crate) fn scan_ijson(text: &str) -> Option<IJsonViolation>`
  - `pub(crate) const MAX_EXACT_INTEGER: i64 = 9_007_199_254_740_991;`
  - `pub(crate) fn has_unpaired_surrogate(s: &str) -> bool` — always `false` for a `&str` (Rust strings cannot hold one), so the function exists for the *escape* case only and is called on the **unescaped** value the scanner builds, which is a `String` assembled from `\u` escapes and therefore can.
  - `pub(crate) fn has_noncharacter(s: &str) -> bool`

  **Rust-specific note:** a `&str` is well-formed UTF-8 by construction, so check (b) can only fire on a string the scanner built from `\u` escapes. The scanner therefore decodes `\uXXXX` escapes into a `Vec<u16>` of UTF-16 code units and validates *that*, rather than trying to build a `String` — because building one is exactly what a lone surrogate makes impossible. That is the one place where this implementation's shape necessarily differs from the TypeScript's, and it is a consequence of the language, not of the specification.

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/ijson.rs`:

```rust
//! §5 checks (a) to (e), against the seven fixtures §8.1 requires for them.

mod common;

use wnft_format::testing::{parse_container, scan_ijson};

/// The manifest text of a fixture, straight out of its JSON chunk.
fn manifest(relative: &str) -> String {
    let bytes = common::read(relative);
    let parsed = parse_container(&bytes).expect("the fixture must frame");
    let start = parsed.json.data_start;
    let end = start + parsed.json.length;
    let chunk = bytes.get(start..end).expect("the JSON chunk is in bounds");
    String::from_utf8(chunk.to_vec()).expect("these fixtures are valid UTF-8")
}

fn violates(relative: &str) {
    assert!(
        scan_ijson(&manifest(relative)).is_some(),
        "{relative} must fail an I-JSON check"
    );
}

#[test]
fn check_a_rejects_a_duplicate_member_name() {
    violates("invalid/ijson-duplicate-key.wnft");
}

#[test]
fn check_a_compares_names_after_unescaping() {
    // "a" and "\u0061" are the same name. This catches an implementation that
    // compared the raw text instead of the unescaped names (§5 (a), §8.1).
    violates("invalid/ijson-duplicate-key-escaped.wnft");
}

#[test]
fn check_b_rejects_an_unpaired_surrogate_escape() {
    violates("invalid/ijson-unpaired-surrogate.wnft");
}

#[test]
fn check_c_rejects_an_integer_literal_at_two_to_the_53() {
    violates("invalid/ijson-integer-2p53.wnft");
}

#[test]
fn check_c_accepts_the_largest_exactly_representable_integer() {
    // The boundary file carries 9007199254740991 = 2^53 - 1, which MUST decode:
    // it catches an off-by-one in check (c) (§8.1).
    assert!(
        scan_ijson(&manifest("valid/boundary-max-safe-integer.wnft")).is_none(),
        "2^53 - 1 is exactly representable and must pass"
    );
}

#[test]
fn check_d_rejects_a_literal_that_rounds_to_infinity() {
    violates("invalid/ijson-infinity.wnft");
}

#[test]
fn check_e_rejects_a_raw_noncharacter_in_a_value() {
    // A noncharacter is well-formed UTF-8 and passes the strict decoding of
    // step 4, so only check (e) catches it (§5 (e), §8.1).
    violates("invalid/ijson-raw-noncharacter.wnft");
}

#[test]
fn check_e_rejects_an_escaped_noncharacter_in_a_member_name() {
    violates("invalid/ijson-noncharacter-in-name.wnft");
}

#[test]
fn every_valid_and_noncanonical_fixture_passes_every_check() {
    for relative in [
        "valid/minimal.wnft",
        "valid/several-sets.wnft",
        "valid/single-level.wnft",
        "valid/zero-keypoints.wnft",
        "valid/no-patches.wnft",
        "valid/reference-image.wnft",
        "valid/params-numeric-keys.wnft",
        "noncanonical/key-order.wnft",
        "noncanonical/whitespace.wnft",
        "noncanonical/explicit-empty-params.wnft",
        "noncanonical/unknown-top-level-key.wnft",
        "noncanonical/unknown-extension-payload.wnft",
        "noncanonical/unsorted-params.wnft",
    ] {
        assert!(
            scan_ijson(&manifest(relative)).is_none(),
            "{relative} must pass every I-JSON check"
        );
    }
}

#[test]
fn a_literal_rounding_to_zero_is_accepted() {
    // §5 (d): "Literals that round to zero (e.g. 1e-400) are fine: every
    // implementation reads 0." Only (d) bounds magnitude, and only upward.
    assert!(scan_ijson(r#"{"a":1e-400}"#).is_none());
}

#[test]
fn deeply_nested_input_terminates() {
    // §6.1 step 4: a RangeError from pathological nesting is BAD_MANIFEST, so
    // the scan is iterative with an explicit stack and must not blow the Rust
    // stack either.
    let deep = "[".repeat(100_000) + &"]".repeat(100_000);
    let _ = scan_ijson(&deep); // must return, either way, without overflowing
}
```

Add `scan_ijson` to the `testing` module in `lib.rs`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test ijson
```

Expected: FAIL — `unresolved import wnft_format::testing::scan_ijson`.

- [ ] **Step 3: Write `src/ijson.rs`**

The checks, restated from §5 so the implementer does not have to re-derive them:

- **(a)** Duplicate member names in any object, **compared after unescaping**. `"a"` and `"\u0061"` are the same name. At every level, `params` and `info` included.
- **(b)** Strings containing an **unpaired surrogate written as an escape** (`"\uD800"`). A raw one is already rejected by the strict UTF-8 decoding of step 4.
- **(c)** **Integer literals** — no fraction, no exponent — outside ±(2^53 − 1).
- **(d)** Number literals whose nearest IEEE 754 double is **infinite** (e.g. `1e400`). Literals rounding to **zero** are fine.
- **(e)** Strings containing a **Unicode noncharacter**, in member names as well as values: U+FDD0..U+FDEF, and U+xFFFE / U+xFFFF at the end of every plane. Well-formed UTF-8, so this applies to raw text as much as to escapes.

Shape:

```rust
/// The largest integer an IEEE 754 double represents exactly — check (c).
pub(crate) const MAX_EXACT_INTEGER: i64 = 9_007_199_254_740_991;

/// Where a violation sits, e.g. `$.descriptorSets[0].params.seed`, and why.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct IJsonViolation {
    pub path: String,
    pub reason: String,
}

/// The scanner's own representation of a JSON string: UTF-16 code units, because
/// a lone surrogate is exactly what a Rust `String` cannot hold, and check (b)
/// exists to find one.
type Utf16 = Vec<u16>;

/// Check (b): a high surrogate not followed by a low one, or a low one alone.
fn has_unpaired_surrogate(units: &[u16]) -> bool { /* … */ }

/// Check (e): the 66 noncharacters. The plane-end families are recognised
/// through the low surrogate alone — in UTF-16 the low unit of U+xFFFE is always
/// 0xDFFE and of U+xFFFF always 0xDFFF, whatever the plane, and no other code
/// point pairs to either. Comparing code units numerically also keeps this
/// source file free of a literal noncharacter, which editors, git filters and
/// terminals all handle differently.
fn has_noncharacter(units: &[u16]) -> bool { /* … */ }

/// The five checks, in one pass. `None` when the text passes all five.
///
/// The scan is **iterative, with an explicit stack**, so pathological nesting
/// terminates rather than overflowing (§6.1 step 4).
///
/// It rejects malformed JSON too, which makes it a syntax check — but the
/// caller still parses with `serde_json` afterwards, because agreeing with
/// `serde_json` on every malformed input is not something this function
/// promises.
pub(crate) fn scan_ijson(text: &str) -> Option<IJsonViolation> { /* … */ }
```

Implementation notes that are not obvious:

- Iterate `text.as_bytes()` with an index, not `chars()`: the structural characters are all ASCII, and a string's contents are copied out as UTF-16 units. Non-ASCII bytes inside a string are decoded from UTF-8 to UTF-16 via `char::encode_utf16`; iterate `text[i..].chars().next()` to get the char and advance by `len_utf8()`.
- For check (c), parse the integer literal with `str::parse::<i128>()` rather than `i64`, so a literal far outside the range is still comparable rather than an `Err` you would have to special-case. On `Err` (a literal longer than `i128` holds), the value is certainly outside ±(2^53 − 1) — report the violation.
- For check (d), `lit.parse::<f64>()` and test `is_infinite()`. A `str` that `serde_json` would accept always parses here.
- Member names go through the same `checkString` path as values: check (e) covers names explicitly, and the unescaped name is what the duplicate set stores.
- Track a path string per frame (`$`, `$.meta`, `$.accessors[3]`) for the `detail`; it is free text, not part of the contract, but it is what makes a failure diagnosable.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test ijson
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Format, lint, re-check `no_std`, commit**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
git add crates/wnft-format
git commit -m "feat(wnft-format): scan the manifest text for the five I-JSON checks (§5)

Two of the five cannot be done after parsing: a duplicate member name is
gone, and an integer literal outside ±(2^53 − 1) has already been rounded.
The scanner keeps strings as UTF-16 code units rather than as Rust Strings,
because a lone surrogate is precisely what a String cannot hold and check (b)
exists to find one — the one place the shape of this implementation differs
from the TypeScript's by necessity rather than by choice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The decoded target, and accessor materialisation

The in-memory shape a decode produces and an encode consumes, plus the one function that turns an accessor into an owned array.

**Files:**
- Create: `crates/wnft-format/src/target.rs`
- Create: `crates/wnft-format/src/arrays.rs`
- Modify: `crates/wnft-format/src/lib.rs`, `crates/wnft-format/src/error.rs` (uncomment `Decoded`)
- Test: `crates/wnft-format/tests/arrays.rs`

**Interfaces:**
- Consumes: nothing from Tasks 3–4.
- Produces, from `target.rs` (all `pub`, all fields `pub`, all deriving `Clone, Debug, PartialEq`):

```rust
pub struct Target {
    pub format_version: String,
    pub generator: Option<String>,
    pub extensions_used: Vec<String>,
    pub extensions_required: Vec<String>,
    pub meta: Meta,
    pub pyramid: Pyramid,
    pub keypoints: Keypoints,
    pub descriptor_sets: Vec<DescriptorSet>,
    pub patches: Option<Patches>,
    pub reference_image: Option<ReferenceImage>,
    pub info: Option<Params>,
}

/// Free-form content (§5.5, §5.6, §5.9). `serde_json::Map` is a `BTreeMap`
/// unless the `preserve_order` feature is on, which it deliberately is not:
/// §7.3 requires keys sorted by Unicode code point, and for valid UTF-8 that is
/// exactly Rust's byte order on `String`. The canonical sort is therefore a
/// property of the container, not a step the writer has to remember.
pub type Params = serde_json::Map<String, serde_json::Value>;

pub struct Meta { pub width_px: u32, pub height_px: u32, pub physical_size_mm: Option<[f64; 2]> }
pub struct Pyramid { pub scale_step: f64, pub level_sizes: Vec<[u32; 2]> }
pub struct Detector { pub kind: String, pub params: Params }

pub struct Keypoints {
    pub count: u32,
    pub detector: Detector,
    pub level_start: Vec<u32>,   // L + 1
    pub x: Vec<f32>, pub y: Vec<f32>, pub angle: Vec<f32>, pub score: Vec<f32>,
    pub size: Option<Vec<f32>>,
    pub level: Vec<u8>,
}

/// The element array, discriminated by `elementType` exactly as §5.6 is.
///
/// A fourth "unknown" variant would be unreachable: §5.6 drops a set whose
/// `elementType` the reader does not know, so such a set never reaches this
/// type. An unknown `kind` or `norm`, by contrast, leaves the set structurally
/// understood, which is why those two are plain `String`s.
pub enum DescriptorData { Bits(Vec<u8>), U8(Vec<u8>), F32(Vec<f32>) }

impl DescriptorData {
    pub fn element_type(&self) -> &'static str;  // "bits" | "u8" | "f32"
    pub fn len(&self) -> usize;
    pub fn is_empty(&self) -> bool;
}

pub struct DescriptorSet {
    pub kind: String, pub norm: String,
    pub dimensions: u32, pub bytes_per_descriptor: u32,
    pub producer: String, pub params: Params,
    pub count: u32,
    pub level_start: Vec<u32>,   // L + 1
    pub kp_index: Vec<u32>,      // M
    pub data: DescriptorData,
}

pub struct Patches {
    pub patch_size: u32, pub count: u32,
    pub score: Vec<f32>, pub left: Vec<u16>, pub top: Vec<u16>, pub level: Vec<u8>,
    pub pixels: Vec<u8>,         // Q × P × P
}

pub struct ReferenceImage { pub level: u32, pub width: u32, pub height: u32, pub pixels: Vec<u8> }
```

- Produces, from `arrays.rs`:
  - `pub(crate) enum AccessorArray { U8(Vec<u8>), U16(Vec<u16>), U32(Vec<u32>), F32(Vec<f32>) }`
  - `pub(crate) fn materialise(bin: &[u8], accessor: &Accessor) -> Option<AccessorArray>` — `None` when the accessor does not fit, which the manifest layer has already ruled out; the `Option` is the belt to that braces.
  - `pub(crate) const fn element_size(ty: AccessorType) -> usize`

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/arrays.rs`:

```rust
//! §3: unaligned reads are done by copying, never by casting.
//!
//! In Rust the question the TypeScript codec has to answer — view or copy? —
//! does not arise: every accessor is copied out with `from_le_bytes`, so an
//! offset that is odd, or a `BIN` chunk that begins anywhere at all, reads the
//! same values as an aligned one. These tests say that in the form of an
//! assertion rather than a comment.

use wnft_format::testing::{Accessor, AccessorArray, AccessorType, materialise};

#[test]
fn reads_little_endian_regardless_of_alignment() {
    // 0x04030201 and 0x08070605, twice: once at offset 0, once at offset 1.
    let aligned = [1u8, 2, 3, 4, 5, 6, 7, 8];
    let shifted = [0u8, 1, 2, 3, 4, 5, 6, 7, 8];

    let at_zero = materialise(
        &aligned,
        &Accessor { offset: 0, count: 2, ty: AccessorType::U32 },
    )
    .expect("in bounds");
    let at_one = materialise(
        &shifted,
        &Accessor { offset: 1, count: 2, ty: AccessorType::U32 },
    )
    .expect("in bounds");

    let expected = AccessorArray::U32(vec![0x0403_0201, 0x0807_0605]);
    assert_eq!(at_zero, expected);
    assert_eq!(at_one, expected, "an odd offset must read the same values");
}

#[test]
fn reads_every_element_type() {
    let bin = [0x00u8, 0x00, 0x80, 0x3F, 0x01, 0x02];
    assert_eq!(
        materialise(&bin, &Accessor { offset: 0, count: 1, ty: AccessorType::F32 }),
        Some(AccessorArray::F32(vec![1.0]))
    );
    assert_eq!(
        materialise(&bin, &Accessor { offset: 4, count: 1, ty: AccessorType::U16 }),
        Some(AccessorArray::U16(vec![0x0201]))
    );
    assert_eq!(
        materialise(&bin, &Accessor { offset: 4, count: 2, ty: AccessorType::U8 }),
        Some(AccessorArray::U8(vec![1, 2]))
    );
}

#[test]
fn a_zero_count_accessor_is_an_empty_array_not_a_failure() {
    // §5.2 rev 2 distinguishes a manifest whose accessors all have count 0 from
    // one with no accessors at all, so this must be Some, not None.
    assert_eq!(
        materialise(&[], &Accessor { offset: 0, count: 0, ty: AccessorType::U32 }),
        Some(AccessorArray::U32(vec![]))
    );
}

#[test]
fn an_accessor_past_the_chunk_is_none_not_a_panic() {
    assert_eq!(
        materialise(&[1, 2, 3], &Accessor { offset: 0, count: 2, ty: AccessorType::U32 }),
        None
    );
    // The product itself must not overflow on the way to that answer (§6.1).
    assert_eq!(
        materialise(
            &[1, 2, 3],
            &Accessor { offset: u32::MAX, count: u32::MAX, ty: AccessorType::F32 }
        ),
        None
    );
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test arrays
```

Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `src/target.rs`**

The struct list above, each field documented with the section that defines it. Carry across, as doc comments, the three points the TypeScript types make and that are the specification's, not the language's:

- Structure-of-arrays rather than an array of objects: it is what the file stores, and it keeps the decode a set of allocations proportional to the arrays rather than to `N`.
- `f32`, not `f64`, for coordinates: §5.5 stores them as `f32` because that halves the arrays and its precision at 4096 px (~0.0005 px) is far below detector accuracy. Consumers widen when they compute.
- `patches.left`/`top` are **level** coordinates, the only positions in a target that are not level-0 (§3, §5.7).

- [ ] **Step 4: Write `src/arrays.rs`, and uncomment `Decoded` in `error.rs`**

```rust
//! An accessor to an owned array, always by copy (§3).
//!
//! The TypeScript codec has a decision to make here — a view into the file's own
//! buffer when the absolute offset divides by the element size, a copy when it
//! does not. Rust has none: copying is the only safe option without `unsafe`,
//! and it is also the correct one, because §3 forbids reading misaligned data
//! through a view and a `.wnft` embedded with `include_bytes!` is guaranteed
//! only 1-byte alignment. `from_le_bytes` on a fixed-size array is the whole
//! mechanism.

pub(crate) fn materialise(bin: &[u8], accessor: &Accessor) -> Option<AccessorArray> {
    let size = element_size(accessor.ty);
    // §6.1's checked arithmetic: the product is computed before it is used to
    // slice, so a count near u32::MAX is a None rather than a wrap.
    let bytes = (accessor.count as usize).checked_mul(size)?;
    let start = accessor.offset as usize;
    let end = start.checked_add(bytes)?;
    let slice = bin.get(start..end)?;
    Some(match accessor.ty {
        AccessorType::U8 => AccessorArray::U8(slice.to_vec()),
        AccessorType::U16 => AccessorArray::U16(
            slice.chunks_exact(2)
                .filter_map(|c| <[u8; 2]>::try_from(c).ok().map(u16::from_le_bytes))
                .collect(),
        ),
        AccessorType::U32 => AccessorArray::U32(
            slice.chunks_exact(4)
                .filter_map(|c| <[u8; 4]>::try_from(c).ok().map(u32::from_le_bytes))
                .collect(),
        ),
        AccessorType::F32 => AccessorArray::F32(
            slice.chunks_exact(4)
                .filter_map(|c| <[u8; 4]>::try_from(c).ok().map(f32::from_le_bytes))
                .collect(),
        ),
    })
}
```

`Accessor` and `AccessorType` live in `manifest.rs` (Task 6). To keep Task 5 self-contained, declare both in `arrays.rs` now and have `manifest.rs` re-export them in Task 6.

Uncomment the `Decoded` struct and its `use crate::target::Target;` in `error.rs`, and add `Decoded` to the `pub use` list in `lib.rs`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test arrays
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Format, lint, re-check `no_std`, commit**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
git add crates/wnft-format
git commit -m "feat(wnft-format): add the decoded target and accessor materialisation

Every accessor is copied out with from_le_bytes. The view-or-copy decision
the TypeScript codec has to make does not exist here: copying is the only
safe option without unsafe, and §3 forbids reading misaligned data through a
view anyway — a .wnft embedded with include_bytes! is guaranteed only 1-byte
alignment. params and info are serde_json::Map, whose BTreeMap ordering is
§7.3's code-point sort for free.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The manifest — §6.1 steps 3 to 6

Bytes in, a validated description out, with every accessor reference resolved to an **index** and not one array materialised. That ordering is the point: §6.1 requires a reader never to allocate in proportion to a size before that size has been checked.

**Files:**
- Create: `crates/wnft-format/src/manifest.rs`
- Modify: `crates/wnft-format/src/lib.rs`
- Test: `crates/wnft-format/tests/manifest.rs`

**Interfaces:**
- Consumes: `scan_ijson` (Task 4); `Accessor`, `AccessorType` (Task 5); `known.rs` (Task 3); `Limits`, `ErrorCode`, `Warning`, `fail` (Task 2).
- Produces:
  - `pub(crate) struct ManifestHead { doc: serde_json::Map<String, Value>, generator: Option<String>, extensions_used: Vec<String>, extensions_required: Vec<String> }`
  - `pub(crate) fn decode_manifest(bytes: &[u8], limits: &Limits) -> Result<(ManifestHead, Vec<Warning>), DecodeError>` — steps 3 to 5.
  - `pub(crate) struct ManifestSpec { head, accessors, meta, pyramid, keypoints, descriptor_sets, patches, reference_image, info }`, with each accessor-referencing field holding a `usize` index.
  - `pub(crate) fn validate_manifest(head: ManifestHead, bin_length: Option<usize>, limits: &Limits) -> Result<(ManifestSpec, Vec<Warning>), DecodeError>` — step 6.
  - Re-exports of `Accessor`, `AccessorType`, `element_size`.

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/manifest.rs`:

```rust
//! §6.1 steps 3 to 6, against the fixtures that reach them.
//!
//! Every fixture here frames and checksums correctly (Task 3 covers the ones
//! that do not) and fails — or warns — for a reason the manifest layer owns.

mod common;

use wnft_format::{DEFAULT_LIMITS, ErrorCode, Limits, WarningCode};
use wnft_format::testing::{decode_manifest, parse_container, validate_manifest};

/// Run steps 3 to 6 on a fixture, with the limits the corpus prescribes.
fn run(relative: &str, limits: &Limits) -> Result<Vec<WarningCode>, ErrorCode> {
    let bytes = common::read(relative);
    let parsed = parse_container(&bytes).map_err(|e| e.code)?;
    let start = parsed.json.data_start;
    let json = bytes.get(start..start + parsed.json.length).expect("in bounds");
    let (head, mut warnings) = decode_manifest(json, limits).map_err(|e| e.code)?;
    let bin = parsed.bin.map(|b| b.length);
    let (_spec, more) = validate_manifest(head, bin, limits).map_err(|e| e.code)?;
    warnings.extend(more);
    Ok(warnings.into_iter().map(|w| w.code).collect())
}

fn code(relative: &str) -> ErrorCode {
    run(relative, &DEFAULT_LIMITS).expect_err("this fixture must fail")
}

#[test]
fn step_3_rejects_a_manifest_above_the_limit_before_decoding_it() {
    // expectations.json gives this fixture maxManifestBytes: 32.
    let limits = Limits { max_manifest_bytes: 32, ..DEFAULT_LIMITS };
    assert_eq!(
        run("invalid/manifest-too-large.wnft", &limits).unwrap_err(),
        ErrorCode::ManifestTooLarge
    );
}

#[test]
fn step_4_rejects_bad_text_and_bad_json() {
    assert_eq!(code("invalid/bad-manifest-not-utf8.wnft"), ErrorCode::BadManifest);
    assert_eq!(code("invalid/bad-manifest-not-json.wnft"), ErrorCode::BadManifest);
}

#[test]
fn step_4_rejects_every_i_json_violation() {
    for relative in [
        "invalid/ijson-duplicate-key.wnft",
        "invalid/ijson-duplicate-key-escaped.wnft",
        "invalid/ijson-unpaired-surrogate.wnft",
        "invalid/ijson-integer-2p53.wnft",
        "invalid/ijson-infinity.wnft",
        "invalid/ijson-raw-noncharacter.wnft",
        "invalid/ijson-noncharacter-in-name.wnft",
    ] {
        assert_eq!(code(relative), ErrorCode::BadManifest, "{relative}");
    }
}

#[test]
fn step_5_rejects_a_later_minor_and_an_unimplemented_required_extension() {
    // §7.1: while the major is 0 a reader accepts nothing but its own exact
    // minor, or it would silently misread a file that broke the one before.
    assert_eq!(
        code("invalid/unsupported-format-version.wnft"),
        ErrorCode::UnsupportedFormatVersion
    );
    assert_eq!(
        code("invalid/unsupported-extension.wnft"),
        ErrorCode::UnsupportedExtension
    );
}

#[test]
fn step_5_prunes_an_unknown_optional_extension_and_warns() {
    assert_eq!(
        run("warnings/unknown-extension.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnknownExtensionIgnored]
    );
}

#[test]
fn step_6_rejects_every_accessor_domain_violation() {
    // §5.2: offset and count are integers in [0, 2^32 − 1], rejected *before*
    // any arithmetic uses them, and an accessor reference is an integer index.
    for relative in [
        "invalid/accessor-fractional-offset.wnft",
        "invalid/accessor-negative-count.wnft",
        "invalid/accessor-count-above-u32.wnft",
        "invalid/accessor-ref-not-index.wnft",
    ] {
        assert_eq!(code(relative), ErrorCode::BadManifest, "{relative}");
    }
}

#[test]
fn step_6_rejects_an_accessor_past_the_bin_chunk() {
    assert_eq!(code("invalid/bad-layout-out-of-bounds.wnft"), ErrorCode::BadLayout);
}

#[test]
fn step_6_rejects_every_pyramid_domain_violation() {
    // §5.4: level sizes are integers in [1, 2^16 − 1] and scaleStep is finite
    // and > 1 — a zero size or a step of 1 makes §3's mapping meaningless.
    for relative in [
        "invalid/level-size-zero.wnft",
        "invalid/level-size-above-u16.wnft",
        "invalid/scale-step-one.wnft",
    ] {
        assert_eq!(code(relative), ErrorCode::BadManifest, "{relative}");
    }
}

#[test]
fn step_6_enforces_the_resource_limits() {
    // expectations.json gives this fixture maxKeypoints: 4.
    let limits = Limits { max_keypoints: 4, ..DEFAULT_LIMITS };
    assert_eq!(
        run("invalid/limit-exceeded-keypoints.wnft", &limits).unwrap_err(),
        ErrorCode::LimitExceeded
    );
}

#[test]
fn an_unknown_kind_or_norm_is_kept_and_warned_about() {
    // §5.6: structurally understood, so it is preserved and re-emitted
    // unchanged. It stays unusable and still warns.
    assert_eq!(
        run("warnings/unknown-descriptor-kind.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnsupportedDescriptorSet]
    );
    assert_eq!(
        run("warnings/unknown-norm.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnsupportedDescriptorSet]
    );
}

#[test]
fn an_unknown_element_type_is_dropped_and_warned_about() {
    // §5.6: nothing says how wide an element is, so the set cannot be
    // interpreted at all and is dropped *before* its accessors are read — or a
    // broken one would report BAD_LAYOUT instead of warning.
    assert_eq!(
        run("warnings/unknown-element-type.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnsupportedDescriptorSet]
    );
}

#[test]
fn every_valid_fixture_passes_steps_3_to_6_with_no_warnings() {
    for relative in [
        "valid/minimal.wnft",
        "valid/several-sets.wnft",
        "valid/single-level.wnft",
        "valid/zero-keypoints.wnft",
        "valid/no-patches.wnft",
        "valid/reference-image.wnft",
        "valid/boundary-max-safe-integer.wnft",
        "valid/params-numeric-keys.wnft",
    ] {
        assert_eq!(run(relative, &DEFAULT_LIMITS).unwrap(), vec![], "{relative}");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test manifest
```

Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `decode_manifest` — steps 3 to 5**

In order, and the order is normative:

1. **Step 3.** `bytes.len() > limits.max_manifest_bytes` → `MANIFEST_TOO_LARGE`, *before* decoding.
2. **Step 4.** `core::str::from_utf8(bytes)` — its strictness is exactly what §6.1 asks for. On `Err` → `BAD_MANIFEST`. Then `scan_ijson` on the text → `BAD_MANIFEST` with the violation's path and reason. Then `serde_json::from_str::<serde_json::Value>` → `BAD_MANIFEST` on `Err`. Top level must be an object → `BAD_MANIFEST`.
   Configure `serde_json` as Task 1 did: `float_roundtrip` on, `arbitrary_precision` **off** (it is off by default, and turning it on would make every number a string and defeat check (c)).
   `serde_json` has a recursion limit of 128 by default and returns an `Err` past it rather than overflowing — which is how "a `RangeError` from pathological nesting is `BAD_MANIFEST`" is satisfied here.
3. **Step 5**, in this order (Task 0 step 4 fixed it):
   a. `format` is an object; `format.version` is a string; equals `"0.2"` else `UNSUPPORTED_FORMAT_VERSION`; `format.generator`, when present, is a string.
   b. `extensionsUsed` and `extensionsRequired` default to `[]`; each is an array of strings else `BAD_MANIFEST`.
   c. Every name in `extensionsRequired` is also in `extensionsUsed`, else `BAD_MANIFEST` (§5.1).
   d. Every name in `extensionsRequired` is in `IMPLEMENTED_EXTENSIONS`, else `UNSUPPORTED_EXTENSION`.
   e. Every name in `extensionsUsed` not implemented is **pruned**, with `UNKNOWN_EXTENSION_IGNORED` (§7.3), so re-encoding never advertises a payload decoding threw away.

- [ ] **Step 4: Write `validate_manifest` — step 6**

The order matters and follows the specification: **accessors first**, because every other field references them; then the pyramid, because `L` fixes how long every `levelStart` must be; then the rest. Nothing here reads array *contents* — that is step 7.

**Accessors (§5.2):**
- `accessors` is an array, else `BAD_MANIFEST`.
- Each entry is an object with `offset` and `count` each an integer in `[0, 2^32 − 1]` and `type` one of `"u8"`, `"u16"`, `"u32"`, `"f32"`. Anything else — fractional, negative, above `2^32 − 1`, not a number — is `BAD_MANIFEST`, **before** any arithmetic uses it, so every product below has `u32` operands.
  In Rust that is: the `serde_json::Value` must be `Number`, `as_u64()` must be `Some`, and the value `<= u32::MAX`. A fractional or negative literal fails `as_u64`.
- At least one accessor with no `BIN\0` chunk → `BAD_LAYOUT` (§5.2 rev 2). This covers the manifest whose accessors all have `count = 0`, which the bound below would not.
- `offset % element_size(type) == 0`, else `BAD_LAYOUT`.
- `offset.checked_add(count.checked_mul(size)?)? <= bin_length`, else `BAD_LAYOUT`.
- No two accessors overlap (§5.2). A **zero-length** accessor owns no bytes, takes part in no overlap, and two of them may share an offset — so filter to `end > start` before sorting by `start` and comparing neighbours.

**Accessor references.** One helper, used everywhere: the value must be an integer index in `[0, accessors.len())` — anything else is `BAD_MANIFEST` — and the accessor it names must have exactly the `type` and `count` the field fixes, else `BAD_LAYOUT`.

**Pyramid (§5.4):** `levelSizes` a non-empty array; its length `<= max_levels` else `LIMIT_EXCEEDED`; each entry a two-element array of integers in `[1, 2^16 − 1]` else `BAD_MANIFEST`; `scaleStep` finite and `> 1` else `BAD_MANIFEST`. `L = levelSizes.len()`.

**Meta (§5.3, as Task 0 step 3 amended it):** `widthPx`, `heightPx` integers in `[1, 2^16 − 1]` else `BAD_MANIFEST`; `physicalSizeMm` is `null`, or two finite numbers both `> 0`, else `BAD_MANIFEST`. The *equality* with `levelSizes[0]` is step 7, not here.

**Keypoints (§5.5):** `count` a u32 else `BAD_MANIFEST`, `<= max_keypoints` else `LIMIT_EXCEEDED`. `detector` an object with a string `kind` — **any** string, the empty one included, since it is informative and a reader must not constrain it further. `detector.params` absent ≡ `{}`; present and not an object → `BAD_MANIFEST`. Then the references: `levelStart` `u32`×`(L+1)`, `x`/`y`/`angle`/`score` `f32`×`N`, `size` optional `f32`×`N`, `level` `u8`×`N`.

**Descriptor sets (§5.6):** array with at least one entry else `BAD_MANIFEST`; length `<= max_descriptor_sets` else `LIMIT_EXCEEDED`. Per entry:
- `kind`, `norm`, `elementType`, `producer` all strings else `BAD_MANIFEST`.
- **Unknown `elementType` → warn `UNSUPPORTED_DESCRIPTOR_SET` and `continue`**, dropping the set *before* its accessors are read. Order is load-bearing: reading them first would report `BAD_LAYOUT` for a set the specification says to skip.
- Unknown `kind` **or** unknown `norm` → warn `UNSUPPORTED_DESCRIPTOR_SET` and **keep** the set.
- `dimensions`, `bytesPerDescriptor`, `count` each a u32 else `BAD_MANIFEST`. **No minimum on `dimensions`** — `0` is legal (§5.6), and refusing it would make a file the reader accepts impossible to re-emit.
- `bytesPerDescriptor` equals `dimensions / 8` for `"bits"` (with `dimensions % 8 == 0`), `dimensions` for `"u8"`, `4 × dimensions` for `"f32"` — else `INCONSISTENT_DATA`.
- `params` absent ≡ `{}`.
- Uniqueness on `(kind, norm, dimensions, producer)`; a repeat is `INCONSISTENT_DATA`. Build the key so that a `kind` or `producer` containing the separator cannot forge a collision — `serde_json::to_string(&[kind, norm, &dimensions.to_string(), producer])` does it, as the TypeScript's `JSON.stringify` does.
- References: `levelStart` `u32`×`(L+1)`, `kpIndex` `u32`×`M`, `data` of type `f32` for `"f32"` and `u8` otherwise, with `count` = `M × dimensions` for `"f32"` and `M × bytesPerDescriptor` otherwise — both via `checked_mul`.

**Patches (§5.7, as Task 0 step 2 amended it):** optional. `patchSize` an integer in `[1, 2^32 − 1]` else `BAD_MANIFEST`; `<= max_patch_size` else `LIMIT_EXCEEDED`. `count` a u32 else `BAD_MANIFEST`; `<= max_patches` else `LIMIT_EXCEEDED`. References: `score` `f32`×`Q`, `left`/`top` `u16`×`Q`, `level` `u8`×`Q`, `pixels` `u8`×(`Q × P × P` via two `checked_mul`s).

**Reference image (§5.8, as Task 0 step 3 amended it):** optional. `level` a u32, `width`/`height` integers in `[1, 2^16 − 1]`, else `BAD_MANIFEST`. Reference: `pixels` `u8`×(`width × height`, checked). `level < L` and the equality with `levelSizes[level]` are step 7.

**Info (§5.9):** optional; present and not an object → `BAD_MANIFEST`. Otherwise carried through untouched: it is *data*.

**Unknown keys** at every level are ignored and not recorded (§5.1, §7.3).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test manifest
```

Expected: PASS, 12 tests.

- [ ] **Step 6: Format, lint, re-check `no_std`, commit**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
git add crates/wnft-format
git commit -m "feat(wnft-format): validate the manifest (§6.1 steps 3-6)

Accessor references resolve to indices, not arrays: §6.1 requires a reader
never to allocate in proportion to a size before that size has been checked,
so every number is settled here and nothing is materialised until step 7.
A set whose elementType is unknown is dropped before its accessors are read,
or a broken one would report BAD_LAYOUT where §5.6 asks for a warning.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Consistency, and `decode`

The last gate, and the public entry point. §6.1 step 7 is the only gate that reads array *contents*: everything it needs — that the arrays are the right length, that every number is in its domain — has been settled, so it is about agreement between fields, not shape.

**Files:**
- Create: `crates/wnft-format/src/consistency.rs`
- Modify: `crates/wnft-format/src/lib.rs` (add `decode`)
- Test: `crates/wnft-format/tests/corpus.rs`

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces:
  - `pub fn decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, DecodeError>`
  - `struct TargetArrays { keypoints: KeypointArrays, sets: Vec<SetArrays>, patches: Option<PatchArrays>, reference_image: Option<ReferenceImageArrays> }` — the materialised arrays, grouped the way `Target` groups its fields. `sets` holds one entry per **kept** descriptor set, in `ManifestSpec::descriptor_sets` order, so the two index together. It lives in `consistency.rs` because it is a step-7 concept: it exists to be checked and then disassembled into a `Target`, and nothing before this task needs it.
  - `fn materialise_all(bin: &[u8], spec: &ManifestSpec) -> Option<TargetArrays>` — one `materialise` call per accessor the validated spec references. `None` is unreachable once step 6 has passed; it is the belt to step 6's braces, and `decode` turns it into `BAD_LAYOUT`.
  - `fn check_consistency(spec: &ManifestSpec, arrays: &TargetArrays) -> Option<DecodeError>`

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/corpus.rs` — the whole corpus, driven by `expectations.json`.

**Put the `Expectations` types and the `expectations()` / `limits_for()` helpers in `tests/common/mod.rs`, not in `corpus.rs`** — `tests/writer.rs` (Task 8) reads the same index, and a shared helper written once beats a file Task 8 has to refactor. The code below shows them inline only so the task reads in one piece; `corpus.rs` itself just calls `common::expectations()`.

```rust
//! §8.2 items 1 and 5, and §8.4's truncation test, against the shared corpus.
//!
//! `expectations.json` is the machine-readable index the generator emits
//! alongside the files, so it cannot drift from them. Reading it rather than
//! listing the fixtures here is what keeps this suite honest when the corpus
//! grows: a new fixture is exercised without a change to this file.

mod common;

use serde::Deserialize;
use wnft_format::{DEFAULT_LIMITS, Decoded, ErrorCode, Limits, WarningCode, decode};

#[derive(Deserialize)]
struct Expectations {
    #[serde(rename = "formatVersion")]
    format_version: String,
    valid: Vec<ValidCase>,
    invalid: Vec<InvalidCase>,
    warnings: Vec<WarningCase>,
    noncanonical: Vec<NoncanonicalCase>,
}

#[derive(Deserialize)]
struct ValidCase { file: String, decoded: Option<String> }

#[derive(Deserialize)]
struct InvalidCase { file: String, error: String, limits: Option<LimitOverrides> }

#[derive(Deserialize)]
struct WarningCase { file: String, warnings: Vec<String> }

#[derive(Deserialize)]
struct NoncanonicalCase { file: String, canonical: String }

/// The two overrides the corpus uses. Their names are the TypeScript codec's
/// camelCase ones, because the corpus is shared and the file is its index.
#[derive(Deserialize)]
struct LimitOverrides {
    #[serde(rename = "maxManifestBytes")]
    max_manifest_bytes: Option<usize>,
    #[serde(rename = "maxKeypoints")]
    max_keypoints: Option<u32>,
}

fn expectations() -> Expectations {
    let raw = common::read("expectations.json");
    serde_json::from_slice(&raw).expect("expectations.json must parse")
}

fn limits_for(overrides: &Option<LimitOverrides>) -> Limits {
    let mut limits = DEFAULT_LIMITS;
    if let Some(o) = overrides {
        if let Some(v) = o.max_manifest_bytes { limits.max_manifest_bytes = v; }
        if let Some(v) = o.max_keypoints { limits.max_keypoints = v; }
    }
    limits
}

#[test]
fn the_corpus_is_the_version_this_build_reads() {
    assert_eq!(expectations().format_version, "0.2");
}

#[test]
fn every_valid_fixture_decodes_with_no_warnings() {
    for case in expectations().valid {
        let result = decode(&common::read(&case.file), &DEFAULT_LIMITS);
        let Decoded { warnings, .. } = result.unwrap_or_else(|e| {
            panic!("{} must decode, got {}: {}", case.file, e.code, e.detail)
        });
        assert!(warnings.is_empty(), "{} must decode cleanly, got {warnings:?}", case.file);
    }
}

#[test]
fn every_invalid_fixture_yields_exactly_its_code() {
    // §8.2 item 5. The code, not the detail: the detail is free text, only the
    // code is shared across implementations (§6.2).
    for case in expectations().invalid {
        let limits = limits_for(&case.limits);
        let error = decode(&common::read(&case.file), &limits)
            .err()
            .unwrap_or_else(|| panic!("{} must not decode", case.file));
        assert_eq!(error.code.as_str(), case.error, "{}: {}", case.file, error.detail);
    }
}

#[test]
fn every_warning_fixture_yields_exactly_its_warnings() {
    for case in expectations().warnings {
        let decoded = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let actual: Vec<&str> = decoded.warnings.iter().map(|w| w.code.as_str()).collect();
        let expected: Vec<&str> = case.warnings.iter().map(String::as_str).collect();
        assert_eq!(actual, expected, "{}", case.file);
    }
}

#[test]
fn every_noncanonical_fixture_decodes_to_its_counterpart() {
    // §8.2 item 3, first half: the decoded values must match, which is what
    // makes §7.3's "a decoder keeps only what it understands" testable. The
    // re-encoding half is in tests/writer.rs, once encode exists.
    for case in expectations().noncanonical {
        let a = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let b = decode(&common::read(&case.canonical), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.canonical, e.code));
        assert_eq!(a.target, b.target, "{} vs {}", case.file, case.canonical);
    }
}

#[test]
fn minimal_decodes_to_the_values_minimal_json_records() {
    // §8.2 item 1.
    let decoded = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("minimal.wnft must decode");
    let expected: serde_json::Value =
        serde_json::from_slice(&common::read("valid/minimal.json"))
            .expect("minimal.json must parse");
    assert_eq!(common::target_to_json(&decoded.target), expected);
}

#[test]
fn truncating_every_valid_fixture_at_every_byte_never_panics() {
    // §8.4, over the whole corpus, and shaped like the container suite's own
    // truncation test for the same reason: **not panicking is the claim that
    // matters**, and in Rust the assertion is the call itself — an unwinding
    // panic in a test thread fails the test. `is_err` is a consequence, and it
    // holds because §4.1 requires `total_length` to equal the buffer length, so
    // no proper prefix of a valid file is itself a valid file.
    for case in expectations().valid {
        let bytes = common::read(&case.file);
        for cut in 0..=bytes.len() {
            let head = bytes.get(..cut).expect("cut is within the buffer");
            let result = decode(head, &DEFAULT_LIMITS); // the no-panic assertion

            if cut == bytes.len() {
                // The positive control: the untruncated file must decode, or
                // the loop would pass against a `decode` that always failed.
                assert!(result.is_ok(), "{} must decode untruncated", case.file);
            } else {
                assert!(
                    result.is_err(),
                    "{} truncated to {cut} bytes must not decode",
                    case.file
                );
            }
        }
    }
}
```

Add to `tests/common/mod.rs` the projection used by the `minimal.json` test:

```rust
/// A decoded target as the JSON `minimal.json` records (§8.2 item 1).
///
/// The key names are the decoded form's, not the manifest's: `minimal.json`
/// holds "its decoded values (manifest plus arrays as JSON lists)" (§8.1), so
/// accessors are gone and each field carries its array. Key *order* does not
/// matter — two `serde_json::Value`s compare structurally.
///
/// `f32` widens to `f64` exactly, so every value in the corpus compares as
/// written.
pub fn target_to_json(target: &wnft_format::Target) -> serde_json::Value {
    // Build with serde_json::json!, one field per §5.1 key, omitting the
    // optionals the target does not carry — a decoded target omits an absent
    // optional rather than holding a null, so that it is indistinguishable from
    // one built by hand.
    todo!("written in Task 7 step 3")
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test corpus
```

Expected: FAIL — `unresolved import wnft_format::decode`, plus the `todo!`.

- [ ] **Step 3: Write `src/consistency.rs`**

`pub(crate) fn check_consistency(spec: &ManifestSpec, arrays: &TargetArrays) -> Option<DecodeError>`, every failure `INCONSISTENT_DATA`. The rules, from §6.1 step 7 and the sections it cites:

1. **Keypoints' `levelStart` is closed** (§5.5): `levelStart[0] == 0`, non-decreasing, `levelStart[L] == N`.
2. **`level` agrees with `levelStart`**: for every `l` and every `i` in `[levelStart[l], levelStart[l+1])`, `level[i] == l`.
3. **`meta` equals `levelSizes[0]`** (§5.3).
4. **`levelSizes` is non-increasing** (§5.4): for every `l`, `levelSizes[l+1][0] <= levelSizes[l][0]` and likewise for the height.
5. **Per descriptor set** (§5.6): `levelStart` closed against `M`; and, unless `WKNF_multiview` is in `extensionsRequired`, `M == N` **and `kpIndex[i] == i` for every `i`** (Task 0 step 1 made the identity a reader rule); for every `l` and every row `r` in `[levelStart[l], levelStart[l+1])`, `kpIndex[r] < N` and `keypoints.level[kpIndex[r]] == l`.
   Write the multi-view condition out rather than hard-coding `false`, even though `IMPLEMENTED_EXTENSIONS` is empty and a required `WKNF_multiview` was already rejected at step 5. It is the specification's condition, and it goes live unchanged the day the extension lands.
6. **Per patch** (§5.7): `level[q] < L`, **checked before `levelSizes` is indexed with it**; then `left[q] + P <= levelSizes[level[q]][0]` and `top[q] + P <= levelSizes[level[q]][1]`, both with `checked_add`.
7. **Reference image** (§5.8): `level < L`, **checked before** `width` and `height` are compared with `levelSizes[level]`.

Orderings 6 and 7 are normative, not stylistic — the specification says so twice.

- [ ] **Step 4: Write `decode` in `lib.rs`**

```rust
/// Decode a `.wnft` file.
///
/// The gates of §6.1 run in exactly the order that section fixes, and the order
/// is the point: a `.wnft` may come from a URL an application's user chose, so
/// nothing here allocates in proportion to a size before that size has been
/// checked. Every number is settled by the manifest layer first; the arrays are
/// materialised only afterwards.
///
/// Nothing panics. Every failure is a value, which is what lets a caller treat a
/// hostile file as data rather than as an incident.
///
/// # Errors
///
/// Any code of §6.2 the file earns; see [`ErrorCode`].
pub fn decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, DecodeError> {
    // Step 0 — file size, before a single byte is read (§6.1 rev 2). This is why
    // a very large file that is not a .wnft at all reports LIMIT_EXCEEDED and
    // not BAD_MAGIC.
    if bytes.len() > limits.max_file_bytes { /* LIMIT_EXCEEDED */ }

    // Steps 1 and 2 — framing, and the checksums of the JSON and BIN chunks.
    // Steps 3 to 5 — manifest size, text, format version, extensions.
    // Step 6 — schema, accessors, resource limits.
    // Only now: materialise, because only now is every size checked.
    // Step 7 — data consistency.
    // Assemble.
}
```

Assembly detail, which §8.2 item 2 depends on: an absent optional is **omitted** (`None`), never present-but-empty. A decoded target must be indistinguishable from one built by hand, or the round trip would depend on which of the two it started from. The two places this bites: `keypoints.size` and `params` — an absent `params` decodes to an empty `Map`, which the writer omits again (§7.3).

Then write `common::target_to_json` against the real `Target`, matching `minimal.json`'s key names: `formatVersion`, `generator`, `extensionsUsed`, `extensionsRequired`, `meta`, `pyramid`, `keypoints`, `descriptorSets`, `patches`, `referenceImage`, `info`; and inside a descriptor set, `kind`, `norm`, `dimensions`, `bytesPerDescriptor`, `producer`, `params`, `count`, `levelStart`, `kpIndex`, `elementType`, `data`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test corpus
```

Expected: PASS, 7 tests. The truncation test is the slow one (~8 fixtures × a few thousand prefixes); if it exceeds a minute in debug, run the suite with `--release` to confirm and leave it in debug for CI, where it is still well under the job budget.

- [ ] **Step 6: Run the whole suite**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format
```

Expected: every suite green. **This is the point at which the reader is complete and conformant against the corpus.**

- [ ] **Step 7: Format, lint, re-check `no_std`, commit**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
git add crates/wnft-format
git commit -m "feat(wnft-format): check data consistency and expose decode (§6.1 step 7)

The reader is now conformant against the shared corpus: every valid fixture
decodes cleanly, every invalid one yields exactly its code, every warnings
file yields exactly its warnings, minimal.wnft decodes to minimal.json, and
every valid fixture truncated at every byte returns an error without
unwinding (§8.2 items 1 and 5, §8.4).

A patch's level and a reference image's level are checked below L before
either indexes levelSizes — an ordering §5.7 and §5.8 both state, because
getting it wrong turns a bad file into a panic.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The canonical writer — §7.3

The same content always produces the same bytes. Four phases: validate, lay out the `BIN` chunk, emit the manifest, frame.

**Files:**
- Create: `crates/wnft-format/src/validate_target.rs`
- Create: `crates/wnft-format/src/canonical_json.rs`
- Create: `crates/wnft-format/src/encode.rs`
- Modify: `crates/wnft-format/src/lib.rs`
- Test: `crates/wnft-format/tests/writer.rs`

**Interfaces:**
- Consumes: `Target` (Task 5), `build_container` (Task 3), `has_unpaired_surrogate` / `has_noncharacter` / `MAX_EXACT_INTEGER` (Task 4), `decode` (Task 7, for the round-trip tests).
- Produces: `pub fn encode(target: &Target) -> Result<Vec<u8>, EncodeError>`.

- [ ] **Step 1: Write the failing test**

`crates/wnft-format/tests/writer.rs`:

```rust
//! §7.3 and §8.2 items 2, 3 and 7.
//!
//! **On byte identity.** §8.2 item 2's guarantee is scoped "same-implementation",
//! and item 3's was scoped the same way by 0.2 rev 4: this corpus was written by
//! the TypeScript codec, and §7.3's last paragraph leaves number formatting free
//! across languages (Q8). So the comparison here is item 4's — the `BIN\0` chunk
//! byte-identical, the manifest equal after parsing. That is the conformance the
//! specification actually requires of a second implementation, and asserting
//! more would be asserting something Q8 says is not yet decided.

mod common;

use wnft_format::{DEFAULT_LIMITS, ErrorCode, decode, encode};

/// §8.2 item 4's comparison: BIN byte-identical, manifests equal after parsing.
fn assert_conformant(actual: &[u8], expected: &[u8], what: &str) {
    let a = common::split(actual);
    let b = common::split(expected);
    assert_eq!(a.bin, b.bin, "{what}: the BIN chunk must be byte-identical");
    let am: serde_json::Value = serde_json::from_slice(&a.json).expect("manifest parses");
    let bm: serde_json::Value = serde_json::from_slice(&b.json).expect("manifest parses");
    assert_eq!(am, bm, "{what}: the manifests must be equal after parsing");
}

#[test]
fn every_valid_fixture_round_trips() {
    // §8.2 item 2, at the scope item 4 fixes for a second implementation.
    for relative in common::valid_fixtures() {
        let bytes = common::read(&relative);
        let decoded = decode(&bytes, &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{relative} must decode, got {}", e.code));
        let re = encode(&decoded.target)
            .unwrap_or_else(|e| panic!("{relative} must re-encode, got {}", e.detail));
        assert_conformant(&re, &bytes, &relative);
    }
}

#[test]
fn every_noncanonical_fixture_re_encodes_to_its_counterpart() {
    // §8.2 item 3, second half: to the *counterpart*, not to the input. This is
    // what makes §7.3's "a decoder keeps only what it understands" testable
    // rather than a disclaimer — the unknown top-level key, the unknown
    // extension payload and the explicit empty params must all be gone.
    for case in common::noncanonical_cases() {
        let decoded = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let re = encode(&decoded.target).expect("must re-encode");
        assert_conformant(&re, &common::read(&case.canonical), &case.file);
    }
}

#[test]
fn re_encoding_is_deterministic() {
    // §7.3's first line. Two encodes of the same target are the same bytes.
    let decoded = decode(&common::read("valid/several-sets.wnft"), &DEFAULT_LIMITS)
        .expect("must decode");
    let a = encode(&decoded.target).expect("must encode");
    let b = encode(&decoded.target).expect("must encode");
    assert_eq!(a, b);
}

#[test]
fn params_keys_are_sorted_by_code_point_not_numerically() {
    // §7.3's note: JavaScript enumerates integer-like keys numerically and
    // first, so {"10":a,"9":b} serialises as "9" before "10", whereas code-point
    // order puts "10" first. Rust has the opposite hazard — none — but the
    // fixture exists to catch either, so it is exercised here too.
    let bytes = common::read("noncanonical/unsorted-params.wnft");
    let decoded = decode(&bytes, &DEFAULT_LIMITS).expect("must decode");
    let re = encode(&decoded.target).expect("must encode");
    assert_conformant(&re, &common::read("valid/params-numeric-keys.wnft"), "unsorted-params");
    let manifest = String::from_utf8(common::split(&re).json).expect("utf-8");
    let ten = manifest.find("\"10\"").expect("the key \"10\" is present");
    let nine = manifest.find("\"9\"").expect("the key \"9\" is present");
    assert!(ten < nine, "code-point order puts \"10\" before \"9\"");
}

// --- §8.2 item 7: the writer rejects what the reader would -------------------

/// A decoded minimal target, with one value injected into its descriptor set's
/// `params` at the given key.
fn minimal_with_param(key: &str, value: serde_json::Value) -> wnft_format::Target {
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    target
        .descriptor_sets
        .get_mut(0)
        .expect("minimal has one set")
        .params
        .insert(key.to_string(), value);
    target
}

fn rejects(key: &str, value: serde_json::Value) {
    let error = encode(&minimal_with_param(key, value))
        .err()
        .unwrap_or_else(|| panic!("params.{key} must be refused"));
    assert_eq!(error.code, ErrorCode::InvalidTarget);
    assert!(
        error.detail.contains(key),
        "detail must name the offending path, got {:?}",
        error.detail
    );
}

#[test]
fn the_writer_refuses_an_integer_at_two_to_the_53() {
    // Check (c). §7.3 makes the writer stricter than the reader here on purpose:
    // Q8 leaves number formatting free, so another implementation may write the
    // same value as an integer literal, which every conforming reader rejects.
    rejects("big", serde_json::json!(9_007_199_254_740_992i64));
}

#[test]
fn the_writer_accepts_the_largest_exactly_representable_integer() {
    // The boundary the check above must not overshoot.
    let target = minimal_with_param("big", serde_json::json!(9_007_199_254_740_991i64));
    assert!(encode(&target).is_ok());
}

#[test]
fn the_writer_refuses_a_noncharacter_and_an_unpaired_surrogate() {
    // Checks (e) and (b). Built from code units rather than written as literals,
    // so no source file here contains one.
    let noncharacter = String::from_utf16(&[0xFDD0]).expect("U+FDD0 is well-formed");
    rejects("nc", serde_json::json!(noncharacter));
    // A lone surrogate cannot live in a Rust String at all, so (b) is
    // unreachable from a well-typed target — the check exists for the decoded
    // path and for a `params` assembled from escapes. Assert the guard is there
    // rather than that it fires:
    assert!(encode(&minimal_with_param("ok", serde_json::json!("plain"))).is_ok());
}

#[test]
fn the_writer_refuses_a_non_finite_number() {
    // Checks (d) and the NaN rule of §7.3: JSON.stringify turns both into null,
    // and a file that decodes cleanly with a value silently changed is the one
    // outcome worse than a refused write. serde_json cannot even hold them, so
    // the guard lives where a Target could: physicalSizeMm and scaleStep.
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    target.meta.physical_size_mm = Some([f64::NAN, 96.0]);
    let error = encode(&target).expect_err("NaN must be refused");
    assert_eq!(error.code, ErrorCode::InvalidTarget);
    assert!(error.detail.contains("physicalSizeMm"));
}

// --- §8.3: evolution ---------------------------------------------------------

#[test]
fn a_later_minor_is_rejected() {
    // §8.3's first bullet, from the writer's side: a target claiming 0.3 is one
    // this build cannot write, because it would be claiming a meaning it does
    // not implement.
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    target.format_version = "0.3".to_string();
    assert_eq!(
        encode(&target).expect_err("0.3 must be refused").code,
        ErrorCode::InvalidTarget
    );
}

#[test]
fn a_set_of_an_unknown_family_leaves_the_other_usable() {
    // §8.3: a file with two descriptor sets, one of an unknown family.
    let decoded = decode(&common::read("warnings/unknown-descriptor-kind.wnft"), &DEFAULT_LIMITS)
        .expect("must decode");
    assert!(
        decoded.target.descriptor_sets.len() >= 2,
        "the unknown-kind set is preserved beside the valid one (§5.6)"
    );
}
```

Add to `tests/common/mod.rs`: `split(bytes) -> Chunks { json: Vec<u8>, bin: Vec<u8> }`, plus `valid_fixtures() -> Vec<String>` and `noncanonical_cases()` over the `Expectations` types Task 7 already put there.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test writer
```

Expected: FAIL — `unresolved import wnft_format::encode`.

- [ ] **Step 3: Write `src/validate_target.rs`**

`pub(crate) fn validate_target(target: &Target) -> Option<String>` — the offending field path, or `None`.

§7.3: **the writer MUST NOT emit a file that a conforming reader would reject.** So everything §5 and §6 require of a file is checked against the in-memory target before a byte is written. The rules mirror `manifest.rs` and `consistency.rs`, and the duplication is deliberate: the reader validates a parsed manifest addressed by accessor indices, the writer validates owned arrays. What is shared is the *rule list*, which is why this file is ordered like §5.

The rules, in §5's order:

- `format_version == "0.2"`; every `extensions_required` name also in `extensions_used` and in `IMPLEMENTED_EXTENSIONS`; every `extensions_used` name in `IMPLEMENTED_EXTENSIONS` — a decoded target has had unimplemented names pruned, and one built by hand must not reintroduce them, since this writer cannot produce the payload they promise.
- Pyramid: `L >= 1`; every size an integer in `[1, 2^16 − 1]`; non-increasing; `scale_step` finite and `> 1`.
- Meta: `width_px`/`height_px` equal `level_sizes[0]`; `physical_size_mm`, when `Some`, both finite and `> 0`.
- Keypoints: `level_start.len() == L + 1`; `x`/`y`/`angle`/`score`/`level` each of length `N`; `size`, when `Some`, of length `N`; `detector.kind` **any** string, the empty one included (§5.5 rev 3 — refusing one would make a file the reader accepts impossible to re-emit); `level_start` closed and non-decreasing; `level` agreeing with `level_start`; `detector.params` through `check_free_form`.
- Descriptor sets: at least one; per set, `bytes_per_descriptor` consistent with `element_type()` and `dimensions` (**no minimum on `dimensions`** — `0` is legal); `level_start.len() == L + 1` and closed against `M`; `kp_index.len() == M`; `data.len()` equal to `M × dimensions` for `"f32"` and `M × bytes_per_descriptor` otherwise; without `WKNF_multiview`, `M == N` and `kp_index[i] == i`; every `kp_index[r] < N` with `keypoints.level[kp_index[r]] == l`; the `(kind, norm, dimensions, producer)` key unique; `params` through `check_free_form`.
- Patches: `patch_size` in `[1, 2^32 − 1]`; the four arrays of length `Q`; `pixels` of length `Q × P × P`; every patch in bounds, `level[q] < L` checked first.
- Reference image: `level < L` checked first; `width`/`height` equal to `level_sizes[level]`; `pixels` of length `width × height`.
- `info` through `check_free_form`.

`check_free_form(value, path) -> Option<String>` applies the four I-JSON checks that survive into memory (§7.3, §8.2 item 7). Check (a) has no counterpart: a `serde_json::Map` cannot hold a duplicate member name, which is precisely why §5 scopes key uniqueness to construction.

- **(d) and the NaN rule:** a non-finite number. `serde_json::Number` cannot hold one, so in Rust the guard belongs to the *typed* `f64` fields — `pyramid.scale_step` and `meta.physical_size_mm` — and to any `Value::Number` whose `as_f64()` is not finite. Check both; the second is cheap and the first is where a hand-built target can actually carry one.
- **(c):** an integer-valued number outside ±(2^53 − 1). **Deliberately stricter than the reader**, which applies (c) to the *literal*: a reader accepts `1e+21` because it carries an exponent, but Q8 leaves number formatting free, so another implementation may write the same value as `1000000000000000000000` — which *is* an integer literal outside the range, and which every conforming reader rejects. Apply it to `Value::Number` whose `as_i64()`/`as_u64()` is `Some` **and** to a float whose `fract()` is zero.
- **(b) and (e):** strings, in member names as well as values. A Rust `String` cannot hold a lone surrogate, so (b) can only be `false` — keep the call anyway, so the rule list matches §5's and the day a `Params` arrives from somewhere that can, the guard is already there.

- [ ] **Step 4: Write `src/canonical_json.rs`**

Only the manifest's *own* keys need hand-ordered emission; `params` and `info` go through `serde_json::to_string`, whose `Map` is a `BTreeMap` and therefore already in §7.3's code-point order.

```rust
//! Canonical serialisation (§7.3): the same content always produces the same
//! bytes from the same implementation.
//!
//! Two of §7.3's requirements come free in Rust and cost the TypeScript codec a
//! module:
//!
//! - **Key order inside `params` and `info`.** §7.3 requires Unicode code-point
//!   order. `serde_json::Map` is a `BTreeMap<String, Value>` (the
//!   `preserve_order` feature is deliberately off), and `String`'s `Ord` is
//!   byte order, which for valid UTF-8 *is* code-point order. So the sort is a
//!   property of the container rather than a step the writer must remember.
//! - **Sorting `descriptorSets` and the extension name arrays.** `str`'s `Ord`
//!   is the same byte order, so `sort_by` on the tuple is §7.3's comparator.
//!
//! What does not come free is the manifest's own key order, which §7.3 fixes as
//! "the order this specification lists them". `serde_json` would sort those
//! alphabetically, so the manifest is emitted by hand, member by member.
//!
//! Numbers are `serde_json`'s (`ryu`, shortest round-trip, `float_roundtrip` on).
//! They need not match the TypeScript codec's byte for byte: §7.3's last
//! paragraph and Q8 leave number formatting free across languages, which is why
//! cross-implementation conformance compares manifests **after parsing** and
//! requires byte identity only of the `BIN\0` chunk.
```

It provides `json_string(&str) -> String` (via `serde_json::to_string`, which escapes deterministically), `json_number_u32`, `json_number_f64` (returning `Err` on non-finite — `validate_target` has already rejected any target carrying one, so reaching here with one is a bug in this crate, not a bad file), and small `object(members)` / `array(items)` joiners.

- [ ] **Step 5: Write `src/encode.rs`**

Four phases:

1. **Validate.** `validate_target` → on `Some(path)`, `Err(EncodeError { code: InvalidTarget, detail: path })` and **no bytes**.
2. **Sort** `descriptorSets` by `(kind, norm, dimensions, producer)` (§7.3).
3. **Lay out** the `BIN` chunk: accessors in the order their fields first appear in the manifest, each starting at a multiple of 8, with zero padding in between. That order is, exactly: `keypoints.levelStart`, `x`, `y`, `angle`, `score`, `size` (when present), `level`; then per sorted set `levelStart`, `kpIndex`, `data`; then `patches.score`, `left`, `top`, `level`, `pixels`; then `referenceImage.pixels`. Each array's bytes are its little-endian encoding, written with `to_le_bytes` — every platform this format targets is little-endian (§3), so this is the same memory the TypeScript writer copies wholesale, and the `BIN` chunks come out byte-identical.
   The chunk length reported to `build_container` is the **unpadded** one: `chunk_length` excludes padding (§4.2), and `build_container` adds it.
4. **Emit** the manifest with the keys in §5.1's order, `extensionsUsed`/`extensionsRequired` sorted and **omitted when empty**, `params` omitted when empty, `generator` omitted when absent, `patches`/`referenceImage`/`info` omitted when absent, and `accessors` last.
   Manifest key order, per object:
   - top level: `format`, `extensionsUsed`, `extensionsRequired`, `meta`, `pyramid`, `keypoints`, `descriptorSets`, `patches`, `referenceImage`, `info`, `accessors`
   - `format`: `version`, `generator`
   - `meta`: `widthPx`, `heightPx`, `physicalSizeMm`
   - `pyramid`: `scaleStep`, `levelSizes`
   - `keypoints`: `count`, `detector`, `levelStart`, `x`, `y`, `angle`, `score`, `size`, `level`
   - `detector`: `kind`, `params`
   - a descriptor set: `kind`, `norm`, `elementType`, `dimensions`, `bytesPerDescriptor`, `producer`, `params`, `count`, `levelStart`, `kpIndex`, `data`
   - `patches`: `patchSize`, `count`, `score`, `left`, `top`, `level`, `pixels`
   - `referenceImage`: `level`, `width`, `height`, `pixels`
   - an accessor: `offset`, `count`, `type`
5. **Frame** with `build_container`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format --test writer
```

Expected: PASS, 11 tests.

If `every_valid_fixture_round_trips` fails on the `BIN` comparison, the accessor **order** or the 8-alignment is wrong — the bytes themselves are a straight little-endian copy and rarely the problem. If it fails on the manifest comparison, print both and diff: a missing omitted-when-empty rule is the usual cause.

- [ ] **Step 7: Run the whole suite, format, lint, re-check `no_std`, commit**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
git add crates/wnft-format
git commit -m "feat(wnft-format): add the canonical writer (§7.3)

Validate, lay out, emit, frame — and emit nothing at all for a target a
conforming reader would reject, which is why encode returns a Result and not
a Vec. §8.2 items 2 and 3 are asserted at item 4's scope: the BIN chunk byte
for byte, the manifest after parsing. Q8 leaves number formatting free across
languages, so a second implementation cannot promise more than that about a
corpus the first one wrote, and asserting more would be asserting something
the specification has not decided.

serde_json's Map is a BTreeMap, so §7.3's code-point sort of params and info
is a property of the container rather than a step to remember — the one place
where this implementation gets for free what cost the TypeScript one a module.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: The fuzz target and the crate README

§8.4 requires property-based fuzzing with `cargo-fuzz`. It does **not** run in CI (it needs nightly and has no natural stopping point), so the README is what makes it reachable.

**Files:**
- Create: `crates/wnft-format/fuzz/Cargo.toml`
- Create: `crates/wnft-format/fuzz/fuzz_targets/decode.rs`
- Create: `crates/wnft-format/README.md`

**Interfaces:**
- Consumes: `decode`, `encode`, `DEFAULT_LIMITS` (Tasks 7–8).
- Produces: nothing the crate depends on.

- [ ] **Step 1: Write `fuzz/Cargo.toml`**

```toml
# Its own workspace: cargo-fuzz builds with nightly and libfuzzer, neither of
# which the crate or CI needs. The root workspace excludes this directory.
[package]
name = "wnft-format-fuzz"
version = "0.0.0"
publish = false
edition = "2024"
license = "LGPL-3.0-or-later"

[package.metadata]
cargo-fuzz = true

[dependencies]
libfuzzer-sys = "0.4"
wnft-format = { path = ".." }

[[bin]]
name = "decode"
path = "fuzz_targets/decode.rs"
test = false
doc = false
bench = false

[workspace]
```

- [ ] **Step 2: Write `fuzz/fuzz_targets/decode.rs`**

```rust
#![no_main]

//! §8.4: `decode` never panics, always terminates, and never allocates beyond
//! the limits — on any input at all.
//!
//! The interesting inputs are not random bytes, which die at the magic. Seed the
//! corpus from `fixtures/nft-target/0.2/` (see the crate README) and let the
//! fuzzer mutate real files: that is what reaches the manifest, the accessors
//! and the consistency gates.

use libfuzzer_sys::fuzz_target;
use wnft_format::{DEFAULT_LIMITS, decode, encode};

fuzz_target!(|data: &[u8]| {
    if let Ok(decoded) = decode(data, &DEFAULT_LIMITS) {
        // §8.4's round trip: whatever decoded is a target this writer can emit,
        // and what it emits decodes back to the same values. A decode that
        // succeeds on a file the writer then refuses would mean the two
        // disagree about what a valid target is.
        let bytes = encode(&decoded.target).expect("a decoded target must re-encode (§7.3)");
        let again = decode(&bytes, &DEFAULT_LIMITS).expect("canonical output must decode");
        assert_eq!(again.target, decoded.target);
        assert!(again.warnings.is_empty(), "canonical output warns about nothing");
    }
});
```

- [ ] **Step 3: Write `crates/wnft-format/README.md`**

Cover, in this order: what the crate is and that the specification is the source of truth (link it); that it is the format's second implementation and the TypeScript one is its peer, not its reference; the two public functions with a short example; `no_std` and the `std` feature; the limits and why they are configurable; and this section:

````markdown
## Fuzzing

§8.4 of the specification requires property-based fuzzing: random bit flips and
random counts, offsets and lengths, with the reader never throwing, always
terminating and never allocating beyond the limits. It is **not** part of CI —
it needs a nightly toolchain and has no natural stopping point — so run it by
hand when the decoder changes.

```bash
cargo install cargo-fuzz
rustup toolchain install nightly

# Seed the corpus from the real fixtures. Random bytes die at the magic (§4.1);
# mutations of real files are what reach the manifest and the accessors.
mkdir -p crates/wnft-format/fuzz/corpus/decode
cp fixtures/nft-target/0.2/*/*.wnft crates/wnft-format/fuzz/corpus/decode/

cargo +nightly fuzz run decode -- -max_total_time=300
```

A crash is written to `crates/wnft-format/fuzz/artifacts/decode/`. Reproduce and
minimise it with:

```bash
cargo +nightly fuzz run decode crates/wnft-format/fuzz/artifacts/decode/crash-<hash>
cargo +nightly fuzz tmin decode crates/wnft-format/fuzz/artifacts/decode/crash-<hash>
```

Then **add the minimised input as a regression test in `tests/`** — not to
`fixtures/`, which is the shared corpus and belongs to the generator (see
[`fixtures/nft-target/README.md`](../../fixtures/nft-target/README.md)).
````

- [ ] **Step 4: Verify the fuzz crate builds (nightly optional)**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo test -p wnft-format && cargo metadata --format-version 1 --no-deps > /dev/null
```

Expected: the root workspace still resolves and tests green — confirming `exclude` keeps the fuzz crate out of `--workspace`. If a nightly toolchain and `cargo-fuzz` are available, also run `cargo +nightly fuzz build` once; if not, say so plainly in the task report rather than claiming it was verified.

- [ ] **Step 5: Commit**

```bash
git add crates/wnft-format
git commit -m "test(wnft-format): add the cargo-fuzz decode target and the crate README

§8.4's fuzzing, out of CI because it needs nightly and has no natural
stopping point — so the README is what makes it reachable, including seeding
the corpus from the real fixtures, since random bytes die at the magic.

The target also asserts §8.4's round trip: anything decode accepts, encode
must emit, and that must decode back to the same values. A file the reader
takes and the writer refuses would mean the two disagree about what a valid
target is.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: CI, and the Rust commands in AGENTS.md

**Files:**
- Modify: `.github/workflows/CI.yml`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the crate and its tests.
- Produces: nothing code depends on.

- [ ] **Step 1: Add the `rust` job to `.github/workflows/CI.yml`**

Append, at the same indentation as `build-and-test`:

```yaml
    rust:
        runs-on: ubuntu-24.04

        # Separate from build-and-test, deliberately: the two toolchains share
        # the repository and the fixtures/ corpus and nothing else, so they have
        # no ordering between them and running them in parallel costs nothing.
        # `crates/wnft-format` consumes the corpus the TypeScript generator
        # produces (fixtures/nft-target/README.md) but does not build it, so it
        # needs no Node step.
        steps:
            - name: Checkout repository
              uses: actions/checkout@v7

            - name: Install the Rust toolchain
              uses: dtolnay/rust-toolchain@stable
              with:
                  components: rustfmt, clippy
                  # The no_std build below needs a bare-metal target, which is
                  # the only way to prove the crate really is no_std: a crate
                  # that accidentally depends on std still builds for the host
                  # with --no-default-features, because the host std is there.
                  targets: thumbv7em-none-eabihf

            - uses: Swatinem/rust-cache@v2

            - name: Format
              run: cargo fmt --all --check

            - name: Clippy
              # --all-targets so that the test suites are linted too: they are
              # where an `unwrap` on file-supplied data is most likely to slip in.
              run: cargo clippy --workspace --all-targets -- -D warnings

            - name: Test
              run: cargo test --workspace

            - name: Build for a no_std target
              run: cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
```

- [ ] **Step 2: Add the Rust commands to `AGENTS.md`**

In "Environment & commands", after the Node/npm bullets:

```markdown
- **Rust:** stable, 1.85 or newer (edition 2024); the crates live in a Cargo workspace at the repository root (`members = ["crates/*"]`), beside the npm workspaces. The two toolchains share this repository and the `fixtures/` corpus and nothing else — there is no build ordering between them.
  - Test: `cargo test --workspace`
  - Format: `cargo fmt --all --check`
  - Lint: `cargo clippy --workspace --all-targets -- -D warnings`
  - `no_std` check: `cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf` — a bare-metal target, because a crate that accidentally depends on `std` still builds for the *host* with `--no-default-features`. Install it once with `rustup target add thumbv7em-none-eabihf`.
  - These four are exactly what the `rust` job in [`.github/workflows/CI.yml`](./.github/workflows/CI.yml) runs. Do not claim a change is verified without actually running them.
  - Fuzzing (§8.4) is **not** in CI: it needs nightly and has no natural stopping point. See [`crates/wnft-format/README.md`](./crates/wnft-format/README.md).
```

In "Architecture — read this before editing", after the `examples/` bullet:

```markdown
- `crates/wnft-format` — the Rust codec for the `.wnft` target format. It is the format's **second** implementation and a **peer** of the TypeScript codec in `packages/nft-tracker/src/target/format`, not a port of it: [`docs/specs/nft-target-format.md`](./docs/specs/nft-target-format.md) is the source of truth, and the point of there being two implementations is that a specification with one is only a description of that one (§1). Implement from the specification text; if the two codecs disagree, that is a specification bug or a codec bug and it is decided before code is written.
- **`fixtures/nft-target/` is generated, shared, and read-only for Rust.** The TypeScript generator produces it; `crates/wnft-format` consumes it and MUST NEVER regenerate it. A second implementation that rebuilt the corpus from its own writer would be checking itself against itself, and §8.2 item 4 would prove nothing. See [`fixtures/nft-target/README.md`](./fixtures/nft-target/README.md).
```

- [ ] **Step 3: Verify the workflow parses and the commands are the ones CI runs**

```bash
export PATH="$PATH:/c/Users/perda/.cargo/bin" && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace && cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
python -c "import yaml; d=yaml.safe_load(open('.github/workflows/CI.yml')); print(sorted(d['jobs']))" 2>/dev/null \
  || grep -nE '^    [a-z][a-z-]*:$' .github/workflows/CI.yml
```

Expected: all four Rust commands green, and either `['build-and-test', 'rust']` from the parser or the two job keys from `grep`. PyYAML is not guaranteed on this machine and its absence is not a broken workflow — CI itself is the real check.

- [ ] **Step 4: Verify the npm side is still green**

The Rust work touches no TypeScript, but `AGENTS.md` says not to claim verification without running it, and Task 0 changed the specification the TypeScript codec cites.

```bash
npm run build && npm run typecheck && npm test
```

Expected: green. If `npm test` fails, it is unrelated to this branch — check `git stash`-clean `dev` before assuming otherwise.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/CI.yml AGENTS.md
git commit -m "ci: run fmt, clippy, tests and a no_std build for the Rust crate

A separate job from build-and-test: the two toolchains share the repository
and the fixtures corpus and nothing else, so they have no ordering between
them. The no_std check targets thumbv7em-none-eabihf rather than the host,
because a crate that accidentally depends on std still builds for the host
with --no-default-features.

AGENTS.md gains the four commands, and the two facts a newcomer to this
repository most needs about the crate: it is a peer of the TypeScript codec
rather than a port of it, and the fixtures are read-only on this side.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Completion

After Task 10:

1. **REQUIRED SUB-SKILL:** `superpowers:verification-before-completion` — run the four Rust commands and the three npm commands, and read their real output.
2. **REQUIRED SUB-SKILL:** `superpowers:requesting-code-review` — dispatch the `nft-reviewer` agent against the full branch diff.
3. **REQUIRED SUB-SKILL:** `superpowers:finishing-a-development-branch` — PR against **`dev`**, never `master`.

The PR body must call out, so a reviewer does not have to find them:

- The **five specification corrections** of Task 0, each with its reason, and that they are `0.2 rev 4` and change no valid file's bytes or meaning.
- That `encode` returns `Result<Vec<u8>, EncodeError>` rather than the brief's `Vec<u8>`, because §7.3 requires the writer to refuse rather than emit and §8.2 item 7 tests exactly that.
- That §8.2 items 2 and 3 are asserted at **item 4's scope** — `BIN\0` byte-identical, manifests equal after parsing — because Q8 leaves number formatting free across languages and the corpus was written by the other implementation.

…and it must carry this as an **open item**, under its own heading, not as a footnote:

```markdown
## Open item: two Task 0 rules have no fixture on either side

0.2 rev 4 makes two rules normative that the corpus does not exercise:

- a `kpIndex` that is a within-level **permutation** — `M = N`, no repeated
  value, levels agreeing — without `WKNF_multiview` (§5.6, §8.3);
- a `patchSize` of **0** (§5.7).

Both codecs implement both rules and agree, but **neither has coverage for
them**: no `invalid/` fixture produces either input, so the corpus would stay
green if one implementation regressed. That is precisely the class of
divergence §8.1's "one file per validation rule" exists to prevent, and it is
why these two were found by reading rather than by testing.

The fixtures are owed from the TypeScript generator
(`packages/nft-tracker/scripts/generate-fixtures.mjs`) in a follow-up, because
`crates/wnft-format` must never write to the shared corpus — a second
implementation that generated its own fixtures would be checking itself against
itself (`fixtures/nft-target/README.md`). Until that lands, the two rules are
covered by review only, on both sides.
```

Open the follow-up issue for those two fixtures at the same time as the PR, and link it from that section.
