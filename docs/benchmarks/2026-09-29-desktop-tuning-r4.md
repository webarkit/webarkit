# 2026-09-29 — tuning round 4 on the desktop: `minTrackedPatches`

Round 4's desktop evidence ([`README.md`](./README.md), "2026-09-28 — M3: the
tuning pass", round 4 as amended), committed as tabulated. Two parts:

1. **Ground truth**, where it is known: the tracker's synthetic camera-path
   sequences (`tracker_state_machine.test.ts`'s wander, leave-and-return and
   velocity steps) and its single-step perturbation sweep
   (`track_frame.test.ts`'s 137 predictions — translations to 8 px in 16
   directions, roll to ±6°, scale to ±12% — on its two views, here on five
   renders, 1,370 steps), at minimums 8, 7 and 6, on three patch sets cut by
   `selectPatches` from the fixture image: M2's 64 at 54 px, the adopted 48
   at 62 px (47 of level 0 and one of level 1, as the committed target) and
   round 2's rejected 32 at 76 px. Every accepted pose is measured against the
   truth at M2's 64 patch centres, the suite's own measure; "in view" keeps
   the centres the truth puts inside the frame. The run's source is at the
   end of this file.
2. **The bundled clips**, replayed:
   `node scripts/replay-clips.mjs --seed <1|2|3> --tracking-only --target <48 or 32> --options minTrackedPatches:<8|7|6> --out <dir>`,
   18 runs interleaved per seed. Timings compare within this session only,
   and were taken while the ground-truth run shared the machine for part of
   it; the counts and poses are deterministic under a seed.

## Ground truth: the perturbation sweep

A fit is **right** within 0.5 px RMS of the truth, **wrong** when accepted
further off: the suite's own classification. "Refused" steps end in a loss.

| patch set | min | right | wrong accepted (max error) | fits accepted on fewer than 8 inliers, and their errors | refused, by reason |
|---|---|---|---|---|---|
| 64 at 54 px (M2) | 8 | 787 | 24 (9.4 px) | 0 | fit-failed 385, too-many-outliers 18, too-few-patches 142, poor-fit 14 |
| 64 at 54 px (M2) | 7 | 787 | 30 (9.636 px) | 6: 7.401 px (7), 9.636 px (7), 7.869 px (7), 1.179 px (7), 1.227 px (7), 1.353 px (7) | fit-failed 414, too-many-outliers 18, too-few-patches 101, poor-fit 20 |
| 64 at 54 px (M2) | 6 | 787 | 31 (10.813 px) | 7: 7.401 px (7), 9.636 px (7), 7.869 px (7), 1.179 px (7), 10.813 px (6), 1.227 px (7), 1.353 px (7) | fit-failed 442, too-many-outliers 18, too-few-patches 56, poor-fit 36 |
| 48 at 62 px (adopted) | 8 | 788 | 0 | 0 | fit-failed 402, too-many-outliers 18, too-few-patches 132, poor-fit 30 |
| 48 at 62 px (adopted) | 7 | 788 | 1 (1.175 px) | 1: 1.175 px (7) | fit-failed 430, too-many-outliers 18, too-few-patches 102, poor-fit 31 |
| 48 at 62 px (adopted) | 6 | 788 | 4 (17.463 px) | 4: 17.463 px (6), 1.175 px (7), 1.342 px (6), 1.134 px (6) | fit-failed 462, too-many-outliers 18, too-few-patches 56, poor-fit 42 |
| 32 at 76 px (round 2's rejected) | 8 | 753 | 0 | 0 | too-many-outliers 49, fit-failed 265, too-few-patches 300, poor-fit 3 |
| 32 at 76 px (round 2's rejected) | 7 | 753 | 0 | 0 | too-many-outliers 49, fit-failed 335, too-few-patches 222, poor-fit 11 |
| 32 at 76 px (round 2's rejected) | 6 | 753 | 1 (11.487 px) | 1: 11.487 px (6) | too-many-outliers 49, fit-failed 395, too-few-patches 161, poor-fit 11 |

## Ground truth: the sequences

| patch set | min | sequence | states | TRACK frames | error max, RMS / worst point (px) | TRACK frames over 1.5 px RMS | fits on fewer than 8 inliers |
|---|---|---|---|---|---|---|---|
| 64 at 54 px (M2) | 8 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.10 / 0.19 | 0 | — |
| 64 at 54 px (M2) | 8 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 51 | 1.20 / 2.49 | 0 | — |
| 64 at 54 px (M2) | 8 | velocity 5 px/frame | `DTTTTDDTTTTTTTT` | 12 | 0.09 / 0.20 | 0 | — |
| 64 at 54 px (M2) | 7 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.10 / 0.19 | 0 | — |
| 64 at 54 px (M2) | 7 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 52 | 1.20 / 2.49 | 0 | f39: 7 inliers, 0.658 / 1.626 px |
| 64 at 54 px (M2) | 7 | velocity 5 px/frame | `DTTTTDDTTTTTTTT` | 12 | 0.09 / 0.20 | 0 | — |
| 64 at 54 px (M2) | 6 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.10 / 0.19 | 0 | — |
| 64 at 54 px (M2) | 6 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 52 | 1.20 / 2.49 | 0 | f39: 7 inliers, 0.658 / 1.626 px |
| 64 at 54 px (M2) | 6 | velocity 5 px/frame | `DTTTTDDTTTTTTTT` | 12 | 0.09 / 0.20 | 0 | — |
| 48 at 62 px (adopted) | 8 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.11 / 0.35 | 0 | — |
| 48 at 62 px (adopted) | 8 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 51 | 3.37 / 8.24 | 3 | — |
| 48 at 62 px (adopted) | 8 | velocity 5 px/frame | `DTTTTDDDDDDDDDD` | 4 | 0.09 / 0.24 | 0 | — |
| 48 at 62 px (adopted) | 7 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.11 / 0.35 | 0 | — |
| 48 at 62 px (adopted) | 7 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 51 | 3.37 / 8.24 | 3 | — |
| 48 at 62 px (adopted) | 7 | velocity 5 px/frame | `DTTTTDDDDDDDDDD` | 4 | 0.09 / 0.24 | 0 | — |
| 48 at 62 px (adopted) | 6 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.11 / 0.35 | 0 | — |
| 48 at 62 px (adopted) | 6 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 51 | 3.37 / 8.24 | 3 | — |
| 48 at 62 px (adopted) | 6 | velocity 5 px/frame | `DTTTTDDDDDDDDDD` | 4 | 0.09 / 0.24 | 0 | — |
| 32 at 76 px (round 2's rejected) | 8 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.12 / 0.33 | 0 | — |
| 32 at 76 px (round 2's rejected) | 8 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 48 | 1.38 / 3.41 | 0 | — |
| 32 at 76 px (round 2's rejected) | 8 | velocity 5 px/frame | `DTTTTDDTTDDDDDD` | 6 | 9.07 / 20.55 | 1 | — |
| 32 at 76 px (round 2's rejected) | 7 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.12 / 0.33 | 0 | — |
| 32 at 76 px (round 2's rejected) | 7 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 51 | 3.09 / 8.74 | 3 | f36: 7 inliers, 2.782 / 7.977 px; f37: 7 inliers, 3.086 / 8.744 px; f38: 7 inliers, 3.004 / 8.394 px |
| 32 at 76 px (round 2's rejected) | 7 | velocity 5 px/frame | `DTTTTDDTTDDDDDD` | 6 | 9.07 / 20.55 | 1 | — |
| 32 at 76 px (round 2's rejected) | 6 | wander | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 39 | 0.12 / 0.33 | 0 | — |
| 32 at 76 px (round 2's rejected) | 6 | leave-and-return | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 51 | 3.09 / 8.74 | 3 | f36: 7 inliers, 2.782 / 7.977 px; f37: 7 inliers, 3.086 / 8.744 px; f38: 7 inliers, 3.004 / 8.394 px |
| 32 at 76 px (round 2's rejected) | 6 | velocity 5 px/frame | `DTTTTDDTTDDDDDD` | 6 | 9.07 / 20.55 | 1 | — |

The frames behind the leave-and-return and velocity-5 errors (frame, state,
patches attempted, culled, observed, inliers, then the pose's error over all
64 points and over those in view):

```text
64 at 54 px (M2) min 8 leave-and-return f 35 TRACK att 23 cul 41 obs 19 inl 19 err rms 0.40 max 0.83 | in view (23/64 points): rms 0.11 max 0.21
64 at 54 px (M2) min 8 leave-and-return f 36 TRACK att 18 cul 46 obs 14 inl 14 err rms 0.90 max 2.02 | in view (20/64 points): rms 0.12 max 0.22
64 at 54 px (M2) min 8 leave-and-return f 37 TRACK att 17 cul 47 obs 13 inl 13 err rms 0.66 max 1.50 | in view (17/64 points): rms 0.10 max 0.21
64 at 54 px (M2) min 8 leave-and-return f 38 TRACK att 14 cul 50 obs 10 inl 10 err rms 1.20 max 2.49 | in view (16/64 points): rms 0.24 max 0.45
64 at 54 px (M2) min 8 leave-and-return f 39 DETECT too-few-patches att 11 cul 53 obs 7 inl 0 err rms 193.71 max 723.91 | in view (12/64 points): rms 279.14 max 723.91
64 at 54 px (M2) min 8 velocity 5 px/frame f 7 TRACK att 64 cul 0 obs 21 inl 20 err rms 0.08 max 0.16 | in view (64/64 points): rms 0.08 max 0.16
64 at 54 px (M2) min 7 leave-and-return f 35 TRACK att 23 cul 41 obs 19 inl 19 err rms 0.40 max 0.83 | in view (23/64 points): rms 0.11 max 0.21
64 at 54 px (M2) min 7 leave-and-return f 36 TRACK att 18 cul 46 obs 14 inl 14 err rms 0.90 max 2.02 | in view (20/64 points): rms 0.12 max 0.22
64 at 54 px (M2) min 7 leave-and-return f 37 TRACK att 17 cul 47 obs 13 inl 13 err rms 0.66 max 1.50 | in view (17/64 points): rms 0.10 max 0.21
64 at 54 px (M2) min 7 leave-and-return f 38 TRACK att 14 cul 50 obs 10 inl 10 err rms 1.20 max 2.49 | in view (16/64 points): rms 0.24 max 0.45
64 at 54 px (M2) min 7 leave-and-return f 39 TRACK att 11 cul 53 obs 7 inl 7 err rms 0.66 max 1.63 | in view (12/64 points): rms 0.15 max 0.30
64 at 54 px (M2) min 7 velocity 5 px/frame f 7 TRACK att 64 cul 0 obs 21 inl 20 err rms 0.08 max 0.16 | in view (64/64 points): rms 0.08 max 0.16
48 at 62 px (adopted) min 8 leave-and-return f 35 TRACK att 18 cul 30 obs 14 inl 14 err rms 0.55 max 1.62 | in view (23/64 points): rms 0.18 max 0.34
48 at 62 px (adopted) min 8 leave-and-return f 36 TRACK att 14 cul 34 obs 11 inl 11 err rms 3.01 max 7.37 | in view (20/64 points): rms 0.34 max 0.72
48 at 62 px (adopted) min 8 leave-and-return f 37 TRACK att 13 cul 35 obs 10 inl 10 err rms 3.37 max 8.24 | in view (17/64 points): rms 0.36 max 0.71
48 at 62 px (adopted) min 8 leave-and-return f 38 TRACK att 12 cul 36 obs 9 inl 9 err rms 3.25 max 7.65 | in view (16/64 points): rms 0.34 max 0.65
48 at 62 px (adopted) min 8 leave-and-return f 39 DETECT too-few-patches att 8 cul 40 obs 5 inl 0 err rms 193.71 max 723.91 | in view (12/64 points): rms 279.14 max 723.91
48 at 62 px (adopted) min 8 velocity 5 px/frame f 7 DETECT too-many-outliers att 48 cul 0 obs 17 inl 4 err rms 0.95 max 1.54 | in view (64/64 points): rms 0.95 max 1.54
48 at 62 px (adopted) min 7 leave-and-return f 35 TRACK att 18 cul 30 obs 14 inl 14 err rms 0.55 max 1.62 | in view (23/64 points): rms 0.18 max 0.34
48 at 62 px (adopted) min 7 leave-and-return f 36 TRACK att 14 cul 34 obs 11 inl 11 err rms 3.01 max 7.37 | in view (20/64 points): rms 0.34 max 0.72
48 at 62 px (adopted) min 7 leave-and-return f 37 TRACK att 13 cul 35 obs 10 inl 10 err rms 3.37 max 8.24 | in view (17/64 points): rms 0.36 max 0.71
48 at 62 px (adopted) min 7 leave-and-return f 38 TRACK att 12 cul 36 obs 9 inl 9 err rms 3.25 max 7.65 | in view (16/64 points): rms 0.34 max 0.65
48 at 62 px (adopted) min 7 leave-and-return f 39 DETECT too-few-patches att 8 cul 40 obs 5 inl 0 err rms 193.71 max 723.91 | in view (12/64 points): rms 279.14 max 723.91
48 at 62 px (adopted) min 7 velocity 5 px/frame f 7 DETECT too-many-outliers att 48 cul 0 obs 17 inl 4 err rms 0.95 max 1.54 | in view (64/64 points): rms 0.95 max 1.54
32 at 76 px (round 2's rejected) min 8 leave-and-return f 35 TRACK att 11 cul 21 obs 9 inl 9 err rms 0.97 max 2.37 | in view (23/64 points): rms 0.49 max 1.48
32 at 76 px (round 2's rejected) min 8 leave-and-return f 36 DETECT too-few-patches att 9 cul 23 obs 7 inl 0 err rms 57.79 max 126.65 | in view (20/64 points): rms 24.88 max 70.92
32 at 76 px (round 2's rejected) min 8 leave-and-return f 37 DETECT too-few-patches att 9 cul 23 obs 0 inl 0 err rms 440.64 max 2733.43 | in view (17/64 points): rms 24.29 max 60.18
32 at 76 px (round 2's rejected) min 8 leave-and-return f 38 DETECT too-few-patches att 9 cul 23 obs 0 inl 0 err rms 2156.23 max 15286.68 | in view (16/64 points): rms 200.36 max 438.70
32 at 76 px (round 2's rejected) min 8 leave-and-return f 39 DETECT too-few-patches att 17 cul 15 obs 0 inl 0 err rms 262.62 max 933.50 | in view (12/64 points): rms 350.49 max 933.50
32 at 76 px (round 2's rejected) min 8 velocity 5 px/frame f 7 TRACK att 32 cul 0 obs 14 inl 10 err rms 9.07 max 20.55 | in view (64/64 points): rms 9.07 max 20.55
32 at 76 px (round 2's rejected) min 7 leave-and-return f 35 TRACK att 11 cul 21 obs 9 inl 9 err rms 0.97 max 2.37 | in view (23/64 points): rms 0.49 max 1.48
32 at 76 px (round 2's rejected) min 7 leave-and-return f 36 TRACK att 9 cul 23 obs 7 inl 7 err rms 2.78 max 7.98 | in view (20/64 points): rms 1.07 max 2.60
32 at 76 px (round 2's rejected) min 7 leave-and-return f 37 TRACK att 9 cul 23 obs 7 inl 7 err rms 3.09 max 8.74 | in view (17/64 points): rms 1.21 max 2.75
32 at 76 px (round 2's rejected) min 7 leave-and-return f 38 TRACK att 9 cul 23 obs 7 inl 7 err rms 3.00 max 8.39 | in view (16/64 points): rms 1.18 max 2.59
32 at 76 px (round 2's rejected) min 7 leave-and-return f 39 DETECT too-few-patches att 5 cul 27 obs 3 inl 0 err rms 193.71 max 723.91 | in view (12/64 points): rms 279.14 max 723.91
32 at 76 px (round 2's rejected) min 7 velocity 5 px/frame f 7 TRACK att 32 cul 0 obs 14 inl 10 err rms 9.07 max 20.55 | in view (64/64 points): rms 9.07 max 20.55
```

## The bundled clips

Per clip, target, minimum and seed, every-frame schedule. "Admitted vs min 8"
takes every frame this run tracks and the same seed's minimum-8 run does not:
their number; where that run returned a detection instead, how far apart the
two poses' corners are (p50 / max, px, over how many); and how many had no
pose to compare with. "Both TRACK" is the corner gap where both runs tracked.
`jitter / spread` pool DETECT poses too, so on the moving clips they follow
the detections, as M2's plan warns.

## static

| target | min | seed | TRACK | held lost | first confirmed | step p50 / p95 | right | refused | accepted fits: inliers min / p5 / p25 / p50 | fits on 6 / 7 inliers | admitted vs min 8: frames, vs its DETECT: p50 / max gap px, with no pose there | both TRACK: gap p99 / max px | jitter / spread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 48 | 8 | 1 | 99.9% | 0 / 724 | 1 / 1 | 3.6 / 5.4 | 30697 | 1347 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | — | — | 0.131 / 0.9 |
| 48 | 8 | 2 | 99.9% | 0 / 724 | 1 / 1 | 3.5 / 5.5 | 30697 | 1347 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | — | — | 0.131 / 0.9 |
| 48 | 8 | 3 | 99.9% | 0 / 724 | 1 / 1 | 3.2 / 4.7 | 30696 | 1346 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | — | — | 0.131 / 0.9 |
| 48 | 7 | 1 | 99.9% | 0 / 724 | 1 / 1 | 3.6 / 5.6 | 30697 | 1347 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.131 / 0.9 |
| 48 | 7 | 2 | 99.9% | 0 / 724 | 1 / 1 | 3.6 / 6.1 | 30697 | 1347 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.131 / 0.9 |
| 48 | 7 | 3 | 99.9% | 0 / 724 | 1 / 1 | 3.2 / 5.0 | 30696 | 1346 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.131 / 0.9 |
| 48 | 6 | 1 | 99.9% | 0 / 724 | 1 / 1 | 3.4 / 5.0 | 30697 | 1347 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.131 / 0.9 |
| 48 | 6 | 2 | 99.9% | 0 / 724 | 1 / 1 | 3.2 / 4.6 | 30697 | 1347 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.131 / 0.9 |
| 48 | 6 | 3 | 99.9% | 0 / 724 | 1 / 1 | 3.2 / 4.6 | 30696 | 1346 (4.4%) | 26 / 39 / 40 / 41 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.131 / 0.9 |
| 32 | 8 | 1 | 99.9% | 0 / 724 | 1 / 1 | 2.1 / 3.4 | 21661 | 2121 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | — | — | 0.135 / 0.9 |
| 32 | 8 | 2 | 99.9% | 0 / 724 | 1 / 1 | 2.3 / 3.8 | 21661 | 2121 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | — | — | 0.136 / 0.9 |
| 32 | 8 | 3 | 99.9% | 0 / 724 | 1 / 1 | 2.1 / 3.0 | 21660 | 2120 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | — | — | 0.135 / 0.9 |
| 32 | 7 | 1 | 99.9% | 0 / 724 | 1 / 1 | 2.2 / 3.7 | 21661 | 2121 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.135 / 0.9 |
| 32 | 7 | 2 | 99.9% | 0 / 724 | 1 / 1 | 2.3 / 3.6 | 21661 | 2121 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.136 / 0.9 |
| 32 | 7 | 3 | 99.9% | 0 / 724 | 1 / 1 | 2.0 / 2.8 | 21660 | 2120 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.135 / 0.9 |
| 32 | 6 | 1 | 99.9% | 0 / 724 | 1 / 1 | 2.3 / 4.0 | 21661 | 2121 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.135 / 0.9 |
| 32 | 6 | 2 | 99.9% | 0 / 724 | 1 / 1 | 2.2 / 4.1 | 21661 | 2121 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.136 / 0.9 |
| 32 | 6 | 3 | 99.9% | 0 / 724 | 1 / 1 | 2.2 / 3.7 | 21660 | 2120 (9.8%) | 15 / 26 / 27 / 27 | 0 / 0 of 725 | 0: — / — (0), 0 | 0.0 / 0.0 | 0.135 / 0.9 |

## wall

| target | min | seed | TRACK | held lost | first confirmed | step p50 / p95 | right | refused | accepted fits: inliers min / p5 / p25 / p50 | fits on 6 / 7 inliers | admitted vs min 8: frames, vs its DETECT: p50 / max gap px, with no pose there | both TRACK: gap p99 / max px | jitter / spread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 48 | 8 | 1 | 67.6% | 6 / 402 | 8 / 146 | 5.6 / 8.5 | 13190 | 806 (6.1%) | 8 / 15 / 28 / 32 | 0 / 0 of 403 | — | — | 15.092 / 48.8 |
| 48 | 8 | 2 | 68.1% | 6 / 405 | 8 / 138 | 5.0 / 7.8 | 13264 | 816 (6.2%) | 8 / 16 / 28 / 32 | 0 / 0 of 406 | — | — | 15.359 / 47.8 |
| 48 | 8 | 3 | 68.1% | 6 / 405 | 8 / 137 | 5.0 / 7.3 | 13236 | 814 (6.1%) | 8 / 15 / 27 / 32 | 0 / 0 of 406 | — | — | 38.205 / 64.6 |
| 48 | 7 | 1 | 68.8% | 6 / 409 | 8 / 139 | 5.0 / 8.4 | 13283 | 822 (6.2%) | 7 / 14 / 27 / 32 | 0 / 2 of 410 | 7: 3.7 / 29.9 (7), 0 | 1.0 / 2.1 | 17.785 / 50.4 |
| 48 | 7 | 2 | 68.5% | 6 / 407 | 8 / 132 | 4.9 / 7.1 | 13273 | 819 (6.2%) | 7 / 15 / 27 / 32 | 0 / 1 of 408 | 2: 3.4 / 3.4 (2), 0 | 0.5 / 7.9 | 15.361 / 47.9 |
| 48 | 7 | 3 | 68.8% | 6 / 409 | 8 / 138 | 4.5 / 6.2 | 13279 | 816 (6.1%) | 7 / 14 / 27 / 32 | 0 / 2 of 410 | 4: 3.3 / 3.5 (4), 0 | 1.1 / 1.7 | 15.427 / 48.2 |
| 48 | 6 | 1 | 68.8% | 6 / 409 | 8 / 139 | 4.8 / 7.5 | 13283 | 822 (6.2%) | 7 / 14 / 27 / 32 | 0 / 2 of 410 | 7: 3.7 / 29.9 (7), 0 | 1.0 / 2.1 | 17.785 / 50.4 |
| 48 | 6 | 2 | 68.8% | 6 / 409 | 8 / 130 | 5.1 / 8.3 | 13282 | 818 (6.2%) | 6 / 14 / 27 / 32 | 1 / 1 of 410 | 4: 3.4 / 4.1 (4), 0 | 0.5 / 7.9 | 15.361 / 47.9 |
| 48 | 6 | 3 | 68.8% | 6 / 409 | 8 / 138 | 4.8 / 7.2 | 13279 | 816 (6.1%) | 7 / 14 / 27 / 32 | 0 / 2 of 410 | 4: 3.3 / 3.5 (4), 0 | 1.1 / 1.7 | 15.427 / 48.2 |
| 32 | 8 | 1 | 67.3% | 4 / 400 | 6 / 147 | 3.3 / 4.8 | 9452 | 1015 (10.7%) | 8 / 11 / 19 / 22 | 0 / 0 of 401 | — | — | 14.743 / 48.9 |
| 32 | 8 | 2 | 67.3% | 4 / 400 | 6 / 145 | 3.2 / 4.9 | 9454 | 1017 (10.8%) | 8 / 11 / 19 / 22 | 0 / 0 of 401 | — | — | 26.900 / 53.9 |
| 32 | 8 | 3 | 66.9% | 5 / 398 | 7 / 150 | 3.1 / 4.5 | 9428 | 1016 (10.8%) | 8 / 11 / 19 / 22 | 0 / 0 of 399 | — | — | 14.676 / 47.8 |
| 32 | 7 | 1 | 67.4% | 4 / 401 | 6 / 146 | 3.5 / 9.1 | 9468 | 1020 (10.8%) | 7 / 11 / 19 / 22 | 0 / 1 of 402 | 1: 1.4 / 1.4 (1), 0 | 0.0 / 1.6 | 14.743 / 48.9 |
| 32 | 7 | 2 | 67.4% | 4 / 401 | 6 / 143 | 3.5 / 5.3 | 9470 | 1019 (10.8%) | 7 / 11 / 19 / 22 | 0 / 1 of 402 | 1: 2.3 / 2.3 (1), 0 | 0.0 / 2.0 | 26.900 / 53.9 |
| 32 | 7 | 3 | 67.4% | 4 / 401 | 6 / 143 | 3.1 / 4.4 | 9471 | 1019 (10.8%) | 7 / 11 / 19 / 22 | 0 / 1 of 402 | 3: 6.6 / 7.2 (3), 0 | 0.8 / 5.0 | 18.861 / 49.6 |
| 32 | 6 | 1 | 67.6% | 4 / 402 | 6 / 147 | 3.4 / 5.6 | 9469 | 1022 (10.8%) | 6 / 11 / 19 / 22 | 2 / 2 of 403 | 3: 4.5 / 5.1 (3), 0 | 1.0 / 1.5 | 14.742 / 48.7 |
| 32 | 6 | 2 | 67.8% | 4 / 403 | 6 / 140 | 3.0 / 4.6 | 9483 | 1020 (10.8%) | 6 / 11 / 19 / 22 | 2 / 0 of 404 | 3: 4.5 / 5.6 (3), 0 | 0.0 / 2.3 | 15.041 / 47.8 |
| 32 | 6 | 3 | 67.8% | 4 / 403 | 6 / 142 | 3.2 / 4.8 | 9502 | 1029 (10.8%) | 6 / 11 / 19 / 22 | 2 / 1 of 404 | 5: 4.5 / 7.0 (5), 0 | 0.5 / 5.6 | 15.024 / 48.1 |

## table

| target | min | seed | TRACK | held lost | first confirmed | step p50 / p95 | right | refused | accepted fits: inliers min / p5 / p25 / p50 | fits on 6 / 7 inliers | admitted vs min 8: frames, vs its DETECT: p50 / max gap px, with no pose there | both TRACK: gap p99 / max px | jitter / spread |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 48 | 8 | 1 | 78.7% | 1 / 419 | 3 / 102 | 4.3 / 7.4 | 15929 | 1181 (7.4%) | 10 / 30 / 33 / 35 | 0 / 0 of 420 | — | — | 1800.671 / 3565.9 |
| 48 | 8 | 2 | 79.4% | 1 / 423 | 3 / 99 | 3.9 / 5.6 | 16062 | 1197 (7.5%) | 10 / 30 / 33 / 35 | 0 / 0 of 424 | — | — | 15.558 / 32.0 |
| 48 | 8 | 3 | 80.7% | 0 / 430 | 2 / 91 | 3.9 / 5.8 | 16335 | 1245 (7.6%) | 15 / 30 / 33 / 35 | 0 / 0 of 431 | — | — | 18.558 / 45.9 |
| 48 | 7 | 1 | 78.7% | 1 / 419 | 3 / 102 | 3.9 / 5.7 | 15929 | 1181 (7.4%) | 10 / 30 / 33 / 35 | 0 / 0 of 420 | 0: — / — (0), 0 | 0.0 / 0.0 | 1800.671 / 3565.9 |
| 48 | 7 | 2 | 79.4% | 1 / 423 | 3 / 99 | 4.2 / 6.9 | 16062 | 1197 (7.5%) | 10 / 30 / 33 / 35 | 0 / 0 of 424 | 0: — / — (0), 0 | 0.0 / 0.0 | 15.558 / 32.0 |
| 48 | 7 | 3 | 80.7% | 0 / 430 | 2 / 91 | 3.8 / 5.4 | 16335 | 1245 (7.6%) | 15 / 30 / 33 / 35 | 0 / 0 of 431 | 0: — / — (0), 0 | 0.0 / 0.0 | 18.558 / 45.9 |
| 48 | 6 | 1 | 78.7% | 1 / 419 | 3 / 102 | 4.2 / 5.7 | 15929 | 1181 (7.4%) | 10 / 30 / 33 / 35 | 0 / 0 of 420 | 0: — / — (0), 0 | 0.0 / 0.0 | 1800.671 / 3565.9 |
| 48 | 6 | 2 | 79.4% | 1 / 423 | 3 / 103 | 4.4 / 7.2 | 16057 | 1196 (7.4%) | 6 / 30 / 33 / 35 | 1 / 0 of 424 | 1: — / — (0), 1 | 0.0 / 0.0 | 98.676 / 127.8 |
| 48 | 6 | 3 | 80.7% | 0 / 430 | 2 / 91 | 3.8 / 5.2 | 16335 | 1245 (7.6%) | 15 / 30 / 33 / 35 | 0 / 0 of 431 | 0: — / — (0), 0 | 0.0 / 0.0 | 18.558 / 45.9 |
| 32 | 8 | 1 | 82.4% | 0 / 439 | 2 / 85 | 2.4 / 3.4 | 12127 | 1911 (15.8%) | 8 / 20 / 22 / 23 | 0 / 0 of 440 | — | — | 3.792 / 29.2 |
| 32 | 8 | 2 | 82.4% | 0 / 439 | 2 / 83 | 2.6 / 3.6 | 12127 | 1911 (15.8%) | 8 / 20 / 22 / 23 | 0 / 0 of 440 | — | — | 15.733 / 32.0 |
| 32 | 8 | 3 | 80.5% | 0 / 429 | 2 / 91 | 2.5 / 3.5 | 11859 | 1849 (15.6%) | 8 / 20 / 22 / 23 | 0 / 0 of 430 | — | — | 24081.808 / 25999.9 |
| 32 | 7 | 1 | 82.4% | 0 / 439 | 2 / 85 | 2.6 / 3.8 | 12127 | 1911 (15.8%) | 8 / 20 / 22 / 23 | 0 / 0 of 440 | 0: — / — (0), 0 | 0.0 / 0.0 | 3.792 / 29.2 |
| 32 | 7 | 2 | 82.4% | 0 / 439 | 2 / 83 | 2.7 / 4.5 | 12127 | 1911 (15.8%) | 8 / 20 / 22 / 23 | 0 / 0 of 440 | 0: — / — (0), 0 | 0.0 / 0.0 | 15.733 / 32.0 |
| 32 | 7 | 3 | 80.5% | 0 / 429 | 2 / 91 | 2.7 / 3.9 | 11859 | 1849 (15.6%) | 8 / 20 / 22 / 23 | 0 / 0 of 430 | 0: — / — (0), 0 | 0.0 / 0.0 | 24081.808 / 25999.9 |
| 32 | 6 | 1 | 82.4% | 0 / 439 | 2 / 85 | 2.4 / 3.5 | 12127 | 1911 (15.8%) | 8 / 20 / 22 / 23 | 0 / 0 of 440 | 0: — / — (0), 0 | 0.0 / 0.0 | 3.792 / 29.2 |
| 32 | 6 | 2 | 82.4% | 0 / 439 | 2 / 83 | 2.5 / 3.6 | 12127 | 1911 (15.8%) | 8 / 20 / 22 / 23 | 0 / 0 of 440 | 0: — / — (0), 0 | 0.0 / 0.0 | 15.733 / 32.0 |
| 32 | 6 | 3 | 80.5% | 0 / 429 | 2 / 91 | 2.5 / 3.5 | 11859 | 1849 (15.6%) | 8 / 20 / 22 / 23 | 0 / 0 of 430 | 0: — / — (0), 0 | 0.0 / 0.0 | 24081.808 / 25999.9 |

## The run's source

`packages/nft-tracker/test/round4_sweep.test.ts`, run once with
`ROUND4_OUT=<file> npx vitest run test/round4_sweep.test.ts` from
`packages/nft-tracker`, and not committed as a test:

```ts
// TEMPORARY — tuning round 4's ground-truth check, not for commit. Runs the
// state-machine suite's synthetic sequences and the single-step suite's
// perturbation sweep at minTrackedPatches 8, 7 and 6, on three patch sets
// cut by selectPatches from the fixture pyramid (M2's 64 at 54 px, the
// adopted 48 at 62 px, round 2's rejected 32 at 76 px), and measures every
// accepted pose against the known truth. Writes its results as JSON.

import { writeFileSync } from "node:fs";
import { describe, it, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { TrackResult } from "../src/tracker.js";
import { buildFramePyramid, selectPatches } from "../src/index.js";
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

const OUT = process.env.ROUND4_OUT ?? "round4-sweep.json";
const CAMERA = { width: 270, height: 360 };
const SEED = 20260925;
const image = readPgm(TARGET_FIXTURE);
const MINIMUMS = [8, 7, 6];

// ---- Measuring points: the M2 fixture's 64 patch centres, for every set, so errors compare.
const measureAt = trackTarget(pinballPatches(), PINBALL_STEP).centres;
function centreErrors(A: Mat3, B: Mat3): { rms: number; max: number } {
    let s = 0;
    let max = 0;
    for (let i = 0; i < measureAt.length; i += 2) {
        const [ax, ay] = project(A, measureAt[i], measureAt[i + 1]);
        const [bx, by] = project(B, measureAt[i], measureAt[i + 1]);
        const d2 = (ax - bx) ** 2 + (ay - by) ** 2;
        s += d2;
        max = Math.max(max, Math.sqrt(d2));
    }
    return { rms: Math.sqrt(s / (measureAt.length / 2)), max };
}

// ---- Patch sets, as compile-target would cut them from this image.
function patchSet(maxPatches: number, minSpacing: number): PatchTable {
    const built = buildFramePyramid(image, { levels: 3, scaleStep: PINBALL_STEP });
    if (!built.ok) throw new Error(built.reason);
    const sel = selectPatches(built.pyramid, { patchSize: 16, maxPatches, minScore: 25, minSpacing });
    if (!sel.ok) throw new Error(sel.reason);
    return sel.patches;
}
const SETS: { name: string; patches: () => PatchTable }[] = [
    { name: "64 at 54 px (M2)", patches: () => pinballPatches() },
    { name: "48 at 62 px (adopted)", patches: () => patchSet(48, 62) },
    { name: "32 at 76 px (round 2's rejected)", patches: () => patchSet(32, 76) },
];

// ---- Part A: the state-machine suite's sequences (copied from tracker_state_machine.test.ts).
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
    ...[2, 3, 4, 5, 6].map((v) => ({ name: `velocity ${v} px/frame`, path: velocityStep(v), n: 15 })),
];

// ---- Part B: the single-step suite's perturbation sweep, on 5 renders.
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
const optionsFor = (m: number): TrackFrameOptions => ({
    maxFrameLevels: 4,
    align: { maxIterations: 30, epsilon: 0.01, photometric: true },
    fit: { maxIterations: 20, tukeyC: 4, epsilon: 1e-6 },
    minTrackedPatches: m,
    maxOutlierShare: 0.45,
    maxFitRms: 0.6,
    minPatchZncc: 0.6,
});

let cv: CvBackend;
let K: Mat3;
let base: TargetDb;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    base = pinballTrackingTarget(cv);
});

const quantiles = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, min: s[0], p05: q(0.05), p25: q(0.25), p50: q(0.5), max: s[s.length - 1] };
};

describe("round 4 ground truth", () => {
    it("sequences and the perturbation sweep, per patch set and minimum", () => {
        const results: unknown[] = [];
        for (const set of SETS) {
            const patches = set.patches();
            const perLevel = [0, 0, 0];
            for (const l of patches.level) perLevel[l]++;
            const target: TargetDb = { ...base, patches };
            const track: TrackTarget = trackTarget(patches, PINBALL_STEP);
            for (const m of MINIMUMS) {
                // Part A.
                const sequences = SEQUENCES.map((seq) => {
                    const tracker = new NftTracker(cv, target, K, { minTrackedPatches: m });
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
                        r.state === "TRACK" && r.H ? [{ i, e: centreErrors(r.H, truths[i]), inl: r.tracking!.inliers, obs: r.tracking!.observed }] : [],
                    );
                    return {
                        sequence: seq.name,
                        states,
                        track: tracked.length,
                        trackRmsMax: tracked.length ? Math.max(...tracked.map((t) => t.e.rms)) : null,
                        trackCentreMax: tracked.length ? Math.max(...tracked.map((t) => t.e.max)) : null,
                        trackOver1_5: tracked.filter((t) => t.e.rms > 1.5).length,
                        trackOver3: tracked.filter((t) => t.e.rms > 3).length,
                        inliers: quantiles(tracked.map((t) => t.inl)),
                        underEight: tracked.filter((t) => t.inl < 8).map((t) => ({ frame: t.i, inliers: t.inl, rms: +t.e.rms.toFixed(3), max: +t.e.max.toFixed(3) })),
                    };
                });
                // Part B.
                const errs = perturbations();
                let right = 0;
                const wrong: { error: number; inliers: number }[] = [];
                const acceptedInliers: number[] = [];
                const losses: Record<string, number> = {};
                for (let seed = 1; seed <= 5; seed++) {
                    const frames = VIEWS.map((H) =>
                        renderWarp(image, H, { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10, seed }),
                    );
                    VIEWS.forEach((H, v) => {
                        for (const E of errs) {
                            const r = trackFrame(frames[v], track, null, about(E, H), optionsFor(m), null);
                            if (!r.ok) {
                                losses[r.loss] = (losses[r.loss] ?? 0) + 1;
                                continue;
                            }
                            acceptedInliers.push(r.stats.inliers);
                            const e = centreErrors(r.H, H).rms;
                            if (e < 0.5) right++;
                            else wrong.push({ error: +e.toFixed(3), inliers: r.stats.inliers });
                        }
                    });
                }
                results.push({
                    set: set.name,
                    count: patches.count,
                    perLevel,
                    minTrackedPatches: m,
                    sequences,
                    sweep: {
                        steps: errs.length * VIEWS.length * 5,
                        right,
                        wrong: wrong.length,
                        wrongErrorMax: wrong.length ? Math.max(...wrong.map((w) => w.error)) : null,
                        wrongUnderEight: wrong.filter((w) => w.inliers < 8),
                        acceptedInliers: quantiles(acceptedInliers),
                        acceptedUnderEight: acceptedInliers.filter((x) => x < 8).length,
                        losses,
                    },
                });
            }
        }
        writeFileSync(OUT, JSON.stringify(results, null, 2));
    }, 3_600_000);
});
```
