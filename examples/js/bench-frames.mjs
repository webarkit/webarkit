/*
 *  bench-frames.mjs
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
 * A frame record of an export, what became of detection on it, and the
 * per-stage timings read over the frames that ran each stage (`summaryMs`).
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, except the helpers this module shares with the
 * other `bench-*.mjs` modules, listed at its end.
 */

import { countedLoopFrames, refuseUnless } from "./bench-loops.mjs";
import { DETECTION_PATHS } from "./bench-params.mjs";
import { percentile } from "./bench-stats.mjs";

/** A `w × h` target's four corners, in its level-0 pixels, clockwise from the origin. */
export function targetCorners(widthPx, heightPx) {
    return [
        [0, 0],
        [widthPx - 1, 0],
        [widthPx - 1, heightPx - 1],
        [0, heightPx - 1],
    ];
}

/**
 * `points` projected by the row-major homography `H`, or `null` when one of
 * them does not project to a finite point, or when they do not all land on the
 * same side of the camera (their `w` differ in sign): a pose whose outline
 * cannot be drawn, and whose corners would make any statistic of them
 * meaningless. `H` and `−H` are the same homography, so all-negative `w` is
 * accepted.
 */
export function reprojectCorners(H, points) {
    const out = [];
    let side = 0;
    for (const [x, y] of points) {
        const w = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / w;
        const v = (H[3] * x + H[4] * y + H[5]) / w;
        if (!(Number.isFinite(u) && Number.isFinite(v))) return null;
        const s = Math.sign(w);
        if (side !== 0 && s !== side) return null;
        side = s;
        out.push([u, v]);
    }
    return out;
}

/**
 * One frame of an export. `mode` is `"stateless"`, `"detection-only"` or
 * `"tracking"`; `result` is what that mode returned — `NftTracker`'s
 * `TrackResult`, or the page's stateless-pipeline result, which has no state,
 * quality or tracking fields. What the tracker reports is copied as it
 * reports it; nothing is recomputed. `stageTimings` is the page's per-stage
 * timings object (copied: the page reuses one every tick), and `targetPoints`
 * the target's corners from {@link targetCorners}.
 *
 * `mediaTimeSeconds` is the frame's position in the clip — compare two
 * exports by it, never by index: frames the main thread was too busy for are
 * skipped, and two modes skip different ones (examples/README.md).
 * `numSceneKeypoints` is what `detect` returned: at most the run's
 * `maxKeypoints`, fewer on a frame with fewer corners — `match` is a
 * brute-force search over these, so a `match` timing means nothing without
 * it — and 0 on a TRACK frame, where nothing is detected.
 *
 * What became of detection on the frame (`DEFINITIONS.detectionUse`) is
 * `needsDetection`, `detectionUse` and `detectionLatencyMs`, copied from the
 * tracker's result (`false`, `null` and `null` where it has none: the older
 * trackers, and the stateless pipeline), `detectionInFlight` from `detection`,
 * and `detectedAt`. `detection` is what the page knows that the result does
 * not, and only a worker run has any: `{ inFlight, detectedAt }`, whether a
 * detection was in flight when the frame was processed, and the frame a
 * detection handed to `process` was computed on. `detectedAt` names the frame
 * the used detection was computed on — `detection.detectedAt`, copied, for a
 * consumed one; this frame, with `framesAgo: 0`, when the tracker detected on
 * it — and is `null` when no detection was used.
 */
export function frameRecord({
    mode,
    result,
    stageTimings,
    timestampMs,
    mediaTimeSeconds,
    targetPoints,
    detection = null,
}) {
    const tracker = mode !== "stateless";
    const detectionUse = result.detectionUse ?? null;
    let detectedAt = null;
    if (detectionUse === "internal") {
        detectedAt = { timestampMs, mediaTimeSeconds, framesAgo: 0 };
    } else if (detectionUse === "consumed" && detection?.detectedAt) {
        const at = detection.detectedAt;
        detectedAt = {
            timestampMs: at.timestampMs,
            mediaTimeSeconds: at.mediaTimeSeconds,
            framesAgo: at.framesAgo,
        };
    }
    return {
        timestampMs,
        mediaTimeSeconds,
        timings: { ...stageTimings },
        ok: result.ok,
        reason: result.ok ? null : result.reason,
        numSceneKeypoints: result.sceneKeypoints.length,
        numMatches: result.numMatches,
        numInliers: result.numInliers,
        state: tracker ? result.state : result.ok ? "DETECT" : "LOST",
        quality: tracker ? result.quality : null,
        trackLoss: tracker ? result.trackLoss : null,
        tracking: tracker && result.tracking ? { ...result.tracking } : null,
        trackerTimings: tracker && result.timings ? { ...result.timings } : null,
        needsDetection: tracker ? (result.needsDetection ?? false) : false,
        detectionUse,
        detectionLatencyMs: result.detectionLatencyMs ?? null,
        detectionInFlight: detection?.inFlight ?? false,
        detectedAt,
        corners: result.ok ? reprojectCorners(result.H, targetPoints) : null,
    };
}

/**
 * What became of detection on a frame, `DEFINITIONS.detectionUse`'s word for
 * it. A frame without a `detectionUse` — an export older than the field, or the
 * stateless pipeline's, which records `null` — is read as M2's tracker read
 * it: it detected on every frame that is not TRACK.
 */
function detectionUseOf(f) {
    return f.detectionUse ?? (f.state === "TRACK" ? "none" : "internal");
}

/**
 * The frames on which `stage` ran, so its percentiles are taken over frames
 * that paid for it, not diluted by frames where it was skipped and its timing
 * stayed at zero. Detection (`detect`, `describe`, `match`, `filterMatches`)
 * runs on the frames that ran the tracker's own detection
 * (`detectionUse: "internal"`, as {@link detectionUseOf} reads it): a lock that
 * fails is detected again on the same frame, and a frame a worker's detection
 * was handed to, or that waited for one, ran none. `estimateHomography` runs on
 * the detections that found four matches; the pose on every frame with one,
 * TRACK included; `acquire`, `gray` and `total` on every frame.
 */
export function framesForStage(frames, stage) {
    const detected = (f) => detectionUseOf(f) === "internal";
    switch (stage) {
        case "detect":
        case "describe":
        case "match":
        case "filterMatches":
            return frames.filter(detected);
        case "estimateHomography":
            return frames.filter((f) => detected(f) && f.reason !== "too-few-matches");
        case "pose":
            return frames.filter((f) => f.ok);
        default:
            return frames;
    }
}

/**
 * Each of `stages`' samples over `frames`, in the order given, as
 * `[stage, values]`: a stage over the frames that ran it
 * ({@link framesForStage}), and `detectionPost`, a worker run's post of a frame
 * to its worker, over the frames that carry one (a frame that did not post
 * carries none at all). The page's stage table, and {@link stageSummary}.
 */
export function stageSamples(frames, stages) {
    return stages.map((stage) => [
        stage,
        stage === "detectionPost"
            ? frames.map((f) => f.timings.detectionPost).filter(Number.isFinite)
            : framesForStage(frames, stage).map((f) => f.timings[stage]),
    ]);
}

/** A run's detection path as a summary is given it: `"sync"`, `"worker"` or `null` (`DETECTION_PATHS`). */
function checkPath(path) {
    refuseUnless(
        path === null || DETECTION_PATHS.includes(path),
        `path must be ${DETECTION_PATHS.join(" or ")} or null, got ${path}`,
    );
}

/**
 * The frames of `frames` that {@link detectionUseOf} reads by M2's rule — no
 * `detectionUse`, absent or `null` — which `detectionUseFallbackFrames` counts.
 * In a worker run there may be none: its waiting frames do not detect, and a
 * frame read as one that did would bias every detection metric, so `caller`
 * refuses it, in one line naming the frame and its media time. The frame is
 * numbered in `window`, the frames the caller was given, of which `frames` may
 * be the counted loops': as {@link unwrapMediaTimes} numbers the frames it
 * refuses, so that two refusals of one run name a frame alike.
 */
function fallbackFrames(frames, path, caller, window = frames) {
    const fallback = frames.filter((f) => f.detectionUse == null);
    if (path === "worker" && fallback.length > 0) {
        const f = fallback[0];
        throw new RangeError(
            `${caller}: frame ${window.indexOf(f)} of a worker run (media time ${f.mediaTimeSeconds} s) has no detectionUse, which would be read as a detection on the frame loop: a worker run's waiting frames do not detect`,
        );
    }
    return fallback;
}

/**
 * The export's `summaryMs` (`DEFINITIONS.summaryMs`): `{ p50, p95, max }` of
 * each of `stages`, in the order given, over {@link stageSamples}; `null`
 * statistics for a stage with no sample. `stages` are the page's: the stages its
 * backend runs, and in a worker run `detectionPost` before `total`.
 *
 * Given `clipDurationS` and `loops` (`{ firstLoop, loopCount }`), it reads the
 * frames of the counted loops ({@link countedLoopFrames}), as `summarizeRun`
 * does: never the warm-up loop, whose first acquisition is cold, and which
 * the thermal rule must not read. A clip duration shorter than the clip is
 * refused, as there. `path`, the run's detection path (`"sync"`, `"worker"` or
 * `null`), is `summarizeRun`'s too: a worker run's frame without `detectionUse`
 * would give the detection stages by M2's rule, which a waiting frame does not
 * follow, so it is refused, in one line.
 */
export function stageSummary(frames, { stages, clipDurationS = null, loops = null, path = null }) {
    checkPath(path);
    const read = loops ? countedLoopFrames(frames, { clipDurationS, ...loops }) : frames;
    fallbackFrames(read, path, "stageSummary", frames);
    const summary = {};
    for (const [stage, samples] of stageSamples(read, stages)) {
        const values = samples.sort((a, b) => a - b);
        summary[stage] = {
            p50: values.length ? percentile(values, 50) : null,
            p95: values.length ? percentile(values, 95) : null,
            max: values.length ? values[values.length - 1] : null,
        };
    }
    return summary;
}

// Shared with the other bench-*.mjs modules; bench-metrics.mjs does not re-export them.
export { detectionUseOf, checkPath, fallbackFrames };
