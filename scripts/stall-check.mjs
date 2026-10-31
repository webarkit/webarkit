/*
 *  stall-check.mjs
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
 * The stall check over one `bench-nft.html` export (`stallCheck` in
 * examples/js/bench-stall.mjs defines every arm and bound printed here):
 *
 *     node scripts/stall-check.mjs <export.json>
 *
 * Exits 0 if every arm passes, and 1 if any fails, an export with no clip
 * duration, fewer than two frames, a `frames` that is not a list, or a frame
 * among them that is not an object or whose media time is not finite. Exits 2,
 * with one line and no verdict, when there is no check to run: no path given,
 * a file it cannot read, one that is not JSON, or JSON that is not an object
 * (`null`, a number, a string, a boolean or an array: no export). On every
 * export it reads, its output lines are the ones the copy embedded in
 * docs/benchmarks/2026-10-01-m3-session-additions.md printed (#117); that
 * copy threw where this exits 2.
 */

import { readFileSync } from "node:fs";
import {
    BOUND_MS,
    DEVICE_MAX_MS,
    EXCESS_FRACTION,
    stallCheck,
} from "../examples/js/bench-stall.mjs";

const [path] = process.argv.slice(2);
if (!path) {
    console.error("usage: node scripts/stall-check.mjs <export.json>");
    process.exit(2);
}
/**
 * The export, or exit 2 with one line. Not 1, as compare-bench.mjs exits on a
 * file that is not JSON: here 1 is a stall check that ran and failed.
 */
function load(path) {
    let text;
    try {
        text = readFileSync(path, "utf8");
    } catch (e) {
        console.error(`cannot read ${path}: ${e.message}`);
        process.exit(2);
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch (e) {
        console.error(`cannot parse ${path} as JSON: ${e.message}`);
        process.exit(2);
    }
    // An export is an object: anything else is no export to check (#206).
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        const what =
            value === null ? "null" : Array.isArray(value) ? "an array" : `a ${typeof value}`;
        console.error(`${path} is not a JSON object: ${what}`);
        process.exit(2);
    }
    return value;
}

const r = stallCheck(load(path));
if (r.maxGap !== null) {
    console.log(
        `largest gap ${r.maxGap.toFixed(1)} ms (frame ${r.maxAt}); loops seen 0–${r.loops}, read ${r.read.join(", ") || "none"}; most excess over ${DEVICE_MAX_MS} ms in a loop read ${r.worstExcess.toFixed(0)} ms; bounds ${BOUND_MS} ms a gap, ${(100 * EXCESS_FRACTION).toFixed(0)}% of a loop in excess`,
    );
}
for (const line of r.fails) console.log(`FAIL ${line}`);
console.log(r.fails.length ? "stall check: FAIL" : "stall check: PASS");
process.exit(r.fails.length ? 1 : 0);
