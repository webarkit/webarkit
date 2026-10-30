/*
 *  bench-stats.mjs
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
 * The order statistics every summary reports its samples with, and the two
 * helpers the metrics filter and add samples with.
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, except the helpers this module shares with the
 * other `bench-*.mjs` modules, listed at its end.
 */

/**
 * The sample at rank `⌊p/100 · n⌋` of an ascending array, clamped to the last;
 * `NaN` when there is none. The page's definition since its first export.
 */
export function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0) return NaN;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
    return sortedAsc[idx];
}

/** `{ n, min, p50, p95, max }` of `values`, sorting a copy; every statistic `null` when there are none. */
export function stats(values) {
    if (values.length === 0) return { n: 0, min: null, p50: null, p95: null, max: null };
    const s = [...values].sort((a, b) => a - b);
    return {
        n: s.length,
        min: s[0],
        p50: percentile(s, 50),
        p95: percentile(s, 95),
        max: s[s.length - 1],
    };
}

/** The finite numbers among `values`: a record that lacks a timing is not a sample of it. */
const finite = (values) => values.filter(Number.isFinite);

const sum = (values) => values.reduce((a, b) => a + b, 0);

// Shared with the other bench-*.mjs modules; bench-metrics.mjs does not re-export them.
export { finite, sum };
