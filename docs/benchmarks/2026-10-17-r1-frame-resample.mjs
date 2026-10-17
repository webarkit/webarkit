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
 *         [--rates=own|<keep>|<keepBaseline>,<keepRepeat>] [--population=common|whole]
 *
 * With no option the run is the one described below, and its output is the
 * record's: the default path is unchanged by the options (added later on
 * 2026-10-17, for the entry beside the one above in M3's runbook step 8).
 * `--rates` replaces the two rates with one: `own` thins each run at its own
 * dropped fraction, 1 − common ÷ own posed media times (0.303 and 0.331 for
 * this pair, the overlap script's definition), a single keep probability
 * applies to both runs, two apply to the baseline and the repeat in that
 * order. `--population` chooses the frames a resample thins: `common`, the
 * run's frames on the pair-common media times (the default), or `whole`,
 * every frame the run posed. With either option given, the delete-one
 * influence reads that population and the conditional movement runs at
 * those rates on it, in place of the default's keep 0.9 on the common set.
 * An option is validated before any default applies: a bare `--rates` or
 * `--population`, an empty or doubled value, an unknown or repeated option
 * fails with the usage text and runs nothing, so that no command can appear
 * to request one run and perform another. The command that gives the
 * clause's own noise at the pair's own dropped fractions, 0.00767 px, is
 *
 *     node docs/benchmarks/2026-10-17-r1-frame-resample.mjs 10000 1 --rates=own --population=whole
 *
 * and the same with `--population=common` (or without it) gives 0.01082 px,
 * the figure of those rates applied on top of the common set, which no real
 * comparison has (the entry says why it is recorded). Each command's last
 * section gives the share of the movement's variance carried by the fate of
 * the most influential frame at those rates on that population.
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
 * window is a failure, not a skipped draw. (3) With `--population=whole`, at
 * keep 1 the whole-set include reproduces cornerJitter over all the run's
 * frames, and that value is the export's recorded runSummary.jitterPx,
 * exactly. The tolerance on checks 1 and 3 is zero, a stated choice: it is
 * the same function on the same frames in the same order, and it reproduced
 * both recorded values bit for bit, so anything but equality is a changed
 * metric or a changed export.
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
const ARGS = process.argv.slice(2);
const fatal = (message) => {
    console.error(`${SCRIPT}: ${message}`);
    process.exit(1);
};
const USAGE = `usage: node ${SCRIPT} [resamples ≥ 2] [seed] [--rates=own|<keep>|<keepBaseline>,<keepRepeat>] [--population=common|whole]`;
// every option supplied is validated before any default applies: a bare option, an empty value, a
// second "=", an unknown name or a repeated option fails here with the usage text, so that no
// command can appear to request one run and perform another
const FLAGS = {};
for (const a of ARGS.filter((x) => x.startsWith("--"))) {
    const m = /^--([a-z]+)=([^=]+)$/s.exec(a);
    if (!m || !["population", "rates"].includes(m[1]) || m[1] in FLAGS) {
        fatal(`${USAGE}; each option is given once, as --name=value with exactly one value; got ${ARGS.join(" ")}`);
    }
    FLAGS[m[1]] = m[2];
}
const POSITIONAL = ARGS.filter((a) => !a.startsWith("--"));
const B = Number(POSITIONAL[0] ?? 10000);
const SEED = Number(POSITIONAL[1] ?? 1);
const POPULATION = FLAGS.population ?? "common";
const RATES_FLAG = FLAGS.rates ?? null;
// with either option given, the resample, the delete-one influence and the conditional movement all
// run on that population at those rates; without, the run is the record's default path
const custom = POPULATION !== "common" || RATES_FLAG !== null;
if (!(Number.isInteger(B) && B > 1) || !Number.isInteger(SEED) || POSITIONAL.length > 2) {
    fatal(`${USAGE}; got ${ARGS.join(" ")}`);
}
if (!["common", "whole"].includes(POPULATION)) {
    fatal(`${USAGE}; --population: expected common or whole; got ${POPULATION}`);
}
const { cornerJitter, compareExports, mediaKey, JITTER_WINDOW_S } = await import(
    pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href
);
const load = (n) => JSON.parse(readFileSync(join(HERE, `2026-09-28-tab9-tuning-r1-${n}.json`), "utf8"));
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
// the frame population a resample thins: the run's frames on the pair-common media times (the
// default), or every frame the run posed (--population=whole)
const inWhole = (f) => !!f.corners;
const inPopulation = POPULATION === "whole" ? inWhole : inCommon;

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

// check 3 (--population=whole only): the whole-set include at keep 1 reproduces cornerJitter over all
// the run's frames, and that value is the export's recorded runSummary.jitterPx, both exactly
const whole = {};
if (POPULATION === "whole") {
    for (const [label, e] of [["baseline", base], ["repeat", rep]]) {
        const j = cornerJitter(e.frames, { include: inWhole });
        const ref = cornerJitter(e.frames);
        finite(`${label} whole-set identity`, j.jitterPx);
        if (j.jitterPx !== ref.jitterPx || j.jitterWindows !== ref.jitterWindows) {
            fatal(`${label}: whole-set include ${j.jitterPx} on ${j.jitterWindows} windows against cornerJitter over all frames ${ref.jitterPx} on ${ref.jitterWindows}; the tolerance is exact equality`);
        }
        if (j.jitterPx !== e.runSummary.jitterPx) {
            fatal(`${label}: whole-set jitterPx ${j.jitterPx} against the export's recorded runSummary.jitterPx ${e.runSummary.jitterPx}; the tolerance is exact equality`);
        }
        whole[label] = { jitterPx: j.jitterPx, ref: ref.jitterPx, windows: j.jitterWindows };
    }
}

const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / (s.length - 1));
    const q = (p) => s[Math.round((s.length - 1) * p)];
    return { mean, sd, p025: q(0.025), p50: q(0.5), p975: q(0.975), min: s[0], max: s[s.length - 1] };
};
const f = (v) => v.toFixed(5);

/** One run's jitterPx with each population frame kept with probability p (its own draws); fatal unless finite. */
function resample(label, e, p, rnd) {
    const kept = new Set();
    for (const fr of e.frames) if (inPopulation(fr) && rnd() < p) kept.add(fr);
    const j = cornerJitter(e.frames, { include: (fr) => kept.has(fr) });
    finite(`${label}: jitterPx on ${j.jitterWindows} windows and ${j.posedFrames} frames`, j.jitterPx);
    return { jitterPx: j.jitterPx, windows: j.jitterWindows, frames: j.posedFrames, kept };
}

const RATES = [
    { label: `keep ${nr}/${nb} = ${(nr / nb).toFixed(4)} (drop ${((1 - nr / nb) * 100).toFixed(2)}%)`, pb: nr / nb, pr: nr / nb },
    { label: "keep 0.9 (drop 10%)", pb: 0.9, pr: 0.9 },
];
if (RATES_FLAG !== null) {
    // --rates=own: each run at its own dropped fraction, 1 − common ÷ own posed media times, as
    // 2026-10-16-frame-set-overlap.mjs defines it; otherwise one keep probability for both runs, or two
    let pb;
    let pr;
    let how;
    if (RATES_FLAG === "own") {
        pb = common.size / kb.size;
        pr = common.size / keysOf(rep).size;
        how = `the pair's own dropped fractions, 1 − common ÷ own posed media times, ${common.size} of ${kb.size} and ${keysOf(rep).size}`;
    } else {
        const parts = RATES_FLAG.split(",").map(Number);
        if (parts.length > 2 || parts.some((p) => !(p > 0 && p <= 1))) {
            fatal(`${USAGE}; --rates: expected own, one keep probability in (0, 1] or two separated by a comma; got ${RATES_FLAG}`);
        }
        pb = parts[0];
        pr = parts[1] ?? parts[0];
        how = "keep probabilities given on the command line";
    }
    RATES.length = 0;
    RATES.push({
        label: `keep baseline ${pb.toFixed(4)} (drop ${(100 * (1 - pb)).toFixed(2)}%), repeat ${pr.toFixed(4)} (drop ${(100 * (1 - pr)).toFixed(2)}%), ${POPULATION} frame set: ${how}`,
        pb,
        pr,
    });
}
const rateResults = [];
for (const rate of RATES) {
    const rnd = mulberry32(SEED);
    const moves = [];
    const vb = [];
    const vr = [];
    const wb = [];
    const wr = [];
    const kfb = [];
    const kfr = [];
    for (let t = 0; t < B; t++) {
        const a = resample(`${rate.label}, resample ${t}, baseline`, base, rate.pb, rnd);
        const b = resample(`${rate.label}, resample ${t}, repeat`, rep, rate.pr, rnd);
        vb.push(a.jitterPx);
        vr.push(b.jitterPx);
        wb.push(a.windows);
        wr.push(b.windows);
        kfb.push(a.frames);
        kfr.push(b.frames);
        moves.push(b.jitterPx - a.jitterPx);
    }
    rateResults.push({ rate, M: stats(moves), SB: stats(vb), SR: stats(vr), wb, wr, kfb, kfr });
}

/** Delete-one influence of every common frame on a run's jitterPx, and each frame's residual against its window's fit. */
function influence(label, e) {
    const F = e.frames;
    const idx = F.map((fr, i) => (inPopulation(fr) ? i : -1)).filter((i) => i >= 0);
    const mask = new Uint8Array(F.length);
    for (const i of idx) mask[i] = 1;
    const inc = (fr) => mask[F.indexOf(fr)] === 1;
    const total = finite(`${label} influence, all ${POPULATION} frames`, cornerJitter(F, { include: inc }).jitterPx);
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

// the movement conditional on the top frame's fate in each run: at keep 0.9 on the default path, at the
// option's rates on its population otherwise (the same draws as the resample above, same seed)
const COND = custom ? RATES[0] : { pb: 0.9, pr: 0.9 };
const groups = { "both kept": [], "dropped from the baseline only": [], "dropped from the repeat only": [], "dropped from both": [] };
const all = [];
{
    const rnd = mulberry32(SEED);
    for (let t = 0; t < B; t++) {
        const a = resample(`conditional, resample ${t}, baseline`, base, COND.pb, rnd);
        const b = resample(`conditional, resample ${t}, repeat`, rep, COND.pr, rnd);
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
if (custom) {
    console.log(`options: population ${POPULATION}${RATES_FLAG !== null ? `, rates ${RATES_FLAG}` : ""}; the delete-one influence reads the ${POPULATION} frames, and the conditional movement runs at the same rates on them`);
    console.log(`check 2: every resample, delete-one value and conditional mean finite`);
    if (POPULATION === "whole") {
        console.log(`check 3, whole-set include (keep 1, tolerance exact): baseline ${whole.baseline.jitterPx} = cornerJitter over all frames ${whole.baseline.ref}; repeat ${whole.repeat.jitterPx} = ${whole.repeat.ref}; windows ${whole.baseline.windows} / ${whole.repeat.windows}; the exports record ${base.runSummary.jitterPx} / ${rep.runSummary.jitterPx}`);
    }
} else {
    console.log(`check 2: every resample, delete-one value and conditional mean finite`);
}
for (const { rate, M, SB, SR, wb, wr, kfb, kfr } of rateResults) {
    const wmin = (w) => Math.min(...w);
    const wmax = (w) => Math.max(...w);
    console.log(`\n${rate.label}: ${B} resamples, seed ${SEED} (mulberry32), footage fixed, frames dropped independently per run`);
    console.log(`  movement (repeat − baseline): mean ${f(M.mean)}, sd ${f(M.sd)}, 2.5% ${f(M.p025)}, median ${f(M.p50)}, 97.5% ${f(M.p975)}, min ${f(M.min)}, max ${f(M.max)}`);
    console.log(`  per run: baseline mean ${f(SB.mean)} sd ${f(SB.sd)}, windows kept ${wmin(wb)}..${wmax(wb)} of ${cmp.first.jitterWindows}; repeat mean ${f(SR.mean)} sd ${f(SR.sd)}, windows kept ${wmin(wr)}..${wmax(wr)} of ${cmp.second.jitterWindows}`);
    console.log(`  sd ÷ 0.007 = ${(M.sd / 0.007).toFixed(3)}; sd ÷ 0.00411 (paired cluster design) = ${(M.sd / 0.00411).toFixed(3)}`);
    if (custom) {
        const avg = (xs) => xs.reduce((a, v) => a + v, 0) / xs.length;
        const popB = base.frames.filter(inPopulation).length;
        const popR = rep.frames.filter(inPopulation).length;
        console.log(`  frames kept per resample: baseline mean ${avg(kfb).toFixed(1)} of ${popB}, repeat mean ${avg(kfr).toFixed(1)} of ${popR}; per eligible window ${avg(kfb.map((k, i) => k / wb[i])).toFixed(1)} and ${avg(kfr.map((k, i) => k / wr[i])).toFixed(1)}`);
    }
}
for (const [name, I] of [["baseline", IB], ["repeat", IR]]) {
    console.log(`\n${name}, delete-one influence over its ${I.idx.length} ${POPULATION} frames: top frame at ${I.top.mt.toFixed(6)} s carries ${((100 * I.top.d ** 2) / I.sum2).toFixed(1)}% of Σd², residual RMS ${I.top.resid.toFixed(3)} px against the run's median ${I.median.toFixed(3)} px; top five ${((100 * I.ds.slice(0, 5).reduce((a, x) => a + x.d ** 2, 0)) / I.sum2).toFixed(1)}%`);
}
const condLabel = custom
    ? `movement at keep baseline ${COND.pb.toFixed(4)}, repeat ${COND.pr.toFixed(4)} on the ${POPULATION} frame set`
    : "movement at keep 0.9";
console.log(`\n${condLabel} conditional on the fate of the top frame of each run (${B} resamples, seed ${SEED}):`);
for (const { g, share, m } of groupRows) console.log(`  ${g}: ${share.toFixed(1)}%, mean movement ${f(m)}`);
console.log(`  share of the movement's variance between those groups: ${((100 * between) / (between + within)).toFixed(1)}%`);
