/*
 *  c4_characterisation.test.ts
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

// The C4 characterisation the maintainer asked for on 2026-10-15, items 1 and
// 2: a development measurement on the desktop, printed, with only its own
// bookkeeping asserted. Item 1 reads the renders over C4's bound: is the
// failure the selector's (a better candidate rejected) or the estimator's
// (the chosen candidate was the better one and still lost to the closed
// form)? Item 2 renders a finer tilt grid than S2's, so that the tilt from
// which IPPE beats the closed form is measured rather than read off the first
// grid point above 0. Not campaign data; its figures go into
// docs/benchmarks/2026-10-15-m4-step3-ippe-c4-characterisation.md.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import { POSE_AMBIGUITY_SIGMA_TRACK_PX, selectPose } from "../../src/pose/select_pose.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { renderWarp } from "../fixtures/warped_frames.js";
import { grid, median, poseError, rigidView } from "./pose_metric.js";

const CAMERA = { width: 270, height: 360 };
const image = readPgm(TARGET_FIXTURE);
const G = grid(image.width, image.height);
const K = intrinsics(CAMERA.width, CAMERA.height);
const Z = K[0] / 0.45;
const decoded = decode(
    new Uint8Array(
        readFileSync(
            fileURLToPath(new URL("../../../../examples/targets/pinball.wnft", import.meta.url)),
        ),
    ),
);
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const shipped = trackTarget(decoded.target.patches!, decoded.target.pyramid.scaleStep);
const OPTIONS: TrackFrameOptions = {
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

interface Fit {
    tilt: number;
    azimuth: number;
    roll: number;
    shift: string;
    seed: number;
    ambiguous: boolean;
    eSelected: number;
    eRejected: number | null;
    eOracle: number;
    r: number;
}

/** One rendered, tracked, decomposed view. `null` when the tracker's gates refuse the step. */
function fit(v: ReturnType<typeof rigidView>, seed: number): Fit | null {
    const frame = renderWarp(image, v.H, { ...RENDER, seed });
    const r = trackFrame(frame, shipped, null, v.H, OPTIONS, null);
    if (!r.ok) return null;
    const n = r.stats.inliers;
    const src = new Float64Array(2 * n);
    const dst = new Float64Array(2 * n);
    for (let i = 0, k = 0; i < r.weights.length; i++) {
        if (!(r.weights[i] > 0)) continue;
        src[2 * k] = r.correspondences.src[2 * i];
        src[2 * k + 1] = r.correspondences.src[2 * i + 1];
        dst[2 * k] = r.correspondences.dst[2 * i];
        dst[2 * k + 1] = r.correspondences.dst[2 * i + 1];
        k++;
    }
    const s = selectPose(r.H, K, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
    const rejected =
        s.candidates && (s.chosen === 0 || s.chosen === 1) ? s.candidates[1 - s.chosen] : null;
    return {
        tilt: v.tiltDeg,
        azimuth: v.azimuthDeg,
        roll: v.rollDeg,
        shift: v.shift.join(","),
        seed,
        ambiguous: s.ambiguous,
        eSelected: poseError(K, s.pose, v.H, G),
        eRejected: rejected ? poseError(K, rejected, v.H, G) : null,
        eOracle: poseError(K, cv.poseFromHomography(r.H, K), v.H, G),
        r: r.stats.rmsError!,
    };
}

describe("C4 characterisation (development measurement)", () => {
    it("item 1: on every render over C4's bound, the rejected candidate is farther from the truth than the closed form, so the failure is the estimator's, not the selector's", () => {
        const over: Fit[] = [];
        let total = 0;
        for (const rollDeg of [0, 15]) {
            for (const shift of [
                [0, 0],
                [30, -20],
            ] as const) {
                const v = rigidView(K, image, { tiltDeg: 0, azimuthDeg: 0, rollDeg, shift, Z });
                for (const seed of [1, 2, 3]) {
                    const f = fit(v, seed);
                    if (!f) continue;
                    total++;
                    if (f.eSelected > f.eOracle + f.r) over.push(f);
                }
            }
        }
        const lines = over.map(
            (f) =>
                `  tilt ${f.tilt}° roll ${f.roll}° shift (${f.shift}) seed ${f.seed}: ambiguous ${f.ambiguous}; e(selected) ${f.eSelected.toFixed(3)}, e(rejected candidate) ${f.eRejected?.toFixed(3)}, e(closed form) ${f.eOracle.toFixed(3)}, fit residual ${f.r.toFixed(3)} px`,
        );
        console.log(
            `item 1: ${over.length} of ${total} fronto-parallel fits over the bound\n${lines.join("\n")}`,
        );
        expect(total).toBe(12);
        expect(over.length).toBe(7);
        for (const f of over) {
            expect(f.ambiguous).toBe(false);
            // The selector kept the better candidate: the rejected one is far worse.
            expect(f.eRejected!).toBeGreaterThan(f.eSelected);
            // And the rejected one would not have beaten the closed form either.
            expect(f.eRejected!).toBeGreaterThan(f.eOracle);
        }
    }, 120_000);

    it("item 2: the tilt from which IPPE's selected pose beats the closed form, on a finer grid than S2's", () => {
        const tilts = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50];
        const rows: {
            tilt: number;
            n: number;
            over: number;
            mSel: number;
            mOr: number;
            closer: number;
        }[] = [];
        for (const tiltDeg of tilts) {
            const fits: Fit[] = [];
            for (const azimuthDeg of tiltDeg === 0 ? [0] : [0, 45, 90, 135]) {
                for (const rollDeg of [0, 15]) {
                    for (const shift of [
                        [0, 0],
                        [30, -20],
                    ] as const) {
                        const v = rigidView(K, image, { tiltDeg, azimuthDeg, rollDeg, shift, Z });
                        for (const seed of [1, 2, 3]) {
                            const f = fit(v, seed);
                            if (f) fits.push(f);
                        }
                    }
                }
            }
            rows.push({
                tilt: tiltDeg,
                n: fits.length,
                over: fits.filter((f) => f.eSelected > f.eOracle + f.r).length,
                mSel: median(fits.map((f) => f.eSelected)),
                mOr: median(fits.map((f) => f.eOracle)),
                closer: fits.filter((f) => f.eSelected <= f.eOracle).length,
            });
        }
        console.log(
            `item 2 (3 seeds × 2 rolls × 2 shifts, × 4 azimuths above 0°):\n${rows
                .map(
                    (r) =>
                        `  tilt ${String(r.tilt).padStart(2)}°: ${r.n} fits, ${r.over} over C4's bound, median e(selected) ${r.mSel.toFixed(3)} px, median e(closed form) ${r.mOr.toFixed(3)} px, selected closer on ${r.closer} of ${r.n}, ratio of medians ${(r.mSel / r.mOr).toFixed(2)}`,
                )
                .join("\n")}`,
        );
        expect(rows.map((r) => r.n)).toEqual([12, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48]);
    }, 300_000);
});
