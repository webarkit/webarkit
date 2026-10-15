# M4 step 3 ([#105](https://github.com/webarkit/webarkit/issues/105)): IPPE's acceptance criteria, registered before the implementation

Written on 2026-10-15, before any IPPE code existed in this repository, and
committed on its own so that the commit's date and hash witness the order.
Nothing below is edited after the implementation's output has been seen. A
criterion that turns out mis-specified is withdrawn and replaced in a dated
addendum at the end, which says so and states the direction of the change;
the original text stays. That is the rule the jitter clause set one level up
([the null control's jitter clause](./README.md#the-null-controls-jitter-clause-2026-10-14)),
and the reason this file exists: criteria written after the output are
criteria fitted to it.

## 1. What is being accepted

IPPE (Collins and Bartoli, *Infinitesimal Plane-Based Pose Estimation*, IJCV
109(3), 2014) in place of the closed-form homography decomposition, in the
tracker, above the `CvBackend` contract. The closed form is the oracle's,
`cv-backend-jsfeatnext`'s `poseFromHomography`, which is jsfeatNext 0.17.0's
`pose_estimator.estimate`: `B = K⁻¹H`; the sign of `B` fixed so that
`B[2][2] ≥ 0`; `r1`, `r2` the first two columns normalised and then
orthonormalised symmetrically (the half-angle construction); `t` the third
column scaled by `2 / (‖b1‖ + ‖b2‖)`. It returns one pose by construction.
IPPE computes the two poses a planar homography allows and the tracker
chooses between them by a stated rule.

**Placement, ruled by the maintainer on 2026-10-15:** IPPE lives in
`packages/nft-tracker/src/`; the comparison with the oracle lives in
`packages/nft-tracker/test/`. `packages/cv-backend-jsfeatnext/src/` is not
touched: it is the reference IPPE is compared against, and a change there
moves the reference ([#124](https://github.com/webarkit/webarkit/issues/124),
[the instrument, the subject and the inputs](./README.md#the-instrument-the-subject-and-the-inputs-2026-10-14),
item 3). The no-import rule that keeps a backend out of `nft-tracker/src/` is
ADR-0001 **point 2**, not point 7 as the step's brief said; the brief's
author corrected the citation.

The test that compares IPPE with the oracle belongs to none of the three
categories of the 2026-10-14 ruling: it is not served, and it supplies no
reference value to a counted measurement. It is ordinary code, free to
change. (The maintainer's sentence, 2026-10-15.)

## 2. The metric: reprojection error, in frame pixels

Every criterion below reads one metric. For a pose `P = (R, t)` and a
reference homography `H*` (target level-0 px → frame px), over the fixed set
`G` of 25 target points, the 5 × 5 grid over `[0, w − 1] × [0, h − 1]` of the
target image (`w = 512`, `h = 640`):

    e(P; H*) = √( (1/25) · Σ_{x ∈ G} ‖ π(K · (R · x̂ + t)) − π(H* · x) ‖² )     [frame px]

with `x̂ = (x, y, 0)` the point on the target plane, `π` the perspective
division, and `K` the intrinsics. The distance between two poses is the same
sum with `π(K · (R₂ · x̂ + t₂))` in place of `π(H* · x)`: `d(P₁, P₂)`.

Why this metric and not a rotation angle plus a translation norm:
- it is the unit every correctness test of this package already reads
  (pixel error at target points, `track_frame.test.ts`, `tracker_state_machine.test.ts`);
- it needs no `(R, t)` truth. #90's sweep has none: its views are built by
  `view()` from a scale, a roll, a shift and two perspective terms, and a
  homography of that family is in general not `K · [r1 r2 t]` for any rigid
  pose. Against such an `H*` both methods have a non-zero `e`, and `e` still
  compares them;
- for a rigid `H* = K · [r1 r2 t]`, `e(P; H*) = 0` exactly when `P` is that
  pose on `G`, so on rigid views it is an exactness test.

`d` obeys the triangle inequality, which §4 uses:
`d(P₁, P₂) ≤ e(P₁; H*) + e(P₂; H*)`.

## 3. Inputs, fixed

- **The camera:** `K = intrinsics(270, 360)` of `cv-backend-jsfeatnext`, the
  frozen tests' camera: a 60° horizontal field of view, so
  `f = 135 / tan 30° = 233.83 px`, principal point at the frame's centre.
- **The target:** `packages/nft-tracker/test/fixtures/pinball-target-640.pgm`
  (512 × 640) and the shipped `examples/targets/pinball.wnft`, whose 48 patches
  the tracker tracks. Both are inputs of the campaign; their SHA-256s are in
  the plan ([item 3](./README.md#the-instrument-the-subject-and-the-inputs-2026-10-14))
  and in `AGENTS.md`.
- **The renderer and the tracking step:** `renderWarp`, `view`, `project`
  from `test/fixtures/warped_frames.ts`, and `trackFrame` with the tracker's
  own defaults as the frozen sweep maps them (`SHIPPED_OPTIONS` in
  `test/tracking/track_frame.test.ts`). The seven frozen files were verified
  on 2026-10-15 against the plan's hashes, at `37dc6d4`, at `1c8cd34` and in
  the working tree: all seven equal.
- **Apparent size:** `s = 0.45` frame px per target px at the target's
  centre, the frozen tests' value, so the plane's centre sits at
  `Z = f / s = 519.62` target-px units from the camera.

## 4. The sets

**S1, exact rigid views (84).** Rigid poses, so `H* = K · [r1 r2 t]` exactly
and the pose is known by construction:
- tilt `θ ∈ {0°, 10°, 20°, 30°, 40°, 50°}` about an axis in the target plane
  at azimuth `φ ∈ {0°, 45°, 90°, 135°}` (`θ = 0` once, since `φ` is then
  moot): 21 orientations;
- in-plane roll `ψ ∈ {0°, 15°}`;
- the target's centre at the frame's centre plus a shift of `(0, 0)` or
  `(30, −20)` frame px, at depth `Z`.

21 × 2 × 2 = 84 views. The correspondences handed to IPPE on an exact view
are the 48 patch centres and their images under `H*`.

**S2, fitted views (252 renders, the well-conditioned subset).** Each S1 view
rendered by `renderWarp` with the frozen sweep's settings (270 × 360, one
blur pass, noise σ = 2 grey levels, gain 0.9, bias 10) at seeds 1, 2 and 3,
then one tracking step from the exact `H*` with `SHIPPED_OPTIONS` on the
shipped 48 patches. A render is **well-conditioned** when that step returns
`ok`: the tracker's own gates (at least 8 inliers, at most 45% outliers,
fit RMS at most 0.6 px) decide it, not this file. The fitted `H` and the
step's correspondences (the observed patches the fit weighed above 0) are
what IPPE and the oracle read. S2 is where IPPE and the closed form can
differ in a way that matters: on exact data both are exact.

**S3, #90's sweep, descriptive.** The frozen sweep's 1,370 steps (2 views ×
5 seeds × 137 perturbations) on the shipped target, read on its right fits
(`centreRms(r.H, H) < 0.5` px, the sweep's own rule). Its first view is
fronto-parallel and rigid; its second has perspective terms and is not rigid,
so no pose is its truth. §6 says what is reported from S3; nothing in §5 is
gated on it.

## 5. The criteria

**τ_exact, the rounding allowance, 6.9 × 10⁻⁵ px.** Derived, not chosen.
Double precision has unit round-off `u = 2⁻⁵³ = 1.11 × 10⁻¹⁶`. IPPE's
decomposition and its least-squares translation over 48 correspondences are
at most `N = 2 × 10³` floating-point operations; the 2 × 2 inversions in the
rotated frame are conditioned by at most a factor 6 for views whose centre
is inside the frame (half-diagonal 225 px over `f = 233.83` px: 44°,
`1 / cos 44° = 1.39`, squared and doubled for the two inversions). The
linear path therefore moves a projected point by at most
`f · N · u · 6 = 233.83 × 2000 × 1.11 × 10⁻¹⁶ × 6 = 3.1 × 10⁻¹⁰ px`. The
square-root path dominates: the third row of the rotation is
`√(1 − r₁₁² − r₂₁²)`, and on a fronto-parallel view the radicand is a
cancelled difference of order `N · u`, so the entry carries an error up to
`√(N · u) = 4.7 × 10⁻⁷`. That is a spurious tilt `δ` of that size, which
moves a target point `d` px from the centre by `s · d² · δ / Z`; with
`d ≤ 409.1 px` (the target's half-diagonal), `s = 0.45`, `Z = 519.62`:
`0.45 × 167 363 × 4.7 × 10⁻⁷ / 519.62 = 6.8 × 10⁻⁵ px`. Sum: `6.83 × 10⁻⁵`,
rounded up at two figures to **τ_exact = 6.9 × 10⁻⁵ px**. The oracle's closed
form has no such square root and sits far inside the same bound.

**m, the ambiguity margin.** Two candidates are **ambiguous** on a frame when
their RMS reprojection errors over that frame's correspondences differ by at
most `m`. `m` is the resolution of an RMS over `n` correspondences whose
residuals have per-axis standard deviation `σ`: `‖r‖²` has mean `2σ²` and
variance `4σ⁴`, so the mean of `n` has standard deviation `2σ² / √n`, and the
RMS, its square root, `σ / √(2n)`. Hence **`m = σ / √(2n)`**, with:
- on a tracking step, `σ = 0.2 px`: the alignment's accuracy under noise,
  as `test/tracking/align_patch_accuracy.test.ts` pins it ("median error
  below 0.2 px at σ = 8", blur included; the renders here use σ = 2, so
  0.2 px is an upper bound by that test's own figures). With all 48 patches
  observed, `m = 0.2 / √96 = 0.0204 px`;
- on a detection, `σ = 4 px`, `DEFAULT_RANSAC_THRESHOLD`: an inlier lies
  within it of the fit by definition, so it bounds the inliers' dispersion.
  `m = 4 / √(2n)` over the `n` inliers.

**The selection rule**, the treatment's definition, as the maintainer set it
on 2026-10-15, per frame and with no memory of earlier frames:
- (a) a candidate is rejected when any point of `G` has `z ≤ 0` in the
  camera frame (the target plane behind the camera);
- (b) of the survivors, the one with the lower RMS reprojection error over
  the frame's correspondences;
- (c) when both survive and are ambiguous (within `m`), the frame is
  **ambiguous**: the pose is that frame's closed-form decomposition of the
  same `H`, computed by a tracker-local copy of the oracle's algorithm (§1),
  and the tracker's per-run counter of ambiguous frames is incremented.

  *Why a local copy and not a call to the backend's `poseFromHomography`:*
  the invariant the maintainer registered for round 1 is that on tracker arms
  every `ok` frame's `pose` stage sample is exactly 0, a non-zero sample
  meaning the treatment was not applied. A fallback through the backend would
  put a non-zero sample on every ambiguous frame and have the run refused.
  The copy is tested equal to the oracle (C8), so the fallback is the
  control's pose and the invariant holds.

The criteria. Each names the set, the bound, and what a failure means.

- **C1, the truth is among the candidates (S1).** On each of the 84 views,
  at least one of IPPE's two candidates has `e ≤ τ_exact`, and the oracle's
  pose has `e ≤ τ_exact`. *Failure:* the first clause, a defect in the
  decomposition; the second, a defect in the test's own construction of
  `H*`, to be fixed before anything else is read.
- **C2, the selection is right on exact data (S1).** On each of the 84
  views, the selected pose has `e ≤ τ_exact`. The views with `θ = 0` (4 of
  84) are expected ambiguous, since there the two candidates coincide, and
  their fallback is exact too; on the other 80 the selected candidate is the
  one C1 found. *Failure:* the selection rule picks the wrong branch where
  the two are distinguishable, or the fallback is not exact.
- **C3, agreement with the oracle on exact data (S1).** On each of the 84
  views, `d(selected, oracle) ≤ 2 · τ_exact`. Derivation: both are within
  `τ_exact` of the truth (C1, C2), and the triangle inequality.
- **C4, no fit on which IPPE is worse than the closed form by more than the
  data's own noise (S2).** On every well-conditioned render,
  `e(selected; H*) ≤ e(oracle; H*) + r`, where `r` is that step's fit RMS
  residual (`stats.rmsError`, frame px): a pose computed from correspondences
  that scatter by `r` cannot be held to better than `r`. *Failure:* a render
  where IPPE's selected pose is farther from the truth than the closed
  form's by more than the fit's residual, which is a wrong branch or a
  defect, not noise.
- **C5, the improvement (S2).** Over the well-conditioned renders, the
  median of `e(selected; H*)` is at most the median of `e(oracle; H*)`.
  *Failure:* IPPE is not the more accurate decomposition on fitted
  homographies, the property #105 rests on; the milestone's anchor would then
  rest on nothing measurable.
- **The oracle tolerance #105 asks for, stated and derived (S2).** On every
  well-conditioned render, `d(selected, oracle) ≤ 2 · e(oracle; H*) + r`.
  Derivation: the triangle inequality, `d ≤ e(selected) + e(oracle)`, and
  C4. It is a consequence of C4, listed because #105 asks for the tolerance
  in this form; it is checked as such.
- **C6, determinism.** For the same `H`, `K` and correspondences the output
  is bit-identical across calls; for the correspondences in any other order
  the selection (which candidate, or ambiguous) is identical and each
  candidate is within `τ_exact` of its counterpart. Checked on S1 and on a
  property test over random correspondence orders. *Failure:* the selector
  depends on iteration order, which the maintainer's rule forbids.
- **C7, the depth rule.** A candidate with a point of `G` at `z ≤ 0` is
  rejected: checked on constructed cases (a pose with the plane behind the
  camera), since on S1 and S2 both candidates are expected in front. The
  count of (a)-rejections on S1 and S2 is reported.
- **C8, the fallback equals the oracle.** On every `H` of S1 and S2,
  `d(local closed form, oracle) ≤ τ_exact`, and `good` agrees. *Failure:*
  the local copy is not the oracle's algorithm.
- **C9, `H` does not move.** The seven frozen files are byte-identical to
  the plan's hashes after the change, and `track_frame.test.ts` and
  `tracker_state_machine.test.ts` pass unmodified. They judge `H`, which the
  treatment does not touch. *Failure:* the treatment changed something other
  than the pose.
- **C10, the invariant in code.** Over the camera-path sequences of
  `tracker_state_machine.test.ts`'s kind, run through an `NftTracker` whose
  backend counts calls, `poseFromHomography` is called 0 times, on every
  frame, ambiguous frames included. *Failure:* the treatment is not applied,
  or the fallback calls the backend.
- **C11, the counter.** The tracker's per-run count of ambiguous frames
  equals the number of frames whose result reports an ambiguous selection.

## 6. Reported, not gated

Written into the PR and into #107's registration, as numbers the criteria do
not judge:
- from S1 and S2: how often the truth (S1) or the better candidate (S2, by
  `e`) is among the two, and how often the selection picks it where the two
  are distinguishable; the ambiguous rate, by tilt;
- from S3: on the right fits, the medians of `e(selected)` and `e(oracle)`
  against each view's `H*`, the share of fits on which `e(selected) ≤
  e(oracle)`, and the ambiguous rate, per view. The first view is
  fronto-parallel, so its candidates are expected ambiguous or near it; the
  second has no pose truth, so these are descriptive;
- the ambiguous-frame rate per bundled clip from the headless development
  run (§7).

## 7. The headless development measurement

Not campaign data: no provenance, no device, the instrument untouched, never
reported as a round. Its one purpose is the number #107 needs to state the
prediction and the refusal threshold for the ambiguous-frame counter before
round 1's first counted run.

- Each of the three clips in `examples/videos/` is decoded once by `ffmpeg`
  to 8-bit grey frames at the page's default processing box, 480 × 360
  (`PROC_WIDTH`, `PROC_HEIGHT` in `examples/bench-nft.html`), in media order,
  one pass, no loop.
- An `NftTracker` on the jsfeatNext backend with `K = intrinsics(480, 360)`
  and the tracker's defaults processes every frame.
- Reported per clip: frames, frames with a pose, ambiguous frames among
  them, split DETECT and TRACK, and the rate.

The script lives in `packages/nft-tracker/scripts/`, outside all three
categories, and its output is quoted in the PR and in #107, not committed as
an export.

## 8. What this file does not decide

- The refusal threshold on the ambiguous-frame rate: the maintainer's, from
  §7's numbers, registered in #107.
- How the per-frame ambiguity flag reaches a counted run's export. The
  frozen page copies named fields of a result (`frameRecord` in
  `examples/js/bench-metrics.mjs`), so a new field on the tracker's result
  does not reach the export unless it sits in an object the page spreads
  whole (`tracking`, the step's `TrackStats`, and `timings`). Reported to
  the maintainer with the PR; not changed here.

## Addendum, 2026-10-15: the first run, read against the criteria above

Written after the implementation's first complete run (branch `feat/105-ippe`,
the criteria at commit `6ea5183`, the implementation after it). Nothing
above was edited. What follows discloses what was seen, names the one
expectation that was wrong and the direction of its correction, and records
the verdicts as the criteria give them. Every figure is from
`packages/nft-tracker/test/pose/acceptance.test.ts`, which prints them, and
from `packages/nft-tracker/scripts/ambiguous-rate.mjs`.

**Verdicts.**

| Criterion | Verdict | What was found |
|---|---|---|
| C1 | held | On all 84 exact views one candidate is within τ_exact of the truth, and so is the oracle. |
| C2 | held, with one wrong sub-expectation | The selected pose is within τ_exact on all 84. **No view was ambiguous**, where the text expected the 4 fronto-parallel ones to be. |
| C3 | held | `d(selected, oracle) ≤ 2 · τ_exact` on all 84. |
| C4 | **failed** | 7 of 252 renders over `e(oracle) + r`, all 7 at tilt 0°: `e(selected)` 0.365 to 0.460 px against `e(oracle)` 0.107 to 0.141 px, `r` 0.200 to 0.238 px. |
| C5 | held | Medians over the 252: selected 0.0845 px, oracle 0.1757 px. |
| the oracle tolerance | failed where C4 failed | 2 of 252 renders over `2 · e(oracle) + r`, both among C4's 7, as the triangle inequality requires. |
| C6 | held | Bit-identical on repeat; 60 random orders of the correspondences change neither the selection nor the candidates beyond τ_exact. |
| C7 | held | Constructed cases rejected; 0 depth rejections on S1 and S2. |
| C8 | held | `d(local closed form, oracle) ≤ τ_exact` on every H of S1 and S2 (measured 0). |
| C9 | held | The seven files unchanged (hashes re-verified); `track_frame.test.ts` and `tracker_state_machine.test.ts` pass unmodified, 28 tests. |
| C10 | held | 0 calls of `poseFromHomography` over 40 frames with a counting backend, DETECT and TRACK; 0 in detection-only mode. |
| C11 | held | The counter equals the frames reported ambiguous. |

**C2's wrong sub-expectation, and its correction.** §5 said the two
candidates coincide on a fronto-parallel view. They coincide when the plane's
normal lies along the ray to the *correspondences' centroid*, which is the
point IPPE expands about. The 48 patch centres' centroid is off the target's
centre, so on an exact fronto-parallel view the second candidate is a plane
tilted by twice the angle between that ray and the optical axis: 5.0° with
the target centred, 12.6° with the shift of (30, −20) px. Its RMS over the
correspondences is 3.1 and 7.8 px against 10⁻¹³ for the true one, so the
two are distinguished and the exact one is selected. The correction is in
the strict direction: the criterion's substance, exactness of the selected
pose, held on all 84 with no fallback anywhere; the expectation of 4
fallbacks is withdrawn. The test asserts 0 ambiguous views.

**C4's failure, read.** The 7 renders are 7 of the 12 fronto-parallel fits
(tilt 0°, both rolls, both shifts, three seeds); no render at 10° or more is
over the bound, and from 10° on IPPE's selected pose is the closer of the two
on 240 of 240 fits, often by 2 to 5× (`e(selected)` 0.01 to 0.2 px against
`e(oracle)` 0.07 to 0.26 px at 10° and 20°). The mechanism, read from the
per-fit detail: IPPE's rotation comes from the Jacobian of the homography at
one point, and a plane's tilt enters that Jacobian only at second order
(`cos θ ≈ 1 − θ² / 2`), so at tilt 0 the fit's noise becomes tilt through a
square root: the selected candidate carried 0.22° to 0.51° of tilt against
the closed form's 0.10° to 0.14°, which reads the tilt at first order from
the perspective row of the whole `H`. This is a property of the method, not
a wrong branch: on every one of the 12 the selection picked the better of
the two candidates. The verdict stands as C4 defines it: the registered
hypothesis, that IPPE is never worse than the closed form by more than the
data's noise, is false at fronto-parallel views. The margin rule (c) does not
reach it: the two candidates are 3 px apart in RMS there, so the frame is
not ambiguous, and the fallback never fires. The test pins the 7, labelled
as a pin and not as the criterion.

**§6, reported.**
- S2, by tilt: 12 fits at 0°, 48 at each of 10° to 50°; 0 ambiguous at
  every tilt; the better candidate selected on all 252; 0 depth rejections.
- S3, #90's sweep, 1,370 steps, 788 right fits as the frozen test counts
  them: view 1 (fronto-parallel, rigid), 391 right fits, median
  `e(selected)` 0.290 px against `e(oracle)` 0.117 px, the selected pose at
  least as close on 36, 0 ambiguous; view 2 (roll 15°, perspective terms,
  not rigid), 397 right fits, median `e(selected)` 12.93 px against
  `e(oracle)` 3.79 px, at least as close on 1, 1 ambiguous. View 2's figure
  is the same mechanism in the extreme: its `H` is a pure perspective term
  composed with a similarity, whose Jacobian at the centroid is that
  similarity, so IPPE reads a fronto-parallel plane while the closed form
  reads the perspective row. No rigid pose reproduces that `H`, which is why
  S3 was registered as descriptive. The camera-path sequence of
  `tracker_pose.test.ts`, of the same non-rigid kind, shows it too: medians
  15.9 px against 5.5 px over 40 posed frames, 0 ambiguous.
- §7, the headless development run (two runs, since RANSAC is unseeded
  through the contract; the figures move by a frame or two):

  | Clip | processing | frames | posed | ambiguous | rate | no candidate in front | fallbacks in all |
  |---|---|---|---|---|---|---|---|
  | `pinball-bench-table.mp4` | 203 × 360 | 267 | 260, 261 | 6, 5 | 2.3%, 1.9% | 18, 18 | 24, 23 |
  | `pinball-bench.mp4` | 480 × 270 | 298 | 266, 270 | 15, 12 | 5.6%, 4.4% | 4, 6 | 19, 18 |
  | `pinball-static.mp4` | 203 × 360 | 366 | 366, 366 | 0, 0 | 0 | 0, 0 | 0, 0 |

  Every ambiguous frame was a DETECT frame, where the margin is read with
  `σ = 4 px` over RANSAC's inliers; no TRACK frame was ambiguous on any
  clip. The frames where both candidates put the plane behind the camera
  (rule (a) rejecting both) fall back to the closed form too. By the
  maintainer's ruling of the same day there is one per-run counter, the
  tracker's `fallbackFrames`: every frame whose pose is not IPPE's own estimate,
  for any reason, since each such frame makes the arm a mixture. C11 was
  registered as a count of ambiguous frames; the one counter contains it, and
  the test asserts the counter against every fallback outcome.

**What this run does not decide.** Whether a treatment that is the more
accurate decomposition from 10° of tilt on and the less accurate one at
fronto-parallel views is the treatment round 1 measures, is the maintainer's
call, and so is any change to the selection rule, which is part of the
treatment's definition and must be registered in #107 before round 1's first
counted run. A rule that reached the fronto-parallel case would not be rule
(c) as declared here, since the two candidates are distinguishable there.

## Correction, 2026-10-15: a vacuous check behind two sentences of the addendum, and "240 of 240"

Found by an outside reviewer (Copilot, on PR #134) after the addendum above
was written; confirmed by the maintainer and by this session the same day.
Nothing above is edited; this says what was wrong, what was run to settle
it, and what the figures are.

**The vacuous check.** The addendum's §6 counts, "the better candidate
selected on 12 of the 12 distinguishable … 48 of the 48", and its sentence
"on every one of the 12 the selection picked the better of the two
candidates", came from a flag in `test/pose/acceptance.test.ts` that compared
the minimum error over IPPE's two candidates with the selected candidate's
error as `better <= eSel + τ_exact`. The selected error is one of the two the
minimum was taken over, so the comparison held whatever the selector chose.
The flag is reversed to `eSel <= better + τ_exact`, which asserts the thing
meant, and the §6 test now asserts it per tilt step instead of printing it.

**Run both ways, as the rule of 2026-10-15 requires** (round 0's session
record: a check is trusted only after it has been shown to fire and shown
not to):
- *Run A, the selector as it is:* the selected candidate is the better of the
  two on 12 of 12 fits at 0° and 48 of 48 at each of 10°, 20°, 30°, 40° and
  50°: **252 of 252**, with 0 ambiguous. The §6 test passes.
- *Run B, the selector mutated to take the candidate of higher RMS* (one
  line of `select_pose.ts`, reverted after the run): the better candidate is
  selected on **0 of 252**, the §6 test fails on every tilt step ("tilt 0°:
  expected +0 to be 12"), and with it C4's pin (the selected error 6.3 to
  25.2 px on every render) and C5 (median 52.6 px against 0.176). The mutation
  was reverted; the tree holds the selector as it was.

So the counts the addendum printed stand, and are now established by a check
that fails when they are false. On the 7 renders over C4's bound the
characterisation's item 1 had already established the same thing by
computing the rejected candidate's error (6.4 to 9.8 px); for the other 245
fits it is established here for the first time.

**"240 of 240" withdrawn.** The addendum says that from 10° on "IPPE's
selected pose is the closer of the two on 240 of 240 fits". The figure came
from the vacuous flag, and the sentence reads as a claim against the closed
form, which it is not. The measured claim, from the characterisation's
extended table (`test/pose/c4_characterisation.test.ts`, item 2): IPPE's
selected pose is closer to the truth than the closed form's on **217 of the
240 fits at S2's tilts of 10° to 50°** (27, 48, 48, 46 and 48 of 48), and on
260 of 288 when 15° is counted. C4 passing bounds a regression by the fit
residual and establishes nothing about IPPE being closer; **C5 and the
table's medians carry that claim**: medians over the 252 of 0.0845 px against
0.1757 px, and per step a ratio of medians of 0.86 at 10° and 0.31 to 0.43
from 15° to 50°. 217 of 240 is the result, and it stands on its own.

**What this correction does not change.** C1 to C3 and C6 to C11 as recorded;
C4's verdict, failed on 7 renders, all fronto-parallel; the mechanism; the
headless rates.
