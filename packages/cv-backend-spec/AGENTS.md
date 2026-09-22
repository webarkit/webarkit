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

"Implementation" means *of the contract*. Code that checks conformance **to**
the contract is the exception, and `src/purity.ts` is the one that exists: it
contains no computer vision and names no backend, it calls the contract's own
methods and compares their outputs. A contract nobody can conformance-check is
a contract in name only, and a check living in one backend's test suite
protects that backend alone — the next implementation reintroduces the bug and
nothing notices (#27). Such code stays framework-agnostic: it returns findings,
the caller asserts, and this package gains no test-runner dependency.

**The dependency arrow is one-directional.** `cv-backend-jsfeatnext` depends on
this package; this package must never import from it, or from `nft-tracker`,
or from `examples/`.

**The public surface is `detect`, `describe`, `match`, `estimateHomography`,
`poseFromHomography`, and the optional `filterMatches`.** Two kinds of change
to it, and they do not carry the same bar. The contract's own header draws the
line: *"Omitting an option is always valid and selects the backend default, so
a caller written against the unamended contract keeps working unchanged."*

**Adding an optional field or method, negotiated through a capability, is an
issue and a PR.** No ADR. That is how this contract has actually grown — the
optional `filterMatches` arrived that way
([webarkit/jsfeatNext#129](https://github.com/webarkit/jsfeatNext/issues/129)),
and every open contract issue is additive in the same shape: an injectable RNG
for RANSAC ([#24](https://github.com/webarkit/webarkit/issues/24)), the pyramid
scale step as a capability ([#39](https://github.com/webarkit/webarkit/issues/39)),
a guard on descriptor bit compatibility ([#40](https://github.com/webarkit/webarkit/issues/40)),
`matchKnn` ([#41](https://github.com/webarkit/webarkit/issues/41)), and detector
and estimator selectors ([#42](https://github.com/webarkit/webarkit/issues/42)).
Two things make such a change complete rather than half-landed: the
implementing packages move in the same commit, and the capability tells the
truth — an optional member that no `capabilities` entry declares is a member no
caller can reach.

**Removing or changing an existing member, or changing a guarantee the contract
makes, needs a new ADR** in [`docs/adr/`](../../docs/adr/) — a new one, never an
edit to an accepted one. The guarantees are the ones its header states and
callers build on: the surface is **stateless** (no per-frame state, all inputs
passed explicitly), its calls are **synchronous**, and **outputs are owned by
the caller**. Those cannot be walked back in an ordinary PR, because nothing in
a changed type signature would show that they had been.

## The one drift the test suites cannot catch

`DescriptorKind` and `DescriptorNorm` in `src/cv_backend.ts` are
**hand-transcribed** into `crates/wnft-format/src/known.rs`. Nothing links the
two — no codegen, no shared schema, and no test in either suite that compares
them.

Adding or renaming a member on either union therefore has to be done in both
places, in the same commit. Skip the Rust side and the failure is invisible for
a long time: it appears only as a descriptor set that one codec warns about and
drops while the other accepts it, on a `.wnft` file no fixture contains, so the
shared corpus stays green.

`npm run check:contract` is what catches it. Run it after touching either
union — a green `npm test` and `cargo test` prove nothing here, which is the
whole reason that script exists. It also checks the TypeScript codec's own
`known.ts` lists against these unions, and both codecs' supported format and
container versions against each other.

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
