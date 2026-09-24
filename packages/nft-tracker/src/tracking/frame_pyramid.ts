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
 *
 * **Filter.** Each level is resampled from the one before it, separably in
 * x and y. Level `l`'s pixel `x_l` stands for level 0's `x_l / s_l` (§3,
 * decision D2: no half-pixel correction), which is level `l − 1`'s
 * `c = x_l · r` with `r = s_{l−1} / s_l`. Its value is the previous level,
 * reconstructed bilinearly, averaged over a box of width `r` centred on `c`:
 * the weight of source pixel `k` is `(1/r) ∫ tri(x − k) dx` over
 * `[c − r/2, c + r/2]`, `tri` being the unit triangle. Edge pixels are
 * extended; values are rounded to the nearest integer. Why this filter:
 *
 * - **It reproduces linear intensity exactly** — constant and first moment —
 *   at every sampling phase, because it integrates an exact linear
 *   reconstruction. So level content sits exactly where D2 says it does,
 *   which sub-pixel patch alignment depends on. A triangle of half-width `r`
 *   sampled at `c` (the common "bilinear" downscale) does not: its discrete
 *   centroid drifts with the phase of `c` (at `r = ∛2`, `c = 0.3`, the taps'
 *   centroid is 0.368), shifting content by a varying fraction of a pixel.
 * - **It is the textbook filter at step 2**: there it reduces to the
 *   `[1, 2, 1] / 4` decimation, whose response at the source's Nyquist
 *   frequency is 0. At `∛2` its anti-aliasing is modest: 1-px stripes keep
 *   38% of their swing (`2 · sinc(r/2) · sinc²(1/2)`) at the first step.
 *   Blur accumulates down the cascade: each step adds the kernel's variance,
 *   `r²/12 + 1/6` source px², which in a level's own pixels settles at
 *   `(r²/12 + 1/6) / (r² − 1)` — σ ≈ 0.71 px at `∛2` — so it is the first
 *   step, from an unfiltered level 0, that aliases most. Both pyramids alias
 *   alike, since one function builds both (Q11, below).
 * - **It is small**: support `r + 2`, so three or four taps per axis at `∛2`,
 *   and each level costs a pass over the level before it, not over level 0.
 *
 * Every weight comes from `+ − × ÷` on the level scales, so the output is
 * bit-identical for the same input on any engine.
 *
 * **Open question Q11.** Format spec §5.7 does not say which filter produced
 * a target's level images. The tracker needs its stored patches and the
 * frame's levels to be filtered alike, and today guarantees it by building
 * both with this function (types.ts). The assumption made here, and relied on
 * by `alignPatch`, is exactly that: **a patch's pixels were cut from a level
 * this function built, with the target's `scaleStep`.** A target compiled by
 * another implementation, or with another filter, still aligns — but with a
 * blur mismatch this code cannot see, whose cost is unmeasured until Q11 is
 * settled.
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
    for (let l = 1; l < levels; l++) {
        const [w, h] = sizes[l - 1];
        const level = { data: new Uint8Array(w * h), width: w, height: h };
        downsample(out[l - 1], level, scales[l - 1] / scales[l]);
        out.push(level);
    }
    return { ok: true, pyramid: { scaleStep, levels: out } };
};

/**
 * One pyramid step: `dst` from `src`, with `dst`'s pixel `i` centred on
 * `src`'s `i · r` along each axis. See the filter notes on
 * {@link buildFramePyramid}.
 */
function downsample(src: GrayImage, dst: GrayImage, r: number): void {
    const sw = src.width;
    const sh = src.height;
    const dw = dst.width;
    const dh = dst.height;
    const cols = taps(dw, sw, r);
    const rows = taps(dh, sh, r);
    const tmp = new Float32Array(sh * dw);
    if (cols.maxCount <= 4 && rows.maxCount <= 4) {
        downsample4(src, dst, tmp, fourTaps(cols, dw), fourTaps(rows, dh));
        return;
    }
    const { start: cStart, index: cIndex, weight: cWeight } = cols;
    const { start: rStart, index: rIndex, weight: rWeight } = rows;

    // Horizontal pass: every source row, filtered to the destination width.
    // The taps of consecutive outputs are consecutive, so one cursor walks
    // them all.
    const s = src.data;
    for (let y = 0; y < sh; y++) {
        const srcRow = y * sw;
        let o = y * dw;
        let t = cStart[0];
        for (let x = 0; x < dw; x++, o++) {
            const end = cStart[x + 1];
            let acc = 0;
            for (; t < end; t++) acc += cWeight[t] * s[srcRow + cIndex[t]];
            tmp[o] = acc;
        }
    }

    // Vertical pass, a whole row of taps at a time.
    const acc = new Float64Array(dw);
    const d = dst.data;
    for (let y = 0; y < dh; y++) {
        acc.fill(0);
        const end = rStart[y + 1];
        for (let t = rStart[y]; t < end; t++) {
            const w = rWeight[t];
            const tmpRow = rIndex[t] * dw;
            for (let x = 0; x < dw; x++) acc[x] += w * tmp[tmpRow + x];
        }
        const dstRow = y * dw;
        // Weights are non-negative and sum to 1, so `acc` is in [0, 255]
        // up to rounding: `+ 0.5` then truncation rounds to nearest.
        for (let x = 0; x < dw; x++) d[dstRow + x] = (acc[x] + 0.5) | 0;
    }
}

/**
 * {@link downsample} for kernels of at most four taps per output — every
 * step `r ≤ 2`, since the kernel's support `r + 2` then holds at most four
 * pixel centres — with each output padded to exactly four, the extra taps
 * weighing 0. The passes then unroll. The result is bit-identical to the
 * general path: the same products are summed in the same order, and adding
 * `+0` to a sum of non-negative terms is exact.
 */
function downsample4(
    src: GrayImage,
    dst: GrayImage,
    tmp: Float32Array,
    cols: FourTaps,
    rows: FourTaps,
): void {
    const { width: sw, height: sh, data: s } = src;
    const { width: dw, height: dh, data: d } = dst;
    const ci = cols.index;
    const cw = cols.weight;
    for (let y = 0; y < sh; y++) {
        const row = y * sw;
        let o = y * dw;
        for (let k = 0; k < 4 * dw; k += 4, o++) {
            tmp[o] =
                cw[k] * s[row + ci[k]] +
                cw[k + 1] * s[row + ci[k + 1]] +
                cw[k + 2] * s[row + ci[k + 2]] +
                cw[k + 3] * s[row + ci[k + 3]];
        }
    }
    for (let y = 0; y < dh; y++) {
        const k = 4 * y;
        const [w0, w1, w2, w3] = rows.weight.subarray(k, k + 4);
        const r0 = rows.index[k] * dw;
        const r1 = rows.index[k + 1] * dw;
        const r2 = rows.index[k + 2] * dw;
        const r3 = rows.index[k + 3] * dw;
        const o = y * dw;
        for (let x = 0; x < dw; x++) {
            const v = w0 * tmp[r0 + x] + w1 * tmp[r1 + x] + w2 * tmp[r2 + x] + w3 * tmp[r3 + x];
            d[o + x] = (v + 0.5) | 0;
        }
    }
}

/** {@link Taps} padded to exactly four per output: `index`/`weight` hold `4 · count` entries. */
interface FourTaps {
    readonly index: Int32Array;
    readonly weight: Float64Array;
}

function fourTaps(t: Taps, count: number): FourTaps {
    const index = new Int32Array(4 * count);
    const weight = new Float64Array(4 * count);
    for (let i = 0; i < count; i++) {
        const first = t.start[i];
        const n = t.start[i + 1] - first;
        for (let j = 0; j < 4; j++) {
            // Padding repeats the last real tap's pixel, at weight 0.
            index[4 * i + j] = t.index[first + Math.min(j, n - 1)];
            weight[4 * i + j] = j < n ? t.weight[first + j] : 0;
        }
    }
    return { index, weight };
}

/**
 * The variance, in source px², that one pyramid step of ratio `r` adds along
 * each axis: `r²/12` from the box of width `r`, plus `1/6` from the triangle
 * reconstruction (its variance averaged over the sampling phase).
 *
 * `alignPatch` uses it to blur a finer frame level the way this pyramid
 * would have on its way down to a patch's scale.
 */
export function stepVariance(r: number): number {
    return (r * r) / 12 + 1 / 6;
}

/** The taps of each of `count` outputs along one axis: CSR-style, `start` has `count + 1` entries. */
interface Taps {
    readonly start: Int32Array;
    readonly index: Int32Array;
    readonly weight: Float64Array;
    /** The most taps any output has. */
    readonly maxCount: number;
}

/**
 * Weights of the box-of-width-`r` average over the triangle (bilinear)
 * reconstruction, for outputs `0 … count − 1` centred at `i · r` on an axis
 * of `length` source pixels, indices clamped to it (edge extension).
 * Normalised to sum to 1 per output.
 */
function taps(count: number, length: number, r: number): Taps {
    const half = r / 2;
    const perOutput = Math.ceil(r + 2) + 1;
    const start = new Int32Array(count + 1);
    const index = new Int32Array(count * perOutput);
    const weight = new Float64Array(count * perOutput);
    let n = 0;
    let maxCount = 0;
    for (let i = 0; i < count; i++) {
        start[i] = n;
        const c = i * r;
        const first = Math.floor(c - half - 1) + 1;
        const last = Math.ceil(c + half + 1) - 1;
        let sum = 0;
        for (let k = first; k <= last; k++) {
            const w = triangleIntegral(c + half - k) - triangleIntegral(c - half - k);
            if (!(w > 0)) continue;
            index[n] = Math.min(length - 1, Math.max(0, k));
            weight[n] = w;
            sum += w;
            n++;
        }
        for (let t = start[i]; t < n; t++) weight[t] /= sum;
        maxCount = Math.max(maxCount, n - start[i]);
    }
    start[count] = n;
    return { start, index, weight, maxCount };
}

/** `∫ tri(t) dt` from −∞ to `u`, `tri` the unit triangle on `[−1, 1]`. */
function triangleIntegral(u: number): number {
    if (u <= -1) return 0;
    if (u <= 0) return ((u + 1) * (u + 1)) / 2;
    if (u < 1) return 1 - ((1 - u) * (1 - u)) / 2;
    return 1;
}

function isPositiveInteger(n: number): boolean {
    return Number.isInteger(n) && n > 0;
}

function fail(reason: FramePyramidFailure): FramePyramidResult {
    return { ok: false, reason };
}
