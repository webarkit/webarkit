/*
 *  2026-11-01-202-stage3-compare.mjs
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
 * #202's Stage 3 comparison, C1 and C2 of 2026-11-01-202-stage3-registration.md ("How each is
 * read, as commands"). Results: 2026-11-01-202-stage3-addendum.md.
 *
 *     node docs/benchmarks/2026-11-01-202-stage3-compare.mjs --base <base run> --tip <tip run>
 *     node docs/benchmarks/2026-11-01-202-stage3-compare.mjs --base <base run> --tip <tip run> --expressibility
 *
 * C1: the 24 pairs (three clips, seeds 1 to 8), <tip run>/<clip>-G0-s<seed>.jsonl (the check
 * copy at the implementation) against <base run>/<clip>-GWM-s<seed>.jsonl (the original probe at
 * the base), by key k, on every field of the row and every key of `gate` but `gate.refused`. On a
 * frame the base's GWM refused (`gate.refused` not null), `reason` and `inliers` may differ. The
 * frames reading "not-facing" at the tip must be exactly the base's refused frames.
 *
 * C2 (--expressibility): every DETECT frame of the base's expressibility stdout, per sequence,
 * with its fate at the tip: DETECT with the same inliers and column, or "not-facing", LOST, with
 * its count, on a frame whose base column is not facing. Anything else is a differing frame.
 *
 * Inputs are refused, exit 2, before anything is compared: a base stdout that is not the probe's
 * recorded one (with line 4's head set to the recorded run's), a base expressibility stdout that
 * is not the recorded one, a rows file missing, unlisted in its directory's stdout, empty, not
 * parseable, or whose SHA-256 does not begin with the listed prefix, and a row without an integer
 * k or one of the compared fields. Exit 1: a differing frame. Exit 0: none.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = "2026-11-01-202-stage3-compare.mjs";
const RECORDED_HEAD = "9b387ae28952ae7e37827d3582b686bdad1b8f30";
const RECORDED_STDOUT = "1ad328812f7040593bc2eb8d82e57e8f91bdccc98af3cafc9e72f3682b131713";
const RECORDED_EXPRESSIBILITY = "039ad945b45bbea8de6d8acfdf519a67aafd6badc41ef930de636e726ec16030";
const CLIPS = ["pinball-static", "pinball-bench", "pinball-bench-table"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const FIELDS = ["k", "loop", "t", "state", "ok", "reason", "inliers", "corners", "outcome", "chosen", "selBehind", "poseCorners", "H", "gate"];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
function refuse(why) {
    process.stderr.write(`${SCRIPT}: refused: ${why}\n`);
    process.exit(2);
}
const argv = process.argv.slice(2);
const arg = (name) => {
    const i = argv.indexOf(name);
    if (i < 0 || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) refuse(`${name} <dir> is required`);
    return argv[i + 1];
};
const BASE = arg("--base");
const TIP = arg("--tip");
const read = (path) => {
    if (!existsSync(path)) refuse(`${path}: missing`);
    const b = readFileSync(path);
    if (b.length === 0) refuse(`${path}: empty`);
    return b;
};

// The base run is the probe's recorded run, reproduced: line 4 names the build's head.
{
    const lines = read(join(BASE, "stdout.txt")).toString("utf8").split("\n");
    const m = /^(replay-clips' exports: the provenance manifest's bundle, built clean at )([0-9a-f]{40})$/.exec(lines[3] ?? "");
    if (!m) refuse(`${BASE}/stdout.txt: line 4 is not the build line: ${lines[3]}`);
    lines[3] = m[1] + RECORDED_HEAD;
    const got = sha256(lines.join("\n"));
    if (got !== RECORDED_STDOUT) refuse(`${BASE}/stdout.txt: SHA-256 ${got} with line 4's head set to ${RECORDED_HEAD.slice(0, 7)}, not the recorded ${RECORDED_STDOUT}`);
    const e = sha256(read(join(BASE, "expressibility.txt")));
    if (e !== RECORDED_EXPRESSIBILITY) refuse(`${BASE}/expressibility.txt: SHA-256 ${e}, not the recorded ${RECORDED_EXPRESSIBILITY}`);
}

if (argv.includes("--expressibility")) {
    process.exit(expressibility());
}

/** "<cand>/s<seed>" -> SHA-256 prefix, per clip, from a run's stdout (the probe's line 1013). */
function listed(dir) {
    const out = {};
    let clip = null;
    for (const line of read(join(dir, "stdout.txt")).toString("utf8").split("\n")) {
        const h = /^## (pinball-[a-z-]+)\.mp4: the cross-table/.exec(line);
        if (h) clip = h[1];
        if (line.startsWith("per-frame rows' SHA-256: ")) {
            if (clip === null) refuse(`${dir}/stdout.txt: a SHA-256 line before any clip`);
            for (const [, key, prefix] of line.matchAll(/(\S+\/s\d+) ([0-9a-f]{12})/g)) out[`${clip}-${key}`] = prefix;
        }
    }
    return out;
}
function rows(dir, list, clip, cand, seed) {
    const name = `${clip}-${cand}-s${seed}.jsonl`;
    const prefix = list[`${clip}-${cand}/s${seed}`];
    if (prefix === undefined) refuse(`${dir}/${name}: not listed in its stdout.txt`);
    const bytes = read(join(dir, name));
    if (!sha256(bytes).startsWith(prefix)) refuse(`${dir}/${name}: SHA-256 ${sha256(bytes).slice(0, 12)}, listed ${prefix}`);
    const out = new Map();
    for (const [i, text] of bytes.toString("utf8").split("\n").entries()) {
        if (text === "") continue;
        let r;
        try {
            r = JSON.parse(text);
        } catch {
            refuse(`${dir}/${name}: line ${i + 1} is not JSON`);
        }
        if (!Number.isInteger(r.k)) refuse(`${dir}/${name}: line ${i + 1} has no integer k`);
        for (const f of FIELDS) if (!(f in r)) refuse(`${dir}/${name}: frame ${r.k} has no ${f}`);
        if (out.has(r.k)) refuse(`${dir}/${name}: frame ${r.k} twice`);
        out.set(r.k, r);
    }
    if (out.size === 0) refuse(`${dir}/${name}: no rows`);
    return out;
}
/** Every leaf where a and b differ, Object.is, as [path, a, b]. */
function diff(a, b, path, acc) {
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
        if (Array.isArray(a) !== Array.isArray(b)) return void acc.push([path, a, b]);
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
            if (!(k in a) || !(k in b)) acc.push([`${path}.${k}`, a[k], b[k]]);
            else diff(a[k], b[k], `${path}.${k}`, acc);
        }
        return acc;
    }
    if (!Object.is(a, b)) acc.push([path, a, b]);
    return acc;
}
const show = (v) => (v === undefined ? "(absent)" : JSON.stringify(v));

function c1() {
    const baseList = listed(BASE);
    const tipList = listed(TIP);
    // Every input is read and checked before any figure is printed.
    const pairs = [];
    for (const clip of CLIPS) for (const seed of SEEDS) pairs.push([clip, seed, rows(BASE, baseList, clip, "GWM", seed), rows(TIP, tipList, clip, "G0", seed)]);
    let differing = 0;
    for (const [clip, seed, base, tip] of pairs) {
        const keys = [...new Set([...base.keys(), ...tip.keys()])].sort((x, y) => x - y);
        const lines = [];
        let compared = 0;
        let excepted = 0;
        const baseRefused = [];
        const tipRefused = [];
        for (const k of keys) {
            const b = base.get(k);
            const t = tip.get(k);
            if (b === undefined || t === undefined) {
                lines.push(`  frame ${k}: present in the ${b === undefined ? "tip" : "base"} only`);
                continue;
            }
            compared++;
            const refusedAtBase = b.gate !== null && b.gate.refused !== null;
            if (refusedAtBase) baseRefused.push(k);
            if (t.reason === "not-facing") tipRefused.push(k);
            if (refusedAtBase !== (t.reason === "not-facing")) lines.push(`  frame ${k}: refused at the base (GWM) ${refusedAtBase}, "not-facing" at the tip ${t.reason === "not-facing"}`);
            const { gate: bg, ...bRest } = b;
            const { gate: tg, ...tRest } = t;
            const d = diff(bRest, tRest, "", []);
            if (bg === null || tg === null) {
                if (bg !== tg) d.push([".gate", bg, tg]);
            } else {
                const { refused: _b, ...bgRest } = bg;
                const { refused: _t, ...tgRest } = tg;
                diff(bgRest, tgRest, ".gate", d);
            }
            const kept = refusedAtBase ? d.filter(([p]) => p !== ".reason" && p !== ".inliers") : d;
            if (refusedAtBase && kept.length !== d.length) excepted++;
            for (const [p, x, y] of kept) lines.push(`  frame ${k}: ${p.slice(1)}: base ${show(x)}, tip ${show(y)}`);
        }
        differing += lines.length;
        console.log(`${clip} s${seed}: ${compared} rows compared (base ${base.size}, tip ${tip.size}); refused: base GWM ${baseRefused.length}, tip "not-facing" ${tipRefused.length}; ${excepted} frames under the exception; differing ${lines.length ? lines.length : "none"}`);
        for (const l of lines) console.log(l);
    }
    console.log(`C1: ${differing === 0 ? "no differing frame on any of the 24 pairs" : `${differing} differing entries`}`);
    return differing === 0 ? 0 : 1;
}

/** Per sequence: the frames of "every DETECT" lines and of "not-facing" lines, closed by its "sequence" line. */
function sequences(text) {
    const out = [];
    let detect = [];
    let refused = [];
    for (const line of text.split("\n")) {
        let m = /^ {2}every DETECT: frame (\d+), (\d+) inliers, (\S+) × (\S+), (\S+) px$/.exec(line);
        if (m) detect.push({ k: Number(m[1]), n: Number(m[2]), side: m[3], depth: m[4], px: m[5] });
        m = /^ {2}not-facing: frame (\d+), (\S+), reason not-facing, (\d+) inliers$/.exec(line);
        if (m) refused.push({ k: Number(m[1]), state: m[2], n: Number(m[3]) });
        m = /^sequence (.+?): \d+ frames, states (\S+);/.exec(line);
        if (m) {
            out.push({ name: m[1], states: m[2], detect, refused });
            detect = [];
            refused = [];
        }
    }
    return out;
}
function expressibility() {
    const base = sequences(read(join(BASE, "expressibility.txt")).toString("utf8"));
    const tip = sequences(read(join(TIP, "expressibility.txt")).toString("utf8"));
    if (base.length === 0 || base.length !== tip.length || base.some((s, i) => s.name !== tip[i].name)) refuse(`the sequences differ: base ${base.map((s) => s.name).join(", ")}; tip ${tip.map((s) => s.name).join(", ")}`);
    let differing = 0;
    let total = 0;
    for (const [i, b] of base.entries()) {
        const t = tip[i];
        console.log(`sequence ${b.name}: base ${b.states}; tip ${t.states}`);
        const seen = new Set();
        for (const d of b.detect) {
            total++;
            const td = t.detect.find((x) => x.k === d.k);
            const tr = t.refused.find((x) => x.k === d.k);
            seen.add(d.k);
            if (td && !tr && td.n === d.n && td.side === d.side) console.log(`  frame ${d.k}: base DETECT ${d.n} inliers ${d.side}; tip DETECT, the same`);
            // A refusal is a fate only of a base frame outside facing, LOST, with the fit's count.
            else if (tr && !td && d.side !== "facing" && tr.state === "LOST" && tr.n === d.n) console.log(`  frame ${d.k}: base DETECT ${d.n} inliers ${d.side}; tip "not-facing", ${tr.state}, ${tr.n} inliers`);
            else {
                differing++;
                console.log(`  frame ${d.k}: base DETECT ${d.n} inliers ${d.side}; tip ${td ? `DETECT ${td.n} inliers ${td.side}` : "not DETECT"}${tr ? `, "not-facing" ${tr.n}` : ""}: DIFFERS`);
            }
        }
        for (const x of [...t.detect, ...t.refused]) {
            if (seen.has(x.k)) continue;
            differing++;
            console.log(`  frame ${x.k}: not DETECT at the base; tip ${"side" in x ? `DETECT ${x.n} inliers ${x.side}` : `"not-facing" ${x.n}`}: DIFFERS`);
        }
    }
    const fired = tip.flatMap((s) => s.refused.map((x) => `${s.name} frame ${x.k} (${x.n} inliers)`));
    console.log(`C2: ${total} base DETECT frames; refused as "not-facing" at the tip: ${fired.join(", ") || "none"}; ${differing === 0 ? "every other base DETECT frame DETECT at the tip with the same inliers and column" : `${differing} differing frames`}`);
    return differing === 0 ? 0 : 1;
}

process.exit(c1());
