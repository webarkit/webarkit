# AGENTS.md — `@webarkit/cv-backend-jsfeatnext`

> Package-local instructions. The repository-wide rules in the root
> [`AGENTS.md`](../../AGENTS.md) still apply in full — this file adds what is
> specific to this package and never contradicts that one. Where they disagree,
> the root file wins and this one is the bug.

## What this package is

jsfeatNext's implementation of the `CvBackend` contract, and the org's
**numeric oracle**: when another implementation disagrees with this one, this
one is the reference until proven otherwise (ADR-0001, context).

It depends on **both** `@webarkit/cv-backend-spec` (pinned exactly, `0.1.0`)
and `@webarkit/jsfeat-next` (`^0.17.0`). Neither depends on it — keep that
arrow one-directional.

It builds **second**, after the spec. Its `typecheck` resolves against the
spec's built `dist/`, so a stale or missing sibling build shows up here as type
errors that look like real bugs in this package and are not. When in doubt, run
the root `npm run build` first.

## `estimateHomography` — read the README before touching it

`RANSAC_RESTARTS = 3` in `src/jsfeatnext_backend.ts` is an **empirical** value,
not a default. It comes from the investigation in
[webarkit/webarkit#11](https://github.com/webarkit/webarkit/issues/11): two
independent `find_homography` restarts were measurably not enough, three were.
This package's own [`README.md`](./README.md) carries that section; read it
before changing the constant, the restart loop, or the scoring that picks the
best run.

Lowering it because "three seems arbitrary" undoes a measurement. If it should
change, it changes with a new measurement attached.

## Capability negotiation must stay honest

`capabilities` in `src/jsfeatnext_backend.ts` currently declares
`detectors: ["fast"]`, `descriptors: ["orb"]`, `matchFilters: []`.

**Never add an entry the API cannot actually reach.** `matchFilters` is empty
because `filterMatches` is not implemented here — that empty array is a true
statement, not an oversight, and filling it in without implementing the method
would make every caller's negotiation silently wrong. Callers choose backends
by these lists and get no error when the claim turns out to be false; they get
worse results. The README's own notes on `detectors`/`matchFilters` explain
why this matters.

The same rule applies in the other direction: implementing a new detector or
descriptor family is only finished when `capabilities` says so.

## Commands

| Command | Notes |
|---|---|
| `npm run build` (root) | Builds the spec first; do this rather than the per-package build when anything in the spec has moved |
| `npm run typecheck -w @webarkit/cv-backend-jsfeatnext` | Needs the spec's `dist/` to resolve |
| `npm test -w @webarkit/cv-backend-jsfeatnext` | Vitest. Tests import this package's own `src/`, not its `dist/` |

## Keeping the README true

This package's README is read by humans deciding whether to adopt the contract,
and it documents behaviour this package chose empirically. It has already had
to be corrected once, after #11/#12 landed, because its `estimateHomography`
section and its stated jsfeatNext version requirement had drifted from the
code. Treat a behaviour change here as a README change in the same PR.
