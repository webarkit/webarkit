/*
 *  bench-definitions.mjs
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
 * What each exported metric means, in the words the page shows and every
 * export carries, and the constants those words name.
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, under the same name.
 */

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

/** The bin `trackTimeShare` reads the lock on, ms, unless its caller gives another (`binMs`). */
export const TRACK_TIME_BIN_MS = 10;

/** What each exported metric means, in the words the page shows and every export carries. */
export const DEFINITIONS = Object.freeze({
    frames: "Frames in the window: the last windowSize ticks of the run, one per video frame the page processed. A run summarized over its counted loops (summarizeRun's loops) has the frames of those loops instead, and every key below reads them, except trackTimeShare, which reads all the run's frames, and detectionAccounting, which counts the whole run.",
    states: "Frames per state. NftTracker's result.state; the stateless pipeline has no tracker, and its frames are DETECT with a pose and LOST without one, as a detection-only tracker's are for the same frame (M1).",
    trackShare:
        "TRACK frames ÷ frames. Counted per processed frame: a TRACK frame costs less than a DETECT frame, so more of them fit in a second of video.",
    loopWraps:
        "Frames whose mediaTimeSeconds is lower than the frame's before as the clip restarting: the video looped between the two. A step back is a wrap only when the frame is within 0.5 s of the clip's start and, read with the clip's duration (clipDurationS, whenever the run records one), the video skipped across the wrap, from the frame before to the clip's end and from its start to the frame, is at most 0.5 s; read without one, the step goes back more than 0.5 s. Any other step back, a stutter, a decoder hiccup or a seek, is refused, not counted (#96). A webcam has none.",
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
        "How a run ended, in the export's run record beside order, startedAtIso and endedAtIso: done (a ?loops= run, on its first frame after its counted loops), stopped (Stop) or failed (the run could not go on; a worker run that failed is not exported). A run that failed is failed whatever ended it first, its own end included; so is a worker run whose worker failed after the run had ended, since the run cannot then show it was clean.",
    failure:
        "In the export's run record: why the run could not go on, the one-line cause the page showed (naming the frame for a throw in a frame's callback), or null. Only a synchronous run that failed is exported with one (a worker run that failed is not exported), and its endedBy is then failed.",
    lostVisibility:
        "In the export's run record: whether the page was hidden (document.visibilityState) at any point from Start to the run's end. A hidden tab throttles timers and requestAnimationFrame, so its frames are not the foreground's. Reported, not gating: no refusal rests on it, and sessionRunGaps does not read it (#110, A4). Absent in older exports.",
    protocol:
        "{ sessionRun, gaps }: whether the run followed the device session's protocol (docs/benchmarks/README.md, 2026-09-29), and what keeps it from it, one line each (sessionRunGaps): a tracking or stateless run of a bundled clip, over one warm-up loop and loops 1 to 4 counted (loops), with its place in the session's order (run.order), that ended itself (run.endedBy done) and did not fail (run.failure null, whatever endedBy says; a run record without the field is a gap) with every frame it processed in its window (ticks, a whole number, = windowSize), recording its detection path (detection.path sync or worker); in the tracking mode its lock read over those loops whole (trackTimeShare.complete), in a worker run its accounting holding (detectionAccounting); at the page's defaults: the committed target, loaded, no tracker option overridden (?tracker=), the default scene keypoint budget and processing box. What the export does not record is a gap, never a pass. The page exports a run with gaps all the same, and says so; replay-clips --transfer reads only session runs.",
    provenance:
        "{ manifest, observed, refusal, note }: what the page checked at Start against examples/dist/provenance.json, the manifest npm run build writes (scripts/build-provenance.mjs, #110). manifest: as fetched at Start (HEAD, null when built where git could not describe the tree, which a session run refuses; clean, each tracked input's SHA-256 and git blob id, each served file's side (page, worker, both, or bundled), the shared bundle's hash, jsfeat-next's lockfile entry and file hash, and build: the build's own script, scripts/build-provenance.mjs, and the root package.json, each with its SHA-256 and git blob id, which attest an accidental change only; Start checks neither file, since neither is served; absent in manifests older than #127), null when it could not be read. observed: the manifest's SHA-256 at Start and at page load (manifestSha256, manifestSha256AtLoad), the SHA-256 of the bytes the server served at Start for the bundle and each served file (not necessarily the bytes the page loaded earlier: a fetch cannot see what the module loader executed), whether the manifest changed since page load (manifestChanged), and the modules in the page's resource timeline, where Chrome records the worker's imports too (loaded: which URLs, not which bytes; a session run in which the bundle, a page-side module, or in a worker run a worker-side module is missing from it is refused, since the check would be blind), unfetched (the page and the listed modules whose body did not cross the network: a cache hit, transferSize 0 or absent, or a 304 revalidation, which can be validated by date and so does not prove the bytes; what ran is unknown), timelineFull (the resource-timing buffer overflowed, so later loads went unrecorded); each of these blind conditions refuses a session run. And cacheControl (the Cache-Control header of each response the check fetched): a response without no-store refuses a session run, since the browser may store it and run it later. refusal: provenanceRefusal's one line, or null. In a session run (?loops= or ?run=) Start refuses on it; otherwise it is only recorded. note: provenanceFindings' one line, written for every run, exploratory ones included, whenever the check found anything (no manifest, a dirty tree, a head, a clean flag or a dirtyPaths no build writes, a mismatch, an unlisted, unseen or cached module, a full timeline, a cacheable response), each finding with its own remedy; else null. Reported, not gating: sessionRunGaps does not read it, and an export without it is not a gap. Absent in exports older than #110, whose worker runs carry detection.workerBundleSha256 instead.",
    detectionAccounting:
        "A worker run's detection requests and what became of each, counted over the whole run, not the window: requests (results that said needsDetection) = consumptions (detections handed to process and used) + dropped (requests made while a detection was in flight or held) + discardedAtStop (a detection in flight, or held, at Stop), and ignored (detections handed in while a lock held) = 0; posted counts the requests that started a job. accountingError checks both, and a run that fails either is not exported. In the summary the accounting is carried as given, with error: accountingError's line saying what is wrong, or null when nothing is; the summary has null for a run that gave none.",
    detectionUseFallbackFrames:
        "The summarized frames without a detectionUse (absent or null), which every metric that reads it takes as M2's tracker did: detected on the frame loop unless TRACK. Every frame of an export older than the field, and of the stateless pipeline; 0 in a current tracking run. A worker run's waiting frames do not detect, so its summary is refused, not read, if it has any (summarizeRun's path).",
    staleReplies:
        "A worker run's replies from the worker to its own jobs that arrived after the run ended, discarded and never handed in. Each is to a job the run discarded at its end, already counted in discardedAtStop, and one per such job, whose record then carries lateReplyAtMs (the reply's arrival), so staleReplies ≤ discardedAtStop. Counted on the run the reply names, whenever it arrives, between runs or during a later run, never on another run; the export records the count as it stood when the export was taken. A reply naming a run the page never had, a job the run did not discard unanswered, or one whose late reply was already counted, fails the worker instead.",
    detectionUse:
        "Per frame, what became of detection, from NftTracker's result: needsDetection (the frame ended without a lock and the tracker has externalDetection: an application is asked for a detection), detectionUse (internal: the tracker detected on this frame; consumed: a detection computed elsewhere was handed to process and used; ignored: one was handed in while a lock held; none: neither; null: the stateless pipeline, and any export older than the field, which read as M2's tracker: its own detection on every frame that is not TRACK), detectionLatencyMs (this frame's timestamp minus the consumed detection's, else null), detectionInFlight (a worker's detection was in flight when process ran) and detectedAt ({ timestampMs, mediaTimeSeconds, framesAgo }, the frame the used detection was computed on: this frame, with framesAgo 0, for an internal one, and the frame the worker was given for a consumed one, framesAgo processed frames back; null when none was used).",
    trackTimeShare: `The share of video time with a confirmed lock, over whole loops of the clip, on a fixed grid of media time: { share, perLoop, binMs, loops: [first, last], complete }, from every frame's state and mediaTimeSeconds. Media time is unwrapped onto one timeline, loop k covering [k·D, (k + 1)·D), D being the clip's duration, and the run's first pass is loop 0, a warm-up that is not counted: loops 1 to 4 are. A D shorter than the clip would lay the loops over each other, so a frame whose media time is past D by more than 1 ms is refused, not read, as is a step back in media time that is not the clip restarting (loopWraps, read with D); one past D by at most 1 ms, rounding, stands at D, across the wrap after it too. A frame whose media time is not a finite number is refused. Bin j of loop k starts at k·D + j·binMs (binMs ${TRACK_TIME_BIN_MS}) and takes the state of the most recent processed frame at or before its start, held across a loop wrap; share = bins in TRACK ÷ all bins, and perLoop is each counted loop's own. A DETECT frame's pose is an unconfirmed detection and counts as no lock. It reads all the run's frames, not only the counted loops': the frame before a loop supplies the state its first bins take, and a frame of the loop after the last closes it. Deleting a frame whose state equals both its neighbours' cannot change it, so a schedule that processes more frames, a worker's waiting ones, does not move it as it moves trackShare, which counts processed frames. complete is false, and share and perLoop null, unless a frame stands at or before the first bin and one at or after the start of the loop after the last; a summary given no counted loops has null.`,
    detectionLocks:
        "{ n, confirmed, refused, reacquisitions, reacquisitionsAtLoopWrap }: the locks the tracker set from a detection, by one rule for the synchronous and the worker modes, from each frame's state, detectionUse, reason, tracking and trackLoss. A lock is set on a DETECT frame that ran the tracker's own detection (detectionUse internal; an export older than the field reads every DETECT frame so), and on a frame that consumed a detection (consumed) and is TRACK or has the reason unconfirmed. Its first step is the tracking step that carries the detection's pose to a frame: the next frame's (its tracking not null) after the tracker's own detection, the same frame's after a consumed one. n: the locks whose first step is in the window; confirmed: those whose first step returned TRACK; refused: the rest, per that step's trackLoss (in a worker run, the stale refusals), a step that records none under (none), which the current tracker never produces. reacquisitions: the locks set after an earlier frame of the window had a pose, other than on the first frame after a loop wrap, which reacquisitionsAtLoopWrap counts apart: the jump there is the clip's. On a synchronous run n and confirmed equal firstSteps.n and firstSteps.confirmed, and both reacquisitions keys those of the same names, which stay under their own definitions.",
    firstStepLatency:
        "{ ms, videoMs, frames }, each { n, min, p50, p95, max }, of the latency from a detection to its lock's first step (detectionLocks), over the locks whose first step is in the window: from the frame the detection was computed on to the frame of that step. The detected frame is detectedAt for a consumed detection (a lock whose frame has none is not counted here) and the DETECT frame itself for the tracker's own. ms: the first-step frame's timestampMs minus the detected frame's, on the main thread's clock. videoMs: the same on mediaTimeSeconds, in ms, with the clip's duration added when the video looped between the two frames; a summary given no clip duration counts only the locks with no loop wrap between them. frames: processed frames from the detected frame to the first step's: detectedAt.framesAgo + 1 after the tracker's own detection, whose first step is the next frame, and detectedAt.framesAgo after a consumed one, whose first step is the consuming frame.",
    detectionOutcomes:
        "{ used, failed, locked, ignored }: what became of each detection, from detectionUse, state and reason. used: the frames whose detection the tracker ran itself (internal; an export older than the field reads every frame that is not TRACK so) or was handed and consumed. failed, per reason: those whose detection itself failed (too-few-matches, no-consensus, too-few-inliers). locked: those that set a lock, as detectionLocks counts them, whose first step detectionLocks then counts as confirmed or refused per trackLoss; used is locked plus failed, except for a detection handed to a detection-only tracker, which sets no lock. A detection-only run's own DETECT frames count as locked all the same, by the same rule, though its tracker never steps a lock: detectionLocks gives them no first step, so neither confirmed nor refused. ignored: the frames whose detectionUse is ignored, a detection handed in while a lock held: 0 under the on-demand policy, and a defect otherwise.",
    trackFramesWithDetectionInFlight:
        "TRACK frames whose detectionInFlight is true: process ran on them while a worker detection was in flight. 0 by construction under the on-demand policy, which starts a detection only when the tracker says needsDetection, and it says so only on a frame that ended without a lock: a check that the policy that ran is the one planned. 0 in a synchronous run, and in an export older than the field.",
    frameMs:
        "{ all, track, unlocked }, each { n, min, p50, p95, max } of timings.total: the main thread's time for one processed frame, its acquisition, its grey conversion, the tracker's process and, in a worker run, the post of a frame to the worker (detectionPost). all: every frame; track: the TRACK frames; unlocked: the frames that are not TRACK, whatever they did.",
    unlockedResidualMs:
        "{ n, min, p50, p95, max } of timings.total − timings.acquire − timings.gray − timings.detectionPost, per unlocked frame (state not TRACK), each frame's own: a frame that did not post carries no detectionPost and subtracts none. What is left of an unlocked frame once its acquisition, its grey conversion and its post are taken off: in a worker run, a process call that finds no lock and no detection; in a synchronous run, the tracker's own detection.",
    detectionTime:
        "Where detection's time goes, on the frame loop and off it, over the window's frames and the jobs (one per detection posted to the worker) posted from them. onLoop: the main thread's detection-related time, the sum of the detection stages (detect, describe, match, filterMatches, estimateHomography) of the frames that ran the tracker's own detection (detectionUse internal; an export older than the field reads every frame that is not TRACK so), timings.detectionPost of the frames that posted, and each job's handlerMs, the result handler, which runs between frames and is outside timings.total. share: that time ÷ (Σ timings.total + Σ handlerMs). msPerVideoSecond: that time per second of video covered, which is the counted loops' whole duration (their number × clipDurationS) in a summary that has them, and null there unless the run covered those loops whole (trackTimeShare.complete): an empty or partial window covers less than that duration, and would read 0 or a rate biased low; else the media time between consecutive frames, a loop wrap counting nothing, and null when that is 0. postMs: { n, min, p50, p95, max } of timings.detectionPost over the frames that carry one (a frame that did not post carries none), and handlerMs the same of the jobs' handlerMs. offLoop: workerMs, { n, min, p50, p95, max } of each job's workerMs.total, the worker's pipeline time on its own clock, and msPerVideoSecond, the sum of those per second of video covered. postToArrivalMs: { n, min, p50, p95, max } of each job's arrivedAtMs − postedAtMs, both on the main thread's clock: the latency of a detection from its post to its result's arrival.",
});
