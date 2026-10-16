/*
 *  2026-10-16-frame-set-overlap.mjs
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
 * Frame-set overlap between the committed static exports of rounds 0, 1 and
 * 2, and how much of each pair's jitterPx difference, and of round 0's s0,
 * the frame set accounts for. The computation behind #123's comment of
 * 2026-10-16 and the dated addition to round 0's session record
 * (2026-10-14-tab9-m4-calibration-session.md, "How much of s0 is frame-set
 * variation"). It reads the exports beside it and the frozen metrics module,
 * and writes nothing.
 *
 *     node docs/benchmarks/2026-10-16-frame-set-overlap.mjs
 *
 * The method, so that it can be redone without this file:
 *
 * 1. Each run's frames: for round 0, the counted loops 1 to 4
 *    (`countedLoopFrames` with the export's `loops` and `clipDurationS`); for
 *    rounds 1 and 2, the export's frames as they are (300-tick windows). Its
 *    posed media times: the set of `mediaKey(mediaTimeSeconds)` over frames
 *    with corners, so a media time counts once however many loops processed
 *    it, as `compareExports` reads common footage.
 * 2. Per pair: the common media times, the overlap (common / union), and each
 *    run's dropped fraction p = 1 - common / own. `cornerJitter` of each run
 *    over all its frames (equal to the recorded `runSummary.jitterPx`) and
 *    with `include` restricted to the common media times. Observed, whole =
 *    the whole-set difference; observed, common = the common-set difference;
 *    frame-set part = whole - common.
 * 3. The scaled resample: M3's record measured that keeping each processed
 *    frame with probability 0.9 moves one run's jitterPx by SD 0.0013 to
 *    0.0015 px (2026-10-01-m3-device-session.md). Scaled as
 *    s(p) = c * sqrt(p / 0.1), c = 0.0014 (band 0.0013 to 0.0015), and a
 *    pair's predicted SD is sqrt(s(pA)^2 + s(pB)^2). It assumes random drops
 *    at the run length M3 measured; rounds 1 and 2 differ by contiguous
 *    stretches, which is why the direct decomposition stands beside it.
 * 4. For a group of three or more runs: the media times common to all of
 *    them; each run's jitterPx on that set, the frame-set part (whole minus
 *    common), the SD of each over the runs, their shares of the whole-set
 *    variance, and the scaled resample's prediction as the RMS of s(p) over
 *    the runs' dropped fractions against the common set.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cornerJitter, countedLoopFrames, mediaKey } from "../../examples/js/bench-metrics.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(HERE, f), "utf8"));

/** M3's figure: a 10% resample moves one run's jitterPx by SD 0.0013 to 0.0015 px. */
const C = 0.0014;
const BAND = [0.0013, 0.0015];
const sOf = (p, c = C) => c * Math.sqrt(p / 0.1);

const GROUPS = {
    "round 1": [
        "2026-09-28-tab9-tuning-r1-baseline-static.json",
        "2026-09-28-tab9-tuning-r1-baseline-static-repeat.json",
    ],
    "round 2": [1, 2, 3].map((i) => `2026-09-29-tab9-tuning-r2-baseline-static-${i}.json`),
    "round 0": [
        ...[1, 2, 3, 4].map((i) => `2026-10-14-tab9-m4-calibration-sync-static-${i}.json`),
        ...[1, 2, 3, 4].map((i) => `2026-10-14-tab9-m4-calibration-worker-static-${i}.json`),
    ],
};

const short = (f) => f.replace(/^2026-\d\d-\d\d-tab9-(tuning-|m4-calibration-)?/, "").replace(".json", "");
const fmt = (x, d = 6) => (x === null || x === undefined || Number.isNaN(x) ? "—" : (+x).toFixed(d));
const signed = (x, d = 5) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

function runOf(name, e) {
    const clip = { clipDurationS: e.clipDurationS ?? null };
    const frames = e.loops ? countedLoopFrames(e.frames, { ...clip, ...e.loops }) : e.frames;
    const keys = new Set(frames.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)));
    const jitter = (include) => cornerJitter(frames, { ...clip, include }).jitterPx;
    const all = jitter(() => true);
    if (Math.abs(all - e.runSummary.jitterPx) > 1e-12) {
        throw new Error(`${name}: recomputed jitterPx ${all} differs from the recorded ${e.runSummary.jitterPx}`);
    }
    return { name, keys, all, jitter };
}

function pair(a, b) {
    const common = new Set([...a.keys].filter((k) => b.keys.has(k)));
    const union = a.keys.size + b.keys.size - common.size;
    const inc = (f) => common.has(mediaKey(f.mediaTimeSeconds));
    const ac = a.jitter(inc);
    const bc = b.jitter(inc);
    const pA = 1 - common.size / a.keys.size;
    const pB = 1 - common.size / b.keys.size;
    const pred = (c) => Math.sqrt(sOf(pA, c) ** 2 + sOf(pB, c) ** 2);
    return {
        pair: `${a.name} vs ${b.name}`,
        nA: a.keys.size,
        nB: b.keys.size,
        common: common.size,
        overlap: common.size / union,
        pA,
        pB,
        predSD: pred(C),
        predLo: pred(BAND[0]),
        predHi: pred(BAND[1]),
        obsAll: a.all - b.all,
        obsCommon: ac - bc,
        frameSetPart: a.all - b.all - (ac - bc),
    };
}

const sd = (v) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
const rms = (xs) => Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length);

for (const [group, files] of Object.entries(GROUPS)) {
    const runs = files.map((f) => runOf(short(f), load(f)));
    console.log(`\n## ${group}\n`);
    for (const r of runs) console.log(`- ${r.name}: posed media times ${r.keys.size}, jitterPx ${fmt(r.all, 8)}`);
    const rows = [];
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) rows.push(pair(runs[i], runs[j]));
    console.log(
        "\n| pair | posed A | posed B | common | overlap | p_A | p_B | predicted SD (band) | observed, whole | observed, common | frame-set part |",
    );
    console.log("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) {
        console.log(
            `| ${r.pair} | ${r.nA} | ${r.nB} | ${r.common} | ${fmt(r.overlap, 3)} | ${fmt(r.pA, 3)} | ${fmt(r.pB, 3)} | ${fmt(r.predSD, 5)} (${fmt(r.predLo, 5)}–${fmt(r.predHi, 5)}) | ${signed(r.obsAll)} | ${signed(r.obsCommon)} | ${signed(r.frameSetPart)} |`,
        );
    }
    console.log(
        `\nRMS over the ${rows.length} pair(s): predicted SD ${fmt(rms(rows.map((r) => r.predSD)), 5)}; observed, whole ${fmt(rms(rows.map((r) => r.obsAll)), 5)}; observed, common ${fmt(rms(rows.map((r) => r.obsCommon)), 5)}; frame-set part ${fmt(rms(rows.map((r) => r.frameSetPart)), 5)}`,
    );
    if (runs.length < 3) continue;
    let all = new Set(runs[0].keys);
    for (const r of runs) all = new Set([...all].filter((k) => r.keys.has(k)));
    const inc = (f) => all.has(mediaKey(f.mediaTimeSeconds));
    const whole = runs.map((r) => r.all);
    const common = runs.map((r) => r.jitter(inc));
    const part = whole.map((x, i) => x - common[i]);
    const ps = runs.map((r) => 1 - all.size / r.keys.size);
    const sw = sd(whole);
    const sc = sd(common);
    const sp = sd(part);
    const predRun = Math.sqrt(ps.reduce((a, p) => a + sOf(p) ** 2, 0) / ps.length);
    console.log(`\nMedia times common to all ${runs.length}: ${all.size}; dropped fraction per run against that set: ${ps.map((p) => fmt(p, 3)).join(", ")}`);
    console.log(`On the common set: ${common.map((c) => fmt(c, 6)).join(", ")}`);
    console.log(`Frame-set part (whole − common): ${part.map((c) => signed(c, 6)).join(", ")}`);
    console.log(`SD over the runs: whole ${fmt(sw, 7)}; common ${fmt(sc, 7)} (${fmt(sc / sw, 2)} of whole); frame-set part ${fmt(sp, 7)} (${fmt(sp / sw, 2)} of whole)`);
    console.log(
        `Shares of the whole-set variance: common ${fmt((100 * sc * sc) / (sw * sw), 1)}%, frame-set part ${fmt((100 * sp * sp) / (sw * sw), 1)}%, cross term ${fmt(100 * (1 - (sc * sc + sp * sp) / (sw * sw)), 1)}%`,
    );
    console.log(`Scaled resample's prediction of the frame-set SD: ${fmt(predRun, 7)} (band ${fmt((predRun * BAND[0]) / C, 7)}–${fmt((predRun * BAND[1]) / C, 7)})`);
}
