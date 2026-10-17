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
 * Checks that can fail: (1) the identity resample, every window once in its
 * original order, reproduces compareExports' common-set values; (2) on a
 * resample, the constructed value equals the pooled value computed from the
 * metric's own single-window readings (jitterPx of one window alone gives
 * that window's residual sum and dof), which is the only place the pooling
 * formula is written here, and only as a check.
 *
 * A known limitation, as the frame-set script's and the stall check's: this
 * script is covered by no test and by no format check (`docs/` is outside
 * both), so a change in a dependency or in the exports' shape could break it
 * without notice while the figures it produced stay in the record; and the
 * tool has no tests, so a defect in it would produce a wrong result
 * reproducibly. Its one guard is the two checks above, which catch a changed
 * cornerJitter or a broken construction, not a defect of their own.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const B = Number(process.argv[2] ?? 10000);
const SEED = Number(process.argv[3] ?? 1);
const { cornerJitter, compareExports, isLoopWrap, mediaKey, JITTER_WINDOW_S } = await import(
    pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href
);
const load = (n) => JSON.parse(readFileSync(join(HERE, `2026-09-28-tab9-tuning-r1-${n}.json`), "utf8"));
const base = load("baseline-static");
const rep = load("baseline-static-repeat");

// mulberry32, as scripts/replay-clips.mjs seeds Math.random
function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(SEED);

const cmp = compareExports(base, rep);
const commonKeys = new Set(
    base.frames.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)).filter((k) =>
        rep.frames.some((f) => f.corners && mediaKey(f.mediaTimeSeconds) === k),
    ),
);
if (commonKeys.size !== cmp.commonMediaTimes) throw new Error("common set mismatch");
const inCommon = (f) => f.corners && commonKeys.has(mediaKey(f.mediaTimeSeconds));

/** A run's eligible windows on the common set, each as its frames in processed order, keyed as the metric keys them. */
function eligibleWindows(e) {
    const F = e.frames;
    let loop = 0;
    const w = new Map();
    for (let i = 0; i < F.length; i++) {
        if (i > 0 && isLoopWrap(F[i - 1], F[i])) loop++;
        if (!inCommon(F[i])) continue;
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
            floor: Math.floor(frames[0].mediaTimeSeconds / JITTER_WINDOW_S),
            frames,
            n: frames.length,
            // residual sum and dof of this window, from the metric's own reading of it
            R: single.jitterPx ** 2 * 4 * (frames.length - 2),
            dof: frames.length - 2,
        });
    }
    return out;
}

const sentinel = (t) => ({ mediaTimeSeconds: t, corners: null });
/** The frames array cornerJitter pools as the multiset of window instances `draws`. */
function construct(draws) {
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
const pooledFromSingles = (draws) =>
    Math.sqrt(draws.reduce((a, w) => a + w.R, 0) / (4 * draws.reduce((a, w) => a + w.dof, 0)));

const runs = { baseline: eligibleWindows(base), repeat: eligibleWindows(rep) };
console.log(`pair-common media times: ${cmp.commonMediaTimes}`);
console.log(`eligible windows on the common set: baseline ${runs.baseline.length} (compareExports ${cmp.first.jitterWindows}), repeat ${runs.repeat.length} (compareExports ${cmp.second.jitterWindows})`);
console.log(`frames per window: baseline ${runs.baseline.map((w) => w.n).join(" ")}; repeat ${runs.repeat.map((w) => w.n).join(" ")}`);

// check 1: identity resample reproduces the common-set values
const idB = cornerJitter(construct([...runs.baseline]), {}).jitterPx;
const idR = cornerJitter(construct([...runs.repeat]), {}).jitterPx;
console.log(`check 1, identity resample: baseline ${idB} vs compareExports ${cmp.first.jitterPx} (diff ${Math.abs(idB - cmp.first.jitterPx).toExponential(2)}); repeat ${idR} vs ${cmp.second.jitterPx} (diff ${Math.abs(idR - cmp.second.jitterPx).toExponential(2)})`);

// check 2: a window drawn twice counts twice (construct vs the metric's single-window readings)
{
    const d = [...runs.baseline, runs.baseline[0], runs.baseline[0], runs.baseline[5]];
    const c = cornerJitter(construct(d), {});
    console.log(`check 2, one window thrice and one twice: construct ${c.jitterPx} (${c.jitterWindows} windows) vs pooled singles ${pooledFromSingles(d)} (diff ${Math.abs(c.jitterPx - pooledFromSingles(d)).toExponential(2)}); expected windows ${d.length}`);
}

// the bootstrap: each run's K windows drawn with replacement from its own K
const draw = (ws) => Array.from({ length: ws.length }, () => ws[Math.floor(rnd() * ws.length)]);
const moves = [];
const vb = [];
const vr = [];
let maxCheck2 = 0;
for (let t = 0; t < B; t++) {
    const db = draw(runs.baseline);
    const dr = draw(runs.repeat);
    const jb = cornerJitter(construct(db), {});
    const jr = cornerJitter(construct(dr), {});
    if (jb.jitterWindows !== db.length || jr.jitterWindows !== dr.length) throw new Error(`window count lost at resample ${t}`);
    if (t < 200) {
        maxCheck2 = Math.max(maxCheck2, Math.abs(jb.jitterPx - pooledFromSingles(db)), Math.abs(jr.jitterPx - pooledFromSingles(dr)));
    }
    vb.push(jb.jitterPx);
    vr.push(jr.jitterPx);
    moves.push(jr.jitterPx - jb.jitterPx);
}
console.log(`check 2 over the first 200 resamples, max |construct − pooled singles|: ${maxCheck2.toExponential(2)}`);
const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / (s.length - 1));
    const q = (p) => s[Math.round((s.length - 1) * p)];
    return { mean, sd, p025: q(0.025), p50: q(0.5), p975: q(0.975), min: s[0], max: s[s.length - 1] };
};
const f = (v) => v.toFixed(5);
const M = stats(moves);
const SB = stats(vb);
const SR = stats(vr);
console.log(`\nbootstrap: ${B} resamples, seed ${SEED} (mulberry32), ${runs.baseline.length} and ${runs.repeat.length} windows drawn with replacement per run`);
console.log(`movement (repeat − baseline): mean ${f(M.mean)}, sd ${f(M.sd)}, 2.5% ${f(M.p025)}, median ${f(M.p50)}, 97.5% ${f(M.p975)}, min ${f(M.min)}, max ${f(M.max)}`);
console.log(`per run: baseline mean ${f(SB.mean)} sd ${f(SB.sd)} [${f(SB.p025)}, ${f(SB.p975)}]; repeat mean ${f(SR.mean)} sd ${f(SR.sd)} [${f(SR.p025)}, ${f(SR.p975)}]`);
console.log(`observed movement on the common set: ${f(cmp.second.jitterPx - cmp.first.jitterPx)}; live allowance 0.00700; sd ÷ allowance ${(M.sd / 0.007).toFixed(3)}`);
