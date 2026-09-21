# AGENTS.md — `@webarkit/cv-backend-spec`

> Package-local instructions. The repository-wide rules in the root
> [`AGENTS.md`](../../AGENTS.md) still apply in full — this file adds what is
> specific to this package and never contradicts that one. Where they disagree,
> the root file wins and this one is the bug.

## What this package is

The **`CvBackend` contract, and nothing else**: types and interfaces, no
implementation. Three files in `src/` — `cv_backend.ts` (the contract),
`errors.ts`, `index.ts`.

Everything else in this repository is downstream of it. It builds **first**,
and `cv-backend-jsfeatnext` and `nft-tracker` both type-check against its
freshly-built `dist/`. A change here is never local.

## The invariants

**No runtime dependencies.** `dependencies` is empty and must stay empty. A
contract that depends on something has taken a side about how it is
implemented, which is the one thing this package exists not to do.

**No implementation, and no implementation-shaped types.** Neutral types only —
typed arrays and plain structs. No `matrix_t`, nothing jsfeatNext-specific,
nothing WASM-specific. If a type can only be produced by one backend, it does
not belong here.

**The dependency arrow is one-directional.** `cv-backend-jsfeatnext` depends on
this package; this package must never import from it, or from `nft-tracker`,
or from `examples/`.

**The public surface is `detect`, `describe`, `match`, `estimateHomography`,
`poseFromHomography`, and the optional `filterMatches`.** Do not change it
unless the task explicitly says to, and unless the change lands in the
implementing packages in the same PR. A change to the surface is an
architectural decision: it needs a **new** ADR in [`docs/adr/`](../../docs/adr/),
not an edit to an accepted one.

## The one drift the test suites cannot catch

`DescriptorKind` and `DescriptorNorm` in `src/cv_backend.ts` are
**hand-transcribed** into `crates/wnft-format/src/known.rs`. Nothing links the
two — no codegen, no shared schema, no test that compares them.

Adding or renaming a member on either union therefore has to be done in both
places, in the same commit. Skip the Rust side and the failure is invisible for
a long time: it appears only as a descriptor set that one codec warns about and
drops while the other accepts it, on a `.wnft` file no fixture contains, so the
shared corpus stays green. Check `known.rs` whenever you touch either union.

## Commands

| Command | Notes |
|---|---|
| `npm run build -w @webarkit/cv-backend-spec` | Or the root `npm run build`, which runs this first |
| `npm run typecheck -w @webarkit/cv-backend-spec` | `src/` **and** `test/` |
| `npm test -w @webarkit/cv-backend-spec` | Vitest |

After changing anything in `src/`, run the **root** `npm run build`,
`npm run typecheck` and `npm test` — not this package's alone. The point of a
contract change is its effect on the packages that implement and consume it,
and this package's own suite cannot see that.

Pre-1.0 and not published yet, but not `private`: `prepack` builds, so it is
publishable the day that is wanted. Don't write installation instructions that
assume it is on npm today.
