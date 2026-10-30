/*
 *  ransac_rng.test.ts
 *  cv-backend-jsfeatnext
 *
 *  This file is part of cv-backend-jsfeatnext - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  cv-backend-jsfeatnext is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  cv-backend-jsfeatnext is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with cv-backend-jsfeatnext.  If not, see <http://www.gnu.org/licenses/>.
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

// #24: `RansacOptions.rng`. The hash below was recorded on the base, before the
// option was wired, under a seeded global `Math.random`; an absent `rng` must
// keep reproducing it byte for byte (#137, "Timing, 2026-10-15").

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, HomographyResult, RansacOptions } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend } from "../src/index";

/** The same mulberry32 the tracker's fixtures use, inlined: this package cannot import them. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Runs `fn` with `Math.random` replaced by `source`, counting the reads. */
function withGlobalRandom<T>(source: () => number, fn: () => T): { value: T; reads: number } {
    const original = Math.random;
    let reads = 0;
    Math.random = () => {
        reads++;
        return source();
    };
    try {
        const value = fn();
        return { value, reads };
    } finally {
        Math.random = original;
    }
}

/** `backend.test.ts`'s `noisyCorrespondences`, copied so this set stays fixed. */
function noisyCorrespondences(n: number, inlierFrac: number, seed: number) {
    let state = seed;
    const rand = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff), state / 0x7fffffff);
    const H = [1.15, 0.08, 12, -0.05, 1.08, 20, 0.00012, -0.00009, 1];
    const apply = (x: number, y: number) => {
        const w = H[6] * x + H[7] * y + H[8];
        return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    };
    const src = new Float64Array(n * 2);
    const dst = new Float64Array(n * 2);
    const nInliers = Math.round(n * inlierFrac);
    for (let i = 0; i < n; i++) {
        const x = rand() * 600;
        const y = rand() * 600;
        src[i * 2] = x;
        src[i * 2 + 1] = y;
        if (i < nInliers) {
            const [px, py] = apply(x, y);
            dst[i * 2] = px + (rand() - 0.5) * 1.5;
            dst[i * 2 + 1] = py + (rand() - 0.5) * 1.5;
        } else {
            dst[i * 2] = rand() * 700;
            dst[i * 2 + 1] = rand() * 700;
        }
    }
    return { src, dst };
}

/**
 * The fixed inputs: 2 sizes x 3 inlier fractions x 8 seeds, each estimated
 * with the defaults and with `threshold: 4`, 96 calls in all. Call `i`
 * runs under the global seed `1000 + i`.
 */
const CASES: { src: Float64Array; dst: Float64Array; options: RansacOptions; seed: number }[] = [];
for (const n of [40, 95])
    for (const frac of [0.5, 0.67, 0.9])
        for (let seed = 1; seed <= 8; seed++) {
            const c = noisyCorrespondences(n, frac, seed);
            for (const options of [{}, { threshold: 4 }])
                CASES.push({ ...c, options, seed: 1000 + CASES.length });
        }

/** ok, numInliers, H as little-endian float64 bytes, then the inlier mask. */
function serialize(r: HomographyResult): Uint8Array {
    const out = new Uint8Array(1 + 4 + 9 * 8 + r.inliers.length);
    const view = new DataView(out.buffer);
    view.setUint8(0, r.ok ? 1 : 0);
    view.setUint32(1, r.numInliers, true);
    for (let k = 0; k < 9; k++) view.setFloat64(5 + 8 * k, r.H[k], true);
    out.set(r.inliers, 5 + 72);
    return out;
}

async function sha256(parts: Uint8Array[]): Promise<string> {
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        all.set(p, at);
        at += p.length;
    }
    const digest = await crypto.subtle.digest("SHA-256", all);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let cv: CvBackend;
beforeAll(async () => {
    cv = await createJsfeatNextBackend();
});

describe("estimateHomography without an rng is what it was before #24 (the changed path's hash)", () => {
    // Recorded on the base (origin/dev 90cb2a5), twice, before the option
    // was wired: 96 results.
    const BASE_SHA256 = "1ee85cd0b0c54a1f8b35a2ae807bac11e4deb0659dd95abbfce1a3ad9f605fee";

    it("reproduces the base's 96 results byte for byte under a seeded Math.random", async () => {
        const parts = CASES.map((c) => {
            const { value, reads } = withGlobalRandom(mulberry32(c.seed), () =>
                cv.estimateHomography(c.src, c.dst, c.options),
            );
            // RANSAC did draw: the hash is over results that had choices to make.
            expect(reads).toBeGreaterThan(0);
            return serialize(value);
        });
        expect(parts.length).toBe(96);
        const hash = await sha256(parts);
        console.log(`(b) estimateHomography, no rng: ${parts.length} results, sha256 ${hash}`);
        expect(hash).toBe(BASE_SHA256);
    });
});

describe("RansacOptions.rng (#24)", () => {
    const { src, dst } = noisyCorrespondences(95, 0.67, 42);

    it("is declared: the capabilities say deterministicRansac", () => {
        expect(cv.capabilities.deterministicRansac).toBe(true);
    });

    it("the same input with the same seeded rng gives the same result twice", () => {
        // Over the 96 fixed inputs, each pair under a different global
        // Math.random: were the rng not honoured, the two calls would draw
        // from different sequences. Measured on 2026-10-24: two different
        // rngs change 50 of these 96 results, and with the adapter's
        // `options?.rng` removed this test fails.
        for (const c of CASES) {
            const call = (globalSeed: number) =>
                withGlobalRandom(mulberry32(globalSeed), () =>
                    cv.estimateHomography(c.src, c.dst, { ...c.options, rng: mulberry32(c.seed) }),
                ).value;
            const a = call(1);
            const b = call(2);
            expect(Array.from(serialize(b))).toEqual(Array.from(serialize(a)));
        }
        // A different rng is allowed to give a different result; nothing is
        // asserted about it beyond being a valid fit.
        const c = cv.estimateHomography(src, dst, { threshold: 4, rng: mulberry32(8) });
        expect(c.ok).toBe(true);
    });

    it("reads Math.random zero times with an rng injected, and more than zero without one", () => {
        // The second half keeps the first from passing vacuously: the same
        // call does read the global when no rng is passed.
        const injected = withGlobalRandom(mulberry32(1), () =>
            cv.estimateHomography(src, dst, { threshold: 4, rng: mulberry32(7) }),
        );
        expect(injected.reads).toBe(0);
        const absent = withGlobalRandom(mulberry32(1), () =>
            cv.estimateHomography(src, dst, { threshold: 4 }),
        );
        expect(absent.reads).toBeGreaterThan(0);
    });
});
