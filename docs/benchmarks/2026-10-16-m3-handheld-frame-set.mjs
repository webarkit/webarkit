/*
 *  2026-10-16-m3-handheld-frame-set.mjs
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
 * M3's hand-held sync and worker arms compared on whole-set and on common-set
 * jitterPx: the frame-set decomposition of 2026-10-16-frame-set-overlap.mjs
 * (counted loops 1 to 4, then the media times both runs posed) applied to
 * the twelve committed exports 2026-10-01-tab9-m3-{sync,worker}-{wall,table}-*.json,
 * 20 pairs. The evidence for the comparison rule in docs/benchmarks/step-protocol.md
 * (Stage 2) and the figures of #123's comment of 2026-10-17. Run on 2026-10-16.
 * Reads the exports beside it and the frozen metrics module, and writes nothing.
 *
 *     node docs/benchmarks/2026-10-16-m3-handheld-frame-set.mjs
 *
 * Per pair, sign sync minus worker: each run's whole-set jitterPx over its
 * counted loops, the media times both runs posed, each run's jitterPx on that
 * common set through cornerJitter's include option, observed whole, observed
 * common, and frame-set part = whole − common.
 *
 * The checks, all fatal: a failed check exits non-zero naming the run or the
 * pair and the values that disagree, and no figure is printed after it. Per
 * run, the recomputed whole-set jitterPx is a finite number equal to the
 * recorded runSummary.jitterPx; per pair, the common set is not empty and
 * both runs' common-set jitterPx are finite. The tolerance on the
 * recomputation is zero, a stated choice: it is the same function on the
 * same frames in the same order, and it reproduced every recorded value bit
 * for bit, so anything but equality is a changed metric or a changed export.
 *
 * A known limitation, as the frame-set script's and the stall check's: this
 * script is covered by no test and by no format check (`docs/` is outside
 * both), so a change in a dependency or in the exports' shape could break it
 * without notice while the figures it produced stay in the record; and the
 * tool has no tests, so a defect in it would produce a wrong result
 * reproducibly. Its guard is the recomputation check above, which catches a
 * changed cornerJitter or a changed export, not a defect of its own. The
 * checks are fatal, so no figure is printed after a failed check.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = "2026-10-16-m3-handheld-frame-set.mjs";
const { cornerJitter, countedLoopFrames, mediaKey } = await import(
    pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href
);
const load = (n) => JSON.parse(readFileSync(join(HERE, `2026-10-01-tab9-m3-${n}.json`), "utf8"));
const fatal = (message) => {
    console.error(`${SCRIPT}: ${message}`);
    process.exit(1);
};
const f = (v, d = 4) => (v >= 0 ? "+" : "") + v.toFixed(d);
const g = (v, d = 4) => v.toFixed(d);

const CLIPS = [
    ["wall", [1, 2, 3, 4], [1, 2, 3, 4]],
    ["table", [1, 2], [1, 2]],
];

// ---- phase 1: every run and pair computed and checked, nothing printed -----
const results = [];
for (const [clip, syncs, workers] of CLIPS) {
    const E = {};
    for (const n of [...syncs.map((i) => `sync-${clip}-${i}`), ...workers.map((i) => `worker-${clip}-${i}`)]) {
        const e = load(n);
        const counted = countedLoopFrames(e.frames, { clipDurationS: e.clipDurationS, ...e.loops });
        const whole = cornerJitter(counted, { clipDurationS: e.clipDurationS });
        if (!Number.isFinite(whole.jitterPx)) fatal(`${n}: whole-set jitterPx is ${whole.jitterPx}, not a finite number`);
        if (whole.jitterPx !== e.runSummary.jitterPx) {
            fatal(`${n}: whole-set jitterPx recomputed as ${whole.jitterPx}, recorded ${e.runSummary.jitterPx}`);
        }
        const keys = new Set(counted.filter((x) => x.corners).map((x) => mediaKey(x.mediaTimeSeconds)));
        E[n] = { e, counted, whole, keys };
    }
    const pairs = [];
    for (const i of syncs) {
        for (const j of workers) {
            const a = E[`sync-${clip}-${i}`];
            const b = E[`worker-${clip}-${j}`];
            const common = new Set([...a.keys].filter((k) => b.keys.has(k)));
            if (common.size === 0) fatal(`${clip}, sync-${i} vs worker-${j}: no media time both runs posed`);
            const union = new Set([...a.keys, ...b.keys]).size;
            const inc = (x) => common.has(mediaKey(x.mediaTimeSeconds));
            const ja = cornerJitter(a.counted, { include: inc, clipDurationS: a.e.clipDurationS });
            const jb = cornerJitter(b.counted, { include: inc, clipDurationS: b.e.clipDurationS });
            for (const [label, read] of [[`sync-${i}`, ja], [`worker-${j}`, jb]]) {
                if (!Number.isFinite(read.jitterPx)) {
                    fatal(`${clip}, sync-${i} vs worker-${j}: ${label}'s common-set jitterPx is ${read.jitterPx} on ${read.jitterWindows} windows`);
                }
            }
            pairs.push({ i, j, a, b, common, union, ja, jb });
        }
    }
    results.push({ clip, E, pairs });
}

// ---- phase 2: the figures ------------------------------------------------
for (const { clip, E, pairs } of results) {
    console.log(`\n== ${clip}`);
    for (const [n, { counted, whole, keys, e }] of Object.entries(E)) {
        console.log(`${n}: counted ${counted.length}, posed ${whole.posedFrames}, posed media times ${keys.size}, windows ${whole.jitterWindows}, whole jitterPx ${g(whole.jitterPx)} (recorded ${g(e.runSummary.jitterPx)}, equal)`);
    }
    console.log("pair | common | overlap | p_sync p_worker | sync whole->common | worker whole->common | observed whole | observed common | frame-set part");
    for (const { i, j, a, b, common, union, ja, jb } of pairs) {
        const whole = a.whole.jitterPx - b.whole.jitterPx;
        const com = ja.jitterPx - jb.jitterPx;
        console.log(`sync-${i} vs worker-${j} | ${common.size} | ${(common.size / union).toFixed(3)} | ${(1 - common.size / a.keys.size).toFixed(3)} ${(1 - common.size / b.keys.size).toFixed(3)} | ${g(a.whole.jitterPx, 2)}->${g(ja.jitterPx, 2)} (${ja.jitterWindows} w) | ${g(b.whole.jitterPx, 2)}->${g(jb.jitterPx, 2)} (${jb.jitterWindows} w) | ${f(whole, 2)} | ${f(com, 2)} | ${f(whole - com, 2)}`);
    }
}
