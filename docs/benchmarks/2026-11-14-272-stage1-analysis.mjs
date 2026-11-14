/*
 *  2026-11-14-272-stage1-analysis.mjs
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
 * #272, M11's Stage 1: the figures, from the runner's output (`2026-11-14-272-stage1-probe.mjs`,
 * `2026-11-14-272-stage1-truth.mjs`) and M9's committed device exports. Prints Markdown. Every check
 * is fatal (exit 1) and runs before the first figure of its part.
 *
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs metric <run dir>
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs refusals <run dir>
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs ladder <run dir>
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs levers <run dir>
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs mirror <run dir>
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs truth <run dir>
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs m9
 *     node docs/benchmarks/2026-11-14-272-stage1-analysis.mjs --self-test
 *
 * ffprobe on PATH (the clips' loop periods and frame times). Every mode reading the clip runs
 * refuses a run directory without #262's runner's `check-orb.json` recording a pass, and checks
 * this probe's `none` arm at seed 1, every frame, equal frame for frame to the ORB arm `check-orb`
 * passed (`arm-<clip>-orb-r0.8-s1-every.json`).
 *
 * **Definitions**, each the page's where the page has one:
 * - **Lock rate**: `summarizeRun(frames, { clipDurationS }).trackShare` over the run's two loops,
 *   `clipDurationS` the clip's loop period (`loopPeriod`), as #262.
 * - **Re-lock latency** ({@link relockLatency}): a **loss** is a processed frame that is not
 *   `TRACK` after one that is, other than the first frame after a loop wrap (`wrapsOf`, the page's
 *   wrap rule); its latency is the count of processed frames from it to the next `TRACK` frame, and
 *   the media time between them on the unwrapped timeline (`unwrapMediaTimes`). A loss with no
 *   later `TRACK` frame in the run is **censored**: counted, with no latency. Per run: the median
 *   latency, frames and ms, and the counts.
 * - **First steps confirmed**: `lockSteps(frames).firstSteps`, the page's.
 * - **Over seeds 1–8:** mean, s (7 degrees of freedom), the 95% interval of the mean
 *   (± 2.3646 · s / √8) and the range.
 * - **A lever against the shipped arm, per seed:** d = lever − shipped on the same seed, schedule
 *   and clip (under the frame policy the same frame detects alike in both arms until they diverge),
 *   d̄ with its 95% interval on 7 degrees of freedom, beside the shipped arm's own s.
 * - **Paired detections:** the ladder's rows, the same detection handed to the shipped step and to
 *   the lever's on the same frame; discordant counts (lever only confirmed, shipped only) and the
 *   two-sided exact sign test on them.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { summarizeRun, lockSteps, unwrapMediaTimes } = await imp("examples/js/bench-metrics.mjs");
const { wrapsOf } = await imp("examples/js/bench-loops.mjs");
const { detectionLockList } = await imp("examples/js/bench-locks.mjs");
const { loopPeriod } = await imp("scripts/replay-run.mjs");

const CLIP_FILES = { static: "pinball-static.mp4", wall: "pinball-bench.mp4", table: "pinball-bench-table.mp4", cross: "pinball-tilt-cross.mp4" };
const T95_7 = 2.3646;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LEVERS = ["V", "R1", "R2", "R3", "S", "T"];
const SCHEDULES = ["every", "device-15", "device-25"];
/** A synthetic set holding fewer wrong detections than this cannot show a lever "not confirming wrong ones": the half of the criterion is void, not passed. */
export const VOID_N = 10;
const LASTING = 50;

function fail(why) {
    console.error(`272-analysis: ${why}`);
    process.exit(1);
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const median = (a) => {
    if (a.length === 0) return null;
    const b = [...a].sort((x, y) => x - y);
    return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};
const f = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? "n/a" : Number(x).toFixed(d));
export function spread(a, d = 3) {
    if (a.length !== 8) fail(`expected 8 seeds, got ${a.length}`);
    if (a.some((x) => x === null || Number.isNaN(x))) return { m: null, s: null, text: `a seed with none: ${a.map((x) => f(x, d)).join(", ")}` };
    const m = mean(a);
    const s = sd(a);
    const h = (T95_7 * s) / Math.sqrt(8);
    return { m, s, lo: m - h, hi: m + h, min: Math.min(...a), max: Math.max(...a), text: `${f(m, d)} (s ${f(s, d)}; [${f(m - h, d)}, ${f(m + h, d)}]; range ${f(Math.min(...a), d)}–${f(Math.max(...a), d)})` };
}
/** Two-sided exact sign test on discordant counts. */
export function signTest(a, b) {
    const n = a + b;
    if (n === 0) return 1;
    const k = Math.min(a, b);
    let p = 0;
    let c = 1;
    for (let i = 0; i <= n; i++) {
        if (i > 0) c = (c * (n - i + 1)) / i;
        if (i <= k) p += c;
    }
    return Math.min(1, (2 * p) / 2 ** n);
}

/** The re-lock latency of a run (the definition above). */
export function relockLatency(frames, clipDurationS) {
    const wraps = wrapsOf(frames, clipDurationS);
    const t = unwrapMediaTimes(frames, clipDurationS);
    const events = [];
    let censored = 0;
    for (let i = 1; i < frames.length; i++) {
        if (frames[i].state === "TRACK" || frames[i - 1].state !== "TRACK" || wraps[i]) continue;
        let j = i + 1;
        while (j < frames.length && frames[j].state !== "TRACK") j++;
        if (j >= frames.length) censored++;
        else events.push({ i, frames: j - i, ms: (t[j] - t[i]) * 1000 });
    }
    return { events, censored, medianFrames: median(events.map((e) => e.frames)), medianMs: median(events.map((e) => e.ms)) };
}
/** From each of `reference`'s loss frames, the processed frames until `frames` (same schedule, every frame) is next TRACK, at or after it. */
export function latencyOnEvents(frames, reference, clipDurationS) {
    const ev = relockLatency(reference, clipDurationS).events;
    const out = [];
    for (const e of ev) {
        let j = e.i;
        while (j < frames.length && frames[j].state !== "TRACK") j++;
        if (j < frames.length) out.push(j - e.i);
    }
    return { n: ev.length, reached: out.length, median: median(out) };
}

const periods = {};
function clipPeriod(clip) {
    if (periods[clip]) return periods[clip];
    const json = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "json", join(ROOT, "examples/videos", CLIP_FILES[clip])], { maxBuffer: 64 << 20 }).toString());
    const pts = json.frames.map((x) => Number(x.pts_time));
    periods[clip] = { D: loopPeriod(pts), pts };
    return periods[clip];
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const strip = (fr) => {
    const { timings, trackerTimings, stages, ...rest } = fr;
    return JSON.stringify(rest);
};

/** check-orb's pass, and this probe's none arm at seed 1 equal to the ORB arm it passed on. */
function requireCheckOrb(dir, clips) {
    let m;
    try {
        m = readJson(join(dir, "check-orb.json"));
    } catch {
        fail(`${dir} has no check-orb.json: run #262's runner's check-orb mode on it first`);
    }
    if (m.passed !== true || !(m.frames > 0)) fail("check-orb.json does not record a pass");
    for (const clip of clips) {
        const a = join(dir, `arm-${clip}-orb-r0.8-s1-every.json`);
        const b = join(dir, `run-${clip}-none-s1-every.json`);
        if (!existsSync(a) || !existsSync(b)) fail(`${clip}: ${existsSync(a) ? b : a} missing`);
        const A = readJson(a).frames;
        const B = readJson(b).frames;
        if (A.length !== B.length || A.some((x, i) => strip(x) !== strip(B[i]))) fail(`${clip}: this probe's none arm at seed 1 differs from the ORB arm check-orb passed`);
    }
}
function runsOf(dir, prefix, clip, lever, sched) {
    const docs = SEEDS.map((s) => {
        const p = join(dir, `${prefix}-${clip}-${lever}-s${s}-${sched}.json`);
        return existsSync(p) ? readJson(p) : null;
    });
    if (docs.some((d) => d === null)) {
        if (docs.every((d) => d === null) && (clip === "static" || clip === "cross" || prefix === "mirror")) return null;
        fail(`${prefix} ${clip} ${lever} ${sched}: ${docs.filter((d) => d === null).length} of 8 seeds missing`);
    }
    return docs;
}
function runFigures(doc, D) {
    const s = summarizeRun(doc.frames, { clipDurationS: D });
    const L = relockLatency(doc.frames, D);
    let lasting = 0;
    let run = 0;
    for (const fr of [...doc.frames, { state: "END" }]) {
        if (fr.state === "TRACK") run++;
        else {
            if (run >= LASTING) lasting++;
            run = 0;
        }
    }
    return {
        lockRate: s.trackShare,
        losses: L.events.length + L.censored,
        censored: L.censored,
        relockFrames: L.medianFrames,
        relockMs: L.medianMs,
        firstSteps: s.firstSteps.n,
        confirmed: s.firstSteps.confirmed,
        share: s.firstSteps.n ? s.firstSteps.confirmed / s.firstSteps.n : null,
        heldLost: s.heldLockSteps.lost,
        lasting,
        events: L.events,
    };
}

function metricReport(dir) {
    requireCheckOrb(dir, ["table", "wall"]);
    console.log("## Question 1: the metric and its spread, the shipped arm (ORB, ratio 0.8), seeds 1–8\n");
    console.log("Each run over its two loops. Lock rate: `trackShare`. Re-lock latency: the median over a run's losses, processed frames and ms of media time (definition in the script's header). Censored: losses never re-locked in the run.\n");
    console.log("| clip | schedule | lock rate | re-lock latency, frames | re-lock latency, ms | losses | censored | first steps confirmed / first steps | share confirmed | held-lock steps lost | lasting locks |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall", "static", "cross"]) {
        const { D } = clipPeriod(clip);
        for (const sched of SCHEDULES) {
            const docs = runsOf(dir, "run", clip, "none", sched);
            if (!docs) continue;
            const F = docs.map((d) => runFigures(d, D));
            const sum = (k) => F.reduce((s, x) => s + x[k], 0);
            console.log(`| ${clip} | ${sched} | ${spread(F.map((x) => x.lockRate), 4).text} | ${spread(F.map((x) => x.relockFrames), 2).text} | ${spread(F.map((x) => x.relockMs), 1).text} | ${spread(F.map((x) => x.losses), 2).text} | ${sum("censored")} | ${sum("confirmed")} / ${sum("firstSteps")} | ${spread(F.map((x) => x.share), 3).text} | ${sum("heldLost")} | ${spread(F.map((x) => x.lasting), 2).text} |`);
        }
    }
    // Which table runs give the same frames under both device schedules.
    for (const clip of ["table", "wall"]) {
        const a = runsOf(dir, "run", clip, "none", "device-15");
        const b = runsOf(dir, "run", clip, "none", "device-25");
        if (!a || !b) continue;
        const same = a.filter((d, i) => d.frames.map((x) => `${x.mediaTimeSeconds}:${x.state}`).join() === b[i].frames.map((x) => `${x.mediaTimeSeconds}:${x.state}`).join()).length;
        console.log(`\n- ${clip}: ${same} of 8 device-15 runs give the same frames and states as their device-25 run.`);
    }
    console.log("\n### The selection effect: the next-frame step after every accepted detection, against the first steps the every-frame runs take\n");
    console.log("Population: every frame of one loop detected stateless at the seed, and from each accepted detection the shipped first step on the next frame. Runs: the every-frame runs' first steps (`lockSteps`), both loops.\n");
    console.log("| clip | accepted detections a seed | their next-frame step confirmed (share) | the runs' first steps a seed | confirmed (share) |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"]) {
        const pop = SEEDS.map((s) => {
            const p = join(dir, `population-${clip}-s${s}.json`);
            if (!existsSync(p)) fail(`${p} missing`);
            return readJson(p).rows;
        });
        const stepped = pop.map((rows) => rows.filter((r) => r.ok && r.next !== null));
        const runs = runsOf(dir, "run", clip, "none", "every");
        const F = runs.map((d) => runFigures(d, clipPeriod(clip).D));
        console.log(`| ${clip} | ${spread(stepped.map((r) => r.length), 1).text} | ${spread(stepped.map((r) => r.filter((x) => x.next === "confirmed").length / r.length), 3).text} | ${spread(F.map((x) => x.firstSteps), 1).text} | ${spread(F.map((x) => x.share), 3).text} |`);
    }
    console.log("");
}

const OUTCOMES = ["culled", "observed", "unconverged", "lost", "rejected", "failed"];
function refusalsReport(dir) {
    requireCheckOrb(dir, ["table", "wall"]);
    console.log("## Question 2: the refusals, the shipped arm, seeds 1–8 summed\n");
    console.log("### First steps by `trackLoss` (refused ones), `too-few-patches` split by where it fired: before the fit (fewer than 8 observations) or after it (fewer than 8 inliers)\n");
    console.log("| clip | schedule | first steps | confirmed | too-few-patches before the fit | after the fit | poor-fit | too-many-outliers | fit-failed | other |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"])
        for (const sched of SCHEDULES) {
            const docs = runsOf(dir, "run", clip, "none", sched);
            if (!docs) continue;
            const S = docs.flatMap((d) => d.steps.filter((s) => s.first));
            const c = (pred) => S.filter(pred).length;
            const known = ["too-few-patches", "poor-fit", "too-many-outliers", "fit-failed"];
            console.log(`| ${clip} | ${sched} | ${S.length} | ${c((s) => s.ok)} | ${c((s) => s.loss === "too-few-patches" && s.stats.rmsError === null)} | ${c((s) => s.loss === "too-few-patches" && s.stats.rmsError !== null)} | ${c((s) => s.loss === "poor-fit")} | ${c((s) => s.loss === "too-many-outliers")} | ${c((s) => s.loss === "fit-failed")} | ${c((s) => !s.ok && !known.includes(s.loss))} |`);
        }
    console.log("\n### Per patch, through `trackFrame` (the runner's `patches` mode): first steps against held-lock steps; shares of attempted patches, the median over steps, and the pooled share\n");
    console.log("Unconverged is split by re-aligning with the cap doubled: the same observation means the cap did not bind (at an edge), another means it did (at the cap).\n");
    console.log("| clip | schedule | steps | n | culled (of 48) | converged and kept | unconverged at the cap | at an edge | rejected by the ZNCC gate | lost | failed |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"])
        for (const sched of SCHEDULES) {
            const rows = SEEDS.flatMap((s) => {
                const p = join(dir, `patches-${clip}-s${s}-${sched}.json`);
                if (!existsSync(p)) fail(`${p} missing`);
                return readJson(p).rows;
            });
            if (rows.length === 0) continue;
            for (const [label, sel] of [["first, refused", (r) => r.first && !r.ok], ["first, confirmed", (r) => r.first && r.ok], ["held", (r) => !r.first]]) {
                const R = rows.filter((r) => sel(r) && r.stats.attempted > 0);
                if (R.length === 0) continue;
                const share = (get) => {
                    const per = R.map((r) => get(r) / r.stats.attempted);
                    const pooled = R.reduce((s, r) => s + get(r), 0) / R.reduce((s, r) => s + r.stats.attempted, 0);
                    return `${f(median(per), 2)} / ${f(pooled, 2)}`;
                };
                console.log(`| ${clip} | ${sched} | ${label} | ${R.length} | ${f(median(R.map((r) => r.stats.culled)), 1)} | ${share((r) => r.stats.observed)} | ${share((r) => r.cap)} | ${share((r) => r.edge)} | ${share((r) => r.stats.rejected)} | ${share((r) => r.stats.lost)} | ${share((r) => r.stats.failed)} |`);
            }
        }
    let edge = 0, cap = 0, unconverged = 0;
    for (const n of readdirSync(dir).filter((x) => /^patches-(table|wall)-s[1-8]-/.test(x))) for (const r of readJson(join(dir, n)).rows) {
        edge += r.edge;
        cap += r.cap;
        unconverged += r.stats.unconverged;
    }
    console.log(`
Over every step of every run above: ${unconverged} unconverged patches, ${cap} at the cap and ${edge} at an edge.
`);
}

function ladderRows(dir, clip, sched) {
    return SEEDS.map((s) => {
        const p = join(dir, `ladder-${clip}-s${s}-${sched}.json`);
        if (!existsSync(p)) return null;
        return readJson(p).rows;
    });
}
function ladderReport(dir) {
    requireCheckOrb(dir, ["table", "wall"]);
    console.log("## Question 3: the lag ladder, the shipped step from each first step's own detection\n");
    console.log("+L: the step on the clip frame L after the detected one (+0 its own frame). Own lag: the frame the run stepped on. Counts summed over seeds 1–8; the per-seed share confirmed at +0 minus at the own lag is d.\n");
    console.log("| clip | schedule | first steps | own lag, clip frames (median, range) | +0 | +1 | +2 | +3 | +4 | +5 | own lag | refused at +0 (seeds with one) | confirmed at +0, refused at own lag | d = +0 − own lag, per seed |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall", "static", "cross"])
        for (const sched of SCHEDULES) {
            const per = ladderRows(dir, clip, sched);
            if (per.some((x) => x === null)) continue;
            // A step on the loop's first frames after a detection on its last: the lag wraps the clip.
            const n = clipPeriod(clip).pts.length;
            for (const R of per) for (const r of R) if (r.lag < 0) r.lag += n;
            const rows = per.flat();
            const rung = (L) => {
                const R = rows.filter((r) => r.rungs[L] !== null);
                return `${R.filter((r) => r.rungs[L] === "confirmed").length} of ${R.length}`;
            };
            const lags = rows.map((r) => r.lag);
            const d = per.map((R) => (R.length ? R.filter((r) => r.rungs[0] === "confirmed").length / R.length - R.filter((r) => r.own === "confirmed").length / R.length : null));
            console.log(`| ${clip} | ${sched} | ${rows.length} | ${median(lags)} (${lags.length ? Math.min(...lags) : "–"}–${lags.length ? Math.max(...lags) : "–"}) | ${[0, 1, 2, 3, 4, 5].map(rung).join(" | ")} | ${rows.filter((r) => r.own === "confirmed").length} | ${rows.filter((r) => r.rungs[0] !== "confirmed").length} (${per.filter((R) => R.some((r) => r.rungs[0] !== "confirmed")).length} of 8) | ${rows.filter((r) => r.rungs[0] === "confirmed" && r.own !== "confirmed").length} | ${spread(d, 3).text} |`);
        }
    console.log("\n### Refusals at +0, by reason (summed over seeds)\n");
    for (const clip of ["table", "wall"])
        for (const sched of SCHEDULES) {
            const per = ladderRows(dir, clip, sched);
            if (per.some((x) => x === null)) continue;
            const r0 = {};
            for (const r of per.flat()) if (r.rungs[0] !== "confirmed") r0[r.rungs[0]] = (r0[r.rungs[0]] ?? 0) + 1;
            console.log(`- ${clip}, ${sched}: ${Object.entries(r0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
        }
    console.log("");
}

function leversReport(dir) {
    requireCheckOrb(dir, ["table", "wall"]);
    console.log("## Question 5: the levers against the shipped arm, per seed\n");
    console.log("d = lever − shipped on the same seed; d̄ with its 95% interval (7 degrees of freedom); the shipped arm's s beside it; k: the lever's seeds outside the shipped arm's range, above / below (descriptive only).\n");
    console.log("| clip | schedule | lever | shipped lock rate | d̄ lock rate [interval] | shipped s | k above / below | d̄ first steps confirmed [interval] | re-lock latency on the shipped arm's losses, median frames (lever / shipped) |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"]) {
        const { D } = clipPeriod(clip);
        for (const sched of SCHEDULES) {
            const base = runsOf(dir, "run", clip, "none", sched);
            if (!base) continue;
            const B = base.map((d) => runFigures(d, D));
            const bl = B.map((x) => x.lockRate);
            for (const lever of LEVERS) {
                const docs = runsOf(dir, "run", clip, lever, sched);
                if (!docs) continue;
                const L = docs.map((d) => runFigures(d, D));
                const d = L.map((x, i) => x.lockRate - B[i].lockRate);
                const dc = L.map((x, i) => x.confirmed - B[i].confirmed);
                const hi = Math.max(...bl);
                const lo = Math.min(...bl);
                let lat = "–";
                if (sched === "every") {
                    const onAll = docs.map((x, i) => latencyOnEvents(x.frames, base[i].frames, D));
                    const on = onAll.map((x) => x.median);
                    const own = docs.map((x, i) => latencyOnEvents(base[i].frames, base[i].frames, D).median);
                    lat = `${f(mean(on.filter((x) => x !== null)), 2)} / ${f(mean(own.filter((x) => x !== null)), 2)} (seeds with a loss: ${on.filter((x) => x !== null).length}; losses re-locked by the lever: ${onAll.reduce((a, x) => a + x.reached, 0)} of ${onAll.reduce((a, x) => a + x.n, 0)})`;
                }
                const sp = spread(d, 4);
                const spc = spread(dc, 2);
                console.log(`| ${clip} | ${sched} | ${lever} | ${f(mean(bl), 4)} | ${f(sp.m, 4)} [${f(sp.lo, 4)}, ${f(sp.hi, 4)}] | ${f(sd(bl), 4)} | ${L.filter((x) => x.lockRate > hi).length} / ${L.filter((x) => x.lockRate < lo).length} | ${f(spc.m, 2)} [${f(spc.lo, 2)}, ${f(spc.hi, 2)}] | ${lat} |`);
            }
        }
    }
    console.log("\n### Paired detections: the same detection, the shipped first step against the lever's on the same frame (the ladder's rows), summed over seeds\n");
    console.log("Discordant: the lever confirms where the shipped step does not / the shipped step confirms where the lever does not; p: the two-sided exact sign test on them. T: only rows where the run's re-detection on the refused frame failed are eligible; its \"lever confirms\" is a confirmation on the retry.\n");
    console.log("| clip | schedule | lever | rows | eligible | shipped confirmed | lever confirmed | lever only | shipped only | p |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"])
        for (const sched of SCHEDULES) {
            const per = ladderRows(dir, clip, sched);
            if (per.some((x) => x === null)) continue;
            const rows = per.flat();
            for (const lever of LEVERS) {
                const E = lever === "T" ? rows.filter((r) => r.tEligible) : lever === "V" ? rows.filter((r) => r.chain) : rows;
                const sh = (r) => r.own === "confirmed";
                const lv = (r) => r.levers[lever] === "confirmed" || r.levers[lever] === "confirmed-on-retry";
                const a = E.filter((r) => lv(r) && !sh(r)).length;
                const b = E.filter((r) => sh(r) && !lv(r)).length;
                console.log(`| ${clip} | ${sched} | ${lever} | ${rows.length} | ${E.length} | ${E.filter(sh).length} | ${E.filter(lv).length} | ${a} | ${b} | ${f(signTest(a, b), 4)} |`);
            }
        }
    console.log("");
}

function mirrorReport(dir) {
    console.log("## Mirrored frames: every lock is wrong\n");
    console.log("### Tracking runs on the mirrored clips, every frame, seeds 1–8: TRACK frames (each a wrong pose held) and first steps confirmed\n");
    console.log("| clip | lever | TRACK frames, summed | per seed (range) | first steps confirmed / first steps |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"])
        for (const lever of ["none", ...LEVERS]) {
            const docs = runsOf(dir, "mirror", clip, lever, "every");
            if (!docs) continue;
            const tr = docs.map((d) => d.frames.filter((x) => x.state === "TRACK").length);
            const ls = docs.map((d) => lockSteps(d.frames).firstSteps);
            console.log(`| ${clip} | ${lever} | ${tr.reduce((s, x) => s + x, 0)} | ${Math.min(...tr)}–${Math.max(...tr)} | ${ls.reduce((s, x) => s + x.confirmed, 0)} / ${ls.reduce((s, x) => s + x.n, 0)} |`);
        }
    console.log("\n### The stress set on mirrored frames: every accepted detection at each ratio, each lever's first step from it on the next frame (each confirmation a wrong acceptance), summed over seeds\n");
    console.log("| clip | ratio | accepted detections | none | V | R1 | R2 | R3 | S | T |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"])
        for (const ratio of [0.7, 0.75, 0.8, 0.85, 0.9]) {
            const per = SEEDS.map((s) => {
                const p = join(dir, `stress-${clip}-r${ratio}-s${s}.json`);
                return existsSync(p) ? readJson(p).rows : null;
            });
            if (per.some((x) => x === null)) continue;
            const rows = per.flat();
            const c = (l) => rows.filter((r) => r.levers[l] === "confirmed" || r.levers[l] === "confirmed-on-retry").length;
            console.log(`| ${clip} | ${ratio} | ${rows.length} | ${["none", ...LEVERS].map(c).join(" | ")} |`);
        }
    console.log("");
}

function truthReport(dir) {
    const r = readJson(join(dir, "truth.json"));
    const RIGHT = 2;
    console.log("## Question 4: right or wrong on synthetic truth, by mechanism\n");
    console.log(`A detection is right within ${RIGHT} px RMS of the truth (\`inView\`), else wrong. A first step is read on the detection it started from; its output H is scored too (\"out > 2 px\": a confirmed step whose pose is wrong whatever its detection).\n`);
    console.log("### The ground truth's sequences (seed 20260925, one run each)\n");
    console.log("| sequence | frames | lever | states | DETECT frames: right / wrong | first steps from a right detection: confirmed / n | from a wrong one: confirmed / n | confirmed with out > 2 px | TRACK frames (over 2 px) | worst TRACK frame, px |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of r.sequences) {
        const det = s.frames.map((x, i) => ({ x, i })).filter(({ x }) => x.state === "DETECT");
        const right = det.filter(({ x }) => x.score <= RIGHT).length;
        const first = s.steps.filter((x) => x.first);
        const fr = first.filter((x) => detectionScoreOf(s, x) <= RIGHT);
        const fw = first.filter((x) => !fr.includes(x));
        console.log(`| ${s.name} | ${s.n} | ${s.lever} | \`${s.states}\` | ${right} / ${det.length - right} | ${fr.filter((x) => x.ok).length} / ${fr.length} | ${fw.filter((x) => x.ok).length} / ${fw.length} | ${first.filter((x) => x.ok && x.outScore > RIGHT).length} | ${s.frames.filter((x) => x.state === "TRACK").length} (${s.frames.filter((x) => x.state === "TRACK" && x.score > RIGHT).length}) | ${f(Math.max(0, ...s.frames.filter((x) => x.state === "TRACK").map((x) => x.score)), 3)} |`);
    }
    console.log("\n### #262's grids as short paths (4 frames; speed px a frame), each grid × speed one mechanism, seeds summed\n");
    console.log("| grid | speed | lever | paths | DETECT frames: right / wrong | first steps from right: confirmed / n | from wrong: confirmed / n | confirmed with out > 2 px | TRACK frames (over 2 px) |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    const keys = [...new Set(r.grids.map((g) => `${g.grid}|${g.speed}|${g.lever}`))];
    for (const k of keys) {
        const [grid, speed, lever] = k.split("|");
        const G = r.grids.filter((g) => g.grid === grid && String(g.speed) === speed && g.lever === lever);
        let dr = 0, dw = 0, frc = 0, frn = 0, fwc = 0, fwn = 0, out = 0, tr = 0, trw = 0;
        for (const g of G) {
            g.frames.forEach((x) => {
                if (x.state === "DETECT") x.score <= RIGHT ? dr++ : dw++;
                if (x.state === "TRACK") {
                    tr++;
                    if (x.score > RIGHT) trw++;
                }
            });
            for (const s of g.steps.filter((x) => x.first)) {
                // The detection scored on its own frame (the one before the step), as for the sequences;
                // a retry's detection is older, and is scored where it was made too.
                const det = g.frames[s.frame - 1];
                const right = det?.state === "DETECT" ? det.score <= RIGHT : detectionScoreOf(g, s) <= RIGHT;
                if (right) {
                    frn++;
                    if (s.ok) frc++;
                } else {
                    fwn++;
                    if (s.ok) fwc++;
                }
                if (s.ok && s.outScore > RIGHT) out++;
            }
        }
        console.log(`| ${grid} | ${speed} | ${lever} | ${G.length} | ${dr} / ${dw} | ${frc} / ${frn} | ${fwc} / ${fwn} | ${out} | ${tr} (${trw}) |`);
    }
    console.log("\n### The stress set: the hard grid's detections at every ratio, each lever's first step on the next frame (held or 4 px a frame), seeds summed\n");
    console.log(`Right/wrong by the detection's score on its own frame. "Void" where fewer than ${VOID_N} wrong detections exist: no reading of "confirms no wrong one".\n`);
    console.log("| ratio | right detections | wrong | lever | right confirmed | wrong confirmed | confirmed with out > 2 px |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const ratio of [0.7, 0.75, 0.8, 0.85, 0.9]) {
        const S = r.stress.filter((x) => x.ratio === ratio);
        const R = S.filter((x) => x.detScore <= RIGHT);
        const W = S.filter((x) => x.detScore > RIGHT);
        for (const lever of ["none", "V", "R1", "R2", "R3", "S"]) {
            const ok = (x) => x.levers[lever].ok;
            console.log(`| ${ratio} | ${R.length} | ${W.length}${W.length < VOID_N ? " (void)" : ""} | ${lever} | ${R.filter(ok).length} | ${W.filter(ok).length} | ${S.filter((x) => ok(x) && x.levers[lever].outScore > RIGHT).length} |`);
        }
    }
    console.log("\n### The single-step perturbation sweep (137 predictions × 2 views × 5 renders), right within 0.5 px RMS as the suite scores it\n");
    console.log("| lever | steps | right | wrong (px RMS) | refused |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const s of r.sweep) console.log(`| ${s.lever} | ${s.steps} | ${s.right} | ${s.wrong.length}${s.wrong.length ? ` (${s.wrong.map((x) => f(x, 2)).join(", ")})` : ""} | ${s.refused} |`);
    console.log("");
}

/** A retry's detection: the last DETECT frame before the step, scored on its own frame. */
function detectionScoreOf(run, step) {
    for (let i = step.frame - 1; i >= 0; i--) if (run.frames[i].state === "DETECT") return run.frames[i].score;
    return Infinity;
}

function m9Report() {
    const dir = join(ROOT, "docs/benchmarks");
    const names = readdirSync(dir).filter((n) => /^2026-11-12-tab9-m9-(table|wall)-\d+\.json$/.test(n));
    if (names.length !== 16) fail(`m9: ${names.length} exports, expected 16`);
    console.log("## M9's committed device exports: the gap from a detection to its first step, and the step's verdict\n");
    console.log("Every lock of each run's whole frame list (`detectionLockList`, the page's), its first step's frame against the detected one: the gap in clip frames (by media time on the clip's own frame times) and in ms of media time; verdict confirmed or the step's `trackLoss`. Summed over the 8 runs of each clip.\n");
    console.log("| clip | locks with a first step | gap, clip frames: median (range) | gap ms: median | confirmed at gap 1 / 2 / 3 / 4 / 5 / ≥ 6 (of n) |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"]) {
        const { pts, D } = clipPeriod(clip);
        const at = new Map(pts.map((p, i) => [Math.round(p * 1e6), i]));
        const gaps = [];
        for (const n of names.filter((x) => x.includes(`-${clip}-`))) {
            const e = readJson(join(dir, n));
            for (const L of detectionLockList(e.frames, e.clipDurationS)) {
                if (!L.step || !L.detected) continue;
                const i = at.get(Math.round(L.detected.mediaTimeSeconds * 1e6));
                const j = at.get(Math.round(L.step.mediaTimeSeconds * 1e6));
                if (i === undefined || j === undefined) fail(`m9 ${n}: a media time not on the clip's frame times`);
                const g = j >= i ? j - i : j + pts.length - i;
                let ms = (L.step.mediaTimeSeconds - L.detected.mediaTimeSeconds) * 1000;
                if (ms < 0) ms += D * 1000;
                gaps.push({ g, ms, ok: L.step.state === "TRACK" });
            }
        }
        const by = (lo, hi) => {
            const G = gaps.filter((x) => x.g >= lo && x.g <= hi);
            return `${G.filter((x) => x.ok).length} of ${G.length}`;
        };
        console.log(`| ${clip} | ${gaps.length} | ${median(gaps.map((x) => x.g))} (${Math.min(...gaps.map((x) => x.g))}–${Math.max(...gaps.map((x) => x.g))}) | ${f(median(gaps.map((x) => x.ms)), 1)} | ${[by(1, 1), by(2, 2), by(3, 3), by(4, 4), by(5, 5), by(6, 1e9)].join(" / ")} |`);
    }
    console.log("");
}

function selfTest() {
    const fails = [];
    const T = (n, ok) => ok || fails.push(n);
    const fr = (state, t) => ({ state, mediaTimeSeconds: t });
    const D = 10;
    // A loss at frame 2, TRACK again at 5: 3 frames, 0.3 s; a censored loss at 7.
    const run = [fr("DETECT", 0), fr("TRACK", 0.1), fr("DETECT", 0.2), fr("LOST", 0.3), fr("DETECT", 0.4), fr("TRACK", 0.5), fr("TRACK", 0.6), fr("LOST", 0.7), fr("LOST", 0.8)];
    const L = relockLatency(run, D);
    T("relockLatency finds one event and one censored loss", L.events.length === 1 && L.censored === 1);
    T("relockLatency counts 3 frames and 300 ms", L.events[0].frames === 3 && Math.abs(L.events[0].ms - 300) < 1e-9);
    T("relockLatency fires on no run without a loss", relockLatency([fr("TRACK", 0), fr("TRACK", 0.1)], D).events.length === 0);
    // A loss on the first frame after a loop wrap is not a loss of the tracker's.
    const wrap = [fr("TRACK", 9.8), fr("TRACK", 9.9), fr("DETECT", 0.0), fr("TRACK", 0.1)];
    T("relockLatency skips a loss at a loop wrap", relockLatency(wrap, D).events.length === 0);
    T("latencyOnEvents reads the other run from the reference's loss", latencyOnEvents(run.map((x, i) => (i === 3 ? fr("TRACK", x.mediaTimeSeconds) : x)), run, D).median === 1);
    T("signTest: 0 and 0 is 1", signTest(0, 0) === 1);
    T("signTest: 10 and 0 is 2/1024", Math.abs(signTest(10, 0) - 2 / 1024) < 1e-12);
    T("signTest is symmetric", signTest(3, 9) === signTest(9, 3));
    const sp = spread([1, 2, 3, 4, 5, 6, 7, 8], 3);
    T("spread: mean 4.5, s 2.449", Math.abs(sp.m - 4.5) < 1e-12 && Math.abs(sp.s - 2.449489742783178) < 1e-12);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [mode, dir] = process.argv.slice(2);
    if (mode === "--self-test") selfTest();
    else if (mode === "m9") m9Report();
    else if (!dir) fail("usage: metric|refusals|ladder|levers|mirror|truth <run dir> | m9 | --self-test");
    else if (mode === "metric") metricReport(dir);
    else if (mode === "refusals") refusalsReport(dir);
    else if (mode === "ladder") ladderReport(dir);
    else if (mode === "levers") leversReport(dir);
    else if (mode === "mirror") mirrorReport(dir);
    else if (mode === "truth") truthReport(dir);
    else fail(`unknown mode ${mode}`);
}
