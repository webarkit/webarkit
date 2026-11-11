/*
 *  2026-11-11-243-run-check.mjs
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
 * M9's run-level check (#243): "What must exist before the pre-flight", item 2, of
 * docs/benchmarks/2026-11-10-243-registration.md ("the registration"), with the maintainer's
 * rulings of 2026-11-11 in docs/benchmarks/2026-11-11-243-registration-addendum.md. It reads
 * validity rules V1 to V8 from one export and its three `.txt` files, prints each rule's verdict
 * and no pose figure, and exits 1 when any rule fails (2 when it cannot read its inputs). The
 * runbook's step 6 of "Each run, in order". The freeze holds it from the pre-flight on.
 *
 *     node docs/benchmarks/2026-11-11-243-run-check.mjs --manifest <the freeze's provenance.json> \
 *         [--form counted|preflight-cross|preflight-static|preflight-filter|preflight-fidelity] <export.json>
 *
 * `--manifest` is the freeze's manifest, `examples/dist/provenance.json` of the serving checkout
 * at the freeze's head (V2). `--form` names which of the runbook's pinned strings the run used:
 * `counted` (the default; runs 1 to 32), or one of the pre-flight's five exports, which "pass V1
 * to V8, with V6 read for its own arm and parameters" ("The pre-flight", item 6).
 *
 * The three files, beside the export, named after it without `.json` (the runbook, "Each run, in
 * order", steps 2, 3 and 5):
 *
 * - `<export>.url.txt`: the URL the run was opened with, the one line the `adb … am start`
 *   command passed (V3, "the recorded URL", as M4's rule 3: `docs/benchmarks/README.md`, the
 *   2026-10-13 entry, validity rule 3). One trailing line ending is allowed.
 * - `<export>.clip.txt`: the clip's SHA-256 on the serving machine, read when the URL is opened
 *   and again after the export is pulled (V4). The maintainer's ruling of 2026-11-11 (the
 *   addendum's entry 2): exactly two lines in time order, each
 *   `<ISO-8601 UTC time ending in Z> <64 lowercase hex> examples/videos/<clip>`, the path naming
 *   the export's `bundledClip`, written by the addendum's command.
 * - `<export>.link.txt`: the link monitor's log (V7), M4's setup item 4 (README, the 2026-10-13
 *   entry): its `## begin` and `## end` sections hold `adb devices -l` and `adb reverse --list`,
 *   its `## adb.log lines written between begin and end` section what the adb server's log
 *   gained, and its `## verdict` section the monitor's own reading. "No drop holds when all three
 *   agree": no `connection terminated` line naming the device, the same `transport_id` at both
 *   ends, the mapping at both ends. This check reads the three from the log itself, and requires
 *   the monitor's `no drop: true` to agree.
 *
 * Every rule is exercised both ways in examples/test/m9-run-check.test.mjs, which imports this
 * module: run as a script it reads its arguments, imported it only exports.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "2026-11-11-243-run-check.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.WEBARKIT_ROOT
    ? resolve(process.env.WEBARKIT_ROOT)
    : resolve(HERE, "..", "..");
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const trackerPkg = await imp("packages/nft-tracker/dist/index.js");
const metrics = await imp("examples/js/bench-metrics.mjs");
const { sessionDefaults } = await imp("examples/js/bench-export-checks.mjs");
const { poseFilterOption, TUNABLE_TRACKER_OPTIONS } = await imp("examples/js/bench-params.mjs");
const { countLoopWraps } = metrics;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// =============================================================================================
// The registered values.
// =============================================================================================

/** The page's address in the runbook's route. */
export const PAGE_URL = "http://localhost:8093/examples/bench-nft.html";
/** The tablet the runbook names. */
export const DEVICE = "Tab9WEEA0001504";
/** V4: the target's SHA-256, and the clips', the registration's Step 0 table. */
export const TARGET_SHA256 = "9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282";
export const CLIP_SHA256 = Object.freeze({
    "pinball-static.mp4": "978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6",
    "pinball-bench-table.mp4": "06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d",
    "pinball-bench.mp4": "6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d",
    "pinball-tilt-cross.mp4": "3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e",
});
/** V8: `scripts/stall-check.mjs` at Step 0's hash. */
export const STALL_CHECK_SHA256 = "8d1b3abf63ec17840351e82f3262ab8f74bbd3108575686d284da733b17c2983";
/** The runbook's blocks: runs 1–8 static, 9–16 cross, 17–24 table, 25–32 wall. */
export const BLOCKS = Object.freeze([
    { from: 1, to: 8, clip: "pinball-static.mp4" },
    { from: 9, to: 16, clip: "pinball-tilt-cross.mp4" },
    { from: 17, to: 24, clip: "pinball-bench-table.mp4" },
    { from: 25, to: 32, clip: "pinball-bench.mp4" },
]);
const COUNTED = (clip, n) =>
    `?mode=tracking&target=wnft&detection=sync&clip=${clip}&loops=4&window=2000&seed=1&run=${n}`;
/**
 * Each form: its pinned string for an export's `bundledClip` and `run.order` (null when the pair
 * is not the form's), its mode, and its filter. The strings are the runbook's, "The pinned strings".
 */
export const FORMS = Object.freeze({
    counted: {
        mode: "tracking",
        filter: "off",
        sessionRun: true,
        string: (clip, n) => (BLOCKS.some((b) => b.clip === clip && n >= b.from && n <= b.to) ? COUNTED(clip, n) : null),
    },
    "preflight-cross": {
        mode: "tracking",
        filter: "off",
        sessionRun: true,
        string: (clip, n) => (clip === "pinball-tilt-cross.mp4" && n === 1 ? COUNTED(clip, n) : null),
    },
    "preflight-static": {
        mode: "tracking",
        filter: "off",
        sessionRun: true,
        string: (clip, n) => (clip === "pinball-static.mp4" && n === 2 ? COUNTED(clip, n) : null),
    },
    "preflight-filter": {
        mode: "tracking",
        filter: "one-euro",
        sessionRun: true,
        string: (clip, n) =>
            clip === "pinball-static.mp4" && n === 1
                ? "?mode=tracking&target=wnft&detection=sync&clip=pinball-static.mp4&loops=4&window=2000&seed=1&poseFilter=one-euro&run=1"
                : null,
    },
    "preflight-fidelity": {
        mode: "detection-only",
        filter: "off",
        // "The two detection-only runs are not session runs by sessionRunGaps … so V6's sessionRun is not read on them."
        sessionRun: false,
        string: (clip, n) =>
            clip === "pinball-static.mp4" && (n === 1 || n === 2)
                ? `?mode=detection-only&target=wnft&clip=pinball-static.mp4&loops=4&window=2000&seed=1&run=${n}`
                : null,
    },
});

// =============================================================================================
// The rules. Each returns `[]` when it passes, or one line per reason it fails.
// =============================================================================================

const shown = (v) => (v === undefined ? "absent" : JSON.stringify(v));

/** Two JSON values equal, objects key by key whatever their order. */
export function deepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** V1: `run.failure` is `null` and `run.endedBy` is `"done"`. */
export function v1(e) {
    const why = [];
    if (e?.run?.failure !== null) why.push(`run.failure is ${shown(e?.run?.failure)}, not null`);
    if (e?.run?.endedBy !== "done") why.push(`run.endedBy is ${shown(e?.run?.endedBy)}, not "done"`);
    return why;
}

/**
 * V2: the manifest is the freeze's. The head in full; `clean` true and `dirtyPaths` empty, compared
 * with each other; every other field equal to the freeze manifest's, field for field, `builtAt` alone apart.
 */
export function v2(e, freeze) {
    const m = e?.provenance?.manifest;
    if (m == null) return ["provenance.manifest is absent"];
    const why = [];
    if (typeof m.head !== "string" || m.head !== freeze.head) why.push(`provenance.manifest.head ${shown(m.head)} is not the freeze's ${freeze.head}`);
    if (m.clean !== true) why.push(`clean is ${shown(m.clean)}`);
    if (!Array.isArray(m.dirtyPaths) || m.dirtyPaths.length !== 0) why.push(`dirtyPaths is ${shown(m.dirtyPaths)}, not empty`);
    if (Array.isArray(m.dirtyPaths) && (m.clean === true) !== (m.dirtyPaths.length === 0)) why.push(`clean ${shown(m.clean)} and dirtyPaths ${shown(m.dirtyPaths)} disagree`);
    const keys = new Set([...Object.keys(m), ...Object.keys(freeze)]);
    for (const k of [...keys].sort()) {
        if (k === "builtAt" || k === "head") continue;
        if (!deepEqual(m[k], freeze[k])) why.push(`manifest field ${k} differs from the freeze manifest's`);
    }
    return why;
}

/**
 * V3: the parameters are the pinned string's, exactly: the field check (M4's rule 3, with this
 * campaign's `seed=1` and, in the filter's form, `poseFilter=one-euro`) and the recorded URL. Both must pass.
 */
export function v3(e, urlText, form, defaults) {
    const F = FORMS[form];
    const why = [];
    const clip = e?.bundledClip;
    const n = e?.run?.order;
    const pinned = F.string(clip, n);
    if (pinned === null) why.push(`the ${form} form pins no string for clip ${shown(clip)} and run.order ${shown(n)} (the runbook's table)`);
    // The field check.
    if (e?.mode !== F.mode) why.push(`mode ${shown(e?.mode)}, not ${F.mode}`);
    if (e?.target?.source !== "wnft") why.push(`target.source ${shown(e?.target?.source)}, not wnft`);
    if (e?.target?.file !== defaults.targetFile) why.push(`target.file ${shown(e?.target?.file)}, not ${defaults.targetFile}`);
    if (e?.detection?.path !== "sync") why.push(`detection.path ${shown(e?.detection?.path)}, not sync`);
    if (e?.source !== "bundled") why.push(`source ${shown(e?.source)}, not bundled`);
    if (e?.loops?.firstLoop !== 1 || e?.loops?.loopCount !== 4) why.push(`loops ${shown(e?.loops)}, not loops=4 (firstLoop 1, loopCount 4)`);
    if (e?.seed !== 1) why.push(`seed ${shown(e?.seed)}, not 1`);
    if (e?.seedPolicy !== "frame") why.push(`seedPolicy ${shown(e?.seedPolicy)}, not frame`);
    const wantFilter = poseFilterOption(F.filter === "one-euro" ? "one-euro" : null, trackerPkg);
    if (!deepEqual(e?.tracker?.options?.poseFilter, wantFilter)) why.push(`tracker.options.poseFilter ${shown(e?.tracker?.options?.poseFilter)}, not ${JSON.stringify(wantFilter)}`);
    if (e?.maxKeypoints !== defaults.maxKeypoints) why.push(`maxKeypoints ${shown(e?.maxKeypoints)}, not ${defaults.maxKeypoints}`);
    if (e?.processingBox?.width !== defaults.processingBox.width || e?.processingBox?.height !== defaults.processingBox.height) why.push(`processingBox ${shown(e?.processingBox)}, not ${defaults.processingBox.width} × ${defaults.processingBox.height}`);
    if (e?.camera !== null) why.push(`camera ${shown(e?.camera)}, not null`);
    for (const key of TUNABLE_TRACKER_OPTIONS) {
        if (e?.tracker?.options?.[key] !== defaults.trackerOptions[key]) why.push(`tracker option ${key} ${shown(e?.tracker?.options?.[key])}, not its default ${defaults.trackerOptions[key]}`);
    }
    if (!(Number.isInteger(e?.ticks) && e.ticks === e?.windowSize)) why.push(`ticks ${shown(e?.ticks)} and windowSize ${shown(e?.windowSize)}: window=2000 lost a frame`);
    // The recorded URL, character for character.
    if (urlText === null) why.push("the .url.txt file is missing");
    else if (pinned !== null) {
        const url = urlText.replace(/\r?\n$/, "");
        if (url !== PAGE_URL + pinned) why.push(`the recorded URL ${JSON.stringify(url)} is not ${JSON.stringify(PAGE_URL + pinned)}`);
    }
    return why;
}

/** The addendum's line: `date -u +%Y-%m-%dT%H:%M:%SZ`, whole seconds, then the hash and the path. */
const CLIP_LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) ([0-9a-f]{64}) (\S+)$/;

/**
 * V4: `target.sha256` in full, and `.clip.txt` by the addendum's entry 2: exactly two lines in
 * time order, each `<UTC time ending in Z> <64 lowercase hex> examples/videos/<bundledClip>`, both
 * hashes Step 0's for that clip.
 */
export function v4(e, clipText) {
    const why = [];
    if (e?.target?.sha256 !== TARGET_SHA256) why.push(`target.sha256 ${shown(e?.target?.sha256)}, not ${TARGET_SHA256}`);
    const clip = e?.bundledClip;
    const want = CLIP_SHA256[clip];
    if (want === undefined) why.push(`bundledClip ${shown(clip)} is not one of the campaign's clips`);
    if (clipText === null) return [...why, "the .clip.txt file is missing"];
    const lines = clipText.replace(/\n$/, "").split("\n");
    if (lines.length !== 2) return [...why, `.clip.txt has ${lines.length} lines, not 2`];
    const times = [];
    for (const [i, line] of lines.entries()) {
        const m = CLIP_LINE.exec(line);
        if (m === null) {
            why.push(`.clip.txt line ${i + 1} is not "<UTC time ending in Z> <64 lowercase hex> examples/videos/<clip>": ${JSON.stringify(line)}`);
            continue;
        }
        const [, time, hash, path] = m;
        const t = Date.parse(time);
        if (!Number.isFinite(t)) why.push(`.clip.txt line ${i + 1}: ${time} is not a time`);
        times.push(t);
        if (path !== `examples/videos/${clip}`) why.push(`.clip.txt line ${i + 1} names ${path}, not examples/videos/${clip}`);
        if (hash !== want) why.push(`.clip.txt line ${i + 1}: SHA-256 ${hash}, not ${clip}'s ${want}`);
    }
    if (times.length === 2 && !(times[0] <= times[1])) why.push(".clip.txt's two readings are not in time order");
    return why;
}

/** V5: provenance at Start. `refusal` null; every served path's observed hash the manifest's; the bundle's too. */
export function v5(e) {
    const p = e?.provenance;
    if (p == null) return ["provenance is absent"];
    const why = [];
    if (p.refusal !== null) why.push(`provenance.refusal is ${shown(p.refusal)}`);
    const served = p.manifest?.served ?? {};
    const observed = p.observed?.served ?? {};
    // Every path either names: an observed path the manifest lacks, or a manifest path not observed, fails.
    for (const path of [...new Set([...Object.keys(served), ...Object.keys(observed)])].sort()) {
        if (observed[path] !== served[path]?.sha256) why.push(`observed.served[${path}] ${shown(observed[path])} is not the manifest's ${shown(served[path]?.sha256)}`);
    }
    if (Object.keys(served).length === 0) why.push("the manifest serves nothing");
    if (p.observed?.bundleSha256 !== p.manifest?.bundle?.sha256) why.push(`observed.bundleSha256 ${shown(p.observed?.bundleSha256)} is not manifest.bundle.sha256 ${shown(p.manifest?.bundle?.sha256)}`);
    return why;
}

/** V6: the arm and the draws, read for the form's own arm and parameters. */
export function v6(e, form) {
    const F = FORMS[form];
    const why = [];
    if (e?.metricsVersion !== 2) why.push(`metricsVersion ${shown(e?.metricsVersion)}, not 2`);
    const wantFilter = poseFilterOption(F.filter === "one-euro" ? "one-euro" : null, trackerPkg);
    if (!deepEqual(e?.tracker?.options?.poseFilter, wantFilter)) why.push(`tracker.options.poseFilter ${shown(e?.tracker?.options?.poseFilter)}, not ${JSON.stringify(wantFilter)}`);
    const guard = e?.tracker?.options?.poseGuard;
    if (e?.tracker?.options && "poseGuard" in e.tracker.options && guard?.mode !== "off") why.push(`tracker.options.poseGuard ${shown(guard)}: none, or mode "off"`);
    if (!e?.tracker?.options) why.push("tracker.options is absent");
    if (e?.seed !== 1) why.push(`seed ${shown(e?.seed)}, not 1`);
    if (e?.seedPolicy !== "frame") why.push(`seedPolicy ${shown(e?.seedPolicy)}, not "frame"`);
    if (F.sessionRun) {
        if (e?.protocol?.sessionRun !== true) why.push(`protocol.sessionRun ${shown(e?.protocol?.sessionRun)}, not true`);
        if (!Array.isArray(e?.protocol?.gaps) || e.protocol.gaps.length !== 0) why.push(`protocol.gaps ${shown(e?.protocol?.gaps)}, not none`);
    }
    return why;
}

/**
 * The link monitor's log, read: each section's lines by its heading, and the headings that appear
 * more than once, which V7 refuses rather than let a later section replace an earlier one (the
 * maintainer's ruling of 2026-11-11 on Qodo's finding on #251).
 */
function sections(text) {
    const out = {};
    const repeated = new Set();
    let cur = null;
    for (const line of text.split(/\r?\n/)) {
        const h = /^## (\S+)/.exec(line);
        if (h) {
            cur = h[1];
            if (cur in out) repeated.add(cur);
            else out[cur] = [];
        } else if (cur !== null) out[cur].push(line);
    }
    return { out, repeated };
}

/** V7: no drop, attested by the link monitor (M4's setup item 4): the three conditions, read from the log, and its own verdict. */
export function v7(linkText) {
    if (linkText === null) return ["the .link.txt file is missing"];
    const { out: s, repeated } = sections(linkText);
    const why = [];
    for (const name of ["begin", "end", "adb.log", "verdict"]) {
        if (!s[name]) why.push(`the link log has no "## ${name}" section`);
        else if (repeated.has(name)) why.push(`the link log has the "## ${name}" section more than once`);
    }
    if (why.length) return why;
    const transport = (lines) => {
        const ids = lines.map((l) => new RegExp(`^${DEVICE}\\s+device\\b.*\\btransport_id:(\\d+)`).exec(l)).filter(Boolean);
        return ids.length === 1 ? ids[0][1] : null;
    };
    const mapping = (lines) => lines.some((l) => /\btcp:8093 tcp:8093\b/.test(l) && !l.startsWith("$"));
    const tb = transport(s.begin);
    const te = transport(s.end);
    if (tb === null || te === null) why.push(`the device's transport_id is not read at both ends (begin ${tb}, end ${te})`);
    else if (tb !== te) why.push(`transport_id changed, ${tb} to ${te}: the link reconnected`);
    if (!mapping(s.begin)) why.push("the mapping tcp:8093 tcp:8093 is not shown at the begin");
    if (!mapping(s.end)) why.push("the mapping tcp:8093 tcp:8093 is not shown at the end");
    const terminated = s["adb.log"].filter((l) => /connection terminated/i.test(l) && l.includes(DEVICE));
    if (terminated.length) why.push(`${terminated.length} connection terminated line(s) name ${DEVICE}`);
    if (!s.verdict.some((l) => l.trim() === "no drop: true")) why.push('the monitor\'s verdict does not read "no drop: true"');
    return why;
}

/**
 * V8: the loops. The page's loop-wrap rule refused nothing (no failure of the run that is its
 * refusal, and every step back in the export's frames read as a wrap by the frozen rule), and
 * `scripts/stall-check.mjs`, at Step 0's hash, passes on the export.
 */
export function v8(e, exportPath, { root = ROOT } = {}) {
    const why = [];
    const failure = e?.run?.failure;
    if (typeof failure === "string" && /not the clip restarting/.test(failure)) why.push(`the loop-wrap rule refused the run: ${failure}`);
    try {
        countLoopWraps(e?.frames ?? [], { clipDurationS: e?.clipDurationS ?? null });
    } catch (err) {
        why.push(`the loop-wrap rule refuses a step back: ${err.message}`);
    }
    const script = join(root, "scripts", "stall-check.mjs");
    const got = existsSync(script) ? sha256(readFileSync(script)) : null;
    if (got !== STALL_CHECK_SHA256) return [...why, `scripts/stall-check.mjs has SHA-256 ${got}, not Step 0's ${STALL_CHECK_SHA256}`];
    const r = spawnSync(process.execPath, [script, exportPath], { encoding: "utf8" });
    if (r.status !== 0) why.push(`stall-check.mjs exits ${r.status}: ${(r.stdout + r.stderr).trim().split(/\r?\n/).filter((l) => l.startsWith("FAIL") || /cannot|not a JSON/.test(l)).join("; ") || "no verdict"}`);
    return why;
}

/** The three files beside an export, each its text or null. */
export function sidecars(exportPath) {
    const stem = exportPath.replace(/\.json$/, "");
    const read = (ext) => (existsSync(`${stem}.${ext}.txt`) ? readFileSync(`${stem}.${ext}.txt`, "utf8") : null);
    return { url: read("url"), clip: read("clip"), link: read("link") };
}

/** Every rule on one export: `[[rule, reasons]]`, in order V1 to V8. */
export function checkRun({ e, exportPath, freeze, form = "counted", files, root = ROOT }) {
    if (!(form in FORMS)) throw new Error(`--form ${form}: not one of ${Object.keys(FORMS).join(", ")}`);
    const defaults = sessionDefaults(trackerPkg);
    return [
        ["V1", v1(e)],
        ["V2", v2(e, freeze)],
        ["V3", v3(e, files.url, form, defaults)],
        ["V4", v4(e, files.clip)],
        ["V5", v5(e)],
        ["V6", v6(e, form)],
        ["V7", v7(files.link)],
        ["V8", v8(e, exportPath, { root })],
    ];
}

function main(argv) {
    const usage = (why) => {
        process.stderr.write(`${SCRIPT}: ${why}\nusage: node docs/benchmarks/${SCRIPT} --manifest <provenance.json> [--form <form>] <export.json>\n`);
        process.exit(2);
    };
    const val = (flag) => {
        const i = argv.indexOf(flag);
        if (i < 0) return null;
        if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) usage(`${flag} needs a value`);
        return argv[i + 1];
    };
    const manifestPath = val("--manifest");
    const form = val("--form") ?? "counted";
    const files = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--manifest" && argv[i - 1] !== "--form");
    if (manifestPath === null) usage("--manifest is required");
    if (!(form in FORMS)) usage(`--form ${form}: not one of ${Object.keys(FORMS).join(", ")}`);
    if (files.length !== 1) usage("one export, please");
    let e;
    let freeze;
    try {
        freeze = JSON.parse(readFileSync(manifestPath, "utf8"));
        e = JSON.parse(readFileSync(files[0], "utf8"));
    } catch (err) {
        usage(`cannot read the inputs: ${err.message}`);
    }
    const verdicts = checkRun({ e, exportPath: files[0], freeze, form, files: sidecars(files[0]) });
    process.stdout.write(`# ${SCRIPT}: ${files[0]}, form ${form}, freeze head ${freeze.head}\n`);
    for (const [rule, why] of verdicts) {
        process.stdout.write(`${rule} ${why.length === 0 ? "PASS" : "FAIL"}\n`);
        for (const w of why) process.stdout.write(`  - ${w}\n`);
    }
    const failed = verdicts.filter(([, why]) => why.length > 0).map(([r]) => r);
    process.stdout.write(failed.length === 0 ? "run check: PASS\n" : `run check: FAIL (${failed.join(", ")})\n`);
    process.exit(failed.length === 0 ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
