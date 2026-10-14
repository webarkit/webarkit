# 2026-10-14 — M4, round 0: the calibration block on Tab_9_WiFi

The session record of round 0, the calibration block of the jitter clause
(`README.md`, "The null control's jitter clause (2026-10-14)", item 3). It ran
under the plan as merged in [#122](https://github.com/webarkit/webarkit/pull/122)
and the procedure registered before it ran, in `ba29b89` ("Round 0, the
calibration block: the session's procedure (2026-10-14)"). Its eight runs are
not counted runs. They are round 0's input: s₀ and the first instance of the
operational reading.

**Result: the arm test accepts the block,** |D| = 0.0012953 px against
A = 0.0019834 px. So **s₀ = 0.0012672 px on 7 degrees of freedom**, with a 95%
interval of 0.0008378 to 0.0025790 px. For a block with two baseline runs, the
operational reading rejects when |x₁ − x₂| > 3.3441 × s₀ = **0.0042375 px**.

## The session

- **The device:** Tab_9_WiFi (`Tab9WEEA0001504`), Android 10.
- **The browser:** Chrome **154.0.8037.126**, read from `chrome://version` on
  the tablet before run 1 (the setup's item 5). The package manager's
  `versionName` agrees. Each export's `userAgent` carries only
  `Chrome/154.0.0.0`.
- **The build:** attested at `37dc6d4`, not redone. The checkout's HEAD during
  the runs was `ba29b89`, on `docs/m4-calibration`, whose commits since
  `37dc6d4` touch no frozen path.
- **The route:**
  - the server, `npx http-server -p 8093 -s -c-1` (http-server 14.1.1), at the
    repository root;
  - the tunnel, `adb -s Tab9WEEA0001504 reverse tcp:8093 tcp:8093`, with adb
    1.0.41 (35.0.1-11580240);
  - the page, `http://localhost:8093/examples/bench-nft.html?…`.
- **Who did what:** as registered. The session's PC ran the server, the tunnel,
  the link monitor, each run's `am start`, each pull and each check. The
  maintainer, at the tablet, typed the device label, pressed Start and Download
  JSON, and closed each run's tab.
- **The times:** run 1's URL was opened at 11:54:43Z, and run 8's link monitor
  ended at 12:17:41Z. All times here are UTC; adb's own log writes local time,
  UTC+2.

## Before the first run

| Check | Result |
|---|---|
| Step 1: `git diff --stat 37dc6d4 HEAD -- examples/bench-nft.html examples/js scripts packages` | nothing |
| Step 2: `git status --porcelain --untracked-files=all -- …` | nothing |
| Step 3: `curl -sI http://localhost:8093/examples/js/bench-metrics.mjs` | `cache-control: no-cache, no-store, must-revalidate`; `Accept-Ranges: bytes`; `application/javascript`. A range request on the clip returned `206` |
| Step 4: `examples/dist/provenance.json` | head `37dc6d4fa3507992bbe7e13cd8da7cb759b7265c`, `clean: true`, `dirtyPaths: []`, bundle `3a2567c15d59…`, built 2026-10-13T13:37:40Z, toolchain node v24.21.0 and esbuild 0.28.2 |
| The bundle and the 9 served files on disk | each hashes as the manifest says |
| The target, `examples/targets/pinball.wnft` | `9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282`, the recorded value |
| `stall-check.mjs` | `cccb475bcc74f29fb6592577e31cdcf7eb5d2bb511c39d5e6a8c4edf3cf7f1be`, byte-identical to the copy in [`2026-10-01-m3-session-additions.md`](./2026-10-01-m3-session-additions.md) |
| Chrome's cached files on the tablet | cleared, by the maintainer |
| The tablet's download folder | no `bench-nft-*` file, `.trashed-…` included |
| Desktop Chrome's "Discover USB devices" | unticked, by the maintainer |

**The link, before the quiet period.**
- **What happened:** the tablet first attached as `unauthorized`. Once it was
  authorized, adb's log recorded 27 `connection terminated: read failed` lines
  naming it, from 11:42:41Z to 11:47:53Z. Each reconnection brought the
  authorization prompt back, as on 2026-10-13 (the setup's item 3).
- **What was on the PC:** one adb client, `platform-tools\adb.exe`.
- **What changed:** the maintainer replaced the USB cable, and unticked desktop
  Chrome's "Discover USB devices". Both changed at about the same time, so
  which one stopped the drops is not known.
- **The readiness condition:** the link was watched from 11:48:26Z to
  11:53:29Z. No `connection terminated` line was written, and the device stayed
  on `transport_id:28`. There was no further drop until the last link monitor
  ended, at 12:17:41Z. That is 29 minutes 47 seconds after the last drop,
  which covers the whole block.

## The runs

The order was S W W S S W W S, each run at its registered position. **No run
failed a run-level check, so no run was re-run.** No Start was refused:
- each run's URL was opened once;
- the maintainer reported no refusal;
- each export's `provenance.refusal` is `null`.

| # | Export (`2026-10-14-tab9-m4-calibration-…`) | Opened | Run (`run.startedAtIso` → `endedAtIso`) | Link monitor | Export SHA-256 |
|---|---|---|---|---|---|
| 1 | `sync-static-1` | 11:54:43 | 11:55:26 → 11:56:27 | 11:54:43 → 11:56:54 | `f1ea1f262b7bd55f…` |
| 2 | `worker-static-1` | 11:57:16 | 11:57:58 → 11:58:59 | 11:57:15 → 11:59:44 | `872682bc1d77d4de…` |
| 3 | `worker-static-2` | 12:00:13 | 12:00:53 → 12:01:54 | 12:00:13 → 12:02:57 | `4bda92813616aeac…` |
| 4 | `sync-static-2` | 12:04:08 | 12:04:47 → 12:05:49 | 12:04:07 → 12:06:59 | `9a5bb1396118b1a4…` |
| 5 | `sync-static-3` | 12:07:18 | 12:07:56 → 12:08:57 | 12:07:18 → 12:09:47 | `1f33190a50c4d495…` |
| 6 | `worker-static-3` | 12:10:04 | 12:10:42 → 12:11:43 | 12:10:04 → 12:11:54 | `db923bb86fe3ba22…` |
| 7 | `worker-static-4` | 12:12:29 | 12:13:16 → 12:14:17 | 12:12:28 → 12:14:27 | `f220478fbc57e731…` |
| 8 | `sync-static-4` | 12:15:01 | 12:15:26 → 12:16:27 | 12:15:00 → 12:17:41 | `43b9b38ab3e8bf73…` |

Each export is the page's file, pulled from the tablet's download folder by
`adb pull`. Its SHA-256 on the tablet equals the committed file's.

**Every run, every check:**
- **Rule 1:** `run.failure` is `null`, and `run.endedBy` is `"done"`.
- **Rule 2:** the manifest's head is `37dc6d4…` in full, `clean: true`,
  `dirtyPaths: []`, and the two agree. The bundle `3a2567c15d59…` is in the
  manifest and as observed.
- **Rule 3, the field check,** on the first form without `&run=`:
  - `mode` `tracking`, and `target` `wnft`, `targets/pinball.wnft` and
    `9e8eb486…` in full;
  - `detection.path` its name's, and `bundledClip` `pinball-static.mp4` with
    `source` `bundled`;
  - `loops` `{1, 4}`, and `run.order` `null`;
  - `maxKeypoints` 300, `processingBox` 480 × 360 and `camera` `null`;
  - all 11 options `?tracker=` can set, each equal to the package's default,
    read from the frozen bundle's `DEFAULT_*` exports;
  - `ticks` equal to `windowSize`;
  - `protocol.sessionRun` `false`, with its one gap `run.order none`.
- **Rule 3, the recorded URL:** `<export>.url.txt` reads the pinned string
  with its slots filled, character for character.
- **The link:** no `connection terminated` line, and adb's log gained 0 bytes.
  `transport_id` was 28 at both ends, and the mapping was present at both ends.
- **The stall check** (`stall-check.mjs`, `cccb475b…`): every run passes,
  reading loops 1 to 4, with no excess over 240.8 ms in any counted loop. Its
  largest gap over the whole run, by run:

  | # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | Largest gap (ms) | 366.7 | 133.3 | 166.7 | 233.3 | 200.0 | 133.3 | 133.3 | 200.0 |
  | At frame | 2 | 7 | 7 | 1 | 1 | 90 | 6 | 1 |

  Run 1's 366.7 ms, at frame 2, is in the warm-up loop.
- **Reported, not gating:** `run.lostVisibility` is `false` in all eight.
- **The environment:** `userAgent` Android with `Chrome/154.0.0.0`, and
  `deviceLabel` `Tab_9_WiFi`.

**Three things about the procedure itself, recorded as they happened.**
- **Run 1's pull was attempted twice.** The first attempt failed before any
  file was copied: Git Bash rewrote the device path `/sdcard/…` into a Windows
  path. The helper was fixed (`MSYS_NO_PATHCONV=1`), and the pull repeated. The
  link monitor had not yet ended, so its log covers both attempts.
  - Run 1's `am start` was issued before that fix. The same argument, passed to
    another native program under Git Bash's default conversion, came through
    unchanged.
  - The field check confirms every parameter's effect.
- **Run 2's URL was opened before the maintainer had confirmed that run 1's
  tab was closed.** The instruction given was to close it before pressing
  Start. That it was closed before Start is not separately recorded.
- **The `.url.txt` and `.link.txt` names drop `.json`.** They are
  `<export's stem>.url.txt` and `.link.txt`, so that no `*.json` glob takes
  them in.

## After the eighth

- **Step 6** (step 2 again) printed nothing, and step 1 again printed nothing.
- **Step 7, read for round 0:**
  - eight exports, each with its `.url.txt` and `.link.txt`;
  - in each, `run.order` `null`, `loops.loopCount` 4, `bundledClip`
    `pinball-static.mp4`, `detection.path` its name's, and
    `provenance.manifest.head` `37dc6d4…`;
  - each run started after the one before it ended.
- **Storage:** the eight exports are 15.6 MB on disk. Before them,
  `docs/benchmarks` was 9.4 MB stored, by the plan's command ("How exports are
  stored"). The PR reports the figure on its own branch. That is under the
  20 MB trigger, so the exports stay plain JSON.

No `jitterPx` was read until here.

## Item 3's computations

**Each run's x, `runSummary.jitterPx` over counted loops 1 to 4.**
- It was recomputed from the export's frames with `cornerJitter` over
  `countedLoopFrames` (`examples/js/bench-metrics.mjs`, imported unchanged).
  In all eight, the recomputed value equals the recorded one exactly, and so
  does the window count.
- Every counted frame of every run is TRACK.

| # | Path | x (px) | Counted frames | Windows | Loop 1 | Loop 2 | Loop 3 | Loop 4 |
|---|---|---|---|---|---|---|---|---|
| 1 | sync | 0.14152500 | 960 | 49 | 0.140974 | 0.139850 | 0.142917 | 0.142453 |
| 2 | worker | 0.14055396 | 1000 | 50 | 0.139626 | 0.142270 | 0.139640 | 0.140641 |
| 3 | worker | 0.14228266 | 783 | 48 | 0.143688 | 0.141691 | 0.142775 | 0.140905 |
| 4 | sync | 0.13809289 | 1005 | 50 | 0.138845 | 0.139641 | 0.138848 | 0.134838 |
| 5 | sync | 0.14026936 | 864 | 49 | 0.145291 | 0.139442 | 0.138289 | 0.138020 |
| 6 | worker | 0.14077755 | 994 | 50 | 0.139250 | 0.139672 | 0.143814 | 0.140449 |
| 7 | worker | 0.14152454 | 996 | 52 | 0.138483 | 0.143631 | 0.143764 | 0.140204 |
| 8 | sync | 0.14007036 | 1003 | 52 | 0.141889 | 0.138517 | 0.139359 | 0.140464 |

In every run, the per-loop window counts sum to the run's count (item 2's
partition).

**The arm test, round 0's acceptance,** read with the frame-set variation in
(the clause's "Where it does not" ruling).
- **The sync arm:** 0.141525, 0.138093, 0.140269 and 0.140070, mean
  **0.1399894** px.
- **The worker arm:** 0.140554, 0.142283, 0.140778 and 0.141525, mean
  **0.1412847** px.
- **D** = 0.1412847 − 0.1399894 = **0.0012953 px**.
- **s_p** = √((SS_sync + SS_worker) ÷ 6) = √((6.0398 × 10⁻⁶ + 1.8446 × 10⁻⁶) ÷ 6)
  = **0.0011463 px**, on 6 degrees of freedom.
- **A** = t(0.975; 6) × √(1/4 + 1/4) × s_p = 2.4469 × 0.70711 × s_p =
  1.7302 × s_p = **0.0019834 px**.
- **|D| = 0.0012953 ≤ A = 0.0019834: accepted.**
  - The margin is A − |D| = **0.0006881 px**.
  - As a t statistic, t = 1.598 on 6 degrees of freedom, two-sided p = 0.161.
  - The arms are found one population of repeats; the worker arm is not shown
    to differ from the sync arm.
- **The power table, in px,** with σ taken as s₀:

  | The arms' true difference δ | 0.5 σ | 1 σ | 1.5 σ | 2 σ | 2.5 σ | 3 σ |
  |---|---|---|---|---|---|---|
  | δ in px | 0.000634 | 0.001267 | 0.001901 | 0.002534 | 0.003168 | 0.003801 |
  | Blocks rejected | 0.092 | 0.223 | 0.430 | 0.657 | 0.836 | 0.939 |

**s₀, the standard deviation of all eight, on 7 degrees of freedom.**
- **The values:** the eight have mean 0.1406370 px and range 0.138093 to
  0.142283, which is 0.0041898 px.
- **s₀** = √(SS ÷ 7) = √(1.12399 × 10⁻⁵ ÷ 7) = **0.0012672 px**.
- **Its 95% interval** runs from s₀ × √(7 ÷ 16.0128) to s₀ × √(7 ÷ 1.6899),
  that is from 0.6612 s₀ to 2.0353 s₀: **0.0008378 to 0.0025790 px**.

**The provisional threshold: the operational reading, against s₀.**
- **The rule (item 3):** a block whose baseline arm has k runs has v_b, the
  sample variance of their x, on k − 1 degrees of freedom. The block is
  rejected when v_b ÷ s₀² > F(0.95; k − 1, 7).
- **k = 2, a bracketed block, as M3's were.**
  - With two runs, v_b = (x₁ − x₂)² ÷ 2.
  - So the rule is (x₁ − x₂)² ÷ 2 > F(0.95; 1, 7) × s₀², that is,
    |x₁ − x₂| > s₀ × √(2 × F(0.95; 1, 7)).
  - F(0.95; 1, 7) = t(0.975; 7)² = 2.3646² = 5.5914, so the factor is
    √(2 × 5.5914) = 3.3441.
  - **Reject when |x₁ − x₂| > 3.3441 × 0.0012672 = 0.0042375 px.**
- **k = 3:** reject when v_b > 4.7374 × s₀² = 7.6069 × 10⁻⁶ px², a
  baseline-arm SD above 0.0027581 px.
- **k = 4:** reject when v_b > 4.3468 × s₀² = 6.9797 × 10⁻⁶ px², a
  baseline-arm SD above 0.0026419 px.
- **k is set by the run order,** which is not written yet. Until a round's
  reading of record has 7 degrees of freedom, the larger of this threshold and
  the round's own binds (item 3, the second change).
- **The power table for k = 2, in px,** with σ taken as s₀:

  | The shift Δ inside the block | 1 σ | 2 σ | 3 σ | 4 σ | 5 σ |
  |---|---|---|---|---|---|
  | Δ in px | 0.001267 | 0.002534 | 0.003801 | 0.005069 | 0.006336 |
  | Blocks rejected | 0.094 | 0.232 | 0.449 | 0.681 | 0.856 |

**The within-run check:** 8 runs by 4 loops, read unweighted.

| Source | SS (px²) | Degrees of freedom | Mean square |
|---|---|---|---|
| Runs | 4.6004 × 10⁻⁵ | 7 | 6.5719 × 10⁻⁶ |
| Loops | 9.7634 × 10⁻⁶ | 3 | 3.2545 × 10⁻⁶ |
| Residual (within run) | 9.3964 × 10⁻⁵ | 21 | 4.4745 × 10⁻⁶ |

- F = 6.5719 ÷ 4.4745 = **1.4688** on 7 and 21 degrees of freedom, against
  its 95% point, 2.4876 (p = 0.232).
- So the runs do not differ by more than sampling within a run makes them
  differ. It gates nothing.

**M3's four:** an independent estimate, and a weak comparison, gating
nothing. They are Chrome 153, `0304390`, 2026-10-01, from
`2026-10-01-tab9-m3-{sync,worker}-static-{1,2}.json`, and each recomputed x
equals its recorded one.
- **The values:** sync 0.141634 and 0.141749; worker 0.141916 and 0.142400.
- **Round 0's rule with two runs an arm:**
  - D = 0.0004668 px, and s_p = 0.0002486 px on 2 degrees of freedom.
  - A = 4.3027 × s_p = 0.0010697 px.
  - |D| ≤ A, with a margin of 0.0006029 px.
- **s_M3 = 0.0003374 px** on 3 degrees of freedom. Its 95% interval is
  0.0001911 to 0.0012581 px.
- **Their within-run check:** F = 5.2361 × 10⁻⁷ ÷ 3.9712 × 10⁻⁶ = 0.1318, on
  3 and 9 degrees of freedom, against a 95% point of 3.8625 (p = 0.939).
- **s₀ against s_M3:** F = (s₀ ÷ s_M3)² = **14.1030**, on 7 and 3 degrees of
  freedom.
  - It lies inside 0.1698 to 14.6244, so **the two are not told apart**.
  - It is a weak comparison, with 3 degrees of freedom on one side, and it
    lies near the upper bound.
  - A difference between the two estimates cannot be attributed to Chrome:
    the page and its harness changed between `0304390` and `37dc6d4` too
    (item 3).

**The statistical constants.** Every quantile above was recomputed
numerically for this record:
- t(0.975; 6), (0.975; 7) and (0.975; 2);
- F(0.95; 1, 7), (0.95; 2, 7), (0.95; 3, 7), (0.95; 7, 21), (0.975; 7, 3) and
  (0.025; 7, 3);
- χ²(0.975; 7) and (0.025; 7).

Each equals the plan's registered value to its four decimals. F(0.95; 3, 9)
= 3.8625 is not in the plan; the plan names M3's within-run check but not its
95% point.

## Recorded beside, not part of any reading

These are descriptive rows. No verdict is drawn from them.

**The cost of a frame was not one value within the block.**
- The tracker's own steps were the same in all eight runs and in M3's four:
  `trackStepMs` p50 9.2 to 9.4 ms, `alignMs` p50 8.8 to 8.9 ms.
- `acquire` was not, and with it the frames each run processed:

| # | Path | `acquire` p50 (ms) | `total` p50 (ms) | Counted frames | Frames a second |
|---|---|---|---|---|---|
| 1 | sync | 28.3 | 38.9 | 960 | 19.73 |
| 2 | worker | 28.1 | 38.7 | 1000 | 20.55 |
| 3 | worker | 42.1 | 52.7 | 783 | 16.09 |
| 4 | sync | 27.6 | 38.1 | 1005 | 20.65 |
| 5 | sync | 37.3 | 48.0 | 864 | 17.75 |
| 6 | worker | 27.8 | 38.3 | 994 | 20.42 |
| 7 | worker | 28.2 | 38.7 | 996 | 20.47 |
| 8 | sync | 28.3 | 38.8 | 1003 | 20.61 |
| M3, four | both | 40.8 to 40.9 | 51.2 to 51.4 | 815 to 822 | 16.75 to 16.89 |

- **What the plan said.** For "round 0's arms are one pipeline at one cost of
  a frame", the plan cited M3's `total` p50, 51.2 to 51.4 ms in both arms. In
  round 0:
  - every counted frame is TRACK, as there;
  - but `total` p50 is 38.1 to 38.9 ms in six runs, and 48.0 and 52.7 ms in
    runs 5 (sync) and 3 (worker), one in each arm.
- **What it does not change.** The exclusion of common media times from the
  clause's own readings rests on the general reason, which this does not
  touch. The frame-set variation is in, as the clause and the brief require.
- **Why it is recorded.** Which frames a run processes is the quantity #123
  and the common-media-times ruling turn on, and here it moved between runs
  of one block.

**Beside #123's figures.**
- **The two spreads:** round 0's s₀, 0.0012672 px, against the 0.0013 to
  0.0015 px by which M3's record found a 10% resample moves one run's
  `jitterPx`. Round 0's eight-run range, 0.0041898 px, against M3's four-run
  range, 0.00077 px.
- **The within-run checks:** round 0's F is 1.4688 on 7 and 21; M3's is
  0.1318 on 3 and 9.
- **Round 1's baselines:** their 0.0092 px apart on common footage (#123) is
  7.3 × s₀. Against the power table for k = 2, that lies beyond 5 σ.
- #123 names this block as what decides its question; the reading is the
  maintainer's.

## The acquire finding (added on 2026-10-14, after the maintainer's review)

The maintainer ruled that the cost of a frame, recorded above with no verdict,
gets one. This section gives the parts of that verdict which the data in hand
decides, and the figures asked for with it. Nothing in it changes a rule of
the plan.

**What moved, and when.**
- `acquire` p50, the copy of a video frame into pixels, read by run:

  | # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | `acquire` p50 (ms) | 28.3 | 28.1 | 42.1 | 27.6 | 37.3 | 27.8 | 28.2 | 28.3 |

  So it moved from about 28 ms to 42.1 ms between runs 2 and 3, back to
  27.6 ms at run 4, to 37.3 ms at run 5, and back to about 28 ms for runs 6
  to 8.
- **It moved within one block.** The block took 21 minutes, from run 1's
  start at 11:55:26Z to run 8's end at 12:16:27Z.
- **It moved between consecutive runs, and in both directions,** not as a
  drift across the block.
- **M3's four,** on 2026-10-01, read 40.8 to 40.9 ms in all four.
- **What did not move:** the tracker's own steps, in all twelve runs
  (`trackStepMs` p50 9.2 to 9.4 ms, `alignMs` p50 8.8 to 8.9 ms).

**One of the plan's two supports for leaving the frame-set variation in is
cut, and round 0 cut it.**
- **The two supports.** The clause's "Where it does not" ruling excludes
  common media times from its own readings for two reasons:
  - the general reason: in a calibration of noise, which frames a run
    processed is part of the noise, and removing it makes the calibrated
    spread too small;
  - a supporting fact: round 0's arms are one pipeline at one cost of a
    frame, cited from M3's `total` p50, 51.2 to 51.4 ms in both arms.
- **Round 0 refutes the supporting fact for itself.** Its cost of a frame was
  not one value: `total` p50 was 38.1 to 38.9 ms in six runs, and 48.0 and
  52.7 ms in two of them.
- **The conclusion stands, on the general reason alone.** s₀, the arm test
  and every reading above keep the frame-set variation in, as that reason
  requires.

**Does a run's `acquire` cost predict its `jitterPx`?** The Pearson
correlation across the eight runs, with a = `acquire` p50 and x = `jitterPx`:
- **The means:** ā = 30.9625 ms, and x̄ = 0.1406370 px.
- **The sums of squares and products:**
  - S_ax = Σ (a − ā)(x − x̄) = 2.103892 × 10⁻² ms·px;
  - S_aa = 215.5187 ms²;
  - S_xx = 1.123987 × 10⁻⁵ px².
- **r = S_ax ÷ √(S_aa × S_xx) = 0.4275,** so r² = 0.1827.
  - As a test of r = 0: t = r × √6 ÷ √(1 − r²) = 1.158 on 6 degrees of
    freedom, two-sided p = 0.291.
  - The slope is 9.76 × 10⁻⁵ px per ms, which over 28 → 42 ms is 0.00137 px.
- **Each run's product (a − ā)(x − x̄)** shows where r comes from:

  | # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | Product (10⁻³) | −2.36 | 0.24 | **18.33** | 8.55 | −2.33 | −0.44 | −2.45 | 1.51 |

- **r with each run left out in turn:**

  | Run left out | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | r | 0.513 | 0.432 | **0.004** | 0.404 | 0.547 | 0.450 | 0.516 | 0.407 |

  **Without run 3, r = 0.004.** The other slow run, run 5, has an x below the
  block's mean, at 0.140269 px.
- **The six runs at one `acquire` cost carry the block's spread on their
  own.** Runs 1, 2, 4, 6, 7 and 8, at 27.6 to 28.3 ms:
  - x spans 0.138093 to 0.141525 px, a range of 0.0034321 px;
  - their standard deviation is **0.0012747 px** on 5 degrees of freedom,
    against s₀ = 0.0012672 px on all eight.
- **The rank correlation:** Spearman's ρ = 0.467.
- **What eight runs can see.** A true r of 0.43 would be detected, at
  two-sided 5%, about 17% of the time (Fisher's z).
- **The reading:** on this block, the `acquire` cost of a run does not
  predict its `jitterPx` beyond one run, run 3. Eight runs cannot exclude a
  moderate relation.
- *Reported, not ruled on.* Whether `acquire` becomes a covariate that round
  1 reads per block is the maintainer's decision. It is already recorded per
  run in every export (`summaryMs.acquire`).

**Where the two slow runs fell, and what it did to the arm test.**
- **The question:** runs 3 (worker) and 5 (sync), one in each arm. What would
  the arm test have read had both fallen in one arm?
- **The method:** hold each run's x as measured, and relabel which four runs
  are the worker arm. There are 70 ways; each gets the same D, s_p and A as
  above.
- **What it gives:**

  | Labelings | Count | Rejected | \|D\| larger than the actual 0.0012953 px |
  |---|---|---|---|
  | Runs 3 and 5 in the same arm | 30 | 0 | 2 |
  | Runs 3 and 5 in different arms, as they ran | 40 | 2 | 8 |
  | All | 70 | 2 | 10 |

  - The two labelings that reject, `{1,3,6,7}` and its complement, both
    split runs 3 and 5.
  - In the 30 that put both in one arm, |D| runs from 0.0001891 to 0.0015267
    px, with a median of 0.0007994.
- **Why:** run 3's x is the block's highest, 0.142283 px, and run 5's is
  below the mean, 0.140269. In one arm they offset: their mean, 0.1412760 px,
  is 0.00085 px from the other six's 0.1404241.
- **What it does not test:** a placement that would also have changed the
  values themselves. It holds each run's x as measured, which the accepted
  arm test supports.

## Not done

- **No independent read of this record before its PR.** The session's brief
  excluded subagents.
- **#114's figures:** its criterion is read before the first counted run of
  each round, against that round's pipeline. Round 0 has no counted run, so
  the figures are not read here. Each run's largest gap is in the stall check
  above.
- **No comment on #114, #123 or #124** was posted from this session.
- **No treatment round was started.** Round 1 waits on #124.
