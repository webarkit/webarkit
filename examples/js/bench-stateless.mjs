/*
 *  bench-stateless.mjs
 *  webarkit
 *
 *  This file is part of webarkit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * The bench page's "stateless pipeline" mode, out of the page so that a Node
 * test can run it (#191). The page calls it on every frame of a stateless run.
 *
 * It imports none of the packages: the tracker package's `matchPerLevel` and
 * the defaults it runs with arrive in `deps`, which is how the page injects
 * the bundled ones and a Node test the built ones, as
 * `./detection-worker-core.mjs` takes its own.
 */

/** Throws unless `value` is a finite number: see {@link runStatelessPipeline}'s `deps`. */
function requireNumber(name, value) {
    if (!Number.isFinite(value)) {
        throw new TypeError(`runStatelessPipeline: deps.${name} is ${value}, not a number`);
    }
}

/**
 * The detection steps `NftTracker.process` runs on a frame without a lock
 * (`detectTarget`, detection.ts), its refusals of a fit on fewer than
 * `MIN_DETECTION_INLIERS` inliers and of one whose `H` does not show the
 * target facing the camera (`targetSide`, #202) included, written out here against the
 * same instrumented backend and the same defaults, so this page's
 * "stateless pipeline" mode and its "NftTracker" mode measure the same
 * detection work through the same calls -- the parity M1 claims, made
 * checkable rather than assumed (the parity test,
 * examples/test/bench-stateless.test.mjs). The pose is not the same work:
 * this mode calls `poseFromHomography`, where the tracker chooses its pose
 * with `selectPose` (#134) and makes no such call. `maxKeypoints` is the one
 * default this page lets a run override (see `readMaxKeypoints`); the
 * NftTracker mode receives the same value as `maxSceneKeypoints`.
 *
 * `deps` is `{ matchPerLevel, DEFAULT_SCENE_LEVELS, DEFAULT_RATIO,
 * DEFAULT_RANSAC_THRESHOLD, MIN_DETECTION_INLIERS, targetSide, targetGrid }`,
 * from `@webarkit/nft-tracker`. A value missing from it throws, which fails the
 * page's run naming it: missing, `MIN_DETECTION_INLIERS` would turn the gate
 * off with no error, since `h.numInliers < undefined` is false (#191). The
 * facing rule uses the package's own `targetSide` on the package's own grid,
 * so the two paths cannot classify a fit differently.
 *
 * `rng`, optional, is RANSAC's generator (`RansacOptions.rng`, #24), as
 * `detectTarget`'s fifth argument: a seeded page passes the frame's
 * `frameRng` (#151). Without it the options are exactly as before.
 */
export function runStatelessPipeline(
    icv,
    targetDb,
    targetLevels,
    targetKeypoints,
    K,
    frame,
    timestampMs,
    maxKeypoints,
    {
        matchPerLevel,
        DEFAULT_SCENE_LEVELS,
        DEFAULT_RATIO,
        DEFAULT_RANSAC_THRESHOLD,
        MIN_DETECTION_INLIERS,
        targetSide,
        targetGrid,
    },
    rng,
) {
    for (const [name, fn] of [
        ["matchPerLevel", matchPerLevel],
        ["targetSide", targetSide],
        ["targetGrid", targetGrid],
    ]) {
        if (typeof fn !== "function") {
            throw new TypeError(`runStatelessPipeline: deps.${name} is not a function`);
        }
    }
    requireNumber("DEFAULT_SCENE_LEVELS", DEFAULT_SCENE_LEVELS);
    requireNumber("DEFAULT_RATIO", DEFAULT_RATIO);
    requireNumber("DEFAULT_RANSAC_THRESHOLD", DEFAULT_RANSAC_THRESHOLD);
    requireNumber("MIN_DETECTION_INLIERS", MIN_DETECTION_INLIERS);
    const sceneKeypoints = icv.detect(frame, {
        levels: DEFAULT_SCENE_LEVELS,
        maxKeypoints,
    });
    const sceneDescriptors = icv.describe(frame, sceneKeypoints);
    let matches = matchPerLevel(icv, sceneDescriptors, targetLevels, DEFAULT_RATIO);

    if (icv.filterMatches && targetKeypoints) {
        matches = icv.filterMatches(
            matches,
            { keypoints: sceneKeypoints, width: frame.width, height: frame.height },
            {
                keypoints: targetKeypoints,
                width: targetDb.meta.widthPx,
                height: targetDb.meta.heightPx,
            },
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

    const src = new Float64Array(matches.length * 2);
    const dst = new Float64Array(matches.length * 2);
    const kp = targetDb.keypoints;
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        src[i * 2] = kp.x[m.trainIdx];
        src[i * 2 + 1] = kp.y[m.trainIdx];
        dst[i * 2] = sceneKeypoints[m.queryIdx].x;
        dst[i * 2 + 1] = sceneKeypoints[m.queryIdx].y;
    }

    const h = icv.estimateHomography(
        src,
        dst,
        rng === undefined
            ? { threshold: DEFAULT_RANSAC_THRESHOLD }
            : { threshold: DEFAULT_RANSAC_THRESHOLD, rng },
    );
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
    // A fit RANSAC accepted on a minimal sample, which detectTarget refuses (#137).
    if (h.numInliers < MIN_DETECTION_INLIERS) {
        return {
            ok: false,
            reason: "too-few-inliers",
            timestampMs,
            numMatches: matches.length,
            numInliers: h.numInliers,
            H: null,
            pose: null,
            sceneKeypoints,
        };
    }
    // A fit whose H does not show the target facing the camera, which detectTarget
    // refuses (#202), on the same grid: targetGrid of the target's level-0 size.
    if (targetSide(h.H, targetGrid(...targetDb.pyramid.levelSizes[0])) !== "facing") {
        return {
            ok: false,
            reason: "not-facing",
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
        pose: icv.poseFromHomography(h.H, K),
        sceneKeypoints,
    };
}
