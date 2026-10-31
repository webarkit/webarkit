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

### Added

- **A provenance preflight, which CI runs after the build**
  ([#136](https://github.com/webarkit/webarkit/issues/136)): `npm run check:provenance`
  (`scripts/provenance-preflight.mjs`) exits 0 when `examples/dist/provenance.json` describes the
  checkout (its head is `HEAD`, the tree is clean over the paths the build's `clean` covers, and
  every file it hashes hashes the same on disk, `served` listing what `SERVED` names), 1 when it
  does not, one line per finding and the remedy, and 2, naming the field, on a manifest it cannot
  read or whose fields have the wrong shape. It asks git three times per run, however many files
  the manifest lists. `npm test` no longer asks whether the manifest describes the tree, which
  failed after every edit until the next build: it asserts the manifest's agreement with itself and
  with the bundle beside it, with no git call.

### Fixed

- **The bench page's Start can be pressed again after a provenance check that throws**
  ([#205](https://github.com/webarkit/webarkit/issues/205)). Such a start ended with Start
  disabled until the page was reloaded. It now ends as a failed start, with Start and the probe set
  as after a refusal. The check throws, for example, on a manifest that parses but whose `served`
  holds a null entry; a manifest that cannot be fetched or parsed never threw, and a session run
  already refused it.

## [0.6.0] - 2026-10-30

The "M5 — the post-campaign window" milestone
([milestone 6](https://github.com/webarkit/webarkit/milestone/6)), which restored what M4's
campaign froze. It closes on [#120](https://github.com/webarkit/webarkit/issues/120),
[#127](https://github.com/webarkit/webarkit/issues/127),
[#130](https://github.com/webarkit/webarkit/issues/130) and
[#137](https://github.com/webarkit/webarkit/issues/137). `.wnft` format: still **0.3**, in both
codecs, so this tag freezes no new corpus.

### Added

- **`RansacOptions.rng` and the `deterministicRansac` capability**
  ([#24](https://github.com/webarkit/webarkit/issues/24)), additive: an optional uniform source in
  [0, 1) for `estimateHomography`'s RANSAC sampling, honoured by `cv-backend-jsfeatnext`, which
  declares `deterministicRansac: true`; without it, behaviour is unchanged.
- **The stall check is a tested module, with its command**
  ([#117](https://github.com/webarkit/webarkit/issues/117)): `stallCheck` in
  `examples/js/bench-stall.mjs`, and `node scripts/stall-check.mjs <export.json>`. Its logic is
  moved in unchanged from the copy embedded in M3's record (SHA-256 `cccb475b…`), and reproduces
  that copy's result, field for field, on every committed export. The command reproduces that
  copy's output and exit code on every committed export, and differs only on input it cannot
  read, where the record's copy threw: with no path, a file it cannot read or one that is not
  JSON, it exits 2 with one line and no verdict, since 1 is a check that ran and failed. Each arm
  is tested passing and failing, and the verdict over every committed export with frames is
  pinned. The record's copy stays as the record of what ran.
- **The provenance manifest hashes the script that writes it and the root `package.json`**
  ([#127](https://github.com/webarkit/webarkit/issues/127)), additive: `examples/dist/provenance.json`
  gains `build`, the SHA-256 and git blob id of `scripts/build-provenance.mjs` and of the root
  `package.json` whose `build` runs it (`blob` null without git), so two exports'
  `provenance.manifest.build` show by themselves whether one producer wrote both manifests. It
  attests an accidental change only, and refuses nothing: neither file is served, so Start does
  not check them. The schema stays `webarkit-bench-provenance/1`.
- **One Euro filtering of the pose, the rotation in its tangent space, off by default**
  ([#106](https://github.com/webarkit/webarkit/issues/106)): `NftTrackerOptions` gains
  `poseFilter`, `{ mode: "off" }` by default (`DEFAULT_POSE_FILTER`), or
  `{ mode: "one-euro", rotation: { minCutOff, beta }, translation: { minCutOff, beta }, dCutOff }`,
  where an omitted parameter takes the registered derived value: rotation 1 Hz and `beta` 10,
  translation 1 Hz and `beta` 0.1, `dCutOff` 1 Hz, exported as `DEFAULT_POSE_FILTER_` constants.
  When on, `pose` is filtered and `poseSelection.pose` stays the unfiltered pose; nothing else
  changes. Cutoffs are in Hz and `timestampMs` is read as milliseconds. The filter resets, passing
  the frame's pose through, on a result that is not `"TRACK"`, on `pose.good === false` and on a
  timestamp that does not exceed the previous frame's; the next frame seeds it. Derived on #197's
  probe
  ([`2026-10-29-106-stage1-pose-filter-probe.md`](./docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.md))
  and registered before the implementation
  ([`2026-10-29-106-stage3-registration.md`](./docs/benchmarks/2026-10-29-106-stage3-registration.md),
  #198). The registered criteria, run on the implementation
  ([`2026-10-29-106-stage3-addendum.md`](./docs/benchmarks/2026-10-29-106-stage3-addendum.md)):
  C0 to C4 held, and the prediction P held in its three parts, none void (steadiness ratio
  0.1568 with the bias −0.0004 px, last-frame errors within `B(v)` at 2, 3 and 4 px/frame,
  settling in 1 frame); its fourth part, the rotation layer 0.4789 px above `wander`'s floor,
  confirms the probe's row and is not a prediction. No device claim, and no rotation lag bound:
  no committed sequence has a rigid path with rotation. With the filter on, a `timestampMs` that
  is not finite is a `RangeError` from `process`, before the frame is processed, and a key the
  option does not read, in it or in `rotation` or `translation`, is refused by name; a cutoff that
  overflows makes the filter follow its input on that frame; two increasing finite timestamps
  whose period underflows to 0 are not guarded, and give a `NaN` pose on that frame. Additive,
  pre-1.0 and private: `NftTrackerOptions` gains a key, and the index gains the
  `DEFAULT_POSE_FILTER*` constants and the `PoseFilterOptions` and `PoseFilterLayerOptions` types;
  the ground-truth module gains the rest and settle paths.
- **A demo page that draws the tracker's pose, with the pose filter on and off**
  ([#200](https://github.com/webarkit/webarkit/issues/200)):
  `examples/pinball-pose-jsfeatnext-backend.html` draws `result.pose` through `K · [R | t]` (the
  target's outline, a box standing on it and its axes) beside the corners under `H`, optionally
  with the unfiltered `poseSelection.pose`, on `targets/pinball.wnft`, the bundled clips or the
  webcam. It is the first place the `poseFilter` option shows; it measures and exports nothing.

### Fixed

- **`@webarkit/cv-backend-spec`'s `description` reads its em dash again**
  ([#171](https://github.com/webarkit/webarkit/pull/171)): the manifest shipped at 0.5.1 carried
  it double-encoded, as `â€”`.
- **`validate-target --decode-only` and `--help` load no backend**
  ([#75](https://github.com/webarkit/webarkit/issues/75)). The tool imported
  `@webarkit/cv-backend-jsfeatnext` statically, so both failed with `ERR_MODULE_NOT_FOUND`
  where the backend was not built, against what `--help` and the READMEs promise. The backend is
  now imported only by the full mode, which, when it cannot load it, exits 2 with a message naming
  the backend and `--decode-only`, instead of failing at startup. A test runs the tool with the
  backend made unresolvable by a resolution hook.
- **The bench page refuses a second run while one is pending or live, and keeps the first failure
  cause on its error line** ([#166](https://github.com/webarkit/webarkit/issues/166), found on
  review of [#165](https://github.com/webarkit/webarkit/pull/165); the code is now in
  `examples/js/run-lifecycle.mjs`, [#179](https://github.com/webarkit/webarkit/pull/179)). Two
  defects. A second run could start while the first was in its provenance check: the probe stayed
  enabled, and its end enabled Start with that start still pending. Now Start and the probe are off
  from Start's click until its run is live, or the start is refused or fails. A later failure
  replaced the first cause on the error line. Now the line keeps the first cause until Start clears
  it, and each later failure is recorded on its own run. This makes true the `[0.5.0]` sentence "A
  later failure no longer replaces the first on the error line", which `[0.5.1]` records as not
  describing the shipped behaviour.
- **The bench page and the replay refuse a manifest whose flags no build writes, and a session run
  is one that did not fail** ([#119](https://github.com/webarkit/webarkit/issues/119)). Two
  conditions no guard read. Start and `replay-clips --packages bundle` read the manifest's `head`
  only for null, so `head: ""` passed, and neither compared `clean` with `dirtyPaths`. Both now
  refuse a `head` that is not a full commit hash, a `clean` that is not a boolean, a `dirtyPaths`
  that is not a list, and a `clean` that disagrees with `dirtyPaths`, as a manifest hand-edited or
  written by a broken build; a manifest built without git keeps its own refusal. `sessionRunGaps`, and so `--transfer`'s recompute, read `run.endedBy` alone, so
  only `failRun`'s `endedBy = "failed"` kept a failed run from counting. A run whose `run.failure`
  is set, or not recorded, is now a gap, whatever `endedBy` says. Neither changes what the
  committed exports say. The two stale comments beside `WRAP_BOUND_S` now point at
  [#114](https://github.com/webarkit/webarkit/issues/114); its value is unchanged.
- **Detection refuses a homography fitted on fewer than 5 inliers, a fit whose residual is zero
  by construction** ([#137](https://github.com/webarkit/webarkit/issues/137)). A fit on four
  correspondences reproduces them exactly, so RANSAC's threshold could not refuse it, and the
  detection path accepted such fits whether right or not. `detectTarget` now refuses an accepted
  fit with fewer than `MIN_DETECTION_INLIERS` (5, exported) inliers as a failed detection with a
  new reason, `"too-few-inliers"`, carrying the fit's own count; the tracker makes the frame LOST
  with no lock, and the detection worker runs the same gate. `DetectionFailure` and
  `TrackFailure` gain the value: a type change, though the package is pre-1.0 and private. The
  gate is G5 of #137's pipeline probe ([#189](https://github.com/webarkit/webarkit/pull/189),
  [the record](docs/benchmarks/2026-10-28-137-stage1-pipeline-probe.md)): every frame processed,
  seeds 1 to 8, the static clip unchanged on every seed, the seed ratio of `jitterPx` from 4.77 to
  1.15 on the wall clip and from 103 to 2.21 on the table clip, `trackTimeShare` equal to the
  ungated pipeline's except +0.09 points on one seed. Its criteria were registered before the code
  ([#190](https://github.com/webarkit/webarkit/pull/190),
  [the registration](docs/benchmarks/2026-10-28-137-stage3-g5-registration.md)), and
  [its addendum](docs/benchmarks/2026-10-28-137-stage3-g5-registration.md#addendum-2026-10-29-the-criteria-run-against-g5s-implementation)
  records them run: C1 and C2 held, the implementation reproducing the probe's G5 rows frame for
  frame on all three clips and eight seeds; on the device's scaled-step schedule, P-G5 (a) held on
  the table clip (seed ratio 1.21, bound 1.50) and was refuted on the wall clip (1.55, bound 1.5,
  from the control's 3.41), and (c) was refuted on both, `trackTimeShare` moving by −4.18 to
  +2.51 points per seed on the wall clip and −3.37 to +2.67 on the table clip, against ±0.5. On #90's ground-truth sequences every fit the gate refuses
  is a 4-inlier fit 193.7 to 511.9 px RMS from the true homography, and no TRACK frame changes;
  an 8-inlier fit 61,615 px wrong on the same path is not caught. The bench page's stateless
  pipeline, an inline copy of the detection steps, was left accepting the 4-inlier fits the
  tracker refuses; the next entry brings it to the same gate
  ([#191](https://github.com/webarkit/webarkit/issues/191)).
- **The bench page's stateless mode refuses a detection with fewer than `MIN_DETECTION_INLIERS`
  inliers, as the tracker does** ([#191](https://github.com/webarkit/webarkit/issues/191)). The
  mode is a copy of the detection steps, not a call to `detectTarget`, so #137's gate left it
  behind: on a 4-inlier fit it read DETECT, with a pose, where the detection-only tracker read
  LOST, and three sentences claiming parity between the two were false on such a frame. The mode,
  moved unchanged into `examples/js/bench-stateless.mjs`, now applies the same gate through the
  exported constant, refusing the fit as a LOST frame with reason `"too-few-inliers"` and the
  fit's own count; it still does not call `detectTarget`, so that it times the pipeline's calls
  stage by stage as before. A parity test feeds it and `detectTarget` the same frame through one
  stub backend, and the two must agree on an accepted fit of 4 inliers and of 5, a RANSAC failure
  and too few matches. Stateless exports from before `7d3b914`, the commit that adds the gate,
  and from after it are not comparable on the hand-held clips; `provenance.manifest.served` tells
  them apart. `METRICS_VERSION` is unchanged: no definition changes, only which frames the mode
  poses. The static demo is left as the contract's raw pipeline, which does not apply the gate,
  and says so.

### What M5 did not deliver

- **Four issues were moved out of milestone 6, with no milestone**, each with its reason in a
  comment of 2026-10-30:
    - [#92](https://github.com/webarkit/webarkit/issues/92), the residual limit: #186's
      weighing found that the sweep does not choose between the candidates, and that the
      committed exports, which carry no ground truth, cannot say what a limit would refuse
      wrongly on real motion.
    - [#116](https://github.com/webarkit/webarkit/issues/116), serving the bench page over
      https: not started; every item it lists to settle first needs the tablet and the PC's
      network, and M5 had no device sessions.
    - [#133](https://github.com/webarkit/webarkit/issues/133), IPPE's guard near
      fronto-parallel: with M4's campaign closed under its condition 2, the guard's
      registration in #107 was never made, and the guard passes, open, to the next campaign.
    - [#143](https://github.com/webarkit/webarkit/issues/143), the LOST rename: it was to
      travel with other work only if the state machine was opened for another reason, and M5
      did not open it.
- **[#114](https://github.com/webarkit/webarkit/issues/114)'s per-round reading of the loop-wrap
  bound was never made.** Round 0 had no counted run and round 1 will not run, so the reading, and
  the registration of its figures with their headroom, pass open to the next campaign (#114's
  comment of 2026-10-23). The bound's re-derivation shipped
  ([#195](https://github.com/webarkit/webarkit/pull/195)).
- **[#106](https://github.com/webarkit/webarkit/issues/106)'s device claim was withdrawn**, on
  2026-10-15, as unmeasurable on this instrument, not refuted: every exported value is computed
  from `H` and the result's flags, and none reads the pose. No rotation lag bound is claimed: no
  committed sequence has a rigid path with rotation.
- **Two issues opened during the window are not in it:**
  [#196](https://github.com/webarkit/webarkit/issues/196), the loop-wrap rule's "at most 0.5 s"
  against µs-rounded media times, and `bench-locks.mjs`'s untested epsilon; and
  [#202](https://github.com/webarkit/webarkit/issues/202), detections with 5 or 6 inliers that
  pose the target from behind on the wall clip, found by #200's demo.

<!-- prettier-ignore-start -->

## [0.5.1] - 2026-10-23

The "M4 campaign" milestone ([milestone 7](https://github.com/webarkit/webarkit/milestone/7)),
the device measurement of [#104](https://github.com/webarkit/webarkit/issues/104)'s conditioning
signal. Documentation only: no package code changes. `.wnft` format: still **0.3**, in both
codecs, so this tag freezes no new corpus.

### Changed

- **M4's plan registers the campaign's closing entry**, "The campaign closes under its condition
  2: round 1 of #104 is ruled unreadable (2026-10-23)", in
  [`docs/benchmarks/README.md`](docs/benchmarks/README.md).

### What the M4 campaign did not deliver

- **M4's device steadiness claim was not obtained.** The campaign closed on 2026-10-23 under its
  condition 2. Round 1's comparison needs the conditioning signal to refuse frames, and no
  threshold for it can be registered before [#92](https://github.com/webarkit/webarkit/issues/92)'s
  weighing, which follows the campaign. Round 0's exports, committed 2026-10-14, are the
  campaign's last.
- **The bench page's run-lifecycle defects
  ([#166](https://github.com/webarkit/webarkit/issues/166)) are not fixed in this release.** The
  `[0.5.0]` entry's sentence "A later failure no longer replaces the first on the error line" does
  not describe the shipped behaviour: in worker mode, a failure that fails a second ended run
  replaces the first cause on the error line. The defects are to be fixed before the next
  campaign's first device run.

## [0.5.0] - 2026-10-22

M4 of [ADR-0001](docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md), pose correctness and
homography steadiness: the code and its synthetic acceptance, with the device campaign on its own
milestone. `.wnft` format: still **0.3**, in both codecs, so this tag freezes no new corpus.

### Added

- **`NftTracker` can read how far a fit is from one a plane can produce, and is off by default**
  ([#161](https://github.com/webarkit/webarkit/pull/161), M4's step 2,
  [#104](https://github.com/webarkit/webarkit/issues/104)). Two quantities are read on a fit's
  homography before the pose step, `d_scale` and `d_orth`; both are 0 for a plane seen by a
  pinhole camera. The new `conditioning` option has three states.
  - **Off, the default.** Nothing is computed and the pose path is unchanged. Every result now
    carries two fields, `conditioning` and `trackLossConditioning`, both `null` in this state.
  - **Reporting, `{ mode: "report" }`.** Every result with a pose carries `conditioning`, the two
    numbers kept apart, never combined into one. Nothing is refused.
  - **Refusing, `{ mode: "refuse", maxDScale, maxDOrth }`.** A fit past either threshold, or one
    whose reading cannot be taken, gets no pose. A detection ends `"LOST"` with the new reason
    `"conditioning"`. A tracking step drops its lock with the new `trackLoss: "conditioning"`,
    its reading in `trackLossConditioning`, and the frame is detected again.

  **No threshold is registered, and none is built in.** The derivation on #90's sweep
  (`docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.md`) found no single value that
  separates right fits from gross wrong ones pooled across the sweep's two views. So both thresholds
  are the caller's: numbers ≥ 0, `Infinity` for no bound. The constructor throws a `RangeError` on a
  refusing state without them, on a threshold given in another state, and on an unknown mode. What
  is claimed: on that synthetic sweep, read per view at each view's own floors, no right fit of
  either target is refused and each of the eight gross wrong fits of M2's 64 patches is
  (`test/pose/conditioning_sweep.test.ts`). No device claim and no campaign claim. The reading and
  the refusing rule are also exported, as `conditioning` and `conditioningRefuses`, with
  `DEFAULT_CONDITIONING`.

### Changed

- **`NftTracker` takes its pose from IPPE, above the contract** (M4's step 3,
  [#105](https://github.com/webarkit/webarkit/issues/105)). The two poses a planar homography
  allows are computed in `packages/nft-tracker/src/pose/`; one is chosen per frame by depth,
  by reprojection error over the frame's correspondences, and by a declared margin under which
  the frame is ambiguous and takes a tracker-local copy of the closed form; no earlier frame
  enters. The backend's `poseFromHomography` is no longer called by the tracker; the contract is
  unchanged. Results carry `poseSelection`, and the tracker counts `fallbackFrames` per run. A
  `Detection` and a tracking step's result now carry their `correspondences`. What is claimed
  for it, and no more: an **accuracy result on rigid synthetic ground truth**, from criteria
  registered before the implementation (`docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md`):
  deterministic (bit-identical on repeat, unchanged under 60 random correspondence orders, 0 reads
  of `Math.random`), less accurate than the closed form below 7° of tilt (per-step medians of the
  error ratio 2.2 to 3.0), a tie at 10° (median 0.968, quartiles straddling 1), and clearly more
  accurate from 15° to 50° (2.4× to 3.5× on the per-step medians), the crossover lying between 7°
  and 10°. No steadiness (`jitterPx`)
  claim: that metric reads `H`, which the change does not touch, and so cannot respond to it. No
  campaign claim.
- **`examples/bench-nft.html` attests the code a session run executes**
  ([#111](https://github.com/webarkit/webarkit/pull/111), designed in
  [#110](https://github.com/webarkit/webarkit/issues/110)).
  - **One bundle for both arms.** Both detection arms now load one bundle of the three
    packages, `examples/dist/webarkit-packages.mjs`: the page through its import map, the worker
    by URL. The separately bundled worker, `examples/dist/detection-worker.mjs`, is gone.
  - **`npm run build` is `scripts/build-provenance.mjs`.** It builds the packages, then the bundle,
    then `examples/dist/provenance.json`: the commit, whether the tree was clean, and the hash of
    every input. Without git it still builds, and the manifest says the commit is unknown.
  - **What Start checks.** A session run (`?loops=` or `?run=`) is checked at Start against that
    manifest, and refused, with its reason and remedy, on:
    - a mismatch with the build;
    - a dirty tree, or a manifest built without git;
    - a module the check cannot see, or one run from the HTTP cache;
    - a response without `Cache-Control: no-store`.

    The check attests the bytes the server serves at Start, not the bytes the page loaded. Other
    runs refuse nothing and record the findings.
  - **What exports carry.** Exports carry `provenance` beside `protocol`, and
    `run.lostVisibility`. They no longer carry `detection.workerBundleSha256`.
  - **Parameters and server.** `?loops=` and `?run=` take whole numbers only, never floored. Serve
    the repository with `npx http-server -c-1`. The demos still load each package's own `dist/`.
  - **Replay.** `scripts/replay-clips.mjs` takes `--packages <dist|bundle>`.

### Fixed

- **The bench's guarded paths, before M4's measurements open**
  ([#96](https://github.com/webarkit/webarkit/issues/96) and
  [#95](https://github.com/webarkit/webarkit/issues/95)'s `[guarded]` items, the guarded-items
  half of M4's step 0).
  - **A loop wrap is the clip restarting.** Any step back in media time used to count as a loop
    wrap, so a stutter or a seek could fabricate a loop in every metric read per loop, and end a
    `?loops=` run a loop early. A step back is now a wrap only near the clip's start, with at most
    0.5 s skipped across the wrap; any other step back refuses the run, naming the frame. No
    committed export's figures change.
    - **Where the 0.5 s bound comes from, and its status, are
      [#114](https://github.com/webarkit/webarkit/issues/114)'s.**
    - **The fallback is chosen.** Without a clip duration, the rule asks for a step back of more
      than 0.5 s; that reuses the value, and was not derived.
    - **Its revisiting is [#114](https://github.com/webarkit/webarkit/issues/114)'s:** when, and
      by what rule.
    - **A refused run is a rejected sample.** M4's runbook re-runs it and does not record it.
  - **`replay-clips --transfer` recomputes each export's protocol** with the tracker's own
    defaults, and refuses a record the rule does not bear out, rather than trust
    `protocol.sessionRun`. M3's committed exports all pass, and their transfer is unchanged.
  - **A worker failure after a run ended fails that run**, and the run a Download exports, so
    that Download is refused; it used to be dropped, and the run exported as clean. A later
    failure no longer replaces the first on the error line.
  - **Smaller corrections.**
    - The worker passes on the decoder's warnings.
    - Start names why a `.wnft` did not load, on both detection paths, where it had pointed at
      an error line it had just cleared.
    - A replay arm with external detection exports `detection.path: "worker"` and a new
      `detection.latencyOf`.
    - `replay-clips` refuses `--tracking-only` where it does nothing. It also refuses
      `--packages bundle` on a manifest built without git, where it had thrown a `TypeError`.
    - `firstStepLatency` keeps a sample detected up to 1 ms past the clip's end.
    - Refusals number frames alike, and a count recorded as text is quoted.
  - **`packages/nft-tracker`'s README and `src/tracker.ts`** say what M3's tuning pass did to
    each default, where they had called the defaults provisional until a pass that has since
    run. The README also documents the four detection options and their domains.

### What M4 did not deliver

- **No threshold for the conditioning signal, and so no refusal the campaign can read.**
  [#104](https://github.com/webarkit/webarkit/issues/104)'s body requires the threshold recorded,
  with its derivation, before the campaign reads it. The derivation
  (`docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.md`) found no single value: pooled
  across [#90](https://github.com/webarkit/webarkit/pull/90)'s sweep's two views, nothing separates
  right fits from gross wrong ones, in either form, at any of three focal lengths. Per view both
  forms separate, by 4.44 on the first view and 1.28 on the second, and on the second that
  separation is gone by fov 90°. The cause is measured and reproduced as a fatal check: the sweep's
  second view is not a plane homography for the camera, so its *correct* fits read 0.0084 and 0.031
  and sit above the first view's gross wrong ones. What is registered instead is the two per-view
  intervals and that reason. The signal therefore ships off by default, and its refusing state takes
  both thresholds from the caller or throws.
- **The three candidates were not weighed against each other.** #104's body asks that its signal be
  weighed against the two directions of [#92](https://github.com/webarkit/webarkit/issues/92) — a
  limit scaled by the inlier count, and a bound on the scale change one step may imply — on #90's
  sweep, by evidence. One of the three is weighed. #92 is on M5 and carries the comparison; the
  instrument it needs is the derivation's script, which reproduces the frozen sweep under a fatal
  step 0 and reads a criterion over every fit it produces.
- **Nothing here was read on a device.** Every claim in this entry is synthetic: #90's sweep and the
  acceptance files. The campaign that reads the tracker on the reference device is the "M4 campaign"
  milestone, whose eight registered preconditions for round 1 are all open, so this milestone ships
  with its measurement arm unstarted — which is what splitting it was for.
- **The contract question of [#43](https://github.com/webarkit/webarkit/issues/43) is unanswered**,
  and cannot be answered while there is one implementation: whether `cv-backend-spec` must say which
  root `poseFromHomography` returns, and whether a second implementation must match the first. #43's
  other question, whether pose disambiguation stays above the contract, is answered in code and by
  measurement. It was examined for gate 4 and left open with no milestone, named on
  [#9](https://github.com/webarkit/webarkit/issues/9) so that neither lands without the other being
  looked at.

## [0.4.0] - 2026-10-01

M3 of [ADR-0001](docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md), detection off the
frame. `.wnft` format: still **0.3**, in both codecs, so this tag freezes no new corpus.

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
  owns no worker; `examples/bench-nft.html` brings its own (below).
- **Detection in a worker, in `examples/bench-nft.html`**
  ([#97](https://github.com/webarkit/webarkit/pull/97)): `?detection=worker` runs the detection
  pipeline in a module worker the page owns and hands its results to `NftTracker` under
  `externalDetection`, on demand: a frame that ends without a lock asks for a detection, and its
  grey pixels go to the worker if no detection is in flight or held. `?detection=sync`, the
  tracker's own detection on the frame loop, stays the default. `npm run build` now also bundles
  the worker into `examples/dist/`, with esbuild, a new root devDependency. For device sessions
  the page gained a run protocol — `?loops=` and `?run=`, `trackTimeShare` (the share of video
  time with a confirmed lock), the worker's job accounting, and a `protocol` record of whether an
  export is a session run — and `scripts/replay-clips.mjs` gained `--external`, which replays the
  clips with detection handed in at a given latency, and `--transfer`, which replays them at the
  latencies a session's exports measured. M3's measurement on the reference device is in
  `docs/benchmarks/`.
- For the tuning pass, `examples/bench-nft.html` takes `?targetFile=`, a candidate target under
  the git-ignored `examples/targets/tuning/`, and `?tracker=`, tracker option overrides, each
  refusing Start when it cannot be read; `scripts/replay-clips.mjs` takes the same as `--target`
  and `--options`, with `--seed` to repeat RANSAC's draws, and `scripts/tuning-probe.mjs` reports
  the per-patch figures no export carries ([#86](https://github.com/webarkit/webarkit/pull/86)).
- This changelog, and the release procedure in `CONTRIBUTING.md` ("Releasing"), which now also
  creates a GitHub Release per tag
  ([#77](https://github.com/webarkit/webarkit/pull/77), [#81](https://github.com/webarkit/webarkit/pull/81),
  [#72](https://github.com/webarkit/webarkit/issues/72)).
- **Release gates**, in the same section: six conditions a release pull request states before
  the tag — `dev` green, the changelog closed, every package at the release version, the
  milestone's open issues examined, a new `.wnft` format minor's corpus frozen, and notes that
  say what the milestone did not deliver — and, in `CONTRIBUTING.md`, how an amendment to the
  `@webarkit/cv-backend-spec` contract is decided between its two owners
  ([#99](https://github.com/webarkit/webarkit/pull/99), [#72](https://github.com/webarkit/webarkit/issues/72)).

### Changed

- **Every package and the crate now carry the release version**, in lockstep with the
  repository's tag: `0.4.0` here, where 0.3.0's manifests read `0.1.0`
  ([ADR-0002](docs/adr/0002-lockstep-versioning.md), [#77](https://github.com/webarkit/webarkit/pull/77),
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
  ([#88](https://github.com/webarkit/webarkit/pull/88), [#90](https://github.com/webarkit/webarkit/pull/90);
  [`docs/benchmarks/README.md`](docs/benchmarks/README.md), "M3: the tuning pass", rounds 2
  and 4).

### What M3 did not deliver

- The wall clip's lock verdict was inconclusive: step 10's spread rule tripped, the clip's
  per-loop spread exceeding what the bound can resolve, so asynchronous worker detection was
  neither adopted nor refused. What it did buy is frame time — detection's share of the loop fell
  from 39.8% to 0.51% on the wall clip (its two blocks pooled) and 21.4% to 0.20% on the table
  clip, and unlocked frames from 90.4 to 26.8 ms and 139.6 to 46.3 ms at the median.
- Patch alignment below the contract, which M3's own milestone description names, is deferred:
  [#84](https://github.com/webarkit/webarkit/issues/84) is on M5 and waits on a backend that runs
  alignment outside JavaScript.

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

[Unreleased]: https://github.com/webarkit/webarkit/compare/v0.6.0...dev
[0.6.0]: https://github.com/webarkit/webarkit/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/webarkit/webarkit/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/webarkit/webarkit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/webarkit/webarkit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/webarkit/webarkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/webarkit/webarkit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/webarkit/webarkit/releases/tag/v0.1.0

<!-- prettier-ignore-end -->
