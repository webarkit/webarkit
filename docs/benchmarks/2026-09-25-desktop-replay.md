# Desktop replay, 2026-09-25: the M2 measurement plan's pre-flight

Three runs of `node scripts/replay-clips.mjs` (as of commit 93ba3cc), one after
another, on the desktop PC the plan was written on, after `npm run build`. The
output is pasted as printed. **Not an on-device measurement**, and not the
browser's pixels: ffmpeg decodes and scales the frames (see the script's
header). Runs differ by RANSAC's draws in the detections and by this
machine's timing noise, which is why [README.md](./README.md#2026-09-25--m2-the-tracking-state-on-the-reference-device)
quotes ranges over the three.

## Run 1

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 4.04 / 5.61 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.81 / 6.10 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.88 / 5.69 | 0.98 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | detection-only, every frame | 726 | 0.0% | 724 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.443 | 1.040 |
| pinball-static.mp4, 203×360 | detection-only, device | 182 | 0.0% | 180 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.423 | 1.017 |

pinball-static.mp4: aligned, every frame, both modes: 363 common media times — jitterPx tracking 0.131, detection-only 0.443 (÷ 3.38); spreadPx 0.896, 1.040

pinball-static.mp4: aligned, device schedules (tracking 15 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.423 (÷ 2.67); spreadPx 0.894, 1.017

pinball-static.mp4: aligned, device schedules (tracking 25 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.423 (÷ 2.67); spreadPx 0.894, 1.017

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.5% | 131 (1) | 1 | 4 / 133 | 2 / 413 (1) | too-few-patches 123, no-prediction 9 | 6.31 / 8.63 | 0.99 | {"1":414} | 0 / 414 | 4 | 0.12 | 6 | 6.717 | 47.143 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 448 | 83.5% | 56 (1) | 1 | 4 / 58 | 2 / 373 (1) | too-few-patches 53, no-prediction 2, poor-fit 2 | 6.28 / 8.57 | 0.98 | {"1":374} | 0 / 377 | 4 | 0.12 | 6 | 15.193 | 48.798 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 215 | 57.7% | 75 (1) | 1 | 18 / 76 | 18 / 124 (0) | too-few-patches 61, no-prediction 2, poor-fit 8, fit-failed 4, too-many-outliers 1 | 7.06 / 9.47 | 0.98 | {"1":124} | 4 / 133 | 4 | 0.14 | 5 | 8.103 | 45.749 |
| pinball-bench.mp4, 480×270 | detection-only, every frame | 596 | 0.0% | 543 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 10.265 | 50.166 |
| pinball-bench.mp4, 480×270 | detection-only, device | 199 | 0.0% | 179 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 5.036 | 45.197 |

pinball-bench.mp4: first-step losses (every frame): 129; observed patches p50 0, culled p50 29 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 81.3% | 85 (1) | 1 | 2 / 87 | 0 / 433 (1) | too-few-patches 83, poor-fit 3 | 5.02 / 7.09 | 0.98 | {"1":434} | 1 / 437 | 3 | 0.29 | 0 | 2937.186 | 3500.070 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 213 | 82.6% | 33 (1) | 1 | 7 / 35 | 5 / 175 (1) | too-few-patches 27, poor-fit 6, too-many-outliers 1 | 5.82 / 7.87 | 0.99 | {"1":176} | 1 / 183 | 3 | 0.18 | 1 | 134.394 | 162.096 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 206 | 79.6% | 37 (1) | 1 | 5 / 39 | 3 / 163 (1) | too-few-patches 29, poor-fit 7, too-many-outliers 2 | 6.02 / 8.03 | 0.98 | {"1":164} | 2 / 174 | 3 | 0.20 | 0 | 23.201 | 5446.918 |
| pinball-bench-table.mp4, 203×360 | detection-only, every frame | 534 | 0.0% | 523 (0) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 14.966 | 30.723 |
| pinball-bench-table.mp4, 203×360 | detection-only, device | 134 | 0.0% | 129 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 3.344 | 43.058 |

pinball-bench-table.mp4: first-step losses (every frame): 85; observed patches p50 1, culled p50 25 of 64
```

## Run 2

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 4.41 / 6.65 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 4.17 / 5.73 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 4.10 / 6.57 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.137 | 0.895 |
| pinball-static.mp4, 203×360 | detection-only, every frame | 726 | 0.0% | 724 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.499 | 1.075 |
| pinball-static.mp4, 203×360 | detection-only, device | 182 | 0.0% | 180 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.535 | 1.050 |

pinball-static.mp4: aligned, every frame, both modes: 363 common media times — jitterPx tracking 0.131, detection-only 0.499 (÷ 3.80); spreadPx 0.896, 1.075

pinball-static.mp4: aligned, device schedules (tracking 15 ms step): 91 common media times — jitterPx tracking 0.157, detection-only 0.535 (÷ 3.42); spreadPx 0.894, 1.050

pinball-static.mp4: aligned, device schedules (tracking 25 ms step): 91 common media times — jitterPx tracking 0.153, detection-only 0.535 (÷ 3.50); spreadPx 0.896, 1.050

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.5% | 130 (1) | 1 | 4 / 132 | 2 / 413 (1) | too-few-patches 122, no-prediction 9 | 6.67 / 9.19 | 0.98 | {"1":414} | 0 / 414 | 4 | 0.12 | 4 | 15.179 | 57.172 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 436 | 81.7% | 60 (1) | 1 | 4 / 62 | 2 / 355 (1) | too-few-patches 60, no-prediction 1 | 6.40 / 9.00 | 0.98 | {"1":356} | 0 / 357 | 4 | 0.12 | 5 | 12.943 | 48.969 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 222 | 61.7% | 66 (1) | 1 | 13 / 68 | 11 / 136 (1) | too-few-patches 57, poor-fit 5, fit-failed 3, no-prediction 2 | 7.30 / 9.43 | 0.98 | {"1":137} | 3 / 144 | 4 | 0.14 | 6 | 58.721 | 92.520 |
| pinball-bench.mp4, 480×270 | detection-only, every frame | 596 | 0.0% | 544 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 9.183 | 48.601 |
| pinball-bench.mp4, 480×270 | detection-only, device | 199 | 0.0% | 183 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 5.633 | 45.386 |

pinball-bench.mp4: first-step losses (every frame): 128; observed patches p50 0, culled p50 25 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 78.7% | 102 (1) | 1 | 2 / 104 | 0 / 419 (1) | too-few-patches 98, no-prediction 1, poor-fit 4 | 5.11 / 7.06 | 0.98 | {"1":420} | 0 / 424 | 3 | 0.28 | 0 | 2311.766 | 3525.660 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 215 | 82.8% | 30 (0) | 1 | 6 / 31 | 4 / 177 (1) | too-few-patches 25, poor-fit 4, too-many-outliers 1 | 5.60 / 7.76 | 0.99 | {"1":178} | 0 / 183 | 3 | 0.16 | 1 | 2.415 | 26.376 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 215 | 83.3% | 31 (1) | 1 | 6 / 33 | 4 / 178 (1) | too-few-patches 28, poor-fit 4 | 6.04 / 8.19 | 0.98 | {"1":179} | 0 / 183 | 3 | 0.18 | 1 | 2.405 | 32.415 |
| pinball-bench-table.mp4, 203×360 | detection-only, every frame | 534 | 0.0% | 520 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 2754.238 | 3566.317 |
| pinball-bench-table.mp4, 203×360 | detection-only, device | 134 | 0.0% | 128 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 27.812 | 38.939 |

pinball-bench-table.mp4: first-step losses (every frame): 102; observed patches p50 1, culled p50 19 of 64
```

## Run 3

```text
Node v24.21.0, win32/x64, Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz

| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4, 203×360 | tracking, every frame | 726 | 99.9% | 0 (0) | 1 | 1 / 1 | 0 / 724 (0) | — | 4.20 / 5.78 | 0.97 | {"1":725} | 0 / 725 | 3 | 0.37 | 0 | 0.131 | 0.896 |
| pinball-static.mp4, 203×360 | tracking, device, 15 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.90 / 5.63 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.139 | 0.894 |
| pinball-static.mp4, 203×360 | tracking, device, 25 ms step | 363 | 99.7% | 0 (0) | 1 | 1 / 1 | 0 / 361 (0) | — | 3.90 / 5.93 | 0.97 | {"1":362} | 0 / 362 | 3 | 0.34 | 0 | 0.140 | 0.894 |
| pinball-static.mp4, 203×360 | detection-only, every frame | 726 | 0.0% | 724 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.470 | 1.059 |
| pinball-static.mp4, 203×360 | detection-only, device | 182 | 0.0% | 180 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 0.436 | 1.017 |

pinball-static.mp4: aligned, every frame, both modes: 363 common media times — jitterPx tracking 0.131, detection-only 0.470 (÷ 3.59); spreadPx 0.896, 1.059

pinball-static.mp4: aligned, device schedules (tracking 15 ms step): 91 common media times — jitterPx tracking 0.157, detection-only 0.436 (÷ 2.79); spreadPx 0.894, 1.017

pinball-static.mp4: aligned, device schedules (tracking 25 ms step): 91 common media times — jitterPx tracking 0.158, detection-only 0.436 (÷ 2.76); spreadPx 0.894, 1.017

| pinball-bench.mp4, 480×270 | tracking, every frame | 596 | 69.1% | 130 (1) | 1 | 5 / 132 | 3 / 411 (1) | too-few-patches 123, no-prediction 7, poor-fit 1 | 6.77 / 10.19 | 0.97 | {"1":412} | 0 / 413 | 4 | 0.12 | 9 | 4.904 | 47.336 |
| pinball-bench.mp4, 480×270 | tracking, device, 15 ms step | 436 | 81.7% | 61 (1) | 1 | 5 / 63 | 3 / 355 (1) | too-few-patches 59, no-prediction 2, poor-fit 1 | 6.63 / 9.16 | 0.98 | {"1":356} | 1 / 358 | 4 | 0.11 | 6 | 15.227 | 47.745 |
| pinball-bench.mp4, 480×270 | tracking, device, 25 ms step | 220 | 61.8% | 71 (1) | 1 | 12 / 73 | 10 / 135 (1) | too-few-patches 62, no-prediction 2, poor-fit 5, fit-failed 3 | 7.46 / 10.51 | 0.98 | {"1":136} | 3 / 142 | 4 | 0.14 | 6 | 4.676 | 45.856 |
| pinball-bench.mp4, 480×270 | detection-only, every frame | 596 | 0.0% | 547 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 10.264 | 47.683 |
| pinball-bench.mp4, 480×270 | detection-only, device | 199 | 0.0% | 179 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 9.967 | 53.439 |

pinball-bench.mp4: first-step losses (every frame): 127; observed patches p50 1, culled p50 25 of 64

| pinball-bench-table.mp4, 203×360 | tracking, every frame | 534 | 79.0% | 99 (1) | 1 | 3 / 101 | 1 / 421 (1) | too-few-patches 99, poor-fit 1 | 5.30 / 7.81 | 0.98 | {"1":422} | 0 / 423 | 3 | 0.18 | 1 | 2491.068 | 3553.507 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 15 ms step | 214 | 83.2% | 33 (1) | 1 | 5 / 35 | 3 / 177 (1) | too-few-patches 27, poor-fit 6, too-many-outliers 1 | 6.39 / 9.48 | 0.98 | {"1":178} | 0 / 185 | 3 | 0.15 | 1 | 12.406 | 29.756 |
| pinball-bench-table.mp4, 203×360 | tracking, device, 25 ms step | 217 | 84.3% | 31 (1) | 1 | 6 / 33 | 4 / 182 (1) | too-few-patches 29, poor-fit 3 | 6.41 / 9.12 | 0.98 | {"1":183} | 1 / 186 | 3 | 0.16 | 3 | 2.647 | 35.498 |
| pinball-bench-table.mp4, 203×360 | detection-only, every frame | 534 | 0.0% | 522 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 21.631 | 41.097 |
| pinball-bench-table.mp4, 203×360 | detection-only, device | 134 | 0.0% | 125 (1) | 1 | 0 / 0 | 0 / 0 (0) | — | — / — | — | {} | 0 / 0 | — | — | 0 | 3.408 | 28.481 |

pinball-bench-table.mp4: first-step losses (every frame): 98; observed patches p50 1, culled p50 22 of 64
```

