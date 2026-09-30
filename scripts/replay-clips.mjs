/*
 *  replay-clips.mjs
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
 * A desktop pre-flight for bench-nft.html's tracking mode, and the proxy
 * check's denominator. Replays the bundled clips' frames, at the page's
 * processing size, through NftTracker with examples/targets/pinball.wnft, and
 * summarises them with the page's own metrics (examples/js/bench-metrics.mjs).
 *
 *     npm run build
 *     node scripts/replay-clips.mjs [--out <dir>]
 *     node scripts/replay-clips.mjs --sequence <tracking export.json>
 *     node scripts/replay-clips.mjs --external <latencyMs> [--seed <n>] [--out <dir>]
 *     node scripts/replay-clips.mjs --transfer <dir> [--seed <n>] [--out <dir>]
 *
 * **Not an on-device measurement, and not the browser's pixels.** ffmpeg and
 * ffprobe (on PATH) decode the clips and scale them (bilinear) where the page
 * has the browser's decoder and drawImage; the grey conversion is the page's.
 * Timings are this machine's.
 *
 * Default: two loops of each clip, per schedule. "every frame" processes them
 * all. The "device" schedules model a device that processes only the frames it
 * is free for (nextFrameIndex): busy for the clip's acquire + gray p50 on
 * Tab_9_WiFi, plus a detection (83.2 ms) on a frame that detected, plus a
 * tracking step of 15 or 25 ms on a frame that ran one — the step being what
 * the device run measures. The model leaves out the page's own per-frame work
 * (the overlay and the stats panel after `total`), the video callback's
 * latency, and JIT warm-up: it brackets, it does not predict to the frame.
 *
 * --sequence replays the frames a tracking export processed, by their media
 * times (framesAt), at the export's own processing box and with the tracker
 * options it recorded (sequenceSettings), once to warm up and then three
 * times, and prints the
 * median of the three runs' trackStepMs p50 and p95: the device ÷ desktop
 * ratio on the same frames, which prediction 1 in docs/benchmarks/README.md
 * reads the proxy from.
 *
 * **Tuning rounds** (M3's tuning pass; the plan is in
 * docs/benchmarks/README.md, "2026-09-28 — M3: the tuning pass"):
 *
 *     node scripts/replay-clips.mjs --target examples/targets/tuning/p32-s16.wnft  *         --options minTrackedPatches:6 --seed 1 [--tracking-only] [--device-ratio 3.15]
 *
 * - `--target <file.wnft>`: a candidate target instead of pinball.wnft. The
 *   export and the header record its path and SHA-256.
 * - `--options k:v,…`: tracker option overrides, the page's `?tracker=` syntax
 *   (`parseTrackerOverrides`), applied to every run. Not with `--sequence`,
 *   which runs the export's own options, nor with `--transfer`, which replays
 *   a session's runs, all at the tracker's defaults.
 * - `--seed <n>`: `Math.random` seeded (mulberry32) at the start of every run,
 *   so RANSAC draws in the detections repeat, and a candidate's run differs
 *   from the baseline's by the candidate, not by the draws — until the two
 *   runs' frames diverge. Without it the replay draws as it always has.
 * - `--tracking-only`: skip the detection-only runs. They do not depend on the
 *   patches or the tracking options, so a round needs them once per seed, for
 *   the static clip's jitter ratio.
 * - `--device-ratio <x>` (default 3.15, the middle of 2026-09-26's measured
 *   3.0–3.3): a further schedule, "device, scaled step", whose tracking step
 *   costs this configuration's own every-frame `trackStepMs` p50 times the
 *   ratio. A cheaper step skips fewer frames, and this is the schedule that
 *   lets it show; the fixed 15 and 25 ms schedules stay for comparison with
 *   M2's replay.
 *
 * **External detection** (M3's desktop pre-flight; the plan is in
 * docs/benchmarks/README.md, "2026-09-29 — M3: detection off the frame,
 * measured", "The desktop pre-flight"). `--external <latencyMs>` replaces the
 * run table with five tracking arms on each clip, over `M3_LOOPS` loops with
 * `trackTimeShare` read over the counted ones (loops 1 to 4), as the device
 * reads it: every frame, synchronous; every frame, worker; every frame, the
 * synchronous mode run as external detection at its device latency (the
 * fallback's re-check); device schedule with the scaled step, synchronous; and
 * the same, worker. The worker arms run the page's own on-demand policy
 * (`createDetectionPolicy`) on the tracker's `externalDetection`: on a frame
 * whose result says `needsDetection`, with nothing in flight, that frame is
 * detected (inside the seed) and its result handed to the first frame
 * processed at or after the post plus the latency, the post being the end of
 * that frame's main-thread work — its acquisition, and a tracking step if one
 * ran — and the latency, as on the device, counted from it. Requests made
 * while one is in flight are dropped. On the device schedule a frame that
 * waits costs its acquisition (and its step, if it ran one); the synchronous
 * arms keep the model's 83.2 ms detection. The acquisition is `M3_ACQUIRE_MS`
 * — round 2's run of the adopted target — in every arm, not the older
 * `DEVICE_ACQUIRE_MS`, and every arm's frames are stamped on the loops'
 * continuous timeline, so no latency goes negative at a wrap. The scaled step
 * is used on the every-frame worker arms too, as the model of when the device
 * would have posted.
 *
 * What the model leaves out, besides the default runs' list: the frame's copy
 * and the two messages, the worker's core and the handler, which the latency
 * is for; and anything the frame that consumes a detection and locks on it
 * costs beyond its acquisition and its step, so that it is busy no longer than
 * any tracking frame (the synchronous arms' frame that detected is busy 83.2
 * ms longer), a simplification the plan keeps. The tuning probe does not run:
 * it mirrors the default mode's lock. The external arms' detection accounting
 * is asserted (`accountingError`): an unbalanced one exits 1.
 *
 * The every-frame tracking run also runs the step probe
 * (`scripts/tuning-probe.mjs`), which re-runs each tracking step beside the
 * tracker, stops the script if the two ever disagree, and prints a second
 * table: per-patch cost, alignment iterations, the correlation of right
 * alignments against the `minPatchZncc` gate, and what the `too-few-patches`
 * losses had left. Iterations, correlations and counts are functions of the
 * pixels, not of this machine's speed, so the desktop measures them as the
 * device would, up to ffmpeg's decoding against the browser's.
 *
 * **The latency transfer** (after a device session; the plan is in
 * docs/benchmarks/README.md, "2026-09-29 — M3: detection off the frame,
 * measured", "The lock metric, tested before any device time": the gate).
 * `--transfer <dir>` reads every `*.json` page export in `<dir>` (not its
 * subdirectories), keeps the tracking runs of a bundled clip, groups them by
 * clip and `detection.path` (an export with none is a synchronous run's), and
 * on each clip replays the device schedule twice as external detection, on
 * `replayExternal`, the loop `--external` runs: once with the worker runs'
 * latencies and once with the synchronous runs', so that a difference in
 * latency is translated into points of lock. What a mode's arm takes from its
 * exports, pooled, the warm-up loop's frames and jobs included (`transferPlan`
 * in bench-metrics.mjs):
 *
 * - the latency of each job posted, drawn with replacement from that mode's
 *   samples: the worker's `arrivedAtMs − postedAtMs` on the jobs that came
 *   back, the synchronous mode's `DETECTION_STAGES` sum on the frames that ran
 *   the tracker's own detection, both counted from the end of the detected
 *   frame's work, which is where the loop's post is;
 * - the acquisition: the p50 of `acquire` + `gray` over the frames that are not
 *   TRACK;
 * - the step: the p50 of `trackerTimings.trackMs` over TRACK frames, the
 *   session's own `trackStepMs`, in place of `--device-ratio`'s scaled one.
 *
 * The draws come from their own seeded stream (mulberry32 of the seed XOR a
 * constant), at the start of each arm, so a run repeats, and neither arm's
 * draws move the RANSAC draws' `Math.random`. `--seed` defaults to 1 here,
 * and is printed. Files are read in name order, since the draws index the
 * samples. The replay's target must be the one the exports name (`target.sha256`):
 * a clip whose exports name another, or that has exports of one path only, is
 * refused (exit 1), before any clip is decoded; so is a worker export whose
 * detection accounting does not hold (`accountingError`, which the page
 * checked before exporting it) or that records none — a session holding an
 * invalid run is an invalid session, not a file to skip — and an export of
 * either path that the page did not record as a session run
 * (`protocol.sessionRun`, `sessionRunGaps`), named with its gaps, or that has
 * no protocol record. Prints, per clip, each arm's `trackTimeShare` and the
 * difference, worker minus sync, in points. Not with `--external`,
 * `--sequence`, `--device-ratio` or `--options`: the session ran the
 * tracker's defaults, and the transfer replays what it ran; `--tracking-only`
 * has nothing to skip.
 *
 * The transfer explains a device result and weighs in when the table clip is
 * inconclusive; it never overrides the device. Both modes run as external
 * detection, the synchronous one too: what a schedule processes while a
 * detection is in flight does not move `trackTimeShare`, so the modes differ
 * here by what the session measured of them and by nothing the loop does. The
 * replay's model is `--external`'s, with what it leaves out, and a frame that
 * consumes a detection is busy no longer than any tracking frame. One seed is
 * one draw of the latencies and of the detections' RANSAC; the seeds' range is
 * the spread.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
    createJsfeatNextBackend,
    intrinsics,
} from "../packages/cv-backend-jsfeatnext/dist/index.js";
import {
    decode,
    DEFAULT_MIN_TRACKED_PATCHES,
    detectTarget,
    NftTracker,
    prepareDetection,
} from "../packages/nft-tracker/dist/index.js";
import { createDetectionPolicy } from "../examples/js/detection-policy.mjs";
import {
    accountingError,
    compareExports,
    framesAt,
    frameRecord,
    METRICS_VERSION,
    nextFrameIndex,
    parseTrackerOverrides,
    proxyRatio,
    sequenceRefusal,
    sequenceSettings,
    sha256Hex,
    stats,
    summarizeRun,
    targetCorners,
    targetRecord,
    transferPlan,
} from "../examples/js/bench-metrics.mjs";
import { fitSize } from "../examples/js/pinball-shared.mjs";
import { createStepProbe } from "./tuning-probe.mjs";

const EXAMPLES = fileURLToPath(new URL("../examples/", import.meta.url));
/** bench-nft.html's default processing box. */
const BOX = { width: 480, height: 360 };
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
/**
 * acquire + gray p50 on Tab_9_WiFi (docs/benchmarks/README.md): the wall clip
 * 18.9 + 1.5 ms (2026-09-19); the static and table clips 35.9–36.0 + 0.9 and
 * 40.1 + 0.9 ms (the 2026-09-24 sweep).
 */
const DEVICE_ACQUIRE_MS = {
    "pinball-static.mp4": 36.9,
    "pinball-bench.mp4": 20.4,
    "pinball-bench-table.mp4": 41.0,
};
/** detect + describe + match + estimateHomography p50 on the camera path (the rear-camera runs): 7.1 + 10.3 + 64.0 + 1.8. */
const DEVICE_DETECT_MS = 83.2;
/**
 * `--external`'s acquisition, for both modes in its arms: acquire + gray p50 of
 * round 2's runs of the adopted 48-patch target on Tab_9_WiFi (on unlocked
 * frames on either moving clip, over all of the static clip's frames), which
 * replace `DEVICE_ACQUIRE_MS` there so that a frame boundary falls where the
 * device's does.
 */
const M3_ACQUIRE_MS = {
    "pinball-static.mp4": 42.2,
    "pinball-bench.mp4": 27.7,
    "pinball-bench-table.mp4": 50.0,
};
/** `--external`'s loops per run: loop 0 warms up, loops 1 to 4 are counted, loop 5 closes them (`trackTimeShare`). */
const M3_LOOPS = 6;
const M3_COUNTED = { firstLoop: 1, loopCount: 4 };
const LOOPS = 2;
const RUNS = [
    { mode: "tracking", schedule: "every frame", stepMs: null },
    { mode: "tracking", schedule: "device, 15 ms step", stepMs: 15 },
    { mode: "tracking", schedule: "device, 25 ms step", stepMs: 25 },
    { mode: "tracking", schedule: "device, scaled step", stepMs: "scaled" },
    { mode: "detection-only", schedule: "every frame", stepMs: null },
    { mode: "detection-only", schedule: "device", stepMs: 0 },
];

/**
 * A flag's value, or `null` when the flag is absent. A flag given with no
 * value — last on the line, or followed by another flag — is a usage error,
 * not an absent flag: read as absent, `--target` at the end of a command ran
 * the default target under a command that named a candidate.
 */
const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    if (i < 0) return null;
    const value = process.argv[i + 1];
    if (value === undefined || value.startsWith("--")) usage(`${flag} expects a value`);
    return value;
};

/** A command-line mistake: one line on stderr, exit 2. */
function usage(why) {
    console.error(`replay-clips: ${why}`);
    process.exit(2);
}

const TARGET_PATH = resolve(arg("--target") ?? join(EXAMPLES, "targets/pinball.wnft"));
const parsedOverrides = parseTrackerOverrides(arg("--options"));
if (!parsedOverrides.ok) usage(`--options: ${parsedOverrides.error}`);
const OVERRIDES = parsedOverrides.options;
const TRANSFER_DIR = arg("--transfer");
// --transfer draws latencies, and a draw that could not be repeated would not
// be a result: it always has a seed, 1 unless --seed says another.
const SEED = arg("--seed") === null ? (TRANSFER_DIR === null ? null : 1) : Number(arg("--seed"));
if (SEED !== null && !(Number.isSafeInteger(SEED) && Math.abs(SEED) <= 0xffffffff)) {
    usage(`--seed expects an integer in [-4294967295, 4294967295], got "${arg("--seed")}"`);
}
const TRACKING_ONLY = process.argv.includes("--tracking-only");
const DEVICE_RATIO = Number(arg("--device-ratio") ?? 3.15);
if (!(Number.isFinite(DEVICE_RATIO) && DEVICE_RATIO > 0)) {
    usage(`--device-ratio expects a positive number, got "${arg("--device-ratio")}"`);
}
if (arg("--sequence") && arg("--options") !== null) {
    usage(
        "--sequence replays an export with its own recorded options; --options cannot change them",
    );
}
const EXTERNAL_ARG = arg("--external");
// A blank value would read as 0, a latency no command line meant.
const EXTERNAL_MS =
    EXTERNAL_ARG === null ? null : EXTERNAL_ARG.trim() === "" ? NaN : Number(EXTERNAL_ARG);
if (EXTERNAL_MS !== null && !(Number.isFinite(EXTERNAL_MS) && EXTERNAL_MS >= 0)) {
    usage(`--external expects a latency in milliseconds, a number ≥ 0, got "${EXTERNAL_ARG}"`);
}
if (EXTERNAL_MS !== null && arg("--sequence")) {
    usage(
        "--external runs its own arms over the bundled clips; --sequence replays one export's frames: the two cannot be combined",
    );
}
if (TRANSFER_DIR !== null) {
    // What each of these would give the transfer, it takes from the session.
    const other = {
        "--external":
            "--transfer draws its latencies from a session's exports; --external gives one: the two cannot be combined",
        "--sequence":
            "--transfer replays the bundled clips with a session's latencies; --sequence replays one export's frames: the two cannot be combined",
        "--device-ratio":
            "--transfer steps by the session's own trackStepMs; --device-ratio scales the desktop's: the two cannot be combined",
        "--options":
            "--transfer replays what the session ran, the tracker at its defaults; --options would change them: the two cannot be combined",
    };
    for (const [flag, why] of Object.entries(other)) if (arg(flag) !== null) usage(why);
}

/** mulberry32, as compile-target and the tests' seeded_rng use it. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** `run()` with `Math.random` seeded by `--seed`, or unchanged without one. */
function seeded(run) {
    if (SEED === null) return run();
    const real = Math.random;
    Math.random = mulberry32(SEED);
    try {
        return run();
    } finally {
        Math.random = real;
    }
}

function probe(path) {
    const json = JSON.parse(
        execFileSync(
            "ffprobe",
            [
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height:frame=pts_time",
                "-of",
                "json",
                path,
            ],
            { maxBuffer: 64 << 20 },
        ).toString(),
    );
    return {
        width: json.streams[0].width,
        height: json.streams[0].height,
        pts: json.frames.map((f) => Number(f.pts_time)),
    };
}

/** Every frame, as the page's GrayImage: ffmpeg's RGB at the processing size, the page's Rec. 601 luma. */
function greyFrames(path, width, height) {
    const rgb = execFileSync(
        "ffmpeg",
        [
            "-v",
            "error",
            "-i",
            path,
            "-fps_mode",
            "passthrough",
            "-vf",
            `scale=${width}:${height}:flags=bilinear`,
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ],
        { maxBuffer: 1 << 30 },
    );
    const n = width * height;
    const frames = [];
    for (let o = 0; o + 3 * n <= rgb.length; o += 3 * n) {
        const data = new Uint8Array(n);
        for (let i = 0, p = o; i < n; i++, p += 3) {
            data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
        }
        frames.push({ data, width, height });
    }
    return frames;
}

/** A clip's frames, fitted into `box` as the page fits them (its default box unless a run set another). */
async function loadClip(clip, box = BOX) {
    const path = join(EXAMPLES, "videos", clip);
    const { width: sw, height: sh, pts } = probe(path);
    const { width, height } = fitSize(sw, sh, box.width, box.height);
    const frames = greyFrames(path, width, height);
    if (frames.length !== pts.length)
        throw new Error(`${clip}: ${frames.length} frames decoded, ${pts.length} timestamps`);
    return { frames, pts, width, height };
}

const cv = await createJsfeatNextBackend();
const wnft = readFileSync(TARGET_PATH);
const decoded = decode(new Uint8Array(wnft));
if (!decoded.ok) throw new Error(`${TARGET_PATH}: ${decoded.error}`);
const target = decoded.target;
const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
/** As the page names it — relative to examples/ — when it is under examples/. */
const targetFile = relative(EXAMPLES, TARGET_PATH).startsWith("..")
    ? TARGET_PATH
    : relative(EXAMPLES, TARGET_PATH).split(sep).join("/");
// Every run here but the detection-only ones needs the tracker to track, and
// the step probe mirrors its lock: a target it would run detection-only (the
// constructor's rule, under these options) is refused rather than replayed.
{
    const min = OVERRIDES.minTrackedPatches ?? DEFAULT_MIN_TRACKED_PATCHES;
    const p = target.patches;
    if (!p || p.patchSize < 3 || p.count < min) {
        usage(
            `${targetFile}: ${p ? `${p.count} patches of ${p.patchSize} × ${p.patchSize}` : "no patches"}, ` +
                `and minTrackedPatches (${min}) needs at least that many of at least 3 × 3; ` +
                "the tracker would run it detection-only, and the tracking runs need it to track",
        );
    }
}
const targetRec = targetRecord({
    source: "wnft",
    file: targetFile,
    sha256: await sha256Hex(wnft),
    db: target,
});

/** A clip's duration on the looping timeline, seconds: its span plus the gap the first two frames show. */
const loopPeriod = (pts) => pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);

/** `loops` loops of the clip's frame times on one continuous timeline, seconds, as the page's looping <video> plays them. */
function loopTimes(pts, loops) {
    const period = loopPeriod(pts);
    return Array.from(
        { length: loops * pts.length },
        (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period,
    );
}

/**
 * One replay: `order` is the frame indices to process, or null for the device
 * schedule over `loops` loops (`LOOPS` unless a caller says more); `options` are
 * the tracker's (its defaults unless an export recorded others). `acquireMs` is
 * the device schedule's acquisition (the clip's `DEVICE_ACQUIRE_MS` unless a
 * caller says another), and `unwrapped` stamps each frame with its time on the
 * loops' continuous timeline rather than its media time, which goes back to
 * about 0 at every wrap.
 */
function replay({
    clip,
    frames,
    pts,
    K,
    mode,
    stepMs,
    order,
    options = OVERRIDES,
    probe = null,
    loops = LOOPS,
    acquireMs = DEVICE_ACQUIRE_MS[clip],
    unwrapped = false,
}) {
    return seeded(() =>
        replayRun({
            frames,
            pts,
            K,
            mode,
            stepMs,
            order,
            options,
            probe,
            loops,
            acquireMs,
            unwrapped,
        }),
    );
}

function replayRun({
    frames,
    pts,
    K,
    mode,
    stepMs,
    order,
    options,
    probe,
    loops,
    acquireMs,
    unwrapped,
}) {
    const tracker = new NftTracker(cv, target, K, {
        ...options,
        detectionOnly: mode === "detection-only",
        clock: () => performance.now(),
    });
    const records = [];
    const push = (i, timestampMs = pts[i] * 1000) => {
        const result = tracker.process(frames[i], timestampMs);
        probe?.frame(frames[i], result);
        records.push(
            frameRecord({
                mode,
                result,
                stageTimings: {},
                timestampMs,
                mediaTimeSeconds: pts[i],
                targetPoints,
            }),
        );
        return result;
    };
    if (order) {
        for (const i of order) push(i);
        return records;
    }
    const times = loopTimes(pts, loops);
    for (let k = 0; k < times.length; ) {
        const result = push(k % pts.length, unwrapped ? times[k] * 1000 : undefined);
        if (stepMs === null) {
            k++;
            continue;
        }
        const busy =
            acquireMs +
            (result.tracking ? stepMs : 0) +
            (result.state === "TRACK" ? 0 : DEVICE_DETECT_MS);
        k = nextFrameIndex(times, k, busy);
    }
    return records;
}

/**
 * One run of `--external`'s arms that detects off the frame: the tracker in
 * `externalDetection` mode, and the page's own on-demand policy
 * (`createDetectionPolicy`) deciding what is asked and what is handed in. On a
 * frame whose result says `needsDetection`, with nothing in flight or held,
 * this detects that very frame now (inside the run's seed, so it repeats) and
 * holds the result back until the first frame processed at or after
 *
 *     post + latencyMs, where post = the frame's time + acquireMs + stepMs,
 *
 * the step counted when the frame ran one: the post comes at the end of the
 * frame's main-thread work before it, and the latency counts from the post, as
 * the device measures it (`detectionPostToArrivalMs`). Requests made while a
 * job is in flight are dropped. Frames are stamped with their time on the
 * loops' continuous timeline, so a detection posted before a wrap and consumed
 * after it has a latency that is not negative; `mediaTimeSeconds` stays the
 * clip's own.
 *
 * `everyFrame` processes every frame; otherwise a frame that waits costs the
 * device only `acquireMs` and a step if it ran one (`nextFrameIndex`), and so
 * does a frame that consumes a detection: the synchronous mode's 83.2 ms
 * detection is not in this loop's busy time. `stepMs` is the device's tracking
 * step, which this needs on the every-frame schedule too, as a model of when
 * the device would have posted.
 *
 * `latencyMs` is a number, the latency of every job, or a function, called once
 * for each job at its post and returning that job's: `--transfer` draws them
 * from a session's measured latencies.
 *
 * Returns the frame records, one record per job posted (`jobs`: on the timeline
 * in ms, `postedAtMs` the post and `arrivedAtMs` the post plus the latency,
 * `handlerMs` and `workerMs` not modelled) and the policy's accounting, which
 * the caller asserts.
 */
function replayExternal({ frames, pts, K, options, stepMs, everyFrame, latencyMs, acquireMs }) {
    const latencyOf = typeof latencyMs === "function" ? latencyMs : () => latencyMs;
    const tracker = new NftTracker(cv, target, K, {
        ...options,
        externalDetection: true,
        clock: () => performance.now(),
    });
    // The tracker's own setup, from the options it was given.
    const setup = prepareDetection(cv, target, options);
    const policy = createDetectionPolicy();
    const times = loopTimes(pts, M3_LOOPS);
    const records = [];
    const jobs = [];
    // The one job the policy allows, while it is in flight or held: what the
    // worker will answer, and when.
    let pending = null;
    for (let k = 0; k < times.length; ) {
        const i = k % pts.length;
        const timestampMs = times[k] * 1000;
        if (policy.inFlight && times[k] >= pending.readyS) policy.arrive(pending.detection);
        const handed = policy.take();
        const settled = handed === null ? null : pending;
        if (settled) pending = null;
        const inFlight = policy.inFlight;
        const tick = records.length;
        const result = tracker.process(frames[i], timestampMs, handed);
        const workMs = acquireMs + (result.tracking ? stepMs : 0);
        policy.afterProcess(result, () => {
            const latency = latencyOf();
            const postedAtMs = timestampMs + workMs;
            const job = {
                jobId: jobs.length + 1,
                tick,
                postedAtMs,
                arrivedAtMs: postedAtMs + latency,
                handlerMs: null,
                workerMs: null,
                frameTimestampMs: timestampMs,
                frameMediaTimeSeconds: pts[i],
                consumedAtTick: null,
                outcome: null,
            };
            jobs.push(job);
            pending = {
                job,
                detection: detectTarget(cv, setup, frames[i], timestampMs),
                readyS: times[k] + (workMs + latency) / 1000,
            };
        });
        let detectedAt = null;
        if (settled) {
            const { job } = settled;
            job.outcome = result.detectionUse;
            if (result.detectionUse === "consumed") {
                job.consumedAtTick = tick;
                detectedAt = {
                    timestampMs: job.frameTimestampMs,
                    mediaTimeSeconds: job.frameMediaTimeSeconds,
                    framesAgo: tick - job.tick,
                };
            }
        }
        records.push(
            frameRecord({
                mode: "tracking",
                result,
                stageTimings: {},
                timestampMs,
                mediaTimeSeconds: pts[i],
                targetPoints,
                detection: { inFlight, detectedAt },
            }),
        );
        k = everyFrame ? k + 1 : nextFrameIndex(times, k, workMs);
    }
    // The run's end: a job still in flight (or held) is discarded, and counted.
    if (policy.inFlight || policy.held) pending.job.outcome = "discardedAtStop";
    policy.stop();
    return { records, jobs, accounting: policy.accounting() };
}

/** `summary` is `summarizeRun`'s options: none for the default runs, the counted loops for `--external`'s. */
const exportOf = (clip, run, res, records, summary = {}) => ({
    kind: "replay",
    metricsVersion: METRICS_VERSION,
    exportedAt: new Date().toISOString(),
    userAgent: `Node ${process.version} ${process.platform}/${process.arch}`,
    mode: run.mode,
    schedule: run.schedule,
    target: targetRec,
    source: "bundled",
    bundledClip: clip,
    processingResolution: res,
    runSummary: summarizeRun(records, summary),
    frames: records,
});

const fmt = (v, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));
const pct = (v) => (v === null ? "—" : `${(100 * v).toFixed(1)}%`);

const TABLE_COLUMNS = [
    "clip, at",
    "mode, schedule",
    "frames",
    "TRACK share",
    "re-acq. (at wraps)",
    "wraps",
    "first steps confirmed",
    "held-lock steps lost (at wraps)",
    "lock losses",
    "trackStepMs p50 / p95",
    "align share",
    "frame levels",
    "capped / fits",
    "fit iterations p50",
    "quality min",
    "quality ≤ 0.20",
    "jitterPx",
    "spreadPx",
];
/** What `--external`'s table adds to the run table's columns. */
const EXTERNAL_COLUMNS = [
    "trackTimeShare",
    "trackTimeShare per loop",
    "detection locks: first steps confirmed",
    "first-step latency p50 (video ms)",
    "detection requests = consumed + dropped + discarded at Stop",
];

/** A markdown table's header and separator lines, for `columns`. */
const tableHead = (columns) =>
    `| ${columns.join(" | ")} |\n|${columns.map(() => "---").join("|")}|`;

/** One row of the run table for summary `s`, then a cell for each of `extra`. */
function tableRow(clip, width, height, run, s, extra = []) {
    const losses =
        Object.entries(s.lockLosses)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ") || "—";
    const align = s.alignMs.n > 0 ? fmt(s.alignMs.p50 / s.trackStepMs.p50) : "—";
    return `| ${clip}, ${width}×${height} | ${run.mode}, ${run.schedule} | ${s.frames} | ${pct(s.trackShare)} | ${s.reacquisitions} (${s.reacquisitionsAtLoopWrap}) | ${s.loopWraps} | ${s.firstSteps.confirmed} / ${s.firstSteps.n} | ${s.heldLockSteps.lost} / ${s.heldLockSteps.n} (${s.heldLockSteps.lostAtLoopWrap}) | ${losses} | ${fmt(s.trackStepMs.p50)} / ${fmt(s.trackStepMs.p95)} | ${align} | ${JSON.stringify(s.frameLevels)} | ${s.fits.capped} / ${s.fits.n} | ${s.fits.iterations.p50 ?? "—"} | ${fmt(s.quality.min)} | ${s.lowQualityTrackFrames} | ${fmt(s.jitterPx, 3)} | ${fmt(s.spreadPx, 3)} |${extra.map((cell) => ` ${cell} |`).join("")}`;
}

/** With `--out`, an export in `outDir`, named for its clip, mode and planned schedule. */
function writeExport(clip, planned, e) {
    if (!outDir) return;
    const schedule = planned.schedule.replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "");
    const slug = `${clip.replace(/\.mp4$/, "")}-${e.mode}-${schedule}`;
    writeFileSync(join(outDir, `replay-${slug}.json`), JSON.stringify(e, null, 2));
}

/**
 * `replayExternal` inside the run's seed, its accounting asserted: an unbalanced
 * one exits 1, one line naming the clip and the arm.
 */
function runExternal(clip, arm, params) {
    const run = seeded(() => replayExternal(params));
    const unbalanced = accountingError(run.accounting);
    if (unbalanced) {
        console.error(`replay-clips: ${clip}, ${arm.schedule}: ${unbalanced}`);
        process.exit(1);
    }
    return run;
}

/**
 * One external arm's export: its `records` summarised over the counted loops,
 * and what it was run with (`model`, and the seed, options, loops and step). An
 * arm is `{ schedule, path, external }`, and its path is the summary's, which
 * refuses a worker arm's frame without `detectionUse`. Exits 1, one line, when
 * the summary refuses the arm (the clip's duration, `unwrapMediaTimes`: a frame
 * past it, whose loops would lie over each other; or such a frame), and when
 * `trackTimeShare` is incomplete: the run does not reach loop
 * `firstLoop + loopCount`, and a share read short of it is not the device's.
 */
function armExport({
    clip,
    width,
    height,
    arm,
    records,
    jobs,
    accounting,
    stepMs,
    acquireMs,
    clipDurationS,
    model,
}) {
    const run = { mode: "tracking", schedule: arm.schedule };
    let e;
    try {
        e = exportOf(clip, run, { width, height }, records, {
            clipDurationS,
            loops: M3_COUNTED,
            jobs,
            accounting,
            path: arm.path,
        });
    } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        console.error(`replay-clips: ${clip}, ${arm.schedule}: ${err.message}`);
        process.exit(1);
    }
    e.trackerOptions = OVERRIDES;
    e.seed = SEED;
    e.loops = M3_COUNTED;
    e.clipDurationS = clipDurationS;
    e.stepMs = stepMs;
    e.detection = { path: arm.path, external: arm.external, model, jobs, accounting };
    if (!e.runSummary.trackTimeShare.complete) {
        console.error(
            `replay-clips: ${clip}, ${arm.schedule}: trackTimeShare is incomplete: the run does not reach loop ${M3_COUNTED.firstLoop + M3_COUNTED.loopCount}`,
        );
        process.exit(1);
    }
    return e;
}

/** An arm's row of the external table: the run table's columns for its export `e`, then the ones `--external` adds. */
function externalRow(clip, width, height, e) {
    const s = e.runSummary;
    const t = s.trackTimeShare;
    const a = e.detection.accounting;
    return tableRow(clip, width, height, e, s, [
        pct(t.share),
        t.perLoop.map(pct).join(" / "),
        `${s.detectionLocks.confirmed} / ${s.detectionLocks.n}`,
        fmt(s.firstStepLatency.videoMs.p50, 1),
        a ? `${a.requests} = ${a.consumptions} + ${a.dropped} + ${a.discardedAtStop}` : "—",
    ]);
}

/**
 * `--external`'s five arms on every clip, as the plan's desktop pre-flight
 * reads them (docs/benchmarks/README.md, "The desktop pre-flight"), each over
 * `M3_LOOPS` loops with `trackTimeShare` read over the counted ones:
 *
 * 1. `every frame, sync`: the tracker detects on the frame loop, every frame
 *    processed.
 * 2. `every frame, worker`: detection off the frame at the latency given.
 * 3. `every frame, sync as external at its device latency`: the fallback
 *    re-check: the synchronous mode's detection, modelled as an external one
 *    that arrives 83.2 ms after the frame's work.
 * 4. `device scaled step, sync`: the device schedule of the default runs.
 * 5. `device scaled step, worker`: the same schedule, detection off the frame.
 *
 * The scaled step is arm 1's `trackStepMs` p50 times `--device-ratio`, as the
 * default runs' is. The arms on the every-frame schedule use it only as the
 * model of when the device would have posted.
 */
async function externalArms() {
    const label = (clip) => clip.replace(/^pinball-|\.mp4$/g, "");
    console.log(
        `external detection: latency ${EXTERNAL_MS} ms, counted from the post; acquisition (acquire + gray p50) ${CLIPS.map((clip) => `${label(clip)} ${M3_ACQUIRE_MS[clip]} ms`).join(", ")}; the synchronous mode's detection ${DEVICE_DETECT_MS} ms; ${M3_LOOPS} loops a run, loop 0 warm-up, loops 1–${M3_COUNTED.loopCount} counted
`,
    );
    console.log(tableHead([...TABLE_COLUMNS, ...EXTERNAL_COLUMNS]));
    const arms = [
        { schedule: "every frame, sync", everyFrame: true, path: "sync", latencyMs: null },
        {
            schedule: `every frame, worker (${EXTERNAL_MS} ms)`,
            everyFrame: true,
            path: "worker",
            latencyMs: EXTERNAL_MS,
        },
        {
            schedule: "every frame, sync as external at its device latency",
            everyFrame: true,
            path: "sync",
            latencyMs: DEVICE_DETECT_MS,
        },
        { schedule: "device scaled step, sync", everyFrame: false, path: "sync", latencyMs: null },
        {
            schedule: `device scaled step, worker (${EXTERNAL_MS} ms)`,
            everyFrame: false,
            path: "worker",
            latencyMs: EXTERNAL_MS,
        },
    ];
    for (const clip of CLIPS) {
        const { frames, pts, width, height } = await loadClip(clip);
        const K = intrinsics(width, height);
        const acquireMs = M3_ACQUIRE_MS[clip];
        const clipDurationS = loopPeriod(pts);
        let scaledStepMs = null;
        for (const arm of arms) {
            const external = arm.latencyMs !== null;
            // Arm 1 has no step to model: it is the run the scaled one comes from.
            const stepMs = arm.everyFrame && !external ? null : scaledStepMs;
            let records;
            let jobs = [];
            let accounting = null;
            if (external) {
                ({ records, jobs, accounting } = runExternal(clip, arm, {
                    frames,
                    pts,
                    K,
                    options: OVERRIDES,
                    stepMs,
                    everyFrame: arm.everyFrame,
                    latencyMs: arm.latencyMs,
                    acquireMs,
                }));
            } else {
                records = replay({
                    clip,
                    frames,
                    pts,
                    K,
                    mode: "tracking",
                    stepMs,
                    order: null,
                    loops: M3_LOOPS,
                    acquireMs,
                    unwrapped: true,
                });
            }
            const e = armExport({
                clip,
                width,
                height,
                arm: { ...arm, external },
                records,
                jobs,
                accounting,
                stepMs,
                acquireMs,
                clipDurationS,
                model: { latencyMs: arm.latencyMs, acquireMs, detectMs: DEVICE_DETECT_MS },
            });
            if (scaledStepMs === null) {
                // This configuration's own step, on the device: arm 1's
                // every-frame p50 here, times the measured device ÷ desktop ratio.
                scaledStepMs = (e.runSummary.trackStepMs.p50 ?? 0) * DEVICE_RATIO;
            }
            console.log(externalRow(clip, width, height, e));
            writeExport(clip, arm, e);
        }
        console.log(
            `\n${clip}: the scaled step is ${fmt(scaledStepMs, 1)} ms (every-frame trackStepMs p50 × ${DEVICE_RATIO})\n`,
        );
    }
}

/**
 * XORed into the seed for the latency draws' own stream, so that they neither
 * consume nor shift the RANSAC draws' (`Math.random`, seeded from the seed
 * itself).
 */
const LATENCY_STREAM = 0x9e3779b9;

/**
 * A function that draws one of `samples`, with replacement, each call: the same
 * draws, in the same order, for the same seed.
 */
function latencyDrawer(samples) {
    const random = mulberry32(SEED ^ LATENCY_STREAM);
    return () => samples[Math.floor(random() * samples.length)];
}

/**
 * The `*.json` files of `dir` (its files, not its subdirectories) as
 * `{ name, e }`, in name order: the order the samples are drawn from. Exits 2,
 * a usage error, on a directory it cannot read, and 1 on a file that is not
 * JSON, one line naming it.
 */
function readTransferDir(dir) {
    let names;
    try {
        names = readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
            .map((entry) => entry.name)
            .sort();
    } catch (err) {
        usage(`--transfer: cannot read ${dir}: ${err.code ?? err.message}`);
    }
    return names.map((name) => {
        try {
            return { name, e: JSON.parse(readFileSync(join(dir, name), "utf8")) };
        } catch (err) {
            const why = String(err.message).split("\n")[0];
            console.error(`replay-clips: --transfer ${dir}: ${name} is not readable JSON: ${why}`);
            process.exit(1);
        }
    });
}

/**
 * `--transfer`: on each clip the session exported, two arms on the device
 * schedule, each `replayExternal` with what that mode's exports measured
 * (`transferPlan`): the latency of every job drawn with replacement from its
 * samples, the acquisition, and the step. Sync first, then worker, and per
 * clip the difference in `trackTimeShare`, worker minus sync, in points.
 * Everything a directory can get wrong (its files, its target, a worker run's
 * accounting, a mode with nothing to draw) is refused before the first clip is
 * decoded.
 */
async function transferArms() {
    const files = readTransferDir(TRANSFER_DIR);
    const plan = transferPlan(files, { clips: CLIPS, sha256: targetRec.sha256 });
    for (const { name, why } of plan.skipped) console.log(`skipped ${name}: ${why}`);
    if (plan.refusal) {
        console.error(`replay-clips: --transfer ${TRANSFER_DIR}: ${plan.refusal}`);
        process.exit(1);
    }
    const seedNote = arg("--seed") === null ? " (the default: --seed was not given)" : "";
    console.log(
        `latency transfer from ${TRANSFER_DIR}: ${files.length - plan.skipped.length} page exports; each job's latency drawn with replacement from its mode's samples, counted from the post, seed ${SEED}${seedNote}; each mode's acquisition (acquire + gray p50 on frames that are not TRACK) and tracking step (trackMs p50 on TRACK frames) from its own exports; the device schedule; ${M3_LOOPS} loops a run, loop 0 warm-up, loops 1–${M3_COUNTED.loopCount} counted
`,
    );
    for (const { clip, sync, worker } of plan.clips) {
        for (const p of [sync, worker]) {
            const l = p.latency;
            const from = `${p.files.length} export${p.files.length === 1 ? "" : "s"} (${p.files.join(", ")})`;
            console.log(
                `${clip}, ${p.path}: ${from}; latency n ${l.n}, p50 ${fmt(l.p50, 1)} / p95 ${fmt(l.p95, 1)} ms; acquisition ${fmt(p.acquireMs, 1)} ms; step ${fmt(p.stepMs, 1)} ms`,
            );
        }
    }
    console.log("");
    console.log(tableHead([...TABLE_COLUMNS, ...EXTERNAL_COLUMNS]));
    for (const { clip, sync, worker } of plan.clips) {
        const { frames, pts, width, height } = await loadClip(clip);
        const K = intrinsics(width, height);
        const clipDurationS = loopPeriod(pts);
        const shares = {};
        for (const p of [sync, worker]) {
            const arm = {
                schedule: `device, ${p.path}'s measured latencies`,
                path: p.path,
                external: true,
            };
            const { records, jobs, accounting } = runExternal(clip, arm, {
                frames,
                pts,
                K,
                options: OVERRIDES,
                stepMs: p.stepMs,
                everyFrame: false,
                latencyMs: latencyDrawer(p.latencyMs),
                acquireMs: p.acquireMs,
            });
            const e = armExport({
                clip,
                width,
                height,
                arm,
                records,
                jobs,
                accounting,
                stepMs: p.stepMs,
                acquireMs: p.acquireMs,
                clipDurationS,
                model: {
                    latencyMs: null,
                    drawnFrom: { files: p.files, ...p.latency },
                    acquireMs: p.acquireMs,
                    detectMs: null,
                },
            });
            console.log(externalRow(clip, width, height, e));
            writeExport(clip, { schedule: `transfer, ${p.path}` }, e);
            shares[p.path] = e.runSummary.trackTimeShare.share;
        }
        const points = 100 * (shares.worker - shares.sync);
        console.log(
            `\n${clip}: trackTimeShare worker ${pct(shares.worker)} against sync ${pct(shares.sync)}: worker minus sync ${points >= 0 ? "+" : ""}${fmt(points, 1)} points\n`,
        );
    }
}

console.log(
    `Node ${process.version}, ${process.platform}/${process.arch}, ${cpus()[0]?.model ?? "unknown CPU"}\n`,
);

const sequencePath = arg("--sequence");
if (sequencePath) {
    /** One line on stderr, and exit: a refusal is not a crash. */
    const refuse = (why, code = 1) => {
        console.error(`cannot replay ${sequencePath}: ${why}`);
        process.exit(code);
    };
    let e;
    try {
        e = JSON.parse(readFileSync(sequencePath, "utf8"));
    } catch (err) {
        refuse(err.message, 2);
    }
    const why = sequenceRefusal(e, {
        metricsVersion: METRICS_VERSION,
        sha256: targetRec.sha256,
        clips: CLIPS,
    });
    if (why) refuse(why);
    // The export's own box and tracker options, so the replay does the device's work.
    const settings = sequenceSettings(e);
    const { frames, pts, width, height } = await loadClip(e.bundledClip, settings.box);
    if (width !== e.processingResolution.width || height !== e.processingResolution.height) {
        refuse(
            `its box ${settings.box.width}x${settings.box.height} fits the clip to ${width}x${height} here, but it ran at ${e.processingResolution.width}x${e.processingResolution.height}`,
        );
    }
    let order;
    try {
        order = framesAt(
            pts,
            e.frames.map((f) => f.mediaTimeSeconds),
        );
    } catch (err) {
        refuse(err.message);
    }
    const K = intrinsics(width, height);
    const replayed = () =>
        summarizeRun(
            replay({
                clip: e.bundledClip,
                frames,
                pts,
                K,
                mode: "tracking",
                stepMs: null,
                order,
                options: settings.trackerOptions,
            }),
        ).trackStepMs;
    replayed(); // warm-up
    const runs = [replayed(), replayed(), replayed()];
    const here = runs.every((s) => s.n > 0)
        ? {
              n: runs[0].n,
              p50: stats(runs.map((s) => s.p50)).p50,
              p95: stats(runs.map((s) => s.p95)).p50,
          }
        : { n: 0, p50: null, p95: null };
    // Recomputed from the export's frames, by this module's definition.
    const device = summarizeRun(e.frames).trackStepMs;
    console.log(
        `${sequencePath}: ${e.frames.length} frames of ${e.bundledClip}, replayed 3 times after a warm-up`,
    );
    console.log(
        `trackStepMs p50 / p95 — device ${fmt(device.p50)} / ${fmt(device.p95)} (n ${device.n}); here, median of 3: ${fmt(here.p50)} / ${fmt(here.p95)} (n ${here.n})`,
    );
    const ratio = proxyRatio(device, here);
    if (ratio === null) refuse("no TRACK frames on one side, so no ratio");
    console.log(`device ÷ here, p50: ${fmt(ratio)}`);
    process.exit(0);
}

const outDir = arg("--out");
if (outDir) mkdirSync(outDir, { recursive: true });
const patchTable = target.patches;
console.log(
    `target ${targetFile} (sha256 ${targetRec.sha256.slice(0, 12)}…): ${patchTable ? `${patchTable.count} patches of ${patchTable.patchSize} × ${patchTable.patchSize}` : "no patches"}; options ${Object.keys(OVERRIDES).length > 0 ? JSON.stringify(OVERRIDES) : "defaults"}; seed ${SEED ?? "none"}${TRANSFER_DIR === null ? `; device ratio ${DEVICE_RATIO}` : ""}
`,
);
if (TRANSFER_DIR !== null) {
    await transferArms();
    process.exit(0);
}
if (EXTERNAL_MS !== null) {
    await externalArms();
    process.exit(0);
}
console.log(tableHead(TABLE_COLUMNS));
const probeRows = [];
const runs = TRACKING_ONLY ? RUNS.filter((r) => r.mode === "tracking") : RUNS;
for (const clip of CLIPS) {
    const { frames, pts, width, height } = await loadClip(clip);
    const K = intrinsics(width, height);
    const exports = [];
    let probeSummary = null;
    for (const planned of runs) {
        const everyFrameTracking = planned.mode === "tracking" && planned.stepMs === null;
        let run = planned;
        if (planned.stepMs === "scaled") {
            // This configuration's own step, on the device: its every-frame
            // p50 here, times the measured device ÷ desktop ratio.
            const p50 = exports[0].runSummary.trackStepMs.p50 ?? 0;
            const stepMs = p50 * DEVICE_RATIO;
            run = { ...planned, stepMs, schedule: `device, scaled step (${fmt(stepMs, 1)} ms)` };
        }
        const probe =
            everyFrameTracking && target.patches ? createStepProbe(target, OVERRIDES) : null;
        const records = replay({
            clip,
            frames,
            pts,
            K,
            mode: run.mode,
            stepMs: run.stepMs,
            order: null,
            probe,
        });
        const e = exportOf(clip, run, { width, height }, records);
        // Every export names the configuration that produced it, whether or
        // not the probe ran on it.
        e.trackerOptions = OVERRIDES;
        e.seed = SEED;
        if (probe) {
            probeSummary = probe.summary();
            e.tuningProbe = probeSummary;
        }
        exports.push(e);
        console.log(tableRow(clip, width, height, run, e.runSummary));
        writeExport(clip, planned, e);
    }
    if (probeSummary) {
        probeRows.push({
            clip,
            s: exports[0].runSummary,
            p: probeSummary,
            attempted: stats(
                exports[0].frames.filter((f) => f.tracking).map((f) => f.tracking.attempted),
            ),
        });
    }
    const firstStepLosses = exports[0].frames.filter(
        (f, i, all) => f.trackLoss && i > 0 && all[i - 1].state === "DETECT",
    );
    const note = [];
    if (firstStepLosses.length > 0) {
        note.push(
            `first-step losses (every frame): ${firstStepLosses.length}; observed patches p50 ${stats(firstStepLosses.map((f) => f.tracking.observed)).p50}, culled p50 ${stats(firstStepLosses.map((f) => f.tracking.culled)).p50} of ${target.patches.count}`,
        );
    }
    const byRun = (mode, prefix) =>
        exports.find((e) => e.mode === mode && e.schedule.startsWith(prefix));
    if (clip === "pinball-static.mp4" && !TRACKING_ONLY) {
        for (const [a, b, label] of [
            [
                byRun("tracking", "every frame"),
                byRun("detection-only", "every frame"),
                "every frame, both modes",
            ],
            [
                byRun("tracking", "device, 15"),
                byRun("detection-only", "device"),
                "device schedules (tracking 15 ms step)",
            ],
            [
                byRun("tracking", "device, 25"),
                byRun("detection-only", "device"),
                "device schedules (tracking 25 ms step)",
            ],
            [
                byRun("tracking", "device, scaled"),
                byRun("detection-only", "device"),
                "device schedules (tracking scaled step)",
            ],
        ]) {
            const r = compareExports(a, b);
            note.push(
                `aligned, ${label}: ${r.commonMediaTimes} common media times — jitterPx tracking ${fmt(r.first.jitterPx, 3)}, detection-only ${fmt(r.second.jitterPx, 3)} (÷ ${fmt(r.second.jitterPx / r.first.jitterPx)}); spreadPx ${fmt(r.first.spreadPx, 3)}, ${fmt(r.second.spreadPx, 3)}`,
            );
        }
    }
    for (const line of note)
        console.log(`
${clip}: ${line}`);
    console.log("");
}

if (probeRows.length > 0) {
    console.log(
        `Step probe, every-frame tracking run (right: within 1 px of the accepted fit; gate: minPatchZncc ${OVERRIDES.minPatchZncc ?? "default"})
`,
    );
    console.log(
        "| clip | steps | attempted p50 | alignMs p50 / p95 | µs per attempted patch p50 / p95 | align iterations p50 / p95 / max | unconverged (their share of iterations) | right: iterations p50 / p95 / p99 | right needing > 8 / 10 / 15 / 20 | right alignments | ZNCC of right p1 / p5 / p50 | right, refused by the gate | observed off the fit | too-few-patches first / held | observed at those p50 / max | culled at those p50 | winnable by a lower minimum |",
    );
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const { clip, s, p, attempted } of probeRows) {
        const t = p.tooFewPatches;
        console.log(
            `| ${clip} | ${p.steps} | ${attempted.p50 ?? "—"} | ${fmt(s.alignMs.p50)} / ${fmt(s.alignMs.p95)} | ${fmt(p.perPatchUs.p50, 1)} / ${fmt(p.perPatchUs.p95, 1)} | ${p.alignIterations.p50 ?? "—"} / ${p.alignIterations.p95 ?? "—"} / ${p.alignIterations.max ?? "—"} | ${pct(p.unconvergedShare)} (${pct(p.iterationsOnUnconverged)}) | ${p.rightIterations.p50 ?? "—"} / ${p.rightIterations.p95 ?? "—"} / ${p.rightIterationsP99 ?? "—"} | ${[8, 10, 15, 20].map((k) => pct(p.rightNeedingMoreThan[k])).join(" / ")} | ${p.right} | ${fmt(p.rightZnccP1, 3)} / ${fmt(p.rightZnccP5, 3)} / ${fmt(p.rightZncc.p50, 3)} | ${p.rightRejected} | ${p.observedOffFit} | ${t.first} / ${t.held} | ${t.observed.p50 ?? "—"} / ${t.observed.max ?? "—"} | ${t.culled.p50 ?? "—"} | ${t.winnableByLowerMinimum} |`,
        );
    }
}
