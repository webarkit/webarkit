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

/**
 * The exact steps `NftTracker.process` runs (tracker.ts), written out
 * here against the same instrumented backend and the same defaults,
 * so this page's "stateless pipeline" mode and its "NftTracker" mode
 * measure the same work through the same calls -- the parity M1 claims,
 * made checkable rather than assumed. `maxKeypoints` is the one
 * default this page lets a run override (see `readMaxKeypoints`); the
 * NftTracker mode receives the same value as `maxSceneKeypoints`.
 *
 * `deps` is `{ matchPerLevel, DEFAULT_SCENE_LEVELS, DEFAULT_RATIO,
 * DEFAULT_RANSAC_THRESHOLD, MIN_DETECTION_INLIERS }`, from
 * `@webarkit/nft-tracker`.
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
    },
) {
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

    const h = icv.estimateHomography(src, dst, { threshold: DEFAULT_RANSAC_THRESHOLD });
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
    // A fit RANSAC accepted on a minimal sample, which detectTarget refuses
    // (#137); the parity test (examples/test/bench-stateless.test.mjs) holds
    // the two to the same answer (#191).
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
