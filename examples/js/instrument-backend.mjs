/*
 *  instrument-backend.mjs
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
 * Wraps a `CvBackend` so every call to the five stages the contract
 * documents is timed into `timings`, in place. This is what lets both
 * pipelines in `bench-nft.html` be timed stage-by-stage without instrumenting
 * either one directly: `NftTracker` only ever reaches the backend through the
 * instance handed to its constructor, and the stateless pipeline calls the
 * same instance directly, so one wrapper covers both. The detection worker
 * wraps its own backend the same way, which is why this lives in a module of
 * its own rather than inline in the page: the page and the worker time a
 * stage by one definition.
 *
 * `timings` needs a slot (a number, normally `0`) for every stage the wrapped
 * backend has: a call adds its duration to that slot. The keys are
 * `detect`, `describe`, `match`, `estimateHomography`, `pose` (for
 * `poseFromHomography`) and, when the backend has one, `filterMatches`.
 * `clock` returns milliseconds; it defaults to `performance.now()`, which a
 * page and a worker both have, and a test can pass its own.
 */
export function instrumentBackend(cv, timings, clock = () => performance.now()) {
    const time = (name, fn) => {
        const t0 = clock();
        const result = fn();
        timings[name] += clock() - t0;
        return result;
    };
    const wrapped = {
        capabilities: cv.capabilities,
        detect: (...args) => time("detect", () => cv.detect(...args)),
        describe: (...args) => time("describe", () => cv.describe(...args)),
        match: (...args) => time("match", () => cv.match(...args)),
        estimateHomography: (...args) => time("estimateHomography", () => cv.estimateHomography(...args)),
        poseFromHomography: (...args) => time("pose", () => cv.poseFromHomography(...args)),
    };
    if (cv.filterMatches) {
        wrapped.filterMatches = (...args) => time("filterMatches", () => cv.filterMatches(...args));
    }
    return wrapped;
}
