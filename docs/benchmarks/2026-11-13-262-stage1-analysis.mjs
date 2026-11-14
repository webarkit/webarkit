/*
 *  2026-11-13-262-stage1-analysis.mjs
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
 * #262, M10's Stage 1: the figures, read from the runner's output (`2026-11-13-262-stage1-probe.mjs`,
 * `2026-11-13-262-stage1-truth.mjs`) and from M9's committed device exports. Prints Markdown.
 * Every check is fatal (exit 1); the seed sets, frame counts and media times of a part are checked
 * before its first figure is printed, and a failure after that (a malformed row) stops the part.
 *
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs arms <run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs stateless <run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs mirror <run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs gms <run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs agreement <run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs truth <run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs m9
 *     node docs/benchmarks/2026-11-13-262-stage1-analysis.mjs --self-test
 *
 * ffprobe must be on PATH (the clips' loop periods). The arms, stateless and agreement modes refuse a
 * run directory without the runner's `check-orb.json` recording a pass.
 *
 * Definitions, each the page's where the page has one:
 * - **Per tracking run** (two loops, every frame or a device schedule): `summarizeRun`
 *   (`examples/js/bench-summary.mjs`) with `clipDurationS` the clip's loop period
 *   (`scripts/replay-run.mjs`, `loopPeriod`, on ffprobe's frame times): `trackShare` (lock rate),
 *   `reacquisitions`, `firstSteps`, `heldLockSteps`. **First lock:** the media time of the run's
 *   first `TRACK` frame (and of its first `DETECT` frame beside it). **Lasting locks:** runs of 50 or
 *   more consecutive `TRACK` frames, the record's definition (`2026-10-16-104-stage1-probe.md`,
 *   item 7). **LOST frames,** by the glossary's sequence rule: never yet acquired (no `TRACK` frame
 *   before it in the run) or a lock lost, each with its `reason`.
 * - **Over the 8 seeds:** mean, s on 7 degrees of freedom, the 95% interval of the mean
 *   (mean ± 2.3646 · s / √8), and the range; the arms are compared unpaired, TEBLID's mean and
 *   range against ORB's range.
 * - **Per stateless run** (one loop, every frame, no lock): the share accepted, matches and
 *   inliers (median and mean over all frames), reasons, and each detection stage's desktop p50 and
 *   p95; between the arms, paired per frame at the same seed and ratio, the frames one accepts and
 *   the other refuses.
 * - **Agreement with a lasting lock** (a proxy, not ground truth): on the frames where the ORB
 *   arm's every-frame tracking run at seed 1, ratio 0.8, holds a lasting lock (read from the
 *   control arm only), the mean distance, frame px, between where an accepted stateless detection's
 *   `H` and the lock's `H` put the target's four corners.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { summarizeRun, targetCorners } = await import(pathToFileURL(join(ROOT, "examples/js/bench-metrics.mjs")).href);
const { loopPeriod } = await import(pathToFileURL(join(ROOT, "scripts/replay-run.mjs")).href);

const CLIP_FILES = { static: "pinball-static.mp4", wall: "pinball-bench.mp4", table: "pinball-bench-table.mp4", cross: "pinball-tilt-cross.mp4" };
const T95_7 = 2.3646;
/** pinball.wnft's level-0 size (`meta.widthPx`, `meta.heightPx`; both arms read it), for the agreement's corners. */
const TARGET = { width: 512, height: 640 };
const LASTING = 50;

function fail(why) {
    console.error(`262-analysis: ${why}`);
    process.exit(1);
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const quant = (a, q) => {
    if (a.length === 0) return null;
    const b = [...a].sort((x, y) => x - y);
    return b[Math.min(b.length - 1, Math.floor(q * b.length))];
};
const median = (a) => quant(a, 0.5);
const f = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? "n/a" : Number(x).toFixed(d));
/** mean, s, interval and range over seeds, as one cell. */
function spread(a, d = 3) {
    if (a.length !== 8) fail(`expected 8 seeds, got ${a.length}`);
    const m = mean(a);
    const s = sd(a);
    const h = (T95_7 * s) / Math.sqrt(8);
    return { m, s, lo: Math.min(...a), hi: Math.max(...a), text: `${f(m, d)} (s ${f(s, d)}; [${f(m - h, d)}, ${f(m + h, d)}]; range ${f(Math.min(...a), d)}–${f(Math.max(...a), d)})` };
}

function clipPeriod(clip) {
    const json = JSON.parse(
        execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "json", join(ROOT, "examples/videos", CLIP_FILES[clip])], { maxBuffer: 64 << 20 }).toString(),
    );
    return loopPeriod(json.frames.map((x) => Number(x.pts_time)));
}

/** The LOST frames of a run, split by the glossary's sequence rule, with their reasons. */
export function lostSplit(frames) {
    let acquired = false;
    const never = {};
    const lost = {};
    let nNever = 0;
    let nLost = 0;
    for (const fr of frames) {
        if (fr.state === "LOST") {
            const b = acquired ? lost : never;
            b[fr.reason] = (b[fr.reason] ?? 0) + 1;
            if (acquired) nLost++;
            else nNever++;
        }
        if (fr.state === "TRACK") acquired = true;
    }
    return { nNever, nLost, never, lost };
}

/** Runs of `LASTING` or more consecutive TRACK frames: their count and the frames they hold. */
export function lastingLocks(frames, min = LASTING) {
    let n = 0;
    let frs = 0;
    let run = 0;
    const close = () => {
        if (run >= min) {
            n++;
            frs += run;
        }
        run = 0;
    };
    for (const fr of frames) {
        if (fr.state === "TRACK") run++;
        else close();
    }
    close();
    return { n, frames: frs };
}

function project(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
/** Mean distance, frame px, between where A and B put the target's four corners. */
export function cornerDistance(A, B) {
    const c = [
        [0, 0],
        [TARGET.width, 0],
        [TARGET.width, TARGET.height],
        [0, TARGET.height],
    ];
    return mean(c.map(([x, y]) => {
        const [ax, ay] = project(A, x, y);
        const [bx, by] = project(B, x, y);
        return Math.hypot(ax - bx, ay - by);
    }));
}

function load(dir, re) {
    return readdirSync(dir)
        .filter((n) => re.test(n))
        .sort()
        .map((n) => ({ name: n, ...JSON.parse(readFileSync(join(dir, n), "utf8")) }));
}

function runFigures(doc, period) {
    const s = summarizeRun(doc.frames, { clipDurationS: period });
    const firstTrack = doc.frames.find((x) => x.state === "TRACK");
    const firstDetect = doc.frames.find((x) => x.state === "DETECT");
    return {
        trackShare: s.trackShare,
        frames: s.frames,
        firstLockS: firstTrack ? firstTrack.mediaTimeSeconds : null,
        firstDetectS: firstDetect ? firstDetect.mediaTimeSeconds : null,
        reacquisitions: s.reacquisitions,
        reacqAtWrap: s.reacquisitionsAtLoopWrap,
        firstSteps: s.firstSteps.n,
        confirmed: s.firstSteps.confirmed,
        confirmRate: s.firstSteps.n > 0 ? s.firstSteps.confirmed / s.firstSteps.n : null,
        heldSteps: s.heldLockSteps.n,
        heldLost: s.heldLockSteps.lost,
        lasting: lastingLocks(doc.frames).n,
        lost: lostSplit(doc.frames),
    };
}

/** The figures of a run directory are read only after `check-orb` passed on it (its marker). */
function requireCheckOrb(dir) {
    let m;
    try {
        m = JSON.parse(readFileSync(join(dir, "check-orb.json"), "utf8"));
    } catch {
        fail(`${dir} has no check-orb.json: run the runner's check-orb mode first; no figure is read before it passes`);
    }
    if (m.passed !== true || !(m.frames > 0)) fail("check-orb.json does not record a pass");
}

function armsReport(dir) {
    requireCheckOrb(dir);
    const docs = load(dir, /^arm-.*\.json$/);
    if (docs.length === 0) fail(`no arm-*.json in ${dir}`);
    const groups = new Map();
    for (const d of docs) {
        const k = `${d.clip}|${d.scheduleName}|${d.ratio}|${d.arm}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(d);
    }
    const periods = {};
    const rows = [];
    for (const [k, list] of groups) {
        const [clip, sched, ratio, arm] = k.split("|");
        periods[clip] ??= clipPeriod(clip);
        if (list.length !== 8) fail(`${k}: ${list.length} seeds`);
        const seeds = list.map((d) => d.seed).sort((a, b) => a - b).join(",");
        if (seeds !== "1,2,3,4,5,6,7,8") fail(`${k}: seeds ${seeds}`);
        rows.push({ clip, sched, ratio: Number(ratio), arm, figs: list.map((d) => runFigures(d, periods[clip])) });
    }
    const KEYS = [
        ["trackShare", "lock rate", 4],
        ["firstLockS", "first lock, s", 3],
        ["reacquisitions", "re-acquisitions", 2],
        ["firstSteps", "first steps", 2],
        ["confirmed", "first steps confirmed", 2],
        ["confirmRate", "share confirmed", 3],
        ["heldLost", "held-lock steps lost", 2],
        ["lasting", "lasting locks (≥ 50 frames)", 2],
    ];
    const order = (a, b) => (a.clip + a.sched).localeCompare(b.clip + b.sched) || a.ratio - b.ratio || a.arm.localeCompare(b.arm);
    rows.sort(order);
    console.log("## Tracking mode, per arm, over seeds 1–8\n");
    console.log("Each run summarised over its whole two loops (no counted-loop window), as the replay's own exports are; M9's device runs, in the m9 mode, over their counted loops.\n");
    console.log(`Clip loop periods (s): ${Object.entries(periods).map(([c, p]) => `${c} ${f(p, 6)}`).join(", ")}\n`);
    for (const [key, label, d] of KEYS) {
        console.log(`### ${label}\n`);
        console.log("| clip | schedule | ratio | arm | mean (s; 95% interval of the mean; range) | TEBLID's seeds against ORB at the same ratio | TEBLID's seeds against ORB@0.8, the shipped ratio |");
        console.log("| --- | --- | --- | --- | --- | --- | --- |");
        for (const r of rows) {
            const vals = r.figs.map((x) => x[key]);
            if (vals.some((v) => v === null)) {
                console.log(`| ${r.clip} | ${r.sched} | ${r.ratio} | ${r.arm} | a run with none: ${vals.map((v) => f(v, d)).join(", ")} | | |`);
                continue;
            }
            const sp = spread(vals, d);
            const against = (ratio) => {
                const orb = rows.find((o) => o.clip === r.clip && o.sched === r.sched && o.ratio === ratio && o.arm === "orb");
                if (!orb) return "no ORB arm";
                const ov = orb.figs.map((x) => x[key]).filter((v) => v !== null);
                const lo = Math.min(...ov);
                const hi = Math.max(...ov);
                return `${vals.filter((v) => v > hi).length} above, ${vals.filter((v) => v < lo).length} below [${f(lo, d)}, ${f(hi, d)}]`;
            };
            const same = r.arm === "teblid" ? against(r.ratio) : "";
            const shipped = r.arm === "teblid" ? against(0.8) : "";
            console.log(`| ${r.clip} | ${r.sched} | ${r.ratio} | ${r.arm} | ${sp.text} | ${same} | ${shipped} |`);
        }
        console.log("");
    }
    console.log("### LOST frames, summed over the 8 seeds: never yet acquired, and lock lost, with reasons\n");
    console.log("| clip | schedule | ratio | arm | never yet acquired | lock lost |");
    console.log("| --- | --- | --- | --- | --- | --- |");
    const sum = (objs) => {
        const o = {};
        for (const x of objs) for (const [k, v] of Object.entries(x)) o[k] = (o[k] ?? 0) + v;
        return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
    };
    for (const r of rows) {
        const nv = r.figs.reduce((s, x) => s + x.lost.nNever, 0);
        const nl = r.figs.reduce((s, x) => s + x.lost.nLost, 0);
        console.log(`| ${r.clip} | ${r.sched} | ${r.ratio} | ${r.arm} | ${nv}: ${sum(r.figs.map((x) => x.lost.never)) || "—"} | ${nl}: ${sum(r.figs.map((x) => x.lost.lost)) || "—"} |`);
    }
    console.log("");
}

function statelessReport(dir, prefix = "stateless") {
    const docs = load(dir, new RegExp(`^${prefix}-.*\\.json$`));
    if (docs.length === 0) fail(`no ${prefix}-*.json in ${dir}`);
    if (prefix === "stateless") requireCheckOrb(dir);
    const by = new Map(docs.map((d) => [`${d.clip}|${d.arm}|${d.ratio}|${d.seed}`, d]));
    const keys = [...new Set(docs.map((d) => `${d.clip}|${d.ratio}`))].sort();
    // Every check before any figure: seed sets, and the paired frames' counts and media times.
    for (const k of keys) {
        const [clip, ratio] = k.split("|");
        for (const arm of ["orb", "teblid"]) {
            const n = [1, 2, 3, 4, 5, 6, 7, 8].filter((sd) => by.has(`${clip}|${arm}|${ratio}|${sd}`)).length;
            if (n !== 0 && n !== 8) fail(`${prefix} ${clip} ${arm} ${ratio}: ${n} seeds`);
        }
        for (let sd = 1; sd <= 8; sd++) {
            const a = by.get(`${clip}|orb|${ratio}|${sd}`);
            const b = by.get(`${clip}|teblid|${ratio}|${sd}`);
            if (!a || !b) continue;
            if (a.rows.length !== b.rows.length) fail(`${prefix} ${clip} ${ratio} ${sd}: frame counts differ`);
            a.rows.forEach((x, i) => {
                if (x.t !== b.rows[i].t) fail(`${prefix} ${clip} ${ratio} ${sd}: frame ${i} media times differ`);
            });
        }
    }
    console.log(`## ${prefix === "mirror" ? "Mirrored frames (every acceptance is wrong)" : "Stateless mode"}, every frame of one loop, over seeds 1–8\n`);
    console.log("| clip | ratio | arm | accepted (share, mean over seeds; range) | at least 4 matches | matches, median / mean | inliers on accepted, median | reasons, summed over seeds |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const k of keys) {
        const [clip, ratio] = k.split("|");
        for (const arm of ["orb", "teblid"]) {
            const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => by.get(`${clip}|${arm}|${ratio}|${s}`)).filter(Boolean);
            if (runs.length === 0) continue;
            if (runs.length !== 8) fail(`${prefix} ${clip} ${arm} ${ratio}: ${runs.length} seeds`);
            const acc = runs.map((r) => r.rows.filter((x) => x.ok).length / r.rows.length);
            const four = runs[0].rows.filter((x) => x.numMatches >= 4).length / runs[0].rows.length;
            const m = runs[0].rows.map((x) => x.numMatches);
            const inl = runs.flatMap((r) => r.rows.filter((x) => x.ok).map((x) => x.numInliers));
            const reasons = {};
            for (const r of runs) for (const x of r.rows) if (!x.ok) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
            console.log(
                `| ${clip} | ${ratio} | ${arm} | ${f(mean(acc), 4)} (${f(Math.min(...acc), 4)}–${f(Math.max(...acc), 4)}) | ${f(four, 4)} | ${median(m)} / ${f(mean(m), 2)} | ${median(inl) ?? "n/a"} | ${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${b}`).join(", ")} |`,
            );
        }
    }
    console.log("");
    if (prefix !== "stateless") return;
    console.log("### Paired per frame, same seed and ratio: frames one arm accepts and the other refuses, summed over seeds\n");
    console.log("| clip | ratio | both | TEBLID only | ORB only | neither | frames × seeds |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const k of keys) {
        const [clip, ratio] = k.split("|");
        let both = 0, t = 0, o = 0, none = 0, n = 0;
        for (let s = 1; s <= 8; s++) {
            const a = by.get(`${clip}|orb|${ratio}|${s}`);
            const b = by.get(`${clip}|teblid|${ratio}|${s}`);
            if (!a || !b) continue;
            if (a.rows.length !== b.rows.length) fail(`${clip} ${ratio} ${s}: frame counts differ`);
            a.rows.forEach((x, i) => {
                if (x.t !== b.rows[i].t) fail(`${clip} ${ratio} ${s}: frame ${i} media times differ`);
                n++;
                if (x.ok && b.rows[i].ok) both++;
                else if (b.rows[i].ok) t++;
                else if (x.ok) o++;
                else none++;
            });
        }
        if (n > 0) console.log(`| ${clip} | ${ratio} | ${both} | ${t} | ${o} | ${none} | ${n} |`);
    }
    console.log("");
    console.log("### Detection stages, desktop wall time per frame, ms, over every frame of the 8 seeds (prototype timings; nitro-walt)\n");
    console.log("| clip | ratio | arm | detect p50 / p95 | describe p50 / p95 | match p50 / p95 | estimateHomography p50 / p95 | sum p50 / p95 |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const k of keys) {
        const [clip, ratio] = k.split("|");
        for (const arm of ["orb", "teblid"]) {
            const rowsAll = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((s) => by.get(`${clip}|${arm}|${ratio}|${s}`)?.rows ?? []);
            if (rowsAll.length === 0) continue;
            const cell = (sel) => {
                const v = rowsAll.map(sel);
                return `${f(quant(v, 0.5), 2)} / ${f(quant(v, 0.95), 2)}`;
            };
            console.log(
                `| ${clip} | ${ratio} | ${arm} | ${cell((x) => x.stages.detect)} | ${cell((x) => x.stages.describe)} | ${cell((x) => x.stages.match)} | ${cell((x) => x.stages.estimateHomography)} | ${cell((x) => x.stages.detect + x.stages.describe + x.stages.match + x.stages.estimateHomography)} |`,
            );
        }
    }
    console.log("");
}

function gmsReport(dir) {
    const docs = load(dir, /^gms-.*\.json$/);
    if (docs.length === 0) fail(`no gms-*.json in ${dir}`);
    // The cross-check: the ratio-tested set equals the stateless run's, frame for frame.
    for (const d of docs) {
        const st = JSON.parse(readFileSync(join(dir, `stateless-${d.clip}-${d.arm}-r0.8-s${d.seed}.json`), "utf8"));
        if (st.rows.length !== d.rows.length) fail(`gms ${d.clip} ${d.arm} seed ${d.seed}: ${d.rows.length} frames, the stateless run ${st.rows.length}`);
        d.rows.forEach((r, i) => {
            const s = st.rows[i];
            if (r.t !== s.t || r.ratio.n !== s.numMatches || r.ratio.accepted !== s.ok) fail(`gms ${d.clip} ${d.arm} seed ${d.seed}: frame ${i} differs from the stateless run`);
        });
    }
    console.log("Cross-check: the GMS runs' ratio-tested set equals the stateless runs' matches and acceptance, every frame of every run.\n");
    console.log("## GMS, as a question: what each match set keeps and what it changes, every frame of one loop, summed over seeds 1–8\n");
    const SETS = ["ratio", "ratioGms", "ratioGmsRS", "nn", "nnGms", "nnGmsRS"];
    console.log("| clip | arm | set | matches, median / mean | frames with at least 4 | accepted | accepted where the ratio set is not | refused where the ratio set is accepted |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of [...new Set(docs.map((d) => d.clip))].sort())
        for (const arm of ["orb", "teblid"]) {
            const n = docs.filter((d) => d.clip === clip && d.arm === arm).length;
            if (n !== 8) fail(`gms ${clip} ${arm}: ${n} seeds`);
        }
    for (const clip of [...new Set(docs.map((d) => d.clip))].sort()) {
        for (const arm of ["orb", "teblid"]) {
            const runs = docs.filter((d) => d.clip === clip && d.arm === arm);
            for (const set of SETS) {
                const n = runs[0].rows.map((r) => r[set].n);
                let four = 0, acc = 0, gain = 0, loss = 0;
                for (const d of runs)
                    for (const r of d.rows) {
                        if (r[set].n >= 4) four++;
                        if (r[set].accepted) acc++;
                        if (r[set].accepted && !r.ratio.accepted) gain++;
                        if (!r[set].accepted && r.ratio.accepted) loss++;
                    }
                const tot = runs.reduce((s, d) => s + d.rows.length, 0);
                console.log(`| ${clip} | ${arm} | ${set} | ${median(n)} / ${f(mean(n), 2)} | ${four} of ${tot} | ${acc} | ${gain} | ${loss} |`);
            }
        }
    }
    console.log("\n`ratio`: the ratio test at 0.8, as `detectTarget`. `nn`: nearest neighbour per level, best across levels. `Gms`: `gms.filter` at OpenCV's defaults; `GmsRS`: with rotation and scale. Each set through `estimateHomography` at 4 px and `detectTarget`'s two refusals (fewer than 5 inliers, not facing).\n");
}

/**
 * The ORB arm's lasting-lock frames at seed 1, ratio 0.8, every frame (the control arm only): the
 * frames of loop 0 (the first half of the run, every frame being processed) inside a lock of 50 or
 * more TRACK frames, the lock counted over the whole run, by media time.
 */
function lockReference(dir, clip) {
    const d = JSON.parse(readFileSync(join(dir, `arm-${clip}-orb-r0.8-s1-every.json`), "utf8"));
    if (d.scheduleName !== "every" || d.frames.length % 2 !== 0) fail(`lockReference ${clip}: not a two-loop every-frame run`);
    const loop0 = d.frames.length / 2;
    const ref = new Map();
    let run = [];
    const close = () => {
        if (run.length >= LASTING) for (const { fr, i } of run) if (i < loop0) ref.set(fr.mediaTimeSeconds, fr.H);
        run = [];
    };
    for (const [i, fr] of d.frames.entries()) {
        if (fr.state === "TRACK") run.push({ fr, i });
        else close();
    }
    close();
    return ref;
}

function agreementReport(dir, prefix = "stateless") {
    requireCheckOrb(dir);
    console.log("## Agreement of accepted detections with a lasting lock (a proxy, not ground truth)\n");
    console.log("Reference: the frames on which the ORB arm's every-frame tracking run (seed 1, ratio 0.8) holds a lock of 50 or more consecutive TRACK frames, its H there. Distance: the mean, frame px, over the target's four corners, between an accepted stateless detection's H and the reference H on the same frame, every seed.\n");
    console.log("| clip | ratio | arm | reference frames | accepted on them | ≤ 5 px | 5–20 px | > 20 px | median px |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    const docs = load(dir, new RegExp(`^${prefix}-.*\\.json$`));
    for (const key of [...new Set(docs.map((d) => `${d.clip}|${d.ratio}`))].sort()) {
        const [clip, ratio] = key.split("|");
        const ref = lockReference(dir, clip);
        for (const arm of ["orb", "teblid"]) {
            const runs = docs.filter((d) => d.clip === clip && d.arm === arm && String(d.ratio) === ratio);
            if (runs.length === 0) continue;
            const dist = [];
            for (const d of runs) for (const r of d.rows) if (r.ok && ref.has(r.t)) dist.push(cornerDistance(r.H, ref.get(r.t)));
            if (ref.size > 0 && !runs.some((d) => d.rows.some((r) => ref.has(r.t)))) fail(`agreement ${clip} ${arm}: no stateless frame on a reference media time`);
            console.log(
                `| ${clip} | ${ratio} | ${arm} | ${ref.size} | ${dist.length} | ${dist.filter((x) => x <= 5).length} | ${dist.filter((x) => x > 5 && x <= 20).length} | ${dist.filter((x) => x > 20).length} | ${f(median(dist), 2)} |`,
            );
        }
    }
    console.log("");
}

function truthReport(dir) {
    const r = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8"));
    console.log("## Question 1: detections scored against the true H, synthetic frames\n");
    console.log("Score: `inView(H, T)`, the RMS distance, frame px, over the target's 64 patch centres the truth puts inside the 270 × 360 frame.\n");
    console.log("| grid | ratio | arm | detections | accepted | RMS ≤ 2 px | 2–5 | 5–10 | 10–20 | > 20 | worst RMS |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const grid of ["easy", "hard", "partial"]) {
        for (const ratio of [0.7, 0.75, 0.8, 0.85, 0.9]) {
            for (const arm of ["orb", "teblid"]) {
                const P = r.poses.filter((p) => p.grid === grid && p.ratio === ratio && p.arm === arm);
                if (P.length === 0) fail(`truth: no ${grid} ${ratio} ${arm}`);
                const ok = P.filter((p) => p.ok).map((p) => p.score.rms);
                const b = (lo, hi) => ok.filter((x) => x > lo && x <= hi).length;
                console.log(`| ${grid} | ${ratio} | ${arm} | ${P.length} | ${ok.length} | ${b(-1, 2)} | ${b(2, 5)} | ${b(5, 10)} | ${b(10, 20)} | ${b(20, Infinity)} | ${f(ok.length ? Math.max(...ok) : null, 2)} |`);
            }
        }
    }
    console.log("\n### No target in the frame (160 detections a cell)\n");
    console.log("| ratio | arm | accepted | reasons |");
    console.log("| --- | --- | --- | --- |");
    for (const ratio of [0.7, 0.75, 0.8, 0.85, 0.9])
        for (const arm of ["orb", "teblid"]) {
            const N = r.negatives.filter((p) => p.ratio === ratio && p.arm === arm);
            const reasons = {};
            for (const x of N) if (!x.ok) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
            console.log(`| ${ratio} | ${arm} | ${N.filter((x) => x.ok).length} of ${N.length} | ${Object.entries(reasons).map(([a, b]) => `${a} ${b}`).join(", ")} |`);
        }
    console.log("\n### The tracker's sequences (one run each, ratio 0.8): states, and each DETECT frame's RMS against the truth and whether its next frame is TRACK\n");
    for (const s of r.sequences) {
        const det = s.frames.map((x, i) => ({ x, i })).filter(({ x }) => x.state === "DETECT");
        console.log(`- **${s.arm}, ${s.name}:** \`${s.states}\`; DETECT frames: ${det.map(({ x, i }) => `${i} ${f(x.score.rms, 2)} px ${s.frames[i + 1]?.state === "TRACK" ? "held" : "dropped"}`).join("; ")}`);
    }
    console.log("");
}

function m9Report() {
    const dir = join(ROOT, "docs/benchmarks");
    const names = readdirSync(dir).filter((n) => /^2026-11-12-tab9-m9-(table|wall)-\d+\.json$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.json$/)[1]) - Number(b.match(/(\d+)\.json$/)[1]));
    if (names.length !== 16) fail(`m9: ${names.length} exports, expected 16`);
    console.log("## M9's committed device exports, re-derived (table runs 17–24, wall runs 25–32; one ORB arm, `?seed=1`, the device's own schedule)\n");
    console.log("Each run read by `summarizeRun` over its counted loops (`loops` and `clipDurationS` as the export records them); `reacquisitions`, `firstSteps` and `heldLockSteps` are checked against the export's own `runSummary`, fatally. Matches and inliers at detection: on the frames that are not TRACK. LOST frames by the sequence rule, over the run's whole frame list (warm-up loop included), not only its counted loops.\n");
    console.log("| run | lock rate | re-acquisitions | first steps confirmed / n | held-lock steps lost / n | matches on non-TRACK frames, median | inliers on DETECT frames, median | LOST never yet acquired: reasons | LOST lock lost: reasons |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    const agg = { table: [], wall: [] };
    for (const n of names) {
        const e = JSON.parse(readFileSync(join(dir, n), "utf8"));
        const s = summarizeRun(e.frames, { clipDurationS: e.clipDurationS, loops: e.loops });
        for (const k of ["reacquisitions"]) if (s[k] !== e.runSummary[k]) fail(`${n}: ${k} ${s[k]} against the export's ${e.runSummary[k]}`);
        for (const k of ["firstSteps", "heldLockSteps"]) if (JSON.stringify(s[k]) !== JSON.stringify(e.runSummary[k])) fail(`${n}: ${k} differs from the export's`);
        if (s.trackShare !== e.runSummary.trackShare) fail(`${n}: trackShare differs from the export's`);
        const clip = n.includes("-table-") ? "table" : "wall";
        const lost = lostSplit(e.frames);
        const non = e.frames.filter((x) => x.state !== "TRACK");
        const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${b}`).join(", ") || "—";
        agg[clip].push(s);
        console.log(
            `| ${n.replace("2026-11-12-tab9-m9-", "").replace(".json", "")} | ${f(s.trackShare, 4)} | ${s.reacquisitions} | ${s.firstSteps.confirmed} / ${s.firstSteps.n} | ${s.heldLockSteps.lost} / ${s.heldLockSteps.n} | ${median(non.map((x) => x.numMatches))} | ${median(e.frames.filter((x) => x.state === "DETECT").map((x) => x.numInliers))} | ${lost.nNever}: ${fmt(lost.never)} | ${lost.nLost}: ${fmt(lost.lost)} |`,
        );
    }
    console.log("");
    for (const clip of ["table", "wall"]) {
        const a = agg[clip];
        console.log(
            `- **${clip}, over its 8 runs:** lock rate ${spread(a.map((x) => x.trackShare), 4).text}; re-acquisitions ${spread(a.map((x) => x.reacquisitions), 2).text}; first steps confirmed ${a.reduce((s, x) => s + x.firstSteps.confirmed, 0)} of ${a.reduce((s, x) => s + x.firstSteps.n, 0)}.`,
        );
    }
    console.log("");
}

function selfTest() {
    const fails = [];
    const T = (n, ok) => {
        if (!ok) fails.push(n);
    };
    const fr = (s, reason = null) => ({ state: s, reason });
    const L = lostSplit([fr("LOST", "a"), fr("DETECT"), fr("LOST", "b"), fr("TRACK"), fr("LOST", "c"), fr("LOST", "c")]);
    T("lostSplit counts before the first TRACK as never yet acquired, after as lost", L.nNever === 2 && L.nLost === 2 && L.never.a === 1 && L.never.b === 1 && L.lost.c === 2);
    T("lostSplit fires on no LOST frame", lostSplit([fr("TRACK"), fr("TRACK")]).nNever === 0);
    const tr = (n) => Array.from({ length: n }, () => fr("TRACK"));
    T("lastingLocks counts a run of 50", lastingLocks(tr(50)).n === 1);
    T("lastingLocks refuses a run of 49", lastingLocks(tr(49)).n === 0);
    T("lastingLocks splits on a DETECT", lastingLocks([...tr(60), fr("DETECT"), ...tr(55)]).n === 2);
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    T("cornerDistance is 0 on the same H", cornerDistance(I, I) === 0);
    T("cornerDistance reads a 7 px shift as 7", Math.abs(cornerDistance(I, [1, 0, 7, 0, 1, 0, 0, 0, 1]) - 7) < 1e-12);
    const sp = spread([1, 2, 3, 4, 5, 6, 7, 8], 3);
    T("spread: mean 4.5, s 2.449", Math.abs(sp.m - 4.5) < 1e-12 && Math.abs(sp.s - 2.449489742783178) < 1e-12);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

const [mode, dir] = process.argv.slice(2);
if (mode === "--self-test") selfTest();
else if (mode === "m9") m9Report();
else if (!dir) fail("usage: arms|stateless|mirror|gms|agreement|truth <run dir> | m9 | --self-test");
else if (mode === "arms") armsReport(dir);
else if (mode === "stateless") statelessReport(dir);
else if (mode === "mirror") statelessReport(dir, "mirror");
else if (mode === "gms") gmsReport(dir);
else if (mode === "agreement") agreementReport(dir);
else if (mode === "truth") truthReport(dir);
else fail(`unknown mode ${mode}`);
