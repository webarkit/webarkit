/*
 *  select_patches.ts
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
import type { PatchTable } from "../target/types.js";
import { levelScale, MAX_LEVEL } from "./level_scale.js";
import type { ImagePyramid, PatchSelection, SelectPatches, SelectPatchesOptions } from "./types.js";

/**
 * The largest level side a `.wnft` can record (§5.4's `[1, 2^16 − 1]`), which
 * also keeps every `left`/`top` inside its `u16` (§5.7).
 */
const MAX_SIDE = 0xffff;

/**
 * Chooses the target's tracking patches — see {@link SelectPatches} for the
 * contract, which this implements as follows.
 *
 * **Candidates.** Every `P × P` window lying entirely inside a level image, at
 * every integer `(left, top)`, on every level at least `P` wide and tall. That
 * enumeration *is* §5.7's bounds rule: no candidate outside the level exists
 * to be rejected later.
 *
 * **Score** (§5.7 fixes the quantity, Shi–Tomasi's minimum eigenvalue, but
 * not its units; these are them):
 *
 * - Gradients are central differences, `gx = (I[y][x+1] − I[y][x−1]) / 2` and
 *   `gy = (I[y+1][x] − I[y−1][x]) / 2`, in grey levels per level pixel,
 *   taken at the window's `(P − 2)²` **interior** pixels only. Every pixel
 *   they read is then inside the window, so the score is a function of the
 *   stored pixels alone, recomputable from the file without the level image —
 *   and that is why `patchSize ≥ 3`.
 * - The structure tensor is their **mean** over those pixels (not the sum),
 *   so a score does not grow with `P`: `a = ⟨gx²⟩`, `b = ⟨gx·gy⟩`,
 *   `c = ⟨gy²⟩`, and `λ_min = (a + c)/2 − √(((a − c)/2)² + b²)`, clamped at 0.
 * - The stored score is `λ_min · s_l²`: gradients re-expressed per
 *   **level-0** pixel, units (grey levels / level-0 px)². The inverse of the
 *   Lucas–Kanade localisation variance scales with it, measured in level-0
 *   pixels — the space the homography is fitted in — so scores from
 *   different levels are comparable, and the one global greedy pass below
 *   can rank them against each other. In level units, the coarser levels'
 *   steeper gradients would outrank level 0 whatever they localised to.
 *
 * Sums are taken over integral images of the integer products
 * `(2gx)²`, `(2gx)(2gy)`, `(2gy)²`, which stay exact in float64 up to far
 * beyond any image a `.wnft` can hold, so a window's sums do not depend on
 * summation order. The score is rounded to `f32` before any comparison, as
 * the contract requires.
 *
 * **Low texture.** A window whose `f32` score is below `minScore` is not a
 * candidate. The minimum eigenvalue rejects edges as well as flat areas: a
 * straight edge has one strong gradient direction and a `λ_min` near 0.
 *
 * **Spatial distribution** is non-maximum suppression by distance: the greedy
 * pass, in the order the contract fixes (score descending, ties by `(level,
 * top, left)` ascending), skips a candidate whose centre lies closer than
 * `minSpacing` to one already chosen, measured in level-0 pixels across
 * levels, and stops at `maxPatches`. The centre is
 * `((left + (P − 1)/2) / s_l, (top + (P − 1)/2) / s_l)`, the rule
 * `PatchObservation` states, with `s_l` from {@link levelScale} and nowhere
 * else. The returned table is in that selection order.
 *
 * Cost: `O(pixels)` for the integral images and scores, a sort of the
 * candidates, and `O(candidates · Q)` distance checks — an offline cost,
 * paid once per compiled target.
 */
export const selectPatches: SelectPatches = (target, options) => {
    if (!validOptions(options)) return { ok: false, reason: "invalid-options" };
    if (!validPyramid(target)) return { ok: false, reason: "invalid-pyramid" };

    const P = options.patchSize;
    const levels = target.levels;
    // Safe: validPyramid has checked the step, the level count and that no
    // level's scale underflows.
    const scales = levels.map((_, l) => levelScale(target.scaleStep, l));

    let capacity = 0;
    for (const lv of levels) {
        if (lv.width >= P && lv.height >= P) capacity += (lv.width - P + 1) * (lv.height - P + 1);
    }
    const candScore = new Float32Array(capacity);
    const candLevel = new Uint8Array(capacity);
    const candTop = new Uint16Array(capacity);
    const candLeft = new Uint16Array(capacity);
    let n = 0;

    const n4 = 4 * (P - 2) * (P - 2);
    levels.forEach((lv, l) => {
        if (lv.width < P || lv.height < P) return;
        const { sxx, sxy, syy } = gradientIntegrals(lv);
        const stride = lv.width + 1;
        const s2 = scales[l] * scales[l];
        for (let top = 0; top + P <= lv.height; top++) {
            // Interior rows [top + 1, top + P − 2], as exclusive prefix bounds.
            const r0 = (top + 1) * stride;
            const r1 = (top + P - 1) * stride;
            for (let left = 0; left + P <= lv.width; left++) {
                const c0 = left + 1;
                const c1 = left + P - 1;
                const a = (sxx[r1 + c1] - sxx[r0 + c1] - sxx[r1 + c0] + sxx[r0 + c0]) / n4;
                const b = (sxy[r1 + c1] - sxy[r0 + c1] - sxy[r1 + c0] + sxy[r0 + c0]) / n4;
                const c = (syy[r1 + c1] - syy[r0 + c1] - syy[r1 + c0] + syy[r0 + c0]) / n4;
                const half = (a - c) / 2;
                const lambda = Math.max(0, (a + c) / 2 - Math.sqrt(half * half + b * b));
                const score = Math.fround(lambda * s2);
                if (!(score >= options.minScore)) continue;
                candScore[n] = score;
                candLevel[n] = l;
                candTop[n] = top;
                candLeft[n] = left;
                n++;
            }
        }
    });

    const order = Uint32Array.from({ length: n }, (_, i) => i).sort(
        (i, j) =>
            candScore[j] - candScore[i] ||
            candLevel[i] - candLevel[j] ||
            candTop[i] - candTop[j] ||
            candLeft[i] - candLeft[j],
    );

    const Q = Math.min(options.maxPatches, n);
    const chosen: number[] = [];
    const cx = new Float64Array(Q);
    const cy = new Float64Array(Q);
    const spacing2 = options.minSpacing * options.minSpacing;
    const offset = (P - 1) / 2;
    for (let k = 0; k < n && chosen.length < Q; k++) {
        const i = order[k];
        const s = scales[candLevel[i]];
        const x = (candLeft[i] + offset) / s;
        const y = (candTop[i] + offset) / s;
        // With no spacing nothing can be too close, and skipping the scan
        // keeps a large budget from costing candidates × Q comparisons.
        let clear = true;
        for (let q = 0; q < chosen.length && clear && spacing2 > 0; q++) {
            const dx = x - cx[q];
            const dy = y - cy[q];
            clear = !(dx * dx + dy * dy < spacing2);
        }
        if (!clear) continue;
        cx[chosen.length] = x;
        cy[chosen.length] = y;
        chosen.push(i);
    }

    if (chosen.length < 4) return { ok: false, reason: "too-few-patches" };
    return {
        ok: true,
        patches: toTable(levels, P, chosen, candScore, candLevel, candTop, candLeft),
    };
};

function validOptions(o: SelectPatchesOptions): boolean {
    return (
        Number.isInteger(o.patchSize) &&
        o.patchSize >= 3 &&
        Number.isInteger(o.maxPatches) &&
        o.maxPatches >= 4 &&
        o.minScore >= 0 &&
        o.minSpacing >= 0
    );
}

/**
 * A pyramid this function can read and a `.wnft` can hold. Everything
 * {@link levelScale} would throw on is refused here first: the step, the
 * level count (`MAX_LEVEL + 1`) and a scale that underflows to 0.
 */
function validPyramid(target: ImagePyramid): boolean {
    const { scaleStep, levels } = target;
    if (!(Number.isFinite(scaleStep) && scaleStep > 1)) return false;
    if (!Array.isArray(levels) || levels.length < 1 || levels.length > MAX_LEVEL + 1) return false;
    for (const lv of levels) {
        const { width, height, data } = lv;
        if (!(Number.isInteger(width) && width >= 1 && width <= MAX_SIDE)) return false;
        if (!(Number.isInteger(height) && height >= 1 && height <= MAX_SIDE)) return false;
        if (!(data instanceof Uint8Array) || data.length !== width * height) return false;
    }
    // The scale only shrinks with the level, so the deepest one is the one
    // that could underflow. This mirrors levelScale's own iteration so the
    // two agree on where underflow starts; it computes no coordinate.
    let scale = 1;
    for (let l = 1; l < levels.length; l++) scale /= scaleStep;
    return scale > 0;
}

/**
 * Exclusive-prefix integral images, `(width + 1) × (height + 1)`, of the
 * integer gradient products `(2gx)²`, `(2gx)(2gy)` and `(2gy)²`. Border pixels,
 * where a central difference would leave the image, contribute 0; no
 * window's interior ever reaches them.
 */
function gradientIntegrals(lv: GrayImage): {
    sxx: Float64Array;
    sxy: Float64Array;
    syy: Float64Array;
} {
    const { width: w, height: h, data } = lv;
    const stride = w + 1;
    const sxx = new Float64Array(stride * (h + 1));
    const sxy = new Float64Array(stride * (h + 1));
    const syy = new Float64Array(stride * (h + 1));
    for (let y = 0; y < h; y++) {
        let rxx = 0;
        let rxy = 0;
        let ryy = 0;
        for (let x = 0; x < w; x++) {
            if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
                const p = y * w + x;
                const dx = data[p + 1] - data[p - 1];
                const dy = data[p + w] - data[p - w];
                rxx += dx * dx;
                rxy += dx * dy;
                ryy += dy * dy;
            }
            const o = (y + 1) * stride + x + 1;
            sxx[o] = sxx[o - stride] + rxx;
            sxy[o] = sxy[o - stride] + rxy;
            syy[o] = syy[o - stride] + ryy;
        }
    }
    return { sxx, sxy, syy };
}

/** The §5.7 table of the chosen candidates, pixels copied verbatim. */
function toTable(
    levels: readonly GrayImage[],
    P: number,
    chosen: readonly number[],
    score: Float32Array,
    level: Uint8Array,
    top: Uint16Array,
    left: Uint16Array,
): PatchTable {
    const Q = chosen.length;
    const pixels = new Uint8Array(Q * P * P);
    chosen.forEach((i, q) => {
        const lv = levels[level[i]];
        for (let row = 0; row < P; row++) {
            const start = (top[i] + row) * lv.width + left[i];
            pixels.set(lv.data.subarray(start, start + P), (q * P + row) * P);
        }
    });
    return {
        patchSize: P,
        count: Q,
        score: Float32Array.from(chosen, (i) => score[i]),
        left: Uint16Array.from(chosen, (i) => left[i]),
        top: Uint16Array.from(chosen, (i) => top[i]),
        level: Uint8Array.from(chosen, (i) => level[i]),
        pixels,
    };
}
