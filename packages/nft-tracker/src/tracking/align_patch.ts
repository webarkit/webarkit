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
 *    resampled: it is exactly the stored data ({@link warpPatch}).
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
 *    frame. Gain and bias, when estimated, in two phases
 *    ({@link alignmentSystem}): until the translation first converges — on
 *    the start level, as a rule — they are matched to the sampled window's
 *    mean and spread while the translation takes the reduced (variable
 *    projection) step; from then on, the refinement level included, they
 *    are estimated with the translation by least squares, by the
 *    simultaneous inverse compositional algorithm of the same series' Part
 *    3, which for a translation keeps a once-built Hessian too. The
 *    refinement level starts inside that phase's basin, and matching moments
 *    again there only cost iterations (align_patch_basin.test.ts). Least
 *    squares from the first iteration, that
 *    algorithm alone, halved the basin — from 3 px off, 46% converged
 *    against 96% (align_patch_photometric.test.ts) — because a window that
 *    far off matches the patch poorly: the fitted gain collapses towards 0,
 *    and the translation's step, divided by it, overshoots. A window's
 *    spread does not collapse on textured content, and the final estimate is
 *    still the least-squares one.
 * 4. **Coarse to fine.** Start on the level where one patch pixel is one
 *    level pixel; then refine on the finest level usable at the estimate
 *    that start reached, read through footprints that blur it as the pyramid
 *    would down to the patch's scale ({@link startLevel},
 *    {@link finestUsable}, {@link footprint}).
 * 5. **The convergence test and the cap.** A level ends when a translation
 *    step is below `epsilon` in that level's px, or after `maxIterations`
 *    steps. `converged` is the finest level's, since the result is that
 *    level's estimate; `iterations` sums both levels. Measured on the clean
 *    suites at `epsilon` 0.01 px, from 1 px off: a median of 4 iterations
 *    (95th percentile 6) for matched patches, 5 (6) for magnified ones; and
 *    every one of 1152 alignments from 2 px off converged within a cap of
 *    30, at `σ` 1 and 2 (align_patch_basin.test.ts).
 *    With gain and bias, the start level converges twice, under matched
 *    moments and then jointly: from 1 px off, a median of 5 iterations (95th
 *    percentile 6) for matched patches (align_patch_photometric.test.ts), 7
 *    (8) for magnified ones (align_patch_basin.test.ts). So converging with
 *    them takes at least two iterations, and a cap of 1 never reports
 *    `converged`.
 *    `epsilon` is in the finest level's px, so for a magnified patch it is a
 *    finer tolerance in patch px (0.01 frame px is 0.005 patch px at
 *    `σ = 2`) — tight, but met. A step that would take the window out of the
 *    level being aligned is halved until it stays in, and the level ends,
 *    unconverged, when not even 1/1024 of it does. Convergence is still
 *    judged on the full step: against an edge the truth lies beyond, the full
 *    step keeps pointing out and the result says `converged: false`, where
 *    judging the shortened step reported a window stopped 2 px short of the
 *    truth as converged (align_patch.test.ts).
 * 6. **Failures**, checked in the order the union declares them, every one
 *    before the iteration starts except `singular` from a gain collapsing to
 *    0. `outside-frame` is exactly types.ts's "no frame level is usable", at
 *    the prediction: an estimate that later reaches an edge shortens its
 *    steps (point 5) instead of failing. No input reaches `levelScale`'s
 *    throw ({@link validPatch}, {@link validPyramid}). With gain and bias
 *    estimated, `singular` is also how many alignments that lose their patch
 *    end: the moment phase converges where the patch does not match, and the
 *    least-squares gain collapses there, or the window is flat and the
 *    matched moments fail themselves. In the photometric suite, 346 of 6144
 *    alignments from 3 to 8 px off ended so: none from 3 px, 149 of 1536
 *    from 8. So a tracker should read `singular` as a per-frame outcome, not
 *    as a property of the patch. The other lost alignments end unconverged,
 *    or converged in the wrong place, as any local method's can. The robust
 *    fit (branch C) sees only positions, so a caller that wants those out
 *    before it has the residual to filter on: cleanly where the patch is no
 *    sharper than the frame — for the suite's level-3 patches,
 *    `residual / gain` is at most 3.8 grey levels when right and at least
 *    6.1 when wrong — but not where it is: at level 0 the two overlap. Any
 *    threshold depends on the target (align_patch_photometric.test.ts).
 *
 * **Assumptions** (format spec Q11, frame_pyramid.ts): the patch was cut
 * from a level `buildFramePyramid` built with `targetScaleStep` — as
 * `compile-target` does — and the frame's pyramid comes from the same
 * function, ideally with the same step, so a patch and a frame level equally
 * deep are filtered alike.
 * They are rarely read at equal depth: a patch is aligned on the frame
 * level nearest its scale, usually a shallower one, and the frame carries
 * the camera's blur besides. That difference biases the gain and the
 * residual, and the position little: a median error of 0.016 to 0.042 px
 * across patch levels 0 to 5, with the longest tail at level 0, the
 * sharpest (95th percentile 0.28 px; align_patch_accuracy.test.ts). A
 * footprint at `σ ≈ 1` could take the pyramid's share of it out, at a
 * footprint's cost in samples, and is not used. A target compiled with
 * another filter adds to the difference, unseen.
 */
export const alignPatch: AlignPatch = (frame, patches, q, targetScaleStep, prediction, options) => {
    if (!validOptions(options)) return fail("invalid-options");
    const frameScales = validPyramid(frame);
    if (frameScales === null) return fail("invalid-pyramid");
    const prepared = preparePatch(patches, q, targetScaleStep, prediction);
    if (!prepared.ok) return prepared;
    return alignWarped(frame, frameScales, prepared, options);
};

/**
 * Patch `q`, validated, and its window warped by the prediction — everything
 * {@link alignPatch} computes before it looks at the frame — or the failure
 * `alignPatch` would report for it.
 */
export type PreparedPatch =
    | {
          readonly ok: true;
          readonly q: number;
          readonly patch: Patch;
          readonly centre: [number, number];
          readonly warped: Warped;
      }
    | {
          readonly ok: false;
          readonly reason: "invalid-patch" | "non-finite-prediction" | "outside-frame";
      };

/**
 * The first half of {@link alignPatch}, for a caller that needs the warped
 * window before it has a pyramid to align in: `trackFrame` sizes the frame's
 * pyramid by where each window can be read ({@link alignmentStart}), then
 * aligns the same prepared patches ({@link alignPrepared}), so each window is
 * warped once a frame. Warping it twice would cost about 19 µs a patch in
 * Node here, allocation included, of the 65 µs its alignment takes on the
 * camera path.
 */
export function preparePatch(
    patches: PatchTable,
    q: number,
    targetScaleStep: number,
    prediction: Mat3,
): PreparedPatch {
    const patch = validPatch(patches, q, targetScaleStep);
    if (patch === null) return { ok: false, reason: "invalid-patch" };
    const H = normalised(prediction);
    if (H === null) return { ok: false, reason: "non-finite-prediction" };
    const centre = project(H, patch.centreX, patch.centreY);
    if (centre === null) return { ok: false, reason: "non-finite-prediction" };
    const warped = warpPatch(H, patch);
    if (warped === null) return { ok: false, reason: "outside-frame" };
    return { ok: true, q, patch, centre, warped };
}

/**
 * The second half of {@link alignPatch}: `alignPatch(frame, patches, q,
 * step, prediction, options)` is `alignPrepared(frame, preparePatch(patches,
 * q, step, prediction), options)`, result for result, but for which of two
 * invalid inputs a failure names.
 */
export function alignPrepared(
    frame: FramePyramid,
    prepared: Extract<PreparedPatch, { ok: true }>,
    options: AlignPatchOptions,
): PatchAlignment {
    if (!validOptions(options)) return fail("invalid-options");
    const frameScales = validPyramid(frame);
    if (frameScales === null) return fail("invalid-pyramid");
    return alignWarped(frame, frameScales, prepared, options);
}

function alignWarped(
    frame: FramePyramid,
    frameScales: Float64Array,
    prepared: Extract<PreparedPatch, { ok: true }>,
    options: AlignPatchOptions,
): PatchAlignment {
    const { q, patch, centre, warped } = prepared;
    const usable = usableLevels(frame, frameScales, warped);
    if (usable.length === 0) return fail("outside-frame");

    const information = translationInformation(patch, options.photometric);
    if (!warped.invertible || !(information >= MIN_EIGENVALUE)) return fail("singular");

    const system = alignmentSystem(warped, patch, options.photometric);
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
    // finest one usable at the estimate the start level reached
    // (finestUsable), read through footprints when it is finer than the
    // patch (footprint). The levels in between are skipped: the footprint
    // already makes the finest level look like the start level, so visiting
    // them changed neither accuracy nor the basin, and cost iterations
    // (measured at σ = 2: median 8 iterations through every level, 5 with
    // the jump, errors and convergence rates equal to within 1%).
    const start = startLevel(usable, frameScales, warped.scaleAtCentre);
    const values = new Float64Array(system.n);
    const b = new Float64Array(system.size);
    let dx = 0;
    let dy = 0;
    let gain = 1;
    let bias = 0;
    let iterations = 0;
    let converged = false;
    let level = start;
    // With gain and bias, they are matched to the window's moments while the
    // translation alone is stepped, until it first converges, and estimated
    // with it by least squares from then on, the refinement level included
    // (alignmentSystem).
    let matching = system.size === 4;
    for (let pass = 0; pass < 2; pass++) {
        // Pass 0 aligns on the start level, which holds the window at the
        // prediction (it is usable). Pass 1 refines on the finest level that
        // holds it at the estimate pass 0 reached. Near a frame edge there
        // may be none finer than the start level, since a finer level is read
        // through footprints that reach further than points; the result is
        // then the start level's.
        let l = start;
        if (pass === 1) {
            l = finestUsable(frame, frameScales, warped, dx, dy, start);
            if (l < 0) break;
        }
        level = l;
        const fp = footprint(frame, frameScales, l, warped);
        const reach = fp === null ? 0 : fp.halfWidth;
        const img = frame.levels[l];
        const s = frameScales[l];
        converged = false;
        for (let it = 0; it < options.maxIterations; it++) {
            sampleFrame(img, s, warped, dx, dy, fp, values);
            if (matching) {
                // The gain and bias that give the template the window's mean
                // and spread. templateSpread > 0: a patch without spread has
                // no information, and was found singular above.
                let sum = 0;
                for (let i = 0; i < system.n; i++) sum += values[i];
                const mean = sum / system.n;
                let spread = 0;
                for (let i = 0; i < system.n; i++) {
                    const v = values[i] - mean;
                    spread += v * v;
                }
                gain = Math.sqrt(spread / system.templateSpread);
                bias = mean - gain * system.templateMean;
                if (!(gain > 0 && gain * gain * information >= MIN_EIGENVALUE)) {
                    return fail("singular");
                }
            }
            const joint = system.size === 4 && !matching;
            b.fill(0);
            for (let i = 0; i < system.n; i++) {
                const t = patch.pixels[patch.offset + i];
                const e = values[i] - gain * t - bias;
                b[0] += system.sx[i] * e;
                b[1] += system.sy[i] * e;
                if (joint) {
                    b[2] += t * e;
                    b[3] += e;
                }
            }
            // While matching, b's gain and bias rows are 0 and their part of
            // the solution is discarded. What is left is the translation step
            // of the reduced (variable projection) problem: the inverse of
            // H₀'s Schur complement on the translation, applied to its gradient.
            solve(system, b);
            // The translation's steepest-descent images scale with the gain
            // (see alignmentSystem), so its step is H₀'s divided by it.
            const stepX = b[0] / gain;
            const stepY = b[1] / gain;
            iterations++;
            // A step that would take the window out of this level is
            // shortened, halving, until it stays in: "outside-frame" means no
            // level can hold the window (types.ts), and the level still holds
            // it here. If not even 1/1024 of the step fits, the estimate is on
            // the level's edge already: the level ends there, unconverged.
            let f = 1;
            while (!inside(frame, frameScales, l, warped, dx - f * stepX, dy - f * stepY, reach)) {
                f /= 2;
                if (f < 1 / 1024) break;
            }
            if (f < 1 / 1024) break;
            const nextGain = joint ? gain + f * b[2] : gain;
            const nextBias = joint ? bias + f * b[3] : bias;
            // The information left for the translation is gain² times the
            // patch's own: a frame region with no contrast drives the gain to
            // 0 and the system singular.
            if (!(nextGain > 0 && nextGain * nextGain * information >= MIN_EIGENVALUE)) {
                return fail("singular");
            }
            dx -= f * stepX;
            dy -= f * stepY;
            gain = nextGain;
            bias = nextBias;
            // Judged on the full step, as the contract words it: shortening
            // cannot fake convergence at an edge the truth lies beyond, where
            // the full step keeps pointing out; a truth on the edge itself
            // still converges, its full steps shrinking to nothing.
            if (s * Math.sqrt(stepX * stepX + stepY * stepY) < options.epsilon) {
                if (matching) {
                    // Aligned under matched moments: the level goes on, now
                    // estimating gain and bias by least squares.
                    matching = false;
                    continue;
                }
                converged = true;
                break;
            }
        }
    }
    return observation(q, centre, dx, dy, frame, frameScales, level, warped, patch, values, {
        converged,
        iterations,
        gain,
        bias,
    });
}

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
 * pixel apart up to {@link MAX_FOOTPRINT_POINTS} points per axis — a cap that
 * binds above `σ ≈ 4.7` at a `∛2` step, spreading the points to 1.7 level px
 * at `σ = 8`. Level `l` read this way looks like the matched level, at
 * level `l`'s resolution and without the cascade's rounding — so refining
 * there gains precision instead of losing it. Measured on the same patches:
 * median 0.010 px, worst 0.026 px, none failing from 2 px off — better
 * than stopping at the matched level (0.042 px); at `σ = 1.26`, a median of
 * 0.015 px against 0.043 point-sampled. A fixed one-pixel box footprint,
 * tried first, reached only 0.085 px at `σ = 2`: too sharp. Triangles of
 * fixed half-width 1 and 1.5 each did best at the `σ` whose variance above
 * they match (1.26 and 2), which is what chose this rule over a constant.
 *
 * **When.** Only where `σ > √r`. The start level is the usable one where
 * `σ` is closest to 1, which is within `√r` of it when the pyramid is deep
 * enough and that level can hold the window; then it is point-sampled, a
 * patch whose level matches the frame's pays nothing, and a magnified one
 * pays `m²` samples per pixel, `m = ⌈2 · half-width · σ⌉` (at most
 * {@link MAX_FOOTPRINT_POINTS}), on the refinement level only. In a pyramid
 * too shallow for the patch's scale, or near an edge that rules that level
 * out, the start level is read through footprints too.
 */
function footprint(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    warped: Warped,
): Footprint | null {
    const halfWidth = footprintHalfWidth(frame, scales, l, warped);
    if (halfWidth === 0) return null;
    const sigma = warped.scaleAtCentre * scales[l];
    const m = Math.min(MAX_FOOTPRINT_POINTS, Math.ceil(2 * halfWidth * sigma));
    const grid = new Float64Array(2 * m);
    const offsets = grid.subarray(0, m);
    const weights = grid.subarray(m);
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
 * The half-width, patch px, of the {@link footprint} level `l` is read
 * through, or 0 where it is point-sampled — which a footprint never is, its
 * variance being positive whenever `σ > √r > 1`. Allocates nothing, so the
 * usability of every level can be decided before any is read.
 */
function footprintHalfWidth(
    frame: PyramidShape,
    scales: Float64Array,
    l: number,
    warped: Warped,
): number {
    const sigma = warped.scaleAtCentre * scales[l];
    const r = frame.scaleStep;
    if (!(sigma > Math.sqrt(r))) return 0;
    const variance = (stepVariance(r) * (1 - 1 / (sigma * sigma))) / (r * r - 1);
    return Math.sqrt(6 * variance);
}

/**
 * Level `l`'s value for every patch pixel, the window moved by `(dx, dy)`
 * level-0 px, into `out`: one bilinear sample at the pixel's predicted
 * position, or its {@link Footprint}, taken as affine across the footprint.
 */
function sampleFrame(
    img: GrayImage,
    s: number,
    warped: Warped,
    dx: number,
    dy: number,
    fp: Footprint | null,
    out: Float64Array,
): void {
    const { data, width, height } = img;
    const n = out.length;
    if (fp === null) {
        for (let i = 0; i < n; i++) {
            out[i] = bilinear(data, width, height, s * (warped.x[i] + dx), s * (warped.y[i] + dy));
        }
        return;
    }
    const { offsets, weights } = fp;
    const m = offsets.length;
    for (let i = 0; i < n; i++) {
        const x = warped.x[i] + dx;
        const y = warped.y[i] + dy;
        let sum = 0;
        for (let b = 0; b < m; b++) {
            const bx = x + warped.vx[i] * offsets[b];
            const by = y + warped.vy[i] * offsets[b];
            let row = 0;
            for (let a = 0; a < m; a++) {
                const px = bx + warped.ux[i] * offsets[a];
                const py = by + warped.uy[i] * offsets[a];
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
    warped: Warped,
    patch: Patch,
    values: Float64Array,
    run: { converged: boolean; iterations: number; gain: number; bias: number },
): PatchAlignment {
    const x = centre[0] + dx;
    const y = centre[1] + dy;
    const { gain, bias } = run;
    const residual = residualAt(frame, scales, level, warped, patch, dx, dy, gain, bias, values);
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
 * That is the level whose resolution matches the patch's (and its blur, when
 * the two are equally deep: Q11, frame_pyramid.ts): the patch's basin is
 * fixed in patch pixels there, and so in frame pixels it grows with how
 * magnified the patch is.
 *
 * Exported so `frameLevelsFor` (frame_levels.ts) builds a frame pyramid
 * exactly as deep as this rule will start on, from one source of truth.
 *
 * Measured against the alternatives (24 pinball patches, 3 views):
 *
 * - **The coarsest usable level** wrecked the basin of matched patches (69%
 *   converging from 1 px off, errors past 100 px): a sharp patch against a
 *   much blurrier level has no basin at all. So coarse to fine never goes
 *   above the start level, which is coarser than the patch's scale by at
 *   most `√r` unless even level 0 is (a patch seen smaller than its scale):
 *   a single patch holds no coarser content to align with.
 * - **Level 0**, read through footprints ({@link footprint}) from the first
 *   iteration, is nearly as good for a patch seen at twice its scale — the
 *   footprint does the real work — but slightly narrower (61% vs 65%
 *   converging from 12 px off, 35% vs 40% from 16 px), and every iteration
 *   pays the footprint's `m²` samples per pixel, where starting here the
 *   first iterations take one.
 */
export function startLevel(usable: number[], scales: Float64Array, scaleAtCentre: number): number {
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
 * What decides which levels of a pyramid can hold a window: its step and
 * each level's size, not its pixels. A {@link FramePyramid} is one.
 */
export interface PyramidShape {
    readonly scaleStep: number;
    readonly levels: readonly { readonly width: number; readonly height: number }[];
}

/**
 * The frame level {@link alignPrepared} starts a prepared patch on, in a
 * pyramid of this shape with these level scales, or −1 if no level holds its
 * window. The same two steps `alignPatch` takes to choose it ({@link
 * usableLevels}, then {@link startLevel}), reading no pixel, so a caller can
 * size a pyramid by the rule that will read it (`frameLevelsFor`). A patch
 * `alignPatch` would then refuse as singular still gets its level.
 */
export function alignmentStart(
    shape: PyramidShape,
    scales: Float64Array,
    prepared: Extract<PreparedPatch, { ok: true }>,
): number {
    const usable = usableLevels(shape, scales, prepared.warped);
    return usable.length === 0 ? -1 : startLevel(usable, scales, prepared.warped.scaleAtCentre);
}

/**
 * The finest level below `below` that holds everything the window reads
 * once moved by `(dx, dy)` level-0 px, or −1 if none does.
 */
function finestUsable(
    frame: FramePyramid,
    scales: Float64Array,
    warped: Warped,
    dx: number,
    dy: number,
    below: number,
): number {
    for (let l = 0; l < below; l++) {
        if (
            inside(frame, scales, l, warped, dx, dy, footprintHalfWidth(frame, scales, l, warped))
        ) {
            return l;
        }
    }
    return -1;
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
    /** With gain and bias: the template's mean, and its sum of squared deviations from it. */
    readonly templateMean: number;
    readonly templateSpread: number;
}

/**
 * The template gradient carried into frame coordinates, `SD = g · J⁻¹` per
 * sample (`g` the patch gradient, grey levels per patch px; `J` the
 * prediction's Jacobian from patch px to frame level-0 px there), and the
 * Hessian `H₀ = Σ cᵀ c` over the columns `c = [SDx, SDy]`, or
 * `[SDx, SDy, T, 1]` with gain and bias. `null` if `H₀` is not positive
 * definite.
 *
 * **Gain and bias** are estimated in two phases (point 3 of
 * {@link alignPatch}): the first until the translation first converges, the
 * second from then on. The second is the simultaneous inverse compositional
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
 *
 * The first phase uses the same factor. Each iteration sets gain and bias
 * so that the template's mean and spread (`templateMean`, `templateSpread`)
 * become the window's, and steps the translation by the translation part of
 * `H₀⁻¹` applied to the translation's gradient alone: the Gauss–Newton step
 * of the reduced problem in which gain and bias are eliminated (variable
 * projection, Golub and Pereyra), with the matched moments standing in for
 * the least-squares values that a misaligned window drives to 0. Stepping
 * with the translation block of `H₀` instead, which ignores how the window's
 * mean moves with the translation, converged as far but crept: on a synthetic
 * sinusoid, some alignments from 1.8 px off took up to 51 iterations.
 */
function alignmentSystem(
    warped: Warped,
    patch: Patch,
    photometric: boolean,
): AlignmentSystem | null {
    const { P, pixels, offset, scale } = patch;
    const n = P * P;
    const size = photometric ? 4 : 2;
    const work = new Float64Array(2 * n + 32);
    const sx = work.subarray(0, n);
    const sy = work.subarray(n, 2 * n);
    // H₀'s lower triangle, over the columns [SDx, SDy, T, 1].
    let h00 = 0;
    let h10 = 0;
    let h11 = 0;
    let h20 = 0;
    let h21 = 0;
    let h22 = 0;
    let h30 = 0;
    let h31 = 0;
    let h32 = 0;
    let h33 = 0;
    for (let i = 0; i < P; i++) {
        for (let j = 0; j < P; j++) {
            const k = i * P + j;
            const gx = gradientX(pixels, offset, P, i, j);
            const gy = gradientY(pixels, offset, P, i, j);
            // J = J_H / scale, so J⁻¹ = scale · J_H⁻¹.
            const a = warped.ja[k];
            const b = warped.jb[k];
            const c = warped.jc[k];
            const d = warped.jd[k];
            const f = scale / (a * d - b * c);
            const sxk = f * (gx * d - gy * c);
            const syk = f * (gy * a - gx * b);
            sx[k] = sxk;
            sy[k] = syk;
            h00 += sxk * sxk;
            h10 += syk * sxk;
            h11 += syk * syk;
            if (photometric) {
                const t = pixels[offset + k];
                h20 += t * sxk;
                h21 += t * syk;
                h22 += t * t;
                h30 += sxk;
                h31 += syk;
                h32 += t;
                h33 += 1;
            }
        }
    }
    if (size === 2) {
        const h01 = h10;
        const det = h00 * h11 - h01 * h01;
        if (!(Number.isFinite(det) && det > 0)) return null;
        return {
            n,
            size,
            sx,
            sy,
            factor: Float64Array.from([h11 / det, -h01 / det, -h01 / det, h00 / det]),
            templateMean: 0,
            templateSpread: 0,
        };
    }
    const H = work.subarray(2 * n, 2 * n + 16);
    H.set([h00, 0, 0, 0, h10, h11, 0, 0, h20, h21, h22, 0, h30, h31, h32, h33]);
    const L = work.subarray(2 * n + 16, 2 * n + 32);
    if (!cholesky(H, size, L)) return null;
    const templateMean = h32 / n;
    let templateSpread = 0;
    for (let k = 0; k < n; k++) {
        const t = pixels[offset + k] - templateMean;
        templateSpread += t * t;
    }
    return { n, size, sx, sy, factor: L, templateMean, templateSpread };
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
 * triangle `A` holds (row-major), into `L` (zeroed, `n²` entries); `false`
 * unless it is positive definite with finite entries.
 */
function cholesky(A: Float64Array, n: number, L: Float64Array): boolean {
    for (let r = 0; r < n; r++) {
        for (let q = 0; q <= r; q++) {
            let v = A[r * n + q];
            for (let k = 0; k < q; k++) v -= L[r * n + k] * L[q * n + k];
            if (r === q) {
                if (!(Number.isFinite(v) && v > 0)) return false;
                L[r * n + r] = Math.sqrt(v);
            } else {
                L[r * n + q] = v / L[q * n + q];
            }
        }
    }
    return true;
}

/**
 * The domain types.ts states for each option. `epsilon` must also be finite
 * (rule 3): an infinite tolerance would report any first step as converged.
 */
function validOptions(o: AlignPatchOptions): boolean {
    return (
        Number.isInteger(o.maxIterations) &&
        o.maxIterations >= 1 &&
        Number.isFinite(o.epsilon) &&
        o.epsilon > 0 &&
        typeof o.photometric === "boolean"
    );
}

/**
 * The frame's level scales, or `null` if the pyramid is not valid: 1 to 256
 * levels, a step that is finite, `> 1` and whose deepest level's scale does
 * not underflow, and every level a positive-integer size holding
 * `width · height` pixels — for level `l > 0`, the size `ImagePyramid`
 * defines, `(w0 · s_l) | 0` × `(h0 · s_l) | 0`, since the alignment maps
 * level-0 coordinates onto level `l` by `s_l` (as `selectPatches` checks).
 * Nothing here reads a pixel.
 */
function validPyramid(frame: FramePyramid): Float64Array | null {
    const count = frame.levels.length;
    const scales = pyramidScales(frame.scaleStep, count);
    if (scales === null) return null;
    for (let l = 0; l < count; l++) {
        const { width, height, data } = frame.levels[l];
        if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
            return null;
        }
        if (data.length !== width * height) return null;
        const w0 = frame.levels[0].width;
        const h0 = frame.levels[0].height;
        if (l > 0 && (width !== ((w0 * scales[l]) | 0) || height !== ((h0 * scales[l]) | 0))) {
            return null;
        }
    }
    return scales;
}

/** One patch, validated, with its level scale and its centre in target level-0 coordinates. */
export interface Patch {
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
 * scale at the patch's level is finite and non-zero, and small enough that
 * every pixel of the patch has a finite position in target level-0 px.
 *
 * The last condition is types.ts's "a step so large that the patch's level
 * scale underflows", caught just short of the underflow: a scale of
 * `2^-1008` is representable, but a patch at column 65530 of that level
 * reaches `65537 · 2^1008` px by its last column, past the largest double.
 * Such a patch has no position a prediction could map, so it is the patch,
 * not the prediction or the frame, that is reported.
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
    // The last column and row are the furthest from the origin (left and top
    // are unsigned), so every pixel's position is finite if theirs is.
    if (!(Number.isFinite((left + P - 1) / scale) && Number.isFinite((top + P - 1) / scale))) {
        return null;
    }
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
 * A homography, row-major, as the alignment holds it: a plain array, since a
 * `Float64Array` of nine entries is too large for V8 to allocate on its heap,
 * and costs about 2 µs to create in Node here (see warpPatch).
 */
type Homography = readonly number[];

/**
 * The prediction, multiplied by the power of two that brings its largest
 * entry into `[1, 2)`, and by −1 if that makes `H[8] > 0`; or `null` if an
 * entry is not finite or `H[8] = 0`.
 *
 * A homography and any non-zero multiple of it are the same map, so the
 * scale is free (types.ts rule 1), and nothing downstream may depend on it.
 * Two things would, left alone:
 *
 * - **The sign of `w`**, which says which side of the horizon a point is on,
 *   and flips with the scale. `H[8]` is `w` at the target's origin; making
 *   it positive makes `w > 0` mean "on the origin's side", the side a camera
 *   looking at the target sees. `H[8] = 0` puts the origin itself at
 *   infinity, outside the contract, and leaves no side to call "front".
 * - **The magnitude**, through overflow: at `1e307 · H`, every entry finite,
 *   the projection's products are not. Multiplying by a power of two rounds
 *   nothing, so every `2^k · H` becomes the same matrix, bit for bit, and
 *   aligns identically; and with its largest entry in `[1, 2)`, only the
 *   patch's own coordinates set the range of the projection's products.
 *
 * The power is found by exact halvings and doublings rather than
 * `Math.log2`, whose rounding the language leaves to the implementation. It
 * is kept as two factors because when every entry is subnormal, the one
 * power that lifts the largest into `[1, 2)` is past the largest double.
 */
function normalised(prediction: Mat3): Homography | null {
    let largest = 0;
    for (let i = 0; i < 9; i++) {
        if (!Number.isFinite(prediction[i])) return null;
        largest = Math.max(largest, Math.abs(prediction[i]));
    }
    const h8 = prediction[8];
    if (h8 === 0) return null;
    let m = largest;
    let f = 1;
    let g = 1;
    while (m >= 2) {
        m /= 2;
        f /= 2;
    }
    while (m < 1) {
        m *= 2;
        // 2 ** 512 is only compared against, so its rounding cannot matter.
        if (f < 2 ** 512) f *= 2;
        else g *= 2;
    }
    if (h8 < 0) f = -f;
    const p = prediction;
    // Written out: measured in Node here, 50 ns, against 1 µs for Array.from
    // with a callback and 2 µs for Float64Array.from.
    return [
        p[0] * f * g,
        p[1] * f * g,
        p[2] * f * g,
        p[3] * f * g,
        p[4] * f * g,
        p[5] * f * g,
        p[6] * f * g,
        p[7] * f * g,
        p[8] * f * g,
    ];
}

/** `H · (X, Y)` after the perspective division, or `null` at or beyond the horizon. */
function project(H: Homography, X: number, Y: number): [number, number] | null {
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
export interface Warped {
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
function warpPatch(H: Homography, patch: Patch): Warped | null {
    const { P, left, top, scale } = patch;
    const n = P * P;
    // One allocation for all ten per-sample arrays: a typed array's backing
    // store costs far more to allocate than its size suggests (see
    // scripts/bench-tracking.mjs), and this runs for every patch.
    const fields = new Float64Array(10 * n);
    const field = (f: number) => fields.subarray(f * n, (f + 1) * n);
    const [x, y, ja, jb, jc, jd, ux, uy, vx, vy] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(field);
    let spanX = 0;
    let spanY = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let invertible = true;
    for (let i = 0; i < P; i++) {
        for (let j = 0; j < P; j++) {
            // project() and jacobian(), inlined: this loop runs P² times
            // for every patch of every frame, and their tuples cost more
            // than their arithmetic. The expressions are theirs, unchanged.
            const X = (left + j) / scale;
            const Y = (top + i) / scale;
            const w = H[6] * X + H[7] * Y + H[8];
            if (!(w > 0)) return null;
            const px = (H[0] * X + H[1] * Y + H[2]) / w;
            const py = (H[3] * X + H[4] * Y + H[5]) / w;
            if (!(Number.isFinite(px) && Number.isFinite(py))) return null;
            const k = i * P + j;
            x[k] = px;
            y[k] = py;
            minX = Math.min(minX, px);
            maxX = Math.max(maxX, px);
            minY = Math.min(minY, py);
            maxY = Math.max(maxY, py);
            const a = (H[0] - H[6] * px) / w;
            const b = (H[1] - H[7] * px) / w;
            const c = (H[3] - H[6] * py) / w;
            const d = (H[4] - H[7] * py) / w;
            ja[k] = a;
            jb[k] = b;
            jc[k] = c;
            jd[k] = d;
            ux[k] = a / scale;
            uy[k] = c / scale;
            vx[k] = b / scale;
            vy[k] = d / scale;
            spanX = Math.max(spanX, Math.abs(ux[k]) + Math.abs(vx[k]));
            spanY = Math.max(spanY, Math.abs(uy[k]) + Math.abs(vy[k]));
            const det = a * d - b * c;
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
    H: Homography,
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
function usableLevels(frame: PyramidShape, scales: Float64Array, warped: Warped): number[] {
    const out: number[] = [];
    for (let l = 0; l < frame.levels.length; l++) {
        if (inside(frame, scales, l, warped, 0, 0, footprintHalfWidth(frame, scales, l, warped))) {
            out.push(l);
        }
    }
    return out;
}

/**
 * Whether everything the window reads, moved by `(dx, dy)` level-0 px, lies
 * inside level `l` when each patch pixel is read through a footprint of
 * `halfWidth` patch px (0: one point).
 */
function inside(
    frame: PyramidShape,
    scales: Float64Array,
    l: number,
    warped: Warped,
    dx: number,
    dy: number,
    halfWidth: number,
): boolean {
    const { width, height } = frame.levels[l];
    if (width < 2 || height < 2) return false;
    const s = scales[l];
    const rx = halfWidth === 0 ? 0 : halfWidth * warped.spanX;
    const ry = halfWidth === 0 ? 0 : halfWidth * warped.spanY;
    return (
        s * (warped.minX + dx - rx) >= 0 &&
        s * (warped.maxX + dx + rx) <= width - 1 &&
        s * (warped.minY + dy - ry) >= 0 &&
        s * (warped.maxY + dy + ry) <= height - 1
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
            const gx = gradientX(pixels, offset, P, i, j);
            const gy = gradientY(pixels, offset, P, i, j);
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
 * The column-direction component of the patch's intensity gradient at
 * pixel `(i, j)` ({@link gradientY} gives the other), grey levels per patch
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
function gradientX(pixels: Uint8Array, offset: number, P: number, i: number, j: number): number {
    const row = offset + i * P;
    if (j === 0) return pixels[row + 1] - pixels[row];
    if (j === P - 1) return pixels[row + j] - pixels[row + j - 1];
    return (pixels[row + j + 1] - pixels[row + j - 1]) / 2;
}

/** The row-direction component of the gradient {@link gradientX} describes. */
function gradientY(pixels: Uint8Array, offset: number, P: number, i: number, j: number): number {
    const col = offset + j;
    if (i === 0) return pixels[col + P] - pixels[col];
    if (i === P - 1) return pixels[col + i * P] - pixels[col + (i - 1) * P];
    return (pixels[col + (i + 1) * P] - pixels[col + (i - 1) * P]) / 2;
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
 * reads it there. `values` is scratch of P² entries.
 */
function residualAt(
    frame: FramePyramid,
    scales: Float64Array,
    l: number,
    warped: Warped,
    patch: Patch,
    dx: number,
    dy: number,
    gain: number,
    bias: number,
    values: Float64Array,
): number {
    const n = patch.P * patch.P;
    const fp = footprint(frame, scales, l, warped);
    sampleFrame(frame.levels[l], scales[l], warped, dx, dy, fp, values);
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
