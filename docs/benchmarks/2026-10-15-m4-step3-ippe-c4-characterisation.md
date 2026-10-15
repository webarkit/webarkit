# M4 step 3 (#105): the C4 failure characterised, before round 1

A development measurement on the desktop, made on 2026-10-15 at the
maintainer's request after criterion C4 of
[the acceptance criteria](./2026-10-15-m4-step3-ippe-acceptance.md) failed.
Headless, no provenance, not campaign data, not reportable as a round. Its
purpose is to decide which of two diagnoses the failure has, since each has a
different remedy, and to give #107 the numbers its conditional adoption rule
and its refusal threshold are stated from. The source of every figure is
`packages/nft-tracker/test/pose/c4_characterisation.test.ts` (items 1 and 2),
which prints them, and `packages/nft-tracker/scripts/ambiguous-rate.mjs`
(items 3 and 4). RANSAC is unseeded through the contract, so the clips'
figures move by a frame or two between runs; the renders' do not.

**The maintainer's two diagnoses, and the verdict.**
- *A selection failure:* the estimator produced a better candidate and the
  selector rejected it. Remedy: the selection rule.
- *A genuine degeneracy:* the chosen candidate was the better of the two and
  still lost to the closed form. Remedy: a declared guard near
  fronto-parallel, part of the treatment's definition.

**It is the second.** On all 7 failing renders the rejected candidate is 6.4
to 9.8 px from the truth, against 0.37 to 0.46 px for the selected one and
0.11 to 0.14 px for the closed form (item 1). The selector kept the better
candidate every time; IPPE's better candidate is still three times farther
from the truth than the closed form there. **The selector is not changed.**

## Item 1: the 7 renders over C4's bound

Fronto-parallel views (tilt 0°), the shipped 48 patches, one tracking step
from the exact pose on a render with noise σ = 2, one blur pass, gain 0.9,
bias 10. 12 such fits; 7 over the bound `e(selected) ≤ e(closed form) + r`:

| roll | shift (px) | seed | ambiguous | e(selected) | e(rejected candidate) | e(closed form) | fit residual r |
|---|---|---|---|---|---|---|---|
| 0° | (0, 0) | 1 | no | 0.372 | 6.665 | 0.124 | 0.205 |
| 0° | (0, 0) | 2 | no | 0.391 | 6.697 | 0.116 | 0.200 |
| 0° | (0, 0) | 3 | no | 0.442 | 6.487 | 0.107 | 0.236 |
| 0° | (30, −20) | 2 | no | 0.370 | 9.206 | 0.135 | 0.224 |
| 0° | (30, −20) | 3 | no | 0.417 | 9.247 | 0.141 | 0.233 |
| 15° | (0, 0) | 3 | no | 0.365 | 6.422 | 0.113 | 0.237 |
| 15° | (30, −20) | 2 | no | 0.460 | 9.793 | 0.111 | 0.238 |

All errors in frame px, RMS over the target's 5 × 5 grid (the criteria's
§2). No frame was ambiguous: the two candidates differ by 3 to 4 px in RMS
over the correspondences, so rule (c) cannot reach this case. The other 5 of
the 12 are under the bound by 0.004 to 0.13 px, not comfortably: the
fronto-parallel case fails on about half of its fits, and the 7 are the half
that landed over.

## Item 2: the tilt grid, and where IPPE starts to beat the closed form

**What S2 rendered.** The registered set S2 has tilt steps of 0°, 10°, 20°,
30°, 40° and 50°: 12 fits at 0° (one orientation × 2 rolls × 2 shifts × 3
seeds) and 48 at each other step (× 4 azimuths). "From 10° on" in the
addendum is therefore **the first grid point above 0°, not a measured
crossover.** The addendum's sentence stands as written, and this item
supplies the measurement it lacked.

**The finer grid.** Tilt 0°, 1°, 2°, 3°, 4°, 5°, 7°, 10° and 15°, the same
construction (3 seeds × 2 rolls × 2 shifts, × 4 azimuths above 0°), 444 fits:

| tilt | fits | over C4's bound | median e(selected) | median e(closed form) | selected closer than the closed form |
|---|---|---|---|---|---|
| 0° | 12 | 7 | 0.368 | 0.115 | 0 of 12 |
| 1° | 48 | 26 | 0.353 | 0.114 | 1 of 48 |
| 2° | 48 | 25 | 0.366 | 0.112 | 1 of 48 |
| 3° | 48 | 21 | 0.315 | 0.115 | 1 of 48 |
| 4° | 48 | 18 | 0.284 | 0.116 | 5 of 48 |
| 5° | 48 | 18 | 0.228 | 0.111 | 12 of 48 |
| 7° | 48 | 8 | 0.178 | 0.110 | 13 of 48 |
| 10° | 48 | 0 | 0.101 | 0.118 | 27 of 48 |
| 15° | 48 | 0 | 0.049 | 0.114 | 43 of 48 |

Read from the table, not from the grid: the closed form's error is flat at
0.11 to 0.12 px whatever the tilt; IPPE's falls from 0.37 px at 0° through
0.18 px at 7° to 0.10 px at 10° and 0.05 px at 15°. **The medians cross
between 7° and 10°; the last fit over C4's bound is at 7°, and at 10° none of
48 is over.** The band where IPPE loses to the closed form is therefore
tilts below about 8°, and inside it IPPE loses on roughly half the fits (26
of 48 at 1°, 18 of 48 at 5°), not on 7 of 252: that figure was the synthetic
grid's, with one twelfth of its fits in the band.

Mechanism, as the addendum read it: IPPE's rotation comes from the
homography's Jacobian at the correspondences' centroid, where a plane's tilt
enters at second order, so near fronto-parallel the fit's noise becomes tilt
through a square root; the closed form reads tilt at first order from the
perspective row of the whole `H`. The table is that mechanism measured.

## Item 3: how much of the campaign's clips is in the band

The oracle's pose on every posed frame of each bundled clip, headless (the
criteria's §7: the page's default box fitted as `fitSize` fits it, the page's
Rec. 601 weights, the tracker's defaults, the shipped target, one pass), and
its tilt, the angle between the plane's normal and the optical axis, from the
closed form's `R[2][2]`:

| clip | processing | posed frames | tilt p10 / p50 / p90 | 0–2° | 2–5° | 5–10° | 10–20° | 20–40° | 40°+ |
|---|---|---|---|---|---|---|---|---|---|
| `pinball-static.mp4` | 203 × 360 | 366 | 2.9 / 2.9 / 2.9 | 0 | 366 | 0 | 0 | 0 | 0 |
| `pinball-bench-table.mp4` | 203 × 360 | 261 | 3.0 / 9.5 / 80.7 | 0 | 62 | 143 | 4 | 6 | 46 |
| `pinball-bench.mp4` | 480 × 270 | 268 | 9.1 / 17.4 / 89.6 | 0 | 0 | 54 | 95 | 62 | 57 |

- **The static clip sits entirely in the band**, at 2.9° on every frame: the
  configuration where IPPE loses to the closed form on about half of the
  fits (item 2, 2° to 3°). It is also the clip the jitter clause reads
  steadiness on.
- **The table clip is mostly in the band:** 205 of 261 posed frames below
  10°, 62 of them below 5°.
- **The wall clip is mostly out of it:** 54 of 268 below 10°, none below 5°.
- The 40°+ bands (46 and 57 frames) with p90 at 81° and 90° are not
  plausible tilts of a tracked target and are read as frames whose `H` is
  poor, the same frames on which the depth rule rejected candidates (37 and
  22 rejections) and the detection re-ran; they are reported as measured and
  not interpreted further here.

So 7 of 252 does not transfer, and in the direction the maintainer suspected:
on the static clip it understates the problem by a wide margin, and on the
table clip by a large one.

**What the campaign can and cannot see of it.** `jitterPx` and `spreadPx`
are computed from the target's corners under each frame's `H`
(`frameRecord`'s `corners`, `reprojectCorners(result.H, …)`), not from the
pose. The treatment changes the pose and leaves `H` as it was (C9), so the
jitter clause cannot see IPPE at all, in either direction. What IPPE changes
is the pose the application renders with, and that is read only by the
correctness half, on synthetic ground truth. #107's adoption rule has to say
which half it adopts on.

## Item 4: the fallback rate per clip

Same run. One per-run counter, `NftTracker.fallbackFrames`, every frame
whose pose is not IPPE's own estimate; its reasons from each frame's
`poseSelection.outcome`:

| clip | posed | fallbacks | rate | of which ambiguous | of which both candidates behind the camera |
|---|---|---|---|---|---|
| `pinball-static.mp4` | 366 | 0 | 0 | 0 | 0 |
| `pinball-bench-table.mp4` | 261 | 20 | 7.7% | 8 | 12 |
| `pinball-bench.mp4` | 268 | 23 | 8.6% | 15 | 8 |

Every ambiguous frame on every clip was a DETECT frame, where the margin is
read with `σ = 4 px` (the RANSAC threshold) over the inliers; no TRACK frame
was ambiguous. Two earlier runs of the same script (before the counter was
unified) gave 24 and 23 fallbacks on the table clip and 19 and 18 on the wall
clip, 0 on the static clip: the run-to-run movement is a few frames.

## What this measurement implies, for the maintainer to rule on

1. The remedy is a **guard near fronto-parallel**, not a change to the
   selection rule. Item 2 gives the band: IPPE loses below about 8° of tilt
   and wins from 10° on; a guard that hands frames in the band to the closed
   form would make the static clip, and most of the table clip, run on the
   control's pose. Whether that is still "IPPE in place of the closed form"
   is the question #105's adoption has to answer; the guard's threshold, if
   there is one, is to be derived from item 2's table and registered in #107
   as part of the treatment's definition.
2. The counter already covers a guard: a guarded frame is a frame whose pose
   is not IPPE's estimate, so it is a fallback, and the per-run count bounds
   the mixture. Item 4's rates without a guard are 0 to 8.6%; with a guard at
   8° they would be about 100% on the static clip and about 80% on the table
   clip, by item 3's bands.
3. The refusal threshold on the counter is the maintainer's number. Item 4
   gives the rates the current rule produces; item 3 gives what a guard
   would add.

The selector in this PR is unchanged by this measurement. The degeneracy and
its guard are tracked in their own issue, named in the PR.

## Addendum, 2026-10-15: the maintainer's rulings on this report, and what they asked for next

Written after the maintainer read the report above and ruled, the same day.
Nothing above is edited.

**Round 1 measures unguarded IPPE.** No tilt guard in the measured
configuration: one treatment, no estimator mixture, tilt reported as a
covariate per clip. A guard that falls back to the closed form below a tilt
threshold is an adoption choice for #107's adoption rule after round 1, and
if ever adopted it reads the closed form's own per-frame tilt, never the
previous frame's. The per-run counter therefore counts the fallbacks the
current rule produces and nothing else; as the rule stands those are the
ambiguous frames and the frames on which both candidates fail the depth rule
(item 4 gives both), and there is no guard for it to count.

**The crossover is stated as the measured interval, 7°–10°,** not as "about
8°": the point estimate lies between grid points, and a bound stated more
tightly than it was measured is a derivation-free figure. Where the text
above says "about 8°", read "between 7° and 10°".

**Item 2, extended to the campaign's tilt range.** The same construction, 13
tilt steps, 588 fits; the ratio is median `e(selected)` over median
`e(closed form)`:

| tilt | fits | over C4's bound | median e(selected) | median e(closed form) | ratio | selected closer |
|---|---|---|---|---|---|---|
| 0° | 12 | 7 | 0.368 | 0.115 | 3.21 | 0 of 12 |
| 1° | 48 | 26 | 0.353 | 0.114 | 3.09 | 1 of 48 |
| 2° | 48 | 25 | 0.366 | 0.112 | 3.26 | 1 of 48 |
| 3° | 48 | 21 | 0.315 | 0.115 | 2.74 | 1 of 48 |
| 4° | 48 | 18 | 0.284 | 0.116 | 2.45 | 5 of 48 |
| 5° | 48 | 18 | 0.228 | 0.111 | 2.06 | 12 of 48 |
| 7° | 48 | 8 | 0.178 | 0.110 | 1.62 | 13 of 48 |
| 10° | 48 | 0 | 0.101 | 0.118 | 0.86 | 27 of 48 |
| 15° | 48 | 0 | 0.049 | 0.114 | 0.43 | 43 of 48 |
| 20° | 48 | 0 | 0.046 | 0.126 | 0.36 | 48 of 48 |
| 30° | 48 | 0 | 0.063 | 0.193 | 0.33 | 48 of 48 |
| 40° | 48 | 0 | 0.087 | 0.278 | 0.31 | 46 of 48 |
| 50° | 48 | 0 | 0.140 | 0.374 | 0.37 | 48 of 48 |

The closed form's error grows with tilt (0.11 px flat to 10°, then 0.13,
0.19, 0.28, 0.37 px); IPPE's falls to 0.05 px at 15°–20° and grows more
slowly after. Source: `test/pose/c4_characterisation.test.ts`, item 2.

**The tilt distribution of every clip in the corpus** (the oracle's pose,
headless as in item 3; one run each), with the share of posed frames below
8°, the figure the maintainer asked for. The crossover interval is 7°–10°, so
"below 8°" is read as "inside or at the lower edge of the crossover":

| clip | processing | posed | tilt p50 | below 8° | 2–5° | 5–10° | 10–20° | 20–40° | 40°+ | fallbacks |
|---|---|---|---|---|---|---|---|---|---|---|
| `pinball-static.mp4` | 203 × 360 | 366 | 2.9° | 366 (100%) | 366 | 0 | 0 | 0 | 0 | 0 |
| `acquire-test/static-portrait.mp4` | 203 × 360 | 366 | 2.9° | 366 (100%) | 366 | 0 | 0 | 0 | 0 | 0 |
| `acquire-test/static-landscape.mp4` | 480 × 270 | 366 | 5.6° | 366 (100%) | 0 | 366 | 0 | 0 | 0 | 0 |
| `pinball-bench-table.mp4` | 203 × 360 | 259 | 9.5° | 95 (36.7%) | 62 | 147 | 5 | 0 | 45 | 20 |
| `pinball-bench.mp4` | 480 × 270 | 267 | 17.4° | 0 (0%) | 0 | 53 | 95 | 62 | 57 | 21 |
| `acquire-test/wall-30fps.mp4` | 480 × 270 | 332 | 18.1° | 0 (0%) | 0 | 66 | 114 | 75 | 77 | 37 |
| `acquire-test/wall-native-fps.mp4` | 480 × 270 | 274 | 18.0° | 0 (0%) | 0 | 53 | 97 | 63 | 61 | 32 |

Every static clip sits entirely below the crossover; the table clip has 95 of
259 frames below 8° and 147 more between 5° and 10°, that is inside or near
it; the wall clips have none below 8°. The 40°+ bands are read as in item 3.
The `acquire-test/` clips are M2's acquisition probes, not campaign media;
they are listed because the maintainer asked for every clip in the corpus.

**Which clips round 1's comparison uses, and what σ was calibrated on.** The
null control's jitter clause runs on the static clip: round 0's eight runs
were `pinball-static.mp4`, four per arm (the session's procedure, its runs
table), and the clause's round-1 baselines are "static baselines", every
block "a static block" ([the clause](./README.md#the-null-controls-jitter-clause-2026-10-14),
item 3 and "What was seen before it was written"). So **round 0's s₀ was
calibrated on the static clip, and round 1's registered comparison runs on
it**: the clip whose every frame is at 2.9° of tilt, inside the regime where
IPPE's pose is 2 to 3.3 times farther from the truth than the closed form's.
Two consequences the registration has to carry:
- the jitter clause reads `H`, not the pose, so it will not see the
  regression; the correctness half will, on synthetic ground truth;
- on the static clip, round 1 measures IPPE inside its degenerate regime by
  construction, and that is predicted here, not discovered from the data.

**The prediction for #107, split by regime, refutable on both sides.** Drafted
here for the maintainer to register; the margins are read from the table
above and widened to the nearest half unit of the ratio, so that a point
estimate between grid points cannot fall outside them by rounding alone:
- **below the crossover (tilt under 7°):** IPPE's selected pose is *worse*
  than the closed form's, the ratio of their median errors against the truth
  between **1.5 and 3.5** (measured 1.62 at 7°, 2.06 to 3.26 from 5° down to
  0°). Refuted if the ratio is below 1.5 (IPPE not worse) and refuted if it
  is above 3.5 (worse by more than the degeneracy as measured);
- **inside the crossover (7° to 10°):** no prediction; the ratio is reported;
- **above the crossover (tilt of 15° and more):** IPPE's selected pose is
  *better*, the ratio at most **0.5** (measured 0.31 to 0.43 from 15° to
  50°). Refuted if the ratio is above 0.5; and, since "better" alone is not
  refutable on the low side, also refuted if it is below **0.25**, half the
  smallest measured ratio, which would mean the closed form is worse than
  anything measured here. 10° is the crossover's upper edge, ratio 0.86,
  and belongs to the interval above.

Both sides read the ratio of medians over the renders of the regime, on the
rigid sets, against the truth; on a clip, where there is no truth, the
covariate is the closed form's own per-frame tilt and the regime it puts the
frame in. The static clip is wholly in the first regime.

**The failing provenance test, what it asserts (ruling 2).**
`examples/test/provenance.test.mjs`, "the manifest npm run build writes ›
hashes the files on disk, the bundle and jsfeat-next's included (rebuild
after an edit)", asserts that every `sources` and `served` entry of
`examples/dist/provenance.json`, the bundle, and the embedded jsfeat-next
file hash to the files on disk, and that the installed jsfeat-next version
is the lockfile's. It does **not** assert that the manifest is clean or at an
expected head; it asserts that the manifest describes the working tree, so
it fails whenever the tree has moved since the last root build. It failed on
the branch because the overwritten manifest was built at `6ea5183` and the
branch's sources moved after it; its message names the first file whose hash
differs and the two hashes, and does not say that the served build is stale
or at another commit. It is not changed here; CI builds before it tests, so
it passes there. The maintainer rules on the message.

**The overwrite re-tested (ruling 1).** A clean worktree at `37dc6d4`,
`npm ci`, the root build on node v24.21.0 and esbuild 0.28.2: `clean: true`,
head `37dc6d4`, bundle `3a2567c15d59b1fb669a82a52d9f1eedcd1586664936250ff2fbf21e87513876`,
byte for byte round 0's. Nothing was lost; the event and the match are in
round 0's session record and in #135. The branch's own `examples/dist` is
left as a build output of the branch: not evidence, not the campaign's build.

## Correction to the addendum above, 2026-10-15: the prediction infers stability from accuracy, and that is a conjecture

The maintainer's reading of the addendum, the same day. Nothing above is
edited; this says how it is to be read.

**Accuracy and stability are different quantities, and only one was
measured.** Every figure of item 2 and its extension is accuracy: the error
of a pose against the renders' ground truth. Round 1's registered metric,
`jitterPx`, is stability on clips that have no ground truth. The 7°–10°
crossover is an **accuracy** crossover, and the paragraph "Two consequences
the registration has to carry" infers what round 1 will see from it with no
measured link between the two. By this programme's own rule that inference
is a **conjecture**, and it is labelled one here until measured. An estimator
can be less accurate and more stable at the same time: a bias that is the
same on consecutive frames is exactly what `jitterPx` rewards. The split
prediction, as drafted, is a prediction about accuracy on the rigid sets; it
is not a prediction about `jitterPx`, and #107 is not to read it as one. The
measured link is the subject of the third addendum below.

**Tilt bands, if #107 uses one, are read from the control arm's pose,
never from IPPE's.** Reading the band from the treatment arm selects on the
dependent variable; the same reason the jitter clause is read on each block's
own baseline arm only. The corpus table above already reads the oracle's
pose, which is the control arm's.

## Third addendum, 2026-10-15: the jitter dry run. Round 1's registered metric cannot see the treatment

**A Stage 1 feasibility probe**, run on the desktop at the maintainer's
request: not campaign data, no provenance, no device, never reportable as a
round, and not to be confused with one by a later reader. Its source is
`packages/nft-tracker/scripts/jitter-dry-run.mjs`, whose header says the same.

**What was run.** Both arms over every clip of the corpus, once each, on the
same ffmpeg-decoded frames at the page's default box, with the same backend,
target, intrinsics and defaults, and the same seeded `Math.random`, so that
the two runs process identical frames and draw identical RANSAC samples:
- the **control arm**: the tracker of `dev` at `1c8cd34`, built in a
  throwaway worktree (`npm ci`, the root build), whose pose is the backend's
  closed form;
- the **treatment arm**: this branch's tracker, whose pose is IPPE's.

Each run's frame records were built by the frozen metrics module's own
`frameRecord`, and the two were compared with its `compareExports`, on common
media times, as the plan requires; the split by tilt band uses its
`cornerJitter` with `include`, the module's own restriction. The module,
`examples/js/bench-metrics.mjs`, was imported read-only; it has no imports and
no browser dependency at module level, so it runs under node unchanged.
Nothing was reimplemented and nothing served was touched. The band is read
from the **control arm's** pose on each frame.

**The result: zero, exactly, everywhere.**

| clip | frames | common media times | corners differing | control jitterPx | treatment jitterPx | difference |
|---|---|---|---|---|---|---|
| `pinball-static.mp4` | 366 | 366 | 0 | 0.1337 | 0.1337 | 0 |
| `acquire-test/static-portrait.mp4` | 366 | 366 | 0 | 0.1381 | 0.1381 | 0 |
| `acquire-test/static-landscape.mp4` | 366 | 366 | 0 | 0.1902 | 0.1902 | 0 |
| `pinball-bench-table.mp4` | 267 | 218 | 0 | 9.420 | 9.420 | 0 |
| `pinball-bench.mp4` | 298 | 216 | 0 | 8.381 | 8.381 | 0 |
| `acquire-test/wall-30fps.mp4` | 359 | 261 | 0 | 38.92 | 38.92 | 0 |
| `acquire-test/wall-native-fps.mp4` | 298 | 219 | 0 | 13.74 | 13.74 | 0 |

By tilt band (the control arm's pose; bands 0–7°, 7–10°, 10–20°, 20°+), the
difference is 0 in every band of every clip that has frames in it: the static
clips entirely in 0–7° (jitterPx 0.134, 0.138, 0.190); the table clip 77
frames in 0–7° (2.604), 132 in 7–10° (1.905), 4 in 20°+ (76.2); the wall
clips 54–67 frames in 7–10° (2.6–2.9), 94–113 in 10–20° (3.8–4.1), 66–79 in
20°+ (11.9–23.6). The large figures of the 20°+ bands and of the whole
hand-held clips are the control arm's own and identical in the treatment
arm; they are the frames the characterisation's item 3 read as poor `H`
(re-detections during loss), and are not interpreted here.

**Why it is exactly zero, and what that settles.** On every common frame of
every clip, the two arms' corners are byte-identical (`cornersDiffering: 0`,
2,012 frames compared). `jitterPx` and `spreadPx` are computed from the
target's corners under each frame's `H` (`frameRecord`: `corners:
reprojectCorners(result.H, …)`), and the treatment changes the pose and not
`H` (criterion C9: the frozen suites that judge `H` pass unmodified). So the
link between the accuracy crossover and `jitterPx` is not small or
unfavourable: **there is none.** The conjecture of the correction above is
settled in the only way it could be: round 1's registered metric cannot see
M4's step 3, in either direction, on any clip, in any tilt band, because the
quantity it reads is the one quantity the treatment does not touch.

**What follows, for #107 and for the maintainer.**
- On `jitterPx`, M4 step 3 has nothing to measure on this corpus: not a
  favourable difference in the band the clips occupy, not an unfavourable
  one, but identity. A device campaign would discover a difference of 0 ± the
  arms' resampling noise, which is the null control's own result. By the
  maintainer's rule, that is the step's honest outcome on this metric: **a
  documented null, by construction, known before the campaign** rather than
  after it.
- What IPPE changes is the pose the application renders with, and the
  correctness half reads it, on synthetic ground truth: that is where the
  split prediction of the second addendum (an accuracy prediction) belongs,
  and where step 3 has a result at all. A steadiness measurement that could
  see the pose would have to read the pose: for example the reprojection of
  the target's corners through `K · [R | t]` rather than through `H`, which is
  a new metric, outside METRICS_VERSION 1, and so outside this campaign's
  instrument.
- The split prediction stands as an accuracy prediction on the rigid sets;
  the paragraph that inferred a round-1 regression from it is withdrawn by
  this measurement, in the direction of "no effect", not "regression".

**The two items the maintainer asked after (point 3 of the rulings).**
- *The ambiguous-frame rate per clip* is item 4 above and the corpus table of
  the second addendum (its `fallbacks` column); per clip, the ambiguous
  frames alone, from the same runs: `pinball-static` 0 of 366,
  `static-portrait` 0 of 366, `static-landscape` 0 of 366,
  `pinball-bench-table` 5 of 259 (1.9%), `pinball-bench` 14 of 267 (5.2%),
  `wall-30fps` 18 of 332 (5.4%), `wall-native-fps` 13 of 274 (4.7%). Every
  one a DETECT frame.
- *The determinism test* is `packages/nft-tracker/test/pose/ippe.test.ts`:
  C6 (the same input gives bit-identical output; 60 random orders of the
  correspondences change neither the selection nor the candidates beyond
  τ_exact, a property test), and, added 2026-10-15, "the selector draws
  nothing": `Math.random` is counted during two selections and read 0 times,
  and the two answers are bit-identical, so no seed can enter.

**The provenance test's status, stated on its own line (the reporting rule
of 2026-10-15, #136):** `examples/test/provenance.test.mjs` is red on this
PC, because its `examples/dist` is the branch build the review agent made at
`6ea5183` and the branch's sources moved after it; its message now says so
(head, clean, dirty paths, remedy). It is green in CI, which builds before it
tests (PR #134: 6 checks passing).

## Correction to the third addendum, 2026-10-15: a zero from a metric that cannot respond is no measurement, not no effect

The maintainer's ruling on the third addendum, the same day. Nothing above
is edited; this says how its last section is to be read, and puts the
structural claim on quoted code.

**The wording withdrawn.** The third addendum says the conjecture is
"settled in the only way it could be" and that the inference is "withdrawn by
this measurement, in the direction of 'no effect'". That is wrong, and the
difference matters: an attested null reads to a later reader like evidence of
no effect, and that is not what a zero from a blind metric is. The right
statement: **the registered metric does not respond to this treatment by
construction; the split prediction, read as a jitter prediction, is void, not
refuted; no statement about the treatment's effect follows from the zero.**
The zero is no measurement. Wherever the third addendum says "no effect",
read "no measurement".

**The structural claim, on the module's own lines.** The load-bearing fact is
that `jitterPx` is a function of `H` alone. In `examples/js/bench-metrics.mjs`
(frozen; quoted, not changed):

- the frame record's corners are computed from `result.H`, line 165 of
  `frameRecord`:

  ```js
  corners: result.ok ? reprojectCorners(result.H, targetPoints) : null,
  ```

- `reprojectCorners` reads nothing but `H` and the target's four corners
  (lines 79–93):

  ```js
  export function reprojectCorners(H, points) {
      const out = [];
      let side = 0;
      for (const [x, y] of points) {
          const w = H[6] * x + H[7] * y + H[8];
          const u = (H[0] * x + H[1] * y + H[2]) / w;
          const v = (H[3] * x + H[4] * y + H[5]) / w;
          …
          out.push([u, v]);
      }
      return out;
  }
  ```

- `cornerJitter` reads only `f.corners` and `f.mediaTimeSeconds` (its window
  loop, lines 973–981): `mean += f.corners[c][axis]`,
  `slope += (f.mediaTimeSeconds - tMean) * (f.corners[c][axis] - mean)`, and
  the residual `f.corners[c][axis] - mean - slope * (…)`;

- no function of the module reads a result's `pose` (`grep "\.pose"` over
  the module finds only prose in `DEFINITIONS`).

So the cause is a fact of the frozen source, and the 2,012 byte-identical
frames of the dry run are its consequence measured. Had the quoted lines read
the pose, the zero would have been a defect of the dry run instead; they do
not.

**No round 1 for step 3 (ruled).** A campaign run on a blind metric would
attest a zero and place it in the record as a result. Nothing is gained by
measuring it on the device.

**What #105 claims, exactly (ruled).** IPPE is implemented; it is
deterministic under 60 random correspondence orders and 0 reads of
`Math.random`; and on the rigid synthetic sets it is more accurate than the
closed form above the crossover, which is the measured interval 7°–10°, and
less accurate below it. That is an accuracy result on the rigid sets. No
jitter claim and no campaign claim are made for it.

**One line on where the ambiguity lands (ruled, point 7).** Every ambiguous
frame on every clip was a DETECT frame, where the pose is established from
scratch from RANSAC's inliers. That is precisely where a continuity tie-break
would have propagated a wrong branch into the frames that follow, so the
measurement supports the ruling that kept history out of the selector.

## Correction, 2026-10-15: the lower refutation bound withdrawn, and the dispersion the band is to be set from

Found by an outside reviewer (Copilot, on PR #134): the second addendum's
lower bound of 0.25 is stated as "half the smallest measured ratio", and the
smallest ratio in its table is 0.31, whose half is 0.155. The maintainer's
ruling: **neither number.** 0.25 has no derivation; 0.155 is arithmetically
consistent with a rule that is itself arbitrary, which would replace an
underived figure with a derived-looking one. The band is to come from the
measurement's own dispersion, and the maintainer sets it from the figures
below, with the derivation written beside it. Until then the lower edge of
the prediction is **unset**, not 0.25 and not 0.155. Nothing above is edited.

**The per-fit ratio `e(selected) / e(closed form)`, per tilt step**, over the
same 588 fits as the extended table (3 seeds × 2 rolls × 2 shifts, × 4
azimuths above 0°), from `test/pose/c4_characterisation.test.ts`, item 2:

| tilt | fits | min | q25 | median | q75 | max |
|---|---|---|---|---|---|---|
| 0° | 12 | 1.940 | 2.342 | 2.957 | 3.368 | 4.141 |
| 1° | 48 | 0.768 | 2.582 | 2.979 | 3.457 | 5.721 |
| 2° | 48 | 0.757 | 2.478 | 2.910 | 4.249 | 8.816 |
| 3° | 48 | 0.955 | 2.009 | 2.831 | 4.681 | 10.844 |
| 4° | 48 | 0.399 | 1.582 | 2.434 | 5.373 | 15.442 |
| 5° | 48 | 0.283 | 1.093 | 2.218 | 5.871 | 14.507 |
| 7° | 48 | 0.196 | 0.946 | 1.623 | 2.211 | 6.346 |
| 10° | 48 | 0.123 | 0.559 | 0.968 | 1.516 | 2.326 |
| 15° | 48 | 0.075 | 0.329 | 0.420 | 0.726 | 1.343 |
| 20° | 48 | 0.101 | 0.232 | 0.325 | 0.465 | 0.914 |
| 30° | 48 | 0.162 | 0.256 | 0.317 | 0.430 | 0.650 |
| 40° | 48 | 0.128 | 0.239 | 0.287 | 0.362 | 1.336 |
| 50° | 48 | 0.161 | 0.225 | 0.291 | 0.432 | 0.821 |

The quartiles are of the per-fit ratios, not of the medians; the earlier
table's "ratio of medians" is a different statistic (3.21 at 0° against the
per-fit median of 2.957 here, since a ratio of medians is not the median of
ratios). Across the steps **below the crossover (0° to 5°)**: the per-fit
medians run from 2.218 to 2.979, the quartile ranges from 1.09 to 5.87, the
extremes from 0.283 to 15.442. **Above it (15° to 50°)**: the medians run
from 0.287 to 0.420, the quartile ranges from 0.225 to 0.726, the extremes
from 0.075 to 1.343. The step of 7° (median 1.623, quartiles 0.946 to 2.211)
and of 10° (0.968, 0.559 to 1.516) are the crossover interval, where the
quartile range straddles 1.

**Why the condition is two-sided, for the registration.** A prediction of a
specific effect size is refuted by an effect much larger as well as much
smaller: an effect far outside the predicted band means the reasoning behind
the prediction was wrong, whichever side it lands on. The lower edge of the
"better above the crossover" prediction is therefore not pointless; it is
where the band's derivation is tested from below, and it is set from the
dispersion above, not from a rule about halves.

## Correction, 2026-10-15: the split prediction withdrawn, there being nothing scheduled to test it; the measured range recorded as a description

The maintainer's prior question, before any band: what measurement, not yet
taken, would the above-crossover prediction be checked against? **Nothing is
scheduled.** The prediction is about the ratio of IPPE's pose error to the
closed form's on rigid synthetic sets; the only measurements of that ratio
are the 588 fits of the extended table, which the band would be derived from.
The campaign cannot test it, since no exported value is a function of the
pose (the third addendum's correction). #106's synthetic half measures lag,
not this ratio. No new sweep, no second target, no further tilt step and no
further seed is planned. A refutation condition over data already in hand is
not a refutation condition, so by the maintainer's ruling **the split
prediction of the second addendum is withdrawn, on both sides**, and what
was observed is recorded as a description with no refutation condition at
all. That is the accurate outcome, not a weaker one.

**The description.** On rendered rigid views of the shipped target at the
frozen tests' scale (3 seeds × 2 rolls × 2 shifts, × 4 azimuths above 0°),
the per-fit ratio `e(selected) / e(closed form)` over the target's 5 × 5 grid:
below the crossover interval, at 0° to 5°, its per-step medians ran from
2.218 to 2.979 (IPPE worse); at 7° and 10°, the interval, 1.623 and 0.968
with quartile ranges straddling 1; from 15° to 50°, 0.287 to 0.420 (IPPE
better). The quartiles and extremes per step are in the table of the previous
correction. If a measurement of this ratio on data not yet taken is ever
scheduled, a prediction can be registered against it then, by the rule below.

**The rule the maintainer stated, before seeing the table, for the case a test
exists** (recorded so that the number follows from the rule and not the rule
from the number): only steps strictly above the crossover interval enter,
from 10° upward (7° excluded); upper edge, the largest per-step median plus
twice the largest per-step standard error of the median across those steps;
lower edge, the smallest per-step median minus the same quantity; the
multiplier 2 chosen for the direction it errs in, not as a better estimate
of anything: a wider band refuses a correct prediction less often, the
conservative direction for a first registration.

**Its arithmetic on the table, reproducible by a reader, not registered**
(there is no test). The standard error of the median per step is given two
ways, both from the per-fit ratios of `test/pose/c4_characterisation.test.ts`,
item 2: by the sample standard deviation, `1.2533 · s / √n`; and by the
quartiles, `1.2533 · (q75 − q25) / (1.349 · √n)`.

| tilt | n | median | sd | se(median), by sd | se(median), by quartiles |
|---|---|---|---|---|---|
| 10° | 48 | 0.968 | 0.612 | 0.111 | 0.128 |
| 15° | 48 | 0.420 | 0.323 | 0.058 | 0.053 |
| 20° | 48 | 0.325 | 0.188 | 0.034 | 0.031 |
| 30° | 48 | 0.317 | 0.121 | 0.022 | 0.023 |
| 40° | 48 | 0.287 | 0.263 | 0.048 | 0.017 |
| 50° | 48 | 0.291 | 0.172 | 0.031 | 0.028 |

Largest median 0.968 (10°); smallest 0.287 (40°); largest standard error
0.111 by sd and 0.128 by quartiles, both at 10°.
- By sd: upper `0.968 + 2 × 0.111 = 1.190`; lower `0.287 − 2 × 0.111 = 0.065`.
- By quartiles: upper `0.968 + 2 × 0.128 = 1.224`; lower `0.287 − 2 × 0.128 = 0.031`.

Two things a reader should see in that arithmetic. The upper edge is above 1
either way, because the rule admits the 10° step, whose median is 0.968, so
the band as the rule gives it would not even assert that IPPE is better; and
the 10° step also supplies the largest standard error, so it sets the width
on both sides. Whether 10° belongs inside the crossover interval (which the
earlier text states as 7°–10°, the two grid points that straddle 1) or above
it is a question the rule's first bullet decides by saying "from 10°
upward"; the arithmetic is given as the rule reads, and the choice is the
maintainer's if a test is ever scheduled.
