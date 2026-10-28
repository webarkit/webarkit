/*
 *  warped_frames.ts
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
 * Synthetic camera frames for the tracking tests: a target image seen through
 * a KNOWN homography, with controlled blur, brightness/contrast and noise.
 *
 * The tracking suites measure accuracy and convergence against the ground
 * truth these frames carry by construction — a target point `X` appears at
 * `project(H, X)` — so what this module does to a pixel is part of what every
 * such measurement means. It is written to be read, not to be fast.
 *
 * **Image formation**, in the order a camera applies it:
 *
 * 1. **Geometry.** Frame pixel `x` shows the target at `H⁻¹ · x`. Integer
 *    coordinates are pixel centres (format spec §3) in both images. The
 *    target covers its pixel cells, `[-0.5, w - 0.5) × [-0.5, h - 0.5)`,
 *    reconstructed bilinearly with its edge pixels extended to the cell
 *    border; everything else is `background`.
 * 2. **Sampling.** Where the warp magnifies the target, a frame pixel is one
 *    bilinear sample at its centre, so the identity and whole-pixel shifts
 *    reproduce the target exactly. Where it minifies, a frame pixel averages
 *    a `k × k` grid over its own area — a box filter over its footprint, the
 *    way a sensor pixel integrates light — with `k` the footprint's reach in
 *    target pixels, rounded up (at most {@link MAX_SUPERSAMPLING}), so no two
 *    samples are more than one target pixel apart and a minified target does
 *    not alias.
 * 3. **Blur**: `blurPasses` passes of the `[1, 2, 1] / 4` kernel along each
 *    axis, edge pixels extended. Each pass adds `1/2` px² of variance, so the
 *    blur is Gaussian-like with `σ² = blurPasses / 2`.
 * 4. **Photometry**: `v ↦ gain · v + bias`.
 * 5. **Noise**: `noiseSigma · n`, with `n` the Irwin–Hall sum of twelve
 *    uniforms minus six — mean 0, variance exactly 1, bounded at ±6 — drawn
 *    from {@link mulberry32}`(seed)` in raster order.
 * 6. **Quantisation**: rounded (`Math.round`) and clamped to `[0, 255]`.
 *
 * **Deterministic across engines, not only across runs.** Rendering uses only
 * `+ − × ÷`, `Math.sqrt`, `Math.floor`, `Math.ceil` and `Math.round`, all of
 * which IEEE 754 or ECMAScript define exactly, and the noise is integer
 * arithmetic divided by 2³². No transcendental function is involved, so a
 * render depends only on its arguments. (The view helpers below do call
 * `Math.cos`/`Math.sin`; a test that pins bytes passes a literal homography.)
 */

import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { mulberry32 } from "./seeded_rng.js";

/** The most samples per axis a minified frame pixel averages. */
export const MAX_SUPERSAMPLING = 8;

export const IDENTITY: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** `a · b`, row-major. */
export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
    const r = new Float64Array(9);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
        }
    }
    return r;
}

/** `m⁻¹` by the adjugate. Throws on a singular matrix: test data, not a tracker input. */
export function mat3Inv(m: Mat3): Mat3 {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h;
    const B = -(d * i - f * g);
    const C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!(Number.isFinite(det) && det !== 0)) throw new Error("mat3Inv: singular matrix");
    return Float64Array.from([
        A / det,
        -(b * i - c * h) / det,
        (b * f - c * e) / det,
        B / det,
        (a * i - c * g) / det,
        -(a * f - c * d) / det,
        C / det,
        -(a * h - b * g) / det,
        (a * e - b * d) / det,
    ]);
}

/** The image of `(x, y)` under `h`, perspective division included. */
export function project(h: Mat3, x: number, y: number): [number, number] {
    const w = h[6] * x + h[7] * y + h[8];
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

export function translation(tx: number, ty: number): Mat3 {
    return Float64Array.from([1, 0, tx, 0, 1, ty, 0, 0, 1]);
}

export function scaling(s: number): Mat3 {
    return Float64Array.from([s, 0, 0, 0, s, 0, 0, 0, 1]);
}

export function rotation(angle: number): Mat3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return Float64Array.from([c, -s, 0, s, c, 0, 0, 0, 1]);
}

/** A pure perspective term: `w = 1 + px · x + py · y`. The identity at the origin, to first order. */
export function perspective(px: number, py: number): Mat3 {
    return Float64Array.from([1, 0, 0, 0, 1, 0, px, py, 1]);
}

export interface ViewOptions {
    readonly target: { readonly width: number; readonly height: number };
    readonly frame: { readonly width: number; readonly height: number };
    /** Frame pixels per target pixel at the target centre. */
    readonly scale: number;
    /** Rotation in the frame, radians. Default 0. */
    readonly angle?: number;
    /**
     * `[px, py]`, in 1 / target px, applied about the target centre: a point
     * `d` target pixels from the centre along x is foreshortened by
     * `1 + px · d`. Default no perspective.
     */
    readonly perspective?: readonly [number, number];
    /** Frame offset of the target centre from the frame centre, px. Default `[0, 0]`. */
    readonly shift?: readonly [number, number];
}

/**
 * A homography target level-0 → frame level-0 that shows the target's centre
 * at the frame centre (plus `shift`) with local scale `scale` there:
 * `T(frame centre + shift) · R(angle) · S(scale) · P(perspective) · T(−target centre)`.
 * Centres are `((w − 1) / 2, (h − 1) / 2)`, since integers are pixel centres.
 */
export function view(o: ViewOptions): Mat3 {
    const [px, py] = o.perspective ?? [0, 0];
    const [sx, sy] = o.shift ?? [0, 0];
    const toCentre = translation(-(o.target.width - 1) / 2, -(o.target.height - 1) / 2);
    const place = translation((o.frame.width - 1) / 2 + sx, (o.frame.height - 1) / 2 + sy);
    let H = mat3Mul(perspective(px, py), toCentre);
    H = mat3Mul(scaling(o.scale), H);
    H = mat3Mul(rotation(o.angle ?? 0), H);
    return mat3Mul(place, H);
}

export interface RenderOptions {
    /** Frame size, px. */
    readonly width: number;
    readonly height: number;
    /** Grey level wherever the target is not. Default 128. */
    readonly background?: number;
    /** Passes of `[1, 2, 1] / 4` along each axis; variance `blurPasses / 2` px². Default 0. */
    readonly blurPasses?: number;
    /** Default 1. */
    readonly gain?: number;
    /** Grey levels. Default 0. */
    readonly bias?: number;
    /** Standard deviation of the additive noise, grey levels. Default 0. */
    readonly noiseSigma?: number;
    /** Seed of the noise generator. Default 1. */
    readonly seed?: number;
}

/**
 * Renders `target` as seen through `H` (target → frame, row-major), then
 * blurs, applies gain and bias, adds noise and quantises — see the module
 * comment for each step.
 */
export function renderWarp(target: GrayImage, H: Mat3, options: RenderOptions): GrayImage {
    const { width, height } = options;
    const background = options.background ?? 128;
    const blurPasses = options.blurPasses ?? 0;
    const gain = options.gain ?? 1;
    const bias = options.bias ?? 0;
    const noiseSigma = options.noiseSigma ?? 0;
    if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
        throw new Error(`renderWarp: bad frame size ${width}x${height}`);
    }
    if (!(Number.isInteger(blurPasses) && blurPasses >= 0) || !(noiseSigma >= 0)) {
        throw new Error("renderWarp: blurPasses must be an integer >= 0 and noiseSigma >= 0");
    }

    const Hi = mat3Inv(H);
    const img = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            img[y * width + x] = pixel(target, Hi, x, y, background);
        }
    }

    const tmp = new Float64Array(width * height);
    for (let pass = 0; pass < blurPasses; pass++) {
        binomialRows(img, tmp, width, height);
        binomialColumns(tmp, img, width, height);
    }

    const out = new Uint8Array(width * height);
    const rng = mulberry32(options.seed ?? 1);
    for (let i = 0; i < out.length; i++) {
        let v = gain * img[i] + bias;
        if (noiseSigma > 0) {
            let s = 0;
            for (let k = 0; k < 12; k++) s += rng();
            v += noiseSigma * (s - 6);
        }
        out[i] = Math.min(255, Math.max(0, Math.round(v)));
    }
    return { data: out, width, height };
}

/** Frame pixel `(x, y)`: one sample if the warp magnifies there, a box average if it minifies. */
function pixel(target: GrayImage, Hi: Mat3, x: number, y: number, background: number): number {
    const w = Hi[6] * x + Hi[7] * y + Hi[8];
    if (!(w > 0)) return background; // behind the camera
    const X = (Hi[0] * x + Hi[1] * y + Hi[2]) / w;
    const Y = (Hi[3] * x + Hi[4] * y + Hi[5]) / w;
    // Reach of one frame pixel in target pixels: the longer column of the
    // Jacobian of H⁻¹, i.e. how far one frame step moves in the target.
    const dXdx = (Hi[0] - Hi[6] * X) / w;
    const dYdx = (Hi[3] - Hi[6] * Y) / w;
    const dXdy = (Hi[1] - Hi[7] * X) / w;
    const dYdy = (Hi[4] - Hi[7] * Y) / w;
    const reach = Math.max(
        Math.sqrt(dXdx * dXdx + dYdx * dYdx),
        Math.sqrt(dXdy * dXdy + dYdy * dYdy),
    );
    const k = reach <= 1 ? 1 : Math.min(MAX_SUPERSAMPLING, Math.ceil(reach));
    let sum = 0;
    for (let b = 0; b < k; b++) {
        for (let a = 0; a < k; a++) {
            sum += sample(target, Hi, x + (a + 0.5) / k - 0.5, y + (b + 0.5) / k - 0.5, background);
        }
    }
    return sum / (k * k);
}

/** The target at frame point `(fx, fy)`: bilinear inside its cells, `background` outside. */
function sample(target: GrayImage, Hi: Mat3, fx: number, fy: number, background: number): number {
    const w = Hi[6] * fx + Hi[7] * fy + Hi[8];
    if (!(w > 0)) return background;
    const X = (Hi[0] * fx + Hi[1] * fy + Hi[2]) / w;
    const Y = (Hi[3] * fx + Hi[4] * fy + Hi[5]) / w;
    const tw = target.width;
    const th = target.height;
    if (!(X >= -0.5 && X < tw - 0.5 && Y >= -0.5 && Y < th - 0.5)) return background;
    const x0 = Math.floor(X);
    const y0 = Math.floor(Y);
    const ax = X - x0;
    const ay = Y - y0;
    const xa = Math.max(0, x0);
    const xb = Math.min(tw - 1, x0 + 1);
    const ya = Math.max(0, y0);
    const yb = Math.min(th - 1, y0 + 1);
    const t = target.data;
    const top = (1 - ax) * t[ya * tw + xa] + ax * t[ya * tw + xb];
    const bottom = (1 - ax) * t[yb * tw + xa] + ax * t[yb * tw + xb];
    return (1 - ay) * top + ay * bottom;
}

/** One `[1, 2, 1] / 4` pass along each row, edge pixels extended. */
function binomialRows(src: Float64Array, dst: Float64Array, width: number, height: number): void {
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const l = src[row + Math.max(0, x - 1)];
            const r = src[row + Math.min(width - 1, x + 1)];
            dst[row + x] = (l + 2 * src[row + x] + r) / 4;
        }
    }
}

/** One `[1, 2, 1] / 4` pass along each column, edge pixels extended. */
function binomialColumns(src: Float64Array, dst: Float64Array, width: number, height: number): void {
    for (let y = 0; y < height; y++) {
        const up = Math.max(0, y - 1) * width;
        const down = Math.min(height - 1, y + 1) * width;
        const row = y * width;
        for (let x = 0; x < width; x++) {
            dst[row + x] = (src[up + x] + 2 * src[row + x] + src[down + x]) / 4;
        }
    }
}
