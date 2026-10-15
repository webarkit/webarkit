/*
 *  ambiguous-rate.mjs
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
 * The ambiguous-frame rate of IPPE's selection rule over the bundled clips,
 * headless, on this machine: the development measurement of
 * `docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md`, §7.
 *
 * **Not campaign data.** No device, no provenance, the instrument untouched,
 * never reported as a round. Its one purpose is the number #107 needs to
 * state the prediction and the refusal threshold for the per-run counter
 * before round 1's first counted run. The maintainer's reason for measuring
 * first: IPPE's ambiguity concentrates at near-fronto-parallel, small views,
 * and how long a hand-held target spends there is an empirical question.
 *
 * What it does, per clip in `examples/videos/`:
 * - `ffprobe` reads the clip's size; the processing size is the page's
 *   default box, 480 × 360, fitted as `pinball-shared.mjs`'s `fitSize` fits it
 *   (aspect preserved, both axes bounded, rounded);
 * - `ffmpeg` decodes every frame once, in media order, scaled to that size,
 *   as 8-bit RGB; the frame goes to grey by the page's Rec. 601 weights
 *   (`(r · 0.299 + g · 0.587 + b · 0.114) | 0`). ffmpeg's scaler is not the
 *   browser's `drawImage`, so the pixels are close to the page's, not equal;
 * - an `NftTracker` on the jsfeatNext backend, `K = intrinsics(width, height)`,
 *   the tracker's defaults, the shipped `examples/targets/pinball.wnft`,
 *   processes every frame;
 * - reported: frames, frames with a pose, ambiguous frames among them, split
 *   DETECT and TRACK, every selection outcome's count, and the rate.
 *
 * Imports the built `dist/`: `npm run build -w @webarkit/nft-tracker` first.
 * Needs `ffmpeg` and `ffprobe` on the PATH.
 *
 *   node packages/nft-tracker/scripts/ambiguous-rate.mjs [clip ...]
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { decode, NftTracker } from "../dist/index.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const VIDEOS = `${ROOT}examples/videos/`;
const TARGET = `${ROOT}examples/targets/pinball.wnft`;
/** The page's default processing box (`PROC_WIDTH`, `PROC_HEIGHT` in `examples/bench-nft.html`). */
const BOX = { width: 480, height: 360 };

/** `fitSize` of `examples/js/pinball-shared.mjs`, with both axes bounded. */
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
            "stream=width,height",
            "-of",
            "csv=p=0",
            path,
        ],
        { encoding: "utf8" },
    );
    const [w, h] = out.trim().split(",").map(Number);
    return { width: w, height: h };
}

/** Every frame of the clip as RGB at `size`, one buffer. */
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
    const frames = Math.floor(r.stdout.length / bytesPerFrame);
    return { rgb: r.stdout, frames, bytesPerFrame };
}

function toGray(rgb, offset, size) {
    const data = new Uint8Array(size.width * size.height);
    for (let i = 0, p = offset; i < data.length; i++, p += 3) {
        data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
    }
    return { data, width: size.width, height: size.height };
}

async function main() {
    const clips =
        process.argv.length > 2
            ? process.argv.slice(2)
            : readdirSync(VIDEOS)
                  .filter((f) => f.endsWith(".mp4"))
                  .sort()
                  .map((f) => VIDEOS + f);
    const decoded = decode(new Uint8Array(readFileSync(TARGET)));
    if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
    const cv = await createJsfeatNextBackend();

    for (const clip of clips) {
        const native = probe(clip);
        const size = fitSize(native.width, native.height, BOX.width, BOX.height);
        const { rgb, frames, bytesPerFrame } = decodeFrames(clip, size);
        const tracker = new NftTracker(cv, decoded.target, intrinsics(size.width, size.height));
        const counts = {
            frames,
            posed: 0,
            byState: { DETECT: { posed: 0, ambiguous: 0 }, TRACK: { posed: 0, ambiguous: 0 } },
            outcomes: {},
            rejected: 0,
        };
        for (let i = 0; i < frames; i++) {
            const result = tracker.process(toGray(rgb, i * bytesPerFrame, size), i * 33);
            if (!result.ok) continue;
            counts.posed++;
            const s = result.poseSelection;
            counts.outcomes[s.outcome] = (counts.outcomes[s.outcome] ?? 0) + 1;
            counts.rejected += s.rejected;
            counts.byState[result.state].posed++;
            if (s.ambiguous) counts.byState[result.state].ambiguous++;
        }
        const ambiguous = tracker.ambiguousFrames;
        const fallbacks = tracker.fallbackFrames;
        const rate = counts.posed === 0 ? null : ambiguous / counts.posed;
        console.log(
            JSON.stringify(
                {
                    clip: clip.slice(VIDEOS.length) || clip,
                    native,
                    processing: size,
                    frames,
                    posed: counts.posed,
                    ambiguous,
                    ambiguousRate: rate === null ? null : Number(rate.toFixed(4)),
                    fallbacks,
                    fallbackRate:
                        counts.posed === 0 ? null : Number((fallbacks / counts.posed).toFixed(4)),
                    byState: counts.byState,
                    outcomes: counts.outcomes,
                    depthRejections: counts.rejected,
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
