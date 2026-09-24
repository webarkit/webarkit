/*
 *  robust_homography.ts
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

import type { Mat3, PointArray } from "@webarkit/cv-backend-spec";
import { isFiniteMat3, mul3, scaledToUnitCorner, scaledToUnitMax } from "./mat3.js";
import type { RobustHomography, RobustHomographyOptions } from "./types.js";

/**
 * IRLS with Tukey's biweight over patch correspondences — see
 * {@link RobustHomography} for the contract.
 */
export const robustHomography: RobustHomography = (src, dst, initial, options) => {
    if (!validOptions(options)) return { ok: false, reason: "invalid-options" };
    if (src.length !== dst.length || src.length % 2 !== 0) {
        return { ok: false, reason: "invalid-input" };
    }
    if (!allFinite(src) || !allFinite(dst) || !isFiniteMat3(initial)) {
        return { ok: false, reason: "invalid-input" };
    }
    const n = src.length / 2;
    if (n < 4) return { ok: false, reason: "too-few-points" };

    const c = options.tukeyC;
    const residuals = new Float64Array(n);
    const weights = new Float64Array(n);
    transferErrors(scaledToUnitMax(initial), src, dst, residuals);
    tukeyWeights(residuals, c, weights);
    let rms = weightedRms(residuals, weights);

    // Each iteration fits H to the current weights, then reweights at that H.
    let H: Mat3;
    let iterations = 0;
    let converged = false;
    do {
        H = weightedDlt(src, dst, weights);
        iterations++;
        transferErrors(H, src, dst, residuals);
        tukeyWeights(residuals, c, weights);
        const next = weightedRms(residuals, weights);
        converged = Math.abs(next - rms) < options.epsilon;
        rms = next;
    } while (!converged && iterations < options.maxIterations);
    return {
        ok: true,
        H,
        weights,
        numInliers: countPositive(weights),
        rmsError: rms,
        iterations,
        converged,
    };
};

/**
 * `r_i = ‖π(H · src_i) − dst_i‖₂` into `out`, px. A point `H` sends to or
 * beyond infinity gets `NaN` or `Infinity`, which {@link tukeyWeights} turns
 * into a weight of 0.
 */
function transferErrors(H: Mat3, src: PointArray, dst: PointArray, out: Float64Array): void {
    for (let i = 0; i < out.length; i++) {
        const x = src[2 * i];
        const y = src[2 * i + 1];
        const w = H[6] * x + H[7] * y + H[8];
        const dx = (H[0] * x + H[1] * y + H[2]) / w - dst[2 * i];
        const dy = (H[3] * x + H[4] * y + H[5]) / w - dst[2 * i + 1];
        out[i] = Math.sqrt(dx * dx + dy * dy);
    }
}

/** Tukey's biweight, `(1 − (r/c)²)²` below `c` and 0 from `c` on, into `out`. */
function tukeyWeights(residuals: Float64Array, c: number, out: Float64Array): void {
    for (let i = 0; i < residuals.length; i++) {
        const r = residuals[i];
        if (r < c) {
            const t = 1 - (r / c) * (r / c);
            out[i] = t * t;
        } else {
            out[i] = 0;
        }
    }
}

/** `√(Σ w_i · r_i² / Σ w_i)` over the points with `w_i > 0`, px. */
function weightedRms(residuals: Float64Array, weights: Float64Array): number {
    let sw = 0;
    let swr2 = 0;
    for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (w > 0) {
            sw += w;
            swr2 += w * residuals[i] * residuals[i];
        }
    }
    return Math.sqrt(swr2 / sw);
}

function countPositive(weights: Float64Array): number {
    let count = 0;
    for (let i = 0; i < weights.length; i++) if (weights[i] > 0) count++;
    return count;
}

/**
 * One weighted DLT fit: the H minimising `Σ w_i · ‖e_i‖²`, with `e_i` the
 * algebraic error of correspondence `i`, returned with `H[8] = 1`.
 *
 * Hartley-normalised: `src` and `dst` are each translated to their weighted
 * centroid and scaled to a weighted mean distance of `√2` from it. The
 * normalised H̃ is solved with `h̃₉ = 1`, as the 8×8 normal system, by
 * Cholesky — a direct solve, so the only loop here that iterates to
 * convergence is the IRLS one. Fixing `h̃₉` is safe: it is the projective
 * depth H gives the weighted centroid of `src`, which is 0 only when that
 * point maps to infinity.
 */
function weightedDlt(src: PointArray, dst: PointArray, weights: Float64Array): Mat3 {
    const n = weights.length;
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let su = 0;
    let sv = 0;
    for (let i = 0; i < n; i++) {
        const w = weights[i];
        if (!(w > 0)) continue;
        sw += w;
        sx += w * src[2 * i];
        sy += w * src[2 * i + 1];
        su += w * dst[2 * i];
        sv += w * dst[2 * i + 1];
    }
    const cx = sx / sw;
    const cy = sy / sw;
    const cu = su / sw;
    const cv = sv / sw;
    let spreadSrc = 0;
    let spreadDst = 0;
    for (let i = 0; i < n; i++) {
        const w = weights[i];
        if (!(w > 0)) continue;
        const ax = src[2 * i] - cx;
        const ay = src[2 * i + 1] - cy;
        const au = dst[2 * i] - cu;
        const av = dst[2 * i + 1] - cv;
        spreadSrc += w * Math.sqrt(ax * ax + ay * ay);
        spreadDst += w * Math.sqrt(au * au + av * av);
    }
    // √2 over the weighted mean distance from the centroid.
    const ss = (Math.SQRT2 * sw) / spreadSrc;
    const sd = (Math.SQRT2 * sw) / spreadDst;

    // Each correspondence gives two rows of A h = b, with h = h̃₁…h̃₈:
    //   [x, y, 1, 0, 0, 0, −u·x, −u·y] · h = u
    //   [0, 0, 0, x, y, 1, −v·x, −v·y] · h = v
    // accumulated, weighted, into the lower triangle of N = AᵀWA and Aᵀ W b.
    const N = new Float64Array(64);
    const rhs = new Float64Array(8);
    const row = new Float64Array(8);
    for (let i = 0; i < n; i++) {
        const w = weights[i];
        if (!(w > 0)) continue;
        const x = (src[2 * i] - cx) * ss;
        const y = (src[2 * i + 1] - cy) * ss;
        const u = (dst[2 * i] - cu) * sd;
        const v = (dst[2 * i + 1] - cv) * sd;
        row.fill(0);
        row[0] = x;
        row[1] = y;
        row[2] = 1;
        row[6] = -u * x;
        row[7] = -u * y;
        accumulate(N, rhs, row, u, w);
        row.fill(0);
        row[3] = x;
        row[4] = y;
        row[5] = 1;
        row[6] = -v * x;
        row[7] = -v * y;
        accumulate(N, rhs, row, v, w);
    }
    const h = choleskySolve(N, rhs);
    const Hn = Float64Array.from([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
    const Ts = Float64Array.from([ss, 0, -ss * cx, 0, ss, -ss * cy, 0, 0, 1]);
    const TdInv = Float64Array.from([1 / sd, 0, cu, 0, 1 / sd, cv, 0, 0, 1]);
    return scaledToUnitCorner(mul3(mul3(TdInv, Hn), Ts));
}

/** `N += w · rowᵀ·row` (lower triangle) and `rhs += w · b · row`. */
function accumulate(
    N: Float64Array,
    rhs: Float64Array,
    row: Float64Array,
    b: number,
    w: number,
): void {
    for (let j = 0; j < 8; j++) {
        const wr = w * row[j];
        if (wr === 0) continue;
        rhs[j] += wr * b;
        for (let k = 0; k <= j; k++) N[j * 8 + k] += wr * row[k];
    }
}

/** Solves `N h = rhs` for symmetric positive-definite `N` (lower triangle read) by Cholesky. */
function choleskySolve(N: Float64Array, rhs: Float64Array): Float64Array {
    const m = 8;
    const L = new Float64Array(m * m);
    for (let k = 0; k < m; k++) {
        let d = N[k * m + k];
        for (let j = 0; j < k; j++) d -= L[k * m + j] * L[k * m + j];
        const lkk = Math.sqrt(d);
        L[k * m + k] = lkk;
        for (let i = k + 1; i < m; i++) {
            let s = N[i * m + k];
            for (let j = 0; j < k; j++) s -= L[i * m + j] * L[k * m + j];
            L[i * m + k] = s / lkk;
        }
    }
    const y = new Float64Array(m);
    for (let i = 0; i < m; i++) {
        let s = rhs[i];
        for (let j = 0; j < i; j++) s -= L[i * m + j] * y[j];
        y[i] = s / L[i * m + i];
    }
    const h = new Float64Array(m);
    for (let i = m - 1; i >= 0; i--) {
        let s = y[i];
        for (let j = i + 1; j < m; j++) s -= L[j * m + i] * h[j];
        h[i] = s / L[i * m + i];
    }
    return h;
}

/**
 * The domains stated on {@link RobustHomographyOptions}, finite included: a
 * cutoff or a tolerance of `Infinity` is not a distance.
 */
function validOptions(o: RobustHomographyOptions): boolean {
    return (
        Number.isInteger(o.maxIterations) &&
        o.maxIterations >= 1 &&
        Number.isFinite(o.tukeyC) &&
        o.tukeyC > 0 &&
        Number.isFinite(o.epsilon) &&
        o.epsilon > 0
    );
}

function allFinite(a: PointArray): boolean {
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
    return true;
}
