/*
 *  frame_levels.ts
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
 * How many levels the live frame's pyramid needs this frame.
 *
 * `alignPatch` starts a patch on the level where one patch pixel is closest to
 * one level pixel ({@link startLevel}) and refines on finer ones only; it
 * never reads a level coarser than its start. So a pyramid deeper than the
 * deepest start level is built and never read. This function applies the
 * same rule to every candidate patch, at the prediction, and returns one more
 * than the deepest start it finds — at most `maxLevels`, and never a level
 * smaller than 2 × 2, below which `alignPatch` can use no level.
 *
 * What it saves, measured: pinball's compiled patches are all level 0, and on
 * the 270 × 360 camera path the target appears at about half its compiled
 * size, so every one starts — and ends — on frame level 0, and one level is
 * all it needs: the frame itself, by reference, nothing computed. Four levels
 * cost 1.85 ms in Node here, an estimated 5.6–7.5 ms on the reference device
 * (docs/benchmarks/README.md), and align those patches bit-identically.
 *
 * What building fewer levels than this would cost: a patch seen larger than
 * its own scale (σ > √r) then starts on level 0, read through footprints from
 * the first iteration — measured at σ = 2 as 61% rather than 65% converging
 * from 12 px off and 35% rather than 40% from 16 px, with every iteration
 * paying the footprint's samples (`startLevel`'s notes). This function never
 * builds fewer than the prediction asks for, up to `maxLevels`.
 */

import type { Mat3 } from "@webarkit/cv-backend-spec";
import { startLevel } from "./align_patch.js";
import { pyramidScales } from "./frame_pyramid.js";

/**
 * @param prediction     Target level-0 → frame level-0, `H[8] > 0` (as
 *                       `predictHomography` returns it). A patch centre it
 *                       sends to or behind the horizon is skipped.
 * @param centres        Every patch's centre in target level-0 px, interleaved.
 * @param patchScales    `s_l` of every patch's level.
 * @param candidates     The patches that will be aligned this frame.
 * @param frameScaleStep The frame pyramid's step.
 * @param frame          The frame's size.
 * @param maxLevels      Upper bound, an integer in `[1, 256]`.
 */
export function frameLevelsFor(
    prediction: Mat3,
    centres: Float64Array,
    patchScales: Float64Array,
    candidates: readonly number[],
    frameScaleStep: number,
    frame: { readonly width: number; readonly height: number },
    maxLevels: number,
): number {
    const scales = pyramidScales(frameScaleStep, maxLevels);
    if (scales === null) return 1;
    let fit = 1;
    while (
        fit < maxLevels &&
        ((frame.width * scales[fit]) | 0) >= 2 &&
        ((frame.height * scales[fit]) | 0) >= 2
    ) {
        fit++;
    }
    if (fit === 1) return 1;
    const usable = Array.from({ length: fit }, (_, l) => l);
    let deepest = 0;
    for (const q of candidates) {
        const sigma = scaleAt(prediction, centres[2 * q], centres[2 * q + 1]) / patchScales[q];
        if (!(sigma > 0 && sigma < Infinity)) continue;
        deepest = Math.max(deepest, startLevel(usable, scales, sigma));
    }
    return deepest + 1;
}

/**
 * Frame level-0 px per target level-0 px at `(X, Y)`, `√|det J|` of the
 * prediction there — what `alignPatch` calls the scale at a patch's centre,
 * before dividing by the patch's level scale; `NaN` at or beyond the horizon.
 */
function scaleAt(H: Mat3, X: number, Y: number): number {
    const w = H[6] * X + H[7] * Y + H[8];
    if (!(w > 0)) return Number.NaN;
    const x = (H[0] * X + H[1] * Y + H[2]) / w;
    const y = (H[3] * X + H[4] * Y + H[5]) / w;
    const a = (H[0] - H[6] * x) / w;
    const b = (H[1] - H[7] * x) / w;
    const c = (H[3] - H[6] * y) / w;
    const d = (H[4] - H[7] * y) / w;
    return Math.sqrt(Math.abs(a * d - b * c));
}
