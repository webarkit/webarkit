/*
 *  detection-worker-core.mjs
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
 * What the bench page's detection worker does, apart from being a worker: it
 * decodes the target, builds its own backend and detection setup from it, and
 * runs `detectTarget` on the frames the page posts. The worker entry is a thin
 * shell that owns `self`, `postMessage` and the imports of the packages; this
 * module owns the logic, so a Node test can run it with the real modules and
 * compare its output with the main thread's.
 *
 * It imports none of the packages and no backend: every one of those arrives
 * in `deps`, which is how the Node test injects the real modules and the
 * worker entry injects the bundled ones. It does import two pure local
 * modules, `./instrument-backend.mjs` and `./bench-metrics.mjs`, so that the
 * worker times a backend stage by the page's own definition.
 *
 * **Message protocol** (structured-clone values; nothing here posts):
 *
 * page → worker
 *
 * - `{ type: "init", targetBytes: ArrayBuffer, options: { sceneLevels,
 *   maxSceneKeypoints, ratio, ransacThreshold } }`: once. `options` is
 *   `prepareDetection`'s, the values the page's own detection runs with.
 * - `{ type: "detect", jobId, runId, frame: { width, height, data },
 *   timestampMs }`: one grey frame (`data` a `Uint8Array` of `width × height`),
 *   to detect the target in. `jobId` names the request and `runId` the
 *   benchmark run it belongs to; the worker only echoes both.
 *
 * worker → page
 *
 * - `{ type: "ready", targetSha256 }`: after `init`, when the worker can
 *   detect. `targetSha256` is the SHA-256 of the bytes it decoded, or `null`
 *   where SubtleCrypto is unavailable, so the page can check the worker holds
 *   the target it sent.
 * - `{ type: "result", jobId, runId, detection, workerMs }`: the answer to one
 *   `detect`, built by {@link runWorkerDetection}.
 * - `{ type: "error", jobId?, runId?, message }`: a request the worker could
 *   not serve; `jobId` and `runId` are present when a `detect` failed, absent
 *   when `init` did.
 */

import { DETECTION_STAGES } from "./bench-metrics.mjs";
import { instrumentBackend } from "./instrument-backend.mjs";

/**
 * Decodes the target and builds the worker's state from it: a backend, wrapped
 * so each stage is timed into `timings`, and the tracker's own detection
 * setup for that backend and target.
 *
 * `deps` is `{ createBackend, decode, prepareDetection, sha256Hex }`, the
 * page's `createJsfeatNextBackend` and the tracker package's `decode` and
 * `prepareDetection` — the very functions the main thread's pipeline calls.
 * Rejects with the decoder's `error: detail` on a target it refuses, and with
 * whatever `prepareDetection` throws on one the backend cannot read or on an
 * option out of its domain.
 *
 * Returns `{ cv, setup, timings, targetSha256 }`, which
 * {@link runWorkerDetection} takes as its `state`.
 */
export async function prepareWorkerDetection({ targetBytes, options }, deps) {
    const decoded = deps.decode(targetBytes);
    if (!decoded.ok) throw new Error(`${decoded.error}: ${decoded.detail}`);

    // One slot per stage `instrumentBackend` can time, the pose's too: a call
    // to a stage without a slot would add to `undefined`.
    const timings = Object.fromEntries([...DETECTION_STAGES, "pose"].map((stage) => [stage, 0]));
    const cv = instrumentBackend(await deps.createBackend(), timings);
    const setup = deps.prepareDetection(cv, decoded.target, options);
    return { cv, setup, timings, targetSha256: await deps.sha256Hex(targetBytes) };
}

/**
 * Runs the detection pipeline on one frame and builds the worker's reply.
 *
 * `deps` is `{ detectTarget, now }`: the tracker package's `detectTarget`, and
 * a clock returning milliseconds on the worker's own timeline. `workerMs` is
 * the stage time the backend spent on this frame, for every stage of
 * {@link DETECTION_STAGES} the backend has, and `total`, the whole
 * `detectTarget` call. The stage timings are reset first, so a reply carries
 * its own frame's cost and never the sum of the frames before it; `total`
 * exceeds their sum by what `detectTarget` does between backend calls.
 *
 * The reply is a plain structure of numbers, strings and typed arrays, which
 * `postMessage` clones intact (`Detection` is documented to survive
 * `structuredClone`).
 */
export function runWorkerDetection(state, { jobId, runId, frame, timestampMs }, deps) {
    for (const stage of Object.keys(state.timings)) state.timings[stage] = 0;

    const t0 = deps.now();
    const detection = deps.detectTarget(state.cv, state.setup, frame, timestampMs);
    const total = deps.now() - t0;

    const workerMs = {};
    for (const stage of DETECTION_STAGES) {
        if (typeof state.cv[stage] === "function") workerMs[stage] = state.timings[stage];
    }
    workerMs.total = total;
    return { type: "result", jobId, runId, detection, workerMs };
}
