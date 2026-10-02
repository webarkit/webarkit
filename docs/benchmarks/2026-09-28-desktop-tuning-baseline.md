# 2026-09-28 — the tuning pass's desktop baseline

The three runs the tuning plan's "The desktop baseline" table
([`README.md`](./README.md), "2026-09-28 — M3: the tuning pass") is read
from, committed as printed, and the smoke run that checked the `--target`
path. Not on-device measurements: see the plan for what the desktop can and
cannot settle.

Each run:

```bash
npm run build
node scripts/replay-clips.mjs --seed <1|2|3>
```

The smoke run first compiled the default candidate, which reproduced
`examples/targets/pinball.wnft` byte for byte (SHA-256 `4af6a7fb…`), then ran
it through `--target`; its counts, lock figures and jitter equal seed 1's
exactly, and only its timings differ:

```bash
node packages/nft-tracker/bin/compile-target.mjs examples/images/pinball.jpg \
    -o examples/targets/tuning/p64-s16.wnft --physical-size 210x262.5
node scripts/replay-clips.mjs --target examples/targets/tuning/p64-s16.wnft --seed 1 --tracking-only
```

## Seed 1

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

target targets/pinball.wnft (sha256 4af6a7fb3627…): 64 patches of 16 × 16; options defaults; seed 1; device ratio 3.15

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 3.87 / 5.37 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 4.08 / 6.00 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.91 / 5.54 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, scaled step (12.2 ms) | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.88 / 5.03 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | detection-only, every frame | 726 | 0.0% | 724 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.453 | 1.047 |
| pinball-static.mp4, 203×360 | detection-only, device | 182 | 0.0% | 180 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.452 | 1.041 |

pinball-static.mp4: aligned, every frame, both modes: 363 common media times — jitterPx tracking 0.131, detection-only 0.453 (÷ 3.45); spreadPx 0.896, 1.047

pinball-static.mp4: aligned, device schedules (tracking 15 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.452 (÷ 2.86); spreadPx 0.894, 1.041

pinball-static.mp4: aligned, device schedules (tracking 25 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.452 (÷ 2.86); spreadPx 0.894, 1.041

pinball-static.mp4: aligned, device schedules (tracking scaled step): 91 common media times — jitterPx tracking 0.158, detection-only 0.452 (÷ 2.86); spreadPx 0.894, 1.041

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.5% | 135 (1) | 1 | 4 / 137 | 2 / 413 (1) | too-few-patches 129, no-prediction 7 | 6.54 / 9.24 | 0.98 | {"1":414} | 0 / 414 | 4 | 0.12 | 6 | 15.300 | 55.702 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 436 | 81.7% | 60 (1) | 1 | 4 / 62 | 2 / 355 (1) | too-few-patches 58, no-prediction 3 | 6.26 / 8.82 | 0.99 | {"1":356} | 0 / 358 | 4 | 0.12 | 4 | 4.185 | 45.762 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 217 | 60.4% | 76 (1) | 1 | 15 / 77 | 14 / 131 (1) | too-few-patches 64, no-prediction 4, poor-fit 5, fit-failed 4 | 7.11 / 9.07 | 0.99 | {"1":131} | 3 / 138 | 4 | 0.14 | 5 | 6.420 | 46.369 |
| pinball-bench.mp4, 480×270 | tracking, device, scaled step (20.6 ms) | 217 | 60.4% | 76 (1) | 1 | 15 / 77 | 14 / 131 (1) | too-few-patches 64, no-prediction 4, poor-fit 5, fit-failed 4 | 7.18 / 8.78 | 0.98 | {"1":131} | 3 / 138 | 4 | 0.14 | 5 | 6.420 | 46.369 |
| pinball-bench.mp4, 480×270 | detection-only, every frame | 596 | 0.0% | 546 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 15.532 | 50.202 |
| pinball-bench.mp4, 480×270 | detection-only, device | 199 | 0.0% | 181 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 8.136 | 48.382 |

pinball-bench.mp4: first-step losses (every frame): 133; observed patches p50 0, culled p50 28 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 79.8% | 95 (1) | 1 | 2 / 97 | 0 / 425 (1) | too-few-patches 95, poor-fit 1 | 4.84 / 6.57 | 0.98 | {"1":426} | 0 / 427 | 3 | 0.40 | 0 | 22.647 | 38.324 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 214 | 83.2% | 33 (1) | 1 | 7 / 35 | 5 / 177 (1) | too-few-patches 29, poor-fit 4, too-many-outliers 1 | 6.31 / 8.33 | 0.98 | {"1":178} | 0 / 183 | 3 | 0.18 | 1 | 9.089 | 31.841 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 214 | 83.2% | 33 (1) | 1 | 7 / 35 | 5 / 177 (1) | too-few-patches 29, poor-fit 4, too-many-outliers 1 | 6.38 / 8.57 | 0.98 | {"1":178} | 0 / 183 | 3 | 0.18 | 1 | 9.089 | 31.841 |
| pinball-bench-table.mp4, 203×360 | tracking, device, scaled step (15.3 ms) | 214 | 83.2% | 33 (1) | 1 | 7 / 35 | 5 / 177 (1) | too-few-patches 29, poor-fit 4, too-many-outliers 1 | 5.92 / 8.89 | 0.98 | {"1":178} | 0 / 183 | 3 | 0.18 | 1 | 9.089 | 31.841 |
| pinball-bench-table.mp4, 203×360 | detection-only, every frame | 534 | 0.0% | 521 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 40.857 | 49.352 |
| pinball-bench-table.mp4, 203×360 | detection-only, device | 134 | 0.0% | 130 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 3.971 | 38.809 |

pinball-bench-table.mp4: first-step losses (every frame): 95; observed patches p50 1, culled p50 25 of 64

Step probe, every-frame tracking run (right: within 1 px of the accepted fit; gate: minPatchZncc default)

| clip | steps | attempted p50 | alignMs p50 / p95 | µs per attempted patch p50 / p95 | align iterations p50 / p95 / max | unconverged (their share of iterations) | right: iterations p50 / p95 / p99 | right needing > 8 / 10 / 15 / 20 | right alignments | ZNCC of right p1 / p5 / p50 | right, refused by the gate | observed off the fit | too-few-patches first / held | observed at those p50 / max | culled at those p50 | winnable by a lower minimum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4 | 725 | 64 | 3.77 / 5.21 | 58.9 / 81.4 | 6 / 30 / 30 | 5.4% (19.7%) | 5 / 15 / 20 | 19.8% / 12.6% / 4.9% / 0.7% | 42726 | 0.497 / 0.663 / 0.902 | 1501 | 1 | 0 / 0 | — / — | — | 0 |
| pinball-bench.mp4 | 550 | 64 | 6.43 / 9.03 | 99.7 / 148.9 | 18 / 30 / 60 | 33.5% (52.8%) | 12 / 26 / 29 | 71.3% / 58.0% / 31.7% / 15.9% | 18130 | 0.301 / 0.526 / 0.848 | 1518 | 112 | 126 / 3 | 0 / 7 | 26 | 7 |
| pinball-bench-table.mp4 | 522 | 64 | 4.75 / 6.43 | 76.4 / 127.2 | 11 / 30 / 60 | 20.4% (41.3%) | 9 / 23 / 29 | 54.6% / 40.6% / 18.7% / 8.5% | 22974 | 0.316 / 0.523 / 0.838 | 2310 | 6 | 94 / 1 | 1 / 6 | 25 | 9 |
```

## Seed 2

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

target targets/pinball.wnft (sha256 4af6a7fb3627…): 64 patches of 16 × 16; options defaults; seed 2; device ratio 3.15

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 4.11 / 7.00 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 4.14 / 6.21 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.895 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 4.29 / 6.64 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.895 |
| pinball-static.mp4, 203×360 | tracking, device, scaled step (12.9 ms) | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.96 / 5.51 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.895 |
| pinball-static.mp4, 203×360 | detection-only, every frame | 726 | 0.0% | 724 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.455 | 1.046 |
| pinball-static.mp4, 203×360 | detection-only, device | 182 | 0.0% | 180 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.460 | 1.036 |

pinball-static.mp4: aligned, every frame, both modes: 363 common media times — jitterPx tracking 0.131, detection-only 0.455 (÷ 3.46); spreadPx 0.896, 1.046

pinball-static.mp4: aligned, device schedules (tracking 15 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.460 (÷ 2.92); spreadPx 0.895, 1.036

pinball-static.mp4: aligned, device schedules (tracking 25 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.460 (÷ 2.92); spreadPx 0.895, 1.036

pinball-static.mp4: aligned, device schedules (tracking scaled step): 91 common media times — jitterPx tracking 0.158, detection-only 0.460 (÷ 2.92); spreadPx 0.895, 1.036

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.5% | 123 (1) | 1 | 4 / 125 | 2 / 413 (1) | too-few-patches 116, no-prediction 7, poor-fit 1 | 6.35 / 8.59 | 0.98 | {"1":414} | 0 / 415 | 4 | 0.12 | 6 | 15.765 | 47.771 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 448 | 83.5% | 53 (1) | 1 | 4 / 55 | 2 / 373 (1) | too-few-patches 52, no-prediction 2 | 6.22 / 8.52 | 0.98 | {"1":374} | 0 / 376 | 4 | 0.12 | 6 | 3.900 | 45.037 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 216 | 58.3% | 74 (1) | 1 | 17 / 75 | 17 / 126 (0) | too-few-patches 57, no-prediction 3, poor-fit 11, fit-failed 4 | 6.47 / 8.10 | 0.99 | {"1":126} | 5 / 137 | 4 | 0.12 | 6 | 6.480 | 48.215 |
| pinball-bench.mp4, 480×270 | tracking, device, scaled step (20.0 ms) | 216 | 58.3% | 74 (1) | 1 | 17 / 75 | 17 / 126 (0) | too-few-patches 57, no-prediction 3, poor-fit 11, fit-failed 4 | 6.44 / 8.33 | 0.99 | {"1":126} | 5 / 137 | 4 | 0.12 | 6 | 6.480 | 48.215 |
| pinball-bench.mp4, 480×270 | detection-only, every frame | 596 | 0.0% | 539 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 6.008 | 46.423 |
| pinball-bench.mp4, 480×270 | detection-only, device | 199 | 0.0% | 178 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 14.408 | 46.101 |

pinball-bench.mp4: first-step losses (every frame): 121; observed patches p50 0, culled p50 26 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 79.8% | 96 (0) | 1 | 2 / 97 | 0 / 425 (1) | too-few-patches 93, no-prediction 1, poor-fit 2 | 4.99 / 6.84 | 0.98 | {"1":426} | 0 / 428 | 3 | 0.40 | 0 | 15.424 | 31.941 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 211 | 81.5% | 34 (0) | 1 | 7 / 35 | 5 / 171 (1) | too-few-patches 24, poor-fit 8, too-many-outliers 2 | 5.82 / 7.81 | 0.98 | {"1":172} | 1 / 182 | 3 | 0.22 | 0 | 2.294 | 32.462 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 211 | 81.5% | 34 (0) | 1 | 7 / 35 | 5 / 171 (1) | too-few-patches 24, poor-fit 8, too-many-outliers 2 | 7.14 / 15.96 | 0.98 | {"1":172} | 1 / 182 | 3 | 0.22 | 0 | 2.294 | 32.462 |
| pinball-bench-table.mp4, 203×360 | tracking, device, scaled step (15.7 ms) | 211 | 81.5% | 34 (0) | 1 | 7 / 35 | 5 / 171 (1) | too-few-patches 24, poor-fit 8, too-many-outliers 2 | 5.78 / 8.20 | 0.98 | {"1":172} | 1 / 182 | 3 | 0.22 | 0 | 2.294 | 32.462 |
| pinball-bench-table.mp4, 203×360 | detection-only, every frame | 534 | 0.0% | 523 (0) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 26.982 | 37.954 |
| pinball-bench-table.mp4, 203×360 | detection-only, device | 134 | 0.0% | 129 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 3.177 | 7181.214 |

pinball-bench-table.mp4: first-step losses (every frame): 95; observed patches p50 1, culled p50 27 of 64

Step probe, every-frame tracking run (right: within 1 px of the accepted fit; gate: minPatchZncc default)

| clip | steps | attempted p50 | alignMs p50 / p95 | µs per attempted patch p50 / p95 | align iterations p50 / p95 / max | unconverged (their share of iterations) | right: iterations p50 / p95 / p99 | right needing > 8 / 10 / 15 / 20 | right alignments | ZNCC of right p1 / p5 / p50 | right, refused by the gate | observed off the fit | too-few-patches first / held | observed at those p50 / max | culled at those p50 | winnable by a lower minimum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4 | 725 | 64 | 4.00 / 6.70 | 62.5 / 104.6 | 6 / 30 / 30 | 5.4% (19.7%) | 5 / 15 / 20 | 19.8% / 12.6% / 4.8% / 0.7% | 42726 | 0.497 / 0.663 / 0.902 | 1501 | 1 | 0 / 0 | — / — | — | 0 |
| pinball-bench.mp4 | 538 | 64 | 6.24 / 8.48 | 97.3 / 135.9 | 18 / 30 / 60 | 33.3% (52.5%) | 12 / 26 / 29 | 71.3% / 58.0% / 31.7% / 15.9% | 18127 | 0.301 / 0.526 / 0.848 | 1518 | 112 | 113 / 3 | 1 / 6 | 25 | 6 |
| pinball-bench-table.mp4 | 522 | 64 | 4.90 / 6.73 | 78.4 / 126.5 | 11 / 30 / 60 | 20.0% (40.7%) | 9 / 23 / 29 | 54.6% / 40.6% / 18.7% / 8.5% | 22974 | 0.316 / 0.523 / 0.838 | 2310 | 6 | 92 / 1 | 1 / 6 | 27 | 11 |
```

## Seed 3

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

target targets/pinball.wnft (sha256 4af6a7fb3627…): 64 patches of 16 × 16; options defaults; seed 3; device ratio 3.15

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 3.97 / 5.43 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.92 / 5.01 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.88 / 5.27 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, scaled step (12.5 ms) | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.84 / 5.71 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.894 |
| pinball-static.mp4, 203×360 | detection-only, every frame | 726 | 0.0% | 724 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.487 | 1.071 |
| pinball-static.mp4, 203×360 | detection-only, device | 182 | 0.0% | 180 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.498 | 1.047 |

pinball-static.mp4: aligned, every frame, both modes: 363 common media times — jitterPx tracking 0.131, detection-only 0.487 (÷ 3.71); spreadPx 0.896, 1.071

pinball-static.mp4: aligned, device schedules (tracking 15 ms step): 91 common media times — jitterPx tracking 0.157, detection-only 0.498 (÷ 3.17); spreadPx 0.894, 1.047

pinball-static.mp4: aligned, device schedules (tracking 25 ms step): 91 common media times — jitterPx tracking 0.157, detection-only 0.498 (÷ 3.17); spreadPx 0.894, 1.047

pinball-static.mp4: aligned, device schedules (tracking scaled step): 91 common media times — jitterPx tracking 0.157, detection-only 0.498 (÷ 3.17); spreadPx 0.894, 1.047

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.5% | 129 (1) | 1 | 4 / 131 | 2 / 413 (1) | too-few-patches 123, no-prediction 7 | 6.73 / 9.79 | 0.99 | {"1":414} | 0 / 414 | 4 | 0.12 | 6 | 38.076 | 65.718 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 448 | 83.5% | 56 (1) | 1 | 4 / 58 | 2 / 373 (1) | too-few-patches 56, poor-fit 1 | 6.27 / 8.52 | 0.98 | {"1":374} | 0 / 376 | 4 | 0.12 | 6 | 19.280 | 51.277 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 212 | 57.5% | 82 (1) | 1 | 18 / 83 | 18 / 122 (0) | too-few-patches 68, no-prediction 1, poor-fit 10, fit-failed 3, too-many-outliers 1 | 6.75 / 8.40 | 0.99 | {"1":122} | 6 / 135 | 4 | 0.17 | 4 | 4.255 | 51.291 |
| pinball-bench.mp4, 480×270 | tracking, device, scaled step (21.2 ms) | 212 | 57.5% | 82 (1) | 1 | 18 / 83 | 18 / 122 (0) | too-few-patches 68, no-prediction 1, poor-fit 10, fit-failed 3, too-many-outliers 1 | 6.71 / 8.46 | 0.99 | {"1":122} | 6 / 135 | 4 | 0.17 | 4 | 4.255 | 51.291 |
| pinball-bench.mp4, 480×270 | detection-only, every frame | 596 | 0.0% | 540 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 15.741 | 48.735 |
| pinball-bench.mp4, 480×270 | detection-only, device | 199 | 0.0% | 178 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 21.843 | 54.474 |

pinball-bench.mp4: first-step losses (every frame): 127; observed patches p50 0, culled p50 27 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 80.7% | 90 (0) | 1 | 2 / 91 | 0 / 430 (1) | too-few-patches 88, poor-fit 2 | 4.89 / 6.81 | 0.98 | {"1":431} | 0 / 433 | 3 | 0.29 | 0 | 18.560 | 45.951 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 207 | 80.2% | 37 (1) | 1 | 6 / 39 | 4 / 165 (1) | too-few-patches 31, poor-fit 6, too-many-outliers 1 | 5.73 / 7.54 | 0.98 | {"1":166} | 1 / 173 | 3 | 0.18 | 1 | 3.162 | 26.425 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 207 | 80.2% | 37 (1) | 1 | 6 / 39 | 4 / 165 (1) | too-few-patches 31, poor-fit 6, too-many-outliers 1 | 5.59 / 7.47 | 0.99 | {"1":166} | 1 / 173 | 3 | 0.18 | 1 | 3.162 | 26.425 |
| pinball-bench-table.mp4, 203×360 | tracking, device, scaled step (15.4 ms) | 207 | 80.2% | 37 (1) | 1 | 6 / 39 | 4 / 165 (1) | too-few-patches 31, poor-fit 6, too-many-outliers 1 | 5.65 / 7.55 | 0.98 | {"1":166} | 1 / 173 | 3 | 0.18 | 1 | 3.162 | 26.425 |
| pinball-bench-table.mp4, 203×360 | detection-only, every frame | 534 | 0.0% | 519 (0) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 24474.892 | 26416.873 |
| pinball-bench-table.mp4, 203×360 | detection-only, device | 134 | 0.0% | 129 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 2.889 | 28.665 |

pinball-bench-table.mp4: first-step losses (every frame): 89; observed patches p50 1, culled p50 18 of 64

Step probe, every-frame tracking run (right: within 1 px of the accepted fit; gate: minPatchZncc default)

| clip | steps | attempted p50 | alignMs p50 / p95 | µs per attempted patch p50 / p95 | align iterations p50 / p95 / max | unconverged (their share of iterations) | right: iterations p50 / p95 / p99 | right needing > 8 / 10 / 15 / 20 | right alignments | ZNCC of right p1 / p5 / p50 | right, refused by the gate | observed off the fit | too-few-patches first / held | observed at those p50 / max | culled at those p50 | winnable by a lower minimum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4 | 725 | 64 | 3.86 / 5.26 | 60.3 / 82.1 | 6 / 30 / 30 | 5.4% (19.7%) | 5 / 15 / 20 | 19.8% / 12.6% / 4.9% / 0.7% | 42726 | 0.497 / 0.663 / 0.902 | 1501 | 1 | 0 / 0 | — / — | — | 0 |
| pinball-bench.mp4 | 544 | 64 | 6.63 / 9.64 | 103.6 / 155.0 | 18 / 30 / 60 | 33.4% (52.5%) | 12 / 26 / 29 | 71.3% / 58.0% / 31.7% / 15.9% | 18131 | 0.301 / 0.526 / 0.848 | 1520 | 113 | 120 / 3 | 0 / 6 | 26 | 8 |
| pinball-bench-table.mp4 | 521 | 64 | 4.80 / 6.73 | 76.8 / 124.9 | 11 / 30 / 60 | 21.0% (42.2%) | 9 / 23 / 29 | 54.6% / 40.5% / 18.6% / 8.4% | 23202 | 0.315 / 0.521 / 0.837 | 2370 | 8 | 87 / 1 | 1 / 6 | 19 | 10 |
```

## Smoke run: the default candidate through --target, seed 1, tracking only

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

target targets/tuning/p64-s16.wnft (sha256 4af6a7fb3627…): 64 patches of 16 × 16; options defaults; seed 1; device ratio 3.15

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 3.92 / 5.95 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.80 / 4.97 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.89 / 5.47 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, scaled step (12.3 ms) | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 4.21 / 6.55 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.5% | 135 (1) | 1 | 4 / 137 | 2 / 413 (1) | too-few-patches 129, no-prediction 7 | 6.49 / 9.25 | 0.98 | {"1":414} | 0 / 414 | 4 | 0.12 | 6 | 15.300 | 55.702 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 436 | 81.7% | 60 (1) | 1 | 4 / 62 | 2 / 355 (1) | too-few-patches 58, no-prediction 3 | 6.67 / 9.17 | 0.98 | {"1":356} | 0 / 358 | 4 | 0.12 | 4 | 4.185 | 45.762 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 217 | 60.4% | 76 (1) | 1 | 15 / 77 | 14 / 131 (1) | too-few-patches 64, no-prediction 4, poor-fit 5, fit-failed 4 | 7.42 / 9.78 | 0.99 | {"1":131} | 3 / 138 | 4 | 0.14 | 5 | 6.420 | 46.369 |
| pinball-bench.mp4, 480×270 | tracking, device, scaled step (20.4 ms) | 217 | 60.4% | 76 (1) | 1 | 15 / 77 | 14 / 131 (1) | too-few-patches 64, no-prediction 4, poor-fit 5, fit-failed 4 | 6.80 / 9.14 | 0.98 | {"1":131} | 3 / 138 | 4 | 0.14 | 5 | 6.420 | 46.369 |

pinball-bench.mp4: first-step losses (every frame): 133; observed patches p50 0, culled p50 28 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 79.8% | 95 (1) | 1 | 2 / 97 | 0 / 425 (1) | too-few-patches 95, poor-fit 1 | 4.95 / 6.98 | 0.98 | {"1":426} | 0 / 427 | 3 | 0.40 | 0 | 22.647 | 38.324 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 214 | 83.2% | 33 (1) | 1 | 7 / 35 | 5 / 177 (1) | too-few-patches 29, poor-fit 4, too-many-outliers 1 | 6.15 / 8.56 | 0.98 | {"1":178} | 0 / 183 | 3 | 0.18 | 1 | 9.089 | 31.841 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 214 | 83.2% | 33 (1) | 1 | 7 / 35 | 5 / 177 (1) | too-few-patches 29, poor-fit 4, too-many-outliers 1 | 6.45 / 9.17 | 0.98 | {"1":178} | 0 / 183 | 3 | 0.18 | 1 | 9.089 | 31.841 |
| pinball-bench-table.mp4, 203×360 | tracking, device, scaled step (15.6 ms) | 214 | 83.2% | 33 (1) | 1 | 7 / 35 | 5 / 177 (1) | too-few-patches 29, poor-fit 4, too-many-outliers 1 | 5.77 / 7.92 | 0.98 | {"1":178} | 0 / 183 | 3 | 0.18 | 1 | 9.089 | 31.841 |

pinball-bench-table.mp4: first-step losses (every frame): 95; observed patches p50 1, culled p50 25 of 64

Step probe, every-frame tracking run (right: within 1 px of the accepted fit; gate: minPatchZncc default)

| clip | steps | attempted p50 | alignMs p50 / p95 | µs per attempted patch p50 / p95 | align iterations p50 / p95 / max | unconverged (their share of iterations) | right: iterations p50 / p95 / p99 | right needing > 8 / 10 / 15 / 20 | right alignments | ZNCC of right p1 / p5 / p50 | right, refused by the gate | observed off the fit | too-few-patches first / held | observed at those p50 / max | culled at those p50 | winnable by a lower minimum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4 | 725 | 64 | 3.82 / 5.64 | 59.7 / 88.1 | 6 / 30 / 30 | 5.4% (19.7%) | 5 / 15 / 20 | 19.8% / 12.6% / 4.9% / 0.7% | 42726 | 0.497 / 0.663 / 0.902 | 1501 | 1 | 0 / 0 | — / — | — | 0 |
| pinball-bench.mp4 | 550 | 64 | 6.37 / 9.13 | 100.2 / 152.7 | 18 / 30 / 60 | 33.5% (52.8%) | 12 / 26 / 29 | 71.3% / 58.0% / 31.7% / 15.9% | 18130 | 0.301 / 0.526 / 0.848 | 1518 | 112 | 126 / 3 | 0 / 7 | 26 | 7 |
| pinball-bench-table.mp4 | 522 | 64 | 4.87 / 6.87 | 78.3 / 127.9 | 11 / 30 / 60 | 20.4% (41.3%) | 9 / 23 / 29 | 54.6% / 40.6% / 18.7% / 8.5% | 22974 | 0.316 / 0.523 / 0.838 | 2310 | 6 | 94 / 1 | 1 / 6 | 25 | 9 |
```
