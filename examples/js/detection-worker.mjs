/*
 *  detection-worker.mjs
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
 * The bench page's detection worker: the shell around
 * `./detection-worker-core.mjs`, which owns the logic and documents the message
 * protocol. This file owns what the core must not: `self`, `postMessage`, and
 * the imports of the packages that the core receives as `deps`.
 *
 * It is not loaded as it stands. The packages import each other by bare name
 * (`@webarkit/jsfeat-next`, `@webarkit/cv-backend-spec`), and a module worker
 * does not read the page's import map, so `npm run build:worker` bundles this
 * file with esbuild into `examples/dist/detection-worker.mjs`, with every import
 * resolved. The page starts that bundle with
 * `new Worker(new URL("./dist/detection-worker.mjs", location.href), { type: "module" })`.
 *
 * Any failure, in `init` or in `detect`, is answered with an `error` message,
 * so the page hears of it and no promise rejects unhandled inside the worker.
 * A `detect` that arrives while the worker holds no target, before `init` was
 * answered or after it failed, is one such failure.
 */

import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";
import { decode, detectTarget, prepareDetection } from "@webarkit/nft-tracker";
import { sha256Hex } from "./bench-metrics.mjs";
import { prepareWorkerDetection, runWorkerDetection } from "./detection-worker-core.mjs";

const PREPARE_DEPS = { createBackend: createJsfeatNextBackend, decode, prepareDetection, sha256Hex };
// The same clock the backend's stage timings read, so `workerMs.total` and the
// stages it contains are on one timeline.
const RUN_DEPS = { detectTarget, now: () => performance.now() };

/** What `prepareWorkerDetection` returned for the target in use; `null` while there is none. */
let state = null;

self.onmessage = async ({ data }) => {
    const { type, jobId, runId } = data ?? {};
    try {
        if (type === "init") {
            // A failed `init` must not leave the worker detecting against the
            // target of an earlier one.
            state = null;
            state = await prepareWorkerDetection(data, PREPARE_DEPS);
            self.postMessage({ type: "ready", targetSha256: state.targetSha256 });
        } else if (type === "detect") {
            if (state === null) throw new Error("detect before init: the worker has no target");
            self.postMessage(runWorkerDetection(state, data, RUN_DEPS));
        } else {
            throw new Error(`unknown message type: ${String(type)}`);
        }
    } catch (error) {
        // The ids are the job's, and only a `detect` has a job.
        const ids = type === "detect" ? { jobId, runId } : {};
        const message = error instanceof Error ? error.message : String(error);
        self.postMessage({ type: "error", ...ids, message });
    }
};
