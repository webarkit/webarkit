/*
 *  2026-11-28-280-stage1-analysis.mjs
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
 * #280, M12's Stage 1: the figures, from #278's tools' rows (`2026-11-22-278-stage1-tools.mjs`), the
 * runs of #273's runner and of `2026-11-28-280-stage1-f-runs.mjs`, and the segmented references.
 * Prints Markdown. Committed with the registration, before any counted run: every definition below
 * is the probe file's ("The definitions"), and every check is fatal (exit 1) before the first
 * figure of its mode.
 *
 *     node docs/benchmarks/2026-11-28-280-stage1-analysis.mjs --self-test
 *     node docs/benchmarks/2026-11-28-280-stage1-analysis.mjs margin
 *     node docs/benchmarks/2026-11-28-280-stage1-analysis.mjs cells --tools <dir> --runs <dir> [--trial]
 *     node docs/benchmarks/2026-11-28-280-stage1-analysis.mjs wrong --tools <dir> [--trial]
 *     node docs/benchmarks/2026-11-28-280-stage1-analysis.mjs rates --runs <dir> [--trial]
 *     node docs/benchmarks/2026-11-28-280-stage1-analysis.mjs m9 --tools <dir> [--trial]
 *
 * `<tools>` holds the tools' outputs as `<tools>/<mode>/<mode>.jsonl` (`paired`, `deep`, `m9`,
 * `wrong`); `<runs>` the runner's `run-*.json` and `mirror-*.json` and the F runs' `frun-*.json`.
 * Without `--trial`, every input's header must say it is not a trial and was made from a clean
 * tree, with the registered parameters.
 *
 * - **margin:** the gross margin exercised both ways on the three reference files, with no tracker:
 *   a quad equal to the reference's with its BL corner moved by `BL_BIAS_PX` must not cross; the
 *   quad shifted by `OFF_POSTER_FRACTION` of its own width must cross, on every accepted row of
 *   every clip; and, reported, the shift by the smallest fraction of a poster's width among #284's
 *   recorded gross rows. Then the same for the three-corner reading.
 * - **cells:** per clip, schedule and lever, the eligible events first, then the classes, the sign
 *   test, the void labels and the five stop conditions' readings on the clips.
 * - **wrong:** condition 3 on the synthetic sequences and the mirrored frames.
 * - **rates:** the descriptive lock rate per seed, its spread, and each lever's d̄ against the
 *   shipped arm. Decides nothing.
 * - **m9:** M9's recorded states, as information. Enters no condition.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { summarizeRun } from "../../examples/js/bench-metrics.mjs";
import { loopPeriod } from "../../scripts/replay-run.mjs";
import { meanCornerDistance, loadReferenceFrom, referenceFile } from "./2026-11-21-277-segmented-reference.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BENCH = join(ROOT, "docs/benchmarks");

// --- the registered parameters (the probe file, "The two parameters") --------------------------

/** The gross margin, processing px, on the mean corner distance (and on the three-corner reading). */
export const GROSS_MARGIN = 10;
/** M9's reproduction threshold, processing px: #273's `RIGHT`, by the principle the probe file states. */
export const REPRO_THRESHOLD = 2;
/** The fast reference's bottom-left bias, processing px (`2026-11-27-279-reference-fast.md`, "about 4 to 11 processing px"). */
export const BL_BIAS_PX = 11;
/** "A lock off the poster": the reference's quad shifted along x by this fraction of its own TL–TR width. */
export const OFF_POSTER_FRACTION = 0.25;
/**
 * #284's recorded gross rows (`2026-11-21-277-segmented-reference-figures.txt` and the record's
 * cross-check table): clip, clip frame, mean corner distance. Their fraction of the poster's width
 * on that frame is computed from the reference, and the smallest is reported beside the registered one.
 */
export const RECORDED_GROSS = [
    { clip: "wall", frame: 191, distance: 34.43 },
    { clip: "wall", frame: 271, distance: 31.48 },
    { clip: "table", frame: 56, distance: 13.8 },
    { clip: "table", frame: 55, distance: 18.48 },
];
/** A cell with fewer counted discordant events is void: below 6 a two-sided exact sign test cannot reach p < 0.05. */
export const VOID_EVENTS = 6;
/** A set where the shipped step can produce fewer wrong outputs than this cannot show "no more wrong" (#273's `VOID_N`). */
export const VOID_WRONG = 10;
export const ALPHA = 0.05;
export const LEVERS = ["V", "F0", "Fs", "Ffb"];
export const DECIDING = ["fast|every", "fast|device-15", "fast|device-25"];
export const CONTROL_CLIPS = ["table", "wall"];
const SCHEDULES = ["every", "device-15", "device-25"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fail(why) {
    console.error(`280-analysis: ${why}`);
    process.exit(1);
}
const f = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? "n/a" : Number(x).toFixed(d));

/** Two-sided exact sign test on two counts (#273's `signTest`, imported where the analysis is loaded; restated nowhere). */
let signTest = null;
let spread = null;
async function loadShared() {
    const m = await import(pathToFileURL(join(BENCH, "2026-11-14-272-stage1-analysis.mjs")).href);
    signTest = m.signTest;
    spread = m.spread;
}

// --- pure definitions, exercised by --self-test -------------------------------------------------

/**
 * Whether a lever can respond on a paired row's state, from the code (the probe file, "What each
 * lever can move"): V where a DETECT chain exists (`eligible`); F0 and Ffb on every age-1 state;
 * Fs where the intervals differ (`a ≠ b`) and its power was taken (not `noVerdict`).
 */
export function canRespond(row) {
    if (row.lever === "Fs") return row.eligible === true && row.a !== row.b && !row.noVerdict;
    return row.eligible === true;
}

/** Each record's loop, 0-based, from the run's own media times: a loop starts where the time steps back. */
export function loopsOf(frames) {
    let loop = 0;
    return frames.map((fr, k) => {
        if (k > 0 && fr.mediaTimeSeconds < frames[k - 1].mediaTimeSeconds) loop++;
        return loop;
    });
}

/**
 * Whether the lever's input spans a loop wrap: from the record two before the step (the lock's
 * detection at age 1; V's chain detection at age 0) to the step itself. `acrossWrap`, #278's flag,
 * reads only the hop from the record before; this reads the whole span.
 */
export function spanWrap(loops, k) {
    if (k < 2) return false;
    return loops[k - 2] !== loops[k];
}

/** The mean of TL, TR and BR (the three-corner reading) from a reference cell's per-corner distances. */
export const threeCornerMean = (d) => (d[0] + d[1] + d[2]) / 3;

/**
 * Whether one arm's output is beyond the margin on a frame the reference accepts. `null` reference
 * distance (no reference, a rejected frame, a refusal) is never beyond. `reading`: "four" (the mean
 * corner distance) or "three" (TL, TR and BR).
 */
export function beyond(out, margin, reading) {
    const r = out.reference;
    if (!out.kept || !r || r.distance === null) return false;
    if (reading === "three") {
        if (!Array.isArray(r.cornerDistances) || r.cornerDistances.length !== 4) throw new Error("a kept output on an accepted frame without its per-corner distances");
        return threeCornerMean(r.cornerDistances) > margin;
    }
    const b = r.distance > margin;
    if (r.beyondMargin !== b) throw new Error(`beyondMargin ${r.beyondMargin} against distance ${r.distance} at margin ${margin}`);
    return b;
}

/**
 * A discordant event's class, from its `deep` row: **wrong** if any kept step of the carried arm
 * (its paired output included) is beyond the margin on a frame the reference accepts; else **win**
 * if it lasted N, **tie** if it was lost before N, **censored** if the carry reached a loop's end.
 */
export function classify(row, margin, reading = "four") {
    const p = row.paired;
    const keptOut = row.direction === "lever-kept" ? p.lever_ : p.shipped;
    if (!keptOut.kept) throw new Error(`event ${row.event}: the carried arm's paired output is not kept`);
    const steps = [keptOut, ...row.steps.filter((s) => s.kept)];
    if (steps.some((o) => beyond(o, margin, reading))) return "wrong";
    if (row.outcome === "lasted") return "win";
    if (row.outcome === "lost") return "tie";
    if (row.outcome === "censored") return "censored";
    throw new Error(`event ${row.event}: outcome ${row.outcome}`);
}

/**
 * One cell's reading from its counted discordant events' classes: `{ arm: "lever"|"shipped", cls,
 * clipFrame }` each. Wins against wins, two-sided exact sign test; ties, wrong locks and censored
 * carries excluded and counted. Void when the events, or the wins, are fewer than `VOID_EVENTS`.
 */
export function cellReading(events, { censoredAsWin = false } = {}) {
    const n = (arm, cls) => events.filter((e) => e.arm === arm && e.cls === cls).length;
    const winOf = (arm) => n(arm, "win") + (censoredAsWin ? n(arm, "censored") : 0);
    const lw = winOf("lever");
    const sw = winOf("shipped");
    const p = signTest(lw, sw);
    const voidBy = events.length < VOID_EVENTS ? "events" : lw + sw < VOID_EVENTS ? "wins" : null;
    return {
        events: events.length,
        leverKept: events.filter((e) => e.arm === "lever").length,
        shippedKept: events.filter((e) => e.arm === "shipped").length,
        leverWins: lw,
        shippedWins: sw,
        p,
        voidBy,
        moves: voidBy === null && lw > sw && p < ALPHA,
        movesDown: voidBy === null && sw > lw && p < ALPHA,
        ties: [n("lever", "tie"), n("shipped", "tie")],
        wrong: [n("lever", "wrong"), n("shipped", "wrong")],
        censored: [n("lever", "censored"), n("shipped", "censored")],
    };
}

/** The refutation attempt: wins collapsed to distinct clip frames (a frame counts once for an arm if any of its events is that arm's win), the same sign test. */
export function collapsedReading(events) {
    const frames = (arm) => new Set(events.filter((e) => e.arm === arm && e.cls === "win").map((e) => e.clipFrame)).size;
    const lw = frames("lever");
    const sw = frames("shipped");
    const p = signTest(lw, sw);
    return { leverFrames: lw, shippedFrames: sw, p, moves: lw + sw >= VOID_EVENTS && lw > sw && p < ALPHA };
}

// --- inputs ---------------------------------------------------------------------------------------

function readJsonl(p) {
    if (!existsSync(p)) fail(`${p} missing`);
    const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
    return { head: JSON.parse(lines[0]), rows: lines.slice(1).map((l) => JSON.parse(l)) };
}
function checkHead(head, mode, trial) {
    if (head.kind !== "278-stage1-tools" || head.mode !== mode) fail(`${mode}: not #278's tools' ${mode} output`);
    if (!trial && (head.trial || head.clean !== true)) fail(`${mode}: a trial, or made from an uncommitted tree (pass --trial for a trial reading)`);
    const P = head.parameters;
    if (mode !== "wrong" && P.grossMargin !== GROSS_MARGIN) fail(`${mode}: gross margin ${P.grossMargin}, registered ${GROSS_MARGIN}`);
    if (mode === "m9" && P.reproThreshold !== REPRO_THRESHOLD) fail(`m9: reproduction threshold ${P.reproThreshold}, registered ${REPRO_THRESHOLD}`);
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// --- margin -----------------------------------------------------------------------------------------

const widthOf = (q) => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
function marginMode() {
    console.log(`## The gross margin, exercised on the reference files (margin ${GROSS_MARGIN} processing px)\n`);
    const refs = {};
    for (const clip of ["wall", "table", "fast"]) {
        const { why, ref } = loadReferenceFrom(BENCH, clip);
        if (why) fail(why);
        refs[clip] = ref;
    }
    const recorded = RECORDED_GROSS.map((g) => {
        const row = refs[g.clip].rows[g.frame];
        if (row.status !== "accepted") fail(`recorded gross row ${g.clip} ${g.frame}: reference frame ${row.status}`);
        return { ...g, width: widthOf(row.corners), fraction: g.distance / widthOf(row.corners) };
    });
    const smallest = Math.min(...recorded.map((g) => g.fraction));
    console.log("#284's recorded gross rows, their poster width and the fraction of it:\n");
    for (const g of recorded) console.log(`- ${g.clip} clip frame ${g.frame}: ${f(g.distance, 2)} px on a poster ${f(g.width, 2)} px wide, ${f(g.fraction, 3)} of it`);
    console.log("");
    console.log(`| clip | file | accepted rows | BL moved ${BL_BIAS_PX} px: mean (crossing) | three-corner (crossing) | shift ${OFF_POSTER_FRACTION} of width: rows crossing | three-corner | shift ${f(smallest, 3)} of width (recorded): rows crossing; frames not |`);
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    let violations = 0;
    for (const clip of ["wall", "table", "fast"]) {
        const acc = refs[clip].rows.filter((r) => r.status === "accepted");
        let blCross = 0;
        let bl3Cross = 0;
        let offCross = 0;
        let off3Cross = 0;
        let recCross = 0;
        const recNot = [];
        let blMean = null;
        for (const r of acc) {
            const q = r.corners;
            const bl = q.map((c, k) => (k === 3 ? [c[0] + BL_BIAS_PX, c[1]] : c));
            const dBl = meanCornerDistance(bl, q);
            blMean = dBl;
            if (dBl > GROSS_MARGIN) blCross++;
            if (0 > GROSS_MARGIN) bl3Cross++; // BL is outside the three-corner reading: its distance there is 0.
            const w = widthOf(q);
            const shift = (fr) => q.map(([x, y]) => [x + fr * w, y]);
            const dOff = meanCornerDistance(shift(OFF_POSTER_FRACTION), q);
            if (dOff > GROSS_MARGIN) offCross++;
            if (dOff > GROSS_MARGIN) off3Cross++; // a rigid shift moves all corners alike: the three-corner mean equals the four-corner one.
            if (meanCornerDistance(shift(smallest), q) > GROSS_MARGIN) recCross++;
            else recNot.push(r.i);
        }
        if (blCross > 0 || offCross !== acc.length || off3Cross !== acc.length) violations++;
        const notText = recNot.length ? `${recNot.length} (frames ${recNot[0]}–${recNot[recNot.length - 1]})` : "none";
        console.log(`| ${clip} | ${referenceFile(clip)} | ${acc.length} | ${f(blMean, 2)} (${blCross}) | 0.00 (${bl3Cross}) | ${offCross} of ${acc.length} | ${off3Cross} of ${acc.length} | ${recCross} of ${acc.length}; ${notText} |`);
    }
    console.log("");
    if (violations) fail(`the margin does not meet its registered constraints on ${violations} clip(s)`);
    console.log("Both registered constraints hold on every accepted row of every clip: the BL bias alone does not cross, a quarter-width shift does.\n");
}

// --- cells ------------------------------------------------------------------------------------------

function loadRunLoops(runsDir, clip, schedule, seed, prefix = "run") {
    const p = join(runsDir, `${prefix}-${clip}-none-s${seed}-${schedule}.json`);
    if (!existsSync(p)) fail(`${p} missing`);
    return loopsOf(readJson(p).frames);
}

function cellsMode(toolsDir, runsDir, trial) {
    const P = readJsonl(join(toolsDir, "paired", "paired.jsonl"));
    const D = readJsonl(join(toolsDir, "deep", "deep.jsonl"));
    checkHead(P.head, "paired", trial);
    checkHead(D.head, "deep", trial);
    const deepById = new Map();
    for (const r of D.rows) {
        if (deepById.has(r.event)) fail(`deep: event ${r.event} twice`);
        deepById.set(r.event, r);
    }
    const loopCache = new Map();
    const loopsFor = (r) => {
        const key = `${r.clip}|${r.schedule}|${r.seed}`;
        if (!loopCache.has(key)) loopCache.set(key, loadRunLoops(runsDir, r.clip, r.schedule, r.seed));
        return loopCache.get(key);
    };
    const clips = [...new Set(P.rows.map((r) => r.clip))];
    const cells = [];
    const usedDeep = new Set();
    for (const clip of clips)
        for (const schedule of SCHEDULES)
            for (const lever of LEVERS) {
                const rows = P.rows.filter((r) => r.clip === clip && r.schedule === schedule && r.lever === lever);
                if (rows.length === 0) continue;
                const events = rows.filter((r) => !r.repeats);
                const c = { clip, schedule, lever, states: rows.length, events: events.length, eligible: 0, noVerdict: 0, wrapEligible: 0, wrapDiscordant: 0, discordant: 0, classes: [], classes3: [] };
                for (const r of events) {
                    const loops = loopsFor(r);
                    if (r.acrossWrap !== (loops[r.record - 1] !== loops[r.record])) fail(`${r.id}: acrossWrap ${r.acrossWrap} against the run's own loops`);
                    if (r.noVerdict) c.noVerdict++;
                    if (!canRespond(r)) {
                        if (r.discordant) fail(`${r.id}: discordant where the lever cannot respond`);
                        continue;
                    }
                    c.eligible++;
                    if (spanWrap(loops, r.record)) {
                        c.wrapEligible++;
                        if (r.discordant) c.wrapDiscordant++;
                        continue;
                    }
                    if (!r.discordant) continue;
                    c.discordant++;
                    const d = deepById.get(r.id);
                    if (!d) fail(`${r.id}: a counted discordant event with no deep row`);
                    if (d.direction !== r.discordant || d.lever !== lever) fail(`${r.id}: the deep row's direction or lever differs`);
                    usedDeep.add(r.id);
                    let cls;
                    let cls3;
                    try {
                        cls = classify(d, GROSS_MARGIN, "four");
                        cls3 = classify(d, GROSS_MARGIN, "three");
                    } catch (e) {
                        fail(`${r.id}: ${e.message}`);
                    }
                    const arm = r.discordant === "lever-kept" ? "lever" : "shipped";
                    c.classes.push({ arm, cls, clipFrame: r.clipFrame, censoredBy: d.censoredBy });
                    c.classes3.push({ arm, cls: cls3, clipFrame: r.clipFrame });
                }
                cells.push(c);
            }
    // Every deep row not counted is one the exclusions above account for.
    for (const r of D.rows) {
        if (usedDeep.has(r.event)) continue;
        const pr = r.paired;
        if (!(spanWrap(loopsFor(pr), pr.record) || !canRespond(pr))) fail(`deep ${r.event}: neither counted nor excluded`);
    }

    console.log("## Eligible events, per clip, schedule and lever (before any class)\n");
    console.log("Events: distinct lock states (#278's key), repeats left out. Eligible: the lever can respond (V: a DETECT chain; F0, Ffb: every age-1 state; Fs: a ≠ b, its power taken). Across a wrap: eligible events whose input spans a loop wrap (from the record two before the step to the step), counted apart and excluded from every deciding figure.\n");
    console.log("| clip | schedule | lever | rows | events | eligible | Fs no verdict | across a wrap (discordant) | counted discordant |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const c of cells) console.log(`| ${c.clip} | ${c.schedule}${c.clip === "fast" && c.schedule !== "every" ? " (modelled)" : ""} | ${c.lever} | ${c.states} | ${c.events} | ${c.eligible} | ${c.lever === "Fs" ? c.noVerdict : "–"} | ${c.wrapEligible} (${c.wrapDiscordant}) | ${c.discordant} |`);

    const R = cells.map((c) => {
        const main = cellReading(c.classes);
        return { c, main, sens: cellReading(c.classes, { censoredAsWin: true }), three: cellReading(c.classes3), coll: collapsedReading(c.classes) };
    });
    console.log("\n## The classes, per cell\n");
    console.log("Win: the carried arm lasts N with no kept step beyond the margin on an accepted reference frame; tie: lost before N; wrong: a kept step beyond the margin; censored: a loop's end before N. Wins against wins, two-sided exact sign test. Void: fewer than 6 counted discordant events (events), or fewer than 6 wins in all (wins).\n");
    console.log("| clip | schedule | lever | events lever-kept / shipped-kept | wins lever / shipped | p | reading | ties | wrong | censored | censored as wins: wins, p | three corners: wins, p, wrong | clip frames: lever / shipped, p |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    const readingOf = (m) => (m.voidBy ? `void (${m.voidBy})` : m.moves ? "**moves**" : m.movesDown ? "moves down" : "does not move");
    for (const { c, main, sens, three, coll } of R)
        console.log(`| ${c.clip} | ${c.schedule}${c.clip === "fast" && c.schedule !== "every" ? " (modelled)" : ""} | ${c.lever} | ${main.leverKept} / ${main.shippedKept} | ${main.leverWins} / ${main.shippedWins} | ${f(main.p, 4)} | ${readingOf(main)} | ${main.ties.join(" / ")} | ${main.wrong.join(" / ")} | ${main.censored.join(" / ")} | ${sens.leverWins} / ${sens.shippedWins}, ${f(sens.p, 4)} (${readingOf(sens)}) | ${three.leverWins} / ${three.shippedWins}, ${f(three.p, 4)} (${readingOf(three)}), ${three.wrong.join(" / ")} | ${coll.leverFrames} / ${coll.shippedFrames}, ${f(coll.p, 4)} |`);

    console.log("\n## The stop conditions on the clips, read mechanically (the verdict is the probe file's)\n");
    const deciding = R.filter(({ c }) => DECIDING.includes(`${c.clip}|${c.schedule}`));
    // 1. The corpus cannot express the effect.
    const allVoid = LEVERS.every((l) => deciding.filter(({ c }) => c.lever === l).every(({ main }) => main.voidBy !== null));
    console.log(`1. Corpus: ${allVoid ? "**every lever void on every fast cell: the step stops on the corpus**" : "not every lever is void on every fast cell"}.`);
    for (const l of LEVERS) console.log(`   - ${l}: ${deciding.filter(({ c }) => c.lever === l).map(({ c, main }) => `${c.schedule} ${main.voidBy ? `void (${main.voidBy})` : "not void"}`).join("; ")}`);
    // 2. The lever does not better keep locks.
    const movers = deciding.filter(({ main }) => main.moves);
    console.log(`2. Metric: ${movers.length ? movers.map(({ c, main }) => `${c.lever} moves fast ${c.schedule} (${main.leverWins} / ${main.shippedWins}, p ${f(main.p, 4)})`).join("; ") : "**no lever moves any deciding cell: the step stops on the metric**"}.`);
    for (const { c, main, three, sens, coll } of movers) {
        const agree = [three.moves ? "three-corner moves" : "**three-corner does not move**", sens.moves ? "censored-as-wins moves" : "censored-as-wins does not move", coll.moves ? "clip-frame collapse moves" : "**clip-frame collapse does not move**"];
        console.log(`   - ${c.lever} fast ${c.schedule}: ${agree.join("; ")} (main ${main.leverWins} / ${main.shippedWins})`);
    }
    // 3. Wrong locks on the clips (the synthetic and mirrored halves are `wrong`'s).
    console.log("3. Wrong locks on the clips (lever's carries / shipped arm's carries on the same cell's counted discordant events; void where the shipped arm has fewer than 10 carries):");
    for (const l of LEVERS) {
        const lines = R.filter(({ c }) => c.lever === l).map(({ c, main }) => {
            const more = main.wrong[0] > main.wrong[1];
            const voidW = main.shippedKept < VOID_WRONG;
            return `${c.clip} ${c.schedule} ${main.wrong[0]} / ${main.wrong[1]}${more ? " **more**" : ""}${voidW ? " (void: " + main.shippedKept + " shipped carries)" : ""}`;
        });
        console.log(`   - ${l}: ${lines.join("; ")}`);
    }
    // 4. The control clips.
    const down = R.filter(({ c, main }) => CONTROL_CLIPS.includes(c.clip) && main.movesDown);
    console.log(`4. Control (table, wall): ${down.length ? down.map(({ c, main }) => `**${c.lever} below the shipped step on ${c.clip} ${c.schedule}** (${main.leverWins} / ${main.shippedWins}, p ${f(main.p, 4)})`).join("; ") : "no lever's wins are below the shipped step's with p < 0.05 on any control cell"}.`);
    // 5. Modelled device cells.
    for (const l of LEVERS) {
        const m = movers.filter(({ c }) => c.lever === l).map(({ c }) => c.schedule);
        if (m.length && m.every((s) => s !== "every")) console.log(`5. ${l} moves only the fast clip's device cells (modelled: acquisition borrowed from the wall): its registration starts with a measured acquisition of the fast clip on the Tab 9.`);
    }
    console.log("");
}

// --- wrong ------------------------------------------------------------------------------------------

function wrongMode(toolsDir, trial) {
    const W = readJsonl(join(toolsDir, "wrong", "wrong.jsonl"));
    checkHead(W.head, "wrong", trial);
    const tally = W.rows.find((r) => r.kind === "per-lever-and-age");
    if (!tally) fail("wrong: no per-lever-and-age row");
    const rows = W.rows.filter((r) => r.set === "sequence" || r.set === "mirror");
    const setOf = (r) => (r.set === "sequence" ? "sequences" : `mirror-${r.clip}`);
    const sets = [...new Set(rows.map(setOf))];
    console.log("## Condition 3 on the synthetic sequences and the mirrored frames\n");
    console.log(`Per set and lever, on the lever's own states: eligible states (the lever can respond; Fs cannot respond here, a = b on every state), the shipped step's and the lever's confirmed and wrong outputs. Wrong on the sequences: a confirmed output more than RIGHT = 2 px RMS off the truth (\`inView\`); on mirrored frames every confirmation. The "no more wrong" half is void on a set where the lever has fewer than ${VOID_WRONG} eligible states.\n`);
    console.log("| set | lever | states | eligible | shipped confirmed / wrong | lever confirmed / wrong | reading |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const set of sets)
        for (const lever of LEVERS) {
            const R = rows.filter((r) => setOf(r) === set && r.lever === lever);
            if (R.length === 0) continue;
            const elig = R.filter((r) => (lever === "Fs" ? false : r.eligible === true));
            const sc = R.filter((r) => r.shipped.kept).length;
            const sw = R.filter((r) => r.shipped.wrong).length;
            const lc = R.filter((r) => r.lever_.kept).length;
            const lw = R.filter((r) => r.lever_.wrong).length;
            // The rows' counts against the mode's own tally, fatally.
            const age = R[0].age;
            const t = tally.cells.find((x) => x.set === set && x.lever === lever && x.age === age);
            if (!t || t.states !== R.length || t.confirmed !== lc || t.wrong !== lw) fail(`wrong ${set} ${lever}: rows disagree with the mode's tally`);
            const reading = lw > sw ? "**more wrong: not proposed**" : elig.length < VOID_WRONG ? `void (${elig.length} eligible)` : "no more wrong";
            console.log(`| ${set} | ${lever} | ${R.length} | ${elig.length} | ${sc} / ${sw} | ${lc} / ${lw} | ${reading} |`);
        }
    console.log("");
}

// --- rates ------------------------------------------------------------------------------------------

const strip = (fr) => {
    const { timings, trackerTimings, stages, ...rest } = fr;
    return JSON.stringify(rest);
};
function clipPts(file) {
    const json = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "json", join(ROOT, "examples/videos", file)], { maxBuffer: 64 << 20 }).toString());
    return json.frames.map((x) => Number(x.pts_time));
}
const RATE_FILES = { fast: "pinball-fast.mp4", table: "pinball-bench-table.mp4", wall: "pinball-bench.mp4" };
function ratesMode(runsDir, trial) {
    console.log("## The descriptive lock rate, per seed (decides nothing)\n");
    console.log("`summarizeRun(frames, { clipDurationS }).trackShare` over the run's two loops (#273's metric's definition, imported), seeds 1–8: the shipped arm's mean (s; 95% interval; range), and each lever's d = lever − shipped per seed, d̄ [95% interval]. V from #273's runner (`--levers none,V`), F0, Fs and Ffb from the F runs; the F runs' none arm is checked equal to the runner's, frame for frame.\n");
    console.log("| clip | schedule | shipped lock rate | V d̄ [interval] | F0 d̄ | Fs d̄ | Ffb d̄ |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["fast", "table", "wall"]) {
        const D = loopPeriod(clipPts(RATE_FILES[clip]));
        for (const sched of SCHEDULES) {
            const read = (prefix, lever, s) => {
                const p = join(runsDir, `${prefix}-${clip}-${lever}-s${s}-${sched}.json`);
                if (!existsSync(p)) fail(`${p} missing`);
                const doc = readJson(p);
                if (prefix === "frun" && !trial && (doc.trial || doc.clean !== true)) fail(`${p}: a trial or an uncommitted tree`);
                return doc;
            };
            const base = SEEDS.map((s) => read("run", "none", s));
            const fNone = SEEDS.map((s) => read("frun", "none", s));
            base.forEach((b, i) => {
                if (b.frames.length !== fNone[i].frames.length || b.frames.some((x, j) => strip(x) !== strip(fNone[i].frames[j]))) fail(`${clip} ${sched} seed ${i + 1}: the F runs' none arm differs from the runner's`);
            });
            const rate = (doc) => summarizeRun(doc.frames, { clipDurationS: D }).trackShare;
            const b = base.map(rate);
            const sp = spread(b, 4);
            const dOf = (docs) => {
                const q = spread(docs.map((d, i) => rate(d) - b[i]), 4);
                return `${f(q.m, 4)} [${f(q.lo, 4)}, ${f(q.hi, 4)}]`;
            };
            const V = dOf(SEEDS.map((s) => read("run", "V", s)));
            const F = ["F0", "Fs", "Ffb"].map((l) => dOf(SEEDS.map((s) => read("frun", l, s))));
            console.log(`| ${clip} | ${sched}${clip === "fast" && sched !== "every" ? " (modelled)" : ""} | ${sp.text} | ${V} | ${F.join(" | ")} |`);
        }
    }
    console.log("");
}

// --- m9 ---------------------------------------------------------------------------------------------

function m9Mode(toolsDir, trial) {
    const M = readJsonl(join(toolsDir, "m9", "m9.jsonl"));
    checkHead(M.head, "m9", trial);
    const states = M.rows.filter((r) => r.kind === "state");
    const levers = M.rows.filter((r) => r.kind === "lever");
    console.log(`## M9's recorded device states, as information (reproduction threshold ${REPRO_THRESHOLD} px; enters no stop condition)\n`);
    console.log("| clip | age-1 states | reproduced (kept / lost) | not reproduced | across a wrap |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"]) {
        const S = states.filter((r) => r.clip === clip && r.age === 1);
        const rep = S.filter((r) => r.reproduced);
        console.log(`| ${clip} | ${S.length} | ${rep.length} (${rep.filter((r) => r.device.kept).length} / ${rep.filter((r) => !r.device.kept).length}) | ${S.length - rep.length} | ${S.filter((r) => r.acrossWrap).length} |`);
    }
    console.log("\nLever rows on the reproduced age-1 states (events, repeats left out; rows across a wrap counted apart):\n");
    console.log("| clip | lever | events | across a wrap | lever kept, desktop's shipped step lost | shipped kept, lever lost | no verdict |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const clip of ["table", "wall"])
        for (const lever of ["F0", "Fs", "Ffb"]) {
            const L = levers.filter((r) => r.clip === clip && r.lever === lever && !r.repeats);
            const inWrap = L.filter((r) => r.acrossWrap);
            const C = L.filter((r) => !r.acrossWrap);
            console.log(`| ${clip} | ${lever} | ${L.length} | ${inWrap.length} | ${C.filter((r) => r.discordant === "lever-kept").length} | ${C.filter((r) => r.discordant === "shipped-kept").length} | ${C.filter((r) => r.noVerdict).length} |`);
        }
    console.log("");
}

// --- self-test --------------------------------------------------------------------------------------

async function selfTest() {
    await loadShared();
    const fails = [];
    const T = (n, ok) => ok || fails.push(n);
    const ref = (distance, cd = null) => ({ distance, reason: distance === null ? "reference frame touches-border" : null, beyondMargin: distance === null ? null : distance > GROSS_MARGIN, cornerDistances: cd });
    const out = (kept, distance = 2, cd = [2, 2, 2, 2]) => ({ kept, reference: kept ? ref(distance, distance === null ? null : cd) : { distance: null, reason: "the arm refused the step", beyondMargin: null } });
    const deep = (direction, outcome, { paired = 2, steps = [2, 2], pairedCd, stepCd } = {}) => ({
        event: "e",
        direction,
        outcome,
        paired: { lever_: out(direction === "lever-kept", paired, pairedCd), shipped: out(direction === "shipped-kept", paired, pairedCd) },
        steps: steps.map((d) => out(true, d, stepCd)),
    });
    // classify: each class where it must fire, and not where it must not.
    T("a carry lasting N within the margin is a win", classify(deep("lever-kept", "lasted"), GROSS_MARGIN) === "win");
    T("a carry lost before N is a tie", classify(deep("shipped-kept", "lost"), GROSS_MARGIN) === "tie");
    T("a carry censored at a loop's end is censored", classify(deep("lever-kept", "censored"), GROSS_MARGIN) === "censored");
    T("a carry with a kept step beyond the margin is wrong, whatever its outcome", classify(deep("lever-kept", "lasted", { steps: [2, 10.5] }), GROSS_MARGIN) === "wrong");
    T("a paired step beyond the margin makes the event wrong", classify(deep("shipped-kept", "lost", { paired: 12 }), GROSS_MARGIN) === "wrong");
    T("a step exactly at the margin is not beyond it", classify(deep("lever-kept", "lasted", { steps: [10, 10] }), GROSS_MARGIN) === "win");
    T("a step on a rejected reference frame is never beyond", classify(deep("lever-kept", "lasted", { steps: [null, 2] }), GROSS_MARGIN) === "win");
    T("the arm that refused is not read for wrong", classify({ ...deep("lever-kept", "lasted"), paired: { lever_: out(true, 2), shipped: out(false) } }, GROSS_MARGIN) === "win");
    let threw = false;
    try {
        classify({ ...deep("lever-kept", "lasted", { steps: [11] }), steps: [{ kept: true, reference: { distance: 11, beyondMargin: false, cornerDistances: [11, 11, 11, 11] } }] }, GROSS_MARGIN);
    } catch {
        threw = true;
    }
    T("a beyondMargin flag that disagrees with the distance is refused", threw);
    // The three-corner reading: BL alone over the margin is not wrong there; all four over is.
    const blOnly = deep("lever-kept", "lasted", { steps: [11], stepCd: [1, 1, 1, 41] });
    T("BL alone beyond: wrong on the four-corner reading", classify(blOnly, GROSS_MARGIN, "four") === "wrong");
    T("BL alone beyond: a win on the three-corner reading", classify(blOnly, GROSS_MARGIN, "three") === "win");
    T("three corners beyond: wrong on the three-corner reading", classify(deep("lever-kept", "lasted", { steps: [11], stepCd: [11, 11, 11, 11] }), GROSS_MARGIN, "three") === "wrong");
    // canRespond.
    T("Fs with a = b cannot respond", !canRespond({ lever: "Fs", eligible: true, a: 1, b: 1, noVerdict: false }));
    T("Fs with a ≠ b can respond", canRespond({ lever: "Fs", eligible: true, a: 4, b: 3, noVerdict: false }));
    T("Fs with no verdict cannot respond", !canRespond({ lever: "Fs", eligible: false, a: 4, b: 3, noVerdict: true }));
    T("V without a chain cannot respond; with one it can", !canRespond({ lever: "V", eligible: false }) && canRespond({ lever: "V", eligible: true }));
    // spanWrap: the detection in the previous loop counts, though the hop from the record before does not cross.
    const fr = (ts) => ts.map((t) => ({ mediaTimeSeconds: t }));
    const lp = loopsOf(fr([9.8, 9.9, 0.0, 0.1, 0.2]));
    T("loopsOf counts a loop where the time steps back", lp.join() === "0,0,1,1,1");
    T("a span from the previous loop crosses a wrap, though the last hop does not", spanWrap(lp, 3) === true && lp[2] === lp[3]);
    T("a span within one loop does not cross", spanWrap(lp, 4) === false);
    // cellReading: void on events and on wins; moves; ties, wrong and censored excluded.
    const ev = (arm, cls, clipFrame = 0) => ({ arm, cls, clipFrame });
    T("5 events, all lever wins: void on events", cellReading([1, 2, 3, 4, 5].map(() => ev("lever", "win"))).voidBy === "events");
    const six = [1, 2, 3, 4, 5, 6].map((i) => ev("lever", "win", i));
    T("6 events, all lever wins: moves (p 0.031)", cellReading(six).moves === true && Math.abs(cellReading(six).p - 2 / 64) < 1e-12);
    T("8 events, 5 wins: void on wins", cellReading([...[1, 2, 3, 4, 5].map((i) => ev("lever", "win", i)), ev("lever", "tie"), ev("shipped", "tie"), ev("shipped", "wrong")]).voidBy === "wins");
    T("ties, wrong and censored do not count as wins", (() => {
        const r = cellReading([...six, ev("shipped", "tie"), ev("shipped", "wrong"), ev("shipped", "censored")]);
        return r.leverWins === 6 && r.shippedWins === 0 && r.ties[1] === 1 && r.wrong[1] === 1 && r.censored[1] === 1;
    })());
    T("censored as wins counts censored carries", cellReading([...six, ev("shipped", "censored")], { censoredAsWin: true }).shippedWins === 1);
    T("balanced wins do not move", cellReading([...six, ...[1, 2, 3, 4, 5, 6].map((i) => ev("shipped", "win", i))]).moves === false);
    T("shipped wins above the lever's move down", cellReading([1, 2, 3, 4, 5, 6, 7].map((i) => ev("shipped", "win", i))).movesDown === true);
    // collapsedReading: eight events on one clip frame are one frame.
    T("eight lever wins on one clip frame collapse to one frame", collapsedReading([1, 2, 3, 4, 5, 6, 7, 8].map(() => ev("lever", "win", 42))).leverFrames === 1);
    T("the collapse does not move on one frame", collapsedReading([1, 2, 3, 4, 5, 6, 7, 8].map(() => ev("lever", "win", 42))).moves === false);
    T("the collapse moves on six distinct frames", collapsedReading(six).moves === true);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? null : process.argv[i + 1];
};
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [mode] = process.argv.slice(2);
    const trial = process.argv.includes("--trial");
    if (mode === "--self-test") await selfTest();
    else {
        await loadShared();
        if (mode === "margin") marginMode();
        else if (mode === "cells") cellsMode(arg("--tools") ?? fail("cells needs --tools"), arg("--runs") ?? fail("cells needs --runs"), trial);
        else if (mode === "wrong") wrongMode(arg("--tools") ?? fail("wrong needs --tools"), trial);
        else if (mode === "rates") ratesMode(arg("--runs") ?? fail("rates needs --runs"), trial);
        else if (mode === "m9") m9Mode(arg("--tools") ?? fail("m9 needs --tools"), trial);
        else fail("mode: margin | cells | wrong | rates | m9 | --self-test");
    }
}
