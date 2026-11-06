# #228 and #133, Stages 2 and 3: the declared covariates, the guard option's criteria and the pose metric's, registered before their code (2026-11-06)

**Registered on 2026-11-06, before any implementation of the guard option or of the metric, under
[the step protocol](./step-protocol.md), Stages 2 and 3: "Criteria are registered in their own commit,
before the implementation, and that commit is cited by hash". Its basis is the merge of
[#233](https://github.com/webarkit/webarkit/pull/233), `d09cdad92a8f4b466534003745d752c6d88077af`, and
the two probes: [the first](./2026-11-04-228-stage1-probe.md) (#231) and
[its repeat on the tilt clips](./2026-11-06-228-stage1-repeat.md) (#233), called "the first record" and
"the repeat" below. The subjects are one document by
[the maintainer's rulings of 2026-11-04](https://github.com/webarkit/webarkit/issues/228#issuecomment-6671748262),
item 6, posted on 2026-11-05, with
[those of 2026-11-06](https://github.com/webarkit/webarkit/issues/228#issuecomment-6686291128) added
("R1" and "R2" below) and
[the ruling on #133](https://github.com/webarkit/webarkit/issues/133#issuecomment-6643785552). Two
implementation PRs follow, each from its own brief, and each is checked against what is written here.
This document writes no code under `packages/*/src`, changes nothing in `examples/js/` and leaves
`METRICS_VERSION` at 1. The results go in addenda beside it (below, "What a failed criterion means").**

The rulings this document rests on, quoted in part (each cut where marked):

> **The guard of #133:** registered and implemented as a tracker option, **off by default**, threshold
> 10°, tilt read from the closed-form pose, IPPE at exactly 10°. Its adoption is decided by M9. […]
> (R1, item 1)
>
> […] **Its threshold becomes a parameter of the option, default 10°.** The registration says that 10° was
> derived from a construction that renders and estimates with the same `K`, and that the repeated Stage 1
> (question E) found the crossover moves under a focal-length mismatch, in opposite directions on two
> readings. No claim is made that 10° suits any real camera. The guard's adoption, and its threshold for a
> calibrated camera, wait for #109. (R2, item 1)
>
> **The metric is registered as `METRICS_VERSION` 2, as a stability metric:** the frozen `cornerJitter` on
> the target's corners projected through `K · [R | t]`. The registration declares its scope: it reads
> jitter, not accuracy, and it cannot see a constant offset. […] (R2, item 2)
>
> With the option on, a guarded frame is counted by `fallbackFrames`. (The ruling on #133)

## Step 0: provenance, and the brief's check

- **Ref:** `docs/228-133-stage3-registration`, branched from `origin/dev` at
  **`d09cdad92a8f4b466534003745d752c6d88077af`** (the merge of #233), after `git fetch origin`. Node v24.21.0,
  the pin; ffmpeg and ffprobe 9.0.2; Windows 11. The session ran on Claude Opus 5.5, with the advisor tool
  active. The tool describes itself as a stronger reviewer model and names none, so the brief's "Fable" could
  not be confirmed.
- **The base reproduces both references** (below, "The references"), built clean, `git diff HEAD` empty and
  status empty at both ends of the run.
- **Seen before registration:** the two probes' records and scripts, the base's replay outputs and ground
  truth, read through their hashes. No figure of either implementation exists.
- **What held, read against the code, the records and the issues:** both sets of rulings on #228 and the ruling
  on #133; the two records; `selected()` at `tracker.ts:819`, its uses at lines 1090 and 1163, `process` at
  lines 867 to 873, the `poseFilter` option at line 534; `selectPose` at `select_pose.ts:138`; `closedFormPose`
  at `closed_form.ts:83`; `METRICS_VERSION` at `bench-definitions.mjs:52`; `cornerJitter` at
  `bench-summary.mjs:59`; `CLIPS` at `replay-clips.mjs:260`, holding three clips; `DEVICE_ACQUIRE_MS` at line
  266, holding the same three.
- **What the brief's text needed beside it. None is a stop, and none changes a ruling:**
  1. **`reprojectCorners`** is in `examples/js/bench-frames.mjs`, line 59. `bench-metrics.mjs` re-exports it.
  2. **"Every replay output" cannot be byte-identical,** and `98323f06…` is not a hash of bytes. It is #94's
     list hash of the 19 step-independent outputs under #211's mask of clock and build fields. The 15
     step-dependent exports move with this machine's speed, so they are no reference (#94's stop-3 ruling). G0
     says so.
  3. **Neither reference had a producer in this repository.** The list hash came from three scripts in #94's
     session scratch, kept only because #233's session recovered them, and the ground truth's from #226's
     harness, recoverable only from that session's transcript. The box says "no document outside this
     repository and its issues is a source for any session". So this registration ships them, as one script.
  4. **The first recovery of #226's harness did not reproduce:** `02523bd7…`, 6,026,061 bytes, against
     `d1d427f3…`, 6,026,097. It was the file as first written, whose draw counts read 0 at this tree. With the
     harness's later change, which counts the injected generator's draws, it gives `d1d427f3…`. The hash
     decided the question, and the reference did not move.
  5. **The ruling on #133 adds what the brief omits:** a guarded frame is counted by `fallbackFrames`. G2 holds it.
  6. **The order.** The ruling on #133 says "registered before the metric's Stage 3". R1's item 6, posted a day after it,
     makes it one document, then two PRs, and that is followed here. The maintainer added on 2026-11-06, in this session's
     thread, that the guard is implemented before the metric.
  7. **The bump has consequences the brief's examples do not name:** B, "What the bump does".
  8. **The bands** are the repeat's, so 15–20°, 20–30° and 30–40° come with its "over 40°", which holds a few
     frames, all but one on DETECT.

- **The maintainer's rulings of 2026-11-06, given in this session's thread, on six points the comments on the issues do not
  settle. Each was this registration's proposal, and each was accepted as drafted:**
  1. **The version gate:** `compareExports` and `sequenceRefusal` accept versions 1 and 2, the pose part of a comparison is null if either export is version 1, and the figures under `H` stay as they are.
  2. **`poseSelection` on a guarded frame:** it stays IPPE's selection and only `pose` changes, as in the filter's ruling B, and `fallbackFrames` counts guarded frames.
  3. **The export gains `H`,** a ruling that goes beyond R2, since without it no export can yield the tilt, the switches or the closed form's corners; its precision is not reduced to save space.
  4. **The tilt clips in the replay:** an opt-in `--clips tilt` with its own form, and `CLIPS` unchanged.
  5. **The corner distance:** a pose part in `compareExports` under `poseCornerDistancePx`, descriptive only, never a criterion.
  6. **The references script is shipped,** since criteria that rest on hashes no file in the repository can regenerate would not be checkable.

## The references

[`2026-11-06-228-133-stage3-references.mjs`](./2026-11-06-228-133-stage3-references.mjs) recomputes both.
It holds no figure of either implementation. Its self-test was written first, against stubs.

    node docs/benchmarks/2026-11-06-228-133-stage3-references.mjs --self-test
    node docs/benchmarks/2026-11-06-228-133-stage3-references.mjs --replay <run dir> [--v1-projection]
    node --experimental-transform-types docs/benchmarks/2026-11-06-228-133-stage3-references.mjs --ground-truth <out.json>

| Reference | What it is | At `d09cdad` |
|---|---|---|
| **R-replay** | The 19 step-independent outputs at `--seed 1 --seed-policy frame`: 15 default exports, 3 `--external 70` arm-1 exports, and the `--sequence` stdout on `2026-10-13-tab9-m4-preflight-sync-wall.json`, under #211's mask | `98323f061ecef7022d536c22f024d374a119edcd8ce6af3927b37309f2c6b546` |
| **R-truth** | #226's serialisation of the ground truth: the shipped sweep (1370 steps), the three shipped sequences, the rest and settle paths, plain and with the filter, the fixture target on two paths, each with its draw count | `d1d427f33ce819ab5760377dcb3999ba979b09ab402a51a830895e27203c4f8f`, 6,026,097 bytes |

**Each exercised both ways:**

| Check | Must pass | Must fail, and did |
|---|---|---|
| The self-test: the mask holds on each clock and build field by name, and sees the fields beside them, `manifestClean` and `postToArrivalMs` included; the classification; the list hash; the projection; the serialisation | passes | Against stubs, every case. That shows the cases ran, not that they discriminate, so 13 mutants of the code followed, each removing one mask or refusal from a copy: all 13 fail it. The review's first set survived, and the cases were added for them |
| R-replay on the base's run | `98323f06…` | `frames[0].numInliers` + 1 in `def/replay-pinball-bench-detection-only-device.json`, in a copy: `d99f69ce…` |
| 18 outputs, or a run directory with no `ext` | never hashed | exit 1 with the reason, printing no hash |
| The v1 projection on a version 1 export | never hashed | exit 1: "metricsVersion 1, not 2" |
| R-truth, the draws | 30108, 357, 357, 357, 357, 5232, 2746 and the settle path's 32847, as #226's body lists them | the harness that read no injected draw: `02523bd7…` |

The draw counts are #226's published ones. The projection has only constructed cases until a version 2 export
exists: M3 is its first real input.

## What cannot be read from an export today

`frameRecord` (`bench-frames.mjs:104`) copies neither `H` nor `pose` nor `poseSelection`. So nothing in a committed
export can give a frame's tilt, its estimator or its pose. Until version 2 exists, every covariate below that needs
them is read from the tracker's results through `replayRun`, as the probes did. From version 2 on, tilt, the
estimator a guard would pick and the switches are functions of the exported `H` and `processingResolution`.

## Stage 2: the declared covariates

R1's item 5, the first record's six proposals plus the switches; R2's item 5. The proposals land as follows: 1 is the tilt, state and inliers rows; 2 is the state row and the first reporting rule below; 3 the wrong-pose label; 4 the loops; 5 "what lower means"; 6 is `poseCornerDistancePx` (B), named as a descriptive reading by R1's item 3 and R2's item 2. **The control arm** is the run with the
guard and the filter off: its `poseSelection.pose`, `H`, state and inliers. By Q0 every arm has the same frames, so a
covariate that selects frames is read from it and from no treatment arm (Stage 2, its first rule). **Every band row
carries its frames and windows** (its third rule). Each is reported per clip, in the implementation's addendum; what
M9 reports is for M9's plan.

| Covariate | Computed per frame as | Arm | Reported | The sign it could invert, and the figure |
|---|---|---|---|---|
| **Tilt** | `acos(clamp(R[8], −1, 1))`, degrees, of `closedFormPose(H, K)` on the frame's own `H`, `K = intrinsics(w, h)` at the processing size. Bands, lower edge in: 0–1, 1–3, 3–5, 5–7, 7–10, 10–15, 15–20, 20–30, 30–40, over 40. None when CF's `good` is false | control | per band, with frames and windows | CF − IPPE as read, TRACK frames: −0.140 static at 2.9°; −0.138 cross 3–5°; +0.013 mid 20–30°; −0.031 sweep 20–30° (−0.065 without one media time, where mid reads +0.010); +0.014 sweep 30–40° (first record, "Differences"; repeat, B) |
| **State** | `result.state`, in the export | control | the common set and its TRACK frames, side by side (proposal 2) | CF − IPPE on the table clip: −0.451 / +0.299 / +7.321 on the common set, −0.456 / −0.449 / −0.437 on TRACK frames (first record, "Differences") |
| **Inliers** | `result.numInliers`, in the export | control | beside each leave-one-media-time-out's frame; beside each single low-inlier switch (R2, item 5) | CF − IPPE on the wall clip at 15 ms, TRACK frames: +2.664 to +2.854, and −0.024 to +0.042, a tie, without one frame on 8 inliers (first record, "One frame") |
| **Estimator switches per run** | A change of estimator between consecutive posed frames, the estimator being CF below the threshold and IPPE at it and above; in the counted loops; those at a loop wrap apart from those in the footage, with the corner distance at each | control, the tilt deciding | per clip and seed | GUARD − IPPE. **No probe figure shows a switch inverting a sign.** What they measure is the step: 4.33 px at cross's one crossing, up to 160 px on the wall clip and 244 px on the table clip, a step in a window that a line does not fit. The nearest figure is the wall clip's −0.116 / −0.079 / +0.001 at 25 ms, whose last is a tie. Note 7 of the repeat stands: cross has one crossing a pass, so a fair test needs footage that dwells at 10° |
| **Wrong-pose label** | A frame on which a corner under `H`, or under CF's pose, lies more than one frame diagonal outside the frame. **A label, not a filter:** no figure here drops these frames unless it says so, beside the figure that keeps them. The diagonal is a stated bound with no measured derivation, and the rule misses what dominates the wall clip | control | counted per clip and seed | CF − IPPE on the table clip, seed 5: +7.321 with the 12 flagged frames, −0.443 without them (first record, per-seed table) |
| **What the loops are** | Per clip: distinct loops among the counted four, bit for bit, **and** the largest corner difference across them, in px; and whether a TRACK run crosses a wrap, with its length | control | per clip and schedule | None. It changes what a count means: "36 windows" is 9 × 4. As read at every frame: **copies** on the wall, table, cross and sweep clips, read as one pass per seed (R1's item 4, which this document extends to the tilt clips by the repeat's reading); **mid, copies to 2e-13 px**, one observation in eight seeds; **static, not copies:** its lock crosses the wrap. On the device schedules: two wall seeds at 25 ms and three table seeds at 15 and 25 ms have two distinct loops, and sweep's "distinct" loops differ by at most 1.7e-13 px, borrowed. #151's rule does not change |
| **What lower means, on moving footage** | Not per frame. A statement every moving-footage figure carries: this metric reads attenuated motion as lower jitter. Constructed: 5.2938 px at 5° and 1 Hz, and 4.2358 px at 0.8 of the amplitude | not selecting | beside the figure | FILTER − IPPE: −0.042 static; +0.145 to +0.185 on the wall clip's 10–15°; −0.037 to −0.009 on the whole wall clip at 25 ms, against +0.037 to +0.089 at every frame |
| **The assumed `K`** | `intrinsics(w, h)`, 60° of horizontal field, the same for every arm. f = 175.80 px at 203 × 360. Declared, not per frame | every arm | beside any claim about the guard (R2, item 1) | The crossover itself. On `e` it moves up, to a read tilt of 16.8° to 33.3° for half the fits; on the rotation error, down, to 1.1° to 3.2° (repeat, E) |

**Three reporting rules, and no new covariates:** the first record's proposal 2, then the repeat's notes 5 and 8. The repeat's note 4, how copies is tested, is the loops row.

- **A figure one frame can move is read with and without it:** the leave-one-media-time-out beside the common set and
  beside its TRACK frames (proposal 2). By the protocol's jackknife rule, a deletion from a window at exactly four frames
  drops the window, so `n` stands beside it.
- **A seed is not a replicate of the noise.** The range over seeds is the margin given, no tolerance comes from it, and on
  a held lock it may be one observation: "8 of 8" on mid is one.
- **A single TRACK frame on 8 or 9 inliers** is named when it carries a reading (sweep, seeds 1 and 6, at 0.267 s and 0.467 s).

**Not registered, of the repeat's notes:** 2 (which reading a threshold serves: A's scope says what was derived, and picks
neither), 6 (the clips' corner distance against the construction's, a reading the chessboard video would test, which is
#109's), and 7 as anything but the caveat above.

## Stage 3, A: the guard option (#133)

### The treatment, as code will express it

**The names are proposals. The contract is what is registered.**

- **The option:** `NftTrackerOptions.poseGuard`:
  - `{ mode: "off" }`, the default, exported as `DEFAULT_POSE_GUARD`: nothing is computed;
  - `{ mode: "closed-form-below", thresholdDeg?: number }`, with an omitted threshold taking
    `DEFAULT_POSE_GUARD_THRESHOLD_DEG = 10`.
- **Refused, as `poseFilter` refuses (the ruling of 2026-10-30 on #199):** an unknown mode, a key the option does not read, by
  name, a threshold on `{ mode: "off" }`, and a threshold that is not finite or lies outside `[0, 180]`. Each is a `RangeError` at construction. At 0 no frame is
  guarded.
- **The tilt:** `acos(clamp(R[8], −1, 1))`, degrees, of `closedFormPose(H, K)`: the frame's own `H`, the tracker's `K`, never the
  previous frame's. The first record's `tiltOf` is this expression.
- **The rule, per frame, on `"TRACK"` and `"DETECT"` alike:** tilt `< T`, the closed form; tilt `≥ T`, the selection as it is today,
  including its own fallbacks; **IPPE at exactly `T`.** A closed form with `good: false` has no tilt, and the frame keeps its selection.
- **Where:** a module in `packages/nft-tracker/src/pose/` (R1's item 6), called by the tracker where the selection is made, before
  the filter. The stateless mode has no tracker and calls the contract's `poseFromHomography`, the closed form on this backend (the repeat, E: equal on 2352 of 2352 fits), and the detection worker computes no pose, so neither changes.
- **The result:**
  - `pose` is the guarded pose;
  - `poseSelection` is untouched: it stays IPPE's selection, as under the filter's ruling B, so IPPE's pose remains on every result;
  - a key `poseGuard: { tiltDeg: number | null, guarded: boolean }` on an `ok` result with the option on, and **absent with it off.** A
    key present with the option off would change R-truth by construction.
- **The counter:** `fallbackFrames` counts a frame once when `guarded` is true or its selection fell back. Its doc comment gains the
  reason, and each result's `poseGuard` says when it was the guard.
- **With the filter:** the filter's input is `pose`, which is now the guarded pose. Nothing in the filter changes. **This composition
  was not probed:** G5 registers the structure, and no figure is claimed for it.
- **No page option, as `poseFilter` has none:** `TUNABLE_TRACKER_OPTIONS` does not change.

### The scope

**The threshold was derived from a construction that renders and estimates with the same `K`:** the characterisation's table, on `e`,
where both rules first hold at the grid's 10° (the first record, Q2). **The repeat's question E found that the crossover moves under a
focal-length mismatch, in opposite directions on two readings:** up on `e`, down on the rotation error, and no `f_true` from 800 to
1200 px leaves it at 10° on either. A tilt read through the assumed `K` is not one true tilt: at 1005 px, true 10° reads 6.33°. **No claim
is made that 10° suits any real camera.** The threshold is a parameter for that reason. Adoption of the guard, and its threshold for a
calibrated camera, wait for #109. Neither reading is settled as the one a threshold should serve, and this registration picks neither.

### G0 to G5: what the implementation must meet (basis: the probes)

**These are checks of the implementation, not predictions.** The probes measured the arm, by computing it on one run's frames, and Stage 3
says a measured outcome is cited as its basis. Each runs from a clean tree, each is exercised both ways in the PR, and the base is **this
file's merge into `dev`.** The guard's PR comes first (Step 0, point 6), so R-replay is read there without the projection.

| | The check | Refuted by | Must fail on |
|---|---|---|---|
| **G0, off is off** | With `poseGuard` absent: R-replay `98323f06…` and R-truth `d1d427f3…`. With `{ mode: "off" }`, which neither reference can set, since `--options` refuses it and a changed script dirties the hashed tree: a new test holds every result of the shipped sequences, recursively, `Object.is` on each leaf, `timings` included, equal to the absent arm's: `run` there injects no clock, so `timings` is null on every result (`tracker.ts:610`). `npm test` passes with no existing test file modified or deleted | any other hash; one leaf differing; a test edited | a key `poseGuard: null` on every result, which must change R-truth |
| **G1, on is the rule, bit for bit** | Seeds 1 to 8, the six clips, every frame, 6 loops, under `frame`, stamped `unwrapped: true`, through `replayRun` with the probes' decoding, since `replay-clips.mjs` sets no such option; two trackers on one run's frames (the probes' Q0). On every `ok` frame `pose` with the option on, `Object.is` on every element and `good`, is `closedFormPose(H, K)`'s below `T` and the off run's `poseSelection.pose` at `T` and above; and every other field of every result, recursively, equals the off run's, apart from `poseGuard`, `timings` and the `fallbackFrames` counter. So `H`, the state, `ok`, the inliers and `poseSelection` are identical | one element differing; one other field differing | one element of `H` moved by 1e-9; the tilt read from IPPE's pose; the previous frame's tilt |
| **G2, the counter** | `fallbackFrames` with the option on = the off run's count + the frames guarded whose selection had not fallen back | any other count | a frame both guarded and fallen back counted twice |
| **G3, the probes' figures** | The table below, each cell equal as printed, min / median / max over the seeds | any cell differing | `T` 9.36 in place of 10: the wall clip's 172 for 216 |
| **G4, the parameter** | Constructed: `T` − 1e-9, `T` and `T` + 1e-9, at 10 and at another value; `T` = 7 on the first record's sensitivity rows; CF `good: false`; each refusal, by name | any case | a threshold hard-coded at 10; a refusal removed; `<=` for `<`, which only a constructed tilt at exactly `T` can catch, since no corpus frame is known to read it |
| **G5, with the filter** | With both options on, `pose` is `PoseFilter` applied to the guard's output, frame by frame, stamped as G1, on the static, wall and cross clips at one seed; `poseSelection` unchanged | one element differing | the filter reading `poseSelection.pose` in place of `pose` |

**G3's table, every frame, counted loops 1 to 4 of 6** (first record, "#133's figures"; repeat, C). They are settled by the probes, so they are checks:

| Clip | Handed to CF | Of | IPPE already CF | Pose changed | Switches a run |
|---|---|---|---|---|---|
| static | 1452 | 1452 | 0 | 1452 | 0 |
| wall | 216 / 216 / 220 | 844 / 848 / 856 | 0 | 216 / 216 / 220 | 31 / 31 / 39 |
| table | 820 / 832 / 872 | 844 / 860 / 900 | 4 / 6 / 8 | 812 / 826 / 868 | 15 / 23 / 31 |
| cross | 992 | 1668 | 4 | 988 | 7: 4 in the footage, at 8.297 s, tilt 9.99° to 10.11°, a jump of 4.33 px; 3 at a wrap, 0.00 px |
| mid | 0 | 2628 | 0 | 0 | 0 |
| sweep | 0 / 0 / 8 | 3432 / 3466 / 3472 | 0 | 0 / 0 / 8 | 0 / 0 / 16: seed 1, 16; seed 6, 8 |

The 15 and 25 ms rows of the same two sections are read the same way, each cell as printed there. On the three tilt clips they carry the **borrowed** constant.

### Predictions for A

**None.** The guard's effect on the frames is settled by the probes, and is G1 and G3. No outcome of the option's is open that this
document could predict with a refuting result, and its value is M9's or #109's to read.

## Stage 3, B: the metric (#228)

### The definition

**`METRICS_VERSION` 2 adds the frozen `cornerJitter`, imported and unchanged, on the target's corners through `K · [R | t]` of the result's
pose,** `K = intrinsics(w, h)` at the processing size (the first record, Q1). No version 1 key changes meaning.

### The frame record

`frameRecord` gains a required `K`; a missing one throws, since the rule against a default that changes a figure applies. Its callers are the page, `scripts/replay-clips.mjs`, `scripts/replay-run.mjs` and `packages/nft-tracker/scripts/jitter-dry-run.mjs`. It adds two keys:

- **`poseCorners`:** `targetPoints` through `K · [r₁ r₂ t]`, read with the frozen `reprojectCorners`. **Null** without a pose, when `good` is
  false, or when any corner's depth `R[6]x + R[7]y + t[2]` is not positive. That last is registered because `reprojectCorners` accepts an all-negative
  `w`, which for a homography is the same homography and for a pose is a target behind the camera (the first record, Q1).
- **`H`:** `result.H`, the nine elements, or null on a frame that is not `ok`. It is what makes tilt, the guard's pick, the switches and CF's corners
  readable from an export at all.

"The result's pose" is the filtered pose with the filter on, the guarded pose with the guard on, and `poseFromHomography`'s in the stateless mode.

**The cost, measured by simulation:** the two keys, at 17 significant digits, added to the three `--external` arm-1 exports at this base, in the indented form every export is written in: 38% to 45% more (the wall clip 2,213,933 to 3,048,881 characters, the static clip 3,039,478 to 4,418,152). `H` is exported at full precision, and is never rounded to save space (Step 0, ruling 3). Storage follows `docs/benchmarks/README.md`'s rule, gzip for new exports once the stored size passes about 20 MB, and M9 applies it.

### The summary

`summarizeRun` gains `posePosedFrames`, `poseJitterWindows`, `poseJitterPx` and `poseSpreadPx`: the frozen `cornerJitter` on frames whose `corners` are their
`poseCorners`, and `clipDurationS` as before. Its body does not change, and the loops are read from all frames, as today. A frame can have `corners` and no
`poseCorners`, so the two families' windows can differ. On the first record's three clips none did ("no corners, any arm": 0). The repeat prints no such count, so M4's addendum reports it for the tilt clips.

### `DEFINITIONS`, the exact wording

Registered as written; each is added once, and `docs/benchmarks/glossary.md` lists each key and records version 2.

- **`H`:** "Per frame: the frame's homography as the tracker or the stateless pipeline returned it, its nine elements in row order, or null on a frame that is not ok. On a detection-only tracker's frame that consumed a detection, the detected frame's, as result.H is. With intrinsics(width, height) of processingResolution it gives the frame's closed-form pose and tilt, which no key exports."
- **`poseCorners`:** "Per frame: the target's corners, as in corners, projected through K · [r1 r2 t] of the result's pose, in frame px, K being intrinsics(width, height) of processingResolution: assumed, the same for every arm, and no calibration. The result's pose is the filtered pose with the poseFilter option on, the guarded pose with the tracker's guard option on, and poseFromHomography's in the stateless mode. null without a pose, when the pose's good is false, when any corner's depth R[6]x + R[7]y + t[2] is not positive, or when the four do not all project to finite points."
- **`posePosedFrames`:** "Frames with poseCorners."
- **`poseJitterWindows`:** "The one-second windows poseJitterPx pools: those holding at least 4 frames with poseCorners."
- **`poseJitterPx`:** "jitterPx's formula, unchanged, over poseCorners in place of corners. A stability metric: how much the pose-projected corners move about their own straight line within a second, with no truth in it. It reads jitter, not accuracy, so a lower figure is not a nearer pose. A line is fitted in each window, so it cannot see a constant offset between two arms, nor, at a constant rate, a constant lag; and it cannot decide between IPPE and the closed form where they differ by an offset. On moving footage it reads attenuated motion as lower jitter. It pools DETECT and TRACK frames, as jitterPx does, and a single wrong pose weighs on it heavily."
- **`poseSpreadPx`:** "spreadPx's formula, unchanged, over poseCorners in place of corners."
- **`poseCornerDistancePx`:** "Two exports of the same footage, both of metricsVersion 2: the median over their common frames of the mean distance between one frame's four poseCorners in each, in frame px. Beside poseJitterPx, as a descriptive reading and never a criterion: it sees the offset and the lag that metric cannot, and has no truth in it, so it says how far apart two arms are and not which is nearer."

### What the bump does

Three lines of the code read the version as a gate, and all three are consequences to register, not to discover:

- **`compareExports` refuses anything but `METRICS_VERSION`** (`bench-summary.mjs:235`). At 2, each of the 68 committed exports that record version 1 is refused by
  `scripts/compare-bench.mjs`, with a message, "its frames do not carry corners as defined here", that would be false: `corners` is unchanged.
- **`sequenceRefusal` refuses the same** (`bench-probe-replay.mjs:57`). Called with 2 on `2026-10-13-tab9-m4-preflight-sync-wall.json`, it says "it has metricsVersion 1, not 2", so
  R-replay's `seq.stdout` would be a refusal. Measured, on this base's module, by passing 2.
- **Two tests pin the version:** `examples/test/bench-metrics.test.mjs:1987` and the glossary's (`glossary.test.mjs:60`).

**Registered:** a module constant, proposed `READABLE_METRICS_VERSIONS = [1, 2]`, which `compareExports` and `sequenceRefusal` read. An export with no version, or another, stays refused, as today, including
the 30 committed exports with none. On a pair with either export at version 1, `compareExports` reports `jitterPx` and `spreadPx` under `H` as today, and its pose part is `null`, which changes no figure. On two at
version 2 it adds the pose part: `poseJitterPx`, `poseSpreadPx`, `poseJitterWindows` and `poseCornerDistancePx`, on the media times where both have `poseCorners`, the k-th frame with `poseCorners` at a media time in one paired with the k-th in the other. With no such media time the pose part is `null`, and the comparison under `H` stands: it is not refused, since a pair can share frames under `H` and none under the pose.

### The scope

**It reads jitter, not accuracy.** It is blind to a constant offset between two arms, and at a constant rate to a constant lag. So **it cannot decide between IPPE and the closed form where they differ by an offset,** as they do above 10°:
no consistent direction in jitter (20–30° on TRACK frames, sweep −0.069 to −0.006 as read and −0.068 to −0.063 without one media time, mid +0.013), while the corner distance grows to about 11 px (the repeat, B). **The filter's lag is declared not measurable by it** (R1's item 3), and the distance between filtered
and unfiltered poses on the same frames is the descriptive reading.

**What M9 may conclude with it (R2's item 3):** stability only, for example the filter at rest, or IPPE against the closed form in jitter below 10°. A claim about which pose is more accurate, at any tilt, needs ground truth (#92) or a calibrated
camera (#109), and is outside M9 unless its plan brings one of them in. On the device, a comparison on common media times must also account for #227's finding that under load the grab can return different pixels for the same media time.

### M0 to M8: what the implementation must meet (basis: the probes)

**Checks, not predictions.** The same discipline as A's. The base is the guard PR's merge into `dev`.

| | The check | Refuted by | Must fail on |
|---|---|---|---|
| **M0, version 1's definitions** | Every key of `DEFINITIONS` at the base has its string byte for byte at the tip; the only new keys are the seven above, with this file's wording; `METRICS_VERSION` is 2; the glossary test passes | one string changed; another key | a key's text edited |
| **M1, the frozen metric** | `git diff` of `cornerJitter`'s body and of `reprojectCorners` is empty, and the new summary keys come from a call of that function | any line in either | a copy of the metric with a changed `n − 2` |
| **M2, the corners** | Seeds 1 to 8, the six clips, every frame: `poseCorners` equal, `Object.is`, to the repeat's `poseCorners` (its lines 152 to 179, carried in the check) on the IPPE and FILTER arms | one element | `t[0] + 1e-6`, as check R's defect; `K` scaled 1.01; `R` transposed; the depth rule removed, which a constructed all-behind pose must catch, since it fired on no frame of the first record's clips |
| **M3, version 1's figures** | R-replay at the tip, with `--v1-projection`, is `98323f06…`, so every version 1 key of the 18 exports and the `--sequence` stdout are as they were; R-truth unchanged; `--replay` without the projection does not give that hash. **The projection covers the exports, and `seq.stdout` has none:** the PR leaves what `--sequence` prints as it is. A key beyond the six it deletes fails M3 by construction, and is a stop, not a reason to widen the projection | any other hash | one version 1 frame key changed; `sequenceRefusal` left at one version |
| **M4, the probes' figures** | The table below, each cell equal as printed | any cell | a `corners` slip into the pose keys: `H`'s column in place of IPPE's |
| **M5, the export** | The new keys appear in every replay export under version 2, and in the page's tracking exports (`check:page`, which runs that mode only); `frameRecord`, in unit tests, on a tracking, a detection-only and a stateless result, posed and not; version 1 keys in the same place; `frameRecord` without `K` throws | a key missing on a mode; a default `K` | a `K` defaulted; `H` rounded, which must change a value read back; the stateless mode left out, which the unit test must catch |
| **M6, the gate** | Two committed version 1 exports compare as at the base, field for field, pose part `null`; a version 1 and a version 2 likewise; two version 2 with the pose part, including a constructed pair of known `poseCornerDistancePx`, a pair with no common `poseCorners`, and a loop unposed in one; no version, and version 3, refused; `--sequence` on the committed export runs | any | the list left at `[2]`, or widened to anything; the distance taken over all four corners' sum |
| **M7, the tilt clips** | M4's rows for them through `--clips tilt`; the three clips' SHA-256 as `examples/README.md` gives; the flag refused with `--external`, `--sequence` and `--transfer`; every device-schedule export naming the borrowed constant in its `schedule` | any | the label removed; `CLIPS` extended, which M3 must catch |
| **M8, the guard's figures** | The frozen metric on the option's `pose`, as M4: 0.129 static, 4.245 / 4.880 / 10.703 wall, 2.420 / 3.397 / 5.193 table (first record, "Jitter") | any cell | the option's `pose` read from `poseSelection`, which gives IPPE's column |

**Only these existing test lines may change,** all in `examples/test/bench-metrics.test.mjs` unless named, and the PR lists them: the version literal at line 1987; `NEW_KEYS` at lines 1895 to 1908, gaining the four summary keys; the exact `frameRecord` expectation at lines 233 to 258, gaining the two keys; `K` in `frameRecord`'s fixtures; and `compareExports`' version assertions in `examples/test/compare-exports.test.mjs` where M6 replaces them. Outside the tests, `docs/benchmarks/glossary.md` records version 2 and lists the seven keys.

**How M4 is read:** the FILTER arm cannot go through the replay, so every row is read through `replayRun` and `frameRecord` at the eight seeds, as the probes did. On the first three clips, seed 1's frames are compared with the `--external 70` arm-1 export, the first record's check D. On the tilt clips, with the `--clips tilt` export.

**M4's table: frozen `cornerJitter` on `poseCorners`, every frame, the common set, counted loops 1 to 4 of 6, stamped on the continuous timeline, seeds 1 to 8, min / median / max:**

| Clip | Frames | Windows | IPPE jitter | FILTER jitter | IPPE spread | FILTER spread |
|---|---|---|---|---|---|---|
| static | 1452 | 52 | 0.270 | 0.227 | 1.079 | 1.057 |
| wall | 844 / 848 / 856 | 36 | 4.284 / 4.912 / 10.720 | 4.355 / 4.982 / 10.757 | 44.847 / 45.130 / 46.296 | 44.881 / 45.164 / 46.326 |
| table | 844 / 860 / 900 | 28 / 32 / 36 | 2.863 / 3.718 / 5.368 | 2.845 / 3.705 / 5.355 | 26.781 / 27.456 / 28.001 | 26.786 / 27.460 / 28.004 |
| cross | 1668 | 56 | 0.300 / 0.302 / 0.305 | in M2 | in M2 | in M2 |
| mid | 2628 | 88 | 0.217 | in M2 | in M2 | in M2 |
| sweep | 3432 / 3466 / 3472 | 116 | 1.482 / 1.750 / 3.895 | in M2 | in M2 | in M2 |

The first three rows are the first record's "Jitter" and "Spread". The last three are the repeat's B, "common set", `whole`. Its record prints no FILTER figure on them or spread, so those cells are held bit for bit by M2.

**The descriptive reading, not a criterion:** the implementation's addendum reports `poseCornerDistancePx`, CF to IPPE and FILTER to IPPE, beside the figures above. Its arithmetic is M6's, on constructed exports. CF's arm is computed in the check from the exported `H`, and it should read the first record's 0.637 px on the static clip. That is a read, not a criterion.

### The corpus

R2's item 6, the six clips in `examples/videos/`. **Whether the page offers the tilt clips is for M9's plan, and is not registered here.**

| Clip | How the replay reads it | Every frame | 15 and 25 ms |
|---|---|---|---|
| `pinball-static.mp4`, `pinball-bench.mp4`, `pinball-bench-table.mp4` | `CLIPS`, unchanged, in every form | the primary reading | measured `DEVICE_ACQUIRE_MS` (36.9, 20.4, 41.0 ms) |
| `pinball-tilt-cross.mp4`, `pinball-tilt-mid.mp4`, `pinball-tilt-sweep.mp4` | Only through `--clips tilt`, a form of its own: three tracking schedules (every frame, 15 and 25 ms), with `--external`'s loops, 6 of them with loops 1 to 4 counted, stamped on the continuous timeline, so its `runSummary` reads the counted loops as M4 does | the primary reading | **BORROWED: 36.9 ms, the static clip's, not measured,** since they share its size and orientation. Every figure on them says so |

**The constant is declared apart** from `DEVICE_ACQUIRE_MS`, which keeps its three measured entries. `CLIPS` does not change: entries there would change the default runs and `--external`, and so the reference, and `M3_ACQUIRE_MS` has nothing for them.
**Which figures use it:** the 15 and 25 ms rows on the tilt clips, and nothing else in this document. On mid, seed 8 never locks on those schedules, so a borrowed constant decides which frames are offered there (the repeat, A), and those figures read 7 of 8.

**The filter and guard arms do not go through the replay:** nothing in `scripts/` sets `poseFilter`, and `--options` does not read it. The checks drive `replayRun` with the tracker's options, as the probes did.

### Predictions for B

**None.** That the metric moves under each treatment is settled by the probes, and is M2 and M4. Its readings above 10° are settled as no consistent direction, and at rest as a direction that is one observation. The device is M9's, and no prediction for it is registered here.

## The regimes the covariates define, and what stands in each

Stage 3 asks for each regime's direction, margin and refuting outcome, or for the probe that already settled it. These are settled, on this corpus, on stability only:

| Regime | Reading, CF − IPPE in jitter, every frame | Basis | Whether it is a prediction |
|---|---|---|---|
| Below 5° | IPPE's the higher: −0.140 static; −0.141 to −0.133 cross 3–5°, TRACK frames; table −0.863 at 1–3° and −0.845 at 3–5° | first record; repeat, B | No: measured. M4 reproduces the arms |
| 5° to 10° | **Differs by clip:** IPPE's the higher on the table clip, −0.120 at 5–7° and −0.140 to −0.133 at 7–10°, on a jitter near 2; under 0.02 px on cross, a tie at 7–10°; no direction on the wall clip | first record; repeat, B | No: measured |
| 10° and above | No consistent direction; the corner distance grows | repeat, B | No: measured, and the metric cannot decide it |
| Single frames on few inliers; DETECT frames | They carry whole-set figures; read apart | Stage 2 above | Reporting rule |
| The filter at rest | −0.042 px, one observation | first record | No: measured. Its lag is declared not measurable |
| A camera whose `K` is not the assumed one | The crossover moves, in opposite directions on two readings | repeat, E | Not claimed: #109 |

## What a failed criterion means

A criterion that fails is never edited. The result goes in an addendum beside this file, and an addendum may be added more than once. A failed G or M criterion stops that PR, and is reported with what refuted it. If a reference stops reproducing at a base that changed no code it reads, that is a stop too, and the reference does not move.

## What this registration does not register

- **M9's campaign:** its plan, claims, schedules, whether the page offers the tilt clips or the guard, or any prediction about the device.
- **The filter's lag.** Declared not measurable by this metric (R1's item 3). No oscillation footage.
- **An accuracy claim for either pose,** at any tilt (#92, #109). Calibration is not in M8, and the chessboard video stays with the maintainer (R2's item 4).
- **A change to #151's seeding rule.** The loops are declared as copies instead (R1's item 4).
- **Adoption of the guard, or any threshold for a real camera.**
- **Any figure of the filter on the guard.** G5 is structural.
- **Anything under `--seed-policy run`, or under the scaled step.**

## The independent review

**Consultation 1, with the advisor, after the brief check and the reading, before any criterion was drafted.** It was asked about the covariate list, the regimes and the form of each criterion and its refuting outcome. The tool names no model. What came back, and what changed:

- **The recovered serialiser might not be the final one, and the hash should decide.** **Followed,** and it was right: Step 0, point 4.
- **`split.mjs` would crash on one run.** It did, after printing the line needed. The shipped script has no such mode.
- **Ship the serialiser, or say the PR must.** **Followed.**
- **The export carries no pose, so say where each covariate becomes readable.** **Followed,** with a correction: it proposed recomputing tilt from the export's `H`, and the export has no `H`, which is why version 2 adds one.
- **Report no sign inversion for the switches where no figure shows one.** **Followed.**
- **The version gate, and the decisions the record cannot make.** **Followed,** and ruled: Step 0.
- **Take the repeat's notes 4, 5 and 8 as reporting rules.** **Followed.**
- **On a guarded frame, `poseSelection` carries CF, `chosen: "fallback"`, and a new outcome, `"guarded"`, so that the existing counter line serves.** **Not taken, and put to the maintainer, who ruled it as drafted (Step 0, ruling 2).** It would erase IPPE's choice from a guarded result, and it needs a rule for a frame already ambiguous. The filter's ruling B keeps the unfiltered pose on every result for the same reason, and this form lets G1 require every field but `pose` to be unchanged.

**Consultation 2, with the advisor, on the whole draft against the verify-list, after the reviewer's findings were applied.** It found the draft holding, accepted the decline above, and withdrew its own proposal on recomputing tilt. What came back, and what changed. **All followed:**

- **`DEFINITIONS.poseCorners` named `poseGuard`, a proposed name, in a string M0 freezes.** It now says "the tracker's guard option".
- **The corpus called `--clips tilt` "the default form" with 6 counted loops,** and the default form has 2 and no counted summary. It is now a form of its own. **M4 did not say where its rows are read from:** it now does.
- **M3's projection covers JSON, and `seq.stdout` is in the 19.** The constraint is now written, with a key beyond the six as a stop.
- **G0's new test compared `timings`.** Read from the code and the serialised results: `run` injects no clock, so `timings` is null there, and the comparison stands as written, with that said.
- **A tally of "five decisions"** beside a list that holds more: removed.

**A fresh reviewer** (a subagent, given the code, the records, the rulings and the task's verify-list, not this session's reasoning; allowed to consult the advisor), before any commit. It checked every cell of the Stage 2, G3 and M4 tables and every line citation, reproduced both references independently, and ran mutants of the references script. **Held:** the tables' figures, apart from one basis below; the citations; both references; G1, G2, G5 and M3 as runnable. **Each applied, and each had passed consultation 1:**

- **`DEFINITIONS.H` was false on a tracking run:** only a detection-only tracker carries the detected frame's `H` (`tracker.ts:657-660`), and M0 would have frozen the error.
- **"Only these test lines may change" could not be met:** `NEW_KEYS` and the exact `frameRecord` expectation must change too.
- **G0's `{ mode: "off" }` leg had no route to either reference.**
- **The self-test claimed more than it tested:** eight masks could be removed, and the projection's version case could not fail for the reason it named. The cases were added and exercised by mutants.
- **The cost was on a basis no export is written in,** compact JSON. It now reads the indented form.
- **−0.065 stood among figures as read,** unlabelled. The regime rows did not match their figures: the table clip's whole below-10° reading sat under "below about 5°", and the 5° to 10° row left that clip out, which read as settled near zero.
- **M5 named `check:page` for every mode,** and it runs tracking only. The pose part of `compareExports` had no stated result for no common frames. "Copies" had no schedule.
- **The smaller ones:** `<=` could not fail on the corpus, so it moved to G4; `jitter-dry-run.mjs` calls `frameRecord`; the guard's figures had no id, and are now M8; the #133 ruling also says "before the metric's Stage 3"; a quote's cut mark; the attributions of the reporting rules; note 6's wording; the stamp, in G1 and G5; the stateless mode's closed form holding on this backend; the negative's input named.

**Not applied:** none.

## Constraints kept

This file and its references script. No code under `packages/*/src` or `examples/js/`, no change to `METRICS_VERSION`, no package, lockfile, tsconfig, target, clip or fixture touched, no export committed. No CHANGELOG line. No issue commented on, edited or closed.
