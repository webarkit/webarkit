/*
 *  conditioning.ts
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
 * The conditioning signal on a fitted homography (#104; M4's step 2): two
 * quantities read on the fit, before the pose step, that say how far the fit
 * is from a plane's homography under the camera. With `b1` and `b2` the first
 * two columns of `B = K⁻¹H`, as #104's body defines them:
 *
 * - `d_scale = ‖b1‖ / ‖b2‖ − 1`
 * - `d_orth  = b1·b2 / (‖b1‖ ‖b2‖)`
 *
 * For a plane seen by a pinhole camera `H = K [r1 r2 t]` up to scale, so
 * `b1` and `b2` are two orthogonal columns of a rotation times one scalar,
 * and both quantities are 0. The closed-form decomposition averages the two
 * norms into one scale and orthonormalises the two columns into a rotation,
 * so a fit that is not a plane's homography leaves no trace in the pose it
 * returns; these two numbers are that trace, kept apart. They are not
 * combined here, by the M4 milestone's instruction (appended 2026-10-21:
 * "exposed separately with no combined quantity and no default threshold"),
 * and the derivation of record
 * (`docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.md`, "Two
 * separate thresholds") says why that matters on the sweep: "on this sweep
 * they also differ in which gross fits they catch: on view 1 `d_orth` alone
 * misses three of five, on view 0 `d_scale` alone catches all three by a thin
 * margin. Which form is registered is not decided here." No threshold is
 * defined here either: the same derivation found no single value that
 * separates right fits from gross wrong fits pooled over the sweep's two
 * views, M4 registers none, and the thresholds are the caller's
 * (`NftTracker`'s `conditioning` option).
 *
 * Both quantities are a ratio of norms and a cosine, so the scale of `H`
 * (its sign included) does not enter: `H` is read as the fit left it, not
 * normalised first.
 *
 * Written from #104's definitions and the derivation's prose, not from the
 * derivation's script: the two are compared in `test/pose/conditioning*.test.ts`,
 * and the comparison has force only because they were arrived at separately.
 */

import type { Mat3 } from "@webarkit/cv-backend-spec";

/**
 * The two quantities on one fit, or `ok: false` when they cannot be read:
 * `K` singular, a column of `K⁻¹H` without a finite nonzero norm, or a
 * non-finite entry anywhere. A reading that could not be taken is never
 * reported as two numbers.
 */
export type ConditioningReading =
    | {
          readonly ok: true;
          /** `‖b1‖ / ‖b2‖ − 1`: 0 when the two columns have one scale. */
          readonly dScale: number;
          /** `b1·b2 / (‖b1‖ ‖b2‖)`: 0 when the two columns are orthogonal. */
          readonly dOrth: number;
      }
    | {
          readonly ok: false;
          readonly reason: "degenerate";
      };

/**
 * The refusing state's thresholds, one per quantity, both the caller's: a fit
 * is refused when `|d_scale| > maxDScale` or `|d_orth| > maxDOrth`
 * ({@link conditioningRefuses}). No default exists. `+Infinity` leaves that
 * quantity unbounded (the derivation of record's view-1 case, "τ_o unbounded
 * above with τ_s at its floor"); the reading is still taken, and one that
 * cannot be taken is still refused.
 */
export interface ConditioningThresholds {
    readonly maxDScale: number;
    readonly maxDOrth: number;
}

const DEGENERATE: ConditioningReading = Object.freeze({ ok: false, reason: "degenerate" });

/**
 * The signal on `H` (target → frame, row-major) under `K` (row-major, as the
 * pose step reads it). Never throws: an input it cannot read is `ok: false`.
 */
export function conditioning(H: Mat3, K: Mat3): ConditioningReading {
    // K⁻¹ by the adjugate, for any 3 × 3 K: no assumption of zero skew.
    const det =
        K[0] * (K[4] * K[8] - K[5] * K[7]) -
        K[1] * (K[3] * K[8] - K[5] * K[6]) +
        K[2] * (K[3] * K[7] - K[4] * K[6]);
    if (!(Number.isFinite(det) && det !== 0)) return DEGENERATE;
    const inv = Float64Array.from([
        (K[4] * K[8] - K[5] * K[7]) / det,
        (K[2] * K[7] - K[1] * K[8]) / det,
        (K[1] * K[5] - K[2] * K[4]) / det,
        (K[5] * K[6] - K[3] * K[8]) / det,
        (K[0] * K[8] - K[2] * K[6]) / det,
        (K[2] * K[3] - K[0] * K[5]) / det,
        (K[3] * K[7] - K[4] * K[6]) / det,
        (K[1] * K[6] - K[0] * K[7]) / det,
        (K[0] * K[4] - K[1] * K[3]) / det,
    ]);
    // The first two columns of B = K⁻¹H: b1 = B · e1, b2 = B · e2, so column c
    // of B is K⁻¹ applied to column c of H.
    const b1 = column(inv, H, 0);
    const b2 = column(inv, H, 1);
    const n1 = Math.hypot(b1[0], b1[1], b1[2]);
    const n2 = Math.hypot(b2[0], b2[1], b2[2]);
    if (!(Number.isFinite(n1) && Number.isFinite(n2) && n1 > 0 && n2 > 0)) return DEGENERATE;
    const dScale = n1 / n2 - 1;
    // The cosine as the dot of the two unit columns, so that the product of
    // two large norms cannot overflow where the quotient would not.
    const dOrth =
        (b1[0] / n1) * (b2[0] / n2) + (b1[1] / n1) * (b2[1] / n2) + (b1[2] / n1) * (b2[2] / n2);
    if (!(Number.isFinite(dScale) && Number.isFinite(dOrth))) return DEGENERATE;
    return { ok: true, dScale, dOrth };
}

/** Column `c` of `A · H`, both row-major 3 × 3. */
function column(A: Float64Array, H: Mat3, c: number): [number, number, number] {
    return [
        A[0] * H[c] + A[1] * H[3 + c] + A[2] * H[6 + c],
        A[3] * H[c] + A[4] * H[3 + c] + A[5] * H[6 + c],
        A[6] * H[c] + A[7] * H[3 + c] + A[8] * H[6 + c],
    ];
}

/**
 * The refusing state's rule: refuse when either quantity's magnitude exceeds
 * its own threshold (strictly: a reading at the threshold passes, as #153's
 * kind E states the rule), and refuse a reading that could not be taken or
 * is not a number — an instrument that cannot tell clean from blind refuses
 * when blind.
 */
export function conditioningRefuses(
    reading: ConditioningReading,
    thresholds: ConditioningThresholds,
): boolean {
    if (!reading.ok) return true;
    const s = Math.abs(reading.dScale);
    const o = Math.abs(reading.dOrth);
    if (!(Number.isFinite(s) && Number.isFinite(o))) return true;
    return s > thresholds.maxDScale || o > thresholds.maxDOrth;
}
