/*
 *  s2_oracle_hash.test.ts
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

// #137's evidence for #24's wiring: the oracle's output over acceptance.test.ts's
// S2, the 252 renders #105 compared against, hashed. Recorded on the base before
// `RansacOptions.rng` was wired, and asserted unchanged after.
//
// What this does and does not cover: S2 takes H from the tracking step
// (`trackFrame`) and calls the oracle only for `poseFromHomography`. It never
// calls `estimateHomography`, the method #24 changes, so this hash cannot fail
// on the changed path; it shows that the oracle's values #105 compared
// against (H, and poseFromHomography's R, t and good) did not move. The
// changed path has its own hash in cv-backend-jsfeatnext/test/ransac_rng.test.ts.
//
// The loop below is S2's, copied rather than shared so that acceptance.test.ts
// stays as registered.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import {
    DEFAULT_ALIGN_EPSILON,
    DEFAULT_ALIGN_MAX_ITERATIONS,
    DEFAULT_FIT_EPSILON,
    DEFAULT_FIT_MAX_ITERATIONS,
    DEFAULT_MAX_FIT_RMS,
    DEFAULT_MAX_FRAME_LEVELS,
    DEFAULT_MAX_OUTLIER_SHARE,
    DEFAULT_MIN_PATCH_ZNCC,
    DEFAULT_MIN_TRACKED_PATCHES,
    DEFAULT_PHOTOMETRIC,
    DEFAULT_TUKEY_C,
} from "../../src/index.js";
import { decode } from "../../src/target/format/index.js";
import { trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions } from "../../src/tracking/track_frame.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { renderWarp } from "../fixtures/warped_frames.js";
import { s1Views } from "./pose_metric.js";

/** acceptance.test.ts's constants, unchanged. */
const CAMERA = { width: 270, height: 360 };
const SCALE = 0.45;
const image = readPgm(TARGET_FIXTURE);
const K = intrinsics(CAMERA.width, CAMERA.height);
const Z = K[0] / SCALE;
const decoded = decode(
    new Uint8Array(
        readFileSync(
            fileURLToPath(new URL("../../../../examples/targets/pinball.wnft", import.meta.url)),
        ),
    ),
);
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const shipped = trackTarget(decoded.target.patches!, decoded.target.pyramid.scaleStep);
const SHIPPED_OPTIONS: TrackFrameOptions = {
    maxFrameLevels: DEFAULT_MAX_FRAME_LEVELS,
    align: {
        maxIterations: DEFAULT_ALIGN_MAX_ITERATIONS,
        epsilon: DEFAULT_ALIGN_EPSILON,
        photometric: DEFAULT_PHOTOMETRIC,
    },
    fit: {
        maxIterations: DEFAULT_FIT_MAX_ITERATIONS,
        tukeyC: DEFAULT_TUKEY_C,
        epsilon: DEFAULT_FIT_EPSILON,
    },
    minTrackedPatches: DEFAULT_MIN_TRACKED_PATCHES,
    maxOutlierShare: DEFAULT_MAX_OUTLIER_SHARE,
    maxFitRms: DEFAULT_MAX_FIT_RMS,
    minPatchZncc: DEFAULT_MIN_PATCH_ZNCC,
};
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10 };

let cv: CvBackend;
beforeAll(async () => {
    cv = await createJsfeatNextBackend();
});

/** Little-endian float64 bytes, so the hash is the same on every platform. */
function f64(values: ArrayLike<number>): Uint8Array {
    const out = new Uint8Array(8 * values.length);
    const view = new DataView(out.buffer);
    for (let k = 0; k < values.length; k++) view.setFloat64(8 * k, values[k], true);
    return out;
}

describe("S2's oracle output is what it was before #24 (the hash #137 asks for)", () => {
    // Recorded on the base (origin/dev 90cb2a5), twice, before
    // `RansacOptions.rng` was wired.
    const BASE_SHA256 = "fbcf3d06bdfe36d51046fc9052cdc9f967469acc5d0816c2c2e5bfc46dd7c90a";

    it("hashes, per S2 render, the fitted H and poseFromHomography's R, t and good", () => {
        // S2 seeds its renders explicitly; nothing on its path reads the
        // global Math.random, which is counted here rather than assumed.
        const original = Math.random;
        let reads = 0;
        Math.random = () => {
            reads++;
            return original();
        };
        const hash = createHash("sha256");
        let steps = 0;
        let fitted = 0;
        try {
            for (const v of s1Views(K, image, Z)) {
                for (const seed of [1, 2, 3]) {
                    const frame = renderWarp(image, v.H, { ...RENDER, seed });
                    const r = trackFrame(frame, shipped, null, v.H, SHIPPED_OPTIONS, null);
                    steps++;
                    if (!r.ok) {
                        hash.update(Uint8Array.of(0));
                        continue;
                    }
                    fitted++;
                    const oracle = cv.poseFromHomography(r.H, K);
                    hash.update(Uint8Array.of(1));
                    hash.update(f64(r.H));
                    hash.update(f64(oracle.R));
                    hash.update(f64(oracle.t));
                    hash.update(Uint8Array.of(oracle.good ? 1 : 0));
                }
            }
        } finally {
            Math.random = original;
        }
        const digest = hash.digest("hex");
        console.log(
            `(a) S2 oracle output: ${steps} renders, ${fitted} fitted, Math.random reads ${reads}, sha256 ${digest}`,
        );
        expect(steps).toBe(252);
        expect(reads).toBe(0);
        expect(digest).toBe(BASE_SHA256);
    }, 300_000);
});
