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

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    accountingError,
    clockResolution,
    cornerJitter,
    countedLoopFrames,
    countLoopWraps,
    DEFINITIONS,
    DETECTION_PATHS,
    frameRecord,
    framesAt,
    framesForStage,
    lockSteps,
    METRICS_VERSION,
    MODES,
    nextFrameIndex,
    parsePositiveInt,
    parseRunParams,
    parseTrackerOverrides,
    percentile,
    proxyRatio,
    reacquisitions,
    reprojectCorners,
    sequenceRefusal,
    sequenceSettings,
    sha256Hex,
    startRefusal,
    stats,
    summarizeRun,
    targetCorners,
    targetRecord,
    texturedFrame,
    timeRepeated,
    trackabilityError,
    trackTimeShare,
    TUNABLE_TRACKER_OPTIONS,
    unwrapMediaTimes,
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
            needsDetection: false,
            detectionUse: null,
            detectionLatencyMs: null,
            detectionInFlight: false,
            detectedAt: null,
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

    it("records what became of detection on every frame", () => {
        const tracked = {
            ok: true,
            state: "TRACK",
            quality: 0.9,
            numMatches: 50,
            numInliers: 48,
            H,
            pose: {},
            sceneKeypoints: [],
            trackLoss: null,
            tracking,
            timings: trackerTimings,
        };
        const detectedAt = { timestampMs: 100, mediaTimeSeconds: 0.2, framesAgo: 3 };

        // A detection computed on a frame three processed frames back, handed in and used.
        const consumed = frameRecord({
            mode: "tracking",
            result: {
                ...tracked,
                needsDetection: false,
                detectionUse: "consumed",
                detectionLatencyMs: 92.5,
            },
            detection: { inFlight: false, detectedAt },
            ...base,
        });
        expect(consumed).toMatchObject({
            needsDetection: false,
            detectionUse: "consumed",
            detectionLatencyMs: 92.5,
            detectionInFlight: false,
            detectedAt,
        });
        expect(consumed.detectedAt).not.toBe(detectedAt);

        // The tracker's own detection is of the frame it ran on: this one.
        const internal = frameRecord({
            mode: "tracking",
            result: {
                ...tracked,
                state: "DETECT",
                needsDetection: false,
                detectionUse: "internal",
                detectionLatencyMs: null,
            },
            ...base,
        });
        expect(internal).toMatchObject({
            needsDetection: false,
            detectionUse: "internal",
            detectionLatencyMs: null,
            detectionInFlight: false,
            detectedAt: { timestampMs: 1000, mediaTimeSeconds: 1.5, framesAgo: 0 },
        });

        // A frame that asked for a detection while one was in flight used none.
        const waiting = frameRecord({
            mode: "tracking",
            result: {
                ok: false,
                state: "LOST",
                quality: 0,
                reason: "no-detection",
                numMatches: 0,
                numInliers: 0,
                H: null,
                pose: null,
                sceneKeypoints: [],
                trackLoss: null,
                tracking: null,
                timings: trackerTimings,
                needsDetection: true,
                detectionUse: "none",
                detectionLatencyMs: null,
            },
            detection: { inFlight: true },
            ...base,
        });
        expect(waiting).toMatchObject({
            needsDetection: true,
            detectionUse: "none",
            detectionInFlight: true,
            detectedAt: null,
        });

        // A detection that was ignored was not used: it is of no frame the record names.
        const ignored = frameRecord({
            mode: "tracking",
            result: {
                ...tracked,
                needsDetection: false,
                detectionUse: "ignored",
                detectionLatencyMs: null,
            },
            detection: { inFlight: false, detectedAt },
            ...base,
        });
        expect(ignored).toMatchObject({ detectionUse: "ignored", detectedAt: null });

        // The stateless pipeline has no tracker: every frame detects, and none says so.
        const stateless = frameRecord({
            mode: "stateless",
            result: {
                ok: true,
                numMatches: 90,
                numInliers: 60,
                H,
                pose: {},
                sceneKeypoints: [],
            },
            ...base,
        });
        expect(stateless).toMatchObject({
            needsDetection: false,
            detectionUse: null,
            detectionLatencyMs: null,
            detectionInFlight: false,
            detectedAt: null,
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

    it("takes the detection stages over the frames that ran the tracker's own detection, and reads older exports as M2's", () => {
        const record = [
            f("LOST", { detectionUse: "none" }), // a worker run's waiting frame: not unlocked-and-detecting
            f("DETECT", { detectionUse: "consumed" }), // a detection computed elsewhere
            f("TRACK", { detectionUse: "none" }),
            f("TRACK", { detectionUse: "ignored" }),
            f("DETECT", { detectionUse: "internal" }), // the tracker's own
            f("LOST", { detectionUse: "internal", reason: "too-few-matches" }),
            f("LOST", { detectionUse: "internal" }),
        ];
        for (const s of ["detect", "describe", "match", "filterMatches"]) {
            expect(framesForStage(record, s)).toEqual([record[4], record[5], record[6]]);
        }
        expect(framesForStage(record, "estimateHomography")).toEqual([record[4], record[6]]);
        // The other stages do not read it.
        expect(framesForStage(record, "pose")).toEqual(record.filter((r) => r.ok));
        expect(framesForStage(record, "total")).toEqual(record);

        // Older exports have no detectionUse; the stateless mode's is null. Both detect on
        // every frame that is not TRACK, which is what M2's tracker did.
        const older = [
            f("LOST"),
            f("TRACK"),
            f("DETECT", { detectionUse: null }),
            f("TRACK", { detectionUse: null }),
            f("LOST", { detectionUse: null, reason: "too-few-matches" }),
        ];
        expect(framesForStage(older, "detect")).toEqual([older[0], older[2], older[4]]);
        expect(framesForStage(older, "estimateHomography")).toEqual([older[0], older[2]]);
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
            heldLockSteps: { n: 2, lost: 1, lostAtLoopWrap: 0 },
        });
    });

    it("counts a held lock lost on the first frame after a wrap apart: the jump there is the clip's", () => {
        const frames = [
            f("DETECT", 11.8),
            f("TRACK", 11.9, { tracking: step }),
            f("DETECT", 0.03, { tracking: step, trackLoss: "too-few-patches" }), // held, lost at the wrap
            f("TRACK", 0.07, { tracking: step }),
            f("TRACK", 0.1, { tracking: step }),
        ];
        expect(lockSteps(frames).heldLockSteps).toEqual({ n: 2, lost: 0, lostAtLoopWrap: 1 });
    });

    it("finds no lock steps where nothing tracks", () => {
        expect(lockSteps([f("DETECT", 0.1), f("DETECT", 0.2), f("LOST", 0.3)])).toEqual({
            firstSteps: { n: 0, confirmed: 0 },
            heldLockSteps: { n: 0, lost: 0, lostAtLoopWrap: 0 },
        });
    });
});

describe("unwrapMediaTimes, countedLoopFrames and trackTimeShare", () => {
    // A 1-second clip, D = 1: loop k's frame at media time m is at k + m on the unwrapped
    // timeline, and 10 ms bins make 100 to a loop. Times are chosen to be exact in binary.
    const D = 1;
    const frame = (state, mediaTimeSeconds, o = {}) => ({ state, mediaTimeSeconds, ...o });
    const closeTo = (actual, expected) => {
        expect(actual).toHaveLength(expected.length);
        actual.forEach((t, i) => expect(t).toBeCloseTo(expected[i], 9));
    };
    // Unwrapped time in the comment. Loop 0 is the warm-up; its last frame holds a lock.
    const run = [
        frame("LOST", 0), // 0
        frame("TRACK", 0.5), // 0.5
        frame("TRACK", 0.9), // 0.9: the warm-up's last frame
        frame("TRACK", 0.5), // 1.5: loop 1
        frame("LOST", 0.25), // 2.25: loop 2
        frame("TRACK", 0.75), // 2.75
        frame("TRACK", 0.5), // 3.5: loop 3
        frame("LOST", 0.25), // 4.25: loop 4
        frame("LOST", 0.1), // 5.1: loop 5, which closes loop 4
    ];

    it("puts every frame on one timeline, loop k adding k times the clip's duration", () => {
        closeTo(unwrapMediaTimes(run, D), [0, 0.5, 0.9, 1.5, 2.25, 2.75, 3.5, 4.25, 5.1]);
        // A run that starts mid-clip: its first pass is loop 0 all the same.
        closeTo(
            unwrapMediaTimes([frame("LOST", 10.8), frame("LOST", 11.9), frame("LOST", 0.1)], 11.96),
            [10.8, 11.9, 12.06],
        );
        expect(unwrapMediaTimes([], D)).toEqual([]);
    });

    it("takes the frames whose unwrapped time is in [first · D, (first + count) · D)", () => {
        expect(countedLoopFrames(run, { clipDurationS: D, firstLoop: 1, loopCount: 2 })).toEqual([
            run[3],
            run[4],
            run[5],
        ]);
        // Loops 1 to 4 by default.
        expect(countedLoopFrames(run, { clipDurationS: D })).toEqual(run.slice(3, 8));
        // The first frame of a loop, at its media time 0, is inside it; the next loop's is not.
        const edges = [
            frame("LOST", 0.5),
            frame("LOST", 0.9),
            frame("TRACK", 0), // 1
            frame("TRACK", 0.5), // 1.5
            frame("LOST", 0), // 2
        ];
        expect(countedLoopFrames(edges, { clipDurationS: D, firstLoop: 1, loopCount: 1 })).toEqual(
            [edges[2], edges[3]],
        );
    });

    it("reads the lock over loops 1 to 4 on a fixed grid, holding the state across a wrap", () => {
        const r = trackTimeShare(run, { clipDurationS: D });
        // Loop 1: TRACK from 1.5, and the warm-up's last frame's TRACK before it, so all of it.
        // Loop 2: TRACK to 2.25, LOST to 2.75, TRACK after: half. Loop 3: TRACK throughout.
        // Loop 4: TRACK to 4.25, LOST after: a quarter.
        expect(r.perLoop).toEqual([1, 0.5, 1, 0.25]);
        expect(r.perLoop[0]).toBe(1);
        expect(r.share).toBe(275 / 400);
        expect(r.loops).toEqual([1, 4]);
        expect(r.complete).toBe(true);
        // The same options, spelled out.
        expect(trackTimeShare(run, { clipDurationS: D, firstLoop: 1, loopCount: 4 })).toEqual(r);
        // Fewer loops: the first two of them.
        expect(trackTimeShare(run, { clipDurationS: D, loopCount: 2 })).toMatchObject({
            perLoop: [1, 0.5],
            share: 0.75,
            loops: [1, 2],
            complete: true,
        });
    });

    it("reports a run incomplete when loop 5 was not reached or loop 1 has no frame before it", () => {
        // Loop 5 was not reached: the last frame is in loop 4.
        const short = run.slice(0, -1);
        expect(trackTimeShare(short, { clipDurationS: D })).toEqual({
            share: null,
            perLoop: null,
            binMs: 10,
            loops: [1, 4],
            complete: false,
        });
        // Nothing precedes loop 0's first bin when the run starts mid-clip: loop 0 is never
        // complete there, and loop 1, which the warm-up's frames precede, is.
        const midClip = [frame("TRACK", 0.3), ...run.slice(2)];
        expect(trackTimeShare(midClip, { clipDurationS: D, firstLoop: 0, loopCount: 1 })).toEqual({
            share: null,
            perLoop: null,
            binMs: 10,
            loops: [0, 0],
            complete: false,
        });
        expect(trackTimeShare(midClip, { clipDurationS: D, loopCount: 1 }).complete).toBe(true);
        // No frames at all.
        expect(trackTimeShare([], { clipDurationS: D })).toMatchObject({
            share: null,
            perLoop: null,
            complete: false,
        });
    });

    it("uses the bin size it reports", () => {
        // TRACK for two 10 ms bins of loop 1, from 1.05 to 1.07, and no longer.
        const brief = [
            frame("LOST", 0),
            frame("LOST", 0.95),
            frame("TRACK", 0.05), // 1.05
            frame("LOST", 0.07), // 1.07
            frame("LOST", 0.02), // 2.02: loop 2
        ];
        const fine = trackTimeShare(brief, { clipDurationS: D, loopCount: 1 });
        expect(fine).toMatchObject({ binMs: 10, share: 0.02, complete: true });
        // 100 ms bins, at 1.0, 1.1, …, never see it.
        const coarse = trackTimeShare(brief, { clipDurationS: D, loopCount: 1, binMs: 100 });
        expect(coarse).toMatchObject({ binMs: 100, share: 0, perLoop: [0], complete: true });
    });

    it("refuses a clip duration, bin size or loop count that cannot be read", () => {
        expect(() => unwrapMediaTimes(run, 0)).toThrow(/clipDurationS/);
        expect(() => trackTimeShare(run, { clipDurationS: NaN })).toThrow(/clipDurationS/);
        expect(() => trackTimeShare(run, { clipDurationS: D, binMs: 0 })).toThrow(/binMs/);
        expect(() => trackTimeShare(run, { clipDurationS: D, loopCount: 0 })).toThrow(/loopCount/);
        expect(() => countedLoopFrames(run, { clipDurationS: D, firstLoop: -1 })).toThrow(
            /firstLoop/,
        );
    });
});

describe("trackTimeShare on the tablet's committed exports", () => {
    // Round 2's tablet runs, 300 frames each, all on a moving clip. Their first frame is
    // mid-clip, so loop 0 is never a whole loop: loops 1 on are counted, up to the last
    // frame's loop, which closes the loop before it.
    const CLIP_DURATION_S = { "pinball-bench.mp4": 11.96, "pinball-bench-table.mp4": 8.9 };
    const dir = fileURLToPath(new URL("../../docs/benchmarks/", import.meta.url));
    const names = readdirSync(dir)
        .filter((n) => /^2026-09-29-tab9-tuning-r2-.+-(wall|table)[^/]*\.json$/.test(n))
        .sort();

    /** Every second frame whose state equals both its neighbours': removed frames are never adjacent. */
    const thinInsideRuns = (frames) => {
        let seen = 0;
        return frames.filter((f, i) => {
            const inside =
                i > 0 &&
                i + 1 < frames.length &&
                frames[i - 1].state === f.state &&
                frames[i + 1].state === f.state;
            return !(inside && seen++ % 2 === 1);
        });
    };

    it("is exactly unchanged when frames inside a run of equal states are removed", () => {
        expect(names.length, "the round 2 wall and table exports").toBeGreaterThanOrEqual(10);
        for (const name of names) {
            const e = JSON.parse(readFileSync(dir + name, "utf8"));
            const D = CLIP_DURATION_S[e.bundledClip];
            expect(D, `${name}: ${e.bundledClip} has no known duration`).toBeGreaterThan(0);
            // The last frame is in loop `wraps`, which closes loops 1 to wraps − 1.
            const loopCount = countLoopWraps(e.frames) - 1;
            expect(loopCount, `${name}: no whole loop after its first wrap`).toBeGreaterThanOrEqual(
                1,
            );
            const options = { clipDurationS: D, firstLoop: 1, loopCount };

            const full = trackTimeShare(e.frames, options);
            expect(full.complete, name).toBe(true);
            expect(full.share, name).toBeGreaterThan(0);
            expect(full.share, name).toBeLessThan(1);
            expect(full.perLoop, name).toHaveLength(loopCount);

            const thinned = thinInsideRuns(e.frames);
            expect(thinned.length, `${name}: nothing was removed`).toBeLessThan(e.frames.length);
            const result = trackTimeShare(thinned, options);
            expect(result.share, name).toBe(full.share);
            expect(result.perLoop, name).toEqual(full.perLoop);
        }
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
        for (const key of ["corners", "alignment", "detectionAccounting", "detectionPath"])
            expect(DEFINITIONS).toHaveProperty(key);
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
            targetFile: null,
            trackerOverrides: {},
            detection: "sync",
            loops: null,
            run: null,
            paramErrors: [],
        });
    });

    it("reads the detection path, the loops a run lasts and its place in the session", () => {
        expect(DETECTION_PATHS).toEqual(["sync", "worker"]);
        expect(Object.isFrozen(DETECTION_PATHS)).toBe(true);
        const p = parseRunParams("?mode=tracking&detection=worker&loops=4&run=3", {
            bundledClips: clips,
        });
        expect(p).toMatchObject({ detection: "worker", loops: 4, run: 3, paramErrors: [] });
        const sync = parseRunParams("?detection=sync", { bundledClips: clips });
        expect(sync).toMatchObject({ detection: "sync", paramErrors: [] });
    });

    it("refuses, rather than drops, a detection path or a loops or run it cannot read", () => {
        // The same reason as the tuning parameters: a run that fell back to sync
        // under a URL that asked for the worker would be exported as what it was not.
        const gpu = parseRunParams("?detection=gpu", { bundledClips: clips });
        expect(gpu.detection).toBe("sync");
        expect(gpu.paramErrors).toHaveLength(1);
        expect(gpu.paramErrors[0]).toMatch(/\?detection=gpu: expected sync or worker/);
        expect(parseRunParams("?detection=", { bundledClips: clips }).paramErrors).toHaveLength(1);

        for (const [query, key] of [
            ["?loops=0", "loops"],
            ["?loops=abc", "loops"],
            ["?loops=", "loops"],
            ["?run=-2", "run"],
            ["?run=x", "run"],
        ]) {
            const p = parseRunParams(query, { bundledClips: clips });
            expect(p[key], query).toBeNull();
            expect(p.paramErrors, query).toHaveLength(1);
            expect(p.paramErrors[0], query).toMatch(new RegExp(`\\?${key}=`));
            expect(p.paramErrors[0], query).not.toMatch(/\n/);
        }
    });

    it("reads a candidate target under targets/tuning/ and tracker overrides", () => {
        const p = parseRunParams(
            "?mode=tracking&targetFile=tuning/p32-s16.wnft&tracker=minTrackedPatches:6,alignEpsilon:0.03,photometric:false",
            { bundledClips: clips },
        );
        expect(p.targetFile).toBe("tuning/p32-s16.wnft");
        expect(p.trackerOverrides).toEqual({
            minTrackedPatches: 6,
            alignEpsilon: 0.03,
            photometric: false,
        });
        expect(p.paramErrors).toEqual([]);
    });

    it("refuses, rather than drops, a target file or an override it cannot use", () => {
        // Falling back to the defaults would export a run labelled with
        // parameters it did not run with: the one failure a tuning round
        // cannot afford, so these are errors the page shows, not nulls.
        for (const file of [
            "pinball.wnft",
            "tuning/../pinball.wnft",
            "tuning/.hidden.wnft",
            "tuning/a/b.wnft",
            "tuning/p32.json",
            "tuning/",
        ]) {
            const p = parseRunParams(`?targetFile=${encodeURIComponent(file)}`, {
                bundledClips: clips,
            });
            expect(p.targetFile, file).toBeNull();
            expect(p.paramErrors, file).toHaveLength(1);
            expect(p.paramErrors[0], file).toMatch(/targetFile/);
        }
        const bad = parseRunParams("?tracker=minPatchZnc:0.5", { bundledClips: clips });
        expect(bad.trackerOverrides).toEqual({});
        expect(bad.paramErrors).toHaveLength(1);
        expect(bad.paramErrors[0]).toMatch(/minPatchZnc/);
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

describe("parseTrackerOverrides", () => {
    it("reads nothing as no overrides", () => {
        for (const raw of [null, undefined, "", "  "]) {
            expect(parseTrackerOverrides(raw)).toEqual({ ok: true, options: {} });
        }
    });

    it("reads key:value pairs, numbers and the one boolean", () => {
        expect(parseTrackerOverrides(" maxFrameLevels:2 , maxFitRms:0.45,photometric:true")).toEqual(
            {
                ok: true,
                options: { maxFrameLevels: 2, maxFitRms: 0.45, photometric: true },
            },
        );
    });

    it("names every tracking-state option the tracker takes, and no detection option", () => {
        expect([...TUNABLE_TRACKER_OPTIONS].sort()).toEqual(
            [
                "maxFrameLevels",
                "alignMaxIterations",
                "alignEpsilon",
                "photometric",
                "tukeyC",
                "fitMaxIterations",
                "fitEpsilon",
                "minTrackedPatches",
                "maxOutlierShare",
                "maxFitRms",
                "minPatchZncc",
            ].sort(),
        );
    });

    it("refuses an unknown key, a repeated key, a malformed pair or a value of the wrong type", () => {
        for (const [raw, pattern] of [
            ["tukey:4", /unknown option "tukey"/],
            ["maxSceneKeypoints:300", /unknown option "maxSceneKeypoints"/],
            ["tukeyC:4,tukeyC:5", /"tukeyC" given twice/],
            ["tukeyC", /"tukeyC" is not key:value/],
            ["tukeyC:", /tukeyC.*not a finite number/],
            ["tukeyC:abc", /tukeyC.*not a finite number/],
            ["tukeyC:Infinity", /tukeyC.*not a finite number/],
            ["photometric:1", /photometric.*true or false/],
        ]) {
            const r = parseTrackerOverrides(raw);
            expect(r.ok, raw).toBe(false);
            expect(r.error, raw).toMatch(pattern);
        }
    });
});

describe("parseTrackerOverrides applies the tracker's domains", () => {
    // Found in review: a finite value out of its domain passed the URL check,
    // started the clip, and only then made the tracker throw — or, in
    // stateless mode, was silently ignored. The domains are NftTracker's own.
    it.each([
        ["maxFrameLevels:0", /maxFrameLevels.*integer in \[1, 256\]/],
        ["maxFrameLevels:257", /maxFrameLevels/],
        ["alignMaxIterations:0", /alignMaxIterations.*integer ≥ 1/],
        ["alignMaxIterations:2.5", /alignMaxIterations/],
        ["fitMaxIterations:0", /fitMaxIterations/],
        ["minTrackedPatches:3", /minTrackedPatches.*integer ≥ 4/],
        ["alignEpsilon:0", /alignEpsilon.*> 0/],
        ["fitEpsilon:-1", /fitEpsilon/],
        ["tukeyC:0", /tukeyC/],
        ["maxFitRms:0", /maxFitRms/],
        ["maxOutlierShare:1", /maxOutlierShare.*\[0, 1\)/],
        ["minPatchZncc:-0.1", /minPatchZncc/],
    ])("refuses %s", (raw, pattern) => {
        const r = parseTrackerOverrides(raw);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(pattern);
    });

    it("accepts each domain's edges", () => {
        expect(
            parseTrackerOverrides(
                "maxFrameLevels:256,alignMaxIterations:1,minTrackedPatches:4,maxOutlierShare:0,minPatchZncc:0",
            ).ok,
        ).toBe(true);
    });
});

describe("startRefusal names the target file it was given", () => {
    it("says which file did not load, pinball.wnft when none is named", () => {
        expect(
            startRefusal({
                mode: "tracking",
                target: null,
                minTrackedPatches: 8,
                file: "targets/tuning/p32.wnft",
            }),
        ).toMatch(/targets\/tuning\/p32\.wnft is not loaded/);
        expect(startRefusal({ mode: "tracking", target: null, minTrackedPatches: 8 })).toMatch(
            /targets\/pinball\.wnft is not loaded/,
        );
    });
});

describe("startRefusal and the detection worker", () => {
    const wnft = { db: { patches: { count: 64, patchSize: 16 } }, record: { source: "wnft" } };
    const image = { db: { patches: { count: 64, patchSize: 16 } }, record: { source: "image" } };
    const worker = { detection: "worker", source: "bundled", loops: 4 };

    it("starts the worker in tracking mode on the .wnft target and a bundled clip", () => {
        expect(startRefusal({ mode: "tracking", target: wnft, minTrackedPatches: 8, ...worker }))
            .toBeNull();
    });

    it.each([
        [
            "a mode other than tracking",
            { mode: "detection-only", target: wnft },
            /^\?detection=worker runs in tracking mode only\.$/,
        ],
        [
            "the stateless mode",
            { mode: "stateless", target: wnft },
            /^\?detection=worker runs in tracking mode only\.$/,
        ],
        [
            "a target that is not the .wnft",
            { mode: "tracking", target: image },
            /^\?detection=worker needs the \.wnft target: the worker decodes its bytes\.$/,
        ],
        [
            "loops on the webcam",
            { mode: "tracking", target: wnft, detection: "sync", source: "webcam", loops: 4 },
            /^\?loops= needs a looping clip, not the webcam\.$/,
        ],
    ])("refuses %s, in one line", (_, args, expected) => {
        const message = startRefusal({ minTrackedPatches: 8, ...worker, ...args });
        expect(message).toMatch(expected);
        expect(message).not.toMatch(/\n/);
    });

    it("leaves the other paths alone: no new argument, no new refusal", () => {
        expect(startRefusal({ mode: "tracking", target: wnft, minTrackedPatches: 8 })).toBeNull();
        expect(
            startRefusal({ mode: "detection-only", target: image, minTrackedPatches: 8 }),
        ).toBeNull();
        // The webcam is fine without loops.
        expect(
            startRefusal({ mode: "tracking", target: wnft, minTrackedPatches: 8, source: "webcam" }),
        ).toBeNull();
    });
});

describe("accountingError", () => {
    const balanced = {
        requests: 41,
        posted: 31,
        consumptions: 30,
        ignored: 0,
        dropped: 10,
        discardedAtStop: 1,
    };

    it("accepts a run whose every request ended in one consumption, a drop or Stop", () => {
        expect(accountingError(balanced)).toBeNull();
        expect(
            accountingError({
                requests: 0,
                posted: 0,
                consumptions: 0,
                ignored: 0,
                dropped: 0,
                discardedAtStop: 0,
            }),
        ).toBeNull();
    });

    it("names the counts of a run that does not balance", () => {
        for (const broken of [
            { ...balanced, requests: 42 },
            { ...balanced, consumptions: 29 },
            { ...balanced, dropped: 11 },
            { ...balanced, discardedAtStop: 0 },
        ]) {
            const message = accountingError(broken);
            expect(message).toMatch(/does not balance/);
            expect(message).toBe(
                `detection accounting does not balance: requests ${broken.requests} ≠ consumptions ${broken.consumptions} + dropped ${broken.dropped} + discardedAtStop ${broken.discardedAtStop}`,
            );
        }
    });

    it("refuses a detection handed in while a lock held, however the rest balances", () => {
        expect(accountingError({ ...balanced, ignored: 1 })).toMatch(/ignored/);
        expect(accountingError({ ...balanced, ignored: 2 })).toBe(
            "2 detections were handed in while a lock held (ignored), where the policy allows none",
        );
        expect(accountingError({ ...balanced, ignored: 1 })).toMatch(/^1 detection was handed in/);
    });

    it.each([
        ["a negative count", { ...balanced, dropped: -1 }],
        ["a fractional count", { ...balanced, consumptions: 1.5 }],
        ["an infinite count", { ...balanced, requests: Infinity }],
        ["a text count", { ...balanced, posted: "31" }],
        ["a missing count", { requests: 1 }],
        ["no accounting at all", undefined],
    ])("refuses %s as not a whole number", (_, acc) => {
        expect(accountingError(acc)).toMatch(/whole number/);
    });

    it("says it in one line, whatever is wrong", () => {
        for (const acc of [
            { ...balanced, requests: 42 },
            { ...balanced, ignored: 3 },
            { ...balanced, dropped: -1 },
            null,
        ])
            expect(accountingError(acc)).not.toMatch(/\n/);
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

describe("the review's fixes", () => {
    describe("DEFINITIONS.jitterPx", () => {
        it("says it pools every posed frame, and so where it can be read", () => {
            expect(DEFINITIONS.jitterPx).toMatch(/DETECT and TRACK alike/);
            expect(DEFINITIONS.jitterPx).toMatch(/spreadPx/);
        });
    });

    describe("startRefusal", () => {
        const trackable = { db: { patches: { count: 64, patchSize: 16 } } };
        const untrackable = { db: {} };

        it("starts a known mode on a target it can run", () => {
            for (const mode of MODES)
                expect(startRefusal({ mode, target: trackable, minTrackedPatches: 8 })).toBeNull();
            expect(
                startRefusal({ mode: "stateless", target: untrackable, minTrackedPatches: 8 }),
            ).toBeNull();
        });

        it.each([
            ["an empty mode", ""],
            ["the old 'tracker' value", "tracker"],
        ])("refuses %s, naming the modes", (_, mode) => {
            expect(startRefusal({ mode, target: trackable, minTrackedPatches: 8 })).toMatch(
                /stateless, detection-only, tracking/,
            );
        });

        it("refuses a target that did not load, and tracking one it cannot track", () => {
            expect(startRefusal({ mode: "stateless", target: null, minTrackedPatches: 8 })).toMatch(
                /not loaded/,
            );
            expect(
                startRefusal({ mode: "tracking", target: untrackable, minTrackedPatches: 8 }),
            ).toMatch(/targets\/pinball\.wnft/);
        });
    });

    describe("sequenceRefusal", () => {
        const expected = {
            metricsVersion: METRICS_VERSION,
            sha256: "ab",
            clips: ["pinball-static.mp4"],
        };
        const e = (o = {}) => ({
            metricsVersion: METRICS_VERSION,
            mode: "tracking",
            source: "bundled",
            bundledClip: "pinball-static.mp4",
            target: { sha256: "ab" },
            tracker: {
                detectionOnly: false,
                options: { detectionOnly: false, maxSceneKeypoints: 150 },
            },
            processingBox: { width: 360, height: 360 },
            processingResolution: { width: 203, height: 360 },
            frames: [],
            ...o,
        });

        it("accepts a tracking export of a bundled clip on the same target", () => {
            expect(sequenceRefusal(e(), expected)).toBeNull();
        });

        it("replays with the export's own processing box and tracker options, not the defaults", () => {
            const settings = sequenceSettings(e());
            expect(settings).toEqual({
                box: { width: 360, height: 360 },
                trackerOptions: { detectionOnly: false, maxSceneKeypoints: 150 },
            });
            expect(settings.trackerOptions).not.toBe(e().tracker.options);
        });

        it.each([
            ["a stateless run", { mode: "stateless" }, /tracking run/],
            ["a webcam run", { source: "webcam", bundledClip: null }, /bundled clip/],
            ["another clip", { bundledClip: "other.mp4" }, /bundled clip/],
            ["another metricsVersion", { metricsVersion: undefined }, /metricsVersion/],
            ["another target", { target: { sha256: "cd" } }, /target/],
            ["no processing size", { processingResolution: undefined }, /processingResolution/],
            ["no processing box", { processingBox: undefined }, /processingBox/],
            ["no recorded tracker options", { tracker: null }, /tracker options/],
        ])("refuses %s in one line", (_, o, why) => {
            const r = sequenceRefusal(e(o), expected);
            expect(r).toMatch(why);
            expect(r).not.toMatch(/\n/);
        });
    });

    describe("proxyRatio", () => {
        it("divides the device's p50 by the replay's", () => {
            expect(proxyRatio({ n: 200, p50: 14 }, { n: 200, p50: 4 })).toBe(3.5);
        });

        it.each([
            ["the device run had no TRACK frames", { n: 0, p50: null }, { n: 200, p50: 4 }],
            ["the replay had none", { n: 200, p50: 14 }, { n: 0, p50: null }],
            ["a p50 is 0", { n: 200, p50: 14 }, { n: 200, p50: 0 }],
        ])("is null, not 0 or Infinity, when %s", (_, device, here) => {
            expect(proxyRatio(device, here)).toBeNull();
        });
    });
});
