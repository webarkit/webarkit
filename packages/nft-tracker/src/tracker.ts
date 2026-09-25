/*
 *  tracker.ts
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
 * The NFT tracker: find a trained planar target in a camera frame, then follow it.
 *
 * **LOST → DETECT → TRACK (milestone M2).** A frame without a lock runs the
 * detection pipeline of M1 — detect the frame at one level, describe, match
 * the target one pyramid level at a time, optionally filter, estimate a
 * homography, decompose it — and a detection that succeeds locks the tracker
 * on its homography. A frame with a lock runs none of detect, describe or
 * match: it predicts this frame's homography from the last two
 * (`predictHomography`), aligns the target's patches (§5.7) where the
 * prediction puts them (`alignPatch`, on a frame pyramid built once and only
 * as deep as the patches start), fits a homography to them
 * (`robustHomography`) and judges it (`trackFrame`). A step that fails drops
 * the lock, says why (`trackLoss`), and the same frame is detected again; a
 * detection that fails is `"LOST"`.
 *
 * **Detection-only.** With `detectionOnly`, or a target that cannot be
 * tracked — no patches ("the tracker then runs in detection-only mode",
 * §5.7), fewer than `minTrackedPatches`, or smaller than 3 × 3 — every frame
 * is detected from scratch and nothing is carried between frames: exactly
 * M1, which the parity test checks unchanged. `detectionOnly` says which.
 *
 * **Known limitation: re-acquisition is synchronous.** A frame that detects
 * blocks for about the stateless cost — ~109 ms p50 on the reference
 * device's camera path (docs/benchmarks/README.md, "Webcam: `acquire`
 * without a video decoder") against a 33 ms frame budget. Asynchronous
 * detection is M3 (#48's numbering).
 *
 * **What tracking survives**, measured on synthetic camera-path frames
 * (270 × 360, pinball at 0.45; track_frame.test.ts,
 * tracker_state_machine.test.ts): one step recovers the pose from a
 * prediction up to 4 px off, 4° of roll or 8% of scale, and refuses — never
 * accepts wrong — beyond; a sequence survives a sudden change of velocity of
 * 4 px per frame. The first prediction after a detection has no velocity,
 * and the second's carries the detection's own error (about 1 px RMS on
 * those frames), so faster motion re-detects every frame until it slows. As
 * a target leaves the frame, the last tracked frames fit the few patches
 * still in view and extrapolate to the rest: up to 1.2 px off at the far
 * end.
 *
 * **Patch levels are the first thing the tuning pass should revisit.** Every
 * patch of `examples/targets/pinball.wnft` comes from level 0, and on the
 * camera path the target is seen at about half that scale: each patch is
 * sharper than the frame it is aligned in. That is why the basin is the
 * narrow one (90% of alignments converging from 2 px off, 74% from 3), why a
 * right alignment's gain sits near 0.5, and why its residual cannot tell it
 * from a wrong one — only its correlation with the patch can
 * (`DEFAULT_MIN_PATCH_ZNCC`), and that still costs 1.6% of right matches.
 * Patches at the level the target is viewed at measured a wider basin (97%
 * from 3 px at σ = 1) and a residual that separates.
 *
 * Portability rules it keeps (ADR-0001 point 7): no DOM, no timers, no
 * `requestAnimationFrame`, no camera access and no clock — the application
 * owns the loop, hands in a `GrayImage` and a timestamp, and may hand in a
 * `clock` to have each result timed; results are explicit `{ ok, ... }`
 * values, never exceptions (a frame that is not a `GrayImage` while locked,
 * and options out of their domain, are contract violations, and throw).
 *
 * **On determinism.** Point 7 also asks that every random choice go through an
 * injectable RNG. This class makes none: the one random choice in the pipeline
 * is the minimal-sample draw inside `estimateHomography`, which is below the
 * contract, and `RansacOptions` carries no RNG for a caller to seed. So there
 * is deliberately no `rng` option here — it would accept a generator and have
 * nowhere to pass it. When the contract gains the field this class forwards
 * it and the option appears; until then `process` is exactly as reproducible
 * as the backend's RANSAC is, and the tests are explicit about that. The
 * tracking state draws nothing: a sequence of frames gives the same states
 * and homographies, bit for bit, for the same RANSAC draws in its
 * detections.
 */

import type { CvBackend, GrayImage, Keypoint, Mat3, Pose } from "@webarkit/cv-backend-spec";
import { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "./detection.js";
import type { TargetLevelView } from "./detection.js";
import type { TargetDb } from "./target/types.js";
import { trackFrame, trackTarget } from "./tracking/track_frame.js";
import type {
    TrackFrameOptions,
    TrackLoss,
    TrackStats,
    TrackStepTimings,
    TrackTarget,
} from "./tracking/track_frame.js";
import type { TrackingState } from "./tracking/types.js";

/**
 * Pyramid levels searched in the LIVE frame.
 *
 * One, deliberately: the target is prepared once, offline, over many levels,
 * and the per-frame work stays cheap. This is the demos' known limitation —
 * a camera moving far from the target has no scale search of its own — kept
 * here so M1 changes nothing. See `examples/README.md`.
 */
export const DEFAULT_SCENE_LEVELS = 1;

/** Keypoint budget for the live frame — the webcam demo's measured setting. */
export const DEFAULT_MAX_SCENE_KEYPOINTS = 300;

/** Lowe ratio for each per-level match call. */
export const DEFAULT_RATIO = 0.8;

/** RANSAC reprojection threshold, in pixels of the live frame. */
export const DEFAULT_RANSAC_THRESHOLD = 4;

/*
 * The tracking state's defaults. Every one is provisional until the M2
 * tuning pass (#48, "Evaluation"), which replaces each with a measured value
 * and its reason. Where one was measured already, the measurement is cited;
 * the others are the configurations #63 and #64 measured their functions
 * under.
 */

/**
 * Most frame pyramid levels a tracking frame builds. Fewer are built when the
 * patches start on fewer (`frameLevelsFor`): on the camera path, pinball's
 * patches need one, the frame itself. Four covers a level-0 patch seen at up
 * to twice its scale. Provisional until the M2 tuning pass.
 */
export const DEFAULT_MAX_FRAME_LEVELS = 4;

/** `alignPatch`'s iteration cap per level: #63's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_ALIGN_MAX_ITERATIONS = 30;

/** `alignPatch`'s convergence step, frame px: #63's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_ALIGN_EPSILON = 0.01;

/**
 * Estimate gain and bias with each patch's translation: camera exposure
 * changes, and a lost patch then ends `"singular"`, which the tracker reads
 * (align_patch.ts, point 6). Provisional until the M2 tuning pass.
 */
export const DEFAULT_PHOTOMETRIC = true;

/**
 * Tukey's cutoff, frame px: the detection state's RANSAC threshold, and #64's
 * configuration for its 45% breakdown. It also bounds the prediction error a
 * step survives: 4 px measured on the camera path (track_frame.test.ts),
 * since `robustHomography` starts weighting at the prediction. Provisional
 * until the M2 tuning pass.
 */
export const DEFAULT_TUKEY_C = 4;

/**
 * `robustHomography`'s iteration cap: #64's measured configuration. A fit that
 * reaches it is reported (`TrackStats.fitConverged`), not refused; on the
 * camera path only a fit the other rules refused has (`TrackStats`).
 * Provisional until the M2 tuning pass.
 */
export const DEFAULT_FIT_MAX_ITERATIONS = 20;

/** `robustHomography`'s convergence tolerance, px: #64's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_FIT_EPSILON = 1e-6;

/**
 * Fewest correspondences a tracking frame may fit, and fewest the fit may
 * keep with a weight. With {@link DEFAULT_MAX_OUTLIER_SHARE}, 8 is the
 * smallest count at which every accepted fit is over-determined (at least 5
 * of 8 kept, a homography needing 4). Bounding the inliers as well as the
 * correspondences refused the one wrong fit, 10.9 px off, that
 * {@link DEFAULT_MAX_FIT_RMS} let through in the measurement behind it.
 * Provisional until the M2 tuning pass.
 */
export const DEFAULT_MIN_TRACKED_PATCHES = 8;

/**
 * Largest share of correspondences the fit may weigh 0 before the frame is
 * lost: #64's measured breakdown (every outlier rejected in 2000 seeds of
 * 2000 up to 45%; failures from 50%, 40 patches, a prediction 3 px off).
 * Provisional until the M2 tuning pass.
 */
export const DEFAULT_MAX_OUTLIER_SHARE = 0.45;

/**
 * Largest weighted RMS residual, frame px, of a fit the frame may keep.
 * Measured on pinball at the camera path's scale (3 views, 2 renders, 634
 * fits from predictions up to 8 px, 5° and 8% off): every right fit had at
 * most 0.557 px; every wrong one with 8 inliers or more had over 0.6 px. A
 * wrong fit's correspondences are mostly right, which is why this and not the
 * outlier share catches it (track_frame.ts). It scales with the alignment
 * noise, so real frames may need more. Provisional until the M2 tuning pass.
 */
export const DEFAULT_MAX_FIT_RMS = 0.6;

/**
 * Smallest zero-normalised cross-correlation a converged patch may have with
 * its window and still reach the fit (track_frame.ts), for a patch that
 * "converged" on something unlike it — above all on flat background, where
 * its gain collapses without reaching `"singular"`. Measured on pinball at
 * the camera path's scale (4 views × 3 renders): 0.6 turns away 1.6% of
 * right alignments, 42% of wrong ones and 79% of those on background. On the
 * leave-and-return sequence it is what refuses a pose 232 px off; 0.5 and
 * 0.7 left TRACK frames 2.1 and 2.3 px off, 0.6 at most 1.2 px
 * (tracker_state_machine.test.ts). Provisional until the M2 tuning pass.
 */
export const DEFAULT_MIN_PATCH_ZNCC = 0.6;

/** Why a frame produced no homography. */
export type TrackFailure =
    /** Fewer than the 4 correspondences a homography needs. */
    | "too-few-matches"
    /** Enough matches, but RANSAC found no model they agree on. */
    | "no-consensus";

export interface NftTrackerOptions {
    /** See {@link DEFAULT_SCENE_LEVELS}. */
    readonly sceneLevels?: number;
    /** See {@link DEFAULT_MAX_SCENE_KEYPOINTS}. */
    readonly maxSceneKeypoints?: number;
    /** See {@link DEFAULT_RATIO}. */
    readonly ratio?: number;
    /** See {@link DEFAULT_RANSAC_THRESHOLD}. */
    readonly ransacThreshold?: number;
    /** Never track: every frame runs detection, and nothing is carried between frames (M1). Default `false`. */
    readonly detectionOnly?: boolean;
    /** See {@link DEFAULT_MAX_FRAME_LEVELS}. Integer in `[1, 256]`. */
    readonly maxFrameLevels?: number;
    /** See {@link DEFAULT_ALIGN_MAX_ITERATIONS}. Integer `≥ 1`. */
    readonly alignMaxIterations?: number;
    /** See {@link DEFAULT_ALIGN_EPSILON}. Finite, `> 0`. */
    readonly alignEpsilon?: number;
    /** See {@link DEFAULT_PHOTOMETRIC}. */
    readonly photometric?: boolean;
    /** See {@link DEFAULT_TUKEY_C}. Finite, `> 0`. */
    readonly tukeyC?: number;
    /** See {@link DEFAULT_FIT_MAX_ITERATIONS}. Integer `≥ 1`. */
    readonly fitMaxIterations?: number;
    /** See {@link DEFAULT_FIT_EPSILON}. Finite, `> 0`. */
    readonly fitEpsilon?: number;
    /** See {@link DEFAULT_MIN_TRACKED_PATCHES}. Integer `≥ 4`. */
    readonly minTrackedPatches?: number;
    /** See {@link DEFAULT_MAX_OUTLIER_SHARE}. In `[0, 1)`. */
    readonly maxOutlierShare?: number;
    /** See {@link DEFAULT_MAX_FIT_RMS}. Finite, `> 0`. */
    readonly maxFitRms?: number;
    /** See {@link DEFAULT_MIN_PATCH_ZNCC}. In `[0, 1)`; 0 turns the gate off. */
    readonly minPatchZncc?: number;
    /**
     * A clock in milliseconds, e.g. `() => performance.now()`. When given,
     * every result carries {@link TrackTimings}; the tracker reads no clock of
     * its own (ADR-0001 point 7).
     */
    readonly clock?: () => number;
}

/** Where a frame's time went, ms, by the `clock` option. */
export interface TrackTimings {
    /** The whole `process` call. */
    readonly totalMs: number;
    /** The detection pipeline, pose included, when it ran this frame; else 0. */
    readonly detectMs: number;
    /**
     * The tracking step when it ran — prediction, cull, pyramid, alignment,
     * fit, judgement; the pose (a backend call) is not in it. On `"TRACK"`
     * frames, ADR-0001 point 5's "tracker-side TypeScript compute in the
     * tracking state". Else 0.
     */
    readonly trackMs: number;
    /** Part of `trackMs` building the frame pyramid: ADR-0001 point 3's first candidate for the backend. */
    readonly pyramidMs: number;
    /** Part of `trackMs` in `alignPatch`. */
    readonly alignMs: number;
    /** Part of `trackMs` in `robustHomography`. */
    readonly fitMs: number;
}

/** Fields every result carries in M2, on both branches. */
interface TrackingFields {
    /**
     * Why the lock this frame started with was dropped; `null` if it held, or
     * there was none. A frame that drops its lock is detected again at once,
     * so this can accompany a `"DETECT"` result as well as a `"LOST"` one.
     */
    readonly trackLoss: TrackLoss | null;
    /** The tracking step's patch counts, when one ran this frame; else `null`. */
    readonly tracking: TrackStats | null;
    /** `null` without the `clock` option. */
    readonly timings: TrackTimings | null;
}

/**
 * What one frame produced. `ok` narrows the union.
 *
 * `state` says how the frame's result was obtained (see `TrackingState`):
 * a pose comes from `"DETECT"` or `"TRACK"`, no pose is `"LOST"`.
 */
export type TrackResult =
    | (TrackingFields & {
          readonly ok: true;
          /** Detection or patch tracking produced this pose. */
          readonly state: Exclude<TrackingState, "LOST">;
          /**
           * Share of the frame's correspondences the final estimate kept, in
           * `[0, 1]`. `"DETECT"`: `numInliers / numMatches`. `"TRACK"`: the sum
           * of the robust fit's weights divided by the number of patches
           * passed to `alignPatch` this frame (patches culled before alignment
           * do not count).
           */
          readonly quality: number;
          /** Echoed back from `process`; the tracker reads no clock. */
          readonly timestampMs: number;
          /** `"DETECT"`: matches after filtering. `"TRACK"`: patch correspondences fitted. */
          readonly numMatches: number;
          /** `"DETECT"`: RANSAC inliers. `"TRACK"`: correspondences the fit weighed above 0. */
          readonly numInliers: number;
          /** Row-major 3x3 mapping target level-0 pixels into the frame. */
          readonly H: Mat3;
          /**
           * Decomposition of {@link H}. Present whenever `ok`, but check
           * `pose.good`: a homography RANSAC agreed on can still be
           * geometrically degenerate.
           */
          readonly pose: Pose;
          /** The frame's keypoints, as detected. For overlays. Empty on `"TRACK"`: nothing is detected. */
          readonly sceneKeypoints: readonly Keypoint[];
      })
    | (TrackingFields & {
          readonly ok: false;
          readonly state: "LOST";
          /** Always 0: nothing was kept. */
          readonly quality: 0;
          readonly reason: TrackFailure;
          readonly timestampMs: number;
          readonly numMatches: number;
          readonly numInliers: number;
          readonly H: null;
          readonly pose: null;
          readonly sceneKeypoints: readonly Keypoint[];
      });

/** A result as the detection pipeline builds it: M1's, without M2's fields. */
type Detected =
    | Omit<Extract<TrackResult, { ok: true }>, keyof TrackingFields>
    | Omit<Extract<TrackResult, { ok: false }>, keyof TrackingFields>;

/** A `"TRACK"` frame's keypoints: none, since nothing is detected. */
const NO_KEYPOINTS: readonly Keypoint[] = Object.freeze([]);

export class NftTracker {
    private readonly levels: TargetLevelView[];
    private readonly sceneLevels: number;
    private readonly maxSceneKeypoints: number;
    private readonly ratio: number;
    private readonly ransacThreshold: number;
    /**
     * The target's keypoints as the contract's array-of-objects, built once —
     * and only when the backend has a `filterMatches` to feed them to, since
     * materialising N objects a frame-filter will never read is pure waste.
     */
    private readonly targetKeypoints: Keypoint[] | null;
    /**
     * Whether every frame runs detection and none tracks: asked for with the
     * `detectionOnly` option, or forced by a target that cannot be tracked —
     * no patches (§5.7), fewer than `minTrackedPatches`, or smaller than
     * 3 × 3, which `alignPatch` cannot align.
     */
    readonly detectionOnly: boolean;
    /** The target's patches with their geometry, when this tracker tracks. */
    private readonly track: TrackTarget | null;
    private readonly trackOptions: TrackFrameOptions;
    private readonly clock: (() => number) | null;
    /** The last two homographies while locked: `previous` is `null` right after a detection. */
    private lock: { readonly previous: Mat3 | null; readonly current: Mat3 } | null = null;

    /**
     * @param cv      The backend. Injected, never imported: the tracker runs on
     *                any implementation of the contract (ADR-0001 point 2).
     * @param target  A trained target, e.g. from `buildTargetFromImage`, or a
     *                decoded `.wnft`; its §5.7 patches are what it tracks.
     * @param K       Camera intrinsics for the frames that will be passed to
     *                {@link process}, row-major 3x3. A parameter because the
     *                tracker never sees the camera.
     * @param options Every option has a documented default; the tracking
     *                state's are checked here, and one out of its domain
     *                throws a `RangeError` naming it.
     */
    constructor(
        private readonly cv: CvBackend,
        private readonly target: TargetDb,
        private readonly K: Mat3,
        options?: NftTrackerOptions,
    ) {
        const tracking = resolveTrackingOptions(options);
        // Both throw on a target this backend cannot read, in the constructor
        // rather than on the first frame: it is a mismatch between target and
        // backend, not a frame that failed to track.
        this.levels = buildLevelIndex(chooseDescriptorSet(cv, target));
        this.sceneLevels = options?.sceneLevels ?? DEFAULT_SCENE_LEVELS;
        this.maxSceneKeypoints = options?.maxSceneKeypoints ?? DEFAULT_MAX_SCENE_KEYPOINTS;
        this.ratio = options?.ratio ?? DEFAULT_RATIO;
        this.ransacThreshold = options?.ransacThreshold ?? DEFAULT_RANSAC_THRESHOLD;
        this.targetKeypoints = cv.filterMatches ? toKeypointArray(target) : null;
        this.trackOptions = tracking.track;
        this.clock = tracking.clock;
        const p = target.patches;
        this.track =
            !tracking.detectionOnly &&
            p !== undefined &&
            p.patchSize >= 3 &&
            p.count >= tracking.track.minTrackedPatches
                ? trackTarget(p, target.pyramid.scaleStep)
                : null;
        this.detectionOnly = this.track === null;
    }

    process(frame: GrayImage, timestampMs: number): TrackResult {
        const clock = this.clock;
        const start = clock === null ? 0 : clock();
        let trackLoss: TrackLoss | null = null;
        let tracking: TrackStats | null = null;
        let step: TrackStepTimings | null = null;
        if (this.lock !== null && this.track !== null) {
            const r = trackFrame(
                frame,
                this.track,
                this.lock.previous,
                this.lock.current,
                this.trackOptions,
                clock,
            );
            tracking = r.stats;
            step = r.timings;
            if (r.ok) {
                this.lock = { previous: this.lock.current, current: r.H };
                const pose = this.cv.poseFromHomography(r.H, this.K);
                return {
                    ok: true,
                    state: "TRACK",
                    quality: r.quality,
                    timestampMs,
                    numMatches: r.stats.observed,
                    numInliers: r.stats.inliers,
                    H: r.H,
                    pose,
                    sceneKeypoints: NO_KEYPOINTS,
                    trackLoss: null,
                    tracking,
                    timings: this.timings(start, 0, step),
                };
            }
            // The lock goes, and this same frame is detected again below: a
            // target moved out of the step's reach is often still in view.
            trackLoss = r.loss;
            this.lock = null;
        }
        const detectStart = clock === null ? 0 : clock();
        const detected = this.detect(frame, timestampMs);
        const detectMs = clock === null ? 0 : clock() - detectStart;
        // A detection starts a lock with no velocity: `previous = null`, so
        // the next frame is predicted where this one was found.
        if (detected.ok && this.track !== null) {
            this.lock = { previous: null, current: detected.H };
        }
        const fields = { trackLoss, tracking, timings: this.timings(start, detectMs, step) };
        return detected.ok ? { ...detected, ...fields } : { ...detected, ...fields };
    }

    /**
     * The detection pipeline, M1's `process` unchanged: detect, describe,
     * match per level, filter, estimate, decompose.
     */
    private detect(frame: GrayImage, timestampMs: number): Detected {
        const sceneKeypoints = this.cv.detect(frame, {
            levels: this.sceneLevels,
            maxKeypoints: this.maxSceneKeypoints,
        });
        const sceneDescriptors = this.cv.describe(frame, sceneKeypoints);
        let matches = matchPerLevel(this.cv, sceneDescriptors, this.levels, this.ratio);

        // Skipped exactly as the contract documents when a backend has none.
        if (this.cv.filterMatches && this.targetKeypoints) {
            matches = this.cv.filterMatches(
                matches,
                { keypoints: sceneKeypoints, width: frame.width, height: frame.height },
                {
                    keypoints: this.targetKeypoints,
                    width: this.target.meta.widthPx,
                    height: this.target.meta.heightPx,
                },
            );
        }

        if (matches.length < 4) {
            return {
                ok: false,
                state: "LOST",
                quality: 0,
                reason: "too-few-matches",
                timestampMs,
                numMatches: matches.length,
                numInliers: 0,
                H: null,
                pose: null,
                sceneKeypoints,
            };
        }

        // src = target points, dst = frame points, so H maps the target plane
        // into the frame and its corners can be drawn straight onto it.
        const src = new Float64Array(matches.length * 2);
        const dst = new Float64Array(matches.length * 2);
        const kp = this.target.keypoints;
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            // f32 -> number widens here, which is what §5.5 means by "readers
            // widen to Float64 when building the contract's PointArray".
            src[i * 2] = kp.x[m.trainIdx];
            src[i * 2 + 1] = kp.y[m.trainIdx];
            dst[i * 2] = sceneKeypoints[m.queryIdx].x;
            dst[i * 2 + 1] = sceneKeypoints[m.queryIdx].y;
        }

        const h = this.cv.estimateHomography(src, dst, { threshold: this.ransacThreshold });
        if (!h.ok) {
            return {
                ok: false,
                state: "LOST",
                quality: 0,
                reason: "no-consensus",
                timestampMs,
                numMatches: matches.length,
                numInliers: h.numInliers,
                H: null,
                pose: null,
                sceneKeypoints,
            };
        }

        return {
            ok: true,
            state: "DETECT",
            // matches.length >= 4 here, so the division is safe.
            quality: h.numInliers / matches.length,
            timestampMs,
            numMatches: matches.length,
            numInliers: h.numInliers,
            H: h.H,
            pose: this.cv.poseFromHomography(h.H, this.K),
            sceneKeypoints,
        };
    }

    private timings(
        start: number,
        detectMs: number,
        step: TrackStepTimings | null,
    ): TrackTimings | null {
        if (this.clock === null) return null;
        return {
            totalMs: this.clock() - start,
            detectMs,
            trackMs: step?.trackMs ?? 0,
            pyramidMs: step?.pyramidMs ?? 0,
            alignMs: step?.alignMs ?? 0,
            fitMs: step?.fitMs ?? 0,
        };
    }
}

/**
 * The tracking state's options, defaulted and checked. A value out of its
 * domain is a contract violation, reported at construction with the option's
 * name, rather than a tracker that silently fails every tracking step.
 */
function resolveTrackingOptions(options: NftTrackerOptions | undefined): {
    readonly detectionOnly: boolean;
    readonly clock: (() => number) | null;
    readonly track: TrackFrameOptions;
} {
    const o = options ?? {};
    const integer = (name: string, v: number, lo: number, hi = Infinity): number => {
        if (!(Number.isInteger(v) && v >= lo && v <= hi)) {
            throw new RangeError(
                `NftTracker: ${name} must be an integer in [${lo}, ${hi}], got ${v}`,
            );
        }
        return v;
    };
    const positive = (name: string, v: number): number => {
        if (!(v > 0 && Number.isFinite(v))) {
            throw new RangeError(`NftTracker: ${name} must be finite and > 0, got ${v}`);
        }
        return v;
    };
    const fraction = (name: string, v: number): number => {
        if (!(v >= 0 && v < 1)) {
            throw new RangeError(`NftTracker: ${name} must be in [0, 1), got ${v}`);
        }
        return v;
    };
    const flag = (name: string, v: unknown): boolean => {
        if (typeof v !== "boolean") {
            throw new RangeError(`NftTracker: ${name} must be a boolean, got ${String(v)}`);
        }
        return v;
    };
    if (o.clock !== undefined && typeof o.clock !== "function") {
        throw new RangeError(`NftTracker: clock must be a function, got ${String(o.clock)}`);
    }
    return {
        detectionOnly: flag("detectionOnly", o.detectionOnly ?? false),
        clock: o.clock ?? null,
        track: {
            maxFrameLevels: integer(
                "maxFrameLevels",
                o.maxFrameLevels ?? DEFAULT_MAX_FRAME_LEVELS,
                1,
                256,
            ),
            align: {
                maxIterations: integer(
                    "alignMaxIterations",
                    o.alignMaxIterations ?? DEFAULT_ALIGN_MAX_ITERATIONS,
                    1,
                ),
                epsilon: positive("alignEpsilon", o.alignEpsilon ?? DEFAULT_ALIGN_EPSILON),
                photometric: flag("photometric", o.photometric ?? DEFAULT_PHOTOMETRIC),
            },
            fit: {
                maxIterations: integer(
                    "fitMaxIterations",
                    o.fitMaxIterations ?? DEFAULT_FIT_MAX_ITERATIONS,
                    1,
                ),
                tukeyC: positive("tukeyC", o.tukeyC ?? DEFAULT_TUKEY_C),
                epsilon: positive("fitEpsilon", o.fitEpsilon ?? DEFAULT_FIT_EPSILON),
            },
            minTrackedPatches: integer(
                "minTrackedPatches",
                o.minTrackedPatches ?? DEFAULT_MIN_TRACKED_PATCHES,
                4,
            ),
            maxOutlierShare: fraction(
                "maxOutlierShare",
                o.maxOutlierShare ?? DEFAULT_MAX_OUTLIER_SHARE,
            ),
            maxFitRms: positive("maxFitRms", o.maxFitRms ?? DEFAULT_MAX_FIT_RMS),
            minPatchZncc: fraction("minPatchZncc", o.minPatchZncc ?? DEFAULT_MIN_PATCH_ZNCC),
        },
    };
}

/**
 * The target's keypoint table back as the contract's `Keypoint[]`.
 *
 * `filterMatches` takes an array of objects; a `TargetDb` stores a structure
 * of arrays. The conversion happens once, in the constructor, not per frame.
 */
function toKeypointArray(target: TargetDb): Keypoint[] {
    const kp = target.keypoints;
    const out: Keypoint[] = new Array(kp.count);
    for (let i = 0; i < kp.count; i++) {
        out[i] = {
            x: kp.x[i],
            y: kp.y[i],
            score: kp.score[i],
            angle: kp.angle[i],
            level: kp.level[i],
        };
    }
    return out;
}
