# AGENTS.md — `@webarkit/nft-tracker`

> Package-local instructions. The repository-wide rules are in the root
> [`AGENTS.md`](../../AGENTS.md) and still apply in full — this file adds what is
> specific to this package, and never contradicts that one. If it ever does,
> the root file wins and this one is the bug.

## What this package is

Natural-feature tracking for planar image targets, written **above** the
`CvBackend` contract, plus the TypeScript codec for the `.wnft` target format.
It is the decision of [ADR-0001](../../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md);
read that record before changing anything it covers.

Two things live here and are worth keeping apart in your head:

- `src/` — the tracker, and everything else the contract does not provide.
- `src/target/format/` — the `.wnft` codec. Its source of truth is
  [`docs/specs/nft-target-format.md`](../../docs/specs/nft-target-format.md),
  not this code. Where the two disagree, the specification wins and the code is
  the bug — and the Rust codec in `crates/wnft-format` is its **peer**, not its
  port.

`"private": true`: this package is never published. It is at version `0.1.0`
because that is its own first meaningful version, unrelated to the repository's
release tags.

## Commands

From the repository root (workspaces, so `-w @webarkit/nft-tracker` targets this
package):

| Command | Notes |
|---|---|
| `npm run build` | Root script only. This package builds **last**, after `cv-backend-spec` and `cv-backend-jsfeatnext`; that order is load-bearing |
| `npm run typecheck -w @webarkit/nft-tracker` | `src/` **and** `test/` |
| `npm test -w @webarkit/nft-tracker` | Vitest |
| `npm run fixtures -w @webarkit/nft-tracker` | Builds, then regenerates the `.wnft` corpus. See **Fixtures** below — this deletes a directory |
| `npm run compile-target -w @webarkit/nft-tracker` | `bin/compile-target.mjs`, the target compiler |

Note which step needs what. The **build** compiles `src/` only, so it needs the
spec's `dist/` and not any backend's — `src/` may not import one (below), and
that is why this package compiles with `cv-backend-jsfeatnext/dist` deleted.
The **typecheck** widens to `test/`, where a real backend is injected, so that
one does need the backend built.

`scripts/generate-fixtures.mjs` and `bin/*.mjs` import the built `dist/`, so a
stale build makes them fail in ways that look like logic errors. Build first.

## Dependency rule (ADR-0001, point 2)

**The only runtime dependency is `@webarkit/cv-backend-spec`.** Every backend —
`cv-backend-jsfeatnext` today, the WebARKitLib-rs adapter later — is a
**devDependency**, used by tests and examples only. The backend is injected by
the caller:

```ts
const cv = await createJsfeatNextBackend();
const tracker = new NftTracker(cv, target, K);
```

So nothing under `src/` may import jsfeatNext, `cv-backend-jsfeatnext`, or any
other backend. This is the rule most likely to be broken by a convenient
import, and the one that decides whether this package runs on every
implementation of the contract or on one.

## Portability rules for `src/` (ADR-0001, point 7)

These exist so a future Rust port stays cheap. They apply to `src/`, not to
`test/` or `bin/`:

- **Pure core.** No DOM, timers, `requestAnimationFrame`, workers or camera
  access. Input is a `GrayImage` and a timestamp; output is a result. The
  application owns the loop.
- **Explicit result types** (`{ ok, ... }`). Exceptions are for contract
  violations, never for control flow.
- **Fixed-shape data.** Typed arrays and plain structs, no dynamic property
  bags.
- **Determinism.** Every random choice goes through an injectable RNG, so
  fixtures reproduce.
- **Float64 geometry**, as the contract requires.

## Fixtures — read before running `npm run fixtures`

`scripts/generate-fixtures.mjs` **clears its output directory before writing**,
so that a fixture retired from the script cannot survive as a stale file the
suites keep reading.

That makes the output path safety-critical, and it is why no format version is
written by hand anywhere in that script. It derives from
`SUPPORTED_FORMAT_VERSION` in `src/target/format/known.ts`, so bumping the
format writes a **new** directory and the previous one is never opened. A
literal there would mean that the one time someone bumps the constant and
forgets the path, the generator deletes and rewrites the frozen corpus of a
released version — the thing §8.3 requires every future reader to keep intact.
A guard refuses to delete anything that is not
`fixtures/nft-target/<supported version>/`; do not weaken it.

Also:

- `fixtures/nft-target/0.2/` is **frozen**. Never regenerate it, never edit it.
  Both codecs carry a test that every file in it is rejected with
  `UNSUPPORTED_FORMAT_VERSION`.
- `crates/wnft-format` **consumes** the corpus and must never write to it. A
  second implementation that rebuilt the fixtures from its own writer would be
  checking itself against itself.
- `examples/targets/pinball.wnft` is generated but committed, and
  `crates/wnft-format/tests/real_target.rs` asserts on its contents.
  Recompiling it is a change to that test's expectations, not a refresh: update
  both in one commit, or do not recompile.

## `known.ts` is one end of a hand-made link

`src/target/format/known.ts` enumerates the contract's `DescriptorKind`,
`DescriptorNorm` and `DetectorKind` unions, and `crates/wnft-format/src/known.rs`
transcribes the same lists by hand for the peer codec. TypeScript pins its end
at compile time (`satisfies`, plus an `Exclude<...>` guard for the other
direction); Rust has no view of the union at all.

So after touching `known.ts`, run `npm run check:contract`. It is the only
thing that compares the two codecs' lists, and neither test suite can: a member
in one and not the other only shows up on a `.wnft` file no fixture contains.

## Before you open a PR

Beyond the root file's rules: run the `nft-reviewer` agent on the diff. It
checks this package against ADR-0001, the format specification and the root
`AGENTS.md`, and it is read-only.
