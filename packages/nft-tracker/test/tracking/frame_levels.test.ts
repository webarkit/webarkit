/*
 *  frame_levels.test.ts
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

// frameLevelsFor, measured against the rule it borrows: alignPatch starts a
// patch on the frame level where one patch pixel is closest to one level
// pixel and never reads a coarser one, so the levels past the deepest start
// are built for nothing. The patches are pinball's compiled ones — all
// level 0 — seen on the reference device's 270 × 360 camera path and, for
// the magnified cases, in frames large enough to hold the target at σ = 2.

import { describe, it, expect } from "vitest";
import type { GrayImage } from "@webarkit/cv-backend-spec";
import { alignPatch, buildFramePyramid, levelScale } from "../../src/index.js";
import type { FramePyramid } from "../../src/index.js";
import { frameLevelsFor } from "../../src/tracking/frame_levels.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { renderWarp, view } from "../fixtures/warped_frames.js";

const image = readPgm(TARGET_FIXTURE);
const patches = pinballPatches();
const P = patches.patchSize;
const scales = Float64Array.from(patches.level, (l) => levelScale(PINBALL_STEP, l));
const centres = new Float64Array(2 * patches.count);
for (let q = 0; q < patches.count; q++) {
    centres[2 * q] = (patches.left[q] + (P - 1) / 2) / scales[q];
    centres[2 * q + 1] = (patches.top[q] + (P - 1) / 2) / scales[q];
}
const all = Array.from({ length: patches.count }, (_, q) => q);
const CAMERA = { width: 270, height: 360 };

function pyramid(frame: GrayImage, levels: number): FramePyramid {
    const r = buildFramePyramid(frame, { levels, scaleStep: PINBALL_STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

describe("frameLevelsFor", () => {
    it("builds only level 0 for pinball's level-0 patches on the camera path (scales 0.45, 0.7, 1.0)", () => {
        for (const scale of [0.45, 0.7, 1]) {
            const H = view({ target: image, frame: CAMERA, scale });
            expect(frameLevelsFor(H, centres, scales, all, PINBALL_STEP, CAMERA, 4)).toBe(1);
        }
    });

    it("goes as deep as the most magnified patch starts: σ = 1.5 → 3 levels, σ = 2 → 4", () => {
        // A level-0 patch seen at σ frame px per patch px starts where σ·s_l
        // is nearest 1: s_2 = 0.63 for 1.5 (cost 1.058), s_3 = 0.5 for 2.
        const frame = { width: 1280, height: 1600 };
        const at = (scale: number) => view({ target: image, frame, scale });
        expect(frameLevelsFor(at(1.5), centres, scales, all, PINBALL_STEP, frame, 7)).toBe(3);
        expect(frameLevelsFor(at(2), centres, scales, all, PINBALL_STEP, frame, 7)).toBe(4);
    });

    it("never goes deeper than maxLevels, nor than the frame holds levels of at least 2 × 2", () => {
        const frame = { width: 1280, height: 1600 };
        const H = view({ target: image, frame, scale: 2 });
        expect(frameLevelsFor(H, centres, scales, all, PINBALL_STEP, frame, 2)).toBe(2);
        // 3 × 3: level 1 is 2 × 2, level 2 would be 1 × 1.
        const tiny = { width: 3, height: 3 };
        expect(frameLevelsFor(H, centres, scales, all, PINBALL_STEP, tiny, 7)).toBe(2);
    });

    it("is 1 with no candidate patch, or a prediction that puts every patch behind the camera", () => {
        const H = view({ target: image, frame: CAMERA, scale: 2 });
        expect(frameLevelsFor(H, centres, scales, [], PINBALL_STEP, CAMERA, 4)).toBe(1);
        const behind = Float64Array.from(H, (v) => -v);
        expect(frameLevelsFor(behind, centres, scales, all, PINBALL_STEP, CAMERA, 4)).toBe(1);
    });

    it("changes no alignment: on the levels it asks for, every patch aligns bit-identically to a 7-level pyramid", () => {
        const options = { maxIterations: 30, epsilon: 0.01, photometric: true };
        for (const [scale, frame] of [
            [0.45, CAMERA],
            [2, { width: 640, height: 480 }],
        ] as const) {
            const H = view({ target: image, frame, scale });
            const rendered = renderWarp(image, H, {
                ...frame,
                blurPasses: 1,
                noiseSigma: 2,
                seed: 5,
            });
            const levels = frameLevelsFor(H, centres, scales, all, PINBALL_STEP, frame, 7);
            const few = pyramid(rendered, levels);
            const many = pyramid(rendered, 7);
            let compared = 0;
            for (const q of all) {
                const a = alignPatch(few, patches, q, PINBALL_STEP, H, options);
                const b = alignPatch(many, patches, q, PINBALL_STEP, H, options);
                expect(a).toEqual(b);
                compared++;
            }
            expect(compared).toBe(64);
        }
    });
});
