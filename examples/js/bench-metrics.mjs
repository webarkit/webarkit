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
 * refuses it, in one line naming the frame and its media time.
 */
function fallbackFrames(frames, path, caller) {
    const fallback = frames.filter((f) => f.detectionUse == null);
    if (path === "worker" && fallback.length > 0) {
        const f = fallback[0];
        throw new RangeError(
            `${caller}: frame ${frames.indexOf(f)} of a worker run (media time ${f.mediaTimeSeconds} s) has no detectionUse, which would be read as a detection on the frame loop: a worker run's waiting frames do not detect`,
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
    fallbackFrames(read, path, "stageSummary");
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

/**
 * The backend stages the detection pipeline runs on a frame, in the order it
 * runs them: what a detection worker reports the time of. `filterMatches` is
 * listed for the backends that have one; a backend without it has no such
 * stage. Not the pose (`pose`), which the tracker computes from the homography
 * a detection returns, on the main thread.
 */
export const DETECTION_STAGES = Object.freeze([
    "detect",
    "describe",
    "match",
    "filterMatches",
    "estimateHomography",
]);

/** Bumped whenever a definition in {@link DEFINITIONS} changes meaning; every export records it. */
export const METRICS_VERSION = 1;

/** The quality at or below which a TRACK frame is counted in `lowQualityTrackFrames`. */
export const LOW_QUALITY = 0.2;

/** The media-time window `jitterPx` is taken within, seconds. */
export const JITTER_WINDOW_S = 1;

/** What each exported metric means, in the words the page shows and every export carries. */
export const DEFINITIONS = Object.freeze({
    frames: "Frames in the window: the last windowSize ticks of the run, one per video frame the page processed. A run summarized over its counted loops (summarizeRun's loops) has the frames of those loops instead, and every key below reads them, except trackTimeShare, which reads all the run's frames, and detectionAccounting, which counts the whole run.",
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
    detectionPath:
        "The run's detection path, from ?detection=. sync: the tracker detects on the frame loop (M2); worker: a module worker detects, under the on-demand policy (docs/benchmarks/README.md, 2026-09-29).",
    summaryMs:
        "Per stage, { p50, p95, max } of its timing in ms (stageSummary): each stage over the frames that ran it (framesForStage), a worker run's detectionPost over the frames that posted, over the frames summaryMsFrames names. In a ?loops= run those are the counted loops' frames, as the run summary's, never the warm-up loop's, whose first acquisition is cold. A worker run's frame without detectionUse is refused here as in the run summary (detectionUseFallbackFrames).",
    summaryMsFrames:
        "Which frames summaryMs reads: counted loops (a ?loops= run: loops 1 to its loop count, as the run summary reads them) or window (the window's frames).",
    endedBy:
        "How a run ended, in the export's run record beside order, startedAtIso and endedAtIso: done (a ?loops= run, on its first frame after its counted loops), stopped (Stop) or failed (the run could not go on; a worker run that failed is not exported). A run that failed is failed whatever ended it first, its own end included.",
    failure:
        "In the export's run record: why the run could not go on, the one-line cause the page showed (naming the frame for a throw in a frame's callback), or null. Only a synchronous run that failed is exported with one (a worker run that failed is not exported), and its endedBy is then failed.",
    protocol:
        "{ sessionRun, gaps }: whether the run followed the device session's protocol (docs/benchmarks/README.md, 2026-09-29), and what keeps it from it, one line each (sessionRunGaps): a tracking or stateless run of a bundled clip, over one warm-up loop and loops 1 to 4 counted (loops), with its place in the session's order (run.order), that ended itself (run.endedBy done) with every frame it processed in its window (ticks, a whole number, = windowSize), recording its detection path (detection.path sync or worker); in the tracking mode its lock read over those loops whole (trackTimeShare.complete), in a worker run its accounting holding (detectionAccounting); at the page's defaults: the committed target, loaded, no tracker option overridden (?tracker=), the default scene keypoint budget and processing box. What the export does not record is a gap, never a pass. The page exports a run with gaps all the same, and says so; replay-clips --transfer reads only session runs.",
    provenance:
        "{ manifest, observed, refusal, note }: what the page checked at Start against examples/dist/provenance.json, the manifest npm run build writes (scripts/build-provenance.mjs, #110). manifest: as fetched at Start (HEAD, clean, each tracked input's SHA-256 and git blob id, the shared bundle's hash, jsfeat-next's lockfile entry and file hash), null when it could not be read. observed: the SHA-256 of the bytes the server served at Start for the bundle and each served file (not necessarily the bytes the page loaded earlier: a fetch cannot see what the module loader executed), whether the manifest changed since page load (manifestChanged), and the modules the page and the worker observed themselves loading (loaded, the worker's own report also as loadedByWorker: which URLs, not which bytes). refusal: provenanceRefusal's one line, or null. In a session run (?loops= or ?run=) Start refuses on it; otherwise it is only recorded. note: one line when the tree was dirty or the check refused, else null. Reported, not gating: sessionRunGaps does not read it, and an export without it is not a gap. Absent in exports older than #110, whose worker runs carry detection.workerBundleSha256 instead.",
    detectionAccounting:
        "A worker run's detection requests and what became of each, counted over the whole run, not the window: requests (results that said needsDetection) = consumptions (detections handed to process and used) + dropped (requests made while a detection was in flight or held) + discardedAtStop (a detection in flight, or held, at Stop), and ignored (detections handed in while a lock held) = 0; posted counts the requests that started a job. accountingError checks both, and a run that fails either is not exported. In the summary the accounting is carried as given, with error: accountingError's line saying what is wrong, or null when nothing is; the summary has null for a run that gave none.",
    detectionUseFallbackFrames:
        "The summarized frames without a detectionUse (absent or null), which every metric that reads it takes as M2's tracker did: detected on the frame loop unless TRACK. Every frame of an export older than the field, and of the stateless pipeline; 0 in a current tracking run. A worker run's waiting frames do not detect, so its summary is refused, not read, if it has any (summarizeRun's path).",
    staleReplies:
        "A worker run's replies from the worker to its own jobs that arrived after the run ended, discarded and never handed in. Each is to a job the run discarded at its end, already counted in discardedAtStop, and one per such job, whose record then carries lateReplyAtMs (the reply's arrival), so staleReplies ≤ discardedAtStop. Counted on the run the reply names, whenever it arrives, between runs or during a later run, never on another run; the export records the count as it stood when the export was taken. A reply naming a run the page never had, a job the run did not discard unanswered, or one whose late reply was already counted, fails the worker instead.",
    detectionUse:
        "Per frame, what became of detection, from NftTracker's result: needsDetection (the frame ended without a lock and the tracker has externalDetection: an application is asked for a detection), detectionUse (internal: the tracker detected on this frame; consumed: a detection computed elsewhere was handed to process and used; ignored: one was handed in while a lock held; none: neither; null: the stateless pipeline, and any export older than the field, which read as M2's tracker: its own detection on every frame that is not TRACK), detectionLatencyMs (this frame's timestamp minus the consumed detection's, else null), detectionInFlight (a worker's detection was in flight when process ran) and detectedAt ({ timestampMs, mediaTimeSeconds, framesAgo }, the frame the used detection was computed on: this frame, with framesAgo 0, for an internal one, and the frame the worker was given for a consumed one, framesAgo processed frames back; null when none was used).",
    trackTimeShare:
        "The share of video time with a confirmed lock, over whole loops of the clip, on a fixed grid of media time: { share, perLoop, binMs, loops: [first, last], complete }, from every frame's state and mediaTimeSeconds. Media time is unwrapped onto one timeline, loop k covering [k·D, (k + 1)·D), D being the clip's duration, and the run's first pass is loop 0, a warm-up that is not counted: loops 1 to 4 are. A D shorter than the clip would lay the loops over each other, so a frame whose media time is past D by more than 1 ms, or whose unwrapped time comes before the frame's before it, is refused, not read; one past D by at most 1 ms, rounding, stands at D, across the wrap after it too. A frame whose media time is not a finite number is refused. Bin j of loop k starts at k·D + j·binMs (binMs 10) and takes the state of the most recent processed frame at or before its start, held across a loop wrap; share = bins in TRACK ÷ all bins, and perLoop is each counted loop's own. A DETECT frame's pose is an unconfirmed detection and counts as no lock. It reads all the run's frames, not only the counted loops': the frame before a loop supplies the state its first bins take, and a frame of the loop after the last closes it. Deleting a frame whose state equals both its neighbours' cannot change it, so a schedule that processes more frames, a worker's waiting ones, does not move it as it moves trackShare, which counts processed frames. complete is false, and share and perLoop null, unless a frame stands at or before the first bin and one at or after the start of the loop after the last; a summary given no counted loops has null.",
    detectionLocks:
        "{ n, confirmed, refused, reacquisitions, reacquisitionsAtLoopWrap }: the locks the tracker set from a detection, by one rule for the synchronous and the worker modes, from each frame's state, detectionUse, reason, tracking and trackLoss. A lock is set on a DETECT frame that ran the tracker's own detection (detectionUse internal; an export older than the field reads every DETECT frame so), and on a frame that consumed a detection (consumed) and is TRACK or has the reason unconfirmed. Its first step is the tracking step that carries the detection's pose to a frame: the next frame's (its tracking not null) after the tracker's own detection, the same frame's after a consumed one. n: the locks whose first step is in the window; confirmed: those whose first step returned TRACK; refused: the rest, per that step's trackLoss (in a worker run, the stale refusals). reacquisitions: the locks set after an earlier frame of the window had a pose, other than on the first frame after a loop wrap, which reacquisitionsAtLoopWrap counts apart: the jump there is the clip's. On a synchronous run n and confirmed equal firstSteps.n and firstSteps.confirmed, and both reacquisitions keys those of the same names, which stay under their own definitions.",
    firstStepLatency:
        "{ ms, videoMs, frames }, each { n, min, p50, p95, max }, of the latency from a detection to its lock's first step (detectionLocks), over the locks whose first step is in the window: from the frame the detection was computed on to the frame of that step. The detected frame is detectedAt for a consumed detection (a lock whose frame has none is not counted here) and the DETECT frame itself for the tracker's own. ms: the first-step frame's timestampMs minus the detected frame's, on the main thread's clock. videoMs: the same on mediaTimeSeconds, in ms, with the clip's duration added when the video looped between the two frames; a summary given no clip duration counts only the locks with no loop wrap between them. frames: processed frames from the detected frame to the first step's: detectedAt.framesAgo + 1 after the tracker's own detection, whose first step is the next frame, and detectedAt.framesAgo after a consumed one, whose first step is the consuming frame.",
    detectionOutcomes:
        "{ used, failed, locked, ignored }: what became of each detection, from detectionUse, state and reason. used: the frames whose detection the tracker ran itself (internal; an export older than the field reads every frame that is not TRACK so) or was handed and consumed. failed, per reason: those whose detection itself failed (too-few-matches, no-consensus). locked: those that set a lock, as detectionLocks counts them, whose first step detectionLocks then counts as confirmed or refused per trackLoss; used is locked plus failed, except for a detection handed to a detection-only tracker, which sets no lock. ignored: the frames whose detectionUse is ignored, a detection handed in while a lock held: 0 under the on-demand policy, and a defect otherwise.",
    trackFramesWithDetectionInFlight:
        "TRACK frames whose detectionInFlight is true: process ran on them while a worker detection was in flight. 0 by construction under the on-demand policy, which starts a detection only when the tracker says needsDetection, and it says so only on a frame that ended without a lock: a check that the policy that ran is the one planned. 0 in a synchronous run, and in an export older than the field.",
    frameMs:
        "{ all, track, unlocked }, each { n, min, p50, p95, max } of timings.total: the main thread's time for one processed frame, its acquisition, its grey conversion, the tracker's process and, in a worker run, the post of a frame to the worker (detectionPost). all: every frame; track: the TRACK frames; unlocked: the frames that are not TRACK, whatever they did.",
    unlockedResidualMs:
        "{ n, min, p50, p95, max } of timings.total − timings.acquire − timings.gray − timings.detectionPost, per unlocked frame (state not TRACK), each frame's own: a frame that did not post carries no detectionPost and subtracts none. What is left of an unlocked frame once its acquisition, its grey conversion and its post are taken off: in a worker run, a process call that finds no lock and no detection; in a synchronous run, the tracker's own detection.",
    detectionTime:
        "Where detection's time goes, on the frame loop and off it, over the window's frames and the jobs (one per detection posted to the worker) posted from them. onLoop: the main thread's detection-related time, the sum of the detection stages (detect, describe, match, filterMatches, estimateHomography) of the frames that ran the tracker's own detection (detectionUse internal; an export older than the field reads every frame that is not TRACK so), timings.detectionPost of the frames that posted, and each job's handlerMs, the result handler, which runs between frames and is outside timings.total. share: that time ÷ (Σ timings.total + Σ handlerMs). msPerVideoSecond: that time per second of video covered, which is the counted loops' whole duration (their number × clipDurationS) in a summary that has them, and null there unless the run covered those loops whole (trackTimeShare.complete): an empty or partial window covers less than that duration, and would read 0 or a rate biased low; else the media time between consecutive frames, a loop wrap counting nothing, and null when that is 0. postMs: { n, min, p50, p95, max } of timings.detectionPost over the frames that carry one (a frame that did not post carries none), and handlerMs the same of the jobs' handlerMs. offLoop: workerMs, { n, min, p50, p95, max } of each job's workerMs.total, the worker's pipeline time on its own clock, and msPerVideoSecond, the sum of those per second of video covered. postToArrivalMs: { n, min, p50, p95, max } of each job's arrivedAtMs − postedAtMs, both on the main thread's clock: the latency of a detection from its post to its result's arrival.",
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

/** The loop parameters a caller may get wrong, refused by name rather than read as `NaN`. */
function refuseUnless(ok, message) {
    if (!ok) throw new RangeError(message);
}

const positiveNumber = (n) => Number.isFinite(n) && n > 0;

const checkClipDuration = (clipDurationS) =>
    refuseUnless(
        positiveNumber(clipDurationS),
        `clipDurationS must be a positive number of seconds, got ${clipDurationS}`,
    );

/**
 * How close, in seconds, a frame's time must come to a bin's start to count
 * as at or before it: `mediaTimeSeconds` are microseconds, and a bin's start
 * is computed, so equality between the two has to survive rounding.
 */
const TIME_EPS_S = 1e-9;

/**
 * How far past `clipDurationS` a frame's media time may be, seconds, and still
 * be read as the clip's: rounding between the duration the browser reports and
 * the times its frames carry, not a clip longer than the duration.
 */
const CLIP_END_TOLERANCE_S = 0.001;

/** A time in seconds as a refusal names it: to the microsecond, as media times are. */
const seconds = (s) => `${+s.toFixed(6)} s`;

/**
 * Every frame's time on one timeline, seconds: loop *k* adds *k*·D to its
 * media time, D being `clipDurationS`, and a loop is counted at each wrap
 * (media time going back, {@link isLoopWrap}). The first frame is in loop 0
 * whatever its media time: a run that starts mid-clip has a first pass that is
 * only part of one. `frames` in the order they were processed.
 *
 * A D shorter than the clip would lay each loop over the next, and a share read
 * on that timeline would look whole while it is not the run's, so it is
 * refused, in one line naming the frame, its media time and D: a `RangeError`
 * when a frame's media time is past D by more than 1 ms, or when a frame's
 * unwrapped time comes before the frame's before it. A frame past D by at most
 * 1 ms — rounding between the duration and the frames' times — stands at D, so
 * the next loop's first frame, at k·D, does not come before it, whichever
 * frames the run's schedule processed. A media time that is not a finite number
 * has no place on the timeline, and is refused in the same way. What unwraps
 * through this — {@link countedLoopFrames}, {@link trackTimeShare},
 * `summarizeRun` with `loops` — refuses with it.
 */
export function unwrapMediaTimes(frames, clipDurationS) {
    checkClipDuration(clipDurationS);
    const D = seconds(clipDurationS);
    const overlaps = "a duration shorter than the clip lays its loops over each other";
    let loop = 0;
    let previous = -Infinity;
    return frames.map((f, i) => {
        const m = f.mediaTimeSeconds;
        if (!Number.isFinite(m)) {
            throw new RangeError(
                `frame ${i}: media time ${String(m)} is not a finite number of seconds: it has no place on the run's timeline`,
            );
        }
        if (m > clipDurationS + CLIP_END_TOLERANCE_S) {
            throw new RangeError(
                `frame ${i}: media time ${seconds(m)} is past clipDurationS ${D} by more than 1 ms: ${overlaps}`,
            );
        }
        if (i > 0 && isLoopWrap(frames[i - 1], f)) loop++;
        // Up to 1 ms past D, a frame stands at D: the tolerance holds across the wrap after it.
        const t = loop * clipDurationS + Math.min(m, clipDurationS);
        if (t < previous) {
            throw new RangeError(
                `frame ${i}: media time ${seconds(m)} unwraps to ${seconds(t)}, before frame ${i - 1}'s ${seconds(previous)} (clipDurationS ${D}): ${overlaps}`,
            );
        }
        previous = t;
        return t;
    });
}

/** `clipDurationS`, `firstLoop` and `loopCount`, checked; the loops counted are `firstLoop` to `firstLoop + loopCount - 1`. */
function countedLoops({ clipDurationS, firstLoop = 1, loopCount = 4 }) {
    checkClipDuration(clipDurationS);
    refuseUnless(
        Number.isInteger(firstLoop) && firstLoop >= 0,
        `firstLoop must be a whole number ≥ 0, got ${firstLoop}`,
    );
    refuseUnless(
        Number.isInteger(loopCount) && loopCount >= 1,
        `loopCount must be a whole number ≥ 1, got ${loopCount}`,
    );
    return { firstLoop, loopCount };
}

/**
 * The frames of the counted loops, in the order they were processed: those
 * whose unwrapped time ({@link unwrapMediaTimes}) is in
 * [`firstLoop`·D, (`firstLoop` + `loopCount`)·D). A run starts at the clip's
 * first frame, so loop 0 is a warm-up that is not counted, and the loops
 * counted are 1 to 4 unless the caller says otherwise. See
 * {@link trackTimeShare} for why.
 */
export function countedLoopFrames(frames, options) {
    const { firstLoop, loopCount } = countedLoops(options);
    const D = options.clipDurationS;
    const t = unwrapMediaTimes(frames, D);
    const from = firstLoop * D;
    const to = (firstLoop + loopCount) * D;
    return frames.filter((_, i) => t[i] >= from && t[i] < to);
}

/**
 * The share of video time with a confirmed lock, over whole loops of the
 * clip, on a fixed grid of media time, so that every schedule is read over
 * the same video and at the same resolution rather than over its own: the
 * loops `firstLoop` to `firstLoop + loopCount − 1`, D (`clipDurationS`) long
 * each, on {@link unwrapMediaTimes}' timeline. Bin *j* of loop *k* starts at
 * *k*·D + *j*·`binMs`, and takes the state of the most recent processed frame
 * at or before its start — held across a loop wrap, so a loop's first bins
 * take the last frame of the loop before, and its edges are closed. TRACK
 * bins ÷ bins: a DETECT frame's pose is an unconfirmed detection, and counts
 * as no lock.
 *
 * `{ share, perLoop, binMs, loops: [first, last], complete }`; `perLoop` is
 * each counted loop's own share. `complete` is `false`, and `share` and
 * `perLoop` `null`, unless the grid has a frame behind every bin and the last
 * bin has its close: some frame at or before loop `firstLoop`'s first bin,
 * and some frame at or after the start of loop `firstLoop + loopCount` — for
 * the default 1 and 4, a run that recorded a frame of loop 5. A run that
 * starts mid-clip has no frame before loop 0, so it cannot count it.
 *
 * Deleting a frame whose state equals both its neighbours' cannot change the
 * share: the bins that took its state take a neighbour's, which is the same.
 * That is why a schedule that processes more frames — a worker's waiting
 * frames, which cannot change state — does not move it, where a per-frame
 * share moves with the schedule. The test file checks it on committed
 * exports; docs/benchmarks/2026-09-29-m3-lock-metric.md has the experiment.
 */
export function trackTimeShare(frames, options) {
    const { firstLoop, loopCount } = countedLoops(options);
    const D = options.clipDurationS;
    const binMs = options.binMs ?? 10;
    refuseUnless(positiveNumber(binMs), `binMs must be a positive number, got ${binMs}`);
    const loops = [firstLoop, firstLoop + loopCount - 1];
    const t = unwrapMediaTimes(frames, D);
    const complete =
        t.length > 0 &&
        t[0] <= firstLoop * D + TIME_EPS_S &&
        t[t.length - 1] >= (firstLoop + loopCount) * D;
    if (!complete) return { share: null, perLoop: null, binMs, loops, complete: false };
    const binsPerLoop = Math.ceil((D * 1000) / binMs - 1e-9);
    const perLoop = [];
    let trackBins = 0;
    let j = 0;
    for (let k = firstLoop; k < firstLoop + loopCount; k++) {
        let track = 0;
        for (let b = 0; b < binsPerLoop; b++) {
            const start = k * D + (b * binMs) / 1000;
            while (j + 1 < t.length && t[j + 1] <= start + TIME_EPS_S) j++;
            if (frames[j].state === "TRACK") track++;
        }
        perLoop.push(track / binsPerLoop);
        trackBins += track;
    }
    return { share: trackBins / (binsPerLoop * loopCount), perLoop, binMs, loops, complete: true };
}

/** The finite numbers among `values`: a record that lacks a timing is not a sample of it. */
const finite = (values) => values.filter(Number.isFinite);

const sum = (values) => values.reduce((a, b) => a + b, 0);

/** Whether `f` set a lock from a detection, `use` being {@link detectionUseOf} of it. */
function setsLock(f, use) {
    if (use === "internal") return f.state === "DETECT";
    if (use === "consumed") return f.state === "TRACK" || f.reason === "unconfirmed";
    return false;
}

/**
 * Every detection lock of `frames`, in the order set, by the one rule of
 * `DEFINITIONS.detectionLocks`: `{ consumed, step, detected, afterPose, atWrap }`.
 * `step` is the frame of the lock's first step: the lock's own frame for a
 * consumed detection, the next frame for the tracker's own if a tracking step
 * ran on it, else `null`. `detected` is the frame the detection was computed
 * on, `{ timestampMs, mediaTimeSeconds, framesAgo }`, `null` for a consumed
 * detection that names none. `afterPose` is whether an earlier frame had a
 * pose, `atWrap` whether the lock's frame is the first after a loop wrap.
 */
function detectionLockList(frames) {
    const locks = [];
    let hadPose = false;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const use = detectionUseOf(f);
        if (setsLock(f, use)) {
            const consumed = use === "consumed";
            const next = frames[i + 1];
            locks.push({
                consumed,
                step: consumed ? f : next?.tracking ? next : null,
                detected: consumed
                    ? (f.detectedAt ?? null)
                    : {
                          timestampMs: f.timestampMs,
                          mediaTimeSeconds: f.mediaTimeSeconds,
                          framesAgo: 0,
                      },
                afterPose: hadPose,
                atWrap: i > 0 && isLoopWrap(frames[i - 1], f),
            });
        }
        if (f.ok) hadPose = true;
    }
    return locks;
}

/** See `DEFINITIONS.detectionLocks`. `frames` in the order they were processed. */
export function detectionLocks(frames) {
    const out = { n: 0, confirmed: 0, refused: {}, reacquisitions: 0, reacquisitionsAtLoopWrap: 0 };
    for (const lock of detectionLockList(frames)) {
        if (lock.afterPose) {
            if (lock.atWrap) out.reacquisitionsAtLoopWrap++;
            else out.reacquisitions++;
        }
        if (!lock.step) continue;
        out.n++;
        if (lock.step.state === "TRACK") out.confirmed++;
        else out.refused[lock.step.trackLoss] = (out.refused[lock.step.trackLoss] ?? 0) + 1;
    }
    return out;
}

/**
 * See `DEFINITIONS.firstStepLatency`. `clipDurationS`, when given, is what a
 * loop wrap between a detection and its first step is unwrapped with, as
 * {@link unwrapMediaTimes} does. Without it, the locks with a wrap between
 * the two frames are left out of `videoMs` alone, and nothing throws: a
 * webcam run has no clip, and so no duration.
 */
export function firstStepLatency(frames, { clipDurationS = null } = {}) {
    if (clipDurationS !== null) checkClipDuration(clipDurationS);
    const ms = [];
    const videoMs = [];
    const processed = [];
    for (const { consumed, step, detected } of detectionLockList(frames)) {
        if (!step || !detected) continue;
        ms.push(step.timestampMs - detected.timestampMs);
        processed.push(consumed ? detected.framesAgo : detected.framesAgo + 1);
        let video = step.mediaTimeSeconds - detected.mediaTimeSeconds;
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
    // A job that never arrived has no latency: null would otherwise subtract as 0.
    const arrivals = jobs
        .filter((j) => Number.isFinite(j.postedAtMs) && Number.isFinite(j.arrivedAtMs))
        .map((j) => j.arrivedAtMs - j.postedAtMs);
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
    const fallback = fallbackFrames(frames, path, "summarizeRun");
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
        trackTimeShare: lock,
        detectionLocks: detectionLocks(frames),
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

/** Where a run's detection happens, as `?detection=` names it: see `DEFINITIONS.detectionPath`. */
export const DETECTION_PATHS = Object.freeze(["sync", "worker"]);

/** The counts a detection policy keeps (`detection-policy.mjs`), whole numbers all. */
const ACCOUNTING_COUNTS = Object.freeze([
    "requests",
    "posted",
    "consumptions",
    "ignored",
    "dropped",
    "discardedAtStop",
]);

/**
 * Whether `acc`, a worker run's detection accounting, is what the policy
 * guarantees, as one line saying what is not, or `null` when it is: every
 * count a whole number ≥ 0, `requests = consumptions + dropped +
 * discardedAtStop`, and `ignored = 0` (`DEFINITIONS.detectionAccounting`). An
 * ignored detection is reported before the imbalance it causes: the request
 * it leaves unresolved is the symptom, not the defect.
 */
export function accountingError(acc) {
    for (const key of ACCOUNTING_COUNTS) {
        const n = acc?.[key];
        if (!(Number.isInteger(n) && n >= 0)) {
            return `detection accounting: ${key} is ${String(n)}, not a whole number ≥ 0`;
        }
    }
    if (acc.ignored !== 0) {
        const n = acc.ignored;
        return `${n} ${n === 1 ? "detection was" : "detections were"} handed in while a lock held (ignored), where the policy allows none`;
    }
    if (acc.requests !== acc.consumptions + acc.dropped + acc.discardedAtStop) {
        return `detection accounting does not balance: requests ${acc.requests} ≠ consumptions ${acc.consumptions} + dropped ${acc.dropped} + discardedAtStop ${acc.discardedAtStop}`;
    }
    return null;
}

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
 *
 * Two more, for the tuning pass, and handled the other way: `?targetFile=`
 * (a candidate `.wnft` under `examples/targets/tuning/`, which is never
 * committed, in place of `targets/pinball.wnft`) and `?tracker=` (tracker
 * option overrides, {@link parseTrackerOverrides}). One of those out of its
 * domain is **not** dropped: it goes in `paramErrors`, which the page shows
 * and refuses to start on. Dropping it would run the defaults under a URL
 * that names a candidate — an export labelled with parameters it did not run
 * with, the one failure a tuning round cannot afford.
 *
 * The worker path's three are handled the same way, for the same reason: a
 * run that fell back to `sync` under a URL that asked for the worker would be
 * exported as what it was not. `?detection=` is one of
 * {@link DETECTION_PATHS} and is `"sync"` when absent, and `?loops=` (the
 * clip loops a run lasts) and `?run=` (its place in the session's order) are
 * positive integers, `null` when absent; one present and unreadable goes in
 * `paramErrors`.
 */
export function parseRunParams(search, { bundledClips }) {
    const p = new URLSearchParams(search);
    const mode = MODES.includes(p.get("mode")) ? p.get("mode") : null;
    const t = p.get("target");
    const windowSize = parsePositiveInt(p.get("window"));
    const camera = p.get("camera");
    const paramErrors = [];
    const rawFile = p.get("targetFile");
    let targetFile = null;
    if (rawFile !== null) {
        if (TUNING_TARGET.test(rawFile)) targetFile = rawFile;
        else
            paramErrors.push(
                `?targetFile=${rawFile}: a candidate target must be tuning/<name>.wnft, one file directly under examples/targets/tuning/.`,
            );
    }
    const overrides = parseTrackerOverrides(p.get("tracker"));
    if (!overrides.ok) paramErrors.push(`?tracker=: ${overrides.error}`);
    const rawDetection = p.get("detection");
    let detection = "sync";
    if (rawDetection !== null) {
        if (DETECTION_PATHS.includes(rawDetection)) detection = rawDetection;
        else
            paramErrors.push(
                `?detection=${rawDetection}: expected ${DETECTION_PATHS.join(" or ")}`,
            );
    }
    const positive = (name) => {
        const raw = p.get(name);
        // Not floored: ?loops=4.7 is present but unreadable, never 4 loops.
        const n = Number.isInteger(Number(raw)) ? parsePositiveInt(raw) : null;
        if (raw !== null && n === null)
            paramErrors.push(`?${name}=${raw}: expected a positive integer`);
        return n;
    };
    const loops = positive("loops");
    const run = positive("run");
    return {
        maxKeypoints: parsePositiveInt(p.get("maxKeypoints")),
        procWidth: parsePositiveInt(p.get("procWidth")),
        procHeight: parsePositiveInt(p.get("procHeight")),
        camera: camera === "front" ? "user" : camera === "rear" ? "environment" : null,
        mode,
        target: t === "image" || t === "wnft" ? t : mode === "tracking" ? "wnft" : null,
        windowSize: windowSize === null ? null : Math.min(2000, Math.max(10, windowSize)),
        clip: bundledClips.includes(p.get("clip")) ? p.get("clip") : null,
        targetFile,
        trackerOverrides: overrides.ok ? overrides.options : {},
        detection,
        loops,
        run,
        paramErrors,
    };
}

/**
 * A candidate target's path under `examples/targets/`: `tuning/<name>.wnft`,
 * one plain file name, no directory and no leading dot, so the page can only
 * fetch from the git-ignored scratch directory.
 */
const TUNING_TARGET = /^tuning\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.wnft$/;

/**
 * The `NftTracker` options a tuning run may override: the tracking state's,
 * every one. The detection options are not here — the page sets
 * `maxSceneKeypoints` from `?maxKeypoints=`, and the rest are not what the
 * tuning pass tunes. Domains are the tracker's, checked by its constructor,
 * which throws a `RangeError` naming the option; this only reads the text.
 */
export const TUNABLE_TRACKER_OPTIONS = Object.freeze([
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
]);

const integerFrom = (lo, hi = Infinity) => ({
    test: (v) => Number.isInteger(v) && v >= lo && v <= hi,
    text: hi === Infinity ? `an integer ≥ ${lo}` : `an integer in [${lo}, ${hi}]`,
});
const POSITIVE = { test: (v) => v > 0, text: "finite and > 0" };
const FRACTION = { test: (v) => v >= 0 && v < 1, text: "in [0, 1)" };

/**
 * Each numeric override's domain, as `NftTracker`'s constructor checks it
 * (`resolveTrackingOptions` in packages/nft-tracker/src/tracker.ts). Checked
 * here too so the page refuses Start before any source starts, in every mode:
 * left to the tracker, a value out of its domain started the clip before the
 * constructor threw, and a stateless run ignored it silently.
 */
const OVERRIDE_DOMAINS = Object.freeze({
    maxFrameLevels: integerFrom(1, 256),
    alignMaxIterations: integerFrom(1),
    alignEpsilon: POSITIVE,
    tukeyC: POSITIVE,
    fitMaxIterations: integerFrom(1),
    fitEpsilon: POSITIVE,
    minTrackedPatches: integerFrom(4),
    maxOutlierShare: FRACTION,
    maxFitRms: POSITIVE,
    minPatchZncc: FRACTION,
});

/**
 * Tracker option overrides from `key:value` pairs separated by commas —
 * `minTrackedPatches:6,alignEpsilon:0.03` — as the page's `?tracker=` and the
 * replay's `--options` take them: `{ ok: true, options }`, empty for no text,
 * or `{ ok: false, error }` naming the first thing wrong. Keys are
 * {@link TUNABLE_TRACKER_OPTIONS}; values are numbers in the tracker's own
 * domain for that option, and `true` or `false` for `photometric`.
 */
export function parseTrackerOverrides(raw) {
    const options = {};
    if (raw === null || raw === undefined || String(raw).trim() === "") return { ok: true, options };
    for (const part of String(raw).split(",")) {
        const pair = part.trim();
        const colon = pair.indexOf(":");
        if (colon < 0) return { ok: false, error: `"${pair}" is not key:value` };
        const key = pair.slice(0, colon).trim();
        const text = pair.slice(colon + 1).trim();
        if (!TUNABLE_TRACKER_OPTIONS.includes(key)) {
            return {
                ok: false,
                error: `unknown option "${key}"; one of ${TUNABLE_TRACKER_OPTIONS.join(", ")}`,
            };
        }
        if (Object.hasOwn(options, key)) return { ok: false, error: `"${key}" given twice` };
        if (key === "photometric") {
            if (text !== "true" && text !== "false") {
                return { ok: false, error: `photometric is true or false, got "${text}"` };
            }
            options[key] = text === "true";
            continue;
        }
        const value = text === "" ? NaN : Number(text);
        if (!Number.isFinite(value)) {
            return { ok: false, error: `${key}: "${text}" is not a finite number` };
        }
        const domain = OVERRIDE_DOMAINS[key];
        if (!domain.test(value)) {
            return { ok: false, error: `${key} must be ${domain.text}, got ${text}` };
        }
        options[key] = value;
    }
    return { ok: true, options };
}

/**
 * The committed target, as the page names it: the file a run loads with no
 * `?targetFile=`, and the one a session run tracks ({@link sessionRunGaps}).
 */
export const DEFAULT_TARGET_FILE = "targets/pinball.wnft";

/**
 * Why `NftTracker` would run detection-only on `db` — the constructor's rule:
 * no patches, patches under 3 × 3, or fewer than `minTrackedPatches` — or
 * `null` when it would track. The page checks this before starting a
 * tracking run, so a run is never exported as tracking while it detects.
 */
export function trackabilityError(db, minTrackedPatches) {
    const p = db.patches;
    const use = `choose ${DEFAULT_TARGET_FILE}`;
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
 * track (`trackabilityError`). Checked before any source starts. `file` is
 * the target file the page tried to load, for the message.
 *
 * Three more refusals for the worker's run parameters, none of which applies
 * to a caller that passes none of them: `detection` `"worker"` outside the
 * tracking mode, or on a `target` that is not the `.wnft` (its
 * `record.source`, from {@link targetRecord}: the worker decodes the file's
 * bytes, and the page's built image target has none); and `loops` on a
 * `source` (the media source, `"webcam"` among them) that does not loop.
 */
export function startRefusal({
    mode,
    target,
    minTrackedPatches,
    file = DEFAULT_TARGET_FILE,
    detection = "sync",
    source = null,
    loops = null,
}) {
    if (!MODES.includes(mode)) return `Unknown mode "${mode}": choose one of ${MODES.join(", ")}.`;
    if (!target) return `${file} is not loaded (see above).`;
    if (detection === "worker") {
        if (mode !== "tracking") return "?detection=worker runs in tracking mode only.";
        if (target.record?.source !== "wnft") {
            return "?detection=worker needs the .wnft target: the worker decodes its bytes.";
        }
    }
    if (loops !== null && source === "webcam") return "?loops= needs a looping clip, not the webcam.";
    return mode === "tracking" ? trackabilityError(target.db, minTrackedPatches) : null;
}

/**
 * Why a session run may not start on what the server serves, in one line, or
 * `null` (#110, §5). `manifest` is `examples/dist/provenance.json` as fetched
 * at Start (`null` when it could not be read); `observed` is what the page saw
 * then: `manifestChanged` (its bytes differ from the copy fetched at page
 * load), `bundleSha256` and `served` (`{ path: sha256 }`: the bytes the server
 * served at Start, not necessarily those the page loaded), and `loaded` (the
 * repository paths of the modules the page and the worker observed themselves
 * loading). Outside a session run nothing refuses: the export only records it.
 */
export function provenanceRefusal(manifest, observed, { sessionRun }) {
    if (!sessionRun) return null;
    if (!manifest) return "No provenance manifest (examples/dist/provenance.json): run `npm run build`.";
    if (observed.manifestChanged) return "The provenance manifest changed since the page loaded: reload the page.";
    const reasons = [];
    if (manifest.clean !== true) reasons.push(`built from a dirty tree (${(manifest.dirtyPaths ?? []).join(", ")})`);
    if (observed.bundleSha256 !== manifest.bundle?.sha256) reasons.push(`the served bundle is not the one built`);
    const served = manifest.served ?? {};
    const stale = Object.keys(served).filter((p) => observed.served?.[p] !== served[p].sha256);
    if (stale.length > 0) reasons.push(`served files differ from the build: ${stale.join(", ")}`);
    const unlisted = (observed.loaded ?? []).filter((p) => p !== manifest.bundle?.path && !(p in served));
    if (unlisted.length > 0) reasons.push(`modules loaded that the manifest does not list: ${unlisted.join(", ")}`);
    if (reasons.length === 0) return null;
    return `Not a session run's code: ${reasons.join("; ")}. Commit, run \`npm run build\`, and reload.`;
}

/**
 * Why `scripts/replay-clips.mjs --sequence` cannot replay export `e`, in one
 * line, or `null` when it can: it must be a tracking run on one of `clips`,
 * with this module's `metricsVersion`, the replay's target (`sha256`) and a
 * recorded processing size, and its detection must have run on the frame loop
 * (`detection.path` not `"worker"`): a worker run's frames wait for detections
 * the sequence replay never hands in, so it would answer the frames the
 * worker's detection locked with `no-detection`.
 */
export function sequenceRefusal(e, { metricsVersion, sha256, clips }) {
    if (e?.mode !== "tracking") return `it is a ${e?.mode ?? "(no mode)"} run, not a tracking run`;
    if (e.detection?.path === "worker") {
        return "it is a worker-detection run, whose frames wait for detections this replay does not hand in";
    }
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

/**
 * The detection path a page export ran on: its `detection.path`, and `"sync"`
 * for one older than the worker path, which all detected on the frame loop.
 */
export function exportDetectionPath(e) {
    return e?.detection?.path ?? "sync";
}

/** A session run's counted loops: loop 0 warms up, and loops 1 to 4 are read (docs/benchmarks/README.md). */
export const SESSION_LOOPS = Object.freeze({ firstLoop: 1, loopCount: 4 });

/**
 * What keeps page export `e` from being a run of the device session
 * (docs/benchmarks/README.md, "2026-09-29 — M3: detection off the frame,
 * measured", "A device session"), one line each, or `[]` when nothing does. The
 * page records the answer in the export (`protocol`, `DEFINITIONS.protocol`) and
 * exports a run with gaps all the same, since an exploratory run is legitimate;
 * `scripts/replay-clips.mjs --transfer` reads a session's runs, and no other.
 *
 * A session run is a tracking or a stateless run of a bundled clip, over one
 * warm-up loop and {@link SESSION_LOOPS}' counted ones, with its place in the
 * session's order (`run.order`), that ended itself (`run.endedBy` `done`) with
 * every frame it processed still in its window (`ticks`, a whole number, equal
 * to `windowSize`); it records its detection path (`detection.path`, sync or
 * worker: an export without one is not read as a synchronous run's here); a
 * tracking run's lock was read over its counted loops whole
 * (`trackTimeShare.complete`), and a worker run's accounting holds
 * ({@link accountingError}). And it ran at the page's defaults, read from the
 * export's own `target`, `tracker`, `maxKeypoints` and `processingBox`: the
 * committed target, loaded; no tracker option overridden
 * ({@link TUNABLE_TRACKER_OPTIONS}, `?tracker=`); the default scene keypoint
 * budget and processing box. What the export does not record is a gap, never a
 * pass.
 *
 * `defaults` is `{ targetFile, processingBox, maxKeypoints, trackerOptions }`,
 * which the page builds from its own constants and the tracker's `DEFAULT_*`:
 * this module imports no package (the worker's core imports it, and imports
 * none), so the tracker's defaults reach it from its caller, never as copies. A
 * default the caller does not give — any of the four, a box's side, a tunable
 * option — throws a `TypeError` naming it: compared with an export that lacks
 * the same field, an absent default would pass it.
 */
export function sessionRunGaps(e, defaults) {
    const missing = [];
    if (typeof defaults?.targetFile !== "string") missing.push("targetFile");
    if (defaults?.processingBox == null) missing.push("processingBox");
    else {
        for (const side of ["width", "height"]) {
            if (!Number.isFinite(defaults.processingBox[side])) missing.push(`processingBox.${side}`);
        }
    }
    if (!Number.isFinite(defaults?.maxKeypoints)) missing.push("maxKeypoints");
    if (defaults?.trackerOptions == null) missing.push("trackerOptions");
    else {
        for (const key of TUNABLE_TRACKER_OPTIONS) {
            if (defaults.trackerOptions[key] == null) missing.push(`trackerOptions.${key}`);
        }
    }
    if (missing.length > 0) {
        throw new TypeError(
            `sessionRunGaps needs the page's defaults: ${missing.join(", ")} missing ({ targetFile, processingBox, maxKeypoints, trackerOptions })`,
        );
    }
    const gaps = [];
    const shown = (v) => (v === null || v === undefined ? "none" : v);
    const mode = e?.mode;
    if (mode !== "tracking" && mode !== "stateless") {
        gaps.push(`mode ${shown(mode)}: a session run is a tracking or a stateless run`);
    }
    if (e?.source !== "bundled") {
        gaps.push(`source ${shown(e?.source)}: a session run plays a bundled clip (?clip=)`);
    } else if (!e.bundledClip) {
        gaps.push("source bundled, no clip named: a session run plays a bundled clip (?clip=)");
    }
    const { firstLoop, loopCount } = SESSION_LOOPS;
    const loops = e?.loops;
    if (loops?.firstLoop !== firstLoop || loops?.loopCount !== loopCount) {
        const read = loops ? `${loops.firstLoop}–${loops.firstLoop + loops.loopCount - 1}` : "none";
        gaps.push(
            `loops ${read}: a session run counts loops ${firstLoop}–${firstLoop + loopCount - 1} after its warm-up (?loops=${loopCount})`,
        );
    }
    const order = e?.run?.order;
    if (!(Number.isInteger(order) && order >= 1)) {
        gaps.push(`run.order ${shown(order)}: a session run has its place in the session's order (?run=)`);
    }
    if (e?.run?.endedBy !== "done") {
        gaps.push(
            `run.endedBy ${shown(e?.run?.endedBy)}: a session run ends itself on the first frame after its counted loops (done)`,
        );
    }
    // Both absent would compare equal: the evidence that no frame was lost must be there.
    if (!(Number.isInteger(e?.ticks) && e.ticks === e?.windowSize)) {
        gaps.push(
            `the window kept ${shown(e?.windowSize)} of ${shown(e?.ticks)} frames: a session run keeps every frame it processed (?window=2000)`,
        );
    }
    if (mode === "tracking" && e?.runSummary?.trackTimeShare?.complete !== true) {
        gaps.push(
            "trackTimeShare is not complete: a tracking run's lock is read over its counted loops whole",
        );
    }
    // Not exportDetectionPath's reading of an older export: a worker export that lost its
    // detection record would be read as synchronous, and skip its accounting.
    const path = e?.detection?.path;
    if (!DETECTION_PATHS.includes(path)) {
        gaps.push(
            `detection.path ${shown(path)}: a session run records its detection path, sync or worker`,
        );
    }
    if (path === "worker") {
        const acc = e.detection?.accounting;
        const why =
            acc == null
                ? "detection accounting none: a worker run's accounting is asserted, and it records none"
                : accountingError(acc);
        if (why) gaps.push(why);
    }
    if (e?.target?.source !== "wnft" || e.target.file !== defaults.targetFile) {
        gaps.push(
            `target ${shown(e?.target?.file)}: a session run tracks ${defaults.targetFile}, loaded (no ?targetFile=)`,
        );
    }
    if (mode === "tracking") {
        const options = e?.tracker?.options;
        if (!options) {
            gaps.push("tracker options none: a tracking run records the options it ran with");
        } else {
            for (const key of TUNABLE_TRACKER_OPTIONS) {
                const d = defaults.trackerOptions[key];
                if (options[key] !== d) {
                    gaps.push(
                        `tracker option ${key} ${shown(options[key])}, not its default ${d}: a session run uses the tracker's defaults (no ?tracker=)`,
                    );
                }
            }
        }
    }
    if (e?.maxKeypoints !== defaults.maxKeypoints) {
        gaps.push(
            `maxKeypoints ${shown(e?.maxKeypoints)}, not the page's default ${defaults.maxKeypoints}: a session run uses it (no ?maxKeypoints=)`,
        );
    }
    const box = e?.processingBox;
    const d = defaults.processingBox;
    if (box?.width !== d.width || box?.height !== d.height) {
        gaps.push(
            `processingBox ${box ? `${box.width}×${box.height}` : "none"}, not the page's default ${d.width}×${d.height}: a session run uses it (no ?procWidth= or ?procHeight=)`,
        );
    }
    return gaps;
}

/**
 * Why `scripts/replay-clips.mjs --transfer` reads nothing from export `e`, or
 * `null` when it reads it: a page's export of a tracking run on one of
 * `clips`, that ran on one of the detection paths. Not the replay's own
 * exports (`kind: "replay"`, whose timings are modelled, not measured), and
 * not a stateless or detection-only run, which a session also exports.
 */
function transferSkip(e, clips) {
    if (!Array.isArray(e?.frames)) return "not a page export: it has no frames";
    if (e.kind === "replay") return "a replay's export, not a page's";
    if (e.mode !== "tracking") return `a ${e.mode ?? "(no mode)"} run, not a tracking run`;
    if (e.source !== "bundled" || !clips.includes(e.bundledClip)) {
        return `it did not run on a bundled clip (source ${e.source}, clip ${e.bundledClip ?? "(none)"})`;
    }
    const path = exportDetectionPath(e);
    if (!DETECTION_PATHS.includes(path)) return `its detection path ${path} is neither sync nor worker`;
    return null;
}

/**
 * What one mode's page exports of a clip measured, pooled: the latency samples
 * a detection takes in that mode, the acquisition a frame costs it, and the
 * tracking step. `named` are `{ name, e }` of one `path`.
 *
 * - `latencyMs`: the worker's `arrivedAtMs − postedAtMs` over the jobs that
 *   came back (a job that never did has none); the synchronous mode's, the
 *   sum of the `DETECTION_STAGES` timings of each frame that ran the tracker's
 *   own detection (`detectionUse` internal, as {@link framesForStage} reads
 *   it). Both are counted from the end of the detected frame's main-thread
 *   work, which is where the replay's post is.
 * - `acquireMs`: the p50 of `acquire` + `gray` over the frames that are not
 *   TRACK.
 * - `stepMs`: the p50 of `trackerTimings.trackMs` over TRACK frames, the
 *   `trackStepMs` definition.
 *
 * Every frame and job of every export is read, the warm-up loop's included.
 * A quantity that has no sample is `null`, and its statistics are.
 */
function transferProfile(path, named) {
    const latencyMs = [];
    const acquire = [];
    const steps = [];
    for (const { e } of named) {
        if (path === "worker") {
            for (const job of e.detection?.jobs ?? []) {
                if (Number.isFinite(job.postedAtMs) && Number.isFinite(job.arrivedAtMs)) {
                    latencyMs.push(job.arrivedAtMs - job.postedAtMs);
                }
            }
        }
        for (const f of e.frames) {
            if (path === "sync" && detectionUseOf(f) === "internal") {
                const stages = finite(DETECTION_STAGES.map((stage) => f.timings?.[stage]));
                if (stages.length > 0) latencyMs.push(sum(stages));
            }
            if (f.state === "TRACK") {
                steps.push(f.trackerTimings?.trackMs);
            } else {
                acquire.push((f.timings?.acquire ?? NaN) + (f.timings?.gray ?? NaN));
            }
        }
    }
    return {
        path,
        files: named.map(({ name }) => name),
        latencyMs,
        latency: stats(latencyMs),
        acquireMs: stats(finite(acquire)).p50,
        stepMs: stats(finite(steps)).p50,
    };
}

/**
 * What `scripts/replay-clips.mjs --transfer` replays, from the page exports of a
 * session: `files` are `{ name, e }`, and `clips` the bundled clips (in the
 * order they are replayed) and `sha256` the target the replay runs. Returns
 * `{ clips, skipped, refusal }`. `clips` has, for each clip with an export,
 * its `sync` and `worker` profile (`transferProfile`): `{ path, files,
 * latencyMs, latency, acquireMs, stepMs }`. A clip with no export is not
 * replayed, and is no refusal. `skipped` are the files nothing is read from,
 * `{ name, why }` ({@link transferSkip}). `refusal` is one line, or `null`
 * when the plan can be replayed, and is read in this order, so that what is
 * wrong with a directory is named before what is wrong with its contents:
 *
 * 1. a clip with exports of one path only, or no clip with any, has nothing
 *    to transfer between;
 * 2. an export of another target (`target.sha256`, none in an older export):
 *    the session's latencies are those of the pipeline on its target;
 * 3. a worker export whose `detection.accounting` fails {@link accountingError},
 *    or that records none: checked again on reading, as the page checked it
 *    before exporting, since a session holding an invalid run is an invalid
 *    session, not a directory with a file to skip;
 * 4. an export, of either path, that the page did not record as a session run
 *    (`protocol.sessionRun` not `true`, {@link sessionRunGaps}), named with the
 *    gaps it recorded, or that has no `protocol` record at all: the transfer
 *    replays what the session ran, and a run outside its protocol is not that;
 * 5. a mode with no latency sample, no acquisition or no step to replay with.
 */
export function transferPlan(files, { clips, sha256 }) {
    const skipped = [];
    const byClip = new Map(clips.map((clip) => [clip, { sync: [], worker: [] }]));
    for (const file of files) {
        const why = transferSkip(file.e, clips);
        if (why) skipped.push({ name: file.name, why });
        else byClip.get(file.e.bundledClip)[exportDetectionPath(file.e)].push(file);
    }
    const refuse = (refusal) => ({ clips: [], skipped, refusal });
    const present = [...byClip].filter(([, { sync, worker }]) => sync.length + worker.length > 0);
    if (present.length === 0) {
        return refuse(
            `no worker and sync exports of any clip (${files.length} files read, none a tracking export of a bundled clip)`,
        );
    }
    for (const [clip, { sync, worker }] of present) {
        if (sync.length === 0 || worker.length === 0) {
            return refuse(
                `${clip}: no worker and sync exports to transfer between (worker ${worker.length}, sync ${sync.length})`,
            );
        }
    }
    for (const [clip, { sync, worker }] of present) {
        for (const { name, e } of [...worker, ...sync]) {
            if (e.target?.sha256 !== sha256) {
                return refuse(
                    `${clip}: ${name} names target sha256 ${e.target?.sha256 ?? "(none)"}, not ${sha256} (the replay's target)`,
                );
            }
        }
    }
    for (const [clip, { worker }] of present) {
        for (const { name, e } of worker) {
            const acc = e.detection?.accounting;
            const why = acc == null ? "it records no detection accounting" : accountingError(acc);
            if (why) return refuse(`${clip}: ${name} is not a valid worker run: ${why}`);
        }
    }
    for (const [clip, { sync, worker }] of present) {
        for (const { name, e } of [...worker, ...sync]) {
            const protocol = e.protocol;
            if (protocol == null) return refuse(`${clip}: ${name} is not a session run (no protocol record)`);
            if (protocol.sessionRun !== true) {
                const gaps =
                    Array.isArray(protocol.gaps) && protocol.gaps.length > 0
                        ? protocol.gaps.join("; ")
                        : "its protocol record names no gap";
                return refuse(`${clip}: ${name} is not a session run: ${gaps}`);
            }
        }
    }
    const planned = [];
    for (const [clip, named] of present) {
        const profiles = {
            clip,
            sync: transferProfile("sync", named.sync),
            worker: transferProfile("worker", named.worker),
        };
        for (const path of ["worker", "sync"]) {
            const p = profiles[path];
            const lacks =
                p.latencyMs.length === 0
                    ? `no detection latency to draw from (${path === "worker" ? "no job that arrived" : "no frame that ran the tracker's own detection"})`
                    : p.acquireMs === null
                      ? "no acquisition (no acquire + gray timing on a frame that is not TRACK)"
                      : p.stepMs === null
                        ? "no tracking step (no trackerTimings.trackMs on a TRACK frame)"
                        : null;
            if (lacks) return refuse(`${clip}: the ${path} exports (${p.files.join(", ")}) give ${lacks}`);
        }
        planned.push(profiles);
    }
    return { clips: planned, skipped, refusal: null };
}
