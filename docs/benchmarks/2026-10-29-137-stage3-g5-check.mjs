/*
 *  2026-10-29-137-stage3-g5-check.mjs
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
 * #137's Stage 3 check copy of the Stage 1 pipeline probe, run at G5's implementation, whose
 * gate is in detectTarget: there the wrapper's G0, which never refuses, is the implemented gate.
 * Its G0 rows are what docs/benchmarks/2026-10-28-137-stage3-g5-registration.md's C1 and C2 read.
 * A desktop replay, headless, every frame processed: not campaign data. No file
 * under packages/<name>/src/ is changed; the candidates live in a probe-side
 * backend wrapper below.
 *
 *     npm ci && npm run build
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <replay dir>
 *     node docs/benchmarks/2026-10-29-137-stage3-g5-check.mjs --replay <replay dir> --out <run dir>
 *
 * The method, so that it can be redone without this file:
 *
 * 1. Decoding, copied from scripts/replay-clips.mjs (lines 440 to 507 at b31635d, `probe`,
 *    `greyFrames`, `loadClip`), which exports nothing: ffprobe's frame times, ffmpeg with
 *    `-fps_mode passthrough` and `scale=W:H:flags=bilinear` at the page's default box
 *    (`PAGE_PROCESSING_BOX`, fitted by `fitSize`, both imported), the page's Rec. 601 weights.
 *    The schedule is the same file's "every frame, sync" arm of `--external` (lines 541 to 551
 *    and 592 to 644): six loops of the clip, every frame processed in order, each stamped with
 *    its time on the loops' continuous timeline, loops 1 to 4 counted. The copy is proved, not
 *    asserted: G0 on seed 1 equals replay-clips' own export of that arm at --seed 1, frame by
 *    frame (check 4). The tracker gets no `clock`, so the per-frame rows carry no timings and
 *    are byte-identical between runs; the clock changes nothing else the tracker computes.
 * 2. The backend is cv-backend-jsfeatnext behind a wrapper (`wrapBackend`). Every method is
 *    delegated unchanged except `estimateHomography`, which adds `rng` to the options (one
 *    mulberry32 stream per run, created at its start, as replay-clips seeds `Math.random` once
 *    per run) and applies the run's candidate gate to an accepted fit. A refusal returns the
 *    backend's own failure shape, exactly (jsfeatnext_backend.ts, lines 565 to 570: a zeroed
 *    H, a zeroed mask of the input's length, numInliers 0, ok false), so detectTarget files it
 *    under `no-consensus` (detection.ts, lines 422 to 431) and the tracker makes the frame LOST
 *    with no lock (tracker.ts, lines 950 to 963 and 783 to 785), as it does a real RANSAC
 *    failure. The candidate's real count and verdict go to this script's own log.
 * 3. The candidates, each refusing an accepted fit (`h.ok`) when:
 *    - G0: never. Today's gate.
 *    - G5, G6, G8: numInliers < 5, < 6, < 8. G5 refuses exactly the minimal fits, #149's `X4`
 *      made a gate; G6 is `X6`; G8 is `X8`, the patch minimum (DEFAULT_MIN_TRACKED_PATCHES).
 *    - GH: the held-out score. S = the inliers by the returned mask, n = |S|. For each i in S,
 *      H₋ᵢ is fitted on S \ {i} by jsfeatNext's own `homography2d.run`, the kernel the
 *      backend's RANSAC uses, and eᵢ = ‖H₋ᵢ(srcᵢ) − dstᵢ‖ in frame px; a refit that `run`
 *      cannot produce, or a non-finite projection, is eᵢ = ∞. Refused when n < 5 (no held-out
 *      fit exists: reason "n<5") or when the median of eᵢ exceeds the RANSAC threshold the
 *      call was given (4 px, DEFAULT_RANSAC_THRESHOLD: reason "score"). A probe-side
 *      computation: the contract returns no minimal sample, and `find_homography` refits on the
 *      winning hypothesis's whole inlier set, so no correspondence the result reports was left
 *      out of its fit.
 *    - GP: `selectPose(H, K, inlier src, inlier dst, threshold, targetGrid(level-0 size))`
 *      returns `no-candidate-in-front`: the tracker's own call on that frame (tracker.ts, line
 *      985), made earlier. `degenerate` is counted, not refused.
 *    GE (#104's signal) is not a candidate: nothing in the record sets its thresholds. Its
 *    reading `conditioning(H, K)` is logged on every accepted fit and reported, post hoc, on
 *    G0's.
 * 4. The checks, all fatal: a failed check exits 1 naming what disagrees, and no figure is
 *    printed after it.
 *    1. The inputs' SHA-256: the clips, the target, the copied-from script, bench-metrics.mjs
 *       and every module it loads, and jsfeatNext's dist; and the code under test as trees
 *       (the three packages' src/, and the built JavaScript the probe imports).
 *    2. The backend declares `capabilities.deterministicRansac` true (#137's usage rule 1).
 *    3. Reads of the global `Math.random` during each run, with the RNG injected: zero (#137's
 *       usage rule 3; ADR-0001 point 7).
 *    4. G0 on seed 1 equals replay-clips' "every frame, sync" export at --seed 1, frame by
 *       frame: media time, timestamp, state, ok, inliers and corners. replay-clips seeds the
 *       global `Math.random`; the pre-probe check recorded in the .md showed injection and the
 *       global patch give identical runs. The export's packages must be the provenance
 *       manifest's bundle, built from a clean tree (its `packageSource`).
 *    5. Every candidate's seed 1 run twice: the per-frame rows and the gate log byte-identical.
 *    6. G0 reproduces #137's comment of 2026-10-16 (measured at 37dc6d4) at its printed
 *       precision: each seed's jitterPx, the detection locks per run in its stated range, and
 *       frame 0's state and inliers.
 *    7. The frames countedLoopFrames keeps are exactly loops 1 to 4 of the run by frame index;
 *       trackTimeShare is complete; the tracker's fallbackFrames equals the per-frame count of
 *       fallback selections; the DETECT frames of the counted loops equal the gate's accepted
 *       calls there; the threshold every call carried is DEFAULT_RANSAC_THRESHOLD; an accepted
 *       fit's mask marks numInliers correspondences; DEFAULT_MIN_TRACKED_PATCHES is 8.
 * 5. Per run, over the counted loops through the metrics module (summarizeRun, cornerJitter,
 *    countedLoopFrames, mediaKey, imported unchanged): states, posed frames, accepted
 *    detections by inlier count, refusals by reason, poses behind the camera (the selected
 *    pose's `inFront` on the 5 × 5 grid false), pose-selection outcomes, fallback selections,
 *    detection locks, reacquisitions, trackTimeShare, and jitterPx whole-set. Time to first
 *    lock is over the whole run: the first posed frame, its index and its time from the run's
 *    start. A candidate is compared with G0 of the same seed on two bases, side by side. The
 *    media-key basis is 2026-10-16-m3-handheld-frame-set.mjs's: counted frames, the media keys
 *    each run posed, pooled over the counted loops, their intersection, cornerJitter with
 *    `include`. The same-frame basis is exact here because both arms process the same frame
 *    indices: the counted frames, by index, at which both runs have corners. Against G0 of the
 *    same seed, also: G0's counted TRACK frames the candidate tracked too with the same
 *    corners, and the candidate's refusals at frames where G0 posed with corners.
 * 6. Stage 2's covariates, read on G0's runs only (the protocol's first rule on covariates):
 *    on its TRACK frames, the oracle's tilt (the backend's poseFromHomography on the frame's H,
 *    the angle whose cosine is R[2][2], as #137's body reads it), the target's area over the
 *    frame's (the corners' quadrilateral) and the motion since the previous TRACK frame (the
 *    four corners' mean displacement); on its accepted detections, the last TRACK frame before
 *    each (its inliers, tilt and area) and the time since it. Descriptive, seeds together.
 *
 * Timings go to stderr, so stdout is byte-identical between runs. Per-frame rows go to the run
 * directory (--out), one JSONL file per run, with runs.tsv; neither is committed (AGENTS.md,
 * "Test assets": desktop replays reproduce from the repository), and stdout prints their
 * SHA-256. The three clips run as three child processes of this script.
 *
 * A known limitation, as every derivation script's here: no test and no format check cover
 * docs/, so this script could break later while its figures stay in the record, and a defect
 * of its own would reproduce. Its guards are the checks above.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-10-29-137-stage3-g5-check.mjs";
const out = [];
const say = (line = "") => out.push(line);
function fatal(reason) {
    process.stderr.write(`${SCRIPT}: fatal: ${reason}\n`);
    process.exit(1);
}
const t0 = performance.now();
const lap = (what) => process.stderr.write(`${what}: ${(performance.now() - t0).toFixed(0)} ms\n`);

const HERE = dirname(fileURLToPath(import.meta.url));
// A scratch copy outside the repository names the checkout it reads with WEBARKIT_ROOT. The
// inputs are hashed below, so a wrong root fails rather than reading something else.
const ROOT = process.env.WEBARKIT_ROOT ? resolve(process.env.WEBARKIT_ROOT) : resolve(HERE, "..", "..");

// ---- arguments: every one required, none defaulted -----------------------------------------
const argv = process.argv.slice(2);
function arg(name) {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fatal(`${name} needs a value`);
    return v;
}
const REPLAY_DIR = arg("--replay");
const OUT_DIR = arg("--out");
const CHILD = arg("--child");
if (REPLAY_DIR === null) fatal("--replay <dir of replay-clips --external 70 --seed 1 --out> is required");
if (OUT_DIR === null) fatal("--out <run dir> is required");

// ---- the inputs and their hashes, at b31635d --------------------------------------------------
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const INPUTS = [
    ["examples/videos/pinball-static.mp4", "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6"],
    ["examples/videos/pinball-bench.mp4", "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d"],
    ["examples/videos/pinball-bench-table.mp4", "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d"],
    // AGENTS.md, the pinball.wnft bullet: the campaign's target.
    ["examples/targets/pinball.wnft", "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282"],
    // The decoding and the schedule below are copied from it.
    ["scripts/replay-clips.mjs", "b5652d67a4b603722f9e3150439e49fc05753525938da456c46d98a632e07bfa"],
    // The metric modules the figures come from: bench-metrics.mjs and every module it loads.
    ["examples/js/bench-metrics.mjs", "3b47b6e5cd88708c37dcba077f77d61f7e87f48dfa02f687d4b146db68b6bdf4"],
    ["examples/js/bench-definitions.mjs", "b564a07a692ef5ee2dbe9c0abb12e8cb52ac69c07a83dc95711fb5560e7b4a15"],
    ["examples/js/bench-detection.mjs", "51fa6c38bcb17f3fe63c57cfb5bbeab1585e9bc9dac742855ad82f26d0c84933"],
    ["examples/js/bench-export-checks.mjs", "26908ed6c51372f4f35d3c8f938133df2b3e50bcb731469316a5088bd62181ac"],
    ["examples/js/bench-frames.mjs", "c9584813cb6918c8a5db261af892e6eba0e0b02e3390b69d8c340a6f202bd0a3"],
    ["examples/js/bench-locks.mjs", "abb19729d5695f8a113a24251905788eb9c2ea79f9932cdd6ed9831ad9938ee8"],
    ["examples/js/bench-loops.mjs", "9ec8f930d765058e4ea6e4b8e8afa5a70c49e8833c0b6e2612850f0f5efa705b"],
    ["examples/js/bench-params.mjs", "d6872e90239c8b17ae4b388b128eb37ef55d77b3736af5a6cb0496b5ece1b5f3"],
    ["examples/js/bench-probe-replay.mjs", "70e06c83c3b327af3c7829ad5c0fd8676b858aca24af57fd971fe83191d604bf"],
    ["examples/js/bench-provenance.mjs", "501e22e2be521ad7625c8a56d4262589320e114d3fa430f1258040eb56b0b3da"],
    ["examples/js/bench-stats.mjs", "3f30574bda9503b04c54efc9bef57b9d497ab16f925026ff79228fa159a0338b"],
    ["examples/js/bench-summary.mjs", "623e2e7e9a381f0c78af2ff9057c598490bb443529757cfb5610b7a7dbd985bf"],
    ["examples/js/pinball-shared.mjs", "1c0c1adfcd0074e8d59fafcc7473f06920778240adcfba84f3f6f6d0ccf4b4bb"],
    // jsfeatNext as installed: the backend's RANSAC and GH's refit kernel.
    ["node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs", "6181e6a9a6b2bea8286cd0a641a38e4bcbf0ab72e13ba531ed15613ba6def0ac"],
];
/**
 * The code under test, as trees: every file under each directory, sorted by path, one line
 * "<path> <SHA-256>" each, hashed. The sources at b31635d, and the built JavaScript the probe
 * imports, which `npm run build` produces from them.
 */
const TREES = [
    ["packages/cv-backend-spec/src", () => true, "a83824ae9ddda040e53671f0e430eb98fb840c879ff1fde196da93bfbed28572"],
    ["packages/cv-backend-jsfeatnext/src", () => true, "a1686d5ff3ab14fdadbc37068f386bb4548dd27197d6a2743491f686738e3fd4"],
    ["packages/nft-tracker/src", () => true, "0973297d0df7c9cf4ebf9e3ce11058828f2b39c666d8c244cf2ca11796235fc7"],
    ["packages/cv-backend-jsfeatnext/dist", (p) => p.endsWith(".js"), "1f8ce5113152035245b3a8cb8fe89ad39b7288fea86dcb82b55924f89773facb"],
    ["packages/nft-tracker/dist", (p) => p.endsWith(".js"), "9de4e864c78794b2ef117a5bf5df910768614cf327febba275f79f40ec4e4ba7"],
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function treeDigest(rel, keep) {
    const base = join(ROOT, rel);
    if (!existsSync(base)) fatal(`${rel}: missing under ${ROOT}`);
    const files = [];
    const walk = (dir, prefix) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = prefix ? `${prefix}/${e.name}` : e.name;
            if (e.isDirectory()) walk(join(dir, e.name), p);
            else if (keep(p)) files.push(p);
        }
    };
    walk(base, "");
    files.sort();
    return { digest: sha256(files.map((p) => `${p} ${sha256(readFileSync(join(base, p)))}`).join("\n")), count: files.length };
}
for (const [rel, want] of INPUTS) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) fatal(`${rel}: missing under ${ROOT}`);
    const got = sha256(readFileSync(p));
    if (got !== want) fatal(`${rel}: SHA-256 ${got}, expected ${want}`);
}
const treeDigests = TREES.map(([rel, keep, want]) => {
    const { digest, count } = treeDigest(rel, keep);
    if (digest !== want) fatal(`${rel}: tree digest ${digest} over ${count} files, expected ${want}`);
    return [rel, digest, count];
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CANDIDATES = ["G0"];
const LOOPS = 6;
const COUNTED = Object.freeze({ firstLoop: 1, loopCount: 4 });
const BUCKETS = ["4", "5", "6-7", "8-11", "12+"];
const bucketOf = (n) => (n <= 4 ? "4" : n === 5 ? "5" : n <= 7 ? "6-7" : n <= 11 ? "8-11" : "12+");

/**
 * #137's comment of 2026-10-16 (6210882423), its table, "every frame, sync" arm, seeds 1 to 8,
 * measured at 37dc6d4: jitterPx at its printed precision, detection locks per run as a range,
 * frame 0. G0 must reproduce it (check 6).
 */
const COMMENT = {
    "pinball-static.mp4": {
        digits: 6,
        jitter: ["0.124939", "0.124939", "0.124939", "0.124939", "0.124939", "0.124939", "0.124939", "0.124939"],
        locks: [0, 0],
        frame0: (f) => f.state === "DETECT" && f.numInliers === 114,
        frame0Text: "DETECT, 114 inliers",
    },
    "pinball-bench.mp4": {
        digits: 2,
        jitter: ["5.75", "15.39", "27.46", "9.46", "17.17", "13.50", "17.12", "12.43"],
        locks: [282, 291],
        frame0: (f) => f.state === "DETECT" && f.numInliers >= 4 && f.numInliers <= 6,
        frame0Text: "DETECT, 4 to 6 inliers",
    },
    "pinball-bench-table.mp4": {
        digits: 1,
        jitter: ["1264.2", "1910.3", "1642.5", "129.4", "43.7", "39.8", "18.5", "19.6"],
        locks: [181, 205],
        frame0: (f) => (f.state === "DETECT" && f.numInliers === 4) || f.state === "LOST",
        frame0Text: "DETECT with 4 inliers, or LOST",
    },
};

if (CHILD !== null) {
    if (!CLIPS.includes(CHILD)) fatal(`--child ${CHILD}: not one of ${CLIPS.join(", ")}`);
    await child(CHILD);
    process.exit(0);
}
await main();
process.exit(0);

// =============================================================================================
// The parent: the three clips as child processes, then every figure, printed only at the end.
// =============================================================================================
async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const self = fileURLToPath(import.meta.url);
    const codes = await Promise.all(
        CLIPS.map(
            (clip) =>
                new Promise((done) => {
                    const p = spawn(process.execPath, [self, "--replay", REPLAY_DIR, "--out", OUT_DIR, "--child", clip], {
                        stdio: ["ignore", "ignore", "inherit"],
                        env: process.env,
                    });
                    p.on("exit", (code) => done([clip, code]));
                }),
        ),
    );
    for (const [clip, code] of codes) if (code !== 0) fatal(`${clip}: its child exited ${code}; no figure is printed`);
    const R = {};
    for (const clip of CLIPS) {
        const p = join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`);
        if (!existsSync(p)) fatal(`${p}: missing after its child exited 0`);
        R[clip] = JSON.parse(readFileSync(p, "utf8"));
    }
    lap("all clips");
    report(R);
    process.stdout.write(out.join("\n") + "\n");
}

// =============================================================================================
// One clip: every candidate on every seed, every check, a result file. Prints nothing to stdout.
// =============================================================================================
async function child(clip) {
    const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
    const backendPkg = await imp("packages/cv-backend-jsfeatnext/dist/index.js");
    const tracker = await imp("packages/nft-tracker/dist/index.js");
    const metrics = await imp("examples/js/bench-metrics.mjs");
    const { fitSize } = await imp("examples/js/pinball-shared.mjs");
    const jsfeatNext = (await import(pathToFileURL(join(ROOT, "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs")).href)).default;
    const { createJsfeatNextBackend, intrinsics } = backendPkg;
    const { NftTracker, decode, selectPose, targetGrid, inFront, conditioning, DEFAULT_RANSAC_THRESHOLD, DEFAULT_MIN_TRACKED_PATCHES } = tracker;
    const { frameRecord, targetCorners, summarizeRun, cornerJitter, countedLoopFrames, mediaKey, PAGE_PROCESSING_BOX } = metrics;
    if (DEFAULT_MIN_TRACKED_PATCHES !== 8) fatal(`DEFAULT_MIN_TRACKED_PATCHES is ${DEFAULT_MIN_TRACKED_PATCHES}, not the 8 G8 is defined on`);

    // ---- check 3's counter: every read of the global during a run ----------------------------
    const realRandom = Math.random;
    let randomReads = 0;
    Math.random = function countedRandom() {
        randomReads++;
        return realRandom();
    };

    // ---- decoding, copied from scripts/replay-clips.mjs (lines 440 to 507 at b31635d) --------
    function probe(path) {
        const json = JSON.parse(
            execFileSync(
                "ffprobe",
                ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path],
                { maxBuffer: 64 << 20 },
            ).toString(),
        );
        return {
            width: json.streams[0].width,
            height: json.streams[0].height,
            pts: json.frames.map((f) => Number(f.pts_time)),
        };
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
            for (let i = 0, p = o; i < n; i++, p += 3) {
                data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
            }
            frames.push({ data, width, height });
        }
        return frames;
    }
    function loadClip(name, box = PAGE_PROCESSING_BOX) {
        const path = join(ROOT, "examples", "videos", name);
        const { width: sw, height: sh, pts } = probe(path);
        const { width, height } = fitSize(sw, sh, box.width, box.height);
        const frames = greyFrames(path, width, height);
        if (frames.length !== pts.length) fatal(`${name}: ${frames.length} frames decoded, ${pts.length} timestamps`);
        return { frames, pts, width, height };
    }
    // replay-clips.mjs lines 541 to 551.
    const loopPeriod = (pts) => pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);
    function loopTimes(pts, loops) {
        const period = loopPeriod(pts);
        return Array.from({ length: loops * pts.length }, (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period);
    }

    // ---- the target, the backend, K ------------------------------------------------------------
    const decoded = decode(new Uint8Array(readFileSync(join(ROOT, "examples/targets/pinball.wnft"))));
    if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
    const target = decoded.target;
    const cv = await createJsfeatNextBackend();
    if (cv.capabilities.deterministicRansac !== true) {
        fatal(`the backend declares capabilities.deterministicRansac ${String(cv.capabilities.deterministicRansac)}, not true: an injected rng may be ignored (#137's usage rule 1)`);
    }
    // As replay-clips: the corners of the target's meta size; the pose grid of its level 0.
    const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
    const [gw, gh] = target.pyramid.levelSizes[0];
    const grid = targetGrid(gw, gh);

    const { frames, pts, width, height } = loadClip(clip);
    const K = intrinsics(width, height);
    const clipDurationS = loopPeriod(pts);
    const times = loopTimes(pts, LOOPS);
    const n = pts.length;
    lap(`${clip}: decoded ${n} frames at ${width}x${height}`);

    function mulberry32(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---- GH's held-out errors, by jsfeatNext's own kernel ---------------------------------------
    const F64C1 = jsfeatNext.F64_t | jsfeatNext.C1_t;
    const project = (H, x, y) => {
        const w = H[6] * x + H[7] * y + H[8];
        return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    };
    /** `homography2d.run` over the points `idx` of (src, dst), or null when it produces no model. */
    function fit(src, dst, idx) {
        const from = idx.map((i) => ({ x: src[2 * i], y: src[2 * i + 1] }));
        const to = idx.map((i) => ({ x: dst[2 * i], y: dst[2 * i + 1] }));
        const M = new jsfeatNext.matrix_t(3, 3, F64C1);
        if (!jsfeatNext.homography2d.run(from, to, M, idx.length)) return null;
        return Float64Array.from(M.data.subarray(0, 9));
    }
    function heldOut(src, dst) {
        const m = src.length >> 1;
        if (m < 5) return null;
        const all = Array.from({ length: m }, (_, i) => i);
        const e = [];
        for (let i = 0; i < m; i++) {
            const H = fit(src, dst, all.filter((j) => j !== i));
            if (H === null) {
                e.push(Infinity);
                continue;
            }
            const [u, v] = project(H, src[2 * i], src[2 * i + 1]);
            const d = Math.hypot(u - dst[2 * i], v - dst[2 * i + 1]);
            e.push(Number.isFinite(d) ? d : Infinity);
        }
        const s = [...e].sort((a, b) => a - b);
        const median = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
        return { median, max: s[m - 1], mean: e.reduce((a, b) => a + b, 0) / m };
    }
    /** The refit self-check (reported, not fatal): H against `run` over its own final mask, corner distance. */
    function refitGap(H, src, dst) {
        const m = src.length >> 1;
        const R = fit(src, dst, Array.from({ length: m }, (_, i) => i));
        if (R === null) return null;
        let worst = 0;
        for (const [x, y] of targetPoints) {
            const [a, b] = project(H, x, y);
            const [c, d] = project(R, x, y);
            worst = Math.max(worst, Math.hypot(a - c, b - d));
        }
        return worst;
    }

    // ---- the wrapper -----------------------------------------------------------------------------
    function wrapBackend(cand, rng, log, frameIndex) {
        const w = {};
        for (const key of new Set([...Object.keys(cv), ...Object.getOwnPropertyNames(Object.getPrototypeOf(cv))])) {
            if (key === "constructor") continue;
            const v = cv[key];
            w[key] = typeof v === "function" ? v.bind(cv) : v;
        }
        w.estimateHomography = (src, dst, options) => {
            const threshold = options?.threshold;
            if (threshold !== DEFAULT_RANSAC_THRESHOLD) fatal(`estimateHomography called with threshold ${threshold}, not DEFAULT_RANSAC_THRESHOLD ${DEFAULT_RANSAC_THRESHOLD}`);
            const h = cv.estimateHomography(src, dst, { ...options, rng });
            const count = src.length >> 1;
            const entry = { k: frameIndex(), matches: count, ransacOk: h.ok, n: h.numInliers, refused: null };
            if (!h.ok) {
                log.push(entry);
                return h;
            }
            let masked = 0;
            for (let i = 0; i < count; i++) if (h.inliers[i]) masked++;
            if (masked !== h.numInliers) fatal(`${clip}, frame ${entry.k}: the mask marks ${masked} inliers, numInliers is ${h.numInliers}`);
            const inSrc = new Float64Array(2 * h.numInliers);
            const inDst = new Float64Array(2 * h.numInliers);
            for (let i = 0, j = 0; i < count; i++) {
                if (!h.inliers[i]) continue;
                inSrc[2 * j] = src[2 * i];
                inSrc[2 * j + 1] = src[2 * i + 1];
                inDst[2 * j] = dst[2 * i];
                inDst[2 * j + 1] = dst[2 * i + 1];
                j++;
            }
            const loo = heldOut(inSrc, inDst);
            const sel = selectPose(h.H, K, inSrc, inDst, threshold, grid);
            const ce = conditioning(h.H, K);
            entry.loo = loo === null ? null : [loo.median, loo.max, loo.mean];
            entry.gp = sel.outcome;
            entry.ce = ce.ok ? [ce.dScale, ce.dOrth] : null;
            entry.refitGapPx = refitGap(h.H, inSrc, inDst);
            let refuse = null;
            if (cand === "G5" && h.numInliers < 5) refuse = "count";
            else if (cand === "G6" && h.numInliers < 6) refuse = "count";
            else if (cand === "G8" && h.numInliers < 8) refuse = "count";
            else if (cand === "GH") {
                if (loo === null) refuse = "n<5";
                else if (!(loo.median <= threshold)) refuse = "score";
            } else if (cand === "GP" && sel.outcome === "no-candidate-in-front") refuse = "behind";
            entry.refused = refuse;
            log.push(entry);
            if (refuse === null) return h;
            // The backend's own failure shape (jsfeatnext_backend.ts, lines 565 to 570).
            return { H: new Float64Array(9), inliers: new Uint8Array(count), numInliers: 0, ok: false };
        };
        return w;
    }

    // ---- one run -----------------------------------------------------------------------------------
    function run(cand, seed) {
        const rng = mulberry32(seed);
        const log = [];
        let k = -1;
        const t = new NftTracker(wrapBackend(cand, rng, log, () => k), target, K);
        const records = [];
        const rows = [];
        let fallbacks = 0;
        randomReads = 0;
        for (k = 0; k < times.length; k++) {
            const i = k % n;
            const timestampMs = times[k] * 1000;
            const result = t.process(frames[i], timestampMs);
            const rec = frameRecord({ mode: "tracking", result, stageTimings: {}, timestampMs, mediaTimeSeconds: pts[i], targetPoints });
            records.push(rec);
            const sel = result.ok ? result.poseSelection : null;
            if (sel && sel.chosen === "fallback") fallbacks++;
            // Stage 2's covariates, on G0 only (its first rule): the oracle's tilt, as #137's
            // body reads it (the backend's poseFromHomography, the angle from R[2][2]), and the
            // target's area in the frame, the corners' quadrilateral over the frame's.
            let tilt = null;
            let scale = null;
            if (cand === "G0" && result.ok) {
                const R = cv.poseFromHomography(result.H, K).R;
                tilt = (Math.acos(Math.min(1, Math.max(-1, R[8]))) * 180) / Math.PI;
                if (rec.corners) {
                    let a = 0;
                    for (let c = 0; c < 4; c++) {
                        const [x0, y0] = rec.corners[c];
                        const [x1, y1] = rec.corners[(c + 1) % 4];
                        a += x0 * y1 - x1 * y0;
                    }
                    scale = Math.abs(a) / 2 / (width * height);
                }
            }
            rows.push({
                k,
                loop: Math.floor(k / n),
                t: timestampMs,
                m: pts[i],
                state: rec.state,
                ok: rec.ok,
                reason: rec.reason,
                matches: rec.numMatches,
                inliers: rec.numInliers,
                trackLoss: rec.trackLoss,
                corners: rec.corners,
                outcome: sel ? sel.outcome : null,
                chosen: sel ? sel.chosen : null,
                behind: result.ok ? !inFront(result.pose.R, result.pose.t, grid) : null,
                tilt,
                scale,
            });
        }
        if (randomReads !== 0) fatal(`${clip}, ${cand}, seed ${seed}: ${randomReads} reads of the global Math.random during the run, with the rng injected (#137's usage rule 3)`);
        if (fallbacks !== t.fallbackFrames) fatal(`${clip}, ${cand}, seed ${seed}: ${fallbacks} fallback selections counted per frame, the tracker's fallbackFrames is ${t.fallbackFrames}`);
        // The gate log joined to its frame.
        const byFrame = new Map();
        for (const e of log) {
            if (byFrame.has(e.k)) fatal(`${clip}, ${cand}, seed ${seed}: two estimateHomography calls on frame ${e.k}`);
            byFrame.set(e.k, e);
        }
        for (const r of rows) r.gate = byFrame.get(r.k) ?? null;
        return { records, rows, log, text: rows.map((r) => JSON.stringify(r)).join("\n") + "\n" };
    }

    // ---- every candidate on every seed -------------------------------------------------------------
    const replayExport = (() => {
        const p = join(REPLAY_DIR, `replay-${clip.replace(/\.mp4$/, "")}-tracking-every-frame-sync.json`);
        if (!existsSync(p)) fatal(`${p}: missing; run replay-clips --external 70 --seed 1 --packages bundle --out ${REPLAY_DIR} first`);
        return JSON.parse(readFileSync(p, "utf8"));
    })();
    const g0 = {};
    const runs = [];
    let replayHead = null;
    const descriptive = []; // G0's accepted fits in the counted loops, every seed
    const frame0 = []; // G0's gate call on frame 0, every seed: the static clip's only detection
    const covTrack = []; // Stage 2, G0's TRACK frames in the counted loops, every seed
    const covDetect = []; // Stage 2, G0's accepted detections in the counted loops, every seed
    for (const cand of CANDIDATES) {
        for (const seed of SEEDS) {
            const r = run(cand, seed);
            writeFileSync(join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}-${cand}-s${seed}.jsonl`), r.text);

            // Check 5: seed 1 twice, byte for byte.
            if (seed === 1) {
                const again = run(cand, seed);
                if (again.text !== r.text) fatal(`${clip}, ${cand}, seed 1: two runs differ (${sha256(r.text).slice(0, 12)} and ${sha256(again.text).slice(0, 12)})`);
            }

            // Check 7: the counted loops by frame index.
            const counted = countedLoopFrames(r.records, { clipDurationS, ...COUNTED });
            const byIndex = r.records.filter((_, k) => r.rows[k].loop >= COUNTED.firstLoop && r.rows[k].loop < COUNTED.firstLoop + COUNTED.loopCount);
            if (counted.length !== byIndex.length || counted.some((f, j) => f !== byIndex[j])) {
                fatal(`${clip}, ${cand}, seed ${seed}: countedLoopFrames keeps ${counted.length} frames, loops 1 to 4 by index hold ${byIndex.length}`);
            }
            const summary = summarizeRun(r.records, { clipDurationS, loops: COUNTED, path: "sync" });
            if (!summary.trackTimeShare.complete) fatal(`${clip}, ${cand}, seed ${seed}: trackTimeShare incomplete`);
            const cRows = r.rows.filter((x) => x.loop >= 1 && x.loop <= 4);
            const calls = cRows.filter((x) => x.gate !== null).map((x) => x.gate);
            const accepted = calls.filter((g) => g.ransacOk && g.refused === null);
            const detectFrames = cRows.filter((x) => x.state === "DETECT");
            // At G5's implementation an accepted call on fewer than 5 inliers must end as a "too-few-inliers" LOST frame carrying its count, and only such a call may: the two frame sets are equal.
            const mustRefuse = cRows.filter((x) => x.gate !== null && x.gate.ransacOk && x.gate.refused === null && x.gate.n < 5);
            const g5Refused = cRows.filter((x) => x.reason === "too-few-inliers");
            for (const x of mustRefuse) if (x.state !== "LOST" || x.reason !== "too-few-inliers" || x.inliers !== x.gate.n) fatal(`${clip}, ${cand}, seed ${seed}: frame ${x.k}'s accepted call has ${x.gate.n} inliers, the frame is ${x.state}, ${x.reason}, ${x.inliers} inliers, not a too-few-inliers refusal`);
            for (const x of g5Refused) if (x.gate === null || !x.gate.ransacOk || !(x.gate.n < 5)) fatal(`${clip}, ${cand}, seed ${seed}: too-few-inliers frame ${x.k} has no accepted call below 5 inliers`);
            if (detectFrames.length !== accepted.length - mustRefuse.length) fatal(`${clip}, ${cand}, seed ${seed}: ${detectFrames.length} DETECT frames in the counted loops, ${accepted.length} accepted gate calls less ${mustRefuse.length} too-few-inliers refusals`);
            for (const x of detectFrames) {
                if (x.gate === null || x.gate.refused !== null || x.gate.n !== x.inliers) fatal(`${clip}, ${cand}, seed ${seed}: DETECT frame ${x.k} does not match its gate call`);
            }

            if (cand === "G0") {
                // Check 4: the copy, against replay-clips' own export, seed 1.
                if (seed === 1) {
                    const e = replayExport;
                    if (e.seed !== 1 || e.schedule !== "every frame, sync" || e.bundledClip !== clip) fatal(`${clip}: the replay export is seed ${e.seed}, "${e.schedule}", ${e.bundledClip}, not seed 1, "every frame, sync", ${clip}`);
                    // Its packages: the bundle the provenance manifest names, built from a clean tree.
                    const ps = e.packageSource ?? {};
                    if (ps.packages !== "bundle" || ps.bundleSha256 !== ps.manifestBundleSha256 || ps.manifestClean !== true || typeof ps.manifestHead !== "string") {
                        fatal(`${clip}: the replay export's packageSource is ${JSON.stringify(ps)}, not the manifest's bundle from a clean tree`);
                    }
                    replayHead = ps.manifestHead;
                    if (e.processingResolution.width !== width || e.processingResolution.height !== height) fatal(`${clip}: the replay export is ${e.processingResolution.width}x${e.processingResolution.height}, decoded here at ${width}x${height}`);
                    if (e.frames.length !== r.records.length) fatal(`${clip}: the replay export has ${e.frames.length} frames, G0 seed 1 has ${r.records.length}`);
                    for (let k = 0; k < r.records.length; k++) {
                        const a = r.records[k];
                        const b = e.frames[k];
                        for (const f of ["mediaTimeSeconds", "timestampMs", "state", "ok", "numInliers"]) {
                            if (a[f] !== b[f]) fatal(`${clip}: frame ${k}, ${f}: G0 seed 1 ${a[f]}, replay-clips ${b[f]}`);
                        }
                        if (JSON.stringify(a.corners) !== JSON.stringify(b.corners)) fatal(`${clip}: frame ${k}: corners differ from replay-clips'`);
                    }
                }
                g0[seed] = { records: r.records, counted, rows: r.rows };
                frame0.push({ seed, gate: r.rows[0].gate });
                // Stage 2's covariates, from G0's rows only. TRACK frames of the counted loops:
                // tilt, scale, and the motion since the previous frame when it was TRACK in the
                // same loop (the mean of the four corners' displacements, px).
                for (const x of cRows) {
                    if (x.state !== "TRACK") continue;
                    const p = r.rows[x.k - 1];
                    const motion = p && p.state === "TRACK" && p.loop === x.loop && p.corners && x.corners ? x.corners.reduce((s, c, j) => s + Math.hypot(c[0] - p.corners[j][0], c[1] - p.corners[j][1]), 0) / 4 : null;
                    covTrack.push({ seed, tilt: x.tilt, scale: x.scale, motion });
                }
                // Each accepted detection of the counted loops: the last TRACK frame before it in
                // the run (its inliers, tilt and scale) and the time since that frame, s.
                let last = null;
                for (const x of r.rows) {
                    if (x.loop >= 1 && x.loop <= 4 && x.state === "DETECT") {
                        covDetect.push({
                            seed,
                            n: x.inliers,
                            sinceS: last === null ? null : (x.t - last.t) / 1000,
                            prevInliers: last === null ? null : last.inliers,
                            prevTilt: last === null ? null : last.tilt,
                            prevScale: last === null ? null : last.scale,
                            behind: x.behind,
                        });
                    }
                    if (x.state === "TRACK") last = x;
                }
                for (const g of accepted) descriptive.push({ seed, n: g.n, loo: g.loo, ce: g.ce, gp: g.gp, gap: g.refitGapPx });
            }

            // Against G0 of the same seed: the common media times, and the frames that differ.
            const base = g0[seed];
            let common = null;
            let differing = null;
            if (cand !== "G0") {
                const keysOf = (cf) => new Set(cf.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)));
                const ka = keysOf(counted);
                const kb = keysOf(base.counted);
                const both = new Set([...ka].filter((x) => kb.has(x)));
                const include = (f) => both.has(mediaKey(f.mediaTimeSeconds));
                const ja = cornerJitter(counted, { include, clipDurationS });
                const jb = cornerJitter(base.counted, { include, clipDurationS });
                common = { size: both.size, cand: ja.jitterPx, candWindows: ja.jitterWindows, g0: jb.jitterPx, g0Windows: jb.jitterWindows };
                differing = 0;
                for (let k = 0; k < r.records.length; k++) {
                    const a = r.records[k];
                    const b = base.records[k];
                    if (a.state !== b.state || a.ok !== b.ok || a.numInliers !== b.numInliers || JSON.stringify(a.corners) !== JSON.stringify(b.corners)) differing++;
                }
                // G0's counted TRACK frames the candidate also tracked, with the same corners; and
                // the candidate's refusals at frames G0 posed with corners (the frames a refusal
                // can take out of jitterPx).
                let g0Track = 0;
                let sameTrack = 0;
                for (const x of base.rows) {
                    if (x.loop < 1 || x.loop > 4 || x.state !== "TRACK") continue;
                    g0Track++;
                    const y = r.rows[x.k];
                    if (y.state === "TRACK" && JSON.stringify(y.corners) === JSON.stringify(x.corners)) sameTrack++;
                }
                const refusedAtG0Corners = cRows.filter((x) => x.gate !== null && x.gate.refused !== null && base.rows[x.k].corners !== null).length;
                common.g0Track = g0Track;
                common.sameTrack = sameTrack;
                common.refusedAtG0Corners = refusedAtG0Corners;
                // The same-frame basis: the counted frames, by index k, at which both runs have
                // corners. Both arms process the same frame indices, so "the frames both posed"
                // (Stage 2's second rule) is identifiable exactly here; the media-key basis above
                // pools a media time over the four counted loops.
                const candAt = new Set();
                const baseAt = new Set();
                for (const x of base.rows) {
                    if (x.loop < 1 || x.loop > 4) continue;
                    if (x.corners !== null && r.rows[x.k].corners !== null) {
                        baseAt.add(base.records[x.k]);
                        candAt.add(r.records[x.k]);
                    }
                }
                const sa = cornerJitter(counted, { include: (f) => candAt.has(f), clipDurationS });
                const sb = cornerJitter(base.counted, { include: (f) => baseAt.has(f), clipDurationS });
                common.sameFrames = candAt.size;
                common.sameCand = sa.jitterPx;
                common.sameCandWindows = sa.jitterWindows;
                common.sameG0 = sb.jitterPx;
                common.sameG0Windows = sb.jitterWindows;
            }

            const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
            for (const g of accepted) buckets[bucketOf(g.n)]++;
            const refusedCalls = calls.filter((g) => g.refused !== null);
            const refused = { total: refusedCalls.length, count: 0, "n<5": 0, score: 0, behind: 0, noneInFront: 0, byBucket: Object.fromEntries(BUCKETS.map((b) => [b, 0])) };
            for (const g of refusedCalls) {
                refused[g.refused]++;
                refused.byBucket[bucketOf(g.n)]++;
                if (g.gp === "no-candidate-in-front") refused.noneInFront++;
            }
            const posed = cRows.filter((x) => x.ok);
            const firstPosed = r.rows.find((x) => x.ok) ?? null;
            runs.push({
                clip,
                cand,
                seed,
                frames: cRows.length,
                states: summary.states,
                posed: posed.length,
                accepted: buckets,
                refused,
                ransacFailures: calls.filter((g) => !g.ransacOk).length,
                behind: { DETECT: posed.filter((x) => x.state === "DETECT" && x.behind).length, TRACK: posed.filter((x) => x.state === "TRACK" && x.behind).length },
                outcomes: {
                    selected: posed.filter((x) => x.outcome === "selected").length,
                    ambiguous: posed.filter((x) => x.outcome === "ambiguous").length,
                    noneInFront: posed.filter((x) => x.outcome === "no-candidate-in-front").length,
                    degenerate: posed.filter((x) => x.outcome === "degenerate").length,
                },
                fallbacks: posed.filter((x) => x.chosen === "fallback").length,
                locks: summary.detectionLocks.n,
                locksConfirmed: summary.detectionLocks.confirmed,
                reacquisitions: summary.reacquisitions,
                trackTimeShare: summary.trackTimeShare.share,
                firstLock: firstPosed === null ? null : { k: firstPosed.k, s: times[firstPosed.k] - times[0], state: firstPosed.state },
                jitterPx: summary.jitterPx,
                jitterWindows: summary.jitterWindows,
                posedFrames: summary.posedFrames,
                common,
                differing,
                rowsSha256: sha256(r.text),
            });
            lap(`${clip}, ${cand}, seed ${seed}`);
        }
    }
    writeFileSync(
        join(OUT_DIR, `${clip.replace(/\.mp4$/, "")}.result.json`),
        JSON.stringify({ clip, width, height, frames: n, loops: LOOPS, clipDurationS, runs, descriptive, frame0, covTrack, covDetect, replayHead }),
    );
    Math.random = realRandom;
}

// =============================================================================================
// The figures.
// =============================================================================================
function report(R) {
    const fx = (v, d = 4) => (v === null || v === undefined ? "null" : Number.isFinite(v) ? v.toFixed(d) : String(v));
    const ratio = (xs) => {
        if (xs.some((x) => x === null || !Number.isFinite(x))) return null;
        const lo = Math.min(...xs);
        return lo > 0 ? Math.max(...xs) / lo : null;
    };
    const range = (xs) => {
        const v = xs.map((x) => x.v);
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        const at = (val) => xs.filter((x) => x.v === val).map((x) => x.seed).join(",");
        return lo === hi ? `${lo} (all)` : `${lo} (s${at(lo)}) to ${hi} (s${at(hi)})`;
    };
    say(`#137 Stage 1 pipeline probe: candidates ${CANDIDATES.join(", ")}; seeds ${SEEDS.join(", ")}; ${LOOPS} loops a run, loops 1 to 4 counted; node ${process.version}`);
    say(`inputs: ${INPUTS.map(([rel, h]) => `${rel} ${h.slice(0, 12)}`).join("; ")}`);
    say(`trees: ${treeDigests.map(([rel, d, count]) => `${rel} (${count} files) ${d.slice(0, 12)}`).join("; ")}`);
    const heads = [...new Set(CLIPS.map((c) => R[c].replayHead))];
    say(`replay-clips' exports: the provenance manifest's bundle, built clean at ${heads.join(", ")}`);
    for (const clip of CLIPS) say(`${clip}: ${R[clip].width}x${R[clip].height}, ${R[clip].frames} frames, loop ${fx(R[clip].clipDurationS, 6)} s`);
    say("");
    say("checks passed: input hashes and tree digests; deterministicRansac true; 0 Math.random reads in every run; the replay exports' packages the manifest's bundle from a clean tree; G0 seed 1 equals replay-clips' every-frame-sync export frame by frame on each clip; each candidate's seed 1 run twice byte-identical; counted loops by index; trackTimeShare complete; fallbackFrames; DETECT frames = accepted calls less those below 5 inliers, each of which, and no other frame, is a too-few-inliers LOST frame with its call's count; mask count = numInliers; every call at DEFAULT_RANSAC_THRESHOLD; DEFAULT_MIN_TRACKED_PATCHES 8");
    const all = CLIPS.flatMap((c) => R[c].runs);
    const get = (clip, cand) => all.filter((r) => r.clip === clip && r.cand === cand).sort((a, b) => a.seed - b.seed);

    say("");
    say("== The static clip, the must-not-regress case: frames (of all six loops) differing from G0 of the same seed, per seed 1..8");
    for (const cand of CANDIDATES.slice(1)) {
        say(`${cand}: ${get("pinball-static.mp4", cand).map((r) => r.differing).join(" ")}`);
    }
    for (const cand of CANDIDATES) {
        const rs = get("pinball-static.mp4", cand);
        say(`${cand}: ok frames ${range(rs.map((r) => ({ seed: r.seed, v: r.posed })))}; locks ${range(rs.map((r) => ({ seed: r.seed, v: r.locks })))}; jitterPx ${[...new Set(rs.map((r) => fx(r.jitterPx, 6)))].join(", ")}; first lock frame ${[...new Set(rs.map((r) => (r.firstLock ? `${r.firstLock.k} ${r.firstLock.state}` : "never")))].join(", ")}`);
    }
    const f0 = (g) => (g === null ? "no call" : `${g.n} inliers; held-out median / max / mean ${g.loo === null ? "null" : g.loo.map((x) => fx(x, 4)).join(" / ")} px; GP ${g.gp}; GE dScale ${g.ce ? fx(g.ce[0], 6) : "null"}, dOrth ${g.ce ? fx(g.ce[1], 6) : "null"}`);
    say("G0's frame-0 detection, the static clip's only one, per seed:");
    for (const x of R["pinball-static.mp4"].frame0) say(`  s${x.seed}: ${f0(x.gate)}`);

    for (const clip of CLIPS) {
        say("");
        say(`== ${clip}: jitterPx over the counted loops, whole-set, seeds 1..8, and the ratio largest to smallest`);
        for (const cand of CANDIDATES) {
            const rs = get(clip, cand);
            const xs = rs.map((r) => r.jitterPx);
            say(`${cand}: ${xs.map((x) => fx(x, 4)).join(" ")} | ratio ${fx(ratio(xs), 2)}`);
        }
        say(`-- ${clip}: whole-set windows kept and frames with corners, seeds 1..8`);
        for (const cand of CANDIDATES) {
            say(`${cand}: ${get(clip, cand).map((r) => `s${r.seed} ${r.jitterWindows} w, ${r.posedFrames} f`).join("; ")}`);
        }
        say(`-- ${clip}: the media-key basis (the M3 method: media keys each run posed in its counted loops, pooled over loops, intersected): common keys, candidate jitterPx (windows) / G0 jitterPx (windows), seeds 1..8`);
        for (const cand of CANDIDATES.slice(1)) {
            const rs = get(clip, cand);
            say(`${cand}: ${rs.map((r) => `s${r.seed} ${r.common.size}: ${fx(r.common.cand)} (${r.common.candWindows}) / ${fx(r.common.g0)} (${r.common.g0Windows})`).join("; ")}`);
            const cx = rs.map((r) => r.common.cand);
            say(`${cand}: candidate jitterPx ratio over seeds ${fx(ratio(cx), 2)}; G0 on the same sets ${fx(ratio(rs.map((r) => r.common.g0)), 2)}`);
        }
        say(`-- ${clip}: the same-frame basis (counted frames, by index, at which both runs have corners): frames, candidate jitterPx (windows) / G0 jitterPx (windows), seeds 1..8`);
        for (const cand of CANDIDATES.slice(1)) {
            const rs = get(clip, cand);
            say(`${cand}: ${rs.map((r) => `s${r.seed} ${r.common.sameFrames}: ${fx(r.common.sameCand)} (${r.common.sameCandWindows}) / ${fx(r.common.sameG0)} (${r.common.sameG0Windows})`).join("; ")}`);
            say(`${cand}: candidate jitterPx ratio over seeds ${fx(ratio(rs.map((r) => r.common.sameCand)), 2)}; G0 on the same frames ${fx(ratio(rs.map((r) => r.common.sameG0)), 2)}`);
        }
        say(`-- ${clip}: G0's counted TRACK frames that are TRACK under the candidate with the same corners, and the candidate's refusals at frames G0 posed with corners, seeds 1..8`);
        for (const cand of CANDIDATES.slice(1)) {
            say(`${cand}: ${get(clip, cand).map((r) => `s${r.seed} ${r.common.sameTrack}/${r.common.g0Track}, ${r.common.refusedAtG0Corners}`).join("; ")}`);
        }
        say(`-- ${clip}: per seed 1..8: TRACK frames; trackTimeShare; first lock (frame, s from the run's start); RANSAC failures`);
        for (const cand of CANDIDATES) {
            const rs = get(clip, cand);
            say(`${cand}: TRACK ${rs.map((r) => r.states.TRACK).join(" ")}; trackTimeShare ${rs.map((r) => fx(r.trackTimeShare, 4)).join(" ")}; first lock ${rs.map((r) => (r.firstLock === null ? "never" : `${r.firstLock.k} ${fx(r.firstLock.s, 3)}`)).join(", ")}; RANSAC failures ${rs.map((r) => r.ransacFailures).join(" ")}`);
        }
        say(`-- ${clip}: per candidate, the range over seeds 1..8 (seed of each extreme)`);
        const fields = [
            ["counted frames", (r) => r.frames],
            ["ok frames", (r) => r.posed],
            ["frames with corners", (r) => r.posedFrames],
            ["DETECT", (r) => r.states.DETECT],
            ["TRACK", (r) => r.states.TRACK],
            ["LOST", (r) => r.states.LOST],
            ["accepted 4", (r) => r.accepted["4"]],
            ["accepted 5", (r) => r.accepted["5"]],
            ["accepted 6-7", (r) => r.accepted["6-7"]],
            ["accepted 8-11", (r) => r.accepted["8-11"]],
            ["accepted 12+", (r) => r.accepted["12+"]],
            ["refused by the gate", (r) => r.refused.total],
            ["refused n<5 (GH)", (r) => r.refused["n<5"]],
            ["refused score (GH)", (r) => r.refused.score],
            ["refused with no candidate in front", (r) => r.refused.noneInFront],
            ["RANSAC failures", (r) => r.ransacFailures],
            ["behind, DETECT", (r) => r.behind.DETECT],
            ["behind, TRACK", (r) => r.behind.TRACK],
            ["no candidate in front", (r) => r.outcomes.noneInFront],
            ["ambiguous", (r) => r.outcomes.ambiguous],
            ["degenerate", (r) => r.outcomes.degenerate],
            ["fallback selections", (r) => r.fallbacks],
            ["detection locks", (r) => r.locks],
            ["locks confirmed", (r) => r.locksConfirmed],
            ["reacquisitions", (r) => r.reacquisitions],
            ["trackTimeShare %", (r) => (r.trackTimeShare === null ? null : Number((100 * r.trackTimeShare).toFixed(1)))],
            ["first lock, frame", (r) => (r.firstLock === null ? null : r.firstLock.k)],
            ["jitter windows", (r) => r.jitterWindows],
        ];
        for (const cand of CANDIDATES) {
            const rs = get(clip, cand);
            const cells = fields.map(([name, f]) => {
                const v = rs.map((r) => ({ seed: r.seed, v: f(r) }));
                if (v.some((x) => x.v === null)) return `${name} ${v.map((x) => (x.v === null ? "null" : x.v)).join("/")}`;
                return `${name} ${range(v)}`;
            });
            say(`${cand}: ${cells.join("; ")}`);
        }
    }

    // Post hoc, on G0's accepted fits in the counted loops, every seed: GH's score and GE's reading.
    say("");
    say("== Post hoc, on G0's accepted detections in the counted loops (seeds 1..8 together, descriptive): per inlier bucket, fits; GH's score refusals among n >= 5; median of the held-out median error (px); GP's no-candidate-in-front; GE's median |dScale| and |dOrth|");
    const med = (xs) => {
        const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
        if (s.length === 0) return null;
        const m = s.length;
        return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
    };
    for (const clip of CLIPS) {
        const d = R[clip].descriptive;
        for (const b of BUCKETS) {
            const xs = d.filter((x) => bucketOf(x.n) === b);
            if (xs.length === 0) {
                say(`${clip} ${b}: 0 fits`);
                continue;
            }
            const scored = xs.filter((x) => x.loo !== null);
            const byScore = scored.filter((x) => !(x.loo[0] <= 4)).length;
            say(
                `${clip} ${b}: ${xs.length} fits; score refuses ${byScore} of ${scored.length}; held-out median ${fx(med(scored.map((x) => x.loo[0])), 2)}; no-candidate-in-front ${xs.filter((x) => x.gp === "no-candidate-in-front").length}; |dScale| ${fx(med(xs.map((x) => (x.ce ? Math.abs(x.ce[0]) : null))), 4)}, |dOrth| ${fx(med(xs.map((x) => (x.ce ? Math.abs(x.ce[1]) : null))), 4)}`,
            );
        }
        const gaps = d.map((x) => x.gap);
        const finite = gaps.filter((g) => g !== null);
        say(`${clip}: refit self-check (H against homography2d.run over its own final mask, worst corner, px): ${finite.length} of ${gaps.length} refits produced; median ${fx(med(finite), 6)}; max ${fx(finite.length ? Math.max(...finite) : null, 6)}; above 0.01 px ${finite.filter((g) => g > 0.01).length}`);
    }

    // Stage 2's covariates, read on G0 only.
    const q = (xs, p) => {
        const s = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
        if (s.length === 0) return null;
        const i = p * (s.length - 1);
        const lo = Math.floor(i);
        return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
    };
    const qs = (xs, d) => `${fx(q(xs, 0.1), d)} / ${fx(q(xs, 0.5), d)} / ${fx(q(xs, 0.9), d)}`;
    say("");
    say("== Stage 2's covariates, read on G0 only (seeds 1..8 together, counted loops, descriptive; p10 / median / p90)");
    for (const clip of CLIPS) {
        const t = R[clip].covTrack;
        say(`${clip}, TRACK frames ${t.length}: oracle tilt (deg) ${qs(t.map((x) => x.tilt), 2)}; target area / frame area ${qs(t.map((x) => x.scale), 4)}; motion since the previous TRACK frame (px, ${t.filter((x) => x.motion !== null).length} frames) ${qs(t.map((x) => x.motion), 3)}`);
        const d = R[clip].covDetect;
        for (const b of BUCKETS) {
            const xs = d.filter((x) => bucketOf(x.n) === b);
            if (xs.length === 0) {
                say(`${clip}, accepted detections ${b}: 0`);
                continue;
            }
            const prior = xs.filter((x) => x.sinceS !== null);
            say(
                `${clip}, accepted detections ${b}: ${xs.length}; behind ${xs.filter((x) => x.behind).length}; after a TRACK frame ${prior.length}, of them within 0.5 s ${prior.filter((x) => x.sinceS <= 0.5).length}; time since it (s) ${qs(prior.map((x) => x.sinceS), 3)}; its inliers ${qs(prior.map((x) => x.prevInliers), 1)}; its tilt (deg) ${qs(prior.map((x) => x.prevTilt), 2)}; its area share ${qs(prior.map((x) => x.prevScale), 4)}`,
            );
        }
    }

    // The per-run table, to a file; its hash here.
    const header = ["clip", "cand", "seed", "frames", "posed", "DETECT", "TRACK", "LOST", ...BUCKETS.map((b) => `acc${b}`), "refused", "refN<5", "refScore", "ransacFail", "behindDETECT", "behindTRACK", "noneInFront", "ambiguous", "degenerate", "fallbacks", "locks", "locksConfirmed", "reacq", "trackTimeShare", "firstLockFrame", "firstLockS", "jitterPx", "jitterWindows", "commonSize", "commonCand", "commonG0", "differing", "rowsSha256"];
    const lines = [header.join("\t")];
    for (const r of all) {
        lines.push(
            [r.clip, r.cand, r.seed, r.frames, r.posed, r.states.DETECT, r.states.TRACK, r.states.LOST, ...BUCKETS.map((b) => r.accepted[b]), r.refused.total, r.refused["n<5"], r.refused.score, r.ransacFailures, r.behind.DETECT, r.behind.TRACK, r.outcomes.noneInFront, r.outcomes.ambiguous, r.outcomes.degenerate, r.fallbacks, r.locks, r.locksConfirmed, r.reacquisitions, fx(r.trackTimeShare, 6), r.firstLock?.k ?? "null", fx(r.firstLock?.s ?? null, 6), fx(r.jitterPx, 6), r.jitterWindows, r.common?.size ?? "", fx(r.common?.cand ?? null, 6), fx(r.common?.g0 ?? null, 6), r.differing ?? "", r.rowsSha256].join("\t"),
        );
    }
    const tsv = lines.join("\n") + "\n";
    writeFileSync(join(OUT_DIR, "runs.tsv"), tsv);
    say("");
    say(`runs.tsv: ${all.length} runs, SHA-256 ${sha256(tsv)}`);
    say(`per-frame rows: SHA-256 of the ${all.length} files' hashes in runs.tsv order ${sha256(all.map((r) => r.rowsSha256).join("\n"))}`);
}
