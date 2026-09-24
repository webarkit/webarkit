/*
 *  mat3.ts
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

/**
 * Row-major 3×3 helpers for the homography functions of branch C. Internal:
 * not exported from the package index.
 */

import type { Mat3 } from "@webarkit/cv-backend-spec";

/** `a · b`, as a new array. */
export function mul3(a: Mat3, b: Mat3): Mat3 {
    const out = new Float64Array(9);
    for (let r = 0; r < 3; r++) {
        const a0 = a[r * 3];
        const a1 = a[r * 3 + 1];
        const a2 = a[r * 3 + 2];
        out[r * 3] = a0 * b[0] + a1 * b[3] + a2 * b[6];
        out[r * 3 + 1] = a0 * b[1] + a1 * b[4] + a2 * b[7];
        out[r * 3 + 2] = a0 * b[2] + a1 * b[5] + a2 * b[8];
    }
    return out;
}

/**
 * A homography whose {@link relativeDeterminant} is at or below this is
 * treated as singular, by both homography functions.
 *
 * Measured, not assumed. Matrices that are singular in exact arithmetic —
 * rank 2 and rank 1, with float entries spanning six orders of magnitude,
 * 10⁵ samples — measure at most 3.5e-16: rounding. Views of a 640×480
 * target through an 800 px camera, tilted 0–89° and turned ±60°, measure at
 * least 1.2e-2, and ordinary views 0.3–1. The threshold sits 5½ orders above
 * the first and 8 below the second.
 */
export const SINGULAR_RELATIVE_DET = 1e-10;

/**
 * `|det m|` divided by the sum of the magnitudes of the six products it is
 * made of: in `[0, 1]`, and 0 exactly when `m` is singular.
 *
 * Why not `det` against a norm of `m`: a pixel-coordinate homography mixes
 * entries near 1 (rotation, scale), in the hundreds (translation) and near
 * 1e-4 (perspective), so `|det| / ‖m‖³` is ~1e-9 for a plain translation by
 * 1000 px. Each of the six products takes one entry from every row and every
 * column, so this ratio is unchanged by rescaling any row or column — by
 * pixel units, in other words — as well as by the homogeneous scale.
 */
export function relativeDeterminant(m: Mat3): number {
    const [a, b, c, d, e, f, g, h, i] = m;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    const size =
        Math.abs(a) * (Math.abs(e * i) + Math.abs(f * h)) +
        Math.abs(b) * (Math.abs(d * i) + Math.abs(f * g)) +
        Math.abs(c) * (Math.abs(d * h) + Math.abs(e * g));
    return Math.abs(det) / size;
}

/**
 * Whether `m` counts as an invertible homography: its relative determinant,
 * taken at unit max-norm so that the products cannot overflow or underflow,
 * is above {@link SINGULAR_RELATIVE_DET}. The zero matrix gives `0 / 0`,
 * which the comparison also rejects.
 */
export function isInvertible(m: Mat3): boolean {
    return relativeDeterminant(scaledToUnitMax(m)) > SINGULAR_RELATIVE_DET;
}

/** Whether `m` is nine finite numbers — the length included, which a type cannot pin. */
export function isFiniteMat3(m: Mat3): boolean {
    if (m.length !== 9) return false;
    for (let i = 0; i < 9; i++) if (!Number.isFinite(m[i])) return false;
    return true;
}

/**
 * `m` divided by its entry of largest magnitude, as a new array: the same
 * homography, with every entry in `[−1, 1]`. Taken before a product so that a
 * homography handed over at an extreme scale cannot overflow or underflow it.
 */
export function scaledToUnitMax(m: Mat3): Mat3 {
    let max = 0;
    for (let i = 0; i < 9; i++) max = Math.max(max, Math.abs(m[i]));
    const out = new Float64Array(9);
    for (let i = 0; i < 9; i++) out[i] = m[i] / max;
    return out;
}

/** `m` rescaled so that `m[8] = 1`, as a new array — how a homography is returned. */
export function scaledToUnitCorner(m: Mat3): Mat3 {
    const out = new Float64Array(9);
    for (let i = 0; i < 9; i++) out[i] = m[i] / m[8];
    return out;
}

/**
 * The adjugate, `det(m) · m⁻¹`, as a new array. For a homography it stands in
 * for the inverse: the two differ by a scalar, and a homography is defined
 * only up to one — without the division that makes `m⁻¹` blow up as `m`
 * nears singular.
 */
export function adjugate3(m: Mat3): Mat3 {
    const [a, b, c, d, e, f, g, h, i] = m;
    return Float64Array.from([
        e * i - f * h,
        c * h - b * i,
        b * f - c * e,
        f * g - d * i,
        a * i - c * g,
        c * d - a * f,
        d * h - e * g,
        b * g - a * h,
        a * e - b * d,
    ]);
}
