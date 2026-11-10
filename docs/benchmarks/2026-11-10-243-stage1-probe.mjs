/*
 *  2026-11-10-243-stage1-probe.mjs
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
 * M9's desktop Stage 1 probe (#243): what a device campaign on IPPE, the closed form (CF), #133's
 * guard and the One Euro filter needs to know before its plan is written. The computation behind
 * docs/benchmarks/2026-11-10-243-stage1-probe.md. A desktop replay, headless, RANSAC seeded per
 * frame: not campaign data, never a round. It registers nothing, and changes no file under
 * packages/<name>/src/, examples/ or scripts/.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node scripts/replay-clips.mjs --seed 1 --seed-policy frame --packages bundle --out <replay dir>/def
 *     node scripts/replay-clips.mjs --clips tilt --seed 1 --seed-policy frame --packages bundle --out <replay dir>/tilt
 *     node docs/benchmarks/2026-11-10-243-stage1-probe.mjs --self-test
 *     node docs/benchmarks/2026-11-10-243-stage1-probe.mjs --replay <replay dir> --out <run dir>
 *     node docs/benchmarks/2026-11-10-243-stage1-probe.mjs --page-export <export.json> [...]
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The frame loop is scripts/replay-run.mjs's `replayRun` and `loopPeriod`, and
 *    scripts/replay-seeding.mjs's `runSeeding` and `countGlobalRandomReads`, imported. The
 *    decoding and the device constants live in scripts/replay-clips.mjs, a top-level script that
 *    cannot be imported, so they are copied and proved frame by frame against that script's
 *    exports at --seed 1 (check D): the default runs for the static, table and wall clips, and
 *    `--clips tilt` for the tilt clips.
 * 2. Per clip × schedule × seed: 6 loops, loops 1 to 4 counted (`countedLoopFrames`), stamped on
 *    the loops' continuous timeline (`unwrapped: true`), seeds 1 to 8, policy `frame`.
 * 3. Run A is the tracker at its defaults. Its frame records, through JSON as an export carries
 *    them, are "the export": `H`, `poseCorners`, `mediaTimeSeconds`, `timestampMs`, `state`, with
 *    `processingResolution` and the target's size beside them. K is `intrinsics` of
 *    `processingResolution`.
 * 4. The arms derived from that export alone: IPPE is the export's `poseCorners`; CF is
 *    `closedFormPose(H, K)` projected by the frozen `frameRecord`; the guard is CF where the
 *    guard's tilt (`tiltDegOf` of CF's R) is below 10°, the export's `poseCorners` otherwise.
 * 5. Q1: run G10 (`poseGuard` at 10°) and run G180 (at 180°, above every tilt, which hands every
 *    frame with a good closed form to CF) are compared with the derived arms, bit for bit, and
 *    their tracking with A's, frame by frame (fatal). On the static clip, run F
 *    (`poseFilter: { mode: "one-euro" }`, unwrapped) and run FW (the same, stamped with media
 *    time, which wraps) give the filter; the filter's output is then rebuilt three ways from
 *    run A: from the true selected pose (a control, which must reproduce F), from CF on the
 *    export's `H`, and from the pose recovered from the export's `poseCorners`.
 * 6. The metric is the frozen `summarizeRun`'s `poseJitterPx` and `poseSpreadPx` on a whole run,
 *    and the frozen `cornerJitter` with `include` on a selection, cross-checked against each
 *    other (fatal).
 * 7. Q4's pairs read one run's frames, or two runs proved to track identically: common frames by
 *    construction. Each is read with and without the single media time whose removal moves the
 *    median over the seeds of the paired difference the most.
 *
 * Timings go to stderr; stdout is byte-identical between runs. Every check is fatal before any
 * figure is printed. A known limitation, as every derivation script's here: no test covers docs/,
 * so this script could break later while its figures stay in the record. Its guards are its
 * checks, each exercised with --break.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-10-243-stage1-probe.mjs";
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
const BREAKS = [
    "input-hash",
    "check-d",
    "global-read",
    "tracking",
    "q1-H",
    "q1-threshold",
    "q1-tilt",
    "filter-control",
    "filter-stamp",
    "metric-cross",
    "guard-identity",
    "filter-none",
    "tree-state",
    "self-test",
    "q5-missing",
];
if (BREAK !== null && !BREAKS.includes(BREAK)) fatal(`--break ${BREAK}: not one of ${BREAKS.join(", ")}`);

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const backendPkg = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
const trackerPkg = await imp("packages/nft-tracker/dist/index.js");
const { PoseFilter } = await imp("packages/nft-tracker/dist/pose/pose_filter.js");
const { tiltDegOf } = await imp("packages/nft-tracker/dist/pose/pose_guard.js");
const metrics = await imp("examples/js/bench-metrics.mjs");
const { fitSize } = await imp("examples/js/pinball-shared.mjs");
const { replayRun, loopPeriod } = await imp("scripts/replay-run.mjs");
const { runSeeding, seedingRefusal, countGlobalRandomReads } = await imp("scripts/replay-seeding.mjs");
const { createJsfeatNextBackend, intrinsics } = backendPkg;
const { NftTracker, decode, closedFormPose } = trackerPkg;
const { frameRecord, targetCorners, cornerJitter, summarizeRun, countedLoopFrames, PAGE_PROCESSING_BOX, METRICS_VERSION } = metrics;

// =============================================================================================
// The definitions: pure functions, each tested on constructed cases (--self-test).
// =============================================================================================

/** Two corner sets equal bit for bit (`Object.is` on every coordinate), both null included. */
function sameCorners(a, b) {
    if (a === null || b === null) return a === b;
    for (let c = 0; c < 4; c++) for (let x = 0; x < 2; x++) if (!Object.is(a[c][x], b[c][x])) return false;
    return true;
}
/** The largest coordinate difference between two corner sets, px; Infinity when one is null and the other not. */
function cornerDiff(a, b) {
    if (a === null || b === null) return a === b ? 0 : Infinity;
    let m = 0;
    for (let c = 0; c < 4; c++) for (let x = 0; x < 2; x++) m = Math.max(m, Math.abs(a[c][x] - b[c][x]));
    return m;
}
/** The mean distance between two corner sets' four corners, px (`DEFINITIONS.poseCornerDistancePx`'s per-frame term). */
const meanCornerDistance = (a, b) => a.reduce((s, [x, y], c) => s + Math.hypot(x - b[c][0], y - b[c][1]), 0) / a.length;
/** The homography mapping four points `src` exactly onto `dst`, row-major, `G[8] = 1`: an 8 × 8 solve, partial pivoting. */
function fitHomography4(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [u, v] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
        let p = c;
        for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]];
        if (A[c][c] === 0) return null;
        for (let r = 0; r < 8; r++) {
            if (r === c) continue;
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
        }
    }
    const g = A.map((row, i) => row[8] / row[i]);
    return Float64Array.from([...g, 1]);
}
/** min / p10 / p50 / p90 / max by the nearest rank, or null on nothing. */
function fivePoint(xs) {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
    return [s[0], at(10), at(50), at(90), s[s.length - 1]];
}
/** min, median (the mean of the two middle values on an even count), max. */
function mmm(xs) {
    const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
    if (s.length === 0) return null;
    const n = s.length;
    const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return { min: s[0], med, max: s[n - 1], n };
}
/** How many of `xs` are above, below and at zero. */
const signs = (xs) => ({ above: xs.filter((x) => x > 0).length, below: xs.filter((x) => x < 0).length, zero: xs.filter((x) => x === 0).length });

/**
 * The jitter of arm `X` on `frames` (one run's counted frames, in processed order, each with
 * `media` and `arms`), over the frames `keep` admits: the frozen `cornerJitter`, its loops read from
 * all of `frames` (`include`), as `compareExports` reads a selection.
 */
function armJitter(frames, X, keep, clipDurationS) {
    const g = frames.map((f) => ({ mediaTimeSeconds: f.media, corners: f.arms[X], src: f }));
    return cornerJitter(g, { include: (h) => keep(h.src), clipDurationS });
}
/**
 * One pair `Y − X` per seed on `runs` (one entry per seed: `{ frames, clipDurationS }`), on the
 * frames where both arms have corners and `select` holds, with `drop` (a media key) left out.
 */
function pairPerSeed(runs, X, Y, select, drop = null) {
    return runs.map((r) => {
        const keep = (f) => f.arms[X] !== null && f.arms[Y] !== null && select(f) && (drop === null || f.key !== drop);
        const jx = armJitter(r.frames, X, keep, r.clipDurationS);
        const jy = armJitter(r.frames, Y, keep, r.clipDurationS);
        const d = jx.jitterPx === null || jy.jitterPx === null ? null : jy.jitterPx - jx.jitterPx;
        return { x: jx.jitterPx, y: jy.jitterPx, d, frames: jx.posedFrames, windows: jx.jitterWindows };
    });
}
/** The media key whose removal moves the median over the seeds of the difference the most; the first in key order on a tie. */
function mostInfluential(runs, X, Y, select) {
    const base = mmm(pairPerSeed(runs, X, Y, select).map((p) => p.d));
    if (base === null) return null;
    const keys = new Set();
    for (const r of runs) for (const f of r.frames) if (f.arms[X] !== null && f.arms[Y] !== null && select(f)) keys.add(f.key);
    let best = null;
    for (const key of [...keys].sort((a, b) => Number(a) - Number(b))) {
        const m = mmm(pairPerSeed(runs, X, Y, select, key).map((p) => p.d));
        const move = m === null ? Infinity : Math.abs(m.med - base.med);
        if (best === null || move > best.move) best = { key, move };
    }
    return best;
}

function selfTest() {
    const cases = [];
    const check = (name, ok) => cases.push([name, ok]);
    const a = [[0, 0], [1, 0], [1, 1], [0, 1]];
    check("sameCorners: equal", sameCorners(a, a.map((p) => [...p])));
    check("sameCorners: one coordinate off", !sameCorners(a, [[0, 0], [1, 0], [1, 1 + 1e-15], [0, 1]]));
    check("sameCorners: -0 is not 0", !sameCorners(a, [[-0, 0], [1, 0], [1, 1], [0, 1]]));
    check("sameCorners: null and null", sameCorners(null, null) && !sameCorners(null, a));
    check("cornerDiff", cornerDiff(a, [[0, 0], [1, 0.5], [1, 1], [0, 1]]) === 0.5 && cornerDiff(null, a) === Infinity);
    // A homography fitted on four points reproduces them, and a known one is recovered.
    const Htrue = [1.2, 0.1, 30, -0.05, 0.9, 12, 1e-4, -2e-4, 1];
    const proj = (H, [x, y]) => {
        const w = H[6] * x + H[7] * y + H[8];
        return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    };
    const src = [[0, 0], [999, 0], [999, 699], [0, 699]];
    const G = fitHomography4(src, src.map((p) => proj(Htrue, p)));
    const gOff = BREAK === "self-test" ? 1e-3 : 0;
    check("fitHomography4 recovers a homography", G !== null && G.every((g, i) => Math.abs(g + (i === 0 ? gOff : 0) - Htrue[i]) < 1e-9 * Math.max(1, Math.abs(Htrue[i]))));
    check("fitHomography4 refuses a degenerate set", fitHomography4([[0, 0], [0, 0], [0, 0], [0, 0]], src) === null);
    check("fivePoint", JSON.stringify(fivePoint([5, 1, 4, 2, 3, 6, 7, 8, 9, 10])) === JSON.stringify([1, 1, 5, 9, 10]));
    check("mmm: even count median", mmm([4, 1, 3, 2]).med === 2.5 && mmm([null, 2]).n === 1);
    check("signs", JSON.stringify(signs([1, -1, 0, 2])) === JSON.stringify({ above: 2, below: 1, zero: 1 }));
    // The leave-one-out picks a planted media time: arm Y carries a 5 px spike at 2.5 s.
    const mk = (spike) => {
        const frames = [];
        for (let i = 0; i < 120; i++) {
            const t = i / 30;
            const c = [[t, 0], [t + 1, 0], [t + 1, 1], [t, 1]];
            const y = c.map(([x, yy]) => [x + (i % 2) * 0.01 + (spike && i === 75 ? 5 : 0), yy]);
            frames.push({ media: t, key: t.toFixed(6), arms: { X: c, Y: y } });
        }
        return { frames, clipDurationS: 4 };
    };
    const runs = [mk(true), mk(true), mk(false)];
    const best = mostInfluential(runs, "X", "Y", () => true);
    check("mostInfluential finds the planted media time", best !== null && best.key === (75 / 30).toFixed(6));
    const failed = cases.filter(([, ok]) => !ok);
    for (const [name, ok] of cases) process.stdout.write(`${ok ? "pass" : "FAIL"}  ${name}\n`);
    if (failed.length > 0) fatal(`self-test: ${failed.length} of ${cases.length} cases failed`);
    process.stdout.write(`self-test: ${cases.length} of ${cases.length} cases pass\n`);
}

// =============================================================================================
// The inputs, the constants and the modes.
// =============================================================================================

const STATIC_CLIP = "pinball-static.mp4";
const CROSS_CLIP = "pinball-tilt-cross.mp4";
/** D1's clips, in the order the record reads them; the two after them are descriptive (Q3 only). */
const CAMPAIGN = [STATIC_CLIP, "pinball-bench-table.mp4", "pinball-bench.mp4", CROSS_CLIP];
const DESCRIPTIVE = ["pinball-tilt-mid.mp4", "pinball-tilt-sweep.mp4"];
const CLIPS = [...CAMPAIGN, ...DESCRIPTIVE];
const TILT_CLIPS = new Set([CROSS_CLIP, ...DESCRIPTIVE]);
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
    ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
    ["examples/videos/pinball-tilt-cross.mp4", "3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e"],
    ["examples/videos/pinball-tilt-mid.mp4", "f29c37d71fa074bc8ae4e8c94a89a2f9b6654e458a6d4b144ee5bdf85267e915"],
    ["examples/videos/pinball-tilt-sweep.mp4", "90c5af74401577b29f7090f07b9205d7d5e6524baed7f48d44a6dc9ea4eb9dcf"],
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** #228's repeat's loops: 6 a run, loop 0 warm-up, loops 1 to 4 counted. */
const LOOPS = 6;
const COUNTED = Object.freeze({ firstLoop: 1, loopCount: 4 });
/** The guard's threshold, and the one above every tilt that stands in for "CF on every frame". */
const T = 10;
const T_ALL = 180;
const BORROWED = "acquisition BORROWED from the static clip, 36.9 ms, not measured";
const SCHEDULES = [
    { name: "every frame", key: "every", stepMs: null, slug: "tracking-every-frame" },
    { name: "device, 15 ms step", key: "15", stepMs: 15, slug: "tracking-device-15-ms-step" },
    { name: "device, 25 ms step", key: "25", stepMs: 25, slug: "tracking-device-25-ms-step" },
];
/** Copied from scripts/replay-clips.mjs at f49f166: `DEVICE_ACQUIRE_MS`, `TILT_BORROWED_ACQUIRE_MS`, `DEVICE_DETECT_MS`; proved by check D. */
const DEVICE_ACQUIRE_MS = { "pinball-static.mp4": 36.9, "pinball-bench.mp4": 20.4, "pinball-bench-table.mp4": 41.0 };
const TILT_BORROWED_ACQUIRE_MS = 36.9;
const DEVICE_DETECT_MS = 83.2;
const acquireOf = (clip) => (TILT_CLIPS.has(clip) ? TILT_BORROWED_ACQUIRE_MS : DEVICE_ACQUIRE_MS[clip]);
/** The registration's derived values, `2026-10-29-106-stage3-registration.md`, "The derived parameters". */
const REGISTERED = {
    DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF: 1,
    DEFAULT_POSE_FILTER_ROTATION_BETA: 10,
    DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF: 1,
    DEFAULT_POSE_FILTER_TRANSLATION_BETA: 0.1,
    DEFAULT_POSE_FILTER_D_CUTOFF: 1,
};
for (const [k, v] of Object.entries(REGISTERED)) if (trackerPkg[k] !== v) fatal(`${k} is ${trackerPkg[k]}, the registration's ${v}`);
if (trackerPkg.DEFAULT_POSE_GUARD_THRESHOLD_DEG !== T) fatal(`DEFAULT_POSE_GUARD_THRESHOLD_DEG is ${trackerPkg.DEFAULT_POSE_GUARD_THRESHOLD_DEG}, not ${T}`);
if (METRICS_VERSION !== 2) fatal(`METRICS_VERSION is ${METRICS_VERSION}, not 2`);
/** The filter's layers as the tracker builds them for `{ mode: "one-euro" }` (`poseFilterLayers`), from the package's constants. */
const LAYERS = {
    rotation: { minCutOff: trackerPkg.DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF, beta: trackerPkg.DEFAULT_POSE_FILTER_ROTATION_BETA + (BREAK === "filter-control" ? 1 : 0) },
    translation: { minCutOff: trackerPkg.DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF, beta: trackerPkg.DEFAULT_POSE_FILTER_TRANSLATION_BETA },
    dCutOff: trackerPkg.DEFAULT_POSE_FILTER_D_CUTOFF,
};

if (argv.includes("--self-test")) {
    selfTest();
    process.exit(0);
}
if (arg("--page-export") !== null) {
    pageExports(argv.filter((a, i) => i > 0 && argv[i - 1] !== "--break" && !a.startsWith("--")));
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
const REPLAY_DIR = arg("--replay");
const OUT_DIR = arg("--out");
const CHILD = arg("--child");
/** The schedule a child runs: every, 15 or 25. */
const CHILD_SCHEDULE = arg("--schedule");
/** "<every|15|25>:<seed>": one schedule and seed, checks only, for --break. */
const ONLY = arg("--only");
const ONLY_CLIP = arg("--clip");
if (OUT_DIR === null) fatal("--out <run dir> is required");
if (REPLAY_DIR === null) fatal("--replay <dir holding replay-clips' def/ and tilt/ at --seed 1> is required");
if (CHILD !== null) {
    if (!CLIPS.includes(CHILD)) fatal(`--child ${CHILD}: not one of ${CLIPS.join(", ")}`);
    if (!SCHEDULES.some((s) => s.key === CHILD_SCHEDULE)) fatal(`--schedule ${CHILD_SCHEDULE}: not one of ${SCHEDULES.map((s) => s.key).join(", ")}`);
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
    return {
        head: git("rev-parse", "HEAD").toString().trim(),
        tree: git("rev-parse", "HEAD^{tree}").toString().trim(),
        diff: sha256(git("diff", "HEAD")),
        status: git("status", "--short").toString(),
    };
}
async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const self = fileURLToPath(import.meta.url);
    const start = treeState();
    const extra = [...(ONLY === null ? [] : ["--only", ONLY]), ...(BREAK === null ? [] : ["--break", BREAK])];
    const clips = ONLY_CLIP !== null ? [ONLY_CLIP] : CLIPS;
    const keys = ONLY !== null ? [ONLY.split(":")[0]] : SCHEDULES.map((s) => s.key);
    // One child per clip and schedule, at most POOL at a time, the every-frame ones first: they are the longest.
    const jobs = keys.flatMap((key) => clips.map((clip) => [clip, key]));
    const codes = [];
    const POOL = 8;
    let next = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const [clip, key] = jobs[next++];
            const code = await new Promise((done) => {
                const p = spawn(process.execPath, [self, "--replay", REPLAY_DIR, "--out", OUT_DIR, "--child", clip, "--schedule", key, ...extra], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
                p.on("exit", (c) => done(c));
            });
            codes.push([`${clip}, ${key}`, code]);
        }
    };
    await Promise.all(Array.from({ length: POOL }, worker));
    for (const [what, code] of codes) if (code !== 0) fatal(`${what}: its child exited ${code}; no figure is printed`);
    const end = treeState();
    if (BREAK === "tree-state") end.status += "?? a file that appeared\n";
    if (JSON.stringify(start) !== JSON.stringify(end)) fatal(`the tree changed during the run: ${JSON.stringify(start)} and ${JSON.stringify(end)}`);
    if (ONLY !== null || ONLY_CLIP !== null) {
        process.stderr.write(`pre-run ${ONLY ?? "all"} on ${clips.join(", ")}: every check passed\n`);
        return;
    }
    const R = {};
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const part = JSON.parse(readFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.${s.key}.result.json`), "utf8"));
            if (R[clip] === undefined) R[clip] = { ...part, schedules: {} };
            R[clip].schedules[s.key] = part.schedules[s.key];
        }
    }
    lap("all clips");
    report(R, start);
    process.stdout.write(out.join("\n") + "\n");
}

// =============================================================================================
// One clip: every run on every schedule and seed, every check, a result file.
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
            for (let i = 0, p = o; i < n; i++, p += 3) data[i] = (rgb[p] * (BREAK === "check-d" ? 0.3 : 0.299) + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
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
    const campaign = CAMPAIGN.includes(clip);
    const isStatic = clip === STATIC_CLIP;
    lap(`${clip}: decoded ${frames.length} frames at ${width}x${height}`);

    /** One tracker over one schedule; `ticks` keeps what a record does not: the selected pose, the guard's reading, pass-through. */
    function run(schedule, seed, options, unwrapped = true) {
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
                            sel: r.ok ? r.poseSelection.pose : null,
                            guard: r.ok && r.poseGuard ? r.poseGuard : null,
                            passThrough: r.ok ? r.pose === r.poseSelection.pose : null,
                        });
                    },
                },
                loops: LOOPS,
                acquireMs: acquireOf(clip),
                unwrapped,
                seeding: runSeeding(seed, "frame"),
            }),
        );
        if (reads !== 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: ${reads} reads of the global Math.random`);
        if (ticks.length !== records.length) fatal(`${clip}: ${ticks.length} results, ${records.length} records`);
        return { records, ticks };
    }
    /** The first frame where two runs' tracking differs, or null: what Q0 and Q1 require identical. */
    function trackingBreach(a, b, stamps) {
        for (let k = 0; k < Math.max(a.records.length, b.records.length); k++) {
            const x = a.records[k];
            const y = b.records[k];
            if (x === undefined || y === undefined) return `frame ${k}: present in one run only`;
            for (const key of ["ok", "state", "reason", "numInliers", "numMatches", "trackLoss", "mediaTimeSeconds", ...(stamps ? ["timestampMs"] : [])]) {
                if (!Object.is(x[key], y[key])) return `frame ${k}: ${key} ${x[key]} and ${y[key]}`;
            }
            if (JSON.stringify(x.tracking) !== JSON.stringify(y.tracking)) return `frame ${k}: tracking fields differ`;
            if ((x.H === null) !== (y.H === null)) return `frame ${k}: H in one run only`;
            if (x.H !== null) for (let i = 0; i < 9; i++) if (!Object.is(x.H[i], y.H[i])) return `frame ${k}: H[${i}] ${x.H[i]} and ${y.H[i]}`;
            if (!sameCorners(x.corners, y.corners)) return `frame ${k}: corners under H differ`;
            const p = a.ticks[k].sel;
            const q = b.ticks[k].sel;
            if ((p === null) !== (q === null)) return `frame ${k}: a selected pose in one run only`;
            if (p !== null) {
                for (let i = 0; i < 9; i++) if (!Object.is(p.R[i], q.R[i])) return `frame ${k}: the selected R[${i}] differs`;
                for (let i = 0; i < 3; i++) if (!Object.is(p.t[i], q.t[i])) return `frame ${k}: the selected t[${i}] differs`;
            }
        }
        return null;
    }
    /** A pose's corners as the frozen `frameRecord` projects them (`poseCornersOf`), on the frame's `H`. */
    function cornersOf(pose, H, Kx, tp) {
        if (pose === null) return null;
        const result = { ok: true, pose, H, sceneKeypoints: [], numMatches: 0, numInliers: 0, state: "TRACK", quality: 0, trackLoss: null, tracking: null, timings: null };
        return frameRecord({ mode: "tracking", result, stageTimings: {}, timestampMs: 0, mediaTimeSeconds: 0, targetPoints: tp, K: Kx }).poseCorners;
    }

    // ---- check D: the copied decoding and constants against replay-clips' exports at seed 1 ----
    const mask = (f, dropStamps) => {
        const g = JSON.parse(JSON.stringify(f));
        delete g.trackerTimings;
        if (dropStamps) {
            delete g.timestampMs;
            if (g.detectedAt) delete g.detectedAt.timestampMs;
        }
        return JSON.stringify(g);
    };
    function proveAgainstReplay(schedule, A) {
        const tilt = TILT_CLIPS.has(clip);
        const file = join(REPLAY_DIR, tilt ? "tilt" : "def", `replay-${stem}-${schedule.slug}.json`);
        if (!existsSync(file)) fatal(`${file}: missing`);
        const e = JSON.parse(readFileSync(file, "utf8"));
        if (e.seed !== 1 || e.seedPolicy !== "frame") fatal(`${file}: seed ${e.seed}, policy ${e.seedPolicy}`);
        if (e.metricsVersion !== METRICS_VERSION) fatal(`${file}: metricsVersion ${e.metricsVersion}`);
        if (e.processingResolution?.width !== width || e.processingResolution?.height !== height) fatal(`${file}: processingResolution ${JSON.stringify(e.processingResolution)}`);
        // The default runs stamp pts * 1000 over 2 loops: the same frames as a prefix, the stamp apart.
        // The tilt form runs this probe's 6 loops, unwrapped: every frame, the stamp included.
        if (tilt && e.frames.length !== A.records.length) fatal(`${file}: ${e.frames.length} frames, this run ${A.records.length}`);
        for (let k = 0; k < e.frames.length; k++) {
            if (k >= A.records.length || mask(A.records[k], !tilt) !== mask(e.frames[k], !tilt)) fatal(`check D: ${clip}, ${schedule.name}: frame ${k} differs from ${file}`);
        }
        return { file: `${tilt ? "tilt" : "def"}/replay-${stem}-${schedule.slug}.json`, frames: e.frames.length, sha: sha256(readFileSync(file)), stamps: tilt };
    }

    const result = { clip, width, height, sourceWidth: sw, sourceHeight: sh, K: Array.from(K), clipDurationS, decodedFrames: frames.length, schedules: {} };
    const only = ONLY === null ? null : { key: ONLY.split(":")[0], seed: Number(ONLY.split(":")[1]) };
    for (const schedule of SCHEDULES) {
        if (schedule.key !== CHILD_SCHEDULE) continue;
        const S = { runs: [], checkD: null };
        for (const seed of SEEDS) {
            if (only !== null && only.seed !== seed) continue;
            const A = run(schedule, seed, {});
            if (seed === 1) S.checkD = proveAgainstReplay(schedule, A);
            // ---- "the export": run A's records through JSON, with what an export carries beside them ----
            const ex = JSON.parse(JSON.stringify({ processingResolution: { width, height }, target: { widthPx: target.meta.widthPx, heightPx: target.meta.heightPx }, frames: A.records }));
            if (BREAK === "q1-H") {
                const f = ex.frames.find((x) => x.ok);
                f.H[0] *= 1 + 2 ** -40;
            }
            const Kx = intrinsics(ex.processingResolution.width, ex.processingResolution.height);
            for (let i = 0; i < 9; i++) if (!Object.is(Kx[i], K[i])) fatal(`${clip}: K from processingResolution differs from the replay's at ${i}`);
            const tp = targetCorners(ex.target.widthPx, ex.target.heightPx);
            const counted = new Set(countedLoopFrames(A.records, { clipDurationS, ...COUNTED }));
            const loopOf = new Map();
            for (let L = COUNTED.firstLoop; L < COUNTED.firstLoop + COUNTED.loopCount; L++) {
                for (const f of countedLoopFrames(A.records, { clipDurationS, firstLoop: L, loopCount: 1 })) loopOf.set(f, L);
            }
            const n = ex.frames.length;
            const derived = ex.frames.map((f) => {
                if (!f.ok) return { tilt: null, cfGood: null, CF: null, GUARD: null, ALL: null };
                const cf = closedFormPose(f.H, Kx);
                const tilt = cf.good ? tiltDegOf(cf.R) : null;
                const CF = cf.good ? cornersOf(cf, f.H, Kx, tp) : null;
                const tq = BREAK === "q1-threshold" ? T - 0.5 : T;
                const GUARD = tilt !== null && tilt < tq ? CF : f.poseCorners;
                const ALL = tilt !== null && tilt < T_ALL ? CF : f.poseCorners;
                return { tilt, cfGood: cf.good, CF, GUARD, ALL };
            });
            const R = { seed, frames: n, counted: counted.size };
            // ---- Q1: the guard and CF, against the tracker's own output ----
            if (campaign) {
                const G10 = run(schedule, seed, { poseGuard: { mode: "closed-form-below", thresholdDeg: T } });
                const G180 = run(schedule, seed, { poseGuard: { mode: "closed-form-below", thresholdDeg: T_ALL } });
                if (BREAK === "tracking") G10.records.find((x) => x.ok).numInliers++;
                for (const [name, G] of [["G10", G10], ["G180", G180]]) {
                    const breach = trackingBreach(A, G, true);
                    if (breach !== null) fatal(`${clip}, ${schedule.name}, seed ${seed}: run ${name}'s tracking differs from run A's: ${breach}`);
                }
                const q1 = { frames: n, guard: { identical: 0, maxDiff: 0 }, all: { identical: 0, maxDiff: 0 }, pureCF: { identical: 0, cfNotGood: 0, other: 0 }, tiltRead: 0 };
                for (let k = 0; k < n; k++) {
                    const d = derived[k];
                    const g = G10.records[k].poseCorners;
                    const a = G180.records[k].poseCorners;
                    if (sameCorners(d.GUARD, g)) q1.guard.identical++;
                    else fatal(`${clip}, ${schedule.name}, seed ${seed}, frame ${k}: Q1: the guard derived from the export is not run G10's poseCorners (largest difference ${cornerDiff(d.GUARD, g)} px)`);
                    if (sameCorners(d.ALL, a)) q1.all.identical++;
                    else fatal(`${clip}, ${schedule.name}, seed ${seed}, frame ${k}: Q1: CF at 180 derived from the export is not run G180's poseCorners (largest difference ${cornerDiff(d.ALL, a)} px)`);
                    // The pure CF arm: CF's corners on every posed frame. It differs from G180 only where the closed form is not good,
                    // and guardPose keeps the selection there.
                    if (ex.frames[k].ok) {
                        if (sameCorners(d.CF, a)) q1.pureCF.identical++;
                        else if (d.cfGood === false) q1.pureCF.cfNotGood++;
                        else q1.pureCF.other++;
                    }
                    // The guard's own reading of the tilt, against the one derived from the export.
                    const r = G10.ticks[k].guard;
                    if (ex.frames[k].ok) {
                        const want = BREAK === "q1-tilt" && d.tilt !== null ? d.tilt + 1e-12 : d.tilt;
                        if (r === null || !Object.is(r.tiltDeg, want) || r.guarded !== (want !== null && want < T)) fatal(`${clip}, ${schedule.name}, seed ${seed}, frame ${k}: the tracker's poseGuard reading ${JSON.stringify(r)} is not the derived tilt ${want}`);
                        q1.tiltRead++;
                    }
                }
                if (q1.pureCF.other !== 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: ${q1.pureCF.other} posed frames where CF's corners differ from run G180's with a good closed form`);
                R.q1 = q1;
            }
            // ---- Q1's filter, and Q2: the static clip ----
            if (isStatic) {
                const F = run(schedule, seed, { poseFilter: { mode: "one-euro" } }, true);
                const FW = run(schedule, seed, { poseFilter: { mode: "one-euro" } }, false);
                for (const [name, X, stamps] of [["F", F, true], ["FW", FW, false]]) {
                    const breach = trackingBreach(A, X, stamps);
                    if (breach !== null) fatal(`${clip}, ${schedule.name}, seed ${seed}: run ${name}'s tracking differs from run A's: ${breach}`);
                }
                const filteredOf = (X) => X.ticks.filter((t, k) => t.passThrough === false && X.records[k].state === "TRACK").length;
                const fF = BREAK === "filter-none" ? 0 : filteredOf(F);
                const twoTrack = A.records.some((r, k) => k > 0 && r.state === "TRACK" && A.records[k - 1].state === "TRACK");
                if (twoTrack && fF === 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: the filter filtered no frame`);
                /** The filter rebuilt from run A, on `input(k)` as its pose, with the stamps `stampOf(k)`; compared with `X`'s poseCorners. */
                const rebuild = (X, input, stampOf) => {
                    const pf = new PoseFilter(LAYERS);
                    const r = { identical: 0, differ: 0, maxDiff: 0, nullMismatch: 0 };
                    for (let k = 0; k < n; k++) {
                        const f = ex.frames[k];
                        const pose = pf.apply({ ok: f.ok, state: f.state, pose: f.ok ? input(k) : null, timestampMs: stampOf(k) });
                        const c = f.ok && pose !== null ? cornersOf(pose, f.H, Kx, tp) : null;
                        const want = X.records[k].poseCorners;
                        if (sameCorners(c, want)) r.identical++;
                        else {
                            r.differ++;
                            const dd = cornerDiff(c, want);
                            if (dd === Infinity) r.nullMismatch++;
                            else r.maxDiff = Math.max(r.maxDiff, dd);
                        }
                    }
                    return r;
                };
                const stampF = (k) => (BREAK === "filter-stamp" ? FW.records[k].timestampMs : F.records[k].timestampMs);
                // The control: the true input, which no export carries.
                const control = rebuild(F, (k) => A.ticks[k].sel, stampF);
                if (control.differ !== 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: the rebuilt filter on the true selected pose differs from run F on ${control.differ} frames: the harness does not reproduce the tracker`);
                const controlW = rebuild(FW, (k) => A.ticks[k].sel, (k) => FW.records[k].timestampMs);
                if (controlW.differ !== 0) fatal(`${clip}, ${schedule.name}, seed ${seed}: the rebuilt filter differs from run FW on ${controlW.differ} frames`);
                // From the export alone: (a) CF on H; (b) the pose recovered from poseCorners.
                const fromCF = rebuild(F, (k) => closedFormPose(ex.frames[k].H, Kx), stampF);
                const recovered = new Array(n).fill(null);
                const rec = { recovered: 0, noCorners: 0, reprojMax: 0, poseRMax: 0, poseTMax: 0 };
                for (let k = 0; k < n; k++) {
                    const f = ex.frames[k];
                    if (!f.ok) continue;
                    if (f.poseCorners === null) {
                        rec.noCorners++;
                        continue;
                    }
                    const G = fitHomography4(tp, f.poseCorners);
                    const p = G === null ? null : closedFormPose(G, Kx);
                    if (p === null || !p.good) {
                        rec.noCorners++;
                        continue;
                    }
                    recovered[k] = p;
                    rec.recovered++;
                    rec.reprojMax = Math.max(rec.reprojMax, cornerDiff(cornersOf(p, f.H, Kx, tp), f.poseCorners));
                    const s = A.ticks[k].sel;
                    for (let i = 0; i < 9; i++) rec.poseRMax = Math.max(rec.poseRMax, Math.abs(p.R[i] - s.R[i]));
                    for (let i = 0; i < 3; i++) rec.poseTMax = Math.max(rec.poseTMax, Math.abs(p.t[i] - s.t[i]));
                }
                const fromCorners = rebuild(F, (k) => recovered[k], stampF);
                // Q2: the readings, the resets and the stamps.
                const sum = (X) => {
                    const s = summarizeRun(X.records, { clipDurationS, loops: COUNTED });
                    return { jitter: s.poseJitterPx, spread: s.poseSpreadPx, posed: s.posePosedFrames, windows: s.poseJitterWindows };
                };
                const resets = (X) => {
                    let stepsBack = 0;
                    let resetOnTrack = 0;
                    for (let k = 1; k < n; k++) {
                        const back = !(X.records[k].timestampMs > X.records[k - 1].timestampMs);
                        if (back) stepsBack++;
                        if (back && X.records[k].state === "TRACK" && X.ticks[k].sel?.good) resetOnTrack++;
                    }
                    return { stepsBack, resetOnTrack, filtered: filteredOf(X), trackFrames: X.records.filter((r) => r.state === "TRACK").length };
                };
                const gaps = [];
                for (let k = 1; k < n; k++) gaps.push(F.records[k].timestampMs - F.records[k - 1].timestampMs);
                const te = [];
                for (let k = 1; k < n; k++) if (F.ticks[k].passThrough === false) te.push(F.records[k].timestampMs - F.records[k - 1].timestampMs);
                const firstApart = (() => {
                    for (let k = 0; k < n; k++) if (!sameCorners(F.records[k].poseCorners, FW.records[k].poseCorners)) return { k, media: F.records[k].mediaTimeSeconds, stamp: FW.records[k].timestampMs, prev: k > 0 ? FW.records[k - 1].timestampMs : null };
                    return null;
                })();
                R.filter = { control: control.identical, controlW: controlW.identical, fromCF, fromCorners, rec, A: sum(A), F: sum(F), FW: sum(FW), resetsF: resets(F), resetsFW: resets(FW), gaps, te, firstApart };
                // The arms for Q4, the filter's included.
                R.filterCorners = F.records.map((r) => r.poseCorners);
            }
            // ---- Q3 and Q4: the counted frames, compact ----
            const sA = summarizeRun(A.records, { clipDurationS, loops: COUNTED });
            R.summary = { jitter: sA.poseJitterPx, spread: sA.poseSpreadPx, posed: sA.posePosedFrames, windows: sA.poseJitterWindows };
            const compact = [];
            for (let k = 0; k < n; k++) {
                const rec0 = A.records[k];
                if (!counted.has(rec0)) continue;
                const f = ex.frames[k];
                compact.push({
                    k,
                    media: f.mediaTimeSeconds,
                    key: f.mediaTimeSeconds.toFixed(6),
                    loop: loopOf.get(rec0),
                    state: f.state,
                    inliers: f.numInliers,
                    stamp: f.timestampMs,
                    tilt: derived[k].tilt,
                    arms: { IPPE: f.poseCorners, CF: derived[k].CF, GUARD: derived[k].GUARD, FILTER: isStatic ? R.filterCorners[k] : null, H: f.corners },
                });
            }
            delete R.filterCorners;
            // The metric two ways: the frozen summary's, and cornerJitter on the compact frames (fatal).
            const keepAll = (f) => f.arms.IPPE !== null && (BREAK !== "metric-cross" || f.media > 0.5);
            const j = armJitter(compact, "IPPE", keepAll, clipDurationS);
            if (!Object.is(j.jitterPx, sA.poseJitterPx) || j.posedFrames !== sA.posePosedFrames || j.jitterWindows !== sA.poseJitterWindows) fatal(`${clip}, ${schedule.name}, seed ${seed}: cornerJitter on the compact frames reads ${j.jitterPx}, the frozen summary ${sA.poseJitterPx}`);
            if (isStatic) {
                const jf = armJitter(compact, "FILTER", (f) => f.arms.FILTER !== null, clipDurationS);
                if (!Object.is(jf.jitterPx, R.filter.F.jitter)) fatal(`${clip}, ${schedule.name}, seed ${seed}: the filter's cornerJitter ${jf.jitterPx}, its summary ${R.filter.F.jitter}`);
            }
            // Below T the guard is CF on every frame that has a tilt; the identity, checked (fatal).
            for (const f of compact) {
                if (f.tilt !== null && f.tilt < T && !sameCorners(f.arms.GUARD, f.arms.CF) && BREAK !== "guard-identity") fatal(`${clip}: below ${T} the guard is not CF at ${f.media}`);
            }
            if (BREAK === "guard-identity") {
                const f = compact.find((x) => x.tilt !== null && x.tilt < T && x.arms.CF !== null);
                if (f) f.arms.GUARD = f.arms.IPPE;
                for (const g of compact) if (g.tilt !== null && g.tilt < T && !sameCorners(g.arms.GUARD, g.arms.CF)) fatal(`${clip}: below ${T} the guard is not CF at ${g.media}`);
            }
            R.compact = compact;
            S.runs.push(R);
            lap(`${clip}, ${schedule.name}, seed ${seed}`);
        }
        result.schedules[schedule.key] = S;
    }
    if (ONLY !== null) return;
    // ---- Q4, in the child: the leave-one-out reads every seed's frames ----
    for (const schedule of SCHEDULES.filter((s) => s.key === CHILD_SCHEDULE)) {
        const S = result.schedules[schedule.key];
        const runs = S.runs.map((r) => ({ frames: r.compact, clipDurationS }));
        const below = (f) => f.tilt !== null && f.tilt < T;
        const whole = () => true;
        const pairs = [
            { name: `CF - IPPE, below ${T}`, X: "IPPE", Y: "CF", select: below },
            { name: `GUARD - IPPE, below ${T}`, X: "IPPE", Y: "GUARD", select: below },
            { name: `GUARD - CF, below ${T}`, X: "CF", Y: "GUARD", select: below },
            ...(isStatic ? [] : [{ name: `CF - IPPE, below ${T}, TRACK frames`, X: "IPPE", Y: "CF", select: (f) => below(f) && f.state === "TRACK" }]),
            ...(clip === CROSS_CLIP
                ? [
                      { name: "GUARD - IPPE, whole clip", X: "IPPE", Y: "GUARD", select: whole },
                      { name: "GUARD - CF, whole clip", X: "CF", Y: "GUARD", select: whole },
                  ]
                : []),
            ...(isStatic ? [{ name: "FILTER on - off, whole clip", X: "IPPE", Y: "FILTER", select: whole }] : []),
        ];
        S.pairs = campaign
            ? pairs.map((p) => {
                  const per = pairPerSeed(runs, p.X, p.Y, p.select);
                  const best = mostInfluential(runs, p.X, p.Y, p.select);
                  const without = best === null ? null : pairPerSeed(runs, p.X, p.Y, p.select, best.key);
                  let at = null;
                  if (best !== null) {
                      const hits = S.runs.flatMap((r) => r.compact.filter((f) => f.key === best.key && f.arms[p.X] !== null && f.arms[p.Y] !== null && p.select(f)));
                      const h = hits[0];
                      at = h ? { state: h.state, inliers: h.inliers, tilt: h.tilt, dist: meanCornerDistance(h.arms[p.X], h.arms[p.Y]), occurrences: hits.length } : null;
                  }
                  return { name: p.name, per, best, without, at };
              })
            : [];
        // Q3: tilt, the counts per loop, the switches; then drop the compact frames from the file.
        for (const r of S.runs) {
            const posed = r.compact.filter((f) => f.arms.H !== null && f.tilt !== null);
            const track = posed.filter((f) => f.state === "TRACK");
            const perLoop = [];
            for (let L = COUNTED.firstLoop; L < COUNTED.firstLoop + COUNTED.loopCount; L++) perLoop.push(posed.filter((f) => f.loop === L && f.tilt < T).length);
            const both = r.compact.filter((f) => f.tilt !== null && f.arms.CF !== null && f.arms.IPPE !== null);
            const sw = [];
            for (let i = 1; i < both.length; i++) {
                const p = both[i - 1];
                const q = both[i];
                if (p.tilt < T !== q.tilt < T) sw.push({ media: q.media, from: p.media, tiltFrom: p.tilt, tiltTo: q.tilt, state: q.state, inliers: q.inliers, jump: meanCornerDistance(q.arms.CF, q.arms.IPPE), atWrap: q.media < p.media });
            }
            // At rest: the corners under H, their fitted speed per one-second window, px/s, TRACK frames (descriptive).
            const speeds = [];
            let speedMaxAt = null;
            const byWindow = new Map();
            for (const f of r.compact) {
                if (f.state !== "TRACK" || f.arms.H === null) continue;
                const w = `${f.loop}:${Math.floor(f.media)}`;
                if (!byWindow.has(w)) byWindow.set(w, []);
                byWindow.get(w).push(f);
            }
            for (const w of byWindow.values()) {
                if (w.length < 4) continue;
                const tm = w.reduce((s, f) => s + f.media, 0) / w.length;
                const ts = w.reduce((s, f) => s + (f.media - tm) ** 2, 0);
                if (ts === 0) continue;
                let v = 0;
                for (let c = 0; c < 4; c++) {
                    for (let ax = 0; ax < 2; ax++) {
                        const m = w.reduce((s, f) => s + f.arms.H[c][ax], 0) / w.length;
                        v += Math.abs(w.reduce((s, f) => s + (f.media - tm) * (f.arms.H[c][ax] - m), 0) / ts);
                    }
                }
                if (speeds.every((x) => x < v / 8)) speedMaxAt = `loop ${w[0].loop}, ${Math.floor(w[0].media)} s`;
                speeds.push(v / 8);
            }
            r.q3 = {
                posed: posed.length,
                track: track.length,
                tilt: fivePoint(posed.map((f) => f.tilt)),
                tiltTrack: fivePoint(track.map((f) => f.tilt)),
                below: posed.filter((f) => f.tilt < T).length,
                perLoop,
                switches: sw,
                speeds: fivePoint(speeds),
                speedWindows: speeds.length,
                speedMaxAt,
            };
            delete r.compact;
        }
    }
    writeFileSync(join(OUT_DIR, `${stem}.${CHILD_SCHEDULE}.result.json`), JSON.stringify(result));
    lap(`${clip}: written`);
}

// =============================================================================================
// The report: stdout, every figure the record uses.
// =============================================================================================
// Function declarations, not consts: the dispatch above runs before this part of the module.
function f4(x) {
    return x === null || x === undefined ? "n/a" : x === Infinity ? "inf" : x.toFixed(4);
}
function f2(x) {
    return x === null || x === undefined ? "n/a" : x.toFixed(2);
}
function ex(x) {
    return x === 0 ? "0" : x.toExponential(2);
}
function span4(xs) {
    const m = mmm(xs);
    return m === null ? "n/a" : `${f4(m.min)} / ${f4(m.med)} / ${f4(m.max)}${m.n < xs.length ? ` (${m.n} of ${xs.length})` : ""}`;
}
function spanInt(xs) {
    const m = mmm(xs);
    return m === null ? "n/a" : `${m.min} / ${m.med} / ${m.max}`;
}
function schedName(clip, s) {
    return `${s.name}${s.key !== "every" && TILT_CLIPS.has(clip) ? `, ${BORROWED}` : ""}`;
}

function report(R, start) {
    const ff = (bin) => execFileSync(bin, ["-version"]).toString().split(/\r?\n/)[0];
    say(`# ${SCRIPT}`);
    say();
    say(`head ${start.head}, tree ${start.tree}, git diff HEAD sha256 ${start.diff}, status ${start.status === "" ? "empty" : JSON.stringify(start.status)}, the same at the end`);
    say(`node ${process.version}; ${ff("ffmpeg")}; ${ff("ffprobe")}`);
    say(`script sha256 ${sha256(readFileSync(fileURLToPath(import.meta.url)))}`);
    say(`inputs: ${INPUTS.map(([p, h]) => `${p.split("/").pop()} ${h.slice(0, 12)}`).join(", ")}`);
    say(`seeds ${SEEDS.join(", ")}, policy frame; ${LOOPS} loops a run, loop 0 warm-up, loops ${COUNTED.firstLoop} to ${COUNTED.firstLoop + COUNTED.loopCount - 1} counted; stamps on the loops' continuous timeline unless named`);
    say(`device schedules: acquisition ${CAMPAIGN.filter((c) => !TILT_CLIPS.has(c)).map((c) => `${c} ${DEVICE_ACQUIRE_MS[c]} ms`).join(", ")}; the tilt clips ${BORROWED}; detection ${DEVICE_DETECT_MS} ms`);
    say(`guard threshold T = ${T} deg (DEFAULT_POSE_GUARD_THRESHOLD_DEG); the CF run's threshold ${T_ALL} deg; filter layers ${JSON.stringify(LAYERS)}`);
    say();
    say("## K, assumed: intrinsics(width, height), 60 deg horizontal field of view");
    say();
    say("| clip | source | processing | fx = fy, px | principal point | frames | loop, s |");
    say("|---|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        const r = R[clip];
        say(`| ${clip} | ${r.sourceWidth} x ${r.sourceHeight} | ${r.width} x ${r.height} | ${f2(r.K[0])} | ${f2(r.K[2])}, ${f2(r.K[5])} | ${r.decodedFrames} | ${r.clipDurationS.toFixed(3)} |`);
    }
    say(`at 720 px of width the same rule gives ${f2(360 / Math.tan(Math.PI / 6))} px`);
    say();
    say("## Check D: the copied decoding and schedules against scripts/replay-clips.mjs's exports, seed 1");
    say();
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const d = R[clip].schedules[s.key].checkD;
            say(`${clip}, ${s.name}: ${d.frames} frames of ${d.file} identical${d.stamps ? ", stamps included" : ", stamps apart (pts x 1000 over 2 loops there)"}, sha256 ${d.sha}`);
        }
    }
    say();

    // ---------------------------------------------------------------- Q1
    say("## Q1: the arms from one export, against the tracker's own output");
    say();
    say("Frames are every processed frame of every run, 6 loops, seeds 1 to 8 summed. Tracking (ok, state, reason, inliers, matches, trackLoss, media time, stamp, tracking fields, H, corners under H, the selected pose) identical between run A and runs G10 and G180 on every frame of every run: checked, fatal.");
    say();
    say("| clip | schedule | frames | GUARD = G10, bit for bit | CF at 180 = G180, bit for bit | posed | pure CF = G180 | CF not good (G180 keeps the selection) | tilt = G10's poseGuard.tiltDeg |");
    say("|---|---|---|---|---|---|---|---|---|");
    for (const clip of CAMPAIGN) {
        for (const s of SCHEDULES) {
            const runs = R[clip].schedules[s.key].runs;
            const sum = (f) => runs.reduce((a, r) => a + f(r.q1), 0);
            const posed = sum((q) => q.pureCF.identical + q.pureCF.cfNotGood + q.pureCF.other);
            say(`| ${clip} | ${schedName(clip, s)} | ${sum((q) => q.frames)} | ${sum((q) => q.guard.identical)} | ${sum((q) => q.all.identical)} | ${posed} | ${sum((q) => q.pureCF.identical)} | ${sum((q) => q.pureCF.cfNotGood)} | ${sum((q) => q.tiltRead)} of ${posed} |`);
        }
    }
    say();
    say("### The filter, rebuilt from run A (pinball-static.mp4)");
    say();
    say("| schedule | frames | control: the true selected pose = F | the same on FW (media-time stamps) | (a) CF on the export's H: identical / differ / largest px | (b) the pose recovered from poseCorners: identical / differ / largest px | recovered / posed without corners | recovered pose: reprojection, R, t, largest abs |");
    say("|---|---|---|---|---|---|---|---|");
    for (const s of SCHEDULES) {
        const runs = R[STATIC_CLIP].schedules[s.key].runs;
        const sum = (f) => runs.reduce((a, r) => a + f(r.filter), 0);
        const max = (f) => Math.max(...runs.map((r) => f(r.filter)));
        say(`| ${s.name} | ${sum((q) => q.fromCF.identical + q.fromCF.differ)} | ${sum((q) => q.control)} | ${sum((q) => q.controlW)} | ${sum((q) => q.fromCF.identical)} / ${sum((q) => q.fromCF.differ)} / ${f4(max((q) => q.fromCF.maxDiff))} (null in one only: ${sum((q) => q.fromCF.nullMismatch)}) | ${sum((q) => q.fromCorners.identical)} / ${sum((q) => q.fromCorners.differ)} / ${ex(max((q) => q.fromCorners.maxDiff))} (null in one only: ${sum((q) => q.fromCorners.nullMismatch)}) | ${sum((q) => q.rec.recovered)} / ${sum((q) => q.rec.noCorners)} | ${ex(max((q) => q.rec.reprojMax))} px, ${ex(max((q) => q.rec.poseRMax))}, ${ex(max((q) => q.rec.poseTMax))} |`);
    }
    say();

    // ---------------------------------------------------------------- Q2
    say("## Q2: the filter's reading, and its clock (pinball-static.mp4)");
    say();
    say("Per seed, summarizeRun's poseJitterPx and poseSpreadPx over the counted loops. A: filter off. F: on, the loops' continuous timeline. FW: on, media time x 1000, which wraps. Cells: min / median / max over seeds 1 to 8.");
    say();
    say("| schedule | A jitter | F jitter | FW jitter | F - A, paired | FW - A, paired | FW - F, paired | A spread | F spread | FW spread | F - A spread, paired | posed frames | windows |");
    say("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const s of SCHEDULES) {
        const runs = R[STATIC_CLIP].schedules[s.key].runs.map((r) => r.filter);
        const col = (f) => span4(runs.map(f));
        say(`| ${s.name} | ${col((q) => q.A.jitter)} | ${col((q) => q.F.jitter)} | ${col((q) => q.FW.jitter)} | ${col((q) => q.F.jitter - q.A.jitter)} | ${col((q) => q.FW.jitter - q.A.jitter)} | ${col((q) => q.FW.jitter - q.F.jitter)} | ${col((q) => q.A.spread)} | ${col((q) => q.F.spread)} | ${col((q) => q.FW.spread)} | ${col((q) => q.F.spread - q.A.spread)} | ${spanInt(runs.map((q) => q.A.posed))} | ${spanInt(runs.map((q) => q.A.windows))} |`);
    }
    say();
    say("Per seed, F - A jitter, px:");
    say();
    say(`| schedule | ${SEEDS.map((s) => `seed ${s}`).join(" | ")} |`);
    say(`|---|${SEEDS.map(() => "---").join("|")}|`);
    for (const s of SCHEDULES) {
        const runs = R[STATIC_CLIP].schedules[s.key].runs.map((r) => r.filter);
        say(`| ${s.name} | ${runs.map((q) => f4(q.F.jitter - q.A.jitter)).join(" | ")} |`);
    }
    say();
    say("Resets and stamps, all 6 loops of a run, min / median / max over seeds:");
    say();
    say("| schedule | run | TRACK frames | frames filtered | stamp steps back | of them on a TRACK frame with a good pose (a reset the clock caused) | first frame where F and FW differ (seed 1): media s, stamp, previous stamp |");
    say("|---|---|---|---|---|---|---|");
    for (const s of SCHEDULES) {
        const runs = R[STATIC_CLIP].schedules[s.key].runs.map((r) => r.filter);
        for (const [name, key] of [["F", "resetsF"], ["FW", "resetsFW"]]) {
            const fa = runs[0].firstApart;
            const apart = name === "FW" ? (fa === null ? "none" : `${fa.media.toFixed(3)}, ${fa.stamp.toFixed(1)}, ${fa.prev === null ? "n/a" : fa.prev.toFixed(1)}`) : "";
            say(`| ${s.name} | ${name} | ${spanInt(runs.map((q) => q[key].trackFrames))} | ${spanInt(runs.map((q) => q[key].filtered))} | ${spanInt(runs.map((q) => q[key].stepsBack))} | ${spanInt(runs.map((q) => q[key].resetOnTrack))} | ${apart} |`);
        }
    }
    say();
    say("The inter-frame timestampMs the filter saw, run F, every frame of every seed (all 6 loops): the gap between consecutive processed frames, and te on the frames it filtered, ms, rounded to 0.1, with counts:");
    say();
    for (const s of SCHEDULES) {
        const runs = R[STATIC_CLIP].schedules[s.key].runs.map((r) => r.filter);
        const hist = (xs) => {
            const m = new Map();
            for (const x of xs) m.set(x.toFixed(1), (m.get(x.toFixed(1)) ?? 0) + 1);
            return [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([v, c]) => `${v} x ${c}`).join(", ");
        };
        const gaps = runs.flatMap((q) => q.gaps);
        const te = runs.flatMap((q) => q.te);
        const g5 = fivePoint(gaps);
        say(`${s.name}: gaps ${gaps.length}, min / p50 / max ${g5[0].toFixed(3)} / ${g5[2].toFixed(3)} / ${g5[4].toFixed(3)}: ${hist(gaps)}`);
        say(`${s.name}: te on filtered frames ${te.length}: ${hist(te)}`);
    }
    say();

    // ---------------------------------------------------------------- Q3
    say("## Q3: what the corpus expresses");
    say();
    say("Tilt is the guard's: acos(R[8]) of closedFormPose(H, K), on posed frames of the counted loops (a good closed form, corners under H). Cells: min / median / max over seeds 1 to 8.");
    say();
    say("| clip | schedule | posed | TRACK | tilt min | p10 | p50 | p90 | max | TRACK tilt p50 / max | below 10 deg | below 10 deg, per counted loop (loops 1 to 4), seed medians |");
    say("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const q = R[clip].schedules[s.key].runs.map((r) => r.q3);
            const t = (i) => span2(q.map((x) => (x.tilt ? x.tilt[i] : null)));
            const loops = [0, 1, 2, 3].map((L) => mmm(q.map((x) => x.perLoop[L])).med).join(", ");
            say(`| ${clip}${DESCRIPTIVE.includes(clip) ? " (descriptive)" : ""} | ${schedName(clip, s)} | ${spanInt(q.map((x) => x.posed))} | ${spanInt(q.map((x) => x.track))} | ${t(0)} | ${t(1)} | ${t(2)} | ${t(3)} | ${t(4)} | ${span2(q.map((x) => (x.tiltTrack ? x.tiltTrack[2] : null)))}; ${span2(q.map((x) => (x.tiltTrack ? x.tiltTrack[4] : null)))} | ${spanInt(q.map((x) => x.below))} | ${loops} |`);
        }
    }
    say();
    say("### The guard's switches, counted loops, between consecutive frames with tilt and both IPPE's and CF's corners");
    say();
    say("| clip | schedule | switches a run | in the footage | at a loop wrap |");
    say("|---|---|---|---|---|");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const q = R[clip].schedules[s.key].runs.map((r) => r.q3);
            say(`| ${clip} | ${schedName(clip, s)} | ${spanInt(q.map((x) => x.switches.length))} | ${spanInt(q.map((x) => x.switches.filter((w) => !w.atWrap).length))} | ${spanInt(q.map((x) => x.switches.filter((w) => w.atWrap).length))} |`);
        }
    }
    say();
    for (const clip of [CROSS_CLIP]) {
        for (const s of SCHEDULES) {
            const q = R[clip].schedules[s.key].runs.map((r) => r.q3);
            const groups = new Map();
            for (const [i, x] of q.entries()) {
                for (const w of x.switches) {
                    const key = `${w.atWrap ? "wrap" : "footage"} ${w.media.toFixed(3)}`;
                    if (!groups.has(key)) groups.set(key, { w, seeds: new Set(), n: 0, tilts: [], jumps: [], states: new Set(), inl: [] });
                    const g = groups.get(key);
                    g.seeds.add(SEEDS[i]);
                    g.n++;
                    g.tilts.push(w.tiltFrom, w.tiltTo);
                    g.jumps.push(w.jump);
                    g.states.add(w.state);
                    g.inl.push(w.inliers);
                }
            }
            say(`${clip}, ${schedName(clip, s)}: the switches by media time:`);
            for (const [key, g] of [...groups.entries()].sort()) {
                say(`  ${key} s: ${g.n} switches in ${g.seeds.size} of 8 seeds; tilt ${Math.min(...g.tilts).toFixed(2)} to ${Math.max(...g.tilts).toFixed(2)} deg; state ${[...g.states].join(", ")}; inliers ${Math.min(...g.inl)} to ${Math.max(...g.inl)}; jump CF to IPPE ${Math.min(...g.jumps).toFixed(2)} to ${Math.max(...g.jumps).toFixed(2)} px`);
            }
        }
    }
    say();
    say("### The filter at rest: pinball-static.mp4, the clip as a whole");
    say();
    say("| schedule | counted frames | posed | TRACK | frames filtered, run F (all 6 loops) | windows | corners under H, fitted speed per one-second window, px/s, p50 / p90 / max, each min / median / max over seeds (descriptive) | windows read | the fastest window, seed 1 |");
    say("|---|---|---|---|---|---|---|---|---|");
    for (const s of SCHEDULES) {
        const runs = R[STATIC_CLIP].schedules[s.key].runs;
        const q = runs.map((r) => r.q3);
        say(`| ${s.name} | ${spanInt(runs.map((r) => r.counted))} | ${spanInt(q.map((x) => x.posed))} | ${spanInt(q.map((x) => x.track))} | ${spanInt(runs.map((r) => r.filter.resetsF.filtered))} | ${spanInt(runs.map((r) => r.summary.windows))} | ${span2(q.map((x) => x.speeds[2]))}; ${span2(q.map((x) => x.speeds[3]))}; ${span2(q.map((x) => x.speeds[4]))} | ${spanInt(q.map((x) => x.speedWindows))} | ${q[0].speedMaxAt} |`);
    }
    say();

    // ---------------------------------------------------------------- Q4
    say("## Q4: the seeds' spread against the differences, device schedules");
    say();
    say("Per comparison Y - X, jitter by the frozen cornerJitter on one run's counted frames where both arms have corners and the selection holds (common frames by construction). d is the paired difference per seed. Spread is max - min over the seeds of each arm's own reading. Without: the single media time (all its occurrences, every seed) whose removal moves the median of d the most.");
    say();
    for (const clip of CAMPAIGN) {
        for (const s of SCHEDULES.filter((x) => x.key !== "every")) {
            const S = R[clip].schedules[s.key];
            say(`### ${clip}, ${schedName(clip, s)}`);
            say();
            say("| comparison | frames | windows | X | Y | spread X, bit-for-bit distinct of 8 | spread Y, the same | d = Y - X | above / below / zero of 8 | without that media time: d | above / below / zero | the media time, s: occurrences, state, inliers, tilt, distance X to Y px |");
            say("|---|---|---|---|---|---|---|---|---|---|---|---|");
            for (const p of S.pairs) {
                const xs = p.per.map((q) => q.x);
                const ys = p.per.map((q) => q.y);
                const ds = p.per.map((q) => q.d);
                const range = (v) => {
                    const m = mmm(v);
                    return m === null ? "n/a" : `${ex(m.max - m.min)} (${new Set(v.filter((x) => x !== null)).size} distinct)`;
                };
                const sg = (v) => {
                    const z = signs(v.filter((x) => x !== null));
                    return `${z.above} / ${z.below} / ${z.zero}`;
                };
                const wd = p.without ? p.without.map((q) => q.d) : [];
                const at = p.best === null ? "n/a" : p.best.move === 0 ? "none: no media time moves the median" : `${p.best.key}: ${p.at ? `${p.at.occurrences}, ${p.at.state}, ${p.at.inliers}, ${f2(p.at.tilt)} deg, ${f4(p.at.dist)}` : "n/a"}`;
                say(`| ${p.name} | ${spanInt(p.per.map((q) => q.frames))} | ${spanInt(p.per.map((q) => q.windows))} | ${span4(xs)} | ${span4(ys)} | ${range(xs)} | ${range(ys)} | ${span4(ds)} | ${sg(ds)} | ${p.without ? span4(wd) : "n/a"} | ${p.without ? sg(wd) : "n/a"} | ${at} |`);
            }
            say();
            say(`per seed d, ${S.pairs.map((p) => p.name).join("; ")}:`);
            for (const p of S.pairs) say(`  ${p.name}: ${p.per.map((q) => f4(q.d)).join(", ")}`);
            say();
        }
    }
    say("## Whole-run readings, run A, every schedule (summarizeRun's poseJitterPx / poseSpreadPx)");
    say();
    say("| clip | schedule | posed | windows | poseJitterPx | poseSpreadPx |");
    say("|---|---|---|---|---|---|");
    for (const clip of CLIPS) {
        for (const s of SCHEDULES) {
            const runs = R[clip].schedules[s.key].runs.map((r) => r.summary);
            say(`| ${clip} | ${schedName(clip, s)} | ${spanInt(runs.map((q) => q.posed))} | ${spanInt(runs.map((q) => q.windows))} | ${span4(runs.map((q) => q.jitter))} | ${span4(runs.map((q) => q.spread))} |`);
        }
    }
}
function span2(xs) {
    const m = mmm(xs);
    return m === null ? "n/a" : `${f2(m.min)} / ${f2(m.med)} / ${f2(m.max)}`;
}

// =============================================================================================
// Q5: what a page export carries of what each arm needs.
// =============================================================================================
function pageExports(files) {
    if (files.length === 0) fatal("--page-export needs at least one file");
    let missingAny = false;
    say(`# ${SCRIPT} --page-export`);
    say();
    for (const file of files) {
        const bytes = readFileSync(file);
        const e = JSON.parse(bytes.toString("utf8"));
        if (BREAK === "q5-missing") delete e.processingResolution;
        const frames = Array.isArray(e.frames) ? e.frames : [];
        const ok = frames.filter((f) => f.ok);
        const finite = (x) => typeof x === "number" && Number.isFinite(x);
        const has = {
            "frames[].H, 9 finite numbers on every ok frame": ok.length > 0 && ok.every((f) => Array.isArray(f.H) && f.H.length === 9 && f.H.every(finite)),
            "frames[].poseCorners, a key on every frame": frames.length > 0 && frames.every((f) => "poseCorners" in f),
            "frames[].mediaTimeSeconds, finite on every frame": frames.length > 0 && frames.every((f) => finite(f.mediaTimeSeconds)),
            "frames[].timestampMs, finite on every frame": frames.length > 0 && frames.every((f) => finite(f.timestampMs)),
            "frames[].state and ok, on every frame": frames.length > 0 && frames.every((f) => typeof f.ok === "boolean" && ["LOST", "DETECT", "TRACK"].includes(f.state)),
            processingResolution: Number.isInteger(e.processingResolution?.width) && Number.isInteger(e.processingResolution?.height),
            "target.widthPx and heightPx": Number.isInteger(e.target?.widthPx) && Number.isInteger(e.target?.heightPx),
            "tracker.options.poseFilter": typeof e.tracker?.options?.poseFilter?.mode === "string",
            "seed and seedPolicy, keys": "seed" in e && "seedPolicy" in e,
            "clipDurationS and loops": finite(e.clipDurationS) && e.loops !== null && typeof e.loops === "object",
            metricsVersion: e.metricsVersion === 2,
        };
        const missing = Object.entries(has).filter(([, v]) => !v).map(([k]) => k);
        if (missing.length > 0) missingAny = true;
        say(`## ${file.split(/[\\/]/).pop()}, sha256 ${sha256(bytes)}`);
        say();
        say(`metricsVersion ${e.metricsVersion}; mode ${e.mode}; bundledClip ${e.bundledClip}; seed ${e.seed}, seedPolicy ${e.seedPolicy}; tracker.options.poseFilter ${JSON.stringify(e.tracker?.options?.poseFilter)}; processingResolution ${JSON.stringify(e.processingResolution)}; target ${e.target?.widthPx} x ${e.target?.heightPx}; loops ${JSON.stringify(e.loops)}; clipDurationS ${e.clipDurationS}; frames ${frames.length}, ok ${ok.length}, TRACK ${frames.filter((f) => f.state === "TRACK").length}; provenance manifest head ${e.provenance?.manifest?.head ?? "n/a"}, clean ${e.provenance?.manifest?.clean ?? "n/a"}; protocol.sessionRun ${e.protocol?.sessionRun}, gaps ${JSON.stringify(e.protocol?.gaps ?? null)}`);
        say();
        for (const [k, v] of Object.entries(has)) say(`- ${v ? "present" : "MISSING"}: ${k}`);
        say("- K: not in the export; the arms take intrinsics(processingResolution), the 60 deg default the page's tracker is built with");
        if (missing.length === 0) {
            const K = intrinsics(e.processingResolution.width, e.processingResolution.height);
            const tp = targetCorners(e.target.widthPx, e.target.heightPx);
            let cf = 0;
            let cfNotGood = 0;
            let below = 0;
            let recovered = 0;
            let noCorners = 0;
            let reproj = 0;
            let stepsBack = 0;
            for (const [k, f] of frames.entries()) {
                if (k > 0 && !(f.timestampMs > frames[k - 1].timestampMs)) stepsBack++;
                if (!f.ok) continue;
                const p = closedFormPose(Float64Array.from(f.H), K);
                if (!p.good) {
                    cfNotGood++;
                    continue;
                }
                cf++;
                if (tiltDegOf(p.R) < T) below++;
                if (f.poseCorners === null) {
                    noCorners++;
                    continue;
                }
                const G = fitHomography4(tp, f.poseCorners);
                const q = G === null ? null : closedFormPose(G, K);
                if (q === null || !q.good) {
                    noCorners++;
                    continue;
                }
                recovered++;
                const fr = frameRecord({ mode: "tracking", result: { ok: true, pose: q, H: f.H, sceneKeypoints: [], numMatches: 0, numInliers: 0, state: "TRACK", quality: 0, trackLoss: null, tracking: null, timings: null }, stageTimings: {}, timestampMs: 0, mediaTimeSeconds: 0, targetPoints: tp, K });
                reproj = Math.max(reproj, cornerDiff(fr.poseCorners, f.poseCorners));
            }
            const counted = e.loops && e.clipDurationS ? countedLoopFrames(frames, { clipDurationS: e.clipDurationS, ...e.loops }) : frames;
            const j = cornerJitter(counted.map((f) => ({ ...f, corners: f.poseCorners })), { clipDurationS: e.clipDurationS });
            say(`- CF and the guard computed on ${cf} of ${ok.length} ok frames (closed form not good on ${cfNotGood}); ${below} below ${T} deg`);
            say(`- a pose recovered from poseCorners on ${recovered} (posed without corners ${noCorners}), reprojecting onto them within ${ex(reproj)} px`);
            say(`- timestampMs steps back ${stepsBack} times over ${frames.length} frames`);
            say(
                e.tracker.options.poseFilter.mode === "off"
                    ? "- the filter is off: poseCorners are the unfiltered pose (IPPE's selection); a filter arm needs the pose recovered from them, timestampMs, state and ok, and the filter's parameters"
                    : "- the filter is on: poseCorners are the filter's output; the unfiltered selection is not in this export, while CF and the guard, from H, are computable",
            );
            say(`- poseJitterPx over the counted loops ${f4(j.jitterPx)}, against the export's runSummary.poseJitterPx ${f4(e.runSummary?.poseJitterPx ?? null)}`);
        }
        say();
    }
    if (missingAny) {
        process.stdout.write(out.join("\n") + "\n");
        fatal("a page export lacks what an arm needs (above)");
    }
}
