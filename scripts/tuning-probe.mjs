/*
 *  tuning-probe.mjs
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
 * The per-patch figures a tuning round needs and no export carries, for
 * `scripts/replay-clips.mjs`: each patch's alignment iterations, the
 * zero-normalised cross-correlation (ZNCC) of each converged alignment, and
 * whether a converged patch agrees with the fit the frame accepted.
 *
 * **How.** `NftTracker` keeps its lock private and reports a step's counts,
 * not its patches. The probe mirrors the lock from the results — a TRACK
 * frame advances it, a DETECT frame restarts it with no velocity, a LOST frame
 * drops it: `process`'s own rules in the default mode — and on every frame
 * that starts with one it runs the same step again, `trackFrame` from the
 * built package, then re-aligns each attempted patch to read its observation.
 * The tracking state draws no randomness, so the second run changes no RANSAC
 * draw of the tracker's, and costs only desktop time the tracker's own clock
 * does not see.
 *
 * **It checks itself on every step, and refuses to report otherwise.** Its
 * step's counts must equal the tracker's `result.tracking`, field for field,
 * and TRACK must mean the same homography; every re-alignment must reach the
 * outcome `trackFrame` gave that patch. A divergence throws: a probe that
 * disagreed with the tracker would be measuring something else.
 *
 * **"Right", without ground truth.** On a frame whose step held, a converged
 * patch is *right* when the accepted homography puts its centre within
 * `rightPx` (1 px) of where it aligned. That selects frames the tracker
 * accepted, so it is an agreement with the fit, not with the truth; on the
 * static clip, where every pose is right (the 2026-09-26 validity check 7),
 * the two coincide. A right patch whose ZNCC is under `minPatchZncc` is a
 * correct patch the gate refused — the count round 2 watches.
 */

import { alignPrepared, preparePatch } from "../packages/nft-tracker/dist/tracking/align_patch.js";
import {
    PatchOutcome,
    trackFrame,
    trackTarget,
} from "../packages/nft-tracker/dist/tracking/track_frame.js";
import {
    buildFramePyramid,
    DEFAULT_ALIGN_EPSILON,
    DEFAULT_ALIGN_MAX_ITERATIONS,
    DEFAULT_FIT_EPSILON,
    DEFAULT_FIT_MAX_ITERATIONS,
    DEFAULT_MAX_FIT_RMS,
    DEFAULT_MAX_FRAME_LEVELS,
    DEFAULT_MAX_OUTLIER_SHARE,
    DEFAULT_MIN_PATCH_ZNCC,
    DEFAULT_MIN_TRACKED_PATCHES,
    DEFAULT_PHOTOMETRIC,
    DEFAULT_TUKEY_C,
    predictHomography,
} from "../packages/nft-tracker/dist/index.js";
import { percentile, stats } from "../examples/js/bench-metrics.mjs";

/** `trackFrame`'s options from `NftTracker` option overrides, by the tracker's defaults. */
export function stepOptions(o = {}) {
    return {
        maxFrameLevels: o.maxFrameLevels ?? DEFAULT_MAX_FRAME_LEVELS,
        align: {
            maxIterations: o.alignMaxIterations ?? DEFAULT_ALIGN_MAX_ITERATIONS,
            epsilon: o.alignEpsilon ?? DEFAULT_ALIGN_EPSILON,
            photometric: o.photometric ?? DEFAULT_PHOTOMETRIC,
        },
        fit: {
            maxIterations: o.fitMaxIterations ?? DEFAULT_FIT_MAX_ITERATIONS,
            tukeyC: o.tukeyC ?? DEFAULT_TUKEY_C,
            epsilon: o.fitEpsilon ?? DEFAULT_FIT_EPSILON,
        },
        minTrackedPatches: o.minTrackedPatches ?? DEFAULT_MIN_TRACKED_PATCHES,
        maxOutlierShare: o.maxOutlierShare ?? DEFAULT_MAX_OUTLIER_SHARE,
        maxFitRms: o.maxFitRms ?? DEFAULT_MAX_FIT_RMS,
        minPatchZncc: o.minPatchZncc ?? DEFAULT_MIN_PATCH_ZNCC,
    };
}

const STAT_KEYS = [
    "frameLevels",
    "culled",
    "attempted",
    "observed",
    "lost",
    "unconverged",
    "rejected",
    "failed",
    "inliers",
    "rmsError",
    "fitIterations",
    "fitConverged",
];

function project(H, X, Y) {
    const w = H[6] * X + H[7] * Y + H[8];
    return [(H[0] * X + H[1] * Y + H[2]) / w, (H[3] * X + H[4] * Y + H[5]) / w];
}

/**
 * A probe for one replay of one clip. Call `frame(frame, result)` after every
 * `tracker.process(frame, …)`, in order, then `summary()`.
 *
 * @param target     The decoded target the tracker runs on.
 * @param overrides  The same option overrides the tracker was given.
 */
export function createStepProbe(target, overrides = {}, { rightPx = 1 } = {}) {
    const opts = stepOptions(overrides);
    const track = trackTarget(target.patches, target.pyramid.scaleStep);
    const { patches } = target;
    let lock = null;
    let index = -1;
    const acc = {
        steps: 0,
        iterations: [],
        unconvergedIterations: 0,
        rightIterations: [],
        converged: 0,
        unconverged: 0,
        zncc: [],
        rightZncc: [],
        rightRejected: 0,
        observedOffFit: 0,
        perPatchUs: [],
        tooFew: [],
    };

    const diverged = (what) => {
        throw new Error(`tuning probe diverged from the tracker at frame ${index}: ${what}`);
    };

    function record(frame, r, result, previous, current) {
        acc.steps++;
        const first = previous === null;
        if (!r.ok && r.loss === "too-few-patches") {
            acc.tooFew.push({
                first,
                observed: r.stats.observed,
                inliers: r.stats.inliers,
                attempted: r.stats.attempted,
                culled: r.stats.culled,
            });
        }
        const t = result.timings;
        if (t && r.stats.attempted > 0) acc.perPatchUs.push((1000 * t.alignMs) / r.stats.attempted);
        if (r.stats.frameLevels === 0) return; // no prediction: nothing was aligned
        const predicted = predictHomography(previous, current);
        if (!predicted.ok) diverged("the tracker aligned, the probe's prediction failed");
        const built = buildFramePyramid(frame, {
            levels: r.stats.frameLevels,
            scaleStep: track.scaleStep,
        });
        if (!built.ok) diverged(`buildFramePyramid: ${built.reason}`);
        for (let q = 0; q < patches.count; q++) {
            const outcome = r.outcomes[q];
            if (
                outcome !== PatchOutcome.Observed &&
                outcome !== PatchOutcome.Rejected &&
                outcome !== PatchOutcome.Unconverged
            ) {
                continue;
            }
            const p = preparePatch(patches, q, track.scaleStep, predicted.H);
            const a = p.ok ? alignPrepared(built.pyramid, p, opts.align) : p;
            if (!a.ok) diverged(`patch ${q}: ${a.reason}, where the step had outcome ${outcome}`);
            const o = a.observation;
            acc.iterations.push(o.iterations);
            if (!o.converged) {
                if (outcome !== PatchOutcome.Unconverged) diverged(`patch ${q} unconverged`);
                acc.unconverged++;
                acc.unconvergedIterations += o.iterations;
                continue;
            }
            acc.converged++;
            const c = o.residual / (o.gain * track.patchSpreads[q]);
            const zncc = 1 / Math.sqrt(1 + c * c);
            if (zncc < opts.minPatchZncc !== (outcome === PatchOutcome.Rejected)) {
                diverged(`patch ${q}: ZNCC ${zncc} against outcome ${outcome}`);
            }
            acc.zncc.push(zncc);
            if (!r.ok) continue;
            const [x, y] = project(r.H, track.centres[2 * q], track.centres[2 * q + 1]);
            const right = Math.hypot(x - o.x, y - o.y) <= rightPx;
            if (right) {
                acc.rightZncc.push(zncc);
                acc.rightIterations.push(o.iterations);
                if (outcome === PatchOutcome.Rejected) acc.rightRejected++;
            } else if (outcome === PatchOutcome.Observed) {
                acc.observedOffFit++;
            }
        }
    }

    return {
        frame(frame, result) {
            index++;
            const ran = result.tracking !== null && result.tracking !== undefined;
            if ((lock !== null) !== ran) {
                diverged(
                    `the tracker ${ran ? "ran" : "did not run"} a step, the mirror lock says otherwise`,
                );
            }
            if (lock !== null) {
                const { previous, current } = lock;
                const r = trackFrame(frame, track, previous, current, opts, null);
                for (const k of STAT_KEYS) {
                    if (r.stats[k] !== result.tracking[k]) {
                        diverged(`${k}: probe ${r.stats[k]}, tracker ${result.tracking[k]}`);
                    }
                }
                if (r.ok !== (result.state === "TRACK"))
                    diverged(`step ok ${r.ok}, state ${result.state}`);
                if (r.ok && r.H.some((v, i) => v !== result.H[i]))
                    diverged("a different homography");
                record(frame, r, result, previous, current);
            }
            if (result.state === "TRACK") lock = { previous: lock.current, current: result.H };
            else if (result.state === "DETECT") lock = { previous: null, current: result.H };
            else lock = null;
        },

        summary() {
            const attempts = acc.converged + acc.unconverged;
            const byFirst = (first) => acc.tooFew.filter((l) => l.first === first);
            // A lower minTrackedPatches can only win back a loss whose binding
            // count — the correspondences when too few survived alignment, else
            // the fit's inliers — is at least 4 (the floor) and under the
            // current threshold. An upper bound: maxOutlierShare may still
            // refuse such a fit.
            const binding = (l) => (l.observed < opts.minTrackedPatches ? l.observed : l.inliers);
            const winnable = acc.tooFew.filter(
                (l) => binding(l) >= 4 && binding(l) < opts.minTrackedPatches,
            ).length;
            const spent = acc.iterations.reduce((a, b) => a + b, 0);
            // What a lower alignMaxIterations would cost in right alignments:
            // the share that needed more than k. Iterations sum the levels a
            // patch visited, so on one frame level this is exact, and on two
            // an upper bound.
            const over = (k) =>
                acc.rightIterations.length === 0
                    ? null
                    : acc.rightIterations.filter((n) => n > k).length / acc.rightIterations.length;
            return {
                steps: acc.steps,
                perPatchUs: stats(acc.perPatchUs),
                alignIterations: stats(acc.iterations),
                unconvergedShare: attempts > 0 ? acc.unconverged / attempts : null,
                iterationsOnUnconverged: spent > 0 ? acc.unconvergedIterations / spent : null,
                rightIterations: stats(acc.rightIterations),
                rightIterationsP99: pct(acc.rightIterations, 99),
                rightNeedingMoreThan: { 8: over(8), 10: over(10), 15: over(15), 20: over(20) },
                zncc: stats(acc.zncc),
                rightZncc: stats(acc.rightZncc),
                rightZnccP1: pct(acc.rightZncc, 1),
                rightZnccP5: pct(acc.rightZncc, 5),
                right: acc.rightZncc.length,
                rightRejected: acc.rightRejected,
                observedOffFit: acc.observedOffFit,
                tooFewPatches: {
                    first: byFirst(true).length,
                    held: byFirst(false).length,
                    observed: stats(acc.tooFew.map((l) => l.observed)),
                    culled: stats(acc.tooFew.map((l) => l.culled)),
                    winnableByLowerMinimum: winnable,
                },
            };
        },
    };
}

/** The `p`th percentile of `values` by the bench's rank rule, or `null` for none. */
function pct(values, p) {
    return values.length === 0
        ? null
        : percentile(
              [...values].sort((a, b) => a - b),
              p,
          );
}
