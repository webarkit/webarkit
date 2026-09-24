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
});
