# CLAUDE.md — `@webarkit/cv-backend-jsfeatnext`

The canonical, tool-agnostic guidance for this package lives in **AGENTS.md**,
beside this file. It is imported below — treat it as the source of truth. The
repository-wide rules in the root `AGENTS.md` still apply on top of it.

@AGENTS.md

## Claude-specific notes

- Type errors in this package are very often a stale sibling build, not a bug
  here. Run the root `npm run build` before believing them — `typecheck`
  resolves against `cv-backend-spec`'s `dist/`, and chasing the "error" in this
  package's source is a well-worn way to waste a session.
- Don't tune `RANSAC_RESTARTS`, the restart loop or the run-scoring to make a
  test pass. That number is a measurement (#11). If a test disagrees with it,
  find out which is wrong before changing either, and say so explicitly rather
  than adjusting the constant until things go green.
- When adding a detector or descriptor family, the `capabilities` entry is part
  of the change, not a follow-up. And never add one speculatively: an honest
  empty list is worth more than an aspirational one, because nothing errors
  when the claim is false — results just get quietly worse.
- Don't reach into jsfeatNext's internals to work around a contract limitation.
  If the contract cannot express something, that is a `cv-backend-spec`
  conversation (and a new ADR), not a local escape hatch here.
