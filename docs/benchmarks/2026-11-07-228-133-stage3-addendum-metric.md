# #228, the metric's addendum: M0 to M8 run against the implementation (2026-11-07)

**An addendum to the registration at `e076734`,
[`2026-11-06-228-133-stage3-registration.md`](./2026-11-06-228-133-stage3-registration.md): it checks M0 to M8 on
[#228](https://github.com/webarkit/webarkit/issues/228)'s implementation, each both ways, and reports what that registration left
to this document. It registers nothing new.** The registration is not edited. The implementation is `METRICS_VERSION` 2 in
`examples/js/`, its callers, and `--clips tilt` in `scripts/replay-clips.mjs`.

**Every criterion held.** M3 fired once on the way, on a defect in this check's own command and not in what it measures: see M3. **The depth rule fires on one frame of the corpus,** in the warm-up loop of one seed of one clip: see M2.

| Criterion | Verdict | The figure it is read on |
|---|---|---|
| M0, version 1's definitions | **held** | all 46 version 1 strings hash as at the base; the only new keys are the seven, each byte for byte against the registration's own text; `METRICS_VERSION` 2 |
| M1, the frozen metric | **held** | the text of `cornerJitter` and of `reprojectCorners` hashes as at the base; the summary's four keys equal a call of the first |
| M2, the corners | **held** | seeds 1 to 8, six clips, every frame of all 6 loops, `Object.is`, on the IPPE and FILTER arms, and on the guard's on the first record's clips |
| M3, version 1's figures | **held** | R-replay `98323f06…` with the projection, another hash without it, R-truth `d1d427f3…`, 6,026,097 bytes |
| M4, the probes' figures | **held** | every registered cell equal as printed |
| M5, the export | **held** | suite: three modes, posed and not; 105 replay exports scanned; `check:page` on the page's tracking export |
| M6, the gate | **held** | two committed pairs as at the base, by hash, pose part null; constructed pairs of known distance; refusals |
| M7, the tilt clips | **held** | M4's rows through `--clips tilt`, 8 seeds; the three SHA-256; every device export names the constant; the flag refused |
| M8, the guard's figures | **held** | 0.129; 4.245 / 4.880 / 10.703; 2.420 / 3.397 / 5.193 |

## Step 0: base, toolchain and the brief's check

- **The base:** `feat/228-pose-metric`, branched from `origin/dev` at `122f6377124a2b665caacd01cf0db372ed0e5420`, the merge of
  [#236](https://github.com/webarkit/webarkit/pull/236), one past the guard's merge `b526bb7`, which changes two doc comments under
  `packages/nft-tracker/src/` and no code the metric reads. Node v24.21.0, the pin; ffmpeg 9; Windows 11. The session ran on
  Claude Opus 5.5, with no advisor, as the brief says.
- **The tree the figures are read on:** `172902dc5dc93e086b6d522bd02b3b836dae50fc`, built with `npm run build` from it. `git diff HEAD | sha256sum` is `e3b0c442…`, the
  empty diff, and `git status --short` is empty, at both ends of every counted run, on stderr. The commits after it are this
  file's, which the check does not read. Since each counted run refuses a replay directory of another head, repeating it at a later commit starts with a fresh `--prepare`.
- **The check:** [`2026-11-07-228-133-stage3-metric-check.mjs`](./2026-11-07-228-133-stage3-metric-check.mjs). Its `--self-test` passes.
  `--prepare` wrote the replay directory both runs read, at that commit, and each counted run refuses an export or a `seq.stdout` built at any other. Two counted runs gave byte-identical stdout, **SHA-256 `af949cbfdd7abccca57fc4dac451bd646bcba94efc2a0f5c3aaae13441652e2f`**, each
  exit 0, in 996 s and 1041 s. Every figure below is in that stdout, apart from the negatives' table, which is the same script's `--negatives`
  stdout, **SHA-256 `c136a3c32efb7d4a804b261d7e894e5bd433e5384586b4134f731b310df46af1`**, and what the suite, `check:page` and the page's mutants print at that tree, named where each stands. The first M3 reading below is from the failed run's stderr, and M6's two counts of common media times from the base's module. The per-export refusal's line, under the negatives, is from a run by hand. None of those four outputs is committed.
- **The brief's check.** Every citation held: the registration and its Step 0, the three comments on #228, the references script,
  the code's lines, milestone 10, and the 68 and 30 committed exports. **What differed, none a stop:**
  1. **The registration's `NEW_KEYS` range,** "lines 1895 to 1908": the list is 1895 to 1906, and 1907 and 1908 are `withoutNew`, which did
     not change.
  2. **`compare-exports.test.mjs` needed no change at all.** The registration allows its version assertions to change "where M6 replaces
     them", and none did: its `metricsVersion: undefined` case still refuses, and M6's cases are new, in their own file.
  3. **The fixture in `bench-metrics.test.mjs`'s `sequenceRefusal` block still passes `metricsVersion`,** which the function no longer reads.
     That line is outside the list of lines allowed to change, so it stays, inert.
- **Seen before the check ran:** the registration, the two probes' records, the guard's addendum. The metric's arms had been measured by
  the probes, the registration says so, and calls these checks and not predictions.

### The existing test lines changed

All in `examples/test/bench-metrics.test.mjs`, each on the registration's list:

- the version literal, `expect(METRICS_VERSION).toBe(1)` to `2`;
- `NEW_KEYS`, gaining `posePosedFrames`, `poseJitterWindows`, `poseJitterPx` and `poseSpreadPx`;
- the exact `frameRecord` expectation, gaining `H` and `poseCorners: null`;
- `K` in `frameRecord`'s fixtures: one constant and one key on the `base` every call spreads.

`examples/test/glossary.test.mjs` is unchanged and passes against the glossary's version 2 and seven new entries.

## M0 and M1: held, in `examples/test/pose-metric.test.mjs`

- **M0.** Each version 1 string against its hash at `122f637`, each new string against the registration's own line, which the test
  reads from the file, so a transcription cannot agree with itself. The code's strings were generated from those lines.
- **M1.** Under Vitest a function's `toString` is the transformed source, so the test hashes the function's text in the module, line
  endings normalised. Read directly, against both `b526bb7` and `122f637`: `cornerJitter` `004b6d9ad88c5ea45472babe7d1798b7241b1044eb159c333c578946bf2b1e1e`, `reprojectCorners` `03be5d340460c82713a449c8c1fc98fddb5ed0a7af30fc3fa0fa9c3976d08e9d`, the same at `172902d`.
- **"From a call of that function":** the summary's four keys equal `cornerJitter` over the frames with their `poseCorners` as `corners`,
  read in a case whose two families differ by a factor of seven. M4's second half holds the same on every clip and seed.

## M2, the corners: held

Through the real `frameRecord`, each frame's `poseCorners` against the repeat's lines 152 to 179, carried in the check, on that frame's own
result. "Every frame" is read as the registration's every-frame schedule, all 6 loops, not only the counted ones. The 15 and 25 ms schedules
are not in M2, and on the tilt clips M7 reads them. The last column says FILTER's row is not IPPE's read twice.

| clip | frames a run, all 6 loops | posed, IPPE | posed, FILTER | posed, the guard | frames FILTER moved | good poses the depth rule refused, every arm, all seeds |
|---|---|---|---|---|---|---|
| pinball-static.mp4 | 2178 / 2178 / 2178 | 2178 / 2178 / 2178 | 2178 / 2178 / 2178 | 2178 / 2178 / 2178 | 2176 / 2176 / 2176 | 0 |
| pinball-bench.mp4 | 1788 / 1788 / 1788 | 1266 / 1272 / 1284 | 1266 / 1272 / 1284 | 1266 / 1272 / 1284 | 1170 / 1191 / 1206 | 0 |
| pinball-bench-table.mp4 | 1602 / 1602 / 1602 | 1266 / 1290 / 1350 | 1266 / 1290 / 1350 | 1266 / 1290 / 1350 | 1212 / 1251 / 1320 | 0 |
| pinball-tilt-cross.mp4 | 2502 / 2502 / 2502 | 2502 / 2502 / 2502 | 2502 / 2502 / 2502 | not run | 2490 / 2490 / 2490 | 0 |
| pinball-tilt-mid.mp4 | 3942 / 3942 / 3942 | 3726 / 3763 / 3809 | 3726 / 3763 / 3809 | not run | 3713 / 3757 / 3802 | 2 |
| pinball-tilt-sweep.mp4 | 5208 / 5208 / 5208 | 5147 / 5199 / 5207 | 5147 / 5199 / 5207 | not run | 4955 / 5162 / 5177 | 0 |

The good poses the depth rule refused, every arm, all 6 loops:
- pinball-tilt-mid.mp4, seed 6, IPPE, frame 158 of the run, media 5.298 s, DETECT on 5 inliers, corners present
- pinball-tilt-mid.mp4, seed 6, FILTER, frame 158 of the run, media 5.298 s, DETECT on 5 inliers, corners present

**The depth rule fired on no frame of the first record's clips,** as that record found. **It does fire on the tilt clips, on the frame named above:** a pose with `good` true, one corner behind the camera and `w` under `H` positive at all four, so it has `corners` and no `poseCorners`, in the warm-up loop. It is the one such frame in the corpus. That frame shows the rule reachable, but it holds one corner behind, so it does not exercise the case the rule was registered for, an all-negative `w` that `reprojectCorners` would accept: the constructed all-behind pose in the suite is what catches the rule's removal, as the registration says it must.

## M3, version 1's figures: held

R-replay, 19 step-independent outputs, with --v1-projection: 98323f061ecef7022d536c22f024d374a119edcd8ce6af3927b37309f2c6b546
without the projection: c321d0c4e14837ad6be0e0a5401be93386710f7ce4faa1fce2aafed1482f7153
R-truth: 6026097 bytes, sha256 d1d427f33ce819ab5760377dcb3999ba979b09ab402a51a830895e27203c4f8f

The 19 outputs were written at the tip and read by the registered references script, which the check spawns. **`--sequence` on the committed
export runs,** and its stdout is one of the 19.

**M3 fired once before it held.** The first counted run read `494ceb14…`. The check's `--prepare` had passed `--sequence` an absolute path, and the
replay prints that path in a line #211's mask keeps. Run as the references script's header writes it, with the relative path, on the same exports,
it read `98323f06…`. So the defect was in this check's command, and neither the criterion nor the reference moved. The script was corrected in its own
commit, and M2, M4, M7 and M8 had held in that same run.

## M4, the probes' figures: held

| clip | frames | windows | IPPE jitter | FILTER jitter | IPPE spread | FILTER spread |
|---|---|---|---|---|---|---|
| pinball-static.mp4 | 1452 | 52 | 0.270 | 0.227 | 1.079 | 1.057 |
| pinball-bench.mp4 | 844 / 848 / 856 | 36 | 4.284 / 4.912 / 10.720 | 4.355 / 4.982 / 10.757 | 44.847 / 45.130 / 46.296 | 44.881 / 45.164 / 46.326 |
| pinball-bench-table.mp4 | 844 / 860 / 900 | 28 / 32 / 36 | 2.863 / 3.718 / 5.368 | 2.845 / 3.705 / 5.355 | 26.781 / 27.456 / 28.001 | 26.786 / 27.460 / 28.004 |
| pinball-tilt-cross.mp4 | 1668 | 56 | 0.300 / 0.302 / 0.305 | 0.270 / 0.276 / 0.279 | 19.061 / 19.061 / 19.063 | 19.062 / 19.064 / 19.065 |
| pinball-tilt-mid.mp4 | 2628 | 88 | 0.217 | 0.171 | 7.628 | 7.630 |
| pinball-tilt-sweep.mp4 | 3432 / 3466 / 3472 | 116 | 1.482 / 1.750 / 3.895 | 1.473 / 1.738 / 3.886 | 16.125 / 16.156 / 16.459 | 16.116 / 16.147 / 16.449 |

**How it is read,** as the registration says: through `replayRun` and `frameRecord` at the eight seeds. On the first three clips, seed 1's frames equal the
`--external 70` arm-1 export, `trackerTimings` apart, and on the tilt clips each seed's equal its `--clips tilt` export. The common set is the frames of the
counted loops on which `H`, IPPE, CF, FILTER and, on the first three clips, the guard all have corners and the closed form has a tilt. The tilt clips run no guard
arm: its pose is one of IPPE's and CF's on every frame (G1), so it could remove no frame.

**Beside the cells,** the summary's four keys equal the frozen metric on `poseCorners` over the counted loops, arm by arm, by `Object.is`. **The tilt clips' FILTER and
spread cells are reads:** the registration prints no figure for them and holds them by M2.

**On moving footage, here and in M7, M8 and the tables below,** the registered statement stands beside each figure: this metric reads attenuated motion as lower jitter, and every figure is through the assumed `K`. **A seed is not a replicate of the
noise:** "0.217" on mid is one observation in eight seeds.

## M5, the export: held

- **In the suite:** `frameRecord` on a tracking, a detection-only and a stateless result, posed and not; `H` read back through JSON by `Object.is`, an ordinary array; version 1's
  keys in their order with the two after them; each null rule; `K` absent, null or of the wrong length throws, on all three modes.
- **Every replay export, by the key:**

| group | exports | frames | with poseCorners |
|---|---|---|---|
| def, detection-only | 6 | 2371 | 2001 |
| def, tracking | 12 | 4477 | 3941 |
| ext, tracking | 15 | 22268 | 17602 |
| tilt, tracking | 72 | 182532 | 178231 |

- **The page:** `check:page`'s new case on the `?loops=1` tracking export: version 2, every frame holding both keys, the summary's four, the seven definitions. **35 of 35,** one more than
  the brief's 34. It runs the tracking mode only, as the registration says, so the stateless and detection-only modes on the page rest on the suite's `frameRecord` and the page's one call of it.
- **Its negatives,** a mutant of the served `bench-frames.mjs` with the manifest's hash of it patched for the run: the frame's `H` left out, "590 frames lack H or poseCorners", 34 of 35, that case the one failed; `poseCorners` always
  null, "no ok frame has poseCorners". **That mutant ran three times at this tree:** twice 34 of 35, that case the one failed; once 33, the seeded `?seed=1` scenario also stopping, 182.5 s against 149.9 and 174.2. The stop's message was cut short by the helper, it did not recur, and its cause is not established. The frame count is a real-time run's and moves: an earlier run read 594. The tree was the same after each.

## M6, the gate: held, in the same test file

- **Two committed pairs, version 1,** as at the base, by a SHA-256 of their comparison under `H` taken there: the two `2026-09-26` stateless wall exports, 97 common media times, and the `2026-09-28` baseline and
  `iter20` wall exports, 84. Pose part `null`.
- **A version 1 and a version 2,** the same hash, in either order, pose part `null`, **and a version 1 export whose frames carry `poseCorners`,** which only the gate can refuse. The negatives found that case missing.
- **Two version 2:** a constructed pair reading 9 px, the median of 3, 6, 9, 120 and 150, where the corners' sum reads 36; no common `poseCorners`, `null`, the comparison under `H` standing; a loop unposed in one, paired k-th with k-th, 2 px and not 8.
- **Refused, in either place:** no version, null, 0, 3 and the string `"2"`. **`sequenceRefusal`:** 1 and 2 read, the same five refused, and the committed export read.

**The refusal's words changed,** which the registration's text asks for: "its frames do not carry corners as defined here" would be false of a version 1 export and unknown of any other. It now names the versions read.

## M7, the tilt clips: held

pinball-tilt-cross.mp4: 3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e
pinball-tilt-mid.mp4: f29c37d71fa074bc8ae4e8c94a89a2f9b6654e458a6d4b144ee5bdf85267e915
pinball-tilt-sweep.mp4: 90c5af74401577b29f7090f07b9205d7d5e6524baed7f48d44a6dc9ea4eb9dcf
every-frame frames of all 8 seeds equal the check's, trackerTimings apart; the device schedules' too, each naming: acquisition BORROWED: 36.9 ms, the static clip's, not measured
| clip | schedule (BORROWED acquisition) | frames a run | counted, with poseCorners | windows | jitter |
|---|---|---|---|---|---|
| pinball-tilt-cross.mp4 | device, 15 ms step | 1243 / 1243 / 1243 | 828 / 828 / 828 | 56 / 56 / 56 | 0.306 / 0.308 / 0.312 |
| pinball-tilt-cross.mp4 | device, 25 ms step | 1243 / 1243 / 1243 | 828 / 828 / 828 | 56 / 56 / 56 | 0.306 / 0.308 / 0.312 |
| pinball-tilt-mid.mp4 | device, 15 ms step | 966 / 1927 / 1928 | 72 / 1316 / 1316 | 0 / 88 / 88 | 0.226 / 0.226 / 0.226, over the seeds with a window; seed 8: none |
| pinball-tilt-mid.mp4 | device, 25 ms step | 966 / 1927 / 1928 | 72 / 1316 / 1316 | 0 / 88 / 88 | 0.226 / 0.226 / 0.226, over the seeds with a window; seed 8: none |
| pinball-tilt-sweep.mp4 | device, 15 ms step | 2460 / 2556 / 2574 | 1600 / 1692 / 1728 | 112 / 116 / 116 | 0.746 / 1.460 / 3.952 |
| pinball-tilt-sweep.mp4 | device, 25 ms step | 2460 / 2556 / 2574 | 1600 / 1692 / 1728 | 112 / 116 / 116 | 0.746 / 1.460 / 3.952 |
pinball-tilt-cross.mp4: the 15 and 25 ms schedules' frames, trackerTimings apart, are the same in 8 of 8 seeds
pinball-tilt-mid.mp4: the 15 and 25 ms schedules' frames, trackerTimings apart, are the same in 8 of 8 seeds
pinball-tilt-sweep.mp4: the 15 and 25 ms schedules' frames, trackerTimings apart, are the same in 8 of 8 seeds

--clips tilt against each form, and an unknown value:
- --external: exit 2: replay-clips: --clips tilt is a form of its own: --external cannot be combined with it
- --sequence: exit 2: replay-clips: --clips tilt is a form of its own: --sequence cannot be combined with it
- --transfer: exit 2: replay-clips: --clips tilt is a form of its own: --transfer cannot be combined with it
- --device-ratio: exit 2: replay-clips: --clips tilt is a form of its own: --device-ratio cannot be combined with it
- --tracking-only: exit 2: replay-clips: --clips tilt runs tracking runs only: drop --tracking-only
- --clips other: exit 2: replay-clips: --clips expects tilt, got "other"

**The label is in the export, as registered:** `CLIPS` and `DEVICE_ACQUIRE_MS` are unchanged, which M3 holds, and `TILT_BORROWED_ACQUIRE_MS` is declared apart. **On mid, those figures read 7 of 8, as the registration says:** seed 8 holds no lock on the device schedules, which is what its 72 frames and no window are, and a borrowed constant decided that frame set. **The 15 and 25 ms rows are one schedule and not two readings,** as the line above each clip's says: the frames are the same. The "with poseCorners" column equals the guard's addendum's "of" on these rows, cell for cell.

## M8, the guard's figures: held

| clip | the guard's jitter |
|---|---|
| pinball-static.mp4 | 0.129 |
| pinball-bench.mp4 | 4.245 / 4.880 / 10.703 |
| pinball-bench-table.mp4 | 2.420 / 3.397 / 5.193 |

## The negatives, each seen failing

Each is a mutant of the code or a defect in the check's inputs, applied by `--negatives` with no run in flight, restored in a `finally`, with the tree compared before and after. A row's last cell is the line that fired.

| criterion | the mutant | how it was read | failed as it must |
|---|---|---|---|
| M0 | a version 1 key's text edited | the suite | × posedFrames keeps its string 11ms |
| M0 | a new key's text edited by one word | the suite | × reads the seven in the record's wording, byte for byte 11ms |
| M0 | another key added | the suite | × has only the seven new keys beside version 1's, which stay in their order 12ms |
| M0 | the version left at 1 | the suite | × is version 2 11ms |
| M1 | a line of cornerJitter's body changed | the suite | × leaves cornerJitter's source as it was 13ms |
| M1 | a line of reprojectCorners changed | the suite | × leaves reprojectCorners' source as it was 13ms |
| M1 | a copy of the metric with a changed n - 2, called for the new keys | the suite | × gives the summary's four keys from a call of it, over poseCorners 15ms |
| M2 | t[0] + 1e-6 | the check, pinball-bench.mp4, seed 1, M2 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-bench.mp4, seed 1, frame 73: M2, IPPE: corner 0, axis 0: 288.5407510965122 and 288.5407508289636 |
| M2 | K scaled 1.01 | the check, pinball-bench.mp4, seed 1, M2 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-bench.mp4, seed 1, frame 73: M2, IPPE: corner 0, axis 0: 289.02615833725326 and 288.5407508289636 |
| M2 | R transposed | the check, pinball-bench.mp4, seed 1, M2 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-bench.mp4, seed 1, frame 73: M2, IPPE: corner 1, axis 0: 399.35167077533407 and 335.8546196629405 |
| M2 | the depth rule removed, against a constructed all-behind pose | the suite | × gives no poseCorners on a target wholly behind the camera 10ms |
| M3 | one version 1 frame key changed | the references script, def rewritten by the mutant | 19 step-independent outputs, projected to version 1: 6f956eff62094b0fdb8c982515de50d43089d78e7b9dfecf20d4728e9b694e91 |
| M3 | a key beyond the six | the references script, def rewritten by the mutant | 19 step-independent outputs, projected to version 1: 0e339e4dfa8d4876f750ae61191f7631b892fb17235980c240f308e9353408e7 |
| M3 | sequenceRefusal left at one version | the references script, seq rewritten by the mutant | 19 step-independent outputs, projected to version 1: 4ded5477a967c1706db24ac40e98935745567b9fa53e37b73c646332ed886749 |
| M3 | CLIPS extended | the references script, def rewritten by the mutant | references: expected 19 step-independent outputs, got 24 |
| M4 | a corners slip into the pose keys: H's column in place of IPPE's | the check, pinball-static.mp4, seed 1, M4 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-static.mp4: M4, IPPE jitter reads 0.125, registered 0.270 |
| M4 | the summary's keys read from corners | the check, pinball-static.mp4, seed 1, M4 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-static.mp4: M4: the summary's poseJitterPx 0.12493888243973919, the frozen metric on poseCorners 0.2697044936797621 |
| M5 | a K defaulted | the suite | × throws with K absent 11ms |
| M5 | H rounded | the suite | × keeps H at full precision, read back through JSON 1ms |
| M5 | the stateless mode left out | the suite | × gives H and poseCorners on a posed stateless frame 8ms |
| M6 | the list left at [2] | the suite | × reads versions 1 and 2, and nothing else 12ms |
| M6 | the list widened to [1, 2, 3] | the suite | × reads versions 1 and 2, and nothing else 11ms |
| M6 | the distance over all four corners' sum | the suite | × gives two version 2 exports the pose part, with a corner distance of known value 13ms |
| M6 | the median as the mean of the middle two | the suite | × reads the median as p50 does, the upper middle on an even count, as the first record's 13ms |
| M6 | a pair with a version 1 export given a pose part | the suite | × gives no pose part on a pair with a version 1 export, whatever its frames carry 13ms |
| M6 | the k-th pairing broken: the last frame at a media time, not the k-th | the suite | × pairs the k-th frame with the k-th at a media time, when a loop is unposed in one 11ms |
| M7 | the label removed | --clips tilt rewritten by the mutant, the check on pinball-tilt-cross.mp4, seed 1, M7 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: tilt/s1/replay-pinball-tilt-cross-tracking-device-15-ms-step.json: M7: schedule "device, 15 ms step" does not name the borrowe... |
| M7 | the refusal against --external removed | the check's refusals | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: M7: --clips tilt with --external: exit 0, not refused by the flag: |
| M7 | the refusal against --sequence removed | the check's refusals | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: M7: --clips tilt with --sequence: exit 2, not refused by the flag: cannot replay x.json: ENOENT: no such file or directory, op... |
| M7 | the refusal against --transfer removed | the check's refusals | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: M7: --clips tilt with --transfer: exit 2, not refused by the flag: replay-clips: --transfer: cannot read dir: ENOENT |
| M7 | a clip's hash that is not the one recorded | the check, --break input-hash | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: examples/videos/pinball-tilt-cross.mp4: SHA-256 3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e, expected 000... |
| M7 | a README hash that is not the clip's | the check, --break readme-hash | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: M7: pinball-tilt-cross.mp4: SHA-256 3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e, examples/README.md gives... |
| M5 | a replay directory of another build | the check, --break stale-head | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: seq.stdout: built at 172902d, the tree's head 0000000000000000000000000000000000000000 |
| M8 | the option's pose read from poseSelection, which gives IPPE's column | the check, pinball-static.mp4, seed 1, M8 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-static.mp4: M8, the guard's jitter reads 0.270, registered 0.129 |
| M8 | the same, against M2's carried function on the FILTER arm | the check, pinball-static.mp4, seed 1, M2 | 2026-11-07-228-133-stage3-metric-check.mjs: fatal: pinball-static.mp4, seed 1, frame 2: M2, FILTER: corner 0, axis 0: 14.122355854424518 and 14.148687318758494 |

every mutant failed as it must, 35 of them; the tree is as it was.

**The `--break stale-head` row reaches only the `seq.stdout` refusal,** which fires first, so the table does not show the per-export one failing. The second read below found that. It was then run by hand, the check's source unchanged, in the same mode on one clip and seed, on a copy of the replay directory with a `seq.stdout` whose header carries the fake head: `2026-11-07-228-133-stage3-metric-check.mjs: fatal: ext/replay-pinball-bench-table-tracking-device-scaled-step-sync.json: built at 172902dc5dc93e086b6d522bd02b3b836dae50fc, the tree's head 0000000000000000000000000000000000000000`

**The first pass had four survivors, and each was a defect here, not in what is measured.** R transposed did fail, at corner 1, since corner 0 is the origin, and the expected line was too narrow. **The pose part's version gate could not fail:** a version 1 export has no `poseCorners`, so no test told the gate from no gate, and the new case above is what kills it. **The refusals against `--sequence` and `--transfer`:** removed, each still exits 2, on the path it cannot read, so the check now reads the refusal's own line.

## What the registration left to this addendum

**The windows where `corners` and `poseCorners` differ ("The summary"). They do not, on the tilt clips or on the first record's: no frame has corners and no `poseCorners`, at any seed, in either arm, in the counted loops at every frame.**

Counted loops 1 to 4; each cell min / median / max over the seeds, and per seed where any differs.
| clip | arm | corners, no poseCorners | posedFrames | posePosedFrames | jitterWindows | poseJitterWindows | seeds where the windows differ |
|---|---|---|---|---|---|---|---|
| pinball-static.mp4 | IPPE | 0 / 0 / 0 | 1452 / 1452 / 1452 | 1452 / 1452 / 1452 | 52 / 52 / 52 | 52 / 52 / 52 | none |
| pinball-static.mp4 | FILTER | 0 / 0 / 0 | 1452 / 1452 / 1452 | 1452 / 1452 / 1452 | 52 / 52 / 52 | 52 / 52 / 52 | none |
| pinball-bench.mp4 | IPPE | 0 / 0 / 0 | 844 / 848 / 856 | 844 / 848 / 856 | 36 / 36 / 36 | 36 / 36 / 36 | none |
| pinball-bench.mp4 | FILTER | 0 / 0 / 0 | 844 / 848 / 856 | 844 / 848 / 856 | 36 / 36 / 36 | 36 / 36 / 36 | none |
| pinball-bench-table.mp4 | IPPE | 0 / 0 / 0 | 844 / 860 / 900 | 844 / 860 / 900 | 28 / 32 / 36 | 28 / 32 / 36 | none |
| pinball-bench-table.mp4 | FILTER | 0 / 0 / 0 | 844 / 860 / 900 | 844 / 860 / 900 | 28 / 32 / 36 | 28 / 32 / 36 | none |
| pinball-tilt-cross.mp4 | IPPE | 0 / 0 / 0 | 1668 / 1668 / 1668 | 1668 / 1668 / 1668 | 56 / 56 / 56 | 56 / 56 / 56 | none |
| pinball-tilt-cross.mp4 | FILTER | 0 / 0 / 0 | 1668 / 1668 / 1668 | 1668 / 1668 / 1668 | 56 / 56 / 56 | 56 / 56 / 56 | none |
| pinball-tilt-mid.mp4 | IPPE | 0 / 0 / 0 | 2628 / 2628 / 2628 | 2628 / 2628 / 2628 | 88 / 88 / 88 | 88 / 88 / 88 | none |
| pinball-tilt-mid.mp4 | FILTER | 0 / 0 / 0 | 2628 / 2628 / 2628 | 2628 / 2628 / 2628 | 88 / 88 / 88 | 88 / 88 / 88 | none |
| pinball-tilt-sweep.mp4 | IPPE | 0 / 0 / 0 | 3432 / 3466 / 3472 | 3432 / 3466 / 3472 | 116 / 116 / 116 | 116 / 116 / 116 | none |
| pinball-tilt-sweep.mp4 | FILTER | 0 / 0 / 0 | 3432 / 3466 / 3472 | 3432 / 3466 / 3472 | 116 / 116 / 116 | 116 / 116 / 116 | none |

**The descriptive `poseCornerDistancePx`, never a criterion.** CF is computed from the exported `H`, through M6's arithmetic, on the common set. **The static clip reads 0.637 px, the first record's, as a read.** It says how far apart two arms are, not which is nearer.

CF computed from the exported H. It has no truth in it: it says how far apart two arms are, and not which is nearer.
| clip | K's f, px | CF to IPPE | FILTER to IPPE |
|---|---|---|---|
| pinball-static.mp4 | 175.80 | 0.637 / 0.637 / 0.637 | 0.145 / 0.145 / 0.145 |
| pinball-bench.mp4 | 415.69 | 0.752 / 0.766 / 0.782 | 0.606 / 0.609 / 0.616 |
| pinball-bench-table.mp4 | 175.80 | 2.711 / 2.808 / 2.868 | 0.674 / 0.692 / 0.697 |
| pinball-tilt-cross.mp4 | 175.80 | 3.091 / 3.091 / 3.091 | 0.148 / 0.148 / 0.149 |
| pinball-tilt-mid.mp4 | 175.80 | 4.611 / 4.611 / 4.611 | 0.123 / 0.123 / 0.123 |
| pinball-tilt-sweep.mp4 | 175.80 | 8.789 / 8.800 / 8.957 | 0.156 / 0.159 / 0.159 |

**Under `H` and under the pose, side by side,** a read of the IPPE arm's whole counted loops and no comparison of the two: they are not the same quantity.

| clip | jitterPx | poseJitterPx |
|---|---|---|
| pinball-static.mp4 | 0.125 / 0.125 / 0.125 | 0.270 / 0.270 / 0.270 |
| pinball-bench.mp4 | 5.294 / 5.391 / 7.933 | 4.284 / 4.912 / 10.720 |
| pinball-bench-table.mp4 | 2.385 / 4.617 / 203.645 | 2.863 / 3.718 / 5.368 |
| pinball-tilt-cross.mp4 | 0.254 / 0.254 / 0.257 | 0.300 / 0.302 / 0.305 |
| pinball-tilt-mid.mp4 | 0.192 / 0.192 / 0.192 | 0.217 / 0.217 / 0.217 |
| pinball-tilt-sweep.mp4 | 0.810 / 2.962 / 4.436 | 1.482 / 1.750 / 3.895 |

**The registration's rule that a figure one frame can move is read with and without it is not applied to this table, or to any figure here:** the table clip's `jitterPx` of 203.645 is plainly such a figure, and it has no leave-one-media-time-out beside it. This document compares no arms, as the next section says, so nothing here rests on it. M9's comparison must carry that reading.

## Stage 2's covariates per clip

**This PR adds none to the guard's addendum's tables,** whose control arm and reads these runs share. The two that this document can add are above: the windows, and the distance, under the registered labels. **The assumed `K`** is `intrinsics(w, h)`, the same for every arm, f as in the distance table. **The loops** and **the wrong-pose label** stand as the guard's addendum reports them. No comparison of arms is made here, so no leave-one-media-time-out stands: those are M9's.

## What differs from the registration, and what it does not settle

- **`poseCornerDistancePx`'s median is the module's `p50`:** `percentile`, the upper middle on an even count, as the first record's 0.637 is. The definition says "median", and the glossary's `p50` entry says to read that comment. A test now holds the convention, since the review's mutant of it survived.
- **The pose part's shape adds to what is registered:** the registered keys sit under `first` and `second`, beside `poseCornerDistancePx`, and it also carries `commonMediaTimes` and `commonFrames`. The definition's median is over those frames. Neither is a key of an export.
- **`scripts/compare-bench.mjs` does not print the pose part.** Nothing registered asks it to, and its output on version 1 stays as it was. It is for M9's plan to say whether its tables need it.
- **Six dated scripts no longer run as they ran.** Four call `frameRecord` directly, and `K` is required: `2026-10-28-137-stage1-pipeline-probe.mjs`, `2026-10-29-137-stage3-g5-check.mjs`, `2026-11-01-202-stage1-probe.mjs` and `2026-11-01-202-stage3-check.mjs`. Two compare a committed export's version with the module's: `2026-10-19-104-stage1-effect-size-probe.mjs` stops, and `2026-10-18-137-stage1-probe.mjs` leaves out every version 1 export, under a reason that is now false. Each ran at the commit its record names, and a committed record is not re-edited.
- **`--clips tilt` is also refused with `--device-ratio` and `--tracking-only`,** beyond the three registered, by the rule that a flag accepted and ignored says something false.

## The independent review

A fresh reviewer, a subagent with no part in the work and told not to consult an advisor, read the registration, the diff at `1b5638a` and a draft of this document whose figures came from an earlier run, at `7c7dd41`. It ran `typecheck`, `format:check`, `npm test`, `check:contract`, `check:provenance`, `check:replay`, `check:page` and the references script in a throwaway clone, and tried mutants of its own.

**Its verdict:** the code meets M0 to M8, the wording is byte for byte by the raw bytes, nothing forbidden changed, the arithmetic has no defect, `--clips tilt` matches the registration, and all 48 device exports carry the label. Its findings were against this document and the check. **None refuted a criterion.**

| # | What it found | What changed |
|---|---|---|
| 1 | The draft said the depth rule fired on no frame. It fires on `pinball-tilt-mid`, seed 6, frame 158, on 5 inliers | The check names each such frame, and M2's sentence was rewritten from them |
| 2 | The provenance did not describe what ran: exports of an earlier commit, a `seq.stdout` replaced by hand, and a check that read only `manifestClean` | The check refuses an export or a `seq.stdout` of another head, with a negative. A fresh `--prepare` and both counted runs were made at `172902d` |
| 3 | Mid's jitter at seed 8 printed 0.000, where there is no window | The check already printed none at `1b5638a`, and the draft's figure was older. The figures now read 7 of 8 |
| 4 | "The registration says its names are proposals" holds of Stage 3 A only | Reworded as additions to what is registered |
| 5 | Two more dated scripts stop or change at this tip | Listed: six in all |
| 6 | An even count's median was unpinned, and its mutant survived | A new test and a negative row |
| 7 | The statement on moving footage claimed more than it stood beside | Reworded |
| 8 | Some figures were in no stdout | The line in Step 0 names where each comes from |
| 9 | The 15 and 25 ms rows are one schedule, "never locks" overstated seed 8, and `check:replay` went unreported | The check prints the line, the wording changed, and the gate is reported in the PR |
| 10 | Low: `NEW_KEYS`' comment is stale, `METRICS_VERSION`'s doc comment could say more, and key order was tested on one mode | Key order now holds on all three modes. The comments stay: the registration's list does not allow the first, and the second is not wrong |

**Its own mutants:** key order swapped, the pose part dropping the clip's duration, the pose part ignoring common media times, the summary over the run's frames, and the `good` check removed were each killed. The median survived, which is finding 6.

**A second fresh reader, also told not to consult an advisor,** read the finished document at `a73378d` against the stdouts and `172902d`, reading only. It re-ran frame 158, and confirmed the counts, the hashes and that no verdict compares arms. It found three things, none refuting a criterion or changing a figure:

1. **The stale-head negative covered only one of its two refusals,** though this document said both were seen failing. The per-export refusal has now been seen failing, as the negatives' section says.
2. **The first review's row 3 was credited to the wrong commit,** and the sentence above was loose about what that review read. Both were corrected. The reader inferred that the review read a tree before `1b5638a`; the session's record shows it was given `1b5638a`, with an older draft.
3. **203.645 has no with-and-without reading,** which the registration asks of a figure one frame can move. It is disclosed where the table stands, for the maintainer to weigh.

## What this addendum does not establish

- **Accuracy.** It reads jitter. It has no truth in it, and a lower figure is not a nearer pose. A claim about which pose is more accurate needs ground truth (#92) or a calibrated camera (#109).
- **The device.** Every figure is a headless desktop replay, with ffmpeg's decoding: not campaign data. #227's finding on the grab under load stands for any comparison on the device.
- **A real `K`.** Every `poseCorners` is through an assumed one, no calibration. How the readings move under another is the repeat's question E and #109's.
- **The filter's lag.** Declared not measurable by this metric. FILTER to IPPE above is a distance, and no lag is read from it.
- **Which pose to use above 10°, or any adoption** of the guard, the filter or a threshold.
- **The 15 and 25 ms rows on the tilt clips as device figures:** they carry a borrowed constant.
- **`--seed-policy run`, or the scaled step.** Neither is read here.
