/*
 *  2026-11-28-280-stage1-f-runs.mjs
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
 * #280, M12's Stage 1: F0, Fs and Ffb as **run-level** arms, for the **descriptive lock rate only**.
 * The deciding figures are paired events (`2026-11-22-278-stage1-tools.mjs paired`/`deep`); these
 * runs decide nothing. A probe, not campaign data (docs/benchmarks/step-protocol.md, Stage 1).
 *
 *     npm run build
 *     node docs/benchmarks/2026-11-28-280-stage1-f-runs.mjs --self-test
 *     node docs/benchmarks/2026-11-28-280-stage1-f-runs.mjs runs --out <dir> --schedule every|device-15|device-25 [--clips fast,table,wall] [--seeds 1-8] [--levers none,F0,Fs,Ffb] [--trial]
 *
 * A run that is not `--trial` refuses an uncommitted tree; each file records the head, whether the
 * tree was clean and whether it is a trial. On `every`, the Fs arm must equal the `none` arm frame
 * for frame (there `a = b` on every age-1 state), fatally: a check of the wrapper's lock handling.
 *
 * ffmpeg and ffprobe on PATH. Writes `<out>/frun-<clip>-<lever>-s<seed>-<schedule>.json`, one a run:
 * the frame records (`frameRecord`'s) and every tracking step the tracker ran, each with its age.
 *
 * - **The arms.** `NftTracker` (ORB, `pinball.wnft`, `{ ratio: 0.8 }`), two loops, seeded
 *   `runSeeding(seed, "frame")`, on #273's runner's schedule loop (`2026-11-14-272-stage1-probe.mjs`,
 *   `leverRun`, copied: a step's extra alignment is charged one more `stepMs` on a device schedule).
 *   The runner's `LOOPS`, `RATIO`, `SCHEDULES`, `DEVICE_ACQUIRE_MS` and `DEVICE_DETECT_MS` are read from
 *   its source text (`readConstant`, #278's), not restated. One `NftTracker` instance a run, wired by
 *   {@link instrumentF}, #273's `instrument` pattern: it wraps that instance's own `processFrame`,
 *   `detected` and `step` (plain properties of the compiled class); nothing under `packages/`
 *   changes.
 * - **The levers act at age 1 only** (the first held step: the step after a kept first step, whose
 *   `previous` is the lock's detection), and are #278's own, called through its `leverStep`:
 *   - **F0:** `trackFrame(frame, track, current, current)`: the prediction is `current`.
 *   - **Fs:** `M^(b/a) · current`, `M = current · previous⁻¹`, `a` the clip frames from the detection's
 *     frame to the first step's and `b` from it to this one, on the loops' timeline. Where `a = b`
 *     (every state on `every`) it is the shipped step itself. **Where `M^(b/a)` cannot be taken**
 *     (#278's no verdict), the run steps with the shipped step there and counts it
 *     (`fsNoScaledPrediction`): the lever does not act.
 *   - **Ffb:** the shipped step; on a refusal only, F0's step on the same frame, charged one more
 *     `stepMs` on a device schedule (`extraSteps: 1`), nothing on `every`.
 *   - Every other step is the shipped step (`step` of the tracker's own prototype).
 * - **Fatal checks.** The `none` arm built through the same wrapping equals `replayRun` frame for
 *   frame (every key but `timings` and `trackerTimings`). Each lever arm's first frame that differs
 *   from the `none` arm is a frame on which that arm ran an age-1 step, or the frame after an age-1
 *   step charged a second alignment, when only its media time moved ({@link divergenceRefusalF},
 *   #273's `divergenceRefusal` with "first step" read as "age-1 step"; exercised both ways by the
 *   self-test). A held step not following a kept step on the processed frame before, an age-1 step
 *   whose lock is not the last detection two processed frames before, and any read of the global
 *   `Math.random` each exit 1. An arm that fails one writes no file;
 *   the files of the same seed's earlier arms, already written, stay (the run exits there).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { frameRecord, targetCorners, nextFrameIndex } from "../../examples/js/bench-metrics.mjs";
import { replayRun, loopTimes } from "../../scripts/replay-run.mjs";
import { countGlobalRandomReads, runSeeding } from "../../scripts/replay-seeding.mjs";
import { leverStep, readConstant } from "./2026-11-22-278-stage1-tools.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const RUNNER_REL = "docs/benchmarks/2026-11-14-272-stage1-probe.mjs";
const LOOPS = readConstant(RUNNER_REL, "LOOPS");
const RATIO = readConstant(RUNNER_REL, "RATIO");
const SCHEDULES = readConstant(RUNNER_REL, "SCHEDULES");
const DEVICE_ACQUIRE_MS = readConstant(RUNNER_REL, "DEVICE_ACQUIRE_MS");
const DEVICE_DETECT_MS = readConstant(RUNNER_REL, "DEVICE_DETECT_MS");
export const F_LEVERS = ["none", "F0", "Fs", "Ffb"];

function fail(why) {
    console.error(`280-stage1-f-runs: ${why}`);
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
const strip = (fr) => {
    const { timings, trackerTimings, ...rest } = fr;
    return JSON.stringify(rest);
};

/**
 * Held steps other than age 1 unchanged by construction: the first frame of a lever arm that differs
 * from the none arm must be one on which the lever arm ran an age-1 step; or, on a device schedule,
 * the frame after an age-1 step charged a second alignment (Ffb's fallback), when the records agree
 * on it and only the next processed frame's media time moved. `null` when it is, else why not.
 */
export function divergenceRefusalF(run, none) {
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
    if (run.steps.some((s) => s.frame === d && s.age === 1)) return null;
    const charged = run.steps.some((s) => s.frame === d - 1 && s.age === 1 && s.extraSteps > 0);
    const movedOnly = d > 0 && d < run.records.length && d < none.records.length && run.records[d].mediaTimeSeconds !== none.records[d].mediaTimeSeconds;
    if (charged && movedOnly) return null;
    return `first divergence from the none arm at frame ${d}, where this arm ran no age-1 step`;
}

/**
 * Wires `lever` into one `NftTracker` instance at age 1 only. `kOf` is the run loop's array of each
 * processed frame's index on the loops' timeline, pushed before each `process` call (Fs's `a` and
 * `b`). Returns `{ log }`: `log.steps` one entry per tracking step, `{ frame, age, ok, loss, stats,
 * acted, extraSteps, fellBack, noVerdict, a, b, Hprev, Hstart, H }`; `log.counts` the age-1 steps,
 * the age-1 steps run through `leverStep` (`acted`: Fs at `a = b` and Ffb where the shipped step keeps
 * included, where the call is the shipped one), Ffb's fallbacks and Fs's no-verdict states.
 */
export function instrumentF(tracker, lever, opts, { trackFrame, kOf, width, height }) {
    if (!F_LEVERS.includes(lever)) throw new RangeError(`unknown lever ${lever}`);
    if (JSON.stringify(tracker.trackOptions) !== JSON.stringify(opts)) throw new Error("instrumentF: step options differ from the tracker's");
    const proto = Object.getPrototypeOf(tracker);
    const log = { steps: [], frames: 0, counts: { age1: 0, acted: 0, fellBack: 0, fsNoScaledPrediction: 0 } };
    const mem = { frame: -1, detections: [], last: null };
    tracker.processFrame = function (...a) {
        mem.frame++;
        log.frames++;
        if (kOf.length !== mem.frame + 1) throw new Error(`instrumentF: processed frame ${mem.frame} has no timeline index (${kOf.length} pushed)`);
        return proto.processFrame.apply(this, a);
    };
    tracker.detected = function (d) {
        const res = proto.detected.call(this, d);
        if (res.ok) mem.detections.push({ frame: mem.frame, H: d.H });
        return res;
    };
    tracker.step = function (frame) {
        const lock = this.lock;
        const first = lock.previous === null;
        let age = 0;
        if (!first) {
            const L = mem.last;
            if (!L || L.frame !== mem.frame - 1 || !L.ok) throw new Error(`instrumentF: frame ${mem.frame}: a held step not following a kept step on the processed frame before`);
            age = L.age + 1;
        }
        let r;
        let acted = false;
        let extraSteps = 0;
        let fellBack = false;
        let noVerdict = false;
        let a = null;
        let b = null;
        if (age === 1) {
            log.counts.age1++;
            // The lock's detection is the last one recorded, two processed frames before; its first step the frame between.
            const det = mem.detections[mem.detections.length - 1];
            if (!det || det.frame !== mem.frame - 2 || det.H !== lock.previous) throw new Error(`instrumentF: frame ${mem.frame}: an age-1 lock whose previous is not the detection two processed frames before`);
            a = kOf[mem.frame - 1] - kOf[mem.frame - 2];
            b = kOf[mem.frame] - kOf[mem.frame - 1];
        }
        if (age !== 1 || lever === "none") {
            r = proto.step.call(this, frame);
        } else {
            const state = { age: 1, previous: lock.previous, current: lock.current, Hchain: null, a, b, width, height };
            const L = leverStep(lever, state, (p, c) => trackFrame(frame, this.track, p, c, opts, this.clock), null);
            if (L.noVerdict) {
                // #278's no verdict: M^(b/a) cannot be taken. The lever does not act; the shipped step runs.
                noVerdict = true;
                log.counts.fsNoScaledPrediction++;
                r = proto.step.call(this, frame);
            } else {
                acted = true;
                log.counts.acted++;
                r = L.r;
                extraSteps = L.extraSteps;
                fellBack = L.fellBack;
                if (fellBack) log.counts.fellBack++;
                // As the tracker's own step advances the lock (`tracker.ts`, `step`): previous the lock's current.
                this.lock = r.ok ? { previous: lock.current, current: r.H } : null;
            }
        }
        log.steps.push({
            frame: mem.frame,
            age,
            first,
            ok: r.ok,
            loss: r.ok ? null : r.loss,
            stats: { ...r.stats },
            acted,
            extraSteps,
            fellBack,
            noVerdict,
            a,
            b,
            Hprev: lock.previous ? Array.from(lock.previous) : null,
            Hstart: Array.from(lock.current),
            H: r.ok ? Array.from(r.H) : null,
        });
        mem.last = { frame: mem.frame, ok: r.ok, age };
        return r;
    };
    return { log };
}

/** #273's `leverRun`'s loop, copied, on a tracker wired by {@link instrumentF}; the busy time charged `extraSteps × stepMs` for a frame's extra alignment. */
function fRun({ nft, trackFrame, stepOptions, arm, clip, K, targetPoints, stepMs, lever, seed }) {
    const seeding = runSeeding(seed, "frame");
    const tracker = new nft.NftTracker(arm.cv, arm.target, K, { ratio: RATIO, clock: () => performance.now(), rngFor: seeding.rngFor });
    const kOf = [];
    const { log } = instrumentF(tracker, lever, stepOptions({ ratio: RATIO }), { trackFrame, kOf, width: clip.width, height: clip.height });
    const records = [];
    const times = loopTimes(clip.pts, LOOPS);
    for (let k = 0; k < times.length; ) {
        const i = k % clip.pts.length;
        seeding.frame(clip.pts[i]);
        const before = log.steps.length;
        kOf.push(k);
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
    return { records, steps: log.steps, counts: log.counts };
}

async function runsMode() {
    const out = arg("--out", null);
    if (!out) fail("--out <dir> is required");
    const scheduleName = arg("--schedule", "every");
    if (!(scheduleName in SCHEDULES)) fail(`--schedule: ${scheduleName}`);
    const clips = list(arg("--clips", "fast,table,wall"));
    const seeds = seedList(arg("--seeds", "1-8"));
    const levers = list(arg("--levers", F_LEVERS.join(",")));
    for (const l of levers) if (!F_LEVERS.includes(l)) fail(`--levers: ${l}`);
    if (!levers.includes("none")) fail("--levers must include none: every lever arm is checked against it");
    for (const c of clips) if (!(c in DEVICE_ACQUIRE_MS)) fail(`--clips: ${c} has no device acquisition in the runner`);
    mkdirSync(out, { recursive: true });
    const git = (...a) => execFileSync("git", a, { cwd: ROOT }).toString().trim();
    const head = git("rev-parse", "HEAD");
    const clean = git("status", "--porcelain") === "";
    const trial = process.argv.includes("--trial");
    // A run for the record is made from a committed tree; a trial may not be.
    if (!trial && !clean) fail("the tree is not clean: commit first, or label the run --trial");
    const { buildArms, loadClip } = await load("docs/benchmarks/2026-11-13-262-stage1-probe.mjs");
    const { stepOptions, trackFrame } = await load("docs/benchmarks/2026-11-14-272-stage1-levers.mjs");
    const { intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
    const nft = await load("packages/nft-tracker/dist/index.js");
    const arms = await buildArms();
    const arm = arms.orb;
    const targetPoints = targetCorners(arm.target.meta.widthPx, arm.target.meta.heightPx);
    const stepMs = SCHEDULES[scheduleName];
    for (const clipName of clips) {
        const clip = { ...loadClip(clipName), name: clipName };
        const K = intrinsics(clip.width, clip.height);
        for (const seed of seeds) {
            const what = (l) => `${clipName} ${l} seed ${seed} ${scheduleName}`;
            const once = (l, fn) => {
                const { value, reads } = countGlobalRandomReads(fn);
                if (reads !== 0) fail(`${what(l)}: ${reads} read(s) of the global Math.random`);
                return value;
            };
            const shipped = once("replayRun", () =>
                replayRun({ NftTracker: nft.NftTracker, cv: arm.cv, target: arm.target, targetPoints, detectMs: DEVICE_DETECT_MS, frames: clip.frames, pts: clip.pts, K, mode: "tracking", stepMs, order: null, options: { ratio: RATIO }, probe: null, loops: LOOPS, acquireMs: DEVICE_ACQUIRE_MS[clipName], unwrapped: false, seeding: runSeeding(seed, "frame") }),
            );
            let none = null;
            for (const lever of ["none", ...levers.filter((l) => l !== "none")]) {
                let run;
                try {
                    run = once(lever, () => fRun({ nft, trackFrame, stepOptions, arm, clip, K, targetPoints, stepMs, lever, seed }));
                } catch (e) {
                    fail(`${what(lever)}: ${e.message}`);
                }
                if (lever === "none") {
                    if (run.records.length !== shipped.length) fail(`${what(lever)}: ${run.records.length} frames, replayRun ${shipped.length}`);
                    run.records.forEach((f, i) => {
                        if (strip(f) !== strip(shipped[i])) fail(`${what(lever)}: frame ${i} differs from replayRun's`);
                    });
                    none = run;
                } else {
                    const why = divergenceRefusalF(run, none);
                    if (why) fail(`${what(lever)}: ${why}`);
                    // On every, a = b on every age-1 state and Fs is the shipped step: its run must be the none arm's, frame for frame.
                    if (lever === "Fs" && stepMs === null && (run.records.length !== none.records.length || run.records.some((f, i) => strip(f) !== strip(none.records[i])))) fail(`${what(lever)}: Fs on every differs from the none arm`);
                }
                const doc = { kind: "280-stage1-f-run", clip: clipName, file: clip.file, size: [clip.width, clip.height], lever, seed, seedPolicy: "frame", ratio: RATIO, scheduleName, stepMs, loops: LOOPS, head, clean, trial, counts: run.counts, frames: run.records, steps: run.steps };
                writeFileSync(join(out, `frun-${clipName}-${lever}-s${seed}-${scheduleName}.json`), JSON.stringify(doc));
                console.error(`wrote ${what(lever)}`);
            }
        }
    }
}

function selfTest() {
    const fails = [];
    const T = (n, ok) => ok || fails.push(n);
    const fr = (state, H = null) => ({ state, H, timings: { x: 1 }, trackerTimings: null });
    const none = { records: [fr("DETECT", [1]), fr("TRACK", [2]), fr("TRACK", [3]), fr("TRACK", [4])], steps: [] };
    // Divergence on an age-1 frame passes; on an age-0 or age-2 frame it is refused.
    const atAge1 = { records: [fr("DETECT", [1]), fr("TRACK", [2]), fr("TRACK", [9]), fr("TRACK", [10])], steps: [{ frame: 1, age: 0 }, { frame: 2, age: 1 }, { frame: 3, age: 2 }] };
    const atAge0 = { records: [fr("DETECT", [1]), fr("TRACK", [7]), fr("TRACK", [9]), fr("TRACK", [10])], steps: [{ frame: 1, age: 0 }, { frame: 2, age: 1 }, { frame: 3, age: 2 }] };
    const atAge2 = { records: [fr("DETECT", [1]), fr("TRACK", [2]), fr("TRACK", [3]), fr("TRACK", [11])], steps: [{ frame: 1, age: 0 }, { frame: 2, age: 1 }, { frame: 3, age: 2 }] };
    T("divergence on an age-1 frame passes", divergenceRefusalF(atAge1, none) === null);
    T("divergence on a first step's frame is refused", divergenceRefusalF(atAge0, none) !== null);
    T("divergence on an age-2 frame is refused", divergenceRefusalF(atAge2, none) !== null);
    T("no divergence passes", divergenceRefusalF(none, none) === null);
    T("timings alone are not a divergence", divergenceRefusalF({ ...none, records: none.records.map((r) => ({ ...r, timings: { x: 2 } })) }, none) === null);
    T("a shorter run diverges where it ends, refused there with no age-1 step", divergenceRefusalF({ records: none.records.slice(0, 2), steps: [] }, none) !== null);
    const ft = (state, H, t) => ({ ...fr(state, H), mediaTimeSeconds: t });
    const sched = { records: [ft("DETECT", [1], 0), ft("TRACK", [2], 0.04), ft("TRACK", [3], 0.08), ft("TRACK", [4], 0.12)], steps: [] };
    const moved = (extra) => ({ records: [ft("DETECT", [1], 0), ft("TRACK", [2], 0.04), ft("TRACK", [3], 0.08), ft("TRACK", [4], 0.16)], steps: [{ frame: 1, age: 0, extraSteps: 0 }, { frame: 2, age: 1, extraSteps: extra }] });
    T("a frame moved by a charged age-1 step on the frame before passes", divergenceRefusalF(moved(1), sched) === null);
    T("a frame moved after an uncharged age-1 step is refused", divergenceRefusalF(moved(0), sched) !== null);
    const changed = { records: [ft("DETECT", [1], 0), ft("TRACK", [2], 0.04), ft("TRACK", [3], 0.08), ft("TRACK", [9], 0.12)], steps: [{ frame: 2, age: 1, extraSteps: 1 }] };
    T("a held step changed on the same frame after a charged age-1 step is refused", divergenceRefusalF(changed, sched) !== null);
    // instrumentF on a stand-in tracker: the lever acts at age 1 only, and the lock advances as the tracker's own step.
    const H = (v) => new Float64Array([1, 0, v, 0, 1, 0, 0, 0, 1]);
    const makeTracker = (script) => {
        const proto = {
            processFrame(frame) {
                const r = this.lock ? this.step(frame) : null;
                if (!r || !r.ok) {
                    const d = script.detections[this.n] ?? null;
                    if (d !== null) {
                        const res = this.detected({ H: d });
                        if (res.ok) this.lock = { previous: null, current: d };
                    }
                }
                this.n++;
            },
            detected: (d) => ({ ok: true, H: d.H }),
            step(frame) {
                const lock = this.lock;
                const r = { ok: script.ok[this.n], H: H(100 + this.n), stats: { shipped: true, previous: lock.previous, current: lock.current } };
                if (!r.ok) r.loss = "too-few-patches";
                this.lock = r.ok ? { previous: lock.current, current: r.H } : null;
                return r;
            },
        };
        const t = Object.create(proto);
        Object.assign(t, { trackOptions: { o: 1 }, lock: null, n: 0, track: "track", clock: null });
        return t;
    };
    // Frame 0 detects, 1 first step (kept), 2 age 1, 3 age 2.
    const script = { detections: [H(1), null, null, null], ok: [false, true, true, true] };
    const leverCalls = [];
    const fakeTrackFrame = (frame, track, p, c) => {
        leverCalls.push({ frame, p, c });
        return { ok: true, H: H(500), stats: { lever: true } };
    };
    const t = makeTracker(script);
    const kOf = [];
    const { log } = instrumentF(t, "F0", { o: 1 }, { trackFrame: fakeTrackFrame, kOf, width: 480, height: 270 });
    for (let k = 0; k < 4; k++) {
        kOf.push(k);
        t.processFrame(k);
    }
    T("F0 acts once, at age 1, on frame 2", leverCalls.length === 1 && leverCalls[0].frame === 2 && log.steps.find((s) => s.frame === 2).age === 1 && log.steps.find((s) => s.frame === 2).acted);
    T("F0's call is (current, current)", leverCalls.length === 1 && leverCalls[0].p === leverCalls[0].c);
    T("the age-2 step after it starts from the lever's output, as the tracker's step advances a lock", (() => {
        const s3 = log.steps.find((s) => s.frame === 3);
        return s3 && s3.age === 2 && !s3.acted && s3.Hstart[2] === 500;
    })());
    T("the first step is the shipped one", log.steps.find((s) => s.frame === 1).age === 0 && !log.steps.find((s) => s.frame === 1).acted);
    // The none lever never calls trackFrame from the wrapper.
    leverCalls.length = 0;
    const t2 = makeTracker(script);
    const k2 = [];
    instrumentF(t2, "none", { o: 1 }, { trackFrame: fakeTrackFrame, kOf: k2, width: 480, height: 270 });
    for (let k = 0; k < 4; k++) {
        k2.push(k);
        t2.processFrame(k);
    }
    T("the none lever never steps through the lever", leverCalls.length === 0);
    // A frame processed without its timeline index is refused.
    const t3 = makeTracker(script);
    instrumentF(t3, "F0", { o: 1 }, { trackFrame: fakeTrackFrame, kOf: [], width: 480, height: 270 });
    let threw = false;
    try {
        t3.processFrame(0);
    } catch {
        threw = true;
    }
    T("a processed frame with no timeline index is refused", threw);
    // An age-1 lock whose previous is not the detection two frames before is refused.
    const t4 = makeTracker(script);
    const k4 = [];
    instrumentF(t4, "F0", { o: 1 }, { trackFrame: fakeTrackFrame, kOf: k4, width: 480, height: 270 });
    let threw4 = false;
    try {
        for (let k = 0; k < 3; k++) {
            k4.push(k);
            if (k === 2) t4.lock = { previous: H(77), current: t4.lock.current };
            t4.processFrame(k);
        }
    } catch {
        threw4 = true;
    }
    T("an age-1 lock not started by the detection two frames before is refused", threw4);
    T("the runner's constants are read from its source", LOOPS === 2 && RATIO === 0.8 && SCHEDULES["device-25"] === 25 && DEVICE_ACQUIRE_MS.fast === 20.4);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [mode] = process.argv.slice(2);
    if (mode === "--self-test") selfTest();
    else if (mode === "runs") await runsMode();
    else fail("mode: runs | --self-test");
}
