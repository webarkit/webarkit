/*
 *  jitter-dry-run.mjs
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

/**
 * STAGE 1 FEASIBILITY PROBE. Not campaign data. No provenance, no device,
 * never reportable as a round, and not to be confused with one by a later
 * reader: it runs on a desktop, on frames ffmpeg decoded, with both arms'
 * RANSAC seeded alike so that the two runs process identical frames.
 *
 * The question it answers (the maintainer's, 2026-10-15): does round 1's
 * registered metric, `jitterPx`, see M4's step 3 at all? The step changes
 * the pose; `jitterPx` reads the target's corners under each frame's `H`.
 * The accuracy crossover of `docs/benchmarks/2026-10-15-m4-step3-ippe-c4-characterisation.md`
 * says nothing about stability, so the link has to be measured, not inferred.
 *
 * What it does, per clip of the corpus:
 * - decodes every frame once as the headless runs of the characterisation do
 *   (the page's default box fitted as `fitSize` fits it, the page's Rec. 601
 *   weights), with media time `i / fps` from ffprobe's frame rate;
 * - runs the **control arm**, the tracker of `dev` built in a throwaway
 *   worktree (`--control <path to its nft-tracker/dist/index.js>`), and the
 *   **treatment arm**, this branch's tracker, each over the whole clip once,
 *   each under the same seeded `Math.random`, with the same backend, target,
 *   intrinsics and defaults;
 * - builds each run's frame records with the frozen metrics module's own
 *   `frameRecord`, and compares the two with its `compareExports`, on common
 *   media times, as the plan requires. The metric is imported, read-only,
 *   from `examples/js/bench-metrics.mjs`; nothing here reimplements it;
 * - splits the same comparison by tilt band, the band read from the
 *   **control arm's** pose on each frame (never the treatment's), with
 *   `cornerJitter` and its `include`, the module's own restriction mechanism;
 * - counts the frames on which the two arms' corners differ at all, since the
 *   treatment leaves `H` as it was and the difference is expected to be 0.
 *
 * Imports this package's built `dist/`: `npm run build -w @webarkit/nft-tracker`
 * first. Needs `ffmpeg` and `ffprobe` on the PATH.
 *
 *   node packages/nft-tracker/scripts/jitter-dry-run.mjs --control <dist/index.js of dev> [clip ...]
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import {
    compareExports,
    cornerJitter,
    frameRecord,
    mediaKey,
    METRICS_VERSION,
    targetCorners,
} from "../../../examples/js/bench-metrics.mjs";
import { decode, NftTracker as TreatmentTracker } from "../dist/index.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const VIDEOS = `${ROOT}examples/videos/`;
const TARGET = `${ROOT}examples/targets/pinball.wnft`;
const BOX = { width: 480, height: 360 };
const SEED = 20261015;
/** Tilt bands, degrees, read from the control arm's pose: the accuracy crossover is 7°–10°. */
const BANDS = [
    [0, 7],
    [7, 10],
    [10, 20],
    [20, 90],
];

const args = process.argv.slice(2);
const controlAt = args.indexOf("--control");
if (controlAt < 0 || !args[controlAt + 1]) {
    console.error(
        "usage: jitter-dry-run.mjs --control <path to dev's nft-tracker/dist/index.js> [clip ...]",
    );
    process.exit(2);
}
const controlPath = args[controlAt + 1];
const clipArgs = args.filter((a, i) => i !== controlAt && i !== controlAt + 1);

/** `fitSize` of `examples/js/pinball-shared.mjs`, both axes bounded. */
function fitSize(sourceW, sourceH, maxWidth, maxHeight) {
    const scale = Math.min(1, maxWidth / sourceW, maxHeight / sourceH);
    return {
        width: Math.max(1, Math.round(sourceW * scale)),
        height: Math.max(1, Math.round(sourceH * scale)),
    };
}

function probe(path) {
    const out = execFileSync(
        "ffprobe",
        [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate",
            "-of",
            "csv=p=0",
            path,
        ],
        { encoding: "utf8" },
    );
    const [w, h, rate] = out.trim().split(",");
    const [num, den] = rate.split("/").map(Number);
    return { width: Number(w), height: Number(h), fps: num / (den || 1) };
}

function decodeFrames(path, size) {
    const r = spawnSync(
        "ffmpeg",
        [
            "-v",
            "error",
            "-i",
            path,
            "-vf",
            `scale=${size.width}:${size.height}`,
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "pipe:1",
        ],
        { maxBuffer: 1 << 30 },
    );
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${path}: ${r.stderr}`);
    const bytesPerFrame = size.width * size.height * 3;
    return { rgb: r.stdout, frames: Math.floor(r.stdout.length / bytesPerFrame), bytesPerFrame };
}

function toGray(rgb, offset, size) {
    const data = new Uint8Array(size.width * size.height);
    for (let i = 0, p = offset; i < data.length; i++, p += 3) {
        data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
    }
    return { data, width: size.width, height: size.height };
}

/** mulberry32, as the tests' seeded_rng fixture: the same draws for both arms. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Tilt of a pose, degrees: the angle between the plane's normal and the optical axis. */
const tiltOf = (pose) => (Math.acos(Math.min(1, Math.max(-1, pose.R[8]))) * 180) / Math.PI;

/** One arm over one clip: the frame records, each with the arm's own pose tilt beside it. */
function runArm(Tracker, cv, target, K, clip, size, name) {
    const { rgb, frames, bytesPerFrame } = clip;
    const tracker = new Tracker(cv, target, K);
    const targetPoints = targetCorners(...target.pyramid.levelSizes[0]);
    const original = Math.random;
    Math.random = seeded(SEED);
    const records = [];
    const tilts = [];
    try {
        for (let i = 0; i < frames; i++) {
            const result = tracker.process(toGray(rgb, i * bytesPerFrame, size), i * 33);
            records.push(
                frameRecord({
                    mode: "tracking",
                    result,
                    stageTimings: {},
                    timestampMs: i * 33,
                    mediaTimeSeconds: i / clip.fps,
                    targetPoints,
                }),
            );
            tilts.push(result.ok ? tiltOf(result.pose) : null);
        }
    } finally {
        Math.random = original;
    }
    return {
        name,
        tilts,
        export: {
            frames: records,
            source: "file",
            bundledClip: clip.name,
            metricsVersion: METRICS_VERSION,
            processingResolution: size,
            clipDurationS: frames / clip.fps,
        },
    };
}

async function main() {
    const { NftTracker: ControlTracker } = await import(pathToFileURL(controlPath).href);
    const clips =
        clipArgs.length > 0
            ? clipArgs
            : readdirSync(VIDEOS)
                  .filter((f) => f.endsWith(".mp4"))
                  .sort()
                  .map((f) => VIDEOS + f);
    const decoded = decode(new Uint8Array(readFileSync(TARGET)));
    if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
    const cv = await createJsfeatNextBackend();

    for (const path of clips) {
        const native = probe(path);
        const size = fitSize(native.width, native.height, BOX.width, BOX.height);
        const clip = {
            ...decodeFrames(path, size),
            fps: native.fps,
            name: path.startsWith(VIDEOS) ? path.slice(VIDEOS.length) : path,
        };
        const K = intrinsics(size.width, size.height);
        const control = runArm(
            ControlTracker,
            cv,
            decoded.target,
            K,
            clip,
            size,
            "control (dev, closed form)",
        );
        const treatment = runArm(
            TreatmentTracker,
            cv,
            decoded.target,
            K,
            clip,
            size,
            "treatment (IPPE)",
        );

        const whole = compareExports(control.export, treatment.export);
        // Frames both arms posed whose corners differ at all: expected 0, H being untouched.
        const byKey = new Map(
            treatment.export.frames.map((f) => [mediaKey(f.mediaTimeSeconds), f]),
        );
        let differing = 0;
        let compared = 0;
        for (const f of control.export.frames) {
            const g = byKey.get(mediaKey(f.mediaTimeSeconds));
            if (!f.corners || !g?.corners) continue;
            compared++;
            if (JSON.stringify(f.corners) !== JSON.stringify(g.corners)) differing++;
        }
        // The same comparison by tilt band, the band from the control arm's pose.
        const bands = {};
        for (const [lo, hi] of BANDS) {
            const keys = new Set();
            control.export.frames.forEach((f, i) => {
                const t = control.tilts[i];
                if (t !== null && t >= lo && t < hi && f.corners)
                    keys.add(mediaKey(f.mediaTimeSeconds));
            });
            const include = (f) => keys.has(mediaKey(f.mediaTimeSeconds));
            const a = cornerJitter(control.export.frames, {
                include,
                clipDurationS: control.export.clipDurationS,
            });
            const b = cornerJitter(treatment.export.frames, {
                include,
                clipDurationS: treatment.export.clipDurationS,
            });
            bands[`${lo}-${hi}°`] = {
                frames: keys.size,
                control: { jitterPx: a.jitterPx, spreadPx: a.spreadPx, windows: a.jitterWindows },
                treatment: { jitterPx: b.jitterPx, spreadPx: b.spreadPx, windows: b.jitterWindows },
                jitterDifferencePx:
                    a.jitterPx === null || b.jitterPx === null ? null : b.jitterPx - a.jitterPx,
            };
        }
        console.log(
            JSON.stringify(
                {
                    clip: clip.name,
                    processing: size,
                    frames: clip.frames,
                    commonMediaTimes: whole.commonMediaTimes,
                    cornersCompared: compared,
                    cornersDiffering: differing,
                    control: {
                        jitterPx: whole.first.jitterPx,
                        spreadPx: whole.first.spreadPx,
                        windows: whole.first.jitterWindows,
                    },
                    treatment: {
                        jitterPx: whole.second.jitterPx,
                        spreadPx: whole.second.spreadPx,
                        windows: whole.second.jitterWindows,
                    },
                    jitterDifferencePx:
                        whole.first.jitterPx === null || whole.second.jitterPx === null
                            ? null
                            : whole.second.jitterPx - whole.first.jitterPx,
                    byControlTiltBand: bands,
                },
                null,
                2,
            ),
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
