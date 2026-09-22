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
- "Add support for X" splits two ways, and guessing wrong wastes a session.
  A new *option, field or method* that backends negotiate through
  `capabilities` belongs here, as an ordinary issue and PR — that is what
  #24 and #39–#42 are. A new *implementation* of something the contract
  already expresses belongs in a backend package. Only the first touches this
  package at all.
- A new member of `DescriptorKind` or `DescriptorNorm` is the one addition with
  a second obligation: `crates/wnft-format/src/known.rs` transcribes both
  unions by hand, so it moves in the same commit, and `npm run check:contract`
  is what proves it did.
