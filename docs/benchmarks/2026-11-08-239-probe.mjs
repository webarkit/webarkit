/*
 *  2026-11-08-239-probe.mjs
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
 * #239's probe: does the backend ever hand `targetSide` an `H` that is not finite, or whose
 * determinant overflows, underflows or loses its sign? The computation behind
 * docs/benchmarks/2026-11-08-239-probe.md. A desktop replay, headless: not campaign data. It
 * measures and registers nothing, and no file under packages/<name>/src/ is changed.
 *
 *     npm ci && npm run build      (from a committed, clean tree)
 *     node docs/benchmarks/2026-11-08-239-probe.mjs --self-test [--break <defect>]
 *     node docs/benchmarks/2026-11-08-239-probe.mjs --run <run dir> --refs <refs dir> [--break <defect>] [--only <spec>] [--seeds <a>-<b>]
 *
 * <refs dir> holds, written at the same commit from a clean tree:
 *
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --seed-policy frame --packages bundle --out <refs dir>/ext
 *     node scripts/replay-clips.mjs --seed 1 --seed-policy frame --packages bundle --out <refs dir>/def
 *     node scripts/replay-clips.mjs --sequence docs/benchmarks/2026-10-13-tab9-m4-preflight-sync-wall.json --seed 1 --seed-policy frame --packages bundle > <refs dir>/seq.stdout
 *     node scripts/replay-clips.mjs --clips tilt --seed 1 --seed-policy frame --packages bundle --out <refs dir>/tilt
 *
 * The method, so that it can be redone without this file:
 *
 * 1. What is captured. `estimateHomography` is wrapped on the injected backend's prototype, below
 *    the contract and above the backend's own code (ADR-0001: the tracker's backend is injected).
 *    The wrapper copies the returned `H`, `ok` and `numInliers` and returns the backend's own
 *    object untouched. In `packages/nft-tracker/src`, `detectTarget` is the only caller of
 *    `estimateHomography`, so every call is a detection's. `NftTracker.prototype.process` is
 *    wrapped to know the frame and the tracker's own `setup.grid`, the 25 points `targetSide`
 *    reads, and `NftTracker.prototype.detected` to read what `detectTarget` returned.
 * 2. Where. The replay's frame loop, scripts/replay-run.mjs's `replayRun`, and its seeding,
 *    scripts/replay-seeding.mjs's `runSeeding` and `countGlobalRandomReads`, imported. The
 *    decoding (`probe`, `greyFrames`, `loadClip`) and the schedules' constants live in
 *    scripts/replay-clips.mjs, a top-level script that cannot be imported, so they are copied,
 *    and proved frame by frame against that script's exports at --seed 1 (check D). The default
 *    form's every-frame and fixed-step schedules (the scaled step is step-dependent, so not
 *    repeatable), both modes, two loops; `--clips tilt`'s three schedules, six loops, on the
 *    loops' continuous timeline; seeds 1 to 8, `--seed-policy frame`. The ground truth: the
 *    sequences `docs/benchmarks/2026-11-06-228-133-stage3-references.mjs` records, in its order,
 *    copied, and proved by its R-truth hash, with the wrappers on and off.
 * 3. Every run twice, without the wrappers and with them: the per-frame records must be equal
 *    (fatal), timing fields masked.
 * 4. Each `H` is classified (`classify`): a non-finite entry; a non-finite `w` on the grid (and,
 *    of those, at its four corners); a non-finite computed determinant with finite entries; the
 *    computed determinant's sign against that of `H / max|Hᵢ|`; a computed determinant of 0
 *    whose scaled one is not. The exact sign, from the doubles' exact values in BigInt, stands
 *    beside the scaled one, which can underflow.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SELF = fileURLToPath(import.meta.url);
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const R_REPLAY = "98323f061ecef7022d536c22f024d374a119edcd8ce6af3927b37309f2c6b546";
const R_TRUTH = "d1d427f33ce819ab5760377dcb3999ba979b09ab402a51a830895e27203c4f8f";
const REFERENCES = "docs/benchmarks/2026-11-06-228-133-stage3-references.mjs";

const argv = process.argv.slice(2);
const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? null : argv[i + 1];
};
const BREAK = arg("--break");
const BREAKS = [
    // --self-test
    "entry-blind",
    "w-blind",
    "corner-blind",
    "det-blind",
    "sign-raw",
    "exact-off",
    "underflow-blind",
    "flag-all",
    // --run
    "wrapper-perturb",
    "accept-flip",
    "call-escape",
    "capability",
    "global-read",
    "decode-luma",
    "rtruth",
    "rreplay",
    "tree-state",
];
if (BREAK !== null && !BREAKS.includes(BREAK)) {
    console.error(`--break expects one of ${BREAKS.join(", ")}, got ${BREAK}`);
    process.exit(2);
}
function fatal(why) {
    console.error(`239-probe: ${why}`);
    process.exit(1);
}

// ---- the classification ----

/** `targetSide`'s determinant, its expression and order of operations (detection.ts, targetSide). */
export function detTargetSide(H) {
    return (
        H[0] * (H[4] * H[8] - H[5] * H[7]) -
        H[1] * (H[3] * H[8] - H[5] * H[6]) +
        H[2] * (H[3] * H[7] - H[4] * H[6])
    );
}

/** A double as `m · 2^e`, `m` a BigInt: exact. */
function dyadic(x) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0);
    const lo = dv.getUint32(4);
    const e = (hi >>> 20) & 0x7ff;
    let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let exp;
    if (e === 0) exp = -1074;
    else {
        m |= 1n << 52n;
        exp = e - 1075;
    }
    return [hi >>> 31 ? -m : m, exp];
}

/** The exact sign of det H, for finite entries: −1, 0 or 1. */
export function exactDetSign(H) {
    if (BREAK === "exact-off") return Math.sign(detTargetSide(H)) || 0;
    const d = Array.from(H, dyadic);
    const emin = Math.min(...d.map(([m, e]) => (m === 0n ? Infinity : e)));
    if (emin === Infinity) return 0;
    const v = d.map(([m, e]) => (m === 0n ? 0n : m << BigInt(e - emin)));
    const det =
        v[0] * (v[4] * v[8] - v[5] * v[7]) - v[1] * (v[3] * v[8] - v[5] * v[6]) + v[2] * (v[3] * v[7] - v[4] * v[6]);
    return det > 0n ? 1 : det < 0n ? -1 : 0;
}

const CORNERS = [0, 4, 20, 24];

/**
 * The five classes of #239's probe, on one `H` and the grid `targetSide` reads (25 points, x then
 * y; its corners are points 0, 4, 20 and 24).
 */
export function classify(H, grid) {
    const entryNonFinite = BREAK === "entry-blind" ? false : Array.from(H).some((v) => !Number.isFinite(v));
    let wNonFinite = false;
    let cornerWNonFinite = false;
    for (let k = 0; k < grid.length / 2; k++) {
        const w = H[6] * grid[2 * k] + H[7] * grid[2 * k + 1] + H[8];
        if (!Number.isFinite(w)) {
            if (BREAK !== "w-blind") wNonFinite = true;
            if (BREAK !== "corner-blind" && CORNERS.includes(k)) cornerWNonFinite = true;
        }
    }
    const det = detTargetSide(H);
    let maxAbs = 0;
    for (const v of H) maxAbs = Math.max(maxAbs, Math.abs(v));
    let scaledDet = null;
    let exactSign = null;
    if (!entryNonFinite && !Array.from(H).some((v) => !Number.isFinite(v))) {
        scaledDet = maxAbs === 0 ? 0 : detTargetSide(BREAK === "sign-raw" ? H : Array.from(H, (v) => v / maxAbs));
        exactSign = exactDetSign(H);
    }
    const finite = scaledDet !== null;
    const detNonFinite = BREAK === "det-blind" ? false : finite && !Number.isFinite(det);
    const signDisagrees = finite && !Number.isNaN(det) && Math.sign(det) !== Math.sign(scaledDet);
    const exactDisagrees = finite && !Number.isNaN(det) && (Math.sign(det) || 0) !== exactSign;
    const underflow = BREAK === "underflow-blind" ? false : finite && det === 0 && scaledDet !== 0;
    const c = {
        entryNonFinite,
        wNonFinite,
        cornerWNonFinite,
        detNonFinite,
        signDisagrees,
        exactDisagrees,
        underflow,
        det,
        scaledDet,
        exactSign,
        maxAbs,
    };
    if (BREAK === "flag-all") for (const k of Object.keys(CLASS_NAMES)) c[k] = true;
    return c;
}

/** The classes as the record names them, in its order. */
const CLASS_NAMES = {
    entryNonFinite: "1. non-finite entry",
    wNonFinite: "2. non-finite w on the grid targetSide reads",
    cornerWNonFinite: "2a. of which at one of the grid's four corners",
    detNonFinite: "3. non-finite computed determinant, finite entries",
    signDisagrees: "4. computed sign against the scaled determinant's",
    exactDisagrees: "4a. computed sign against the exact sign",
    underflow: "5. computed determinant 0, scaled one not",
};

// ---- --self-test: the classes on constructed H: #239's tables, #240's underflow case, a flip the scaled sign recovers, and two in no class ----

async function selfTest() {
    const { targetSide, targetGrid } = await imp("examples/dist/webarkit-packages.mjs");
    const grid = targetGrid(400, 300);
    const failures = [];
    const none = { entryNonFinite: false, wNonFinite: false, cornerWNonFinite: false, detNonFinite: false, signDisagrees: false, exactDisagrees: false, underflow: false };
    const cases = [
        // #239's body
        { name: "H[0] = +Infinity (#239: +∞, \"facing\")", H: [Infinity, 0, 0, 0, 1, 0, 0, 0, 1], side: "facing", want: { entryNonFinite: true } },
        { name: "H[0] = NaN (#239: \"reversed\")", H: [NaN, 0, 0, 0, 1, 0, 0, 0, 1], side: "reversed", want: { entryNonFinite: true } },
        { name: "H[8] = +Infinity, others 0 or 1 (#239: NaN from 0·∞, \"reversed\")", H: [1, 1, 0, 0, 1, 0, 0, 0, Infinity], side: "reversed", want: { entryNonFinite: true, wNonFinite: true, cornerWNonFinite: true } },
        { name: "H[6] = NaN (#239: a NaN w is \"mixed-w\")", H: [1, 0, 0, 0, 1, 0, NaN, 0, 1], side: "mixed-w", want: { entryNonFinite: true, wNonFinite: true, cornerWNonFinite: true } },
        { name: "H[0] = −Infinity (#239: \"reversed\")", H: [-Infinity, 0, 0, 0, 1, 0, 0, 0, 1], side: "reversed", want: { entryNonFinite: true } },
        { name: "diag(1e200, 1e200, 1) (#239: +∞, \"facing\")", H: [1e200, 0, 0, 0, 1e200, 0, 0, 0, 1], side: "facing", want: { detNonFinite: true } },
        { name: "diag(1e200, 1e200, −1) (#239: −∞, \"facing\")", H: [1e200, 0, 0, 0, 1e200, 0, 0, 0, -1], side: "facing", want: { detNonFinite: true } },
        // #239's comment: the two finite overflow cases
        {
            name: "#239's comment, row 1: exact 1e100 − 1e200 < 0, computed +∞, \"facing\"",
            H: [1e-300, 1, 0, 1, 1e200, 0, 0, 0, 1e200],
            side: "facing",
            // The scaled determinant underflows to +0 here: its sign disagrees, and only the exact sign is negative.
            want: { detNonFinite: true, signDisagrees: true, exactDisagrees: true },
            scaledDet: 0,
            exactSign: -1,
        },
        {
            name: "#239's comment, row 2: exact +1e400, computed NaN, \"reversed\"",
            H: [1, 0, 0, 0, 2e200, 1e200, 0, 1e200, 1e200],
            side: "reversed",
            want: { detNonFinite: true },
            exactSign: 1,
        },
        // The scaled sign recovers a sign the raw computation flips.
        {
            name: "constructed: exact 1e150 − 1e155 < 0, computed +∞, scaled negative",
            H: [1e-160, 1, 0, 1, 1e155, 0, 0, 0, 1e155],
            side: "facing",
            want: { detNonFinite: true, signDisagrees: true, exactDisagrees: true },
            scaledSign: -1,
            exactSign: -1,
        },
        // #240's review: a nonsingular H whose determinant underflows reads "singular".
        { name: "diag(1e-170, 1e-170, 1e-170): computed 0, scaled 1", H: [1e-170, 0, 0, 0, 1e-170, 0, 0, 0, 1e-170], side: "singular", want: { underflow: true, signDisagrees: true, exactDisagrees: true }, exactSign: 1 },
        // A well-conditioned H, in no class.
        { name: "a well-conditioned H", H: [0.52, 0.03, 61.2, -0.02, 0.55, 88.7, 1e-5, -2e-5, 1], side: "facing", want: {}, exactSign: 1 },
        // A singular H with finite entries, in no class: its 0 is exact.
        { name: "an exactly singular H", H: [1, 2, 3, 2, 4, 6, 0, 0, 1], side: "singular", want: {}, exactSign: 0 },
    ];
    for (const c of cases) {
        const got = classify(c.H, grid);
        const want = { ...none, ...c.want };
        for (const k of Object.keys(none)) if (got[k] !== want[k]) failures.push(`${c.name}: ${k} is ${got[k]}, expected ${want[k]}`);
        const side = targetSide(c.H, grid);
        if (side !== c.side) failures.push(`${c.name}: targetSide gives ${side}, expected ${c.side}`);
        if ("scaledDet" in c && !Object.is(got.scaledDet, c.scaledDet)) failures.push(`${c.name}: scaled determinant ${got.scaledDet}, expected ${c.scaledDet}`);
        if ("scaledSign" in c && Math.sign(got.scaledDet) !== c.scaledSign) failures.push(`${c.name}: scaled sign ${Math.sign(got.scaledDet)}, expected ${c.scaledSign}`);
        if ("exactSign" in c && got.exactSign !== c.exactSign) failures.push(`${c.name}: exact sign ${got.exactSign}, expected ${c.exactSign}`);
    }
    // The exact sign on matrices whose determinant's sign is known.
    const signs = [
        [[2, 0, 0, 0, 3, 0, 0, 0, 4], 1],
        [[0, 1, 0, 1, 0, 0, 0, 0, 1], -1],
        [[1, 0, 0, 0, 1, 0, 0, 0, 1e-300], 1],
        [[3, 0, 0, 0, -2, 0, 0, 0, 0.5], -1],
        [[1, 2, 3, 2, 4, 6, 7, 8, 9], 0],
        [[5e-324, 0, 0, 0, 5e-324, 0, 0, 0, -5e-324], -1],
        // subnormal beside normal entries, and negative zeros
        [[5e-324, 0, 0, 0, 1e300, 0, 0, 0, 1], 1],
        [[3e-320, 1, 0, 1, 2.2250738585072014e-308, 0, 0, 0, -1], 1],
        [[-0, 1, 0, 1, -0, 0, 0, 0, 1], -1],
        [[-0, 0, 0, 0, 1, 0, 0, 0, 1], 0],
    ];
    for (const [H, s] of signs) {
        if (exactDetSign(H) !== s) failures.push(`exact sign of [${H}] is ${exactDetSign(H)}, expected ${s}`);
    }
    // The global-read counter, imported.
    const { countGlobalRandomReads } = await imp("scripts/replay-seeding.mjs");
    if (countGlobalRandomReads(() => Math.random()).reads !== 1) failures.push("countGlobalRandomReads does not count a read");
    if (failures.length > 0) {
        console.error(`self-test: ${failures.length} failed\n${failures.join("\n")}`);
        process.exit(1);
    }
    console.log(`self-test: passed, ${cases.length} constructed H and ${signs.length} exact signs`);
}

// ---- the schedules and the decoding, copied from scripts/replay-clips.mjs at 6bccf51 ----

/** Lines 270, 272. */
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const TILT_CLIPS = ["pinball-tilt-cross.mp4", "pinball-tilt-mid.mp4", "pinball-tilt-sweep.mp4"];
/** Lines 278 to 282. */
const DEVICE_ACQUIRE_MS = { "pinball-static.mp4": 36.9, "pinball-bench.mp4": 20.4, "pinball-bench-table.mp4": 41.0 };
/** Line 284. */
const DEVICE_DETECT_MS = 83.2;
/** Line 302. */
const TILT_BORROWED_ACQUIRE_MS = 36.9;
/** Lines 304, 313. */
const M3_LOOPS = 6;
const LOOPS = 2;
/** Lines 314 to 321, the scaled step left out: its step is timed, so its frames are not repeatable. */
const DEF_RUNS = [
    { mode: "tracking", schedule: "every frame", stepMs: null },
    { mode: "tracking", schedule: "device, 15 ms step", stepMs: 15 },
    { mode: "tracking", schedule: "device, 25 ms step", stepMs: 25 },
    { mode: "detection-only", schedule: "every frame", stepMs: null },
    { mode: "detection-only", schedule: "device", stepMs: 0 },
];
/** Lines 1101 to 1103: `--clips tilt`'s arms. */
const TILT_RUNS = [
    { mode: "tracking", schedule: "every frame", stepMs: null },
    { mode: "tracking", schedule: "device, 15 ms step", stepMs: 15 },
    { mode: "tracking", schedule: "device, 25 ms step", stepMs: 25 },
];
/** Line 874: the export's file name. */
const exportName = (clip, mode, schedule) =>
    `replay-${clip.replace(/\.mp4$/, "")}-${mode}-${schedule.replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "")}.json`;

/** `probe`, lines 508 to 531. */
function ffprobe(path) {
    const json = JSON.parse(
        execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path], {
            maxBuffer: 64 << 20,
        }).toString(),
    );
    return { width: json.streams[0].width, height: json.streams[0].height, pts: json.frames.map((f) => Number(f.pts_time)) };
}
/** `greyFrames`, lines 534 to 564. */
function greyFrames(path, width, height) {
    const rgb = execFileSync(
        "ffmpeg",
        ["-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf", `scale=${width}:${height}:flags=bilinear`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        { maxBuffer: 1 << 30 },
    );
    const [wr, wg, wb] = BREAK === "decode-luma" ? [0.3, 0.587, 0.114] : [0.299, 0.587, 0.114];
    const n = width * height;
    const frames = [];
    for (let o = 0; o + 3 * n <= rgb.length; o += 3 * n) {
        const data = new Uint8Array(n);
        for (let i = 0, p = o; i < n; i++, p += 3) data[i] = (rgb[p] * wr + rgb[p + 1] * wg + rgb[p + 2] * wb) | 0;
        frames.push({ data, width, height });
    }
    return frames;
}
/** `loadClip`, lines 567 to 576. */
function loadClip(clip, box, fitSize) {
    const path = join(ROOT, "examples/videos", clip);
    const { width: sw, height: sh, pts } = ffprobe(path);
    const { width, height } = fitSize(sw, sh, box.width, box.height);
    const frames = greyFrames(path, width, height);
    if (frames.length !== pts.length) throw new Error(`${clip}: ${frames.length} frames decoded, ${pts.length} timestamps`);
    return { frames, pts, width, height, sha256: sha256(readFileSync(path)) };
}

// ---- the wrappers ----

/**
 * Wraps `backendProto.estimateHomography` and `trackerProto.process` / `.detected`. `on` decides
 * whether a call is recorded. The wrappers are installed once and stay, so the plain run (`on`
 * false) and the recorded run differ in recording only: what the wrappers' presence could change
 * is in both, and is ruled out by check D and R-truth, against the replay's exports and the
 * references script, which run without them. Every argument is passed through.
 * `readInWrapper` places `global-read`'s defect read inside a detection (the replay); the ground
 * truth's is placed outside its seeded regions, where its own guard does not see it first.
 */
function installWrappers(backendProto, trackerProto, readInWrapper = true) {
    for (const [o, k] of [
        [backendProto, "estimateHomography"],
        [trackerProto, "process"],
        [trackerProto, "detected"],
    ]) {
        if (typeof o[k] !== "function") fatal(`${k} is not a method on the prototype: the wrapper cannot be installed`);
    }
    const state = { on: false, calls: [], trackers: [], frame: null, tracker: null, last: null, perturbed: false, readOnce: false };
    const est = backendProto.estimateHomography;
    backendProto.estimateHomography = function (...args) {
        const h = est.apply(this, args);
        if (state.on && BREAK === "call-escape" && !state.escaped) {
            // A call the wrapper does not see, as a backend's own-property method would be.
            state.escaped = true;
            return h;
        }
        if (state.on) {
            const rec = {
                H: Array.from(h.H),
                ok: h.ok,
                numInliers: h.numInliers,
                frame: state.frame,
                trackerIndex: state.trackers.indexOf(state.tracker),
                grid: state.tracker ? state.tracker.setup?.grid : null,
                detected: null,
            };
            state.calls.push(rec);
            state.last = rec;
            if (BREAK === "wrapper-perturb" && !state.perturbed && h.ok) {
                h.H[0] *= 1 + 1e-12;
                state.perturbed = true;
            }
            if (BREAK === "global-read" && readInWrapper && !state.readOnce) {
                Math.random();
                state.readOnce = true;
            }
        }
        return h;
    };
    const process_ = trackerProto.process;
    trackerProto.process = function (...args) {
        if (!state.on) return process_.apply(this, args);
        const prev = state.tracker;
        state.tracker = this;
        if (!state.trackers.includes(this)) state.trackers.push(this);
        state.frame = { ...state.frameContext, timestampMs: args[1] };
        try {
            return process_.apply(this, args);
        } finally {
            state.tracker = prev;
        }
    };
    const detected = trackerProto.detected;
    trackerProto.detected = function (...args) {
        const d = args[0];
        if (state.on && state.last && state.last.detected === null) {
            state.last.detected = { ok: d.ok, reason: d.ok ? null : d.reason };
            if (BREAK === "accept-flip" && d.ok) state.last.detected.ok = false;
        }
        state.last = null;
        return detected.apply(this, args);
    };
    return state;
}

/** What `detectTarget` would return for a fit, from its code (detection.ts, after `estimateHomography`). */
function predictedOutcome(rec, side, MIN_DETECTION_INLIERS) {
    if (!rec.ok) return { ok: false, reason: "no-consensus" };
    if (rec.numInliers < MIN_DETECTION_INLIERS) return { ok: false, reason: "too-few-inliers" };
    if (side !== "facing") return { ok: false, reason: "not-facing" };
    return { ok: true, reason: null };
}

const num = (v) => (Number.isFinite(v) ? v : String(v));

/** One H's row, classified, its outcome checked against the tracker's. */
function rowOf(rec, where, targetSide, MIN_DETECTION_INLIERS) {
    if (!rec.grid) fatal(`${JSON.stringify(where)}: an H with no tracker's grid to read`);
    const c = classify(rec.H, rec.grid);
    const side = targetSide(rec.H, rec.grid);
    const reached = rec.ok && rec.numInliers >= MIN_DETECTION_INLIERS;
    const predicted = predictedOutcome(rec, side, MIN_DETECTION_INLIERS);
    if (!rec.detected) fatal(`${JSON.stringify(where)}: an H the tracker's detected() never saw`);
    if (rec.detected.ok !== predicted.ok || rec.detected.reason !== predicted.reason) {
        fatal(`${JSON.stringify(where)}: detectTarget returned ${JSON.stringify(rec.detected)}, the classification's outcome ${JSON.stringify(predicted)}`);
    }
    return {
        ...where,
        H: rec.H.map(num),
        ok: rec.ok,
        numInliers: rec.numInliers,
        reached,
        side: reached ? side : null,
        sideIfRead: side,
        accepted: predicted.ok,
        reason: predicted.reason,
        classes: Object.keys(CLASS_NAMES).filter((k) => c[k]),
        det: num(c.det),
        scaledDet: c.scaledDet === null ? null : num(c.scaledDet),
        exactSign: c.exactSign,
        maxAbs: num(c.maxAbs),
    };
}

/** A frame record without what the clock writes. */
function masked(rec) {
    const r = JSON.parse(JSON.stringify(rec));
    delete r.trackerTimings;
    delete r.timings;
    return JSON.stringify(r);
}

// ---- a replay child: one clip of one form, every seed and schedule ----

async function replayChild(form, clip, seeds, outDir, refsDir) {
    const pk = await imp("examples/dist/webarkit-packages.mjs");
    const { replayRun } = await imp("scripts/replay-run.mjs");
    const { runSeeding, seedingRefusal, countGlobalRandomReads } = await imp("scripts/replay-seeding.mjs");
    const { PAGE_PROCESSING_BOX, targetCorners } = await imp("examples/js/bench-metrics.mjs");
    const { fitSize } = await imp("examples/js/pinball-shared.mjs");
    const cv = await pk.createJsfeatNextBackend();
    const caps = BREAK === "capability" ? { ...cv.capabilities, deterministicRansac: false } : cv.capabilities;
    const refused = seedingRefusal({ capabilities: caps });
    if (refused) fatal(`${clip}: ${refused}`);
    const wnftPath = join(ROOT, "examples/targets/pinball.wnft");
    const wnft = readFileSync(wnftPath);
    const decoded = pk.decode(new Uint8Array(wnft));
    if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
    const target = decoded.target;
    const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
    const { frames, pts, width, height, sha256: clipSha } = loadClip(clip, PAGE_PROCESSING_BOX, fitSize);
    // A frame is located by its media time: two frames with one time would be one.
    if (new Set(pts).size !== pts.length) fatal(`${clip}: repeated frame times, so a media time does not locate a frame`);
    const K = pk.intrinsics(width, height);
    const state = installWrappers(Object.getPrototypeOf(cv), pk.NftTracker.prototype);
    const runs = form === "def" ? DEF_RUNS : TILT_RUNS;
    const rows = [];
    const summary = { form, clip, clipSha, targetSha: sha256(wnft), runs: 0, frames: 0, identityFrames: 0, checkD: [], reads: 0, H: 0 };
    for (const seed of seeds) {
        for (const run of runs) {
            const one = (on) => {
                state.on = on;
                state.calls = [];
                state.trackers = [];
                state.perturbed = false;
                state.readOnce = false;
                let processIndex = -1;
                const base = runSeeding(seed, "frame");
                const seeding = {
                    ...base,
                    frame: (t) => {
                        processIndex++;
                        state.frameContext = { processIndex, mediaTimeSeconds: t, frameIndex: pts.indexOf(t) };
                        base.frame(t);
                    },
                };
                const { value, reads } = countGlobalRandomReads(() =>
                    replayRun({
                        NftTracker: pk.NftTracker,
                        cv,
                        target,
                        targetPoints,
                        detectMs: DEVICE_DETECT_MS,
                        frames,
                        pts,
                        K,
                        mode: run.mode,
                        stepMs: run.stepMs,
                        order: null,
                        options: {},
                        probe: null,
                        loops: form === "def" ? LOOPS : M3_LOOPS,
                        acquireMs: form === "def" ? DEVICE_ACQUIRE_MS[clip] : TILT_BORROWED_ACQUIRE_MS,
                        unwrapped: form === "tilt",
                        seeding,
                    }),
                );
                state.on = false;
                if (reads !== 0) fatal(`${clip}, ${run.mode}, ${run.schedule}, seed ${seed}: ${reads} read(s) of the global Math.random`);
                return { records: value, calls: state.calls };
            };
            const plain = one(false);
            const wrapped = one(true);
            if (plain.records.length !== wrapped.records.length) fatal(`${clip}, ${run.schedule}, seed ${seed}: the wrapper changed the run's length`);
            for (let k = 0; k < plain.records.length; k++) {
                if (masked(plain.records[k]) !== masked(wrapped.records[k])) {
                    fatal(`${clip}, ${run.mode}, ${run.schedule}, seed ${seed}, frame ${k}: the wrapper changed the run`);
                }
            }
            summary.identityFrames += plain.records.length;
            // Check D: the copied decoding and schedules against replay-clips' own export at seed 1.
            if (seed === 1) {
                const file = join(refsDir, form, exportName(clip, run.mode, run.schedule));
                if (!existsSync(file)) fatal(`check D: ${file} is missing`);
                const e = JSON.parse(readFileSync(file, "utf8"));
                if (e.seed !== 1 || e.seedPolicy !== "frame") fatal(`check D: ${file} is not --seed 1 --seed-policy frame`);
                if (e.target?.sha256 !== summary.targetSha) fatal(`check D: ${file}'s target is ${e.target?.sha256}, here ${summary.targetSha}`);
                if (e.frames.length !== plain.records.length) fatal(`check D: ${clip}, ${run.schedule}: ${plain.records.length} frames, the export's ${e.frames.length}`);
                for (let k = 0; k < e.frames.length; k++) {
                    if (masked(e.frames[k]) !== masked(plain.records[k])) fatal(`check D: ${clip}, ${run.mode}, ${run.schedule}: frame ${k} differs from replay-clips' export`);
                }
                summary.checkD.push({ schedule: `${run.mode}, ${run.schedule}`, frames: e.frames.length });
            }
            // Every call inside a frame that ran the tracker's own detection, one at most per frame.
            const perFrame = new Map();
            for (const c of wrapped.calls) {
                const k = c.frame.processIndex;
                perFrame.set(k, (perFrame.get(k) ?? 0) + 1);
                if (wrapped.records[k].detectionUse !== "internal") fatal(`${clip}, ${run.schedule}, seed ${seed}: an H on frame ${k}, whose detectionUse is ${wrapped.records[k].detectionUse}`);
            }
            for (const [k, n] of perFrame) if (n !== 1) fatal(`${clip}, ${run.schedule}, seed ${seed}: ${n} H on frame ${k}`);
            // And the converse: every frame whose own detection got past too-few-matches has its H.
            const expected = wrapped.records.filter((r) => r.detectionUse === "internal" && r.reason !== "too-few-matches").length;
            for (let k = 0; k < wrapped.records.length; k++) {
                const r = wrapped.records[k];
                if (r.detectionUse === "internal" && r.reason !== "too-few-matches" && !perFrame.has(k)) {
                    fatal(`${clip}, ${run.mode}, ${run.schedule}, seed ${seed}: frame ${k} ran detection past too-few-matches, and no H was captured`);
                }
            }
            summary.expectedH = (summary.expectedH ?? 0) + expected;
            for (const c of wrapped.calls) {
                const where = {
                    input: form === "def" ? "replay, default form" : "replay, --clips tilt",
                    clip,
                    seed,
                    mode: run.mode,
                    schedule: run.schedule,
                    processIndex: c.frame.processIndex,
                    frameIndex: c.frame.frameIndex,
                    mediaTimeSeconds: c.frame.mediaTimeSeconds,
                    timestampMs: c.frame.timestampMs,
                };
                rows.push(rowOf(c, where, pk.targetSide, pk.MIN_DETECTION_INLIERS));
            }
            summary.runs++;
            summary.frames += wrapped.records.length;
        }
    }
    summary.H = rows.length;
    return { rows, summary };
}

// ---- the ground-truth child: references' sequences, copied, with the wrappers on or off ----

/** #226's serialisation, copied from the references script (`canonical`). */
function canonical(x) {
    if (x === null || typeof x !== "object") return typeof x === "number" && !Number.isFinite(x) ? String(x) : x;
    if (ArrayBuffer.isView(x)) return Array.from(x, (v) => (Number.isFinite(v) ? v : String(v)));
    if (Array.isArray(x)) return x.map(canonical);
    const o = {};
    for (const k of Object.keys(x).sort()) if (x[k] !== undefined) o[k] = canonical(x[k]);
    return o;
}

async function truthChild(wrapped) {
    registerHooks({
        resolve(specifier, context, next) {
            try {
                return next(specifier, context);
            } catch (e) {
                const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
                if (e?.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) return next(`${specifier.slice(0, -3)}.ts`, context);
                throw e;
            }
        },
    });
    // The references script's tripwire on the global generator, copied.
    const real = Math.random;
    let globalReads = 0;
    let opened = 0;
    const outside = () => (globalReads++, real());
    let current = outside;
    Object.defineProperty(Math, "random", {
        configurable: true,
        get: () => current,
        set: (v) => {
            if (v !== outside) opened++;
            current = v;
        },
    });
    const { createJsfeatNextBackend, intrinsics } = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
    const sw = await imp("packages/nft-tracker/ground-truth/tracking/track_frame_sweep.ts");
    const seq = await imp("packages/nft-tracker/ground-truth/tracker_sequences.ts");
    const tt = await imp("packages/nft-tracker/ground-truth/fixtures/tracking_target.ts");
    // The module tracker_sequences.ts imports as "../src/tracker.js": the same URL, the same class.
    const { NftTracker } = await imp("packages/nft-tracker/src/tracker.ts");
    const { targetSide, MIN_DETECTION_INLIERS } = await imp("packages/nft-tracker/src/detection.ts");
    const realCv = await createJsfeatNextBackend();
    const caps = BREAK === "capability" ? { ...realCv.capabilities, deterministicRansac: false } : realCv.capabilities;
    if (caps.deterministicRansac !== true) fatal("the ground truth's backend does not declare deterministicRansac");
    const state = installWrappers(Object.getPrototypeOf(realCv), NftTracker.prototype, false);
    const injected = [];
    const cv = Object.create(realCv);
    cv.estimateHomography = (src, dst, options) => {
        if (typeof options?.rng !== "function") return realCv.estimateHomography(src, dst, options);
        let e = injected.find((x) => x.rng === options.rng);
        if (!e) injected.push((e = { rng: options.rng, draws: 0 }));
        return realCv.estimateHomography(src, dst, { ...options, rng: () => (e.draws++, options.rng()) });
    };
    const K = intrinsics(seq.CAMERA.width, seq.CAMERA.height);
    const runs = [];
    const rows = [];
    let calls = 0;
    const record = (name, r) => {
        const from = injected.length;
        state.on = wrapped;
        state.calls = [];
        state.trackers = [];
        state.frameContext = {};
        const out = r();
        state.on = false;
        const list = Array.isArray(out) ? out : [out];
        list.forEach((one, j) => {
            if (BREAK === "rtruth" && runs.length === 0) one.states = `${one.states}X`;
            runs.push({
                name: Array.isArray(out) ? `${name}/v${one.v}` : name,
                states: one.states,
                results: canonical(one.results),
                truths: canonical(one.truths),
                draws: injected[from + j]?.draws ?? 0,
            });
        });
        // A run's calls in order. Velocity's five runs share one `record`, each with a tracker of its
        // own: a call's run is its tracker's place in the order the trackers first processed a frame.
        if (wrapped && state.trackers.length !== list.length) fatal(`${name}: ${state.trackers.length} trackers for ${list.length} runs`);
        for (const c of state.calls) {
            const runName = Array.isArray(out) ? `${name}/v${list[c.trackerIndex].v}` : name;
            rows.push(rowOf(c, { input: "ground truth", run: runName, frameIndex: c.frame.timestampMs / 33, timestampMs: c.frame.timestampMs, callIndex: calls++ }, targetSide, MIN_DETECTION_INLIERS));
        }
        // Every frame whose own detection got past too-few-matches has exactly one H, and no other frame has one.
        if (wrapped) {
            list.forEach((one, j) => {
                const got = state.calls.filter((c) => c.trackerIndex === j).map((c) => c.frame.timestampMs / 33);
                const want = [];
                one.results.forEach((r, i) => {
                    if (r.detectionUse === "internal" && r.reason !== "too-few-matches") want.push(i);
                });
                if (got.join(",") !== want.join(",")) fatal(`${name}, run ${j}: H captured on frames [${got}], detections past too-few-matches on [${want}]`);
            });
        }
    };
    const shipped = seq.shippedTarget();
    const fixture = tt.pinballTrackingTarget(cv);
    const SETTLE = seq.SETTLE_SLIDE_FRAMES + seq.SETTLE_REST_FRAMES;
    const oneEuro = { poseFilter: { mode: "one-euro" } };
    record("shipped/leaveAndReturn", () => seq.shippedLeaveAndReturn(cv, K));
    record("shipped/wander", () => seq.shippedWander(cv, K));
    record("shipped/velocity", () => seq.shippedVelocitySteps(cv, K));
    record("shipped/rest", () => seq.run(cv, K, shipped, seq.restPath, seq.REST_FRAMES));
    record("shipped/rest/one-euro", () => seq.run(cv, K, shipped, seq.restPath, seq.REST_FRAMES, oneEuro));
    record("shipped/settle", () => seq.run(cv, K, shipped, seq.settlePath, SETTLE));
    record("shipped/settle/one-euro", () => seq.run(cv, K, shipped, seq.settlePath, SETTLE, oneEuro));
    record("fixture/leaveAndReturn", () => seq.run(cv, K, fixture, seq.leaveAndReturn, 106));
    record("fixture/wander", () => seq.run(cv, K, fixture, seq.wander, 40));
    const openedBefore = opened;
    state.on = wrapped;
    state.calls = [];
    const sweep = sw.shippedSweep();
    state.on = false;
    const sweepCalls = state.calls.length;
    // The sweep has no tracker, so no grid: a detection call there could not be classified.
    if (sweepCalls !== 0) fatal(`ground truth: the sweep made ${sweepCalls} estimateHomography call(s), which this script does not classify`);
    if (BREAK === "global-read") Math.random();
    if (globalReads !== 0) fatal(`ground truth: ${globalReads} read(s) of the global Math.random`);
    const text = JSON.stringify(
        canonical({ runs, sweep: { right: sweep.right, wrong: sweep.wrong, steps: sweep.steps, regionsOpened: opened - openedBefore } }),
    );
    const hash = sha256(text);
    if (hash !== R_TRUTH) fatal(`ground truth ${wrapped ? "with" : "without"} the wrappers: sha256 ${hash}, R-truth ${R_TRUTH}`);
    const perRun = runs.map((r) => ({ name: r.name, frames: r.results.length, draws: r.draws }));
    return { rows, summary: { wrapped, hash, bytes: text.length, perRun, sweepCalls, H: rows.length } };
}

// ---- the parent: the counted run ----

const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();

function treeState() {
    const head = git("rev-parse", "HEAD").trim();
    const status = git("status", "--porcelain");
    const diff = git("diff", "HEAD");
    let preflight;
    try {
        preflight = execFileSync(process.execPath, [join(ROOT, "scripts/provenance-preflight.mjs")], { cwd: ROOT }).toString().trim();
    } catch (e) {
        preflight = `FAILED: ${e.stdout?.toString().trim()} ${e.stderr?.toString().trim()}`;
    }
    return { head, statusSha: sha256(status), diffSha: sha256(diff), clean: status === "" && diff === "", preflight };
}

function runChild(args, logFile) {
    return new Promise((res) => {
        const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        p.stderr.on("data", (d) => (err += d));
        p.on("close", (code) => {
            writeFileSync(logFile, err);
            res({ code, err });
        });
    });
}

const pct = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
const e6 = (v) => (typeof v === "number" ? v.toExponential(6) : String(v));
const fmtT = (v) => (v === null || v === undefined ? "—" : String(Number(v.toFixed(6))));

async function parent(runDir, refsDir) {
    if (!runDir || !refsDir) fatal("--run <run dir> and --refs <refs dir> are required");
    runDir = resolve(runDir);
    refsDir = resolve(refsDir);
    const seedsArg = arg("--seeds") ?? "1-8";
    const [s0, s1] = seedsArg.split("-").map(Number);
    const seeds = Array.from({ length: s1 - s0 + 1 }, (_, i) => s0 + i);
    const only = arg("--only");
    mkdirSync(join(runDir, "rows"), { recursive: true });
    mkdirSync(join(runDir, "logs"), { recursive: true });
    const start = treeState();
    if (!start.clean) fatal(`the tree is not clean at the start: status ${start.statusSha}, diff ${start.diffSha}`);
    if (!start.preflight.startsWith("provenance preflight: examples/dist/provenance.json describes this tree")) fatal(`provenance preflight at the start: ${start.preflight}`);
    const breakFile = join(ROOT, "docs/benchmarks/.239-tree-break");
    try {
        if (BREAK === "tree-state") {
            // fatal() exits the process, which skips `finally`: the file goes on exit, however it comes.
            process.on("exit", () => rmSync(breakFile, { force: true }));
            writeFileSync(breakFile, "a file the run did not start with\n");
        }
        // The references, at this head.
        let rreplay = null;
        {
            let dir = refsDir;
            if (BREAK === "rreplay") {
                dir = join(runDir, "refs-copy");
                rmSync(dir, { recursive: true, force: true });
                cpSync(refsDir, dir, { recursive: true });
                const f = join(dir, "def", exportName("pinball-static.mp4", "tracking", "every frame"));
                const j = JSON.parse(readFileSync(f, "utf8"));
                j.frames[0].numInliers += 1;
                writeFileSync(f, JSON.stringify(j, null, 2));
            }
            for (const g of ["def", "ext", "tilt"]) {
                for (const f of readdirSync(join(refsDir, g))) {
                    const ps = JSON.parse(readFileSync(join(refsDir, g, f), "utf8")).packageSource;
                    if (ps?.manifestHead !== start.head || ps?.manifestClean !== true) fatal(`${g}/${f} was not written at ${start.head}, clean: ${JSON.stringify(ps)}`);
                }
            }
            const out = execFileSync(process.execPath, [join(ROOT, REFERENCES), "--replay", dir, "--v1-projection"], { cwd: ROOT, maxBuffer: 1 << 26 }).toString().trim().split("\n");
            rreplay = out[out.length - 1].replace(/^.*: /, "");
            if (rreplay !== R_REPLAY) fatal(`R-replay with --v1-projection is ${rreplay}, registered ${R_REPLAY}`);
        }
        let rtruth = null;
        {
            const gt = join(runDir, "references-truth.json");
            const out = execFileSync(process.execPath, ["--experimental-transform-types", join(ROOT, REFERENCES), "--ground-truth", gt], { cwd: ROOT, maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] })
                .toString()
                .trim()
                .split("\n");
            rtruth = out[out.length - 1].replace(/^.*sha256 /, "");
            if (rtruth !== R_TRUTH) fatal(`R-truth from the references script is ${rtruth}, registered ${R_TRUTH}`);
        }
        // The children.
        const specs = [
            ...CLIPS.map((c) => `def:${c}`),
            ...TILT_CLIPS.map((c) => `tilt:${c}`),
            "truth:plain",
            "truth:wrapped",
        ].filter((s) => !only || s === only);
        const queue = [...specs];
        const results = {};
        const breakArgs = BREAK ? ["--break", BREAK] : [];
        const worker = async () => {
            while (queue.length > 0) {
                const spec = queue.shift();
                const slug = spec.replace(/[^a-z0-9]+/gi, "-");
                const flags = spec.startsWith("truth") ? ["--experimental-transform-types"] : [];
                const r = await runChild([...flags, SELF, "--child", spec, "--out", join(runDir, "rows", `${slug}.jsonl`), "--refs", refsDir, "--seeds", seedsArg, ...breakArgs], join(runDir, "logs", `${slug}.stderr`));
                if (r.code !== 0) fatal(`${spec}: ${r.err.split("\n").filter((l) => l.includes("239-probe")).join(" | ") || `exit ${r.code}`}`);
                results[spec] = JSON.parse(readFileSync(join(runDir, "rows", `${slug}.summary.json`), "utf8"));
            }
        };
        await Promise.all(Array.from({ length: 4 }, worker));
        const end = treeState();
        if (end.head !== start.head || end.statusSha !== start.statusSha || end.diffSha !== start.diffSha || !end.clean || end.preflight !== start.preflight) {
            fatal(`the tree changed during the run: start ${JSON.stringify(start)}, end ${JSON.stringify(end)}`);
        }
        report({ start, end, rreplay, rtruth, specs, results, runDir, seeds });
    } finally {
        rmSync(breakFile, { force: true });
    }
}

function report({ start, end, rreplay, rtruth, specs, results, runDir, seeds }) {
    const lines = [];
    const say = (s = "") => lines.push(s);
    const jsfeat = JSON.parse(readFileSync(join(ROOT, "node_modules/@webarkit/jsfeat-next/package.json"), "utf8")).version;
    say("# #239's probe: the H the backend returns to detection, classified");
    say();
    say(`this script's source, SHA-256: ${sha256(readFileSync(SELF))}`);
    say(`head ${start.head}; Node ${process.version}; @webarkit/jsfeat-next ${jsfeat}; seeds ${seeds[0]} to ${seeds[seeds.length - 1]}, --seed-policy frame`);
    const replaySpecs = specs.filter((s) => !s.startsWith("truth"));
    if (replaySpecs.length > 0) {
        say(`target examples/targets/pinball.wnft, SHA-256 ${results[replaySpecs[0]].summary.targetSha}`);
        for (const s of replaySpecs) say(`clip ${results[s].summary.clip}, SHA-256 ${results[s].summary.clipSha}`);
    }
    say();
    say("## The checks (each fatal before this report)");
    say();
    say(`- tree at the start and the end: head ${start.head.slice(0, 7)} both; status and diff empty both (sha256 ${start.statusSha.slice(0, 8)}…, ${start.diffSha.slice(0, 8)}…); the preflight passed at both`);
    if (rreplay) say(`- R-replay, 19 step-independent outputs at this head, with --v1-projection: ${rreplay}`);
    if (rtruth) say(`- R-truth, the references script: ${rtruth}`);
    for (const s of specs.filter((x) => x.startsWith("truth"))) {
        const t = results[s].summary;
        say(`- R-truth, this script's copy of the sequences, the wrappers installed, recording ${t.wrapped ? "on" : "off"}: ${t.hash}, ${t.bytes} bytes; the sweep made ${t.sweepCalls} detection calls`);
    }
    let identity = 0;
    let runs = 0;
    let expectedH = 0;
    for (const s of replaySpecs) {
        identity += results[s].summary.identityFrames;
        runs += results[s].summary.runs;
        expectedH += results[s].summary.expectedH;
    }
    if (replaySpecs.length > 0) {
        say(`- recording changes nothing: ${runs} replay runs, each with the wrappers installed and recording off, then on, ${identity} frame records equal, timing fields masked; that their presence changes nothing is check D's and R-truth's, against outputs made without them`);
        say(`- deterministicRansac declared, checked once in each replay process and in the ground truth's; 0 reads of the global Math.random in each of the ${2 * runs} replay runs and in the ground truth`);
        for (const s of replaySpecs) {
            const d = results[s].summary.checkD;
            say(`- check D, ${s}: ${d.map((x) => `${x.schedule} ${x.frames}`).join("; ")} frames equal replay-clips' seed 1 exports`);
        }
        say(`- every replay frame whose own detection got past too-few-matches has exactly one H captured, and no other frame has one: ${expectedH} such frames, every seed`);
    }
    if (specs.includes("truth:wrapped")) say("- the same on the ground truth, run by run");
    say("- every H's outcome by detectTarget's rule equals what the tracker's detected() received, on every H below");
    say();
    // The rows.
    const rows = [];
    for (const s of specs) {
        if (s === "truth:plain") continue;
        const slug = s.replace(/[^a-z0-9]+/gi, "-");
        const text = readFileSync(join(runDir, "rows", `${slug}.jsonl`), "utf8");
        for (const l of text.split("\n")) if (l) rows.push(JSON.parse(l));
    }
    const inputs = [...new Set(rows.map((r) => r.input))];
    say("## The H examined, per input");
    say();
    say("| input | H returned | ok | reach targetSide (ok, ≥ 5 inliers) | accepted |");
    say("|---|---|---|---|---|");
    const byInput = (input) => rows.filter((r) => r.input === input);
    for (const input of inputs) {
        const r = byInput(input);
        say(`| ${input} | ${r.length} | ${r.filter((x) => x.ok).length} | ${r.filter((x) => x.reached).length} | ${r.filter((x) => x.accepted).length} |`);
    }
    say(`| all | ${rows.length} | ${rows.filter((x) => x.ok).length} | ${rows.filter((x) => x.reached).length} | ${rows.filter((x) => x.accepted).length} |`);
    say();
    for (const input of inputs.filter((i) => i.startsWith("replay"))) {
        say(`${input}, per schedule:`);
        say();
        say("| clip | mode, schedule | H returned (seeds summed) | reach targetSide | accepted |");
        say("|---|---|---|---|---|");
        const keys = [...new Set(byInput(input).map((r) => `${r.clip}|${r.mode}, ${r.schedule}`))];
        for (const k of keys) {
            const [clip, sched] = k.split("|");
            const r = byInput(input).filter((x) => x.clip === clip && `${x.mode}, ${x.schedule}` === sched);
            say(`| ${clip} | ${sched} | ${r.length} | ${r.filter((x) => x.reached).length} | ${r.filter((x) => x.accepted).length} |`);
        }
        say();
    }
    say("## The counts per class");
    say();
    say(`| class | ${inputs.map((i) => `${i}: all / reaching targetSide`).join(" | ")} | all inputs: all / reaching targetSide |`);
    say(`|---|${inputs.map(() => "---|").join("")}---|`);
    for (const [k, name] of Object.entries(CLASS_NAMES)) {
        const cell = (rs) => `${rs.filter((x) => x.classes.includes(k)).length} / ${rs.filter((x) => x.reached && x.classes.includes(k)).length}`;
        say(`| ${name} | ${inputs.map((i) => cell(byInput(i))).join(" | ")} | ${cell(rows)} |`);
    }
    say();
    const cases = rows.filter((r) => r.classes.length > 0);
    say(`## The cases, each located: ${cases.length}`);
    say();
    if (cases.length === 0) say(`None. No H of the ${rows.length} examined is in any class.`);
    else {
        say("| input | where | classes | targetSide | accepted | H |");
        say("|---|---|---|---|---|---|");
        for (const r of cases) {
            const where = r.input === "ground truth" ? `${r.run}, frame ${r.frameIndex}` : `${r.clip}, seed ${r.seed}, ${r.mode}, ${r.schedule}, frame ${r.frameIndex}, media time ${fmtT(r.mediaTimeSeconds)} s, processed ${r.processIndex}`;
            say(`| ${r.input} | ${where} | ${r.classes.join(", ")} | ${r.reached ? r.side : `not read (would be ${r.sideIfRead})`} | ${r.accepted} | ${JSON.stringify(r.H)} |`);
        }
    }
    say();
    say("## The distributions");
    say();
    say("Nearest-rank percentiles. |det H| is the determinant as targetSide computes it.");
    say();
    say("| quantity | over | n | min | p1 | median | p99 | max |");
    say("|---|---|---|---|---|---|---|---|");
    const dist = (label, over, vals) => {
        const v = Float64Array.from(vals).sort();
        if (v.length === 0) return say(`| ${label} | ${over} | 0 | — | — | — | — | — |`);
        say(`| ${label} | ${over} | ${v.length} | ${e6(v[0])} | ${e6(pct(v, 1))} | ${e6(pct(v, 50))} | ${e6(pct(v, 99))} | ${e6(v[v.length - 1])} |`);
    };
    const finiteRows = rows.filter((r) => typeof r.det === "number" && typeof r.maxAbs === "number");
    if (finiteRows.length !== rows.length) say(`(${rows.length - finiteRows.length} H with a non-finite determinant or entry are left out of the distributions and listed above.)`);
    for (const [over, rs] of [
        ["every H returned", finiteRows],
        ["H reaching targetSide", finiteRows.filter((r) => r.reached)],
        ["H accepted", finiteRows.filter((r) => r.accepted)],
    ]) {
        dist("|det H|", over, rs.map((r) => Math.abs(r.det)));
        dist("max |Hᵢ|", over, rs.map((r) => r.maxAbs));
        dist("|det (H / max |Hᵢ|)|", over, rs.filter((r) => typeof r.scaledDet === "number").map((r) => Math.abs(r.scaledDet)));
    }
    say();
    say("## The margins");
    say();
    for (const [over, rs] of [
        ["every H returned", finiteRows],
        ["H reaching targetSide", finiteRows.filter((r) => r.reached)],
    ]) {
        const nonzero = rs.filter((r) => r.det !== 0);
        const zero = rs.filter((r) => r.det === 0);
        const at = (key) => (nonzero.length ? nonzero.reduce((a, b) => (Math.abs(b[key]) < Math.abs(a[key]) ? b : a)) : null);
        const where = (r) => (r.input === "ground truth" ? `${r.run}, frame ${r.frameIndex}` : `${r.clip}, seed ${r.seed}, ${r.mode}, ${r.schedule}, frame ${r.frameIndex}`);
        const byDet = at("det");
        const byScaled = at("scaledDet");
        if (byDet) say(`- ${over}: the smallest |det H| that clears 0 is ${e6(Math.abs(byDet.det))}, on ${where(byDet)}, ${byDet.numInliers} inliers, its |det (H / max |Hᵢ|)| ${e6(Math.abs(byDet.scaledDet))}; the smallest |det (H / max |Hᵢ|)| is ${e6(Math.abs(byScaled.scaledDet))}, on ${where(byScaled)}`);
        const minAbs = byDet ? Math.abs(byDet.det) : null;
        const minScaled = byScaled ? Math.abs(byScaled.scaledDet) : null;
        const zeroSingular = zero.filter((r) => r.exactSign === 0).length;
        say(`- ${over}: ${rs.length} H; computed determinant exactly 0 on ${zero.length} (of which the exact determinant is 0 on ${zeroSingular}); smallest |det H| that clears 0: ${minAbs === null ? "—" : e6(minAbs)}; smallest |det (H / max |Hᵢ|)| there: ${minScaled === null ? "—" : e6(minScaled)}`);
        say(`  - the computed sign against the exact sign: ${rs.filter((r) => (Math.sign(r.det) || 0) === r.exactSign).length} agree, ${rs.filter((r) => (Math.sign(r.det) || 0) !== r.exactSign).length} disagree`);
    }
    say();
    say("## What targetSide returned, on the H that reach it");
    say();
    const reached = rows.filter((r) => r.reached);
    for (const side of ["facing", "reversed", "mixed-w", "singular"]) say(`- ${side}: ${reached.filter((r) => r.side === side).length}`);
    console.log(lines.join("\n"));
}

// ---- entry ----

if (argv.includes("--self-test")) await selfTest();
else if (arg("--child")) {
    const spec = arg("--child");
    const out = arg("--out");
    const seedsArg = arg("--seeds") ?? "1-8";
    const [s0, s1] = seedsArg.split("-").map(Number);
    const seeds = Array.from({ length: s1 - s0 + 1 }, (_, i) => s0 + i);
    const [kind, what] = spec.split(":");
    const r = kind === "truth" ? await truthChild(what === "wrapped") : await replayChild(kind, what, seeds, null, resolve(arg("--refs")));
    writeFileSync(out, r.rows.map((x) => JSON.stringify(x)).join("\n") + (r.rows.length ? "\n" : ""));
    writeFileSync(out.replace(/\.jsonl$/, ".summary.json"), JSON.stringify({ summary: r.summary }));
} else if (arg("--run")) await parent(arg("--run"), arg("--refs"));
else fatal("usage: --self-test [--break <defect>] | --run <run dir> --refs <refs dir> [--only <spec>] [--seeds a-b] [--break <defect>]");
