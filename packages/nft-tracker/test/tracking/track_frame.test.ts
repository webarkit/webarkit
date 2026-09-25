/*
 *  track_frame.test.ts
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

// trackFrame, one tracking step, on the reference device's camera path: the
// 512 × 640 pinball target at 0.45 in a 270 × 360 frame, so its compiled
// patches — all level 0 — are seen at σ ≈ 0.45, sharper than the frame. Every
// frame is #63's generator (view + renderWarp) with one blur pass, σ = 2
// noise and a changed exposure. The numbers each test pins are stated beside
// it; the whole step is deterministic, so counts are pinned exactly.

import { describe, it, expect } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { alignPatch, buildFramePyramid } from "../../src/index.js";
import { PatchOutcome, trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions, TrackFrameResult } from "../../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import {
    mat3Mul,
    project,
    renderWarp,
    rotation,
    scaling,
    translation,
    view,
} from "../fixtures/warped_frames.js";

const image = readPgm(TARGET_FIXTURE);
const patches = pinballPatches();
const target = trackTarget(patches, PINBALL_STEP);
const CAMERA = { width: 270, height: 360 };
const OPTIONS: TrackFrameOptions = {
    maxFrameLevels: 4,
    align: { maxIterations: 30, epsilon: 0.01, photometric: true },
    fit: { maxIterations: 20, tukeyC: 4, epsilon: 1e-6 },
    minTrackedPatches: 8,
    maxOutlierShare: 0.45,
    maxFitRms: 0.6,
    minPatchZncc: 0.6,
};
const VIEWS: Mat3[] = [
    view({ target: image, frame: CAMERA, scale: 0.45 }),
    view({
        target: image,
        frame: CAMERA,
        scale: 0.45,
        angle: (15 * Math.PI) / 180,
        perspective: [0.0004, -0.0003],
    }),
];
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10, seed: 3 };
const FRAMES = VIEWS.map((H) => renderWarp(image, H, RENDER));

/** RMS, frame px, between where `A` and `B` put the 64 patch centres. */
function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let q = 0; q < patches.count; q++) {
        const [ax, ay] = project(A, target.centres[2 * q], target.centres[2 * q + 1]);
        const [bx, by] = project(B, target.centres[2 * q], target.centres[2 * q + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / patches.count);
}

/** `E` applied in the frame about the target centre's image: the prediction is `E · truth`. */
function about(E: Mat3, H: Mat3): Mat3 {
    const [cx, cy] = project(H, (image.width - 1) / 2, (image.height - 1) / 2);
    return mat3Mul(mat3Mul(translation(cx, cy), mat3Mul(E, translation(-cx, -cy))), H);
}

function count(outcomes: Uint8Array, code: number): number {
    return outcomes.reduce((n, o) => n + (o === code ? 1 : 0), 0);
}

/** Patch `q`'s four corner samples under `H`, frame level-0 px. */
function corners(H: Mat3, q: number): [number, number][] {
    const last = patches.patchSize - 1;
    const s = target.patchScales[q];
    return [0, 1, 2, 3].map((k) =>
        project(
            H,
            (patches.left[q] + (k & 1 ? last : 0)) / s,
            (patches.top[q] + (k & 2 ? last : 0)) / s,
        ),
    );
}

/** One step from `prediction` (`previous = null`: the prediction is `prediction` itself). */
function track(
    frame: GrayImage,
    prediction: Mat3,
    options: TrackFrameOptions = OPTIONS,
): TrackFrameResult {
    return trackFrame(frame, target, null, prediction, options, null);
}

/** The bookkeeping every result must keep, whatever it ends in. */
function expectConsistent(r: TrackFrameResult): void {
    const s = r.stats;
    expect(s.culled + s.attempted).toBe(patches.count);
    expect(s.observed + s.lost + s.unconverged + s.rejected + s.failed).toBe(s.attempted);
    expect(count(r.outcomes, PatchOutcome.Culled)).toBe(s.culled);
    expect(count(r.outcomes, PatchOutcome.Observed)).toBe(s.observed);
    expect(count(r.outcomes, PatchOutcome.Unconverged)).toBe(s.unconverged);
    expect(count(r.outcomes, PatchOutcome.Lost)).toBe(s.lost);
    expect(count(r.outcomes, PatchOutcome.Rejected)).toBe(s.rejected);
    expect(count(r.outcomes, PatchOutcome.Failed)).toBe(s.failed);
    if (r.ok) {
        expect(r.weights.length).toBe(s.observed);
        const sum = r.weights.reduce((a, w) => a + w, 0);
        expect(r.quality).toBe(sum / s.attempted);
        expect(s.inliers).toBe(r.weights.filter((w) => w > 0).length);
    }
}

/** The 16 translations of `d` px, 22.5° apart. */
function shifts(d: number): Mat3[] {
    return Array.from({ length: 16 }, (_, k) => {
        const a = (k * Math.PI) / 8;
        return translation(d * Math.cos(a), d * Math.sin(a));
    });
}

interface Sweep {
    /** Trials that ended `ok` with H within 0.5 px RMS of the truth at the patch centres. */
    recovered: number;
    /** `centreRms` of the trials that ended `ok` 0.5 px or more off: accepted wrong fits. */
    wrong: number[];
    /** Failed trials, by `TrackLoss`. */
    losses: Record<string, number>;
}

/** Every view, every one of `errors` applied about the target centre. */
function sweep(errors: Mat3[], options: TrackFrameOptions = OPTIONS): Sweep {
    const out: Sweep = { recovered: 0, wrong: [], losses: {} };
    VIEWS.forEach((H, v) => {
        for (const E of errors) {
            const r = track(FRAMES[v], about(E, H), options);
            expectConsistent(r);
            if (!r.ok) {
                out.losses[r.loss] = (out.losses[r.loss] ?? 0) + 1;
                continue;
            }
            const e = centreRms(r.H, H);
            if (e < 0.5) out.recovered++;
            else out.wrong.push(e);
        }
    });
    return out;
}

describe("trackFrame", () => {
    it("tracks from the exact pose, keeping its books: 57 of 64 patches observed, H 0.073 px off", () => {
        // Measured. View 0: 64 attempted, 57 observed, 3 unconverged, 4
        // rejected by the ZNCC gate, a fit residual of 0.261 px, H 0.073 px
        // RMS from the truth at the patch centres, quality 0.883. View 1
        // (15°, tilted): 5 culled, 54 of 59 observed, 4 unconverged, 1
        // rejected, residual 0.238 px, H 0.088 px off, quality 0.909.
        const expected = [
            {
                culled: 0,
                attempted: 64,
                observed: 57,
                unconverged: 3,
                rejected: 4,
                residual: 0.32,
                error: 0.088,
            },
            {
                culled: 5,
                attempted: 59,
                observed: 54,
                unconverged: 4,
                rejected: 1,
                residual: 0.29,
                error: 0.11,
            },
        ];
        const quality = [0.8828, 0.9087];
        VIEWS.forEach((H, v) => {
            const r = track(FRAMES[v], H);
            expect(r.ok).toBe(true);
            expectConsistent(r);
            if (!r.ok) return;
            const e = expected[v];
            expect(r.stats).toMatchObject({
                frameLevels: 1,
                culled: e.culled,
                attempted: e.attempted,
                observed: e.observed,
                lost: 0,
                unconverged: e.unconverged,
                rejected: e.rejected,
                failed: 0,
                inliers: e.observed,
            });
            expect(r.stats.rmsError).toBeLessThan(e.residual);
            expect(centreRms(r.H, H)).toBeLessThan(e.error);
            expect(r.quality).toBeCloseTo(quality[v], 3);
        });
    });

    it("culls patches whose predicted window leaves the frame (30 of 64), counts them nowhere else, and tracks on the rest", () => {
        const H = view({ target: image, frame: CAMERA, scale: 0.45, shift: [130, 0] });
        const r = track(renderWarp(image, H, RENDER), H);
        expectConsistent(r);
        expect(r.stats.culled).toBeGreaterThan(0);
        for (let q = 0; q < patches.count; q++) {
            const inside = corners(H, q).every(
                ([x, y]) => x >= 0 && x <= CAMERA.width - 1 && y >= 0 && y <= CAMERA.height - 1,
            );
            expect(r.outcomes[q] === PatchOutcome.Culled).toBe(!inside);
        }
        // Measured: 30 culled, 29 of the other 34 observed (3 unconverged,
        // 2 rejected), H 0.190 px off.
        expect(r.stats).toMatchObject({
            culled: 30,
            attempted: 34,
            observed: 29,
            unconverged: 3,
            rejected: 2,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(centreRms(r.H, H)).toBeLessThan(0.23);
    });

    it("counts a patch whose window is covered as lost (singular), and none of them reaches the fit", () => {
        const H = VIEWS[0];
        const occluded = { ...FRAMES[0], data: Uint8Array.from(FRAMES[0].data) };
        const inBlock = (x: number, y: number) => x >= 135 && y < 180;
        for (let y = 0; y < CAMERA.height; y++) {
            for (let x = 0; x < CAMERA.width; x++) {
                if (inBlock(x, y)) occluded.data[y * CAMERA.width + x] = 128;
            }
        }
        const r = track(occluded, H);
        expectConsistent(r);
        let covered = 0;
        let straddling = 0;
        for (let q = 0; q < patches.count; q++) {
            const c = corners(H, q);
            // The window is convex, and so is the block: it is wholly inside
            // when all four corners are.
            const all = c.every(([x, y]) => inBlock(x, y));
            const some = c.some(([x, y]) => inBlock(x, y));
            if (all) {
                covered++;
                expect(r.outcomes[q]).toBe(PatchOutcome.Lost);
            } else if (some) {
                straddling++;
            }
        }
        // Measured: 17 patches wholly covered, all lost; 2 straddle the
        // block's edge. The frame still tracks on 41, H 0.109 px off, and
        // quality falls from 0.883 (unoccluded) to 0.636, about 47/64 of it.
        expect(covered).toBe(17);
        expect(straddling).toBe(2);
        expect(r.stats).toMatchObject({
            attempted: 64,
            observed: 41,
            lost: 17,
            unconverged: 3,
            rejected: 3,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(centreRms(r.H, H)).toBeLessThan(0.14);
        expect(r.quality).toBeCloseTo(0.636, 3);
    });

    it("loses every patch of a flat frame, and the frame with them", () => {
        const flat = { ...CAMERA, data: new Uint8Array(CAMERA.width * CAMERA.height).fill(128) };
        const r = track(flat, VIEWS[0]);
        expectConsistent(r);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.loss).toBe("too-few-patches");
        expect(r.stats.attempted).toBeGreaterThan(0);
        expect(r.stats.lost).toBe(r.stats.attempted);
        expect(r.stats.observed).toBe(0);
        expect(r.stats.inliers).toBe(0);
        expect(r.stats.rmsError).toBeNull();
        expect(r.stats.fitIterations).toBe(0);
        expect(r.stats.fitConverged).toBeNull();
    });

    it("reports how the fit ended: its iterations, and whether it stopped at the cap", () => {
        // Found in review: a fit that reached fit.maxIterations was judged
        // and returned with nothing saying so. From the exact pose the
        // default cap is never reached; a cap of 1 is, and is reported.
        const r = track(FRAMES[0], VIEWS[0]);
        expect(r.ok).toBe(true);
        expect(r.stats.fitConverged).toBe(true);
        expect(r.stats.fitIterations).toBeGreaterThan(0);
        expect(r.stats.fitIterations).toBeLessThan(OPTIONS.fit.maxIterations);
        const capped = track(FRAMES[0], VIEWS[0], {
            ...OPTIONS,
            fit: { ...OPTIONS.fit, maxIterations: 1 },
        });
        expect(capped.stats.fitIterations).toBe(1);
        expect(capped.stats.fitConverged).toBe(false);
    });

    it("survives a prediction up to 4 px off (32/32 within 0.5 px); at 4.25 px 1/32, at 4.5 and 6 px none, and never accepts a wrong fit", () => {
        // 16 directions × 2 views per distance. Past the basin a step may
        // fail, but it never accepts a wrong H: an accepted fit this far off
        // would become the next frame's prediction. Past 4 px the right
        // correspondences start outside tukeyC and the ZNCC gate has turned
        // away the wrong ones near the prediction, so the fit fails cleanly.
        // Without the inlier, residual and ZNCC rules, 4 fits at 4 px were
        // accepted 3.7–6.9 px off.
        const expected: [number, number, Record<string, number>][] = [
            [0, 32, {}],
            [1, 32, {}],
            [2, 32, {}],
            [3, 32, {}],
            [3.5, 32, {}],
            [4, 32, {}],
            [4.25, 1, { "too-many-outliers": 3, "fit-failed": 28 }],
            [4.5, 0, { "fit-failed": 32 }],
            [6, 0, { "too-many-outliers": 1, "fit-failed": 31 }],
        ];
        for (const [d, recovered, losses] of expected) {
            const s = sweep(shifts(d));
            expect(s.wrong).toEqual([]);
            expect(s.recovered).toBe(recovered);
            expect(s.losses).toEqual(losses);
        }
    });

    it("survives 4° of roll and 8% of scale in the prediction; 5° is refused", () => {
        // Measured: every recovered H within 0.546 px (at −4°, on 13
        // inliers); both 5° cases end with fewer than 8 inliers.
        const deg = (a: number) => (a * Math.PI) / 180;
        for (const [E, outcome] of [
            [rotation(deg(2)), "ok"],
            [rotation(deg(-2)), "ok"],
            [rotation(deg(3)), "ok"],
            [rotation(deg(-3)), "ok"],
            [rotation(deg(4)), "ok"],
            [rotation(deg(-4)), "ok"],
            [rotation(deg(5)), "too-few-patches"],
            [rotation(deg(-5)), "too-few-patches"],
            [scaling(1 / 1.08), "ok"],
            [scaling(1 / 1.06), "ok"],
            [scaling(1 / 1.05), "ok"],
            [scaling(1.05), "ok"],
            [scaling(1.06), "ok"],
            [scaling(1.08), "ok"],
        ] as const) {
            const r = track(FRAMES[0], about(E, VIEWS[0]));
            expectConsistent(r);
            expect(r.ok ? "ok" : r.loss).toBe(outcome);
            if (r.ok) expect(centreRms(r.H, VIEWS[0])).toBeLessThan(0.66);
        }
    });

    it("the outlier rule is exercised, and the ZNCC gate and the outlier and residual rules each turn away the wrong fits", () => {
        // With no zero weight allowed, 17 of the 32 trials at 4 px are
        // refused: those fits weigh at least one correspondence 0.
        const strict = sweep(shifts(4), { ...OPTIONS, maxOutlierShare: 0 });
        expect(strict.recovered).toBe(15);
        expect(strict.losses).toEqual({ "too-many-outliers": 17 });
        // At 6 px, without the ZNCC gate and the outlier and residual rules,
        // 9 of the 32 trials are accepted 5.3–14.2 px off the truth. Either
        // the gate alone or the two rules alone refuse all nine.
        const none = sweep(shifts(6), {
            ...OPTIONS,
            maxOutlierShare: 1 - 1e-12,
            maxFitRms: Infinity,
            minPatchZncc: 0,
        });
        expect(none.recovered).toBe(0);
        expect(none.losses).toEqual({ "too-few-patches": 11, "fit-failed": 12 });
        expect(none.wrong.length).toBe(9);
        expect(Math.min(...none.wrong)).toBeGreaterThan(5);
        const gateOnly = sweep(shifts(6), {
            ...OPTIONS,
            maxOutlierShare: 1 - 1e-12,
            maxFitRms: Infinity,
        });
        expect(gateOnly.wrong).toEqual([]);
        expect(gateOnly.losses).toEqual({ "too-few-patches": 1, "fit-failed": 31 });
        const rulesOnly = sweep(shifts(6), { ...OPTIONS, minPatchZncc: 0 });
        expect(rulesOnly.wrong).toEqual([]);
        expect(rulesOnly.losses).toEqual({
            "too-many-outliers": 16,
            "poor-fit": 4,
            "fit-failed": 12,
        });
    });

    it("rejects a match that correlates poorly with its patch (at 0.9, 38 of 64), and keeps it out of the fit", () => {
        // A converged alignment's zero-normalised cross-correlation with its
        // patch, from what alignPatch returns: with gain g and residual r,
        // ZNCC = 1 / √(1 + (r / (g · σ_T))²), σ_T the patch's own spread.
        // Recomputed here, independently, for every rejected patch.
        const spread = (q: number) => {
            const P = patches.patchSize;
            const px = patches.pixels.subarray(q * P * P, (q + 1) * P * P);
            const m = px.reduce((a, v) => a + v, 0) / px.length;
            return Math.sqrt(px.reduce((a, v) => a + (v - m) ** 2, 0) / px.length);
        };
        const H = VIEWS[0];
        const off = track(FRAMES[0], H, { ...OPTIONS, minPatchZncc: 0 });
        expect(off.stats.rejected).toBe(0);
        const r = track(FRAMES[0], H, { ...OPTIONS, minPatchZncc: 0.9 });
        expectConsistent(r);
        expect(r.stats.rejected).toBeGreaterThan(0);
        const built = buildFramePyramid(FRAMES[0], {
            levels: r.stats.frameLevels,
            scaleStep: PINBALL_STEP,
        });
        if (!built.ok) throw new Error(built.reason);
        for (let q = 0; q < patches.count; q++) {
            const a = alignPatch(built.pyramid, patches, q, PINBALL_STEP, H, OPTIONS.align);
            if (!a.ok || !a.observation.converged) continue;
            const o = a.observation;
            const zncc = 1 / Math.sqrt(1 + (o.residual / (o.gain * spread(q))) ** 2);
            expect(r.outcomes[q]).toBe(zncc < 0.9 ? PatchOutcome.Rejected : PatchOutcome.Observed);
        }
        // Measured: at 0.9, 38 of the 64 rejected and 23 fitted, 3
        // unconverged; with the gate off, none rejected and 61 fitted.
        expect(r.stats).toMatchObject({ observed: 23, unconverged: 3, rejected: 38 });
        expect(off.stats).toMatchObject({ observed: 61, rejected: 0 });
        expect(r.ok).toBe(true);
    });

    it("reports a prediction it cannot make, before touching the frame", () => {
        const r = trackFrame(FRAMES[0], target, new Float64Array(9), VIEWS[0], OPTIONS, null);
        expectConsistent(r);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.loss).toBe("no-prediction");
        expect(r.stats.frameLevels).toBe(0);
        expect(r.stats.attempted).toBe(0);
    });

    it("is pure and deterministic", () => {
        const previous = about(translation(1, -0.5), VIEWS[0]);
        const snapshot = {
            frame: Uint8Array.from(FRAMES[0].data),
            pixels: Uint8Array.from(patches.pixels),
            current: Float64Array.from(VIEWS[0]),
            previous: Float64Array.from(previous),
        };
        const a = trackFrame(FRAMES[0], target, previous, VIEWS[0], OPTIONS, null);
        const b = trackFrame(FRAMES[0], target, previous, VIEWS[0], OPTIONS, null);
        expect(b).toEqual(a);
        expect(FRAMES[0].data).toEqual(snapshot.frame);
        expect(patches.pixels).toEqual(snapshot.pixels);
        expect(VIEWS[0]).toEqual(snapshot.current);
        expect(previous).toEqual(snapshot.previous);
    });

    it("times its stages with an injected clock, and reads none without one", () => {
        expect(track(FRAMES[0], VIEWS[0]).timings).toBeNull();
        const r = trackFrame(FRAMES[0], target, null, VIEWS[0], OPTIONS, () => performance.now());
        const t = r.timings;
        expect(t).not.toBeNull();
        if (t === null) return;
        for (const v of [t.trackMs, t.pyramidMs, t.alignMs, t.fitMs]) {
            expect(Number.isFinite(v) && v >= 0).toBe(true);
        }
        expect(t.pyramidMs + t.alignMs + t.fitMs).toBeLessThanOrEqual(t.trackMs);
    });
});
