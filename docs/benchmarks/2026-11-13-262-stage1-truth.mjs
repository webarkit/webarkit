/*
 *  2026-11-13-262-stage1-truth.mjs
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
 * #262, M10's Stage 1, question 1: can this repository score a detection's `H` as right or wrong?
 * On the ground truth's synthetic frames (`packages/nft-tracker/ground-truth/tracker_sequences.ts`,
 * `frameAt`: the target fixture warped by a known `H`, blurred, noised, its exposure drifting),
 * each arm's detections are scored against the true `H`. Writes <out>/truth.json; the figures are
 * printed by `2026-11-13-262-stage1-analysis.mjs truth <out>`.
 *
 *     npm run build
 *     node --experimental-transform-types docs/benchmarks/2026-11-13-262-stage1-truth.mjs --out <dir>
 *
 * The score of a detection `H` against the truth `T` is `inView(H, T)` (tracker_sequences.ts): the
 * RMS and the worst distance, frame px, between where `H` and `T` put the target's 64 patch
 * centres, over the centres `T` puts inside the 270 × 360 frame.
 *
 * Parts 2 and 3 per arm (ORB, TEBLID-256) and per ratio 0.7, 0.75, 0.8, 0.85, 0.9; part 4 at the
 * tracker's default 0.8. RANSAC seeded `frameRng(seed, i)`:
 * 1. **The scorer, both ways**: `T` against itself, 0; `T` translated by 3, 10 and 30 px, those.
 *    Fatal before any figure if it does not respond.
 * 2. **The pose grid, stateless** (`detectTarget` on single frames): scale 0.30, 0.45, 0.60; roll
 *    0°, 45°, 90°, 135°, 180°; perspective none, (0.0008, 0) and (0, 0.0008); 45 poses, frame
 *    index `i` its noise seed, seeds 1 to 8 ("easy"); then "hard": scale 0.12, 0.18, 0.25, roll 0°,
 *    60°, 150°, perspective (0.0015, 0), (0, 0.0025), (0.0025, 0.0015); and "partial": scale 0.45
 *    and 0.6, roll 0° and 90°, perspective (0.0008, 0), the target shifted (±110, 0), (0, 150) or
 *    (150, 120) px, partly out of the frame.
 * 3. **Frames with no target**: the target shifted 600 px out of the frame (`renderWarp`'s fill and
 *    noise only), 20 frames, seeds 1 to 8: every accepted detection there is wrong by definition.
 * 4. **The tracker's sequences** (`run`, one `mulberry32(SEED)` a run, as the ground truth runs
 *    them): leaveAndReturn (106 frames) and wander (40), each arm on its own target; every frame's
 *    state, `H` where it has one, and the score.
 *
 * Every run is refused (exit 1) if it reads the global `Math.random`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// A `.js` specifier in the ground truth's TypeScript resolves to its `.ts` (as the references script does).
registerHooks({
    resolve(specifier, context, next) {
        try {
            return next(specifier, context);
        } catch (e) {
            const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
            if (e?.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) {
                return next(`${specifier.slice(0, -3)}.ts`, context);
            }
            throw e;
        }
    },
});

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
const nft = await load("packages/nft-tracker/dist/index.js");
const seq = await load("packages/nft-tracker/ground-truth/tracker_sequences.ts");
const { frameRng } = await import("../../examples/js/frame-rng.mjs");
const { countGlobalRandomReads } = await import("../../scripts/replay-seeding.mjs");
const { buildArms } = await import("./2026-11-13-262-stage1-probe.mjs");

function fail(why) {
    console.error(`262-stage1-truth: ${why}`);
    process.exit(1);
}
const outAt = process.argv.indexOf("--out");
const out = outAt > 0 ? process.argv[outAt + 1] : null;
if (!out) fail("--out <dir> is required");
mkdirSync(out, { recursive: true });

function noGlobalRandom(what, run) {
    const { value, reads } = countGlobalRandomReads(run);
    if (reads !== 0) fail(`${what}: ${reads} read(s) of the global Math.random`);
    return value;
}

const translate = (T, dx) => {
    // T' = [1 0 dx; 0 1 0; 0 0 1] · T
    const H = Float64Array.from(T);
    for (let c = 0; c < 3; c++) H[c] = T[c] + dx * T[6 + c];
    return H;
};

// 1. The scorer, both ways.
{
    const T = seq.frameAt({ scale: 0.45, angle: 0.3, shift: [5, -3], perspective: [0.0003, 0] }, 0).H;
    const self = seq.inView(T, T);
    if (self.rms !== 0 || self.max !== 0) fail(`scorer: T against itself ${self.rms}`);
    for (const d of [3, 10, 30]) {
        const s = seq.inView(translate(T, d), T);
        if (Math.abs(s.rms - d) > 1e-9 || Math.abs(s.max - d) > 1e-9) fail(`scorer: T moved ${d} px reads ${s.rms}`);
    }
    console.error("scorer: 0 on the truth, 3 / 10 / 30 on the truth moved 3 / 10 / 30 px");
}

const arms = await buildArms();
const K = intrinsics(seq.CAMERA.width, seq.CAMERA.height);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const deg = Math.PI / 180;
const RATIOS = [0.7, 0.75, 0.8, 0.85, 0.9];
const poses = [];
// The easy grid (part 2), then the hard one (part 2b): small scales, strong perspective, the target
// partly out of the frame, so that acceptance drops and an accepted H can be wrong.
for (const scale of [0.3, 0.45, 0.6])
    for (const a of [0, 45, 90, 135, 180])
        for (const perspective of [[0, 0], [0.0008, 0], [0, 0.0008]]) poses.push({ grid: "easy", scale, angle: a * deg, shift: [0, 0], perspective });
for (const scale of [0.12, 0.18, 0.25])
    for (const a of [0, 60, 150])
        for (const perspective of [[0.0015, 0], [0, 0.0025], [0.0025, 0.0015]]) poses.push({ grid: "hard", scale, angle: a * deg, shift: [0, 0], perspective });
for (const scale of [0.45, 0.6])
    for (const a of [0, 90])
        for (const shift of [[110, 0], [-110, 0], [0, 150], [150, 120]]) poses.push({ grid: "partial", scale, angle: a * deg, shift, perspective: [0.0008, 0] });

const result = { poses: [], negatives: [], sequences: [] };
for (const [armName, arm] of Object.entries(arms)) {
  for (const ratio of RATIOS) {
    const setup = nft.prepareDetection(arm.cv, arm.target, { ratio });
    // 2. The pose grid.
    poses.forEach((pose, i) => {
        const { frame, H: T } = seq.frameAt(pose, i);
        for (const seed of SEEDS) {
            const d = noGlobalRandom(`grid ${armName} ${i} ${seed}`, () => nft.detectTarget(arm.cv, setup, frame, i * 33, frameRng(seed, i)));
            result.poses.push({
                arm: armName,
                ratio,
                grid: pose.grid,
                shift: pose.shift,
                pose: i,
                scale: pose.scale,
                angleDeg: Math.round(pose.angle / deg),
                perspective: pose.perspective,
                seed,
                ok: d.ok,
                reason: d.ok ? null : d.reason,
                numMatches: d.numMatches,
                numInliers: d.numInliers,
                score: d.ok ? seq.inView(d.H, T) : null,
            });
        }
    });
    // 3. No target in the frame.
    for (let i = 0; i < 20; i++) {
        const { frame } = seq.frameAt({ scale: 0.45, angle: 0, shift: [600, 0] }, 1000 + i);
        for (const seed of SEEDS) {
            const d = noGlobalRandom(`negative ${armName} ${i} ${seed}`, () => nft.detectTarget(arm.cv, setup, frame, i * 33, frameRng(seed, 1000 + i)));
            result.negatives.push({ arm: armName, ratio, frame: i, seed, ok: d.ok, reason: d.ok ? null : d.reason, numMatches: d.numMatches, numInliers: d.numInliers });
        }
    }
  }
    // 4. The tracker's sequences, at the tracker's default ratio.
    for (const [name, path, n] of [
        ["leaveAndReturn", seq.leaveAndReturn, 106],
        ["wander", seq.wander, 40],
    ]) {
        const r = noGlobalRandom(`sequence ${armName} ${name}`, () => seq.run(arm.cv, K, arm.target, path, n));
        result.sequences.push({
            arm: armName,
            name,
            states: r.states,
            frames: r.results.map((x, i) => ({
                state: x.state,
                ok: x.ok,
                numInliers: x.numInliers,
                score: x.ok ? seq.inView(x.H, r.truths[i]) : null,
            })),
        });
    }
    console.error(`truth: ${armName} done`);
}
writeFileSync(join(out, "truth.json"), JSON.stringify(result));
console.error(`wrote ${join(out, "truth.json")}`);
