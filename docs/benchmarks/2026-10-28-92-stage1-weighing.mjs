/*
 *  2026-10-28-92-stage1-weighing.mjs
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
 * #92's Stage 1 weighing: the residual limit's candidates on every fit #90's
 * sweep produces, on the shipped target and on M2's 64 patches, and the real
 * steps of the committed tracking exports beside them. The computation behind
 * docs/benchmarks/2026-10-28-92-stage1-weighing.md. It reads the frozen
 * sweep's inputs where they lie, runs the tracking step on them, reads the
 * committed exports, and writes nothing. No device, no bench page, no replay:
 * synthetic, plus a read of committed exports. The tracker computes none of
 * the candidates, and no file under packages/<name>/src/ is changed.
 *
 *     npm ci && npm run build   (once: jsfeatnext_backend.ts, imported for `intrinsics`, imports the spec's built dist)
 *     node --experimental-transform-types docs/benchmarks/2026-10-28-92-stage1-weighing.mjs
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The driver is #160's (2026-10-21-104-stage1-threshold-derivation.mjs,
 *    its lines 114 to 402), copied unchanged: the same inputs and hashes,
 *    the same imports and resolve hook, the same 137 predictions on two views
 *    of five renders, the same K checks, the same step 0 (788 right and 0
 *    wrong on the shipped target, at least 11 inliers; 787 and 24 on M2's 64
 *    patches) and the same gross label, fatal on eight. Its method is that
 *    file's items 1 to 6. One line of it differs: each fit carries one more
 *    field, `weights`, the fit's final Tukey weights (trackFrame's
 *    result.weights). One import is added after it (readdirSync, for the
 *    exports).
 * 2. Its identity with #160's driver is checked, not asserted: the K block,
 *    the step 0 block and the table of the 24 wrong fits are printed by #160's
 *    own lines and must hash to the SHA-256 of the same blocks in #160's
 *    stdout, whose whole is the hash #160's record gives (fatal).
 * 3. Per fit, beside #160's fields: the inliers (weights above 0, checked
 *    against stats.inliers, fatal), n_eff = Σw, the fit RMS, and the verdict
 *    (right; wrong, gross; wrong, other).
 * 4. C1, the residual limit scaled by the inlier count, under the
 *    maintainer's re-ruling of 2026-10-28. 1a, a labelled heuristic and not a
 *    statistical correction: ρ = rms · √(2n / (2n − 8)) with n = inliers and
 *    with n = n_eff, side by side. robustHomography is an IRLS with
 *    data-dependent Tukey weights whose rmsError is √(Σ w r² / Σ w)
 *    (robust_homography.ts, lines 192 to 217), so neither count makes this a
 *    degrees-of-freedom correction. 1b, the primary answer: the free boundary.
 *    A limit L(n) on the RMS that does not decrease with the inlier count n
 *    separates iff every gross fit's RMS exceeds the largest right-fit RMS at
 *    or below its own inlier count. The unscaled RMS (today's form, at any
 *    value) is reported beside them for reference.
 * 5. C2, the scale change one step implies: |ln s|, s = √|det J|, J the 2 × 2
 *    Jacobian of H_fit · H_prev⁻¹ at H_prev's image of the target centre
 *    (`about`'s centre), in two readings named for what each models:
 *    (i) a held lock, H_prev = the view's exact H, the prediction carrying a
 *    velocity error E (the fit depends only on the prediction: track_frame.ts,
 *    lines 335 to 337); (ii) a lock's first step, H_prev = about(E, H), the
 *    tracker's own notion with previous = null (predict_homography.ts, lines
 *    80 to 86 and 107).
 * 6. C3, #104's signal read as a change: ΔE = E(H_fit) − E(H_prev), E as #160
 *    computes it, in the same two readings, signed and absolute, under K at
 *    45°, 60° (the record's) and 90° of horizontal field of view.
 * 7. For each candidate and form: per view and pooled, on each target and on
 *    both, the interval of one threshold (refuse above it) that refuses every
 *    gross fit and no right fit, if any, with its margin; otherwise the
 *    measured reason; and where the sixteen non-gross wrong fits fall. No
 *    value is proposed.
 * 8. The real steps: every committed export in docs/benchmarks/ whose `mode`
 *    is "tracking". A step is a pair of consecutive frames both with `state`
 *    "TRACK" and both with corners, the second later in media time (a loop
 *    wrap is the clip's, not a step) and not posed from a consumed detection
 *    (`detectionUse` "consumed": its pose comes from that detection, not
 *    from frame t − 1). Each frame's H is recovered from its
 *    four corners, which are the target's corners (0, 0), (w − 1, 0),
 *    (w − 1, h − 1), (0, h − 1) under the frame's H (bench-frames.mjs,
 *    `reprojectCorners`, `targetCorners`); four points fix a homography, so
 *    this is the frame's H up to scale. Per step: |ln s| of H_t · H_{t−1}⁻¹
 *    at the target centre's image in frame t − 1 (the quadrilateral's
 *    diagonals' intersection), and |ΔE| with K = intrinsics(w, h) at the
 *    export's processingResolution. For C1, every TRACK frame's own step,
 *    `tracking.inliers` and `tracking.rmsError`. The exports carry no ground
 *    truth: a step read here is an accepted step, right or wrong.
 *
 * The checks, all fatal: a failed check exits 1 naming what disagrees, and
 * no figure is printed after it. Timings go to stderr, so stdout is
 * byte-identical between runs.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---- fatal before anything is printed -----------------------------------------------------
const out = [];
const say = (line = "") => out.push(line);
function fatal(reason) {
    process.stderr.write(`fatal: ${reason}\n`);
    process.exit(1);
}
const t0 = performance.now();
const lap = (what) => process.stderr.write(`${what}: ${(performance.now() - t0).toFixed(0)} ms\n`);

// ---- the root, and the frozen inputs -------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
// A scratch copy outside the repository names the checkout it reads with WEBARKIT_ROOT. The
// inputs are hashed below, so a wrong root fails rather than reading something else.
const ROOT = process.env.WEBARKIT_ROOT ? resolve(process.env.WEBARKIT_ROOT) : resolve(HERE, "..", "..");

// docs/benchmarks/README.md, "The instrument, the subject and the inputs (2026-10-14)", item 3,
// the table under "#90's ground truth": the SHA-256 of each file at 37dc6d4.
const FROZEN = [
    ["packages/nft-tracker/test/tracking/track_frame.test.ts", "cc6c70bcf3d5dbe4122698bb35584f74048bee5598b10ab85075376e1f262973"],
    ["packages/nft-tracker/test/tracker_state_machine.test.ts", "f40e97d4d90dc863fc26c6c3efcc6fc3b09bdf79593399f3d51ef1ea356bcce3"],
    ["packages/nft-tracker/test/fixtures/tracking_target.ts", "9407d82ec31bb4c4510a1b230062d3ed09994de69c4101f4f0f98bca1348209a"],
    ["packages/nft-tracker/test/fixtures/warped_frames.ts", "0afb9e6dc0bbe7ebf1d9cf264926e837e6ad2bd8b94a4bee9d725afb3d886e97"],
    ["packages/nft-tracker/test/fixtures/pgm.ts", "523c80d9e4f6a1beec41e4fda9f289da1f2badc0fe83a2be9d5364ce5ca7befc"],
    ["packages/nft-tracker/test/fixtures/seeded_rng.ts", "fb7883c55c47ec31140fc7fc75d0543f5f4b59909887872c9869da5b0d691f82"],
    ["packages/nft-tracker/test/fixtures/pinball-target-640.pgm", "1c82be7f22b00e04a9d878912955330e6f6a212f07da668f4ec7c94e760487e3"],
    // AGENTS.md, the pinball.wnft bullet: the campaign's target; every M4 export records this hash.
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [rel, expected] of FROZEN) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) fatal(`${rel}: no such file under ${ROOT}`);
    const got = sha256(readFileSync(path));
    if (got !== expected) fatal(`${rel}: sha256 ${got}, not the record's ${expected}`);
}

// ---- importing the frozen TypeScript as it is ----------------------------------------------
registerHooks({
    resolve(specifier, context, next) {
        try {
            return next(specifier, context);
        } catch (e) {
            const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
            if (e && e.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) {
                return next(`${specifier.slice(0, -3)}.ts`, context);
            }
            throw e;
        }
    },
});
const load = async (rel) => {
    try {
        return await import(pathToFileURL(join(ROOT, rel)).href);
    } catch (e) {
        fatal(`cannot import ${rel}: ${e && e.message ? e.message.split("\n")[0] : e}`);
    }
};
const wf = await load("packages/nft-tracker/test/fixtures/warped_frames.ts");
const tt = await load("packages/nft-tracker/test/fixtures/tracking_target.ts");
const pg = await load("packages/nft-tracker/test/fixtures/pgm.ts");
const tf = await load("packages/nft-tracker/src/tracking/track_frame.ts");
const nft = await load("packages/nft-tracker/src/index.ts");
const jb = await load("packages/cv-backend-jsfeatnext/src/jsfeatnext_backend.ts");
for (const [name, fn] of [
    ["view", wf.view], ["renderWarp", wf.renderWarp], ["translation", wf.translation],
    ["rotation", wf.rotation], ["scaling", wf.scaling], ["mat3Mul", wf.mat3Mul],
    ["mat3Inv", wf.mat3Inv], ["project", wf.project], ["pinballPatches", tt.pinballPatches],
    ["readPgm", pg.readPgm], ["trackFrame", tf.trackFrame], ["trackTarget", tf.trackTarget],
    ["decode", nft.decode], ["intrinsics", jb.intrinsics],
]) {
    if (typeof fn !== "function") fatal(`${name} is not a function on the module it is imported from`);
}
if (!(pg.TARGET_FIXTURE instanceof URL)) fatal("TARGET_FIXTURE is not a URL");
if (!(typeof tt.PINBALL_STEP === "number" && Math.abs(tt.PINBALL_STEP - Math.cbrt(2)) < 1e-15)) {
    fatal("PINBALL_STEP is not the cube root of 2");
}
lap("inputs hashed and imported");

// ---- the driver: track_frame.test.ts, lines 85 to 109, 111 to 126, 173 to 179, 629 to 713 -----
const image = pg.readPgm(pg.TARGET_FIXTURE);
if (!(image.width === 512 && image.height === 640)) fatal(`target image is ${image.width} × ${image.height}, not 512 × 640`);
const patches = tt.pinballPatches();
if (patches.count !== 64) fatal(`the fixture has ${patches.count} patches, not 64`);
const fixture = tf.trackTarget(patches, tt.PINBALL_STEP);
const CAMERA = { width: 270, height: 360 };
const VIEWS = [
    wf.view({ target: image, frame: CAMERA, scale: 0.45 }),
    wf.view({
        target: image,
        frame: CAMERA,
        scale: 0.45,
        angle: (15 * Math.PI) / 180,
        perspective: [0.0004, -0.0003],
    }),
];
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10, seed: 3 };
const SEEDS = [1, 2, 3, 4, 5];

const decoded = nft.decode(new Uint8Array(readFileSync(join(ROOT, "examples/targets/pinball.wnft"))));
if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
if (!decoded.target.patches) fatal("pinball.wnft carries no patches");
const shipped = tf.trackTarget(decoded.target.patches, decoded.target.pyramid.scaleStep);
if (decoded.target.patches.count !== 48) fatal(`the shipped target has ${decoded.target.patches.count} patches, not 48`);

const D = nft;
for (const k of [
    "DEFAULT_MAX_FRAME_LEVELS", "DEFAULT_ALIGN_MAX_ITERATIONS", "DEFAULT_ALIGN_EPSILON", "DEFAULT_PHOTOMETRIC",
    "DEFAULT_FIT_MAX_ITERATIONS", "DEFAULT_TUKEY_C", "DEFAULT_FIT_EPSILON", "DEFAULT_MIN_TRACKED_PATCHES",
    "DEFAULT_MAX_OUTLIER_SHARE", "DEFAULT_MAX_FIT_RMS", "DEFAULT_MIN_PATCH_ZNCC",
]) {
    if (D[k] === undefined) fatal(`${k} is not exported by nft-tracker's index`);
}
const SHIPPED_OPTIONS = {
    maxFrameLevels: D.DEFAULT_MAX_FRAME_LEVELS,
    align: {
        maxIterations: D.DEFAULT_ALIGN_MAX_ITERATIONS,
        epsilon: D.DEFAULT_ALIGN_EPSILON,
        photometric: D.DEFAULT_PHOTOMETRIC,
    },
    fit: {
        maxIterations: D.DEFAULT_FIT_MAX_ITERATIONS,
        tukeyC: D.DEFAULT_TUKEY_C,
        epsilon: D.DEFAULT_FIT_EPSILON,
    },
    minTrackedPatches: D.DEFAULT_MIN_TRACKED_PATCHES,
    maxOutlierShare: D.DEFAULT_MAX_OUTLIER_SHARE,
    maxFitRms: D.DEFAULT_MAX_FIT_RMS,
    minPatchZncc: D.DEFAULT_MIN_PATCH_ZNCC,
};

/** RMS, frame px, between where `A` and `B` put the fixture's 64 patch centres. */
function centreRms(A, B) {
    let s = 0;
    for (let q = 0; q < patches.count; q++) {
        const [ax, ay] = wf.project(A, fixture.centres[2 * q], fixture.centres[2 * q + 1]);
        const [bx, by] = wf.project(B, fixture.centres[2 * q], fixture.centres[2 * q + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / patches.count);
}
/** `E` applied in the frame about the target centre's image: the prediction is `E · truth`. */
function about(E, H) {
    const [cx, cy] = wf.project(H, (image.width - 1) / 2, (image.height - 1) / 2);
    return wf.mat3Mul(wf.mat3Mul(wf.translation(cx, cy), wf.mat3Mul(E, wf.translation(-cx, -cy))), H);
}
const deg = (a) => (a * Math.PI) / 180;
/** The 137 predictions, each with the label the record uses for it. */
const ERRORS = [{ label: "none", E: wf.translation(0, 0) }];
for (const d of [1, 2, 3, 4, 5, 6, 8]) {
    for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        ERRORS.push({ label: `shift ${d} px @ ${k * 22.5}°`, E: wf.translation(d * Math.cos(a), d * Math.sin(a)) });
    }
}
for (const a of [1, 2, 3, 4, 5, 6]) {
    ERRORS.push({ label: `roll +${a}°`, E: wf.rotation(deg(a)) });
    ERRORS.push({ label: `roll -${a}°`, E: wf.rotation(deg(-a)) });
}
for (const f of [1.02, 1.04, 1.06, 1.08, 1.1, 1.12]) {
    ERRORS.push({ label: `scale x${f}`, E: wf.scaling(f) });
    ERRORS.push({ label: `scale /${f}`, E: wf.scaling(1 / f) });
}
if (ERRORS.length !== 137) fatal(`${ERRORS.length} predictions, not 137`);

// ---- K, the record's, checked against the record's statement of it --------------------------
const K = jb.intrinsics(CAMERA.width, CAMERA.height);
const F_RECORD = 135 / Math.tan(deg(30));
if (!(K.length === 9)) fatal("intrinsics did not return a 3 × 3");
if (!(K[1] === 0 && K[3] === 0 && K[6] === 0 && K[7] === 0 && K[8] === 1)) fatal("K has skew or is not normalised");
if (!(Math.abs(K[0] - F_RECORD) < 1e-9 && Math.abs(K[4] - F_RECORD) < 1e-9)) {
    fatal(`K's focal length is ${K[0]}, not the record's 135 / tan 30° = ${F_RECORD}`);
}
const CENTRE = [CAMERA.width / 2, CAMERA.height / 2]; // the record's "principal point at the frame's centre"
if (!(K[2] === CENTRE[0] && K[5] === CENTRE[1])) {
    fatal(`K's principal point is (${K[2]}, ${K[5]}), not the frame's centre (${CENTRE[0]}, ${CENTRE[1]})`);
}
const Kinv = wf.mat3Inv(K);
const KINV_TOL = 1e-12;
{
    const I = wf.mat3Mul(Kinv, K);
    for (let i = 0; i < 9; i++) {
        if (Math.abs(I[i] - (i % 4 === 0 ? 1 : 0)) > KINV_TOL) fatal(`K⁻¹ K is not the identity to ${KINV_TOL}`);
    }
}
/** #104's signal on `H` under `Kinv`: b1, b2 the first two columns of K⁻¹H. */
function signal(H, Ki = Kinv) {
    const B = wf.mat3Mul(Ki, H);
    const b1 = [B[0], B[3], B[6]];
    const b2 = [B[1], B[4], B[7]];
    const n1 = Math.hypot(...b1);
    const n2 = Math.hypot(...b2);
    if (!(n1 > 0 && n2 > 0 && Number.isFinite(n1) && Number.isFinite(n2))) fatal("a fit's K⁻¹H has a degenerate column");
    const dot = b1[0] * b2[0] + b1[1] * b2[1] + b1[2] * b2[2];
    const dScale = n1 / n2 - 1;
    const dOrth = dot / (n1 * n2);
    return { dScale, dOrth, E: Math.max(Math.abs(dScale), Math.abs(dOrth)) };
}
// The record's one measurement of the signal on this sweep: "the sweep's second view is not a
// plane homography for the camera, and the signal reads d_scale 0.0084 and d_orth 0.031 on its
// exact H" (docs/benchmarks/README.md, "#104's state, settled (report, 2026-10-15)"; the finding
// it draws from is in 2026-10-14-tab9-m4-calibration-session.md). Both to two figures.
const RECORD_VIEW1 = { dScale: 0.0084, dOrth: 0.031 };
const TRUTH = VIEWS.map((H) => signal(H));
{
    const two = (x) => Number(Math.abs(x).toPrecision(2));
    if (!(two(TRUTH[1].dScale) === RECORD_VIEW1.dScale && two(TRUTH[1].dOrth) === RECORD_VIEW1.dOrth)) {
        fatal(`view 1's exact H reads d_scale ${TRUTH[1].dScale}, d_orth ${TRUTH[1].dOrth} under this K; the record says ${RECORD_VIEW1.dScale} and ${RECORD_VIEW1.dOrth}`);
    }
    if (!(Math.abs(TRUTH[0].dScale) < 1e-12 && Math.abs(TRUTH[0].dOrth) < 1e-12)) {
        fatal(`view 0's exact H, a similarity, reads ${TRUTH[0].dScale}, ${TRUTH[0].dOrth}: not 0 under this K`);
    }
}

// ---- the sweep, on both targets ----------------------------------------------------------------
const TARGETS = [
    { name: "shipped", target: shipped, patchCount: 48 },
    { name: "m2-64", target: fixture, patchCount: 64 },
];
const fits = []; // every step that ended ok, with its identity, verdict and signal
const counts = new Map(TARGETS.map((t) => [t.name, { steps: 0, right: 0, wrong: 0, losses: {}, minInliers: Infinity }]));
for (const seed of SEEDS) {
    const frames = VIEWS.map((H) => wf.renderWarp(image, H, { ...RENDER, seed }));
    for (const { name, target } of TARGETS) {
        const c = counts.get(name);
        VIEWS.forEach((H, v) => {
            ERRORS.forEach(({ label, E }, index) => {
                c.steps++;
                const r = tf.trackFrame(frames[v], target, null, about(E, H), SHIPPED_OPTIONS, null);
                if (!r.ok) {
                    c.losses[r.loss] = (c.losses[r.loss] ?? 0) + 1;
                    return;
                }
                const error = centreRms(r.H, H);
                const verdict = error < 0.5 ? "right" : "wrong";
                if (verdict === "right") {
                    c.right++;
                    c.minInliers = Math.min(c.minInliers, r.stats.inliers);
                } else c.wrong++;
                fits.push({
                    target: name, seed, view: v, index, label, verdict, error,
                    inliers: r.stats.inliers, rms: r.stats.rmsError, H: r.H, ...signal(r.H), weights: r.weights,
                });
            });
        });
    }
    lap(`seed ${seed} swept`);
}
for (const { name } of TARGETS) {
    const c = counts.get(name);
    const refused = Object.values(c.losses).reduce((a, b) => a + b, 0);
    if (c.steps !== 1370) fatal(`${name}: ${c.steps} steps, not 1370`);
    if (c.right + c.wrong + refused !== c.steps) fatal(`${name}: right + wrong + refused ≠ steps`);
}
// Step 0: the counts the record states, or nothing downstream is valid. The shipped target's
// three are track_frame.test.ts's assertions (lines 710 to 712); M2's are the round 3 record's
// ("The residual limit's margin") and 679be0a's.
const PINS = { shippedRight: 788, shippedWrong: 0, shippedMinInliers: 11, m2Right: 787, m2Wrong: 24 };
{
    const s = counts.get("shipped");
    if (!(s.right === PINS.shippedRight && s.wrong === PINS.shippedWrong)) {
        fatal(`step 0: shipped target ${s.right} right, ${s.wrong} wrong; the sweep pins ${PINS.shippedRight} and ${PINS.shippedWrong}`);
    }
    if (!(s.minInliers >= PINS.shippedMinInliers)) {
        fatal(`step 0: a right fit on the shipped target has ${s.minInliers} inliers; the sweep pins at least ${PINS.shippedMinInliers}`);
    }
    const m = counts.get("m2-64");
    if (!(m.right === PINS.m2Right && m.wrong === PINS.m2Wrong)) {
        fatal(`step 0: M2's 64 patches ${m.right} right, ${m.wrong} wrong; the record says ${PINS.m2Right} and ${PINS.m2Wrong}`);
    }
}

// ---- the gross eight, by the record's description ------------------------------------------
// "the 8 gross ones (7.1–9.4 px off, from `scale x1.1` and `scale x1.12`)": 2026-09-29-desktop-
// tuning-r3.md, "The residual limit's margin", the M2 row; docs/benchmarks/README.md, the table
// under "The gross wrong fits belong to the residual limit, not to the patch size".
const wrong64 = fits.filter((f) => f.target === "m2-64" && f.verdict === "wrong");
const isGross = (f) => (f.label === "scale x1.1" || f.label === "scale x1.12") && f.error >= 7.05 && f.error < 9.45;
for (const f of wrong64) f.gross = isGross(f);
const gross = wrong64.filter((f) => f.gross);
const sixteen = wrong64.filter((f) => !f.gross);
if (gross.length !== 8) fatal(`${gross.length} wrong fits match the record's description of the gross eight, not 8`);
if (sixteen.length !== 16) fatal(`${sixteen.length} other wrong fits, not 16`);

// ==== end of #160's driver (its lines 114 to 402, unchanged but for `weights` on each fit) ====

// The exports' directory is listed, so the one import #160 has no use for is here.
import { readdirSync } from "node:fs";

// ---- the driver's identity with #160's, by its own printed blocks ----------------------------
// Printed by #160's lines 436 to 438, 440 to 446 and 449 to 454, copied unchanged, and hashed
// against the same blocks of #160's stdout at 00e3821 (187,267 bytes, SHA-256 afb7c9db…e560, the
// hash #160's record gives for its two runs at 9fa0ff1).
const abs = Math.abs;
const g = (x, n = 4) => (Number.isFinite(x) ? x.toPrecision(n) : String(x));
const px = (x) => x.toFixed(3);
const sig = (x) => (x < 0 ? "-" : "+") + abs(x).toPrecision(4);
const DRIVER_BLOCKS = {
    K: "95d25eac65da6446a76070388031cdb5f34bcbcdfcc17c293257f4e92b9a0f4a",
    step0: "9aea81b498c5ed9921bd2f870c0fd27ac4601805008d7a6edc15c40167a6e3e6",
    wrong24: "5c35331dda361628e28e03bf0ecde7651557f15e4d897c135b0a902548a49b41",
};
say("# #92 Stage 1: the weighing of the residual limit's candidates on #90's sweep (2026-10-28)");
say();
say("## Provenance");
say(`node ${process.version}; root ${ROOT === resolve(HERE, "..", "..") ? "this checkout" : ROOT}`);
for (const [rel, h] of FROZEN) say(`  ${h.slice(0, 12)}…  ${rel}  (equals the record's)`);
const blocks = {};
let mark = out.length;
say(`K = intrinsics(270, 360): f ${g(K[0], 6)}, principal point (${K[2]}, ${K[5]}); the record's "f = 135 / tan 30° = 233.83 px, principal point at the frame's centre" holds`);
say(`exact H, view 0: d_scale ${sig(TRUTH[0].dScale)}, d_orth ${sig(TRUTH[0].dOrth)} (a similarity: 0 under any K)`);
say(`exact H, view 1: d_scale ${sig(TRUTH[1].dScale)}, d_orth ${sig(TRUTH[1].dOrth)} (the record's 0.0084 and 0.031 reproduce to two figures)`);
blocks.K = out.slice(mark);
say();
mark = out.length;
say("## Step 0: the sweep reproduced");
for (const { name, patchCount } of TARGETS) {
    const c = counts.get(name);
    const losses = Object.entries(c.losses).sort().map(([k, n]) => `${k} ${n}`).join(", ");
    say(`${name} (${patchCount} patches): ${c.steps} steps; ${c.right} right, ${c.wrong} wrong, refused: ${losses || "none"}; fewest inliers on a right fit ${c.minInliers}`);
}
say("shipped: 788 right, no wrong fit, at least 11 inliers: the test's own assertions hold. m2-64: 787 right, 24 wrong: the record's counts hold.");
blocks.step0 = out.slice(mark);
say();
mark = out.length;
say("## The 24 wrong fits of M2's 64 patches, by error (px at the 64 patch centres)");
say("gross | seed | view | prediction | error px | inliers | fit rms px | d_scale | d_orth | E");
for (const f of [...wrong64].sort((a, b) => b.error - a.error)) {
    say(`${f.gross ? "gross" : "  -  "} | ${f.seed} | ${f.view} | ${f.label} | ${px(f.error)} | ${f.inliers} | ${px(f.rms)} | ${sig(f.dScale)} | ${sig(f.dOrth)} | ${g(f.E)}`);
}
say(`gross (the record's eight): ${gross.length}; the sixteen: ${sixteen.length}; errors of the sixteen ${px(Math.min(...sixteen.map((f) => f.error)))} to ${px(Math.max(...sixteen.map((f) => f.error)))} px, of the eight ${px(Math.min(...gross.map((f) => f.error)))} to ${px(Math.max(...gross.map((f) => f.error)))} px`);
blocks.wrong24 = out.slice(mark);
for (const [name, expected] of Object.entries(DRIVER_BLOCKS)) {
    const got = sha256(blocks[name].join("\n"));
    if (got !== expected) fatal(`the driver is not #160's: its ${name} block hashes to ${got}, #160's to ${expected}`);
}
say("driver: the K block, the step 0 block and the table of the 24 wrong fits are byte-identical to #160's (SHA-256 checked)");
say();
lap("driver checked against #160's");

// ---- per fit: what each candidate needs ------------------------------------------------------
const right = fits.filter((f) => f.verdict === "right");
const CENTRE_T = [(image.width - 1) / 2, (image.height - 1) / 2]; // `about`'s centre, target px
const FOVS = [45, 60, 90];
const KI = new Map(FOVS.map((fov) => [fov, wf.mat3Inv(jb.intrinsics(CAMERA.width, CAMERA.height, fov))]));
{
    const K60 = jb.intrinsics(CAMERA.width, CAMERA.height, 60);
    for (let i = 0; i < 9; i++) if (K60[i] !== K[i]) fatal("intrinsics(270, 360, 60) is not the record's K");
}
/** det of the 2 × 2 Jacobian of the homography `M` at (x, y). */
function jacobianDet(M, x, y) {
    const w = M[6] * x + M[7] * y + M[8];
    const u = (M[0] * x + M[1] * y + M[2]) / w;
    const v = (M[3] * x + M[4] * y + M[5]) / w;
    const a = (M[0] - u * M[6]) / w;
    const b = (M[1] - u * M[7]) / w;
    const c = (M[3] - v * M[6]) / w;
    const d = (M[4] - v * M[7]) / w;
    return a * d - b * c;
}
/** The same by central differences, to check the closed form. */
function jacobianDetNumeric(M, x, y, h = 0.01) {
    const [xp, yp] = wf.project(M, x + h, y);
    const [xm, ym] = wf.project(M, x - h, y);
    const [xq, yq] = wf.project(M, x, y + h);
    const [xn, yn] = wf.project(M, x, y - h);
    return (((xp - xm) / (2 * h)) * ((yq - yn) / (2 * h))) - (((xq - xn) / (2 * h)) * ((yp - ym) / (2 * h)));
}
const DET_REL_TOL = 1e-6;
const CHAIN_TOL = 1e-9;
/** ln s, s = √|det J|, J the Jacobian of H · P⁻¹ at P's image of `centre`: the step P → H's scale change. */
function lnScale(H, P, centre = CENTRE_T) {
    const [x, y] = wf.project(P, centre[0], centre[1]);
    const M = wf.mat3Mul(H, wf.mat3Inv(P));
    const det = jacobianDet(M, x, y);
    if (!(Number.isFinite(det) && det !== 0)) fatal(`a step's Jacobian has determinant ${det}`);
    const num = jacobianDetNumeric(M, x, y);
    if (!(abs(num - det) <= DET_REL_TOL * abs(det))) fatal(`a step's Jacobian: closed form ${det}, central differences ${num}`);
    const lnS = 0.5 * Math.log(abs(det));
    // Where it is evaluated, checked by the chain rule: J of H · P⁻¹ at P(c) is J_H(c) · J_P(c)⁻¹,
    // both taken at the target-space point c, so the two ln-dets must differ by exactly lnS.
    const chain = 0.5 * (Math.log(abs(jacobianDet(H, centre[0], centre[1]))) - Math.log(abs(jacobianDet(P, centre[0], centre[1]))));
    if (!(abs(chain - lnS) < CHAIN_TOL)) fatal(`a step's ln s is ${lnS} at P's image of the centre, ${chain} by the chain rule at the centre`);
    return lnS;
}
// The Jacobian checked on cases whose answer is known: each prediction about the target centre's
// image of each view implies exactly the scale of its own E (1 for a shift or a roll, f for scaling(f)).
const LNS_TOL = 1e-9;
for (const H of VIEWS) {
    for (const { label, E } of ERRORS) {
        if (!(E[6] === 0 && E[7] === 0 && E[8] === 1)) fatal(`prediction ${label} is not affine`);
        const expected = 0.5 * Math.log(abs(E[0] * E[4] - E[1] * E[3]));
        const got = lnScale(about(E, H), H);
        if (!(abs(got - expected) < LNS_TOL)) fatal(`prediction ${label}: ln s ${got}, its own scale's ${expected}`);
    }
}
const N_PARAMS = 8; // robustHomography's DLT solves h̃₁ … h̃₈ with h̃₉ = 1 (robust_homography.ts, lines 288 to 319)
const heuristic = (rms, n) => rms * Math.sqrt((2 * n) / (2 * n - N_PARAMS));
for (const f of fits) {
    let sumW = 0;
    let positive = 0;
    for (const w of f.weights) {
        sumW += w;
        if (w > 0) positive++;
    }
    if (positive !== f.inliers) fatal(`a fit has ${positive} positive weights and stats.inliers ${f.inliers}`);
    if (!(2 * sumW > N_PARAMS)) fatal(`a fit's n_eff is ${sumW}: 2 n_eff − 8 is not positive and the heuristic is undefined`);
    f.cls = f.verdict === "right" ? "right" : f.gross ? "gross" : "other";
    f.nEff = sumW;
    f.rhoN = heuristic(f.rms, f.inliers);
    f.rhoW = heuristic(f.rms, sumW);
    const exact = VIEWS[f.view];
    const firstStep = about(ERRORS[f.index].E, exact);
    f.lnS = [lnScale(f.H, exact), lnScale(f.H, firstStep)];
    f.dE = new Map(
        FOVS.map((fov) => {
            const Ki = KI.get(fov);
            const e = signal(f.H, Ki).E;
            return [fov, [e - signal(exact, Ki).E, e - signal(firstStep, Ki).E]];
        }),
    );
    if (!(abs(f.dE.get(60)[0] - (f.E - TRUTH[f.view].E)) < 1e-15)) fatal("ΔE at 60° disagrees with #160's E");
}
lap("candidates computed on every fit");

// ---- figures -------------------------------------------------------------------------------
const q = (xs, p) => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const pos = (s.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const READINGS = ["(i) held lock", "(ii) first step"];
const rightId = (f) => `${f.target}, seed ${f.seed}, view ${f.view}, ${f.label}, ${f.inliers} inliers`;
const grossId = (f) => `seed ${f.seed}, view ${f.view}, ${f.label}, ${px(f.error)} px off, ${f.inliers} inliers`;
const VIEW_SETS = [["both views", () => true], ["view 0", (f) => f.view === 0], ["view 1", (f) => f.view === 1]];
const TARGET_SETS = [
    ["both targets", () => true],
    ["shipped", (f) => f.target === "shipped"],
    ["m2-64", (f) => f.target === "m2-64"],
];
/**
 * One threshold τ on `val`, refusing when val > τ: the interval [largest right, smallest gross)
 * if the first is below the second, with where the sixteen fall; otherwise the counts that fail.
 */
function separation(val, rightSet, grossSet, otherSet) {
    const lo = Math.max(...rightSet.map(val));
    const hi = Math.min(...grossSet.map(val));
    const loFit = rightSet.find((f) => val(f) === lo);
    const hiFit = grossSet.find((f) => val(f) === hi);
    const ok = lo < hi;
    const r = { lo, hi, loFit, hiFit, ok };
    if (ok) {
        r.atTightest = otherSet.filter((f) => val(f) > lo).length;
        r.everywhere = otherSet.filter((f) => val(f) >= hi).length;
        r.passedTightest = otherSet.length - r.atTightest;
    } else {
        r.rightAbove = rightSet.filter((f) => val(f) >= hi).length;
        r.grossBelow = grossSet.filter((f) => val(f) <= lo).length;
    }
    return r;
}
const sepHeader = "view | targets | largest right (whose) | smallest gross (whose) | separates | interval for τ | width | ratio | the sixteen";
function sepLine(viewName, targetName, r, nOther) {
    const ratio = r.lo > 0 ? g(r.hi / r.lo) : "–";
    const tail = r.ok
        ? `[${g(r.lo)}, ${g(r.hi)}) | ${g(r.hi - r.lo)} | ${ratio} | of ${nOther}: ${r.atTightest} refused at the tightest τ, ${r.everywhere} at every τ in the interval, ${r.passedTightest} passed at the tightest`
        : `none | ${g(r.hi - r.lo)} | ${ratio} | at τ just below the smallest gross: ${r.rightAbove} right fits refused; at the largest right: ${r.grossBelow} gross fits passed`;
    return `${viewName} | ${targetName} | ${g(r.lo)} (${rightId(r.loFit)}) | ${g(r.hi)} (${grossId(r.hiFit)}) | ${r.ok ? "yes" : "no"} | ${tail}`;
}
const summary = [];
function sweepTable(candidate, form, val) {
    say(sepHeader);
    for (const [vn, vsel] of VIEW_SETS) {
        for (const [tn, tsel] of TARGET_SETS) {
            const rs = right.filter((f) => vsel(f) && tsel(f));
            const gs = gross.filter(vsel);
            const os = sixteen.filter(vsel);
            const r = separation(val, rs, gs, os);
            say(sepLine(vn, tn, r, os.length));
            summary.push({ candidate, form, view: vn, targets: tn, r, nOther: os.length });
        }
    }
}
function describe(label, xs) {
    say(`${label}: n ${xs.length}; p50 ${g(q(xs, 0.5))}, p90 ${g(q(xs, 0.9))}, p99 ${g(q(xs, 0.99))}, max ${g(Math.max(...xs))}, min ${g(Math.min(...xs))}`);
}

// ---- C0, for reference: the fit RMS unscaled ---------------------------------------------------
say("## For reference: the fit RMS itself, today's form (maxFitRms 0.6 refuses above it)");
sweepTable("C0 unscaled RMS", "rms", (f) => f.rms);
say();

// ---- C1 ----------------------------------------------------------------------------------------
say("## C1a: the residual scaled by the inlier count, ρ = rms · √(2n / (2n − 8)), a labelled heuristic");
say("robustHomography is an IRLS with data-dependent Tukey weights whose rmsError is √(Σ w r² / Σ w); neither n below makes ρ a degrees-of-freedom correction.");
say("### n = inliers (weights above 0)");
sweepTable("C1a ρ(n)", "n = inliers", (f) => f.rhoN);
say("### n = n_eff = Σw, the sum of the fit's final Tukey weights");
sweepTable("C1a ρ(n_eff)", "n = Σw", (f) => f.rhoW);
{
    const gap = fits.map((f) => f.inliers - f.nEff);
    say(`inliers − n_eff over every ok fit: max ${g(Math.max(...gap))}, p50 ${g(q(gap, 0.5))}; on the gross fits ${gross.map((f) => g(f.inliers - f.nEff, 3)).join(", ")}`);
}
say();

say("## C1b: the free boundary, whether some limit L(n) on the RMS that does not decrease with the inlier count n separates");
say("A separating non-decreasing L exists iff, for every gross fit, its RMS exceeds the largest RMS of a right fit with at most as many inliers. C1a's ρ(n) is one form of L; a separating L must still sit at or above every right fit's RMS at its own n.");
function freeBoundary(rs, gs, os) {
    const envelope = (n) => {
        const xs = rs.filter((f) => f.inliers <= n).map((f) => f.rms);
        return xs.length ? Math.max(...xs) : -Infinity;
    };
    const margins = gs.map((f) => ({ f, env: envelope(f.inliers), margin: f.rms - envelope(f.inliers) }));
    const ok = margins.every((m) => m.margin > 0);
    const binding = margins.reduce((a, b) => (b.margin < a.margin ? b : a));
    const maxGrossN = Math.max(...gs.map((f) => f.inliers));
    const rightAtOrBelow = rs.filter((f) => f.inliers <= maxGrossN).length;
    // A sixteen fit is refused by every separating L when some gross fit has at least its inliers
    // and at most its RMS; passed by every one when some right fit has at most its inliers and at
    // least its RMS; otherwise the choice of L decides.
    let refused = 0;
    let passed = 0;
    for (const o of os) {
        if (gs.some((x) => x.inliers >= o.inliers && x.rms <= o.rms)) refused++;
        else if (rs.some((x) => x.inliers <= o.inliers && x.rms >= o.rms)) passed++;
    }
    return { ok, binding, maxGrossN, rightAtOrBelow, refused, passed, either: os.length - refused - passed, minRightN: Math.min(...rs.map((f) => f.inliers)) };
}
say("view | targets | separates | fewest inliers on a right fit | most on a gross fit | right fits at or below it | binding gross fit: RMS over the envelope | the sixteen: refused by every separating L, passed by every one, decided by L");
for (const [vn, vsel] of VIEW_SETS) {
    for (const [tn, tsel] of TARGET_SETS) {
        const rs = right.filter((f) => vsel(f) && tsel(f));
        const gs = gross.filter(vsel);
        const os = sixteen.filter(vsel);
        const b = freeBoundary(rs, gs, os);
        const bind = Number.isFinite(b.binding.env)
            ? `${px(b.binding.f.rms)} over ${px(b.binding.env)} (${grossId(b.binding.f)})`
            : `unconstrained: no right fit has ${b.binding.f.inliers} inliers or fewer (${grossId(b.binding.f)})`;
        say(`${vn} | ${tn} | ${b.ok ? "yes" : "no"} | ${b.minRightN} | ${b.maxGrossN} | ${b.rightAtOrBelow} | ${bind} | ${b.refused}, ${b.passed}, ${b.either} of ${os.length}`);
        summary.push({ candidate: "C1b free boundary", form: "L(n) non-decreasing", view: vn, targets: tn, free: b, nOther: os.length });
    }
}
say("### By inlier count, both targets and both views: right fits (count, largest RMS), gross fits (count, smallest RMS), the sixteen (count, RMS range)");
say("inliers | right n | right max rms | gross n | gross min rms | sixteen n | sixteen rms");
{
    const ns = [...new Set(fits.map((f) => f.inliers))].sort((a, b) => a - b);
    for (const n of ns) {
        const rs = right.filter((f) => f.inliers === n);
        const gs = gross.filter((f) => f.inliers === n);
        const os = sixteen.filter((f) => f.inliers === n);
        if (!rs.length && !gs.length && !os.length) continue;
        const range = (xs) => (xs.length ? `${px(Math.min(...xs))}–${px(Math.max(...xs))}` : "–");
        say(`${n} | ${rs.length} | ${rs.length ? px(Math.max(...rs.map((f) => f.rms))) : "–"} | ${gs.length} | ${gs.length ? px(Math.min(...gs.map((f) => f.rms))) : "–"} | ${os.length} | ${range(os.map((f) => f.rms))}`);
    }
}
say();

// ---- C2 ----------------------------------------------------------------------------------------
say("## C2: the scale change one step implies, |ln s|, s = √|det J| of H_fit · H_prev⁻¹ at H_prev's image of the target centre");
for (const [k, reading] of READINGS.entries()) {
    const val = (f) => abs(f.lnS[k]);
    say(`### ${reading}: H_prev = ${k === 0 ? "the view's exact H (a held lock, velocity error E)" : "about(E, H) (a lock's first step, the tracker's own notion with previous = null)"}`);
    describe("right fits, |ln s|", right.map(val));
    describe("gross fits, |ln s|", gross.map(val));
    describe("the sixteen, |ln s|", sixteen.map(val));
    sweepTable(`C2 ${reading}`, "|ln s|", val);
    if (k === 1) {
        const hi = Math.min(...gross.map(val));
        const cost = right.filter((f) => val(f) >= hi);
        const byLabel = new Map();
        for (const f of cost) byLabel.set(f.label, (byLabel.get(f.label) ?? 0) + 1);
        say(`the cost on first steps: right fits at or above the smallest gross |ln s| (${g(hi)}), refused by every τ that refuses all eight: ${cost.length} of ${right.length}`);
        say(`  by prediction: ${[...byLabel.entries()].sort().map(([l, n]) => `${l} ${n}`).join(", ") || "none"}`);
        const scaleRight = [1.02, 1.04, 1.06, 1.08, 1.1, 1.12].flatMap((s) => [`scale x${s}`, `scale /${s}`]).map((l) => {
            const xs = right.filter((f) => f.label === l).map(val);
            return `${l}: ${xs.length} right, |ln s| ${xs.length ? `${g(Math.min(...xs))}–${g(Math.max(...xs))}` : "–"}`;
        });
        say(`  right fits from the scale predictions (|ln f| = ${[1.02, 1.04, 1.06, 1.08, 1.1, 1.12].map((s) => g(Math.log(s))).join(", ")}): ${scaleRight.join("; ")}`);
    }
}
say();

// ---- C3 ----------------------------------------------------------------------------------------
say("## C3: #104's signal read as a change, ΔE = E(H_fit) − E(H_prev)");
say(`the comment's gaps (2026-10-21) are #160's per-view one-τ interval widths, 0.01564 − 0.003526 = ${g(0.01564 - 0.003526)} and 0.04174 − 0.03265 = ${g(0.04174 - 0.03265)}: a per-view constant shift of E reproduces them and adds nothing within a view. The test is pooled.`);
for (const [k, reading] of READINGS.entries()) {
    for (const [form, val] of [
        ["signed ΔE", (f) => f.dE.get(60)[k]],
        ["|ΔE|", (f) => abs(f.dE.get(60)[k])],
    ]) {
        say(`### ${reading}, ${form}, K at 60° (the record's)`);
        describe(`right fits, ${form}`, right.map(val));
        describe(`gross fits, ${form}`, gross.map(val));
        describe(`the sixteen, ${form}`, sixteen.map(val));
        sweepTable(`C3 ${reading}`, `${form} at 60°`, val);
    }
}
say("### Pooled and per view under three fields of view, both targets");
say("reading | form | fov | view | largest right | smallest gross | separates | width");
for (const [k, reading] of READINGS.entries()) {
    for (const [form, pick] of [
        ["signed ΔE", (x) => x],
        ["|ΔE|", (x) => abs(x)],
    ]) {
        for (const fov of FOVS) {
            const val = (f) => pick(f.dE.get(fov)[k]);
            for (const [vn, vsel] of VIEW_SETS) {
                const r = separation(val, right.filter(vsel), gross.filter(vsel), sixteen.filter(vsel));
                say(`${reading} | ${form} | ${fov}° | ${vn} | ${g(r.lo)} | ${g(r.hi)} | ${r.ok ? "yes" : "no"} | ${g(r.hi - r.lo)}`);
            }
        }
    }
}
say("The blindness the comment names is a property of the form, not measured here: ΔE reads E(H_fit) against E(H_prev), so a fit whose E stays at a wrong level from step to step reads ΔE ≈ 0.");
say();

// ---- the eight, and the sixteen, on every candidate ------------------------------------------
say("## The 24 wrong fits on every candidate (ΔE at 60°)");
say("class | seed | view | prediction | error px | inliers | n_eff | rms | ρ(n) | ρ(n_eff) | |ln s| (i) | |ln s| (ii) | ΔE (i) | ΔE (ii)");
for (const f of [...wrong64].sort((a, b) => b.error - a.error)) {
    const d = f.dE.get(60);
    say(`${f.cls} | ${f.seed} | ${f.view} | ${f.label} | ${px(f.error)} | ${f.inliers} | ${g(f.nEff)} | ${px(f.rms)} | ${g(f.rhoN)} | ${g(f.rhoW)} | ${g(abs(f.lnS[0]))} | ${g(abs(f.lnS[1]))} | ${sig(d[0])} | ${sig(d[1])}`);
}
say();
lap("sweep figures done");

// ---- the real steps: the committed tracking exports -------------------------------------------
const BENCH = join(ROOT, "docs", "benchmarks");
const exportsRead = [];
const isCorners = (c) => Array.isArray(c) && c.length === 4 && c.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
/** The homography sending the four points `src` onto `dst`, H[8] = 1, by an 8 × 8 solve. */
function homographyFrom4(src, dst, what) {
    const A = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [u, v] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
        let p = c;
        for (let r = c + 1; r < 8; r++) if (abs(A[r][c]) > abs(A[p][c])) p = r;
        if (!(abs(A[p][c]) > 1e-12)) fatal(`${what}: the four corners do not fix a homography`);
        [A[c], A[p]] = [A[p], A[c]];
        for (let r = 0; r < 8; r++) {
            if (r === c) continue;
            const m = A[r][c] / A[c][c];
            for (let k = c; k < 9; k++) A[r][k] -= m * A[c][k];
        }
    }
    const H = [...Array.from({ length: 8 }, (_, i) => A[i][8] / A[i][i]), 1];
    for (let i = 0; i < 4; i++) {
        const [u, v] = wf.project(H, src[i][0], src[i][1]);
        if (!(abs(u - dst[i][0]) < 1e-6 && abs(v - dst[i][1]) < 1e-6)) fatal(`${what}: the recovered H misses corner ${i}`);
    }
    return H;
}
for (const name of readdirSync(BENCH).filter((n) => n.endsWith(".json")).sort()) {
    const bytes = readFileSync(join(BENCH, name));
    let e;
    try {
        e = JSON.parse(bytes.toString("utf8"));
    } catch {
        fatal(`${name}: not JSON`);
    }
    if (e.mode !== "tracking") continue;
    if (!Array.isArray(e.frames)) fatal(`${name}: a tracking export without frames`);
    const res = e.processingResolution;
    if (!(Number.isInteger(res?.width) && res.width > 0 && Number.isInteger(res?.height) && res.height > 0)) fatal(`${name}: no processingResolution`);
    const W = e.target?.widthPx;
    const Ht = e.target?.heightPx;
    if (!(Number.isInteger(W) && W > 1 && Number.isInteger(Ht) && Ht > 1)) fatal(`${name}: no target size`);
    const clip = e.source === "bundled" ? e.bundledClip : e.source;
    if (typeof clip !== "string") fatal(`${name}: no clip`);
    const Ki = wf.mat3Inv(jb.intrinsics(res.width, res.height));
    const rect = [[0, 0], [W - 1, 0], [W - 1, Ht - 1], [0, Ht - 1]];
    const centre = [(W - 1) / 2, (Ht - 1) / 2];
    const Hs = new Map();
    const Hof = (i) => {
        if (!Hs.has(i)) Hs.set(i, homographyFrom4(rect, e.frames[i].corners, `${name}, frame ${i}`));
        return Hs.get(i);
    };
    const x = { name, sha: sha256(bytes), clip, res, frames: e.frames.length, track: 0, pairs: 0, noCorners: 0, consumed: 0, notForward: 0, lnS: [], dE: [], steps: [], fitsT: [] };
    for (let i = 0; i < e.frames.length; i++) {
        const b = e.frames[i];
        if (typeof b.state !== "string") fatal(`${name}, frame ${i}: no state`);
        if (b.corners !== null && b.corners !== undefined && !isCorners(b.corners)) fatal(`${name}, frame ${i}: malformed corners`);
        if (b.state === "TRACK") {
            x.track++;
            const t = b.tracking;
            if (!(t && Number.isInteger(t.inliers) && Number.isFinite(t.rmsError))) fatal(`${name}, frame ${i}: a TRACK frame without its step's inliers and rmsError`);
            x.fitsT.push({ inliers: t.inliers, rms: t.rmsError });
        }
        if (i === 0) continue;
        const a = e.frames[i - 1];
        if (!(a.state === "TRACK" && b.state === "TRACK")) continue;
        x.pairs++;
        if (!a.corners || !b.corners) {
            x.noCorners++;
            continue;
        }
        // A frame that confirmed a consumed detection was posed from that detection, not from t − 1.
        if (b.detectionUse === "consumed") {
            x.consumed++;
            continue;
        }
        if (!(Number.isFinite(a.mediaTimeSeconds) && Number.isFinite(b.mediaTimeSeconds))) fatal(`${name}, frame ${i}: no media time`);
        if (!(b.mediaTimeSeconds > a.mediaTimeSeconds)) {
            x.notForward++;
            continue;
        }
        const Ha = Hof(i - 1);
        const Hb = Hof(i);
        const lnS = abs(lnScale(Hb, Ha, centre));
        const dE = abs(signal(Hb, Ki).E - signal(Ha, Ki).E);
        x.lnS.push(lnS);
        x.dE.push(dE);
        const next = [1, 2].map((k) => e.frames[i + k]?.state ?? "end");
        x.steps.push({ i, t0: a.mediaTimeSeconds, t1: b.mediaTimeSeconds, lnS, dE, inliers: b.tracking.inliers, next });
    }
    exportsRead.push(x);
}
if (exportsRead.length === 0) fatal("no tracking export read");
lap("exports read");

say("## The real steps: consecutive TRACK frames of the committed tracking exports");
say("A step: frames t − 1 and t both TRACK, both with corners, t later in media time. |ln s| at the target centre's image; |ΔE| under intrinsics(w, h) at the export's processingResolution.");
const refs = {
    lnS: READINGS.map((_, k) => Math.min(...gross.map((f) => abs(f.lnS[k])))),
    dE: READINGS.map((_, k) => Math.min(...gross.map((f) => abs(f.dE.get(60)[k])))),
};
say(`the smallest gross value each is read against: |ln s| ${g(refs.lnS[0])} (i), ${g(refs.lnS[1])} (ii); |ΔE| at 60° ${g(refs.dE[0])} (i), ${g(refs.dE[1])} (ii)`);
const stepCols = "frames | TRACK | TRACK→TRACK pairs | without corners | t consumed a detection | not forward in media time | steps read | |ln s| p50, p99, max | at or above the gross (i), (ii) | |ΔE| p50, p99, max | at or above the gross (i), (ii)";
const stepCells = (lnS, dE) =>
    `${lnS.length} | ${g(q(lnS, 0.5))}, ${g(q(lnS, 0.99))}, ${g(Math.max(...lnS))} | ${lnS.filter((v) => v >= refs.lnS[0]).length}, ${lnS.filter((v) => v >= refs.lnS[1]).length} | ${g(q(dE, 0.5))}, ${g(q(dE, 0.99))}, ${g(Math.max(...dE))} | ${dE.filter((v) => v >= refs.dE[0]).length}, ${dE.filter((v) => v >= refs.dE[1]).length}`;
say("### Per export");
say(`export | sha256 | clip | processing | ${stepCols}`);
for (const x of exportsRead) {
    say(`${x.name} | ${x.sha.slice(0, 12)}… | ${x.clip} | ${x.res.width} × ${x.res.height} | ${x.frames} | ${x.track} | ${x.pairs} | ${x.noCorners} | ${x.consumed} | ${x.notForward} | ${x.lnS.length ? stepCells(x.lnS, x.dE) : "0 | – | – | – | –"}`);
}
say("### Per clip, every export of it together");
say(`clip | exports | ${stepCols}`);
for (const clip of [...new Set(exportsRead.map((x) => x.clip))].sort()) {
    const xs = exportsRead.filter((x) => x.clip === clip);
    const sum = (k) => xs.reduce((a, x) => a + x[k], 0);
    const lnS = xs.flatMap((x) => x.lnS);
    const dE = xs.flatMap((x) => x.dE);
    say(`${clip} | ${xs.length} | ${sum("frames")} | ${sum("track")} | ${sum("pairs")} | ${sum("noCorners")} | ${sum("consumed")} | ${sum("notForward")} | ${stepCells(lnS, dE)}`);
}
const CLIPS = [...new Set(exportsRead.map((x) => x.clip))].sort();
say("### The steps at or above the smallest gross value: the inliers of frame t's step, and whether the lock held for the next two frames");
say("The exports carry no ground truth, so a step here is an accepted step, right or wrong; tracker.ts says a wrong pose can be returned as TRACK. Nothing is ruled.");
say("clip | quantity | reading | steps at or above | of them on a step with at most 10 inliers (the gross fits' range) | of them followed by a frame that is not TRACK within two frames | of them on more than 10 inliers with both next frames TRACK");
for (const clip of CLIPS) {
    const steps = exportsRead.filter((x) => x.clip === clip).flatMap((x) => x.steps);
    for (const [qty, key, ref] of [["|ln s|", "lnS", refs.lnS], ["|ΔE|", "dE", refs.dE]]) {
        for (const [k, reading] of READINGS.entries()) {
            const above = steps.filter((s) => s[key] >= ref[k]);
            const few = above.filter((s) => s.inliers <= 10).length;
            const lost = above.filter((s) => s.next.some((st) => st !== "TRACK")).length;
            const held = above.filter((s) => s.inliers > 10 && s.next.every((st) => st === "TRACK")).length;
            say(`${clip} | ${qty} | ${reading} | ${above.length} | ${few} | ${lost} | ${held}`);
        }
    }
}
say("### Each step with |ln s| at or above the smallest gross value under reading (i)");
say("clip | export | frame t | media time t − 1 → t, s | |ln s| | |ΔE| | inliers of t's step | states of t + 1, t + 2");
for (const x of exportsRead) {
    for (const s of x.steps.filter((s) => s.lnS >= refs.lnS[0])) {
        say(`${x.clip} | ${x.name} | ${s.i} | ${s.t0.toFixed(3)} → ${s.t1.toFixed(3)} | ${g(s.lnS)} | ${g(s.dE)} | ${s.inliers} | ${s.next.join(", ")}`);
    }
}
say();

// ---- C1's side of the real runs: the TRACK frames' own fits ------------------------------------
const maxRight = (val) => Math.max(...right.map(val));
const minGross = (val) => Math.min(...gross.map(val));
const c1refs = {
    rms: maxRight((f) => f.rms),
    rhoN: maxRight((f) => f.rhoN),
    rmsGross: minGross((f) => f.rms),
    rhoNGross: minGross((f) => f.rhoN),
    grossN: Math.max(...gross.map((f) => f.inliers)),
};
say("## C1 on the real runs: every TRACK frame's step (tracking.inliers, tracking.rmsError)");
say(`read at both ends of the sweep's intervals: above the largest right value (the most a separating τ can refuse: RMS ${g(c1refs.rms)}, ρ(n) ${g(c1refs.rhoN)}) and at or above the smallest gross value (what every separating τ refuses: RMS ${g(c1refs.rmsGross)}, ρ(n) ${g(c1refs.rhoNGross)}, the end C2 and C3 are read at); and against the gross fits' largest inlier count ${c1refs.grossN}. n_eff is not exported, so ρ(n_eff) is not read here`);
say("clip | TRACK frames | inliers min, p1, p50 | at most 10 inliers | rms p50, p99, max | rms above the largest right, at or above the smallest gross | ρ(n) above the largest right, at or above the smallest gross");
for (const clip of CLIPS) {
    const fs = exportsRead.filter((x) => x.clip === clip).flatMap((x) => x.fitsT);
    const ns = fs.map((f) => f.inliers);
    const rs = fs.map((f) => f.rms);
    say(`${clip} | ${fs.length} | ${Math.min(...ns)}, ${g(q(ns, 0.01))}, ${g(q(ns, 0.5))} | ${fs.filter((f) => f.inliers <= c1refs.grossN).length} | ${g(q(rs, 0.5))}, ${g(q(rs, 0.99))}, ${g(Math.max(...rs))} | ${fs.filter((f) => f.rms > c1refs.rms).length}, ${fs.filter((f) => f.rms >= c1refs.rmsGross).length} | ${fs.filter((f) => heuristic(f.rms, f.inliers) > c1refs.rhoN).length}, ${fs.filter((f) => heuristic(f.rms, f.inliers) >= c1refs.rhoNGross).length}`);
}
say();

// ---- the summary --------------------------------------------------------------------------------
say("## Summary: candidate × form × view × targets");
say("candidate | form | view | targets | separates | interval or reason | the sixteen");
for (const s of summary) {
    if (s.free) {
        const b = s.free;
        say(`${s.candidate} | ${s.form} | ${s.view} | ${s.targets} | ${b.ok ? "yes" : "no"} | ${b.ok ? `fewest right inliers ${b.minRightN}, most gross ${b.maxGrossN}; right fits at or below it ${b.rightAtOrBelow}` : `binding gross fit at ${px(b.binding.f.rms)} against ${px(b.binding.env)}`} | ${b.refused} refused, ${b.passed} passed, ${b.either} decided by L`);
        continue;
    }
    const r = s.r;
    say(`${s.candidate} | ${s.form} | ${s.view} | ${s.targets} | ${r.ok ? "yes" : "no"} | ${r.ok ? `[${g(r.lo)}, ${g(r.hi)}), width ${g(r.hi - r.lo)}` : `largest right ${g(r.lo)} ≥ smallest gross ${g(r.hi)}: ${r.rightAbove} right refused, ${r.grossBelow} gross passed`} | ${r.ok ? `${r.atTightest} refused at the tightest, ${r.everywhere} at every τ, ${r.passedTightest} passed at the tightest` : "–"}`);
}
say();

// ---- every fit -------------------------------------------------------------------------------------
say("## Every fit (ok steps), with its identity, the sweep's verdict and each candidate's quantity (ΔE at 60°)");
say("target | seed | view | # | prediction | verdict | error px | inliers | n_eff | fit rms px | ρ(n) | ρ(n_eff) | ln s (i) | ln s (ii) | ΔE (i) | ΔE (ii)");
for (const f of fits) {
    const d = f.dE.get(60);
    say(`${f.target} | ${f.seed} | ${f.view} | ${f.index} | ${f.label} | ${f.cls === "right" ? "right" : `wrong (${f.cls})`} | ${px(f.error)} | ${f.inliers} | ${g(f.nEff, 5)} | ${px(f.rms)} | ${g(f.rhoN)} | ${g(f.rhoW)} | ${sig(f.lnS[0])} | ${sig(f.lnS[1])} | ${sig(d[0])} | ${sig(d[1])}`);
}

lap("done");
process.stdout.write(out.join("\n") + "\n");
