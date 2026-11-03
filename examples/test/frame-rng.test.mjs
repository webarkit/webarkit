/*
 *  frame-rng.test.mjs
 *  webarkit
 *
 *  This file is part of webarkit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

import { describe, expect, it } from "vitest";
import { frameKey, frameRng, frameSeed, mulberry32, runRng } from "../js/frame-rng.mjs";
import { mulberry32 as fixtureMulberry32 } from "../../packages/nft-tracker/ground-truth/fixtures/seeded_rng.ts";

const draws = (rng, n) => Array.from({ length: n }, () => rng());

describe("mulberry32", () => {
    // One generator, not two that drift: the ground truth's fixture is the
    // reference every seeded run of the package was measured with (#188).
    it.each([0, 1, 2, 42, 20261015, 0x9e3779b9, 0xffffffff, -1, -4294967295])(
        "draws what the ground truth's seeded_rng.ts draws, seed %i",
        (seed) => {
            expect(draws(mulberry32(seed), 64)).toEqual(draws(fixtureMulberry32(seed), 64));
        },
    );
});

describe("runRng", () => {
    it("is mulberry32 of the seed: #188's per-run policy", () => {
        expect(draws(runRng(7), 32)).toEqual(draws(mulberry32(7), 32));
    });
});

describe("frameKey", () => {
    it("is the media time in microseconds, rounded", () => {
        expect(frameKey(0)).toBe(0);
        expect(frameKey(1 / 30)).toBe(33333);
        expect(frameKey(2178 / 73)).toBe(29835616);
        expect(frameKey(1.0000004)).toBe(1000000);
        expect(frameKey(1.0000006)).toBe(1000001);
    });

    it("gives the same key to times that differ only by floating-point noise", () => {
        expect(0.1 + 0.2).not.toBe(0.3);
        expect(frameKey(0.1 + 0.2)).toBe(frameKey(0.3));
        expect(frameKey(10 * (1 / 30))).toBe(frameKey(1 / 3));
    });
});

describe("frameSeed", () => {
    it("is a 32-bit unsigned integer", () => {
        for (const [seed, key] of [
            [0, 0],
            [1, 33333],
            [-1, 1e9],
            [0xffffffff, 2 ** 40 + 5],
        ]) {
            const s = frameSeed(seed, key);
            expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
        }
    });

    it("depends on the key's high word as well as its low one", () => {
        expect(frameSeed(1, 5)).not.toBe(frameSeed(1, 2 ** 32 + 5));
    });

    it("is not the seed XORed with the key", () => {
        // Under seed ^ key, (1, 2) and (2, 1) would meet, and so would every
        // pair whose XOR agrees.
        expect(frameSeed(1, 2)).not.toBe(frameSeed(2, 1));
        expect(frameSeed(1, 33333)).not.toBe((1 ^ 33333) >>> 0);
    });
});

describe("frameRng", () => {
    it("is mulberry32 of frameSeed(seed, frameKey(mediaTimeSeconds))", () => {
        const t = 7 / 30;
        expect(draws(frameRng(3, t), 32)).toEqual(draws(mulberry32(frameSeed(3, frameKey(t))), 32));
    });

    it("gives the same stream for the same seed and frame, each call a fresh generator", () => {
        const a = frameRng(1, 0.5);
        const first = draws(a, 100);
        expect(draws(frameRng(1, 0.5), 100)).toEqual(first);
        // A fresh one, not the first one advanced.
        expect(draws(a, 100)).not.toEqual(first);
    });

    it("gives unrelated streams to adjacent keys", () => {
        // Adjacent microseconds, and adjacent frames of a 30 fps clip.
        for (const step of [1e-6, 1 / 30]) {
            const firsts = Array.from({ length: 2000 }, (_, i) => frameRng(1, i * step)());
            for (let i = 1; i < firsts.length; i++) expect(firsts[i]).not.toBe(firsts[i - 1]);
            expect(new Set(firsts).size).toBe(firsts.length);
            // Spread over [0, 1), not clustered: about 200 in each tenth.
            const tenths = Array.from({ length: 10 }, () => 0);
            for (const x of firsts) tenths[Math.floor(x * 10)]++;
            for (const n of tenths) expect(n).toBeGreaterThan(140);
            // And no successor tracks its predecessor: the mean gap is about 1/3.
            const gap =
                firsts.slice(1).reduce((s, x, i) => s + Math.abs(x - firsts[i]), 0) /
                (firsts.length - 1);
            expect(gap).toBeGreaterThan(0.3);
            expect(gap).toBeLessThan(0.37);
        }
    });

    it("gives different streams to different seeds on the same frame", () => {
        expect(draws(frameRng(1, 0.5), 8)).not.toEqual(draws(frameRng(2, 0.5), 8));
    });

    it.each([
        ["a fractional seed", 1.5, 0],
        ["a seed past 32 bits", 2 ** 32, 0],
        ["a seed that is not a number", "1", 0],
        ["a negative media time", 1, -0.001],
        ["a media time that is not finite", 1, Number.NaN],
        ["a media time that is infinite", 1, Number.POSITIVE_INFINITY],
    ])("refuses %s", (_, seed, t) => {
        expect(() => frameRng(seed, t)).toThrow(RangeError);
    });
});
