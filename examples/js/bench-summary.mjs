/*
 *  bench-summary.mjs
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
 * A run's summary (`summarizeRun`), the corners' jitter it and the comparison
 * of two exports read (`cornerJitter`), and that comparison (`compareExports`).
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, under the same name.
 */

import { JITTER_WINDOW_S, LOW_QUALITY, METRICS_VERSION } from "./bench-definitions.mjs";
import {
    detectionOutcomes,
    detectionTime,
    firstStepLatency,
    frameMs,
    jobsPostedFrom,
    trackFramesWithDetectionInFlight,
    unlockedResidualMs,
} from "./bench-detection.mjs";
import { accountingError } from "./bench-export-checks.mjs";
import { checkPath, fallbackFrames } from "./bench-frames.mjs";
import { detectionLocks, lockSteps, reacquisitions, trackTimeShare } from "./bench-locks.mjs";
import { countedLoopFrames, countLoopWraps, mediaKey, wrapsOf } from "./bench-loops.mjs";
import { stats } from "./bench-stats.mjs";

/**
 * See `DEFINITIONS.jitterPx`, `spreadPx`, `posedFrames` and `jitterWindows`.
 * `frames` in the order they were processed: a loop wrap is read from it.
 * `include` selects the frames the statistics read, every one by default; the
 * loops are read from all of `frames`, since a selection can leave out both
 * neighbours of a wrap, which would then not be seen ({@link compareExports}).
 */
export function cornerJitter(frames, { include = () => true, clipDurationS = null } = {}) {
    const wraps = wrapsOf(frames, clipDurationS);
    const read = (f) => f.corners && include(f);
    const posed = frames.filter(read);
    let spreadPx = null;
    if (posed.length > 0) {
        let squares = 0;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const f of posed) mean += f.corners[c][axis];
                mean /= posed.length;
                for (const f of posed) squares += (f.corners[c][axis] - mean) ** 2;
            }
        }
        spreadPx = Math.sqrt(squares / (4 * posed.length));
    }
    const windows = new Map();
    let loop = 0;
    for (let i = 0; i < frames.length; i++) {
        if (wraps[i]) loop++;
        const f = frames[i];
        if (!read(f)) continue;
        const key = `${loop}:${Math.floor(f.mediaTimeSeconds / JITTER_WINDOW_S)}`;
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push(f);
    }
    let residuals = 0;
    let dof = 0;
    let used = 0;
    for (const w of windows.values()) {
        const n = w.length;
        if (n < 4) continue;
        let tMean = 0;
        for (const f of w) tMean += f.mediaTimeSeconds;
        tMean /= n;
        let tSpread = 0;
        for (const f of w) tSpread += (f.mediaTimeSeconds - tMean) ** 2;
        if (tSpread === 0) continue;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const f of w) mean += f.corners[c][axis];
                mean /= n;
                let slope = 0;
                for (const f of w)
                    slope += (f.mediaTimeSeconds - tMean) * (f.corners[c][axis] - mean);
                slope /= tSpread;
                for (const f of w) {
                    residuals +=
                        (f.corners[c][axis] - mean - slope * (f.mediaTimeSeconds - tMean)) ** 2;
                }
            }
        }
        dof += n - 2;
        used++;
    }
    return {
        posedFrames: posed.length,
        jitterWindows: used,
        jitterPx: dof > 0 ? Math.sqrt(residuals / (4 * dof)) : null,
        spreadPx,
    };
}

/**
 * A run's summary over its window of frame records. Every key is defined in
 * {@link DEFINITIONS}. Given nothing else, it reads every frame of the window;
 * the options are what a worker-detection session adds:
 *
 * - `clipDurationS` and `loops` (`{ firstLoop, loopCount }`): the run's counted
 *   loops. Every key then reads the frames of those loops
 *   ({@link countedLoopFrames}), and `trackTimeShare` reads all of `runFrames`
 *   over them. Without `loops`, `trackTimeShare` is `null`; `clipDurationS`
 *   alone is what `firstStepLatency` unwraps a loop wrap with. `loops` without
 *   a clip duration throws.
 * - `jobs`: the page's record of each detection it posted, for
 *   `detectionTime`, which reads the jobs posted from the frames summarized,
 *   with or without `loops`; none, for a synchronous run.
 * - `accounting`: a worker run's detection accounting, carried with its error.
 * - `path`: the run's detection path, `"sync"` or `"worker"`
 *   (`DEFINITIONS.detectionPath`), or `null` when the caller does not say. A
 *   frame without `detectionUse` is read as M2's tracker's: it detected on the
 *   frame loop unless it is TRACK. A worker run's waiting frames do not detect,
 *   so a worker run's summary refuses such a frame, in one line, rather than
 *   read it so; every summary says how many frames that fallback read
 *   (`detectionUseFallbackFrames`).
 */
export function summarizeRun(
    runFrames,
    { clipDurationS = null, loops = null, jobs = [], accounting = null, path = null } = {},
) {
    checkPath(path);
    const frames = loops ? countedLoopFrames(runFrames, { clipDurationS, ...loops }) : runFrames;
    const fallback = fallbackFrames(frames, path, "summarizeRun", runFrames);
    const states = { LOST: 0, DETECT: 0, TRACK: 0 };
    const lockLosses = {};
    for (const f of frames) {
        states[f.state]++;
        if (f.trackLoss) lockLosses[f.trackLoss] = (lockLosses[f.trackLoss] ?? 0) + 1;
    }
    const track = frames.filter((f) => f.state === "TRACK");
    const timed = track.filter((f) => f.trackerTimings);
    const stepTiming = (key) => stats(timed.map((f) => f.trackerTimings[key]));
    const stepped = track.filter((f) => f.tracking);
    const frameLevels = {};
    for (const f of stepped)
        frameLevels[f.tracking.frameLevels] = (frameLevels[f.tracking.frameLevels] ?? 0) + 1;
    const fits = frames.filter((f) => f.tracking && f.tracking.fitConverged !== null);
    const lock = loops ? trackTimeShare(runFrames, { clipDurationS, ...loops }) : null;
    // Every reader of a wrap reads it by the clip's duration when the summary has one.
    const clip = { clipDurationS };
    return {
        frames: frames.length,
        states,
        trackShare: frames.length > 0 ? states.TRACK / frames.length : null,
        ...reacquisitions(frames, clip),
        loopWraps: countLoopWraps(frames, clip),
        lockLosses,
        ...lockSteps(frames, clip),
        trackStepMs: stepTiming("trackMs"),
        pyramidMs: stepTiming("pyramidMs"),
        alignMs: stepTiming("alignMs"),
        fitMs: stepTiming("fitMs"),
        frameLevels,
        fits: {
            n: fits.length,
            capped: fits.filter((f) => f.tracking.fitConverged === false).length,
            iterations: stats(fits.map((f) => f.tracking.fitIterations)),
        },
        quality: stats(track.map((f) => f.quality)),
        trackedPatches: stats(stepped.map((f) => f.tracking.inliers)),
        lowQualityTrackFrames: track.filter((f) => f.quality <= LOW_QUALITY).length,
        ...cornerJitter(frames, clip),
        trackTimeShare: lock,
        detectionLocks: detectionLocks(frames, clip),
        firstStepLatency: firstStepLatency(frames, { clipDurationS }),
        detectionOutcomes: detectionOutcomes(frames),
        trackFramesWithDetectionInFlight: trackFramesWithDetectionInFlight(frames),
        frameMs: frameMs(frames),
        unlockedResidualMs: unlockedResidualMs(frames),
        detectionTime: detectionTime(frames, jobsPostedFrom(jobs, frames), {
            clipDurationS,
            loops,
            // Per second of the counted loops' video only when the run covered them all.
            complete: lock?.complete === true,
        }),
        detectionAccounting: accounting
            ? { ...accounting, error: accountingError(accounting) }
            : null,
        detectionUseFallbackFrames: fallback.length,
    };
}

/**
 * Two exports of the same footage, aligned as `DEFINITIONS.alignment` says,
 * and {@link cornerJitter} of each. Two runs never process the same frames —
 * the main thread skips the ones it is too busy for, and two modes skip
 * different ones — so this is the comparison on common footage that their
 * arrays' indices cannot give. Throws on exports that cannot be aligned,
 * saying why.
 */
export function compareExports(first, second) {
    const refuse = (why) => {
        throw new Error(`cannot compare these exports: ${why}`);
    };
    for (const [name, e] of [
        ["the first", first],
        ["the second", second],
    ]) {
        if (!Array.isArray(e?.frames)) refuse(`${name} has no frames`);
        if (e.source === "webcam") {
            refuse(
                `${name} is a webcam run, whose mediaTimeSeconds is time since its stream started, not a position in a clip`,
            );
        }
        if (e.metricsVersion !== METRICS_VERSION) {
            refuse(
                `${name} has metricsVersion ${e.metricsVersion ?? "(none)"}, not ${METRICS_VERSION}: its frames do not carry corners as defined here`,
            );
        }
    }
    if (first.source !== second.source || first.bundledClip !== second.bundledClip) {
        refuse(
            `they ran on different footage (${first.bundledClip ?? first.source}, ${second.bundledClip ?? second.source})`,
        );
    }
    const a = first.processingResolution;
    const b = second.processingResolution;
    if (a?.width !== b?.width || a?.height !== b?.height) {
        refuse(
            `their corners are in different frame sizes (${a?.width}x${a?.height}, ${b?.width}x${b?.height})`,
        );
    }
    const posed = (e) =>
        new Set(e.frames.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)));
    const inFirst = posed(first);
    const common = new Set([...posed(second)].filter((k) => inFirst.has(k)));
    if (common.size === 0) refuse("there is no media time both runs posed, so no frame to compare");
    // Each run's loops from all its frames: the frames both posed can skip a wrap's neighbours.
    const include = (f) => common.has(mediaKey(f.mediaTimeSeconds));
    const jitter = (e) =>
        cornerJitter(e.frames, { include, clipDurationS: e.clipDurationS ?? null });
    return {
        commonMediaTimes: common.size,
        first: jitter(first),
        second: jitter(second),
    };
}
