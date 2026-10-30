/*
 *  bench-export-checks.mjs
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
 * What an export is checked against: its detection accounting, the device
 * session's protocol (`sessionRunGaps`) and the page's defaults it reads, and
 * what `scripts/replay-clips.mjs --transfer` replays (`transferPlan`).
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, under the same name.
 */

import { DETECTION_STAGES } from "./bench-definitions.mjs";
import { postToArrivalSamples } from "./bench-detection.mjs";
import { detectionUseOf } from "./bench-frames.mjs";
import { DEFAULT_TARGET_FILE, DETECTION_PATHS, TUNABLE_TRACKER_OPTIONS } from "./bench-params.mjs";
import { finite, stats, sum } from "./bench-stats.mjs";

/**
 * The counts a detection policy keeps, whole numbers all: the one list of their
 * names, which `createDetectionPolicy` (`detection-policy.mjs`) keeps its counts
 * under and {@link accountingError} checks.
 */
export const ACCOUNTING_COUNTS = Object.freeze([
    "requests",
    "posted",
    "consumptions",
    "ignored",
    "dropped",
    "discardedAtStop",
]);

/**
 * Whether `acc`, a worker run's detection accounting, is what the policy
 * guarantees, as one line saying what is not, or `null` when it is: every
 * count a whole number ≥ 0, `requests = consumptions + dropped +
 * discardedAtStop`, and `ignored = 0` (`DEFINITIONS.detectionAccounting`). An
 * ignored detection is reported before the imbalance it causes: the request
 * it leaves unresolved is the symptom, not the defect.
 */
export function accountingError(acc) {
    for (const key of ACCOUNTING_COUNTS) {
        const n = acc?.[key];
        if (!(Number.isInteger(n) && n >= 0)) {
            // A text count quoted: "posted is 31" would read as if 31 were refused.
            const shown = typeof n === "string" ? JSON.stringify(n) : String(n);
            return `detection accounting: ${key} is ${shown}, not a whole number ≥ 0`;
        }
    }
    if (acc.ignored !== 0) {
        const n = acc.ignored;
        return `${n} ${n === 1 ? "detection was" : "detections were"} handed in while a lock held (ignored), where the policy allows none`;
    }
    if (acc.requests !== acc.consumptions + acc.dropped + acc.discardedAtStop) {
        return `detection accounting does not balance: requests ${acc.requests} ≠ consumptions ${acc.consumptions} + dropped ${acc.dropped} + discardedAtStop ${acc.discardedAtStop}`;
    }
    return null;
}

/**
 * The detection path a page export ran on: its `detection.path`, and `"sync"`
 * for one older than the worker path, which all detected on the frame loop.
 */
export function exportDetectionPath(e) {
    return e?.detection?.path ?? "sync";
}

/** A session run's counted loops: loop 0 warms up, and loops 1 to 4 are read (docs/benchmarks/README.md). */
export const SESSION_LOOPS = Object.freeze({ firstLoop: 1, loopCount: 4 });

/**
 * What keeps page export `e` from being a run of the device session
 * (docs/benchmarks/README.md, "2026-09-29 — M3: detection off the frame,
 * measured", "A device session"), one line each, or `[]` when nothing does. The
 * page records the answer in the export (`protocol`, `DEFINITIONS.protocol`) and
 * exports a run with gaps all the same, since an exploratory run is legitimate;
 * `scripts/replay-clips.mjs --transfer` reads a session's runs, and no other.
 *
 * A session run is a tracking or a stateless run of a bundled clip, over one
 * warm-up loop and {@link SESSION_LOOPS}' counted ones, with its place in the
 * session's order (`run.order`), that ended itself (`run.endedBy` `done`) and
 * did not fail (`run.failure` null, read whatever `endedBy` says: #119) with
 * every frame it processed still in its window (`ticks`, a whole number, equal
 * to `windowSize`); it records its detection path (`detection.path`, sync or
 * worker: an export without one is not read as a synchronous run's here); a
 * tracking run's lock was read over its counted loops whole
 * (`trackTimeShare.complete`), and a worker run's accounting holds
 * ({@link accountingError}). And it ran at the page's defaults, read from the
 * export's own `target`, `tracker`, `maxKeypoints` and `processingBox`: the
 * committed target, loaded; no tracker option overridden
 * ({@link TUNABLE_TRACKER_OPTIONS}, `?tracker=`); the default scene keypoint
 * budget and processing box. What the export does not record is a gap, never a
 * pass.
 *
 * `defaults` is `{ targetFile, processingBox, maxKeypoints, trackerOptions }`,
 * which the page builds from its own constants and the tracker's `DEFAULT_*`:
 * this module imports no package (the worker's core imports it, and imports
 * none), so the tracker's defaults reach it from its caller, never as copies. A
 * default the caller does not give — any of the four, a box's side, a tunable
 * option — throws a `TypeError` naming it: compared with an export that lacks
 * the same field, an absent default would pass it.
 */
export function sessionRunGaps(e, defaults) {
    checkSessionDefaults(defaults, "sessionRunGaps");
    const gaps = [];
    const shown = (v) => (v === null || v === undefined ? "none" : v);
    const mode = e?.mode;
    if (mode !== "tracking" && mode !== "stateless") {
        gaps.push(`mode ${shown(mode)}: a session run is a tracking or a stateless run`);
    }
    if (e?.source !== "bundled") {
        gaps.push(`source ${shown(e?.source)}: a session run plays a bundled clip (?clip=)`);
    } else if (!e.bundledClip) {
        gaps.push("source bundled, no clip named: a session run plays a bundled clip (?clip=)");
    }
    const { firstLoop, loopCount } = SESSION_LOOPS;
    const loops = e?.loops;
    if (loops?.firstLoop !== firstLoop || loops?.loopCount !== loopCount) {
        const read = loops ? `${loops.firstLoop}–${loops.firstLoop + loops.loopCount - 1}` : "none";
        gaps.push(
            `loops ${read}: a session run counts loops ${firstLoop}–${firstLoop + loopCount - 1} after its warm-up (?loops=${loopCount})`,
        );
    }
    const order = e?.run?.order;
    if (!(Number.isInteger(order) && order >= 1)) {
        gaps.push(
            `run.order ${shown(order)}: a session run has its place in the session's order (?run=)`,
        );
    }
    if (e?.run?.endedBy !== "done") {
        gaps.push(
            `run.endedBy ${shown(e?.run?.endedBy)}: a session run ends itself on the first frame after its counted loops (done)`,
        );
    }
    // Read beside endedBy, not through it (#119): `failRun` setting `endedBy` is all that kept
    // a run that failed at its own end from exporting `done`. A missing run record is named
    // above, twice; a record without the field is a gap, never a pass.
    if (e?.run) {
        const failure = e.run.failure;
        if (failure === undefined) {
            gaps.push(
                "run.failure not recorded: a session run records that it did not fail (null)",
            );
        } else if (failure !== null) {
            gaps.push(
                `run.failure ${JSON.stringify(failure)}: a session run did not fail, whatever its endedBy says`,
            );
        }
    }
    // Both absent would compare equal: the evidence that no frame was lost must be there.
    if (!(Number.isInteger(e?.ticks) && e.ticks === e?.windowSize)) {
        gaps.push(
            `the window kept ${shown(e?.windowSize)} of ${shown(e?.ticks)} frames: a session run keeps every frame it processed (?window=2000)`,
        );
    }
    if (mode === "tracking" && e?.runSummary?.trackTimeShare?.complete !== true) {
        gaps.push(
            "trackTimeShare is not complete: a tracking run's lock is read over its counted loops whole",
        );
    }
    // Not exportDetectionPath's reading of an older export: a worker export that lost its
    // detection record would be read as synchronous, and skip its accounting.
    const path = e?.detection?.path;
    if (!DETECTION_PATHS.includes(path)) {
        gaps.push(
            `detection.path ${shown(path)}: a session run records its detection path, sync or worker`,
        );
    }
    if (path === "worker") {
        const acc = e.detection?.accounting;
        const why =
            acc == null
                ? "detection accounting none: a worker run's accounting is asserted, and it records none"
                : accountingError(acc);
        if (why) gaps.push(why);
    }
    if (e?.target?.source !== "wnft" || e.target.file !== defaults.targetFile) {
        gaps.push(
            `target ${shown(e?.target?.file)}: a session run tracks ${defaults.targetFile}, loaded (no ?targetFile=)`,
        );
    }
    if (mode === "tracking") {
        const options = e?.tracker?.options;
        if (!options) {
            gaps.push("tracker options none: a tracking run records the options it ran with");
        } else {
            for (const key of TUNABLE_TRACKER_OPTIONS) {
                const d = defaults.trackerOptions[key];
                if (options[key] !== d) {
                    gaps.push(
                        `tracker option ${key} ${shown(options[key])}, not its default ${d}: a session run uses the tracker's defaults (no ?tracker=)`,
                    );
                }
            }
        }
    }
    if (e?.maxKeypoints !== defaults.maxKeypoints) {
        gaps.push(
            `maxKeypoints ${shown(e?.maxKeypoints)}, not the page's default ${defaults.maxKeypoints}: a session run uses it (no ?maxKeypoints=)`,
        );
    }
    const box = e?.processingBox;
    const d = defaults.processingBox;
    if (box?.width !== d.width || box?.height !== d.height) {
        gaps.push(
            `processingBox ${box ? `${box.width}×${box.height}` : "none"}, not the page's default ${d.width}×${d.height}: a session run uses it (no ?procWidth= or ?procHeight=)`,
        );
    }
    return gaps;
}

/**
 * Refuses `defaults`, as {@link sessionRunGaps} takes them, unless every one is
 * given: a `TypeError` from `caller` naming each one missing.
 */
function checkSessionDefaults(defaults, caller) {
    const missing = [];
    if (typeof defaults?.targetFile !== "string") missing.push("targetFile");
    if (defaults?.processingBox == null) missing.push("processingBox");
    else {
        for (const side of ["width", "height"]) {
            if (!Number.isFinite(defaults.processingBox[side]))
                missing.push(`processingBox.${side}`);
        }
    }
    if (!Number.isFinite(defaults?.maxKeypoints)) missing.push("maxKeypoints");
    if (defaults?.trackerOptions == null) missing.push("trackerOptions");
    else {
        for (const key of TUNABLE_TRACKER_OPTIONS) {
            if (defaults.trackerOptions[key] == null) missing.push(`trackerOptions.${key}`);
        }
    }
    if (missing.length > 0) {
        throw new TypeError(
            `${caller} needs the page's defaults: ${missing.join(", ")} missing ({ targetFile, processingBox, maxKeypoints, trackerOptions })`,
        );
    }
}

/**
 * The tracking state's defaults, one per {@link TUNABLE_TRACKER_OPTIONS}, read
 * from the tracker package `pkg` by its `DEFAULT_*` names (`minTrackedPatches`
 * is `DEFAULT_MIN_TRACKED_PATCHES`): the `trackerOptions` {@link sessionRunGaps}
 * compares an export with. This module imports no package, so its caller
 * passes the one it loaded. A package without one of them throws a
 * `TypeError` naming the export.
 */
export function trackerDefaults(pkg) {
    const name = (key) => `DEFAULT_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
    const absent = TUNABLE_TRACKER_OPTIONS.map(name).filter((n) => pkg?.[n] === undefined);
    if (absent.length > 0) {
        throw new TypeError(`trackerDefaults: the tracker package exports no ${absent.join(", ")}`);
    }
    return Object.fromEntries(TUNABLE_TRACKER_OPTIONS.map((key) => [key, pkg[name(key)]]));
}

/**
 * The processing box `bench-nft.html` runs at when no `?procWidth=` or
 * `?procHeight=` says otherwise: its `PROC_WIDTH` × `PROC_HEIGHT`, which a
 * session run uses ({@link sessionRunGaps}), and the box the desktop replay
 * fits its frames into.
 */
export const PAGE_PROCESSING_BOX = Object.freeze({ width: 480, height: 360 });

/**
 * The page's defaults as {@link sessionRunGaps} takes them, built from the
 * tracker package `pkg`: the committed target, {@link PAGE_PROCESSING_BOX},
 * the package's default scene keypoint budget, and its tracking defaults
 * ({@link trackerDefaults}). What `scripts/replay-clips.mjs --transfer`
 * recomputes each export's protocol with ({@link transferPlan}). A package
 * without one of them throws a `TypeError` naming it.
 */
export function sessionDefaults(pkg) {
    if (!Number.isFinite(pkg?.DEFAULT_MAX_SCENE_KEYPOINTS)) {
        throw new TypeError(
            "sessionDefaults: the tracker package exports no DEFAULT_MAX_SCENE_KEYPOINTS",
        );
    }
    return {
        targetFile: DEFAULT_TARGET_FILE,
        processingBox: PAGE_PROCESSING_BOX,
        maxKeypoints: pkg.DEFAULT_MAX_SCENE_KEYPOINTS,
        trackerOptions: trackerDefaults(pkg),
    };
}

/**
 * Why `scripts/replay-clips.mjs --transfer` reads nothing from export `e`, or
 * `null` when it reads it: a page's export of a tracking run on one of
 * `clips`, that ran on one of the detection paths. Not the replay's own
 * exports (`kind: "replay"`, whose timings are modelled, not measured), and
 * not a stateless or detection-only run, which a session also exports.
 */
function transferSkip(e, clips) {
    if (!Array.isArray(e?.frames)) return "not a page export: it has no frames";
    if (e.kind === "replay") return "a replay's export, not a page's";
    if (e.mode !== "tracking") return `a ${e.mode ?? "(no mode)"} run, not a tracking run`;
    if (e.source !== "bundled" || !clips.includes(e.bundledClip)) {
        return `it did not run on a bundled clip (source ${e.source}, clip ${e.bundledClip ?? "(none)"})`;
    }
    const path = exportDetectionPath(e);
    if (!DETECTION_PATHS.includes(path))
        return `its detection path ${path} is neither sync nor worker`;
    return null;
}

/**
 * What one mode's page exports of a clip measured, pooled: the latency samples
 * a detection takes in that mode, the acquisition a frame costs it, and the
 * tracking step. `named` are `{ name, e }` of one `path`.
 *
 * - `latencyMs`: the worker's {@link postToArrivalSamples}, over the jobs
 *   that came back (a job that never did has none); the synchronous mode's, the
 *   sum of the `DETECTION_STAGES` timings of each frame that ran the tracker's
 *   own detection (`detectionUse` internal, as {@link framesForStage} reads
 *   it). Both are counted from the end of the detected frame's main-thread
 *   work, which is where the replay's post is.
 * - `acquireMs`: the p50 of `acquire` + `gray` over the frames that are not
 *   TRACK.
 * - `stepMs`: the p50 of `trackerTimings.trackMs` over TRACK frames:
 *   `trackStepMs`'s statistic, but not an export's own `trackStepMs`, which
 *   reads its counted loops.
 *
 * Every frame and job of every export is read, the warm-up loop's and the
 * partial loop's after the counted ones included.
 * A quantity that has no sample is `null`, and its statistics are.
 */
function transferProfile(path, named) {
    const latencyMs = [];
    const acquire = [];
    const steps = [];
    for (const { e } of named) {
        if (path === "worker") latencyMs.push(...postToArrivalSamples(e.detection?.jobs ?? []));
        for (const f of e.frames) {
            if (path === "sync" && detectionUseOf(f) === "internal") {
                const stages = finite(DETECTION_STAGES.map((stage) => f.timings?.[stage]));
                if (stages.length > 0) latencyMs.push(sum(stages));
            }
            if (f.state === "TRACK") {
                steps.push(f.trackerTimings?.trackMs);
            } else {
                acquire.push((f.timings?.acquire ?? NaN) + (f.timings?.gray ?? NaN));
            }
        }
    }
    return {
        path,
        files: named.map(({ name }) => name),
        latencyMs,
        latency: stats(latencyMs),
        acquireMs: stats(finite(acquire)).p50,
        stepMs: stats(finite(steps)).p50,
    };
}

/**
 * What `scripts/replay-clips.mjs --transfer` replays, from the page exports of a
 * session: `files` are `{ name, e }`, and `clips` the bundled clips (in the
 * order they are replayed), `sha256` the target the replay runs and `defaults`
 * the page's, as {@link sessionRunGaps} takes them, which a caller that gives
 * none, or not every one, is refused for before any export is read. Returns
 * `{ clips, skipped, refusal }`. `clips` has, for each clip with an export,
 * its `sync` and `worker` profile (`transferProfile`): `{ path, files,
 * latencyMs, latency, acquireMs, stepMs }`. A clip with no export is not
 * replayed, and is no refusal. `skipped` are the files nothing is read from,
 * `{ name, why }` ({@link transferSkip}). `refusal` is one line, or `null`
 * when the plan can be replayed, and is read in this order, so that what is
 * wrong with a directory is named before what is wrong with its contents:
 *
 * 1. a clip with exports of one path only, or no clip with any, has nothing
 *    to transfer between;
 * 2. an export of another target (`target.sha256`, none in an older export):
 *    the session's latencies are those of the pipeline on its target;
 * 3. a worker export whose `detection.accounting` fails {@link accountingError},
 *    or that records none: checked again on reading, as the page checked it
 *    before exporting, since a session holding an invalid run is an invalid
 *    session, not a directory with a file to skip;
 * 4. an export, of either path, that the page did not record as a session run
 *    (`protocol.sessionRun` not `true`, {@link sessionRunGaps}), named with the
 *    gaps it recorded, or that has no `protocol` record at all: the transfer
 *    replays what the session ran, and a run outside its protocol is not that.
 *    A record that says it is one is not trusted either: once every record
 *    has been read, the protocol is recomputed from each export with
 *    `defaults`, and an export with gaps by that rule is refused, named with
 *    them. A record left stale by a later change to the rule, or edited by
 *    hand, would otherwise pass;
 * 5. a mode with no latency sample, no acquisition or no step to replay with.
 */
export function transferPlan(files, { clips, sha256, defaults }) {
    checkSessionDefaults(defaults, "transferPlan");
    const skipped = [];
    const byClip = new Map(clips.map((clip) => [clip, { sync: [], worker: [] }]));
    for (const file of files) {
        const why = transferSkip(file.e, clips);
        if (why) skipped.push({ name: file.name, why });
        else byClip.get(file.e.bundledClip)[exportDetectionPath(file.e)].push(file);
    }
    const refuse = (refusal) => ({ clips: [], skipped, refusal });
    const present = [...byClip].filter(([, { sync, worker }]) => sync.length + worker.length > 0);
    if (present.length === 0) {
        return refuse(
            `no worker and sync exports of any clip (${files.length} files read, none a tracking export of a bundled clip)`,
        );
    }
    for (const [clip, { sync, worker }] of present) {
        if (sync.length === 0 || worker.length === 0) {
            return refuse(
                `${clip}: no worker and sync exports to transfer between (worker ${worker.length}, sync ${sync.length})`,
            );
        }
    }
    for (const [clip, { sync, worker }] of present) {
        for (const { name, e } of [...worker, ...sync]) {
            if (e.target?.sha256 !== sha256) {
                return refuse(
                    `${clip}: ${name} names target sha256 ${e.target?.sha256 ?? "(none)"}, not ${sha256} (the replay's target)`,
                );
            }
        }
    }
    for (const [clip, { worker }] of present) {
        for (const { name, e } of worker) {
            const acc = e.detection?.accounting;
            const why = acc == null ? "it records no detection accounting" : accountingError(acc);
            if (why) return refuse(`${clip}: ${name} is not a valid worker run: ${why}`);
        }
    }
    for (const [clip, { sync, worker }] of present) {
        for (const { name, e } of [...worker, ...sync]) {
            const protocol = e.protocol;
            if (protocol == null)
                return refuse(`${clip}: ${name} is not a session run (no protocol record)`);
            if (protocol.sessionRun !== true) {
                const gaps =
                    Array.isArray(protocol.gaps) && protocol.gaps.length > 0
                        ? protocol.gaps.join("; ")
                        : "its protocol record names no gap";
                return refuse(`${clip}: ${name} is not a session run: ${gaps}`);
            }
        }
    }
    // After every record's own word: an export that says it is no session run is named as
    // such before another whose claim to be one the rule does not bear out.
    for (const [clip, { sync, worker }] of present) {
        for (const { name, e } of [...worker, ...sync]) {
            const recomputed = sessionRunGaps(e, defaults);
            if (recomputed.length > 0) {
                return refuse(
                    `${clip}: ${name} records a session run, but recomputed from the export it has gaps: ${recomputed.join("; ")}`,
                );
            }
        }
    }
    const planned = [];
    for (const [clip, named] of present) {
        const profiles = {
            clip,
            sync: transferProfile("sync", named.sync),
            worker: transferProfile("worker", named.worker),
        };
        for (const path of ["worker", "sync"]) {
            const p = profiles[path];
            const lacks =
                p.latencyMs.length === 0
                    ? `no detection latency to draw from (${path === "worker" ? "no job that arrived" : "no frame that ran the tracker's own detection"})`
                    : p.acquireMs === null
                      ? "no acquisition (no acquire + gray timing on a frame that is not TRACK)"
                      : p.stepMs === null
                        ? "no tracking step (no trackerTimings.trackMs on a TRACK frame)"
                        : null;
            if (lacks)
                return refuse(`${clip}: the ${path} exports (${p.files.join(", ")}) give ${lacks}`);
        }
        planned.push(profiles);
    }
    return { clips: planned, skipped, refusal: null };
}
