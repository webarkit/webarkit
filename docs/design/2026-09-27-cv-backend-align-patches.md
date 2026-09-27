# `alignPatches`: patch alignment below the `CvBackend` contract

**Status:** Proposed. A contract addition to `@webarkit/cv-backend-spec`, which
has a second owner (@ThorstenBux); nothing here is agreed until that
conversation has happened. **No implementation accompanies this document**,
and §2 says why.
**Date:** 2026-09-27
**Author:** @kalwalt, with Claude
**Refs:** [ADR-0001](../adr/0001-nft-tracker-ts-reference-above-cvbackend.md)
points 3, 5 and 7; `packages/cv-backend-spec/src/cv_backend.ts`;
`packages/nft-tracker/src/tracking/align_patch.ts` and `track_frame.ts`;
[`docs/benchmarks/README.md`](../benchmarks/README.md#results-2026-09-26),
"Results (2026-09-26)"; issues #39 (pyramid scale step as a capability), #71
(spec Q11, the filter behind a patch's level image), #9 (the WebARKitLib-rs
adapter).

## 1. Summary

ADR-0001 point 3 says that when profiling shows a tracker-side step is too
slow, it moves below the contract as a new **optional** method with a
capability flag, the pattern `filterMatches` set. The first on-device
measurement of M2 (2026-09-26) found that step: patch alignment is 94–98% of
the tracking step's time, and the step is 2.6–3.2× ADR-0001 point 5's 8 ms
threshold at p95 on the reference device.

This document proposes the method: `alignPatches`, **one call per frame**,
which takes the frame, the target's patches and a predicted homography, and
returns where each patch landed, with the gain, bias and residual the tracker's
judgement reads. The backend owns everything in between — the warp of each
patch by the prediction, the depth of the frame pyramid, the pyramid itself and
the iteration. §4 gives the signature; §5 defines every output precisely
enough that a judgement computed above the contract means the same thing on
every backend; §6 says what a backend may assume; §7 counts what crosses the
boundary; §8 is the alternatives and why not; §9–§11 are the tracker side,
the tests the implementation owes and the tolerance regime, all deferred with
it.

## 2. Why no implementation accompanies this document

The branch that produced this document was scoped to design **and**
implement: the method in the contract, an implementation in
`@webarkit/cv-backend-jsfeatnext`, the tracker's fallback, and a measurement
of what the move buys. The design showed two reasons to stop at the document.

**2.1 This branch cannot discharge ADR-0001 point 5, and must not be read as
having done so.** Point 5 triggers the Rust port when a threshold is exceeded
**and** moving steps into the backend (point 3) has not brought the compute
back under it. On the jsfeatNext backend, `alignPatches` cannot be faster
than the tracker's own alignment, by construction: jsfeat-next has no
primitive to build on — its `optical_flow_lk` is Bouguet's forward-additive
flow on an unwarped square window over a step-2 pyramid, with no gain or bias,
so it cannot produce the fields the tracker reads — and so the backend's
implementation would be a TypeScript port of the reference, running in the
same engine, plus the cost of gathering the inputs into one call. An attempt
on a backend that cannot be faster does not test point 3; it builds the seam.
**The measurement point 5 asks for waits for the WebARKitLib-rs adapter
(#9).** This paragraph exists because the failure mode is specific: somebody
later reads "`alignPatches` was tried on jsfeatNext and did not help" as
point 3 having been exhausted, and triggers a Rust port on evidence that
proves nothing about it. Until a backend that runs alignment outside the
JavaScript engine has been measured against the reference on the same
recorded sequences, point 5's second condition is **untested**, not met.

**2.2 The marshalling cannot be designed blind.** A 97 KB frame is a view in
TypeScript and a copy in WASM; a lower bound of roughly zero, which is what a
TypeScript-to-TypeScript call would measure, does not inform the signature.
And the tuning pass, unblocked now that M2's measurement exists, acts on
exactly the two quantities that decide what crosses the boundary: the patch
count and the patch size (§7). If tuning lands on 32 patches of 8 × 8 rather
than 64 of 16 × 16, a contract designed for the latter would have been
designed for the wrong shape.

So: the design now, the implementation after the tuning pass, when there is
something real to measure and the patch geometry is settled. §12 says what
gates it.

## 3. Context: the numbers the design is for

Measured on `Tab_9_WiFi`, the reference device, over the three tracking clips
and the camera run, all at 270 × 360 with `examples/targets/pinball.wnft`'s
64 level-0 patches of 16 × 16
([benchmarks](../benchmarks/README.md#results-2026-09-26)):

| quantity | value |
|---|---|
| `trackStepMs` p50 / p95 | 12.2–20.4 / 20.4–25.6 ms |
| patch alignment's share of `trackStepMs` | 94–98% |
| frame pyramid levels built on TRACK frames | 1, on every one of 1,679 |
| `pyramidMs` p95 | 0.1 ms |
| the robust fit, p50 | 0.3–0.4 ms |
| ADR-0001 point 5, tracker-side threshold | 8 ms at p95 |

In Node on the development desktop, one patch's alignment on the camera path
costs about 65 µs, of which about 19 µs is the warp of its window by the
prediction (`preparePatch`), the rest the iteration (`alignPrepared`). The
device runs the step 3.0–3.3× slower than that desktop.

Two facts about how the reference works matter for the shape:

- **The warp comes first, and sizes the pyramid.** `trackFrame` warps every
  candidate patch at the prediction, asks `alignmentStart` which level each
  would start on, builds the pyramid exactly that deep (`frameLevelsFor`),
  and aligns the same warped windows. Each window is warped once a frame.
- **Nothing in alignment can be cached per target.** The steepest-descent
  images and the Hessian depend on the prediction's Jacobian at each sample,
  which changes every frame. Only the patch's own gradient is per-target, and
  it is cheap. So the contract's statelessness costs the alignment nothing.

## 4. The proposed contract addition

All additive, all optional, in `packages/cv-backend-spec/src/cv_backend.ts`.
The pattern is `filterMatches` exactly: an optional member, a kinds array on
`capabilities` that is empty when the member is absent, an explicit
unsupported kind throws `UnsupportedCapabilityError`, omitted options select
the reference defaults, and `if (cv.alignPatches) … else …` in the caller.

```ts
/** Patch-alignment estimators a backend may implement. */
export type PatchAlignerKind = "ic-lk"; // inverse-compositional Lucas–Kanade: translation, plus gain and bias

export interface BackendCapabilities {
    // ...existing fields...
    /** Empty when {@link CvBackend.alignPatches} is not implemented. */
    readonly patchAligners: readonly PatchAlignerKind[];
}

/**
 * Templates to find in a frame: Q patches of P × P grey values, each with the
 * affine map from its pixel grid to the target plane. Patch q's pixel (i, j)
 * sits at target point (originX[q] + j · pitch[q], originY[q] + i · pitch[q]).
 */
export interface PatchSet {
    readonly patchSize: number;      // P, integer >= 3
    readonly count: number;          // Q
    readonly pixels: Uint8Array;     // Q · P · P, row-major, P · P per patch
    readonly originX: Float64Array;  // Q, target units
    readonly originY: Float64Array;  // Q
    readonly pitch: Float64Array;    // Q, target units per patch pixel, finite, > 0
}

export interface AlignPatchesOptions {
    kind?: PatchAlignerKind;
    maxIterations?: number; // per level, integer >= 1. Reference default: 30
    epsilon?: number;       // a level converges when its translation step is below this, in that level's px. Reference default: 0.01
    photometric?: boolean;  // estimate gain and bias with the translation. Reference default: true
    maxLevels?: number;     // most multi-scale levels the backend may read, integer in [1, 256]. Reference default: 4
    scaleStep?: number;     // size ratio between those levels, finite, > 1. Reference default: the step the patches were cut with
}

/** Per-patch outcome codes in {@link PatchAlignments.status}. */
export type PatchStatus =
    | 0  // converged: x, y, residual, gain, bias are the result
    | 1  // unconverged: reached maxIterations; the fields hold the last estimate, not endorsed
    | 2  // outside-frame: the prediction puts something the window reads outside every level
    | 3; // singular: nothing to align — textureless patch, degenerate warp, or the gain collapsed

export interface PatchAlignments {
    readonly status: Uint8Array;      // Q
    readonly x: Float64Array;         // Q, frame px: where the patch centre landed
    readonly y: Float64Array;         // Q
    readonly residual: Float64Array;  // Q, RMS of (frame − gain · patch − bias) over the window, grey levels
    readonly gain: Float64Array;      // Q, exactly 1 when photometric is off
    readonly bias: Float64Array;      // Q, exactly 0 when photometric is off
    readonly iterations: Uint32Array; // Q, summed over levels
    readonly level: Uint8Array;       // Q, finest level the result was refined at; 0 is the frame
}

export interface CvBackend {
    // ...existing members...
    /**
     * Optional. Locates every patch in `frame`, starting each where `prediction`
     * (target → frame, any scale, H[8] ≠ 0) puts it, and returns a translation of
     * that warped window in frame pixels, with gain and bias when asked. Pure:
     * a function of its four arguments. Every returned array is a fresh copy
     * owned by the caller. A malformed frame, patch set, option or prediction is
     * a contract violation and throws; what varies per patch is a status.
     *
     * @throws {UnsupportedCapabilityError} if `options.kind` is given and is
     *         not in {@link BackendCapabilities.patchAligners}.
     */
    alignPatches?(
        frame: GrayImage,
        patches: PatchSet,
        prediction: Mat3,
        options?: AlignPatchesOptions,
    ): PatchAlignments;
}
```

Why the pieces are shaped as they are:

- **`PatchSet` is not the `.wnft` §5.7 table.** No level index, no scale step,
  no `Uint16` level coordinates. An origin and a pitch per patch are what the
  reference computes from those anyway (`trackTarget`), and they keep the
  target format out of the contract: a `PatchSet` can come from any source
  that can say where a template's pixels lie on the plane.
- **Statuses are codes in a `Uint8Array`**, not strings, for the same reason
  `HomographyResult.inliers` is: one fixed-shape buffer per output crosses a
  WASM boundary as one copy (ADR-0001 point 7, fixed-shape data), and the
  spec package's barrel stays declarations-only, so the codes are a type and
  a documented numbering rather than an exported constant.
- **`PatchStatus` keeps the unconverged estimate.** The reference returns a
  position for an alignment that hit its cap, with `converged: false`, and
  the tracker refuses to use it. The contract does the same: status 1 says
  "not endorsed", the fields say where it was.
- **`kind` names an estimator family**, as `MatchFilterKind` names GMS, so a
  later aligner (a forward-additive or ESM variant, an NCC search) can be
  added without another contract change. What the result *means* (§5) is
  the same for every kind; the kind is how it was found.
- **`scaleStep` and `maxLevels` are options, not capabilities**, because
  they describe the target the patches came from, not the backend. #39's
  `pyramidScaleStep` capability is about `detect`'s pyramid and is a
  separate matter.

## 5. Definitions

These are the contract's actual content. The gate the tracker applies to each
patch (§9) is computed above the contract from three of these numbers, so
they have to mean the same thing on every backend or the gate means nothing.

**5.1 Coordinates.** Frame coordinates are the contract's: pixel centres at
integer coordinates, level 0 the frame itself. `prediction` maps target
coordinates (the units of `originX`, `originY` and `pitch`) to frame level-0
coordinates, row-major, at any scale with `H[8] ≠ 0`; a homography and any
non-zero multiple of it are the same map, and nothing may depend on the
scale. Level `l` of any multi-scale representation the implementation builds
has scale `s_l = scaleStep^−l` and size `⌊w₀ · s_l⌋ × ⌊h₀ · s_l⌋`, and a
frame level-0 point `p` is `s_l · p` on it, with no half-pixel correction
(format spec §3, decision D2). This is what makes `level` in the result mean
the same thing everywhere.

**5.2 The window.** Patch `q`'s pixel `k = i · P + j` sits at target point
`(originX + j · pitch, originY + i · pitch)`. Its **predicted position** `p_k`
is that point under `prediction`. The patch's **centre** is its pixel grid's
centre, `(originX + pitch · (P − 1) / 2, originY + pitch · (P − 1) / 2)`. An
implementation MUST warp by the prediction: rotation, scale and perspective
come from `prediction` and are not re-estimated. Whether it evaluates the
homography at every pixel, as the reference does, or an affine approximation
at the centre, is its own choice, and shows up in the tolerance (§11).

**5.3 What is estimated.** A translation `d`, in frame level-0 px, of the
whole warped window: the implementation minimises, over `d` and, with
`photometric`, over `gain` and `bias`, the squared error of the model

    I(p_k + d) ≈ gain · T_k + bias     over the P² pixels k,

where `T_k` is the patch's stored value and `I` is the frame read at a
frame level-0 position. Without `photometric`, `gain` is exactly 1 and `bias`
exactly 0.

**5.4 `x`, `y`.** The patch centre's predicted position plus `d`: where the
centre landed, frame level-0 px. Valid for status 0 and 1.

**5.5 `gain`, `bias`.** The implementation's final estimate of the model's
photometric parameters at the returned `d`. With `photometric`, that estimate
MUST be the least-squares pair for that translation — the `(gain, bias)`
minimising `Σ_k (I(p_k + d) − gain · T_k − bias)²` — up to the
implementation's own convergence tolerance. (The reference's final values are
its last iterate's, which agree with the least-squares pair to within
`epsilon`'s effect; an implementation may recompute them at the final `d`.)
This is what makes the tracker's gate exact: for the least-squares pair, the
zero-normalised cross-correlation of the window with the patch is
`1 / √(1 + (residual / (gain · σ_T))²)`, with `σ_T` the patch's own standard
deviation — a quantity the tracker computes from the three returned numbers.

**5.6 `residual`.** `√( Σ_k (I(p_k + d) − gain · T_k − bias)² / P² )` at the
returned `d`, `gain` and `bias`, in grey levels, with `I` read on the level
named by `level`, the way the implementation read it during the iteration.
For status 3 it is whatever the implementation last computed, and a caller
MUST NOT read it.

**5.7 Reading the frame.** `I` is bilinear interpolation of a level's pixels.
A sample at `(x, y)` on a level of size `w × h` is defined for
`0 ≤ x ≤ w − 1`, `0 ≤ y ≤ h − 1` (a point on the last column or row reads the
pixel to its right and below, so that is the edge). What the implementation
reads per patch pixel beyond one sample — the reference reads a level finer
than the patch's own scale through a small footprint of samples that blurs
it to the patch's scale — is its own, documented where it is implemented.

**5.8 `level`, `iterations`, convergence.** `level` is the finest level the
returned estimate was refined on, 0 being the frame; which level an
implementation starts on and which it visits is its choice, documented, and
it MUST NOT read a level coarser than `maxLevels` allows. `iterations` counts
every iteration on every level visited. **Converged** (status 0) means the
last translation step on `level` was below `epsilon` in that level's pixels,
judged on the full step the solver proposed, not on a step shortened to stay
inside the level; reaching `maxIterations` on `level` first is status 1.

**5.9 Statuses 2 and 3.** *Outside-frame* (2): at the prediction, something
the implementation reads for the window lies outside every level it may use;
partial overlap does not count. Once an estimate moves, an implementation
keeps the window inside the level it is reading (by shortening the step, as
the reference does, or however it chooses) rather than failing.
*Singular* (3): there is nothing to align — the patch has no texture along
some direction (the alignment system is not positive definite; the reference
tests its smallest eigenvalue against a documented floor), the prediction
collapses the window (a Jacobian that is not invertible at some sample), or,
with `photometric`, the gain collapsed towards 0 during the iteration. A
tracker reads status 3 as a per-frame outcome, not a property of the patch.

**5.10 Contract violations throw; nothing else does.** A frame whose `width`
or `height` is not a positive integer or whose `data` is shorter than
`width · height`; a `PatchSet` whose `patchSize` is not an integer ≥ 3, whose
arrays are not `Q · P²` and `Q` long, or with a non-finite origin or a pitch
not finite and positive; an option out of the domain stated on it; a
`prediction` with a non-finite entry or `H[8] = 0`. These are the caller's
bugs, in the sense the contract already uses for a malformed image or a
9-element matrix that is not 9 long, and they throw the same way. Every
per-patch condition is a status. An explicit `kind` not in
`capabilities.patchAligners` throws `UnsupportedCapabilityError`.

**5.11 Purity and ownership.** `alignPatches` is a pure function of its four
arguments, held to the contract's purity rule like every optional member:
the same inputs give the same outputs whatever ran in between, there is no
random choice in it (the reference draws nothing; there is nothing to seed),
and internal scratch is allowed only where it cannot be observed. Every
returned array is a fresh allocation owned by the caller.

## 6. What the backend may assume

**About the frame:** the first `width · height` bytes of `data` are the
pixels, and any bytes after them are not — the rule `cv-backend-jsfeatnext`'s
`toMatrix` and the tracker's `firstPixels` already apply, so a pooled buffer
longer than the image is fine.

**About the patches:** that they were cut from a pyramid of ratio
`scaleStep` — the `.wnft` target's `pyramid.scaleStep`, passed through the
option — built with the reference filter (`buildFramePyramid`; format spec
open question Q11, #71), so that a patch and a frame level equally deep are
filtered alike. The backend cannot check this. A target compiled with another
filter adds a difference the backend cannot see, in gain and residual mostly
(the reference's measurement: patches of levels 0–5 read on a differently
blurred frame give a gain of 0.86–1.10 and a median position error of
0.016–0.042 px).

**About its own pyramid:** it builds whatever multi-scale representation it
needs, of at most `maxLevels` levels at ratio `scaleStep`, sized by §5.1's
rule. **Its downsampling filter is its own**, deterministic and documented
where it is implemented; the reference's is `buildFramePyramid`'s box-of-
triangle filter, which reproduces linear intensity exactly at every sampling
phase. The difference between filters is measured by the tolerance test on
a magnified view (§11), never assumed away. It chooses the start level: the
reference starts on the usable level where one patch pixel is nearest one
level pixel and refines on the finest usable level, and that rule is not part
of the contract.

**About the caller:** nothing. It does not know that the caller predicted
the homography with constant velocity, that a robust fit follows, or that a
gate at 0.6 will read its residuals. It returns measurements.

## 7. What crosses the boundary, per frame

One call per frame. On the camera path measured on the reference device,
270 × 360 with pinball's 64 patches of 16 × 16:

| direction | what | bytes |
|---|---|---|
| in | frame | 97,200 |
| in | patch pixels, origins, pitches | 17,920 |
| in | prediction, options | under 200 |
| out | eight arrays of 64 | about 3,000 |

The frame dominates. A TRACK frame then crosses the boundary once, exactly as
a DETECT frame already does through `detect`, and on a WASM backend that is
one copy into the heap: a few tens of microseconds for 100–300 KB on a mobile
CPU, against point 5's 3.3 ms boundary threshold. The patch set crosses every
frame because the contract is stateless, and §3 says why that costs the
alignment nothing it could otherwise have kept.

What tuning changes: the patch share. At 640 × 480 the frame is 307,200
bytes; 64 patches of 16 × 16 are 17,920; 32 patches of 8 × 8 would be 2,816.
The frame's share only grows. The count of output arrays does not change with
either.

## 8. Alternatives, and why not

**8.1 One call per patch.** `alignPatch(pyramid, patch, prediction)`, 64
times a frame — the reference's own shape, lifted as is. On a WASM backend
either the pyramid crosses 64 times or the backend keeps it between calls,
which is ADR-0001's rejected Option D (stateful primitives) in disguise. And
64 calls each pay the boundary's fixed cost, which is the very thing point 5's
first condition is about. Rejected.

**8.2 The whole tracking step.** `trackStep(frame, patches, previous,
current, options) → {H, quality, …}`: prediction, alignment, fit and
judgement together. It moves the thresholds that the tuning pass has not set
yet (`minTrackedPatches`, `maxOutlierShare`, `maxFitRms`, `minPatchZncc`)
into every backend, so tuning them means changing every backend; and ADR-0001
point 3 keeps work on tens of points — the fit, the judgement, the state
machine — above the line by design. Rejected.

**8.3 The caller builds the pyramid and hands it across.**
`alignPatches(pyramid, patches, prediction, options)` with an `ImagePyramid`
in the contract. It looks cheaper: on every measured tracking frame the
pyramid was one level, the frame itself, so nothing extra would cross, and
the backend would never build a pyramid, so no filter question. **The
double warp decides against it.** The tracker chooses the depth by warping
every candidate patch at the prediction first, since which levels can hold a
window is not monotone in depth (level sizes round down; a magnified patch
reads through footprints that reach past its window; a first version that
sized the pyramid by scale alone lost patches at frame edges in review). That
warp is the first half of the reference's alignment, about 19 of the 65 µs a
patch costs in Node. If the alignment moves below the contract the backend
must warp again, so a caller-built pyramid either pays the warp twice —
about a third of what the move is meant to remove — or the tracker adopts a
cheaper depth rule for the backend path, which changes M2's behaviour at
frame edges. Letting the backend own the depth removes the dilemma: whoever
warps chooses the depth and builds the levels. It also moves point 3's first
candidate, the pyramid, with the third, at no cost when the depth is one
(the common case) and saving the 3–6 ms a four-level pyramid costs on the
tablet when a target is seen close. Rejected, for the double warp.

**8.4 A shared package for the alignment, imported by both the tracker and
the backend.** Bit-identical numbers and no duplication — and no
measurement: the backend would be the reference calling itself. It also puts
a third runtime dependency under a backend whose AGENTS.md confines it to the
spec and jsfeat-next. Rejected.

**8.5 jsfeat-next's `optical_flow_lk` as the jsfeatNext implementation.** A
different algorithm (§2.1): it cannot produce `gain`, `bias` or a residual
after them, its window is an unwarped square, and its pyramid is
`pyrdown`'s step 2. It would fail the tolerance test by design. Rejected.

## 9. The ZNCC gate stays above the contract

The tracker refuses a converged patch whose zero-normalised cross-correlation
with its template is below `minPatchZncc` (0.6): a window that converged on
flat background, gain collapsing towards 0 without reaching singular, agrees
with whatever prediction put it there, and in the sequence tests twelve such
patches once "tracked" a target 232 px off with a fit residual under
`maxFitRms`. The gate is computed from `residual`, `gain` and the patch's own
spread (`track_frame.ts`).

The case for putting it **below**: the backend holds the window's samples and
could compute the true correlation directly, for free, where the tracker
recovers it from three numbers. The case for keeping it **above**, which
wins: it is a threshold decision, `minPatchZncc` is provisional and the tuning
pass will move it, and backends must agree on measurements, not verdicts. A
threshold inside the contract would have to be an option every backend
honours identically, and the tracker would still need the three numbers for
its statistics. Above, the gate costs 64 square roots a frame. What it puts
on the contract instead is §5.5 and §5.6: `gain` as the least-squares factor
at the final translation and `residual` as the RMS after it, so the identity
the gate relies on holds for any backend. A contract that returned a "residual"
with a looser meaning would make the gate compare different things on
different backends, which is worse than a gate below the line.

## 10. The tracker side (deferred with the implementation)

**Fallback.** A backend without the capability gets the existing TypeScript
path, untouched: `trackFrame` keeps its current code as the reference branch
and gains a second branch that calls `alignPatches` and maps statuses onto
the same `PatchOutcome` codes, so `TrackStats`, `quality`, the ZNCC gate, the
fit and the judgement are shared code. `trackTarget` builds the `PatchSet`
once per target from the §5.7 table: `originX = left / s_l`,
`originY = top / s_l`, `pitch = 1 / s_l`, with `s_l = levelScale(scaleStep,
level)`. `packages/nft-tracker/src/` still imports no backend: it calls
`cv.alignPatches` through the contract.

**The option.** `NftTrackerOptions.alignment?: "auto" | "reference" |
"backend"`, default `"auto"`: use the backend's method when
`capabilities.patchAligners` is non-empty, else the reference. `"reference"`
forces the tracker's own path on a backend that declares the capability —
the equivalence test needs that, and so does anyone bisecting a difference.
`"backend"` refuses, at construction, a backend that does not declare it,
rather than silently running the reference. The `TrackResult` says which ran.

**Status to outcome.** 0 → the ZNCC gate, then `Observed` or `Rejected`;
1 → `Unconverged`; 3 → `Lost`; 2 → `Culled`. The last is the one seam
between the two paths: the reference culls a patch by four corner
projections on level 0 before aligning it, and counts a patch that passes the
cull but that `alignPatch` then finds usable on no level as attempted and
`Failed`. The two tests agree exactly on a point-sampled level, and differ
only for a patch magnified past `√scaleStep`, whose footprint reaches beyond
its window: the reference counts it as attempted and failed, the backend path
as culled. That is a difference in `culled` versus `failed` on a rare patch
at a frame edge — `quality`'s denominator moves by one — and never in the
pose. It is documented, and not fixed by adding an index list to the
signature.

**Timings.** `alignMs` covers the backend call on the backend path, so the
two paths are compared on the same field.

## 11. The tests the implementation owes

**11.1 Equivalence, exact.** The tracker on a backend that does not declare
the capability produces results bit-identical to today's: the M2 fixture
suites (`track_frame.test.ts`, `tracker_state_machine.test.ts`, the parity
tests) run unchanged, and an explicit test runs the same frames through the
jsfeatNext backend with `alignPatches` hidden behind a `Proxy` and asserts
the pinned counts, homographies and outcomes. This is a test on fixtures, not
a claim.

**11.2 Agreement, within a tolerance.** The jsfeatNext implementation is a
port **from this document's text**, not from the reference's source — the
discipline `crates/wnft-format` was written under, so that the text is the
artefact and two implementations expose what it leaves ambiguous. So the two
paths are not bit-identical, and the test asserts agreement within a
tolerance on the M2 fixture frames (two views, several renders, predictions
up to 6 px, 4° and 8% off): per patch, the difference in `x` and `y` between
the paths; the observed set; the fitted homographies' RMS over the patch
centres. **The tolerance is measured before the assertion is written, and
justified independently of it:** the reference's own error against the truth
on the accuracy suite is 0.016–0.042 px at the median and 0.28 px at the 95th
percentile across patch levels, so two implementations each that far from
the truth may differ by about that at the tail, and a tolerance in that range
is one the alignment's own accuracy justifies. The magnified view (a patch
seen at twice its scale) is in the fixture set so that the filter difference
of §6 is measured rather than assumed. **The tolerance is never widened to
make a test pass**; a difference outside it is a finding about one of the two
implementations, or about this text, and is decided before code changes.
That rule was broken inside #66 and caught in review.

**11.3 Conformance, in the spec package.** `conformance.test.ts` gains a
seam suite like `filterMatches`'s: a backend without the method declares an
empty `patchAligners` and the documented skip pattern runs; an explicit
unsupported kind throws `UnsupportedCapabilityError` naming the supported
set; a stub implementation's outputs are owned by the caller.

**11.4 The purity probe.** `findPurityViolations` in
`@webarkit/cv-backend-spec/purity` gains `alignPatches` when the backend
declares it: two calls on identical inputs with an unrelated call between
them, compared array for array, and a coverage count of patches that reached
status 0 so a vacuous pass can be refused. The contract already says optional
members are optional, not impure; the probe should be able to say so.

## 12. What gates the implementation, and what it will measure

The implementation starts after **both**:

1. **The tuning pass**, which sets the patch count and size and the
   judgement's thresholds. Until then §7's second table is a guess.
2. **The WebARKitLib-rs adapter (#9)**, or any backend that runs alignment
   outside the JavaScript engine. Until then the only implementation possible
   is a TypeScript port on jsfeatNext, which §2.1 explains cannot measure
   point 3.

What it will measure, then: `alignMs` and `trackStepMs` on the recorded
clips, reference path against backend path, on the reference device — Node
first through `packages/nft-tracker/scripts/bench-tracking.mjs` with both
paths, then on the tablet through the bench page with a path switch, the
exports read against the 2026-09-26 results. Point 5's second condition is
answered by that comparison and by nothing before it.

The jsfeatNext implementation is still worth writing when that time comes,
for the reason §11.2 gives: it is the second implementation of this text.

## 13. Open questions for the contract conversation

- Whether `PatchStatus` should be an exported constant after all, which
  would put a runtime value in the spec's barrel, or stay a documented
  numbering as proposed.
- Whether §5.5 should require the least-squares pair exactly (an
  implementation recomputes it at the final translation) rather than up to
  the convergence tolerance. Exact is cleaner for the gate's identity; "up to
  tolerance" is what the reference does today.
- Whether a future `PatchAlignerKind` may return a different photometric
  model — the model is fixed at gain-and-bias here, and a kind that estimated
  none, or more, would need the fields' meaning restated.
- #39: whether the target's `scaleStep` should be validated against a
  backend's declared `pyramidScaleStep` once that capability exists, or stay
  independent as proposed.
