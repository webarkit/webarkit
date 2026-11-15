/*
 *  2026-11-14-272-stage1-truth.mjs
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
 * #272, M11's Stage 1, question 4 and the levers' synthetic criteria: right and wrong on the ground
 * truth's frames (`packages/nft-tracker/ground-truth/tracker_sequences.ts`, `frameAt`), the
 * shipped target (`examples/targets/pinball.wnft`), ORB. Writes <out>/truth.json; the figures are
 * `2026-11-14-272-stage1-analysis.mjs truth <out>`'s.
 *
 *     npm run build
 *     node --experimental-transform-types docs/benchmarks/2026-11-14-272-stage1-truth.mjs --out <dir> [--seeds 1-8]
 *
 * Every score is `inView(H, T)` (tracker_sequences.ts): the RMS distance, frame px, over the 64
 * measuring points the truth `T` puts inside the 270 × 360 frame. A detection is **right** within
 * 2 px (the maintainer's ruling of 2026-11-14, 2), else **wrong**; the first step's output `H` is
 * scored the same way and recorded beside it.
 *
 * 1. **The scorer, both ways** (as #262's truth script): 0 on the truth; 3, 10, 30 on the truth moved
 *    by those px. Fatal.
 * 2. **The sequences** (one `seededSource(cv).run(SEED, …)` a run, as the ground truth runs them):
 *    wander (40), leaveAndReturn (106), settlePath (80), restPath (60), velocityStep(v) for v = 2,
 *    3, 4, 5, 6, 8, 10 (20 frames). Every lever, on `NftTracker` wired by `instrument`. Fatal: the
 *    `none` arm's states and `H`s equal the ground truth's own `run` on the package's source.
 * 3. **#262's pose grids as short paths**: each pose of the easy, hard and partial grids
 *    (`2026-11-13-262-stage1-truth.mjs`, copied), held (`s` = 0) or moving `s` = 4 or 8 px a frame
 *    to the right, 4 frames, frame `f` of pose `p` rendered with noise seed `1000 · (p + 1) + f`;
 *    every lever, seeds `--seeds` (`seededSource(cv).run(seed, …)` a path).
 * 4. **The stress set**: the hard grid's frame 0 detected stateless at ratios 0.7, 0.75, 0.8, 0.85
 *    and 0.9 (`detectTarget`, `frameRng(seed, p)`), and every accepted detection handed to each
 *    lever's first step on the path's frame 1 (`s` = 0 and 4); V's earlier detection is none here.
 * 5. **The single-step perturbation sweep** (`ground-truth/tracking/track_frame_sweep.ts`, the
 *    shipped configuration's: 137 predictions × 2 views × 5 renders): each lever's first step from
 *    the perturbed prediction, scored as the suite scores it (right within 0.5 px RMS at the
 *    fixture's 64 patch centres, `centreRms`). Fatal: the `none` lever gives the suite's 788 right
 *    fits and no wrong one.
 *
 * Every run is refused (exit 1) if it reads the global `Math.random`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
const nft = await load("packages/nft-tracker/dist/index.js");
const seq = await load("packages/nft-tracker/ground-truth/tracker_sequences.ts");
const sweep = await load("packages/nft-tracker/ground-truth/tracking/track_frame_sweep.ts");
const { seededSource } = await load("packages/nft-tracker/ground-truth/fixtures/seeded_rng.ts");
const warped = await load("packages/nft-tracker/ground-truth/fixtures/warped_frames.ts");
const { frameRng } = await import("../../examples/js/frame-rng.mjs");
const { countGlobalRandomReads } = await import("../../scripts/replay-seeding.mjs");
const { buildArms } = await import("./2026-11-13-262-stage1-probe.mjs");
const { LEVERS, firstStep, instrument, stepOptions, trackTarget } = await import("./2026-11-14-272-stage1-levers.mjs");

function fail(why) {
    console.error(`272-stage1-truth: ${why}`);
    process.exit(1);
}
const outAt = process.argv.indexOf("--out");
const out = outAt > 0 ? process.argv[outAt + 1] : null;
if (!out) fail("--out <dir> is required");
mkdirSync(out, { recursive: true });
const seedsAt = process.argv.indexOf("--seeds");
const seedArg = seedsAt > 0 ? process.argv[seedsAt + 1] : "1-8";
const m = /^(\d+)-(\d+)$/.exec(seedArg);
const SEEDS = m ? Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i) : seedArg.split(",").map(Number);
if (SEEDS.some((s) => !Number.isInteger(s))) fail(`--seeds: ${seedArg}`);

function noGlobalRandom(what, run) {
    const { value, reads } = countGlobalRandomReads(run);
    if (reads !== 0) fail(`${what}: ${reads} read(s) of the global Math.random`);
    return value;
}
const score = (H, T) => (H ? seq.inView(H, T).rms : null);

// 1. The scorer, both ways.
{
    const T = seq.frameAt({ scale: 0.45, angle: 0.3, shift: [5, -3], perspective: [0.0003, 0] }, 0).H;
    const moved = (d) => {
        const H = Float64Array.from(T);
        for (let c = 0; c < 3; c++) H[c] = T[c] + d * T[6 + c];
        return H;
    };
    if (seq.inView(T, T).rms !== 0) fail("scorer: the truth against itself is not 0");
    for (const d of [3, 10, 30]) if (Math.abs(seq.inView(moved(d), T).rms - d) > 1e-9) fail(`scorer: the truth moved ${d} px does not read ${d}`);
    console.error("scorer: 0 on the truth, 3 / 10 / 30 on the truth moved 3 / 10 / 30 px");
}

const arms = await buildArms();
const { cv, target } = arms.orb;
const K = intrinsics(seq.CAMERA.width, seq.CAMERA.height);
const opts = stepOptions({});
const track = trackTarget(target.patches, target.pyramid.scaleStep);

/** One path through one instrumented tracker, seeded as the ground truth's `run`. */
function runPath(lever, path, n, seed, frameIndex = (i) => i) {
    const seeded = seededSource(cv);
    const tracker = new nft.NftTracker(cv, target, K, { rngFor: seeded.rngFor });
    const { log } = instrument(tracker, lever, opts);
    const truths = [];
    const results = seeded.run(seed, () =>
        Array.from({ length: n }, (_, i) => {
            const { frame, H } = seq.frameAt(path(i), frameIndex(i));
            truths.push(H);
            return tracker.process(frame, i * 33);
        }),
    ).value;
    return {
        states: results.map((r) => r.state[0]).join(""),
        frames: results.map((r, i) => ({ state: r.state, ok: r.ok, reason: r.ok ? null : r.reason, score: r.ok ? score(r.H, truths[i]) : null, H: r.ok ? Array.from(r.H) : null })),
        steps: log.steps.map((s) => ({ frame: s.frame, first: s.first, retry: s.retry, ok: s.ok, loss: s.loss, gapFrames: s.gapFrames, startScore: score(Float64Array.from(s.Hstart), truths[s.frame]), outScore: s.H ? score(Float64Array.from(s.H), truths[s.frame]) : null })),
    };
}

const result = { sequences: [], grids: [], stress: [], sweep: [] };

// 2. The sequences.
const SEQS = [
    ["wander", seq.wander, 40],
    ["leaveAndReturn", seq.leaveAndReturn, 106],
    ["settlePath", seq.settlePath, 80],
    ["restPath", seq.restPath, 60],
    ...[2, 3, 4, 5, 6, 8, 10].map((v) => [`velocityStep(${v})`, seq.velocityStep(v), 20]),
];
for (const [name, path, n] of SEQS) {
    const reference = noGlobalRandom(`reference ${name}`, () => seq.run(cv, K, target, path, n));
    for (const lever of LEVERS) {
        const r = noGlobalRandom(`sequence ${name} ${lever}`, () => runPath(lever, path, n, seq.SEED));
        if (lever === "none") {
            if (r.states !== reference.states) fail(`${name}: the none arm's states ${r.states} differ from the ground truth's ${reference.states}`);
            reference.results.forEach((x, i) => {
                const a = x.ok ? Array.from(x.H) : null;
                if (JSON.stringify(a) !== JSON.stringify(r.frames[i].H)) fail(`${name}: frame ${i}'s H differs from the ground truth's`);
            });
        }
        result.sequences.push({ name, lever, n, ...r, detections: r.frames.map((f, i) => (f.state === "DETECT" ? i : null)).filter((x) => x !== null) });
    }
    console.error(`truth: ${name} done`);
}

// 3. #262's grids, as short paths (the poses copied from 2026-11-13-262-stage1-truth.mjs).
const deg = Math.PI / 180;
const poses = [];
for (const scale of [0.3, 0.45, 0.6]) for (const a of [0, 45, 90, 135, 180]) for (const perspective of [[0, 0], [0.0008, 0], [0, 0.0008]]) poses.push({ grid: "easy", scale, angle: a * deg, shift: [0, 0], perspective });
for (const scale of [0.12, 0.18, 0.25]) for (const a of [0, 60, 150]) for (const perspective of [[0.0015, 0], [0, 0.0025], [0.0025, 0.0015]]) poses.push({ grid: "hard", scale, angle: a * deg, shift: [0, 0], perspective });
for (const scale of [0.45, 0.6]) for (const a of [0, 90]) for (const shift of [[110, 0], [-110, 0], [0, 150], [150, 120]]) poses.push({ grid: "partial", scale, angle: a * deg, shift, perspective: [0.0008, 0] });
const SPEEDS = [0, 4, 8];
const pathOf = (pose, s) => (i) => ({ ...pose, shift: [pose.shift[0] + s * i, pose.shift[1]] });
poses.forEach((pose, p) => {
    for (const s of SPEEDS)
        for (const seed of SEEDS)
            for (const lever of LEVERS) {
                const r = noGlobalRandom(`grid ${p} ${s} ${seed} ${lever}`, () => runPath(lever, pathOf(pose, s), 4, seed, (i) => 1000 * (p + 1) + i));
                result.grids.push({ grid: pose.grid, pose: p, speed: s, seed, lever, states: r.states, frames: r.frames.map((f) => ({ state: f.state, score: f.score })), steps: r.steps });
            }
});
console.error("truth: grids done");

// 4. The stress set: the hard grid's detections at every ratio, each lever's first step on frame 1.
for (const ratio of [0.7, 0.75, 0.8, 0.85, 0.9]) {
    const setup = nft.prepareDetection(cv, target, { ratio });
    poses.forEach((pose, p) => {
        if (pose.grid !== "hard") return;
        for (const s of [0, 4]) {
            const f0 = seq.frameAt(pathOf(pose, s)(0), 1000 * (p + 1));
            const f1 = seq.frameAt(pathOf(pose, s)(1), 1000 * (p + 1) + 1);
            for (const seed of SEEDS) {
                const d = noGlobalRandom(`stress ${p}`, () => nft.detectTarget(cv, setup, f0.frame, 0, frameRng(seed, p)));
                if (!d.ok) continue;
                const levers = {};
                for (const lever of ["none", "V", "R1", "R2", "R3", "S"]) {
                    const { r } = noGlobalRandom(`stress step ${p} ${lever}`, () => firstStep(lever, f1.frame, track, { Hdet: d.H, Hprev: null, corr: d.correspondences }, opts));
                    levers[lever] = { ok: r.ok, loss: r.ok ? null : r.loss, outScore: r.ok ? score(r.H, f1.H) : null };
                }
                result.stress.push({ ratio, pose: p, speed: s, seed, detScore: score(d.H, f0.H), detScoreOnStepFrame: score(d.H, f1.H), inliers: d.numInliers, levers });
            }
        }
    });
}
console.error("truth: stress done");

// 5. The perturbation sweep, per lever.
{
    const errors = sweep.shippedSweepErrors();
    if (errors.length !== 137) fail(`sweep: ${errors.length} predictions, not 137`);
    for (const lever of ["none", "R1", "R2", "R3"]) {
        let right = 0;
        const wrong = [];
        let refused = 0;
        for (let s = 1; s <= 5; s++) {
            // As shippedSweep: seed, then view, then prediction; the patches are pinball.wnft's, the
            // options the tracker's defaults.
            for (const H of sweep.VIEWS) {
                const frame = warped.renderWarp(sweep.image, H, { ...sweep.RENDER, seed: s });
                for (const E of errors) {
                    const { r } = firstStep(lever, frame, track, { Hdet: sweep.about(E, H), Hprev: null, corr: null }, opts);
                    if (!r.ok) refused++;
                    else if (sweep.centreRms(r.H, H) < 0.5) right++;
                    else wrong.push(sweep.centreRms(r.H, H));
                }
            }
        }
        if (lever === "none" && (right !== 788 || wrong.length !== 0)) fail(`sweep: the none lever gives ${right} right and ${wrong.length} wrong, not the suite's 788 and 0`);
        result.sweep.push({ lever, steps: 1370, right, wrong, refused });
        console.error(`truth: sweep ${lever} done`);
    }
}

writeFileSync(join(out, "truth.json"), JSON.stringify(result));
console.error(`wrote ${join(out, "truth.json")}`);
