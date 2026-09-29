# 2026-09-29 — tuning round 3 on the desktop: patch size

Round 3's desktop evidence ([`README.md`](./README.md), "2026-09-28 — M3: the
tuning pass", round 3 as amended), committed as tabulated. Patch sizes 12, 16
and 24, at the adopted 48 patches and their default spacing (62 px); the
candidates were compiled into the git-ignored `examples/targets/tuning/`:

```bash
node packages/nft-tracker/bin/compile-target.mjs examples/images/pinball.jpg \
    -o examples/targets/tuning/p48-s<12|24>.wnft --physical-size 210x262.5 --patches 48 --patch-size <12|24>
```

The 16 × 16 target is the committed `examples/targets/pinball.wnft`. Two parts:

1. **Ground truth**, at the tracker's defaults, on four patch sets cut by
   `selectPatches` from the fixture image — M2's 64 of 16 × 16 at 54 px, to
   check the method, and the three sizes at 48 patches, each checked equal,
   patch for patch, to its compiled candidate. The single-step perturbation
   sweep (137 predictions × 2 views × 5 renders); the alignment's basin per
   patch (`alignPatch` from a prediction shifted 1, 2, 3, 4 and 6 px in 16
   directions, on the same views and renders); and the camera-path
   sequences, velocity steps to 8 px/frame. Errors are measured at M2's 64
   patch centres, over the whole target, at its far point and over the part
   in view. The run's source is at the end of this file.
2. **The bundled clips**, replayed:
   `node scripts/replay-clips.mjs --seed <1|2|3> --tracking-only --target <16, 12 or 24> --out <dir>`,
   nine runs interleaved per seed. Timings compare within this session only,
   and were taken while the ground-truth run shared the machine for part of
   it; the counts and poses are deterministic under a seed.

## Ground truth

The method checks against `src/tracker.ts`: on M2's fixture it gives 84% of
alignments converging from 2 px off and 68% from 3, 78% and 61% within
0.5 px — the same four numbers.

| patch set | levels | 8 × 8 cells with a centre | sweep: right (shift / roll / scale) | wrong fits accepted | refused, by reason |
|---|---|---|---|---|---|
| M2: 64 of 16 at 54 px | 64 / 0 / 0 | 52 | 787 (650 / 69 / 68) | 24: 0.613, 0.88, 0.522, 7.274, 0.578, 1.347, 7.888, 0.61, 0.741, 7.108, 0.644, 9.4, 0.546, 9.193, 0.571, 1.491, 7.686, 0.585, 0.614, 9.363, 8.148, 0.621, 0.834, 0.573 px | fit-failed 385, too-many-outliers 18, too-few-patches 142, poor-fit 14 |
| 48 of 12 at 62 px | 46 / 2 / 0 | 44 | 690 (597 / 56 / 37) | 1: 7.417 px | poor-fit 91, too-many-outliers 230, fit-failed 277, too-few-patches 81 |
| 48 of 16 at 62 px (shipped) | 47 / 1 / 0 | 44 | 788 (650 / 75 / 63) | 0 | fit-failed 402, too-many-outliers 18, too-few-patches 132, poor-fit 30 |
| 48 of 24 at 62 px | 47 / 1 / 0 | 43 | 802 (650 / 89 / 63) | 3: 6.123, 0.505, 7.668 px | fit-failed 348, too-few-patches 191, poor-fit 21, too-many-outliers 5 |


Every wrong fit above, with the prediction it came from (all at the tracker's
defaults, so each passed `maxFitRms` 0.6 px, some narrowly):

```text
48 of 12 at 62 px: render 5, view 0, scale /1.08: 7.417 px RMS (in view 7.417), inliers 9 of 14, fit rms 0.589, quality 0.18
48 of 24 at 62 px: render 3, view 0, scale /1.08: 6.123 px RMS (in view 6.123), inliers 10 of 14, fit rms 0.599, quality 0.20
48 of 24 at 62 px: render 5, view 0, roll +5 deg: 0.505 px RMS (in view 0.505), inliers 9 of 11, fit rms 0.275, quality 0.19
48 of 24 at 62 px: render 5, view 1, scale /1.08: 7.668 px RMS (in view 4.680), inliers 10 of 14, fit rms 0.598, quality 0.22
```

The shipped 16 × 16 refuses those same predictions on those renders.

|---|---|---|---|---|
| M2: 64 of 16 at 54 px | 92% / 84% / 68% / 47% / 27% | 85% / 78% / 61% / 39% / 17% | 0.675 / 0.839 / 0.893 | 1.9% of 16017 |
| 48 of 12 at 62 px | 91% / 79% / 62% / 48% / 34% | 78% / 71% / 52% / 34% / 14% | 0.552 / 0.794 / 0.917 | 9.2% of 10981 |
| 48 of 16 at 62 px (shipped) | 88% / 83% / 69% / 53% / 31% | 84% / 80% / 65% / 46% / 21% | 0.716 / 0.847 / 0.911 | 1.3% of 11945 |
| 48 of 24 at 62 px | 95% / 87% / 75% / 56% / 29% | 95% / 86% / 72% / 52% / 22% | 0.694 / 0.843 / 0.907 | 0.4% of 13334 |


|---|---|---|---|---|---|---|
| M2: 64 of 16 at 54 px | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | — | 0.10 / 0.19 / 0.10 / 0.19 | — | 54 |
| M2: 64 of 16 at 54 px | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | frame 38 | 1.20 / 2.49 / 0.24 / 0.45 | — | 10 |
| M2: 64 of 16 at 54 px | velocity 4 px/frame | `DTTTTTTTTTTTTTT` | — | 0.07 / 0.18 / 0.07 / 0.18 | — | 28 |
| M2: 64 of 16 at 54 px | velocity 5 px/frame | `DTTTTDDTTTTTTTT` | — | 0.09 / 0.20 / 0.08 / 0.18 | — | 20 |
| 48 of 12 at 62 px | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | — | 0.16 / 0.38 / 0.16 / 0.38 | — | 37 |
| 48 of 12 at 62 px | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | frame 38 | 5.02 / 10.98 / 0.87 / 2.22 | 34, 35, 36, 37, 38 | 8 |
| 48 of 12 at 62 px | velocity 4 px/frame | `DTTTTDTTTTTTTTT` | — | 0.17 / 0.44 / 0.17 / 0.44 | — | 19 |
| 48 of 12 at 62 px | velocity 5 px/frame | `DTTTTDDDDDDDDDD` | — | 0.13 / 0.29 / 0.13 / 0.29 | — | 36 |
| 48 of 16 at 62 px (shipped) | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | — | 0.11 / 0.35 / 0.11 / 0.34 | — | 38 |
| 48 of 16 at 62 px (shipped) | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | frame 38 | 3.37 / 8.24 / 0.36 / 0.72 | 36, 37, 38 | 9 |
| 48 of 16 at 62 px (shipped) | velocity 4 px/frame | `DTTTTTTTTTTTTTT` | — | 0.10 / 0.29 / 0.10 / 0.29 | — | 23 |
| 48 of 16 at 62 px (shipped) | velocity 5 px/frame | `DTTTTDDDDDDDDDD` | — | 0.09 / 0.24 / 0.09 / 0.24 | — | 39 |
| 48 of 24 at 62 px | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | — | 0.07 / 0.26 / 0.06 / 0.19 | — | 42 |
| 48 of 24 at 62 px | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | frame 38 | 2.86 / 7.10 / 0.28 / 0.73 | 36, 38 | 9 |
| 48 of 24 at 62 px | velocity 4 px/frame | `DTTTTTTTTTTTTTT` | — | 0.11 / 0.32 / 0.11 / 0.32 | — | 23 |
| 48 of 24 at 62 px | velocity 5 px/frame | `DTTTTDDDDDDDDDD` | — | 0.05 / 0.13 / 0.05 / 0.13 | — | 44 |

## The bundled clips

Per clip, size and seed, every-frame schedule except the "scaled schedule"
column, which models the tablet's frame skipping from the configuration's own
step (round 1's scaled-schedule caveat applies: it answers whether a step
keeps up, not how well it tracks). `jitter / spread` pool DETECT poses too;
jitter is read on the static clip only.

## static

| size | seed | TRACK | held lost | first confirmed | too-few-patches first / held | step p50 / p95 ms | scaled sched.: TRACK, held lost | µs per patch p50 | unconverged | right | refused by the gate | ZNCC of right p5 / p50 | right: iterations p50 / p95 | accepted fits: inliers min / p5 / p50 | jitter / spread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | 1 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 3.2 / 5.1 | 99.7%, 0 / 361 (0) | 65.1 | 9.5% (31.2%) | 30697 | 1347 (4.4%) | 0.610 / 0.928 | 5 / 16 | 26 / 39 / 41 | 0.131 / 0.9 |
| 16 | 2 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 3.3 / 5.1 | 99.7%, 0 / 361 (0) | 66.5 | 9.5% (31.2%) | 30697 | 1347 (4.4%) | 0.610 / 0.928 | 5 / 16 | 26 / 39 / 41 | 0.131 / 0.9 |
| 16 | 3 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 3.4 / 6.4 | 99.7%, 0 / 361 (0) | 68.6 | 9.5% (31.3%) | 30696 | 1346 (4.4%) | 0.610 / 0.928 | 5 / 16 | 26 / 39 / 41 | 0.131 / 0.9 |
| 12 | 1 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 1.9 / 3.0 | 99.7%, 0 / 361 (0) | 37.6 | 11.0% (35.5%) | 30552 | 2563 (8.4%) | 0.560 / 0.911 | 5 / 16 | 21 / 37 / 39 | 0.152 / 0.9 |
| 12 | 2 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 2.0 / 3.4 | 99.7%, 0 / 361 (0) | 39.4 | 11.0% (35.5%) | 30553 | 2563 (8.4%) | 0.560 / 0.911 | 5 / 16 | 21 / 37 / 39 | 0.152 / 0.9 |
| 12 | 3 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 1.9 / 2.6 | 99.7%, 0 / 361 (0) | 37.4 | 11.0% (35.5%) | 30552 | 2563 (8.4%) | 0.560 / 0.911 | 5 / 16 | 21 / 37 / 39 | 0.152 / 0.9 |
| 24 | 1 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 6.5 / 9.7 | 99.7%, 0 / 361 (0) | 132.2 | 8.4% (31.4%) | 31723 | 576 (1.8%) | 0.697 / 0.913 | 5 / 11 | 28 / 42 / 43 | 0.130 / 0.9 |
| 24 | 2 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 6.2 / 8.7 | 99.7%, 0 / 361 (0) | 127.4 | 8.4% (31.4%) | 31723 | 576 (1.8%) | 0.697 / 0.913 | 5 / 11 | 28 / 42 / 43 | 0.130 / 0.9 |
| 24 | 3 | 99.9% | 0 / 724 | 1 / 1 | 0 / 0 | 6.0 / 7.8 | 99.7%, 0 / 361 (0) | 123.2 | 8.4% (31.4%) | 31723 | 576 (1.8%) | 0.697 / 0.913 | 5 / 11 | 28 / 42 / 43 | 0.129 / 0.9 |

## wall

| size | seed | TRACK | held lost | first confirmed | too-few-patches first / held | step p50 / p95 ms | scaled sched.: TRACK, held lost | µs per patch p50 | unconverged | right | refused by the gate | ZNCC of right p5 / p50 | right: iterations p50 / p95 | accepted fits: inliers min / p5 / p50 | jitter / spread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | 1 | 67.6% | 6 / 402 | 8 / 146 | 130 / 3 | 4.9 / 7.7 | 76.2%, 4 / 307 (1) | 99.8 | 35.0% (57.1%) | 13190 | 806 (6.1%) | 0.569 / 0.880 | 10 / 25 | 8 / 15 / 32 | 15.092 / 48.8 |
| 16 | 2 | 68.1% | 6 / 405 | 8 / 138 | 123 / 3 | 4.7 / 6.6 | 78.4%, 3 / 325 (1) | 96.7 | 34.9% (57.0%) | 13264 | 816 (6.2%) | 0.567 / 0.880 | 10 / 25 | 8 / 16 / 32 | 15.359 / 47.8 |
| 16 | 3 | 68.1% | 6 / 405 | 8 / 137 | 121 / 3 | 4.9 / 7.5 | 76.2%, 4 / 307 (1) | 99.8 | 35.3% (57.3%) | 13236 | 814 (6.1%) | 0.567 / 0.880 | 10 / 25 | 8 / 15 / 32 | 38.205 / 64.6 |
| 12 | 1 | 57.2% | 34 / 340 | 36 / 209 | 140 / 1 | 3.0 / 4.8 | 68.8%, 8 / 253 (0) | 60.9 | 39.4% (60.1%) | 10295 | 1040 (10.1%) | 0.506 / 0.894 | 10 / 25 | 8 / 13 / 28 | 16.634 / 49.7 |
| 12 | 2 | 56.5% | 31 / 336 | 33 / 206 | 129 / 1 | 2.9 / 4.1 | 66.9%, 10 / 241 (0) | 58.9 | 39.8% (60.4%) | 10194 | 1039 (10.2%) | 0.505 / 0.895 | 10 / 25 | 8 / 13 / 28 | 20.946 / 49.1 |
| 12 | 3 | 55.9% | 38 / 332 | 40 / 213 | 129 / 2 | 2.8 / 4.0 | 67.2%, 11 / 241 (0) | 57.7 | 39.7% (60.4%) | 10046 | 999 (9.9%) | 0.511 / 0.895 | 10 / 25 | 8 / 13 / 28 | 32.418 / 62.1 |
| 24 | 1 | 69.0% | 4 / 410 | 6 / 139 | 124 / 4 | 10.0 / 15.4 | 57.3%, 11 / 121 (1) | 210.6 | 28.9% (47.5%) | 14835 | 862 (5.8%) | 0.578 / 0.856 | 12 / 26 | 8 / 15 / 36 | 14.733 / 49.0 |
| 24 | 2 | 70.5% | 4 / 419 | 6 / 120 | 107 / 5 | 9.6 / 14.1 | 61.2%, 10 / 134 (0) | 200.7 | 28.4% (46.8%) | 15077 | 889 (5.9%) | 0.576 / 0.855 | 12 / 26 | 8 / 14 / 36 | 5.648 / 45.5 |
| 24 | 3 | 69.3% | 3 / 412 | 5 / 132 | 119 / 4 | 10.3 / 15.8 | 60.6%, 11 / 132 (0) | 214.8 | 29.1% (47.7%) | 14912 | 875 (5.9%) | 0.576 / 0.856 | 12 / 26 | 8 / 15 / 36 | 38.074 / 65.7 |

## table

| size | seed | TRACK | held lost | first confirmed | too-few-patches first / held | step p50 / p95 ms | scaled sched.: TRACK, held lost | µs per patch p50 | unconverged | right | refused by the gate | ZNCC of right p5 / p50 | right: iterations p50 / p95 | accepted fits: inliers min / p5 / p50 | jitter / spread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | 1 | 78.7% | 1 / 419 | 3 / 102 | 95 / 1 | 3.9 / 5.7 | 86.6%, 3 / 193 (1) | 81.7 | 25.0% (51.0%) | 15929 | 1181 (7.4%) | 0.528 / 0.875 | 8 / 21 | 10 / 30 / 35 | 1800.671 / 3565.9 |
| 16 | 2 | 79.4% | 1 / 423 | 3 / 99 | 94 / 1 | 3.7 / 5.6 | 87.7%, 5 / 198 (1) | 77.8 | 25.1% (51.1%) | 16062 | 1197 (7.5%) | 0.528 / 0.874 | 8 / 21 | 10 / 30 / 35 | 15.558 / 32.0 |
| 16 | 3 | 80.7% | 0 / 430 | 2 / 91 | 87 / 1 | 3.7 / 6.0 | 86.1%, 4 / 191 (1) | 79.0 | 25.6% (51.7%) | 16335 | 1245 (7.6%) | 0.525 / 0.873 | 8 / 21 | 15 / 30 / 35 | 18.558 / 45.9 |
| 12 | 1 | 77.9% | 2 / 415 | 4 / 109 | 99 / 1 | 2.4 / 3.8 | 78.6%, 6 / 172 (1) | 49.5 | 25.8% (50.3%) | 15164 | 2120 (14.0%) | 0.433 / 0.877 | 8 / 22 | 8 / 24 / 31 | 60.486 / 67.1 |
| 12 | 2 | 77.5% | 2 / 413 | 4 / 106 | 95 / 1 | 2.5 / 4.5 | 77.5%, 7 / 168 (1) | 52.9 | 26.2% (50.7%) | 15121 | 2114 (14.0%) | 0.434 / 0.877 | 8 / 22 | 8 / 24 / 31 | 31.585 / 43.5 |
| 12 | 3 | 77.7% | 1 / 414 | 3 / 107 | 99 / 1 | 2.4 / 3.3 | 80.8%, 7 / 180 (1) | 48.8 | 26.5% (51.0%) | 15156 | 2119 (14.0%) | 0.433 / 0.877 | 8 / 22 | 18 / 24 / 31 | 49.558 / 66.2 |
| 24 | 1 | 82.4% | 0 / 439 | 2 / 85 | 81 / 1 | 7.6 / 10.9 | 87.1%, 2 / 195 (1) | 162.3 | 15.9% (35.4%) | 18613 | 1151 (6.2%) | 0.581 / 0.850 | 9 / 22 | 10 / 34 / 39 | 3.793 / 29.2 |
| 24 | 2 | 82.4% | 0 / 439 | 2 / 83 | 80 / 1 | 7.6 / 11.3 | 87.2%, 3 / 196 (1) | 159.1 | 16.0% (35.5%) | 18613 | 1151 (6.2%) | 0.581 / 0.850 | 9 / 22 | 10 / 34 / 39 | 15.731 / 32.0 |
| 24 | 3 | 79.4% | 1 / 423 | 3 / 97 | 94 / 1 | 7.4 / 11.2 | 87.7%, 2 / 198 (1) | 161.4 | 18.3% (39.3%) | 17974 | 1071 (6.0%) | 0.584 / 0.853 | 9 / 22 | 14 / 35 / 40 | 18.694 / 46.1 |

## The run's source

`packages/nft-tracker/test/round3_sweep.test.ts`, run once with
`ROUND3_OUT=<file> npx vitest run test/round3_sweep.test.ts` from
`packages/nft-tracker`, and not committed as a test. The wrong fits' origins
above came from a variant of it that records, for each accepted wrong fit,
the render, the view and the prediction.

```ts
// TEMPORARY — tuning round 3's ground-truth run, not for commit. At the
// tracker's defaults, on four patch sets cut by selectPatches from the fixture
// image — M2's 64 of 16 × 16 at 54 px (the reference the method is checked
// against), and 48 at 62 px of 12 × 12, 16 × 16 (shipped) and 24 × 24 — it
// measures, against the known truth:
//   A. the state-machine suite's camera-path sequences, velocity steps
//      extended to 8 px/frame, with pose errors over the whole target, at its
//      far point and over the part in view;
//   B. the single-step suite's perturbation sweep (137 predictions × 2 views ×
//      5 renders): right fits, accepted wrong fits, refusals;
//   C. the alignment's basin per patch: alignPatch from a prediction shifted
//      1, 2, 3, 4, 6 px in 16 directions, on the same views and renders — the
//      share converging, converging within 0.5 px of the truth, and the ZNCC
//      of those right ones;
//   D. the patch set: levels, and the cells of an 8 × 8 grid over the target
//      holding a patch centre.
// Writes its results as JSON to ROUND3_OUT.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { TrackResult } from "../src/tracker.js";
import {
    alignPatch,
    buildFramePyramid,
    decode,
    DEFAULT_ALIGN_EPSILON,
    DEFAULT_ALIGN_MAX_ITERATIONS,
    DEFAULT_FIT_EPSILON,
    DEFAULT_FIT_MAX_ITERATIONS,
    DEFAULT_MAX_FIT_RMS,
    DEFAULT_MAX_FRAME_LEVELS,
    DEFAULT_MAX_OUTLIER_SHARE,
    DEFAULT_MIN_PATCH_ZNCC,
    DEFAULT_MIN_TRACKED_PATCHES,
    DEFAULT_PHOTOMETRIC,
    DEFAULT_TUKEY_C,
    selectPatches,
} from "../src/index.js";
import type { PatchTable, TargetDb } from "../src/index.js";
import { trackFrame, trackTarget } from "../src/tracking/track_frame.js";
import type { TrackFrameOptions, TrackTarget } from "../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches, pinballTrackingTarget } from "./fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";
import {
    mat3Mul,
    project,
    renderWarp,
    rotation,
    scaling,
    translation,
    view,
} from "./fixtures/warped_frames.js";

const OUT = process.env.ROUND3_OUT ?? "round3-sweep.json";
const CAMERA = { width: 270, height: 360 };
const SEED = 20260925;
const image = readPgm(TARGET_FIXTURE);
const TUNING = (name: string) =>
    fileURLToPath(new URL(`../../../examples/targets/tuning/${name}.wnft`, import.meta.url));

const OPTIONS: TrackFrameOptions = {
    maxFrameLevels: DEFAULT_MAX_FRAME_LEVELS,
    align: {
        maxIterations: DEFAULT_ALIGN_MAX_ITERATIONS,
        epsilon: DEFAULT_ALIGN_EPSILON,
        photometric: DEFAULT_PHOTOMETRIC,
    },
    fit: {
        maxIterations: DEFAULT_FIT_MAX_ITERATIONS,
        tukeyC: DEFAULT_TUKEY_C,
        epsilon: DEFAULT_FIT_EPSILON,
    },
    minTrackedPatches: DEFAULT_MIN_TRACKED_PATCHES,
    maxOutlierShare: DEFAULT_MAX_OUTLIER_SHARE,
    maxFitRms: DEFAULT_MAX_FIT_RMS,
    minPatchZncc: DEFAULT_MIN_PATCH_ZNCC,
};

// ---- Measuring points: the M2 fixture's 64 patch centres, for every set.
const measureAt = trackTarget(pinballPatches(), PINBALL_STEP).centres;
const inside = (x: number, y: number) =>
    x >= 0 && x <= CAMERA.width - 1 && y >= 0 && y <= CAMERA.height - 1;
function poseErrors(A: Mat3, truth: Mat3) {
    let s = 0;
    let max = 0;
    let vs = 0;
    let vn = 0;
    let vmax = 0;
    for (let i = 0; i < measureAt.length; i += 2) {
        const [ax, ay] = project(A, measureAt[i], measureAt[i + 1]);
        const [bx, by] = project(truth, measureAt[i], measureAt[i + 1]);
        const d = Math.hypot(ax - bx, ay - by);
        s += d * d;
        max = Math.max(max, d);
        if (inside(bx, by)) {
            vs += d * d;
            vn++;
            vmax = Math.max(vmax, d);
        }
    }
    return {
        rms: Math.sqrt(s / (measureAt.length / 2)),
        max,
        inViewRms: vn ? Math.sqrt(vs / vn) : 0,
        inViewMax: vmax,
    };
}

function patchSet(patchSize: number, maxPatches: number, minSpacing: number): PatchTable {
    const built = buildFramePyramid(image, { levels: 3, scaleStep: PINBALL_STEP });
    if (!built.ok) throw new Error(built.reason);
    const sel = selectPatches(built.pyramid, { patchSize, maxPatches, minScore: 25, minSpacing });
    if (!sel.ok) throw new Error(sel.reason);
    return sel.patches;
}
const SETS: { name: string; patches: () => PatchTable; compiled: string | null }[] = [
    { name: "M2: 64 of 16 at 54 px", patches: () => pinballPatches(), compiled: "p64-s16" },
    { name: "48 of 12 at 62 px", patches: () => patchSet(12, 48, 62), compiled: "p48-s12" },
    { name: "48 of 16 at 62 px (shipped)", patches: () => patchSet(16, 48, 62), compiled: "p48-s16" },
    { name: "48 of 24 at 62 px", patches: () => patchSet(24, 48, 62), compiled: "p48-s24" },
];

// ---- A. The sequences (as tracker_state_machine.test.ts builds them).
interface Pose {
    scale: number;
    angle: number;
    shift: [number, number];
    perspective?: [number, number];
}
function frameAt(pose: Pose, i: number): { frame: GrayImage; H: Mat3 } {
    const H = view({ target: image, frame: CAMERA, ...pose });
    const frame = renderWarp(image, H, {
        ...CAMERA,
        blurPasses: 1,
        noiseSigma: 2,
        gain: 1 + 0.08 * Math.sin(i / 5),
        bias: 6 * Math.sin(i / 7),
        seed: i + 1,
    });
    return { frame, H };
}
function wander(i: number): Pose {
    const c = (period: number) => 1 - Math.cos(i / period);
    return {
        scale: 0.45 + 0.03 * c(7),
        angle: ((5 * Math.PI) / 180) * c(11),
        shift: [10 * c(8), 8 * c(10)],
        perspective: [0.0003 * c(9), -0.0002 * c(13)],
    };
}
const smoothstep = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
};
function leaveAndReturn(i: number): Pose {
    const x =
        i < 10
            ? 0
            : i < 50
              ? 260 * smoothstep((i - 10) / 40)
              : i < 56
                ? 260
                : i < 96
                  ? 260 * (1 - smoothstep((i - 56) / 40))
                  : 0;
    return { scale: 0.45, angle: 0, shift: [x, 0] };
}
const velocityStep =
    (v: number) =>
    (i: number): Pose => ({ scale: 0.45, angle: 0, shift: [i < 5 ? 0 : v * (i - 4), 0] });
const SEQUENCES: { name: string; path: (i: number) => Pose; n: number }[] = [
    { name: "wander", path: wander, n: 40 },
    { name: "leave-and-return", path: leaveAndReturn, n: 106 },
    ...[2, 3, 4, 5, 6, 7, 8].map((v) => ({
        name: `velocity ${v} px/frame`,
        path: velocityStep(v),
        n: 15,
    })),
];

// ---- B and C: the single-step suite's views, on five renders.
const VIEWS: Mat3[] = [
    view({ target: image, frame: CAMERA, scale: 0.45 }),
    view({
        target: image,
        frame: CAMERA,
        scale: 0.45,
        angle: (15 * Math.PI) / 180,
        perspective: [0.0004, -0.0003],
    }),
];
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10 };
function about(E: Mat3, H: Mat3): Mat3 {
    const [cx, cy] = project(H, (image.width - 1) / 2, (image.height - 1) / 2);
    return mat3Mul(mat3Mul(translation(cx, cy), mat3Mul(E, translation(-cx, -cy))), H);
}
function perturbations(): Mat3[] {
    const deg = (a: number) => (a * Math.PI) / 180;
    const out: Mat3[] = [translation(0, 0)];
    for (const d of [1, 2, 3, 4, 5, 6, 8]) {
        for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8;
            out.push(translation(d * Math.cos(a), d * Math.sin(a)));
        }
    }
    for (const a of [1, 2, 3, 4, 5, 6]) out.push(rotation(deg(a)), rotation(deg(-a)));
    for (const f of [1.02, 1.04, 1.06, 1.08, 1.1, 1.12]) out.push(scaling(f), scaling(1 / f));
    return out;
}

const quantiles = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, min: s[0], p05: q(0.05), p25: q(0.25), p50: q(0.5), max: s[s.length - 1] };
};

let cv: CvBackend;
let K: Mat3;
let base: TargetDb;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    base = pinballTrackingTarget(cv);
});

describe("round 3 ground truth", () => {
    it("sequences, sweep, basin and coverage per patch size", () => {
        const results: unknown[] = [];
        const renders = [1, 2, 3, 4, 5].map((seed) =>
            VIEWS.map((H) => renderWarp(image, H, { ...RENDER, seed })),
        );
        for (const set of SETS) {
            const patches = set.patches();
            // The set is the compiled candidate's, patch for patch.
            let matchesCompiled: boolean | null = null;
            if (set.compiled) {
                const d = decode(new Uint8Array(readFileSync(TUNING(set.compiled))));
                if (!d.ok) throw new Error(`${set.compiled}: ${d.error}`);
                const c = d.target.patches!;
                matchesCompiled =
                    c.count === patches.count &&
                    c.patchSize === patches.patchSize &&
                    ["left", "top", "level", "pixels"].every((k) => {
                        const a = (c as unknown as Record<string, ArrayLike<number>>)[k];
                        const b = (patches as unknown as Record<string, ArrayLike<number>>)[k];
                        if (a.length !== b.length) return false;
                        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
                        return true;
                    });
            }
            const perLevel = [0, 0, 0];
            for (const l of patches.level) perLevel[l]++;
            const track: TrackTarget = trackTarget(patches, PINBALL_STEP);
            const cells = new Set<string>();
            for (let q = 0; q < patches.count; q++) {
                const x = track.centres[2 * q];
                const y = track.centres[2 * q + 1];
                cells.add(
                    `${Math.min(7, Math.floor((8 * x) / image.width))},${Math.min(7, Math.floor((8 * y) / image.height))}`,
                );
            }
            const target: TargetDb = { ...base, patches };

            // A.
            const sequences = SEQUENCES.map((seq) => {
                const tracker = new NftTracker(cv, target, K);
                const truths: Mat3[] = [];
                const { value: rs } = withSeededRandom(SEED, () =>
                    Array.from({ length: seq.n }, (_, i) => {
                        const { frame, H } = frameAt(seq.path(i), i);
                        truths.push(H);
                        return tracker.process(frame, i * 33);
                    }),
                );
                const states = rs.map((r: TrackResult) => r.state[0]).join("");
                const tracked = rs.flatMap((r, i) =>
                    r.state === "TRACK" && r.H
                        ? [{ i, e: poseErrors(r.H, truths[i]), inl: r.tracking!.inliers }]
                        : [],
                );
                const lastTrackBeforeLoss = seq.name === "leave-and-return"
                    ? rs.findIndex((r, i) => i > 10 && r.state !== "TRACK") - 1
                    : null;
                return {
                    sequence: seq.name,
                    states,
                    track: tracked.length,
                    lastTrackBeforeLoss,
                    rmsMax: tracked.length ? Math.max(...tracked.map((t) => t.e.rms)) : null,
                    farMax: tracked.length ? Math.max(...tracked.map((t) => t.e.max)) : null,
                    inViewRmsMax: tracked.length ? Math.max(...tracked.map((t) => t.e.inViewRms)) : null,
                    inViewMax: tracked.length ? Math.max(...tracked.map((t) => t.e.inViewMax)) : null,
                    over1_5: tracked.filter((t) => t.e.rms > 1.5).map((t) => t.i),
                    minInliers: tracked.length ? Math.min(...tracked.map((t) => t.inl)) : null,
                };
            });

            // B.
            const errs = perturbations();
            let right = 0;
            const wrong: number[] = [];
            const losses: Record<string, number> = {};
            const kinds = { translation: [0, 0], roll: [0, 0], scale: [0, 0] };
            for (const frames of renders) {
                VIEWS.forEach((H, v) => {
                    errs.forEach((E, k) => {
                        const kind = k <= 112 ? "translation" : k <= 124 ? "roll" : "scale";
                        kinds[kind][1]++;
                        const r = trackFrame(frames[v], track, null, about(E, H), OPTIONS, null);
                        if (!r.ok) {
                            losses[r.loss] = (losses[r.loss] ?? 0) + 1;
                            return;
                        }
                        const e = poseErrors(r.H, H).rms;
                        if (e < 0.5) {
                            right++;
                            kinds[kind][0]++;
                        } else wrong.push(+e.toFixed(3));
                    });
                });
            }

            // C. The basin, per patch.
            const offsets = [1, 2, 3, 4, 6];
            const basin = offsets.map((d) => ({ d, attempts: 0, converged: 0, right: 0 }));
            const rightZncc: number[] = [];
            const P = patches.patchSize;
            const half = (P - 1) / 2;
            for (const frames of renders) {
                VIEWS.forEach((H, v) => {
                    const built = buildFramePyramid(frames[v], {
                        levels: DEFAULT_MAX_FRAME_LEVELS,
                        scaleStep: PINBALL_STEP,
                    });
                    if (!built.ok) throw new Error(built.reason);
                    for (let q = 0; q < patches.count; q++) {
                        const s = Math.pow(PINBALL_STEP, -patches.level[q]);
                        const [tx, ty] = project(
                            H,
                            (patches.left[q] + half) / s,
                            (patches.top[q] + half) / s,
                        );
                        basin.forEach((b) => {
                            for (let k = 0; k < 16; k++) {
                                const a = (k * Math.PI) / 8;
                                const dx = b.d * Math.cos(a);
                                const dy = b.d * Math.sin(a);
                                const pred = mat3Mul(translation(dx, dy), H);
                                const r = alignPatch(built.pyramid, patches, q, PINBALL_STEP, pred, OPTIONS.align);
                                if (!r.ok && r.reason === "outside-frame") continue;
                                b.attempts++;
                                if (!r.ok) continue;
                                const o = r.observation;
                                if (!o.converged) continue;
                                b.converged++;
                                if (Math.hypot(o.x - tx, o.y - ty) < 0.5) {
                                    b.right++;
                                    if (b.d <= 2) {
                                        const c = o.residual / (o.gain * track.patchSpreads[q]);
                                        rightZncc.push(1 / Math.sqrt(1 + c * c));
                                    }
                                }
                            }
                        });
                    }
                });
            }

            results.push({
                set: set.name,
                count: patches.count,
                patchSize: P,
                perLevel,
                gridCells: cells.size,
                matchesCompiled,
                sequences,
                sweep: {
                    steps: errs.length * VIEWS.length * renders.length,
                    right,
                    wrong: wrong.length,
                    wrongErrors: wrong,
                    rightByKind: kinds,
                    losses,
                },
                basin: basin.map((b) => ({
                    d: b.d,
                    attempts: b.attempts,
                    converged: +(b.converged / b.attempts).toFixed(3),
                    right: +(b.right / b.attempts).toFixed(3),
                })),
                rightZnccNear: quantiles(rightZncc),
                rightZnccUnderGate: rightZncc.filter((z) => z < DEFAULT_MIN_PATCH_ZNCC).length,
            });
        }
        writeFileSync(OUT, JSON.stringify(results, null, 2));
    }, 3_600_000);
});
```
