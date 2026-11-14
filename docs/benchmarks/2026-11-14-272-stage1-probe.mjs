/*
 *  2026-11-14-272-stage1-probe.mjs
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
 * #272, M11's Stage 1: the first tracking step after a detection, on seeded desktop replays of the
 * bundled clips. A probe, not campaign data (docs/benchmarks/step-protocol.md, Stage 1). Writes one
 * JSON per run into <out>; prints no figure. The figures are `2026-11-14-272-stage1-analysis.mjs`'s.
 *
 *     npm run build
 *     node docs/benchmarks/2026-11-14-272-stage1-probe.mjs runs --out <dir> [--schedule every|device-15|device-25] [--clips table,wall] [--seeds 1-8] [--levers none,V,R1,R2,R3,S,T] [--mirror]
 *     node docs/benchmarks/2026-11-14-272-stage1-probe.mjs ladder --out <dir> [--schedule …] [--clips …] [--seeds …]
 *     node docs/benchmarks/2026-11-14-272-stage1-probe.mjs patches --out <dir> [--schedule …] [--clips …] [--seeds …]
 *     node docs/benchmarks/2026-11-14-272-stage1-probe.mjs population --out <dir> [--clips …] [--seeds …]
 *     node docs/benchmarks/2026-11-14-272-stage1-probe.mjs stress --out <dir> [--clips …] [--seeds …] [--ratios 0.7,0.75,0.8,0.85,0.9]
 *
 * ffmpeg and ffprobe on PATH. The clips are decoded by #262's `loadClip`
 * (`2026-11-13-262-stage1-probe.mjs`), the ORB arm built by its `buildArms`, and #262's
 * `check-orb` mode gates the shipped arm against this machine's R-replay (the probe file says how).
 *
 * - **runs**: per clip, lever and seed, `NftTracker` (ORB, `pinball.wnft`, options `{ ratio: 0.8 }`)
 *   with the lever wired in by `instrument` (`2026-11-14-272-stage1-levers.mjs`), over two loops on
 *   the replay's schedule. The schedule loop is `scripts/replay-run.mjs`'s `replayRun`, copied with
 *   one term added: a step's extra alignment (R3's wide pass) is charged `stepMs` more on a device
 *   schedule. Fatal checks: the `none` arm equals `replayRun` with `NftTracker` frame for frame
 *   (every frame key but `timings` and `trackerTimings`), and every lever arm's first frame that
 *   differs from the `none` arm is a frame on which the lever arm ran a first step. Each file holds
 *   the frame records (`frameRecord`'s) and every tracking step the tracker ran (`log.steps`).
 *   With `--mirror` the frames are mirrored left to right (files `mirror-*.json`): every lock is wrong.
 * - **ladder**: for every first step of the `none` arm's runs, the detection recomputed on its frame
 *   (`detectTarget`, `frameRng(seed, pts[i])`; fatally equal to the run's `H`), then `trackFrame`
 *   from it on the clip's frames `i + L`, L = 0 … 5 (within the clip), and on the frame the run
 *   stepped on (its own lag; fatally equal to the run's verdict). Paired levers: each lever's first
 *   step on that same frame from that same detection (V with the chain's earlier detection, S its
 *   refit, T a second step on the run's next processed frame when the run's re-detection failed).
 * - **patches**: every step of the `none` arm's runs re-run patch by patch (`preparePatch`,
 *   `alignPrepared`), each outcome fatally equal to the step's; an unconverged patch is re-aligned
 *   with the cap doubled: the same observation means the cap did not bind (an edge), another means
 *   it did (the cap).
 * - **population**: every frame of one loop detected stateless (`detectTarget`, `frameRng(seed,
 *   pts[i])`), and from every accepted detection the shipped first step on the next frame: the
 *   selection effect's population.
 * - **stress**: #262's mirrored frames, every frame of one loop, at each ratio: every accepted
 *   detection is wrong, and each lever's first step from it on the next mirrored frame is a wrong
 *   acceptance if it confirms.
 *
 * Every run is refused (exit 1) if it reads the global `Math.random`.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { frameRecord, targetCorners, nextFrameIndex } from "../../examples/js/bench-metrics.mjs";
import { frameRng } from "../../examples/js/frame-rng.mjs";
import { replayRun, loopTimes } from "../../scripts/replay-run.mjs";
import { countGlobalRandomReads, runSeeding } from "../../scripts/replay-seeding.mjs";
import { buildArms, loadClip } from "./2026-11-13-262-stage1-probe.mjs";
import { LEVERS, firstStep, instrument, stepOptions, trackFrame, trackTarget, PatchOutcome } from "./2026-11-14-272-stage1-levers.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
const nft = await load("packages/nft-tracker/dist/index.js");
const { preparePatch, alignPrepared } = await load("packages/nft-tracker/dist/tracking/align_patch.js");

const LOOPS = 2;
const RATIO = 0.8;
/** Copied from `2026-11-13-262-stage1-probe.mjs` (not exported there), which copied `scripts/replay-clips.mjs`. */
const DEVICE_ACQUIRE_MS = { static: 36.9, wall: 20.4, table: 41.0, cross: 36.9 };
const DEVICE_DETECT_MS = 83.2;
const SCHEDULES = { every: null, "device-15": 15, "device-25": 25 };
const LADDER = [0, 1, 2, 3, 4, 5];

function fail(why) {
    console.error(`272-stage1-probe: ${why}`);
    process.exit(1);
}
function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i < 0) return fallback;
    const v = process.argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(`${name} needs a value`);
    return v;
}
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
function seedList(s) {
    const m = /^(\d+)-(\d+)$/.exec(s);
    if (m) return Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i);
    return list(s).map((x) => {
        if (!/^\d+$/.test(x)) fail(`--seeds: ${x}`);
        return +x;
    });
}
function noGlobalRandom(what, run) {
    const { value, reads } = countGlobalRandomReads(run);
    if (reads !== 0) fail(`${what}: ${reads} read(s) of the global Math.random`);
    return value;
}
function mirrored(f) {
    const data = new Uint8Array(f.data.length);
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) data[y * f.width + x] = f.data[y * f.width + (f.width - 1 - x)];
    return { data, width: f.width, height: f.height };
}
const strip = (fr) => {
    const { timings, trackerTimings, ...rest } = fr;
    return JSON.stringify(rest);
};

/**
 * Held steps unchanged by construction: the first frame of a lever arm that differs from the none
 * arm must be one on which the lever arm ran a first step. `null` when it is, else why not.
 */
export function divergenceRefusal(run, none) {
    const n = Math.min(run.records.length, none.records.length);
    let d = -1;
    for (let i = 0; i < n; i++) {
        if (strip(run.records[i]) !== strip(none.records[i])) {
            d = i;
            break;
        }
    }
    if (d < 0 && run.records.length !== none.records.length) d = n;
    if (d < 0) return null;
    if (run.steps.some((s) => s.frame === d && s.first)) return null;
    // On a device schedule a first step charged extra alignment (R3) moves the next processed frame
    // itself: the arms then first differ on the frame after it, by its media time, with no held step
    // between. Allowed only there: the frame before is a charged first step and the records agree on it.
    const charged = run.steps.some((s) => s.frame === d - 1 && s.first && s.extraSteps > 0);
    const movedOnly = d > 0 && d < run.records.length && d < none.records.length && run.records[d].mediaTimeSeconds !== none.records[d].mediaTimeSeconds;
    if (charged && movedOnly) return null;
    return `first divergence from the none arm at frame ${d}, where this arm ran no first step`;
}

function selfTest() {
    const fails = [];
    const T = (n, ok) => ok || fails.push(n);
    const fr = (state, H = null) => ({ state, H, timings: { x: 1 }, trackerTimings: null });
    const none = { records: [fr("DETECT", [1]), fr("TRACK", [2]), fr("TRACK", [3])], steps: [] };
    const atFirst = { records: [fr("DETECT", [1]), fr("LOST"), fr("DETECT", [4])], steps: [{ frame: 1, first: true }] };
    const atHeld = { records: [fr("DETECT", [1]), fr("TRACK", [2]), fr("DETECT", [9])], steps: [{ frame: 1, first: true }, { frame: 2, first: false }] };
    T("divergence on a first-step frame passes", divergenceRefusal(atFirst, none) === null);
    T("divergence on a held-step frame is refused", divergenceRefusal(atHeld, none) !== null);
    T("no divergence passes", divergenceRefusal(none, none) === null);
    T("timings alone are not a divergence", divergenceRefusal({ ...none, records: none.records.map((r) => ({ ...r, timings: { x: 2 } })) }, none) === null);
    T("a shorter run diverges where it ends", divergenceRefusal({ records: none.records.slice(0, 2), steps: [] }, none) !== null);
    const ft = (state, H, t) => ({ ...fr(state, H), mediaTimeSeconds: t });
    const sched = { records: [ft("DETECT", [1], 0), ft("TRACK", [2], 0.04), ft("TRACK", [3], 0.08)], steps: [] };
    const moved = (extra) => ({ records: [ft("DETECT", [1], 0), ft("TRACK", [2], 0.04), ft("TRACK", [3], 0.12)], steps: [{ frame: 1, first: true, extraSteps: extra }] });
    T("a frame moved by a charged first step on the frame before passes", divergenceRefusal(moved(1), sched) === null);
    T("a frame moved after an uncharged first step is refused", divergenceRefusal(moved(0), sched) !== null);
    const changed = { records: [ft("DETECT", [1], 0), ft("TRACK", [2], 0.04), ft("TRACK", [9], 0.08)], steps: [{ frame: 1, first: true, extraSteps: 1 }] };
    T("a held step changed on the same frame after a charged first step is refused", divergenceRefusal(changed, sched) !== null);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

/**
 * `replayRun`'s loop (scripts/replay-run.mjs), copied, on an instrumented tracker; one term added to
 * the busy time: `extraSteps × stepMs` for the frame's extra alignment.
 */
function leverRun({ arm, clip, K, targetPoints, stepMs, lever, seed }) {
    const seeding = runSeeding(seed, "frame");
    const tracker = new nft.NftTracker(arm.cv, arm.target, K, { ratio: RATIO, clock: () => performance.now(), rngFor: seeding.rngFor });
    const { log } = instrument(tracker, lever, stepOptions({ ratio: RATIO }));
    const records = [];
    const times = loopTimes(clip.pts, LOOPS);
    for (let k = 0; k < times.length; ) {
        const i = k % clip.pts.length;
        seeding.frame(clip.pts[i]);
        const before = log.steps.length;
        const result = tracker.process(clip.frames[i], clip.pts[i] * 1000);
        records.push(frameRecord({ mode: "tracking", result, stageTimings: {}, timestampMs: clip.pts[i] * 1000, mediaTimeSeconds: clip.pts[i], targetPoints, K }));
        if (stepMs === null) {
            k++;
            continue;
        }
        const extra = log.steps.slice(before).reduce((s, e) => s + e.extraSteps, 0);
        const busy = DEVICE_ACQUIRE_MS[clip.name] + (result.tracking ? stepMs : 0) + extra * stepMs + (result.state === "TRACK" ? 0 : DEVICE_DETECT_MS);
        k = nextFrameIndex(times, k, busy);
    }
    return { records, steps: log.steps };
}

function runsMode(out, clips, seeds, levers, scheduleName, mirror) {
    if (!(scheduleName in SCHEDULES)) fail(`--schedule: ${scheduleName}`);
    for (const l of levers) if (!LEVERS.includes(l)) fail(`--levers: ${l}`);
    if (!levers.includes("none")) fail("--levers must include none: every lever arm is checked against it");
    const stepMs = SCHEDULES[scheduleName];
    return (arms) => {
        const arm = arms.orb;
        const targetPoints = targetCorners(arm.target.meta.widthPx, arm.target.meta.heightPx);
        for (const clipName of clips) {
            const clip = { ...loadClip(clipName), name: clipName };
            if (mirror) clip.frames = clip.frames.map(mirrored);
            const K = intrinsics(clip.width, clip.height);
            for (const seed of seeds) {
                const what = (l) => `${mirror ? "mirror " : ""}${clipName} ${l} seed ${seed} ${scheduleName}`;
                // The shipped arm, as #262's ORB arm: replayRun on NftTracker.
                const shipped = noGlobalRandom(what("replayRun"), () =>
                    replayRun({ NftTracker: nft.NftTracker, cv: arm.cv, target: arm.target, targetPoints, detectMs: DEVICE_DETECT_MS, frames: clip.frames, pts: clip.pts, K, mode: "tracking", stepMs, order: null, options: { ratio: RATIO }, probe: null, loops: LOOPS, acquireMs: DEVICE_ACQUIRE_MS[clipName], unwrapped: false, seeding: runSeeding(seed, "frame") }),
                );
                let none = null;
                for (const lever of ["none", ...levers.filter((l) => l !== "none")]) {
                    const run = noGlobalRandom(what(lever), () => leverRun({ arm, clip, K, targetPoints, stepMs, lever, seed }));
                    if (lever === "none") {
                        if (run.records.length !== shipped.length) fail(`${what(lever)}: ${run.records.length} frames, replayRun ${shipped.length}`);
                        run.records.forEach((f, i) => {
                            if (strip(f) !== strip(shipped[i])) fail(`${what(lever)}: frame ${i} differs from replayRun's`);
                        });
                        none = run;
                    } else {
                        const why = divergenceRefusal(run, none);
                        if (why) fail(`${what(lever)}: ${why}`);
                    }
                    const doc = { kind: "272-stage1-run", clip: clipName, file: clip.file, size: [clip.width, clip.height], lever, seed, seedPolicy: "frame", ratio: RATIO, scheduleName, stepMs, loops: LOOPS, mirror, frames: run.records, steps: run.steps };
                    writeFileSync(join(out, `${mirror ? "mirror" : "run"}-${clipName}-${lever}-s${seed}-${scheduleName}.json`), JSON.stringify(doc));
                    console.error(`wrote ${what(lever)}`);
                }
            }
        }
    };
}

/** The clip frame index of every processed frame of a run, by media time. */
function indexOf(clip) {
    const m = new Map(clip.pts.map((p, i) => [p, i]));
    return (t) => {
        const i = m.get(t);
        if (i === undefined) fail(`no clip frame at media time ${t}`);
        return i;
    };
}
const sameH = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const verdict = (r) => (r.ok ? "confirmed" : r.loss);

function ladderMode(out, clips, seeds, scheduleName) {
    return (arms) => {
        const arm = arms.orb;
        const setup = nft.prepareDetection(arm.cv, arm.target, { ratio: RATIO });
        const track = trackTarget(arm.target.patches, arm.target.pyramid.scaleStep);
        const opts = stepOptions({ ratio: RATIO });
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            const at = indexOf(clip);
            for (const seed of seeds) {
                const f = join(out, `run-${clipName}-none-s${seed}-${scheduleName}.json`);
                if (!existsSync(f)) fail(`ladder: ${f} missing; run the runs mode first`);
                const run = JSON.parse(readFileSync(f, "utf8"));
                const rows = noGlobalRandom(`ladder ${clipName} ${seed}`, () => {
                    const out = [];
                    for (const s of run.steps) {
                        if (!s.first) continue;
                        const k = s.frame;
                        const det = run.frames[k - 1];
                        if (!det || det.state !== "DETECT") fail(`ladder ${clipName} ${seed}: step at ${k} does not follow a DETECT frame`);
                        const i = at(det.mediaTimeSeconds);
                        const j = at(run.frames[k].mediaTimeSeconds);
                        const d = nft.detectTarget(arm.cv, setup, clip.frames[i], clip.pts[i] * 1000, frameRng(seed, clip.pts[i]));
                        if (!d.ok || !sameH(Array.from(d.H), det.H)) fail(`ladder ${clipName} ${seed}: the detection at frame ${i} does not reproduce the run's H`);
                        const own = trackFrame(clip.frames[j], track, null, d.H, opts, null);
                        if (verdict(own) !== (s.ok ? "confirmed" : s.loss)) fail(`ladder ${clipName} ${seed}: the step at frame ${j} does not reproduce the run's verdict`);
                        const rungs = LADDER.map((L) => (i + L < clip.frames.length ? verdict(trackFrame(clip.frames[i + L], track, null, d.H, opts, null)) : null));
                        // Paired levers, on the run's own step frame, from this same detection.
                        const prior = run.frames[k - 2];
                        const chain = !!(prior && prior.state === "DETECT");
                        const ctx = { Hdet: d.H, Hprev: chain ? Float64Array.from(prior.H) : null, corr: d.correspondences };
                        const levers = {};
                        for (const lever of ["V", "R1", "R2", "R3", "S"]) {
                            const r = firstStep(lever, clip.frames[j], track, ctx, opts).r;
                            levers[lever] = verdict(r);
                        }
                        // T: eligible when the run's step was refused and its re-detection on that frame failed.
                        const redetected = run.frames[k].state === "DETECT";
                        let T = verdict(own);
                        let tEligible = false;
                        if (!own.ok && !redetected && run.frames[k + 1]) {
                            tEligible = true;
                            const j2 = at(run.frames[k + 1].mediaTimeSeconds);
                            T = verdict(trackFrame(clip.frames[j2], track, null, d.H, opts, null)) === "confirmed" ? "confirmed-on-retry" : "refused-twice";
                        }
                        levers.T = T;
                        out.push({ k, i, j, lag: j - i, t: clip.pts[i], chain, own: verdict(own), rungs, levers, tEligible, inliers: d.numInliers });
                    }
                    return out;
                });
                writeFileSync(join(out, `ladder-${clipName}-s${seed}-${scheduleName}.json`), JSON.stringify({ kind: "272-stage1-ladder", clip: clipName, seed, scheduleName, rungsL: LADDER, rows }));
                console.error(`wrote ladder ${clipName} ${seed} ${scheduleName}`);
            }
        }
    };
}

function firstPixels(frame) {
    const { width, height, data } = frame;
    const n = width * height;
    if (!(Number.isInteger(width) && Number.isInteger(height) && data.length > n)) return frame;
    return { width, height, data: data.subarray(0, n) };
}

function patchesMode(out, clips, seeds, scheduleName) {
    return (arms) => {
        const arm = arms.orb;
        const track = trackTarget(arm.target.patches, arm.target.pyramid.scaleStep);
        const opts = stepOptions({ ratio: RATIO });
        const doubled = { ...opts.align, maxIterations: 2 * opts.align.maxIterations };
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            const at = indexOf(clip);
            for (const seed of seeds) {
                const run = JSON.parse(readFileSync(join(out, `run-${clipName}-none-s${seed}-${scheduleName}.json`), "utf8"));
                const rows = run.steps.map((s) => {
                    const i = at(run.frames[s.frame].mediaTimeSeconds);
                    const row = { frame: s.frame, first: s.first, ok: s.ok, loss: s.loss, stats: s.stats, cap: 0, edge: 0, fitSide: s.stats.rmsError !== null };
                    if (s.stats.frameLevels === 0) return row;
                    const pred = nft.predictHomography(s.Hprev ? Float64Array.from(s.Hprev) : null, Float64Array.from(s.Hstart));
                    if (!pred.ok) fail(`patches: a step aligned where the prediction fails`);
                    const built = nft.buildFramePyramid(firstPixels(clip.frames[i]), { levels: s.stats.frameLevels, scaleStep: track.scaleStep });
                    for (let q = 0; q < track.patches.count; q++) {
                        const o = s.outcomes[q];
                        if (o === PatchOutcome.Culled) continue;
                        const p = preparePatch(track.patches, q, track.scaleStep, pred.H);
                        const a = p.ok ? alignPrepared(built.pyramid, p, opts.align) : p;
                        const outcome = !a.ok ? (a.reason === "singular" ? PatchOutcome.Lost : PatchOutcome.Failed) : !a.observation.converged ? PatchOutcome.Unconverged : null;
                        if (outcome !== null && outcome !== o) fail(`patches ${clipName} ${seed} frame ${s.frame} patch ${q}: outcome ${outcome}, the step's ${o}`);
                        if (outcome === null && o !== PatchOutcome.Observed && o !== PatchOutcome.Rejected) fail(`patches ${clipName} ${seed} frame ${s.frame} patch ${q}: converged, the step's ${o}`);
                        if (o !== PatchOutcome.Unconverged) continue;
                        const b = alignPrepared(built.pyramid, p, doubled);
                        const x = a.observation;
                        const y = b.ok ? b.observation : null;
                        const same = y && y.x === x.x && y.y === x.y && y.converged === x.converged && y.iterations === x.iterations;
                        if (same) row.edge++;
                        else row.cap++;
                    }
                    if (row.cap + row.edge !== s.stats.unconverged) fail(`patches: unconverged split ${row.cap} + ${row.edge}, the step's ${s.stats.unconverged}`);
                    return row;
                });
                writeFileSync(join(out, `patches-${clipName}-s${seed}-${scheduleName}.json`), JSON.stringify({ kind: "272-stage1-patches", clip: clipName, seed, scheduleName, rows }));
                console.error(`wrote patches ${clipName} ${seed} ${scheduleName}`);
            }
        }
    };
}

function populationMode(out, clips, seeds) {
    return (arms) => {
        const arm = arms.orb;
        const setup = nft.prepareDetection(arm.cv, arm.target, { ratio: RATIO });
        const track = trackTarget(arm.target.patches, arm.target.pyramid.scaleStep);
        const opts = stepOptions({ ratio: RATIO });
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            for (const seed of seeds) {
                const rows = noGlobalRandom(`population ${clipName} ${seed}`, () =>
                    clip.frames.map((frame, i) => {
                        const d = nft.detectTarget(arm.cv, setup, frame, clip.pts[i] * 1000, frameRng(seed, clip.pts[i]));
                        const row = { t: clip.pts[i], ok: d.ok, reason: d.ok ? null : d.reason, H: d.ok ? Array.from(d.H) : null, next: null };
                        if (d.ok && i + 1 < clip.frames.length) row.next = verdict(trackFrame(clip.frames[i + 1], track, null, d.H, opts, null));
                        return row;
                    }),
                );
                writeFileSync(join(out, `population-${clipName}-s${seed}.json`), JSON.stringify({ kind: "272-stage1-population", clip: clipName, seed, rows }));
                console.error(`wrote population ${clipName} ${seed}`);
            }
        }
    };
}

function stressMode(out, clips, seeds, ratios) {
    return (arms) => {
        const arm = arms.orb;
        const track = trackTarget(arm.target.patches, arm.target.pyramid.scaleStep);
        const opts = stepOptions({ ratio: RATIO });
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            clip.frames = clip.frames.map(mirrored);
            for (const ratio of ratios) {
                const setup = nft.prepareDetection(arm.cv, arm.target, { ratio });
                for (const seed of seeds) {
                    const rows = noGlobalRandom(`stress ${clipName} ${ratio} ${seed}`, () => {
                        const acc = [];
                        let prev = null;
                        clip.frames.forEach((frame, i) => {
                            const d = nft.detectTarget(arm.cv, setup, frame, clip.pts[i] * 1000, frameRng(seed, clip.pts[i]));
                            if (d.ok && i + 1 < clip.frames.length) {
                                const ctx = { Hdet: d.H, Hprev: prev && prev.i === i - 1 ? prev.H : null, corr: d.correspondences };
                                const levers = {};
                                for (const lever of ["none", "V", "R1", "R2", "R3", "S"]) levers[lever] = verdict(firstStep(lever, clip.frames[i + 1], track, ctx, opts).r);
                                // T: a second step on the frame after, from the same detection, when the first was refused.
                                levers.T = levers.none === "confirmed" ? "confirmed" : i + 2 < clip.frames.length && verdict(trackFrame(clip.frames[i + 2], track, null, d.H, opts, null)) === "confirmed" ? "confirmed-on-retry" : "refused-twice";
                                acc.push({ i, t: clip.pts[i], inliers: d.numInliers, chain: ctx.Hprev !== null, levers });
                            }
                            prev = d.ok ? { i, H: d.H } : null;
                        });
                        return acc;
                    });
                    writeFileSync(join(out, `stress-${clipName}-r${ratio}-s${seed}.json`), JSON.stringify({ kind: "272-stage1-stress", clip: clipName, ratio, seed, frames: clip.frames.length, rows }));
                    console.error(`wrote stress ${clipName} ${ratio} ${seed}`);
                }
            }
        }
    };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [mode] = process.argv.slice(2);
    if (mode === "--self-test") {
        selfTest();
        process.exit(0);
    }
    const out = arg("--out", null);
    if (!out) fail("--out <dir> is required");
    mkdirSync(out, { recursive: true });
    const clips = list(arg("--clips", "table,wall"));
    const seeds = seedList(arg("--seeds", "1-8"));
    const schedule = arg("--schedule", "every");
    const arms = await buildArms();
    if (mode === "runs") runsMode(out, clips, seeds, list(arg("--levers", LEVERS.join(","))), schedule, process.argv.includes("--mirror"))(arms);
    else if (mode === "ladder") ladderMode(out, clips, seeds, schedule)(arms);
    else if (mode === "patches") patchesMode(out, clips, seeds, schedule)(arms);
    else if (mode === "population") populationMode(out, clips, seeds)(arms);
    else if (mode === "stress") stressMode(out, clips, seeds, list(arg("--ratios", "0.7,0.75,0.8,0.85,0.9")).map(Number))(arms);
    else fail("mode: runs | ladder | patches | population | stress");
}
