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
import { isFiniteMat3, isInvertible, mul3, scaledToUnitCorner, scaledToUnitMax } from "./mat3.js";
import type { RobustHomography, RobustHomographyOptions } from "./types.js";

/**
 * IRLS with Tukey's biweight over patch correspondences — see
 * {@link RobustHomography} for the contract. Deterministic: no RANSAC, no
 * sampling, no random draw anywhere, so nothing here waits on an injectable
 * RNG (webarkit/webarkit#24).
 *
 * **Initialisation.** The first weights are Tukey's at the transfer errors of
 * `initial`, the prediction. No unweighted least-squares fit comes first and
 * nothing is sampled. A correspondence the prediction puts `tukeyC` or more
 * from its observation starts at weight 0. It is not dropped: every iteration
 * reweights every correspondence, so it comes back as soon as a fit brings it
 * inside `tukeyC`. The prediction must therefore put at least four
 * well-spread inliers inside `tukeyC`, and a caller sizes `tukeyC` for the
 * prediction's error as well as for the alignment noise. Started from the
 * prediction, this is a local estimator: a coherent group of outliers inside
 * `tukeyC`, with the inliers outside it, would be fitted instead.
 *
 * **Scale.** None is estimated from the data. The cutoff is `c = tukeyC`, a
 * fixed distance in frame level-0 px, as types.ts pins it. TRACK quality is
 * built from these weights, so a weight must mean the same thing on every
 * frame — agreement within `c` px — and a data-driven scale cannot promise
 * that: a MAD scale rescales to each frame's own spread (a frame whose
 * patches are all 3 px off would score like one where they are exact), breaks
 * down at 50% outliers, and collapses to 0 on noise-free data.
 *
 * **Each iteration** fits H to the current weights by a weighted DLT
 * ({@link weightedDlt}), then reweights at that H. The DLT minimises the
 * weighted algebraic error, which is the transfer error times the point's
 * projective depth — the same for every point of an affine H, so under strong
 * perspective the fixed point weighs near and far patches slightly unlike a
 * geometric M-estimator would. The residuals and weights, and so the result,
 * are always the geometric ones.
 *
 * **Cap.** At most `maxIterations` fits. Reaching it returns the last fit and
 * its weights, with `converged: false`.
 *
 * **Convergence test.** Converged when the weighted RMS residual — the
 * `rmsError` formula — changes by less than `epsilon` px from one fit to the
 * next. The first change is measured from the RMS at `initial`, so an exact
 * prediction converges in one fit, and exact data from an inexact prediction
 * in two.
 *
 * **Failures,** in the order checked: `invalid-options` (`tukeyC` and
 * `epsilon` must also be finite); `invalid-input` (`initial` must also be nine
 * numbers); `too-few-points`; then, at the prediction or after any fit,
 * `too-few-inliers` when fewer than four weights are positive (an `initial`
 * that sends every point to infinity, or nowhere at all like the zero matrix,
 * leaves every weight at 0), and `singular` when a fit is — see {@link weightedDlt} for what counts, and
 * {@link SINGULAR_PIVOT_RATIO} and `SINGULAR_RELATIVE_DET` (`mat3.ts`) for
 * the measurements behind each threshold.
 *
 * **Measured outlier breakdown** (the test file has the model and every
 * number): 40 patches, σ = 0.25 px, a prediction 3 px off, `tukeyC` = 4 px,
 * outliers 5–16 px from their true position. Every outlier is rejected in
 * 2000 seeds out of 2000 up to 45% contamination; failures begin at 50%.
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
    if (countPositive(weights) < 4) return { ok: false, reason: "too-few-inliers" };
    let rms = weightedRms(residuals, weights);

    // Each iteration fits H to the current weights, then reweights at that H.
    let H: Mat3;
    let iterations = 0;
    let converged = false;
    do {
        const fit = weightedDlt(src, dst, weights);
        if (fit === null) return { ok: false, reason: "singular" };
        H = fit;
        iterations++;
        transferErrors(H, src, dst, residuals);
        tukeyWeights(residuals, c, weights);
        if (countPositive(weights) < 4) return { ok: false, reason: "too-few-inliers" };
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
 * `r_i = ‖π(H · src_i) − dst_i‖₂` into `out`, px, by {@link norm2}, so a
 * finite residual stays finite. A point `H` sends to or beyond infinity gets
 * `NaN` or `Infinity`, which {@link tukeyWeights} turns into a weight of 0.
 */
function transferErrors(H: Mat3, src: PointArray, dst: PointArray, out: Float64Array): void {
    for (let i = 0; i < out.length; i++) {
        const x = src[2 * i];
        const y = src[2 * i + 1];
        const w = H[6] * x + H[7] * y + H[8];
        const dx = (H[0] * x + H[1] * y + H[2]) / w - dst[2 * i];
        const dy = (H[3] * x + H[4] * y + H[5]) / w - dst[2 * i + 1];
        out[i] = norm2(dx, dy);
    }
}

/**
 * `√(a² + b²)` without squaring either: both are divided by the larger
 * magnitude first, so the result is finite whenever it is representable —
 * `√(dx² + dy²)` overflows once a component passes ~1.3e154. `NaN` and
 * `Infinity` pass through. Built from basic IEEE-754 operations and `√` only,
 * which round the same way on every engine and in a port.
 */
function norm2(a: number, b: number): number {
    const x = Math.abs(a);
    const y = Math.abs(b);
    const m = Math.max(x, y);
    if (!(m > 0) || m === Infinity) return m;
    const p = x / m;
    const q = y / m;
    return m * Math.sqrt(p * p + q * q);
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

/**
 * `√(Σ w_i · r_i² / Σ w_i)` over the points with `w_i > 0`, px. Its callers
 * have checked that at least four weights are positive, so `Σ w_i > 0`.
 *
 * Taken relative to the largest such residual, as `peak · √(Σ w_i (r_i /
 * peak)² / Σ w_i)`, so no residual is squared: the result is at most `peak`,
 * and finite because every weighted residual is (it is below `tukeyC`).
 */
function weightedRms(residuals: Float64Array, weights: Float64Array): number {
    let peak = 0;
    for (let i = 0; i < weights.length; i++) {
        if (weights[i] > 0 && residuals[i] > peak) peak = residuals[i];
    }
    if (peak === 0) return 0;
    let sw = 0;
    let swq2 = 0;
    for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (w > 0) {
            const q = residuals[i] / peak;
            sw += w;
            swq2 += w * q * q;
        }
    }
    return peak * Math.sqrt(swq2 / sw);
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
 *
 * `null` when the fit is singular: the weighted points of `src` or `dst` all
 * coincide; the normal system is singular ({@link choleskySolve}); or the
 * solution is — H̃ with a relative determinant at or below
 * `SINGULAR_RELATIVE_DET` (`mat3.ts`), which is how three collinear points
 * among four, or a target seen edge-on, come out: the normal system is
 * regular and its solution maps the plane onto a line or a point. Last, an H
 * whose `H[8]` is 0 or that is not finite once rescaled.
 */
function weightedDlt(src: PointArray, dst: PointArray, weights: Float64Array): Mat3 | null {
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
        spreadSrc += w * norm2(ax, ay);
        spreadDst += w * norm2(au, av);
    }
    // √2 over the weighted mean distance from the centroid.
    const ss = (Math.SQRT2 * sw) / spreadSrc;
    const sd = (Math.SQRT2 * sw) / spreadDst;
    // Infinite when every weighted point sits on its centroid.
    if (!(Number.isFinite(ss) && Number.isFinite(sd))) return null;

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
    if (h === null) return null;
    const Hn = Float64Array.from([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
    if (!isInvertible(Hn)) return null;
    const Ts = Float64Array.from([ss, 0, -ss * cx, 0, ss, -ss * cy, 0, 0, 1]);
    const TdInv = Float64Array.from([1 / sd, 0, cu, 0, 1 / sd, cv, 0, 0, 1]);
    const H = mul3(mul3(TdInv, Hn), Ts);
    if (H[8] === 0) return null;
    const scaled = scaledToUnitCorner(H);
    return isFiniteMat3(scaled) ? scaled : null;
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

/**
 * A normal system counts as singular when a Cholesky pivot `d_k` is at or
 * below this fraction of its diagonal entry `N_kk`.
 *
 * `d_k / N_kk` is `sin²` of the angle between column `k` of the weighted
 * system and the span of the columns before it, so it reads directly as
 * "how nearly dependent". Measured on the normalised DLT: exactly degenerate
 * sets — collinear points, three distinct points among six, three collinear
 * among four, a target sent to one point — first fail on a pivot of at most
 * 3.2e-16 in magnitude, some of them negative: rounding. The 40-point grid
 * under six views up to 85° of tilt gives 0.43–0.61, and the worst of
 * ~120 000 random 4- to 10-point sets with no three points within 20 px of a
 * line gives 5.9e-7. The threshold sits 5½ orders above rounding and nearly 4
 * below that worst valid set. In pixels: for points spread over `L` px of a
 * line and straying up to `b/2` px from it, the smallest pivot ratio scales
 * as `(b / L)²` — eight points over ~700 px measure `3.2e-6 · b²`, so they
 * are singular below `b ≈ 0.006 px`, within a few thousandths of a pixel of
 * the line, and fitted above.
 */
const SINGULAR_PIVOT_RATIO = 1e-10;

/**
 * Solves `N h = rhs` for symmetric positive-definite `N` (lower triangle
 * read) by Cholesky, or returns `null` when a pivot fails
 * {@link SINGULAR_PIVOT_RATIO}. Fixed size and order: no loop here iterates
 * to convergence.
 */
function choleskySolve(N: Float64Array, rhs: Float64Array): Float64Array | null {
    const m = 8;
    const L = new Float64Array(m * m);
    for (let k = 0; k < m; k++) {
        let d = N[k * m + k];
        for (let j = 0; j < k; j++) d -= L[k * m + j] * L[k * m + j];
        // Also false for NaN, and for an all-zero column (0 > 0).
        if (!(d > SINGULAR_PIVOT_RATIO * N[k * m + k])) return null;
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
