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

## Planned — `maxKeypoints` sweep (M2: patch tracking)

A measurement plan, written down **before** any of its runs, so the result
can be read against what was predicted rather than explained after the
fact. No numbers below are measurements unless they say so.

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
`stateless`, a 400-frame window covering each clip's full loop, desktop Chrome
(headless) on a laptop. `detect` is deterministic on identical pixels, but a
device's `drawImage` downscale can differ from the laptop's by a pixel's worth
of filtering, so treat these as approximate. The on-device export's
`numSceneKeypoints` is the authority.

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
