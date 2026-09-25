/*
 *  robust_homography.test.ts
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

import { describe, it, expect } from "vitest";
import type { Mat3, PointArray } from "@webarkit/cv-backend-spec";
import { robustHomography } from "../../src/index.js";
import type { RobustHomographyOptions } from "../../src/index.js";
import {
    chain,
    contaminate,
    corners,
    gaussian,
    maxTransferGap,
    perspective,
    planeView,
    project,
    projectAll,
    rotationAbout,
    scaling,
    translation,
} from "./homography_helpers.js";

// Options used unless a test says otherwise. tukeyC is the detection state's
// RANSAC threshold (DEFAULT_RANSAC_THRESHOLD, 4 px); nothing here is tuned.
const OPTIONS: RobustHomographyOptions = { maxIterations: 20, tukeyC: 4, epsilon: 1e-6 };

/** Patch centres on an 8×5 grid over a 640×480 target, interleaved. */
function targetGrid(): PointArray {
    const pts: number[] = [];
    for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 8; i++) pts.push(20 + i * 85, 20 + j * 110);
    }
    return Float64Array.from(pts);
}

// A view of the target with some perspective: w stays in [0.9, 1.1].
const H_TRUE: Mat3 = chain(
    translation(70, 35),
    rotationAbout(0.1, 320, 240),
    scaling(0.85),
    perspective(1.5e-4, -2e-4),
);

// Transfer error that still counts as exact recovery. One weighted DLT in
// Hartley-normalised coordinates: an 8×8 normal system whose condition number
// is at most ~1e4 here, so rounding moves a point by ~1e4 · 2.2e-16 · 640 px
// ≈ 1e-9 px at worst.
const EXACT_PX = 1e-6;

/** Tukey's biweight exactly as types.ts states it, written out independently. */
function tukey(r: number, c: number): number {
    return r < c ? (1 - (r / c) ** 2) ** 2 : 0;
}

/** The forward transfer error `‖π(H · src_i) − dst_i‖₂` of every correspondence, px. */
function transferErrors(H: Mat3, src: PointArray, dst: PointArray): number[] {
    const out: number[] = [];
    for (let i = 0; i < src.length; i += 2) {
        const [x, y] = project(H, src[i], src[i + 1]);
        out.push(Math.hypot(x - dst[i], y - dst[i + 1]));
    }
    return out;
}

type Fit = Extract<ReturnType<typeof robustHomography>, { ok: true }>;

/**
 * The result's weights, inlier count and RMS are what its own H gives under
 * types.ts's residual and weight — recomputed here from H alone, so a result
 * whose weights belong to some other H (the previous iterate, say) fails.
 */
function expectSelfConsistent(fit: Fit, src: PointArray, dst: PointArray, c: number): void {
    const r = transferErrors(fit.H, src, dst);
    expect(fit.weights.length).toBe(r.length);
    // 12 digits: this side takes the residual with Math.hypot, the
    // implementation with √(dx² + dy²), and the two differ by rounding
    // (~1e-16 relative), which moves a weight or the RMS by far less.
    r.forEach((ri, i) => expect(fit.weights[i], `w[${i}]`).toBeCloseTo(tukey(ri, c), 12));
    expect(fit.numInliers).toBe(fit.weights.filter((w) => w > 0).length);
    let sw = 0;
    let swr2 = 0;
    r.forEach((ri, i) => {
        if (fit.weights[i] > 0) {
            sw += fit.weights[i];
            swr2 += fit.weights[i] * ri * ri;
        }
    });
    expect(fit.rmsError).toBeCloseTo(Math.sqrt(swr2 / sw), 12);
}

describe("robustHomography input validation", () => {
    const src = targetGrid();
    const dst = projectAll(H_TRUE, src);

    it("rejects options outside their domain as invalid-options", () => {
        const bad: Partial<RobustHomographyOptions>[] = [
            { maxIterations: 0 },
            { maxIterations: -1 },
            { maxIterations: 1.5 },
            { maxIterations: Number.NaN },
            { maxIterations: Infinity },
            { tukeyC: 0 },
            { tukeyC: -4 },
            { tukeyC: Number.NaN },
            { tukeyC: Infinity },
            { epsilon: 0 },
            { epsilon: -1e-6 },
            { epsilon: Number.NaN },
            { epsilon: Infinity },
        ];
        for (const b of bad) {
            expect(
                robustHomography(src, dst, H_TRUE, { ...OPTIONS, ...b }),
                JSON.stringify(b),
            ).toEqual({
                ok: false,
                reason: "invalid-options",
            });
        }
    });

    it("rejects mismatched, odd or non-finite input as invalid-input", () => {
        const invalid = { ok: false, reason: "invalid-input" };
        expect(robustHomography(src, dst.subarray(0, dst.length - 2), H_TRUE, OPTIONS)).toEqual(
            invalid,
        );
        expect(robustHomography(src.subarray(1), dst.subarray(1), H_TRUE, OPTIONS)).toEqual(
            invalid,
        );
        expect(robustHomography(src, dst, H_TRUE.subarray(0, 8), OPTIONS)).toEqual(invalid);
        for (const v of [Number.NaN, Infinity, -Infinity]) {
            const s = src.slice();
            s[7] = v;
            const d = dst.slice();
            d[12] = v;
            const h = H_TRUE.slice();
            h[4] = v;
            expect(robustHomography(s, dst, H_TRUE, OPTIONS), `src ${v}`).toEqual(invalid);
            expect(robustHomography(src, d, H_TRUE, OPTIONS), `dst ${v}`).toEqual(invalid);
            expect(robustHomography(src, dst, h, OPTIONS), `initial ${v}`).toEqual(invalid);
        }
    });

    it("rejects fewer than four correspondences as too-few-points", () => {
        for (let n = 0; n < 4; n++) {
            expect(
                robustHomography(src.subarray(0, 2 * n), dst.subarray(0, 2 * n), H_TRUE, OPTIONS),
                `${n} points`,
            ).toEqual({ ok: false, reason: "too-few-points" });
        }
    });

    it("checks the options first, then the input, then the count", () => {
        const nan = Float64Array.from([0, 0, 1, Number.NaN]);
        expect(robustHomography(nan, nan, H_TRUE, { ...OPTIONS, tukeyC: 0 })).toEqual({
            ok: false,
            reason: "invalid-options",
        });
        expect(robustHomography(nan, nan, H_TRUE, OPTIONS)).toEqual({
            ok: false,
            reason: "invalid-input",
        });
    });

    it("leaves its inputs untouched", () => {
        const before = [Array.from(src), Array.from(dst), Array.from(H_TRUE)];
        robustHomography(src, dst, H_TRUE, OPTIONS);
        robustHomography(src.subarray(0, 6), dst.subarray(0, 6), H_TRUE, OPTIONS);
        expect([Array.from(src), Array.from(dst), Array.from(H_TRUE)]).toEqual(before);
    });
});

describe("robustHomography on exact correspondences", () => {
    const src = targetGrid();
    const checkPoints = Float64Array.from([...src, ...corners(640, 480)]);
    const views: [string, Mat3][] = [
        ["moderate perspective", H_TRUE],
        ["60° tilt, 15° yaw", planeView(60, 15, 1000)],
        [
            "small, far and rolled 100°",
            chain(translation(300, 200), rotationAbout(1.745, 0, 0), scaling(0.2)),
        ],
    ];
    for (const [name, H] of views) {
        it(`recovers H to rounding from a perfect prediction: ${name}`, () => {
            const dst = projectAll(H, src);
            const r = robustHomography(src, dst, H, OPTIONS);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.H[8]).toBe(1);
            expect(maxTransferGap(r.H, H, checkPoints)).toBeLessThan(EXACT_PX);
            expect(r.numInliers).toBe(40);
            expect(r.rmsError).toBeLessThan(EXACT_PX);
            // Below EXACT_PX, (r/c)² < 6.3e-14, so every weight is above 1 − 1.3e-13.
            for (const w of r.weights) expect(w).toBeGreaterThan(1 - 1e-12);
            expectSelfConsistent(r, src, dst, OPTIONS.tukeyC);
            // The prediction was already exact, so the first fit changes the
            // RMS by rounding only: converged after one fit.
            expect(r.iterations).toBe(1);
            expect(r.converged).toBe(true);
        });
    }
});

describe("robustHomography iteration", () => {
    const src = targetGrid();
    const exact = projectAll(H_TRUE, src);
    // The prediction is off by a 2 px pan: every inlier starts 2 px from
    // where the prediction puts it, inside tukeyC = 4 px.
    const PREDICTION: Mat3 = chain(translation(2, 0), H_TRUE);
    // One correspondence 4.5 px off in x: 2.5 px from the prediction, so it
    // starts with a weight of 0.37 and pulls the first fit, but it is 4.5 px
    // from the truth, beyond tukeyC.
    const OUTLIER = 17;
    const withOutlier = exact.slice();
    withOutlier[2 * OUTLIER] += 4.5;

    it("refits until the RMS settles: exact data from an inexact prediction takes two fits", () => {
        // Fit 1 is already exact, but its RMS moved 2 px from the
        // prediction's; fit 2 confirms it.
        const r = robustHomography(src, exact, PREDICTION, OPTIONS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(maxTransferGap(r.H, H_TRUE, src)).toBeLessThan(EXACT_PX);
        expect(r.iterations).toBe(2);
        expect(r.converged).toBe(true);
        expectSelfConsistent(r, src, exact, OPTIONS.tukeyC);
    });

    it("reweights an outlier that started inside tukeyC down to 0, leaving H exact", () => {
        const r = robustHomography(src, withOutlier, PREDICTION, OPTIONS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.weights[OUTLIER]).toBe(0);
        expect(r.numInliers).toBe(39);
        expect(maxTransferGap(r.H, H_TRUE, src)).toBeLessThan(EXACT_PX);
        expect(r.converged).toBe(true);
        expectSelfConsistent(r, src, withOutlier, OPTIONS.tukeyC);
    });

    it("reports reaching maxIterations as converged: false, with the last fit and its weights", () => {
        const r = robustHomography(src, withOutlier, PREDICTION, { ...OPTIONS, maxIterations: 1 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.iterations).toBe(1);
        expect(r.converged).toBe(false);
        // One fit is not enough: the outlier still pulls it.
        expect(maxTransferGap(r.H, H_TRUE, src)).toBeGreaterThan(EXACT_PX);
        expectSelfConsistent(r, src, withOutlier, OPTIONS.tukeyC);
    });

    it("stops as soon as the weighted RMS changes by less than epsilon", () => {
        // Epsilon is a change of RMS in px: at 10 px, the first fit's change
        // (about 2 px) already counts as converged.
        const r = robustHomography(src, withOutlier, PREDICTION, { ...OPTIONS, epsilon: 10 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.iterations).toBe(1);
        expect(r.converged).toBe(true);
    });
});

describe("robustHomography degenerate input", () => {
    const SINGULAR = { ok: false, reason: "singular" };
    const TOO_FEW_INLIERS = { ok: false, reason: "too-few-inliers" };
    const IDENTITY: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    it("fails on collinear points instead of returning garbage", () => {
        // Ten patch centres along one line of the target.
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
            const x = 13.7 + i * 61.3;
            pts.push(x, 0.37 * x + 21.9);
        }
        const src = Float64Array.from(pts);
        expect(robustHomography(src, projectAll(H_TRUE, src), H_TRUE, OPTIONS)).toEqual(SINGULAR);
    });

    it("fails on a singular normal system: six correspondences at three distinct points", () => {
        const three = [100, 100, 500, 120, 300, 400];
        const src = Float64Array.from([...three, ...three]);
        expect(robustHomography(src, projectAll(H_TRUE, src), H_TRUE, OPTIONS)).toEqual(SINGULAR);
    });

    it("fails on four points with three collinear, exact or not", () => {
        const src = Float64Array.from([100, 100, 300, 200, 500, 300, 150, 400]);
        const dst = projectAll(H_TRUE, src);
        // Exact: a one-parameter family of H fits, so the normal system is singular.
        expect(robustHomography(src, dst, H_TRUE, OPTIONS)).toEqual(SINGULAR);
        // One of the three moved 0.5 px off its line: no homography keeps
        // three collinear points off a line, so the DLT's only exact solution
        // is the rank-1 matrix that sends those three to 0. The normal system
        // is regular; the fit is what is singular.
        const off = dst.slice();
        off[3] += 0.5;
        expect(robustHomography(src, off, H_TRUE, OPTIONS)).toEqual(SINGULAR);
    });

    it("counts a set within a thousandth of a pixel of a line as singular, not one within a tenth", () => {
        // Pins the normal system's threshold rather than only exact
        // degeneracy, which any pivot test catches. Eight points along a line,
        // each moved off it by ±band/2 at most: the smallest Cholesky pivot
        // ratio measures 3.2e-6 · band² (band in px); the factorisation stops
        // at the first pivot below the threshold, which can be a larger one.
        const alongALine = (band: number): PointArray => {
            const off = [0.5, -0.5, 0.3, -0.2, 0.4, -0.4, 0.1, -0.3];
            const pts: number[] = [];
            for (let i = 0; i < 8; i++)
                pts.push(20 + 85 * i, 0.6 * (20 + 85 * i) + 40 + band * off[i]);
            return Float64Array.from(pts);
        };
        const thin = alongALine(0.001); // smallest pivot ratio 3.2e-12, first failing 8.7e-12
        expect(robustHomography(thin, projectAll(H_TRUE, thin), H_TRUE, OPTIONS)).toEqual(SINGULAR);
        const narrow = alongALine(0.1); // smallest pivot ratio 3.2e-8
        const r = robustHomography(narrow, projectAll(H_TRUE, narrow), H_TRUE, OPTIONS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // A condition number near 1/3.2e-8 lets rounding move a point by
        // ~3e7 · 2.2e-16 · 300 px ≈ 2e-6 px at worst.
        expect(maxTransferGap(r.H, H_TRUE, narrow)).toBeLessThan(1e-4);
    });

    it("fails on a fit that maps the target onto a line", () => {
        // Eight correspondences in general position on the target, all landing
        // on the line v = u/2 + 10: an edge-on view, fitted only by a rank-2 H.
        // A tukeyC wider than the frame gives every one of them weight.
        const src = Float64Array.from([
            50, 60, 400, 70, 600, 450, 120, 380, 330, 250, 560, 120, 80, 200, 250, 420,
        ]);
        const dst = src.map((v, i) => (i % 2 === 0 ? v : 0.5 * src[i - 1] + 10));
        expect(robustHomography(src, dst, H_TRUE, { ...OPTIONS, tukeyC: 1000 })).toEqual(SINGULAR);
    });

    it("fails on coincident points", () => {
        const src = Float64Array.from([320, 240, 320, 240, 320, 240, 320, 240, 320, 240]);
        expect(robustHomography(src, projectAll(H_TRUE, src), H_TRUE, OPTIONS)).toEqual(SINGULAR);
        // Or the whole target sent to a single frame point.
        const grid = targetGrid();
        const onePoint = grid.map((_, i) => (i % 2 === 0 ? 320 : 240));
        expect(robustHomography(grid, onePoint, H_TRUE, { ...OPTIONS, tukeyC: 1000 })).toEqual(
            SINGULAR,
        );
    });

    it("fails when fewer than four correspondences start inside tukeyC", () => {
        const src = targetGrid();
        const dst = projectAll(H_TRUE, src);
        // A prediction 50 px off leaves every correspondence outside 4 px.
        expect(robustHomography(src, dst, chain(translation(50, 0), H_TRUE), OPTIONS)).toEqual(
            TOO_FEW_INLIERS,
        );
        // Three correspondences exact, the other 37 ≈ 14 px off.
        const three = dst.map((v, i) => (i < 6 ? v : v + 10));
        expect(robustHomography(src, three, H_TRUE, OPTIONS)).toEqual(TOO_FEW_INLIERS);
        // A prediction that sends every point nowhere at all: 0 / 0 residuals,
        // weight 0 each.
        expect(robustHomography(src, dst, new Float64Array(9), OPTIONS)).toEqual(TOO_FEW_INLIERS);
    });

    it("fails when a fit leaves fewer than four inliers", () => {
        // Three heavy correspondences in a 20 px triangle, each 1 px off the
        // prediction in a rotational pattern about the triangle's centroid
        // (weight 0.88), and two light ones 500 px away, 3.99 px off (weight
        // 2.5e-5). The first fit follows the triangle's local roll; carried
        // 500 px, that roll leaves both far points beyond tukeyC.
        const src = Float64Array.from([100, 100, 120, 100, 100, 120, 600, 400, 600, 100]);
        const dst = src.slice();
        const c = 320 / 3;
        for (let i = 0; i < 3; i++) {
            const dx = src[2 * i] - c;
            const dy = src[2 * i + 1] - c;
            const r = Math.hypot(dx, dy);
            dst[2 * i] -= dy / r;
            dst[2 * i + 1] += dx / r;
        }
        dst[6] += 3.99;
        dst[8] += 3.99;
        expect(robustHomography(src, dst, IDENTITY, OPTIONS)).toEqual(TOO_FEW_INLIERS);
    });
});

describe("robustHomography with noise", () => {
    it("keeps the error at the patches within σ under σ = 0.5 px of Gaussian noise", () => {
        // 40 correspondences, 2 × 40 noisy coordinates, 8 parameters. The
        // maximum-likelihood estimate's error at the patches has an RMS of
        // σ·√(8/n) ≈ 0.45σ, and exceeds σ with probability P(χ²₈ > 40) ≈ 1e-5;
        // the weighted DLT is close to it when every weight is near 1, as
        // here (tukeyC = 8σ). A residual passes tukeyC with probability e⁻³².
        const sigma = 0.5;
        const src = targetGrid();
        const exact = projectAll(H_TRUE, src);
        const prediction = chain(translation(2, 0), H_TRUE);
        for (let seed = 1; seed <= 20; seed++) {
            const noise = gaussian(seed);
            const dst = exact.map((v) => v + sigma * noise());
            const r = robustHomography(src, dst, prediction, OPTIONS);
            expect(r.ok, `seed ${seed}`).toBe(true);
            if (!r.ok) continue;
            expect(r.converged, `seed ${seed}`).toBe(true);
            expect(r.numInliers, `seed ${seed}`).toBe(40);
            expectSelfConsistent(r, src, dst, OPTIONS.tukeyC);
            let sq = 0;
            for (let i = 0; i < src.length; i += 2) {
                const [ax, ay] = project(r.H, src[i], src[i + 1]);
                sq += (ax - exact[i]) ** 2 + (ay - exact[i + 1]) ** 2;
            }
            expect(Math.sqrt(sq / 40), `seed ${seed}`).toBeLessThan(sigma);
            // The residuals themselves: E Σ r² = (2n − 8)σ², so the RMS is
            // near σ·√(2 − 8/n) ≈ 0.67 px, within ±8% (1 sd).
            const expected = sigma * Math.sqrt(2 - 8 / 40);
            expect(r.rmsError, `seed ${seed}`).toBeGreaterThan(0.5 * expected);
            expect(r.rmsError, `seed ${seed}`).toBeLessThan(1.5 * expected);
        }
    });
});

describe("robustHomography at extreme magnitudes", () => {
    it("weighs a residual of 1e200 px as types.ts states when tukeyC is larger still", () => {
        // Squaring a residual above ~1.3e154 px overflows a double; the
        // residual itself does not. 1e200 px from the prediction, with
        // tukeyC = 1e201, every correspondence weighs (1 − 0.1²)² ≈ 0.98, not 0.
        const src = targetGrid();
        const dst = projectAll(H_TRUE, src);
        const farOff = chain(translation(1e200, 0), H_TRUE);
        const r = robustHomography(src, dst, farOff, { ...OPTIONS, tukeyC: 1e201 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.numInliers).toBe(40);
        expect(maxTransferGap(r.H, H_TRUE, src)).toBeLessThan(EXACT_PX);
    });

    it("gives the same result, to the bit, in units 2^530 times larger", () => {
        // A change of units by a power of two rounds nothing, so every output
        // must be the unscaled one rescaled exactly — while residuals of a few
        // units, squared, overflow past 2^512. The view is affine: with
        // perspective, a translation × K beside a perspective term ÷ K would
        // span more exponents than a prediction at unit max-norm can hold.
        const K = 2 ** 530;
        const affine: Mat3 = chain(
            translation(70, 35),
            rotationAbout(0.1, 320, 240),
            scaling(0.85),
        );
        const src = targetGrid();
        const noise = gaussian(3);
        const dst = projectAll(affine, src).map((v) => v + 0.5 * noise());
        const prediction = chain(translation(2, 0), affine);
        const base = robustHomography(src, dst, prediction, OPTIONS);
        const toUnits = scaling(K);
        const fromUnits = scaling(1 / K);
        const scaled = robustHomography(
            src.map((v) => v * K),
            dst.map((v) => v * K),
            chain(toUnits, prediction, fromUnits),
            {
                maxIterations: OPTIONS.maxIterations,
                tukeyC: OPTIONS.tukeyC * K,
                epsilon: OPTIONS.epsilon * K,
            },
        );
        expect(base.ok).toBe(true);
        expect(scaled.ok).toBe(true);
        if (!base.ok || !scaled.ok) return;
        // toEqual and toBe compare numbers with Object.is: bit for bit.
        expect(Array.from(scaled.weights)).toEqual(Array.from(base.weights));
        expect([scaled.numInliers, scaled.iterations, scaled.converged]).toEqual([
            base.numInliers,
            base.iterations,
            base.converged,
        ]);
        expect(scaled.rmsError).toBe(base.rmsError * K);
        expect(Array.from(scaled.H)).toEqual(Array.from(chain(toUnits, base.H, fromUnits)));
    });
});

describe("robustHomography outlier rejection", () => {
    // The model, and what it measured before this test was written: 40
    // patches with σ = 0.25 px on every coordinate (a converged sub-pixel
    // alignment), a prediction 3 px off, tukeyC = 4 px, and outliers moved
    // 5–16 px from their true position in a random direction — a patch
    // aligned on the wrong structure, within the alignment's reach. The
    // prediction error is what makes this a test of the reweighting: about 3%
    // of the outliers start inside tukeyC, some nearer the prediction than
    // the inliers (which start 3 px off, at weight 0.19).
    //
    // Over 2000 seeds per fraction, every outlier ended at weight 0 and every
    // inlier above it at every fraction up to 45%. Failures begin at 50% (1 in
    // 2000), then 55%: 2, 60%: 11, 65%: 12, 70%: 48, 75%: 115, 80%: 334. A
    // single fit without reweighting fails 60 in 2000 already at 20%, and 196
    // at 45%.
    //
    // With a prediction 2 px off and σ = 0.5 px, outliers 6–16 px away can
    // never start inside tukeyC (6 − 2 = 4): the fixed cutoff rejects them
    // alone, and every seed passes up to 50%. That model measures the cutoff,
    // not the estimator, so it is not the one tested.
    const SIGMA = 0.25;
    const OUTLIERS = 18; // of 40: 45%

    it("rejects every outlier at 45% contamination, and fits the inliers alone", () => {
        const src = targetGrid();
        const exact = projectAll(H_TRUE, src);
        const prediction = chain(translation(3, 0), H_TRUE);
        const n = src.length / 2;
        for (let seed = 1; seed <= 2000; seed++) {
            const { dst, isOutlier } = contaminate(H_TRUE, src, {
                seed,
                outliers: OUTLIERS,
                sigma: SIGMA,
                minPx: 5,
                maxPx: 16,
            });
            const r = robustHomography(src, dst, prediction, OPTIONS);
            expect(r.ok, `seed ${seed}`).toBe(true);
            if (!r.ok) continue;
            let separated = true;
            let sq = 0;
            for (let i = 0; i < n; i++) {
                if (isOutlier[i] ? r.weights[i] !== 0 : !(r.weights[i] > 0)) separated = false;
                if (isOutlier[i]) continue;
                const [x, y] = project(r.H, src[2 * i], src[2 * i + 1]);
                sq += (x - exact[2 * i]) ** 2 + (y - exact[2 * i + 1]) ** 2;
            }
            expect(separated, `seed ${seed}`).toBe(true);
            expect(r.numInliers, `seed ${seed}`).toBe(n - OUTLIERS);
            // Separated exactly, the fit is the least-squares fit of the 22
            // inliers: an error RMS at them near σ·√(8/22) ≈ 0.15 px, above
            // 2σ with probability P(χ²₈ > 88) ≈ 1e-15.
            expect(Math.sqrt(sq / (n - OUTLIERS)), `seed ${seed}`).toBeLessThan(2 * SIGMA);
        }
    });
});

describe("robustHomography purity", () => {
    it("gives a bit-identical result on a repeat call and leaves every input untouched", () => {
        // types.ts rule 2: no RNG, no clock, no global state. A full run —
        // noise, outliers, several reweightings — so every array is exercised.
        const src = targetGrid();
        const { dst } = contaminate(H_TRUE, src, {
            seed: 7,
            outliers: 10,
            sigma: 0.25,
            minPx: 5,
            maxPx: 16,
        });
        const prediction = chain(translation(3, 0), H_TRUE);
        const before = [Array.from(src), Array.from(dst), Array.from(prediction)];
        const first = robustHomography(src, dst, prediction, OPTIONS);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const snapshot = [
            Array.from(first.H),
            Array.from(first.weights),
            first.numInliers,
            first.rmsError,
            first.iterations,
            first.converged,
        ];
        expect(first.iterations).toBeGreaterThan(1);
        // Scribble over the first result: the second must share no array with it.
        first.H.fill(Number.NaN);
        first.weights.fill(Number.NaN);
        const second = robustHomography(src, dst, prediction, OPTIONS);
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        // toEqual compares numbers with Object.is: bit for bit, sign of zero included.
        expect([
            Array.from(second.H),
            Array.from(second.weights),
            second.numInliers,
            second.rmsError,
            second.iterations,
            second.converged,
        ]).toEqual(snapshot);
        expect(second.H).not.toBe(prediction);
        expect([Array.from(src), Array.from(dst), Array.from(prediction)]).toEqual(before);
    });
});
