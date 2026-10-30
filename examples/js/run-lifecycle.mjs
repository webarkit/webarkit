/*
 *  run-lifecycle.mjs
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
 * The bench page's run lifecycle and worker glue, apart from the page so that
 * a Node test holds it to its rules (#98): the run pointers, the detection
 * worker's `init`, its replies and the jobs a run posts to it, and every path
 * by which a run ends or fails, with what each leaves enabled.
 *
 * `bench-nft.html` keeps the wiring: the DOM lookups, the listeners, the frame
 * loop and `new Worker`. It passes in what this reaches for — its buttons, its
 * status and error lines, its loop and source controls, the window's length,
 * the page's visibility, the run parameters and the target — and calls what
 * `createRunLifecycle` returns. The timers and the clock are the platform's
 * (`setTimeout`, `performance.now`), as they were on the page.
 */

import { accountingError, isLoopWrap } from "./bench-metrics.mjs";
import { createDetectionPolicy } from "./detection-policy.mjs";
import { countLateReply, failedRuns, routeReply } from "./detection-replies.mjs";

/**
 * The page's run lifecycle, over what it is given (every name is the page's
 * own, so each function reads as it did there):
 *
 * - `detectionPath` and `tuning`: `?detection=`, and `parseRunParams`' result,
 *   of which `loops` and `run` are read;
 * - `targets`, `targetPath` and `targetFile`: the page's targets (`wnft`'s
 *   `bytes` and `record.sha256` are read), and the `.wnft`'s path and URL;
 * - `replyTimeoutMs`: how long a job may go unanswered before its run fails;
 * - `detectionOptions`: the tracker's `sceneLevels`, `ratio` and
 *   `ransacThreshold`, which `init` sends with the scene keypoint budget;
 * - `startButton`, `stopButton`, `probeButton` and `downloadButton`: their
 *   `disabled` is set;
 * - `showError`, `clearError`, `setStatusText`, `stopLoop` and `stopSource`:
 *   the page's;
 * - `historyLength` and `pageHidden`: the window's frame count, and whether
 *   the page is hidden now.
 *
 * Returns the run pointers (`liveRun` and `lastRun`, which the page also sets,
 * `runs`), the worker's record (`detectionWorker`) and the functions.
 */
export function createRunLifecycle({
    detectionPath: DETECTION_PATH,
    tuning: TUNING,
    targets,
    targetPath: TARGET_PATH,
    targetFile: TARGET_FILE,
    replyTimeoutMs: WORKER_REPLY_TIMEOUT_MS,
    detectionOptions: {
        sceneLevels: DEFAULT_SCENE_LEVELS,
        ratio: DEFAULT_RATIO,
        ransacThreshold: DEFAULT_RANSAC_THRESHOLD,
    },
    startButton,
    stopButton,
    probeButton,
    downloadButton,
    showError,
    clearError,
    setStatusText,
    stopLoop,
    stopSource,
    historyLength,
    pageHidden,
}) {
    /**
     * Runs, as `newRun` makes them. `lastRun` is the one whose frames are in
     * `history`, committed at Start with the other `last*` fields and exported
     * with them. `liveRun` is the run whose frames are being processed, the
     * only one a reply is handed to; `null` between runs. `runs` holds every
     * run the page has made, by id: a worker's reply names its run, and a late
     * one is counted on that run (`routeReply`, `staleReplies`).
     */
    let lastRun = null;
    let liveRun = null;
    let runSeq = 0;
    const runs = new Map();
    /**
     * The detection worker, in worker mode: the `Worker`, the options of the
     * last `init` sent, that `init`'s promise and, while it is unanswered,
     * its settlers; and, once it has failed, why — after which Start stays
     * disabled until the page is reloaded.
     */
    const detectionWorker = {
        worker: null,
        sent: null,
        ready: null,
        pendingInit: null,
        failure: null,
    };
    /**
     * A Start from its click until its run is live, or until it is refused or
     * fails (#166): the page's `startPending`, which the lifecycle holds so that
     * Start and the probe can read it. It spans the provenance check and the
     * source's start, both awaited after the run is created, so a run that
     * exists but is not yet live is still pending. `lostVisibility` is set on
     * it by the page's `visibilitychange`.
     */
    let pendingStart = null;
    /**
     * The failure message the error line shows, while nothing has cleared the
     * line (`clearErrorLine`), or `null`. A failure after it leaves the line
     * as it is (`failRun`); each failure still records its own on its run.
     */
    let causeOnLine = null;

    /**
     * A run's record, exported with its frames: an id (a worker's reply names
     * the run it answers), the detection path, and in a worker run its own
     * policy (`createDetectionPolicy`), its jobs (one per detection posted:
     * `postDetection`), which job is at the worker, held or handed to
     * `process`, and the replies to its own jobs that arrived after it ended,
     * discarded (`staleReplies`), counted whenever they arrive. It is kept in
     * `runs` by its id. `?loops=` and `?run=` are the run protocol's;
     * `clipDurationS`, `startedAtIso` and `endedAtIso` are set as it starts
     * and ends, and `endedBy` says how it ended: `done` (a `?loops=` run on
     * its first frame after the counted loops), `stopped` (Stop) or `failed`;
     * `failure` says why a run that could not go on stopped.
     */
    function newRun() {
        const worker = DETECTION_PATH === "worker";
        const run = {
            id: ++runSeq,
            path: DETECTION_PATH,
            policy: worker ? createDetectionPolicy() : null,
            jobs: [],
            jobInFlight: null,
            heldJob: null,
            handedJob: null,
            replyTimer: null,
            staleReplies: 0,
            loops: TUNING.loops === null ? null : { firstLoop: 1, loopCount: TUNING.loops },
            order: TUNING.run,
            clipDurationS: null,
            startedAtIso: null,
            endedAtIso: null,
            endedBy: null,
            failure: null,
            lostVisibility: pageHidden(),
        };
        runs.set(run.id, run);
        return run;
    }

    /**
     * The end of the live run, whatever ended it: in a worker run the policy
     * discards the job in flight or held (`discardedAtStop`), whose reply, if
     * one comes, is discarded too (`onWorkerMessage`). A worker run's export
     * waits for this, since its accounting closes here.
     */
    function endRun(run) {
        if (run !== liveRun) return;
        liveRun = null;
        run.endedAtIso = new Date().toISOString();
        if (run.policy) {
            clearTimeout(run.replyTimer);
            run.replyTimer = null;
            for (const job of [run.jobInFlight, run.heldJob, run.handedJob])
                if (job) job.outcome = "discardedAtStop";
            run.jobInFlight = run.heldJob = run.handedJob = null;
            run.policy.stop();
        }
        downloadButton.disabled = historyLength() === 0;
    }

    /**
     * Whether Start may be pressed: never while a start is pending or a run is
     * live (#166); otherwise always in a synchronous run, and in worker mode
     * while the worker has not failed.
     */
    function startAllowed() {
        if (pendingStart !== null || liveRun !== null) return false;
        return (
            DETECTION_PATH !== "worker" ||
            (detectionWorker.worker !== null && detectionWorker.failure === null)
        );
    }

    /** Whether the probe may be enabled: not while a start is pending or a run is live (#166). */
    function probeAllowed() {
        return pendingStart === null && liveRun === null;
    }

    /**
     * Sets Start and the probe as the lifecycle allows them now: `startAllowed`
     * and `probeAllowed`. The page calls it wherever it used to set them from
     * the worker alone, so that no path can enable one during a pending start
     * or a live run.
     */
    function settleControls() {
        probeButton.disabled = !probeAllowed();
        startButton.disabled = !startAllowed();
    }

    /**
     * Start's click: the start is pending, and Start and the probe are off
     * until it is refused, fails or its run goes live. Returns the pending
     * record, whose `lostVisibility` the page reads.
     */
    function beginStart(lostVisibility) {
        pendingStart = { lostVisibility };
        startButton.disabled = true;
        probeButton.disabled = true;
        return pendingStart;
    }

    /** The pending start is over, and its run is about to go live. The buttons stay as they are: the run's own are set when it starts. */
    function clearPendingStart() {
        pendingStart = null;
    }

    /** The pending start is refused or failed: it is over, and the controls are set as `settleControls` sets them. */
    function endStart() {
        pendingStart = null;
        settleControls();
    }

    /** Empties the error line and forgets the cause it showed, so a later failure is shown (`failRun`). */
    function clearErrorLine() {
        causeOnLine = null;
        clearError();
    }

    /**
     * Stops the live run: the Stop button's `stopped`, `done` when a `?loops=`
     * run ends itself, and `failRun`'s `failed` — the status, and the run's
     * `endedBy`.
     */
    function stopRun(status) {
        if (liveRun) {
            liveRun.endedBy = status;
            endRun(liveRun);
        }
        stopLoop();
        stopSource();
        stopButton.disabled = true;
        settleControls();
        setStatusText(status);
    }

    /**
     * A run that cannot go on — the worker failed or went silent, the policy
     * or a post threw, or anything in a frame's callback threw — stops at
     * once, rather than run on with its policy stuck in flight or its loop
     * dead: status `failed`, `endedBy` `failed`, and why, the cause on its own
     * line. A worker run is never exported, and its worker is not trusted
     * again: Start stays disabled until the page is reloaded. A synchronous
     * run's export stays possible, carries the cause (`run.failure`), and its
     * `protocol` says it is not a session run. `endedBy` is set here, not only
     * through `stopRun`: a run whose own end threw — `stopRun("done")` after
     * `endRun` — is no longer live when it fails, and would keep `done`.
     * `afterEnd` is a worker run whose worker failed after the run had ended
     * (`workerFailed`): it fails all the same, so that its export is refused,
     * and says so rather than that it stopped.
     *
     * The error line keeps the first cause (#166): once it shows a failure's
     * message, a later failure leaves the line as it is, and records its own
     * `failure` on its run. The line is forgotten only when the page clears it
     * (`clearErrorLine`, which Start calls at its click, before it makes a run),
     * so a failure of a new run after a Start is shown.
     */
    function failRun(run, message, { afterEnd = false } = {}) {
        if (run.failure !== null) return;
        run.failure = message;
        run.endedBy = "failed";
        const worker = run.path === "worker";
        if (worker) detectionWorker.failure ??= message;
        stopRun("failed");
        showCause(
            afterEnd
                ? `${message}\n\nThe worker failed after the run ended, so the run cannot show it was clean, and it will not be exported. Reload the page to run again.`
                : worker
                  ? `${message}\n\nThe run stopped, and it will not be exported. Reload the page to run again.`
                  : `${message}\n\nThe run stopped. Its export stays possible, and is not a session run.`,
        );
    }

    /**
     * Shows a failure's text on the error line, and records it as the cause the
     * line shows, unless the line already shows one (#166). Every path that puts
     * a failure's cause on the line goes through here, so no later failure can
     * replace the first, whichever path showed it.
     */
    function showCause(text) {
        if (causeOnLine !== null) return;
        causeOnLine = text;
        showError(text);
    }

    /**
     * Sends `init` for a scene keypoint budget, with a copy of the target's
     * bytes, and returns the promise its answer settles (`settleInit`). Never
     * called while an `init` is unanswered (`workerReady` waits first): two
     * overlapping ones would be answered in the order they finished.
     */
    function initWorker(maxSceneKeypoints) {
        const options = {
            sceneLevels: DEFAULT_SCENE_LEVELS,
            maxSceneKeypoints,
            ratio: DEFAULT_RATIO,
            ransacThreshold: DEFAULT_RANSAC_THRESHOLD,
        };
        const targetBytes = targets.wnft.bytes.slice(0);
        detectionWorker.sent = options;
        detectionWorker.ready = new Promise((resolve, reject) => {
            detectionWorker.pendingInit = { resolve, reject };
        });
        detectionWorker.worker.postMessage({ type: "init", targetBytes, options }, [targetBytes]);
        return detectionWorker.ready;
    }

    /**
     * The worker, ready for a run at this budget: the answer to an `init`
     * still in progress is awaited first, and `init` is sent again when the
     * last one was for another budget (the field is read at Start). Throws
     * once the worker has failed.
     */
    async function workerReady(maxSceneKeypoints) {
        while (detectionWorker.pendingInit) await detectionWorker.ready;
        if (detectionWorker.failure) throw new Error(detectionWorker.failure);
        if (detectionWorker.sent.maxSceneKeypoints !== maxSceneKeypoints)
            await initWorker(maxSceneKeypoints);
    }

    /**
     * The answer to the `init` in progress: `ready` for the target the page
     * decoded, or else a failure. A `ready`'s decoder warnings are logged as
     * the page logs its own decode's.
     */
    function settleInit(data) {
        const pending = detectionWorker.pendingInit;
        if (!pending) {
            workerFailed(
                `The detection worker sent "${data.type}" with no init in progress${data.message ? `: ${data.message}` : ""}.`,
            );
            return;
        }
        detectionWorker.pendingInit = null;
        const expected = targets.wnft.record.sha256;
        const failure =
            data.type === "error"
                ? `The detection worker could not prepare ${TARGET_PATH}: ${data.message}`
                : data.targetSha256 !== expected
                  ? `The detection worker holds a target with SHA-256 ${data.targetSha256}, not ${TARGET_PATH}'s ${expected}.`
                  : null;
        if (failure === null) {
            for (const w of data.warnings ?? [])
                console.warn(`${TARGET_FILE}, in the detection worker: ${w.code} — ${w.detail}`);
            pending.resolve();
        } else {
            detectionWorker.failure ??= failure;
            pending.reject(new Error(failure));
        }
    }

    /**
     * The worker cannot be used (`onerror`, a message it cannot have meant): an
     * `init` in progress is rejected with why, and the runs `failedRuns`
     * (js/detection-replies.mjs) names fail: the live run, or with none live,
     * the run the reply's route names (`run`) and the last run, the one a
     * Download exports, each if it is a worker run that has ended and not
     * failed. Dropped, a failure left the run's Download exporting it as
     * `done`, with `failure: null`, although its worker then failed (#95, from
     * Qodo's review of #100). Otherwise the error is shown, if it is the worker's
     * first: a later one is logged instead, so the error line keeps the cause
     * the failed run's export refusal names. Start stays disabled either way.
     *
     * No frame of the ended run depended on such a failure: the handlers run
     * as each event is delivered, between frames, so one delivered while a run
     * is live fails that run, and only one delivered after its end gets here.
     * That holds only while nothing buffers the worker's messages or errors
     * between the worker and `routeReply`; a queue put there would let an
     * error delivered during a run be handled after it, and the argument (the
     * comment on #95's item) would have to be made again.
     */
    function workerFailed(message, run = null) {
        const first = detectionWorker.failure === null;
        detectionWorker.failure ??= message;
        const pending = detectionWorker.pendingInit;
        detectionWorker.pendingInit = null;
        if (pending) pending.reject(new Error(message));
        const failing = failedRuns(run, { liveRun, lastRun });
        for (const r of failing) failRun(r, message, { afterEnd: r !== liveRun });
        if (failing.length > 0) return;
        if (!pending) {
            if (first) showCause(message);
            else
                console.error(
                    `The detection worker failed again, after "${detectionWorker.failure}": ${message}`,
                );
            startButton.disabled = true;
        }
    }

    /**
     * The worker's replies, routed by `routeReply` (js/detection-replies.mjs):
     * `ready`, and an `error` that names no job, answer the `init` in
     * progress; a `result` for the live run's job in flight is held for the
     * next frame; a reply to a job a run discarded at its end is that run's
     * stale reply, counted on it whenever it arrives — between runs or during
     * a later run — and never handed in; anything else fails the worker (and
     * the live run). The handler runs between frames, on the main thread, so
     * it is detection's time too: timed into the job's `handlerMs` from its
     * first line, before `data` is read, which is where a reply is
     * deserialised.
     */
    function onWorkerMessage(event) {
        const arrivedAtMs = performance.now();
        const data = event.data;
        const route = routeReply(data, { liveRunId: liveRun?.id ?? null, runsById: runs });
        if (route.kind === "init") {
            settleInit(data);
            return;
        }
        if (route.kind === "late") {
            countLateReply(route, arrivedAtMs);
            return;
        }
        if (route.kind === "fail") {
            // The run the reply is about, which an ended run's failure attaches to.
            workerFailed(route.message, route.run);
            return;
        }
        const { run, job } = route;
        clearTimeout(run.replyTimer);
        run.replyTimer = null;
        job.arrivedAtMs = arrivedAtMs;
        job.workerMs = data.workerMs;
        try {
            run.policy.arrive(data.detection);
        } catch (e) {
            failRun(run, `The detection policy refused a result: ${e.message}`);
            return;
        }
        run.jobInFlight = null;
        run.heldJob = job;
        job.handlerMs = performance.now() - arrivedAtMs;
    }

    /** The detection the policy holds for this frame, or `null`; its job is marked handed until `settleFrame`. */
    function takeDetection(run) {
        const handed = run.policy.take();
        if (handed !== null) {
            run.handedJob = run.heldJob;
            run.heldJob = null;
        }
        return handed;
    }

    /**
     * The worker path's half of a frame, after `process`: the policy settles
     * the detection handed in, if any, and posts this frame when the tracker
     * asks for one and none is in flight or held. Returns the post's duration
     * (`null` on a frame that did not post) and, for a consumed detection, the
     * frame it was computed on (`detectedAt`), `framesAgo` processed frames
     * back. What the policy or the post throws, it throws: the tick stops the
     * run on it.
     */
    function settleFrame(run, result, frameInfo) {
        let postMs = null;
        run.policy.afterProcess(result, () => {
            postMs = postDetection(run, frameInfo);
        });
        const job = run.handedJob;
        run.handedJob = null;
        let detectedAt = null;
        if (job) {
            // The policy threw above on anything but these two.
            job.outcome = result.detectionUse;
            if (result.detectionUse === "consumed") {
                job.consumedAtTick = frameInfo.tick;
                detectedAt = {
                    timestampMs: job.frameTimestampMs,
                    mediaTimeSeconds: job.frameMediaTimeSeconds,
                    framesAgo: frameInfo.tick - job.tick,
                };
            }
        }
        return { postMs, detectedAt };
    }

    /**
     * Posts the frame that asked, as a job of `run`, and returns how long that
     * took: the job's record, the message, and `postMessage`, which transfers
     * the frame's pixels rather than copying them (the tick allocates a fresh
     * buffer every frame, and nothing reads this one after `process`). The job
     * names its frame by `t0` — equal to that frame record's `timestampMs`,
     * which is how `summarizeRun` tells the frames that posted it — and media
     * time. A job the worker has not answered in 5 s stops the run.
     */
    function postDetection(run, { frame, t0, mediaTimeSeconds, tick }) {
        const postedAtMs = performance.now();
        const job = {
            jobId: run.jobs.length + 1,
            runId: run.id,
            tick,
            postedAtMs,
            arrivedAtMs: null,
            handlerMs: null,
            workerMs: null,
            consumedAtTick: null,
            outcome: null,
            // When a reply to this job came after its run ended (countLateReply), or null.
            lateReplyAtMs: null,
            frameTimestampMs: t0,
            frameMediaTimeSeconds: mediaTimeSeconds,
        };
        detectionWorker.worker.postMessage(
            {
                type: "detect",
                jobId: job.jobId,
                runId: run.id,
                frame: { width: frame.width, height: frame.height, data: frame.data },
                timestampMs: t0,
            },
            [frame.data.buffer],
        );
        run.jobs.push(job);
        run.jobInFlight = job;
        run.replyTimer = setTimeout(() => {
            if (run.jobInFlight === job) {
                failRun(
                    run,
                    `The detection worker did not answer job ${job.jobId} within ${WORKER_REPLY_TIMEOUT_MS / 1000} s.`,
                );
            }
        }, WORKER_REPLY_TIMEOUT_MS);
        return performance.now() - postedAtMs;
    }

    /**
     * Why the last run may not be exported, in one line, or `null`: a worker
     * run is exported only once it has ended, if it did not fail, and with
     * its accounting balanced and nothing ignored (`accountingError`,
     * DEFINITIONS.detectionAccounting).
     */
    function exportRefusal(run) {
        if (run?.path !== "worker") return null;
        if (run === liveRun)
            return "Stop the run first: a worker run's detection accounting closes when it ends.";
        return run.failure ?? accountingError(run.policy.accounting());
    }

    return {
        get liveRun() {
            return liveRun;
        },
        set liveRun(run) {
            liveRun = run;
        },
        get lastRun() {
            return lastRun;
        },
        set lastRun(run) {
            lastRun = run;
        },
        get startPending() {
            return pendingStart;
        },
        runs,
        detectionWorker,
        newRun,
        endRun,
        startAllowed,
        probeAllowed,
        settleControls,
        beginStart,
        clearPendingStart,
        endStart,
        clearErrorLine,
        showCause,
        stopRun,
        failRun,
        initWorker,
        workerReady,
        settleInit,
        workerFailed,
        onWorkerMessage,
        takeDetection,
        settleFrame,
        postDetection,
        exportRefusal,
    };
}

/**
 * Advances `loop` to the frame at `mediaTimeSeconds` and returns its loop
 * of the clip: 0 from the run's first frame, one more at each wrap, the
 * clip restarting as `isLoopWrap` reads it with the clip's duration
 * (#96). Any other step back throws, so the frame's callback fails the
 * run: read as a wrap, a stutter would end a `?loops=` run a loop early.
 */
export function advanceLoop(loop, mediaTimeSeconds, clipDurationS) {
    const frame = { mediaTimeSeconds };
    if (
        loop.lastMediaTime !== null &&
        isLoopWrap({ mediaTimeSeconds: loop.lastMediaTime }, frame, clipDurationS)
    ) {
        loop.index++;
    }
    loop.lastMediaTime = mediaTimeSeconds;
    return loop.index;
}
