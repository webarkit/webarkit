/*
 *  2026-10-29-106-stage1-pose-filter-probe.mjs
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
 * #106's Stage 1 probe: One Euro filtering of the pose, the rotation in its
 * tangent space, on the synthetic sequences of `packages/nft-tracker/ground-truth/`.
 * The computation behind docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.md.
 * Not campaign data. No file under packages/<name>/src/ is changed: the filter
 * is a scratch filter below, applied after the tracker to the poses it returned.
 *
 *     npm ci && npm run build
 *     node docs/benchmarks/2026-10-29-106-stage1-pose-filter-probe.mjs
 *
 * Its stdout is deterministic: no clock, no path and no timing is printed, so
 * two runs give the same bytes (the record states their SHA-256).
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The sequences are the ground-truth module's, run unchanged through `run`
 *    (`tracker_sequences.ts`): the shipped target `examples/targets/pinball.wnft`,
 *    `K = intrinsics(270, 360)`, timestamps `i * 33`, RANSAC seeded by
 *    `withSeededRandom(SEED)` with `SEED = 20260925`, a fresh generator per
 *    sequence. `wander` (40 frames), `leaveAndReturn` (106), `velocityStep(v)`
 *    (15 each, v = 2, 3, 4, 5, 6), and one probe path, `rest`: the pose of
 *    `velocityStep`'s rest frames (`scale 0.45, angle 0, shift [0, 0]`) held
 *    for REST_FRAMES frames, rendered by `frameAt` so that each frame has its
 *    own noise, blur and exposure. The TypeScript modules are bundled by esbuild
 *    into a temporary directory and imported from there; nothing is reimplemented.
 *
 * 2. The metric is #105's, imported from `test/pose/pose_metric.ts`:
 *    `poseError(K, pose, H*, G)`, the RMS over the 5 × 5 grid `G` of the target
 *    of the gap between `π(K · (R · x̂ + t))` and `π(H* · x)`, frame px; and
 *    `poseDistance` for the change between two poses on the same grid.
 *
 * 3. The scratch filter has two layers. A vector One Euro core (Casiez, Roussel
 *    and Vogel, CHI 2012) with `minCutOff` (Hz), `beta` (per unit of the
 *    signal's derivative) and `dCutOff` (Hz), taking a step `δ = x − x̂ₖ₋₁`
 *    already computed against the previous filtered value and a period `te`
 *    in seconds: `dx = δ / te`, `dx̂ = ema(α(te, dCutOff), dx, dx̂ₖ₋₁)`,
 *    `cutoff = minCutOff + beta · |dx̂|`, `x̂ₖ = x̂ₖ₋₁ + α(te, cutoff) · δ`,
 *    each component on its own, `α(te, f) = r / (r + 1)` with `r = 2π f te`.
 *    Above it a pose layer: the rotation's step is `ω = log(R̂ₖ₋₁ᵀ Rₖ)` (a
 *    3-vector), the core filters it, `R̂ₖ = R̂ₖ₋₁ · exp(ω̂)`; the translation
 *    is filtered per component with its own `(minCutOff, beta)`. `dCutOff` is
 *    shared. Time is `timestampMs / 1000`.
 *
 * 4. The filter's state is reset by: a result that is not `"TRACK"` with a
 *    pose; a `pose.good` of `false`; a timestamp that does not increase. A
 *    frame that resets passes its pose, if any, through unfiltered. The frame
 *    after a reset initialises the filter with its own pose, unfiltered.
 *
 * 5. Every check runs before any figure is printed and is exercised both ways
 *    on a filter broken for its purpose; a failed check exits with its reason
 *    and prints nothing else.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    "packages/nft-tracker/test/tracking/homography_helpers.ts",
    "packages/nft-tracker/src/tracker.ts",
    "packages/nft-tracker/src/pose/select_pose.ts",
    "packages/nft-tracker/src/pose/closed_form.ts",
    "examples/targets/pinball.wnft",
    "packages/cv-backend-jsfeatnext/dist/index.js",
    "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs",
];
/** The three `src/` files above are the pose path's; the rest of `src/` the bundle pulls in is pinned by the commit alone. */
const VERSIONS = [
    "packages/nft-tracker/package.json",
    "packages/cv-backend-jsfeatnext/package.json",
    "node_modules/@webarkit/jsfeat-next/package.json",
];

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
 * `variant`: `"correct"`; `"elementwise"` (the rotation averaged element by
 * element, no exp: broken for the rotation check); `"no-reset"` (every pose
 * fed, nothing resets: broken for the forgetting check); `"clock"` (the period
 * read from `performance.now()`: broken for the determinism check).
 *
 * Returns per frame `{ pose, reset }`, `pose` null where the result has none,
 * and the reset counts by cause.
 */
function filterPoses(results, timestamps, p, variant = "correct") {
    const coreR = new OneEuroCore(variant === "elementwise" ? 9 : 3, p.minCutOffR, p.betaR, D_CUTOFF);
    const coreT = new OneEuroCore(3, p.minCutOffT, p.betaT, D_CUTOFF);
    let Rhat = null;
    let that = null;
    let tPrev = -Infinity;
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
            } else if (!(t > tPrev)) {
                reset = true;
                causes.nonIncreasing++;
            }
        } else if (!hasPose) {
            frames.push({ pose: null, reset: false });
            continue;
        }
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
            clockPrev = performance.now();
            frames.push({ pose: copyPose(r.pose), reset: false });
            continue;
        }
        let te = (t - tPrev) / 1000;
        if (variant === "clock") {
            const now = performance.now();
            te = Math.max(1e-6, (now - clockPrev) / 1000);
            clockPrev = now;
        }
        if (variant === "elementwise") {
            const delta = new Float64Array(9);
            for (let i = 0; i < 9; i++) delta[i] = r.pose.R[i] - Rhat[i];
            const s = coreR.step(te, delta);
            for (let i = 0; i < 9; i++) Rhat[i] += s[i];
        } else {
            const omega = so3Log(mul3(transpose3(Rhat), r.pose.R));
            Rhat = mul3(Rhat, so3Exp(coreR.step(te, omega)));
        }
        const dt = Float64Array.from([r.pose.t[0] - that[0], r.pose.t[1] - that[1], r.pose.t[2] - that[2]]);
        const st = coreT.step(te, dt);
        for (let i = 0; i < 3; i++) that[i] += st[i];
        tPrev = t;
        frames.push({ pose: { R: Float64Array.from(Rhat), t: Float64Array.from(that), good: true }, reset: false });
    }
    return { frames, causes };
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

async function main() {
    // ---- Step 0 ------------------------------------------------------------------------------
    say("# #106 Stage 1 probe: One Euro filtering of the pose on the synthetic sequences");
    say();
    say("## Step 0: what is read");
    for (const rel of READ) say(`${sha256(readFileSync(join(ROOT, rel)))}  ${rel}`);
    say(
        VERSIONS.map((rel) => {
            const p = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
            return `${p.name} ${p.version}`;
        }).join("; "),
    );
    say();

    // ---- Load the modules: bundled from their TypeScript sources, imported from a temp dir --
    const tmp = mkdtempSync(join(tmpdir(), "probe106-"));
    let seq;
    let pm;
    let cf;
    let backend;
    try {
        await build({
            entryPoints: {
                tracker_sequences: join(ROOT, "packages/nft-tracker/ground-truth/tracker_sequences.ts"),
                pose_metric: join(ROOT, "packages/nft-tracker/test/pose/pose_metric.ts"),
                closed_form: join(ROOT, "packages/nft-tracker/src/pose/closed_form.ts"),
            },
            bundle: true,
            platform: "node",
            format: "esm",
            outdir: tmp,
            // Every `@webarkit/*` import in the bundled sources is `import type`, so the
            // bundle imported from the temp dir never resolves one at run time; a runtime
            // import added to a source later would fail here with a resolution error.
            external: ["@webarkit/*"],
            logLevel: "silent",
            // The modules locate their fixtures and the target by `import.meta.url`; in the
            // bundle that would be the bundle's own URL, so each source file's is pinned.
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
        seq = await import(pathToFileURL(join(tmp, "tracker_sequences.js")).href);
        pm = await import(pathToFileURL(join(tmp, "pose_metric.js")).href);
        cf = await import(pathToFileURL(join(tmp, "closed_form.js")).href);
        backend = await import(pathToFileURL(join(ROOT, "packages/cv-backend-jsfeatnext/dist/index.js")).href);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    const { run, shippedTarget, wander, leaveAndReturn, velocityStep, SHIPPED_VELOCITIES, SEED, CAMERA, image } = seq;
    const { grid, poseError, poseDistance, projectH } = pm;
    const { closedFormPose } = cf;
    const cv = await backend.createJsfeatNextBackend();
    const K = backend.intrinsics(CAMERA.width, CAMERA.height);
    const G = grid(image.width, image.height);
    const target = shippedTarget();
    say(`The sequences' seed: SEED = ${SEED} (withSeededRandom, a fresh generator per run); K = intrinsics(${CAMERA.width}, ${CAMERA.height}); G = ${G.length / 2} points over ${image.width} × ${image.height}.`);
    say();

    // ---- The sequences, unfiltered ----------------------------------------------------------
    const rest = () => ({ scale: 0.45, angle: 0, shift: [0, 0] });
    const SEQS = [
        { name: "rest (probe path)", path: rest, n: REST_FRAMES },
        { name: "wander", path: wander, n: 40 },
        { name: "leaveAndReturn", path: leaveAndReturn, n: 106 },
        ...SHIPPED_VELOCITIES.map((v) => ({ name: `velocityStep(${v})`, path: velocityStep(v), n: 15, v })),
    ];
    for (const s of SEQS) {
        const r = run(cv, K, target, s.path, s.n);
        s.results = r.results;
        s.truths = r.truths;
        s.states = r.states;
        s.timestamps = r.results.map((x) => x.timestampMs);
        s.poses = Array.from({ length: s.n }, (_, i) => s.path(i));
        s.atRest = s.poses.map((p, i) => i > 0 && samePath(p, s.poses[i - 1]));
        // The truth's motion per frame: px on G between consecutive H*, and degrees between
        // the closed form's rotations of consecutive H* (exact for rigid views).
        s.truthPx = s.truths.map((H, i) => (i === 0 ? 0 : rmsH(s.truths[i - 1], H)));
        s.truthDeg = s.truths.map((H, i) => (i === 0 ? 0 : angleDeg(closedFormPose(s.truths[i - 1], K).R, closedFormPose(H, K).R)));
        s.e = s.results.map((r, i) => (r.ok ? poseError(K, r.pose, s.truths[i], G) : null));
    }
    function rmsH(A, B) {
        let acc = 0;
        for (let i = 0; i < G.length; i += 2) {
            const [ax, ay] = projectH(A, G[i], G[i + 1]);
            const [bx, by] = projectH(B, G[i], G[i + 1]);
            acc += (ax - bx) ** 2 + (ay - by) ** 2;
        }
        return Math.sqrt(acc / (G.length / 2));
    }

    // ---- The checks, all before any figure --------------------------------------------------
    const checks = [];
    const lar = SEQS.find((s) => s.name === "leaveAndReturn");
    const wan = SEQS.find((s) => s.name === "wander");
    const rst = SEQS.find((s) => s.name === "rest (probe path)");

    // Responsiveness: the metric moves under the filter at ONE_SETTING.
    {
        let moved = 0;
        let posed = 0;
        for (const s of SEQS) {
            const f = filterPoses(s.results, s.timestamps, ONE_SETTING);
            f.frames.forEach((fr, i) => {
                if (fr.pose === null) return;
                posed++;
                if (poseError(K, fr.pose, s.truths[i], G) !== s.e[i]) moved++;
            });
        }
        if (moved === 0) fatal("responsiveness: the metric did not move on any posed frame; the step stops here");
        checks.push(`responsiveness: poseError changed on ${moved} of ${posed} posed frames at (minCutOff 1 Hz, beta 0) — must fire: fired`);
    }

    // Transcription: the core on a step equals the reference form; a raw-derivative variant does not.
    {
        const xs = rst.results.map((r) => (r.ok ? r.pose.t[2] : null));
        const ts = rst.timestamps.map((t) => t / 1000);
        const diff = (rawDerivative) => {
            const ref = new ReferenceOneEuro(1, 0.01, D_CUTOFF, rawDerivative);
            const core = new OneEuroCore(1, 1, 0.01, D_CUTOFF);
            let xhat = null;
            let tPrev = null;
            let worst = 0;
            let n = 0;
            for (let i = 0; i < xs.length; i++) {
                if (xs[i] === null) continue;
                const a = ref.filter(ts[i], xs[i]);
                if (xhat === null) {
                    xhat = xs[i];
                } else {
                    xhat += core.step(ts[i] - tPrev, Float64Array.from([xs[i] - xhat]))[0];
                }
                tPrev = ts[i];
                worst = Math.max(worst, Math.abs(a - xhat) / Math.max(1, Math.abs(a)));
                n++;
            }
            return { worst, n };
        };
        const ok = diff(false);
        const bad = diff(true);
        if (!(ok.worst <= TRANSCRIPTION_TOL)) fatal(`transcription: the core differs from the reference form by ${ok.worst} relative`);
        if (!(bad.worst > TRANSCRIPTION_TOL)) fatal(`transcription: the raw-derivative variant did not differ (${bad.worst}); the check cannot fire`);
        checks.push(`transcription: core against the reference form on ${ok.n} frames of t[2] at rest, worst relative difference ${ok.worst.toExponential(2)} (≤ ${TRANSCRIPTION_TOL}) — must not fire: did not; derivative against the raw previous value instead: ${bad.worst.toExponential(2)} — must fire: fired`);
    }

    // Property 1: every filtered R is a rotation, over every setting and sequence.
    {
        let worstO = 0;
        let worstD = 0;
        let n = 0;
        for (const p of settings()) {
            for (const s of SEQS) {
                for (const fr of filterPoses(s.results, s.timestamps, p).frames) {
                    if (fr.pose === null) continue;
                    n++;
                    worstO = Math.max(worstO, orthoDefect(fr.pose.R));
                    worstD = Math.max(worstD, Math.abs(det3(fr.pose.R) - 1));
                }
            }
        }
        let brokenO = 0;
        let brokenD = 0;
        for (const fr of filterPoses(wan.results, wan.timestamps, ONE_SETTING, "elementwise").frames) {
            if (fr.pose === null) continue;
            brokenO = Math.max(brokenO, orthoDefect(fr.pose.R));
            brokenD = Math.max(brokenD, Math.abs(det3(fr.pose.R) - 1));
        }
        if (!(worstO <= ROTATION_TOL && worstD <= ROTATION_TOL)) fatal(`rotation: ‖R̂ᵀR̂ − I‖ ${worstO}, |det − 1| ${worstD}`);
        if (!(brokenO > ROTATION_TOL || brokenD > ROTATION_TOL)) fatal(`rotation: element-wise averaging stayed within tolerance (${brokenO}, ${brokenD}); the check cannot fire`);
        checks.push(`rotation: over ${n} filtered poses (every setting, every sequence) largest ‖R̂ᵀR̂ − I‖ ${worstO.toExponential(2)}, largest |det R̂ − 1| ${worstD.toExponential(2)} (tolerance ${ROTATION_TOL}) — must not fire: did not; element-wise averaging of R on wander: ${brokenO.toExponential(2)}, ${brokenD.toExponential(2)} — must fire: fired`);
    }

    // Property 2: it forgets on loss. leaveAndReturn's first posed frame after the loss, and
    // its first TRACK frame, equal the unfiltered pose exactly; a filter that never resets does not.
    {
        const firstPosedAfterLoss = lar.results.findIndex((r, i) => i > 0 && r.ok && !lar.results[i - 1].ok);
        const firstTrackAfterLoss = lar.results.findIndex((r, i) => i > firstPosedAfterLoss && r.state === "TRACK");
        if (firstPosedAfterLoss < 0 || firstTrackAfterLoss < 0) fatal("forgetting: leaveAndReturn has no loss followed by a re-detection");
        const good = filterPoses(lar.results, lar.timestamps, ONE_SETTING).frames;
        const bad = filterPoses(lar.results, lar.timestamps, ONE_SETTING, "no-reset").frames;
        const eq = (frames, i) => samePose(frames[i].pose, lar.results[i].pose);
        if (!(eq(good, firstPosedAfterLoss) && eq(good, firstTrackAfterLoss))) fatal("forgetting: a pose after re-detection differs from the unfiltered one");
        if (eq(bad, firstPosedAfterLoss)) fatal("forgetting: the no-reset filter also equals the unfiltered pose; the check cannot fire");
        const dBad = poseDistance(K, bad[firstPosedAfterLoss].pose, lar.results[firstPosedAfterLoss].pose, G);
        checks.push(`forgetting: leaveAndReturn frame ${firstPosedAfterLoss} (first posed after the loss, state ${lar.results[firstPosedAfterLoss].state}) and frame ${firstTrackAfterLoss} (first TRACK after it) equal the unfiltered pose bit for bit — must not fire: did not; the no-reset filter's frame ${firstPosedAfterLoss} is ${fix(dBad, 2)} px from it — must fire: fired`);
    }

    // Property 3: deterministic for a given clock; a changed spacing changes the output; a
    // filter reading performance.now() is not reproducible.
    {
        const a = posesDigest(filterPoses(wan.results, wan.timestamps, ONE_SETTING).frames);
        const b = posesDigest(filterPoses(wan.results, wan.timestamps, ONE_SETTING).frames);
        const spaced = posesDigest(filterPoses(wan.results, wan.timestamps.map((t) => t / 2), ONE_SETTING).frames);
        const c1 = posesDigest(filterPoses(wan.results, wan.timestamps, ONE_SETTING, "clock").frames);
        const c2 = posesDigest(filterPoses(wan.results, wan.timestamps, ONE_SETTING, "clock").frames);
        if (a !== b) fatal("determinism: two runs on the same timestamps differ");
        if (a === spaced) fatal("determinism: halving the timestamps' spacing left the output unchanged; the clock is not read");
        if (c1 === c2) fatal("determinism: the performance.now() variant reproduced; the check cannot fire");
        checks.push(`determinism: wander twice on i·33 ms, digests equal (${a.slice(0, 12)}) — must not fire: did not; on i·16.5 ms the digest differs (${spaced.slice(0, 12)}) — must fire: fired; the period from performance.now(), two runs differ (their digests are not printed: they would make this stdout differ between runs) — must fire: fired`);
    }

    say("## The checks, each exercised both ways (all passed; a failure exits before any figure)");
    for (const c of checks) say(`- ${c}`);
    say();

    // ---- Expressibility, unfiltered ---------------------------------------------------------
    say("## Expressibility, on the unfiltered tracker");
    say();
    say("### The sequences, their states, and what resets the filter (rule 4 of the method)");
    say();
    say("| sequence | frames | states | posed | TRACK | resets: not TRACK | pose.good false | timestamp not increasing |");
    say("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of SEQS) {
        const f = filterPoses(s.results, s.timestamps, ONE_SETTING);
        const posed = s.results.filter((r) => r.ok).length;
        const track = s.results.filter((r) => r.state === "TRACK").length;
        say(`| ${s.name} | ${s.n} | \`${runLength(s.states)}\` | ${posed} | ${track} | ${f.causes.notTrack} | ${f.causes.notGood} | ${f.causes.nonIncreasing} |`);
    }
    say();
    say("### Noise at rest: frames where the truth did not move since the previous frame, both frames TRACK with a pose");
    say();
    say("| sequence | rest frames (truth) | readable (TRACK pairs) | e median px | e max px | d median px | d max px | R step median ° | R step max ° |");
    say("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of SEQS) {
        const restIdx = s.atRest.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
        const readable = restIdx.filter((i) => s.results[i].state === "TRACK" && s.results[i - 1].state === "TRACK");
        const e = readable.map((i) => s.e[i]);
        const d = readable.map((i) => poseDistance(K, s.results[i].pose, s.results[i - 1].pose, G));
        const a = readable.map((i) => angleDeg(s.results[i - 1].pose.R, s.results[i].pose.R));
        say(`| ${s.name} | ${restIdx.length} | ${readable.length} | ${fix(median(e))} | ${fix(max(e))} | ${fix(median(d))} | ${fix(max(d))} | ${fix(median(a))} | ${fix(max(a))} |`);
    }
    say();
    say("### Motion: the truth's change per frame on the frames where it moves, and the unfiltered error there");
    say();
    say("| sequence | moving frames | truth px/frame median | max | truth °/frame median | max | posed moving frames | e median px | e max px |");
    say("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of SEQS) {
        const mv = s.atRest.map((b, i) => (i > 0 && !b ? i : -1)).filter((i) => i >= 0);
        const posed = mv.filter((i) => s.results[i].ok);
        say(`| ${s.name} | ${mv.length} | ${fix(median(mv.map((i) => s.truthPx[i])))} | ${fix(max(mv.map((i) => s.truthPx[i])))} | ${fix(median(mv.map((i) => s.truthDeg[i])))} | ${fix(max(mv.map((i) => s.truthDeg[i])))} | ${posed.length} | ${fix(median(posed.map((i) => s.e[i])))} | ${fix(max(posed.map((i) => s.e[i])))} |`);
    }
    say();
    {
        const floor = wan.truths.map((H) => poseError(K, closedFormPose(H, K), H, G));
        say(`wander's truth is not rigid (\`view()\` with perspective terms; §2 of the IPPE acceptance), so the metric has a floor there: e of the closed form's own decomposition of H* against H*, median ${fix(median(floor))} px, max ${fix(max(floor))} px over its 40 frames. On the other sequences (no perspective, no roll) the truth is rigid and that floor is 0.`);
        say();
    }
    say("### The pose's speed on the moving frames, in the filter's own units (for the grid's betas)");
    say();
    say("| sequence | |ω|/s median (rad/s) | max | |Δt|/s median (model units/s) | max |");
    say("| --- | --- | --- | --- | --- |");
    for (const s of SEQS) {
        const w = [];
        const v = [];
        for (let i = 1; i < s.n; i++) {
            if (s.atRest[i] || s.results[i].state !== "TRACK" || s.results[i - 1].state !== "TRACK") continue;
            const te = (s.timestamps[i] - s.timestamps[i - 1]) / 1000;
            const om = so3Log(mul3(transpose3(s.results[i - 1].pose.R), s.results[i].pose.R));
            w.push(Math.hypot(om[0], om[1], om[2]) / te);
            const a = s.results[i - 1].pose.t;
            const b = s.results[i].pose.t;
            v.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / te);
        }
        say(`| ${s.name} | ${fix(median(w))} | ${fix(max(w))} | ${fix(median(v))} | ${fix(max(v))} |`);
    }
    say();

    // ---- The grid ---------------------------------------------------------------------------
    say("## The trade, over the grid");
    say();
    say(`dCutOff ${D_CUTOFF} Hz shared; minCutOff ∈ {${MIN_CUTOFFS.join(", ")}} Hz for both layers; beta (rotation) ∈ {${BETAS_ROT.join(", ")}} per rad/s; beta (translation) ∈ {${BETAS_T.join(", ")}} per model unit/s. The rotation's and the translation's settings move together: setting j of each list, ${MIN_CUTOFFS.length * BETAS_ROT.length} settings.`);
    say();
    say("### At rest (the probe's rest path), filtered against unfiltered, over the readable rest frames");
    say();
    say("| minCutOff Hz | beta R | beta t | e median px | e max px | d median px | d max px | unfiltered e median | d median |");
    say("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    {
        const readable = rst.atRest.map((b, i) => (b && rst.results[i].state === "TRACK" && rst.results[i - 1].state === "TRACK" ? i : -1)).filter((i) => i >= 0);
        const ue = readable.map((i) => rst.e[i]);
        const ud = readable.map((i) => poseDistance(K, rst.results[i].pose, rst.results[i - 1].pose, G));
        for (const p of settings()) {
            const f = filterPoses(rst.results, rst.timestamps, p).frames;
            const e = readable.map((i) => poseError(K, f[i].pose, rst.truths[i], G));
            const d = readable.map((i) => poseDistance(K, f[i].pose, f[i - 1].pose, G));
            say(`| ${p.minCutOffR} | ${p.betaR} | ${p.betaT} | ${fix(median(e))} | ${fix(max(e))} | ${fix(median(d))} | ${fix(max(d))} | ${fix(median(ue))} | ${fix(median(ud))} |`);
        }
    }
    say();
    say("### In motion: wander (all 39 TRACK frames) and leaveAndReturn's slides (its moving TRACK frames), filtered against unfiltered");
    say();
    say("| minCutOff Hz | beta R | beta t | wander e median px | e max | unfiltered median | max | leaveAndReturn moving e median px | e max | unfiltered median | max |");
    say("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const p of settings()) {
        const cells = [];
        for (const s of [wan, lar]) {
            const idx = s.results.map((r, i) => (i > 0 && !s.atRest[i] && r.state === "TRACK" ? i : -1)).filter((i) => i >= 0);
            const f = filterPoses(s.results, s.timestamps, p).frames;
            const e = idx.map((i) => poseError(K, f[i].pose, s.truths[i], G));
            const u = idx.map((i) => s.e[i]);
            cells.push(fix(median(e)), fix(max(e)), fix(median(u)), fix(max(u)));
        }
        say(`| ${p.minCutOffR} | ${p.betaR} | ${p.betaT} | ${cells.join(" | ")} |`);
    }
    say();
    say(`### The velocity steps: lag, per velocity. Lag = consecutive frames from the step (frame ${STEP_FRAME}) on which the filtered error exceeds the unfiltered error on the same frame; "n/a" when every moving frame re-detects (the filter resets each frame); "≥ k" when it has not returned within the run's k moving frames.`);
    say();
    say("| minCutOff Hz | beta R | beta t | " + SHIPPED_VELOCITIES.map((v) => `v=${v}: lag, peak e px, e at the last frame (unfiltered peak)`).join(" | ") + " |");
    say("| --- | --- | --- | " + SHIPPED_VELOCITIES.map(() => "---").join(" | ") + " |");
    for (const p of settings()) {
        const cells = [];
        for (const s of SEQS.filter((s) => s.v !== undefined)) {
            const moving = s.results.map((r, i) => (i >= STEP_FRAME ? i : -1)).filter((i) => i >= 0);
            const tracked = moving.filter((i) => s.results[i].state === "TRACK");
            if (tracked.length === 0) {
                cells.push("n/a (" + s.states.slice(STEP_FRAME) + ")");
                continue;
            }
            const f = filterPoses(s.results, s.timestamps, p).frames;
            const fe = moving.map((i) => (f[i].pose === null ? null : poseError(K, f[i].pose, s.truths[i], G)));
            let lag = 0;
            for (const i of moving) {
                if (fe[i - STEP_FRAME] !== null && fe[i - STEP_FRAME] > s.e[i]) lag++;
                else break;
            }
            const lagText = lag === moving.length ? `≥ ${lag}` : String(lag);
            const peak = max(fe.filter((x) => x !== null));
            const upeak = max(moving.filter((i) => s.e[i] !== null).map((i) => s.e[i]));
            const last = fe[fe.length - 1];
            cells.push(`${lagText}, ${fix(peak, 2)}, ${fix(last, 2)} (${fix(upeak, 2)})`);
        }
        say(`| ${p.minCutOffR} | ${p.betaR} | ${p.betaT} | ${cells.join(" | ")} |`);
    }
    say();
    say(`### Settling after motion stops: leaveAndReturn's last rest segment (frames ${LAR_REST_FROM} to 105, TRACK from frame 93). Lag = frames from ${LAR_REST_FROM} until the filtered error first falls to or below the unfiltered error on the same frame; "≥ k" when it has not within the k frames.`);
    say();
    say("| minCutOff Hz | beta R | beta t | settling lag, frames | e filtered at frame 96 px | at 105 | unfiltered at 96 | at 105 |");
    say("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const p of settings()) {
        const f = filterPoses(lar.results, lar.timestamps, p).frames;
        const idx = lar.results.map((_, i) => i).filter((i) => i >= LAR_REST_FROM);
        if (idx.some((i) => lar.results[i].state !== "TRACK" || f[i].pose === null)) fatal("settling: a frame of leaveAndReturn's last rest segment is not TRACK");
        const fe = idx.map((i) => poseError(K, f[i].pose, lar.truths[i], G));
        let lag = 0;
        while (lag < idx.length && fe[lag] > lar.e[idx[lag]]) lag++;
        say(`| ${p.minCutOffR} | ${p.betaR} | ${p.betaT} | ${lag === idx.length ? `≥ ${lag}` : lag} | ${fix(fe[0])} | ${fix(fe[fe.length - 1])} | ${fix(lar.e[idx[0]])} | ${fix(lar.e[idx[idx.length - 1]])} |`);
    }
    say();
    say("### The velocity steps, per frame at one setting (minCutOff 1 Hz, beta 0): e filtered / unfiltered, px");
    say();
    for (const s of SEQS.filter((s) => s.v !== undefined)) {
        const f = filterPoses(s.results, s.timestamps, ONE_SETTING).frames;
        const row = s.results.map((r, i) => (r.ok ? `${fix(f[i].pose === null ? NaN : poseError(K, f[i].pose, s.truths[i], G), 2)}/${fix(s.e[i], 2)}` : r.state[0]));
        say(`- v=${s.v} (${s.states}): ${row.join("  ")}`);
    }
    say();

    // ---- Digest of every filtered pose over the grid, for the determinism statement --------
    {
        const parts = [];
        for (const p of settings()) for (const s of SEQS) parts.push(posesDigest(filterPoses(s.results, s.timestamps, p).frames));
        say(`Digest of every filtered pose, every setting and sequence in order: ${sha256(parts.join("\n"))}`);
    }
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
