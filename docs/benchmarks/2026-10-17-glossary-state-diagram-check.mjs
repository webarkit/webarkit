/*
 *  2026-10-17-glossary-state-diagram-check.mjs
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
 * The check behind the glossary's state diagram (`glossary.md`, "The state
 * diagram: sync arm and worker arm"). Every count that diagram's citation
 * table states about the committed exports is a constant in `EXPECTED`
 * below; this file recomputes each from the exports and exits non-zero,
 * naming every count that differs, before printing any figure. It reads
 * `docs/benchmarks/*.json`, writes nothing, and imports no module of the
 * repository: the counts are of frame states, which every export carries as
 * `frames[i].state`, and no metric of the frozen module is reimplemented.
 *
 *     node docs/benchmarks/2026-10-17-glossary-state-diagram-check.mjs
 *     node docs/benchmarks/2026-10-17-glossary-state-diagram-check.mjs --self-test
 *
 * Which exports: every committed export in `mode: "tracking"` whose name
 * dates it 2026-10-14 or earlier, the day the diagram's counts were taken:
 * 45 on the synchronous path (the `detection.path` field reads `sync`, or
 * is absent, in the exports older than it, whose tracker detected on the
 * frame loop) and 12 on the worker path. Later exports are not read, so a
 * later campaign round does not move these counts; the diagram's table says
 * what they are counts of.
 *
 * The sequence rule of #143, by which a LOST frame is "never yet acquired"
 * iff no TRACK frame precedes it in the run, is read only on the exports
 * that hold their whole run (`frames.length === ticks`): the 13 synchronous
 * exports of 2026-10-01 and later, and all 12 worker exports. The 32 older
 * synchronous exports hold a window of 300 frames that may start after the
 * run acquired, so the rule cannot be read from them; they enter only the
 * counts that do not depend on it.
 *
 * Exercised both ways (`step-protocol.md`, "Every check is exercised both
 * ways"): `--self-test` runs the comparison on the exports as committed,
 * which must pass, and again with one TRACK frame of one export flipped to
 * LOST in memory, which must fail; it exits non-zero unless both hold. A
 * check that fails is fatal: nothing but the differing counts is printed.
 *
 * A known limitation, as the probe scripts': this file is covered by no
 * test and by no format check (`docs/` is outside both). What it holds is
 * the agreement between the glossary's table and the exports; a count that
 * was wrong when both were written would agree with itself.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAST_DAY = "2026-10-14";

/** The counts the glossary's table states. A difference in any one fails the check. */
const EXPECTED = {
    sync: {
        files: 45,
        frames: 20476,
        wholeRuns: 13,
        // Frame 0 of the 13 whole runs, by state: 9 DETECT (the six static
        // runs, the two table runs, the pre-flight), 4 LOST too-few-matches
        // with no trackLoss (the four wall runs of 2026-10-01).
        frame0WholeRuns: { "DETECT": 9, "LOST/too-few-matches/trackLoss=null": 4 },
        // Transitions between consecutive frames over all 45 exports.
        transitions: {
            "TRACK->TRACK": 16114,
            "DETECT->DETECT": 2085,
            "DETECT->LOST": 452,
            "LOST->DETECT": 457,
            "DETECT->TRACK": 522,
            "TRACK->DETECT": 520,
            "LOST->LOST": 279,
            "TRACK->LOST": 2,
        },
        // The same, over the 13 whole runs, split by the sequence rule:
        // "before" is a transition into a frame that precedes the run's
        // first TRACK frame; "after" one into that frame or any later one.
        wholeRunsBeforeFirstTrack: {
            "DETECT->LOST": 32,
            "LOST->LOST": 23,
            "LOST->DETECT": 36,
            "DETECT->DETECT": 114,
        },
        wholeRunsAfterFirstTrack: {
            "DETECT->TRACK": 192,
            "TRACK->TRACK": 9123,
            "TRACK->DETECT": 186,
            "DETECT->DETECT": 746,
            "DETECT->LOST": 165,
            "LOST->LOST": 81,
            "LOST->DETECT": 165,
        },
        // Reasons of the never-yet-acquired LOST frames in the 13 whole runs.
        neverAcquiredReasons: { "too-few-matches": 38, "no-consensus": 21 },
        // Frames that follow a DETECT or TRACK frame and are not TRACK, with
        // no trackLoss: the code sets a lock on every ok detection and steps
        // it on the next frame, so there must be none.
        afterLockWithoutTrackLoss: 0,
        // Frames that follow a LOST frame and carry a trackLoss: no lock was
        // held, so there must be none.
        afterLostWithTrackLoss: 0,
        // Every TRACK->LOST frame, by export and index.
        trackToLost: [
            "2026-09-26-oppo-a72-ondevice-tracking-wall.json frame 228: no-consensus, trackLoss too-few-patches",
            "2026-09-29-tab9-tuning-r2-p48-s16-table.json frame 32: no-consensus, trackLoss too-few-patches",
        ],
        // What follows a TRACK frame that is not TRACK, in the 13 whole runs.
        wholeRunsLockDeaths: { "TRACK->DETECT": 186 },
    },
    worker: {
        files: 12,
        frames: 11945,
        wholeRuns: 12,
        frame0: { "LOST/no-detection/use=none/inFlight=false/needs=true/trackLoss=null": 12 },
        detectFrames: 0,
        ignoredFrames: 0,
        trackFramesWithDetectionInFlight: 0,
        consumedFramesByPreviousState: { LOST: 1276 },
        consumedFramesByOutcome: {
            "TRACK": 161,
            "LOST(unconfirmed)": 855,
            "LOST(too-few-matches)": 167,
            "LOST(no-consensus)": 93,
        },
        consumedFramesAgo: { "1": 122, "2": 668, "3": 469, "4": 10, "5": 3, "6": 3, "7": 1 },
        consumedLatencyMsRange: [65.6, 339.6],
        beforeFirstTrack: {
            "LOST->LOST(no-detection,inFlight)": 260,
            "LOST->LOST(unconfirmed,consumed,trackLoss)": 111,
            "LOST->LOST(too-few-matches,consumed)": 32,
            "LOST->LOST(no-consensus,consumed)": 17,
        },
        afterFirstTrack: {
            "LOST->TRACK": 161,
            "TRACK->TRACK": 8833,
            "TRACK->LOST(no-detection,trackLoss)": 155,
            "LOST->LOST(no-detection,inFlight)": 1409,
            "LOST->LOST(unconfirmed,consumed,trackLoss)": 744,
            "LOST->LOST(too-few-matches,consumed)": 135,
            "LOST->LOST(no-consensus,consumed)": 76,
        },
        trackToLostTrackLoss: { "too-few-patches": 68, "poor-fit": 43, "fit-failed": 39, "too-many-outliers": 5 },
        trackToLostWithDetectionInFlight: 0,
        trackToLostNeedsDetection: 155,
        trackToLostDetectionUse: { none: 155 },
        // The first TRACK frame of each export: its index, detectedAt.framesAgo,
        // detectionLatencyMs to 0.1 ms, and the states of the frames before it.
        firstAcquisition: {
            "2026-10-01-tab9-m3-worker-static-1.json": "frame 6, framesAgo 6, 301.5 ms, before it: LOST/no-detection",
            "2026-10-01-tab9-m3-worker-static-2.json": "frame 5, framesAgo 5, 275.5 ms, before it: LOST/no-detection",
            "2026-10-01-tab9-m3-worker-table-1.json": "frame 34, framesAgo 3, 148.1 ms, before it: LOST/no-detection, LOST/unconfirmed, LOST/too-few-matches, LOST/no-consensus",
            "2026-10-01-tab9-m3-worker-table-2.json": "frame 41, framesAgo 3, 167.6 ms, before it: LOST/no-detection, LOST/unconfirmed, LOST/no-consensus, LOST/too-few-matches",
            "2026-10-01-tab9-m3-worker-wall-1.json": "frame 83, framesAgo 2, 134.6 ms, before it: LOST/no-detection, LOST/too-few-matches, LOST/no-consensus, LOST/unconfirmed",
            "2026-10-01-tab9-m3-worker-wall-2.json": "frame 79, framesAgo 2, 166.2 ms, before it: LOST/no-detection, LOST/too-few-matches, LOST/no-consensus, LOST/unconfirmed",
            "2026-10-01-tab9-m3-worker-wall-3.json": "frame 84, framesAgo 2, 152.0 ms, before it: LOST/no-detection, LOST/too-few-matches, LOST/unconfirmed, LOST/no-consensus",
            "2026-10-01-tab9-m3-worker-wall-4.json": "frame 76, framesAgo 3, 167.4 ms, before it: LOST/no-detection, LOST/too-few-matches, LOST/no-consensus, LOST/unconfirmed",
            "2026-10-14-tab9-m4-calibration-worker-static-1.json": "frame 6, framesAgo 6, 316.0 ms, before it: LOST/no-detection",
            "2026-10-14-tab9-m4-calibration-worker-static-2.json": "frame 6, framesAgo 6, 330.1 ms, before it: LOST/no-detection",
            "2026-10-14-tab9-m4-calibration-worker-static-3.json": "frame 7, framesAgo 7, 339.6 ms, before it: LOST/no-detection",
            "2026-10-14-tab9-m4-calibration-worker-static-4.json": "frame 5, framesAgo 5, 280.5 ms, before it: LOST/no-detection",
        },
        // detectionInFlight on the frames before the first TRACK frame of
        // the six static worker runs: false on frame 0, true on every later one.
        staticRunsInFlightBeforeFirstTrack: {
            "2026-10-01-tab9-m3-worker-static-1.json": "FTTTTT",
            "2026-10-01-tab9-m3-worker-static-2.json": "FTTTT",
            "2026-10-14-tab9-m4-calibration-worker-static-1.json": "FTTTTT",
            "2026-10-14-tab9-m4-calibration-worker-static-2.json": "FTTTTT",
            "2026-10-14-tab9-m4-calibration-worker-static-3.json": "FTTTTTT",
            "2026-10-14-tab9-m4-calibration-worker-static-4.json": "FTTTT",
        },
    },
};

/** The exports read: `[name, parsed]`, name order. */
function loadExports() {
    return readdirSync(HERE)
        .filter((f) => f.endsWith(".json") && f.slice(0, 10) <= LAST_DAY)
        .sort()
        .map((f) => [f, JSON.parse(readFileSync(join(HERE, f), "utf8"))])
        .filter(([, j]) => j.mode === "tracking" && Array.isArray(j.frames));
}

const inc = (o, k, n = 1) => {
    o[k] = (o[k] ?? 0) + n;
};

/** Every count of `EXPECTED`, recomputed from `exports`. */
function compute(exports) {
    const sync = {
        files: 0,
        frames: 0,
        wholeRuns: 0,
        frame0WholeRuns: {},
        transitions: {},
        wholeRunsBeforeFirstTrack: {},
        wholeRunsAfterFirstTrack: {},
        neverAcquiredReasons: {},
        afterLockWithoutTrackLoss: 0,
        afterLostWithTrackLoss: 0,
        trackToLost: [],
        wholeRunsLockDeaths: {},
    };
    const worker = {
        files: 0,
        frames: 0,
        wholeRuns: 0,
        frame0: {},
        detectFrames: 0,
        ignoredFrames: 0,
        trackFramesWithDetectionInFlight: 0,
        consumedFramesByPreviousState: {},
        consumedFramesByOutcome: {},
        consumedFramesAgo: {},
        consumedLatencyMsRange: [Infinity, -Infinity],
        beforeFirstTrack: {},
        afterFirstTrack: {},
        trackToLostTrackLoss: {},
        trackToLostWithDetectionInFlight: 0,
        trackToLostNeedsDetection: 0,
        trackToLostDetectionUse: {},
        firstAcquisition: {},
        staticRunsInFlightBeforeFirstTrack: {},
    };
    for (const [name, j] of exports) {
        const fr = j.frames;
        const whole = fr.length === j.ticks;
        const firstTrack = fr.findIndex((x) => x.state === "TRACK");
        const before = (i) => firstTrack < 0 || i < firstTrack;
        if (j.detection?.path === "worker") {
            const o = worker;
            o.files++;
            o.frames += fr.length;
            if (whole) o.wholeRuns++;
            const z = fr[0];
            inc(
                o.frame0,
                `${z.state}/${z.reason}/use=${z.detectionUse}/inFlight=${z.detectionInFlight}/needs=${z.needsDetection}/trackLoss=${z.trackLoss}`,
            );
            for (let i = 0; i < fr.length; i++) {
                const b = fr[i];
                const a = i > 0 ? fr[i - 1] : null;
                if (b.state === "DETECT") o.detectFrames++;
                if (b.detectionUse === "ignored") o.ignoredFrames++;
                if (b.state === "TRACK" && b.detectionInFlight) o.trackFramesWithDetectionInFlight++;
                if (b.detectionUse === "consumed") {
                    inc(o.consumedFramesByPreviousState, a ? a.state : "(none)");
                    inc(o.consumedFramesByOutcome, b.state === "TRACK" ? "TRACK" : `LOST(${b.reason})`);
                    inc(o.consumedFramesAgo, String(b.detectedAt?.framesAgo));
                    const r = o.consumedLatencyMsRange;
                    r[0] = Math.min(r[0], b.detectionLatencyMs);
                    r[1] = Math.max(r[1], b.detectionLatencyMs);
                }
                if (i === firstTrack) {
                    const states = [...new Set(fr.slice(0, i).map((x) => `${x.state}/${x.reason}`))];
                    o.firstAcquisition[name] =
                        `frame ${i}, framesAgo ${b.detectedAt?.framesAgo}, ` +
                        `${b.detectionLatencyMs.toFixed(1)} ms, before it: ${states.join(", ")}`;
                    if (name.includes("-static-")) {
                        o.staticRunsInFlightBeforeFirstTrack[name] = fr
                            .slice(0, i)
                            .map((x) => (x.detectionInFlight ? "T" : "F"))
                            .join("");
                    }
                }
                if (a === null) continue;
                const detail =
                    b.state === "LOST"
                        ? `(${b.reason}${b.detectionUse === "consumed" ? ",consumed" : ""}` +
                          `${b.trackLoss ? ",trackLoss" : ""}${b.detectionInFlight ? ",inFlight" : ""})`
                        : "";
                inc(before(i) ? o.beforeFirstTrack : o.afterFirstTrack, `${a.state}->${b.state}${detail}`);
                if (a.state === "TRACK" && b.state === "LOST") {
                    inc(o.trackToLostTrackLoss, b.trackLoss);
                    if (b.detectionInFlight) o.trackToLostWithDetectionInFlight++;
                    if (b.needsDetection) o.trackToLostNeedsDetection++;
                    inc(o.trackToLostDetectionUse, b.detectionUse);
                }
            }
        } else {
            const o = sync;
            o.files++;
            o.frames += fr.length;
            if (whole) {
                o.wholeRuns++;
                const z = fr[0];
                inc(
                    o.frame0WholeRuns,
                    z.state === "DETECT" ? "DETECT" : `${z.state}/${z.reason}/trackLoss=${z.trackLoss}`,
                );
                for (let i = 0; i < fr.length && before(i); i++) {
                    if (fr[i].state === "LOST") inc(o.neverAcquiredReasons, fr[i].reason);
                }
            }
            for (let i = 1; i < fr.length; i++) {
                const a = fr[i - 1];
                const b = fr[i];
                const t = `${a.state}->${b.state}`;
                inc(o.transitions, t);
                if (whole) inc(before(i) ? o.wholeRunsBeforeFirstTrack : o.wholeRunsAfterFirstTrack, t);
                if ((a.state === "DETECT" || a.state === "TRACK") && b.state !== "TRACK" && !b.trackLoss) {
                    o.afterLockWithoutTrackLoss++;
                }
                if (a.state === "LOST" && b.trackLoss) o.afterLostWithTrackLoss++;
                if (a.state === "TRACK" && b.state === "LOST") {
                    o.trackToLost.push(`${name} frame ${i}: ${b.reason}, trackLoss ${b.trackLoss}`);
                }
                if (whole && a.state === "TRACK" && b.state !== "TRACK") inc(o.wholeRunsLockDeaths, t);
            }
        }
    }
    worker.consumedLatencyMsRange = worker.consumedLatencyMsRange.map((v) => Math.round(v * 10) / 10);
    return { sync, worker };
}

/** `[path, json]` for every leaf of `o`, objects' keys sorted, arrays whole. */
function leaves(o, path = "") {
    if (o === null || typeof o !== "object" || Array.isArray(o)) return [[path, JSON.stringify(o)]];
    return Object.keys(o)
        .sort()
        .flatMap((k) => leaves(o[k], path ? `${path}.${k}` : k));
}

/** The leaves on which `actual` and `EXPECTED` differ, as lines; empty when none. */
function differences(actual) {
    const a = new Map(leaves(actual));
    const e = new Map(leaves(EXPECTED));
    const out = [];
    for (const [k, v] of e) if (a.get(k) !== v) out.push(`${k}: expected ${v}, got ${a.get(k) ?? "(absent)"}`);
    for (const [k, v] of a) if (!e.has(k)) out.push(`${k}: unexpected ${v}`);
    return out;
}

function report(actual) {
    const lines = [];
    for (const [k, v] of leaves(actual)) lines.push(`${k} = ${v}`);
    return lines.join("\n");
}

function main(argv) {
    const exports = loadExports();
    if (argv.includes("--self-test")) {
        const clean = differences(compute(exports));
        // Flip the first TRACK frame of the first synchronous whole run to LOST.
        const flipped = exports.map(([n, j]) => [n, structuredClone(j)]);
        const target = flipped.find(
            ([, j]) =>
                j.detection?.path !== "worker" && j.frames.length === j.ticks && j.frames.some((x) => x.state === "TRACK"),
        );
        const frame = target[1].frames.find((x) => x.state === "TRACK");
        frame.state = "LOST";
        frame.reason = "self-test";
        const broken = differences(compute(flipped));
        const ok = clean.length === 0 && broken.length > 0;
        console.log(
            `self-test: exports as committed ${clean.length === 0 ? "pass" : `FAIL (${clean.length} counts differ)`}; ` +
                `with one TRACK frame of ${target[0]} flipped to LOST ` +
                `${broken.length > 0 ? `the check fails on ${broken.length} counts` : "the check still passes: it cannot fail"}`,
        );
        if (!ok) for (const line of clean) console.log(`  ${line}`);
        return ok ? 0 : 1;
    }
    const actual = compute(exports);
    const diff = differences(actual);
    if (diff.length > 0) {
        console.error(`FAIL: ${diff.length} of the glossary's counts differ from the exports:`);
        for (const line of diff) console.error(`  ${line}`);
        return 1;
    }
    console.log(`every count of the glossary's state diagram holds over ${exports.length} exports`);
    console.log(report(actual));
    return 0;
}

process.exit(main(process.argv.slice(2)));
