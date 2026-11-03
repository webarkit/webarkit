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
import { readPgm, TARGET_FIXTURE } from "../../packages/nft-tracker/ground-truth/fixtures/pgm.ts";
import {
    renderWarp,
    view,
} from "../../packages/nft-tracker/ground-truth/fixtures/warped_frames.ts";
import { sha256Hex } from "../js/bench-metrics.mjs";
import { prepareWorkerDetection, runWorkerDetection } from "../js/detection-worker-core.mjs";
import { frameRng, mulberry32 } from "../js/frame-rng.mjs";

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

/**
 * `run()` with the global `Math.random`'s reads counted, each passed to the real
 * one, which is put back however `run()` ends: `{ value, draws }`, `draws` the
 * reads. A counting wrapper, not a seed: the region draws what it always would.
 * Synchronous only: `draws` is read when `run()` returns, so a `run()` that
 * returns a promise would report 0 for work that had not run yet, and a check
 * that `draws` is 0 could not tell "zero draws" from "did not observe the
 * draws". Such a check is blind, so the shape is refused.
 */
function globalReads(run) {
    const real = Math.random;
    let draws = 0;
    Math.random = () => {
        draws++;
        return real();
    };
    try {
        const value = run();
        if (typeof value?.then === "function") {
            throw new TypeError(
                "globalReads(): run() returned a thenable; draws is read and Math.random is " +
                    "restored when run() returns, before the awaited work draws, so the " +
                    "count would be 0 without observing anything",
            );
        }
        return { value, draws };
    } finally {
        Math.random = real;
    }
}

/**
 * `run(rng)` with an injected generator (#151): `rng` is a fresh `mulberry32(seed)`
 * (examples/js/frame-rng.mjs), counted, which `run` hands on through the
 * contract's `RansacOptions.rng` (#24). Returns `{ value, draws }`, `draws` the
 * draws `rng` gave. The global `Math.random` is not seeded: its reads are
 * counted ({@link globalReads}), and any is refused, since with the generator
 * injected a read of the global is a draw the seed does not reach.
 */
function withCountedRng(seed, run) {
    const next = mulberry32(seed);
    let draws = 0;
    const rng = () => {
        draws++;
        return next();
    };
    const { value, draws: reads } = globalReads(() => run(rng));
    if (reads !== 0) {
        throw new Error(`${reads} read(s) of the global Math.random with the rng injected`);
    }
    return { value, draws };
}

/** {@link withCountedRng}'s value alone. */
const withRng = (seed, run) => withCountedRng(seed, run).value;

/** The worker's run deps, with `rng` injected into its `detectTarget`, as a page's seed reaches it. */
const injected = (rng) => ({
    ...RUN_DEPS,
    detectTarget: (cv, setup, f, timestampMs) => detectTarget(cv, setup, f, timestampMs, rng),
});

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

    // #95, Task 1: the decoder's warnings were dropped, where the page logs its own.
    it("keeps the decoder's warnings, for the page to log as it logs its own", async () => {
        const file = readFileSync(
            new URL("../../fixtures/nft-target/0.3/warnings/unknown-chunk.wnft", import.meta.url),
        );
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        const state = await prepareWorkerDetection(
            { targetBytes: bytes, options: OPTIONS },
            PREPARE_DEPS,
        );
        expect(state.warnings).toEqual([
            { code: "UNKNOWN_CHUNK_SKIPPED", detail: 'chunk type "XTRA"' },
        ]);

        const clean = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        expect(clean.warnings).toEqual([]);
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
        const worker = withCountedRng(42, (rng) =>
            runWorkerDetection(
                state,
                { jobId: 1, runId: 1, frame, timestampMs: 12.5 },
                injected(rng),
            ),
        );
        const reply = worker.value;

        // The main thread's own pipeline, on its own backend and its own decode.
        const cv2 = await createJsfeatNextBackend();
        const decoded = decode(bytes);
        expect(decoded.ok).toBe(true);
        // Prepared outside the seed, as the worker's is above, so that nothing draws
        // on the seed before `detectTarget` in either arm and the comparison reads
        // only what `detectTarget` draws (#95, Task 1). Both setups are then built
        // unseeded, which is sound only while `prepareDetection` draws nothing; the
        // test below holds that.
        const setup = prepareDetection(cv2, decoded.target, OPTIONS);
        const direct = withCountedRng(42, (rng) => detectTarget(cv2, setup, frame, 12.5, rng));

        // The comparison means something only if the frame is one the target is found in.
        expect(direct.value.ok).toBe(true);
        expect(reply.detection.ok).toBe(true);
        expect(reply.detection.timestampMs).toBe(12.5);
        expect(reply.detection.numMatches).toBe(direct.value.numMatches);
        expect(reply.detection.numInliers).toBe(direct.value.numInliers);
        expect(Array.from(reply.detection.H)).toEqual(Array.from(direct.value.H));
        expect(reply.detection.sceneKeypoints).toEqual(direct.value.sceneKeypoints);

        // The two arms consumed the same amount of the seed. "The comparison reads
        // only what `detectTarget` draws" was, until here, a fact read off
        // `runWorkerDetection`, a thin wrapper that resets the timings, takes two
        // clock readings and delegates; this is the check of it. The worker arm
        // drawing more than the direct one would mean the wrapper, or something it
        // now calls, draws on the seed before or after `detectTarget`, and the
        // equalities above would then hold on two different RNG states only by
        // luck. The package side makes the same pair in `parity.test.ts`, "draws
        // randomness only inside RANSAC, and the same amount on both sides".
        expect(direct.draws).toBeGreaterThan(0);
        expect(worker.draws).toBe(direct.draws);
    });

    // #151: a seeded page posts its seed and the frame's media time, and the worker
    // builds the frame's generator, so that it detects what the synchronous path
    // detects on the same frame (frameRng, examples/js/frame-rng.mjs).
    it.each([
        [1, 2178 / 73],
        [2, 1 / 30],
        [-7, 4.5],
    ])(
        "given seed %i and the frame's media time %f, detects exactly what detectTarget detects with frameRng",
        async (seed, mediaTimeSeconds) => {
            const bytes = targetBytes();
            const state = await prepareWorkerDetection(
                { targetBytes: bytes, options: OPTIONS },
                PREPARE_DEPS,
            );
            const message = {
                jobId: 1,
                runId: 1,
                frame,
                timestampMs: 12.5,
                seed,
                mediaTimeSeconds,
            };
            const reply = runWorkerDetection(state, message, RUN_DEPS);

            const cv2 = await createJsfeatNextBackend();
            const setup = prepareDetection(cv2, decode(bytes).target, OPTIONS);
            const direct = detectTarget(cv2, setup, frame, 12.5, frameRng(seed, mediaTimeSeconds));
            expect(direct.ok).toBe(true);
            expect(reply.detection).toEqual(direct);
        },
    );

    it("hands detectTarget frameRng(seed, mediaTimeSeconds), and every draw comes from it", async () => {
        const state = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        const drawn = [];
        let args = null;
        const deps = {
            ...RUN_DEPS,
            detectTarget: (...a) => {
                args = a;
                const rng = a[4];
                return detectTarget(a[0], a[1], a[2], a[3], () => {
                    const x = rng();
                    drawn.push(x);
                    return x;
                });
            },
        };
        const message = {
            jobId: 1,
            runId: 1,
            frame,
            timestampMs: 12.5,
            seed: 5,
            mediaTimeSeconds: 3,
        };
        runWorkerDetection(state, message, deps);
        expect(args.slice(0, 4)).toEqual([state.cv, state.setup, frame, 12.5]);
        expect(typeof args[4]).toBe("function");
        expect(drawn.length).toBeGreaterThan(0);
        const fresh = frameRng(5, 3);
        expect(drawn).toEqual(drawn.map(() => fresh()));
    });

    it("hands detectTarget no rng without a seed: the backend draws as it always has", async () => {
        const state = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        for (const seed of [undefined, null]) {
            let args = null;
            const deps = {
                ...RUN_DEPS,
                detectTarget: (...a) => {
                    args = a;
                    return { ok: false };
                },
            };
            runWorkerDetection(state, { jobId: 1, runId: 1, frame, timestampMs: 0, seed }, deps);
            expect(args.length, String(seed)).toBe(4);
        }
    });

    it("refuses a seed without the frame's media time, which keys its generator", async () => {
        const state = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        expect(() =>
            runWorkerDetection(
                state,
                { jobId: 1, runId: 1, frame, timestampMs: 0, seed: 1 },
                RUN_DEPS,
            ),
        ).toThrow(RangeError);
    });

    // #95, Task 1: the comparison above builds both setups outside the seed. That is
    // sound only while `prepareDetection` draws nothing, since an unseeded draw could
    // build two different setups; the day it draws, both preparations need the seed,
    // and this test says so. Counted at the global `Math.random`, the seam an
    // unseeded draw reads; `detectTarget`, unseeded, is the control that the counter sees a draw.
    it("prepareDetection draws nothing from Math.random, which the seeded comparison above rests on", async () => {
        const cv2 = await createJsfeatNextBackend();
        const decoded = decode(targetBytes());
        expect(decoded.ok).toBe(true);

        const prepared = globalReads(() => prepareDetection(cv2, decoded.target, OPTIONS));
        expect(prepared.draws).toBe(0);

        // RANSAC's minimal-sample draws, through the same seam: the count is live.
        const detected = globalReads(() => detectTarget(cv2, prepared.value, frame, 12.5));
        expect(detected.value.ok).toBe(true);
        expect(detected.draws).toBeGreaterThan(0);
    });

    it("returns a reply that survives structuredClone, with the job and run ids and the worker's stage times", async () => {
        const state = await prepareWorkerDetection(
            { targetBytes: targetBytes(), options: OPTIONS },
            PREPARE_DEPS,
        );
        const reply = withRng(42, (rng) =>
            runWorkerDetection(
                state,
                { jobId: 7, runId: 3, frame, timestampMs: 12.5 },
                injected(rng),
            ),
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
        withRng(42, (rng) => runWorkerDetection(state, message, injected(rng)));

        // What a previous frame left behind, far beyond what one detection can cost.
        for (const key of Object.keys(state.timings)) state.timings[key] = 1e9;
        const reply = withRng(42, (rng) => runWorkerDetection(state, message, injected(rng)));

        for (const ms of Object.values(reply.workerMs)) expect(ms).toBeLessThan(1e6);
    });
});
