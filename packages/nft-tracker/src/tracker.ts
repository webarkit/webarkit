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
 * The NFT tracker: find a trained planar target in a camera frame.
 *
 * **Milestone M1 is parity, not progress.** This does exactly what the webcam
 * demo did inline — detect the frame at one level, describe, match the target
 * one pyramid level at a time, optionally filter, estimate a homography,
 * decompose it — and carries nothing from one frame to the next. Repeated
 * detection is not yet tracking; the patch tracker and the state machine that
 * make it tracking are M2, IPPE and temporal filtering are M3.
 *
 * Portability rules it keeps (ADR-0001 point 7): no DOM, no timers, no
 * `requestAnimationFrame`, no camera access — the application owns the loop
 * and hands in a `GrayImage` and a timestamp; results are explicit
 * `{ ok, ... }` values, never exceptions.
 *
 * **On determinism.** Point 7 also asks that every random choice go through an
 * injectable RNG. This class makes none: the one random choice in the pipeline
 * is the minimal-sample draw inside `estimateHomography`, which is below the
 * contract, and `RansacOptions` carries no RNG for a caller to seed. So there
 * is deliberately no `rng` option here — it would accept a generator and have
 * nowhere to pass it. When the contract gains the field this class forwards
 * it and the option appears; until then `process` is exactly as reproducible
 * as the backend's RANSAC is, and the tests are explicit about that.
 */

import type {
    CvBackend,
    GrayImage,
    Keypoint,
    Mat3,
    Pose,
} from "@webarkit/cv-backend-spec";
import { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "./detection.js";
import type { TargetLevelView } from "./detection.js";
import type { TargetDb } from "./target/types.js";

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
}

/** What one frame produced. `ok` narrows the union. */
export type TrackResult =
    | {
          readonly ok: true;
          /** Echoed back from `process`; the tracker reads no clock. */
          readonly timestampMs: number;
          readonly numMatches: number;
          readonly numInliers: number;
          /** Row-major 3x3 mapping target level-0 pixels into the frame. */
          readonly H: Mat3;
          /**
           * Decomposition of {@link H}. Present whenever `ok`, but check
           * `pose.good`: a homography RANSAC agreed on can still be
           * geometrically degenerate.
           */
          readonly pose: Pose;
          /** The frame's keypoints, as detected. For overlays. */
          readonly sceneKeypoints: readonly Keypoint[];
      }
    | {
          readonly ok: false;
          readonly reason: TrackFailure;
          readonly timestampMs: number;
          readonly numMatches: number;
          readonly numInliers: number;
          readonly H: null;
          readonly pose: null;
          readonly sceneKeypoints: readonly Keypoint[];
      };

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
     * @param cv     The backend. Injected, never imported: the tracker runs on
     *               any implementation of the contract (ADR-0001 point 2).
     * @param target A trained target, e.g. from `buildTargetFromImage`.
     * @param K      Camera intrinsics for the frames that will be passed to
     *               {@link process}, row-major 3x3. A parameter because the
     *               tracker never sees the camera.
     */
    constructor(
        private readonly cv: CvBackend,
        private readonly target: TargetDb,
        private readonly K: Mat3,
        options?: NftTrackerOptions
    ) {
        // Both throw on a target this backend cannot read, in the constructor
        // rather than on the first frame: it is a mismatch between target and
        // backend, not a frame that failed to track.
        this.levels = buildLevelIndex(chooseDescriptorSet(cv, target));
        this.sceneLevels = options?.sceneLevels ?? DEFAULT_SCENE_LEVELS;
        this.maxSceneKeypoints = options?.maxSceneKeypoints ?? DEFAULT_MAX_SCENE_KEYPOINTS;
        this.ratio = options?.ratio ?? DEFAULT_RATIO;
        this.ransacThreshold = options?.ransacThreshold ?? DEFAULT_RANSAC_THRESHOLD;
        this.targetKeypoints = cv.filterMatches ? toKeypointArray(target) : null;
    }

    process(frame: GrayImage, timestampMs: number): TrackResult {
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
                }
            );
        }

        if (matches.length < 4) {
            return {
                ok: false,
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
            timestampMs,
            numMatches: matches.length,
            numInliers: h.numInliers,
            H: h.H,
            pose: this.cv.poseFromHomography(h.H, this.K),
            sceneKeypoints,
        };
    }
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
        out[i] = { x: kp.x[i], y: kp.y[i], score: kp.score[i], angle: kp.angle[i], level: kp.level[i] };
    }
    return out;
}
