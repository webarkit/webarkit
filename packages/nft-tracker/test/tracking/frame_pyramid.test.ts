/*
 *  frame_pyramid.test.ts
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

import { describe, it, expect, beforeAll } from "vitest";
import type { GrayImage } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";
import { buildFramePyramid, buildTargetFromImage, levelScale } from "../../src/index.js";
import type { FramePyramidResult, TargetDb } from "../../src/index.js";
import { pyramidScales } from "../../src/tracking/frame_pyramid.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";

const CBRT2 = Math.cbrt(2);

function image(width: number, height: number, fill = 0): GrayImage {
    return { data: new Uint8Array(width * height).fill(fill), width, height };
}

function failure(r: FramePyramidResult): string | undefined {
    return r.ok ? undefined : r.reason;
}

describe("pyramidScales", () => {
    it("is levelScale for every level, and null exactly where levelScale would throw", () => {
        // Steps from barely above 1 to past the underflow boundary of every
        // depth, so both outcomes occur at many depths.
        const steps = [1 + 2 ** -40, CBRT2, 2, 3, 18.5, 19, 1e10, 2 ** 537, 2 ** 538, 1e300];
        for (const step of steps) {
            for (const count of [1, 2, 3, 5, 64, 255, 256]) {
                const scales = pyramidScales(step, count);
                let throws = false;
                try {
                    levelScale(step, count - 1);
                } catch {
                    throws = true;
                }
                expect(scales === null).toBe(throws);
                if (scales !== null) {
                    for (let l = 0; l < count; l++) expect(scales[l]).toBe(levelScale(step, l));
                }
            }
        }
    });

    it("is null for a step or count outside its domain, instead of throwing", () => {
        expect(pyramidScales(1, 2)).toBeNull();
        expect(pyramidScales(Number.NaN, 2)).toBeNull();
        expect(pyramidScales(2, 0)).toBeNull();
        expect(pyramidScales(2, 257)).toBeNull();
        expect(pyramidScales(2, 2.5)).toBeNull();
    });
});

describe("buildFramePyramid: options", () => {
    const frame = image(16, 12);

    it("rejects a level count that is not an integer in [1, 256]", () => {
        for (const levels of [0, -1, 257, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(failure(buildFramePyramid(frame, { levels, scaleStep: 2 }))).toBe(
                "invalid-options",
            );
        }
    });

    it("rejects a scale step that is not finite and > 1", () => {
        for (const scaleStep of [1, 0.5, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(failure(buildFramePyramid(frame, { levels: 2, scaleStep }))).toBe(
                "invalid-options",
            );
        }
    });

    it("rejects a step whose deepest level's scale underflows, exactly where levelScale would throw", () => {
        // 2^537: level 2's scale is 2^-1074, the smallest subnormal — tiny
        // but not 0. 2^538: it is 2^-1076, which rounds to 0. Powers of two
        // divide exactly, so the boundary is not blurred by rounding.
        const fits = 2 ** 537;
        const underflows = 2 ** 538;
        expect(levelScale(fits, 2)).toBeGreaterThan(0);
        expect(() => levelScale(underflows, 2)).toThrow(RangeError);

        expect(failure(buildFramePyramid(frame, { levels: 3, scaleStep: underflows }))).toBe(
            "invalid-options",
        );
        // Not an options error, and no throw: level 1 is just smaller than a pixel.
        expect(failure(buildFramePyramid(frame, { levels: 3, scaleStep: fits }))).toBe(
            "level-too-small",
        );
        // Deeper requests fail the same way, without reaching levelScale's throw.
        expect(failure(buildFramePyramid(frame, { levels: 256, scaleStep: underflows }))).toBe(
            "invalid-options",
        );
    });

    it("accepts any step when only level 0 is requested: no level scale is ever computed", () => {
        const r = buildFramePyramid(frame, { levels: 1, scaleStep: 1e308 });
        expect(r.ok && r.pyramid.levels.length).toBe(1);
    });
});

describe("buildFramePyramid: frame", () => {
    it("rejects a size that is not a positive integer, or data of the wrong length", () => {
        const cases: GrayImage[] = [
            { data: new Uint8Array(0), width: 0, height: 0 },
            { data: new Uint8Array(12), width: -3, height: -4 },
            { data: new Uint8Array(12), width: 1.5, height: 8 },
            { data: new Uint8Array(12), width: Number.NaN, height: 12 },
            { data: new Uint8Array(12 * 16 - 1), width: 16, height: 12 },
            { data: new Uint8Array(12 * 16 + 1), width: 16, height: 12 },
        ];
        for (const frame of cases) {
            expect(failure(buildFramePyramid(frame, { levels: 2, scaleStep: 2 }))).toBe(
                "invalid-frame",
            );
        }
    });

    it("checks the options before the frame", () => {
        const bad = { data: new Uint8Array(1), width: 0, height: 0 };
        expect(failure(buildFramePyramid(bad, { levels: 0, scaleStep: 2 }))).toBe(
            "invalid-options",
        );
    });

    it("fails when a requested level would be smaller than 1×1", () => {
        // 4x4 at step 2: 4, 2, 1, then 0.
        expect(buildFramePyramid(image(4, 4), { levels: 3, scaleStep: 2 }).ok).toBe(true);
        expect(failure(buildFramePyramid(image(4, 4), { levels: 4, scaleStep: 2 }))).toBe(
            "level-too-small",
        );
        // One dimension is enough.
        expect(failure(buildFramePyramid(image(100, 1), { levels: 2, scaleStep: 2 }))).toBe(
            "level-too-small",
        );
    });
});

describe("buildFramePyramid: the filter", () => {
    function build(frame: GrayImage, levels: number, scaleStep: number): GrayImage[] {
        const r = buildFramePyramid(frame, { levels, scaleStep });
        if (!r.ok) throw new Error(r.reason);
        return [...r.pyramid.levels];
    }

    /** `f(x, y)` sampled on a `width × height` grid. */
    function sampled(width: number, height: number, f: (x: number, y: number) => number) {
        const img = image(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) img.data[y * width + x] = f(x, y);
        }
        return img;
    }

    it("keeps a constant image constant at every level", () => {
        for (const step of [CBRT2, 2, 1.5]) {
            for (const level of build(image(97, 61, 173), 5, step)) {
                expect(level.data.every((v) => v === 173)).toBe(true);
            }
        }
    });

    it("centres level l's pixel x_l on level 0's x_l / s_l (D2): a ramp keeps its value, where a cell-aligned filter would be off by up to 1.09 grey levels at level 5", () => {
        // v = x + 20. Each level is rounded to u8 before the next is built from
        // it, so a pixel may be off by up to 0.5 per level; averaged over a
        // row those errors cancel. A filter centred on its cell,
        // (x_l + 0.5) / s_l − 0.5, instead shifts every pixel by
        // 0.5 · (1 / s_l − 1) px: 0.29 grey levels at level 2, 1.09 at level 5.
        for (const transpose of [false, true]) {
            const [w, h] = transpose ? [40, 216] : [216, 40];
            const ramp = sampled(w, h, (x, y) => (transpose ? y : x) + 20);
            const levels = build(ramp, 6, CBRT2);
            for (let l = 1; l < levels.length; l++) {
                const s = levelScale(CBRT2, l);
                const { data, width, height } = levels[l];
                let sum = 0;
                let n = 0;
                let worst = 0;
                const margin = 4; // the edge-extended border breaks linearity
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const along = transpose ? y : x;
                        const extent = transpose ? height : width;
                        if (along < margin || along >= extent - margin) continue;
                        const e = data[y * width + x] - (along / s + 20);
                        sum += e;
                        n++;
                        worst = Math.max(worst, Math.abs(e));
                    }
                }
                expect(Math.abs(sum / n)).toBeLessThan(0.15);
                expect(worst).toBeLessThanOrEqual(0.5 * l + 1e-9);
            }
        }
    });

    it("reproduces a steep ramp at level 1 to within its rounding: no phase-dependent wobble", () => {
        // v = 3x + 10. A kernel whose discrete centroid drifts with the sample
        // phase (a triangle of half-width r, sampled at x_l · r) moves some
        // pixels by ~0.07 px, i.e. 0.2 grey levels here, past this bound.
        const ramp = sampled(81, 8, (x) => 3 * x + 10);
        const [, level1] = build(ramp, 2, CBRT2);
        const s = levelScale(CBRT2, 1);
        for (let x = 3; x < level1.width - 3; x++) {
            expect(Math.abs(level1.data[x] - (3 * (x / s) + 10))).toBeLessThanOrEqual(0.5 + 1e-9);
        }
    });

    it("attenuates 1-px stripes: to 0 at step 2, and to the 38% (96 of 255) its kernel predicts at step ∛2", () => {
        const stripes = sampled(120, 16, (x) => (x % 2 === 0 ? 0 : 255));
        const swing = (img: GrayImage) => {
            const row = (img.height >> 1) * img.width;
            let lo = 255;
            let hi = 0;
            for (let x = 3; x < img.width - 3; x++) {
                lo = Math.min(lo, img.data[row + x]);
                hi = Math.max(hi, img.data[row + x]);
            }
            return hi - lo;
        };
        // Step 2 is the [1, 2, 1] / 4 decimation, whose response at the source
        // Nyquist frequency is exactly 0.
        expect(swing(build(stripes, 2, 2)[1])).toBe(0);
        // Step ∛2. The triangle reconstruction of 1-px stripes is a triangle
        // wave whose fundamental swings 2 · sinc²(1/2) of the stripes' 255
        // (the two spectral replicas coincide exactly at Nyquist), and a box
        // of width r = ∛2 passes sinc(r/2) of it: 255 · 2 · sinc(r/2) ·
        // sinc²(1/2) = 95.9. The swing across every sampling phase lands there.
        const sinc = (x: number) => Math.sin(Math.PI * x) / (Math.PI * x);
        const predicted = 255 * 2 * sinc(CBRT2 / 2) * sinc(0.5) ** 2;
        expect(Math.abs(swing(build(stripes, 2, CBRT2)[1]) - predicted)).toBeLessThan(3);
    });

    it("is deterministic and leaves the frame untouched", () => {
        const frame = sampled(64, 48, (x, y) => (x * 7 + y * 13 + ((x * y) % 17)) & 255);
        const before = Uint8Array.from(frame.data);
        const a = build(frame, 5, CBRT2);
        const b = build(frame, 5, CBRT2);
        expect(frame.data).toEqual(before);
        for (let l = 0; l < a.length; l++) expect(a[l].data).toEqual(b[l].data);
    });
});

describe("buildFramePyramid: geometry", () => {
    let target: TargetDb;
    let pinball: GrayImage;

    beforeAll(async () => {
        const cv = await createJsfeatNextBackend();
        pinball = readPgm(TARGET_FIXTURE);
        target = buildTargetFromImage(cv, pinball, { levels: 8 });
    });

    it("returns level 0 as the frame itself, by reference, and records the step", () => {
        const frame = image(16, 12);
        const r = buildFramePyramid(frame, { levels: 3, scaleStep: 2 });
        if (!r.ok) throw new Error(r.reason);
        expect(r.pyramid.levels[0]).toBe(frame);
        expect(r.pyramid.levels.length).toBe(3);
        expect(r.pyramid.scaleStep).toBe(2);
    });

    it("sizes every level as the target builder records levelSizes, bit for bit", () => {
        const { scaleStep, levelSizes } = target.pyramid;
        expect(scaleStep).toBe(CBRT2);
        expect(levelSizes.length).toBeGreaterThan(1);
        const r = buildFramePyramid(pinball, { levels: levelSizes.length, scaleStep });
        if (!r.ok) throw new Error(r.reason);
        const sizes = r.pyramid.levels.map((l) => [l.width, l.height]);
        expect(sizes).toEqual(levelSizes.map(([w, h]) => [w, h]));
        for (const level of r.pyramid.levels) {
            expect(level.data.length).toBe(level.width * level.height);
        }
    });
});
