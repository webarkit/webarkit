/*
 *  closed_form.ts
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
 * The closed-form planar pose from a homography: the tracker-local copy of
 * the oracle's algorithm, jsfeatNext 0.17.0's `pose_estimator.estimate`, which
 * `cv-backend-jsfeatnext`'s `poseFromHomography` wraps.
 *
 * It is the fallback of {@link selectPose} on a frame whose two IPPE
 * candidates cannot be told apart (#105's selection rule, point (c)): the
 * control's pose, computed here rather than asked of the backend, because
 * M4's round-1 invariant is that a tracker arm makes no `poseFromHomography`
 * call at all (the frozen page times that call as the `pose` stage, and a
 * non-zero sample there means the treatment was not applied; #132). The copy
 * is tested equal to the oracle, criterion C8 of
 * `docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md`.
 *
 * The algorithm, step for step: `B = K⁻¹ · H`; the sign of `B` fixed so that
 * `B[2][2] ≥ 0`; the first two columns normalised, then orthonormalised
 * symmetrically (their bisector and the perpendicular to it in their plane,
 * turned ±45°); the third column of `R` their cross product; `t` the third
 * column of `B` scaled by `2 / (‖b1‖ + ‖b2‖)`. `K⁻¹` is the analytic inverse
 * of a zero-skew pinhole `K`, as the oracle computes it: `K[0][1]` is not
 * read. Not a port of anything else, and not an alternative to IPPE: it
 * exists to be equal to the oracle.
 */

import type { Mat3, Pose } from "@webarkit/cv-backend-spec";

/** Fewer than this in a column's norm is the oracle's degeneracy. */
const EPS = 1e-12;

function normalize(v: [number, number, number]): [number, number, number] {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * The oracle's pose for `H` and `K`. On a degenerate input (`good: false`) the
 * oracle leaves its output untouched; this returns the identity rotation and a
 * zero translation, so that the result is a function of its arguments.
 */
export function closedFormPose(H: Mat3, K: Mat3): Pose {
    const fx = K[0];
    const cx = K[2];
    const fy = K[4];
    const cy = K[5];
    // K⁻¹, zero skew, as `pose_estimator.invertIntrinsics`.
    const Kinv = [1 / fx, 0, -cx / fx, 0, 1 / fy, -cy / fy, 0, 0, 1];
    const B = new Float64Array(9);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            B[r * 3 + c] =
                Kinv[r * 3] * H[c] + Kinv[r * 3 + 1] * H[3 + c] + Kinv[r * 3 + 2] * H[6 + c];
        }
    }
    const s: [number, number, number] = [B[0], B[3], B[6]];
    const c: [number, number, number] = [B[1], B[4], B[7]];
    const l: [number, number, number] = [B[2], B[5], B[8]];
    const u = Math.hypot(s[0], s[1], s[2]);
    const d = Math.hypot(c[0], c[1], c[2]);
    if (!(u >= EPS && d >= EPS)) {
        return {
            R: Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
            t: new Float64Array(3),
            good: false,
        };
    }
    const f = 2 / (u + d);
    const p = l[2] >= 0 ? 1 : -1;
    const m: [number, number, number] = [(p * s[0]) / u, (p * s[1]) / u, (p * s[2]) / u];
    const h: [number, number, number] = [(p * c[0]) / d, (p * c[1]) / d, (p * c[2]) / d];
    const g = [p * l[0] * f, p * l[1] * f, p * l[2] * f];
    const bisector = normalize([m[0] + h[0], m[1] + h[1], m[2] + h[2]]);
    const normal = cross(m, h);
    const perpendicular = normalize(cross(bisector, normal));
    const b = Math.SQRT1_2;
    const x = [
        (bisector[0] + perpendicular[0]) * b,
        (bisector[1] + perpendicular[1]) * b,
        (bisector[2] + perpendicular[2]) * b,
    ] as [number, number, number];
    const y = [
        (bisector[0] - perpendicular[0]) * b,
        (bisector[1] - perpendicular[1]) * b,
        (bisector[2] - perpendicular[2]) * b,
    ] as [number, number, number];
    const z = cross(x, y);
    return {
        R: Float64Array.from([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]),
        t: Float64Array.from(g),
        good: true,
    };
}
