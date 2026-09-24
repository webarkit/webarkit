/*
 *  align_patch_accuracy.test.ts
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

import { describe, it, expect } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { alignPatch, buildFramePyramid, levelScale } from "../../src/index.js";
import type { FramePyramid, PatchObservation } from "../../src/index.js";
import { cutPatches, patchCentre, texturedSites } from "../fixtures/patch_table.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { mat3Mul, project, renderWarp, translation, view } from "../fixtures/warped_frames.js";

// Accuracy on clean warps: the pinball target rendered through a known
// homography with no noise, blur or photometric change, so the only error
// left is the alignment's own (plus the unavoidable mismatch between the
// renderer's area sampling and the pyramid's filter).

const STEP = Math.cbrt(2);
const P = 8;
const OPTIONS = { maxIterations: 30, epsilon: 0.01, photometric: false };
const FRAME = { width: 640, height: 480 };

function pyramidOf(image: GrayImage, levels: number): FramePyramid {
    const r = buildFramePyramid(image, { levels, scaleStep: STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    return s[s.length >> 1];
}

const target = readPgm(TARGET_FIXTURE);
const targetPyramid = pyramidOf(target, 7);
// Level-3 patches, and views that show the target at level 3's own scale:
// one patch pixel is one frame pixel, so each patch is matched at frame
// level 0 and alignment starts there.
const LEVEL = 3;
const SCALE = levelScale(STEP, LEVEL);
const sites = texturedSites(targetPyramid, P, LEVEL, 24, { minSpacing: 12, margin: 4 });
const patches = cutPatches(targetPyramid, P, sites);

const VIEWS: [string, Mat3][] = [
    ["frontal", view({ target, frame: FRAME, scale: SCALE })],
    ["rotated 30°", view({ target, frame: FRAME, scale: SCALE, angle: Math.PI / 6 })],
    ["tilted", view({ target, frame: FRAME, scale: SCALE, perspective: [0.0004, -0.0006] })],
];

/** The prediction errors tried: none, and 1 px in eight directions. */
const OFFSETS: [number, number][] = [[0, 0]];
for (let k = 0; k < 8; k++) {
    OFFSETS.push([Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
}

describe("alignPatch: accuracy", () => {
    // Measured: median 0.022 px, 95th percentile 0.045 px, worst 0.063 px;
    // a median of 4 iterations (95th percentile 6) at epsilon = 0.01 px;
    // median residual 4.1 grey levels, which is the blur mismatch between
    // the renderer's area sampling and the pyramid's filter.
    it("is sub-pixel: median error below 0.05 px, worst below 0.25 px, over 24 patches × 3 views × 9 predictions", () => {
        const errors: number[] = [];
        const results: PatchObservation[] = [];
        for (const [, H] of VIEWS) {
            const frame = pyramidOf(renderWarp(target, H, FRAME), 5);
            sites.forEach((site, q) => {
                const [X, Y] = patchCentre(site, P, STEP);
                const [tx, ty] = project(H, X, Y);
                for (const [dx, dy] of OFFSETS) {
                    const prediction = mat3Mul(translation(dx, dy), H);
                    const r = alignPatch(frame, patches, q, STEP, prediction, OPTIONS);
                    if (!r.ok) throw new Error(`patch ${q}: ${r.reason}`);
                    results.push(r.observation);
                    errors.push(Math.hypot(r.observation.x - tx, r.observation.y - ty));
                }
            });
        }
        expect(sites.length).toBe(24);
        expect(results.every((o) => o.converged && o.frameLevel === 0)).toBe(true);
        expect(results.every((o) => o.gain === 1 && o.bias === 0)).toBe(true);
        expect(median(errors)).toBeLessThan(0.05);
        expect(Math.max(...errors)).toBeLessThan(0.25);
    });

    it("degrades gracefully with sensor noise: median error below 0.1 px at σ = 4 grey levels, below 0.2 px at σ = 8, blur included", () => {
        // One blur pass (σ² = 0.5 px²) and seeded noise on the frontal view;
        // predictions exact or 1 px off, as above. Measured: median 0.070 px
        // (worst 0.17) at σ = 4, 0.082 px (worst 0.23) at σ = 8.
        const [, H] = VIEWS[0];
        for (const [sigma, bound] of [
            [4, 0.1],
            [8, 0.2],
        ]) {
            const rendered = renderWarp(target, H, {
                ...FRAME,
                blurPasses: 1,
                noiseSigma: sigma,
                seed: 48,
            });
            const frame = pyramidOf(rendered, 5);
            const errors: number[] = [];
            sites.forEach((site, q) => {
                const [X, Y] = patchCentre(site, P, STEP);
                const [tx, ty] = project(H, X, Y);
                for (const [dx, dy] of OFFSETS) {
                    const r = alignPatch(
                        frame,
                        patches,
                        q,
                        STEP,
                        mat3Mul(translation(dx, dy), H),
                        OPTIONS,
                    );
                    if (!r.ok) throw new Error(`patch ${q}: ${r.reason}`);
                    errors.push(Math.hypot(r.observation.x - tx, r.observation.y - ty));
                }
            });
            expect(median(errors)).toBeLessThan(bound);
        }
    });
});
