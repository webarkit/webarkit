# Benchmarks

Raw exports from [`examples/bench-nft.html`](../../examples/bench-nft.html), kept
so a number quoted in an ADR or an issue can be traced back to the exact frames
it came from, not just to the summary someone typed by hand.

## 2026-09-19 — ADR-0001 action item 6 baseline

[ADR-0001](../adr/0001-nft-tracker-ts-reference-above-cvbackend.md) action item
6 asks to "pick the reference device; record baseline numbers for the
stateless demo." This is that recording.

**Reference device:** a Samsung-class Android tablet, model `Tab_9_WiFi`
(confirmed via `adb devices -l`; referred to elsewhere in this repo's history
as "tab 9"). The page ran **on the tablet's own Chrome**, reached over USB via
`adb reverse` (no shared Wi-Fi network was available at capture time) —
confirmed by `userAgent`: `Mozilla/5.0 (Linux; Android 10; K) ...
Chrome/153.0.0.0`.

This distinction matters enough to spell out because it went wrong once
already during capture: an earlier pair of exports carried the same
`"Tab 9 Wifi"` device label but were actually run in a desktop Chrome on a
laptop, with the bundled clip merely *sourced from* footage recorded on the
tablet — the label described where the video came from, not what executed
`detect`/`describe`/`match`. Chrome's desktop `userAgent` on the laptop run
(`Windows NT 10.0; Win64; x64`) was the tell, not the label. Those two exports
are kept below as `2026-09-19-laptop-*`, explicitly relabeled, because the gap
between them and the real on-device numbers is itself informative — see
"Why the laptop numbers are kept" below.

**Mode:** `stateless` (not `NftTracker`) — item 6's own wording. M1 of
ADR-0001 claims the two report the same numbers; that claim is the subject of
the parity discussion in [`examples/README.md`](../../examples/README.md)'s
`bench-nft.html` section ("Comparing the two modes on the same footage"),
not this baseline.

**Source:** bundled clip `pinball-bench.mp4` (wall, frontal), `startAtSeconds:
0`, default 120-frame window. The clip looped partway through the window
(`mediaTimeSeconds` drops back near 0 around frame 76 of 120) — expected for
an ~12 s clip filling a 120-frame window on hardware this much slower than
the laptop, and not a data quality issue: each frame is still an independent,
correctly-timed sample.

| stage (p50 / p95 / max, ms) | **on-device tablet** (`Tab_9_WiFi`) | laptop (see below) |
|---|---|---|
| acquire | 18.9 / 28.3 / 29.0 | 7.2 / 9.0 / 14.9 |
| gray | 1.5 / 1.7 / 5.2 | 0.5 / 0.7 / 1.0 |
| detect | 5.3 / 7.6 / 8.4 | 2.2 / 3.1 / 3.6 |
| describe | 10.2 / 10.8 / 17.6 | 2.9 / 3.8 / 7.9 |
| match | 62.7 / 65.1 / 84.8 | 15.7 / 20.6 / 26.2 |
| estimateHomography | 2.1 / 4.0 / 7.4 | 0.6 / 1.1 / 2.1 |
| poseFromHomography | 0.1 / 0.1 / 0.2 | 0 / 0.1 / 0.1 |
| **total** | **101.1 / 113.0 / 135.9** | **29.5 / 36.0 / 46.0** |

Raw file: `2026-09-19-tab9-ondevice-stateless-pinball-bench.json`.

### Reading these numbers against ADR-0001 point 5 and the real-time budget

Point 5's actual trigger thresholds — JS↔WASM boundary overhead over 10% of
frame budget at p95 (> 3.3 ms), or tracker-side compute over 8 ms at p95 —
are **not evaluable from this baseline**: there is no WASM backend yet (the
boundary cost is zero because there is no boundary), and M1 has no tracking
state distinct from detection (that is what M2 adds). This baseline exists so
that once both of those exist, item 7's "measured against the previous one on
the same recorded sequences" has a concrete previous one to measure against.

What IS worth flagging now, and is considerably more serious than a laptop
run suggested: the ADR's own stated real-time budget — 33 ms per frame at
30 fps on mid-range mobile, shared with camera acquisition and rendering (see
"Forces at play") — is exceeded **at p50, not just p95**, by a factor of
roughly 3× on the actual reference device (101.1 ms median against a 33 ms
budget). `match` alone (62.7 ms p50) is nearly twice the entire budget. This
is the current M1 stateless pipeline, before any tracking-state cost from M2
is added on top. Whatever M2's savings turn out to be (no detection at all on
tracking-state frames), closing a 3× gap on `match` and `describe` together
is a materially different problem than the laptop numbers implied, and this
is now the number to measure any of that against — not the 33 ms figure taken
on faith, and not the laptop's 36 ms p95 that looked merely "close."

### On-device, the harder clip: `pinball-bench-table.mp4`

Same device, same session, same `stateless` mode, `startAtSeconds: 0` — the
oblique table clip instead of the frontal wall clip. Not itself an ADR-0001
baseline (item 6 only asks for one), but the first apples-to-apples
comparison of both bundled clips **on the reference device**, which the
laptop-only table-clip run below could not give.

| stage (p50 / p95 / max, ms) | wall (`pinball-bench.mp4`) | **table (`pinball-bench-table.mp4`)** |
|---|---|---|
| acquire | 18.9 / 28.3 / 29.0 | 37.0 / 40.3 / 47.0 |
| gray | 1.5 / 1.7 / 5.2 | 0.9 / 1.0 / 5.4 |
| detect | 5.3 / 7.6 / 8.4 | 4.5 / 7.2 / 23.6 |
| describe | 10.2 / 10.8 / 17.6 | 10.1 / 10.7 / 18.1 |
| match | 62.7 / 65.1 / 84.8 | 64.1 / 69.4 / 89.0 |
| estimateHomography | 2.1 / 4.0 / 7.4 | 1.6 / 3.1 / 3.8 |
| poseFromHomography | 0.1 / 0.1 / 0.2 | 0.1 / 0.2 / 0.4 |
| **total** | **101.1 / 113.0 / 135.9** | **119.3 / 126.3 / 155.4** |

Raw file: `2026-09-19-tab9-ondevice-stateless-pinball-bench-table.json`
(101-frame window, not the usual 120 — the run was stopped before the window
filled; every recorded frame is still a valid, independently-timed sample).

`acquire` roughly doubles (the table clip's native 1080×1920 frame is larger
to draw and read back than the wall clip's 1280×720, before either is
downscaled for processing — the same effect the laptop comparison showed,
just starting from a much higher on-device floor). `match` and `describe`
barely move, which argues those costs are dominated by the fixed
`maxKeypoints`/ratio-test budget rather than by scene content. Net effect:
`total` p50 is **119.3 ms — roughly 3.6× the 33 ms budget**, the worst
number recorded so far. Whether a future scene-detection change (multi-level
live-frame search, the webcam demo's own documented "known limitation")
narrows or widens this gap between the two clips is now checkable against
this table, not just against the wall clip alone.

### What this implies for M2

Two facts fall out of the breakdown above without needing a new measurement:

- `match` alone is 62.7 ms p50 on the wall clip — nearly twice the entire
  33 ms budget by itself, before `describe` (10.2 ms) or `acquire` (18.9 ms)
  are even counted.
- `match` and `describe` barely move between the wall clip and the oblique
  one (62.7→64.1 ms, 10.2→10.1 ms) while `acquire` roughly doubles
  (18.9→37.0 ms) with the native frame size. The matching cost tracks the
  fixed `maxKeypoints`/ratio-test budget, not scene content.

What that implies, stated as what the numbers show rather than as an M2
design decision (that planning belongs to M2 itself, not here):

- This baseline's `total` is the re-acquisition cost — the worst case, for a
  frame with nothing carried over. A tracking-state frame (M2) runs none of
  `detect`/`describe`/`match`, so M2's number will not be "this baseline
  minus a constant"; it is a different, currently-unmeasured pipeline.
- `maxKeypoints` (300, fixed today) is the parameter directly behind the
  largest single cost, which this data says makes it worth tuning rather
  than leaving as a constant.
- `acquire` tracks the source's native frame size, not the processing size
  it is downscaled to — so it is addressed by downscaling *before*
  acquisition (constraining what the camera or decoder delivers), not after
  it the way this benchmark's own `PROC_WIDTH`/`PROC_HEIGHT` box does today.

### A second on-device sample: Oppo A72

Not the ADR-0001 reference device (that stays `Tab_9_WiFi`; picking one is
what item 6 asked for, and this doesn't change it) — a second real phone,
run the same way, to check whether the budget overrun above is specific to
one tablet or a broader pattern. Same clip, same mode, same method: on the
phone's own Chrome, reached over USB via `adb reverse`, confirmed by
`userAgent`: `Mozilla/5.0 (Linux; Android 10; K) ... Chrome/152.0.0.0
Mobile Safari/537.36`. Wall clip (`pinball-bench.mp4`), `stateless`,
`startAtSeconds: 0`, 110-frame window (stopped before the usual 120 filled;
every recorded frame is still valid).

| stage (p50 / p95 / max, ms) | `Tab_9_WiFi` | **Oppo A72** |
|---|---|---|
| acquire | 18.9 / 28.3 / 29.0 | 22.7 / 34.1 / 52.6 |
| gray | 1.5 / 1.7 / 5.2 | 2.1 / 4.0 / 24.4 |
| detect | 5.3 / 7.6 / 8.4 | 7.1 / 13.6 / 40.3 |
| describe | 10.2 / 10.8 / 17.6 | 11.6 / 17.1 / 20.9 |
| match | 62.7 / 65.1 / 84.8 | 71.9 / 80.0 / 102.8 |
| estimateHomography | 2.1 / 4.0 / 7.4 | 2.1 / 6.5 / 45.0 |
| poseFromHomography | 0.1 / 0.1 / 0.2 | 0.1 / 0.2 / 1.5 |
| **total** | **101.1 / 113.0 / 135.9** | **117.4 / 145.2 / 217.2** |

Raw file: `2026-09-19-oppo-a72-ondevice-stateless-pinball-bench.json`.

Two things stand out. First, the Oppo A72 is slower on **every** stage, not
just the expected ones — consistent with weaker hardware (Snapdragon 665, a
budget-tier chip) rather than a fluke in one measurement. `total` p50 is
117.4 ms, roughly **3.6× the 33 ms budget** — the same order as the
oblique-clip result above, but on the *easy* frontal clip this time. Second,
the spread is much wider relative to the median than `Tab_9_WiFi` showed:
`detect` max (40.3 ms) is 5.7× its own p50, and `estimateHomography` max
(45.0 ms) is 21× its own p50 — both far outside what `Tab_9_WiFi` showed
for the same stages (1.6× and 3.5× respectively). A single run can't say
whether that is thermal throttling, background-app interference, or this
device simply being noisier; it is recorded here as an open question, not
an explanation. One thing narrows it slightly: thermal throttling usually
lifts all stages together and progressively, which this doesn't show — the
spread is concentrated in `detect` and `estimateHomography`, not uniform. A
likelier candidate for `estimateHomography`'s 21× tail is RANSAC hitting its
iteration cap on frames with few or poor matches, where long tails are
inherent to the algorithm rather than a device anomaly. Checkable without a
new measurement, by correlating the slow frames against the `numMatches`/
`numInliers` already in the export — recorded here as a hypothesis, not a
finding.

Read together with the tablet's two runs, this is the answer to "is the
budget overrun specific to one device": no — a second, independent
mid-range Android phone exceeds it by a comparable or larger margin, on the
easier of the two clips.

### Why the laptop numbers are kept

`2026-09-19-laptop-stateless-pinball-bench.json` (wall clip) and
`2026-09-19-laptop-stateless-pinball-bench-table.json` (table clip, oblique)
were captured in a desktop Chrome on a laptop, not on `Tab_9_WiFi`. They are
**not** the ADR-0001 reference-device baseline and must not be cited as such.
They are kept because the gap between them and the on-device numbers above —
roughly 3-4× slower per stage on the real device, `match` and `describe`
widening the most — is itself a useful, cheap-to-obtain sanity check: a
future change that looks like an improvement on a desktop run but doesn't
move the on-device number is not the improvement it appears to be. Treat
"laptop" as a fast, convenient smoke-test tier, and `Tab_9_WiFi`, run
on-device, as the only one item 5's thresholds can ever be evaluated against.

## 2026-09-24 — `maxKeypoints` sweep (M2: patch tracking)

A measurement plan, written down **before** any of its runs, so the result
can be read against what was predicted rather than explained after the
fact. The plan below is left as it was written. The runs were made the same
day, and their results are in [Results](#results) at the end of this section.
No numbers in the plan itself are measurements unless they say so.

### The hypothesis

From "What this implies for M2" above: `match` cost tracks the scene
keypoint budget (`maxKeypoints`, 300 today), not scene content. The
mechanism behind it is the backend's `match`, a brute-force k=2 nearest-neighbour
search followed by Lowe's ratio test. `matchPerLevel` runs it once per target
level, so a frame costs about (scene keypoints) × (target descriptors)
Hamming distances, and the target side is fixed for the whole run. If the
hypothesis holds, `match` p50 is close to proportional to the number of scene
keypoints and nearly independent of what the frame shows.

The precise form is that `match` tracks `numSceneKeypoints`, what `detect`
returned. The budget only controls that when it *binds*, i.e. when the frame
has more corners than the budget. `bench-nft.html` now records both (the
run's `maxKeypoints` and each frame's `numSceneKeypoints`), because without
the second one a slow frame on a corner-poor scene cannot be told apart from
a slow frame on a full budget.

**A caveat on the evidence the hypothesis came from.** The wall and table
clips' near-identical `match` (62.7 vs 64.1 ms) was read as "the budget
dominates". A corner count taken since then (below) shows that on the wall
clip a budget of 300 binds on only about half the frames. That run's median
frame had around 280 scene keypoints, not 300. That is still consistent with
the hypothesis, but the comparison could not have separated "tracks the
budget" from "tracks whatever `detect` returned". The sweep below can.

### Pre-flight: where the budget binds, per clip

This is a count, not a timing: `maxKeypoints=100000` (so effectively no cap),
`stateless`, a 400-frame window covering each clip's full loop, headless
desktop Chrome on a Windows desktop PC — **not** on `Tab_9_WiFi`. `detect` is
deterministic on identical pixels, but the tablet's `drawImage` downscale can
differ from the desktop's by a pixel's worth of filtering, so treat these as
approximate. The on-device export's `numSceneKeypoints` is the authority. No
timing from that desktop run is quoted anywhere in this plan.

| clip | processed at | corners found per frame (min / p5 / p50 / max) | frames where 300 binds |
|---|---|---|---|
| `pinball-bench.mp4` (wall, moving) | 480×270 | 134 / 144 / 282 / 951 | 46% |
| `pinball-bench-table.mp4` (table, oblique) | 203×360 | 355 / 371 / 548 / 1217 | 100% |
| `pinball-static.mp4` (wall, fixed camera) | 203×360 | 1210 / 1231 / 1262 / 1313 | 100% |

### The runs

- **Device:** `Tab_9_WiFi`, the ADR-0001 reference device, run **on the
  device's own Chrome** over `adb reverse`, exactly as the 2026-09-19
  baseline was. Check `userAgent` in each export for `Android`: the laptop
  mix-up recorded above is the failure this guards against. Device label
  `Tab_9_WiFi`.
- **Mode:** `stateless` (same as the baseline). **Window:** 120 frames.
  **start at:** 0.
- **Clips:**
  - `pinball-static.mp4` is the primary. The content is identical on every
    frame and the budget binds on every frame at every value below, so the
    budget is the only thing that varies.
  - `pinball-bench-table.mp4` is the content control. It is processed at the
    same 203×360, and the budget also binds on every frame (≥355 corners),
    but the scene is different.
  - Not the wall clip: it does not fill a 300 or 200 budget on about half of
    its frames, and not a 150 budget on about one in ten.
- **Values:** `maxKeypoints` = 300 (default and anchor), 200, 150, 100.
- **Order:** static 300 → 100 → 200 → 150, then table 300 → 100 → 200 → 150,
  then **static 300 again**. Nine runs. The order is shuffled so that thermal
  drift over the session doesn't line up with the budget. The final repeat
  is the check for drift.
- **Between runs:** load the page fresh with the value in the URL
  (`bench-nft.html?maxKeypoints=150`), so every run starts from a cold page
  the way the baseline did. Leave about two minutes idle between runs, with
  the same charging state throughout.
- **Raw files:**
  `YYYY-MM-DD-tab9-ondevice-stateless-<static|table>-mk<N>.json`, and the
  repeat as `...-static-mk300-repeat.json`.

### Validity checks (before reading any timing)

1. `numSceneKeypoints === maxKeypoints` on at least 95% of a run's frames. A
   run that fails this is not evidence either way: the budget did not bind.
2. The repeat static-300 run's `match` p50 is within ±10% of the first
   static-300 run. Otherwise the session drifted (thermal throttling or
   background load) and the sweep is **inconclusive**, not falsified. Rerun
   with longer idle gaps.

### What each run should show if the hypothesis holds

The prediction is proportional, anchored on the one on-device run where 300
is known to have bound on every frame: the table clip's `match` p50 of
64.1 ms, which is ≈ 0.214 ms per scene keypoint. `describe` computes one
descriptor per keypoint, so it should scale the same way, from its 10.1 ms
anchor.

| `maxKeypoints` | `match` p50, predicted (both clips) | `describe` p50, predicted |
|---|---|---|
| 300 | ≈ 64 ms | ≈ 10.1 ms |
| 200 | ≈ 43 ms | ≈ 6.7 ms |
| 150 | ≈ 32 ms | ≈ 5.1 ms |
| 100 | ≈ 21 ms | ≈ 3.4 ms |

In concrete terms, the hypothesis **holds** if both of these do:

- **Proportional:** on each clip, `match` p50 ÷ `maxKeypoints` stays within
  ±15% of its mean across the four values. A straight-line fit through the
  four points then has an intercept of a few ms, not tens of ms.
- **Content-independent:** at the same budget, the static and table clips'
  `match` p50 are within ±10% of each other. This holds even though their
  scenes differ, and even though `detect` does not match between them (the
  static clip has more than twice as many corners to find and sort, so its
  `detect` should cost more; the hypothesis says nothing about `detect`).

`acquire` and `gray` should not move with the budget. `detect` should move
only slightly: FAST and the score sort run over every corner found, whatever
the budget. Only the orientation computed for each *kept* keypoint scales
with the budget.

### What would falsify it

- **A large fixed cost:** `match` p50 at 100 is **≥ 50%** of its value at 300
  on either clip. Proportional scaling predicts 33%. Reaching 50% needs a
  fixed component of at least about a quarter of the 300-keypoint cost, which
  is per-call or per-level overhead that no budget reduces. The budget would
  then be a weaker lever than it looks.
- **A content effect:** at the same binding budget, the static and table
  clips' `match` p50 differ by **more than 20%**. Something other than the
  keypoint count would then be driving the cost. The candidates are the
  ratio-test and per-level merge work, which scale with how many matches
  survive rather than with how many keypoints were searched.
- **Non-monotonic results:** a lower budget costs more than a higher one on
  the same clip, beyond the drift the repeat run shows.

Results between the "holds" and "falsified" thresholds (for example, a 12–20%
difference between clips) are to be reported as inconclusive, not rounded
toward either side.

### Recorded alongside, not part of the test

Lowering the budget is only useful if tracking survives it. For each run,
also note the lock rate (`ok` frames out of all frames) and the `numInliers`
p50. The static clip is expected to lock at every budget and so says little
about this. The table clip is the harder scene and the one where a lower
budget could start costing locks. That trade-off is an M2 design question,
and this sweep only supplies its inputs.

### Results

Run on 2026-09-24 on `Tab_9_WiFi`, in the tablet's own Chrome (`userAgent`:
`Mozilla/5.0 (Linux; Android 10; K) ... Chrome/153.0.0.0`), over USB. The
page was served from a desktop PC and reached through `adb reverse`.

**How the runs were made.** A script started the nine sweep runs through the
DevTools protocol, which the tablet's Chrome exposes over USB on
`localabstract:chrome_devtools_remote`. For each run the script:

- loaded the page fresh with `?maxKeypoints=N`;
- set the controls exactly as "The runs" lists them and pressed Start;
- stopped the run once the 120-frame window was full;
- saved the page's own export unchanged, i.e. the file "Download JSON" would
  have produced.

While a run was going, the script read one text field from the page every
2 s. Between runs the tab sat on an idle page for 120 s. That page held a
screen wake lock, because the tablet's screen turns off after 30 s and
Chrome pauses video when it does.

**One deviation from the plan:** the static-150 run failed twice at page
start-up, before any timed code ran. It was retried at the end of the session
(after the repeat), not in its planned slot.

**The manual runs.** Five runs were started by hand before the sweep:
`...-static-mk300-manual-1.json` to `...-manual-5.json`. They were all made
in one page load (Start/Stop repeated without a reload), with the device label
typed as `Tab9 wifi`. They are the evidence for repeatability, and the check
that starting runs by script doesn't change the numbers:

- The manual runs' `match` p50 is 64.8, 64.1, 63.3, 63.4 and 63.4 ms.
- The script's static-300 runs gave 63.9 ms and 64.3 ms.
- `manual-1` is the only run stopped early (73 frames), and it holds the
  largest single `match` time in the set (171.0 ms).

The server used for the manual runs did not support HTTP range requests, so
the video stalled briefly at every loop. A stall makes a window take longer
to fill, but it adds no frames:
`requestVideoFrameCallback` only fires on a frame actually presented. The
sweep was served with range support.

**Validity checks: all pass.**

- All nine sweep runs report an Android `userAgent`, `stateless` mode, start
  at 0 and 120 frames.
- `numSceneKeypoints === maxKeypoints` on **100%** of frames in every run,
  not just the required 95%.
- The repeat static-300 run's `match` p50 is 64.3 ms against 63.9 ms, a drift
  of **+0.6%**. The limit was ±10%.

| clip | `maxKeypoints` | match p50 (p95) | describe | detect | acquire | total | locked |
|---|---|---|---|---|---|---|---|
| static | 300 | **63.9** (68.6) | 10.1 | 7.2 | 35.9 | 120.2 | 120/120 |
| static | 200 | **43.1** (47.5) | 6.9 | 6.8 | 36.4 | 95.8 | 120/120 |
| static | 150 | **32.3** (37.2) | 5.2 | 6.6 | 36.0 | 82.6 | 120/120 |
| static | 100 | **21.8** (27.2) | 3.6 | 6.4 | 36.2 | 70.4 | 120/120 |
| static | 300 (repeat) | 64.3 (68.5) | 10.1 | 7.2 | 36.2 | 120.7 | 120/120 |
| table | 300 | **63.9** (68.7) | 10.1 | 4.7 | 40.1 | 122.5 | 113/120 |
| table | 200 | **43.0** (47.7) | 6.8 | 4.3 | 40.0 | 97.0 | 108/120 |
| table | 150 | **32.6** (38.1) | 5.2 | 4.0 | 39.9 | 85.3 | 97/120 |
| table | 100 | **21.8** (27.3) | 3.6 | 3.9 | 39.1 | 71.4 | 96/120 |

All timings are p50 in ms unless marked. Raw files:
`2026-09-24-tab9-ondevice-stateless-<static|table>-mk<N>.json`,
`...-static-mk300-repeat.json`, and `...-static-mk300-manual-<1-5>.json`.

**Against the plan's criteria, the hypothesis holds:**

- **Proportional.** `match` p50 ÷ `maxKeypoints` is 0.2130–0.2180 ms on
  both clips. That is within **±1.3%** of its mean, against the ±15%
  threshold. Fitting a straight line through the four points gives
  `match ≈ 0.8 ms + 0.211 ms × N` (static) and `0.9 ms + 0.210 ms × N`
  (table). The fixed part is under 1 ms.
- **Content-independent.** At every value, the static and table clips'
  `match` p50 agree within **0.9%** (threshold ±10%). This holds even though
  their `detect` differs by 2–3 ms: the static clip has more than twice as
  many corners to find.
- **The falsification test.** `match` at 100 is **34.1%** of its value at
  300 on both clips. Proportional scaling predicted 33%; the plan counted
  ≥ 50% as falsifying.
- **The predicted values.** The plan predicted about 64 / 43 / 32 / 21 ms for
  `match` and 10.1 / 6.7 / 5.1 / 3.4 ms for `describe`. Every measured value
  is within about 1 ms of those.
- **Against the 2026-09-19 baseline.** The table clip at 300 gave 63.9 ms
  here and 64.1 ms five days earlier.

**What the numbers show beyond the hypothesis.** These are facts for M2 to
design from, not decisions:

- On this device, `match` costs about **0.21 ms per scene keypoint**. The
  scene doesn't matter, and there is no meaningful fixed cost. The budget is a
  linear dial on the largest stage.
- **Lowering the budget alone does not reach the 33 ms frame budget.** At 100,
  `total` is still 70–71 ms. `acquire` (36–40 ms) does not move with the
  budget, and below about 170 keypoints it is larger than `match`. Past that
  point, the next saving is in acquisition, not matching (see the
  `acquire` bullet under "What this implies for M2").
- **Tracking pays for a lower budget on the hard scene:**
  - The table clip locks on 113 → 108 → 97 → 96 frames out of 120 for
    300 → 200 → 150 → 100. The losses are almost all `too-few-matches`, and
    inliers p50 falls from 34 to 17.
  - The static clip locks on every frame at every value, while its inliers
    fall from 93 to 34.

  Halving `match` time from 300 to 150 costs the oblique scene about one lock
  in seven.

**Limits of this result:** one run per value (the manual runs and the repeat
put run-to-run noise at about ±1–2%), and one device.

### Open question: why does a portrait source cost twice as much to acquire?

This is recorded as a question, not a finding. It matters because `acquire`
is now the largest stage below about 170 keypoints (see Results). The
answer decides the fix: a different acquisition path, or a different
processing box.

**The observation.** `acquire` times `new OffscreenCanvas`, `getContext`,
`drawImage(video)` (the downscale) and `getImageData` (the readback), in
`examples/js/pinball-shared.mjs`'s `toGrayTimed`. On `Tab_9_WiFi` its p50 is:

| clip | native frame | pixels | fps | processing box | `acquire` p50 | `gray` p50 |
|---|---|---|---|---|---|---|
| wall, `pinball-bench.mp4` (2026-09-19) | 1280×720, landscape | 921,600 | 24.9 | 480×270 (129,600 px) | 18.9 | 1.5 |
| static, `pinball-static.mp4` (sweep) | 720×1280, portrait | 921,600 | 30 | 203×360 (73,080 px) | 35.9–36.4 | 0.9 |
| table, `pinball-bench-table.mp4` (sweep) | 1080×1920, portrait | 2,073,600 | 30 | 203×360 (73,080 px) | 39.1–40.1 | 0.9 |

The wall and static clips have the same pixel count, yet the static one costs
about twice as much to acquire. It also produces *fewer* output pixels, so
it should be cheaper to read back, not dearer. Earlier sections explain
`acquire` as tracking native frame size (the table-clip section, and the
`acquire` bullet under "What this implies for M2"). That explains neither
this 2× gap nor the table clip: it has 2.25× the static clip's pixels and
costs only about 10% more.

The stage after the readback behaves as expected. `gray` runs on the output
pixels and scales with the processing box (0.9 ÷ 1.5 ≈ 0.56 ÷ 1), so the gap
is inside `acquire`.

**What differs between the wall and static clips, none of it tested yet:**

- **Orientation:** portrait versus landscape frame layout, through the
  decoder and `drawImage`.
- **Frame rate:** 30 fps versus 24.9 fps. That is more decoding per second
  competing with the main thread, and a different
  `requestVideoFrameCallback` cadence.
- **Downscale ratio:** 0.28 versus 0.375, which may take a different scaling
  path.
- **Session:** the two were measured five days apart. On its own this seems
  an unlikely explanation for 2×, because the table clip measured 37.0 ms on
  2026-09-19 and 39.1–40.1 ms here (a 6–8% drift). It is still a confound.

The manual static-300 runs are left out of this comparison. Their `acquire`
is much noisier (30.8–47.1 ms p50), and they were served without HTTP range
support, which stalled the video at every loop.

**What would separate these.** Each is a single run on `Tab_9_WiFi`, none
of them made yet:

1. The static footage re-encoded as a landscape frame: the same pixels,
   frame rate and content, only the orientation changed.
2. The wall footage re-encoded at 30 fps: the same orientation, only the
   frame rate changed.
3. The wall clip rerun in the same session as (1) and (2), to remove the
   five-day gap.

The first two would be test media, not bundled clips, unless they turn out
to be worth keeping (see AGENTS.md's "Test assets").

## 2026-09-24 — Separating the portrait `acquire` gap

These runs address the open question above: why a portrait source costs about
twice as much to acquire. The plan and its decision rules were written
**before** any of the runs. Results follow at the end of this section.

### What varies, and what is held fixed

There are three candidate causes: orientation, output pixel count (the
processing box), and frame rate. Plus the five-day gap between sessions. The
bundled wall and static clips differ in all of them at once. So these runs
use four **test re-encodes**, made with one identical command so that encoder
settings are not a fifth difference:

```bash
ENC="-an -c:v libx264 -preset medium -crf 28 -movflags +faststart"
ffmpeg -i pinball-static.mp4                  $ENC static-portrait.mp4   # 720x1280, 30 fps
ffmpeg -i pinball-static.mp4 -vf transpose=1  $ENC static-landscape.mp4  # 1280x720, 30 fps
ffmpeg -i pinball-bench.mp4                   $ENC wall-native-fps.mp4   # 1280x720, 24.9 fps
ffmpeg -i pinball-bench.mp4  -vf fps=30       $ENC wall-30fps.mp4        # 1280x720, 30 fps
```

The commands used ffmpeg 9.0.2 and ran from `examples/videos/`. Their
outputs are test media and are **not** committed; the commands above
regenerate them from the committed clips. The static pair are the same
footage transposed: same pixels, frame rate and bitrate class. The wall pair
differ only in frame rate.

`bench-nft.html` now takes the processing box as a run parameter (a
`?procWidth=` / `?procHeight=` control, default 480×360; the export records it
as `processingBox`). That lets orientation and output pixel count vary
independently on the static footage:

| | output ≈ 73,000 px | output ≈ 130,000 px |
|---|---|---|
| **portrait** (`static-portrait`) | box 480×360 → 203×360 | box 480×480 → 270×480 |
| **landscape** (`static-landscape`) | box 360×360 → 360×203 | box 480×360 → 480×270 |

### The runs

Same device and method as the sweep above: `Tab_9_WiFi`, the tablet's own
Chrome, the automated driver, `stateless`, 120 frames, start at 0,
`maxKeypoints` 300. Only `acquire` is under test. The box also changes what
`detect`/`describe` search, so the other stages are not compared across
boxes. Run in this order, with 120 s idle between runs:

1. `pinball-static.mp4` (bundled), default box: the anchor, to reproduce the
   sweep's 35.9–36.4 ms.
2. `pinball-bench.mp4` (bundled), default box: the session control, against
   the 2026-09-19 value of 18.9 ms.
3. `static-portrait`, default box: the re-encode control, against run 1.
4. `static-landscape`, default box (480×270).
5. `static-portrait`, box 480×480 (270×480).
6. `static-landscape`, box 360×360 (360×203).
7. `wall-native-fps`, default box.
8. `wall-30fps`, default box.
9. `pinball-static.mp4` (bundled), default box: the drift check, against
   run 1.

### Decision rules (on `acquire` p50)

A factor **explains** the gap if it changes `acquire` by a ratio of **≥ 1.5**
(the gap under question is about 1.9×). It has **no effect** if the ratio is
within **±15%** (0.87–1.15). Anything in between is **inconclusive** and is
reported as such.

Validity comes first:

- Run 9 must be within ±10% of run 1. If not, the session drifted.
- Run 3 must be within ±15% of run 1. If not, re-encoding alone changes
  `acquire`, and runs 4–8 cannot be read against the bundled clips (only
  against each other).

Then each factor:

- **Session:** run 2 vs 18.9 ms. If run 2 is ≥ 1.5× 18.9 ms (about 28 ms or
  more), the five-day gap, not the clip, explains the 2026-09-19 figure. The
  question then changes to "what changed on the device", and the factors
  below say nothing about it.
- **Orientation**, at equal output pixels: run 3 vs run 6 (≈73,000 px) and
  run 5 vs run 4 (≈130,000 px). Portrait ÷ landscape ≥ 1.5 at **both** sizes
  means orientation explains it, which points at the acquisition path, not
  the box.
- **Output pixels (the box)**, at fixed orientation: run 5 vs run 3
  (portrait) and run 4 vs run 6 (landscape). A ratio ≥ 1.5 means the box
  explains it (130,000 ÷ 73,000 ≈ 1.8, so a cost fully proportional to output
  pixels would show about 1.8).
- **Frame rate:** run 8 vs run 7. A ratio ≥ 1.5 means frame rate explains it.

These are not exclusive, and more than one factor may pass. If none does,
the gap is unexplained by these three and stays an open question.
