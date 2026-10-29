/*
 *  2026-10-29-114-wrap-bound-rederivation.mjs
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
 * #114's re-derivation of the loop-wrap bound from M4's recorded figures: the
 * computation behind docs/benchmarks/2026-10-29-114-wrap-bound-rederivation.md.
 * It reads the campaign's nine committed Tab_9_WiFi exports and writes
 * nothing. It imports no repository code, so it reproduces on any later tree:
 *
 *     node docs/benchmarks/2026-10-29-114-wrap-bound-rederivation.mjs
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The input is the nine exports below, each hashed (fatal). Each must
 *    record Tab_9_WiFi, `loops` { firstLoop 1, loopCount 4 }, a
 *    `clipDurationS`, and a clean build at 37dc6d4 (fatal).
 * 2. Loops are counted at each step back in `frames[].mediaTimeSeconds`.
 *    Each step back must be a wrap by #114's rule at 0.5 s: the frame after
 *    it at most 0.5 s into the clip, and at most 0.5 s skipped across it
 *    (fatal). Each export must have five, and a frame of loop 5 (fatal).
 * 3. Per export, over counted loops 1 to 4 (#114, "Criterion for revisiting
 *    it"):
 *    - within a loop: the largest gap between consecutive frames of one loop
 *      k, 1 <= k <= 4;
 *    - across a wrap: over the wraps out of loops 1 to 4, the largest skip,
 *      `clipDurationS` minus the frame before, plus the frame after;
 *    - after a wrap: over the same wraps, the largest media time of the
 *      frame after.
 *    Beside them, gating nothing: the largest gap within a loop with the
 *    warm-up loop 0 included.
 * 4. The rule, M3's: the largest of the three counted figures, doubled,
 *    rounded up to the next 0.1 s.
 * 5. The frame quantum: N = round(clipDurationS / the smallest positive gap
 *    over the clip's exports) frame periods; every gap must be a whole number
 *    of clipDurationS / N to within 2 µs (fatal). A period is a slot of the
 *    clip's frame rate, not a decoded frame: the static clip has 365 periods
 *    and 363 decoded frames (ffprobe -count_frames), slots 161 and 340 empty. On the static clip every
 *    recorded media time must be k/30 s rounded to the microsecond for an
 *    integer k (fatal); the landings of a 15-frame skip across the wrap are
 *    computed on that grid, the last frame being k = 364, and each landing's
 *    two frames must be ones the exports record (fatal).
 *
 * The checks, all fatal: a failed check exits 1 naming what disagrees, and
 * nothing is printed. stdout is byte-identical between runs.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = [];
const say = (line = "") => out.push(line);
function fatal(reason) {
    process.stderr.write(`fatal: ${reason}\n`);
    process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));

// The campaign's committed Tab_9_WiFi exports: the pre-flight run (2026-10-13) and round 0's
// calibration block (e9396df). SHA-256 of each file as committed.
const EXPORTS = [
    ["2026-10-13-tab9-m4-preflight-sync-wall.json", "2dfb93f81fec4fc57d4c1e80237e89512a8c1962d7ec5d2c426c90dab0849392"],
    ["2026-10-14-tab9-m4-calibration-sync-static-1.json", "f1ea1f262b7bd55f64ae75eefd3acff69894d0a4ec20825306b566dd5b7e6134"],
    ["2026-10-14-tab9-m4-calibration-sync-static-2.json", "9a5bb1396118b1a43a43cf9fb2029e6ce364c543300edb4a0a6313a31629918d"],
    ["2026-10-14-tab9-m4-calibration-sync-static-3.json", "1f33190a50c4d4955ec3a7a0d37ea98104edf406e663bb1e9e1c9d37e00272f5"],
    ["2026-10-14-tab9-m4-calibration-sync-static-4.json", "43b9b38ab3e8bf7318f1cedfce52aa0fe4e774b14cc8ff6dbb2f55168ab6f844"],
    ["2026-10-14-tab9-m4-calibration-worker-static-1.json", "872682bc1d77d4de9b30a6e5998235ff5a44ce87272c6b9f8b33d237919c5fc2"],
    ["2026-10-14-tab9-m4-calibration-worker-static-2.json", "4bda92813616aeac72499fab8abbca0cca868add48bd986538d831e51e45c193"],
    ["2026-10-14-tab9-m4-calibration-worker-static-3.json", "db923bb86fe3ba228a11a61f918a6f5396ecc7a08ff1730cf99e3f058eda4f62"],
    ["2026-10-14-tab9-m4-calibration-worker-static-4.json", "f220478fbc57e73199d55f140a4d6c7225f5d4454a300d87e27c44bf883262e1"],
];
const HEAD = "37dc6d4fa3507992bbe7e13cd8da7cb759b7265c";
const BOUND_S = 0.5;
const EPS_S = 1e-9;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ms = (s) => `${(s * 1000).toFixed(1)} ms`;
const us = (s) => `${+s.toFixed(6)} s`;
const roundUpTenth = (s) => Math.ceil(s * 10 - 1e-9) / 10;

// ---- read and check every export before printing anything -----------------------------
const runs = [];
for (const [name, expected] of EXPORTS) {
    const path = join(HERE, name);
    if (!existsSync(path)) fatal(`${name}: no such file beside this script`);
    const bytes = readFileSync(path);
    const got = sha256(bytes);
    if (got !== expected) fatal(`${name}: sha256 ${got}, not the record's ${expected}`);
    const e = JSON.parse(bytes.toString("utf8"));
    if (e.deviceLabel !== "Tab_9_WiFi") fatal(`${name}: deviceLabel ${e.deviceLabel}`);
    if (e.loops?.firstLoop !== 1 || e.loops?.loopCount !== 4)
        fatal(`${name}: loops ${JSON.stringify(e.loops)}, not { firstLoop 1, loopCount 4 }`);
    const D = e.clipDurationS;
    if (!(Number.isFinite(D) && D > 0)) fatal(`${name}: clipDurationS ${D}`);
    const m = e.provenance?.manifest;
    if (m?.head !== HEAD || m?.clean !== true)
        fatal(`${name}: provenance head ${m?.head}, clean ${m?.clean}; not a clean build at ${HEAD}`);
    const t = e.frames.map((f) => f.mediaTimeSeconds);
    if (!t.every(Number.isFinite)) fatal(`${name}: a frame without a numeric mediaTimeSeconds`);

    const loopOf = [0];
    const wraps = [];
    for (let i = 1; i < t.length; i++) {
        if (t[i] < t[i - 1]) {
            const skip = D - Math.min(t[i - 1], D) + t[i];
            if (t[i] < 0 || t[i] > BOUND_S + EPS_S || skip > BOUND_S + EPS_S)
                fatal(`${name}: frame ${i}, ${t[i - 1]} -> ${t[i]}, is not a wrap at 0.5 s`);
            wraps.push({ i, skip, after: t[i] });
        }
        loopOf.push(wraps.length);
    }
    if (wraps.length !== 5) fatal(`${name}: ${wraps.length} wraps, not 5`);
    if (loopOf[loopOf.length - 1] !== 5) fatal(`${name}: no frame of loop 5`);

    let within = 0;
    let withinAll = 0;
    const gaps = [];
    for (let i = 1; i < t.length; i++) {
        if (loopOf[i] !== loopOf[i - 1]) continue;
        const g = t[i] - t[i - 1];
        gaps.push(g);
        withinAll = Math.max(withinAll, g);
        if (loopOf[i] >= 1 && loopOf[i] <= 4) within = Math.max(within, g);
    }
    const counted = wraps.filter((w) => loopOf[w.i - 1] >= 1 && loopOf[w.i - 1] <= 4);
    if (counted.length !== 4) fatal(`${name}: ${counted.length} wraps out of loops 1-4, not 4`);
    const across = Math.max(...counted.map((w) => w.skip));
    const after = Math.max(...counted.map((w) => w.after));
    runs.push({ name, D, t, gaps, wraps, within, across, after, withinAll, clip: e.bundledClip });
}

// ---- the frame quantum, per clip -------------------------------------------------------
const clips = new Map();
for (const r of runs) {
    const c = clips.get(r.clip) ?? { D: r.D, runs: [] };
    if (c.D !== r.D) fatal(`${r.clip}: clipDurationS ${r.D} and ${c.D} in two exports`);
    c.runs.push(r);
    clips.set(r.clip, c);
}
for (const [clip, c] of clips) {
    const positive = c.runs.flatMap((r) => r.gaps).filter((g) => g > 0);
    c.N = Math.round(c.D / Math.min(...positive));
    c.q = c.D / c.N;
    for (const r of c.runs) {
        const steps = [...r.gaps, ...r.wraps.map((w) => w.skip)];
        for (const g of steps) {
            if (Math.abs(g / c.q - Math.round(g / c.q)) * c.q > 2e-6)
                fatal(`${r.name}: a gap of ${g} s is not a whole number of ${c.q} s frames`);
        }
    }
}
const frames = (clip, s) => Math.round(s / clips.get(clip).q);

// ---- the static clip's grid ------------------------------------------------------------
const STATIC = "pinball-static.mp4";
const WALL = "pinball-bench.mp4";
if (!clips.has(STATIC) || !clips.has(WALL)) fatal("the nine exports name other clips");
const r6 = (s) => Math.round(s * 1e6) / 1e6;
const S = clips.get(STATIC);
if (S.N !== 365 || S.D !== r6(365 / 30)) fatal(`${STATIC}: ${S.N} frames of ${S.D} s, not 365 at 30 fps`);
const seen = new Set(S.runs.flatMap((r) => r.t));
for (const m of seen) {
    if (r6(Math.round(m * 30) / 30) !== m) fatal(`${STATIC}: media time ${m} is not k/30 s to the µs`);
}
const lastFrame = Math.max(...[...seen].map((m) => Math.round(m * 30)));
const empty = [];
for (let k = 0; k <= lastFrame; k++) if (!seen.has(r6(k / 30))) empty.push(k);
if (lastFrame !== 364) fatal(`${STATIC}: last frame seen is ${lastFrame}, not 364`);
const landings = (n) => {
    const l = [];
    for (let j = 0; r6(j / 30) <= BOUND_S + EPS_S; j++) {
        const k = 365 - n + j;
        if (k > 364) break;
        const before = r6(k / 30);
        const after = r6(j / 30);
        const skip = S.D - before + after;
        if (!seen.has(before) || !seen.has(after)) fatal(`${STATIC}: landing ${k} -> ${j} is on a frame no export records`);
        l.push({ k, j, before, after, skip, admitted: !(skip > BOUND_S + EPS_S) });
    }
    return l;
};

// ---- print -----------------------------------------------------------------------------
say("# #114: the loop-wrap bound, re-derived from M4's recorded figures (2026-10-29)");
say();
say(`Input: ${runs.length} exports, Tab_9_WiFi, clean builds at ${HEAD}, sha256 checked:`);
for (const r of runs) say(`  ${r.name}  ${EXPORTS.find(([n]) => n === r.name)[1]}`);
say();
say("Over counted loops 1-4 (within a loop / across a wrap / after a wrap), and within a loop with");
say("the warm-up loop included, which gates nothing. In frame periods of the run's clip in brackets.");
say();
say("| export | within a loop | across a wrap | after a wrap | within, warm-up included |");
say("| --- | --- | --- | --- | --- |");
for (const r of runs) {
    const f = (s) => `${ms(s)} (${frames(r.clip, s)})`;
    say(`| ${r.name.replace(/^2026-10-1[34]-tab9-m4-|\.json$/g, "")} | ${f(r.within)} | ${f(r.across)} | ${f(r.after)} | ${f(r.withinAll)} |`);
}
const maxOf = (key) => runs.reduce((a, r) => (r[key] > a[key] ? r : a));
const top = { within: maxOf("within"), across: maxOf("across"), after: maxOf("after") };
const largest = Math.max(top.within.within, top.across.across, top.after.after);
say();
const ties = (key) => runs.filter((r) => r[key] === top[key][key]).length;
say(`Largest within a loop: ${us(top.within.within)} (${top.within.name}; ${ties("within")} of ${runs.length} exports at it)`);
say(`Largest across a wrap: ${us(top.across.across)} (${top.across.name}; ${ties("across")} of ${runs.length} exports at it)`);
say(`Largest after a wrap:  ${us(top.after.after)} (${ties("after")} of ${runs.length} exports at it)`);
say(`The rule: the largest, ${us(largest)}, doubled, ${us(2 * largest)}, rounded up to the next 0.1 s: ${roundUpTenth(2 * largest)} s`);
const w = maxOf("withinAll");
say(`Beside it, not read: warm-up included, ${us(w.withinAll)} (${w.name}), doubled and rounded up: ${roundUpTenth(2 * w.withinAll)} s`);
say(`Beside it, not prescribed: the skip across a wrap alone, ${us(top.across.across)}, doubled and rounded up: ${roundUpTenth(2 * top.across.across)} s`);
say();
say("Frame quanta:");
for (const [clip, c] of clips) say(`  ${clip}: ${c.N} frame periods of ${(c.q * 1000).toFixed(3)} ms in ${c.D} s`);
const W = clips.get(WALL);
for (const n of [12, 13])
    say(`  ${WALL}: ${n} frames are ${n} x ${W.D} / ${W.N} = ${us((n * W.D) / W.N)}, ${(n * W.D) / W.N > BOUND_S + EPS_S ? "refused" : "admitted"} across a wrap`);
const l14 = landings(14);
const l15 = landings(15);
say(`  ${STATIC}: every one of ${seen.size} recorded media times is k/30 s to the µs; last frame k = ${lastFrame}; slots never recorded: ${empty.join(", ")}`);
say(`  ${STATIC}: 14 frames across a wrap, ${l14.length} landings, largest skip ${us(Math.max(...l14.map((x) => x.skip)))}, admitted ${l14.filter((x) => x.admitted).length}`);
const at = (v) => l15.filter((x) => r6(x.skip) === v);
say(`  ${STATIC}: 15 frames across a wrap, ${l15.length} landings: ${at(0.5).length} at 0.5 s (admitted), ${at(0.500001).length} at 0.500001 s (refused), ${l15.length - at(0.5).length - at(0.500001).length} other`);
for (const x of l15) say(`    frame ${x.k} (${x.before} s) -> frame ${x.j} (${x.after} s): ${us(x.skip)}, ${x.admitted ? "admitted" : "refused"}`);
const all = [...l14, ...l15, ...landings(16)].map((x) => r6(x.skip));
say(`  0.50001 s is produced by no landing of 14, 15 or 16 frames on ${STATIC}: ${!all.includes(0.50001)}`);

process.stdout.write(`${out.join("\n")}\n`);
