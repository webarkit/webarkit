/*
 *  detection-worker-core.test.mjs
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
 * The detection worker's core, run in Node with the real modules injected:
 * the tracker's own `prepareDetection`/`detectTarget`, the jsfeatNext
 * backend, the committed `pinball.wnft` and a camera view of the target
 * rendered the way the package's own shipped-target tests render one. What is
 * pinned is that the worker computes exactly what the main thread would, and
 * that what it replies survives the `postMessage` boundary.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_MAX_SCENE_KEYPOINTS,
    DEFAULT_RANSAC_THRESHOLD,
    DEFAULT_RATIO,
    DEFAULT_SCENE_LEVELS,
    decode,
    detectTarget,
    prepareDetection,
} from "../../packages/nft-tracker/dist/index.js";
import { createJsfeatNextBackend } from "../../packages/cv-backend-jsfeatnext/dist/index.js";
import { readPgm, TARGET_FIXTURE } from "../../packages/nft-tracker/test/fixtures/pgm.ts";
import { renderWarp, view } from "../../packages/nft-tracker/test/fixtures/warped_frames.ts";
import { sha256Hex } from "../js/bench-metrics.mjs";
import { prepareWorkerDetection, runWorkerDetection } from "../js/detection-worker-core.mjs";

const OPTIONS = {
    sceneLevels: DEFAULT_SCENE_LEVELS,
    maxSceneKeypoints: DEFAULT_MAX_SCENE_KEYPOINTS,
    ratio: DEFAULT_RATIO,
    ransacThreshold: DEFAULT_RANSAC_THRESHOLD,
};

const PREPARE_DEPS = {
    createBackend: createJsfeatNextBackend,
    decode,
    prepareDetection,
    sha256Hex,
};
const RUN_DEPS = { detectTarget, now: () => performance.now() };

/** The committed target's bytes, as the page hands them over: a bare `ArrayBuffer`. */
function targetBytes() {
    const file = readFileSync(new URL("../targets/pinball.wnft", import.meta.url));
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

/** The reference device's camera path: 270 x 360 grey frames, the target at about 0.45. */
const CAMERA = { width: 270, height: 360 };
const image = readPgm(TARGET_FIXTURE);
const frame = renderWarp(image, view({ target: image, frame: CAMERA, scale: 0.45 }), {
    ...CAMERA,
    blurPasses: 1,
    noiseSigma: 2,
    seed: 1,
});

/** mulberry32: four lines, identical across platforms, which `Math.random` is not. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** `run()` with `Math.random` seeded, restored however it ends. */
function seeded(seed, run) {
    const original = Math.random;
    Math.random = mulberry32(seed);
    try {
        return run();
    } finally {
        Math.random = original;
    }
}

describe("prepareWorkerDetection", () => {
    it("prepares the same setup the tracker builds, and reports the target's SHA-256", async () => {
        const bytes = targetBytes();
        const state = await prepareWorkerDetection(
            { targetBytes: bytes, options: OPTIONS },
            PREPARE_DEPS,
        );

        expect(state.targetSha256).toBe(await sha256Hex(bytes));
        expect(state.targetSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(state.setup.maxSceneKeypoints).toBe(300);
        expect(state.setup.ratio).toBe(0.8);
    });

    it("refuses a target the decoder refuses, with the decoder's reason", async () => {
        await expect(
            prepareWorkerDetection(
                { targetBytes: new Uint8Array(16), options: OPTIONS },
                PREPARE_DEPS,
            ),
        ).rejects.toThrow(/decode|magic|header/i);
    });
});

describe("runWorkerDetection", () => {
    it("detects exactly what detectTarget detects on the main thread", async () => {
        const bytes = targetBytes();
        const state = await prepareWorkerDetection(
            { targetBytes: bytes, options: OPTIONS },
            PREPARE_DEPS,
        );
        const reply = seeded(42, () =>
            runWorkerDetection(state, { jobId: 1, runId: 1, frame, timestampMs: 12.5 }, RUN_DEPS),
        );

        // The main thread's own pipeline, on its own backend and its own decode.
        const cv2 = await createJsfeatNextBackend();
        const decoded = decode(bytes);
        expect(decoded.ok).toBe(true);
        const direct = seeded(42, () =>
            detectTarget(cv2, prepareDetection(cv2, decoded.target, OPTIONS), frame, 12.5),
        );

        // The comparison means something only if the frame is one the target is found in.
        expect(direct.ok).toBe(true);
        expect(reply.detection.ok).toBe(true);
        expect(reply.detection.timestampMs).toBe(12.5);
        expect(reply.detection.numMatches).toBe(direct.numMatches);
        expect(reply.detection.numInliers).toBe(direct.numInliers);
        expect(Array.from(reply.detection.H)).toEqual(Array.from(direct.H));
        expect(reply.detection.sceneKeypoints).toEqual(direct.sceneKeypoints);
    });

    it("returns a reply that survives structuredClone, with the job and run ids and the worker's stage times", async () => {
        const state = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        const reply = seeded(42, () =>
            runWorkerDetection(state, { jobId: 7, runId: 3, frame, timestampMs: 12.5 }, RUN_DEPS),
        );

        expect(structuredClone(reply)).toEqual(reply);
        expect(reply.type).toBe("result");
        expect(reply.jobId).toBe(7);
        expect(reply.runId).toBe(3);

        const stages = Object.keys(reply.workerMs);
        expect(stages).toEqual(
            expect.arrayContaining(["detect", "describe", "match", "estimateHomography", "total"]),
        );
        expect(stages).not.toContain("filterMatches"); // jsfeatNext has none

        // Strictly positive, not merely >= 0: a backend that bypassed the timing wrapper would
        // report 0 for every stage. This frame is detected, so every stage ran, the homography too.
        for (const stage of ["detect", "describe", "match", "estimateHomography", "total"]) {
            expect(reply.workerMs[stage], stage).toBeGreaterThan(0);
        }

        const { total, ...perStage } = reply.workerMs;
        const sum = Object.values(perStage).reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThanOrEqual(sum);
    });

    it("resets the stage times before each detection, so a reply carries only its own frame's cost", async () => {
        const state = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        const message = { jobId: 1, runId: 1, frame, timestampMs: 0 };
        seeded(42, () => runWorkerDetection(state, message, RUN_DEPS));

        // What a previous frame left behind, far beyond what one detection can cost.
        for (const key of Object.keys(state.timings)) state.timings[key] = 1e9;
        const reply = seeded(42, () => runWorkerDetection(state, message, RUN_DEPS));

        for (const ms of Object.values(reply.workerMs)) expect(ms).toBeLessThan(1e6);
    });
});
