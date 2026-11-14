/*
 *  2026-11-13-262-stage1-probe.mjs
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
 * #262, M10's Stage 1: TEBLID-256 against ORB on seeded desktop replays of the bundled clips.
 * A probe, not campaign data (docs/benchmarks/step-protocol.md, Stage 1). Writes one JSON per
 * run into <out>, and prints nothing a figure is read from: the figures are
 * `2026-11-13-262-stage1-analysis.mjs`'s, over <out>.
 *
 *     npm run build
 *     node docs/benchmarks/2026-11-13-262-stage1-probe.mjs arms --out <dir> [--schedule every|device-15|device-25] [--clips table,wall] [--seeds 1-8] [--ratios 0.8] [--arms orb,teblid]
 *     node docs/benchmarks/2026-11-13-262-stage1-probe.mjs stateless --out <dir> [--mirror] [--clips …] [--seeds …] [--ratios …] [--arms …]
 *     node docs/benchmarks/2026-11-13-262-stage1-probe.mjs gms --out <dir> [--clips …] [--seeds …] [--arms …]
 *     node docs/benchmarks/2026-11-13-262-stage1-probe.mjs check-orb --out <dir> --rreplay <R-replay run dir>
 *     node docs/benchmarks/2026-11-13-262-stage1-probe.mjs frame-hashes --out <dir> [--clips …]
 *
 * ffmpeg and ffprobe must be on PATH. `check-orb` writes <out>/check-orb.json on a pass, which the
 * analysis requires before it reads any figure.
 *
 * Clips: `static`, `wall` (pinball-bench.mp4), `table` (pinball-bench-table.mp4), `cross`
 * (pinball-tilt-cross.mp4), decoded as `scripts/replay-clips.mjs` decodes them (ffmpeg, bilinear,
 * the page's Rec. 601 luma, the page's 480 × 360 box; `probe` and `greyFrames` are copied from
 * that script, which exports neither).
 *
 * - **arms**: `NftTracker` through `scripts/replay-run.mjs`'s `replayRun`, the replay's
 *   "every frame" tracking schedule, or with `--schedule device-15|device-25` its device schedules
 *   (`DEVICE_ACQUIRE_MS` below); two loops, each frame stamped `pts[i] * 1000`, seeded with
 *   `runSeeding(seed, "frame")`; tracker options `{ ratio }` and nothing else. ORB is the jsfeatNext
 *   backend on `examples/targets/pinball.wnft`; TEBLID is `teblidBackend` on `teblidTarget`
 *   (`2026-11-13-262-teblid-backend.mjs`), built from `examples/images/pinball.jpg`. Each frame
 *   record is `frameRecord`'s, plus `stages`, the detection stages' desktop wall time on it.
 * - **stateless**: `detectTarget` on every frame of one loop, no lock, `frameRng(seed, pts[i])`, each
 *   frame's detection-stage desktop times in `stages`, after one discarded warm-up pass per arm.
 *   With `--mirror`, on the frames mirrored left to right (files `mirror-*.json`): a textured
 *   negative, since a mirrored target is seen from behind and any accepted `H` is wrong.
 * - **gms**: on every frame of one loop, the scene described and matched per level two ways, (a)
 *   the ratio test at 0.8 as `detectTarget` does, (b) nearest neighbour (`match` with no ratio),
 *   each then `jsfeatNext.gms.filter` (scene the query image, the target's level-0 size the
 *   train image), at OpenCV's defaults and with rotation and scale; each set then through
 *   `estimateHomography` at the replay's threshold, seeded, and `detectTarget`'s two refusals
 *   (fewer than 5 inliers, not facing).
 * - **check-orb**: against **this machine's R-replay** (the probe file's "R-replay on this
 *   machine"): the arms' ORB run at seed 1, ratio 0.8, against
 *   `def/replay-<clip>-tracking-every-frame.json`, every frame key but `timings`, `trackerTimings`
 *   and the probe's `stages`, compared exactly; and the stateless ORB run at seed 1, ratio 0.8,
 *   against the first loop of `def/replay-<clip>-detection-only-every-frame.json`. Exit 1 on any
 *   difference.
 * - **frame-hashes**: the SHA-256 of the decoded frames, per clip and per frame, into
 *   <out>/frame-hashes.txt.
 *
 * Every run is refused (exit 1) if it reads the global `Math.random`.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import jsfeatNext from "@webarkit/jsfeat-next";
import { frameRecord, targetCorners } from "../../examples/js/bench-metrics.mjs";
import { frameRng } from "../../examples/js/frame-rng.mjs";
import { fitSize } from "../../examples/js/pinball-shared.mjs";
import { PAGE_PROCESSING_BOX } from "../../examples/js/bench-export-checks.mjs";
import { replayRun } from "../../scripts/replay-run.mjs";
import { countGlobalRandomReads, runSeeding, seedingRefusal } from "../../scripts/replay-seeding.mjs";
import { STAGES, teblidBackend, teblidTarget, timedBackend } from "./2026-11-13-262-teblid-backend.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { createJsfeatNextBackend, intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
const nft = await load("packages/nft-tracker/dist/index.js");
const { grayFromJpegFile } = await load("packages/nft-tracker/bin/image.mjs");

export const CLIP_FILES = {
    static: "pinball-static.mp4",
    wall: "pinball-bench.mp4",
    table: "pinball-bench-table.mp4",
    cross: "pinball-tilt-cross.mp4",
};
const LOOPS = 2;
/**
 * The replay's device schedules (`scripts/replay-clips.mjs`, `DEVICE_ACQUIRE_MS`, `DEVICE_DETECT_MS`,
 * copied): acquire + gray p50 on Tab_9_WiFi per clip, the cross clip's borrowed from the static
 * clip's (`TILT_BORROWED_ACQUIRE_MS`), and one detection cost, 83.2 ms, for **both** arms: a model
 * of which frames a device would process, not TEBLID's cost.
 */
const DEVICE_ACQUIRE_MS = { static: 36.9, wall: 20.4, table: 41.0, cross: 36.9 };
const DEVICE_DETECT_MS = 83.2;
const SCHEDULES = { every: { stepMs: null, label: "every frame" }, "device-15": { stepMs: 15, label: "device, 15 ms step" }, "device-25": { stepMs: 25, label: "device, 25 ms step" } };
const RANSAC_THRESHOLD = 4;

function fail(why) {
    console.error(`262-stage1-probe: ${why}`);
    process.exit(1);
}

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i < 0) return fallback;
    const v = process.argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(`${name} needs a value`);
    return v;
}
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
function seedList(s) {
    const m = /^(\d+)-(\d+)$/.exec(s);
    if (m) return Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i);
    return list(s).map((x) => {
        if (!/^\d+$/.test(x)) fail(`--seeds: ${x}`);
        return +x;
    });
}

// Copied from scripts/replay-clips.mjs (`probe`, `greyFrames`), unchanged but for names.
function probeClip(path) {
    const json = JSON.parse(
        execFileSync(
            "ffprobe",
            ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path],
            { maxBuffer: 64 << 20 },
        ).toString(),
    );
    return { width: json.streams[0].width, height: json.streams[0].height, pts: json.frames.map((f) => Number(f.pts_time)) };
}
function greyFrames(path, width, height) {
    const rgb = execFileSync(
        "ffmpeg",
        ["-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf", `scale=${width}:${height}:flags=bilinear`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        { maxBuffer: 1 << 30 },
    );
    const n = width * height;
    const frames = [];
    for (let o = 0; o + 3 * n <= rgb.length; o += 3 * n) {
        const data = new Uint8Array(n);
        for (let i = 0, p = o; i < n; i++, p += 3) data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
        frames.push({ data, width, height });
    }
    return frames;
}
export function loadClip(name) {
    const file = CLIP_FILES[name];
    if (!file) fail(`unknown clip ${name}`);
    const path = join(ROOT, "examples", "videos", file);
    const { width: sw, height: sh, pts } = probeClip(path);
    const { width, height } = fitSize(sw, sh, PAGE_PROCESSING_BOX.width, PAGE_PROCESSING_BOX.height);
    const frames = greyFrames(path, width, height);
    if (frames.length !== pts.length) fail(`${file}: ${frames.length} frames, ${pts.length} timestamps`);
    return { file, frames, pts, width, height };
}

/** The two arms: backend and target. */
export async function buildArms() {
    const orbCv = await createJsfeatNextBackend();
    const wnft = readFileSync(join(ROOT, "examples/targets/pinball.wnft"));
    const decoded = nft.decode(new Uint8Array(wnft));
    if (!decoded.ok) fail(`pinball.wnft: ${decoded.error}`);
    const orbTargetDb = decoded.target;
    const teblidCv = teblidBackend(await createJsfeatNextBackend());
    // compile-target's default --max-side, which pinball.wnft records (`info.compiler.maxSide`).
    const maxSide = orbTargetDb.info?.compiler?.maxSide;
    if (maxSide !== 640) fail(`pinball.wnft records maxSide ${maxSide}, not 640`);
    const image = grayFromJpegFile(join(ROOT, "examples/images/pinball.jpg"), maxSide);
    // The image and keypoints are the ones the ORB set was described from: ORB on the same rows
    // must give the stored bytes. Fatal otherwise, before any run.
    {
        const set = orbTargetDb.descriptorSets[0];
        const kp = orbTargetDb.keypoints;
        const rows = Array.from(set.kpIndex, (i) => ({ x: kp.x[i], y: kp.y[i], score: kp.score[i], angle: kp.angle[i], level: kp.level[i] }));
        const again = orbCv.describe(image, rows);
        let same = 0;
        for (let r = 0; r < set.count; r++) {
            let eq = true;
            for (let b = 0; b < 32; b++) if (again.data[r * 32 + b] !== set.data[r * 32 + b]) eq = false;
            if (eq) same++;
        }
        if (same !== set.count) fail(`ORB re-described on pinball.jpg: ${same} of ${set.count} rows equal pinball.wnft's`);
        console.error(`target basis: ORB re-described on pinball.jpg at maxSide 640, ${same} of ${set.count} rows equal pinball.wnft's`);
    }
    const teblidTargetDb = teblidTarget(teblidCv, orbTargetDb, image);
    for (const cv of [orbCv, teblidCv]) {
        const r = seedingRefusal(cv);
        if (r) fail(r);
    }
    return {
        orb: { cv: orbCv, target: orbTargetDb },
        teblid: { cv: teblidCv, target: teblidTargetDb },
    };
}

function noGlobalRandom(what, run) {
    const { value, reads } = countGlobalRandomReads(run);
    if (reads !== 0) fail(`${what}: ${reads} read(s) of the global Math.random`);
    return value;
}

function runArms(out, clips, seeds, ratios, armNames, scheduleName) {
    const schedule = SCHEDULES[scheduleName];
    if (!schedule) fail(`--schedule: ${scheduleName}`);
    return (arms) => {
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            const K = intrinsics(clip.width, clip.height);
            for (const armName of armNames) {
                const arm = arms[armName];
                const targetPoints = targetCorners(arm.target.meta.widthPx, arm.target.meta.heightPx);
                for (const ratio of ratios) {
                    for (const seed of seeds) {
                        const sink = Object.fromEntries(STAGES.map((s) => [s, 0]));
                        const cv = timedBackend(arm.cv, sink);
                        const stages = [];
                        const probe = {
                            frame() {
                                stages.push({ ...sink });
                                for (const s of STAGES) sink[s] = 0;
                            },
                        };
                        const what = `${clipName} ${armName} ratio ${ratio} seed ${seed} ${scheduleName}`;
                        const records = noGlobalRandom(what, () =>
                            replayRun({
                                NftTracker: nft.NftTracker,
                                cv,
                                target: arm.target,
                                targetPoints,
                                detectMs: DEVICE_DETECT_MS,
                                frames: clip.frames,
                                pts: clip.pts,
                                K,
                                mode: "tracking",
                                stepMs: schedule.stepMs,
                                order: null,
                                options: { ratio },
                                probe,
                                loops: LOOPS,
                                acquireMs: DEVICE_ACQUIRE_MS[clipName],
                                unwrapped: false,
                                seeding: runSeeding(seed, "frame"),
                            }),
                        );
                        if (records.length !== stages.length) fail(`${what}: ${records.length} records, ${stages.length} stage rows`);
                        records.forEach((r, i) => (r.stages = stages[i]));
                        const doc = {
                            kind: "262-stage1-arm",
                            clip: clipName,
                            file: clip.file,
                            size: [clip.width, clip.height],
                            arm: armName,
                            ratio,
                            seed,
                            seedPolicy: "frame",
                            schedule: schedule.label,
                            scheduleName,
                            loops: LOOPS,
                            frames: records,
                        };
                        writeFileSync(join(out, `arm-${clipName}-${armName}-r${ratio}-s${seed}-${scheduleName}.json`), JSON.stringify(doc));
                        console.error(`wrote ${what}`);
                    }
                }
            }
        }
    };
}

/** A frame mirrored left to right: the target in it seen from behind, which no accepted `H` can show. */
function mirrored(f) {
    const data = new Uint8Array(f.data.length);
    for (let y = 0; y < f.height; y++)
        for (let x = 0; x < f.width; x++) data[y * f.width + x] = f.data[y * f.width + (f.width - 1 - x)];
    return { data, width: f.width, height: f.height };
}

function runStateless(out, clips, seeds, ratios, armNames, mirror) {
    return (arms) => {
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            if (mirror) clip.frames = clip.frames.map(mirrored);
            const prefix = mirror ? "mirror" : "stateless";
            for (const armName of armNames) {
                const arm = arms[armName];
                for (const ratio of ratios) {
                    const sink = Object.fromEntries(STAGES.map((s) => [s, 0]));
                    const cv = timedBackend(arm.cv, sink);
                    const setup = nft.prepareDetection(cv, arm.target, { ratio });
                    // A warm-up pass over the clip, discarded, so that no arm's timings are its cold start.
                    noGlobalRandom(`warm-up ${clipName} ${armName}`, () =>
                        clip.frames.forEach((frame, i) => nft.detectTarget(cv, setup, frame, clip.pts[i] * 1000, frameRng(0, clip.pts[i]))),
                    );
                    for (const seed of seeds) {
                        const what = `${prefix} ${clipName} ${armName} ratio ${ratio} seed ${seed}`;
                        const rows = noGlobalRandom(what, () =>
                            clip.frames.map((frame, i) => {
                                for (const s of STAGES) sink[s] = 0;
                                const d = nft.detectTarget(cv, setup, frame, clip.pts[i] * 1000, frameRng(seed, clip.pts[i]));
                                return {
                                    stages: { ...sink },
                                    t: clip.pts[i],
                                    ok: d.ok,
                                    reason: d.ok ? null : d.reason,
                                    numMatches: d.numMatches,
                                    numInliers: d.numInliers,
                                    H: d.ok ? Array.from(d.H) : null,
                                };
                            }),
                        );
                        writeFileSync(
                            join(out, `${prefix}-${clipName}-${armName}-r${ratio}-s${seed}.json`),
                            JSON.stringify({ kind: `262-stage1-${prefix}`, clip: clipName, arm: armName, ratio, seed, mirror, rows }),
                        );
                        console.error(`wrote ${what}`);
                    }
                }
            }
        }
    };
}

const toKp = (k) => new jsfeatNext.keypoint_t(k.x, k.y, 0, 0, -1);

function runGms(out, clips, seeds, armNames) {
    return (arms) => {
        for (const clipName of clips) {
            const clip = loadClip(clipName);
            for (const armName of armNames) {
                const arm = arms[armName];
                const setup = nft.prepareDetection(arm.cv, arm.target, {});
                const tKps = Array.from({ length: arm.target.keypoints.count }, (_, i) =>
                    toKp({ x: arm.target.keypoints.x[i], y: arm.target.keypoints.y[i] }),
                );
                const tSize = { width: arm.target.meta.widthPx, height: arm.target.meta.heightPx };
                for (const seed of seeds) {
                    const what = `gms ${clipName} ${armName} seed ${seed}`;
                    const rows = noGlobalRandom(what, () =>
                        clip.frames.map((frame, i) => {
                            const scene = arm.cv.detect(frame, { levels: setup.sceneLevels, maxKeypoints: setup.maxSceneKeypoints });
                            const desc = arm.cv.describe(frame, scene);
                            const sKps = scene.map(toKp);
                            const sSize = { width: frame.width, height: frame.height };
                            const sets = {
                                ratio: nft.matchPerLevel(arm.cv, desc, setup.levels, setup.ratio),
                                nn: nft.matchPerLevel(arm.cv, desc, setup.levels, undefined),
                            };
                            const gms = (m, rot) =>
                                jsfeatNext.gms.filter(
                                    sSize,
                                    tSize,
                                    sKps,
                                    tKps,
                                    m.map((x) => new jsfeatNext.match_t(x.queryIdx, x.trainIdx, x.distance)),
                                    rot,
                                    rot,
                                ).map((x) => ({ queryIdx: x.queryIdx, trainIdx: x.trainIdx }));
                            sets.ratioGms = gms(sets.ratio, false);
                            sets.ratioGmsRS = gms(sets.ratio, true);
                            sets.nnGms = gms(sets.nn, false);
                            sets.nnGmsRS = gms(sets.nn, true);
                            const row = { t: clip.pts[i] };
                            for (const [k, m] of Object.entries(sets)) {
                                const r = { n: m.length, ok: false, inliers: 0, accepted: false, H: null };
                                if (m.length >= 4) {
                                    const src = new Float64Array(m.length * 2);
                                    const dst = new Float64Array(m.length * 2);
                                    m.forEach((x, j) => {
                                        src[2 * j] = setup.keypointX[x.trainIdx];
                                        src[2 * j + 1] = setup.keypointY[x.trainIdx];
                                        dst[2 * j] = scene[x.queryIdx].x;
                                        dst[2 * j + 1] = scene[x.queryIdx].y;
                                    });
                                    const h = arm.cv.estimateHomography(src, dst, { threshold: RANSAC_THRESHOLD, rng: frameRng(seed, clip.pts[i]) });
                                    r.ok = h.ok;
                                    r.inliers = h.numInliers;
                                    r.accepted = h.ok && h.numInliers >= nft.MIN_DETECTION_INLIERS && nft.targetSide(h.H, setup.grid) === "facing";
                                    r.H = r.accepted ? Array.from(h.H) : null;
                                }
                                row[k] = r;
                            }
                            return row;
                        }),
                    );
                    writeFileSync(join(out, `gms-${clipName}-${armName}-s${seed}.json`), JSON.stringify({ kind: "262-stage1-gms", clip: clipName, arm: armName, seed, rows }));
                    console.error(`wrote ${what}`);
                }
            }
        }
    };
}

/** R-replay's every-frame tracking export against this script's ORB run, seed 1, ratio 0.8. */
function checkOrb(out, rreplay) {
    const SLUG = { static: "pinball-static", wall: "pinball-bench", table: "pinball-bench-table" };
    let compared = 0;
    for (const [clip, slug] of Object.entries(SLUG)) {
        const mine = join(out, `arm-${clip}-orb-r0.8-s1-every.json`);
        if (!existsSync(mine)) fail(`check-orb: ${mine} missing; run arms with --clips ${clip} --arms orb --seeds 1 --ratios 0.8`);
        const ref = JSON.parse(readFileSync(join(rreplay, "def", `replay-${slug}-tracking-every-frame.json`), "utf8"));
        const got = JSON.parse(readFileSync(mine, "utf8"));
        if (ref.frames.length !== got.frames.length) fail(`check-orb ${clip}: ${ref.frames.length} frames in R-replay, ${got.frames.length} here`);
        const strip = (f) => {
            const { timings, trackerTimings, stages, ...rest } = f;
            return JSON.stringify(rest);
        };
        // The comparison exercised both ways on this clip's first frame: equal to a copy of
        // itself, unequal with one field changed.
        {
            const altered = { ...got.frames[0], numInliers: got.frames[0].numInliers + 1 };
            if (strip(got.frames[0]) !== strip({ ...got.frames[0] }) || strip(altered) === strip(got.frames[0]))
                fail(`check-orb ${clip}: the frame comparison does not respond`);
        }
        ref.frames.forEach((f, i) => {
            if (strip(f) !== strip(got.frames[i])) fail(`check-orb ${clip}: frame ${i} differs`);
        });
        compared += ref.frames.length;
        console.log(`check-orb ${clip}: ${ref.frames.length} frames equal to this machine's R-replay, ${slug} every-frame tracking export`);
        // Stateless ORB at seed 1 against the detection-only every-frame export's first loop.
        const st = join(out, `stateless-${clip}-orb-r0.8-s1.json`);
        if (!existsSync(st)) fail(`check-orb: ${st} missing; run stateless with --clips ${clip} --arms orb --seeds 1 --ratios 0.8`);
        const rows = JSON.parse(readFileSync(st, "utf8")).rows;
        const det = JSON.parse(readFileSync(join(rreplay, "def", `replay-${slug}-detection-only-every-frame.json`), "utf8")).frames;
        if (det.length < rows.length) fail(`check-orb ${clip}: the detection-only export holds ${det.length} frames, the stateless run ${rows.length}`);
        rows.forEach((r, i) => {
            const f = det[i];
            const same =
                f.mediaTimeSeconds === r.t && f.ok === r.ok && f.numMatches === r.numMatches && f.numInliers === r.numInliers &&
                JSON.stringify(f.H) === JSON.stringify(r.H) && (f.ok || f.reason === r.reason);
            if (!same) fail(`check-orb ${clip}: stateless frame ${i} differs from the detection-only export`);
        });
        compared += rows.length;
        console.log(`check-orb ${clip}: ${rows.length} stateless frames equal to this machine's R-replay, ${slug} detection-only every-frame export, first loop`);
    }
    console.log(`check-orb: ${compared} frames, all equal to this machine's R-replay (not 98323f06…, the reference of the machine that produced it)`);
    writeFileSync(join(out, "check-orb.json"), JSON.stringify({ passed: true, frames: compared, rreplay }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
const [mode] = process.argv.slice(2);
const out = arg("--out", null);
if (!out) fail("--out <dir> is required");
mkdirSync(out, { recursive: true });
const clips = list(arg("--clips", "table,wall"));
const seeds = seedList(arg("--seeds", "1-8"));
const ratios = list(arg("--ratios", "0.8")).map(Number);
const armNames = list(arg("--arms", "orb,teblid"));
for (const r of ratios) if (!(r > 0 && r <= 1)) fail(`--ratios: ${r}`);
for (const a of armNames) if (a !== "orb" && a !== "teblid") fail(`--arms: ${a}`);

if (mode === "frame-hashes") {
    // The frames the replay feeds the tracker, as loadClip decodes them: per clip, the SHA-256 of
    // every frame's grey bytes in order, and of each frame alone (into <out>/frame-hashes.txt).
    const { createHash } = await import("node:crypto");
    const lines = [];
    for (const name of clips) {
        const c = loadClip(name);
        const all = createHash("sha256");
        const per = c.frames.map((f) => {
            all.update(f.data);
            return createHash("sha256").update(f.data).digest("hex");
        });
        const head = `${c.file} ${c.width}x${c.height} ${c.frames.length} frames: ${all.digest("hex")}`;
        console.log(head);
        lines.push(head, ...per.map((h, i) => `  ${i} ${c.pts[i]} ${h}`));
    }
    writeFileSync(join(out, "frame-hashes.txt"), lines.join("\n") + "\n");
} else if (mode === "check-orb") {
    const rr = arg("--rreplay", null);
    if (!rr) fail("check-orb needs --rreplay <dir>");
    checkOrb(out, rr);
} else {
    const arms = await buildArms();
    if (mode === "arms") runArms(out, clips, seeds, ratios, armNames, arg("--schedule", "every"))(arms);
    else if (mode === "stateless") runStateless(out, clips, seeds, ratios, armNames, process.argv.includes("--mirror"))(arms);
    else if (mode === "gms") runGms(out, clips, seeds, armNames)(arms);
    else fail("mode: arms | stateless | gms | check-orb | frame-hashes");
}
}
