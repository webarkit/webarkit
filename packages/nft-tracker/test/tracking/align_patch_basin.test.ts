/*
 *  align_patch_basin.test.ts
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
import type { FramePyramid, PatchTable } from "../../src/index.js";
import { cutPatches, patchCentre, texturedSites } from "../fixtures/patch_table.js";
import type { PatchSite } from "../fixtures/patch_table.js";
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

// The convergence basin — how far off the prediction can be and still
// converge — measured, not assumed. "Converged" means ok, converged, and
// within 0.5 frame px of the truth. Each case is 24 textured pinball patches
// in three clean views (frontal, rotated 30°, tilted), predictions wrong by a
// translation of d px in 16 directions; the rates are over those 1152 trials.
//
// σ below is how many frame px one patch px covers at frame level 0. The
// three cases a tracker will meet: a patch whose level matches the frame's
// scale (σ = 1), one seen larger than its scale (σ = 2: alignment starts on
// frame level 3 and refines on level 0), one seen smaller (σ ≈ 0.63).

const STEP = Math.cbrt(2);
const P = 8;
const OPTIONS = { maxIterations: 30, epsilon: 0.01, photometric: false };
const FRAME = { width: 640, height: 480 };

function pyramidOf(image: GrayImage, levels: number): FramePyramid {
    const r = buildFramePyramid(image, { levels, scaleStep: STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

const target = readPgm(TARGET_FIXTURE);
const targetPyramid = pyramidOf(target, 7);

interface Case {
    readonly sites: PatchSite[];
    readonly patches: PatchTable;
    readonly views: Mat3[];
    readonly frames: FramePyramid[];
}

/** Patches cut from target level `patchLevel`, in views at target level `viewLevel`'s scale. */
function scenario(patchLevel: number, viewLevel: number): Case {
    const sites = texturedSites(targetPyramid, P, patchLevel, 24, { minSpacing: 12, margin: 4 });
    const scale = levelScale(STEP, viewLevel);
    const views = [
        view({ target, frame: FRAME, scale }),
        view({ target, frame: FRAME, scale, angle: Math.PI / 6 }),
        view({ target, frame: FRAME, scale, perspective: [0.0004, -0.0006] }),
    ];
    return {
        sites,
        patches: cutPatches(targetPyramid, P, sites),
        views,
        frames: views.map((H) => pyramidOf(renderWarp(target, H, FRAME), 7)),
    };
}

const matched = scenario(3, 3); // σ = 1
const magnified = scenario(5, 2); // σ = 2
const minified = scenario(1, 3); // σ = 0.63

/**
 * Every trial of a case with the prediction's error `err(tx, ty)` applied in
 * the frame, `(tx, ty)` being the patch's true centre: the share converged,
 * and every error and iteration count.
 */
function trials(c: Case, errs: ((tx: number, ty: number) => Mat3)[], options = OPTIONS) {
    let converged = 0;
    let n = 0;
    const errors: number[] = [];
    const iterations: number[] = [];
    const levels = new Set<number>();
    c.views.forEach((H, v) => {
        c.sites.forEach((site, q) => {
            const [X, Y] = patchCentre(site, P, STEP);
            const [tx, ty] = project(H, X, Y);
            for (const err of errs) {
                const r = alignPatch(
                    c.frames[v],
                    c.patches,
                    q,
                    STEP,
                    mat3Mul(err(tx, ty), H),
                    options,
                );
                n++;
                if (!r.ok) continue;
                const e = Math.hypot(r.observation.x - tx, r.observation.y - ty);
                errors.push(e);
                iterations.push(r.observation.iterations);
                levels.add(r.observation.frameLevel);
                if (r.observation.converged && e < 0.5) converged++;
            }
        });
    });
    return { rate: converged / n, errors, iterations, levels };
}

const successes = new Map<string, number>();

/**
 * The share converged from `d` px off, over 16 directions, with gain and bias
 * estimated too when `photometric`. Memoised: tests share rates.
 */
function successFrom(c: Case, d: number, photometric = false): number {
    const key = `${[matched, magnified, minified].indexOf(c)}:${d}:${photometric}`;
    const known = successes.get(key);
    if (known !== undefined) return known;
    const errs = Array.from({ length: 16 }, (_, k) => {
        const a = (k * Math.PI) / 8;
        return () => translation(d * Math.cos(a), d * Math.sin(a));
    });
    const rate = trials(c, errs, { ...OPTIONS, photometric }).rate;
    successes.set(key, rate);
    return rate;
}

function about(M: Mat3, x: number, y: number): Mat3 {
    return mat3Mul(translation(x, y), mat3Mul(M, translation(-x, -y)));
}

function quantile(values: number[], p: number): number {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

describe("alignPatch: the convergence basin", () => {
    it("matched patches (σ = 1) converge from 3 px off (measured 97%) and mostly from 4 px (89%); from 8 px, most do not (37%)", () => {
        expect(successFrom(matched, 3)).toBeGreaterThanOrEqual(0.95);
        expect(successFrom(matched, 4)).toBeGreaterThanOrEqual(0.8);
        expect(successFrom(matched, 8)).toBeLessThan(0.6);
    });

    it("scales with magnification: seen at twice their scale (σ = 2), patches converge from 2d px off at least as often as matched ones from d px (8 px: 90%)", () => {
        // Coarse-to-fine starts on the level where a patch pixel is one level
        // pixel, so the basin is fixed in patch pixels: twice as wide in frame
        // pixels when a patch pixel covers two. Measured, σ = 2 at 2d against
        // σ = 1 at d: 100/100, 99/97, 90/89, 77/73, 65/58, 40/37 (%, d = 2…8).
        for (const d of [2, 3, 4, 5, 6, 8]) {
            expect(successFrom(magnified, 2 * d)).toBeGreaterThanOrEqual(successFrom(matched, d));
        }
    }, 30_000);

    it("converges in few iterations: from 1 px off a median of 4 (95th percentile 6) when matched, 5 (6) when magnified; from 2 px, all 1152 of each within the cap of 30", () => {
        const onePx = Array.from({ length: 8 }, (_, k) => {
            const a = (k * Math.PI) / 4;
            return () => translation(Math.cos(a), Math.sin(a));
        });
        for (const [c, median] of [
            [matched, 4],
            [magnified, 5],
        ] as const) {
            const { iterations } = trials(c, onePx);
            expect(quantile(iterations, 0.5)).toBeLessThanOrEqual(median);
            expect(quantile(iterations, 0.95)).toBeLessThanOrEqual(6);
            expect(successFrom(c, 2)).toBe(1);
        }
    });

    it("refines magnified patches on frame level 0, to a median of 0.010 px (asserted < 0.02; worst 0.026, < 0.05)", () => {
        // Level 0 is read through footprints that blur it as the pyramid would
        // on its way to the patch's scale (align_patch.ts): that makes the
        // refinement gain precision. Read one point per patch pixel instead,
        // the same refinement left a median of 0.12 px and a 95th percentile
        // of 0.82 px.
        const { errors, levels, rate } = trials(magnified, [() => translation(0, 0)]);
        expect(rate).toBe(1);
        expect([...levels]).toEqual([0]);
        expect(quantile(errors, 0.5)).toBeLessThan(0.02);
        expect(Math.max(...errors)).toBeLessThan(0.05);
    });

    it("keeps patches seen smaller than their scale (σ = 0.63) sub-pixel (median 0.059 px), from less far: 2 px 91%, 3 px 69%", () => {
        // Nothing blurs such a patch down to the frame's resolution, so it
        // carries detail the frame lacks. A tracker should prefer patches
        // whose level matches the frame's scale.
        const { errors, rate } = trials(minified, [() => translation(0, 0)]);
        expect(rate).toBe(1);
        expect(quantile(errors, 0.5)).toBeLessThan(0.1);
        expect(successFrom(minified, 2)).toBeGreaterThanOrEqual(0.85);
        expect(successFrom(minified, 3)).toBeLessThan(0.8);
    });

    it("keeps most of the basin with gain and bias estimated too: 96% from 3 px when matched (97% without), 83% from 8 px magnified (90%), 89% from 2 px minified (91%)", () => {
        // On these unchanged frames, gain and bias only cost basin: matched
        // by moments while the translation converges, they vary as the
        // window crosses the texture (align_patch.ts). Estimated by least
        // squares from the first iteration instead, matched patches converged
        // 46% from 3 px, magnified ones 17% from 8 px.
        expect(successFrom(matched, 3, true)).toBeGreaterThanOrEqual(0.9);
        expect(successFrom(magnified, 8, true)).toBeGreaterThanOrEqual(0.75);
        expect(successFrom(minified, 2, true)).toBeGreaterThanOrEqual(0.8);
    }, 30_000);

    it("needs the predicted rotation within about 10° (94% converge) and scale within 10% (100%); at 20°, most do not (30%)", () => {
        // The alignment estimates a translation only: rotation and scale come
        // from the prediction. Errors about the patch's true centre, both signs.
        const rotated = (deg: number) =>
            [deg, -deg].map(
                (a) => (x: number, y: number) => about(rotation((a * Math.PI) / 180), x, y),
            );
        const scaled = (pct: number) =>
            [pct, -pct].map((p) => (x: number, y: number) => about(scaling(1 + p / 100), x, y));
        expect(trials(matched, rotated(5)).rate).toBe(1);
        expect(trials(matched, rotated(10)).rate).toBeGreaterThanOrEqual(0.9);
        expect(trials(matched, rotated(20)).rate).toBeLessThan(0.5);
        expect(trials(matched, scaled(10)).rate).toBe(1);
        expect(trials(matched, scaled(20)).rate).toBeLessThan(0.9);
    });
});
