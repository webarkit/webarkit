/*
 *  detection-replies.test.mjs
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

import { describe, expect, it } from "vitest";
import { createDetectionPolicy } from "../js/detection-policy.mjs";
import { countLateReply, routeReply } from "../js/detection-replies.mjs";

// The page's run records, as far as the routing reads them: an id, the jobs posted, the one in
// flight, the stale replies counted, and the run's own policy.
const newRun = (id) => ({
    id,
    policy: createDetectionPolicy(),
    jobs: [],
    jobInFlight: null,
    staleReplies: 0,
});

/** A frame of `run` that asks for a detection: the policy posts a job, as the page's post does. */
function post(run) {
    let job = null;
    run.policy.afterProcess({ needsDetection: true, detectionUse: "none" }, () => {
        job = { jobId: run.jobs.length + 1, runId: run.id, arrivedAtMs: null, outcome: null };
        run.jobs.push(job);
        run.jobInFlight = job;
    });
    return job;
}

/** The run's end, as the page's endRun leaves its record: the job in flight discarded unanswered. */
function end(run) {
    if (run.jobInFlight) run.jobInFlight.outcome = "discardedAtStop";
    run.jobInFlight = null;
    run.policy.stop();
}

const result = (run, job) => ({ type: "result", runId: run.id, jobId: job.jobId, detection: {} });
const byId = (...runs) => new Map(runs.map((r) => [r.id, r]));

describe("routeReply", () => {
    it("hands a result for the live run's job in flight", () => {
        const a = newRun(1);
        const job = post(a);
        const route = routeReply(result(a, job), { liveRunId: a.id, runsById: byId(a) });
        expect(route.kind).toBe("hand");
        expect(route.run).toBe(a);
        expect(route.job).toBe(job);
    });

    it("fails a reply to the live run that names another job, or comes with none in flight, or reports an error", () => {
        const a = newRun(1);
        const job = post(a);
        const runsById = byId(a);
        const other = routeReply({ ...result(a, job), jobId: 7 }, { liveRunId: a.id, runsById });
        expect(other).toMatchObject({ kind: "fail", run: a });
        expect(other.message).toMatch(/answered job 7, while job 1 was in flight/);
        a.jobInFlight = null;
        expect(routeReply(result(a, job), { liveRunId: a.id, runsById }).message).toMatch(
            /while no job was in flight/,
        );
        const error = { type: "error", runId: a.id, jobId: 1, message: "out of memory" };
        expect(routeReply(error, { liveRunId: a.id, runsById })).toMatchObject({
            kind: "fail",
            message: "The detection worker could not detect on job 1: out of memory",
        });
    });

    // The same event — a reply to a job run A discarded at its end — landed in run B's record if
    // it arrived after B's Start, and in no record if before.
    it("routes a reply to an ended run's discarded job late, between runs, and counts it on that run", () => {
        const a = newRun(1);
        const job = post(a);
        end(a);
        const route = routeReply(result(a, job), { liveRunId: null, runsById: byId(a) });
        expect(route).toMatchObject({ kind: "late", run: a });
        countLateReply(route);
        expect(a.staleReplies).toBe(1);
        // Never more than the jobs it discarded at its end.
        expect(a.staleReplies).toBeLessThanOrEqual(a.policy.accounting().discardedAtStop);
    });

    it("routes it late during a later run too, counted on the run it names, the live run's record untouched", () => {
        const a = newRun(1);
        const discarded = post(a);
        end(a);
        const b = newRun(2);
        post(b);
        const bBefore = structuredClone({ jobs: b.jobs, staleReplies: b.staleReplies });
        const route = routeReply(result(a, discarded), { liveRunId: b.id, runsById: byId(a, b) });
        expect(route).toMatchObject({ kind: "late", run: a });
        countLateReply(route);
        expect(a.staleReplies).toBe(1);
        expect(b.staleReplies).toBe(0);
        expect({ jobs: b.jobs, staleReplies: b.staleReplies }).toEqual(bBefore);
        // An error the worker sends for the discarded job is a reply to it too.
        const error = { type: "error", runId: a.id, jobId: discarded.jobId, message: "late" };
        expect(routeReply(error, { liveRunId: b.id, runsById: byId(a, b) })).toMatchObject({
            kind: "late",
            run: a,
        });
    });

    it("fails a reply that names a run the page never had", () => {
        const a = newRun(1);
        post(a);
        const unknown = { type: "result", runId: 9, jobId: 1, detection: {} };
        for (const liveRunId of [a.id, null]) {
            const route = routeReply(unknown, { liveRunId, runsById: byId(a) });
            expect(route.kind).toBe("fail");
            expect(route.message).toMatch(/run 9/);
            expect(route.message).not.toMatch(/\n/);
        }
    });

    it("fails a late reply to a job its run did not discard unanswered", () => {
        const a = newRun(1);
        const job = post(a);
        job.arrivedAtMs = 120; // answered while the run was live
        a.jobInFlight = null;
        job.outcome = "consumed";
        end(a);
        const route = routeReply(result(a, job), { liveRunId: null, runsById: byId(a) });
        expect(route.kind).toBe("fail");
        expect(route.message).toMatch(/job 1 of run 1/);
    });

    it("leaves every run's accounting as it was when a late reply is routed and counted", () => {
        const a = newRun(1);
        const discarded = post(a);
        end(a);
        const b = newRun(2);
        post(b);
        const before = [a.policy.accounting(), b.policy.accounting()];
        countLateReply(routeReply(result(a, discarded), { liveRunId: b.id, runsById: byId(a, b) }));
        countLateReply(routeReply(result(a, discarded), { liveRunId: null, runsById: byId(a, b) }));
        expect([a.policy.accounting(), b.policy.accounting()]).toEqual(before);
    });

    it("routes ready, and an error that names no job, to the init in progress; fails any other type", () => {
        const none = { liveRunId: null, runsById: new Map() };
        expect(routeReply({ type: "ready", targetSha256: "ab" }, none)).toEqual({ kind: "init" });
        expect(routeReply({ type: "error", message: "bad target" }, none)).toEqual({ kind: "init" });
        const odd = routeReply({ type: "progress" }, none);
        expect(odd.kind).toBe("fail");
        expect(odd.message).toMatch(/unknown type: progress/);
    });
});
