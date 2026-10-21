/*
 *  2026-10-21-104-stage1-threshold-derivation.mjs
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
 * #104's Stage 1 probe, the threshold derivation: d_scale and d_orth on every
 * fit #90's sweep produces, on the shipped target and on M2's 64 patches, and
 * whether a threshold on them refuses every gross wrong fit and no right fit.
 * The computation behind docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.md.
 * It reads the frozen sweep's inputs where they lie, runs the tracking step on
 * them, and writes nothing. No device, no bench page, no replay, no export:
 * synthetic throughout. It implements no part of the signal in the tracker.
 *
 *     npm ci && npm run build   (once: jsfeatnext_backend.ts, imported for `intrinsics`, imports the spec's built dist)
 *     node --experimental-transform-types docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.mjs
 *
 * The flag is needed because the frozen inputs are TypeScript: the fixtures
 * and the tracker's src are imported as the files they are, not copied, and
 * src/tracker.ts uses a parameter property, which Node's default type
 * stripping refuses. A resolve hook below maps a `.js` specifier from a `.ts`
 * importer onto the `.ts` file beside it, which is how the test runner
 * resolves the same specifiers. Nothing is rewritten.
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The inputs. The seven files the plan attests for #90's ground truth
 *    (docs/benchmarks/README.md, "The instrument, the subject and the inputs
 *    (2026-10-14)", item 3, the table under "#90's ground truth") and the
 *    committed target examples/targets/pinball.wnft (AGENTS.md's bullet on
 *    it; its sha256 as every M4 export records it). Each is hashed and must
 *    equal the record's hash (fatal): the probe reads the attested sweep or
 *    nothing.
 * 2. The driver, reimplemented from track_frame.test.ts because a test file
 *    cannot be imported: the two views (`view()` at scale 0.45 in a 270 × 360
 *    frame; the second rolled 15° with perspective [0.0004, −0.0003]), the
 *    render settings (one blur pass, noise σ 2, gain 0.9, bias 10), seeds 1 to
 *    5, the 137 predictions (the identity; translations of 1, 2, 3, 4, 5, 6
 *    and 8 px in 16 directions; roll ±1° to ±6°; scale ×1.02 to ×1.12 and
 *    their reciprocals), each applied about the target centre's image
 *    (`about`), one `trackFrame` step from each with the tracker's exported
 *    defaults as the test's SHIPPED_OPTIONS maps them, and the verdict by
 *    `centreRms` at the fixture's 64 patch centres: right below 0.5 px, wrong
 *    at or above it, otherwise refused by its loss. The renderer, the views,
 *    the patches, the target image and the tracking step are imported, never
 *    reimplemented.
 * 3. Step 0, the condition on which the permission to reimplement the driver
 *    rests: on the shipped target the driver must count 788 right fits and
 *    no wrong fit with at least 11 inliers on every right fit (the test's own
 *    assertions, track_frame.test.ts lines 710 to 712), and on M2's 64
 *    patches 787 right and 24 wrong (the record: 2026-09-29-desktop-tuning-r3.md,
 *    "The residual limit's margin", and commit 679be0a). Any other count is
 *    fatal: the driver is then not the sweep.
 * 4. K. The sweep's views are built by `view()` and carry no camera; the
 *    record's K for a frame of the sweep's size is `intrinsics(270, 360)` of
 *    cv-backend-jsfeatnext, "the frozen tests' camera: a 60° horizontal
 *    field of view, so f = 135 / tan 30° = 233.83 px, principal point at the
 *    frame's centre" (2026-10-15-m4-step3-ippe-acceptance.md, §3). It is
 *    imported and checked against that statement (fatal), and the signal on
 *    the second view's exact H must reproduce the record's 0.0084 and 0.031
 *    to the two figures the record gives (fatal): the one measurement of the
 *    signal on this sweep the record holds, so that K is the record's and not
 *    an assumption of this file.
 * 5. The signal, on every fit that ends ok: B = K⁻¹H, b1 and b2 its first two
 *    columns, d_scale = ‖b1‖ / ‖b2‖ − 1, d_orth = b1·b2 / (‖b1‖ ‖b2‖), as
 *    #104's body defines them, with E = max(|d_scale|, |d_orth|), the pair
 *    #153 called kind E.
 * 6. The gross wrong fits are the eight the record describes: of the 64-patch
 *    target's 24 wrong fits, those "7.1–9.4 px off, from scale x1.1 and scale
 *    x1.12" (the round 3 record, the same section). The script labels a
 *    wrong fit gross when it matches that description and requires the label
 *    to fall on exactly eight (fatal). The description is the record's; no
 *    operational definition of "gross" exists in anything this probe read,
 *    and the script adds none.
 * 7. The derivation, over the right fits of both targets and the eight gross
 *    fits: one threshold τ on E (refuse when E > τ), the interval of τ that
 *    refuses every gross fit and no right fit, if any, with the margin on
 *    each side; and two thresholds (τ_s on |d_scale|, τ_o on |d_orth|, refuse
 *    when either is exceeded), the tightest pair the right fits admit and
 *    what each gross fit clears it by. Both per view as well as pooled, since
 *    the record says the second view inflates the signal. The sixteen
 *    non-gross wrong fits are listed beside the eight, and where each form
 *    puts them is counted, without ruling on it.
 * 8. Beyond the brief: the same extremes under a 45° and a 90° field of view,
 *    to show how much of the derivation rests on K's focal length.
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
                    inliers: r.stats.inliers, rms: r.stats.rmsError, H: r.H, ...signal(r.H),
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

// ---- figures -------------------------------------------------------------------------------
const abs = Math.abs;
const q = (xs, p) => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const pos = (s.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const g = (x, n = 4) => (Number.isFinite(x) ? x.toPrecision(n) : String(x));
const px = (x) => x.toFixed(3);
const sig = (x) => (x < 0 ? "-" : "+") + abs(x).toPrecision(4);
const right = fits.filter((f) => f.verdict === "right");
const by = (xs, pred) => xs.filter(pred);
const BINS = [0, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, Infinity];
function histogram(xs) {
    const h = new Array(BINS.length - 1).fill(0);
    for (const x of xs) {
        let i = 0;
        while (x >= BINS[i + 1]) i++;
        h[i]++;
    }
    return h;
}
const binLabel = (i) => (BINS[i + 1] === Infinity ? `≥ ${BINS[i]}` : `[${BINS[i]}, ${BINS[i + 1]})`);

say("# #104 Stage 1 probe: the threshold derivation on #90's sweep (2026-10-21)");
say();
say("## Provenance");
say(`node ${process.version}; root ${ROOT === resolve(HERE, "..", "..") ? "this checkout" : ROOT}`);
for (const [rel, h] of FROZEN) say(`  ${h.slice(0, 12)}…  ${rel}  (equals the record's)`);
say(`K = intrinsics(270, 360): f ${g(K[0], 6)}, principal point (${K[2]}, ${K[5]}); the record's "f = 135 / tan 30° = 233.83 px, principal point at the frame's centre" holds`);
say(`exact H, view 0: d_scale ${sig(TRUTH[0].dScale)}, d_orth ${sig(TRUTH[0].dOrth)} (a similarity: 0 under any K)`);
say(`exact H, view 1: d_scale ${sig(TRUTH[1].dScale)}, d_orth ${sig(TRUTH[1].dOrth)} (the record's 0.0084 and 0.031 reproduce to two figures)`);
say();
say("## Step 0: the sweep reproduced");
for (const { name, patchCount } of TARGETS) {
    const c = counts.get(name);
    const losses = Object.entries(c.losses).sort().map(([k, n]) => `${k} ${n}`).join(", ");
    say(`${name} (${patchCount} patches): ${c.steps} steps; ${c.right} right, ${c.wrong} wrong, refused: ${losses || "none"}; fewest inliers on a right fit ${c.minInliers}`);
}
say("shipped: 788 right, no wrong fit, at least 11 inliers: the test's own assertions hold. m2-64: 787 right, 24 wrong: the record's counts hold.");
say();

say("## The 24 wrong fits of M2's 64 patches, by error (px at the 64 patch centres)");
say("gross | seed | view | prediction | error px | inliers | fit rms px | d_scale | d_orth | E");
for (const f of [...wrong64].sort((a, b) => b.error - a.error)) {
    say(`${f.gross ? "gross" : "  -  "} | ${f.seed} | ${f.view} | ${f.label} | ${px(f.error)} | ${f.inliers} | ${px(f.rms)} | ${sig(f.dScale)} | ${sig(f.dOrth)} | ${g(f.E)}`);
}
say(`gross (the record's eight): ${gross.length}; the sixteen: ${sixteen.length}; errors of the sixteen ${px(Math.min(...sixteen.map((f) => f.error)))} to ${px(Math.max(...sixteen.map((f) => f.error)))} px, of the eight ${px(Math.min(...gross.map((f) => f.error)))} to ${px(Math.max(...gross.map((f) => f.error)))} px`);
say();

say("## Distributions of |d_scale|, |d_orth| and E");
function describe(label, xs) {
    say(`${label}: n ${xs.length}; p50 ${g(q(xs, 0.5))}, p90 ${g(q(xs, 0.9))}, p99 ${g(q(xs, 0.99))}, max ${g(Math.max(...xs))}, min ${g(Math.min(...xs))}`);
}
const groups = [];
for (const { name } of TARGETS) {
    for (const v of [0, 1, "both"]) {
        const sel = (f) => f.target === name && (v === "both" || f.view === v);
        groups.push({ label: `${name}, view ${v}`, right: by(right, sel), wrong: by(wrong64, sel) });
    }
}
groups.push({ label: "both targets, both views", right, wrong: wrong64 });
for (const grp of groups) {
    say(`### ${grp.label}`);
    for (const [k, pick] of [["|d_scale|", (f) => abs(f.dScale)], ["|d_orth|", (f) => abs(f.dOrth)], ["E", (f) => f.E]]) {
        describe(`right fits, ${k}`, grp.right.map(pick));
        if (grp.wrong.length) {
            const gr = grp.wrong.filter((f) => f.gross).map(pick);
            const ng = grp.wrong.filter((f) => !f.gross).map(pick);
            if (gr.length) describe(`gross wrong fits, ${k}`, gr);
            if (ng.length) describe(`other wrong fits, ${k}`, ng);
        }
    }
    say(`histogram of right fits, bins ${BINS.slice(0, -1).map((_, i) => binLabel(i)).join(" ")}`);
    for (const [k, pick] of [["|d_scale|", (f) => abs(f.dScale)], ["|d_orth|", (f) => abs(f.dOrth)], ["E", (f) => f.E]]) {
        say(`  ${k}: ${histogram(grp.right.map(pick)).join(" ")}`);
    }
}
say();

// ---- the derivation --------------------------------------------------------------------------
say("## One threshold τ on E = max(|d_scale|, |d_orth|): refuse when E > τ");
say("τ must be at least the largest E over the right fits (none refused) and below the smallest E over the gross fits (all refused).");
function oneThreshold(label, rightSet, grossSet, otherSet) {
    const lo = Math.max(...rightSet.map((f) => f.E));
    const hi = Math.min(...grossSet.map((f) => f.E));
    const loFit = rightSet.find((f) => f.E === lo);
    const hiFit = grossSet.find((f) => f.E === hi);
    const ok = lo < hi;
    say(`### ${label}`);
    say(`  largest right E ${g(lo)} (${loFit.target}, seed ${loFit.seed}, view ${loFit.view}, ${loFit.label}, ${loFit.inliers} inliers)`);
    say(`  smallest gross E ${g(hi)} (seed ${hiFit.seed}, view ${hiFit.view}, ${hiFit.label}, ${px(hiFit.error)} px off)`);
    say(`  separates: ${ok ? "yes" : "no"}; interval [${g(lo)}, ${g(hi)}), width ${g(hi - lo)}, ratio ${g(hi / lo)}`);
    if (ok) {
        const refusedAtLo = otherSet.filter((f) => f.E > lo).length;
        const refusedBelowHi = otherSet.filter((f) => f.E >= hi).length;
        say(`  of the sixteen: ${refusedAtLo} refused at τ = ${g(lo)} (the tightest), ${refusedBelowHi} at every τ in the interval, ${otherSet.length - refusedAtLo} passed at the tightest`);
    } else {
        const rightAbove = rightSet.filter((f) => f.E >= hi).length;
        const grossBelow = grossSet.filter((f) => f.E <= lo).length;
        say(`  at τ = ${g(hi)} minus ε (every gross refused): ${rightAbove} right fits refused; at τ = ${g(lo)} (no right fit refused): ${grossBelow} gross fits passed`);
    }
}
oneThreshold("right fits of both targets, both views", right, gross, sixteen);
oneThreshold("right fits of both targets, view 0 only; gross fits of view 0", by(right, (f) => f.view === 0), by(gross, (f) => f.view === 0), by(sixteen, (f) => f.view === 0));
oneThreshold("right fits of both targets, view 1 only; gross fits of view 1", by(right, (f) => f.view === 1), by(gross, (f) => f.view === 1), by(sixteen, (f) => f.view === 1));
oneThreshold("right fits of the shipped target only (48 patches), both views", by(right, (f) => f.target === "shipped"), gross, sixteen);
oneThreshold("right fits of M2's 64 patches only, both views", by(right, (f) => f.target === "m2-64"), gross, sixteen);
say();

say("## Two thresholds: refuse when |d_scale| > τ_s or |d_orth| > τ_o");
say("The tightest pair the right fits admit is (max right |d_scale|, max right |d_orth|); each gross fit is refused at that pair when it exceeds either, by the larger of its two excesses.");
function twoThresholds(label, rightSet, grossSet, otherSet) {
    const ts = Math.max(...rightSet.map((f) => abs(f.dScale)));
    const to = Math.max(...rightSet.map((f) => abs(f.dOrth)));
    const fs = rightSet.find((f) => abs(f.dScale) === ts);
    const fo = rightSet.find((f) => abs(f.dOrth) === to);
    say(`### ${label}`);
    say(`  τ_s ≥ ${g(ts)} (${fs.target}, seed ${fs.seed}, view ${fs.view}, ${fs.label}); τ_o ≥ ${g(to)} (${fo.target}, seed ${fo.seed}, view ${fo.view}, ${fo.label})`);
    const excess = (f) => Math.max(abs(f.dScale) - ts, abs(f.dOrth) - to);
    const refused = grossSet.filter((f) => excess(f) > 0);
    say(`  gross fits refused at the tightest pair: ${refused.length} of ${grossSet.length}; smallest excess over the pair ${g(Math.min(...grossSet.map(excess)))}, largest ${g(Math.max(...grossSet.map(excess)))}`);
    for (const f of [...grossSet].sort((a, b) => excess(a) - excess(b))) {
        say(`    seed ${f.seed}, view ${f.view}, ${f.label}: |d_scale| ${g(abs(f.dScale))} (${sig(abs(f.dScale) - ts)} over τ_s), |d_orth| ${g(abs(f.dOrth))} (${sig(abs(f.dOrth) - to)} over τ_o)`);
    }
    // How far each threshold can rise with the other at its floor, keeping every gross fit refused.
    const needScale = grossSet.filter((f) => !(abs(f.dOrth) > to)); // not caught by τ_o alone
    const needOrth = grossSet.filter((f) => !(abs(f.dScale) > ts));
    const sCeil = needScale.length ? Math.min(...needScale.map((f) => abs(f.dScale))) : Infinity;
    const oCeil = needOrth.length ? Math.min(...needOrth.map((f) => abs(f.dOrth))) : Infinity;
    say(`  with τ_o at ${g(to)}: τ_s may run over [${g(ts)}, ${g(sCeil)}) (${needScale.length} gross fits are caught only by d_scale there); with τ_s at ${g(ts)}: τ_o over [${g(to)}, ${g(oCeil)}) (${needOrth.length} caught only by d_orth)`);
    const sixteenRefused = otherSet.filter((f) => excess(f) > 0).length;
    say(`  of the sixteen: ${sixteenRefused} refused at the tightest pair, ${otherSet.length - sixteenRefused} passed`);
}
twoThresholds("right fits of both targets, both views", right, gross, sixteen);
twoThresholds("right fits of both targets, view 0 only; gross fits of view 0", by(right, (f) => f.view === 0), by(gross, (f) => f.view === 0), by(sixteen, (f) => f.view === 0));
twoThresholds("right fits of both targets, view 1 only; gross fits of view 1", by(right, (f) => f.view === 1), by(gross, (f) => f.view === 1), by(sixteen, (f) => f.view === 1));
twoThresholds("right fits of the shipped target only (48 patches), both views", by(right, (f) => f.target === "shipped"), gross, sixteen);
say();

say("## The sixteen, beside the eight: where each falls");
say("verdict | seed | view | prediction | error px | |d_scale| | |d_orth| | E | E over the largest right E (both targets)");
const loAll = Math.max(...right.map((f) => f.E));
for (const f of [...wrong64].sort((a, b) => a.E - b.E)) {
    say(`${f.gross ? "gross" : "other"} | ${f.seed} | ${f.view} | ${f.label} | ${px(f.error)} | ${g(abs(f.dScale))} | ${g(abs(f.dOrth))} | ${g(f.E)} | ${sig(f.E - loAll)}`);
}
say();

say("## Beyond the brief: the extremes under other fields of view (K's focal length)");
say("fov | f | largest right E, view 0 | view 1 | both | smallest gross E, view 0 | view 1 | both | one-τ interval width, both views");
for (const fov of [45, 60, 90]) {
    const Kf = jb.intrinsics(CAMERA.width, CAMERA.height, fov);
    const Ki = wf.mat3Inv(Kf);
    const E = (f) => signal(f.H, Ki).E;
    const r0 = Math.max(...by(right, (f) => f.view === 0).map(E));
    const r1 = Math.max(...by(right, (f) => f.view === 1).map(E));
    const g0 = Math.min(...by(gross, (f) => f.view === 0).map(E));
    const g1 = Math.min(...by(gross, (f) => f.view === 1).map(E));
    say(`${fov}° | ${g(Kf[0], 6)} | ${g(r0)} | ${g(r1)} | ${g(Math.max(r0, r1))} | ${g(g0)} | ${g(g1)} | ${g(Math.min(g0, g1))} | ${g(Math.min(g0, g1) - Math.max(r0, r1))}`);
}
say();

say("## Every fit (ok steps), with its identity, the sweep's verdict and the signal");
say("target | seed | view | # | prediction | verdict | error px | inliers | fit rms px | d_scale | d_orth | E");
for (const f of fits) {
    say(`${f.target} | ${f.seed} | ${f.view} | ${f.index} | ${f.label} | ${f.verdict}${f.gross ? " (gross)" : ""} | ${px(f.error)} | ${f.inliers} | ${px(f.rms)} | ${sig(f.dScale)} | ${sig(f.dOrth)} | ${g(f.E)}`);
}

lap("done");
process.stdout.write(out.join("\n") + "\n");
