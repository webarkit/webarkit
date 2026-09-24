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
