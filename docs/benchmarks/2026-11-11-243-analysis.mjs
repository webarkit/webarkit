/*
 *  2026-11-11-243-analysis.mjs
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
 * M9's analysis (#243): the script "What must exist before the pre-flight", item 1, of
 * docs/benchmarks/2026-11-10-243-registration.md ("the registration") names, with the
 * maintainer's rulings of 2026-11-11 in docs/benchmarks/2026-11-11-243-registration-addendum.md.
 * It implements the registration and adds nothing to it. The freeze holds it from the
 * pre-flight to the campaign's close.
 *
 *     node docs/benchmarks/2026-11-11-243-analysis.mjs --checks-only <export.json> [...]
 *     node docs/benchmarks/2026-11-11-243-analysis.mjs --block <8 exports of one clip>
 *
 * --checks-only is the pre-flight's mode ("The pre-flight", items 3 and 5): per export, the
 * fields each arm needs, V11's checks and the covariates that are not pose figures. It prints no
 * jitter, distance, difference or tilt of any arm, and counts no switch. It exits 1 on a fatal
 * check, and reports route (b)'s null-corners frames without stopping on them.
 *
 * --block reads one block, the eight counted runs of one clip, after the eighth has passed its
 * run-level checks ("The stopping rules"): V11's checks on every export first, then the
 * covariates, the criteria of that clip (P1 and P7 on the static clip, P2 on the table clip, P3 to
 * P6 on the cross clip), the descriptive readings and V9 and V10. A fatal check stops it before
 * any figure is printed (V11: "a V11 failure stops the analysis of that block").
 *
 * The method, by the registration's sections:
 *
 * - The arms ("What M9 measures"): IPPE is the export's `poseCorners`; CF is
 *   `closedFormPose(H, K)`, `K = intrinsics(processingResolution)`, projected by the frozen
 *   `frameRecord`; GUARD is CF where `tiltDegOf` of CF's `R` is below 10°, the export's
 *   `poseCorners` otherwise and where CF's `good` is false; FILTER is route (b): `PoseFilter` at
 *   the package's defaults, fed the pose recovered from `poseCorners` (a four-point homography
 *   from the target's corners, then the closed form), the export's own `timestampMs`, `state`
 *   and `ok`. Every frozen module is imported, none copied. The four-point fit is Stage 1's
 *   (`fitHomography4` of 2026-11-10-243-stage1-probe.mjs), copied: that script cannot be
 *   imported, since it runs on import, and the fit is not one of the frozen modules.
 * - Route (b)'s null-corners frame (an `ok` TRACK frame whose `poseCorners` are null): counted
 *   and named, never fatal. On a run with one, the filter is run two ways, (i) reset at the frame
 *   and (ii) the frame skipped with the state carried, and P7 is read once per way.
 * - A reading ("How each criterion is read"): d = J(Y on S) − J(X on S) per run, J the frozen
 *   `cornerJitter` with `include`, on the run's counted loops, S the frames where both arms have
 *   corners and the selection holds; then over the 8 runs d̄, s_d, d̄ ± 2.3646 × s_d ÷ √8, the
 *   count of the predicted sign, the most influential media time (keyed by `mediaKey`, the one
 *   whose removal from every run moves the median of the 8 d's most, ties to the earliest) and
 *   the same without it. Held, refuted or not shown by the registration's three outcomes.
 *
 * Every check is exercised both ways in examples/test/m9-analysis.test.mjs, which imports this
 * module: run as a script it reads its arguments, imported it only exports.
 *
 * Its readings reproduce Stage 1's Q4 rows (item 1). That is shown once, in the PR that added
 * this file, not by a test: the eight-seed exports need ffmpeg and about an hour of replays,
 * neither of which CI has. Each of the record's twelve Q4 rows (twenty in Stage 1's stdout,
 * which prints the static, table and cross rows once per device schedule) was read from run A's
 * records of Stage 1's procedure at seeds 1 to 8, written as exports: every cell
 * is Stage 1's printed cell, apart from the filter arm's spread over the seeds (route (b)
 * against Stage 1's tracker-filtered run F, Stage 1's Q1: to rounding, not bit for bit).
 *
 * Two readings follow Stage 1's code where the registration's words leave a gap. The median
 * over the runs leaves out a run whose d a dropped media time makes void, as Stage 1's `mmm`
 * does; such a reading's interval is then void, so its outcome is "not shown" either way. And a
 * reading with a void d (a selection with no window) is "not shown", recorded as void.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-11-243-analysis.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.WEBARKIT_ROOT
    ? resolve(process.env.WEBARKIT_ROOT)
    : resolve(HERE, "..", "..");
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

// The frozen modules, imported as Stage 1's script imports them: the packages' dist, built from src/.
const trackerPkg = await imp("packages/nft-tracker/dist/index.js");
const { intrinsics } = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
const { PoseFilter } = await imp("packages/nft-tracker/dist/pose/pose_filter.js");
const { tiltDegOf } = await imp("packages/nft-tracker/dist/pose/pose_guard.js");
const metrics = await imp("examples/js/bench-metrics.mjs");
const { closedFormPose } = trackerPkg;
const {
    frameRecord,
    targetCorners,
    cornerJitter,
    summarizeRun,
    compareExports,
    countedLoopFrames,
    isLoopWrap,
    mediaKey,
    stats,
} = metrics;

// =============================================================================================
// The registered constants.
// =============================================================================================

/** The guard's threshold, and the selection "below 10°" (tilt < 10). */
export const THRESHOLD_DEG = 10;
/** t(0.975; 7), "How each criterion is read". */
export const T_975_7 = 2.3646;
/** The 95% interval for σ on 7 degrees of freedom, as a factor on s ("How each criterion is read"). */
export const SIGMA_FACTORS = Object.freeze([0.661, 2.035]);
/** Runs per block ("Seeds, runs, order"), and the sign count an outcome needs. */
export const BLOCK_RUNS = 8;
export const SIGN_COUNT = 7;
/** Route (b)'s reprojection bound, px (fatal). */
export const REPROJECTION_PX = 1e-9;
/** #228's bands, degrees, [low, high): Stage 2's Tilt row. */
export const BANDS = Object.freeze([
    [0, 1],
    [1, 3],
    [3, 5],
    [5, 7],
    [7, 10],
    [10, 15],
    [15, 20],
    [20, 30],
    [30, 40],
    [40, Infinity],
]);
/** P6's window of media time, s, inclusive. */
export const P6_WINDOW = Object.freeze([7.797, 8.831]);
/** P7's second reading leaves out [0, 1) s of media time in each counted loop. */
export const WRAP_WINDOW_S = 1;
/** The filter's parameters, as the registration (and Stage 1) asserted them: 1, 10, 1, 0.1, 1. */
export const FILTER_DEFAULTS = Object.freeze({
    DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF: 1,
    DEFAULT_POSE_FILTER_ROTATION_BETA: 10,
    DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF: 1,
    DEFAULT_POSE_FILTER_TRANSLATION_BETA: 0.1,
    DEFAULT_POSE_FILTER_D_CUTOFF: 1,
});
export const CLIPS = Object.freeze({
    static: "pinball-static.mp4",
    cross: "pinball-tilt-cross.mp4",
    table: "pinball-bench-table.mp4",
    wall: "pinball-bench.mp4",
});

for (const [k, v] of Object.entries(FILTER_DEFAULTS)) {
    if (trackerPkg[k] !== v)
        throw new Error(`${SCRIPT}: ${k} is ${trackerPkg[k]}, the registration's ${v}`);
}
if (trackerPkg.DEFAULT_POSE_GUARD_THRESHOLD_DEG !== THRESHOLD_DEG) {
    throw new Error(
        `${SCRIPT}: DEFAULT_POSE_GUARD_THRESHOLD_DEG is ${trackerPkg.DEFAULT_POSE_GUARD_THRESHOLD_DEG}, not ${THRESHOLD_DEG}`,
    );
}
/** The filter's layers as the tracker builds them for `{ mode: "one-euro" }`, from the package's constants. */
export const LAYERS = Object.freeze({
    rotation: {
        minCutOff: trackerPkg.DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
        beta: trackerPkg.DEFAULT_POSE_FILTER_ROTATION_BETA,
    },
    translation: {
        minCutOff: trackerPkg.DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
        beta: trackerPkg.DEFAULT_POSE_FILTER_TRANSLATION_BETA,
    },
    dCutOff: trackerPkg.DEFAULT_POSE_FILTER_D_CUTOFF,
});

/** A fatal check: the analysis stops, and no figure is printed. */
export class FatalCheck extends Error {}
const fatal = (why) => {
    throw new FatalCheck(why);
};

// =============================================================================================
// Pure helpers.
// =============================================================================================

/** The homography mapping four points `src` exactly onto `dst`, row-major, `G[8] = 1` (Stage 1's, copied). */
export function fitHomography4(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [u, v] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
        let p = c;
        for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]];
        if (A[c][c] === 0) return null;
        for (let r = 0; r < 8; r++) {
            if (r === c) continue;
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
        }
    }
    const g = A.map((row, i) => row[8] / row[i]);
    return Float64Array.from([...g, 1]);
}

/** The largest coordinate difference between two corner sets, px; Infinity when one is null and the other not. */
export function cornerDiff(a, b) {
    if (a === null || b === null) return a === b ? 0 : Infinity;
    let m = 0;
    for (let c = 0; c < 4; c++)
        for (let x = 0; x < 2; x++) m = Math.max(m, Math.abs(a[c][x] - b[c][x]));
    return m;
}

/** The median: the mean of the two middle values on an even count, nulls left out; null on none. */
export function median(xs) {
    const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
    if (s.length === 0) return null;
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** The sample mean and standard deviation; null when fewer than two values. */
export function meanSd(xs) {
    const n = xs.length;
    if (n < 2 || xs.some((x) => x === null)) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    return { mean, sd };
}

/** A pose's corners as the frozen `frameRecord` projects them (`poseCornersOf`), on the frame's `H`. */
function cornersOf(pose, H, K, targetPoints) {
    if (pose === null) return null;
    const result = {
        ok: true,
        pose,
        H,
        sceneKeypoints: [],
        numMatches: 0,
        numInliers: 0,
        state: "TRACK",
        quality: 0,
        trackLoss: null,
        tracking: null,
        timings: null,
    };
    return frameRecord({
        mode: "tracking",
        result,
        stageTimings: {},
        timestampMs: 0,
        mediaTimeSeconds: 0,
        targetPoints,
        K,
    }).poseCorners;
}

// =============================================================================================
// One export: its fields, V11's checks and its arms.
// =============================================================================================

const finite = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * What an arm needs that export `e` lacks (Stage 1's Q5 list), one line each; `[]` when nothing.
 * A filtered export is refused here: its `poseCorners` are the filter's, so it carries no IPPE arm
 * (Stage 1, Q5; "The pre-flight", item 5).
 */
export function missingFields(e) {
    const frames = Array.isArray(e?.frames) ? e.frames : [];
    const ok = frames.filter((f) => f.ok);
    const missing = [];
    if (frames.length === 0) missing.push("frames");
    if (e?.metricsVersion !== 2) missing.push(`metricsVersion 2 (read ${e?.metricsVersion})`);
    if (!frames.every((f) => "poseCorners" in f)) missing.push("frames[].poseCorners on every frame");
    if (!frames.every((f) => finite(f.mediaTimeSeconds)))
        missing.push("frames[].mediaTimeSeconds, finite on every frame");
    if (!frames.every((f) => finite(f.timestampMs)))
        missing.push("frames[].timestampMs, finite on every frame");
    if (!frames.every((f) => typeof f.ok === "boolean" && ["LOST", "DETECT", "TRACK"].includes(f.state)))
        missing.push("frames[].ok and state on every frame");
    if (!ok.every((f) => Array.isArray(f.H) && f.H.length === 9))
        missing.push("frames[].H, nine numbers on every ok frame");
    if (!(Number.isInteger(e?.processingResolution?.width) && Number.isInteger(e?.processingResolution?.height)))
        missing.push("processingResolution");
    if (!(Number.isInteger(e?.target?.widthPx) && Number.isInteger(e?.target?.heightPx)))
        missing.push("target.widthPx and heightPx");
    if (!finite(e?.clipDurationS)) missing.push("clipDurationS");
    if (!(Number.isInteger(e?.loops?.firstLoop) && Number.isInteger(e?.loops?.loopCount)))
        missing.push("loops");
    if (!("seed" in (e ?? {})) || !("seedPolicy" in (e ?? {}))) missing.push("seed and seedPolicy");
    if (!finite(e?.runSummary?.poseJitterPx) && e?.runSummary?.poseJitterPx !== null)
        missing.push("runSummary.poseJitterPx");
    const pf = e?.tracker?.options?.poseFilter;
    if (typeof pf?.mode !== "string") missing.push("tracker.options.poseFilter");
    else if (pf.mode !== "off")
        missing.push(
            `an unfiltered run: tracker.options.poseFilter is ${JSON.stringify(pf)}, so poseCorners are the filter's and the export carries no IPPE arm`,
        );
    const guard = e?.tracker?.options?.poseGuard;
    if (guard !== undefined && guard?.mode !== "off")
        missing.push(`an unguarded run: tracker.options.poseGuard is ${JSON.stringify(guard)}, so poseCorners are the guard's and the export carries no IPPE arm`);
    return missing;
}

/** V11's first check: the `K` every arm takes equals `intrinsics` of `processingResolution`, element by element. */
export function kCheck(K, processingResolution) {
    const want = intrinsics(processingResolution.width, processingResolution.height);
    if (K?.length !== 9) return `K has ${K?.length} elements, not 9`;
    for (let i = 0; i < 9; i++) {
        if (!Object.is(K[i], want[i]))
            return `K[${i}] is ${K[i]}, intrinsics(${processingResolution.width}, ${processingResolution.height})[${i}] ${want[i]}`;
    }
    return null;
}

/**
 * One export, derived: its frames with every arm, V11's readings, and route (b)'s null-corners
 * frames. Throws {@link FatalCheck} on a fatal check. `options.K` replaces the `K` the arms take
 * (a test's fault for {@link kCheck}); the analysis never passes one.
 */
export function deriveRun(e, name = "export", options = {}) {
    const missing = missingFields(e);
    if (missing.length > 0) fatal(`${name}: lacks what an arm needs: ${missing.join("; ")}`);
    const res = e.processingResolution;
    const K = options.K ?? intrinsics(res.width, res.height);
    const kWhy = kCheck(K, res);
    if (kWhy !== null) fatal(`${name}: V11, K: ${kWhy}`);
    const tp = targetCorners(e.target.widthPx, e.target.heightPx);
    const D = e.clipDurationS;
    const loops = { firstLoop: e.loops.firstLoop, loopCount: e.loops.loopCount };
    const frames = e.frames;

    // V11: every H finite on an ok frame.
    for (const [k, f] of frames.entries()) {
        if (f.ok && !f.H.every(finite)) fatal(`${name}: V11, frame ${k} (media ${f.mediaTimeSeconds} s) is ok with an H that is not finite`);
    }
    // The loop of every frame, by the frozen wrap rule; the counted ones by the frozen countedLoopFrames.
    const loopOf = [];
    let loop = 0;
    for (let k = 0; k < frames.length; k++) {
        try {
            if (k > 0 && isLoopWrap(frames[k - 1], frames[k], D, k)) loop++;
        } catch (err) {
            fatal(`${name}: the loop-wrap rule refuses the export: ${err.message}`);
        }
        loopOf.push(loop);
    }
    const countedSet = new Set(countedLoopFrames(frames, { clipDurationS: D, ...loops }));
    const isCounted = frames.map((f) => countedSet.has(f));

    // V11: runSummary.poseJitterPx recomputed by the frozen summarizeRun over the counted loops, bit for bit.
    const recomputed = summarizeRun(frames, {
        clipDurationS: D,
        loops,
        path: e.detection?.path ?? null,
    }).poseJitterPx;
    if (!Object.is(recomputed, e.runSummary.poseJitterPx))
        fatal(`${name}: V11, runSummary.poseJitterPx recomputed over the counted loops is not the recorded value, bit for bit`);

    // The arms, and route (b)'s recovered pose, frame by frame.
    const cfNotGood = [];
    const nullCorners = [];
    let reprojectionMax = 0;
    const derived = frames.map((f, k) => {
        const base = {
            k,
            media: f.mediaTimeSeconds,
            key: mediaKey(f.mediaTimeSeconds),
            loop: loopOf[k],
            counted: isCounted[k],
            state: f.state,
            ok: f.ok,
            inliers: f.numInliers ?? null,
            stamp: f.timestampMs,
            tilt: null,
            cfGood: null,
            recovered: null,
            arms: { IPPE: f.ok ? f.poseCorners : null, CF: null, GUARD: null },
        };
        if (!f.ok) return base;
        const cf = closedFormPose(f.H, K);
        base.cfGood = cf.good;
        if (cf.good) {
            base.tilt = tiltDegOf(cf.R);
            base.arms.CF = cornersOf(cf, f.H, K, tp);
        } else {
            cfNotGood.push(named(base));
        }
        base.arms.GUARD = base.tilt !== null && base.tilt < THRESHOLD_DEG ? base.arms.CF : f.poseCorners;
        if (f.poseCorners === null) {
            if (f.state === "TRACK") nullCorners.push(named(base));
            return base;
        }
        // Route (b)'s second check: the recovered pose reprojects the export's poseCorners (fatal).
        const G = fitHomography4(tp, f.poseCorners);
        const p = G === null ? null : closedFormPose(G, K);
        if (p === null || !p.good)
            fatal(`${name}: V11, route (b): frame ${k} (media ${f.mediaTimeSeconds} s): no pose is recovered from its poseCorners`);
        const d = cornerDiff(cornersOf(p, f.H, K, tp), f.poseCorners);
        if (!(d <= REPROJECTION_PX))
            fatal(`${name}: V11, route (b): frame ${k} (media ${f.mediaTimeSeconds} s): the recovered pose reprojects its poseCorners within ${d} px, above ${REPROJECTION_PX}`);
        reprojectionMax = Math.max(reprojectionMax, d);
        base.recovered = p;
        return base;
    });

    // Route (b): way (i) resets at a null-corners frame, way (ii) skips it with the state carried.
    const nullSet = new Set(nullCorners.map((n) => n.k));
    const filterWay = (skip) => {
        const pf = new PoseFilter(LAYERS);
        return frames.map((f, k) => {
            if (skip && nullSet.has(k)) return null;
            const pose = pf.apply({ ok: f.ok, state: f.state, pose: f.ok ? derived[k].recovered : null, timestampMs: f.timestampMs });
            return f.ok && pose !== null ? cornersOf(pose, f.H, K, tp) : null;
        });
    };
    const ways = nullCorners.length === 0 ? ["one"] : ["i", "ii"];
    const filter = {};
    if (ways.length === 1) filter.one = filterWay(false);
    else {
        filter.i = filterWay(false);
        filter.ii = filterWay(true);
    }
    for (const d of derived) {
        for (const w of ways) d.arms[`FILTER_${w}`] = filter[w][d.k];
    }
    return {
        name,
        e,
        clip: e.bundledClip ?? null,
        K,
        targetPoints: tp,
        clipDurationS: D,
        loops,
        frames: derived,
        counted: derived.filter((d) => d.counted),
        ways,
        cfNotGood,
        nullCorners,
        reprojectionMax,
        posed: derived.filter((d) => d.ok && d.arms.IPPE !== null).length,
        tiltComputed: derived.filter((d) => d.tilt !== null).length,
        okFrames: derived.filter((d) => d.ok).length,
    };
    function named(d) {
        return { k: d.k, media: d.media, loop: d.loop, counted: d.counted, state: d.state };
    }
}

// =============================================================================================
// A reading on one run, and on a block.
// =============================================================================================

/**
 * The frozen `cornerJitter` of arm `X` over a run's counted frames that `keep` admits, the loops
 * read from all of the counted frames (`include`), as Stage 1 and `compareExports` read a selection.
 */
export function armJitter(run, X, keep) {
    const g = run.counted.map((f) => ({ mediaTimeSeconds: f.media, corners: f.arms[X], src: f }));
    return cornerJitter(g, { include: (h) => keep(h.src), clipDurationS: run.clipDurationS });
}

/** The selection S of `Y − X` under `select`, with media key `drop` left out. */
const selection = (X, Y, select, drop) => (f) =>
    f.arms[X] !== null && f.arms[Y] !== null && select(f) && (drop === null || f.key !== drop);

/** One run's d = J(Y on S) − J(X on S), and what S holds: frames, windows, frames per window, the windows it emptied. */
export function runReading(run, X, Y, select, drop = null) {
    const keep = selection(X, Y, select, drop);
    const jx = armJitter(run, X, keep);
    const jy = armJitter(run, Y, keep);
    const d = jx.jitterPx === null || jy.jitterPx === null ? null : jy.jitterPx - jx.jitterPx;
    // The windows, as cornerJitter keys them (loop, one second of media time), over the counted frames.
    const per = new Map();
    const all = new Set();
    for (const f of run.counted) {
        const w = `${f.loop}:${Math.floor(f.media)}`;
        if (f.arms[X] !== null && f.arms[Y] !== null) all.add(w);
        if (keep(f)) per.set(w, (per.get(w) ?? 0) + 1);
    }
    const emptied = [...all].filter((w) => !per.has(w));
    // "A single TRACK frame on 8 or 9 inliers is named when it carries a reading."
    const lowInliers = run.counted.filter((f) => keep(f) && f.state === "TRACK" && (f.inliers === 8 || f.inliers === 9)).map((f) => ({ media: f.media, loop: f.loop, inliers: f.inliers }));
    return { x: jx.jitterPx, y: jy.jitterPx, d, frames: jx.posedFrames, windows: jx.jitterWindows, perWindow: Object.fromEntries(per), emptied, lowInliers };
}

/** Over a block's runs: the d's under `drop`, with each run's reading. */
const blockDs = (runs, X, Y, select, drop) => runs.map((r) => runReading(r, X, Y, select, drop));

/**
 * The most influential media time of `Y − X` on `runs` ("How each criterion is read"): candidates
 * are the media keys in S of any run; for each, drop it from every run, recompute each d and take
 * the median over the runs; the candidate that moves the median most, ties to the earliest.
 */
export function mostInfluential(runs, X, Y, select) {
    const base = median(blockDs(runs, X, Y, select, null).map((r) => r.d));
    if (base === null) return null;
    const keys = new Set();
    for (const r of runs) for (const f of r.counted) if (selection(X, Y, select, null)(f)) keys.add(f.key);
    let best = null;
    for (const key of [...keys].sort((a, b) => a - b)) {
        const m = median(blockDs(runs, X, Y, select, key).map((r) => r.d));
        const move = m === null ? Infinity : Math.abs(m - base);
        if (best === null || move > best.move) best = { key, move };
    }
    return best;
}

/** The interval and the count of a reading's d's; `void` when a run has no d (a selection with no window). */
export function intervalOf(ds) {
    if (ds.length !== BLOCK_RUNS || ds.some((d) => d === null)) return { void: true, ds };
    const { mean, sd } = meanSd(ds);
    const half = (T_975_7 * sd) / Math.sqrt(BLOCK_RUNS);
    return { void: false, ds, mean, sd, lo: mean - half, hi: mean + half };
}

/**
 * Whether interval `iv` and its d's show `sign` (−1 or +1): the interval wholly on that side of 0,
 * and at least 7 of the 8 d's of that sign, counting only runs `stands` admits (P7's rule for a
 * run whose two ways disagree; every run otherwise).
 */
export function shows(iv, sign, stands = null) {
    if (iv.void) return false;
    const side = sign < 0 ? iv.hi < 0 : iv.lo > 0;
    const count = iv.ds.filter((d, i) => (stands === null || stands[i]) && Math.sign(d) === sign).length;
    return side && count >= SIGN_COUNT;
}

/** The outcome of a reading with and without its media time: "held", "refuted" or "not shown". */
export function outcomeOf(withIv, withoutIv, predicted, standsWith = null, standsWithout = null) {
    if (withIv.void || withoutIv.void) return "not shown";
    if (shows(withIv, predicted, standsWith) && shows(withoutIv, predicted, standsWithout)) return "held";
    if (shows(withIv, -predicted, standsWith) && shows(withoutIv, -predicted, standsWithout)) return "refuted";
    return "not shown";
}

/** "held" when both are held, "refuted" when both are refuted, "not shown" otherwise. */
export const both = (a, b) => (a === "held" && b === "held" ? "held" : a === "refuted" && b === "refuted" ? "refuted" : "not shown");

/** One reading on a block: every figure "How each criterion is read" names, and its outcome. */
export function blockReading(runs, X, Y, select, predicted) {
    const per = blockDs(runs, X, Y, select, null);
    const best = mostInfluential(runs, X, Y, select);
    const without = best === null ? null : blockDs(runs, X, Y, select, best.key);
    const withIv = intervalOf(per.map((p) => p.d));
    const withoutIv = without === null ? { void: true, ds: [] } : intervalOf(without.map((p) => p.d));
    let at = null;
    if (best !== null) {
        const hits = runs.flatMap((r) => r.counted.filter((f) => f.key === best.key && selection(X, Y, select, null)(f)));
        at = { media: best.key / 1e6, occurrences: hits.length, states: [...new Set(hits.map((h) => h.state))], inliers: hits.map((h) => h.inliers), tilts: hits.map((h) => h.tilt) };
    }
    const spread = (xs) => {
        const m = meanSd(xs);
        return m === null ? null : { s: m.sd, lo: m.sd * SIGMA_FACTORS[0], hi: m.sd * SIGMA_FACTORS[1] };
    };
    return {
        per,
        best,
        without,
        withIv,
        withoutIv,
        at,
        spreadX: spread(per.map((p) => p.x)),
        spreadY: spread(per.map((p) => p.y)),
        spreadD: withIv.void ? null : withIv.sd,
        outcome: outcomeOf(withIv, withoutIv, predicted),
    };
}

// =============================================================================================
// P7: the filter, both ways where a run has a null-corners frame.
// =============================================================================================

const whole = () => true;
const afterWrapWindow = (f) => f.media >= WRAP_WINDOW_S;

/**
 * P7 on a static block: FILTER − IPPE on the whole clip and without [0, 1) s of each counted loop,
 * once per way. A run with a null-corners frame has its d stand only where both ways give it the
 * same sign; elsewhere it counts toward neither outcome. P7 holds or is refuted only if both ways
 * give that outcome. A block with no such frame has one way.
 */
export function p7(runs) {
    const twoWays = runs.some((r) => r.ways.length === 2);
    const wayArm = (r, w) => (r.ways.length === 1 ? "FILTER_one" : `FILTER_${w}`);
    const ways = twoWays ? ["i", "ii"] : ["one"];
    // Each run's arms under one way, as a run view the readings take.
    const view = (w) => runs.map((r) => ({ ...r, counted: r.counted.map((f) => ({ ...f, arms: { ...f.arms, FILTER: f.arms[wayArm(r, w)] } })) }));
    const readings = { whole, "without the wraps' first second": afterWrapWindow };
    const result = { ways, perWay: {}, outcome: null };
    for (const w of ways) {
        result.perWay[w] = {};
        for (const [rn, sel] of Object.entries(readings)) result.perWay[w][rn] = blockReading(view(w), "IPPE", "FILTER", sel, -1);
    }
    if (twoWays) {
        for (const rn of Object.keys(readings)) {
            const a = result.perWay.i[rn];
            const b = result.perWay.ii[rn];
            const standsOf = (pa, pb) => runs.map((r, i) => r.ways.length === 1 || (pa?.[i]?.d !== null && pb?.[i]?.d !== null && Math.sign(pa[i].d) === Math.sign(pb[i].d)));
            const sWith = standsOf(a.per, b.per);
            const sWithout = standsOf(a.without, b.without);
            for (const x of [a, b]) {
                x.stands = { with: sWith, without: sWithout };
                x.outcome = outcomeOf(x.withIv, x.withoutIv, -1, sWith, sWithout);
            }
        }
    }
    const perWayOutcome = (w) => both(result.perWay[w].whole.outcome, result.perWay[w]["without the wraps' first second"].outcome);
    result.wayOutcomes = Object.fromEntries(ways.map((w) => [w, perWayOutcome(w)]));
    result.outcome = twoWays ? both(result.wayOutcomes.i, result.wayOutcomes.ii) : result.wayOutcomes.one;
    // "Where the whole clip is held and the reading without the wraps is not": per way, since each way is a reading of its own.
    result.wrapsNote = Object.fromEntries(ways.map((w) => [w, result.perWay[w].whole.outcome === "held" && result.perWay[w]["without the wraps' first second"].outcome !== "held"]));
    // Stage 2's State row: every criterion is read on its selection's TRACK frames too, side by side. Reported, not deciding P7.
    result.track = {};
    for (const w of ways) {
        result.track[w] = {};
        for (const [rn, sel] of Object.entries(readings)) result.track[w][rn] = blockReading(view(w), "IPPE", "FILTER", (f) => sel(f) && f.state === "TRACK", -1);
    }
    return result;
}

// =============================================================================================
// P6: the guard's switches on cross.
// =============================================================================================

/**
 * The guard's switches of one run: a change of estimator (tilt < 10 against ≥ 10) between two
 * consecutive counted frames that both have a tilt and both arms' corners; one at a step back in
 * media time is the wrap's, counted apart. Each switch belongs to the loop of its second frame.
 */
export function switchesOf(run) {
    const both = run.counted.filter((f) => f.tilt !== null && f.arms.CF !== null && f.arms.IPPE !== null);
    const sw = [];
    for (let i = 1; i < both.length; i++) {
        const p = both[i - 1];
        const q = both[i];
        if (p.tilt < THRESHOLD_DEG !== q.tilt < THRESHOLD_DEG)
            sw.push({ media: q.media, loop: q.loop, atWrap: q.media < p.media, tiltFrom: p.tilt, tiltTo: q.tilt, state: q.state, inliers: q.inliers });
    }
    return sw;
}

/** P6 on a cross block: held, refuted (chatter) or not shown, with each loop's switches in the footage. */
export function p6(runs) {
    const perRun = runs.map((r) => {
        const sw = switchesOf(r);
        const loops = [];
        for (let L = r.loops.firstLoop; L < r.loops.firstLoop + r.loops.loopCount; L++) {
            const inFootage = sw.filter((s) => !s.atWrap && s.loop === L);
            loops.push({ loop: L, switches: inFootage });
        }
        // "The loop and its frames are named": each loop's frames that carry a tilt and both arms' corners, by side of 10°.
        for (const l of loops) {
            const fr = r.counted.filter((f) => f.loop === l.loop && f.tilt !== null && f.arms.CF !== null && f.arms.IPPE !== null);
            l.frames = { below: fr.filter((f) => f.tilt < THRESHOLD_DEG).length, atOrAbove: fr.filter((f) => f.tilt >= THRESHOLD_DEG).length, from: fr.length ? fr[0].media : null, to: fr.length ? fr[fr.length - 1].media : null };
        }
        return { name: r.name, loops, atWrap: sw.filter((s) => s.atWrap) };
    });
    const allLoops = perRun.flatMap((r) => r.loops);
    const held =
        allLoops.length === BLOCK_RUNS * 4 &&
        allLoops.every((l) => l.switches.length === 1 && l.switches[0].media >= P6_WINDOW[0] && l.switches[0].media <= P6_WINDOW[1]);
    const chattering = perRun.filter((r) => r.loops.some((l) => l.switches.length >= 3)).length;
    const outcome = held ? "held" : chattering >= 2 ? "refuted" : "not shown";
    const named = perRun.flatMap((r) => r.loops.filter((l) => !(l.switches.length === 1 && l.switches[0].media >= P6_WINDOW[0] && l.switches[0].media <= P6_WINDOW[1])).map((l) => ({ run: r.name, ...l })));
    return { perRun, outcome, chattering, named };
}

// =============================================================================================
// The descriptive readings: the corner distance by compareExports, the spreads.
// =============================================================================================

/**
 * `DEFINITIONS.poseCornerDistancePx` between arm `X` and arm `Y` of one run on the frames `keep`
 * admits, read by calling the frozen `compareExports` on two exports built from the one: each a
 * copy whose `poseCorners` are that arm's, nulled outside `keep` and outside the counted loops.
 */
export function cornerDistance(run, X, Y, keep) {
    const copy = (arm) => ({
        ...run.e,
        frames: run.e.frames.map((f, k) => {
            const d = run.frames[k];
            // Both arms' corners, so that the frozen pairing (the k-th occurrence of a media time in each copy) pairs one frame with itself.
            return { ...f, poseCorners: d.counted && keep(d) && d.arms[X] !== null && d.arms[Y] !== null ? d.arms[arm] : null };
        }),
    });
    let cmp;
    try {
        cmp = compareExports(copy(X), copy(Y));
    } catch (err) {
        // The one refusal a selection can cause, two copies of one run with no posed frame under H: void. Any other is a fault.
        if (/no media time both runs posed/.test(err.message)) return { distancePx: null, frames: 0 };
        throw err;
    }
    return cmp.pose === null ? { distancePx: null, frames: 0 } : { distancePx: cmp.pose.poseCornerDistancePx, frames: cmp.pose.commonFrames };
}

const bandName = ([lo, hi]) => (hi === Infinity ? `over ${lo}` : `${lo}–${hi}`);
const inBand = ([lo, hi]) => (f) => f.tilt !== null && f.tilt >= lo && f.tilt < hi;

/**
 * Stage 2's Tilt row, by the maintainer's ruling of 2026-11-11 (the addendum's entry 1): every
 * band's frames and windows; the CF − IPPE jitter difference below 10° only; the corner distance
 * CF to IPPE at 10° and above.
 */
export function tiltBands(run) {
    return BANDS.map((band) => {
        const sel = inBand(band);
        const r = runReading(run, "IPPE", "CF", sel);
        const above = band[0] >= THRESHOLD_DEG;
        return {
            band: bandName(band),
            frames: r.frames,
            windows: r.windows,
            d: above ? undefined : r.d,
            distance: above ? cornerDistance(run, "IPPE", "CF", sel) : undefined,
        };
    });
}

// =============================================================================================
// The covariates that are not pose figures, and V9's and V10's readings.
// =============================================================================================

/** p50 and max, or nulls. */
const p50max = (xs) => {
    const s = stats(xs.filter(Number.isFinite));
    return { p50: s.p50, max: s.max, n: s.n };
};

export function covariates(run) {
    const e = run.e;
    const counted = e.frames.filter((_, k) => run.frames[k].counted);
    const states = { LOST: 0, DETECT: 0, TRACK: 0 };
    for (const f of counted) states[f.state]++;
    const perLoop = {};
    for (const f of run.frames) perLoop[f.loop] = (perLoop[f.loop] ?? 0) + 1;
    const gaps = (key) => {
        const g = [];
        for (let k = 1; k < e.frames.length; k++) g.push(e.frames[k][key] - e.frames[k - 1][key]);
        return g;
    };
    const stampGaps = gaps("timestampMs");
    const mediaGaps = gaps("mediaTimeSeconds").filter((x) => x >= 0);
    const summary = summarizeRun(e.frames, { clipDurationS: run.clipDurationS, loops: run.loops, path: e.detection?.path ?? null });
    return {
        frames: e.frames.length,
        ticks: e.ticks ?? null,
        countedFrames: counted.length,
        states,
        framesPerLoop: perLoop,
        wraps: run.frames.filter((f, k) => k > 0 && f.loop !== run.frames[k - 1].loop).length,
        stampStepsBack: stampGaps.filter((g) => !(g > 0)).length,
        stampGapMs: p50max(stampGaps),
        mediaGapS: p50max(mediaGaps),
        acquireMs: p50max(counted.map((f) => f.timings?.acquire)),
        totalMs: p50max(counted.map((f) => f.timings?.total)),
        trackStepMsP50: summary.trackStepMs.p50,
        lostVisibility: e.run?.lostVisibility ?? null,
        runOrder: e.run?.order ?? null,
        seed: e.seed,
    };
}

// =============================================================================================
// The report.
// =============================================================================================

const fx = (x) => (x === null || x === undefined ? "n/a" : String(x));
const f4 = (x) => (x === null || x === undefined ? "n/a" : x === Infinity ? "inf" : x.toFixed(4));
const fd = (x) => (x === null || x === undefined ? "n/a" : x.toFixed(6));

function checksLines(run, say) {
    say(`- fields each arm needs: present; filter off; metricsVersion 2`);
    say(`- V11, K = intrinsics(${run.e.processingResolution.width}, ${run.e.processingResolution.height}), element by element: pass`);
    say(`- V11, every H finite on an ok frame: pass (${run.okFrames} ok frames)`);
    say(`- V11, runSummary.poseJitterPx recomputed over the counted loops: equal, bit for bit`);
    say(`- V11, route (b)'s reprojection within ${REPROJECTION_PX} px on every frame with poseCorners: pass`);
    say(`- V11, CF's good on every ok frame: ${run.cfNotGood.length === 0 ? "yes" : `no, on ${run.cfNotGood.length}, named:`}`);
    for (const f of run.cfNotGood) say(`  - frame ${f.k}, media ${fd(f.media)} s, loop ${f.loop} (${f.counted ? "counted" : "not counted"}), ${f.state}`);
    say(`- route (b), ok TRACK frames with null poseCorners: ${run.nullCorners.length}${run.nullCorners.length ? ", named (counted, never fatal; P7 read two ways):" : ""}`);
    for (const f of run.nullCorners) say(`  - ${run.name}: frame ${f.k}, media ${fd(f.media)} s, loop ${f.loop}, ${f.counted ? "counted" : "warm-up or after the counted loops"}`);
    say(`- the tilt computed on ${run.tiltComputed} of ${run.okFrames} ok frames`);
}

function covariateLines(c, say) {
    say(`- run.order ${fx(c.runOrder)}, seed ${fx(c.seed)}; frames ${c.frames}, ticks ${fx(c.ticks)} (window 2000: ${c.ticks === null ? "not recorded" : c.ticks <= 2000 ? "within" : "NOT within"}); counted frames ${c.countedFrames}: LOST ${c.states.LOST}, DETECT ${c.states.DETECT}, TRACK ${c.states.TRACK}`);
    say(`- frames processed per loop: ${Object.entries(c.framesPerLoop).map(([l, n]) => `loop ${l} ${n}`).join(", ")}; wraps ${c.wraps}; timestampMs steps back ${c.stampStepsBack} times`);
    say(`- gaps between processed frames: timestampMs p50 ${f4(c.stampGapMs.p50)} ms, max ${f4(c.stampGapMs.max)} ms; media time p50 ${f4(c.mediaGapS.p50)} s, max ${f4(c.mediaGapS.max)} s (steps back left out)`);
    say(`- counted loops: acquire p50 ${f4(c.acquireMs.p50)} ms, total p50 ${f4(c.totalMs.p50)} ms, trackStepMs p50 ${f4(c.trackStepMsP50)} ms; run.lostVisibility ${fx(c.lostVisibility)}`);
}

/** --checks-only on each export: returns the report's lines; throws FatalCheck on a fatal check. */
export function checksOnly(named) {
    const out = [];
    const say = (l = "") => out.push(l);
    say(`# ${SCRIPT} --checks-only`);
    say();
    say("No jitter, distance, difference or tilt of any arm is printed, and no switch is counted.");
    for (const { name, e } of named) {
        const run = deriveRun(e, name);
        say();
        say(`## ${name}: ${e.bundledClip ?? "(no clip)"}`);
        say();
        checksLines(run, say);
        covariateLines(covariates(run), say);
    }
    return out;
}

function readingLines(title, R, say, predicted, descriptive = false) {
    say(`#### ${title}`);
    say();
    say(descriptive ? "descriptive: no direction is predicted and no outcome is read" : `predicted: ${predicted < 0 ? "negative" : "positive"}; outcome: **${R.outcome}**`);
    say();
    say("| run | X | Y | d = Y − X | frames | windows | windows emptied | d without the media time |");
    say("|---|---|---|---|---|---|---|---|");
    R.per.forEach((p, i) => {
        say(`| ${i + 1} | ${fx(p.x)} | ${fx(p.y)} | ${fx(p.d)} | ${p.frames} | ${p.windows} | ${p.emptied.length ? p.emptied.join(" ") : "none"} | ${R.without ? fx(R.without[i].d) : "n/a"} |`);
    });
    say();
    // The count, by P7's rule where it applies: a run whose two ways disagree counts toward neither sign.
    const ivLine = (iv, stands) => {
        if (iv.void) return "void: a run has no d";
        const count = (sign) => iv.ds.filter((d, i) => (!stands || stands[i]) && Math.sign(d) === sign).length;
        const signs = descriptive ? `${count(-1)} below 0 and ${count(1)} above` : `${count(predicted)} of 8 of the predicted sign, ${count(-predicted)} of the opposite`;
        return `d̄ ${fx(iv.mean)}, s_d ${fx(iv.sd)}, interval [${fx(iv.lo)}, ${fx(iv.hi)}], ${signs}${stands ? " (standing runs only)" : ""}`;
    };
    say(`- with every media time: ${ivLine(R.withIv, R.stands?.with)}`);
    say(`- the most influential media time: ${R.at ? `${fd(R.at.media)} s, ${R.at.occurrences} occurrences; state ${R.at.states.join(", ")}; inliers ${R.at.inliers.join(", ")}; tilt ${R.at.tilts.map((t) => (t === null ? "n/a" : t.toFixed(2))).join(", ")} deg` : "none"}`);
    say(`- without it: ${ivLine(R.withoutIv, R.stands?.without)}`);
    if (R.stands) say(`- runs whose d stands (both ways the same sign): with ${R.stands.with.filter(Boolean).length} of 8, without ${R.stands.without.filter(Boolean).length} of 8`);
    const sp = (s) => (s === null ? "n/a" : `${fx(s.s)} [${fx(s.lo)}, ${fx(s.hi)}]`);
    say(`- each arm's spread over the runs, s [95% interval]: X ${sp(R.spreadX)}; Y ${sp(R.spreadY)}`);
    for (const [i, p] of R.per.entries()) if (p.lowInliers.length) say(`- run ${i + 1}, TRACK frames on 8 or 9 inliers in the selection, named: ${p.lowInliers.map((f) => `${fd(f.media)} s (loop ${f.loop}, ${f.inliers} inliers)`).join(", ")}`);
    for (const [i, p] of R.per.entries()) say(`- run ${i + 1}, frames per window: ${Object.entries(p.perWindow).map(([w, n]) => `${w} ${n}`).join(", ")}`);
    say();
}

/** --block on eight exports of one clip: returns the report's lines; throws FatalCheck on a fatal check. */
export function analyseBlock(named) {
    if (named.length !== BLOCK_RUNS) fatal(`a block is ${BLOCK_RUNS} exports of one clip, given ${named.length}`);
    // In the block's order (V9 reads the runs "in order through each block"): by run.order where every export has one.
    if (named.every(({ e }) => Number.isInteger(e?.run?.order))) named = [...named].sort((a, b) => a.e.run.order - b.e.run.order);
    // V11 first, on every export, before any figure.
    const runs = named.map(({ name, e }) => deriveRun(e, name));
    const clips = new Set(runs.map((r) => r.clip));
    if (clips.size !== 1) fatal(`a block is one clip, given ${[...clips].join(", ")}`);
    const clip = runs[0].clip;
    const out = [];
    const say = (l = "") => out.push(l);
    say(`# ${SCRIPT} --block ${clip}`);
    say();
    say(`K assumed: intrinsics(${runs[0].e.processingResolution.width}, ${runs[0].e.processingResolution.height}), 60° of horizontal field, for every arm and figure.`);
    say();
    say("## V11's checks and the covariates, per run");
    for (const r of runs) {
        say();
        say(`### ${r.name}`);
        say();
        checksLines(r, say);
        covariateLines(covariates(r), say);
    }
    say();
    say("## The tilt bands, per run (Stage 2; the addendum's entry 1)");
    say();
    say("| run | band | frames | windows | CF − IPPE jitter difference (below 10°) | corner distance CF to IPPE, px, and its frames (10° and above) |");
    say("|---|---|---|---|---|---|");
    for (const r of runs) {
        for (const b of tiltBands(r)) say(`| ${r.name} | ${b.band} | ${b.frames} | ${b.windows} | ${b.d === undefined ? "—" : fx(b.d)} | ${b.distance === undefined ? "—" : `${fx(b.distance.distancePx)} (${b.distance.frames})`} |`);
    }
    say();
    const below = (f) => f.tilt !== null && f.tilt < THRESHOLD_DEG;
    const track = (sel) => (f) => sel(f) && f.state === "TRACK";
    const result = { clip, criteria: {}, descriptive: {} };
    const criterion = (id, title, X, Y, sel, predicted, withTrack, descriptive = false) => {
        say(`### ${id}: ${title}`);
        say();
        const R = blockReading(runs, X, Y, sel, predicted);
        readingLines(`${id}, the selection`, R, say, predicted, descriptive);
        const T = blockReading(runs, X, Y, track(sel), predicted);
        readingLines(`${id}, the selection's TRACK frames`, T, say, predicted, descriptive);
        if (descriptive) {
            result.descriptive[id] = { selection: R, track: T };
            return;
        }
        const outcome = withTrack ? both(R.outcome, T.outcome) : R.outcome;
        say(`**${id}: ${outcome}**${withTrack ? " (held only if held on both, refuted only if refuted on both)" : " (on the selection; the TRACK frames reported beside it)"}`);
        say();
        result.criteria[id] = { outcome, selection: R, track: T };
    };
    say("## The criteria");
    say();
    if (clip === CLIPS.static) {
        criterion("P1", "CF − IPPE, static, below 10°", "IPPE", "CF", below, -1, false);
        say("### P7: FILTER − IPPE, static, route (b)");
        say();
        const P = p7(runs);
        for (const w of P.ways) {
            for (const [rn, R] of Object.entries(P.perWay[w])) readingLines(`P7, way ${w === "one" ? "(one way: no null-corners frame)" : `(${w})`}, ${rn}`, R, say, -1);
            for (const [rn, R] of Object.entries(P.track[w])) readingLines(`P7, way ${w}, ${rn}, its TRACK frames (reported beside it, not deciding P7)`, R, say, -1);
            say(`P7 by way ${w}: ${P.wayOutcomes[w]}${P.wrapsNote[w] ? "; the whole clip is held and the reading without the wraps is not: the filter's reading is the wrap's" : ""}`);
            say();
        }
        say(`**P7: ${P.outcome}**`);
        say();
        result.criteria.P7 = P;
    } else if (clip === CLIPS.table) {
        criterion("P2", "CF − IPPE, table, below 10°", "IPPE", "CF", below, -1, true);
    } else if (clip === CLIPS.cross) {
        criterion("P3", "CF − IPPE, cross, below 10°", "IPPE", "CF", below, -1, true);
        criterion("P4", "GUARD − IPPE, cross, the whole clip", "IPPE", "GUARD", whole, +1, false);
        criterion("P5", "GUARD − CF, cross, the whole clip", "CF", "GUARD", whole, +1, false);
        const P = p6(runs);
        say("### P6: the guard's switches in the footage, per counted loop");
        say();
        for (const r of P.perRun) {
            say(`- ${r.name}: ${r.loops.map((l) => `loop ${l.loop}: ${l.switches.length} (${l.switches.map((s) => `${fd(s.media)} s, ${s.state}, ${s.inliers} inliers, ${s.tiltFrom.toFixed(2)}° to ${s.tiltTo.toFixed(2)}°`).join("; ") || "none"})`).join("; ")}; at a wrap, apart: ${r.atWrap.length}`);
        }
        say(`- loops other than exactly one switch inside [${P6_WINDOW[0]}, ${P6_WINDOW[1]}] s: ${P.named.length}; runs with a loop of three or more: ${P.chattering}`);
        for (const l of P.named) say(`  - ${l.run}, loop ${l.loop}: ${l.switches.length} switches; its frames with a tilt and both arms: ${l.frames.below} below 10°, ${l.frames.atOrAbove} at or above, media ${fd(l.frames.from)} to ${fd(l.frames.to)} s`);
        say();
        say(`**P6: ${P.outcome}**`);
        say();
        result.criteria.P6 = P;
    } else if (clip === CLIPS.wall) {
        say("The wall clip carries no criterion: CF − IPPE below 10° is descriptive (the maintainer's ruling of 2026-11-10).");
        say();
        criterion("Wall", "CF − IPPE, wall, below 10°, descriptive", "IPPE", "CF", below, -1, false, true);
    } else {
        fatal(`${clip}: not one of the campaign's clips`);
    }
    say("## Descriptive readings, never criteria");
    say();
    say("| run | arm | poseSpreadPx over the counted loops |");
    say("|---|---|---|");
    for (const r of runs) {
        // Each run's own arms: a run with a null-corners frame has the filter two ways, any other one.
        const arms = ["IPPE", "CF", "GUARD", ...(clip === CLIPS.static ? r.ways.map((w) => `FILTER_${w}`) : [])];
        for (const a of arms) say(`| ${r.name} | ${a} | ${fx(armJitter(r, a, (f) => f.arms[a] !== null).spreadPx)} |`);
    }
    say();
    if (clip === CLIPS.static) {
        say("FILTER − IPPE's corner distance, the whole clip, outside the counted loops nulled:");
        say();
        for (const r of runs) {
            for (const w of r.ways) {
                const c = cornerDistance(r, "IPPE", `FILTER_${w}`, whole);
                say(`- ${r.name}, way ${w}: ${fx(c.distancePx)} px over ${c.frames} frames`);
            }
        }
        say();
    }
    // V9 and V10: readings, not gates.
    say("## V9, the thermal reading, and V10, visibility (readings, not gates)");
    say();
    const cs = runs.map((r) => covariates(r));
    say("| run | acquire p50, ms | trackStepMs p50, ms | lostVisibility |");
    say("|---|---|---|---|");
    cs.forEach((c, i) => say(`| ${runs[i].name} | ${f4(c.acquireMs.p50)} | ${f4(c.trackStepMsP50)} | ${fx(c.lostVisibility)} |`));
    const first = cs[0];
    const last = cs[cs.length - 1];
    const dAcq = last.acquireMs.p50 - first.acquireMs.p50;
    const dStep = last.trackStepMsP50 - first.trackStepMsP50;
    const relStep = dStep / first.trackStepMsP50;
    say();
    say(`- the last run against the first: acquire p50 ${f4(dAcq)} ms, trackStepMs p50 ${f4(dStep)} ms (${(100 * relStep).toFixed(1)}%). M3's bounds, quoted as M3's: 1.9 ms and 6.6%. Flagged: ${dAcq > 1.9 || relStep > 0.066 ? "yes" : "no"}`);
    say();
    result.lines = out;
    return result;
}

// =============================================================================================
// The command line.
// =============================================================================================

function main(argv) {
    const checks = argv.includes("--checks-only");
    const block = argv.includes("--block");
    const files = argv.filter((a) => !a.startsWith("--"));
    if (checks === block || files.length === 0) {
        process.stderr.write(`usage: node docs/benchmarks/${SCRIPT} --checks-only <export.json> [...] | --block <8 exports of one clip>\n`);
        process.exit(2);
    }
    const named = files.map((f) => ({ name: f.split(/[\\/]/).pop(), e: JSON.parse(readFileSync(f, "utf8")) }));
    try {
        const lines = checks ? checksOnly(named) : analyseBlock(named).lines;
        process.stdout.write(lines.join("\n") + "\n");
    } catch (err) {
        if (err instanceof FatalCheck) {
            process.stderr.write(`${SCRIPT}: fatal: ${err.message}\n`);
            process.exit(1);
        }
        throw err;
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
