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
    corners,
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
