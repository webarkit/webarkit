/*
 *  2026-11-01-202-stage3-p.mjs
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
 * #202's Stage 3 prediction P, parts (a) and (c), on the "device scaled step, sync" arm
 * (2026-11-01-202-stage3-registration.md, P, and "How each is read, as commands"). Results:
 * 2026-11-01-202-stage3-addendum.md.
 *
 *     node docs/benchmarks/2026-11-01-202-stage3-p.mjs <root> --base-head <sha> --tip-head <sha>
 *
 * <root>/{A,tip,B}/s<n>/replay-<clip>-tracking-device-scaled-step-sync.json, seeds 1 to 8:
 * A and B are the control and its repeat at the base, tip the candidate at the implementation.
 * Each export is checked before it is read: its seed, its schedule, its clip, and its package
 * source (the provenance manifest's bundle from a clean tree, built at the head its run names).
 * A missing export, or one that fails a check, refuses the whole reading, exit 2.
 *
 * On the counted loops (countedLoopFrames, loops 1 to 4, over the export's frames and its
 * clipDurationS), per clip and seed:
 * - (a) the DETECT frames with corners null (mixed-w), with mirrored corners (reversed), and with
 *   corners of zero signed area, against the target's corners (0, 0), (w − 1, 0),
 *   (w − 1, h − 1), (0, h − 1), counted apart, for the candidate and for A;
 * - (c) the frames with ok, and with corners not null, for the candidate and for A.
 * Beside them, no verdict: stepMs and runSummary.trackTimeShare.share for A, the candidate and B,
 * and every figure of (a) or (c) where A and B differ.
 *
 * Verdicts, as registered: (a) refuted by any such candidate frame; its GW half (corners null)
 * void on a clip where A has none on any seed, its GM half (mirrored) void on a clip where A has
 * none on any seed. (c) refuted by one candidate seed whose ok differs from its with corners; void
 * on a clip where A's ok equals its with corners on every seed.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-01-202-stage3-p.mjs";
function refuse(why) {
    process.stderr.write(`${SCRIPT}: refused: ${why}\n`);
    process.exit(2);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { countedLoopFrames } = await import(pathToFileURL(join(ROOT, "examples/js/bench-loops.mjs")).href);

const argv = process.argv.slice(2);
const arg = (name) => {
    const i = argv.indexOf(name);
    if (i < 0 || !/^[0-9a-f]{40}$/.test(argv[i + 1] ?? "")) refuse(`${name} <40-hex head> is required`);
    return argv[i + 1];
};
const DIR = argv[0];
if (!DIR || DIR.startsWith("--")) refuse("<root> is required");
const HEADS = { A: arg("--base-head"), tip: arg("--tip-head"), B: arg("--base-head") };
if (HEADS.A === HEADS.tip) refuse("--base-head and --tip-head are the same commit: the runs could not be told apart");
const CLIPS = ["pinball-static", "pinball-bench", "pinball-bench-table"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const RUNS = ["A", "tip", "B"];
const SCHEDULE = "device scaled step, sync";

const signedArea = (pts) => {
    let a = 0;
    for (let c = 0; c < pts.length; c++) {
        const [x0, y0] = pts[c];
        const [x1, y1] = pts[(c + 1) % pts.length];
        a += x0 * y1 - x1 * y0;
    }
    return a / 2;
};

function load(run, seed, clip) {
    const path = join(DIR, run, `s${seed}`, `replay-${clip}-tracking-device-scaled-step-sync.json`);
    if (!existsSync(path)) refuse(`${path}: missing`);
    let e;
    try {
        e = JSON.parse(readFileSync(path, "utf8"));
    } catch {
        refuse(`${path}: not JSON`);
    }
    if (e.seed !== seed) refuse(`${path}: seed ${e.seed}, expected ${seed}`);
    if (e.schedule !== SCHEDULE) refuse(`${path}: schedule ${JSON.stringify(e.schedule)}, expected ${SCHEDULE}`);
    if (e.bundledClip !== `${clip}.mp4`) refuse(`${path}: clip ${e.bundledClip}, expected ${clip}.mp4`);
    const ps = e.packageSource ?? {};
    if (ps.packages !== "bundle" || typeof ps.bundleSha256 !== "string" || ps.bundleSha256 !== ps.manifestBundleSha256 || ps.manifestClean !== true) refuse(`${path}: its package source is not the manifest's bundle from a clean tree`);
    if (ps.manifestHead !== HEADS[run]) refuse(`${path}: built at ${ps.manifestHead}, run ${run} expects ${HEADS[run]}`);
    if (!Array.isArray(e.frames) || !(e.clipDurationS > 0) || !(e.target?.widthPx > 0 && e.target?.heightPx > 0)) refuse(`${path}: no frames, clipDurationS or target size`);
    return e;
}
function read(e) {
    const counted = countedLoopFrames(e.frames, { clipDurationS: e.clipDurationS, firstLoop: 1, loopCount: 4 });
    if (counted.length === 0) refuse(`${e.bundledClip}, seed ${e.seed}: no frame in the counted loops`);
    const { widthPx: w, heightPx: h } = e.target;
    const ref = Math.sign(signedArea([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]));
    const det = counted.filter((f) => f.state === "DETECT");
    let mirrored = 0;
    let zero = 0;
    for (const f of det) {
        if (f.corners === null) continue;
        const a = signedArea(f.corners);
        if (a === 0) zero++;
        else if (Math.sign(a) !== ref) mirrored++;
    }
    return {
        nullCorners: det.filter((f) => f.corners === null).length,
        mirrored,
        zero,
        ok: counted.filter((f) => f.ok).length,
        corners: counted.filter((f) => f.corners !== null).length,
        frames: counted.length,
        stepMs: e.stepMs,
        tts: e.runSummary?.trackTimeShare?.share ?? null,
    };
}

// Every export is checked before any figure is printed.
const R = {};
for (const clip of CLIPS) for (const seed of SEEDS) for (const run of RUNS) R[`${clip}|${seed}|${run}`] = read(load(run, seed, clip));

const fx = (v, d) => (typeof v === "number" ? v.toFixed(d) : String(v));
const verdicts = [];
for (const clip of CLIPS) {
    console.log(`## ${clip}`);
    console.log("| seed | run | counted frames | (a) DETECT corners null | mirrored | zero area | (c) ok | with corners | stepMs | trackTimeShare |");
    console.log("|---|---|---|---|---|---|---|---|---|---|");
    for (const seed of SEEDS) {
        for (const run of RUNS) {
            const r = R[`${clip}|${seed}|${run}`];
            console.log(`| s${seed} | ${run} | ${r.frames} | ${r.nullCorners} | ${r.mirrored} | ${r.zero} | ${r.ok} | ${r.corners} | ${fx(r.stepMs, 4)} | ${fx(r.tts, 4)} |`);
        }
        const a = R[`${clip}|${seed}|A`];
        const b = R[`${clip}|${seed}|B`];
        const d = ["nullCorners", "mirrored", "zero", "ok", "corners"].filter((k) => a[k] !== b[k]);
        if (d.length) console.log(`A and B differ on s${seed}: ${d.map((k) => `${k} ${a[k]} / ${b[k]}`).join(", ")}`);
    }
    const at = (run, f) => SEEDS.map((s) => f(R[`${clip}|${s}|${run}`]));
    const sum = (xs) => xs.reduce((x, y) => x + y, 0);
    const gwSeen = sum(at("A", (r) => r.nullCorners)) > 0;
    const gmSeen = sum(at("A", (r) => r.mirrored)) > 0;
    const gwTip = sum(at("tip", (r) => r.nullCorners));
    const gmTip = sum(at("tip", (r) => r.mirrored));
    const zeroTip = sum(at("tip", (r) => r.zero));
    const gw = gwTip > 0 || zeroTip > 0 ? "refuted" : gwSeen ? "held" : "void";
    const gm = gmTip > 0 || zeroTip > 0 ? "refuted" : gmSeen ? "held" : "void";
    const cSeen = at("A", (r) => r.ok !== r.corners).some(Boolean);
    const cTip = at("tip", (r) => r.ok !== r.corners).filter(Boolean).length;
    const c = cTip > 0 ? "refuted" : cSeen ? "held" : "void";
    const line = `${clip}: (a) GW half ${gw} (candidate corners null ${gwTip}, zero area ${zeroTip}; control corners null on ${at("A", (r) => r.nullCorners > 0).filter(Boolean).length} of 8 seeds); (a) GM half ${gm} (candidate mirrored ${gmTip}; control mirrored on ${at("A", (r) => r.mirrored > 0).filter(Boolean).length} of 8 seeds); (c) ${c} (candidate seeds with ok ≠ with corners ${cTip}; control ${at("A", (r) => r.ok !== r.corners).filter(Boolean).length} of 8)`;
    verdicts.push(line);
    console.log("");
}
for (const v of verdicts) console.log(v);
