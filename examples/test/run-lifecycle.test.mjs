/*
 *  run-lifecycle.test.mjs
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
 * The bench page's run lifecycle and worker glue (`run-lifecycle.mjs`, #98),
 * driven as the page drives it, with the real detection policy and reply
 * routing. Only the page's DOM and the worker are stood in for: buttons are
 * `{ disabled }`, the error line and the status are recorded, and the worker
 * records what is posted to it. Each failure path #120's part A lists (PG12,
 * PG13, PG15, PG16, PG19, PG22, PG24, PG29, PG31) has a test here that fails
 * when its guard is removed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceLoop, createRunLifecycle } from "../js/run-lifecycle.mjs";

const TARGET_SHA = "9e8eb486";
const WHERE_TARGET = "targets/pinball.wnft";

/** A lifecycle over a stand-in page: what it shows and enables is recorded in `page`. */
function harness({ path = "worker", loops = null, hidden = false, frames = 3 } = {}) {
    const button = () => ({ disabled: false });
    const page = {
        startButton: button(),
        stopButton: button(),
        probeButton: button(),
        downloadButton: button(),
        error: "",
        statuses: [],
        stopLoop: 0,
        stopSource: 0,
        frames,
        hidden,
    };
    const lc = createRunLifecycle({
        detectionPath: path,
        tuning: { loops, run: null },
        targets: {
            wnft: { bytes: new Uint8Array([1, 2, 3]).buffer, record: { sha256: TARGET_SHA } },
        },
        targetPath: WHERE_TARGET,
        targetFile: `./${WHERE_TARGET}`,
        replyTimeoutMs: 5000,
        detectionOptions: { sceneLevels: 3, ratio: 0.7, ransacThreshold: 3 },
        startButton: page.startButton,
        stopButton: page.stopButton,
        probeButton: page.probeButton,
        downloadButton: page.downloadButton,
        // As the page's: the error line, and the status `failed`.
        showError: (message) => {
            page.error = message;
            page.statuses.push("failed");
        },
        clearError: () => {
            page.error = "";
        },
        setStatusText: (text) => page.statuses.push(text),
        stopLoop: () => page.stopLoop++,
        stopSource: () => page.stopSource++,
        historyLength: () => page.frames,
        pageHidden: () => page.hidden,
    });
    const posted = [];
    const worker = { postMessage: (message, transfer) => posted.push({ message, transfer }) };
    if (path === "worker") lc.detectionWorker.worker = worker;
    return { lc, page, posted };
}

/** A run made, committed and live, as Start and `runBenchmark` leave it. */
function start(lc) {
    const run = lc.newRun();
    lc.lastRun = run;
    lc.liveRun = run;
    return run;
}

/** A frame of a worker run that asks for a detection: the policy posts it through `postDetection`. */
function askingFrame(lc, run, tick = 0) {
    return lc.settleFrame(
        run,
        { needsDetection: true, detectionUse: "none" },
        {
            frame: { width: 2, height: 1, data: new Uint8Array(2) },
            t0: 100 + tick,
            mediaTimeSeconds: tick / 30,
            tick,
        },
    );
}

/** The worker's answer to `run`'s job in flight, delivered as the page's `onmessage` gets it. */
function answer(lc, run, job = run.jobInFlight) {
    lc.onWorkerMessage({
        data: {
            type: "result",
            jobId: job.jobId,
            runId: run.id,
            detection: { ok: true },
            workerMs: { total: 4 },
        },
    });
}

describe("newRun", () => {
    it("numbers each run, keeps it by id, and records the run parameters and the visibility", () => {
        const { lc, page } = harness({ loops: 4 });
        const first = lc.newRun();
        page.hidden = true;
        const second = lc.newRun();
        expect([first.id, second.id]).toEqual([1, 2]);
        expect(lc.runs.get(2)).toBe(second);
        expect(first.loops).toEqual({ firstLoop: 1, loopCount: 4 });
        expect([first.lostVisibility, second.lostVisibility]).toEqual([false, true]);
        expect(first.path).toBe("worker");
        expect(first.policy).not.toBeNull();
        expect(first.endedBy).toBeNull();
        expect(first.failure).toBeNull();
    });

    it("gives a synchronous run no policy, and no loops without ?loops=", () => {
        const { lc } = harness({ path: "sync" });
        const run = lc.newRun();
        expect(run.policy).toBeNull();
        expect(run.loops).toBeNull();
    });
});

describe("startAllowed (PG24)", () => {
    it("always allows a synchronous Start", () => {
        const { lc } = harness({ path: "sync" });
        expect(lc.startAllowed()).toBe(true);
    });

    it("allows a worker Start only with a worker that has not failed", () => {
        const { lc } = harness();
        expect(lc.startAllowed()).toBe(true);
        lc.detectionWorker.failure = "it failed";
        expect(lc.startAllowed()).toBe(false);
        const none = harness().lc;
        none.detectionWorker.worker = null;
        expect(none.startAllowed()).toBe(false);
    });
});

describe("stopRun and endRun", () => {
    it("ends the live run as the status says, stops the loop and the source, and re-enables the controls", () => {
        const { lc, page } = harness({ path: "sync" });
        page.startButton.disabled = page.probeButton.disabled = true;
        const run = start(lc);
        lc.stopRun("stopped");
        expect(run.endedBy).toBe("stopped");
        expect(run.endedAtIso).toMatch(/^\d{4}-\d\d-\d\dT/);
        expect(lc.liveRun).toBeNull();
        expect([page.stopLoop, page.stopSource]).toEqual([1, 1]);
        expect(page.stopButton.disabled).toBe(true);
        expect(page.startButton.disabled).toBe(false);
        expect(page.probeButton.disabled).toBe(false);
        expect(page.statuses.at(-1)).toBe("stopped");
    });

    it("discards a worker run's job in flight at its end, and enables Download only on a window with frames", () => {
        const { lc, page } = harness();
        const run = start(lc);
        askingFrame(lc, run);
        const job = run.jobInFlight;
        page.downloadButton.disabled = true;
        lc.endRun(run);
        expect(job.outcome).toBe("discardedAtStop");
        expect(run.jobInFlight).toBeNull();
        expect(run.replyTimer).toBeNull();
        expect(run.policy.accounting()).toMatchObject({
            requests: 1,
            posted: 1,
            discardedAtStop: 1,
        });
        expect(page.downloadButton.disabled).toBe(false);

        const empty = harness({ frames: 0 });
        const r = start(empty.lc);
        empty.lc.endRun(r);
        expect(empty.page.downloadButton.disabled).toBe(true);
    });

    it("leaves a run that is not live as it is", () => {
        const { lc, page } = harness();
        const run = lc.newRun();
        page.downloadButton.disabled = true;
        lc.endRun(run);
        expect(run.endedAtIso).toBeNull();
        expect(page.downloadButton.disabled).toBe(true);
    });
});

describe("failRun (PG15, PG16)", () => {
    it("fails a synchronous run on a throw: failed, its cause shown, and its export still possible", () => {
        const { lc, page } = harness({ path: "sync" });
        const run = start(lc);
        lc.failRun(run, "The run failed on frame 52: probe-frame-throw");
        expect(run.failure).toBe("The run failed on frame 52: probe-frame-throw");
        expect(run.endedBy).toBe("failed");
        expect(lc.liveRun).toBeNull();
        expect(page.statuses).toContain("failed");
        expect(page.error).toBe(
            "The run failed on frame 52: probe-frame-throw\n\nThe run stopped. Its export stays possible, and is not a session run.",
        );
        expect(lc.exportRefusal(run)).toBeNull();
        expect(page.startButton.disabled).toBe(false);
    });

    it("fails a worker run for good: the worker is not trusted again, Start stays off, and Download is refused", () => {
        const { lc, page } = harness();
        const run = start(lc);
        lc.failRun(run, "The worker path failed on frame 46: probe");
        expect(lc.detectionWorker.failure).toBe("The worker path failed on frame 46: probe");
        expect(page.startButton.disabled).toBe(true);
        expect(lc.startAllowed()).toBe(false);
        expect(page.error).toBe(
            "The worker path failed on frame 46: probe\n\nThe run stopped, and it will not be exported. Reload the page to run again.",
        );
        expect(lc.exportRefusal(run)).toBe("The worker path failed on frame 46: probe");
    });

    it("marks a run failed whose own end threw after it had ended done", () => {
        const { lc } = harness({ path: "sync" });
        const run = start(lc);
        lc.stopRun("done");
        expect(run.endedBy).toBe("done");
        lc.failRun(run, "The run failed on frame 384: probe-end-throw");
        expect(run.endedBy).toBe("failed");
        expect(run.failure).toBe("The run failed on frame 384: probe-end-throw");
    });

    it("keeps a run's first cause, and fails it once", () => {
        const { lc, page } = harness({ path: "sync" });
        const run = start(lc);
        lc.failRun(run, "first");
        const shown = page.error;
        const statuses = page.statuses.length;
        lc.failRun(run, "second");
        expect(run.failure).toBe("first");
        expect(page.error).toBe(shown);
        expect(page.statuses.length).toBe(statuses);
    });

    it("says so when the worker failed after the run ended", () => {
        const { lc, page } = harness();
        const run = start(lc);
        lc.stopRun("stopped");
        lc.failRun(run, "late", { afterEnd: true });
        expect(page.error).toBe(
            "late\n\nThe worker failed after the run ended, so the run cannot show it was clean, and it will not be exported. Reload the page to run again.",
        );
        expect(run.endedBy).toBe("failed");
    });
});

describe("postDetection's reply timeout (PG29)", () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
    afterEach(() => vi.useRealTimers());

    it("posts the frame as a job of the run, transferring its pixels", () => {
        const { lc, posted } = harness();
        const run = start(lc);
        const { postMs } = askingFrame(lc, run, 7);
        expect(postMs).toBeGreaterThanOrEqual(0);
        expect(posted).toHaveLength(1);
        const { message, transfer } = posted[0];
        expect(message).toMatchObject({
            type: "detect",
            jobId: 1,
            runId: run.id,
            timestampMs: 107,
        });
        expect(transfer).toEqual([message.frame.data.buffer]);
        expect(run.jobInFlight).toMatchObject({
            jobId: 1,
            tick: 7,
            frameTimestampMs: 107,
            outcome: null,
        });
        expect(run.jobs).toEqual([run.jobInFlight]);
    });

    it("fails the run when the worker has not answered within the timeout", () => {
        const { lc, page } = harness();
        const run = start(lc);
        askingFrame(lc, run);
        vi.advanceTimersByTime(4999);
        expect(run.failure).toBeNull();
        vi.advanceTimersByTime(1);
        expect(run.failure).toBe("The detection worker did not answer job 1 within 5 s.");
        expect(run.endedBy).toBe("failed");
        expect(page.startButton.disabled).toBe(true);
        expect(lc.exportRefusal(run)).toBe("The detection worker did not answer job 1 within 5 s.");
    });

    it("does not fail a run whose job was answered in time", () => {
        const { lc } = harness();
        const run = start(lc);
        askingFrame(lc, run);
        const job = run.jobInFlight;
        answer(lc, run);
        expect(run.jobInFlight).toBeNull();
        expect(run.heldJob).toBe(job);
        expect(job.workerMs).toEqual({ total: 4 });
        vi.advanceTimersByTime(10000);
        expect(run.failure).toBeNull();
    });
});

describe("settleFrame", () => {
    it("hands a held detection in, and settles it as consumed with the frame it was computed on", () => {
        const { lc } = harness();
        const run = start(lc);
        askingFrame(lc, run, 3);
        const job = run.jobInFlight;
        answer(lc, run);
        expect(lc.takeDetection(run)).toEqual({ ok: true });
        expect(run.handedJob).toBe(job);
        const settled = lc.settleFrame(
            run,
            { needsDetection: false, detectionUse: "consumed" },
            { frame: null, t0: 200, mediaTimeSeconds: 0.2, tick: 5 },
        );
        expect(settled).toEqual({
            postMs: null,
            detectedAt: { timestampMs: 103, mediaTimeSeconds: 0.1, framesAgo: 2 },
        });
        expect(job).toMatchObject({ outcome: "consumed", consumedAtTick: 5 });
        expect(run.handedJob).toBeNull();
        expect(run.policy.accounting()).toMatchObject({ requests: 1, consumptions: 1 });
    });
});

describe("onWorkerMessage (PG31)", () => {
    it("fails the live run on a message the worker cannot have meant", () => {
        const { lc, page } = harness();
        const run = start(lc);
        lc.onWorkerMessage({ data: { type: "bogus" } });
        expect(run.failure).toBe("The detection worker sent a message of an unknown type: bogus.");
        expect(page.startButton.disabled).toBe(true);
    });

    it("counts a reply to a job the run discarded at its end on that run, and fails nothing", () => {
        const { lc } = harness();
        const run = start(lc);
        askingFrame(lc, run);
        const job = run.jobInFlight;
        lc.stopRun("stopped");
        answer(lc, run, job);
        expect(run.staleReplies).toBe(1);
        expect(job.lateReplyAtMs).toEqual(expect.any(Number));
        expect(run.failure).toBeNull();
        expect(lc.detectionWorker.failure).toBeNull();
    });

    it("fails a run whose policy refuses the result", () => {
        const { lc } = harness();
        const run = start(lc);
        askingFrame(lc, run);
        run.policy.stop();
        // A stopped policy ignores arrivals: refused instead by one that throws.
        run.policy.arrive = () => {
            throw new Error("nothing in flight");
        };
        answer(lc, run);
        expect(run.failure).toBe("The detection policy refused a result: nothing in flight");
    });
});

describe("workerFailed", () => {
    it("fails the last run, ended clean, when its worker fails after it ended", () => {
        const { lc, page } = harness();
        const run = start(lc);
        lc.stopRun("stopped");
        lc.workerFailed("The detection worker (examples/js/detection-worker.mjs) failed: probe.");
        expect(run.endedBy).toBe("failed");
        expect(
            page.error.startsWith(
                "The detection worker (examples/js/detection-worker.mjs) failed: probe.\n\nThe worker failed after the run ended",
            ),
        ).toBe(true);
        expect(page.startButton.disabled).toBe(true);
        expect(lc.exportRefusal(run)).toBe(
            "The detection worker (examples/js/detection-worker.mjs) failed: probe.",
        );
    });

    it("with no run to fail, shows the first failure, logs a later one, and keeps Start off", () => {
        const { lc, page } = harness();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            lc.workerFailed("first");
            lc.workerFailed("second");
            expect(page.error).toBe("first");
            expect(error).toHaveBeenCalledWith(
                'The detection worker failed again, after "first": second',
            );
            expect(lc.detectionWorker.failure).toBe("first");
            expect(page.startButton.disabled).toBe(true);
        } finally {
            error.mockRestore();
        }
    });

    it("rejects an init in progress with why", async () => {
        const { lc } = harness();
        const ready = lc.initWorker(500);
        lc.workerFailed("gone");
        await expect(ready).rejects.toThrow("gone");
        expect(lc.detectionWorker.pendingInit).toBeNull();
    });
});

describe("initWorker, settleInit and workerReady (PG22)", () => {
    it("sends init with the budget and the tracker's options, transferring a copy of the target's bytes", () => {
        const { lc, posted } = harness();
        lc.initWorker(500);
        const { message, transfer } = posted[0];
        expect(message.type).toBe("init");
        expect(message.options).toEqual({
            sceneLevels: 3,
            maxSceneKeypoints: 500,
            ratio: 0.7,
            ransacThreshold: 3,
        });
        expect(transfer).toEqual([message.targetBytes]);
        expect(lc.detectionWorker.sent).toBe(message.options);
    });

    it("resolves on ready for the target the page decoded, logging the decoder's warnings", async () => {
        const { lc } = harness();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const ready = lc.initWorker(500);
            lc.settleInit({
                type: "ready",
                targetSha256: TARGET_SHA,
                warnings: [{ code: "c", detail: "d" }],
            });
            await expect(ready).resolves.toBeUndefined();
            expect(warn).toHaveBeenCalledWith(`./${WHERE_TARGET}, in the detection worker: c — d`);
            expect(lc.detectionWorker.failure).toBeNull();
        } finally {
            warn.mockRestore();
        }
    });

    it("refuses a worker that holds another target, and keeps Start off", async () => {
        const { lc } = harness();
        const ready = lc.initWorker(500);
        lc.settleInit({ type: "ready", targetSha256: "ffff", warnings: [] });
        const why = `The detection worker holds a target with SHA-256 ffff, not ${WHERE_TARGET}'s ${TARGET_SHA}.`;
        await expect(ready).rejects.toThrow(why);
        expect(lc.detectionWorker.failure).toBe(why);
        expect(lc.startAllowed()).toBe(false);
    });

    it("refuses a worker that could not prepare the target", async () => {
        const { lc } = harness();
        const ready = lc.initWorker(500);
        lc.settleInit({ type: "error", message: "bad chunk" });
        await expect(ready).rejects.toThrow(
            `The detection worker could not prepare ${WHERE_TARGET}: bad chunk`,
        );
    });

    it("fails the worker on an answer with no init in progress", () => {
        const { lc, page } = harness();
        lc.settleInit({ type: "ready", targetSha256: TARGET_SHA });
        expect(lc.detectionWorker.failure).toBe(
            'The detection worker sent "ready" with no init in progress.',
        );
        expect(page.error).toBe('The detection worker sent "ready" with no init in progress.');
    });

    it("waits for the init in progress, sends init again only for another budget, and throws once failed", async () => {
        const { lc, posted } = harness();
        lc.initWorker(500);
        const waiting = lc.workerReady(500);
        lc.settleInit({ type: "ready", targetSha256: TARGET_SHA });
        await waiting;
        expect(posted).toHaveLength(1);
        const again = lc.workerReady(800);
        await Promise.resolve();
        expect(posted).toHaveLength(2);
        expect(posted[1].message.options.maxSceneKeypoints).toBe(800);
        lc.settleInit({ type: "ready", targetSha256: TARGET_SHA });
        await again;
        lc.detectionWorker.failure = "it failed";
        await expect(lc.workerReady(800)).rejects.toThrow("it failed");
    });
});

describe("exportRefusal (PG12, PG13)", () => {
    it("refuses a worker run while it is live", () => {
        const { lc } = harness();
        const run = start(lc);
        expect(lc.exportRefusal(run)).toBe(
            "Stop the run first: a worker run's detection accounting closes when it ends.",
        );
        lc.stopRun("stopped");
        expect(lc.exportRefusal(run)).toBeNull();
    });

    it("refuses a worker run whose accounting does not balance", () => {
        const { lc } = harness();
        const run = {
            path: "worker",
            failure: null,
            policy: {
                accounting: () => ({
                    requests: 2,
                    posted: 1,
                    consumptions: 0,
                    ignored: 0,
                    dropped: 0,
                    discardedAtStop: 0,
                }),
            },
        };
        expect(lc.exportRefusal(run)).toBe(
            "detection accounting does not balance: requests 2 ≠ consumptions 0 + dropped 0 + discardedAtStop 0",
        );
    });

    it("never refuses a synchronous run, nor no run", () => {
        const { lc } = harness({ path: "sync" });
        const run = start(lc);
        expect(lc.exportRefusal(run)).toBeNull();
        expect(lc.exportRefusal(null)).toBeNull();
    });
});

describe("advanceLoop (PG19)", () => {
    it("counts a loop at each wrap of the clip", () => {
        const loop = { index: 0, lastMediaTime: null };
        const at = (t) => advanceLoop(loop, t, 3.2);
        expect([at(0.0), at(1.5), at(3.15), at(0.02), at(3.18), at(0.03)]).toEqual([
            0, 0, 0, 1, 1, 2,
        ]);
    });

    it("throws on a step back that is not the clip restarting, read with the clip's duration", () => {
        const loop = { index: 0, lastMediaTime: null };
        advanceLoop(loop, 3.1, 10);
        // Without the duration this would read as a wrap: back more than 0.5 s, near the start.
        expect(() => advanceLoop(loop, 0.1, 10)).toThrow(/is not the clip restarting/);
        expect(loop.index).toBe(0);
    });
});

describe("a start pending or live (#166, defect 1)", () => {
    it.each(["worker", "sync"])(
        "%s: refuses Start while a start is pending, and the probe's re-enable leaves both off",
        (path) => {
            const { lc, page } = harness({ path });
            lc.beginStart(false);
            expect([page.startButton.disabled, page.probeButton.disabled]).toEqual([true, true]);
            expect(lc.startAllowed()).toBe(false);
            expect(lc.probeAllowed()).toBe(false);
            lc.settleControls();
            expect([page.startButton.disabled, page.probeButton.disabled]).toEqual([true, true]);
        },
    );

    it.each(["worker", "sync"])(
        "%s: refuses Start while a run is live, and the probe's re-enable leaves both off",
        (path) => {
            const { lc, page } = harness({ path });
            start(lc);
            expect(lc.startAllowed()).toBe(false);
            expect(lc.probeAllowed()).toBe(false);
            lc.settleControls();
            expect([page.startButton.disabled, page.probeButton.disabled]).toEqual([true, true]);
        },
    );

    it("keeps a start pending from its run's creation until the run is live", () => {
        const { lc, page } = harness();
        lc.beginStart(false);
        const run = lc.newRun();
        lc.lastRun = run;
        expect(lc.startPending).not.toBeNull();
        expect(lc.startAllowed()).toBe(false);
        lc.clearPendingStart();
        expect(lc.startPending).toBeNull();
        lc.liveRun = run;
        expect(lc.startAllowed()).toBe(false);
        lc.stopRun("stopped");
        expect(lc.startAllowed()).toBe(true);
        expect(page.startButton.disabled).toBe(false);
        expect(page.probeButton.disabled).toBe(false);
    });

    it("allows Start again after a refused start, and after a synchronous run ends", () => {
        const sync = harness({ path: "sync" });
        sync.lc.beginStart(false);
        sync.lc.endStart();
        expect([sync.page.startButton.disabled, sync.page.probeButton.disabled]).toEqual([
            false,
            false,
        ]);
        const run = start(sync.lc);
        sync.lc.stopRun("stopped");
        expect(run.endedBy).toBe("stopped");
        expect(sync.page.startButton.disabled).toBe(false);

        const worker = harness();
        worker.lc.beginStart(false);
        worker.lc.endStart();
        expect(worker.page.startButton.disabled).toBe(false);
    });

    it("keeps Start off after a refused start when the worker has failed", () => {
        const { lc, page } = harness();
        lc.detectionWorker.failure = "it failed";
        lc.beginStart(false);
        lc.endStart();
        expect(page.startButton.disabled).toBe(true);
        expect(page.probeButton.disabled).toBe(false);
    });

    it("keeps the probe and Start off when a run fails through stopRun during a pending start", () => {
        const { lc, page } = harness();
        const ended = start(lc);
        lc.stopRun("stopped");
        lc.beginStart(false);
        // A worker failure fails the last ended run, through stopRun (failedRuns, failRun).
        lc.workerFailed("The detection worker failed: probe.");
        expect(ended.endedBy).toBe("failed");
        expect(lc.startPending).not.toBeNull();
        expect(page.probeButton.disabled).toBe(true);
        expect(page.startButton.disabled).toBe(true);
    });
});

describe("the error line keeps the first failure's cause (#166, defect 2)", () => {
    it("keeps the first cause when a later run fails, and gives that run its own failure", () => {
        const { lc, page } = harness();
        const first = start(lc);
        lc.failRun(first, "The worker path failed on frame 46: probe");
        const shown = page.error;
        const second = start(lc);
        lc.stopRun("stopped");
        lc.failRun(second, "The worker path failed on frame 47: other", { afterEnd: true });
        expect(page.error).toBe(shown);
        expect(page.error).toBe(
            "The worker path failed on frame 46: probe\n\nThe run stopped, and it will not be exported. Reload the page to run again.",
        );
        expect(first.failure).toBe("The worker path failed on frame 46: probe");
        expect(second.failure).toBe("The worker path failed on frame 47: other");
        expect(second.endedBy).toBe("failed");
    });

    it("shows a new run's cause after a synchronous failure and a new Start", () => {
        const { lc, page } = harness({ path: "sync" });
        const first = start(lc);
        lc.failRun(first, "The run failed on frame 52: probe-frame-throw");
        // As the page's Start does, before it makes a run.
        lc.clearErrorLine();
        const second = start(lc);
        lc.failRun(second, "The run failed on frame 9: again");
        expect(page.error).toBe(
            "The run failed on frame 9: again\n\nThe run stopped. Its export stays possible, and is not a session run.",
        );
        expect(first.failure).toBe("The run failed on frame 52: probe-frame-throw");
    });

    it("keeps an init failure's cause when a clean run's worker then fails", async () => {
        const { lc, page } = harness();
        const clean = start(lc);
        lc.stopRun("stopped");
        lc.beginStart(false);
        // A new Start with another budget sends init; the worker answers with an error.
        const ready = lc.initWorker(500);
        lc.settleInit({ type: "error", message: "bad chunk" });
        await expect(ready).rejects.toThrow(
            `The detection worker could not prepare ${WHERE_TARGET}: bad chunk`,
        );
        // As the page's workerReady catch does.
        lc.endStart();
        lc.showCause(`The detection worker could not prepare ${WHERE_TARGET}: bad chunk`);
        const shown = page.error;
        // The worker then fails: failedRuns gives back the clean run that ended.
        lc.workerFailed("The detection worker (examples/js/detection-worker.mjs) failed: probe.");
        expect(clean.endedBy).toBe("failed");
        expect(clean.failure).toBe(
            "The detection worker (examples/js/detection-worker.mjs) failed: probe.",
        );
        expect(page.error).toBe(shown);
        expect(
            page.error.startsWith(`The detection worker could not prepare ${WHERE_TARGET}`),
        ).toBe(true);
    });

    it("keeps a first worker failure on the line when a later failRun reaches it", () => {
        const { lc, page } = harness();
        lc.workerFailed("first");
        expect(page.error).toBe("first");
        const later = start(lc);
        lc.stopRun("stopped");
        lc.failRun(later, "later", { afterEnd: true });
        expect(page.error).toBe("first");
        expect(later.failure).toBe("later");
    });
});
