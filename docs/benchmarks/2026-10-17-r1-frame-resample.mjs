/*
 *  2026-10-17-r1-frame-resample.mjs
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
 * Within-window frame resample on round 1's two static baselines
 * (2026-09-28-tab9-tuning-r1-baseline-static.json and -baseline-static-repeat.json):
 * the footage seconds are held fixed, every window as it is, and each run's
 * frames on the pair-common media times are kept independently with
 * probability p; cornerJitter, imported unchanged, reads the kept frames
 * through its own `include` option, so a window left with fewer than four
 * frames drops out by the metric's rule and nothing of the metric is
 * reimplemented. Run on 2026-10-17; the derivation of the frame-resample
 * figures in the plan's note of that day beside M3's runbook step 8, and of
 * the 2.36% rate the step protocol's refutation rule cites. Reads the two
 * exports beside it and the frozen metrics module, and writes nothing.
 *
 *     node docs/benchmarks/2026-10-17-r1-frame-resample.mjs [resamples] [seed]
 *
 * Rates: keep 207/212 (the two runs' frame counts on the common set differ
 * by that ratio, 2.36% dropped: a net count ratio, since the difference is
 * loop re-visits, not the rate the runs' frame sets differ by, which
 * 2026-10-16-frame-set-overlap.mjs defines as 1 − common ÷ own, 0.303 and
 * 0.331 for this pair) and keep 0.9 (the record's perturbation of M3's four
 * static runs, 2026-10-01-m3-device-session.md, SD 0.0013-0.0015 px per
 * run). Then, at keep 0.9, which frames carry the movement's spread: the
 * delete-one influence of every common frame on each run's jitterPx, read
 * through the metric; each frame's residual against its window's line fit,
 * the metric's own fit redone only to describe the frame; and the movement
 * conditional on the fate of the most influential frame.
 *
 * The checks, all fatal: a failed check exits non-zero naming the run, the
 * rate or the resample and the values that disagree, and no figure is
 * printed after it. (1) At keep 1 the include reproduces compareExports'
 * common-set jitterPx and window count for each run exactly. (2) Every
 * resample's value, every delete-one value and every conditional-group mean
 * is a finite number; a resample whose include leaves a run with no eligible
 * window is a failure, not a skipped draw. The tolerance on check 1 is zero,
 * a stated choice: it is the same function on the same frames in the same
 * order, and it reproduced both recorded values bit for bit, so anything but
 * equality is a changed metric or a changed export.
 *
 * A known limitation, as the frame-set script's and the stall check's: this
 * script is covered by no test and by no format check (`docs/` is outside
 * both), so a change in a dependency or in the exports' shape could break it
 * without notice while the figures it produced stay in the record; and the
 * tool has no tests, so a defect in it would produce a wrong result
 * reproducibly. Its guards are the two checks above, which catch a changed
 * cornerJitter or a changed export, not a defect of their own. The checks
 * are fatal, so no figure is printed after a failed check.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = "2026-10-17-r1-frame-resample.mjs";
const B = Number(process.argv[2] ?? 10000);
const SEED = Number(process.argv[3] ?? 1);
const { cornerJitter, compareExports, mediaKey, JITTER_WINDOW_S } = await import(
    pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href
);
const load = (n) => JSON.parse(readFileSync(join(HERE, `2026-09-28-tab9-tuning-r1-${n}.json`), "utf8"));
const fatal = (message) => {
    console.error(`${SCRIPT}: ${message}`);
    process.exit(1);
};
if (!(Number.isInteger(B) && B > 1) || !Number.isInteger(SEED)) {
    fatal(`usage: node ${SCRIPT} [resamples ≥ 2] [seed]; got ${process.argv.slice(2).join(" ")}`);
}
const base = load("baseline-static");
const rep = load("baseline-static-repeat");
function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const finite = (label, v) => {
    if (!Number.isFinite(v)) fatal(`${label}: ${v} is not a finite number`);
    return v;
};

// ---- phase 1: everything computed and checked, nothing printed --------------
const cmp = compareExports(base, rep);
const keysOf = (e) => new Set(e.frames.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)));
const kb = keysOf(base);
const common = new Set([...keysOf(rep)].filter((k) => kb.has(k)));
if (common.size !== cmp.commonMediaTimes) {
    fatal(`common media times: ${common.size} rebuilt against compareExports' ${cmp.commonMediaTimes}`);
}
const inCommon = (f) => !!f.corners && common.has(mediaKey(f.mediaTimeSeconds));
const nb = base.frames.filter(inCommon).length;
const nr = rep.frames.filter(inCommon).length;

// check 1: the identity include reproduces compareExports exactly
const identity = {};
for (const [label, e, ref] of [["baseline", base, cmp.first], ["repeat", rep, cmp.second]]) {
    const j = cornerJitter(e.frames, { include: inCommon });
    finite(`${label} identity`, j.jitterPx);
    if (j.jitterPx !== ref.jitterPx) {
        fatal(`${label}: identity include ${j.jitterPx} against compareExports ${ref.jitterPx}; the tolerance is exact equality`);
    }
    if (j.jitterWindows !== ref.jitterWindows) {
        fatal(`${label}: identity include pooled ${j.jitterWindows} windows, compareExports ${ref.jitterWindows}`);
    }
    identity[label] = j.jitterPx;
}

const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / (s.length - 1));
    const q = (p) => s[Math.round((s.length - 1) * p)];
    return { mean, sd, p025: q(0.025), p50: q(0.5), p975: q(0.975), min: s[0], max: s[s.length - 1] };
};
const f = (v) => v.toFixed(5);

/** One run's jitterPx with each common frame kept with probability p (its own draws); fatal unless finite. */
function resample(label, e, p, rnd) {
    const kept = new Set();
    for (const fr of e.frames) if (inCommon(fr) && rnd() < p) kept.add(fr);
    const j = cornerJitter(e.frames, { include: (fr) => kept.has(fr) });
    finite(`${label}: jitterPx on ${j.jitterWindows} windows and ${j.posedFrames} frames`, j.jitterPx);
    return { jitterPx: j.jitterPx, windows: j.jitterWindows, frames: j.posedFrames, kept };
}

const RATES = [
    { label: `keep ${nr}/${nb} = ${(nr / nb).toFixed(4)} (drop ${((1 - nr / nb) * 100).toFixed(2)}%)`, p: nr / nb },
    { label: "keep 0.9 (drop 10%)", p: 0.9 },
];
const rateResults = [];
for (const rate of RATES) {
    const rnd = mulberry32(SEED);
    const moves = [];
    const vb = [];
    const vr = [];
    const wb = [];
    const wr = [];
    for (let t = 0; t < B; t++) {
        const a = resample(`${rate.label}, resample ${t}, baseline`, base, rate.p, rnd);
        const b = resample(`${rate.label}, resample ${t}, repeat`, rep, rate.p, rnd);
        vb.push(a.jitterPx);
        vr.push(b.jitterPx);
        wb.push(a.windows);
        wr.push(b.windows);
        moves.push(b.jitterPx - a.jitterPx);
    }
    rateResults.push({ rate, M: stats(moves), SB: stats(vb), SR: stats(vr), wb, wr });
}

/** Delete-one influence of every common frame on a run's jitterPx, and each frame's residual against its window's fit. */
function influence(label, e) {
    const F = e.frames;
    const idx = F.map((fr, i) => (inCommon(fr) ? i : -1)).filter((i) => i >= 0);
    const mask = new Uint8Array(F.length);
    for (const i of idx) mask[i] = 1;
    const inc = (fr) => mask[F.indexOf(fr)] === 1;
    const total = finite(`${label} influence, all common frames`, cornerJitter(F, { include: inc }).jitterPx);
    let loop = 0;
    const loopOf = new Array(F.length);
    for (let i = 0; i < F.length; i++) {
        if (i > 0 && F[i].mediaTimeSeconds < F[i - 1].mediaTimeSeconds) loop++;
        loopOf[i] = loop;
    }
    const keyOf = (i) => `${loopOf[i]}:${Math.floor(F[i].mediaTimeSeconds / JITTER_WINDOW_S)}`;
    const windows = new Map();
    for (const i of idx) {
        const k = keyOf(i);
        if (!windows.has(k)) windows.set(k, []);
        windows.get(k).push(i);
    }
    // the residual of each frame against its window's least-squares line, RMS over the 8 coordinates
    const resid = new Map();
    for (const ws of windows.values()) {
        const n = ws.length;
        if (n < 4) continue;
        const t = ws.map((i) => F[i].mediaTimeSeconds);
        const tm = t.reduce((a, v) => a + v, 0) / n;
        const ts = t.reduce((a, v) => a + (v - tm) ** 2, 0);
        const r2 = ws.map(() => 0);
        for (let c = 0; c < 4; c++) {
            for (let ax = 0; ax < 2; ax++) {
                const y = ws.map((i) => F[i].corners[c][ax]);
                const ym = y.reduce((a, v) => a + v, 0) / n;
                let sl = 0;
                for (let j = 0; j < n; j++) sl += (t[j] - tm) * (y[j] - ym);
                sl /= ts;
                for (let j = 0; j < n; j++) r2[j] += (y[j] - ym - sl * (t[j] - tm)) ** 2;
            }
        }
        ws.forEach((i, j) => resid.set(i, Math.sqrt(r2[j] / 8)));
    }
    const ds = [];
    let sum2 = 0;
    for (const i of idx) {
        mask[i] = 0;
        const t = finite(`${label} influence, frame ${i} deleted`, cornerJitter(F, { include: inc }).jitterPx);
        mask[i] = 1;
        const d = total - t;
        sum2 += d * d;
        ds.push({ i, d, mt: F[i].mediaTimeSeconds, resid: resid.get(i) ?? null });
    }
    ds.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    if (ds[0].resid === null) fatal(`${label} influence: the top frame ${ds[0].i} has no window residual`);
    const residAll = ds.map((x) => x.resid).filter((x) => x !== null).sort((a, b) => a - b);
    return { idx, ds, sum2, median: residAll[Math.floor(residAll.length / 2)], top: ds[0] };
}
const IB = influence("baseline", base);
const IR = influence("repeat", rep);

// the movement at keep 0.9 conditional on the top frame's fate in each run
const groups = { "both kept": [], "dropped from the baseline only": [], "dropped from the repeat only": [], "dropped from both": [] };
const all = [];
{
    const rnd = mulberry32(SEED);
    for (let t = 0; t < B; t++) {
        const a = resample(`conditional, resample ${t}, baseline`, base, 0.9, rnd);
        const b = resample(`conditional, resample ${t}, repeat`, rep, 0.9, rnd);
        const mv = b.jitterPx - a.jitterPx;
        all.push(mv);
        const kb = a.kept.has(base.frames[IB.top.i]);
        const kr = b.kept.has(rep.frames[IR.top.i]);
        groups[kb && kr ? "both kept" : !kb && kr ? "dropped from the baseline only" : kb && !kr ? "dropped from the repeat only" : "dropped from both"].push(mv);
    }
}
const mean = (xs) => xs.reduce((a, v) => a + v, 0) / xs.length;
const grand = finite("conditional, grand mean", mean(all));
let between = 0;
let within = 0;
const groupRows = [];
for (const [g, xs] of Object.entries(groups)) {
    if (xs.length === 0) continue;
    const m = finite(`conditional, mean of "${g}"`, mean(xs));
    const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
    between += (xs.length / all.length) * (m - grand) ** 2;
    within += (xs.length / all.length) * v;
    groupRows.push({ g, share: (100 * xs.length) / all.length, m });
}

// ---- phase 2: the checks' readings, then the figures ------------------------
console.log(`pair-common media times ${common.size}; frames on them: baseline ${nb}, repeat ${nr}; windows ${cmp.first.jitterWindows} / ${cmp.second.jitterWindows}; common-set jitterPx ${cmp.first.jitterPx} / ${cmp.second.jitterPx}, movement ${(cmp.second.jitterPx - cmp.first.jitterPx).toFixed(5)}`);
console.log(`check 1, identity include (keep 1, tolerance exact): baseline ${identity.baseline} = compareExports ${cmp.first.jitterPx}; repeat ${identity.repeat} = ${cmp.second.jitterPx}; windows ${cmp.first.jitterWindows} / ${cmp.second.jitterWindows}`);
console.log(`check 2: every resample, delete-one value and conditional mean finite`);
for (const { rate, M, SB, SR, wb, wr } of rateResults) {
    const wmin = (w) => Math.min(...w);
    const wmax = (w) => Math.max(...w);
    console.log(`\n${rate.label}: ${B} resamples, seed ${SEED} (mulberry32), footage fixed, frames dropped independently per run`);
    console.log(`  movement (repeat − baseline): mean ${f(M.mean)}, sd ${f(M.sd)}, 2.5% ${f(M.p025)}, median ${f(M.p50)}, 97.5% ${f(M.p975)}, min ${f(M.min)}, max ${f(M.max)}`);
    console.log(`  per run: baseline mean ${f(SB.mean)} sd ${f(SB.sd)}, windows kept ${wmin(wb)}..${wmax(wb)} of ${cmp.first.jitterWindows}; repeat mean ${f(SR.mean)} sd ${f(SR.sd)}, windows kept ${wmin(wr)}..${wmax(wr)} of ${cmp.second.jitterWindows}`);
    console.log(`  sd ÷ 0.007 = ${(M.sd / 0.007).toFixed(3)}; sd ÷ 0.00411 (paired cluster design) = ${(M.sd / 0.00411).toFixed(3)}`);
}
for (const [name, I] of [["baseline", IB], ["repeat", IR]]) {
    console.log(`\n${name}, delete-one influence over its ${I.idx.length} common frames: top frame at ${I.top.mt.toFixed(6)} s carries ${((100 * I.top.d ** 2) / I.sum2).toFixed(1)}% of Σd², residual RMS ${I.top.resid.toFixed(3)} px against the run's median ${I.median.toFixed(3)} px; top five ${((100 * I.ds.slice(0, 5).reduce((a, x) => a + x.d ** 2, 0)) / I.sum2).toFixed(1)}%`);
}
console.log(`\nmovement at keep 0.9 conditional on the fate of the top frame of each run (${B} resamples, seed ${SEED}):`);
for (const { g, share, m } of groupRows) console.log(`  ${g}: ${share.toFixed(1)}%, mean movement ${f(m)}`);
console.log(`  share of the movement's variance between those groups: ${((100 * between) / (between + within)).toFixed(1)}%`);
