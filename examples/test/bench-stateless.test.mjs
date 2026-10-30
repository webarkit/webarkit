/*
 *  bench-stateless.test.mjs
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
 * The bench page's stateless pipeline is a copy of the detection steps, not a
 * call to `detectTarget`, so the two can drift apart, and did: #137's gate
 * (#192) refused 4-inlier fits in `detectTarget` while the stateless mode still
 * posed them (#191). This is the test that keeps them from drifting again: one
 * stub backend feeds both the same frame, and they must agree on what they
 * report, on every way a detection can end.
 *
 * The stub scripts the backend's answers (the scene's keypoints, its matches
 * against the target's first level, and RANSAC's result), so each case is the
 * pipeline's own decision on a fixed input, with nothing drawn at random. The
 * target is the committed `pinball.wnft`, and both paths index it the way the
 * page and `prepareDetection` do.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    buildLevelIndex,
    chooseDescriptorSet,
    decode,
    detectTarget,
    matchPerLevel,
    prepareDetection,
    DEFAULT_RANSAC_THRESHOLD,
    DEFAULT_RATIO,
    DEFAULT_SCENE_LEVELS,
    MIN_DETECTION_INLIERS,
} from "../../packages/nft-tracker/dist/index.js";
import { runStatelessPipeline } from "../js/bench-stateless.mjs";

/** What the page passes the stateless pipeline from the tracker package (`STATELESS_DEPS`). */
const DEPS = {
    matchPerLevel,
    DEFAULT_SCENE_LEVELS,
    DEFAULT_RATIO,
    DEFAULT_RANSAC_THRESHOLD,
    MIN_DETECTION_INLIERS,
};

const decoded = decode(readFileSync(new URL("../targets/pinball.wnft", import.meta.url)));
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}: ${decoded.detail}`);
const target = decoded.target;

const FRAME = { width: 270, height: 360, data: new Uint8Array(270 * 360) };
const H = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/**
 * A backend whose every answer is scripted: `matches` correspondences between
 * scene keypoint i and the first target level's keypoint i, and `ransac`'s
 * `{ ok, numInliers }` as `estimateHomography`'s result, its mask marking the
 * first `numInliers` correspondences. With `filter`, a `filterMatches` that
 * keeps the first `filter` matches; without, none, and both paths skip it.
 */
function stubBackend({ matches, ransac, filter }) {
    let firstLevel = null;
    const filterMatches = (m) => m.slice(0, filter);
    return {
        ...(filter === undefined ? {} : { filterMatches }),
        capabilities: { name: "stub", descriptors: ["orb"] },
        detect: () =>
            Array.from({ length: Math.max(matches, 1) }, (_, i) => ({
                x: 10 + i,
                y: 20 + i,
                score: 1,
                angle: 0,
                level: 0,
            })),
        describe: () => ({ scene: true }),
        match: (query, train) => {
            firstLevel ??= train;
            if (train !== firstLevel) return [];
            return Array.from({ length: matches }, (_, i) => ({
                queryIdx: i,
                trainIdx: i,
                distance: 1,
            }));
        },
        estimateHomography: (src) => {
            const n = src.length / 2;
            const inliers = new Uint8Array(n);
            for (let i = 0; i < Math.min(ransac.numInliers, n); i++) inliers[i] = 1;
            return ransac.ok
                ? { ok: true, H, inliers, numInliers: ransac.numInliers }
                : { ok: false, H: null, inliers, numInliers: ransac.numInliers };
        },
        poseFromHomography: () => ({
            R: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
            t: new Float64Array(3),
        }),
    };
}

/** The target's keypoints as the contract's `Keypoint[]`, as the page's `toKeypointArray` builds them. */
function targetKeypointArray() {
    const kp = target.keypoints;
    return Array.from({ length: kp.count }, (_, i) => ({
        x: kp.x[i],
        y: kp.y[i],
        score: kp.score[i],
        angle: kp.angle[i],
        level: kp.level[i],
    }));
}

/** The stateless pipeline on the stub's frame, as the page calls it, with `deps` for the page's `STATELESS_DEPS`. */
function statelessPath(script, deps = DEPS) {
    const cv = stubBackend(script);
    const levels = buildLevelIndex(chooseDescriptorSet(cv, target));
    const keypoints = cv.filterMatches ? targetKeypointArray() : null;
    return runStatelessPipeline(cv, target, levels, keypoints, null, FRAME, 40, 500, deps);
}

/** The same frame through both paths, each with its own backend built from `script`. */
function bothPaths(script) {
    const stateless = statelessPath(script);
    const cvTracker = stubBackend(script);
    const setup = prepareDetection(cvTracker, target, { maxSceneKeypoints: 500 });
    const tracker = detectTarget(cvTracker, setup, FRAME, 40);
    return { stateless, tracker };
}

const view = (d) => ({
    ok: d.ok,
    reason: d.ok ? null : d.reason,
    numInliers: d.numInliers,
    numMatches: d.numMatches,
    numSceneKeypoints: d.sceneKeypoints.length,
});

describe("the stateless pipeline agrees with detectTarget on every refusal (#191: the parity test that keeps them from drifting)", () => {
    it.each([
        [
            "an accepted fit on 4 inliers, which both refuse as too-few-inliers",
            { matches: 12, ransac: { ok: true, numInliers: 4 } },
            {
                ok: false,
                reason: "too-few-inliers",
                numInliers: 4,
                numMatches: 12,
                numSceneKeypoints: 12,
            },
        ],
        [
            "an accepted fit on 5 inliers, which both accept",
            { matches: 12, ransac: { ok: true, numInliers: 5 } },
            { ok: true, reason: null, numInliers: 5, numMatches: 12, numSceneKeypoints: 12 },
        ],
        [
            "a RANSAC failure, which both refuse as no-consensus",
            { matches: 12, ransac: { ok: false, numInliers: 0 } },
            {
                ok: false,
                reason: "no-consensus",
                numInliers: 0,
                numMatches: 12,
                numSceneKeypoints: 12,
            },
        ],
        [
            "too few matches to estimate, which both refuse as too-few-matches",
            { matches: 3, ransac: { ok: true, numInliers: 3 } },
            {
                ok: false,
                reason: "too-few-matches",
                numInliers: 0,
                numMatches: 3,
                numSceneKeypoints: 3,
            },
        ],
        [
            "an accepted fit on 4 inliers among the matches filterMatches keeps, which both refuse",
            { matches: 12, filter: 6, ransac: { ok: true, numInliers: 4 } },
            {
                ok: false,
                reason: "too-few-inliers",
                numInliers: 4,
                numMatches: 6,
                numSceneKeypoints: 12,
            },
        ],
    ])("%s", (_, script, expected) => {
        const { stateless, tracker } = bothPaths(script);
        expect(view(tracker), "detectTarget").toEqual(expected);
        expect(view(stateless), "the stateless pipeline").toEqual(view(tracker));
        // The page draws and exports a pose whenever there is one: a refusal carries none.
        if (!stateless.ok) expect([stateless.H, stateless.pose]).toEqual([null, null]);
    });

    // Missing, the constant would turn the gate off with no error (`h.numInliers < undefined` is
    // false): the 4-inlier frame would be posed again, and every case above would pass on DEPS.
    it.each(Object.keys(DEPS))("refuses deps without %s, rather than run without it", (name) => {
        const { [name]: _, ...deps } = DEPS;
        expect(() =>
            statelessPath({ matches: 12, ransac: { ok: true, numInliers: 4 } }, deps),
        ).toThrow(`deps.${name}`);
    });
});
