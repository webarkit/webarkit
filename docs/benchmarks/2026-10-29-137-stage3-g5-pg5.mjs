/*
 *  2026-10-29-137-stage3-g5-pg5.mjs
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
 * #137's Stage 3: P-G5 (a) and (c) of docs/benchmarks/2026-10-28-137-stage3-g5-registration.md,
 * read from the 24 runs its section "How P-G5 is read" names, as it names them:
 *
 *     node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/A/s<n>    (at the base)
 *     node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/tip/s<n>  (at G5's implementation)
 *     node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/B/s<n>    (at the base)
 *     node docs/benchmarks/2026-10-29-137-stage3-g5-pg5.mjs <root>
 *
 * It reads each run's "device scaled step, sync" export of the wall and the table clip, and
 * refuses, exiting 1 and printing nothing, an export that is missing or not its arm's: the
 * seed, the schedule, the clip, and the manifest's clean bundle at the arm's commit (below).
 * Per seed it prints the three steps, jitterPx and trackTimeShare; then (a), the seed ratio of
 * jitterPx against its bound (the wall half void when the control's own ratio is at most 1.5),
 * and (c), the candidate minus run A in points against ±0.5, with the registration's ties.
 * The commits and bundles are this run's: the registration's base, #190's merge, and G5's
 * implementation, 4432d2a.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const fatal = (m) => {
    process.stderr.write(`2026-10-29-137-stage3-g5-pg5.mjs: fatal: ${m}\n`);
    process.exit(1);
};
const [root] = process.argv.slice(2);
if (root === undefined || root.startsWith("--")) fatal("<root of the A, tip and B runs> is required");
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CLIPS = [
    ["wall", "pinball-bench.mp4"],
    ["table", "pinball-bench-table.mp4"],
];
const ARMS = {
    A: { dir: "A", head: "a071b552466eace18eadbb3d64db09007a8ec8a2", bundle: "66687a9714ddadce9e16b41b2d1d4b11c1677cd1d8f1cc3d154a56b538efa855" },
    candidate: { dir: "tip", head: "4432d2a43026a5ce360f625b8b3a26b9c792e394", bundle: "a07f68068111ca26969af104a65184cf1c05c0023ef07be001d06add48400579" },
    B: { dir: "B", head: "a071b552466eace18eadbb3d64db09007a8ec8a2", bundle: "66687a9714ddadce9e16b41b2d1d4b11c1677cd1d8f1cc3d154a56b538efa855" },
};
const read = (arm, clip, seed) => {
    const a = ARMS[arm];
    const p = join(root, a.dir, `s${seed}`, `replay-${clip.replace(/\.mp4$/, "")}-tracking-device-scaled-step-sync.json`);
    if (!existsSync(p)) return { void: `${p} missing` };
    const e = JSON.parse(readFileSync(p, "utf8"));
    const ps = e.packageSource ?? {};
    if (e.seed !== seed || e.schedule !== "device scaled step, sync" || e.bundledClip !== clip) fatal(`${p}: seed ${e.seed}, ${e.schedule}, ${e.bundledClip}`);
    if (ps.packages !== "bundle" || ps.bundleSha256 !== a.bundle || ps.manifestBundleSha256 !== a.bundle || ps.manifestHead !== a.head || ps.manifestClean !== true) fatal(`${p}: packageSource ${JSON.stringify(ps)}, not ${arm}'s clean bundle at ${a.head.slice(0, 7)}`);
    const j = e.runSummary.jitterPx;
    const t = e.runSummary.trackTimeShare;
    return {
        jitter: j === null || !Number.isFinite(j) ? null : j,
        share: t && t.complete === true && Number.isFinite(t.share) ? t.share : null,
        step: e.stepMs,
    };
};
const f2 = (x) => (x === null ? "null" : x.toFixed(2));
const f4 = (x) => (x === null ? "null" : x.toFixed(4));
const ratio = (xs) => (xs.some((x) => x === null) ? null : Math.max(...xs) / Math.min(...xs));
const out = [];
for (const [name, clip] of CLIPS) {
    const R = Object.fromEntries(Object.keys(ARMS).map((arm) => [arm, SEEDS.map((s) => read(arm, clip, s))]));
    for (const arm of Object.keys(ARMS)) for (const [i, r] of R[arm].entries()) if (r.void) fatal(`${name} ${arm} s${i + 1}: ${r.void}`);
    out.push(`== ${name} (${clip}), device scaled step, sync`);
    out.push("seed | step A / candidate / B (ms) | jitterPx A / candidate / B | trackTimeShare A / candidate / B | (c) candidate − A, points | notes");
    for (const [i, s] of SEEDS.entries()) {
        const [a, c, b] = [R.A[i], R.candidate[i], R.B[i]];
        const notes = [];
        if (Math.abs(c.step - a.step) > Math.abs(b.step - a.step)) notes.push("candidate's step differs from A's by more than B's does");
        if (a.jitter !== b.jitter) notes.push("A and B differ in jitterPx");
        if (a.share !== b.share) notes.push("A and B differ in trackTimeShare");
        const d = a.share === null || c.share === null ? null : 100 * (c.share - a.share);
        out.push(`s${s} | ${a.step.toFixed(2)} / ${c.step.toFixed(2)} / ${b.step.toFixed(2)} | ${f4(a.jitter)} / ${f4(c.jitter)} / ${f4(b.jitter)} | ${f4(a.share)} / ${f4(c.share)} / ${f4(b.share)} | ${d === null ? "void" : f2(d)} | ${notes.join("; ") || "-"}`);
    }
    const rA = ratio(R.A.map((r) => r.jitter));
    const rC = ratio(R.candidate.map((r) => r.jitter));
    const rB = ratio(R.B.map((r) => r.jitter));
    out.push(`seed ratio of jitterPx: control (A) ${f2(rA)}, candidate ${f2(rC)}, repeat (B) ${f2(rB)}`);
    const verdict = (fig, bound) => (fig === null || bound === null ? "void" : f2(fig) === f2(bound) ? "tie" : fig <= bound ? "held" : "refuted");
    if (name === "wall") {
        const v = rA === null ? "void" : rA <= 1.5 ? "void (the control's own ratio is at most 1.5)" : verdict(rC, 1.5);
        out.push(`(a) wall: candidate ratio ${f2(rC)} against the bound 1.5: ${v}`);
    } else {
        const bound = rA === null ? null : 0.8 * rA;
        out.push(`(a) table: candidate ratio ${f2(rC)} against 0.8 × the control's ${f2(rA)} = ${f2(bound)}: ${verdict(rC, bound)}`);
    }
    const ds = SEEDS.map((_, i) => (R.A[i].share === null || R.candidate[i].share === null ? null : 100 * (R.candidate[i].share - R.A[i].share)));
    const per = ds.map((d) => (d === null ? "void" : f2(Math.abs(d)) === "0.50" ? "tie" : Math.abs(d) <= 0.5 ? "held" : "refuted"));
    const cv = per.includes("void") ? "void" : per.includes("refuted") ? `refuted (s${per.flatMap((p, i) => (p === "refuted" ? [i + 1] : [])).join(", s")})` : per.includes("tie") ? "held, with a tie at 0.50" : "held";
    out.push(`(c) ${name}: candidate − A in points, s1..s8: ${ds.map(f2).join(" ")}; within ±0.5 on every seed: ${cv}`);
    out.push("");
}
process.stdout.write(out.join("\n"));
