/*
 *  2026-11-01-202-stage3-c0.mjs
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
 * #202's Stage 3 C0, "facing is unchanged" (2026-11-01-202-stage3-registration.md, C0, and "How
 * each is read, as commands"): every result field on every frame, at every index, equal between
 * the base (the registration's merge, 45d3471) and the implementation, except the frames the rule
 * refuses at the implementation (reason "not-facing", exception i) and, on the frame immediately
 * after one, `tracking`, `trackLoss` and `trackLossConditioning` (exception ii). Results:
 * 2026-11-01-202-stage3-addendum.md.
 *
 *     node --experimental-transform-types docs/benchmarks/2026-11-01-202-stage3-c0.mjs --base <base checkout> --tip <implementation checkout> --base-run <base run>
 *
 * On each checkout: NftTracker from that checkout's built dist/, with no options, on the three
 * clips at seeds 1 to 8 and all six loops, every frame, the backend's estimateHomography given
 * { ...options, rng } as the probe's wrapper gives it and its result returned unchanged; and the
 * ground truth's three sequences through each checkout's ground-truth/tracker_sequences.ts. The
 * two trackers of a clip and seed run in lockstep, frame by frame, each with its own mulberry32
 * stream, and each pair of results is compared as it is produced.
 *
 * It holds the probe's axis A (2026-11-01-202-stage1-probe.mjs at f872707, lines 127 to 147,
 * with the `--break` reading of lines 113 to 122), its decoding and schedule (522 to 553) and
 * mulberry32 (571 to 579) byte-identical, and loads the sequences with its resolve hook (1022 to
 * 1033).
 *
 * Tied to the probe, fatal otherwise: on every clip and seed, the base's DETECT frames, their H
 * and their axis-A column equal the base probe run's G0 rows (`state`, `H`, `gate.side`), frame by
 * frame, read only from a rows file whose SHA-256 begins with the prefix the run's stdout prints;
 * on the sequences, the base's DETECT frames and columns equal the base expressibility stdout's.
 *
 * Exercised both ways (the registration's C0, "Both ways") with --tip set to the base checkout
 * or the implementation, --only <clip>:<seed>, and --break <kind>, which changes one leaf of one
 * tip result before it is compared: pose-t (pose.t[0] on the first TRACK frame), margin
 * (poseSelection.margin on the first DETECT frame), tracking (tracking on the first TRACK frame),
 * after-tracking and after-state (tracking, then state, on the first frame after a refusal that
 * is not itself refused),
 * refused (every field of the first refused frame, through its numMatches).
 */

import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-01-202-stage3-c0.mjs";
function fatal(reason) {
    process.stderr.write(`${SCRIPT}: fatal: ${reason}\n`);
    process.exit(1);
}
const t0 = performance.now();
const lap = (what) => process.stderr.write(`${what}: ${(performance.now() - t0).toFixed(0)} ms\n`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const argv = process.argv.slice(2);
function arg(name) {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fatal(`${name} needs a value`);
    return v;
}
/** A deliberate defect, for exercising a check the wrong way (the record's checks section). */
const BREAK = arg("--break");

const det3 = (H) =>
    H[0] * (H[4] * H[8] - H[5] * H[7]) - H[1] * (H[3] * H[8] - H[5] * H[6]) + H[2] * (H[3] * H[7] - H[4] * H[6]);
const gridW = (H, grid) => {
    const w = [];
    for (let i = 0; i < grid.length; i += 2) w.push(H[6] * grid[i] + H[7] * grid[i + 1] + H[8]);
    return w;
};
/** Axis A. Returns { side, s, det }; side null with det 0 is the caller's fatal. */
function sideOf(H, grid) {
    const w = gridW(H, grid);
    const pos = w.every((x) => x > 0);
    const neg = w.every((x) => x < 0);
    const det = det3(H);
    if (!pos && !neg) return { side: "mixed-w", s: 0, det };
    let s = pos ? 1 : -1;
    if (BREAK === "no-normalise") s = 1;
    const d = s * det;
    if (d === 0) return { side: null, s, det };
    if (BREAK === "side-swap") return { side: d > 0 ? "reversed" : "facing", s, det };
    return { side: d > 0 ? "facing" : "reversed", s, det };
}

const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LOOPS = 6;
const AFTER = ["tracking", "trackLoss", "trackLossConditioning"];
const BASE = arg("--base");
const TIP = arg("--tip");
const BASE_RUN = arg("--base-run");
const CHILD = arg("--child");
const OUT = arg("--out");
const ONLY = arg("--only");
if (BASE === null || TIP === null || BASE_RUN === null) fatal("--base, --tip and --base-run are required");
const ROOT = resolve(BASE); // the held decoding reads the clips under ROOT

// The base run is the probe's recorded run, reproduced (as 2026-11-01-202-stage3-compare.mjs checks it).
{
    const lines = readFileSync(join(BASE_RUN, "stdout.txt"), "utf8").split("\n");
    lines[3] = (lines[3] ?? "").replace(/built clean at [0-9a-f]{40}$/, "built clean at 9b387ae28952ae7e37827d3582b686bdad1b8f30");
    const got = sha256(lines.join("\n"));
    if (got !== "1ad328812f7040593bc2eb8d82e57e8f91bdccc98af3cafc9e72f3682b131713") fatal(`${BASE_RUN}/stdout.txt: SHA-256 ${got} with line 4's head set to 9b387ae, not the probe's recorded run`);
    const e = sha256(readFileSync(join(BASE_RUN, "expressibility.txt")));
    if (e !== "039ad945b45bbea8de6d8acfdf519a67aafd6badc41ef930de636e726ec16030") fatal(`${BASE_RUN}/expressibility.txt: SHA-256 ${e}, not the probe's recorded one`);
}

/**
 * Every leaf where a and b differ, as [path, a, b]: the same keys at every level, arrays and
 * typed arrays element by element, every leaf with Object.is.
 */
function diff(a, b, path, acc, skip) {
    const typed = (x) => ArrayBuffer.isView(x);
    if (typed(a) || typed(b)) {
        if (!(typed(a) && typed(b)) || a.constructor !== b.constructor || a.length !== b.length) acc.push([path, a, b]);
        else for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) acc.push([`${path}[${i}]`, a[i], b[i]]);
        return acc;
    }
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
        if (Array.isArray(a) !== Array.isArray(b)) {
            acc.push([path, a, b]);
            return acc;
        }
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
            const p = path === "" ? k : Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`;
            if (path === "" && skip.has(k)) continue;
            if (!(k in a) || !(k in b)) acc.push([p, a[k], b[k]]);
            else diff(a[k], b[k], p, acc, skip);
        }
        return acc;
    }
    if (!Object.is(a, b)) acc.push([path, a, b]);
    return acc;
}
const show = (v) => (v === undefined ? "(absent)" : ArrayBuffer.isView(v) ? `[${Array.from(v).join(", ")}]` : JSON.stringify(v));

/**
 * One pair of runs, compared frame by frame: { states, i, ii, lines }. `mutate` is --break's.
 * Results arrive in order; `next(k)` yields [base result, tip result] for frame k.
 */
function comparer(label) {
    const states = { TRACK: 0, DETECT: 0, LOST: 0 };
    let i = 0;
    let ii = 0;
    const lines = [];
    let prevRefused = false;
    const broken = new Set();
    const once = (kind) => (BREAK === kind && !broken.has(kind) ? (broken.add(kind), true) : false);
    return {
        frame(k, b, t0r) {
            let t = t0r;
            const refused = !t.ok && t.reason === "not-facing";
            // --break: one leaf of one tip result, changed on a copy before the comparison.
            if (BREAK !== null) {
                const tr = t.state === "TRACK";
                if ((tr && k > 0 && once("pose-t")) || (t.state === "DETECT" && t.ok && once("margin")) || (tr && once("tracking")) || (prevRefused && !refused && once("after-tracking")) || (prevRefused && !refused && once("after-state")) || (refused && once("refused"))) {
                    t = structuredClone(t);
                    if (BREAK === "pose-t") t.pose.t[0] += 1;
                    else if (BREAK === "margin") t.poseSelection.margin += 1;
                    else if (BREAK === "tracking" || BREAK === "after-tracking") t.tracking = t.tracking === null ? { broken: true } : { ...t.tracking, broken: true };
                    else if (BREAK === "after-state") t.state = t.state === "LOST" ? "TRACK" : "LOST";
                    else if (BREAK === "refused") t.numMatches += 1;
                    process.stderr.write(`${label}: --break ${BREAK} applied on frame ${k}\n`);
                }
            }
            if (refused) {
                i++;
                prevRefused = true;
                return;
            }
            states[b.state] = (states[b.state] ?? 0) + 1;
            const skip = new Set(prevRefused ? AFTER : []);
            if (prevRefused) ii++;
            prevRefused = false;
            for (const [p, x, y] of diff(b, t, "", [], skip)) lines.push(`  frame ${k}: ${p}: base ${show(x)}, tip ${show(y)}`);
        },
        end(nb, nt) {
            if (nb !== nt) lines.push(`  results: base ${nb}, tip ${nt}`);
            return { label, states, i, ii, lines };
        },
    };
}
function print(r) {
    console.log(`${r.label}: compared TRACK ${r.states.TRACK}, DETECT ${r.states.DETECT}, LOST ${r.states.LOST}; exception (i) ${r.i}, exception (ii) ${r.ii}; differing ${r.lines.length ? r.lines.length : "none"}`);
    for (const l of r.lines) console.log(l);
}

/** "<clip>-G0-s<seed>" rows of the base probe run, after the SHA-256 prefix its stdout lists. */
function probeRows(clip, seed) {
    const stem = clip.replace(/\.mp4$/, "");
    let current = null;
    let prefix = null;
    for (const line of readFileSync(join(BASE_RUN, "stdout.txt"), "utf8").split("\n")) {
        const h = /^## (pinball-[a-z-]+)\.mp4: the cross-table/.exec(line);
        if (h) current = h[1];
        if (current === stem && line.startsWith("per-frame rows' SHA-256: ")) prefix = new RegExp(`G0/s${seed} ([0-9a-f]{12})`).exec(line)?.[1] ?? null;
    }
    if (prefix === null) fatal(`${stem} G0 s${seed}: not listed in ${BASE_RUN}/stdout.txt`);
    const path = join(BASE_RUN, `${stem}-G0-s${seed}.jsonl`);
    if (!existsSync(path)) fatal(`${path}: missing`);
    const bytes = readFileSync(path);
    if (!sha256(bytes).startsWith(prefix)) fatal(`${path}: SHA-256 ${sha256(bytes).slice(0, 12)}, listed ${prefix}`);
    return bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// =============================================================================================
// One clip, in a child: every seed, both checkouts in lockstep.
// =============================================================================================
async function child(clip) {
    const imp = (root, rel) => import(pathToFileURL(join(resolve(root), rel)).href);
    const side = async (root) => ({
        backend: await imp(root, "packages/cv-backend-jsfeatnext/dist/index.js"),
        tracker: await imp(root, "packages/nft-tracker/dist/index.js"),
    });
    const base = await side(BASE);
    const tip = await side(TIP);
    const { fitSize } = await imp(BASE, "examples/js/pinball-shared.mjs");
    const { PAGE_PROCESSING_BOX } = await imp(BASE, "examples/js/bench-metrics.mjs");

    const realRandom = Math.random;
    let randomReads = 0;
    Math.random = function countedRandom() {
        randomReads++;
        return realRandom();
    };

    // ---- decoding, copied from scripts/replay-clips.mjs (lines 441 to 508 at 9b387ae) ---------
    function probe(path) {
        const json = JSON.parse(
            execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path], { maxBuffer: 64 << 20 }).toString(),
        );
        return { width: json.streams[0].width, height: json.streams[0].height, pts: json.frames.map((f) => Number(f.pts_time)) };
    }
    function greyFrames(path, width, height) {
        const rgb = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf", `scale=${width}:${height}:flags=bilinear`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
        const n = width * height;
        const frames = [];
        for (let o = 0; o + 3 * n <= rgb.length; o += 3 * n) {
            const data = new Uint8Array(n);
            for (let i = 0, p = o; i < n; i++, p += 3) data[i] = (rgb[p] * (BREAK === "decode-luma" ? 0.3 : 0.299) + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
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
    // replay-clips.mjs lines 542 to 552.
    const loopPeriod = (pts) => pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);
    const loopTimes = (pts, loops) => {
        const period = loopPeriod(pts);
        return Array.from({ length: loops * pts.length }, (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period);
    };

    const mulberry32 = (seed) => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    const { frames, pts, width, height } = loadClip(clip);
    const times = loopTimes(pts, LOOPS);
    const n = pts.length;
    lap(`${clip}: decoded ${n} frames at ${width}x${height}`);
    const make = async (s) => {
        const decoded = s.tracker.decode(new Uint8Array(readFileSync(join(ROOT, "examples/targets/pinball.wnft"))));
        if (!decoded.ok) fatal(`pinball.wnft: ${decoded.error}`);
        const cv = await s.backend.createJsfeatNextBackend();
        const K = s.backend.intrinsics(width, height);
        const [gw, gh] = decoded.target.pyramid.levelSizes[0];
        return { ...s, cv, K, target: decoded.target, grid: s.tracker.targetGrid(gw, gh) };
    };
    const B = await make(base);
    const T = await make(tip);
    // The probe's wrapper, less its log: rng into estimateHomography, the result unchanged.
    const wrap = (cv, rng) => {
        const w = {};
        for (const key of new Set([...Object.keys(cv), ...Object.getOwnPropertyNames(Object.getPrototypeOf(cv))])) {
            if (key === "constructor") continue;
            const v = cv[key];
            w[key] = typeof v === "function" ? v.bind(cv) : v;
        }
        w.estimateHomography = (src, dst, options) => cv.estimateHomography(src, dst, { ...options, rng });
        return w;
    };
    const results = [];
    for (const seed of SEEDS) {
        if (ONLY !== null && ONLY !== `${clip}:${seed}`) continue;
        const rows = probeRows(clip, seed);
        if (rows.length !== times.length) fatal(`${clip} s${seed}: the probe's G0 has ${rows.length} rows, the schedule ${times.length}`);
        const tb = new B.tracker.NftTracker(wrap(B.cv, mulberry32(seed)), B.target, B.K);
        const tt = new T.tracker.NftTracker(wrap(T.cv, mulberry32(seed)), T.target, T.K);
        const c = comparer(`${clip} s${seed}`);
        randomReads = 0;
        for (let k = 0; k < times.length; k++) {
            const i = k % n;
            const timestampMs = times[k] * 1000;
            const rb = tb.process(frames[i], timestampMs);
            const rt = tt.process(frames[i], timestampMs);
            // Tied to the probe: the base's state, and on DETECT its H and column, are the G0 row's.
            const row = rows[k];
            if (row.k !== k || row.state !== rb.state) fatal(`${clip} s${seed}, frame ${k}: base ${rb.state}, the probe's G0 ${row.state}`);
            if (rb.state === "DETECT") {
                if (row.H.some((v, j) => v !== rb.H[j])) fatal(`${clip} s${seed}, frame ${k}: the base's H is not the probe's G0 row's`);
                const sd = sideOf(rb.H, B.grid).side;
                if (sd !== row.gate.side) fatal(`${clip} s${seed}, frame ${k}: the base's column ${sd}, the probe's ${row.gate.side}`);
            }
            c.frame(k, rb, rt);
        }
        if (randomReads !== 0) fatal(`${clip} s${seed}: ${randomReads} reads of Math.random with the rng injected`);
        results.push(c.end(times.length, times.length));
        lap(`${clip} s${seed}`);
    }
    Math.random = realRandom;
    writeFileSync(join(OUT, `${clip}.c0.json`), JSON.stringify(results));
}

// =============================================================================================
// The sequences, in the parent (under --experimental-transform-types).
// =============================================================================================
async function sequences() {
    const { registerHooks } = await import("node:module");
    registerHooks({
        resolve(specifier, context, next) {
            try {
                return next(specifier, context);
            } catch (e) {
                const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
                if (e && e.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) return next(`${specifier.slice(0, -3)}.ts`, context);
                throw e;
            }
        },
    });
    const load = (root, rel) => import(pathToFileURL(join(resolve(root), rel)).href);
    const runAll = async (root) => {
        const seq = await load(root, "packages/nft-tracker/ground-truth/tracker_sequences.ts");
        const nft = await load(root, "packages/nft-tracker/src/index.ts");
        const jb = await load(root, "packages/cv-backend-jsfeatnext/src/index.ts");
        const cv = await jb.createJsfeatNextBackend();
        const K = jb.intrinsics(seq.CAMERA.width, seq.CAMERA.height);
        const [w0, h0] = seq.shippedTarget().pyramid.levelSizes[0];
        const grid = nft.targetGrid(w0, h0);
        const runs = [["leave and return", seq.shippedLeaveAndReturn(cv, K)], ["wander", seq.shippedWander(cv, K)], ...seq.shippedVelocitySteps(cv, K).map((x) => [`velocity ${x.v}`, x])];
        return { runs, grid };
    };
    const base = await runAll(BASE);
    const tip = await runAll(TIP);
    // Tied to the probe: the base's DETECT frames and their columns are the base expressibility stdout's.
    const recorded = [];
    let pending = [];
    for (const line of readFileSync(join(BASE_RUN, "expressibility.txt"), "utf8").split("\n")) {
        const m = /^ {2}every DETECT: frame (\d+), (\d+) inliers, (\S+) × /.exec(line);
        if (m) pending.push(`${m[1]} ${m[2]} ${m[3]}`);
        const s = /^sequence (.+?): \d+ frames/.exec(line);
        if (s) {
            recorded.push([s[1], pending]);
            pending = [];
        }
    }
    const out = [];
    for (const [j, [name, rb]] of base.runs.entries()) {
        const [tname, rt] = tip.runs[j];
        if (tname !== name || recorded[j]?.[0] !== name) fatal(`sequence ${j}: ${name}, tip ${tname}, recorded ${recorded[j]?.[0]}`);
        const mine = rb.results.flatMap((x, k) => (x.ok && x.state === "DETECT" ? [`${k} ${x.numInliers} ${sideOf(x.H, base.grid).side}`] : []));
        if (mine.join("|") !== recorded[j][1].join("|")) fatal(`sequence ${name}: the base's DETECT frames and columns are not the expressibility stdout's`);
        const c = comparer(`sequence ${name}`);
        const len = Math.min(rb.results.length, rt.results.length);
        for (let k = 0; k < len; k++) c.frame(k, rb.results[k], rt.results[k]);
        out.push(c.end(rb.results.length, rt.results.length));
    }
    return out;
}

// =============================================================================================
// The parent.
// =============================================================================================
if (CHILD !== null) {
    if (OUT === null) fatal("--child needs --out");
    await child(CHILD);
    process.exit(0);
}
const out = mkdtempSync(join(tmpdir(), "c0-"));
const self = fileURLToPath(import.meta.url);
const clips = ONLY === null ? CLIPS : CLIPS.filter((c) => ONLY.startsWith(`${c}:`));
const seqOnly = ONLY === "sequences";
const codes = seqOnly
    ? []
    : await Promise.all(
          clips.map(
              (clip) =>
                  new Promise((done) => {
                      const p = spawn(process.execPath, [self, ...argv, "--child", clip, "--out", out], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
                      p.on("exit", (code) => done([clip, code]));
                  }),
          ),
      );
for (const [clip, code] of codes) if (code !== 0) fatal(`${clip}: its child exited ${code}; no figure is printed`);
const all = [];
if (!seqOnly) for (const clip of clips) all.push(...JSON.parse(readFileSync(join(out, `${clip}.c0.json`), "utf8")));
if (ONLY === null || seqOnly) all.push(...(await sequences()));
console.log(`#202 Stage 3 C0: base ${execFileSync("git", ["-C", BASE, "rev-parse", "HEAD"]).toString().trim()}, tip ${execFileSync("git", ["-C", TIP, "rev-parse", "HEAD"]).toString().trim()}; node ${process.version}${BREAK ? `; --break ${BREAK}` : ""}${ONLY ? `; --only ${ONLY}` : ""}`);
for (const r of all) print(r);
const differing = all.reduce((s, r) => s + r.lines.length, 0);
console.log(`C0: ${differing === 0 ? "no differing field outside exceptions (i) and (ii), on any clip, seed or sequence" : `${differing} differing entries`}`);
process.exit(differing === 0 ? 0 : 1);
