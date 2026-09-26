/*
 *  mat3.test.ts
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
// Internal module, not exported from the package index: its doc comments make
// promises the two homography functions rely on, so they are pinned here.
import { isInvertible, relativeDeterminant, scaledToUnitMax } from "../../src/tracking/mat3.js";
import { planeView } from "./homography_helpers.js";

const ZERO: Mat3 = new Float64Array(9);

describe("relativeDeterminant", () => {
    it("is 0, not NaN, when all six products vanish", () => {
        const zeroRow: Mat3 = Float64Array.from([1, 2, 3, 0, 0, 0, 4, 5, 6]);
        const zeroColumn: Mat3 = Float64Array.from([0, 2, 3, 0, 5, 6, 0, 8, 9]);
        expect(relativeDeterminant(ZERO)).toBe(0);
        expect(relativeDeterminant(zeroRow)).toBe(0);
        expect(relativeDeterminant(zeroColumn)).toBe(0);
    });

    it("is 1 for a rotation and in [0, 1] for a view", () => {
        const t = 0.7;
        const rotation: Mat3 = Float64Array.from([
            Math.cos(t),
            -Math.sin(t),
            0,
            Math.sin(t),
            Math.cos(t),
            0,
            0,
            0,
            1,
        ]);
        expect(relativeDeterminant(rotation)).toBeCloseTo(1, 15);
        const view = relativeDeterminant(planeView(60, 15, 1000));
        expect(view).toBeGreaterThan(0);
        expect(view).toBeLessThanOrEqual(1);
    });

    it("does not change when a row, a column or the whole matrix is rescaled", () => {
        // Each of the six products takes one entry from every row and column,
        // so a rescale multiplies all of them, and the determinant, alike. The
        // comparison is to rounding: 1e-12 is ~5000 ulps of a ratio near 1.
        const H = planeView(60, 15, 1000);
        const reference = relativeDeterminant(H);
        const rows = H.slice();
        for (let j = 0; j < 3; j++) rows[3 + j] *= 1e3; // second row
        const columns = H.slice();
        for (let i = 0; i < 3; i++) columns[i * 3 + 2] *= -0.5; // third column
        expect(relativeDeterminant(rows)).toBeCloseTo(reference, 12);
        expect(relativeDeterminant(columns)).toBeCloseTo(reference, 12);
        expect(relativeDeterminant(H.map((v) => v * -7.3))).toBeCloseTo(reference, 12);
    });
});

describe("scaledToUnitMax", () => {
    it("puts the largest magnitude at 1 and keeps the zero matrix at zero, not NaN", () => {
        const m = scaledToUnitMax(Float64Array.from([2, -8, 0.5, 0, 4, 1, 0, 0, 2]));
        expect(Array.from(m)).toEqual([0.25, -1, 0.0625, 0, 0.5, 0.125, 0, 0, 0.25]);
        expect(Array.from(scaledToUnitMax(ZERO))).toEqual(Array.from(ZERO));
    });
});

describe("isInvertible", () => {
    it("accepts the identity and a steep view, and rejects the zero matrix", () => {
        expect(isInvertible(Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]))).toBe(true);
        expect(isInvertible(planeView(89, 60, 1000))).toBe(true);
        expect(isInvertible(ZERO)).toBe(false);
    });
});
