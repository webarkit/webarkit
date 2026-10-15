/*
 *  ippe.ts
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
 * IPPE: the two poses a planar homography allows (T. Collins and A. Bartoli,
 * *Infinitesimal Plane-Based Pose Estimation*, IJCV 109(3), 2014). M4's step 3
 * (#105), in the tracker and above the contract: ADR-0001 point 3 puts pose
 * from a homography with its ambiguity resolution here, and #43 records why
 * the contract's `poseFromHomography` returns one pose.
 *
 * ## The construction
 *
 * The homography `H` maps target level-0 px to frame px. With the model
 * points moved to their centroid `c` and the image to normalised coordinates,
 * `Hn = K⁻¹ · H · T(c)`, scaled so that `Hn[2][2] = 1`, so that the centroid
 * is at positive depth. `v = (Hn[0][2], Hn[1][2])` is the centroid's
 * normalised image, and `J`, the 2 × 2 Jacobian of `u ↦ π(Hn · (u, 1))` at
 * `u = 0`, is the first-order view of the plane there.
 *
 * For a point `u` on the plane, `X = R · (u, 0) + t`, and at `u = 0`,
 * `π(X) = v` and `∂π/∂u = (1 / t_z) · P_v · R₁₂`, with `P_v = [1 0 −v₀; 0 1 −v₁]`
 * and `R₁₂` the first two columns of `R`. Take any rotation `Q` whose third
 * column is the unit vector along `(v₀, v₁, 1)`: then `P_v · Q = [B | 0]`
 * with `B` a 2 × 2 block, and writing `R = Q · R̃`,
 * `J = (1 / t_z) · B · R̃_top`, `R̃_top` the upper 2 × 2 of `R̃₁₂`. So
 * `A = B⁻¹ · J = R̃_top / t_z`. The columns of `R̃₁₂` are orthonormal, so
 * `R̃_topᵀ R̃_top = I − b bᵀ`, `b` its bottom row, whose eigenvalues are 1 and
 * `1 − ‖b‖²`: the largest singular value of `A` is `γ = 1 / t_z`,
 * `R̃_top = A / γ`, and `b` is known up to its sign, the two solutions. Each
 * gives `R = Q · [R̃_top; ±bᵀ | third column by cross product]`.
 *
 * `t` is then the least-squares translation over the correspondences for each
 * rotation, in the centroid frame, moved back to the target's origin. Each
 * candidate carries its RMS reprojection error over those correspondences,
 * which {@link selectPose} reads.
 *
 * ## What it does not do
 *
 * It does not choose. It does not read earlier frames. It draws nothing. Same
 * `H`, `K` and correspondences, same result; the correspondences' order
 * changes only the rounding of sums (criterion C6).
 */

import type { Mat3, PointArray, Vec3 } from "@webarkit/cv-backend-spec";

/** One of the two poses, with its RMS reprojection error over the correspondences, frame px. */
export interface PoseCandidate {
    /** Rotation, row-major, OpenCV camera frame. */
    readonly R: Mat3;
    /** Translation, in target level-0 px. */
    readonly t: Vec3;
    /** RMS over the correspondences of `‖π(K · (R · x̂ + t)) − dst‖`, frame px. */
    readonly rms: number;
}

export type IppeFailure =
    /** Fewer than 3 correspondences, or `src` and `dst` of different lengths. */
    | "too-few-correspondences"
    /** A non-finite entry in `H`, `K`, `src` or `dst`. */
    | "non-finite"
    /** `K⁻¹ · H` has no positive depth at the centroid, or a singular block; no pose exists. */
    | "degenerate";

export type IppeResult =
    | {
          readonly ok: true;
          /** The two candidates: index 0 with `b₀ ≥ 0` (`b₁`'s sign fixed by orthogonality), index 1 with `−b`. */
          readonly candidates: readonly [PoseCandidate, PoseCandidate];
      }
    | { readonly ok: false; readonly reason: IppeFailure };

/** A block determinant or `γ` below this is treated as singular. */
const SINGULAR = 1e-12;

/** `K⁻¹` for an upper-triangular pinhole `K` (skew read), row-major. */
function invertIntrinsics(K: Mat3): Float64Array {
    const fx = K[0];
    const s = K[1];
    const cx = K[2];
    const fy = K[4];
    const cy = K[5];
    return Float64Array.from([
        1 / fx,
        -s / (fx * fy),
        (s * cy - cx * fy) / (fx * fy),
        0,
        1 / fy,
        -cy / fy,
        0,
        0,
        1,
    ]);
}

function allFinite(a: ArrayLike<number>): boolean {
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
    return true;
}

/** `a · b` for row-major 3 × 3. */
function mul(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
    const out = new Float64Array(9);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
        }
    }
    return out;
}

/** A rotation with third column `(v0, v1, 1) / ‖·‖`, as columns `q1 | q2 | q3`. */
function frameWithAxis(v0: number, v1: number): Float64Array {
    const s = Math.hypot(v0, v1, 1);
    const q3 = [v0 / s, v1 / s, 1 / s];
    // q1: e_x made orthogonal to q3, then normalised. Its norm is √(1 − q3x²) ≥ q3z > 0.
    const q1 = [1 - q3[0] * q3[0], -q3[0] * q3[1], -q3[0] * q3[2]];
    const n1 = Math.hypot(q1[0], q1[1], q1[2]);
    q1[0] /= n1;
    q1[1] /= n1;
    q1[2] /= n1;
    const q2 = [
        q3[1] * q1[2] - q3[2] * q1[1],
        q3[2] * q1[0] - q3[0] * q1[2],
        q3[0] * q1[1] - q3[1] * q1[0],
    ];
    return Float64Array.from([q1[0], q2[0], q3[0], q1[1], q2[1], q3[1], q1[2], q2[2], q3[2]]);
}

/**
 * `R̃ = [T; ±bᵀ]` completed to a rotation, then `Q · R̃`.
 * `T` is `[t00 t01; t10 t11]`, `b = (b0, b1)`.
 */
function rotationFrom(
    Q: Float64Array,
    t00: number,
    t01: number,
    t10: number,
    t11: number,
    b0: number,
    b1: number,
): Float64Array {
    // Third column: the cross product of the first two.
    const c1 = [t00, t10, b0];
    const c2 = [t01, t11, b1];
    const c3 = [
        c1[1] * c2[2] - c1[2] * c2[1],
        c1[2] * c2[0] - c1[0] * c2[2],
        c1[0] * c2[1] - c1[1] * c2[0],
    ];
    const Rt = Float64Array.from([c1[0], c2[0], c3[0], c1[1], c2[1], c3[1], c1[2], c2[2], c3[2]]);
    return mul(Q, Rt);
}

/**
 * The least-squares translation for a known rotation over the correspondences,
 * in the centroid frame: for each point `u` with normalised image `x`,
 * `t₀ − x₀ t₂ = x₀ w_z − w_x` and `t₁ − x₁ t₂ = x₁ w_z − w_y`, `w = R · (u, 0)`.
 * Returns `null` when the normal equations are singular.
 */
function translationFor(
    R: Float64Array,
    Kinv: Float64Array,
    src: PointArray,
    dst: PointArray,
    cx: number,
    cy: number,
): Float64Array | null {
    const n = src.length >> 1;
    let n00 = 0;
    let n02 = 0;
    let n12 = 0;
    let n22 = 0;
    let r0 = 0;
    let r1 = 0;
    let r2 = 0;
    for (let i = 0; i < n; i++) {
        const ux = src[2 * i] - cx;
        const uy = src[2 * i + 1] - cy;
        const px = dst[2 * i];
        const py = dst[2 * i + 1];
        const x = Kinv[0] * px + Kinv[1] * py + Kinv[2];
        const y = Kinv[4] * py + Kinv[5];
        const wx = R[0] * ux + R[1] * uy;
        const wy = R[3] * ux + R[4] * uy;
        const wz = R[6] * ux + R[7] * uy;
        const b1 = x * wz - wx;
        const b2 = y * wz - wy;
        n00 += 1;
        n02 -= x;
        n12 -= y;
        n22 += x * x + y * y;
        r0 += b1;
        r1 += b2;
        r2 -= x * b1 + y * b2;
    }
    // N = [n00 0 n02; 0 n00 n12; n02 n12 n22], solved by Cramer's rule.
    const det = n00 * (n00 * n22 - n12 * n12) - n02 * (n00 * n02);
    if (!(Math.abs(det) > SINGULAR)) return null;
    const t0 = (r0 * (n00 * n22 - n12 * n12) - n02 * (n00 * r2 - n12 * r1)) / det;
    const t1 = (n00 * (r1 * n22 - n12 * r2) + r0 * n12 * n02 - n02 * n02 * r1) / det;
    const t2 = (n00 * (n00 * r2 - n12 * r1) - r0 * (n00 * n02)) / det;
    return Float64Array.from([t0, t1, t2]);
}

/** RMS reprojection error of `(R, t)` over the correspondences, frame px. */
function reprojectionRms(
    K: Mat3,
    R: Float64Array,
    t: Float64Array,
    src: PointArray,
    dst: PointArray,
): number {
    const n = src.length >> 1;
    let s = 0;
    for (let i = 0; i < n; i++) {
        const ux = src[2 * i];
        const uy = src[2 * i + 1];
        const X = R[0] * ux + R[1] * uy + t[0];
        const Y = R[3] * ux + R[4] * uy + t[1];
        const Z = R[6] * ux + R[7] * uy + t[2];
        const w = K[6] * X + K[7] * Y + K[8] * Z;
        const px = (K[0] * X + K[1] * Y + K[2] * Z) / w;
        const py = (K[3] * X + K[4] * Y + K[5] * Z) / w;
        s += (px - dst[2 * i]) ** 2 + (py - dst[2 * i + 1]) ** 2;
    }
    return Math.sqrt(s / n);
}

/**
 * The two poses of `H` under `K`, each with its least-squares translation and
 * RMS reprojection error over the correspondences `src` (target level-0 px)
 * → `dst` (frame px), both `[x0, y0, x1, y1, …]`.
 */
export function ippe(H: Mat3, K: Mat3, src: PointArray, dst: PointArray): IppeResult {
    const n = src.length >> 1;
    if (n < 3 || dst.length !== src.length || src.length % 2 !== 0) {
        return { ok: false, reason: "too-few-correspondences" };
    }
    if (!allFinite(H) || !allFinite(K) || !allFinite(src) || !allFinite(dst)) {
        return { ok: false, reason: "non-finite" };
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
        cx += src[2 * i];
        cy += src[2 * i + 1];
    }
    cx /= n;
    cy /= n;

    // Hn = K⁻¹ · H · T(c), then scaled to Hn[2][2] = 1.
    const Kinv = invertIntrinsics(K);
    const Hc = Float64Array.from([
        H[0],
        H[1],
        H[0] * cx + H[1] * cy + H[2],
        H[3],
        H[4],
        H[3] * cx + H[4] * cy + H[5],
        H[6],
        H[7],
        H[6] * cx + H[7] * cy + H[8],
    ]);
    const Hn = mul(Kinv, Hc);
    if (!(Math.abs(Hn[8]) > SINGULAR) || !allFinite(Hn)) return { ok: false, reason: "degenerate" };
    for (let i = 0; i < 9; i++) Hn[i] /= Hn[8];
    const v0 = Hn[2];
    const v1 = Hn[5];
    const j00 = Hn[0] - Hn[6] * v0;
    const j01 = Hn[1] - Hn[7] * v0;
    const j10 = Hn[3] - Hn[6] * v1;
    const j11 = Hn[4] - Hn[7] * v1;

    const Q = frameWithAxis(v0, v1);
    const b00 = Q[0] - v0 * Q[6];
    const b01 = Q[1] - v0 * Q[7];
    const b10 = Q[3] - v1 * Q[6];
    const b11 = Q[4] - v1 * Q[7];
    const dt = b00 * b11 - b01 * b10;
    if (!(Math.abs(dt) > SINGULAR)) return { ok: false, reason: "degenerate" };
    const i00 = b11 / dt;
    const i01 = -b01 / dt;
    const i10 = -b10 / dt;
    const i11 = b00 / dt;
    const a00 = i00 * j00 + i01 * j10;
    const a01 = i00 * j01 + i01 * j11;
    const a10 = i10 * j00 + i11 * j10;
    const a11 = i10 * j01 + i11 * j11;

    const ata00 = a00 * a00 + a10 * a10;
    const ata01 = a00 * a01 + a10 * a11;
    const ata11 = a01 * a01 + a11 * a11;
    const gamma = Math.sqrt(
        0.5 * (ata00 + ata11 + Math.sqrt((ata00 - ata11) ** 2 + 4 * ata01 * ata01)),
    );
    if (!(gamma > SINGULAR)) return { ok: false, reason: "degenerate" };
    const t00 = a00 / gamma;
    const t01 = a01 / gamma;
    const t10 = a10 / gamma;
    const t11 = a11 / gamma;
    // b from I − TᵀT: its magnitudes from the two column norms, the relative
    // sign from the columns' orthogonality. Exact under noise too, not only
    // on exact data, because T = A / γ has largest singular value 1 by
    // construction, so I − TᵀT is rank-1 positive semidefinite and equals
    // b bᵀ for the b below; the rotation is orthonormal whatever the noise.
    const b0 = Math.sqrt(Math.max(0, 1 - t00 * t00 - t10 * t10));
    let b1 = Math.sqrt(Math.max(0, 1 - t01 * t01 - t11 * t11));
    if (-(t00 * t01 + t10 * t11) < 0) b1 = -b1;

    const candidates: PoseCandidate[] = [];
    for (const sign of [1, -1]) {
        const R = rotationFrom(Q, t00, t01, t10, t11, sign * b0, sign * b1);
        const tc = translationFor(R, Kinv, src, dst, cx, cy);
        if (tc === null) return { ok: false, reason: "degenerate" };
        // Back from the centroid frame to the target's origin: t − R · (c, 0).
        const t = Float64Array.from([
            tc[0] - (R[0] * cx + R[1] * cy),
            tc[1] - (R[3] * cx + R[4] * cy),
            tc[2] - (R[6] * cx + R[7] * cy),
        ]);
        if (!allFinite(R) || !allFinite(t)) return { ok: false, reason: "degenerate" };
        candidates.push({ R, t, rms: reprojectionRms(K, R, t, src, dst) });
    }
    return { ok: true, candidates: [candidates[0], candidates[1]] };
}
