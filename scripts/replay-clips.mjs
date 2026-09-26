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
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    createJsfeatNextBackend,
    intrinsics,
} from "../packages/cv-backend-jsfeatnext/dist/index.js";
import { decode, NftTracker } from "../packages/nft-tracker/dist/index.js";
import {
    compareExports,
    framesAt,
    frameRecord,
    METRICS_VERSION,
    nextFrameIndex,
    proxyRatio,
    sequenceRefusal,
    sequenceSettings,
    sha256Hex,
    stats,
    summarizeRun,
    targetCorners,
    targetRecord,
} from "../examples/js/bench-metrics.mjs";
import { fitSize } from "../examples/js/pinball-shared.mjs";

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
const LOOPS = 2;
const RUNS = [
    { mode: "tracking", schedule: "every frame", stepMs: null },
    { mode: "tracking", schedule: "device, 15 ms step", stepMs: 15 },
    { mode: "tracking", schedule: "device, 25 ms step", stepMs: 25 },
    { mode: "detection-only", schedule: "every frame", stepMs: null },
    { mode: "detection-only", schedule: "device", stepMs: 0 },
];

const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? process.argv[i + 1] : null;
};

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
const wnft = readFileSync(join(EXAMPLES, "targets/pinball.wnft"));
const decoded = decode(new Uint8Array(wnft));
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const target = decoded.target;
const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
const targetRec = targetRecord({
    source: "wnft",
    file: "targets/pinball.wnft",
    sha256: await sha256Hex(wnft),
    db: target,
});

/**
 * One replay: `order` is the frame indices to process, or null for the device
 * schedule over `LOOPS` loops; `options` are the tracker's (its defaults unless
 * an export recorded others).
 */
function replay({ clip, frames, pts, K, mode, stepMs, order, options = {} }) {
    const tracker = new NftTracker(cv, target, K, {
        ...options,
        detectionOnly: mode === "detection-only",
        clock: () => performance.now(),
    });
    const records = [];
    const push = (i) => {
        const result = tracker.process(frames[i], pts[i] * 1000);
        records.push(
            frameRecord({
                mode,
                result,
                stageTimings: {},
                timestampMs: pts[i] * 1000,
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
    // LOOPS loops on one continuous timeline, as the page's looping <video> plays them.
    const period = pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);
    const times = Array.from(
        { length: LOOPS * pts.length },
        (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period,
    );
    for (let k = 0; k < times.length; ) {
        const result = push(k % pts.length);
        if (stepMs === null) {
            k++;
            continue;
        }
        const busy =
            DEVICE_ACQUIRE_MS[clip] +
            (result.tracking ? stepMs : 0) +
            (result.state === "TRACK" ? 0 : DEVICE_DETECT_MS);
        k = nextFrameIndex(times, k, busy);
    }
    return records;
}

const exportOf = (clip, run, res, records) => ({
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
    runSummary: summarizeRun(records),
    frames: records,
});

const fmt = (v, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));
const pct = (v) => (v === null ? "—" : `${(100 * v).toFixed(1)}%`);
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
console.log(
    "| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost (at wraps) | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | fit iterations p50 | quality min | quality ≤ 0.20 | jitterPx | spreadPx |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const clip of CLIPS) {
    const { frames, pts, width, height } = await loadClip(clip);
    const K = intrinsics(width, height);
    const exports = [];
    for (const run of RUNS) {
        const records = replay({
            clip,
            frames,
            pts,
            K,
            mode: run.mode,
            stepMs: run.stepMs,
            order: null,
        });
        const e = exportOf(clip, run, { width, height }, records);
        exports.push(e);
        const s = e.runSummary;
        const losses =
            Object.entries(s.lockLosses)
                .map(([k, v]) => `${k} ${v}`)
                .join(", ") || "—";
        const align = s.alignMs.n > 0 ? fmt(s.alignMs.p50 / s.trackStepMs.p50) : "—";
        console.log(
            `| ${clip}, ${width}×${height} | ${run.mode}, ${run.schedule} | ${s.frames} | ${pct(s.trackShare)} | ${s.reacquisitions} (${s.reacquisitionsAtLoopWrap}) | ${s.loopWraps} | ${s.firstSteps.confirmed} / ${s.firstSteps.n} | ${s.heldLockSteps.lost} / ${s.heldLockSteps.n} (${s.heldLockSteps.lostAtLoopWrap}) | ${losses} | ${fmt(s.trackStepMs.p50)} / ${fmt(s.trackStepMs.p95)} | ${align} | ${JSON.stringify(s.frameLevels)} | ${s.fits.capped} / ${s.fits.n} | ${s.fits.iterations.p50 ?? "—"} | ${fmt(s.quality.min)} | ${s.lowQualityTrackFrames} | ${fmt(s.jitterPx, 3)} | ${fmt(s.spreadPx, 3)} |`,
        );
        if (outDir) {
            const slug = `${clip.replace(/\.mp4$/, "")}-${run.mode}-${run.schedule.replace(/[^a-z0-9]+/gi, "-")}`;
            writeFileSync(join(outDir, `replay-${slug}.json`), JSON.stringify(e, null, 2));
        }
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
    if (clip === "pinball-static.mp4") {
        for (const [a, b, label] of [
            [0, 3, "every frame, both modes"],
            [1, 4, "device schedules (tracking 15 ms step)"],
            [2, 4, "device schedules (tracking 25 ms step)"],
        ]) {
            const r = compareExports(exports[a], exports[b]);
            note.push(
                `aligned, ${label}: ${r.commonMediaTimes} common media times — jitterPx tracking ${fmt(r.first.jitterPx, 3)}, detection-only ${fmt(r.second.jitterPx, 3)} (÷ ${fmt(r.second.jitterPx / r.first.jitterPx)}); spreadPx ${fmt(r.first.spreadPx, 3)}, ${fmt(r.second.spreadPx, 3)}`,
            );
        }
    }
    for (const line of note) console.log(`\n${clip}: ${line}`);
    console.log("");
}
