/*
 *  frame_pyramid.ts
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

import type { GrayImage } from "@webarkit/cv-backend-spec";
import { levelScale, MAX_LEVEL } from "./level_scale.js";
import type { BuildFramePyramid, FramePyramidFailure, FramePyramidResult } from "./types.js";

/**
 * `s_0 … s_{count − 1}`, each exactly `levelScale(scaleStep, l)`, or `null`
 * when a level's scale would underflow to 0.
 *
 * `levelScale` throws on an underflow, and a tracking function must report
 * one as a failure instead (types.ts, rule 3). So the underflow is decided
 * **before** `levelScale` is called for the level, from the recurrence that
 * helper documents and its tests pin to the last bit: `s_l` is
 * `s_{l − 1} / scaleStep`, one IEEE division. `s_{l − 1} / scaleStep > 0` is
 * therefore exactly the condition under which `levelScale(scaleStep, l)`
 * returns rather than throws. The value kept is always `levelScale`'s own,
 * never this division's, so coordinates still have one source of truth.
 *
 * Also `null` for a step that is not finite and `> 1`, or a count that is not
 * an integer in `[1, MAX_LEVEL + 1]`: callers validate those first, and this
 * keeps the helper total rather than reaching `levelScale`'s own checks.
 */
export function pyramidScales(scaleStep: number, count: number): Float64Array | null {
    if (!(Number.isFinite(scaleStep) && scaleStep > 1)) return null;
    if (!(Number.isInteger(count) && count >= 1 && count <= MAX_LEVEL + 1)) return null;
    const scales = new Float64Array(count);
    scales[0] = levelScale(scaleStep, 0);
    for (let l = 1; l < count; l++) {
        if (!(scales[l - 1] / scaleStep > 0)) return null;
        scales[l] = levelScale(scaleStep, l);
    }
    return scales;
}

/**
 * See {@link BuildFramePyramid}.
 *
 * **Validation**, in this order: the options (`invalid-options`, including a
 * step whose deepest requested level's scale underflows — see
 * {@link pyramidScales}), then the frame (`invalid-frame`), then every level's
 * size (`level-too-small`). No pixel is read and nothing is allocated before
 * all three pass.
 *
 * **Sizes.** Level `l` is `(w0 · s_l) | 0` × `(h0 · s_l) | 0` with
 * `s_l = levelScale(scaleStep, l)` — the rule `buildTargetFromImage` records
 * as `levelSizes` (§5.4), so a target pyramid built here has exactly its
 * file's sizes. Level 0 is the frame itself, by reference.
 */
export const buildFramePyramid: BuildFramePyramid = (frame, options) => {
    const { levels, scaleStep } = options;
    if (!(Number.isInteger(levels) && levels >= 1 && levels <= MAX_LEVEL + 1)) {
        return fail("invalid-options");
    }
    const scales = pyramidScales(scaleStep, levels);
    if (scales === null) return fail("invalid-options");

    const { width, height, data } = frame;
    if (
        !(isPositiveInteger(width) && isPositiveInteger(height) && data.length === width * height)
    ) {
        return fail("invalid-frame");
    }

    const sizes: [number, number][] = [];
    for (let l = 1; l < levels; l++) {
        const w = (width * scales[l]) | 0;
        const h = (height * scales[l]) | 0;
        if (w < 1 || h < 1) return fail("level-too-small");
        sizes.push([w, h]);
    }

    const out: GrayImage[] = [frame];
    for (const [w, h] of sizes) {
        out.push({ data: new Uint8Array(w * h), width: w, height: h });
    }
    return { ok: true, pyramid: { scaleStep, levels: out } };
};

function isPositiveInteger(n: number): boolean {
    return Number.isInteger(n) && n > 0;
}

function fail(reason: FramePyramidFailure): FramePyramidResult {
    return { ok: false, reason };
}
