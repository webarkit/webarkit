/*
 *  2026-10-29-106-stage3-check.mjs
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
 * #106's Stage 3 check: the criteria C0 to C4 and the prediction P registered in
 * docs/benchmarks/2026-10-29-106-stage3-registration.md (#198, merged as 12ebed3), run
 * against the implementation in packages/nft-tracker/src/ (the `poseFilter` option and
 * src/pose/pose_filter.ts). Its results are recorded in
 * docs/benchmarks/2026-10-29-106-stage3-addendum.md.
 *
 *     npm ci && npm run build
 *     node docs/benchmarks/2026-10-29-106-stage3-check.mjs --base <a built checkout of 12ebed3>
 *
 * Its stdout is deterministic: no clock, no path and no timing is printed, so two runs give
 * the same bytes (the addendum states their SHA-256).
 *
 * This file is a copy of #197's probe script
 * (docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.mjs at 0665a96), as the
 * registration's "How each is read, as commands" requires: the probe's lines 88 to 97,
 * 125 to 433 (its scratch filter, with `so3Log` in its `acos` form, ruling A), 513 to 523
 * (its rest and settle paths) and 1006 to 1010 (`settings()`, the joint grid) are kept
 * byte-identical; only the header, the imports, Step 0, `main` with its output and
 * `runLength` differ. The copy's `filterPoses` is the filter that was measured, and the
 * implementation is checked against it.
 *
 * What it drives:
 *
 * 1. `NftTracker`, through `run` of `ground-truth/tracker_sequences.ts`, on the nine
 *    registered sequences and paths, with `poseFilter` absent, off, at each of the joint
 *    grid's twelve settings, and at the derived pair through the `DEFAULT_` constants;
 *    and, for C0, the same paths through `run` at the registration's merge commit, a
 *    second checkout passed as `--base`, whose `tracker_sequences.ts` has no rest or
 *    settle path, so those two are the copy's. Where the timestamps are not `i * 33`
 *    (C2's two timestamp runs, C3's halved spacing), `run`'s loop is repeated here: a
 *    fresh tracker, one `withSeededRandom(SEED)` around the whole loop, as `run` does,
 *    each frame `frameAt(path(i), i)`. The repeated loop is checked to reproduce `run`
 *    field for field at `i * 33` before any of its results is read.
 * 2. The filter module, `src/pose/pose_filter.ts`, for the per-layer sweeps (C4 (b)),
 *    C4 (c), the `pose.good` stream (C2) and P4: the only place a layer can pass through
 *    (ruling C).
 *
 * The TypeScript modules are bundled by esbuild into a temporary directory and imported
 * from there, as the probe bundles them. Every check runs before any figure is printed
 * and is exercised both ways; a failed check exits with its reason and prints nothing
 * else. The verdicts are the addendum's, from the figures printed here.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const out = [];
const say = (s = "") => out.push(s);
const fatal = (msg) => {
    process.stderr.write(`FATAL: ${msg}\n`);
    process.exit(1);
};
const fix = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

// =============================================================================================
// Step 0: what is read, with its SHA-256.
// =============================================================================================
const READ = [
    "packages/nft-tracker/ground-truth/tracker_sequences.ts",
    "packages/nft-tracker/ground-truth/fixtures/seeded_rng.ts",
    "packages/nft-tracker/ground-truth/fixtures/warped_frames.ts",
    "packages/nft-tracker/ground-truth/fixtures/tracking_target.ts",
    "packages/nft-tracker/ground-truth/fixtures/pgm.ts",
    "packages/nft-tracker/ground-truth/fixtures/pinball-target-640.pgm",
    "packages/nft-tracker/test/pose/pose_metric.ts",
    "packages/nft-tracker/src/tracker.ts",
    "packages/nft-tracker/src/pose/pose_filter.ts",
    "packages/nft-tracker/src/pose/select_pose.ts",
    "packages/nft-tracker/src/pose/closed_form.ts",
    "examples/targets/pinball.wnft",
    "packages/cv-backend-jsfeatnext/dist/index.js",
    "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs",
];
const VERSIONS = [
    "packages/nft-tracker/package.json",
    "packages/cv-backend-jsfeatnext/package.json",
    "node_modules/@webarkit/jsfeat-next/package.json",
];
/** The registration's merge commit (#198): C0's base. */
const REGISTRATION_MERGE = "12ebed3";
/** The derived values the `DEFAULT_` constants must equal (the registration, "The derived parameters"). */
const DERIVED = { rotationMinCutOff: 1, rotationBeta: 10, translationMinCutOff: 1, translationBeta: 0.1, dCutOff: 1 };
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

// =============================================================================================
// The probe's constants, named before any figure.
// =============================================================================================
/** The probe's rest path: 60 frames at 33 ms is 2 s, over 12 time constants of a 1 Hz cutoff. */
const REST_FRAMES = 60;
/** The velocity step's first moving frame (`velocityStep`: `i < 5 ? 0 : v * (i - 4)`). */
const STEP_FRAME = 5;
/** One Euro's derivative cutoff, Hz, shared by both layers (the paper's value). */
const D_CUTOFF = 1;
/** The grid: the reasons are in the record, "The grid". */
const MIN_CUTOFFS = [0.5, 1, 3];
const BETAS_ROT = [0, 1, 10, 100];
const BETAS_T = [0, 0.001, 0.01, 0.1];
/** leaveAndReturn's last rest segment begins here (`i < 96 ? … : 0`). */
const LAR_REST_FROM = 96;
/** The setting used for the responsiveness confirmation and the both-ways checks. */
const ONE_SETTING = { minCutOffR: 1, betaR: 0, minCutOffT: 1, betaT: 0 };
/**
 * The settling probe path: leaveAndReturn's return slide (260 px to 0 over 40 frames, the same
 * smoothstep), then at rest. SETTLE_REST_FRAMES = 40 rest frames: over 3τ at the lowest cutoff
 * (3τ at 0.5 Hz is 0.95 s, 29 frames at 33 ms), with eleven frames of margin.
 */
const SETTLE_SLIDE_FRAMES = 40;
const SETTLE_REST_FRAMES = 40;
/**
 * The three proposals the record states for the ruling, checked here against the sweeps so that
 * each selects some settings and not all of them: a bound every setting meets selects nothing.
 */
const PROPOSED_STEADINESS_RATIO = 0.25;
const proposedB = (unfilteredPeak, v) => unfilteredPeak + 0.5 * v;
const PROPOSED_SETTLING_FRAMES = 15;
/** The rotation layer on wander: its median error at most this far above the unfiltered median, px. */
const PROPOSED_WANDER_DIFF = 0.5;
/** The joint grid's pose digest on the original sequences at 3b275a1; a change is fatal. */
const POSE_DIGEST_AT_3B275A1 = "86c8536dc80d1778187a29b95af3e1856795b678b70ff030bc7764169a9873b6";
/** Tolerances of the checks. */
const ROTATION_TOL = 1e-9;
const TRANSCRIPTION_TOL = 1e-12;

// =============================================================================================
// Small matrix algebra on row-major 3 × 3 Float64Arrays and 3-vectors.
// =============================================================================================
const I3 = () => Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
function mul3(a, b) {
    const o = new Float64Array(9);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
}
function transpose3(a) {
    return Float64Array.from([a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]);
}
function det3(a) {
    return (
        a[0] * (a[4] * a[8] - a[5] * a[7]) -
        a[1] * (a[3] * a[8] - a[5] * a[6]) +
        a[2] * (a[3] * a[7] - a[4] * a[6])
    );
}
/** ‖RᵀR − I‖, Frobenius. */
function orthoDefect(R) {
    const M = mul3(transpose3(R), R);
    let s = 0;
    for (let i = 0; i < 9; i++) {
        const d = M[i] - (i % 4 === 0 ? 1 : 0);
        s += d * d;
    }
    return Math.sqrt(s);
}
/** `log(R)` as a rotation vector, for a rotation away from π. */
function so3Log(R) {
    const c = Math.min(1, Math.max(-1, (R[0] + R[4] + R[8] - 1) / 2));
    const theta = Math.acos(c);
    const v = [R[7] - R[5], R[2] - R[6], R[3] - R[1]];
    if (theta > Math.PI - 1e-3) fatal(`so3Log: a step of ${theta} rad, too close to π to read`);
    const k = theta < 1e-12 ? 0.5 : theta / (2 * Math.sin(theta));
    return Float64Array.from([k * v[0], k * v[1], k * v[2]]);
}
/** `exp([ω]×)`, Rodrigues. */
function so3Exp(w) {
    const theta = Math.hypot(w[0], w[1], w[2]);
    const K = Float64Array.from([0, -w[2], w[1], w[2], 0, -w[0], -w[1], w[0], 0]);
    const R = I3();
    const a = theta < 1e-12 ? 1 : Math.sin(theta) / theta;
    const b = theta < 1e-12 ? 0.5 : (1 - Math.cos(theta)) / (theta * theta);
    const KK = mul3(K, K);
    for (let i = 0; i < 9; i++) R[i] += a * K[i] + b * KK[i];
    return R;
}
/** The angle, degrees, between two rotations. */
function angleDeg(A, B) {
    const w = so3Log(mul3(transpose3(A), B));
    return (Math.hypot(w[0], w[1], w[2]) * 180) / Math.PI;
}

// =============================================================================================
// The scratch filter. Layer 1: the vector One Euro core, on a step already computed.
// =============================================================================================
const alpha = (te, cutoff) => {
    const r = 2 * Math.PI * cutoff * te;
    return r / (r + 1);
};
class OneEuroCore {
    constructor(n, minCutOff, beta, dCutOff) {
        this.n = n;
        this.minCutOff = minCutOff;
        this.beta = beta;
        this.dCutOff = dCutOff;
        this.dxPrev = new Float64Array(n);
    }
    reset() {
        this.dxPrev.fill(0);
    }
    /** The smoothed step for `delta = x − x̂ₖ₋₁` over `te` seconds: `x̂ₖ = x̂ₖ₋₁ + step`. */
    step(te, delta) {
        const ad = alpha(te, this.dCutOff);
        const o = new Float64Array(this.n);
        for (let i = 0; i < this.n; i++) {
            const dx = delta[i] / te;
            const dxHat = ad * dx + (1 - ad) * this.dxPrev[i];
            const cutoff = this.minCutOff + this.beta * Math.abs(dxHat);
            o[i] = alpha(te, cutoff) * delta[i];
            this.dxPrev[i] = dxHat;
        }
        return o;
    }
}

/**
 * The reference form, transcribed from oneeurofilter-ts's `filter` (its loop
 * body: `dx[i] = (x[i] - xPrev[i]) / te`, `xHat[i] = a * x[i] + (1 - a) * xPrev[i]`,
 * then `xPrev.set(xHat)`), for the transcription check only.
 */
class ReferenceOneEuro {
    constructor(minCutOff, beta, dCutOff, rawDerivative = false) {
        this.minCutOff = minCutOff;
        this.beta = beta;
        this.dCutOff = dCutOff;
        this.rawDerivative = rawDerivative;
        this.xPrev = null;
        this.xRaw = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }
    filter(t, x) {
        if (this.xPrev === null) {
            this.xPrev = x;
            this.xRaw = x;
            this.tPrev = t;
            return x;
        }
        const te = t - this.tPrev;
        const base = this.rawDerivative ? this.xRaw : this.xPrev;
        const dx = (x - base) / te;
        const ad = alpha(te, this.dCutOff);
        const dxHat = ad * dx + (1 - ad) * this.dxPrev;
        const a = alpha(te, this.minCutOff + this.beta * Math.abs(dxHat));
        const xHat = a * x + (1 - a) * this.xPrev;
        this.xPrev = xHat;
        this.xRaw = x;
        this.dxPrev = dxHat;
        this.tPrev = t;
        return xHat;
    }
}

// =============================================================================================
// Layer 2: the pose layer, applied to a sequence of tracker results.
// =============================================================================================
/**
 * `p`: `{ minCutOffR, betaR, minCutOffT, betaT }`; a layer whose `minCutOff` is
 * `null` is off, and that part of the pose passes through unfiltered (the
 * per-layer sweeps).
 *
 * `variant`: `"correct"`; `"elementwise"` (the rotation averaged element by
 * element, no exp: broken for the rotation check); `"no-reset"` (every pose
 * fed, nothing resets: broken for the forgetting check); `"clock"` (the period
 * read from `performance.now()`, which only this variant touches: broken for
 * the determinism check); `"forget-time"` (a reset also forgets the last input
 * timestamp, as this script did at 3b275a1: broken for the monotonic-timestamp
 * check).
 *
 * Two timestamps are kept apart: `tLast`, the previous frame's input timestamp
 * whatever that frame did, against which "does not increase" is judged; and
 * `tPrev`, the timestamp of the last pose the filter absorbed, from which the
 * period is taken.
 *
 * Returns per frame `{ pose, reset }`, `pose` null where the result has none,
 * and the reset counts by cause.
 */
function filterPoses(results, timestamps, p, variant = "correct") {
    const rotOn = p.minCutOffR !== null;
    const transOn = p.minCutOffT !== null;
    const coreR = new OneEuroCore(variant === "elementwise" ? 9 : 3, p.minCutOffR ?? 0, p.betaR ?? 0, D_CUTOFF);
    const coreT = new OneEuroCore(3, p.minCutOffT ?? 0, p.betaT ?? 0, D_CUTOFF);
    let Rhat = null;
    let that = null;
    let tPrev = -Infinity;
    let tLast = -Infinity;
    let clockPrev = 0;
    const causes = { notTrack: 0, notGood: 0, nonIncreasing: 0 };
    const frames = [];
    for (let k = 0; k < results.length; k++) {
        const r = results[k];
        const t = timestamps[k];
        const hasPose = r.ok && r.pose !== null;
        let reset = false;
        if (variant !== "no-reset") {
            if (!(hasPose && r.state === "TRACK")) {
                reset = true;
                causes.notTrack++;
            } else if (!r.pose.good) {
                reset = true;
                causes.notGood++;
            } else if (!(t > tLast)) {
                reset = true;
                causes.nonIncreasing++;
            }
        } else if (!hasPose) {
            tLast = t;
            frames.push({ pose: null, reset: false });
            continue;
        }
        tLast = variant === "forget-time" && reset ? -Infinity : t;
        if (reset) {
            Rhat = null;
            that = null;
            coreR.reset();
            coreT.reset();
            tPrev = -Infinity;
            frames.push({ pose: hasPose ? copyPose(r.pose) : null, reset: true });
            continue;
        }
        if (Rhat === null) {
            Rhat = Float64Array.from(r.pose.R);
            that = Float64Array.from(r.pose.t);
            tPrev = t;
            if (variant === "clock") clockPrev = performance.now();
            frames.push({ pose: copyPose(r.pose), reset: false });
            continue;
        }
        let te = (t - tPrev) / 1000;
        if (variant === "clock") {
            const now = performance.now();
            te = Math.max(1e-6, (now - clockPrev) / 1000);
            clockPrev = now;
        }
        if (!rotOn) {
            Rhat = Float64Array.from(r.pose.R);
        } else if (variant === "elementwise") {
            const delta = new Float64Array(9);
            for (let i = 0; i < 9; i++) delta[i] = r.pose.R[i] - Rhat[i];
            const s = coreR.step(te, delta);
            for (let i = 0; i < 9; i++) Rhat[i] += s[i];
        } else {
            const omega = so3Log(mul3(transpose3(Rhat), r.pose.R));
            Rhat = mul3(Rhat, so3Exp(coreR.step(te, omega)));
        }
        if (!transOn) {
            that = Float64Array.from(r.pose.t);
        } else {
            const dt = Float64Array.from([r.pose.t[0] - that[0], r.pose.t[1] - that[1], r.pose.t[2] - that[2]]);
            const st = coreT.step(te, dt);
            for (let i = 0; i < 3; i++) that[i] += st[i];
        }
        tPrev = t;
        frames.push({ pose: { R: Float64Array.from(Rhat), t: Float64Array.from(that), good: true }, reset: false });
    }
    return { frames, causes };
}
/** Runs `fn` with `performance.now` and `Date.now` replaced by throwing stubs; restores them. */
function withoutClocks(fn) {
    const perfNow = performance.now;
    const dateNow = Date.now;
    const stub = () => {
        throw new Error("clock read");
    };
    performance.now = stub;
    Date.now = stub;
    try {
        return fn();
    } finally {
        performance.now = perfNow;
        Date.now = dateNow;
    }
}
const copyPose = (p) => ({ R: Float64Array.from(p.R), t: Float64Array.from(p.t), good: p.good });
const samePose = (a, b) => a.R.every((v, i) => Object.is(v, b.R[i])) && a.t.every((v, i) => Object.is(v, b.t[i]));
const posesDigest = (frames) =>
    sha256(frames.map((f) => (f.pose === null ? "-" : [...f.pose.R, ...f.pose.t].map((v) => v.toString()).join(","))).join("\n"));

// =============================================================================================
// Statistics.
// =============================================================================================
const median = (xs) => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const max = (xs) => (xs.length === 0 ? NaN : Math.max(...xs));
const samePath = (a, b) =>
    a.scale === b.scale &&
    (a.angle ?? 0) === (b.angle ?? 0) &&
    a.shift[0] === b.shift[0] &&
    a.shift[1] === b.shift[1] &&
    (a.perspective?.[0] ?? 0) === (b.perspective?.[0] ?? 0) &&
    (a.perspective?.[1] ?? 0) === (b.perspective?.[1] ?? 0);

// =============================================================================================
// Main.
// =============================================================================================
await main();
// Not `process.exit(0)`: a piped stdout on Windows is asynchronous, and exiting could truncate it.
process.exitCode = 0;

/** The TypeScript entries bundled into `dir` from `root`, one chunk per shared module, imported. */
async function bundle(root, entries, dir) {
    await build({
        entryPoints: Object.fromEntries(Object.entries(entries).map(([k, rel]) => [k, join(root, rel)])),
        bundle: true,
        splitting: true,
        platform: "node",
        format: "esm",
        outdir: dir,
        // Every `@webarkit/*` import in the bundled sources is `import type`, as in the probe.
        external: ["@webarkit/*"],
        logLevel: "silent",
        // The modules locate their fixtures and the target by `import.meta.url`, pinned per file.
        plugins: [
            {
                name: "pin-import-meta-url",
                setup(b) {
                    b.onLoad({ filter: /\.ts$/ }, (args) => ({
                        contents: readFileSync(args.path, "utf8").replaceAll(
                            "import.meta.url",
                            JSON.stringify(pathToFileURL(args.path).href),
                        ),
                        loader: "ts",
                    }));
                },
            },
        ],
    });
    const mods = {};
    for (const k of Object.keys(entries)) mods[k] = await import(pathToFileURL(join(dir, `${k}.js`)).href);
    return mods;
}

async function main() {
    // ---- Step 0 ------------------------------------------------------------------------------
    const at = process.argv.indexOf("--base");
    const BASE = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : null;
    if (BASE === null) fatal("--base <a built checkout of the registration's merge commit> is required (C0)");
    if (!existsSync(join(BASE, "packages/cv-backend-jsfeatnext/dist/index.js"))) fatal("--base is not built: its cv-backend-jsfeatnext/dist/index.js is missing");
    const baseHead = git(BASE, "rev-parse", "HEAD");
    if (baseHead !== git(ROOT, "rev-parse", `${REGISTRATION_MERGE}^{commit}`)) fatal(`--base is at ${baseHead}, not the registration's merge commit ${REGISTRATION_MERGE}`);
    if (git(ROOT, "status", "--porcelain", "--", "packages", "examples/targets", "node_modules") !== "") fatal("packages/ or the target differ from the commit: the implementation is read from a clean tree");
    say("# #106 Stage 3 check: the registered criteria run against the implementation");
    say();
    say("## Step 0: what is read");
    for (const rel of READ) say(`${sha256(readFileSync(join(ROOT, rel)))}  ${rel}`);
    say(
        VERSIONS.map((rel) => {
            const p = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
            return `${p.name} ${p.version}`;
        }).join("; "),
    );
    say(`The implementation: packages/ at tree ${git(ROOT, "rev-parse", "HEAD:packages")}, clean. C0's base: ${baseHead}. Node ${process.version}.`);
    say();

    // ---- Load the modules: bundled from their TypeScript sources, imported from a temp dir --
    const tmp = mkdtempSync(join(tmpdir(), "check106-"));
    let tip;
    let base;
    let backend;
    let baseBackend;
    try {
        tip = await bundle(
            ROOT,
            {
                tracker_sequences: "packages/nft-tracker/ground-truth/tracker_sequences.ts",
                seeded_rng: "packages/nft-tracker/ground-truth/fixtures/seeded_rng.ts",
                pose_metric: "packages/nft-tracker/test/pose/pose_metric.ts",
                tracker: "packages/nft-tracker/src/tracker.ts",
                pose_filter: "packages/nft-tracker/src/pose/pose_filter.ts",
            },
            join(tmp, "tip"),
        );
        base = await bundle(BASE, { tracker_sequences: "packages/nft-tracker/ground-truth/tracker_sequences.ts" }, join(tmp, "base"));
        backend = await import(pathToFileURL(join(ROOT, "packages/cv-backend-jsfeatnext/dist/index.js")).href);
        baseBackend = await import(pathToFileURL(join(BASE, "packages/cv-backend-jsfeatnext/dist/index.js")).href);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    const seq = tip.tracker_sequences;
    const { run, shippedTarget, wander, leaveAndReturn, velocityStep, SHIPPED_VELOCITIES, SEED, CAMERA, image, frameAt } = seq;
    const { restPath, settlePath, REST_FRAMES: REG_REST_FRAMES, SETTLE_SLIDE_FRAMES: REG_SLIDE, SETTLE_REST_FRAMES: REG_SETTLE_REST } = seq;
    const { withSeededRandom } = tip.seeded_rng;
    const { grid, poseError, poseDistance } = tip.pose_metric;
    const { NftTracker } = tip.tracker;
    const { PoseFilter } = tip.pose_filter;
    const cv = await backend.createJsfeatNextBackend();
    const K = backend.intrinsics(CAMERA.width, CAMERA.height);
    const G = grid(image.width, image.height);
    const target = shippedTarget();
    const baseCv = await baseBackend.createJsfeatNextBackend();
    const baseK = baseBackend.intrinsics(CAMERA.width, CAMERA.height);
    const baseTarget = base.tracker_sequences.shippedTarget();

    // ---- The DEFAULT_ constants: the derived values, or a stop before anything is printed ---
    {
        const t = tip.tracker;
        const got = {
            rotationMinCutOff: t.DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
            rotationBeta: t.DEFAULT_POSE_FILTER_ROTATION_BETA,
            translationMinCutOff: t.DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
            translationBeta: t.DEFAULT_POSE_FILTER_TRANSLATION_BETA,
            dCutOff: t.DEFAULT_POSE_FILTER_D_CUTOFF,
        };
        for (const k of Object.keys(DERIVED)) if (!Object.is(got[k], DERIVED[k])) fatal(`DEFAULT_ constants: ${k} is ${got[k]}, not the derived ${DERIVED[k]}`);
        if (!(t.DEFAULT_POSE_FILTER?.mode === "off" && Object.isFrozen(t.DEFAULT_POSE_FILTER))) fatal("DEFAULT_POSE_FILTER is not a frozen { mode: \"off\" }");
    }
    if (REG_REST_FRAMES !== REST_FRAMES || REG_SLIDE !== SETTLE_SLIDE_FRAMES || REG_SETTLE_REST !== SETTLE_REST_FRAMES) fatal("the registered paths' lengths are not the probe's");
    say(`The sequences' seed: SEED = ${SEED} (withSeededRandom, one generator around each run's loop); K = intrinsics(${CAMERA.width}, ${CAMERA.height}); G = ${G.length / 2} points over ${image.width} × ${image.height}.`);
    say();

    // ---- The probe's rest and settle paths, as the probe defined them -------------------------
    const rest = () => ({ scale: 0.45, angle: 0, shift: [0, 0] });
    // leaveAndReturn's return slide (its `smoothstep`, frames 56 to 95), then at rest.
    const smoothstep = (t) => {
        const u = Math.min(1, Math.max(0, t));
        return u * u * (3 - 2 * u);
    };
    const settle = (i) => ({
        scale: 0.45,
        angle: 0,
        shift: [i < SETTLE_SLIDE_FRAMES ? 260 * (1 - smoothstep(i / SETTLE_SLIDE_FRAMES)) : 0, 0],
    });

    // ---- The nine registered sequences and paths ---------------------------------------------
    const b = base.tracker_sequences;
    const NINE = [
        { name: "rest", path: restPath, probePath: rest, basePath: rest, n: REST_FRAMES },
        { name: "settle", path: settlePath, probePath: settle, basePath: settle, n: SETTLE_SLIDE_FRAMES + SETTLE_REST_FRAMES },
        { name: "wander", path: wander, basePath: b.wander, n: 40 },
        { name: "leaveAndReturn", path: leaveAndReturn, basePath: b.leaveAndReturn, n: 106 },
        ...SHIPPED_VELOCITIES.map((v) => ({ name: `velocityStep(${v})`, path: velocityStep(v), basePath: b.velocityStep(v), n: 15, v })),
    ];
    const byName = (name) => NINE.find((s) => s.name === name);

    // The registered paths against the probe's, frame by frame, before any criterion: a SHA-256
    // over every frame's width, height and bytes and its truth H, both through this commit's frameAt.
    const pathDigest = (path, n) => {
        const h = createHash("sha256");
        for (let i = 0; i < n; i++) {
            const { frame, H } = frameAt(path(i), i);
            h.update(`${frame.width},${frame.height};`);
            h.update(Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
            h.update(`${Array.from(H, (x) => x.toString()).join(",")}\n`);
        }
        return h.digest("hex");
    };
    const pathLines = [];
    for (const s of NINE.filter((x) => x.probePath)) {
        const reg = pathDigest(s.path, s.n);
        const probe = pathDigest(s.probePath, s.n);
        if (reg !== probe) fatal(`registered paths: ${s.name}'s digest ${reg} is not the probe's ${probe}`);
        pathLines.push(`${s.name} (${s.n} frames): registered ${reg}, the probe's ${probe}, equal`);
    }
    {
        const moved = (i) => (i === 30 ? { ...rest(i), shift: [1, 0] } : rest(i));
        const d = pathDigest(moved, REST_FRAMES);
        if (d === pathDigest(rest, REST_FRAMES)) fatal("registered paths: the rest path with frame 30 moved by 1 px gives the same digest; the check cannot fire");
        pathLines.push(`the probe's rest path with frame 30's shift moved by 1 px: ${d}, differs — must fire: fired`);
    }

    // ---- The runs ------------------------------------------------------------------------------
    const JOINT = [...settings()];
    const oneEuro = (p) => ({
        poseFilter: {
            mode: "one-euro",
            rotation: { minCutOff: p.minCutOffR, beta: p.betaR },
            translation: { minCutOff: p.minCutOffT, beta: p.betaT },
            dCutOff: D_CUTOFF,
        },
    });
    const DERIVED_OPTIONS = { poseFilter: { mode: "one-euro" } };
    /** The derived pair as the copy's `filterPoses` reads a setting (its `D_CUTOFF` is 1 Hz, the derived dCutOff). */
    const D = { minCutOffR: DERIVED.rotationMinCutOff, betaR: DERIVED.rotationBeta, minCutOffT: DERIVED.translationMinCutOff, betaT: DERIVED.translationBeta };
    if (D_CUTOFF !== DERIVED.dCutOff) fatal("the copy's D_CUTOFF is not the derived dCutOff");
    /** A setting as the module's layers: a `null` minCutOff is a layer passing through (ruling C, the module only). */
    const layersOf = (p) => ({
        rotation: p.minCutOffR === null ? null : { minCutOff: p.minCutOffR, beta: p.betaR },
        translation: p.minCutOffT === null ? null : { minCutOff: p.minCutOffT, beta: p.betaT },
        dCutOff: D_CUTOFF,
    });
    /** What the probe filtered: each result with its unfiltered pose (ruling B). */
    const inputOf = (results) => results.map((r) => (r.ok ? { ...r, pose: r.poseSelection.pose } : r));
    const tsOf = (results) => results.map((r) => r.timestampMs);
    for (const s of NINE) {
        const a = run(cv, K, target, s.path, s.n);
        s.absent = a.results;
        s.truths = a.truths;
        s.states = a.states;
        s.off = run(cv, K, target, s.path, s.n, { poseFilter: { mode: "off" } }).results;
        s.base = b.run(baseCv, baseK, baseTarget, s.basePath, s.n).results;
        s.joint = JOINT.map((p) => run(cv, K, target, s.path, s.n, oneEuro(p)).results);
        s.derived = run(cv, K, target, s.path, s.n, DERIVED_OPTIONS).results;
        s.ts = tsOf(s.absent);
        s.input = inputOf(s.absent);
        s.poses = Array.from({ length: s.n }, (_, i) => s.path(i));
        s.atRest = s.poses.map((p, i) => i > 0 && samePath(p, s.poses[i - 1]));
        s.e = s.absent.map((r, i) => (r.ok ? poseError(K, r.poseSelection.pose, s.truths[i], G) : null));
    }
    const wan = byName("wander");
    const lar = byName("leaveAndReturn");
    const rst = byName("rest");
    const stl = byName("settle");

    /** `run`'s loop, repeated for timestamps other than `i * 33`: one seeded generator around the whole loop. */
    const loop = (path, n, timestamps, options) => {
        const tracker = new NftTracker(cv, target, K, options);
        return withSeededRandom(SEED, () => Array.from({ length: n }, (_, i) => tracker.process(frameAt(path(i), i).frame, timestamps[i]))).value;
    };

    /** Every differing leaf between two values, recursively: same keys at every level, arrays element by element, leaves by Object.is. */
    function diffLeaves(a, b, path = "", out = []) {
        if (out.length >= 20) return out;
        const ta = Object.prototype.toString.call(a);
        const tb = Object.prototype.toString.call(b);
        if (ta !== tb) {
            out.push(`${path}: ${ta} / ${tb}`);
        } else if (Array.isArray(a) || ArrayBuffer.isView(a)) {
            if (a.length !== b.length) out.push(`${path}.length: ${a.length} / ${b.length}`);
            else for (let i = 0; i < a.length; i++) diffLeaves(a[i], b[i], `${path}[${i}]`, out);
        } else if (a !== null && typeof a === "object") {
            const ka = Object.keys(a).sort();
            const kb = Object.keys(b).sort();
            if (ka.join() !== kb.join()) out.push(`${path}: keys {${ka}} / {${kb}}`);
            else for (const k of ka) diffLeaves(a[k], b[k], `${path}.${k}`, out);
        } else if (!Object.is(a, b)) {
            out.push(`${path}: ${String(a)} / ${String(b)}`);
        }
        return out;
    }
    const compareRuns = (xs, ys) => {
        if (xs.length !== ys.length) return [`length ${xs.length} / ${ys.length}`];
        const out = [];
        xs.forEach((x, i) => diffLeaves(x, ys[i], `[${i}]`, out));
        return out;
    };
    /** Frames whose `pose` is not their `poseSelection.pose` object. */
    const notIdentical = (results) => results.map((r, i) => (r.ok && r.pose !== r.poseSelection.pose ? i : -1)).filter((i) => i >= 0);
    const maxAbs = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
    /** Largest |difference| per component kind between two pose streams, and where; a presence mismatch is reported. */
    const comparePoses = (xs, ys) => {
        let r = 0;
        let t = 0;
        let rAt = -1;
        let tAt = -1;
        const presence = [];
        for (let i = 0; i < xs.length; i++) {
            const x = xs[i];
            const y = ys[i];
            if ((x === null) !== (y === null)) presence.push(i);
            if (x === null || y === null) continue;
            const dr = maxAbs(x.R, y.R);
            const dt = maxAbs(x.t, y.t);
            if (dr > r) [r, rAt] = [dr, i];
            if (dt > t) [t, tAt] = [dt, i];
        }
        return { r, t, rAt, tAt, presence };
    };
    const posesOf = (results) => results.map((r) => (r.ok ? r.pose : null));
    const copyPoses = (results, ts, p, variant) => filterPoses(inputOf(results), ts, p, variant).frames.map((f) => f.pose);
    const modulePoses = (input, layers) => {
        const f = new PoseFilter(layers);
        return input.map((r) => f.apply(r));
    };
    const exp2 = (x) => x.toExponential(2);
    const layerText = (mc, beta) => (mc === null ? "off" : `(${mc} Hz, beta ${beta})`);
    const settingText = (p) => `rotation ${layerText(p.minCutOffR, p.betaR)}, translation ${layerText(p.minCutOffT, p.betaT)}`;
    /** The largest differences of a pose comparison, with the frame where each occurs when it is not 0. */
    const cmpText = (c) => `largest |ΔR| ${exp2(c.r)}${c.r > 0 ? ` (frame ${c.rAt})` : ""}, |Δt| ${exp2(c.t)}${c.t > 0 ? ` (frame ${c.tAt})` : ""}`;

    // ---- C0, off is off ------------------------------------------------------------------------
    const c0 = [];
    {
        // Both ways first: the comparator reports a changed leaf; the identity check a copied pose.
        const r0 = wan.base.find((r) => r.ok && r.state === "TRACK");
        const c1 = structuredClone(r0);
        c1.pose.t[0] += 1;
        const c2 = structuredClone(r0);
        c2.poseSelection.margin += 1;
        const d1 = diffLeaves(r0, c1);
        const d2 = diffLeaves(r0, c2);
        if (!d1.some((x) => x.startsWith(".pose.t[0]:"))) fatal(`C0: the comparator did not report a changed pose.t[0] (${d1})`);
        if (!(d2.length === 1 && d2[0].startsWith(".poseSelection.margin:"))) fatal(`C0: the comparator did not report a changed margin (${d2})`);
        const copied = { ...r0, pose: copyPose(r0.poseSelection.pose) };
        if (notIdentical([copied]).length !== 1) fatal("C0: the identity check passed a pose copied from poseSelection.pose; it cannot fire");
        c0.push(`both ways: a base result with pose.t[0] changed — reported (${d1.join("; ")}); with poseSelection.margin changed — reported (${d2[0]}); a pose copied from poseSelection.pose — reported by the identity check: all must fire, fired`);
        let compared = 0;
        let identical = 0;
        for (const s of NINE) {
            for (const [arm, results] of [
                ["absent", s.absent],
                ["off", s.off],
            ]) {
                const d = compareRuns(results, s.base);
                if (d.length > 0) fatal(`C0: ${s.name}, poseFilter ${arm}: differs from ${REGISTRATION_MERGE}: ${d.join("; ")}`);
                const ni = notIdentical(results);
                if (ni.length > 0) fatal(`C0: ${s.name}, poseFilter ${arm}: pose is not poseSelection.pose on frames ${ni}`);
                compared += results.length;
                identical += results.filter((r) => r.ok).length;
            }
            c0.push(`${s.name}: ${s.n} results per arm, absent and { mode: "off" }, each equal to ${REGISTRATION_MERGE}'s in every field — no difference`);
        }
        c0.push(`in all: ${compared} results compared, no field differs; pose is poseSelection.pose on all ${identical} posed results of both arms`);
    }

    // ---- C1, the output is always a rotation ----------------------------------------------------
    const c1 = [];
    {
        const defects = (resultsList) => {
            let o = 0;
            let d = 0;
            let n = 0;
            for (const results of resultsList) {
                for (const r of results) {
                    if (!r.ok) continue;
                    n++;
                    o = Math.max(o, orthoDefect(r.pose.R));
                    d = Math.max(d, Math.abs(det3(r.pose.R) - 1));
                }
            }
            return { o, d, n };
        };
        const joint = defects(NINE.flatMap((s) => s.joint));
        const derived = defects(NINE.map((s) => s.derived));
        for (const [name, x] of [
            ["the joint grid", joint],
            ["the derived pair", derived],
        ]) {
            if (!(x.o <= ROTATION_TOL && x.d <= ROTATION_TOL)) fatal(`C1: ${name}: ‖R̂ᵀR̂ − I‖ ${x.o}, |det − 1| ${x.d}`);
        }
        let bo = 0;
        let bd = 0;
        for (const p of copyPoses(wan.absent, wan.ts, ONE_SETTING, "elementwise")) {
            if (p === null) continue;
            bo = Math.max(bo, orthoDefect(p.R));
            bd = Math.max(bd, Math.abs(det3(p.R) - 1));
        }
        if (!(bo > ROTATION_TOL || bd > ROTATION_TOL)) fatal(`C1: the elementwise variant stayed within tolerance (${bo}, ${bd}); the check cannot fire`);
        c1.push(`the joint grid's twelve settings on the nine: ${joint.n} poses, largest ‖R̂ᵀR̂ − I‖_F ${exp2(joint.o)}, largest |det R̂ − 1| ${exp2(joint.d)} (bound ${ROTATION_TOL})`);
        c1.push(`the derived pair on the nine: ${derived.n} poses, largest ‖R̂ᵀR̂ − I‖_F ${exp2(derived.o)}, largest |det R̂ − 1| ${exp2(derived.d)}`);
        c1.push(`both ways: the copy's "elementwise" variant on wander at ONE_SETTING: ${exp2(bo)}, ${exp2(bd)} — must exceed the bound: exceeded`);
    }

    // ---- C2, it forgets on loss -------------------------------------------------------------------
    const c2 = [];
    /** The reset rule as ruled, computed from the results themselves: which frames pass through, and the causes. */
    const passFlags = (results, ts) => {
        let tLast = -Infinity;
        let seeded = false;
        const causes = { notTrack: 0, notGood: 0, nonIncreasing: 0 };
        const pass = results.map((r, k) => {
            let cause = null;
            if (!(r.ok && r.pose !== null && r.state === "TRACK")) cause = "notTrack";
            else if (!r.poseSelection.pose.good) cause = "notGood";
            else if (!(ts[k] > tLast)) cause = "nonIncreasing";
            tLast = ts[k];
            if (cause !== null) {
                causes[cause]++;
                seeded = false;
                return true;
            }
            if (!seeded) {
                seeded = true;
                return true;
            }
            return false;
        });
        return { pass, causes };
    };
    {
        const firstPosedAfterLoss = lar.absent.findIndex((r, i) => i > 0 && r.ok && !lar.absent[i - 1].ok);
        const firstTrackAfterLoss = lar.absent.findIndex((r, i) => i > firstPosedAfterLoss && r.state === "TRACK");
        if (firstPosedAfterLoss !== 67 || firstTrackAfterLoss !== 93) fatal(`C2: leaveAndReturn's first posed frame after the loss is ${firstPosedAfterLoss} and its first TRACK after it ${firstTrackAfterLoss}, not the registration's 67 and 93`);
        for (const i of [67, 93]) {
            const r = lar.derived[i];
            if (!(r.pose === r.poseSelection.pose && samePose(r.pose, lar.absent[i].pose))) fatal(`C2: leaveAndReturn frame ${i}'s pose is not its poseSelection.pose`);
        }
        const bad = copyPoses(lar.absent, lar.ts, ONE_SETTING, "no-reset");
        if (samePose(bad[67], lar.absent[67].pose)) fatal("C2: the no-reset variant equals the unfiltered pose at frame 67; the check cannot fire");
        c2.push(`leaveAndReturn, the derived pair: frame 67 (${lar.absent[67].state}, the first posed after the loss) and frame 93 (the first TRACK after it): pose is poseSelection.pose, the same object`);
        c2.push(`both ways: the copy's "no-reset" variant at ONE_SETTING, frame 67: ${fix(poseDistance(K, bad[67], lar.absent[67].pose, G), 2)} px from the unfiltered pose — must differ: differs`);
        const total = { notTrack: 0, notGood: 0, nonIncreasing: 0 };
        let passed = 0;
        for (const s of NINE) {
            const { pass, causes } = passFlags(s.derived, s.ts);
            const frames = pass.map((x, i) => (x && s.derived[i].ok ? i : -1)).filter((i) => i >= 0);
            for (const i of frames) if (s.derived[i].pose !== s.derived[i].poseSelection.pose) fatal(`C2: ${s.name} frame ${i} passes through, but its pose is not its poseSelection.pose`);
            for (const k of Object.keys(total)) total[k] += causes[k];
            passed += frames.length;
            c2.push(`${s.name}: posed frames passing through, pose === poseSelection.pose on each: ${frames.join(", ")}; resets: not TRACK ${causes.notTrack}, pose.good false ${causes.notGood}, timestamp not increasing ${causes.nonIncreasing}`);
        }
        c2.push(`in all: ${passed} posed pass-through frames, each identical; resets by cause: not TRACK ${total.notTrack}, pose.good false ${total.notGood}, timestamp not increasing ${total.nonIncreasing}, ${total.notTrack + total.notGood + total.nonIncreasing} in all`);
    }
    {
        // The repeated loop reproduces run's results at i·33, field for field, before any is read.
        const i33 = wan.ts;
        for (const [arm, options, results] of [
            ["absent", undefined, wan.absent],
            ["the derived pair", DERIVED_OPTIONS, wan.derived],
        ]) {
            const d = compareRuns(loop(wander, 40, i33, options), results);
            if (d.length > 0) fatal(`C2: the repeated loop at i·33 (${arm}) differs from run: ${d.join("; ")}`);
        }
        c2.push("run's loop, repeated at i·33 on wander, absent and at the derived pair: every field equal to run's — checked before the timestamp runs are read");
        if (wan.absent[0].state !== "DETECT" || wan.absent[1].state !== "TRACK") fatal("C2: wander does not begin D, T");
        for (const [name, t1] of [
            ["repeated", wan.ts[0]],
            ["reversed", wan.ts[0] - 33],
        ]) {
            const ts = wan.ts.map((t, i) => (i === 1 ? t1 : t));
            const res = loop(wander, 40, ts, DERIVED_OPTIONS);
            for (const i of [1, 2]) if (res[i].pose !== res[i].poseSelection.pose) fatal(`C2: the ${name} timestamp run: frame ${i}'s pose is not its poseSelection.pose`);
            const cmp = comparePoses(posesOf(res), copyPoses(res, ts, D));
            if (cmp.presence.length > 0 || !(cmp.r <= ROTATION_TOL && cmp.t <= ROTATION_TOL)) fatal(`C2: the ${name} timestamp run differs from the copy: R ${cmp.r}, t ${cmp.t}, presence ${cmp.presence}`);
            const forget = copyPoses(res, ts, D, "forget-time");
            if (samePose(forget[2], res[2].poseSelection.pose)) fatal(`C2: the ${name} timestamp run: the "forget-time" variant passes frame 2 through; the check cannot fire`);
            const strip = (rs) => rs.map(({ timestampMs, pose, ...fields }) => fields);
            const others = compareRuns(strip(res), strip(wan.derived));
            c2.push(`wander with a ${name} timestamp on frame 1 (${t1} ms): frames 1 and 2, pose === poseSelection.pose; against the copy on the same stream, ${cmpText(cmp)}; the "forget-time" variant's frame 2 is ${fix(poseDistance(K, forget[2], res[2].poseSelection.pose, G), 4)} px from the unfiltered pose — must differ: differs; fields other than timestampMs and pose against the run at i·33: ${others.length === 0 ? "equal" : others.join("; ")}`);
        }
    }
    {
        if (wan.absent[20].state !== "TRACK" || wan.absent[21].state !== "TRACK" || wan.absent[19].state !== "TRACK") fatal("C2: wander's frames 19 to 21 are not TRACK");
        const layers = layersOf(D);
        const stream = wan.input.map((r, i) => (i === 20 ? { ...r, pose: { ...r.pose, good: false } } : r));
        const out = modulePoses(stream, layers);
        for (const i of [20, 21]) if (out[i] !== stream[i].pose) fatal(`C2: the pose.good stream: frame ${i} did not pass through`);
        const cmp = comparePoses(out, filterPoses(stream, wan.ts, D).frames.map((f) => f.pose));
        if (cmp.presence.length > 0 || !(cmp.r <= ROTATION_TOL && cmp.t <= ROTATION_TOL)) fatal(`C2: the pose.good stream differs from the copy: R ${cmp.r}, t ${cmp.t}`);
        const plain = modulePoses(wan.input, layers);
        for (const i of [20, 21]) if (plain[i] === wan.input[i].pose || samePose(plain[i], wan.input[i].pose)) fatal(`C2: the unchanged stream passes frame ${i} through; the check cannot fire`);
        c2.push(`wander's results through the module with frame 20's pose.good false: frames 20 and 21 pass through, output === input; against the copy, ${cmpText(cmp)}; both ways: the unchanged stream filters frames 20 and 21 (${fix(poseDistance(K, plain[20], wan.input[20].pose, G), 4)} and ${fix(poseDistance(K, plain[21], wan.input[21].pose, G), 4)} px from their input) — must differ: differs`);
    }

    // ---- C3, deterministic for a given clock ------------------------------------------------------
    const c3 = [];
    {
        const digestOf = (results) => posesDigest(results.map((r) => ({ pose: r.ok ? r.pose : null })));
        const a = digestOf(wan.derived);
        const again = digestOf(run(cv, K, target, wander, 40, DERIVED_OPTIONS).results);
        const halved = digestOf(loop(wander, 40, wan.ts.map((t) => t / 2), DERIVED_OPTIONS));
        let stubbed;
        try {
            stubbed = withoutClocks(() => digestOf(run(cv, K, target, wander, 40, DERIVED_OPTIONS).results));
        } catch (e) {
            fatal(`C3: the tracker with the filter on read a clock (${e.message})`);
        }
        if (a !== again) fatal("C3: two runs on i·33 differ");
        if (a === halved) fatal("C3: the run on i·16.5 gives the same digest");
        if (stubbed !== a) fatal("C3: the digest changed under the clock stubs");
        const k1 = posesDigest(filterPoses(wan.input, wan.ts, ONE_SETTING, "clock").frames);
        const k2 = posesDigest(filterPoses(wan.input, wan.ts, ONE_SETTING, "clock").frames);
        if (k1 === k2) fatal("C3: the copy's clock variant reproduced; the check cannot fire");
        let threw = false;
        try {
            withoutClocks(() => filterPoses(wan.input, wan.ts, ONE_SETTING, "clock"));
        } catch {
            threw = true;
        }
        if (!threw) fatal("C3: the copy's clock variant did not throw under the stubs; the check cannot fire");
        c3.push(`wander at the derived pair through NftTracker: two runs on i·33, digests equal (${a}) — must not fire: did not`);
        c3.push(`on i·16.5 (run's loop repeated), the digest differs (${halved}) — must fire: fired`);
        c3.push("with performance.now and Date.now replaced by throwing stubs from the tracker's construction to its last process call: no throw, the first run's digest — must not fire: did not");
        c3.push("both ways: the copy's \"clock\" variant, two runs, two digests (not printed: they would make this stdout differ between runs) — must fire: fired; under the stubs it throws — must fire: fired");
    }

    // ---- C4, fidelity to the probe ------------------------------------------------------------------
    const c4 = [];
    {
        const worst = () => ({ r: 0, t: 0, rWhere: "", tWhere: "" });
        const fold = (w, cmp, where) => {
            if (cmp.presence.length > 0) fatal(`C4: ${where}: a pose present in one stream only, frames ${cmp.presence}`);
            if (cmp.r > w.r) [w.r, w.rWhere] = [cmp.r, `${where}, frame ${cmp.rAt}`];
            if (cmp.t > w.t) [w.t, w.tWhere] = [cmp.t, `${where}, frame ${cmp.tAt}`];
        };
        const text = (w) => `largest |ΔR| ${exp2(w.r)}${w.r > 0 ? ` (${w.rWhere})` : ""}, largest |Δt| ${exp2(w.t)}${w.t > 0 ? ` (${w.tWhere})` : ""}`;
        const within = (w, part) => {
            if (!(w.r <= ROTATION_TOL && w.t <= ROTATION_TOL)) fatal(`C4 (${part}): beyond 1e-9: ${text(w)}`);
        };
        // (a) The joint grid, through the tracker.
        const wa = worst();
        const self = worst();
        JOINT.forEach((p, j) => {
            for (const s of NINE) {
                const res = s.joint[j];
                const copy = copyPoses(res, tsOf(res), p);
                fold(wa, comparePoses(posesOf(res), copy), `${settingText(p)} on ${s.name}`);
                fold(self, comparePoses(copy, copyPoses(res, tsOf(res), p)), "self");
            }
        });
        within(wa, "a");
        if (self.r !== 0 || self.t !== 0) fatal("C4 (a): the copy against itself is not 0");
        // (b) The per-layer sweeps, through the module.
        const T_SWEEP = MIN_CUTOFFS.flatMap((mc) => BETAS_T.map((bt) => ({ minCutOffR: null, betaR: null, minCutOffT: mc, betaT: bt })));
        const R_SWEEP = MIN_CUTOFFS.flatMap((mc) => BETAS_ROT.map((br) => ({ minCutOffR: mc, betaR: br, minCutOffT: null, betaT: null })));
        const wb = { translation: worst(), rotation: worst() };
        const selfB = worst();
        for (const [layer, sweep] of [
            ["translation", T_SWEEP],
            ["rotation", R_SWEEP],
        ]) {
            for (const p of sweep) {
                for (const s of NINE) {
                    const copy = filterPoses(s.input, s.ts, p).frames.map((f) => f.pose);
                    fold(wb[layer], comparePoses(modulePoses(s.input, layersOf(p)), copy), `${settingText(p)} on ${s.name}`);
                    fold(selfB, comparePoses(copy, filterPoses(s.input, s.ts, p).frames.map((f) => f.pose)), "self");
                }
            }
            within(wb[layer], `b, ${layer}`);
        }
        if (selfB.r !== 0 || selfB.t !== 0) fatal("C4 (b): the copy against itself is not 0");
        // (c) The tracker runs the module and nothing else.
        let framesC = 0;
        let notSame = 0;
        JOINT.forEach((p, j) => {
            for (const s of NINE) {
                const res = s.joint[j];
                const mod = modulePoses(inputOf(res), layersOf(p));
                res.forEach((r, i) => {
                    if ((mod[i] === null) !== !r.ok) fatal(`C4 (c): presence differs, ${s.name} frame ${i}`);
                    if (!r.ok) return;
                    framesC++;
                    if (!samePose(mod[i], r.pose)) notSame++;
                });
            }
        });
        if (notSame !== 0) fatal(`C4 (c): ${notSame} of ${framesC} frames not identical`);
        // Both ways: the copy one beta step away, and (c) at another beta R.
        const at = (mc, br) => JOINT.findIndex((p) => p.minCutOffR === mc && p.betaR === br);
        const j10 = at(1, 10);
        const j100 = at(1, 100);
        const away = worst();
        for (const s of NINE) fold(away, comparePoses(posesOf(s.joint[j10]), copyPoses(s.joint[j10], s.ts, JOINT[j100])), `${settingText(JOINT[j10])} against the copy at ${settingText(JOINT[j100])} on ${s.name}`);
        if (!(away.r > ROTATION_TOL || away.t > ROTATION_TOL)) fatal("C4 (a): the copy one beta step away stays within 1e-9; the check cannot fire");
        const awayB = { translation: worst(), rotation: worst() };
        for (const s of NINE) {
            const tm = { minCutOffR: null, betaR: null, minCutOffT: 1, betaT: 0.01 };
            fold(awayB.translation, comparePoses(modulePoses(s.input, layersOf(tm)), filterPoses(s.input, s.ts, { ...tm, betaT: 0.1 }).frames.map((f) => f.pose)), s.name);
            const rm = { minCutOffR: 1, betaR: 10, minCutOffT: null, betaT: null };
            fold(awayB.rotation, comparePoses(modulePoses(s.input, layersOf(rm)), filterPoses(s.input, s.ts, { ...rm, betaR: 100 }).frames.map((f) => f.pose)), s.name);
        }
        for (const layer of ["translation", "rotation"]) if (!(awayB[layer].r > ROTATION_TOL || awayB[layer].t > ROTATION_TOL)) fatal(`C4 (b): the ${layer} copy one beta step away stays within 1e-9; the check cannot fire`);
        let reportedC = 0;
        for (const s of NINE) {
            const res = s.joint[j10];
            const mod = modulePoses(inputOf(res), layersOf(JOINT[j100]));
            res.forEach((r, i) => {
                if (r.ok && !samePose(mod[i], r.pose)) reportedC++;
            });
        }
        if (reportedC === 0) fatal("C4 (c): the module at another beta R reports no frame; the check cannot fire");
        c4.push(`(a) the joint grid through NftTracker against the copy, twelve settings on the nine: ${text(wa)} (bound 1e-9); the copy against itself: 0`);
        c4.push(`(b) the translation sweep through the module (rotation passing through), twelve settings on the nine: ${text(wb.translation)}`);
        c4.push(`(b) the rotation sweep through the module (translation passing through), twelve settings on the nine: ${text(wb.rotation)}; the copy against itself: 0`);
        c4.push(`(c) the module fed poseSelection.pose against NftTracker's pose, twelve settings on the nine: ${framesC} frames compared, ${notSame} not identical (Object.is on every component)`);
        c4.push(`both ways: (a) NftTracker at ${settingText(JOINT[j10])} against the copy at ${settingText(JOINT[j100])}: ${text(away)} — must exceed: exceeded; (b) the module at translation (1 Hz, beta 0.01) against the copy at (1 Hz, beta 0.1): ${text(awayB.translation)}, at rotation (1 Hz, beta 10) against (1 Hz, beta 100): ${text(awayB.rotation)} — must exceed: exceeded; (c) the module at beta R 100 against NftTracker at 10: ${reportedC} frames reported — must report: reported`);
    }

    // ---- P, the prediction for the derived pair -----------------------------------------------------
    const pLines = [];
    const reading = (margin) => (margin < 0 ? "beyond the bound" : margin < 1e-4 ? "a tie (within the last printed digit)" : "within the bound");
    {
        // P1, steadiness at rest.
        const readable = rst.atRest.map((r, i) => (r && rst.states[i] === "T" && rst.states[i - 1] === "T" ? i : -1)).filter((i) => i >= 0);
        const f = posesOf(rst.derived);
        const u = rst.absent.map((r) => (r.ok ? r.poseSelection.pose : null));
        const dF = median(readable.map((i) => poseDistance(K, f[i], f[i - 1], G)));
        const dU = median(readable.map((i) => poseDistance(K, u[i], u[i - 1], G)));
        const eF = median(readable.map((i) => poseError(K, f[i], rst.truths[i], G)));
        const eU = median(readable.map((i) => poseError(K, u[i], rst.truths[i], G)));
        const ratio = dF / dU;
        const bias = eF - eU;
        const voidP1 = readable.every((i) => samePose(f[i], u[i]) && samePose(f[i - 1], u[i - 1]));
        pLines.push(`P1, steadiness at rest (the rest path, ${readable.length} readable rest pairs): d median filtered ${fix(dF)} px, unfiltered ${fix(dU)}; ratio ${fix(ratio)}, bound 0.25, margin ${fix(0.25 - ratio)}: ${reading(0.25 - ratio)}. e median filtered ${fix(eF)} px, unfiltered ${fix(eU)}; difference ${fix(bias)} px, bound ±0.02, margin ${fix(0.02 - Math.abs(bias))}: ${reading(0.02 - Math.abs(bias))}. Void test (filtered equal to unfiltered on every frame read): ${voidP1 ? "void" : "not void"}`);
        // P2, bounded lag at constant velocity.
        for (const v of [2, 3, 4]) {
            const s = byName(`velocityStep(${v})`);
            if (s.states.slice(STEP_FRAME) !== "T".repeat(15 - STEP_FRAME)) fatal(`P2: velocityStep(${v})'s frames 5 to 14 are not TRACK (${s.states})`);
            const Pu = max(Array.from({ length: 15 - STEP_FRAME }, (_, k) => s.e[STEP_FRAME + k]));
            const B = proposedB(Pu, v);
            const last = poseError(K, s.derived[14].pose, s.truths[14], G);
            const voidP2 = Object.is(last, s.e[14]);
            pLines.push(`P2, v = ${v} px/frame: P_u(v) ${fix(Pu)} px, B(v) ${fix(B)}; e at frame 14 filtered ${fix(last)} (unfiltered ${fix(s.e[14])}); margin ${fix(B - last)}: ${reading(B - last)}. Void test (filtered e equal to unfiltered at frame 14): ${voidP2 ? "void" : "not void"}`);
        }
        // P3, settling on the settle path.
        const idx = stl.absent.map((_, i) => i).filter((i) => i >= SETTLE_SLIDE_FRAMES);
        if (idx.some((i) => stl.states[i] !== "T")) fatal("P3: a rest frame of the settle path is not TRACK");
        const fe = idx.map((i) => poseError(K, stl.derived[i].pose, stl.truths[i], G));
        let lag = 0;
        while (lag < idx.length && fe[lag] > stl.e[idx[lag]]) lag++;
        const crossed = lag < idx.length;
        pLines.push(`P3, settling (the settle path, from frame ${SETTLE_SLIDE_FRAMES}): ${crossed ? `crossing after ${lag} frames, at frame ${SETTLE_SLIDE_FRAMES + lag}` : `no crossing within ${idx.length} frames`}, bound 15, margin ${crossed ? 15 - lag : "none"}: ${crossed ? (lag <= 15 ? "within the bound" : "beyond the bound") : "beyond the bound"}. e at frame ${SETTLE_SLIDE_FRAMES}: filtered ${fix(fe[0])} px, unfiltered ${fix(stl.e[idx[0]])}; at frame ${idx[idx.length - 1]}: filtered ${fix(fe[fe.length - 1])}, unfiltered ${fix(stl.e[idx[idx.length - 1]])}. Void test (a crossing at frame ${SETTLE_SLIDE_FRAMES} itself): ${crossed && lag === 0 ? "void" : "not void"}`);
        // P4, the rotation layer on wander, through the module.
        const wanIdx = wan.absent.map((r, i) => (i > 0 && r.state === "TRACK" ? i : -1)).filter((i) => i >= 0);
        const rot = modulePoses(wan.input, layersOf({ minCutOffR: DERIVED.rotationMinCutOff, betaR: DERIVED.rotationBeta, minCutOffT: null, betaT: null }));
        const eR = median(wanIdx.map((i) => poseError(K, rot[i], wan.truths[i], G)));
        const eW = median(wanIdx.map((i) => wan.e[i]));
        const diff = eR - eW;
        const voidP4 = wanIdx.every((i) => rot[i].R.every((x, k) => Object.is(x, wan.input[i].pose.R[k])));
        pLines.push(`P4, the rotation layer on wander (the module, rotation (1 Hz, beta 10), translation passing through; ${wanIdx.length} TRACK frames): e median filtered ${fix(eR)} px, unfiltered ${fix(eW)}; difference ${fix(diff)}, bound 0.5, margin ${fix(0.5 - diff)}: ${reading(0.5 - diff)}. Void test (rotations equal to the unfiltered on every frame read): ${voidP4 ? "void" : "not void"}`);
    }

    // ---- Output --------------------------------------------------------------------------------------
    say("## Before any criterion: the registered paths against the probe's");
    for (const l of pathLines) say(`- ${l}`);
    say();
    say(`## The nine sequences and paths (unfiltered states)`);
    for (const s of NINE) say(`- ${s.name}: ${s.n} frames, \`${runLength(s.states)}\``);
    say();
    say("## C0, off is off (against the registration's merge commit; npm test and the diff of existing test files are run apart)");
    for (const l of c0) say(`- ${l}`);
    say();
    say("## C1, the output is always a rotation");
    for (const l of c1) say(`- ${l}`);
    say();
    say("## C2, it forgets on loss");
    for (const l of c2) say(`- ${l}`);
    say();
    say("## C3, deterministic for a given clock");
    for (const l of c3) say(`- ${l}`);
    say();
    say("## C4, fidelity to the probe");
    for (const l of c4) say(`- ${l}`);
    say();
    say(`## P, the prediction for the derived pair (the DEFAULT_ constants checked equal to ${Object.values(DERIVED).join(", ")} before any run)`);
    for (const l of pLines) say(`- ${l}`);
    process.stdout.write(out.join("\n") + "\n");
}

function* settings() {
    for (let i = 0; i < MIN_CUTOFFS.length; i++)
        for (let j = 0; j < BETAS_ROT.length; j++)
            yield { minCutOffR: MIN_CUTOFFS[i], betaR: BETAS_ROT[j], minCutOffT: MIN_CUTOFFS[i], betaT: BETAS_T[j] };
}

function runLength(states) {
    let o = "";
    for (let i = 0; i < states.length; ) {
        let j = i;
        while (j < states.length && states[j] === states[i]) j++;
        o += j - i > 1 ? `${states[i]}×${j - i}` : states[i];
        i = j;
    }
    return o;
}
