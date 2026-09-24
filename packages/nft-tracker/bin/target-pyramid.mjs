/*
 *  target-pyramid.mjs
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
 * The target pyramid `compile-target` cuts tracking patches from — a
 * **stand-in**, until `buildFramePyramid` exists.
 *
 * `selectPatches` expects its pyramid from `buildFramePyramid`, the same
 * function the tracker will run on every live frame, because stored patches
 * are aligned against the frame's pyramid levels and the two are comparable
 * only if one filter produced both (format spec §11, Q11). That function is
 * still a stub, so this module fills in for it at compile time and nowhere
 * else. Once it lands, `compile-target` calls it instead, this file is
 * deleted, and `examples/targets/pinball.wnft` is recompiled: level 0's
 * patches are the image itself and do not move, but every patch cut from a
 * coarser level will. Until then `info.compiler.patchPyramid` names this
 * filter in every file it produced, so such a file can be recognised.
 *
 * **The filter.** Each level pixel is the area-weighted mean of the level-0
 * pixels its footprint covers. Pixel `x_l` of level `l` is centred on level-0
 * `x_l / s_l` (§3, decision D2, no half-pixel correction) and spans
 * `1 / s_l` level-0 pixels; level-0 pixel `i` spans `[i − ½, i + ½]`; the
 * footprint is clipped to the image, so an edge pixel averages what is there.
 * Separable, float64 throughout, rounded half up once at the end —
 * deterministic, and an anti-aliasing filter for any step, which a
 * nearest-neighbour pick would not be.
 *
 * Sizes are **taken, not computed**: the caller passes the target's recorded
 * `levelSizes` (§5.4), so every patch's bounds are checked against exactly the
 * sizes the file holds. `s_l` comes from `levelScale`, as everywhere else.
 */

import { levelScale } from "../dist/index.js";

/**
 * For each of `n` output samples, the level-0 indices it covers and their
 * normalised weights.
 */
function axisWeights(n0, n, scale) {
    const table = [];
    for (let x = 0; x < n; x++) {
        const lo = Math.max(-0.5, (x - 0.5) / scale);
        const hi = Math.min(n0 - 0.5, (x + 0.5) / scale);
        const first = Math.max(0, Math.floor(lo + 0.5));
        const last = Math.min(n0 - 1, Math.ceil(hi - 0.5));
        const index = [];
        const weight = [];
        let total = 0;
        for (let i = first; i <= last; i++) {
            const w = Math.min(hi, i + 0.5) - Math.max(lo, i - 0.5);
            if (w > 0) {
                index.push(i);
                weight.push(w);
                total += w;
            }
        }
        table.push({ index, weight: weight.map((w) => w / total) });
    }
    return table;
}

/** One level, `width × height`, of `image` at scale `scale`. */
function resample(image, scale, width, height) {
    const cols = axisWeights(image.width, width, scale);
    const rows = axisWeights(image.height, height, scale);

    // Horizontal pass: every source row, output columns.
    const across = new Float64Array(image.height * width);
    for (let y = 0; y < image.height; y++) {
        const row = y * image.width;
        for (let x = 0; x < width; x++) {
            const { index, weight } = cols[x];
            let sum = 0;
            for (let k = 0; k < index.length; k++) sum += weight[k] * image.data[row + index[k]];
            across[y * width + x] = sum;
        }
    }

    // Vertical pass, then one rounding.
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        const { index, weight } = rows[y];
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let k = 0; k < index.length; k++) sum += weight[k] * across[index[k] * width + x];
            data[y * width + x] = Math.min(255, Math.floor(sum + 0.5));
        }
    }
    return { data, width, height };
}

/**
 * The `ImagePyramid` of `image` with exactly `levelSizes`, level 0 first.
 *
 * Level 0 is `image` itself, by reference, as `FramePyramid` specifies for
 * the frame.
 *
 * @param {{ data: Uint8Array, width: number, height: number }} image
 * @param {number} scaleStep  The target's step; finite and `> 1`.
 * @param {ReadonlyArray<readonly [number, number]>} levelSizes  The target's
 *        recorded sizes, or a prefix of them; `levelSizes[0]` is the image's.
 * @returns {{ scaleStep: number, levels: { data: Uint8Array, width: number, height: number }[] }}
 */
export function buildTargetPyramid(image, scaleStep, levelSizes) {
    const [w0, h0] = levelSizes[0];
    if (w0 !== image.width || h0 !== image.height) {
        throw new Error(`level 0 is ${w0}x${h0} but the image is ${image.width}x${image.height}`);
    }
    const levels = [image];
    for (let l = 1; l < levelSizes.length; l++) {
        const [w, h] = levelSizes[l];
        levels.push(resample(image, levelScale(scaleStep, l), w, h));
    }
    return { scaleStep, levels };
}
