/*
 *  align_patch.ts
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

import type { Mat3 } from "@webarkit/cv-backend-spec";
import type { PatchTable } from "../target/types.js";
import { pyramidScales } from "./frame_pyramid.js";
import type {
    AlignPatch,
    AlignPatchOptions,
    FramePyramid,
    PatchAlignment,
    PatchAlignmentFailure,
} from "./types.js";

/**
 * The smallest eigenvalue, in grey levels² per patch px² summed over the
 * window, below which the alignment system counts as singular.
 *
 * With `n` grey levels of noise per pixel, the translation estimate's
 * standard deviation along its weakest direction is `n / √λ_min` patch px,
 * so this threshold is where one grey level of noise already means a pixel
 * of uncertainty. Real texture is orders of magnitude above it; it separates
 * a flat patch or a one-directional one (the aperture problem), whose λ_min
 * is 0 up to rounding, from everything else.
 */
const MIN_EIGENVALUE = 1;

/** See {@link AlignPatch}; the design notes are on the individual steps below. */
export const alignPatch: AlignPatch = (frame, patches, q, targetScaleStep, prediction, options) => {
    if (!validOptions(options)) return fail("invalid-options");
    const frameScales = validPyramid(frame);
    if (frameScales === null) return fail("invalid-pyramid");
    const patch = validPatch(patches, q, targetScaleStep);
    if (patch === null) return fail("invalid-patch");
    const H = frontFacing(prediction);
    if (H === null) return fail("non-finite-prediction");
    const centre = project(H, patch.centreX, patch.centreY);
    if (centre === null) return fail("non-finite-prediction");
    const window = warpWindow(H, patch);
    if (window === null) return fail("outside-frame");

    const usable = usableLevels(frame, frameScales, window);
    if (usable.length === 0) return fail("outside-frame");

    if (!window.invertible || !textured(patch, options.photometric)) return fail("singular");

    // Not aligned yet: the prediction itself, reported as unconverged.
    const finest = usable[0];
    return {
        ok: true,
        observation: {
            index: q,
            x: centre[0],
            y: centre[1],
            residual: residualAt(frame, frameScales, finest, window, patch),
            converged: false,
            iterations: 0,
            frameLevel: finest,
            gain: 1,
            bias: 0,
        },
    };
};

function validOptions(o: AlignPatchOptions): boolean {
    return (
        Number.isInteger(o.maxIterations) &&
        o.maxIterations >= 1 &&
        o.epsilon > 0 &&
        typeof o.photometric === "boolean"
    );
}

/**
 * The frame's level scales, or `null` if the pyramid is not valid: 1 to 256
 * levels, a step that is finite, `> 1` and whose deepest level's scale does
 * not underflow, and every level a positive-integer size holding
 * `width · height` pixels. Nothing here reads a pixel.
 */
function validPyramid(frame: FramePyramid): Float64Array | null {
    const count = frame.levels.length;
    const scales = pyramidScales(frame.scaleStep, count);
    if (scales === null) return null;
    for (const level of frame.levels) {
        const { width, height } = level;
        if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
            return null;
        }
        if (level.data.length !== width * height) return null;
    }
    return scales;
}

/** One patch, validated, with its level scale and its centre in target level-0 coordinates. */
interface Patch {
    readonly P: number;
    readonly left: number;
    readonly top: number;
    /** `s_l` of the patch's target level. */
    readonly scale: number;
    readonly centreX: number;
    readonly centreY: number;
    /** The table's pixel array; the patch starts at `offset`. */
    readonly pixels: Uint8Array;
    readonly offset: number;
}

/**
 * `null` unless `q` indexes a patch of a well-formed table: `P ≥ 3`, `Q · P²`
 * pixels, `left`/`top`/`level` of `Q` entries each, and a target step whose
 * scale at the patch's level is finite and non-zero.
 */
function validPatch(patches: PatchTable, q: number, targetScaleStep: number): Patch | null {
    const { patchSize: P, count: Q } = patches;
    if (!(Number.isInteger(P) && P >= 3 && Number.isInteger(Q) && Q >= 1)) return null;
    if (!(Number.isInteger(q) && q >= 0 && q < Q)) return null;
    if (patches.pixels.length !== Q * P * P) return null;
    if (patches.left.length !== Q || patches.top.length !== Q || patches.level.length !== Q) {
        return null;
    }
    const level = patches.level[q];
    const scales = pyramidScales(targetScaleStep, level + 1);
    if (scales === null) return null;
    const scale = scales[level];
    const left = patches.left[q];
    const top = patches.top[q];
    return {
        P,
        left,
        top,
        scale,
        centreX: (left + (P - 1) / 2) / scale,
        centreY: (top + (P - 1) / 2) / scale,
        pixels: patches.pixels,
        offset: q * P * P,
    };
}

/**
 * The prediction, sign-normalised so that `H[8] > 0`, or `null` if an entry
 * is not finite or `H[8] = 0`.
 *
 * A homography and any non-zero multiple of it are the same map, so the
 * scale is free (types.ts rule 1) — but the sign of `w` is what says which
 * side of the horizon a point is on, and it flips with the scale. `H[8]` is
 * `w` at the target's origin; normalising its sign to positive makes
 * `w > 0` mean "on the origin's side", the side a camera looking at the
 * target sees. `H[8] = 0` puts the origin itself at infinity, outside the
 * contract, and leaves no side to call "front".
 */
function frontFacing(prediction: Mat3): Mat3 | null {
    for (let i = 0; i < 9; i++) if (!Number.isFinite(prediction[i])) return null;
    const h8 = prediction[8];
    if (h8 === 0) return null;
    return h8 > 0 ? prediction : Float64Array.from(prediction, (v) => -v);
}

/** `H · (X, Y)` after the perspective division, or `null` at or beyond the horizon. */
function project(H: Mat3, X: number, Y: number): [number, number] | null {
    const w = H[6] * X + H[7] * Y + H[8];
    if (!(w > 0)) return null;
    const x = (H[0] * X + H[1] * Y + H[2]) / w;
    const y = (H[3] * X + H[4] * Y + H[5]) / w;
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/**
 * The patch's P × P pixels, each placed where the prediction puts it in
 * frame level-0 coordinates.
 */
interface Window {
    /** Frame level-0 position of each sample, row-major like the patch. */
    readonly x: Float64Array;
    readonly y: Float64Array;
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    /**
     * Whether the warp's Jacobian is invertible at every sample. A prediction
     * that collapses the window onto a line or a point leaves nothing to
     * align, and makes the system singular.
     */
    readonly invertible: boolean;
    /** Frame level-0 px per patch px at the patch centre, `√|det J|`. */
    readonly scaleAtCentre: number;
}

/**
 * Every sample's frame position, or `null` if one lies at or beyond the
 * horizon: a window reaching infinity cannot lie inside any level.
 */
function warpWindow(H: Mat3, patch: Patch): Window | null {
    const { P, left, top, scale } = patch;
    const n = P * P;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let invertible = true;
    for (let i = 0; i < P; i++) {
        for (let j = 0; j < P; j++) {
            const X = (left + j) / scale;
            const Y = (top + i) / scale;
            const p = project(H, X, Y);
            if (p === null) return null;
            const k = i * P + j;
            x[k] = p[0];
            y[k] = p[1];
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
            const det = jacobianDet(H, X, Y, p[0], p[1]);
            if (!(Number.isFinite(det) && det !== 0)) invertible = false;
        }
    }
    const c = project(H, patch.centreX, patch.centreY);
    const centreDet = c === null ? 0 : jacobianDet(H, patch.centreX, patch.centreY, c[0], c[1]);
    // J is per target level-0 px; one patch px is 1 / scale of those.
    const scaleAtCentre = Math.sqrt(Math.abs(centreDet)) / scale;
    return { x, y, minX, maxX, minY, maxY, invertible, scaleAtCentre };
}

/** `det ∂(x, y)/∂(X, Y)` of `H` at target `(X, Y)`, which it maps to `(x, y)`. */
function jacobianDet(H: Mat3, X: number, Y: number, x: number, y: number): number {
    const w = H[6] * X + H[7] * Y + H[8];
    const a = (H[0] - H[6] * x) / w;
    const b = (H[1] - H[7] * x) / w;
    const c = (H[3] - H[6] * y) / w;
    const d = (H[4] - H[7] * y) / w;
    return a * d - b * c;
}

/**
 * The levels on which the whole window can be sampled, finest first.
 *
 * A level is usable when every sample of the warped P × P window lies in
 * `[0, w − 1] × [0, h − 1]` of that level: bilinear interpolation reads the
 * pixel to the right of and below each sample, so a sample on the last
 * column or row is allowed and nothing beyond. The alignment is inverse
 * compositional, so it reads no frame gradients, and needs no other border.
 */
function usableLevels(frame: FramePyramid, scales: Float64Array, window: Window): number[] {
    const out: number[] = [];
    for (let l = 0; l < frame.levels.length; l++) {
        if (inside(frame, scales, l, window, 0, 0)) out.push(l);
    }
    return out;
}

/** Whether the window, moved by `(dx, dy)` level-0 px, lies inside level `l`. */
function inside(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    window: Window,
    dx: number,
    dy: number,
): boolean {
    const { width, height } = frame.levels[l];
    if (width < 2 || height < 2) return false;
    const s = scales[l];
    return (
        s * (window.minX + dx) >= 0 &&
        s * (window.maxX + dx) <= width - 1 &&
        s * (window.minY + dy) >= 0 &&
        s * (window.maxY + dy) <= height - 1
    );
}

/**
 * Whether the patch has enough texture for its system to be solvable: the
 * smallest eigenvalue of the gradient structure tensor `Σ g gᵀ` (patch px),
 * and with photometric compensation that of its Schur complement once gain
 * and bias are projected out, at least {@link MIN_EIGENVALUE}.
 */
function textured(patch: Patch, photometric: boolean): boolean {
    const { P, pixels, offset } = patch;
    let gxx = 0;
    let gxy = 0;
    let gyy = 0;
    let gxT = 0;
    let gyT = 0;
    let gx1 = 0;
    let gy1 = 0;
    let sT = 0;
    let sTT = 0;
    for (let i = 0; i < P; i++) {
        for (let j = 0; j < P; j++) {
            const [gx, gy] = gradient(pixels, offset, P, i, j);
            const t = pixels[offset + i * P + j];
            gxx += gx * gx;
            gxy += gx * gy;
            gyy += gy * gy;
            gxT += gx * t;
            gyT += gy * t;
            gx1 += gx;
            gy1 += gy;
            sT += t;
            sTT += t * t;
        }
    }
    if (!photometric) return minEigenvalue(gxx, gxy, gyy) >= MIN_EIGENVALUE;
    const n = P * P;
    // M_aa = [[ΣT², ΣT], [ΣT, n]]; its determinant is n · Σ(T − T̄)².
    const det = n * sTT - sT * sT;
    if (!(det / n >= MIN_EIGENVALUE)) return false;
    // S = M_pp − M_pa · M_aa⁻¹ · M_ap, with M_pa = [[ΣgxT, Σgx], [ΣgyT, Σgy]].
    const i00 = n / det;
    const i01 = -sT / det;
    const i11 = sTT / det;
    const qf = (ua: number, ub: number, va: number, vb: number) =>
        ua * (i00 * va + i01 * vb) + ub * (i01 * va + i11 * vb);
    const sxx = gxx - qf(gxT, gx1, gxT, gx1);
    const sxy = gxy - qf(gxT, gx1, gyT, gy1);
    const syy = gyy - qf(gyT, gy1, gyT, gy1);
    return minEigenvalue(sxx, sxy, syy) >= MIN_EIGENVALUE;
}

/**
 * The patch's intensity gradient at pixel `(i, j)`, grey levels per patch
 * px: central differences inside, one-sided on the border rows and columns.
 */
function gradient(
    pixels: Uint8Array,
    offset: number,
    P: number,
    i: number,
    j: number,
): [number, number] {
    const at = (r: number, c: number) => pixels[offset + r * P + c];
    const gx =
        j === 0
            ? at(i, 1) - at(i, 0)
            : j === P - 1
              ? at(i, j) - at(i, j - 1)
              : (at(i, j + 1) - at(i, j - 1)) / 2;
    const gy =
        i === 0
            ? at(1, j) - at(0, j)
            : i === P - 1
              ? at(i, j) - at(i - 1, j)
              : (at(i + 1, j) - at(i - 1, j)) / 2;
    return [gx, gy];
}

/** Smallest eigenvalue of the symmetric 2 × 2 `[[a, b], [b, c]]`. */
function minEigenvalue(a: number, b: number, c: number): number {
    const mean = (a + c) / 2;
    const d = (a - c) / 2;
    return mean - Math.sqrt(d * d + b * b);
}

/** RMS intensity difference between the patch and level `l` over the window. */
function residualAt(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    window: Window,
    patch: Patch,
): number {
    const img = frame.levels[l];
    const s = scales[l];
    const n = patch.P * patch.P;
    let sum = 0;
    for (let k = 0; k < n; k++) {
        const e = bilinear(img.data, img.width, img.height, s * window.x[k], s * window.y[k]);
        const r = e - patch.pixels[patch.offset + k];
        sum += r * r;
    }
    return Math.sqrt(sum / n);
}

/** Level pixel value at `(x, y)` in `[0, w − 1] × [0, h − 1]`; needs `w, h ≥ 2`. */
function bilinear(data: Uint8Array, w: number, h: number, x: number, y: number): number {
    const x0 = Math.min(Math.floor(x), w - 2);
    const y0 = Math.min(Math.floor(y), h - 2);
    const ax = x - x0;
    const ay = y - y0;
    const i = y0 * w + x0;
    const top = data[i] + ax * (data[i + 1] - data[i]);
    const bottom = data[i + w] + ax * (data[i + w + 1] - data[i + w]);
    return top + ay * (bottom - top);
}

function fail(reason: PatchAlignmentFailure): PatchAlignment {
    return { ok: false, reason };
}
