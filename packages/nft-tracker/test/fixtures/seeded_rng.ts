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

/** What a seeded region produced, and how much randomness it consumed. */
export interface SeededRun<T> {
    readonly value: T;
    /** `Math.random` calls made inside the region. */
    readonly draws: number;
}

/**
 * Runs `run` with `Math.random` replaced by a seeded, counting generator, then
 * puts the real one back.
 *
 * TEMPORARY, and the least pleasant thing in this test suite. The only random
 * choice in the tracker's pipeline is the minimal-sample draw inside
 * `estimateHomography`, and the contract's `RansacOptions` carries no RNG for
 * a caller to seed — jsfeatNext's `ransac_params_t` accepts one as its fifth
 * argument, but `cv-backend-jsfeatnext` does not pass it through
 * (webarkit/webarkit#24). Until that lands, reaching the generator means
 * reaching the global.
 *
 * Each call installs a FRESH generator, which is the point: two pipelines
 * drawing in turn from one generator would consume different tails, and
 * comparing them would prove nothing. `finally` restores the real
 * `Math.random` even when `run` throws, so one failing test cannot leave the
 * rest of the file running on a stub.
 *
 * **Why it counts.** Swapping a global reaches every consumer of
 * `Math.random` in the process, not just RANSAC. That is harmless only for as
 * long as nothing else in the pipeline draws — true of jsfeatNext today, but
 * an observation about a dependency, not a guarantee, and exactly the kind of
 * assumption that rots silently. A new draw site upstream would shift the
 * sequence underneath every comparison built on this helper, and every symptom
 * would show up somewhere else. `draws` makes that self-checking: the parity
 * test asserts the deterministic stages draw zero and that both pipelines draw
 * the same amount, so a new site fails an assertion that names it instead of
 * quietly moving the numbers.
 *
 * When webarkit/webarkit#24 lands, DELETE the global swap — pass
 * `rng: mulberry32(seed)` to `estimateHomography` (and to `NftTrackerOptions`)
 * instead. **Keep the counting.** It is not a workaround for the global; it
 * pins where randomness is allowed to be consumed at all, which stays worth
 * knowing with an injected generator — the counter simply moves onto that
 * generator.
 */
export function withSeededRandom<T>(seed: number, run: () => T): SeededRun<T> {
    const real = Math.random;
    const seeded = mulberry32(seed);
    let draws = 0;
    Math.random = () => {
        draws++;
        return seeded();
    };
    try {
        // `value` is evaluated before `draws` is read, so the count is final.
        return { value: run(), draws };
    } finally {
        Math.random = real;
    }
}
