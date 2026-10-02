/*
 *  detection-policy.mjs
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
 * The on-demand detection policy of the bench's worker path
 * (docs/benchmarks/README.md, "2026-09-29 — M3: detection off the frame,
 * measured"), written once so the page and the desktop replay run the same
 * rules and cannot disagree about them:
 *
 * - A detection is requested only when the tracker's result says
 *   `needsDetection`: on every frame that ends without a lock in external
 *   mode, including a frame that refused the detection it was handed.
 * - At most one is in flight. A request made while one is in flight, or while
 *   its result is held, is dropped, not queued: a queued frame would be older
 *   than the one available when the worker frees up.
 * - A result is held, and handed to the next `process` call — once.
 *
 * Pure: no DOM, no worker, no clock. The caller owns everything that is not
 * policy: what a job is, how it is posted (`post` is its closure, and the
 * job's bookkeeping lives there), and when `arrive` runs. One frame is
 * `take()`, the tracker's `process`, then `afterProcess(result, post)`; a
 * result that arrives between frames is `arrive(detection)`; Stop is `stop()`.
 *
 * The counts it keeps are the run's accounting, and they are asserted, not
 * described: see `accountingError` in `bench-metrics.mjs`.
 */

/**
 * A fresh policy for one run.
 *
 * `accounting()` is `{ requests, posted, consumptions, ignored, dropped,
 * discardedAtStop }`, whole-run counts (never a window's):
 *
 * - `requests`: results that said `needsDetection`, while the run was live.
 * - `posted`: requests that started a job.
 * - `dropped`: requests made while a job was in flight or its result held.
 * - `consumptions`: handed-in detections the tracker used, `detectionUse:
 *   "consumed"`, whether or not they locked.
 * - `ignored`: handed-in detections the tracker did not use, `"ignored"`:
 *   handed in while a lock held. Under this policy there are none, and
 *   anything else is a defect.
 * - `discardedAtStop`: a job in flight, or whose result was held or handed
 *   but not yet settled, when `stop()` was called.
 *
 * So `requests = consumptions + dropped + discardedAtStop` and `ignored = 0`.
 */
export function createDetectionPolicy() {
    // Where the one job the policy allows is: nowhere ("idle"), at the worker
    // ("inFlight"), arrived and waiting for the next frame ("held"), or given
    // to `process` and not yet settled by `afterProcess` ("handed").
    let phase = "idle";
    let detection = null;
    let stopped = false;
    const counts = {
        requests: 0,
        posted: 0,
        consumptions: 0,
        ignored: 0,
        dropped: 0,
        discardedAtStop: 0,
    };

    return {
        /**
         * The held detection, for the next `process` call, or `null` when there
         * is none. Marks it handed: a second call returns `null`.
         */
        take() {
            if (phase !== "held") return null;
            const handed = detection;
            detection = null;
            phase = "handed";
            return handed;
        },

        /**
         * What the frame that used `take()`'s answer did: `result` is the
         * tracker's, of which the policy reads `detectionUse` and
         * `needsDetection`. A detection that was handed in is settled first:
         * `"consumed"` or `"ignored"`, and anything else — which the tracker
         * never returns for a handed detection — throws. Then, if the frame
         * ends without a lock, a request is made: `post()` starts the job when
         * none is in flight or held, else the request is dropped. So a frame
         * that refused a consumed detection asks again from the same call.
         */
        afterProcess(result, post) {
            if (stopped) return;
            if (phase === "handed") {
                if (result.detectionUse === "consumed") counts.consumptions++;
                else if (result.detectionUse === "ignored") counts.ignored++;
                else throw new Error("a handed-in detection was neither consumed nor ignored");
                phase = "idle";
            }
            if (!result.needsDetection) return;
            counts.requests++;
            if (phase !== "idle") {
                counts.dropped++;
                return;
            }
            // Before `post()`, so a post that answers at once still finds a job in flight.
            counts.posted++;
            phase = "inFlight";
            post();
        },

        /**
         * The worker's answer to the job in flight, to be handed to the next
         * frame. Throws when no job is in flight: an answer to a job the
         * policy did not post is a defect of the caller's. After `stop()` it
         * does nothing — the job was discarded there.
         */
        arrive(result) {
            if (stopped) return;
            if (phase !== "inFlight") throw new Error("a detection arrived with nothing in flight");
            detection = result;
            phase = "held";
        },

        /**
         * The end of the run: a job in flight, or whose result was held or
         * handed but not settled, is counted `discardedAtStop`. Every call
         * after this one — including a second `stop()` — does nothing.
         */
        stop() {
            if (stopped) return;
            stopped = true;
            if (phase !== "idle") counts.discardedAtStop++;
            phase = "idle";
            detection = null;
        },

        /** Whether a job has been posted and its answer has not arrived. */
        get inFlight() {
            return phase === "inFlight";
        },

        /** Whether an answer has arrived and no frame has taken it yet. */
        get held() {
            return phase === "held";
        },

        /** The counts so far, as a snapshot. */
        accounting() {
            return { ...counts };
        },
    };
}
