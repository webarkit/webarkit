# Proxy replays, 2026-09-26: prediction 1's denominator

`node scripts/replay-clips.mjs --sequence <export>` (as of #67, commit f036cbb), on the
desktop PC the plan was written on, for each `Tab_9_WiFi` tracking export of the
bundled clips. Each replays exactly the frames that export processed, at its own
processing box and tracker options, once to warm up and then three times, and
prints the median of the three. Output pasted as printed, with the scratch paths
shortened to the file names. The first pass ran the six exports in turn; the
static clip's two exports were then replayed twice more, because the first pass's
first replay was disturbed (its own p95, 10.69 ms, against 4.7–5.1 ms in the
static clip's five other replays).

## First pass

```text
=== tracking-static
2026-09-26-tab9-ondevice-tracking-static.json: 300 frames of pinball-static.mp4, replayed 3 times after a warm-up
trackStepMs p50 / p95 — device 12.20 / 20.40 (n 300); here, median of 3: 4.94 / 10.69 (n 299)
device ÷ here, p50: 2.47
=== tracking-wall
2026-09-26-tab9-ondevice-tracking-wall.json: 300 frames of pinball-bench.mp4, replayed 3 times after a warm-up
trackStepMs p50 / p95 — device 20.40 / 25.00 (n 164); here, median of 3: 6.84 / 8.67 (n 170)
device ÷ here, p50: 2.98
=== tracking-table
2026-09-26-tab9-ondevice-tracking-table.json: 300 frames of pinball-bench-table.mp4, replayed 3 times after a warm-up
trackStepMs p50 / p95 — device 17.80 / 24.20 (n 233); here, median of 3: 5.92 / 8.26 (n 237)
device ÷ here, p50: 3.01
=== tracking-static-repeat
2026-09-26-tab9-ondevice-tracking-static-repeat.json: 300 frames of pinball-static.mp4, replayed 3 times after a warm-up
trackStepMs p50 / p95 — device 12.30 / 20.50 (n 300); here, median of 3: 3.89 / 5.14 (n 299)
device ÷ here, p50: 3.16
=== tracking-wall-repeat
2026-09-26-tab9-ondevice-tracking-wall-repeat.json: 300 frames of pinball-bench.mp4, replayed 3 times after a warm-up
trackStepMs p50 / p95 — device 19.70 / 25.20 (n 154); here, median of 3: 6.59 / 8.60 (n 161)
device ÷ here, p50: 2.99
=== tracking-table-repeat
2026-09-26-tab9-ondevice-tracking-table-repeat.json: 300 frames of pinball-bench-table.mp4, replayed 3 times after a warm-up
trackStepMs p50 / p95 — device 18.30 / 25.60 (n 228); here, median of 3: 6.07 / 8.20 (n 234)
device ÷ here, p50: 3.02
```

## The static clip, replayed twice more

```text
=== tracking-static (rerun 1)
trackStepMs p50 / p95 — device 12.20 / 20.40 (n 300); here, median of 3: 3.90 / 4.76 (n 299)
device ÷ here, p50: 3.13
=== tracking-static-repeat (rerun 1)
trackStepMs p50 / p95 — device 12.30 / 20.50 (n 300); here, median of 3: 3.77 / 4.73 (n 299)
device ÷ here, p50: 3.27
=== tracking-static (rerun 2)
trackStepMs p50 / p95 — device 12.20 / 20.40 (n 300); here, median of 3: 3.95 / 4.93 (n 299)
device ÷ here, p50: 3.09
=== tracking-static-repeat (rerun 2)
trackStepMs p50 / p95 — device 12.30 / 20.50 (n 300); here, median of 3: 4.02 / 5.02 (n 299)
device ÷ here, p50: 3.06
```
