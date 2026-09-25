/*
 *  track_frame.ts
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
 * One frame of the tracking state: predict, cull, build the frame pyramid
 * once, align every visible patch, fit, judge. Pure: the state it needs —
 * the last two homographies — is passed in, and `NftTracker` keeps it.
 *
 * **Per-patch outcomes** ({@link PatchOutcome}) are read from `alignPatch`'s
 * result, never inferred:
 *
 * - `"singular"` is a patch that **lost** its target this frame: with gain
 *   and bias estimated, that is how an alignment that finds no match ends —
 *   the fitted gain collapses (align_patch.ts, point 6). It gives no
 *   correspondence, and is not a property of the patch: next frame it is
 *   aligned again.
 * - `converged: false` gives no correspondence either: the aligner endorsed
 *   no position. Measured on pinball at the camera path's scale, feeding
 *   those positions to the fit left translation survival unchanged but broke
 *   it at 3° of rotation and 5% of scale.
 * - Any other failure is **failed**; with the cull below it is rare.
 * - A converged alignment whose zero-normalised cross-correlation with its
 *   patch is below `minPatchZncc` is **rejected**: it converged, but on
 *   something that does not look like the patch. With gain `g` and residual
 *   `r` from `alignPatch`, and `σ_T` the patch's own spread, the ZNCC of the
 *   window with `g · T + bias` is `1 / √(1 + (r / (g · σ_T))²)` — the
 *   residual relative to the contrast the fit found, which the bare
 *   `r / g` is not. Its purpose is the window that holds nothing: on flat,
 *   noisy background the gain collapses towards 0 without reaching
 *   `"singular"`, the patch "converges" where it was put, and a set of such
 *   patches agrees with whatever prediction put them there.
 *
 *   Measured over 2 views × 5 renders of pinball, predictions up to 6 px,
 *   4° and 8% off: right alignments (35 258) had a ZNCC of 0.91 at the
 *   median, 0.71 at the 5th percentile and 0.62 at the 1st; an earlier
 *   measurement found those that converged on background at 0.38 at the
 *   median. In a leave-and-return
 *   sequence, a detection 200 px off on a half-visible target was then
 *   "tracked" 232 px off on twelve such patches, gains 0.001–0.11, with a
 *   fit residual of 0.57 px — under `maxFitRms`, which it could not catch.
 *
 * **Culled** patches — whose four corner samples the prediction does not put
 * inside the frame, where no frame level could hold them — are never passed
 * to `alignPatch`, and so count neither in `attempted` nor in `quality`
 * (tracker.ts's definition).
 *
 * **The judgement.** A frame is lost when fewer than `minTrackedPatches`
 * correspondences remain; when `robustHomography` fails; when it gives
 * weight 0 to more than `maxOutlierShare` of them — past #64's measured
 * breakdown (every outlier rejected in 2000 seeds of 2000 up to 45%,
 * failures from 50%), where the fit may have locked onto the outliers; when
 * fewer than `minTrackedPatches` of them keep a weight; or when their
 * weighted RMS residual is above `maxFitRms`.
 *
 * The last two, and the ZNCC gate, catch what the first three cannot: a fit
 * that is wrong although most of its correspondences are right.
 * `robustHomography` starts weighting at the prediction, so once the
 * prediction is about `tukeyC` off, the right correspondences start near
 * weight 0 and a few wrong ones near the prediction decide the fit — the
 * precondition its own notes state. Without the gate and these rules, 5 of
 * 32 steps from 4 px off are accepted 3.7–10.3 px off the truth, and 9 of 32
 * from 6 px 5.3–14.2 px off; with them, none (track_frame.test.ts). They
 * narrow the wrong fits without separating them, though: from 4° of roll,
 * or past 8% of scale, fits up to 9.4 px off keep 8–13 inliers and a
 * residual among the right fits' own, and are accepted. Measured on 2 views × 5 renders,
 * 137 predictions each (track_frame.test.ts pins one render): right fits kept
 * at most 0.370 px of residual and at least 12 inliers; of the 38 wrong fits
 * the other rules passed, `maxFitRms` refused 14 and the rest were accepted.
 * `tracker.ts` gives what tighter values would cost; the tuning pass sets
 * them.
 */

import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import type { PatchTable } from "../target/types.js";
import { alignPrepared, preparePatch } from "./align_patch.js";
import { frameLevelsFor } from "./frame_levels.js";
import { buildFramePyramid } from "./frame_pyramid.js";
import { levelScale } from "./level_scale.js";
import { predictHomography } from "./predict_homography.js";
import { robustHomography } from "./robust_homography.js";
import type { AlignPatchOptions, RobustHomographyOptions } from "./types.js";

/** A target's patches with the geometry every frame reuses, computed once. */
export interface TrackTarget {
    readonly patches: PatchTable;
    /** The target's pyramid step; the frame's pyramid is built with it too. */
    readonly scaleStep: number;
    /** Every patch centre, target level-0 px, interleaved `(x, y)`: the fit's `src`. */
    readonly centres: Float64Array;
    /** `s_l` of every patch's level. */
    readonly patchScales: Float64Array;
    /** Every patch's own intensity spread `σ_T`, grey levels: the ZNCC's scale. */
    readonly patchSpreads: Float64Array;
}

/**
 * The geometry of `patches`, once. Centres follow types.ts's rule for a
 * correspondence's target-side point, `((left + (P − 1)/2) / s_l, …)`, with
 * `s_l` from `levelScale` (which throws on a step it cannot use: a target
 * that reaches here has been decoded or built, so its step is valid). Each
 * patch's spread is the standard deviation of its `P²` stored pixels.
 */
export function trackTarget(patches: PatchTable, scaleStep: number): TrackTarget {
    const Q = patches.count;
    const P = patches.patchSize;
    const n = P * P;
    const half = (P - 1) / 2;
    const centres = new Float64Array(2 * Q);
    const patchScales = new Float64Array(Q);
    const patchSpreads = new Float64Array(Q);
    for (let q = 0; q < Q; q++) {
        const s = levelScale(scaleStep, patches.level[q]);
        patchScales[q] = s;
        centres[2 * q] = (patches.left[q] + half) / s;
        centres[2 * q + 1] = (patches.top[q] + half) / s;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += patches.pixels[q * n + i];
        const mean = sum / n;
        let squares = 0;
        for (let i = 0; i < n; i++) squares += (patches.pixels[q * n + i] - mean) ** 2;
        patchSpreads[q] = Math.sqrt(squares / n);
    }
    return { patches, scaleStep, centres, patchScales, patchSpreads };
}

/** What happened to each patch this frame, one code per patch in `outcomes`. */
export const PatchOutcome = {
    /** Not passed to `alignPatch`: its predicted window is not inside the frame, or there was no prediction. */
    Culled: 0,
    /** Converged and kept: a correspondence of the fit. */
    Observed: 1,
    /** Reached `alignPatch`'s iteration cap: no position. */
    Unconverged: 2,
    /** `alignPatch` said `"singular"`: the patch lost its target this frame. */
    Lost: 3,
    /** Converged, but correlating with its patch below `minPatchZncc`. */
    Rejected: 4,
    /** Any other `alignPatch` failure. */
    Failed: 5,
} as const;

/** Why a tracking step failed. */
export type TrackLoss =
    /** `predictHomography` failed on the last two poses. */
    | "no-prediction"
    /**
     * Fewer than `minTrackedPatches` correspondences survived alignment, or
     * kept a weight in the fit.
     */
    | "too-few-patches"
    /** `robustHomography` returned no fit. */
    | "fit-failed"
    /** The fit gave weight 0 to more than `maxOutlierShare` of the correspondences. */
    | "too-many-outliers"
    /** The fit's weighted RMS residual is above `maxFitRms`: its correspondences disagree. */
    | "poor-fit";

/**
 * A step's patch counts: `culled + attempted = patches.count`, and the five
 * outcomes of attempted patches sum to `attempted`.
 */
export interface TrackStats {
    /** Frame pyramid levels built (1: the frame alone); 0 when no prediction was made. */
    readonly frameLevels: number;
    readonly culled: number;
    /** Patches passed to `alignPatch`: `quality`'s denominator. */
    readonly attempted: number;
    readonly observed: number;
    readonly lost: number;
    readonly unconverged: number;
    readonly rejected: number;
    readonly failed: number;
    /** The fit's correspondences with weight > 0; 0 when no fit ran or it failed. */
    readonly inliers: number;
    /** The fit's weighted RMS residual, frame px; `null` when no fit ran or it failed. */
    readonly rmsError: number | null;
    /** The fit's IRLS iterations; 0 when no fit ran or it failed. */
    readonly fitIterations: number;
    /**
     * Whether the fit stopped by converging rather than at `fit.maxIterations`;
     * `null` when no fit ran or it failed. A fit stopped at the cap is still a
     * weighted least-squares H, and is judged by the same rules as any other:
     * they read its weights and residual, not how it got there. Measured on
     * the camera path's two views, 3 renders each, predictions 0–6 px off in
     * 16 directions: 1 of 484 fits reached the default cap of 20, from 6 px
     * off, and was refused as poor-fit — as it still was converging after 31
     * iterations with a cap of 200. Every accepted fit converged within 10.
     */
    readonly fitConverged: boolean | null;
}

/** The fit's share of {@link TrackStats}. */
type FitStats = Pick<TrackStats, "inliers" | "rmsError" | "fitIterations" | "fitConverged">;

/** Where a step's time went, ms, by the injected clock. */
export interface TrackStepTimings {
    /** The whole step: prediction, cull, pyramid, alignment, fit, judgement. */
    readonly trackMs: number;
    readonly pyramidMs: number;
    readonly alignMs: number;
    readonly fitMs: number;
}

export interface TrackFrameOptions {
    readonly maxFrameLevels: number;
    readonly align: AlignPatchOptions;
    readonly fit: RobustHomographyOptions;
    readonly minTrackedPatches: number;
    readonly maxOutlierShare: number;
    readonly maxFitRms: number;
    readonly minPatchZncc: number;
}

export type TrackFrameResult =
    | {
          readonly ok: true;
          /** Target level-0 → frame level-0, `H[8] = 1`. */
          readonly H: Mat3;
          /** Σ weights ÷ `stats.attempted`, in `[0, 1]`. */
          readonly quality: number;
          /** The fit's weights, one per observed patch, in patch order. */
          readonly weights: Float64Array;
          readonly stats: TrackStats;
          readonly outcomes: Uint8Array;
          readonly timings: TrackStepTimings | null;
      }
    | {
          readonly ok: false;
          readonly loss: TrackLoss;
          readonly stats: TrackStats;
          readonly outcomes: Uint8Array;
          readonly timings: TrackStepTimings | null;
      };

/**
 * One tracking step. `previous`/`current` are the last two homographies, as
 * `predictHomography` takes them (`previous = null` right after a
 * detection). Throws a `RangeError` only for a frame that is not a valid
 * `GrayImage` — a contract violation, like the backend's own.
 */
export function trackFrame(
    frame: GrayImage,
    target: TrackTarget,
    previous: Mat3 | null,
    current: Mat3,
    options: TrackFrameOptions,
    clock: (() => number) | null,
): TrackFrameResult {
    const now = clock ?? (() => 0);
    const start = now();
    const { patches } = target;
    const outcomes = new Uint8Array(patches.count);
    const counts = {
        frameLevels: 0,
        culled: patches.count,
        attempted: 0,
        observed: 0,
        lost: 0,
        unconverged: 0,
        rejected: 0,
        failed: 0,
    };
    let pyramidMs = 0;
    let alignMs = 0;
    let fitMs = 0;
    const timings = (): TrackStepTimings | null =>
        clock === null ? null : { trackMs: now() - start, pyramidMs, alignMs, fitMs };
    const noFit = { inliers: 0, rmsError: null, fitIterations: 0, fitConverged: null };
    const lose = (loss: TrackLoss, fitStats: FitStats = noFit): TrackFrameResult => ({
        ok: false,
        loss,
        stats: { ...counts, ...fitStats },
        outcomes,
        timings: timings(),
    });

    const predicted = predictHomography(previous, current);
    if (!predicted.ok) return lose("no-prediction");
    const H = predicted.H;

    const candidates: number[] = [];
    for (let q = 0; q < patches.count; q++) {
        if (windowInFrame(H, target, q, frame.width, frame.height)) candidates.push(q);
    }
    counts.attempted = candidates.length;
    counts.culled = patches.count - candidates.length;

    // Each window is warped once, here: frameLevelsFor reads where it can be
    // sampled, and the alignment below reads the same warp.
    const prepareStart = now();
    const prepared = candidates.map((q) => preparePatch(patches, q, target.scaleStep, H));
    const levels = frameLevelsFor(prepared, target.scaleStep, frame, options.maxFrameLevels);
    alignMs = now() - prepareStart;
    const pyramidStart = now();
    const built = buildFramePyramid(firstPixels(frame), { levels, scaleStep: target.scaleStep });
    pyramidMs = now() - pyramidStart;
    if (!built.ok) {
        throw new RangeError(`@webarkit/nft-tracker: not a valid frame (${built.reason})`);
    }
    counts.frameLevels = levels;

    const src = new Float64Array(2 * candidates.length);
    const dst = new Float64Array(2 * candidates.length);
    const alignStart = now();
    for (let c = 0; c < candidates.length; c++) {
        const q = candidates[c];
        const p = prepared[c];
        const r = p.ok ? alignPrepared(built.pyramid, p, options.align) : p;
        if (!r.ok) {
            if (r.reason === "singular") {
                outcomes[q] = PatchOutcome.Lost;
                counts.lost++;
            } else {
                outcomes[q] = PatchOutcome.Failed;
                counts.failed++;
            }
            continue;
        }
        const o = r.observation;
        if (!o.converged) {
            outcomes[q] = PatchOutcome.Unconverged;
            counts.unconverged++;
            continue;
        }
        const contrast = o.residual / (o.gain * target.patchSpreads[q]);
        if (1 / Math.sqrt(1 + contrast * contrast) < options.minPatchZncc) {
            outcomes[q] = PatchOutcome.Rejected;
            counts.rejected++;
            continue;
        }
        outcomes[q] = PatchOutcome.Observed;
        const k = counts.observed++;
        src[2 * k] = target.centres[2 * q];
        src[2 * k + 1] = target.centres[2 * q + 1];
        dst[2 * k] = o.x;
        dst[2 * k + 1] = o.y;
    }
    alignMs += now() - alignStart;

    if (counts.observed < options.minTrackedPatches) return lose("too-few-patches");
    const fitStart = now();
    const fit = robustHomography(
        src.subarray(0, 2 * counts.observed),
        dst.subarray(0, 2 * counts.observed),
        H,
        options.fit,
    );
    fitMs = now() - fitStart;
    if (!fit.ok) return lose("fit-failed");
    const fitStats: FitStats = {
        inliers: fit.numInliers,
        rmsError: fit.rmsError,
        fitIterations: fit.iterations,
        fitConverged: fit.converged,
    };
    const outliers = counts.observed - fit.numInliers;
    if (outliers / counts.observed > options.maxOutlierShare) {
        return lose("too-many-outliers", fitStats);
    }
    if (fit.numInliers < options.minTrackedPatches) return lose("too-few-patches", fitStats);
    if (fit.rmsError > options.maxFitRms) return lose("poor-fit", fitStats);
    let sum = 0;
    for (let i = 0; i < fit.weights.length; i++) sum += fit.weights[i];
    return {
        ok: true,
        H: fit.H,
        quality: sum / counts.attempted,
        weights: fit.weights,
        stats: { ...counts, ...fitStats },
        outcomes,
        timings: timings(),
    };
}

/**
 * The frame's first `width · height` bytes, through a view, not a copy.
 * `GrayImage` does not fix `data.length`, and the backend reads those bytes of
 * a longer buffer — a pooled one, say — so the tracking step must too, or a
 * frame that detected would throw on the next, locked. A shorter buffer, or a
 * size that is not a positive integer, is left for `buildFramePyramid` to
 * refuse: that stays a contract violation.
 */
function firstPixels(frame: GrayImage): GrayImage {
    const { width, height, data } = frame;
    const n = width * height;
    if (!(Number.isInteger(width) && Number.isInteger(height) && data.length > n)) return frame;
    return { width, height, data: data.subarray(0, n) };
}

/**
 * Whether the prediction puts all four corner samples of patch `q` inside
 * frame level 0, `[0, w − 1] × [0, h − 1]`, in front of the camera. A
 * homography maps the patch's square to a convex quadrilateral whose vertices
 * are those corners, so every sample is inside if they are: this is exactly
 * `alignPatch`'s own test on level 0, the most permissive level, without its
 * P² projections. A patch failing it could be aligned on no level.
 */
function windowInFrame(
    H: Mat3,
    target: TrackTarget,
    q: number,
    width: number,
    height: number,
): boolean {
    const { patches } = target;
    const last = patches.patchSize - 1;
    const s = target.patchScales[q];
    for (let k = 0; k < 4; k++) {
        const X = (patches.left[q] + (k & 1 ? last : 0)) / s;
        const Y = (patches.top[q] + (k & 2 ? last : 0)) / s;
        const w = H[6] * X + H[7] * Y + H[8];
        if (!(w > 0)) return false;
        const x = (H[0] * X + H[1] * Y + H[2]) / w;
        const y = (H[3] * X + H[4] * Y + H[5]) / w;
        if (!(x >= 0 && x <= width - 1 && y >= 0 && y <= height - 1)) return false;
    }
    return true;
}
