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
 * Sums are of the integer products `(2gx)²`, `(2gx)(2gy)`, `(2gy)²`, kept as
 * running column sums over the window's interior rows and a running sum
 * across them, so a level needs `O(width)` working memory rather than
 * full-size integral images. Every sum is an integer far below `2^53`, so it
 * is exact in float64 and does not depend on summation order. The score is
 * rounded to `f32` before any comparison, as the contract requires.
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
 * Cost: `O(pixels)` time for the scores; memory `O(width)` per level for
 * the running sums, plus the qualifying candidates (raise `minScore` to
 * shrink those); a sort of the candidates; and a spacing check that looks
 * only at chosen centres in the neighbouring cells of a grid of
 * `minSpacing`-sized cells, so a large budget stays linear. An offline
 * cost, paid once per compiled target.
 *
 * **No bound here, on purpose.** On a fully textured level every window can
 * clear `minScore`, so candidate memory is bounded only by the window count,
 * and nothing here refuses a large one. The bound lives in the caller:
 * selection runs at compile time, on an image the developer chose, and
 * `compile-target` knows the image size and options, so it refuses an
 * oversized combination before calling (`MAX_PATCH_WINDOWS` in
 * `bin/compile-target.mjs`). Refusing here would need a new
 * `PatchSelectionFailure` reason, a change to the contract the #48 branches
 * share. **Reopen when** the compiler runs in the browser on arbitrary user
 * images (M5): this function then receives uncontrolled input, and an
 * explicit failure reason for an oversized pyramid is justified.
 */
export const selectPatches: SelectPatches = (target, options) => {
    if (!validOptions(options)) return { ok: false, reason: "invalid-options" };
    if (!validPyramid(target)) return { ok: false, reason: "invalid-pyramid" };

    const P = options.patchSize;
    const levels = target.levels;
    // Safe: validPyramid has checked the step, the level count and that no
    // level's scale underflows.
    const scales = levels.map((_, l) => levelScale(target.scaleStep, l));

    const cand = new Candidates();
    const n4 = 4 * (P - 2) * (P - 2);
    levels.forEach((lv, l) => {
        if (lv.width < P || lv.height < P) return;
        const s2 = scales[l] * scales[l];
        scoreLevel(lv, P, (top, left, sxx, sxy, syy) => {
            const a = sxx / n4;
            const b = sxy / n4;
            const c = syy / n4;
            const half = (a - c) / 2;
            const lambda = Math.max(0, (a + c) / 2 - Math.sqrt(half * half + b * b));
            const score = Math.fround(lambda * s2);
            if (score >= options.minScore) cand.push(score, l, top, left);
        });
    });
    const n = cand.length;
    const candScore = cand.score;
    const candLevel = cand.level;
    const candTop = cand.top;
    const candLeft = cand.left;

    const order = Uint32Array.from({ length: n }, (_, i) => i).sort(
        (i, j) =>
            candScore[j] - candScore[i] ||
            candLevel[i] - candLevel[j] ||
            candTop[i] - candTop[j] ||
            candLeft[i] - candLeft[j],
    );

    const Q = Math.min(options.maxPatches, n);
    const chosen: number[] = [];
    const grid = new SpacingGrid(options.minSpacing);
    const offset = (P - 1) / 2;
    for (let k = 0; k < n && chosen.length < Q; k++) {
        const i = order[k];
        // Finite: validPyramid holds every level to ImagePyramid's size rule,
        // so a level at least P wide has s_l ≥ P / w0.
        const s = scales[candLevel[i]];
        const x = (candLeft[i] + offset) / s;
        const y = (candTop[i] + offset) / s;
        if (!grid.clear(x, y)) continue;
        grid.add(x, y);
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
        Number.isFinite(o.minScore) &&
        o.minScore >= 0 &&
        Number.isFinite(o.minSpacing) &&
        o.minSpacing >= 0
    );
}

/**
 * A valid {@link ImagePyramid} that a `.wnft` can hold. Everything
 * {@link levelScale} would throw on is refused first — the step, the level
 * count (`MAX_LEVEL + 1`) and a scale that underflows to 0 — and then every
 * level must have the size `ImagePyramid` defines, `(w0 · s_l) | 0` ×
 * `(h0 · s_l) | 0`: the rule `build_from_image` records as `levelSizes`, so
 * a pyramid of a target's own sizes passes.
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
    if (!(scale > 0)) return false;

    const { width: w0, height: h0 } = levels[0];
    for (let l = 1; l < levels.length; l++) {
        const s = levelScale(scaleStep, l);
        if (levels[l].width !== ((w0 * s) | 0) || levels[l].height !== ((h0 * s) | 0)) {
            return false;
        }
    }
    return true;
}

/**
 * Calls `visit(top, left, sxx, sxy, syy)` for every `P × P` window of `lv`,
 * rows then columns, with the sums of `(2gx)²`, `(2gx)(2gy)` and `(2gy)²`
 * over the window's interior `[top + 1, top + P − 2] × [left + 1, left + P − 2]`.
 *
 * Column sums over the current interior rows are updated by one row out and
 * one row in per step down, and each row of windows is a running sum across
 * them — the same integers integral images would give, in `O(width)` memory.
 * `lv` is at least `P` in both dimensions.
 */
function scoreLevel(
    lv: GrayImage,
    P: number,
    visit: (top: number, left: number, sxx: number, sxy: number, syy: number) => void,
): void {
    const { width: w, height: h, data } = lv;
    const colXX = new Float64Array(w);
    const colXY = new Float64Array(w);
    const colYY = new Float64Array(w);

    // Adds (sign = 1) or removes (sign = −1) interior row `y`'s products.
    const addRow = (y: number, sign: number) => {
        for (let x = 1; x < w - 1; x++) {
            const p = y * w + x;
            const dx = data[p + 1] - data[p - 1];
            const dy = data[p + w] - data[p - w];
            colXX[x] += sign * dx * dx;
            colXY[x] += sign * dx * dy;
            colYY[x] += sign * dy * dy;
        }
    };

    for (let y = 1; y <= P - 2; y++) addRow(y, 1);
    for (let top = 0; top + P <= h; top++) {
        if (top > 0) {
            addRow(top, -1);
            addRow(top + P - 2, 1);
        }
        let sxx = 0;
        let sxy = 0;
        let syy = 0;
        for (let x = 1; x <= P - 2; x++) {
            sxx += colXX[x];
            sxy += colXY[x];
            syy += colYY[x];
        }
        for (let left = 0; left + P <= w; left++) {
            if (left > 0) {
                sxx += colXX[left + P - 2] - colXX[left];
                sxy += colXY[left + P - 2] - colXY[left];
                syy += colYY[left + P - 2] - colYY[left];
            }
            visit(top, left, sxx, sxy, syy);
        }
    }
}

/**
 * The qualifying candidates, in growable typed arrays: only windows at or
 * above `minScore` take memory, not every window of every level.
 */
class Candidates {
    length = 0;
    score = new Float32Array(1024);
    level = new Uint8Array(1024);
    top = new Uint16Array(1024);
    left = new Uint16Array(1024);

    push(score: number, level: number, top: number, left: number): void {
        if (this.length === this.score.length) this.grow();
        const i = this.length++;
        this.score[i] = score;
        this.level[i] = level;
        this.top[i] = top;
        this.left[i] = left;
    }

    private grow(): void {
        const size = this.score.length * 2;
        const score = new Float32Array(size);
        const level = new Uint8Array(size);
        const top = new Uint16Array(size);
        const left = new Uint16Array(size);
        score.set(this.score);
        level.set(this.level);
        top.set(this.top);
        left.set(this.left);
        this.score = score;
        this.level = level;
        this.top = top;
        this.left = left;
    }
}

/**
 * The chosen centres, bucketed in square cells no smaller than `minSpacing`,
 * so "is any chosen centre closer than `minSpacing`?" reads only the 3 × 3
 * neighbouring cells — the same answer as scanning them all, since a centre
 * closer than one cell side is at most one cell away.
 *
 * The side carries a `1e-9` relative margin so that rounding in `x / side`
 * cannot push a near neighbour two cells over, and is at least one level-0
 * pixel so cell indices stay small for a sub-pixel spacing (centres lie in
 * `[0, 65535]`). A larger cell only means more centres per cell, never a
 * missed one.
 */
class SpacingGrid {
    private readonly spacing2: number;
    private readonly side: number;
    private readonly cells = new Map<number, number[]>();
    private readonly xs: number[] = [];
    private readonly ys: number[] = [];

    constructor(minSpacing: number) {
        this.spacing2 = minSpacing * minSpacing;
        this.side = Math.max(1, minSpacing * (1 + 1e-9));
    }

    private key(gx: number, gy: number): number {
        return gx * 0x10001 + gy;
    }

    clear(x: number, y: number): boolean {
        // With no spacing nothing can be too close.
        if (this.spacing2 === 0) return true;
        const gx = Math.floor(x / this.side);
        const gy = Math.floor(y / this.side);
        for (let i = gx - 1; i <= gx + 1; i++) {
            for (let j = gy - 1; j <= gy + 1; j++) {
                const bucket = this.cells.get(this.key(i, j));
                if (bucket === undefined) continue;
                for (const q of bucket) {
                    const dx = x - this.xs[q];
                    const dy = y - this.ys[q];
                    if (dx * dx + dy * dy < this.spacing2) return false;
                }
            }
        }
        return true;
    }

    add(x: number, y: number): void {
        if (this.spacing2 === 0) return;
        const q = this.xs.length;
        this.xs.push(x);
        this.ys.push(y);
        const k = this.key(Math.floor(x / this.side), Math.floor(y / this.side));
        const bucket = this.cells.get(k);
        if (bucket === undefined) this.cells.set(k, [q]);
        else bucket.push(q);
    }
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
