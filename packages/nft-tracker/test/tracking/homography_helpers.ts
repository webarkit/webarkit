/*
 *  homography_helpers.ts
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

// Test-side 3×3 algebra for the homography tests. Deliberately written apart
// from src/: a test that checked the implementation with the implementation's
// own helpers would agree with itself whatever they computed.

import type { Mat3, PointArray } from "@webarkit/cv-backend-spec";
import { mulberry32 } from "../fixtures/seeded_rng.js";

/** Row-major product `a · b`. */
export function mul(a: Mat3, b: Mat3): Mat3 {
    const out = new Float64Array(9);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
        }
    }
    return out;
}

/** Product of any number of matrices, left to right. */
export function chain(...ms: Mat3[]): Mat3 {
    return ms.reduce((acc, m) => mul(acc, m));
}

export function translation(tx: number, ty: number): Mat3 {
    return Float64Array.from([1, 0, tx, 0, 1, ty, 0, 0, 1]);
}

export function scaling(s: number): Mat3 {
    return Float64Array.from([s, 0, 0, 0, s, 0, 0, 0, 1]);
}

/** Rotation by `theta` radians about the point `(cx, cy)`. */
export function rotationAbout(theta: number, cx: number, cy: number): Mat3 {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const r = Float64Array.from([c, -s, 0, s, c, 0, 0, 0, 1]);
    return chain(translation(cx, cy), r, translation(-cx, -cy));
}

/** A pure perspective term: `w = g·x + h·y + 1`. */
export function perspective(g: number, h: number): Mat3 {
    return Float64Array.from([1, 0, 0, 0, 1, 0, g, h, 1]);
}

/** `π(H · (x, y, 1))`, the perspective division included. */
export function project(H: Mat3, x: number, y: number): [number, number] {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** Every point of `pts` mapped through `H`, as a new interleaved array. */
export function projectAll(H: Mat3, pts: PointArray): PointArray {
    const out = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
        const [u, v] = project(H, pts[i], pts[i + 1]);
        out[i] = u;
        out[i + 1] = v;
    }
    return out;
}

/** The four corner pixel centres of a `w × h` image, interleaved. */
export function corners(w: number, h: number): PointArray {
    return Float64Array.from([0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1]);
}

/**
 * The largest distance, in px, between where `A` and `B` send the same
 * point of `pts`. Comparing homographies by what they do to points avoids
 * comparing entries whose magnitudes differ by seven orders (a translation in
 * the hundreds, a perspective term near 1e-4).
 */
export function maxTransferGap(A: Mat3, B: Mat3, pts: PointArray): number {
    let worst = 0;
    for (let i = 0; i < pts.length; i += 2) {
        const [ax, ay] = project(A, pts[i], pts[i + 1]);
        const [bx, by] = project(B, pts[i], pts[i + 1]);
        worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
    }
    return worst;
}

/**
 * A seeded standard-normal generator (Box–Muller over mulberry32). Seeded so
 * every run of a noise test sees the same noise.
 */
export function gaussian(seed: number): () => number {
    const uniform = mulberry32(seed);
    let spare: number | null = null;
    return () => {
        if (spare !== null) {
            const s = spare;
            spare = null;
            return s;
        }
        // 1 - u keeps the logarithm's argument in (0, 1].
        const radius = Math.sqrt(-2 * Math.log(1 - uniform()));
        const angle = 2 * Math.PI * uniform();
        spare = radius * Math.sin(angle);
        return radius * Math.cos(angle);
    };
}
