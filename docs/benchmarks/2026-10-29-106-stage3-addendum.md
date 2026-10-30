# #106, Stage 3 addendum: the registered criteria run against the implementation (2026-10-29)

**An addendum to
[`2026-10-29-106-stage3-registration.md`](./2026-10-29-106-stage3-registration.md),
under its "What a failed criterion means": the results of C0 to C4 and of
each part of P, read on Part 3's implementation, with the commands, the
figures and one verdict each.** The registration is not edited. Part 3 is
[#106](https://github.com/webarkit/webarkit/issues/106)'s implementation of
the pose filter: the `poseFilter` option of `NftTracker` and
`packages/nft-tracker/src/pose/pose_filter.ts`. Its basis is the
registration's merge into `dev`, `12ebed3` (#198), and the probe it rests on,
[`2026-10-29-106-stage1-pose-filter-probe.md`](./2026-10-29-106-stage1-pose-filter-probe.md)
(#197, `0665a96`).

**Every criterion held. No part of P is void or refuted.**

| criterion                                          | verdict  | the figure it is read on                                                                       |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| the registered paths' digests                      | equal    | rest and settle, registered against the probe's: equal                                         |
| the `DEFAULT_` constants                           | equal    | 1, 10, 1, 0.1, 1                                                                               |
| C0, off is off                                     | **held** | 722 results, no field differs from `12ebed3`; `npm test` passes; no existing test file changed |
| C1, the output is always a rotation                | **held** | largest ‖R̂ᵀR̂ − I‖\_F 2.27e-14, \|det R̂ − 1\| 1.78e-15, over 3,828 + 319 poses                 |
| C2, it forgets on loss                             | **held** | every pass-through frame's `pose` is its `poseSelection.pose`; timestamp runs within 2.78e-17  |
| C3, deterministic for a given clock                | **held** | equal digests twice, a different one on i·16.5, the same under throwing clock stubs            |
| C4, fidelity to the probe                          | **held** | (a) 1.11e-16, (b) 1.11e-16, (c) 0 of 3,828 frames not identical                               |
| P1, steadiness at rest                             | **held** | ratio 0.1568 (≤ 0.25); `e` difference −0.0004 px (within 0.02)                                 |
| P2, bounded lag at constant velocity               | **held** | last-frame `e` 0.6824, 0.6821, 0.6806 px against `B(v)` 1.5957, 2.1417, 2.7065                |
| P3, settling                                       | **held** | a crossing after 1 frame (≤ 15)                                                                |
| P4, the rotation layer on `wander`                 | **held** | 0.4789 px (≤ 0.5): the probe's row, so not a prediction                                        |

## Step 0: provenance

- **Ref:** `feat/106-pose-filter`, branched from `origin/dev` at
  **`12ebed3a2cb9e13e2017f10d432635cf53410425`** (#198's merge), after
  `git fetch origin`. Node v24.21.0, the pin; Windows 11. The session ran on
  Claude Opus 5.5, with the advisor (Fable 5.1) consulted at the two points
  the brief named.
- **The implementation's commit:** `1f48231`, whose `packages/` tree is
  `b3f1eb10f4e35cdea029148574354d74ff8683bb`: `f704a97`, the implementation,
  with the review's fixes (a tracker-level test that a `"LOST"` result
  reaches the filter, and doc comments). The check ran on that tree, built
  with `npm run build` from it. The script refuses a tracked file under
  `packages/`, or the target, that differs from the commit; it cannot see
  ignored build outputs (`dist/`, `node_modules/`), whose hashes Step 0
  prints instead. The commits after it change nothing under `packages/`,
  so the tree is the same at this branch's tip.
- **The check also ran at `f704a97`**, before the review's fixes, twice:
  identical stdouts, SHA-256
  `3d9aae6350d1dd56647b5e59299981532c4af295061e394cef8cc40106666f99`. They
  differ from the stdout below on two lines of Step 0 only, `tracker.ts`'s
  hash and the `packages/` tree, and every figure is the same.
- **C0's base:** a second worktree, detached at `12ebed3`, `npm install` then
  `npm run build`, passed as `--base`. The script refuses a base at another
  commit, or without `cv-backend-jsfeatnext/dist/index.js`; it does not
  check that the base is clean or its build fresh.
- **Seen before the check ran:** the registration, the probe's record and
  stdout figures it cites, and the implementation's own unit tests. No
  figure of the derived pair on the registered sequences existed before the
  check's first run.

## The commands

At the implementation's commit, with the base checkout beside it:

    npm run build
    node docs/benchmarks/2026-10-29-106-stage3-check.mjs --base <checkout of 12ebed3, built>
    npm test
    git diff --diff-filter=MD 12ebed3 1f48231 -- packages/*/test examples/test

- **The check's stdout, run twice** (the check as committed in `74795c6`,
  on `1f48231`'s `packages/` tree, `b3f1eb10`): both 99 lines, SHA-256
  `e79fd9bf6442fba27dcdf0c9528a13bfc658e6b9f66cf398b3f89c3b5b505547`, equal.
  Two earlier forms of the check printed the same figures: its first run,
  at `f704a97`, before two lines of its output were reworded (the setting's
  label, and a frame index printed as `-1` beside a difference of 0); and
  the form the independent review read, run twice on the same tree (94 lines,
  SHA-256 `2e45b5e938f828ea3a517be2dde87d51186e333f549197cf48ceab6f6f87317e`),
  from which the revised check's stdout differs only by the three checks it
  adds (the copy's ranges, the comparator on a `NaN`, and ruling B).
- **`npm test`:** passes. Before (at `12ebed3`) and after (at `1f48231`):
  `cv-backend-jsfeatnext` 37 and 37; `cv-backend-spec` 27 and 27;
  `nft-tracker` 842 passed and 1 skipped, then 879 passed and 1 skipped (the
  37 tests of the two new files); `examples/` 559 and 559.
- **The `git diff --diff-filter=MD` command prints nothing.** The glob must
  reach git expanded by the shell, as the registration writes it, unquoted:
  quoted, `'packages/*/test'` is a git pathspec that matches no file below
  those directories, so the command prints nothing whatever changed. Both
  ways, unquoted: the same pathspec lists the two added test files under
  `--diff-filter=A`, and `805f1f5..12ebed3`, across #130's move of the
  ground-truth modules out of `test/`, prints the modified test files.

## The check copy

The check holds a copy of the probe's scratch filter as the registration's
"How each is read, as commands" requires, and checks it itself, in Step 0:
the probe's lines 88 to 97, 125 to 433 (with `so3Log` in its `acos` form),
513 to 523 and 1006 to 1010, read from `0665a96` with `git show`, are each
found in the check's own source as one contiguous block of text, line
endings aside (a substring search, not tied to line boundaries); both
ways, lines 125 to 433 with `Math.acos(c)` replaced by an `atan2` form are
not. A diff of the probe script against the copy with zero lines of
context, its hunks mapped to the probe's line numbers, touches none of
those lines either. The diff itself is in the PR.

The check repeats `run`'s loop where the timestamps are not `i · 33`, with
one `withSeededRandom(SEED)` around the whole loop, as `run` itself does
(`tracker_sequences.ts`, `run`). The registration's C2 says "around every
`process` call"; the loop follows `run`, which that wording describes, and
is checked to reproduce `run` field for field at `i · 33` before any of its
results is read.

## Before any criterion

- **The registered paths are the probe's.** The digest over every frame's
  width, height, bytes and truth `H`: rest path
  `dced2286309a4574d58e9784873d80bab1186db303b8d78e7b3a8185e7cd2d0c` and
  settle path
  `1137a65904c1ad12d80d0e4ecf9aec4e38647f229e42a32c3c2000def7aaac31`, each
  equal to the probe's definitions' (lines 513 to 523). Both ways: the
  probe's rest path with frame 30's shift moved by 1 px gives
  `387b61f0…`, a different digest.
- **The `DEFAULT_` constants are the derived values**, 1, 10, 1, 0.1 and
  1, and `DEFAULT_POSE_FILTER` is a frozen `{ mode: "off" }`; checked before
  any run.
- **The unfiltered states** are the probe's: rest `DT×59`, settle
  `L×13D×24T×43`, `wander` `DT×39`, `leaveAndReturn` `DT×38L×28DLD×24T×13`,
  `velocityStep` 2 to 4 `DT×14`, 5 and 6 `DT×4D×10`.

## C0, off is off: held

- On the nine sequences and paths, both arms (`poseFilter` absent, and
  `{ mode: "off" }`) against `run` at `12ebed3` with no options: **722
  results compared, no field differs** at any level, leaves by `Object.is`.
- **`pose` is `poseSelection.pose`**, the same object, on all 638 posed
  results of both arms.
- `npm test` passes, and no test file existing at `12ebed3` is modified or
  deleted (above).
- Both ways: a base result with `pose.t[0]` changed is reported (at
  `.pose.t[0]`, and at the two places that share the object,
  `.poseSelection.pose` and the chosen candidate); one with
  `poseSelection.margin` changed is reported there alone; and a result whose
  `pose` is a copy of `poseSelection.pose` is reported by the identity check.

## C1, the output is always a rotation: held

- The joint grid's twelve settings on the nine: **3,828 poses**, largest
  ‖R̂ᵀR̂ − I‖\_F **2.27e-14**, largest |det R̂ − 1| **1.78e-15**, the probe's
  figures over the same count (bound 1e-9).
- The derived pair on the nine: 319 poses, the same two largest values.
- Both ways: the copy's `"elementwise"` variant on `wander` at
  `ONE_SETTING`: 2.44e-3 and 1.77e-3, beyond the bound.

## C2, it forgets on loss: held

- `leaveAndReturn` at the derived pair: frame 67 (`"DETECT"`, the first
  posed frame after the loss) and frame 93 (the first `"TRACK"` after it):
  `pose` is `poseSelection.pose`, the same object.
- **Every frame the filter passes through**, computed by the check from the
  results by the rule as ruled: 87 posed frames on the nine, each `pose`
  identical to its `poseSelection.pose`. Resets by cause: **not `"TRACK"`
  119**, `pose.good` false 0, timestamp not increasing 0: the probe's 119,
  every one "not `"TRACK"`".
- **The cross-reset timestamp case**, on `wander` through `run`'s loop
  repeated (first checked to reproduce `run` at `i · 33`, every field, with
  the filter absent and at the derived pair): with frame 1's timestamp
  repeated (0 ms) and reversed (−33 ms), frames 1 and 2 pass through, and
  every frame agrees with the copy on the same stream within **2.78e-17**
  in `R` and 0 in `t`. Every field other than `timestampMs` and `pose`
  equals the run at `i · 33`, as the registration expected. Both ways: the
  copy's `"forget-time"` variant filters frame 2 (0.2963 and 0.2571 px from
  the unfiltered pose).
- **`pose.good === false`**, on `wander`'s results through the module with
  frame 20's set to `false`: frames 20 and 21 pass through, output `===`
  input, and every frame agrees with the copy within 2.78e-17. Both ways:
  the unchanged stream filters both frames (1.5631 and 1.4366 px from their
  input).
- Both ways: the copy's `"no-reset"` variant at `ONE_SETTING` is
  **3,650.07 px** from the unfiltered pose at frame 67, the probe's figure.

## C3, deterministic for a given clock: held

- `wander` at the derived pair through `NftTracker`: two runs on `i · 33`
  give the same digest, `1532fd1f…`; a run on `i · 16.5` gives another,
  `77a7d878…`; and a run with `performance.now` and `Date.now` replaced by
  throwing stubs, from the tracker's construction to its last `process`
  call, completes and gives the first digest.
- Both ways: the copy's `"clock"` variant gives two different digests, and
  throws under the stubs.

## C4, fidelity to the probe: held

- **(a) The joint grid, through the tracker:** largest |ΔR| **1.11e-16**
  (`wander`, frame 35, at rotation (1 Hz, beta 1)), largest |Δt| **0**,
  against the bound 1e-9. `t` is computed by the same operations on both
  sides, as the registration expected.
- **(b) The per-layer sweeps, through the module:** the translation sweep,
  0 and 0; the rotation sweep, |ΔR| 1.11e-16 and |Δt| 0.
- **(c) The tracker runs the module:** 3,828 frames compared, **0 not
  identical** under `Object.is`.
- Both ways: each comparison of the copy against itself reads 0; the
  tracker at (1 Hz, 10, 0.01) against the copy at (1 Hz, 100, 0.1): |ΔR|
  1.58e-2, |Δt| 10.1; the module against the copy one `beta` step away,
  translation |Δt| 10.1, rotation |ΔR| 1.58e-2; (c) with the module at
  `beta R` 100 against the tracker at 10: 232 frames reported.
- **The comparator reads a `NaN` as beyond any bound**: a difference that
  is `NaN` counts as infinite, so a `NaN` component on either side cannot
  pass as within 1e-9. Both ways: a pose against itself reads 0, and
  against a copy with one component of `t` set to `NaN`, on either side,
  infinite. (In its first form a `NaN` difference never became the
  recorded largest, since `NaN > m` is false, so the earlier finite largest
  stood and was compared with the bound; the independent review found it,
  and a `NaN`-aware rerun printed the same figures.)
- **The one allowed source of difference**, the `atan2` form of `so3Log`
  against the copy's `acos`, moves `R` by 1.11e-16 at most: rounding, as
  the registration's estimate said, about seven orders below the bound.
- **What C4 cannot see, and the review covers instead:** the module's
  `so3Log` reads the axis from the symmetric part above `π − 1e-3`, the
  angle at which the probe's `so3Log` exits rather than read a step. No
  registered sequence comes near it (the copy would have exited), so C4 is
  blind to that branch. It is the module's one departure from the copy's
  lines 224 to 395 besides the `atan2` form, and is tested at unit scale,
  both ways, at and near π
  (`packages/nft-tracker/test/pose/pose_filter.test.ts`).

## Ruling B, read on every filter-on run

The registration's unfiltered reference for P is "the same run's
`poseSelection.pose`". The check reads it, and the unfiltered errors, on
the run with the filter absent; the two are the same only if turning the
filter on changes nothing but `pose`, which no criterion reads by itself
(C0 compares the absent and off arms). So the check reads it: on all 117
filter-on runs, the derived pair and the twelve joint settings on the
nine, **every field but `pose` equals the absent run's**, `poseSelection`
included. Both ways: a result with `H[0]` moved by 1e-12 is reported.

## P, the prediction for the derived pair

Read through `NftTracker` with `poseFilter: { mode: "one-euro" }` and every
parameter omitted, the unfiltered reference being the same run's
`poseSelection.pose`, equal field for field to the absent run's (above).
Margins are bound minus figure; none is a tie. P3 is read in whole frames,
so its tie rule has no case.

- **P1, steadiness at rest: held.** On the rest path's 58 readable rest
  pairs: `d` median filtered **0.0195 px**, unfiltered 0.1245, **ratio
  0.1568** against 0.25 (margin 0.0932); `e` median filtered 0.3219 px,
  unfiltered 0.3223, **difference −0.0004 px**, within 0.02 (margin
  0.0196). Not void. The basis points read 0.142 and 0.224, and −0.0003 and
  +0.0042 px: the pair falls between them on the ratio.
- **P2, bounded lag at constant velocity: held.** Last moving frame, 14:

  | v px/frame | `P_u(v)` px | `B(v)` px | `e` filtered px | unfiltered | margin |
  | ---------- | ----------- | --------- | --------------- | ---------- | ------ |
  | 2          | 0.5957      | 1.5957    | 0.6824          | 0.5957     | 0.9133 |
  | 3          | 0.6417      | 2.1417    | 0.6821          | 0.4042     | 1.4596 |
  | 4          | 0.7065      | 2.7065    | 0.6806          | 0.2739     | 2.0258 |

  Not void at any velocity. The basis, `(1 Hz, 100, 0.1)`, read 0.74, 0.73
  and 0.69 px.
- **P3, settling: held.** On the settle path from frame 40: the filtered
  error first falls to or below the unfiltered at frame 41, **a lag of 1
  frame** against 15 (margin 14). `e` at frame 40: filtered 0.6340 px,
  unfiltered 0.4270; at frame 79: 0.2995 and 0.3123. Not void: the crossing
  is not at frame 40 itself. The basis points read 9 and 3 frames, and the
  translation sweep's `(1 Hz, 0.1)` 8: the pair settles sooner than any of
  them on this path. That is recorded, not explained.
- **P4, the rotation layer on `wander`: held, as its basis settles it.**
  Through the module, rotation (1 Hz, beta 10), translation passing
  through, over the 39 `"TRACK"` frames: `e` median 16.3985 px against
  15.9196, **difference 0.4789 px** against 0.5 (margin 0.0211), the
  probe's row. Not void. As the registration says, this part is not a
  prediction: C4 (b) makes the module's poses that row's.

## The reviews, and what they changed

Two reviewer subagents read the branch before the PR, briefed with the
registration and the sources but not this session's reasoning.

- **`nft-reviewer`, on the implementation** (`12ebed3..f704a97`): nothing
  critical. Important: a timestamp that jumps to `Infinity`, or a period
  that overflows or underflows, gives a `NaN` pose on an `ok` result,
  marked `good: true`; the reset rule catches `NaN` and a timestamp that
  does not increase, not these. It is the probe's arithmetic (script line
  367) and the registered rule; a guard would change the rule, so it is
  **documented, not fixed, and left to the maintainer** (the option's doc
  comment, `process`'s `timestampMs`, the README, the CHANGELOG). Minor,
  applied in `1f48231`: a tracker-level test that a `"LOST"` result
  reaches the filter (through `run`, a LOST is always followed by a DETECT,
  which resets anyway), killing a `process` that returns a LOST result
  before the filter; and `timestampMs`'s doc comment. Minor, not applied: a
  misspelt parameter key (`minCutoff`) takes its default silently, as an
  unknown key does for `conditioning`; the module test's element-wise
  "must fire" half is written in the test, not the module (C1 reads the
  copy's own variant).
- **An independent reviewer, on the check and this addendum** (at
  `1a2e355`): nothing critical; it reproduced the stdout's SHA-256 and
  every figure. Two important findings, both places where the check was
  weaker than the registration, and neither moving a figure on this data
  (its `NaN`-aware rerun printed the same figures): the pose comparator
  could not see a `NaN`, and P's unfiltered reference was read on the
  absent run with nothing checking it equals the filter-on run outside
  `pose`. Both are fixed in the check, each exercised both ways (above).
  Minor, applied: the copy's ranges are checked by the check itself rather
  than by an uncommitted script; the seeding wording of C2 against `run`;
  the clean-tree guard's reach; P3's tie rule; the CHANGELOG's wording of
  P4. The stdout's SHA-256 above is the revised check's. A second, narrow
  read by the same reviewer at `74795c6` confirmed the three added checks
  do what its findings asked, and found three wording points in this file,
  applied: the range check is a substring search; how a `NaN` escaped the
  first comparator; and which commit the revised check ran on. It also
  noted that the clean-tree guard does not reach `--base` (Step 0, above).

## What this addendum does not establish

The registration's list stands: nothing on the device, nothing on the
bench page or the exports, no rotation lag bound, not the mechanism behind
the sweeps' cancelling of `R` and `t` noise, nothing at `v ≥ 5` px/frame,
and no search between or beyond the grid's points. P3's lag of 1 frame is a
reading on one path, not a property of the pair.

## After `7ad93ae`: the maintainer's rulings on #199 (2026-10-30)

**What changed.** The maintainer ruled on the four points #199 put to him.
Points 1 (`so3Log`'s symmetric-part branch near π) and 3 (a parameter
given with `mode: "off"` refused) were accepted as they were. Points 2 and 4
changed the code, in `626db0a`:

- with `poseFilter` in `"one-euro"` mode, a `timestampMs` that is not
  finite is a contract violation: `process` throws a `RangeError` naming
  it, before the frame is processed. It is not a reset cause, so the
  registered reset rule is unchanged, and with the filter off nothing
  changes (C0). Two finite timestamps whose difference overflows or
  underflows stay documented, not guarded;
- a key the option does not read, inside `poseFilter` or its `rotation` or
  `translation` object, is refused by name. `conditioning` and the other
  options are unchanged.

Their tests are in `test/tracker_pose_filter.test.ts`, a file this branch
added; no test file existing at `12ebed3` is modified. The tests were seen
red first, 3 of 26, then green, each both ways; a guard moved after the
frame is processed fails the timestamp test.

**Why it cannot move a verdict, and the reading that shows it did not.**
Every run the check makes uses finite timestamps and only the option's
documented keys, so neither refusal fires on it. The check, run twice on
`626db0a`'s `packages/` tree `dfb51d27c445ac1f367fc14bf426b94d7afcfcbc`:

- both stdouts are 99 lines, SHA-256
  **`76ee2358f4b077513a083bd947d9ecd813ceccf74d5a7d7c4f765d33d274dfa3`**,
  equal;
- against the stdout above (`e79fd9bf…`) they differ on two lines of Step 0
  only, both hashes of what was read: line 11, `tracker.ts`'s SHA-256
  (`740bf54e…` to `10c283b5…`), and line 20, the `packages/` tree
  (`b3f1eb10…` to `dfb51d27…`);
- every other line is the same, so every figure and every verdict above
  stands.

**The gates at `626db0a`:** `npm run build`, `typecheck`, `format:check`,
`check:contract` and `check:page` (30 of 30) pass. `npm test` passes with
`nft-tracker` at 884 passed and 1 skipped (5 more than at `1f48231`), the
other packages unchanged. `git diff --diff-filter=MD 12ebed3 626db0a --
packages/*/test examples/test` prints nothing.

**Qodo's second review, as the maintainer ruled it (2026-10-30).** Two
findings changed the branch:
- At extreme finite parameters, `2π · cutoff · te` could overflow to
  Infinity, and One Euro's `α = r / (r + 1)` read `∞ / ∞`. `α` now takes its
  limit, 1, when `r` is not finite, so the filter follows its input on that
  frame. Every finite `r` keeps the probe's expression bit for bit. The
  test, at 1e308 on both layers and `dCutOff`, was seen red first
  (`066c02f`). The one `NaN` path left, a period that underflows to 0
  between increasing finite timestamps, stays documented, as ruled.
- The check now refuses a base checkout whose tracked inputs differ from
  its commit. In both trees, the built files it imports must be the ones
  that tree's build manifest recorded, and that manifest must be of the
  tree's commit and clean. Both refusals were exercised on the real base
  checkout, each restored after: a dirty `tracker.ts`, and an altered
  `dist/index.js` (`4ee3546`). That exercise found the check crashing in
  Step 0, its built-file list read before it was declared, and it was
  fixed before any recorded run (`f98c773`).

The check, run twice at `f98c773` (`packages/` tree
`948a225bda2df8018eb79c91dbd81ff5e367bc71`): both stdouts are 102 lines,
SHA-256 **`7b1be91e30829cadd5c0ac6344b52cd37b3b8fc2eb57366c3bf6652714a29d54`**,
equal. Against `76ee2358…` they differ in Step 0 only:
- lines 11 and 12, the SHA-256 of `tracker.ts` and `pose_filter.ts`;
- line 20, the `packages/` tree, with the base now also stated clean;
- three lines added after it: both trees' built-file hashes, which are
  identical, and the refusals' both-ways line.

No figure and no verdict moves. The gates pass at `f98c773`: build,
typecheck, `format:check`, `check:contract` and `check:page` (30 of 30), and
`npm test` with `nft-tracker` at 885 passed and 1 skipped. The bundle hash
is `8c0e0b9fff317e10605476e628686c51f04bf8d2773f0a6af46755203329d086`.
