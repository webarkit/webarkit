/*
 *  compare-bench.mjs
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
 * Two `bench-nft.html` exports of the same footage, side by side: each run's
 * summary, recomputed from its frames, and the corners' jitter and spread on
 * the frames both runs posed; then, in the same table, the pose part
 * (metricsVersion 2): each run's whole-window `poseJitterPx` and
 * `poseSpreadPx` with its posed frames, and `compareExports`' pose part on the
 * media times both have `poseCorners`, `poseCornerDistancePx` included, or one
 * row saying why there is none (`compareExports` and `DEFINITIONS` in
 * examples/js/bench-metrics.mjs define every number printed here). Only what
 * those already compute is printed.
 *
 *     node scripts/compare-bench.mjs <first.json> <second.json>
 *
 * Exits 1, with a one-line reason, on two exports it cannot align; 2 on bad
 * usage.
 */

import { readFileSync } from "node:fs";
import { compareExports, DEFINITIONS, summarizeRun } from "../examples/js/bench-metrics.mjs";

const [firstPath, secondPath] = process.argv.slice(2);
if (!firstPath || !secondPath) {
    console.error("usage: node scripts/compare-bench.mjs <first.json> <second.json>");
    process.exit(2);
}
/** An export, or exit with one line: 2 for a file that cannot be read, 1 for one that is not JSON. */
function load(path) {
    let text;
    try {
        text = readFileSync(path, "utf8");
    } catch (e) {
        console.error(`cannot read ${path}: ${e.message}`);
        process.exit(2);
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`cannot parse ${path} as JSON: ${e.message}`);
        process.exit(1);
    }
}
const first = load(firstPath);
const second = load(secondPath);

let aligned;
try {
    aligned = compareExports(first, second);
} catch (e) {
    console.error(e.message);
    process.exit(1);
}
if (first.source === "file") {
    console.warn(
        "Both are 'video file' runs: nothing in the exports shows they used the same file.",
    );
}

const a = summarizeRun(first.frames);
const b = summarizeRun(second.frames);
const num = (v, digits) => (v === null || v === undefined ? "—" : v.toFixed(digits));
const share = (v) => (v === null ? "—" : `${(100 * v).toFixed(1)}%`);
const ms = (s) => (s.n > 0 ? `${num(s.p50, 2)} / ${num(s.p95, 2)} (n ${s.n})` : "—");
const name = (e, path) => `${e.mode}, ${e.target?.file ?? "target not recorded"} (${path})`;
const counts = (s) => `${s.frames} (${s.states.LOST} / ${s.states.DETECT} / ${s.states.TRACK})`;
const rows = [
    ["run", name(first, firstPath), name(second, secondPath)],
    ["footage", first.bundledClip ?? first.source, second.bundledClip ?? second.source],
    ["frames (LOST / DETECT / TRACK)", counts(a), counts(b)],
    ["TRACK share", share(a.trackShare), share(b.trackShare)],
    [
        "re-acquisitions (at loop wraps)",
        `${a.reacquisitions} (${a.reacquisitionsAtLoopWrap})`,
        `${b.reacquisitions} (${b.reacquisitionsAtLoopWrap})`,
    ],
    [
        "first steps confirmed",
        `${a.firstSteps.confirmed} / ${a.firstSteps.n}`,
        `${b.firstSteps.confirmed} / ${b.firstSteps.n}`,
    ],
    [
        "held-lock steps lost (at loop wraps)",
        `${a.heldLockSteps.lost} / ${a.heldLockSteps.n} (${a.heldLockSteps.lostAtLoopWrap})`,
        `${b.heldLockSteps.lost} / ${b.heldLockSteps.n} (${b.heldLockSteps.lostAtLoopWrap})`,
    ],
    ["trackStepMs p50 / p95", ms(a.trackStepMs), ms(b.trackStepMs)],
    ["pyramidMs p50 / p95", ms(a.pyramidMs), ms(b.pyramidMs)],
    ["capped fits / fits", `${a.fits.capped} / ${a.fits.n}`, `${b.fits.capped} / ${b.fits.n}`],
    ["jitterPx, whole window", num(a.jitterPx, 3), num(b.jitterPx, 3)],
    ["spreadPx, whole window", num(a.spreadPx, 3), num(b.spreadPx, 3)],
    [
        `jitterPx, ${aligned.commonMediaTimes} common media times`,
        num(aligned.first.jitterPx, 3),
        num(aligned.second.jitterPx, 3),
    ],
    [
        `spreadPx, ${aligned.commonMediaTimes} common media times`,
        num(aligned.first.spreadPx, 3),
        num(aligned.second.spreadPx, 3),
    ],
];

// The pose part (metricsVersion 2): each run's whole window, then the common media times
// compareExports found. A version 1 export records no poseCorners, so its cells read "—".
const v2 = (e) => e.metricsVersion === 2;
const wholePose = (e, s, key, digits) => (!v2(e) ? "—" : num(s[key], digits));
rows.push(
    [
        "posePosedFrames, whole window",
        wholePose(first, a, "posePosedFrames", 0),
        wholePose(second, b, "posePosedFrames", 0),
    ],
    [
        "poseJitterPx, whole window",
        wholePose(first, a, "poseJitterPx", 3),
        wholePose(second, b, "poseJitterPx", 3),
    ],
    [
        "poseSpreadPx, whole window",
        wholePose(first, a, "poseSpreadPx", 3),
        wholePose(second, b, "poseSpreadPx", 3),
    ],
);
const { pose } = aligned;
if (pose === null) {
    // compareExports' pose part is null for one of these two reasons, which it does not return.
    const v1 = [
        ["first", first],
        ["second", second],
    ].filter(([, e]) => !v2(e));
    // Each export compareExports reads is version 1 or 2, so "not 2" is version 1.
    const which =
        v1.length === 2 ? "both exports are" : v1.length === 1 ? `the ${v1[0][0]} export is` : null;
    const why =
        which !== null
            ? `${which} metricsVersion 1, which records no poseCorners`
            : "no media time has poseCorners in both runs";
    rows.push(["pose part, common media times", `none: ${why}`, ""]);
} else {
    const at = `${pose.commonMediaTimes} common media times`;
    rows.push(
        [
            `poseJitterWindows, ${at}`,
            num(pose.first.poseJitterWindows, 0),
            num(pose.second.poseJitterWindows, 0),
        ],
        [`poseJitterPx, ${at}`, num(pose.first.poseJitterPx, 3), num(pose.second.poseJitterPx, 3)],
        [`poseSpreadPx, ${at}`, num(pose.first.poseSpreadPx, 3), num(pose.second.poseSpreadPx, 3)],
        [
            `poseCornerDistancePx, the pair's median over ${pose.commonFrames} common frames: descriptive, never a criterion`,
            num(pose.poseCornerDistancePx, 3),
            "",
        ],
    );
}

console.log("| | first | second |");
console.log("|---|---|---|");
for (const [label, x, y] of rows) console.log(`| ${label} | ${x} | ${y} |`);
const defined = [
    ["jitterPx", DEFINITIONS.jitterPx],
    ["spreadPx", DEFINITIONS.spreadPx],
    ["Common media times", DEFINITIONS.alignment],
    ["posePosedFrames", DEFINITIONS.posePosedFrames],
    ["poseJitterPx", DEFINITIONS.poseJitterPx],
    ["poseSpreadPx", DEFINITIONS.poseSpreadPx],
    ...(pose === null
        ? []
        : [
              ["poseJitterWindows", DEFINITIONS.poseJitterWindows],
              ["poseCornerDistancePx", DEFINITIONS.poseCornerDistancePx],
          ]),
];
console.log(`\n${defined.map(([key, text]) => `${key}: ${text}`).join("\n\n")}`);
