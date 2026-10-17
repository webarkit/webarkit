/*
 *  2026-10-17-r1-window-bootstrap.mjs
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
 * A bootstrap over the eligible windows of each of round 1's two static
 * baselines (2026-09-28-tab9-tuning-r1-baseline-static.json and
 * -baseline-static-repeat.json), on their pair-common media times, at each
 * run's own window count, with the pooling done by the frozen metric itself.
 * Run on 2026-10-17; the derivation of the independent-window-bootstrap
 * figures in the plan's note of that day beside M3's runbook step 8. Reads
 * the two exports beside it and the frozen metrics module, and writes nothing.
 *
 *     node docs/benchmarks/2026-10-17-r1-window-bootstrap.mjs [resamples] [seed]
 *
 * The window harness (the exports' loading, eligibleWindows, construct,
 * pooledFromSingles, the identity check and the tolerance) is exported, and
 * 2026-10-17-r1-paired-cluster-resample.mjs imports and runs it; the
 * bootstrap below runs only when this file is the script invoked.
 *
 * Method. cornerJitter keys windows as `${loop}:${floor(mediaTime)}` (loop
 * counted from isLoopWrap over all frames, corners or not) and pools every
 * eligible window's residuals with n − 2 degrees of freedom. A resample with
 * replacement is handed to it as a constructed frames array: each copy of a
 * drawn window is placed in its own synthetic loop, opened by two cornerless
 * sentinel frames (media time 13.0 s, a forward step past the clip's end,
 * then 0 s, a restart as isLoopWrap reads it), with the windows of a
 * synthetic loop in increasing media time and no two sharing a
 * floor(mediaTime). cornerJitter then sees each drawn instance as a distinct
 * window and pools them exactly as it pools a run's own. Nothing of the
 * metric is reimplemented: its only use here is being called. The two runs
 * are resampled independently, so the movement's SD carries no covariance
 * between them; the paired design is 2026-10-17-r1-paired-cluster-resample.mjs.
 *
 * The checks, all fatal: a failed check exits non-zero naming the run, the
 * resample or the window and the values that disagree, and no figure is
 * printed after it. (1) The eligible-window count of each run on the common
 * set equals compareExports' jitterWindows. (2) The identity resample, every
 * window once in its original order, reproduces compareExports' common-set
 * jitterPx within TOL_PX. (3) A window drawn thrice and another twice gives
 * the expected window count and agrees within TOL_PX with the pooled value
 * computed from the metric's own single-window readings (jitterPx of one
 * window alone gives that window's residual sum and dof), which is the only
 * place the pooling formula is written here, and only as a check. (4) On
 * every resample the value is finite and the window count equals the number
 * of draws; on the first 200 the constructed value agrees with the pooled
 * single-window readings within TOL_PX.
 *
 * The tolerance, TOL_PX = 1e-12 px, is a stated choice: the identity
 * resamples reproduced compareExports' values to 5.6e-17 and 1.1e-16 px,
 * which is floating-point reassociation of the same sums; 1e-12 px is four
 * orders of magnitude above that and seven orders under the smallest
 * movement the record reads from these scripts (0.00026 px), so it trips on
 * no reassociation and admits no real discrepancy.
 *
 * A known limitation, as the frame-set script's and the stall check's: this
 * script is covered by no test and by no format check (`docs/` is outside
 * both), so a change in a dependency or in the exports' shape could break it
 * without notice while the figures it produced stay in the record; and the
 * tool has no tests, so a defect in it would produce a wrong result
 * reproducibly. Its guards are the four checks above, which catch a changed
 * cornerJitter or a broken construction, not a defect of their own. The
 * checks are fatal, so no figure is printed after a failed check.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = "2026-10-17-r1-window-bootstrap.mjs";
const { cornerJitter, compareExports, isLoopWrap, mediaKey, JITTER_WINDOW_S } = await import(
    pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href
);

/** The floating-point tolerance of every construct-against-metric comparison, px. See the header. */
export const TOL_PX = 1e-12;

/** Exit non-zero with one line naming what disagrees; nothing is printed after it. */
export function fatal(script, message) {
    console.error(`${script}: ${message}`);
    process.exit(1);
}

/** mulberry32, as scripts/replay-clips.mjs seeds Math.random. */
export function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Round 1's two static baselines, compareExports over them, and the pair-common media times. */
export function loadRound1(script) {
    const load = (n) =>
        JSON.parse(readFileSync(join(HERE, `2026-09-28-tab9-tuning-r1-${n}.json`), "utf8"));
    const base = load("baseline-static");
    const rep = load("baseline-static-repeat");
    const cmp = compareExports(base, rep);
    const repKeys = new Set(rep.frames.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)));
    const commonKeys = new Set(
        base.frames
            .filter((f) => f.corners)
            .map((f) => mediaKey(f.mediaTimeSeconds))
            .filter((k) => repKeys.has(k)),
    );
    if (commonKeys.size !== cmp.commonMediaTimes) {
        fatal(script, `common media times: ${commonKeys.size} rebuilt against compareExports' ${cmp.commonMediaTimes}`);
    }
    const inCommon = (f) => !!f.corners && commonKeys.has(mediaKey(f.mediaTimeSeconds));
    const allPosed = (f) => !!f.corners;
    return { base, rep, cmp, commonKeys, inCommon, allPosed };
}

/**
 * A run's eligible windows under `sel`, each as its frames in processed order,
 * keyed as the metric keys them, with its own single-window reading.
 */
export function eligibleWindows(e, sel) {
    const F = e.frames;
    let loop = 0;
    const w = new Map();
    for (let i = 0; i < F.length; i++) {
        if (i > 0 && isLoopWrap(F[i - 1], F[i])) loop++;
        if (!sel(F[i])) continue;
        const k = `${loop}:${Math.floor(F[i].mediaTimeSeconds / JITTER_WINDOW_S)}`;
        if (!w.has(k)) w.set(k, []);
        w.get(k).push(F[i]);
    }
    const out = [];
    for (const [k, frames] of w) {
        if (frames.length < 4) continue;
        const m = frames.reduce((a, f) => a + f.mediaTimeSeconds, 0) / frames.length;
        if (frames.reduce((a, f) => a + (f.mediaTimeSeconds - m) ** 2, 0) === 0) continue;
        const single = cornerJitter(frames, {}); // this window alone: its own pooled value
        out.push({
            key: k,
            loop: Number(k.split(":")[0]),
            floor: Math.floor(frames[0].mediaTimeSeconds / JITTER_WINDOW_S),
            frames,
            n: frames.length,
            span: frames[frames.length - 1].mediaTimeSeconds - frames[0].mediaTimeSeconds,
            rms: single.jitterPx,
            // residual sum and dof of this window, from the metric's own reading of it
            R: single.jitterPx ** 2 * 4 * (frames.length - 2),
            dof: frames.length - 2,
        });
    }
    return out;
}

const sentinel = (t) => ({ mediaTimeSeconds: t, corners: null });

/** The frames array cornerJitter pools as the multiset of window instances `draws`. */
export function construct(draws) {
    // greedy: each instance into the first synthetic loop without its floor
    const loops = [];
    for (const w of draws) {
        let placed = false;
        for (const l of loops) {
            if (!l.some((x) => x.floor === w.floor)) {
                l.push(w);
                placed = true;
                break;
            }
        }
        if (!placed) loops.push([w]);
    }
    const frames = [];
    for (const l of loops) {
        frames.push(sentinel(13.0), sentinel(0));
        l.sort((a, b) => a.floor - b.floor);
        for (const w of l) frames.push(...w.frames);
    }
    return frames;
}

/** The pooled value of `draws` from the metric's own single-window readings: a check only. */
export const pooledFromSingles = (draws) =>
    Math.sqrt(draws.reduce((a, w) => a + w.R, 0) / (4 * draws.reduce((a, w) => a + w.dof, 0)));

/** The metric over a constructed multiset: fatal unless finite and one window per draw. */
export function pooled(script, label, draws) {
    const j = cornerJitter(construct(draws), {});
    if (!Number.isFinite(j.jitterPx)) fatal(script, `${label}: jitterPx is ${j.jitterPx}, not a finite number`);
    if (j.jitterWindows !== draws.length) {
        fatal(script, `${label}: ${j.jitterWindows} windows pooled for ${draws.length} drawn`);
    }
    return j.jitterPx;
}

/**
 * Checks 1 and 2 for one run: its eligible-window count against `reference`
 * (compareExports' reading of the same run on the same media times) and the
 * identity resample against the reference's jitterPx, within TOL_PX. Fatal on
 * either; returns what it compared.
 */
export function identityCheck(script, label, windows, reference) {
    if (windows.length !== reference.jitterWindows) {
        fatal(script, `${label}: ${windows.length} eligible windows enumerated, compareExports pooled ${reference.jitterWindows}`);
    }
    const value = pooled(script, `${label} identity resample`, [...windows]);
    if (!Number.isFinite(reference.jitterPx)) fatal(script, `${label}: compareExports' jitterPx is ${reference.jitterPx}`);
    const diff = Math.abs(value - reference.jitterPx);
    if (diff > TOL_PX) {
        fatal(script, `${label}: identity resample ${value} against compareExports ${reference.jitterPx}, |diff| ${diff.toExponential(2)} px over TOL_PX ${TOL_PX}`);
    }
    return { value, reference: reference.jitterPx, diff };
}

const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / (s.length - 1));
    const q = (p) => s[Math.round((s.length - 1) * p)];
    return { mean, sd, p025: q(0.025), p50: q(0.5), p975: q(0.975), min: s[0], max: s[s.length - 1] };
};

function main() {
    const B = Number(process.argv[2] ?? 10000);
    const SEED = Number(process.argv[3] ?? 1);
    if (!(Number.isInteger(B) && B > 1) || !Number.isInteger(SEED)) {
        fatal(SCRIPT, `usage: node ${SCRIPT} [resamples ≥ 2] [seed]; got ${process.argv.slice(2).join(" ")}`);
    }
    const { base, rep, cmp, inCommon } = loadRound1(SCRIPT);
    const runs = { baseline: eligibleWindows(base, inCommon), repeat: eligibleWindows(rep, inCommon) };

    // ---- phase 1: every check, fatal, before any figure is printed ----------
    const id = {
        baseline: identityCheck(SCRIPT, "baseline", runs.baseline, cmp.first),
        repeat: identityCheck(SCRIPT, "repeat", runs.repeat, cmp.second),
    };
    const dup = [...runs.baseline, runs.baseline[0], runs.baseline[0], runs.baseline[5]];
    const dupValue = pooled(SCRIPT, "check 3, one window thrice and one twice", dup);
    const dupDiff = Math.abs(dupValue - pooledFromSingles(dup));
    if (dupDiff > TOL_PX) {
        fatal(SCRIPT, `check 3: construct ${dupValue} against pooled single-window readings ${pooledFromSingles(dup)}, |diff| ${dupDiff.toExponential(2)} px over TOL_PX ${TOL_PX}`);
    }
    const rnd = mulberry32(SEED);
    const draw = (ws) => Array.from({ length: ws.length }, () => ws[Math.floor(rnd() * ws.length)]);
    const moves = [];
    const vb = [];
    const vr = [];
    let maxCheck4 = 0;
    for (let t = 0; t < B; t++) {
        const db = draw(runs.baseline);
        const dr = draw(runs.repeat);
        const jb = pooled(SCRIPT, `resample ${t}, baseline`, db);
        const jr = pooled(SCRIPT, `resample ${t}, repeat`, dr);
        if (t < 200) {
            for (const [label, j, d] of [["baseline", jb, db], ["repeat", jr, dr]]) {
                const diff = Math.abs(j - pooledFromSingles(d));
                if (diff > TOL_PX) {
                    fatal(SCRIPT, `resample ${t}, ${label}: construct ${j} against pooled single-window readings ${pooledFromSingles(d)}, |diff| ${diff.toExponential(2)} px over TOL_PX ${TOL_PX}`);
                }
                maxCheck4 = Math.max(maxCheck4, diff);
            }
        }
        vb.push(jb);
        vr.push(jr);
        moves.push(jr - jb);
    }

    // ---- phase 2: the checks' readings, then the figures --------------------
    const f = (v) => v.toFixed(5);
    console.log(`pair-common media times: ${cmp.commonMediaTimes}`);
    console.log(`eligible windows on the common set: baseline ${runs.baseline.length} (compareExports ${cmp.first.jitterWindows}), repeat ${runs.repeat.length} (compareExports ${cmp.second.jitterWindows})`);
    console.log(`frames per window: baseline ${runs.baseline.map((w) => w.n).join(" ")}; repeat ${runs.repeat.map((w) => w.n).join(" ")}`);
    console.log(`check 2, identity resample (TOL_PX ${TOL_PX}): baseline ${id.baseline.value} vs compareExports ${id.baseline.reference} (diff ${id.baseline.diff.toExponential(2)}); repeat ${id.repeat.value} vs ${id.repeat.reference} (diff ${id.repeat.diff.toExponential(2)})`);
    console.log(`check 3, one window thrice and one twice: construct ${dupValue} (${dup.length} windows) vs pooled singles ${pooledFromSingles(dup)} (diff ${dupDiff.toExponential(2)}); expected windows ${dup.length}`);
    console.log(`check 4 over the first 200 resamples, max |construct − pooled singles|: ${maxCheck4.toExponential(2)}; every resample finite with one window per draw`);
    const M = stats(moves);
    const SB = stats(vb);
    const SR = stats(vr);
    console.log(`\nbootstrap: ${B} resamples, seed ${SEED} (mulberry32), ${runs.baseline.length} and ${runs.repeat.length} windows drawn with replacement per run`);
    console.log(`movement (repeat − baseline): mean ${f(M.mean)}, sd ${f(M.sd)}, 2.5% ${f(M.p025)}, median ${f(M.p50)}, 97.5% ${f(M.p975)}, min ${f(M.min)}, max ${f(M.max)}`);
    console.log(`per run: baseline mean ${f(SB.mean)} sd ${f(SB.sd)} [${f(SB.p025)}, ${f(SB.p975)}]; repeat mean ${f(SR.mean)} sd ${f(SR.sd)} [${f(SR.p025)}, ${f(SR.p975)}]`);
    console.log(`observed movement on the common set: ${f(cmp.second.jitterPx - cmp.first.jitterPx)}; live allowance 0.00700; sd ÷ allowance ${(M.sd / 0.007).toFixed(3)}`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) main();
