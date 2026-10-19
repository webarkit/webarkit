# #104, Stage 1 probe: what change in `jitterPx` the refusal would produce on the wall clip, as a function of the threshold, against the replicate floor (2026-10-19)

**A Stage 1 probe under [the step protocol](./step-protocol.md), run on
2026-10-19, read-only on committed exports. No device run, no bench-page run,
no replay: every figure below is recomputed from exports already in this
directory through the frozen metrics module, with frames refused post hoc by
#104's signal. A derivation, not a device measurement; not campaign data;
never reportable as a round. No `H` changes under any reading, so every
movement here is frame selection in full, as
[#104's probe](./2026-10-16-104-stage1-probe.md) rules for its own figures
(its item 5). It proposes no threshold: the curve is reported over a grid,
and no value on it is a value for round 1. The plan registers this
derivation as required before round 1 of #104 can be scoped
([`README.md`](./README.md), "#137's fix follows the campaign, and what stays
open before round 1 of #104 (2026-10-18)", the paragraph "What stays open:
round 1's effect-size statement"); the statement itself is the maintainer's
and is not written here.**

The computation is
[`2026-10-19-104-stage1-effect-size-probe.mjs`](./2026-10-19-104-stage1-effect-size-probe.mjs),
which reads the nine exports beside it, `examples/js/bench-metrics.mjs`, the
built bundle and the committed target, and writes nothing. Its output is not
committed; run it to reproduce every number here, the independent reviewer's
included.

**Revised 2026-10-19 after the maintainer's review of #153** (a comment of
three findings, and two review threads): a floor on τ is declared from the
record's own measurement of the signal on a right fit, and the curve is
re-read above it, nothing being claimed below (step 3, "A floor on τ"); the
verdict is restated in two parts, the second being that the comparison round
1 registers does not read the movement (step 4); the comparison is stated at
both values of the replicate floor; the jackknife's attribution is read under
the rule of 2026-10-18; and the script hashes the bundle and the metrics
module against the manifest before any figure. What changed, and the
script's output before and after, are under "Revised after the maintainer's
review".

## Step 0: provenance

- **Ref:** `docs/104-stage1-effect-size`, branched from `dev`.
- **HEAD of `dev` at branching: `1f28fce87a44277f81ef329a42ac6758f8e1edc1`**,
  the merge commit of #150. `git fetch origin` was run first; `origin/dev`
  and the working tree were both `1f28fce`, matching, working tree clean.
  Node v24.21.0, the pin. The bundle was rebuilt at that commit
  (`npm run build`): its manifest reads HEAD `1f28fce`, clean, bundle
  `d568c8edca35…`. The script imports `intrinsics` and `decode` from it, the
  second to read the committed target's size, and nothing else. Since the
  review of 2026-10-19 it hashes the bundle and `examples/js/bench-metrics.mjs`
  before importing either and refuses a mismatch with the manifest's entry:
  the bundle's bytes hash to the manifest's `d568c8edca35…`, the module's to
  `47fedde90d48…`, the manifest's `served` entry for it (blob `f8bb5787…`,
  the same blob at `1f28fce`, at `origin/dev`'s `f718c9f` and on this
  branch). Both matched when the revision was run; the manifest is the build
  of `1f28fce`, not rebuilt.
- **The passages the brief rests on, verified against their sources at that
  commit:**
  1. **The registration.** The plan's section named above, its last
     paragraph: "No document states what change in `jitterPx` #104's refusal
     would produce; #104's body does not name the metric, and #107's names it
     and no magnitude. Registered as required before round 1 can be scoped:
     it is to be read on common media times, against a replicate ratio of
     1.46 on the wall clip, and it must be posed against this plan's own
     statement that `jitterPx` 'measures steadiness only where the target
     stays in view and every pose is right … on a hand-held clip it computes
     but does not measure that'".
  2. **The signal.** The body of
     [#104](https://github.com/webarkit/webarkit/issues/104), "The signal":
     with `b1` and `b2` the first two columns of `K⁻¹H`,
     `d_scale = ‖b1‖ / ‖b2‖ − 1` and `d_orth = b1·b2 / (‖b1‖ ‖b2‖)`, both 0
     for a plane seen by a pinhole camera. The body says the signal is "on the
     fitted homography, computed before the pose" and "computed on the fit,
     before the pose step"; the words "detection" and "tracking" do not occur
     in it. Both readings are measured below.
  3. **How #104's probe obtained the two quantities.** Its setup section, the
     bullet "The signal": "`H` per posed frame is recovered from the export's
     four corners, which determine it; the recovered `H` reprojects the
     corners to at most 2.3 × 10⁻⁸ px (table clip) and 1.4 × 10⁻¹² px (wall
     clip). `K` is the bundle's `intrinsics(width, height)` at the export's
     processing resolution". Its item 3 holds the values so obtained. Its
     script's step 3 states the same method.
  4. **What the exports do not carry.** The item 3 addendum of 2026-10-17,
     "The instrument, and the one addition to it": "The exports carry no
     residual for a detection. … `frameRecord` exports neither the fit's `H`
     nor its correspondences." #137's probe of 2026-10-18, "What the
     committed exports could not answer": "The exports carry no fit residual
     for a DETECT frame".
  5. **The floor.** #137's probe, question 2, the row "sync, wall (4 runs)":
     on 141 common media times, 6.31 (32), 4.86 (30), 6.90 (32) and 7.10 (32)
     px, R 1.46, range 2.24, under `none`; the same values and 140 common
     under `X4`, `X6` and `X8`; under `XD`, 3.09, 4.26, 6.41 and 3.20 px on
     101, R 2.07, range 3.32. The brief lists the four values sorted; the
     record lists them in run order, as here.
  6. **The draw's leverage.** The maintainer's
     [comment of 2026-10-16T07:59Z](https://github.com/webarkit/webarkit/issues/137#issuecomment-6210882423)
     on #137: on `pinball-bench.mp4`, `jitterPx` over seeds 1 to 8 of the
     "every frame, sync" arm 5.75, 15.39, 27.46, 9.46, 17.17, 13.50, 17.12
     and 12.43 px, ratio 4.8; the "device, scaled step, sync" arm 6.64 to
     22.64 px, ratio 3.4. `scripts/replay-clips.mjs` takes `--seed` (its
     header, and `SEED` at its line 360).
  7. **The plan's statement on the metric.** The entry "The treatment's
     effect on `jitterPx` is not yet decomposed", under "#104: a joint claim,
     or none": "`jitterPx` measures steadiness only where the target stays in
     view and every pose is right (`DEFINITIONS.jitterPx`); on a hand-held
     clip it computes but does not measure that." The probe's item 9 has the
     same words.
  8. **Exclusion against gate.** The plan's section of 2026-10-18, "#137's
     measured standing": "an exclusion from the metric is not a gate in the
     pipeline: a refused fit leaves the tracker without a lock at that frame,
     and every later frame of the run differs, which frames detect, which
     track, which pose at all."

  All eight hold as quoted. **In two places the brief's wording differs from
  the record, and the record is followed:**
  - *"Item 8 registers that round 1 calibrates its own" threshold.* Item 8
    registers that "round 1 needs its own calibration on the clips it uses"
    of **the outcome comparison**, the noise a comparison on those clips is
    read against, and "it neither replaces nor extends the clause's block
    gate"; it says nothing of the signal's threshold. Where the record places that
    threshold: #104's body ("Its thresholds come with their derivation from
    the sweep"), the probe's item 7 ("No value of τ for round 1 is stated
    here … a threshold value cannot come from a non-causal surrogate") and
    its "What this probe does not decide" ("The threshold #104 registers …
    the maintainer's, from the treatment's own measurement"). Under either
    reading no threshold is proposed here, and none is.
  - *"Item 8 is the record of a desktop calibration that did not transfer to
    these clips."* The calibration item 8 records is the null control's
    jitter clause's, from round 0's device session on the static clip
    (s₀ = 0.0012672 px, A = 0.0019834 px). What is desktop in item 8 is the
    hand-held residual it set against that threshold, 5.30 to 5.33 px on the
    wall clip under A ≥ 12 over seeds 1 to 8 of the replays. The plan's own
    words, in the addendum of 2026-10-18 under the decomposition entry:
    "item 8 is itself the record of a calibration that did not transfer".
    The statement the brief asks for is made in step 3 below in that form.

## Step 0, continued: the precondition

**What a posed frame carries.** On every one of the nine exports, a frame
with a pose carries `corners`, the target's four corners under the frame's
`H` in frame pixels (`DEFINITIONS.corners`), `numInliers`, `state` and
`mediaTimeSeconds`; the export carries `processingResolution` (480 × 270 on
all nine) and the target's record (`sha256`, 512 × 640). It carries no `H`
and no residual (passage 4).

**How item 3 obtained `d_scale` and `d_orth`, and whether that route is
open here.** Passage 3: `H` recovered from the four corners, which are
`reprojectCorners(H, targetCorners(512, 640))` and determine it up to scale,
a scale both quantities are invariant to; `K` from the bundle's
`intrinsics` at the processing resolution. Both inputs are on these exports.
The route is therefore open, and it is the one taken: the probe's three
function definitions, the solve, the recovery of `H` from the corners and
the signal on `K⁻¹H`, are copied verbatim into this probe's script, because
the probe's script is a program that reads a replay directory and exits,
not a module that can be imported. The recovery is checked on every posed frame by reprojecting the
corners: the largest error over the nine exports is 3.9 × 10⁻¹² px (per run
in the table below), against the probe's 1.4 × 10⁻¹² px on the same clip.
`K` is `[415.692, 0, 240; 0, 415.692, 135; 0, 0, 1]`, the bundle's 60°
horizontal field of view at 480 × 270. The other route the record has, the
shadow observer of the item 3 addendum, which reads `H` off
`estimateHomography` during a replay, is a replay and is neither available
on a committed export nor needed.

**The precondition is met**, and the probe proceeds. Two further things are
checked before any figure, because the signal reads the target's corners:
every export's `target.sha256` equals the committed `pinball.wnft`'s
(`9e8eb4863b58…`), and its `widthPx`, `heightPx` equal what the target
decodes to. Both hold on all nine.

## The exports, the method and the checks

The nine committed relatives of round 1's instrument on the wall clip
(`pinball-bench.mp4`, 480 × 270, Tab 9): M3's sync and worker arms of
2026-10-01, four runs each, and M4's pre-flight of 2026-10-13. Each is read
over its counted loops 1 to 4, as
[`2026-10-16-m3-handheld-frame-set.mjs`](./2026-10-16-m3-handheld-frame-set.mjs)
and #137's probe read them.

| run | counted frames | posed (DETECT, TRACK) | ok without corners | recorded `jitterPx` (windows) | `H` recovery, max error (px) |
|---|---|---|---|---|---|
| sync-wall-1 | 495 | 376 (95, 281) | 77 | 16.3595 (36) | 1.1 × 10⁻¹² |
| sync-wall-2 | 487 | 367 (97, 270) | 79 | 88.6817 (36) | 3.2 × 10⁻¹² |
| sync-wall-3 | 499 | 377 (88, 289) | 83 | 7.2828 (36) | 1.1 × 10⁻¹³ |
| sync-wall-4 | 506 | 387 (85, 302) | 76 | 10.3966 (36) | 3.9 × 10⁻¹² |
| worker-wall-1 | 782 | 308 (0, 308) | 0 | 4.8863 (28) | 8.5 × 10⁻¹⁴ |
| worker-wall-2 | 758 | 322 (0, 322) | 0 | 3.3163 (29) | 5.7 × 10⁻¹⁴ |
| worker-wall-3 | 761 | 266 (0, 266) | 0 | 4.1165 (25) | 5.7 × 10⁻¹⁴ |
| worker-wall-4 | 759 | 303 (0, 303) | 0 | 3.1892 (29) | 8.5 × 10⁻¹⁴ |
| m4-preflight-sync-wall | 501 | 379 (92, 287) | 81 | 8.7783 (36) | 3.1 × 10⁻¹³ |

- **The metric is imported, not reimplemented.** `cornerJitter`,
  `countedLoopFrames`, `isLoopWrap`, `mediaKey` and `targetCorners` come from
  `examples/js/bench-metrics.mjs`, unchanged. Every refusal is
  `cornerJitter`'s own `include` argument.
- **Reproduction check, fatal, zero tolerance:** each run's whole-set
  `jitterPx` recomputed over its counted frames equals the recorded
  `runSummary.jitterPx` exactly, 9 of 9. It can fail; it did not.
- **Window-keying check, fatal:** the windows kept, counted by keying frames
  as `cornerJitter` keys them (`loop:floor(mediaTime)`) and applying its two
  eligibility rules, equal the module's `jitterWindows` under every reading
  of every run, including every reading on a common set. It can fail; it did
  not.
- **The floor's derivation reproduced, fatal:** the M3 sync wall group under
  #137's probe's five readings, built as that probe builds it (below), must
  print the record's figures of passage 5 to the digit: common count, the
  four values, their windows, the ratio and the range. It did, under all five
  (the table in step 2). This ties the curve to the floor by construction:
  the same intersection, the same `include`, the same module.
- **Input checks, fatal:** every export named exists, carries
  `metricsVersion` 1, the wall clip, `loops`, one processing resolution
  shared by all nine and the committed target's hash and size; every frame
  with corners is `ok` and has a numeric `numInliers`; `K` has no skew; every
  recovery is within 10⁻⁶ px; the bundle's manifest names a commit, a clean
  tree and a bundle hash, and, since the review of 2026-10-19, the bundle's
  bytes and the metrics module's bytes hash to the manifest's entries for
  them, checked before either is imported (the manifest hashes the module
  under `served`; where it carried no entry, the script would print the
  module's hash in its provenance line instead of comparing it to nothing,
  since a path is not provenance). A missing or malformed input fails;
  nothing falls back to a default. No figure is printed after a failed
  check.
- **Exercised on the failing side,** as the protocol requires of a check
  before it is trusted: ten scratch copies of the script outside the
  repository, each pinned to this directory with one check inverted or one
  input misnamed (the floor's recorded common count, 141 → 142; an export's
  name misspelled; the recovery tolerance at 10⁻²⁰; the window rule at five
  frames; the manifest's clean flag; the target hash; the reproduction
  check; the repeated regression's check; the skew check; the cosine bound).
  Each exits 1 naming what disagrees, with nothing on stdout; the unmodified
  copy exits 0 with the script's output. The copies are not committed. The
  independent read of this document exercised four of them the same way,
  before this bullet existed (its second finding, under "Revised after the
  independent read"). After the maintainer's review of 2026-10-19, three
  more copies exercised the two hash checks the same way, each reading a
  scratch copy of the manifest with one entry altered or removed; their
  outputs are under "Revised after the maintainer's review".
- **The refusal, three kinds and two scopes.** Kind **E** refuses a frame
  whose |`d_scale`| or |`d_orth`| exceeds τ, the pair #104's probe called E
  and the refusal the brief names; **S** reads |`d_scale`| alone, **O**
  |`d_orth`| alone, both *beyond the brief*. Scope **detect**
  applies the refusal to DETECT frames only and always keeps a TRACK frame:
  the reading of #104's probe (its filters S, O and E) and of #137's probe,
  and the primary reading here. Scope **all** applies it to every posed
  frame, TRACK included: the literal reading of #104's "the fitted
  homography", since the residual limit the body names, `maxFitRms`, is the
  tracking step's. Which fits #104's registration puts the signal on is not
  decided here; both are measured, the second *beyond the brief's* primary
  reading. τ runs over
  0.005, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1, 2
  and 5.
- **The group and its common media times**, as #137's probe builds them
  (question 2): M3's four sync runs; under a reading, each run's media keys
  (`mediaKey(mediaTimeSeconds)`) of frames with corners that pass it; the
  common set is the intersection of the four, **rebuilt per reading**; each
  run's figure on it is `cornerJitter` with `include` restricted to passing
  frames at those keys, as `compareExports` reads two runs. A media key is a
  time within the clip, so one key matches one frame per counted loop, and a
  key refused in one loop of one run leaves the intersection for every loop
  of every run. That property shapes the curve, and the decomposition below
  measures it.
- **Known limitation,** as every derivation script's here: no test and no
  format check cover `docs/`, so the script could break silently later while
  its figures stay in the record, and a defect of its own would reproduce.
  Its guards are the checks above; they catch a changed module, a changed
  export or a changed target, not a defect in the signal arithmetic, which is
  the probe's, copied.

## Step 1: the signal, per posed frame

|`d_scale`| and |`d_orth`| as p10, p50, p90, max; the five sync exports
pooled, by state and inlier count, and the four worker exports' TRACK frames
pooled. The script prints the same per run.

| group | n | \|d_scale\| | \|d_orth\| |
|---|---|---|---|
| DETECT, 4 inliers | 19 | 0.112, 0.821, 3.355, 12.754 | 0.343, 0.916, 0.949, 0.985 |
| DETECT, 5 | 4 | 0.722, 0.722, 0.967, 1.072 | 0.682, 0.682, 0.730, 0.751 |
| DETECT, 6 | 9 | 0.281, 0.653, 1.531, 1.782 | 0.144, 0.700, 0.976, 0.976 |
| DETECT, 7 to 8 | 15 | 0.285, 1.495, 3.091, 3.091 | 0.122, 0.468, 0.955, 0.956 |
| DETECT, 9 to 15 | 49 | 0.055, 0.215, 0.835, 2.887 | 0.076, 0.234, 0.673, 0.938 |
| DETECT, 16 and up | 361 | 0.003, 0.011, 0.105, 1.194 | 0.001, 0.007, 0.073, 0.672 |
| TRACK, sync | 1429 | 0.001, 0.004, 0.010, 0.221 | 0.001, 0.004, 0.010, 0.323 |
| TRACK, worker | 1199 | 0.001, 0.004, 0.009, 0.221 | 0.001, 0.004, 0.010, 0.296 |

The shape is the probe's (its item 3, on the replays): the low-inlier
detections sit at |d| of order 1, the 16-and-up detections and the TRACK
frames at 0.01, with a tail. Of the 457 posed DETECT frames in the five sync
exports, 47 have 8 or fewer inliers and 361 have 16 or more; the script
prints the histogram.

**An observation, recorded because it bears on the construction.** The same
instants recur across runs with the same signal to three decimals: the
7-to-8-inlier maximum, |`d_scale`| 3.091, is the detection at 3.411 s in
`sync-wall-2`, `-3` and the pre-flight; the 4-inlier maximum, 12.754, is the
detection at 1.846 s in `sync-wall-1` and `-4`; the TRACK maxima 0.221, 0.296
and 0.323 each recur in two or three exports (the per-run table in the
script's step 1, and its section (b), (c) for the two detections). The
exports are what they are; a cause is not measured here. *Conjecture, labelled as one:* the detector and
the tracking step are deterministic on a given source frame except for
RANSAC's draw, so two runs that reach the same frame from the same state
produce the same fit. What follows for the curve does not rest on the cause:
it rests on the measured fact that the refusal, at a given τ, removes the
same media times from several replicates at once.

**The DETECT frames at the group's common media times with E above 0.3**,
the frames whose refusal at any τ on the grid above 0.3 can move a common-set
figure; media time (inliers, window, `d_scale`, `d_orth`):

- `sync-wall-1`, 9: 2.448 s (4, `0:2`, +0.31, +0.92); 3.411 s (8, `0:3`, +0.87, −0.96); 2.448 s (4, `1:2`, +0.31, +0.92); 3.411 s (8, `1:3`, −0.24, +0.75); 4.334 s (30, `1:4`, +0.80, −0.26); 3.411 s (7, `2:3`, −0.36, +0.02); 3.411 s (8, `3:3`, +0.87, −0.96); 3.532 s (14, `3:3`, −0.05, −0.39); 3.853 s (13, `3:3`, −0.23, −0.39).
- `sync-wall-2`, 7: 3.532 s (14, `0:3`, +0.35, −0.59); 2.448 s (4, `1:2`, +1.01, −0.95); 3.411 s (8, `1:3`, +3.09, +0.47); 3.692 s (15, `1:3`, −0.21, −0.30); 3.411 s (8, `2:3`, +3.09, +0.47); 3.411 s (8, `3:3`, +3.09, +0.47); 3.532 s (14, `3:3`, −0.36, −0.28).
- `sync-wall-3`, 7: 2.448 s (4, `0:2`, +0.31, +0.92); 3.411 s (8, `0:3`, +3.09, +0.47); 2.448 s (4, `1:2`, +1.01, −0.95); 3.411 s (8, `1:3`, +3.09, +0.47); 3.532 s (14, `1:3`, −0.36, −0.28); 3.853 s (12, `1:3`, −0.40, +0.32); 3.532 s (14, `2:3`, −0.05, −0.39).
- `sync-wall-4`, 7: 2.448 s (4, `0:2`, +1.01, −0.95); 3.532 s (14, `0:3`, −0.05, −0.39); 3.411 s (8, `1:3`, +1.22, −0.95); 3.532 s (14, `1:3`, −0.05, −0.39); 3.692 s (11, `1:3`, −0.25, −0.70); 3.853 s (13, `1:3`, −0.37, +0.14); 3.532 s (14, `2:3`, −0.36, −0.28).

All but one of them (4.334 s, a 30-inlier detection of `sync-wall-1` in the
fifth second) are in the fourth second of media time or the one before it:
the stretch where #137's probe found the wall clip's remaining spread after
`X4` to sit, "in one no-lock second of detection poses at 8 to 21 inliers in
two runs of four, and in a diffuse residual in the other two" (its jackknife
section), where the sync arm detects on every frame. The 2.448 s
instant is a 4-inlier detection in all four runs; the 3.411 s instant a 7- or
8-inlier detection in all four, its signal 0.36 to 3.09 depending on the run
and loop.

## Step 2: the curve, as a function of the threshold

### Kind E on DETECT frames, the primary reading

Per τ: the posed frames each sync run refuses, of its posed; each run's
whole-set `jitterPx` (windows kept, of 36); the group's common media times
(the keys that leave the `none` intersection of 141); each run's figure on
the group's common media times (windows kept); the replicate ratio and range,
the floor's form; and each run's change from the `none` figure, as the ratio
`none` ÷ τ and in px. The worker runs refuse nothing under this scope (no
DETECT frame) and keep their recorded figures, 4.89, 3.32, 4.12 and 3.19 px,
at every τ; the pre-flight's column is in the next table.

| τ | refused, runs 1 to 4 (of 376, 367, 377, 387) | whole-set, runs 1 to 4 (windows) | common (leaving) | on common, runs 1 to 4 (windows) | R | range | change ratio, runs 1 to 4 | change px, runs 1 to 4 |
|---|---|---|---|---|---|---|---|---|
| none | 0 0 0 0 | 16.36 (36) 88.68 (36) 7.28 (36) 10.40 (36) | 141 | 6.31 (32) 4.86 (30) 6.90 (32) 7.10 (32) | 1.46 | 2.24 | — | — |
| 5 | 1 0 0 1 | 16.36 (36) 88.68 (36) 7.28 (36) 10.40 (36) | 141 (0) | 6.31 (32) 4.86 (30) 6.90 (32) 7.10 (32) | 1.46 | 2.24 | 1.00 1.00 1.00 1.00 | 0.00 0.00 0.00 0.00 |
| 2 | 1 3 2 1 | 16.36 (36) 67.30 (35) 6.81 (35) 10.40 (36) | 140 (1) | 4.05 (31) 4.46 (28) 6.77 (31) 4.09 (31) | 1.67 | 2.72 | 1.56 1.09 1.02 1.74 | +2.26 +0.40 +0.13 +3.01 |
| 1 | 3 4 4 5 | 7.98 (35) 67.30 (35) 6.75 (35) 8.98 (35) | 139 (2) | 4.05 (31) 4.46 (28) 6.77 (31) 4.09 (31) | 1.67 | 2.72 | 1.56 1.09 1.02 1.74 | +2.26 +0.40 +0.13 +3.01 |
| 0.7 | 11 7 8 12 | 4.20 (34) 67.30 (35) 6.69 (34) 4.32 (34) | 139 (2) | 3.99 (31) 4.46 (28) 6.77 (31) 4.09 (31) | 1.70 | 2.78 | 1.58 1.09 1.02 1.74 | +2.32 +0.40 +0.13 +3.01 |
| 0.5 | 12 9 11 15 | 4.20 (33) 4.79 (35) 6.33 (33) 4.21 (33) | 139 (2) | 3.99 (31) 4.46 (28) 6.77 (31) 4.09 (31) | 1.70 | 2.78 | 1.58 1.09 1.02 1.74 | +2.32 +0.40 +0.13 +3.01 |
| 0.3 | 15 11 16 19 | 4.17 (32) 4.80 (33) 6.33 (32) 4.21 (32) | 137 (4) | 3.99 (31) 4.46 (28) 6.77 (31) 4.09 (31) | 1.70 | 2.78 | 1.58 1.09 1.02 1.74 | +2.32 +0.40 +0.13 +3.01 |
| 0.2 | 17 16 22 22 | 4.15 (32) 4.81 (32) 6.35 (32) 4.21 (32) | 135 (6) | 3.99 (31) 4.47 (28) 6.78 (31) 4.09 (31) | 1.70 | 2.79 | 1.58 1.09 1.02 1.74 | +2.32 +0.39 +0.12 +3.01 |
| 0.15 | 23 23 26 24 | 4.11 (32) 4.81 (32) 6.36 (32) 4.21 (32) | 133 (8) | 4.02 (31) 4.49 (28) 6.81 (31) 4.11 (31) | 1.69 | 2.79 | 1.57 1.08 1.01 1.73 | +2.29 +0.37 +0.10 +2.99 |
| 0.1 | 31 32 31 33 | 4.10 (32) 4.80 (32) 6.39 (32) 4.22 (32) | 132 (9) | 4.02 (31) 4.49 (28) 6.84 (31) 4.13 (31) | 1.70 | 2.81 | 1.57 1.08 1.01 1.72 | +2.29 +0.37 +0.07 +2.97 |
| 0.07 | 33 33 33 36 | 4.10 (32) 4.81 (32) 6.41 (32) 4.24 (32) | 132 (9) | 4.03 (31) 4.50 (28) 6.84 (31) 4.13 (31) | 1.70 | 2.81 | 1.57 1.08 1.01 1.72 | +2.28 +0.36 +0.07 +2.96 |
| 0.05 | 39 35 37 40 | 4.13 (32) 4.82 (32) 6.45 (32) 4.25 (32) | 130 (11) | 4.06 (31) 4.54 (28) 6.88 (31) 4.15 (31) | 1.70 | 2.83 | 1.56 1.07 1.00 1.71 | +2.25 +0.32 +0.02 +2.94 |
| 0.03 | 45 42 41 41 | 4.14 (31) 4.83 (32) 6.47 (32) 4.25 (32) | 127 (14) | 3.99 (30) 4.50 (28) 6.92 (30) 4.15 (30) | 1.73 | 2.92 | 1.58 1.08 1.00 1.71 | +2.32 +0.37 −0.01 +2.95 |
| 0.02 | 48 46 44 43 | 4.06 (31) 4.83 (31) 6.43 (32) 4.27 (32) | 125 (16) | 3.79 (29) 4.43 (28) 6.65 (30) 3.83 (30) | 1.75 | 2.86 | 1.67 1.10 1.04 1.85 | +2.52 +0.43 +0.26 +3.27 |
| 0.01 | 62 62 60 58 | 3.66 (30) 4.53 (30) 6.25 (30) 4.08 (32) | 115 (26) | 3.26 (27) 4.20 (27) 6.33 (26) 3.30 (27) | 1.94 | 3.07 | 1.94 1.16 1.09 2.15 | +3.05 +0.66 +0.57 +3.80 |
| 0.005 | 86 77 78 79 | 3.44 (28) 4.17 (26) 6.26 (26) 3.37 (30) | 107 (34) | 3.14 (26) 4.23 (25) 6.28 (26) 3.23 (27) | 2.00 | 3.13 | 2.01 1.15 1.10 2.20 | +3.17 +0.63 +0.63 +3.87 |

**Which windows lose eligibility.** Whole-set, every sync run loses the
window of the fourth second of media time in each of its four counted loops,
`0:3`, `1:3`, `2:3` and `3:3`, at every τ from 0.05 to 0.2: 4 to 6 posed
frames each before, 0 to 1 after at 0.05 to 0.1 and 0 to 3 after at 0.15 and
0.2; at 0.3 to 0.7 those windows lose one to three frames and keep or lose
eligibility by run; at 1 and 2 one window of four frames drops to three in
`sync-wall-2` (`2:3`), `-3` (`0:3`) and, at 1, `-1` and `-4` (`1:3`); below
0.05 the refusal reaches windows of the lock-holding seconds (`:4`, `:7`,
`:8`), 6 to 10 windows per run at 0.005. The script lists every one. **On
the group's common media times** the windows that drop are, at every τ from
0.05 to 2, exactly the ones that held four frames there, the eligibility
boundary: `3:3` in `sync-wall-1`, `1:3` and `3:3` in `sync-wall-2`, `1:3` in
`sync-wall-3`, `1:3` in `sync-wall-4`; the other windows of that second held
one to three frames on the common set and were outside the pool already (the
script's frames-per-window list, under its section (b), (c)). At 0.03 and
below, windows of the lock-holding seconds drop too: of 6 to 8 frames at
0.02 and 0.03 (`3:4` 7 → 3 in run 1, `2:4` 6 → 3 in run 3, `1:4` 7 → 3 in
run 4), and of 4 to 8 frames at 0.01 and 0.005.

**Which media keys leave the intersection, and who refuses them.** At τ = 2,
one: 3.411 s, refused by `sync-wall-2` and `-3` (the 8-inlier detection, its
signal 3.09 there) and by no other run. At τ = 1, two: 2.448 s and 3.411 s,
each refused by runs 2, 3 and 4 (run 1's frames there read 0.92 and at most
0.96, so it refuses neither). At 0.3 to 0.7, the same two, refused by all
four runs, plus 3.532 s and 3.853 s at 0.3. At 0.2, six keys, all between
2.448 s and 4.455 s. At 0.05, eleven, between 2.448 s and 5.258 s. At 0.02,
sixteen; at 0.005, thirty-four, spread from 2.4 s to 11.8 s. Every key that
leaves at τ ≥ 0.3 is one of the no-lock second's detections listed in step 1.

**The decomposition.** A run's figure on the group's common media times can
move for two reasons: keys leaving the intersection, which any run's refusal
causes and every run's figure then loses, and the run's own refused frames at
keys that stay, which happens when another loop's frame at the same key
passes. The script reads both: the run on the `none` intersection with only
its own refusals applied ("fixed set"), and the run on the τ intersection
with no refusal of its own ("τ keys only"). Two readings of the table:

- **The second source is at most 0.0613 px at the grid's values, and
  0.1408 px between them.** On every run at every τ on the grid, the rebuilt
  figure and the "τ keys only" figure agree within 0.0613 px (`sync-wall-1`
  at 0.2 to 0.7, 3.99 against 4.05 at two decimals; the script's sweep
  section prints each run's four-decimal maximum, 0.0613, 0.0520, 0.0217
  and 0.0546). Evaluated at every breakpoint of the curve, the E of every
  posed DETECT frame, the largest difference is 0.1408 px (`sync-wall-1`, τ
  in [0.010982, 0.011617)) and 0.1137 px (`sync-wall-4`, [0.017015,
  0.017204)), the reviewer's finding below. The whole of every movement in
  the table above, to that margin, is keys leaving the intersection.
- **At τ = 2 the movement of `sync-wall-1` and `-4` is other runs' refusal.**
  Their "fixed set" figures are the `none` figures, 6.31 and 7.10 px: neither
  refuses a frame in the intersection. Their rebuilt figures are 4.05 and
  4.09 px because `sync-wall-2` and `-3` refuse 3.411 s, the key leaves the
  intersection for every loop of every run, and in runs 1 and 4 that key is
  the fourth frame of the four-frame windows named above, which drop. At
  τ = 1 run 4 refuses 2.448 s and 3.411 s itself (fixed set 4.09; its own
  poses there read E 1.00586 and 1.21738, so it refuses them at any τ below
  those) and run 1 still does not (fixed set 6.31, rebuilt 4.05; its 3.411 s
  poses read at most 0.95600). From 0.7 down every run
  refuses both instants itself, and the fixed-set and rebuilt figures agree
  within 0.07 px down to 0.05 and within 0.09 px at 0.03, read from the
  table's two decimals; below that the keys
  leaving are many and the fixed-set figure, which keeps them, reads higher
  (run 4 at 0.01: 3.92 against 3.30).

### Kinds S and O on DETECT frames

*Beyond the brief, which names #104's refusal and not its halves.* The same
shape, because the frames that matter carry both quantities above the
grid's values. S alone (|`d_scale`|) gives the group's figures within
0.04 px of E's at every τ from 0.02 up and ratios within 0.01 of E's
(1.69 to 1.75 from 0.02 to 0.7, 1.67 at 1 and 2); it refuses fewer frames
(at 0.05: 34, 31, 31, 33 against E's 39, 35, 37, 40). O alone (|`d_orth`|)
refuses nothing at τ ≥ 1, since no posed DETECT frame on these exports has
|`d_orth`| above 0.985, so its curve is the floor there; from 0.7 down to
0.03 it gives the same four figures within 0.07 px of E's (at 0.05: 4.05,
4.54, 6.85, 4.13 on 131 keys); at 0.02 and 0.01 it refuses fewer of the
lock-holding seconds' detections and reads higher (at 0.01: 4.08, 4.54,
6.99, 4.22 on 125 keys against E's 3.26, 4.20, 6.33, 3.30 on 115); its ratio
is 1.67 to 1.71 from 0.7 down to 0.01 and 1.94 at 0.005. Wherever either
alone refuses a frame, the runs that cross the floor are the same two as
under E; where O alone refuses nothing, at τ ≥ 1, no run moves, and E's
crossing there is S's. The script prints both curves in full.

### Every posed frame, TRACK included

*Beyond the brief's primary reading, measured because #104's body names
neither fit.* At τ ≥ 0.3 this scope refuses at most two TRACK frames more
than the detect scope on any run; the group's figures are the detect scope's
to the digit, and the whole-set figures within 0.08 px (`sync-wall-2` at 0.3,
4.72 against 4.80; the pre-flight at 0.3, 5.37 against 5.41). At 0.2 it
refuses two TRACK frames of `sync-wall-2`, one of `sync-wall-3` and two of
the pre-flight beyond the detect scope's; `sync-wall-2`'s move its figures by
0.08 px whole-set and 0.01 px on the common set, and `sync-wall-3`'s, with
|`d_orth`| 0.296, carries the change: its key leaves and that run's figure on
the common set reads 5.56 instead of 6.77 px (whole-set 5.25 instead of
6.35), so the group reads 3.99, 4.48, 5.56, 4.10, R 1.39. Below 0.2 the
refusal reaches the TRACK population:

| τ | refused, sync runs 1 to 4 | refused, worker runs 1 to 4 (of 308, 322, 266, 303) | common | on common, runs 1 to 4 (windows) | R | range | change ratio, runs 1 to 4 |
|---|---|---|---|---|---|---|---|
| 0.15 | 23 26 29 24 | 1 0 1 0 | 132 | 4.01 (31) 3.55 (28) 4.09 (31) 4.12 (31) | 1.16 | 0.57 | 1.57 1.37 1.69 1.72 |
| 0.1 | 32 35 34 34 | 1 0 1 1 | 131 | 4.02 (31) 3.55 (28) 4.10 (31) 4.07 (31) | 1.16 | 0.56 | 1.57 1.37 1.68 1.75 |
| 0.05 | 43 40 40 44 | 2 3 3 1 | 127 | 4.09 (31) 3.60 (27) 4.16 (30) 4.12 (30) | 1.16 | 0.56 | 1.54 1.35 1.66 1.72 |
| 0.03 | 53 49 49 50 | 3 10 7 4 | 121 | 4.09 (28) 3.55 (27) 4.11 (29) 4.15 (29) | 1.17 | 0.61 | 1.54 1.37 1.68 1.71 |
| 0.02 | 61 59 54 57 | 8 15 10 8 | 118 | 3.89 (27) 3.47 (26) 3.87 (29) 3.82 (29) | 1.12 | 0.41 | 1.62 1.40 1.78 1.86 |
| 0.01 | 107 101 101 105 | 33 47 32 39 | 95 | 3.28 (24) 2.83 (24) 2.97 (23) 3.26 (23) | 1.16 | 0.45 | 1.92 1.72 2.33 2.18 |
| 0.005 | 235 208 227 255 | 150 164 143 150 | 46 | 1.91 (14) 2.08 (16) 1.81 (15) 1.82 (11) | 1.15 | 0.27 | 3.30 2.34 3.81 3.90 |

Here the four figures converge and the replicate ratio falls below the floor,
to 1.12 to 1.17, at the cost of 6% to 12% of each sync run's posed frames at
0.15 to 0.05 and 57% to 66% at 0.005, with the common set down to 46 keys
and 11 to 16 windows. This is the movement the plan's joint-claim rule names
when it says `jitterPx` "can be improved arbitrarily by refusing more
frames" ("#104: a joint claim, or none"): a number read beside its coverage
or not at all. The worker arms move the same way: at 0.05, `worker-wall-1`
reads 4.89 → 3.09 px (2 frames refused, its window `0:4` of four frames
dropping to three), `worker-wall-3` 4.12 → 3.07 px (3 frames refused, no
window dropping: the one TRACK frame it refuses at 0.1, with the same effect,
carries about 1 px of its figure inside its window), and `worker-wall-2` and
`-4` move by 0.05 px or less.

### The other relatives, whole-set

The pre-flight is in no group. Under E on DETECT frames its 8.78 px (36
windows) reads 7.77 (35) at τ = 2 and 5.90 (35) at 1, 5.41 (34) from 0.3 to
0.7, 5.43 to 5.50 (32) from 0.02 to 0.2, 5.11 (32) at 0.01 and 5.09 (29) at
0.005: the same four `:3` windows go at 0.2 and below, 5 to 6 frames each.
The worker runs are unchanged under the detect scope and are given above
under the other.

## Step 3: against what it is read

**The floor, and the curve against it**, kind E on DETECT frames; the floor
is R 1.46 and 2.24 px, the `none` row above. Per τ, the runs whose change
ratio exceeds 1.46, the runs whose change in px exceeds 2.24, and the group's
own ratio and range under the refusal:

| τ | change ratio above 1.46 | change above 2.24 px | the group's R, range under τ |
|---|---|---|---|
| 2 | `sync-wall-1` (1.56), `sync-wall-4` (1.74) | the same (+2.26, +3.01) | 1.67, 2.72 |
| 1 | the same (1.56, 1.74) | the same (+2.26, +3.01) | 1.67, 2.72 |
| 0.3 to 0.7 | the same (1.58, 1.74) | the same (+2.32, +3.01) | 1.70, 2.78 |
| 0.05 to 0.2 | the same (1.56 to 1.58, 1.71 to 1.74) | the same (+2.25 to +2.32, +2.94 to +3.01) | 1.69 to 1.70, 2.79 to 2.83 |
| 0.03 | the same (1.58, 1.71) | the same (+2.32, +2.95) | 1.73, 2.92 |
| 0.02 | the same (1.67, 1.85) | the same (+2.52, +3.27) | 1.75, 2.86 |
| 0.01 | the same (1.94, 2.15) | the same (+3.05, +3.80) | 1.94, 3.07 |
| 0.005 | the same (2.01, 2.20) | the same (+3.17, +3.87) | 2.00, 3.13 |
| 5 | none | none | 1.46, 2.24 |

`sync-wall-2` and `-3` exceed neither at any τ (ratios 1.07 to 1.16 and 1.00
to 1.10 at τ ≤ 2; at most +0.66 and +0.63 px). The group's own replicate ratio under
the refusal is 1.67 to 2.00 and its range 2.72 to 3.13 px at every τ from
0.005 to 2 (1.67 to 1.70 and 2.72 to 2.83 px above the floor on τ, where
alone it is claimed since 2026-10-19, "A floor on τ" below): the refusal
widens the floor, it does not narrow it, because it
takes the no-lock second out of the two runs whose residual sat there and
leaves `sync-wall-3`, whose residual is diffuse (#137's probe, the reviewer's
item 3: its top window at 25.1%, TRACK), at 6.77 px. For τ ≥ 1 the pair
E ≤ τ is |`d_scale`| ≤ τ alone, |`d_orth`| being a cosine; the curve's two
largest τ are S readings.

**A property of the floor, found by the reviewer's jackknife** (below, item
6): deleting one media key alone from the 141 the four runs share, for every
loop of every run, moves the group's ratio from 1.46 to 1.76 when the key is
10.876254 s (`sync-wall-2` 4.86 → 4.04, `sync-wall-3` 6.90 → 5.81; range
3.08 px) and to 1.47 when it is 7.986622 s (`sync-wall-3` → 5.73); deleting
any one of the four keys of the no-lock second's windows gives the τ = 2
figures, 4.05, 4.46, 6.77, 4.09, ratio 1.67, range 2.72 px. Whether an
amount can be attributed to a key is decided by the rule of 2026-10-18 (the
step protocol, "A jackknife on a window at the eligibility boundary cannot
attribute influence"), which turns on whether the deletions differ, and
they do: 137 distinct figure vectors over the 141 deletions (the script's
section (e), which prints each mover's range and the windows its frames sit
in). The four keys of the no-lock second tie, each deletion dropping the
same four-frame windows on the common set (`3:3` in run 1, `1:3` and `3:3`
in run 2, `1:3` in run 3, `1:3` in run 4), so there the windows at the
boundary carry the 1.67 and no key does, in the rule's form. The 10.876254 s
key is alone at 1.76: on the none common set its frames sit in windows of 6
to 14 frames in every loop of every run that poses it (`3:10` 10 → 9 in
run 1; `0:10` 13 → 12 and `1:10` 14 → 13 in run 2; `0:10` 6 → 5, `2:10`
13 → 12 and `3:10` 13 → 12 in run 3; `1:10` 10 → 9 and `2:10` 11 → 10 in
run 4),
none of them loses eligibility, and no other deletion gives its figures. The
attribution to that key stands: the amount is carried by that key's frames
in windows that stay eligible, in runs 2 and 3, an inference from the counts
the script prints, not a residual it reads. So the floor the curve is read
against has, under no refusal
at all, a jackknifed value: 1.76 and 3.08 px, the largest ratio any single
deletion gives and the range at that deletion. That is a property of the
replicate figure on this footage, not of the refusal, and it is recorded
beside the floor so that whoever reads the curve against 1.46 reads it
against that too: the curve is read against both values below and in
step 4.

**The desktop reference, marked as not transferring.** #137's comment
(passage 6) reports the draw's leverage over eight seeds on desktop replays,
where every frame is processed: on this clip, `jitterPx` 5.75 to 27.46 px
over seeds 1 to 8 of the "every frame, sync" arm, ratio 4.8, and 6.64 to
22.64 px, ratio 3.4, on the "device, scaled step, sync" arm;
`scripts/replay-clips.mjs --seed <n>` is how a seed is set. That figure is a
reference for the draw's contribution and nothing here is read against it:
it is whole-set, on a schedule that processes every frame, under a seed the
device cannot set. And item 8 of #104's probe is itself the record of a
calibration that did not transfer to these clips, the jitter clause's static
threshold against the replays' hand-held residual (step 0's second
correction); it bounds nothing here. The floor this curve is read against is
the one the registration names, 1.46, on the group's common media times,
reproduced above from the exports it came from.

### A floor on τ, and the curve re-read above it (2026-10-19)

**Why a floor.** A refusal criterion has two directions, and the curve
above tests one: that it fires. The other, that a right fit survives it, is
established above only at the loose end, where O alone refuses nothing at
τ ≥ 1 because no posed DETECT frame on these exports has |`d_orth`| above
0.985 (the S and O section). At the tight end the record holds one
measurement of this signal on a fit known to be right: the calibration
session of 2026-10-14, in its finding on four checks that could not
distinguish the condition they claim to detect, records "#90's sweep signal
for step 2, `d_scale` and `d_orth`, nonzero on correct fits of a view that
is not a plane homography for the camera (0.0084 and 0.031 on its exact
`H`)", and the plan's entry "#104's state, settled (report, 2026-10-15)"
draws from it that "a threshold derived on that view would be inflated; the
separation has to be shown per view". Both values sit inside the grid, whose
lower bound is 0.005. So the verdict as first written, "at every τ from
0.005 to 2", spanned thresholds at which, on the record's own measurement, a
correct fit of some view is refused (the maintainer's review of 2026-10-19,
the first thread). Threshold-insensitivity over that span was therefore not
evidence of robustness.

**The floor, derived.** Kind E refuses a frame when |`d_scale`| or
|`d_orth`| exceeds τ, so the fit the record measured, 0.0084 and 0.031, is
refused at every τ below 0.031 and passes at every τ at or above it. The
floor is **0.031** under E and under O alone, and 0.0084 under S alone, and
the claims below are made for τ above it, on (0.031, 2]. The record gives
the value to two figures; whether τ = 0.031 itself passes turns on the
third, which the record does not give, so the endpoint is left out; no grid
value lies there, and the curve is constant on [0.029050, 0.031410), so the
endpoint changes no figure (the script's re-reading starts its first stretch
at 0.031). The floor is derived from the one such measurement the record holds,
not chosen: it is one view's exact `H`, so it bounds from below where the
criterion is known to refuse a right fit and says nothing about where it is
known not to; a right fit of another view may read more. Above the floor the
must-not-fire direction is untested here; below it the criterion is known to
fire on a right fit, and this document claims nothing there. The other
derivation the brief allowed, the distribution of |`d_scale`| and |`d_orth`|
over the high-inlier posed frames of step 1, is not used: those are
hand-held frames with no ground truth, and a floor read from them would be
the proxy negative control the next paragraph records as ruled out. The
script carries the floor as `TAU_FLOOR`, with its source, and re-reads the
breakpoint sweep of the reviewer's item 2 above it; the grid is not
recomputed.

**The negative control, registered elsewhere.** No proxy negative control
is run on these exports, on the maintainer's ruling of 2026-10-19: there is
no ground truth on a hand-held clip, and a weak proxy would be read later as
a negative control that was performed. The control, a right fit known by
construction surviving the criterion at the τ it is given, belongs to #106's
synthetic half, where the plan places the pose steps' synthetic results
("#105 and #106: device claims withdrawn as unmeasurable on this instrument,
not refuted": "Their synthetic halves stand and are where their results
live"). It has not been performed here.

**The curve above the floor**, kind E on DETECT frames, re-read from the
tables above and from the breakpoint sweep (the script's section (a), its
"above the floor on τ" lines). The grid's values at or above the floor are
0.05 to 2, and 5:

- `sync-wall-1` and `sync-wall-4` move by 1.56 to 1.58 and 1.71 to 1.74, by
  +2.25 to +2.32 and +2.94 to +3.01 px, at every grid value from 0.05 to 2
  (step 3's table); at every τ in (0.031, 2], by the breakpoint sweep, by
  1.5528 to 1.5871 and 1.7064 to 1.7370, by +2.2467 to +2.3345 and +2.9382
  to +3.0115 px. `sync-wall-2` and `-3` by 1.0710 to 1.0896 (+0.32 to
  +0.40 px) and 0.9982 to 1.0198 (−0.01 to +0.13 px). At τ = 5 nothing
  moves.
- The group's own replicate ratio under the refusal reads 1.67 to 1.70, its
  range 2.72 to 2.83 px, at every grid value from 0.05 to 2.
- A run's own refusals at kept keys move no run by more than 0.0613 px at
  any τ in (0.031, 2] (`sync-wall-1`, on [0.197867, 0.199671)); the 0.1408 px
  of the reviewer's item 8 lies on [0.010982, 0.011617), below the floor.
- On every posed frame, the same from 0.3 up; at 0.2 the group reads R 1.39;
  at 0.15 to 0.05 all four runs move by 1.35 to 1.75 and the floor falls to
  1.16, at 6% to 12% of each sync run's posed frames.
- Withdrawn from the verdict's ranges, as lying below the floor on τ: the
  ratios 2.20, 2.15 and 1.85 of `sync-wall-4` and 2.01, 1.94 and 1.67 of
  `sync-wall-1` (τ = 0.005 to 0.02) with their changes in px (+3.27 to
  +3.87 and +2.52 to +3.17), the 1.16 of `sync-wall-2` (τ = 0.01) and its
  +0.66 px, the group's ratios above 1.70
  and ranges above 2.83 px, and, on every posed frame, the 1.12 to 1.17, the
  3.90, the 46-key intersection and the 57% to 66% coverage cost. They
  remain in the tables as computed; nothing is claimed of them.

**Against both values of the floor.** Against the floor the registration
names, 1.46 and 2.24 px, `sync-wall-1` and `sync-wall-4` exceed both at
every τ in (0.031, 2]: the "exceeds the floor" claim survives the floor on
τ in full for those two runs and for no other. Against the floor's
jackknifed value, 1.76 and 3.08 px ("A property of the floor" above), no run
exceeds either at any τ in (0.031, 2]: the largest ratio there is
`sync-wall-4`'s 1.7370 and the largest change its +3.0115 px. Every crossing
of the jackknifed value lies below the floor on τ: by ratio, `sync-wall-1`
and `-4` at 0.005 and 0.01 and `sync-wall-4` at 0.02; by range,
`sync-wall-4` at 0.005 to 0.02 and `sync-wall-1` at 0.005 (the script's
second step 3 block). So the alternative the review offered, restricting the
claim to the replicate that clears the jackknifed floor, leaves nothing
above the floor on τ, and the comparison is stated at both values instead:
yes against 1.46 and 2.24 px, no against 1.76 and 3.08 px. Which value a
ruling reads the curve against is the maintainer's, under the rule that a
ruling states the basis its figures are read on (the step protocol, the
second of the four rules of 2026-10-18); both are stated in step 4.

## The refutation attempt on the figure that decides step 4

The step protocol: a figure that gates a decision gets one independent
attempt at refutation before it is recorded, and what the attempt found is
recorded beside it, including when it found nothing. The deciding figure is
the first row of step 3: at every τ from 0.005 to 2 the figures of
`sync-wall-1` and `-4` on the group's common media times move by ratios
above 1.46 and by more than 2.24 px. (As first written. Since 2026-10-19 the
figure is claimed at every τ above the floor on τ, in (0.031, 2], step 3's
"A floor on τ"; the attempts below were mounted on the whole span, and what
they found holds on the part that is claimed, the breakpoint sweep's minima
of the reviewer's item 2 lying above the floor.) Two attempts: one built
into the script, one by a reviewer with no part in this document's
reasoning.

### In the script: the decomposition and the boundary flags

Built in as a refutation of the reading "the refusal changes the figure",
in the direction "the construction changes the figure": the fixed-set and
τ-keys-only readings of step 2, and the flag the script puts on every
common-set window that drops when it held exactly four frames. **What it
found:** at every τ from 0.05 to 2, every common-set window that drops in any
sync run is a four-frame window; at τ = 1 and 2 the drop of `3:3` in
`sync-wall-1` and of `1:3` in `sync-wall-4` is the only change to those runs'
pools on the common set, so it is the whole of 6.31 → 4.05 and 7.10 → 4.09;
the second source of movement, a run's own refusals at kept keys, is at most
0.0613 px at the grid's values (0.1408 px between them: the reviewer's
finding).
The figure stands as computed; its reading as the refusal's effect on a run
is weakened: it is the effect of a shared instant leaving the group's
intersection, read on windows at the eligibility boundary, where the rule of
2026-10-18 says a deletion cannot be attributed to any one frame (the step
protocol, "Four rules on the record's figures and their bases", the first).
What the script's own attempt could not say, and the reviewer's did, is
whether the amount belongs to the window or to the instant: see item 7
below.

### Independent: a reviewer's attempt

A second session, given the four sync exports, the frozen module, the
bundle's `intrinsics`, #104's definition of the signal, the construction of
the group's common media times and the figures above, but not this
document's reasoning, was asked to refute the figure or its reading by any
read-only route. It wrote its own `H` recovery (a null-vector solve, against
the probe's eight-equation one), its own signal and its own common-set
construction in scratch scripts (not committed; the module's `cornerJitter`
imported, and for one attempt its own regression cross-checked against it),
and reported ten attempts. Its figures are recorded as it gave them; **every
quantity it reported is also computed by the committed script**, in its last
section ("The reviewer's figures, recomputed"), and where the two differ, in
value or in form, the bracketed note after the item says so.

1. **Reproduction.** Every `runSummary.jitterPx` bit for bit; the `none`
   figures 6.3107, 4.8626, 6.9028, 7.0978 on 141 keys, ratio 1.4597; the
   figures at τ = 2, 0.5, 0.05 and 0.005 to two decimals, with their key
   counts and windows; the four runs' change ratios on those four τ. **The
   figure stands as a number.** [The script: the same, to the digits
   printed.] One count it raised: on the four τ it was given,
   `sync-wall-2`'s largest change ratio is 1.149, "1.15, not 1.16"; the 1.16
   in this document is the grid's τ = 0.01 (4.8626 ÷ 4.2014 = 1.157), which
   the reviewer's four τ did not include and whose fine-grid maximum, 1.157,
   it reports as rounding to 1.16. Not a disagreement about the exports.
   [The script: the run's largest change ratio over every breakpoint,
   1.1567 on [0.009308, 0.009443).]
2. **Exact breakpoints.** The figure is piecewise constant in τ and changes
   only at the E of some posed DETECT frame: it evaluated the figure at every
   such value in [0.005, 2]. Smallest change ratio over the whole interval:
   `sync-wall-1` 1.5528 (τ in [0.047096, 0.047351)), `sync-wall-4` 1.7064
   (τ in [0.050674, 0.052830)), both above 1.46 everywhere; `sync-wall-3`
   dips to 0.9982 on [0.027184, 0.031410); the four figures are constant on
   [0.795893, 2] at 4.047, 4.463, 6.769, 4.086 and on [0.239599, 0.795893)
   at 3.986, 4.463, 6.769, 4.086. **Finds nothing against the first
   statement of step 4.** [The script: 242 distinct E values at or above
   0.005, 239 at or below 2, against the reviewer's 280 and 240; the minima
   1.5528 and 1.7064 on the same intervals' starts, the second interval
   ending at the script's next breakpoint 0.052191; `sync-wall-3` 0.9982 on
   the same interval; the same two constant stretches, the first running to
   3.091111, where the intersection regains its 141 keys.]
3. **What leaves and who refuses it.** At τ = 2 one key, 3.411371 s,
   refused by `sync-wall-2` (three identical DETECT poses, loops 1 to 3, 8
   inliers, `d_scale` 3.09111, `d_orth` 0.46821, identical corners) and
   `sync-wall-3` (two identical poses, loops 0 and 1). The key 2.448161 s
   leaves for τ below 1.00586 (refused by runs 2, 3 and 4 at that E), so on
   [1, 1.00586) two keys leave, not one, with no change to the figures, since
   2.448 s sits in one-frame windows everywhere. The intersection returns to
   141 keys only at τ ≥ 3.09111. "Precision point, not a refutation." [The
   script: the same values at both instants in every run and loop,
   section (b), (c); and in its frames-per-window list there, the windows
   holding 2.448 s on the none common set, `0:2` and `1:2`, hold one frame
   each in every run that poses it.]
4. **"Refuse nothing in the common set themselves at τ ≥ 1."** True of the
   rebuilt set (every run's own refusals inside the intersection are zero
   for τ ≥ 0.795893). Against the 141-key set it holds from τ ≥ 1.21738:
   `sync-wall-4`'s own 3.411 s pose has E 1.21738 and its 2.448 s pose
   1.00586; `sync-wall-1`'s 3.411 s poses read 0.95600, 0.75220 and 0.35737.
   And for τ ≥ 1 the `d_orth` half of the pair is vacuous, |`d_orth`| being
   a cosine, so the grid's τ = 2 reading is S alone and passes a pose whose
   in-plane axes are 162° apart. "Precision point." [The script: the same
   E values; the cosine bound checked, the largest |`d_orth`| over every
   posed frame 0.98494.] Step 2's decomposition paragraph already gives
   run 4's own refusal at τ = 1; the τ at which it begins is now stated
   there too.
5. **The named windows.** On the 141-key set, `sync-wall-1`'s `3:3` and
   `sync-wall-4`'s `1:3` each hold exactly four posed frames, 3.411371,
   3.531773, 3.692308 and 3.852843 s, all four DETECT; so do `sync-wall-2`'s
   `1:3` and `3:3` and `sync-wall-3`'s `1:3`. The windows' RMS residual is
   52.20 px (run 1) and 63.17 px (run 4) against run figures of 6.3 and 7.1;
   the 3.411 s pose's deviation from the line through the other three is
   124.4 px (run 1) and 146.2 px (run 4); without it the window reads
   6.59 px and 22.72 px. The counterfactual that removes only those windows
   and keeps the 3.411 s frames elsewhere gives exactly 4.0470 and 4.0863; no
   other window's residual changes. The eligible-window sets at τ = 2, 0.5
   and 0.05 lose exactly `3:3`, `1:3` and `3:3`, `1:3`, `1:3` and gain
   nothing. **Confirms the mechanism.** [The script: the same four frames,
   the same RMS values, the same figures without the pose; the window-only
   counterfactual, the named windows removed whole and every other frame
   kept, 4.0470 and 4.0863 px on 31 windows; the deviation 88.0 and
   103.4 px, which is the RMS over the eight corner coordinates where the
   reviewer's is per corner, a factor of √2.]
6. **A single-key jackknife on the 141-key set.** Deleting any one of the
   four keys above alone gives the identical figure vector 4.047, 4.463,
   6.769, 4.086: under the frozen rule the τ = 2 figure is indifferent to
   which of the four leaves. Two other keys move a run by more than 5%:
   7.986622 s (run 3 by 1.205) and 10.876254 s (run 2 by 1.204, run 3 by
   1.188, the group's ratio to 1.763). "So the replicate floor 1.46 is itself
   one deleted media time away from 1.76." **Supports the frame-selection
   reading; shows the floor is a soft reference.** [The script: the same six
   keys and the same figures, section (e), which since 2026-10-19 also
   prints each deletion's range and the windows each key's frames sit in,
   read in step 3's "A property of the floor".]
7. **Eligibility relaxed to n ≥ 3** (its own regression, cross-checked
   identical to the module at n ≥ 4). `none`: 6.311, 4.910, 6.888, 7.108;
   τ = 2: 4.062, 4.517, 6.749, 4.385, change 1.554 (run 1) and 1.621 (run 4)
   with the named windows kept at three frames; τ = 0.5: 1.577 and 1.718.
   "The movement does not depend on the windows dropping: it is the one
   gross-outlier DETECT pose leaving the pooled residual. 'The figure moves
   by the window' is exact for the frozen rule but the eligibility rule is
   incidental; the reading's verdict (nothing got steadier) stands, its
   mechanism sentence is narrower than the data." [The script: the same
   figures to three decimals, its regression checked bit for bit against the
   module at n ≥ 4 on every set it reads.] **Reading weakened**, and the
   mechanism is restated in step 4 accordingly.
8. **The 0.06 px bound.** On the grid's values the largest |rebuilt figure −
   figure on the same set with membership alone| is 0.0611 px (run 1 at
   τ = 0.5), consistent with 0.06. Over every breakpoint it is 0.1408 px for
   `sync-wall-1` (τ in [0.010982, 0.013615)) and 0.1137 px for `sync-wall-4`
   ([0.017015, 0.017204)); runs 2 and 3 at most 0.053 and 0.048. **"At any τ"
   is false; the bound is 0.14 px.** Conclusion unaffected, the movements
   being 2.2 to 3.9 px. [The script: 0.1408, 0.1137, 0.0529 and 0.0476 px
   over every breakpoint, the first on [0.010982, 0.011617), the script's
   next breakpoint; at the grid's values 0.0613, 0.0520, 0.0217 and
   0.0546 px, the first at τ = 0.2 to 0.7, against the reviewer's 0.0611 at
   0.5, the same quantity in two constructions; the statement is corrected
   in step 2 and step 4.]
9. **Other constructions.** Per-loop keys (`loop:mediaKey`): 45 common
   pairs and two eligible windows per run, "degenerate, not usable".
   Pairwise on counted frames, as `compareExports` reads two runs: pair
   (1, 4) reads 6.114 and 6.761 under `none` and the same at τ = 2 (neither
   refuses a frame the other posed), 1.518 and 1.629 at 0.5; pair (1, 2)
   16.654 and 4.810, run 1 to 4.077 at τ = 2; the pairwise `none` ratios run
   1.11 (1, 4) to 3.46 (1, 2). Each run's own whole-set figure: run 1 16.360
   at τ = 2 and 4.198 at 0.5, run 4 10.397 and 4.208, run 2 88.68, 67.30 and
   4.79. "All consistent with: the movement needs a refusing partner in the
   group at τ ≥ 1.217, and is the runs' own at τ ≤ 0.5." [The script: the
   per-loop-key construction, 45 common keys under `none` and two eligible
   windows per run, 4.57, 4.84, 3.93 and 4.57 px, unchanged at τ = 2, 0.5
   and 0.05 on 44, 44 and 43 keys; the six pairs under `none`, 2, 0.5 and
   0.05, section (h), where pair (1, 2) at τ = 2 reads 4.085 against the
   reviewer's 4.077, the one figure of the report the script does not
   reproduce to the digit, each side's pairwise construction being its own;
   each run's own figures in step 2's whole-set columns.]
10. **S alone, O alone, TRACK too, and other K.** S alone at τ = 2 identical
    to the record; O alone refuses nothing at τ ≥ 1 and at 0.5 reproduces the
    τ = 2 figures (2.448 s and 3.411 s leaving through `d_orth` −0.949 and
    0.924). With TRACK frames refused too: identical at τ ≥ 0.5 (no TRACK
    frame has E above 0.5 in any run); at 0.05, 3 to 5 TRACK frames per run
    leave, 14 keys, figures 4.090, 3.600, 4.164, 4.122, ratio 1.157: "runs 2
    and 3's excess over 1 and 4 at τ ≤ 0.5 sits in a handful of TRACK poses
    with E in (0.05, 0.5]". `K` at 40°, 50°, 70° and 90° of horizontal field
    of view: the same key leaves at τ = 2 and the same figures; at 120° the
    3.411 s pose's E in runs 2 and 3 is 1.33 and nothing leaves at τ = 2;
    `K` at 1280 × 720 with the corners scaled by 8/3: identical. Run 4's own
    threshold for its 3.411 s pose moves from 1.26 (40°) to 0.99 (120°), run
    1's from 0.98 to 0.83. "Not a refutation." [The script: all of it,
    sections (j) and the all-scope curve; the 120° figure 1.327. One
    attribution in the reviewer's sentence is not the script's: the two
    `d_orth` values it gives, −0.949 and 0.924, are both the 2.448 s pose's
    (−0.94888 and +0.92386, section (b), (c)); under O ≤ 0.5 the 3.411 s key
    leaves through `sync-wall-1`'s −0.95600 and `sync-wall-4`'s −0.95289,
    runs 2 and 3 reading 0.46821 there and passing.]

**Its verdict, recorded as given:** "Not refuted, reading weakened on 3
counts: (1) 'own refusals … move no run by more than 0.06 px at any tau'
holds on the grid but fails between its points — 0.14 px (sync-wall-1) and
0.11 px (sync-wall-4); (2) sync-wall-2's change-ratio upper bound is 1.15 on
the grid, not 1.16; (3) 'the figure moves by the window' / 'at tau ≥ 1 one
media time' are narrower than the data: the movement survives an n ≥ 3 rule
(1.554 / 1.621) because the 3.411 s pose is the window's 124/146 px outlier
in a window of four DETECT poses, common is 139 (two keys) on [1, 1.00586),
and sync-wall-4 refuses its own 3.411 s pose (E 1.21738) below 1.21738. The
figure itself, the mechanism and the 'frame selection' verdict reproduce
exactly."

**What this probe takes from it.** The first count corrects a sentence in
step 2 and a fact in step 4, which now carry both bounds; the second is the
grid difference recorded under item 1; the third restates the mechanism in
step 4: the amount is one gross-outlier detection pose per run at 3.411 s,
which under the frozen rule takes its four-frame window with it and under a
relaxed rule moves the figure by nearly as much on its own. Item 6's finding,
that one deleted media time takes the floor from 1.46 to 1.76, is recorded
in step 3 as a property of the floor, and since 2026-10-19 the curve is read
against that value too.

## Step 4: the answer, in the form the plan asked for

**Is there a candidate threshold at which the predicted change exceeds the
replicate floor?** In two parts, since the maintainer's review of
2026-10-19; read above the floor on τ derived in step 3 (0.031, below which
nothing is claimed) and at both values of the replicate floor.

**First: the signal clears the floor the registration names, in a post-hoc
reading the plan does not register.** Read on the group's common media
times, kind E on DETECT frames, at every grid value from 0.05 to 2 and at
every τ in (0.031, 2] by the breakpoint sweep, the figures of `sync-wall-1`
and `sync-wall-4` move by ratios of 1.55 to 1.59 and 1.71 to 1.74 and by
2.25 to 2.33 and 2.94 to 3.01 px, above the floor's 1.46 and 2.24 px;
`sync-wall-2` and `-3` move by 1.07 to 1.09 and 1.00 to 1.02 and by at most
0.40 px, below it; at τ = 5 nothing moves. Against the floor's jackknifed
value, 1.76 and 3.08 px (step 3, "A property of the floor"), no run clears
either at any τ above the floor on τ; every crossing of that value,
`sync-wall-4` at 0.005 to 0.02 and `sync-wall-1` at 0.005 and 0.01, lies
below it. S alone gives the same; O alone the same from 0.7 down and nothing
at or above 1. On every posed frame the same holds from 0.3 up; at 0.2 the
floor reads 1.39, and at 0.15 to 0.05 all four runs move by 1.35 to 1.75
and the floor falls to 1.16, with the coverage cost stated beside it. The
reading is each run against itself, under `none` and under τ, on the frames
each reading keeps; the maintainer's comment of 2026-10-19 on #153 calls it
a post-hoc whole-set reading, and it is carried by one instant (item 2
below). The term names the basis, two readings that are not on common
frames, and not step 2's whole-set columns: the figures compared are the
group's common-set figures, rebuilt per τ.

**Second: the comparison round 1 registers does not read it.** The plan
binds that comparison and closes it: "Every comparison of `jitterPx` between
arms that run different pipelines: a treatment against its baseline. Which
of an arm's exports are paired is registered with the block's shape, in the
run order. That each comparison is read on common media times is not open"
([`README.md`](./README.md), the common-media-times rule, "Where it binds").
A refusal's whole effect is to remove frames from its own arm, and a removed
frame's media time is not in the two arms' intersection, so the registered
comparison reads the frames where the treatment did nothing: on a
selection-only surrogate the frames at the keys that stay are the same
frames with the same corners, and the common-set difference is zero by
construction, as #104's probe's item 9 says of its own data ("On this
probe's own data the measurement is zero by construction (item 5), which is
why it needs two real arms"). The number that comparison would read is not
predicted here at all. This is a different gap from the one the rule records
beside itself, "What it does not cover, recorded 2026-10-18: a single
dominant frame that both arms posed": that one is a dominant frame surviving
in the common set; this one is a dominant frame leaving it because the
treatment removed it. The addendum of 2026-10-18 does not cover it. The
remedy, reading the whole-set difference beside the common-set difference as
the decomposition registered for #137 already prescribes, is a ruling and a
dated addendum for a later registration PR: the rule is not changed here, no
change to it is proposed, and no entry of `README.md` or `step-protocol.md`
is edited.

**As a feasibility verdict:** the signal clears the floor the registration
names, above the floor on τ, in two replicates of four, and does not clear
the floor's jackknifed value; the registered measurement does not read it.

**What the verdict does not establish.**

1. **It is an exclusion from the metric, not a gate in the pipeline**
   (passage 8). A refused fit leaves the tracker without a lock at that
   frame, and every later frame differs: which frames detect, which track,
   which pose at all, and so which media times two arms then share. No
   post-hoc refusal simulates that, so the curve is a bound on what the
   treatment could show through selection on these exports, not a
   prediction of what it will show.
2. **The movement is one instant of the no-lock second leaving the group's
   intersection: a gross-outlier detection pose, one per run.** Every key
   that leaves at τ ≥ 0.3 is a detection of the no-lock second, 2.4 to
   3.9 s. In runs 1 and 4 the instant 3.411 s is a DETECT pose of 8 inliers
   whose corners sit 88 and 103 px (RMS over the eight coordinates) off the
   line through the three other DETECT poses of its window on the common
   set; the window reads 52 and 63 px with it and 6.6 and 22.7 px without
   it. Under the frozen rule the window holds exactly four frames, so the
   pose's leaving drops the window and the four deletions tie (the
   reviewer's item 6: a window at the boundary carries the amount, no frame
   does); under a relaxed rule, n ≥ 3, the window stays and the figures
   move nearly as much, 1.554 and 1.621 at τ = 2 (item 7). So the amount is
   the pose's, and the frozen rule decides only whether its window goes
   with it. At τ = 2 the two runs refuse nothing there themselves; what
   removes the instant is runs 2 and 3, where the same instant's pose reads
   3.09. Selection in full (the probe's item 5), and of a kind the record
   has named for this clip: #137's probe found `sync-wall-2`'s whole-set
   figure carried by one 4-inlier detection (its Verdict's first statement)
   and the wall group's remaining spread after `X4` sitting "in one no-lock
   second of detection poses at 8 to 21 inliers in two runs of four, and in
   a diffuse residual in the other two" (its jackknife section); here one
   pose of that second carries a common-set figure in those same two runs.
3. **The comparison round 1 registers reads none of this**: the verdict's
   second part above, where it was moved on 2026-10-19 because it inverts
   the feasibility answer rather than qualifying it. #104's claim is the
   treatment arm against its baseline arm on **their** common media times
   (the plan, "#104: a joint claim, or none"). What the curve bounds is the
   part of a whole-set or a group common-set figure that a refusal can move
   by selection; what it cannot reach is the steadiness part, whose sign the
   plan records as unknown (passage 7's entry).
4. **Posed against the plan's own statement.** `jitterPx` "measures
   steadiness only where the target stays in view and every pose is right …
   on a hand-held clip it computes but does not measure that" (passage 7).
   What moves in the curve is the metric's eligibility, which windows hold
   four posed frames at the keys the four runs share, and not the steadiness
   of any pose: the frames that remain keep their recorded corners, and the
   `none` figures of runs 1 and 4 on the common set, 6.31 and 7.10 px, fall
   to 4.05 and 4.09 when one key leaves and one four-frame window drops in
   each, the common-set form of what #137's probe found whole-set on
   `sync-wall-1` (its window `1:3`, four deletions tied at −8.38 px). A change
   that exceeds the floor on such a figure says the figure is fragile at that
   second, which the record knew; it does not say the refusal steadies
   anything.

**What stands, stated as numbers**, above the floor on τ. The curve, with
its derivation, and three facts the registration can rest on: that the
group's replicate floor on its common media times reads 1.67 to 1.70 (2.72
to 2.83 px), not 1.46, at every grid value from 0.05 to 2, and has a
jackknifed value of 1.76 and 3.08 px under no refusal at all, carried by one
key; that under the detect scope no run's figure on those media times moves
by more than 0.0613 px at any τ in (0.031, 2] for any reason other than a
key leaving the intersection; and that the floor falls below 1.46 only when
the refusal reaches TRACK frames, to 1.39 at τ = 0.2, where three TRACK
frames of the group are refused and the one in `sync-wall-3` carries the
change, and to 1.16 at 0.15 to 0.05, where 6% to 12% of each sync run's
posed frames are. The figures below the floor on τ stay in the tables as
computed (the floor to 2.00 and 3.13 px, the own-refusal bound 0.1408 px,
the all-frames floor 1.12 to 1.17 at up to 66% of the frames) and are
claimed of nothing. None of these is a threshold and none is a prediction of
round 1's result.

## What this probe does not decide

- **A threshold for #104**, in either scope: its source is the sweep and the
  treatment's own measurement (step 0's first correction), and nothing on the
  grid is a candidate. One fact about the grid's form is recorded for
  whoever derives one: above 1 the pair E ≤ τ is |`d_scale`| alone.
- **Round 1's effect-size statement.** The plan registers it as the
  maintainer's; this is the derivation it was registered to be read from.
- **Which fits the signal is applied to.** Both scopes are measured because
  #104's body names neither; the choice is the registration's.
- **The treatment's behaviour after a refusal** (the probe's item 7), which
  no reading of these exports reaches.
- **The cause of the recurring signal values** across runs (step 1), a
  conjecture labelled as one.
- **The negative control at the tight end of τ**: whether a right fit
  survives the criterion at any τ above the floor of 0.031. Not performed
  here, on the maintainer's ruling of 2026-10-19 that no proxy is run on
  these exports (step 3, "A floor on τ"); it belongs to #106's synthetic
  half, where a right fit is known by construction.

## Revised after the independent read

Before the commit, a session with no part in this document's writing audited
it against the brief, the sources at `1f28fce` and the script's output. It
confirmed every cell of the tables, the floor's reproduction, the eight
passages and the script's checks, and made twenty findings, three of which
changed a stated figure and none a table value or the verdict. All are
applied; in the order of severity it gave them:

1. Four quantities in the reviewer's section and two instants named in
   step 1 had no committed derivation. The script now computes the
   per-loop-key construction, the window-only counterfactual, each run's
   largest change ratio over the breakpoints, the frames per window on the
   none common set and the frames at 1.846 s, and the bracketed notes cite
   them.
2. No check had been recorded firing. Ten scratch copies now exercise them,
   recorded in the methods section; the auditor had exercised four the same
   way.
3. "The three places where the two differ" was a tally, and wrong (five
   differences in four items); it is now a pointer to the bracketed notes.
4. "Every one of them is in the fourth second or the one before it" put
   4.334 s, a fifth-second frame, in the fourth; the sentence now excepts it.
5. "Neither alone changes which runs cross the floor" was false for O at
   τ ≥ 1, where O refuses nothing; the sentence now says where it holds.
6. "One TRACK frame" at τ = 0.2 under the all scope: the scope refuses three
   in the group, two in `sync-wall-2` and one in `sync-wall-3`, and two in
   the pre-flight; the one in `sync-wall-3` carries the change. Corrected in
   two places.
7. The 0.06 px bound was stated more tightly than measured, 0.0611 by the
   reviewer and 0.0613 by the script at the grid's values; three places now
   state 0.0613 px there and 0.1408 px at any τ, and the script prints the
   four-decimal maxima.
8. Step 4's item 2 cited #137's Verdict's second statement for a claim about
   "the sync arm's whole-set figures on this clip" that the statement does
   not support; it now cites that Verdict's first statement and the probe's
   jackknife section, with the qualification the quotation had dropped,
   "and in a diffuse residual in the other two", restored there and in
   step 1.
9. One quotation was a paraphrase inside quotation marks; it is now
   verbatim ("it neither replaces nor extends the clause's block gate").
10. "Imports `intrinsics` from it, nothing else" omitted `decode`; corrected
    in the document and in the script's header.
11. The reviewer's item 10 attributed to two instants two `d_orth` values
    that are one instant's; the bracketed note says so.
12. Four understatements and one unreadable range: the windows that drop at
    0.01 and 0.005 include four- and five-frame ones; S's ratios are within
    0.01 of E's, not "the same to two digits"; the 1.17 of "1.12 to 1.17"
    sat at a τ the all-scope table omitted, and its row is added; "the other
    windows held one to three frames" now points at the script's list.
13. The S and O kinds and the all-frames scope are now marked beyond the
    brief; "the probe's two functions" are three function definitions; and
    the script refuses a manifest without a commit, a clean tree or a bundle
    hash instead of printing a placeholder.

Nothing was re-run on any device or on the bench page; the exports are as
they were. The script's output before its last section is unchanged by any
of this: checked with `diff` against the output before the section existed.

## Revised after the maintainer's review (2026-10-19)

The maintainer reviewed `8879509` on 2026-10-19: a comment of three
findings on #153, and two review threads answering an automated reviewer's
two findings on the script, the first rejected on its premise with one item
taken (the negative control), the second taken (the hashes). The brief for
this revision named the branch head `8879509` and `dev` at `1f28fce`; when
it was applied `origin/dev` was `f718c9f`, the merge of #152, which touches
only `examples/test/detection-worker-core.test.mjs`, and the branch was not
rebased. The five record passages the brief rests on read identically at
`1f28fce`, `f718c9f` and `8879509`: the common-media-times rule's "Where it
binds" and its "What it does not cover" of 2026-10-18 in `README.md`, the
calibration session's finding on four checks, and the step protocol's
"A jackknife on a window at the eligibility boundary cannot attribute
influence" and "A ruling states the basis its figures are read on". What
changed, in the brief's order:

1. **A floor on τ** (the first thread, which the comment's first finding
   also rests on). Derived from the calibration session's measurement of
   the signal on a right fit, 0.031 under E; the grid re-read above it, not
   recomputed; the negative control registered to #106's synthetic half and
   stated as not performed; nothing claimed below the floor (step 3, "A
   floor on τ"). The brief's stop condition, the floor removing the
   "exceeds the floor" claim across the whole remaining range, did not
   fire against the floor the registration names: the claim holds at every
   τ in (0.031, 2] for `sync-wall-1` and `-4`. Against the floor's
   jackknifed value it never held above the floor on τ, which the next two
   items record and leave to the maintainer's ruling.
2. **The verdict's basis** (the first finding). Moved from "What the verdict
   does not establish", item 3, into the verdict as its second part, citing
   the rule's "is not open", and distinguished from the gap the addendum of
   2026-10-18 records. No rule is changed or proposed; `README.md` and
   `step-protocol.md` are untouched; the remedy is named as a later
   registration PR's.
3. **The floor's two values** (the second finding). The comparison is
   stated at both, 1.46 and 2.24 px and 1.76 and 3.08 px, in step 3 and in
   step 4. Above the floor on τ no replicate clears the second, so the
   restriction the finding offered as the alternative would leave nothing;
   the replicates that cleared it in the verdict as first written,
   `sync-wall-4` at 2.20 and 2.15 and `sync-wall-1` at 2.01 and 1.94, are
   the grid's τ = 0.005 and 0.01, below the floor on τ.
4. **The jackknife's wording** (the third finding). The per-deletion values
   are the committed script's, not only the refutation session's, and they
   differ: 137 distinct figure vectors over the 141 deletions. The four keys
   of the no-lock second tie and drop the same windows, so the windows at
   the boundary carry the 1.67 and the wording takes the rule's form; the
   10.876254 s key is alone at 1.76, its frames in windows of 6 to 14 that
   drop nothing, so the attribution to it stands and says so (step 3, "A
   property of the floor"). The script's section (e) now prints each
   mover's range and windows.
5. **The manifest's hashes** (the second thread). The script hashes the
   bundle and the metrics module before importing either and refuses a
   mismatch with the manifest's entry; the metrics module's hash is printed
   in the provenance line, and compared only where the manifest carries an
   entry for it. Both matched when run: bundle `d568c8edca35…`, module
   `47fedde90d48…`. The brief's stop condition, a recorded hash not
   matching the bytes, did not fire. Exercised on three scratch copies
   outside the repository, each pinned to this directory and reading a
   scratch copy of the manifest with one change: the bundle's hash with its
   first character altered, exit 1, nothing on stdout, stderr naming both
   hashes; the module's `served` hash altered the same way, exit 1, nothing
   on stdout, stderr naming both hashes and the path; the module's `served`
   entry removed, exit 0, the committed script's output but for the
   provenance line, which then reads "no manifest entry for it: hashed
   here" after the hash. An unmodified copy pinned the same way and reading
   the real manifest exits 0 with the committed script's output byte for
   byte. The copies and the scratch manifests were deleted;
   `examples/dist/` was not touched.
6. **The script's output and digest.** Before this revision: 111,832 bytes,
   SHA-256 `3ec28f1c…`; the script `8117ca96…`. After: 115,956 bytes,
   SHA-256 `29833860…`; the script `d9839b0d…`. Two runs of the revised
   script give byte-identical output. Of the earlier output's lines, one
   changed in content, the provenance line, which now names the metrics
   module by its repository path and hash rather than by an absolute path,
   and the bundle's hash as computed rather than as the manifest states it;
   the seven lines of section (e), its heading and the six movers, are
   extended, each keeping its earlier text as a prefix with the deletion's
   range and windows appended; every other earlier line is unchanged and in
   its place, and the rest of the diff against the earlier output is
   additions: the curve against the floor's jackknifed value per τ, the
   breakpoint sweep re-read above the floor on τ, and the jackknifed value's
   line. No table value and no figure of the curve moved.
7. **The test suite**, `npm test` at the revised tree: `cv-backend-spec`
   27 passed, `cv-backend-jsfeatnext` 33, `nft-tracker` 740 passed and 1
   skipped, `examples/test/` 396 passed and 1 failed. The failure is
   `examples/test/provenance.test.mjs`, "hashes the files on disk, the
   bundle and jsfeat-next's included (rebuild after an edit)", timing out at
   Vitest's 5 s: the
   pre-existing failure reported on #136, which is why nothing had verified
   the manifest before the probe trusted it, and which the script's own
   hash checks now stand in for on this document's inputs. `npm run
   typecheck` passes.
8. **An independent read of the revision**, before its commit, by a
   session with no part in it, against the brief, the script's output and
   the sources. It confirmed every number of the new text, the five
   quotations, the hash checks' placement and behaviour on its own scratch
   copies, the determinism run, the digests and the scope, and made eight
   findings, none changing a figure or the verdict, seven applied here: a
   diff statement that called section (e)'s extended lines unchanged; the
   refutation section's deciding figure and one sentence of step 3 still
   spanning the whole grid, now carrying a dated qualifier; "the replicate
   that cleared" the jackknifed value being two; the interval above the
   floor closed at an endpoint this text calls undecided, now open here and
   in the script's label, which is why item 6's digests are the third pair
   taken; the failing test's name without its parenthetical; the term
   "whole-set reading" given its half-sentence; and "its frames' own
   residual" named as the inference it is. The eighth, "6% to 12%" where
   the counts give 6.1% to 11.4%, is text from before the review and is
   left.

Nothing was re-run on any device or on the bench page; the exports are as
they were; no issue was opened, edited or closed.

## Constraints kept

Read-only on committed exports; no run on any device, on the bench page or
by replay; `package.json`, the lockfile, the tsconfigs, the target, the
clips and `fixtures/nft-target/` untouched; no export edited or deleted;
`docs/benchmarks/README.md` and `step-protocol.md` unchanged; no issue
opened, edited, closed or commented on. The two files are this document and
its script, on `docs/104-stage1-effect-size`; the bundle was rebuilt at
`1f28fce` in `examples/dist/`, which git ignores, and was not rebuilt for
the revision of 2026-10-19, whose script checks its hashes.
