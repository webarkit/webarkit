/*
 *  bench-metrics.mjs
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
 * The bench's logic, apart from its page: every run metric `bench-nft.html`
 * reports and the one text defining each, the page's URL parameters, and the
 * helpers its pyramid probe and the desktop replay share. The page, the
 * comparison script (`scripts/compare-bench.mjs`) and the replay
 * (`scripts/replay-clips.mjs`) all import this module, so two exports — or an
 * export and a replay — cannot mean different things by one name. Pure: no
 * DOM, and no clock of its own. Tested in `examples/test/`.
 */

/**
 * The sample at rank `⌊p/100 · n⌋` of an ascending array, clamped to the last;
 * `NaN` when there is none. The page's definition since its first export.
 */
export function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0) return NaN;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
    return sortedAsc[idx];
}

/** `{ n, min, p50, p95, max }` of `values`, sorting a copy; every statistic `null` when there are none. */
export function stats(values) {
    if (values.length === 0) return { n: 0, min: null, p50: null, p95: null, max: null };
    const s = [...values].sort((a, b) => a - b);
    return {
        n: s.length,
        min: s[0],
        p50: percentile(s, 50),
        p95: percentile(s, 95),
        max: s[s.length - 1],
    };
}

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
 */
export function frameRecord({
    mode,
    result,
    stageTimings,
    timestampMs,
    mediaTimeSeconds,
    targetPoints,
}) {
    const tracker = mode !== "stateless";
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
        corners: result.ok ? reprojectCorners(result.H, targetPoints) : null,
    };
}

/**
 * The frames on which `stage` ran, so its percentiles are taken over frames
 * that paid for it, not diluted by frames where it was skipped and its timing
 * stayed at zero. Detection (`detect`, `describe`, `match`, `filterMatches`)
 * runs on every frame that is not TRACK — a lock that fails is detected again
 * on the same frame; `estimateHomography` on the detections that found four
 * matches; the pose on every frame with one, TRACK included; `acquire`,
 * `gray` and `total` on every frame.
 */
export function framesForStage(frames, stage) {
    const detected = (f) => f.state !== "TRACK";
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

/** Bumped whenever a definition in {@link DEFINITIONS} changes meaning; every export records it. */
export const METRICS_VERSION = 1;

/** The quality at or below which a TRACK frame is counted in `lowQualityTrackFrames`. */
export const LOW_QUALITY = 0.2;

/** The media-time window `jitterPx` is taken within, seconds. */
export const JITTER_WINDOW_S = 1;

/** What each exported metric means, in the words the page shows and every export carries. */
export const DEFINITIONS = Object.freeze({
    frames: "Frames in the window: the last windowSize ticks of the run, one per video frame the page processed.",
    states: "Frames per state. NftTracker's result.state; the stateless pipeline has no tracker, and its frames are DETECT with a pose and LOST without one, as a detection-only tracker's are for the same frame (M1).",
    trackShare:
        "TRACK frames ÷ frames. Counted per processed frame: a TRACK frame costs less than a DETECT frame, so more of them fit in a second of video.",
    loopWraps:
        "Frames whose mediaTimeSeconds is lower than the frame's before: the video looped between the two. A webcam has none.",
    reacquisitions:
        "DETECT frames after an earlier frame of the window had a pose, other than the first frame after a loop wrap. In the stateless and detection-only modes every posed frame after the first is one.",
    reacquisitionsAtLoopWrap:
        "DETECT frames that are the first after a loop wrap and follow an earlier pose: the jump there is the clip's, not the tracker's.",
    lockLosses:
        "Frames per trackLoss reason: the tracking steps that dropped the lock (tracker.ts, TrackLoss). The same frame is then detected again.",
    firstSteps:
        "Tracking steps (frames whose tracking is not null) that follow a DETECT frame: a lock's first step, which has no velocity to predict with. confirmed: those that returned TRACK.",
    heldLockSteps:
        "Tracking steps that follow a TRACK frame: a held lock's. lost: those that set trackLoss, other than on the first frame after a loop wrap, which are counted apart in lostAtLoopWrap: the jump there is the clip's, not the tracker's.",
    trackStepMs:
        "{ n, min, p50, p95, max } of NftTracker's timings.trackMs on TRACK frames: the whole tracking step (prediction, cull, pyramid depth, pyramid, alignment, fit, judgement), without the pose (a backend call), frame acquisition or grey conversion. ADR-0001 point 5's tracker-side TypeScript compute in the tracking state; its threshold is 8 ms at p95.",
    pyramidMs: "The same, over timings.pyramidMs: the part of the step in buildFramePyramid.",
    alignMs:
        "The same, over timings.alignMs: the part of the step in alignPatch, each patch's warp and its alignment. Choosing the pyramid's depth counts in trackMs only.",
    fitMs: "The same, over timings.fitMs: the part of the step in robustHomography.",
    frameLevels:
        "TRACK frames per tracking.frameLevels: the frame pyramid levels the step built, 1 being the frame itself with nothing computed.",
    fits: "Tracking steps whose robust fit returned (tracking.fitConverged not null): how many, how many stopped at fitMaxIterations (capped: reported by the tracker, not refused), and their iterations.",
    quality:
        "{ n, min, p50, p95, max } of result.quality on TRACK frames: the sum of the fit's weights ÷ the patches passed to alignPatch.",
    trackedPatches:
        "The same, over tracking.inliers on TRACK frames: the correspondences the fit kept with a weight above 0 (result.numInliers), the count minTrackedPatches bounds.",
    lowQualityTrackFrames:
        "TRACK frames with a quality of at most 0.20. The wrong poses #66 measured after a sudden roll or scale change had 0.12–0.20, but right fits on few patches reach it too: this counts candidates, not wrong poses.",
    posedFrames: "Frames with corners.",
    jitterWindows:
        "The one-second windows jitterPx pools: those holding at least 4 frames with corners.",
    corners:
        "Per frame: the target's corners (0, 0), (w − 1, 0), (w − 1, h − 1) and (0, h − 1), in target level-0 px, projected into the frame by the frame's H, in frame px. null without a pose, or when the four do not all project to finite points on the same side of the camera.",
    jitterPx:
        "The corners' standard deviation about their own straight-line motion within each one-second window of media time, frame px: in each window (never spanning a loop wrap) holding at least 4 frames with corners, a least-squares line in time is fitted to each corner's x and to its y; jitterPx = √(Σ residual² ÷ (4 · Σ(n − 2))) over those windows, n being each window's frames. Equal to the corners' SD for a target still in the image; motion that is straight over a second does not count; with n − 2 degrees of freedom per window it does not depend, in expectation, on how many frames per second the run processed. It pools every frame with corners, DETECT and TRACK alike, so a single wrong but finite pose weighs on it heavily: it measures steadiness only on a clip where the target stays in view and every pose is right, such as the static clip, and a spreadPx far above that clip's own drift (a few px) is a wrong pose to find before reading it.",
    spreadPx:
        "√(Σ|cᵢ − c̄|² ÷ (4 · n)), frame px, over the n frames with corners, c̄ being each corner's mean: the corners' standard deviation over the run. It counts any motion of the target in the image, and a clip's drift, along with jitter.",
    alignment:
        "Two exports of the same footage compared on common frames: each restricted to its frames with corners at the media times, to the microsecond, where both have a frame with corners (every occurrence kept when a loop revisits one); jitterPx and spreadPx are then taken over each restricted run as defined above.",
});

/** Whether the video looped between two consecutive frames: media time went back. */
export function isLoopWrap(prev, cur) {
    return cur.mediaTimeSeconds < prev.mediaTimeSeconds;
}

/** See `DEFINITIONS.loopWraps`. */
export function countLoopWraps(frames) {
    let wraps = 0;
    for (let i = 1; i < frames.length; i++) if (isLoopWrap(frames[i - 1], frames[i])) wraps++;
    return wraps;
}

/** See `DEFINITIONS.reacquisitions` and `DEFINITIONS.reacquisitionsAtLoopWrap`. */
export function reacquisitions(frames) {
    let hadPose = false;
    let count = 0;
    let atWrap = 0;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (f.state === "DETECT" && hadPose) {
            if (i > 0 && isLoopWrap(frames[i - 1], f)) atWrap++;
            else count++;
        }
        if (f.ok) hadPose = true;
    }
    return { reacquisitions: count, reacquisitionsAtLoopWrap: atWrap };
}

/** See `DEFINITIONS.firstSteps` and `DEFINITIONS.heldLockSteps`. */
export function lockSteps(frames) {
    const firstSteps = { n: 0, confirmed: 0 };
    const heldLockSteps = { n: 0, lost: 0, lostAtLoopWrap: 0 };
    for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        if (!f.tracking) continue;
        const before = frames[i - 1].state;
        if (before === "DETECT") {
            firstSteps.n++;
            if (f.state === "TRACK") firstSteps.confirmed++;
        } else if (before === "TRACK") {
            heldLockSteps.n++;
            if (f.trackLoss) {
                if (isLoopWrap(frames[i - 1], f)) heldLockSteps.lostAtLoopWrap++;
                else heldLockSteps.lost++;
            }
        }
    }
    return { firstSteps, heldLockSteps };
}

/**
 * See `DEFINITIONS.jitterPx`, `spreadPx`, `posedFrames` and `jitterWindows`.
 * `frames` in the order they were processed: a loop wrap is read from it.
 */
export function cornerJitter(frames) {
    const posed = frames.filter((f) => f.corners);
    let spreadPx = null;
    if (posed.length > 0) {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const f of posed) mean += f.corners[c][axis];
                mean /= posed.length;
                for (const f of posed) sum += (f.corners[c][axis] - mean) ** 2;
            }
        }
        spreadPx = Math.sqrt(sum / (4 * posed.length));
    }
    const windows = new Map();
    let loop = 0;
    for (let i = 0; i < frames.length; i++) {
        if (i > 0 && isLoopWrap(frames[i - 1], frames[i])) loop++;
        const f = frames[i];
        if (!f.corners) continue;
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

/** A run's summary over its window of frame records. Every key is defined in {@link DEFINITIONS}. */
export function summarizeRun(frames) {
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
    return {
        frames: frames.length,
        states,
        trackShare: frames.length > 0 ? states.TRACK / frames.length : null,
        ...reacquisitions(frames),
        loopWraps: countLoopWraps(frames),
        lockLosses,
        ...lockSteps(frames),
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
        ...cornerJitter(frames),
    };
}

/** A media time as the key two exports are matched on: microseconds, as `requestVideoFrameCallback` reports them. */
export const mediaKey = (seconds) => Math.round(seconds * 1e6);

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
    const restrict = (e) =>
        e.frames.filter((f) => f.corners && common.has(mediaKey(f.mediaTimeSeconds)));
    return {
        commonMediaTimes: common.size,
        first: cornerJitter(restrict(first)),
        second: cornerJitter(restrict(second)),
    };
}

/** The page's modes, as its `<select>` and the `?mode=` parameter name them. */
export const MODES = Object.freeze(["stateless", "detection-only", "tracking"]);

/**
 * A positive integer from `raw`, or `null` for anything else (empty, `abc`,
 * `0`, `-5`, `1e999`), so a malformed URL parameter or an emptied field falls
 * back to its default rather than reaching `detect` or the canvas as `NaN`.
 */
export function parsePositiveInt(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * The run parameters `search` (a URL's query string) sets, each `null` when
 * absent or out of its domain: `?maxKeypoints=`, `?procWidth=`,
 * `?procHeight=`, `?camera=rear|front` (as a `facingMode`),
 * `?mode=stateless|detection-only|tracking`, `?target=image|wnft`, `?window=`
 * (clamped to 10–2000 frames) and `?clip=` (one of `bundledClips`). Tracking
 * needs patches, which only the file carries, so `mode=tracking` defaults the
 * target to `"wnft"`; an explicit `target=image` is kept, and Start refuses it.
 */
export function parseRunParams(search, { bundledClips }) {
    const p = new URLSearchParams(search);
    const mode = MODES.includes(p.get("mode")) ? p.get("mode") : null;
    const t = p.get("target");
    const windowSize = parsePositiveInt(p.get("window"));
    const camera = p.get("camera");
    return {
        maxKeypoints: parsePositiveInt(p.get("maxKeypoints")),
        procWidth: parsePositiveInt(p.get("procWidth")),
        procHeight: parsePositiveInt(p.get("procHeight")),
        camera: camera === "front" ? "user" : camera === "rear" ? "environment" : null,
        mode,
        target: t === "image" || t === "wnft" ? t : mode === "tracking" ? "wnft" : null,
        windowSize: windowSize === null ? null : Math.min(2000, Math.max(10, windowSize)),
        clip: bundledClips.includes(p.get("clip")) ? p.get("clip") : null,
    };
}

/**
 * Why `NftTracker` would run detection-only on `db` — the constructor's rule:
 * no patches, patches under 3 × 3, or fewer than `minTrackedPatches` — or
 * `null` when it would track. The page checks this before starting a
 * tracking run, so a run is never exported as tracking while it detects.
 */
export function trackabilityError(db, minTrackedPatches) {
    const p = db.patches;
    const use = "choose targets/pinball.wnft";
    if (!p) return `Tracking needs a target with patches, and this one has no patches: ${use}.`;
    if (p.patchSize < 3)
        return `This target's patches are ${p.patchSize} × ${p.patchSize}, and alignPatch needs at least 3 × 3: ${use}.`;
    if (p.count < minTrackedPatches) {
        return `This target has ${p.count} patches, fewer than minTrackedPatches (${minTrackedPatches}): ${use}.`;
    }
    return null;
}

/**
 * Why the page must not start a run, or `null` when it may: a mode that is
 * not one of {@link MODES} (a script that set `#mode` to a value the page no
 * longer has, such as the old `tracker`, leaves the select empty), a target
 * that did not load, or a tracking run on a target the tracker would not
 * track (`trackabilityError`). Checked before any source starts.
 */
export function startRefusal({ mode, target, minTrackedPatches }) {
    if (!MODES.includes(mode)) return `Unknown mode "${mode}": choose one of ${MODES.join(", ")}.`;
    if (!target) return "targets/pinball.wnft is not loaded (see above).";
    return mode === "tracking" ? trackabilityError(target.db, minTrackedPatches) : null;
}

/**
 * Why `scripts/replay-clips.mjs --sequence` cannot replay export `e`, in one
 * line, or `null` when it can: it must be a tracking run on one of `clips`,
 * with this module's `metricsVersion`, the replay's target (`sha256`) and a
 * recorded processing size.
 */
export function sequenceRefusal(e, { metricsVersion, sha256, clips }) {
    if (e?.mode !== "tracking") return `it is a ${e?.mode ?? "(no mode)"} run, not a tracking run`;
    if (e.source !== "bundled" || !clips.includes(e.bundledClip)) {
        return `it did not run on a bundled clip (source ${e.source}, clip ${e.bundledClip ?? "(none)"})`;
    }
    if (e.metricsVersion !== metricsVersion) {
        return `it has metricsVersion ${e.metricsVersion ?? "(none)"}, not ${metricsVersion}`;
    }
    if (e.target?.sha256 !== sha256) {
        return `its target (sha256 ${e.target?.sha256 ?? "(none)"}) is not targets/pinball.wnft as this replay reads it (${sha256})`;
    }
    if (!(e.processingResolution?.width > 0 && e.processingResolution?.height > 0)) {
        return "it records no processingResolution";
    }
    if (!(e.processingBox?.width > 0 && e.processingBox?.height > 0)) {
        return "it records no processingBox, so its frames cannot be sized as the page sized them";
    }
    if (!e.tracker?.options) {
        return "it records no tracker options, so the replay could not run the tracker it ran";
    }
    return null;
}

/**
 * How `--sequence` replays export `e` (one `sequenceRefusal` accepted): at its
 * own processing box, and with the tracker options it recorded — the page's
 * `maxKeypoints` among them — so the replay does the work the device did.
 * The replay adds only its own clock.
 */
export function sequenceSettings(e) {
    return {
        box: { width: e.processingBox.width, height: e.processingBox.height },
        trackerOptions: { ...e.tracker.options },
    };
}

/**
 * The device ÷ desktop ratio of two `trackStepMs` statistics' p50, or `null`
 * when either has no TRACK frames or a p50 of 0: a run that never tracked has
 * no ratio, and must not read as one of 0 or Infinity.
 */
export function proxyRatio(device, here) {
    if (!(device?.n > 0 && here?.n > 0 && device.p50 > 0 && here.p50 > 0)) return null;
    return device.p50 / here.p50;
}

/**
 * The smallest step `clock` was seen to take over `samples` attempts, or
 * `null` if it never moved. Chrome coarsens `performance.now()` to 0.1 ms on a
 * page that is not cross-origin isolated, so a stage under that reads 0 or
 * 0.1 ms; exports record this so such values are read as what they are.
 */
export function clockResolution(clock, samples = 50) {
    let best = Infinity;
    for (let s = 0; s < samples; s++) {
        const t0 = clock();
        let t1 = t0;
        for (let spin = 0; t1 === t0 && spin < 1e6; spin++) t1 = clock();
        if (t1 > t0) best = Math.min(best, t1 - t0);
    }
    return best === Infinity ? null : best;
}

/**
 * `fn` timed `runs` times after `warmup` untimed runs, `{ p50, p95 }` in the
 * clock's unit: the method of packages/nft-tracker/scripts/bench-tracking.mjs,
 * whose numbers #63's device estimates came from, so the page's probe measures
 * what that script estimated.
 */
export function timeRepeated(fn, { clock, warmup = 50, runs = 300 }) {
    for (let i = 0; i < warmup; i++) fn();
    const samples = new Array(runs);
    for (let i = 0; i < runs; i++) {
        const t0 = clock();
        fn();
        samples[i] = clock() - t0;
    }
    samples.sort((a, b) => a - b);
    return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

/**
 * The smooth, deterministic texture bench-tracking.mjs times the frame pyramid
 * on. The pyramid's arithmetic does not depend on the pixels; the texture
 * matches so the two measurements are of the same thing.
 */
export function texturedFrame(width, height) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v =
                128 +
                50 * Math.sin(0.35 * x + 0.2 * y) +
                40 * Math.cos(0.23 * y - 0.31 * x) +
                20 * Math.sin(0.57 * x) * Math.cos(0.49 * y);
            data[y * width + x] = Math.round(v);
        }
    }
    return { data, width, height };
}

/**
 * SHA-256 of `bytes` as lowercase hex, or `null` without SubtleCrypto — which
 * browsers give only to a secure context (https://, or http://localhost).
 */
export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
    if (!subtle) return null;
    const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What an export records about the target a run used: where it came from
 * (`"wnft"`, a file loaded and decoded; `"image"`, built in the page), the
 * file and its SHA-256, how it was built when it was, and what it carries.
 */
export function targetRecord({ source, file, sha256, db, builtWith = null }) {
    return {
        source,
        file,
        sha256,
        builtWith,
        widthPx: db.meta.widthPx,
        heightPx: db.meta.heightPx,
        levels: db.pyramid.levelSizes.length,
        keypoints: db.keypoints.count,
        patches: db.patches ? db.patches.count : 0,
        patchSize: db.patches ? db.patches.patchSize : null,
    };
}

/**
 * The frame a device busy for `busyMs` after frame `i` processes next: the
 * first whose time is at or after `times[i] + busyMs`, or `times.length`
 * when none is. `times` ascending, seconds — the desktop replay's model of
 * `requestVideoFrameCallback` skipping the frames that went stale.
 */
export function nextFrameIndex(times, i, busyMs) {
    const until = times[i] + busyMs / 1000;
    let j = i + 1;
    while (j < times.length && times[j] < until) j++;
    return j;
}

/** The index in `pts` of each of `mediaTimes`, matched to the microsecond; throws on one no frame has. */
export function framesAt(pts, mediaTimes) {
    const index = new Map(pts.map((t, i) => [mediaKey(t), i]));
    return mediaTimes.map((t) => {
        const i = index.get(mediaKey(t));
        if (i === undefined) throw new Error(`no frame at media time ${t}`);
        return i;
    });
}
