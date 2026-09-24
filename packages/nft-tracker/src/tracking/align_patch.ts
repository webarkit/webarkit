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

import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import type { PatchTable } from "../target/types.js";
import { pyramidScales, stepVariance } from "./frame_pyramid.js";
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

/**
 * See {@link AlignPatch}. The design, one choice per point; the measurements
 * behind each are in the notes of the function it points to, and in the
 * `align_patch_*.test.ts` suites, which re-measure them.
 *
 * 1. **The warp of the patch by the prediction.** Wagner et al.'s
 *    PatchTracker (IEEE TVCG 2010) matches reference patches warped by the
 *    predicted pose, so that a template already looks as it will in the
 *    frame. Here a patch is only its stored P × P pixels (§5.7), so each of
 *    them is placed where the prediction puts it — the full homography per
 *    pixel, not its affine approximation at the centre — and it is the
 *    *frame* that is sampled there, bilinearly. The template is never
 *    resampled: it is exactly the stored data ({@link warpWindow}).
 * 2. **What is estimated.** A translation `d` of the whole warped window, in
 *    frame level-0 px; with `photometric`, also a gain and a bias, the frame
 *    being `gain · T + bias`. Rotation, scale and perspective come from the
 *    prediction and are not re-estimated: one small patch pins them down
 *    poorly, and the robust fit over every patch's translation does it
 *    (branch C). So the prediction must be close in rotation and scale:
 *    about 10° and 10% (align_patch_basin.test.ts).
 * 3. **How.** Inverse compositional Lucas–Kanade (Baker & Matthews, "Lucas-
 *    Kanade 20 Years On"): the template's steepest-descent images and the
 *    Hessian are built once per patch, and an iteration only samples the
 *    frame. Gain and bias by the simultaneous inverse compositional
 *    algorithm of the same series' Part 3, which for a translation keeps a
 *    once-built Hessian too ({@link alignmentSystem}).
 * 4. **Coarse to fine.** Start on the level where one patch pixel is one
 *    level pixel; then refine on the finest usable level, read through
 *    footprints that blur it as the pyramid would down to the patch's scale
 *    ({@link startLevel}, {@link footprint}).
 * 5. **The convergence test and the cap.** A level ends when a translation
 *    step is below `epsilon` in that level's px, or after `maxIterations`
 *    steps. `converged` is the finest level's, since the result is that
 *    level's estimate; `iterations` sums both levels. Measured on the clean
 *    suites at `epsilon` 0.01 px: a median of 4 iterations (95th percentile
 *    6) for matched patches, 5 (6) for magnified ones, and every one of 1152
 *    alignments from 2 px off converged within a cap of 30, at `σ` 1 and 2.
 *    `epsilon` is in the finest level's px, so for a magnified patch it is a
 *    finer tolerance in patch px (0.01 frame px is 0.005 patch px at
 *    `σ = 2`) — tight, but met. A step that moves the window out of the
 *    level being aligned fails `outside-frame`: the alignment's own estimate
 *    then puts the patch where that level cannot evaluate it.
 * 6. **Failures**, checked in the order the union declares them, every one
 *    before the iteration starts except `outside-frame` from a step and
 *    `singular` from a gain collapsing to 0 (a frame region with no
 *    contrast). No input reaches `levelScale`'s throw ({@link validPatch},
 *    {@link validPyramid}).
 *
 * **Assumptions** (format spec Q11, frame_pyramid.ts): the patch was cut
 * from a level `buildFramePyramid` built with `targetScaleStep`, and the
 * frame's pyramid comes from the same function, ideally with the same step,
 * so a patch and the frame level matching its scale are filtered alike. A
 * target compiled with another filter still aligns, with a blur mismatch
 * that biases the gain (align_patch_photometric.test.ts) and whose effect on
 * position is unmeasured.
 */
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

    const information = translationInformation(patch, options.photometric);
    if (!window.invertible || !(information >= MIN_EIGENVALUE)) return fail("singular");

    const system = alignmentSystem(window, patch, options.photometric);
    if (system === null) return fail("singular");

    // Inverse compositional Lucas–Kanade on a translation d (level-0 px) of
    // the whole warped window. The template is the patch's own pixels at their
    // predicted positions; its steepest-descent images, and so the Hessian,
    // do not depend on d or on the level, so they were computed once above.
    // Each iteration only samples the frame: E = I_l(s · (x + d)) − T,
    // Δd = H⁻¹ Σ SDᵀ E, and the inverse composition of a translation is
    // d ← d − Δd. The step is computed in level-0 px on every level — the
    // level's px scale cancels between SD and H — so a level only changes
    // which image is sampled.
    //
    // Coarse to fine is two levels: the start level (startLevel), then the
    // finest usable one, read through footprints when it is finer than the
    // patch (footprint). The levels in between are skipped: the footprint
    // already makes the finest level look like the start level, so visiting
    // them changed neither accuracy nor the basin, and cost iterations
    // (measured at σ = 2: median 8 iterations through every level, 5 with
    // the jump, errors and convergence rates equal to within 1%).
    const start = startLevel(usable, frameScales, window.scaleAtCentre);
    const values = new Float64Array(system.n);
    const b = new Float64Array(system.size);
    let dx = 0;
    let dy = 0;
    let gain = 1;
    let bias = 0;
    let iterations = 0;
    let converged = false;
    let level = start;
    for (const l of start === usable[0] ? [start] : [start, usable[0]]) {
        level = l;
        const fp = footprint(frame, frameScales, l, window);
        if (!inside(frame, frameScales, l, window, dx, dy, fp)) return fail("outside-frame");
        const img = frame.levels[l];
        const s = frameScales[l];
        converged = false;
        for (let it = 0; it < options.maxIterations; it++) {
            sampleFrame(img, s, window, dx, dy, fp, values);
            b.fill(0);
            for (let i = 0; i < system.n; i++) {
                const t = patch.pixels[patch.offset + i];
                const e = values[i] - gain * t - bias;
                b[0] += system.sx[i] * e;
                b[1] += system.sy[i] * e;
                if (system.size === 4) {
                    b[2] += t * e;
                    b[3] += e;
                }
            }
            solve(system, b);
            // The translation's steepest-descent images scale with the gain
            // (see alignmentSystem), so its step is H₀'s divided by it.
            const stepX = b[0] / gain;
            const stepY = b[1] / gain;
            dx -= stepX;
            dy -= stepY;
            iterations++;
            if (system.size === 4) {
                gain += b[2];
                bias += b[3];
                // The information left for the translation is gain² times
                // the patch's own: a frame region with no contrast drives the
                // gain to 0 and the system singular.
                if (!(gain > 0 && gain * gain * information >= MIN_EIGENVALUE)) {
                    return fail("singular");
                }
            }
            if (!inside(frame, frameScales, l, window, dx, dy, fp)) return fail("outside-frame");
            if (s * Math.sqrt(stepX * stepX + stepY * stepY) < options.epsilon) {
                converged = true;
                break;
            }
        }
    }
    return observation(q, centre, dx, dy, frame, frameScales, level, window, patch, {
        converged,
        iterations,
        gain,
        bias,
    });
};

/** The most points per axis a footprint is read with. */
const MAX_FOOTPRINT_POINTS = 16;

/**
 * How each patch pixel reads a level finer than the patch's own scale: a
 * separable, triangle-weighted grid of points around the pixel's predicted
 * position, in patch px along the patch's own axes.
 */
interface Footprint {
    readonly offsets: Float64Array;
    /** Sum to 1. */
    readonly weights: Float64Array;
    /** The triangle's half-width, patch px: how far a footprint reaches. */
    readonly halfWidth: number;
}

/**
 * How level `l` is read: `null` for one bilinear sample per patch pixel, or
 * a {@link Footprint} blurring the level to the patch's own scale.
 *
 * **Why levels finer than the patch need it.** The refinement goes down to
 * the finest usable level (types.ts), and for a patch seen larger than its
 * own scale, those levels are sharper than the patch: one patch pixel covers
 * `σ > 1` level pixels. Sampled one point per patch pixel, such a level is
 * aliased — the points are further apart than its pixels — and it holds
 * detail the patch lacks. Measured on 24 level-5 pinball patches seen at
 * twice their scale (`σ = 2` at level 0): point-sampled refinement from the
 * matched level down to level 0 left a median error of 0.12 px, a 95th
 * percentile of 0.82 px, and 18% of alignments failing from only 2 px off,
 * where stopping at the matched level gave 0.042 / 0.10 px and none.
 *
 * **What it emulates.** The patch was cut from a level this package's
 * pyramid built (Q11, frame_pyramid.ts), and the level of the frame's pyramid
 * matching it would have been built the same way, by the steps between
 * level `l` and the patch's scale. Each step adds `stepVariance(r)` source
 * px²; in patch px² those steps sum to
 * `stepVariance(r) · (1 − 1/σ²) / (r² − 1)`, and the footprint is a triangle
 * of that variance (half-width `√(6 · variance)`), sampled at most one level
 * pixel apart. Level `l` read this way looks like the matched level, at
 * level `l`'s resolution and without the cascade's rounding — so refining
 * there gains precision instead of losing it. Measured on the same patches:
 * median 0.010 px, worst 0.026 px, none failing from 2 px off — better
 * than stopping at the matched level (0.042 px); at `σ = 1.26`, a median of
 * 0.015 px against 0.043 point-sampled. A fixed one-pixel box footprint,
 * tried first, reached only 0.085 px at `σ = 2`: too sharp. Triangles of
 * fixed half-width 1 and 1.5 each did best at the `σ` whose variance above
 * they match (1.26 and 2), which is what chose this rule over a constant.
 *
 * **When.** Only where `σ > √r`. The start level is the one where `σ` is
 * closest to 1, within `√r` of it, so it is always point-sampled: a patch
 * whose level matches the frame's pays nothing, and a magnified one pays
 * `m²` samples per pixel, `m = ⌈2 · half-width · σ⌉` (at most
 * {@link MAX_FOOTPRINT_POINTS}), on the finest level only.
 */
function footprint(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    window: Window,
): Footprint | null {
    const sigma = window.scaleAtCentre * scales[l];
    const r = frame.scaleStep;
    if (!(sigma > Math.sqrt(r))) return null;
    const variance = (stepVariance(r) * (1 - 1 / (sigma * sigma))) / (r * r - 1);
    const halfWidth = Math.sqrt(6 * variance);
    const m = Math.min(MAX_FOOTPRINT_POINTS, Math.ceil(2 * halfWidth * sigma));
    const offsets = new Float64Array(m);
    const weights = new Float64Array(m);
    let sum = 0;
    for (let a = 0; a < m; a++) {
        offsets[a] = -halfWidth + ((a + 0.5) * 2 * halfWidth) / m;
        weights[a] = 1 - Math.abs(offsets[a]) / halfWidth;
        sum += weights[a];
    }
    for (let a = 0; a < m; a++) weights[a] /= sum;
    return { offsets, weights, halfWidth };
}

/**
 * Level `l`'s value for every patch pixel, the window moved by `(dx, dy)`
 * level-0 px, into `out`: one bilinear sample at the pixel's predicted
 * position, or its {@link Footprint}, taken as affine across the footprint.
 */
function sampleFrame(
    img: GrayImage,
    s: number,
    window: Window,
    dx: number,
    dy: number,
    fp: Footprint | null,
    out: Float64Array,
): void {
    const { data, width, height } = img;
    const n = out.length;
    if (fp === null) {
        for (let i = 0; i < n; i++) {
            out[i] = bilinear(data, width, height, s * (window.x[i] + dx), s * (window.y[i] + dy));
        }
        return;
    }
    const { offsets, weights } = fp;
    const m = offsets.length;
    for (let i = 0; i < n; i++) {
        const x = window.x[i] + dx;
        const y = window.y[i] + dy;
        let sum = 0;
        for (let b = 0; b < m; b++) {
            const bx = x + window.vx[i] * offsets[b];
            const by = y + window.vy[i] * offsets[b];
            let row = 0;
            for (let a = 0; a < m; a++) {
                const px = bx + window.ux[i] * offsets[a];
                const py = by + window.uy[i] * offsets[a];
                row += weights[a] * bilinear(data, width, height, s * px, s * py);
            }
            sum += weights[b] * row;
        }
        out[i] = sum;
    }
}

/**
 * The result for the window moved by `(dx, dy)`, its residual measured on
 * `level`. Every number is finite by construction; the guard is the rule's
 * backstop (types.ts rule 3), mapped to the one failure a numerical
 * breakdown can mean.
 */
function observation(
    q: number,
    centre: [number, number],
    dx: number,
    dy: number,
    frame: FramePyramid,
    scales: Float64Array,
    level: number,
    window: Window,
    patch: Patch,
    run: { converged: boolean; iterations: number; gain: number; bias: number },
): PatchAlignment {
    const x = centre[0] + dx;
    const y = centre[1] + dy;
    const { gain, bias } = run;
    const residual = residualAt(frame, scales, level, window, patch, dx, dy, gain, bias);
    const numbers = [x, y, residual, gain, bias];
    if (!numbers.every((v) => Number.isFinite(v))) return fail("singular");
    return {
        ok: true,
        observation: {
            index: q,
            x,
            y,
            residual,
            converged: run.converged,
            iterations: run.iterations,
            frameLevel: level,
            gain,
            bias,
        },
    };
}

/**
 * Where coarse-to-fine starts: the usable level on which one patch pixel is
 * closest to one level pixel (`σ` nearest 1 by ratio), ties going to the
 * coarser level.
 *
 * That is the level whose blur and resolution match the patch's (Q11): the
 * patch's basin is fixed in patch pixels there, and so in frame pixels it
 * grows with how magnified the patch is. Measured against the alternatives
 * (24 pinball patches, 3 views):
 *
 * - **The coarsest usable level** wrecked the basin of matched patches (69%
 *   converging from 1 px off, errors past 100 px): a sharp patch against a
 *   much blurrier level has no basin at all. Levels coarser than the patch's
 *   scale are never visited for that reason; a single patch holds no
 *   coarser content to align them with.
 * - **Level 0**, read through footprints ({@link footprint}) from the first
 *   iteration, is nearly as good for a patch seen at twice its scale — the
 *   footprint does the real work — but slightly narrower (61% vs 65%
 *   converging from 12 px off, 35% vs 40% from 16 px), and every iteration
 *   pays the footprint's `m²` samples per pixel, where starting here the
 *   first iterations take one.
 */
function startLevel(usable: number[], scales: Float64Array, scaleAtCentre: number): number {
    let best = usable[0];
    let bestCost = Infinity;
    for (const l of usable) {
        const sigma = scaleAtCentre * scales[l];
        const cost = sigma >= 1 ? sigma : 1 / sigma;
        if (cost <= bestCost) {
            best = l;
            bestCost = cost;
        }
    }
    return best;
}

/**
 * The inverse-compositional system, in frame level-0 px: the translation's
 * steepest-descent images and the Gauss–Newton Hessian's inverse, 2 × 2, or
 * 4 × 4 with gain and bias.
 */
interface AlignmentSystem {
    readonly n: number;
    /** 2, or 4 with gain and bias. */
    readonly size: 2 | 4;
    /** Steepest-descent images of the translation: the template gradient per frame level-0 px. */
    readonly sx: Float64Array;
    readonly sy: Float64Array;
    /** `H₀⁻¹` for size 2, row-major; `H₀`'s Cholesky factor `L` for size 4. */
    readonly factor: Float64Array;
}

/**
 * The template gradient carried into frame coordinates, `SD = g · J⁻¹` per
 * sample (`g` the patch gradient, grey levels per patch px; `J` the
 * prediction's Jacobian from patch px to frame level-0 px there), and the
 * Hessian `H₀ = Σ cᵀ c` over the columns `c = [SDx, SDy]`, or
 * `[SDx, SDy, T, 1]` with gain and bias. `null` if `H₀` is not positive
 * definite.
 *
 * **Gain and bias** follow the simultaneous inverse compositional
 * algorithm of Baker, Gross and Matthews ("Lucas-Kanade 20 Years On",
 * Part 3, linear appearance variation) with the appearance basis `{T, 1}`:
 * the model is `I(x + d) ≈ gain · T(x) + bias`, and each iteration solves
 * for `(Δd, Δgain, Δbias)` together, then updates `d ← d − Δd` (inverse
 * composition) and gain and bias additively. In general that algorithm's
 * Hessian depends on the appearance parameters and must be rebuilt every
 * iteration — its cost. Here the only dependence is that the translation's
 * steepest-descent images are `gain · SD` (the basis image `T` shares `T`'s
 * gradient, and `1` has none), so the Hessian is `D · H₀ · D` with
 * `D = diag(gain, gain, 1, 1)`: `H₀` is factored once, and the translation's
 * step is `H₀`'s divided by the gain. The inverse compositional property —
 * no per-iteration Hessian — survives the photometric extension.
 */
function alignmentSystem(
    window: Window,
    patch: Patch,
    photometric: boolean,
): AlignmentSystem | null {
    const { P, pixels, offset, scale } = patch;
    const n = P * P;
    const size = photometric ? 4 : 2;
    const sx = new Float64Array(n);
    const sy = new Float64Array(n);
    const H = new Float64Array(size * size);
    for (let i = 0; i < P; i++) {
        for (let j = 0; j < P; j++) {
            const k = i * P + j;
            const [gx, gy] = gradient(pixels, offset, P, i, j);
            // J = J_H / scale, so J⁻¹ = scale · J_H⁻¹.
            const a = window.ja[k];
            const b = window.jb[k];
            const c = window.jc[k];
            const d = window.jd[k];
            const f = scale / (a * d - b * c);
            sx[k] = f * (gx * d - gy * c);
            sy[k] = f * (gy * a - gx * b);
            const col = photometric ? [sx[k], sy[k], pixels[offset + k], 1] : [sx[k], sy[k]];
            for (let r = 0; r < size; r++) {
                for (let q = 0; q <= r; q++) H[r * size + q] += col[r] * col[q];
            }
        }
    }
    if (size === 2) {
        const [h00, , h01, h11] = H;
        const det = h00 * h11 - h01 * h01;
        if (!(Number.isFinite(det) && det > 0)) return null;
        return {
            n,
            size,
            sx,
            sy,
            factor: Float64Array.from([h11 / det, -h01 / det, -h01 / det, h00 / det]),
        };
    }
    const L = cholesky(H, size);
    return L === null ? null : { n, size, sx, sy, factor: L };
}

/** `b ← H₀⁻¹ b`, in place. */
function solve(system: AlignmentSystem, b: Float64Array): void {
    const f = system.factor;
    if (system.size === 2) {
        const b0 = b[0];
        const b1 = b[1];
        b[0] = f[0] * b0 + f[1] * b1;
        b[1] = f[2] * b0 + f[3] * b1;
        return;
    }
    const n = system.size;
    for (let r = 0; r < n; r++) {
        let v = b[r];
        for (let q = 0; q < r; q++) v -= f[r * n + q] * b[q];
        b[r] = v / f[r * n + r];
    }
    for (let r = n - 1; r >= 0; r--) {
        let v = b[r];
        for (let q = r + 1; q < n; q++) v -= f[q * n + r] * b[q];
        b[r] = v / f[r * n + r];
    }
}

/**
 * The lower Cholesky factor of the symmetric `n × n` matrix whose lower
 * triangle `A` holds (row-major), or `null` unless it is positive definite
 * with finite entries.
 */
function cholesky(A: Float64Array, n: number): Float64Array | null {
    const L = new Float64Array(n * n);
    for (let r = 0; r < n; r++) {
        for (let q = 0; q <= r; q++) {
            let v = A[r * n + q];
            for (let k = 0; k < q; k++) v -= L[r * n + k] * L[q * n + k];
            if (r === q) {
                if (!(Number.isFinite(v) && v > 0)) return null;
                L[r * n + r] = Math.sqrt(v);
            } else {
                L[r * n + q] = v / L[q * n + q];
            }
        }
    }
    return L;
}

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
     * The prediction's Jacobian at each sample, frame level-0 px per target
     * level-0 px: `[[ja, jb], [jc, jd]] = ∂(x, y) / ∂(X, Y)`.
     */
    readonly ja: Float64Array;
    readonly jb: Float64Array;
    readonly jc: Float64Array;
    readonly jd: Float64Array;
    /**
     * The footprint of each patch pixel: frame level-0 px per patch px along
     * the patch's columns (`u`) and rows (`v`), i.e. `J` divided by the
     * patch's level scale.
     */
    readonly ux: Float64Array;
    readonly uy: Float64Array;
    readonly vx: Float64Array;
    readonly vy: Float64Array;
    /**
     * How far one patch px of footprint reaches, at most, level-0 px:
     * `max |ux| + |vx|` and `max |uy| + |vy|` over the samples.
     */
    readonly spanX: number;
    readonly spanY: number;
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
    const ja = new Float64Array(n);
    const jb = new Float64Array(n);
    const jc = new Float64Array(n);
    const jd = new Float64Array(n);
    const ux = new Float64Array(n);
    const uy = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    let spanX = 0;
    let spanY = 0;
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
            const J = jacobian(H, X, Y, p[0], p[1]);
            [ja[k], jb[k], jc[k], jd[k]] = J;
            ux[k] = J[0] / scale;
            uy[k] = J[2] / scale;
            vx[k] = J[1] / scale;
            vy[k] = J[3] / scale;
            spanX = Math.max(spanX, Math.abs(ux[k]) + Math.abs(vx[k]));
            spanY = Math.max(spanY, Math.abs(uy[k]) + Math.abs(vy[k]));
            const det = J[0] * J[3] - J[1] * J[2];
            if (!(Number.isFinite(det) && det !== 0)) invertible = false;
        }
    }
    const c = project(H, patch.centreX, patch.centreY);
    let centreDet = 0;
    if (c !== null) {
        const J = jacobian(H, patch.centreX, patch.centreY, c[0], c[1]);
        centreDet = J[0] * J[3] - J[1] * J[2];
    }
    // J is per target level-0 px; one patch px is 1 / scale of those.
    const scaleAtCentre = Math.sqrt(Math.abs(centreDet)) / scale;
    return {
        x,
        y,
        minX,
        maxX,
        minY,
        maxY,
        ja,
        jb,
        jc,
        jd,
        ux,
        uy,
        vx,
        vy,
        spanX,
        spanY,
        invertible,
        scaleAtCentre,
    };
}

/**
 * `∂(x, y)/∂(X, Y)` of `H` at target `(X, Y)`, which it maps to `(x, y)`,
 * row-major: `[∂x/∂X, ∂x/∂Y, ∂y/∂X, ∂y/∂Y]`.
 */
function jacobian(
    H: Mat3,
    X: number,
    Y: number,
    x: number,
    y: number,
): [number, number, number, number] {
    const w = H[6] * X + H[7] * Y + H[8];
    return [
        (H[0] - H[6] * x) / w,
        (H[1] - H[7] * x) / w,
        (H[3] - H[6] * y) / w,
        (H[4] - H[7] * y) / w,
    ];
}

/**
 * The levels on which the whole window can be sampled, finest first.
 *
 * A level is usable when every point the warped P × P window reads lies in
 * `[0, w − 1] × [0, h − 1]` of that level: bilinear interpolation reads the
 * pixel to the right of and below each point, so a point on the last column
 * or row is allowed and nothing beyond. The points are the samples
 * themselves, or on a level read through footprints ({@link footprint})
 * everything those reach. The alignment is inverse compositional, so it reads no frame
 * gradients and needs no other border.
 */
function usableLevels(frame: FramePyramid, scales: Float64Array, window: Window): number[] {
    const out: number[] = [];
    for (let l = 0; l < frame.levels.length; l++) {
        if (inside(frame, scales, l, window, 0, 0, footprint(frame, scales, l, window))) {
            out.push(l);
        }
    }
    return out;
}

/**
 * Whether everything the window reads, moved by `(dx, dy)` level-0 px, lies
 * inside level `l` when each patch pixel is read through `fp`.
 */
function inside(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    window: Window,
    dx: number,
    dy: number,
    fp: Footprint | null,
): boolean {
    const { width, height } = frame.levels[l];
    if (width < 2 || height < 2) return false;
    const s = scales[l];
    const rx = fp === null ? 0 : fp.halfWidth * window.spanX;
    const ry = fp === null ? 0 : fp.halfWidth * window.spanY;
    return (
        s * (window.minX + dx - rx) >= 0 &&
        s * (window.maxX + dx + rx) <= width - 1 &&
        s * (window.minY + dy - ry) >= 0 &&
        s * (window.maxY + dy + ry) <= height - 1
    );
}

/**
 * How well the patch pins down a translation: the smallest eigenvalue of
 * the gradient structure tensor `Σ g gᵀ` (patch px, gain 1), and with
 * photometric compensation that of its Schur complement once gain and bias
 * are projected out — the information left for the translation when they
 * are estimated too. 0 when the patch's intensities are too uniform for a
 * gain and a bias to be told apart.
 */
function translationInformation(patch: Patch, photometric: boolean): number {
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
    if (!photometric) return minEigenvalue(gxx, gxy, gyy);
    const n = P * P;
    // M_aa = [[ΣT², ΣT], [ΣT, n]]; its determinant is n · Σ(T − T̄)².
    const det = n * sTT - sT * sT;
    if (!(det / n >= MIN_EIGENVALUE)) return 0;
    // S = M_pp − M_pa · M_aa⁻¹ · M_ap, with M_pa = [[ΣgxT, Σgx], [ΣgyT, Σgy]].
    const i00 = n / det;
    const i01 = -sT / det;
    const i11 = sTT / det;
    const qf = (ua: number, ub: number, va: number, vb: number) =>
        ua * (i00 * va + i01 * vb) + ub * (i01 * va + i11 * vb);
    const sxx = gxx - qf(gxT, gx1, gxT, gx1);
    const sxy = gxy - qf(gxT, gx1, gyT, gy1);
    const syy = gyy - qf(gyT, gy1, gyT, gy1);
    return minEigenvalue(sxx, sxy, syy);
}

/**
 * The patch's intensity gradient at pixel `(i, j)`, grey levels per patch
 * px: central differences inside, one-sided on the border rows and columns.
 *
 * **Why every pixel, border included.** A stored patch has no pixels around
 * it, so central differences exist only on its `(P − 2)²` interior; the
 * alternative to one-sided border gradients is to align on the interior
 * alone. Measured on the clean-warp suite (24 level-3 pinball patches,
 * 3 views, matched at frame level 0): with `P = 8`, all 64 pixels give a
 * median error of 0.022 px (worst 0.063) and converge from 4 px off 89% of
 * the time; the 36-pixel interior gives 0.029 px (worst 0.108) and 81%. The
 * ordering holds at `P = 12` (0.014 vs 0.020 px; 91% vs 89%). The border's
 * cruder gradient costs less than the information it adds.
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

/**
 * RMS intensity difference between the patch, after gain and bias, and
 * level `l` over the P × P window, the level read the way the alignment
 * reads it there.
 */
function residualAt(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    window: Window,
    patch: Patch,
    dx: number,
    dy: number,
    gain: number,
    bias: number,
): number {
    const n = patch.P * patch.P;
    const values = new Float64Array(n);
    const fp = footprint(frame, scales, l, window);
    sampleFrame(frame.levels[l], scales[l], window, dx, dy, fp, values);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const r = values[i] - gain * patch.pixels[patch.offset + i] - bias;
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
