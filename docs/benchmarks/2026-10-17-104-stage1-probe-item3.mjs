/*
 *  2026-10-17-104-stage1-probe-item3.mjs
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
 * Item 3 of #104's Stage 1 probe, completed (2026-10-17-104-stage1-probe-item3.md):
 * #92's two candidates measured on the probe's instrument. Reads the probe's
 * recorded replays, the shadow replays' observed `estimateHomography` calls,
 * the frozen metrics module and the bundle, and writes nothing but its report
 * to stdout.
 *
 *     node docs/benchmarks/2026-10-17-104-stage1-probe-item3.mjs <replay dir> <shadow dir>
 *
 * `<replay dir>` is the probe's: `seed-1` to `seed-8`, each the `--out`
 * directory of `scripts/replay-clips.mjs --external 70 --seed <n> --packages
 * bundle` run in a clean worktree at 37dc6d4 on node v24.21.0.
 * `<shadow dir>` holds `seed-1` to `seed-8` produced by the same command
 * with `--import 2026-10-17-104-stage1-probe-item3-observer.mjs`, each
 * holding the exports again and `estimateHomography-calls.json`. Neither set
 * of exports is committed (`AGENTS.md`, "Test assets"). Only the "every
 * frame, sync" arm of the two hand-held clips is read, over counted loops
 * 1 to 4.
 *
 * A known limitation, as the probe script's: this file is covered by no test
 * and by no format check (`docs/` is outside both), so a change in a
 * dependency or in the exports' shape could break it without notice while the
 * figures it produced stay in the record; and the tool has no tests, so a
 * defect in it would produce a wrong result reproducibly. Its guards are the
 * checks in step 1 below, which catch a changed `cornerJitter`, a shadow that
 * differs from the recorded run and a call that matches no frame, not a
 * defect of its own.
 *
 * The method, so that it can be redone without this file:
 *
 * 1. Per export, three checks that can fail: `cornerJitter` over the counted
 *    frames (`countedLoopFrames` with the export's `loops` and
 *    `clipDurationS`) must equal the recorded `runSummary.jitterPx` exactly;
 *    the shadow export must equal the recorded one frame for frame on
 *    `state`, `ok`, `numInliers`, `numMatches`, `mediaTimeSeconds`,
 *    `timestampMs` and `corners`, with the same `runSummary.jitterPx`; and
 *    every posed DETECT frame must match an observed call, by projecting the
 *    call's `H` onto `targetCorners` and comparing to the frame's `corners`
 *    exactly, with the same inlier and match counts. Duplicate matches (the
 *    other arms detect the same frame under the same seed) must carry the
 *    same `rms`.
 * 2. The filters, each `cornerJitter`'s own `include`; the metric is never
 *    reimplemented, and a non-DETECT frame is always kept. The probe's: A(N),
 *    refuse a DETECT frame with fewer than N inliers; S, O, E at τ, refuse a
 *    DETECT frame whose |d_scale|, |d_orth|, or either, exceeds τ (the signal
 *    as the probe computes it: H recovered from the four corners,
 *    K = intrinsics(width, height), B = K⁻¹H). #92's inlier-scaled residual
 *    limit, in three forms, `rms` being the observed residual and `n` the
 *    inliers: plain, rms ≤ c, the unscaled reference; linear, rms ≤ c·n/8,
 *    whose limit at n = 4 is c/2; dof, rms ≤ c·√(1 − 4/n), i.e.
 *    σ̂ = rms/√(1 − 4/n) ≤ c, whose limit at n = 4 is 0, so a 4-inlier fit
 *    has no residual estimate and is refused.
 * 3. Lock births: every TRACK run touching the counted loops is attributed to
 *    the DETECT frame before it in processed order; a lasting lock has 50 or
 *    more counted frames. A filter refuses a birth when it refuses that
 *    DETECT frame.
 * 4. #92's second candidate, a bound on the scale change a single step may
 *    imply, is not a filter here: it has no quantity at a detection. What is
 *    counted instead is how many posed detections and lasting lock births
 *    have a posed previous frame, and what state that frame is in.
 * 5. Dispersion over the eight seeds: the SD on 7 degrees of freedom with its
 *    95% interval (χ² quantiles 1.690 and 16.013). Refusal sets are compared
 *    pairwise on the posed DETECT frames of the counted loops, eight seeds
 *    pooled, and on the lasting lock births.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const [REPLAY, SHADOW] = process.argv.slice(2);
if (!REPLAY || !SHADOW) {
    console.error("usage: node 2026-10-17-104-stage1-probe-item3.mjs <replay dir> <shadow dir>");
    process.exit(1);
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CLIPS = ["pinball-bench", "pinball-bench-table"];
const ARM = "tracking-every-frame-sync";
const NS = [5, 6, 7, 8, 10, 12, 16];
const TAUS = [0.05, 0.1, 0.2];
const CS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const { cornerJitter, countedLoopFrames, targetCorners, reprojectCorners } = await import(
    pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href
);
const { intrinsics, decode } = await import(
    pathToFileURL(join(HERE, "../../examples/dist/webarkit-packages.mjs")).href
);
const decoded = decode(
    new Uint8Array(readFileSync(join(HERE, "../../examples/targets/pinball.wnft"))),
);
if (!decoded.ok) throw new Error(decoded.error);
const TP = targetCorners(decoded.target.meta.widthPx, decoded.target.meta.heightPx);

// ---- H from four corners, and the conditioning signal: the probe's, verbatim ----
function solve(A, b) {
    const n = b.length;
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        if (M[c][c] === 0) return null;
        for (let r = c + 1; r < n; r++) {
            const f = M[r][c] / M[c][c];
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let s = M[r][n];
        for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
        x[r] = s / M[r][r];
    }
    return x;
}
function homographyFromCorners(corners) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = TP[i];
        const [u, v] = corners[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
    }
    const h = solve(A, b);
    if (!h) return null;
    return [...h, 1];
}
function conditioning(H, K) {
    if (K[1] !== 0 || K[3] !== 0) throw new Error("K has skew");
    const fx = K[0];
    const cx = K[2];
    const fy = K[4];
    const cy = K[5];
    const col = (j) => [(H[j] - cx * H[6 + j]) / fx, (H[3 + j] - cy * H[6 + j]) / fy, H[6 + j]];
    const b1 = col(0);
    const b2 = col(1);
    const n1 = Math.hypot(...b1);
    const n2 = Math.hypot(...b2);
    const dot = b1[0] * b2[0] + b1[1] * b2[1] + b1[2] * b2[2];
    return { dScale: n1 / n2 - 1, dOrth: dot / (n1 * n2) };
}

const q = (xs, p) => {
    const s = [...xs].sort((a, b) => a - b);
    if (s.length === 0) return null;
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const sd = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const f3 = (v) => (v === null || v === undefined ? "null" : v.toFixed(3));
/** Frames grouped by their media time, to the microsecond: the same instant of the clip across seeds and loops. */
const byTime = (xs) => {
    const m = new Map();
    for (const x of xs) {
        const k = x.mediaTime.toFixed(6);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
    }
    return m;
};
const describeByTime = (m) =>
    [...m]
        .sort((a, b) => a[0] - b[0])
        .map(([t, xs]) => {
            const uniq = (vs) => [...new Set(vs)].sort((a, b) => a - b).join("/");
            const sg = xs.map(sigmaOf).filter((v) => v !== null);
            return `${t} s: ${xs.length} frames, inliers ${uniq(xs.map((x) => x.inliers))} of ${uniq(xs.map((x) => x.matches))} matches, seeds ${uniq(xs.map((x) => x.seed))}, sigma ${sg.length ? `${f3(Math.min(...sg))}..${f3(Math.max(...sg))}` : "undefined"}`;
        })
        .join("; ");
const ci = (s) =>
    `[${(s * Math.sqrt(7 / 16.013)).toFixed(3)}, ${(s * Math.sqrt(7 / 1.69)).toFixed(3)}]`;
const inlierGroup = (n) => (n <= 7 ? String(n) : n <= 15 ? "8-15" : "16+");

// ---- the filters: label -> keep(posed DETECT frame's data) --------------------
const sigmaOf = (x) => (x.inliers > 4 ? x.rms / Math.sqrt(1 - 4 / x.inliers) : null);
const FILTERS = new Map();
for (const N of NS) FILTERS.set(`A>=${N}`, (x) => x.inliers >= N);
for (const t of TAUS) {
    FILTERS.set(`S<=${t}`, (x) => Math.abs(x.dScale) <= t);
    FILTERS.set(`O<=${t}`, (x) => Math.abs(x.dOrth) <= t);
    FILTERS.set(`E<=${t}`, (x) => Math.max(Math.abs(x.dScale), Math.abs(x.dOrth)) <= t);
}
for (const c of CS) FILTERS.set(`Rplain<=${c}`, (x) => x.rms <= c);
for (const c of CS) FILTERS.set(`Rdof<=${c}`, (x) => x.inliers > 4 && sigmaOf(x) <= c);
for (const c of CS) FILTERS.set(`Rlin<=${c}`, (x) => x.rms <= (c * x.inliers) / 8);

// ---- per export -------------------------------------------------------------
const results = {};
for (const clip of CLIPS) {
    const C = {
        rows: [],
        births: [],
        oneFrameRuns: 0,
        seeds: {},
        checks: { reproduced: 0, shadowEqual: 0, posedDetect: 0, unmatched: 0, dupInconsistent: 0 },
        pred: {
            det: 0,
            posed: 0,
            state: {},
            byGroup: {},
            births: 0,
            birthsPosed: 0,
            birthState: {},
        },
    };
    results[clip] = C;
    for (const seed of SEEDS) {
        const e = JSON.parse(
            readFileSync(join(REPLAY, `seed-${seed}`, `replay-${clip}-${ARM}.json`), "utf8"),
        );
        const sh = JSON.parse(
            readFileSync(join(SHADOW, `seed-${seed}`, `replay-${clip}-${ARM}.json`), "utf8"),
        );
        const calls = JSON.parse(
            readFileSync(join(SHADOW, `seed-${seed}`, "estimateHomography-calls.json"), "utf8"),
        );

        // check: the shadow equals the recorded run, frame for frame
        let equal =
            e.frames.length === sh.frames.length &&
            e.runSummary.jitterPx === sh.runSummary.jitterPx;
        for (let i = 0; equal && i < e.frames.length; i++) {
            const a = e.frames[i];
            const b = sh.frames[i];
            for (const k of [
                "state",
                "ok",
                "numInliers",
                "numMatches",
                "mediaTimeSeconds",
                "timestampMs",
            ]) {
                if (a[k] !== b[k]) equal = false;
            }
            if (JSON.stringify(a.corners) !== JSON.stringify(b.corners)) equal = false;
        }
        if (equal) C.checks.shadowEqual++;
        else
            console.error(
                `!! ${clip} seed ${seed}: the shadow export differs from the recorded one`,
            );

        // the observed calls, keyed by the corners their H projects
        const byKey = new Map();
        for (const c of calls) {
            if (!c.ok) continue;
            const k = JSON.stringify(reprojectCorners(c.H, TP));
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(c);
        }

        const D = e.clipDurationS;
        const all = e.frames;
        const K = intrinsics(e.processingResolution.width, e.processingResolution.height);
        const counted = countedLoopFrames(all, { clipDurationS: D, ...e.loops });
        const countedSet = new Set(counted);
        const base = cornerJitter(counted, { clipDurationS: D });
        if (base.jitterPx === e.runSummary.jitterPx) C.checks.reproduced++;
        else console.error(`!! ${clip} seed ${seed}: recorded jitterPx not reproduced`);

        // per posed DETECT frame of the whole export: residual, signal, counts
        const data = new Map();
        for (const f of all) {
            if (f.state !== "DETECT" || !f.corners) continue;
            C.checks.posedDetect++;
            const cs = (byKey.get(JSON.stringify(f.corners)) ?? []).filter(
                (c) => c.numInliers === f.numInliers && c.numMatches === f.numMatches,
            );
            if (cs.length === 0) {
                C.checks.unmatched++;
                continue;
            }
            if (new Set(cs.map((c) => c.rms)).size > 1) C.checks.dupInconsistent++;
            const H = homographyFromCorners(f.corners);
            const cond = H ? conditioning(H, K) : { dScale: NaN, dOrth: NaN };
            data.set(f, {
                seed,
                inliers: f.numInliers,
                matches: f.numMatches,
                rms: cs[0].rms,
                maxErr: cs[0].maxErr,
                ...cond,
                mediaTime: f.mediaTimeSeconds,
                counted: countedSet.has(f),
            });
        }
        for (const x of data.values()) if (x.counted) C.rows.push(x);

        // the previous frame of each posed detection in the counted loops (candidate 2's referent)
        for (let i = 0; i < all.length; i++) {
            const f = all[i];
            if (f.state !== "DETECT" || !f.corners || !countedSet.has(f)) continue;
            C.pred.det++;
            const g = inlierGroup(f.numInliers);
            C.pred.byGroup[g] ??= { n: 0, posed: 0 };
            C.pred.byGroup[g].n++;
            const p = i > 0 ? all[i - 1] : null;
            const s = p ? p.state : "none";
            C.pred.state[s] = (C.pred.state[s] ?? 0) + 1;
            if (p && p.corners) {
                C.pred.posed++;
                C.pred.byGroup[g].posed++;
            }
        }

        // the filters, through the imported cornerJitter
        const r = { recorded: e.runSummary.jitterPx, base, filters: {} };
        for (const [label, keep] of FILTERS) {
            const include = (f) => f.state !== "DETECT" || !data.has(f) || keep(data.get(f));
            const j = cornerJitter(counted, { include, clipDurationS: D });
            r.filters[label] = {
                jitterPx: j.jitterPx,
                jitterWindows: j.jitterWindows,
                posedFrames: j.posedFrames,
                refusedPosed: counted.filter((f) => f.corners && !include(f)).length,
            };
        }
        C.seeds[seed] = r;

        // lock births: TRACK runs touching the counted loops, and the detection before each
        let origin = null;
        let cur = null;
        const runs = [];
        for (const f of all) {
            if (f.state === "DETECT") {
                origin = f;
                if (cur) runs.push(cur);
                cur = null;
                continue;
            }
            if (f.state === "TRACK") {
                if (!cur) cur = { origin, counted: 0 };
                if (countedSet.has(f)) cur.counted++;
            } else if (cur) {
                runs.push(cur);
                cur = null;
            }
        }
        if (cur) runs.push(cur);
        const touching = runs.filter((x) => x.counted > 0);
        C.oneFrameRuns += touching.filter((x) => x.counted === 1).length;
        const index = new Map(all.map((f, i) => [f, i]));
        for (const run of touching.filter((x) => x.counted >= 50)) {
            const x = data.get(run.origin);
            C.births.push(
                x
                    ? { ...x, countedFrames: run.counted }
                    : {
                          seed,
                          inliers: run.origin.numInliers,
                          noData: true,
                          countedFrames: run.counted,
                      },
            );
            C.pred.births++;
            const i = index.get(run.origin);
            const p = i > 0 ? all[i - 1] : null;
            const s = p ? p.state : "none";
            C.pred.birthState[s] = (C.pred.birthState[s] ?? 0) + 1;
            if (p && p.corners) C.pred.birthsPosed++;
        }
    }
}

// ---- report -----------------------------------------------------------------
for (const clip of CLIPS) {
    const C = results[clip];
    console.log(`\n==== ${clip} ====`);
    console.log(
        `checks: recorded jitterPx reproduced on ${C.checks.reproduced} of ${SEEDS.length} seeds; shadow export equals the recorded one on ${C.checks.shadowEqual} of ${SEEDS.length}; posed DETECT frames in the whole exports ${C.checks.posedDetect}, unmatched to an observed call ${C.checks.unmatched}, inconsistent duplicates ${C.checks.dupInconsistent}`,
    );
    console.log(
        `posed DETECT frames in the counted loops, ${SEEDS.length} seeds: ${C.rows.length}; lasting lock births (>= 50 counted frames): ${C.births.length} (${C.births.filter((b) => b.noData).length} without data); one-frame runs ${C.oneFrameRuns}`,
    );

    console.log(
        "\ncandidate 2's referent: the frame before each posed detection in the counted loops",
    );
    console.log(
        `  posed detections ${C.pred.det}, with a posed previous frame ${C.pred.posed}; previous frame's state ${JSON.stringify(C.pred.state)}`,
    );
    console.log(
        `  by inliers (n / with a posed previous frame): ${Object.entries(C.pred.byGroup)
            .sort()
            .map(([g, v]) => `${g}: ${v.n}/${v.posed}`)
            .join(", ")}`,
    );
    console.log(
        `  lasting lock births ${C.pred.births}, with a posed previous frame ${C.pred.birthsPosed}; previous frame's state ${JSON.stringify(C.pred.birthState)}`,
    );

    console.log(
        "\nresidual by inliers (posed DETECT frames in the counted loops): group | n | rms p10 p50 p90 max | maxErr p50 max | sigma = rms/sqrt(1-4/n) p10 p50 p90 max | matches p50",
    );
    const groups = [
        ["4", (x) => x.inliers === 4],
        ["5", (x) => x.inliers === 5],
        ["6", (x) => x.inliers === 6],
        ["7-8", (x) => x.inliers >= 7 && x.inliers <= 8],
        ["9-15", (x) => x.inliers >= 9 && x.inliers <= 15],
        ["16+", (x) => x.inliers >= 16],
        [">=5 all", (x) => x.inliers >= 5],
        [">=8 all", (x) => x.inliers >= 8],
    ];
    const medianRms = {};
    for (const [name, p] of groups) {
        const g = C.rows.filter(p);
        if (g.length === 0) {
            console.log(`${name} | 0`);
            continue;
        }
        const rms = g.map((x) => x.rms);
        const me = g.map((x) => x.maxErr);
        const sg = g.map(sigmaOf).filter((v) => v !== null);
        medianRms[name] = q(rms, 0.5);
        console.log(
            `${name} | ${g.length} | ${f3(q(rms, 0.1))} ${f3(q(rms, 0.5))} ${f3(q(rms, 0.9))} ${f3(Math.max(...rms))} | ${f3(q(me, 0.5))} ${f3(Math.max(...me))} | ${sg.length ? `${f3(q(sg, 0.1))} ${f3(q(sg, 0.5))} ${f3(q(sg, 0.9))} ${f3(Math.max(...sg))}` : "undefined (n = 4)"} | ${q(
                g.map((x) => x.matches),
                0.5,
            )}`,
        );
    }
    const four = C.rows.filter((x) => x.inliers === 4).map((x) => x.rms);
    if (four.length) {
        console.log(
            `n = 4 rms: min ${Math.min(...four).toExponential(2)}, max ${Math.max(...four).toExponential(2)}, exactly 0 on ${four.filter((v) => v === 0).length} of ${four.length}`,
        );
    }
    // the dof model against the observed medians: it predicts rms ∝ sqrt(1 - 4/n)
    const model = (n) => Math.sqrt(1 - 4 / n);
    if (medianRms["5"] && medianRms["16+"]) {
        console.log(
            `dof model: median rms 5 -> 16+ observed x${(medianRms["16+"] / medianRms["5"]).toFixed(2)}, model sqrt(1-4/16)/sqrt(1-4/5) x${(model(16) / model(5)).toFixed(2)}; model's factor at n = 5: ${model(5).toFixed(3)}, n = 8: ${model(8).toFixed(3)}, n = 16: ${model(16).toFixed(3)}, n = 66: ${model(66).toFixed(3)}`,
        );
    }

    console.log(
        "\nseparation: P(|low| > |high|), best single cut (misses of low, catches of high)",
    );
    const sep = (name, lowP, highP, key) => {
        const low = C.rows
            .filter(lowP)
            .map(key)
            .filter((v) => v !== null);
        const high = C.rows
            .filter(highP)
            .map(key)
            .filter((v) => v !== null);
        if (low.length === 0 || high.length === 0) return;
        let pairs = 0;
        let wins = 0;
        for (const a of low)
            for (const b of high) {
                pairs++;
                if (a > b) wins++;
            }
        let best = null;
        for (const c of [...new Set([...low, ...high])].sort((a, b) => a - b)) {
            const miss = low.filter((v) => v < c).length;
            const caught = high.filter((v) => v >= c).length;
            if (best === null || miss + caught < best.err)
                best = { cut: c, err: miss + caught, miss, caught };
        }
        console.log(
            `${name}: low n=${low.length} high n=${high.length}: P = ${(wins / pairs).toFixed(3)}; cut ${best.cut.toFixed(3)} misses ${best.miss} of ${low.length}, catches ${best.caught} of ${high.length}; low p50 ${f3(q(low, 0.5))} high p50 ${f3(q(high, 0.5))}`,
        );
    };
    const is4 = (x) => x.inliers === 4;
    const ge5 = (x) => x.inliers >= 5;
    const mid = (x) => x.inliers >= 5 && x.inliers <= 7;
    const ge8 = (x) => x.inliers >= 8;
    sep("4 vs >=5 on rms", is4, ge5, (x) => x.rms);
    sep("4 vs >=5 on |d_scale| (the probe's)", is4, ge5, (x) => Math.abs(x.dScale));
    sep("4 vs >=5 on |d_orth| (the probe's)", is4, ge5, (x) => Math.abs(x.dOrth));
    sep("5-7 vs >=8 on rms", mid, ge8, (x) => x.rms);
    sep("5-7 vs >=8 on sigma", mid, ge8, sigmaOf);
    sep("5-7 vs >=8 on |d_scale|", mid, ge8, (x) => Math.abs(x.dScale));
    sep("5-7 vs >=8 on |d_orth|", mid, ge8, (x) => Math.abs(x.dOrth));

    console.log(
        "\nseed sweep: filter | jitterPx seeds 1..8 | ratio | SD [95%] | windows | refused posed | lock births refused",
    );
    const line = (label, pick) => {
        const vals = SEEDS.map((s) => pick(C.seeds[s]));
        const js = vals.map((v) => v.jitterPx);
        const ok = js.every((v) => v !== null);
        const s = ok ? sd(js) : null;
        const rng = (xs) =>
            Math.min(...xs) === Math.max(...xs)
                ? `${Math.min(...xs)}`
                : `${Math.min(...xs)}..${Math.max(...xs)}`;
        const keep = FILTERS.get(label);
        const refusedBirths = keep ? C.births.filter((b) => !b.noData && !keep(b)).length : 0;
        console.log(
            `${label.padEnd(12)} | ${js.map((v) => (v === null ? "null" : v.toFixed(2))).join(" ")} | ${ok ? (Math.max(...js) / Math.min(...js)).toFixed(2) : "-"} | ${ok ? s.toFixed(3) : "-"} ${ok ? ci(s) : ""} | ${rng(vals.map((v) => v.jitterWindows))} | ${rng(vals.map((v) => v.refusedPosed ?? 0))} | ${refusedBirths} of ${C.births.length}`,
        );
    };
    line("none", (r) => r.base);
    for (const label of FILTERS.keys()) line(label, (r) => r.filters[label]);

    console.log(
        "\nlock births: origin inliers | n | rms min..max | sigma min..max | |d_scale| min..max | |d_orth| min..max",
    );
    const byInl = {};
    for (const b of C.births) (byInl[b.inliers] ??= []).push(b);
    for (const [k, bs] of Object.entries(byInl).sort((a, b) => a[0] - b[0])) {
        const r = bs.map((b) => b.rms);
        const sg = bs.map(sigmaOf).filter((v) => v !== null);
        const ds = bs.map((b) => Math.abs(b.dScale));
        const dor = bs.map((b) => Math.abs(b.dOrth));
        console.log(
            `${k} | ${bs.length} | ${f3(Math.min(...r))}..${f3(Math.max(...r))} | ${sg.length ? `${f3(Math.min(...sg))}..${f3(Math.max(...sg))}` : "undefined"} | ${f3(Math.min(...ds))}..${f3(Math.max(...ds))} | ${f3(Math.min(...dor))}..${f3(Math.max(...dor))}`,
        );
    }

    // refusal sets side by side, on the posed DETECT frames of the counted loops, seeds pooled
    const refusedSet = (label) => {
        const keep = FILTERS.get(label);
        return new Set(C.rows.filter((x) => !keep(x)));
    };
    const sizeOfA8 = refusedSet("A>=8").size;
    let matchedC = CS[0];
    for (const c of CS) {
        if (
            Math.abs(refusedSet(`Rdof<=${c}`).size - sizeOfA8) <
            Math.abs(refusedSet(`Rdof<=${matchedC}`).size - sizeOfA8)
        )
            matchedC = c;
    }
    console.log(
        `\nrefusal sets side by side on ${C.rows.length} posed DETECT frames (counted loops, ${SEEDS.length} seeds). Rdof's size-matched c against A>=8 (${sizeOfA8} refused): c = ${matchedC}`,
    );
    const SIDE = [
        ...new Set([
            "A>=5",
            "A>=8",
            "S<=0.05",
            "O<=0.05",
            "E<=0.05",
            "E<=0.2",
            `Rdof<=${matchedC}`,
            "Rdof<=1.5",
            "Rdof<=2",
            "Rplain<=1",
        ]),
    ];
    console.log("X | Y | |X| | |Y| | both | X only | Y only | Jaccard");
    for (let i = 0; i < SIDE.length; i++) {
        for (let j = i + 1; j < SIDE.length; j++) {
            const X = refusedSet(SIDE[i]);
            const Y = refusedSet(SIDE[j]);
            let both = 0;
            for (const x of X) if (Y.has(x)) both++;
            const uni = X.size + Y.size - both;
            console.log(
                `${SIDE[i]} | ${SIDE[j]} | ${X.size} | ${Y.size} | ${both} | ${X.size - both} | ${Y.size - both} | ${uni ? (both / uni).toFixed(3) : "-"}`,
            );
        }
    }
    // how many of the four tests (count, d_scale, d_orth, residual) refuse each frame, and which
    for (const rc of [...new Set([matchedC, 1.5, 2])]) {
        const names = ["A", "S", "O", "R"];
        const sets = ["A>=8", "S<=0.05", "O<=0.05", `Rdof<=${rc}`].map(refusedSet);
        const hist = [0, 0, 0, 0, 0];
        const byGroup = {};
        const who = {};
        const rOnly = {};
        const rOnlyFrames = [];
        for (const x of C.rows) {
            const w = names.filter((_, i) => sets[i].has(x));
            hist[w.length]++;
            (byGroup[inlierGroup(x.inliers)] ??= [0, 0, 0, 0, 0])[w.length]++;
            if (w.length === 1 || w.length === 2) who[w.join("+")] = (who[w.join("+")] ?? 0) + 1;
            if (w.length === 1 && w[0] === "R") {
                (rOnly[inlierGroup(x.inliers)] ??= []).push(sigmaOf(x));
                rOnlyFrames.push(x);
            }
        }
        console.log(
            `frames refused by k of {A>=8, S<=0.05, O<=0.05, Rdof<=${rc}}: k = 0..4: ${hist.join(" ")}`,
        );
        console.log(
            `  by inliers (k = 0/1/2/3/4): ${Object.entries(byGroup)
                .sort()
                .map(([g, h]) => `${g}: ${h.join("/")}`)
                .join("; ")}`,
        );
        console.log(`  which test(s) refuse the k = 1 and k = 2 frames: ${JSON.stringify(who)}`);
        console.log(
            `  refused by the residual alone, by inliers (n, sigma min..max): ${
                Object.entries(rOnly)
                    .sort()
                    .map(
                        ([g, s]) =>
                            `${g}: ${s.length}, ${f3(Math.min(...s))}..${f3(Math.max(...s))}`,
                    )
                    .join("; ") || "none"
            }`,
        );
        // the same frames by media time: a few instants recurring across seeds and loops, or a population
        console.log(
            `  refused by the residual alone, by media time (${byTime(rOnlyFrames).size} distinct): ${
                describeByTime(byTime(rOnlyFrames)) || "none"
            }`,
        );
    }
    console.log(
        `detections with 16 or more inliers, by media time (${byTime(C.rows.filter((x) => x.inliers >= 16)).size} distinct): ${
            describeByTime(byTime(C.rows.filter((x) => x.inliers >= 16))) || "none"
        }`,
    );
    console.log(
        "lock births refused, side by side (pooled): filter -> births refused, by origin inliers",
    );
    for (const label of SIDE) {
        const keep = FILTERS.get(label);
        const ref = C.births.filter((b) => !b.noData && !keep(b));
        const h = {};
        for (const b of ref) h[b.inliers] = (h[b.inliers] ?? 0) + 1;
        console.log(`  ${label}: ${ref.length} of ${C.births.length} ${JSON.stringify(h)}`);
    }
    const birthSets = SIDE.map(
        (l) => new Set(C.births.filter((b) => !b.noData && !FILTERS.get(l)(b))),
    );
    console.log("  pairwise, births refused by both (rows and columns in the order above):");
    for (let i = 0; i < SIDE.length; i++) {
        console.log(
            `  ${SIDE[i].padEnd(12)} ${birthSets.map((Y) => [...birthSets[i]].filter((b) => Y.has(b)).length).join(" ")}`,
        );
    }
}
