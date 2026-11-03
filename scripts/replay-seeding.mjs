/*
 *  replay-seeding.mjs
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
 * How `scripts/replay-clips.mjs` seeds RANSAC under `--seed` (#151): through
 * the contract's injected generator (`RansacOptions.rng`, #24), which the
 * tracker's `rngFor` option and `detectTarget`'s `rng` argument reach (#188),
 * never by swapping the global `Math.random`. The generators are
 * `examples/js/frame-rng.mjs`'s, the ones the bench page and its worker build.
 *
 * `--seed-policy` picks one of {@link SEED_POLICIES}; the module comment of
 * frame-rng.mjs says what each repeats.
 */

import { frameRng, runRng } from "../examples/js/frame-rng.mjs";

/** `--seed-policy`'s values, and the exports' `seedPolicy`'s. */
export const SEED_POLICIES = Object.freeze(["run", "frame"]);

/** `--seed-policy` when it is not given. */
export const DEFAULT_SEED_POLICY = "frame";

/**
 * One run's generators under `policy`, or `null` without a seed (the backend
 * then draws from `Math.random`, as an unseeded replay always has):
 *
 * - `frame(mediaTimeSeconds)`: the frame the run is about to process, called
 *   before each `process`;
 * - `rngFor`: the tracker's `rngFor` option, called by the tracker once per
 *   detection of its own, on the frame being processed;
 * - `detectionRng(mediaTimeSeconds)`: the `rng` for one `detectTarget` call
 *   on the frame whose media time that is (the external arms' detections).
 *
 * Under `run` all three hand out the one `runRng(seed)` the run was built
 * with; under `frame`, each call a fresh `frameRng(seed, t)`, `t` the media
 * time of the frame detected.
 *
 * @param {number | null} seed
 * @param {"run" | "frame"} policy
 */
export function runSeeding(seed, policy) {
    if (!SEED_POLICIES.includes(policy)) {
        throw new RangeError(`runSeeding: policy must be run or frame, got ${String(policy)}`);
    }
    if (seed === null) return null;
    if (policy === "run") {
        const rng = runRng(seed);
        return { policy, frame: () => {}, rngFor: () => rng, detectionRng: () => rng };
    }
    let current = null;
    return {
        policy,
        frame: (mediaTimeSeconds) => {
            current = mediaTimeSeconds;
        },
        rngFor: () => {
            if (current === null) {
                throw new Error("runSeeding: a detection before the frame it detects was set");
            }
            return frameRng(seed, current);
        },
        detectionRng: (mediaTimeSeconds) => frameRng(seed, mediaTimeSeconds),
    };
}

/**
 * Why a seeded replay cannot run on `cv`, or `null`: a backend that does not
 * declare `deterministicRansac` may ignore the injected generator, as the
 * contract allows, and a seeded run on it would be silently unseeded
 * (`requireDeterministicRansac` in the ground truth's `seeded_rng.ts`).
 */
export function seedingRefusal(cv) {
    if (cv.capabilities.deterministicRansac === true) return null;
    return `the backend "${cv.capabilities.name}" does not declare deterministicRansac, so it may ignore an injected rng: refusing to run seeded`;
}

/**
 * `run()` with the global `Math.random` counted, the real one put back however
 * it ends: `{ value, reads }`. Each read is passed to the real `Math.random`,
 * so the run's results are what they would be without the count. With the
 * generator injected, a read in a seeded run is a random choice the seed does
 * not reach. Synchronous only: a `run()` that returns a thenable is refused,
 * since its reads would come after the count was taken.
 */
export function countGlobalRandomReads(run) {
    const real = Math.random;
    let reads = 0;
    Math.random = () => {
        reads++;
        return real();
    };
    try {
        const value = run();
        if (typeof value?.then === "function") {
            throw new TypeError(
                "countGlobalRandomReads: run() returned a thenable, whose reads would not be counted",
            );
        }
        return { value, reads };
    } finally {
        Math.random = real;
    }
}
