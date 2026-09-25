/*
 *  bench-metrics.test.mjs
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

import { describe, expect, it } from "vitest";
import {
    frameRecord,
    framesForStage,
    percentile,
    reprojectCorners,
    stats,
    targetCorners,
} from "../js/bench-metrics.mjs";

describe("percentile", () => {
    it("takes the sample at rank ⌊p/100 · n⌋, as the page always has", () => {
        const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(percentile(s, 50)).toBe(6);
        expect(percentile(s, 95)).toBe(10);
        expect(percentile([7], 95)).toBe(7);
    });

    it("is NaN on no samples", () => {
        expect(percentile([], 50)).toBeNaN();
    });
});

describe("stats", () => {
    it("sorts a copy and reports n, min, p50, p95 and max", () => {
        const values = [3, 1, 2];
        expect(stats(values)).toEqual({ n: 3, min: 1, p50: 2, p95: 3, max: 3 });
        expect(values).toEqual([3, 1, 2]);
    });

    it("reports null statistics, not NaN, on no values", () => {
        expect(stats([])).toEqual({ n: 0, min: null, p50: null, p95: null, max: null });
    });
});

describe("targetCorners and reprojectCorners", () => {
    it("names a w × h target's corners in level-0 px, clockwise from the origin", () => {
        expect(targetCorners(512, 640)).toEqual([
            [0, 0],
            [511, 0],
            [511, 639],
            [0, 639],
        ]);
    });

    it("projects them through H", () => {
        const H = [2, 0, 10, 0, 2, 20, 0, 0, 1];
        expect(reprojectCorners(H, targetCorners(3, 2))).toEqual([
            [10, 20],
            [14, 20],
            [14, 22],
            [10, 22],
        ]);
    });

    it("divides by w", () => {
        expect(reprojectCorners([1, 0, 0, 0, 1, 0, 0, 0, 2], [[4, 6]])).toEqual([[2, 3]]);
    });

    it("is null when a corner lands on the other side of the camera from the rest", () => {
        // w = 1 − x / 100: positive at x = 0, negative at x = 511.
        const H = [1, 0, 0, 0, 1, 0, -0.01, 0, 1];
        expect(reprojectCorners(H, targetCorners(512, 640))).toBeNull();
    });

    it("is null when a projection is not finite", () => {
        expect(reprojectCorners([1, 0, 0, 0, 1, 0, 0, 0, 0], targetCorners(2, 2))).toBeNull();
        expect(reprojectCorners([NaN, 0, 0, 0, 1, 0, 0, 0, 1], targetCorners(2, 2))).toBeNull();
    });
});

describe("frameRecord", () => {
    const targetPoints = targetCorners(3, 2);
    const H = [1, 0, 5, 0, 1, 7, 0, 0, 1];
    const tracking = {
        frameLevels: 1,
        culled: 2,
        attempted: 62,
        observed: 58,
        lost: 1,
        unconverged: 1,
        rejected: 2,
        failed: 0,
        inliers: 55,
        rmsError: 0.24,
        fitIterations: 3,
        fitConverged: true,
    };
    const trackerTimings = {
        totalMs: 4.2,
        detectMs: 0,
        trackMs: 4,
        pyramidMs: 0,
        alignMs: 3.8,
        fitMs: 0.1,
    };
    const stageTimings = { acquire: 20, total: 25 };
    const base = { stageTimings, timestampMs: 1000, mediaTimeSeconds: 1.5, targetPoints };

    it("copies what the tracker reports on a TRACK frame, as it reports it", () => {
        const result = {
            ok: true,
            state: "TRACK",
            quality: 0.86,
            timestampMs: 1000,
            numMatches: 58,
            numInliers: 55,
            H,
            pose: {},
            sceneKeypoints: [],
            trackLoss: null,
            tracking,
            timings: trackerTimings,
        };
        const r = frameRecord({ mode: "tracking", result, ...base });
        expect(r).toEqual({
            timestampMs: 1000,
            mediaTimeSeconds: 1.5,
            timings: { acquire: 20, total: 25 },
            ok: true,
            reason: null,
            numSceneKeypoints: 0,
            numMatches: 58,
            numInliers: 55,
            state: "TRACK",
            quality: 0.86,
            trackLoss: null,
            tracking,
            trackerTimings,
            corners: [
                [5, 7],
                [7, 7],
                [7, 8],
                [5, 8],
            ],
        });
        // Copies: the page reuses one timings object every tick.
        expect(r.tracking).not.toBe(tracking);
        expect(r.timings).not.toBe(stageTimings);
    });

    it("keeps a DETECT frame's track loss: the lock it dropped before detecting again", () => {
        const result = {
            ok: true,
            state: "DETECT",
            quality: 0.5,
            numMatches: 80,
            numInliers: 40,
            H,
            pose: {},
            sceneKeypoints: [{ x: 1, y: 1 }],
            trackLoss: "too-few-patches",
            tracking: {
                ...tracking,
                inliers: 0,
                rmsError: null,
                fitIterations: 0,
                fitConverged: null,
            },
            timings: trackerTimings,
        };
        const r = frameRecord({ mode: "tracking", result, ...base });
        expect(r).toMatchObject({
            state: "DETECT",
            trackLoss: "too-few-patches",
            numSceneKeypoints: 1,
        });
    });

    it("gives the stateless pipeline DETECT or LOST, and no tracker fields", () => {
        const ok = frameRecord({
            mode: "stateless",
            result: {
                ok: true,
                numMatches: 90,
                numInliers: 60,
                H,
                pose: {},
                sceneKeypoints: [{}, {}],
            },
            ...base,
        });
        expect(ok).toMatchObject({
            state: "DETECT",
            quality: null,
            trackLoss: null,
            tracking: null,
            trackerTimings: null,
            reason: null,
            numSceneKeypoints: 2,
        });
        const lost = frameRecord({
            mode: "stateless",
            result: {
                ok: false,
                reason: "too-few-matches",
                numMatches: 2,
                numInliers: 0,
                H: null,
                pose: null,
                sceneKeypoints: [],
            },
            ...base,
        });
        expect(lost).toMatchObject({ state: "LOST", reason: "too-few-matches", corners: null });
    });

    it("records a tracker without a clock as having no timings", () => {
        const result = {
            ok: false,
            state: "LOST",
            quality: 0,
            reason: "no-consensus",
            numMatches: 9,
            numInliers: 3,
            H: null,
            pose: null,
            sceneKeypoints: [],
            trackLoss: null,
            tracking: null,
            timings: null,
        };
        expect(frameRecord({ mode: "detection-only", result, ...base })).toMatchObject({
            state: "LOST",
            quality: 0,
            tracking: null,
            trackerTimings: null,
            corners: null,
        });
    });
});

describe("framesForStage", () => {
    const f = (state, extra = {}) => ({
        state,
        ok: state !== "LOST",
        reason: state === "LOST" ? "no-consensus" : null,
        ...extra,
    });
    const frames = [
        f("DETECT"),
        f("TRACK"),
        f("LOST", { reason: "too-few-matches" }),
        f("LOST"),
        f("TRACK"),
    ];

    it("takes detection's stages over the frames that detected: every frame but TRACK", () => {
        for (const s of ["detect", "describe", "match", "filterMatches"]) {
            expect(framesForStage(frames, s)).toEqual([frames[0], frames[2], frames[3]]);
        }
    });

    it("takes estimateHomography over the detections that found four matches", () => {
        expect(framesForStage(frames, "estimateHomography")).toEqual([frames[0], frames[3]]);
    });

    it("takes the pose over every frame with one, TRACK included", () => {
        expect(framesForStage(frames, "pose")).toEqual([frames[0], frames[1], frames[4]]);
    });

    it("takes acquire, gray and total over every frame", () => {
        for (const s of ["acquire", "gray", "total"])
            expect(framesForStage(frames, s)).toEqual(frames);
    });
});
