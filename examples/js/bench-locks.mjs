/*
 *  bench-locks.mjs
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
 * Lock metrics: reacquisitions, lock steps, the share of video time with a
 * confirmed lock (`trackTimeShare`), and the locks set from a detection.
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, except the helpers this module shares with the
 * other `bench-*.mjs` modules, listed at its end.
 */

import { TRACK_TIME_BIN_MS } from "./bench-definitions.mjs";
import { detectionUseOf } from "./bench-frames.mjs";
import {
    countedLoops,
    positiveNumber,
    refuseUnless,
    TIME_EPS_S,
    unwrap,
    wrapsOf,
} from "./bench-loops.mjs";

/** See `DEFINITIONS.reacquisitions` and `DEFINITIONS.reacquisitionsAtLoopWrap`. */
export function reacquisitions(frames, { clipDurationS = null } = {}) {
    const wraps = wrapsOf(frames, clipDurationS);
    let hadPose = false;
    let count = 0;
    let atWrap = 0;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (f.state === "DETECT" && hadPose) {
            if (wraps[i]) atWrap++;
            else count++;
        }
        if (f.ok) hadPose = true;
    }
    return { reacquisitions: count, reacquisitionsAtLoopWrap: atWrap };
}

/** See `DEFINITIONS.firstSteps` and `DEFINITIONS.heldLockSteps`. */
export function lockSteps(frames, { clipDurationS = null } = {}) {
    const wraps = wrapsOf(frames, clipDurationS);
    const firstSteps = { n: 0, confirmed: 0 };
    const heldLockSteps = { n: 0, lost: 0, lostAtLoopWrap: 0 };
    for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        if (!f.tracking) continue;
        const before = frames[i - 1].state;
        if (before === "DETECT") {
            firstSteps.n++;
            if (f.state === "TRACK") firstSteps.confirmed++;
        } else if (before === "TRACK") {
            heldLockSteps.n++;
            if (f.trackLoss) {
                if (wraps[i]) heldLockSteps.lostAtLoopWrap++;
                else heldLockSteps.lost++;
            }
        }
    }
    return { firstSteps, heldLockSteps };
}

/**
 * The share of video time with a confirmed lock, over whole loops of the
 * clip, on a fixed grid of media time, so that every schedule is read over
 * the same video and at the same resolution rather than over its own: the
 * loops `firstLoop` to `firstLoop + loopCount − 1`, D (`clipDurationS`) long
 * each, on {@link unwrapMediaTimes}' timeline. Bin *j* of loop *k* starts at
 * *k*·D + *j*·`binMs`, and takes the state of the most recent processed frame
 * at or before its start — held across a loop wrap, so a loop's first bins
 * take the last frame of the loop before, and its edges are closed. TRACK
 * bins ÷ bins: a DETECT frame's pose is an unconfirmed detection, and counts
 * as no lock.
 *
 * `{ share, perLoop, binMs, loops: [first, last], complete }`; `perLoop` is
 * each counted loop's own share. `complete` is `false`, and `share` and
 * `perLoop` `null`, unless the grid has a frame behind every bin and the last
 * bin has its close: some frame at or before loop `firstLoop`'s first bin,
 * and some frame at or after the start of loop `firstLoop + loopCount` — for
 * the default 1 and 4, a run that recorded a frame of loop 5. A run that
 * starts mid-clip has no frame before loop 0, so it cannot count it.
 *
 * Deleting a frame whose state equals both its neighbours' cannot change the
 * share: the bins that took its state take a neighbour's, which is the same.
 * That is why a schedule that processes more frames — a worker's waiting
 * frames, which cannot change state — does not move it, where a per-frame
 * share moves with the schedule. The test file checks it on committed
 * exports; docs/benchmarks/2026-09-29-m3-lock-metric.md has the experiment.
 */
export function trackTimeShare(frames, options = {}) {
    const { firstLoop, loopCount } = countedLoops(options);
    const D = options.clipDurationS;
    const binMs = options.binMs ?? TRACK_TIME_BIN_MS;
    refuseUnless(positiveNumber(binMs), `binMs must be a positive number, got ${binMs}`);
    const loops = [firstLoop, firstLoop + loopCount - 1];
    const t = unwrap(frames, D);
    const complete =
        t.length > 0 &&
        t[0] <= firstLoop * D + TIME_EPS_S &&
        t[t.length - 1] >= (firstLoop + loopCount) * D;
    if (!complete) return { share: null, perLoop: null, binMs, loops, complete: false };
    const binsPerLoop = Math.ceil((D * 1000) / binMs - 1e-9);
    const perLoop = [];
    let trackBins = 0;
    let j = 0;
    for (let k = firstLoop; k < firstLoop + loopCount; k++) {
        let track = 0;
        for (let b = 0; b < binsPerLoop; b++) {
            const start = k * D + (b * binMs) / 1000;
            while (j + 1 < t.length && t[j + 1] <= start + TIME_EPS_S) j++;
            if (frames[j].state === "TRACK") track++;
        }
        perLoop.push(track / binsPerLoop);
        trackBins += track;
    }
    return { share: trackBins / (binsPerLoop * loopCount), perLoop, binMs, loops, complete: true };
}

/** Whether `f` set a lock from a detection, `use` being {@link detectionUseOf} of it. */
function setsLock(f, use) {
    if (use === "internal") return f.state === "DETECT";
    if (use === "consumed") return f.state === "TRACK" || f.reason === "unconfirmed";
    return false;
}

/**
 * Every detection lock of `frames`, in the order set, by the one rule of
 * `DEFINITIONS.detectionLocks`: `{ consumed, step, detected, afterPose, atWrap }`.
 * `step` is the frame of the lock's first step: the lock's own frame for a
 * consumed detection, the next frame for the tracker's own if a tracking step
 * ran on it, else `null`. `detected` is the frame the detection was computed
 * on, `{ timestampMs, mediaTimeSeconds, framesAgo }`, `null` for a consumed
 * detection that names none. `afterPose` is whether an earlier frame had a
 * pose, `atWrap` whether the lock's frame is the first after a loop wrap.
 */
function detectionLockList(frames, clipDurationS = null) {
    const wraps = wrapsOf(frames, clipDurationS);
    const locks = [];
    let hadPose = false;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const use = detectionUseOf(f);
        if (setsLock(f, use)) {
            const consumed = use === "consumed";
            const next = frames[i + 1];
            locks.push({
                consumed,
                step: consumed ? f : next?.tracking ? next : null,
                detected: consumed
                    ? (f.detectedAt ?? null)
                    : {
                          timestampMs: f.timestampMs,
                          mediaTimeSeconds: f.mediaTimeSeconds,
                          framesAgo: 0,
                      },
                afterPose: hadPose,
                atWrap: wraps[i],
            });
        }
        if (f.ok) hadPose = true;
    }
    return locks;
}

/** See `DEFINITIONS.detectionLocks`. `frames` in the order they were processed. */
export function detectionLocks(frames, { clipDurationS = null } = {}) {
    const out = { n: 0, confirmed: 0, refused: {}, reacquisitions: 0, reacquisitionsAtLoopWrap: 0 };
    for (const lock of detectionLockList(frames, clipDurationS)) {
        if (lock.afterPose) {
            if (lock.atWrap) out.reacquisitionsAtLoopWrap++;
            else out.reacquisitions++;
        }
        if (!lock.step) continue;
        out.n++;
        if (lock.step.state === "TRACK") {
            out.confirmed++;
        } else {
            // A step that records no trackLoss, which the current tracker never produces, is
            // counted under a name, never under its absent value as a string.
            const why = lock.step.trackLoss ?? "(none)";
            out.refused[why] = (out.refused[why] ?? 0) + 1;
        }
    }
    return out;
}

// Shared with the other bench-*.mjs modules; bench-metrics.mjs does not re-export them.
export { setsLock, detectionLockList };
