/*
 *  frame-rng.mjs
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

/**
 * The generators the instrument seeds RANSAC with (#151): the bench page, its
 * worker and `scripts/replay-clips.mjs` all build them here, so a frame drawn
 * on one path is drawn alike on the others. Each reaches the backend through
 * the contract's `RansacOptions.rng` (#24): the tracker's `rngFor` option and
 * `detectTarget`'s `rng` argument (#188), or `estimateHomography`'s `rng`.
 *
 * Two policies, named as the replay's `--seed-policy` and the exports'
 * `seedPolicy` name them:
 *
 * - **`run`** ({@link runRng}): one generator for the whole run, #188's. Its
 *   state advances from detection to detection, so the same frame draws
 *   differently in two runs that processed different frames before it.
 *   Reproducible for a fixed input sequence only, which is what parity tests
 *   and fixtures need (#151).
 * - **`frame`** ({@link frameRng}): a fresh generator for each detection,
 *   seeded from the run's seed and the detected frame's identity. The same
 *   frame draws the same samples in any run, whatever else it processed.
 *
 * A frame's identity is its media time, never the `timestampMs` given to
 * `process`: the page stamps frames with the frame callback's clock, and the
 * replay's external arms with their time on the loops' continuous timeline.
 * The key is that media time in microseconds, rounded ({@link frameKey}).
 *
 * Synchronous, with no dependencies, so the page and the worker import it
 * unbuilt, as the replay does.
 */

/**
 * mulberry32: a 32-bit generator, period 2^32. The same function, draw for
 * draw, as `packages/nft-tracker/ground-truth/fixtures/seeded_rng.ts`'s, which
 * a test holds; that file is TypeScript under `ground-truth/`, which neither
 * the page nor the replay can import.
 *
 * @param {number} seed - Read as a 32-bit unsigned integer.
 * @returns {() => number} Draws in [0, 1).
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The `run` policy's generator: `mulberry32(seed)`, created once for a run and
 * handed to every detection in it.
 *
 * @param {number} seed
 * @returns {() => number}
 */
export function runRng(seed) {
    return mulberry32(seed);
}

/**
 * A frame's key: its media time in microseconds, rounded to an integer. Two
 * readings of the same frame's time that differ by floating-point noise get
 * the same key; two frames of any clip, at least a millisecond apart, never do.
 *
 * @param {number} mediaTimeSeconds
 * @returns {number}
 */
export function frameKey(mediaTimeSeconds) {
    return Math.round(mediaTimeSeconds * 1e6);
}

/** MurmurHash3's 32-bit finaliser (`fmix32`): every input bit reaches every output bit. */
function fmix32(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * The 32-bit seed of one frame's generator: the run's seed and the frame key,
 * each 32-bit word absorbed by XOR and then mixed by MurmurHash3's finaliser,
 * in order: the seed, the key's low word, the key's high word. Adjacent keys
 * get unrelated seeds, which `seed ^ key` would not give: there, adjacent keys
 * differ in one bit of mulberry32's state, and two (seed, key) pairs with the
 * same XOR collide.
 *
 * @param {number} seed - Read as a 32-bit unsigned integer.
 * @param {number} key - A non-negative integer, at most 2^53.
 * @returns {number} An unsigned 32-bit integer.
 */
export function frameSeed(seed, key) {
    const lo = key % 4294967296;
    const hi = Math.floor(key / 4294967296);
    return fmix32(fmix32(fmix32(seed >>> 0) ^ lo) ^ hi);
}

/**
 * The `frame` policy's generator: a fresh mulberry32, seeded from `seed` and
 * the frame whose media time is `mediaTimeSeconds`. Build one per detection,
 * keyed on the frame detected.
 *
 * @param {number} seed - An integer in [-4294967295, 4294967295], the range
 *   the replay's `--seed` and the page's `?seed=` accept.
 * @param {number} mediaTimeSeconds - Finite and not negative.
 * @returns {() => number}
 * @throws {RangeError} On a seed or a media time out of those domains.
 */
export function frameRng(seed, mediaTimeSeconds) {
    if (!(Number.isSafeInteger(seed) && Math.abs(seed) <= 0xffffffff)) {
        throw new RangeError(`frameRng: seed must be an integer in ±4294967295, got ${seed}`);
    }
    if (!(Number.isFinite(mediaTimeSeconds) && mediaTimeSeconds >= 0)) {
        throw new RangeError(
            `frameRng: mediaTimeSeconds must be finite and not negative, got ${mediaTimeSeconds}`,
        );
    }
    return mulberry32(frameSeed(seed, frameKey(mediaTimeSeconds)));
}
