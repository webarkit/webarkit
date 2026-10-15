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
