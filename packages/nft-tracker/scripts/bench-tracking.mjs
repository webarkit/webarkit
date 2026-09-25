/*
 *  bench-tracking.mjs
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

/**
 * Times the tracking state's per-frame primitives in Node, on this machine.
 *
 *     npm run build
 *     node packages/nft-tracker/scripts/bench-tracking.mjs
 *
 * **Not an on-device measurement.** ADR-0001 point 3 names the frame pyramid
 * as the first step to move into the backend if tracker-side cost is too
 * high, and point 5 sets the bar on the reference device (`Tab_9_WiFi`).
 * This script gives the number on whatever runs it; the on-device one comes
 * from `examples/bench-nft.html` once it has a tracking mode (#48). To make
 * the two comparable at all, it also times the same RGBA → grey loop that
 * `bench-nft` records as `gray` — the reference device's camera path measured
 * 1.2 ms p50 for it at 270×360 (docs/benchmarks/README.md, "Webcam: `acquire`
 * without a video decoder") — and reports each figure scaled by that ratio.
 * Both are plain loops over typed arrays, but the scaling is a proxy, not a
 * measurement: JIT, cache and memory bandwidth differ between the two.
 *
 * Imports the built `dist/`. Deterministic inputs; timings are p50 / p95
 * over repeated runs after a warm-up.
 */

import { cpus } from "node:os";
import { alignPatch, buildFramePyramid } from "../dist/index.js";

const STEP = Math.cbrt(2);
const WARMUP = 50;
const RUNS = 300;
/** The reference device's `gray` p50 on the camera path, 270×360 (docs/benchmarks/README.md). */
const DEVICE_GRAY_MS = 1.2;

/** A smooth, deterministic texture, as the alignment tests use. */
function textured(width, height) {
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

/** `fn` timed `RUNS` times after `WARMUP` runs: `{ p50, p95 }` in ms. */
function time(fn) {
    for (let i = 0; i < WARMUP; i++) fn();
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        fn();
        samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    return { p50: samples[RUNS >> 1], p95: samples[Math.floor(RUNS * 0.95)] };
}

/** The `gray` stage of examples/js/pinball-shared.mjs, on an RGBA buffer of the frame's size. */
function grayLoop(width, height) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 2654435761) >>> 24;
    return () => {
        const data = new Uint8Array(width * height);
        for (let i = 0, p = 0; i < data.length; i++, p += 4) {
            data[i] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) | 0;
        }
        return data;
    };
}

function pyramid(frame, levels) {
    const r = buildFramePyramid(frame, { levels, scaleStep: STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

/** P × P patches cut from `level` of `source`, on a grid, as a PatchTable. */
function patchesFrom(source, level, P, count) {
    const img = source.levels[level];
    const sites = [];
    for (let k = 0; sites.length < count; k++) {
        const left = 4 + ((k * 37) % Math.max(1, img.width - P - 8));
        const top = 4 + ((k * 53) % Math.max(1, img.height - P - 8));
        sites.push({ left, top });
    }
    const pixels = new Uint8Array(count * P * P);
    sites.forEach(({ left, top }, q) => {
        for (let i = 0; i < P; i++) {
            for (let j = 0; j < P; j++) {
                pixels[q * P * P + i * P + j] = img.data[(top + i) * img.width + left + j];
            }
        }
    });
    return {
        patchSize: P,
        count,
        score: new Float32Array(count),
        left: Uint16Array.from(sites, (s) => s.left),
        top: Uint16Array.from(sites, (s) => s.top),
        level: new Uint8Array(count).fill(level),
        pixels,
    };
}

const fmt = (ms) => ms.toFixed(3);
const cpu = cpus()[0]?.model ?? "unknown CPU";
console.log(`Node ${process.version}, ${process.platform}/${process.arch}, ${cpu}`);
console.log(`${RUNS} runs after ${WARMUP} warm-up runs; p50 / p95 in ms.\n`);

const gray = time(grayLoop(270, 360));
const toDevice = DEVICE_GRAY_MS / gray.p50;
console.log(`gray loop, 270×360: ${fmt(gray.p50)} / ${fmt(gray.p95)}`);
console.log(`  device ÷ here: ${toDevice.toFixed(1)}× (device gray p50 ${DEVICE_GRAY_MS} ms)\n`);

console.log("buildFramePyramid, step ∛2 (level 0 is the frame itself, so 1 level costs nothing):");
console.log("| frame | levels | here p50 | here p95 | device estimate p50 |");
console.log("|---|---|---|---|---|");
for (const [w, h] of [
    [270, 360],
    [480, 270],
    [640, 480],
]) {
    const frame = textured(w, h);
    for (const levels of [2, 3, 4, 5, 6]) {
        const t = time(() => pyramid(frame, levels));
        const device = t.p50 * toDevice;
        console.log(
            `| ${w}×${h} | ${levels} | ${fmt(t.p50)} | ${fmt(t.p95)} | ${device.toFixed(2)} |`,
        );
    }
}

// P = 8 and P = 16, compile-target's default: a patch's cost grows with its
// P² pixels.
console.log("\nalignPatch, 270×360 frame, 6 levels, prediction off by (1.5, −1) px:");
const frame = pyramid(textured(270, 360), 6);
const options = { maxIterations: 30, epsilon: 0.01, photometric: false };
const off = Float64Array.from([1, 0, 1.5, 0, 1, -1, 0, 0, 1]);
for (const [P, label, level, photometric] of [8, 16].flatMap((P) => [
    [P, "matched (σ = 1), translation", 0, false],
    [P, "matched (σ = 1), with gain and bias", 0, true],
    [P, "magnified (σ = 2: starts on level 3, footprints on level 0)", 3, false],
])) {
    const count = 100;
    const patches = patchesFrom(frame, level, P, count);
    let iterations = 0;
    let aligned = 0;
    const t = time(() => {
        iterations = 0;
        aligned = 0;
        for (let q = 0; q < count; q++) {
            const r = alignPatch(frame, patches, q, STEP, off, { ...options, photometric });
            if (r.ok) {
                aligned++;
                iterations += r.observation.iterations;
            }
        }
    });
    console.log(
        `  P = ${P}, ${label}: ${fmt((1000 * t.p50) / count)} µs per patch here ` +
            `(${((t.p50 / count) * toDevice * 1000).toFixed(0)} µs device estimate); ` +
            `${aligned}/${count} aligned, ${(iterations / Math.max(1, aligned)).toFixed(1)} iterations each`,
    );
}
