/*
 *  2026-11-22-278-stage1-negatives.mjs
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
 * #278: the guards and fatal checks of `2026-11-22-278-stage1-tools.mjs`, exercised both ways at
 * the level of a mode, on real inputs. Each case copies the inputs it needs into `<work>`, perturbs
 * one thing, runs the mode, and passes only if the mode exits 1, names the fault (a fixed substring
 * of its message) and writes no `<mode>.jsonl`. Each mode's control, the same inputs unperturbed,
 * passes only if the mode exits 0 and writes it. Nothing is written inside the repository.
 *
 *     npm run build
 *     node docs/benchmarks/2026-11-22-278-stage1-negatives.mjs --runs <runs> --work <parent> [--only <name part,…>]
 *     node docs/benchmarks/2026-11-22-278-stage1-negatives.mjs --self-test
 *
 * `<parent>` is an **existing** directory outside the repository: canonicalised (`realpathSync`),
 * it is refused if it is the repository, inside it, or contains it. The script creates its own
 * fresh directory in it (`278-negatives-XXXXXX`, `mkdtempSync`) and **never removes a path it did
 * not create**: it removes that directory only after every case has passed, then checks that
 * every entry the parent held before the run is still there; on a failure it leaves the directory
 * and prints its path. `--only` runs the cases whose name contains one of the parts given.
 *
 * `<runs>` holds `2026-11-14-272-stage1-probe.mjs runs --levers none`'s files for the table clip on
 * `every` and `device-15` (`run-table-none-s<1-8>-<schedule>.json`) and its `--mirror` ones for
 * table and wall. Every run of the tools here is labelled `--trial`; its outputs are discarded with
 * the script's own directory.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TOOLS = join(ROOT, "docs/benchmarks/2026-11-22-278-stage1-tools.mjs");
const BENCH = join(ROOT, "docs/benchmarks");
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fail(why) {
    console.error(`278-stage1-negatives: ${why}`);
    process.exit(1);
}
const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? null : process.argv[i + 1];
};

/** A path, canonical: symbolic links and junctions resolved, and case-folded on Windows. */
const canon = (p) => {
    const r = realpathSync.native(p);
    return process.platform === "win32" ? r.toLowerCase() : r;
};
const within = (a, b) => a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
/** `--work`'s parent: an existing directory, neither the repository nor inside it nor containing it, compared canonically. A refusal string or null. */
export function workRefusal(parent, root) {
    let p;
    try {
        if (!statSync(parent).isDirectory()) return `--work ${parent} is not a directory`;
        p = canon(parent);
    } catch {
        return `--work ${parent} does not exist: it names an existing parent directory`;
    }
    const r = canon(root);
    if (p === r) return `--work ${parent} is the repository`;
    if (within(p, r)) return `--work ${parent} is inside the repository (${r})`;
    if (within(r, p)) return `--work ${parent} contains the repository (${r})`;
    return null;
}

if (process.argv.includes("--self-test")) {
    const fails = [];
    const T = (name, ok) => ok || fails.push(name);
    const scratch = mkdtempSync(join(tmpdir(), "278-negatives-selftest-"));
    const link = join(scratch, "into-repo");
    try {
        T("the repository's parent is refused", workRefusal(dirname(realpathSync.native(ROOT)), ROOT) !== null);
        T("the repository is refused", workRefusal(ROOT, ROOT) !== null);
        symlinkSync(join(ROOT, "docs"), link, "junction");
        T("a path through a directory link into the repository is refused", workRefusal(link, ROOT) !== null);
        T("a path that does not exist is refused", workRefusal(join(scratch, "nothing-here"), ROOT) !== null);
        T("a directory outside the repository passes", workRefusal(scratch, ROOT) === null);
    } finally {
        // The link itself only, never what it points at.
        try {
            unlinkSync(link);
        } catch {
            try {
                rmdirSync(link);
            } catch {}
        }
        if (!existsSync(join(ROOT, "docs", "benchmarks"))) fail("the self-test's link removal touched the repository");
        rmSync(scratch, { recursive: true, force: true });
    }
    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
    process.exit(0);
}

const runs = arg("--runs");
const parentArg = arg("--work");
if (!runs || !parentArg) fail("--runs <dir> and --work <parent> are required");
const wr = workRefusal(parentArg, ROOT);
if (wr) fail(wr);
const parent = realpathSync.native(parentArg);
const parentBefore = readdirSync(parent);
const work = mkdtempSync(join(parent, "278-negatives-"));
const only = arg("--only") ? arg("--only").split(",") : null;
console.log(`work directory: ${work}`);

const readJ = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJ = (p, d) => writeFileSync(p, JSON.stringify(d));
let n = 0;
const results = [];

/** One case: a fresh folder, `prepare(dir)` builds the inputs, `args(dir)` the mode's arguments. */
function exercise({ name, mode, prepare, args, expect, node = [], check = null }) {
    if (only && !only.some((s) => name.includes(s))) return;
    const dir = join(work, `case-${++n}`);
    mkdirSync(dir, { recursive: true });
    prepare(dir);
    const out = join(dir, "out");
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [...node, TOOLS, mode, ...args(dir), "--out", out, "--trial"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
    const wrote = existsSync(join(out, `${mode}.jsonl`));
    let msg = (r.stderr || "").split("\n").filter((l) => l.startsWith("278-stage1-tools:")).join(" | ");
    const checked = expect === "pass" && wrote && check ? check(out) : null;
    if (checked) msg = `check: ${checked}`;
    const ok = expect === "pass" ? r.status === 0 && wrote && !checked : r.status === 1 && !wrote && msg.includes(expect);
    results.push({ name, ok, status: r.status, wrote, msg, seconds: (Date.now() - t0) / 1000 });
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: exit ${r.status}, ${wrote ? "wrote" : "no"} ${mode}.jsonl${msg ? ` — ${msg}` : ""}`);
    rmSync(dir, { recursive: true, force: true });
}

// --- paired: the table clip on every ----------------------------------------------------------
const tableRuns = (dir) => {
    const d = join(dir, "runs");
    mkdirSync(d, { recursive: true });
    for (const s of SEEDS) {
        const f = `run-table-none-s${s}-every.json`;
        if (!existsSync(join(runs, f))) fail(`${f} missing from ${runs}`);
        copyFileSync(join(runs, f), join(d, f));
    }
    return d;
};
const editRun = (dir, seed, edit) => {
    const p = join(dir, "runs", `run-table-none-s${seed}-every.json`);
    const d = readJ(p);
    edit(d);
    writeJ(p, d);
};
const pairedArgs = (extra = ["--gross-margin", "5"]) => (dir) => ["--runs", join(dir, "runs"), "--clips", "table", "--schedules", "every", ...extra];
const firstKeptStep = (d, pred = () => true) => d.steps.find((s) => s.ok && pred(s));

exercise({ name: "paired, control", mode: "paired", prepare: tableRuns, args: pairedArgs(), expect: "pass" });
exercise({ name: "paired, seed 8's run missing", mode: "paired", prepare: (d) => { tableRuns(d); rmSync(join(d, "runs", "run-table-none-s8-every.json")); }, args: pairedArgs(), expect: "missing: seed 8" });
exercise({ name: "paired, --seeds 1-7", mode: "paired", prepare: tableRuns, args: pairedArgs(["--gross-margin", "5", "--seeds", "1-7"]), expect: "seed(s) 8 missing" });
exercise({ name: "paired, an unknown schedule", mode: "paired", prepare: tableRuns, args: (d) => ["--runs", join(d, "runs"), "--clips", "table", "--schedules", "device-99", "--gross-margin", "5"], expect: "--schedules: device-99" });
exercise({ name: "paired, --gross-margin missing", mode: "paired", prepare: tableRuns, args: pairedArgs([]), expect: "--gross-margin is required" });
exercise({ name: "paired, --gross-margin not a number", mode: "paired", prepare: tableRuns, args: pairedArgs(["--gross-margin", "abc"]), expect: "is not a non-negative number" });
exercise({ name: "paired, a record off the clip's media times", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 3, (r) => { r.frames[10].mediaTimeSeconds += 0.001; }); }, args: pairedArgs(), expect: "no clip frame at that media time" });
exercise({ name: "paired, an every run one record short", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 3, (r) => { r.frames.pop(); }); }, args: pairedArgs(), expect: "records on every" });
exercise({ name: "paired, a run of another arm", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 2, (r) => { r.lever = "V"; }); }, args: pairedArgs(), expect: "not the none arm" });
exercise({ name: "paired, a first step's output H changed", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 1, (r) => { firstKeptStep(r, (s) => s.first).H[2] += 1; }); }, args: pairedArgs(), expect: "does not reproduce the run's step" });
exercise({ name: "paired, a TRACK record's corners changed", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 1, (r) => { const s = firstKeptStep(r, (x) => x.first); r.frames[s.frame].corners[0][0] += 1; }); }, args: pairedArgs(), expect: "corners are not the shipped H's" });
exercise({ name: "paired, a step's current not the record before's H", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 1, (r) => { r.steps[0].Hstart[2] += 1; }); }, args: pairedArgs(), expect: "current is not the record before's H" });
exercise({ name: "paired, a held step marked as a first step", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 1, (r) => { r.steps.find((s) => !s.first).first = true; }); }, args: pairedArgs(), expect: "a first step at record" });
exercise({ name: "paired, a held step after a refused one", mode: "paired", prepare: (d) => { tableRuns(d); editRun(d, 1, (r) => { const i = r.steps.findIndex((s) => !s.first); r.steps[i - 1].ok = false; }); }, args: pairedArgs(), expect: "does not follow a kept step" });
const refsWithout = (dir) => { const d = join(dir, "refs"); mkdirSync(d, { recursive: true }); return d; };
exercise({ name: "paired, table's reference missing", mode: "paired", prepare: (d) => { tableRuns(d); refsWithout(d); }, args: (d) => [...pairedArgs()(d), "--references", join(d, "refs")], expect: "2026-11-21-277-reference-table.json missing" });
exercise({
    name: "paired, table's reference with one byte changed",
    mode: "paired",
    prepare: (d) => {
        tableRuns(d);
        const b = readFileSync(join(BENCH, "2026-11-21-277-reference-table.json"));
        b[b.length - 2] ^= 1;
        writeFileSync(join(refsWithout(d), "2026-11-21-277-reference-table.json"), b);
    },
    args: (d) => [...pairedArgs()(d), "--references", join(d, "refs")],
    expect: "SHA-256",
});

// --- paired: a device schedule's run against replay-run.mjs's rule -----------------------------
const deviceRuns = (dir) => {
    const d = join(dir, "runs");
    mkdirSync(d, { recursive: true });
    for (const s of SEEDS) {
        const f = `run-table-none-s${s}-device-15.json`;
        if (!existsSync(join(runs, f))) fail(`${f} missing from ${runs}`);
        copyFileSync(join(runs, f), join(d, f));
    }
    return d;
};
const editDeviceRun = (dir, seed, edit) => {
    const p = join(dir, "runs", `run-table-none-s${seed}-device-15.json`);
    const d = readJ(p);
    edit(d);
    writeJ(p, d);
};
const devArgs = (dir) => ["--runs", join(dir, "runs"), "--clips", "table", "--schedules", "device-15", "--gross-margin", "5"];
// The table clip's frame times, from an every run's first loop.
const tablePts = () => readJ(join(runs, "run-table-none-s1-every.json")).frames.slice(0, 267).map((f) => f.mediaTimeSeconds);
exercise({ name: "paired, device-15 control", mode: "paired", prepare: deviceRuns, args: devArgs, expect: "pass" });
exercise({ name: "paired, a device run with another stepMs", mode: "paired", prepare: (d) => { deviceRuns(d); editDeviceRun(d, 2, (r) => { r.stepMs = 25; }); }, args: devArgs, expect: "stepMs 25, the device-15 schedule's is 15" });
exercise({
    name: "paired, a device run with one record moved to another frame",
    mode: "paired",
    prepare: (d) => {
        deviceRuns(d);
        const pts = tablePts();
        editDeviceRun(d, 3, (r) => {
            const i = pts.indexOf(r.frames[5].mediaTimeSeconds);
            r.frames[5].mediaTimeSeconds = pts[(i + 1) % pts.length];
        });
    },
    args: devArgs,
    expect: "where the rule puts clip frame",
});

// --- deep: the carry of the shipped arm against the run --------------------------------------
// Every held step of age 2 or more gets another output H in the runs (the records untouched):
// paired passes (it reads ages 0 and 1, and states from the records), and deep must refuse on the
// first carry of the shipped arm that reaches such a step.
const perturbLaterSteps = (d) => {
    tableRuns(d);
    for (const s of SEEDS)
        editRun(d, s, (r) => {
            let age = -1;
            for (const st of r.steps) {
                age = st.first ? 0 : age + 1;
                if (age >= 2 && st.ok) st.H[2] += 1;
            }
        });
};
exercise({ name: "paired, control on runs whose later held steps are changed", mode: "paired", prepare: perturbLaterSteps, args: pairedArgs(), expect: "pass" });
exercise({ name: "deep, control", mode: "deep", prepare: tableRuns, args: pairedArgs(), expect: "pass" });
exercise({ name: "deep, the run's later held steps changed", mode: "deep", prepare: perturbLaterSteps, args: pairedArgs(), expect: "the shipped arm's carry from record" });

// --- m9: the exports -------------------------------------------------------------------------
const exportNames = readdirSync(BENCH).filter((x) => /^2026-11-12-tab9-m9-(table|wall)-\d+\.json$/.test(x)).sort();
const exportsCopy = (dir) => {
    const d = join(dir, "exports");
    mkdirSync(d, { recursive: true });
    for (const x of exportNames) copyFileSync(join(BENCH, x), join(d, x));
    return d;
};
const editExport = (dir, name, edit) => {
    const p = join(dir, "exports", name);
    const d = readJ(p);
    edit(d);
    writeJ(p, d);
};
const m9Args = (extra = ["--repro-threshold", "1", "--gross-margin", "5"]) => (dir) => ["--exports", join(dir, "exports"), ...extra];
const wall = exportNames.find((x) => x.includes("-wall-"));
exercise({ name: "m9, control", mode: "m9", prepare: exportsCopy, args: m9Args(), expect: "pass" });
const otherWall = exportNames.filter((x) => x.includes("-wall-"))[1];
exercise({ name: "m9, two exports with the same run", mode: "m9", prepare: (d) => { exportsCopy(d); editExport(d, otherWall, (e) => { e.run.order = Number(/-(\d+)\.json$/.exec(wall)[1]); }); }, args: m9Args(), expect: "the same run" });
exercise({ name: "m9, an export whose run differs from its name", mode: "m9", prepare: (d) => { exportsCopy(d); editExport(d, otherWall, (e) => { e.run.order = 99; }); }, args: m9Args(), expect: "its file name says" });
exercise({ name: "m9, 15 exports", mode: "m9", prepare: (d) => { exportsCopy(d); rmSync(join(d, "exports", wall)); }, args: m9Args(), expect: "expected 16" });
exercise({ name: "m9, --repro-threshold missing", mode: "m9", prepare: exportsCopy, args: m9Args(["--gross-margin", "5"]), expect: "--repro-threshold is required" });
exercise({ name: "m9, another processing size", mode: "m9", prepare: (d) => { exportsCopy(d); editExport(d, wall, (e) => { e.processingResolution.width = 640; }); }, args: m9Args(), expect: "processed at" });
exercise({ name: "m9, a worker run", mode: "m9", prepare: (d) => { exportsCopy(d); editExport(d, wall, (e) => { e.detection.path = "worker"; }); }, args: m9Args(), expect: "not sync" });
exercise({ name: "m9, another clip", mode: "m9", prepare: (d) => { exportsCopy(d); editExport(d, wall, (e) => { e.bundledClip = "pinball-static.mp4"; }); }, args: m9Args(), expect: "neither table's nor wall's" });
exercise({ name: "m9, a record off the clip's media times", mode: "m9", prepare: (d) => { exportsCopy(d); editExport(d, wall, (e) => { e.frames[20].mediaTimeSeconds += 0.0005; }); }, args: m9Args(), expect: "cannot place" });
exercise({
    name: "m9, a lock whose detection is gone",
    mode: "m9",
    prepare: (d) => {
        exportsCopy(d);
        editExport(d, wall, (e) => {
            const k = e.frames.findIndex((f, i) => f.state === "DETECT" && e.frames[i + 1]?.state === "TRACK" && e.frames[i + 2]?.state === "TRACK");
            e.frames[k].state = "LOST";
        });
    },
    args: m9Args(),
    expect: "no detection started",
});

// --- wrong: the mirrored runs ----------------------------------------------------------------
const mirrorRuns = (dir) => {
    const d = join(dir, "runs");
    mkdirSync(d, { recursive: true });
    for (const c of ["table", "wall"])
        for (const s of SEEDS) {
            const f = `mirror-${c}-none-s${s}-every.json`;
            if (!existsSync(join(runs, f))) fail(`${f} missing from ${runs}`);
            copyFileSync(join(runs, f), join(d, f));
        }
    return d;
};
const TS = ["--experimental-transform-types"];
// The control also reads wrong's header: its inputs must list the mirrored runs and the sequences' source.
const wrongHeaderCheck = (out) => {
    const head = JSON.parse(readFileSync(join(out, "wrong.jsonl"), "utf8").split("\n")[0]);
    const files = Object.keys(head.inputs?.files ?? {});
    if (files.length !== 16 || !files.every((f) => /^mirror-(table|wall)-none-s[1-8]-every\.json$/.test(f))) return `the header lists ${files.length} mirrored runs, not 16`;
    if (!Object.values(head.inputs.files).every((h) => /^[0-9a-f]{64}$/.test(h))) return "a mirrored run without its SHA-256";
    if (head.inputs.sequences?.source !== "docs/benchmarks/2026-11-14-272-stage1-truth.mjs" || !/^[0-9a-f]{40}$/.test(head.inputs.sequences?.commit ?? "")) return "the header does not name the sequences' source and its commit";
    return null;
};
exercise({ name: "wrong, control", mode: "wrong", node: TS, prepare: mirrorRuns, args: (d) => ["--runs", join(d, "runs")], expect: "pass", check: wrongHeaderCheck });
exercise({ name: "wrong, a mirrored run missing", mode: "wrong", node: TS, prepare: (d) => { mirrorRuns(d); rmSync(join(d, "runs", "mirror-wall-none-s3-every.json")); }, args: (d) => ["--runs", join(d, "runs")], expect: "missing: seed 3" });
exercise({
    name: "wrong, a mirrored step's refusal reason changed",
    mode: "wrong",
    node: TS,
    prepare: (d) => {
        mirrorRuns(d);
        const p = join(d, "runs", "mirror-wall-none-s1-every.json");
        const r = readJ(p);
        r.steps.find((s) => s.first && !s.ok).loss = "not-a-reason";
        writeJ(p, r);
    },
    args: (d) => ["--runs", join(d, "runs")],
    expect: "does not reproduce the mirrored run's",
});

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} cases as expected`);
if (bad.length) {
    console.log(`left the work directory for inspection: ${work}`);
    process.exit(1);
}
// Only the directory this run created, and only now; then the parent's earlier entries are all still there.
rmSync(work, { recursive: true, force: true });
const after = new Set(readdirSync(parent));
const gone = parentBefore.filter((x) => !after.has(x));
if (gone.length) fail(`entries of ${parent} missing after the run: ${gone.join(", ")}`);
console.log(`removed ${work}; the ${parentBefore.length} entries ${parent} held before are all still there`);
