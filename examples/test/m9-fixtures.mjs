/*
 *  m9-fixtures.mjs
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
 * Constructed exports for M9's analysis and run-level check (#243), shared by
 * m9-analysis.test.mjs and m9-run-check.test.mjs. Every frame is the frozen
 * `frameRecord` of a constructed tracker result: `H` is the homography of a
 * rigid pose (`K · [r₁ r₂ t]`), so the closed form on it is good, and the
 * selected pose, whose projection is `poseCorners`, is another rigid pose, so
 * route (b) recovers it. The two poses scatter about one base pose with their
 * own noise, which sets the sign of CF − IPPE; the filter smooths the
 * selected pose's noise. Deterministic: every draw comes from a seeded
 * generator.
 */

import { intrinsics } from "../../packages/cv-backend-jsfeatnext/dist/index.js";
import { frameRecord, summarizeRun, targetCorners } from "../js/bench-metrics.mjs";

/** mulberry32: a small seeded generator, uniform in [0, 1). */
export function generator(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const RESOLUTION = Object.freeze({ width: 203, height: 360 });
export const TARGET = Object.freeze({ widthPx: 200, heightPx: 150 });
export const K = intrinsics(RESOLUTION.width, RESOLUTION.height);
export const TARGET_POINTS = targetCorners(TARGET.widthPx, TARGET.heightPx);

const deg = Math.PI / 180;
function rotation(ax, ay, az) {
    const [cx, sx, cy, sy, cz, sz] = [
        Math.cos(ax),
        Math.sin(ax),
        Math.cos(ay),
        Math.sin(ay),
        Math.cos(az),
        Math.sin(az),
    ];
    // Rz · Ry · Rx, row-major.
    return Float64Array.from([
        cz * cy,
        cz * sy * sx - sz * cx,
        cz * sy * cx + sz * sx,
        sz * cy,
        sz * sy * sx + cz * cx,
        sz * sy * cx - cz * sx,
        -sy,
        cy * sx,
        cy * cx,
    ]);
}
/** A rigid pose: tilt about the x axis plus noise, and a translation that keeps the target in front. */
function pose(tiltDeg, noise, dt = [0, 0, 0]) {
    const R = rotation(tiltDeg * deg + noise[0], noise[1], noise[2]);
    return {
        R,
        t: Float64Array.from([
            -100 + noise[3] + dt[0],
            -75 + noise[4] + dt[1],
            350 + noise[5] + dt[2],
        ]),
        good: true,
    };
}
/** `K · [r₁ r₂ t]`, row-major. */
function homographyOf(p) {
    const M = [p.R[0], p.R[1], p.t[0], p.R[3], p.R[4], p.t[1], p.R[6], p.R[7], p.t[2]];
    const H = new Float64Array(9);
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            H[3 * i + j] = K[3 * i] * M[j] + K[3 * i + 1] * M[3 + j] + K[3 * i + 2] * M[6 + j];
    return H;
}

/**
 * One run's export, 15 frames a second, loop 0 a warm-up, loops 1 to 4
 * counted, and the first frame of loop 5, where a page run stops. `timestampMs` is wall time, which
 * does not wrap. Options:
 * - `seed`: the noise's;
 * - `sigmaH`, `sigmaSel`: the noise of the pose behind `H` (CF) and of the selected pose (IPPE),
 *   in radians and target units (the translation's noise is 20 times the rotation's);
 * - `tilt(media)`: the base tilt, degrees;
 * - `shift(k)`: a translation added to the base pose from frame `k` on, `[x, y, z]`;
 * - `edit(record, k)`: changes a frame after it is built;
 * - `seconds`: the clip's duration, a whole number of seconds (2 by default).
 */
export function buildExport({
    seed = 1,
    sigmaH = 0.0005,
    sigmaSel = 0.004,
    tilt = () => 3,
    shift = () => [0, 0, 0],
    clip = "pinball-static.mp4",
    edit = null,
    seconds = 2,
} = {}) {
    const rand = generator(seed);
    const gauss = () => {
        const u = Math.max(rand(), 1e-12);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const noise = (s) => [
        s * gauss(),
        s * gauss(),
        s * gauss(),
        20 * s * gauss(),
        20 * s * gauss(),
        20 * s * gauss(),
    ];
    const D = seconds;
    const perLoop = 15 * seconds;
    const frames = [];
    const total = 5 * perLoop + 1;
    for (let k = 0; k < total; k++) {
        const media = Math.round(((k % perLoop) / 15) * 1e6) / 1e6;
        const th = tilt(media, k);
        const dt = shift(k);
        const pH = pose(th, noise(sigmaH), dt);
        const pS = pose(th, noise(sigmaSel), dt);
        const state = k === 0 ? "DETECT" : "TRACK";
        const result = {
            ok: true,
            pose: pS,
            H: homographyOf(pH),
            sceneKeypoints: [],
            numMatches: 60,
            numInliers: 40,
            state,
            quality: 0.9,
            trackLoss: null,
            tracking: null,
            timings: { trackMs: 4 },
        };
        let record = frameRecord({
            mode: "tracking",
            result,
            stageTimings: { acquire: 5, total: 20 },
            timestampMs: 1000 + k * 66.7,
            mediaTimeSeconds: media,
            targetPoints: TARGET_POINTS,
            K,
        });
        record = JSON.parse(JSON.stringify(record));
        if (edit) record = edit(record, k) ?? record;
        frames.push(record);
    }
    return finish({
        metricsVersion: 2,
        mode: "tracking",
        source: "bundled",
        bundledClip: clip,
        processingResolution: { ...RESOLUTION },
        target: { source: "wnft", file: "targets/pinball.wnft", ...TARGET },
        tracker: { detectionOnly: false, options: { poseFilter: { mode: "off" } } },
        detection: { path: "sync" },
        seed: 1,
        seedPolicy: "frame",
        run: { order: 1, endedBy: "done", failure: null, lostVisibility: false },
        loops: { firstLoop: 1, loopCount: 4 },
        clipDurationS: D,
        ticks: total,
        windowSize: total,
        frames,
    });
}

/** Sets `runSummary.poseJitterPx` as the page does, by the frozen summarizeRun over the counted loops: after any edit to `frames`. */
export function finish(e) {
    e.runSummary = {
        poseJitterPx: summarizeRun(e.frames, {
            clipDurationS: e.clipDurationS,
            loops: e.loops,
            path: "sync",
        }).poseJitterPx,
    };
    return JSON.parse(JSON.stringify(e));
}
