/*
 *  align_patch_photometric.test.ts
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
import type { AlignPatchOptions, FramePyramid, PatchObservation } from "../../src/index.js";
import { cutPatches, patchCentre, texturedSites } from "../fixtures/patch_table.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import type { RenderOptions } from "../fixtures/warped_frames.js";
import { mat3Mul, project, renderWarp, translation, view } from "../fixtures/warped_frames.js";

// Gain and bias: the frame's intensity as `gain · patch + bias`, estimated
// alongside the translation when `photometric` is set.
//
// Two facts shape these tests, both measured:
//
// - The pinball image spans 0..255, so any contrast increase or brightness
//   shift clips it, and a clipped frame is not an affine change of the patch.
//   The target here is therefore a low-contrast print of it, 0.5 · v + 64
//   (64..192), with room on both sides; each test checks the frames it
//   renders stay inside [0, 255] rather than assuming it.
// - Even on an unchanged frame the estimate is not (1, 0): measured gain
//   1.04, bias −4.5 on the full-contrast image. The renderer's frame is
//   sharper than the level-3 patch, so its texture has a few percent more
//   contrast, and an affine intensity model reads part of a blur difference
//   as gain (blurring the frame past the patch turns it below 1; see the
//   last test). What gain and bias guarantee is therefore relative: a frame
//   changed by (g, b) must give g · gain₀ and g · bias₀ + b, where (gain₀,
//   bias₀) is what the unchanged frame gives.

const STEP = Math.cbrt(2);
const P = 8;
const ON: AlignPatchOptions = { maxIterations: 30, epsilon: 0.01, photometric: true };
const OFF: AlignPatchOptions = { ...ON, photometric: false };
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

const full = readPgm(TARGET_FIXTURE);
const target: GrayImage = { ...full, data: full.data.map((v) => Math.round(0.5 * v + 64)) };
const LOW = 64;
const HIGH = 192;
const targetPyramid = pyramidOf(target, 7);
// Matched patches, as in the accuracy suite: level 3, seen at level 3's scale.
const sites = texturedSites(targetPyramid, P, 3, 24, { minSpacing: 12, margin: 4 });
const patches = cutPatches(targetPyramid, P, sites);
const H: Mat3 = view({ target, frame: FRAME, scale: levelScale(STEP, 3), angle: 0.3 });
const truths = sites.map((site) => {
    const [X, Y] = patchCentre(site, P, STEP);
    return project(H, X, Y);
});

/** Every patch aligned in a frame rendered with `render`, from predictions 1 px off. */
function alignAll(render: Partial<RenderOptions>, options: AlignPatchOptions) {
    const frame = pyramidOf(renderWarp(target, H, { ...FRAME, ...render }), 5);
    const observations: PatchObservation[] = [];
    const errors: number[] = [];
    truths.forEach(([tx, ty], q) => {
        for (const [dx, dy] of [
            [1, 0],
            [0, -1],
            [-0.7, 0.7],
        ]) {
            const r = alignPatch(frame, patches, q, STEP, mat3Mul(translation(dx, dy), H), options);
            if (!r.ok) throw new Error(`patch ${q}: ${r.reason}`);
            observations.push(r.observation);
            errors.push(Math.hypot(r.observation.x - tx, r.observation.y - ty));
        }
    });
    return {
        errors,
        converged: observations.every((o) => o.converged),
        gain: median(observations.map((o) => o.gain)),
        bias: median(observations.map((o) => o.bias)),
        observations,
    };
}

/** Contrast from 0.6 to 1.3 and brightness ±40, each inside [0, 255] on this target. */
const CHANGES: [number, number][] = [
    [0.6, 0],
    [1.3, 0],
    [1, -40],
    [1, 40],
    [0.7, 30],
    [1.2, -25],
];

describe("alignPatch: gain and bias", () => {
    const unchanged = alignAll({}, ON);

    it("never clips: every change keeps this target inside [0, 255]", () => {
        for (const [g, b] of CHANGES) {
            expect(g * LOW + b).toBeGreaterThanOrEqual(0);
            expect(g * HIGH + b).toBeLessThanOrEqual(255);
        }
    });

    it("keeps the clean-warp accuracy (median below 0.05 px) under brightness/contrast changes, carrying gain within 0.01·g and bias within 1 grey level", () => {
        expect(unchanged.converged).toBe(true);
        expect(median(unchanged.errors)).toBeLessThan(0.05);
        for (const [g, b] of CHANGES) {
            const changed = alignAll({ gain: g, bias: b }, ON);
            expect(changed.converged).toBe(true);
            expect(median(changed.errors)).toBeLessThan(0.05);
            expect(Math.abs(changed.gain - g * unchanged.gain)).toBeLessThan(0.01 * g);
            expect(Math.abs(changed.bias - (g * unchanged.bias + b))).toBeLessThan(1);
        }
    });

    it("is what the changes need: without it, errors grow 14× to 2000×, except for a change that pivots at the patches' mean grey level (2×)", () => {
        // Measured, median error off / on: 2182× (gain 0.6: uncompensated
        // alignment diverges, 42 px), 50× (1.3), 75× and 90× (bias ∓40), 14×
        // (0.7 / +30). A change leaves grey level b / (1 − g) where it was;
        // for 1.2 / −25 that is 125, the patches' own mean (126), so it only
        // rescales their contrast about their mean, which a translation-only
        // fit barely notices: 2.1×. Compensating never loses.
        const mean = patches.pixels.reduce((a, v) => a + v, 0) / patches.pixels.length;
        for (const [g, b] of CHANGES) {
            const on = alignAll({ gain: g, bias: b }, ON);
            const off = alignAll({ gain: g, bias: b }, OFF);
            expect(off.observations.every((o) => o.gain === 1 && o.bias === 0)).toBe(true);
            expect(median(off.errors)).toBeGreaterThan(median(on.errors));
            const pivotsAtMean = g !== 1 && Math.abs(b / (1 - g) - mean) < 10;
            if (!pivotsAtMean) expect(median(off.errors)).toBeGreaterThan(10 * median(on.errors));
        }
    });

    it("reads a blur mismatch as contrast: a frame sharper than the patch gives gain > 1, a blurrier one gain < 1", () => {
        // Q11 in one number: gain drifts from 1 when the frame and the patch
        // are not filtered alike, even with no photometric change at all.
        expect(unchanged.gain).toBeGreaterThan(1);
        expect(alignAll({ blurPasses: 1 }, ON).gain).toBeLessThan(1);
    });

    it("fails singular when the frame region is flat: the gain collapses to 0, no position is invented", () => {
        // A view that puts the target far outside: the frame is background.
        const away = mat3Mul(translation(5000, 0), H);
        const flat = pyramidOf(renderWarp(target, away, FRAME), 5);
        for (let q = 0; q < sites.length; q++) {
            const r = alignPatch(flat, patches, q, STEP, H, ON);
            expect(r.ok ? "ok" : r.reason).toBe("singular");
        }
    });

    it("reports the cap, not a failure: one iteration from 2 px off is unconverged, and finite", () => {
        const frame = pyramidOf(renderWarp(target, H, { ...FRAME, gain: 0.8, bias: 20 }), 5);
        for (const photometric of [false, true]) {
            const r = alignPatch(frame, patches, 0, STEP, mat3Mul(translation(2, 0), H), {
                ...ON,
                maxIterations: 1,
                photometric,
            });
            if (!r.ok) throw new Error(r.reason);
            const o = r.observation;
            expect(o.converged).toBe(false);
            expect(o.iterations).toBe(1);
            for (const v of [o.x, o.y, o.residual, o.gain, o.bias]) {
                expect(Number.isFinite(v)).toBe(true);
            }
        }
    });
});
