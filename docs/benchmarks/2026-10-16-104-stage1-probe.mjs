/*
 *  2026-10-16-104-stage1-probe.mjs
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
 * The Stage 1 probe for #104 (2026-10-16-104-stage1-probe.md): the refusal of
 * a detection simulated by filtering the desktop replay's own exports, and
 * jitterPx recomputed through the frozen metrics module. Reads the exports
 * and writes nothing but its report to stdout.
 *
 *     node docs/benchmarks/2026-10-16-104-stage1-probe.mjs <replay dir>
 *
 * `<replay dir>` holds `seed-1` to `seed-8`, each the `--out` directory of
 *
 *     node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <dir>/seed-<n>
 *
 * run in a clean worktree at 37dc6d4 (round 0's commit) built on node
 * v24.21.0, as #123's seed test was. Only the "every frame, sync" arm is
 * read, over counted loops 1 to 4. The exports are desktop replays and are
 * not committed.
 *
 * A known limitation, as the frame-set script's
 * (2026-10-16-frame-set-overlap.mjs) and the stall check's: this script is
 * covered by no test and by no format check (`docs/` is outside both), so a
 * change in a dependency or in the exports' shape could break it without
 * notice while the figures it produced stay in the record; and the tool has
 * no tests, so a defect in it would produce a wrong result reproducibly. Its
 * one guard is the reproduction check in step 1 below, which catches a
 * changed `cornerJitter`, not a defect of its own.
 *
 * The method, so that it can be redone without this file:
 *
 * 1. Per export: the counted frames (`countedLoopFrames` with the export's
 *    `loops` and `clipDurationS`); `cornerJitter` over them must equal the
 *    recorded `runSummary.jitterPx` exactly, or the setup is wrong.
 * 2. Filter A(N): `include` refuses a DETECT frame with fewer than N inliers.
 *    Filter B(N): refuses every frame whose lock was born from such a
 *    detection (a TRACK frame inherits the inlier count of the most recent
 *    DETECT frame before it, in processed order). Signal filters S, O, E:
 *    refuse a DETECT frame whose |d_scale|, |d_orth|, or either, exceeds τ.
 *    Each filter is `cornerJitter`'s own `include`; the metric is never
 *    reimplemented. Windows kept and frames per window are read by keying
 *    the kept frames as `cornerJitter` does (`${loop}:${floor(mediaTime)}`,
 *    the loop from `unwrapMediaTimes`) and applying its two eligibility
 *    rules (n ≥ 4, nonzero time spread); the count must equal the module's
 *    `jitterWindows`, which is the check on the keying.
 * 3. The signal per posed frame: H recovered from the export's four corners
 *    (four correspondences determine it; the recovery is checked by
 *    reprojecting the corners), K = intrinsics(width, height) of the export's
 *    processing resolution, B = K⁻¹H, d_scale = ‖b1‖/‖b2‖ − 1,
 *    d_orth = b1·b2/(‖b1‖‖b2‖), as #104 defines them.
 * 4. Dispersion over the eight seeds: the SD on 7 degrees of freedom with its
 *    95% interval (χ² quantiles 1.690 and 16.013).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
if (!OUT) {
    console.error("usage: node 2026-10-16-104-stage1-probe.mjs <replay dir>");
    process.exit(1);
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CLIPS = ["pinball-static", "pinball-bench", "pinball-bench-table"];
const ARM = "tracking-every-frame-sync";
const NS = [5, 6, 7, 8, 10, 12, 16];
const TAUS = [0.05, 0.1, 0.2, 0.5];

const { cornerJitter, countedLoopFrames, unwrapMediaTimes, targetCorners, JITTER_WINDOW_S } =
    await import(pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href);
const { intrinsics, decode } = await import(
    pathToFileURL(join(HERE, "../../examples/dist/webarkit-packages.mjs")).href
);
const decoded = decode(
    new Uint8Array(readFileSync(join(HERE, "../../examples/targets/pinball.wnft"))),
);
if (!decoded.ok) throw new Error(decoded.error);
const TP = targetCorners(decoded.target.meta.widthPx, decoded.target.meta.heightPx);

// ---- H from four corners, and the conditioning signal -----------------------
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
/** Row-major H with h33 = 1 from the target corners and their images, and its reprojection error. */
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
    const H = [...h, 1];
    let err = 0;
    for (let i = 0; i < 4; i++) {
        const [x, y] = TP[i];
        const w = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / w;
        const v = (H[3] * x + H[4] * y + H[5]) / w;
        err = Math.max(err, Math.abs(u - corners[i][0]), Math.abs(v - corners[i][1]));
    }
    return { H, err };
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

// ---- windows, keyed as cornerJitter keys them ------------------------------
function windowKeys(frames, D) {
    const t = unwrapMediaTimes(frames, D);
    return frames.map(
        (f, i) => `${Math.floor(t[i] / D)}:${Math.floor(f.mediaTimeSeconds / JITTER_WINDOW_S)}`,
    );
}
/** The windows cornerJitter keeps under `include`: key -> frames in it. */
function keptWindows(frames, keys, include) {
    const w = new Map();
    frames.forEach((f, i) => {
        if (!f.corners || !include(f)) return;
        if (!w.has(keys[i])) w.set(keys[i], []);
        w.get(keys[i]).push(f.mediaTimeSeconds);
    });
    const kept = new Map();
    for (const [k, ts] of w) {
        if (ts.length < 4) continue;
        const m = ts.reduce((a, b) => a + b, 0) / ts.length;
        if (ts.reduce((a, t) => a + (t - m) ** 2, 0) === 0) continue;
        kept.set(k, ts.length);
    }
    return kept;
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

// ---- per export -------------------------------------------------------------
const results = {};
for (const clip of CLIPS) {
    const R = { seeds: {}, rows: [], maxRecoveryErr: 0, K: null, hist: {}, detect: 0, corners: 0, locks: [] };
    results[clip] = R;
    for (const seed of SEEDS) {
        const e = JSON.parse(readFileSync(join(OUT, `seed-${seed}`, `replay-${clip}-${ARM}.json`), "utf8"));
        const D = e.clipDurationS;
        const all = e.frames;
        const K = intrinsics(e.processingResolution.width, e.processingResolution.height);
        R.K = [...K];
        // each frame's lock origin: the most recent DETECT frame's inlier count
        let origin = 0;
        const originInliers = new Map();
        for (const f of all) {
            if (f.state === "DETECT") origin = f.numInliers;
            originInliers.set(f, f.state === "TRACK" ? origin : f.state === "DETECT" ? f.numInliers : null);
        }
        const counted = countedLoopFrames(all, { clipDurationS: D, ...e.loops });
        const countedSet = new Set(counted);
        const keys = windowKeys(counted, D);
        const keyOf = new Map(counted.map((f, i) => [f, keys[i]]));
        const base = cornerJitter(counted, { clipDurationS: D });
        const baseKept = keptWindows(counted, keys, () => true);
        // the signal on every posed counted frame
        const condOf = new Map();
        for (const f of counted) {
            if (!f.corners) continue;
            const h = homographyFromCorners(f.corners);
            if (!h) continue;
            R.maxRecoveryErr = Math.max(R.maxRecoveryErr, h.err);
            const c = conditioning(h.H, K);
            condOf.set(f, c);
            R.rows.push({ state: f.state, inliers: f.numInliers, ...c });
        }
        for (const f of counted) {
            if (f.state !== "DETECT") continue;
            R.detect++;
            R.hist[f.numInliers] ??= { all: 0, corners: 0 };
            R.hist[f.numInliers].all++;
            if (f.corners) {
                R.corners++;
                R.hist[f.numInliers].corners++;
            }
        }
        const states = {};
        for (const f of counted) states[f.state] = (states[f.state] ?? 0) + 1;
        const r = {
            recorded: e.runSummary.jitterPx,
            reproduced: base.jitterPx === e.runSummary.jitterPx,
            windowsCheck: baseKept.size === base.jitterWindows,
            states,
            counted: counted.length,
            base: { ...base, framesPerWindow: [...baseKept.values()] },
            filters: {},
        };
        const apply = (label, include, decompose) => {
            const j = cornerJitter(counted, { include, clipDurationS: D });
            const kept = keptWindows(counted, keys, include);
            const onKept = decompose
                ? cornerJitter(counted, { include: (f) => kept.has(keyOf.get(f)), clipDurationS: D })
                      .jitterPx
                : null;
            r.filters[label] = {
                jitterPx: j.jitterPx,
                jitterWindows: j.jitterWindows,
                posedFrames: j.posedFrames,
                refusedPosed: counted.filter((f) => f.corners && !include(f)).length,
                windowsCheck: kept.size === j.jitterWindows,
                framesPerWindow: [...kept.values()],
                baseOnKeptWindows: onKept,
            };
        };
        for (const N of NS) {
            apply(`A${N}`, (f) => f.state !== "DETECT" || f.numInliers >= N, true);
            apply(`B${N}`, (f) => originInliers.get(f) >= N, true);
        }
        for (const tau of TAUS) {
            for (const [kind, pick] of [
                ["S", (c) => Math.abs(c.dScale)],
                ["O", (c) => Math.abs(c.dOrth)],
                ["E", (c) => Math.max(Math.abs(c.dScale), Math.abs(c.dOrth))],
            ]) {
                apply(`${kind}${tau}`, (f) => f.state !== "DETECT" || pick(condOf.get(f)) <= tau, false);
            }
        }
        R.seeds[seed] = r;
        // TRACK runs touching the counted loops, and the detection that started each
        let originFrame = null;
        let cur = null;
        const runs = [];
        for (const f of all) {
            if (f.state === "DETECT") {
                originFrame = f;
                if (cur) runs.push(cur);
                cur = null;
                continue;
            }
            if (f.state === "TRACK") {
                if (!cur) cur = { origin: originFrame, counted: 0 };
                if (countedSet.has(f)) cur.counted++;
            } else if (cur) {
                runs.push(cur);
                cur = null;
            }
        }
        if (cur) runs.push(cur);
        for (const run of runs.filter((x) => x.counted > 0)) {
            const o = run.origin;
            let c = null;
            if (o.corners) {
                const h = homographyFromCorners(o.corners);
                if (h) c = conditioning(h.H, K);
            }
            R.locks.push({ seed, inliers: o.numInliers, corners: !!o.corners, counted: run.counted, c });
        }
    }
}

// ---- report -----------------------------------------------------------------
for (const clip of CLIPS) {
    const R = results[clip];
    console.log(`\n==== ${clip} ====`);
    console.log(
        "recorded jitterPx reproduced on every seed:",
        SEEDS.every((s) => R.seeds[s].reproduced),
        "| window keying matches jitterWindows on every filter of every seed:",
        SEEDS.every((s) => R.seeds[s].windowsCheck && Object.values(R.seeds[s].filters).every((x) => x.windowsCheck)),
    );
    console.log(`recorded values: ${SEEDS.map((s) => R.seeds[s].recorded).join(" ")}`);
    const s1 = R.seeds[1];
    console.log(`seed 1: counted frames ${s1.counted}, states ${JSON.stringify(s1.states)}`);
    console.log(`seed 1 frames per window, no filter: ${s1.base.framesPerWindow.join(" ")}`);
    console.log(`seed 1 frames per window, A>=8: ${s1.filters.A8.framesPerWindow.join(" ")}`);
    console.log(`seed 1 frames per window, B>=8: ${s1.filters.B8.framesPerWindow.join(" ")}`);

    console.log("\nseed sweep: jitterPx on seeds 1..8 | min | max | ratio | sd on 7 dof [95%] | windows kept | posed | refused posed");
    const line = (label, pick) => {
        const vals = SEEDS.map((s) => pick(R.seeds[s]));
        const js = vals.map((v) => v.jitterPx);
        const ok = js.every((v) => v !== null);
        const s = ok ? sd(js) : null;
        const ci = ok ? `[${(s * Math.sqrt(7 / 16.013)).toFixed(3)}, ${(s * Math.sqrt(7 / 1.69)).toFixed(3)}]` : "-";
        const rng = (xs) => `${Math.min(...xs)}..${Math.max(...xs)}`;
        console.log(
            `${label} | ${js.map((v) => (v === null ? "null" : v.toFixed(2))).join(" ")} | ${ok ? Math.min(...js).toFixed(2) : "-"} | ${ok ? Math.max(...js).toFixed(2) : "-"} | ${ok ? (Math.max(...js) / Math.min(...js)).toFixed(2) : "-"} | ${ok ? s.toFixed(3) : "-"} ${ci} | ${rng(vals.map((v) => v.jitterWindows))} | ${rng(vals.map((v) => v.posedFrames))} | ${rng(vals.map((v) => v.refusedPosed ?? 0))}`,
        );
    };
    line("none  ", (r) => r.base);
    for (const N of NS) line(`A>=${String(N).padEnd(3)}`, (r) => r.filters[`A${N}`]);
    for (const N of NS) line(`B>=${String(N).padEnd(3)}`, (r) => r.filters[`B${N}`]);
    console.log("signal filters on DETECT frames (S: |d_scale| <= tau, O: |d_orth| <= tau, E: both):");
    for (const tau of TAUS) for (const kind of ["S", "O", "E"]) line(`${kind}${String(tau).padEnd(5)}`, (r) => r.filters[`${kind}${tau}`]);

    console.log("\nseed 1, per filter: refused posed | windows kept | jitterPx none -> none on the kept windows -> filtered | frames per window min/median/max");
    for (const N of NS) {
        for (const kind of ["A", "B"]) {
            const x = s1.filters[`${kind}${N}`];
            const fw = x.framesPerWindow;
            console.log(
                `${kind}>=${String(N).padEnd(2)} | ${x.refusedPosed} | ${x.jitterWindows} of ${s1.base.jitterWindows} | ${f3(s1.base.jitterPx)} -> ${f3(x.baseOnKeptWindows)} -> ${f3(x.jitterPx)} | ${fw.length ? `${Math.min(...fw)}/${q(fw, 0.5)}/${Math.max(...fw)}` : "-"}`,
            );
        }
    }

    console.log(`\nDETECT frames in the counted loops, 8 seeds: ${R.detect}, with corners ${R.corners}, corners null ${R.detect - R.corners}`);
    console.log(
        "inliers -> all / with corners:",
        Object.entries(R.hist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v.all}/${v.corners}`).join(", "),
    );
    console.log(`H recovery, max corner error: ${R.maxRecoveryErr.toExponential(2)} px; K = [${R.K.map((v) => +v.toFixed(3)).join(", ")}]`);
    const det = R.rows.filter((r) => r.state === "DETECT");
    const trk = R.rows.filter((r) => r.state === "TRACK");
    console.log("group | n | |d_scale| p10 p50 p90 max | |d_orth| p10 p50 p90 max");
    const groups = [
        ["4", (r) => r.inliers === 4],
        ["5", (r) => r.inliers === 5],
        ["6", (r) => r.inliers === 6],
        ["7-8", (r) => r.inliers >= 7 && r.inliers <= 8],
        ["9-15", (r) => r.inliers >= 9 && r.inliers <= 15],
        ["16+", (r) => r.inliers >= 16],
        [">=5 all", (r) => r.inliers >= 5],
    ];
    const stat = (name, g) => {
        if (g.length === 0) return console.log(`${name} | 0`);
        const ds = g.map((r) => Math.abs(r.dScale));
        const dor = g.map((r) => Math.abs(r.dOrth));
        console.log(
            `${name} | ${g.length} | ${f3(q(ds, 0.1))} ${f3(q(ds, 0.5))} ${f3(q(ds, 0.9))} ${f3(Math.max(...ds))} | ${f3(q(dor, 0.1))} ${f3(q(dor, 0.5))} ${f3(q(dor, 0.9))} ${f3(Math.max(...dor))}`,
        );
    };
    for (const [name, pred] of groups) stat(name, det.filter(pred));
    stat("TRACK (reference)", trk);
    const splits = [
        ["4 vs >=5", (r) => r.inliers === 4, (r) => r.inliers >= 5],
        ["4 vs >=9", (r) => r.inliers === 4, (r) => r.inliers >= 9],
        ["<=8 vs >=9", (r) => r.inliers <= 8, (r) => r.inliers >= 9],
        ["<=15 vs >=16", (r) => r.inliers <= 15, (r) => r.inliers >= 16],
    ];
    for (const [name, lowP, highP] of splits) {
        for (const key of ["dScale", "dOrth"]) {
            const low = det.filter(lowP).map((r) => Math.abs(r[key]));
            const high = det.filter(highP).map((r) => Math.abs(r[key]));
            if (low.length === 0 || high.length === 0) continue;
            let best = null;
            for (const c of [...new Set([...low, ...high])].sort((a, b) => a - b)) {
                const miss = low.filter((v) => v < c).length;
                const caught = high.filter((v) => v >= c).length;
                if (best === null || miss + caught < best.err) best = { cut: c, err: miss + caught, miss, caught };
            }
            let pairs = 0;
            let wins = 0;
            for (const a of low) for (const b of high) {
                pairs++;
                if (a > b) wins++;
            }
            console.log(
                `separation ${name} on |${key}|: low n=${low.length}, high n=${high.length}: P(|d_low| > |d_high|) = ${(wins / pairs).toFixed(3)}; best cut ${best.cut.toExponential(2)} misses ${best.miss} of ${low.length} low, catches ${best.caught} of ${high.length} high; high p90 ${f3(q(high, 0.9))} max ${f3(Math.max(...high))}, low p10 ${f3(q(low, 0.1))} min ${f3(Math.min(...low))}`,
            );
        }
    }

    const lasting = R.locks.filter((l) => l.counted >= 50);
    console.log(`\nTRACK runs touching the counted loops, 8 seeds: ${R.locks.length}; lasting (>= 50 counted frames): ${lasting.length}`);
    if (lasting.length) {
        const byInl = {};
        for (const l of lasting) byInl[l.inliers] = (byInl[l.inliers] ?? 0) + 1;
        console.log(`lasting locks by origin inliers: ${JSON.stringify(byInl)}; origins with corners: ${lasting.filter((l) => l.corners).length}; one-frame runs: ${R.locks.filter((l) => l.counted === 1).length}`);
        const withC = lasting.filter((l) => l.c);
        const ds = withC.map((l) => Math.abs(l.c.dScale));
        const dor = withC.map((l) => Math.abs(l.c.dOrth));
        console.log(`origin |d_scale| ${f3(Math.min(...ds))} to ${f3(Math.max(...ds))}, |d_orth| ${f3(Math.min(...dor))} to ${f3(Math.max(...dor))}`);
        const pass = (t) => withC.filter((l) => Math.abs(l.c.dScale) <= t && Math.abs(l.c.dOrth) <= t).length;
        console.log(`origins passing both |d| <= 0.05: ${pass(0.05)}, <= 0.1: ${pass(0.1)}, <= 0.2: ${pass(0.2)}; origins with >= 8 inliers: ${lasting.filter((l) => l.inliers >= 8).length}`);
    }
}
