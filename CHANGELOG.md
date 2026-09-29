# Changelog

All notable changes to this repository are recorded here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions are the repository's
release tags, which every package and crate share ([ADR-0002](docs/adr/0002-lockstep-versioning.md)).

The `.wnft` target format has a version of its own, set by
[`docs/specs/nft-target-format.md`](docs/specs/nft-target-format.md) §7 and never aligned with
the release number. Each entry below says which format version that release's two codecs speak.

A pull request that changes behaviour adds its own line under **Unreleased**, in the same pull
request. At release time that section becomes the version's entry, and the same text is the
release pull request's body and the GitHub Release's notes.

## [Unreleased]

`.wnft` format: still **0.3**.

### Added

- **External detection in `NftTracker`** ([#78](https://github.com/webarkit/webarkit/pull/78)):
  re-detection can now run off the frame, in a worker the application owns. The detection
  pipeline is exported as two pure functions, `prepareDetection` (once per target) and
  `detectTarget` (once per frame), whose result is a fixed-shape `Detection` that survives
  `structuredClone`. `process` takes it as an optional third argument: on a frame that ends
  without a lock the tracker locks on its homography and confirms it with a tracking step on that
  same frame, `"TRACK"` if it holds and `"LOST"` with the new reason `"unconfirmed"` if not. The
  option `externalDetection: true` makes the tracker never detect itself: a frame without a lock
  and without a handed-in detection is `"LOST"` with the new reason `"no-detection"`, makes no
  backend call, and says `needsDetection: true`. Every result carries three new fields,
  `needsDetection`, `detectionUse` and `detectionLatencyMs`. With the option off and no detection
  handed in, the tracker behaves exactly as in 0.3.0; a parity test pins it. The package still
  owns no worker; a worker demo is a follow-up.
- This changelog, and the release procedure in `CONTRIBUTING.md` ("Releasing"), which now also
  creates a GitHub Release per tag
  ([#77](https://github.com/webarkit/webarkit/pull/77), [#72](https://github.com/webarkit/webarkit/issues/72)).

### Changed

- **Every package and the crate now carry the release version**, `0.3.0` today, in lockstep with
  the repository's tag ([ADR-0002](docs/adr/0002-lockstep-versioning.md),
  [#77](https://github.com/webarkit/webarkit/pull/77),
  [#79](https://github.com/webarkit/webarkit/pull/79)): `@webarkit/cv-backend-spec`,
  `@webarkit/cv-backend-jsfeatnext`, `@webarkit/nft-tracker` and `wnft-format`, with the exact
  pins between the packages. `npm run check:contract` now fails when a version, a pin or a
  lockfile disagrees. The `.wnft` format version is not part of this and stays 0.3.
- `NftTracker` and `prepareDetection` refuse a detection option out of its domain with a
  `RangeError` naming it — `sceneLevels` and `maxSceneKeypoints` not an integer of at least 1,
  `ratio` outside `(0, 1]`, `ransacThreshold` not finite and positive — where 0.3.0 passed the
  value to the backend and, for `maxSceneKeypoints: NaN`, silently detected nothing
  ([#78](https://github.com/webarkit/webarkit/pull/78)).
- **`compile-target` selects 48 tracking patches by default (was 64)**, and so spaces them 62 px
  apart on pinball (was 54), by its unchanged spacing rule; `examples/targets/pinball.wnft` is
  recompiled with them and now carries one level-1 patch among 47 of level 0. On the reference
  device this cut the tracking step 21–29% at p50 and 24–29% at p95 on every bundled clip,
  without losing lock or steadiness on those clips; the step's p95 is still 15–20 ms, about
  twice ADR-0001 point 5's 8 ms. **It costs accuracy where no clip could show it:** on the
  tracker's synthetic ground truth, as a target leaves the frame, the poses fitted to the few
  patches still in view are up to 3.4 px RMS off over the whole target (8.2 px at its far point),
  where 64 patches were 1.2 (2.5); the part in view stays within 0.36 px. On the same ground
  truth's single steps it accepts no wrong fit, where 64 patches accepted 24 of 1,370. Both are
  now pinned by tests on the committed target (round 4 of the tuning pass). A target compiled
  with the old default keeps working: the patch count is data, not format. Measurements before
  and after this change ran on different targets and are not directly comparable
  ([`docs/benchmarks/README.md`](docs/benchmarks/README.md), "M3: the tuning pass", rounds 2
  and 4).

## [0.3.0] - 2026-09-26

M2 of [ADR-0001](docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md), patch tracking,
complete ([#74](https://github.com/webarkit/webarkit/pull/74), [#48](https://github.com/webarkit/webarkit/issues/48)).
`.wnft` format: **0.3**, in both codecs. The package manifests still read `0.1.0` at this tag;
ADR-0002 point 3 records why they are aligned only after it.

### Added

- **Patch tracking.** `NftTracker` is a `LOST → DETECT → TRACK` state machine. It still finds the
  target by detection; once it has a lock it follows the target frame to frame without running
  `detect`, `describe` or `match`: a constant-velocity prediction of the homography, the stored
  patches aligned on a pyramid of the live frame by inverse-compositional Lucas–Kanade, and a
  robust homography fitted to them. A step that fails drops the lock, says why in `trackLoss`, and
  detects again on the same frame. Every result now carries `state`, `quality`, `trackLoss`, the
  step's patch counts in `tracking`, and `timings` when a `clock` is injected; `detectionOnly:
  true` keeps 0.2.0's behaviour. Everything runs inside `process()`, on the caller's frame loop.
- The tracking building blocks, exported for use on their own: `selectPatches`,
  `buildFramePyramid`, `alignPatch`, `robustHomography`, `predictHomography`, with their types in
  `src/tracking/types.ts`.
- `compile-target` selects tracking patches and writes them into the `.wnft` (spec §5.7);
  `examples/targets/pinball.wnft` is recompiled with 64 of them. A target without patches, such
  as one from `buildTargetFromImage`, is tracked in detection-only mode.
- `validate-target` (`npm run validate-target -w @webarkit/nft-tracker`), which answers two
  questions about a `.wnft` file: is it valid, and can a backend actually use it.
- `@webarkit/cv-backend-spec/purity`, an opt-in conformance check that a backend's `detect`,
  `describe`, `match` and `poseFromHomography` are pure functions of their arguments. The contract
  now states that guarantee, with `estimateHomography`, which samples randomly, as the one
  exception ([#54](https://github.com/webarkit/webarkit/pull/54)).
- `examples/bench-nft.html`: a tracking mode beside the stateless and detection-only ones, a
  `maxKeypoints` parameter, a processing-box size, a rear or front camera choice, and a static
  bundled clip for jitter. The on-device results on the reference tablet and a second phone are in
  `docs/benchmarks/`, with the measurement plans they answer.

### Changed

- **`.wnft` format 0.3 — breaking for target files.** An explicit `null` on `extensionsUsed` or
  `extensionsRequired` is now `BAD_MANIFEST`, like every other optional key, where 0.2 read it as
  an empty list. That narrowing makes 0.3 a new minor, and under the exact-minor rule of spec §7.1
  a 0.3 reader rejects **every** 0.2 file with `UNSUPPORTED_FORMAT_VERSION`, not only the ones
  with such a `null`. **Targets written by 0.2.0's tooling must be recompiled** with
  `compile-target`. Also in 0.3: a reader preserves a file's `descriptorSets` order instead of
  sorting it, and bounds the accessor bytes it materialises by the `BIN` chunk's length.
  `fixtures/nft-target/0.3/` is frozen by this tag, as `0.2/` was by 0.2.0; both codecs keep
  rejecting the frozen 0.2 corpus ([#47](https://github.com/webarkit/webarkit/pull/47)).
- `@webarkit/cv-backend-spec` gained an `exports` map: the package root and the `./purity`
  subpath are the only importable entry points, so a deep import into its `dist/` no longer
  resolves ([#54](https://github.com/webarkit/webarkit/pull/54)).
- For contributors: prettier formats every TypeScript file under `packages/*/src`,
  `packages/*/test`, `packages/*/bin` and `scripts/`, checked in CI by `npm run format:check`
  ([#52](https://github.com/webarkit/webarkit/pull/52)); every package carries its own
  `AGENTS.md` ([#49](https://github.com/webarkit/webarkit/pull/49)).
- Measured, not changed: on the reference device a tracking-state frame still misses the 33 ms
  budget, and the tracking step alone exceeds ADR-0001 point 5's 8 ms at p95, which the ADR
  records under "To revisit". The tracking thresholds are provisional defaults until the tuning
  pass, and re-detection still runs on the frame.

## [0.2.0] - 2026-09-19

M1 of [ADR-0001](docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md), the NFT tracker as a
TypeScript reference above the contract, complete ([#45](https://github.com/webarkit/webarkit/pull/45)).
`.wnft` format: **0.2**, in both codecs, the first format version released. The `CvBackend`
contract surface is unchanged since 0.1.0, and the package manifests were left at `0.1.0`.

### Added

- **`@webarkit/nft-tracker`** (private, not published): `NftTracker`, a stateless-per-frame
  tracker that runs `detect → describe → match → estimateHomography → poseFromHomography` against
  any backend, matching the target one pyramid level at a time, at exact parity with the demo
  pages' own pipeline; `buildTargetFromImage`, which trains a target in memory; and the
  TypeScript codec for the `.wnft` target format, `decode` and `encode`, with a generated fixture
  corpus under `fixtures/nft-target/0.2/` that this tag freezes.
- `compile-target` (`npm run compile-target -w @webarkit/nft-tracker`), which writes a `.wnft`
  from an image; `examples/targets/pinball.wnft` is its committed output, and the static demo can
  load it instead of building the target in the page.
- **`crates/wnft-format`**, a Rust codec for the same format, written from the specification as
  a second, independent implementation rather than a port, with fuzz targets and a `no_std`
  build, checked in CI alongside the npm workspaces.
- The target format's specification, [`docs/specs/nft-target-format.md`](docs/specs/nft-target-format.md),
  and ADR-0001, which places the tracker above the contract and sets the measured criterion for a
  Rust port.
- `examples/bench-nft.html`, a per-frame pipeline benchmark: the stateless pipeline against
  `NftTracker`, p50/p95/max per stage, bundled reference clips, a JSON export. The first on-device
  baselines, on the reference tablet and a second phone, are in `docs/benchmarks/`, read against
  ADR-0001's real-time budget.

### Changed

- The per-level matching helpers moved out of `examples/js/pinball-shared.mjs` into the package
  as `buildLevelIndex` and `matchPerLevel`; the demos import them from `@webarkit/nft-tracker`.
- `@webarkit/cv-backend-jsfeatnext` requires `@webarkit/jsfeat-next` `^0.17.0` (was `^0.16.0`).

### Fixed

- Under jsfeat-next 0.16, `detect` was not a pure function of its input: FAST read one
  uninitialised scratch cell per image row, so results drifted with call history. Fixed upstream
  in 0.17, which the backend now requires; the tracker's tests pin detection counts on the
  committed fixtures to catch a regression of that class.

## [0.1.0] - 2026-09-06

The first release, tagged "First cv-backend version". No release notes were written for it:
[#19](https://github.com/webarkit/webarkit/pull/19) is a `dev` to `master` promotion note, so
this entry is reconstructed from what the tag contains. No `.wnft` format existed yet.

### Added

- **`@webarkit/cv-backend-spec`**, the `CvBackend` contract: `detect`, `describe`, `match`,
  `estimateHomography`, `poseFromHomography`, the optional `filterMatches` and
  `detectAndCompute`, over neutral types (typed arrays and plain structs, Float64 geometry).
  Backends declare what they implement in `capabilities`, callers select a descriptor family with
  `DescribeOptions.kind`, an unsupported explicit request throws `UnsupportedCapabilityError`
  rather than substituting, and `match` rejects mismatched descriptor sets with
  `DescriptorMismatchError`.
- **`@webarkit/cv-backend-jsfeatnext`**, the jsfeatNext implementation of that contract and the
  organisation's numeric oracle: FAST detection over a pyramid with a keypoint cap, ORB
  descriptors, ratio and cross-check matching, and a RANSAC homography that restarts
  `find_homography` internally and keeps the best model. Depends on `@webarkit/jsfeat-next`
  `^0.16.0`.
- Two demo pages, `examples/pinball-static-jsfeatnext-backend.html` and
  `examples/pinball-webcam-jsfeatnext-backend.html`, exercising the whole pipeline on still images
  and on a live camera, with the shared glue in `examples/js/pinball-shared.mjs`.
- The npm-workspaces monorepo, CI (build, typecheck, test), the LGPL-3.0-or-later licence with
  per-file headers, `CONTRIBUTING.md`, a Code of Conduct, and agent instructions.

### Removed

- The original single-page jsartoolkitNFT demo the repository started as. It is kept at the tag
  `archive/original-nft-demo`.

[Unreleased]: https://github.com/webarkit/webarkit/compare/v0.3.0...dev
[0.3.0]: https://github.com/webarkit/webarkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/webarkit/webarkit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/webarkit/webarkit/releases/tag/v0.1.0
