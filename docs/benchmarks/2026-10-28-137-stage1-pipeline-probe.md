# #137, Stage 1 probe, completed: the detection gate's candidates run in the pipeline, seeded through the contract (2026-10-28)

**A Stage 1 probe under [the step protocol](./step-protocol.md), run on
2026-10-28: a desktop replay, headless, every frame processed, of the three
committed clips through the shipped pipeline, with each candidate gate
applied by a probe-side backend wrapper and RANSAC seeded through the
contract's `RansacOptions.rng`. Not campaign data; never reportable as a
round. It measures and registers nothing. The gate's form is the
maintainer's decision; the Stage 3 texts at the end are drafts pending his
ruling, and no candidate is recommended here.**

[#149](https://github.com/webarkit/webarkit/pull/149)'s probe
([`2026-10-18-137-stage1-probe.md`](./2026-10-18-137-stage1-probe.md)) read
committed exports with frames excluded post hoc. Its Verdict, statement 3,
says what that could not do: "None of this establishes what #137's fix would
produce. An exclusion from the metric is not a gate in the pipeline", and
"Settling it needs the fixed pipeline run on the hand-held clips, and this
probe does not do that". This probe runs that pipeline.

The computation is
[`2026-10-28-137-stage1-pipeline-probe.mjs`](./2026-10-28-137-stage1-pipeline-probe.mjs).
Every figure below is in its stdout, except the pre-probe check's and two
post-run reads of the run's own output files (under "What LOST,
`trackLoss` and the reacquisitions count here" and "Non-finite held-out
scores"), each labelled as such. Its per-frame rows (one JSONL file per run) and per-run
table (`runs.tsv`) go to a run directory and are not committed (`AGENTS.md`,
"Test assets": desktop replays reproduce from the repository); stdout prints
their hashes.

    npm ci && npm run build
    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <replay dir>
    node docs/benchmarks/2026-10-28-137-stage1-pipeline-probe.mjs --replay <replay dir> --out <run dir>

## Step 0: provenance, and the brief's check

- **Ref:** `docs/137-stage1-pipeline-probe`, branched from `origin/dev` at
  **`b31635d9d8c4f8d6b60e6befd86ee7687c5c0636`**, after `git fetch origin`;
  the worktree clean. Node v24.21.0, the pin; ffmpeg and ffprobe 9.0.2
  (gyan.dev essentials build); Windows 11, Intel i7-9700.
- **The brief's citations** were checked at that SHA before any work: the
  quotes from #137's body, its addendum and usage rule of 2026-10-15 and its
  two comments; #149's Verdict; `docs/benchmarks/README.md`'s section "#137's
  fix follows the campaign, and what stays open before round 1 of #104
  (2026-10-18)" (line 5670); the protocol's Stages 2 and 3 and its box;
  ADR-0001 point 7 (line 60); `detectTarget` (`detection.ts`, line 371) and
  its unseeded call (line 422, its comment at lines 366 to 369). All held.
- **One ruling did not hold, and was re-ruled by the maintainer before any
  measurement.** The brief asked for the clips to be decoded "as the
  2026-10-15 measurement in #137's body did" and also through
  `scripts/replay-clips.mjs`'s decoding, imported. Those are two decodings,
  and neither script exports its decoder (the pre-probe check below). The
  maintainer's re-ruling of 2026-10-28: use `replay-clips.mjs`'s decoding,
  copied into the probe, and the six-loop schedule of its `--external`
  "every frame, sync" arm, so that the seed spread is on the basis of #137's
  comment of 2026-10-16; prove the copy frame by frame against
  `replay-clips.mjs` itself; and take the static clip's reference from that
  decoding (frame 0 a DETECT of 114 inliers).
- **Noted, not acted on:** `packages/nft-tracker/src/tracker.ts`, lines 132
  to 142, still says that "`RansacOptions` carries no RNG for a caller to
  seed", stale since `9dbcc5f` (2026-10-24) added `RansacOptions.rng`.

## The pre-probe check: why G0 here does not reproduce #137's table

#137's body gives posed frames of 366, 257 and 265 on the static, table and
wall clips at seed 20261015. One seeded pass of `NftTracker` per clip, run in
a scratch script before the probe (not committed; its figures are carried
here), under the two decodings, with RANSAC seeded through the global patch
and through an injected `rng`:

| clip | the dry run's decoding: frames / ok / DETECT / frame 0 | `replay-clips.mjs`'s decoding: frames / ok / DETECT / frame 0 |
|---|---|---|
| `pinball-static.mp4` | 366 / **366** / 1 / DETECT, 105 inliers | 363 / 363 / 1 / DETECT, **114** inliers |
| `pinball-bench-table.mp4` | 267 / **257** / 44 / LOST | 267 / 262 / 41 / DETECT, 4 |
| `pinball-bench.mp4` | 298 / **265** / 61 / DETECT, 5 | 298 / 274 / 74 / DETECT, 6 |

- **The dry run's decoding** (`packages/nft-tracker/scripts/jitter-dry-run.mjs`,
  lines 145 to 165, seed 20261015) leaves ffmpeg's frame-rate handling and
  scaler at their defaults (constant frame rate, bicubic) and stamps frame
  `i` at `i / fps`. On the static clip (`r_frame_rate` 30/1, average
  2178/73) that writes 366 frames from a file of 363. It reproduces #137's
  table exactly.
- **`replay-clips.mjs`'s decoding** (lines 440 to 507) passes the file's
  frames through (`-fps_mode passthrough`), scales bilinearly and reads the
  frame times from ffprobe. It is the instrument's, and #123's seed test's.
- **The global patch and the injected `rng` gave identical results** under
  both decodings, every count above. That is what lets check 6 below compare
  this probe, which injects, with `replay-clips.mjs`, which patches.

So G0's difference from #137's table is the decoding, not the gate or the
seeding.

## The method

The script's header carries the method in full. In short:

- **Decoding and schedule.** `replay-clips.mjs`'s `probe`, `greyFrames` and
  `loadClip` (lines 440 to 507) and `loopPeriod` and `loopTimes` (lines 541
  to 551), copied, since the file exports nothing; `fitSize` and
  `PAGE_PROCESSING_BOX` imported. Six loops of each clip, every frame
  processed in order, each stamped with its time on the loops' continuous
  timeline; loops 1 to 4 counted: the "every frame, sync" arm of its
  `--external` (line 956; the run loop, `replayRun`, lines 592 to 644). The
  tracker's defaults; `K = intrinsics(w, h)` at the processing size; the
  committed target (SHA-256 `9e8eb486…`).
- **The wrapper.** A probe-side `CvBackend` that delegates every method to
  `cv-backend-jsfeatnext` unchanged except `estimateHomography`, which adds
  `rng` (one mulberry32 stream per run, created at its start, as
  `replay-clips.mjs` seeds `Math.random` once per run) and applies the run's
  candidate to an accepted fit.
- **A refusal is the backend's own failure, exactly.** The wrapper returns
  `{ H: zeros(9), inliers: zeros(count), numInliers: 0, ok: false }`, the
  shape `cv-backend-jsfeatnext` returns when RANSAC finds no model
  (`jsfeatnext_backend.ts`, lines 565 to 570). `detectTarget` turns any
  `!h.ok` into `reason: "no-consensus"` with `numInliers: h.numInliers`
  (`detection.ts`, lines 423 to 431), and the tracker makes that frame LOST
  with no lock (`tracker.ts`, lines 950 to 963; a lock is set only on an ok
  detection, lines 783 to 785). A LOST frame is any frame without a pose,
  before a first lock or after a lost one alike (#143); in this probe's
  counted loops every LOST frame is of the second kind (see "What LOST,
  `trackLoss` and the reacquisitions count here"). Nothing else in the
  pipeline sees the
  result: `estimateHomography` is called only from `detectTarget`. **So in
  this probe a gate's refusal is counted under `no-consensus`, with 0
  inliers, beside the real RANSAC failures**, and the candidate's real count
  and verdict are in the script's own log, which the tables below read.
  Relabelling a refusal would have needed a change under `packages/*/src/`.
- **The metrics are imported, not reimplemented.** `frameRecord`,
  `targetCorners`, `summarizeRun`, `cornerJitter`, `countedLoopFrames` and
  `mediaKey` from `examples/js/bench-metrics.mjs`, unchanged.
- **"ok" and "with corners" are two counts.** A frame is *ok* when the
  tracker returns a pose (`result.ok`); it has *corners* when that pose's
  outline is drawable (`frameRecord`'s `corners`, which bench-metrics'
  `posedFrames` counts and `jitterPx` reads). They differ: on the wall clip
  G0 has 1,090 to 1,097 ok counted frames a run and 858 to 873 with corners.
- **The seeds:** 1 to 8, as #123's seed test, on every clip and candidate:
  3 clips × 6 candidates × 8 seeds = 144 runs, and each candidate's seed 1
  once more for check 7.

## The candidates, defined from the code before any figure

Each acts on a fit `estimateHomography` accepted (`h.ok`), inside the
wrapper, and refuses it when:

| | refuses when | from the code |
|---|---|---|
| **G0** | never: today's gate | `detection.ts`, line 423: `if (!h.ok)` is the only refusal |
| **G5** | `numInliers < 5` | refuses exactly the minimal fits, those #137's defect is about: #149's `X4` made a gate |
| **G6** | `numInliers < 6` | #149's `X6`, the range #137's comment of 2026-10-16 names |
| **G8** | `numInliers < 8` | #149's `X8`: `DEFAULT_MIN_TRACKED_PATCHES` (`tracker.ts`, line 252), the tracking step's minimum, which never sees a detection |
| **GH** | `n < 5` (reason "n<5"), or the median of the held-out errors above the call's RANSAC threshold, 4 px (reason "score") | below |
| **GP** | `selectPose(H, K, inlier src, inlier dst, 4, targetGrid(level-0 size)).outcome === "no-candidate-in-front"` | below |

- **GH, the held-out score.**
  - The contract returns `H`, the inlier mask and `numInliers`, not the
    minimal sample.
  - `find_homography` refits on the winning hypothesis's inliers when there
    are more than four, then reclassifies the mask against the refit
    (`jsfeatnext_backend.ts`, lines 135 to 137; jsfeatNext's
    `find_homography`). So the returned H was fitted on the returned
    correspondences, or on a set close to them, and nothing the contract
    returns was held out of it.
  - A held-out score therefore needs the probe to refit on subsets itself.
    For each inlier i of S (n = |S|), `H₋ᵢ` is fitted on `S \ {i}` by
    jsfeatNext's own `homography2d.run`, the kernel the backend's RANSAC
    uses, and `eᵢ = ‖H₋ᵢ(srcᵢ) − dstᵢ‖` in frame px. A refit `run` cannot
    produce, or a non-finite projection, is `eᵢ = ∞`.
  - At n = 4 no held-out fit exists, so GH's refusal set contains G5's.
    Every GH refusal is reported under its reason, so the two can be told
    apart.
  - **This is a probe-side computation the contract does not offer**: a
    finding about the contract, not a reason to change it here.
  - The threshold (4 px, `DEFAULT_RANSAC_THRESHOLD`, `detection.ts`, line
    89) is the tolerance RANSAC applies in sample, applied out of sample.
    The threshold and the median are the probe's choices; the post-hoc table
    below shows each bucket's scores, so the choice can be judged without a
    re-run.
- **GP, no admissible pose.** The tracker's own call on a detection
  (`tracker.ts`, line 985: the inlier correspondences, the RANSAC threshold
  as `sigma`, the grid of `target.pyramid.levelSizes[0]`), made in the
  wrapper. It can sit there because the probe owns `K`: the backend never
  sees it, and a GP in the shipped pipeline would sit in the tracker. Refused
  only on `no-candidate-in-front` (both IPPE candidates put the grid behind
  the camera, `select_pose.ts`, line 180), #137's addendum's "no admissible
  pose at all". `degenerate` (IPPE finds no pose) is counted and never
  refused; it occurred on no ok frame of the counted loops.
- **GE, #104's signal, is not a candidate.** Nothing in the record sets its
  thresholds: #160's derivation registered none. Its reading,
  `conditioning(H, K)`, is reported post hoc on G0's accepted detections,
  labelled so.
- **Not measured by any candidate:** whether a refused fit was right. The
  clips have no ground truth. "Behind the camera" (the selected pose's
  `inFront` on the 5 × 5 grid false) is the one sign of a wrong fit the
  probe reads.

## The checks, each exercised both ways

Every check is fatal: it exits 1 naming what disagrees, before any figure is
printed. The passing case is the probe's own two full runs. The checks are
numbered here as this table numbers them; the script's header groups the
same checks under seven numbers.

The failing case is a scratch copy of the final script with one exact-match
perturbation and the seeds cut to 1, run against the same checkout through
`WEBARKIT_ROOT`; the committed file was never edited. Each perturbation
changes an input, or puts the pipeline in the state the check exists to
catch; one case uses a scratch copy of the replay directory instead. **Each
of the 15 cases exited 1 and printed 0 bytes to stdout**, so each check also
stops the figures.

| check | what it compares | the perturbation | its failure message (first) |
|---|---|---|---|
| 1. input hashes | the clips, the target, `replay-clips.mjs`, `bench-metrics.mjs` and every module it loads, jsfeatNext's dist: SHA-256 at `b31635d` | the target's expected hash, last digit 2 → 3 | `examples/targets/pinball.wnft: SHA-256 9e8eb486…5282, expected 9e8eb486…5283` |
| 2. code under test | the three packages' `src/` and the two runtime packages' built `dist/*.js`, each tree hashed | `nft-tracker/src`'s expected digest, last digit 0 → 1 | `packages/nft-tracker/src: tree digest 9adfd0fe…0eb0 over 33 files, expected …0eb1` |
| 3. `deterministicRansac` | the backend declares it `true` (#137's usage rule 1) | the real backend with the flag removed | `the backend declares capabilities.deterministicRansac undefined, not true: an injected rng may be ignored (#137's usage rule 1)` |
| 4. `Math.random` reads | reads of the global during each run, `rng` injected: 0 (#137's usage rule 3; ADR-0001 point 7) | one direct `Math.random()` per `estimateHomography` call | `pinball-static.mp4, G0, seed 1: 1 reads of the global Math.random during the run, with the rng injected`; 476 on the wall clip, 318 on the table clip |
| 5. the replay's provenance | the replay export's packages are the provenance manifest's bundle, built from a clean tree | the static clip's export with `manifestClean: false` | `pinball-static.mp4: the replay export's packageSource is {…"manifestClean":false}, not the manifest's bundle from a clean tree` |
| 6. the decoding's copy | G0 at seed 1 against `replay-clips.mjs --external 70 --seed 1 --packages bundle`'s "every frame, sync" export, frame by frame: media time, timestamp, state, ok, inliers, corners | the copied scale filter `bilinear` → `bicubic` | `pinball-static.mp4: frame 0, numInliers: G0 seed 1 105, replay-clips 114` |
| 7. a seed's byte-identity | each candidate's seed 1 run twice: per-frame rows and gate log | the repeat run on seed + 1 | `pinball-static.mp4, G0, seed 1: two runs differ (88e54d311fec and bec71fedc1da)` |
| 8. #137's comment of 2026-10-16 | G0's `jitterPx` on each seed at the comment's printed precision, its detection locks within the comment's range, its frame 0 | the wall clip's seed-1 value 5.75 → 5.76 | `pinball-bench.mp4, G0, seed 1: jitterPx 5.75, #137's comment of 2026-10-16 prints 5.76` |
| 9. mask count | an accepted fit's mask marks `numInliers` correspondences | a backend whose mask drops one inlier | `pinball-bench.mp4, frame 0: the mask marks 5 inliers, numInliers is 6` |
| 10. threshold | every call carries `DEFAULT_RANSAC_THRESHOLD` | a call at threshold + 1 | `estimateHomography called with threshold 5, not DEFAULT_RANSAC_THRESHOLD 4` |
| 11. counted loops | `countedLoopFrames` keeps exactly loops 1 to 4 by frame index | the by-index bound off by one loop | `pinball-static.mp4, G0, seed 1: countedLoopFrames keeps 1452 frames, loops 1 to 4 by index hold 1815` |
| 12. `trackTimeShare` complete | the run reaches the end of the counted loops | five loops a run instead of six | `pinball-static.mp4, G0, seed 1: trackTimeShare incomplete` |
| 13. `fallbackFrames` | the tracker's getter equals the per-frame count of fallback selections | a per-frame count that misses them | `pinball-bench-table.mp4, G0, seed 1: 0 fallback selections counted per frame, the tracker's fallbackFrames is 134` |
| 14. DETECT = accepted | the counted DETECT frames are exactly the gate's accepted calls, each with its count | an accounting that counts a refused call as accepted | `pinball-bench-table.mp4, G5, seed 1: 85 DETECT frames in the counted loops, 204 accepted gate calls` |
| 15. `minTrackedPatches` | `DEFAULT_MIN_TRACKED_PATCHES` is the 8 G8 is defined on | the tracker's constant as 9 | `DEFAULT_MIN_TRACKED_PATCHES is 9, not the 8 G8 is defined on` |

- **Check 6** compares a run that injects the RNG with one that patches the
  global (`replay-clips.mjs`, lines 428 to 438). That they agree frame by
  frame follows from the pre-probe check above, where injection and the
  patch gave identical runs. Its perturbed case also reproduces, through the
  bicubic scaler, the dry run's 105 inliers on the static clip's frame 0.
- **Check 14 cannot fire on the static clip**, whose counted loops hold no
  detection (0 = 0). It is exercised on the table clip.

**Determinism.** Two full runs of the final script, in parallel: stdout
49,577 bytes, byte-identical, SHA-256
**`19eebb1c52c9ea77f2b8a5048f0c33212b28bdc07b240228e7808bce2895897a`**;
`runs.tsv` byte-identical, SHA-256 `46db54e2…`; the 144 per-frame row files'
hashes, hashed in order, `0cb5c750…`. Timings went to stderr: about 27
minutes a run. The script's own SHA-256 at those runs is `9a40bd69…`.
`runs.tsv` and the rows also equal those of the first two full runs, made
before the review below added printed sections. No figure moved between
them.

**The stdout hash depends on one line's build.** It was taken with the
replay's provenance manifest built at `b31635d`. Stdout's line
`replay-clips' exports: the provenance manifest's bundle, built clean at
<commit>` prints that manifest's head, and it is the only line that depends
on it. A run built at another commit reproduces `runs.tsv` and the rows'
hashes, but not the stdout hash. An independent reproduction (Linux, ffmpeg
6.1, Node 22.23 and 24.21) found `runs.tsv` and the rows' hashes identical,
and stdout equal to `19eebb1c…` once that line read `b31635d…`. Built at
this PR's own commit, the line reads `2ba5aec…`.

**Check 8 passed on every seed**, so **G0 at `b31635d` reproduces the
comment's eight `jitterPx` values per clip, measured at `37dc6d4`**: 0.124939
on every seed on the static clip; 5.75 to 27.46 px on the wall clip, ratio
4.77; 18.5 to 1,910.3 px on the table clip, ratio 103.00. Detection locks per
run are within the comment's ranges (282 to 291; 181 to 205) and frame 0 is
as it says.

## The static clip, the must-not-regress case

**None of the five candidates changes the static clip's record.** On every
seed, each candidate's 2,178 frames (six loops) equal G0's of the same seed
in state, ok, inliers and corners: **0 frames differ, for G5, G6, G8, GH and
GP, on seeds 1 to 8**. On every run: frame 0 a DETECT, every counted frame
TRACK (1,452 of 1,452), 0 detection locks, `trackTimeShare` 1.0000,
`jitterPx` 0.124939.

The static clip's only detection is frame 0, in loop 0, outside the counted
loops. On G0, each seed: 114 inliers; held-out median, max and mean errors
0.5197, 1.7656 and 0.5909 px, so GH accepts it; GP's outcome `selected`;
`dScale` −0.001123 to −0.002319 and `dOrth` −0.000357 to 0.002012 over the
eight seeds (per seed in stdout).

## The hand-held clips

The counts below are over the counted loops (1 to 4), per run; the first
lock is read from the run's start. A range gives the seeds at each end.

### `jitterPx`, whole-set, the eight seeds: does a candidate remove the draw-dependence?

The basis of #137's comment of 2026-10-16: each run's `jitterPx` over its
counted loops, and the ratio of the largest to the smallest over the eight
seeds. These are figures across eight runs whose frame sets differ. They
answer the comment's question on its basis, and they are not a comparison
between arms; that follows in the next section.

**`pinball-bench.mp4`** (the wall clip, 480 × 270, 298 frames):

| | s1 | s2 | s3 | s4 | s5 | s6 | s7 | s8 | ratio |
|---|---|---|---|---|---|---|---|---|---|
| G0 | 5.7515 | 15.3897 | 27.4557 | 9.4582 | 17.1709 | 13.5032 | 17.1205 | 12.4273 | 4.77 |
| G5 | 5.7515 | 5.9083 | 6.1119 | 5.6973 | 6.3927 | 6.5546 | 6.3701 | 6.4103 | 1.15 |
| G6 | 5.5206 | 5.6306 | 5.9475 | 5.5170 | 5.8667 | 6.4613 | 6.1555 | 6.2059 | 1.17 |
| G8 | 5.5206 | 5.3624 | 5.3304 | 5.3963 | 5.7487 | 6.1671 | 5.7389 | 5.8058 | 1.16 |
| GH | 5.5539 | 5.6290 | 6.0287 | 5.4455 | 5.9306 | 6.5546 | 6.3537 | 6.0173 | 1.20 |
| GP | 5.7515 | 15.3897 | 27.4557 | 9.4582 | 17.1709 | 13.5032 | 17.1205 | 12.4273 | 4.77 |

**`pinball-bench-table.mp4`** (the table clip, 203 × 360, 267 frames):

| | s1 | s2 | s3 | s4 | s5 | s6 | s7 | s8 | ratio |
|---|---|---|---|---|---|---|---|---|---|
| G0 | 1264.2282 | 1910.2857 | 1642.5416 | 129.3700 | 43.7015 | 39.7688 | 18.5469 | 19.5543 | 103.00 |
| G5 | 8.6288 | 11.1866 | 16.0168 | 8.8961 | 19.0870 | 18.1644 | 14.7557 | 14.7350 | 2.21 |
| G6 | 5.2236 | 4.0315 | 3.5354 | 4.6289 | 6.2889 | 5.1442 | 6.1671 | 5.3606 | 1.78 |
| G8 | 2.3931 | 2.4144 | 2.5270 | 2.3930 | 2.4295 | 2.5731 | 2.3809 | 2.3839 | 1.08 |
| GH | 5.2236 | 3.1894 | 9.4239 | 4.6289 | 4.4444 | 3.3467 | 4.3661 | 6.6113 | 2.95 |
| GP | 56.5003 | 16.5895 | 16.7226 | 37.2206 | 43.2575 | 39.7688 | 18.5469 | 19.5543 | 3.41 |

Windows kept, whole-set: on the wall clip 36 or 37 under every candidate.
On the table clip, 32 to 34 under G0 and GP, 31 to 33 under G5, 32 on every
seed under G6, 31 or 32 under GH, and **28 on every seed under G8** (per
seed in stdout).

- **On the wall clip, G5, G6, G8 and GH each take the seed ratio from 4.77
  to between 1.15 and 1.20, and GP changes no seed's figure at all.** None
  of GP's refusals there is at a frame G0 posed with corners: 0 on every
  seed. So none of them could reach `jitterPx`.
- **On the table clip, G8's ratio is 1.08, with every seed between 2.38 and
  2.57 px.** G6 leaves 1.78 (3.54 to 6.29 px), G5 2.21 (8.63 to 19.09 px),
  GH 2.95 (3.19 to 9.42 px), and GP 3.41 (16.59 to 56.50 px).

### A candidate against G0 of the same seed, on two bases

Stage 2's second rule: when the treatment can change which frames are
posed, the arms are compared on the frames both posed. The probe reads that
on two bases, side by side; **which one the record adopts is the
maintainer's**.

- **The media-key basis** is the M3 method
  ([`2026-10-16-m3-handheld-frame-set.mjs`](./2026-10-16-m3-handheld-frame-set.mjs),
  lines 95 to 108), the one `compareExports` applies to two runs: the media
  keys each run posed with corners in its counted loops, pooled over the
  four loops, then intersected. A G0 frame at (loop 2, m) is admitted when
  the candidate posed m in any counted loop.
- **The same-frame basis** is exact here, and only here: both arms process
  the same frame indices, so the frames both posed are identifiable. It
  takes the counted frames, by index, at which both runs have corners. On
  device runs no such pairing exists, which is why the M3 method pools.

**The two bases disagree, and the independent review found it** (below).
On the media-key basis, frames G0 posed at a media time that the candidate
posed in another loop enter G0's figure. On this corpus those include the
few-inlier detections a candidate refuses. The same-frame basis excludes
them.

**Same-frame basis**, candidate / G0, px (windows in parentheses);
**bold** where the two differ at the fourth decimal:

*Wall clip*: **all five candidates equal G0 on every seed**, to the
fourth decimal and in windows: G5, G6, G8 and GH at their whole-set values
above, on 842 to 862 frames; GP at G0's whole-set values, on 858 to 873.

*Table clip* (825 to 900 frames):

| | s1 | s2 | s3 | s4 | s5 | s6 | s7 | s8 |
|---|---|---|---|---|---|---|---|---|
| G5 | 8.6288 / 8.6288 (31) | 11.1866 / 11.1866 (32) | **15.8314 / 15.8097** (33) | 8.8961 / 8.8961 (32) | 19.0870 / 19.0870 (32) | 18.1644 / 18.1644 (32) | 14.7557 / 14.7557 (33) | 14.7350 / 14.7350 (32) |
| G6 | **4.7284 / 2.4823** (30) | **2.9964 / 3.9284** (32) | **3.4640 / 3.4704** (32) | 4.6289 / 4.6289 (32) | **6.2889 / 6.2607** (32) | 5.1442 / 5.1442 (32) | **5.8571 / 5.1608** (32) | **5.3606 / 5.5172** (32) |
| G8 | **2.3931 / 2.3830** (28) | **2.4149 / 2.4141** (28) | **2.5270 / 2.3782** (28) | **2.3930 / 2.3767** (28) | **2.4295 / 2.3726** (28) | **2.5731 / 2.3784** (28) | **2.3809 / 2.3713** (28) | **2.3839 / 2.3756** (28) |
| GH | **4.7284 / 2.4823** (30) | **3.1991 / 2.9202** (32) | **4.1265 / 3.4946** (32) | 4.6289 / 4.6289 (32) | 4.4444 / 4.4444 (32) | **3.3467 / 3.3445** (31) | **4.3661 / 4.2242** (32) | **6.6113 / 4.9947** (32) |
| GP | equal to G0 on every seed, at the whole-set values above |

Read as measured, on the same-frame basis:

- **On the wall clip no candidate changes a pose G0 also produced.** Every
  candidate tracks exactly G0's TRACK frames, with the same corners, on
  every seed (804, 806, 812, 807, 812, 809, 812 and 809 of them on seeds 1
  to 8). So a candidate's whole-set figure there is G0's on the frames the
  candidate keeps, and its effect on `jitterPx` is entirely which frames it
  poses.
- **On the table clip:**
  - G8 is higher than G0 on all eight seeds, by 0.0008 (s2) to 0.1947 px (s6).
  - GH is higher on six seeds, by up to 2.2461 px (s1), and equal on two.
  - G6 is higher on three (s1 +2.2461, s5 +0.0282, s7 +0.6963 px), lower
    on three (s2 −0.9320, s3 −0.0064, s8 −0.1566 px), and equal on two.
  - G5 is equal except s3 (+0.0217 px).
  - GP is equal on all eight.
- On the table clip, **G0 on G8's frames reads 2.3713 to 2.4141 px over the
  eight seeds, a ratio of 1.02.** The 1,910-px whole-set values are carried by
  frames G8 does not pose.
- Unlike the wall clip, the candidates' TRACK frames on the table clip are
  not all G0's. Of G0's counted TRACK frames, the share each candidate also
  tracks with the same corners:
  - **G8:** none on seven seeds, and 206 of 843 on s4.
  - **GH:** all on s4 and s5, none on s1.
  - **G6:** all on s4 and s6, none on s1 and s2.
  - **G5:** all except s3 (655 of 867).
  - **GP:** all on every seed.

  *That a refused lock the tracking step would have confirmed changes the
  frames tracked after it is a conjecture, consistent with these counts and
  not measured.*

**Media-key basis**, the M3 method, candidate / G0, px, for comparison (the
figures where the two bases differ in direction are discussed above):

| | wall: seeds where the two differ | table: seeds where the two differ |
|---|---|---|
| G5 | s3 6.1119 / 21.6770 | s1 8.6288 / 21.1731; s3 16.0168 / 15.8913; s6 18.1644 / 18.7355; s8 14.7350 / 15.1754 |
| G6 | none | every seed: lower on six, higher on two (s1 5.2236 / 4.0973; s3 3.5354 / 3.4704) |
| G8 | s2 5.3624 / 5.6146; s4 5.3963 / 5.5170; s5 5.7487 / 5.8667; s8 5.8058 / 5.9162 | every seed, higher by 0.0050 to 0.2018 |
| GH | s4 5.4455 / 5.5172 | every seed: lower on five, higher on three (s1, s3, s8) |
| GP | none | s3 16.7226 / 1642.5416 |

On the wall clip, every difference on this basis comes from pooling: the
same-frame basis shows no difference there on any seed. Per seed, both
bases are in stdout with their windows.

Stage 2's third rule asks which windows a selection emptied. The windows
are **counted here, not named**: whole-set and per basis, per seed, in
stdout (G8 keeps 28 on every table seed against G0's 32 to 34). The
per-frame rows name them.

No figure here is compared with a tolerance. None exists for a seeded
desktop replay, and the protocol forbids deriving one from two observations.

### What LOST, `trackLoss` and the reacquisitions count here (#143)

The tracker's LOST state, and `trackLoss`, mark every frame without a pose,
whatever the cause: a frame before a first lock and a frame after a lost
lock alike. That conflation is #143's, in the tracker, not this probe's.
On this corpus it does not enter the counted loops. **Every candidate's
first lock, on every clip and seed, falls in loop 0, the warm-up**, so in
loops 1 to 4 no frame is "never acquired". Every counted LOST frame comes
after a lock was lost, and every counted detection lock is a re-lock.

The latest first-lock frame per candidate over seeds 1 to 8, against each
clip's frames per loop (per seed in stdout):

| | static (363 a loop) | wall (298) | table (267) |
|---|---|---|---|
| G0 | 0 (every seed) | 0 (every seed) | 1 (s3 to s6) |
| G5 | 0 (every seed) | 2 (s4, s5) | 2 (s6) |
| G6 | 0 (every seed) | 85 (s2 to s5, s8) | 38 (s3) |
| G8 | 0 (every seed) | 87 (s4, s6) | 62 (s4) |
| GH | 0 (every seed) | 85 (s2, s4, s5) | 27 (s2, s8) |
| GP | 0 (every seed) | 2 (s7) | 4 (s6) |

A post-run read of the 144 per-frame row files agrees: no run never locks.
Of the 19,348 counted LOST frames, over all runs, 0 come before their run's
first ok frame.

### Counts per run, the range over seeds 1 to 8

LOST, `trackLoss` and the reacquisitions in these tables count lost-lock
frames and re-locks only, as the section above shows (#143).

**Wall clip** (1,192 counted frames a run):

| | ok | with corners | DETECT | accepted 4 / 5 / 6–7 / 8–11 / 12+ | refused by the gate | behind the camera (DETECT) | no candidate in front / ambiguous (ok frames) | fallback selections | detection locks (confirmed) | reacquisitions | `trackTimeShare` | first lock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G0 | 1090 (s2) to 1097 (s5) | 858 (s1) to 873 (s5) | 282 (s3, s8) to 291 (s1) | 189–200 / 42–52 / 6–10 / 7–15 / 26–28 | 0 | 61 (s3, s4) to 81 (s1) | 37–50 / 51–65 | 91 (s4) to 114 (s1) | 282–291 (16) | 278–287 | 0.6739 (s1) to 0.6806 (s3, s5, s7) | frame 0 |
| G5 | 895 (s2, s4) to 906 (s5) | 853 (s1, s6) to 862 (s5) | 84 (s7) to 95 (s1) | 0 / 42–52 / 6–10 / 7–15 / 26–28 | 189 (s8) to 200 (s7) | 8 (s4) to 14 (s5, s6) | 2–7 / 19–25 | 24 (s4) to 31 (s1) | 84–95 (16) | 80–91 | as G0, every seed | frame 0 to 2 (0 to 0.080 s) |
| G6 | 852 (s2) to 855 (s3) | 844 (s4) to 849 (s3, s7) | 41 (s7) to 50 (s1) | 0 / 0 / 6–10 / 7–15 / 26–28 | 237 (s8) to 243 (s5, s7) | 0 (s8) to 5 (s6) | 0–3 / 9–17 | 9 (s8) to 18 (s1) | 41–50 (16) | 39–46 | as G0, every seed | frame 0 (s1, s6, s7) or 85 (s2–s5, s8): 0 or 3.411 s |
| G8 | 843 (s4) to 848 (s3) | 842 (s4) to 847 (s3, s5) | 35 (s5, s7) to 43 (s1) | 0 / 0 / 0 / 7–15 / 26–28 | 245 (s2, s8) to 250 (s5) | 0 to 1 (s1, s3) | 0 / 7–15 | 7 (s5, s7) to 15 (s1) | 35–43 (16) | 34–42 | as G0, every seed | frame 85 to 87: 3.411 to 3.492 s |
| GH | 852 (s4) to 858 (s7, s8) | 846 (s1, s4) to 852 (s5) | 44 (s3, s5) to 51 (s1) | 0 / 4–8 / 3–6 / 7–15 / 26–28 | 233 (s8) to 241 (s5): "n<5" 189–200, "score" 38–50 | 2 to 5 (s2) | 0–1 / 14–19 | 14 (s3) to 20 (s1, s2) | 44–51 (16) | 42–50 | as G0, every seed | frame 0 (s8), 15 (s1, s3, s6, s7) or 85 (s2, s4, s5): 0 to 3.411 s |
| GP | 1046 (s1, s7) to 1058 (s5) | 858 (s1) to 873 (s5) | 234 (s7) to 247 (s6) | 151–160 / 37–47 / 5–10 / 7–15 / 26–28 | 37 (s6) to 50 (s7) | 24 (s3) to 37 (s1) | 0 / 51–65 | 51 (s3) to 65 (s1) | 234–247 (16) | 230–245 | as G0, every seed | frame 0 to 2 (0 to 0.080 s) |

**On the wall clip, every candidate's TRACK frames, `trackTimeShare`, 16
confirmed locks and RANSAC failures (27 to 34 a run) equal G0's on each
seed.** The refusals remove the refused frames' own poses and nothing else.
Of those refusals, the ones at frames G0 posed with corners number 5 to 12
a run under G5, 13 to 25 under G6, 13 to 26 under G8, 12 to 21 under GH,
and 0 under GP.

**Table clip** (1,068 counted frames a run):

| | ok | with corners | DETECT | accepted 4 / 5 / 6–7 / 8–11 / 12+ | refused by the gate | behind the camera (DETECT) | no candidate in front / ambiguous (ok frames) | fallback selections | detection locks (confirmed) | reacquisitions | `trackTimeShare` | first lock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G0 | 1044 (s2) to 1050 (s3) | 872 (s4) to 900 (s7) | 181 (s7) to 205 (s4) | 108–121 / 53–66 / 14–28 / 0–4 / 0–1 | 0 | 39 (s7) to 66 (s1) | 37–68 / 18–30 | 60 (s7) to 93 (s1) | 181–205 (5–7) | 178–201 | 0.7871 (s2) to 0.8115 (s3) | frame 0 to 1 (0 to 0.033 s) |
| G5 | 926 (s6) to 941 (s3) | 865 (s4) to 894 (s7) | 73 (s3, s7) to 95 (s2) | 0 / 53–66 / 13–28 / 0–4 / 0–1 | 108 (s2, s7) to 121 (s4) | 10 (s3) to 25 (s1) | 8–27 / 15–22 | 23 (s3) to 45 (s1) | 73–95 (4–7) | 72–94 | 0.7871 (s2) to 0.8124 (s3) | frame 1 to 2 (0.033 to 0.067 s) |
| G6 | 868 (s7) to 881 (s3) | 856 (s1) to 876 (s3) | 13 (s3) to 30 (s4) | 0 / 0 / 13–28 / 0–2 / 0 | 168 (s2) to 178 (s7) | 1 (s3) to 7 (s8) | 1–7 / 9–13 | 10 (s3) to 19 (s4) | 13–30 (4–6) | 12–29 | 0.7862 (s7) to 0.8124 (s3) | frame 2 to 38 (0.067 to 1.267 s) |
| G8 | 825 (s1) to 832 (s7) | 825 (s1) to 832 (s7) | 7 (s4, s7) to 11 (s6) | 0 / 0 / 0 / 7–11 / 0–1 | 211 (s8) to 223 (s1, s2) | 0 | 0 / 10–16 | 10 (s4) to 16 (s6) | 7–11 (4–5) | 6–10 | 0.7624 (s6) to 0.7719 (s7) | frame 59 to 62 (1.967 to 2.067 s) |
| GH | 866 (s3, s6) to 873 (s5) | 854 (s6) to 862 (s5) | 16 (s2) to 29 (s4, s8) | 0 / 5–7 / 11–23 / 0–2 / 0 | 172 (s5) to 183 (s3): "n<5" 111–121, "score" 55–63 | 2 (s5, s7) to 6 (s4) | 2–7 / 8–13 | 11 (s2) to 18 (s4, s8) | 16–29 (4–5) | 15–28 | 0.7882 (s6) to 0.7975 (s5) | frame 2 to 27 (0.067 to 0.900 s) |
| GP | 980 (s1) to 1010 (s7) | 871 (s4) to 900 (s7) | 132 (s6) to 144 (s7) | 63–82 / 36–53 / 13–22 / 0–4 / 0–1 | 37 (s7) to 68 (s1) | 2 (s8) to 7 (s2) | 0 / 18–30 | 18 (s6) to 30 (s2) | 132–144 (5–7) | 129–141 | as G0, every seed | frame 0 to 4 (0 to 0.133 s) |

`trackTimeShare` on the table clip, per seed, candidate minus G0 of the same
seed, in points:
- **G8:** −1.97 to −4.80. Per seed G0 then G8: 0.7896/0.7643,
  0.7871/0.7674, 0.8115/0.7635, 0.7890/0.7691, 0.7975/0.7691,
  0.7966/0.7624, 0.8104/0.7719, 0.7963/0.7702.
- **G6:** −2.42 (s7) to +1.51 (s2).
- **GH:** −1.66 (s3) to +0.95 (s2).
- **G5:** 0 on seven seeds, +0.09 on s3.
- **GP:** 0 on every seed.

## Post hoc, on G0's accepted detections: GH's score and GE's reading

G0's runs, counted loops, seeds 1 to 8 together; descriptive, not a gate. The
held-out median is GH's statistic; "score refuses" counts fits with n ≥ 5
whose median exceeds 4 px.

| clip | inliers | fits | score refuses | held-out median, median of fits (px) | no candidate in front | median \|`dScale`\| | median \|`dOrth`\| |
|---|---|---|---|---|---|---|---|
| wall | 4 | 1550 | (no score at n = 4) | — | 298 | 0.9015 | 0.9938 |
| wall | 5 | 368 | 328 | 14.40 | 34 | 0.8308 | 0.9992 |
| wall | 6–7 | 60 | 24 | 3.57 | 7 | 0.4823 | 0.9886 |
| wall | 8–11 | 76 | 0 | 0.84 | 0 | 0.0990 | 0.2076 |
| wall | 12+ | 222 | 0 | 0.76 | 0 | 0.0111 | 0.0044 |
| table | 4 | 918 | (no score at n = 4) | — | 314 | 0.6234 | 0.9652 |
| table | 5 | 460 | 409 | 15.85 | 110 | 0.4455 | 0.8930 |
| table | 6–7 | 173 | 48 | 3.03 | 30 | 0.1757 | 0.6302 |
| table | 8–11 | 10 | 0 | 0.77 | 0 | 0.0749 | 0.0402 |
| table | 12+ | 1 | 0 | 0.86 | 0 | 0.0396 | 0.0424 |

- **The score refuses no fit of 8 inliers or more on either clip, and most
  5-inlier fits (328 of 368; 409 of 460).** It splits the 6–7 bucket (24 of
  60; 48 of 173). Its median of medians falls from 14 to 16 px at 5 inliers
  to under 1 px at 8 or more. So GH differs from G6 in the fits it accepts:
  40 of 368 and 51 of 460 at 5 inliers (which G6 refuses), and it refuses
  24 of 60 and 48 of 173 at 6–7 (which G6 accepts).
- **GE's medians, 4 inliers against 12 or more:**
  - |`dScale`|: wall 0.9015 against 0.0111 (n = 1,550 and 222), a factor of
    81; table 0.6234 against 0.0749 at 8–11 (n = 918 and 10), a factor of
    8.3, the table clip's 12+ bucket holding one fit.
  - |`dOrth`|: wall 0.9938 against 0.0044, a factor of 226; table 0.9652
    against 0.0402 at 8–11, a factor of 24.
  - Only medians are reported. How far the distributions overlap is not
    measured here, and no threshold follows from a median.
    [`2026-10-16-104-stage1-probe.md`](./2026-10-16-104-stage1-probe.md),
    item 3, found that neither quantity separates the 4-inlier detections
    from the rest on its data. This table neither confirms nor contradicts
    that.
- **The refit self-check, reported and not fatal.** On each accepted fit, H
  against `homography2d.run` over the returned mask, worst corner. It agrees
  to under 0.01 px on 1,854 of 2,276 G0 fits on the wall clip and 1,457 of
  1,562 on the table clip, and disagrees by up to 5,093 and 22,144 px on the
  rest, consistent with the reclassification described under GH. GH's
  subsets are drawn from the returned mask, which is what the contract
  offers.

**Non-finite held-out scores: a defect in the script's serialization, and
what it reaches.**
- **The defect.** The script's `heldOut` can return an infinite median, max
  or mean, when a refit cannot be produced or projects to a non-finite
  point. `JSON.stringify` writes `Infinity` as `null`. This table's test
  `!(x.loo[0] <= 4)` then reads a `null` median as passing, where an
  infinite one fails.
- **It does not reach GH's in-pipeline decisions.** The wrapper decides on
  the number before anything is serialized.
- **It reaches none of this section's figures on this corpus.** A post-run
  read of the result files finds no scored fit with a null median, max or
  mean: 0 of 726 on the wall clip, 0 of 644 on the table clip, and none on
  the static clip, which has no scored fit in the counted loops. An
  independent verification found the same counts.
- **The per-frame rows, outside this table, hold one such fit.** It is on
  the table clip, seed 6, frame 1,337, in loop 5, outside the counted
  loops: 5 inliers, a held-out median of 3.0 px, and an infinite max and
  mean. It appears in G0's, G5's, G6's and GP's rows, whose runs coincide
  up to that frame. GH's own run makes no call on it.
- **A later script that reuses this code must encode non-finite scores
  before serializing them.**

## Stage 2: the declared covariates

Each property below could plausibly invert the sign of a candidate's effect.
Each is computed per frame from **G0's runs only** (Stage 2's first rule),
and reported per clip in the script's section "Stage 2's covariates" (seeds
1 to 8 together, counted loops; p10 / median / p90).

| covariate | computed per frame as | static | wall | table | how it could invert the sign |
|---|---|---|---|---|---|
| **the clip's motion** | the four corners' mean displacement since the previous TRACK frame, same loop (px); and G0's detection locks per run | 0.012 / 0.038 / 0.111 px; 0 locks | 0.054 / 1.007 / 2.883 px; 282 to 291 | 0.323 / 0.637 / 1.408 px; 181 to 205 | Without re-detection (static) no candidate can act: the effect is zero by construction, not small. Under fast motion, a refused re-detection lengthens a LOST stretch after a lost lock (#143's second kind) that a right few-inlier fit would have ended. |
| **the target's scale in the frame** | the corners' quadrilateral over the frame's area, on TRACK frames | 0.4588 / 0.4631 / 0.4656 | 0.0836 / 0.2038 / 0.3164 | 0.1352 / 0.2272 / 0.5170 | A smaller target yields fewer correspondences on right views too, so a count or score gate refuses right fits, and the cost in `trackTimeShare` can outweigh what it removes. |
| **the oracle's tilt** | `cv-backend-jsfeatnext`'s `poseFromHomography(H, K)`, the angle whose cosine is R[2][2], on TRACK frames (as #137's body reads it) | 2.85 / 2.88 / 2.94° | 9.10 / 11.60 / 27.38° | 2.84 / 9.27 / 9.71° | A genuine oblique view has fewer inliers and larger held-out errors, so Gk and GH refuse right fits there first. About a tenth of the wall clip's TRACK frames lie above 27.38°, its p90; the table clip's p90 is 9.71°. |
| **the inliers of the neighbouring TRACK frames** | for each accepted detection, the last TRACK frame before it in the run: its inliers | — (no detection in the counted loops) | 39 at p10, median and p90 in every bucket below 12; 8 / 9 / 26 at 12+ | 39 at every quantile in the 4 and 5 buckets; 10 / 39 / 39 at 6–7; 8 / 11 / 39 at 8–11 | A detection right after a well-tracked stretch is more likely right than one after a weak one. **On this corpus it barely varies:** most detections follow the same last TRACK frame, the end of the clip's tracked stretch. So it cannot define a regime here; declared for a corpus where it can. |
| **the time since the last TRACK frame** | the same frame: the time from it to the detection (s) | — | 4 inliers: 0.441 / 1.686 / 3.171; 5: 0.120 / 0.722 / 3.171; 6–7: 0.040 / 3.452 / 3.536; 8–11: 3.492 / 3.532 / 3.632; 12+: 0.040 / 0.080 / 0.120 | 4: 0.200 / 0.867 / 1.500; 5: 0.100 / 0.633 / 1.433; 6–7: 0.100 / 1.533 / 1.800; 8–11: 0.100 / 0.133 / 2.003 | A few-inlier detection moments after a loss, with the target still in view, can be right, and refusing it costs a re-lock. One that comes seconds after it is the 4-inlier population #137 describes. Of G0's accepted 4-inlier detections, 200 of 1,550 (wall) and 227 of 918 (table) come within 0.5 s of a TRACK frame. |
| **the frame schedule** | which frames the tracker sees: every frame (this probe) or the device's scaled step | every frame | every frame | every frame | On the device schedule a refused detection costs more frames of LOST (after a lost lock or before a first one: #143 does not tell them apart), and #137's comment measured G0's seed ratio there at 3.4 (wall) and 1.9 (table), not 4.8 and 103. **Not measured here**: declared because Stage 3's drafts below name it as a separate regime. |

The poses behind the camera by bucket are in the same section. Of G0's
accepted detections, behind the camera:
- 4-inlier: 457 of 1,550 (wall) and 310 of 918 (table);
- 5-inlier: 78 of 368 and 107 of 460;
- 12+: 0 on both clips.

## The independent review, and what it changed

A reviewer subagent, briefed with the protocol and the requirements but not
this session's reasoning, read the script, this record and the first full
run's outputs before any commit. It consulted the advisor once. What it
found is recorded here as Stage 1's refutation attempt on the figures the
ruling will read (the protocol: "A figure that gates a decision gets one
independent attempt at refutation before it is recorded").

- **The comparison basis (its critical finding).** The first draft compared
  each candidate with G0 on the media-key basis alone, and drew directions
  from it. These are G5's wall s3, G8 "lower on four wall seeds", GH "lower
  on five table seeds" and GP "equal except s3". The reviewer recomputed
  the same-frame basis from the per-frame rows and found that it reverses or
  removes several of them. The script now prints both, and the section above
  reads each on its named basis. Its values equal the reviewer's to the
  fourth decimal.
- **Figures:**
  - G8's `trackTimeShare` cost on the table clip was written "2.3 to 4.7
    points" in one place; it is 1.97 to 4.80, now stated once.
  - "posed" was used for `result.ok`; it is now "ok", beside "with corners".
  - A blanket "the candidates' TRACK frames here are not G0's" is now per
    candidate, with its mechanism labelled a conjecture.
- **Provenance:** `bench-metrics.mjs`'s other modules, jsfeatNext's dist and
  the code under test were not hashed, and the replay export's packages
  were not checked. They are now checks 1, 2 and 5.
- **Checks:** five consistency checks had not been exercised the failing
  way. They are now 10 to 15, with the mask check (9), all in the table
  above.
- **Wording:**
  - The section that called some candidates standing and GP not, on
    whole-set ratios, is replaced by the side-by-side facts and drafts for
    all five.
  - The GH sentence about `find_homography` contradicted the refit
    self-check; it now states the reclassification.
  - Several Stage 3 intervals admitted a gate that does nothing, and one
    GH prediction was tautological. The drafts are rewritten, and the GH
    point is moved to what this probe does not establish.
  - The GE medians are given with their factors and counts.
  - Minor citation and wording corrections were applied as found.

## Stage 3: drafts, pending the maintainer's ruling

**Drafts, not registrations.** Nothing below is registered. Stage 3's
registration is its own commit, after the maintainer rules on the gate's
form, from a brief generated under Stage 4. The probe eliminates no
candidate by itself, so there is a draft for each of the five. Each draft
separates what this probe has already measured, which Stage 3 says is no
longer a prediction and is cited as its basis, from what it has not.

The regimes are the covariates' regimes this corpus covers: the static
clip, the two hand-held clips under the every-frame schedule, and the
device's scaled-step schedule, which it does not cover. **Every margin is
the draft's proposal, from the every-frame figures widened for a schedule
this probe did not run; the margins are the maintainer's to set.**

The unmeasured regime is the scaled-step schedule. Its predictions read a
future desktop replay of `replay-clips.mjs`'s "device scaled step, sync" arm
at seeds 1 to 8, with G0 run beside the candidate in the same session as
the control. Each has three parts:
- **(a) the draw-dependence:** the candidate's seed ratio of whole-set
  `jitterPx` against the control's, in the same session. A ratio cannot fall
  below 1, so (a) is refutable upward only. Its bound excludes a gate that
  does nothing: G0's ratio there was 3.4 (wall) and 1.9 (table) in #137's
  comment.
- **(b) the frames both arms pose:** per seed, candidate minus control on
  the same-frame basis, an interval refutable on both sides.
- **(c) the cost:** `trackTimeShare`, candidate minus control per seed, an
  interval refutable on both sides.

### Common to all five: what an implementation must reproduce (basis: this probe)

- **C1, the static clip.** Under the implemented gate, the static clip's
  record at seeds 1 to 8, every-frame schedule, equals today's frame by
  frame in state, ok, inliers and corners. *Basis:* this probe, 0 differing
  frames on 8 of 8 seeds for each candidate. *Refuted by* any frame that
  differs, on any seed.
- **C2, fidelity to the probe.** Under the implemented gate, this script's
  per-frame rows for the chosen candidate are reproduced on the three clips
  at seeds 1 to 8, every-frame schedule: state, ok, inliers, corners and
  media time, frame by frame. Its rows' hashes are in `runs.tsv`, whose
  SHA-256 is in stdout. A refusal's `reason` may differ: here a refusal is
  `no-consensus` with 0 inliers, and an implementation may name it. *Basis:*
  this probe; this is a check of the implementation, not a prediction about
  the gate. *Refuted by* any frame that differs.

### G8 (refuse below 8 inliers)

- **Every-frame, measured, carried by C2:** seed ratio 1.16 (wall), 1.08
  (table). Same-frame basis: equal to G0 on every wall seed; above G0 by
  0.0008 to 0.1947 px on every table seed. At most 1 pose behind the camera
  a run. `trackTimeShare` −1.97 to −4.80 points on the table clip, equal on
  the wall clip. First lock 3.41 to 3.49 s (wall), 1.97 to 2.07 s (table).
- **P-G8, scaled-step:**
  - (a) at most 1.5 on each clip.
  - (b) wall: within ±0.05 px of the control on every seed; table: between
    0 and +0.5 px on every seed.
  - (c) wall: within ±0.5 points; table: between −8 and −1 points.
  - *Refuted* by (a) above its bound, or by (b) or (c) outside its interval
    on either side.

### G6 (refuse below 6 inliers)

- **Every-frame, measured:** seed ratio 1.17 (wall), 1.78 (table).
  Same-frame basis: equal on every wall seed; on the table clip, higher on
  three seeds, lower on three and equal on two, from −0.9320 to +2.2461 px.
  `trackTimeShare` −2.42 to +1.51 points on the table clip, equal on the
  wall clip. First lock up to 3.41 s (wall), 1.27 s (table).
- **P-G6, scaled-step:**
  - (a) at most 1.5 (wall) and at most 0.8 times the control's (table).
  - (b) wall: within ±0.05 px; table: within ±3 px on every seed.
  - (c) wall: within ±0.5 points; table: within ±4 points.
  - *Refuted* as for G8.

### GH (held-out score: median of leave-one-out errors at most 4 px, n ≥ 5)

- **Every-frame, measured:** seed ratio 1.20 (wall), 2.95 (table).
  Refusals "n<5" 189 to 200 (wall) and 111 to 121 (table), and "score" 38 to
  50 (wall) and 55 to 63 (table). Same-frame basis: equal on every wall
  seed; on the table clip higher on six seeds, by 0.0022 to 2.2461 px, and
  equal on two. `trackTimeShare` −1.66 to +0.95 points on the table clip.
- **P-GH, scaled-step:**
  - (a) at most 1.5 (wall) and at most 0.8 times the control's (table).
  - (b) wall: within ±0.05 px; table: between 0 and +3 px on every seed.
  - (c) wall: within ±0.5 points; table: within ±3 points.
  - *Refuted* as for G8.

### G5 (refuse the minimal fits only)

- **Every-frame, measured:** seed ratio 1.15 (wall), 2.21 (table), the table
  clip's whole-set values 8.63 to 19.09 px. Same-frame basis: equal on every
  wall seed, and on the table clip except s3 (+0.0217 px). 8 to 25 poses
  behind the camera a run. `trackTimeShare` equal to G0's except table s3,
  +0.09 points.
- **P-G5, scaled-step:**
  - (a) at most 1.5 (wall) and at most 0.8 times the control's (table).
  - (b) within ±0.1 px on every seed, both clips.
  - (c) within ±0.5 points, both clips.
  - *Refuted* as for G8.

### GP (refuse a fit with no admissible pose)

- **Every-frame, measured:** seed ratio 4.77 (wall), equal to G0's on every
  seed; 3.41 (table). Same-frame basis: equal to G0 on every seed of both
  clips. `trackTimeShare` equal to G0's on every seed. Poses behind the
  camera a run: 24 to 37 (wall) and 2 to 7 (table), against G0's 61 to 81
  and 39 to 66. No refusal at a frame G0 posed with corners on the wall
  clip, 0 to 2 a run on the table clip.
- **P-GP, scaled-step:**
  - (a) none: on the every-frame schedule GP leaves the wall ratio at G0's,
    so no reduction is predicted.
  - (b) within ±0.01 px on every seed, both clips.
  - (c) within ±0.5 points, both clips.
  - (d) poses behind the camera (DETECT) a run between 0.2 and 0.7 times the
    control's (wall) and at most 0.3 times (table).
  - *Refuted* by (b), (c) or the wall's (d) outside its interval on either
    side, or by the table's (d) above its bound; the table's (d) is
    refutable upward only, since its measured ratios (0.03 to 0.18) leave no
    lower bound worth stating.

## What this probe does not establish

- **Whether a refused fit was right.** The clips carry no ground truth. The
  one wrong-fit sign read here is a pose behind the camera, and a wrong fit
  in front of the camera is invisible to it.
- **Any device figure.** Every run is a desktop replay on the every-frame
  schedule. The device's frame schedule is a declared covariate and a
  separate regime in the drafts, not measured.
- **Whether GH accepts right few-inlier fits that G6 refuses.** On this
  corpus GH accepts 40 to 51 five-inlier fits a clip that G6 refuses (post
  hoc, seeds together). Whether those are right needs ground truth, and a
  corpus with genuine oblique views and more inliers per view, which this
  repository does not hold.
- **The `acquire-test/` clips** of #137's table are not in this repository
  and were not read.
- **GE as a gate.** No threshold exists in the record; its medians are
  reported, its separation is not measured.
- **Which basis the comparisons are read on**, and **what the maintainer
  should choose.** Both are his. The figures are per candidate and per
  clip, on both bases, side by side.

## Constraints kept

No file under `packages/*/src/` changed; the candidates are in the probe's
wrapper. No package, lockfile, tsconfig, target or clip touched. No export
committed, edited or deleted. `README.md`, `docs/benchmarks/README.md` and
`step-protocol.md` unchanged. No CHANGELOG line: a record, no behaviour
change. No issue commented on, edited or closed. The two files are this
document and its script.
