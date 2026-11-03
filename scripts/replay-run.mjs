/*
 *  replay-run.mjs
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
 * The frame loop of `scripts/replay-clips.mjs`'s default runs, `--sequence`
 * and `--external`'s synchronous arms, moved out of that script unchanged
 * (#151) so that a test can run it on rendered frames: the script decodes
 * its clips with ffmpeg, which CI does not have. Its packages, backend and
 * target are the caller's, injected.
 */

import { frameRecord, nextFrameIndex } from "../examples/js/bench-metrics.mjs";

/** A clip's duration on the looping timeline, seconds: its span plus the gap the first two frames show. */
export const loopPeriod = (pts) => pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);

/** `loops` loops of the clip's frame times on one continuous timeline, seconds, as the page's looping <video> plays them. */
export function loopTimes(pts, loops) {
    const period = loopPeriod(pts);
    return Array.from(
        { length: loops * pts.length },
        (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period,
    );
}

/**
 * One replay: `order` is the frame indices to process, or null for the device
 * schedule over `loops` loops; `options` are the tracker's. `acquireMs` is the
 * device schedule's acquisition and `detectMs` its detection, and `unwrapped`
 * stamps each frame with its time on the loops' continuous timeline rather
 * than its media time, which goes back to about 0 at every wrap.
 *
 * `seeding` is `runSeeding`'s (scripts/replay-seeding.mjs), or null: the
 * tracker's `rngFor`, told before each `process` which frame it processes,
 * by its media time `pts[i]`, never by the timestamp it is stamped with.
 */
export function replayRun({
    NftTracker,
    cv,
    target,
    targetPoints,
    detectMs,
    frames,
    pts,
    K,
    mode,
    stepMs,
    order,
    options,
    probe,
    loops,
    acquireMs,
    unwrapped,
    seeding,
}) {
    const tracker = new NftTracker(cv, target, K, {
        ...options,
        detectionOnly: mode === "detection-only",
        clock: () => performance.now(),
        rngFor: seeding?.rngFor,
    });
    const records = [];
    const push = (i, timestampMs = pts[i] * 1000) => {
        seeding?.frame(pts[i]);
        const result = tracker.process(frames[i], timestampMs);
        probe?.frame(frames[i], result);
        records.push(
            frameRecord({
                mode,
                result,
                stageTimings: {},
                timestampMs,
                mediaTimeSeconds: pts[i],
                targetPoints,
            }),
        );
        return result;
    };
    if (order) {
        for (const i of order) push(i);
        return records;
    }
    const times = loopTimes(pts, loops);
    for (let k = 0; k < times.length; ) {
        const result = push(k % pts.length, unwrapped ? times[k] * 1000 : undefined);
        if (stepMs === null) {
            k++;
            continue;
        }
        const busy =
            acquireMs + (result.tracking ? stepMs : 0) + (result.state === "TRACK" ? 0 : detectMs);
        k = nextFrameIndex(times, k, busy);
    }
    return records;
}
