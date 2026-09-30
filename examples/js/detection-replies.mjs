/*
 *  detection-replies.mjs
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
 * Where a reply of the bench page's detection worker goes: the routing
 * `bench-nft.html` does on every message from its worker, apart from the page
 * so that a Node test holds it to its rules. `routeReply` is pure: it reads the
 * reply and the page's run records, and changes neither; the page acts on the
 * route, and counts a late reply with `countLateReply`.
 *
 * A reply is a fact about the run it names, so it is counted there, whenever it
 * arrives: a job the page posted for run A and discarded at A's end may be
 * answered between runs, or while run B is live, and both are A's stale reply
 * (`DEFINITIONS.staleReplies`), never B's. The accounting does not involve
 * replies: a discarded job is `discardedAtStop` at its run's end, answered or
 * not.
 */

/**
 * The route of the worker's reply `data` (`detection-worker-core.mjs` documents
 * the messages), given the live run's id (`null` between runs) and every run
 * the page has made, by id (`runsById`, the page's run records: `id`, `jobs`,
 * `jobInFlight`):
 *
 * - `{ kind: "init" }`: `ready`, or an `error` that names no job, answers the
 *   `init` in progress.
 * - `{ kind: "hand", run, job }`: a `result` for the live run's job in flight;
 *   the page holds its detection for the next frame.
 * - `{ kind: "late", run, job }`: a `result` or an `error` for a job of `run`,
 *   a run that has ended, which it discarded unanswered at its end (the job's
 *   `outcome` is `discardedAtStop` and it has no arrival), and whose late reply
 *   has not been counted yet (no `lateReplyAtMs`); counted on `run`
 *   (`countLateReply`), handed to nothing. One per discarded job, so a run's
 *   `staleReplies` never exceeds its `discardedAtStop`.
 * - `{ kind: "fail", run, message }`: anything else, which the worker cannot
 *   have meant, with one line saying what: a message of an unknown type; an
 *   `error` for the live run's job; a `result` for the live run that is not its
 *   job in flight; a reply naming a run the page never had, a job an ended run
 *   did not discard unanswered, or one whose late reply was already counted.
 *   `run` is the run it names, when the page has it.
 */
export function routeReply(data, { liveRunId, runsById }) {
    const type = data?.type;
    if (type === "ready" || (type === "error" && data.jobId === undefined)) return { kind: "init" };
    const fail = (run, message) => ({ kind: "fail", run, message });
    if (type !== "result" && type !== "error") {
        return fail(null, `The detection worker sent a message of an unknown type: ${String(type)}.`);
    }
    const run = runsById.get(data.runId);
    if (run === undefined) {
        return fail(
            null,
            `The detection worker answered job ${data.jobId} of run ${data.runId}, a run this page never had.`,
        );
    }
    if (run.id === liveRunId) {
        if (type === "error") {
            return fail(run, `The detection worker could not detect on job ${data.jobId}: ${data.message}`);
        }
        const job = run.jobInFlight;
        if (job === null || job.jobId !== data.jobId) {
            return fail(
                run,
                `The detection worker answered job ${data.jobId}, while ${job ? `job ${job.jobId}` : "no job"} was in flight.`,
            );
        }
        return { kind: "hand", run, job };
    }
    const job = run.jobs.find((j) => j.jobId === data.jobId);
    if (job === undefined || job.outcome !== "discardedAtStop" || job.arrivedAtMs !== null) {
        return fail(
            run,
            `The detection worker answered job ${data.jobId} of run ${run.id}, which ended with no such job unanswered.`,
        );
    }
    if (job.lateReplyAtMs != null) {
        return fail(
            run,
            `The detection worker answered job ${data.jobId} of run ${run.id} a second time after the run ended.`,
        );
    }
    return { kind: "late", run, job };
}

/**
 * Counts a `late` route's reply on the run it names (`staleReplies`), whenever
 * it arrives — never on another run, and never in any run's accounting — and
 * marks its job with the reply's arrival (`lateReplyAtMs`, on the main
 * thread's clock), so that a second reply to it is no longer `late`.
 */
export function countLateReply(route, arrivedAtMs) {
    if (!Number.isFinite(arrivedAtMs)) {
        throw new TypeError(`countLateReply needs the reply's arrival time, got ${String(arrivedAtMs)}`);
    }
    route.job.lateReplyAtMs = arrivedAtMs;
    route.run.staleReplies++;
}
