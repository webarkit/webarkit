/*
 *  2026-11-06-228-stage1-repeat-reads.mjs
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
 * Reads of 2026-11-06-228-stage1-repeat.mjs's per-frame rows, added after the independent review
 * of that record: what the loops' differences are in px, what a lock crossing a wrap amounts to,
 * and which frames set sweep's lower tilt. It runs no tracker and needs no build. It reads a run
 * directory, and that run's stdout and post-run stay as they were counted.
 *
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat-reads.mjs --self-test
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat-reads.mjs <run dir>
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const argv = process.argv.slice(2);
const breakAt = argv.indexOf("--break");
const BREAK = breakAt < 0 ? null : argv[breakAt + 1];
const fx = (v, d = 2) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
const median = (xs) => {
    const v = [...xs].sort((a, b) => a - b);
    const n = v.length;
    return n === 0 ? null : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};

/** The counted loops of one run's rows, by the stamp on the loops' continuous timeline, as the post-run reads them. */
function countedLoops(rows, durMs) {
    const loops = new Map();
    for (const r of rows) {
        const l = Math.floor(r.stamp / durMs + 1e-9);
        if (l < 1 || l > 4) continue;
        if (!loops.has(l)) loops.set(l, []);
        loops.get(l).push(r);
    }
    return [...loops.keys()].sort((a, b) => a - b).map((l) => loops.get(l));
}
/**
 * The largest corner difference under H between the counted loops at one media time, px, and how
 * many media times differ in state or are posed in some loops only.
 */
function loopDifference(loops) {
    const at = new Map();
    for (const loop of loops) {
        for (const r of loop) {
            if (!at.has(r.media)) at.set(r.media, []);
            at.get(r.media).push(r);
        }
    }
    let maxPx = 0;
    let stateDiffers = 0;
    for (const rs of at.values()) {
        if (new Set(rs.map((r) => r.state)).size > 1 || rs.length !== loops.length) {
            stateDiffers++;
            continue;
        }
        const posed = rs.filter((r) => r.corners && r.corners.H);
        for (let i = 1; i < posed.length; i++) {
            for (let c = 0; c < 4; c++) {
                const d = BREAK === "diff-x" ? Math.abs(posed[i].corners.H[c][1] - posed[0].corners.H[c][1]) : Math.hypot(posed[i].corners.H[c][0] - posed[0].corners.H[c][0], posed[i].corners.H[c][1] - posed[0].corners.H[c][1]);
                if (d > maxPx) maxPx = d;
            }
        }
    }
    return { maxPx, stateDiffers };
}
/** The consecutive TRACK frames from a run's frame `from` on. */
function trackRun(rows, from) {
    let n = 0;
    for (let k = from; k < rows.length && rows[k].state === "TRACK"; k++) n++;
    return BREAK === "run-off" ? n + 1 : n;
}

function selfTest() {
    const fails = [];
    const expect = (what, got, want) => {
        if (got !== want) fails.push(`${what}: ${got}, expected ${want}`);
    };
    const corners = (x) => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]];
    const row = (media, state, x, stamp = 0) => ({ media, state, stamp, corners: state === "LOST" ? null : { H: corners(x) } });
    const same = [[row(0, "TRACK", 1), row(1, "TRACK", 2)], [row(0, "TRACK", 1), row(1, "TRACK", 2)]];
    expect("loops equal", loopDifference(same).maxPx, 0);
    expect("loops equal: no state differs", loopDifference(same).stateDiffers, 0);
    const off = [[row(0, "TRACK", 1)], [{ ...row(0, "TRACK", 1), corners: { H: corners(1).map(([x, y]) => [x + 3, y + 4]) } }]];
    expect("a known offset, 3-4-5", loopDifference(off).maxPx, 5);
    const state = [[row(0, "TRACK", 1)], [row(0, "DETECT", 1)]];
    expect("a state differs", loopDifference(state).stateDiffers, 1);
    const missing = [[row(0, "TRACK", 1), row(1, "TRACK", 1)], [row(0, "TRACK", 1)]];
    expect("a media time in one loop only", loopDifference(missing).stateDiffers, 1);
    const seq = [row(0, "TRACK", 1), row(1, "TRACK", 1), row(2, "DETECT", 1), row(3, "TRACK", 1)];
    expect("a TRACK run of 2", trackRun(seq, 0), 2);
    expect("a TRACK run of 0", trackRun(seq, 2), 0);
    expect("a TRACK run to the end", trackRun(seq, 3), 1);
    const loops = countedLoops([{ stamp: 5 }, { stamp: 10 }, { stamp: 25 }, { stamp: 49.9 }, { stamp: 50 }], 10);
    expect("loops by stamp: 0 and 5 dropped, 1, 2 and 4 kept", loops.length, 3);
    expect("loops by stamp: loop 1", loops[0].length, 1);
    if (fails.length) {
        for (const f of fails) process.stderr.write(`self-test: ${f}\n`);
        process.stderr.write(`self-test: ${fails.length} failed${BREAK ? ` (--break ${BREAK})` : ""}\n`);
        process.exit(1);
    }
    process.stdout.write(`self-test: all passed${BREAK ? ` (--break ${BREAK})` : ""}\n`);
}
if (argv.includes("--self-test")) {
    selfTest();
    process.exit(0);
}

const dir = argv[0];
if (!dir) {
    process.stderr.write("a run directory is required\n");
    process.exit(2);
}
const say = (l = "") => process.stdout.write(`${l}\n`);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SCHEDULES = [["every", "every frame"], ["15", "device, 15 and 25 ms, acquisition BORROWED from the static clip, 36.9 ms, not measured"]];
const CLIPS = ["pinball-tilt-cross", "pinball-tilt-mid", "pinball-tilt-sweep"];
const rowsOf = (stem, s, seed) =>
    readFileSync(join(dir, `${stem}-${s}-s${seed}.jsonl`), "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));

say("# 2026-11-06-228-stage1-repeat-reads.mjs");
say(`this script's source, SHA-256: ${createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex")}`);
for (const stem of CLIPS) {
    const res = JSON.parse(readFileSync(join(dir, `${stem}.result.json`), "utf8"));
    const durMs = res.clipDurationS * 1000;
    for (const [s, label] of SCHEDULES) {
        say();
        say(`## ${stem}, ${label}`);
        say("| seed | largest corner difference under H between the counted loops, px | media times differing in state, or in some loops only | first frame after each wrap: state, inliers, tilt | consecutive TRACK frames from it, per wrap |");
        say("|---|---|---|---|---|");
        for (const seed of SEEDS) {
            const rows = rowsOf(stem, s, seed);
            const d = loopDifference(countedLoops(rows, durMs));
            const firsts = [];
            const runs = [];
            for (let k = 1; k < rows.length; k++) {
                const l = Math.floor(rows[k].stamp / durMs + 1e-9);
                if (l < 2 || l > 4) continue;
                if (rows[k].media < rows[k - 1].media) {
                    firsts.push(`${rows[k].state}, ${rows[k].inliers}, ${fx(rows[k].tilt)}`);
                    runs.push(trackRun(rows, k));
                }
            }
            say(`| ${seed} | ${d.maxPx.toExponential(1)} | ${d.stateDiffers} | ${[...new Set(firsts)].join("; ")} | ${[...new Set(runs)].join(", ")} |`);
        }
    }
}
const stem = "pinball-tilt-sweep";
const dur = JSON.parse(readFileSync(join(dir, `${stem}.result.json`), "utf8")).clipDurationS * 1000;
say();
say("## pinball-tilt-sweep, every frame: which TRACK frames set the lower tilt, on the counted loops");
say("| seed | TRACK min, deg | at media, s | its inliers | without media 0 | at media, s | media >= 1.5 s |");
say("|---|---|---|---|---|---|---|");
const minOf = (xs) => xs.reduce((m, r) => (m === null || r.tilt < m.tilt ? r : m), null);
const noZero = [];
const late = [];
for (const seed of SEEDS) {
    const rows = countedLoops(rowsOf(stem, "every", seed), dur).flat().filter((r) => r.state === "TRACK");
    const a = minOf(rows);
    const b = minOf(rows.filter((r) => r.media > 0));
    const c = minOf(rows.filter((r) => r.media >= 1.5));
    noZero.push(b.tilt);
    late.push(c.tilt);
    say(`| ${seed} | ${fx(a.tilt)} | ${fx(a.media, 3)} | ${a.inliers} | ${fx(b.tilt)} | ${fx(b.media, 3)} | ${fx(c.tilt)} |`);
}
say(`median over the seeds, without media 0: ${fx(median(noZero))}, against the maintainer-side 20.4: ${fx(median(noZero) - 20.4)}; media >= 1.5 s: ${fx(median(late))}, ${fx(median(late) - 20.4)}`);
say();
say("## pinball-tilt-sweep, every frame: the TRACK frames reading below 15 deg, on the counted loops, and their posed neighbours' states");
say("| seed | media, s | tilt, deg | inliers | loops | state before | state after |");
say("|---|---|---|---|---|---|---|");
for (const seed of SEEDS) {
    const rows = rowsOf(stem, "every", seed);
    const seen = new Map();
    const counted = (r) => {
        const l = Math.floor(r.stamp / dur + 1e-9);
        return l >= 1 && l <= 4;
    };
    const posed = rows.filter((r) => r.ok);
    posed.forEach((r, i) => {
        if (!counted(r) || r.state !== "TRACK" || !(r.tilt < 15)) return;
        const key = r.media.toFixed(6);
        const prev = seen.get(key);
        seen.set(key, { r, n: (prev?.n ?? 0) + 1, before: posed[i - 1]?.state ?? "n/a", after: posed[i + 1]?.state ?? "n/a" });
    });
    for (const { r, n, before, after } of seen.values()) say(`| ${seed} | ${fx(r.media, 3)} | ${fx(r.tilt)} | ${r.inliers} | ${n} | ${before} | ${after} |`);
}
