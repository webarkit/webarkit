/*
 *  pose_metric.ts
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

// The metric and the sets of #105's acceptance criteria
// (docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md, §2 to §4), written
// apart from src/ on purpose: a test that measured the implementation with
// the implementation's own projection would agree with it whatever it did.

import type { Mat3, Pose, Vec3 } from "@webarkit/cv-backend-spec";
import { mul } from "../tracking/homography_helpers.js";

/** The 5 × 5 grid `G` over `[0, w − 1] × [0, h − 1]`, as `[x0, y0, x1, y1, …]`. */
export function grid(width: number, height: number): Float64Array {
    const out = new Float64Array(50);
    let k = 0;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            out[k++] = ((width - 1) * j) / 4;
            out[k++] = ((height - 1) * i) / 4;
        }
    }
    return out;
}

/** `π(K · (R · (x, y, 0) + t))`, frame px. */
export function projectPose(K: Mat3, R: Mat3, t: Vec3, x: number, y: number): [number, number] {
    const X = R[0] * x + R[1] * y + t[0];
    const Y = R[3] * x + R[4] * y + t[1];
    const Z = R[6] * x + R[7] * y + t[2];
    const u = K[0] * X + K[1] * Y + K[2] * Z;
    const v = K[3] * X + K[4] * Y + K[5] * Z;
    const w = K[6] * X + K[7] * Y + K[8] * Z;
    return [u / w, v / w];
}

/** `π(H · (x, y, 1))`. */
export function projectH(H: Mat3, x: number, y: number): [number, number] {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** `e(P; H*)` of §2: RMS over `points` of the gap between the pose's projection and `H*`'s. */
export function poseError(
    K: Mat3,
    pose: Pick<Pose, "R" | "t">,
    H: Mat3,
    points: Float64Array,
): number {
    let s = 0;
    const n = points.length / 2;
    for (let i = 0; i < n; i++) {
        const [ax, ay] = projectPose(K, pose.R, pose.t, points[2 * i], points[2 * i + 1]);
        const [bx, by] = projectH(H, points[2 * i], points[2 * i + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / n);
}

/** `d(P₁, P₂)` of §2. */
export function poseDistance(
    K: Mat3,
    a: Pick<Pose, "R" | "t">,
    b: Pick<Pose, "R" | "t">,
    points: Float64Array,
): number {
    let s = 0;
    const n = points.length / 2;
    for (let i = 0; i < n; i++) {
        const [ax, ay] = projectPose(K, a.R, a.t, points[2 * i], points[2 * i + 1]);
        const [bx, by] = projectPose(K, b.R, b.t, points[2 * i], points[2 * i + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / n);
}

/** Rodrigues: the rotation by `angle` about the unit `axis`. */
export function axisAngle(axis: [number, number, number], angle: number): Mat3 {
    const [x, y, z] = axis;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const C = 1 - c;
    return Float64Array.from([
        c + x * x * C,
        x * y * C - z * s,
        x * z * C + y * s,
        y * x * C + z * s,
        c + y * y * C,
        y * z * C - x * s,
        z * x * C - y * s,
        z * y * C + x * s,
        c + z * z * C,
    ]);
}

export interface RigidView {
    readonly tiltDeg: number;
    readonly azimuthDeg: number;
    readonly rollDeg: number;
    readonly shift: readonly [number, number];
    readonly R: Mat3;
    readonly t: Vec3;
    /** `K · [r1 r2 t]`, target level-0 px → frame px. */
    readonly H: Mat3;
}

/**
 * One rigid view of §4's S1: the target plane turned by `tilt` about the
 * in-plane axis at `azimuth`, then rolled about the optical axis, its centre
 * at depth `Z` and projecting to the frame's centre plus `shift`.
 */
export function rigidView(
    K: Mat3,
    target: { width: number; height: number },
    o: {
        tiltDeg: number;
        azimuthDeg: number;
        rollDeg: number;
        shift: readonly [number, number];
        Z: number;
    },
): RigidView {
    const deg = Math.PI / 180;
    const phi = o.azimuthDeg * deg;
    const tilt = axisAngle([Math.cos(phi), Math.sin(phi), 0], o.tiltDeg * deg);
    const roll = axisAngle([0, 0, 1], o.rollDeg * deg);
    const R = mul(roll, tilt);
    const f = K[0];
    const centre = [(target.width - 1) / 2, (target.height - 1) / 2];
    // The camera position of the target's centre: it projects to the frame's centre plus `shift`.
    const C = [(o.shift[0] * o.Z) / f, (o.shift[1] * o.Z) / f, o.Z];
    const t = Float64Array.from([
        C[0] - (R[0] * centre[0] + R[1] * centre[1]),
        C[1] - (R[3] * centre[0] + R[4] * centre[1]),
        C[2] - (R[6] * centre[0] + R[7] * centre[1]),
    ]);
    const Rt = Float64Array.from([R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]]);
    return { ...o, R, t, H: mul(K, Rt) };
}

/** §4's S1: 84 views. */
export function s1Views(
    K: Mat3,
    target: { width: number; height: number },
    Z: number,
): RigidView[] {
    const out: RigidView[] = [];
    const orientations: [number, number][] = [[0, 0]];
    for (const tilt of [10, 20, 30, 40, 50]) {
        for (const az of [0, 45, 90, 135]) orientations.push([tilt, az]);
    }
    for (const [tiltDeg, azimuthDeg] of orientations) {
        for (const rollDeg of [0, 15]) {
            for (const shift of [
                [0, 0],
                [30, -20],
            ] as const) {
                out.push(rigidView(K, target, { tiltDeg, azimuthDeg, rollDeg, shift, Z }));
            }
        }
    }
    return out;
}

/** `src` and its image under `H`, for the exact correspondences of S1. */
export function exactCorrespondences(H: Mat3, src: Float64Array): Float64Array {
    const dst = new Float64Array(src.length);
    for (let i = 0; i < src.length; i += 2) {
        const [x, y] = projectH(H, src[i], src[i + 1]);
        dst[i] = x;
        dst[i + 1] = y;
    }
    return dst;
}

/** The median of a non-empty array. */
export function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
