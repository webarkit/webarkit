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
 * The rule is read three ways, so that a run's first acquisition is never
 * pooled with a lock set again after it, which is the distinction the LOST
 * entry exists to separate: a transition into a frame before the run's first
 * TRACK frame, into that frame itself, or into a frame after it (Qodo's
 * review of #146, finding 2, which found the first two pooled under "after").
 *
 * Exercised both ways (`step-protocol.md`, "Every check is exercised both
 * ways"): `--self-test` runs the comparison on the exports as committed,
 * which must pass, and again on three perturbations in memory, each of which
 * must fail: one TRACK frame of a synchronous export flipped to LOST, one
 * TRACK frame of a worker export flipped to LOST, and the detectionUse of one
 * worker TRACK->TRACK frame set to "internal", which moves no transition
 * count and is caught only because that field is counted (Qodo's review of
 * #146, finding 1), and one held TRACK frame of a synchronous run flipped to
 * LOST, which must be named by the by-edge count of locks set again
 * (Copilot's review of #148). It exits non-zero unless all five hold. A
 * check that fails is fatal: nothing but the differing counts is printed.
 *
 * The three phase buckets are position in the run, not event type. A lock
 * set again is an edge, DETECT->TRACK or LOST->TRACK after the run's first
 * TRACK frame, and is counted by edge in `wholeRunsLocksSetAgain` and
 * `locksSetAgain`; TRACK->TRACK after that frame is a held lock continuing
 * and is in the after bucket, not in those.
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
        // The same, over the 13 whole runs, split three ways by the sequence
        // rule: "before" is a transition into a frame that precedes the run's
        // first TRACK frame; "into" the one into that frame, the run's first
        // acquisition; "after" one into any later frame.
        wholeRunsBeforeFirstTrack: {
            "DETECT->LOST": 32,
            "LOST->LOST": 23,
            "LOST->DETECT": 36,
            "DETECT->DETECT": 114,
        },
        wholeRunsIntoFirstTrack: { "DETECT->TRACK": 13 },
        // The locks set again, by edge: transitions into TRACK from a state
        // other than TRACK, after the run's first TRACK frame. TRACK->TRACK
        // is a held lock continuing and is not counted here; a LOST->TRACK
        // in this arm would appear as an unexpected key (Copilot's review of
        // #148).
        wholeRunsLocksSetAgain: { "DETECT->TRACK": 179 },
        wholeRunsAfterFirstTrack: {
            "DETECT->TRACK": 179,
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
        consumedFramesWithDetectionInFlight: 0,
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
        // Split as the synchronous whole runs are: the transition into the
        // run's first TRACK frame apart from those into later ones.
        intoFirstTrack: { "LOST->TRACK": 12 },
        // As the synchronous arm's wholeRunsLocksSetAgain; a DETECT->TRACK
        // here would appear as an unexpected key.
        locksSetAgain: { "LOST->TRACK": 149 },
        afterFirstTrack: {
            "LOST->TRACK": 149,
            "TRACK->TRACK": 8833,
            "TRACK->LOST(no-detection,trackLoss)": 155,
            "LOST->LOST(no-detection,inFlight)": 1409,
            "LOST->LOST(unconfirmed,consumed,trackLoss)": 744,
            "LOST->LOST(too-few-matches,consumed)": 135,
            "LOST->LOST(no-consensus,consumed)": 76,
        },
        // detectionUse on the frame entered by every TRACK->TRACK transition:
        // the glossary's W6 says none on every one, so this is counted, not
        // assumed (Qodo's review of #146, finding 1).
        trackToTrackDetectionUse: { none: 8833 },
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
        wholeRunsIntoFirstTrack: {},
        wholeRunsLocksSetAgain: {},
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
        consumedFramesWithDetectionInFlight: 0,
        consumedFramesByOutcome: {},
        consumedFramesAgo: {},
        consumedLatencyMsRange: [Infinity, -Infinity],
        beforeFirstTrack: {},
        intoFirstTrack: {},
        locksSetAgain: {},
        afterFirstTrack: {},
        trackToTrackDetectionUse: {},
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
        // The sequence rule, three ways: a transition into a frame before the
        // run's first TRACK frame, into that frame itself (the run's first
        // acquisition), or into a frame after it.
        const phase = (i) =>
            firstTrack < 0 || i < firstTrack ? "before" : i === firstTrack ? "into" : "after";
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
                    if (b.detectionInFlight) o.consumedFramesWithDetectionInFlight++;
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
                        `${b.detectionLatencyMs?.toFixed(1) ?? "null"} ms, before it: ${states.join(", ")}`;
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
                const bucket = { before: o.beforeFirstTrack, into: o.intoFirstTrack, after: o.afterFirstTrack };
                inc(bucket[phase(i)], `${a.state}->${b.state}${detail}`);
                if (phase(i) === "after" && b.state === "TRACK" && a.state !== "TRACK") {
                    inc(o.locksSetAgain, `${a.state}->${b.state}`);
                }
                if (a.state === "TRACK" && b.state === "TRACK") inc(o.trackToTrackDetectionUse, b.detectionUse);
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
                for (let i = 0; i < fr.length && phase(i) === "before"; i++) {
                    if (fr[i].state === "LOST") inc(o.neverAcquiredReasons, fr[i].reason);
                }
            }
            for (let i = 1; i < fr.length; i++) {
                const a = fr[i - 1];
                const b = fr[i];
                const t = `${a.state}->${b.state}`;
                inc(o.transitions, t);
                if (whole) {
                    const bucket = {
                        before: o.wholeRunsBeforeFirstTrack,
                        into: o.wholeRunsIntoFirstTrack,
                        after: o.wholeRunsAfterFirstTrack,
                    };
                    inc(bucket[phase(i)], t);
                    if (phase(i) === "after" && b.state === "TRACK" && a.state !== "TRACK") {
                        inc(o.wholeRunsLocksSetAgain, t);
                    }
                }
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
        // Flip the first TRACK frame of one export to LOST, in memory: once in
        // the first synchronous whole run, once in the first worker run.
        const flip = (path) => {
            const flipped = exports.map(([n, j]) => [n, structuredClone(j)]);
            const target = flipped.find(
                ([, j]) =>
                    (j.detection?.path === "worker") === (path === "worker") &&
                    j.frames.length === j.ticks &&
                    j.frames.some((x) => x.state === "TRACK"),
            );
            const frame = target[1].frames.find((x) => x.state === "TRACK");
            frame.state = "LOST";
            frame.reason = "self-test";
            return [target[0], differences(compute(flipped)).length];
        };
        const [syncName, syncBroken] = flip("sync");
        const [workerName, workerBroken] = flip("worker");
        // Change the detectionUse of one worker TRACK->TRACK frame, the
        // perturbation Qodo's review of #146 named: every transition count
        // stays the same, and only the counted detectionUse can catch it.
        const drifted = exports.map(([n, j]) => [n, structuredClone(j)]);
        const driftTarget = drifted.find(([, j]) => j.detection?.path === "worker");
        const driftFrames = driftTarget[1].frames;
        const driftIndex = driftFrames.findIndex((x, i) => i > 0 && x.state === "TRACK" && driftFrames[i - 1].state === "TRACK");
        driftFrames[driftIndex].detectionUse = "internal";
        const driftBroken = differences(compute(drifted));
        // Flip a held TRACK frame, one with TRACK on both sides and after the
        // run's first TRACK frame, to LOST in a synchronous whole run: the
        // transition out of it becomes a LOST->TRACK after the first TRACK
        // frame, a lock set again by an edge this arm never shows, which the
        // by-edge count must report as an unexpected key (Copilot's review
        // of #148).
        const held = exports.map(([n, j]) => [n, structuredClone(j)]);
        const heldTarget = held.find(([, j]) => j.detection?.path !== "worker" && j.frames.length === j.ticks);
        const hf = heldTarget[1].frames;
        const heldFirst = hf.findIndex((x) => x.state === "TRACK");
        const heldIndex = hf.findIndex(
            (x, i) => i > heldFirst && x.state === "TRACK" && hf[i - 1].state === "TRACK" && hf[i + 1]?.state === "TRACK",
        );
        hf[heldIndex].state = "LOST";
        hf[heldIndex].reason = "self-test";
        const heldBroken = differences(compute(held));
        const heldNamesIt = heldBroken.some((line) => line.startsWith("sync.wholeRunsLocksSetAgain."));
        const ok =
            clean.length === 0 && syncBroken > 0 && workerBroken > 0 && driftBroken.length > 0 && heldNamesIt;
        const says = (n) => (n > 0 ? `the check fails on ${n} counts` : "the check still passes: it cannot fail");
        console.log(
            `self-test: exports as committed ${clean.length === 0 ? "pass" : `FAIL (${clean.length} counts differ)`}; ` +
                `with one TRACK frame of ${syncName} flipped to LOST ${says(syncBroken)}; ` +
                `with one TRACK frame of ${workerName} flipped to LOST ${says(workerBroken)}; ` +
                `with the detectionUse of one TRACK->TRACK frame of ${driftTarget[0]} (frames[${driftIndex}]) set to internal ` +
                `${says(driftBroken.length)}${driftBroken.length > 0 ? `: ${driftBroken.join("; ")}` : ""}; ` +
                `with one held TRACK frame of ${heldTarget[0]} (frames[${heldIndex}]) flipped to LOST ` +
                `${says(heldBroken.length)}${heldNamesIt ? ", among them" : ", but NOT"} the by-edge count of locks set again` +
                `${heldBroken.length > 0 ? `: ${heldBroken.filter((l) => l.includes("LocksSetAgain")).join("; ") || "(none named)"}` : ""}`,
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
