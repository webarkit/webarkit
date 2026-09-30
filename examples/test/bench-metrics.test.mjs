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
    detectionLocks,
    detectionOutcomes,
    detectionTime,
    exportDetectionPath,
    firstStepLatency,
    frameMs,
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
    trackFramesWithDetectionInFlight,
    trackTimeShare,
    transferPlan,
    TUNABLE_TRACKER_OPTIONS,
    unlockedResidualMs,
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

    // A duration shorter than the clip unwraps each loop onto the next: the run's time overlaps
    // itself, and a share read on it is not the lock's, yet it read `complete: true`.
    it("refuses a clip duration shorter than the clip, naming the frame, its media time and D", () => {
        const short = 0.8; // the run's clip is 1 s long: frame 2, at 0.9 s, is past 0.8 s
        const past = /^frame 2: media time 0\.9 s is past clipDurationS 0\.8 s/;
        for (const read of [
            () => unwrapMediaTimes(run, short),
            () => countedLoopFrames(run, { clipDurationS: short }),
            () => trackTimeShare(run, { clipDurationS: short }),
            () => summarizeRun(run, { clipDurationS: short, loops: { firstLoop: 1, loopCount: 4 } }),
        ]) {
            expect(read).toThrow(RangeError);
            expect(read).toThrow(past);
            let message = "";
            try {
                read();
            } catch (e) {
                message = e.message;
            }
            expect(message).not.toMatch(/\n/);
        }
        // The same run read with its own duration is complete, as before.
        expect(trackTimeShare(run, { clipDurationS: D }).complete).toBe(true);
    });

    it("allows a frame up to 1 ms past D, and refuses unwrapped time that goes back", () => {
        // A media time a fraction of a millisecond past the end is rounding, not a shorter clip.
        closeTo(unwrapMediaTimes([frame("LOST", 0.5), frame("LOST", 1.0005)], D), [0.5, 1.0005]);
        // 0.8 ms past D passes the first check, but the wrap after it lands the next frame
        // before it: loop 1's first frame, at 1.0, is earlier than loop 0's last, at 1.0008.
        const back = [frame("LOST", 0.2), frame("LOST", 1.0008), frame("LOST", 0)];
        expect(() => unwrapMediaTimes(back, D)).toThrow(RangeError);
        expect(() => unwrapMediaTimes(back, D)).toThrow(
            /^frame 2: media time 0 s unwraps to 1 s, before frame 1's 1\.0008 s \(clipDurationS 1 s\)/,
        );
        expect(() => trackTimeShare(back, { clipDurationS: D, loopCount: 1 })).toThrow(/^frame 2:/);
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

describe("detection locks, first steps and outcomes", () => {
    const dir = fileURLToPath(new URL("../../docs/benchmarks/", import.meta.url));
    const exportOf = (name) => JSON.parse(readFileSync(dir + name, "utf8"));
    const step = { observed: 30 };
    // A frame record with the fields these metrics read. Media time follows the timestamp.
    const frame = (state, timestampMs, o = {}) => ({
        state,
        ok: state !== "LOST",
        reason: null,
        timestampMs,
        mediaTimeSeconds: timestampMs / 1000,
        detectionUse: "none",
        detectionInFlight: false,
        detectedAt: null,
        tracking: null,
        trackLoss: null,
        ...o,
    });
    const own = (state, timestampMs, o = {}) =>
        frame(state, timestampMs, { detectionUse: "internal", ...o });
    const consumed = (state, timestampMs, detectedAt, o = {}) =>
        frame(state, timestampMs, { detectionUse: "consumed", tracking: step, detectedAt, ...o });
    const detectedAt = (timestampMs, framesAgo, mediaTimeSeconds = timestampMs / 1000) => ({
        timestampMs,
        mediaTimeSeconds,
        framesAgo,
    });
    const refusedTotal = (locks) => Object.values(locks.refused).reduce((a, b) => a + b, 0);

    it("reproduces M2's firstSteps and reacquisitions on the exports they were published from", () => {
        // 14 of 106 first steps and 104 re-acquisitions on the wall clip, 11 of 48 and 46 on the
        // table clip: docs/benchmarks/README.md, "What the synchronous mode spends on detection".
        const pinned = { wall: [106, 14, 104], table: [48, 11, 46] };
        for (const clip of ["wall", "table"]) {
            const e = exportOf(`2026-09-29-tab9-tuning-r2-p48-s16-${clip}.json`);
            const { firstSteps, reacquisitions: reacquired } = e.runSummary;
            expect([firstSteps.n, firstSteps.confirmed, reacquired], clip).toEqual(pinned[clip]);
            // These exports predate detectionUse: every DETECT frame is a lock the tracker set.
            expect(e.frames[0].detectionUse, clip).toBeUndefined();
            const locks = detectionLocks(e.frames);
            expect([locks.n, locks.confirmed, locks.reacquisitions], clip).toEqual(pinned[clip]);
            expect(locks.reacquisitionsAtLoopWrap, clip).toBe(
                e.runSummary.reacquisitionsAtLoopWrap,
            );
            // Every lock whose first step is in the window was confirmed or refused, per trackLoss.
            expect(locks.confirmed + refusedTotal(locks), clip).toBe(locks.n);
        }
    });

    it("counts a consumed detection's lock on its own frame, confirmed or refused per trackLoss", () => {
        const frames = [
            frame("LOST", 0, { reason: "no-detection" }), // asked for a detection
            consumed("TRACK", 100, detectedAt(0, 2)), // lock 1: its first step is this frame
            frame("TRACK", 200, { tracking: step }),
            frame("LOST", 300, { reason: "no-detection", tracking: step, trackLoss: "poor-fit" }),
            consumed("LOST", 400, detectedAt(300, 3), {
                reason: "unconfirmed",
                trackLoss: "too-few-patches", // lock 2, refused
            }),
            consumed("LOST", 500, detectedAt(400, 1), {
                reason: "too-few-matches", // the detection itself failed: no lock
                tracking: null,
            }),
            consumed("TRACK", 600, detectedAt(500, 1)), // lock 3
            frame("TRACK", 700, { detectionUse: "ignored", tracking: step }),
        ];
        expect(detectionLocks(frames)).toEqual({
            n: 3,
            confirmed: 2,
            refused: { "too-few-patches": 1 },
            reacquisitions: 2, // locks 2 and 3 followed an earlier pose; lock 1 is the first
            reacquisitionsAtLoopWrap: 0,
        });
        expect(detectionOutcomes(frames)).toEqual({
            used: 4,
            failed: { "too-few-matches": 1 },
            locked: 3,
            ignored: 1,
        });
        // Only the refused one:
        expect(detectionLocks(frames.slice(3, 5))).toMatchObject({
            n: 1,
            confirmed: 0,
            refused: { "too-few-patches": 1 },
            reacquisitions: 0, // no earlier frame in this slice had a pose
        });
    });

    it("counts a lock set on the first frame after a loop wrap apart, in both modes", () => {
        const wrap = [
            own("DETECT", 0, { mediaTimeSeconds: 11.9 }),
            frame("TRACK", 100, { mediaTimeSeconds: 11.95, tracking: step }),
            own("DETECT", 200, { mediaTimeSeconds: 0.05 }), // the clip jumped, not the tracker
            frame("TRACK", 300, { mediaTimeSeconds: 0.1, tracking: step }),
            frame("LOST", 400, { mediaTimeSeconds: 0.15, reason: "no-detection" }),
            consumed("TRACK", 500, detectedAt(400, 1, 0.15), { mediaTimeSeconds: 0.2 }),
        ];
        expect(detectionLocks(wrap)).toMatchObject({
            n: 3,
            confirmed: 3,
            reacquisitions: 1, // the consumed lock, after a pose
            reacquisitionsAtLoopWrap: 1, // the DETECT frame at media time 0.05
        });
        const worker = [
            frame("TRACK", 0, { mediaTimeSeconds: 11.9, tracking: step }),
            consumed("TRACK", 100, detectedAt(0, 1, 11.9), { mediaTimeSeconds: 0.05 }),
        ];
        expect(detectionLocks(worker)).toMatchObject({
            reacquisitions: 0,
            reacquisitionsAtLoopWrap: 1,
        });
    });

    it("counts a synchronous run's own detections by the same rule, and an older export's", () => {
        const sync = [
            own("DETECT", 0),
            frame("TRACK", 100, { tracking: step }),
            own("LOST", 200, { reason: "too-few-matches" }),
            own("LOST", 300, { reason: "no-consensus" }),
            own("DETECT", 400),
        ];
        expect(detectionOutcomes(sync)).toEqual({
            used: 4,
            failed: { "too-few-matches": 1, "no-consensus": 1 },
            locked: 2,
            ignored: 0,
        });
        expect(detectionLocks(sync)).toMatchObject({ n: 1, confirmed: 1, reacquisitions: 1 });
        // No detectionUse: the tracker of M2 detected on every frame that is not TRACK.
        const older = sync.map(({ detectionUse, ...rest }) => rest);
        expect(detectionOutcomes(older)).toEqual(detectionOutcomes(sync));
        expect(detectionLocks(older)).toEqual(detectionLocks(sync));
        // A frame with no detection at all: not a use.
        expect(detectionOutcomes([frame("TRACK", 0), frame("LOST", 1)])).toEqual({
            used: 0,
            failed: {},
            locked: 0,
            ignored: 0,
        });
    });

    it("gives a detection no first step where nothing tracks, as M2's firstSteps gives it none", () => {
        // A detection-only run: the DETECT frames set no lock a step could confirm.
        const detectionOnly = [own("DETECT", 0), own("DETECT", 100), own("LOST", 200)];
        expect(detectionLocks(detectionOnly)).toEqual({
            n: 0,
            confirmed: 0,
            refused: {},
            reacquisitions: 1,
            reacquisitionsAtLoopWrap: 0,
        });
        expect(firstStepLatency(detectionOnly).ms.n).toBe(0);
    });

    it("measures first-step latency by one rule in both modes", () => {
        // Synchronous: the tracker's own detection at t = 0, its first step on the next frame.
        const sync = firstStepLatency([own("DETECT", 0), frame("TRACK", 120, { tracking: step })]);
        expect(sync.ms).toMatchObject({ n: 1, p50: 120 });
        expect(sync.frames).toMatchObject({ n: 1, p50: 1 });
        expect(sync.videoMs.p50).toBeCloseTo(120, 9);
        // Worker: detected three processed frames back, consumed and stepped on this frame.
        const worker = firstStepLatency([consumed("TRACK", 120, detectedAt(0, 3))]);
        expect(worker.ms).toMatchObject({ n: 1, p50: 120 });
        expect(worker.frames).toMatchObject({ n: 1, p50: 3 });
        expect(worker.videoMs.p50).toBeCloseTo(120, 9);
        // A refused first step is measured all the same: it is a step.
        const refused = firstStepLatency([
            consumed("LOST", 200, detectedAt(50, 2), { reason: "unconfirmed", trackLoss: "poor-fit" }),
        ]);
        expect(refused.ms).toMatchObject({ n: 1, p50: 150 });
        // An export older than detectionUse and detectedAt: the DETECT frame is the detected one.
        const older = firstStepLatency([
            frame("DETECT", 0, { detectionUse: undefined }),
            frame("TRACK", 133, { detectionUse: undefined, tracking: step }),
        ]);
        expect(older.ms).toMatchObject({ n: 1, p50: 133 });
        expect(older.frames.p50).toBe(1);
    });

    it("measures first-step latency across a loop wrap on the unwrapped time, not a negative one", () => {
        const D = 12;
        const wrapped = [
            own("DETECT", 0, { mediaTimeSeconds: 11.9 }),
            frame("TRACK", 120, { mediaTimeSeconds: 0.1, tracking: step }), // 0.2 s of video later
        ];
        const worker = [consumed("TRACK", 120, detectedAt(0, 2, 11.9), { mediaTimeSeconds: 0.1 })];
        for (const frames of [wrapped, worker]) {
            const r = firstStepLatency(frames, { clipDurationS: D });
            expect(r.ms.p50).toBe(120);
            expect(r.videoMs.n).toBe(1);
            expect(r.videoMs.p50).toBeCloseTo(200, 9);
            // Without the clip's duration the wrap cannot be unwrapped: that lock has no video
            // ms, and only that statistic loses it. Nothing throws.
            const bare = firstStepLatency(frames);
            expect(bare.videoMs.n).toBe(0);
            expect(bare.ms).toEqual(r.ms);
            expect(bare.frames).toEqual(r.frames);
        }
        expect(() => firstStepLatency(wrapped, { clipDurationS: 0 })).toThrow(/clipDurationS/);
    });

    it("leaves a consumed lock without a recorded detected frame out of the latency statistics", () => {
        const r = firstStepLatency([consumed("TRACK", 120, null)]);
        expect(r.ms.n).toBe(0);
        expect(r.videoMs.n).toBe(0);
        expect(r.frames.n).toBe(0);
        // It is still a lock.
        expect(detectionLocks([consumed("TRACK", 120, null)]).n).toBe(1);
    });

    it("counts the TRACK frames whose process ran with a detection in flight", () => {
        expect(
            trackFramesWithDetectionInFlight([
                frame("TRACK", 0, { detectionInFlight: true }),
                frame("LOST", 1, { detectionInFlight: true }), // waiting: not a TRACK frame
                frame("TRACK", 2),
                frame("TRACK", 3, { detectionInFlight: true }),
            ]),
        ).toBe(2);
        // An export older than the field, and no frames.
        expect(trackFramesWithDetectionInFlight([{ state: "TRACK" }])).toBe(0);
        expect(trackFramesWithDetectionInFlight([])).toBe(0);
    });
});

describe("frame time and where detection's time goes", () => {
    const rec = (state, timings, o = {}) => ({
        state,
        ok: state !== "LOST",
        detectionUse: state === "TRACK" ? "none" : "internal",
        timings,
        ...o,
    });

    it("reads the frame's time over all frames, TRACK frames and unlocked frames", () => {
        const frames = [
            rec("TRACK", { total: 40 }),
            rec("LOST", { total: 100 }),
            rec("DETECT", { total: 120 }),
            rec("TRACK", { total: 60 }),
            rec("LOST", { total: 140 }),
        ];
        expect(frameMs(frames)).toEqual({
            all: stats([40, 100, 120, 60, 140]),
            track: stats([40, 60]),
            unlocked: stats([100, 120, 140]),
        });
        expect(frameMs(frames).unlocked.p50).toBe(120);
        expect(frameMs([]).all).toEqual(stats([]));
        // Records without timings are not frames of any time.
        expect(frameMs([{ state: "TRACK" }]).all.n).toBe(0);
    });

    it("attributes detection's time on the loop to its parts", () => {
        // A synchronous record: detection's stages on the frame that ran them.
        const sync = [
            rec("DETECT", { detect: 7, describe: 10, match: 50, estimateHomography: 2, total: 100 }),
        ];
        const s = detectionTime(sync);
        expect(s.onLoop.share).toBe(0.69);
        expect(s.onLoop.postMs.n).toBe(0);
        expect(s.onLoop.handlerMs.n).toBe(0);
        expect(s.offLoop.workerMs.n).toBe(0);
        expect(s.postToArrivalMs.n).toBe(0);

        // A worker run: the post on the frame that made it, the handler between frames.
        const worker = [
            rec("LOST", { acquire: 30, gray: 2, detectionPost: 0.4, total: 32.5 }, { detectionUse: "none" }),
            rec("LOST", { acquire: 30, gray: 2, total: 32 }, { detectionUse: "none" }),
        ];
        const job = {
            jobId: 1,
            postedAtMs: 10,
            arrivedAtMs: 85,
            handlerMs: 0.2,
            workerMs: { total: 70 },
        };
        const w = detectionTime(worker, [job]);
        expect(w.onLoop.postMs).toEqual(stats([0.4]));
        expect(w.onLoop.postMs.p50).toBe(0.4);
        expect(w.onLoop.handlerMs.p50).toBe(0.2);
        // (0.4 + 0.2) ÷ (32.5 + 32 + 0.2): the handler runs between frames, outside their totals.
        expect(w.onLoop.share).toBeCloseTo(0.6 / 64.7, 12);
        expect(w.offLoop.workerMs).toEqual(stats([70]));
        expect(w.postToArrivalMs).toEqual(stats([75]));
    });

    it("leaves a job that never came back out of the latency, handler and worker statistics", () => {
        const jobs = [
            { postedAtMs: 10, arrivedAtMs: 85, handlerMs: 0.2, workerMs: { total: 70 } },
            // Posted, and in flight or held at Stop: no arrival, no handler, no worker time.
            { postedAtMs: 100, arrivedAtMs: null, handlerMs: null, workerMs: null },
        ];
        const t = detectionTime([], jobs);
        expect(t.postToArrivalMs).toEqual(stats([75]));
        expect(t.onLoop.handlerMs).toEqual(stats([0.2]));
        expect(t.offLoop.workerMs).toEqual(stats([70]));
    });

    it("takes the detection stages over the frames that ran the tracker's own detection only", () => {
        const stages = { detect: 5, describe: 5, match: 5, filterMatches: 5, estimateHomography: 5 };
        const frames = [
            rec("DETECT", { ...stages, total: 100 }), // internal
            rec("TRACK", { detect: 50, total: 100 }), // no detection ran here: not read
            rec("LOST", { ...stages, total: 100 }, { detectionUse: "consumed" }), // not the tracker's own
            rec("LOST", { ...stages, pose: 9, total: 100 }, { detectionUse: "internal" }),
        ];
        // Two frames' five stages of 5 ms, and not the pose, which is not detection's: 50 ÷ 400.
        expect(detectionTime(frames).onLoop.share).toBe(0.125);
        // An older export has no detectionUse: it detected on every frame that is not TRACK.
        const older = frames.slice(0, 2).map(({ detectionUse, ...rest }) => rest);
        expect(detectionTime(older).onLoop.share).toBe(25 / 200);
    });

    it("gives detection's time per second of video, over the video the frames cover", () => {
        const at = (mediaTimeSeconds) =>
            rec("DETECT", { detect: 30, total: 100 }, { mediaTimeSeconds });
        // 0.5 s, 0.5 s, a wrap that counts for nothing, 0.5 s: 1.5 s of video, 150 ms of detect.
        const frames = [at(0), at(0.5), at(1), at(0.25), at(0.75)];
        const job = { postedAtMs: 0, arrivedAtMs: 60, handlerMs: 0, workerMs: { total: 30 } };
        const bare = detectionTime(frames, [job]);
        expect(bare.onLoop.msPerVideoSecond).toBe(150 / 1.5);
        expect(bare.offLoop.msPerVideoSecond).toBe(30 / 1.5);
        // The counted loops' whole duration, when they are given: 4 loops of 2 s.
        const loops = { firstLoop: 1, loopCount: 4 };
        const counted = detectionTime(frames, [job], { clipDurationS: 2, loops });
        expect(counted.onLoop.msPerVideoSecond).toBe(150 / 8);
        expect(counted.offLoop.msPerVideoSecond).toBe(30 / 8);
        // No frames, no video, no rate.
        expect(detectionTime([]).onLoop.msPerVideoSecond).toBeNull();
        expect(detectionTime([]).onLoop.share).toBeNull();
        expect(() => detectionTime(frames, [], { loops })).toThrow(/clipDurationS/);
    });

    it("reproduces the synchronous baseline the plan quotes, from the exports it was read from", () => {
        // docs/benchmarks/README.md, "What the synchronous mode spends on detection": detection's
        // share of the loop, and `total` p50 / p95 over all frames, TRACK frames and unlocked
        // frames, from round 2's runs of the adopted target.
        const dir = fileURLToPath(new URL("../../docs/benchmarks/", import.meta.url));
        const tenth = (x) => Math.round(x * 10) / 10;
        const published = {
            wall: { share: 40.5, all: [48.2, 136.7], track: [42.1, 51.3], unlocked: [107.4, 150.5] },
            table: { share: 22.1, all: [63.1, 149.4], track: [61.5, 71.1], unlocked: [140.4, 157.8] },
        };
        for (const [clip, expected] of Object.entries(published)) {
            const e = JSON.parse(
                readFileSync(`${dir}2026-09-29-tab9-tuning-r2-p48-s16-${clip}.json`, "utf8"),
            );
            expect(tenth(100 * detectionTime(e.frames).onLoop.share), clip).toBe(expected.share);
            const f = frameMs(e.frames);
            for (const which of ["all", "track", "unlocked"]) {
                expect([tenth(f[which].p50), tenth(f[which].p95)], `${clip} ${which}`).toEqual(
                    expected[which],
                );
            }
        }
    });

    it("bounds the unlocked frames' residual frame by frame, a frame that did not post subtracting no post", () => {
        const frames = [
            // Posted: 30.75 − 28 − 1.5 − 0.25 = 1.
            rec("LOST", { total: 30.75, acquire: 28, gray: 1.5, detectionPost: 0.25 }),
            // Did not post: 30 − 28 − 1.5 = 0.5, and not 0.25 as a run-wide post would leave.
            rec("LOST", { total: 30, acquire: 28, gray: 1.5 }),
            // A TRACK frame is not an unlocked one.
            rec("TRACK", { total: 60, acquire: 28, gray: 1.5 }),
        ];
        expect(unlockedResidualMs(frames)).toEqual({ n: 2, min: 0.5, p50: 1, p95: 1, max: 1 });
        expect(unlockedResidualMs([rec("TRACK", { total: 60, acquire: 1, gray: 1 })])).toEqual(
            stats([]),
        );
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

    // The keys the detection-locks work added; everything else is the M2 summary.
    const NEW_KEYS = [
        "trackTimeShare",
        "detectionLocks",
        "firstStepLatency",
        "detectionOutcomes",
        "trackFramesWithDetectionInFlight",
        "frameMs",
        "unlockedResidualMs",
        "detectionTime",
        "detectionAccounting",
    ];
    const withoutNew = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !NEW_KEYS.includes(k)));

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
        for (const key of ["corners", "alignment", "detectionPath", "detectionUse"])
            expect(DEFINITIONS).toHaveProperty(key);
        // The same keys whatever the options, and each new one is defined.
        const full = summarizeRun(window, {
            clipDurationS: 1,
            loops: { firstLoop: 0, loopCount: 1 },
            accounting: { requests: 0, posted: 0, consumptions: 0, ignored: 0, dropped: 0, discardedAtStop: 0 },
        });
        expect(Object.keys(full)).toEqual(Object.keys(summarizeRun(window)));
        for (const key of NEW_KEYS) expect(DEFINITIONS, key).toHaveProperty(key);
        expect(Object.isFrozen(DEFINITIONS)).toBe(true);
        expect(METRICS_VERSION).toBe(1);
    });

    it("leaves every existing summary key unchanged when no options are given", () => {
        expect(withoutNew(summarizeRun(window))).toEqual({
            frames: 5,
            states: { LOST: 0, DETECT: 2, TRACK: 3 },
            trackShare: 0.6,
            reacquisitions: 1,
            reacquisitionsAtLoopWrap: 0,
            loopWraps: 0,
            lockLosses: { "too-few-patches": 1 },
            firstSteps: { n: 2, confirmed: 2 },
            heldLockSteps: { n: 2, lost: 1, lostAtLoopWrap: 0 },
            trackStepMs: { n: 3, min: 10, p50: 12, p95: 14, max: 14 },
            pyramidMs: { n: 3, min: 0, p50: 0, p95: 0, max: 0 },
            alignMs: { n: 3, min: 9.7, p50: 11.7, p95: 13.7, max: 13.7 },
            fitMs: { n: 3, min: 0.1, p50: 0.1, p95: 0.1, max: 0.1 },
            frameLevels: { 1: 2, 2: 1 },
            fits: {
                n: 3,
                capped: 1,
                iterations: { n: 3, min: 3, p50: 3, p95: 20, max: 20 },
            },
            quality: { n: 3, min: 0.15, p50: 0.88, p95: 0.88, max: 0.88 },
            trackedPatches: { n: 3, min: 57, p50: 57, p95: 57, max: 57 },
            lowQualityTrackFrames: 1,
            posedFrames: 5,
            jitterWindows: 1,
            jitterPx: 0,
            spreadPx: 0,
        });
        // What the new keys are with nothing to read them from: absent, or empty.
        const s = summarizeRun(window);
        expect(s.trackTimeShare).toBeNull();
        expect(s.detectionAccounting).toBeNull();
        expect(s.detectionTime.offLoop.workerMs).toEqual(stats([]));
        expect(s.detectionTime.postToArrivalMs).toEqual(stats([]));
    });

    it("leaves every existing summary key as the committed exports recorded it, when no options are given", () => {
        const dir = fileURLToPath(new URL("../../docs/benchmarks/", import.meta.url));
        for (const clip of ["wall", "table"]) {
            const e = JSON.parse(
                readFileSync(`${dir}2026-09-29-tab9-tuning-r2-p48-s16-${clip}.json`, "utf8"),
            );
            const summary = JSON.parse(JSON.stringify(summarizeRun(e.frames)));
            expect(withoutNew(summary), clip).toEqual(e.runSummary);
        }
    });

    it("reads every summary metric over the counted loops, and the lock over whole loops, when loops are given", () => {
        const D = 1;
        const loops = { firstLoop: 1, loopCount: 4 };
        const stepped = { frameLevels: 1, inliers: 20, fitIterations: 3, fitConverged: true };
        const rec = (state, mediaTimeSeconds, timestampMs, o = {}) => ({
            state,
            ok: state !== "LOST",
            reason: null,
            mediaTimeSeconds,
            timestampMs,
            timings: { total: state === "TRACK" ? 50 : 100, detect: state === "TRACK" ? 0 : 30 },
            quality: state === "TRACK" ? 0.5 : null,
            trackLoss: null,
            tracking: state === "TRACK" ? stepped : null,
            trackerTimings: null,
            corners: null,
            detectionUse: state === "TRACK" ? "none" : "internal",
            detectionInFlight: false,
            ...o,
        });
        // A 1 s clip: the run's unwrapped time is `loop + media time`. Loop 0 is the warm-up,
        // loops 1 to 4 are counted, and the last frame, in loop 5, closes loop 4.
        const run = [
            rec("DETECT", 0.25, 0), //                    0: warm-up, a lock nobody counts
            rec("TRACK", 0.5, 100), //                    1
            rec("TRACK", 0.75, 200), //                   2
            rec("TRACK", 0.25, 300), //                   3: loop 1
            rec("TRACK", 0.5, 400), //                    4
            rec("DETECT", 0.75, 500, { tracking: stepped, trackLoss: "too-few-patches" }), // 5: lock A
            rec("TRACK", 0.25, 600), //                   6: loop 2, A's first step
            rec("TRACK", 0.5, 700), //                    7
            rec("TRACK", 0.75, 800), //                   8
            rec("LOST", 0.25, 900, {
                reason: "too-few-matches", //             9: loop 3
                tracking: stepped,
                trackLoss: "poor-fit",
            }),
            rec("DETECT", 0.5, 1000), //                  10: lock B
            rec("TRACK", 0.75, 1100), //                  11: B's first step
            rec("TRACK", 0.25, 1200), //                  12: loop 4
            rec("TRACK", 0.375, 1250), //                 13: a frame inside a stretch of TRACK
            rec("TRACK", 0.5, 1300), //                   14
            rec("TRACK", 0.75, 1400), //                  15
            rec("TRACK", 0.25, 1500), //                  16: loop 5
        ];
        const job = (frameTimestampMs, workerTotal, handlerMs) => ({
            frameTimestampMs,
            postedAtMs: frameTimestampMs + 5,
            arrivedAtMs: frameTimestampMs + 5 + workerTotal + 10, // 10 ms of transfer on top
            handlerMs,
            workerMs: { total: workerTotal },
        });
        // One posted in the warm-up, two in the counted loops.
        const jobs = [job(0, 70, 0.5), job(500, 60, 0.25), job(1000, 80, 0.25)];
        const accounting = { requests: 5, posted: 3, consumptions: 3, ignored: 0, dropped: 2, discardedAtStop: 0 };
        const s = summarizeRun(run, { clipDurationS: D, loops, jobs, accounting });

        // Frames 3 to 15: the counted loops' 13, not the run's 17.
        expect(s.frames).toBe(13);
        expect(s.states).toEqual({ LOST: 1, DETECT: 2, TRACK: 10 });
        expect(s.trackShare).toBe(10 / 13);
        expect(s.loopWraps).toBe(3);
        expect(s.lockLosses).toEqual({ "too-few-patches": 1, "poor-fit": 1 });
        expect(s.detectionLocks).toEqual({
            n: 2,
            confirmed: 2,
            refused: {},
            reacquisitions: 2,
            reacquisitionsAtLoopWrap: 0,
        });
        expect(s.detectionOutcomes).toEqual({
            used: 3,
            failed: { "too-few-matches": 1 },
            locked: 2,
            ignored: 0,
        });
        expect(s.trackFramesWithDetectionInFlight).toBe(0);
        // Lock A: 100 ms on the clock, over a wrap of the clip (0.75 to 0.25): 500 ms of video;
        // lock B: 100 ms, 250 ms of video.
        expect(s.firstStepLatency.ms).toMatchObject({ n: 2, min: 100, max: 100 });
        expect(s.firstStepLatency.videoMs).toMatchObject({ n: 2, min: 250, max: 500 });
        expect(s.firstStepLatency.frames).toMatchObject({ n: 2, min: 1, max: 1 });
        expect(s.frameMs.all.n).toBe(13);
        expect(s.frameMs.track).toMatchObject({ n: 10, p50: 50 });
        expect(s.frameMs.unlocked).toMatchObject({ n: 3, p50: 100 });
        // The jobs posted from the counted frames, per video second of the four loops.
        expect(s.detectionTime.offLoop.workerMs).toMatchObject({ n: 2, min: 60, max: 80 });
        expect(s.detectionTime.offLoop.msPerVideoSecond).toBe(140 / 4);
        expect(s.detectionTime.postToArrivalMs).toMatchObject({ n: 2, min: 70, max: 90 });
        expect(s.detectionTime.onLoop.handlerMs).toMatchObject({ n: 2, min: 0.25, max: 0.25 });
        // The stages of the three frames that ran the tracker's own detection, and the two handlers.
        expect(s.detectionTime.onLoop.msPerVideoSecond).toBe(90.5 / 4);
        expect(s.detectionTime.onLoop.share).toBeCloseTo(90.5 / 800.5, 12);
        // The accounting covers the whole run, not the window.
        expect(s.detectionAccounting).toEqual({ ...accounting, error: null });

        // The lock is read from every frame, over loops 1 to 4 whole: TRACK for three quarters
        // of loop 1, three quarters of loop 2, half of loop 3 and all of loop 4. The frame the
        // lock's warm-up ends on and the frame in loop 5 are read, so the window is complete;
        // the frame added inside loop 4's TRACK stretch moves per-frame trackShare, not this.
        expect(s.trackTimeShare).toEqual({
            share: 0.75,
            perLoop: [0.75, 0.75, 0.5, 1],
            binMs: 10,
            loops: [1, 4],
            complete: true,
        });
        expect(s.trackTimeShare).toEqual(trackTimeShare(run, { clipDurationS: D, ...loops }));

        // Without the loops: every frame and every job, and no lock over whole loops.
        const all = summarizeRun(run, { clipDurationS: D, jobs });
        expect(all.frames).toBe(17);
        expect(all.loopWraps).toBe(5);
        expect(all.detectionLocks.n).toBe(3);
        expect(all.detectionTime.offLoop.workerMs.n).toBe(3);
        expect(all.trackTimeShare).toBeNull();

        // The counted loops need the clip's duration.
        expect(() => summarizeRun(run, { loops })).toThrow(/clipDurationS/);
    });

    it("carries the accounting and its error in the summary", () => {
        const balanced = {
            requests: 5,
            posted: 4,
            consumptions: 3,
            ignored: 0,
            dropped: 1,
            discardedAtStop: 1,
        };
        expect(summarizeRun(window, { accounting: balanced }).detectionAccounting).toEqual({
            ...balanced,
            error: null,
        });
        const unbalanced = { ...balanced, dropped: 0 };
        const reported = summarizeRun(window, { accounting: unbalanced }).detectionAccounting;
        expect(reported).toMatchObject(unbalanced);
        expect(reported.error).toBe(accountingError(unbalanced));
        expect(reported.error).toMatch(/does not balance/);
        // A run that gave none has none.
        expect(summarizeRun(window).detectionAccounting).toBeNull();
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

        // A worker run's frames wait for detections the sequence replay never
        // hands in: it would answer them `no-detection`, on a lock the device
        // took.
        it("refuses to replay a worker run's frames as a sequence", () => {
            const r = sequenceRefusal(e({ detection: { path: "worker" } }), expected);
            expect(r).toMatch(/worker/);
            expect(r).not.toMatch(/\n/);
            expect(sequenceRefusal(e({ detection: { path: "sync" } }), expected)).toBeNull();
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

describe("transferPlan: what --transfer reads from a session's page exports", () => {
    const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
    const SHA = "ab";
    const frame = (state, timings, o = {}) => ({ state, ok: state !== "LOST", timings, ...o });
    const pageExport = (path, frames, o = {}) => ({
        mode: "tracking",
        source: "bundled",
        bundledClip: "pinball-bench.mp4",
        target: { sha256: SHA },
        ...(path === null ? {} : { detection: { path, jobs: [] } }),
        frames,
        ...o,
    });
    const track = (trackMs) =>
        frame("TRACK", { acquire: 18, gray: 2 }, { detectionUse: "none", trackerTimings: { trackMs } });

    // Two detections on the frame loop, 69 and 80 ms of pipeline; two unlocked frames, 22 and 26
    // ms of acquisition; two steps, 5 and 7 ms.
    const syncFrames = () => [
        frame(
            "DETECT",
            { acquire: 20, gray: 2, detect: 7, describe: 10, match: 50, estimateHomography: 2, pose: 9 },
            { detectionUse: "internal" },
        ),
        track(5),
        frame(
            "LOST",
            { acquire: 24, gray: 2, detect: 6, describe: 10, match: 60, filterMatches: 1, estimateHomography: 3 },
            { detectionUse: "internal" },
        ),
        track(7),
        // No tracker timings: not a sample of the step.
        frame("TRACK", { acquire: 18, gray: 2 }, { detectionUse: "none" }),
    ];

    // A worker run's accounting that balances: 4 requests = 2 consumed + 1 dropped + 1 discarded.
    const BALANCED = Object.freeze({
        requests: 4,
        posted: 3,
        consumptions: 2,
        ignored: 0,
        dropped: 1,
        discardedAtStop: 1,
    });

    // Two jobs that came back, 75 and 110 ms after their posts, and one that never did; two
    // unlocked frames, one of which consumed a detection, 32 and 36 ms of acquisition; three steps.
    const workerExport = (o = {}) =>
        pageExport(
            "worker",
            [
                frame("LOST", { acquire: 30, gray: 2 }, { detectionUse: "none" }),
                frame("LOST", { acquire: 34, gray: 2 }, { detectionUse: "consumed" }),
                track(4),
                track(6),
                track(8),
            ],
            {
                detection: {
                    path: "worker",
                    jobs: [
                        { postedAtMs: 100, arrivedAtMs: 175 },
                        { postedAtMs: 500, arrivedAtMs: null },
                        { postedAtMs: 900, arrivedAtMs: 1010 },
                    ],
                    accounting: { ...BALANCED },
                },
                ...o,
            },
        );
    // The fixture's worker export with its detection record's `accounting` replaced.
    const withAccounting = (accounting) =>
        workerExport({ detection: { ...workerExport().detection, accounting } });

    const plan = (exports, sha256 = SHA) =>
        transferPlan(
            exports.map((e, i) => ({ name: `export-${i}.json`, e })),
            { clips: CLIPS, sha256 },
        );

    it("reads each mode's latency samples, acquisition and step from its exports", () => {
        const p = plan([workerExport(), pageExport("sync", syncFrames())]);
        expect(p.refusal).toBeNull();
        expect(p.skipped).toEqual([]);
        expect(p.clips.map((c) => c.clip)).toEqual(["pinball-bench.mp4"]);
        const { sync, worker } = p.clips[0];

        // The worker's: arrival minus post, over the jobs that came back.
        expect(worker.latencyMs).toEqual([75, 110]);
        expect(worker.latency).toEqual(stats([75, 110]));
        // The synchronous mode's: the stages' sum on the frames that ran the tracker's own
        // detection, filterMatches when there is one, and not the pose.
        expect(sync.latencyMs).toEqual([69, 80]);
        // acquire + gray on the unlocked frames, a frame that consumed a detection among them.
        expect(worker.acquireMs).toBe(36);
        expect(sync.acquireMs).toBe(26);
        // trackerTimings.trackMs on the TRACK frames that have it, p50 as trackStepMs is.
        expect(worker.stepMs).toBe(6);
        expect(sync.stepMs).toBe(7);
        expect(worker.path).toBe("worker");
        expect(sync.path).toBe("sync");
    });

    it("pools a mode's exports of a clip, and names the files it read", () => {
        const second = pageExport("sync", [
            frame(
                "DETECT",
                { acquire: 40, gray: 2, detect: 8, describe: 11, match: 70, estimateHomography: 1 },
                { detectionUse: "internal" },
            ),
            track(9),
        ]);
        const p = plan([workerExport(), pageExport("sync", syncFrames()), second]);
        const sync = p.clips[0].sync;
        expect(sync.latencyMs).toEqual([69, 80, 90]);
        expect(sync.acquireMs).toBe(26); // 22, 26, 42
        expect(sync.stepMs).toBe(7); // 5, 7, 9
        expect(sync.files).toEqual(["export-1.json", "export-2.json"]);
        expect(p.clips[0].worker.files).toEqual(["export-0.json"]);
    });

    it("reads an export with no detection record as a synchronous run's, on M2's rule", () => {
        // Older than the worker path: no `detection`, and no `detectionUse` on its frames, so it
        // detected on every frame that is not TRACK.
        const older = pageExport(
            null,
            syncFrames().map(({ detectionUse, ...rest }) => rest),
        );
        expect(exportDetectionPath(older)).toBe("sync");
        expect(exportDetectionPath(workerExport())).toBe("worker");
        const p = plan([workerExport(), older]);
        expect(p.refusal).toBeNull();
        expect(p.clips[0].sync.latencyMs).toEqual([69, 80]);
    });

    it("groups by clip, and leaves out a clip with no exports", () => {
        const table = (path, frames, o = {}) =>
            pageExport(path, frames, { bundledClip: "pinball-bench-table.mp4", ...o });
        const p = plan([
            table("sync", syncFrames()),
            workerExport(),
            table("worker", workerExport().frames, { detection: workerExport().detection }),
            pageExport("sync", syncFrames()),
        ]);
        expect(p.refusal).toBeNull();
        // In the order of the clips given, not of the files.
        expect(p.clips.map((c) => c.clip)).toEqual(["pinball-bench.mp4", "pinball-bench-table.mp4"]);
    });

    it.each([
        ["a stateless run", { mode: "stateless" }, /stateless run, not a tracking run/],
        ["a detection-only run", { mode: "detection-only" }, /detection-only run/],
        ["a webcam run", { source: "webcam", bundledClip: null }, /bundled clip/],
        ["another clip", { bundledClip: "other.mp4" }, /bundled clip/],
        ["a replay's export", { kind: "replay" }, /replay's export/],
        ["an export with no frames", { frames: undefined }, /not a page export/],
        ["an unknown detection path", { detection: { path: "gpu" } }, /neither sync nor worker/],
    ])("skips %s, saying why, and reads no more from it", (_, o, why) => {
        const p = plan([
            workerExport(),
            pageExport("sync", syncFrames()),
            pageExport("sync", syncFrames(), o),
        ]);
        expect(p.refusal).toBeNull();
        expect(p.skipped).toHaveLength(1);
        expect(p.skipped[0].name).toBe("export-2.json");
        expect(p.skipped[0].why).toMatch(why);
        expect(p.skipped[0].why).not.toMatch(/\n/);
        // Nothing of it in the profile: the two sync exports' worth is one export's.
        expect(p.clips[0].sync.files).toEqual(["export-1.json"]);
    });

    it("skips a worker export it reads nothing from, whatever its accounting", () => {
        // The skip rules come first: an export nothing is read from is not checked, so a replay's
        // or a stateless run's is still a note, not a refusal.
        const p = plan([
            workerExport(),
            pageExport("sync", syncFrames()),
            { ...withAccounting(null), bundledClip: "other.mp4" },
            { ...withAccounting({ ...BALANCED, requests: 5 }), mode: "stateless" },
            { ...withAccounting(undefined), kind: "replay" },
        ]);
        expect(p.refusal).toBeNull();
        expect(p.skipped.map((s) => s.name)).toEqual([
            "export-2.json",
            "export-3.json",
            "export-4.json",
        ]);
    });

    it("accepts a sync export with no accounting, an older one with no detection record too", () => {
        // Only a worker run keeps an accounting: the page exports `accounting: null` for a
        // synchronous one.
        const sync = pageExport("sync", syncFrames());
        sync.detection.accounting = null;
        const older = pageExport(
            null,
            syncFrames().map(({ detectionUse, ...rest }) => rest),
        );
        const p = plan([workerExport(), sync, pageExport("sync", syncFrames()), older]);
        expect(p.refusal).toBeNull();
        expect(p.clips[0].sync.files).toEqual([
            "export-1.json",
            "export-2.json",
            "export-3.json",
        ]);
    });

    describe("refuses, in one line, and names what it found", () => {
        const refusal = (exports, sha256) => {
            const r = plan(exports, sha256).refusal;
            expect(r).not.toBeNull();
            expect(r).not.toMatch(/\n/);
            return r;
        };

        it("refuses a clip with exports of one path only", () => {
            const r = refusal([pageExport("sync", syncFrames()), pageExport("sync", syncFrames())]);
            expect(r).toMatch(/no worker and sync exports/);
            expect(r).toMatch(/pinball-bench\.mp4/);
            expect(r).toMatch(/worker 0, sync 2/);
            expect(refusal([workerExport()])).toMatch(/worker 1, sync 0/);
        });

        it("refuses a directory with no export of any clip, though it read files", () => {
            expect(refusal([])).toMatch(/no worker and sync exports/);
            expect(refusal([pageExport("sync", [], { mode: "stateless" })])).toMatch(
                /no worker and sync exports/,
            );
        });

        it("refuses a clip whose export names another target, by file and by sha256", () => {
            const r = refusal([
                workerExport(),
                pageExport("sync", syncFrames(), { target: { sha256: "cd" } }),
            ]);
            expect(r).toMatch(/pinball-bench\.mp4/);
            expect(r).toMatch(/export-1\.json/);
            expect(r).toMatch(/sha256 cd/);
            expect(r).toMatch(/not ab/);
            // An older export records no target at all.
            expect(
                refusal([workerExport(), pageExport("sync", syncFrames(), { target: undefined })]),
            ).toMatch(/sha256 \(none\)/);
        });

        it("reads a clip's paths before its targets", () => {
            // Both faults: the missing path is the one named.
            const r = refusal([pageExport("sync", syncFrames(), { target: { sha256: "cd" } })]);
            expect(r).toMatch(/no worker and sync exports/);
        });

        // Spec: "bench-metrics.mjs checks them again on reading an export". A session holding an
        // invalid run is an invalid session, not a directory with a file to skip.
        it.each([
            [
                "does not balance",
                { ...BALANCED, requests: 5 },
                /does not balance: requests 5 ≠ consumptions 2 \+ dropped 1 \+ discardedAtStop 1/,
            ],
            ["has an ignored detection", { ...BALANCED, ignored: 1 }, /handed in while a lock held/],
            [
                "has a count that is not a whole number",
                { ...BALANCED, dropped: -1 },
                /dropped is -1, not a whole number/,
            ],
        ])(
            "refuses a worker export whose accounting %s, naming the file and accountingError's line",
            (_, accounting, why) => {
                const r = refusal([withAccounting(accounting), pageExport("sync", syncFrames())]);
                expect(r).toMatch(/pinball-bench\.mp4/);
                expect(r).toMatch(/export-0\.json/);
                expect(r).toContain(accountingError(accounting));
                expect(r).toMatch(why);
            },
        );

        it("refuses a worker export with no accounting", () => {
            for (const none of [undefined, null]) {
                const r = refusal([withAccounting(none), pageExport("sync", syncFrames())]);
                expect(r, String(none)).toMatch(/pinball-bench\.mp4/);
                expect(r, String(none)).toMatch(/export-0\.json/);
                expect(r, String(none)).toMatch(/no detection accounting/);
            }
        });

        it("reads a clip's targets before a worker export's accounting", () => {
            // Both faults: the other target is the one named.
            const r = refusal([
                withAccounting({ ...BALANCED, requests: 5 }),
                pageExport("sync", syncFrames(), { target: { sha256: "cd" } }),
            ]);
            expect(r).toMatch(/sha256 cd/);
        });

        it("reads a worker export's accounting before what its modes give", () => {
            // Both faults: no latency sample, and an accounting that does not balance.
            const worker = workerExport({
                detection: { path: "worker", jobs: [], accounting: { ...BALANCED, requests: 5 } },
            });
            expect(refusal([worker, pageExport("sync", syncFrames())])).toMatch(/does not balance/);
        });

        it.each([
            [
                "detection latency",
                () =>
                    workerExport({
                        detection: { path: "worker", jobs: [], accounting: { ...BALANCED } },
                    }),
                /worker exports.*latency/,
            ],
            [
                "acquisition",
                () => workerExport({ frames: [track(4)] }),
                /worker exports.*acquisition/,
            ],
            [
                "step",
                () => workerExport({ frames: [frame("LOST", { acquire: 30, gray: 2 })] }),
                /worker exports.*step/,
            ],
        ])("refuses a mode that gives no %s", (_, worker, why) => {
            expect(refusal([worker(), pageExport("sync", syncFrames())])).toMatch(why);
        });

        it("counts a job that never arrived as no latency at all", () => {
            const worker = workerExport({
                detection: {
                    path: "worker",
                    jobs: [{ postedAtMs: 1, arrivedAtMs: null }],
                    accounting: { ...BALANCED },
                },
            });
            expect(refusal([worker, pageExport("sync", syncFrames())])).toMatch(/latency/);
        });
    });
});
