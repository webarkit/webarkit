/*
 *  2026-11-07-228-133-stage3-metric-check.mjs
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
 * #228's implementation, checked against docs/benchmarks/2026-11-06-228-133-stage3-registration.md,
 * "Stage 3, B": M2, M3, M4, M7 and M8, and M5's scan of every replay export. M0, M1, M5 and M6 are
 * examples/test/pose-metric.test.mjs's, whose negatives run here too. Its results are recorded in
 * docs/benchmarks/2026-11-07-228-133-stage3-addendum-metric.md. A desktop replay, headless: not
 * campaign data. It registers nothing.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node docs/benchmarks/2026-11-07-228-133-stage3-metric-check.mjs --self-test
 *     node docs/benchmarks/2026-11-07-228-133-stage3-metric-check.mjs --prepare <replay dir>
 *     node docs/benchmarks/2026-11-07-228-133-stage3-metric-check.mjs --replay <replay dir> --out <run dir> > <stdout file>
 *     node docs/benchmarks/2026-11-07-228-133-stage3-metric-check.mjs --negatives <scratch dir> --replay <replay dir> > <stdout file>
 *
 * What it drives, as the probes and the guard's check did: scripts/replay-run.mjs's `replayRun`,
 * through the real `frameRecord`, per clip and seed, every frame, 6 loops, loops 1 to 4 counted,
 * under `frame` seeding, stamped on the continuous timeline. The arms are trackers on one run's
 * frames: OFF, its defaults, which is IPPE's arm; FILTER, `poseFilter`; ON, `poseGuard`, on the first
 * record's three clips. The closed form's arm is computed here from the exported `H`, as the
 * registration says.
 *
 * What is computed here and not by the module, so that the check can fail: `carriedPoseCorners`, the
 * repeat's lines 152 to 179 with their defects' branches taken out, and the common set.
 *
 * Every check is fatal, before any figure is printed. Timings, the head and the tree's state go to
 * stderr; stdout holds no path, clock or commit, so two runs give the same bytes. A known limitation,
 * as every derivation script's here: no test covers docs/, so its guards are its own checks.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-07-228-133-stage3-metric-check.mjs";
const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), "..", "..");
const REFERENCES = join(ROOT, "docs/benchmarks/2026-11-06-228-133-stage3-references.mjs");
const R_REPLAY = "98323f061ecef7022d536c22f024d374a119edcd8ce6af3927b37309f2c6b546";
const R_TRUTH = "d1d427f33ce819ab5760377dcb3999ba979b09ab402a51a830895e27203c4f8f";
const R_TRUTH_BYTES = 6026097;
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
/** A defect in the check's inputs, for exercising one the wrong way. Mutants of the code are --negatives'. */
const BREAK = arg("--break");
if (BREAK !== null && !["input-hash", "readme-hash"].includes(BREAK)) fatal(`--break ${BREAK}: unknown`);

// =============================================================================================
// The definitions: pure functions, each tested on constructed cases (--self-test).
// =============================================================================================

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
/** The repeat's `poseCorners`, line 171, as M2 carries it. `reproject` is the frozen `reprojectCorners`. */
function carriedPoseCorners(pose, K, points, reproject) {
    if (!pose.good) return null;
    for (const [x, y] of points) if (!(pose.R[6] * x + pose.R[7] * y + pose.t[2] > 0)) return null;
    return reproject(poseHomography(pose, K), points);
}
/** The first corner element at which two readings differ, by `Object.is`; null when none does. */
function cornersDiffer(a, b) {
    if (a === null || b === null) return a === b ? null : `${a === null ? "null" : "corners"} and ${b === null ? "null" : "corners"}`;
    if (a.length !== b.length) return `${a.length} and ${b.length} corners`;
    for (let c = 0; c < a.length; c++) {
        for (let axis = 0; axis < 2; axis++) {
            if (!Object.is(a[c][axis], b[c][axis])) return `corner ${c}, axis ${axis}: ${a[c][axis]} and ${b[c][axis]}`;
        }
    }
    return null;
}
const fx = (v, d = 3) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
const median = (xs) => {
    const v = [...xs].sort((a, b) => a - b);
    const n = v.length;
    return n === 0 ? null : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};
/** min / median / max over the seeds; one figure when the three print alike, as the registered tables do. */
function printed(xs, d) {
    const [a, b, c] = [Math.min(...xs), median(xs), Math.max(...xs)].map((v) => fx(v, d));
    return a === b && b === c ? a : `${a} / ${b} / ${c}`;
}
/** Always three: for a read beside the registered cells. */
const span = (xs, d = 0) => `${fx(Math.min(...xs), d)} / ${fx(median(xs), d)} / ${fx(Math.max(...xs), d)}`;
const cellBreach = (where, name, got, want) => (got === want ? null : `${where}: ${name} reads ${got}, registered ${want}`);
/** A frame's JSON with what a replay's clock writes taken out: `trackerTimings`. */
function maskFrame(f) {
    const { trackerTimings: _clock, ...rest } = f;
    return JSON.stringify(rest);
}
/** What each frame and summary of a version 2 export must hold: M5. Null, or what is wrong. */
function exportBreach(e) {
    if (e.metricsVersion !== 2) return `metricsVersion ${e.metricsVersion}`;
    for (const k of ["posePosedFrames", "poseJitterWindows", "poseJitterPx", "poseSpreadPx"]) {
        if (!(k in (e.runSummary ?? {}))) return `the summary has no ${k}`;
    }
    for (const [i, f] of (e.frames ?? []).entries()) {
        if (!("H" in f) || !("poseCorners" in f)) return `frame ${i} has no H or no poseCorners`;
        if (f.ok && f.H?.length !== 9) return `frame ${i} is ok with no nine-element H`;
        if (!f.ok && (f.H !== null || f.poseCorners !== null)) return `frame ${i} is not ok and carries H or poseCorners`;
    }
    return null;
}

function selfTest() {
    const fails = [];
    const expect = (what, got, want) => {
        if (!Object.is(got, want)) fails.push(`${what}: ${String(got)}, expected ${String(want)}`);
    };
    const K = [100, 0, 50, 0, 100, 60, 0, 0, 1];
    const I = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const pts = [[0, 0], [3, 0], [3, 2], [0, 2]];
    const reproject = (H, points) =>
        points.map(([x, y]) => {
            const w = H[6] * x + H[7] * y + H[8];
            return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
        });
    {
        const H = poseHomography({ R: I, t: [1, 2, 10] }, K);
        expect("K[r1 r2 t]: x", H[2], 600);
        expect("K[r1 r2 t]: y", H[5], 800);
        const c = carriedPoseCorners({ R: I, t: [1, 2, 10], good: true }, K, pts, reproject);
        expect("carried: a corner", c[2][0], 90);
        expect("carried: good false", carriedPoseCorners({ R: I, t: [1, 2, 10], good: false }, K, pts, reproject), null);
        expect("carried: behind", carriedPoseCorners({ R: I, t: [1, 2, -10], good: true }, K, pts, reproject), null);
        expect("carried: depth zero", carriedPoseCorners({ R: I, t: [1, 2, 0], good: true }, K, pts, reproject), null);
        expect("carried: depth NaN", carriedPoseCorners({ R: I, t: [1, 2, NaN], good: true }, K, pts, reproject), null);
    }
    expect("corners: equal", cornersDiffer([[1, 2]], [[1, 2]]), null);
    expect("corners: both null", cornersDiffer(null, null), null);
    if (cornersDiffer([[1, 2]], null) === null) fails.push("corners: one null must fire");
    if (cornersDiffer([[1, 2]], [[1, 2 + 1e-12]]) === null) fails.push("corners: one element must fire");
    if (cornersDiffer([[0, 2]], [[-0, 2]]) === null) fails.push("corners: +0 and -0 must fire");
    expect("printed: flat", printed([0.2704, 0.2701], 3), "0.270");
    expect("printed: a span", printed([1, 2, 3, 10], 0), "1 / 3 / 10");
    expect("printed: 3 digits", printed([4.284, 4.912, 10.72], 3), "4.284 / 4.912 / 10.720");
    expect("span: flat stays three", span([5, 5], 0), "5 / 5 / 5");
    expect("median", median([3, 1, 2]), 2);
    expect("cell: equal", cellBreach("x", "y", "1", "1"), null);
    if (cellBreach("x", "y", "1", "2") === null) fails.push("cell: a difference must fire");
    expect("mask: the clock", maskFrame({ a: 1, trackerTimings: { x: 1 } }), maskFrame({ a: 1, trackerTimings: { x: 2 } }));
    if (maskFrame({ a: 1 }) === maskFrame({ a: 2 })) fails.push("mask: another key must fire");
    {
        const good = () => ({
            metricsVersion: 2,
            runSummary: { posePosedFrames: 1, poseJitterWindows: 0, poseJitterPx: null, poseSpreadPx: 0 },
            frames: [
                { ok: true, H: new Array(9).fill(0), poseCorners: null },
                { ok: false, H: null, poseCorners: null },
            ],
        });
        expect("export: good", exportBreach(good()), null);
        const breach = (edit) => {
            const e = good();
            edit(e);
            return exportBreach(e) !== null;
        };
        expect("export: version", breach((e) => (e.metricsVersion = 1)), true);
        expect("export: a summary key", breach((e) => delete e.runSummary.poseSpreadPx), true);
        expect("export: a frame key", breach((e) => delete e.frames[0].poseCorners), true);
        expect("export: H short", breach((e) => e.frames[0].H.pop()), true);
        expect("export: H on a frame not ok", breach((e) => (e.frames[1].H = [])), true);
    }
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
// The registered tables, as printed.
// =============================================================================================
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4", "pinball-tilt-cross.mp4", "pinball-tilt-mid.mp4", "pinball-tilt-sweep.mp4"];
const FIRST_RECORD_CLIPS = CLIPS.slice(0, 3);
const TILT_CLIPS = CLIPS.slice(3);
/** M4's table: frames, windows, IPPE jitter, FILTER jitter, IPPE spread, FILTER spread. Null: "in M2". */
const M4 = {
    "pinball-static.mp4": ["1452", "52", "0.270", "0.227", "1.079", "1.057"],
    "pinball-bench.mp4": ["844 / 848 / 856", "36", "4.284 / 4.912 / 10.720", "4.355 / 4.982 / 10.757", "44.847 / 45.130 / 46.296", "44.881 / 45.164 / 46.326"],
    "pinball-bench-table.mp4": ["844 / 860 / 900", "28 / 32 / 36", "2.863 / 3.718 / 5.368", "2.845 / 3.705 / 5.355", "26.781 / 27.456 / 28.001", "26.786 / 27.460 / 28.004"],
    "pinball-tilt-cross.mp4": ["1668", "56", "0.300 / 0.302 / 0.305", null, null, null],
    "pinball-tilt-mid.mp4": ["2628", "88", "0.217", null, null, null],
    "pinball-tilt-sweep.mp4": ["3432 / 3466 / 3472", "116", "1.482 / 1.750 / 3.895", null, null, null],
};
/** M8: the frozen metric on the option's pose. */
const M8 = { "pinball-static.mp4": "0.129", "pinball-bench.mp4": "4.245 / 4.880 / 10.703", "pinball-bench-table.mp4": "2.420 / 3.397 / 5.193" };
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
    ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
    ["examples/videos/pinball-tilt-cross.mp4", "3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e"],
    ["examples/videos/pinball-tilt-mid.mp4", "f29c37d71fa074bc8ae4e8c94a89a2f9b6654e458a6d4b144ee5bdf85267e915"],
    ["examples/videos/pinball-tilt-sweep.mp4", "90c5af74401577b29f7090f07b9205d7d5e6524baed7f48d44a6dc9ea4eb9dcf"],
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
];
const BORROWED_MS = 36.9;
const BORROWED_LABEL = "acquisition BORROWED: 36.9 ms, the static clip's, not measured";
const DEVICE_DETECT_MS = 83.2;
const LOOPS = 6;
const COUNTED = Object.freeze({ firstLoop: 1, loopCount: 4 });
const SCHEDULES = [
    { key: "15", stepMs: 15, slug: "device-15-ms-step", name: "device, 15 ms step" },
    { key: "25", stepMs: 25, slug: "device-25-ms-step", name: "device, 25 ms step" },
];

const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 });
const treeState = () => ({ head: git("rev-parse", "HEAD").toString().trim(), diff: sha256(git("diff", "HEAD")), status: git("status", "--short").toString() });
const replayClips = (args, options = {}) => spawnSync(process.execPath, [join(ROOT, "scripts/replay-clips.mjs"), ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, ...options });
const SEEDED = ["--seed-policy", "frame", "--packages", "bundle"];

/** M7's refusals: the flag against each form. Null, or what is wrong; each row printed by the report. */
function refusalRows() {
    const rows = [];
    for (const extra of [["--external", "70"], ["--sequence", "x.json"], ["--transfer", "dir"], ["--device-ratio", "2"], ["--tracking-only"]]) {
        const r = replayClips(["--clips", "tilt", ...extra]);
        rows.push({ flag: extra[0], status: r.status, line: r.stderr.trim() });
    }
    const other = replayClips(["--clips", "other"]);
    rows.push({ flag: "--clips other", status: other.status, line: other.stderr.trim() });
    for (const row of rows) if (row.status !== 2) fatal(`M7: --clips tilt with ${row.flag}: exit ${row.status}, not refused`);
    return rows;
}

if (arg("--prepare") !== null) {
    await prepare(arg("--prepare"));
    process.exit(0);
}
if (argv.includes("--refusals")) {
    for (const row of refusalRows()) process.stdout.write(`${row.flag}: exit ${row.status}: ${row.line}\n`);
    process.exit(0);
}
if (arg("--negatives") !== null) {
    negatives(arg("--negatives"));
    process.stdout.write(out.join("\n") + "\n");
    process.exit(0);
}
for (const [rel, want0] of INPUTS) {
    const want = BREAK === "input-hash" && rel.endsWith("tilt-cross.mp4") ? "0".repeat(64) : want0;
    const p = join(ROOT, rel);
    if (!existsSync(p)) fatal(`${rel}: missing under ${ROOT}`);
    const got = sha256(readFileSync(p));
    if (got !== want) fatal(`${rel}: SHA-256 ${got}, expected ${want}`);
}
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { createJsfeatNextBackend, intrinsics } = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
const { NftTracker, decode, closedFormPose } = await imp("packages/nft-tracker/dist/index.js");
const metrics = await imp("examples/js/bench-metrics.mjs");
const { fitSize } = await imp("examples/js/pinball-shared.mjs");
const { replayRun, loopPeriod } = await imp("scripts/replay-run.mjs");
const { runSeeding, seedingRefusal, countGlobalRandomReads } = await imp("scripts/replay-seeding.mjs");
const { compareExports, countedLoopFrames, cornerJitter, METRICS_VERSION, PAGE_PROCESSING_BOX, reprojectCorners, summarizeRun, targetCorners } = metrics;
if (METRICS_VERSION !== 2) fatal(`METRICS_VERSION is ${METRICS_VERSION}`);

const REPLAY_DIR = arg("--replay");
const OUT_DIR = arg("--out");
const CHILD = arg("--child");
/** A part of the plan, for a negative: a seed, or all. */
const ONLY = arg("--only") ?? "all";
/** Which of M2, M4, M7 and M8 a negative reads; a counted run reads all. */
const CHECK = arg("--check") ?? "all";
const reads = (m) => CHECK === "all" || CHECK === m;
const NEGATIVE = argv.includes("--negative");
if (OUT_DIR === null) fatal("--out <run dir> is required");
if (REPLAY_DIR === null) fatal("--replay <the --prepare dir> is required");
if (CHILD !== null) {
    await child(CHILD);
    process.exit(0);
}
await main();
process.exit(0);

// =============================================================================================
// What the replay script must have written first.
// =============================================================================================
async function prepare(dir) {
    const start = treeState();
    process.stderr.write(`tree at the start: ${JSON.stringify(start)}\n`);
    if (start.status !== "") fatal(`the tree is not clean, and a counted run reads a build of a commit:\n${start.status}`);
    if (existsSync(dir)) fatal(`${dir} exists`);
    mkdirSync(join(dir, "tilt"), { recursive: true });
    const jobs = [
        { args: ["--external", "70", "--seed", "1", ...SEEDED, "--out", join(dir, "ext")] },
        { args: ["--seed", "1", ...SEEDED, "--out", join(dir, "def")] },
        { args: ["--sequence", join(ROOT, "docs/benchmarks/2026-10-13-tab9-m4-preflight-sync-wall.json"), "--seed", "1", ...SEEDED], stdoutTo: join(dir, "seq.stdout") },
        ...SEEDS.map((s) => ({ args: ["--clips", "tilt", "--seed", String(s), ...SEEDED, "--out", join(dir, "tilt", `s${s}`)] })),
    ];
    let next = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            await new Promise((done) => {
                const p = spawn(process.execPath, [join(ROOT, "scripts/replay-clips.mjs"), ...job.args], { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
                const chunks = [];
                p.stdout.on("data", (c) => chunks.push(c));
                p.on("exit", (code) => {
                    if (code !== 0) fatal(`replay-clips ${job.args.join(" ")}: exit ${code}`);
                    if (job.stdoutTo) writeFileSync(job.stdoutTo, Buffer.concat(chunks));
                    lap(job.args.slice(0, 4).join(" "));
                    done();
                });
            });
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const end = treeState();
    process.stderr.write(`tree at the end: ${JSON.stringify(end)}\n`);
    if (start.head !== end.head || start.diff !== end.diff || start.status !== end.status) fatal("the tree changed during --prepare");
}

// =============================================================================================
// The parent: the tree at both ends, M3 and M5's scan, one child per clip, the report.
// =============================================================================================
async function main() {
    const start = treeState();
    process.stderr.write(`tree at the start: ${JSON.stringify(start)}\n`);
    if (!NEGATIVE) {
        if (start.status !== "") fatal(`the tree is not clean, and a counted run reads a build of a commit:\n${start.status}`);
        if (arg("--clip") !== null || arg("--only") !== null || arg("--check") !== null) fatal("--clip, --only and --check are for --negative: a counted run is every clip and seed");
        if (existsSync(OUT_DIR)) fatal(`${OUT_DIR} exists, and a counted run reads no earlier run's results`);
    }
    mkdirSync(OUT_DIR, { recursive: true });
    const clips = arg("--clip") ? [arg("--clip")] : CLIPS;
    const pass = ["--replay", REPLAY_DIR, "--only", ONLY, "--check", CHECK, ...(NEGATIVE ? ["--negative"] : []), ...(BREAK === null ? [] : ["--break", BREAK])];
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
    if (BREAK === "readme-hash") checkM7Text();
    if (NEGATIVE) {
        process.stderr.write("a negative run: every check passed, which a negative must not\n");
        return;
    }
    const m3 = referencesM3();
    lap("M3");
    const scan = scanExports();
    lap("M5's scan");
    const m7 = checkM7Text();
    const refusals = refusalRows();
    const R = Object.fromEntries(CLIPS.map((clip) => [clip, JSON.parse(readFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`), "utf8"))]));
    const end = treeState();
    process.stderr.write(`tree at the end: ${JSON.stringify(end)}\n`);
    if (start.head !== end.head || start.diff !== end.diff || start.status !== end.status) fatal(`the tree changed during the run: ${JSON.stringify(start)} and ${JSON.stringify(end)}`);
    lap("all clips");
    report(R, m3, scan, m7, refusals);
    process.stdout.write(out.join("\n") + "\n");
}

/** M3: R-replay with the projection, without it, and R-truth, through the registered references script. */
function referencesM3() {
    const run = (args) => {
        const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
        if (r.status !== 0) fatal(`M3: the references script ${args.slice(1, 3).join(" ")}: exit ${r.status}: ${r.stderr.trim()}`);
        return r.stdout.trim().split(/\r?\n/);
    };
    const hashOf = (line) => line.split(": ").at(-1);
    const projected = run([REFERENCES, "--replay", REPLAY_DIR, "--v1-projection"]);
    const hash = hashOf(projected.at(-1));
    if (hash !== R_REPLAY) fatal(`M3: R-replay with --v1-projection is ${hash}, registered ${R_REPLAY}`);
    const plain = hashOf(run([REFERENCES, "--replay", REPLAY_DIR]).at(-1));
    if (plain === R_REPLAY) fatal("M3: without the projection the hash is still R-replay's: the export gained nothing");
    const truth = run(["--experimental-transform-types", REFERENCES, "--ground-truth", join(OUT_DIR, "truth.json")]).at(-1);
    const m = /^ground truth: (\d+) bytes, sha256 ([0-9a-f]{64})$/.exec(truth);
    if (!m) fatal(`M3: the ground truth printed "${truth}"`);
    if (m[2] !== R_TRUTH || Number(m[1]) !== R_TRUTH_BYTES) fatal(`M3: R-truth ${m[2]}, ${m[1]} bytes; registered ${R_TRUTH}, ${R_TRUTH_BYTES}`);
    const seq = readFileSync(join(REPLAY_DIR, "seq.stdout"), "utf8");
    if (!/replayed 3 times after a warm-up/.test(seq)) fatal("M3: --sequence on the committed export did not run");
    return { hash, outputs: projected.length - 1, plain, truthBytes: Number(m[1]), truth: m[2] };
}

/** M5's scan: every replay export's frames and summary, by the key. */
function scanExports() {
    const counts = {};
    const walk = (rel) => {
        const dir = join(REPLAY_DIR, rel);
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = `${rel}/${e.name}`;
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith(".json")) {
                const j = JSON.parse(readFileSync(join(REPLAY_DIR, p), "utf8"));
                const breach = exportBreach(j);
                if (breach !== null) fatal(`M5: ${p}: ${breach}`);
                if (j.packageSource?.manifestClean !== true) fatal(`${p}: built from a dirty tree`);
                const k = `${rel.split("/")[0]}, ${j.mode}`;
                counts[k] = counts[k] ?? { exports: 0, frames: 0, posed: 0 };
                counts[k].exports++;
                counts[k].frames += j.frames.length;
                counts[k].posed += j.frames.filter((f) => f.poseCorners).length;
            }
        }
    };
    for (const g of ["ext", "def", "tilt"]) walk(g);
    return counts;
}

/** M7: the three clips' SHA-256 as examples/README.md gives them. */
function checkM7Text() {
    const readme = readFileSync(join(ROOT, "examples/README.md"), "utf8");
    const rows = [];
    for (const clip of TILT_CLIPS) {
        const want = sha256(readFileSync(join(ROOT, "examples/videos", clip)));
        const entry = readme.indexOf(`**\`${clip}\`**`);
        const stated = /`([0-9a-f]{64})`/.exec(readme.slice(entry))?.[1];
        const given = BREAK === "readme-hash" ? "0".repeat(64) : stated;
        if (entry < 0 || given !== want) fatal(`M7: ${clip}: SHA-256 ${want}, examples/README.md gives ${given}`);
        rows.push(`${clip}: ${want}`);
    }
    return rows;
}

// =============================================================================================
// One clip: the arms on every seed, every check, a result file.
// =============================================================================================
async function child(clip) {
    // ---- decoding, copied from scripts/replay-clips.mjs, as the probes do; proved by check D below ----
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
    const tilt = TILT_CLIPS.includes(clip);
    lap(`${clip}: decoded ${frames.length} frames at ${width}x${height}`);

    /** One tracker over one schedule: its records through the real frameRecord, and every result as it came. */
    function run(seed, options, stepMs = null) {
        const results = [];
        const { value: records, reads: globals } = countGlobalRandomReads(() =>
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
                stepMs,
                order: null,
                options,
                probe: { frame: (_f, r) => results.push(r) },
                loops: LOOPS,
                acquireMs: BORROWED_MS,
                unwrapped: true,
                seeding: runSeeding(seed, "frame"),
            }),
        );
        if (globals !== 0) fatal(`${clip}, seed ${seed}: ${globals} reads of the global Math.random`);
        if (results.length !== records.length) fatal(`${clip}: ${results.length} results, ${records.length} records`);
        return { records, results };
    }

    /** M2 on one arm: each frame's record against the carried function on that frame's own pose. */
    function checkCorners(arm, label, seed) {
        let posed = 0;
        for (let k = 0; k < arm.records.length; k++) {
            const r = arm.results[k];
            const want = r.ok ? carriedPoseCorners(r.pose, K, targetPoints, reprojectCorners) : null;
            const d = cornersDiffer(arm.records[k].poseCorners, want);
            if (d !== null) fatal(`${clip}, seed ${seed}, frame ${k}: M2, ${label}: ${d}`);
            if (want !== null) posed++;
        }
        return posed;
    }

    /** The frames' reading, in one arm's corners, of the counted loops. */
    const counted = (records) => countedLoopFrames(records, { clipDurationS, ...COUNTED });
    const asFrames = (records, cornersOf) => counted(records).map((f) => ({ mediaTimeSeconds: f.mediaTimeSeconds, f, corners: cornersOf(f) }));

    /** M4's arms and common set from one seed's records: IPPE's and H's from OFF, the closed form's from the exported H. */
    function cells(offRecords, filterRecords, onRecords) {
        const closedForm = new Map();
        const cf = (f) => {
            if (!closedForm.has(f)) closedForm.set(f, f.H ? closedFormPose(Float64Array.from(f.H), K) : null);
            return closedForm.get(f);
        };
        const cfCorners = (f) => {
            const pose = cf(f);
            return pose === null ? null : carriedPoseCorners(pose, K, targetPoints, reprojectCorners);
        };
        const countedOff = counted(offRecords);
        const countedFilter = counted(filterRecords);
        const countedOn = onRecords === null ? null : counted(onRecords);
        if (countedOff.length !== countedFilter.length) fatal(`${clip}: M4: ${countedOff.length} counted frames, FILTER's ${countedFilter.length}`);
        const filterOf = new Map(countedOff.map((f, j) => [f, countedFilter[j]]));
        const onOf = countedOn === null ? null : new Map(countedOff.map((f, j) => [f, countedOn[j]]));
        const common = new Set(
            countedOff.filter(
                (f) =>
                    f.ok &&
                    f.corners !== null &&
                    f.poseCorners !== null &&
                    filterOf.get(f).poseCorners !== null &&
                    cf(f).good &&
                    cfCorners(f) !== null &&
                    (onOf === null || onOf.get(f).poseCorners !== null),
            ),
        );
        const jitter = (cornersOf) => cornerJitter(asFrames(offRecords, cornersOf), { include: (x) => common.has(x.f), clipDurationS });
        const ippe = jitter((f) => f.poseCorners);
        const filter = jitter((f) => filterOf.get(f).poseCorners);
        const guard = onOf === null ? null : jitter((f) => onOf.get(f).poseCorners);
        // The descriptive reading, through compareExports' own arithmetic (M6), on the common set.
        const asExport = (cornersOf) => ({
            metricsVersion: 2,
            source: "bundled",
            bundledClip: clip,
            processingResolution: { width, height },
            clipDurationS,
            frames: countedOff.map((f) => ({ mediaTimeSeconds: f.mediaTimeSeconds, state: f.state, ok: f.ok, corners: f.corners, poseCorners: common.has(f) ? cornersOf(f) : null })),
        });
        const ippeExport = asExport((f) => f.poseCorners);
        const distance = (cornersOf) => compareExports(ippeExport, asExport(cornersOf)).pose?.poseCornerDistancePx ?? null;
        return {
            frames: ippe.posedFrames,
            windows: ippe.jitterWindows,
            ippe: ippe.jitterPx,
            filter: filter.jitterPx,
            ippeSpread: ippe.spreadPx,
            filterSpread: filter.spreadPx,
            guard: guard?.jitterPx ?? null,
            distanceCF: distance(cfCorners),
            distanceFilter: distance((f) => filterOf.get(f).poseCorners),
        };
    }
    /** "The summary": what a frame with corners and no poseCorners does to the two families, one arm. */
    function families(records) {
        const s = summarizeRun(records, { clipDurationS, loops: COUNTED, path: "sync" });
        const c = counted(records);
        const own = cornerJitter(
            c.map((f) => ({ ...f, corners: f.poseCorners })),
            { clipDurationS },
        );
        // M4's other half: the summary's keys are the frozen metric on poseCorners, over these frames.
        for (const [mine, key] of [[own.posedFrames, "posePosedFrames"], [own.jitterWindows, "poseJitterWindows"], [own.jitterPx, "poseJitterPx"], [own.spreadPx, "poseSpreadPx"]]) {
            if (!Object.is(mine, s[key])) fatal(`${clip}: M4: the summary's ${key} ${s[key]}, the frozen metric on poseCorners ${mine}`);
        }
        return {
            cornersNoPose: c.filter((f) => f.corners && !f.poseCorners).length,
            posedFrames: s.posedFrames,
            posePosedFrames: s.posePosedFrames,
            jitterWindows: s.jitterWindows,
            poseJitterWindows: s.poseJitterWindows,
            jitterPx: s.jitterPx,
            poseJitterPx: s.poseJitterPx,
        };
    }
    /** Check D, and M7's: the arm's frames against replay-clips' own export of the same run. */
    function proveAgainstReplay(records, file, seed, label) {
        const p = join(REPLAY_DIR, file);
        if (!existsSync(p)) fatal(`${file}: missing`);
        const e = JSON.parse(readFileSync(p, "utf8"));
        if (e.seed !== seed || e.seedPolicy !== "frame") fatal(`${file}: seed ${e.seed}, policy ${e.seedPolicy}`);
        if (e.metricsVersion !== 2) fatal(`${file}: metricsVersion ${e.metricsVersion}`);
        if (!NEGATIVE && e.packageSource.manifestClean !== true) fatal(`${file}: built from a dirty tree`);
        if (e.frames.length !== records.length) fatal(`${clip}: ${label}: ${records.length} frames, the export's ${e.frames.length}`);
        for (let k = 0; k < records.length; k++) {
            if (maskFrame(JSON.parse(JSON.stringify(records[k]))) !== maskFrame(e.frames[k])) fatal(`${clip}: ${label}: frame ${k} differs from the export's`);
        }
        return e;
    }

    const seeds = ONLY === "all" ? SEEDS : [Number(ONLY)];
    const rows = [];
    for (const seed of seeds) {
        const off = run(seed, {});
        const filter = run(seed, { poseFilter: { mode: "one-euro" } });
        const on = tilt ? null : run(seed, { poseGuard: { mode: "closed-form-below" } });
        for (let k = 0; k < off.results.length; k++) {
            const r = off.results[k];
            if (r.ok && r.pose !== r.poseSelection.pose) fatal(`${clip}, frame ${k}: the options absent, and pose is not poseSelection.pose`);
        }
        const row = { seed };
        if (reads("M2")) {
            row.posedIPPE = checkCorners(off, "IPPE", seed);
            row.posedFILTER = checkCorners(filter, "FILTER", seed);
            if (on !== null) row.posedGUARD = checkCorners(on, "the guard", seed);
            row.framesCompared = off.records.length;
            let moved = 0;
            for (let k = 0; k < off.results.length; k++) {
                if (off.results[k].ok && cornersDiffer(off.records[k].poseCorners, filter.records[k].poseCorners) !== null) moved++;
            }
            // The arms must differ, or M2's FILTER row would be IPPE's read twice.
            if (moved === 0) fatal(`${clip}, seed ${seed}: M2: the filter moved no frame's poseCorners`);
            row.filterMoved = moved;
        }
        // H as the result gives it, at full precision, through JSON and back.
        for (let k = 0; k < off.results.length; k++) {
            const r = off.results[k];
            const back = JSON.parse(JSON.stringify(off.records[k])).H;
            if (r.ok) for (let i = 0; i < 9; i++) if (!Object.is(back[i], r.H[i])) fatal(`${clip}, seed ${seed}, frame ${k}: M5: H[${i}] read back ${back[i]}, the result's ${r.H[i]}`);
        }
        row.cells = cells(off.records, filter.records, on?.records ?? null);
        row.off = families(off.records);
        row.filter = families(filter.records);
        const every = tilt
            ? `tilt/s${seed}/replay-${stem}-tracking-every-frame.json`
            : seed === 1
              ? `ext/replay-${stem}-tracking-every-frame-sync.json`
              : null;
        // Check D is a counted run's: a mutant of a key would fire it before the criterion it is for.
        if (every !== null && (tilt ? reads("M7") : CHECK === "all")) {
            const e = proveAgainstReplay(off.records, every, seed, tilt ? "M7" : "check D");
            if (e.schedule !== (tilt ? "every frame" : "every frame, sync")) fatal(`${every}: schedule "${e.schedule}"`);
            for (const key of ["posePosedFrames", "poseJitterWindows", "poseJitterPx", "poseSpreadPx"]) {
                const want = summarizeRun(off.records, { clipDurationS, loops: COUNTED, path: "sync" })[key];
                if (!Object.is(want, e.runSummary[key])) fatal(`${every}: ${key} ${e.runSummary[key]}, the check's ${want}`);
            }
            if (tilt) {
                // M4's row read off the export's own frames: the frames above are equal, and this says so of the cell.
                const again = cells(e.frames, filter.records, null);
                for (const key of ["frames", "windows", "ippe", "ippeSpread"]) {
                    if (!Object.is(again[key], row.cells[key])) fatal(`${every}: M7: ${key} ${again[key]}, the check's ${row.cells[key]}`);
                }
                row.tilt = {};
                for (const s of SCHEDULES) {
                    const file = `tilt/s${seed}/replay-${stem}-tracking-${s.slug}.json`;
                    const device = run(seed, {}, s.stepMs);
                    const x = proveAgainstReplay(device.records, file, seed, `M7, ${s.name}`);
                    if (x.schedule !== `${s.name}, ${BORROWED_LABEL}`) fatal(`${file}: M7: schedule "${x.schedule}" does not name the borrowed constant`);
                    if (x.detection?.model?.acquireMs !== BORROWED_MS) fatal(`${file}: M7: the model's acquisition ${x.detection?.model?.acquireMs}`);
                    row.tilt[s.key] = { frames: x.frames.length, posed: x.runSummary.posePosedFrames, windows: x.runSummary.poseJitterWindows, jitter: x.runSummary.poseJitterPx };
                }
            }
        }
        rows.push(row);
        lap(`${clip}: seed ${seed}`);
    }
    // ---- the registered cells ----
    const col = (key) => rows.map((r) => r.cells[key]);
    const [frames3, windows3, ippe3, filter3, ippeSpread3, filterSpread3] = M4[clip];
    if (reads("M4")) {
        const list = [
            ["frames", printed(col("frames"), 0), frames3],
            ["windows", printed(col("windows"), 0), windows3],
            ["IPPE jitter", printed(col("ippe"), 3), ippe3],
            ...(filter3 === null ? [] : [["FILTER jitter", printed(col("filter"), 3), filter3], ["IPPE spread", printed(col("ippeSpread"), 3), ippeSpread3], ["FILTER spread", printed(col("filterSpread"), 3), filterSpread3]]),
        ];
        for (const [name, got, want] of list) {
            const breach = cellBreach(clip, `M4, ${name}`, got, want);
            if (breach) fatal(breach);
        }
    }
    if (reads("M8") && !tilt) {
        const breach = cellBreach(clip, "M8, the guard's jitter", printed(col("guard"), 3), M8[clip]);
        if (breach) fatal(breach);
    }
    writeFileSync(join(OUT_DIR, `${stem}.result.json`), JSON.stringify({ clip, width, height, f: K[0], frames: frames.length, loopS: clipDurationS, rows }));
}

// =============================================================================================
// The report: stdout, and nothing else, printed only after every check above held.
// =============================================================================================
function report(R, m3, scan, m7, refusals) {
    const s = (rows, get, d = 0) => span(rows.map(get), d);
    say(`# ${SCRIPT}`);
    say(`this script's source, SHA-256: ${sha256(readFileSync(SELF))}`);
    say("every check below held, or nothing would print");
    say();
    say("## M2: poseCorners equal, Object.is, to the repeat's lines 152 to 179, carried here");
    say("| clip | frames a run, all 6 loops | posed, IPPE | posed, FILTER | posed, the guard | frames FILTER moved |");
    say("|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        const r = R[clip].rows;
        say(`| ${clip} | ${s(r, (x) => x.framesCompared)} | ${s(r, (x) => x.posedIPPE)} | ${s(r, (x) => x.posedFILTER)} | ${TILT_CLIPS.includes(clip) ? "not run" : s(r, (x) => x.posedGUARD)} | ${s(r, (x) => x.filterMoved)} |`);
    }
    say();
    say("## M3: the references, through the registered script");
    say(`R-replay, ${m3.outputs} step-independent outputs, with --v1-projection: ${m3.hash}`);
    say(`without the projection: ${m3.plain}`);
    say(`R-truth: ${m3.truthBytes} bytes, sha256 ${m3.truth}`);
    say();
    say("## M4: the frozen cornerJitter on poseCorners, the common set, counted loops 1 to 4 of 6, seeds 1 to 8");
    say("| clip | frames | windows | IPPE jitter | FILTER jitter | IPPE spread | FILTER spread |");
    say("|---|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        const c = (key, d) => printed(R[clip].rows.map((x) => x.cells[key]), d);
        say(`| ${clip} | ${c("frames", 0)} | ${c("windows", 0)} | ${c("ippe", 3)} | ${c("filter", 3)} | ${c("ippeSpread", 3)} | ${c("filterSpread", 3)} |`);
    }
    say();
    say("The FILTER and spread cells of the tilt clips print here as reads: the registration holds them bit for bit by M2, with no figure of its own.");
    say();
    say("## M5: every replay export, by the key");
    say("| group | exports | frames | with poseCorners |");
    say("|---|---|---|---|");
    for (const [k, v] of Object.entries(scan).sort()) say(`| ${k} | ${v.exports} | ${v.frames} | ${v.posed} |`);
    say();
    say("## M7: the tilt clips through --clips tilt");
    for (const line of m7) say(line);
    say(`every-frame frames of all 8 seeds equal the check's, trackerTimings apart; the device schedules' too, each naming: ${BORROWED_LABEL}`);
    say("| clip | schedule (BORROWED acquisition) | frames a run | counted, with poseCorners | windows | jitter |");
    say("|---|---|---|---|---|---|");
    for (const clip of TILT_CLIPS) {
        for (const sch of SCHEDULES) {
            const r = R[clip].rows.map((x) => x.tilt[sch.key]);
            say(`| ${clip} | ${sch.name} | ${span(r.map((x) => x.frames))} | ${span(r.map((x) => x.posed))} | ${span(r.map((x) => x.windows))} | ${span(r.map((x) => x.jitter), 3)} |`);
        }
    }
    say();
    say("--clips tilt against each form, and an unknown value:");
    for (const row of refusals) say(`- ${row.flag}: exit ${row.status}: ${row.line}`);
    say();
    say("## M8: the frozen metric on the option's pose, the common set");
    say("| clip | the guard's jitter |");
    say("|---|---|");
    for (const clip of FIRST_RECORD_CLIPS) say(`| ${clip} | ${printed(R[clip].rows.map((x) => x.cells.guard), 3)} |`);
    say();
    say("## What the registration left to this addendum: where corners and poseCorners differ");
    say("Counted loops 1 to 4; each cell min / median / max over the seeds, and per seed where any differs.");
    say("| clip | arm | corners, no poseCorners | posedFrames | posePosedFrames | jitterWindows | poseJitterWindows | seeds where the windows differ |");
    say("|---|---|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        for (const arm of ["off", "filter"]) {
            const r = R[clip].rows;
            const differ = r.filter((x) => x[arm].jitterWindows !== x[arm].poseJitterWindows).map((x) => x.seed);
            say(`| ${clip} | ${arm === "off" ? "IPPE" : "FILTER"} | ${s(r, (x) => x[arm].cornersNoPose)} | ${s(r, (x) => x[arm].posedFrames)} | ${s(r, (x) => x[arm].posePosedFrames)} | ${s(r, (x) => x[arm].jitterWindows)} | ${s(r, (x) => x[arm].poseJitterWindows)} | ${differ.length === 0 ? "none" : differ.join(", ")} |`);
        }
    }
    say();
    say("## The descriptive reading, never a criterion: poseCornerDistancePx on the common set");
    say("CF computed from the exported H. It has no truth in it: it says how far apart two arms are, and not which is nearer.");
    say("| clip | K's f, px | CF to IPPE | FILTER to IPPE |");
    say("|---|---|---|---|");
    for (const clip of CLIPS) {
        const r = R[clip].rows;
        say(`| ${clip} | ${fx(R[clip].f, 2)} | ${s(r, (x) => x.cells.distanceCF, 3)} | ${s(r, (x) => x.cells.distanceFilter, 3)} |`);
    }
    say();
    say("## Beside them: the figures under H and under the pose, the IPPE arm's whole counted loops, a read");
    say("| clip | jitterPx | poseJitterPx |");
    say("|---|---|---|");
    for (const clip of CLIPS) {
        const r = R[clip].rows;
        say(`| ${clip} | ${s(r, (x) => x.off.jitterPx, 3)} | ${s(r, (x) => x.off.poseJitterPx, 3)} |`);
    }
}

// =============================================================================================
// The negatives: each mutant applied with no run in flight, restored in a finally.
// =============================================================================================
function negatives(dir) {
    if (arg("--replay") === null) fatal("--negatives needs --replay <the --prepare dir>");
    const FRAMES = "examples/js/bench-frames.mjs";
    const SUMMARY = "examples/js/bench-summary.mjs";
    const DEFS = "examples/js/bench-definitions.mjs";
    const PROBE = "examples/js/bench-probe-replay.mjs";
    const CLIPS_SCRIPT = "scripts/replay-clips.mjs";
    const POSE_LINE = "poseCorners: result.ok ? poseCornersOf(result.pose, K, targetPoints) : null,";
    const M_LINE = "const M = [R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]];";
    const KEY_GUARD = "if (K?.length !== 9) {";
    const H_LINE = "H: result.ok ? Array.from(result.H) : null,";
    const READABLE = "export const READABLE_METRICS_VERSIONS = Object.freeze([1, 2]);";
    const SUM_LINE = "a.reduce((sum, [x, y], c) => sum + Math.hypot(x - b[c][0], y - b[c][1]), 0) / a.length;";
    const SUM_CALL = "const pose = cornerJitter(withPoseCorners(frames), clip);";
    const TEST = ["vitest", "test/pose-metric.test.mjs"];
    const TESTS = ["vitest", "test/pose-metric.test.mjs test/glossary.test.mjs"];
    const childOf = (clip, check, only = "1") => ["child", clip, check, only];
    // A real copy of the frozen function, its n - 2 changed, called in its place.
    const summaryText = readFileSync(join(ROOT, SUMMARY), "utf8").replace(/\r\n/g, "\n");
    const from = summaryText.indexOf("export function cornerJitter(");
    const body = summaryText.slice(from, summaryText.indexOf("\n}\n", from) + 3);
    const COPY = `${body.replace("export function cornerJitter(", "function copiedJitter(").replace("dof += n - 2;", "dof += n - 1;")}\nconst withPoseCorners =`;
    const LIST = [
        ["M0", "a version 1 key's text edited", [[DEFS, 'posedFrames: "Frames with corners.",', 'posedFrames: "Frames that have corners.",']], TEST, /posedFrames keeps its string/],
        ["M0", "a new key's text edited by one word", [[DEFS, 'posePosedFrames: "Frames with poseCorners.",', 'posePosedFrames: "Frames having poseCorners.",']], TEST, /in the record's wording/],
        ["M0", "another key added", [[DEFS, 'posePosedFrames: "Frames with poseCorners.",', 'posePosedFrames: "Frames with poseCorners.",\n    poseExtra: "Another.",']], TESTS, /only the seven new keys/],
        ["M0", "the version left at 1", [[DEFS, "export const METRICS_VERSION = 2;", "export const METRICS_VERSION = 1;"]], TESTS, /is version 2/],
        ["M1", "a line of cornerJitter's body changed", [[SUMMARY, "dof += n - 2;", "dof += n - 1;"]], TEST, /leaves cornerJitter's source/],
        ["M1", "a line of reprojectCorners changed", [[FRAMES, "const s = Math.sign(w);", "const s = Math.sign(w) || 1;"]], TEST, /leaves reprojectCorners' source/],
        ["M1", "a copy of the metric with a changed n - 2, called for the new keys", [[SUMMARY, "const withPoseCorners =", COPY], [SUMMARY, SUM_CALL, "const pose = copiedJitter(withPoseCorners(frames), clip);"]], TEST, /from a call of it/],
        ["M2", "t[0] + 1e-6", [[FRAMES, M_LINE, "const M = [R[0], R[1], t[0] + 1e-6, R[3], R[4], t[1], R[6], R[7], t[2]];"]], childOf("pinball-bench.mp4", "M2"), /M2, IPPE: corner 0/],
        ["M2", "K scaled 1.01", [[FRAMES, "function poseCornersOf(pose, K, points) {", "function poseCornersOf(pose, K0, points) {\n    const K = [K0[0] * 1.01, ...Array.from(K0).slice(1)];"]], childOf("pinball-bench.mp4", "M2"), /M2, IPPE: corner 0/],
        ["M2", "R transposed", [[FRAMES, M_LINE, "const M = [R[0], R[3], t[0], R[1], R[4], t[1], R[2], R[5], t[2]];"]], childOf("pinball-bench.mp4", "M2"), /M2, IPPE: corner 0/],
        ["M2", "the depth rule removed, against a constructed all-behind pose", [[FRAMES, "if (!(R[6] * x + R[7] * y + t[2] > 0)) return null;", ""]], TEST, /wholly behind the camera/],
        ["M3", "one version 1 frame key changed", [[FRAMES, "numInliers: result.numInliers,", "numInliers: result.numInliers + 1,"]], ["refs", "def"], /projected to version 1: (?!98323f06)/],
        ["M3", "a key beyond the six", [[FRAMES, H_LINE, `${H_LINE}\n        poseExtra: null,`]], ["refs", "def"], /projected to version 1: (?!98323f06)/],
        ["M3", "sequenceRefusal left at one version", [[PROBE, "if (!READABLE_METRICS_VERSIONS.includes(e.metricsVersion)) {", "if (e.metricsVersion !== 2) {"]], ["refs", "seq"], /projected to version 1: (?!98323f06)/],
        ["M3", "CLIPS extended", [[CLIPS_SCRIPT, 'const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];', 'const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4", "pinball-tilt-cross.mp4"];'], [CLIPS_SCRIPT, '"pinball-bench-table.mp4": 41.0,', '"pinball-bench-table.mp4": 41.0,\n    "pinball-tilt-cross.mp4": 36.9,']], ["refs", "def"], /expected 19 step-independent outputs/],
        ["M4", "a corners slip into the pose keys: H's column in place of IPPE's", [[FRAMES, POSE_LINE, "poseCorners: result.ok ? reprojectCorners(result.H, targetPoints) : null,"]], childOf("pinball-static.mp4", "M4"), /M4, IPPE jitter reads/],
        ["M4", "the summary's keys read from corners", [[SUMMARY, SUM_CALL, "const pose = cornerJitter(frames, clip);"]], childOf("pinball-static.mp4", "M4"), /M4: the summary's/],
        ["M5", "a K defaulted", [[FRAMES, KEY_GUARD, "K = K ?? [100, 0, 50, 0, 100, 60, 0, 0, 1];\n    if (K?.length !== 9) {"]], TEST, /throws with K/],
        ["M5", "H rounded", [[FRAMES, H_LINE, "H: result.ok ? Array.from(result.H, (v) => Number(v.toFixed(6))) : null,"]], TEST, /full precision/],
        ["M5", "the stateless mode left out", [[FRAMES, POSE_LINE, 'poseCorners: result.ok && tracker ? poseCornersOf(result.pose, K, targetPoints) : null,']], TEST, /posed stateless frame/],
        ["M6", "the list left at [2]", [[DEFS, READABLE, "export const READABLE_METRICS_VERSIONS = Object.freeze([2]);"]], TEST, /reads versions 1 and 2/],
        ["M6", "the list widened to [1, 2, 3]", [[DEFS, READABLE, "export const READABLE_METRICS_VERSIONS = Object.freeze([1, 2, 3]);"]], TEST, /reads versions 1 and 2/],
        ["M6", "the distance over all four corners' sum", [[SUMMARY, SUM_LINE, "a.reduce((sum, [x, y], c) => sum + Math.hypot(x - b[c][0], y - b[c][1]), 0);"]], TEST, /known value/],
        ["M6", "a pair with a version 1 export given a pose part", [[SUMMARY, "if (first.metricsVersion !== 2 || second.metricsVersion !== 2) return null;", ""]], TEST, /version 1 and a version 2 likewise/],
        ["M6", "the k-th pairing broken: the last frame at a media time, not the k-th", [[SUMMARY, "distances.push(meanCornerDistance(a[k].poseCorners, b[k].poseCorners));", "distances.push(meanCornerDistance(a[a.length - 1 - k].poseCorners, b[k].poseCorners));"]], TEST, /k-th frame with the k-th/],
        ["M7", "the label removed", [[CLIPS_SCRIPT, "schedule: `device, 15 ms step, ${borrowed}`,", 'schedule: "device, 15 ms step",']], ["tilt", "pinball-tilt-cross.mp4"], /does not name the borrowed constant/],
        ["M7", "the refusal against --external removed", [[CLIPS_SCRIPT, 'for (const flag of ["--external", "--sequence", "--transfer", "--device-ratio"]) {', 'for (const flag of ["--sequence", "--transfer", "--device-ratio"]) {']], ["refusals"], /--clips tilt with --external: exit/],
        ["M7", "the refusal against --sequence removed", [[CLIPS_SCRIPT, 'for (const flag of ["--external", "--sequence", "--transfer", "--device-ratio"]) {', 'for (const flag of ["--external", "--transfer", "--device-ratio"]) {']], ["refusals"], /--clips tilt with --sequence: exit/],
        ["M7", "the refusal against --transfer removed", [[CLIPS_SCRIPT, 'for (const flag of ["--external", "--sequence", "--transfer", "--device-ratio"]) {', 'for (const flag of ["--external", "--sequence", "--device-ratio"]) {']], ["refusals"], /--clips tilt with --transfer: exit/],
        ["M7", "a clip's hash that is not the one recorded", [], ["break", "input-hash"], /pinball-tilt-cross\.mp4: SHA-256/],
        ["M7", "a README hash that is not the clip's", [], ["break", "readme-hash"], /examples\/README\.md gives 0+/],
        ["M8", "the option's pose read from poseSelection, which gives IPPE's column", [[FRAMES, POSE_LINE, "poseCorners: result.ok ? poseCornersOf(result.poseSelection?.pose ?? result.pose, K, targetPoints) : null,"]], childOf("pinball-static.mp4", "M8"), /M8, the guard's jitter reads 0\.270, registered 0\.129/],
        ["M8", "the same, against M2's carried function on the FILTER arm", [[FRAMES, POSE_LINE, "poseCorners: result.ok ? poseCornersOf(result.poseSelection?.pose ?? result.pose, K, targetPoints) : null,"]], childOf("pinball-static.mp4", "M2"), /M2, FILTER/],
    ];
    const start = treeState();
    process.stderr.write(`tree at the start: ${JSON.stringify(start)}\n`);
    if (start.status !== "") fatal(`--negatives runs from a clean tree, and this one is not:\n${start.status}`);
    mkdirSync(dir, { recursive: true });
    const REPLAY = arg("--replay");
    const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, shell: process.platform === "win32" });
    const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
    say(`# ${SCRIPT} --negatives`);
    say(`this script's source, SHA-256: ${sha256(readFileSync(SELF))}`);
    say("| criterion | the mutant | how it was read | failed as it must |");
    say("|---|---|---|---|");
    let survivors = 0;
    const MATCH = arg("--match");
    let n = 0;
    for (const [m, name, edits, how, expected] of LIST) {
        if (MATCH !== null && !name.includes(MATCH)) continue;
        n++;
        const originals = new Map();
        let reading = "";
        let text = "";
        try {
            for (const [file, a, b] of edits) {
                const p = join(ROOT, file);
                const was = readFileSync(p, "utf8");
                if (!originals.has(file)) originals.set(file, was);
                if (!was.includes(a)) throw new Error(`${file}: no "${a.slice(0, 50)}"`);
                writeFileSync(p, was.replace(a, () => b));
            }
            if (how[0] === "vitest") {
                reading = "the suite";
                const r = sh("npx", ["vitest", "run", "--root", "examples", "--testTimeout=15000", ...how[1].split(" ")]);
                text = `${r.stdout}\n${r.stderr}`;
                if (r.status === 0) text = "";
            } else if (how[0] === "child") {
                const [, clip, check, only] = how;
                reading = `the check, ${clip}, seed ${only}, ${check}`;
                const r = node([SELF, "--negative", "--replay", REPLAY, "--out", join(dir, "child"), "--clip", clip, "--only", only, "--check", check]);
                text = r.status === 0 ? "" : r.stderr;
            } else if (how[0] === "refs") {
                const copy = join(dir, "refs");
                rmSync(copy, { recursive: true, force: true });
                mkdirSync(copy, { recursive: true });
                for (const g of ["def", "ext"]) cpSync(join(REPLAY, g), join(copy, g), { recursive: true });
                cpSync(join(REPLAY, "seq.stdout"), join(copy, "seq.stdout"));
                reading = `the references script, ${how[1]} rewritten by the mutant`;
                if (how[1] === "def") {
                    rmSync(join(copy, "def"), { recursive: true });
                    const r = node([join(ROOT, "scripts/replay-clips.mjs"), "--seed", "1", ...SEEDED, "--out", join(copy, "def")]);
                    if (r.status !== 0) text = r.stderr;
                } else {
                    const r = node([join(ROOT, "scripts/replay-clips.mjs"), "--sequence", join(ROOT, "docs/benchmarks/2026-10-13-tab9-m4-preflight-sync-wall.json"), "--seed", "1", ...SEEDED]);
                    writeFileSync(join(copy, "seq.stdout"), r.stdout);
                }
                if (text === "") {
                    const r = node([REFERENCES, "--replay", copy, "--v1-projection"]);
                    text = `${r.stdout}\n${r.stderr}`;
                }
            } else if (how[0] === "tilt") {
                const [, clip] = how;
                reading = `--clips tilt rewritten by the mutant, the check on ${clip}, seed 1, M7`;
                const copy = join(dir, "tilt-copy");
                rmSync(copy, { recursive: true, force: true });
                mkdirSync(copy, { recursive: true });
                for (const g of ["ext"]) cpSync(join(REPLAY, g), join(copy, g), { recursive: true });
                const a = node([join(ROOT, "scripts/replay-clips.mjs"), "--clips", "tilt", "--seed", "1", ...SEEDED, "--out", join(copy, "tilt", "s1")]);
                if (a.status !== 0) throw new Error(`--clips tilt: ${a.stderr}`);
                const r = node([SELF, "--negative", "--replay", copy, "--out", join(dir, "child"), "--clip", clip, "--only", "1", "--check", "M7"]);
                text = r.status === 0 ? "" : r.stderr;
            } else if (how[0] === "refusals") {
                reading = "the check's refusals";
                const r = node([SELF, "--refusals"]);
                text = r.status === 0 ? "" : r.stderr;
            } else if (how[0] === "break") {
                reading = `the check, --break ${how[1]}`;
                const r = node([SELF, "--negative", "--replay", REPLAY, "--out", join(dir, "child"), "--break", how[1], "--clip", "pinball-tilt-cross.mp4", "--only", "1", "--check", "M7"]);
                text = r.status === 0 ? "" : r.stderr;
            }
        } catch (e) {
            text = "";
            reading = `the mutant could not be applied: ${e.message}`;
        } finally {
            for (const [file, was] of originals) writeFileSync(join(ROOT, file), was);
        }
        const line = text.split(/\r?\n/).find((l) => expected.test(l)) ?? (expected.test(text) ? "matched across lines" : null);
        if (line === null) {
            survivors++;
            say(`| ${m} | ${name} | ${reading} | **SURVIVED** |`);
            process.stderr.write(`SURVIVED: ${name}\n${text.slice(-1500)}\n`);
        } else {
            const clean = line.trim().replace(/\|/g, "/").replace(/\x1b\[[0-9;]*m/g, "");
            say(`| ${m} | ${name} | ${reading} | ${clean.length > 180 ? `${clean.slice(0, 177)}...` : clean} |`);
        }
        lap(`${m}: ${name}`);
    }
    const end = treeState();
    process.stderr.write(`tree at the end: ${JSON.stringify(end)}\n`);
    if (end.status !== "" || end.diff !== start.diff) fatal(`the tree is not as it was: ${end.status}`);
    say();
    if (survivors > 0) fatal(`${survivors} survived`);
    say(MATCH === null ? `every mutant failed as it must, ${n} of them; the tree is as it was.` : `a partial list, ${n} of them, which stands for nothing.`);
}
