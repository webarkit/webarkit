/*
 *  2026-10-18-137-stage1-probe.mjs
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
 * #137's Stage 1 probe: how much of the arm-to-arm difference in jitterPx on
 * the hand-held clips is carried by the detections the gate admits on 4
 * inliers, and what remains of the draw's leverage once they are removed. The
 * computation behind docs/benchmarks/2026-10-18-137-stage1-probe.md. It reads
 * the committed exports beside it and the frozen metrics module, and writes
 * nothing. No device, no bench page, no replay: read-only on evidence.
 *
 *     node docs/benchmarks/2026-10-18-137-stage1-probe.mjs
 *
 * The method, so that it can be redone without this file:
 *
 * 1. The exports: every committed export whose footage is a hand-held clip
 *    (pinball-bench.mp4, pinball-bench-table.mp4, acquire-test/wall-30fps.mp4,
 *    acquire-test/wall-native-fps.mp4), whose metricsVersion is 1 and whose
 *    frames carry corners, as compareExports requires. The inventory prints
 *    every hand-held export and why one is not read.
 * 2. Each run's frames: for the M3 session exports, which record loops, the
 *    counted loops 1 to 4 (countedLoopFrames with the export's loops and
 *    clipDurationS), as 2026-10-16-m3-handheld-frame-set.mjs reads them; for
 *    the tuning-pass exports, which record none, the export's frames as they
 *    are (300-tick windows), as 2026-10-16-frame-set-overlap.mjs reads rounds
 *    1 and 2. The recomputed whole-set jitterPx must equal the recorded
 *    runSummary.jitterPx exactly (fatal).
 * 3. A "4-inlier detection frame" is a frame with state DETECT and numInliers
 *    4: a frame whose corners are the detection's own fit on exactly four
 *    correspondences. Only such a frame with corners enters jitterPx, so the
 *    counts give both. The worker arm poses no DETECT frame (a consumed
 *    detection is confirmed into TRACK by the tracking step on the consuming
 *    frame, or the frame is LOST without corners), and its job records carry
 *    no inlier count, so the exclusion removes nothing there; the script
 *    checks and prints that rather than assuming it.
 * 4. The readings. "none": every frame with corners, the record's figure.
 *    "X4": the 4-inlier detection frames excluded, the question's reading.
 *    "X6": detection frames with 4 to 6 inliers excluded, the range #137's
 *    comment of 2026-10-16 names. "XD": every DETECT frame excluded, the
 *    ceiling of what any gate acting on detections alone could remove from
 *    the figure. "X8": every detection below 8 inliers excluded, the reading
 *    that matches #137's gate, minTrackedPatches (8), which its body says
 *    never sees a detection; it differs from X6 by the 7-inlier detections.
 *    Each is cornerJitter's own include option; a non-DETECT frame is always
 *    kept, and no H changes, so every movement is frame selection.
 * 5. Per pair (question 1): the whole-set difference and the common-set
 *    difference under each reading, sign first arm minus second. The common
 *    set is the media times (mediaKey(mediaTimeSeconds)) both runs pose under
 *    that reading, rebuilt per reading, and each run's jitterPx on it is
 *    cornerJitter with include restricted to it, as compareExports builds
 *    them. Frame-set part = whole − common.
 * 6. Per replicate group (question 2): runs of one arm, one session and one
 *    clip. Under each reading: each run's whole-set jitterPx, the largest to
 *    smallest ratio and the range (the form #137's comment reports the draw's
 *    leverage in, over seeds), and the same on the media times every member
 *    of the group poses.
 * 7. The refutation attempt on question 2's figure: a jackknife. Under X4,
 *    for each run, every posed frame is deleted alone and jitterPx recomputed;
 *    the frame whose deletion moves it most is printed with its state and
 *    inlier count, and the group's ratio is recomputed with each run's most
 *    influential frame deleted. If the remaining spread sits in single frames,
 *    the jackknife names them; if it does not, no single frame carries it.
 *    Deletions that move jitterPx by exactly the same amount are a tie, and
 *    are printed as one: when the named frame's window holds exactly four
 *    posed frames, any deletion drops the window and all four tie, so the
 *    frame named is the first in frame order, not a uniquely influential one.
 * 8. Window diagnostics: each excluded frame's one-second window, keyed as
 *    cornerJitter keys it, with the window's frame count before and after the
 *    exclusion and whether it was eligible (at least 4 frames) before. The
 *    window count so obtained must equal the module's jitterWindows under
 *    every reading of every run (fatal).
 * 9. Per run, the same jackknife under "none", the record's own reading, so
 *    that each large whole-set value in the record can be said to be one
 *    frame, or not, and of what support.
 * 10. The independent reviewer's figures (the document's "Independent: a
 *    reviewer's attempt"), recomputed here on the two M3 sync groups: the
 *    residual's share by window and by frame and the DETECT frames' share
 *    under X4, which repeats cornerJitter's regression to attribute what it
 *    does not expose and is checked to reproduce its jitterPx bit for bit;
 *    the mean of the four corners on the frames the document names; and the
 *    ratio under X4 over each loop alone, over all frames, and over loops 1
 *    to 4 with each loop's first and last second removed.
 *
 * The checks, all fatal: a failed check exits non-zero naming the run or the
 * pair and the values that disagree, and no figure is printed after it. Per
 * run, the recomputed whole-set jitterPx is a finite number equal to the
 * recorded runSummary.jitterPx, with zero tolerance (the same function on the
 * same frames in the same order); the window keying reproduces jitterWindows
 * under every reading; a frame counted as a 4-inlier detection has corners
 * only if it is posed; a posed frame is in a window (it always is, by
 * construction, and the check is on that rather than on a property read of
 * undefined). Per pair, both exports record a processing resolution and the
 * two are equal, reported with the sizes observed as compareExports reports
 * them; the common set is not empty under "none" and
 * both runs' common-set jitterPx are finite; under an exclusion an empty
 * common set or a null jitterPx is printed as such, not fatal, since an
 * exclusion may legitimately empty a set. Exports that cannot be compared are
 * listed, not read.
 *
 * A known limitation, as the frame-set script's and the stall check's: this
 * script is covered by no test and by no format check (`docs/` is outside
 * both), so a change in a dependency or in the exports' shape could break it
 * without notice while the figures it produced stay in the record; and the
 * tool has no tests, so a defect in it would produce a wrong result
 * reproducibly. Its guards are the reproduction check and the window-keying
 * check above, which catch a changed cornerJitter or a changed export, not a
 * defect of its own. The checks are fatal, so no figure is printed after a
 * failed check.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = "2026-10-18-137-stage1-probe.mjs";

const fatal = (message) => {
    console.error(`${SCRIPT}: ${message}`);
    process.exit(1);
};

// The frozen metrics module, its absence reported as every other failure here is: through
// fatal, naming what is missing, rather than as an unhandled rejection with a stack trace.
const METRICS_PATH = join(HERE, "../../examples/js/bench-metrics.mjs");
let metrics;
try {
    metrics = await import(pathToFileURL(METRICS_PATH).href);
} catch (err) {
    fatal(`cannot import ${METRICS_PATH}: ${err?.message ?? err}`);
}
const { cornerJitter, countedLoopFrames, isLoopWrap, mediaKey, unwrapMediaTimes, METRICS_VERSION, JITTER_WINDOW_S } = metrics;
const g = (v, d = 4) => (v === null || v === undefined ? "null" : v.toFixed(d));
const f = (v, d = 4) => (v === null || v === undefined ? "null" : (v >= 0 ? "+" : "") + v.toFixed(d));

const HAND_HELD = new Set([
    "pinball-bench.mp4",
    "pinball-bench-table.mp4",
    "acquire-test/wall-30fps.mp4",
    "acquire-test/wall-native-fps.mp4",
]);
const CLIP_SHORT = { "pinball-bench.mp4": "wall", "pinball-bench-table.mp4": "table" };

// ---- the readings ---------------------------------------------------------
const isDetect = (fr) => fr.state === "DETECT";
const READINGS = {
    none: () => true,
    X4: (fr) => !(isDetect(fr) && fr.numInliers === 4),
    X6: (fr) => !(isDetect(fr) && fr.numInliers >= 4 && fr.numInliers <= 6),
    X8: (fr) => !(isDetect(fr) && fr.numInliers < 8),
    XD: (fr) => !isDetect(fr),
};
const READING_NAMES = Object.keys(READINGS);

// ---- inventory ------------------------------------------------------------
const inventory = [];
const runs = new Map(); // name -> run
for (const file of readdirSync(HERE).filter((n) => n.endsWith(".json")).sort()) {
    const name = file.replace(/\.json$/, "");
    const e = JSON.parse(readFileSync(join(HERE, file), "utf8"));
    const clip = e.bundledClip ?? e.source ?? "(none)";
    if (!HAND_HELD.has(clip)) continue;
    let why = null;
    if (e.metricsVersion !== METRICS_VERSION) {
        why = `metricsVersion ${e.metricsVersion ?? "(none)"}, not ${METRICS_VERSION}: its frames carry no corners`;
    } else if (!Array.isArray(e.frames) || !e.frames.some((fr) => fr.corners)) {
        why = "no frame with corners";
    }
    inventory.push({ name, clip, why });
    if (why) continue;
    const hasLoops = !!e.loops;
    const frames = hasLoops
        ? countedLoopFrames(e.frames, { clipDurationS: e.clipDurationS, ...e.loops })
        : e.frames;
    const D = e.clipDurationS ?? null;
    const whole = cornerJitter(frames, { clipDurationS: D });
    if (!Number.isFinite(whole.jitterPx)) {
        fatal(`${name}: whole-set jitterPx is ${whole.jitterPx}, not a finite number`);
    }
    if (whole.jitterPx !== e.runSummary.jitterPx) {
        fatal(`${name}: whole-set jitterPx recomputed as ${whole.jitterPx}, recorded ${e.runSummary.jitterPx}`);
    }
    for (const fr of frames) {
        if (fr.corners && !fr.ok) fatal(`${name}: a frame with corners is not ok (media time ${fr.mediaTimeSeconds})`);
    }
    runs.set(name, { name, e, clip, hasLoops, frames, D, whole });
}
// Every section below walks the runs in one order, by name, so that no printed section's order
// depends on what readdirSync returns on a given filesystem. The file list above is sorted too,
// but with the .json extension on, under which "-" sorts before "." and tracking-table-repeat
// comes before tracking-table; by name the shorter comes first. The one exception is the per-run
// jackknife under "none", printed by the record's value, largest first, name as the tie-break.
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
inventory.sort(byName);
const RUNS = [...runs.values()].sort(byName);

// ---- window keying, as cornerJitter keys it -------------------------------
function windowsOf(run, include) {
    const { frames, D } = run;
    const windows = new Map();
    let loop = 0;
    for (let i = 0; i < frames.length; i++) {
        if (i > 0 && isLoopWrap(frames[i - 1], frames[i], D, i)) loop++;
        const fr = frames[i];
        const key = `${loop}:${Math.floor(fr.mediaTimeSeconds / JITTER_WINDOW_S)}`;
        if (!windows.has(key)) windows.set(key, { key, all: [], kept: [] });
        if (!fr.corners) continue;
        windows.get(key).all.push(fr);
        if (include(fr)) windows.get(key).kept.push(fr);
    }
    return windows;
}
function eligible(list) {
    if (list.length < 4) return false;
    let tMean = 0;
    for (const fr of list) tMean += fr.mediaTimeSeconds;
    tMean /= list.length;
    let tSpread = 0;
    for (const fr of list) tSpread += (fr.mediaTimeSeconds - tMean) ** 2;
    return tSpread !== 0;
}

// ---- per run, every reading -----------------------------------------------
for (const run of RUNS) {
    const { frames, D, name } = run;
    const det = frames.filter(isDetect);
    run.counts = {
        frames: frames.length,
        detect: det.length,
        detectCorners: det.filter((fr) => fr.corners).length,
        inl4: det.filter((fr) => fr.numInliers === 4).length,
        inl4Corners: det.filter((fr) => fr.numInliers === 4 && fr.corners).length,
        inl56Corners: det.filter((fr) => fr.numInliers >= 5 && fr.numInliers <= 6 && fr.corners).length,
        inl7Corners: det.filter((fr) => fr.numInliers === 7 && fr.corners).length,
        consumed: frames.filter((fr) => fr.detectionUse === "consumed").length,
        consumedDetect: frames.filter((fr) => fr.detectionUse === "consumed" && isDetect(fr)).length,
        // A consumed detection the tracking step refuses leaves the detection's inlier count
        // on the LOST frame (reason "unconfirmed"); one it confirms leaves the tracking count.
        consumedLost4: frames.filter((fr) => fr.detectionUse === "consumed" && fr.state === "LOST" && fr.numInliers === 4).length,
        consumedLost4Corners: frames.filter((fr) => fr.detectionUse === "consumed" && fr.state === "LOST" && fr.numInliers === 4 && fr.corners).length,
    };
    run.read = {};
    for (const r of READING_NAMES) {
        const include = READINGS[r];
        const j = cornerJitter(frames, { clipDurationS: D, include });
        const windows = windowsOf(run, include);
        const kept = [...windows.values()].filter((w) => eligible(w.kept)).length;
        if (kept !== j.jitterWindows) {
            fatal(`${name}, ${r}: window keying gives ${kept} windows, cornerJitter ${j.jitterWindows}`);
        }
        const excluded = frames.filter((fr) => fr.corners && !include(fr));
        const where = excluded.map((fr) => {
            const w = [...windows.values()].find((x) => x.all.includes(fr));
            // windowsOf puts every frame with corners in a window, so this cannot happen on these
            // exports; if it ever does, it is reported, not read as a property of undefined.
            if (w === undefined) fatal(`${name}, ${r}: the excluded frame at media time ${fr.mediaTimeSeconds} is in no window`);
            return {
                media: fr.mediaTimeSeconds,
                inliers: fr.numInliers,
                window: w.key,
                before: w.all.length,
                after: w.kept.length,
                eligibleBefore: eligible(w.all),
            };
        });
        run.read[r] = { ...j, keys: new Set(frames.filter((fr) => fr.corners && include(fr)).map((fr) => mediaKey(fr.mediaTimeSeconds))), excluded: where };
    }
    if (run.read.none.jitterPx !== run.whole.jitterPx) fatal(`${name}: reading "none" differs from the whole-set figure`);
}

// ---- pairs (question 1) ---------------------------------------------------
const PAIRS = [];
const has = (n) => runs.has(n);
const m3 = (p) => `2026-10-01-tab9-m3-${p}`;
for (const [clip, s, w] of [["wall", [1, 2, 3, 4], [1, 2, 3, 4]], ["table", [1, 2], [1, 2]]]) {
    for (const i of s) for (const j of w) PAIRS.push({ tier: "M3", clip, a: m3(`sync-${clip}-${i}`), b: m3(`worker-${clip}-${j}`), label: `sync-${i} vs worker-${j}` });
}
const t26 = (d, p) => `2026-09-26-${d}-ondevice-${p}`;
for (const clip of ["wall", "table"]) {
    for (const a of ["tracking", "tracking-repeat"]) {
        PAIRS.push({ tier: "2026-09-26 tab9", clip, a: t26("tab9", `${a}-${clip}`.replace("tracking-repeat-" + clip, `tracking-${clip}-repeat`)), b: t26("tab9", `stateless-${clip}`), label: `${a} vs stateless` });
    }
    PAIRS.push({ tier: "2026-09-26 oppo", clip, a: t26("oppo-a72", `tracking-${clip}`), b: t26("oppo-a72", `stateless-${clip}`), label: "tracking vs stateless" });
    PAIRS.push({ tier: "tuning r1", clip, a: `2026-09-28-tab9-tuning-r1-iter20-${clip}`, b: `2026-09-28-tab9-tuning-r1-baseline-${clip}`, label: "iter20 vs baseline" });
    for (const k of [1, 2, 3]) {
        for (const t of ["p32-s16", "p48-s16"]) {
            PAIRS.push({ tier: "tuning r2", clip, a: `2026-09-29-tab9-tuning-r2-${t}-${clip}`, b: `2026-09-29-tab9-tuning-r2-baseline-${clip}-${k}`, label: `${t} vs baseline-${k}` });
        }
    }
}
for (const p of PAIRS) {
    if (!has(p.a) || !has(p.b)) fatal(`pair ${p.tier} ${p.clip} ${p.label}: an export is missing or unreadable (${p.a}, ${p.b})`);
    const A = runs.get(p.a);
    const B = runs.get(p.b);
    const ra = A.e.processingResolution;
    const rb = B.e.processingResolution;
    // As compareExports refuses it, with the sizes observed: an export without the field is
    // reported here, not thrown as a TypeError from a property read on undefined.
    const sized = (res) => res?.width > 0 && res?.height > 0;
    if (!sized(ra) || !sized(rb)) {
        fatal(`pair ${p.label} on ${p.clip}: an export records no processingResolution (${ra?.width}x${ra?.height}, ${rb?.width}x${rb?.height})`);
    }
    if (ra.width !== rb.width || ra.height !== rb.height) {
        fatal(`pair ${p.label} on ${p.clip}: their corners are in different frame sizes (${ra.width}x${ra.height}, ${rb.width}x${rb.height})`);
    }
    p.results = {};
    for (const r of READING_NAMES) {
        const include = READINGS[r];
        const common = new Set([...A.read[r].keys].filter((k) => B.read[r].keys.has(k)));
        const union = new Set([...A.read[r].keys, ...B.read[r].keys]).size;
        if (r === "none" && common.size === 0) fatal(`pair ${p.label} on ${p.clip}: no media time both runs posed`);
        const inc = (fr) => include(fr) && common.has(mediaKey(fr.mediaTimeSeconds));
        const ja = cornerJitter(A.frames, { include: inc, clipDurationS: A.D });
        const jb = cornerJitter(B.frames, { include: inc, clipDurationS: B.D });
        if (r === "none" && !(Number.isFinite(ja.jitterPx) && Number.isFinite(jb.jitterPx))) {
            fatal(`pair ${p.label} on ${p.clip}: a common-set jitterPx is not finite`);
        }
        // A difference exists only when both of its terms do. Under XD a stateless run keeps no
        // posed frame and its jitterPx is null; subtracting null would coerce it to 0 and print
        // a number for a comparison that is undefined (the review of 4d7c8fb, finding 1).
        const whole =
            Number.isFinite(A.read[r].jitterPx) && Number.isFinite(B.read[r].jitterPx)
                ? A.read[r].jitterPx - B.read[r].jitterPx
                : null;
        const com = Number.isFinite(ja.jitterPx) && Number.isFinite(jb.jitterPx) ? ja.jitterPx - jb.jitterPx : null;
        p.results[r] = { common: common.size, union, ja, jb, whole, com, part: whole === null || com === null ? null : whole - com };
    }
}

// ---- replicate groups (question 2) ----------------------------------------
const GROUPS = [
    ["M3 sync, wall", "wall", [1, 2, 3, 4].map((i) => m3(`sync-wall-${i}`))],
    ["M3 sync, table", "table", [1, 2].map((i) => m3(`sync-table-${i}`))],
    ["M3 worker, wall", "wall", [1, 2, 3, 4].map((i) => m3(`worker-wall-${i}`))],
    ["M3 worker, table", "table", [1, 2].map((i) => m3(`worker-table-${i}`))],
    ["2026-09-26 tab9 tracking, wall", "wall", [t26("tab9", "tracking-wall"), t26("tab9", "tracking-wall-repeat")]],
    ["2026-09-26 tab9 tracking, table", "table", [t26("tab9", "tracking-table"), t26("tab9", "tracking-table-repeat")]],
    ["tuning r2 baseline, wall", "wall", [1, 2, 3].map((k) => `2026-09-29-tab9-tuning-r2-baseline-wall-${k}`)],
    ["tuning r2 baseline, table", "table", [1, 2, 3].map((k) => `2026-09-29-tab9-tuning-r2-baseline-table-${k}`)],
];
const spread = (values) => {
    const v = values.filter((x) => Number.isFinite(x));
    if (v.length < 2) return { n: v.length, min: null, max: null, ratio: null, range: null };
    const min = Math.min(...v);
    const max = Math.max(...v);
    // cornerJitter can return 0 with nonzero degrees of freedom, and a ratio over a smallest
    // value that is not positive is no ratio: null, as for fewer than two finite values.
    return { n: v.length, min, max, ratio: min > 0 ? max / min : null, range: max - min };
};
for (const grp of GROUPS) {
    const [label, , names] = grp;
    if (names.length === 0) fatal(`group ${label}: names no run`);
    for (const n of names) if (!has(n)) fatal(`group ${label}: ${n} is missing or unreadable`);
    grp.members = names.map((n) => runs.get(n));
    grp.results = {};
    for (const r of READING_NAMES) {
        const include = READINGS[r];
        // The intersection starts from the first member's media times, so it is a Set whatever the
        // members share: an empty one prints its size, 0, and a null jitterPx on it.
        let common = new Set(grp.members[0].read[r].keys);
        for (const m of grp.members.slice(1)) common = new Set([...common].filter((k) => m.read[r].keys.has(k)));
        const inc = (fr) => include(fr) && common.has(mediaKey(fr.mediaTimeSeconds));
        const onCommon = grp.members.map((m) => cornerJitter(m.frames, { include: inc, clipDurationS: m.D }));
        grp.results[r] = {
            whole: grp.members.map((m) => m.read[r].jitterPx),
            wholeSpread: spread(grp.members.map((m) => m.read[r].jitterPx)),
            common: common.size,
            onCommon,
            commonSpread: spread(onCommon.map((j) => j.jitterPx)),
        };
    }
    // the jackknife under X4: the single posed frame whose deletion moves jitterPx most
    grp.jackknife = grp.members.map((m) => {
        const base = m.read.X4.jitterPx;
        const posed = m.frames.filter((fr) => fr.corners && READINGS.X4(fr));
        const moves = [];
        let best = null;
        for (const victim of posed) {
            const j = cornerJitter(m.frames, { clipDurationS: m.D, include: (fr) => READINGS.X4(fr) && fr !== victim });
            const move = j.jitterPx === null ? null : j.jitterPx - base;
            if (move === null) continue;
            moves.push({ move, windows: j.jitterWindows, victim });
            if (best === null || Math.abs(move) > Math.abs(best.move)) {
                best = { move, after: j.jitterPx, windows: j.jitterWindows, state: victim.state, inliers: victim.numInliers, media: victim.mediaTimeSeconds, detectionUse: victim.detectionUse, victim };
            }
        }
        // The strict > above keeps the first of equal moves. When the named frame sits in a window
        // of exactly four posed frames, deleting any one of the four leaves three, cornerJitter
        // drops the window, and the four deletions move jitterPx by the same amount: the frame
        // named is then the first in frame order, not a uniquely influential one (the review of
        // 4d7c8fb, finding 3). So the ties are counted and the window's fate printed.
        const ties = best === null ? [] : moves.filter((x) => x.move === best.move && x.windows === best.windows);
        const windowDropped = best !== null && best.windows < m.read.X4.jitterWindows;
        return {
            name: m.name,
            base,
            best,
            posed: posed.length,
            ties: ties.map((x) => ({ state: x.victim.state, inliers: x.victim.numInliers, media: x.victim.mediaTimeSeconds })),
            windowDropped,
        };
    });
    grp.jackknifeSpread = spread(grp.jackknife.map((j) => (j.best ? j.best.after : j.base)));
}

// ---- per run, the jackknife under "none": what one frame carries of the record's figure ----
// For every run read, every posed frame is deleted alone from the record's own reading and
// jitterPx recomputed; the deletion that moves it most is kept, with its ties as above. This is
// what lets the document say of each large whole-set value in the record whether it is one
// frame, and of what support, rather than infer it from the readings.
for (const run of RUNS) {
    const base = run.read.none.jitterPx;
    const posed = run.frames.filter((fr) => fr.corners);
    const moves = [];
    let best = null;
    for (const victim of posed) {
        const j = cornerJitter(run.frames, { clipDurationS: run.D, include: (fr) => fr !== victim });
        if (j.jitterPx === null) continue;
        const move = j.jitterPx - base;
        moves.push({ move, windows: j.jitterWindows });
        if (best === null || Math.abs(move) > Math.abs(best.move)) {
            best = { move, after: j.jitterPx, windows: j.jitterWindows, state: victim.state, inliers: victim.numInliers, media: victim.mediaTimeSeconds };
        }
    }
    run.jackknifeNone = { best, ties: best === null ? 0 : moves.filter((x) => x.move === best.move && x.windows === best.windows).length };
}

// ---- the reviewer's selections and shares, recomputed here -----------------
// The independent reviewer's figures (the document's "Independent: a reviewer's attempt") came
// from a scratch script that is not committed. Every figure in the document must come from a
// committed derivation (the review of 4d7c8fb, finding 4), so the same quantities are computed
// here on the two groups the document cites, M3's sync arm on each clip, and printed in the
// order the document reports them, for comparison with the reviewer's own.

/**
 * cornerJitter's window regression, repeated only to attribute the residual to windows and to
 * frames, which cornerJitter does not expose, and to read a frame set whose loop restarts
 * mid-clip (the edge-trimmed selection below), which the module's wrap reader refuses. Same
 * keying (loopIdx[i], floor(mediaTime)), same two eligibility rules, same operation order, so
 * its jitterPx must equal cornerJitter's bit for bit wherever both can read the set: checked,
 * fatal, on every run and reading it is used with.
 */
function windowResiduals(frames, loopIdx, include) {
    const windows = new Map();
    for (let i = 0; i < frames.length; i++) {
        const fr = frames[i];
        if (!(fr.corners && include(fr))) continue;
        const key = `${loopIdx[i]}:${Math.floor(fr.mediaTimeSeconds / JITTER_WINDOW_S)}`;
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push(fr);
    }
    let residuals = 0;
    let dof = 0;
    let used = 0;
    const perWindow = [];
    const perFrame = new Map();
    for (const [key, w] of windows) {
        const n = w.length;
        if (n < 4) continue;
        let tMean = 0;
        for (const fr of w) tMean += fr.mediaTimeSeconds;
        tMean /= n;
        let tSpread = 0;
        for (const fr of w) tSpread += (fr.mediaTimeSeconds - tMean) ** 2;
        if (tSpread === 0) continue;
        let sum = 0;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const fr of w) mean += fr.corners[c][axis];
                mean /= n;
                let slope = 0;
                for (const fr of w) slope += (fr.mediaTimeSeconds - tMean) * (fr.corners[c][axis] - mean);
                slope /= tSpread;
                for (const fr of w) {
                    const r2 = (fr.corners[c][axis] - mean - slope * (fr.mediaTimeSeconds - tMean)) ** 2;
                    residuals += r2;
                    sum += r2;
                    perFrame.set(fr, (perFrame.get(fr) ?? 0) + r2);
                }
            }
        }
        perWindow.push({ key, residual: sum, frames: w });
        dof += n - 2;
        used++;
    }
    return { jitterPx: dof > 0 ? Math.sqrt(residuals / (4 * dof)) : null, jitterWindows: used, residuals, perWindow, perFrame };
}
/** The loop index of each frame as cornerJitter counts it over this very array: by its wraps. */
function loopIndexByWraps(frames, D) {
    let loop = 0;
    return frames.map((fr, i) => {
        if (i > 0 && isLoopWrap(frames[i - 1], fr, D, i)) loop++;
        return loop;
    });
}
/** The mean of a frame's four corners: the quantity the reviewer reported as the "projected centre". */
const cornerMean = (c) => [0, 1].map((axis) => c.reduce((s, p) => s + p[axis], 0) / 4);

const REVIEWED = GROUPS.slice(0, 2); // M3 sync, wall; M3 sync, table
for (const grp of REVIEWED) {
    for (const m of grp.members) {
        // the repeated regression reproduces the module on the counted frames, every reading
        const loopIdx = loopIndexByWraps(m.frames, m.D);
        for (const r of READING_NAMES) {
            const own = windowResiduals(m.frames, loopIdx, READINGS[r]);
            if (own.jitterPx !== m.read[r].jitterPx || own.jitterWindows !== m.read[r].jitterWindows) {
                fatal(`${m.name}, ${r}: the repeated regression gives ${own.jitterPx} over ${own.jitterWindows} windows, cornerJitter ${m.read[r].jitterPx} over ${m.read[r].jitterWindows}`);
            }
        }
        // shares of the residual under X4, by window and by frame, and the DETECT frames' share
        const x4 = windowResiduals(m.frames, loopIdx, READINGS.X4);
        const topWindow = x4.perWindow.reduce((a, w) => (a === null || w.residual > a.residual ? w : a), null);
        let topFrame = null;
        let detectResidual = 0;
        for (const [fr, r2] of x4.perFrame) {
            if (topFrame === null || r2 > topFrame.r2) topFrame = { fr, r2 };
            if (isDetect(fr)) detectResidual += r2;
        }
        m.shares = {
            topWindow: topWindow === null ? null : { key: topWindow.key, share: topWindow.residual / x4.residuals, frames: topWindow.frames.map((fr) => `${fr.state} ${fr.numInliers}`) },
            topFrame: topFrame === null ? null : { share: topFrame.r2 / x4.residuals, state: topFrame.fr.state, inliers: topFrame.fr.numInliers, media: topFrame.fr.mediaTimeSeconds },
            detectShare: detectResidual / x4.residuals,
        };
        // the selections of the run's frames, under X4
        const all = m.e.frames;
        const t = unwrapMediaTimes(all, m.D);
        const loopOf = (i) => Math.floor(t[i] / m.D);
        const within = (i) => t[i] - loopOf(i) * m.D;
        m.selections = {};
        for (let k = 0; k <= 4; k++) {
            const sel = all.filter((_, i) => loopOf(i) === k);
            m.selections[`loop ${k} alone`] = cornerJitter(sel, { clipDurationS: m.D, include: READINGS.X4 }).jitterPx;
        }
        m.selections["all frames"] = cornerJitter(all, { clipDurationS: m.D, include: READINGS.X4 }).jitterPx;
        // loops 1 to 4 with each loop's first and last second removed: the module's wrap reader
        // refuses a restart more than 0.5 s into the clip, so this one is the repeated regression,
        // keyed by the module's own unwrapped loop index
        const trimmedIdx = [];
        const trimmed = all.filter((_, i) => {
            const k = loopOf(i);
            const keep = k >= 1 && k <= 4 && within(i) >= 1 && within(i) < m.D - 1;
            if (keep) trimmedIdx.push(k);
            return keep;
        });
        m.selections["loops 1-4, first and last second of each loop removed"] = windowResiduals(trimmed, trimmedIdx, READINGS.X4).jitterPx;
        // the corners' mean on the frames the document names: the X4-excluded frame in an eligible
        // window, and the jackknife's named frame, each against the mean of its window's other frames
        const windows = windowsOf(m, READINGS.none);
        const named = [];
        for (const fr of m.frames) {
            if (!fr.corners) continue;
            const w = [...windows.values()].find((x) => x.all.includes(fr));
            if (w === undefined) fatal(`${m.name}: the posed frame at media time ${fr.mediaTimeSeconds} is in no window`);
            const isCarrier = isDetect(fr) && fr.numInliers === 4 && eligible(w.all);
            const jk = grp.jackknife.find((j) => j.name === m.name).best;
            const isNamed = jk !== null && fr === jk.victim;
            if (!isCarrier && !isNamed) continue;
            const others = w.all.filter((o) => o !== fr).map((o) => cornerMean(o.corners));
            const mean = others.length === 0 ? null : [0, 1].map((axis) => others.reduce((s, p) => s + p[axis], 0) / others.length);
            named.push({ why: isCarrier ? "X4-excluded, eligible window" : "jackknife's named frame", fr, window: w.key, centre: cornerMean(fr.corners), others: mean, n: others.length });
        }
        m.named = named;
    }
    grp.selectionRatios = {};
    for (const key of Object.keys(grp.members[0].selections)) {
        grp.selectionRatios[key] = spread(grp.members.map((m) => m.selections[key]));
    }
}

// ---- output ---------------------------------------------------------------
console.log(`${SCRIPT}: ${runs.size} hand-held exports read, ${PAIRS.length} pairs, ${GROUPS.length} replicate groups; every fatal check passed.\n`);

console.log("== Inventory: every committed export on a hand-held clip");
for (const { name, clip, why } of inventory) console.log(`${name} | ${clip} | ${why ? `NOT READ: ${why}` : "read"}`);

console.log("\n== Per run: frames, detections, 4-inlier detections, and jitterPx under each reading");
console.log("run | clip | frames | DETECT (with corners) | 4-inl DETECT (with corners) | 5-6-inl with corners | 7-inl with corners | consumed (of them DETECT; refused with 4 inliers, with corners) | none: jitterPx (posed, windows) | X4 | X6 | X8 | XD");
for (const run of RUNS) {
    const c = run.counts;
    const cell = (r) => `${g(run.read[r].jitterPx)} (${run.read[r].posedFrames}, ${run.read[r].jitterWindows} w)`;
    console.log(`${run.name} | ${CLIP_SHORT[run.clip] ?? run.clip} | ${c.frames}${run.hasLoops ? " counted" : " all"} | ${c.detect} (${c.detectCorners}) | ${c.inl4} (${c.inl4Corners}) | ${c.inl56Corners} | ${c.inl7Corners} | ${c.consumed} (${c.consumedDetect}; ${c.consumedLost4}, ${c.consumedLost4Corners}) | ${READING_NAMES.map(cell).join(" | ")}`);
}

const totals = { runs: runs.size, detect: 0, inl4: 0, inl4Corners: 0, inl4Eligible: 0, runsMoved: 0 };
for (const run of RUNS) {
    totals.detect += run.counts.detect;
    totals.inl4 += run.counts.inl4;
    totals.inl4Corners += run.counts.inl4Corners;
    totals.inl4Eligible += run.read.X4.excluded.filter((w) => w.eligibleBefore).length;
    if (run.read.X4.jitterPx !== run.read.none.jitterPx) totals.runsMoved++;
}
console.log(`\nTotals over the ${totals.runs} runs read: DETECT frames ${totals.detect}; 4-inlier detections ${totals.inl4}, of them with corners ${totals.inl4Corners}, of them in a window eligible before the exclusion ${totals.inl4Eligible}; runs whose jitterPx X4 moves at all: ${totals.runsMoved}`);

console.log("\n== Where the excluded 4-inlier detection frames sat (X4): window key, frames with corners before -> after, eligible before, and the run's change");
for (const run of RUNS) {
    const x = run.read.X4;
    if (x.excluded.length === 0) {
        console.log(`${run.name}: no posed 4-inlier detection frame; change 0`);
        continue;
    }
    const list = x.excluded.map((w) => `${w.window} ${w.before}->${w.after}${w.eligibleBefore ? " eligible" : " ineligible"}`).join("; ");
    console.log(`${run.name}: ${x.excluded.length} excluded [${list}]; jitterPx ${g(run.read.none.jitterPx)} -> ${g(x.jitterPx)}, change ${f(x.jitterPx - run.read.none.jitterPx)}${x.jitterPx === run.read.none.jitterPx ? " (exactly 0)" : ""}`);
}

console.log("\n== Per run, jackknife under none: the single posed frame whose deletion moves the record's whole-set jitterPx most");
console.log("run | none | after deleting it | move | the frame (state, inliers, media time) | tied deletions");
for (const run of [...RUNS].sort((a, b) => b.read.none.jitterPx - a.read.none.jitterPx || byName(a, b))) {
    const b = run.jackknifeNone.best;
    console.log(`${run.name} | ${g(run.read.none.jitterPx, 2)} | ${g(b.after, 2)} | ${f(b.move, 2)} | ${b.state}, ${b.inliers} inliers, ${b.media} | ${run.jackknifeNone.ties}`);
}

console.log("\n== Question 1, per pair: whole-set and common-set differences (first minus second) under each reading");
for (const tier of [...new Set(PAIRS.map((p) => p.tier))]) {
    console.log(`\n-- ${tier}`);
    console.log("clip | pair | reading | common media times | A whole -> common (w) | B whole -> common (w) | observed whole | observed common | frame-set part");
    for (const p of PAIRS.filter((x) => x.tier === tier)) {
        for (const r of READING_NAMES) {
            const R = p.results[r];
            const A = runs.get(p.a).read[r];
            const B = runs.get(p.b).read[r];
            console.log(`${p.clip} | ${p.label} | ${r} | ${R.common} | ${g(A.jitterPx, 2)} -> ${g(R.ja.jitterPx, 2)} (${R.ja.jitterWindows}) | ${g(B.jitterPx, 2)} -> ${g(R.jb.jitterPx, 2)} (${R.jb.jitterWindows}) | ${f(R.whole, 2)} | ${f(R.com, 2)} | ${f(R.part, 2)}`);
        }
    }
}

console.log("\n== Question 2, per replicate group: whole-set values, largest/smallest ratio and range under each reading; the same on the group's common media times");
for (const grp of GROUPS) {
    const [label] = grp;
    console.log(`\n-- ${label} (${grp.members.length} runs: ${grp.members.map((m) => m.name.replace(/^2026-\d\d-\d\d-/, "")).join(", ")})`);
    console.log("reading | whole-set jitterPx per run | ratio | range | common media times | on common per run (w) | ratio | range");
    for (const r of READING_NAMES) {
        const R = grp.results[r];
        console.log(`${r} | ${R.whole.map((v) => g(v, 2)).join(" ")} | ${g(R.wholeSpread.ratio, 2)} | ${g(R.wholeSpread.range, 2)} | ${R.common} | ${R.onCommon.map((j) => `${g(j.jitterPx, 2)} (${j.jitterWindows})`).join(" ")} | ${g(R.commonSpread.ratio, 2)} | ${g(R.commonSpread.range, 2)}`);
    }
    console.log("jackknife under X4: per run, the single posed frame whose deletion moves jitterPx most");
    for (const j of grp.jackknife) {
        const b = j.best;
        const tie =
            j.ties.length > 1
                ? `; TIE: ${j.ties.length} deletions move it by exactly this amount (${j.ties.map((t) => `${t.state} ${t.inliers} inl @ ${t.media}`).join(", ")}), the first in frame order is named${j.windowDropped ? "; each of them drops the window below 4 frames" : ""}`
                : j.windowDropped
                  ? "; the deletion drops the window below 4 frames"
                  : "";
        console.log(`  ${j.name.replace(/^2026-\d\d-\d\d-/, "")}: ${j.posed} posed; ${g(j.base, 2)} -> ${g(b.after, 2)} (${f(b.move, 2)}, ${b.windows} w) by deleting a ${b.state} frame, ${b.inliers} inliers, detectionUse ${b.detectionUse}, media time ${b.media}${tie}`);
    }
    console.log(`  group ratio with each run's most influential frame deleted: ${g(grp.jackknifeSpread.ratio, 2)} (range ${g(grp.jackknifeSpread.range, 2)}), against ${g(grp.results.X4.wholeSpread.ratio, 2)} under X4`);
}

console.log("\n== The reviewer's figures, recomputed from the committed exports (M3 sync groups, under X4)");
for (const grp of REVIEWED) {
    const [label] = grp;
    console.log(`\n-- ${label}`);
    console.log("residual shares under X4 on the counted loops: top window (its frames), top frame, DETECT frames' share of the residual");
    for (const m of grp.members) {
        const s = m.shares;
        console.log(`  ${m.name.replace(/^2026-\d\d-\d\d-/, "")}: top window ${s.topWindow.key} ${(100 * s.topWindow.share).toFixed(1)}% [${s.topWindow.frames.join(", ")}]; top frame ${(100 * s.topFrame.share).toFixed(1)}% (${s.topFrame.state}, ${s.topFrame.inliers} inliers, media time ${s.topFrame.media}); DETECT share ${(100 * s.detectShare).toFixed(1)}%`);
    }
    console.log("corners' mean on the frames the document names, against the mean of the window's other frames (processing resolution " + `${grp.members[0].e.processingResolution.width} x ${grp.members[0].e.processingResolution.height})`);
    for (const m of grp.members) {
        for (const n of m.named) {
            console.log(`  ${m.name.replace(/^2026-\d\d-\d\d-/, "")}: ${n.why}: ${n.fr.state}, ${n.fr.numInliers} of ${n.fr.numMatches} matches, media time ${n.fr.mediaTimeSeconds}, window ${n.window}: corners' mean (${n.centre.map((v) => v.toFixed(0)).join(", ")}) px; the window's other ${n.n} frames' mean ${n.others === null ? "none" : `(${n.others.map((v) => v.toFixed(0)).join(", ")}) px`}`);
        }
    }
    console.log("selections of the runs' frames, jitterPx per run under X4, and the group's largest/smallest ratio");
    for (const [key, sp] of Object.entries(grp.selectionRatios)) {
        console.log(`  ${key}: ${grp.members.map((m) => g(m.selections[key], 2)).join(" ")} | ratio ${g(sp.ratio, 2)} | range ${g(sp.range, 2)}`);
    }
}
