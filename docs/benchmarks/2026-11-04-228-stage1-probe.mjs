/*
 *  2026-11-04-228-stage1-probe.mjs
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
 * #228's Stage 1 probe: a metric that reads the pose, on seeded replays of the three bundled
 * clips, against IPPE, the closed form, #133's guard and the filter. The computation behind
 * docs/benchmarks/2026-11-04-228-stage1-probe.md. A desktop replay, headless: not campaign data.
 * It measures and registers nothing, and no file under packages/<name>/src/ is changed.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --seed-policy frame --packages bundle --out <replay dir>/ext
 *     node scripts/replay-clips.mjs --seed 1 --seed-policy frame --packages bundle --out <replay dir>/def
 *     node docs/benchmarks/2026-11-04-228-stage1-probe.mjs --self-test
 *     node docs/benchmarks/2026-11-04-228-stage1-probe.mjs --replay <replay dir> --out <run dir>
 *     node docs/benchmarks/2026-11-04-228-stage1-probe.mjs --post-run <run dir>
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
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-04-228-stage1-probe.mjs";
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
    ["over 15", 15, Infinity],
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
    expect("band: 15", bandOf(15), "over 15");
    expect("band: 170", bandOf(170), "over 15");
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

// =============================================================================================
// The inputs and their hashes, at 84fd4ba.
// =============================================================================================
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
    ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
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
const SCHEDULES = [
    { name: "every frame", key: "every", stepMs: null, slug: "tracking-every-frame" },
    { name: "device, 15 ms step", key: "15", stepMs: 15, slug: "tracking-device-15-ms-step" },
    { name: "device, 25 ms step", key: "25", stepMs: 25, slug: "tracking-device-25-ms-step" },
];
/** Copied from scripts/replay-clips.mjs, lines 266 to 272 at 84fd4ba; proved by check D's schedules. */
const DEVICE_ACQUIRE_MS = { "pinball-static.mp4": 36.9, "pinball-bench.mp4": 20.4, "pinball-bench-table.mp4": 41.0 };
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
if (REPLAY_DIR === null) fatal("--replay <dir holding replay-clips' ext/ and def/ at --seed 1> is required");
if (CHILD !== null) {
    if (!CLIPS.includes(CHILD)) fatal(`--child ${CHILD}: not one of ${CLIPS.join(", ")}`);
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
    const clips = ONLY === null ? CLIPS : (arg("--clip") ? [arg("--clip")] : CLIPS);
    const codes = await Promise.all(
        clips.map(
            (clip) =>
                new Promise((done) => {
                    const p = spawn(process.execPath, [self, "--replay", REPLAY_DIR, "--out", OUT_DIR, "--child", clip, ...onlyArgs, ...breakArgs], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
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
    function run(schedule, seed, options, policy = "frame") {
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
        if (a.ticks.some((t) => t.ok && t.state === "TRACK") && filtered === 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: the filter filtered no frame`);
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
    const hashes = [];
    for (const [schedule, seed] of plan) {
        const m = measure(schedule, seed);
        const name = `${stem}-${schedule.key}-s${seed}`;
        writeFileSync(join(OUT_DIR, `${name}.jsonl`), m.text);
        hashes.push([name, sha256(m.text)]);
        if (seed === 1) {
            proofs[schedule.key] = proveAgainstReplay(schedule, m);
            // One seed run twice gives byte-identical per-frame rows; another seed must not.
            const again = measure(schedule, BREAK === "rerun-seed" ? 2 : 1);
            if (again.text !== m.text) fatal(`${clip}, ${schedule.name}, seed 1: two runs differ`);
            if (schedule.stepMs === null) {
                const other = measure(schedule, 2);
                if (clip !== "pinball-static.mp4" && other.text === m.text) fatal(`${clip}: seeds 1 and 2 give the same rows`);
                proofs.seedsDiffer = other.text !== m.text;
            }
        }
        const counted = countedLoopFrames(m.records, { clipDurationS, ...COUNTED });
        const kOf = new Map(m.records.map((r, k) => [r, k]));
        const countedKs = counted.map((f) => kOf.get(f));
        // #227's counts, at every seed.
        if (schedule.stepMs === null) {
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
        for (let j = 1; j < posedInOrder.length; j++) {
            const p = rowsByK[posedInOrder[j - 1]];
            const q = rowsByK[posedInOrder[j]];
            if (guardPick(p.tilt, T) !== guardPick(q.tilt, T)) switches.push(cornerDistance(q.corners.CF, q.corners.IPPE));
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
    writeFileSync(join(OUT_DIR, `${stem}.result.json`), JSON.stringify({ clip, width, height, nFrames: pts.length, clipDurationS, periodS: percentile(period, 50), results, proofs, hashes, reconcile }));
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
    say("## Check D: the proof against the replay, seed 1");
    for (const clip of CLIPS) {
        const p = R[clip].proofs;
        for (const s of SCHEDULES) say(`${clip}, ${s.name}: ${p[s.key].defFrames} frames equal replay-clips' 2-loop export ${p[s.key].defSha.slice(0, 12)}…${p[s.key].extFrames ? `; ${p[s.key].extFrames} frames equal arm 1's export ${p[s.key].extSha.slice(0, 12)}…, built clean at ${p[s.key].manifestHead.slice(0, 7)}, frozen jitterPx ${fx(p[s.key].jitterPx, 6)} equal` : ""}`);
        say(`${clip}: seeds 1 and 2 give different rows: ${p.seedsDiffer}`);
    }
    const rec = R["pinball-bench-table.mp4"].reconcile;
    say(`#227's table clip, seed 3, common media times of frame and run: ${rec.commonMediaTimes}, jitterPx ${fx(rec.first, 3)} / ${fx(rec.second, 3)} (fatal unless 203.645 / 51.053)`);
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
