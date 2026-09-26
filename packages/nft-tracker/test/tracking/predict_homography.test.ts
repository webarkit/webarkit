/*
 *  predict_homography.test.ts
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
import type { Mat3 } from "@webarkit/cv-backend-spec";
import { predictHomography } from "../../src/index.js";
import {
    chain,
    corners,
    maxTransferGap,
    mul,
    perspective,
    planeView,
    rotationAbout,
    scaling,
    translation,
} from "./homography_helpers.js";

// A 640×480 target seen in a 640×480 frame, with some perspective:
// w = g·x + h·y + 1 stays in [0.9, 1.1] over the target.
const TARGET_CORNERS = corners(640, 480);
const H0: Mat3 = chain(translation(60, 40), scaling(0.8), perspective(1.5e-4, -2e-4));

// Frame-to-frame motion: a 0.03 rad roll about the frame centre, a 1% zoom,
// a few pixels of pan and a small change of perspective.
const V: Mat3 = chain(
    rotationAbout(0.03, 320, 240),
    translation(4, -2.5),
    scaling(1.01),
    perspective(1e-5, 5e-6),
);

// Transfer error allowed between a prediction and the exact next pose. The
// arithmetic is three 3×3 products and an adjugate; with a pixel-coordinate
// H (translation ~1e2, perspective ~1e-4) its condition number is ~1e5, so
// rounding moves a corner by ~1e5 · 2.2e-16 · 640 px ≈ 1e-8 px at worst.
const EXACT_PX = 1e-6;

describe("predictHomography", () => {
    it("predicts current itself when there is no velocity yet (previous = null)", () => {
        // The first frame after a lock has one pose and no motion: zero velocity.
        // current[8] = 2, so the rescale to H[8] = 1 is an exact halving and the
        // comparison can be bit for bit.
        const current: Mat3 = Float64Array.from([2, 0.25, 40, -0.5, 1.5, 60, 0.001, 0.002, 2]);
        const before = Array.from(current);
        const r = predictHomography(null, current);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Array.from(r.H)).toEqual(before.map((v) => v / 2));
        expect(r.H[8]).toBe(1);
        expect(r.H).not.toBe(current);
        expect(Array.from(current)).toEqual(before);
    });

    it("applies the last frame-to-frame motion once more: Hₜ = Vᵗ·H₀ is predicted exactly", () => {
        const H1 = mul(V, H0);
        const H2 = mul(V, H1);
        const H3 = mul(V, H2);
        const before = [Array.from(H1), Array.from(H2)];
        const r = predictHomography(H1, H2);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.H[8]).toBe(1);
        expect(maxTransferGap(r.H, H3, TARGET_CORNERS)).toBeLessThan(EXACT_PX);
        expect([Array.from(H1), Array.from(H2)]).toEqual(before);
    });

    it("does not depend on the scale of either input, however large or small", () => {
        // λH is the same homography as H (types.ts accepts any scale with
        // H[8] ≠ 0), so the prediction must not move with λ. The extreme
        // pairs would overflow or underflow a triple product taken as given.
        const H1 = mul(V, H0);
        const H2 = mul(V, H1);
        const reference = predictHomography(H1, H2);
        expect(reference.ok).toBe(true);
        if (!reference.ok) return;
        const scales: [number, number][] = [
            [-3.7, 1],
            [1, -0.02],
            [1e3, 1e-3],
            [1e200, 1],
            [1, 1e-200],
            [-1e-200, 1e200],
        ];
        for (const [a, b] of scales) {
            const r = predictHomography(
                H1.map((v) => v * a),
                H2.map((v) => v * b),
            );
            expect(r.ok, `scales ${a}, ${b}`).toBe(true);
            if (!r.ok) continue;
            expect(r.H[8], `scales ${a}, ${b}`).toBe(1);
            expect(
                maxTransferGap(r.H, reference.H, TARGET_CORNERS),
                `scales ${a}, ${b}`,
            ).toBeLessThan(EXACT_PX);
        }
    });
});

describe("predictHomography purity", () => {
    it("gives a bit-identical result on a repeat call and shares no array with it", () => {
        const H1 = mul(V, H0);
        const H2 = mul(V, H1);
        const first = predictHomography(H1, H2);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const snapshot = Array.from(first.H);
        expect(first.H).not.toBe(H2);
        first.H.fill(Number.NaN);
        const second = predictHomography(H1, H2);
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        // toEqual compares numbers with Object.is: bit for bit.
        expect(Array.from(second.H)).toEqual(snapshot);
    });
});

describe("predictHomography failures", () => {
    const H1 = mul(V, H0);
    const H2 = mul(V, H1);
    const IDENTITY: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // Rank 2 with entries that are not small integers, so the determinant is
    // rounding noise rather than an exact 0: a·bᵀ + c·dᵀ.
    const RANK_2: Mat3 = (() => {
        const [a, b, c, d] = [
            [0.3, -1.7, 2.9],
            [1.1, 0.13, -0.7],
            [-2.3, 0.37, 1.9],
            [0.71, 1.3, 0.17],
        ];
        const m = new Float64Array(9);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) m[i * 3 + j] = a[i] * b[j] + c[i] * d[j];
        }
        return m;
    })();
    const SINGULAR = { ok: false, reason: "singular" };
    const NON_FINITE = { ok: false, reason: "non-finite" };

    it("reports a non-finite entry in either input as non-finite", () => {
        for (const bad of [Number.NaN, Infinity, -Infinity]) {
            for (let i = 0; i < 9; i++) {
                const p = H1.slice();
                p[i] = bad;
                const c = H2.slice();
                c[i] = bad;
                expect(predictHomography(p, H2), `previous[${i}] = ${bad}`).toEqual(NON_FINITE);
                expect(predictHomography(H1, c), `current[${i}] = ${bad}`).toEqual(NON_FINITE);
                expect(predictHomography(null, c), `current[${i}] = ${bad}`).toEqual(NON_FINITE);
            }
        }
    });

    it("reports an input that is not nine numbers as non-finite", () => {
        // Mat3 is "row-major 3x3, length 9"; the union has no other name for
        // a matrix that is not nine finite numbers.
        const long = Float64Array.from([...H2, 1]);
        expect(predictHomography(null, H2.slice(0, 8))).toEqual(NON_FINITE);
        expect(predictHomography(H1, long)).toEqual(NON_FINITE);
        expect(predictHomography(H1.slice(0, 8), H2)).toEqual(NON_FINITE);
    });

    it("reports a previous that is not invertible as singular", () => {
        expect(predictHomography(RANK_2, H2)).toEqual(SINGULAR);
        expect(predictHomography(new Float64Array(9), H2)).toEqual(SINGULAR);
    });

    it("does not count a steep but valid view as singular", () => {
        // The other side of SINGULAR_RELATIVE_DET (1e-10): a target tilted 88°
        // then 89°, turned 60°, measures relative determinants of 3.2e-2 and
        // 1.6e-2, and the prediction 8.2e-3 — a threshold anywhere near them
        // would reject real views, not only singular matrices.
        const r = predictHomography(planeView(88, 60, 1000), planeView(89, 60, 1000));
        expect(r.ok).toBe(true);
    });

    it("reports a prediction that is not invertible, from a singular current, as singular", () => {
        expect(predictHomography(null, RANK_2)).toEqual(SINGULAR);
        expect(predictHomography(H1, RANK_2)).toEqual(SINGULAR);
        expect(predictHomography(null, new Float64Array(9))).toEqual(SINGULAR);
    });

    it("reports a prediction whose H[8] is 0 as singular: it cannot be scaled to H[8] = 1", () => {
        // C sends the target origin to (−1, 0); C·C sends it to infinity, so
        // (C·C)[8] = 0 although C·C is invertible (det 4).
        const C: Mat3 = Float64Array.from([1, 0, -1, 0, 1, 0, 1, 0, 1]);
        expect(predictHomography(IDENTITY, C)).toEqual(SINGULAR);
        // With no velocity, current itself is the prediction.
        const originAtInfinity: Mat3 = Float64Array.from([0, 0, 1, 0, 1, 0, 1, 0, 0]);
        expect(predictHomography(null, originAtInfinity)).toEqual(SINGULAR);
    });

    it("reports a prediction beyond the float range as non-finite", () => {
        // A zoom by 1e155 per frame, applied once more, is a zoom by 1e310.
        const zoom: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1e-155]);
        expect(predictHomography(IDENTITY, zoom)).toEqual(NON_FINITE);
        const beyond: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1e-310]);
        expect(predictHomography(null, beyond)).toEqual(NON_FINITE);
    });
});
