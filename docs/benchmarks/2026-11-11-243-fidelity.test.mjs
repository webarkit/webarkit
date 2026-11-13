/*
 *  2026-11-11-243-fidelity.test.mjs
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
 * The fidelity share's tests: `node --test docs/benchmarks/2026-11-11-243-fidelity.test.mjs`. Not
 * run by `npm test`. Every case is a constructed pair of runs; none reads a device export.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { fidelity, framesOf } from "./2026-11-11-243-fidelity.mjs";

const fr = (t, m) => ({ mediaTimeSeconds: t, numMatches: m });

/** A frame that throws if anything but its media time and its matches is read. */
const guarded = (t, m) =>
    new Proxy(fr(t, m), {
        get(target, key) {
            if (key !== "mediaTimeSeconds" && key !== "numMatches") throw new Error(`read ${String(key)}`);
            return target[key];
        },
    });

test("alike at every repeated media time: no differing pair, share 0", () => {
    const r = fidelity([
        [fr(0.1, 40), fr(0.2, 41), fr(0.1, 40)],
        [fr(0.1, 40), fr(0.2, 41)],
    ]);
    assert.deepEqual(r.pairs, { within: 1, across: 3, total: 4 });
    assert.deepEqual(r.differ, { within: 0, across: 0, total: 0 });
    assert.equal(r.share, 0);
    assert.equal(r.repeated, 2);
    assert.equal(r.timesDiffering, 0);
});

test("a pair differing across the two runs is counted, and only there", () => {
    const r = fidelity([[fr(0.1, 40), fr(0.2, 41)], [fr(0.1, 39), fr(0.2, 41)]]);
    assert.deepEqual(r.pairs, { within: 0, across: 2, total: 2 });
    assert.deepEqual(r.differ, { within: 0, across: 1, total: 1 });
    assert.equal(r.share, 0.5);
    assert.equal(r.timesDiffering, 1);
});

test("a pair differing within one run is counted as within", () => {
    const r = fidelity([[fr(0.1, 40), fr(0.1, 42), fr(0.3, 7)], [fr(0.5, 1)]]);
    assert.deepEqual(r.pairs, { within: 1, across: 0, total: 1 });
    assert.deepEqual(r.differ, { within: 1, across: 0, total: 1 });
    assert.equal(r.share, 1);
});

test("three visits at one time give three pairs; one odd visit makes two of them differ", () => {
    const r = fidelity([[fr(1, 10), fr(1, 10)], [fr(1, 11)]]);
    assert.deepEqual(r.pairs, { within: 1, across: 2, total: 3 });
    assert.deepEqual(r.differ, { within: 0, across: 2, total: 2 });
    assert.equal(r.share, 2 / 3);
});

test("media times visited once give no pair, and no share", () => {
    const r = fidelity([[fr(0.1, 40)], [fr(0.2, 40)]]);
    assert.equal(r.pairs.total, 0);
    assert.equal(r.share, null);
});

test("media times are compared exactly: a microsecond apart is not a pair", () => {
    const r = fidelity([[fr(0.033333, 40)], [fr(0.033334, 41)]]);
    assert.equal(r.pairs.total, 0);
});

test("it reads each frame's media time and numMatches, and nothing else", () => {
    const r = fidelity([[guarded(0.1, 40)], [guarded(0.1, 41)]]);
    assert.equal(r.differ.total, 1);
});

test("a frame without an integer numMatches or a finite media time is refused", () => {
    assert.throws(() => fidelity([[fr(0.1, null)], [fr(0.1, 1)]]), /numMatches/);
    assert.throws(() => fidelity([[fr(Number.NaN, 1)], [fr(0.1, 1)]]), /mediaTimeSeconds/);
});

test("an export that is not a detection-only run is refused", () => {
    assert.throws(() => framesOf({ mode: "tracking", frames: [fr(0, 1)] }, "x"), /not "detection-only"/);
    assert.throws(() => framesOf({ mode: "detection-only", frames: [] }, "x"), /no frames/);
    assert.equal(framesOf({ mode: "detection-only", frames: [fr(0, 1)] }, "x").length, 1);
});
