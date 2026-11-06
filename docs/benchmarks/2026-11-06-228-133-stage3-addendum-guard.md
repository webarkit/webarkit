# #133, the guard's addendum: G0 to G5 run against the implementation (2026-11-06)

**An addendum to the registration at `e076734`,
[`2026-11-06-228-133-stage3-registration.md`](./2026-11-06-228-133-stage3-registration.md): it checks G0 to G5 on
[#133](https://github.com/webarkit/webarkit/issues/133)'s implementation, each both ways, and reports Stage 2's
covariates per clip. It registers nothing new.** The registration is not edited. The implementation is the `poseGuard`
option of `NftTracker` and `packages/nft-tracker/src/pose/pose_guard.ts`.

**Every criterion held.** One sentence of the registration did not hold as written, and it is a negative's figure, not a
criterion: see G3.

| Criterion | Verdict | The figure it is read on |
|---|---|---|
| G0, off is off | **held** | R-replay `98323f06…` and R-truth `d1d427f3…`, 6,026,097 bytes; `{ mode: "off" }` equal on every leaf of the shipped sequences; no existing test file changed |
| G1, on is the rule, bit for bit | **held** | seeds 1 to 8, the six clips, all three schedules, 6 loops: no element and no other field differs |
| G2, the counter | **held** | the count equals off + guarded and not fallen back on every run; on the table clip at every frame, 12 / 24 / 30 off against 1242 / 1260 / 1314 on |
| G3, the probes' figures | **held** | every cell equal as printed, on 18 clip and schedule rows |
| G4, the parameter | **held** | constructed cases at 10 and at 25 and at a frame's own tilt; `T` = 7's rows on the first record's clips; each refusal by name |
| G5, with the filter | **held** | static, wall and cross clips at seed 1: 2178, 1284 and 2502 posed frames, each the filter on the guard's output |

## Step 0: base, toolchain and the brief's check

- **The base:** `feat/133-pose-guard`, branched from `origin/dev` at `26aff41e65cdd2f67a09e08420c2402dab43959c`, the merge
  of [#234](https://github.com/webarkit/webarkit/pull/234), which carried the registration. Node v24.21.0, the pin; ffmpeg 9; Windows 11. The session ran on Claude Opus 5.5, with no advisor, as the brief says.
- **The tree the figures are read on:** `151dae9`, built with `npm run build` from it, clean at both ends of every
  counted run: `git diff HEAD | sha256sum` `e3b0c442…`, the empty diff, and an empty `git status --short`, on stderr.
  The only commit after it is this file's, which the check does not read.
- **The check:** [`2026-11-06-228-133-stage3-guard-check.mjs`](./2026-11-06-228-133-stage3-guard-check.mjs). Its own
  `--self-test` passes. Two counted runs gave byte-identical stdout, **SHA-256 `ff4496333fad3d2d4dfeaa8d8019842d902dd1d6f428e3e0d9060ba55dbba8d4`**, each exit 0, in
  1666.9 s and 1746.5 s. Every figure below is in that stdout, apart from G0's hashes, which are the registered references script's
  output, and the negatives' table, which is the same script's `--negatives` stdout, **SHA-256 `0dbaaa1ef319f79ba7df44c48b2bf0009521cd55d05b396f3605bb5d73c3f713`**.
- **The brief's check.** Each citation the brief makes held at the base, with one difference that needed no stop: the brief
  puts G4's tests in the package's suite, and G4's `T` = 7 on the first record's sensitivity rows needs the clips, which
  CI's `npm test` has no ffmpeg to decode. That leg is in the dated script, and G4's constructed cases and refusals are in the
  suite.
- **Seen before the check ran:** the registration, the two probes' records and their scripts. The guard's arm had been measured
  by the probes on one run's frames; the registration says so, and calls these checks and not predictions.

## G0, off is off: held

- **The references, with the option absent,** read with the registered
  [`2026-11-06-228-133-stage3-references.mjs`](./2026-11-06-228-133-stage3-references.mjs) from a clean build of the
  implementation at `151dae9`, the tree the same at both ends: R-replay
  `98323f061ecef7022d536c22f024d374a119edcd8ce6af3927b37309f2c6b546` and R-truth
  `d1d427f33ce819ab5760377dcb3999ba979b09ab402a51a830895e27203c4f8f`, 6,026,097 bytes. Both equal the registered values.
- **`{ mode: "off" }`, which neither reference can set:** `test/tracker_pose_guard.test.ts` holds every result of the
  shipped sequences, recursively, `Object.is` on each leaf, equal to the absent arm's.
- **`npm test` passes with no existing test file modified or deleted:** `git diff --stat origin/dev` on `packages/*/test` and
  `examples/test` lists only the two new files.
- **The negative:** a key `poseGuard: null` on every result changes R-truth to 6,035,566 bytes, `abd2feaa…`, and fails the new
  test. `{ mode: "off" }` made to differ from the absent arm fails it too.

## G1 and G2: the rule and the counter, held

Every frame of every run, all three schedules, seeds 1 to 8, through `replayRun` with the probes' decoding, stamped
`unwrapped: true`, two trackers on one run's frames. **The check's decoding and its off arm equal `replay-clips.mjs`'s
`--external` arm 1 export, seed 1, at every frame, `trackerTimings` apart, on the three clips that export exists for.**
The closed form with `good: false` occurred on no frame of the counted loops (`ok frames with no tilt` is 0 in every row of the
covariates), so that branch is read there only on G4's constructed case.

| clip | schedule | frames a run | guarded a run, all 6 loops | both guarded and fallen back, a run | fallbackFrames off | fallbackFrames on |
|---|---|---|---|---|---|---|
| pinball-static.mp4 | every | 2178 / 2178 / 2178 | 2178 / 2178 / 2178 | 0 / 0 / 0 | 0 / 0 / 0 | 2178 / 2178 / 2178 |
| pinball-static.mp4 | 15 | 1091 / 1091 / 1091 | 1091 / 1091 / 1091 | 0 / 0 / 0 | 0 / 0 / 0 | 1091 / 1091 / 1091 |
| pinball-static.mp4 | 25 | 1091 / 1091 / 1091 | 1091 / 1091 / 1091 | 0 / 0 / 0 | 0 / 0 / 0 | 1091 / 1091 / 1091 |
| pinball-bench.mp4 | every | 1788 / 1788 / 1788 | 324 / 324 / 330 | 0 / 0 / 0 | 6 / 15 / 36 | 330 / 342 / 366 |
| pinball-bench.mp4 | 15 | 1212 / 1224 / 1284 | 264 / 282 / 288 | 0 / 0 / 6 | 6 / 36 / 48 | 282 / 309 / 330 |
| pinball-bench.mp4 | 25 | 655 / 671 / 684 | 102 / 118 / 138 | 0 / 0 / 6 | 24 / 29 / 36 | 126 / 149 / 168 |
| pinball-bench-table.mp4 | every | 1602 / 1602 / 1602 | 1230 / 1248 / 1308 | 6 / 9 / 12 | 12 / 24 / 30 | 1242 / 1260 / 1314 |
| pinball-bench-table.mp4 | 15 | 657 / 682 / 690 | 542 / 575 / 589 | 6 / 12 / 17 | 9 / 19 / 28 | 558 / 578 / 595 |
| pinball-bench-table.mp4 | 25 | 657 / 682 / 690 | 542 / 575 / 589 | 6 / 12 / 17 | 9 / 19 / 28 | 558 / 578 / 595 |
| pinball-tilt-cross.mp4 | every | 2502 / 2502 / 2502 | 1488 / 1488 / 1488 | 6 / 6 / 6 | 6 / 6 / 6 | 1488 / 1488 / 1488 |
| pinball-tilt-cross.mp4 | 15 (borrowed) | 1243 / 1243 / 1243 | 739 / 739 / 739 | 6 / 6 / 6 | 6 / 6 / 6 | 739 / 739 / 739 |
| pinball-tilt-cross.mp4 | 25 (borrowed) | 1243 / 1243 / 1243 | 739 / 739 / 739 | 6 / 6 / 6 | 6 / 6 / 6 | 739 / 739 / 739 |
| pinball-tilt-mid.mp4 | every | 3942 / 3942 / 3942 | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 4 / 7 | 1 / 4 / 7 |
| pinball-tilt-mid.mp4 | 15 (borrowed) | 966 / 1927 / 1928 | 0 / 1 / 6 | 0 / 1 / 6 | 1 / 1 / 54 | 1 / 1 / 54 |
| pinball-tilt-mid.mp4 | 25 (borrowed) | 966 / 1927 / 1928 | 0 / 1 / 6 | 0 / 1 / 6 | 1 / 1 / 54 | 1 / 1 / 54 |
| pinball-tilt-sweep.mp4 | every | 5208 / 5208 / 5208 | 0 / 0 / 12 | 0 / 0 / 0 | 13 / 25 / 102 | 13 / 25 / 102 |
| pinball-tilt-sweep.mp4 | 15 (borrowed) | 2460 / 2556 / 2574 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 22 / 66 | 7 / 22 / 66 |
| pinball-tilt-sweep.mp4 | 25 (borrowed) | 2460 / 2556 / 2574 | 0 / 0 / 0 | 0 / 0 / 0 | 7 / 22 / 66 | 7 / 22 / 66 |

"Fallen back" is the off run's selection. On each row `fallbackFrames` on equals off plus the guarded frames that had not
fallen back. A frame both guarded and fallen back is counted once.

## G3: the probes' figures, held

Counted loops 1 to 4 of 6, min / median / max over the seeds, compared with the registered cells as printed, read through the
option. **The 15 and 25 ms rows on the three tilt clips carry the borrowed acquisition constant.** Cross's one crossing reads as
registered: at 8.297 s, tilt 9.99° to 10.11°, 4.33 px, on 37 inliers.

| clip | schedule | handed to CF | of | IPPE already CF | pose changed | switches a run | in the footage | at a wrap |
|---|---|---|---|---|---|---|---|---|
| pinball-static.mp4 | every | 1452 / 1452 / 1452 | 1452 / 1452 / 1452 | 0 / 0 / 0 | 1452 / 1452 / 1452 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| pinball-static.mp4 | 15 | 728 / 728 / 728 | 728 / 728 / 728 | 0 / 0 / 0 | 728 / 728 / 728 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| pinball-static.mp4 | 25 | 728 / 728 / 728 | 728 / 728 / 728 | 0 / 0 / 0 | 728 / 728 / 728 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| pinball-bench.mp4 | every | 216 / 216 / 220 | 844 / 848 / 856 | 0 / 0 / 0 | 216 / 216 / 220 | 31 / 31 / 39 | 28 / 28 / 36 | 3 / 3 / 3 |
| pinball-bench.mp4 | 15 | 176 / 188 / 192 | 692 / 702 / 740 | 0 / 0 / 4 | 176 / 186 / 188 | 23 / 43 / 55 | 20 / 40 / 52 | 3 / 3 / 3 |
| pinball-bench.mp4 | 25 | 68 / 78 / 92 | 316 / 335 / 340 | 0 / 0 / 4 | 68 / 78 / 88 | 15 / 23 / 31 | 12 / 20 / 28 | 3 / 3 / 3 |
| pinball-bench-table.mp4 | every | 820 / 832 / 872 | 844 / 860 / 900 | 4 / 6 / 8 | 812 / 826 / 868 | 15 / 23 / 31 | 12 / 20 / 28 | 3 / 3 / 3 |
| pinball-bench-table.mp4 | 15 | 360 / 381 / 398 | 380 / 397 / 416 | 4 / 8 / 12 | 352 / 372 / 392 | 7 / 15 / 23 | 4 / 12 / 20 | 3 / 3 / 3 |
| pinball-bench-table.mp4 | 25 | 360 / 381 / 398 | 380 / 397 / 416 | 4 / 8 / 12 | 352 / 372 / 392 | 7 / 15 / 23 | 4 / 12 / 20 | 3 / 3 / 3 |
| pinball-tilt-cross.mp4 | every | 992 / 992 / 992 | 1668 / 1668 / 1668 | 4 / 4 / 4 | 988 / 988 / 988 | 7 / 7 / 7 | 4 / 4 / 4 | 3 / 3 / 3 |
| pinball-tilt-cross.mp4 | 15 (borrowed) | 492 / 492 / 492 | 828 / 828 / 828 | 4 / 4 / 4 | 488 / 488 / 488 | 7 / 7 / 7 | 4 / 4 / 4 | 3 / 3 / 3 |
| pinball-tilt-cross.mp4 | 25 (borrowed) | 492 / 492 / 492 | 828 / 828 / 828 | 4 / 4 / 4 | 488 / 488 / 488 | 7 / 7 / 7 | 4 / 4 / 4 | 3 / 3 / 3 |
| pinball-tilt-mid.mp4 | every | 0 / 0 / 0 | 2628 / 2628 / 2628 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| pinball-tilt-mid.mp4 | 15 (borrowed) | 0 / 0 / 4 | 72 / 1316 / 1316 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 8 | 0 / 0 / 8 | 0 / 0 / 0 |
| pinball-tilt-mid.mp4 | 25 (borrowed) | 0 / 0 / 4 | 72 / 1316 / 1316 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 8 | 0 / 0 / 8 | 0 / 0 / 0 |
| pinball-tilt-sweep.mp4 | every | 0 / 0 / 8 | 3432 / 3466 / 3472 | 0 / 0 / 0 | 0 / 0 / 8 | 0 / 0 / 16 | 0 / 0 / 16 | 0 / 0 / 0 |
| pinball-tilt-sweep.mp4 | 15 (borrowed) | 0 / 0 / 0 | 1600 / 1692 / 1728 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| pinball-tilt-sweep.mp4 | 25 (borrowed) | 0 / 0 / 0 | 1600 / 1692 / 1728 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

**A sentence of the registration that did not hold as written.** G3's "must fail on" reads "`T` 9.36 in place of 10: the wall
clip's 172 for 216". At `T` = 9.36 the option hands 176 / 176 / 180, not 172 / 172 / 176. The 172 is the first record's row for
its half-of-the-fits interpolation, whose value is `9.357142857142858` (its script's `RULES.half.interpolated`), which that
record prints as 9.36°. So the sentence quotes a figure read at the unrounded value beside the rounded one. **The negative itself
holds both ways:** G3 fails at 9.36 reading 176, and fails at the unrounded value reading 172, exactly the registered cell. Both
legs are in the table of negatives. Criterion G3 and its cells are not touched by this, and the registration is not edited.

## G4: the parameter, held

**In the package's suite** (`test/pose/pose_guard.test.ts`, `test/tracker_pose_guard.test.ts`): `T` − 1e-9, `T` and `T` + 1e-9 at 10 and
at 25; a threshold set to a frame's own tilt, the same double, which is the only way to tell `<` from `<=`; 0 and 180; a closed form with
`good: false`; each refusal by name. **In the dated script,** since it needs the clips, `T` = 7 through the option, against the first
record's sensitivity rows:

```text
pinball-static.mp4, every: 1452 / 1452 / 1452 | 0 / 0 / 0 | 1452 / 1452 / 1452
pinball-static.mp4, 15: 728 / 728 / 728 | 0 / 0 / 0 | 728 / 728 / 728
pinball-static.mp4, 25: 728 / 728 / 728 | 0 / 0 / 0 | 728 / 728 / 728
pinball-bench.mp4, every: 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0
  7 and above: frames 844 / 848 / 856; windows 36 / 36 / 36; GUARD at 7 4.284 / 4.912 / 10.720
pinball-bench.mp4, 15: 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0
  7 and above: frames 692 / 702 / 740; windows 36 / 36 / 36; GUARD at 7 3.660 / 5.327 / 12.713
pinball-bench.mp4, 25: 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0
  7 and above: frames 316 / 335 / 340; windows 32 / 32 / 36; GUARD at 7 4.358 / 5.176 / 13.275
pinball-bench-table.mp4, every: 308 / 308 / 312 | 4 / 4 / 8 | 304 / 304 / 308
  below 7: frames 308 / 308 / 312; windows 12 / 12 / 12; GUARD at 7 2.608 / 2.608 / 2.608
  7 and above: frames 536 / 552 / 588; windows 20 / 24 / 28; GUARD at 7 2.087 / 3.624 / 6.023
pinball-bench-table.mp4, 15: 152 / 156 / 156 | 0 / 4 / 4 | 152 / 152 / 152
  below 7: frames 152 / 156 / 156; windows 12 / 12 / 12; GUARD at 7 2.642 / 2.813 / 2.813
  7 and above: frames 224 / 242 / 264; windows 20 / 20 / 20; GUARD at 7 2.251 / 2.429 / 10.931
pinball-bench-table.mp4, 25: 152 / 156 / 156 | 0 / 4 / 4 | 152 / 152 / 152
  below 7: frames 152 / 156 / 156; windows 12 / 12 / 12; GUARD at 7 2.642 / 2.813 / 2.813
  7 and above: frames 224 / 242 / 264; windows 20 / 20 / 20; GUARD at 7 2.251 / 2.429 / 10.931
```

## G5: with the filter, held

Both options on, the filter module fed the guard's output frame by frame, stamped as G1, and `poseSelection` unchanged. No figure of
the composition is claimed: the registration registers the structure only.

```text
pinball-static.mp4: 2178 posed frames, 2176 of them filtered
pinball-bench.mp4: 1284 posed frames, 1170 of them filtered
pinball-tilt-cross.mp4: 2502 posed frames, 2490 of them filtered
```

## The negatives, each seen failing

Each is a mutant of `src/` or a defect in the check's inputs, applied by `--negatives` with no run in flight, restored in a `finally`,
with the tree and the build compared before and after. A row's last cell is the line that fired, and a run that fires prints no figures.

| criterion | the mutant | how it was read | failed as it must |
|---|---|---|---|
| G0 | a key poseGuard: null on every result, which must change R-truth | R-truth | ground truth: 6035566 bytes, sha256 abd2feaa74680ada20001de3ccdb00381fc5065b556479999689f16f3a3199ea |
| G0 | the same key, against the new test | the package's tests | FAIL  test/tracker_pose_guard.test.ts > G0: { mode: 'off' } is the option absent > holds every result of the shipped sequences equal, recursively, Object.is on each leaf |
| G0 | { mode: 'off' } differing from the option absent | the package's tests | FAIL  test/tracker_pose_guard.test.ts > G0: { mode: 'off' } is the option absent > holds every result of the shipped sequences equal, recursively, Object.is on each leaf |
| G1 | one element of the result's H moved by 1e-9 | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 73: G1: another field: $.H[4] |
| G1 | one element of H moved by 1e-9 in the guard's input | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 73: G1: the reading: $.tiltDeg: 72.0072263720311, false, the check's 72.00722637142405, false |
| G1 | the tilt read from IPPE's pose | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 73: G1: the reading: $.tiltDeg: 52.14694657709185, false, the check's 72.00722637142405, false |
| G1 | the previous frame's tilt | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 81: G1: the reading: $.tiltDeg: 72.00722637142405, false, the check's 26.64520504745592, false |
| G1 | the reading right, the selection's pose below T | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 190: G1: the pose, tilt 9.764402823431183, T 10: $.R[0] |
| G1 | the reading right, the closed form's pose at T and above | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 73: G1: the pose, tilt 72.00722637142405, T 10: $.R[0] |
| G1 | the reading right, one element of the guard's pose moved by 1e-9 | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 190: G1: the pose, tilt 9.764402823431183, T 10: $.t[2] |
| G1 | poseSelection carrying the guarded pose | the check, pinball-static.mp4, every:1 | pinball-static.mp4, every frame, seed 1, frame 1: G1: another field: $.poseSelection.pose.R[0] |
| G1 | a frame guarded at the threshold's other side: the closed form at and above T | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1, frame 73: G1: the reading: $.guarded: 72.00722637142405, true, the check's 72.00722637142405, false |
| G2 | a frame both guarded and fallen back counted twice | the check, pinball-bench-table.mp4, every:1 | pinball-bench-table.mp4, every frame, seed 1: G2: fallbackFrames 1266, against the off run's 30 + 1224 guarded and not fallen back |
| G2 | a guarded frame not counted | the check, pinball-bench.mp4, every:1 | pinball-bench.mp4, every frame, seed 1: G2: fallbackFrames 36, against the off run's 36 + 330 guarded and not fallen back |
| G3 | T 9.36 in place of 10, as the registration writes it | the check, pinball-bench.mp4, every:all, --break T-9.36 | pinball-bench.mp4, every frame: G3, handed to CF reads 176 / 176 / 180, registered 216 / 216 / 220 |
| G3 | T 9.357142857142858 in place of 10, the value the registration's 172 was read at | the check, pinball-bench.mp4, every:all, --break T-half | pinball-bench.mp4, every frame: G3, handed to CF reads 172 / 172 / 176, registered 216 / 216 / 220 |
| G4 | T = 8 in place of 7, against the first record's rows | the check, pinball-bench-table.mp4, every:all, --break low-8 | pinball-bench-table.mp4, every frame: G4, T = 7, handed to CF reads 380 / 380 / 384, registered 308 / 308 / 312 |
| G4 | a threshold hard-coded at 10 | the package's tests | FAIL  test/tracker_pose_guard.test.ts > the poseGuard option: the threshold is a parameter (G4) > at a frame's own tilt: the selection at exactly it, the closed form 1e-9 |
| G4 | <= for < | the package's tests | × at a tilt read at exactly the threshold, near 10: the selection, and the closed form 1e-9 above it 6ms |
| G4 | good: false not keeping the selection | the package's tests | × has no tilt, and the frame keeps its selection 8ms |
| G4 | the refusal of a threshold with the guard off removed | the package's tests | × refuses a threshold given with the guard off 5ms |
| G4 | the refusal of a threshold below 0 removed | the package's tests | × refuses a threshold that is not finite or lies outside [0, 180] 5ms |
| G4 | the refusal of a threshold above 180 removed | the package's tests | × refuses a threshold that is not finite or lies outside [0, 180] 5ms |
| G4 | the refusal of a threshold that is not a number removed | the package's tests | × refuses a threshold that is not finite or lies outside [0, 180] 5ms |
| G4 | the refusal of an unknown mode removed | the package's tests | × refuses an unknown mode 4ms |
| G4 | the refusal of an unknown key removed | the package's tests | × refuses a key the option does not read, naming it, and suggests the key a case slip meant 5ms |
| G5 | the filter reading poseSelection.pose in place of pose | the check, pinball-static.mp4, every:1 | pinball-static.mp4, every frame, seed 1, frame 0: G5: the pose is not the filter on the guard's output: $.R[0] |

every mutant failed as it must, 27 of them; the tree and the build are as they were.

## Stage 2's covariates, per clip

**The control arm:** the guard and the filter off. **Each is a read, and nothing here judges the guard.** Each cell is min / median /
max over seeds 1 to 8, in the counted loops. Band rows with no frame in any seed are left out; the script's stdout has them all. Under each
schedule, each seed's sub-entry gives the corner distance at each switch, and whether a TRACK run crosses a wrap, with its length.

- **The assumed `K`:** `intrinsics(w, h)`, 60° of horizontal field, the same for every arm; no calibration. f = 175.80 px at 203 × 360
  and 415.69 px at 480 × 270.
- **What lower means:** not per frame. On moving footage the metric reads attenuated motion as lower jitter. The only jitter of the guard's
  in this document is G4's "GUARD at 7" column, the first record's registered cells checked equal, read as checks. No comparison of the
  guard's jitter against anything is made, so no leave-one-media-time-out stands here. Those are M9's.
- **A seed is not a replicate of the noise.** "8 of 8" on a held lock may be one observation: on mid at every frame, it is.
- **The 15 and 25 ms rows of the three tilt clips carry an acquisition borrowed from the static clip,** 36.9 ms, not measured.

| Clip | Every frame: where the frames lie | Switches in the footage, per seed | Largest step at a switch | Wrong-pose label | The loops |
|---|---|---|---|---|---|
| static | 1452 frames, 52 windows, all TRACK; 1–3° and 3–5° | 0 | none | 0 | 4 distinct, in the last bits, up to 3.1e-13 px; the lock crosses the wrap |
| wall | 844 / 848 / 856 frames, 36 windows; 7° to over 40°, none below 7° | 28 to 36 | 160.46 px, at a wrap | 0 | copies, one pass a seed; two seeds differ at 25 ms |
| table | 844 / 860 / 900 frames, 28 / 32 / 36 windows; 1° to over 40°, its bulk at 7–10° | 12 to 28 | 243.72 px, at a wrap | up to 12 a seed | copies; three seeds differ at 15 and 25 ms |
| cross | 1668 frames, 56 windows; 3–15° | 4, at one media time | 4.33 px | 0 | copies |
| mid | 2628 frames, 88 windows, all TRACK; 10–30° | 0 | none | 0 | 4 distinct, in the last bits, up to 2.0e-13 px, which the repeat calls copies; the lock crosses the wrap; the registration's one observation in eight seeds |
| sweep | 3432 / 3466 / 3472 frames, 116 windows; its bulk at 20–40° | 0, but seed 1, 16, and seed 6, 8 | 11.40 px | 0 | copies |

**Named, by the reporting rule:** the single TRACK switches on 8 or 9 inliers. Sweep, seed 1 at 0.267 s on 8 and at 0.467 s on 9, seed 6 at
0.267 s on 8; wall at 7.666 s and 7.706 s on 8 in every seed at every frame and at 15 ms, seed 3 at 7.786 s on 9, and 10.876 s on 8 in four
seeds at 25 ms. Each is a read of the control arm, and none carries a reading in this document.

### pinball-static.mp4, 203 x 360, 363 frames, loop 12.167 s, f 175.80 px

#### pinball-static.mp4, every frame

- state: the common set 1452 / 1452 / 1452 frames, 52 / 52 / 52 windows; its TRACK frames 1452 / 1452 / 1452, 52 / 52 / 52 windows; its DETECT frames 0 / 0 / 0; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 1440 / 1440 / 1440 | 52 / 52 / 52 | 1440 / 1440 / 1440 | 52 / 52 / 52 |
| 3-5 | 12 / 12 / 12 | 0 / 0 / 0 | 12 / 12 / 12 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: none px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 4, 4, 4, 4, 4, 4, 4, 4; largest corner difference under H across them, px, per seed: 2.9e-13, 3.1e-13, 3.0e-13, 2.9e-13, 2.9e-13, 2.9e-13, 2.8e-13, 2.9e-13; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 2, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 3, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 4, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 5, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 6, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 7, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726
  - seed 8, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 1452; TRACK on 27, a lock crossing, TRACK run 1089; TRACK on 27, a lock crossing, TRACK run 726

#### pinball-static.mp4, device, 15 ms step

- state: the common set 728 / 728 / 728 frames, 48 / 48 / 48 windows; its TRACK frames 728 / 728 / 728, 48 / 48 / 48 windows; its DETECT frames 0 / 0 / 0; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 716 / 716 / 716 | 48 / 48 / 48 | 716 / 716 / 716 | 48 / 48 / 48 |
| 3-5 | 12 / 12 / 12 | 0 / 0 / 0 | 12 / 12 / 12 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: none px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 4, 4, 4, 4, 4, 4, 4, 4; largest corner difference under H across them, px, per seed: 2.7e-13, 3.0e-13, 2.6e-13, 3.0e-13, 3.1e-13, 3.0e-13, 2.8e-13, 3.0e-13; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 2, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 3, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 4, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 5, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 6, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 7, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 8, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364

#### pinball-static.mp4, device, 25 ms step

- state: the common set 728 / 728 / 728 frames, 48 / 48 / 48 windows; its TRACK frames 728 / 728 / 728, 48 / 48 / 48 windows; its DETECT frames 0 / 0 / 0; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 716 / 716 / 716 | 48 / 48 / 48 | 716 / 716 / 716 | 48 / 48 / 48 |
| 3-5 | 12 / 12 / 12 | 0 / 0 / 0 | 12 / 12 / 12 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: none px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 4, 4, 4, 4, 4, 4, 4, 4; largest corner difference under H across them, px, per seed: 2.7e-13, 3.0e-13, 2.6e-13, 3.0e-13, 3.1e-13, 3.0e-13, 2.8e-13, 3.0e-13; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 2, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 3, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 4, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 5, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 6, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 7, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364
  - seed 8, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 728; TRACK on 27, a lock crossing, TRACK run 546; TRACK on 27, a lock crossing, TRACK run 364

### pinball-bench.mp4, 480 x 270, 298 frames, loop 11.960 s, f 415.69 px

#### pinball-bench.mp4, every frame

- state: the common set 844 / 848 / 856 frames, 36 / 36 / 36 windows; its TRACK frames 796 / 810 / 820, 36 / 36 / 36 windows; its DETECT frames 28 / 42 / 60; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 7-10 | 216 / 216 / 220 | 12 / 12 / 12 | 216 / 216 / 220 | 12 / 12 / 12 |
| 10-15 | 280 / 282 / 284 | 16 / 16 / 16 | 256 / 256 / 264 | 16 / 16 / 16 |
| 15-20 | 92 / 92 / 96 | 4 / 4 / 4 | 92 / 92 / 92 | 4 / 4 / 4 |
| 20-30 | 228 / 236 / 244 | 12 / 12 / 12 | 228 / 232 / 240 | 12 / 12 / 12 |
| 30-40 | 4 / 8 / 20 | 0 / 0 / 4 | 4 / 6 / 20 | 0 / 0 / 4 |
| over 40 | 4 / 12 / 24 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 28, 28, 36, 28, 28, 28, 28, 28; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.15 / 2.08 / 160.46 px
  - seed 1: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.348 s x4, DETECT on 66, 11.56 to 9.80, 2.52 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 2: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.388 s x4, TRACK on 12, 10.60 to 8.56, 2.02 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 3: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 13.37, 1.09 px; 7.786 s x4, TRACK on 9, 13.37 to 8.79, 1.59 px; 7.826 s x4, TRACK on 26, 8.79 to 11.34, 0.87 px; 8.388 s x4, TRACK on 14, 10.17 to 9.34, 1.33 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 4: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.388 s x4, TRACK on 13, 10.08 to 9.04, 1.44 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 5: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.348 s x4, DETECT on 66, 14.14 to 9.83, 2.16 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 6: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.76, 0.24 px; 8.388 s x4, TRACK on 12, 11.03 to 8.56, 2.01 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 7: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.57, 0.23 px; 8.388 s x4, TRACK on 14, 10.40 to 9.34, 1.34 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
  - seed 8: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.388 s x4, TRACK on 11, 12.94 to 9.29, 1.26 px; 8.789 s x4, TRACK on 24, 8.31 to 10.25, 0.16 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 2.930 s (wrap) x3, DETECT on 5, 9.73 to 72.01, 160.46 px
- single TRACK switches on 8 or 9 inliers: seed 1, 7.666 s, 8 inliers; seed 1, 7.706 s, 8 inliers; seed 2, 7.666 s, 8 inliers; seed 2, 7.706 s, 8 inliers; seed 3, 7.666 s, 8 inliers; seed 3, 7.706 s, 8 inliers; seed 3, 7.786 s, 9 inliers; seed 4, 7.666 s, 8 inliers; seed 4, 7.706 s, 8 inliers; seed 5, 7.666 s, 8 inliers; seed 5, 7.706 s, 8 inliers; seed 6, 7.666 s, 8 inliers; seed 6, 7.706 s, 8 inliers; seed 7, 7.666 s, 8 inliers; seed 7, 7.706 s, 8 inliers; seed 8, 7.666 s, 8 inliers; seed 8, 7.706 s, 8 inliers
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 2, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 3, the first frame after each wrap: LOST on 6, TRACK run 0
  - seed 4, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 5, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 6, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 7, the first frame after each wrap: LOST on 6, TRACK run 0
  - seed 8, the first frame after each wrap: LOST on 0, TRACK run 0

#### pinball-bench.mp4, device, 15 ms step

- state: the common set 692 / 702 / 740 frames, 36 / 36 / 36 windows; its TRACK frames 616 / 628 / 688, 28 / 28 / 32 windows; its DETECT frames 52 / 72 / 80; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 7-10 | 176 / 188 / 192 | 8 / 8 / 8 | 176 / 176 / 176 | 8 / 8 / 8 |
| 10-15 | 224 / 228 / 236 | 16 / 16 / 16 | 192 / 192 / 192 | 12 / 12 / 12 |
| 15-20 | 92 / 92 / 100 | 4 / 4 / 4 | 92 / 92 / 92 | 4 / 4 / 4 |
| 20-30 | 152 / 174 / 224 | 8 / 8 / 12 | 144 / 162 / 220 | 8 / 8 / 12 |
| 30-40 | 8 / 10 / 16 | 0 / 0 / 0 | 4 / 8 / 12 | 0 / 0 / 0 |
| over 40 | 4 / 10 / 12 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 52, 20, 44, 28, 44, 36, 44, 28; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 1.49 / 65.99 px
  - seed 1: 4.094 s x4, DETECT on 23, 34.42 to 9.99, 0.00 px; 4.214 s x4, DETECT on 26, 9.99 to 24.41, 0.00 px; 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.348 s x4, DETECT on 66, 13.66 to 9.80, 2.52 px; 8.468 s x4, DETECT on 97, 9.80 to 10.06, 1.07 px; 8.589 s x4, DETECT on 89, 10.06 to 9.49, 0.97 px; 8.709 s x4, DETECT on 78, 9.49 to 10.09, 0.41 px; 8.829 s x4, DETECT on 77, 10.09 to 9.15, 0.91 px; 8.950 s x4, DETECT on 89, 9.15 to 10.57, 2.03 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.251 s (wrap) x3, DETECT on 5, 9.73 to 26.65, 0.00 px
  - seed 2: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.492 s (wrap) x3, DETECT on 8, 9.73 to 21.97, 0.00 px
  - seed 3: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 13.37, 1.09 px; 8.227 s x4, DETECT on 43, 11.27 to 7.89, 4.12 px; 8.348 s x4, DETECT on 66, 7.89 to 10.17, 2.18 px; 8.589 s x4, DETECT on 89, 10.06 to 9.06, 1.34 px; 8.709 s x4, DETECT on 78, 9.06 to 11.04, 0.75 px; 8.829 s x4, DETECT on 77, 11.04 to 8.95, 0.86 px; 8.950 s x4, DETECT on 89, 8.95 to 10.79, 2.19 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.492 s (wrap) x3, DETECT on 8, 9.73 to 77.14, 0.00 px
  - seed 4: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.589 s x4, DETECT on 89, 10.06 to 9.49, 0.97 px; 8.950 s x4, DETECT on 89, 9.31 to 10.81, 2.90 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.492 s (wrap) x3, DETECT on 8, 9.73 to 21.97, 0.00 px
  - seed 5: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.348 s x4, DETECT on 66, 12.76 to 9.83, 2.16 px; 8.468 s x4, DETECT on 97, 9.83 to 12.45, 0.79 px; 8.589 s x4, DETECT on 89, 12.45 to 9.90, 1.07 px; 8.709 s x4, DETECT on 78, 9.90 to 10.07, 0.68 px; 8.829 s x4, DETECT on 77, 10.07 to 9.55, 0.65 px; 8.950 s x4, DETECT on 89, 9.55 to 11.94, 3.55 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.130 s (wrap) x3, DETECT on 5, 9.73 to 67.98, 65.99 px
  - seed 6: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.76, 0.24 px; 8.589 s x4, DETECT on 89, 11.60 to 9.80, 0.70 px; 8.709 s x4, DETECT on 78, 9.80 to 10.37, 1.01 px; 8.829 s x4, DETECT on 77, 10.37 to 8.79, 1.25 px; 8.950 s x4, DETECT on 89, 8.79 to 10.57, 2.03 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.492 s (wrap) x3, DETECT on 8, 9.73 to 42.58, 0.00 px
  - seed 7: 4.013 s x4, DETECT on 22, 28.22 to 8.35, 0.00 px; 4.134 s x4, DETECT on 27, 8.35 to 36.02, 0.00 px; 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.57, 0.23 px; 8.589 s x4, DETECT on 89, 10.55 to 9.60, 0.73 px; 8.709 s x4, DETECT on 78, 9.60 to 10.07, 0.68 px; 8.829 s x4, DETECT on 77, 10.07 to 8.92, 0.90 px; 8.950 s x4, DETECT on 89, 8.92 to 10.62, 1.80 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.492 s (wrap) x3, DETECT on 8, 9.73 to 21.97, 0.00 px
  - seed 8: 7.625 s x4, TRACK on 19, 11.46 to 9.76, 1.49 px; 7.666 s x4, TRACK on 8, 9.76 to 36.56, 62.64 px; 7.706 s x4, TRACK on 8, 36.56 to 8.74, 2.39 px; 7.746 s x4, DETECT on 73, 8.74 to 11.82, 0.15 px; 8.829 s x4, DETECT on 77, 10.78 to 9.22, 1.27 px; 8.950 s x4, DETECT on 89, 9.22 to 10.51, 1.87 px; 10.274 s x4, TRACK on 36, 10.29 to 9.89, 2.15 px; 3.492 s (wrap) x3, DETECT on 8, 9.73 to 23.68, 0.00 px
- single TRACK switches on 8 or 9 inliers: seed 1, 7.666 s, 8 inliers; seed 1, 7.706 s, 8 inliers; seed 2, 7.666 s, 8 inliers; seed 2, 7.706 s, 8 inliers; seed 3, 7.666 s, 8 inliers; seed 3, 7.706 s, 8 inliers; seed 4, 7.666 s, 8 inliers; seed 4, 7.706 s, 8 inliers; seed 5, 7.666 s, 8 inliers; seed 5, 7.706 s, 8 inliers; seed 6, 7.666 s, 8 inliers; seed 6, 7.706 s, 8 inliers; seed 7, 7.666 s, 8 inliers; seed 7, 7.706 s, 8 inliers; seed 8, 7.666 s, 8 inliers; seed 8, 7.706 s, 8 inliers
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 2, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 3, the first frame after each wrap: LOST on 6, TRACK run 0
  - seed 4, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 5, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 6, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 7, the first frame after each wrap: LOST on 6, TRACK run 0
  - seed 8, the first frame after each wrap: LOST on 0, TRACK run 0

#### pinball-bench.mp4, device, 25 ms step

- state: the common set 316 / 335 / 340 frames, 32 / 32 / 36 windows; its TRACK frames 216 / 240 / 256, 24 / 28 / 28 windows; its DETECT frames 80 / 95 / 101; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 7-10 | 68 / 78 / 92 | 8 / 8 / 8 | 52 / 62 / 72 | 8 / 8 / 8 |
| 10-15 | 112 / 118 / 128 | 12 / 12 / 12 | 68 / 80 / 92 | 8 / 8 / 8 |
| 15-20 | 40 / 44 / 48 | 4 / 4 / 4 | 32 / 40 / 40 | 4 / 4 / 4 |
| 20-30 | 60 / 70 / 84 | 8 / 8 / 8 | 40 / 58 / 76 | 4 / 8 / 8 |
| 30-40 | 0 / 4 / 8 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| over 40 | 8 / 15 / 20 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 20, 12, 20, 20, 20, 28, 28, 28; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 1.28 / 160.46 px
  - seed 1: 8.548 s x4, DETECT on 95, 10.39 to 9.66, 0.90 px; 8.709 s x4, DETECT on 78, 9.66 to 10.09, 0.41 px; 10.234 s x4, DETECT on 76, 11.34 to 9.36, 2.65 px; 10.876 s x4, TRACK on 8, 9.10 to 27.09, 39.54 px; 10.957 s x4, DETECT on 87, 27.09 to 8.12, 0.63 px; 3.452 s (wrap) x3, DETECT on 8, 9.89 to 66.77, 0.00 px
  - seed 2: 7.706 s x4, TRACK on 13, 11.34 to 9.65, 1.28 px; 7.786 s x4, TRACK on 20, 9.65 to 10.52, 1.10 px; 10.274 s x4, TRACK on 18, 10.73 to 9.22, 1.41 px; 2.930 s (wrap) x3, DETECT on 5, 9.44 to 72.01, 160.46 px
  - seed 3: 7.706 s x4, TRACK on 13, 11.34 to 9.65, 1.28 px; 7.786 s x4, TRACK on 20, 9.65 to 10.52, 1.10 px; 8.829 s x4, DETECT on 77, 10.13 to 8.95, 0.86 px; 8.990 s x4, DETECT on 84, 8.95 to 11.15, 2.30 px; 10.274 s x4, TRACK on 18, 10.73 to 9.22, 1.41 px; 2.930 s (wrap) x3, DETECT on 5, 9.44 to 72.01, 160.46 px
  - seed 4: 7.706 s x4, TRACK on 13, 11.34 to 9.65, 1.28 px; 7.786 s x4, TRACK on 20, 9.65 to 10.52, 1.10 px; 8.829 s x4, DETECT on 77, 10.85 to 9.31, 1.10 px; 8.990 s x4, DETECT on 84, 9.31 to 11.35, 2.08 px; 10.274 s x4, TRACK on 18, 10.73 to 9.22, 1.41 px; 2.930 s (wrap) x3, DETECT on 5, 9.44 to 72.01, 160.46 px
  - seed 5: 8.548 s x4, DETECT on 95, 11.06 to 9.92, 0.97 px; 8.709 s x4, DETECT on 78, 9.92 to 10.07, 0.68 px; 10.395 s x4, TRACK on 12, 10.16 to 9.04, 1.16 px; 10.876 s x4, TRACK on 8, 9.10 to 27.09, 39.54 px; 10.957 s x4, DETECT on 87, 27.09 to 8.61, 1.41 px; 3.692 s (wrap) x3, DETECT on 12, 9.40 to 40.14, 0.00 px
  - seed 6: 8.388 s x4, DETECT on 91, 12.76 to 9.62, 2.92 px; 8.548 s x4, DETECT on 95, 9.62 to 10.01, 1.12 px; 8.870 s x4, DETECT on 95, 10.37 to 9.99, 1.64 px; 9.030 s x4, DETECT on 84, 9.99 to 11.81, 2.76 px; 10.395 s x4, TRACK on 10, 10.41 to 9.20, 1.29 px; 10.876 s x4, TRACK on 8, 9.10 to 27.09, 39.54 px; 10.957 s x4, DETECT on 87, 27.09 to 8.61, 1.41 px; 3.692 s (wrap) x3, DETECT on 12, 9.66 to 40.14, 0.00 px
  - seed 7: 4.013 s x4, DETECT on 22, 48.99 to 8.35, 0.00 px; 4.174 s x4, DETECT on 22, 8.35 to 41.48, 0.00 px; 7.706 s x4, TRACK on 13, 11.34 to 9.65, 1.28 px; 7.786 s x4, TRACK on 20, 9.65 to 10.52, 1.10 px; 8.669 s x4, DETECT on 75, 10.29 to 9.05, 0.29 px; 8.990 s x4, DETECT on 84, 8.92 to 11.35, 2.08 px; 10.274 s x4, TRACK on 18, 10.73 to 9.22, 1.41 px; 2.930 s (wrap) x3, DETECT on 5, 9.44 to 72.01, 160.46 px
  - seed 8: 7.585 s x4, DETECT on 74, 10.37 to 7.98, 5.11 px; 7.746 s x4, DETECT on 73, 7.98 to 11.82, 0.15 px; 8.388 s x4, DETECT on 91, 10.68 to 9.63, 2.99 px; 8.548 s x4, DETECT on 95, 9.63 to 10.03, 0.97 px; 10.234 s x4, DETECT on 76, 11.77 to 9.89, 1.67 px; 10.876 s x4, TRACK on 8, 9.10 to 27.09, 39.54 px; 10.957 s x4, DETECT on 87, 27.09 to 8.60, 1.49 px; 3.452 s (wrap) x3, DETECT on 8, 9.66 to 61.33, 0.00 px
- single TRACK switches on 8 or 9 inliers: seed 1, 10.876 s, 8 inliers; seed 5, 10.876 s, 8 inliers; seed 6, 10.876 s, 8 inliers; seed 8, 10.876 s, 8 inliers
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 2, 1, 2; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 52, 0, 52
  - seed 1, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 2, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 3, the first frame after each wrap: LOST on 6, TRACK run 0
  - seed 4, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 5, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 6, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 7, the first frame after each wrap: LOST on 6, TRACK run 0
  - seed 8, the first frame after each wrap: LOST on 4, TRACK run 0

### pinball-bench-table.mp4, 203 x 360, 267 frames, loop 8.900 s, f 175.80 px

#### pinball-bench-table.mp4, every frame

- state: the common set 844 / 860 / 900 frames, 28 / 32 / 36 windows; its TRACK frames 820 / 840 / 884, 28 / 30 / 32 windows; its DETECT frames 12 / 22 / 28; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 112 / 112 / 112 | 8 / 8 / 8 | 112 / 112 / 112 | 8 / 8 / 8 |
| 3-5 | 136 / 136 / 140 | 8 / 8 / 8 | 136 / 136 / 136 | 8 / 8 / 8 |
| 5-7 | 60 / 60 / 64 | 4 / 4 / 4 | 60 / 60 / 64 | 4 / 4 / 4 |
| 7-10 | 512 / 524 / 560 | 20 / 22 / 24 | 508 / 522 / 560 | 20 / 22 / 24 |
| 10-15 | 4 / 14 / 16 | 0 / 0 / 0 | 0 / 8 / 12 | 0 / 0 / 0 |
| 15-20 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 20-30 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 30-40 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| over 40 | 8 / 12 / 16 | 0 / 0 / 0 | 0 / 0 / 4 | 0 / 0 / 0 |
- switches per seed, in the footage: 12, 20, 28, 12, 20, 28, 12, 20; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 1.88 / 243.72 px
  - seed 1: 1.967 s x4, DETECT on 10, 10.79 to 8.58, 0.00 px; 2.000 s x4, DETECT on 9, 8.58 to 11.83, 0.00 px; 2.067 s x4, TRACK on 22, 10.11 to 9.51, 2.15 px; 1.200 s (wrap) x3, DETECT on 5, 2.52 to 45.58, 17.69 px
  - seed 2: 1.300 s x4, DETECT on 5, 67.89 to 4.11, 0.00 px; 1.833 s x4, DETECT on 6, 9.44 to 25.60, 10.31 px; 1.867 s x4, TRACK on 11, 25.60 to 8.58, 3.19 px; 1.933 s x4, DETECT on 6, 8.58 to 71.74, 0.00 px; 2.133 s x4, TRACK on 19, 11.11 to 9.75, 2.63 px; 0.567 s (wrap) x3, DETECT on 5, 2.52 to 67.89, 16.49 px
  - seed 3: 1.533 s x4, TRACK on 15, 10.11 to 6.92, 3.08 px; 1.700 s x4, TRACK on 30, 9.95 to 10.06, 1.59 px; 1.733 s x4, TRACK on 30, 10.06 to 9.74, 1.68 px; 1.933 s x4, TRACK on 28, 9.90 to 10.09, 1.93 px; 1.967 s x4, TRACK on 29, 10.09 to 9.62, 1.88 px; 2.033 s x4, TRACK on 32, 9.91 to 10.05, 1.84 px; 2.067 s x4, TRACK on 31, 10.05 to 9.93, 1.96 px; 0.567 s (wrap) x3, DETECT on 6, 2.52 to 52.24, 52.81 px
  - seed 4: 1.967 s x4, DETECT on 10, 34.18 to 8.58, 0.00 px; 2.000 s x4, DETECT on 9, 8.58 to 14.57, 0.00 px; 2.067 s x4, TRACK on 24, 10.01 to 9.80, 1.87 px; 0.933 s (wrap) x3, DETECT on 5, 2.52 to 20.31, 14.15 px
  - seed 5: 1.833 s x4, TRACK on 23, 10.46 to 9.99, 1.64 px; 1.933 s x4, TRACK on 28, 9.90 to 10.09, 1.93 px; 1.967 s x4, TRACK on 29, 10.09 to 9.62, 1.88 px; 2.033 s x4, TRACK on 32, 9.91 to 10.05, 1.84 px; 2.067 s x4, TRACK on 31, 10.05 to 9.93, 1.96 px; 0.267 s (wrap) x3, DETECT on 5, 2.52 to 78.76, 243.72 px
  - seed 6: 1.533 s x4, TRACK on 15, 10.11 to 6.92, 3.08 px; 1.700 s x4, TRACK on 30, 9.95 to 10.06, 1.59 px; 1.733 s x4, TRACK on 30, 10.06 to 9.74, 1.68 px; 1.933 s x4, TRACK on 28, 9.90 to 10.09, 1.93 px; 1.967 s x4, TRACK on 29, 10.09 to 9.62, 1.88 px; 2.033 s x4, TRACK on 32, 9.91 to 10.05, 1.84 px; 2.067 s x4, TRACK on 31, 10.05 to 9.93, 1.96 px; 1.267 s (wrap) x3, DETECT on 6, 2.52 to 62.48, 53.60 px
  - seed 7: 1.967 s x4, DETECT on 10, 77.90 to 8.58, 0.00 px; 2.033 s x4, DETECT on 7, 8.58 to 11.79, 0.00 px; 2.100 s x4, TRACK on 26, 10.01 to 9.86, 1.95 px; 0.333 s (wrap) x3, DETECT on 6, 2.52 to 63.42, 223.63 px
  - seed 8: 1.833 s x4, TRACK on 23, 10.46 to 9.99, 1.64 px; 1.933 s x4, TRACK on 28, 9.90 to 10.09, 1.93 px; 1.967 s x4, TRACK on 29, 10.09 to 9.62, 1.88 px; 2.033 s x4, TRACK on 32, 9.91 to 10.05, 1.84 px; 2.067 s x4, TRACK on 31, 10.05 to 9.93, 1.96 px; 0.067 s (wrap) x3, DETECT on 5, 2.52 to 18.54, 69.49 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 4, 0, 12, 4, 8, 0
  - seed 3: 1.367 s x4, DETECT on 5
  - seed 5: 0.267 s x4, DETECT on 5; 0.333 s x4, DETECT on 5; 1.533 s x4, DETECT on 7
  - seed 6: 1.400 s x4, DETECT on 5
  - seed 7: 0.333 s x4, DETECT on 6; 1.533 s x4, DETECT on 7
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 2, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 3, the first frame after each wrap: LOST on 0, TRACK run 0
  - seed 4, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 5, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 6, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 7, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 8, the first frame after each wrap: LOST on 4, TRACK run 0

#### pinball-bench-table.mp4, device, 15 ms step

- state: the common set 380 / 397 / 416 frames, 28 / 28 / 28 windows; its TRACK frames 352 / 380 / 399, 24 / 28 / 28 windows; its DETECT frames 8 / 20 / 28; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 52 / 68 / 68 | 4 / 8 / 8 | 52 / 68 / 68 | 4 / 8 / 8 |
| 3-5 | 56 / 56 / 72 | 4 / 4 / 4 | 56 / 56 / 72 | 4 / 4 / 4 |
| 5-7 | 28 / 32 / 32 | 4 / 4 / 4 | 28 / 32 / 32 | 4 / 4 / 4 |
| 7-10 | 204 / 226 / 244 | 16 / 20 / 20 | 196 / 222 / 239 | 16 / 20 / 20 |
| 10-15 | 4 / 8 / 12 | 0 / 0 / 0 | 0 / 3 / 8 | 0 / 0 / 0 |
| 15-20 | 0 / 1 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 20-30 | 0 / 0 / 8 | 0 / 0 / 0 | 0 / 0 / 4 | 0 / 0 / 0 |
| over 40 | 0 / 6 / 12 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 8, 12, 12, 16, 4, 12, 18, 20; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 2.19 / 223.63 px
  - seed 1: 2.467 s x2, TRACK on 26, 15.60 to 9.68, 1.73 px; 4.600 s x2, TRACK on 14, 9.59 to 10.70, 2.89 px; 4.667 s x2, DETECT on 45, 10.70 to 9.86, 3.93 px; 1.900 s (wrap) x2, DETECT on 7, 2.53 to 10.79, 0.00 px; 2.033 s x2, TRACK on 16, 10.79 to 9.65, 3.22 px; 2.333 s (wrap) x1, DETECT on 14, 2.51 to 15.60, 2.89 px
  - seed 2: 2.533 s x4, TRACK on 26, 15.76 to 9.15, 1.88 px; 2.600 s x4, DETECT on 22, 9.15 to 10.62, 3.38 px; 2.767 s x4, TRACK on 30, 10.62 to 9.57, 2.16 px; 1.933 s (wrap) x3, DETECT on 6, 2.51 to 71.74, 0.00 px
  - seed 3: 2.433 s x4, TRACK on 19, 17.06 to 9.47, 1.97 px; 2.500 s x4, DETECT on 15, 9.47 to 13.42, 2.22 px; 2.833 s x4, DETECT on 29, 13.42 to 9.26, 1.60 px; 1.133 s (wrap) x3, DETECT on 5, 2.51 to 51.70, 51.13 px
  - seed 4: 1.967 s x2, DETECT on 10, 53.91 to 8.58, 0.00 px; 2.267 s x2, TRACK on 21, 9.58 to 10.38, 1.59 px; 2.333 s x2, TRACK on 29, 10.38 to 9.55, 2.05 px; 4.600 s x2, TRACK on 14, 9.59 to 10.70, 2.89 px; 4.667 s x2, DETECT on 45, 10.70 to 7.48, 3.47 px; 2.300 s (wrap) x2, DETECT on 11, 2.53 to 13.24, 3.05 px; 2.500 s x2, TRACK on 18, 10.06 to 9.76, 1.95 px; 4.567 s x2, DETECT on 43, 9.59 to 12.64, 0.66 px; 4.733 s x2, TRACK on 25, 12.64 to 8.94, 2.89 px; 1.133 s (wrap) x1, DETECT on 5, 2.51 to 51.70, 51.13 px
  - seed 5: 2.767 s x4, TRACK on 24, 10.44 to 9.61, 2.34 px; 0.333 s (wrap) x3, DETECT on 5, 2.51 to 81.10, 99.10 px
  - seed 6: 2.433 s x4, DETECT on 14, 13.58 to 8.41, 0.00 px; 4.567 s x4, DETECT on 43, 9.59 to 11.01, 2.30 px; 4.733 s x4, TRACK on 27, 11.01 to 9.30, 2.93 px; 1.267 s (wrap) x3, DETECT on 6, 2.51 to 62.48, 53.60 px
  - seed 7: 2.233 s x4, TRACK on 27, 9.68 to 10.23, 1.60 px; 4.567 s x4, DETECT on 43, 9.59 to 11.32, 1.17 px; 4.733 s x4, TRACK on 23, 11.32 to 8.96, 2.55 px; 0.333 s (wrap) x3, DETECT on 6, 2.51 to 63.42, 223.63 px; 1.967 s x3, DETECT on 10, 63.42 to 8.58, 0.00 px; 2.300 s x3, TRACK on 31, 10.23 to 9.62, 2.01 px
  - seed 8: 1.967 s x4, DETECT on 10, 53.91 to 8.58, 0.00 px; 2.267 s x4, TRACK on 21, 9.58 to 10.38, 1.59 px; 2.333 s x4, TRACK on 29, 10.38 to 9.55, 2.05 px; 4.600 s x4, TRACK on 14, 9.59 to 10.70, 2.89 px; 4.667 s x4, DETECT on 45, 10.70 to 7.48, 3.47 px; 0.567 s (wrap) x3, DETECT on 5, 2.53 to 58.28, 34.97 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 4, 0, 0, 4, 4, 3, 0
  - seed 2: 2.233 s x4, DETECT on 6
  - seed 5: 0.333 s x4, DETECT on 5
  - seed 6: 1.400 s x4, DETECT on 5
  - seed 7: 0.333 s x3, DETECT on 6
- the loops: distinct among the 4 counted, bit for bit, per seed: 2, 1, 1, 2, 1, 1, 2, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 8.9e-1, 0.0e+0; media times differing in state or in some loops only, per seed: 230, 0, 0, 229, 0, 0, 32, 0
  - seed 1, the first frame after each wrap: LOST on 4, TRACK run 0; LOST on 5, TRACK run 0
  - seed 2, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 3, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 4, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 5, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 6, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 7, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 8, the first frame after each wrap: LOST on 4, TRACK run 0

#### pinball-bench-table.mp4, device, 25 ms step

- state: the common set 380 / 397 / 416 frames, 28 / 28 / 28 windows; its TRACK frames 352 / 380 / 399, 24 / 28 / 28 windows; its DETECT frames 8 / 20 / 28; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 52 / 68 / 68 | 4 / 8 / 8 | 52 / 68 / 68 | 4 / 8 / 8 |
| 3-5 | 56 / 56 / 72 | 4 / 4 / 4 | 56 / 56 / 72 | 4 / 4 / 4 |
| 5-7 | 28 / 32 / 32 | 4 / 4 / 4 | 28 / 32 / 32 | 4 / 4 / 4 |
| 7-10 | 204 / 226 / 244 | 16 / 20 / 20 | 196 / 222 / 239 | 16 / 20 / 20 |
| 10-15 | 4 / 8 / 12 | 0 / 0 / 0 | 0 / 3 / 8 | 0 / 0 / 0 |
| 15-20 | 0 / 1 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 20-30 | 0 / 0 / 8 | 0 / 0 / 0 | 0 / 0 / 4 | 0 / 0 / 0 |
| over 40 | 0 / 6 / 12 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 8, 12, 12, 16, 4, 12, 18, 20; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 2.19 / 223.63 px
  - seed 1: 2.467 s x2, TRACK on 26, 15.60 to 9.68, 1.73 px; 4.600 s x2, TRACK on 14, 9.59 to 10.70, 2.89 px; 4.667 s x2, DETECT on 45, 10.70 to 9.86, 3.93 px; 1.900 s (wrap) x2, DETECT on 7, 2.53 to 10.79, 0.00 px; 2.033 s x2, TRACK on 16, 10.79 to 9.65, 3.22 px; 2.333 s (wrap) x1, DETECT on 14, 2.51 to 15.60, 2.89 px
  - seed 2: 2.533 s x4, TRACK on 26, 15.76 to 9.15, 1.88 px; 2.600 s x4, DETECT on 22, 9.15 to 10.62, 3.38 px; 2.767 s x4, TRACK on 30, 10.62 to 9.57, 2.16 px; 1.933 s (wrap) x3, DETECT on 6, 2.51 to 71.74, 0.00 px
  - seed 3: 2.433 s x4, TRACK on 19, 17.06 to 9.47, 1.97 px; 2.500 s x4, DETECT on 15, 9.47 to 13.42, 2.22 px; 2.833 s x4, DETECT on 29, 13.42 to 9.26, 1.60 px; 1.133 s (wrap) x3, DETECT on 5, 2.51 to 51.70, 51.13 px
  - seed 4: 1.967 s x2, DETECT on 10, 53.91 to 8.58, 0.00 px; 2.267 s x2, TRACK on 21, 9.58 to 10.38, 1.59 px; 2.333 s x2, TRACK on 29, 10.38 to 9.55, 2.05 px; 4.600 s x2, TRACK on 14, 9.59 to 10.70, 2.89 px; 4.667 s x2, DETECT on 45, 10.70 to 7.48, 3.47 px; 2.300 s (wrap) x2, DETECT on 11, 2.53 to 13.24, 3.05 px; 2.500 s x2, TRACK on 18, 10.06 to 9.76, 1.95 px; 4.567 s x2, DETECT on 43, 9.59 to 12.64, 0.66 px; 4.733 s x2, TRACK on 25, 12.64 to 8.94, 2.89 px; 1.133 s (wrap) x1, DETECT on 5, 2.51 to 51.70, 51.13 px
  - seed 5: 2.767 s x4, TRACK on 24, 10.44 to 9.61, 2.34 px; 0.333 s (wrap) x3, DETECT on 5, 2.51 to 81.10, 99.10 px
  - seed 6: 2.433 s x4, DETECT on 14, 13.58 to 8.41, 0.00 px; 4.567 s x4, DETECT on 43, 9.59 to 11.01, 2.30 px; 4.733 s x4, TRACK on 27, 11.01 to 9.30, 2.93 px; 1.267 s (wrap) x3, DETECT on 6, 2.51 to 62.48, 53.60 px
  - seed 7: 2.233 s x4, TRACK on 27, 9.68 to 10.23, 1.60 px; 4.567 s x4, DETECT on 43, 9.59 to 11.32, 1.17 px; 4.733 s x4, TRACK on 23, 11.32 to 8.96, 2.55 px; 0.333 s (wrap) x3, DETECT on 6, 2.51 to 63.42, 223.63 px; 1.967 s x3, DETECT on 10, 63.42 to 8.58, 0.00 px; 2.300 s x3, TRACK on 31, 10.23 to 9.62, 2.01 px
  - seed 8: 1.967 s x4, DETECT on 10, 53.91 to 8.58, 0.00 px; 2.267 s x4, TRACK on 21, 9.58 to 10.38, 1.59 px; 2.333 s x4, TRACK on 29, 10.38 to 9.55, 2.05 px; 4.600 s x4, TRACK on 14, 9.59 to 10.70, 2.89 px; 4.667 s x4, DETECT on 45, 10.70 to 7.48, 3.47 px; 0.567 s (wrap) x3, DETECT on 5, 2.53 to 58.28, 34.97 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 4, 0, 0, 4, 4, 3, 0
  - seed 2: 2.233 s x4, DETECT on 6
  - seed 5: 0.333 s x4, DETECT on 5
  - seed 6: 1.400 s x4, DETECT on 5
  - seed 7: 0.333 s x3, DETECT on 6
- the loops: distinct among the 4 counted, bit for bit, per seed: 2, 1, 1, 2, 1, 1, 2, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 8.9e-1, 0.0e+0; media times differing in state or in some loops only, per seed: 230, 0, 0, 229, 0, 0, 32, 0
  - seed 1, the first frame after each wrap: LOST on 4, TRACK run 0; LOST on 5, TRACK run 0
  - seed 2, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 3, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 4, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 5, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 6, the first frame after each wrap: LOST on 5, TRACK run 0
  - seed 7, the first frame after each wrap: LOST on 4, TRACK run 0
  - seed 8, the first frame after each wrap: LOST on 4, TRACK run 0

### pinball-tilt-cross.mp4, 203 x 360, 417 frames, loop 13.996 s, f 175.80 px

#### pinball-tilt-cross.mp4, every frame

- state: the common set 1668 / 1668 / 1668 frames, 56 / 56 / 56 windows; its TRACK frames 1664 / 1664 / 1664, 56 / 56 / 56 windows; its DETECT frames 4 / 4 / 4; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 3-5 | 592 / 592 / 592 | 20 / 20 / 20 | 588 / 588 / 588 | 20 / 20 / 20 |
| 5-7 | 168 / 168 / 168 | 8 / 8 / 8 | 168 / 168 / 168 | 8 / 8 / 8 |
| 7-10 | 232 / 232 / 232 | 12 / 12 / 12 | 232 / 232 / 232 | 12 / 12 / 12 |
| 10-15 | 676 / 676 / 676 | 24 / 24 / 24 | 676 / 676 / 676 | 24 / 24 / 24 |
- switches per seed, in the footage: 4, 4, 4, 4, 4, 4, 4, 4; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 4.33 / 4.33 px
  - seed 1: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.28, 0.00 px
  - seed 2: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.14, 0.00 px
  - seed 3: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.14, 0.00 px
  - seed 4: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.14, 0.00 px
  - seed 5: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.08, 0.00 px
  - seed 6: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 3.41, 0.00 px
  - seed 7: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.53, 0.00 px
  - seed 8: 8.297 s x4, TRACK on 37, 9.99 to 10.11, 4.33 px; 0.000 s (wrap) x3, DETECT on 62, 12.60 to 4.11, 0.00 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 2, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 3, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 4, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 5, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 6, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 7, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 8, the first frame after each wrap: DETECT on 62, TRACK run 0

#### pinball-tilt-cross.mp4, device, 15 ms step, acquisition BORROWED from the static clip, 36.9 ms, not measured

- state: the common set 828 / 828 / 828 frames, 56 / 56 / 56 windows; its TRACK frames 824 / 824 / 824, 56 / 56 / 56 windows; its DETECT frames 4 / 4 / 4; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 3-5 | 292 / 292 / 292 | 20 / 20 / 20 | 288 / 288 / 288 | 20 / 20 / 20 |
| 5-7 | 84 / 84 / 84 | 8 / 8 / 8 | 84 / 84 / 84 | 8 / 8 / 8 |
| 7-10 | 116 / 116 / 116 | 12 / 12 / 12 | 116 / 116 / 116 | 12 / 12 / 12 |
| 10-15 | 336 / 336 / 336 | 24 / 24 / 24 | 336 / 336 / 336 | 24 / 24 / 24 |
- switches per seed, in the footage: 4, 4, 4, 4, 4, 4, 4, 4; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 4.41 / 4.41 px
  - seed 1: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.28, 0.00 px
  - seed 2: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.14, 0.00 px
  - seed 3: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.14, 0.00 px
  - seed 4: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.14, 0.00 px
  - seed 5: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.08, 0.00 px
  - seed 6: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 3.41, 0.00 px
  - seed 7: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.53, 0.00 px
  - seed 8: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.11, 0.00 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 2, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 3, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 4, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 5, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 6, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 7, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 8, the first frame after each wrap: DETECT on 62, TRACK run 0

#### pinball-tilt-cross.mp4, device, 25 ms step, acquisition BORROWED from the static clip, 36.9 ms, not measured

- state: the common set 828 / 828 / 828 frames, 56 / 56 / 56 windows; its TRACK frames 824 / 824 / 824, 56 / 56 / 56 windows; its DETECT frames 4 / 4 / 4; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 3-5 | 292 / 292 / 292 | 20 / 20 / 20 | 288 / 288 / 288 | 20 / 20 / 20 |
| 5-7 | 84 / 84 / 84 | 8 / 8 / 8 | 84 / 84 / 84 | 8 / 8 / 8 |
| 7-10 | 116 / 116 / 116 | 12 / 12 / 12 | 116 / 116 / 116 | 12 / 12 / 12 |
| 10-15 | 336 / 336 / 336 | 24 / 24 / 24 | 336 / 336 / 336 | 24 / 24 / 24 |
- switches per seed, in the footage: 4, 4, 4, 4, 4, 4, 4, 4; at a wrap: 3, 3, 3, 3, 3, 3, 3, 3; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 4.41 / 4.41 px
  - seed 1: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.28, 0.00 px
  - seed 2: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.14, 0.00 px
  - seed 3: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.14, 0.00 px
  - seed 4: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.14, 0.00 px
  - seed 5: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.08, 0.00 px
  - seed 6: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 3.41, 0.00 px
  - seed 7: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.53, 0.00 px
  - seed 8: 8.331 s x4, TRACK on 36, 9.99 to 10.17, 4.41 px; 0.000 s (wrap) x3, DETECT on 62, 12.56 to 4.11, 0.00 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 2, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 3, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 4, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 5, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 6, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 7, the first frame after each wrap: DETECT on 62, TRACK run 0
  - seed 8, the first frame after each wrap: DETECT on 62, TRACK run 0

### pinball-tilt-mid.mp4, 203 x 360, 657 frames, loop 21.994 s, f 175.80 px

#### pinball-tilt-mid.mp4, every frame

- state: the common set 2628 / 2628 / 2628 frames, 88 / 88 / 88 windows; its TRACK frames 2628 / 2628 / 2628, 88 / 88 / 88 windows; its DETECT frames 0 / 0 / 0; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 10-15 | 528 / 528 / 528 | 24 / 24 / 24 | 528 / 528 / 528 | 24 / 24 / 24 |
| 15-20 | 1084 / 1084 / 1084 | 52 / 52 / 52 | 1084 / 1084 / 1084 | 52 / 52 / 52 |
| 20-30 | 1016 / 1016 / 1016 | 36 / 36 / 36 | 1016 / 1016 / 1016 | 36 / 36 / 36 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: none px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 4, 4, 4, 4, 4, 4, 4, 4; largest corner difference under H across them, px, per seed: 2.0e-13, 1.8e-13, 2.0e-13, 2.0e-13, 1.8e-13, 2.0e-13, 1.8e-13, 2.0e-13; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 2, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 3, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 4, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 5, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 6, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 7, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314
  - seed 8, the first frame after each wrap: TRACK on 27, a lock crossing, TRACK run 2628; TRACK on 27, a lock crossing, TRACK run 1971; TRACK on 27, a lock crossing, TRACK run 1314

#### pinball-tilt-mid.mp4, device, 15 ms step, acquisition BORROWED from the static clip, 36.9 ms, not measured

- state: the common set 72 / 1316 / 1316 frames, 0 / 88 / 88 windows; its TRACK frames 4 / 1316 / 1316, 0 / 88 / 88 windows; its DETECT frames 0 / 0 / 68; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 10-15 | 0 / 256 / 256 | 0 / 24 / 24 | 0 / 256 / 256 | 0 / 24 / 24 |
| 15-20 | 4 / 540 / 540 | 0 / 44 / 44 | 0 / 540 / 540 | 0 / 44 / 44 |
| 20-30 | 8 / 520 / 520 | 0 / 36 / 36 | 4 / 520 / 520 | 0 / 36 / 36 |
| over 40 | 0 / 0 / 56 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 8; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 0.00 / 0.00 px
  - seed 8: 7.231 s x4, DETECT on 5, 63.54 to 1.57, 0.00 px; 7.664 s x4, DETECT on 7, 1.57 to 60.79, 0.00 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 8
  - seed 8: 4.432 s x4, DETECT on 6; 14.862 s x4, DETECT on 5
- the loops: distinct among the 4 counted, bit for bit, per seed: 4, 4, 4, 4, 4, 4, 4, 1; largest corner difference under H across them, px, per seed: 1.8e-13, 1.7e-13, 1.7e-13, 1.8e-13, 1.8e-13, 1.7e-13, 1.8e-13, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 2, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 3, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 4, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 5, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 6, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 7, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 8, the first frame after each wrap: LOST on 6, TRACK run 0

#### pinball-tilt-mid.mp4, device, 25 ms step, acquisition BORROWED from the static clip, 36.9 ms, not measured

- state: the common set 72 / 1316 / 1316 frames, 0 / 88 / 88 windows; its TRACK frames 4 / 1316 / 1316, 0 / 88 / 88 windows; its DETECT frames 0 / 0 / 68; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 1-3 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 10-15 | 0 / 256 / 256 | 0 / 24 / 24 | 0 / 256 / 256 | 0 / 24 / 24 |
| 15-20 | 4 / 540 / 540 | 0 / 44 / 44 | 0 / 540 / 540 | 0 / 44 / 44 |
| 20-30 | 8 / 520 / 520 | 0 / 36 / 36 | 4 / 520 / 520 | 0 / 36 / 36 |
| over 40 | 0 / 0 / 56 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 8; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 0.00 / 0.00 px
  - seed 8: 7.231 s x4, DETECT on 5, 63.54 to 1.57, 0.00 px; 7.664 s x4, DETECT on 7, 1.57 to 60.79, 0.00 px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 8
  - seed 8: 4.432 s x4, DETECT on 6; 14.862 s x4, DETECT on 5
- the loops: distinct among the 4 counted, bit for bit, per seed: 4, 4, 4, 4, 4, 4, 4, 1; largest corner difference under H across them, px, per seed: 1.8e-13, 1.7e-13, 1.7e-13, 1.8e-13, 1.8e-13, 1.7e-13, 1.8e-13, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 2, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 3, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 4, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 5, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 6, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 7, the first frame after each wrap: TRACK on 25, a lock crossing, TRACK run 1316; TRACK on 25, a lock crossing, TRACK run 987; TRACK on 25, a lock crossing, TRACK run 658
  - seed 8, the first frame after each wrap: LOST on 6, TRACK run 0

### pinball-tilt-sweep.mp4, 203 x 360, 868 frames, loop 28.991 s, f 175.80 px

#### pinball-tilt-sweep.mp4, every frame

- state: the common set 3432 / 3466 / 3472 frames, 116 / 116 / 116 windows; its TRACK frames 3312 / 3446 / 3456, 112 / 116 / 116 windows; its DETECT frames 8 / 24 / 120; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 7-10 | 0 / 0 / 8 | 0 / 0 / 0 | 0 / 0 / 8 | 0 / 0 / 0 |
| 10-15 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 15-20 | 4 / 8 / 28 | 0 / 0 / 4 | 4 / 4 / 12 | 0 / 0 / 0 |
| 20-30 | 2004 / 2104 / 2116 | 72 / 72 / 72 | 1964 / 2100 / 2112 | 68 / 72 / 72 |
| 30-40 | 1340 / 1346 / 1364 | 48 / 48 / 52 | 1340 / 1340 / 1348 | 48 / 48 / 48 |
| over 40 | 4 / 8 / 40 | 0 / 0 / 4 | 0 / 0 / 4 | 0 / 0 / 0 |
- switches per seed, in the footage: 16, 0, 0, 0, 0, 8, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: 0.00 / 6.27 / 11.40 px
  - seed 1: 0.267 s x4, TRACK on 8, 26.29 to 7.66, 6.27 px; 0.300 s x4, DETECT on 8, 7.66 to 33.85, 11.40 px; 0.467 s x4, TRACK on 9, 17.55 to 8.81, 5.46 px; 0.500 s x4, DETECT on 10, 8.81 to 23.82, 0.00 px
  - seed 6: 0.267 s x4, TRACK on 8, 26.29 to 7.66, 6.27 px; 0.300 s x4, DETECT on 8, 7.66 to 33.85, 11.40 px
- single TRACK switches on 8 or 9 inliers: seed 1, 0.267 s, 8 inliers; seed 1, 0.467 s, 9 inliers; seed 6, 0.267 s, 8 inliers
- wrong-pose label, flagged frames per seed: 0, 0, 0, 0, 0, 0, 0, 0
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 1, 1, 1, 1, 1, 1, 1; largest corner difference under H across them, px, per seed: 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0, 0.0e+0; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 2, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 3, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 4, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 5, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 6, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 7, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 8, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1

#### pinball-tilt-sweep.mp4, device, 15 ms step, acquisition BORROWED from the static clip, 36.9 ms, not measured

- state: the common set 1600 / 1692 / 1728 frames, 112 / 116 / 116 windows; its TRACK frames 1556 / 1672 / 1720, 104 / 112 / 116 windows; its DETECT frames 8 / 22 / 56; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 10-15 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 15-20 | 4 / 8 / 12 | 0 / 0 / 0 | 4 / 6 / 12 | 0 / 0 / 0 |
| 20-30 | 904 / 1004 / 1036 | 60 / 68 / 72 | 880 / 994 / 1032 | 60 / 68 / 72 |
| 30-40 | 672 / 678 / 684 | 44 / 48 / 48 | 668 / 672 / 676 | 44 / 48 / 48 |
| over 40 | 0 / 4 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: none px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 4, 0, 0, 0, 0, 0, 0, 0
  - seed 1: 1.000 s x4, DETECT on 5
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 2, 1, 2, 2, 2, 2, 2; largest corner difference under H across them, px, per seed: 0.0e+0, 1.7e-13, 0.0e+0, 1.4e-13, 1.3e-13, 1.0e-13, 5.0e-14, 1.4e-13; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 2, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 3, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 4, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 5, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 6, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 7, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 8, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1

#### pinball-tilt-sweep.mp4, device, 25 ms step, acquisition BORROWED from the static clip, 36.9 ms, not measured

- state: the common set 1600 / 1692 / 1728 frames, 112 / 116 / 116 windows; its TRACK frames 1556 / 1672 / 1720, 104 / 112 / 116 windows; its DETECT frames 8 / 22 / 56; ok frames with no tilt 0 / 0 / 0
| tilt band, deg | frames | windows | TRACK frames | TRACK windows |
|---|---|---|---|---|
| 10-15 | 0 / 0 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 15-20 | 4 / 8 / 12 | 0 / 0 / 0 | 4 / 6 / 12 | 0 / 0 / 0 |
| 20-30 | 904 / 1004 / 1036 | 60 / 68 / 72 | 880 / 994 / 1032 | 60 / 68 / 72 |
| 30-40 | 672 / 678 / 684 | 44 / 48 / 48 | 668 / 672 / 676 | 44 / 48 / 48 |
| over 40 | 0 / 4 / 24 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
- switches per seed, in the footage: 0, 0, 0, 0, 0, 0, 0, 0; at a wrap: 0, 0, 0, 0, 0, 0, 0, 0; the corner distance at a switch, all seeds together, a labelled summary: none px
- single TRACK switches on 8 or 9 inliers: none
- wrong-pose label, flagged frames per seed: 4, 0, 0, 0, 0, 0, 0, 0
  - seed 1: 1.000 s x4, DETECT on 5
- the loops: distinct among the 4 counted, bit for bit, per seed: 1, 2, 1, 2, 2, 2, 2, 2; largest corner difference under H across them, px, per seed: 0.0e+0, 1.7e-13, 0.0e+0, 1.4e-13, 1.3e-13, 1.0e-13, 5.0e-14, 1.4e-13; media times differing in state or in some loops only, per seed: 0, 0, 0, 0, 0, 0, 0, 0
  - seed 1, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 2, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 3, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 4, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 5, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 6, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 7, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1
  - seed 8, the first frame after each wrap: TRACK on 8, a lock crossing, TRACK run 1

## The independent review

**A fresh reviewer** (a subagent, given the registration, the diff, a draft of this addendum and the evidence files, not this session's
reasoning) answered: does the code meet each G criterion as registered; is any check weaker than its registered form; is anything changed
that the registration does not allow. **Its answers: G0 to G5 are met; no registered comparison is weaker; nothing disallowed is changed** (the
page, the stateless mode, the worker, `TUNABLE_TRACKER_OPTIONS`, `pose_filter.ts`, R-truth with the option off, `poseSelection`). It read the
verdict and headline tables against the stdout cell by cell, and the 172's account against the first record and its script. It ran the two new
test files and nothing else, so `npm test`, the build, the typecheck and the script's self-test were outside what it verified.

**Disclosure:** the brief says no advisor, and that held for this session. The reviewer, not told so, consulted its advisor tool once after gathering
its evidence, and said so. It credits it with finding 9 below and the wording of finding 3. Each was checked against the files before being acted on.

**What it found, each read against the code before anything changed, and what changed:**

| | The finding | What changed |
|---|---|---|
| 1 | The draft said that later commits touch nothing the check reads, while one had changed the script, whose hash is in its stdout, and that nothing under `packages/` changed after `14c7e25`, while the README and a test title did | Every run re-done at the commit this addendum names; both sentences rewritten |
| 2 | The draft said it reads no jitter of the guard's, while G4's block prints "GUARD at 7" | The sentence, in the script and here, now says these are registered cells checked equal, and that no comparison is made |
| 3 | The negatives had no clean evidence: the two G3 legs had run apart, one on a dirty tree | One full `--negatives` run, from a clean tree, gave the table above |
| 4 | **G5's count of filtered frames was vacuous:** it compared objects from two runs, so its guard could not fire and "of them filtered" was false. G5's registered comparison was sound | It compares the poses now. The figure above is what that reads |
| 5 | **No code mutant reached G1's registered pose comparison,** since the reading is compared first and fired first | Three mutants keep the reading right and the pose wrong, and fire on the pose |
| 6 | The "previous frame's tilt" mutant fired on its initial value, not on staleness | It starts from the first frame's own tilt, and fires on a later frame; its regex refuses the first |
| 7 | The registered corner distance at each switch and a TRACK run's length across a wrap were missing: the draft dropped every per-seed line | Each seed's line is under its schedule above |
| 8 | "On no frame of the corpus" overreached: the count reads the counted loops | Said so |
| 9 | "About 37 minutes each": one run had taken 46 | The times in Step 0 are the final runs' own |
| 10 | The table clip's largest step was at a wrap, unlabelled | Labelled |
| 11 | The README's "less accurate" read as an accuracy claim, which the registration does not register | Worded as what the table on one `K` read |
| 12 | The README said a refused key is named with the one it may have meant; that is only on a near match | Said so |
| 13 | A test's title claimed a frame guarded and fallen back, and did not assert one | The title says what it holds; such frames are G2's negative on the table clip |
| 14 | A counted run did not refuse `--clip` or `--only`, and could read stale results | It refuses both, and an out directory that exists |

No finding touched `src/`, and no G criterion or registered figure changed. Findings 4 to 6 were defects in the check's own teeth, each fixed by
making it stricter, and a fresh review was not run over those fixes: they were seen firing as described, in the table of negatives.

## What this addendum does not establish

- **Adoption.** The option stays off by default. Whether the guard is worth having, and at what threshold, is #109's and M9's.
- **The device.** Every run is a desktop replay; no device session was run.
- **Pose accuracy.** Nothing here measures how close any pose is to a true one. G1 and G3 say that the option does what was registered,
  not that what was registered is better.
- **A real `K`.** Every tilt is read through the assumed `K`. The registration's scope stands: the threshold was derived under a matched
  `K`, it moves under a focal-length mismatch, and no claim is made that 10° suits any real camera.
- **The composition's value.** G5 is structural, and no figure of the filter on the guard exists.
- **The metric.** #228's implementation is the next brief.
- **The borrowed rows.** The tilt clips' 15 and 25 ms rows use an acquisition time not measured on those clips.
