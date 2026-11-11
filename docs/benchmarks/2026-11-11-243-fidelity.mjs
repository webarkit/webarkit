/*
 *  2026-11-11-243-fidelity.mjs
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
 * M9's frame fidelity share (#243): item 4 of "The pre-flight" in
 * docs/benchmarks/2026-11-10-243-registration.md, D3, as #151 measured it. The maintainer's ruling
 * of 2026-11-10: "two detection-only static runs, `numMatches` compared at repeated media times,
 * read as a lower bound".
 *
 * Every frame of a detection-only run detects, so every media time visited more than once, within a
 * run and across the two, gives a pair. A pair whose `numMatches` differ had different pixels, since
 * `numMatches` is counted before any RANSAC draw (#227). The share of differing pairs is a lower
 * bound on the grab's infidelity, since two different grabs can match alike.
 *
 * What it reads: each frame's `mediaTimeSeconds`, to pair the frames, and `numMatches`, and no other
 * frame field. It reads `mode` from each export, to refuse anything but a detection-only run. Every
 * frame of the export is taken, the warm-up loop's included: the item pairs "every media time a run
 * visits", and a detection-only frame's matches do not depend on the loop it falls in. Media times are
 * compared exactly, as the page records them (rounded to the microsecond).
 *
 * Usage: node docs/benchmarks/2026-11-11-243-fidelity.mjs <export-1.json> <export-2.json>
 * Exits 0 with the counts and the share, 2 on an export it cannot read.
 *
 * Exercised both ways in docs/benchmarks/2026-11-11-243-fidelity.test.mjs (`node --test`), on
 * constructed pairs: alike and differing, within a run and across the two.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "2026-11-11-243-fidelity.mjs";

/** One frame reduced to the two fields this script reads. Throws on a frame that lacks either. */
export function visit(frame, where) {
    const t = frame.mediaTimeSeconds;
    const m = frame.numMatches;
    if (typeof t !== "number" || !Number.isFinite(t)) throw new Error(`${where}: mediaTimeSeconds is not a finite number`);
    if (!Number.isInteger(m)) throw new Error(`${where}: numMatches is not an integer`);
    return { t, m };
}

/**
 * The pairs at repeated media times. `runs` is a list of frame lists. Returns the counts, within a
 * run and across runs, of pairs and of pairs whose `numMatches` differ, and the media times visited
 * more than once.
 */
export function fidelity(runs) {
    const byTime = new Map();
    runs.forEach((frames, r) =>
        frames.forEach((f, k) => {
            const v = visit(f, `run ${r + 1}, frame ${k}`);
            if (!byTime.has(v.t)) byTime.set(v.t, []);
            byTime.get(v.t).push({ r, m: v.m });
        }),
    );
    const pairs = { within: 0, across: 0 };
    const differ = { within: 0, across: 0 };
    let repeated = 0;
    let timesDiffering = 0;
    for (const visits of byTime.values()) {
        if (visits.length < 2) continue;
        repeated++;
        let any = false;
        for (let i = 0; i < visits.length; i++) {
            for (let j = i + 1; j < visits.length; j++) {
                const kind = visits[i].r === visits[j].r ? "within" : "across";
                pairs[kind]++;
                if (visits[i].m !== visits[j].m) {
                    differ[kind]++;
                    any = true;
                }
            }
        }
        if (any) timesDiffering++;
    }
    const total = pairs.within + pairs.across;
    const differTotal = differ.within + differ.across;
    return {
        mediaTimes: byTime.size,
        repeated,
        timesDiffering,
        pairs: { ...pairs, total },
        differ: { ...differ, total: differTotal },
        share: total === 0 ? null : differTotal / total,
    };
}

/** An export's frames, refused unless it is a detection-only run. */
export function framesOf(e, name) {
    if (e?.mode !== "detection-only") throw new Error(`${name}: mode is ${JSON.stringify(e?.mode)}, not "detection-only"`);
    if (!Array.isArray(e.frames) || e.frames.length === 0) throw new Error(`${name}: no frames`);
    return e.frames;
}

export function report(r, names) {
    const pct = (x) => (x === null ? "n/a" : `${(100 * x).toFixed(2)}%`);
    return [
        `# ${SCRIPT}: ${names.join(", ")}`,
        `media times visited: ${r.mediaTimes}; visited more than once: ${r.repeated}; with a differing pair: ${r.timesDiffering}`,
        `pairs within a run: ${r.pairs.within}, numMatches differing: ${r.differ.within}`,
        `pairs across the two runs: ${r.pairs.across}, numMatches differing: ${r.differ.across}`,
        `pairs in all: ${r.pairs.total}, numMatches differing: ${r.differ.total}`,
        `share of differing pairs (a lower bound on the grab's infidelity): ${r.differ.total} / ${r.pairs.total} = ${r.share === null ? "n/a" : r.share.toFixed(6)} (${pct(r.share)})`,
    ];
}

function main(argv) {
    if (argv.length !== 2) {
        process.stderr.write(`usage: node docs/benchmarks/${SCRIPT} <export-1.json> <export-2.json>\n`);
        process.exit(2);
    }
    try {
        const names = argv.map((p) => p.split(/[\\/]/).pop());
        const runs = argv.map((p, i) => framesOf(JSON.parse(readFileSync(p, "utf8")), names[i]));
        process.stdout.write(report(fidelity(runs), names).join("\n") + "\n");
    } catch (err) {
        process.stderr.write(`${SCRIPT}: ${err.message}\n`);
        process.exit(2);
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
