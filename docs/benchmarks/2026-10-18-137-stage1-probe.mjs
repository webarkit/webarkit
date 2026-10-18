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
 *    the figure. Each is cornerJitter's own include option; a non-DETECT frame
 *    is always kept, and no H changes, so every movement is frame selection.
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
 * 8. Window diagnostics: each excluded frame's one-second window, keyed as
 *    cornerJitter keys it, with the window's frame count before and after the
 *    exclusion and whether it was eligible (at least 4 frames) before. The
 *    window count so obtained must equal the module's jitterWindows under
 *    every reading of every run (fatal).
 *
 * The checks, all fatal: a failed check exits non-zero naming the run or the
 * pair and the values that disagree, and no figure is printed after it. Per
 * run, the recomputed whole-set jitterPx is a finite number equal to the
 * recorded runSummary.jitterPx, with zero tolerance (the same function on the
 * same frames in the same order); the window keying reproduces jitterWindows
 * under every reading; a frame counted as a 4-inlier detection has corners
 * only if it is posed. Per pair, the common set is not empty under "none" and
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
const { cornerJitter, countedLoopFrames, isLoopWrap, mediaKey, METRICS_VERSION, JITTER_WINDOW_S } =
    await import(pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href);

const fatal = (message) => {
    console.error(`${SCRIPT}: ${message}`);
    process.exit(1);
};
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
for (const run of runs.values()) {
    const { frames, D, name } = run;
    const det = frames.filter(isDetect);
    run.counts = {
        frames: frames.length,
        detect: det.length,
        detectCorners: det.filter((fr) => fr.corners).length,
        inl4: det.filter((fr) => fr.numInliers === 4).length,
        inl4Corners: det.filter((fr) => fr.numInliers === 4 && fr.corners).length,
        inl56Corners: det.filter((fr) => fr.numInliers >= 5 && fr.numInliers <= 6 && fr.corners).length,
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
    if (ra.width !== rb.width || ra.height !== rb.height) fatal(`pair ${p.label} on ${p.clip}: different processing resolutions`);
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
        const whole = A.read[r].jitterPx - B.read[r].jitterPx;
        const com = Number.isFinite(ja.jitterPx) && Number.isFinite(jb.jitterPx) ? ja.jitterPx - jb.jitterPx : null;
        p.results[r] = { common: common.size, union, ja, jb, whole, com, part: com === null ? null : whole - com };
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
    return { n: v.length, min, max, ratio: max / min, range: max - min };
};
for (const grp of GROUPS) {
    const [label, , names] = grp;
    for (const n of names) if (!has(n)) fatal(`group ${label}: ${n} is missing or unreadable`);
    grp.members = names.map((n) => runs.get(n));
    grp.results = {};
    for (const r of READING_NAMES) {
        const include = READINGS[r];
        let common = null;
        for (const m of grp.members) common = common === null ? new Set(m.read[r].keys) : new Set([...common].filter((k) => m.read[r].keys.has(k)));
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
        let best = null;
        for (const victim of posed) {
            const j = cornerJitter(m.frames, { clipDurationS: m.D, include: (fr) => READINGS.X4(fr) && fr !== victim });
            const move = j.jitterPx === null ? null : j.jitterPx - base;
            if (move !== null && (best === null || Math.abs(move) > Math.abs(best.move))) {
                best = { move, after: j.jitterPx, windows: j.jitterWindows, state: victim.state, inliers: victim.numInliers, media: victim.mediaTimeSeconds, detectionUse: victim.detectionUse };
            }
        }
        return { name: m.name, base, best, posed: posed.length };
    });
    grp.jackknifeSpread = spread(grp.jackknife.map((j) => (j.best ? j.best.after : j.base)));
}

// ---- output ---------------------------------------------------------------
console.log(`${SCRIPT}: ${runs.size} hand-held exports read, ${PAIRS.length} pairs, ${GROUPS.length} replicate groups; every fatal check passed.\n`);

console.log("== Inventory: every committed export on a hand-held clip");
for (const { name, clip, why } of inventory) console.log(`${name} | ${clip} | ${why ? `NOT READ: ${why}` : "read"}`);

console.log("\n== Per run: frames, detections, 4-inlier detections, and jitterPx under each reading");
console.log("run | clip | frames | DETECT (with corners) | 4-inl DETECT (with corners) | 5-6-inl with corners | consumed (of them DETECT; refused with 4 inliers, with corners) | none: jitterPx (posed, windows) | X4 | X6 | XD");
for (const run of runs.values()) {
    const c = run.counts;
    const cell = (r) => `${g(run.read[r].jitterPx)} (${run.read[r].posedFrames}, ${run.read[r].jitterWindows} w)`;
    console.log(`${run.name} | ${CLIP_SHORT[run.clip] ?? run.clip} | ${c.frames}${run.hasLoops ? " counted" : " all"} | ${c.detect} (${c.detectCorners}) | ${c.inl4} (${c.inl4Corners}) | ${c.inl56Corners} | ${c.consumed} (${c.consumedDetect}; ${c.consumedLost4}, ${c.consumedLost4Corners}) | ${cell("none")} | ${cell("X4")} | ${cell("X6")} | ${cell("XD")}`);
}

const totals = { runs: runs.size, detect: 0, inl4: 0, inl4Corners: 0, inl4Eligible: 0, runsMoved: 0 };
for (const run of runs.values()) {
    totals.detect += run.counts.detect;
    totals.inl4 += run.counts.inl4;
    totals.inl4Corners += run.counts.inl4Corners;
    totals.inl4Eligible += run.read.X4.excluded.filter((w) => w.eligibleBefore).length;
    if (run.read.X4.jitterPx !== run.read.none.jitterPx) totals.runsMoved++;
}
console.log(`\nTotals over the ${totals.runs} runs read: DETECT frames ${totals.detect}; 4-inlier detections ${totals.inl4}, of them with corners ${totals.inl4Corners}, of them in a window eligible before the exclusion ${totals.inl4Eligible}; runs whose jitterPx X4 moves at all: ${totals.runsMoved}`);

console.log("\n== Where the excluded 4-inlier detection frames sat (X4): window key, frames with corners before -> after, eligible before, and the run's change");
for (const run of runs.values()) {
    const x = run.read.X4;
    if (x.excluded.length === 0) {
        console.log(`${run.name}: no posed 4-inlier detection frame; change 0`);
        continue;
    }
    const list = x.excluded.map((w) => `${w.window} ${w.before}->${w.after}${w.eligibleBefore ? " eligible" : " ineligible"}`).join("; ");
    console.log(`${run.name}: ${x.excluded.length} excluded [${list}]; jitterPx ${g(run.read.none.jitterPx)} -> ${g(x.jitterPx)}, change ${f(x.jitterPx - run.read.none.jitterPx)}${x.jitterPx === run.read.none.jitterPx ? " (exactly 0)" : ""}`);
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
        console.log(`  ${j.name.replace(/^2026-\d\d-\d\d-/, "")}: ${j.posed} posed; ${g(j.base, 2)} -> ${g(b.after, 2)} (${f(b.move, 2)}, ${b.windows} w) by deleting a ${b.state} frame, ${b.inliers} inliers, detectionUse ${b.detectionUse}, media time ${b.media}`);
    }
    console.log(`  group ratio with each run's most influential frame deleted: ${g(grp.jackknifeSpread.ratio, 2)} (range ${g(grp.jackknifeSpread.range, 2)}), against ${g(grp.results.X4.wholeSpread.ratio, 2)} under X4`);
}
