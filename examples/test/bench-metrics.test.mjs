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
    clockResolution,
    cornerJitter,
    countLoopWraps,
    DEFINITIONS,
    frameRecord,
    framesAt,
    framesForStage,
    lockSteps,
    METRICS_VERSION,
    MODES,
    nextFrameIndex,
    parsePositiveInt,
    parseRunParams,
    percentile,
    reacquisitions,
    reprojectCorners,
    sha256Hex,
    stats,
    summarizeRun,
    targetCorners,
    targetRecord,
    texturedFrame,
    timeRepeated,
    trackabilityError,
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

describe("loop wraps, re-acquisitions and lock steps", () => {
    const f = (state, t, o = {}) => ({
        state,
        ok: state !== "LOST",
        mediaTimeSeconds: t,
        tracking: null,
        trackLoss: null,
        ...o,
    });
    const step = { observed: 40 };

    it("counts a wrap wherever media time goes back", () => {
        expect(
            countLoopWraps([
                f("DETECT", 11.9),
                f("TRACK", 12.1),
                f("TRACK", 0.03),
                f("TRACK", 0.07),
            ]),
        ).toBe(1);
        expect(countLoopWraps([])).toBe(0);
    });

    it("counts DETECT frames after an earlier pose, not the window's first lock", () => {
        const frames = [
            f("LOST", 0.1),
            f("DETECT", 0.2),
            f("TRACK", 0.3),
            f("DETECT", 0.4),
            f("LOST", 0.5),
            f("DETECT", 0.6),
            f("DETECT", 0.7),
            f("TRACK", 0.8),
        ];
        expect(reacquisitions(frames)).toEqual({ reacquisitions: 3, reacquisitionsAtLoopWrap: 0 });
    });

    it("counts a DETECT on the first frame after a wrap apart: the jump there is the clip's", () => {
        const frames = [f("DETECT", 11.8), f("TRACK", 11.9), f("DETECT", 0.03), f("TRACK", 0.07)];
        expect(reacquisitions(frames)).toEqual({ reacquisitions: 0, reacquisitionsAtLoopWrap: 1 });
    });

    it("counts every posed frame after the first in a detection-only window", () => {
        const frames = [f("DETECT", 1), f("DETECT", 2), f("LOST", 3), f("DETECT", 4)];
        expect(reacquisitions(frames)).toEqual({ reacquisitions: 2, reacquisitionsAtLoopWrap: 0 });
    });

    it("tells a lock's first step from a held lock's, and counts which held", () => {
        const frames = [
            f("DETECT", 0.1),
            f("TRACK", 0.2, { tracking: step }), // first step: confirmed
            f("TRACK", 0.3, { tracking: step }), // held
            f("DETECT", 0.4, { tracking: step, trackLoss: "poor-fit" }), // held, lost
            f("DETECT", 0.5, { tracking: step, trackLoss: "too-few-patches" }), // first step, refused
            f("TRACK", 0.6, { tracking: step }), // first step: confirmed
            f("LOST", 0.7),
            f("DETECT", 0.8), // no step: nothing was locked
        ];
        expect(lockSteps(frames)).toEqual({
            firstSteps: { n: 3, confirmed: 2 },
            heldLockSteps: { n: 2, lost: 1 },
        });
    });

    it("finds no lock steps where nothing tracks", () => {
        expect(lockSteps([f("DETECT", 0.1), f("DETECT", 0.2), f("LOST", 0.3)])).toEqual({
            firstSteps: { n: 0, confirmed: 0 },
            heldLockSteps: { n: 0, lost: 0 },
        });
    });
});

describe("cornerJitter", () => {
    const at = (t, dx = 0, dy = 0) => ({
        mediaTimeSeconds: t,
        corners: [
            [dx, dy],
            [100 + dx, dy],
            [100 + dx, 200 + dy],
            [dx, 200 + dy],
        ],
    });

    it("is 0 for a target that does not move", () => {
        expect(cornerJitter([at(0.1), at(0.2), at(0.3), at(0.4)])).toEqual({
            posedFrames: 4,
            jitterWindows: 1,
            jitterPx: 0,
            spreadPx: 0,
        });
    });

    it("does not count motion that is straight within a second, which the spread counts in full", () => {
        const frames = Array.from({ length: 300 }, (_, i) => at(i / 30, 0.1 * i));
        const r = cornerJitter(frames);
        expect(r.jitterWindows).toBe(10);
        expect(r.jitterPx).toBeCloseTo(0, 9);
        expect(r.spreadPx).toBeCloseTo(0.1 * Math.sqrt((300 * 300 - 1) / 12), 9);
    });

    it("measures the residual about each window's line, with n − 2 degrees of freedom", () => {
        // x = 0, 1, 0, 1 at t = 0, 0.25, 0.5, 0.75: the line through them has slope 0.8,
        // residuals ±0.2 and ±0.6, so Σr² = 0.8 per corner and dof = 4 − 2.
        const frames = [at(0, 0), at(0.25, 1), at(0.5, 0), at(0.75, 1)];
        const r = cornerJitter(frames);
        expect(r.jitterPx).toBeCloseTo(Math.sqrt(0.4), 12);
        expect(r.spreadPx).toBeCloseTo(0.5, 12);
    });

    it("estimates the corners' standard deviation for a still target, at any frame rate", () => {
        // Park–Miller through Box–Muller: deterministic normal noise, σ = 0.3 px per axis.
        let seed = 12345;
        const u = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
        const frames = Array.from({ length: 6000 }, (_, i) => ({
            mediaTimeSeconds: i / 30,
            corners: Array.from({ length: 4 }, () => [0.3 * g(), 0.3 * g()]),
        }));
        const every = cornerJitter(frames);
        const fourth = cornerJitter(frames.filter((_, i) => i % 4 === 0));
        expect(every.spreadPx).toBeCloseTo(0.3 * Math.SQRT2, 2);
        expect(every.jitterPx / every.spreadPx).toBeGreaterThan(0.97);
        expect(every.jitterPx / every.spreadPx).toBeLessThan(1.03);
        expect(fourth.jitterPx / every.jitterPx).toBeGreaterThan(0.95);
        expect(fourth.jitterPx / every.jitterPx).toBeLessThan(1.05);
    });

    it("never mixes the two sides of a loop wrap in one window", () => {
        // Still within each loop, 5 px apart between them: one window each, both 0.
        const frames = [
            at(0.1),
            at(0.3),
            at(0.5),
            at(0.7),
            at(0.2, 5),
            at(0.4, 5),
            at(0.6, 5),
            at(0.8, 5),
        ];
        expect(cornerJitter(frames)).toMatchObject({ jitterWindows: 2, jitterPx: 0 });
    });

    it("skips windows with fewer than 4 frames with corners", () => {
        const frames = [
            at(0.1),
            at(0.2),
            { mediaTimeSeconds: 0.3, corners: null },
            at(0.4),
            at(1.2, 3),
            at(1.5, 1),
        ];
        expect(cornerJitter(frames)).toMatchObject({
            posedFrames: 5,
            jitterWindows: 0,
            jitterPx: null,
        });
    });

    it("reports null, not NaN, without the frames to measure", () => {
        expect(cornerJitter([])).toEqual({
            posedFrames: 0,
            jitterWindows: 0,
            jitterPx: null,
            spreadPx: null,
        });
        expect(cornerJitter([at(0.1, 1, 2)])).toEqual({
            posedFrames: 1,
            jitterWindows: 0,
            jitterPx: null,
            spreadPx: 0,
        });
    });
});

describe("summarizeRun", () => {
    const stepTimings = (trackMs) => ({
        totalMs: trackMs + 0.2,
        detectMs: 0,
        trackMs,
        pyramidMs: 0,
        alignMs: trackMs - 0.3,
        fitMs: 0.1,
    });
    const step = (o = {}) => ({
        frameLevels: 1,
        culled: 0,
        attempted: 64,
        observed: 60,
        lost: 0,
        unconverged: 1,
        rejected: 3,
        failed: 0,
        inliers: 57,
        rmsError: 0.23,
        fitIterations: 3,
        fitConverged: true,
        ...o,
    });
    const frame = (state, t, o = {}) => ({
        state,
        ok: state !== "LOST",
        mediaTimeSeconds: t,
        quality: state === "TRACK" ? 0.88 : state === "DETECT" ? 0.6 : 0,
        trackLoss: null,
        tracking: null,
        trackerTimings: null,
        corners:
            state === "LOST"
                ? null
                : [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                      [0, 1],
                  ],
        ...o,
    });
    const window = [
        frame("DETECT", 0.1, { trackerTimings: stepTimings(0) }),
        frame("TRACK", 0.2, { tracking: step(), trackerTimings: stepTimings(12) }),
        frame("TRACK", 0.3, {
            tracking: step({ fitIterations: 20, fitConverged: false }),
            trackerTimings: stepTimings(14),
            quality: 0.15,
        }),
        frame("DETECT", 0.4, {
            trackLoss: "too-few-patches",
            tracking: step({
                observed: 5,
                inliers: 0,
                rmsError: null,
                fitIterations: 0,
                fitConverged: null,
            }),
            trackerTimings: stepTimings(9),
        }),
        frame("TRACK", 0.5, {
            tracking: step({ frameLevels: 2 }),
            trackerTimings: stepTimings(10),
        }),
    ];

    it("reads the tracking step's timings on TRACK frames only", () => {
        const s = summarizeRun(window);
        expect(s.trackStepMs).toEqual({ n: 3, min: 10, p50: 12, p95: 14, max: 14 });
        expect(s.alignMs.p50).toBeCloseTo(11.7, 12);
        expect(s.pyramidMs).toEqual({ n: 3, min: 0, p50: 0, p95: 0, max: 0 });
    });

    it("counts states, share, losses, lock steps, levels, fits and low-quality TRACK frames", () => {
        const s = summarizeRun(window);
        expect(s).toMatchObject({
            frames: 5,
            states: { LOST: 0, DETECT: 2, TRACK: 3 },
            trackShare: 0.6,
            reacquisitions: 1,
            reacquisitionsAtLoopWrap: 0,
            loopWraps: 0,
            lockLosses: { "too-few-patches": 1 },
            firstSteps: { n: 2, confirmed: 2 },
            heldLockSteps: { n: 2, lost: 1 },
            frameLevels: { 1: 2, 2: 1 },
            lowQualityTrackFrames: 1,
            jitterWindows: 1,
            jitterPx: 0,
        });
        expect(s.fits).toEqual({
            n: 3,
            capped: 1,
            iterations: { n: 3, min: 3, p50: 3, p95: 20, max: 20 },
        });
        expect(s.quality).toMatchObject({ n: 3, min: 0.15 });
        expect(s.trackedPatches).toMatchObject({ n: 3, p50: 57 });
    });

    it("reports a stateless window's tracker metrics as absent, not as zero", () => {
        const s = summarizeRun([
            frame("DETECT", 0.1, { quality: null }),
            frame("LOST", 0.2, { quality: null }),
        ]);
        expect(s.trackStepMs).toEqual({ n: 0, min: null, p50: null, p95: null, max: null });
        expect(s.fits).toEqual({
            n: 0,
            capped: 0,
            iterations: { n: 0, min: null, p50: null, p95: null, max: null },
        });
        expect(s.trackShare).toBe(0);
    });

    it("reports an empty window without NaN", () => {
        expect(summarizeRun([])).toMatchObject({
            frames: 0,
            trackShare: null,
            jitterPx: null,
            spreadPx: null,
        });
    });

    it("defines every metric it reports, once, in DEFINITIONS", () => {
        for (const key of Object.keys(summarizeRun(window)))
            expect(DEFINITIONS, key).toHaveProperty(key);
        for (const key of ["corners", "alignment"]) expect(DEFINITIONS).toHaveProperty(key);
        expect(Object.isFrozen(DEFINITIONS)).toBe(true);
        expect(METRICS_VERSION).toBe(1);
    });
});

describe("parsePositiveInt and parseRunParams", () => {
    const clips = ["pinball-bench.mp4", "pinball-static.mp4"];

    it("reads a positive integer, and nothing else", () => {
        expect(parsePositiveInt("300")).toBe(300);
        expect(parsePositiveInt("150.9")).toBe(150);
        for (const raw of [null, "", " ", "abc", "0", "-5", "1e999"])
            expect(parsePositiveInt(raw)).toBeNull();
    });

    it("sets nothing without parameters", () => {
        expect(parseRunParams("", { bundledClips: clips })).toEqual({
            maxKeypoints: null,
            procWidth: null,
            procHeight: null,
            camera: null,
            mode: null,
            target: null,
            windowSize: null,
            clip: null,
        });
    });

    it("reads a tracking run's URL, and gives tracking the file by default", () => {
        const p = parseRunParams(
            "?mode=tracking&window=300&clip=pinball-static.mp4&maxKeypoints=150",
            {
                bundledClips: clips,
            },
        );
        expect(p).toMatchObject({
            mode: "tracking",
            target: "wnft",
            windowSize: 300,
            clip: "pinball-static.mp4",
            maxKeypoints: 150,
        });
    });

    it("keeps an explicit target, even one tracking cannot use: Start refuses it", () => {
        expect(parseRunParams("?mode=tracking&target=image", { bundledClips: clips }).target).toBe(
            "image",
        );
    });

    it("drops what is out of its domain, and clamps the window to 10–2000", () => {
        const p = parseRunParams("?mode=tracker&target=png&clip=other.mp4&window=5&camera=side", {
            bundledClips: clips,
        });
        expect(p).toMatchObject({
            mode: null,
            target: null,
            clip: null,
            windowSize: 10,
            camera: null,
        });
        expect(parseRunParams("?window=99999", { bundledClips: clips }).windowSize).toBe(2000);
        expect(parseRunParams("?camera=front", { bundledClips: clips }).camera).toBe("user");
        expect(parseRunParams("?camera=rear", { bundledClips: clips }).camera).toBe("environment");
        expect(MODES).toEqual(["stateless", "detection-only", "tracking"]);
    });
});

describe("trackabilityError", () => {
    const db = (patches) => ({ patches });

    it("accepts a target NftTracker would track", () => {
        expect(trackabilityError(db({ count: 64, patchSize: 16 }), 8)).toBeNull();
    });

    it.each([
        ["no patches", undefined, /no patches/],
        ["patches under 3 × 3", { count: 64, patchSize: 2 }, /3 × 3/],
        ["fewer patches than minTrackedPatches", { count: 7, patchSize: 16 }, /minTrackedPatches/],
    ])("refuses a target with %s, naming targets/pinball.wnft", (_, patches, why) => {
        const message = trackabilityError(db(patches), 8);
        expect(message).toMatch(why);
        expect(message).toMatch(/targets\/pinball\.wnft/);
    });
});

describe("clockResolution", () => {
    it("finds the smallest step a coarse clock takes", () => {
        let calls = 0;
        expect(clockResolution(() => Math.floor(calls++ / 7) * 0.1, 20)).toBeCloseTo(0.1, 12);
    });

    it("is null for a clock that never moves", () => {
        expect(clockResolution(() => 5, 2)).toBeNull();
    });
});

describe("timeRepeated", () => {
    it("times runs after untimed warm-up runs, and ranks p50 and p95 as bench-tracking.mjs does", () => {
        let now = 0;
        let i = 0;
        const r = timeRepeated(() => void (now += ++i), { clock: () => now, warmup: 5, runs: 10 });
        // Timed calls add 6 … 15: p50 is rank 5 of 10, p95 rank 9.
        expect(r).toEqual({ p50: 11, p95: 15 });
    });
});

describe("texturedFrame", () => {
    it("is bench-tracking.mjs's texture, pixel for pixel", () => {
        const f = texturedFrame(5, 4);
        expect(f.width).toBe(5);
        expect(f.height).toBe(4);
        expect(f.data).toBeInstanceOf(Uint8Array);
        for (const [x, y] of [
            [0, 0],
            [4, 0],
            [2, 3],
            [4, 3],
        ]) {
            const v =
                128 +
                50 * Math.sin(0.35 * x + 0.2 * y) +
                40 * Math.cos(0.23 * y - 0.31 * x) +
                20 * Math.sin(0.57 * x) * Math.cos(0.49 * y);
            expect(f.data[y * 5 + x]).toBe(Math.round(v));
        }
    });
});

describe("sha256Hex and targetRecord", () => {
    it("hashes bytes to lowercase hex", async () => {
        expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });

    it("is null without SubtleCrypto, as on a page served over plain http from another host", async () => {
        expect(await sha256Hex(new Uint8Array(1), null)).toBeNull();
    });

    const meta = { widthPx: 512, heightPx: 640 };
    const pyramid = {
        scaleStep: Math.cbrt(2),
        levelSizes: [
            [512, 640],
            [406, 507],
        ],
    };

    it("says what a decoded target carries", () => {
        const db = {
            meta,
            pyramid,
            keypoints: { count: 2062 },
            patches: { count: 64, patchSize: 16 },
        };
        expect(
            targetRecord({ source: "wnft", file: "targets/pinball.wnft", sha256: "ab", db }),
        ).toEqual({
            source: "wnft",
            file: "targets/pinball.wnft",
            sha256: "ab",
            builtWith: null,
            widthPx: 512,
            heightPx: 640,
            levels: 2,
            keypoints: 2062,
            patches: 64,
            patchSize: 16,
        });
    });

    it("says a target built in the page has no patches, and how it was built", () => {
        const db = { meta, pyramid, keypoints: { count: 2067 } };
        const builtWith = { function: "buildTargetFromImage", maxSide: 640, levels: 8 };
        expect(
            targetRecord({
                source: "image",
                file: "images/pinball.jpg",
                sha256: null,
                db,
                builtWith,
            }),
        ).toMatchObject({
            patches: 0,
            patchSize: null,
            builtWith,
        });
    });
});

describe("nextFrameIndex and framesAt", () => {
    const times = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30];

    it("takes the first frame at or after the busy time, and runs off the end when there is none", () => {
        expect(nextFrameIndex(times, 0, 10)).toBe(1); // done before the next frame
        expect(nextFrameIndex(times, 0, 50)).toBe(2); // 50 ms: frame 1 (33 ms) went stale
        expect(nextFrameIndex(times, 1, 30)).toBe(2); // under one interval (33.3 ms)
        expect(nextFrameIndex(times, 4, 120)).toBe(6);
    });

    it("finds each media time's frame to the microsecond, and throws on one no frame has", () => {
        expect(framesAt([0.1, 0.133333, 0.166667], [0.166667, 0.1333330000001, 0.1])).toEqual([
            2, 1, 0,
        ]);
        expect(() => framesAt([0.1, 0.133333], [0.12])).toThrow(/no frame at media time 0\.12/);
    });
});
