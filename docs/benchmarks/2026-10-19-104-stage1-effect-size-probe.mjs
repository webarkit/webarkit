/*
 *  2026-10-19-104-stage1-effect-size-probe.mjs
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
 * #104's Stage 1 probe, round 1's effect-size statement: what change in
 * jitterPx #104's refusal would produce on the wall clip, as a function of
 * the threshold, read on the group's common media times against the
 * replicate floor. The computation behind
 * docs/benchmarks/2026-10-19-104-stage1-effect-size-probe.md. It reads the
 * nine committed wall-clip exports beside it, the frozen metrics module, the
 * built bundle (for `intrinsics` and `decode`) and the committed target, and
 * writes nothing. No device, no bench page, no replay: read-only on evidence.
 *
 *     npm run build   (once: the bundle in examples/dist/ is what `intrinsics` is imported from)
 *     node docs/benchmarks/2026-10-19-104-stage1-effect-size-probe.mjs
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The exports: M3's sync and worker runs of 2026-10-01 on the wall clip
 *    (four each) and M4's pre-flight of 2026-10-13, the committed relatives of
 *    round 1's instrument. Each is read over its counted loops 1 to 4
 *    (countedLoopFrames with the export's loops and clipDurationS), as
 *    2026-10-18-137-stage1-probe.mjs reads them. The recomputed whole-set
 *    jitterPx must equal the recorded runSummary.jitterPx exactly (fatal).
 * 2. The signal per posed frame, the route of #104's probe
 *    (2026-10-16-104-stage1-probe.mjs, step 3 of its method, its functions
 *    copied verbatim below): H recovered from the export's four corners, which
 *    are reprojectCorners(H, targetCorners(512, 640)) and determine it; the
 *    recovery is checked by reprojecting the corners (fatal above 1e-6 px);
 *    K = intrinsics(width, height) of the export's processing resolution;
 *    B = K⁻¹H; d_scale = ‖b1‖/‖b2‖ − 1, d_orth = b1·b2/(‖b1‖‖b2‖), as #104
 *    defines them. The exports carry no H and no fit residual; the corners
 *    are what they carry, and four correspondences determine H up to scale,
 *    which the signal is invariant to.
 * 3. The readings. A refusal is cornerJitter's own `include`: the metric is
 *    imported, never reimplemented. Kind S refuses a frame whose |d_scale|
 *    exceeds τ, O one whose |d_orth| does, E one where either does. Scope
 *    "detect" applies the refusal to DETECT frames only, the reading of #104's
 *    probe (its filters S, O, E) and of #137's probe (a non-DETECT frame is
 *    always kept); scope "all" applies it to every posed frame, TRACK frames
 *    included, the literal reading of #104's "the fitted homography". τ runs
 *    over a fixed grid; no value on it is proposed.
 * 4. Per run and reading: posed frames refused, the windows that lose
 *    eligibility (keyed as cornerJitter keys them, loop:floor(mediaTime)),
 *    whole-set jitterPx. The window keying must reproduce the module's
 *    jitterWindows under every reading of every run (fatal).
 * 5. The group: M3's four sync runs, the replicate group whose common-set
 *    ratio is the floor the plan names (1.46). Its common media times under a
 *    reading are the intersection of the four runs' media keys
 *    (mediaKey(mediaTimeSeconds)) of frames with corners that pass the
 *    reading, rebuilt per reading, and each run's figure on it is
 *    cornerJitter with include restricted to passing frames at those keys:
 *    the construction of 2026-10-18-137-stage1-probe.mjs, question 2, which
 *    this script must reproduce under that probe's five readings to the
 *    printed digit before any figure of its own is printed (fatal). A media
 *    key is a time within the clip, so one key can match one frame per loop.
 * 6. Per τ, the group's figures on its common media times, their ratio and
 *    range (the floor's form), each run's change against the none reading as
 *    a ratio and in px, and two decompositions of that change: the run read
 *    on the none reading's common set with only its own refusals applied
 *    ("fixed set"), and the run read on the τ reading's common set with no
 *    refusal of its own ("τ keys only"). The media keys that leave the
 *    intersection are named, with the runs that refuse a frame there; the
 *    common-set windows that drop are named with their frame counts before
 *    and after, and flagged when they held exactly four frames, the
 *    eligibility boundary.
 * 7. The independent reviewer's figures (the document's "Independent: a
 *    reviewer's attempt"), recomputed on the primary reading: the figure at
 *    every breakpoint of τ (the E of every posed DETECT frame of the group's
 *    runs), with each run's smallest change ratio and largest own-refusal
 *    movement; the E of every frame at the two instants that leave first;
 *    the anatomy of the four-frame windows (a regression repeated only to
 *    read a window's own residual and a frame's deviation from the line
 *    through the others, checked bit for bit against the module at n ≥ 4);
 *    the same regression under n ≥ 3; a single-key jackknife on the none
 *    common set; the six pairwise common sets; and the signal under other
 *    intrinsics.
 *
 * The checks, all fatal: a failed check exits non-zero naming what disagrees,
 * and no figure is printed after it. The bundle's manifest names a commit, a
 * clean tree and a bundle hash; the bundle's bytes and the metrics module's
 * bytes hash to what the manifest records for them, before either is
 * imported (the module's hash is printed in the provenance line, and compared
 * only where the manifest carries an entry for it). Every export named must
 * exist, carry metricsVersion 1, the wall clip, loops, one processing
 * resolution shared by all nine, and the committed target's sha256 and size;
 * every frame with corners is ok and carries a numeric numInliers; the
 * whole-set jitterPx reproduces exactly; K has no skew; every H recovery
 * reprojects its corners to 1e-6 px or better; the window keying reproduces
 * jitterWindows under every reading; the floor's five readings reproduce the
 * record's printed figures. A missing or malformed input never falls back to
 * a default: it fails.
 *
 * Revised 2026-10-19 after the review of #153: the two hash checks above; a
 * floor on τ (TAU_FLOOR, with its source) and the breakpoint sweep re-read
 * above it; the single-key jackknife's range and the windows each mover sits
 * in; and the curve against the floor's jackknifed value. No figure of the
 * curve changed.
 *
 * A known limitation, as every derivation script's here: no test and no
 * format check cover `docs/`, so this script could break silently later while
 * its figures stay in the record, and a defect of its own would reproduce.
 * Its guards are the checks above, which catch a changed module, a changed
 * export or a changed target, not a defect in the signal arithmetic, which is
 * the probe's, copied.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = "2026-10-19-104-stage1-effect-size-probe.mjs";

const fatal = (message) => {
    console.error(`${SCRIPT}: ${message}`);
    process.exit(1);
};
const g = (v, d = 2) => (v === null || v === undefined ? "null" : v.toFixed(d));
const f = (v, d = 2) => (v === null || v === undefined ? "null" : (v >= 0 ? "+" : "") + v.toFixed(d));

// ---- the frozen module, the bundle, the target --------------------------------------------
const METRICS_REL = "examples/js/bench-metrics.mjs";
const METRICS_PATH = join(HERE, `../../${METRICS_REL}`);
const BUNDLE_PATH = join(HERE, "../../examples/dist/webarkit-packages.mjs");
const MANIFEST_PATH = join(HERE, "../../examples/dist/provenance.json");
const TARGET_PATH = join(HERE, "../../examples/targets/pinball.wnft");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
// The manifest is read first, then the bytes on disk are hashed against it, and only then is either
// module imported: no figure is computed from a bundle or a metrics module whose hash the manifest
// does not carry. The manifest's claims are read, not defaulted: one that names no commit, no bundle
// hash, or a dirty tree is refused, since the provenance line below would then state something
// unknown. A bundle or a module whose bytes differ from the manifest's entry is refused the same way:
// the manifest would then describe a build other than the one the figures are computed against
// (the review of 2026-10-19 on #153, the second finding).
if (!existsSync(MANIFEST_PATH)) fatal(`no manifest at ${MANIFEST_PATH}: the bundle's provenance cannot be stated`);
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
if (typeof manifest.head !== "string" || !/^[0-9a-f]{40}$/.test(manifest.head)) fatal(`the manifest names no commit (head ${JSON.stringify(manifest.head)})`);
if (manifest.clean !== true) fatal(`the manifest records an unclean tree (clean ${JSON.stringify(manifest.clean)}, dirty ${JSON.stringify(manifest.dirtyPaths)}): rebuild from a clean tree`);
if (typeof manifest.bundle?.sha256 !== "string") fatal("the manifest records no bundle sha256");
if (!existsSync(BUNDLE_PATH)) fatal(`no bundle at ${BUNDLE_PATH} (run npm run build first)`);
if (!existsSync(METRICS_PATH)) fatal(`no metrics module at ${METRICS_PATH}`);
const BUNDLE_SHA = sha256(readFileSync(BUNDLE_PATH));
const METRICS_SHA = sha256(readFileSync(METRICS_PATH));
if (BUNDLE_SHA !== manifest.bundle.sha256) fatal(`the bundle's sha256 is ${BUNDLE_SHA}, the manifest records ${manifest.bundle.sha256}: the bundle on disk is not the one the manifest describes`);
// The metrics module is served unbuilt and the manifest hashes it under `served`; where that entry
// exists the bytes must match it, and where it does not, the hash computed here is what the
// provenance line states, since a path is not provenance.
const metricsEntry = manifest.served?.[METRICS_REL]?.sha256;
if (typeof metricsEntry === "string" && metricsEntry !== METRICS_SHA) fatal(`the metrics module's sha256 is ${METRICS_SHA}, the manifest records ${metricsEntry} for ${METRICS_REL}: the module on disk is not the one the manifest describes`);
const METRICS_PROVENANCE = typeof metricsEntry === "string" ? `${METRICS_SHA} (equal to the manifest's served entry)` : `${METRICS_SHA} (no manifest entry for it: hashed here)`;
let metrics;
let bundle;
try {
    metrics = await import(pathToFileURL(METRICS_PATH).href);
} catch (err) {
    fatal(`cannot import ${METRICS_PATH}: ${err?.message ?? err}`);
}
try {
    bundle = await import(pathToFileURL(BUNDLE_PATH).href);
} catch (err) {
    fatal(`cannot import ${BUNDLE_PATH} (run npm run build first): ${err?.message ?? err}`);
}
const { cornerJitter, countedLoopFrames, isLoopWrap, mediaKey, targetCorners, METRICS_VERSION, JITTER_WINDOW_S } = metrics;
const { intrinsics, decode } = bundle;
if (typeof intrinsics !== "function" || typeof decode !== "function") fatal("the bundle exports no intrinsics or no decode");
const targetBytes = readFileSync(TARGET_PATH);
const TARGET_SHA = sha256(targetBytes);
const decoded = decode(new Uint8Array(targetBytes));
if (!decoded.ok) fatal(`the target does not decode: ${decoded.error}`);
const TARGET_W = decoded.target.meta.widthPx;
const TARGET_H = decoded.target.meta.heightPx;
const TP = targetCorners(TARGET_W, TARGET_H);

// ---- H from four corners, and the conditioning signal: 2026-10-16-104-stage1-probe.mjs, verbatim ----
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
// ---- end of the verbatim copy ----------------------------------------------------------------

const RECOVERY_TOLERANCE_PX = 1e-6;
const WALL_CLIP = "pinball-bench.mp4";
const RUN_NAMES = [
    ["sync-wall-1", "2026-10-01-tab9-m3-sync-wall-1"],
    ["sync-wall-2", "2026-10-01-tab9-m3-sync-wall-2"],
    ["sync-wall-3", "2026-10-01-tab9-m3-sync-wall-3"],
    ["sync-wall-4", "2026-10-01-tab9-m3-sync-wall-4"],
    ["worker-wall-1", "2026-10-01-tab9-m3-worker-wall-1"],
    ["worker-wall-2", "2026-10-01-tab9-m3-worker-wall-2"],
    ["worker-wall-3", "2026-10-01-tab9-m3-worker-wall-3"],
    ["worker-wall-4", "2026-10-01-tab9-m3-worker-wall-4"],
    ["m4-preflight-sync-wall", "2026-10-13-tab9-m4-preflight-sync-wall"],
];
const GROUP_NAMES = ["sync-wall-1", "sync-wall-2", "sync-wall-3", "sync-wall-4"];
const TAUS = [0.005, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1, 2, 5];
// The floor on τ below which the record's own measurement says the criterion refuses a right fit:
// on the exact H of #105's sweep's second view, a view that is not a plane homography for the
// camera, the signal reads d_scale 0.0084 and d_orth 0.031
// (2026-10-14-tab9-m4-calibration-session.md, the finding "Four checks that could not distinguish
// the condition they claim to detect"). Kind E refuses a frame when either exceeds τ, so that fit
// is refused at every τ below 0.031. Declared in the document's "A floor on τ" section
// (2026-10-19); the grid is re-read above it, not recomputed, and nothing is claimed below it.
const TAU_FLOOR = 0.031;
const KINDS = {
    E: (c) => Math.max(Math.abs(c.dScale), Math.abs(c.dOrth)),
    S: (c) => Math.abs(c.dScale),
    O: (c) => Math.abs(c.dOrth),
};
const SCOPES = ["detect", "all"];
const isDetect = (fr) => fr.state === "DETECT";

// ---- the exports ----------------------------------------------------------------------------
const runs = new Map();
let resolution = null;
for (const [short, name] of RUN_NAMES) {
    const path = join(HERE, `${name}.json`);
    if (!existsSync(path)) fatal(`${name}: no such export at ${path}`);
    const e = JSON.parse(readFileSync(path, "utf8"));
    if (e.metricsVersion !== METRICS_VERSION) fatal(`${name}: metricsVersion ${e.metricsVersion ?? "(none)"}, not ${METRICS_VERSION}`);
    if (e.bundledClip !== WALL_CLIP) fatal(`${name}: clip ${e.bundledClip ?? e.source ?? "(none)"}, not ${WALL_CLIP}`);
    if (!e.loops || !Number.isFinite(e.clipDurationS)) fatal(`${name}: no loops or no clipDurationS: its counted loops cannot be read`);
    const res = e.processingResolution;
    if (!(res?.width > 0 && res?.height > 0)) fatal(`${name}: no processingResolution (${res?.width}x${res?.height})`);
    if (resolution === null) resolution = { width: res.width, height: res.height };
    else if (res.width !== resolution.width || res.height !== resolution.height) {
        fatal(`${name}: processing resolution ${res.width}x${res.height}, the others ${resolution.width}x${resolution.height}: their corners are in different frame sizes`);
    }
    if (e.target?.sha256 !== TARGET_SHA) fatal(`${name}: target sha256 ${e.target?.sha256 ?? "(none)"} is not the committed target's ${TARGET_SHA}`);
    if (e.target.widthPx !== TARGET_W || e.target.heightPx !== TARGET_H) {
        fatal(`${name}: target ${e.target.widthPx}x${e.target.heightPx}, the committed target decodes to ${TARGET_W}x${TARGET_H}`);
    }
    if (!Array.isArray(e.frames)) fatal(`${name}: no frames`);
    const D = e.clipDurationS;
    const frames = countedLoopFrames(e.frames, { clipDurationS: D, ...e.loops });
    const whole = cornerJitter(frames, { clipDurationS: D });
    if (!Number.isFinite(whole.jitterPx)) fatal(`${name}: whole-set jitterPx is ${whole.jitterPx}, not a finite number`);
    if (whole.jitterPx !== e.runSummary?.jitterPx) fatal(`${name}: whole-set jitterPx recomputed as ${whole.jitterPx}, recorded ${e.runSummary?.jitterPx}`);
    const K = intrinsics(res.width, res.height);
    if (K.length !== 9) fatal(`${name}: intrinsics returned ${K.length} values, not 9`);
    if (K[1] !== 0 || K[3] !== 0 || K[6] !== 0 || K[7] !== 0 || K[8] !== 1) fatal(`${name}: K is not an upper-triangular pinhole matrix: [${[...K].join(", ")}]`);
    const sig = new Map();
    let maxRecoveryErr = 0;
    for (const fr of frames) {
        if (!fr.corners) continue;
        if (!fr.ok) fatal(`${name}: a frame with corners is not ok (media time ${fr.mediaTimeSeconds})`);
        if (!Number.isFinite(fr.numInliers)) fatal(`${name}: a posed frame has no numeric numInliers (media time ${fr.mediaTimeSeconds})`);
        const h = homographyFromCorners(fr.corners);
        if (!h) fatal(`${name}: H cannot be recovered from the corners at media time ${fr.mediaTimeSeconds}`);
        if (!(h.err <= RECOVERY_TOLERANCE_PX)) fatal(`${name}: the recovered H reprojects the corners to ${h.err} px at media time ${fr.mediaTimeSeconds}, above ${RECOVERY_TOLERANCE_PX}`);
        maxRecoveryErr = Math.max(maxRecoveryErr, h.err);
        sig.set(fr, conditioning(h.H, K));
    }
    // each frame's window key as cornerJitter keys it: the loop from the wraps of the counted frames
    const wkey = new Map();
    let loop = 0;
    frames.forEach((fr, i) => {
        if (i > 0 && isLoopWrap(frames[i - 1], fr, D, i)) loop++;
        wkey.set(fr, `${loop}:${Math.floor(fr.mediaTimeSeconds / JITTER_WINDOW_S)}`);
    });
    runs.set(short, { short, name, e, frames, D, whole, K, sig, maxRecoveryErr, wkey });
}
const RUNS = [...runs.values()];
const GROUP = GROUP_NAMES.map((n) => runs.get(n));

// ---- windows, keyed as cornerJitter keys them --------------------------------------------------
function eligible(list) {
    if (list.length < 4) return false;
    let tMean = 0;
    for (const fr of list) tMean += fr.mediaTimeSeconds;
    tMean /= list.length;
    let tSpread = 0;
    for (const fr of list) tSpread += (fr.mediaTimeSeconds - tMean) ** 2;
    return tSpread !== 0;
}
/** key -> { all: frames with corners, kept: those passing include } */
function windowsOf(run, include) {
    const windows = new Map();
    for (const fr of run.frames) {
        if (!fr.corners) continue;
        const key = run.wkey.get(fr);
        if (!windows.has(key)) windows.set(key, { key, all: [], kept: [] });
        windows.get(key).all.push(fr);
        if (include(fr)) windows.get(key).kept.push(fr);
    }
    return windows;
}
/** A reading of a run: cornerJitter under include, with the window keying checked against it. */
function read(run, include, label) {
    const j = cornerJitter(run.frames, { clipDurationS: run.D, include });
    const windows = windowsOf(run, include);
    const kept = [...windows.values()].filter((w) => eligible(w.kept)).length;
    if (kept !== j.jitterWindows) fatal(`${run.short}, ${label}: window keying gives ${kept} windows, cornerJitter ${j.jitterWindows}`);
    const dropped = [...windows.values()].filter((w) => eligible(w.all) && !eligible(w.kept)).map((w) => ({ key: w.key, before: w.all.length, after: w.kept.length }));
    const refused = run.frames.filter((fr) => fr.corners && !include(fr));
    return { ...j, dropped, refused, keys: new Set(run.frames.filter((fr) => fr.corners && include(fr)).map((fr) => mediaKey(fr.mediaTimeSeconds))) };
}
const spread = (values) => {
    const v = values.filter((x) => Number.isFinite(x));
    if (v.length < 2) return { n: v.length, min: null, max: null, ratio: null, range: null };
    const min = Math.min(...v);
    const max = Math.max(...v);
    return { n: v.length, min, max, ratio: min > 0 ? max / min : null, range: max - min };
};
const intersect = (sets) => {
    let common = new Set(sets[0]);
    for (const s of sets.slice(1)) common = new Set([...common].filter((k) => s.has(k)));
    return common;
};
/** The group under per-run includes: common keys, each run on them, and the spread. */
function groupOn(includes, label) {
    const reads = GROUP.map((m, i) => read(m, includes[i], label));
    const common = intersect(reads.map((r) => r.keys));
    const on = GROUP.map((m, i) => {
        const inc = (fr) => includes[i](fr) && common.has(mediaKey(fr.mediaTimeSeconds));
        return read(m, inc, `${label}, on the group's common media times`);
    });
    return { reads, common, on, spread: spread(on.map((j) => j.jitterPx)) };
}

// ---- the floor's derivation reproduced: #137's probe, question 2, the M3 sync wall group ----
const RECORD = {
    // 2026-10-18-137-stage1-probe.md, question 2's table, "sync, wall (4 runs)": common, on common per run, R, range
    none: { common: 141, on: ["6.31", "4.86", "6.90", "7.10"], windows: [32, 30, 32, 32], ratio: "1.46", range: "2.24" },
    X4: { common: 140, on: ["6.31", "4.86", "6.90", "7.10"], windows: [32, 30, 32, 32], ratio: "1.46", range: "2.24" },
    X6: { common: 140, on: ["6.31", "4.86", "6.90", "7.10"], windows: [32, 30, 32, 32], ratio: "1.46", range: "2.24" },
    X8: { common: 140, on: ["6.31", "4.86", "6.90", "7.10"], windows: [32, 30, 32, 32], ratio: "1.46", range: "2.24" },
    XD: { common: 101, on: ["3.09", "4.26", "6.41", "3.20"], windows: [25, 25, 25, 27], ratio: "2.07", range: "3.32" },
};
const RECORD_READINGS = {
    none: () => true,
    X4: (fr) => !(isDetect(fr) && fr.numInliers === 4),
    X6: (fr) => !(isDetect(fr) && fr.numInliers >= 4 && fr.numInliers <= 6),
    X8: (fr) => !(isDetect(fr) && fr.numInliers < 8),
    XD: (fr) => !isDetect(fr),
};
const floor = {};
for (const [name, include] of Object.entries(RECORD_READINGS)) {
    const G = groupOn(GROUP.map(() => include), name);
    const R = RECORD[name];
    const got = { common: G.common.size, on: G.on.map((j) => j.jitterPx.toFixed(2)), windows: G.on.map((j) => j.jitterWindows), ratio: G.spread.ratio.toFixed(2), range: G.spread.range.toFixed(2) };
    if (got.common !== R.common || got.on.join(" ") !== R.on.join(" ") || got.windows.join(" ") !== R.windows.join(" ") || got.ratio !== R.ratio || got.range !== R.range) {
        fatal(`the floor's derivation does not reproduce under ${name}: got ${JSON.stringify(got)}, the record ${JSON.stringify(R)}`);
    }
    floor[name] = G;
}
const FLOOR = floor.none; // the group under no refusal: the replicate floor the plan names, 1.46
const commonNone = FLOOR.common;

// ---- the curve ---------------------------------------------------------------------------------
const includeFor = (run, scope, kind, tau) => (fr) => {
    if (!fr.corners) return true;
    if (scope === "detect" && !isDetect(fr)) return true;
    return KINDS[kind](run.sig.get(fr)) <= tau;
};
const curve = {};
for (const scope of SCOPES) {
    for (const kind of Object.keys(KINDS)) {
        const rows = [];
        for (const tau of TAUS) {
            const label = `${kind} ≤ ${tau}, ${scope}`;
            const perRun = RUNS.map((run) => ({ run: run.short, ...read(run, includeFor(run, scope, kind, tau), label) }));
            const includes = GROUP.map((m) => includeFor(m, scope, kind, tau));
            const G = groupOn(includes, label);
            const leaving = [...commonNone].filter((k) => !G.common.has(k)).sort((a, b) => a - b);
            const refusedAt = (k) => GROUP.filter((m, i) => m.frames.some((fr) => fr.corners && mediaKey(fr.mediaTimeSeconds) === k && !includes[i](fr))).map((m) => m.short.replace("sync-wall-", ""));
            const decomposition = GROUP.map((m, i) => {
                const fixed = read(m, (fr) => includes[i](fr) && commonNone.has(mediaKey(fr.mediaTimeSeconds)), `${label}, fixed set`);
                const tauKeys = read(m, (fr) => G.common.has(mediaKey(fr.mediaTimeSeconds)), `${label}, τ keys only`);
                // the common-set windows that drop: eligible on the none common set, not on the τ one
                const before = windowsOf(m, (fr) => commonNone.has(mediaKey(fr.mediaTimeSeconds)));
                const after = windowsOf(m, (fr) => includes[i](fr) && G.common.has(mediaKey(fr.mediaTimeSeconds)));
                const dropped = [...before.values()]
                    .filter((w) => eligible(w.kept) && !eligible(after.get(w.key)?.kept ?? []))
                    .map((w) => ({ key: w.key, before: w.kept.length, after: after.get(w.key)?.kept.length ?? 0 }));
                return { fixed, tauKeys, dropped };
            });
            rows.push({ tau, perRun, group: G, leaving, refusedAt: leaving.map(refusedAt), decomposition });
        }
        curve[`${scope}:${kind}`] = rows;
    }
}

// ---- the DETECT frames at the group's common media times with a large signal -------------------
const bigAtCommon = GROUP.map((m) => m.frames.filter((fr) => fr.corners && isDetect(fr) && commonNone.has(mediaKey(fr.mediaTimeSeconds)) && KINDS.E(m.sig.get(fr)) > 0.3).map((fr) => ({ media: fr.mediaTimeSeconds, inliers: fr.numInliers, window: m.wkey.get(fr), E: KINDS.E(m.sig.get(fr)), dScale: m.sig.get(fr).dScale, dOrth: m.sig.get(fr).dOrth })));

// ---- the reviewer's figures, recomputed here -----------------------------------------------------
// The independent reviewer (the document's "Independent: a reviewer's attempt") computed its figures
// in scratch scripts that are not committed. Every figure in the document must come from a committed
// derivation, so the same quantities are computed here, on the primary reading (kind E, DETECT
// frames), and printed in the order the document reports them, for comparison with the reviewer's.

const NAMED_WINDOWS = { "sync-wall-1": ["3:3"], "sync-wall-2": ["1:3", "3:3"], "sync-wall-3": ["1:3"], "sync-wall-4": ["1:3"] };
const onNone = (fr) => commonNone.has(mediaKey(fr.mediaTimeSeconds));

// |d_orth| is a cosine, so for τ ≥ 1 the pair E ≤ τ reduces to |d_scale| ≤ τ; stated as a check.
let maxAbsDOrth = 0;
for (const run of RUNS) for (const c of run.sig.values()) maxAbsDOrth = Math.max(maxAbsDOrth, Math.abs(c.dOrth));
if (!(maxAbsDOrth <= 1)) fatal(`|d_orth| exceeds 1 (${maxAbsDOrth}): it is a cosine and cannot`);

// (a) The exact breakpoints: the figure under E ≤ τ on DETECT frames is piecewise constant in τ and
// changes only where τ crosses the E of some posed DETECT frame of the group's runs. Evaluated at
// every such value (the refusal is "E ≤ τ", so the figure at a breakpoint holds on [b_i, b_{i+1})),
// from 0.005 up to the largest E, which also finds where the intersection regains its 141 keys.
const breakpoints = [...new Set(GROUP.flatMap((m) => m.frames.filter((fr) => fr.corners && isDetect(fr)).map((fr) => KINDS.E(m.sig.get(fr)))))].filter((v) => v >= 0.005).sort((a, b) => a - b);
if (breakpoints[0] > 0.005) breakpoints.unshift(0.005);
const sweep = [];
for (const tau of breakpoints) {
    const includes = GROUP.map((m) => includeFor(m, "detect", "E", tau));
    const G = groupOn(includes, `sweep E ≤ ${tau}`);
    const tauKeysOnly = GROUP.map((m) => read(m, (fr) => G.common.has(mediaKey(fr.mediaTimeSeconds)), `sweep ${tau}, τ keys only`));
    sweep.push({
        tau,
        common: G.common.size,
        on: G.on.map((j) => j.jitterPx),
        ratio: G.spread.ratio,
        change: G.on.map((j, i) => FLOOR.on[i].jitterPx / j.jitterPx),
        ownRefusal: G.on.map((j, i) => Math.abs(j.jitterPx - tauKeysOnly[i].jitterPx)),
    });
}
const sweepIn = sweep.filter((s) => s.tau <= 2);
const intervalAt = (i) => `[${breakpoints[i].toFixed(6)}, ${i + 1 < breakpoints.length ? breakpoints[i + 1].toFixed(6) : "∞"})`;
const sweepSummary = GROUP.map((m, i) => {
    let min = null;
    let max = null;
    let maxOwn = null;
    sweepIn.forEach((s, k) => {
        if (min === null || s.change[i] < min.value) min = { value: s.change[i], at: intervalAt(k) };
        if (max === null || s.change[i] > max.value) max = { value: s.change[i], at: intervalAt(k) };
        if (maxOwn === null || s.ownRefusal[i] > maxOwn.value) maxOwn = { value: s.ownRefusal[i], at: intervalAt(k) };
    });
    return { run: m.short, minChange: min, maxChange: max, maxOwn };
});
// the same own-refusal movement at the grid's values only, to four decimals, since the grid tables
// print the two figures at two decimals and cannot resolve a bound stated at the third
const ownOnGrid = GROUP.map((m, i) => {
    let best = null;
    for (const row of curve["detect:E"]) {
        if (row.tau > 2) continue;
        const v = Math.abs(row.group.on[i].jitterPx - row.decomposition[i].tauKeys.jitterPx);
        if (best === null || v > best.value) best = { value: v, tau: row.tau };
    }
    return best;
});
const run3Below1 = sweepIn.map((s, k) => ({ s, k })).filter(({ s }) => s.change[2] < 1).map(({ s, k }) => `${intervalAt(k)}: ${g(s.on[2])} (${g(s.change[2], 4)})`);
// the stretches on which the four figures are constant, from 2 downwards
const stretches = [];
for (let k = sweepIn.length - 1; k >= 0; k--) {
    const key = sweepIn[k].on.map((v) => v.toFixed(3)).join(" ");
    const last = stretches[stretches.length - 1];
    if (last && last.key === key) last.from = breakpoints[k];
    else stretches.push({ key, from: breakpoints[k], to: k + 1 < breakpoints.length ? breakpoints[k + 1] : null });
}
const regain141 = sweep.find((s) => s.common === 141 && s.tau > 1);

// (b), (c) The two instants that leave first, and the instant of the 4-inlier maximum the document's
// step 1 names: every frame of the five sync exports at 1.846 s, 2.448 s and 3.411 s with its E, so
// that the τ at which each run refuses each instant itself can be read, and the recurrence of the
// signal's values across exports has a derivation.
const INSTANTS = [1.846154, 2.448161, 3.411371];
const SYNC_RUNS = RUNS.filter((r) => r.short.startsWith("sync") || r.short.startsWith("m4"));
const instantFrames = SYNC_RUNS.map((m) => INSTANTS.map((t) => m.frames.filter((fr) => fr.corners && Math.abs(fr.mediaTimeSeconds - t) < 5e-4).map((fr) => ({ loop: m.wkey.get(fr).split(":")[0], state: fr.state, inliers: fr.numInliers, E: KINDS.E(m.sig.get(fr)), dScale: m.sig.get(fr).dScale, dOrth: m.sig.get(fr).dOrth }))));
// every window on the none common set with its frame count, per run of the group: which windows were
// eligible there and which held one to three frames
const framesPerWindowNone = GROUP.map((m) => {
    const w = new Map();
    for (const fr of m.frames) {
        if (!fr.corners || !commonNone.has(mediaKey(fr.mediaTimeSeconds))) continue;
        const k = m.wkey.get(fr);
        w.set(k, (w.get(k) ?? 0) + 1);
    }
    return [...w].sort(([a], [b]) => {
        const [la, sa] = a.split(":").map(Number);
        const [lb, sb] = b.split(":").map(Number);
        return la - lb || sa - sb;
    });
});
// the per-loop-key construction the reviewer tried: keys `loop:mediaKey`, so a frame matches only the
// same instant of the same counted loop in every run; intersected, read under none and three τ
const perLoopKeys = {};
for (const tau of [null, 2, 0.5, 0.05]) {
    const includes = GROUP.map((m) => (tau === null ? () => true : includeFor(m, "detect", "E", tau)));
    const keysOf = GROUP.map((m, i) => new Set(m.frames.filter((fr) => fr.corners && includes[i](fr)).map((fr) => `${m.wkey.get(fr).split(":")[0]}:${mediaKey(fr.mediaTimeSeconds)}`)));
    const common = intersect(keysOf);
    const on = GROUP.map((m, i) => cornerJitter(m.frames, { clipDurationS: m.D, include: (fr) => includes[i](fr) && common.has(`${m.wkey.get(fr).split(":")[0]}:${mediaKey(fr.mediaTimeSeconds)}`) }));
    perLoopKeys[tau === null ? "none" : tau] = { common: common.size, on };
}
// the window-only counterfactual: on the none common set, the named four-frame windows removed whole
// and every other frame kept, the 3.411 s frames of the other loops included
const windowOnly = GROUP.map((m) => {
    const named = new Set(NAMED_WINDOWS[m.short]);
    return cornerJitter(m.frames, { clipDurationS: m.D, include: (fr) => onNone(fr) && !named.has(m.wkey.get(fr)) });
});

// (d), (f) cornerJitter's window regression, repeated only to read a window's own residual, a frame's
// deviation from the line through the window's other frames, and a relaxed eligibility rule (n ≥ 3),
// none of which the module exposes. Same keying, same two rules at n ≥ 4, same operation order, so at
// minN = 4 its jitterPx must equal cornerJitter's bit for bit on every reading it is used with: checked,
// fatal.
function windowResiduals(run, include, minN) {
    const windows = new Map();
    for (const fr of run.frames) {
        if (!(fr.corners && include(fr))) continue;
        const key = run.wkey.get(fr);
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push(fr);
    }
    let residuals = 0;
    let dof = 0;
    let used = 0;
    const perWindow = new Map();
    for (const [key, w] of windows) {
        const n = w.length;
        if (n < minN) continue;
        let tMean = 0;
        for (const fr of w) tMean += fr.mediaTimeSeconds;
        tMean /= n;
        let tSpread = 0;
        for (const fr of w) tSpread += (fr.mediaTimeSeconds - tMean) ** 2;
        if (tSpread === 0) continue;
        let sum = 0;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const fr of w) mean += fr.corners[c][axis];
                mean /= n;
                let slope = 0;
                for (const fr of w) slope += (fr.mediaTimeSeconds - tMean) * (fr.corners[c][axis] - mean);
                slope /= tSpread;
                // each term added to the pool as the module adds it, so the two agree to the last bit
                for (const fr of w) {
                    const r2 = (fr.corners[c][axis] - mean - slope * (fr.mediaTimeSeconds - tMean)) ** 2;
                    residuals += r2;
                    sum += r2;
                }
            }
        }
        dof += n - 2;
        used++;
        perWindow.set(key, { frames: w, residual: sum, rms: Math.sqrt(sum / (4 * (n - 2))) });
    }
    return { jitterPx: dof > 0 ? Math.sqrt(residuals / (4 * dof)) : null, jitterWindows: used, perWindow };
}
/** A frame's RMS deviation over its eight corner coordinates from the line fitted through the window's other frames. */
function deviationFromOthers(frame, others) {
    const n = others.length;
    let tMean = 0;
    for (const fr of others) tMean += fr.mediaTimeSeconds;
    tMean /= n;
    let tSpread = 0;
    for (const fr of others) tSpread += (fr.mediaTimeSeconds - tMean) ** 2;
    let sum = 0;
    for (let c = 0; c < 4; c++) {
        for (let axis = 0; axis < 2; axis++) {
            let mean = 0;
            for (const fr of others) mean += fr.corners[c][axis];
            mean /= n;
            let slope = 0;
            for (const fr of others) slope += (fr.mediaTimeSeconds - tMean) * (fr.corners[c][axis] - mean);
            slope /= tSpread;
            sum += (frame.corners[c][axis] - mean - slope * (frame.mediaTimeSeconds - tMean)) ** 2;
        }
    }
    return Math.sqrt(sum / 8);
}
const anatomy = GROUP.map((m) => {
    const own = windowResiduals(m, onNone, 4);
    if (own.jitterPx !== FLOOR.on[GROUP.indexOf(m)].jitterPx || own.jitterWindows !== FLOOR.on[GROUP.indexOf(m)].jitterWindows) {
        fatal(`${m.short}: the repeated regression gives ${own.jitterPx} over ${own.jitterWindows} windows on the none common set, cornerJitter ${FLOOR.on[GROUP.indexOf(m)].jitterPx} over ${FLOOR.on[GROUP.indexOf(m)].jitterWindows}`);
    }
    return NAMED_WINDOWS[m.short].map((key) => {
        const w = own.perWindow.get(key);
        if (!w) fatal(`${m.short}: window ${key} is not eligible on the none common set`);
        const at3411 = w.frames.filter((fr) => Math.abs(fr.mediaTimeSeconds - 3.411371) < 5e-4);
        if (at3411.length !== 1) fatal(`${m.short}, window ${key}: ${at3411.length} frames at 3.411 s, expected 1`);
        const others = w.frames.filter((fr) => fr !== at3411[0]);
        const without = windowResiduals({ frames: others, wkey: m.wkey }, () => true, 3).perWindow.get(key);
        return {
            key,
            frames: w.frames.map((fr) => `${fr.mediaTimeSeconds.toFixed(6)} s ${fr.state} ${fr.numInliers}`),
            rms: w.rms,
            deviation: deviationFromOthers(at3411[0], others),
            rmsWithout: without ? without.rms : null,
        };
    });
});
// the relaxed rule, n ≥ 3, on the rebuilt common sets under none, τ = 2 and τ = 0.5; the repeated
// regression at n ≥ 4 is checked against the module on each of those sets first
const relaxed = {};
for (const tau of [null, 2, 0.5]) {
    const includes = GROUP.map((m) => (tau === null ? () => true : includeFor(m, "detect", "E", tau)));
    const G = tau === null ? FLOOR : groupOn(includes, `relaxed, E ≤ ${tau}`);
    const figures = GROUP.map((m, i) => {
        const inc = (fr) => includes[i](fr) && G.common.has(mediaKey(fr.mediaTimeSeconds));
        const check = windowResiduals(m, inc, 4);
        if (check.jitterPx !== G.on[i].jitterPx) fatal(`${m.short}, relaxed check at τ ${tau}: ${check.jitterPx} against cornerJitter ${G.on[i].jitterPx}`);
        return windowResiduals(m, inc, 3);
    });
    relaxed[tau === null ? "none" : tau] = { on: figures.map((j) => j.jitterPx), windows: figures.map((j) => j.jitterWindows) };
}

// (e) A single-key jackknife on the none common set: every media key deleted alone from the set, for
// every loop of every run, and the four figures recomputed.
const keyJackknife = [...commonNone].sort((a, b) => a - b).map((k) => {
    const set = new Set(commonNone);
    set.delete(k);
    const on = GROUP.map((m) => cornerJitter(m.frames, { clipDurationS: m.D, include: (fr) => set.has(mediaKey(fr.mediaTimeSeconds)) }));
    return { key: k, on: on.map((j) => j.jitterPx), change: on.map((j, i) => FLOOR.on[i].jitterPx / j.jitterPx), ratio: spread(on.map((j) => j.jitterPx)).ratio };
});
const movesOver5 = keyJackknife.filter((j) => j.change.some((c) => Math.abs(c - 1) > 0.05));
// The floor's jackknifed value: the largest replicate ratio any single deletion gives, and the range
// at that same deletion. The windows each mover's frames sit in on the none common set, per run, with
// their frame counts before and after the deletion and whether the window loses eligibility: the rule
// of 2026-10-18 (the step protocol, "A jackknife on a window at the eligibility boundary cannot
// attribute influence") turns on whether the deletions differ and whether a window drops.
const jackFloor = keyJackknife.reduce((best, j) => (best === null || j.ratio > best.ratio ? j : best), null);
const jackFloorRange = Math.max(...jackFloor.on) - Math.min(...jackFloor.on);
const moverWindows = movesOver5.map((j) => {
    const set = new Set(commonNone);
    set.delete(j.key);
    return GROUP.map((m) => {
        const before = windowsOf(m, onNone);
        const after = windowsOf(m, (fr) => set.has(mediaKey(fr.mediaTimeSeconds)));
        const keys = [...new Set(m.frames.filter((fr) => fr.corners && mediaKey(fr.mediaTimeSeconds) === j.key).map((fr) => m.wkey.get(fr)))];
        return keys.map((k) => {
            const b = before.get(k)?.kept ?? [];
            const a = after.get(k)?.kept ?? [];
            return `${k} ${b.length}->${a.length}${eligible(b) && !eligible(a) ? " drops" : ""}`;
        });
    });
});
// (a), continued: the breakpoint sweep re-read above the floor on τ. An entry holds on [b_k, b_k+1),
// so every entry whose interval meets [TAU_FLOOR, 2] is read, the first from TAU_FLOOR. Per run: the
// smallest and largest change ratio and change in px there, and whether the run exceeds the floor
// (ratio 1.46, range 2.24 px) at every τ of the stretch and the floor's jackknifed value at any.
// The document claims the open interval (TAU_FLOOR, 2], the record giving the floor's value to
// two figures; the first stretch is printed from TAU_FLOOR, and the curve is constant on it.
const aboveFloor = sweep.map((s, k) => ({ s, k })).filter(({ s, k }) => s.tau <= 2 && (k + 1 >= breakpoints.length || breakpoints[k + 1] > TAU_FLOOR));
const intervalAboveFloor = (k) => `[${Math.max(breakpoints[k], TAU_FLOOR).toFixed(6)}, ${k + 1 < breakpoints.length ? breakpoints[k + 1].toFixed(6) : "∞"})`;
const aboveFloorSummary = GROUP.map((m, i) => {
    const pick = (value, k) => ({ value, at: intervalAboveFloor(k) });
    let minR = null;
    let maxR = null;
    let minPx = null;
    let maxPx = null;
    let maxOwn = null;
    for (const { s, k } of aboveFloor) {
        const px = FLOOR.on[i].jitterPx - s.on[i];
        if (minR === null || s.change[i] < minR.value) minR = pick(s.change[i], k);
        if (maxR === null || s.change[i] > maxR.value) maxR = pick(s.change[i], k);
        if (minPx === null || px < minPx.value) minPx = pick(px, k);
        if (maxPx === null || px > maxPx.value) maxPx = pick(px, k);
        if (maxOwn === null || s.ownRefusal[i] > maxOwn.value) maxOwn = pick(s.ownRefusal[i], k);
    }
    return { run: m.short, minR, maxR, minPx, maxPx, maxOwn };
});

// (h) Pairwise, as compareExports reads two runs: the pair's common media times, rebuilt per τ.
const pairwise = [];
for (let a = 0; a < GROUP.length; a++) {
    for (let b = a + 1; b < GROUP.length; b++) {
        const row = { pair: `${GROUP[a].short.replace("sync-wall-", "")},${GROUP[b].short.replace("sync-wall-", "")}`, at: {} };
        for (const tau of [null, 2, 0.5, 0.05]) {
            const inc = [GROUP[a], GROUP[b]].map((m) => (tau === null ? () => true : includeFor(m, "detect", "E", tau)));
            const keys = [GROUP[a], GROUP[b]].map((m, i) => read(m, inc[i], `pair ${row.pair} ${tau}`).keys);
            const common = intersect(keys);
            const on = [GROUP[a], GROUP[b]].map((m, i) => cornerJitter(m.frames, { clipDurationS: m.D, include: (fr) => inc[i](fr) && common.has(mediaKey(fr.mediaTimeSeconds)) }));
            row.at[tau === null ? "none" : tau] = { common: common.size, on: on.map((j) => j.jitterPx) };
        }
        pairwise.push(row);
    }
}

// (j) Other intrinsics: the signal under K of other horizontal fields of view, and under K at the
// source resolution with the corners scaled to it; which keys leave at τ = 2 and the figures then.
const otherK = [];
for (const [label, K, scale] of [
    ...[40, 50, 70, 90, 120].map((fov) => [`fovX ${fov}°`, intrinsics(resolution.width, resolution.height, fov), 1]),
    ["K at 1280 × 720, corners scaled by 8/3", intrinsics(1280, 720), 1280 / resolution.width],
]) {
    if (K[1] !== 0 || K[3] !== 0) fatal(`${label}: K has skew`);
    const sigOf = new Map();
    for (const m of GROUP) {
        for (const fr of m.frames) {
            if (!fr.corners) continue;
            const corners = scale === 1 ? fr.corners : fr.corners.map(([u, v]) => [u * scale, v * scale]);
            const h = homographyFromCorners(corners);
            if (!h) fatal(`${label}: no H at ${fr.mediaTimeSeconds}`);
            sigOf.set(fr, conditioning(h.H, K));
        }
    }
    const row = { label, at: {} };
    for (const tau of [2, 0.5]) {
        const includes = GROUP.map(() => (fr) => !fr.corners || !isDetect(fr) || Math.max(Math.abs(sigOf.get(fr).dScale), Math.abs(sigOf.get(fr).dOrth)) <= tau);
        const G = groupOn(includes, `${label}, E ≤ ${tau}`);
        row.at[tau] = { common: G.common.size, leaving: [...commonNone].filter((k) => !G.common.has(k)).sort((a, b) => a - b), on: G.on.map((j) => j.jitterPx), ratio: G.spread.ratio };
    }
    // the τ at which each run's own 3.411 s pose would be refused under this K: its largest E there
    row.own3411 = GROUP.map((m) => Math.max(...m.frames.filter((fr) => fr.corners && Math.abs(fr.mediaTimeSeconds - 3.411371) < 5e-4).map((fr) => Math.max(Math.abs(sigOf.get(fr).dScale), Math.abs(sigOf.get(fr).dOrth)))));
    otherK.push(row);
}

// ---- output ------------------------------------------------------------------------------------
const q = (xs, p) => {
    const s = [...xs].sort((a, b) => a - b);
    if (s.length === 0) return null;
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const dist = (rows) => {
    if (rows.length === 0) return "0";
    const ds = rows.map((r) => Math.abs(r.dScale));
    const dor = rows.map((r) => Math.abs(r.dOrth));
    const four = (xs) => `${g(q(xs, 0.1), 3)} ${g(q(xs, 0.5), 3)} ${g(q(xs, 0.9), 3)} ${g(Math.max(...xs), 3)}`;
    return `${rows.length} | ${four(ds)} | ${four(dor)}`;
};
const INLIER_GROUPS = [
    ["4", (n) => n === 4],
    ["5", (n) => n === 5],
    ["6", (n) => n === 6],
    ["7-8", (n) => n >= 7 && n <= 8],
    ["9-15", (n) => n >= 9 && n <= 15],
    ["16+", (n) => n >= 16],
];

console.log(`${SCRIPT}: ${RUNS.length} exports read; every fatal check passed, the floor's five readings among them.\n`);
console.log("== Step 0: what was read");
console.log(`node ${process.version}; metrics module ${METRICS_REL} sha256 ${METRICS_PROVENANCE}; bundle manifest HEAD ${manifest.head} (clean ${manifest.clean}), bundle sha256 ${BUNDLE_SHA} (equal to the manifest's); target ${TARGET_SHA} (${TARGET_W} x ${TARGET_H}); processing resolution ${resolution.width} x ${resolution.height}; K = [${[...GROUP[0].K].map((v) => +v.toFixed(3)).join(", ")}]`);
console.log("run | counted frames | posed (DETECT, TRACK) | ok without corners | recorded jitterPx (windows) | H recovery max error (px)");
for (const run of RUNS) {
    const posed = run.frames.filter((fr) => fr.corners);
    const det = posed.filter(isDetect).length;
    console.log(`${run.short} | ${run.frames.length} | ${posed.length} (${det}, ${posed.length - det}) | ${run.frames.filter((fr) => fr.ok && !fr.corners).length} | ${g(run.whole.jitterPx, 4)} (${run.whole.jitterWindows}) | ${run.maxRecoveryErr.toExponential(2)}`);
}

console.log("\n== Step 1: the signal per posed frame, |d_scale| and |d_orth| as p10 p50 p90 max");
console.log("run | group | n | |d_scale| | |d_orth|");
for (const run of RUNS) {
    const rows = [...run.sig].map(([fr, c]) => ({ state: fr.state, inliers: fr.numInliers, ...c }));
    for (const [name, pred] of INLIER_GROUPS) {
        const sel = rows.filter((r) => r.state === "DETECT" && pred(r.inliers));
        if (sel.length > 0) console.log(`${run.short} | DETECT ${name} | ${dist(sel)}`);
    }
    console.log(`${run.short} | TRACK | ${dist(rows.filter((r) => r.state === "TRACK"))}`);
}
const syncRows = RUNS.filter((r) => r.short.startsWith("sync") || r.short.startsWith("m4")).flatMap((run) => [...run.sig].map(([fr, c]) => ({ state: fr.state, inliers: fr.numInliers, ...c })));
const workerRows = RUNS.filter((r) => r.short.startsWith("worker")).flatMap((run) => [...run.sig].map(([fr, c]) => ({ state: fr.state, inliers: fr.numInliers, ...c })));
console.log("pooled, the five sync exports (M3's four and the pre-flight):");
for (const [name, pred] of INLIER_GROUPS) console.log(`sync pooled | DETECT ${name} | ${dist(syncRows.filter((r) => r.state === "DETECT" && pred(r.inliers)))}`);
console.log(`sync pooled | TRACK | ${dist(syncRows.filter((r) => r.state === "TRACK"))}`);
console.log(`worker pooled | TRACK | ${dist(workerRows.filter((r) => r.state === "TRACK"))}`);
const hist = {};
for (const r of syncRows.filter((r) => r.state === "DETECT")) hist[r.inliers] = (hist[r.inliers] ?? 0) + 1;
console.log(`posed DETECT frames by inliers, the five sync exports pooled: ${Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join(", ")}`);

console.log("\n== The floor's derivation, reproduced: the M3 sync wall group under #137's probe's five readings (checked against the record)");
console.log("reading | common media times | on common per run (windows) | ratio | range");
for (const [name, G] of Object.entries(floor)) {
    console.log(`${name} | ${G.common.size} | ${G.on.map((j) => `${g(j.jitterPx)} (${j.jitterWindows})`).join(" ")} | ${g(G.spread.ratio)} | ${g(G.spread.range)}`);
}

console.log("\n== DETECT frames at the group's common media times (none reading) with E > 0.3, per run: media time (inliers, window, d_scale, d_orth)");
for (const [i, m] of GROUP.entries()) {
    console.log(`${m.short}: ${bigAtCommon[i].length}: ${bigAtCommon[i].map((x) => `${x.media.toFixed(3)} s (${x.inliers}, ${x.window}, ${f(x.dScale, 2)}, ${f(x.dOrth, 2)})`).join("; ")}`);
}

for (const scope of SCOPES) {
    for (const kind of Object.keys(KINDS)) {
        const rows = curve[`${scope}:${kind}`];
        const scopeText = scope === "detect" ? "DETECT frames only" : "every posed frame";
        console.log(`\n== Step 2: the curve, kind ${kind} (refuse when ${kind === "E" ? "|d_scale| or |d_orth|" : kind === "S" ? "|d_scale|" : "|d_orth|"} exceeds τ), applied to ${scopeText}`);
        console.log("-- per run: posed frames refused (of posed) | whole-set windows that lose eligibility | whole-set jitterPx (windows)");
        console.log(`τ | ${RUNS.map((r) => r.short).join(" | ")}`);
        for (const row of rows) {
            console.log(`${row.tau} | ${row.perRun.map((p) => `${p.refused.length}/${p.posedFrames + p.refused.length} | ${p.dropped.length}${p.dropped.length ? ` [${p.dropped.map((w) => `${w.key} ${w.before}->${w.after}`).join(", ")}]` : ""} | ${g(p.jitterPx)} (${p.jitterWindows})`).join(" | ")}`);
        }
        console.log(`-- the group, M3's four sync runs, on its common media times (rebuilt per τ): the floor under none is ${FLOOR.on.map((j) => g(j.jitterPx)).join(" ")} on ${commonNone.size} keys, ratio ${g(FLOOR.spread.ratio)}, range ${g(FLOOR.spread.range)}`);
        console.log("τ | common keys (leaving) | on common per run (windows) | ratio | range | change ratio none/τ per run | change px per run | fixed set, own refusal only, per run (windows) | τ keys only, no own refusal, per run (windows)");
        for (const row of rows) {
            const G = row.group;
            console.log(`${row.tau} | ${G.common.size} (${row.leaving.length}) | ${G.on.map((j) => `${g(j.jitterPx)} (${j.jitterWindows})`).join(" ")} | ${g(G.spread.ratio)} | ${g(G.spread.range)} | ${G.on.map((j, i) => g(FLOOR.on[i].jitterPx / j.jitterPx)).join(" ")} | ${G.on.map((j, i) => f(FLOOR.on[i].jitterPx - j.jitterPx)).join(" ")} | ${row.decomposition.map((d) => `${g(d.fixed.jitterPx)} (${d.fixed.jitterWindows})`).join(" ")} | ${row.decomposition.map((d) => `${g(d.tauKeys.jitterPx)} (${d.tauKeys.jitterWindows})`).join(" ")}`);
        }
        console.log("-- the media keys that leave the group's intersection, with the runs that refuse a frame there; and per run the common-set windows that drop (key frames before->after; * = held exactly four, the eligibility boundary)");
        for (const row of rows) {
            console.log(`${row.tau} | leaving: ${row.leaving.length ? row.leaving.map((k, i) => `${(k / 1e6).toFixed(3)} s [${row.refusedAt[i].join(",")}]`).join("; ") : "none"} | ${row.decomposition.map((d, i) => `${GROUP[i].short}: ${d.dropped.length ? d.dropped.map((w) => `${w.key} ${w.before}->${w.after}${w.before === 4 ? "*" : ""}`).join(", ") : "none"}`).join(" | ")}`);
        }
    }
}

console.log("\n== Step 3: the curve against the floor (ratio 1.46, range 2.24 px, the none reading above), kind E, DETECT frames only");
console.log("τ | runs whose change ratio none/τ exceeds the floor's ratio | runs whose change in px exceeds the floor's range | the group's ratio and range under τ");
for (const row of curve["detect:E"]) {
    const G = row.group;
    const over = G.on.map((j, i) => [GROUP[i].short, FLOOR.on[i].jitterPx / j.jitterPx]).filter(([, r]) => r > FLOOR.spread.ratio);
    const overPx = G.on.map((j, i) => [GROUP[i].short, FLOOR.on[i].jitterPx - j.jitterPx]).filter(([, d]) => Math.abs(d) > FLOOR.spread.range);
    console.log(`${row.tau} | ${over.length ? over.map(([n, r]) => `${n} (${g(r)})`).join(", ") : "none"} | ${overPx.length ? overPx.map(([n, d]) => `${n} (${f(d)})`).join(", ") : "none"} | ${g(G.spread.ratio)}, ${g(G.spread.range)}`);
}
console.log(`-- the same, against the floor's jackknifed value (ratio ${g(jackFloor.ratio, 3)}, range ${g(jackFloorRange, 3)} px: the largest ratio any single-key deletion gives, section (e), and the range at that deletion); τ below the floor on τ (${TAU_FLOOR}) marked`);
console.log("τ | runs whose change ratio none/τ exceeds the jackknifed ratio | runs whose change in px exceeds the jackknifed range");
for (const row of curve["detect:E"]) {
    const G = row.group;
    const over = G.on.map((j, i) => [GROUP[i].short, FLOOR.on[i].jitterPx / j.jitterPx]).filter(([, r]) => r > jackFloor.ratio);
    const overPx = G.on.map((j, i) => [GROUP[i].short, FLOOR.on[i].jitterPx - j.jitterPx]).filter(([, d]) => Math.abs(d) > jackFloorRange);
    console.log(`${row.tau}${row.tau < TAU_FLOOR ? " (below the floor on τ)" : ""} | ${over.length ? over.map(([n, r]) => `${n} (${g(r)})`).join(", ") : "none"} | ${overPx.length ? overPx.map(([n, d]) => `${n} (${f(d)})`).join(", ") : "none"}`);
}

console.log("\n== The reviewer's figures, recomputed from the committed exports (kind E, DETECT frames, the M3 sync wall group)");
console.log(`(a) breakpoints: ${breakpoints.length} distinct E values of posed DETECT frames at or above 0.005, ${sweepIn.length} of them at or below 2; the figure holds on [b_i, b_i+1). |d_orth| never exceeds 1 (max ${g(maxAbsDOrth, 5)}), so for τ ≥ 1 the pair is |d_scale| alone.`);
for (const [i, s] of sweepSummary.entries()) console.log(`  ${s.run}: change ratio none/τ over [0.005, 2] from ${g(s.minChange.value, 4)} on ${s.minChange.at} to ${g(s.maxChange.value, 4)} on ${s.maxChange.at}; largest |rebuilt − τ keys only| ${g(s.maxOwn.value, 4)} px on ${s.maxOwn.at}, and ${g(ownOnGrid[i].value, 4)} px at the grid's values (at τ = ${ownOnGrid[i].tau})`);
console.log(`  sync-wall-3 below 1: ${run3Below1.length ? run3Below1.join("; ") : "never"}`);
console.log(`  the four figures are constant on: ${stretches.slice(0, 2).map((s) => `[${s.from.toFixed(6)}, ${s.to === null ? "∞" : s.to.toFixed(6)}) at ${s.key}`).join("; ")}`);
console.log(`  the intersection regains 141 keys at τ ≥ ${regain141 ? regain141.tau.toFixed(5) : "never on the sweep"}`);
console.log(`  above the floor on τ, (${TAU_FLOOR}, 2] (the first stretch printed from ${TAU_FLOOR}; the curve is constant across it, so the endpoint changes no figure), ${aboveFloor.length} stretches: per run the change ratio none/τ and the change in px, smallest and largest; against the floor (ratio ${g(FLOOR.spread.ratio)}, range ${g(FLOOR.spread.range)} px) at every τ there, and against its jackknifed value (ratio ${g(jackFloor.ratio, 3)}, range ${g(jackFloorRange, 3)} px) at any`);
for (const s of aboveFloorSummary) {
    console.log(`    ${s.run}: ratio ${g(s.minR.value, 4)} on ${s.minR.at} to ${g(s.maxR.value, 4)} on ${s.maxR.at}; px ${f(s.minPx.value, 4)} on ${s.minPx.at} to ${f(s.maxPx.value, 4)} on ${s.maxPx.at}; exceeds the floor's ratio at every τ: ${s.minR.value > FLOOR.spread.ratio ? "yes" : "no"}, its range: ${s.minPx.value > FLOOR.spread.range ? "yes" : "no"}; exceeds the jackknifed ratio at any τ: ${s.maxR.value > jackFloor.ratio ? "yes" : "no"}, its range: ${s.maxPx.value > jackFloorRange ? "yes" : "no"}; largest |rebuilt − τ keys only| ${g(s.maxOwn.value, 4)} px on ${s.maxOwn.at}`);
}
console.log("(b), (c) every frame of the five sync exports at 1.846 s, 2.448 s and 3.411 s, with its E (loop, state, inliers, E, d_scale, d_orth):");
for (const [i, m] of SYNC_RUNS.entries()) {
    console.log(`  ${m.short}: ${INSTANTS.map((t, k) => `${t.toFixed(3)} s: ${instantFrames[i][k].length ? instantFrames[i][k].map((x) => `(${x.loop}, ${x.state}, ${x.inliers}, ${g(x.E, 5)}, ${f(x.dScale, 5)}, ${f(x.dOrth, 5)})`).join(" ") : "no posed frame"}`).join(" | ")}`);
}
console.log("    frames per window on the none common set, every window (key:frames):");
for (const [i, m] of GROUP.entries()) console.log(`    ${m.short}: ${framesPerWindowNone[i].map(([k, n]) => `${k}:${n}`).join(" ")}`);
console.log(`    the window-only counterfactual on the none common set, the named windows removed whole and every other frame kept: ${GROUP.map((m, i) => `${m.short} ${g(windowOnly[i].jitterPx, 4)} (${windowOnly[i].jitterWindows})`).join("; ")}`);
console.log(`    per-loop keys (loop:mediaKey), intersected: ${Object.entries(perLoopKeys).map(([k, v]) => `${k}: ${v.common} common, ${v.on.map((j) => `${g(j.jitterPx)} (${j.jitterWindows})`).join(" ")}`).join(" | ")}`);
console.log("(d) the named four-frame windows on the none common set: frames; the window's RMS residual; the 3.411 s frame's RMS deviation from the line through the other three; the window's RMS without it (n = 3)");
for (const [i, m] of GROUP.entries()) {
    for (const w of anatomy[i]) console.log(`  ${m.short} ${w.key}: [${w.frames.join("; ")}]; RMS ${g(w.rms)} px; deviation ${g(w.deviation, 1)} px; without it ${g(w.rmsWithout)} px`);
}
console.log("(f) the relaxed eligibility rule, n ≥ 3, on the rebuilt common sets (checked at n ≥ 4 against the module first): figures per run (windows) and change ratios");
for (const [k, r] of Object.entries(relaxed)) {
    console.log(`  ${k}: ${r.on.map((v, i) => `${g(v, 3)} (${r.windows[i]})`).join(" ")}${k === "none" ? "" : ` | change ${r.on.map((v, i) => g(relaxed.none.on[i] / v, 3)).join(" ")}`}`);
}
console.log(`(e) single-key jackknife on the none common set (${commonNone.size} keys, each deleted alone from every loop of every run): keys whose deletion moves any run by more than 5%; then, per run, the windows the key's frames sit in on that set (key frames before->after; "drops" when the window loses eligibility)`);
for (const [n, j] of movesOver5.entries()) console.log(`  ${(j.key / 1e6).toFixed(6)} s: ${j.on.map((v) => g(v, 3)).join(" ")} | change ${j.change.map((c) => g(c, 3)).join(" ")} | group ratio ${g(j.ratio, 3)}, range ${g(Math.max(...j.on) - Math.min(...j.on), 3)} | ${moverWindows[n].map((w, i) => `${GROUP[i].short}: ${w.length ? w.join(", ") : "no frame"}`).join("; ")}`);
console.log(`  the floor's jackknifed value: the largest ratio any single deletion gives, ${g(jackFloor.ratio, 3)} at ${(jackFloor.key / 1e6).toFixed(6)} s, and the range at that deletion, ${g(jackFloorRange, 3)} px; ${new Set(keyJackknife.map((j) => j.on.map((v) => v.toFixed(3)).join(" "))).size} distinct figure vectors over the ${keyJackknife.length} deletions`);
console.log("(h) pairwise, as compareExports reads two runs (the pair's common media times, rebuilt per τ): common; the two figures");
for (const p of pairwise) console.log(`  (${p.pair}): ${Object.entries(p.at).map(([k, v]) => `${k}: ${v.common}, ${v.on.map((x) => g(x, 3)).join(" / ")}`).join(" | ")}`);
console.log("(j) other intrinsics: at τ = 2 and 0.5, the keys leaving the intersection and the figures; and each run's largest E at 3.411 s");
for (const r of otherK) console.log(`  ${r.label}: ${[2, 0.5].map((t) => `τ ${t}: leaving ${r.at[t].leaving.length ? r.at[t].leaving.map((k) => (k / 1e6).toFixed(3) + " s").join(", ") : "none"}, ${r.at[t].on.map((v) => g(v)).join(" ")}, R ${g(r.at[t].ratio)}`).join(" | ")} | own E at 3.411 s ${r.own3411.map((v) => g(v, 3)).join(" ")}`);
