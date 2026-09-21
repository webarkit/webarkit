# CLAUDE.md — `@webarkit/cv-backend-spec`

The canonical, tool-agnostic guidance for this package lives in **AGENTS.md**,
beside this file. It is imported below — treat it as the source of truth. The
repository-wide rules in the root `AGENTS.md` still apply on top of it.

@AGENTS.md

## Claude-specific notes

- A change here is never confined to this package. Before proposing one, grep
  for every use of the symbol across `packages/*/src`, `examples/` and
  `crates/wnft-format/src/known.rs` — the last one is hand-transcribed and no
  test compares it against this file, so it is the one a search will save you
  from and a green suite will not.
- Don't widen a type to make a caller compile. The caller is usually the thing
  that is wrong, and widening the contract to accommodate one backend is how a
  neutral interface quietly becomes a description of that backend.
- If asked to "add support for X" here, the answer is almost always a change in
  an implementing package, not in this one. This package gains a member only
  when the contract genuinely needs a new vocabulary word — and then
  `crates/wnft-format/src/known.rs` needs it too, in the same commit.
