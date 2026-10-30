/*
 *  pose_filter.ts
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
 * One Euro filtering of the pose, the rotation in its tangent space (#106;
 * M5). The treatment registered in
 * `docs/benchmarks/2026-10-29-106-stage3-registration.md` ("The treatment"),
 * which is #197's scratch filter
 * (`docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.mjs` at `0665a96`,
 * lines 224 to 252 and 316 to 395) as the maintainer ruled it on 2026-10-29.
 * Written here, not imported: `@webarkit/oneeurofilter-ts` would be a second
 * runtime dependency, which ADR-0001 point 2 does not allow (the ruling's
 * decision 1). The core keeps that library's parameter names and its
 * per-index form, so that it can replace the core later under a new ADR.
 *
 * Two layers:
 *
 * - **The core**, {@link OneEuroVector}: a vector One Euro filter (Casiez,
 *   Roussel and Vogel, CHI 2012) on a step `δ = x − x̂ₖ₋₁` already computed
 *   against the previous filtered value, over `te` seconds, each component on
 *   its own: `dx = δ / te`, `dx̂ = ema(α(te, dCutOff), dx, dx̂ₖ₋₁)`,
 *   `cutoff = minCutOff + beta · |dx̂|`, `x̂ₖ = x̂ₖ₋₁ + α(te, cutoff) · δ`, with
 *   `α(te, f) = r / (r + 1)`, `r = 2π f te`.
 * - **The pose**, {@link PoseFilter}: the rotation's step is
 *   `ω = log(R̂ₖ₋₁ᵀ Rₖ)`, a 3-vector in the tangent space, which the core
 *   filters, and `R̂ₖ = R̂ₖ₋₁ · exp(ω̂)`, so the output is always a rotation;
 *   the translation's step is `t − t̂ₖ₋₁`, filtered by its own core. `dCutOff`
 *   is shared.
 *
 * Known limitations, as ruled (the ruling on open question 2): `α` is per
 * component of `ω`, as the library applies it per index, so the rotation's
 * filtering is not invariant to the frame's orientation; and the derivative
 * state `dx̂` is kept in the body frame of the previous estimate, accepted as
 * a second-order effect at the measured speeds.
 *
 * The tracker calls this module and nothing else does (ruling C of the
 * registration's Step 0). It is not exported from the package's index; only
 * here can a layer pass through, for the registered per-layer readings.
 */

import type { Mat3, Pose } from "@webarkit/cv-backend-spec";
import type { TrackingState } from "../tracking/types.js";

/** A layer's parameters: `minCutOff` in Hz, `beta` per unit of the signal's derivative per second. */
export interface OneEuroParams {
    readonly minCutOff: number;
    readonly beta: number;
}

/**
 * The filter's parameters. A layer that is `null` passes its part of the pose
 * through unchanged; that is reachable here only, never through the tracker's
 * option (ruling C). `dCutOff`, Hz, is shared by both layers.
 */
export interface PoseFilterLayers {
    readonly rotation: OneEuroParams | null;
    readonly translation: OneEuroParams | null;
    readonly dCutOff: number;
}

/** What the filter reads of one result: a `TrackResult` is one, with its unfiltered pose. */
export interface PoseFilterInput {
    readonly ok: boolean;
    readonly state: TrackingState;
    readonly pose: Pose | null;
    /** Read as milliseconds. */
    readonly timestampMs: number;
}

/**
 * One Euro's smoothing factor for a cutoff `f`, Hz, over `te` seconds:
 * `r / (r + 1)` with `r = 2π f te`, whose limit is 1 as `r` grows. A cutoff
 * that overflows `r` to Infinity, which finite parameters can do (`f` up to
 * about 1e308, or `minCutOff + beta · |dx̂|` past it), would read `∞ / ∞`,
 * NaN; it takes the limit instead, so the filter follows its input on that
 * frame. `r` is never NaN or negative here (`te > 0`, `f > 0`), and every
 * finite `r` keeps the expression the probe measured, bit for bit.
 */
const alpha = (te: number, f: number): number => {
    const r = 2 * Math.PI * f * te;
    return Number.isFinite(r) ? r / (r + 1) : 1;
};

/** The vector core: each component of a step filtered on its own, as the library does per index. */
export class OneEuroVector {
    private readonly dxPrev: Float64Array;

    constructor(
        private readonly n: number,
        private readonly minCutOff: number,
        private readonly beta: number,
        private readonly dCutOff: number,
    ) {
        this.dxPrev = new Float64Array(n);
    }

    reset(): void {
        this.dxPrev.fill(0);
    }

    /** The smoothed step for `delta = x − x̂ₖ₋₁` over `te` seconds: `x̂ₖ = x̂ₖ₋₁ + step`. */
    step(te: number, delta: Float64Array): Float64Array {
        const ad = alpha(te, this.dCutOff);
        const o = new Float64Array(this.n);
        for (let i = 0; i < this.n; i++) {
            const dx = delta[i] / te;
            const dxHat = ad * dx + (1 - ad) * this.dxPrev[i];
            const cutoff = this.minCutOff + this.beta * Math.abs(dxHat);
            o[i] = alpha(te, cutoff) * delta[i];
            this.dxPrev[i] = dxHat;
        }
        return o;
    }
}

function mul3(a: Mat3, b: Mat3): Mat3 {
    const o = new Float64Array(9);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
}

function transpose3(a: Mat3): Mat3 {
    return Float64Array.from([a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]);
}

/**
 * Where {@link so3Log} reads the axis from the symmetric part instead: the
 * angle at which the probe's `so3Log` stopped (script line 200). Below it the
 * two forms are the same function; above it the antisymmetric part is too
 * small to give the axis, and vanishes at π.
 */
const NEAR_PI = Math.PI - 1e-3;

/**
 * `log(R)` as a rotation vector `θ n`. The angle is read via
 * `atan2(‖v‖ / 2, (tr R − 1) / 2)`, with `v` the antisymmetric part's vector,
 * which keeps its precision for a small step where `acos` loses it (the
 * ruling on open question 4), and the vector is `v · θ / ‖v‖`. Near π, where
 * `v` vanishes, the axis comes from the symmetric part,
 * `(R + Rᵀ) / 2 = cos θ · I + (1 − cos θ) n nᵀ`, signed by `v`: at π itself
 * either sign is the same rotation.
 */
export function so3Log(R: Mat3): Float64Array {
    const v0 = R[7] - R[5];
    const v1 = R[2] - R[6];
    const v2 = R[3] - R[1];
    const s = Math.hypot(v0, v1, v2);
    const c = (R[0] + R[4] + R[8] - 1) / 2;
    const theta = Math.atan2(s / 2, c);
    if (theta <= NEAR_PI) {
        // θ / (2 sin θ) → 1/2 as θ → 0; ‖v‖ = 2 sin θ is 0 only for θ = 0 here.
        const k = s === 0 ? 0.5 : theta / s;
        return Float64Array.from([k * v0, k * v1, k * v2]);
    }
    const d = [R[0], R[4], R[8]];
    const i = d[0] >= d[1] && d[0] >= d[2] ? 0 : d[1] >= d[2] ? 1 : 2;
    const n = [0, 0, 0];
    n[i] = Math.sqrt(Math.max(0, (d[i] - c) / (1 - c)));
    for (let j = 0; j < 3; j++) {
        if (j !== i) n[j] = (R[i * 3 + j] + R[j * 3 + i]) / (2 * (1 - c) * n[i]);
    }
    const norm = Math.hypot(n[0], n[1], n[2]);
    const sign = n[0] * v0 + n[1] * v1 + n[2] * v2 < 0 ? -1 : 1;
    const k = (sign * theta) / norm;
    return Float64Array.from([k * n[0], k * n[1], k * n[2]]);
}

/** `exp([ω]×)`, Rodrigues. */
export function so3Exp(w: Float64Array): Mat3 {
    const theta = Math.hypot(w[0], w[1], w[2]);
    const K = Float64Array.from([0, -w[2], w[1], w[2], 0, -w[0], -w[1], w[0], 0]);
    const R = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const a = theta < 1e-12 ? 1 : Math.sin(theta) / theta;
    const b = theta < 1e-12 ? 0.5 : (1 - Math.cos(theta)) / (theta * theta);
    const KK = mul3(K, K);
    for (let i = 0; i < 9; i++) R[i] += a * K[i] + b * KK[i];
    return R;
}

/**
 * The pose layer, fed the tracker's results in order, one {@link apply} per
 * frame, every frame included: a `"LOST"` frame's timestamp counts.
 *
 * The reset rule, as ruled (the ruling on open question 2):
 *
 * - a result that is not `"TRACK"` with a pose resets, and passes its pose,
 *   if any, through unfiltered: a `"DETECT"` frame does not seed the filter,
 *   the next `"TRACK"` does;
 * - `pose.good === false` resets;
 * - a timestamp that does not exceed the previous frame's input timestamp
 *   resets, whatever that frame did, a reset frame included (#197's
 *   `f853004`): the last input timestamp is kept apart from the seeding
 *   timestamp, and a reset does not forget it;
 * - the frame after a reset seeds the filter with its own pose, unfiltered.
 *
 * A frame that passes through returns its input pose, the same object. A
 * filtered frame returns a new pose, with arrays of its own: nothing the
 * filter returns is written to again, and nothing it is given is written to.
 *
 * No clock is read: the period is `te = (timestampMs − previous) / 1000`
 * seconds, the one conversion from the caller's milliseconds.
 */
export class PoseFilter {
    private readonly coreR: OneEuroVector | null;
    private readonly coreT: OneEuroVector | null;
    /** The filtered pose; `null` until a frame seeds the filter. */
    private R: Mat3 | null = null;
    private t: Float64Array | null = null;
    /** The timestamp of the last pose the filter absorbed: the period's start. */
    private tPrev = -Infinity;
    /** The previous frame's input timestamp, whatever that frame did: the reset rule's reference. */
    private tLast = -Infinity;

    constructor(layers: PoseFilterLayers) {
        const r = layers.rotation;
        const t = layers.translation;
        this.coreR = r === null ? null : new OneEuroVector(3, r.minCutOff, r.beta, layers.dCutOff);
        this.coreT = t === null ? null : new OneEuroVector(3, t.minCutOff, t.beta, layers.dCutOff);
    }

    /** The frame's pose: filtered, or its own on a frame that passes through; `null` without one. */
    apply(frame: PoseFilterInput): Pose | null {
        const ts = frame.timestampMs;
        const pose = frame.ok ? frame.pose : null;
        const reset = pose === null || frame.state !== "TRACK" || !pose.good || !(ts > this.tLast);
        this.tLast = ts;
        if (reset) {
            this.R = null;
            this.t = null;
            this.coreR?.reset();
            this.coreT?.reset();
            this.tPrev = -Infinity;
            return pose;
        }
        if (this.R === null || this.t === null) {
            this.R = Float64Array.from(pose.R);
            this.t = Float64Array.from(pose.t);
            this.tPrev = ts;
            return pose;
        }
        const te = (ts - this.tPrev) / 1000;
        if (this.coreR === null) {
            this.R = Float64Array.from(pose.R);
        } else {
            const omega = so3Log(mul3(transpose3(this.R), pose.R));
            this.R = mul3(this.R, so3Exp(this.coreR.step(te, omega)));
        }
        if (this.coreT === null) {
            this.t = Float64Array.from(pose.t);
        } else {
            const that = this.t;
            const dt = Float64Array.from([
                pose.t[0] - that[0],
                pose.t[1] - that[1],
                pose.t[2] - that[2],
            ]);
            const st = this.coreT.step(te, dt);
            for (let i = 0; i < 3; i++) that[i] += st[i];
        }
        this.tPrev = ts;
        return { R: Float64Array.from(this.R), t: Float64Array.from(this.t), good: true };
    }
}
