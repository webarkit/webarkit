# ADR-0002: Lockstep versions — one number for the release tag and every package

**Status:** Accepted
**Date:** 2026-09-27
**Deciders:** @kalwalt

## Context

This repository has two versioning systems that look alike and have not agreed since `v0.1.0`.

- **The release tags.** `v0.1.0` named the `cv-backend-*` packages' first version ("First cv-backend version"). `v0.2.0` and `v0.3.0` mark milestones M1 and M2.
- **The manifests.** `@webarkit/cv-backend-spec`, `@webarkit/cv-backend-jsfeatnext`, `@webarkit/nft-tracker` and the `wnft-format` crate all still read `0.1.0`.

A reader who sees `v0.3.0` on the repository, opens a `package.json` and finds `0.1.0` has no way to tell which number is true.

The divergence was deliberate but never practised as a scheme.
- #45 left `cv-backend-spec` and `cv-backend-jsfeatnext` at `0.1.0` because their code had not changed.
- Since then, `cv-backend-spec` gained an entry point (#54) and `wnft-format` moved to format 0.3 (#47), neither with a bump.
- The only version ever raised was `nft-tracker`'s, from `0.0.0` to `0.1.0` (#46).

**The packages move together.**
- Every release has changed several of them at once.
- They pin each other exactly: `cv-backend-jsfeatnext` depends on `cv-backend-spec` at exactly `0.1.0`, and `nft-tracker` on both. So raising the spec's version already obliges its dependents to change their pins.
- Nobody consumes one of them on its own.

**Nothing is published.** On 2026-09-27, `npm view` returned `E404` for all three packages, and crates.io returned 404 for `wnft-format`. So these numbers mislead readers but break no consumer, and whatever is decided now, nothing downstream has to migrate. That stops being true at the first publication.

**The `.wnft` format version (0.3) is a third number, and a different kind of thing.** It versions a file format, not a package, and changes by the rules of [`docs/specs/nft-target-format.md`](../specs/nft-target-format.md) §7. A release ships whatever format version its codecs speak and freezes that version's fixture corpus (§8.3). Several releases may ship the same format version.

## Decision

1. **Lockstep.** The repository's release tag `vX.Y.Z` and the version of every package and crate it contains are one number, `X.Y.Z`. That covers `@webarkit/cv-backend-spec`, `@webarkit/cv-backend-jsfeatnext`, `@webarkit/nft-tracker` (private, but versioned all the same) and `wnft-format`. They are raised together at each release, including a package that has not changed since the last one. Harnesses that are never published and exist only to test them, such as `wnft-format-fuzz`, are not part of it.
2. **The `.wnft` format version is not part of it.** It stays independent and is never "aligned" with the release number.
3. **The existing tags are not rewritten.** `v0.2.0` and `v0.3.0` keep the manifests they were cut with, and the manifests are aligned after `v0.3.0`. The first release after `v0.3.0` is the first since `v0.1.0` in which the tag and every manifest say the same thing.

## Options considered

### Option A — Lockstep (chosen)

**Pros:** The tag and the manifests make the same statement. It matches how the packages actually move: together, with exact pins. Each release costs a handful of version fields. It is what webarkit/purecv and webarkit/WebARKitLib-rs practise across their crates and npm packages.
**Cons:** A package that did not change still gets a new number, so the number says nothing about which package changed.

### Option B — Independent per-package versions

Each package is raised on its own changes. The repository's tags would then have to stop looking like package versions, for example by naming the milestone instead (`m2-complete`). Otherwise the ambiguity this ADR removes survives.

**Pros:** A version tells a consumer whether that package changed.
**Cons:** It needs a bump discipline the repository has never practised, since three packages changed without one. A spec bump still cascades through the exact pins. And the rename touches a tag scheme the format specification already cites ("released as `v0.2.0`", §8.3).

### Option C — Leave it as it is

**Pros:** No work.
**Cons:** Two numbers that look alike and disagree, with nothing to say which one is true. That is the problem, not a scheme.

## Trade-off analysis

The deciding trade-off is **per-package precision** against **one number a reader can trust**. Per-package precision is worth something only to a consumer of a single package, and today there is none. One legible number is worth something to every reader now.

## Consequences

**Easier:**

- A reader sees one version everywhere: on the tag, in every manifest, and in the release notes.
- The exact pins between the packages move with the release instead of drifting.

**Harder:**

- Every release changes every manifest, including those of packages that did not change.
- The same number lives in several files that must agree. Review alone will not keep that true, so it needs a mechanical check.

**To revisit:**

- **When the first real consumer depends on a single package independently of the others.** For example, a project that implements its own backend against `@webarkit/cv-backend-spec`, or reads targets with `wnft-format` alone.
  - At that point, a version that moves for changes that package does not contain costs that consumer something real: upgrades that change nothing, and release notes that do not concern it. Independent versions start to earn their discipline, beginning with that package.
  - Splitting then is easy: that package keeps versioning from the lockstep number on its own changes.
  - Merging back is not. Once independent versions have been published, returning to one number means some package jumps or goes backwards, and a published version cannot be reused.

## References

- #72, and its discussion.
- #45 and #74, the `v0.2.0` and `v0.3.0` release PRs. #46, the only version bump so far.
- [ADR-0001](./0001-nft-tracker-ts-reference-above-cvbackend.md) point 6, and [`docs/specs/nft-target-format.md`](../specs/nft-target-format.md) §7 and §8.3, for the format version.
