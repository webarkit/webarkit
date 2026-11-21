/*
 *  2026-11-21-277-segmented-reference.mjs
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
 * #277: a segmented corner reference for the wall and table clips, from artoolkit-nft-bench's
 * `segment.py`, beside the shipped arm's `TRACK` corners. A reference, not a criterion: it informs
 * (is a lock on the poster?), it does not judge a few pixels.
 *
 *     node docs/benchmarks/2026-11-21-277-segmented-reference.mjs --self-test
 *     node docs/benchmarks/2026-11-21-277-segmented-reference.mjs segment --nftbench <artoolkit-nft-bench clone> --python <python> --runs <dir> [--write <dir>] [--figures <file>]
 *     node docs/benchmarks/2026-11-21-277-segmented-reference.mjs compare --replays <dir> [--figures <file>]
 *
 * Run from the repository root, after `npm run build`; ffmpeg and ffprobe on PATH.
 *
 * - **segment** (items 1 and 3): reads `segment.py` from the clone at `NFTBENCH_COMMIT` with `git
 *   cat-file`, never its working tree, into `<runs>/nftbench-<commit>/python`, and runs it through
 *   `2026-11-21-277-segment-frames.py` (the driver beside this file) with that folder as
 *   `PYTHONPATH`. `<python>` needs cv2 and numpy; nothing is installed into the clone. Each clip is
 *   decoded as the replay decodes it (`2026-11-13-262-stage1-probe.mjs`'s `loadClip`: ffprobe's
 *   `pts_time`, `fitSize` into `PAGE_PROCESSING_BOX`, ffmpeg's bilinear scale), kept in RGB
 *   because the segmentation needs colour. Each clip is segmented twice, at its source size and at
 *   that processing size, both read in processing pixels; `BASIS` names the one the reference is
 *   made from (the wall: its source size, scaled; the table: its processing size), the other is
 *   the check, and the run reports what each accepts and how far apart their corners are. The
 *   wall clip must be artoolkit-nft-bench's `data/videos/pinball-bench.mp4` byte for byte (fatal
 *   otherwise): its `segmentation.md` was measured on it. The reference files are written into
 *   `--write` (default `<runs>`); the run then says whether each is byte-identical to the
 *   committed one (`REFERENCE_SHA256`), and exits 1 if not. `--write docs/benchmarks` replaces the
 *   committed files. Overlays of a fixed sample at the basis size (`segment_bank`'s draw: 24
 *   frames, numpy's `default_rng(0)`) go into `<runs>/overlay-<clip>/` for the by-eye check.
 * - **compare** (item 4): the committed reference files, each refused unless its SHA-256 is the
 *   one recorded here, beside the `none` arm's run files of `2026-11-14-272-stage1-probe.mjs runs
 *   --levers none --seeds 1-8` for each schedule, read from `<replays>/<schedule>/`. Per `TRACK`
 *   record with an accepted reference frame: the mean distance between the record's `corners` and
 *   the reference's, corner by corner; the frames beyond `ALLOWANCE_PX`; the records of seed 1
 *   within 0.1 s of the table clip's 1.900 s (`CROSS_CHECK`). `--figures` writes what it prints.
 *
 * Every refusal exits 1.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fitSize } from "../../examples/js/pinball-shared.mjs";
import { PAGE_PROCESSING_BOX } from "../../examples/js/bench-export-checks.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HERE = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(HERE, "2026-11-21-277-segment-frames.py");

/** artoolkit-nft-bench's `dev` head on 2026-11-21, and its `segment.py`'s SHA-256 there. */
export const NFTBENCH_COMMIT = "d629264eaba1ddc345028ad3fe6d1b8e520930cd";
export const SEGMENT_PY_SHA256 = "b17b43ae8fcb766fd127153727f07e54f13ce428e9d0ca17224aa52845cf70ff";
const NFTBENCH_WALL = "data/videos/pinball-bench.mp4";

export const CLIPS = {
    wall: "pinball-bench.mp4",
    table: "pinball-bench-table.mp4",
};
/** The committed reference files and their SHA-256: `compare` refuses any other bytes. */
export const referenceFile = (clip) => `2026-11-21-277-reference-${clip}.json`;
export const REFERENCE_SHA256 = {
    wall: "7a8ba4c3b5e9a925646b8707a97b08da2dfacf7518ab070d2438476ea5d8d4e1",
    table: "062ee5aa4639a8d6b263c3f765418ba327b67d1efcf6fd8bba31d0584923168b",
};
/**
 * The size each clip's reference is segmented at. The brief said the processing size; on the wall
 * clip segment.py's quads there are wrong on late frames (their left side, by eye on the sample),
 * while at 1280x720, segmentation.md's own configuration on the same bytes, they sit on the paper.
 * The maintainer ruled on 2026-11-21: the wall's reference is its source-size segmentation, scaled
 * to processing pixels. The other size is segmented too, as the check.
 */
export const BASIS = { wall: "source", table: "processing" };
const SCHEDULES = ["every", "device-15", "device-25"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SAMPLE = { size: 24, seed: 0 };

/**
 * The allowance a lock's mean corner distance may reach before it is read as off the poster, in
 * processing pixels. Fixed before any tracker distance was computed, from artoolkit-nft-bench's
 * own statements about the segmentation on the wall clip at 1280×720 (`d629264`): its error,
 * "about 1-2 px on sharp frames" (`results/phase1/segmentation.md`), so 2 px; and its offset from
 * the projected print corners, "three corners 1–2 px inward, the bottom-left corner about 8 px
 * off" (`results/phase1/README.md`), so 8 px, the largest corner's, applied to the mean of all
 * four. 2 + 8 = 10 px at 1280×720, × 480/1280 = 3.75 px in the wall's processing frame. The table
 * clip has no stated error of its own: the same 3.75 processing pixels are carried over, unmeasured.
 * Blur is "worse", by an amount nobody has stated, so the allowance does not cover it.
 */
export const ALLOWANCE_PX = (2 + 8) * (480 / 1280);
/**
 * M12's verification's one off-target lock, as the brief for #277 gives it: table, 1.900 s, seed 1.
 * Every record of seed 1 within `window` seconds of it is listed, whatever its state. The window
 * was 0 in the first run of `compare` (7d1d469); it was widened to 0.1 s after that run showed the
 * 1.900 s record to be a fresh detection, so that the lock before it is listed too.
 */
const CROSS_CHECK = { clip: "table", seed: 1, t: 1.9, window: 0.1 };

function fail(why) {
    console.error(`277-segmented-reference: ${why}`);
    process.exit(1);
}
function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i < 0) return fallback;
    const v = process.argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(`${name} needs a value`);
    return v;
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const r3 = (v) => Math.round(v * 1000) / 1000;

// --- pure checks, exercised by --self-test ---------------------------------------------------

/**
 * The driver's output for one clip: rows numbered 0 … n-1 with none missing or repeated, a final
 * count equal to the rows, and as many rows as the clip has timestamps. `null` when it holds.
 */
export function rowsRefusal(rows, finalCount, ptsCount) {
    for (let k = 0; k < rows.length; k++) {
        if (rows[k].i !== k) return `row ${k} is frame ${rows[k].i}: a frame is missing or repeated`;
    }
    if (finalCount !== rows.length) return `the driver counted ${finalCount} frames and printed ${rows.length}`;
    if (rows.length !== ptsCount) return `${rows.length} frames segmented, the clip has ${ptsCount} timestamps`;
    return null;
}

/** A reference file's bytes against the hash recorded for it. `null` when they agree. */
export function hashRefusal(bytes, expected, name) {
    if (!expected) return `${name}: no SHA-256 recorded`;
    const got = sha256(bytes);
    return got === expected ? null : `${name}: SHA-256 ${got}, recorded ${expected}`;
}

/** A reference's rows against the clip's frames: one per frame, in order, at the clip's media times. */
export function referenceRefusal(ref, pts) {
    if (ref.rows.length !== pts.length) return `${ref.rows.length} rows, the clip has ${pts.length} frames`;
    for (let i = 0; i < pts.length; i++) {
        const r = ref.rows[i];
        if (r.i !== i) return `row ${i} is frame ${r.i}`;
        if (r.t !== pts[i]) return `frame ${i} at ${r.t} s, the clip's at ${pts[i]} s`;
        if ((r.status === "accepted") !== Array.isArray(r.corners)) return `frame ${i}: status ${r.status} with corners ${JSON.stringify(r.corners)}`;
        if (r.corners && !(r.corners.length === 4 && r.corners.every((c) => c.length === 2 && c.every(Number.isFinite)))) return `frame ${i}: corners ${JSON.stringify(r.corners)} are not four finite points`;
    }
    return null;
}

/** A committed reference file, refused unless its bytes hash as recorded. `dir` defaults to this folder. */
export function loadReferenceFrom(dir, clip) {
    const name = referenceFile(clip);
    const bytes = readFileSync(join(dir, name));
    const why = hashRefusal(bytes, REFERENCE_SHA256[clip], name);
    return why ? { why } : { ref: JSON.parse(bytes.toString()) };
}

/** Source pixel to processing pixel, pixel centres at integers on both sides. */
export const toProcessing = (v, source, processing) => (v + 0.5) * (processing / source) - 0.5;

/** Mean distance between two quads, corner by corner (TL, TR, BR, BL). */
export function meanCornerDistance(a, b) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]);
    return s / 4;
}

export function quantile(sorted, q) {
    if (!sorted.length) return null;
    const p = (sorted.length - 1) * q;
    const lo = Math.floor(p);
    const hi = Math.ceil(p);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

function selfTest() {
    const fails = [];
    const T = (n, ok) => ok || fails.push(n);
    const rows = (ix) => ix.map((i) => ({ i }));
    T("contiguous rows pass", rowsRefusal(rows([0, 1, 2]), 3, 3) === null);
    T("a missing frame is refused", rowsRefusal(rows([0, 1, 3]), 3, 3) !== null);
    T("a repeated frame is refused", rowsRefusal(rows([0, 1, 1]), 3, 3) !== null);
    T("a frame count other than the clip's is refused", rowsRefusal(rows([0, 1, 2]), 3, 4) !== null);
    T("a driver count other than its rows is refused", rowsRefusal(rows([0, 1, 2]), 4, 3) !== null);
    const bytes = Buffer.from('{"rows":[]}\n');
    const good = sha256(bytes);
    T("a matching hash passes", hashRefusal(bytes, good, "f") === null);
    const tampered = Buffer.from(bytes);
    tampered[2] ^= 1;
    T("a reference file whose hash does not match is refused", hashRefusal(tampered, good, "f") !== null);
    T("a reference file with no recorded hash is refused", hashRefusal(bytes, null, "f") !== null);
    const q = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ];
    const ref = { rows: [{ i: 0, t: 0, status: "accepted", corners: q }, { i: 1, t: 0.04, status: "touches-border", corners: null }] };
    T("a reference matching the clip passes", referenceRefusal(ref, [0, 0.04]) === null);
    T("a reference missing a frame is refused", referenceRefusal({ rows: ref.rows.slice(0, 1) }, [0, 0.04]) !== null);
    T("a reference at other media times is refused", referenceRefusal(ref, [0, 0.05]) !== null);
    T("an accepted row without corners is refused", referenceRefusal({ rows: [{ i: 0, t: 0, status: "accepted", corners: null }] }, [0]) !== null);
    T("an accepted row with three corners is refused", referenceRefusal({ rows: [{ i: 0, t: 0, status: "accepted", corners: q.slice(0, 3) }] }, [0]) !== null);
    T("an accepted row with a non-finite corner is refused", referenceRefusal({ rows: [{ i: 0, t: 0, status: "accepted", corners: [[0, null], ...q.slice(1)] }] }, [0]) !== null);
    // The committed reference files, through the loader compare uses: as committed they pass, and a
    // copy with one byte changed is refused.
    const tmp = mkdtempSync(join(tmpdir(), "277-self-test-"));
    try {
        for (const clip of Object.keys(CLIPS)) {
            const loaded = loadReferenceFrom(HERE, clip);
            T(`the committed ${referenceFile(clip)} hashes as recorded`, !loaded.why);
            if (!loaded.why) T(`the committed ${referenceFile(clip)} has one row per frame`, loaded.ref.rows.length === loaded.ref.frames);
            const bad = readFileSync(join(HERE, referenceFile(clip)));
            bad[bad.length - 2] ^= 1;
            writeFileSync(join(tmp, referenceFile(clip)), bad);
            T(`a ${referenceFile(clip)} with one byte changed is refused`, !!loadReferenceFrom(tmp, clip).why);
        }
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    T("the corner distance is the corners' mean", meanCornerDistance(q, q.map(([x, y]) => [x + 3, y + 4])) === 5);
    T("scaling keeps pixel centres", toProcessing(-0.5, 1280, 480) === -0.5 && toProcessing(1279.5, 1280, 480) === 479.5);
    T("the allowance is 3.75 px", ALLOWANCE_PX === 3.75);
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

// --- segment ---------------------------------------------------------------------------------

/** `loadClip`'s probe (`2026-11-13-262-stage1-probe.mjs`), unchanged but for its name. */
function probeClip(path) {
    const json = JSON.parse(
        execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path], {
            maxBuffer: 64 << 20,
        }).toString(),
    );
    return { width: json.streams[0].width, height: json.streams[0].height, pts: json.frames.map((f) => Number(f.pts_time)) };
}

const decodeArgs = (path, w, h, scale) => ["-v", "error", "-i", path, "-fps_mode", "passthrough", ...(scale ? ["-vf", `scale=${w}:${h}:flags=bilinear`] : []), "-pix_fmt", "rgb24", "-f", "rawvideo", "-"];

/** ffmpeg piped into the driver; resolves to the driver's parsed lines. */
function runDriver({ python, pythonPath, path, w, h, scale, overlayDir, frameCount, overlayScale = 3 }) {
    return new Promise((resolve) => {
        const extra = overlayDir
            ? ["--overlay-dir", overlayDir, "--overlay-sample", `${SAMPLE.size},${SAMPLE.seed}`, "--frame-count", String(frameCount), "--overlay-scale", String(overlayScale)]
            : [];
        const py = spawn(python, [DRIVER, String(w), String(h), ...extra], { env: { ...process.env, PYTHONPATH: pythonPath }, stdio: ["pipe", "pipe", "inherit"] });
        const ff = spawn("ffmpeg", decodeArgs(path, w, h, scale), { stdio: ["ignore", "pipe", "inherit"] });
        ff.stdout.pipe(py.stdin);
        let out = "";
        py.stdout.on("data", (d) => (out += d));
        const closed = (p) => new Promise((r) => p.on("close", r));
        Promise.all([closed(ff), closed(py)]).then(([ffCode, code]) => {
            if (code !== 0 || ffCode !== 0) fail(`${path} ${w}x${h}: driver exited ${code}, ffmpeg ${ffCode}`);
            const lines = out.trim().split(/\r?\n/).map((l) => JSON.parse(l));
            resolve(lines);
        });
    });
}

function parseDriver(lines, ptsCount, what, pythonPath) {
    const head = lines[0];
    const tail = lines[lines.length - 1];
    if (!head || head.segment_py_sha256 !== SEGMENT_PY_SHA256) fail(`${what}: the driver ran a segment.py with SHA-256 ${head?.segment_py_sha256}`);
    // The file imported must be the export's, not a copy elsewhere with the same bytes (an editable install).
    const norm = (p) => resolve(p).toLowerCase();
    if (!norm(head.segment_py).startsWith(norm(pythonPath))) fail(`${what}: the driver imported ${head.segment_py}, not the export under ${pythonPath}`);
    const rows = lines.slice(1, -1);
    const why = rowsRefusal(rows, tail?.frames, ptsCount);
    if (why) fail(`${what}: ${why}`);
    return { head, rows };
}

/** `segment.py`'s package at the commit, from git's object store: the clone's tree is not read. */
function exportPackage(clone, runs) {
    const dir = join(runs, `nftbench-${NFTBENCH_COMMIT.slice(0, 7)}`, "python");
    const git = (...a) => execFileSync("git", ["-C", clone, ...a], { maxBuffer: 1 << 30 });
    const files = git("ls-tree", "-r", "--name-only", NFTBENCH_COMMIT, "python/nftbench/").toString().trim().split("\n").filter((f) => f.endsWith(".py") && !f.includes("/tests/"));
    for (const f of files) {
        const to = join(dir, f.slice("python/".length));
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, git("cat-file", "blob", `${NFTBENCH_COMMIT}:${f}`));
    }
    const seg = readFileSync(join(dir, "nftbench", "segment.py"));
    if (sha256(seg) !== SEGMENT_PY_SHA256) fail(`segment.py at ${NFTBENCH_COMMIT}: SHA-256 ${sha256(seg)}, expected ${SEGMENT_PY_SHA256}`);
    return { dir, git };
}

function referenceText(header, rows) {
    const lines = rows.map((r) => JSON.stringify(r));
    return `{\n${Object.entries(header)
        .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
        .join("\n")}\n  "rows": [\n    ${lines.join(",\n    ")}\n  ]\n}\n`;
}

function rejectedCounts(rows) {
    const out = {};
    for (const r of rows) if (!r.accepted) out[r.reason] = (out[r.reason] ?? 0) + 1;
    return out;
}

/** Two segmentations of one clip, both in processing pixels: what each accepts, and how far apart their corners are. */
function agreement(a, b) {
    const d = [];
    let onlyA = 0;
    let onlyB = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i].corners && !b[i].corners) onlyA++;
        if (!a[i].corners && b[i].corners) onlyB++;
        if (!a[i].corners || !b[i].corners) continue;
        const each = a[i].corners.map((c, k) => Math.hypot(c[0] - b[i].corners[k][0], c[1] - b[i].corners[k][1]));
        d.push({ i, mean: each.reduce((s, v) => s + v, 0) / 4, max: Math.max(...each) });
    }
    return { d, onlyA, onlyB };
}

async function segmentMode() {
    const clone = arg("--nftbench", null);
    const python = arg("--python", null);
    const runs = arg("--runs", null);
    if (!clone || !python || !runs) fail("segment needs --nftbench, --python and --runs");
    const write = arg("--write", runs);
    mkdirSync(runs, { recursive: true });
    mkdirSync(write, { recursive: true });
    const { dir: pythonPath, git } = exportPackage(clone, runs);
    const f = (v) => (v === null || v === undefined ? "-" : v.toFixed(3));
    const out = [];
    const say = (s) => {
        out.push(s);
        console.log(s);
    };
    let allSame = true;
    for (const [clip, file] of Object.entries(CLIPS)) {
        const rel = `examples/videos/${file}`;
        const path = join(ROOT, rel);
        const src = readFileSync(path);
        const { width: sw, height: sh, pts } = probeClip(path);
        const { width: w, height: h } = fitSize(sw, sh, PAGE_PROCESSING_BOX.width, PAGE_PROCESSING_BOX.height);
        if (clip === "wall") {
            // The wall clip is artoolkit-nft-bench's clip: segmentation.md's run was on these bytes.
            const theirs = git("cat-file", "blob", `${NFTBENCH_COMMIT}:${NFTBENCH_WALL}`);
            if (sha256(theirs) !== sha256(src)) fail(`${NFTBENCH_WALL} at ${NFTBENCH_COMMIT} is not ${rel}`);
            say(`wall: ${rel} is ${NFTBENCH_WALL} at ${NFTBENCH_COMMIT.slice(0, 7)} byte for byte (SHA-256 ${sha256(src)})`);
        }
        // Both sizes, each in processing pixels; the basis is the reference, the other the check.
        const sizes = {
            source: { w: sw, h: sh, scale: false },
            processing: { w, h, scale: true },
        };
        const seg = {};
        for (const [name, s] of Object.entries(sizes)) {
            const overlayDir = name === BASIS[clip] ? join(runs, `overlay-${clip}`) : null;
            if (overlayDir) mkdirSync(overlayDir, { recursive: true });
            const lines = await runDriver({ python, pythonPath, path, w: s.w, h: s.h, scale: s.scale, overlayDir, frameCount: pts.length, overlayScale: name === "source" ? 1 : 3 });
            const { head, rows } = parseDriver(lines, pts.length, `${clip} ${s.w}x${s.h}`, pythonPath);
            writeFileSync(join(runs, `segment-${clip}-${s.w}x${s.h}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
            const inProcessing = rows.map((r) => ({
                ...r,
                corners: r.corners ? r.corners.map(([x, y]) => [toProcessing(x, s.w, w), toProcessing(y, s.h, h)]) : null,
            }));
            seg[name] = { head, rows: inProcessing, size: [s.w, s.h] };
            const acc = rows.filter((r) => r.accepted).length;
            say(`${clip} at ${s.w}x${s.h}${name === BASIS[clip] ? " (the reference's basis)" : " (check)"}: ${acc} of ${rows.length} accepted, rejected ${JSON.stringify(rejectedCounts(rows))}`);
            if (overlayDir) say(`  overlay sample: ${head.overlay_frames.join(", ")}`);
        }
        const basis = seg[BASIS[clip]];
        const other = BASIS[clip] === "source" ? "processing" : "source";
        const { d, onlyA, onlyB } = agreement(basis.rows, seg[other].rows);
        const s = d.map((x) => x.mean).sort((x, y) => x - y);
        const m = d.map((x) => x.max).sort((x, y) => x - y);
        say(`  ${BASIS[clip]} against ${other}, in processing px: both accepted ${d.length}, only at ${BASIS[clip]} ${onlyA}, only at ${other} ${onlyB}`);
        say(`    mean corner distance p50 ${f(quantile(s, 0.5))}, p90 ${f(quantile(s, 0.9))}, p99 ${f(quantile(s, 0.99))}, max ${f(quantile(s, 1))}; largest single corner p50 ${f(quantile(m, 0.5))}, p90 ${f(quantile(m, 0.9))}, max ${f(quantile(m, 1))}`);
        const above = d.filter((x) => x.mean > 1);
        say(`    frames whose mean exceeds 1 px: ${above.length}${above.length ? `: ${above.map((x) => x.i).join(", ")}` : ""}`);
        const refRows = basis.rows.map((r) => ({
            i: r.i,
            t: pts[r.i],
            status: r.accepted ? "accepted" : r.reason,
            conf: r.conf,
            corners: r.corners ? r.corners.map(([x, y]) => [r3(x), r3(y)]) : null,
        }));
        const rejected = {};
        for (const r of refRows) if (r.status !== "accepted") rejected[r.status] = (rejected[r.status] ?? 0) + 1;
        const bs = sizes[BASIS[clip]];
        const header = {
            kind: "277-segmented-reference",
            clip,
            file: rel,
            sourceSha256: sha256(src),
            sourceSize: [sw, sh],
            processingSize: [w, h],
            segmentedAt: [bs.w, bs.h],
            scale: [w / bs.w, h / bs.h],
            basis:
                BASIS[clip] === "source"
                    ? "segmented at the source size, corners scaled to processing pixels: segment.py's quads at 480x270 are wrong on late wall frames (the maintainer's ruling of 2026-11-21, #277)"
                    : "segmented at the processing size",
            frames: pts.length,
            accepted: refRows.filter((r) => r.status === "accepted").length,
            rejected,
            segmenter: {
                repository: "webarkit/artoolkit-nft-bench",
                commit: NFTBENCH_COMMIT,
                file: "python/nftbench/segment.py",
                sha256: SEGMENT_PY_SHA256,
                call: "segment_quad, then order_corners against the last accepted quad, min_conf 0.5, as segment_bank",
            },
            environment: { python: basis.head.python, opencv: basis.head.opencv, numpy: basis.head.numpy },
            command: "node docs/benchmarks/2026-11-21-277-segmented-reference.mjs segment --nftbench <artoolkit-nft-bench clone> --python <python> --runs <dir> --write docs/benchmarks",
            decode: `ffmpeg ${decodeArgs(rel, bs.w, bs.h, bs.scale).join(" ")}`,
            corners: "TL, TR, BR, BL of the poster's paper, in processing pixels, pixel centres at integers; rounded to 0.001 px",
            t: "ffprobe's pts_time, as the replay's mediaTimeSeconds",
            limits: "colour segmentation, checked by eye; it informs (is a lock on the poster?), it does not judge a few pixels; no calibration. See 2026-11-21-277-segmented-reference.md.",
        };
        const text = referenceText(header, refRows);
        const name = referenceFile(clip);
        writeFileSync(join(write, name), text);
        const got = sha256(Buffer.from(text));
        const same = got === REFERENCE_SHA256[clip];
        allSame &&= same;
        say(`  ${name}: ${header.accepted} of ${pts.length} accepted, SHA-256 ${got} (${same ? "identical to the committed reference" : "differs from the recorded hash"})`);
    }
    const figures = arg("--figures", null);
    if (figures) writeFileSync(figures, out.join("\n") + "\n");
    if (!allSame) process.exitCode = 1;
}

// --- compare ---------------------------------------------------------------------------------

function loadReference(clip) {
    const { why, ref } = loadReferenceFrom(HERE, clip);
    if (why) fail(why);
    const src = sha256(readFileSync(join(ROOT, ref.file)));
    if (src !== ref.sourceSha256) fail(`${ref.file}: SHA-256 ${src}, the reference was made from ${ref.sourceSha256}`);
    return ref;
}

/** Each record's loop, 1-based: a loop starts where the media time steps back. */
function loopsOf(frames) {
    let loop = 1;
    return frames.map((fr, k) => {
        if (k > 0 && fr.mediaTimeSeconds < frames[k - 1].mediaTimeSeconds) loop++;
        return loop;
    });
}

function compareMode() {
    const replays = arg("--replays", null);
    if (!replays) fail("compare needs --replays <dir>");
    const out = [];
    const say = (s) => {
        out.push(s);
        console.log(s);
    };
    const f = (v) => (v === null ? "-" : v.toFixed(2));
    say(`#277 compare: the shipped arm's TRACK corners against the segmented reference; allowance ${ALLOWANCE_PX} processing px (mean corner distance)`);
    for (const clip of Object.keys(CLIPS)) {
        const ref = loadReference(clip);
        const pts = ref.rows.map((r) => r.t);
        const why = referenceRefusal(ref, probeClip(join(ROOT, ref.file)).pts);
        if (why) fail(`${referenceFile(clip)}: ${why}`);
        const at = new Map(pts.map((t, i) => [t, i]));
        const recordLine = (fr, k, loop) => {
            const i = at.get(fr.mediaTimeSeconds);
            if (i === undefined) fail(`record ${k} at ${fr.mediaTimeSeconds} s: no clip frame there`);
            const rr = ref.rows[i];
            const d = fr.corners && rr.corners ? meanCornerDistance(fr.corners, rr.corners) : null;
            const q = typeof fr.quality === "number" ? fr.quality.toFixed(3) : "-";
            return `record ${k}, loop ${loop}, clip frame ${i}, ${fr.mediaTimeSeconds.toFixed(3)} s, ${fr.state}, ${fr.numInliers} inliers, quality ${q}, mean corner distance ${f(d)} px${d !== null && d > ALLOWANCE_PX ? " (beyond the allowance)" : ""}`;
        };
        say(`\n${clip}: reference ${referenceFile(clip)}, ${ref.accepted} of ${ref.frames} frames accepted`);
        for (const schedule of SCHEDULES) {
            const ds = [];
            const perCorner = [[], [], [], []];
            let track = 0;
            let noRef = 0;
            let noCorners = 0;
            const beyond = [];
            let worst = null;
            for (const seed of SEEDS) {
                const file = join(replays, schedule, `run-${clip}-none-s${seed}-${schedule}.json`);
                if (!existsSync(file)) fail(`${file} missing: run 2026-11-14-272-stage1-probe.mjs runs --levers none first`);
                const run = JSON.parse(readFileSync(file, "utf8"));
                if (run.lever !== "none" || run.seed !== seed || run.scheduleName !== schedule || run.clip !== clip) fail(`${file}: not the none arm of ${clip} seed ${seed} ${schedule}`);
                if (run.size[0] !== ref.processingSize[0] || run.size[1] !== ref.processingSize[1]) fail(`${file}: frames ${run.size}, the reference's ${ref.processingSize}`);
                run.frames.forEach((fr, k) => {
                    if (fr.state !== "TRACK") return;
                    track++;
                    const i = at.get(fr.mediaTimeSeconds);
                    if (i === undefined) fail(`${file}: record ${k} at ${fr.mediaTimeSeconds} s, no clip frame there`);
                    const r = ref.rows[i];
                    if (r.status !== "accepted") {
                        noRef++;
                        return;
                    }
                    if (!fr.corners) {
                        noCorners++;
                        return;
                    }
                    const d = meanCornerDistance(fr.corners, r.corners);
                    ds.push(d);
                    for (let c = 0; c < 4; c++) perCorner[c].push(Math.hypot(fr.corners[c][0] - r.corners[c][0], fr.corners[c][1] - r.corners[c][1]));
                    if (d > ALLOWANCE_PX) beyond.push({ seed, k, i, t: fr.mediaTimeSeconds, d });
                    if (!worst || d > worst.d) worst = { seed, k, d, run };
                });
            }
            ds.sort((a, b) => a - b);
            for (const p of perCorner) p.sort((a, b) => a - b);
            say(
                `  ${schedule}: ${track} TRACK records over seeds 1-8, ${ds.length} with an accepted reference, ${noRef} on a rejected reference frame, ${noCorners} without corners; ` +
                    `mean corner distance p10 ${f(quantile(ds, 0.1))}, p50 ${f(quantile(ds, 0.5))}, p90 ${f(quantile(ds, 0.9))}, p99 ${f(quantile(ds, 0.99))}, max ${f(ds.length ? ds[ds.length - 1] : null)} px; ` +
                    `per corner p50 TL ${f(quantile(perCorner[0], 0.5))}, TR ${f(quantile(perCorner[1], 0.5))}, BR ${f(quantile(perCorner[2], 0.5))}, BL ${f(quantile(perCorner[3], 0.5))} px; ` +
                    `beyond ${ALLOWANCE_PX} px: ${beyond.length}`,
            );
            const frames = new Map();
            for (const b of beyond) {
                const e = frames.get(b.i) ?? { i: b.i, t: b.t, n: 0, max: 0, seeds: new Set() };
                e.n++;
                e.max = Math.max(e.max, b.d);
                e.seeds.add(b.seed);
                frames.set(b.i, e);
            }
            for (const e of [...frames.values()].sort((a, b) => a.i - b.i)) say(`    clip frame ${e.i} (${e.t} s): ${e.n} record(s), seeds ${[...e.seeds].join(",")}, max ${f(e.max)} px`);
            if (worst) {
                // The largest distance's run, two records either side of it: what the lock did around it.
                const loops = loopsOf(worst.run.frames);
                say(`    the largest, seed ${worst.seed} record ${worst.k}, and the records around it:`);
                for (let k = Math.max(0, worst.k - 2); k <= Math.min(worst.run.frames.length - 1, worst.k + 2); k++) say(`      ${recordLine(worst.run.frames[k], k, loops[k])}`);
            }
        }
        if (clip === CROSS_CHECK.clip) {
            const i = pts.findIndex((t) => Math.abs(t - CROSS_CHECK.t) < 1e-9);
            if (i < 0) fail(`no ${clip} frame at ${CROSS_CHECK.t} s`);
            const r = ref.rows[i];
            say(`\n  cross-check, ${clip} ${CROSS_CHECK.t} s (clip frame ${i}, reference ${r.status}), seed ${CROSS_CHECK.seed}, every record within ${CROSS_CHECK.window} s of it:`);
            for (const schedule of SCHEDULES) {
                const run = JSON.parse(readFileSync(join(replays, schedule, `run-${clip}-none-s${CROSS_CHECK.seed}-${schedule}.json`), "utf8"));
                const loops = loopsOf(run.frames);
                const hits = run.frames.map((fr, k) => ({ fr, k })).filter(({ fr }) => Math.abs(fr.mediaTimeSeconds - CROSS_CHECK.t) <= CROSS_CHECK.window + 1e-9);
                if (!hits.length) say(`    ${schedule}: none processed`);
                for (const { fr, k } of hits) say(`    ${schedule}: ${recordLine(fr, k, loops[k])}`);
            }
        }
    }
    const figures = arg("--figures", null);
    if (figures) writeFileSync(figures, out.join("\n") + "\n");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [mode] = process.argv.slice(2);
    if (mode === "--self-test") selfTest();
    else if (mode === "segment") await segmentMode();
    else if (mode === "compare") compareMode();
    else fail("mode: --self-test | segment | compare");
}
