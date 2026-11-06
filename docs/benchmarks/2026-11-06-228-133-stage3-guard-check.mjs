/*
 *  2026-11-06-228-133-stage3-guard-check.mjs
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
 * #133's implementation, checked against docs/benchmarks/2026-11-06-228-133-stage3-registration.md:
 * G1, G2, G3, G4's leg on the clips (T = 7 on the first record's sensitivity rows) and G5, on the
 * real `poseGuard` option, and Stage 2's covariates per clip. Its results are recorded in
 * docs/benchmarks/2026-11-06-228-133-stage3-addendum-guard.md. G0 is the references script's and
 * the package's test; G4's constructed cases are the package's tests. A desktop replay, headless:
 * not campaign data. It registers nothing.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node docs/benchmarks/2026-11-06-228-133-stage3-guard-check.mjs --self-test
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --seed-policy frame --packages bundle --out <replay dir>/ext
 *     node docs/benchmarks/2026-11-06-228-133-stage3-guard-check.mjs --replay <replay dir> --out <run dir> > <stdout file>
 *     node docs/benchmarks/2026-11-06-228-133-stage3-guard-check.mjs --negatives <scratch dir> > <stdout file>
 *
 * What it drives, as the probes did (2026-11-04-228-stage1-probe.mjs and
 * 2026-11-06-228-stage1-repeat.mjs, whose decoding is copied here and proved by check D below):
 * scripts/replay-run.mjs's `replayRun`, per clip x schedule x seed, 6 loops, loops 1 to 4 counted,
 * under `frame` seeding, stamped on the continuous timeline. The arms are trackers on one run's
 * frames: OFF, its defaults; ON, `poseGuard` with its threshold omitted; FILTER, `poseFilter`, whose
 * corners the common set needs, as in the probes; LOW, `poseGuard` at 7, on the first record's
 * clips; BOTH, the two options together, on G5's clips at one seed.
 *
 * What is computed here and not by the module, so that the check can fail: the tilt (`tiltOf`), and
 * the rule's output, from `closedFormPose` and OFF's own `poseSelection.pose`.
 *
 * Every check is fatal, before any figure is printed. Timings, the head and the tree's state go to
 * stderr; stdout holds no path, clock or commit, so two runs give the same bytes, and a later commit
 * that changes neither this script nor what its digests read gives them too. A known limitation, as
 * every derivation script's here: no test covers docs/, so its guards are its own checks.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-06-228-133-stage3-guard-check.mjs";
const SELF = fileURLToPath(import.meta.url);
const ROOT = process.env.WEBARKIT_ROOT ? resolve(process.env.WEBARKIT_ROOT) : resolve(dirname(SELF), "..", "..");
const out = [];
const say = (line = "") => out.push(line);
function fatal(reason) {
    process.stderr.write(`${SCRIPT}: fatal: ${reason}\n`);
    process.exit(1);
}
const t0 = performance.now();
const lap = (what) => process.stderr.write(`${what}: ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const argv = process.argv.slice(2);
function arg(name) {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fatal(`${name} needs a value`);
    return v;
}
/** A defect in the check's inputs, for exercising a cell the wrong way. Mutants of the code are --negatives'. */
const BREAK = arg("--break");
for (const known of [null, "T-9.36", "T-half", "low-8", "input-hash"]) if (BREAK === known) break; else if (known === "input-hash") fatal(`--break ${BREAK}: unknown`);

// =============================================================================================
// The definitions: pure functions, each tested on constructed cases (--self-test).
// =============================================================================================

/** The tilt, degrees: the first record's `tiltOf` (repeat, line 181), computed here apart from the module. */
const tiltOf = (R) => (Math.acos(Math.min(1, Math.max(-1, R[8]))) * 180) / Math.PI;

/** K · [r1 r2 t], row-major: the repeat's `poseHomography`, line 152. */
function poseHomography(pose, K) {
    const R = pose.R;
    const t = pose.t;
    const M = [R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]];
    const H = new Float64Array(9);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            H[i * 3 + j] = K[i * 3] * M[j] + K[i * 3 + 1] * M[3 + j] + K[i * 3 + 2] * M[6 + j];
        }
    }
    return H;
}
/** The first path at which two values differ, every leaf by `Object.is`; null when none does. */
function firstDifference(a, b, path = "$") {
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
        if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return path;
        if (a.length !== b.length) return `${path}.length`;
        for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return `${path}[${i}]`;
        return null;
    }
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return Object.is(a, b) ? null : path;
    if (Array.isArray(a) !== Array.isArray(b)) return path;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join("|") !== kb.join("|")) return `${path} has keys {${ka.join(",")}} and {${kb.join(",")}}`;
    for (const k of ka) {
        const d = firstDifference(a[k], b[k], `${path}.${k}`);
        if (d !== null) return d;
    }
    return null;
}
/** Every element and `good`, by `Object.is`: the registration's G1. */
const samePose = (a, b) => firstDifference({ R: a.R, t: a.t, good: a.good }, { R: b.R, t: b.t, good: b.good });
/** A result without the fields G1 lets differ: `pose`, `poseGuard`, `timings`. */
function otherFields(r) {
    const { pose: _pose, poseGuard: _guard, timings: _timings, ...rest } = r;
    return rest;
}
/**
 * G1 on one frame: null, or what differs. `off` is the option's absent run, `on` the run under a
 * threshold `T`, and `closedForm` the function under K the check calls itself.
 */
function ruleBreach(off, on, T, closedForm) {
    if ("poseGuard" in off) return "the off run has a poseGuard key";
    const other = firstDifference(otherFields(off), otherFields(on));
    if (other !== null) return `another field: ${other}`;
    if (!off.ok) return "poseGuard" in on ? "a frame that is not ok has a poseGuard key" : null;
    const cf = closedForm(off.H);
    const tilt = cf.good ? tiltOf(cf.R) : null;
    const guarded = tilt !== null && tilt < T;
    if (on.poseGuard === undefined) return "an ok frame has no poseGuard key";
    const reading = firstDifference(on.poseGuard, { tiltDeg: tilt, guarded });
    if (reading !== null) return `the reading: ${reading}: ${on.poseGuard.tiltDeg}, ${on.poseGuard.guarded}, the check's ${tilt}, ${guarded}`;
    const pose = samePose(on.pose, guarded ? cf : off.poseSelection.pose);
    return pose === null ? null : `the pose, tilt ${tilt}, T ${T}: ${pose}`;
}
/** G2: the option's counter against the off run's, over one run's results. Null, or what differs. */
function counterBreach(offCount, onCount, onResults) {
    const fellBack = onResults.filter((r) => r.ok && r.poseSelection.chosen === "fallback").length;
    if (offCount !== fellBack) return `the off run's ${offCount}, against ${fellBack} frames fallen back`;
    const added = onResults.filter((r) => r.ok && r.poseGuard.guarded && r.poseSelection.chosen !== "fallback").length;
    return onCount === offCount + added ? null : `${onCount}, against the off run's ${offCount} + ${added} guarded and not fallen back`;
}
const fx = (v, d = 3) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
const median = (xs) => {
    const v = [...xs].sort((a, b) => a - b);
    const n = v.length;
    return n === 0 ? null : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};
/** min / median / max over the seeds, as the probes print it. */
const span = (xs, d = 0) => `${fx(Math.min(...xs), d)} / ${fx(median(xs), d)} / ${fx(Math.max(...xs), d)}`;
/** The mean of the four corners' distances between two readings of one frame, px. */
const cornerDistance = (a, b) => a.reduce((s, p, j) => s + Math.hypot(p[0] - b[j][0], p[1] - b[j][1]), 0) / 4;
const BANDS = [["0-1", 0, 1], ["1-3", 1, 3], ["3-5", 3, 5], ["5-7", 5, 7], ["7-10", 7, 10], ["10-15", 10, 15], ["15-20", 15, 20], ["20-30", 20, 30], ["30-40", 30, 40], ["over 40", 40, Infinity]];
function bandOf(tilt) {
    for (const [name, lo, hi] of BANDS) if (tilt >= lo && tilt < hi) return name;
    return null;
}
/** A corner's distance outside the frame `[0, w − 1] × [0, h − 1]`, px; 0 inside it. */
const outside = ([x, y], w, h) => Math.hypot(Math.max(0, -x, x - (w - 1)), Math.max(0, -y, y - (h - 1)));
/** The wrong-pose label's test: any corner more than one frame diagonal outside the frame. */
const farOutside = (corners, w, h) => corners.some((c) => outside(c, w, h) > Math.hypot(w, h));
/** The repeat-reads' `loopDifference`: the largest corner difference under H between the counted loops at one media time, px. */
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
        const posed = rs.filter((r) => r.corners);
        for (let i = 1; i < posed.length; i++) {
            for (let c = 0; c < 4; c++) {
                const d = Math.hypot(posed[i].corners[c][0] - posed[0].corners[c][0], posed[i].corners[c][1] - posed[0].corners[c][1]);
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
    return n;
}

/** G3 and G4's cells, as printed. */
function cellBreach(where, name, got, want) {
    return got === want ? null : `${where}: ${name} reads ${got}, registered ${want}`;
}

function selfTest() {
    const fails = [];
    const expect = (what, got, want) => {
        if (!Object.is(got, want)) fails.push(`${what}: ${String(got)}, expected ${String(want)}`);
    };
    const rotX = (deg) => {
        const a = (deg * Math.PI) / 180;
        return Float64Array.from([1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]);
    };
    for (const deg of [0, 2.9, 10, 45, 180]) if (!(Math.abs(tiltOf(rotX(deg)) - deg) < 1e-9)) fails.push(`tilt ${deg}`);
    expect("tilt clamps past 1", tiltOf(Float64Array.from([0, 0, 0, 0, 0, 0, 0, 0, 1 + 1e-15])), 0);
    expect("tilt clamps past -1", tiltOf(Float64Array.from([0, 0, 0, 0, 0, 0, 0, 0, -1 - 1e-15])), 180);
    {
        const K = [100, 0, 50, 0, 100, 60, 0, 0, 1];
        const H = poseHomography({ R: rotX(0), t: [1, 2, 10] }, K);
        expect("K[r1 r2 t]: x", H[2], 100 * 1 + 50 * 10);
        expect("K[r1 r2 t]: y", H[5], 100 * 2 + 60 * 10);
    }
    expect("difference: equal", firstDifference({ a: [1, { b: Float64Array.of(1, 2) }] }, { a: [1, { b: Float64Array.of(1, 2) }] }), null);
    expect("difference: a typed element", firstDifference({ b: Float64Array.of(1, 2) }, { b: Float64Array.of(1, 2 + 1e-9) }), "$.b[1]");
    expect("difference: +0 and -0", firstDifference([0], [-0]), "$.0");
    expect("difference: NaN is NaN", firstDifference([NaN], [NaN]), null);
    expect("difference: a key added", firstDifference({ a: 1 }, { a: 1, b: null }), "$ has keys {a} and {a,b}");
    expect("difference: null against 0", firstDifference({ a: null }, { a: 0 }), "$.a");
    {
        const H = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
        const sel = { R: rotX(20), t: Float64Array.of(0, 0, 1), good: true };
        const cf = (deg) => ({ R: rotX(deg), t: Float64Array.of(0, 0, 2), good: true });
        const closedForm = (deg) => () => cf(deg);
        const off = { ok: true, state: "TRACK", H, pose: sel, poseSelection: { pose: sel, chosen: "selected" }, numInliers: 9, timings: { totalMs: 1 } };
        const onAt = (deg, pose, extra = {}) => ({ ...off, pose, timings: { totalMs: 2 }, poseGuard: { tiltDeg: tiltOf(rotX(deg)), guarded: tiltOf(rotX(deg)) < 10 }, ...extra });
        expect("rule: below T is the closed form", ruleBreach(off, onAt(5, cf(5)), 10, closedForm(5)), null);
        expect("rule: above T is the selection", ruleBreach(off, onAt(15, sel), 10, closedForm(15)), null);
        const moved = cf(5);
        moved.t[2] += 1e-9;
        if (ruleBreach(off, onAt(5, moved), 10, closedForm(5)) === null) fails.push("rule: one element moved must fire");
        if (ruleBreach(off, onAt(5, sel), 10, closedForm(5)) === null) fails.push("rule: below T on the selection must fire");
        if (ruleBreach(off, onAt(15, cf(15)), 10, closedForm(15)) === null) fails.push("rule: above T on the closed form must fire");
        if (ruleBreach(off, onAt(5, cf(5), { numInliers: 8 }), 10, closedForm(5)) === null) fails.push("rule: another field must fire");
        if (ruleBreach(off, onAt(5, cf(5), { H: Float64Array.of(1, 0, 0, 0, 1 + 1e-9, 0, 0, 0, 1) }), 10, closedForm(5)) === null) fails.push("rule: H moved must fire");
        if (ruleBreach(off, { ...onAt(5, cf(5)), poseGuard: { tiltDeg: 5.5, guarded: true } }, 10, closedForm(5)) === null) fails.push("rule: another tilt must fire");
        if (ruleBreach({ ...off, poseGuard: null }, onAt(5, cf(5)), 10, closedForm(5)) === null) fails.push("rule: a key on the off run must fire");
        const { poseGuard: _g, ...noKey } = onAt(5, cf(5));
        if (ruleBreach(off, noKey, 10, closedForm(5)) === null) fails.push("rule: an ok frame with no key must fire");
        const lost = { ok: false, state: "LOST", pose: null, timings: null };
        expect("rule: a lost frame has no key", ruleBreach(lost, { ...lost }, 10, closedForm(5)), null);
        if (ruleBreach(lost, { ...lost, poseGuard: null }, 10, closedForm(5)) === null) fails.push("rule: a key on a lost frame must fire");
        const bad = () => ({ R: rotX(0), t: new Float64Array(3), good: false });
        expect("rule: good false keeps the selection", ruleBreach(off, { ...off, poseGuard: { tiltDeg: null, guarded: false } }, 10, bad), null);
    }
    {
        const r = (guarded, chosen) => ({ ok: true, poseGuard: { guarded }, poseSelection: { chosen } });
        const rs = [r(true, "selected"), r(true, "fallback"), r(false, "fallback"), r(false, "selected"), { ok: false }];
        expect("counter: off 2 + 1 guarded and not fallen back", counterBreach(2, 3, rs), null);
        if (counterBreach(2, 4, rs) === null) fails.push("counter: a frame both guarded and fallen back counted twice must fire");
        if (counterBreach(2, 2, rs) === null) fails.push("counter: a guarded frame not counted must fire");
        if (counterBreach(1, 2, rs) === null) fails.push("counter: an off count that is not the frames fallen back must fire");
    }
    expect("span: even count", span([1, 2, 3, 10]), "1 / 3 / 10");
    expect("span: rounding as printed", span([1, 2], 0), "1 / 2 / 2");
    expect("median", median([3, 1, 2]), 2);
    expect("corner distance, 3-4-5", cornerDistance([[0, 0], [0, 0], [0, 0], [0, 0]], [[3, 4], [3, 4], [3, 4], [3, 4]]), 5);
    for (const [tilt, want] of [[0, "0-1"], [1, "1-3"], [9.99, "7-10"], [10, "10-15"], [14.999, "10-15"], [15, "15-20"], [20, "20-30"], [30, "30-40"], [39.999, "30-40"], [40, "over 40"], [170, "over 40"]]) expect(`band ${tilt}`, bandOf(tilt), want);
    expect("outside: inside", outside([5, 5], 10, 10), 0);
    expect("outside: 3-4-5", outside([-3, 13], 10, 10), 5);
    expect("far outside: one diagonal is not more", farOutside([[-Math.hypot(10, 10), 5]], 10, 10), false);
    expect("far outside: more than one", farOutside([[-Math.hypot(10, 10) - 1, 5]], 10, 10), true);
    {
        const c = (x) => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]];
        const row = (media, state, x) => ({ media, state, corners: state === "LOST" ? null : c(x) });
        expect("loops: equal", loopDifference([[row(0, "TRACK", 1)], [row(0, "TRACK", 1)]]).maxPx, 0);
        expect("loops: a known offset", loopDifference([[row(0, "TRACK", 1)], [{ ...row(0, "TRACK", 1), corners: c(1).map(([x, y]) => [x + 3, y + 4]) }]]).maxPx, 5);
        expect("loops: a state differs", loopDifference([[row(0, "TRACK", 1)], [row(0, "DETECT", 1)]]).stateDiffers, 1);
        const seq = [row(0, "TRACK", 1), row(1, "TRACK", 1), row(2, "DETECT", 1), row(3, "TRACK", 1)];
        expect("track run of 2", trackRun(seq, 0), 2);
        expect("track run of 0", trackRun(seq, 2), 0);
        expect("track run to the end", trackRun(seq, 3), 1);
    }
    expect("cell: equal", cellBreach("x", "y", "1 / 2 / 3", "1 / 2 / 3"), null);
    if (cellBreach("x", "y", "172 / 172 / 176", "216 / 216 / 220") === null) fails.push("cell: a difference must fire");
    if (fails.length) {
        for (const f of fails) process.stderr.write(`self-test: ${f}\n`);
        fatal(`self-test: ${fails.length} failed`);
    }
    process.stdout.write("self-test: all passed\n");
}
if (argv.includes("--self-test")) {
    selfTest();
    process.exit(0);
}

// =============================================================================================
// The registered tables, as printed in the two records and the registration.
// =============================================================================================
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const T = 10;
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4", "pinball-tilt-cross.mp4", "pinball-tilt-mid.mp4", "pinball-tilt-sweep.mp4"];
const FIRST_RECORD_CLIPS = CLIPS.slice(0, 3);
const G5_CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-tilt-cross.mp4"];
const all = (n) => `${n} / ${n} / ${n}`;
/** One row of G3: of (the common set), handed to CF, IPPE already CF, pose changed, switches a run. */
const row = (of, handed, already, changed, switches) => ({ of, handed, already, changed, switches });
const G3 = {
    "pinball-static.mp4": { every: row(all(1452), all(1452), all(0), all(1452), all(0)), 15: row(all(728), all(728), all(0), all(728), all(0)), 25: row(all(728), all(728), all(0), all(728), all(0)) },
    "pinball-bench.mp4": {
        every: row("844 / 848 / 856", "216 / 216 / 220", all(0), "216 / 216 / 220", "31 / 31 / 39"),
        15: row("692 / 702 / 740", "176 / 188 / 192", "0 / 0 / 4", "176 / 186 / 188", "23 / 43 / 55"),
        25: row("316 / 335 / 340", "68 / 78 / 92", "0 / 0 / 4", "68 / 78 / 88", "15 / 23 / 31"),
    },
    "pinball-bench-table.mp4": {
        every: row("844 / 860 / 900", "820 / 832 / 872", "4 / 6 / 8", "812 / 826 / 868", "15 / 23 / 31"),
        15: row("380 / 397 / 416", "360 / 381 / 398", "4 / 8 / 12", "352 / 372 / 392", "7 / 15 / 23"),
        25: row("380 / 397 / 416", "360 / 381 / 398", "4 / 8 / 12", "352 / 372 / 392", "7 / 15 / 23"),
    },
    "pinball-tilt-cross.mp4": { every: row(all(1668), all(992), all(4), all(988), all(7)), 15: row(all(828), all(492), all(4), all(488), all(7)), 25: row(all(828), all(492), all(4), all(488), all(7)) },
    "pinball-tilt-mid.mp4": { every: row(all(2628), all(0), all(0), all(0), all(0)), 15: row("72 / 1316 / 1316", "0 / 0 / 4", "0 / 0 / 4", all(0), "0 / 0 / 8"), 25: row("72 / 1316 / 1316", "0 / 0 / 4", "0 / 0 / 4", all(0), "0 / 0 / 8") },
    "pinball-tilt-sweep.mp4": { every: row("3432 / 3466 / 3472", "0 / 0 / 8", all(0), "0 / 0 / 8", "0 / 0 / 16"), 15: row("1600 / 1692 / 1728", all(0), all(0), all(0), all(0)), 25: row("1600 / 1692 / 1728", all(0), all(0), all(0), all(0)) },
};
/** G4's T = 7: the first record's "#133's figures" at 7.00°: handed, already, changed. */
const G4_HANDED = {
    "pinball-static.mp4": { every: [all(1452), all(0), all(1452)], 15: [all(728), all(0), all(728)], 25: [all(728), all(0), all(728)] },
    "pinball-bench.mp4": { every: [all(0), all(0), all(0)], 15: [all(0), all(0), all(0)], 25: [all(0), all(0), all(0)] },
    "pinball-bench-table.mp4": { every: ["308 / 308 / 312", "4 / 4 / 8", "304 / 304 / 308"], 15: ["152 / 156 / 156", "0 / 4 / 4", "152 / 152 / 152"], 25: ["152 / 156 / 156", "0 / 4 / 4", "152 / 152 / 152"] },
};
/** G4's T = 7: the first record's "The sensitivity": frames, windows, GUARD at 7°. */
const G4_SENSITIVITY = {
    "pinball-bench.mp4": {
        every: { above: ["844 / 848 / 856", all(36), "4.284 / 4.912 / 10.720"] },
        15: { above: ["692 / 702 / 740", all(36), "3.660 / 5.327 / 12.713"] },
        25: { above: ["316 / 335 / 340", "32 / 32 / 36", "4.358 / 5.176 / 13.275"] },
    },
    "pinball-bench-table.mp4": {
        every: { below: ["308 / 308 / 312", all(12), "2.608 / 2.608 / 2.608"], above: ["536 / 552 / 588", "20 / 24 / 28", "2.087 / 3.624 / 6.023"] },
        15: { below: ["152 / 156 / 156", all(12), "2.642 / 2.813 / 2.813"], above: ["224 / 242 / 264", all(20), "2.251 / 2.429 / 10.931"] },
        25: { below: ["152 / 156 / 156", all(12), "2.642 / 2.813 / 2.813"], above: ["224 / 242 / 264", all(20), "2.251 / 2.429 / 10.931"] },
    },
};
/** G3's cross row: the switches, per seed. */
const CROSS_FOOTAGE = { every: { media: "8.297", from: "9.99", to: "10.11", jump: "4.33" }, 15: { media: "8.331", from: null, to: null, jump: "4.41" }, 25: { media: "8.331", from: null, to: null, jump: "4.41" } };

// =============================================================================================
// The inputs.
// =============================================================================================
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
    ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
    ["examples/videos/pinball-tilt-cross.mp4", "3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e"],
    ["examples/videos/pinball-tilt-mid.mp4", "f29c37d71fa074bc8ae4e8c94a89a2f9b6654e458a6d4b144ee5bdf85267e915"],
    ["examples/videos/pinball-tilt-sweep.mp4", "90c5af74401577b29f7090f07b9205d7d5e6524baed7f48d44a6dc9ea4eb9dcf"],
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
];
const PRINTED = ["scripts/replay-run.mjs", "scripts/replay-seeding.mjs", "docs/benchmarks/2026-11-06-228-133-stage3-registration.md"];
const TREES = [
    ["packages/cv-backend-spec/src", () => true],
    ["packages/cv-backend-jsfeatnext/src", () => true],
    ["packages/nft-tracker/src", () => true],
    ["packages/cv-backend-jsfeatnext/dist", (p) => p.endsWith(".js")],
    ["packages/nft-tracker/dist", (p) => p.endsWith(".js")],
    ["examples/js", (p) => p.endsWith(".mjs")],
];
function treeDigest(rel, keep) {
    const base = join(ROOT, rel);
    if (!existsSync(base)) fatal(`${rel}: missing under ${ROOT}`);
    const files = [];
    const walk = (dir, prefix) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = prefix ? `${prefix}/${e.name}` : e.name;
            if (e.isDirectory()) walk(join(dir, e.name), p);
            else if (keep(p)) files.push(p);
        }
    };
    walk(base, "");
    files.sort();
    return { digest: sha256(files.map((p) => `${p} ${sha256(readFileSync(join(base, p)))}`).join("\n")), count: files.length };
}
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 });
const treeState = () => ({ head: git("rev-parse", "HEAD").toString().trim(), diff: sha256(git("diff", "HEAD")), status: git("status", "--short").toString() });

if (arg("--negatives") !== null) {
    negatives(arg("--negatives"));
    process.stdout.write(out.join("\n") + "\n");
    process.exit(0);
}
for (const [rel, want0] of INPUTS) {
    const want = BREAK === "input-hash" && rel.endsWith(".wnft") ? "0".repeat(64) : want0;
    const p = join(ROOT, rel);
    if (!existsSync(p)) fatal(`${rel}: missing under ${ROOT}`);
    const got = sha256(readFileSync(p));
    if (got !== want) fatal(`${rel}: SHA-256 ${got}, expected ${want}`);
}
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { createJsfeatNextBackend, intrinsics } = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
const trackerPkg = await imp("packages/nft-tracker/dist/index.js");
const { PoseFilter } = await imp("packages/nft-tracker/dist/pose/pose_filter.js");
const metrics = await imp("examples/js/bench-metrics.mjs");
const { fitSize } = await imp("examples/js/pinball-shared.mjs");
const { replayRun, loopPeriod } = await imp("scripts/replay-run.mjs");
const { runSeeding, seedingRefusal, countGlobalRandomReads } = await imp("scripts/replay-seeding.mjs");
const { NftTracker, decode, closedFormPose } = trackerPkg;
const { targetCorners, reprojectCorners, cornerJitter, countedLoopFrames, PAGE_PROCESSING_BOX } = metrics;
if (trackerPkg.DEFAULT_POSE_GUARD_THRESHOLD_DEG !== T) fatal(`DEFAULT_POSE_GUARD_THRESHOLD_DEG is ${trackerPkg.DEFAULT_POSE_GUARD_THRESHOLD_DEG}, the registration's ${T}`);
if (firstDifference(trackerPkg.DEFAULT_POSE_GUARD, { mode: "off" }) !== null) fatal("DEFAULT_POSE_GUARD is not { mode: \"off\" }");

/** The repeat's `poseCorners`, line 171: null when `good` is false or any corner's depth is not positive. */
function poseCorners(pose, K, points) {
    if (!pose.good) return null;
    for (const [x, y] of points) if (!(pose.R[6] * x + pose.R[7] * y + pose.t[2] > 0)) return null;
    return reprojectCorners(poseHomography(pose, K), points);
}

const LOOPS = 6;
const COUNTED = Object.freeze({ firstLoop: 1, loopCount: 4 });
/** The arm's threshold: a broken run moves it in the tracker and the check together, so that only the cells can fire. */
// The registration's negative reads "T 9.36" and "172 for 216". The 172 is the first record's row for its half-of-the-fits
// interpolation, 9.357142857142858, printed to two decimals: at 9.36 as written the same cell reads 176. Both legs run.
const T_ARM = BREAK === "T-9.36" ? 9.36 : BREAK === "T-half" ? 9.357142857142858 : T;
const T_LOW = BREAK === "low-8" ? 8 : 7;
const SCHEDULES = [
    { key: "every", stepMs: null, name: "every frame" },
    { key: "15", stepMs: 15, name: "device, 15 ms step" },
    { key: "25", stepMs: 25, name: "device, 25 ms step" },
];
/** Copied from scripts/replay-clips.mjs; proved by the probes' check D. The tilt clips' is BORROWED from the static clip, not measured. */
const DEVICE_ACQUIRE_MS = { "pinball-static.mp4": 36.9, "pinball-bench.mp4": 20.4, "pinball-bench-table.mp4": 41.0, "pinball-tilt-cross.mp4": 36.9, "pinball-tilt-mid.mp4": 36.9, "pinball-tilt-sweep.mp4": 36.9 };
const isBorrowed = (clip, s) => s.stepMs !== null && clip.includes("-tilt-");
const DEVICE_DETECT_MS = 83.2;

const REPLAY_DIR = arg("--replay");
const OUT_DIR = arg("--out");
const CHILD = arg("--child");
/** "<every|15|25|all>:<seed|all>": a part of the plan, for a negative. */
const ONLY = arg("--only") ?? "all:all";
/** Not a counted run: no clean tree is required, and no figure stands. --trial-report also prints the report, to try its code on part of a plan. */
const NEGATIVE = argv.includes("--negative");
if (OUT_DIR === null) fatal("--out <run dir> is required");
if (CHILD !== null) {
    await child(CHILD);
    process.exit(0);
}
await main();
process.exit(0);

// =============================================================================================
// The parent: the tree at both ends, one child per clip, the report.
// =============================================================================================
async function main() {
    const start = treeState();
    process.stderr.write(`tree at the start: ${JSON.stringify(start)}\n`);
    if (!NEGATIVE) {
        if (REPLAY_DIR === null) fatal("--replay <dir holding replay-clips' ext/ at --seed 1> is required for a counted run");
        if (start.status !== "") fatal(`the tree is not clean, and a counted run reads a build of a commit:\n${start.status}`);
    }
    mkdirSync(OUT_DIR, { recursive: true });
    const clips = arg("--clip") ? [arg("--clip")] : CLIPS;
    const pass = [...(REPLAY_DIR === null ? [] : ["--replay", REPLAY_DIR]), "--only", ONLY, ...(BREAK === null ? [] : ["--break", BREAK]), ...(NEGATIVE ? ["--negative"] : [])];
    const codes = await Promise.all(
        clips.map(
            (clip) =>
                new Promise((done) => {
                    const p = spawn(process.execPath, [SELF, ...pass, "--out", OUT_DIR, "--child", clip], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
                    p.on("exit", (code) => done([clip, code]));
                }),
        ),
    );
    for (const [clip, code] of codes) if (code !== 0) fatal(`${clip}: its child exited ${code}; no figure is printed`);
    const end = treeState();
    process.stderr.write(`tree at the end: ${JSON.stringify(end)}\n`);
    if (start.head !== end.head || start.diff !== end.diff || start.status !== end.status) fatal(`the tree changed during the run: ${JSON.stringify(start)} and ${JSON.stringify(end)}`);
    if (NEGATIVE && !argv.includes("--trial-report")) {
        process.stderr.write("a negative run: every check passed, which a negative must not\n");
        return;
    }
    const R = Object.fromEntries(CLIPS.map((clip) => [clip, JSON.parse(readFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`), "utf8"))]));
    lap("all clips");
    report(R);
    process.stdout.write(out.join("\n") + "\n");
}

// =============================================================================================
// One clip: the arms on every schedule and seed, every check, a result file.
// =============================================================================================
async function child(clip) {
    // ---- decoding, copied from scripts/replay-clips.mjs (`probe`, `greyFrames`, `loadClip`), as the probes do ----
    function probe(path) {
        const json = JSON.parse(
            execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path], { maxBuffer: 64 << 20 }).toString(),
        );
        return { width: json.streams[0].width, height: json.streams[0].height, pts: json.frames.map((f) => Number(f.pts_time)) };
    }
    function greyFrames(path, width, height) {
        const rgb = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf", `scale=${width}:${height}:flags=bilinear`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
        const n = width * height;
        const frames = [];
        for (let o = 0; o + 3 * n <= rgb.length; o += 3 * n) {
            const data = new Uint8Array(n);
            for (let i = 0, p = o; i < n; i++, p += 3) data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
            frames.push({ data, width, height });
        }
        return frames;
    }
    const path = join(ROOT, "examples", "videos", clip);
    const { width: sw, height: sh, pts } = probe(path);
    const { width, height } = fitSize(sw, sh, PAGE_PROCESSING_BOX.width, PAGE_PROCESSING_BOX.height);
    const frames = greyFrames(path, width, height);
    if (frames.length !== pts.length) fatal(`${clip}: ${frames.length} frames decoded, ${pts.length} timestamps`);
    const decoded = decode(new Uint8Array(readFileSync(join(ROOT, "examples/targets/pinball.wnft"))));
    if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
    const target = decoded.target;
    const cv = await createJsfeatNextBackend();
    const refused = seedingRefusal(cv);
    if (refused) fatal(refused);
    const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
    const K = intrinsics(width, height);
    const clipDurationS = loopPeriod(pts);
    const stem = clip.replace(/\.mp4$/, "");
    const closedForm = (H) => closedFormPose(H, K);
    lap(`${clip}: decoded ${frames.length} frames at ${width}x${height}`);

    /** One tracker over one schedule: its records, every result as it came, and its counter. */
    function run(schedule, seed, options) {
        let tracker = null;
        const Capturing = class extends NftTracker {
            constructor(...a) {
                super(...a);
                tracker = this;
            }
        };
        const results = [];
        const { value: records, reads } = countGlobalRandomReads(() =>
            replayRun({
                NftTracker: Capturing,
                cv,
                target,
                targetPoints,
                detectMs: DEVICE_DETECT_MS,
                frames,
                pts,
                K,
                mode: "tracking",
                stepMs: schedule.stepMs,
                order: null,
                options,
                probe: { frame: (_f, r) => results.push(r) },
                loops: LOOPS,
                acquireMs: DEVICE_ACQUIRE_MS[clip],
                unwrapped: true,
                seeding: runSeeding(seed, "frame"),
            }),
        );
        if (reads !== 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: ${reads} reads of the global Math.random`);
        if (results.length !== records.length) fatal(`${clip}: ${results.length} results, ${records.length} records`);
        return { records, results, fallbackFrames: tracker.fallbackFrames };
    }
    const guardAt = (thresholdDeg) => ({ poseGuard: { mode: "closed-form-below", ...(thresholdDeg === T ? {} : { thresholdDeg }) } });

    /** G1 and G2 on one run against the off run: fatal on the first breach. */
    function checkRule(off, on, threshold, label) {
        if (on.results.length !== off.results.length) fatal(`${label}: G1: ${off.results.length} frames off, ${on.results.length} on`);
        for (let k = 0; k < off.results.length; k++) {
            const a = off.results[k];
            if (a.ok && a.pose !== a.poseSelection.pose) fatal(`${label}, frame ${k}: the option absent, and pose is not poseSelection.pose`);
            const breach = ruleBreach(a, on.results[k], threshold, closedForm);
            if (breach !== null) fatal(`${label}, frame ${k}: G1: ${breach}`);
        }
        const count = counterBreach(off.fallbackFrames, on.fallbackFrames, on.results);
        if (count !== null) fatal(`${label}: G2: fallbackFrames ${count}`);
    }

    /** G5: both options against the filter module fed the guard's output, on one seed. */
    function checkFilter(schedule, seed, off, on) {
        const label = `${clip}, ${schedule.name}, seed ${seed}`;
        const both = run(schedule, seed, { ...guardAt(T_ARM), poseFilter: { mode: "one-euro" } });
        const filter = new PoseFilter({
            rotation: { minCutOff: trackerPkg.DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF, beta: trackerPkg.DEFAULT_POSE_FILTER_ROTATION_BETA },
            translation: { minCutOff: trackerPkg.DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF, beta: trackerPkg.DEFAULT_POSE_FILTER_TRANSLATION_BETA },
            dCutOff: trackerPkg.DEFAULT_POSE_FILTER_D_CUTOFF,
        });
        let filtered = 0;
        let posed = 0;
        for (let k = 0; k < on.results.length; k++) {
            const g = on.results[k];
            const b = both.results[k];
            const want = filter.apply(g);
            const other = firstDifference(otherFields(off.results[k]), otherFields(b));
            if (other !== null) fatal(`${label}, frame ${k}: G5: another field: ${other}`);
            if (!g.ok) continue;
            posed++;
            const pose = samePose(b.pose, want);
            if (pose !== null) fatal(`${label}, frame ${k}: G5: the pose is not the filter on the guard's output: ${pose}`);
            const guard = firstDifference(b.poseGuard, g.poseGuard);
            if (guard !== null) fatal(`${label}, frame ${k}: G5: the guard's reading: ${guard}`);
            if (b.pose !== want || samePose(b.pose, g.pose) !== null) filtered++;
        }
        if (filtered === 0) fatal(`${label}: G5: the filter filtered no frame`);
        return { posed, filtered };
    }

    /** Check D, on seed 1 at every frame: the copied decoding and the arm's frames against the replay's arm 1 export. */
    function proveAgainstReplay(records) {
        const p = join(REPLAY_DIR, "ext", `replay-${stem}-tracking-every-frame-sync.json`);
        if (!existsSync(p)) fatal(`${p}: missing`);
        const ext = JSON.parse(readFileSync(p, "utf8"));
        if (ext.seed !== 1 || ext.seedPolicy !== "frame") fatal(`${p}: seed ${ext.seed}, policy ${ext.seedPolicy}`);
        if (ext.packageSource.manifestClean !== true) fatal(`${p}: built from a dirty tree`);
        if (ext.frames.length !== records.length) fatal(`${clip}: ${records.length} frames, arm 1's export ${ext.frames.length}`);
        const mask = (f) => {
            const g = JSON.parse(JSON.stringify(f));
            delete g.trackerTimings;
            return JSON.stringify(g);
        };
        for (let k = 0; k < records.length; k++) if (mask(records[k]) !== mask(ext.frames[k])) fatal(`${clip}: frame ${k} differs from replay-clips' arm 1 export`);
        return { frames: records.length };
    }

    /** The reads of one clip x schedule x seed. */
    function read(schedule, seed, off, on, filter, low) {
        const n = off.results.length;
        const counted = countedLoopFrames(off.records, { clipDurationS, ...COUNTED });
        const kOf = new Map(off.records.map((r, k) => [r, k]));
        const countedKs = counted.map((f) => kOf.get(f));
        const rows = new Array(n);
        for (const k of countedKs) {
            const r = off.results[k];
            if (!r.ok) {
                rows[k] = { k, ok: false, state: r.state, media: off.records[k].mediaTimeSeconds };
                continue;
            }
            const cf = closedForm(r.H);
            rows[k] = {
                k,
                ok: true,
                state: r.state,
                media: off.records[k].mediaTimeSeconds,
                inliers: r.numInliers,
                tilt: cf.good ? tiltOf(cf.R) : null,
                chosen: r.poseSelection.chosen,
                guarded: on.results[k].poseGuard.guarded,
                H: off.records[k].corners,
                IPPE: poseCorners(r.poseSelection.pose, K, targetPoints),
                CF: poseCorners(cf, K, targetPoints),
                GUARD: poseCorners(on.results[k].pose, K, targetPoints),
                FILTER: poseCorners(filter.results[k].pose, K, targetPoints),
                LOW: low === null ? null : poseCorners(low.results[k].pose, K, targetPoints),
            };
        }
        const okKs = countedKs.filter((k) => rows[k].ok);
        const common = new Set(okKs.filter((k) => ["H", "IPPE", "CF", "GUARD", "FILTER"].every((a) => rows[k][a] !== null) && rows[k].tilt !== null));
        const noTilt = okKs.filter((k) => rows[k].tilt === null).length;
        const arm = (name) => counted.map((f, j) => ({ mediaTimeSeconds: f.mediaTimeSeconds, k: countedKs[j], corners: rows[countedKs[j]][name] ?? null }));
        const ippeFrames = arm("IPPE");
        const inBand = (test) => (f) => common.has(f.k) && test(rows[f.k]);
        /** G3's columns for one arm's run. */
        const handedBy = (armRun) => {
            const ks = [...common].filter((k) => armRun.results[k].poseGuard.guarded);
            const already = ks.filter((k) => rows[k].chosen === "fallback").length;
            const changed = ks.filter((k) => samePose(armRun.results[k].pose, off.results[k].poseSelection.pose) !== null).length;
            return { handed: ks.length, already, changed };
        };
        const inOrder = countedKs.filter((k) => common.has(k));
        const switches = [];
        for (let j = 1; j < inOrder.length; j++) {
            const p = rows[inOrder[j - 1]];
            const q = rows[inOrder[j]];
            if (p.guarded !== q.guarded) switches.push({ media: q.media, from: p.media, tiltFrom: p.tilt, tiltTo: q.tilt, state: q.state, inliers: q.inliers, jump: cornerDistance(q.CF, q.IPPE), atWrap: q.media < p.media });
        }
        const perBand = {};
        for (const [b] of BANDS) {
            const test = (r) => bandOf(r.tilt) === b;
            const all_ = cornerJitter(ippeFrames, { include: inBand(test), clipDurationS });
            const track = cornerJitter(ippeFrames, { include: inBand((r) => test(r) && r.state === "TRACK"), clipDurationS });
            perBand[b] = { frames: all_.posedFrames, windows: all_.jitterWindows, trackFrames: track.posedFrames, trackWindows: track.jitterWindows };
        }
        const whole = cornerJitter(ippeFrames, { include: inBand(() => true), clipDurationS });
        const wholeTrack = cornerJitter(ippeFrames, { include: inBand((r) => r.state === "TRACK"), clipDurationS });
        const flagged = [...common].filter((k) => farOutside(rows[k].H, width, height) || farOutside(rows[k].CF, width, height));
        // The loops: by the stamp on the continuous timeline, as the repeat's post-run reads them.
        const durMs = clipDurationS * 1000;
        const loopOf = (k) => Math.floor(off.records[k].timestampMs / durMs + 1e-9);
        const byLoop = [1, 2, 3, 4].map((l) => off.records.map((f, k) => k).filter((k) => loopOf(k) === l));
        const sig = byLoop.map((ks) => JSON.stringify(ks.map((k) => [off.records[k].mediaTimeSeconds, off.results[k].state, off.results[k].ok ? Array.from(off.results[k].H) : null])));
        const diff = loopDifference(byLoop.map((ks) => ks.map((k) => ({ media: off.records[k].mediaTimeSeconds, state: off.results[k].state, corners: off.records[k].corners ?? null }))));
        const stateRows = off.results.map((r) => ({ state: r.state }));
        const wraps = [];
        for (let k = 1; k < n; k++) {
            const l = loopOf(k);
            if (l < 2 || l > 4) continue;
            if (off.records[k].mediaTimeSeconds < off.records[k - 1].mediaTimeSeconds) {
                const r = off.results[k];
                wraps.push({ state: r.state, inliers: r.numInliers, trackRun: trackRun(stateRows, k), crossed: r.state === "TRACK" && off.results[k - 1].state === "TRACK" });
            }
        }
        const lowReads = { };
        if (low !== null) {
            lowReads.handed = handedBy(low);
            const lowFrames = arm("LOW");
            for (const [name, test] of [["below", (r) => r.tilt < T_LOW], ["above", (r) => r.tilt >= T_LOW]]) {
                const j = cornerJitter(lowFrames, { include: inBand(test), clipDurationS });
                lowReads[name] = { frames: [...common].filter((k) => test(rows[k])).length, windows: j.jitterWindows, jitterPx: j.jitterPx };
            }
        }
        return {
            schedule: schedule.key,
            seed,
            frames: n,
            counted: counted.length,
            ok: okKs.length,
            noTilt,
            common: common.size,
            commonTrack: [...common].filter((k) => rows[k].state === "TRACK").length,
            commonDetect: [...common].filter((k) => rows[k].state === "DETECT").length,
            windows: whole.jitterWindows,
            trackWindows: wholeTrack.jitterWindows,
            ...handedBy(on),
            switches,
            perBand,
            flagged: flagged.length,
            flaggedList: flagged.map((k) => ({ media: rows[k].media, state: rows[k].state, inliers: rows[k].inliers })),
            distinctLoops: new Set(sig).size,
            loopMaxPx: diff.maxPx,
            loopStateDiffers: diff.stateDiffers,
            wraps,
            bothGuardedAndFallen: on.results.filter((r) => r.ok && r.poseGuard.guarded && r.poseSelection.chosen === "fallback").length,
            guardedOverall: on.results.filter((r) => r.ok && r.poseGuard.guarded).length,
            fallbackOff: off.fallbackFrames,
            fallbackOn: on.fallbackFrames,
            low: low === null ? null : lowReads,
        };
    }

    const [onlySchedule, onlySeed] = ONLY.split(":");
    const results = [];
    const proofs = {};
    const g5 = [];
    for (const schedule of SCHEDULES) {
        if (onlySchedule !== "all" && onlySchedule !== schedule.key) continue;
        for (const seed of SEEDS) {
            if (onlySeed !== "all" && Number(onlySeed) !== seed) continue;
            const label = `${clip}, ${schedule.name}, seed ${seed}`;
            const off = run(schedule, seed, {});
            const on = run(schedule, seed, guardAt(T_ARM));
            checkRule(off, on, T_ARM, label);
            const filter = run(schedule, seed, { poseFilter: { mode: "one-euro" } });
            let low = null;
            if (FIRST_RECORD_CLIPS.includes(clip)) {
                low = run(schedule, seed, guardAt(T_LOW));
                checkRule(off, low, T_LOW, `${label}, T = ${T_LOW}`);
            }
            if (schedule.key === "every" && seed === 1) {
                if (REPLAY_DIR !== null && FIRST_RECORD_CLIPS.includes(clip)) proofs.replay = proveAgainstReplay(off.records);
                if (G5_CLIPS.includes(clip)) g5.push(checkFilter(schedule, seed, off, on));
            }
            results.push(read(schedule, seed, off, on, filter, low));
            lap(label);
        }
    }

    // ---- G3 and G4's cells: fatal, before any figure, on any schedule run at all eight seeds ----
    for (const schedule of SCHEDULES) {
        const runs = results.filter((r) => r.schedule === schedule.key);
        if (runs.length !== SEEDS.length) continue;
        const where = `${clip}, ${schedule.name}`;
        const fire = (b) => {
            if (b !== null) fatal(b);
        };
        const want = G3[clip][schedule.key];
        fire(cellBreach(where, "G3, of", span(runs.map((r) => r.common)), want.of));
        fire(cellBreach(where, "G3, handed to CF", span(runs.map((r) => r.handed)), want.handed));
        fire(cellBreach(where, "G3, IPPE already CF", span(runs.map((r) => r.already)), want.already));
        fire(cellBreach(where, "G3, pose changed", span(runs.map((r) => r.changed)), want.changed));
        fire(cellBreach(where, "G3, switches a run", span(runs.map((r) => r.switches.length)), want.switches));
        if (clip === "pinball-tilt-cross.mp4") {
            const c = CROSS_FOOTAGE[schedule.key];
            for (const r of runs) {
                const foot = r.switches.filter((s) => !s.atWrap);
                const wrap = r.switches.filter((s) => s.atWrap);
                fire(cellBreach(`${where}, seed ${r.seed}`, "G3, switches in the footage", foot.length, 4));
                fire(cellBreach(`${where}, seed ${r.seed}`, "G3, switches at a wrap", wrap.length, 3));
                for (const s of foot) {
                    fire(cellBreach(`${where}, seed ${r.seed}`, "G3, the crossing's media time", fx(s.media), c.media));
                    fire(cellBreach(`${where}, seed ${r.seed}`, "G3, the crossing's jump", fx(s.jump, 2), c.jump));
                    fire(cellBreach(`${where}, seed ${r.seed}`, "G3, the crossing's state", s.state, "TRACK"));
                    if (c.from !== null) {
                        fire(cellBreach(`${where}, seed ${r.seed}`, "G3, the tilt before", fx(s.tiltFrom, 2), c.from));
                        fire(cellBreach(`${where}, seed ${r.seed}`, "G3, the tilt after", fx(s.tiltTo, 2), c.to));
                    }
                }
                for (const s of wrap) fire(cellBreach(`${where}, seed ${r.seed}`, "G3, a wrap's jump", fx(s.jump, 2), "0.00"));
            }
        }
        if (clip === "pinball-tilt-sweep.mp4" && schedule.key === "every") {
            const perSeed = runs.map((r) => r.switches.length).join(",");
            fire(cellBreach(where, "G3, switches per seed", perSeed, "16,0,0,0,0,8,0,0"));
        }
        if (clip === "pinball-tilt-mid.mp4" && schedule.key !== "every") {
            fire(cellBreach(where, "the repeat, switches per seed", runs.map((r) => r.switches.length).join(","), "0,0,0,0,0,0,0,8"));
        }
        if (FIRST_RECORD_CLIPS.includes(clip)) {
            const h = G4_HANDED[clip][schedule.key];
            fire(cellBreach(where, "G4, T = 7, handed to CF", span(runs.map((r) => r.low.handed.handed)), h[0]));
            fire(cellBreach(where, "G4, T = 7, IPPE already CF", span(runs.map((r) => r.low.handed.already)), h[1]));
            fire(cellBreach(where, "G4, T = 7, pose changed", span(runs.map((r) => r.low.handed.changed)), h[2]));
            const sens = G4_SENSITIVITY[clip]?.[schedule.key] ?? {};
            for (const [name, cells] of Object.entries(sens)) {
                fire(cellBreach(where, `G4, T = 7, ${name}, frames`, span(runs.map((r) => r.low[name].frames)), cells[0]));
                fire(cellBreach(where, `G4, T = 7, ${name}, windows`, span(runs.map((r) => r.low[name].windows)), cells[1]));
                fire(cellBreach(where, `G4, T = 7, ${name}, GUARD at 7`, span(runs.map((r) => r.low[name].jitterPx), 3), cells[2]));
            }
        }
    }
    writeFileSync(join(OUT_DIR, `${stem}.result.json`), JSON.stringify({ clip, width, height, nFrames: pts.length, clipDurationS, f: K[0], results, proofs, g5 }));
    lap(`${clip}: done`);
}

// =============================================================================================
// The report. Every figure the addendum reads is here.
// =============================================================================================
function report(R) {
    say(`# ${SCRIPT}`);
    say(`this script's source, SHA-256: ${sha256(readFileSync(SELF))}`);
    say(`node ${process.version}`);
    say("the tree was clean, with the same head and git diff at the run's start and its end (fatal otherwise; both on stderr)");
    say();
    say("## Inputs");
    for (const [rel, want] of INPUTS) say(`${rel}  ${want}`);
    for (const rel of PRINTED) say(`${rel}  ${sha256(readFileSync(join(ROOT, rel)))}`);
    for (const [rel, keep] of TREES) {
        const d = treeDigest(rel, keep);
        say(`tree ${rel}: ${d.count} files, digest ${d.digest}`);
    }
    say();
    say("## Check D: the copied decoding and OFF's frames against replay-clips' --external arm 1 export, seed 1, at every frame, trackerTimings apart (fatal)");
    for (const clip of FIRST_RECORD_CLIPS) say(`${clip}: ${R[clip].proofs.replay?.frames} frames equal`);
    say();
    say("## G1, G2: every frame of every run, all three schedules, seeds 1 to 8, at T = 10 and on the first record's clips at T = 7 (fatal on one element or one field)");
    say("| clip | schedule | frames a run | guarded a run, all 6 loops | both guarded and fallen back, a run | fallbackFrames off | fallbackFrames on |");
    say("|---|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].results.filter((r) => r.schedule === s.key);
            say(`| ${clip} | ${s.key}${isBorrowed(clip, s) ? " (borrowed)" : ""} | ${span(runs.map((r) => r.frames))} | ${span(runs.map((r) => r.guardedOverall))} | ${span(runs.map((r) => r.bothGuardedAndFallen))} | ${span(runs.map((r) => r.fallbackOff))} | ${span(runs.map((r) => r.fallbackOn))} |`);
        }
    }
    say();
    say("## G3: through the option, counted loops 1 to 4 of 6, min / median / max over the seeds; each cell equal to the registered one as printed (fatal)");
    say("| clip | schedule | handed to CF | of | IPPE already CF | pose changed | switches a run | in the footage | at a wrap |");
    say("|---|---|---|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].results.filter((r) => r.schedule === s.key);
            say(`| ${clip} | ${s.key}${isBorrowed(clip, s) ? " (borrowed)" : ""} | ${span(runs.map((r) => r.handed))} | ${span(runs.map((r) => r.common))} | ${span(runs.map((r) => r.already))} | ${span(runs.map((r) => r.changed))} | ${span(runs.map((r) => r.switches.length))} | ${span(runs.map((r) => r.switches.filter((x) => !x.atWrap).length))} | ${span(runs.map((r) => r.switches.filter((x) => x.atWrap).length))} |`);
        }
    }
    say();
    say("## G4, T = 7, through the option: handed / already / changed, and the first record's sensitivity rows (fatal)");
    for (const clip of FIRST_RECORD_CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].results.filter((r) => r.schedule === s.key);
            say(`${clip}, ${s.key}: ${span(runs.map((r) => r.low.handed.handed))} | ${span(runs.map((r) => r.low.handed.already))} | ${span(runs.map((r) => r.low.handed.changed))}`);
            for (const name of Object.keys(G4_SENSITIVITY[clip]?.[s.key] ?? {})) say(`  ${name === "below" ? "below 7" : "7 and above"}: frames ${span(runs.map((r) => r.low[name].frames))}; windows ${span(runs.map((r) => r.low[name].windows))}; GUARD at 7 ${span(runs.map((r) => r.low[name].jitterPx), 3)}`);
        }
    }
    say();
    say("## G5: both options, the filter module fed the guard's output, frame by frame, every frame, seed 1 (fatal)");
    for (const clip of G5_CLIPS) say(`${clip}: ${R[clip].g5[0].posed} posed frames, ${R[clip].g5[0].filtered} of them filtered`);
    say();
    say("# Stage 2's covariates, per clip. The control arm: the guard and the filter off. Each is a read, and nothing here judges the guard");
    say("The assumed K: intrinsics(w, h), 60° of horizontal field, the same for every arm; no calibration. What lower means is not per frame: on moving footage the metric reads attenuated motion as lower jitter, and this document reads no jitter of the guard's.");
    for (const clip of CLIPS) {
        const c = R[clip];
        say();
        say(`## ${clip}, ${c.width} x ${c.height}, ${c.nFrames} frames, loop ${fx(c.clipDurationS)} s, f ${fx(c.f, 2)} px`);
        for (const s of SCHEDULES) {
            const runs = c.results.filter((r) => r.schedule === s.key);
            const b = isBorrowed(clip, s) ? ", acquisition BORROWED from the static clip, 36.9 ms, not measured" : "";
            say();
            say(`### ${clip}, ${s.name}${b}`);
            say(`state: the common set ${span(runs.map((r) => r.common))} frames, ${span(runs.map((r) => r.windows))} windows; its TRACK frames ${span(runs.map((r) => r.commonTrack))}, ${span(runs.map((r) => r.trackWindows))} windows; its DETECT frames ${span(runs.map((r) => r.commonDetect))}; ok frames with no tilt ${span(runs.map((r) => r.noTilt))}`);
            say("| tilt band, deg | frames | windows | TRACK frames | TRACK windows |");
            say("|---|---|---|---|---|");
            for (const [band] of BANDS) {
                const g = (k) => span(runs.map((r) => r.perBand[band][k]));
                say(`| ${band} | ${g("frames")} | ${g("windows")} | ${g("trackFrames")} | ${g("trackWindows")} |`);
            }
            const jumps = runs.flatMap((r) => r.switches.map((x) => x.jump));
            say(`switches per seed, in the footage: ${runs.map((r) => r.switches.filter((x) => !x.atWrap).length).join(", ")}; at a wrap: ${runs.map((r) => r.switches.filter((x) => x.atWrap).length).join(", ")}; the corner distance at a switch, all seeds together, a labelled summary: ${jumps.length ? span(jumps, 2) : "none"} px`);
            for (const r of runs) {
                const seen = new Map();
                for (const x of r.switches) {
                    const key = `${fx(x.media)}|${x.atWrap}`;
                    seen.set(key, { ...x, n: (seen.get(key)?.n ?? 0) + 1 });
                }
                if (seen.size > 0) say(`  seed ${r.seed}: ${[...seen.values()].map((x) => `${fx(x.media)} s${x.atWrap ? " (wrap)" : ""} x${x.n}, ${x.state} on ${x.inliers}, ${fx(x.tiltFrom, 2)} to ${fx(x.tiltTo, 2)}, ${fx(x.jump, 2)} px`).join("; ")}`);
            }
            const low = runs.flatMap((r) => r.switches.filter((x) => x.state === "TRACK" && x.inliers <= 9).map((x) => `seed ${r.seed}, ${fx(x.media)} s, ${x.inliers} inliers`));
            say(`single TRACK switches on 8 or 9 inliers: ${[...new Set(low)].join("; ") || "none"}`);
            say(`wrong-pose label, flagged frames per seed: ${runs.map((r) => r.flagged).join(", ")}`);
            for (const r of runs) {
                const seen = new Map();
                for (const f of r.flaggedList) seen.set(fx(f.media), { ...f, n: (seen.get(fx(f.media))?.n ?? 0) + 1 });
                if (seen.size > 0) say(`  seed ${r.seed}: ${[...seen.values()].map((f) => `${fx(f.media)} s x${f.n}, ${f.state} on ${f.inliers}`).join("; ")}`);
            }
            say(`the loops: distinct among the 4 counted, bit for bit, per seed: ${runs.map((r) => r.distinctLoops).join(", ")}; largest corner difference under H across them, px, per seed: ${runs.map((r) => r.loopMaxPx.toExponential(1)).join(", ")}; media times differing in state or in some loops only, per seed: ${runs.map((r) => r.loopStateDiffers).join(", ")}`);
            for (const r of runs) {
                const firsts = [...new Set(r.wraps.map((w) => `${w.state} on ${w.inliers}${w.crossed ? ", a lock crossing" : ""}, TRACK run ${w.trackRun}`))];
                say(`  seed ${r.seed}, the first frame after each wrap: ${firsts.join("; ") || "none"}`);
            }
        }
    }
}

// =============================================================================================
// --negatives: each registered "must fail on", a mutant of src/ or a --break, seen failing.
// Restored in `finally`, the build with it, and the tree compared at the end. Never run this
// beside a counted run in this worktree.
// =============================================================================================
function negatives(dir) {
    const TRACKER = "packages/nft-tracker/src/tracker.ts";
    const GUARD = "packages/nft-tracker/src/pose/pose_guard.ts";
    const OFF_RETURN = "if (thresholdDeg === null) return { pose: selection.pose };";
    const COUNT = 'if (reading.guarded && selection.chosen !== "fallback") this.fallbacks++;';
    const READ = "return { pose, poseGuard: reading };";
    const CF_LINE = "const closedForm = closedFormPose(H, K);";
    const TILT_LINE = "const tiltDeg = tiltDegOf(closedForm.R);";
    const TEST = ["vitest", ["test/tracker_pose_guard.test.ts", "test/pose/pose_guard.test.ts"]];
    const child1 = (clip, only = "every:1") => ["child", clip, only];
    const LIST = [
        ["G0", "a key poseGuard: null on every result, which must change R-truth", [[TRACKER, OFF_RETURN, "if (thresholdDeg === null) return { pose: selection.pose, poseGuard: null as never };"]], ["truth"], /sha256 (?!d1d427f33ce819ab5760377dcb3999ba979b09ab402a51a830895e27203c4f8f)/],
        ["G0", "the same key, against the new test", [[TRACKER, OFF_RETURN, "if (thresholdDeg === null) return { pose: selection.pose, poseGuard: null as never };"]], TEST, /is the option absent/],
        ["G0", "{ mode: 'off' } differing from the option absent", [[TRACKER, 'poseGuardThresholdDeg: poseGuardThreshold(o.poseGuard ?? DEFAULT_POSE_GUARD),', "poseGuardThresholdDeg: o.poseGuard === undefined ? null : (poseGuardThreshold(o.poseGuard) ?? 180),"]], TEST, /is the option absent/],
        ["G1", "one element of the result's H moved by 1e-9", [[TRACKER, READ, "return { pose, poseGuard: reading, H: Float64Array.from(H, (v, i) => (i === 4 ? v + 1e-9 : v)) } as never;"]], child1("pinball-bench.mp4"), /G1: another field: \$\.H\[4\]/],
        ["G1", "one element of H moved by 1e-9 in the guard's input", [[GUARD, CF_LINE, "const closedForm = closedFormPose(Float64Array.from(H, (v, i) => (i === 4 ? v + 1e-9 : v)), K);"]], child1("pinball-bench.mp4"), /G1: the reading/],
        ["G1", "the tilt read from IPPE's pose", [[GUARD, TILT_LINE, "const tiltDeg = tiltDegOf(selected.R);"]], child1("pinball-bench.mp4"), /G1: the reading/],
        ["G1", "the previous frame's tilt", [[GUARD, TILT_LINE, "const tiltDeg = previousTilt; previousTilt = tiltDegOf(closedForm.R);"], [GUARD, "/** `acos(clamp(R[8], −1, 1))`, degrees. */", "let previousTilt = 0;\n/** `acos(clamp(R[8], −1, 1))`, degrees. */"]], child1("pinball-bench.mp4"), /G1: the reading/],
        ["G1", "poseSelection carrying the guarded pose", [[TRACKER, "...this.guarded(r.H, selection),\n            poseSelection: selection,", "...this.guarded(r.H, selection),\n            poseSelection: { ...selection, pose: guardPose(r.H, this.K, selection.pose, this.poseGuardThresholdDeg ?? 0).pose },"]], child1("pinball-static.mp4"), /G1: another field: \$\.poseSelection/],
        ["G1", "a frame guarded at the threshold's other side: the closed form at and above T", [[GUARD, "const guarded = tiltDeg < thresholdDeg;", "const guarded = tiltDeg >= thresholdDeg;"]], child1("pinball-bench.mp4"), /G1: the reading/],
        ["G2", "a frame both guarded and fallen back counted twice", [[TRACKER, COUNT, "if (reading.guarded) this.fallbacks++;"]], child1("pinball-bench-table.mp4"), /G2: fallbackFrames/],
        ["G2", "a guarded frame not counted", [[TRACKER, COUNT, ""]], child1("pinball-bench.mp4"), /G2: fallbackFrames/],
        ["G3", "T 9.36 in place of 10, as the registration writes it", [], ["break", "T-9.36", "pinball-bench.mp4", "every:all"], /G3, handed to CF reads 176 \/ 176 \/ 180, registered 216 \/ 216 \/ 220/],
        ["G3", "T 9.357142857142858 in place of 10, the value the registration's 172 was read at", [], ["break", "T-half", "pinball-bench.mp4", "every:all"], /G3, handed to CF reads 172 \/ 172 \/ 176, registered 216 \/ 216 \/ 220/],
        ["G4", "T = 8 in place of 7, against the first record's rows", [], ["break", "low-8", "pinball-bench-table.mp4", "every:all"], /G4, T = 7, handed to CF reads/],
        ["G4", "a threshold hard-coded at 10", [[TRACKER, "guardPose(H, this.K, selection.pose, thresholdDeg)", "guardPose(H, this.K, selection.pose, 10)"]], TEST, /the threshold is a parameter/],
        ["G4", "<= for <", [[GUARD, "const guarded = tiltDeg < thresholdDeg;", "const guarded = tiltDeg <= thresholdDeg;"]], TEST, /at exactly/],
        ["G4", "good: false not keeping the selection", [[GUARD, "if (!closedForm.good) return { pose: selected, reading: { tiltDeg: null, guarded: false } };", ""]], TEST, /has no tilt/],
        ["G4", "the refusal of a threshold with the guard off removed", [[TRACKER, "if (p.thresholdDeg !== undefined) {", "if (false) {"]], TEST, /refuses a threshold given with the guard off/],
        ["G4", "the refusal of a threshold below 0 removed", [[TRACKER, 'typeof t === "number" && t >= 0 && t <= 180', 'typeof t === "number" && t <= 180']], TEST, /outside \[0, 180\]/],
        ["G4", "the refusal of a threshold above 180 removed", [[TRACKER, 'typeof t === "number" && t >= 0 && t <= 180', 'typeof t === "number" && t >= 0']], TEST, /outside \[0, 180\]/],
        ["G4", "the refusal of a threshold that is not a number removed", [[TRACKER, 'typeof t === "number" && t >= 0 && t <= 180', "(t as number) >= 0 && (t as number) <= 180"]], TEST, /outside \[0, 180\]/],
        ["G4", "the refusal of an unknown mode removed", [[TRACKER, 'if (p.mode === "closed-form-below") {', 'if (p.mode !== "off") {']], TEST, /refuses an unknown mode/],
        ["G4", "the refusal of an unknown key removed", [[TRACKER, 'knownKeys("poseGuard", p, ["mode", "thresholdDeg"]);', ""]], TEST, /refuses a key the option does not read/],
        ["G5", "the filter reading poseSelection.pose in place of pose", [[TRACKER, "const pose = f.apply(r);", "const pose = f.apply(r.ok ? { ...r, pose: r.poseSelection.pose } : r);"]], child1("pinball-static.mp4"), /G5: the pose is not the filter on the guard's output/],
    ];
    const start = treeState();
    process.stderr.write(`tree at the start: ${JSON.stringify(start)}\n`);
    if (start.status !== "") fatal(`--negatives runs from a clean tree, and this one is not:\n${start.status}`);
    const distBefore = treeDigest("packages/nft-tracker/dist", (p) => p.endsWith(".js")).digest;
    mkdirSync(dir, { recursive: true });
    const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, shell: process.platform === "win32" });
    const build = () => {
        const b = sh("npm", ["run", "build", "-w", "@webarkit/nft-tracker"]);
        if (b.status !== 0) throw new Error(`the build failed:\n${b.stdout}\n${b.stderr}`);
    };
    say(`# ${SCRIPT} --negatives`);
    say(`this script's source, SHA-256: ${sha256(readFileSync(SELF))}`);
    say("| criterion | the mutant | how it was read | failed as it must |");
    say("|---|---|---|---|");
    let survivors = 0;
    for (const [g, name, edits, how, expected] of LIST) {
        const originals = new Map();
        let verdict;
        let reading = "";
        try {
            for (const [file, from, to] of edits) {
                const p = join(ROOT, file);
                if (!originals.has(p)) originals.set(p, readFileSync(p, "utf8"));
                const text = readFileSync(p, "utf8");
                if (text.split(from).length !== 2) throw new Error(`${file}: the mutant's text is not there exactly once: ${from}`);
                writeFileSync(p, text.replace(from, () => to));
            }
            let r;
            if (how[0] === "vitest") {
                reading = "the package's tests";
                r = sh("npx", ["vitest", "run", "--root", "packages/nft-tracker", ...how[1], "--testTimeout=15000"]);
            } else if (how[0] === "truth") {
                reading = "R-truth";
                r = spawnSync(process.execPath, ["--experimental-transform-types", join(ROOT, "docs/benchmarks/2026-11-06-228-133-stage3-references.mjs"), "--ground-truth", join(dir, "truth.json")], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
            } else {
                const [clip, only, brk] = how[0] === "child" ? [how[1], how[2], null] : [how[2], how[3], how[1]];
                reading = `the check, ${clip}, ${only}${brk ? `, --break ${brk}` : ""}`;
                if (edits.length > 0) build();
                r = spawnSync(process.execPath, [SELF, "--negative", "--out", dir, "--clip", clip, "--only", only, ...(brk ? ["--break", brk] : [])], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
            }
            const text = `${r.stdout}\n${r.stderr}`;
            if (how[0] === "truth") {
                const m = text.match(/ground truth: \d+ bytes, sha256 [0-9a-f]+/);
                verdict = r.status === 0 && m !== null && expected.test(text) ? m[0] : null;
            } else {
                const hit = text.split("\n").find((l) => expected.test(l));
                // A check that fires must also stop the figures: a child exits before the report, and a test run exits 1.
                verdict = r.status === 1 && hit !== undefined && r.stdout.indexOf("# Stage 2") < 0 ? hit.replace(/^.*fatal: /, "").replace(/\u001b\[[0-9;]*m/g, "").trim().replace(/\|/g, "/").slice(0, 170) : null;
            }
        } finally {
            for (const [p, text] of originals) writeFileSync(p, text);
            if (edits.length > 0 && (how[0] === "child" || how[0] === "break")) build();
        }
        if (verdict === null) survivors++;
        say(`| ${g} | ${name} | ${reading} | ${verdict ?? "SURVIVED"} |`);
        lap(`${g}: ${name}: ${verdict ?? "SURVIVED"}`);
    }
    const end = treeState();
    process.stderr.write(`tree at the end: ${JSON.stringify(end)}\n`);
    rmSync(join(dir, "truth.json"), { force: true });
    if (firstDifference(start, end) !== null) fatal(`the tree is not as it was: ${JSON.stringify(start)} and ${JSON.stringify(end)}`);
    if (treeDigest("packages/nft-tracker/dist", (p) => p.endsWith(".js")).digest !== distBefore) fatal("the build is not as it was");
    if (survivors > 0) {
        process.stdout.write(out.join("\n") + "\n");
        fatal(`${survivors} mutants survived`);
    }
    say(`every mutant failed as it must, ${LIST.length} of them; the tree and the build are as they were`);
}
