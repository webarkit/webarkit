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
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { alignPatch, buildFramePyramid } from "../../src/index.js";
import type { FramePyramid, PatchTable } from "../../src/index.js";
import { preparePatch } from "../../src/tracking/align_patch.js";
import { frameLevelsFor } from "../../src/tracking/frame_levels.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { renderWarp, view } from "../fixtures/warped_frames.js";

const image = readPgm(TARGET_FIXTURE);
const patches = pinballPatches();
const P = patches.patchSize;
const all = Array.from({ length: patches.count }, (_, q) => q);
const CAMERA = { width: 270, height: 360 };

/** frameLevelsFor as trackFrame calls it: every candidate prepared at `H` first. */
function levelsFor(
    H: Mat3,
    table: PatchTable,
    step: number,
    candidates: readonly number[],
    frame: { width: number; height: number },
    maxLevels: number,
): number {
    const prepared = candidates.map((q) => preparePatch(table, q, step, H));
    return frameLevelsFor(prepared, step, frame, maxLevels);
}

function pyramid(frame: GrayImage, levels: number): FramePyramid {
    const r = buildFramePyramid(frame, { levels, scaleStep: PINBALL_STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

describe("frameLevelsFor", () => {
    it("builds only level 0 for pinball's level-0 patches on the camera path (scales 0.45, 0.7, 1.0)", () => {
        for (const scale of [0.45, 0.7, 1]) {
            const H = view({ target: image, frame: CAMERA, scale });
            expect(levelsFor(H, patches, PINBALL_STEP, all, CAMERA, 4)).toBe(1);
        }
    });

    it("goes as deep as the most magnified patch starts: σ = 1.5 → 3 levels, σ = 2 → 4", () => {
        // A level-0 patch seen at σ frame px per patch px starts where σ·s_l
        // is nearest 1: s_2 = 0.63 for 1.5 (cost 1.058), s_3 = 0.5 for 2.
        const frame = { width: 1280, height: 1600 };
        const at = (scale: number) => view({ target: image, frame, scale });
        expect(levelsFor(at(1.5), patches, PINBALL_STEP, all, frame, 7)).toBe(3);
        expect(levelsFor(at(2), patches, PINBALL_STEP, all, frame, 7)).toBe(4);
    });

    it("never goes deeper than maxLevels, nor than the frame holds levels of at least 2 × 2", () => {
        const frame = { width: 1280, height: 1600 };
        const H = view({ target: image, frame, scale: 2 });
        expect(levelsFor(H, patches, PINBALL_STEP, all, frame, 2)).toBe(2);
        // 3 × 3: level 1 is 2 × 2, level 2 would be 1 × 1 — and no 16 × 16
        // window at σ = 2 fits on either, so alignment reads no level and
        // only the frame itself is kept.
        const tiny = { width: 3, height: 3 };
        expect(levelsFor(H, patches, PINBALL_STEP, all, tiny, 7)).toBe(1);
    });

    it("is 1 with no candidate patch, or a prediction that puts every patch behind the camera", () => {
        const H = view({ target: image, frame: CAMERA, scale: 2 });
        expect(levelsFor(H, patches, PINBALL_STEP, [], CAMERA, 4)).toBe(1);
        // w = 1 − X < 0 at every patch centre (X ≥ 7.5).
        const behind = Float64Array.from([1, 0, 0, 0, 1, 0, -1, 0, 1]);
        expect(levelsFor(behind, patches, PINBALL_STEP, all, CAMERA, 4)).toBe(1);
    });

    it("reads −H as H, as alignPatch does: a homography's sign is free", () => {
        const frame = { width: 1280, height: 1600 };
        const H = view({ target: image, frame, scale: 2 });
        const negated = Float64Array.from(H, (v) => -v);
        expect(levelsFor(H, patches, PINBALL_STEP, all, frame, 7)).toBe(4);
        expect(levelsFor(negated, patches, PINBALL_STEP, all, frame, 7)).toBe(4);
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
            const levels = levelsFor(H, patches, PINBALL_STEP, all, frame, 7);
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

    it("changes no alignment at a frame edge either, where a level's rounded size lets a coarser level hold a window a finer one cannot", () => {
        // Found in review: each level's size is rounded down, so near the
        // right edge level 2 can hold a window level 1 cannot, and level 0
        // cannot either once σ > √r widens it by a footprint. alignPatch on a
        // deep pyramid then starts on level 2; a pyramid cut where the scale
        // alone says to stop has no level 2 and loses the patch. Pinball's
        // rightmost patch, seen at σ ≈ 1.13–1.3, its window's last column
        // predicted from 637.4 to 639 px of a 640 px frame in 0.05 px steps.
        const frame = { width: 640, height: 480 };
        const options = { maxIterations: 30, epsilon: 0.01, photometric: true };
        let q = 0;
        for (let k = 1; k < patches.count; k++) {
            if (patches.left[k] > patches.left[q]) q = k;
        }
        let compared = 0;
        let deep = 0;
        for (const sigma of [1.13, 1.2, 1.3]) {
            const tx = 638 - sigma * (patches.left[q] + P - 1);
            const ty = 240 - sigma * (patches.top[q] + (P - 1) / 2);
            const truth = Float64Array.from([sigma, 0, tx, 0, sigma, ty, 0, 0, 1]);
            const rendered = renderWarp(image, truth, {
                ...frame,
                blurPasses: 1,
                noiseSigma: 2,
                seed: 5,
            });
            const built = [1, 2, 3, 4, 5, 6, 7].map((n) => pyramid(rendered, n));
            for (let d = -0.6; d <= 1.0001; d += 0.05) {
                const H = Float64Array.from(truth);
                H[2] += d;
                const levels = levelsFor(H, patches, PINBALL_STEP, [q], frame, 7);
                const a = alignPatch(built[levels - 1], patches, q, PINBALL_STEP, H, options);
                const b = alignPatch(built[6], patches, q, PINBALL_STEP, H, options);
                expect(a).toEqual(b);
                compared++;
                if (b.ok && b.observation.frameLevel === 2) deep++;
            }
        }
        expect(compared).toBe(99);
        // Not vacuous: some of these start on level 2.
        expect(deep).toBeGreaterThan(0);
    });

    it("keeps the levels that fit when a deeper one's scale underflows (a large step and maxLevels 256)", () => {
        // Found in review: pyramidScales refuses the whole range as soon as
        // one requested level's scale underflows, and 20^-255 does. One
        // 16 × 16 patch cut at level 1 of a step-20 target, seen at its own
        // scale on frame level 1 (32 × 24 of a 640 × 480 frame).
        const step = 20;
        const one = {
            patchSize: 16,
            count: 1,
            score: new Float32Array([100]),
            left: new Uint16Array([2]),
            top: new Uint16Array([2]),
            level: new Uint8Array([1]),
            pixels: new Uint8Array(256).map((_, i) => (i * 37) % 251),
        };
        const identity = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        const frame = { width: 640, height: 480 };
        expect(levelsFor(identity, one, step, [0], frame, 4)).toBe(2);
        expect(levelsFor(identity, one, step, [0], frame, 256)).toBe(2);
    });
});
