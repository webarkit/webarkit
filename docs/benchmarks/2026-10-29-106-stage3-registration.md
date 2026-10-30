# #106, Stage 3: the pose filter's criteria, its derived parameters and the prediction for the derived pair, registered before the implementation (2026-10-29)

**Registered on 2026-10-29, before any implementation of the pose filter in
`packages/nft-tracker/src/`, under [the step protocol](./step-protocol.md),
Stage 3: "Criteria are registered in their own commit, before the
implementation, and that commit is cited by hash". Its basis is
[#197](https://github.com/webarkit/webarkit/pull/197)'s merge,
`0665a968c0f88310049775f80f0736d10fb22d35`, and the probe it merged,
[`2026-10-29-106-stage1-pose-filter-probe.md`](./2026-10-29-106-stage1-pose-filter-probe.md)
with its script. The filter's form, its reset rule and the derivation are
[the maintainer's ruling of 2026-10-29 on #106](https://github.com/webarkit/webarkit/issues/106#issuecomment-6504531676)
and
[its addendum, "before Part 2's registration"](https://github.com/webarkit/webarkit/issues/106#issuecomment-6504628708).
This is Part 2 of three: Part 1 was the probe, Part 3 implements the filter
against what is registered here. Nothing here is measured on the
implementation, and the derived pair was not run anywhere before this
registration (Step 0). The results go in an addendum beside this
registration (below, "What a failed criterion means").**

The addendum's point 2, quoted in part (cut where marked):

> **2. The pair is not a point of the joint grid.** The joint grid steps the
> two betas together, `(beta R, beta t)` ∈ {(0, 0), (1, 0.001), (10, 0.01),
> (100, 0.1)}, so `(10, 0.1)` was not measured jointly. […] **Ruling:** the
> joint px criteria (steadiness ratio ≤ 0.25 with the bias within 0.02 px,
> `B(v)` at 2, 3 and 4, settling ≤ 15 frames) become **Part 2's registered
> prediction for the derived pair, read on the implementation in Part 3.**

Figures cited from the probe are its record's, at `0665a96`, by section;
lines of its script are lines of
`docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.mjs` at `0665a96`.

## Step 0: provenance, and the brief's check

- **Ref:** `docs/106-stage3-registration`, branched from `origin/dev` at
  **`0665a968c0f88310049775f80f0736d10fb22d35`** (#197's merge), after
  `git fetch origin`. Node v24.21.0, the pin; Windows 11. The session ran on
  Claude Opus 5.5, with no advisor, as the brief asked.
- **The probe, rerun.** `npm ci && npm run build`, then the probe's command
  twice at `0665a96`: both stdouts 231 lines, SHA-256
  `768375b4ca443e6aeda1611d4df2efe7b01d111d72011940f83e9be34382ff59`, the
  value the record states ("The command, and its stdout's SHA-256"). Every
  figure of the probe this registration reads was read from that stdout,
  and agrees with the record's tables.
- **The brief's citations held** at that SHA: the protocol's Stage 3; the
  probe record's sections "The method", "The checks, each exercised both
  ways", "The trade, over the grid", "Settling on the probe's settle path",
  "The per-layer sweeps", "Stage 2: the declared covariates", "Stage 3:
  drafts, pending the maintainer's ruling" and "What this probe does not
  establish"; the ruling and its addendum on #106; `f853004` as the commit
  that added the cross-reset timestamp case (its message, item 2);
  `ConditioningOptions` and `DEFAULT_CONDITIONING` at `tracker.ts` lines
  329 to 343; `frameAt` and `run` in `ground-truth/tracker_sequences.ts`
  (lines 75 to 90 and 129 to 148), `run` taking `NftTrackerOptions`.
- **Rulings are cited by the comment's own lists:** "decision N" is the
  ruling's "Decisions taken before the probe", and "the ruling on open
  question N" its "Rulings on the probe's open questions".
- **Three corrections to the brief, ruled by the maintainer on 2026-10-29
  before this file was written.** The rulings were given to the session
  that wrote this registration; this file is where they are recorded.
  - **A. The check copy keeps the probe's `so3Log`, byte-identical.** The
    brief listed `so3Log` among the lines of the check copy that may
    differ. That was wrong: the copy is the measured filter, so its
    `so3Log` (script lines 195 to 203, the `acos` form) stays as the probe
    has it, and C4's one allowed source of difference, the
    implementation's `atan2` form, is measured against the filter that was
    measured. The copy's "may differ" list is the header, the imports,
    Step 0 and `main` with its output only. (`runLength`, script lines
    1012 to 1021, formats the output's state strings and nothing else; it
    is counted as output below.)
  - **B. With the filter on, `pose` is the filtered pose, and
    `poseSelection` is unchanged.** `poseSelection.pose` stays the
    selected, unfiltered pose, so the unfiltered pose remains available on
    every result. The brief's treatment did not say which; the result type
    documents "`pose` is `poseSelection.pose`" (`tracker.ts` lines 547 to
    548), which filtering `pose` alone would make false. Part 3 updates two
    doc comments to say so: `pose`'s (lines 539 to 543, "Decomposition of
    {@link H}", true only with the filter off) and `poseSelection`'s (lines
    547 to 548, "`pose` is `poseSelection.pose`", true only with the filter off or
    on a frame the filter passes through). With the filter off, `pose` is
    `poseSelection.pose` exactly as today (C0). C4's copy takes
    `poseSelection.pose` as its input, which is what the probe filtered
    (the poses `run` returned), and compares its output with the
    implementation's `pose`.
  - **C. The single-layer readings go through the filter module, not the
    tracker option.** The ruled option has no layer-off: in `"one-euro"`
    mode an omitted parameter takes the derived value, so both layers are
    always on, and no parameter value makes a layer pass through (an
    infinite `minCutOff` gives `α = ∞ / ∞`, script line 226). The brief
    read two things with one layer off: C4 on the per-layer sweeps, and
    P's `wander` part with the translation off. Widening the option to
    serve a measurement would change the API the maintainer registered, so
    the option keeps the addendum's shape, and those two readings are made
    on the filter module Part 3 writes in `src/pose/` (below, "The
    treatment"). C4 gains a part that ties the module to the tracker.
- **Three notes, accepted by the maintainer as proposed:**
  1. The probe's draft of the rotation criterion cites "3,024 poses"
     (record, "Stage 3: drafts", the bullet _Rotation_). That is the count
     at `3b275a1`; at `0665a96` the rotation check covers **3,828** (the
     record's "Changes from `3b275a1`" and "The checks"). C1's basis below
     uses 3,828.
  2. Of P's two basis points, `(1 Hz, 10, 0.01)` **fails** `B(v)` (last
     frame 2.62, 3.08, 3.44 px against 1.60, 2.14, 2.71). The `B(v)` part
     of P rests on `(1 Hz, 100, 0.1)` alone, the joint point whose
     translation setting the derived pair shares.
  3. **The derived pair was not run anywhere before this registration**:
     not on the scratch filter, not on any implementation. Under C4 a run
     of the scratch filter at the pair would be a measurement of P.
- **Seen before registration:** the probe's stdout above, at its recorded
  hash, and nothing else. No figure of the pair, and no figure of any
  implementation, exists yet.

## The treatment, as code will express it

- **The option.** `NftTrackerOptions` gains `poseFilter`, in the
  addendum's shape:
  - `{ mode: "off" }`, the default, as `conditioning` defaults to
    `DEFAULT_CONDITIONING`;
  - `{ mode: "one-euro", rotation: { minCutOff, beta }, translation: { minCutOff, beta }, dCutOff }`.
    In `"one-euro"` mode an omitted parameter takes the derived value
    below, exported as a `DEFAULT_` constant, so the registered values are
    the code's defaults when the filter is on (the addendum, point 3).
  - The option states that `timestampMs` is read as **milliseconds** when
    the filter is on, and that the cutoffs are in **Hz**. The conversion
    (`te = Δt / 1000`, seconds) is made in one place, and documented in the
    option and in the package README (the ruling on open question 1).
- **The filter** is written in `packages/nft-tracker/src/pose/`, not
  imported (decision 1: ADR-0001 point 2 allows one runtime dependency). Its two layers are the probe's scratch filter as ruled
  ("The method", _The scratch filter_; script lines 224 to 252 and 316 to
  395):
  - **the core**, a vector One Euro in `oneeurofilter-ts`'s parameter names
    and per-index form: for a step `δ = x − x̂ₖ₋₁` over `te` seconds, per
    component `dx = δ / te`, `dx̂ = ema(α(te, dCutOff), dx, dx̂ₖ₋₁)`,
    `cutoff = minCutOff + beta · |dx̂|`, `x̂ₖ = x̂ₖ₋₁ + α(te, cutoff) · δ`,
    `α(te, f) = r / (r + 1)`, `r = 2π f te`;
  - **the rotation**: the step `ω = log(R̂ₖ₋₁ᵀ Rₖ)`, a 3-vector in the
    tangent space, `α` per component of `ω` (the ruling on open question
    2: the loss of rotation invariance this implies is a known limitation,
    and the body-frame derivative state is accepted as a second-order
    effect at these speeds); `R̂ₖ = R̂ₖ₋₁ · exp(ω̂)`; `so3Log` read via
    `atan2(‖v‖ / 2, (tr − 1) / 2)` with `v` the antisymmetric part (the
    ruling on open question 4; the probe's `acos` form is not carried
    over);
  - **the translation**: `t − t̂ₖ₋₁`, per component, with its own
    `(minCutOff, beta)`; `dCutOff` shared by both layers.
- **The reset rule, as ruled** (the ruling on open question 2; script
  lines 328 to 365):
  - a result that is not `"TRACK"` with a pose resets, and passes its pose
    through unfiltered; a `"DETECT"` frame does not seed the filter, the
    next `"TRACK"` does;
  - `pose.good === false` resets;
  - a timestamp that does not exceed the previous frame's input timestamp
    resets, across reset frames too (`f853004`): the last input timestamp
    is kept apart from the seeding timestamp, and the rule is judged
    against it on every frame; it does not hold the previous value;
  - the frame after a reset initialises the filter with its own pose,
    unfiltered.
- **What it touches on a result** (ruling B): `pose` only. `H`, the state,
  the counts, `poseSelection` (whose `pose` stays the unfiltered selected
  pose) and every other field are what the tracker computes without the
  filter, which feeds nothing back. On a frame the filter passes through
  (a reset frame, and the seeding frame after it), `pose` is
  `poseSelection.pose`, the same object, as ruling B's doc wording states;
  the probe's scratch filter copied the pose there (`copyPose`, script
  lines 356 and 364), which is equal component by component.
- **The module** (ruling C). The filter is a module in `src/pose/` that the
  tracker calls and nothing else does. It is exported from that module for
  tests and checks, **not** from the package's index, and not reachable
  through `NftTrackerOptions`. Only there can a layer be set to pass
  through (its part of the pose passing unchanged, as the probe's
  `minCutOff: null` does, script lines 317 to 318 and 373 to 390), which
  is how the per-layer sweeps and P's `wander` part are read. Its input is
  the tracker's results with their `poseSelection.pose`, and their
  `timestampMs`.
- **With the filter off, nothing in the tracker's output changes.** That is
  C0.

## The registered paths

The ruling on open question 3: the probe's rest path and settle path are registered as
paths beside the sequences in `ground-truth/`, exactly as the probe defined
them, run with the sequences' `SEED`.

- **The rest path**, `REST_FRAMES = 60` (script line 129): `velocityStep`'s
  rest pose `{ scale: 0.45, angle: 0, shift: [0, 0] }` (line 513) held for
  60 frames.
- **The settle path**, `SETTLE_SLIDE_FRAMES = 40`, `SETTLE_REST_FRAMES = 40`
  (lines 147 to 148): `leaveAndReturn`'s return slide, `260 · (1 − smoothstep(i / 40))`
  px for `i < 40`, then 0, at `scale 0.45`, `angle 0` (lines 515 to 523),
  80 frames.
- Both are run as the probe ran them (lines 524 to 526 and 534): through
  `run(cv, K, target, path, n)`, so each frame is `frameAt(path(i), i)`,
  with its own noise, blur and exposure, under `withSeededRandom(SEED)`
  with `SEED = 20260925`, timestamps `i · 33`.
- **Part 3 adds them** to `packages/nft-tracker/ground-truth/tracker_sequences.ts`.
  The names are Part 3's.
- **They must equal the probe's, frame by frame.** For each path, a
  SHA-256 over every frame in order, each frame contributing the
  `GrayImage`'s `width`, `height` and `data` bytes and the nine components
  of its truth `H` (as `toString`), computed once from the paths Part 3
  adds to `tracker_sequences.ts` and once from the probe's own definitions
  carried in the check copy (lines 513 to 523, kept byte-identical, below):
  the two digests are equal. Unequal digests are a stop, before any
  criterion is read: the registered paths are then not the probe's.
  - Both digests render through the same `frameAt`, so this compares the
    path definitions. A change to `frameAt` itself is C0's to catch, since
    C0 renders each side through its own commit's `frameAt`.
  - _Both ways:_ the probe's rest path with one frame's shift moved by
    1 px gives a different digest.

The registered sequences and paths, for every criterion below, are nine:
`wander` (40 frames), `leaveAndReturn` (106), `velocityStep(v)` for `v` in
2, 3, 4, 5, 6 (15 each), the rest path (60) and the settle path (80), with
the shipped target, `K = intrinsics(270, 360)`, as the probe ran them
("The method", _The sequences_).

## The derived parameters, with their derivation

The rule is the probe's ("Stage 3: drafts", _How the parameters would be
derived_), each layer from its own sweep, as the addendum applies it
(point 1). Recomputed in this session from the rerun's stdout ("The
per-layer sweeps"); every value agrees with the addendum.

**Translation** (the translation sweep, rotation off; the record's table
"The translation layer, rotation off"):

1. _The largest `minCutOff` whose step ratio at rest, in model units, is at
   most 0.25._ 0.5 Hz reads 0.088, 0.089, 0.099, 0.143; 1 Hz reads 0.176,
   0.177, 0.182, 0.244; 3 Hz reads 0.388, 0.388, 0.390, 0.404, none at or
   below 0.25. **1 Hz.**
2. _At 1 Hz, the smallest `beta t` whose last-frame errors meet `B(v)` at
   2, 3 and 4 px/frame and whose settle-path crossing is within 15 frames_
   (`B` = 1.60, 2.14, 2.71 px; every 1 Hz row crosses within the window, so
   none is excluded before the choice):

   | minCutOff Hz | beta t | rest step ratio, model units | v = 2 last e (B) | v = 3 last e (B) | v = 4 last e (B) | settling lag | meets |
   | ------------ | ------ | ---------------------------- | ---------------- | ---------------- | ---------------- | ------------ | ----- |
   | 1            | 0      | 0.176                        | 8.15 (1.60)      | 12.34 (2.14)     | 16.34 (2.71)     | 23           | no    |
   | 1            | 0.001  | 0.177                        | 6.59 (1.60)      | 9.13 (2.14)      | 11.10 (2.71)     | 23           | no    |
   | 1            | 0.01   | 0.182                        | 2.70 (1.60)      | 3.23 (2.14)      | 3.50 (2.71)      | 17           | no    |
   | 1            | 0.1    | 0.244                        | 0.83 (1.60)      | 0.86 (2.14)      | 0.74 (2.71)      | 8            | yes   |

   **`beta t` = 0.1 per model unit/s.**

**Rotation** (the rotation sweep, translation off; the record's table "The
rotation layer, translation off"):

1. _The largest `minCutOff` whose step ratio at rest, in degrees, is at
   most 0.25._ 0.5 Hz reads 0.070, 0.071, 0.079, 0.154; 1 Hz reads 0.132,
   0.133, 0.141, 0.211; 3 Hz reads 0.324, 0.325, 0.329, 0.375, none at or
   below 0.25. **1 Hz.**
2. _At 1 Hz, the smallest `beta R` whose `wander` median error is at most
   0.5 px above the unfiltered median_ (15.9196 px, against a non-rigid
   truth):

   | minCutOff Hz | beta R | rest step ratio, degrees | wander e median − unfiltered px | meets |
   | ------------ | ------ | ------------------------ | ------------------------------- | ----- |
   | 1            | 0      | 0.132                    | 2.8096                          | no    |
   | 1            | 1      | 0.133                    | 2.0124                          | no    |
   | 1            | 10     | 0.141                    | 0.4789                          | yes   |
   | 1            | 100    | 0.211                    | −0.0126                         | yes   |

   **`beta R` = 10 per rad/s.** The draft's void case for this reading, a
   difference at or below zero at `beta 0` (it would show the layer not
   lagging on the one sequence with rotation), does not apply: at 1 Hz,
   `beta 0` reads 2.8096 px.

**`dCutOff` = 1 Hz**, shared: the probe did not vary it and found no reason
to (the draft's last paragraph).

**The derived pair:** rotation `minCutOff` 1 Hz, `beta` 10 per rad/s;
translation `minCutOff` 1 Hz, `beta` 0.1 per model unit/s; `dCutOff` 1 Hz.

**Three near things, stated as such** (the addendum, point 4):

- the translation's step ratio at the chosen setting, **0.244 against
  0.25**, clears the bound by 0.006, which the probe's record calls
  "within a grid point's noise";
- the rotation's `wander` difference at the chosen setting, **0.4789
  against 0.5**, clears it by 0.0211 px;
- **`beta t` 0.1 is the grid's largest value.** `B(v)` is met only there, so
  the derived value is set by the grid's edge, not by the data: a smaller
  value between 0.01 and 0.1 might also meet it, and was not measured.

None of the three changes a value: the grid's `minCutOff` values are 0.5,
1 and 3 Hz (the record says "a factor of 3"; the first step is a factor of
2) and its `beta` values step by 10 after the first, from 0, a derived value is stated as its grid point,
and a finer or wider grid is a new probe, not a change to these values (the
ruling's second note; the addendum, point 4).

**The rule's step 3 has no reading in the probe.** The pair `(10, 0.1)` is
not a point of the joint grid, which steps the two betas together. Per the
addendum, point 2, the joint px criteria become the prediction P below,
read on the implementation in Part 3. If the implementation's pair fails a
joint criterion, that is recorded and the derivation stops: it does not
search, and the values do not change (the ruling's second note).

## C0 to C4: what the implementation must reproduce (basis: the probe)

These are checks of the implementation, not predictions: where the probe
measured an outcome, it is cited as the basis, as Stage 3 requires. Each is
exercised both ways in Part 3: the named broken variant must fail it.

### C0, off is off

- **The check.** At the implementation's commit, every result of `run` on
  the nine registered sequences and paths, in two arms (`poseFilter`
  absent; `poseFilter: { mode: "off" }`), equals the result of the same
  path through `run` and `NftTracker` at **the registration's merge
  commit** (this file's merge into `dev`; not this file's basis,
  `0665a96`), with no options. That commit's `tracker_sequences.ts` has no
  rest or settle path, so there those two paths are the check copy's (the
  probe's lines 513 to 523), passed to that commit's `run`.
  - **Fields compared:** every field of every result, recursively: `ok`,
    `state`, `quality`, `timestampMs`, `numMatches`, `numInliers`, `H`,
    `pose` (`R`, `t`, `good`), `poseSelection` (`pose`, `candidates`,
    `chosen`, `outcome`, `ambiguous`, `margin`, `rejected`),
    `conditioning`, `sceneKeypoints`, `reason` (on `"LOST"` results),
    `trackLoss`, `trackLossConditioning`, `tracking`, `timings`,
    `needsDetection`, `detectionUse`, `detectionLatencyMs`. The two
    results have the same keys at every level; arrays and typed arrays
    are compared element by element; every leaf with `Object.is`.
  - **And `pose` is `poseSelection.pose`** on every `ok` result in both
    arms: the same object, as `tracker.ts` lines 934 to 935 and 1002 to
    1003 make it today (ruling B).
  - **And the existing test suite passes unchanged:** `npm test` passes at
    the implementation's commit, and no test file that exists at the
    registration's merge commit is modified or deleted
    (`git diff --diff-filter=MD <merge> <tip> -- packages/*/test examples/test`
    prints nothing).
- _Basis:_ the ruling's decision 2 (off by default) and the probe's
  method: the filter runs after the tracker and feeds nothing back, so the
  tracker's `H`, states and poses are the same filtered or not.
- _Refuted by_ any field that differs on any frame, in either arm; a
  result present in one run only; a `pose` that is not `poseSelection.pose`;
  a failing test; or a modified or deleted existing test file.
- _Both ways:_ the comparison run on one merge-commit result against a copy with
  one leaf changed (a component of `pose.t`, then `poseSelection.margin`)
  reports that leaf; and the `pose`-identity check, given a result whose
  `pose` is a copy of `poseSelection.pose`, reports it.

### C1, the output is always a rotation

- **The check.** Over every result with a pose, through `NftTracker` with
  `poseFilter` on, on the nine sequences and paths, at the derived pair
  and at every one of the joint grid's twelve settings:
  `‖R̂ᵀR̂ − I‖_F ≤ 1e-9` and `|det R̂ − 1| ≤ 1e-9`.
- _Basis:_ the probe's rotation check: largest `‖R̂ᵀR̂ − I‖_F` 2.27e-14 and
  largest `|det R̂ − 1|` 1.78e-15 over **3,828** filtered poses: the joint
  grid's twelve settings on the nine sequences and paths, 12 × 319 posed
  frames (script lines 615 to 624; the sweeps are not in it) — not the
  draft's 3,024, 12 × 252 before the settle path (Step 0, note 1).
- _Refuted by_ any pose above either bound.
- _Both ways:_ the check copy's `"elementwise"` variant (script line 375)
  on `wander` at `ONE_SETTING` must exceed a bound (the probe: 2.44e-3 and
  1.77e-3).

### C2, it forgets on loss

- **The check.** Through `NftTracker` with `poseFilter` on at the derived
  pair:
  - on `leaveAndReturn`, **frame 67** (the first posed frame after the
    loss, a `"DETECT"`) and **frame 93** (the first `"TRACK"` after it):
    `pose` is `poseSelection.pose` (the same object, so equal under
    `Object.is` on all twelve components of `R` and `t`);
  - **so does every frame the filter passes through**, on all nine
    sequences and paths: every frame the reset rule flags, and the
    seeding frame after it. The check computes the flags itself from the
    results (state, `ok`, `pose.good`, timestamps) by the rule as ruled,
    and prints their count by cause (the probe: 119, every one "not
    `"TRACK"`", at any setting, since the flags do not depend on it);
  - **the cross-reset timestamp case** (`f853004`): on `wander`, which
    begins `D, T`, two further runs with frame 1's timestamp set to frame
    0's (repeated) and to frame 0's minus 33 (reversed), every other
    frame at `i · 33`. Frame 0, a `"DETECT"`, resets the filter, so frame
    1 passes through under the correct rule and under a rule that forgets
    the timestamp on reset alike: frame 1 cannot tell them apart. **Frame
    2 can.** Under the correct rule frame 1 resets, so frame 2 is the
    seeding frame and passes through; under the forgetting rule frame 1
    seeds, and frame 2 is filtered. So, in each run, frame 1's and frame
    2's `pose` is their `poseSelection.pose`; and every frame of the run
    agrees with the copy's correct filter on the same stream within
    `1e-9` per component, as in C4.
  - These runs, and C3's halved spacing, cannot go through `run`, which
    passes `i · 33` (`tracker_sequences.ts` line 143). The check repeats
    `run`'s loop (lines 137 to 145): a fresh `NftTracker`,
    `withSeededRandom(SEED)` around every `process` call, each frame
    `frameAt(path(i), i)`, with the timestamp from the run's own list.
    `tracker_sequences.ts` gains nothing beyond the two paths. On this path
    the tracker reads the timestamp only to echo it (it is also the
    reference for `detectionLatencyMs` when a detection is handed in,
    which no run here does), so those runs' other fields are as at
    `i · 33`.
- _Basis:_ the probe's forgetting check (frames 67 and 93 equal the
  unfiltered pose bit for bit) and its cross-reset check (each caught,
  count 1).
- _Refuted by_ a pass-through frame whose `pose` is not its
  `poseSelection.pose`, or, on the timestamp runs, any frame beyond `1e-9`
  from the copy.
- _Both ways:_ the copy's `"no-reset"` variant must differ at frame 67 (the
  probe: 3,650.07 px); and on both timestamp runs the copy's
  `"forget-time"` variant must differ from the unfiltered pose at frame 2.
- **`pose.good === false`** fires on no frame of the registered sequences
  and paths (the probe: 0 everywhere), so it is checked on a stream made
  for it, through the module: `wander`'s results with frame 20's
  `pose.good` set to `false` (a `"TRACK"` frame with a seeded filter
  behind it). Frames 20 and 21 pass through, their output equal to their
  input under `Object.is`, and every frame agrees with the copy on the same
  stream within `1e-9`. _Both ways:_ the unchanged stream's output differs
  from its input at frame 20 and at frame 21, both filtered frames there;
  the unchanged stream is what a filter that ignored `pose.good` would
  see.

### C3, deterministic for a given clock

- **The check.** Through `NftTracker` with `poseFilter` on at the derived
  pair, on `wander`, a digest of every result's pose in the probe's form
  (`posesDigest`, script lines 414 to 415):
  - two runs on `i · 33` give equal digests;
  - a run on `i · 16.5` gives a different digest;
  - a run with `performance.now` and `Date.now` replaced by throwing stubs
    (the probe's `withoutClocks`, lines 397 to 411) around the whole run,
    from the tracker's construction to its last `process` call, completes
    without a throw and gives the first run's digest. (At `0665a96`,
    nothing in `packages/nft-tracker/src`, `ground-truth/`,
    `packages/cv-backend-jsfeatnext/src` or its built `dist/index.js`, or
    jsfeatNext's bundle `node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs`
    reads either clock: a search finds only a doc comment, `tracker.ts`
    line 432.)
  - The runs on other timestamps repeat `run`'s loop (C2, above).
- _Basis:_ the probe's determinism and clock-free checks.
- _Refuted by_ unequal digests on the same timestamps, equal digests on
  the halved spacing, or a throw or a different digest under the stubs.
- _Both ways:_ the copy's `"clock"` variant gives two different digests,
  and throws under the stubs.

### C4, fidelity to the probe

- **The check**, in three parts. The copy's input is each result with its
  `pose` replaced by `poseSelection.pose` (ruling B), with the results'
  `timestampMs`: what the probe filtered.
  - **(a) The joint grid, through the tracker.** On the nine sequences and
    paths, at each of the twelve joint settings: `NftTracker`'s `pose`
    with `poseFilter` on, against the copy's `filterPoses` at the same
    setting.
  - **(b) The per-layer sweeps, through the module** (ruling C). On the
    nine sequences and paths, at each of the translation sweep's twelve
    settings (rotation passing through) and the rotation sweep's twelve
    (translation passing through): the module, fed the same input,
    against the copy at the same setting.
  - In (a) and (b), on every frame: both poses are present or both
    `null`, and every component of `R` and `t` differs by at most
    **`1e-9`**, absolute.
  - **(c) The tracker runs the module and nothing else.** On the twelve
    joint settings and the nine sequences and paths, the module with both
    layers on, fed `poseSelection.pose`, gives poses identical to
    `NftTracker`'s `pose` at the same setting: `Object.is` on every
    component. So what (b) reads on the module is the code the tracker
    runs.
- **The only allowed source of difference** in (a) and (b) is the
  implementation's `atan2` form of `so3Log` against the copy's `acos` form
  (ruling A). C4 detects a departure only when it exceeds `1e-9`: a
  reordered operation moves the poses by rounding alone, far below `1e-9`,
  and passes it. That the module's core and pose layer are otherwise the probe's
  operations, in its order, is not a check here: it is for review, on a
  diff of the module against the copy's lines 224 to 395, which Part 3's
  PR carries.
- **Why `1e-9` is enough for it**, from the step sizes the probe reports.
  An estimate, not a measurement: C4 is the measurement.
  - The two forms read the same antisymmetric part `v` and differ only in
    the angle `θ`, hence only in the scale `k = θ / (2 sin θ)` of
    `ω = k v`. `acos` loses precision for a small step: a rounding error
    `δc` in `(tr − 1) / 2` gives `δθ ≈ δc / sin θ`, about `δc / θ`. But
    `k` is flat there, `dk/dθ ≈ θ / 6`, so
    `δk ≈ (θ / 6) · (δc / θ) = δc / 6`, of the order of `1e-17`, whatever
    the step's size. The two forms' `ω` differ at the level of rounding,
    relative to `ω`.
  - The steps are far from the one place this fails, `θ` near `π` (where
    the copy's `so3Log` exits, line 200): the raw rotation step at rest is
    0.1356° median and 0.3419° max, 2.4e-3 and 6.0e-3 rad ("Noise at
    rest", the rest path), and the largest speed on the moving frames is
    0.8604 rad/s ("The pose's speed", `wander`), 0.028 rad over 33 ms.
    The record's own note puts the steps at "about 2e-3 rad". These are
    raw frame-to-frame steps; the filter's `ω = log(R̂ₖ₋₁ᵀ Rₖ)` is taken
    against the lagging estimate and is larger at low cutoffs. The
    argument does not depend on it: `δk ≈ δc / 6` holds at any small
    `θ`, and a first-order lag of about `speed · τ`, at most
    `0.8604 rad/s × 0.318 s ≈ 0.27 rad` at the grid's lowest cutoff
    (`τ = 1 / (2π · 0.5 Hz)`), keeps `θ` far from `π`. An estimate, from the
    record's figures.
  - The difference enters the derivative state too: `δω / te`, through
    `beta R ≤ 100`, moves the cutoff by about `1e-14` Hz, and `α` by a
    relative `1e-14` or less. Per frame, then, the forms move `R̂` by
    under `1e-15`; summed over the longest run, 106 frames, under
    `1e-13`. The probe's rotation check reads the rounding these poses
    carry at 2.27e-14.
  - `t` is filtered by its own layer, which `so3Log` does not enter: on
    `t`, the implementation and the copy compute the same operations, and
    `1e-9` is not loosened for it.
  - So `1e-9`, the bound C1 uses, sits about four orders of magnitude
    above the expected gap, and far below any figure the derivation reads
    (the smallest margin there is 0.006, a ratio).
- **C4 ties the implementation to what was measured, so the derived
  values carry over:** they were derived on the scratch filter's sweeps,
  and (b) and (c) make the module's sweeps, and the tracker's filter,
  that filter to within `1e-9`.
- _Refuted by_ any frame present in one run only, any component beyond
  `1e-9` in (a) or (b), or any component not `Object.is`-equal in (c).
- _Both ways:_ each comparison run on the copy against itself reports a
  largest difference of 0; the copy at a setting one grid step away
  (`beta` the adjacent value of its list) against the implementation must
  exceed `1e-9`; and (c) with the module at a different `beta R` than the
  tracker must report a frame.

## P: the prediction for the derived pair

The addendum, point 2: the joint px criteria, read on the implementation at
the derived pair, a setting they were not read from. The pair is read
through `NftTracker` with `poseFilter: { mode: "one-euro" }` and every
parameter omitted, so that it reads the `DEFAULT_` constants; the check
first asserts that those constants equal the derived values (1, 10, 1,
0.1, 1), and exits before printing P if one does not (a stop, of C4's
kind). The unfiltered reference is the same run's `poseSelection.pose`,
which C0 makes today's `pose`.

**Basis: the two nearest joint points, `(1 Hz, 10, 0.01)` and
`(1 Hz, 100, 0.1)`.** The derived pair shares its rotation setting with
the first and its translation setting with the second. Their rows in the
probe's stdout (unfiltered at rest: `e` median 0.3223 px, `d` median
0.1245 px):

| table | minCutOff Hz | beta R | beta t | figures |
| ----- | ------------ | ------ | ------ | ------- |
| At rest (rest path) | 1 | 10  | 0.01 | `e` median 0.3220, max 0.3926; `d` median 0.0177, max 0.0437 |
| At rest (rest path) | 1 | 100 | 0.1  | `e` median 0.3265, max 0.4399; `d` median 0.0279, max 0.0933 |
| Velocity steps: lag, peak, last (unfiltered peak) | 1 | 10  | 0.01 | v = 2: ≥ 10, 3.48, 2.62 (0.60); v = 3: ≥ 10, 4.52, 3.08 (0.64); v = 4: ≥ 10, 5.45, 3.44 (0.71) |
| Velocity steps: lag, peak, last (unfiltered peak) | 1 | 100 | 0.1  | v = 2: ≥ 10, 1.40, 0.74 (0.60); v = 3: ≥ 10, 1.66, 0.73 (0.64); v = 4: ≥ 10, 1.98, 0.69 (0.71) |
| Settle path: lag, e at 40, at 79 | 1 | 10  | 0.01 | 9, 2.1515, 0.3026 |
| Settle path: lag, e at 40, at 79 | 1 | 100 | 0.1  | 3, 0.8240, 0.2899 |

The four parts, each with its bound, what refutes it and what makes it
void. **Void means the filter cannot be seen acting on what the part
reads**, in each part's own form below; where the probe's draft stated a
void case for that same reading, it is the draft's (P4 says why its
draft's case does not carry over). A void part is never reported as held or
refuted (the protocol: "a zero produced by an instrument that cannot
respond is never recorded as 'no effect'").

- **P1, steadiness at rest.** On the rest path's readable rest pairs
  (frames at rest whose result and predecessor are both `"TRACK"`; the
  probe: 58): the median frame-to-frame change `d` of the filtered poses,
  divided by the unfiltered median, **at most 0.25**; and the median error
  `e` of the filtered poses **within 0.02 px** of the unfiltered median,
  on either side (the ruled "within").
  - _Basis:_ ratios 0.142 and 0.224 at the two points (`0.0177 / 0.1245`,
    `0.0279 / 0.1245`); `e` differences −0.0003 and +0.0042 px.
  - _Refuted upward_ by a ratio above 0.25. _Refuted_ by an `e` difference
    above +0.02 px (the filter adds bias at rest). The bias half is what
    refutes a filter that lowers `d` by freezing, which the ratio alone
    would pass (the draft). The draft named the rise; the ruled wording is
    "within 0.02 px", so a fall below −0.02 px is outside it too, and is
    recorded as refuted.
  - _Void_ if the filtered pose equals the unfiltered on every component
    of every frame read (the ratio would then read 1). The draft states no
    void case for this criterion.
- **P2, bounded lag at constant velocity.** On `velocityStep(v)` for `v`
  in 2, 3 and 4 px/frame: the filtered error on the last moving frame,
  frame 14, **at most `B(v) = P_u(v) + 0.5 · v` px**, with `P_u(v)` the
  unfiltered peak error over that run's moving frames, 5 to 14, read on
  the same run (the probe: 0.60, 0.64, 0.71 px, so `B` = 1.60, 2.14,
  2.71).
  - _Basis:_ `(1 Hz, 100, 0.1)` alone: 0.74, 0.73, 0.69 px. The other
    point, `(1 Hz, 10, 0.01)`, fails at all three (2.62, 3.08, 3.44 px), as
    does the translation sweep's `(1 Hz, 0.01)` (2.70, 3.23, 3.50); the
    translation sweep's `(1 Hz, 0.1)`, the pair's translation setting with
    the rotation off, reads 0.83, 0.86, 0.74 (Step 0, note 2).
  - _Refuted upward_ by a last-frame error above `B(v)` at any of the
    three velocities.
  - _Void_, the draft's case, at a velocity whose last-frame error equals
    the unfiltered one on the same frame: that would show the filter
    inactive (frames 5 to 14 are `"TRACK"` on these runs, so a
    pass-through is not an explanation).
- **P3, settling.** On the settle path, from its first rest frame, 40: the
  frames until the filtered error first falls to or below the unfiltered
  error on the same frame, **at most 15**, admitted at `≤`.
  - _Basis:_ 9 and 3 frames at the two points; 8 on the translation
    sweep's `(1 Hz, 0.1)`.
  - _Refuted upward_ by a crossing after frame 55, or by none within the
    40 rest frames (a setting that does not cross has no measured lag).
  - _Void_, the draft's case, on a crossing at frame 40 itself (a lag of
    0): there would be no lag to settle.
- **P4, the rotation layer on `wander`.** Read on the module (ruling C):
  rotation `(1 Hz, beta 10)`, translation passing through, `dCutOff`
  1 Hz, fed `wander`'s results with `poseSelection.pose`. The median `e`
  over `wander`'s 39 `"TRACK"` frames, minus the unfiltered median, **at
  most 0.5 px**.
  - **This part is not a prediction.** Its setting is a row of the
    probe's rotation sweep, 0.4789 px, and C4 (b) makes the module's poses
    that row's to within `1e-9` per component, which cannot move a median
    error by anything near the 0.0211 px margin. Its outcome is settled
    by the probe's measurement, which is its basis; it is read to confirm
    the implementation reproduces it, as Stage 3 requires such a part to
    say.
  - _Refuted upward_ by a difference above 0.5 px.
  - _Void_ if the module's rotations equal the unfiltered ones on every
    frame read (the difference would read 0). The draft's void case, a
    difference at or below zero at `beta 0`, reads a sweep and has no
    meaning on this single setting.

The bounds are inclusive: "at most" and "within" admit the bound itself.
Ratios and px are printed to four decimals, lags in whole frames; a figure
that clears a bound by less than its own last significant digit is
reported as a tie, not a clearance (the protocol, "A figure is stated with
its margin").

## How each is read, as commands

**At the implementation's commit**, built from a clean tree, with a second
checkout of the registration's merge commit, also built, for C0:

    npm ci && npm run build
    node docs/benchmarks/<date>-106-stage3-check.mjs --base <checkout of the registration's merge commit>
    npm test
    git diff --diff-filter=MD <merge> <tip> -- packages/*/test examples/test

The last two are C0's second and third parts; the check script prints
everything else.

Part 3 writes the check, `docs/benchmarks/<date>-106-stage3-check.mjs`. It
drives `NftTracker` with `poseFilter` on through `run`, or through `run`'s
loop repeated where the timestamps are not `i · 33` (C2), on the nine
registered sequences and paths, the TypeScript modules bundled by esbuild
as the probe bundles them (script lines 457 to 501), and it holds a copy of
the probe's scratch filter.

**The copy.** Lines of the probe script at `0665a96`:

- **kept byte-identical:**
  - lines 88 to 97: `HERE`, `ROOT`, `sha256`, `out`, `say`, `fatal`, `fix`
    (`so3Log` calls `fatal`);
  - lines 125 to 433: the probe's constants (the grid's lists, `D_CUTOFF`,
    `ONE_SETTING`, `REST_FRAMES`, the settle path's two constants, the
    proposals, the tolerances), the matrix algebra with **`so3Log` in its
    `acos` form, lines 195 to 203** (ruling A), the core, the reference
    form, the pose layer `filterPoses` with its variants, `withoutClocks`,
    `copyPose`, `samePose`, `posesDigest`, and the statistics;
  - lines 513 to 523: the probe's rest and settle paths, against which the
    registered paths' digests are checked;
  - lines 1006 to 1010: `settings()`, the joint grid.
- **may differ:** the header, lines 1 to 79 (the license block's file name
  and the doc comment, which name the copy and this registration); the
  imports, lines 81 to 86; Step 0, lines 99 to 123 (what is hashed is the
  implementation's commit's); and `main` with its output, lines 435 to 512
  and 524 to 1004, and `runLength`, lines 1012 to 1021, which only formats
  the output's state strings. Blank lines between these ranges are free.
- In Part 3's PR, a diff between the probe script and the copy shows
  changes inside the "may differ" ranges only, and the PR carries that
  diff.

**What it prints, and which figures each criterion reads:**

- before any criterion: the two registered paths' digests, theirs and the
  probe's, equal;
- **C0:** per sequence or path and per arm, the results compared and every
  differing field with both values, or none; the `pose` identity count;
  and, separately, the `npm test` result and the `git diff --diff-filter=MD`
  output;
- **C1:** the number of poses checked, the largest `‖R̂ᵀR̂ − I‖_F` and
  `|det R̂ − 1|`, and the `"elementwise"` variant's;
- **C2:** frames 67 and 93 and every pass-through frame, with each's
  identity result; the flag counts by cause; on the two timestamp runs,
  frames 1 and 2 and the largest difference from the copy; on the
  `pose.good` stream, frames 20 and 21 and the largest difference from the
  copy; the broken variants' results;
- **C3:** the three digests' comparisons (the halved spacing's digest is
  printed; the clock variant's are not, since they would make the stdout
  differ between runs);
- **C4:** per part, the largest absolute difference per component kind
  (`R`, `t`) and the setting and frame where it occurs; (c)'s count of
  frames compared and of frames not identical; the broken cases;
- **P:** the `DEFAULT_` constants' check; P1's `d` and `e` medians,
  filtered and unfiltered, the ratio and the `e` difference; P2's
  `P_u(v)`, `B(v)` and last-frame error per velocity; P3's lag and the
  errors at frames 40 and 79; P4's two medians and their difference; and
  per part the margin to its bound and the void test's result.

Every check runs before any figure is printed, as the probe's do, and a
failure exits with its reason. The stdout is deterministic, with no clock,
path or timing, and is run twice: the two stdouts' SHA-256 are equal, and
the addendum states it.

## What a failed criterion means

A criterion that fails is never edited. Its result goes in an addendum
beside this registration, and an addendum may be added more than once;
each one stands (Stage 3). The results of C0 to C4 and of each part of P go
in such an addendum, with the command, the figures and one verdict each:
**held**, **refuted**, or, for a part of P, **void**.

- **C0 to C4 refuted:** Part 3 stops before the PR. The implementation is
  not the treatment registered here, or not the filter that was measured.
- **The registered paths' digests unequal, or the `DEFAULT_` constants not
  the derived values:** a stop of the same kind.
- **P refuted:** recorded, and the PR proceeds. The derived values do not
  change: changing them is a new probe.
- **A part of P void:** recorded as void, never as held, and the PR
  proceeds.

## What this registration does not register

The probe's list ("What this probe does not establish"), carried over:

- **Nothing on the device.** #106's device claim stands withdrawn (its
  comment of 2026-10-16): no exported value is a function of the pose.
- **Nothing on the bench page or the exports**, which do not read the pose.
  Neither is touched by Part 3 unless a caller turns the filter on, and
  none does here.
- **No rotation lag bound.** No committed sequence or registered path is a
  rigid path with rotation; `wander`'s rotation, 0.26 rad/s median, is read
  against a non-rigid truth (the ruling on open question 5). The bounded-lag part of P
  covers translation only, and P4 is a difference above `wander`'s floor,
  not a lag bound.
- **Not the mechanism** behind the sweeps' finding that `R` and `t` noise
  cancel in projection, which the probe states as a conjecture.
- **Nothing at `v ≥ 5` px/frame**, where every moving frame re-detects and
  the filter never acts.
- **No search.** Nothing between the grid's points, nothing beyond its
  edge at `beta t` 0.1, and no other `dCutOff`.

## The independent review, and what it changed

A reviewer subagent, briefed with the protocol, the brief's requirements,
the maintainer's rulings and the sources, but not this session's
reasoning, read the draft at `0665a96` before any commit. It made one
critical, five important and seventeen minor findings. As applied:

- **Critical: C2's timestamp case could not fail.** Frame 0 is a
  `"DETECT"`, so frame 1 passes through under the correct rule and under
  the forgetting one alike, and the draft read frame 1 and a count the
  check computes itself. Frame 2 is now the frame read, with a comparison
  against the copy on the same stream, and the forgetting variant must
  differ there.
- **Important:**
  - Runs on timestamps other than `i · 33` cannot go through `run`; the
    check now repeats its loop, and `tracker_sequences.ts` gains nothing
    but the two paths.
  - C1's basis said 3,828 included the sweeps; it is the joint grid alone,
    12 × 319.
  - The `pose.good === false` cause had no check, firing nowhere on the
    sequences; a stream made for it is now read through the module.
  - P's void cases were narrower than the drafts', which the ruling made
    the basis; P2 and P3 now take the drafts' forms, and P1 and P4 say why
    they do not.
  - C4 claimed to detect a reordered operation, which `1e-9` cannot see;
    it now says so, and names the review that covers it.
- **Minor:** the copy's "may differ" list against ruling A (`runLength`);
  `frameAt`'s and `run`'s lines; the attribution of the freezing argument
  in P1; an unsourced phrase on the 0.244 margin, replaced by the record's;
  the registration's merge commit named apart from its basis, with where
  that commit's rest and settle paths come from; "the adjacent value" in
  C4's broken case; the path digest exercised both ways, and what it
  compares; the step size the `1e-9` argument rests on; jsfeatNext's
  bundle added to the clock search; the tracker's other use of the
  timestamp; what a void part of P leads to; the pass-through frame's
  `pose` as the same object; `npm test` and the diff command among the
  commands; the rotation step's void clause; `tracker.ts` 547 to 548 for
  the quote; the grid's first `minCutOff` step, a factor of 2; one naming
  for the ruling's lists.
- **A second read** of the revised draft by the same reviewer confirmed
  the fixes, the frame-2 logic traced through the probe's `filterPoses` for
  both timestamp streams, and found six minor points, all applied: a
  second citation of `tracker.ts` 547 to 548; the `beta` lists' first
  step; an unsourced `1e-13`; the void sentence against P4; the
  `pose.good` case's both-ways reading at each frame; and `run`'s loop
  named where the check drives the tracker.
- **Not applied:** none of its findings was rejected. Each factual claim
  the fixes rest on was checked against its source before it was applied:
  `frameAt` ends at line 90, `run` passes `i * 33` at line 143, both built
  bundles hold 0 clock reads, and 3,828 is 12 × 319 posed frames.

## Constraints kept

One file, this one. No code, package, lockfile, tsconfig, target or
fixture touched; no export committed. No CHANGELOG line: a registration, no
behaviour change. No issue commented on, edited or closed.
