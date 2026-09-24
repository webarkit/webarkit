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
- *Added 2026-09-24, from the rear-camera runs ("Webcam: `acquire` without a
  video decoder" below):* on the real camera path, `acquire` is **23 ms p50**.
  Once tracking removes `match`, `describe` and `detect` from tracking-state
  frames, 23 ms of the 33 ms budget is already spent acquiring the frame.
  That leaves **about 10 ms** for the tracker itself. It is tighter than the
  roughly 14 ms that this baseline's wall-clip `acquire` (18.9 ms) appeared
  to leave. And it means ADR-0001 point 5's 8 ms p95 threshold for
  tracker-side compute is close to all the room there is.

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

> **Tested later the same day:** orientation is **not** the cause. See
> "Separating the portrait `acquire` gap" below. The question as asked here
> is kept unchanged.

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

> **Lower priority since the webcam runs** (next section): the footage
> question this section ends on is still open. But it only matters on the
> file path. The camera path decodes no video, and it is the path a tracker
> actually runs on. Don't spend another session on it before the
> camera-path work.

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
4. `static-landscape`, default box (480×360), processed at 480×270.
5. `static-portrait`, box 480×480, processed at 270×480.
6. `static-landscape`, box 360×360, processed at 360×203.
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

### Results

The runs were made on 2026-09-24 on `Tab_9_WiFi`, all nine by the automated
driver. All report an Android `userAgent` and 120 frames. **One deviation:**
the anchor run (1) failed twice at page start-up, before any timed code ran
(the same stall the sweep saw). It was rerun last, after run 9, so the drift
check compares run 9 with a run made after it rather than before it.

| run | clip | native | box | processed at | `acquire` p50 (p5 / p95) |
|---|---|---|---|---|---|
| 1 | `pinball-static.mp4` | 720×1280 | 480×360 | 203×360 | **35.8** (33.0 / 38.0) |
| 2 | `pinball-bench.mp4` | 1280×720 | 480×360 | 480×270 | **17.9** (16.5 / 24.5) |
| 3 | `static-portrait` | 720×1280 | 480×360 | 203×360 | **36.1** (33.7 / 38.2) |
| 4 | `static-landscape` | 1280×720 | 480×360 | 480×270 | **38.3** (35.2 / 41.2) |
| 5 | `static-portrait` | 720×1280 | 480×480 | 270×480 | **43.3** (41.4 / 45.5) |
| 6 | `static-landscape` | 1280×720 | 360×360 | 360×203 | **31.8** (27.5 / 33.7) |
| 7 | `wall-native-fps` (24.9 fps) | 1280×720 | 480×360 | 480×270 | **18.3** (16.6 / 24.5) |
| 8 | `wall-30fps` | 1280×720 | 480×360 | 480×270 | **25.8** (22.8 / 27.7) |
| 9 | `pinball-static.mp4` | 720×1280 | 480×360 | 203×360 | **36.2** (32.9 / 38.3) |

Raw files: `2026-09-24-tab9-ondevice-acquire-<NN>-<run>.json`.

**Validity checks: both pass.**

- Drift: run 9 ÷ run 1 = **1.011** (limit ±10%).
- Re-encode control: run 3 ÷ run 1 = **1.008** (limit ±15%). So runs 4–8 can
  be read against the bundled clips.

**Each factor, by the decision rules:**

| factor | comparison | ratio | verdict |
|---|---|---|---|
| session | run 2 ÷ 18.9 ms (2026-09-19) | 0.947 | no effect |
| orientation, ≈73,000 px | run 3 ÷ run 6 | 1.135 | no effect |
| orientation, ≈130,000 px | run 5 ÷ run 4 | 1.131 | no effect |
| output pixels, portrait | run 5 ÷ run 3 | 1.199 | inconclusive |
| output pixels, landscape | run 4 ÷ run 6 | 1.204 | inconclusive |
| frame rate | run 8 ÷ run 7 | 1.410 | inconclusive |

**What this answers.**

- **Orientation does not explain the gap.** The question's premise that
  "portrait sources cost twice as much" is wrong. The same footage costs
  about the same portrait or landscape: 13% more when portrait, at both
  output sizes. That is within the no-effect band, though near its edge.
- **The five-day gap does not explain it either.** The wall clip reproduces
  its 2026-09-19 value.
- **The processing box is not proportional.** 1.78× the output pixels costs
  only about 1.20× the `acquire` time, on both orientations. A smaller box
  saves `acquire` time, but much less than proportionally.
- **Frame rate matters, but not enough on its own.** 20% more decoded frames
  per second cost 41% more `acquire` time, which suggests decoding competes
  with the main thread. That is below the 1.5× threshold.

**What is left: the footage.** This part was observed after the fact and was
not in the plan. At an identical format (1280×720, 30 fps, same encoder
command, same box), the static footage (run 4, 38.3 ms) still costs **1.48×**
the wall footage (run 8, 25.8 ms). Together with frame rate, that accounts
for the whole original gap: run 4 ÷ run 7 = 2.09×. So the gap follows the
footage, not its orientation.

The frame structures are alike: each re-encode has one I-frame and mostly
B-frames (static: 265 B / 96 P; wall at 30 fps: 254 B / 103 P). Bitrates are
alike too (≈560 vs ≈690 kb/s, the static one *lower*). Neither explains it.

**This is the question that replaces the one above:** what about the static
footage makes each frame dearer to draw and read back? It is not answered
here.

**It is not pipeline cost.** Runs 4 and 8 differ in `total` p50 as well
(about 128 vs 109 ms), and a longer tick could mean more frames decoded in
the background between two reads. The `maxKeypoints` sweep above already
rules that out. On the static clip, `total` p50 falls 120.2 → 95.8 → 82.6 →
70.4 ms across the four budgets while `acquire` stays at 35.9 / 36.4 /
36.0 / 36.2 ms. The table clip shows the same pattern (122.5 → 71.4 ms
against 40.1 / 40.0 / 39.9 / 39.1 ms). The tick length nearly halves and
`acquire` does not move. So the footage effect does not come through the
pipeline's cost per frame.

That makes it more interesting, not less. The two footages are asked for
frames just as often. What differs is what the decoder does for each frame.

**This is in tension with the frame-rate result.** A higher frame rate and
a longer tick both mean more decoding between two reads. Yet the first
raised `acquire` by 1.41× while the second left it unchanged. The frame-rate
result is the one to target next, because it is the one that moved.

`wall-30fps` was made with `-vf fps=30`, which adds one duplicate for about
every five original frames (298 → 359 frames). So that clip differs from `wall-native-fps` in its frame content as
well as in how often frames arrive. Setting `video.playbackRate` on a
single file would change the decode rate alone, with no re-encode and no
duplicated frames.

**For M2:**

- The fix is not "avoid portrait sources".
- A smaller processing box helps, but less than its pixel count suggests.
- A lower frame rate from the camera or decoder may help (1.41× measured
  here). Until the tension above is resolved, that is a lead, not a
  mechanism. The `acquire` bullet under "What this implies for M2" suggests
  lowering decode resolution on other grounds.

## 2026-09-24 — Webcam: `acquire` without a video decoder

Two runs on the tablet's **rear camera**, the first runs in this directory
whose source is a camera rather than a file. Both are from `Tab_9_WiFi`, in
the same session, seven minutes apart (exported 15:39:50 and 15:47:39 UTC).
They were started by hand on the tablet, not by the automated driver.

**Device label correction.** `...-webcam-1.json` has an empty `deviceLabel`,
because the field had not been filled in yet. `...-webcam-2.json` reads
`Tab9 wifi`. Both are `Tab_9_WiFi`: the `userAgent` is the tablet's
(`Android 10; K ... Chrome/153.0.0.0`), and so is the camera, recorded by
the page as `"camera 0, facing back"`. As with the relabelled laptop exports
above, the raw files are left as exported and the correction lives here.

**What makes these different from every run so far:** no video decoder is
involved. The camera opened the stream at **360×480**, which was downscaled
into the 480×360 processing box to **270×360**. It ran at 30 fps
(`frameRate` in the export's new `camera` field, and `facingMode`
`environment` confirms the rear camera). The runs used `maxKeypoints` 300,
`stateless` mode and 120 frames.

| stage (p50, ms) | webcam 1 | webcam 2 |
|---|---|---|
| acquire | **23.0** (p95 28.0) | **23.0** (p95 28.3) |
| gray | 1.2 | 1.2 |
| detect | 7.1 | 7.6 |
| describe | 10.3 | 10.3 |
| match | 64.0 | 64.0 |
| estimateHomography | 1.8 | 2.0 |
| **total** | **109.0** | **109.7** |

Both runs locked on 120/120 frames, with `numSceneKeypoints` at 300 on every
frame. `acquire` shows no warm-up drift: its p50 over the first and last 30
frames is 23.1 vs 23.0 ms (run 1) and 23.0 vs 23.0 ms (run 2). `match` and
`describe` land on the sweep's 300-keypoint values (63.9 and 10.1 ms), as
the sweep's result predicts for any scene that fills the budget.

Raw files: `2026-09-24-tab9-ondevice-stateless-webcam-1.json` and `-2.json`.

**What they answer:**

- **Roughly 13 ms of the static clip's `acquire` was the file path.** The
  static clip measured 35.8 ms; the camera measures 23.0 ms. The file path
  means decoding, plus drawing from a larger source frame (921,600 against
  172,800 pixels). The acquire-gap runs make the source size the weaker of
  the two: at an identical 1280×720 format, the two footages still differed
  by 2×.
- **The remaining 23 ms is real.** It is paid on a source that is already
  small, with no decoder in the path, and while *writing more* output pixels
  than the static clip (97,200 against 73,080). That points at the
  `getImageData` readback rather than the `drawImage` downscale. **This has
  not been tested**; it is where to look first.
- **The footage question from the acquire-gap runs stays open, but is now
  low value.** The camera path does not decode video at all, so whatever
  makes one file's frames dearer to decode than another's does not reach a
  tracker running on a camera. Don't spend another session on it before the
  camera-path work.

**Their limit.** Unlike the bundled clips, these runs cannot be reproduced.
Framing, exposure and focus differ from one session to the next, and the
scene is whatever was in front of the camera. They estimate the real cost of
acquisition on this device, and they must **not** be used to compare
tracker versions. That comparison belongs on the bundled clips.

**Their consequence for M2**, also recorded under "What this implies for
M2" above:

- Once tracking removes `match`, `describe` and `detect` from tracking-state
  frames, 23 ms of the 33 ms budget is already spent on acquisition.
- That leaves about **10 ms** for the tracker itself, tighter than the
  roughly 14 ms the 2026-09-19 wall-clip `acquire` (18.9 ms) appeared to
  leave.
- ADR-0001 point 5's **8 ms p95** threshold for tracker-side compute is
  therefore close to all the room there is.

## 2026-09-24 — M2: frame pyramid and patch alignment, off-device

> Not an on-device measurement. These numbers come from Node on the
> development container, and are translated to the reference device by a
> proxy stated below. They exist because ADR-0001 point 3 names the frame
> pyramid as the first step to move into the backend if tracker-side cost is
> too high, and that decision needs a number before `bench-nft.html` has a
> tracking mode to measure it where it counts (#48, "Evaluation").

**Method.** `packages/nft-tracker/scripts/bench-tracking.mjs` (run after
`npm run build`), three runs: Node v22.22.2, linux/x64, "Intel Xeon
Processor @ 2.80GHz" in a VM; p50 over 300 runs after 50 warm-up runs, on
deterministic synthetic frames. `.nvmrc` pins Node v24.18.0, which this
container does not have; the allocation cost described below is V8's, so it
may differ on the pinned version. The implementation is the one on branch
`feat/nft-tracker-align-patch`: `buildFramePyramid`'s box-over-triangle
filter at step `∛2`, and `alignPatch` with `P = 8` and `P = 16`
(`compile-target`'s default), `epsilon` 0.01 px, from predictions 1.8 px off.

**The proxy to the device.** The script also times the RGBA → grey loop
that `bench-nft` records as `gray`, on the camera path's 270×360 frame. On
the reference device that stage measured **1.2 ms** p50 (the rear-camera
runs above); here it measured 0.29–0.39 ms over six runs, so device ≈
here × 3.1–4.1 (the ratio moved between runs by that much). Both are plain
loops over typed arrays, but that is all they share: the device column is
an estimate, not a measurement. One known way it misleads: in this Node
build, allocating a typed array over 64 bytes costs about 2 µs, which
dominated `alignPatch` until its allocations were consolidated
(bit-identically); the grey loop allocates once and cannot see that cost.

| 270×360, step `∛2` | here p50 (3 runs) | device estimate |
|---|---|---|
| `buildFramePyramid`, 2 levels (1 computed) | 0.87–0.90 ms | 2.7–3.7 ms |
| 3 levels | 1.44–1.46 ms | 4.5–6.0 ms |
| 4 levels | 1.80–1.83 ms | 5.6–7.5 ms |
| 5 levels | 2.05–2.07 ms | 6.4–8.5 ms |
| 6 levels | 2.20–2.23 ms | 6.8–9.1 ms |
| `alignPatch`, `P = 8`, matched (≈ 4 iterations) | 13.7–16.3 µs | 42–67 µs |
| … with gain and bias (≈ 5 iterations) | 15.4–15.5 µs | 48–64 µs |
| … seen at twice its scale | 122–126 µs | 378–518 µs |
| `alignPatch`, `P = 16`, matched (≈ 3 iterations) | 35.3–36.0 µs | 109–148 µs |
| … with gain and bias (≈ 4 iterations) | 42.8–43.4 µs | 133–178 µs |
| … seen at twice its scale | 403–410 µs | 1.25–1.68 ms |

Other frame sizes, three runs: a four-level pyramid of 480×270 took
2.36–2.37 ms here, of 640×480 5.53–5.57 ms.

**Against the ~10 ms the camera path leaves for the tracker** ("What this
implies for M2" above):

- A four-level `∛2` frame pyramid alone is estimated at **5.6–7.5 ms** on
  the reference device: most of the budget, before a single patch is
  aligned. Each level costs about 60% of the one before it (it has 63% of
  the pixels), so the first computed level is half of a four-level
  pyramid's cost: building only the levels a tracker's patches use is worth
  doing, but even one level is about 3 ms.
- `compile-target`'s default, **64 patches of 16 × 16**, matched to the
  frame's scale: 2.3 ms here, estimated at **7.0–9.4 ms** on the device,
  and 8.5–11.4 ms with gain and bias. A patch costs about 2.5 times more at
  `P = 16` than at `P = 8`: four times the pixels, fewer iterations.
  Magnified patches cost 8 to 11 times more each (their footprints read 49
  frame samples per patch pixel at `σ = 2`), so a tracker should align few
  of them.
- Together that is 13–17 ms (14–19 with gain and bias): over the ~10 ms,
  and over the 8 ms p95 threshold of ADR-0001 point 5, before the robust
  homography, the pose, or any other step. At these defaults the patches
  cost as much as the pyramid.

**What this does and does not settle.** It supports trying point 3's first
move — the frame pyramid as an optional backend method — but does not by
itself trigger it: the thresholds are defined on the reference device, and
an on-device run of the tracking state replaces this estimate. It also
shows that moving the pyramid would not be enough on its own at
`compile-target`'s defaults: the patch budget (how many, how large, and at
which scale they are matched) is the other half. The TypeScript
implementation has had one pass of optimisation (unrolled four-tap passes,
3.08 → 1.87 ms here for four levels, bit-identical); integer arithmetic is
the obvious next pass if the pyramid stays in TypeScript.
