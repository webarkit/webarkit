/*
 *  2026-11-14-272-stage1-levers.mjs
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
 * #272, M11's Stage 1: the levers, as prototypes acting on **the first tracking step after a
 * detection only** (the step whose lock has `previous === null`). Nothing under `packages/`
 * changes: every lever is built from the built package's `trackFrame`, `robustHomography`,
 * `preparePatch`/`alignPrepared` and `buildFramePyramid`, deep-imported from `dist/`, and wired
 * into one `NftTracker` instance by {@link instrument}, which wraps that instance's own `step`,
 * `detect`, `detected` and `processFrame` (plain properties of the compiled class) and leaves every
 * other path of the tracker as it ships.
 *
 *     import { LEVERS, firstStep, instrument, stepOptions } from "./2026-11-14-272-stage1-levers.mjs";
 *     node docs/benchmarks/2026-11-14-272-stage1-levers.mjs --self-test
 *
 * The levers (`LEVERS`), each a function of the first step's frame and its context
 * `{ Hdet, Hprev, corr }` (the detection's `H`, an earlier detection's `H` or `null`, the
 * detection's inlier correspondences):
 * - **none**: the step as shipped, `trackFrame(frame, track, null, Hdet)`.
 * - **V, velocity**: `trackFrame(frame, track, Hprev, Hdet)` when the processed frame before the
 *   lock's own detection also ended in a detection that set a lock (a DETECT chain), its `H` as
 *   `previous`; else as shipped. The prediction is `predictHomography`'s, frame-indexed: one
 *   processed frame of motion per step, as for a held step.
 * - **R1, reach by the cutoff**: the step with `tukeyC` 8 instead of 4, every other option as
 *   shipped (`maxFitRms` 0.6 judges it).
 * - **R2, reach by the fit's start**: the same observations as the shipped step (alignment from
 *   the detection's `H`, the gate, the minimum), the fit started off the prediction: a first IRLS
 *   at `tukeyC` 12 from the prediction, then the shipped fit (`tukeyC` 4) started from that fit's
 *   `H` instead of the prediction, judged by the shipped rules. Built by {@link scriptStep}, which
 *   is `trackFrame` re-assembled from its parts and checked bit-equal to it on every call.
 * - **R3, a second alignment pass** (named apart from R2: it re-aligns, it does not refit): a wide
 *   step (`tukeyC` 12, `maxFitRms` and `maxOutlierShare` relaxed) from the detection's `H`, then
 *   the shipped step from its `H`. Two steps' alignment on one frame: on a device schedule the
 *   replay charges it a second step's time.
 * - **S, the starting `H`**: the detection's `H` refitted on its own inlier correspondences by
 *   `robustHomography` (IRLS, Tukey `c` = 4, from `Hdet`) and the shipped step started from the
 *   refit. The detection's `H` is already a linear refit on its inliers (`find_homography`,
 *   `packages/cv-backend-jsfeatnext/src/jsfeatnext_backend.ts`, the comment on its restarts), so
 *   S replaces an algebraic least-squares fit by a geometric robust one: a small change expected
 *   from the code. The DETECT frame's reported `H` is unchanged; only the lock starts from the
 *   refit.
 * - **T, retry**: the first step as shipped; when it is refused and the same frame's detection
 *   then fails, the refused detection's `H` is kept for one more first step on the next processed
 *   frame (a pending lock; it opens the state machine, the maintainer's ruling of 2026-11-14, 4b).
 *   Once per detection.
 *
 * Held steps (`previous !== null`) run the shipped `step` unchanged in every arm.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { trackFrame, trackTarget, PatchOutcome } = await load("packages/nft-tracker/dist/tracking/track_frame.js");
const { preparePatch, alignPrepared } = await load("packages/nft-tracker/dist/tracking/align_patch.js");
const { frameLevelsFor } = await load("packages/nft-tracker/dist/tracking/frame_levels.js");
const nft = await load("packages/nft-tracker/dist/index.js");
const { stepOptions } = await load("scripts/tuning-probe.mjs");

export { stepOptions, trackFrame, trackTarget, PatchOutcome };

export const LEVERS = ["none", "V", "R1", "R2", "R3", "S", "T"];
/** Whether a lever opens the state machine, by the maintainer's ruling of 2026-11-14 (4a, 4b) or, where marked, by this probe's reading for the maintainer to rule on. */
export const OPENS_STATE_MACHINE = {
    none: "no",
    V: "no (ruling 4a: the hand-off rule changes, not the state set or the transitions)",
    R1: "no (one step's option; proposed, not ruled)",
    R2: "no (one step's fit; proposed, not ruled)",
    R3: "no state is added, but one frame runs two steps' alignment (proposed, not ruled)",
    S: "no (the hand-off's starting H, as 4a; proposed, not ruled)",
    T: "yes (ruling 4b: a retry is a pending lock; #143's rename travels with it)",
};

const WIDE_TUKEY_C = 12;

/** `trackFrame`'s options with the fit's cutoff replaced. */
const withTukey = (opts, c) => ({ ...opts, fit: { ...opts.fit, tukeyC: c } });

/** R3's wide pass: the cutoff wide, and the judgement relaxed so that its H is kept for the second pass. */
const wideOptions = (opts) => ({ ...withTukey(opts, WIDE_TUKEY_C), maxFitRms: 1e6, maxOutlierShare: 0.99 });

// Copies of two private helpers of `packages/nft-tracker/src/tracking/track_frame.ts`, unchanged
// but for types: scriptStep is checked bit-equal to trackFrame on every call, so a drift fails.
function firstPixels(frame) {
    const { width, height, data } = frame;
    const n = width * height;
    if (!(Number.isInteger(width) && Number.isInteger(height) && data.length > n)) return frame;
    return { width, height, data: data.subarray(0, n) };
}
function windowInFrame(H, target, q, width, height) {
    const { patches } = target;
    const last = patches.patchSize - 1;
    const s = target.patchScales[q];
    for (let k = 0; k < 4; k++) {
        const X = (patches.left[q] + (k & 1 ? last : 0)) / s;
        const Y = (patches.top[q] + (k & 2 ? last : 0)) / s;
        const w = H[6] * X + H[7] * Y + H[8];
        if (!(w > 0)) return false;
        const x = (H[0] * X + H[1] * Y + H[2]) / w;
        const y = (H[3] * X + H[4] * Y + H[5]) / w;
        if (!(x >= 0 && x <= width - 1 && y >= 0 && y <= height - 1)) return false;
    }
    return true;
}

/**
 * `trackFrame` re-assembled from its parts (`packages/nft-tracker/src/tracking/track_frame.ts`,
 * `trackFrame`, step for step), with one hook: `fitStart(src, dst, Hpred)` returns the `H` the
 * shipped fit starts from instead of the prediction, or `null` to keep the prediction. Every call
 * is checked against `trackFrame` itself: the observations (outcomes, counts) always, and the whole
 * result when the hook keeps the prediction. A mismatch throws.
 */
export function scriptStep(frame, target, previous, current, options, fitStart = null) {
    const shipped = trackFrame(frame, target, previous, current, options, null);
    const { patches } = target;
    const outcomes = new Uint8Array(patches.count);
    const counts = { frameLevels: 0, culled: patches.count, attempted: 0, observed: 0, lost: 0, unconverged: 0, rejected: 0, failed: 0 };
    const noFit = { inliers: 0, rmsError: null, fitIterations: 0, fitConverged: null };
    const lose = (loss, fit = noFit) => ({ ok: false, loss, stats: { ...counts, ...fit }, outcomes, timings: null });
    const finish = (r, usedHook) => {
        for (let q = 0; q < patches.count; q++) if (r.outcomes[q] !== shipped.outcomes[q]) throw new Error(`scriptStep: patch ${q} outcome ${r.outcomes[q]}, trackFrame ${shipped.outcomes[q]}`);
        for (const k of Object.keys(counts)) if (r.stats[k] !== shipped.stats[k]) throw new Error(`scriptStep: ${k} ${r.stats[k]}, trackFrame ${shipped.stats[k]}`);
        if (!usedHook) {
            if (r.ok !== shipped.ok || (!r.ok && r.loss !== shipped.loss)) throw new Error("scriptStep: verdict differs from trackFrame");
            for (const k of ["inliers", "rmsError", "fitIterations", "fitConverged"]) if (r.stats[k] !== shipped.stats[k]) throw new Error(`scriptStep: ${k} differs from trackFrame`);
            if (r.ok && r.H.some((v, i) => v !== shipped.H[i])) throw new Error("scriptStep: H differs from trackFrame");
        }
        return r;
    };
    const predicted = nft.predictHomography(previous, current);
    if (!predicted.ok) return finish(lose("no-prediction"), false);
    const H = predicted.H;
    const candidates = [];
    for (let q = 0; q < patches.count; q++) if (windowInFrame(H, target, q, frame.width, frame.height)) candidates.push(q);
    counts.attempted = candidates.length;
    counts.culled = patches.count - candidates.length;
    const prepared = candidates.map((q) => preparePatch(patches, q, target.scaleStep, H));
    const levels = frameLevelsFor(prepared, target.scaleStep, frame, options.maxFrameLevels);
    const built = nft.buildFramePyramid(firstPixels(frame), { levels, scaleStep: target.scaleStep });
    if (!built.ok) throw new RangeError(`scriptStep: not a valid frame (${built.reason})`);
    counts.frameLevels = levels;
    const src = new Float64Array(2 * candidates.length);
    const dst = new Float64Array(2 * candidates.length);
    for (let c = 0; c < candidates.length; c++) {
        const q = candidates[c];
        const p = prepared[c];
        const r = p.ok ? alignPrepared(built.pyramid, p, options.align) : p;
        if (!r.ok) {
            if (r.reason === "singular") {
                outcomes[q] = PatchOutcome.Lost;
                counts.lost++;
            } else {
                outcomes[q] = PatchOutcome.Failed;
                counts.failed++;
            }
            continue;
        }
        const o = r.observation;
        if (!o.converged) {
            outcomes[q] = PatchOutcome.Unconverged;
            counts.unconverged++;
            continue;
        }
        const contrast = o.residual / (o.gain * target.patchSpreads[q]);
        if (1 / Math.sqrt(1 + contrast * contrast) < options.minPatchZncc) {
            outcomes[q] = PatchOutcome.Rejected;
            counts.rejected++;
            continue;
        }
        outcomes[q] = PatchOutcome.Observed;
        const k = counts.observed++;
        src[2 * k] = target.centres[2 * q];
        src[2 * k + 1] = target.centres[2 * q + 1];
        dst[2 * k] = o.x;
        dst[2 * k + 1] = o.y;
    }
    if (counts.observed < options.minTrackedPatches) return finish(lose("too-few-patches"), false);
    const s = src.subarray(0, 2 * counts.observed);
    const d = dst.subarray(0, 2 * counts.observed);
    const start = fitStart ? fitStart(s, d, H) : null;
    const usedHook = start !== null;
    const fit = nft.robustHomography(s, d, usedHook ? start : H, options.fit);
    if (!fit.ok) return finish(lose("fit-failed"), usedHook);
    const fitStats = { inliers: fit.numInliers, rmsError: fit.rmsError, fitIterations: fit.iterations, fitConverged: fit.converged };
    if ((counts.observed - fit.numInliers) / counts.observed > options.maxOutlierShare) return finish(lose("too-many-outliers", fitStats), usedHook);
    if (fit.numInliers < options.minTrackedPatches) return finish(lose("too-few-patches", fitStats), usedHook);
    if (fit.rmsError > options.maxFitRms) return finish(lose("poor-fit", fitStats), usedHook);
    let sum = 0;
    for (let i = 0; i < fit.weights.length; i++) sum += fit.weights[i];
    return finish(
        { ok: true, H: fit.H, quality: sum / counts.attempted, weights: fit.weights, correspondences: { src: s, dst: d }, stats: { ...counts, ...fitStats }, outcomes, timings: null },
        usedHook,
    );
}

/**
 * The lever's first step on `frame`, from the context `{ Hdet, Hprev, corr }`. Returns
 * `{ r, extraSteps }`: `r` a `trackFrame` result, `extraSteps` the steps' worth of alignment it
 * ran beyond one (R3's wide pass), which a device schedule charges.
 */
export function firstStep(lever, frame, track, ctx, opts) {
    switch (lever) {
        case "none":
        case "T":
            return { r: trackFrame(frame, track, null, ctx.Hdet, opts, null), extraSteps: 0 };
        case "V":
            return { r: trackFrame(frame, track, ctx.Hprev ?? null, ctx.Hdet, opts, null), extraSteps: 0 };
        case "R1":
            return { r: trackFrame(frame, track, null, ctx.Hdet, withTukey(opts, 8), null), extraSteps: 0 };
        case "R2":
            return {
                r: scriptStep(frame, track, null, ctx.Hdet, opts, (s, d, Hpred) => {
                    const wide = nft.robustHomography(s, d, Hpred, withTukey(opts, WIDE_TUKEY_C).fit);
                    return wide.ok ? wide.H : null;
                }),
                extraSteps: 0,
            };
        case "R3": {
            const a = trackFrame(frame, track, null, ctx.Hdet, wideOptions(opts), null);
            if (!a.ok) return { r: trackFrame(frame, track, null, ctx.Hdet, opts, null), extraSteps: 1 };
            return { r: trackFrame(frame, track, null, a.H, opts, null), extraSteps: 1 };
        }
        case "S": {
            const start = refitDetection(ctx, opts);
            return { r: trackFrame(frame, track, null, start, opts, null), extraSteps: 0 };
        }
        default:
            throw new RangeError(`unknown lever ${lever}`);
    }
}

/** S's starting H: the detection's H refitted on its inliers by robustHomography (c = 4), or the detection's H when the refit fails. */
export function refitDetection(ctx, opts) {
    const c = ctx.corr;
    if (!c || c.src.length < 8) return ctx.Hdet;
    const fit = nft.robustHomography(c.src, c.dst, ctx.Hdet, opts.fit);
    return fit.ok ? fit.H : ctx.Hdet;
}

/**
 * Wires `lever` into one `NftTracker` instance (the default synchronous path, the tracker's own
 * detection). Returns `{ tracker, log }`: `log.steps` one entry per tracking step the tracker ran,
 * `{ frame, first, retry, lever, ok, loss, stats, outcomes, Hstart, H, extraSteps, gapFrames }`, and
 * `log.frames` the processed-frame count. `onFrame()` must be called by nobody: `processFrame` is
 * wrapped to count frames.
 *
 * `opts` must be the tracker's own step options (`stepOptions(trackerOptions)`); they are checked
 * against the instance's.
 */
export function instrument(tracker, lever, opts) {
    if (!LEVERS.includes(lever)) throw new RangeError(`unknown lever ${lever}`);
    if (JSON.stringify(tracker.trackOptions) !== JSON.stringify(opts)) throw new Error("instrument: step options differ from the tracker's");
    const proto = Object.getPrototypeOf(tracker);
    const log = { steps: [], frames: 0 };
    const mem = { frame: -1, detections: [], refused: null };
    tracker.processFrame = function (...a) {
        mem.frame++;
        mem.refused = null;
        log.frames++;
        return proto.processFrame.apply(this, a);
    };
    tracker.detected = function (d) {
        const res = proto.detected.call(this, d);
        if (res.ok) mem.detections.push({ frame: mem.frame, H: d.H, corr: d.correspondences });
        return res;
    };
    tracker.detect = function (frame, timestampMs) {
        const res = proto.detect.call(this, frame, timestampMs);
        // T: a refused first step whose frame's own detection failed keeps its detection's H for one
        // more first step on the next processed frame.
        if (lever === "T" && !res.ok && mem.refused && !mem.refused.retried) {
            this.lock = { previous: null, current: mem.refused.H, retry: true };
        }
        return res;
    };
    tracker.step = function (frame) {
        const lock = this.lock;
        const first = lock.previous === null;
        if (!first || lever === "none" || lever === "T") {
            const r = proto.step.call(this, frame);
            log.steps.push(entry(r, first, lock.previous, lock.current, 0, null, !!lock.retry));
            if (first && !r.ok && lever === "T") mem.refused = { H: lock.current, retried: !!lock.retry };
            return r;
        }
        // The lock's own detection is the last one recorded, on the frame before this one.
        const det = mem.detections[mem.detections.length - 1];
        if (!det || det.H !== lock.current) throw new Error(`instrument: frame ${mem.frame}: the lock's detection is not the last one recorded`);
        const prior = mem.detections[mem.detections.length - 2];
        const chain = prior && prior.frame === det.frame - 1;
        const ctx = { Hdet: lock.current, Hprev: lever === "V" && chain ? prior.H : null, corr: det.corr };
        const { r, extraSteps } = firstStep(lever, frame, this.track, ctx, opts);
        const Hstart = lever === "S" ? refitDetection(ctx, opts) : lock.current;
        this.lock = r.ok ? { previous: Hstart, current: r.H } : null;
        log.steps.push(entry(r, true, ctx.Hprev, Hstart, extraSteps, chain ? 1 : null, false));
        return r;
    };
    function entry(r, first, Hprev, Hstart, extraSteps, gapFrames, retry) {
        return {
            frame: mem.frame,
            first,
            retry,
            ok: r.ok,
            loss: r.ok ? null : r.loss,
            stats: { ...r.stats },
            outcomes: Array.from(r.outcomes),
            Hprev: Hprev ? Array.from(Hprev) : null,
            Hstart: Array.from(Hstart),
            H: r.ok ? Array.from(r.H) : null,
            extraSteps,
            gapFrames,
        };
    }
    return { tracker, log };
}

function selfTest() {
    const fails = [];
    const T = (n, ok) => ok || fails.push(n);
    T("seven levers", LEVERS.length === 7);
    T("every lever has a state-machine reading", LEVERS.every((l) => typeof OPENS_STATE_MACHINE[l] === "string"));
    T("withTukey changes only the cutoff", JSON.stringify({ ...withTukey(stepOptions(), 8), fit: { ...stepOptions().fit } }) === JSON.stringify(stepOptions()));
    let threw = false;
    try {
        firstStep("X", null, null, {}, stepOptions());
    } catch {
        threw = true;
    }
    T("an unknown lever throws", threw);
    T("refitDetection keeps Hdet without correspondences", refitDetection({ Hdet: [1, 0, 0, 0, 1, 0, 0, 0, 1], corr: null }, stepOptions())[0] === 1);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url && process.argv.includes("--self-test")) selfTest();
