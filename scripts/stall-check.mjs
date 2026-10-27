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
 * Exits 0 if every arm passes, 1 if any fails. Its output lines are the ones
 * the copy embedded in docs/benchmarks/2026-10-01-m3-session-additions.md
 * printed (#117).
 */

import { readFileSync } from "node:fs";
import {
    BOUND_MS,
    DEVICE_MAX_MS,
    EXCESS_FRACTION,
    stallCheck,
} from "../examples/js/bench-stall.mjs";

const r = stallCheck(JSON.parse(readFileSync(process.argv[2], "utf8")));
if (r.maxGap !== null) {
    console.log(
        `largest gap ${r.maxGap.toFixed(1)} ms (frame ${r.maxAt}); loops seen 0–${r.loops}, read ${r.read.join(", ") || "none"}; most excess over ${DEVICE_MAX_MS} ms in a loop read ${r.worstExcess.toFixed(0)} ms; bounds ${BOUND_MS} ms a gap, ${(100 * EXCESS_FRACTION).toFixed(0)}% of a loop in excess`,
    );
}
for (const line of r.fails) console.log(`FAIL ${line}`);
console.log(r.fails.length ? "stall check: FAIL" : "stall check: PASS");
process.exit(r.fails.length ? 1 : 0);
