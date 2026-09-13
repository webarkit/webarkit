# `wnft-format`

Reader and canonical writer for the WebARKit `.wnft` NFT target format
(format **0.2**). The specification is the source of truth:
[`docs/specs/nft-target-format.md`](../../docs/specs/nft-target-format.md).
Section references throughout this crate and this README (§4.2, §6.1, …)
point into it — where code and document disagree, the document wins and the
code is the bug.

This crate is the format's **second** implementation. The first is the
TypeScript codec in [`packages/nft-tracker`](../../packages/nft-tracker). They
are peers: the point of having two implementations is that a specification
with only one is merely a description of that one (§1), not a project one of
them can claim to be "the reference" for. If the two ever disagree, that is a
specification bug or a codec bug, decided from the specification text before
either side's code is changed.

Neither this crate nor `@webarkit/nft-tracker` is published yet (both are
pre-1.0). Depend on it from within this repository — a path dependency, or a
workspace member — rather than expecting `cargo add wnft-format` to resolve
from crates.io.

## Usage

```rust
use wnft_format::{DEFAULT_LIMITS, decode, encode};

# fn run(bytes: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
let decoded = decode(bytes, &DEFAULT_LIMITS)?;
println!("{}x{}", decoded.target.meta.width_px, decoded.target.meta.height_px);

let canonical = encode(&decoded.target)?;
assert_eq!(decode(&canonical, &DEFAULT_LIMITS)?.target, decoded.target);
# Ok(())
# }
```

- `decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, DecodeError>` runs
  the gates of §6.1 in the order that section fixes and never panics: a
  `.wnft` may come from a URL an application's user chose, so a hostile file
  is a value, not an incident.
- `encode(target: &Target) -> Result<Vec<u8>, EncodeError>` writes the
  canonical form of §7.3. It returns a `Result`, not a bare `Vec<u8>`, because
  §7.3 requires the writer to refuse a `Target` it cannot express canonically
  rather than emit something invalid.

## `no_std`

The crate needs an allocator and nothing else, so a `.wnft` decodes on a
bare-metal target as well as on a desktop. The `std` feature, **on by
default**, adds `std::error::Error` impls for the error types and pulls in the
standard allocator; disable it with `--no-default-features` for a `no_std`
build (CI checks this against `thumbv7em-none-eabihf`, since a crate that
accidentally depends on `std` still builds for the host without the feature).

## Limits

§6.4 requires resource limits on untrusted input — file size, manifest size,
levels, keypoints, descriptor sets, patch size and count — to be enforced
*and* to be configurable. `DEFAULT_LIMITS` is a reasonable ceiling for files
from an untrusted source; an application that generates its own targets and
knows they are larger can raise specific fields:

```rust
use wnft_format::{DEFAULT_LIMITS, Limits};

let limits = Limits { max_keypoints: 200_000, ..DEFAULT_LIMITS };
```

Every allocation this crate makes is checked against these limits before it
happens, in proportion to a number the file itself supplied — that is the
whole reason the struct exists rather than a single hard-coded ceiling.

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
