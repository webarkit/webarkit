/*
 *  2026-11-06-228-stage1-repeat.mjs
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
 * #228's Stage 1 repeated on the three tilt clips: IPPE against the closed form above 10°, the
 * guard on one crossing, the print's planarity, and the assumed K against the guard's threshold.
 * The computation behind docs/benchmarks/2026-11-06-228-stage1-repeat.md. A desktop replay,
 * headless: not campaign data. It measures and registers nothing, and no file under
 * packages/<name>/src/ is changed.
 *
 * It is a copy of 2026-11-04-228-stage1-probe.mjs, not an import: that script runs at its top
 * level and exports nothing. Check R proves the copy: --profile original runs the first probe's
 * clips, seeds, schedules and loops, and --check-r compares every per-run table with the first
 * script's, byte for byte. The first script is a dated record and is not edited.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat.mjs --self-test
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat.mjs --out <run dir>
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat.mjs --post-run <run dir>
 *
 * Check R:
 *
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --seed-policy frame --packages bundle --out <replay dir>/ext
 *     node scripts/replay-clips.mjs --seed 1 --seed-policy frame --packages bundle --out <replay dir>/def
 *     node docs/benchmarks/2026-11-04-228-stage1-probe.mjs --replay <replay dir> --out <first dir>      > <first dir>/stdout.txt
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat.mjs --profile original --replay <replay dir> --out <copy dir>  > <copy dir>/stdout.txt
 *     node docs/benchmarks/2026-11-06-228-stage1-repeat.mjs --check-r <first dir> <copy dir>
 *
 * What the tilt profile adds to the method below: the three tilt clips, whose device acquisition
 * constant is borrowed from pinball-static.mp4 (36.9 ms), since they have its size and orientation
 * and no measured one; the bands 15-20, 20-30, 30-40 and over 40; check D's replay exports and
 * #227's pins do not apply, since scripts/replay-clips.mjs does not read these clips.
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The frame loop is scripts/replay-run.mjs's `replayRun`, its `loopPeriod`, and
 *    scripts/replay-seeding.mjs's `runSeeding` and `countGlobalRandomReads`, imported. The
 *    decoding (`probe`, `greyFrames`, `loadClip`) and `DEVICE_ACQUIRE_MS`, `DEVICE_DETECT_MS`
 *    live in scripts/replay-clips.mjs, a top-level script that cannot be imported, so they are
 *    copied, and proved frame by frame against that script's exports at --seed 1 (check D).
 * 2. Per clip × schedule × seed, 6 loops, loops 1 to 4 counted (`countedLoopFrames`), stamped on
 *    the loops' continuous timeline (`unwrapped: true`, --external arm 1's convention and the
 *    page's continuous clock; under `pts * 1000` the filter would reset at every wrap, and the
 *    unfiltered tracker only echoes the stamp). Two trackers: one at its defaults, one with
 *    `poseFilter: { mode: "one-euro" }`, whose omitted parameters take the registered values.
 * 3. The arms, on one run's frames: IPPE `result.poseSelection.pose`; CF `closedFormPose(H, K)`;
 *    GUARD CF where the frame's tilt is below T, IPPE at or above it; FILTER the second tracker's
 *    `result.pose`. Check Q0 holds H, state, ok, inliers and the selected pose identical across
 *    the two trackers, per frame.
 * 4. The metric: corners = reprojectCorners(K·[r1 r2 t], targetCorners), null when `good` is
 *    false or any corner's depth is not positive, into the frozen `cornerJitter`, imported. The
 *    frozen reading under H stands beside it.
 * 5. The tilt: acos(R[8]) of CF's pose on the frame's own H, the control arm's. The bands are
 *    read from it for every arm. T derives from the characterisation's table (`rules`).
 * 6. The common set: counted frames on which H and every arm have corners. Every comparison reads
 *    it, whole and per band. `compareExports` is a cross-check on each pair.
 * 7. The wrong-pose rule, stated before any figure, read on the control arm: a frame is flagged
 *    when a corner under H, or under CF's pose, lies more than one frame diagonal outside the
 *    frame. A pose with a non-positive depth has no corners and has already left the common set
 *    (the corners are grid points, so `inFront` false is the same frames); those are counted as
 *    dropped. A second reading flags on any arm's corners: labelled, since it selects on the
 *    treatment.
 * 8. Beside the metric, labelled as not the metric: the median corner distance between two arms
 *    on the same frames. `cornerJitter` fits a line within each window, so a constant offset is
 *    invisible to it; the distance is what can say a treatment moved the pose where it did not.
 *
 * Timings go to stderr; stdout is byte-identical between runs. Per-frame rows go to --out, not
 * committed (AGENTS.md, "Test assets"); stdout prints their SHA-256. Every check is fatal, before
 * any figure is printed.
 *
 * A known limitation, as every derivation script's here: no test covers docs/, so this script
 * could break later while its figures stay in the record. Its guards are its checks.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-06-228-stage1-repeat.mjs";
const out = [];
const say = (line = "") => out.push(line);
function fatal(reason) {
    process.stderr.write(`${SCRIPT}: fatal: ${reason}\n`);
    process.exit(1);
}
const t0 = performance.now();
const lap = (what) => process.stderr.write(`${what}: ${(performance.now() - t0).toFixed(0)} ms\n`);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.WEBARKIT_ROOT ? resolve(process.env.WEBARKIT_ROOT) : resolve(HERE, "..", "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const argv = process.argv.slice(2);
function arg(name) {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fatal(`${name} needs a value`);
    return v;
}
/** A deliberate defect, for exercising a check the wrong way (the record's checks section). */
const BREAK = arg("--break");
/** "tilt", the counted run; "original", the first probe's inputs, for check R. */
const PROFILE = arg("--profile") ?? "tilt";
if (PROFILE !== "tilt" && PROFILE !== "original") fatal(`--profile ${PROFILE}: not tilt or original`);
const TILT = PROFILE === "tilt";

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const backendPkg = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
const trackerPkg = await imp("packages/nft-tracker/dist/index.js");
const metrics = await imp("examples/js/bench-metrics.mjs");
const { fitSize } = await imp("examples/js/pinball-shared.mjs");
const replayRunMod = await imp("scripts/replay-run.mjs");
const replaySeeding = await imp("scripts/replay-seeding.mjs");
const { createJsfeatNextBackend, intrinsics } = backendPkg;
const { NftTracker, decode, closedFormPose, targetGrid, inFront } = trackerPkg;
const { frameRecord, targetCorners, reprojectCorners, cornerJitter, compareExports, countedLoopFrames, PAGE_PROCESSING_BOX, METRICS_VERSION, percentile } = metrics;
const { replayRun, loopPeriod } = replayRunMod;
const { runSeeding, seedingRefusal, countGlobalRandomReads } = replaySeeding;
const { trackFrame, trackTarget } = await imp("packages/nft-tracker/dist/tracking/track_frame.js");

// =============================================================================================
// The definitions: pure functions, each tested on constructed cases (--self-test).
// =============================================================================================

/** K · [r1 r2 t], row-major: the homography the pose claims. */
function poseHomography(pose, K0) {
    const K = BREAK === "K-wrong" ? [K0[0] * 1.01, K0[1], K0[2], K0[3], K0[4], K0[5], K0[6], K0[7], K0[8]] : K0;
    const R = pose.R;
    const t = pose.t;
    const r = BREAK === "R-transpose" ? [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]] : R;
    const M = [r[0], r[1], t[0], r[3], r[4], t[1], r[6], r[7], t[2]];
    const H = new Float64Array(9);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            H[i * 3 + j] = K[i * 3] * M[j] + K[i * 3 + 1] * M[3 + j] + K[i * 3 + 2] * M[6 + j];
        }
    }
    return H;
}
/**
 * The metric's corners for a pose. The frozen `reprojectCorners` accepts all-negative `w`, which
 * for a homography is the same homography and for a pose is a target behind the camera, so the
 * depth is read here first: not positive at any corner, no corners.
 */
function poseCorners(pose, K, points) {
    if (!pose.good) return null;
    if (BREAK !== "z-guard-off") {
        for (const [x, y] of points) {
            if (!(pose.R[6] * x + pose.R[7] * y + pose.t[2] > 0)) return null;
        }
    }
    return reprojectCorners(poseHomography(pose, K), points);
}
/** The angle, degrees, between the plane's normal and the optical axis: `tiltOf` in jitter-dry-run.mjs, line 189. */
const tiltOf = (R) => {
    if (BREAK === "tilt-asin") return (Math.asin(Math.min(1, Math.max(-1, R[8]))) * 180) / Math.PI;
    return (Math.acos(Math.min(1, Math.max(-1, R[8]))) * 180) / Math.PI;
};
/** The guard: the closed form below `T`, IPPE at it and above it. A frame with no tilt keeps IPPE. */
function guardPick(tilt, T) {
    if (tilt === null) return "ippe";
    if (BREAK === "guard-flip") return tilt < T ? "ippe" : "cf";
    if (BREAK === "guard-boundary") return tilt <= T ? "cf" : "ippe";
    return tilt < T ? "cf" : "ippe";
}
const BANDS = [
    ["0-1", 0, 1],
    ["1-3", 1, 3],
    ["3-5", 3, 5],
    ["5-7", 5, 7],
    ["7-10", 7, 10],
    ["10-15", 10, 15],
    ...(TILT
        ? [
              ["15-20", 15, 20],
              ["20-30", 20, 30],
              ["30-40", 30, 40],
              ["over 40", 40, Infinity],
          ]
        : [["over 15", 15, Infinity]]),
];
function bandOf(tilt) {
    const v = BREAK === "band-shift" ? tilt + 1 : tilt;
    for (const [name, lo, hi] of BANDS) if (v >= lo && v < hi) return name;
    return null;
}
/** A corner's distance outside the frame `[0, w − 1] × [0, h − 1]`, px; 0 inside it. */
const outside = ([x, y], w, h) => Math.hypot(Math.max(0, -x, x - (w - 1)), Math.max(0, -y, y - (h - 1)));
/** The wrong-pose rule's test: any corner more than one frame diagonal outside the frame. */
function farOutside(corners, w, h) {
    if (BREAK === "wrong-flip") return !corners.some((c) => outside(c, w, h) > Math.hypot(w, h));
    return corners.some((c) => outside(c, w, h) > Math.hypot(w, h));
}
/** Each correspondence's transfer error under H, frame px: |π(H · src) − dst|. Question D. */
function inlierResiduals(H, src, dst) {
    const n = src.length / 2;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const x = src[2 * i];
        const y = src[2 * i + 1];
        const w = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / w;
        const v = (H[3] * x + H[4] * y + H[5]) / w;
        out[i] = BREAK === "residual-off" ? Math.abs(u - dst[2 * i]) : Math.hypot(u - dst[2 * i], v - dst[2 * i + 1]);
    }
    return out;
}
const medianOf = (xs) => {
    const v = [...xs].sort((a, b) => a - b);
    const n = v.length;
    return n === 0 ? null : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};
const rmsOf = (xs) => (xs.length === 0 ? null : Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length));
/** min, p10, p50, p90, max of a list, by the frozen percentile. */
function fivePoint(xs) {
    if (xs.length === 0) return null;
    const v = [...xs].sort((a, b) => a - b);
    return { min: v[0], p10: percentile(v, 10), p50: percentile(v, 50), p90: percentile(v, 90), max: v[v.length - 1] };
}
/** The media-time bin of question A's table, 0.5 s wide: lower edge in. */
const halfSecondBin = (media) => Math.floor((BREAK === "bin-off" ? media + 0.5 : media) / 0.5 + 1e-9);
/** Question E: K with the focal length `f720`, stated at 720 px of width, scaled to the render's width. */
function renderK(Kassumed, width, f720) {
    const f = BREAK === "e-scale" ? f720 : (f720 * width) / 720;
    return Float64Array.from([f, 0, Kassumed[2], 0, f, Kassumed[5], 0, 0, 1]);
}
/**
 * Question E's two readings of one f_true's rows, in the guard's tilt: the first grid row where
 * each rule holds, and the read tilts of that row and the one before it. `stays` says whether the
 * rule still holds on every later row, since a mismatch need not leave the rows monotonic.
 */
function crossover(rows) {
    const read = (test) => {
        const i = rows.findIndex(test);
        if (i < 0) return { row: null, trueTilt: null, read: null, readBefore: null, stays: null };
        return { row: i, trueTilt: rows[i].tilt, read: rows[i].readTilt, readBefore: i === 0 ? null : rows[i - 1].readTilt, stays: rows.slice(i).every(test) };
    };
    return { medians: read((r) => r.ippe <= r.cf), half: read((r) => r.closer >= r.n / 2) };
}
/** The angle between two rotations, degrees: question E's second reading, against the rendered pose. */
function rotationAngle(A, B) {
    let tr = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tr += A[i * 3 + j] * B[i * 3 + j];
    return (Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2))) * 180) / Math.PI;
}
/** What check R compares: same file set, every table's bytes, stdout's lines but the script's name and hash. */
function compareRuns(listA, readA, listB, readB) {
    const tables = (l) => l.filter((f) => f.endsWith(".jsonl") || f.endsWith(".result.json")).sort();
    const a = tables(listA);
    const b = tables(listB);
    const fails = [];
    if (a.length === 0) fails.push("no per-run table in the first directory");
    if (a.join("|") !== b.join("|")) fails.push(`the file sets differ: ${a.length} and ${b.length}`);
    let same = 0;
    for (const f of a) {
        if (!b.includes(f)) continue;
        if (BREAK !== "check-r-blind" && sha256(readA(f)) !== sha256(readB(f))) fails.push(`${f} differs`);
        else same++;
    }
    const allowed = (line) => /^# 2026-11-0[46]-228-stage1-[a-z]+\.mjs/.test(line) || line.startsWith("this script's source, SHA-256: ");
    let lines = 0;
    let excepted = 0;
    for (const f of ["stdout.txt", "postrun.txt"]) {
        if (!listA.includes(f) && !listB.includes(f)) continue;
        if (!listA.includes(f) || !listB.includes(f)) {
            fails.push(`${f} is in one directory only`);
            continue;
        }
        const x = readA(f).toString().split("\n");
        const y = readB(f).toString().split("\n");
        if (x.length !== y.length) fails.push(`${f}: ${x.length} and ${y.length} lines`);
        for (let i = 0; i < Math.min(x.length, y.length); i++) {
            lines++;
            if (x[i] === y[i]) continue;
            if (allowed(x[i]) && allowed(y[i])) excepted++;
            else if (BREAK !== "check-r-blind") fails.push(`${f}, line ${i + 1} differs`);
        }
    }
    return { fails, tables: a.length, same, lines, excepted, listHash: sha256(a.map((f) => `${f} ${sha256(readA(f))}`).join("\n")) };
}
/** The mean of the four corners' distances between two readings of one frame, px. */
const cornerDistance = (a, b) => a.reduce((s, p, j) => s + Math.hypot(p[0] - b[j][0], p[1] - b[j][1]), 0) / 4;
/** What must agree across the arms that run a tracker, per frame: null, or what differs. */
function identityBreach(a, b) {
    if (BREAK === "identity-blind") return null;
    for (const key of ["ok", "state", "reason", "numInliers", "numMatches", "trackLoss", "media"]) {
        if (a[key] !== b[key]) return `${key}: ${a[key]} and ${b[key]}`;
    }
    if (a.ok) {
        for (let i = 0; i < 9; i++) if (a.H[i] !== b.H[i]) return `H[${i}]: ${a.H[i]} and ${b.H[i]}`;
        for (let i = 0; i < 9; i++) if (a.sel.R[i] !== b.sel.R[i]) return `the selected R[${i}]`;
        for (let i = 0; i < 3; i++) if (a.sel.t[i] !== b.sel.t[i]) return `the selected t[${i}]`;
        if (a.outcome !== b.outcome || a.chosen !== b.chosen) return "the selection's outcome";
    }
    return null;
}
/**
 * The characterisation's table: its section "Item 2, extended to the campaign's tilt range"
 * (2026-10-15-m4-step3-ippe-c4-characterisation.md). Each row is checked present in that file.
 */
const TABLE = [
    [0, 12, 7, 0.368, 0.115, 3.21, 0],
    [1, 48, 26, 0.353, 0.114, 3.09, 1],
    [2, 48, 25, 0.366, 0.112, 3.26, 1],
    [3, 48, 21, 0.315, 0.115, 2.74, 1],
    [4, 48, 18, 0.284, 0.116, 2.45, 5],
    [5, 48, 18, 0.228, 0.111, 2.06, 12],
    [7, 48, 8, 0.178, 0.11, 1.62, 13],
    [10, 48, 0, 0.101, 0.118, 0.86, 27],
    [15, 48, 0, 0.049, 0.114, 0.43, 43],
    [20, 48, 0, 0.046, 0.126, 0.36, 48],
    [30, 48, 0, 0.063, 0.193, 0.33, 48],
    [40, 48, 0, 0.087, 0.278, 0.31, 46],
    [50, 48, 0, 0.14, 0.374, 0.37, 48],
].map(([tilt, n, over, ippe, cf, ratio, closer]) => ({ tilt, n, over, ippe, cf, ratio, closer }));
const linear = (x0, y0, x1, y1, y) => x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
/**
 * The two rules. Each threshold is the rule's first grid tilt, a measured row. The interpolations
 * are linear between the two grid points around the crossing, and are labelled as that: the
 * record's bound is the interval, not a point inside it (the protocol, "A derived figure").
 */
function rules(table) {
    const medians = table.findIndex((r) => r.ippe <= r.cf);
    const half = table.findIndex((r) => r.closer >= r.n / (BREAK === "rule-off" ? 4 : 2));
    const m0 = table[medians - 1];
    const m1 = table[medians];
    const h0 = table[half - 1];
    const h1 = table[half];
    return {
        medians: { T: m1.tilt, from: m0.tilt, interpolatedDifference: linear(m0.tilt, m0.ippe - m0.cf, m1.tilt, m1.ippe - m1.cf, 0), interpolatedRatio: linear(m0.tilt, m0.ippe / m0.cf, m1.tilt, m1.ippe / m1.cf, 1) },
        half: { T: h1.tilt, from: h0.tilt, interpolated: linear(h0.tilt, h0.closer / h0.n, h1.tilt, h1.closer / h1.n, 0.5) },
    };
}

// =============================================================================================
// --self-test: the constructed cases. Each definition fires on its own case and no other.
// =============================================================================================
function selfTest() {
    const fails = [];
    const expect = (what, got, want) => {
        if (got !== want) fails.push(`${what}: ${String(got)}, expected ${String(want)}`);
    };
    const near = (what, got, want, tol = 1e-9) => {
        if (!(Math.abs(got - want) <= tol)) fails.push(`${what}: ${got}, expected ${want}`);
    };
    const W = 512;
    const Hh = 640;
    const points = targetCorners(W, Hh);
    const K = Float64Array.from(intrinsics(203, 360));
    const rotX = (a) => Float64Array.from([1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]);
    const rotZ = (a) => Float64Array.from([Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]);
    const mul = (A, B) => {
        const o = new Float64Array(9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
        return o;
    };
    const R = mul(rotX(0.2), rotZ(0.3));
    const t = Float64Array.from([-200, -250, 1400]);
    // H = K·[r1 r2 t], built here apart from poseHomography: the projection must equal H's corners.
    const M = [R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]];
    const Hbase = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) Hbase[i * 3 + j] += K[i * 3 + k] * M[k * 3 + j];
    for (const lambda of [1, 0.37, -2.5]) {
        const H = Hbase.map((v) => v * lambda);
        const under = reprojectCorners(H, points);
        const pc = poseCorners({ R, t, good: true }, K, points);
        if (pc === null || under === null) fails.push(`projection: null at λ ${lambda}`);
        else for (let c = 0; c < 4; c++) for (let a = 0; a < 2; a++) near(`projection at λ ${lambda}, corner ${c}, axis ${a}`, pc[c][a], under[c][a], 1e-9);
    }
    // The depth: all behind, partly behind, and good false, each no corners; the one in front has them.
    expect("depth: in front has corners", poseCorners({ R, t, good: true }, K, points) !== null, true);
    expect("depth: all behind has none", poseCorners({ R, t: Float64Array.from([-200, -250, -1400]), good: true }, K, points), null);
    expect("depth: plane crossing has none", poseCorners({ R: rotX(-1.4), t: Float64Array.from([0, 0, 300]), good: true }, K, points), null);
    expect("depth: good false has none", poseCorners({ R: Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: new Float64Array(3), good: false }, K, points), null);
    // The tilt on constructed poses of known tilt, about any axis in the plane; roll does not enter.
    for (const deg of [0, 2.9, 7, 10, 45, 89, 135, 180]) {
        near(`tilt ${deg}°`, tiltOf(rotX((deg * Math.PI) / 180)), deg, 1e-9);
        near(`tilt ${deg}° with roll`, tiltOf(mul(rotZ(0.7), rotX((deg * Math.PI) / 180))), deg, 1e-9);
    }
    // The guard's switch just below, at and just above the threshold.
    expect("guard: just below T", guardPick(10 - 1e-9, 10), "cf");
    expect("guard: at T", guardPick(10, 10), "ippe");
    expect("guard: just above T", guardPick(10 + 1e-9, 10), "ippe");
    expect("guard: no tilt", guardPick(null, 10), "ippe");
    // The bands: lower edge in, upper edge out, every edge.
    expect("band: 0", bandOf(0), "0-1");
    expect("band: 1", bandOf(1), "1-3");
    expect("band: 2.9", bandOf(2.9), "1-3");
    expect("band: 9.99", bandOf(9.99), "7-10");
    expect("band: 10", bandOf(10), "10-15");
    if (TILT) {
        // The new bands, on constructed tilts at each boundary: the grid points 15°, 20°, 30°, 40°.
        for (const [tilt, want] of [[14.999, "10-15"], [15, "15-20"], [19.999, "15-20"], [20, "20-30"], [29.999, "20-30"], [30, "30-40"], [39.999, "30-40"], [40, "over 40"], [170, "over 40"]]) expect(`band: ${tilt}`, bandOf(tilt), want);
    } else {
        expect("band: 15", bandOf(15), "over 15");
        expect("band: 170", bandOf(170), "over 15");
    }
    // Question D: a constructed H with a known residual on every correspondence.
    {
        const Hr = Float64Array.from([1.2, 0.1, 5, -0.05, 0.9, 7, 1e-4, 2e-4, 1]);
        const pts = [[0, 0], [100, 0], [0, 200], [100, 200], [50, 90], [20, 170]];
        const known = [0.5, 0.5, 0.5, 0.25, 0.25, 2];
        const src = new Float64Array(2 * pts.length);
        const dst = new Float64Array(2 * pts.length);
        pts.forEach(([x, y], i) => {
            const w = Hr[6] * x + Hr[7] * y + Hr[8];
            const a = i * 1.1; // the error's direction turns, so an axis-only residual reads short
            src[2 * i] = x;
            src[2 * i + 1] = y;
            dst[2 * i] = (Hr[0] * x + Hr[1] * y + Hr[2]) / w + known[i] * Math.cos(a);
            dst[2 * i + 1] = (Hr[3] * x + Hr[4] * y + Hr[5]) / w + known[i] * Math.sin(a);
        });
        const got = inlierResiduals(Hr, src, dst);
        known.forEach((k, i) => near(`residual ${i}`, got[i], k, 1e-9));
        near("residual: median", medianOf(got), 0.5, 1e-9);
        near("residual: rms", rmsOf(got), Math.sqrt((3 * 0.25 + 2 * 0.0625 + 4) / 6), 1e-9);
    }
    // Question A's reading and table.
    {
        const p = fivePoint(Array.from({ length: 101 }, (_, i) => i));
        expect("five-point: min", p.min, 0);
        expect("five-point: p50", p.p50, 50);
        expect("five-point: max", p.max, 100);
        expect("bin: 0", halfSecondBin(0), 0);
        expect("bin: 0.499", halfSecondBin(0.499), 0);
        expect("bin: 0.5", halfSecondBin(0.5), 1);
        expect("bin: 13.9", halfSecondBin(13.9), 27);
    }
    // Question E: the render's K, and the crossover on rows whose answer is known.
    {
        const Ka = Float64Array.from(intrinsics(270, 360));
        near("render K: 1005 px at 720 px, at a width of 270", renderK(Ka, 270, 1005)[0], 376.875, 1e-9);
        near("render K: the assumed focal length comes back", renderK(Ka, 270, (720 / 2) / Math.tan(Math.PI / 6))[0], Ka[0], 1e-9);
        expect("render K: the principal point stays", renderK(Ka, 270, 1005)[2], Ka[2]);
        near("rotation angle: 30 deg about x", rotationAngle(rotX((30 * Math.PI) / 180), Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1])), 30, 1e-9);
        near("rotation angle: none", rotationAngle(R, R), 0, 1e-6);
        const c = crossover(TABLE.map((r) => ({ ...r, readTilt: r.tilt })));
        expect("crossover: medians, on the table", c.medians.trueTilt, 10);
        expect("crossover: medians read before", c.medians.readBefore, 7);
        expect("crossover: half, on the table", c.half.trueTilt, 10);
        expect("crossover: the table's medians stay", c.medians.stays, true);
        const never = crossover([{ tilt: 0, readTilt: 0, ippe: 2, cf: 1, closer: 0, n: 4 }]);
        expect("crossover: none on the grid", never.medians.row, null);
        const back = crossover([{ tilt: 0, readTilt: 0, ippe: 1, cf: 2, closer: 3, n: 4 }, { tilt: 5, readTilt: 4, ippe: 3, cf: 2, closer: 0, n: 4 }]);
        expect("crossover: a rule that does not stay", back.medians.stays, false);
    }
    // Check R's comparison: identical passes, one byte of a table fails, a table missing fails, a
    // line of stdout other than the script's name and hash fails, those two lines do not.
    {
        const A = { "a.jsonl": "x\n", "a.result.json": "{}", "stdout.txt": "# 2026-11-04-228-stage1-probe.mjs\nthis script's source, SHA-256: 1\nsame\n" };
        const B = { ...A, "stdout.txt": "# 2026-11-06-228-stage1-repeat.mjs\nthis script's source, SHA-256: 2\nsame\n" };
        const cmp = (x, y) => compareRuns(Object.keys(x), (f) => Buffer.from(x[f]), Object.keys(y), (f) => Buffer.from(y[f])).fails.length;
        expect("check R: same tables, the name and the hash apart", cmp(A, B), 0);
        expect("check R: one byte of a table", cmp(A, { ...B, "a.jsonl": "y\n" }) > 0, true);
        const { "a.result.json": _gone, ...missing } = B;
        expect("check R: a table missing", cmp(A, missing) > 0, true);
        expect("check R: another stdout line", cmp(A, { ...B, "stdout.txt": "# 2026-11-06-228-stage1-repeat.mjs\nthis script's source, SHA-256: 2\nother\n" }) > 0, true);
    }
    // The wrong-pose rule on frames of 203 × 360 (diagonal 413.3).
    const inside = [[10, 10], [190, 10], [190, 350], [10, 350]];
    const leaving = [[-300, 10], [190, 10], [190, 350], [10, 350]];
    const far = [[-500, 10], [190, 10], [190, 350], [10, 350]];
    expect("wrong: inside", farOutside(inside, 203, 360), false);
    expect("wrong: leaving, within a diagonal", farOutside(leaving, 203, 360), false);
    expect("wrong: beyond a diagonal", farOutside(far, 203, 360), true);
    // The rules' thresholds on the table, and on the rows the protocol quotes.
    const r = rules(TABLE);
    expect("rule: medians", r.medians.T, 10);
    expect("rule: medians from", r.medians.from, 7);
    expect("rule: half", r.half.T, 10);
    expect("rule: half from", r.half.from, 7);
    near("rule: medians, interpolated on the difference", r.medians.interpolatedDifference, 9.4, 1e-9);
    near("rule: half, interpolated", r.half.interpolated, 9.357142857142858, 1e-9);
    // The identity check: identical rows pass; each one-field difference fails.
    const row = () => ({ ok: true, state: "TRACK", reason: null, numInliers: 30, numMatches: 40, trackLoss: null, media: 1.5, H: Float64Array.from(Hbase), sel: { R: Float64Array.from(R), t: Float64Array.from(t) }, outcome: "selected", chosen: 0 });
    expect("identity: same", identityBreach(row(), row()), null);
    const changed = (edit) => {
        const b = row();
        edit(b);
        return identityBreach(row(), b) !== null;
    };
    expect("identity: H", changed((b) => (b.H[4] += 1e-9)), true);
    expect("identity: state", changed((b) => (b.state = "DETECT")), true);
    expect("identity: ok", changed((b) => (b.ok = false)), true);
    expect("identity: inliers", changed((b) => (b.numInliers = 29)), true);
    expect("identity: selected R", changed((b) => (b.sel.R[0] += 1e-9)), true);
    // The frozen metric, as a measurement: still corners 0; a line in time 0 (it detrends); a
    // constant offset 0 and no change in spread beyond the offset; noise moves it. Lines 103 to 109.
    const base = [[10, 10], [100, 10], [100, 200], [10, 200]];
    const seq = (f) => Array.from({ length: 30 }, (_, i) => ({ mediaTimeSeconds: i / 30, corners: base.map(([x, y], c) => f(x, y, i, c)) }));
    near("metric: still", cornerJitter(seq((x, y) => [x, y])).jitterPx, 0, 1e-12);
    near("metric: straight motion is invisible", cornerJitter(seq((x, y, i) => [x + 0.5 * i, y - 0.25 * i])).jitterPx, 0, 1e-9);
    near("metric: a constant offset is invisible", cornerJitter(seq((x, y) => [x + 7, y - 3])).jitterPx, 0, 1e-12);
    const alternate = cornerJitter(seq((x, y, i) => [x + (i % 2 ? 0.1 : -0.1), y])).jitterPx;
    if (!(alternate > 0.05)) fails.push(`metric: noise reads ${alternate}, expected above 0.05`);
    // The two seeding guards.
    const seen = countGlobalRandomReads(() => Math.random());
    expect("reads: a read is counted", BREAK === "reads-blind" ? 0 : seen.reads, 1);
    expect("reads: none is none", countGlobalRandomReads(() => 1).reads, 0);
    expect("refusal: a backend that does not declare it", seedingRefusal({ capabilities: { name: "x", deterministicRansac: false } }) !== null, true);
    expect("refusal: one that does", seedingRefusal({ capabilities: { name: "x", deterministicRansac: true } }), null);
    if (fails.length) {
        for (const f of fails) process.stderr.write(`self-test: ${f}\n`);
        fatal(`self-test: ${fails.length} failed${BREAK ? ` (--break ${BREAK})` : ""}`);
    }
    process.stdout.write(`self-test: all passed${BREAK ? ` (--break ${BREAK})` : ""}\n`);
}
if (argv.includes("--self-test")) {
    selfTest();
    process.exit(0);
}
if (argv.includes("--check-r")) {
    const i = argv.indexOf("--check-r");
    const [da, db] = [argv[i + 1], argv[i + 2]];
    if (!da || !db) fatal("--check-r <first dir> <copy dir>");
    const c = compareRuns(readdirSync(da), (f) => readFileSync(join(da, f)), readdirSync(db), (f) => readFileSync(join(db, f)));
    if (c.fails.length > 0) {
        for (const f of c.fails.slice(0, 20)) process.stderr.write(`check R: ${f}\n`);
        fatal(`check R failed: ${c.fails.length} differences, ${c.same} of ${c.tables} tables equal`);
    }
    process.stdout.write(`check R: ${c.tables} per-run tables byte-identical, list SHA-256 ${c.listHash}; ${c.lines} stdout lines compared, ${c.excepted} excepted (the script's name and hash)\n`);
    process.exit(0);
}

// =============================================================================================
// The inputs and their hashes, at 84fd4ba.
// =============================================================================================
const STATIC_CLIP = "pinball-static.mp4";
const TILT_CLIPS = ["pinball-tilt-cross.mp4", "pinball-tilt-mid.mp4", "pinball-tilt-sweep.mp4"];
const CLIPS = TILT ? TILT_CLIPS : ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ...(TILT
        ? [
              ["examples/videos/pinball-tilt-cross.mp4", "3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e"],
              ["examples/videos/pinball-tilt-mid.mp4", "f29c37d71fa074bc8ae4e8c94a89a2f9b6654e458a6d4b144ee5bdf85267e915"],
              ["examples/videos/pinball-tilt-sweep.mp4", "90c5af74401577b29f7090f07b9205d7d5e6524baed7f48d44a6dc9ea4eb9dcf"],
          ]
        : [
              ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
              ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
          ]),
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
];
/** Where the copied decoding and the imported loop come from: printed, and proved by check D. */
const PRINTED = ["scripts/replay-clips.mjs", "scripts/replay-run.mjs", "scripts/replay-seeding.mjs"];
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
for (const [rel, want0] of INPUTS) {
    const want = BREAK === "input-hash" && rel.endsWith(".wnft") ? "0".repeat(64) : want0;
    const p = join(ROOT, rel);
    if (!existsSync(p)) fatal(`${rel}: missing under ${ROOT}`);
    const got = sha256(readFileSync(p));
    if (got !== want) fatal(`${rel}: SHA-256 ${got}, expected ${want}`);
}
if (TILT) {
    // The clips' hashes against where the repository records them, not only against this file.
    const readme = readFileSync(join(ROOT, "examples/README.md"), "utf8");
    for (const [rel, want0] of INPUTS.filter(([p]) => p.includes("pinball-tilt-"))) {
        const name = rel.split("/").pop();
        const want = BREAK === "readme-hash" ? want0.replace(/.$/, "x") : want0;
        const at = readme.indexOf(`**\`${name}\`**`);
        if (at < 0) fatal(`examples/README.md has no entry for ${name}`);
        if (!readme.slice(at, at + 700).includes(want)) fatal(`examples/README.md's entry for ${name} does not give ${want}`);
    }
}
{
    const text = readFileSync(join(ROOT, "docs/benchmarks/2026-10-15-m4-step3-ippe-c4-characterisation.md"), "utf8");
    for (const r of TABLE) {
        const row = `| ${r.tilt}° | ${r.n} | ${r.over} | ${r.ippe.toFixed(3)} | ${r.cf.toFixed(3)} | ${r.ratio.toFixed(2)} | ${r.closer} of ${r.n} |`;
        if (!text.includes(BREAK === "table-row" ? `${row}!` : row)) fatal(`the characterisation has no row "${row}"`);
    }
}

const DIST_NAMES = ["CF-IPPE", "GUARD-IPPE", "FILTER-IPPE", "IPPE-H", "CF-H", "FILTER-H"];
/** The reads across the bands: #133's below and above the threshold, and without the steepest band. */
const groupsOf = (tilt) => [
    [`below ${T}`, (k) => tilt(k) < T],
    [`${T} and above`, (k) => tilt(k) >= T],
    [`below ${T_LOW}`, (k) => tilt(k) < T_LOW],
    [`${T_LOW} and above`, (k) => tilt(k) >= T_LOW],
    ["below 15", (k) => tilt(k) < 15],
];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LOOPS = 6;
const COUNTED = Object.freeze({ firstLoop: 1, loopCount: BREAK === "counted-off" ? 3 : 4 });
const RULES = rules(TABLE);
const T = RULES.medians.T;
/** The interval's lower edge: sensitivity, a per-frame choice on the same poses. */
const T_LOW = RULES.medians.from;
/** The tilt clips' two device schedules carry a borrowed constant, and every figure's label says so. */
const BORROWED = TILT ? ", acquisition BORROWED from the static clip, 36.9 ms, not measured" : "";
const SCHEDULES = [
    { name: "every frame", key: "every", stepMs: null, slug: "tracking-every-frame" },
    { name: `device, 15 ms step${BORROWED}`, key: "15", stepMs: 15, slug: "tracking-device-15-ms-step" },
    { name: `device, 25 ms step${BORROWED}`, key: "25", stepMs: 25, slug: "tracking-device-25-ms-step" },
];
/** Copied from scripts/replay-clips.mjs, lines 266 to 272 at 84fd4ba; proved by check D's schedules. */
const DEVICE_ACQUIRE_MS = {
    "pinball-static.mp4": 36.9,
    "pinball-bench.mp4": 20.4,
    "pinball-bench-table.mp4": 41.0,
    // No measured constant exists. These clips have the static clip's size and orientation (the brief).
    "pinball-tilt-cross.mp4": 36.9,
    "pinball-tilt-mid.mp4": 36.9,
    "pinball-tilt-sweep.mp4": 36.9,
};
const DEVICE_DETECT_MS = 83.2;
/** The registration's derived values, `2026-10-29-106-stage3-registration.md`, "The derived parameters". */
const REGISTERED = { DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF: 1, DEFAULT_POSE_FILTER_ROTATION_BETA: 10, DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF: 1, DEFAULT_POSE_FILTER_TRANSLATION_BETA: 0.1, DEFAULT_POSE_FILTER_D_CUTOFF: 1 };
for (const [k, v] of Object.entries(REGISTERED)) {
    const want = BREAK === "registered" && k === "DEFAULT_POSE_FILTER_ROTATION_BETA" ? 11 : v;
    if (trackerPkg[k] !== want) fatal(`${k} is ${trackerPkg[k]}, the registration's ${want}`);
}
/**
 * #227's "Evidence (c)", arm 1, every frame, sync, `frame` policy: posed frames in all 6 loops,
 * DETECT and TRACK in the counted loops, seeds 1 to 8. A reconciliation at seeds other than 1.
 */
const PINS = {
    "pinball-static.mp4": [[2178, 0, 1452], [2178, 0, 1452], [2178, 0, 1452], [2178, 0, 1452], [2178, 0, 1452], [2178, 0, 1452], [2178, 0, 1452], [2178, 0, 1452]],
    "pinball-bench.mp4": [[1284, 60, 796], [1284, 44, 812], [1272, 40, 808], [1272, 36, 812], [1266, 44, 800], [1272, 36, 812], [1272, 28, 820], [1278, 52, 800]],
    "pinball-bench-table.mp4": [[1272, 20, 828], [1272, 28, 820], [1350, 16, 884], [1272, 24, 824], [1308, 20, 852], [1344, 12, 884], [1266, 24, 820], [1314, 24, 852]],
};

if (arg("--post-run") !== null) {
    postRun(arg("--post-run"));
    process.stdout.write(out.join("\n") + "\n");
    process.exit(0);
}
const REPLAY_DIR = arg("--replay");
const OUT_DIR = arg("--out");
const CHILD = arg("--child");
const ONLY = arg("--only"); // "<every|15|25>:<seed>": one schedule and seed, checks only, for --break
if (OUT_DIR === null) fatal("--out <run dir> is required");
if (!TILT && REPLAY_DIR === null) fatal("--replay <dir holding replay-clips' ext/ and def/ at --seed 1> is required");
if (CHILD !== null) {
    if (TILT && CHILD === "synthetic") {
        await synthetic();
        process.exit(0);
    }
    if (!CLIPS.includes(CHILD) && !(TILT && CHILD === STATIC_CLIP)) fatal(`--child ${CHILD}: not one of ${CLIPS.join(", ")}`);
    await child(CHILD);
    process.exit(0);
}
await main();
process.exit(0);

// =============================================================================================
// The parent: the tree at both ends, one child per clip, the report.
// =============================================================================================
function treeState() {
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 });
    return { head: git("rev-parse", "HEAD").toString().trim(), diff: sha256(git("diff", "HEAD")), status: git("status", "--short").toString() };
}
async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const self = fileURLToPath(import.meta.url);
    const start = treeState();
    const onlyArgs = ONLY === null ? [] : ["--only", ONLY];
    const breakArgs = BREAK === null ? [] : ["--break", BREAK];
    const clips0 = ONLY === null ? CLIPS : (arg("--clip") ? [arg("--clip")] : CLIPS);
    // The static clip enters the tilt profile for question D's reference only; "synthetic" is question E.
    const clips = TILT && ONLY === null ? [...clips0, STATIC_CLIP, "synthetic"] : clips0;
    const replayArgs = REPLAY_DIR === null ? [] : ["--replay", REPLAY_DIR];
    const codes = await Promise.all(
        clips.map(
            (clip) =>
                new Promise((done) => {
                    const p = spawn(process.execPath, [self, ...replayArgs, "--profile", PROFILE, "--out", OUT_DIR, "--child", clip, ...onlyArgs, ...breakArgs], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
                    p.on("exit", (code) => done([clip, code]));
                }),
        ),
    );
    for (const [clip, code] of codes) if (code !== 0) fatal(`${clip}: its child exited ${code}; no figure is printed`);
    const end = treeState();
    if (BREAK === "tree-state") end.status += "?? a file that appeared\n";
    if (start.head !== end.head || start.diff !== end.diff || start.status !== end.status) fatal(`the tree changed during the run: ${JSON.stringify(start)} and ${JSON.stringify(end)}`);
    if (ONLY !== null) {
        process.stderr.write(`pre-run ${ONLY}: every check passed\n`);
        return;
    }
    const R = {};
    for (const clip of CLIPS) R[clip] = JSON.parse(readFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`), "utf8"));
    lap("all clips");
    report(R, start);
    if (TILT) reportTilt(R);
    process.stdout.write(out.join("\n") + "\n");
}

// =============================================================================================
// One clip: both trackers on every schedule and seed, every check, a result file.
// =============================================================================================
async function child(clip) {
    // ---- decoding, copied from scripts/replay-clips.mjs (`probe`, `greyFrames`, `loadClip`) ----
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
            for (let i = 0, p = o; i < n; i++, p += 3) data[i] = (rgb[p] * (BREAK === "decode-luma" ? 0.3 : 0.299) + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
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
    const refused = seedingRefusal(BREAK === "capability" ? { capabilities: { ...cv.capabilities, deterministicRansac: false } } : cv);
    if (refused) fatal(refused);
    const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
    const [gw, gh] = target.pyramid.levelSizes[0];
    if (gw !== target.meta.widthPx || gh !== target.meta.heightPx) fatal(`level-0 ${gw}x${gh} differs from the meta size`);
    const grid = targetGrid(gw, gh);
    const K = intrinsics(width, height);
    const clipDurationS = loopPeriod(pts);
    const stem = clip.replace(/\.mp4$/, "");
    lap(`${clip}: decoded ${frames.length} frames at ${width}x${height}`);

    /** One tracker over one schedule. `tick` is what the replay's probe hook sees of each result. */
    function run(schedule, seed, options, policy = "frame", onFrame = null) {
        const ticks = [];
        const { value: records, reads } = countGlobalRandomReads(() =>
            replayRun({
                NftTracker,
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
                probe: {
                    frame: (_f, r) => {
                        if (BREAK === "global-read") Math.random();
                        if (onFrame !== null) onFrame(r);
                        ticks.push({
                            ok: r.ok,
                            state: r.state,
                            reason: r.ok ? null : r.reason,
                            numInliers: r.numInliers,
                            numMatches: r.numMatches,
                            trackLoss: r.trackLoss,
                            H: r.ok ? Float64Array.from(r.H) : null,
                            pose: r.ok ? r.pose : null,
                            sel: r.ok ? r.poseSelection.pose : null,
                            outcome: r.ok ? r.poseSelection.outcome : null,
                            chosen: r.ok ? r.poseSelection.chosen : null,
                            passThrough: r.ok ? r.pose === r.poseSelection.pose : null,
                        });
                    },
                },
                loops: LOOPS,
                acquireMs: DEVICE_ACQUIRE_MS[clip],
                unwrapped: true,
                seeding: runSeeding(seed, policy),
            }),
        );
        if (reads !== 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: ${reads} reads of the global Math.random`);
        if (ticks.length !== records.length) fatal(`${clip}: ${ticks.length} results, ${records.length} records`);
        ticks.forEach((t, k) => (t.media = records[k].mediaTimeSeconds));
        return { records, ticks };
    }

    /** Both trackers, the identity check, and every arm's reading of every frame. */
    function measure(schedule, seed) {
        const a = run(schedule, seed, {});
        const b = run(schedule, seed, { poseFilter: { mode: "one-euro" } });
        if (a.ticks.length !== b.ticks.length) fatal(`${clip}, ${schedule.name}, seed ${seed}: Q0: ${a.ticks.length} frames and ${b.ticks.length}`);
        if (BREAK === "identity-H") {
            const f = b.ticks.find((t) => t.ok);
            f.H[4] += 1e-9;
        }
        let filtered = 0;
        const rows = [];
        const n = a.ticks.length;
        const armCorners = { H: [], IPPE: [], CF: [], GUARD: [], GUARD_LOW: [], FILTER: [] };
        for (let k = 0; k < n; k++) {
            const x = a.ticks[k];
            const y = b.ticks[k];
            const breach = identityBreach(x, y);
            if (breach !== null) fatal(`${clip}, ${schedule.name}, seed ${seed}, frame ${k}: Q0's identity fails: ${breach}`);
            if (x.ok && !x.passThrough) fatal(`${clip}, frame ${k}: the filter is off and pose is not poseSelection.pose`);
            if (y.ok && !y.passThrough) filtered++;
            let row = { k, media: x.media, stamp: a.records[k].timestampMs, ok: x.ok, state: x.state, reason: x.reason, inliers: x.numInliers, matches: x.numMatches, trackLoss: x.trackLoss };
            let c = { H: a.records[k].corners, IPPE: null, CF: null, GUARD: null, GUARD_LOW: null, FILTER: null };
            if (x.ok) {
                const cf = closedFormPose(x.H, K);
                // On a fallback frame the tracker's own pose is this closed form, bit for bit.
                if (x.chosen === "fallback") {
                    for (let i = 0; i < 9; i++) if (x.sel.R[i] !== cf.R[i]) fatal(`${clip}, frame ${k}: a fallback frame's R is not closedFormPose(H, K)'s`);
                    for (let i = 0; i < 3; i++) if (x.sel.t[i] !== cf.t[i]) fatal(`${clip}, frame ${k}: a fallback frame's t is not closedFormPose(H, K)'s`);
                }
                const tilt = cf.good ? tiltOf(cf.R) : null;
                c.IPPE = poseCorners(x.sel, K, targetPoints);
                c.CF = poseCorners(cf, K, targetPoints);
                c.GUARD = guardPick(tilt, T) === "cf" ? c.CF : c.IPPE;
                c.GUARD_LOW = guardPick(tilt, T_LOW) === "cf" ? c.CF : c.IPPE;
                c.FILTER = poseCorners(y.pose, K, targetPoints);
                row = { ...row, H: Array.from(x.H), tilt, outcome: x.outcome, chosen: x.chosen, cfInFront: cf.good && inFront(cf.R, cf.t, grid), ippeInFront: inFront(x.sel.R, x.sel.t, grid), passThrough: y.passThrough };
            }
            for (const arm of Object.keys(armCorners)) armCorners[arm].push(c[arm]);
            rows.push({ ...row, corners: c });
        }
        if (a.ticks.some((t, i) => i > 0 && t.ok && t.state === "TRACK" && a.ticks[i - 1].ok && a.ticks[i - 1].state === "TRACK") && filtered === 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: the filter filtered no frame`);
        return { records: a.records, ticks: a.ticks, filterTicks: b.ticks, rows, armCorners, text: rows.map((r) => JSON.stringify(r)).join("\n") + "\n" };
    }

    // ---- check D: the copied decoding, the imported loop and the seeding, against the replay ----
    const mask = (f, dropStamps) => {
        const g = JSON.parse(JSON.stringify(f));
        delete g.trackerTimings;
        if (dropStamps) {
            delete g.timestampMs;
            if (g.detectedAt) delete g.detectedAt.timestampMs;
        }
        return JSON.stringify(g);
    };
    function proveAgainstReplay(schedule, m) {
        const fromDef = join(REPLAY_DIR, "def", `replay-${stem}-${schedule.slug}.json`);
        if (!existsSync(fromDef)) fatal(`${fromDef}: missing`);
        const def = JSON.parse(readFileSync(fromDef, "utf8"));
        if (def.seed !== 1 || def.seedPolicy !== "frame") fatal(`${fromDef}: seed ${def.seed}, policy ${def.seedPolicy}`);
        if (def.metricsVersion !== METRICS_VERSION) fatal(`${fromDef}: metricsVersion ${def.metricsVersion}`);
        // The default runs stamp pts * 1000 over 2 loops: the same frames as a prefix, the stamp apart.
        for (let k = 0; k < def.frames.length; k++) {
            if (k >= m.records.length || mask(m.records[k], true) !== mask(def.frames[k], true)) fatal(`${clip}, ${schedule.name}: frame ${k} differs from replay-clips' 2-loop export`);
        }
        const proof = { defFrames: def.frames.length, defSha: sha256(readFileSync(fromDef)) };
        if (schedule.stepMs === null) {
            const fromExt = join(REPLAY_DIR, "ext", `replay-${stem}-tracking-every-frame-sync.json`);
            if (!existsSync(fromExt)) fatal(`${fromExt}: missing`);
            const ext = JSON.parse(readFileSync(fromExt, "utf8"));
            if (ext.seed !== 1 || ext.seedPolicy !== "frame") fatal(`${fromExt}: seed ${ext.seed}, policy ${ext.seedPolicy}`);
            if (ext.frames.length !== m.records.length) fatal(`${clip}: ${m.records.length} frames, arm 1's export ${ext.frames.length}`);
            for (let k = 0; k < ext.frames.length; k++) {
                if (mask(m.records[k], false) !== mask(ext.frames[k], false)) fatal(`${clip}: frame ${k} differs from replay-clips' arm 1 export`);
            }
            const counted = countedLoopFrames(m.records, { clipDurationS, ...COUNTED });
            const mine = cornerJitter(counted, { clipDurationS });
            for (const key of ["posedFrames", "jitterWindows", "jitterPx", "spreadPx"]) {
                if (mine[key] !== ext.runSummary[key]) fatal(`${clip}: the frozen metric's ${key} ${mine[key]}, arm 1's export ${ext.runSummary[key]}`);
            }
            proof.extFrames = ext.frames.length;
            proof.extSha = sha256(readFileSync(fromExt));
            proof.jitterPx = mine.jitterPx;
            proof.manifestClean = ext.packageSource.manifestClean;
            proof.manifestHead = ext.packageSource.manifestHead;
            if (proof.manifestClean !== true) fatal(`${fromExt}: built from a dirty tree`);
        }
        return proof;
    }

    /** The fields one view of one band reports for one set of frames. */
    function readView(common, armFrames, include, band, rowsByK, dist) {
        const inc = (f) => common.has(f.k) && include(f.k) && (band === null || band(f.k));
        const arms = {};
        for (const arm of Object.keys(armFrames)) arms[arm] = cornerJitter(armFrames[arm], { include: inc, clipDurationS });
        const distances = {};
        const ks = [...common].filter((k) => include(k) && (band === null || band(k)));
        for (const [name, p, q] of dist) {
            const v = ks.map((k) => cornerDistance(rowsByK[k].corners[p], rowsByK[k].corners[q])).sort((u, w) => u - w);
            distances[name] = v.length === 0 ? null : percentile(v, 50);
        }
        return { arms, distances, frames: ks.length };
    }

    /**
     * Question D, a shadow run. The result carries the TRACK fit's weighted RMS (`tracking.rmsError`)
     * and no correspondences. `NftTracker.prototype.selected` is the one place both states' inlier
     * correspondences pass, so this run wraps it, here and nowhere in src/, and reads them. It must
     * change nothing: its frames are compared with the plain run's, bit for bit (fatal).
     */
    function planarity(seed, plain) {
        const every = SCHEDULES[0];
        const proto = NftTracker.prototype;
        const original = proto.selected;
        if (typeof original !== "function") fatal("NftTracker.prototype.selected is gone: question D's shadow cannot read the inliers");
        let last = null;
        const perFrame = [];
        proto.selected = function (H, src, dst, sigma) {
            last = { H: Float64Array.from(H), residuals: inlierResiduals(H, src, dst) };
            return original.call(this, BREAK === "shadow-perturb" ? H.map((x, i) => (i === 0 ? x * 1.001 : x)) : H, src, dst, sigma);
        };
        let shadow;
        try {
            shadow = run(every, seed, {}, "frame", (r) => {
                if (!r.ok) {
                    perFrame.push(null);
                    return;
                }
                if (last === null) fatal(`${clip}, seed ${seed}: a posed frame with no selection`);
                for (let i = 0; i < 9; i++) if (last.H[i] !== r.H[i]) fatal(`${clip}, seed ${seed}: the shadow's H is not the result's`);
                if (last.residuals.length !== r.numInliers) fatal(`${clip}, seed ${seed}: ${last.residuals.length} correspondences, ${r.numInliers} inliers`);
                const cf = closedFormPose(r.H, K);
                perFrame.push({ state: r.state, tilt: cf.good ? tiltOf(cf.R) : null, inliers: r.numInliers, median: medianOf(last.residuals), rms: rmsOf(last.residuals), rmsError: r.state === "TRACK" ? r.tracking.rmsError : null });
                last = null;
            });
        } finally {
            proto.selected = original;
        }
        if (shadow.ticks.length !== plain.ticks.length) fatal(`${clip}, seed ${seed}: the shadow ran ${shadow.ticks.length} frames, the plain run ${plain.ticks.length}`);
        shadow.ticks.forEach((t, k) => {
            const breach = identityBreach(t, plain.ticks[k]);
            if (breach !== null) fatal(`${clip}, seed ${seed}, frame ${k}: the shadow changed the run: ${breach}`);
        });
        const counted = countedLoopFrames(shadow.records, { clipDurationS, ...COUNTED });
        const kOf = new Map(shadow.records.map((r, k) => [r, k]));
        const rows = counted.map((f) => ({ media: f.mediaTimeSeconds, row: perFrame[kOf.get(f)] })).filter((x) => x.row !== null && x.row.tilt !== null);
        const read = (test) => {
            const x = rows.filter(test);
            const trk = x.filter((y) => y.row.state === "TRACK");
            return {
                frames: x.length,
                trackFrames: trk.length,
                inliers: medianOf(x.map((y) => y.row.inliers)),
                median: medianOf(x.map((y) => y.row.median)),
                medianP90: x.length ? fivePoint(x.map((y) => y.row.median)).p90 : null,
                rms: medianOf(x.map((y) => y.row.rms)),
                trackMedian: medianOf(trk.map((y) => y.row.median)),
                detectMedian: medianOf(x.filter((y) => y.row.state === "DETECT").map((y) => y.row.median)),
                rmsError: medianOf(trk.map((y) => y.row.rmsError)),
            };
        };
        const bands = {};
        for (const [b] of BANDS) bands[b] = read((y) => bandOf(y.row.tilt) === b);
        // On TRACK frames: a wrong detection can read any tilt, and it is the print at its steepest that is asked about.
        const trackRows = rows.filter((y) => y.row.state === "TRACK");
        const tiltMax = trackRows.length ? Math.max(...trackRows.map((y) => y.row.tilt)) : null;
        return {
            seed,
            whole: read(() => true),
            bands,
            // The reviewer's frame at about 13 s in cross, and the clip's last second there.
            late: read((y) => y.media >= 12.5),
            nearMaxTilt: tiltMax === null ? null : read((y) => y.row.state === "TRACK" && y.row.tilt >= tiltMax - 1),
            tiltMax,
        };
    }

    if (TILT && clip === STATIC_CLIP) {
        const planar = SEEDS.map((seed) => planarity(seed, run(SCHEDULES[0], seed, {})));
        writeFileSync(join(OUT_DIR, `${stem}.planarity.json`), JSON.stringify({ clip, width, height, planar }));
        lap(`${clip}: planarity done`);
        return;
    }

    const DIST = [
        ["CF-IPPE", "CF", "IPPE"],
        ["GUARD-IPPE", "GUARD", "IPPE"],
        ["FILTER-IPPE", "FILTER", "IPPE"],
        ["IPPE-H", "IPPE", "H"],
        ["CF-H", "CF", "H"],
        ["FILTER-H", "FILTER", "H"],
    ];

    const plan = ONLY === null ? SCHEDULES.flatMap((s) => SEEDS.map((seed) => [s, seed])) : [[SCHEDULES.find((s) => s.key === ONLY.split(":")[0]), Number(ONLY.split(":")[1])]];
    const results = [];
    const proofs = {};
    const planar = [];
    const hashes = [];
    for (const [schedule, seed] of plan) {
        const m = measure(schedule, seed);
        const name = `${stem}-${schedule.key}-s${seed}`;
        writeFileSync(join(OUT_DIR, `${name}.jsonl`), m.text);
        hashes.push([name, sha256(m.text)]);
        if (seed === 1) {
            if (!TILT) proofs[schedule.key] = proveAgainstReplay(schedule, m);
            // One seed run twice gives byte-identical per-frame rows; another seed must not.
            const again = measure(schedule, BREAK === "rerun-seed" ? 2 : 1);
            if (again.text !== m.text) fatal(`${clip}, ${schedule.name}, seed 1: two runs differ`);
            if (schedule.stepMs === null) {
                const other = measure(schedule, 2);
                if (!TILT && clip !== "pinball-static.mp4" && other.text === m.text) fatal(`${clip}: seeds 1 and 2 give the same rows`);
                proofs.seedsDiffer = other.text !== m.text;
            }
        }
        const counted = countedLoopFrames(m.records, { clipDurationS, ...COUNTED });
        const kOf = new Map(m.records.map((r, k) => [r, k]));
        const countedKs = counted.map((f) => kOf.get(f));
        // #227's counts, at every seed.
        if (TILT && schedule.stepMs === null && ONLY === null) planar.push(planarity(seed, m));
        if (!TILT && schedule.stepMs === null) {
            const pin = PINS[clip][seed - 1];
            const posedAll = m.records.filter((f) => f.ok).length;
            const det = counted.filter((f) => f.state === "DETECT").length;
            const trk = counted.filter((f) => f.state === "TRACK").length;
            const want = BREAK === "pin" ? [pin[0] + 1, pin[1], pin[2]] : pin;
            if (posedAll !== want[0] || det !== want[1] || trk !== want[2]) fatal(`${clip}, seed ${seed}: posed ${posedAll}, DETECT ${det}, TRACK ${trk}; #227's ${want.join(", ")}`);
        }
        const rowsByK = m.rows;
        const armNames = Object.keys(m.armCorners);
        const armFrames = {};
        for (const arm of armNames) armFrames[arm] = counted.map((f, j) => ({ mediaTimeSeconds: f.mediaTimeSeconds, k: countedKs[j], corners: m.armCorners[arm][countedKs[j]] }));
        // The common set, and what each arm's own corners dropped from it.
        const okKs = countedKs.filter((k) => m.ticks[k].ok);
        const noCorners = Object.fromEntries(armNames.map((a) => [a, okKs.filter((k) => m.armCorners[a][k] === null).length]));
        const common = new Set(okKs.filter((k) => armNames.every((a) => m.armCorners[a][k] !== null) && rowsByK[k].tilt !== null));
        // The wrong-pose rule, on the control arm; the second reading, on any arm.
        const flagged = new Set();
        const flaggedAny = new Set();
        for (const k of common) {
            const c = rowsByK[k].corners;
            if (farOutside(c.H, width, height) || farOutside(c.CF, width, height)) flagged.add(k);
            if (armNames.some((a) => farOutside(c[a], width, height))) flaggedAny.add(k);
        }
        const views = {
            common: () => true,
            clean: (k) => !flagged.has(k),
            cleanAny: (k) => !flaggedAny.has(k),
            // The state is the same in every arm (Q0), so this selects on no treatment.
            trackOnly: (k) => rowsByK[k].state === "TRACK",
        };
        const GROUPS = groupsOf((k) => rowsByK[k].tilt);
        const read = {};
        for (const [view, include] of Object.entries(views)) {
            read[view] = { whole: readView(common, armFrames, include, null, rowsByK, DIST), bands: {} };
            for (const [b] of BANDS) read[view].bands[b] = readView(common, armFrames, include, (k) => bandOf(rowsByK[k].tilt) === b, rowsByK, DIST);
            read[view].groups = {};
            for (const [g, test] of GROUPS) read[view].groups[g] = readView(common, armFrames, include, test, rowsByK, DIST);
        }
        // The guard's arm, read against its definition: CF below T, IPPE at or above it.
        for (const [b, lo] of BANDS) {
            const v = read.common.bands[b].arms;
            const twin = lo < T ? "CF" : "IPPE";
            for (const key of ["jitterPx", "spreadPx", "posedFrames", "jitterWindows"]) {
                if (v.GUARD[key] !== v[twin][key]) fatal(`${clip}, ${schedule.name}, seed ${seed}, band ${b}: GUARD's ${key} ${v.GUARD[key]}, ${twin}'s ${v[twin][key]}`);
            }
        }
        for (const [g, twin] of [[`below ${T}`, "CF"], [`${T} and above`, "IPPE"]]) {
            const v = read.common.groups[g].arms;
            for (const key of ["jitterPx", "spreadPx", "posedFrames", "jitterWindows"]) {
                if (v.GUARD[key] !== v[twin][key]) fatal(`${clip}, ${schedule.name}, seed ${seed}, ${g}: GUARD's ${key} ${v.GUARD[key]}, ${twin}'s ${v[twin][key]}`);
            }
        }
        // Where the guard changes estimator between consecutive posed frames, and the jump there.
        const posedInOrder = countedKs.filter((k) => common.has(k));
        const switches = [];
        const switchDetail = [];
        for (let j = 1; j < posedInOrder.length; j++) {
            const p = rowsByK[posedInOrder[j - 1]];
            const q = rowsByK[posedInOrder[j]];
            if (guardPick(p.tilt, T) !== guardPick(q.tilt, T)) {
                switches.push(cornerDistance(q.corners.CF, q.corners.IPPE));
                // A step back in media time between the two posed frames: the loop wrapped, the footage did not cross.
                switchDetail.push({ media: q.media, from: p.media, tiltFrom: p.tilt, tiltTo: q.tilt, state: q.state, jump: switches[switches.length - 1], atWrap: q.media < p.media });
            }
        }
        // The flagged frames, one line each, once per media time: the loops repeat them.
        const flaggedList = [];
        for (const k of posedInOrder) {
            if (!flagged.has(k)) continue;
            const r = rowsByK[k];
            const far = (arm) => Math.max(...r.corners[arm].map((c) => outside(c, width, height)));
            flaggedList.push({ media: r.media, state: r.state, inliers: r.inliers, tilt: r.tilt, outcome: r.outcome, H: far("H"), CF: far("CF"), IPPE: far("IPPE"), FILTER: far("FILTER") });
        }
        // Each arm's own counted frames, its whole set: never a comparison, read beside it.
        const ownWhole = Object.fromEntries(armNames.map((a) => [a, cornerJitter(armFrames[a], { clipDurationS })]));
        // compareExports, the frozen comparison, on each pair, as a cross-check of the common set.
        const asExport = (arm) => ({ source: "bundled", bundledClip: clip, processingResolution: { width, height }, metricsVersion: METRICS_VERSION, clipDurationS, frames: armFrames[arm] });
        const pairs = {};
        for (const arm of ["CF", "GUARD", "FILTER"]) {
            const c = compareExports(asExport("IPPE"), asExport(arm));
            pairs[arm] = { commonMediaTimes: c.commonMediaTimes, ippe: c.first.jitterPx, arm: c.second.jitterPx };
        }
        // What the guard hands over, and what the filter passes through.
        const handed = {};
        for (const threshold of [T, T_LOW, RULES.medians.interpolatedDifference, RULES.half.interpolated]) {
            const ks = [...common].filter((k) => rowsByK[k].tilt < threshold);
            const fb = ks.filter((k) => rowsByK[k].chosen === "fallback").length;
            handed[threshold] = { frames: ks.length, alreadyClosedForm: fb, changed: ks.length - fb };
        }
        const perBand = {};
        for (const [b] of BANDS) {
            const ks = [...common].filter((k) => bandOf(rowsByK[k].tilt) === b);
            perBand[b] = {
                frames: ks.length,
                fallback: ks.filter((k) => rowsByK[k].chosen === "fallback").length,
                passDetect: ks.filter((k) => rowsByK[k].passThrough && rowsByK[k].state === "DETECT").length,
                passTrack: ks.filter((k) => rowsByK[k].passThrough && rowsByK[k].state === "TRACK").length,
                filtered: ks.filter((k) => !rowsByK[k].passThrough).length,
                flagged: ks.filter((k) => flagged.has(k)).length,
                flaggedAny: ks.filter((k) => flaggedAny.has(k)).length,
            };
        }
        const outcomes = {};
        for (const k of common) outcomes[rowsByK[k].outcome] = (outcomes[rowsByK[k].outcome] ?? 0) + 1;
        // The loop boundaries in the counted loops: whether the filter carried across each.
        let boundary = 0;
        let boundaryPass = 0;
        for (let j = 1; j < countedKs.length; j++) {
            const k = countedKs[j];
            if (m.records[k].mediaTimeSeconds < m.records[countedKs[j - 1]].mediaTimeSeconds && m.ticks[k].ok) {
                boundary++;
                if (rowsByK[k].passThrough) boundaryPass++;
            }
        }
        const tilts = [...common].map((k) => rowsByK[k].tilt).sort((u, w) => u - w);
        // Question A, and whether a lock crosses a loop boundary (ruling 4 of #228).
        let tiltExtra = {};
        if (TILT) {
            const trackKs = [...common].filter((k) => rowsByK[k].state === "TRACK");
            const bins = new Map();
            for (const k of common) {
                const b = halfSecondBin(rowsByK[k].media);
                if (!bins.has(b)) bins.set(b, []);
                bins.get(b).push(k);
            }
            const series = [...bins.keys()].sort((u, w) => u - w).map((b) => {
                const ks = bins.get(b);
                return { bin: b, frames: ks.length, track: ks.filter((k) => rowsByK[k].state === "TRACK").length, tilt: medianOf(ks.map((k) => rowsByK[k].tilt)) };
            });
            let crossedByLock = 0;
            let wraps = 0;
            for (let j = 1; j < countedKs.length; j++) {
                const k = countedKs[j];
                if (m.records[k].mediaTimeSeconds < m.records[countedKs[j - 1]].mediaTimeSeconds) {
                    wraps++;
                    if (m.ticks[k].ok && m.ticks[k].state === "TRACK") crossedByLock++;
                }
            }
            tiltExtra = { switchDetail, wraps, crossedByLock, trackFrames: trackKs.length, tiltFive: fivePoint(tilts), tiltFiveTrack: fivePoint(trackKs.map((k) => rowsByK[k].tilt)), series };
        }
        const behindCf = okKs.filter((k) => rowsByK[k].cfInFront === false).length;
        const behindIppe = okKs.filter((k) => rowsByK[k].ippeInFront === false).length;
        // The worst corner's distance outside the frame, in the common set: where the rule's bound sits.
        const worst = {};
        for (const arm of ["H", "IPPE", "CF", "FILTER"]) {
            worst[arm] = Math.max(0, ...[...common].map((k) => Math.max(...rowsByK[k].corners[arm].map((c) => outside(c, width, height)))));
        }
        const lever = [...common].map((k) => {
            const c = rowsByK[k].corners.H;
            const cx = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4;
            const cy = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
            return c.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / 4;
        }).sort((u, w) => u - w);
        results.push({
            schedule: schedule.key,
            seed,
            frames: m.records.length,
            counted: counted.length,
            ok: okKs.length,
            noCorners,
            common: common.size,
            flagged: flagged.size,
            flaggedAny: flaggedAny.size,
            switches,
            flaggedList,
            rowsHash: sha256(m.text),
            behindCf,
            behindIppe,
            read,
            ownWhole,
            pairs,
            handed,
            perBand,
            outcomes,
            boundary,
            boundaryPass,
            tilt: tilts.length ? { min: tilts[0], p50: percentile(tilts, 50), max: tilts[tilts.length - 1] } : null,
            worst,
            lever: lever.length ? percentile(lever, 50) : null,
            ...tiltExtra,
        });
        lap(`${clip}, ${schedule.name}, seed ${seed}`);
    }
    // #227's 203.645 is `jitterPx` on the media times common to its `frame` and `run` arms 1, read
    // as its evidence script read them: compareExports on the two exports, all 6 loops.
    const reconcile = {};
    if (clip === "pinball-bench-table.mp4" && (ONLY === null || BREAK === "pin-203")) {
        const every = SCHEDULES[0];
        const f = run(every, 3, {});
        const r = run(every, 3, {}, "run");
        const asExport = (x) => ({ source: "bundled", bundledClip: clip, processingResolution: { width, height }, metricsVersion: METRICS_VERSION, clipDurationS, frames: x.records });
        const c = compareExports(asExport(f), asExport(r));
        reconcile.first = c.first.jitterPx;
        reconcile.second = c.second.jitterPx;
        reconcile.commonMediaTimes = c.commonMediaTimes;
        const pinned = BREAK === "pin-203" ? "203.646" : "203.645";
        if (c.first.jitterPx.toFixed(3) !== pinned || c.second.jitterPx.toFixed(3) !== "51.053" || c.commonMediaTimes !== 225) fatal(`#227's seed 3: ${c.first.jitterPx.toFixed(3)} / ${c.second.jitterPx.toFixed(3)} on ${c.commonMediaTimes}`);
    }
    const period = [...pts.slice(1).map((t, i) => t - pts[i])].sort((u, w) => u - w);
    writeFileSync(join(OUT_DIR, `${stem}.result.json`), JSON.stringify({ clip, width, height, nFrames: pts.length, clipDurationS, periodS: percentile(period, 50), results, proofs, hashes, reconcile, ...(TILT ? { planar, K: Array.from(K) } : {}) }));
    lap(`${clip}: done`);
}

// =============================================================================================
// The report. Every figure the record reads is here.
// =============================================================================================
function report(R, tree) {
    const fx = (v, d = 3) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
    const middle = (xs) => {
        const v = [...xs].sort((a, b) => a - b);
        const n = v.length;
        return n === 0 ? null : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    };
    const nums = (xs) => xs.filter((x) => x !== null && x !== undefined);
    /** min / median / max over the seeds, and how many seeds had no reading. */
    const span = (xs, d = 3) => {
        const v = nums(xs);
        if (v.length === 0) return `n/a (0 of ${xs.length})`;
        const miss = xs.length - v.length;
        return `${fx(Math.min(...v), d)} / ${fx(middle(v), d)} / ${fx(Math.max(...v), d)}${miss ? ` (${v.length} of ${xs.length})` : ""}`;
    };
    const ARMS = ["H", "IPPE", "CF", "GUARD", "GUARD_LOW", "FILTER"];
    const PAIRS = [["CF", "IPPE"], ["GUARD", "IPPE"], ["FILTER", "IPPE"]];

    say(`# ${SCRIPT}`);
    say(`head ${tree.head}, git diff HEAD SHA-256 ${tree.diff}, status "${tree.status.trim()}", at the run's start and at its end (fatal otherwise)`);
    say(`this script's source, SHA-256: ${sha256(readFileSync(fileURLToPath(import.meta.url)))}`);
    say(`node ${process.version}`);
    say();
    say("## Inputs");
    for (const [rel, want] of INPUTS) say(`${rel}  ${want}`);
    for (const rel of PRINTED) say(`${rel}  ${sha256(readFileSync(join(ROOT, rel)))}`);
    for (const [rel, keep] of TREES) {
        const d = treeDigest(rel, keep);
        say(`tree ${rel}: ${d.count} files, digest ${d.digest}`);
    }
    say();
    say("## The threshold's two rules, from the characterisation's table");
    const rm = RULES.medians;
    const rh = RULES.half;
    say(`medians: first grid tilt with median e(IPPE) <= median e(closed form): ${rm.T} deg (from ${rm.from} deg); linear between those two rows: ${fx(rm.interpolatedDifference, 2)} deg on the difference, ${fx(rm.interpolatedRatio, 2)} deg on the ratio`);
    say(`half of the fits: first grid tilt with "IPPE closer" on at least half: ${rh.T} deg (from ${rh.from} deg); linear between those two rows: ${fx(rh.interpolated, 2)} deg`);
    say(`the arm's T: ${T} deg; the interval's lower edge, sensitivity: ${T_LOW} deg`);
    say();
    if (TILT) {
        say("## Check D does not apply to these clips: scripts/replay-clips.mjs does not read them. Check R proves the method on the first probe's.");
        for (const clip of CLIPS) say(`${clip}: one seed run twice, byte-identical rows on all three schedules (fatal); seeds 1 and 2 give different rows: ${R[clip].proofs.seedsDiffer}`);
    } else {
    say("## Check D: the proof against the replay, seed 1");
    for (const clip of CLIPS) {
        const p = R[clip].proofs;
        for (const s of SCHEDULES) say(`${clip}, ${s.name}: ${p[s.key].defFrames} frames equal replay-clips' 2-loop export ${p[s.key].defSha.slice(0, 12)}…${p[s.key].extFrames ? `; ${p[s.key].extFrames} frames equal arm 1's export ${p[s.key].extSha.slice(0, 12)}…, built clean at ${p[s.key].manifestHead.slice(0, 7)}, frozen jitterPx ${fx(p[s.key].jitterPx, 6)} equal` : ""}`);
        say(`${clip}: seeds 1 and 2 give different rows: ${p.seedsDiffer}`);
    }
    const rec = R["pinball-bench-table.mp4"].reconcile;
    say(`#227's table clip, seed 3, common media times of frame and run: ${rec.commonMediaTimes}, jitterPx ${fx(rec.first, 3)} / ${fx(rec.second, 3)} (fatal unless 203.645 / 51.053)`);
    }
    say();
    say("## Per-frame rows, SHA-256");
    for (const clip of CLIPS) for (const [name, h] of R[clip].hashes) say(`${name}  ${h}`);

    for (const clip of CLIPS) {
        const c = R[clip];
        say();
        say(`# ${clip}, ${c.width} x ${c.height}, ${c.nFrames} frames, loop ${fx(c.clipDurationS, 3)} s, median period ${fx(c.periodS * 1000, 2)} ms`);
        for (const s of SCHEDULES) {
            const runs = c.results.filter((r) => r.schedule === s.key);
            say();
            say(`## ${clip}, ${s.name}: counts over seeds 1 to 8, min / median / max`);
            const count = (f) => span(runs.map(f), 0);
            say(`frames ${count((r) => r.frames)}; counted ${count((r) => r.counted)}; ok in the counted loops ${count((r) => r.ok)}; common set ${count((r) => r.common)}`);
            for (const a of ARMS) say(`ok frames with no corners, ${a}: ${count((r) => r.noCorners[a])}`);
            say(`ok frames whose grid is not in front (inFront false): CF ${count((r) => r.behindCf)}; IPPE ${count((r) => r.behindIppe)}`);
            say(`flagged on the control arm ${count((r) => r.flagged)}; flagged on any arm ${count((r) => r.flaggedAny)}`);
            say(`largest corner distance outside the frame, px: H ${span(runs.map((r) => r.worst.H), 1)}; IPPE ${span(runs.map((r) => r.worst.IPPE), 1)}; CF ${span(runs.map((r) => r.worst.CF), 1)}; FILTER ${span(runs.map((r) => r.worst.FILTER), 1)}`);
            say(`tilt from CF, deg: min ${span(runs.map((r) => r.tilt?.min), 2)}; p50 ${span(runs.map((r) => r.tilt?.p50), 2)}; max ${span(runs.map((r) => r.tilt?.max), 2)}`);
            say(`IPPE's outcome: ${["selected", "ambiguous", "no-candidate-in-front", "degenerate"].map((o) => `${o} ${count((r) => r.outcomes[o] ?? 0)}`).join("; ")}`);
            say(`distinct per-frame rows over the 8 seeds: ${new Set(runs.map((r) => r.rowsHash)).size}`);
            {
                const all = runs.flatMap((r) => r.switches).sort((a, b) => a - b);
                say(`the guard's estimator switches between consecutive posed frames, per run: ${count((r) => r.switches.length)}; CF to IPPE corner distance at a switch, all seeds together, min / median / max px: ${all.length ? `${fx(all[0], 2)} / ${fx(middle(all), 2)} / ${fx(all[all.length - 1], 2)}` : "none"}`);
            }
            for (const r of runs) {
                const seen = new Map();
                for (const f of r.flaggedList) {
                    const key = f.media.toFixed(6);
                    seen.set(key, { ...f, n: (seen.get(key)?.n ?? 0) + 1 });
                }
                for (const f of seen.values()) say(`flagged, seed ${r.seed}: media ${f.media.toFixed(3)} s, ${f.n} of the counted loops, ${f.state}, ${f.inliers} inliers, tilt ${fx(f.tilt, 1)}, ${f.outcome}; corner outside the frame, px: H ${fx(f.H, 0)}, CF ${fx(f.CF, 0)}, IPPE ${fx(f.IPPE, 0)}, FILTER ${fx(f.FILTER, 0)}`);
            }
            say(`loop boundaries in the counted loops with a pose ${count((r) => r.boundary)}; of them the filter passed through ${count((r) => r.boundaryPass)}`);
            say("| band | frames | IPPE fallback | filter: filtered | passed, DETECT | passed, TRACK | flagged |");
            for (const [b] of BANDS) {
                const g = (k) => count((r) => r.perBand[b][k]);
                say(`| ${b} | ${g("frames")} | ${g("fallback")} | ${g("filtered")} | ${g("passDetect")} | ${g("passTrack")} | ${g("flagged")} |`);
            }
            say("frames the guard hands to CF, all / IPPE already the closed form / pose changed:");
            for (const th of [T, T_LOW, rm.interpolatedDifference, rh.interpolated]) say(`  T ${fx(th, 2)} deg: ${count((r) => r.handed[th].frames)} | ${count((r) => r.handed[th].alreadyClosedForm)} | ${count((r) => r.handed[th].changed)}`);

            for (const [view, label] of [["common", "the common set"], ["clean", "the common set without the frames flagged on the control arm"], ["cleanAny", "the common set without the frames flagged on any arm (selects on the treatment: descriptive)"], ["trackOnly", "the common set's TRACK frames"]]) {
                say();
                say(`### ${clip}, ${s.name}, ${label}: min / median / max over the seeds, px`);
                const rowsFor = (getter, bandName) => {
                    const lines = [];
                    lines.push(`${bandName}: frames ${span(runs.map((r) => getter(r).frames), 0)}; windows ${span(runs.map((r) => getter(r).arms.H.jitterWindows), 0)}`);
                    for (const a of ARMS) lines.push(`  ${a}: jitter ${span(runs.map((r) => getter(r).arms[a].jitterPx))}; spread ${span(runs.map((r) => getter(r).arms[a].spreadPx))}`);
                    for (const [p, q] of PAIRS) {
                        const d = (key) => runs.map((r) => {
                            const u = getter(r).arms[p][key];
                            const v = getter(r).arms[q][key];
                            return u === null || v === null ? null : u - v;
                        });
                        const j = d("jitterPx");
                        const pos = nums(j).filter((x) => x > 0).length;
                        const neg = nums(j).filter((x) => x < 0).length;
                        lines.push(`  ${p} - ${q}: jitter ${span(j)} (above ${pos}, below ${neg}, of ${nums(j).length}); spread ${span(d("spreadPx"))}`);
                    }
                    const dist = DIST_NAMES.map((n) => `${n} ${span(runs.map((r) => getter(r).distances[n]))}`).join("; ");
                    lines.push(`  distance, median, not the metric: ${dist}`);
                    return lines;
                };
                for (const l of rowsFor((r) => r.read[view].whole, "whole")) say(l);
                say(`  range over the seeds, max - min, unrounded to 6 places, jitter: ${ARMS.map((a) => {
                    const v = nums(runs.map((r) => r.read[view].whole.arms[a].jitterPx));
                    return `${a} ${fx(Math.max(...v) - Math.min(...v), 6)}`;
                }).join("; ")}`);
                for (const g of Object.keys(runs[0].read[view].groups)) for (const l of rowsFor((r) => r.read[view].groups[g], `group ${g}`)) say(l);
                for (const [b] of BANDS) for (const l of rowsFor((r) => r.read[view].bands[b], `band ${b}`)) say(l);
            }

            say();
            say(`### ${clip}, ${s.name}, per seed, the common set, whole: jitter px`);
            say("| seed | common | windows | H | IPPE | CF | GUARD | FILTER | H without flagged | IPPE without | CF without | FILTER without | flagged |");
            for (const r of runs) {
                const w = r.read.common.whole.arms;
                const n = r.read.clean.whole.arms;
                say(`| ${r.seed} | ${r.common} | ${w.H.jitterWindows} | ${fx(w.H.jitterPx)} | ${fx(w.IPPE.jitterPx)} | ${fx(w.CF.jitterPx)} | ${fx(w.GUARD.jitterPx)} | ${fx(w.FILTER.jitterPx)} | ${fx(n.H.jitterPx)} | ${fx(n.IPPE.jitterPx)} | ${fx(n.CF.jitterPx)} | ${fx(n.FILTER.jitterPx)} | ${r.flagged} |`);
            }
            say(`### ${clip}, ${s.name}, per seed, each arm's own counted frames, never a comparison: jitter px`);
            say("| seed | H | IPPE | CF | GUARD | FILTER |");
            for (const r of runs) say(`| ${r.seed} | ${ARMS.filter((a) => a !== "GUARD_LOW").map((a) => fx(r.ownWhole[a].jitterPx)).join(" | ")} |`);
            say(`### ${clip}, ${s.name}, compareExports on each pair against the common set's whole figure: largest |difference| over the seeds, px`);
            for (const a of ["CF", "GUARD", "FILTER"]) {
                const diff = runs.map((r) => Math.abs(r.pairs[a].arm - r.read.common.whole.arms[a].jitterPx));
                const diffI = runs.map((r) => Math.abs(r.pairs[a].ippe - r.read.common.whole.arms.IPPE.jitterPx));
                say(`${a}: ${fx(Math.max(...diff), 6)}; IPPE beside it: ${fx(Math.max(...diffI), 6)}; common media times ${span(runs.map((r) => r.pairs[a].commonMediaTimes), 0)}`);
            }
        }
    }

    if (TILT) return;
    say();
    say("# Arithmetic, not a measurement: the rotation layer's steady lag at a constant rate, in-plane, from the registered values");
    say("One Euro at a constant rate w, step period te: fc = minCutOff + beta * w * (1 + 1 / r), r = 2 pi fc te; lag = w / (2 pi fc). A fixed point, te of the static clip.");
    const st = R["pinball-static.mp4"];
    const lever = middle(st.results.filter((r) => r.schedule === "every").map((r) => r.lever));
    say(`the static clip's median corner distance from the target's centre: ${fx(lever, 1)} px`);
    say("| rate, deg/s | fc, Hz | lag, deg | lag at the corners, px |");
    for (const deg of [1, 5, 10, 30, 60, 90]) {
        const w = (deg * Math.PI) / 180;
        const te = st.periodS;
        let fc = 1;
        for (let i = 0; i < 200; i++) {
            const r = 2 * Math.PI * fc * te;
            fc = 1 + 10 * w * (1 + 1 / r);
        }
        const lag = w / (2 * Math.PI * fc);
        say(`| ${deg} | ${fx(fc, 2)} | ${fx((lag * 180) / Math.PI, 3)} | ${fx(lag * lever, 2)} |`);
    }
}

// =============================================================================================
// The tilt profile's report: questions A to E, in the record's order.
// =============================================================================================
function reportTilt(R) {
    const fx = (v, d = 3) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
    const nums = (xs) => xs.filter((x) => x !== null && x !== undefined);
    const span = (xs, d = 3) => {
        const v = nums(xs);
        if (v.length === 0) return "n/a";
        return `${fx(Math.min(...v), d)} / ${fx(medianOf(v), d)} / ${fx(Math.max(...v), d)}${v.length < xs.length ? ` (${v.length} of ${xs.length})` : ""}`;
    };
    /** The maintainer-side check's ranges: OpenCV SIFT, outside this repository, on the originals. */
    const SIDE = { "pinball-tilt-cross.mp4": [3.4, 13.0], "pinball-tilt-mid.mp4": [15.0, 23.5], "pinball-tilt-sweep.mp4": [20.4, 35.5] };
    say();
    say("# The focal length the guard reads through");
    say(`intrinsics(w, h) is a 60 deg horizontal field of view, f = (w / 2) / tan(30 deg). At the processing size of these clips, ${R[CLIPS[0]].width} x ${R[CLIPS[0]].height}: f = ${fx(R[CLIPS[0]].K[0], 4)} px, principal point (${fx(R[CLIPS[0]].K[2], 1)}, ${fx(R[CLIPS[0]].K[5], 1)}). At 720 px of width: ${fx(360 / Math.tan(Math.PI / 6), 4)} px.`);

    say();
    say("# A. What the clips contain");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].results.filter((r) => r.schedule === s.key);
            say();
            say(`## A, ${clip}, ${s.name}: min / median / max over the seeds`);
            say(`posed frames in the counted loops ${span(runs.map((r) => r.common), 0)} of ${span(runs.map((r) => r.counted), 0)}; TRACK ${span(runs.map((r) => r.trackFrames), 0)}; share in TRACK ${span(runs.map((r) => r.trackFrames / r.common))}`);
            say(`loop wraps in the counted loops ${span(runs.map((r) => r.wraps), 0)}; of them a lock carried across (the first frame after the wrap is TRACK) ${span(runs.map((r) => r.crossedByLock), 0)}`);
            for (const [name, key] of [["all posed frames", "tiltFive"], ["TRACK frames", "tiltFiveTrack"]]) {
                say(`tilt from CF, ${name}, deg: ${["min", "p10", "p50", "p90", "max"].map((p) => `${p} ${span(runs.map((r) => r[key]?.[p]), 2)}`).join("; ")}`);
            }
            say("| seed | posed | TRACK | min | p10 | p50 | p90 | max | TRACK: min | p50 | max |");
            for (const r of runs) say(`| ${r.seed} | ${r.common} | ${r.trackFrames} | ${fx(r.tiltFive?.min, 2)} | ${fx(r.tiltFive?.p10, 2)} | ${fx(r.tiltFive?.p50, 2)} | ${fx(r.tiltFive?.p90, 2)} | ${fx(r.tiltFive?.max, 2)} | ${fx(r.tiltFiveTrack?.min, 2)} | ${fx(r.tiltFiveTrack?.p50, 2)} | ${fx(r.tiltFiveTrack?.max, 2)} |`);
            if (s.key !== "every") continue;
            say(`### A, ${clip}, every frame: tilt against media time, 0.5 s bins, each bin's median tilt, min / median / max over the seeds; frames and TRACK frames summed over the counted loops, min / max`);
            say("| from, s | frames | TRACK | tilt, deg |");
            const bins = [...new Set(runs.flatMap((r) => r.series.map((x) => x.bin)))].sort((a, b) => a - b);
            for (const b of bins) {
                const at = runs.map((r) => r.series.find((x) => x.bin === b) ?? null);
                const v = nums(at);
                say(`| ${fx(b * 0.5, 1)} | ${Math.min(...v.map((x) => x.frames))} / ${Math.max(...v.map((x) => x.frames))} | ${Math.min(...v.map((x) => x.track))} / ${Math.max(...v.map((x) => x.track))} | ${span(at.map((x) => x?.tilt), 2)} |`);
            }
        }
    }
    say();
    say("## A: beside the maintainer-side check (OpenCV SIFT on the originals, outside this repository): compared, not adopted. A difference over 1.5 deg at either end is marked FINDING.");
    say("| clip | maintainer-side | this repository, TRACK frames, every frame, median over the seeds of min and of max | difference at the two ends | all posed frames: the same | difference |");
    for (const clip of CLIPS) {
        const runs = R[clip].results.filter((r) => r.schedule === "every");
        const [lo, hi] = SIDE[clip];
        const cell = (key) => {
            const a = medianOf(nums(runs.map((r) => r[key]?.min)));
            const b = medianOf(nums(runs.map((r) => r[key]?.max)));
            const d = [a - lo, b - hi];
            return `${fx(a, 2)} to ${fx(b, 2)} | ${fx(d[0], 2)}, ${fx(d[1], 2)}${Math.abs(d[0]) > 1.5 || Math.abs(d[1]) > 1.5 ? " FINDING" : ""}`;
        };
        say(`| ${clip} | ${fx(lo, 1)} to ${fx(hi, 1)} | ${cell("tiltFiveTrack")} | ${cell("tiltFive")} |`);
    }

    say();
    say("# B. IPPE against CF, per tilt band, on the frames every arm posed. Cells: min / median / max over the seeds, px. above/below count the seeds; a seed is not an observation (the first record, \"What the seeds and loops are\"). The range includes 0 when min <= 0 <= max.");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].results.filter((r) => r.schedule === s.key);
            for (const [view, label] of [["common", "common set"], ["trackOnly", "TRACK frames"]]) {
                say();
                say(`## B, ${clip}, ${s.name}, ${label}`);
                say("| band | frames | windows | under H | IPPE | CF | CF - IPPE | above / below of n | includes 0 | corner distance CF to IPPE, median, not the metric | FILTER to IPPE, not the metric |");
                const line = (name, get) => {
                    const v = runs.map(get);
                    const d = v.map((x) => (x.arms.CF.jitterPx === null || x.arms.IPPE.jitterPx === null ? null : x.arms.CF.jitterPx - x.arms.IPPE.jitterPx));
                    const dn = nums(d);
                    const inc = dn.length === 0 ? "n/a" : Math.min(...dn) <= 0 && Math.max(...dn) >= 0 ? "yes" : "no";
                    say(`| ${name} | ${span(v.map((x) => x.frames), 0)} | ${span(v.map((x) => x.arms.H.jitterWindows), 0)} | ${span(v.map((x) => x.arms.H.jitterPx))} | ${span(v.map((x) => x.arms.IPPE.jitterPx))} | ${span(v.map((x) => x.arms.CF.jitterPx))} | ${span(d)} | ${dn.filter((x) => x > 0).length} / ${dn.filter((x) => x < 0).length} of ${dn.length} | ${inc} | ${span(v.map((x) => x.distances["CF-IPPE"]))} | ${span(v.map((x) => x.distances["FILTER-IPPE"]))} |`);
                };
                line("whole", (r) => r.read[view].whole);
                for (const g of [`below ${T}`, `${T} and above`]) line(g, (r) => r.read[view].groups[g]);
                for (const [b] of BANDS) {
                    if (runs.every((r) => r.read[view].bands[b].frames === 0)) continue;
                    line(b, (r) => r.read[view].bands[b]);
                }
            }
        }
    }

    say();
    say("# C. The guard on one crossing: counted, not judged");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].results.filter((r) => r.schedule === s.key);
            const jumps = runs.flatMap((r) => r.switches);
            const inFootage = runs.flatMap((r) => r.switchDetail.filter((x) => !x.atWrap));
            const atWrap = runs.flatMap((r) => r.switchDetail.filter((x) => x.atWrap));
            say();
            say(`## C, ${clip}, ${s.name}`);
            say(`frames handed to CF, T = ${T}: ${span(runs.map((r) => r.handed[T].frames), 0)} of ${span(runs.map((r) => r.common), 0)}; of them IPPE already the closed form ${span(runs.map((r) => r.handed[T].alreadyClosedForm), 0)}; pose changed ${span(runs.map((r) => r.handed[T].changed), 0)}`);
            say(`switches per run over the ${COUNTED.loopCount} counted loops: ${span(runs.map((r) => r.switchDetail.length), 0)}; in the footage ${span(runs.map((r) => r.switchDetail.filter((x) => !x.atWrap).length), 0)}; at a loop wrap, not a crossing in the footage ${span(runs.map((r) => r.switchDetail.filter((x) => x.atWrap).length), 0)}`);
            const q = (xs) => (xs.length === 0 ? "none" : `${fx(Math.min(...xs), 2)} / ${fx(medianOf(xs), 2)} / ${fx(Math.max(...xs), 2)}`);
            say(`corner jump CF to IPPE at a switch, all seeds together, a labelled summary: all ${q(jumps)} px; in the footage ${q(inFootage.map((x) => x.jump))} px; at a wrap ${q(atWrap.map((x) => x.jump))} px`);
            if (clip !== "pinball-tilt-cross.mp4") continue;
            say(`### C, ${clip}, ${s.name}: every switch in the footage, per run, media time in s (tilt before to after, deg; state); loops repeat the media times`);
            for (const r of runs) {
                const list = r.switchDetail.filter((x) => !x.atWrap).map((x) => `${fx(x.media, 3)} (${fx(x.tiltFrom, 2)} to ${fx(x.tiltTo, 2)}, ${x.state})`);
                say(`seed ${r.seed}: ${list.length}: ${list.join("; ") || "none"}`);
            }
            say(`### C, ${clip}, ${s.name}: distinct media times of a switch in the footage, per seed`);
            for (const r of runs) {
                const ms = [...new Set(r.switchDetail.filter((x) => !x.atWrap).map((x) => x.media))].sort((a, b) => a - b);
                say(`seed ${r.seed}: ${ms.length} distinct: ${ms.map((m) => fx(m, 3)).join(", ") || "none"}`);
            }
        }
    }

    say();
    say("# D. Planarity: the residual of the frame's inliers under its H, frame px at the processing size (203 x 360), every frame, the counted loops, seeds 1 to 8.");
    say("Read from a shadow run wrapping NftTracker.prototype.selected, compared with the plain run frame by frame (fatal). rmsError is what the result itself exposes: the TRACK fit's weighted RMS. Cells: min / median / max over the seeds of each seed's median over frames.");
    const staticP = JSON.parse(readFileSync(join(OUT_DIR, `${STATIC_CLIP.replace(/\.mp4$/, "")}.planarity.json`), "utf8"));
    const sources = [...CLIPS.map((clip) => [clip, R[clip].planar]), [`${STATIC_CLIP}, the reference`, staticP.planar]];
    for (const [name, planar] of sources) {
        say();
        say(`## D, ${name}`);
        say("| reading | frames | TRACK frames | inliers | median residual, all | p90 of the per-frame median | TRACK | DETECT | RMS of the inliers | the result's rmsError, TRACK |");
        const line = (label, get) => {
            const v = planar.map(get).filter((x) => x !== null);
            if (v.every((x) => x.frames === 0)) return;
            say(`| ${label} | ${span(v.map((x) => x.frames), 0)} | ${span(v.map((x) => x.trackFrames), 0)} | ${span(v.map((x) => x.inliers), 0)} | ${span(v.map((x) => x.median))} | ${span(v.map((x) => x.medianP90))} | ${span(v.map((x) => x.trackMedian))} | ${span(v.map((x) => x.detectMedian))} | ${span(v.map((x) => x.rms))} | ${span(v.map((x) => x.rmsError))} |`);
        };
        line("whole", (p) => p.whole);
        for (const [b] of BANDS) line(b, (p) => p.bands[b]);
        line("TRACK frames within 1 deg of the seed's maximum TRACK tilt", (p) => p.nearMaxTilt);
        if (name === "pinball-tilt-cross.mp4") line("media time 12.5 s and later", (p) => p.late);
        say(`maximum tilt read on a TRACK frame, deg: ${span(planar.map((p) => p.tiltMax), 2)}`);
    }

    say();
    say("# E. The assumed K against the guard's threshold: the characterisation's construction, rendered with f_true and estimated with intrinsics(270, 360)");
    const E = JSON.parse(readFileSync(join(OUT_DIR, "synthetic.json"), "utf8"));
    say(`render size 270 x 360, assumed f ${fx(E.assumed, 4)} px there (${fx(360 / Math.tan(Math.PI / 6), 4)} px at 720 px of width); the target's image scale is held at 0.45 frame px per target px (Z = f_true / 0.45), the construction's rule; e is against the rendered H, through the assumed K; the tilt read is CF's, as the guard reads it. The 1005 px is the maintainer's chessboard figure, outside this repository; no conclusion rests on it alone.`);
    say(`zero global Math.random reads across the construction: ${E.reads}. At f_true = assumed, every row equals the characterisation's table (fatal). closedFormPose equals the backend's poseFromHomography on ${E.cfEqual} of ${E.cfCompared} fits.`);
    for (const row of E.perF) {
        say();
        say(`## E, f_true ${row.label}: ${fx(row.f720, 1)} px at 720 px of width, ${fx(row.fRender, 3)} px at the render size, ${fx(row.f720 / (360 / Math.tan(Math.PI / 6)), 3)} x the assumed`);
        say("| true tilt | fits | refused | tilt read: min / median / max | median e(IPPE, selected) | median e(CF) | ratio | IPPE closer | beside it, not the rule: median rotation error against the rendered pose, deg: IPPE | CF | IPPE closer on rotation | CF to IPPE corner distance, median, frame px at 270 x 360, not the metric |");
        for (const r of row.rows) say(`| ${r.tilt} | ${r.n} | ${r.refused} | ${fx(r.readMin, 2)} / ${fx(r.readTilt, 2)} / ${fx(r.readMax, 2)} | ${fx(r.ippe, 3)} | ${fx(r.cf, 3)} | ${fx(r.ippe / r.cf, 2)} | ${r.closer} of ${r.n} | ${fx(r.rotIppe, 3)} | ${fx(r.rotCf, 3)} | ${r.rotCloser} of ${r.n} | ${fx(r.cornerDist, 3)} |`);
    }
    say();
    say("## E: the crossover over f_true, in the tilt as the guard reads it. A grid: the row where the rule first holds, its read tilt and the read tilt of the row before; 'stays' = it holds on every later row");
    say("| f_true at 720 px | medians cross: true tilt, read from / to | stays | IPPE closer on half: true tilt, read from / to | stays |");
    for (const row of E.perF) {
        const c = crossover(row.rows);
        const cell = (x) => (x.row === null ? "none on the grid | n/a" : `${x.trueTilt} deg, read ${fx(x.readBefore, 2)} to ${fx(x.read, 2)} | ${x.stays ? "yes" : "no"}`);
        say(`| ${fx(row.f720, 1)} | ${cell(c.medians)} | ${cell(c.half)} |`);
    }
    say();
    say("## E: beside it, the same two readings on the rotation error against the rendered pose, which the characterisation's table does not hold. Not the brief's rule: e reads the pose's reprojection through the assumed K, this reads the rotation");
    say("| f_true at 720 px | medians cross: true tilt, read from / to | stays | IPPE closer on half: true tilt, read from / to | stays |");
    for (const row of E.perF) {
        const c = crossover(row.rows.map((r) => ({ tilt: r.tilt, readTilt: r.readTilt, n: r.n, ippe: r.rotIppe, cf: r.rotCf, closer: r.rotCloser })));
        const cell = (x) => (x.row === null ? "none on the grid | n/a" : `${x.trueTilt} deg, read ${fx(x.readBefore, 2)} to ${fx(x.read, 2)} | ${x.stays ? "yes" : "no"}`);
        say(`| ${fx(row.f720, 1)} | ${cell(c.medians)} | ${cell(c.half)} |`);
    }
}

// =============================================================================================
// Question E: the characterisation's item 2 with a separate render K. Its construction is
// packages/nft-tracker/test/pose/c4_characterisation.test.ts, item 2; the renderer and the rigid
// view are imported from that test's own TypeScript through esbuild, and `fit` is copied, proved
// by the row-for-row comparison with the table at f_true = assumed (fatal).
// =============================================================================================
async function synthetic() {
    const require = createRequire(join(ROOT, "package.json"));
    const esbuild = require("esbuild");
    const pgmUrl = pathToFileURL(join(ROOT, "packages/nft-tracker/ground-truth/fixtures/pgm.ts")).href;
    const bundled = await esbuild.build({
        stdin: {
            contents: [
                `export { renderWarp } from "./packages/nft-tracker/ground-truth/fixtures/warped_frames.ts";`,
                `export { readPgm, TARGET_FIXTURE } from "./packages/nft-tracker/ground-truth/fixtures/pgm.ts";`,
                `export { grid, median, poseError, rigidView } from "./packages/nft-tracker/test/pose/pose_metric.ts";`,
            ].join("\n"),
            resolveDir: ROOT,
            loader: "ts",
        },
        bundle: true,
        format: "esm",
        platform: "node",
        write: false,
        define: { "import.meta.url": JSON.stringify(pgmUrl) },
        logLevel: "silent",
    });
    const code = bundled.outputFiles[0].text;
    const { renderWarp, readPgm, TARGET_FIXTURE, grid, median, poseError, rigidView } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const { selectPose, POSE_AMBIGUITY_SIGMA_TRACK_PX, DEFAULT_ALIGN_EPSILON, DEFAULT_ALIGN_MAX_ITERATIONS, DEFAULT_FIT_EPSILON, DEFAULT_FIT_MAX_ITERATIONS, DEFAULT_MAX_FIT_RMS, DEFAULT_MAX_FRAME_LEVELS, DEFAULT_MAX_OUTLIER_SHARE, DEFAULT_MIN_PATCH_ZNCC, DEFAULT_MIN_TRACKED_PATCHES, DEFAULT_PHOTOMETRIC, DEFAULT_TUKEY_C } = trackerPkg;
    const cv = await createJsfeatNextBackend();
    const CAMERA = { width: 270, height: 360 };
    const image = readPgm(TARGET_FIXTURE);
    const G = grid(image.width, image.height);
    const Ka = intrinsics(CAMERA.width, CAMERA.height);
    const decoded = decode(new Uint8Array(readFileSync(join(ROOT, "examples/targets/pinball.wnft"))));
    if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
    const shipped = trackTarget(decoded.target.patches, decoded.target.pyramid.scaleStep);
    const OPTIONS = {
        maxFrameLevels: DEFAULT_MAX_FRAME_LEVELS,
        align: { maxIterations: DEFAULT_ALIGN_MAX_ITERATIONS, epsilon: DEFAULT_ALIGN_EPSILON, photometric: DEFAULT_PHOTOMETRIC },
        fit: { maxIterations: DEFAULT_FIT_MAX_ITERATIONS, tukeyC: DEFAULT_TUKEY_C, epsilon: DEFAULT_FIT_EPSILON },
        minTrackedPatches: DEFAULT_MIN_TRACKED_PATCHES,
        maxOutlierShare: DEFAULT_MAX_OUTLIER_SHARE,
        maxFitRms: DEFAULT_MAX_FIT_RMS,
        minPatchZncc: DEFAULT_MIN_PATCH_ZNCC,
    };
    const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10 };
    let cfCompared = 0;
    let cfEqual = 0;
    /** The test's `fit`, copied: the render is the view's H, and the estimate and e read the assumed K. */
    function fit(v, seed) {
        const frame = renderWarp(image, v.H, { ...RENDER, seed });
        const r = trackFrame(frame, shipped, null, v.H, OPTIONS, null);
        if (!r.ok) return null;
        const n = r.stats.inliers;
        const src = new Float64Array(2 * n);
        const dst = new Float64Array(2 * n);
        for (let i = 0, k = 0; i < r.weights.length; i++) {
            if (!(r.weights[i] > 0)) continue;
            src[2 * k] = r.correspondences.src[2 * i];
            src[2 * k + 1] = r.correspondences.src[2 * i + 1];
            dst[2 * k] = r.correspondences.dst[2 * i];
            dst[2 * k + 1] = r.correspondences.dst[2 * i + 1];
            k++;
        }
        const s = selectPose(r.H, Ka, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
        const oracle = cv.poseFromHomography(r.H, Ka);
        const cf = closedFormPose(r.H, Ka);
        cfCompared++;
        if (cf.R.every((x, i) => x === oracle.R[i]) && cf.t.every((x, i) => x === oracle.t[i])) cfEqual++;
        const pc = targetCorners(image.width, image.height);
        return { eSelected: poseError(Ka, s.pose, v.H, G), eOracle: poseError(Ka, oracle, v.H, G), r: r.stats.rmsError, read: tiltOf(cf.R), rotSelected: rotationAngle(s.pose.R, v.R), rotOracle: rotationAngle(oracle.R, v.R), corners: cornerDistance(poseCorners({ ...s.pose, good: true }, Ka, pc), poseCorners({ ...oracle, good: true }, Ka, pc)) };
    }
    const TILTS = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50];
    const assumed720 = 360 / Math.tan(Math.PI / 6);
    const POINTS = [["the assumed value", assumed720], ["800", 800], ["1005", 1005], ["1200", 1200]];
    const perF = [];
    const { reads } = countGlobalRandomReads(() => {
        for (const [label, f720] of POINTS) {
            // At the assumed value K is the assumed K itself, not a rebuilt one.
            const K = label === "the assumed value" && BREAK !== "e-render-k" ? Ka : renderK(Ka, CAMERA.width, BREAK === "e-render-k" && label === "the assumed value" ? f720 * 1.01 : f720);
            const Z = K[0] / 0.45;
            const rows = [];
            for (const tiltDeg of TILTS) {
                const fits = [];
                let refused = 0;
                for (const azimuthDeg of tiltDeg === 0 ? [0] : [0, 45, 90, 135]) {
                    for (const rollDeg of [0, 15]) {
                        for (const shift of [[0, 0], [30, -20]]) {
                            const v = rigidView(K, image, { tiltDeg, azimuthDeg, rollDeg, shift, Z });
                            for (const seed of [1, 2, 3]) {
                                const f = fit(v, seed);
                                if (f) fits.push(f);
                                else refused++;
                            }
                        }
                    }
                }
                const read = fits.map((f) => f.read).sort((a, b) => a - b);
                rows.push({
                    tilt: tiltDeg,
                    n: fits.length,
                    refused,
                    over: fits.filter((f) => f.eSelected > f.eOracle + f.r).length,
                    ippe: median(fits.map((f) => f.eSelected)),
                    cf: median(fits.map((f) => f.eOracle)),
                    closer: fits.filter((f) => f.eSelected <= f.eOracle).length,
                    readTilt: medianOf(read),
                    cornerDist: medianOf(fits.map((f) => f.corners)),
                    rotIppe: medianOf(fits.map((f) => f.rotSelected)),
                    rotCf: medianOf(fits.map((f) => f.rotOracle)),
                    rotCloser: fits.filter((f) => f.rotSelected <= f.rotOracle).length,
                    readMin: read[0] ?? null,
                    readMax: read[read.length - 1] ?? null,
                });
            }
            perF.push({ label, f720, fRender: K[0], rows });
            lap(`synthetic: f_true ${label}`);
        }
    });
    if (reads !== 0) fatal(`synthetic: ${reads} reads of the global Math.random`);
    // The construction at the assumed value is the characterisation: every row, as that table prints it.
    perF[0].rows.forEach((r, i) => {
        const w = TABLE[i];
        const got = `${r.tilt} ${r.n} ${r.over} ${r.ippe.toFixed(3)} ${r.cf.toFixed(3)} ${(r.ippe / r.cf).toFixed(2)} ${r.closer}`;
        const want = `${w.tilt} ${w.n} ${w.over} ${w.ippe.toFixed(3)} ${w.cf.toFixed(3)} ${w.ratio.toFixed(2)} ${w.closer}`;
        if (got !== want) fatal(`synthetic: at f_true = assumed the row is "${got}", the characterisation's "${want}"`);
    });
    writeFileSync(join(OUT_DIR, "synthetic.json"), JSON.stringify({ assumed: Ka[0], reads, cfCompared, cfEqual, perF }));
    lap("synthetic: done");
}

// =============================================================================================
// --post-run: reads of the run's own per-frame rows, added after its stdout had been read, and
// constructed cases of what the metric reads under rotation. Nothing here runs a tracker.
// =============================================================================================
function postRun(dir) {
    const fx = (v, d = 3) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
    const middle = (xs) => {
        const v = [...xs].sort((a, b) => a - b);
        const n = v.length;
        return n === 0 ? null : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    };
    const span = (xs, d = 3) => {
        const v = xs.filter((x) => x !== null && x !== undefined);
        if (v.length === 0) return "n/a";
        return `${fx(Math.min(...v), d)} / ${fx(middle(v), d)} / ${fx(Math.max(...v), d)}${v.length < xs.length ? ` (${v.length} of ${xs.length})` : ""}`;
    };
    say(`# ${SCRIPT} --post-run`);
    say(`this script's source, SHA-256: ${sha256(readFileSync(fileURLToPath(import.meta.url)))}`);

    if (!TILT) {
    say();
    say("## Constructed: what the frozen metric reads under rotation, and of a lag or an attenuation there");
    const R0 = 131.8;
    const fps = 30;
    const corners = (angle) =>
        [0, 1, 2, 3].map((c) => {
            const a = angle + c * (Math.PI / 2);
            return [R0 * Math.cos(a), R0 * Math.sin(a)];
        });
    const path = (f) => Array.from({ length: 10 * fps }, (_, i) => ({ mediaTimeSeconds: i / fps, corners: corners(f(i / fps)) }));
    const rad = (d) => (d * Math.PI) / 180;
    say("| rate, deg/s | jitter of the arc, px | jitter of the same arc 0.5 deg behind, px | difference, px |");
    for (const deg of [5, 10, 30, 60, 90]) {
        const w = rad(deg);
        const a = cornerJitter(path((t) => w * t)).jitterPx;
        const b = cornerJitter(path((t) => w * t - rad(0.5))).jitterPx;
        say(`| ${deg} | ${fx(a, 4)} | ${fx(b, 4)} | ${fx(b - a, 6)} |`);
    }
    say("| oscillation about the axis, amplitude deg at Hz | jitter, px | jitter at 0.8 of the amplitude, px | jitter, 0.8 of the amplitude and 50 ms behind, px |");
    for (const [amp, hz] of [[5, 0.5], [5, 1], [10, 1]]) {
        const sine = (k, lag) => (t) => rad(amp) * k * Math.sin(2 * Math.PI * hz * (t + lag));
        say(`| ${amp} at ${hz} | ${fx(cornerJitter(path(sine(1, 0))).jitterPx, 4)} | ${fx(cornerJitter(path(sine(0.8, 0))).jitterPx, 4)} | ${fx(cornerJitter(path(sine(0.8, -0.05))).jitterPx, 4)} |`);
    }
    }

    say();
    say("## Are the counted loops copies, and do the seeds share frames");
    const scheduleKeys = ["every", "15", "25"];
    const rowsOf = (stem, s, seed) =>
        readFileSync(join(dir, `${stem}-${s}-s${seed}.jsonl`), "utf8")
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l));
    for (const clip of CLIPS) {
        const stem = clip.replace(/\.mp4$/, "");
        const res = JSON.parse(readFileSync(join(dir, `${stem}.result.json`), "utf8"));
        const dur = res.clipDurationS * 1000;
        const loopOf = (r) => Math.floor(r.stamp / dur + 1e-9);
        for (const s of scheduleKeys) {
            const all = SEEDS.map((seed) => rowsOf(stem, s, seed));
            const distinct = all.map((rows) => {
                const sig = [1, 2, 3, 4].map((l) => JSON.stringify(rows.filter((r) => loopOf(r) === l).map((r) => [r.media, r.state, r.H ?? null])));
                return new Set(sig).size;
            });
            let line = `${stem}, ${s}: distinct loops among the 4 counted, seeds 1 to 8: ${distinct.join(", ")}`;
            if (s === "every") {
                let some = 0;
                let same = 0;
                for (let k = 0; k < all[0].length; k++) {
                    if (loopOf(all[0][k]) < 1 || loopOf(all[0][k]) > 4) continue;
                    const tr = all.map((rows) => rows[k]).filter((r) => r.state === "TRACK");
                    if (tr.length === 0) continue;
                    some++;
                    if (tr.length === 8 && new Set(tr.map((r) => JSON.stringify(r.H))).size === 1) same++;
                }
                line += `; frames TRACK in some seed ${some}, with one H in all 8 seeds, bit for bit, ${same}`;
            }
            say(line);
        }
    }

    say();
    if (TILT) {
        say("## Leave one media time out, per tilt band: CF - IPPE, jitter, without the seed's most influential media time in that band");
        say("As below; here the frames read are one band's, so a deletion can also empty a window. min / median / max over the seeds.");
        say("| clip | schedule | frames read | band | CF - IPPE as read | without it | most often that media time, s (seeds) | state, inliers, tilt, CF to IPPE px, at the first such seed |");
        for (const clip of CLIPS) {
            const stem = clip.replace(/\.mp4$/, "");
            const res = JSON.parse(readFileSync(join(dir, `${stem}.result.json`), "utf8"));
            for (const s of scheduleKeys) {
                const runs = SEEDS.map((seed) => {
                    const rows = rowsOf(stem, s, seed);
                    return countedLoopFrames(rows.map((r) => ({ mediaTimeSeconds: r.media, r })), { clipDurationS: res.clipDurationS, ...COUNTED });
                });
                for (const [viewName, viewTest] of [["common set", (r) => r.ok], ["TRACK frames", (r) => r.state === "TRACK"]]) {
                    for (const [band] of BANDS) {
                        const base = [];
                        const without = [];
                        const who = [];
                        for (const frames of runs) {
                            const inBand = frames.filter((f) => viewTest(f.r) && f.r.tilt !== null && f.r.tilt !== undefined && bandOf(f.r.tilt) === band);
                            // The whole counted set goes in and `include` selects, as the first probe's reads do:
                            // the frozen metric reads the loop's wraps from the frames it is given.
                            const kept = new Set(inBand.map((f) => f.r.k));
                            const armOf = (a) => frames.map((f) => ({ mediaTimeSeconds: f.mediaTimeSeconds, k: f.r.k, media: f.r.media, corners: f.r.corners?.[a] ?? null }));
                            const cf = armOf("CF");
                            const ippe = armOf("IPPE");
                            const j = (arr, m) => cornerJitter(arr, { include: (x) => kept.has(x.k) && x.media !== m, clipDurationS: res.clipDurationS }).jitterPx;
                            const d = (m) => {
                                const u = j(cf, m);
                                const v = j(ippe, m);
                                return u === null || v === null ? null : u - v;
                            };
                            const b = d(null);
                            base.push(b);
                            if (b === null) {
                                without.push(null);
                                who.push(null);
                                continue;
                            }
                            let best = null;
                            for (const m of new Set(inBand.map((f) => f.r.media))) {
                                const x = d(m);
                                if (x === null) continue;
                                if (best === null || Math.abs(x - b) > Math.abs(best.x - b)) best = { x, m };
                            }
                            without.push(best === null ? null : best.x);
                            if (best === null) {
                                who.push(null);
                                continue;
                            }
                            const f = inBand.find((g) => g.r.media === best.m).r;
                            who.push({ m: best.m, state: f.state, inliers: f.inliers, tilt: f.tilt, dist: cornerDistance(f.corners.CF, f.corners.IPPE) });
                        }
                        if (base.every((x) => x === null)) continue;
                        const tally = new Map();
                        for (const w of who) if (w) tally.set(w.m, (tally.get(w.m) ?? 0) + 1);
                        if (tally.size === 0) continue;
                        const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
                        const first = who.find((w) => w && w.m === top[0]);
                        say(`| ${stem} | ${s} | ${viewName} | ${band} | ${span(base)} | ${span(without)} | ${fx(top[0], 3)} (${top[1]} of 8) | ${first.state}, ${first.inliers}, ${fx(first.tilt, 1)} deg, ${fx(first.dist, 2)} px |`);
                    }
                }
            }
        }
        say();
    }
    say("## Leave one media time out: each pair against IPPE, jitter, without the seed's most influential media time");
    say("All occurrences of the media time are dropped, since the loops repeat it. Per the protocol's jackknife rule a deletion from a window at exactly 4 frames drops the window: n says how many of the frames read fall in that second of one loop. min / median / max over the seeds.");
    say("| clip | schedule | frames read | reading | pair | as read | without it | most often that media time, s (seeds) | state, inliers, tilt, CF to IPPE px, n, at the first such seed |");
    const ARMSP = ["CF", "GUARD", "FILTER"];
    for (const clip of CLIPS) {
        const stem = clip.replace(/\.mp4$/, "");
        const res = JSON.parse(readFileSync(join(dir, `${stem}.result.json`), "utf8"));
        const clipDurationS = res.clipDurationS;
        for (const s of scheduleKeys) {
            const runs = SEEDS.map((seed) => rowsOf(stem, s, seed));
            const view = runs.map((rows) => {
                const rec = rows.map((r) => ({ mediaTimeSeconds: r.media, r }));
                return countedLoopFrames(rec, { clipDurationS, ...COUNTED });
            });
            for (const [viewName, viewTest] of [["common set", (r) => r.ok], ["TRACK frames", (r) => r.state === "TRACK"]]) {
                for (const [groupName, groupTest] of [["whole", () => true], [`below ${T}`, (r) => r.tilt < T], [`${T} and above`, (r) => r.tilt >= T]]) {
                    for (const arm of ARMSP) {
                        const base = [];
                        const without = [];
                        const who = [];
                        view.forEach((frames) => {
                            const armOf = (a) => frames.map((f) => ({ mediaTimeSeconds: f.mediaTimeSeconds, r: f.r, corners: f.r.corners[a] }));
                            const fa = armOf(arm);
                            const fi = armOf("IPPE");
                            const jit = (fr, test) => cornerJitter(fr, { include: (f) => viewTest(f.r) && groupTest(f.r) && test(f.r), clipDurationS }).jitterPx;
                            const d = (test) => {
                                const u = jit(fa, test);
                                const v = jit(fi, test);
                                return u === null || v === null ? null : u - v;
                            };
                            const b = d(() => true);
                            base.push(b);
                            if (b === null) {
                                without.push(null);
                                who.push(null);
                                return;
                            }
                            const times = [...new Set(frames.filter((f) => viewTest(f.r) && groupTest(f.r)).map((f) => f.r.media))];
                            let best = null;
                            for (const m of times) {
                                const x = d((r) => r.media !== m);
                                if (x === null) continue;
                                if (best === null || Math.abs(x - b) > Math.abs(best.x - b)) best = { x, m };
                            }
                            without.push(best === null ? null : best.x);
                            if (best === null) {
                                who.push(null);
                                return;
                            }
                            const f = frames.find((g) => g.r.media === best.m && viewTest(g.r) && groupTest(g.r)).r;
                            const n = frames.filter((g) => viewTest(g.r) && groupTest(g.r) && Math.floor(g.r.media) === Math.floor(best.m) && g.r.k >= f.k && g.r.k < f.k + res.nFrames).length;
                            who.push({ m: best.m, state: f.state, inliers: f.inliers, tilt: f.tilt, dist: cornerDistance(f.corners.CF, f.corners.IPPE), n });
                        });
                        if (base.every((x) => x === null)) continue;
                        const tally = new Map();
                        for (const w of who) if (w) tally.set(w.m, (tally.get(w.m) ?? 0) + 1);
                        if (tally.size === 0) continue;
                        const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
                        const first = who.find((w) => w && w.m === top[0]);
                        say(`| ${stem} | ${s} | ${viewName} | ${groupName} | ${arm} - IPPE | ${span(base)} | ${span(without)} | ${fx(top[0], 3)} (${top[1]} of 8) | ${first.state}, ${first.inliers}, ${fx(first.tilt, 1)} deg, ${fx(first.dist, 2)} px, n ${first.n} |`);
                    }
                }
            }
        }
    }
}
