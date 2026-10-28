/*
 *  track_frame_sweep.ts
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

// #90's sweep: one tracking step on the shipped target from 137 predictions,
// on both views of five renders, and the verdict on each fit. Moved from
// test/tracking/track_frame.test.ts (#130), which asserts on what
// `shippedSweep` returns; the views, the render settings and the error
// measure are shared with that file's own tests, which import them from here.
// The moved comments are kept as written: where one says "this file", "above"
// or "the fixture's tests", it means that test file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Mat3 } from "@webarkit/cv-backend-spec";
import {
    decode,
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
import { trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions, TrackFrameResult } from "../../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import {
    mat3Mul,
    project,
    renderWarp,
    rotation,
    scaling,
    translation,
    view,
} from "../fixtures/warped_frames.js";

export const image = readPgm(TARGET_FIXTURE);
export const patches = pinballPatches();
export const target = trackTarget(patches, PINBALL_STEP);
export const CAMERA = { width: 270, height: 360 };
export const VIEWS: Mat3[] = [
    view({ target: image, frame: CAMERA, scale: 0.45 }),
    view({
        target: image,
        frame: CAMERA,
        scale: 0.45,
        angle: (15 * Math.PI) / 180,
        perspective: [0.0004, -0.0003],
    }),
];
export const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10, seed: 3 };

/** RMS, frame px, between where `A` and `B` put the 64 patch centres. */
export function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let q = 0; q < patches.count; q++) {
        const [ax, ay] = project(A, target.centres[2 * q], target.centres[2 * q + 1]);
        const [bx, by] = project(B, target.centres[2 * q], target.centres[2 * q + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / patches.count);
}

/** `E` applied in the frame about the target centre's image: the prediction is `E · truth`. */
export function about(E: Mat3, H: Mat3): Mat3 {
    const [cx, cy] = project(H, (image.width - 1) / 2, (image.height - 1) / 2);
    return mat3Mul(mat3Mul(translation(cx, cy), mat3Mul(E, translation(-cx, -cy))), H);
}

/** The 16 translations of `d` px, 22.5° apart. */
export function shifts(d: number): Mat3[] {
    return Array.from({ length: 16 }, (_, k) => {
        const a = (k * Math.PI) / 8;
        return translation(d * Math.cos(a), d * Math.sin(a));
    });
}

/**
 * The shipped configuration on this suite's ground truth: the patches of the
 * committed `examples/targets/pinball.wnft`, stepped from the same 137
 * predictions as the judgement's margins above (translations to 8 px in 16
 * directions, roll to ±6°, scale to ±12%), on both views of five renders of
 * this file's kind (seeds 1–5), with the tracker's default options. The
 * fixture above stays at M2's 64 patches on purpose; this block follows
 * compile-target's default and the tracker's, so a change to either that
 * admits a wrong fit fails here. Five renders, not this file's one, because
 * on one render lowering `DEFAULT_MIN_TRACKED_PATCHES` to 7 admits nothing:
 * the wrong fit it admits is on another (found in review). Errors are measured
 * at the fixture's 64 patch centres, as everywhere in this file.
 */
const decoded = decode(
    new Uint8Array(
        readFileSync(
            fileURLToPath(new URL("../../../../examples/targets/pinball.wnft", import.meta.url)),
        ),
    ),
);
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const shipped = trackTarget(decoded.target.patches!, decoded.target.pyramid.scaleStep);
// The tracker's own defaults, mapped as its constructor maps them — not
// this file's OPTIONS, which pin M2's values for the fixture's tests: a
// shipped-configuration test must move when a default does (found in
// review: at the file's OPTIONS, lowering DEFAULT_MIN_TRACKED_PATCHES to 7
// left this sweep at 8).
export const SHIPPED_OPTIONS: TrackFrameOptions = {
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

/** The 137 predictions, as errors `E` applied about the target centre. */
export function shippedSweepErrors(): Mat3[] {
    const deg = (a: number) => (a * Math.PI) / 180;
    const errors: Mat3[] = [translation(0, 0)];
    for (const d of [1, 2, 3, 4, 5, 6, 8]) errors.push(...shifts(d));
    for (const a of [1, 2, 3, 4, 5, 6]) errors.push(rotation(deg(a)), rotation(deg(-a)));
    for (const f of [1.02, 1.04, 1.06, 1.08, 1.1, 1.12]) errors.push(scaling(f), scaling(1 / f));
    return errors;
}

/**
 * Every step of the sweep, in order (seed, then view, then prediction), and
 * the verdict on each fit: `right` holds the inliers of every fit within 0.5
 * px RMS of the truth at the patch centres, `wrong` the error of every fit
 * further off; a step that is not `ok` is refused.
 */
export function shippedSweep(): {
    right: number[];
    wrong: number[];
    steps: TrackFrameResult[];
} {
    const errors = shippedSweepErrors();
    const right: number[] = [];
    const wrong: number[] = [];
    const steps: TrackFrameResult[] = [];
    for (let seed = 1; seed <= 5; seed++) {
        const frames = VIEWS.map((H) => renderWarp(image, H, { ...RENDER, seed }));
        VIEWS.forEach((H, v) => {
            for (const E of errors) {
                const r = trackFrame(frames[v], shipped, null, about(E, H), SHIPPED_OPTIONS, null);
                steps.push(r);
                if (!r.ok) continue;
                if (centreRms(r.H, H) < 0.5) right.push(r.stats.inliers);
                else wrong.push(centreRms(r.H, H));
            }
        });
    }
    return { right, wrong, steps };
}
