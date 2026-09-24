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
