/*
 *  2026-10-29-137-stage3-g5-compare.mjs
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
 * #137's Stage 3: C1 and C2 of docs/benchmarks/2026-10-28-137-stage3-g5-registration.md,
 * read. The implemented gate's per-frame rows (the check copy's G0 rows, run at G5's
 * implementation) against the probe's G5 rows (the original probe script, run at the
 * registration's base), frame by frame, on the three clips at seeds 1 to 8.
 *
 *     node docs/benchmarks/2026-10-29-137-stage3-g5-compare.mjs --base <base run> --tip <tip run>
 *
 * `<base run>` is the original probe script's --out, `<tip run>` the check copy's
 * (2026-10-29-137-stage3-g5-check.mjs). Each pair, `<tip run>/<clip>-G0-s<seed>.jsonl` against
 * `<base run>/<clip>-G5-s<seed>.jsonl`, is compared row by row, by frame index, in the fields
 * C2 names: `m` (media time), `state`, `ok`, `inliers` and `corners` (as JSON). The exception,
 * C2's: on a frame the gate refuses, one whose base row has `gate.refused === "count"`,
 * `inliers` may differ (and `reason`, which is not compared). The two runs have the same number
 * of rows; a row present in one only is a differing frame. C1 reads the static clip's lines, C2
 * all of them.
 *
 * The inputs are checked before any figure, and a failed check exits 1 naming it and prints
 * nothing: the base's runs.tsv must be the probe's recorded output (its SHA-256 and its rows'
 * hashes, below); each directory's runs.tsv must list the pair's file for its candidate, clip
 * and seed, once, and the file's SHA-256 must equal its listed `rowsSha256`; a missing,
 * unlisted, empty or unparseable file, or a row without an integer `k` or one of the compared
 * fields, fails (the protocol: a missing input never falls back to a default). A
 * differing frame is a result, not a failed check: it is printed, and the script exits 0.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = "2026-10-29-137-stage3-g5-compare.mjs";
function fatal(reason) {
    process.stderr.write(`${SCRIPT}: fatal: ${reason}\n`);
    process.exit(1);
}

const argv = process.argv.slice(2);
function arg(name) {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fatal(`${name} needs a value`);
    return v;
}
const BASE = arg("--base");
const TIP = arg("--tip");
if (BASE === null) fatal("--base <the original probe script's run dir, at the registration's base> is required");
if (TIP === null) fatal("--tip <the check copy's run dir, at G5's implementation> is required");

const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const FIELDS = ["m", "state", "ok", "inliers", "corners"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * The probe's recorded output, which the base run must reproduce (the registration, "How C1
 * and C2 are read"; the probe record, "Determinism", which prints these prefixes): runs.tsv's
 * SHA-256, and the SHA-256 of its rows' hashes in runs.tsv order.
 */
const BASE_RUNS_TSV = "46db54e2";
const BASE_ROWS = "0cb5c750";

/** runs.tsv of a run dir: `${clip} ${cand} ${seed}` → rowsSha256, and the file's and its rows' hashes. */
function listing(dir) {
    const p = join(dir, "runs.tsv");
    if (!existsSync(p)) fatal(`${p}: missing`);
    const raw = readFileSync(p, "utf8");
    const [head, ...lines] = raw.split("\n").filter((l) => l !== "");
    const cols = head.split("\t");
    const at = (name) => {
        const i = cols.indexOf(name);
        if (i < 0) fatal(`${p}: no ${name} column`);
        return i;
    };
    const [ci, ki, si, hi] = [at("clip"), at("cand"), at("seed"), at("rowsSha256")];
    const out = new Map();
    const hashes = [];
    for (const l of lines) {
        const c = l.split("\t");
        if (c.length !== cols.length) fatal(`${p}: a row of ${c.length} fields, the header has ${cols.length}`);
        const key = `${c[ci]} ${c[ki]} ${c[si]}`;
        if (out.has(key)) fatal(`${p}: lists ${key} twice`);
        out.set(key, c[hi]);
        hashes.push(c[hi]);
    }
    return { map: out, sha: sha256(raw), rowsSha: sha256(hashes.join("\n")) };
}

/** The rows of one run, certified by its directory's runs.tsv. */
function rowsOf(dir, list, clip, cand, seed) {
    const want = list.map.get(`${clip} ${cand} ${seed}`);
    if (want === undefined) fatal(`${join(dir, "runs.tsv")}: lists no ${cand} run of ${clip} at seed ${seed}`);
    const p = join(dir, `${clip.replace(/\.mp4$/, "")}-${cand}-s${seed}.jsonl`);
    if (!existsSync(p)) fatal(`${p}: missing, though runs.tsv lists it`);
    const text = readFileSync(p, "utf8");
    const got = sha256(text);
    if (got !== want) fatal(`${p}: SHA-256 ${got}, runs.tsv lists ${want}`);
    const rows = text
        .split("\n")
        .filter((l) => l !== "")
        .map((l, j) => {
            let r;
            try {
                r = JSON.parse(l);
            } catch (e) {
                return fatal(`${p}: line ${j + 1} is not JSON (${e.message})`);
            }
            if (r === null || typeof r !== "object" || !Number.isInteger(r.k)) fatal(`${p}: line ${j + 1} is not a row with an integer k`);
            for (const f of [...FIELDS, "gate"]) if (!(f in r)) fatal(`${p}: line ${j + 1} has no ${f}`);
            return r;
        });
    if (rows.length === 0) fatal(`${p}: no rows`);
    return rows;
}

const baseList = listing(BASE);
const tipList = listing(TIP);
if (!baseList.sha.startsWith(BASE_RUNS_TSV)) fatal(`${join(BASE, "runs.tsv")}: SHA-256 ${baseList.sha}, not the probe's recorded ${BASE_RUNS_TSV}…`);
if (!baseList.rowsSha.startsWith(BASE_ROWS)) fatal(`${join(BASE, "runs.tsv")}: its rows' hashes hash to ${baseList.rowsSha}, not the probe's recorded ${BASE_ROWS}…`);
const pairs = [];
for (const clip of CLIPS) {
    for (const seed of SEEDS) {
        pairs.push({ clip, seed, base: rowsOf(BASE, baseList, clip, "G5", seed), tip: rowsOf(TIP, tipList, clip, "G0", seed) });
    }
}

const show = (v) => (v === undefined ? "(no row)" : JSON.stringify(v));
const out = [];
const totals = new Map(CLIPS.map((c) => [c, { rows: 0, exception: 0, differing: 0 }]));
out.push(`#137 Stage 3, C1 and C2: the implemented gate (${TIP}, G0) against the probe's G5 (${BASE}), fields ${FIELDS.join(", ")}`);
out.push(`base runs.tsv SHA-256 ${baseList.sha}, its rows' hashes ${baseList.rowsSha} (the probe's recorded output); tip runs.tsv SHA-256 ${tipList.sha}, its rows' hashes ${tipList.rowsSha}`);
for (const { clip, seed, base, tip } of pairs) {
    const n = Math.max(base.length, tip.length);
    const lines = [];
    const differing = new Set();
    let exception = 0;
    for (let k = 0; k < n; k++) {
        const a = tip[k];
        const b = base[k];
        if (a === undefined || b === undefined) {
            differing.add(k);
            lines.push(`  frame ${k}: a row in one run only (tip ${show(a)}, base ${show(b)})`);
            continue;
        }
        if (a.k !== k || b.k !== k) fatal(`${clip}, seed ${seed}: row ${k} is frame ${a.k} (tip) and ${b.k} (base)`);
        const refused = b.gate !== null && b.gate !== undefined && b.gate.refused === "count";
        if (refused) exception++;
        for (const f of FIELDS) {
            if (refused && f === "inliers") continue;
            if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
                differing.add(k);
                lines.push(`  frame ${k}, ${f}: tip ${show(a[f])}, base ${show(b[f])}`);
            }
        }
    }
    const t = totals.get(clip);
    t.rows += n;
    t.exception += exception;
    t.differing += differing.size;
    out.push(`${clip} s${seed}: ${n} rows compared (tip ${tip.length}, base ${base.length}); ${exception} frames under the exception; ${differing.size === 0 ? "no differing frame" : `${differing.size} differing frames:`}`);
    out.push(...lines);
}
out.push("");
for (const [clip, t] of totals) out.push(`${clip}, seeds 1..8: ${t.rows} rows, ${t.exception} under the exception, ${t.differing} differing frames`);
const all = [...totals.values()].reduce((s, t) => s + t.differing, 0);
out.push(`C1 (pinball-static.mp4): ${totals.get("pinball-static.mp4").differing} differing frames. C2 (all three clips): ${all} differing frames.`);
process.stdout.write(out.join("\n") + "\n");
