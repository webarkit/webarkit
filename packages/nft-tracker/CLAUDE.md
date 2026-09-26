# CLAUDE.md — `@webarkit/nft-tracker`

The canonical, tool-agnostic guidance for this package lives in **AGENTS.md**,
beside this file. It is imported below — treat it as the source of truth. The
repository-wide rules in the root `AGENTS.md` still apply on top of it.

@AGENTS.md

## Claude-specific notes

- `npm run fixtures` **deletes** `fixtures/nft-target/<supported version>/`
  before rewriting it. Never run it to "see what happens", and never run it to
  resolve a corpus diff you have not first explained: the point of that diff is
  that a fixture changed, and regenerating hides the change instead of
  answering for it. Regenerate only when the generator itself changed, and say
  in the commit message what moved and why.
- When a corpus fixture and a codec disagree, the specification decides, not
  whichever side is easier to edit. Read
  `docs/specs/nft-target-format.md` and fix the side that is wrong — changing a
  fixture to match a codec is how a specification quietly becomes a description
  of one implementation.
- Don't reach for `crates/wnft-format`'s source when implementing something
  here, or the other way round. The two codecs are peers implemented from the
  specification text; reading one to write the other is exactly what makes a
  second implementation worthless as a check on the first (ADR-0001, point 6).
