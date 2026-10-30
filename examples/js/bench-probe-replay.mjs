/*
 *  bench-probe-replay.mjs
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
 * The helpers the page's pyramid probe and the desktop replay share with it:
 * the replay's `--sequence` refusal and settings, its frame schedule, the
 * probe's clock and texture, and the target record and hash an export carries.
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, under the same name.
 */

import { mediaKey } from "./bench-loops.mjs";
import { percentile } from "./bench-stats.mjs";

/**
 * Why `scripts/replay-clips.mjs --sequence` cannot replay export `e`, in one
 * line, or `null` when it can: it must be a tracking run on one of `clips`,
 * with this module's `metricsVersion`, the replay's target (`sha256`) and a
 * recorded processing size, and its detection must have run on the frame loop
 * (`detection.path` not `"worker"`): a worker run's frames wait for detections
 * the sequence replay never hands in, so it would answer the frames the
 * worker's detection locked with `no-detection`.
 */
export function sequenceRefusal(e, { metricsVersion, sha256, clips }) {
    if (e?.mode !== "tracking") return `it is a ${e?.mode ?? "(no mode)"} run, not a tracking run`;
    if (e.detection?.path === "worker") {
        return "it is a worker-detection run, whose frames wait for detections this replay does not hand in";
    }
    if (e.source !== "bundled" || !clips.includes(e.bundledClip)) {
        return `it did not run on a bundled clip (source ${e.source}, clip ${e.bundledClip ?? "(none)"})`;
    }
    if (e.metricsVersion !== metricsVersion) {
        return `it has metricsVersion ${e.metricsVersion ?? "(none)"}, not ${metricsVersion}`;
    }
    if (e.target?.sha256 !== sha256) {
        return `its target (sha256 ${e.target?.sha256 ?? "(none)"}) is not targets/pinball.wnft as this replay reads it (${sha256})`;
    }
    if (!(e.processingResolution?.width > 0 && e.processingResolution?.height > 0)) {
        return "it records no processingResolution";
    }
    if (!(e.processingBox?.width > 0 && e.processingBox?.height > 0)) {
        return "it records no processingBox, so its frames cannot be sized as the page sized them";
    }
    if (!e.tracker?.options) {
        return "it records no tracker options, so the replay could not run the tracker it ran";
    }
    return null;
}

/**
 * How `--sequence` replays export `e` (one `sequenceRefusal` accepted): at its
 * own processing box, and with the tracker options it recorded — the page's
 * `maxKeypoints` among them — so the replay does the work the device did.
 * The replay adds only its own clock.
 */
export function sequenceSettings(e) {
    return {
        box: { width: e.processingBox.width, height: e.processingBox.height },
        trackerOptions: { ...e.tracker.options },
    };
}

/**
 * The device ÷ desktop ratio of two `trackStepMs` statistics' p50, or `null`
 * when either has no TRACK frames or a p50 of 0: a run that never tracked has
 * no ratio, and must not read as one of 0 or Infinity.
 */
export function proxyRatio(device, here) {
    if (!(device?.n > 0 && here?.n > 0 && device.p50 > 0 && here.p50 > 0)) return null;
    return device.p50 / here.p50;
}

/**
 * The smallest step `clock` was seen to take over `samples` attempts, or
 * `null` if it never moved. Chrome coarsens `performance.now()` to 0.1 ms on a
 * page that is not cross-origin isolated, so a stage under that reads 0 or
 * 0.1 ms; exports record this so such values are read as what they are.
 */
export function clockResolution(clock, samples = 50) {
    let best = Infinity;
    for (let s = 0; s < samples; s++) {
        const t0 = clock();
        let t1 = t0;
        for (let spin = 0; t1 === t0 && spin < 1e6; spin++) t1 = clock();
        if (t1 > t0) best = Math.min(best, t1 - t0);
    }
    return best === Infinity ? null : best;
}

/**
 * `fn` timed `runs` times after `warmup` untimed runs, `{ p50, p95 }` in the
 * clock's unit: the method of packages/nft-tracker/scripts/bench-tracking.mjs,
 * whose numbers #63's device estimates came from, so the page's probe measures
 * what that script estimated.
 */
export function timeRepeated(fn, { clock, warmup = 50, runs = 300 }) {
    for (let i = 0; i < warmup; i++) fn();
    const samples = new Array(runs);
    for (let i = 0; i < runs; i++) {
        const t0 = clock();
        fn();
        samples[i] = clock() - t0;
    }
    samples.sort((a, b) => a - b);
    return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

/**
 * The smooth, deterministic texture bench-tracking.mjs times the frame pyramid
 * on. The pyramid's arithmetic does not depend on the pixels; the texture
 * matches so the two measurements are of the same thing.
 */
export function texturedFrame(width, height) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v =
                128 +
                50 * Math.sin(0.35 * x + 0.2 * y) +
                40 * Math.cos(0.23 * y - 0.31 * x) +
                20 * Math.sin(0.57 * x) * Math.cos(0.49 * y);
            data[y * width + x] = Math.round(v);
        }
    }
    return { data, width, height };
}

/**
 * SHA-256 of `bytes` as lowercase hex, or `null` without SubtleCrypto — which
 * browsers give only to a secure context (https://, or http://localhost).
 */
export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
    if (!subtle) return null;
    const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What an export records about the target a run used: where it came from
 * (`"wnft"`, a file loaded and decoded; `"image"`, built in the page), the
 * file and its SHA-256, how it was built when it was, and what it carries.
 */
export function targetRecord({ source, file, sha256, db, builtWith = null }) {
    return {
        source,
        file,
        sha256,
        builtWith,
        widthPx: db.meta.widthPx,
        heightPx: db.meta.heightPx,
        levels: db.pyramid.levelSizes.length,
        keypoints: db.keypoints.count,
        patches: db.patches ? db.patches.count : 0,
        patchSize: db.patches ? db.patches.patchSize : null,
    };
}

/**
 * The frame a device busy for `busyMs` after frame `i` processes next: the
 * first whose time is at or after `times[i] + busyMs`, or `times.length`
 * when none is. `times` ascending, seconds — the desktop replay's model of
 * `requestVideoFrameCallback` skipping the frames that went stale.
 */
export function nextFrameIndex(times, i, busyMs) {
    const until = times[i] + busyMs / 1000;
    let j = i + 1;
    while (j < times.length && times[j] < until) j++;
    return j;
}

/** The index in `pts` of each of `mediaTimes`, matched to the microsecond; throws on one no frame has. */
export function framesAt(pts, mediaTimes) {
    const index = new Map(pts.map((t, i) => [mediaKey(t), i]));
    return mediaTimes.map((t) => {
        const i = index.get(mediaKey(t));
        if (i === undefined) throw new Error(`no frame at media time ${t}`);
        return i;
    });
}
