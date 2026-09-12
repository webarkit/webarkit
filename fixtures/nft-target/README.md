# `.wnft` conformance fixtures

The corpus §8.1 of [the target format specification](../../docs/specs/nft-target-format.md)
describes, shared by `vitest` and — once `crates/wnft-format` exists —
`cargo test`.

**These files are generated and must never be edited by hand.** They come from
[`packages/nft-tracker/scripts/generate-fixtures.mjs`](../../packages/nft-tracker/scripts/generate-fixtures.mjs),
which is committed and deterministic: no clock, no randomness, no environment.
A test regenerates the whole corpus and fails if a single byte differs, and
another fails if a file is present that the generator does not produce — so a
hand edit is caught, not merely discouraged.

**The corpus is shared; the generator's location is historical.** §8.1 makes
these fixtures the format's, not one implementation's, which is why they sit at
the repository root rather than inside `packages/nft-tracker`. The generator
lives under that package only because the TypeScript codec was written first
and is what produces the canonical `valid/` files — it is not the corpus's
owner, and nothing about the layout implies it is.

The consequence matters for [`crates/wnft-format`](../../docs/specs/nft-target-format.md),
the Rust codec: it **consumes these bytes and must never regenerate them.** A
second implementation that rebuilt the corpus from its own writer would be
checking itself against itself, and §8.2 item 4 — `BIN` chunks byte-identical,
manifests equal after parsing — would prove nothing. The whole value of a
shared corpus is that one implementation produced it and the other did not.

```bash
npm run fixtures -w @webarkit/nft-tracker   # builds, then regenerates
git status --short fixtures/                # must be clean
```

## Layout

One directory per **released format version**, frozen from then on (§8.3):
every reader either decodes a frozen file correctly or rejects it with an
explicit error, and never misreads it.

Inside `0.2/`:

| Directory | What it holds |
|---|---|
| `valid/` | Files that decode with **no** warnings, each produced by `encode` and therefore canonical by construction. `minimal.json` holds `minimal.wnft`'s decoded values, for §8.2 item 1. |
| `invalid/` | Files that must fail, one per error code of §6.2, one per validation rule of §§5.2–5.8, and one per I-JSON check of §5. |
| `warnings/` | Files that decode with an exact expected warning list. |
| `noncanonical/` | Valid files that are *not* what the canonical writer would emit. Each decodes to the same values as its counterpart and re-encodes to that counterpart's bytes — which is what makes §7.3's "a decoder keeps only what it understands" testable rather than a disclaimer. |

`expectations.json` is the machine-readable index — category, expected codes,
counterpart — and is generated alongside the files, so it cannot drift from
them. Two entries carry a `limits` override: that is how
`MANIFEST_TOO_LARGE` and `LIMIT_EXCEEDED` are tested without committing a
64 MiB file, and it exercises the configurable path §6.4 actually requires.

`.gitattributes` marks `*.wnft` as binary. The repository's root rule is
`text=auto`, and a corpus compared byte for byte cannot rest on git's content
heuristic.
