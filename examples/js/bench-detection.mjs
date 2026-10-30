/*
 *  bench-detection.mjs
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
 * Detection metrics: a lock's first-step latency, what became of each
 * detection, a frame's cost, and where detection's time goes on the frame
 * loop and off it (`detectionTime`).
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, except the helpers this module shares with the
 * other `bench-*.mjs` modules, listed at its end.
 */

import { DETECTION_STAGES } from "./bench-definitions.mjs";
import { detectionUseOf } from "./bench-frames.mjs";
import { detectionLockList, setsLock } from "./bench-locks.mjs";
import { checkClipDuration, CLIP_END_TOLERANCE_S, countedLoops } from "./bench-loops.mjs";
import { finite, stats, sum } from "./bench-stats.mjs";

/**
 * See `DEFINITIONS.firstStepLatency`. `clipDurationS`, when given, is what a
 * loop wrap between a detection and its first step is unwrapped with, as
 * {@link unwrapMediaTimes} does, a frame up to 1 ms past it standing at it as
 * there. Without it, the locks with a wrap between the two frames are left
 * out of `videoMs` alone, and nothing throws: a webcam run has no clip, and so
 * no duration.
 */
export function firstStepLatency(frames, { clipDurationS = null } = {}) {
    if (clipDurationS !== null) checkClipDuration(clipDurationS);
    // As on the unwrapped timeline: up to 1 ms past D is rounding, and stands at D. Past that,
    // a frame is read as it is: a duration that short is the timeline's to refuse.
    const at = (m) =>
        clipDurationS !== null && m > clipDurationS && m <= clipDurationS + CLIP_END_TOLERANCE_S
            ? clipDurationS
            : m;
    const ms = [];
    const videoMs = [];
    const processed = [];
    for (const { consumed, step, detected } of detectionLockList(frames, clipDurationS)) {
        if (!step || !detected) continue;
        ms.push(step.timestampMs - detected.timestampMs);
        processed.push(consumed ? detected.framesAgo : detected.framesAgo + 1);
        let video = at(step.mediaTimeSeconds) - at(detected.mediaTimeSeconds);
        if (video < 0 && clipDurationS !== null) video += clipDurationS;
        if (video >= 0) videoMs.push(video * 1000);
    }
    return {
        ms: stats(finite(ms)),
        videoMs: stats(finite(videoMs)),
        frames: stats(finite(processed)),
    };
}

/** See `DEFINITIONS.detectionOutcomes`. */
export function detectionOutcomes(frames) {
    const out = { used: 0, failed: {}, locked: 0, ignored: 0 };
    for (const f of frames) {
        const use = detectionUseOf(f);
        if (use === "ignored") out.ignored++;
        if (use !== "internal" && use !== "consumed") continue;
        out.used++;
        if (setsLock(f, use)) out.locked++;
        else if (!f.ok) out.failed[f.reason] = (out.failed[f.reason] ?? 0) + 1;
    }
    return out;
}

/** See `DEFINITIONS.trackFramesWithDetectionInFlight`. */
export function trackFramesWithDetectionInFlight(frames) {
    return frames.filter((f) => f.state === "TRACK" && f.detectionInFlight).length;
}

/** See `DEFINITIONS.frameMs`. */
export function frameMs(frames) {
    const totals = (of) => stats(finite(of.map((f) => f.timings?.total)));
    return {
        all: totals(frames),
        track: totals(frames.filter((f) => f.state === "TRACK")),
        unlocked: totals(frames.filter((f) => f.state !== "TRACK")),
    };
}

/** See `DEFINITIONS.unlockedResidualMs`. */
export function unlockedResidualMs(frames) {
    const residuals = frames
        .filter((f) => f.state !== "TRACK" && f.timings)
        .map((f) => {
            const t = f.timings;
            return t.total - t.acquire - t.gray - (t.detectionPost ?? 0);
        });
    return stats(finite(residuals));
}

/**
 * Each job's latency from its post to its result's arrival, `arrivedAtMs −
 * postedAtMs` on the main thread's clock, in job order, over the jobs that
 * came back: a job that never arrived, posted and still in flight or held at
 * Stop, has no latency, and a `null` would otherwise subtract as 0. The one
 * definition `detectionTime.postToArrivalMs` and the transfer's worker
 * latencies (`transferPlan`) both read.
 */
export function postToArrivalSamples(jobs) {
    return jobs
        .filter((j) => Number.isFinite(j.postedAtMs) && Number.isFinite(j.arrivedAtMs))
        .map((j) => j.arrivedAtMs - j.postedAtMs);
}

/** Seconds of video between consecutive frames, a loop wrap (media time going back) counting for nothing. */
function coveredVideoSeconds(frames) {
    let seconds = 0;
    for (let i = 1; i < frames.length; i++) {
        const gap = frames[i].mediaTimeSeconds - frames[i - 1].mediaTimeSeconds;
        if (gap > 0) seconds += gap;
    }
    return seconds;
}

/**
 * See `DEFINITIONS.detectionTime`. `jobs` are the page's records of the
 * detections it posted, of which this reads `handlerMs`, `workerMs.total`,
 * `postedAtMs` and `arrivedAtMs`. The video the time is per second of is
 * that of the counted `loops` (`{ firstLoop, loopCount }`, needing
 * `clipDurationS`) when they are given, else what `frames` cover. The counted
 * loops' duration is the video `frames` cover only when the run covered them
 * all, so with `loops` both rates are `null` unless `complete` is `true`: the
 * run's `trackTimeShare.complete`, which `summarizeRun` passes in. An empty or
 * a partial window would otherwise read 0, or a rate biased low.
 */
export function detectionTime(
    frames,
    jobs = [],
    { clipDurationS = null, loops = null, complete = false } = {},
) {
    let stagesMs = 0;
    let totalMs = 0;
    const posts = [];
    for (const f of frames) {
        const t = f.timings;
        if (!t) continue;
        if (Number.isFinite(t.total)) totalMs += t.total;
        if (detectionUseOf(f) === "internal") {
            stagesMs += sum(finite(DETECTION_STAGES.map((stage) => t[stage])));
        }
        if (Number.isFinite(t.detectionPost)) posts.push(t.detectionPost);
    }
    const handlers = finite(jobs.map((j) => j.handlerMs));
    const workers = finite(jobs.map((j) => j.workerMs?.total));
    const arrivals = postToArrivalSamples(jobs);
    const onLoopMs = stagesMs + sum(posts) + sum(handlers);
    const loopMs = totalMs + sum(handlers);
    const counted = loops ? countedLoops({ clipDurationS, ...loops }) : null;
    // With counted loops that are not complete there is no video to divide by.
    const videoS = counted
        ? complete === true
            ? counted.loopCount * clipDurationS
            : 0
        : coveredVideoSeconds(frames);
    const perVideoSecond = (ms) => (videoS > 0 ? ms / videoS : null);
    return {
        onLoop: {
            share: loopMs > 0 ? onLoopMs / loopMs : null,
            msPerVideoSecond: perVideoSecond(onLoopMs),
            postMs: stats(posts),
            handlerMs: stats(handlers),
        },
        offLoop: { workerMs: stats(workers), msPerVideoSecond: perVideoSecond(sum(workers)) },
        postToArrivalMs: stats(arrivals),
    };
}

/**
 * The jobs a summary of `frames` reads: those posted from one of them, by the
 * timestamp of the frame posted (`frameTimestampMs`, else the post's own) —
 * never a job of the run posted from a frame the summary does not read, such
 * as one before the window, or in the warm-up loop. The frames' timestamps
 * only grow, so the first and the last bound them.
 */
function jobsPostedFrom(jobs, frames) {
    if (frames.length === 0) return [];
    const from = frames[0].timestampMs;
    const to = frames[frames.length - 1].timestampMs;
    return jobs.filter((j) => {
        const t = j.frameTimestampMs ?? j.postedAtMs;
        return t >= from && t <= to;
    });
}

// Shared with the other bench-*.mjs modules; bench-metrics.mjs does not re-export them.
export { jobsPostedFrom };
