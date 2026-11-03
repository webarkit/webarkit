/*
 *  seeded_rng.ts
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

import type { CvBackend } from "@webarkit/cv-backend-spec";

/**
 * mulberry32 — a 32-bit PRNG, four lines, period 2^32. Far longer than any
 * RANSAC run will consume, and identical across platforms, which `Math.random`
 * is not.
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** `mulberry32(seed)`, and how many numbers it has handed out. */
export interface CountedRng {
    /** The generator: the same sequence as `mulberry32(seed)`. */
    readonly rng: () => number;
    /** Draws made from `rng` so far. */
    readonly draws: () => number;
}

/** `mulberry32(seed)` wrapped in a counter. */
export function countedMulberry32(seed: number): CountedRng {
    const next = mulberry32(seed);
    let draws = 0;
    return {
        rng: () => {
            draws++;
            return next();
        },
        draws: () => draws,
    };
}

/**
 * Throws unless `cv` declares `capabilities.deterministicRansac`. A backend
 * that does not honour `RansacOptions.rng` ignores it, as the contract
 * allows, so a seeded run on it would be silently unseeded: every caller that
 * relies on the draws checks first (webarkit/webarkit#137, "Usage rule,
 * 2026-10-15", point 1).
 */
export function requireDeterministicRansac(cv: CvBackend): void {
    if (cv.capabilities.deterministicRansac !== true) {
        throw new Error(
            `seeded_rng: backend "${cv.capabilities.name}" does not declare deterministicRansac, so an injected rng may be ignored; refusing to run seeded`,
        );
    }
}

/**
 * Runs `run` with the global `Math.random` counted, then puts the real one
 * back, even when `run` throws. A counting wrapper, not a seeded one: each
 * read is passed to the real `Math.random`, so the region's results are what
 * they would be without it.
 */
export function countGlobalRandomReads<T>(run: () => T): {
    readonly value: T;
    readonly reads: number;
} {
    const real = Math.random;
    let reads = 0;
    Math.random = () => {
        reads++;
        return real();
    };
    try {
        // `value` is evaluated before `reads` is read, so the count is final.
        return { value: run(), reads };
    } finally {
        Math.random = real;
    }
}

/** What a seeded region produced, and how much randomness it consumed. */
export interface SeededRun<T> {
    readonly value: T;
    /** Draws made from the region's generator. */
    readonly draws: number;
}

/**
 * Seeded regions whose generator a tracker built outside them can reach:
 * `rngFor` is the `NftTrackerOptions.rngFor` to give it.
 *
 * Each `run` makes a FRESH `countedMulberry32(seed)`, which is the point: two
 * pipelines drawing in turn from one generator would consume different
 * tails, and comparing them would prove nothing. Inside a region `rngFor`
 * answers with that region's generator, the same one on every call: one
 * generator per run, as before webarkit/webarkit#188, so the draws are the
 * ones the global swap made. Outside a region it answers `undefined`, which
 * leaves the draw to the backend, exactly as an unseeded call was before.
 *
 * **Why it counts.** The region's `draws` pins where randomness is consumed:
 * the parity test asserts that both pipelines draw the same amount, so a
 * change in how RANSAC consumes the generator fails an assertion that names
 * it instead of quietly moving the numbers. And every region counts reads of
 * the global `Math.random` and throws on any (#137's usage rule, point 3):
 * with the generator injected, a read of the global is a random choice that
 * bypassed it.
 */
export interface SeededSource {
    readonly rngFor: () => (() => number) | undefined;
    run<T>(seed: number, run: (rng: () => number) => T): SeededRun<T>;
}

/** A {@link SeededSource} for `cv`, which must declare `deterministicRansac`. */
export function seededSource(cv: CvBackend): SeededSource {
    requireDeterministicRansac(cv);
    let current: CountedRng | null = null;
    return {
        rngFor: () => current?.rng,
        run<T>(seed: number, run: (rng: () => number) => T): SeededRun<T> {
            if (current !== null) throw new Error("seeded_rng: seeded regions do not nest");
            const counted = countedMulberry32(seed);
            current = counted;
            try {
                const { value, reads } = countGlobalRandomReads(() => run(counted.rng));
                if (reads !== 0) {
                    throw new Error(
                        `seeded_rng: ${reads} read(s) of the global Math.random in a seeded region, with the rng injected`,
                    );
                }
                return { value, draws: counted.draws() };
            } finally {
                current = null;
            }
        },
    };
}

/** One seeded region on `cv`: `seededSource(cv).run(seed, run)`. */
export function withSeededRng<T>(
    cv: CvBackend,
    seed: number,
    run: (rng: () => number) => T,
): SeededRun<T> {
    return seededSource(cv).run(seed, run);
}
