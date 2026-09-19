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
an explanation.

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
