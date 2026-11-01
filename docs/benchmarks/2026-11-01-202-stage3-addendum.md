# #202, Stage 3 addendum: the registered criteria run against the facing rule (2026-11-01)

**An addendum to
[`2026-11-01-202-stage3-registration.md`](./2026-11-01-202-stage3-registration.md),
under its "What a failed criterion means": the results of C0 to C4 and of
each registered part of P, read on Part 3's implementation, with the
commands, the figures and one verdict each.** The registration is not edited.
Part 3 is [#202](https://github.com/webarkit/webarkit/issues/202)'s
implementation of the facing rule: `targetSide` and the `"not-facing"`
refusal in `packages/nft-tracker/src/detection.ts`, and its parity in the
bench page's stateless mode. Its basis is the registration's merge into
`dev`, `45d3471` (#219), and the probe it rests on,
[`2026-11-01-202-stage1-probe.md`](./2026-11-01-202-stage1-probe.md) (#218,
`f872707`).

**C0 to C4 held. Of P, part (a)'s GW half and part (c) held on both hand-held clips and are void on the static clip; part (a)'s GM half is void on every clip. No part of P is refuted.**

| criterion                                        | verdict  | the figure it is read on                                                                                                                                  |
| ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the base run reproduces the probe                | equal    | stdout `1ad32881…` with line 4's head set to `9b387ae`; expressibility `039ad945…`                                                                        |
| C0, facing is unchanged                          | **held** | 24 clip-seed runs and 7 sequences, every field of every result: no difference outside exceptions (i) and (ii)                                             |
| C1, fidelity to the probe                        | **held** | 24 pairs, 44,544 rows: no difference outside the exception; the refused frames equal GWM's on every pair (1,233 in all)                                   |
| C2, must-fire and must-not-fire on the sequences | **held** | leave-and-return 67 (5) and 69 (8) refused, LOST; the other 50 DETECT frames DETECT with the same inliers and column, all `facing`                        |
| C3, the unit cases                               | **held** | five constructed fits through `detectTarget`, each classified by `targetSide` first; both ways as registered                                              |
| C4, the stateless parity                         | **held** | reversed, mixed-w refused by both with the same reason, count and matches; facing accepted by both; a `deps` without either function throws, naming it    |
| P (a), GW half: no DETECT frame with corners null | **held** on the wall and table clips; **void** on the static clip | candidate 0 on every seed (control 11 to 19 a seed, on 8 of 8 seeds); zero-area corners 0 everywhere |
| P (a), GM half: no DETECT frame with mirrored corners | **void** on every clip | the control has no mirrored DETECT frame on any seed of any clip; the candidate 0 |
| P (c), every posed frame has corners | **held** on the wall and table clips; **void** on the static clip | candidate ok = with corners on every seed (control: differs on 8 of 8 seeds); static: equal in the control |

## Step 0: provenance

- **Ref:** `fix/202-facing-rule`, branched from `origin/dev` at
  **`45d34716101dcb985c92e5168c4fc0553a10d1dd`** (#219's merge), after
  `git fetch origin`. Node v24.21.0, the pin; Windows 11. The session ran on
  Claude Opus 5.5, with the advisor (Fable) consulted at the two points the
  brief named.
- **The two builds,** each `npm ci && npm run build` from a clean tree, with
  `npm run check:provenance` exiting 0 before any run:
  - **the base:** a worktree at `45d3471`; bundle
    `8c0e0b9fff317e10605476e628686c51f04bf8d2773f0a6af46755203329d086`
    (282,978 bytes);
  - **the implementation:** `8b85d06` (`4e8d54f`, the rule; `8b85d06`, the
    three ground-truth strings the maintainer accepted); bundle
    `98dc85330ba52ac620f63dbefcaacdd3498f1e315608cf5f98041ecc7181e8b6`
    (283,832 bytes). Its manifest differs from the base's in the head, the
    bundle, the sources `detection.ts`, `index.ts` and `tracker.ts`, the
    bundled inputs `dist/detection.js` and `dist/index.js`, and the served
    files `bench-nft.html`, `js/bench-definitions.mjs` and
    `js/bench-stateless.mjs`, as expected; nothing else.
- **The scripts** this addendum's runs used are committed beside it. During
  the runs they were untracked files under `docs/` in the implementation's
  checkout; `npm run check:provenance` still exited 0 there (it reads the
  tracked tree), and nothing under `docs/` enters the build.
- **The ground-truth strings (correction 4).** The implementation changed
  three pinned leave-and-return strings, all to `D T×38 L×31 D×23 T×13`.
  Part 3 stopped and reported them; the maintainer accepted all three on
  2026-11-01, before any criterion was run. The shipped arm's new string is
  the registration's derived one; the two arms the registration named as
  unknown, now measured: the fixture arm (its old string the shipped arm's,
  the same frames 67 and 69 refused) and the M2 arm
  (`D T×38 L×28 D L L D×23 T×13` before; only frame 67 changes, since 69 was
  already a 4-inlier refusal there). Frames 39 and 68 remain
  `"too-few-inliers"` with 4 inliers in every arm. The commit is `8b85d06`.

## The base run reproduces the probe

At the base, as registered:

    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <base replay>
    node docs/benchmarks/2026-11-01-202-stage1-probe.mjs --replay <base replay> --out <base run> > <base run>/stdout.txt
    node --experimental-transform-types docs/benchmarks/2026-11-01-202-stage1-probe.mjs --expressibility > <base run>/expressibility.txt

Every check of the original probe passed (exit 0, 823 s). Stdout's line 4
reads "built clean at `45d34716…`"; with that hash set to `9b387ae…`, its
SHA-256 is
`1ad328812f7040593bc2eb8d82e57e8f91bdccc98af3cafc9e72f3682b131713`, the
recorded one (as printed, `2bbb64add6f3…`). The expressibility stdout is
`039ad945b45bbea8de6d8acfdf519a67aafd6badc41ef930de636e726ec16030`, the
recorded one. The comparison went ahead. This run was made once: its
reproduction of the recorded hash is its determinism check.

## C1, fidelity to the probe: held

**The check copy,**
[`2026-11-01-202-stage3-check.mjs`](./2026-11-01-202-stage3-check.mjs), at
the implementation:

    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <tip replay>
    WEBARKIT_ROOT=<implementation> node docs/benchmarks/2026-11-01-202-stage3-check.mjs --replay <tip replay> --out <tip run> > <tip run>/stdout.txt
    WEBARKIT_ROOT=<implementation> node --experimental-transform-types docs/benchmarks/2026-11-01-202-stage3-check.mjs --expressibility > <tip run>/expressibility.txt

Every check passed, check D (G0 on seed 1 against `replay-clips.mjs`'s
"every frame, sync" export at `8b85d06`) and the new check J included. Its
diff against the probe touches only the ranges the registration allows (below,
"The check copy's diff"). Run twice, byte-identical: stdout
`1fbf89dab33e306ad4652dbf45c48b7e227337f01141ce0b1be5130d21b8f3d6`,
expressibility
`8df56c2292a0ceb881f1cd8c0a830e0aec9570fa54b03b134c7a680760bfb23f`.

**The comparison,**
[`2026-11-01-202-stage3-compare.mjs`](./2026-11-01-202-stage3-compare.mjs):

    node docs/benchmarks/2026-11-01-202-stage3-compare.mjs --base <base run> --tip <tip run>

Exit 0; run twice, byte-identical, stdout
`32eb87aadc7f765953ac92ec26c5ab0487b5a5f900f0f617d84f9fc54d6036db`. Per clip,
over seeds 1 to 8:

| clip                  | rows a run | refused at the base (GWM) and `"not-facing"` at the tip, per seed | under the exception | differing |
| --------------------- | ---------- | ------------------------------------------------------------------- | ------------------- | --------- |
| `pinball-static`      | 2,178      | 0 on every seed                                                     | 0                   | none      |
| `pinball-bench`       | 1,788      | 71, 65, 71, 63, 67, 74, 60, 66                                      | the same            | none      |
| `pinball-bench-table` | 1,602      | 94, 95, 87, 91, 83, 81, 83, 82                                      | the same            | none      |

On every pair the refused sets are the same frames on both sides, and every
field of every row other than `reason` and `inliers` on those frames, and
`gate.refused`, is equal. The counts per run are those of the registration's
Step 0 (60 to 74 on the wall clip, 81 to 95 on the table clip).

## C2, must-fire and must-not-fire on the sequences: held

The check copy's `--expressibility` at the implementation ran C2's tests,
fatal if they fail, and they passed: frames 67 and 69 of leave-and-return
read `"not-facing"`, LOST, with 5 and 8 inliers; no other frame of the three
sequences reads `"not-facing"`; the remaining 50 DETECT frames are all
`facing` (50 `facing × two`). Against the base:

    node docs/benchmarks/2026-11-01-202-stage3-compare.mjs --base <base run> --tip <tip run> --expressibility

Exit 0; run twice, byte-identical, stdout
`0a23203ba7c931ad92edeaf934286ff30699fac2b5b1a959120b2c8e507b2944`. Of the
base's 52 DETECT frames, frames 67 (5 inliers, `mixed-w`) and 69 (8,
`mixed-w`) are `"not-facing"`, LOST, with their counts; the other 50 are
DETECT at the implementation with the same inliers and column. `npm test` at
the implementation passes with the three accepted strings (Step 0).

## C0, facing is unchanged: held

[`2026-11-01-202-stage3-c0.mjs`](./2026-11-01-202-stage3-c0.mjs):

    node --experimental-transform-types docs/benchmarks/2026-11-01-202-stage3-c0.mjs --base <base checkout> --tip <implementation checkout> --base-run <base run>

Exit 0; run twice, byte-identical, stdout
`9fc06c9d6f2f8d7b564cec1ff44d8504d1f97a3740f3200e0525ab8540795936`. It held
the probe's lines 113 to 122, 127 to 147, 522 to 553 and 571 to 579
byte-identical, and the resolve hook's 1022 to 1033, checked line by line when
the script was assembled. Its ties to the probe held: on every clip and seed
the base's states, and on DETECT frames its `H` and column, are the base
probe run's G0 rows; on the sequences the base's DETECT frames and columns are
the base expressibility stdout's. No run read `Math.random`.

| run                   | frames compared (TRACK / DETECT / LOST), per seed range | exception (i), per seed | exception (ii), per seed | differing |
| --------------------- | ------------------------------------------------------- | ----------------------- | ------------------------ | --------- |
| `pinball-static`      | 2,177 / 1 / 0 on every seed                             | 0                       | 0                        | none      |
| `pinball-bench`       | 1,210–1,219 / 63–74 / 433–446                           | 60–74                   | 48–55                    | none      |
| `pinball-bench-table` | 1,266–1,291 / 28–46 / 195–210                           | 81–95                   | 54–66                    | none      |
| leave and return      | 51 / 24 / 29                                            | 2                       | 2                        | none      |
| wander, velocity 2–6  | every frame                                             | 0                       | 0                        | none      |

Exception (i) is the frames the rule refused, the same frames as C1's;
exception (ii) is fewer, since a refusal is often followed by another. Every
field of every other result is equal, TRACK frames included (`H`, `pose`,
`poseSelection`, `conditioning`, `tracking`, `timings`, which is null without
a clock, and the rest), and on the frame after a refusal every field but the
three.

## C3, the unit cases: held

`packages/nft-tracker/test/detect_target.test.ts`, "refuses a fit whose H
does not show the target facing the camera (#202)": `facing` and its
negation accepted with the fit's `H`; `reversed`, `mixed-w`, one grid `w`
exactly 0 (`w = x + y`, `det H = −1`) and `det H = 0` with `w = 1` refused as
`"not-facing"` with the fit's 7 inliers; each constructed `H` first
classified by `targetSide` as `facing`, `reversed`, `mixed-w`, `mixed-w` and
`singular`. A 4-inlier reversed fit stays G5's `"too-few-inliers"`. Seen red
before the rule existed (`targetSide is not a function`).

## C4, the stateless parity: held

`examples/test/bench-stateless.test.mjs`: on a reversed and a mixed-w fit of
7 inliers (built for `pinball.wnft`'s 512 × 640 grid as the probe's self-test
builds them, and classified by `targetSide` first) both paths refuse with
`"not-facing"`, 7 inliers and 12 matches; on a facing fit both accept. The
existing `deps` cases now cover `targetSide` and `targetGrid`: a `deps`
without either throws, naming it (the `targetGrid` case was seen red before
the guard existed).

## P: the prediction for the scaled-step regime

The 24 runs of the registered command, each with the build its C1 run used
(`45d3471` for A and B, `8b85d06` for the candidate), one at a time on this
machine, seeds ascending and A, the candidate, B within a seed, from 17:29:54Z
to 18:15:14Z on 2026-11-01; each exited 0 in 110 to 122 s. Nothing else ran
on the machine meanwhile but this text's editing.

    node docs/benchmarks/2026-11-01-202-stage3-p.mjs <root> --base-head 45d34716… --tip-head 8b85d06d…

[`2026-11-01-202-stage3-p.mjs`](./2026-11-01-202-stage3-p.mjs) checked every
export (seed, schedule, clip, the manifest's bundle from a clean tree at the
run's head) before reading any. Exit 0; run twice, byte-identical, stdout
`cd19d695776c1149fa8383f23f9f558994b836140240e4110a8d30815ac94c5b`. Counted
loops 1 to 4:

| clip, seed | (a) DETECT corners null, A / candidate / B | mirrored, A / candidate / B | (c) ok and with corners, A | the candidate | B |
| --- | --- | --- | --- | --- | --- |
| static, every seed | 0 / 0 / 0 | 0 / 0 / 0 | 728, 728 | 728, 728 | 728, 728 |
| wall s1 | 19 / 0 / 19 | 0 / 0 / 0 | 349, 330 | 328, 328 | 349, 330 |
| wall s2 | 14 / 0 / 14 | 0 / 0 / 0 | 342, 328 | 337, 337 | 342, 328 |
| wall s3 | 19 / 0 / 19 | 0 / 0 / 0 | 338, 319 | 330, 330 | 338, 319 |
| wall s4 | 18 / 0 / 18 | 0 / 0 / 0 | 339, 321 | 331, 331 | 339, 321 |
| wall s5 | 14 / 0 / 14 | 0 / 0 / 0 | 336, 322 | 338, 338 | 336, 322 |
| wall s6 | 18 / 0 / 18 | 0 / 0 / 0 | 338, 320 | 340, 340 | 338, 320 |
| wall s7 | 13 / 0 / 13 | 0 / 0 / 0 | 337, 324 | 337, 337 | 337, 324 |
| wall s8 | 15 / 0 / 15 | 0 / 0 / 0 | 338, 323 | 323, 323 | 338, 323 |
| table s1 | 13 / 0 / 13 | 0 / 0 / 0 | 419, 406 | 403, 403 | 419, 406 |
| table s2 | 14 / 0 / 14 | 0 / 0 / 0 | 424, 410 | 404, 404 | 424, 410 |
| table s3 | 16 / 0 / 16 | 0 / 0 / 0 | 420, 404 | 408, 408 | 420, 404 |
| table s4 | 12 / 0 / 12 | 0 / 0 / 0 | 420, 408 | 414, 414 | 420, 408 |
| table s5 | 16 / 0 / 16 | 0 / 0 / 0 | 420, 404 | 410, 410 | 420, 404 |
| table s6 | 11 / 0 / 11 | 0 / 0 / 0 | 416, 405 | 406, 406 | 416, 405 |
| table s7 | 16 / 0 / 16 | 0 / 0 / 0 | 421, 405 | 407, 407 | 421, 405 |
| table s8 | 11 / 0 / 11 | 0 / 0 / 0 | 421, 410 | 408, 408 | 421, 410 |

Zero-area corners: 0 on every run. Runs A and B agree on every figure (a) and
(c) read, on every seed of every clip.

- **(a), GW half: held on the wall and table clips.** The candidate has no
  DETECT frame with corners null on any seed, where the control has 11 to 19
  on every seed. **Void on the static clip:** the control has none on any
  seed.
- **(a), GM half: void on every clip.** The control has no DETECT frame with
  mirrored corners on any seed of any clip, so the rule could not be seen
  acting there; the candidate's 0 is not reported as held. The registration
  foresaw it ("GM's half may well be void"). GM's part rests on C3's
  constructed case and C1's frame-by-frame fidelity, as registered.
- **(c): held on the wall and table clips.** The candidate's ok frames equal
  its frames with corners on every seed, TRACK frames included, where the
  control's differ on every seed. **Void on the static clip,** where the
  control's are already equal.
- **(b) and (d) are not registered on this schedule** (correction 2). Beside
  the figures, with no verdict: `stepMs`, A / candidate / B, 9.51 to 11.11
  ms on the static clip, 13.38 to 15.54 on the wall clip, 10.79 to 11.83 on
  the table clip; `trackTimeShare` 1.0000 on the static clip for every run,
  0.3687 to 0.4122 (A, = B) against 0.3721 to 0.4222 (candidate) on the wall
  clip, 0.7188 to 0.7413 (A, = B) against 0.7233 to 0.7447 (candidate) on
  the table clip. The counted frames differ between the control and the
  candidate on every hand-held seed (for example wall s1: 445 and 441), as
  correction 2 says they must: from the first refusal the two runs process
  different frames.

## Every check, exercised both ways

- **C3**, on a scratch `detection.ts`, restored in a `finally` and
  `git diff`-ed empty after: with the refusal removed, cases 2 to 5 fail (4
  failed, 2 passed); with a refusal of every fit, case 1 fails (1 failed, 5
  passed).
- **C4**, on a scratch `bench-stateless.mjs`, restored the same way: with the
  refusal removed, the reversed and mixed-w cases fail; with a refusal of
  every fit, the facing case fails.
- **The check copy's check J**, against the base checkout (where the rule is
  missing), with the base replay: exit 1, naming wall frame 298 and table
  frame 269 at seed 1, each an accepted `mixed-w` call with 5 inliers that
  reads DETECT.
- **The copy's C2 tests,** with the must-fire set changed to an accepted
  frame (`--break c2-must-fire`, frame 70 for 69): exit 1, "leave and return
  frame 70: not refused as not-facing".
- **The comparison:**
  - the base's GWM rows against themselves as a tip directory: literally,
    exit 1, and only C1's "no others" rule fires, on the 1,233 refused frames
    (a GWM row carries the wrapper's `"no-consensus"`, not `"not-facing"`);
    with `reason` set to `"not-facing"` on those frames, as the
    implementation writes it: exit 0, no differing frame;
  - one row's `state` changed outside the exception (`pinball-bench` seed 3,
    frame 501): exit 1, that frame reported and only it;
  - `inliers` and `reason` changed on an exception frame
    (`pinball-bench-table` seed 2, frame 1): exit 0, nothing reported;
  - a tip file whose SHA-256 is not its listed one, and a base stdout that is
    not the recorded one: each refused, exit 2;
  - C2's reading, after the review (below): a tip that refuses a `facing`
    base frame (wander frame 0, made `"not-facing"` with 11 inliers): exit 1,
    reported.
- **C0:** the base against itself, every clip, seed and sequence: exit 0,
  nothing reported. On `pinball-bench` seed 1: one component of `pose.t` on
  a TRACK frame (frame 88) reported, at its three paths (`pose`,
  `poseSelection.pose` and the chosen candidate share the array); 
  `poseSelection.margin` on a DETECT frame (frame 0) reported; `tracking` on
  a TRACK frame (frame 88) reported. Against the implementation: `tracking`
  changed on the frame after a refusal (frame 1) reports nothing; `state`
  changed on that frame reports it; a field of a refused frame (frame 0)
  reports nothing. A base stdout that is not the recorded one is fatal.
- **P's reader**, on a constructed root whose every export is the base
  replay's seed-1 scaled-step export of its clip: unfaulted, it reads the
  control's DETECT frames with corners null above 0 on both hand-held clips
  (19 on the wall clip, 13 on the table clip), so it can see what (a) reads;
  an export's seed changed, an export removed, the A and candidate runs
  swapped, the two heads equal, and an export with no counted frame: each
  refused, exit 2.

## The check copy's diff

`git diff --no-index -U0` between the probe and the copy has hunks at the
probe's lines 2, 29 to 87 (inside 28 to 92), 100, 176 to 177, 783 (an
insertion after it) and 785, 921, 974, 977 to 982, 1000 to 1001 and 1008
(inside 1000 to 1009), and 1091 to 1115 (insertions after 1091, 1095 and
1106, and lines 1110 and 1113 to 1115). The insertion after line 1091 is the
start of the range 1092 to 1115. Every other line, axis A, the self-test, the
inputs' hashes, the decoding and schedule, the wrapper with its fatal on
`det H = 0`, `run` and every other check, is byte-identical. The full diff is
in the PR.

## What differed from the registration, and what was seen out of order

- **Results read before a both-ways run.** The protocol has new checking code
  exercised both ways before its results are read. The check copy's and the
  comparison's results (C1, C2) were read first and their both-ways runs made
  after; each behaved as registered (above). C0's and P's both-ways runs were
  made before their results were read.
- **The comparison's self-test.** The registration expects the base's GWM
  rows, compared against themselves, to show no differing frame. Literally,
  C1's own "no others" rule makes them differ on every refused frame; both
  forms were run and are recorded above.
- **Seen before P's runs:** the base replay's seed-1 "device scaled step,
  sync" exports, the registration's "exists and was not seen" (Step 0 there),
  read as P's reader's known positive. Their figures: DETECT frames with
  corners null 0, 19 and 13, mirrored 0 on every clip. P's registered runs did
  not reuse them.
- **Review fixes to the scripts after their first runs:** the comparison's C2
  reading now requires a refused frame's base column outside `facing`, LOST
  and the fit's count (its stdout unchanged, `0a23203b…`); C0's `--break`
  cases skip a frame that is itself refused, and C0 checks the base stdouts'
  recorded hashes (its stdout unchanged, `9fc06c9d…`, rerun twice after the
  fix); P's reader refuses equal heads and an export with no counted frame
  (before P's runs).
- **Commit 1 folded into commit 2.** The tests were seen red alone, but a
  commit of them alone fails `npm run typecheck` (the test imports a name the
  index does not have yet).

## The independent review, and what it changed

Two read-only reviewers read the code diff (`45d3471..8b85d06`) before P's
runs: `nft-reviewer` (the package, against ADR-0001 and the registration's
treatment), and an independent reviewer briefed with the registration and
the sources but not this session's reasoning, who also read the four
scripts. Neither ran anything. Neither found a critical defect; both found
`targetSide` term for term the probe's `sideOf`, the refusal where the
registration puts it, and no reader of the reason missed.

- **Applied, in the scripts, before the results above were final:**
  - the comparison's C2 reading accepted any `"not-facing"` fate; it now
    requires the base column outside `facing`, LOST, and the fit's count
    (exercised both ways above; C2's stdout unchanged);
  - C0's `--break after-*` cases could land on a frame that is itself
    refused and pass vacuously; they now skip one; C0 now checks the base
    stdouts against the recorded hashes (rerun twice, stdout unchanged);
  - P's reader now refuses equal heads and an export with no counted frame
    (before P's runs).
- **Applied after P's runs, in a commit of test files only (`401503d`), so
  that the measured build stayed `8b85d06`:** both tracker arms of
  leave-and-return assert frames 67 and 69's reason `"not-facing"` and counts
  5 and 8, which only the state strings had pinned; the M2 arm lists its
  `"not-facing"` frames; a misplaced comment in the stateless test moved.
- **Applied in the CHANGELOG:** `DetectionSetup` gains a required `grid`.
- **Not applied, with the reason:**
  - the stateless mode builds `targetGrid` on every frame, where
    `detectTarget` reads one prepared once: 50 numbers a frame, the same
    classification; changing a served file after the criteria ran would
    change what they measured. A follow-up if the stateless timings ever
    need it;
  - `targetSide`'s comment does not say that a non-finite `det H` with
    one-signed `w` reads `"reversed"` (and is refused), as in the probe: a
    comment in `src/`, which would change the build after the measurement;
  - commit `4e8d54f` alone fails `npm test` on the three strings `8b85d06`
    updates, by the maintainer's ruling that they change in their own commit;
    the PR merges with a merge commit, and the pair is green.
