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
import type {
    AlignPatchOptions,
    FramePyramid,
    PatchAlignment,
    PatchObservation,
} from "../../src/index.js";
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
//   (64..192), with room on both sides; the first test checks that every
//   change keeps it inside [0, 255] rather than assuming it.
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

/** The target in the view `H`, rendered with `render`, as a pyramid. */
function frameOf(render: Partial<RenderOptions>): FramePyramid {
    return pyramidOf(renderWarp(target, H, { ...FRAME, ...render }), 5);
}

/** Every patch aligned with gain and bias from `d` px off, in `directions` directions. */
function fromOff(frame: FramePyramid, d: number, directions: number) {
    const results: { r: PatchAlignment; error: number }[] = [];
    truths.forEach(([tx, ty], q) => {
        for (let k = 0; k < directions; k++) {
            const a = (2 * k * Math.PI) / directions;
            const off = translation(d * Math.cos(a), d * Math.sin(a));
            const r = alignPatch(frame, patches, q, STEP, mat3Mul(off, H), ON);
            const error = r.ok ? Math.hypot(r.observation.x - tx, r.observation.y - ty) : Infinity;
            results.push({ r, error });
        }
    });
    return results;
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

    it("keeps the clean-warp accuracy (median below 0.05 px) under brightness/contrast changes, carrying the unchanged frame's estimate over: gain within 0.01·g of g·gain₀, bias within 1 grey level of g·bias₀ + b", () => {
        // Measured: median errors 0.016–0.020 px; gain within 0.0024·g, bias
        // within 0.19 grey levels. A level converges twice with gain and bias
        // (align_patch.ts): a median of 5 iterations, 95th percentile 6.
        expect(unchanged.converged).toBe(true);
        expect(median(unchanged.errors)).toBeLessThan(0.05);
        const iterations = unchanged.observations.map((o) => o.iterations).sort((a, c) => a - c);
        expect(median(iterations)).toBeLessThanOrEqual(5);
        expect(iterations[Math.floor(0.95 * iterations.length)]).toBeLessThanOrEqual(6);
        for (const [g, b] of CHANGES) {
            const changed = alignAll({ gain: g, bias: b }, ON);
            expect(changed.converged).toBe(true);
            expect(median(changed.errors)).toBeLessThan(0.05);
            expect(Math.abs(changed.gain - g * unchanged.gain)).toBeLessThan(0.01 * g);
            expect(Math.abs(changed.bias - (g * unchanged.bias + b))).toBeLessThan(1);
        }
    });

    it("keeps the basin under every change: from 2 px off all converge, from 3 px 96% (asserted ≥ 90%), and at most 1.6% elsewhere (≤ 2%)", () => {
        // 24 patches × 8 directions per change. Estimating gain and bias by
        // least squares from the first iteration, as the simultaneous
        // algorithm alone does, converged only 45–48% from 3 px (84–92% from
        // 2 px), and 3–6% of alignments converged away from the truth: a
        // window that far off matches the patch poorly, so the fitted gain
        // collapses towards 0 and the translation step, divided by it,
        // overshoots. Matching gain and bias by moments until the translation
        // has converged (align_patch.ts) is what keeps it.
        for (const [g, b] of [[1, 0], ...CHANGES]) {
            const frame = frameOf({ gain: g, bias: b });
            const near = fromOff(frame, 2, 8);
            expect(
                near.every(({ r, error }) => r.ok && r.observation.converged && error < 0.5),
            ).toBe(true);
            const far = fromOff(frame, 3, 8);
            const converged = far.filter(({ r }) => r.ok && r.observation.converged);
            const right = converged.filter(({ error }) => error < 0.5).length;
            expect(right / far.length).toBeGreaterThanOrEqual(0.9);
            expect((converged.length - right) / far.length).toBeLessThanOrEqual(0.02);
        }
    }, 30_000);

    it("tells a wrong convergence by its residual: from 3 to 8 px off, residual / gain is at most 3.8 grey levels when right and at least 6.1 when wrong", () => {
        // Beyond the basin an alignment can converge in the wrong place, as
        // any local method's can; rejecting it is the robust fit's job
        // (align_patch.ts, point 6), and this is its signal. Four changes,
        // σ = 2 grey levels of noise, 24 patches × 16 directions × 4
        // offsets: 3521 right convergences and 778 wrong ones, measured.
        const right: number[] = [];
        const wrong: number[] = [];
        for (const [g, b] of [
            [1, 0],
            [0.6, 0],
            [1.3, 0],
            [0.7, 30],
        ]) {
            const frame = frameOf({ gain: g, bias: b, noiseSigma: 2, seed: 5 });
            for (const d of [3, 4, 6, 8]) {
                for (const { r, error } of fromOff(frame, d, 16)) {
                    if (!(r.ok && r.observation.converged)) continue;
                    (error < 0.5 ? right : wrong).push(r.observation.residual / r.observation.gain);
                }
            }
        }
        expect(wrong.length).toBeGreaterThan(100);
        expect(Math.max(...right)).toBeLessThan(4);
        expect(Math.min(...wrong)).toBeGreaterThan(6);
    }, 30_000);

    it("is what the changes need: without it, errors grow 14× to over 2000×, except for a change that pivots at the patches' mean grey level (2.2×)", () => {
        // Measured, median error off / on: 2157× (gain 0.6: uncompensated
        // alignment diverges, 42 px), 50× (1.3), 73× and 88× (bias ∓40), 14×
        // (0.7 / +30). A change leaves grey level b / (1 − g) where it was;
        // for 1.2 / −25 that is 125, the patches' own mean (126), so it only
        // rescales their contrast about their mean, which a translation-only
        // fit barely notices: 2.2×. Compensating never loses.
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
