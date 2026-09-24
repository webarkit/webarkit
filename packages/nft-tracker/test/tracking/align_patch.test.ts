/*
 *  align_patch.test.ts
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

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { alignPatch, buildFramePyramid } from "../../src/index.js";
import type {
    AlignPatchOptions,
    FramePyramid,
    PatchAlignment,
    PatchAlignmentFailure,
    PatchTable,
} from "../../src/index.js";
import { cutPatches } from "../fixtures/patch_table.js";
import { translation } from "../fixtures/warped_frames.js";

// Explicit failures (types.ts, rule 3): every way alignPatch can refuse, and
// the property that it never throws and never hands back a non-finite number.
// Accuracy, the convergence basin and photometric robustness are measured in
// the align_patch_*.test.ts files beside this one.

const P = 8;
const STEP = Math.cbrt(2);
const OPTIONS: AlignPatchOptions = { maxIterations: 30, epsilon: 0.01, photometric: false };
const IDENTITY: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** A smooth, deterministic texture with gradients in every direction. */
function textured(width: number, height: number): GrayImage {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v =
                128 +
                50 * Math.sin(0.35 * x + 0.2 * y) +
                40 * Math.cos(0.23 * y - 0.31 * x) +
                20 * Math.sin(0.57 * x) * Math.cos(0.49 * y);
            data[y * width + x] = Math.round(v);
        }
    }
    return { data, width, height };
}

function pyramidOf(image: GrayImage, levels = 4): FramePyramid {
    const r = buildFramePyramid(image, { levels, scaleStep: STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

/** One patch with the given pixels, at level 0 (40, 30) of a target stepping by ∛2. */
function tableOf(pixels: Uint8Array): PatchTable {
    return {
        patchSize: P,
        count: 1,
        score: new Float32Array(1),
        left: Uint16Array.from([40]),
        top: Uint16Array.from([30]),
        level: Uint8Array.from([0]),
        pixels,
    };
}

function reason(r: PatchAlignment): PatchAlignmentFailure | undefined {
    return r.ok ? undefined : r.reason;
}

// The frame is its own target: a patch cut from level 0 and predicted by the
// identity is exactly where it came from.
const image = textured(96, 72);
const frame = pyramidOf(image);
const table = cutPatches(frame, P, [{ level: 0, left: 40, top: 30 }]);

describe("alignPatch: input validation", () => {
    it("aligns the valid baseline these cases each break one thing of", () => {
        expect(alignPatch(frame, table, 0, STEP, IDENTITY, OPTIONS).ok).toBe(true);
    });

    it("rejects options outside their domain", () => {
        const bad: AlignPatchOptions[] = [
            { ...OPTIONS, maxIterations: 0 },
            { ...OPTIONS, maxIterations: -1 },
            { ...OPTIONS, maxIterations: 1.5 },
            { ...OPTIONS, maxIterations: Number.NaN },
            { ...OPTIONS, maxIterations: Number.POSITIVE_INFINITY },
            { ...OPTIONS, epsilon: 0 },
            { ...OPTIONS, epsilon: -0.01 },
            { ...OPTIONS, epsilon: Number.NaN },
            { ...OPTIONS, photometric: "yes" as unknown as boolean },
        ];
        for (const options of bad) {
            expect(reason(alignPatch(frame, table, 0, STEP, IDENTITY, options))).toBe(
                "invalid-options",
            );
        }
    });

    it("rejects an invalid pyramid before reading a level, including a step that underflows", () => {
        const one: GrayImage = { data: new Uint8Array(1), width: 1, height: 1 };
        const bad: FramePyramid[] = [
            { scaleStep: STEP, levels: [] },
            { scaleStep: STEP, levels: new Array<GrayImage>(257).fill(one) },
            { scaleStep: 1, levels: frame.levels },
            { scaleStep: Number.NaN, levels: frame.levels },
            { scaleStep: Number.POSITIVE_INFINITY, levels: frame.levels },
            { scaleStep: STEP, levels: [{ data: new Uint8Array(5), width: 2, height: 2 }] },
            { scaleStep: STEP, levels: [{ data: new Uint8Array(0), width: 0, height: 0 }] },
            { scaleStep: STEP, levels: [{ data: new Uint8Array(3), width: 1.5, height: 2 }] },
            // Level 2's scale is 2^-1076, which underflows: levelScale would throw.
            { scaleStep: 2 ** 538, levels: [one, one, one] },
        ];
        for (const pyramid of bad) {
            expect(reason(alignPatch(pyramid, table, 0, STEP, IDENTITY, OPTIONS))).toBe(
                "invalid-pyramid",
            );
        }
    });

    it("rejects an invalid patch: index, size, pixel count, target step, table shape", () => {
        const cases: [PatchTable, number, number][] = [
            [table, -1, STEP],
            [table, 1, STEP],
            [table, 0.5, STEP],
            [table, Number.NaN, STEP],
            [{ ...table, patchSize: 2, pixels: new Uint8Array(4) }, 0, STEP],
            [{ ...table, pixels: new Uint8Array(P * P - 1) }, 0, STEP],
            [{ ...table, pixels: new Uint8Array(P * P + 1) }, 0, STEP],
            [table, 0, 1],
            [table, 0, Number.NaN],
            [table, 0, Number.POSITIVE_INFINITY],
            // Level 2 of a 2^538 step underflows to 0: levelScale would throw.
            [{ ...table, level: Uint8Array.from([2]) }, 0, 2 ** 538],
            [{ ...table, left: new Uint16Array(0) }, 0, STEP],
            [{ ...table, top: new Uint16Array(0) }, 0, STEP],
            [{ ...table, level: new Uint8Array(0) }, 0, STEP],
        ];
        for (const [patches, q, step] of cases) {
            expect(reason(alignPatch(frame, patches, q, step, IDENTITY, OPTIONS))).toBe(
                "invalid-patch",
            );
        }
    });

    it("rejects a prediction with a non-finite entry, or one sending the patch centre to or past infinity", () => {
        for (let i = 0; i < 9; i++) {
            for (const v of [Number.NaN, Number.POSITIVE_INFINITY]) {
                const H = Float64Array.from(IDENTITY);
                H[i] = v;
                expect(reason(alignPatch(frame, table, 0, STEP, H, OPTIONS))).toBe(
                    "non-finite-prediction",
                );
            }
        }
        // The centre is at level-0 (43.5, 33.5). w = 87/64 − x/32 is exactly 0
        // there (every term dyadic, so no rounding), and w = 1 − x/32 is
        // negative there: beyond the horizon.
        const atInfinity = Float64Array.from([1, 0, 0, 0, 1, 0, -1 / 32, 0, 87 / 64]);
        const beyond = Float64Array.from([1, 0, 0, 0, 1, 0, -1 / 32, 0, 1]);
        // H[8] = 0 is outside the contract (types.ts rule 1): the target origin
        // itself maps to infinity, leaving no side of the horizon to call "front".
        const originAtInfinity = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 0]);
        for (const H of [atInfinity, beyond, originAtInfinity]) {
            expect(reason(alignPatch(frame, table, 0, STEP, H, OPTIONS))).toBe(
                "non-finite-prediction",
            );
        }
    });

    it("accepts a prediction at any scale, including a negative one: H and −2H are the same map", () => {
        const scaled = Float64Array.from(IDENTITY, (v) => -2 * v);
        const a = alignPatch(frame, table, 0, STEP, IDENTITY, OPTIONS);
        const b = alignPatch(frame, table, 0, STEP, scaled, OPTIONS);
        expect(a.ok && b.ok).toBe(true);
        expect(b).toEqual(a);
    });
});

describe("alignPatch: a window outside the frame", () => {
    it("fails when the window is far outside every level", () => {
        const H = translation(1000, 0);
        expect(reason(alignPatch(frame, table, 0, STEP, H, OPTIONS))).toBe("outside-frame");
    });

    it("counts partial overlap as outside: the window must lie entirely inside a level", () => {
        // The window spans x ∈ [40, 47]; moved by −42 px its left two columns
        // leave the frame while six stay in.
        const H = translation(-42, 0);
        expect(reason(alignPatch(frame, table, 0, STEP, H, OPTIONS))).toBe("outside-frame");
    });

    it("draws the line at the last pixel: a window ending on it is usable, 0.01 px further is not", () => {
        // Cut from the right edge: columns 88..95 of a 96-wide level 0.
        const edge = cutPatches(frame, P, [{ level: 0, left: 88, top: 30 }]);
        expect(alignPatch(frame, edge, 0, STEP, IDENTITY, OPTIONS).ok).toBe(true);
        expect(reason(alignPatch(frame, edge, 0, STEP, translation(0.01, 0), OPTIONS))).toBe(
            "outside-frame",
        );
    });

    it("fails only when no level can hold the window: a patch on a coarse level's edge still aligns there", () => {
        // A level-3 patch flush with level 3's right edge (columns 87..94 of
        // 95), seen at twice its scale, so coarse to fine starts on level 3.
        // From 1–3 px left of the truth, level 0 can hold the window at the
        // prediction; once level 3 has brought it back to the edge, level
        // 0's footprints would reach past the frame. Level 3 still holds it,
        // so that is not "no frame level is usable": the result is level 3's,
        // converged (measured: within 0.02 px, in 6 or 7 iterations).
        const wide = pyramidOf(textured(192, 144), 6);
        expect(wide.levels[3].width).toBe(95);
        const flush = cutPatches(wide, P, [{ level: 3, left: 87, top: 30 }]);
        const exact = alignPatch(wide, flush, 0, STEP, IDENTITY, OPTIONS);
        expect(exact.ok && exact.observation.frameLevel).toBe(3);
        for (const d of [1, 2, 3]) {
            const r = alignPatch(wide, flush, 0, STEP, translation(-d, 0), OPTIONS);
            if (!r.ok) throw new Error(`${d} px off: ${r.reason}`);
            const [x, y] = [(87 + 3.5) / 0.5, (30 + 3.5) / 0.5];
            expect(Math.hypot(r.observation.x - x, r.observation.y - y)).toBeLessThan(0.5);
            expect(r.observation.converged).toBe(true);
            expect(r.observation.frameLevel).toBe(3);
        }
    });

    it("does not report convergence against an edge the truth lies beyond (2–4 px short)", () => {
        // The frame is the left 192 columns of a wider copy of the texture, and
        // the patch's true window (columns 186..193 of the copy) reaches two
        // columns past it. Predicted 2 to 4 px short of the truth, the window
        // fits; the alignment pulls it out towards the truth, steps are cut
        // short at the edge, and the full step never falls below epsilon.
        // Judging convergence on the step actually taken instead would
        // report 4 px short as converged, at the edge (x = 187.50).
        const wide = pyramidOf(textured(192, 144), 6);
        const wider = pyramidOf(textured(200, 144), 6);
        const beyond = cutPatches(wider, P, [{ level: 0, left: 186, top: 30 }]);
        for (const short of [2, 2.5, 3, 4]) {
            const r = alignPatch(wide, beyond, 0, STEP, translation(-short, 0), OPTIONS);
            if (!r.ok) throw new Error(`${short} px short: ${r.reason}`);
            expect(r.observation.converged).toBe(false);
            // The window stopped at the edge, or before it.
            expect(r.observation.x + 3.5).toBeLessThanOrEqual(191 + 1e-9);
        }
    });
});

describe("alignPatch: a singular system", () => {
    const flat = new Uint8Array(P * P).fill(100);
    // Texture along x only: every gradient is (g, 0), so translation along y
    // is unobservable — the aperture problem.
    const alongX = new Uint8Array(P * P);
    for (let i = 0; i < P; i++) {
        for (let j = 0; j < P; j++) alongX[i * P + j] = Math.round(128 + 60 * Math.sin(0.9 * j));
    }

    it("fails for a flat patch, with or without photometric compensation", () => {
        for (const photometric of [false, true]) {
            const r = alignPatch(frame, tableOf(flat), 0, STEP, IDENTITY, {
                ...OPTIONS,
                photometric,
            });
            expect(reason(r)).toBe("singular");
        }
    });

    it("fails for a patch textured in one direction only", () => {
        for (const photometric of [false, true]) {
            const r = alignPatch(frame, tableOf(alongX), 0, STEP, IDENTITY, {
                ...OPTIONS,
                photometric,
            });
            expect(reason(r)).toBe("singular");
        }
    });

    it("fails when the prediction collapses the window onto a line", () => {
        // Every target point lands on the row y = 35: a window of zero area.
        const H = Float64Array.from([1, 0, 0, 0, 0, 35, 0, 0, 1]);
        expect(reason(alignPatch(frame, table, 0, STEP, H, OPTIONS))).toBe("singular");
    });
});

describe("alignPatch: never throws, never returns a non-finite number", () => {
    const REASONS = new Set<PatchAlignmentFailure>([
        "invalid-options",
        "invalid-pyramid",
        "invalid-patch",
        "non-finite-prediction",
        "outside-frame",
        "singular",
    ]);

    it("holds for arbitrary patches, predictions and options", () => {
        const anyDouble = fc.double();
        const nearIdentity = fc
            .tuple(
                fc.double({ min: -0.3, max: 0.3, noNaN: true }),
                fc.double({ min: -0.3, max: 0.3, noNaN: true }),
                fc.double({ min: -60, max: 60, noNaN: true }),
                fc.double({ min: -0.3, max: 0.3, noNaN: true }),
                fc.double({ min: -0.3, max: 0.3, noNaN: true }),
                fc.double({ min: -60, max: 60, noNaN: true }),
                fc.double({ min: -0.01, max: 0.01, noNaN: true }),
                fc.double({ min: -0.01, max: 0.01, noNaN: true }),
            )
            .map(([a, b, c, d, e, f, g, h]) =>
                Float64Array.from([1 + a, b, c, d, 1 + e, f, g, h, 1]),
            );
        const prediction = fc.oneof(
            nearIdentity,
            fc.array(anyDouble, { minLength: 9, maxLength: 9 }).map((a) => Float64Array.from(a)),
        );
        const patch = fc.integer({ min: 3, max: 10 }).chain((size) =>
            fc.record({
                size: fc.constant(size),
                pixels: fc.uint8Array({ minLength: size * size, maxLength: size * size }),
                left: fc.integer({ min: 0, max: 100 }),
                top: fc.integer({ min: 0, max: 80 }),
                level: fc.integer({ min: 0, max: 5 }),
            }),
        );
        fc.assert(
            fc.property(
                patch,
                fc.integer({ min: -1, max: 1 }),
                fc.oneof(fc.constant(STEP), fc.constant(2), fc.double({ min: 0.5, max: 8 })),
                prediction,
                fc.record({
                    maxIterations: fc.integer({ min: 1, max: 20 }),
                    epsilon: fc.constantFrom(1e-4, 0.01, 0.1),
                    photometric: fc.boolean(),
                }),
                (p, q, step, H, options) => {
                    const patches: PatchTable = {
                        patchSize: p.size,
                        count: 1,
                        score: new Float32Array(1),
                        left: Uint16Array.from([p.left]),
                        top: Uint16Array.from([p.top]),
                        level: Uint8Array.from([p.level]),
                        pixels: p.pixels,
                    };
                    const r = alignPatch(frame, patches, q, step, H, options);
                    if (!r.ok) {
                        expect(REASONS.has(r.reason)).toBe(true);
                        return;
                    }
                    const o = r.observation;
                    for (const v of [o.x, o.y, o.residual, o.gain, o.bias]) {
                        expect(Number.isFinite(v)).toBe(true);
                    }
                    expect(o.index).toBe(q);
                    expect(o.residual).toBeGreaterThanOrEqual(0);
                    expect(Number.isInteger(o.iterations) && o.iterations >= 0).toBe(true);
                    expect(o.frameLevel >= 0 && o.frameLevel < frame.levels.length).toBe(true);
                    if (!options.photometric) expect([o.gain, o.bias]).toEqual([1, 0]);
                },
            ),
            { numRuns: 1000, seed: 48 },
        );
    });
});
