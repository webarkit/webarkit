/*
 *  select_patches.test.ts
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

import { beforeAll, describe, expect, it } from "vitest";
import type { GrayImage } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";
import {
    buildTargetFromImage,
    decode,
    encode,
    levelScale,
    selectPatches,
} from "../../src/index.js";
import type {
    ImagePyramid,
    PatchSelection,
    PatchTable,
    SelectPatchesOptions,
} from "../../src/index.js";
import { mulberry32 } from "../fixtures/seeded_rng.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";

// ---------------------------------------------------------------------------
// Test images and pyramids. None of this is the tracker's pyramid filter:
// selectPatches takes whatever pyramid it is handed, so the tests build theirs
// with the simplest sampling that has the right sizes (§5.4's `(w · s_l) | 0`)
// and the right centre mapping (§3, D2: `x0 = x_l / s_l`).
// ---------------------------------------------------------------------------

function image(width: number, height: number, pixel: (x: number, y: number) => number): GrayImage {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data[y * width + x] = pixel(x, y);
    }
    return { data, width, height };
}

function noise(width: number, height: number, seed: number): GrayImage {
    const rng = mulberry32(seed);
    return image(width, height, () => Math.floor(rng() * 256));
}

function pyramidOf(level0: GrayImage, scaleStep: number, levels: number): ImagePyramid {
    const out: GrayImage[] = [level0];
    for (let l = 1; l < levels; l++) {
        const s = levelScale(scaleStep, l);
        const w = (level0.width * s) | 0;
        const h = (level0.height * s) | 0;
        out.push(
            image(w, h, (x, y) => {
                const x0 = Math.min(level0.width - 1, Math.round(x / s));
                const y0 = Math.min(level0.height - 1, Math.round(y / s));
                return level0.data[y0 * level0.width + x0];
            }),
        );
    }
    return { scaleStep, levels: out };
}

const OPTIONS: SelectPatchesOptions = { patchSize: 8, maxPatches: 16, minScore: 1, minSpacing: 8 };

function ok(r: PatchSelection): PatchTable {
    if (!r.ok) throw new Error(`selectPatches failed: ${r.reason}`);
    return r.patches;
}

/** Level-0 centre of patch `q`: the rule `PatchObservation`'s doc states. */
function centre(target: ImagePyramid, t: PatchTable, q: number): [number, number] {
    const s = levelScale(target.scaleStep, t.level[q]);
    const half = (t.patchSize - 1) / 2;
    return [(t.left[q] + half) / s, (t.top[q] + half) / s];
}

/** The P × P window of `level` at (`left`, `top`), row-major. */
function windowOf(level: GrayImage, left: number, top: number, P: number): Uint8Array {
    const out = new Uint8Array(P * P);
    for (let i = 0; i < P; i++) {
        out.set(
            level.data.subarray((top + i) * level.width + left, (top + i) * level.width + left + P),
            i * P,
        );
    }
    return out;
}

/**
 * The documented score, computed the slow way from a window's own pixels:
 * central differences over the interior `(P − 2)²` pixels, the mean structure
 * tensor, its smaller eigenvalue, times `s_l²`, rounded to the stored `f32`.
 * An independent spelling of `select_patches.ts`'s definition, so the two can
 * only agree if the definition is what the docs say it is.
 */
function referenceScore(pixels: Uint8Array, P: number, s: number): number {
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let y = 1; y < P - 1; y++) {
        for (let x = 1; x < P - 1; x++) {
            const dx = pixels[y * P + x + 1] - pixels[y * P + x - 1];
            const dy = pixels[(y + 1) * P + x] - pixels[(y - 1) * P + x];
            sxx += dx * dx;
            sxy += dx * dy;
            syy += dy * dy;
        }
    }
    const n4 = 4 * (P - 2) * (P - 2);
    const a = sxx / n4;
    const b = sxy / n4;
    const c = syy / n4;
    const half = (a - c) / 2;
    const lambda = Math.max(0, (a + c) / 2 - Math.sqrt(half * half + b * b));
    return Math.fround(lambda * s * s);
}

/** Every candidate, scored the slow way, in the order types.ts fixes. */
function referenceSelect(target: ImagePyramid, o: SelectPatchesOptions): PatchTable | null {
    const P = o.patchSize;
    const candidates: { score: number; level: number; top: number; left: number }[] = [];
    target.levels.forEach((lv, level) => {
        const s = levelScale(target.scaleStep, level);
        for (let top = 0; top + P <= lv.height; top++) {
            for (let left = 0; left + P <= lv.width; left++) {
                const score = referenceScore(windowOf(lv, left, top, P), P, s);
                if (score >= o.minScore) candidates.push({ score, level, top, left });
            }
        }
    });
    candidates.sort(
        (p, q) => q.score - p.score || p.level - q.level || p.top - q.top || p.left - q.left,
    );
    const chosen: typeof candidates = [];
    const centres: [number, number][] = [];
    for (const c of candidates) {
        if (chosen.length === o.maxPatches) break;
        const s = levelScale(target.scaleStep, c.level);
        const cx = (c.left + (P - 1) / 2) / s;
        const cy = (c.top + (P - 1) / 2) / s;
        if (centres.some(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 < o.minSpacing ** 2)) continue;
        chosen.push(c);
        centres.push([cx, cy]);
    }
    if (chosen.length < 4) return null;
    const pixels = new Uint8Array(chosen.length * P * P);
    chosen.forEach((c, q) =>
        pixels.set(windowOf(target.levels[c.level], c.left, c.top, P), q * P * P),
    );
    return {
        patchSize: P,
        count: chosen.length,
        score: Float32Array.from(chosen, (c) => c.score),
        left: Uint16Array.from(chosen, (c) => c.left),
        top: Uint16Array.from(chosen, (c) => c.top),
        level: Uint8Array.from(chosen, (c) => c.level),
        pixels,
    };
}

// ---------------------------------------------------------------------------

describe("selectPatches — domain", () => {
    const target = pyramidOf(noise(32, 24, 1), 2, 2);

    it.each([
        ["patchSize below 3", { patchSize: 2 }],
        ["patchSize not an integer", { patchSize: 7.5 }],
        ["patchSize NaN", { patchSize: Number.NaN }],
        ["maxPatches below 4", { maxPatches: 3 }],
        ["maxPatches not an integer", { maxPatches: 4.5 }],
        ["minScore negative", { minScore: -1 }],
        ["minScore NaN", { minScore: Number.NaN }],
        ["minSpacing negative", { minSpacing: -0.5 }],
        ["minSpacing NaN", { minSpacing: Number.NaN }],
    ])("%s is invalid-options", (_, override) => {
        expect(selectPatches(target, { ...OPTIONS, ...override })).toEqual({
            ok: false,
            reason: "invalid-options",
        });
    });

    const level = noise(16, 12, 2);
    it.each([
        ["scaleStep 1", { scaleStep: 1, levels: [level] }],
        ["scaleStep NaN", { scaleStep: Number.NaN, levels: [level] }],
        ["scaleStep infinite", { scaleStep: Number.POSITIVE_INFINITY, levels: [level] }],
        ["no levels", { scaleStep: 2, levels: [] }],
        ["257 levels", { scaleStep: 2, levels: new Array<GrayImage>(257).fill(level) }],
        [
            "a zero width",
            { scaleStep: 2, levels: [{ data: new Uint8Array(0), width: 0, height: 12 }] },
        ],
        ["a fractional height", { scaleStep: 2, levels: [{ ...level, height: 11.5 }] }],
        [
            "data of the wrong length",
            { scaleStep: 2, levels: [{ ...level, data: new Uint8Array(10) }] },
        ],
        [
            "a level-0 side beyond u16",
            { scaleStep: 2, levels: [{ data: new Uint8Array(65536), width: 65536, height: 1 }] },
        ],
        // levelScale would throw here; selectPatches must say so first.
        ["a level scale that underflows", { scaleStep: 1e200, levels: [level, level, level] }],
    ])("%s is invalid-pyramid", (_, target) => {
        expect(selectPatches(target as ImagePyramid, OPTIONS)).toEqual({
            ok: false,
            reason: "invalid-pyramid",
        });
    });

    it("accepts the limits of the domain", () => {
        const r = selectPatches(pyramidOf(noise(40, 30, 3), 2, 1), {
            patchSize: 3,
            maxPatches: 4,
            minScore: 0,
            minSpacing: 0,
        });
        expect(ok(r).count).toBe(4);
    });
});

describe("selectPatches — what qualifies", () => {
    it("finds too few patches on a flat image", () => {
        const flat = pyramidOf(
            image(64, 48, () => 128),
            2,
            2,
        );
        expect(selectPatches(flat, OPTIONS)).toEqual({ ok: false, reason: "too-few-patches" });
    });

    it("rejects an edge: one-dimensional texture has a zero minimum eigenvalue", () => {
        // Shi–Tomasi's point: stripes have strong gradients, all in one
        // direction, so a patch on them cannot be localised along the stripe.
        const stripes = pyramidOf(
            image(64, 48, (x) => (x % 6 < 3 ? 40 : 220)),
            2,
            2,
        );
        expect(selectPatches(stripes, OPTIONS)).toEqual({ ok: false, reason: "too-few-patches" });
    });

    it("takes no patch from a low-texture region", () => {
        const rng = mulberry32(4);
        const half = image(96, 64, (x) => (x < 48 ? 128 : Math.floor(rng() * 256)));
        const target = pyramidOf(half, 2, 1);
        const t = ok(selectPatches(target, { ...OPTIONS, maxPatches: 64, minSpacing: 4 }));
        for (let q = 0; q < t.count; q++) {
            // The window must reach into the textured half: its interior's
            // gradients are what the score reads.
            expect(t.left[q] + t.patchSize - 2).toBeGreaterThan(48);
            expect(t.score[q]).toBeGreaterThanOrEqual(OPTIONS.minScore);
        }
    });

    it("skips a level smaller than patchSize instead of failing", () => {
        // Level 1 is 15 x 11: too small for a 12-pixel patch in height.
        const target = pyramidOf(noise(30, 23, 5), 2, 2);
        expect(target.levels[1].height).toBeLessThan(12);
        const t = ok(selectPatches(target, { ...OPTIONS, patchSize: 12, minSpacing: 0 }));
        expect(Array.from(t.level).every((l) => l === 0)).toBe(true);
    });

    it("fails, rather than erring, when every level is smaller than patchSize", () => {
        const target = pyramidOf(noise(10, 10, 6), 2, 2);
        expect(selectPatches(target, OPTIONS)).toEqual({ ok: false, reason: "too-few-patches" });
    });

    it("stops at maxPatches", () => {
        const target = pyramidOf(noise(128, 96, 7), 2, 3);
        expect(ok(selectPatches(target, { ...OPTIONS, maxPatches: 5 })).count).toBe(5);
    });
});

describe("selectPatches — the table it returns", () => {
    let target: ImagePyramid;
    let t: PatchTable;

    beforeAll(() => {
        target = pyramidOf(readPgm(TARGET_FIXTURE), Math.cbrt(2), 3);
        t = ok(
            selectPatches(target, { patchSize: 16, maxPatches: 64, minScore: 10, minSpacing: 40 }),
        );
    });

    it("is deterministic, and leaves its input untouched", () => {
        const before = target.levels.map((l) => l.data.slice());
        const copy: ImagePyramid = {
            scaleStep: target.scaleStep,
            levels: target.levels.map((l) => ({ ...l, data: l.data.slice() })),
        };
        const options = { patchSize: 16, maxPatches: 64, minScore: 10, minSpacing: 40 };
        expect(selectPatches(target, options)).toEqual({ ok: true, patches: t });
        expect(selectPatches(copy, options)).toEqual({ ok: true, patches: t });
        target.levels.forEach((l, i) => expect(l.data).toEqual(before[i]));
    });

    it("holds, for every patch, exactly its level's pixels at (left, top), in bounds (§5.7)", () => {
        const P = t.patchSize;
        expect(t.pixels.length).toBe(t.count * P * P);
        for (let q = 0; q < t.count; q++) {
            const level = target.levels[t.level[q]];
            expect(t.left[q] + P).toBeLessThanOrEqual(level.width);
            expect(t.top[q] + P).toBeLessThanOrEqual(level.height);
            expect(t.pixels.subarray(q * P * P, (q + 1) * P * P)).toEqual(
                windowOf(level, t.left[q], t.top[q], P),
            );
        }
    });

    it("uses more than one level", () => {
        expect(new Set(t.level).size).toBeGreaterThan(1);
    });

    it("stores the documented score, recomputable from the stored pixels alone", () => {
        const P = t.patchSize;
        for (let q = 0; q < t.count; q++) {
            const s = levelScale(target.scaleStep, t.level[q]);
            expect(t.score[q]).toBe(
                referenceScore(t.pixels.subarray(q * P * P, (q + 1) * P * P), P, s),
            );
        }
    });

    it("is ordered by score, descending, ties by (level, top, left)", () => {
        for (let q = 1; q < t.count; q++) {
            const key = (i: number) => [-t.score[i], t.level[i], t.top[i], t.left[i]];
            const [a, b] = [key(q - 1), key(q)];
            const i = a.findIndex((v, k) => v !== b[k]);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(a[i]).toBeLessThan(b[i]);
        }
    });

    it("keeps every two centres minSpacing apart, in level-0 pixels across levels", () => {
        for (let p = 0; p < t.count; p++) {
            for (let q = p + 1; q < t.count; q++) {
                const [px, py] = centre(target, t, p);
                const [qx, qy] = centre(target, t, q);
                expect(Math.hypot(px - qx, py - qy)).toBeGreaterThanOrEqual(40);
            }
        }
    });

    it("covers the target rather than clustering in its most textured part", () => {
        const cells = (table: PatchTable) => {
            const seen = new Set<number>();
            for (let q = 0; q < table.count; q++) {
                const [x, y] = centre(target, table, q);
                seen.add(Math.floor((4 * y) / 640) * 4 + Math.floor((4 * x) / 512));
            }
            return seen.size;
        };
        // A 4 x 4 grid over the 512 x 640 target: nearly every cell is used.
        expect(cells(t)).toBeGreaterThanOrEqual(14);
        // The control: without spacing, the same budget piles up in a few
        // cells. Without this the assertion above could pass by accident.
        const clustered = ok(
            selectPatches(target, { patchSize: 16, maxPatches: 64, minScore: 10, minSpacing: 0 }),
        );
        expect(cells(clustered)).toBeLessThanOrEqual(4);
    });
});

describe("selectPatches — greedy order", () => {
    it("matches a brute-force reference on a small multi-level pyramid", () => {
        const target = pyramidOf(noise(36, 28, 8), 1.5, 3);
        const options = { patchSize: 5, maxPatches: 12, minScore: 0, minSpacing: 6 };
        expect(ok(selectPatches(target, options))).toEqual(referenceSelect(target, options));
    });

    it("breaks score ties by (level, top, left)", () => {
        // A tiled image: every window at the same phase has the same pixels,
        // hence the same score, so the order among them is the tie-break alone.
        const tile = noise(6, 6, 9);
        const tiled = image(48, 36, (x, y) => tile.data[(y % 6) * 6 + (x % 6)]);
        const target: ImagePyramid = { scaleStep: 2, levels: [tiled] };
        const options = { patchSize: 6, maxPatches: 8, minScore: 0, minSpacing: 0 };
        const t = ok(selectPatches(target, options));
        expect(t).toEqual(referenceSelect(target, options));
        expect(t.score[0]).toBe(t.score[1]);
    });
});

describe("selectPatches — through the codec", () => {
    it("every stored patch decodes back to exactly its level's pixels at (left, top)", async () => {
        const cv = await createJsfeatNextBackend();
        const source = readPgm(TARGET_FIXTURE);
        const built = buildTargetFromImage(cv, source, { levels: 4 });
        const target = pyramidOf(source, built.pyramid.scaleStep, built.pyramid.levelSizes.length);
        target.levels.forEach((l, i) =>
            expect([l.width, l.height]).toEqual(built.pyramid.levelSizes[i]),
        );

        const patches = ok(
            selectPatches(target, { patchSize: 16, maxPatches: 32, minScore: 10, minSpacing: 40 }),
        );
        const written = encode({ ...built, patches });
        if (!written.ok) throw new Error(`encode: ${written.error} ${written.detail}`);
        const decoded = decode(written.bytes);
        if (!decoded.ok) throw new Error(`decode: ${decoded.error} ${decoded.detail}`);
        expect(decoded.warnings).toEqual([]);

        const back = decoded.target.patches!;
        expect(back.count).toBe(patches.count);
        const P = back.patchSize;
        for (let q = 0; q < back.count; q++) {
            expect(back.pixels.subarray(q * P * P, (q + 1) * P * P)).toEqual(
                windowOf(target.levels[back.level[q]], back.left[q], back.top[q], P),
            );
        }
    });
});
