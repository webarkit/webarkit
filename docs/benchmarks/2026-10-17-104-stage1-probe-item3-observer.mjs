/*
 *  2026-10-17-104-stage1-probe-item3-observer.mjs
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
 * Not part of the shipped path. This file patches the backend at runtime, and
 * nothing in the repository imports it: no package, no example, no script, no
 * test. It is loaded only by the shadow replay command named in
 * 2026-10-17-104-stage1-probe-item3.md and below, as a `--import` preload on
 * an otherwise unmodified run of `scripts/replay-clips.mjs`. What it does: it
 * wraps the backend's `estimateHomography` on the class prototype, calls the
 * original, records what it returned, and returns that result unchanged. It
 * draws no random number, so the run it rides on is the probe's run to the
 * last frame, and the harness (2026-10-17-104-stage1-probe-item3.mjs) checks
 * that it is.
 *
 * Why it exists: the shadow replay's observer for item 3 of #104's Stage 1
 * probe. The probe's exports carry no residual for a detection: a DETECT
 * frame's `tracking.rmsError` is the failed tracking step's, and
 * `frameRecord` exports neither the fit's `H` nor its correspondences. This
 * file reads that one quantity without touching the instrument, and the
 * shadow's exports must equal the recorded run's frame for frame.
 *
 *     node --import <absolute path or file URL of this file> \
 *         <worktree>/scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <dir>/seed-<n>
 *
 * run from a clean worktree at 37dc6d4 (round 0's commit) built on node
 * v24.21.0, as the probe's replays were; one run per seed, 1 to 8. The bundle
 * it wraps is found from the replay script's own path (`process.argv[1]`):
 * `<worktree>/examples/dist/webarkit-packages.mjs`, the module the script
 * imports with `--packages bundle`, so the wrapped prototype is the script's
 * own. `--packages dist` is refused, since the script would then import the
 * backend from another module.
 *
 * Per call it records: `ok`; `numMatches` (the correspondences given);
 * `numInliers`; `H` (row-major, as returned); `maskCount` (set bits of the
 * inlier mask); `rms`, the RMS transfer error of `H` over the correspondences
 * the mask marks, in frame px; `maxErr`, the largest of those errors; and the
 * RANSAC `threshold` passed. Written as `estimateHomography-calls.json` into
 * the `--out` directory when the process exits. The harness matches each call
 * to a frame by projecting the call's `H` onto the target corners and
 * comparing to the frame's exported `corners` exactly.
 *
 * A known limitation, as the probe script's: this file is covered by no test
 * and by no format check (`docs/` is outside both), so a change in the replay
 * script, the bundle's exports or node's `--import` could break it without
 * notice while the figures it produced stay in the record; and the tool has no
 * tests, so a defect in it would produce a wrong result reproducibly. Its
 * guards are the harness's checks: the shadow's exports must equal the
 * recorded ones, and every posed detection must match one observed call.
 * Those catch a wrap that did not take or a run that differs, not a defect in
 * the residual arithmetic itself.
 */

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const script = process.argv[1] ? resolve(process.argv[1]) : null;
if (!script || !/replay-clips\.mjs$/.test(script)) {
    throw new Error(
        `observer: expected scripts/replay-clips.mjs as the main script, got ${script}`,
    );
}
const packagesIdx = process.argv.indexOf("--packages");
if (packagesIdx < 0 || process.argv[packagesIdx + 1] !== "bundle") {
    throw new Error(
        "observer: the replay must run with --packages bundle, the module this file wraps",
    );
}
const worktree = resolve(dirname(script), "..");
const BUNDLE = pathToFileURL(join(worktree, "examples", "dist", "webarkit-packages.mjs")).href;

const { createJsfeatNextBackend } = await import(BUNDLE);
const proto = Object.getPrototypeOf(await createJsfeatNextBackend());
const orig = proto.estimateHomography;
if (typeof orig !== "function")
    throw new Error("observer: estimateHomography is not on the backend's prototype");

const calls = [];
proto.estimateHomography = function (src, dst, options) {
    const r = orig.call(this, src, dst, options);
    const count = src.length >> 1;
    if (!r.ok) {
        calls.push({ ok: false, numMatches: count, numInliers: r.numInliers });
        return r;
    }
    const H = r.H;
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let i = 0; i < count; i++) {
        if (!r.inliers[i]) continue;
        const x = src[2 * i];
        const y = src[2 * i + 1];
        const w = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / w;
        const v = (H[3] * x + H[4] * y + H[5]) / w;
        const e2 = (u - dst[2 * i]) ** 2 + (v - dst[2 * i + 1]) ** 2;
        sum += e2;
        if (e2 > max) max = e2;
        n++;
    }
    calls.push({
        ok: true,
        H: Array.from(H),
        numMatches: count,
        numInliers: r.numInliers,
        maskCount: n,
        rms: Math.sqrt(sum / n),
        maxErr: Math.sqrt(max),
        threshold: options?.threshold ?? null,
    });
    return r;
};

const outIdx = process.argv.indexOf("--out");
const outDir = outIdx > 0 ? process.argv[outIdx + 1] : ".";
process.on("exit", () => {
    if (calls.length === 0) {
        console.error("observer: no estimateHomography call was observed; the wrap did not take");
        process.exitCode = 1;
        return;
    }
    writeFileSync(join(outDir, "estimateHomography-calls.json"), JSON.stringify(calls));
    console.error(
        `observer: ${calls.length} estimateHomography calls recorded (${calls.filter((c) => c.ok).length} ok)`,
    );
});
