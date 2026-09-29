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
 * **External detection (M3).** The detection pipeline costs about 79 ms p50
 * on the reference device (docs/benchmarks/README.md, "Results
 * (2026-09-26)") against a 33 ms frame budget, and in the default mode a
 * frame without a lock pays it on the thread that called `process`. The
 * pipeline is exported as `prepareDetection` and `detectTarget`
 * (detection.ts) so that the application can run it where it likes — in a
 * worker it owns, with a setup built from the same target — and hand the
 * `Detection` back to `process` as its third argument. With
 * `externalDetection: true` the tracker never detects itself: a frame
 * without a lock and without a handed-in detection is `"LOST"` with
 * `reason: "no-detection"`, makes no backend call, and says
 * `needsDetection`. A handed-in detection is of an earlier frame, so its
 * homography is not this frame's pose: the tracker locks on it and runs a
 * tracking step **on the same frame**, which carries the pose to this frame
 * and checks it — `"TRACK"` if it holds, `"LOST"` with
 * `reason: "unconfirmed"` and the step's `trackLoss` if not. A detection
 * handed in while a lock holds is ignored (`detectionUse`). The tracker
 * keeps no request state and no frame: how many detections are in flight,
 * and of which frames, is the application's policy, and the worker is the
 * application's (ADR-0001 point 7). The default mode is M2's, unchanged:
 * the parity tests hold it there.
 *
 * **What tracking survives**, measured on synthetic camera-path frames
 * (270 × 360, pinball at 0.45; track_frame.test.ts,
 * tracker_state_machine.test.ts). One step recovers the pose — within 0.5 px
 * RMS at the patch centres — from a prediction up to 4 px, 3.5° of roll or 5%
 * of scale off, on every render measured. Past 4 px of translation it refuses
 * rather than accept a wrong pose (pinned to 6 px, measured to 20 px). From
 * 4° of roll, or past 8% of scale, it may accept one: 0.55–1.6 px off at
 * 4–5° of roll (−4° already, on both views), up to 9.4 px off when the
 * target shrinks 8–11% in one frame, and 3.65 px off when it grows 9% (one
 * view). That takes such a change on a step with no velocity to predict it —
 * a lock's first. After the 8–10% changes of scale and −4.5° of roll
 * measured (5 renders × 2 views), the next step came within 0.9 px or
 * refused, and the one after within 0.25 px or re-detected; but the wrong
 * pose is returned as `"TRACK"` meanwhile, with a quality of 0.12–0.20. Right
 * fits on as few patches reach 0.20, so quality flags it without separating
 * it, and so far no rule does ({@link DEFAULT_MAX_FIT_RMS} has the
 * measurements). A sequence survives a sudden change of velocity of 4 px per
 * frame. The first prediction after a detection has no velocity, and the
 * second's carries the detection's own error (about 1 px RMS on those
 * frames), so faster motion re-detects every frame until it slows. As a
 * target leaves the frame, the last tracked frames fit the few patches still
 * in view and extrapolate to the rest: up to 1.2 px RMS off over the patch
 * centres, 2.5 px at the far end.
 *
 * **Patch levels are the first thing the tuning pass should revisit.** All
 * but one patch of `examples/targets/pinball.wnft` come from level 0 (47 of
 * 48; the other is from level 1), and on the camera path the target is seen
 * at about half level 0's scale: each patch is sharper than the frame it is
 * aligned in. The measurements below were made on the 64-patch target of
 * M2, all of it level 0. That is why the basin is the
 * narrow one — on this suite's frames (one blur pass, noise σ = 2), 84% of
 * alignments converge from 2 px off and 68% from 3, 78% and 61% within
 * 0.5 px of the truth; unblurred, 92% and 72% (measured in review, not
 * pinned) — why a right alignment's gain sits near 0.5, and why its residual
 * cannot tell it from a wrong one — only its correlation with the patch can
 * (`DEFAULT_MIN_PATCH_ZNCC`), and that still costs 1% of right alignments.
 * Patches at the level the target is viewed at measured a wider basin on
 * unblurred frames (97% from 3 px at σ = 1; align_patch_basin.test.ts) and a
 * residual that separates.
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
import {
    DEFAULT_MAX_SCENE_KEYPOINTS,
    DEFAULT_RANSAC_THRESHOLD,
    DEFAULT_RATIO,
    DEFAULT_SCENE_LEVELS,
    detectTarget,
    prepareDetection,
} from "./detection.js";
import type { Detection, DetectionSetup } from "./detection.js";
import type { TargetDb } from "./target/types.js";
import { trackFrame, trackTarget } from "./tracking/track_frame.js";
import type {
    TrackFrameOptions,
    TrackFrameResult,
    TrackLoss,
    TrackStats,
    TrackStepTimings,
    TrackTarget,
} from "./tracking/track_frame.js";
import type { DetectionUse, TrackingState } from "./tracking/types.js";

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
 * keep with a weight. The second is the bound that decides: every accepted
 * fit keeps at least 8 inliers, twice the 4 a homography needs. Up to 12
 * correspondences it refuses before {@link DEFAULT_MAX_OUTLIER_SHARE} would
 * (10 with 3 weighed 0 ends `"too-few-patches"`, not `"too-many-outliers"`);
 * at 13 and 14 the two refuse at the same count, reported as
 * `"too-many-outliers"`, which is checked first; from 15 the share binds
 * first.
 * Measured with every rule in place, on pinball at the camera path's scale
 * (2 views × 5 renders, predictions to 8 px, 6° and 12% off;
 * track_frame.test.ts pins one render): right fits kept 12 inliers or more,
 * and the wrong fits the rules let through 8–13. So 8 narrows the wrong fits
 * without separating them; 12 would refuse 15 of those 24, every one over
 * 1.6 px off among them, at no margin to the right fits — the tuning pass's
 * call, on real frames. Provisional until the M2 tuning pass.
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
 * Largest weighted RMS residual, frame px, of a fit the frame may keep. A
 * wrong fit's correspondences are mostly right, which is why this and not the
 * outlier share catches it (track_frame.ts). Measured with the ZNCC gate and
 * the other rules in place, on pinball at the camera path's scale (2 views ×
 * 5 renders, 137 predictions each, to 8 px, 6° and 12% off;
 * track_frame.test.ts pins one render): right fits had at most 0.370 px. Of
 * the 38 wrong fits the other rules let through, 0.52–10.9 px off, this
 * refuses the 14 over 0.6 px; the other 24 had 0.23–0.56 px, among the
 * right fits' own, and are accepted — up to 9.4 px off, from a prediction
 * 9–10% too large in scale. 0.4 px would have refused every one more than
 * 1.5 px off, 0.03 px above the right fits: too thin a margin to set on
 * synthetic frames, since the residual scales with the alignment noise and
 * real frames may need more. The tuning pass sets it on real ones.
 * Provisional until then.
 */
export const DEFAULT_MAX_FIT_RMS = 0.6;

/**
 * Smallest zero-normalised cross-correlation a converged patch may have with
 * its window and still reach the fit (track_frame.ts), for a patch that
 * "converged" on something unlike it — above all on flat background, where
 * its gain collapses without reaching `"singular"`. Measured on pinball at
 * the camera path's scale (2 views × 5 renders, predictions to 6 px, 4° and
 * 8% off; not pinned): 0.6 turns away 1.0% of right alignments (within
 * 0.5 px of the truth) and 72% of those more than 2 px off; from the exact
 * pose, where weak patches converge too, 4.5% of right ones. On the
 * leave-and-return sequence it is what refuses a pose 232 px off, and holds
 * every TRACK frame to 1.2 px RMS (tracker_state_machine.test.ts); 0.5 and
 * 0.7 left TRACK frames 2.1 and 2.3 px RMS off there (measured once, not
 * pinned). The right alignments it turns away cost some accuracy: from the
 * exact pose, the suite's H went from 0.064 to 0.073 px off on one view, 0.134
 * to 0.190 px with half the patches culled, and 0.085 to 0.109 px with some
 * covered (track_frame.test.ts pins the values with the gate). It reads the
 * alignment's gain and bias as least-squares estimates, so with
 * `photometric: false` it is not a correlation. Provisional until the M2
 * tuning pass.
 */
export const DEFAULT_MIN_PATCH_ZNCC = 0.6;

/** Why a frame produced no homography. */
export type TrackFailure =
    /** Fewer than the 4 correspondences a homography needs. */
    | "too-few-matches"
    /** Enough matches, but RANSAC found no model they agree on. */
    | "no-consensus"
    /**
     * No lock, and no detection: with `externalDetection`, the tracker runs
     * none itself, and none was handed to `process` this frame. The result
     * says `needsDetection`.
     */
    | "no-detection"
    /**
     * A detection was handed in and consumed, but the tracking step that
     * carries its homography to this frame refused it — `trackLoss` says
     * why. The detection is of an earlier frame, and the target moved past
     * what one step recovers, or the detection was wrong to begin with.
     */
    | "unconfirmed";

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
    /**
     * Never detect: the application runs `detectTarget` where it likes — in
     * a worker it owns, typically — and hands the result to {@link
     * NftTracker.process}. A frame without a lock and without one is
     * `"LOST"` with `reason: "no-detection"`, costs no backend call, and
     * says `needsDetection`. Default `false`: the tracker detects itself on
     * a frame without a lock, as in M2. Either way, a detection handed in is
     * consumed. May be combined with `detectionOnly`.
     */
    readonly externalDetection?: boolean;
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
     * tracking state". Else 0. A frame that drops its lock and then confirms
     * a consumed detection runs two steps, and this is their sum (as are
     * the three parts below).
     */
    readonly trackMs: number;
    /** Part of `trackMs` building the frame pyramid: ADR-0001 point 3's first candidate for the backend. */
    readonly pyramidMs: number;
    /**
     * Part of `trackMs` in `alignPatch`: each patch's warp and its alignment.
     * Choosing the pyramid's depth, the cull, the prediction and the
     * judgement are in `trackMs` only.
     */
    readonly alignMs: number;
    /** Part of `trackMs` in `robustHomography`. */
    readonly fitMs: number;
}

/** Fields every result carries in M2, on both branches. */
interface TrackingFields {
    /**
     * Why the last tracking step run this frame dropped its lock; `null` if
     * it held, or no step ran. A frame that drops its lock is detected again
     * at once, so this can accompany a `"DETECT"` result as well as a `"LOST"`
     * one. Two steps run only on a frame that drops its lock and then
     * confirms a consumed detection (see `consume`): both fields then
     * describe the confirming step, and its `"TRACK"` result has `null` here.
     */
    readonly trackLoss: TrackLoss | null;
    /** The last tracking step's patch counts, when one ran this frame; else `null`. */
    readonly tracking: TrackStats | null;
    /** `null` without the `clock` option. */
    readonly timings: TrackTimings | null;
    /**
     * Whether the application should produce a detection and hand it to a
     * later `process` call: `true` iff the frame ended without a lock and the
     * tracker has `externalDetection`. Always `false` without it. The tracker
     * keeps no request state — how many detections are in flight, and of
     * which frames, is the application's policy.
     */
    readonly needsDetection: boolean;
    /** What became of a detection this frame. */
    readonly detectionUse: DetectionUse;
    /**
     * `timestampMs` minus the consumed detection's own, in the caller's
     * units, when one was consumed this frame; else `null`. 0 for a
     * detection of this very frame, and negative if the caller stamped the
     * detection later than the frame: trusted, not checked.
     */
    readonly detectionLatencyMs: number | null;
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
          /**
           * Row-major 3x3 mapping target level-0 pixels into the frame — this
           * frame, with one exception: a detection-only tracker cannot carry
           * a consumed detection forward, so its `"DETECT"` result for one is
           * the DETECTED frame's `H` (and `pose`), `detectionLatencyMs` old.
           */
          readonly H: Mat3;
          /**
           * Decomposition of {@link H}. Present whenever `ok`, but check
           * `pose.good`: a homography RANSAC agreed on can still be
           * geometrically degenerate.
           */
          readonly pose: Pose;
          /**
           * The frame's keypoints, as detected. For overlays. Empty on a
           * `"TRACK"` frame, where nothing is detected — except one that
           * consumed a detection, which carries the DETECTED frame's
           * keypoints, `detectionLatencyMs` old.
           */
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
    /** The detection pipeline's per-target half, built once (`prepareDetection`). */
    private readonly setup: DetectionSetup;
    /**
     * Whether every frame runs detection and none tracks: asked for with the
     * `detectionOnly` option, or forced by a target that cannot be tracked —
     * no patches (§5.7), fewer than `minTrackedPatches`, or smaller than
     * 3 × 3, which `alignPatch` cannot align.
     */
    readonly detectionOnly: boolean;
    /** Whether the tracker never detects itself: the `externalDetection` option. */
    readonly externalDetection: boolean;
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
        target: TargetDb,
        private readonly K: Mat3,
        options?: NftTrackerOptions,
    ) {
        const tracking = resolveTrackingOptions(options);
        // Throws on a target this backend cannot read, in the constructor
        // rather than on the first frame: it is a mismatch between target and
        // backend, not a frame that failed to track.
        this.setup = prepareDetection(cv, target, options);
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
        this.externalDetection = tracking.externalDetection;
    }

    /**
     * One frame.
     *
     * @param frame       The frame, a `GrayImage`.
     * @param timestampMs The frame's timestamp, in the caller's units; echoed
     *                    back, and the reference for `detectionLatencyMs`.
     * @param detection   A detection computed elsewhere — by `detectTarget`,
     *                    in a worker the application owns — of an earlier
     *                    frame. Consumed when this frame ends without a lock
     *                    (see the class comment); ignored when the lock holds.
     *                    Trusted as `detectTarget` produced it.
     */
    process(frame: GrayImage, timestampMs: number, detection?: Detection | null): TrackResult {
        const clock = this.clock;
        const start = clock === null ? 0 : clock();
        let trackLoss: TrackLoss | null = null;
        let tracking: TrackStats | null = null;
        let step: TrackStepTimings | null = null;
        if (this.lock !== null && this.track !== null) {
            const r = this.step(frame);
            tracking = r.stats;
            step = r.timings;
            if (r.ok) {
                return this.tracked(r, timestampMs, NO_KEYPOINTS, start, [step], {
                    detectionUse: detection ? "ignored" : "none",
                    detectionLatencyMs: null,
                });
            }
            // The lock goes, and this same frame gets whatever detection
            // there is below: a target moved out of the step's reach is
            // often still in view.
            trackLoss = r.loss;
        }
        if (detection) {
            return this.consume(detection, frame, timestampMs, start, trackLoss, tracking, step);
        }
        if (this.externalDetection) {
            return {
                ok: false,
                state: "LOST",
                quality: 0,
                reason: "no-detection",
                timestampMs,
                numMatches: 0,
                numInliers: 0,
                H: null,
                pose: null,
                sceneKeypoints: NO_KEYPOINTS,
                trackLoss,
                tracking,
                timings: this.timings(start, 0, [step]),
                needsDetection: true,
                detectionUse: "none",
                detectionLatencyMs: null,
            };
        }
        const detectStart = clock === null ? 0 : clock();
        const detected = this.detect(frame, timestampMs);
        const detectMs = clock === null ? 0 : clock() - detectStart;
        // A detection starts a lock with no velocity: `previous = null`, so
        // the next frame is predicted where this one was found.
        if (detected.ok && this.track !== null) {
            this.lock = { previous: null, current: detected.H };
        }
        const fields: TrackingFields = {
            trackLoss,
            tracking,
            timings: this.timings(start, detectMs, [step]),
            needsDetection: false,
            detectionUse: "internal",
            detectionLatencyMs: null,
        };
        return detected.ok ? { ...detected, ...fields } : { ...detected, ...fields };
    }

    /**
     * A detection of an earlier frame enters the state machine here, on a
     * frame that has no lock.
     *
     * When the tracker tracks, the detection's homography starts a lock with
     * no velocity and a tracking step runs on this frame at once — that step
     * is what carries a pose from the detected frame to this one, and what
     * checks it. A detection-only tracker returns it as `"DETECT"`, as M2
     * does its own; a failed detection is `"LOST"` with its reason. `first*`
     * describe a tracking step this frame already ran and lost, so that a
     * result reports the last step run.
     */
    private consume(
        d: Detection,
        frame: GrayImage,
        timestampMs: number,
        start: number,
        firstLoss: TrackLoss | null,
        firstStats: TrackStats | null,
        firstStep: TrackStepTimings | null,
    ): TrackResult {
        const use = {
            detectionUse: "consumed",
            detectionLatencyMs: timestampMs - d.timestampMs,
        } as const;
        if (d.ok && this.track !== null) {
            this.lock = { previous: null, current: d.H };
            const r = this.step(frame);
            const steps = [firstStep, r.timings];
            if (r.ok) return this.tracked(r, timestampMs, d.sceneKeypoints, start, steps, use);
            return {
                ok: false,
                state: "LOST",
                quality: 0,
                reason: "unconfirmed",
                timestampMs,
                numMatches: d.numMatches,
                numInliers: d.numInliers,
                H: null,
                pose: null,
                sceneKeypoints: d.sceneKeypoints,
                trackLoss: r.loss,
                tracking: r.stats,
                timings: this.timings(start, 0, steps),
                needsDetection: this.externalDetection,
                ...use,
            };
        }
        // `detected` stamps the detection's own timestamp, as M2's internal
        // path does for the frame it detected; here that is an earlier
        // frame, and every result echoes the timestamp `process` was given —
        // the detection's age is `detectionLatencyMs`.
        const detected = this.detected(d);
        const fields: TrackingFields & { timestampMs: number } = {
            timestampMs,
            trackLoss: firstLoss,
            tracking: firstStats,
            timings: this.timings(start, 0, [firstStep]),
            needsDetection: this.externalDetection,
            ...use,
        };
        return detected.ok ? { ...detected, ...fields } : { ...detected, ...fields };
    }

    /**
     * One tracking step from the lock, which it advances when the step holds
     * and drops when it fails. Called only with a lock and a trackable target.
     */
    private step(frame: GrayImage): TrackFrameResult {
        const lock = this.lock!;
        const r = trackFrame(
            frame,
            this.track!,
            lock.previous,
            lock.current,
            this.trackOptions,
            this.clock,
        );
        this.lock = r.ok ? { previous: lock.current, current: r.H } : null;
        return r;
    }

    /** A `"TRACK"` result from a step that held. */
    private tracked(
        r: Extract<TrackFrameResult, { ok: true }>,
        timestampMs: number,
        sceneKeypoints: readonly Keypoint[],
        start: number,
        steps: readonly (TrackStepTimings | null)[],
        use: Pick<TrackingFields, "detectionUse" | "detectionLatencyMs">,
    ): TrackResult {
        return {
            ok: true,
            state: "TRACK",
            quality: r.quality,
            timestampMs,
            numMatches: r.stats.observed,
            numInliers: r.stats.inliers,
            H: r.H,
            pose: this.cv.poseFromHomography(r.H, this.K),
            sceneKeypoints,
            trackLoss: null,
            tracking: r.stats,
            timings: this.timings(start, 0, steps),
            needsDetection: false,
            ...use,
        };
    }

    /**
     * The detection pipeline, M1's `process` unchanged: detect, describe,
     * match per level, filter, estimate, decompose.
     */
    private detect(frame: GrayImage, timestampMs: number): Detected {
        return this.detected(detectTarget(this.cv, this.setup, frame, timestampMs));
    }

    /** M1's result for a detection: its `state`, `quality` and `pose` added. */
    private detected(d: Detection): Detected {
        if (!d.ok) {
            return {
                ok: false,
                state: "LOST",
                quality: 0,
                reason: d.reason,
                timestampMs: d.timestampMs,
                numMatches: d.numMatches,
                numInliers: d.numInliers,
                H: null,
                pose: null,
                sceneKeypoints: d.sceneKeypoints,
            };
        }
        return {
            ok: true,
            state: "DETECT",
            // numMatches >= 4 on an ok detection, so the division is safe.
            quality: d.numInliers / d.numMatches,
            timestampMs: d.timestampMs,
            numMatches: d.numMatches,
            numInliers: d.numInliers,
            H: d.H,
            pose: this.cv.poseFromHomography(d.H, this.K),
            sceneKeypoints: d.sceneKeypoints,
        };
    }

    /** The frame's timings, the tracking steps it ran summed (two, at most: see `consume`). */
    private timings(
        start: number,
        detectMs: number,
        steps: readonly (TrackStepTimings | null)[],
    ): TrackTimings | null {
        if (this.clock === null) return null;
        const t = {
            totalMs: this.clock() - start,
            detectMs,
            trackMs: 0,
            pyramidMs: 0,
            alignMs: 0,
            fitMs: 0,
        };
        for (const s of steps) {
            if (s === null) continue;
            t.trackMs += s.trackMs;
            t.pyramidMs += s.pyramidMs;
            t.alignMs += s.alignMs;
            t.fitMs += s.fitMs;
        }
        return t;
    }
}

/**
 * The tracking state's options, defaulted and checked. A value out of its
 * domain is a contract violation, reported at construction with the option's
 * name, rather than a tracker that silently fails every tracking step.
 */
function resolveTrackingOptions(options: NftTrackerOptions | undefined): {
    readonly detectionOnly: boolean;
    readonly externalDetection: boolean;
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
        externalDetection: flag("externalDetection", o.externalDetection ?? false),
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
