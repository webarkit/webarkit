/*
 *  bench-stall.mjs
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
 * The stall check of the M3 runbook's step 7, over one page export (#117). It
 * reads only the export: the frames' media times, `clipDurationS` and `loops`.
 * The command is `scripts/stall-check.mjs`.
 *
 * Moved in from the copy embedded in
 * `docs/benchmarks/2026-10-01-m3-session-additions.md`, "The scripts"
 * (SHA-256 `cccb475b…`), with its logic unchanged; that copy stays as the
 * record of what ran. The arms and where their bounds come from are in the
 * same record, "A per-run check for a stalled clip". Neither the page nor the
 * worker imports this module, so `bench-metrics.mjs` does not re-export it and
 * it is not served.
 *
 * A gap is the media time between two consecutive processed frames. Across a
 * loop wrap (media time going back) it is the clip's end after the first frame
 * plus the next frame's media time, so a backward step that is not the clip
 * restarting reads as a gap of nearly the whole clip. Four arms:
 *   gaps          — no gap above BOUND_MS: a single stutter;
 *   monotonicity  — every backward step is the clip restarting (its gap across
 *                   the wrap within BOUND_MS): no fabricated loop;
 *   coverage      — every loop read starts within BOUND_MS of the clip's start
 *                   and ends within BOUND_MS of its end;
 *   cumulative    — in every loop read, the time by which gaps exceed
 *                   DEVICE_MAX_MS, summed, is at most EXCESS_FRACTION of the
 *                   clip's duration: a run full of small stutters.
 * A session export (it has `loops`) is read over its counted loops, and needs a
 * frame of the loop after them. An older export, a window of its run, is read
 * over every loop wholly inside the window, and the inner ends of the two
 * partial ones.
 */

export const BOUND_MS = 500; // round 2's largest gap on the tablet, 240.8 ms, doubled and rounded up
export const DEVICE_MAX_MS = 240.8; // round 2's largest gap on the tablet: what a valid run already holds under one state
export const EXCESS_FRACTION = 0.03; // one stutter at BOUND_MS in a loop of the shortest clip (259.2 ms of 8.9 s, 2.9%), rounded up
// For exports older than `clipDurationS`: the bundled clips' durations (ffprobe).
export const CLIP_S = {
    "pinball-bench.mp4": 11.959866,
    "pinball-bench-table.mp4": 8.9,
    "pinball-static.mp4": 12.166667,
};

export function stallCheck(e) {
    const D = e.clipDurationS ?? CLIP_S[e.bundledClip];
    const f = e.frames ?? [];
    const fails = [];
    if (!(D > 0) || f.length < 2) {
        return {
            fails: [`no clip duration or no frames to read (${D}, ${f.length} frames)`],
            maxGap: null,
            loops: 0,
        };
    }
    let loop = 0;
    let maxGap = 0;
    let maxAt = null;
    const span = new Map(); // loop -> [first media time, last media time]
    const excess = new Map(); // loop -> ms by which its gaps exceed DEVICE_MAX_MS
    span.set(0, [f[0].mediaTimeSeconds, f[0].mediaTimeSeconds]);
    for (let i = 1; i < f.length; i++) {
        const prev = f[i - 1].mediaTimeSeconds;
        const cur = f[i].mediaTimeSeconds;
        if (!Number.isFinite(prev) || !Number.isFinite(cur)) {
            fails.push(`frame ${i}: no finite media time`);
            return { fails, maxGap: null, loops: loop };
        }
        let gapMs;
        if (cur < prev) {
            gapMs = (D - prev + cur) * 1000;
            // The monotonicity arm (the record's "monotonicity"): a step back
            // is the clip restarting only if its gap across the wrap is within
            // BOUND_MS. It is counted as a loop either way.
            if (gapMs > BOUND_MS) {
                fails.push(
                    `monotonicity: frame ${i}: media time steps back from ${prev.toFixed(3)} s to ${cur.toFixed(3)} s, which is not the clip restarting (${gapMs.toFixed(0)} ms across the wrap)`,
                );
            }
            loop++;
            span.set(loop, [cur, cur]);
        } else {
            gapMs = (cur - prev) * 1000;
            span.get(loop)[1] = cur;
        }
        if (gapMs > maxGap) {
            maxGap = gapMs;
            maxAt = i;
        }
        if (gapMs > DEVICE_MAX_MS)
            excess.set(loop, (excess.get(loop) ?? 0) + gapMs - DEVICE_MAX_MS);
    }
    // The gaps arm (the record's "gaps"): the run's largest gap, against BOUND_MS.
    if (maxGap > BOUND_MS)
        fails.push(
            `gaps: frame ${maxAt}: a gap of ${maxGap.toFixed(1)} ms in media time, above ${BOUND_MS} ms`,
        );
    // The loops read: a session export's counted ones; an older window's whole ones.
    let read;
    if (e.loops) {
        const { firstLoop = 1, loopCount = 4 } = e.loops;
        read = Array.from({ length: loopCount }, (_, k) => firstLoop + k);
        if (loop < firstLoop + loopCount)
            fails.push(
                `coverage: no frame of loop ${firstLoop + loopCount}, which closes loop ${firstLoop + loopCount - 1}`,
            );
    } else {
        read = Array.from({ length: Math.max(0, loop - 1) }, (_, k) => k + 1);
        // The window's partial ends: the first loop must reach the clip's end, the last must start at its start.
        if (loop > 0 && (D - span.get(0)[1]) * 1000 > BOUND_MS)
            fails.push(
                `coverage: the window's first loop ends at ${span.get(0)[1].toFixed(3)} s, short of the clip's end`,
            );
        if (loop > 0 && span.get(loop)[0] * 1000 > BOUND_MS)
            fails.push(
                `coverage: the window's last loop starts at ${span.get(loop)[0].toFixed(3)} s, not the clip's start`,
            );
    }
    for (const k of read) {
        const s = span.get(k);
        // The coverage arm (the record's "coverage"): each loop read reaches
        // within BOUND_MS of both ends of the clip.
        if (!s) {
            fails.push(`coverage: loop ${k}: no frame`);
            continue;
        }
        if (s[0] * 1000 > BOUND_MS || (D - s[1]) * 1000 > BOUND_MS) {
            fails.push(
                `coverage: loop ${k} covers ${s[0].toFixed(3)}–${s[1].toFixed(3)} s of a ${D.toFixed(3)} s clip, short by more than ${BOUND_MS} ms at an end`,
            );
        }
        // The cumulative arm (the record's "cumulative"): the loop's summed
        // excess over DEVICE_MAX_MS, against EXCESS_FRACTION of the clip.
        const x = excess.get(k) ?? 0;
        if (x > EXCESS_FRACTION * D * 1000) {
            fails.push(
                `cumulative: loop ${k}: its gaps exceed ${DEVICE_MAX_MS} ms by ${x.toFixed(0)} ms in all, above ${(100 * EXCESS_FRACTION).toFixed(0)}% of the clip (${(EXCESS_FRACTION * D * 1000).toFixed(0)} ms)`,
            );
        }
    }
    const worstExcess = Math.max(0, ...read.map((k) => excess.get(k) ?? 0));
    return { fails, maxGap, maxAt, loops: loop, read, worstExcess, D };
}
