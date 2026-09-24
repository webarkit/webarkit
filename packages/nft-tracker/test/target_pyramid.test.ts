/*
 *  target_pyramid.test.ts
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

/**
 * `bin/target-pyramid.mjs`, the stand-in filter compile-target cuts tracking
 * patches from until `buildFramePyramid` exists. It decides the committed
 * bytes of every coarser-level patch, so the filter is pinned here to what
 * its header documents — not merely checked against itself.
 *
 * Loaded by URL, so the type checker does not try to resolve a `.mjs`
 * without declarations. It imports the built `dist/` (for `levelScale`), so
 * this suite needs `npm run build` first, like the other `bin/` suites.
 */

import { describe, expect, it } from "vitest";
import type { GrayImage } from "@webarkit/cv-backend-spec";
import { levelScale } from "../src/index.js";
import type { ImagePyramid } from "../src/index.js";

const MODULE = new URL("../bin/target-pyramid.mjs", import.meta.url).href;

type BuildTargetPyramid = (
    image: GrayImage,
    scaleStep: number,
    levelSizes: readonly (readonly [number, number])[],
) => ImagePyramid;

async function load(): Promise<BuildTargetPyramid> {
    return ((await import(MODULE)) as { buildTargetPyramid: BuildTargetPyramid })
        .buildTargetPyramid;
}

function image(width: number, height: number, pixel: (x: number, y: number) => number): GrayImage {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data[y * width + x] = pixel(x, y);
    }
    return { data, width, height };
}

/** `(w · s_l) | 0` × `(h · s_l) | 0`, §5.4's rule, for `levels` levels. */
function sizes(w: number, h: number, step: number, levels: number): [number, number][] {
    return Array.from({ length: levels }, (_, l) => {
        const s = levelScale(step, l);
        return [(w * s) | 0, (h * s) | 0];
    });
}

describe("stand-in target pyramid (bin/target-pyramid.mjs)", () => {
    it("has exactly the requested sizes, with level 0 the image itself", async () => {
        const build = await load();
        const src = image(61, 47, (x, y) => (x * 7 + y * 13) & 0xff);
        const want = sizes(61, 47, Math.cbrt(2), 6);
        const pyramid = build(src, Math.cbrt(2), want);

        expect(pyramid.scaleStep).toBe(Math.cbrt(2));
        expect(pyramid.levels[0]).toBe(src);
        expect(pyramid.levels.map((l) => [l.width, l.height])).toEqual(want);
        pyramid.levels.forEach((l) => expect(l.data.length).toBe(l.width * l.height));
    });

    it("keeps a constant image constant at every level, edges included", async () => {
        const build = await load();
        const pyramid = build(
            image(40, 30, () => 173),
            Math.cbrt(2),
            sizes(40, 30, Math.cbrt(2), 8),
        );
        for (const level of pyramid.levels) {
            expect(level.data.every((v) => v === 173)).toBe(true);
        }
    });

    it("averages each pixel's footprint, centred per D2: [1/4, 1/2, 1/4] at step 2", async () => {
        // Level-1 pixel x is centred on level-0 x / s_1 = 2x (§3, no
        // half-pixel correction) and spans [2x − 1, 2x + 1]: half of pixel
        // 2x − 1, all of 2x, half of 2x + 1. At x = 0 the footprint is
        // clipped to the image, [−½, 1]: all of pixel 0, half of pixel 1.
        const build = await load();
        const row = [0, 40, 80, 120, 200, 240, 16, 64];
        const src = image(8, 1, (x) => row[x]);
        const level1 = build(src, 2, [
            [8, 1],
            [4, 1],
        ]).levels[1];

        const expected = [
            (1 * row[0] + 0.5 * row[1]) / 1.5,
            0.25 * row[1] + 0.5 * row[2] + 0.25 * row[3],
            0.25 * row[3] + 0.5 * row[4] + 0.25 * row[5],
            0.25 * row[5] + 0.5 * row[6] + 0.25 * row[7],
        ].map((v) => Math.floor(v + 0.5));
        expect(Array.from(level1.data)).toEqual(expected);
    });

    it("filters both axes the same way: a 2-D level at step 2", async () => {
        // The 1-D weights above, per output index o of an axis n0 long.
        const weights = (o: number): [number, number][] =>
            o === 0
                ? [
                      [0, 1 / 1.5],
                      [1, 0.5 / 1.5],
                  ]
                : [
                      [2 * o - 1, 0.25],
                      [2 * o, 0.5],
                      [2 * o + 1, 0.25],
                  ];
        const build = await load();
        const src = image(8, 6, (x, y) => (x * 37 + y * 91 + x * y * 11) & 0xff);
        const level1 = build(src, 2, [
            [8, 6],
            [4, 3],
        ]).levels[1];

        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 4; x++) {
                let exact = 0;
                for (const [i, wy] of weights(y)) {
                    for (const [j, wx] of weights(x)) exact += wy * wx * src.data[i * 8 + j];
                }
                // One rounding at the end; the filter's own summation order
                // may differ from this one in the last bits, never by more
                // than the rounding itself.
                expect(Math.abs(level1.data[y * 4 + x] - exact)).toBeLessThanOrEqual(0.5 + 1e-9);
            }
        }
    });

    it("refuses sizes whose level 0 is not the image", async () => {
        const build = await load();
        expect(() =>
            build(
                image(8, 8, () => 0),
                2,
                [[9, 8]],
            ),
        ).toThrow(/level 0/);
    });
});
