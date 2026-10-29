# #137, Stage 3: G5's criteria and prediction, registered before the implementation (2026-10-28)

**Registered on 2026-10-28, before any implementation of G5, under
[the step protocol](./step-protocol.md), Stage 3: "Criteria are registered in
their own commit, before the implementation, and that commit is cited by
hash". Its basis is [#189](https://github.com/webarkit/webarkit/pull/189)'s
merge, `2b11a3ddaab2d1f7e9a1597c2360240c1b95ea65`, and the probe it merged,
[`2026-10-28-137-stage1-pipeline-probe.md`](./2026-10-28-137-stage1-pipeline-probe.md)
with its script. The gate's form and the comparison basis are
[the maintainer's ruling of 2026-10-28 on #137](https://github.com/webarkit/webarkit/issues/137#issuecomment-6480963893);
the covariates are
[#137's comment of the same day](https://github.com/webarkit/webarkit/issues/137#issuecomment-6480960822).
Nothing here is measured against G5. The results go in an addendum beside
this registration (below, "What a failed criterion means").**

The ruling, quoted in part (its item 1 continues with the probe's figures
and why G6, G8, GH and GP are not chosen; cut where marked):

> 1. **The gate's form: G5**, refuse a detection whose homography has fewer
>    than 5 inliers: exactly the minimal fits this issue is about, whose
>    residual on their own points is zero by construction. […]
>
> 2. **The comparison basis: same-frame.** Arms are compared on the frame
>    indices both posed, exact in a desktop replay where both process the
>    same frames. The media-key basis (the M3 method) stays for device runs,
>    where no frame pairing exists.

Checks of the probe script are numbered here as the probe record's table
numbers them ("The checks, each exercised both ways"), not as the script's
header groups them.

## Step 0: provenance, and the brief's check

- **Ref:** `docs/137-stage3-g5-registration`, branched from `origin/dev` at
  **`2b11a3ddaab2d1f7e9a1597c2360240c1b95ea65`** (#189's merge), after
  `git fetch origin`. Node v24.21.0, the pin; Windows 11, Intel i7-9700.
- **The brief's citations held** at that SHA: the protocol's Stage 3; the
  probe record's sections on the candidates, G5's tables, the two bases,
  Stage 2 and the Stage 3 drafts (C1, C2, G5, the scaled-step regime's (a),
  (b) and (c)); the sections `3a2b5d2` added; both comments on #137.
- **Two of the brief's rulings did not hold, and were re-ruled by the
  maintainer on 2026-10-28, before this file was written.** The re-rulings
  were given to the session that wrote this registration; this file is where
  they are recorded.
  1. *C1 and C2 were to be read by the probe script, unchanged, at the
     implementation's commit.* It cannot run there. Its checks are fatal
     and fixed to `b31635d` and to today's gate: check 2, the tree digests
     of `packages/nft-tracker/src` and `dist` (script lines 203 and 205,
     checked at 231); check 1, the hash of `examples/js/bench-definitions.mjs`
     (line 180, checked at 227), which the implementation edits; check 14,
     the DETECT frames equal to the wrapper's accepted calls (line 614),
     which a 4-inlier fit the backend accepts and `detectTarget` refuses
     breaks; and check 8, G0 reproducing #137's comment of 2026-10-16
     (lines 642 to 647). The re-ruling is the check copy below.
  2. *P-G5 (b) was to be read on the same-frame basis on the scaled-step
     schedule.* No frame pairing exists there, and no existing command
     prints such a figure. The re-ruling is under "P-G5" below.
- **A third re-ruling, the same day, after the independent review below:**
  the check copy's list of differences also names the script's own name
  and its "checks passed" line, which "describe what the file is, not what
  it measures"; a copy that named itself the original "would send a reader
  of a fatal message to the wrong file".
- **Measured in the check, scratch, not committed:** two runs at
  `2b11a3d` of
  `node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <dir>`,
  one after the other.
  - The scaled step was 10.8 and 10.4 ms (static clip), 16.0 and 15.4 ms
    (wall clip), 12.2 and 12.0 ms (table clip).
  - On all three clips, in both the "every frame, sync" and the "device
    scaled step, sync" arm, the processed frames (timestamp and media
    time), their states, `runSummary.jitterPx` and
    `runSummary.trackTimeShare.share` were identical between the two runs.
  - **Seen before registration: the control's seed-1 values on "device
    scaled step, sync"**, at the base's code: `jitterPx` 6.6407 px (wall)
    and 4.6636 px (table); `trackTimeShare` 0.4038 (wall) and 0.7138
    (table). One seed of eight; no part below reads a single seed's
    `jitterPx`, and no margin was set or changed from them. They are not
    load-bearing, and the registered runs repeat them.

## The treatment, as code will express it

- `detectTarget` (`packages/nft-tracker/src/detection.ts`) refuses an
  `h.ok` result whose `numInliers` is below 5. It sits after the `!h.ok`
  refusal and before the inliers are copied, so the main thread and the
  detection worker (`examples/js/detection-worker-core.mjs`, which calls
  `detectTarget`) run the same code.
- The refusal is a failed detection with its own reason,
  `"too-few-inliers"`, carrying the fit's real `numInliers`. The tracker
  makes the frame LOST (`tracker.ts`, lines 950 to 963) with no lock, since
  a lock is set only on an ok detection (lines 783 to 785), as for any
  failed detection.
- Nothing else in the pipeline changes. The reason's types gain the value
  where they spell the reasons out (`DetectionFailure`, `detection.ts`,
  lines 249 to 253; `TrackFailure`, `tracker.ts`, lines 345 to 352, which
  the tracker fills from the detection's reason), and no other behaviour
  changes.

## C1 and C2: what the implementation must reproduce (basis: the probe)

These are checks of the implementation, not predictions about the gate:
the probe measured G5 on the every-frame schedule, and Stage 3 says a
measured outcome is cited as a basis, not predicted.

- **C2, fidelity to the probe.** On the three clips at seeds 1 to 8, the
  every-frame schedule, the implemented gate's per-frame rows equal the
  probe's G5 rows, frame by frame, in `m` (media time), `state`, `ok`,
  `inliers` and `corners`.
  - **The exception, a correction to the probe's draft.** The draft let only
    `reason` differ. But on a refused frame the probe's wrapper returns the
    backend's failure shape, `numInliers: 0` (probe script, line 506), and
    `detectTarget` and the tracker pass that count through to the row
    (`detection.ts`, lines 422 to 431; `tracker.ts`, lines 950 to 963; the
    row's `inliers`, probe script line 556). The implementation carries the
    fit's real count, 4: the backend returns no `ok` fit below 4
    (`jsfeatnext_backend.ts`, line 563). So: **on a frame the gate refuses,
    `reason` and `inliers` may differ from the probe's row; on every other
    frame, every field compared is equal.** A frame the gate refuses is one
    whose probe G5 row has `gate.refused === "count"`. This is part of the
    registration, not an addendum: nothing was registered before it.
  - The two runs have the same number of rows; a row present in one only is
    a differing frame.
  - *Refuted by* any frame that differs outside the exception, on any clip
    and seed.
- **C1, the static clip.** C2's comparison on `pinball-static.mp4`. Its only
  detection is frame 0 (114 inliers), so no frame there is refused, and the
  exception never applies. *Basis:* the probe, 0 differing frames on 8 of 8
  seeds. *Refuted by* any frame that differs, on any seed.

### How C1 and C2 are read

**At the registration's base** (this file's merge commit into `dev`): the
original probe script, unchanged.

    npm ci && npm run build
    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <base replay>
    node docs/benchmarks/2026-10-28-137-stage1-pipeline-probe.mjs --replay <base replay> --out <base run>

- Its G5 rows are `<base run>/<clip>-G5-s<seed>.jsonl` (here and below,
  `<clip>` is the clip's file name without `.mp4`, as the script writes it,
  line 594).
- Its checks must pass there. Between `b31635d` and `2b11a3d` only the
  probe's own two files changed, and this registration adds one docs file,
  so every hashed input is as it was; if anything merged before this file
  changes one, a check fails, and a failed check stops the comparison.
- **The run must reproduce the probe's recorded output** (C2's draft: "Its
  rows' hashes are in `runs.tsv`, whose SHA-256 is in stdout"): stdout's
  `runs.tsv` SHA-256 begins `46db54e2`, and its per-frame rows' SHA-256
  begins `0cb5c750`, as the probe record gives them ("Determinism").
  Otherwise the comparison stops. The script writes each run's rows before
  that run's checks and `runs.tsv` only after all of them, so `runs.tsv` is
  what certifies the rows.

**At the implementation's commit**, built from a clean tree: **the check
copy**, `docs/benchmarks/<date>-137-stage3-g5-check.mjs`, a copy of the
probe script written in Part 2, not now (`WEBARKIT_ROOT` names the checkout
when it runs from outside it, as the original allows).

    npm ci && npm run build
    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <tip replay>
    node docs/benchmarks/<date>-137-stage3-g5-check.mjs --replay <tip replay> --out <tip run>

Its rows are `<tip run>/<clip>-G0-s<seed>.jsonl`. Exactly these lines differ
from the original, and nothing else may:

- **Check 1:** the expected SHA-256 of `examples/js/bench-definitions.mjs`
  is the implementation's, because the implementation edits that file
  (`DEFINITIONS.detectionOutcomes`, lines 136 and 137, lists the failure
  reasons).
- **Check 2:** the expected tree digests of `packages/nft-tracker/src` and
  `packages/nft-tracker/dist` are the implementation's, because the gate is
  in that source.
- **Check 14** (the DETECT frames of the counted loops equal the wrapper's
  accepted calls, line 614): under the implemented gate an accepted 4-inlier
  call ends as a `"too-few-inliers"` LOST frame, so the DETECT frames equal
  the accepted calls minus those refusals.
- **Check 8** (G0 reproducing #137's comment of 2026-10-16, lines 642 to
  647): removed. At the implementation's commit C1 and C2 replace it.
- **`CANDIDATES`** (line 236): the G0 arm only. The wrapper's G0 never
  refuses, so at the implementation's commit G0 is the implemented gate.
- **The "checks passed" line** (line 810), which names check 8 and check
  14's original form: edited to match check 8 removed and check 14 changed.
- **The script's own name:** the `SCRIPT` constant (line 138), and the
  header's lines naming the file, its title and its usage (line 2, the
  file's name; lines 29 to 31, its title and the record it is the
  computation behind; line 38, its usage), naming the copy and this
  registration.

Every other check stays, check 6 included: G0 on seed 1 against
`replay-clips.mjs`'s own "every frame, sync" export at the same commit, so
the copy's decoding is again proved against the instrument.

- If the implementation changes any other hashed input, the copy is not
  widened to admit it: that is a stop.
- `examples/js/bench-frames.mjs:179` is one such input. It needs no new
  value: a `"too-few-inliers"` frame did run `estimateHomography`, and its
  filter excludes only `"too-few-matches"`.
- In Part 2, a diff between the original and the copy shows only the lines
  above, and the PR carries that diff.

**The comparison** reads the 24 pairs (three clips, seeds 1 to 8): each
`<tip run>/<clip>-G0-s<seed>.jsonl` against
`<base run>/<clip>-G5-s<seed>.jsonl`, by C2's fields, key and exception
above. It is a script written in Part 2,
`docs/benchmarks/<date>-137-stage3-g5-compare.mjs`, run as

    node docs/benchmarks/<date>-137-stage3-g5-compare.mjs --base <base run> --tip <tip run>

- It prints, per clip and seed, the rows compared, the frames the exception
  covers, and every differing frame with its field and both values, or
  none. C1 reads its static-clip lines, C2 all of them.
- It reads only rows a `runs.tsv` in the same directory lists, and checks
  each file's SHA-256 against it. A missing, unlisted or unparseable file
  fails the comparison (the protocol: a missing input never falls back to a
  default).

**The new checking code is exercised both ways before its result is read**
(the protocol, "Every check is exercised both ways"), and the cases are
recorded in the addendum:

- the comparison on the base's G5 rows against themselves: no differing
  frame;
- on a scratch copy of one tip file with one field changed on a frame
  outside the exception: that frame reported;
- with `inliers` or `reason` changed on an exception frame: no frame
  reported;
- the copy's check 14, with a refused call counted as accepted (the
  record's perturbation for check 14): it exits 1 and prints nothing.

## P-G5: the prediction for the scaled-step regime

The regime the probe did not run: the device's scaled-step schedule, the
`--external` arm **"device scaled step, sync"** (`scripts/replay-clips.mjs`,
line 969). On it G0's seed ratio of whole-set `jitterPx` was 3.4 (wall) and
1.9 (table) in #137's comment of 2026-10-16, measured at `37dc6d4`. The
margins are the probe draft's proposal, adopted unchanged by the
maintainer's brief. Each part reads the two hand-held clips,
`pinball-bench.mp4` (wall) and `pinball-bench-table.mp4` (table).

- **(a) The draw-dependence.** The seed ratio, the largest whole-set
  `jitterPx` over seeds 1 to 8 divided by the smallest: under the
  implementation **at most 1.5 on the wall clip**, and **at most 0.8 times
  the control's ratio on the table clip**, the control run in the same
  session.
  - *Refuted by* a ratio above its bound. A ratio cannot fall below 1, so
    (a) is refutable upward only.
  - On the table clip the bound is relative, so a gate that does nothing,
    at 1.0 times the control's ratio, is refuted.
  - On the wall clip the bound is absolute. **If the control's own wall
    ratio is at most 1.5, (a) cannot tell the gate from no gate on that
    clip, and its wall half is void, not held** (the protocol: a zero from
    an instrument that cannot respond is never recorded as no effect).
- **(b) The frames both arms pose: not registered for this schedule.**
  - On "device scaled step, sync" the next frame processed depends on the
    current frame's state (`replay-clips.mjs`, lines 637 to 641: a frame
    that is not TRACK costs the 83.2 ms detection, a tracking step costs
    the scaled step). A refused 4-inlier detection leaves its frame LOST
    where G0's is DETECT, the next frame detects again where G0's tracks,
    and from there the arms process different frames. No frame pairing
    exists.
  - The same-frame basis the maintainer ruled is defined only where both
    arms process the same frames.
  - The media-key basis, which the ruling keeps for runs without pairing,
    would make the draft's ±0.1 px margin meaningless: on the every-frame
    schedule the probe's media-key figures for G5 already differ from G0's
    by up to 12.5 px (table, s1: 8.6288 against 21.1731) and 15.6 px
    (wall, s3: 6.1119 against 21.6770), through pooling across loops, where
    the same-frame figures are equal or within 0.0217 px.
  - The same-frame comparison is registered where it is defined: on the
    every-frame schedule, through C2. C2 requires the implementation to
    reproduce the probe's G5 rows, whose same-frame figures against G0 are
    measured.
- **(c) The cost.** Per seed, `trackTimeShare` under the implementation
  minus the control's, in points: **within ±0.5 points on every seed, both
  clips.** *Refuted by* any seed outside that interval, on either side.

The bounds are inclusive: "at most" and "within" admit the bound itself.
Ratios are stated to two decimals and differences in points to two, as the
probe states them; a figure within its last digit of a bound is reported
as a tie (the protocol, "A figure is stated with its margin").

### How P-G5 is read

For each seed n from 1 to 8, three runs of the same command: two at the
registration's base (the control, run A, and its repeat, run B) and one at
the implementation's commit (the candidate). Each uses the build at which
the original script (base) or the check copy (implementation) passed its
checks above, so the two sides differ by the gate.

    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <base scaled>/A/s<n>
    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <tip scaled>/s<n>
    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <base scaled>/B/s<n>

- All 24 in one session on one machine, one at a time, seeds in ascending
  order and, within a seed, in the order above: A, the candidate, B. The
  scaled step is a wall-clock measurement (arm 1's `trackStepMs` p50 times
  `--device-ratio`, `replay-clips.mjs`, lines 1027 to 1030); runs side by
  side would slow each other, and B after the candidate brackets it.
- Each part reads each run's export
  `replay-<clip>-tracking-device-scaled-step-sync.json`, for the wall and
  the table clip:
  - (a): `runSummary.jitterPx`, per seed; the seed ratio from runs A (the
    control) and from the candidate's runs;
  - (c): `runSummary.trackTimeShare.share`, candidate minus run A, times
    100.
- **The step, beside every figure:** the export's `stepMs`, which stdout
  also prints as "`<clip>.mp4: the scaled step is … ms`".
  - For each clip and seed, the base's two steps (runs A and B) and the
    candidate's are reported.
  - **Where the candidate's step differs from run A's by more than run B's
    does, that is reported as such.** It is a report, not a tolerance: by
    the protocol, a figure that bounds variability never comes from the
    difference of two observations, so it changes no part's verdict.
  - Where runs A and B differ in any figure (a) or (c) reads, that is
    reported too.

## What a failed criterion means

A criterion that fails is never edited. Its result goes in an addendum
beside this registration, and an addendum may be added more than once;
each one stands (Stage 3).

The results of the runs above, for C1, C2 and each part of P-G5, go in
such an addendum, with the commands, the figures and one verdict each:

- **held**;
- **refuted**;
- **void**: a part that cannot be read (a missing export, a null
  `jitterPx`, an incomplete `trackTimeShare`) or cannot respond (the wall
  half of (a), above). A void part is never reported as held.

## What this registration does not register

- **P-G5 (b) on the scaled-step schedule** (above).
- **The refusal's own output.** Under C2's exception the `reason` and
  `inliers` of a refused frame are not compared, so C2 does not check that a
  refusal reads `"too-few-inliers"` with 4 inliers. That is the
  implementation's unit test's to show, not a criterion here.
- **Any device figure.** Every run above is a desktop replay.
- **Whether a refused fit was right.** The clips carry no ground truth.
- **G6, G8, GH and GP.** Not chosen by the ruling; their drafts stay in the
  probe record.

## The independent review, and what it changed

A reviewer subagent, briefed with the protocol, the brief's requirements
and the maintainer's re-rulings but not this session's reasoning, read the
draft and its sources at `2b11a3d` before any commit. Its findings, as
applied:

- **The check copy as ruled would print a falsehood.** Its "checks passed"
  line (810) names check 8 and check 14's original form, and its `SCRIPT`
  name and header name the original file. Taken to the maintainer, who
  added both to the list (Step 0, the third re-ruling).
- **C2's base run was not tied to the probe's recorded output**, as the
  draft's C2 tied it through `runs.tsv`. Restored above.
- **The comparison and the changed check 14 were new checks never
  exercised both ways.** Their cases are now required above.
- **(a)'s wall bound can be blind**, being absolute: the void case is now
  stated. The draft had said the bounds exclude a gate that does nothing,
  which holds for the table clip only.
- **The control's seen seed-1 values were not disclosed.** They are now, in
  Step 0.
- **Citations:** the decoding check is check 6 in the record's numbering,
  not 4; the failure reasons are in `DEFINITIONS.detectionOutcomes`, not
  the detection-use entry; the lock is at `tracker.ts` 783 to 785; check 8
  spans lines 642 to 647; stdout prints the clip with `.mp4`.
- **Wording:**
  - the ruling's quote marks its cut;
  - the addendum has one place;
  - the verdicts are listed once;
  - the margins are the draft's, adopted by the brief, not "set by the
    maintainer";
  - the treatment no longer names the exported constant, which is a later
    ruling, and names the two types the new reason enters.
- **Added from its open points:** the bounds' inclusiveness and precision,
  the order of the 24 runs, and the builds both sides use.
- **Not applied:** none of its findings was rejected.

## Constraints kept

One file, this one. No code, no package, lockfile, tsconfig, target or clip
touched; no export committed. No CHANGELOG line: a registration, no
behaviour change. No issue commented on, edited or closed.

---

## Addendum, 2026-10-29: the criteria run against G5's implementation

**Recorded on 2026-10-29, after the runs, under Stage 3 ("A criterion that
fails is never edited. The result is recorded in an addendum beside it").
Nothing above this line is edited. The implementation is `4432d2a`
(`fix/137-g5-gate`: the red test `34a9449`, then the gate), branched from
this registration's merge into `dev`,
`a071b552466eace18eadbb3d64db09007a8ec8a2` (#190), which is the base
throughout. Verdicts: C1 held; C2 held; P-G5 (a) refuted on the wall clip
and held on the table clip; P-G5 (c) refuted on both clips.** A refuted part
is recorded and changes nothing in the gate.

### Provenance

- **Base:** a detached worktree at `a071b55`, `npm ci && npm run build`; the
  provenance manifest clean at `a071b55`, bundle
  `66687a9714ddadce9e16b41b2d1d4b11c1677cd1d8f1cc3d154a56b538efa855`.
- **Implementation:** the branch's worktree at `4432d2a`, `npm ci && npm run
  build` from a clean tree; the manifest clean at `4432d2a`, bundle
  `a07f68068111ca26969af104a65184cf1c05c0023ef07be001d06add48400579`. The
  hashed inputs that changed, as the registration expects: 
  `examples/js/bench-definitions.mjs` `b564a07a…`, `packages/nft-tracker/src`
  `0973297d…` (33 files) and `packages/nft-tracker/dist` `9de4e864…` (33
  files). Every other input the probe hashes is as at `b31635d`.
- Node v24.21.0, the pin; ffmpeg 9.0.2 (gyan.dev essentials build); Windows
  11 Pro, Intel i7-9700, the machine of the registration's Step 0.
- The scripts, each committed byte-identical with the version whose output
  is recorded here: the check copy
  [`2026-10-29-137-stage3-g5-check.mjs`](./2026-10-29-137-stage3-g5-check.mjs)
  (`fd51039d…`), the comparison
  [`2026-10-29-137-stage3-g5-compare.mjs`](./2026-10-29-137-stage3-g5-compare.mjs)
  (`633f33df…`), and the reader of P-G5's runs
  [`2026-10-29-137-stage3-g5-pg5.mjs`](./2026-10-29-137-stage3-g5-pg5.mjs)
  (`5961028d…`), which the registration does not name (below, "How P-G5 was
  read"). The original probe script is `9a40bd69…`, as the probe record
  gives it.

### C1 and C2: held

**At the base,** as "How C1 and C2 are read" gives it:

    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <base replay>
    node docs/benchmarks/2026-10-28-137-stage1-pipeline-probe.mjs --replay <base replay> --out <base run>

- Every check passed. `runs.tsv`
  `46db54e2d31a17c9a15f1d3786f4bba87df8916e409b51f951fd4d29455dfe69` and the
  rows' hashes `0cb5c7504ccd24ca949e84805d4b737c1254a5083dac714c977cfcfe76c970df`:
  **the probe's recorded output, reproduced.** Stdout, 49,577 bytes, is
  `d19daae6…`; with its one build-dependent line ("built clean at …") set to
  `b31635d9d8c4f8d6b60e6befd86ee7687c5c0636`, it is
  `19eebb1c52c9ea77f2b8a5048f0c33212b28bdc07b240228e7808bce2895897a`, the
  probe record's stdout, byte for byte.

**At the implementation:**

    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <tip replay>
    WEBARKIT_ROOT=<implementation checkout> node docs/benchmarks/2026-10-29-137-stage3-g5-check.mjs --replay <tip replay> --out <tip run>
    node docs/benchmarks/2026-10-29-137-stage3-g5-compare.mjs --base <base run> --tip <tip run>

- The check copy's every check passed, check 6 (G0 at seed 1 against
  `replay-clips.mjs`'s own "every frame, sync" export at `4432d2a`, frame by
  frame) among them. `runs.tsv` `c04ba2b5…` (24 runs), the rows' hashes
  `ca94d036…`; stdout `c8718139…`, 16,128 bytes.
- The comparison (stdout `ee282372…`), the 24 pairs:

| clip | rows, seeds 1–8 | frames under C2's exception | differing frames |
|---|---|---|---|
| `pinball-static.mp4` | 17,424 | 0 | **0** |
| `pinball-bench.mp4` (wall) | 14,304 | 2,317 | **0** |
| `pinball-bench-table.mp4` (table) | 12,816 | 1,375 | **0** |

  No pair differs on any seed: each of the 24 prints "no differing frame",
  with the two runs' row counts equal.
- **C1: held.** 0 differing frames on the static clip, 8 of 8 seeds.
- **C2: held.** 0 differing frames outside the exception, on every clip and
  seed.
- Not a criterion, read beside them (the registration leaves the refusal's
  own output to the unit test): on all 3,692 exception frames the
  implementation's row reads `"too-few-inliers"` with 4 inliers where the
  probe's reads `"no-consensus"` with 0, and no other frame of the 24 runs
  has the new reason. A scratch count, not committed.

### The check copy: what differs, and what it still says

`diff -u` between the original and the copy shows only the registered lines,
with one addition: **line 641**, the comment heading check 8's block
(`// Check 6: #137's comment of 2026-10-16.`), is removed with the block's
code, lines 642 to 647. Left in, it would label code that no longer exists.
The PR carries the diff.

- **Check 14 was written twice before its result was read.** Its first form
  subtracted from the accepted calls the frames the run itself reported as
  `"too-few-inliers"`. The code review found that this form cannot fire when
  the gate is missing: a 4-inlier call would end as DETECT, nothing would be
  subtracted, and the counts would agree. The recorded form derives the
  refusals the gate must make from the accepted calls (`n < 5`), and requires
  the frames of those calls and the `"too-few-inliers"` frames to be the same
  set, each frame carrying its call's count. The first form's tip run produced
  the same `runs.tsv` and rows as the recorded one (`c04ba2b5…`,
  `ca94d036…`): only the check changed.
- **Text the registration does not let the copy change, now stale at the
  implementation:** the header's "No file under packages/<name>/src/ is
  changed" (lines 32 and 33); its method items 2 (the `detection.ts` lines
  it cites have moved), 3 ("G0: never. Today's gate."), 4.6 (the removed
  check) and 4.7 (check 14's original form); and stdout's first line, "#137
  Stage 1 pipeline probe: candidates G0". Its printed tables also count the
  4-inlier fits the backend accepted under "accepted 4", and report 0
  "refused by the gate", since the wrapper refuses nothing and the tracker
  does. **No figure here is taken from those tables.**

### The new checking code, exercised both ways

Every case below was run before the result it guards was read, except the
P-G5 reader's, which were run after its output was first read (its output,
re-read after them, is identical). Each failing case exited 1 and printed
nothing to stdout.

| code | must not fire | must fire |
|---|---|---|
| the comparison | the base's G5 rows against themselves (as a tip directory): 0 differing frames | one tip row's `state` changed outside the exception (table, s1, frame 40, TRACK → LOST): that frame reported, and only it |
| | `inliers` and `reason` changed on an exception frame (table, s1, frame 0): no frame reported | a file whose SHA-256 is not its listed one; a run `runs.tsv` does not list; a row without `corners`; an empty listed file; a base `runs.tsv` that is not the probe's recorded one: each refused |
| the check copy's check 14 | the recorded run at the implementation | (i) a refused call counted as accepted, the registered perturbation, seeds cut to 1, at the implementation: "85 DETECT frames in the counted loops, 204 accepted gate calls less 119 too-few-inliers refusals" (table), as the probe record's perturbation found for G5 (85 and 204); (ii) the gate missing: the copy, its check 1 and 2 hashes set to the base's, run against the base checkout, seeds cut to 1: "frame 267's accepted call has 4 inliers, the frame is DETECT" (table) |
| the P-G5 reader | the 24 runs, as copied: output identical to the run's | the A and candidate runs swapped; one export's `seed` changed; one export removed; no argument: each refused |

The comparison was hardened after the code review and before the cases above
were recorded: it now refuses a base `runs.tsv` other than the probe's
recorded output, a run listed twice, an empty file and a row without an
integer `k` or one of the compared fields. The recorded comparison is the
hardened one.

### P-G5: (a) refuted on the wall clip, held on the table clip; (c) refuted on both

**The runs**, all 24 in one session on this machine, one at a time, seeds
ascending, within a seed A (base), the candidate (implementation), B (base):

    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/A/s<n>
    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/tip/s<n>
    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/B/s<n>
    node docs/benchmarks/2026-10-29-137-stage3-g5-pg5.mjs <root>

From 08:20:49Z to 09:08:14Z, about two minutes a run. No build, test or
replay ran beside them; two read-only review agents ran git and file reads
during them.

**How P-G5 was read.** The registration names the fields and the
arithmetic, not a script. The reader above applies them as written: per run,
the "device scaled step, sync" export of the wall and the table clip, after
checking its seed, schedule, clip and packages (the arm's clean bundle at
its commit); `runSummary.jitterPx`; `runSummary.trackTimeShare.share`,
complete; `stepMs`. Every export of the 24 runs passed.

**The wall clip** (`pinball-bench.mp4`):

| seed | step A / cand. / B (ms) | `jitterPx` A / cand. / B | `trackTimeShare` A / cand. / B | (c) cand. − A, points |
|---|---|---|---|---|
| 1 | 14.22 / 14.32 / 14.39 | 6.6407 / 6.0050 / 6.6407 | 0.4038 / 0.4122 / 0.4038 | +0.84 |
| 2 | 14.49 / 14.71 / 14.29 | 8.9230 / 6.6986 / 8.9230 | 0.3737 / 0.3988 / 0.3737 | +2.51 |
| 3 | 14.94 / 14.50 / 14.28 | 22.0665 / 6.5392 / 22.0665 | 0.4139 / 0.3721 / 0.4139 | −4.18 |
| 4 | 14.26 / 13.91 / 14.32 | 8.4537 / 6.5080 / 8.4537 | 0.4055 / 0.3788 / 0.4055 | −2.68 |
| 5 | 14.00 / 14.25 / 13.88 | 8.7982 / 8.0522 / 8.7982 | 0.4089 / 0.3687 / 0.4089 | −4.01 |
| 6 | 13.91 / 14.15 / 14.13 | 7.1132 / 6.4878 / 7.1132 | 0.3838 / 0.3754 / 0.3838 | −0.84 |
| 7 | 14.18 / 14.19 / 14.39 | 7.7518 / 7.0412 / 7.7518 | 0.3905 / 0.3721 / 0.3905 | −1.84 |
| 8 | 13.85 / 17.11 / 14.12 | 22.6422 / 9.3241 / 22.6422 | 0.3788 / 0.3754 / 0.3788 | −0.33 |

**The table clip** (`pinball-bench-table.mp4`):

| seed | step A / cand. / B (ms) | `jitterPx` A / cand. / B | `trackTimeShare` A / cand. / B | (c) cand. − A, points |
|---|---|---|---|---|
| 1 | 11.71 / 12.10 / 11.71 | 4.6636 / 2.5666 / 4.6636 | 0.7138 / 0.7292 / 0.7138 | +1.54 |
| 2 | 11.41 / 11.44 / 11.37 | 2.7321 / 2.5468 / 2.7321 | 0.7247 / 0.7413 / 0.7247 | +1.66 |
| 3 | 12.06 / 11.16 / 11.03 | 3.5533 / 2.5911 / 3.5533 | 0.7039 / 0.7267 / 0.7039 | +2.28 |
| 4 | 11.24 / 11.44 / 10.92 | 2.5745 / 2.7204 / 2.5745 | 0.7278 / 0.7264 / 0.7278 | −0.14 |
| 5 | 11.24 / 11.15 / 11.59 | 4.7438 / 2.5849 / 4.7438 | 0.7140 / 0.7261 / 0.7140 | +1.21 |
| 6 | 11.72 / 11.19 / 11.57 | 2.5351 / 2.5946 / 2.5351 | 0.7525 / 0.7188 / 0.7525 | −3.37 |
| 7 | 11.19 / 11.30 / 11.59 | 3.4670 / 3.0898 / 3.4670 | 0.7098 / 0.7236 / 0.7098 | +1.38 |
| 8 | 11.32 / 12.05 / 11.36 | 2.7499 / 2.5746 / 2.7499 | 0.7118 / 0.7385 / 0.7118 | +2.67 |

- **(a), the wall clip: refuted.** The candidate's seed ratio is
  9.3241 / 6.0050 = **1.55** (1.5527; s8 over s1), above the bound of 1.5,
  and not within its last digit of it. Not void: the control's own ratio is
  22.6422 / 6.6407 = 3.41 (s8 over s1), above 1.5, so the bound could tell
  the gate from no gate. The control's ratio reproduces the 3.4 of #137's
  comment of 2026-10-16 at `37dc6d4`.
- **(a), the table clip: held.** The candidate's seed ratio is
  3.0898 / 2.5468 = **1.21** (1.2132; s7 over s2), against 0.8 × the
  control's 4.7438 / 2.5351 = 1.87 (1.8712; s5 over s6), that is **1.50**
  (1.4970). The control's ratio reproduces the comment's 1.9.
- **(c): refuted on both clips.** On the wall clip seven of eight seeds lie
  outside ±0.5 points, from −4.18 (s3) to +2.51 (s2); only s8 (−0.33) is
  within. On the table clip seven of eight lie outside, from −3.37 (s6) to
  +2.67 (s8); only s4 (−0.14) is within. None is within its last digit of
  0.50. The differences take both signs on both clips.
- **The steps.** The candidate's step differs from run A's by more than run
  B's does on wall seeds 2, 4, 5, 6 and 8 and on table seeds 1, 6 and 8; the
  largest is wall s8, 17.11 against 13.85 ms. This is a report, not a
  tolerance, and changes no verdict.
- **Runs A and B are equal** in every figure (a) and (c) read, on every seed
  and both clips, though their steps differ by up to 0.66 ms (wall s3) and
  1.03 ms (table s3). So the repeat found no variation in the control's
  figures at the steps this session measured. That is one pair of runs per
  seed: it bounds nothing, and is no tolerance for the candidate's
  differences.
- **What (c)'s refutation leaves open, as a conjecture.** On this schedule
  the frame processed next depends on the current frame's state (the
  registration's (b)), so a refused detection changes which frames the run
  processes from then on, and `trackTimeShare` is read over a different set
  of frames. Whether the movements above come from that divergence, from the
  candidate's own step, or from the refusals' cost in LOST frames is not
  measured here.

### The ground-truth sequences, a result beside the criteria

Not a criterion: the registration registers nothing about #90's synthetic
sequences (`packages/nft-tracker/ground-truth/tracker_sequences.ts`, #130),
which, unlike the clips, carry the true homography of every frame. G5
changed three of their pinned state strings, all on `leaveAndReturn`'s 106
frames; the maintainer accepted the new strings on 2026-10-29, and the tests
assert them, with the refused frames' reason and count, since the branch's
commits after the gate. D, T and L are DETECT, TRACK and LOST; position 0 is
frame 0.

| test | before (`a071b55`) | under G5 (`4432d2a`) |
|---|---|---|
| `tracker_state_machine.test.ts`, the fixture target | `D T×38 D L×27 D×26 T×13` | `D T×38 L×28 D L D×24 T×13` |
| the same file, the shipped `pinball.wnft` | the same | the same |
| `tracker_external_detection.test.ts`, its M2 arm (seeded `SEED + i` per frame) | the same | `D T×38 L×28 D L L D×23 T×13` |

The frames G5 refuses, each a 4-inlier DETECT before the gate, with the fit's
RMS against the true homography over the target's 64 patch centres
(`centreRms`), measured at the base by a scratch test, not committed:

| run | frame 39 | frame 68 | frame 69 |
|---|---|---|---|
| fixture target | 4 inliers, 193.7 px | 4 inliers, 255.7 px | (8 inliers, not refused) |
| shipped target | 4 inliers, 193.7 px | 4 inliers, 255.7 px | (8 inliers, not refused) |
| external test's M2 arm | 4 inliers, 262.6 px | 4 inliers, 216.0 px | 4 inliers, 511.9 px |

- **Every fit G5 refuses on these sequences is wrong**, by 193.7 to 511.9
  px RMS. No right fit is refused there.
- **No TRACK frame changes**, in state or position (frames 1 to 38 and 93 to
  105 in all three), and every other assertion in the two files holds
  unchanged. The one knock-on effect: the frame after a refusal detects
  afresh, so its `trackLoss` reads null where it read `too-few-patches`.
- **The limit, which G5 does not catch:** frame 69 on the fixture target,
  and on the shipped one, is a DETECT on 8 inliers whose fit is 61,614.9 px
  RMS from the true homography, at the base and under G5 alike. A count gate
  at 5 refuses only the minimal fits.

### What this addendum does not establish

- **Whether the fits G5 refuses on the clips were wrong.** The clips carry
  no ground truth; only #90's synthetic sequences above do.
- **Any device figure.** Every run here is a desktop replay.
- **The bench page's stateless pipeline.** `runStatelessPipeline`
  (`examples/bench-nft.html`) is an inline copy of the detection steps that
  never calls `detectTarget`, and was left unchanged by the maintainer's
  ruling of 2026-10-29: after G5 it still accepts the 4-inlier fits the
  tracker refuses. Three sentences that claim parity between it and the
  tracker are false on such a frame (the counts still agree; the state does
  not): `examples/bench-nft.html`'s comment over the function (lines 763 to
  771), `DEFINITIONS.states` (`examples/js/bench-definitions.mjs`, line 66,
  a hashed input) and `examples/README.md`'s detection-only bullet ("the same
  pipeline as the stateless mode"). The static demo's inline pipeline
  (`examples/pinball-static-jsfeatnext-backend.html`, about line 469) also
  accepts them; it is a contract demo and claims no parity with the tracker.
  The maintainer will open the follow-up.

### The reviews

Two read-only code reviews of the branch at `4432d2a`, with the check copy
and the comparison: a general reviewer and the repository's `nft-reviewer`.
Neither found anything critical.

- **Applied:** check 14's second form and the comparison's hardening
  (above); the ground-truth tests now assert each refused frame's reason and
  count, where only the state string was pinned; the package README names
  `MIN_DETECTION_INLIERS` among its fixed guards, rewraps the reason's
  sentence and no longer calls detection-only mode "exactly M1"; the
  CHANGELOG entry.
- **Not applied, because `packages/nft-tracker/src` stays at the measured
  commit** (its tree digest is check 2, and its comments reach `dist` and the
  bundle): wording in `src/` comments (`detection.ts`'s citation of the
  ruling, "a minimal fit" for a backend other than jsfeatNext, the reflow in
  `tracker.ts`'s determinism note, "M1's `process` unchanged" in `detect`'s
  doc). A NaN-safe comparison (`!(n >= 5)`), which the treatment does not
  register.
- **Left to the maintainer's follow-up:** the stateless pipeline's parity
  sentences above.
