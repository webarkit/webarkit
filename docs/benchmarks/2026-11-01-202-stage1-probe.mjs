/*
 *  2026-11-01-202-stage1-probe.mjs
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
 * #202's Stage 1 probe: every DETECT frame of the three committed clips read on two axes, the
 * side (from H alone) and the depth (from IPPE's candidates, in selectPose's terms), seeded
 * through the contract, with the candidates GM, GP and GMP applied probe-side. The computation
 * behind docs/benchmarks/2026-11-01-202-stage1-probe.md. A desktop replay, headless, every frame
 * processed: not campaign data. No file under packages/<name>/src/ is changed.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <replay dir>
 *     node docs/benchmarks/2026-11-01-202-stage1-probe.mjs --self-test
 *     node docs/benchmarks/2026-11-01-202-stage1-probe.mjs --replay <replay dir> --out <run dir>
 *     node --experimental-transform-types docs/benchmarks/2026-11-01-202-stage1-probe.mjs --expressibility
 *
 * The method, so that it can be redone without this file:
 *
 * 1. Decoding and schedule, copied from scripts/replay-clips.mjs at 9b387ae (`probe`,
 *    `greyFrames`, `loadClip`, lines 441 to 508; `loopPeriod`, `loopTimes`, lines 542 to 552),
 *    as #137's pipeline probe copied them at b31635d: six loops, every frame in order, loops 1
 *    to 4 counted. Proved frame by frame against replay-clips' own "every frame, sync" export
 *    at --seed 1 (check D).
 * 2. The backend is cv-backend-jsfeatnext behind #137's wrapper: `estimateHomography` gets
 *    `rng` (one mulberry32 stream per run) and, on an accepted fit with at least
 *    MIN_DETECTION_INLIERS (5) inliers, the run's candidate. A fit with fewer is passed through
 *    untouched: detection.ts refuses it (line 455, G5, #192), so it is G5's refusal, not the
 *    candidate's. A candidate's refusal is the backend's own failure shape.
 * 3. The two axes, on every accepted fit the wrapper sees (the maintainer's ruling of
 *    2026-11-01 on #202's brief):
 *    - Axis A, the side, from H alone. w_i = H[6]·x_i + H[7]·y_i + H[8] over the 25 points of
 *      targetGrid(level-0 size). All of one sign (none zero): s = that sign, and the column is
 *      "facing" when s·det H > 0 (det of H scaled by s, whose w are positive, has the sign
 *      s³·det H = s·det H), "reversed" when < 0. Otherwise "mixed-w", unscaled. det H = 0 with
 *      one-signed w is not in the ruling: fatal, naming the frame.
 *    - Axis B, the depth, from selectPose's own fields: "degenerate" when `candidates` is null,
 *      else "two" / "one" / "none" in front for `rejected` 0 / 1 / 2. "In front" there is
 *      inFront on the grid and a finite RMS (select_pose.ts, lines 163 to 164).
 *    - Beside them: the outcome, `chosen`, and whether the selected pose passes inFront (#137's
 *      "behind the camera").
 * 4. The algebra's check: in columns facing and reversed, for each IPPE candidate and the
 *    closed form (closedFormPose(H, K)), sign(r₃·t) with r₃ = (R[2], R[5], R[8]) against the
 *    column (+ facing, − reversed). w = λ·z on an exact decomposition, so the identity holds
 *    for a pose whose grid is in front and flips for one whose grid is behind; each pose's own
 *    inFront is logged beside it. As ruled, the first disagreement is fatal, with the frame.
 *    Column mixed-w is excluded: the side is not defined there. Every DETECT frame of all six
 *    loops.
 * 5. Mirrored corners: the signed area of the four projected targetCorners against theirs in
 *    target coordinates. The four corners are grid points when the target's meta size equals
 *    its level-0 size (checked), so its sign must equal the column's (check, expected 0).
 * 6. The candidates, on fits with n ≥ 5: G0 none; GM refuses column reversed; GP refuses
 *    outcome no-candidate-in-front (#137's GP, its .mjs line 501); GMP either. mixed-w and
 *    degenerate are counted, never refused.
 * 7. The corner distance, a proxy and not ground truth: the selected pose's corners,
 *    K·(R·X + t) for the four target corners (null if any has z ≤ 0), against the corners of
 *    the nearest TRACK frames before and after in the same run, mean of the four distances,
 *    frame px. On the static clip also against frame 0 of G0, seed 1 (DETECT, 114 inliers).
 * 8. #42: on each DETECT frame, the inliers' source points (target level-0 px): the convex
 *    hull's area over (w − 1)(h − 1), and the 8 × 8 cells of [0, w − 1] × [0, h − 1] holding at
 *    least one (the 8 × 8 cells of 2026-09-29-desktop-tuning-r3.md's patch table). Reported by
 *    class within inlier buckets; no condition is decided.
 *
 * Timings go to stderr; stdout is byte-identical between runs. Per-frame rows go to --out,
 * not committed (AGENTS.md, "Test assets"); stdout prints their SHA-256.
 *
 * A known limitation, as every derivation script's here: no test covers docs/, so this script
 * could break later while its figures stay in the record. Its guards are its checks.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-01-202-stage1-probe.mjs";
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

// =============================================================================================
// The classifiers: pure functions, each tested on constructed cases (--self-test).
// =============================================================================================
const det3 = (H) =>
    H[0] * (H[4] * H[8] - H[5] * H[7]) - H[1] * (H[3] * H[8] - H[5] * H[6]) + H[2] * (H[3] * H[7] - H[4] * H[6]);
const gridW = (H, grid) => {
    const w = [];
    for (let i = 0; i < grid.length; i += 2) w.push(H[6] * grid[i] + H[7] * grid[i + 1] + H[8]);
    return w;
};
/** Axis A. Returns { side, s, det }; side null with det 0 is the caller's fatal. */
function sideOf(H, grid) {
    const w = gridW(H, grid);
    const pos = w.every((x) => x > 0);
    const neg = w.every((x) => x < 0);
    const det = det3(H);
    if (!pos && !neg) return { side: "mixed-w", s: 0, det };
    let s = pos ? 1 : -1;
    if (BREAK === "no-normalise") s = 1;
    const d = s * det;
    if (d === 0) return { side: null, s, det };
    if (BREAK === "side-swap") return { side: d > 0 ? "reversed" : "facing", s, det };
    return { side: d > 0 ? "facing" : "reversed", s, det };
}
/** Axis B, from selectPose's own fields. */
function depthOf(sel) {
    if (sel.candidates === null) return "degenerate";
    if (BREAK === "depth-shift") return ["one", "none", "two"][sel.rejected];
    return ["two", "one", "none"][sel.rejected];
}
const r3t = (R, t) => R[2] * t[0] + R[5] * t[1] + R[8] * t[2];
const signedArea = (pts) => {
    let a = 0;
    for (let c = 0; c < pts.length; c++) {
        const [x0, y0] = pts[c];
        const [x1, y1] = pts[(c + 1) % pts.length];
        a += x0 * y1 - x1 * y0;
    }
    return a / 2;
};
const projectH = (H, x, y) => {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
};
/** Whether H's image of the corners winds against the corners' own winding. */
function mirrored(H, corners) {
    const a = signedArea(corners.map(([x, y]) => projectH(H, x, y)));
    const b = signedArea(corners);
    if (BREAK === "mirror-never") return false;
    if (BREAK === "mirror-always") return true;
    return Math.sign(a) !== Math.sign(b);
}
// GW and GWM: the maintainer's ruling of 2026-11-01 on #218, added after the record's first run.
const CANDIDATES = ["G0", "GM", "GP", "GMP", "GW", "GWM"];
/** The candidate's verdict on a fit with n ≥ 5: a reason, or null to accept. */
function refuseOf(cand, side, outcome) {
    const m = side === "reversed";
    const p = outcome === "no-candidate-in-front";
    if (BREAK === "gm-blind" && cand === "GM") return null;
    if (cand === "GM") return m ? "reversed" : null;
    if (cand === "GP") return p ? "none-in-front" : null;
    if (cand === "GMP") return m ? "reversed" : p ? "none-in-front" : null;
    const w = side === "mixed-w";
    if (BREAK === "gw-blind" && cand === "GW") return null;
    if (cand === "GW") return w ? "mixed-w" : null;
    if (cand === "GWM") return m ? "reversed" : w ? "mixed-w" : null;
    return null;
}
/** The convex hull's area (Andrew's monotone chain) of a flat point array. */
function hullArea(flat) {
    const p = [];
    for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]);
    p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return 0;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    for (const q of p) {
        while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
        lo.push(q);
    }
    const up = [];
    for (let i = p.length - 1; i >= 0; i--) {
        while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop();
        up.push(p[i]);
    }
    const h = lo.slice(0, -1).concat(up.slice(0, -1));
    return Math.abs(signedArea(h));
}
/** The 8 × 8 cells of [0, w − 1] × [0, h − 1] holding at least one point. */
function cellsCovered(flat, w, h) {
    const seen = new Set();
    for (let i = 0; i < flat.length; i += 2) {
        const cx = Math.min(7, Math.max(0, Math.floor((flat[i] / (w - 1)) * 8)));
        const cy = Math.min(7, Math.max(0, Math.floor((flat[i + 1] / (h - 1)) * 8)));
        seen.add(cy * 8 + cx);
    }
    return seen.size;
}

// =============================================================================================
// --self-test: the constructed cases. Each classifier fires on its own case and no other.
// =============================================================================================
function selfTest() {
    const W = 512;
    const Hh = 640;
    const grid = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) grid.push(((W - 1) * j) / 4, ((Hh - 1) * i) / 4);
    const corners = [[0, 0], [W - 1, 0], [W - 1, Hh - 1], [0, Hh - 1]];
    const K = [300, 0, 135, 0, 300, 180, 0, 0, 1];
    // H = K·[r1 r2 t] for a pose: the exact decomposition the algebra is stated on.
    const fromPose = (R, t) => {
        const M = [R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]];
        const H = new Array(9).fill(0);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) H[r * 3 + c] += K[r * 3 + k] * M[k * 3 + c];
        return H;
    };
    const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
    const scale = (H, k) => H.map((v) => v * k);
    // ordinary: fronto-parallel, the grid 2000 units in front, the camera on the plane's front.
    const ordinaryPose = { R: rotX(0.2), t: [-256, -320, 2000] };
    const ordinary = fromPose(ordinaryPose.R, ordinaryPose.t);
    // reversed ("mirrored"): the camera on the plane's back, the grid in front: R = rotX(π − 0.2)
    // turns the normal away; t keeps every grid point at positive depth.
    const backPose = { R: rotX(Math.PI - 0.2), t: [-256, 320, 2000] };
    const reversed = fromPose(backPose.R, backPose.t);
    // mixed-w: a steep pose whose plane crosses z = 0 inside the grid.
    const mixed = fromPose(rotX(-1.2), [-256, -320, 200]);
    const cases = {
        ordinary: { H: ordinary, sel: { candidates: [{}, {}], rejected: 0, outcome: "selected" } },
        mirrored: { H: reversed, sel: { candidates: [{}, {}], rejected: 0, outcome: "selected" } },
        behind: { H: ordinary, sel: { candidates: [{}, {}], rejected: 2, outcome: "no-candidate-in-front" } },
        "mixed-w": { H: mixed, sel: { candidates: [{}, {}], rejected: 0, outcome: "selected" } },
        degenerate: { H: ordinary, sel: { candidates: null, rejected: 0, outcome: "degenerate" } },
    };
    const fails = [];
    const expect = (what, got, want) => {
        if (got !== want) fails.push(`${what}: ${String(got)}, expected ${String(want)}`);
    };
    // The construction itself: every grid point in front for ordinary and reversed, mixed for mixed.
    expect("construction: ordinary w all > 0", gridW(ordinary, grid).every((x) => x > 0), true);
    expect("construction: reversed w all > 0", gridW(reversed, grid).every((x) => x > 0), true);
    expect("construction: mixed w of both signs", gridW(mixed, grid).some((x) => x > 0) && gridW(mixed, grid).some((x) => x < 0), true);
    // Axis A, each case, and its classes disjoint (one label each).
    expect("A: ordinary", sideOf(ordinary, grid).side, "facing");
    expect("A: mirrored", sideOf(reversed, grid).side, "reversed");
    expect("A: mixed-w", sideOf(mixed, grid).side, "mixed-w");
    // Normalisation: −H is the same homography; its w are all negative.
    expect("A: −ordinary (w < 0) still facing", sideOf(scale(ordinary, -1), grid).side, "facing");
    expect("A: −reversed (w < 0) still reversed", sideOf(scale(reversed, -1), grid).side, "reversed");
    // The algebra on the exact poses, with the normalisation, and without it on −H.
    const sgn = (side) => (side === "facing" ? 1 : -1);
    expect("algebra: ordinary r3·t sign = column", Math.sign(r3t(ordinaryPose.R, ordinaryPose.t)), sgn(sideOf(ordinary, grid).side));
    expect("algebra: reversed r3·t sign = column", Math.sign(r3t(backPose.R, backPose.t)), sgn(sideOf(reversed, grid).side));
    expect("algebra: unnormalised det(−H) disagrees with r3·t", Math.sign(det3(scale(ordinary, -1))) === Math.sign(r3t(ordinaryPose.R, ordinaryPose.t)), false);
    // Axis B, each case.
    expect("B: two", depthOf(cases.ordinary.sel), "two");
    expect("B: one", depthOf({ candidates: [{}, {}], rejected: 1 }), "one");
    expect("B: none", depthOf(cases.behind.sel), "none");
    expect("B: degenerate", depthOf(cases.degenerate.sel), "degenerate");
    // Mirrored corners: on its own case only.
    expect("corners: mirrored fires on reversed", mirrored(reversed, corners), true);
    expect("corners: mirrored silent on ordinary", mirrored(ordinary, corners), false);
    expect("corners: mirrored silent on −ordinary", mirrored(scale(ordinary, -1), corners), false);
    // Each class fires on its own case and no other: the 3 × 4 cell of every case.
    const cell = (c) => `${sideOf(c.H, grid).side}×${depthOf(c.sel)}`;
    expect("cell: ordinary", cell(cases.ordinary), "facing×two");
    expect("cell: mirrored", cell(cases.mirrored), "reversed×two");
    expect("cell: behind", cell(cases.behind), "facing×none");
    expect("cell: mixed-w", cell(cases["mixed-w"]), "mixed-w×two");
    expect("cell: degenerate", cell(cases.degenerate), "facing×degenerate");
    // Each candidate refuses its constructed case and passes the ordinary one.
    const verdict = (cand, c) => refuseOf(cand, sideOf(c.H, grid).side, c.sel.outcome);
    for (const cand of CANDIDATES) expect(`${cand}: passes ordinary`, verdict(cand, cases.ordinary), null);
    expect("GM: refuses mirrored", verdict("GM", cases.mirrored), "reversed");
    expect("GM: passes behind", verdict("GM", cases.behind), null);
    expect("GM: passes mixed-w", verdict("GM", cases["mixed-w"]), null);
    expect("GP: refuses behind", verdict("GP", cases.behind), "none-in-front");
    expect("GP: passes mirrored", verdict("GP", cases.mirrored), null);
    expect("GMP: refuses mirrored", verdict("GMP", cases.mirrored), "reversed");
    expect("GMP: refuses behind", verdict("GMP", cases.behind), "none-in-front");
    expect("G0: passes mirrored", verdict("G0", cases.mirrored), null);
    expect("G0: passes behind", verdict("G0", cases.behind), null);
    expect("GW: refuses mixed-w", verdict("GW", cases["mixed-w"]), "mixed-w");
    expect("GW: passes mirrored", verdict("GW", cases.mirrored), null);
    expect("GW: passes behind", verdict("GW", cases.behind), null);
    expect("GWM: refuses mixed-w", verdict("GWM", cases["mixed-w"]), "mixed-w");
    expect("GWM: refuses mirrored", verdict("GWM", cases.mirrored), "reversed");
    expect("GWM: passes behind", verdict("GWM", cases.behind), null);
    // The corners' w and the grid's w are mixed together (w is affine, the corners are grid points).
    const cornersMixed = (H) => { const w = corners.map(([x, y]) => H[6] * x + H[7] * y + H[8]); return !(w.every((v) => v > 0) || w.every((v) => v < 0)); };
    for (const [name, H] of [["ordinary", ordinary], ["reversed", reversed], ["mixed", mixed]]) expect(`corners-w = grid-w: ${name}`, cornersMixed(H), sideOf(H, grid).side === "mixed-w");
    // #42's measures on a known set: the four corners cover the whole target, four cells.
    expect("hull: corners = target area", hullArea(corners.flat()), (W - 1) * (Hh - 1));
    expect("cells: four corners", cellsCovered(corners.flat(), W, Hh), 4);
    expect("cells: one point", cellsCovered([10, 10], W, Hh), 1);
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
// The inputs and their hashes, at 9b387ae.
// =============================================================================================
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
    ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
    // AGENTS.md, the pinball.wnft bullet.
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
    // The decoding and the schedule below are copied from it, at 9b387ae.
    ["scripts/replay-clips.mjs", "d29c9d8661f32ffd84baf982a62a3490fb61672776eeb1b791bf8a3a40265cd0"],
];
/** The code under test, as trees ("<path> <SHA-256>" per file, sorted, hashed): printed, not pinned. */
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
for (const [rel, want] of INPUTS) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) fatal(`${rel}: missing under ${ROOT}`);
    const got = sha256(readFileSync(p));
    if (got !== want) fatal(`${rel}: SHA-256 ${got}, expected ${want}`);
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LOOPS = 6;
const COUNTED = Object.freeze({ firstLoop: 1, loopCount: 4 });
const MIN_N = 5; // MIN_DETECTION_INLIERS, detection.ts line 103; checked against the import
const SIDES = ["facing", "reversed", "mixed-w"];
const DEPTHS = ["two", "one", "none", "degenerate"];
const BUCKETS = ["5", "6-7", "8-11", "12+"];
const bucketOf = (n) => (n === 5 ? "5" : n <= 7 ? "6-7" : n <= 11 ? "8-11" : "12+");

/**
 * #137's pipeline probe, its G5 row (2026-10-28-137-stage1-pipeline-probe.md, "Counts per run"),
 * measured at b31635d: this probe's G0 is G5 in the pipeline since 4432d2a (#192). Ranges with
 * the seeds at their ends, as printed there.
 */
const G137 = {
    "pinball-bench.mp4": { ok: "895 (s2, s4) to 906 (s5)", corners: "853 (s1, s6) to 862 (s5)", behind: "8 (s4) to 14 (s5, s6)", tts: "0.6739 (s1) to 0.6806 (s3, s5, s7)" },
    "pinball-bench-table.mp4": { ok: "926 (s6) to 941 (s3)", corners: "865 (s4) to 894 (s7)", behind: "10 (s3) to 25 (s1)", tts: "0.7871 (s2) to 0.8124 (s3)" },
};

const REPLAY_DIR = arg("--replay");
const OUT_DIR = arg("--out");
const CHILD = arg("--child");
const ONLY = arg("--only"); // "<cand>:<seed>", the pre-run: one run on one clip, checks only

if (argv.includes("--expressibility")) {
    await expressibility();
    process.exit(0);
}
if (OUT_DIR === null) fatal("--out <run dir> is required");
if (CHILD !== null) {
    if (!CLIPS.includes(CHILD)) fatal(`--child ${CHILD}: not one of ${CLIPS.join(", ")}`);
    await child(CHILD);
    process.exit(0);
}
if (REPLAY_DIR === null) fatal("--replay <dir of replay-clips --external 70 --seed 1 --out> is required");
await main();
process.exit(0);

// =============================================================================================
// The parent.
// =============================================================================================
async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const self = fileURLToPath(import.meta.url);
    const codes = await Promise.all(
        CLIPS.map(
            (clip) =>
                new Promise((done) => {
                    const p = spawn(process.execPath, [self, "--replay", REPLAY_DIR, "--out", OUT_DIR, "--child", clip], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
                    p.on("exit", (code) => done([clip, code]));
                }),
        ),
    );
    for (const [clip, code] of codes) if (code !== 0) fatal(`${clip}: its child exited ${code}; no figure is printed`);
    const R = {};
    for (const clip of CLIPS) R[clip] = JSON.parse(readFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`), "utf8"));
    const input1 = inputOne();
    lap("all clips");
    report(R, input1);
    process.stdout.write(out.join("\n") + "\n");
}

// =============================================================================================
// Input 1: the eight M3 wall exports, no run.
// =============================================================================================
function inputOne() {
    const rows = [];
    for (const mode of ["sync", "worker"]) {
        for (const i of [1, 2, 3, 4]) {
            const rel = `docs/benchmarks/2026-10-01-tab9-m3-${mode}-wall-${i}.json`;
            const bytes = readFileSync(join(ROOT, rel));
            const e = JSON.parse(bytes);
            const t = e.target;
            const tc = [[0, 0], [t.widthPx - 1, 0], [t.widthPx - 1, t.heightPx - 1], [0, t.heightPx - 1]];
            const ref = Math.sign(signedArea(tc));
            const c = { file: rel, sha: sha256(bytes), target: `${t.widthPx}x${t.heightPx}, ${t.patches} patches of ${t.patchSize}, ${t.sha256.slice(0, 12)}`, frames: e.frames.length };
            const by = {};
            for (const f of e.frames) {
                if (f.state !== "DETECT" && f.state !== "TRACK") continue;
                const key = `${f.state}/${f.detectionUse ?? "none"}`;
                const b = (by[key] ??= { n: 0, corners: 0, mirrored: 0, mirroredInliers: [], degenerateArea: 0 });
                b.n++;
                if (!f.corners) continue;
                b.corners++;
                const a = signedArea(f.corners);
                if (a === 0) b.degenerateArea++;
                else if (Math.sign(a) !== ref) {
                    b.mirrored++;
                    b.mirroredInliers.push(`${f.numInliers} at ${f.mediaTimeSeconds} s`);
                }
            }
            c.by = by;
            rows.push(c);
        }
    }
    return rows;
}

// =============================================================================================
// One clip: every candidate on every seed, every check, a result file.
// =============================================================================================
async function child(clip) {
    const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
    const backendPkg = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
    const tracker = await imp("packages/nft-tracker/dist/index.js");
    const metrics = await imp("examples/js/bench-metrics.mjs");
    const { fitSize } = await imp("examples/js/pinball-shared.mjs");
    const { createJsfeatNextBackend, intrinsics } = backendPkg;
    const { NftTracker, decode, selectPose, targetGrid, inFront, closedFormPose, DEFAULT_RANSAC_THRESHOLD, MIN_DETECTION_INLIERS } = tracker;
    const { frameRecord, targetCorners, summarizeRun, countedLoopFrames, PAGE_PROCESSING_BOX } = metrics;
    if (MIN_DETECTION_INLIERS !== MIN_N) fatal(`MIN_DETECTION_INLIERS is ${MIN_DETECTION_INLIERS}, not ${MIN_N}`);

    const realRandom = Math.random;
    let randomReads = 0;
    Math.random = function countedRandom() {
        randomReads++;
        return realRandom();
    };

    // ---- decoding, copied from scripts/replay-clips.mjs (lines 441 to 508 at 9b387ae) ---------
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
    function loadClip(name, box = PAGE_PROCESSING_BOX) {
        const path = join(ROOT, "examples", "videos", name);
        const { width: sw, height: sh, pts } = probe(path);
        const { width, height } = fitSize(sw, sh, box.width, box.height);
        const frames = greyFrames(path, width, height);
        if (frames.length !== pts.length) fatal(`${name}: ${frames.length} frames decoded, ${pts.length} timestamps`);
        return { frames, pts, width, height };
    }
    // replay-clips.mjs lines 542 to 552.
    const loopPeriod = (pts) => pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);
    const loopTimes = (pts, loops) => {
        const period = loopPeriod(pts);
        return Array.from({ length: loops * pts.length }, (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period);
    };

    const decoded = decode(new Uint8Array(readFileSync(join(ROOT, "examples/targets/pinball.wnft"))));
    if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
    const target = decoded.target;
    const cv = await createJsfeatNextBackend();
    if (cv.capabilities.deterministicRansac !== true) fatal("the backend does not declare deterministicRansac");
    const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
    const [gw, gh] = target.pyramid.levelSizes[0];
    // Method item 5: the corners are grid points only if the two sizes agree.
    if (gw !== target.meta.widthPx || gh !== target.meta.heightPx) fatal(`level-0 ${gw}x${gh} differs from the meta size ${target.meta.widthPx}x${target.meta.heightPx}`);
    const grid = targetGrid(gw, gh);
    const { frames, pts, width, height } = loadClip(clip);
    const K = intrinsics(width, height);
    const clipDurationS = loopPeriod(pts);
    const times = loopTimes(pts, LOOPS);
    const n = pts.length;
    lap(`${clip}: decoded ${n} frames at ${width}x${height}`);
    const mulberry32 = (seed) => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const poseCorners = (pose) => {
        const c = [];
        for (const [x, y] of targetPoints) {
            const X = pose.R[0] * x + pose.R[1] * y + pose.t[0];
            const Y = pose.R[3] * x + pose.R[4] * y + pose.t[1];
            const Z = pose.R[6] * x + pose.R[7] * y + pose.t[2];
            if (!(Z > 0)) return null;
            c.push([(K[0] * X + K[1] * Y + K[2] * Z) / Z, (K[4] * Y + K[5] * Z) / Z]);
        }
        return c;
    };
    const cornerDist = (a, b) => (a && b ? a.reduce((s, p, j) => s + Math.hypot(p[0] - b[j][0], p[1] - b[j][1]), 0) / 4 : null);
    const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

    // ---- the wrapper -----------------------------------------------------------------------
    function wrapBackend(cand, rng, log, frameIndex) {
        const w = {};
        for (const key of new Set([...Object.keys(cv), ...Object.getOwnPropertyNames(Object.getPrototypeOf(cv))])) {
            if (key === "constructor") continue;
            const v = cv[key];
            w[key] = typeof v === "function" ? v.bind(cv) : v;
        }
        w.estimateHomography = (src, dst, options) => {
            const threshold = options?.threshold;
            if (threshold !== DEFAULT_RANSAC_THRESHOLD) fatal(`threshold ${threshold}, not DEFAULT_RANSAC_THRESHOLD`);
            const h = cv.estimateHomography(src, dst, { ...options, rng });
            const count = src.length >> 1;
            const entry = { k: frameIndex(), matches: count, ransacOk: h.ok, n: h.numInliers, refused: null };
            if (!h.ok) {
                log.push(entry);
                return h;
            }
            let masked = 0;
            for (let i = 0; i < count; i++) if (h.inliers[i]) masked++;
            if (masked !== h.numInliers) fatal(`${clip}, frame ${entry.k}: mask ${masked}, numInliers ${h.numInliers}`);
            const inSrc = new Float64Array(2 * h.numInliers);
            const inDst = new Float64Array(2 * h.numInliers);
            for (let i = 0, j = 0; i < count; i++) {
                if (!h.inliers[i]) continue;
                inSrc[2 * j] = src[2 * i];
                inSrc[2 * j + 1] = src[2 * i + 1];
                inDst[2 * j] = dst[2 * i];
                inDst[2 * j + 1] = dst[2 * i + 1];
                j++;
            }
            const A = sideOf(h.H, grid);
            // The ruling's equivalence, checked on every accepted fit: the four corners' w are
            // mixed exactly when the grid's are (w is affine in (x, y); the corners are grid points).
            {
                const cw = targetPoints.map(([x, y]) => h.H[6] * x + h.H[7] * y + h.H[8]);
                let cm = !(cw.every((v) => v > 0) || cw.every((v) => v < 0));
                if (BREAK === "corners-w") cm = !cm;
                if (cm !== (A.side === "mixed-w")) fatal(`${clip}, ${cand}, frame ${entry.k}: the corners' w mixed ${cm}, the grid's side ${A.side}`);
            }
            if (A.side === null) fatal(`${clip}, ${cand}, frame ${entry.k}: det H = 0 with one-signed w`);
            const sel = selectPose(h.H, K, inSrc, inDst, threshold, grid);
            const cf = closedFormPose(h.H, K);
            const poses = [];
            if (sel.candidates) for (const c of sel.candidates) poses.push({ r3t: sgn(r3t(c.R, c.t)), front: inFront(c.R, c.t, grid), finite: Number.isFinite(c.rms) });
            else poses.push(null, null);
            poses.push({ r3t: sgn(r3t(cf.R, cf.t)), front: inFront(cf.R, cf.t, grid), good: cf.good });
            entry.H = Array.from(h.H);
            entry.side = A.side;
            entry.depth = depthOf(sel);
            entry.outcome = sel.outcome;
            entry.chosen = sel.chosen;
            entry.poses = poses;
            // #202's body's reading, for reconciliation only: R[8] < 0 of the selected pose.
            entry.r8neg = sel.pose.R[8] < 0;
            entry.mirrored = mirrored(h.H, targetPoints);
            entry.hull = hullArea(inSrc) / ((gw - 1) * (gh - 1));
            entry.cells = cellsCovered(inSrc, gw, gh);
            if (h.numInliers < MIN_N) {
                // detection.ts refuses it (line 455): G5's refusal, not the candidate's.
                log.push(entry);
                return h;
            }
            const refuse = refuseOf(cand, A.side, sel.outcome);
            entry.refused = refuse;
            log.push(entry);
            if (refuse === null) return h;
            return { H: new Float64Array(9), inliers: new Uint8Array(count), numInliers: 0, ok: false };
        };
        return w;
    }

    function run(cand, seed) {
        const rng = mulberry32(seed);
        const log = [];
        let k = -1;
        const t = new NftTracker(wrapBackend(cand, rng, log, () => k), target, K);
        const records = [];
        const rows = [];
        let fallbacks = 0;
        randomReads = 0;
        for (k = 0; k < times.length; k++) {
            const i = k % n;
            const timestampMs = times[k] * 1000;
            const result = t.process(frames[i], timestampMs);
            const rec = frameRecord({ mode: "tracking", result, stageTimings: {}, timestampMs, mediaTimeSeconds: pts[i], targetPoints });
            records.push(rec);
            const sel = result.ok ? result.poseSelection : null;
            if (sel && sel.chosen === "fallback") fallbacks++;
            rows.push({
                k,
                loop: Math.floor(k / n),
                t: timestampMs,
                state: rec.state,
                ok: rec.ok,
                reason: rec.reason,
                inliers: rec.numInliers,
                corners: rec.corners,
                outcome: sel ? sel.outcome : null,
                chosen: sel ? sel.chosen : null,
                selBehind: sel ? !inFront(sel.pose.R, sel.pose.t, grid) : null,
                poseCorners: sel ? poseCorners(sel.pose) : null,
                H: result.ok ? Array.from(result.H) : null,
            });
        }
        if (randomReads !== 0) fatal(`${clip}, ${cand}, seed ${seed}: ${randomReads} reads of Math.random with the rng injected`);
        if (fallbacks !== t.fallbackFrames) fatal(`${clip}, ${cand}, seed ${seed}: fallbacks ${fallbacks}, tracker ${t.fallbackFrames}`);
        const byFrame = new Map();
        for (const e of log) {
            if (byFrame.has(e.k)) fatal(`${clip}, ${cand}, seed ${seed}: two estimateHomography calls on frame ${e.k}`);
            byFrame.set(e.k, e);
        }
        for (const r of rows) r.gate = byFrame.get(r.k) ?? null;
        return { records, rows, text: rows.map((r) => JSON.stringify(r)).join("\n") + "\n" };
    }

    const replayExport = (() => {
        if (ONLY !== null) return null;
        const p = join(REPLAY_DIR, `replay-${clip.replace(/\.mp4$/, "")}-tracking-every-frame-sync.json`);
        if (!existsSync(p)) fatal(`${p}: missing`);
        return JSON.parse(readFileSync(p, "utf8"));
    })();
    const runs = [];
    let replayHead = null;
    const g0rows = {};
    const detail = []; // G0's DETECT frames in the counted loops, every seed: corner distance, #42
    const small = []; // fits with n < 5 that RANSAC accepted (G5 refuses them), G0, counted loops
    let anchor = null;
    const plan = ONLY === null ? CANDIDATES.flatMap((c) => SEEDS.map((s) => [c, s])) : [[ONLY.split(":")[0], Number(ONLY.split(":")[1])]];
    for (const [cand, seed] of plan) {
        const r = run(cand, seed);
        writeFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}-${cand}-s${seed}.jsonl`), r.text);
        if (seed === 1 && ONLY === null) {
            const again = run(cand, BREAK === "rerun-seed" ? seed + 1 : seed);
            if (again.text !== r.text) fatal(`${clip}, ${cand}, seed 1: two runs differ`);
        }
        // Per DETECT frame, every loop: the gate call it came from, and the algebra.
        const cross = Object.fromEntries(SIDES.flatMap((s) => DEPTHS.map((d) => [`${s}|${d}`, { n: 0, selBehind: 0, r8neg: 0 }])));
        let mirrorMismatch = 0;
        let rejectedVsOwn = 0;
        for (const x of r.rows) {
            if (x.state !== "DETECT") continue;
            const g = x.gate;
            if (g === null || !g.ransacOk || g.refused !== null || g.n < MIN_N || g.n !== x.inliers) fatal(`${clip}, ${cand}, seed ${seed}: DETECT frame ${x.k} does not match its gate call`);
            if (g.H.some((v, j) => v !== x.H[j])) fatal(`${clip}, ${cand}, seed ${seed}: DETECT frame ${x.k}: the tracker's H is not the fit's`);
            if (g.outcome !== x.outcome || g.chosen !== x.chosen) fatal(`${clip}, ${cand}, seed ${seed}: DETECT frame ${x.k}: selection ${x.outcome}/${x.chosen}, recomputed ${g.outcome}/${g.chosen}`);
            {
                let nullCorners = x.corners === null;
                if (BREAK === "null-corners") nullCorners = !nullCorners;
                if ((g.side === "mixed-w") !== nullCorners) fatal(`${clip}, ${cand}, seed ${seed}: DETECT frame ${x.k}: side ${g.side}, corners ${x.corners === null ? "null" : "present"}`);
            }
            if (g.side !== "mixed-w") {
                const want = (g.side === "facing" ? 1 : -1) * (BREAK === "algebra-flip" ? -1 : 1);
                for (const [j, p] of g.poses.entries()) {
                    if (p === null) continue;
                    if (p.r3t !== want) {
                        const name = ["IPPE candidate 0", "IPPE candidate 1", "the closed form"][j];
                        fatal(
                            `${clip}, ${cand}, seed ${seed}, frame ${x.k} (loop ${x.loop}, ${x.inliers} inliers): the algebra disagrees: column ${g.side}, depth ${g.depth}, outcome ${g.outcome}; ` +
                                `${name} has sign(r3·t) ${p.r3t}, its own inFront ${p.front}; poses ${JSON.stringify(g.poses)}`,
                        );
                    }
                }
                if (g.mirrored !== (g.side === "reversed")) mirrorMismatch++;
            }
            if (g.poses[0] !== null) {
                const own = (g.poses[0].front ? 0 : 1) + (g.poses[1].front ? 0 : 1);
                if (own !== ["two", "one", "none"].indexOf(g.depth)) rejectedVsOwn++;
            }
        }
        if (mirrorMismatch !== 0) fatal(`${clip}, ${cand}, seed ${seed}: ${mirrorMismatch} DETECT frames whose mirrored corners disagree with their column`);
        // The static anchor: frame 0, the detection both probes take as right.
        if (clip === "pinball-static.mp4" && cand === "G0" && seed === 1) {
            const g = r.rows[0].gate;
            const ok = r.rows[0].state === "DETECT" && g.side === "facing" && g.depth === "two" && g.poses.every((p) => p === null || p.r3t === 1);
            if (!ok) fatal(`the static anchor: frame 0 reads ${r.rows[0].state}, ${g?.side}, ${g?.depth}, ${JSON.stringify(g?.poses)}: the convention is not the ruling's`);
            anchor = { n: g.n, side: g.side, depth: g.depth, outcome: g.outcome, poses: g.poses };
        }
        if (ONLY !== null) {
            process.stderr.write(`pre-run ${clip} ${cand}:${seed}: every DETECT frame agrees; rejected-vs-own differences ${rejectedVsOwn}\n`);
            continue;
        }
        const counted = countedLoopFrames(r.records, { clipDurationS, ...COUNTED });
        const byIndex = r.records.filter((_, k) => r.rows[k].loop >= 1 && r.rows[k].loop <= (BREAK === "counted-off" ? 5 : 4));
        if (counted.length !== byIndex.length || counted.some((f, j) => f !== byIndex[j])) fatal(`${clip}, ${cand}, seed ${seed}: countedLoopFrames is not loops 1 to 4`);
        const summary = summarizeRun(r.records, { clipDurationS, loops: COUNTED, path: "sync" });
        if (!summary.trackTimeShare.complete || BREAK === "tts-incomplete") fatal(`${clip}, ${cand}, seed ${seed}: trackTimeShare incomplete`);
        const cRows = r.rows.filter((x) => x.loop >= 1 && x.loop <= 4);
        const calls = cRows.filter((x) => x.gate !== null).map((x) => x.gate);
        const accepted = calls.filter((g) => g.ransacOk && g.n >= MIN_N && g.refused === null);
        const det = cRows.filter((x) => x.state === "DETECT");
        if (det.length !== accepted.length) fatal(`${clip}, ${cand}, seed ${seed}: ${det.length} DETECT frames, ${accepted.length} accepted calls with n ≥ 5`);
        for (const x of det) {
            const c = cross[`${x.gate.side}|${x.gate.depth}`];
            c.n++;
            if (x.selBehind) c.selBehind++;
            if (x.gate.r8neg) c.r8neg++;
        }
        // The cells are disjoint and exhaustive: each DETECT frame in exactly one.
        const cellSum = Object.values(cross).reduce((a, c) => a + c.n, 0) - (BREAK === "cell-drop" ? 1 : 0);
        if (cellSum !== det.length) fatal(`${clip}, ${cand}, seed ${seed}: the twelve cells sum to ${cellSum}, DETECT frames ${det.length}`);
        const behindBy = {};
        for (const x of det) if (x.selBehind) behindBy[`${x.gate.side} × ${x.gate.depth} ${x.outcome}`] = (behindBy[`${x.gate.side} × ${x.gate.depth} ${x.outcome}`] ?? 0) + 1;
        if (cand === "G0" && seed === 1) {
            const e = replayExport;
            if (e.seed !== 1 || e.schedule !== "every frame, sync" || e.bundledClip !== clip) fatal(`${clip}: the replay export is not seed 1, every frame, sync`);
            const ps = e.packageSource ?? {};
            if (ps.packages !== "bundle" || ps.bundleSha256 !== ps.manifestBundleSha256 || ps.manifestClean !== true || typeof ps.manifestHead !== "string") fatal(`${clip}: the replay export's packageSource is not the manifest's bundle from a clean tree`);
            replayHead = ps.manifestHead;
            if (e.frames.length !== r.records.length) fatal(`${clip}: replay export ${e.frames.length} frames, G0 seed 1 ${r.records.length}`);
            for (let k = 0; k < r.records.length; k++) {
                const a = r.records[k];
                const b = e.frames[k];
                for (const f of ["mediaTimeSeconds", "timestampMs", "state", "ok", "numInliers"]) if (a[f] !== b[f]) fatal(`${clip}: frame ${k}, ${f}: G0 seed 1 ${a[f]}, replay-clips ${b[f]}`);
                if (JSON.stringify(a.corners) !== JSON.stringify(b.corners)) fatal(`${clip}: frame ${k}: corners differ from replay-clips'`);
            }
        }
        if (cand === "G0") {
            g0rows[seed] = r.rows;
            // The corner distance and #42, on every counted DETECT frame.
            for (const x of det) {
                let prev = null;
                let next = null;
                for (let j = x.k - 1; j >= 0; j--) {
                    if (r.rows[j].state === "TRACK") {
                        prev = r.rows[j];
                        break;
                    }
                }
                for (let j = x.k + 1; j < r.rows.length; j++) {
                    if (r.rows[j].state === "TRACK") {
                        next = r.rows[j];
                        break;
                    }
                }
                detail.push({
                    seed,
                    k: x.k,
                    n: x.inliers,
                    side: x.gate.side,
                    depth: x.gate.depth,
                    outcome: x.outcome,
                    selBehind: x.selBehind,
                    dPrev: prev ? cornerDist(x.poseCorners, prev.corners) : null,
                    dNext: next ? cornerDist(x.poseCorners, next.corners) : null,
                    dRef: clip === "pinball-static.mp4" ? cornerDist(x.poseCorners, g0rows[1][0].corners) : null,
                    hull: x.gate.hull,
                    cells: x.gate.cells,
                });
            }
            for (const g of calls) if (g.ransacOk && g.n < MIN_N) small.push({ seed, n: g.n, side: g.side, depth: g.depth });
        }
        const refusals = calls.filter((g) => g.refused !== null);
        const refusedCells = {};
        for (const g of refusals) refusedCells[`${g.side} × ${g.depth}`] = (refusedCells[`${g.side} × ${g.depth}`] ?? 0) + 1;
        // What the lock does after a counted DETECT: the TRACK frames that follow it before the
        // state leaves TRACK, by the detection's column; and how many of those have corners.
        const lockFollow = Object.fromEntries(SIDES.map((sd) => [sd, { detections: 0, locked: 0, track: 0, trackWithCorners: 0 }]));
        for (const x of det) {
            const L = lockFollow[x.gate.side];
            L.detections++;
            let j = x.k + 1;
            let any = false;
            while (j < r.rows.length && r.rows[j].state === "TRACK") {
                L.track++;
                if (r.rows[j].corners !== null) L.trackWithCorners++;
                any = true;
                j++;
            }
            if (any) L.locked++;
        }
        const g0 = g0rows[seed];
        runs.push({
            clip,
            cand,
            seed,
            frames: cRows.length,
            ok: cRows.filter((x) => x.ok).length,
            corners: summary.posedFrames,
            detect: det.length,
            cross,
            mirrored: det.filter((x) => x.gate.side === "reversed").length,
            noneInFront: det.filter((x) => x.gate.depth === "none").length,
            selBehind: det.filter((x) => x.selBehind).length,
            r8neg: det.filter((x) => x.gate.r8neg).length,
            behindBy,
            reversedFrames: r.rows.filter((x) => x.state === "DETECT" && x.gate.side === "reversed").map((x) => `k ${x.k} (loop ${x.loop}, media frame ${x.k % n})`),
            outcomes: Object.fromEntries(["selected", "ambiguous", "no-candidate-in-front", "degenerate"].map((o) => [o, det.filter((x) => x.outcome === o).length])),
            refused: { total: refusals.length, reversed: refusals.filter((g) => g.refused === "reversed").length, "none-in-front": refusals.filter((g) => g.refused === "none-in-front").length },
            refusedAtG0Corners: cand === "G0" ? 0 : cRows.filter((x) => x.gate !== null && x.gate.refused !== null && g0[x.k].corners !== null).length,
            refusedCells,
            lockFollow,
            g5Refused: calls.filter((g) => g.ransacOk && g.n < MIN_N).length,
            trackTimeShare: summary.trackTimeShare.share,
            locks: summary.detectionLocks.n,
            rejectedVsOwn,
            rowsSha256: sha256(r.text),
        });
        lap(`${clip}, ${cand}, seed ${seed}`);
    }
    Math.random = realRandom;
    if (ONLY !== null) return;
    writeFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`), JSON.stringify({ clip, width, height, frames: n, clipDurationS, runs, detail, small, anchor, replayHead }));
}

// =============================================================================================
// The figures.
// =============================================================================================
function report(R, input1) {
    const fx = (v, d = 4) => (v === null || v === undefined ? "null" : Number.isFinite(v) ? v.toFixed(d) : String(v));
    const show = (v) => (Number.isInteger(v) ? String(v) : fx(v));
    const range = (xs) => {
        const v = xs.map((x) => x.v);
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        const at = (val) => xs.filter((x) => x.v === val).map((x) => `s${x.seed}`).join(", ");
        return lo === hi ? `${show(lo)} (all)` : `${show(lo)} (${at(lo)}) to ${show(hi)} (${at(hi)})`;
    };
    const q = (xs, p) => {
        const s = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
        if (!s.length) return null;
        return s[Math.min(s.length - 1, Math.floor(p * s.length))];
    };
    const qs = (xs) => {
        const m = xs.filter((x) => x !== null).length;
        return m ? `${fx(q(xs, 0.1), 2)} / ${fx(q(xs, 0.5), 2)} / ${fx(q(xs, 0.9), 2)} (n ${m})` : "—";
    };
    say(`#202 Stage 1 probe: candidates ${CANDIDATES.join(", ")}; seeds ${SEEDS.join(", ")}; ${LOOPS} loops a run, loops 1 to 4 counted; node ${process.version}`);
    say(`inputs: ${INPUTS.map(([rel, h]) => `${rel} ${h.slice(0, 12)}`).join("; ")}`);
    say(
        `trees: ${TREES.map(([rel, keep]) => {
            const d = treeDigest(rel, keep);
            return `${rel} (${d.count} files) ${d.digest.slice(0, 12)}`;
        }).join("; ")}`,
    );
    say(`replay-clips' exports: the provenance manifest's bundle, built clean at ${[...new Set(CLIPS.map((c) => R[c].replayHead))].join(", ")}`);
    for (const clip of CLIPS) say(`${clip}: ${R[clip].width}x${R[clip].height}, ${R[clip].frames} frames, loop ${fx(R[clip].clipDurationS, 6)} s`);
    const a = R["pinball-static.mp4"].anchor;
    say(`static anchor (frame 0, G0, seed 1): ${a.n} inliers, ${a.side}, ${a.depth}, ${a.outcome}, sign(r3·t) per pose ${a.poses.map((p) => (p === null ? "—" : p.r3t)).join(" / ")}`);
    say("algebra: every DETECT frame of all six loops, every candidate and seed, columns facing and reversed: sign(r3·t) agrees with the column for both IPPE candidates and the closed form (a disagreement is fatal above)");
    say("mirrored corners: equal to column reversed on every DETECT frame outside mixed-w (a mismatch is fatal above)");
    say("");

    say("## Input 1: the eight M3 wall exports (no run)");
    for (const c of input1) {
        say(`${c.file} (${c.sha.slice(0, 12)}): target ${c.target}; ${c.frames} frames`);
        for (const [key, b] of Object.entries(c.by).sort()) {
            say(`  ${key}: ${b.n} frames, ${b.corners} with corners, ${b.mirrored} mirrored${b.mirrored ? ` (inliers ${b.mirroredInliers.join(", ")})` : ""}, ${b.degenerateArea} of zero area`);
        }
    }
    say("");

    for (const clip of CLIPS) {
        const runs = R[clip].runs;
        say(`## ${clip}: the cross-table, DETECT frames of the counted loops, per seed: n (of which the selected pose is behind the camera)`);
        for (const cand of CANDIDATES) {
            say(`### ${cand}`);
            say(`| seed | ${SIDES.flatMap((s) => DEPTHS.map((d) => `${s} × ${d}`)).join(" | ")} |`);
            for (const r of runs.filter((x) => x.cand === cand)) {
                say(`| s${r.seed} | ${SIDES.flatMap((s) => DEPTHS.map((d) => `${r.cross[`${s}|${d}`].n} (${r.cross[`${s}|${d}`].selBehind})`)).join(" | ")} |`);
            }
        }
        say(`### ${clip}: per candidate, the range over seeds 1 to 8`);
        say("| | ok | with corners | DETECT | reversed (#202's kind) | none in front (#137's behind) | reversed × none | selected pose behind | refused: reversed / none-in-front | refused at G0's corners | G5's refusals (n < 5) | trackTimeShare | detection locks |");
        say("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
        for (const cand of CANDIDATES) {
            const rs = runs.filter((x) => x.cand === cand);
            const m = (f) => range(rs.map((r) => ({ seed: r.seed, v: f(r) })));
            say(
                `| ${cand} | ${m((r) => r.ok)} | ${m((r) => r.corners)} | ${m((r) => r.detect)} | ${m((r) => r.mirrored)} | ${m((r) => r.noneInFront)} | ${m((r) => r.cross["reversed|none"].n)} | ${m((r) => r.selBehind)} | ` +
                    `${m((r) => r.refused.reversed)} / ${m((r) => r.refused["none-in-front"])} | ${m((r) => r.refusedAtG0Corners)} | ${m((r) => r.g5Refused)} | ${m((r) => r.trackTimeShare)} | ${m((r) => r.locks)} |`,
            );
        }
        say(`#202's body's reading (R[8] < 0 of the selected pose), for reconciliation, not the ruling's side: per cell, G0, pooled over seeds: ${SIDES.flatMap((s) => DEPTHS.map((d) => { const v = runs.filter((x) => x.cand === "G0").reduce((a, r) => a + r.cross[`${s}|${d}`].r8neg, 0); return v ? `${s} × ${d} ${v}` : null; })).filter(Boolean).join("; ") || "none"}; per seed ${runs.filter((x) => x.cand === "G0").map((r) => `s${r.seed} ${r.r8neg}`).join(", ")}`);
        for (const cand of CANDIDATES) {
            const pooled = {};
            for (const r of runs.filter((x) => x.cand === cand)) for (const [k, v] of Object.entries(r.behindBy)) pooled[k] = (pooled[k] ?? 0) + v;
            say(`selected pose behind the camera on DETECT frames, ${cand}, pooled over seeds, by cell and outcome: ${Object.entries(pooled).sort().map(([k, v]) => `${k} ${v}`).join("; ") || "none"}`);
        }
        say(`reversed DETECT frames, G0, every loop: ${runs.filter((x) => x.cand === "G0").map((r) => `s${r.seed} [${r.reversedFrames.join(", ")}]`).join("; ")}`);
        say(`GMP's refusals = GM's + GP's per seed: ${runs.filter((x) => x.cand === "GMP").every((r) => r.refused.total === runs.find((y) => y.cand === "GM" && y.seed === r.seed).refused.total + runs.find((y) => y.cand === "GP" && y.seed === r.seed).refused.total) ? "yes, every seed" : "no"}`);
        say(`outcomes on DETECT frames, G0, per seed (selected/ambiguous/no-candidate-in-front/degenerate): ${runs.filter((x) => x.cand === "G0").map((r) => `s${r.seed} ${Object.values(r.outcomes).join("/")}`).join("; ")}`);
        say(`rejected differing from the candidates' own inFront (the finite-RMS path), DETECT frames of all six loops, all runs: ${runs.reduce((s, r) => s + r.rejectedVsOwn, 0)}`);
        if (G137[clip]) {
            const g = G137[clip];
            const rs = runs.filter((x) => x.cand === "G0");
            const m = (f) => range(rs.map((r) => ({ seed: r.seed, v: f(r) })));
            say(`reconciliation, this probe's G0 / #137's G5: ok ${m((r) => r.ok)} / ${g.ok}; with corners ${m((r) => r.corners)} / ${g.corners}; behind the camera (DETECT) ${m((r) => r.selBehind)} / ${g.behind}; trackTimeShare ${m((r) => r.trackTimeShare)} / ${g.tts}`);
        }
        const d = R[clip].detail;
        const cls = (x) => (x.side === "reversed" ? "reversed" : x.depth === "none" ? "none in front" : x.side === "mixed-w" ? "mixed-w" : "other");
        say(`### ${clip}: G0's counted DETECT frames, seeds pooled (a labelled summary, not a verdict), by group and inlier bucket`);
        say("| group | bucket | frames | corner distance to the previous TRACK frame, p10 / p50 / p90 | to the next | hull share | cells of 64 |");
        say("|---|---|---|---|---|---|---|");
        for (const group of ["reversed", "none in front", "mixed-w", "other"]) {
            for (const b of BUCKETS) {
                const xs = d.filter((x) => cls(x) === group && bucketOf(x.n) === b);
                if (!xs.length) continue;
                say(`| ${group} | ${b} | ${xs.length} | ${qs(xs.map((x) => x.dPrev))} | ${qs(xs.map((x) => x.dNext))} | ${qs(xs.map((x) => x.hull))} | ${qs(xs.map((x) => x.cells))} |`);
            }
        }
        say("(groups: reversed in any row; none in front outside column reversed; mixed-w outside row none; other = facing with a candidate in front, or degenerate)");
        if (clip === "pinball-static.mp4") say(`static: corner distance to frame 0 (G0, seed 1) on counted DETECT frames: ${qs(d.map((x) => x.dRef))}`);
        const sc = {};
        for (const x of R[clip].small) sc[`${x.side} × ${x.depth}`] = (sc[`${x.side} × ${x.depth}`] ?? 0) + 1;
        say(`side table, labelled: G0's RANSAC-accepted fits with n < 5 (G5 refuses them), counted loops, seeds pooled: ${Object.entries(sc).sort().map(([k, v]) => `${k} ${v}`).join("; ") || "none"}`);
        // GW and GWM (the ruling of 2026-11-01 on #218), per seed beside G0.
        say(`### ${clip}: GW and GWM per seed, beside G0 (ok / with corners / DETECT / selected pose behind / trackTimeShare; refusals by cell; refused at G0's corners)`);
        for (const seed of SEEDS) {
            const line = (cand) => {
                const r = runs.find((x) => x.cand === cand && x.seed === seed);
                const cells = Object.entries(r.refusedCells).sort().map(([k, v]) => `${k} ${v}`).join(", ") || "none";
                return `${cand} ${r.ok} / ${r.corners} / ${r.detect} / ${r.selBehind} / ${fx(r.trackTimeShare)}; refused ${cells}; at G0's corners ${r.refusedAtG0Corners}`;
            };
            say(`s${seed}: ${["G0", "GW", "GWM"].map(line).join(" | ")}`);
        }
        say(`mixed-w on a DETECT frame ⇔ the frame's corners null: checked on every DETECT frame of all six loops, every candidate and seed (fatal otherwise); the four corners' w mixed ⇔ the grid's: checked on every accepted fit (fatal otherwise)`);
        say(`### ${clip}: the lock after a counted DETECT, G0, per seed, by column (detections / followed by TRACK / TRACK frames before the state leaves TRACK / of which with corners)`);
        for (const r of runs.filter((x) => x.cand === "G0")) say(`s${r.seed}: ${SIDES.map((sd) => { const L = r.lockFollow[sd]; return `${sd} ${L.detections} / ${L.locked} / ${L.track} / ${L.trackWithCorners}`; }).join("; ")}`);
        say(`per-frame rows' SHA-256: ${runs.map((r) => `${r.cand}/s${r.seed} ${r.rowsSha256.slice(0, 12)}`).join(" ")}`);
        say("");
    }
}

// =============================================================================================
// --expressibility: inputs with a known answer, under --experimental-transform-types.
// =============================================================================================
async function expressibility() {
    const { registerHooks } = await import("node:module");
    registerHooks({
        resolve(specifier, context, next) {
            try {
                return next(specifier, context);
            } catch (e) {
                const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
                if (e && e.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) return next(`${specifier.slice(0, -3)}.ts`, context);
                throw e;
            }
        },
    });
    const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
    const GT = [
        "packages/nft-tracker/ground-truth/tracking/track_frame_sweep.ts",
        "packages/nft-tracker/ground-truth/tracker_sequences.ts",
        "packages/nft-tracker/ground-truth/fixtures/warped_frames.ts",
        "packages/nft-tracker/ground-truth/fixtures/tracking_target.ts",
    ];
    const sw = await load(GT[0]);
    const seq = await load(GT[1]);
    const wf = await load(GT[2]);
    const { trackFrame } = await load("packages/nft-tracker/src/tracking/track_frame.ts");
    const nft = await load("packages/nft-tracker/src/index.ts");
    const jb = await load("packages/cv-backend-jsfeatnext/src/jsfeatnext_backend.ts");
    say(`ground truth read: ${GT.map((rel) => `${rel} ${sha256(readFileSync(join(ROOT, rel))).slice(0, 12)}`).join("; ")}`);
    // #90's sweep on M2's 64 patches: the loop of 2026-10-21-104-stage1-threshold-derivation.mjs
    // (its lines 342 to 372), through the ground-truth module's own views, renders and predictions.
    const gGrid = nft.targetGrid(sw.image.width, sw.image.height);
    const corners = [[0, 0], [sw.image.width - 1, 0], [sw.image.width - 1, sw.image.height - 1], [0, sw.image.height - 1]];
    const errors = sw.shippedSweepErrors();
    const tally = { right: 0, wrong: 0, refused: 0 };
    const wrong = [];
    const rightSides = {};
    for (let seed = 1; seed <= 5; seed++) {
        const frames = sw.VIEWS.map((H) => wf.renderWarp(sw.image, H, { ...sw.RENDER, seed }));
        sw.VIEWS.forEach((H, v) => {
            errors.forEach((E) => {
                const r = trackFrame(frames[v], sw.target, null, sw.about(E, H), sw.SHIPPED_OPTIONS, null);
                if (!r.ok) return void tally.refused++;
                const err = sw.centreRms(r.H, H);
                const side = sideOf(r.H, gGrid).side;
                if (err < 0.5) {
                    tally.right++;
                    rightSides[side] = (rightSides[side] ?? 0) + 1;
                } else {
                    tally.wrong++;
                    wrong.push({ err, side, truth: sideOf(H, gGrid).side, mirrored: mirrored(r.H, corners) });
                }
            });
        });
    }
    if (tally.right !== 787 || tally.wrong !== 24) fatal(`#90's sweep on M2's 64 patches: ${tally.right} right, ${tally.wrong} wrong; the record says 787 and 24`);
    const shipped = sw.shippedSweep();
    if (shipped.right.length !== 788 || shipped.wrong.length !== 0) fatal(`the shipped sweep: ${shipped.right.length} right, ${shipped.wrong.length} wrong; pinned 788 and 0`);
    const count = (xs, f) => JSON.stringify(xs.reduce((o, x) => ((o[f(x)] = (o[f(x)] ?? 0) + 1), o), {}));
    say(`#90's sweep, M2's 64 patches (a tracking H, not a detection; not a must-fire set): ${tally.right} right, ${tally.wrong} wrong, ${tally.refused} refused; right fits by side ${JSON.stringify(rightSides)}`);
    say(`  its 24 wrong fits by side ${count(wrong, (w) => w.side)}; their truths' side ${count(wrong, (w) => w.truth)}; mirrored corners ${wrong.filter((w) => w.mirrored).length}`);
    say("  the shipped target's sweep: 788 right, 0 wrong (pinned): no wrong fit to read");
    // The ground truth's sequences: the shipped target through NftTracker, which runs detectTarget,
    // seeded as the module seeds them (withSeededRandom, SEED 20260925).
    const cv = await (await load("packages/cv-backend-jsfeatnext/src/index.ts")).createJsfeatNextBackend();
    const K = jb.intrinsics(seq.CAMERA.width, seq.CAMERA.height);
    const st = seq.shippedTarget();
    const [w0, h0] = st.pyramid.levelSizes[0];
    const sGrid = nft.targetGrid(w0, h0);
    const runs = [["leave and return", seq.shippedLeaveAndReturn(cv, K)], ["wander", seq.shippedWander(cv, K)], ...seq.shippedVelocitySteps(cv, K).map((x) => [`velocity ${x.v}`, x])];
    let total = 0;
    let reversed = 0;
    const mixedW = [];
    for (const [name, r] of runs) {
        const det = r.results.map((x, i) => [x, r.truths[i]]).filter(([x]) => x.ok && x.state === "DETECT");
        const sides = det.map(([x]) => sideOf(x.H, sGrid).side);
        const errs = det.map(([x, T]) => seq.centreRms(x.H, T));
        for (const [j, [x, T]] of det.entries()) {
            const e = errs[j];
            // Must-not-fire for GW (the ruling of 2026-11-01 on #218): a mixed-w detection under the
            // record's 5 px cut is a right detection GW would refuse. Stop and report it.
            if (sides[j] === "mixed-w" && !(e >= (BREAK === "gw-must-not" ? 1e6 : 5))) fatal(`sequence ${name}, frame ${r.results.indexOf(x)}: a mixed-w detection ${e.toFixed(3)} px from the truth`);
            say(`  every DETECT: frame ${r.results.indexOf(x)}, ${x.numInliers} inliers, ${sides[j]} × ${depthOf(x.poseSelection)}, ${e.toFixed(3)} px`);
            // 5 px: a display cut, far above the right detections here (about 1 px), not a verdict.
            if (e >= 5) say(`  frame ${r.results.indexOf(x)}: ${x.numInliers} inliers, side ${sides[j]}, depth ${depthOf(x.poseSelection)}, outcome ${x.poseSelection.outcome}, error ${e.toFixed(3)} px`);
        }
        total += det.length;
        reversed += sides.filter((s) => s === "reversed").length;
        for (const [j, [x]] of det.entries()) if (sides[j] === "mixed-w") mixedW.push({ name, k: r.results.indexOf(x), e: errs[j] });
        say(
            `sequence ${name}: ${r.results.length} frames, states ${r.states}; DETECT ${det.length}: sides ${count(sides, (s) => s)}, depths ${count(det, ([x]) => depthOf(x.poseSelection))}, ` +
                `error to the truth at the 64 centres, max ${errs.length ? Math.max(...errs).toFixed(3) : "—"} px`,
        );
    }
    say(`the sequences: ${total} DETECT frames with a known answer, ${reversed} reversed, ${mixedW.length} mixed-w (${mixedW.map((m) => `${m.name} frame ${m.k}, ${m.e.toFixed(3)} px`).join("; ")}), every mixed-w one at or above 5 px (fatal otherwise)`);
    say(`GW's must-fire set in the sequences: ${mixedW.length} frames; must-not-fire: no mixed-w detection under 5 px`);
    say(`must-fire set for a detection rule on a reversed H: ${reversed === 0 ? "none in the corpus" : `${reversed} frames`}`);
    process.stdout.write(out.join("\n") + "\n");
}
