/*
 *  types.ts
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

/**
 * Types and signatures of the tracking state (milestone M2, issue #48).
 *
 * This file is the contract three parallel branches implement against:
 * A — {@link SelectPatches} (`select_patches.ts`); B — {@link BuildFramePyramid}
 * and {@link AlignPatch} (`frame_pyramid.ts`, `align_patch.ts`); C —
 * {@link RobustHomography} and {@link PredictHomography}
 * (`robust_homography.ts`, `predict_homography.ts`). A branch edits its own
 * files only; changing anything here is a coordinated change across all three.
 *
 * Every implementation keeps these rules:
 *
 * 1. **Coordinates** (format spec §3). Integer coordinates are pixel centres.
 *    Every position is in level-0 coordinates unless its doc says otherwise.
 *    A point `x_l` on level `l` of a pyramid with step `scaleStep` is
 *    `x0 = x_l / s_l`, no half-pixel correction (decision D2), where `s_l`
 *    is **always** `levelScale(scaleStep, l)` — never a branch's own
 *    arithmetic (see `level_scale.ts` for why). The target and the frame
 *    each have their own level-0 space; every homography here maps TARGET
 *    level-0 → FRAME level-0, row-major. Homographies a function returns are
 *    scaled so `H[8] = 1`; homographies it receives are accepted at any scale
 *    with `H[8] ≠ 0`. `PatchTable.left/top` are the one exception to level-0:
 *    level coordinates of the patch's own level (§5.7).
 * 2. **Pure and deterministic.** No input is mutated. The result depends only
 *    on the arguments: no RNG (there is no random choice anywhere in the
 *    tracking state, so no RNG is injected either), no clock, no global
 *    state. Iteration and tie-break orders are fixed and documented, so the
 *    same input gives bit-identical output on the same engine.
 * 3. **Explicit failure, never NaN.** Degenerate input returns
 *    `{ ok: false, reason }`, and an `ok: true` result holds only finite
 *    numbers. The degenerate cases include at least: fewer than four usable
 *    patches or correspondences; a patch window outside the frame; a singular
 *    linear system; non-finite input.
 * 4. **Bounded iteration.** Every loop that iterates to convergence is capped
 *    by its options. Reaching the cap is reported (`converged: false`), not a
 *    failure.
 * 5. **Float64 for geometry** (ADR-0001 point 7); pixels stay `Uint8Array`.
 *
 * **Stubs.** Until a function is implemented, its file annotates it as
 * {@link Stub}`<Signature>`, which adds a `"not-implemented"` failure without
 * touching the shared unions below. Implementing it means changing that one
 * annotation to `Signature` in the branch's own file; nothing in this file
 * changes.
 */

import type { GrayImage, Mat3, PointArray } from "@webarkit/cv-backend-spec";
import type { PatchTable } from "../target/types.js";

/**
 * A signature whose implementation does not exist yet: same parameters, and
 * the result widened with a `"not-implemented"` failure. Used only as the
 * annotation of a stub, in the stub's own file.
 */
export type Stub<F extends (...args: never[]) => unknown> = (
    ...args: Parameters<F>
) => ReturnType<F> | { readonly ok: false; readonly reason: "not-implemented" };

/**
 * How a frame's result was obtained — `TrackResult.state`.
 *
 * `"LOST"`: no pose. `"DETECT"`: pose from the detection pipeline
 * (detect/describe/match). `"TRACK"`: pose from patch tracking.
 */
export type TrackingState = "LOST" | "DETECT" | "TRACK";

/**
 * A grey image pyramid.
 *
 * Level 0 is the full-resolution image; level `l` has size
 * `(w0 · s_l) | 0` × `(h0 · s_l) | 0` with `s_l = levelScale(scaleStep, l)`
 * — the rule `build_from_image` records as `levelSizes` (§5.4), so a target
 * pyramid built this way matches its file's sizes. Sizes are as produced,
 * never recomputed.
 */
export interface ImagePyramid {
    /** Size ratio between consecutive levels. Finite and `> 1`. */
    readonly scaleStep: number;
    /** Level 0 first; at least one level; every level at least 1×1. */
    readonly levels: readonly GrayImage[];
}

/**
 * The live frame's pyramid, for coarse-to-fine patch alignment.
 *
 * `levels[0]` is the frame itself, by reference, not a copy — so a caller
 * must not mutate the frame while its pyramid is in use.
 */
export type FramePyramid = ImagePyramid;

export interface FramePyramidOptions {
    /** Number of levels, an integer in `[1, 256]` (level indices stop at `MAX_LEVEL`, 255). */
    readonly levels: number;
    /** See {@link ImagePyramid.scaleStep}. */
    readonly scaleStep: number;
}

export type FramePyramidFailure =
    /**
     * `levels` not an integer in `[1, 256]`, or `scaleStep` non-finite or
     * `≤ 1`, or so large that a requested level's scale underflows to 0.
     */
    | "invalid-options"
    /** Width or height not a positive integer, or `data.length ≠ w · h`. */
    | "invalid-frame"
    /** Some requested level would be smaller than 1×1. */
    | "level-too-small";

export type FramePyramidResult =
    | { readonly ok: true; readonly pyramid: FramePyramid }
    | { readonly ok: false; readonly reason: FramePyramidFailure };

/**
 * Builds a grey pyramid (branch B): the live frame's, once per tracking frame,
 * and — at compile time — the target's, which {@link SelectPatches} cuts its
 * patches from. Using this one function for both is what makes the stored
 * patches photometrically comparable with the frame levels they are aligned
 * in.
 *
 * The downsampling filter is the implementation's choice, but it must be
 * deterministic and documented where it is implemented. Format spec §5.7
 * does not say which filter produced a level's image; that gap is the spec's
 * open question Q11, not settled here.
 */
export type BuildFramePyramid = (
    frame: GrayImage,
    options: FramePyramidOptions,
) => FramePyramidResult;

export interface SelectPatchesOptions {
    /** `P`, the patch edge in pixels. Integer `≥ 3` (gradients need a border). */
    readonly patchSize: number;
    /** Upper bound on `Q`. Integer `≥ 4`. */
    readonly maxPatches: number;
    /** Minimum Shi–Tomasi score, `≥ 0`, in the units of `PatchTable.score`. */
    readonly minScore: number;
    /**
     * Minimum distance between two selected patch centres, in level-0 px,
     * `≥ 0`. Applied across all levels, not within each one.
     */
    readonly minSpacing: number;
}

export type PatchSelectionFailure =
    /** An option out of the domain stated on {@link SelectPatchesOptions}. */
    | "invalid-options"
    /**
     * Not a valid {@link ImagePyramid}, or one no `.wnft` can hold: more than
     * 256 levels (`level` is `u8`, §5.7) or a level-0 side above 65535 (the
     * `[1, 2^16 − 1]` range of §5.4, which also keeps `left`/`top` within
     * their `u16`, §5.7). A level smaller than `patchSize` is skipped, not an
     * error.
     */
    | "invalid-pyramid"
    /** Fewer than four patches qualify — too few for a homography. */
    | "too-few-patches";

export type PatchSelection =
    | { readonly ok: true; readonly patches: PatchTable }
    | { readonly ok: false; readonly reason: PatchSelectionFailure };

/**
 * Chooses the target's tracking patches at compile time (branch A) and
 * returns them as the §5.7 table.
 *
 * `target` is built by {@link BuildFramePyramid} with the target's
 * `scaleStep`, and must have exactly the target's `pyramid.levelSizes.length`
 * levels, of exactly those sizes — otherwise a patch could reference a level
 * the file does not have (§5.7, `INCONSISTENT_DATA`). The compiler guarantees
 * that; this function checks only what {@link PatchSelectionFailure} lists.
 *
 * Levels smaller than `patchSize` in either dimension contribute no patches.
 * Every returned patch satisfies §5.7's bounds rule against `target.levels`.
 * Its pixels are copied verbatim from its level's image, with no smoothing
 * (§5.7), and `left`/`top` are level coordinates. Selection is greedy in this
 * order: score descending, ties broken by (level, top, left) ascending, with
 * scores compared as the `f32` values that are stored. §5.7 does not fix the
 * score's units; the implementation documents its gradient operator and
 * normalisation.
 */
export type SelectPatches = (target: ImagePyramid, options: SelectPatchesOptions) => PatchSelection;

export interface AlignPatchOptions {
    /** Iteration cap per frame level. Integer `≥ 1`. */
    readonly maxIterations: number;
    /** Converged when a level's translation update is below this, in that level's px. `> 0`. */
    readonly epsilon: number;
    /** Estimate an affine intensity model (gain, bias) alongside the translation. */
    readonly photometric: boolean;
}

/**
 * Where one patch landed in the frame (branch B), in FRAME level-0
 * coordinates.
 *
 * The correspondence's target-side point is the patch centre in TARGET
 * level-0 coordinates: `((left + (P − 1) / 2) / s_l, (top + (P − 1) / 2) / s_l)`,
 * with `l` the patch's level and `s_l = levelScale(targetScaleStep, l)`.
 */
export interface PatchObservation {
    /** `q`, the patch's row in the `PatchTable`. */
    readonly index: number;
    /** Frame level-0 position of the patch centre. */
    readonly x: number;
    /** Frame level-0 position of the patch centre. */
    readonly y: number;
    /** RMS of the final intensity difference over the P×P window, grey levels, after gain/bias. */
    readonly residual: number;
    /** `false` when the iteration cap was reached first. */
    readonly converged: boolean;
    /** Iterations spent, summed over levels. */
    readonly iterations: number;
    /** Finest frame pyramid level the result was refined at. */
    readonly frameLevel: number;
    /** Multiplicative intensity factor; exactly 1 when `photometric` is off. */
    readonly gain: number;
    /** Additive intensity offset, grey levels; exactly 0 when `photometric` is off. */
    readonly bias: number;
}

export type PatchAlignmentFailure =
    /** An option out of the domain stated on {@link AlignPatchOptions}. */
    | "invalid-options"
    /**
     * `frame` is not a valid {@link ImagePyramid}: no levels, more than 256,
     * a `scaleStep` non-finite or `≤ 1`, or a level whose `data.length` is
     * not `width · height`. Checked before any level is read, so a hand-built
     * pyramid fails here instead of reaching `levelScale`'s contract check.
     */
    | "invalid-pyramid"
    /**
     * `q` not an integer in `[0, count)`; `targetScaleStep` non-finite,
     * `≤ 1`, or so large that the patch's level scale underflows to 0;
     * `patchSize < 3` (§5.7 allows 1 and 2, but alignment needs a gradient
     * border); or `pixels.length ≠ count · P²`.
     */
    | "invalid-patch"
    /** The prediction has a non-finite entry, or maps the patch centre to infinity. */
    | "non-finite-prediction"
    /**
     * No frame level is usable. A level is usable when the warped P×P
     * window, plus the border its interpolation and gradients read, lies
     * entirely inside that level; partial overlap does not count.
     */
    | "outside-frame"
    /** The alignment system is singular — a textureless patch. */
    | "singular";

export type PatchAlignment =
    | { readonly ok: true; readonly observation: PatchObservation }
    | { readonly ok: false; readonly reason: PatchAlignmentFailure };

/**
 * Aligns one patch in the frame by inverse-compositional Lucas–Kanade,
 * coarse to fine (branch B).
 *
 * The template is warped into the frame by `prediction`, which carries the
 * rotation, scale and perspective; alignment then estimates a 2D translation
 * of the patch centre, plus gain and bias when `photometric` is set. Which
 * frame level coarse-to-fine starts at is the implementation's choice,
 * documented there; it refines down to the finest usable level.
 */
export type AlignPatch = (
    frame: FramePyramid,
    patches: PatchTable,
    q: number,
    targetScaleStep: number,
    prediction: Mat3,
    options: AlignPatchOptions,
) => PatchAlignment;

export interface RobustHomographyOptions {
    /** Iteration cap. Integer `≥ 1`. */
    readonly maxIterations: number;
    /** Tukey biweight cutoff `c`, frame level-0 px, `> 0`. See {@link RobustHomography}. */
    readonly tukeyC: number;
    /** Converged when the weighted RMS residual changes by less than this, px. `> 0`. */
    readonly epsilon: number;
}

export type RobustHomographyFailure =
    /** An option out of the domain stated on {@link RobustHomographyOptions}. */
    | "invalid-options"
    /** Lengths differ or are odd, or a non-finite value in `src`, `dst` or `initial`. */
    | "invalid-input"
    /** Fewer than four correspondences. */
    | "too-few-points"
    /** Fewer than four points keep a non-zero weight. */
    | "too-few-inliers"
    /**
     * A singular system (e.g. collinear points), or a fitted H whose `H[8]`
     * is 0 or non-finite, so it cannot be scaled to `H[8] = 1`. What counts
     * as singular is a threshold the implementation documents.
     */
    | "singular";

export type RobustHomographyResult =
    | {
          readonly ok: true;
          /** Target level-0 → frame level-0, `H[8] = 1`. */
          readonly H: Mat3;
          /** `w_i` per correspondence at the final H, in `[0, 1]`. */
          readonly weights: Float64Array;
          /** Correspondences with `w_i > 0`. */
          readonly numInliers: number;
          /** `√(Σ w_i · r_i² / Σ w_i)`, frame level-0 px. */
          readonly rmsError: number;
          readonly iterations: number;
          readonly converged: boolean;
      }
    | { readonly ok: false; readonly reason: RobustHomographyFailure };

/**
 * Fits H to patch correspondences by IRLS with Tukey's biweight (branch C).
 *
 * `src` holds target level-0 points and `dst` frame level-0 points,
 * interleaved as in the contract's `estimateHomography`. It starts from
 * `initial` — the prediction — and draws no random samples: no RANSAC.
 *
 * Every implementation uses the same residual and weight, because
 * `TrackResult.quality` in the TRACK state is built from these weights:
 *
 * - `r_i = ‖π(H · src_i) − dst_i‖₂`, the forward transfer error in frame
 *   level-0 px, with `π` the perspective division;
 * - `w_i = (1 − (r_i / c)²)²` for `r_i < c`, else `0` (Tukey's biweight,
 *   `c = tukeyC`).
 */
export type RobustHomography = (
    src: PointArray,
    dst: PointArray,
    initial: Mat3,
    options: RobustHomographyOptions,
) => RobustHomographyResult;

export type HomographyPredictionFailure =
    /**
     * `previous` is not invertible, or the prediction's `H[8]` is 0 so it
     * cannot be scaled to `H[8] = 1`. The threshold is documented by the
     * implementation.
     */
    | "singular"
    /** A non-finite entry in an input, or a prediction that is not finite. */
    | "non-finite";

export type HomographyPrediction =
    | { readonly ok: true; readonly H: Mat3 }
    | { readonly ok: false; readonly reason: HomographyPredictionFailure };

/**
 * Constant-velocity prediction of the next frame's H (branch C).
 *
 * The motion between the last two frames, `V = current · previous⁻¹` (frame
 * to frame), is applied once more: `V · current`, scaled to `H[8] = 1`, as a
 * new array. `previous = null` (the first frame after detection) predicts
 * `current` itself. The model is frame-indexed and assumes equal intervals:
 * a dropped or coalesced frame is under-predicted. That limitation is
 * accepted until tracking data shows it matters.
 */
export type PredictHomography = (previous: Mat3 | null, current: Mat3) => HomographyPrediction;
