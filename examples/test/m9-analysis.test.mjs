/*
 *  m9-analysis.test.mjs
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
 * M9's analysis script, docs/benchmarks/2026-11-11-243-analysis.mjs (#243): every
 * check exercised both ways on constructed exports (the step protocol, "Every check
 * is exercised both ways"), route (b)'s null-corners frame where its two ways agree
 * and where they do not, and the block rules at their edges. The script lives in
 * docs/, which no test configuration reads, so its tests live here, where
 * `npm test` runs them.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    FatalCheck,
    THRESHOLD_DEG,
    analyseBlock,
    both,
    blockOrderCheck,
    blockReading,
    checksOnly,
    deriveRun,
    intervalOf,
    missingFields,
    outcomeOf,
    p6,
    p7,
    runReading,
    switchesOf,
    thermalReading,
    tiltBands,
} from "../../docs/benchmarks/2026-11-11-243-analysis.mjs";
import { K, buildExport, finish } from "./m9-fixtures.mjs";

const SCRIPT = fileURLToPath(
    new URL("../../docs/benchmarks/2026-11-11-243-analysis.mjs", import.meta.url),
);

const fatalOf = (f) => {
    try {
        f();
    } catch (err) {
        if (err instanceof FatalCheck) return err.message;
        throw err;
    }
    return null;
};
const below = (f) => f.tilt !== null && f.tilt < THRESHOLD_DEG;
const whole = () => true;

describe("the export's fields, and a filtered export", () => {
    it("passes an unfiltered export with every field an arm needs", () => {
        expect(missingFields(buildExport())).toEqual([]);
    });
    it("refuses an export without processingResolution, and a filtered one", () => {
        const e = buildExport();
        delete e.processingResolution;
        expect(fatalOf(() => deriveRun(e))).toMatch(/processingResolution/);
        const f = buildExport();
        f.tracker.options.poseFilter = { mode: "one-euro" };
        expect(fatalOf(() => deriveRun(f))).toMatch(/carries no IPPE arm/);
    });
});

describe("V11's fatal checks, each both ways", () => {
    it("K: passes intrinsics(processingResolution), refuses another K", () => {
        expect(fatalOf(() => deriveRun(buildExport()))).toBeNull();
        const wrong = Float64Array.from(K);
        wrong[0] += 1e-9;
        expect(fatalOf(() => deriveRun(buildExport(), "e", { K: wrong }))).toMatch(
            /V11, K: K\[0\]/,
        );
    });
    it("every H finite on an ok frame: refuses one that is not", () => {
        const e = buildExport();
        e.frames[40].H[4] = null;
        expect(fatalOf(() => deriveRun(finish(e)))).toMatch(/V11, frame 40 .* not finite/);
    });
    it("runSummary.poseJitterPx bit for bit: refuses a value one ulp away", () => {
        const e = buildExport();
        expect(fatalOf(() => deriveRun(e))).toBeNull();
        e.runSummary.poseJitterPx = e.runSummary.poseJitterPx * (1 + Number.EPSILON);
        expect(fatalOf(() => deriveRun(e))).toMatch(/poseJitterPx recomputed/);
    });
    it("route (b)'s reprojection: refuses poseCorners that no pose reprojects within 1e-9 px", () => {
        const e = buildExport();
        e.frames[50].poseCorners[2][0] += 1e-6;
        const why = fatalOf(() => deriveRun(finish(e)));
        expect(why).toMatch(/route \(b\): frame 50 .* reprojects/);
    });
    it("CF's good: a frame whose closed form is not good is named, not fatal", () => {
        const good = deriveRun(buildExport());
        expect(good.cfNotGood).toEqual([]);
        const e = buildExport({
            edit: (r, k) => (k === 45 ? { ...r, H: [0, 0, 1, 0, 0, 1, 0, 0, 1] } : r),
        });
        const run = deriveRun(e);
        expect(run.cfNotGood.map((f) => f.k)).toEqual([45]);
        // The guard keeps the selection there, and CF has no corners.
        expect(run.frames[45].arms.CF).toBeNull();
        expect(run.frames[45].arms.GUARD).toEqual(e.frames[45].poseCorners);
    });
    it("the loop-wrap rule: refuses a step back that is not a wrap", () => {
        const e = buildExport();
        expect(fatalOf(() => deriveRun(e))).toBeNull();
        // Not through finish(): the frozen summarizeRun refuses the same step back first.
        e.frames[70].mediaTimeSeconds = 1.2;
        expect(fatalOf(() => deriveRun(e))).toMatch(/loop-wrap rule refuses/);
    });
});

describe("--checks-only", () => {
    it("prints the checks and no pose figure, and reports a null-corners frame without stopping", () => {
        const e = buildExport({ edit: (r, k) => (k === 75 ? { ...r, poseCorners: null } : r) });
        const lines = checksOnly([{ name: "x.json", e }]).join("\n");
        expect(lines).toMatch(/ok TRACK frames with null poseCorners: 1/);
        expect(lines).toMatch(/frame 75, media 1\.000000 s, loop 2, counted/);
        expect(lines).not.toMatch(/jitter[^ ]* [0-9]|distance [0-9]|tilt [0-9]|switches|below 10/i);
    });
    it("stops on a fatal check", () => {
        const e = buildExport();
        e.runSummary.poseJitterPx += 1;
        expect(fatalOf(() => checksOnly([{ name: "x.json", e }]))).toMatch(/poseJitterPx/);
    });
});

describe("route (b)'s null-corners frame, both ways", () => {
    // A null-corners frame at media 1.0 s of loop 2, where the pose steps by 30 target units.
    const nullAt = 75;
    const stepped = (stepFrom) =>
        buildExport({
            sigmaSel: 0.0005,
            shift: (k) => (k >= stepFrom ? [30, 0, 0] : [0, 0, 0]),
            edit: (r, k) => (k === nullAt ? { ...r, poseCorners: null } : r),
        });
    it("counts and names the frame, warm-up or counted, never fatal", () => {
        const run = deriveRun(stepped(10_000));
        expect(run.nullCorners.map((f) => [f.k, f.counted])).toEqual([[nullAt, true]]);
        expect(run.ways).toEqual(["i", "ii"]);
        const warm = deriveRun(
            buildExport({ edit: (r, k) => (k === 12 ? { ...r, poseCorners: null } : r) }),
        );
        expect(warm.nullCorners.map((f) => [f.k, f.counted])).toEqual([[12, false]]);
    });
    it("frames before the first such frame read the same both ways", () => {
        const run = deriveRun(stepped(nullAt));
        for (const f of run.frames.slice(0, nullAt))
            expect(f.arms.FILTER_i).toEqual(f.arms.FILTER_ii);
    });
    it("agree: no step at the frame, both ways give d the same sign", () => {
        const run = deriveRun(stepped(10_000));
        const a = runReading(
            {
                ...run,
                counted: run.counted.map((f) => ({
                    ...f,
                    arms: { ...f.arms, FILTER: f.arms.FILTER_i },
                })),
            },
            "IPPE",
            "FILTER",
            whole,
        ).d;
        const b = runReading(
            {
                ...run,
                counted: run.counted.map((f) => ({
                    ...f,
                    arms: { ...f.arms, FILTER: f.arms.FILTER_ii },
                })),
            },
            "IPPE",
            "FILTER",
            whole,
        ).d;
        expect(Math.sign(a)).toBe(-1);
        expect(Math.sign(b)).toBe(-1);
    });
    it("disagree: a step at the frame, the reset reads below 0 and the carried state above", () => {
        const run = deriveRun(stepped(nullAt));
        const a = runReading(
            {
                ...run,
                counted: run.counted.map((f) => ({
                    ...f,
                    arms: { ...f.arms, FILTER: f.arms.FILTER_i },
                })),
            },
            "IPPE",
            "FILTER",
            whole,
        ).d;
        const b = runReading(
            {
                ...run,
                counted: run.counted.map((f) => ({
                    ...f,
                    arms: { ...f.arms, FILTER: f.arms.FILTER_ii },
                })),
            },
            "IPPE",
            "FILTER",
            whole,
        ).d;
        expect(Math.sign(a)).toBe(-1);
        expect(Math.sign(b)).toBe(1);
    });
});

describe("the outcome rules at their edges", () => {
    const iv = (ds) => intervalOf(ds);
    const neg7 = [-1, -1.1, -0.9, -1.2, -0.8, -1, -1.05, 0.3];
    const neg6 = [-1, -1.1, -0.9, -1.2, -0.8, -1, 0.3, 0.2];
    it("7 of 8 with the interval below 0 holds; 6 of 8 is not shown", () => {
        expect(iv(neg7).hi).toBeLessThan(0);
        expect(outcomeOf(iv(neg7), iv(neg7), -1)).toBe("held");
        expect(iv(neg6).hi).toBeLessThan(0);
        expect(outcomeOf(iv(neg6), iv(neg6), -1)).toBe("not shown");
    });
    it("refuted is the same on the other side", () => {
        const pos = neg7.map((d) => -d);
        expect(outcomeOf(iv(pos), iv(pos), -1)).toBe("refuted");
    });
    it("held with the media time and not without it is not shown", () => {
        expect(outcomeOf(iv(neg7), iv(neg6), -1)).toBe("not shown");
    });
    it("a run counting toward neither: 7 standing of 8 holds, 6 standing does not", () => {
        const ds = [-1, -1.1, -0.9, -1.2, -0.8, -1, -1.05, -0.95];
        const oneOut = [true, true, true, true, true, true, true, false];
        const twoOut = [true, true, true, true, true, true, false, false];
        expect(outcomeOf(iv(ds), iv(ds), -1, oneOut, oneOut)).toBe("held");
        expect(outcomeOf(iv(ds), iv(ds), -1, twoOut, twoOut)).toBe("not shown");
    });
    it("a void reading, a run with no d, is not shown", () => {
        const ds = [...neg7.slice(0, 7), null];
        expect(iv(ds).void).toBe(true);
        expect(outcomeOf(iv(ds), iv(ds), -1)).toBe("not shown");
    });
});

describe("the block rules on constructed exports", () => {
    // CF − IPPE is negative where the selected pose scatters more than H's pose, and positive where it scatters less.
    const run = (seed, sign) =>
        deriveRun(
            buildExport(sign < 0 ? { seed } : { seed, sigmaH: 0.004, sigmaSel: 0.0005 }),
            `run ${seed}`,
        );
    it("7 of 8 negative: P1 held; 6 of 8: not shown", () => {
        const seven = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => run(s, s === 8 ? 1 : -1));
        const R7 = blockReading(seven, "IPPE", "CF", below, -1);
        expect(R7.per.filter((p) => p.d < 0).length).toBe(7);
        expect(R7.outcome).toBe("held");
        const six = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => run(s, s >= 7 ? 1 : -1));
        const R6 = blockReading(six, "IPPE", "CF", below, -1);
        expect(R6.per.filter((p) => p.d < 0).length).toBe(6);
        expect(R6.outcome).toBe("not shown");
    });
    it("P7 with one run whose two ways disagree: it counts toward neither", () => {
        const clean = (s) => deriveRun(buildExport({ seed: s }), `run ${s}`);
        const nullAt = 75;
        const split = deriveRun(
            buildExport({
                seed: 8,
                sigmaSel: 0.0005,
                shift: (k) => (k >= nullAt ? [30, 0, 0] : [0, 0, 0]),
                edit: (r, k) => (k === nullAt ? { ...r, poseCorners: null } : r),
            }),
            "run 8",
        );
        const P = p7([1, 2, 3, 4, 5, 6, 7].map(clean).concat([split]));
        expect(P.ways).toEqual(["i", "ii"]);
        const w = P.perWay.ii.whole;
        expect(w.stands.with.filter(Boolean).length).toBe(7);
        expect(Math.sign(P.perWay.i.whole.per[7].d)).not.toBe(Math.sign(w.per[7].d));
        // 7 standing of 8: both ways read held, so P7 is held.
        expect(P.wayOutcomes).toEqual({ i: "held", ii: "held" });
        expect(P.outcome).toBe("held");
    });
    const splitRun = (seed, step) =>
        deriveRun(
            buildExport({
                seed,
                sigmaSel: 0.0005,
                shift: (k) => (k >= 75 ? [step, 0, 0] : [0, 0, 0]),
                edit: (r, k) => (k === 75 ? { ...r, poseCorners: null } : r),
            }),
            `run ${seed}`,
        );
    const cleanRun = (s) => deriveRun(buildExport({ seed: s }), `run ${s}`);
    it("P7 with two runs counting toward neither: 6 standing of 8, not shown", () => {
        const P = p7([1, 2, 3, 4, 5, 6].map(cleanRun).concat([splitRun(7, 30), splitRun(8, 30)]));
        expect(P.perWay.i.whole.stands.with.filter(Boolean).length).toBe(6);
        expect(P.outcome).toBe("not shown");
    });
    it("P7 where the two ways' outcomes differ: not shown", () => {
        // Quieter clean runs: the carried state's d on the split run lifts way (ii)'s interval across 0, and way (i)'s stays below.
        const quiet = (s) => deriveRun(buildExport({ seed: s, sigmaSel: 0.0006 }), `run ${s}`);
        const P = p7([1, 2, 3, 4, 5, 6, 7].map(quiet).concat([splitRun(8, 30)]));
        expect(P.perWay.ii.whole.withIv.hi).toBeGreaterThan(0);
        expect(P.wayOutcomes.i).toBe("held");
        expect(P.wayOutcomes.ii).toBe("not shown");
        expect(P.outcome).toBe("not shown");
    });
    it("P7 where a run's null-corners frame leaves both ways agreeing: held both ways", () => {
        const P = p7([1, 2, 3, 4, 5, 6, 7].map(cleanRun).concat([splitRun(8, 0)]));
        expect(P.ways).toEqual(["i", "ii"]);
        expect(P.perWay.i.whole.stands.with.every(Boolean)).toBe(true);
        expect(P.outcome).toBe("held");
    });
    it("P7's reading without the wraps' first second leaves out [0, 1) s of every loop", () => {
        const P = p7([1, 2, 3, 4, 5, 6, 7, 8].map(cleanRun));
        const all = P.perWay.one.whole.per[0].frames;
        const after = P.perWay.one["without the wraps' first second"].per[0].frames;
        expect(all).toBe(120);
        expect(after).toBe(60);
        expect(P.wrapsNote.one).toBe(false);
    });
    it("the most influential media time: a planted spike, and ties to the earliest", () => {
        // Planted on the derived IPPE arm, not on the export: corners moved off a rigid pose would fail route (b) first.
        const spiked = [1, 2, 3, 4, 5, 6, 7, 8].map(cleanRun);
        for (const r of spiked)
            for (const f of r.counted)
                if (f.k % 30 === 22) f.arms.IPPE = f.arms.IPPE.map(([x, y]) => [x + 3, y]);
        const R = blockReading(spiked, "IPPE", "CF", whole, -1);
        expect(R.best.key).toBe(Math.round((22 / 15) * 1e6));
        expect(R.at.occurrences).toBe(32);
        // Identical runs, a reading no media time moves: the earliest key is taken.
        const same = [1, 1, 1, 1, 1, 1, 1, 1].map((s) => cleanRun(s));
        const S = blockReading(same, "IPPE", "IPPE", whole, -1);
        expect(S.best.move).toBe(0);
        expect(S.best.key).toBe(Math.min(...same[0].counted.map((f) => f.key)));
    });
    it("a block with no null-corners frame has one way", () => {
        const P = p7(
            [1, 2, 3, 4, 5, 6, 7, 8].map((s) => deriveRun(buildExport({ seed: s }), `run ${s}`)),
        );
        expect(P.ways).toEqual(["one"]);
        expect(P.perWay.one.whole.outcome).toBe("held");
    });
});

describe("P6, the switches", () => {
    // Cross-like: the tilt rises through 10° once a loop, at 1.4 s.
    const crossing = (at) => (media) => (media < at ? 8 : 12);
    const block = (tilt) =>
        [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
            deriveRun(buildExport({ seed: s, tilt, clip: "pinball-tilt-cross.mp4" }), `run ${s}`),
        );
    it("one switch a loop inside the window is held; outside it, not shown", () => {
        // Constructed loops are 2 s, so P6's window [7.797, 8.831] s is not reachable: a switch at 1.4 s reads not shown.
        const P = p6(block(crossing(1.4)));
        expect(P.perRun.every((r) => r.loops.every((l) => l.switches.length === 1))).toBe(true);
        expect(P.perRun[0].atWrap.length).toBe(3);
        expect(P.outcome).toBe("not shown");
    });
    it("one switch a loop at 8.4 s, inside [7.797, 8.831] s, on a 10 s clip: held", () => {
        const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
            deriveRun(
                buildExport({
                    seed: s,
                    seconds: 10,
                    tilt: crossing(8.4),
                    clip: "pinball-tilt-cross.mp4",
                }),
                `run ${s}`,
            ),
        );
        const P = p6(runs);
        expect(P.named).toEqual([]);
        expect(P.outcome).toBe("held");
    });
    it("three switches in a loop in two runs is chatter: refuted", () => {
        const chatter = (media) => (media < 0.6 ? 8 : media < 0.8 ? 12 : media < 1.0 ? 8 : 12);
        const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
            deriveRun(
                buildExport({
                    seed: s,
                    tilt: s <= 2 ? chatter : crossing(1.4),
                    clip: "pinball-tilt-cross.mp4",
                }),
                `run ${s}`,
            ),
        );
        const P = p6(runs);
        expect(P.chattering).toBe(2);
        expect(P.outcome).toBe("refuted");
        const one = [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
            deriveRun(
                buildExport({
                    seed: s,
                    tilt: s === 1 ? chatter : crossing(1.4),
                    clip: "pinball-tilt-cross.mp4",
                }),
                `run ${s}`,
            ),
        );
        expect(p6(one).outcome).toBe("not shown");
    });
});

describe("P6's pairs: an unusable frame is never bridged", () => {
    // Tilt 8° up to frame 44 of the run, 12° from 46 on, and frame 45, at 12° too, in between.
    const tilt = (media, k) => (k < 45 ? 8 : 12);
    it("an unusable frame between tilts on opposite sides of 10° counts no switch; without it, one", () => {
        const plain = deriveRun(buildExport({ tilt, clip: "pinball-tilt-cross.mp4" }));
        const a = switchesOf(plain);
        const onLoop1 = (sw) => sw.switches.filter((s) => s.loop === 1 && !s.atWrap);
        expect(onLoop1(a).length).toBe(1);
        expect(a.skippedPairs).toBe(0);
        // The same export, frame 45 with a degenerate H: no tilt, no CF corners.
        const gap = deriveRun(
            buildExport({
                tilt,
                clip: "pinball-tilt-cross.mp4",
                edit: (r, k) => (k === 45 ? { ...r, H: [0, 0, 1, 0, 0, 1, 0, 0, 1] } : r),
            }),
        );
        const b = switchesOf(gap);
        expect(onLoop1(b).length).toBe(0);
        expect(b.skippedPairs).toBe(2);
    });
});

describe("the tilt bands (the addendum's entry 1)", () => {
    it("reads the jitter difference below 10° only, and the corner distance at 10° and above", () => {
        const run = deriveRun(
            buildExport({ tilt: (media) => (media < 1 ? 4 : 12), clip: "pinball-tilt-cross.mp4" }),
        );
        const bands = tiltBands(run);
        const at = (name) => bands.find((b) => b.band === name);
        expect(at("3–5").frames).toBeGreaterThan(0);
        expect(typeof at("3–5").d).toBe("number");
        expect(at("3–5").distance).toBeUndefined();
        expect(at("10–15").d).toBeUndefined();
        expect(at("10–15").distance.distancePx).toBeGreaterThan(0);
        expect(at("10–15").distance.frames).toBe(at("10–15").frames);
    });
});

describe("--block, end to end", () => {
    it("reads P1 and P7 on a static block, and refuses a block of seven", () => {
        const named = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
            name: `static-${s}.json`,
            e: buildExport({ seed: s, order: s }),
        }));
        const r = analyseBlock(named);
        expect(r.criteria.P1.outcome).toBe("held");
        expect(r.criteria.P7.outcome).toBe("held");
        expect(fatalOf(() => analyseBlock(named.slice(0, 7)))).toMatch(/8 exports/);
    });
    it("stops before any figure when one export fails V11", () => {
        const named = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
            name: `static-${s}.json`,
            e: buildExport({ seed: s, order: s }),
        }));
        named[7].e.runSummary.poseJitterPx += 1e-9;
        expect(fatalOf(() => analyseBlock(named))).toMatch(/static-8\.json: V11/);
    });
    const block = () =>
        [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
            name: `static-${s}.json`,
            e: buildExport({ seed: s, order: s }),
        }));
    it("the clip's eight registered runs pass the block check", () => {
        expect(fatalOf(() => blockOrderCheck(block()))).toBeNull();
    });
    it("refuses one export supplied eight times", () => {
        const one = buildExport({ seed: 1, order: 1 });
        const named = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ name: `copy-${s}.json`, e: one }));
        const why = fatalOf(() => analyseBlock(named));
        expect(why).toMatch(/run orders repeated: 1 \(copy-1\.json, copy-2\.json/);
        expect(why).toMatch(/run orders missing: 2, 3, 4, 5, 6, 7, 8/);
    });
    it("refuses a missing order, and an order from another clip's block", () => {
        const missing = block();
        missing[3].e.run.order = 5;
        expect(fatalOf(() => analyseBlock(missing))).toMatch(/repeated: 5 .*missing: 4/);
        const foreign = block();
        foreign[7].e.run.order = 9;
        expect(fatalOf(() => analyseBlock(foreign))).toMatch(
            /not of pinball-static\.mp4's block \(1–8\): 9 \(static-8\.json\).*missing: 8/,
        );
        const none = block();
        none[0].e.run = null;
        expect(fatalOf(() => analyseBlock(none))).toMatch(/no run\.order in static-1\.json/);
    });
    it("refuses a block of two clips", () => {
        const mixed = block();
        mixed[0].e.bundledClip = "pinball-bench.mp4";
        expect(fatalOf(() => analyseBlock(mixed))).toMatch(/a block is one clip/);
    });
});

describe("the readings' reporting", () => {
    it("P2 and P3: held only if held on the selection and its TRACK frames, refuted only if refuted on both", () => {
        expect(both("held", "held")).toBe("held");
        expect(both("held", "not shown")).toBe("not shown");
        expect(both("refuted", "refuted")).toBe("refuted");
        expect(both("held", "refuted")).toBe("not shown");
    });
    it("names a TRACK frame on 8 or 9 inliers that a reading carries, and none otherwise", () => {
        const plain = deriveRun(buildExport());
        expect(runReading(plain, "IPPE", "CF", whole).lowInliers).toEqual([]);
        const low = deriveRun(
            buildExport({ edit: (r, k) => (k === 50 ? { ...r, numInliers: 9 } : r) }),
        );
        expect(runReading(low, "IPPE", "CF", whole).lowInliers.map((f) => f.inliers)).toEqual([9]);
    });
    it("the wall's reading is descriptive: no outcome is read", () => {
        const named = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
            name: `wall-${s}.json`,
            e: buildExport({ seed: s, order: 24 + s, clip: "pinball-bench.mp4" }),
        }));
        const r = analyseBlock(named);
        expect(r.criteria).toEqual({});
        expect(Object.keys(r.descriptive)).toEqual(["Wall"]);
        expect(r.lines.join("\n")).not.toMatch(/outcome: \*\*/);
    });
    it("each run's own filter arms in the spread table, on a block where one run has two ways", () => {
        const named = [1, 2, 3, 4, 5, 6, 7].map((s) => ({
            name: `static-${s}.json`,
            e: buildExport({ seed: s, order: s }),
        }));
        named.push({
            name: "static-8.json",
            e: buildExport({
                seed: 8,
                order: 8,
                edit: (r, k) => (k === 75 ? { ...r, poseCorners: null } : r),
            }),
        });
        const text = analyseBlock(named).lines.join("\n");
        expect(text).toMatch(/\| static-1\.json \| FILTER_one \| \d/);
        expect(text).toMatch(/\| static-8\.json \| FILTER_i \| \d/);
        expect(text).toMatch(/\| static-8\.json \| FILTER_ii \| \d/);
        expect(text).not.toMatch(/\| static-8\.json \| FILTER_one/);
        expect(text).not.toMatch(/\| n\/a \|$/m);
    });
});

describe("V9, the thermal reading", () => {
    const c = (acq, step) => ({ acquireMs: { p50: acq }, trackStepMsP50: step });
    it("finite medians give a flag, either way", () => {
        expect(thermalReading(c(30, 10), c(31, 10.2))).toMatchObject({
            available: true,
            flagged: false,
        });
        expect(thermalReading(c(30, 10), c(32, 10.2)).flagged).toBe(true);
        expect(thermalReading(c(30, 10), c(30, 10.7)).flagged).toBe(true);
    });
    it("a missing median reads unavailable, never not flagged", () => {
        const r = thermalReading(c(30, null), c(31, 10.2));
        expect(r).toMatchObject({ available: false, flagged: null });
        expect(r.line).toMatch(/^unavailable/);
        expect(r.line).not.toMatch(/Flagged/);
        expect(thermalReading(c(30, 10), c(NaN, 10)).available).toBe(false);
    });
});

describe("the command line", () => {
    const dir = mkdtempSync(join(tmpdir(), "m9-analysis-"));
    const write = (name, e) => {
        const p = join(dir, name);
        writeFileSync(p, JSON.stringify(e));
        return p;
    };
    it("--checks-only exits 0 on a passing export, 1 on a fatal check, 2 on a usage error", () => {
        const ok = write("ok.json", buildExport());
        const bad = buildExport();
        bad.runSummary.poseJitterPx += 1;
        const badPath = write("bad.json", bad);
        const r0 = spawnSync(process.execPath, [SCRIPT, "--checks-only", ok], { encoding: "utf8" });
        expect(r0.status).toBe(0);
        expect(r0.stdout).toMatch(/route \(b\), ok TRACK frames with null poseCorners: 0/);
        const r1 = spawnSync(process.execPath, [SCRIPT, "--checks-only", ok, badPath], {
            encoding: "utf8",
        });
        expect(r1.status).toBe(1);
        expect(r1.stderr).toMatch(/fatal: bad\.json: V11/);
        expect(r1.stdout).toBe("");
        expect(spawnSync(process.execPath, [SCRIPT, ok], { encoding: "utf8" }).status).toBe(2);
    });
});
