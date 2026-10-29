# #106, Stage 1 probe: One Euro filtering of the pose, the rotation in its tangent space, on the synthetic sequences (2026-10-29)

**A Stage 1 probe under [the step protocol](./step-protocol.md), run on
2026-10-29: a scratch One Euro filter applied, after the tracker, to the poses
the shipped tracker returns on the ground-truth sequences of
`packages/nft-tracker/ground-truth/tracker_sequences.ts`, seeded. Not campaign
data; never reportable as a round. It measures and registers nothing. The
filter's form, its reset rule and its parameters are the maintainer's
decisions; the Stage 3 texts at the end are drafts pending his ruling, and no
setting is recommended here. No code under `packages/*/src`, `examples/` or
`scripts/` changes: this PR adds this document and its script.**

[#106](https://github.com/webarkit/webarkit/issues/106) asked for six things
on 2026-10-02; its comment of 2026-10-16 withdrew the first, steadiness on the
device, as unmeasurable on this instrument, not refuted: `jitterPx` is read
from `H`, and the filter moves `R` and `t` (the plan,
[`README.md`](./README.md), "What M4's device half measures, and which steps
reach it (2026-10-15)", the paragraph "#105 and #106: device claims withdrawn
as unmeasurable on this instrument, not refuted"; and "M4's closing criterion,
the campaign milestone's, One Euro's move to M5, and the window's end point
(2026-10-19)", entry 3). What stands is the synthetic half: bounded lag on
known motion, the output always a rotation, forgetting on loss, parameters
registered with their derivation, determinism for a given clock. This probe is
Part 1 of three: Part 2 registers Stage 3's criteria in their own commit, and
Part 3 implements the filter against them.

The computation is
[`2026-10-29-106-stage1-pose-filter-probe.mjs`](./2026-10-29-106-stage1-pose-filter-probe.mjs).
Every figure below is in its stdout. It writes no file.

    npm ci && npm run build
    node docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.mjs

Two runs gave byte-identical stdout; its SHA-256 is in the last section. The
stdout prints no clock, path or timing, so that this is a property of the
computation and not of the day.

## Step 0: provenance, and the brief's check

**Read at.** `origin/dev` at `8b9e840e488c69243a58b2f6e826d38e3dea0c2a`, fetched
on 2026-10-29; the worktree matched it. Node v24.21.0, the `.nvmrc` pin. What
the script hashes and prints: the sequence module and its fixtures, the
metric and its helper, the three `src/` files of the pose path, the target,
and the two built modules that run RANSAC and the tracker's oracle (the
backend's `dist/index.js` and jsfeatNext's bundle). esbuild pulls the rest of
`packages/nft-tracker/src/` into the bundle transitively; those files are
pinned by the commit alone. Versions, as printed:
`@webarkit/nft-tracker 0.5.1; @webarkit/cv-backend-jsfeatnext 0.5.1; @webarkit/jsfeat-next 0.17.0`.

| File                                                             | SHA-256                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/nft-tracker/ground-truth/tracker_sequences.ts`         | `b3a1d87c1aaee1f186550eeb23c39a09b17adc6652280e762380dcfbdede432b` |
| `packages/nft-tracker/ground-truth/fixtures/seeded_rng.ts`       | `fb7883c55c47ec31140fc7fc75d0543f5f4b59909887872c9869da5b0d691f82` |
| `packages/nft-tracker/ground-truth/fixtures/warped_frames.ts`    | `0afb9e6dc0bbe7ebf1d9cf264926e837e6ad2bd8b94a4bee9d725afb3d886e97` |
| `packages/nft-tracker/ground-truth/fixtures/tracking_target.ts`  | `9407d82ec31bb4c4510a1b230062d3ed09994de69c4101f4f0f98bca1348209a` |
| `packages/nft-tracker/ground-truth/fixtures/pgm.ts`              | `523c80d9e4f6a1beec41e4fda9f289da1f2badc0fe83a2be9d5364ce5ca7befc` |
| `packages/nft-tracker/ground-truth/fixtures/pinball-target-640.pgm` | `1c82be7f22b00e04a9d878912955330e6f6a212f07da668f4ec7c94e760487e3` |
| `packages/nft-tracker/test/pose/pose_metric.ts`                  | `20de934df99ad63598daa2686ef24887ba76f298659aa89b800d05ceb41e5880` |
| `packages/nft-tracker/test/tracking/homography_helpers.ts`       | `5ca8ec905edc34438e653ad9ba630a60ead8e1e4c2b005d9c65cf4aeecb87898` |
| `packages/nft-tracker/src/tracker.ts`                            | `43aba73d15d127cf39aa5d76560957db93a38ec5248c438cb1bb5213b5908bbe` |
| `packages/nft-tracker/src/pose/select_pose.ts`                   | `b59d3abf139954589dc85dcc0e47cf74b342025d56a9f49db5be633f3331e3fc` |
| `packages/nft-tracker/src/pose/closed_form.ts`                   | `67785373d15cb183ad5bc78fe6154d891505a31756b238e8c1d408ef97e97f2e` |
| `examples/targets/pinball.wnft`                                  | `9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282` |
| `packages/cv-backend-jsfeatnext/dist/index.js`                   | `c90d4dfdc0eebcb085a4dbfc46c62cc4cd28618b55e7c9298a8bf3808f463649` |
| `node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs`         | `6181e6a9a6b2bea8286cd0a641a38e4bcbf0ab72e13ba531ed15613ba6def0ac` |

The five ground-truth fixtures and `tracker_sequences.ts` hash as
[`ground-truth/README.md`](../../packages/nft-tracker/ground-truth/README.md)
records them "as #130 left it". The target's hash is the one M4's campaign
recorded.

**The brief's citations and rulings, each checked against its source** (Stage
4's rule). Every one held; two notes are added where the source says more than
the brief.

1. The issue body's six items and the comment's withdrawal of the first:
   held, read from `gh api repos/webarkit/webarkit/issues/106` and
   `.../comments` (the comment is dated 2026-10-16 and says "Withdrawn on
   2026-10-15").
2. The two plan sections, by title and paragraph: held
   (`docs/benchmarks/README.md` lines 5372 and 5813 at `8b9e840`; the paragraph
   at line 5391, entry 3 at line 5999).
3. Ruling 1, that a second runtime dependency is forbidden: held, ADR-0001
   point 2, "The only runtime dependency is `@webarkit/cv-backend-spec`".
   `@webarkit/oneeurofilter-ts` is at 0.2.1 in `webarkit/OneEuroFilter-ts`,
   read for the next item only.
4. Ruling 2, the option's shape: held, `ConditioningOptions` is `tracker.ts`
   lines 329–332, its doc comment from line 304, `DEFAULT_CONDITIONING`
   `{ mode: "off" }` at line 343.
5. Design ruling 1, the derivative against the previous _filtered_ value as
   `oneeurofilter-ts` takes it: held. `src/OneEuroFilter.ts`, `filter`:
   `dx[i] = (x[i] - xPrev[i]) / te`, then `xHat[i] = a * x[i] + (1 - a) * xPrev[i]`,
   then `this.xPrev.set(xHat)`, so `xPrev` is the filtered value. The scratch
   core takes the step `δ = x − x̂ₖ₋₁` and computes `x̂ₖ = x̂ₖ₋₁ + α δ`, which is
   the same recurrence; the script checks the two numerically (the
   transcription check below). Its parameter names are `minCutOff`, `beta`,
   `dCutOff`. _Note:_ the library's constructor takes `minCutOff` and `beta`
   only and sets `dCutOff = 0.001` with the comment "period in milliseconds,
   so default to 0.001 = 1Hz": it expects millisecond timestamps and cutoffs
   per millisecond. That bears on open question 1 below. _Note:_ on
   `te <= 0` it returns `xPrev` and keeps its state; the brief's ruling 4
   resets instead. The probe follows the brief; open question 2 records the
   difference.
6. Design ruling 3, time: held. `tracker.ts` line 708, "`timestampMs` The
   frame's timestamp, in the caller's units"; `tracker_sequences.ts` `run`
   passes `i * 33`; `examples/bench-nft.html` line 1303 sets
   `t0 = performance.now()` and passes it, milliseconds.
7. Design ruling 4, the three reset causes: `pose.good` can be `false` only
   from the closed form's degenerate branch (`closed_form.ts`, the `EPS` test,
   `good: false`), which `selectPose` falls back to when IPPE is degenerate or
   has no candidate in front (`select_pose.ts`). How often each cause fires
   is in the first table.
8. The metric: held, `pose_metric.ts` `poseError` reads `R` and `t` (quoted
   under "Responsiveness"); §2 of the IPPE acceptance defines it so.
9. Seeds: `SEED = 20260925`, `withSeededRandom(SEED, …)` around all the
   `tracker.process` calls of a run, a fresh mulberry32 generator per run. On #24:
   it is closed; the contract has `RansacOptions.rng`
   (`cv-backend-spec/src/cv_backend.ts` line 250), but the tracker has no
   `rng` option — `tracker.ts` lines 136–137: "`detectTarget` does not pass
   one yet, so there is no `rng` option here yet either" — so the runner
   cannot inject one and the global swap stays. The runner is not changed.
10. The model: the brief names Opus 5.5 with no advisor. This session ran on
    Claude Fable 5.1 with no advisor, and said so in its first message. That
    is the one thing that differed from the brief.

## The method

**The sequences.** `wander` (40 frames), `leaveAndReturn` (106) and
`velocityStep(v)` for `v` in 2, 3, 4, 5, 6 (15 each), run unchanged through
`run` with the shipped target, `K = intrinsics(270, 360)`, timestamps `i · 33`,
as `shippedWander`, `shippedLeaveAndReturn` and `shippedVelocitySteps` run
them. One probe path besides, `rest`: `velocityStep`'s rest pose
(`scale 0.45, angle 0, shift [0, 0]`) held for 60 frames, rendered by
`frameAt`, so that each frame has its own noise (σ = 2), blur and exposure
drift. Why 60: the sequences proper hold 33 readable rest pairs, no readable
run of them longer than 9 frames, and 15 of them are the velocity runs' frames 2 to 4,
right after their detection, where the filter is still warming up; 60 frames
at 33 ms is 2 s, over twelve time
constants of a 1 Hz cutoff (`τ = 1 / 2π f ≈ 0.16 s`). It is a probe path, not a
fixture; registering it is Part 2's question. The TypeScript modules are
bundled by esbuild into a temporary directory and imported from there, each
file's `import.meta.url` pinned so that the fixtures and the target resolve;
nothing is reimplemented.

**The metric.** #105's, imported from `test/pose/pose_metric.ts`:
`e(P; H*) = poseError(K, pose, H*, G)`, the RMS over the 5 × 5 grid `G` of the
target of the gap between the pose's projection and `H*`'s, frame px; and
`d(P₁, P₂) = poseDistance(K, P₁, P₂, G)` between two poses. The metric is a
function of `R` and `t` by its own lines:

    /** `π(K · (R · (x, y, 0) + t))`, frame px. */
    export function projectPose(K: Mat3, R: Mat3, t: Vec3, x: number, y: number): [number, number] {
        const X = R[0] * x + R[1] * y + t[0];
        const Y = R[3] * x + R[4] * y + t[1];
        const Z = R[6] * x + R[7] * y + t[2];
        …
    export function poseError(K, pose, H, points) {
        …
            const [ax, ay] = projectPose(K, pose.R, pose.t, points[2 * i], points[2 * i + 1]);
            const [bx, by] = projectH(H, points[2 * i], points[2 * i + 1]);
            s += (ax - bx) ** 2 + (ay - by) ** 2;

**The scratch filter**, as the script has it. Two layers.

- _The core_, a vector One Euro (Casiez, Roussel and Vogel, "1 € Filter", CHI
  2012): `minCutOff` in Hz, `beta` per unit of the signal's derivative,
  `dCutOff` in Hz. It takes a step `δ = x − x̂ₖ₋₁` already computed against the
  previous filtered value, and a period `te` in seconds. Per component:
  `dx = δ / te`; `dx̂ = ema(α(te, dCutOff), dx, dx̂ₖ₋₁)`;
  `cutoff = minCutOff + beta · |dx̂|`; `x̂ₖ = x̂ₖ₋₁ + α(te, cutoff) · δ`; with
  `α(te, f) = r / (r + 1)`, `r = 2π f te`, as `oneeurofilter-ts`'s
  `smoothingFactor`.
- _The pose layer._ The rotation's step is `ω = log(R̂ₖ₋₁ᵀ Rₖ)`, a 3-vector;
  the core filters it component by component; `R̂ₖ = R̂ₖ₋₁ · exp(ω̂)`. The
  translation's step is `t − t̂ₖ₋₁`, filtered per component with its own
  `(minCutOff, beta)`. `dCutOff = 1 Hz` is shared (the paper's value). Time is
  `timestampMs / 1000`: the probe reads the sequences' timestamps as
  milliseconds (open question 1).
- _What resets it_, the brief's ruling 4 as the probe applies it: a result that
  is not `"TRACK"` with a pose (so a `"DETECT"` frame resets, and its pose
  passes through unfiltered); a `pose.good` of `false`; a timestamp that does
  not increase. The frame after a reset initialises the filter with its own
  pose, unfiltered.

The filter runs after the tracker, on the results `run` returned, and feeds
nothing back: the tracker's `H`, states and poses are the same filtered or
not, which is also what Part 3 builds (ruling 2: nothing device-facing changes
unless a caller turns it on).

**Definitions, before any figure.**

- _At rest:_ a frame whose truth pose equals the previous frame's (`path(i)`
  equal to `path(i − 1)` field by field). _Readable at rest:_ such a frame
  whose own result and the previous frame's are both `"TRACK"`. _Noise at
  rest_ is `d` between those two poses; _the error at rest_ is `e` on the
  frame.
- _In motion:_ a frame that is not at rest. _The truth's motion_ is the RMS
  over `G` between consecutive `H*`, frame px, and the angle between the
  closed form's rotations of consecutive `H*`, degrees (exact where the truth
  is rigid).
- _Lag after a velocity step_, defined before any figure as the brief asks:
  the count of consecutive frames from the step (frame 5) on which the
  filtered error exceeds the unfiltered error on the same frame; "≥ 10" when
  it has not returned within the run's ten moving frames. _Settling lag_, on
  `leaveAndReturn`'s last rest segment (frames 96 to 105): the frames from 96
  until the filtered error first falls to or below the unfiltered error on the
  same frame.
- _The grid._ `minCutOff ∈ {0.5, 1, 3} Hz` for both layers;
  `beta ∈ {0, 1, 10, 100}` per rad/s for the rotation and
  `{0, 0.001, 0.01, 0.1}` per model unit/s for the translation, the two lists
  stepped together, twelve settings. Why: the measured speeds on the moving
  frames (the table "The pose's speed") are 0.07–0.26 rad/s median (0.86 max)
  and 140–550 model units/s median (670 max), so the betas add about 0, 0.1×,
  1× and 10× of a 1 Hz `minCutOff` to the cutoff at those speeds, which spans
  the trade from a plain low-pass to one that nearly follows. The cutoffs
  bracket the paper's 1 Hz by a factor of about three either way.

## The checks, each exercised both ways

All run before any figure is printed; a failure exits with its reason and
prints nothing else. The script's own lines:

- **Responsiveness** (Stage 1's first question). `poseError` changed on 190 of
  252 posed frames at `(minCutOff 1 Hz, beta 0)` — must fire: fired. The 62
  unchanged are the frames the filter passes through: every `"DETECT"` frame,
  every first frame after a reset. The metric moves; the step is not stopped
  here.
- **Transcription.** The core on a scalar step against a direct transcription
  of `oneeurofilter-ts`'s loop, on the 60 frames of `t[2]` at rest: worst
  relative difference 2.19e-16 (tolerance 1e-12) — must not fire: did not.
  The same transcription with the derivative taken against the raw previous
  value instead of the filtered one: 1.22e-4 — must fire: fired.
- **Every filtered `R` is a rotation.** Over 3,024 filtered poses (every
  setting, every sequence): largest `‖R̂ᵀR̂ − I‖_F` 2.27e-14, largest
  `|det R̂ − 1|` 1.78e-15 (tolerance 1e-9) — must not fire: did not.
  Element-wise averaging of `R` with the same core, on `wander`: 2.44e-3 and
  1.77e-3 — must fire: fired.
- **It forgets on loss.** `leaveAndReturn` frame 67, the first posed frame
  after the loss (a `"DETECT"`), and frame 93, the first `"TRACK"` after it,
  equal the unfiltered pose bit for bit (`Object.is` on all twelve components)
  — must not fire: did not. A filter that never resets puts frame 67 3,650.07
  px from the unfiltered pose — must fire: fired.
- **Deterministic for a given clock.** `wander` twice on `i · 33 ms`: equal
  digests — must not fire: did not. On `i · 16.5 ms`: a different digest —
  must fire: fired. The period read from `performance.now()`: two runs differ
  — must fire: fired. (Those two digests are not printed, since they would
  make the stdout differ between runs.)

## Expressibility, on the unfiltered tracker

### The sequences, and what resets the filter

| sequence          | frames | states                     | posed | TRACK | resets: not TRACK | `pose.good` false | timestamp not increasing |
| ----------------- | ------ | -------------------------- | ----- | ----- | ----------------- | ----------------- | ------------------------ |
| rest (probe path) | 60     | `D T×59`                   | 60    | 59    | 1                 | 0                 | 0                        |
| wander            | 40     | `D T×39`                   | 40    | 39    | 1                 | 0                 | 0                        |
| leaveAndReturn    | 106    | `D T×38 L×28 D L D×24 T×13` | 77    | 51    | 55                | 0                 | 0                        |
| velocityStep(2)   | 15     | `D T×14`                   | 15    | 14    | 1                 | 0                 | 0                        |
| velocityStep(3)   | 15     | `D T×14`                   | 15    | 14    | 1                 | 0                 | 0                        |
| velocityStep(4)   | 15     | `D T×14`                   | 15    | 14    | 1                 | 0                 | 0                        |
| velocityStep(5)   | 15     | `D T×4 D×10`               | 15    | 4     | 11                | 0                 | 0                        |
| velocityStep(6)   | 15     | `D T×4 D×10`               | 15    | 4     | 11                | 0                 | 0                        |

The state strings are the stdout's with spaces added between runs. Of the
three causes, only the first fires on these sequences: 82 times, every
one a `"DETECT"` or `"LOST"` frame. `pose.good` is `true` on every posed frame,
and `run`'s timestamps always increase. On `velocityStep(5)` and `(6)` every
moving frame re-detects, so the filter resets on each and never acts there:
those two runs cannot express lag.

### Noise at rest

Frames at rest whose result and predecessor are both `"TRACK"`:

| sequence          | rest frames | readable | e median px | e max   | d median px | d max   | R step median ° | max     |
| ----------------- | ----------- | -------- | ----------- | ------- | ----------- | ------- | --------------- | ------- |
| rest (probe path) | 59          | 58       | 0.3223      | 0.5190  | 0.1245      | 0.3202  | 0.1356          | 0.3419  |
| wander            | 0           | 0        | —           | —       | —           | —       | —               | —       |
| leaveAndReturn    | 25          | 18       | 0.3429      | 0.5210  | 0.1407      | 0.2791  | 0.1636          | 0.3419  |
| velocityStep(2–6) | 4 each      | 3 each   | 0.3713      | 0.4079  | 0.1292      | 0.1844  | 0.1627          | 0.2306  |

The five velocity runs share their first five frames (the same path, the same
seed), so their rest rows are identical. The sequences proper hold 33 readable
rest pairs; the probe's rest path adds 58 in one run, and its figures agree
with theirs (`e` 0.32 against 0.34–0.37, `d` 0.12 against 0.13–0.14). At rest
the error is a bias of about a third of a pixel and the frame-to-frame change
is about an eighth: what a filter can reduce is the second, not the first.

### Motion

| sequence        | moving frames | truth px/frame median | max    | truth °/frame median | max    | posed moving | e median px | e max     |
| --------------- | ------------- | --------------------- | ------ | -------------------- | ------ | ------------ | ----------- | --------- |
| wander          | 39            | 1.6275                | 2.3107 | 0.6942               | 0.9929 | 39           | 15.9196     | 21.4068   |
| leaveAndReturn  | 80            | 7.3044                | 9.7419 | 0                    | 0      | 57           | 0.7123      | 2118.0603 |
| velocityStep(2) | 10            | 2                     | 2      | 0                    | 0      | 10           | 0.3808      | 0.5957    |
| velocityStep(3) | 10            | 3                     | 3      | 0                    | 0      | 10           | 0.4231      | 0.6417    |
| velocityStep(4) | 10            | 4                     | 4      | 0                    | 0      | 10           | 0.4026      | 0.7065    |
| velocityStep(5) | 10            | 5                     | 5      | 0                    | 0      | 10           | 1.2750      | 4.0454    |
| velocityStep(6) | 10            | 6                     | 6      | 0                    | 0      | 10           | 1.2943      | 1.8327    |

Two things to read with this table. `wander`'s truth is not rigid: `view()`
with perspective terms, which §2 of the IPPE acceptance says is "in general
not `K · [r1 r2 t]` for any rigid pose". So the metric has a floor there: `e`
of the closed form's own decomposition of `H*` against `H*` is 5.3356 px median,
9.4768 max, over its 40 frames, and the unfiltered tracker's 15.9 px median is
read against a truth no pose reproduces. On `wander` only the _difference_
between filtered and unfiltered is readable, and the rotation moves only
there: it is the one sequence with roll and tilt. `leaveAndReturn`'s 2,118 px
maximum is on a `"DETECT"` frame (its `"TRACK"` frames are within 1.17 px, the
in-motion table below); that it is a detection on a target largely out of
view is a conjecture from the path, not measured here.

### The pose's speed, in the filter's units

| sequence        | ‖ω‖/s median rad/s | max    | ‖Δt‖/s median model units/s | max      |
| --------------- | ------------------ | ------ | --------------------------- | -------- |
| wander          | 0.2631             | 0.8604 | 145.1381                    | 457.9415 |
| leaveAndReturn  | 0.0692             | 0.4041 | 550.5056                    | 669.1793 |
| velocityStep(2) | 0.1021             | 0.3465 | 137.8337                    | 146.4455 |
| velocityStep(3) | 0.1231             | 0.4403 | 206.8053                    | 241.6733 |
| velocityStep(4) | 0.1464             | 0.5138 | 276.4303                    | 282.7999 |

Read on consecutive `"TRACK"` pairs in motion. The rotation speed on the pure
translations is noise in the pose's rotation (the truth's is 0), about
0.1 rad/s: the rotation layer's `beta` sees that speed at rest too.

## The trade, over the grid

Every setting is reported; choosing is Part 2's derivation, under the
maintainer's ruling. `dCutOff = 1 Hz` throughout.

### At rest (the probe's rest path, 58 readable pairs)

Unfiltered: `e` median 0.3223 px, `d` median 0.1245 px.

| minCutOff Hz | beta R | beta t | e median px | e max  | d median px | d max  |
| ------------ | ------ | ------ | ----------- | ------ | ----------- | ------ |
| 0.5          | 0      | 0      | 0.3201      | 0.3598 | 0.0083      | 0.0208 |
| 0.5          | 1      | 0.001  | 0.3201      | 0.3613 | 0.0085      | 0.0212 |
| 0.5          | 10     | 0.01   | 0.3198      | 0.3735 | 0.0100      | 0.0281 |
| 0.5          | 100    | 0.1    | 0.3313      | 0.4345 | 0.0242      | 0.0912 |
| 1            | 0      | 0      | 0.3205      | 0.3849 | 0.0160      | 0.0390 |
| 1            | 1      | 0.001  | 0.3206      | 0.3858 | 0.0161      | 0.0395 |
| 1            | 10     | 0.01   | 0.3220      | 0.3926 | 0.0177      | 0.0437 |
| 1            | 100    | 0.1    | 0.3265      | 0.4399 | 0.0279      | 0.0933 |
| 3            | 0      | 0      | 0.3190      | 0.4213 | 0.0413      | 0.0861 |
| 3            | 1      | 0.001  | 0.3190      | 0.4217 | 0.0414      | 0.0863 |
| 3            | 10     | 0.01   | 0.3194      | 0.4257 | 0.0422      | 0.0887 |
| 3            | 100    | 0.1    | 0.3192      | 0.4535 | 0.0499      | 0.1110 |

The median error does not move (0.319–0.331 against 0.322: the bias stays);
the frame-to-frame change falls by a factor of 15 at 0.5 Hz, 8 at 1 Hz and 3
at 3 Hz with `beta 0`, and less as `beta` rises, since the rotation's noise
speed opens the cutoff.

### In motion: `wander` (39 `"TRACK"` frames) and `leaveAndReturn`'s slides (its moving `"TRACK"` frames)

Unfiltered: `wander` `e` median 15.9196 px, max 21.4068 (against a non-rigid
truth, floor 5.34); `leaveAndReturn` moving `e` median 0.4633, max 1.1662.

| minCutOff Hz | beta R | beta t | wander e median px | e max   | leaveAndReturn moving e median px | e max   |
| ------------ | ------ | ------ | ------------------ | ------- | --------------------------------- | ------- |
| 0.5          | 0      | 0      | 20.3004            | 24.5916 | 38.4864                           | 77.7599 |
| 0.5          | 1      | 0.001  | 16.8219            | 22.5343 | 18.4604                           | 21.0190 |
| 0.5          | 10     | 0.01   | 15.8169            | 21.9945 | 4.5962                            | 5.9888  |
| 0.5          | 100    | 0.1    | 15.6775            | 21.6017 | 0.8795                            | 1.4493  |
| 1            | 0      | 0      | 17.2088            | 23.2709 | 27.3028                           | 43.8604 |
| 1            | 1      | 0.001  | 16.3140            | 22.4727 | 15.9012                           | 17.9685 |
| 1            | 10     | 0.01   | 15.7819            | 21.9563 | 4.4861                            | 5.4772  |
| 1            | 100    | 0.1    | 15.6962            | 21.5975 | 0.8776                            | 1.3730  |
| 3            | 0      | 0      | 16.0468            | 22.1519 | 11.8424                           | 15.4016 |
| 3            | 1      | 0.001  | 15.9912            | 22.0589 | 9.6108                            | 10.9476 |
| 3            | 10     | 0.01   | 15.8285            | 21.8184 | 3.8482                            | 4.2799  |
| 3            | 100    | 0.1    | 15.7594            | 21.5737 | 0.8586                            | 1.1785  |

On `leaveAndReturn`'s slides (7.3 px/frame of truth motion, 550 model
units/s) a plain low-pass lags by tens of pixels, and `beta` is what brings it
back: at `beta t 0.1` the moving error's median is 0.42, 0.41 and 0.40 px
above the unfiltered median at 0.5, 1 and 3 Hz. On `wander` (1.6 px/frame, 145 units/s, the only
rotation) the same ordering holds at a smaller scale, read as a difference
above the non-rigid floor.

### The velocity steps: lag after the step, per velocity

Per cell: lag (frames, the definition above), the peak filtered error over the
ten moving frames, the filtered error on the last frame; in parentheses the
unfiltered peak on the same frames. `v = 5` and `6` re-detect on every moving
frame, so the filter never acts there (n/a).

| minCutOff Hz | beta R | beta t | v = 2                     | v = 3                     | v = 4                     | v = 5 | v = 6 |
| ------------ | ------ | ------ | ------------------------- | ------------------------- | ------------------------- | ----- | ----- |
| 0.5          | 0      | 0      | ≥ 10, 12.02, 12.02 (0.60) | ≥ 10, 18.08, 18.08 (0.64) | ≥ 10, 24.13, 24.13 (0.71) | n/a   | n/a   |
| 0.5          | 1      | 0.001  | ≥ 10, 8.87, 8.87 (0.60)   | ≥ 10, 11.79, 11.77 (0.64) | ≥ 10, 14.34, 14.10 (0.71) | n/a   | n/a   |
| 0.5          | 10     | 0.01   | ≥ 10, 4.04, 2.88 (0.60)   | ≥ 10, 5.13, 3.28 (0.64)   | ≥ 10, 6.12, 3.62 (0.71)   | n/a   | n/a   |
| 0.5          | 100    | 0.1    | ≥ 10, 1.50, 0.76 (0.60)   | ≥ 10, 1.75, 0.73 (0.64)   | ≥ 10, 2.07, 0.70 (0.71)   | n/a   | n/a   |
| 1            | 0      | 0      | ≥ 10, 8.11, 8.11 (0.60)   | ≥ 10, 12.22, 12.22 (0.64) | ≥ 10, 16.30, 16.30 (0.71) | n/a   | n/a   |
| 1            | 1      | 0.001  | ≥ 10, 6.55, 6.55 (0.60)   | ≥ 10, 9.01, 9.00 (0.64)   | ≥ 10, 11.23, 11.06 (0.71) | n/a   | n/a   |
| 1            | 10     | 0.01   | ≥ 10, 3.48, 2.62 (0.60)   | ≥ 10, 4.52, 3.08 (0.64)   | ≥ 10, 5.45, 3.44 (0.71)   | n/a   | n/a   |
| 1            | 100    | 0.1    | ≥ 10, 1.40, 0.74 (0.60)   | ≥ 10, 1.66, 0.73 (0.64)   | ≥ 10, 1.98, 0.69 (0.71)   | n/a   | n/a   |
| 3            | 0      | 0      | ≥ 10, 3.16, 3.16 (0.60)   | ≥ 10, 4.78, 4.78 (0.64)   | ≥ 10, 6.33, 6.33 (0.71)   | n/a   | n/a   |
| 3            | 1      | 0.001  | ≥ 10, 2.93, 2.93 (0.60)   | ≥ 10, 4.28, 4.28 (0.64)   | ≥ 10, 5.56, 5.48 (0.71)   | n/a   | n/a   |
| 3            | 10     | 0.01   | ≥ 10, 2.15, 1.87 (0.60)   | ≥ 10, 2.95, 2.39 (0.64)   | ≥ 10, 3.70, 2.74 (0.71)   | n/a   | n/a   |
| 3            | 100    | 0.1    | ≥ 10, 1.10, 0.71 (0.60)   | ≥ 10, 1.37, 0.72 (0.64)   | ≥ 10, 1.70, 0.65 (0.71)   | n/a   | n/a   |

**The lag, as the brief's example defines it, never returns on these runs.**
At every setting the filtered error exceeds the unfiltered on all ten moving
frames. That is what the definition measures on a step to _constant_ velocity:
a first-order low-pass settles to a steady offset of about `v · τ` behind the
truth and never catches up (with `beta 0` and 1 Hz, `v = 2 px/frame = 60 px/s`
and `τ = 1 / 2π ≈ 0.159 s` give 9.6 px; the last frame reads 8.11 and is still
rising), and `beta` lowers the offset without removing it. So on the velocity
steps the readable quantities are the peak and the last-frame error against
`v`, not a return time: at `beta 0` the last-frame error is proportional to `v`
(1 Hz: 8.11, 12.22, 16.30 for 2, 3, 4 px/frame); at `beta t 0.1` it is
0.11–0.16 px above the unfiltered peak at `v = 2`, within 0.09 px of it at
`v = 3`, and below it at `v = 4`, at every cutoff. The per-frame rows at
`(1 Hz, beta 0)` are in the stdout. A return time is readable where motion
stops, which is the next table.

### Settling after motion stops: `leaveAndReturn`, frames 96 to 105

The return slide ends at frame 96; tracking resumed at frame 93, so the filter
has three moving frames of state when the target comes to rest. Unfiltered
`e`: 0.3953 px at frame 96, 0.4201 at 105.

| minCutOff Hz | beta R | beta t | settling lag, frames | e filtered at 96 px | at 105 |
| ------------ | ------ | ------ | -------------------- | ------------------- | ------ |
| 0.5          | 0      | 0      | ≥ 10                 | 3.3080              | 1.4227 |
| 0.5          | 1      | 0.001  | ≥ 10                 | 3.2117              | 1.1412 |
| 0.5          | 10     | 0.01   | ≥ 10                 | 2.5377              | 0.4805 |
| 0.5          | 100    | 0.1    | 8                    | 0.8568              | 0.3888 |
| 1            | 0      | 0      | ≥ 10                 | 2.6945              | 0.6356 |
| 1            | 1      | 0.001  | ≥ 10                 | 2.6277              | 0.5740 |
| 1            | 10     | 0.01   | 9                    | 2.1455              | 0.4073 |
| 1            | 100    | 0.1    | 8                    | 0.8068              | 0.3858 |
| 3            | 0      | 0      | 7                    | 1.4460              | 0.3815 |
| 3            | 1      | 0.001  | 7                    | 1.4256              | 0.3816 |
| 3            | 10     | 0.01   | 7                    | 1.2660              | 0.3827 |
| 3            | 100    | 0.1    | 1                    | 0.6662              | 0.3921 |

Read with its margin: the unfiltered error on these frames is 0.38–0.42 px and
the filtered error approaches it from above, so a lag of 7 to 9 frames is
where a decaying excess crosses a 0.4 px noise floor, not where it reaches
zero. The 1 Hz `beta 10` row's 9 and the 0.5 Hz `beta 100` row's 8 are one
frame apart on a crossing of that kind. The most open setting, 3 Hz with
`beta 100 / 0.1`, crosses at frame 97, one frame after the stop: at that
setting the filter had already nearly followed the slide (its error at frame
96 is 0.67 px against 0.40 unfiltered), so there is little excess to settle;
the Stage 3 settling draft names that boundary as its void case.

## Stage 2: the declared covariates

Declared from the sequences' definitions, not from the results above; each
with how it is computed and where it is read.

1. **Regime: at rest or in motion.** From the path: `path(i)` equal to
   `path(i − 1)` field by field is at rest. Read per frame; the two regimes are
   reported apart, never pooled, because the filter's effect has opposite
   signs in them (it lowers `d` at rest and raises `e` in motion).
2. **Velocity**, px/frame of the truth on `G`, and in the filter's own units
   (rad/s, model units/s) on the pose. Per frame; per run on the velocity
   steps, where it is a constant. It is the covariate that sets the lag's
   size, so a lag figure is stated at its velocity.
3. **Frames since the last reset.** Per frame, from the result stream: a
   `"DETECT"` or `"LOST"` result, a `pose.good` of `false` or a non-increasing
   timestamp sets it to zero. The filter's output equals its input on frame 0
   and is warming up for the first few; a figure read within `3τ` of a reset
   (`τ = 1 / 2π f`: 0.95 s, 0.48 s and 0.16 s, about 29, 14 and 5 frames at
   33 ms for 0.5, 1 and 3 Hz) is reported as such.
4. **The result's state.** `"TRACK"` frames are the only ones the filter
   acts on; `"DETECT"` frames pass through. On `velocityStep(5)` and `(6)`
   every moving frame is a `"DETECT"`, so those runs are outside the filter's
   reach and say nothing about it.
5. **The truth's rigidity.** `wander`'s `H*` carries perspective terms and is
   not `K · [r1 r2 t]`; `leaveAndReturn`'s and the velocity steps' are frontal
   and rigid. On a non-rigid truth `e` has a floor (5.34 px median on `wander`)
   and only differences are read.
6. **Which quantity moves.** Rotation moves only on `wander`; the other
   sequences are pure translations, on which the rotation layer sees noise
   alone. A claim about the rotation layer is read on `wander` or on a
   registered path with rotation.

## Stage 3: drafts, pending the maintainer's ruling

Drafts. The maintainer rules on each; none is registered here. Where a draft
cites a figure above, that figure is its basis and the draft says so, as the
protocol requires of a prediction a probe has already measured.

**Criteria for the three properties, as exact checks.** Each is run in Part 3
as a test exercised both ways: the test must also show the named broken
variant failing it.

- _Rotation._ Over every filtered pose of the registered sequences and
  settings, `‖R̂ᵀR̂ − I‖_F ≤ 1e-9` and `|det R̂ − 1| ≤ 1e-9`. Basis: 2.27e-14
  and 1.78e-15 measured over 3,024 poses; element-wise averaging gives
  2.44e-3. Refuted by any frame above either bound.
- _Reset._ On `leaveAndReturn`, frames 67 and 93 (the first posed frame after
  the loss and the first `"TRACK"` after it) equal the unfiltered pose under
  `Object.is` on all twelve components; and so does every frame the reset rule
  flags. Basis: the forgetting check above. Refuted by any component that
  differs; the no-reset variant must differ at frame 67.
- _Determinism._ Two runs on the same timestamps give identical poses (a
  digest over all components); the same results on halved spacing give a
  different digest; and during a run `performance.now` and `Date.now` are
  replaced by throwing stubs, so that a filter reading a clock cannot pass.
  Basis: the determinism check above; the clock-reading variant differs
  between runs.

**A draft criterion for bounded lag**, in two parts, since the probe found
the brief's example form unreadable on a step to constant velocity:

- _At constant velocity_ `v ∈ {2, 3, 4}` px/frame, the filtered error on the
  last moving frame (frame 14) is at most `B(v)`, with `B` derived by the rule
  below from the registered setting's row in the velocity table. Refuted
  upward by a last-frame error above `B(v)`; refuted downward, which here
  means void, by a last-frame error equal to the unfiltered one, since that
  would show the filter inactive (frames 5 to 14 are `"TRACK"` on these runs,
  so a pass-through is not an explanation).
- _Settling_: after `leaveAndReturn`'s return slide ends (frame 96), the
  filtered error falls to or below the unfiltered error within `L` frames, `L`
  the registered setting's settling lag plus one frame of margin, read with
  the caveat above that the crossing is at a 0.4 px floor. Refuted upward by a
  later crossing or none; void by a crossing at frame 96 itself, which would
  mean no lag to settle.

**A draft criterion for steadiness at rest**, on the probe's rest path if Part
2 registers it (otherwise on the 33 readable rest pairs of the sequences,
pooled with that said):

- the median frame-to-frame change `d` of the filtered poses is at most `r`
  times the unfiltered median, `r` the registered setting's ratio from the
  at-rest table (the probe measured 0.067–0.401 over the grid) plus one
  grid step's worth of margin, the ratio of the next larger `minCutOff` at
  the same `beta`; refuted by a ratio above `r`;
- and the median error `e` of the filtered poses is within `0.02 px` of the
  unfiltered median (the probe measured −0.003 to +0.009); refuted by a rise
  above it, which would mean the filter adds bias at rest. The second part is
  what refutes in the other direction: a filter can lower `d` to zero by
  freezing, and the first part alone would pass it.

**How the parameters would be derived**, the rule and not a value. Per layer,
from the probe's tables, in this order: the largest `minCutOff` whose at-rest
`d` ratio meets the steadiness criterion (the larger the cutoff, the shorter
the settling); then the smallest `beta` at that cutoff whose last-frame error
at `v = 4` and settling lag meet the bounded-lag criterion. The grid's step is
a factor of 3 in `minCutOff` and 10 in `beta`, so a derived value is stated as
its grid point, not interpolated; a finer grid is a new probe. `dCutOff` stays
at 1 Hz unless a run shows a reason: this probe found none (it did not vary
it).

**The open questions**, for the ruling:

1. _The timestamps' units._ `process` documents `timestampMs` as "in the
   caller's units"; the sequences pass `i · 33` and the bench page passes
   milliseconds. The probe read them as milliseconds and took cutoffs in Hz.
   Either the option states that timestamps are milliseconds, or it takes
   cutoffs in the caller's units (per unit of `timestampMs`), as
   `oneeurofilter-ts` does with its "period in milliseconds" default. Not
   decided here.
2. _The reset rule._ The probe resets on every result that is not `"TRACK"`
   with a pose, on `pose.good === false`, and on a non-increasing timestamp,
   and passes a resetting frame's pose through unfiltered; on these sequences
   only the first cause ever fires (82 times, all `"DETECT"` or `"LOST"`).
   Three points for the ruling: whether a `"DETECT"` frame's pose seeds the
   filter (the probe does not seed it; the next `"TRACK"` does) or passes
   through; whether a non-increasing timestamp resets, as here, or holds the
   previous filtered value, as `oneeurofilter-ts` does on `te <= 0`; and
   whether the rotation's `α` is per component of `ω`, as here and as the
   library applies it per index, or one scalar for the step. The same
   question has a second face: the core's derivative state `dx̂` for the
   rotation is a vector in the body frame of `R̂ₖ₋₁`, carried across steps
   while that frame turns by `exp(ω̂)`; at these speeds (≤ 0.86 rad/s over
   33 ms) the effect is second order, but it is the ruling's to accept or
   to have the state re-expressed each step.
3. _The rest path._ Whether Part 2 registers the probe's 60-frame rest path
   as a fixture beside the sequences, or reads steadiness on the sequences'
   own 33 pairs.
4. _A note for Part 3, not a question._ The probe's `so3Log` reads the angle
   from `acos` of the trace, which loses precision on steps far smaller than
   these (about 2e-3 rad here; the rotation check passed at 2.3e-14). An
   implementation should read it as `atan2(‖v‖ / 2, (tr − 1) / 2)` with `v`
   the antisymmetric part.

## Constraints kept

- No file under `packages/*/src`, `examples/` or `scripts/` is changed; the
  diff against `origin/dev` is these two files.
- The sequence runner, the fixtures and the target are read, not changed;
  their hashes are in Step 0.
- The metric is imported from `test/pose/pose_metric.ts`, not reimplemented.
- No issue was commented on, edited or closed; nothing merged or approved.

## What this probe does not establish

- Nothing on the device. The withdrawn claim stands withdrawn: no exported
  value is a function of the pose, and this probe reads no export.
- Nothing about the bench page or any export, which do not read the pose.
  The filter here runs after the tracker on the poses `run` returned; the
  tracker's `H`, states and counts are the same with it and without it.
- Nothing about which setting to use. Every setting is reported; the choice
  is Part 2's derivation, under the ruling.
- Nothing about rotation lag at speed. The only rotation is `wander`'s, 0.26
  rad/s median, read against a non-rigid truth; a lag bound on the rotation
  layer needs a rigid path with rotation, which no committed sequence has.
- Nothing at `v ≥ 5` px/frame, where every moving frame re-detects and the
  filter never acts.

## The command, and its stdout's SHA-256

    node docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.mjs

Run twice on 2026-10-29 at `8b9e840` with the two new files in place: both
stdouts 165 lines, SHA-256
`d97ceb01cb759b4bff25e74c7b768fa95b637ff038e7c186980206bd7b0db88f`, identical.
(An earlier form of the script, before the two built modules were added to
what it hashes, printed 162 lines at
`2463ab3981532ab9a3a609cae17f80035b396ca3c97441e25ad86b6cb000b8ee`, with the
same figures and the same pose digest below.)
The digest the stdout ends with, over every filtered pose of every setting and
sequence, is
`86c8536dc80d1778187a29b95af3e1856795b678b70ff030bc7764169a9873b6`.
