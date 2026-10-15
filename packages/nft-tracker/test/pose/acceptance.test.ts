/*
 *  acceptance.test.ts
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

// #105's acceptance criteria C1 to C5 and C8, as registered in
// docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md before this file or
// any IPPE code existed (commit 6ea5183). Each test names its criterion. The
// oracle is cv-backend-jsfeatnext's `poseFromHomography`, imported here as a
// devDependency (ADR-0001 point 2) and never from src/. The figures §6 asks
// for are printed, not asserted.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import {
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
} from "../../src/index.js";
import { decode } from "../../src/target/format/index.js";
import { trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions } from "../../src/tracking/track_frame.js";
import { closedFormPose } from "../../src/pose/closed_form.js";
import { ippe } from "../../src/pose/ippe.js";
import { POSE_AMBIGUITY_SIGMA_TRACK_PX, selectPose } from "../../src/pose/select_pose.js";
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
import {
    exactCorrespondences,
    grid,
    median,
    poseDistance,
    poseError,
    s1Views,
} from "./pose_metric.js";

/** §5: the rounding allowance and its parts. */
const TAU_EXACT = 6.9e-5;
const CAMERA = { width: 270, height: 360 };
const SCALE = 0.45;

const image = readPgm(TARGET_FIXTURE);
const G = grid(image.width, image.height);
const K = intrinsics(CAMERA.width, CAMERA.height);
const Z = K[0] / SCALE;

const decoded = decode(
    new Uint8Array(
        readFileSync(
            fileURLToPath(new URL("../../../../examples/targets/pinball.wnft", import.meta.url)),
        ),
    ),
);
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const shipped = trackTarget(decoded.target.patches!, decoded.target.pyramid.scaleStep);

/** The tracker's own defaults, as the frozen sweep maps them. */
const SHIPPED_OPTIONS: TrackFrameOptions = {
    maxFrameLevels: DEFAULT_MAX_FRAME_LEVELS,
    align: {
        maxIterations: DEFAULT_ALIGN_MAX_ITERATIONS,
        epsilon: DEFAULT_ALIGN_EPSILON,
        photometric: DEFAULT_PHOTOMETRIC,
    },
    fit: {
        maxIterations: DEFAULT_FIT_MAX_ITERATIONS,
        tukeyC: DEFAULT_TUKEY_C,
        epsilon: DEFAULT_FIT_EPSILON,
    },
    minTrackedPatches: DEFAULT_MIN_TRACKED_PATCHES,
    maxOutlierShare: DEFAULT_MAX_OUTLIER_SHARE,
    maxFitRms: DEFAULT_MAX_FIT_RMS,
    minPatchZncc: DEFAULT_MIN_PATCH_ZNCC,
};
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10 };

let cv: CvBackend;
beforeAll(async () => {
    cv = await createJsfeatNextBackend();
});

/** The 48 shipped patch centres, the correspondences IPPE reads on an exact view. */
const centres = shipped.centres;

/** The step's correspondences the fit weighed above 0. */
function used(r: {
    weights: Float64Array;
    correspondences: { src: Float64Array; dst: Float64Array };
}) {
    const n = r.weights.filter((w) => w > 0).length;
    const src = new Float64Array(2 * n);
    const dst = new Float64Array(2 * n);
    let k = 0;
    for (let i = 0; i < r.weights.length; i++) {
        if (r.weights[i] <= 0) continue;
        src[2 * k] = r.correspondences.src[2 * i];
        src[2 * k + 1] = r.correspondences.src[2 * i + 1];
        dst[2 * k] = r.correspondences.dst[2 * i];
        dst[2 * k + 1] = r.correspondences.dst[2 * i + 1];
        k++;
    }
    return { src, dst };
}

describe("S1: exact rigid views (84)", () => {
    const views = s1Views(K, image, Z);

    it("has 84 views, 4 of them fronto-parallel", () => {
        expect(views.length).toBe(84);
        expect(views.filter((v) => v.tiltDeg === 0).length).toBe(4);
    });

    it("C1: the truth is among IPPE's two candidates, and the oracle is exact, on every view", () => {
        for (const v of views) {
            const dst = exactCorrespondences(v.H, centres);
            const r = ippe(v.H, K, centres, dst);
            expect(r.ok).toBe(true);
            if (!r.ok) continue;
            const errors = r.candidates.map((c) => poseError(K, c, v.H, G));
            expect(Math.min(...errors), `view ${JSON.stringify(v)}`).toBeLessThanOrEqual(TAU_EXACT);
            const oracle = cv.poseFromHomography(v.H, K);
            expect(oracle.good).toBe(true);
            expect(poseError(K, oracle, v.H, G)).toBeLessThanOrEqual(TAU_EXACT);
        }
    });

    it("C2: the selected pose is exact on every view, and no view is ambiguous (the registered text expected the 4 fronto-parallel ones to be; see the addendum)", () => {
        // The two candidates coincide only when the plane's normal lies along
        // the ray to the correspondences' centroid. The 48 patch centres'
        // centroid is off the target's centre, so even a fronto-parallel view
        // has a second, distinguishable candidate (RMS 3 to 8 px against 0),
        // and the selection picks the exact one. The registered expectation
        // of 4 ambiguous views was wrong in that direction: the criterion's
        // substance, exactness of the selected pose, held on all 84.
        const ambiguous: number[] = [];
        views.forEach((v, i) => {
            const dst = exactCorrespondences(v.H, centres);
            const s = selectPose(v.H, K, centres, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
            expect(s.pose.good).toBe(true);
            expect(poseError(K, s.pose, v.H, G), `view ${i}`).toBeLessThanOrEqual(TAU_EXACT);
            if (s.ambiguous) ambiguous.push(i);
            else expect(s.chosen).not.toBe("fallback");
        });
        expect(ambiguous).toEqual([]);
    });

    it("C3: the selected pose and the oracle agree within 2·τ_exact on every view", () => {
        for (const v of views) {
            const dst = exactCorrespondences(v.H, centres);
            const s = selectPose(v.H, K, centres, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
            const oracle = cv.poseFromHomography(v.H, K);
            expect(poseDistance(K, s.pose, oracle, G)).toBeLessThanOrEqual(2 * TAU_EXACT);
        }
    });

    it("C8: the tracker-local closed form equals the oracle on every view", () => {
        for (const v of views) {
            const local = closedFormPose(v.H, K);
            const oracle = cv.poseFromHomography(v.H, K);
            expect(local.good).toBe(oracle.good);
            expect(poseDistance(K, local, oracle, G)).toBeLessThanOrEqual(TAU_EXACT);
        }
    });
});

describe("S2: fitted views (252 renders, the well-conditioned subset)", () => {
    const views = s1Views(K, image, Z);
    interface Row {
        tilt: number;
        eSel: number;
        eOracle: number;
        dist: number;
        r: number;
        ambiguous: boolean;
        chosen: 0 | 1 | "fallback";
        betterAmong: boolean;
        rejected: number;
    }
    const rows: Row[] = [];
    let steps = 0;
    let refused = 0;

    beforeAll(() => {
        for (const v of views) {
            for (const seed of [1, 2, 3]) {
                const frame = renderWarp(image, v.H, { ...RENDER, seed });
                const r = trackFrame(frame, shipped, null, v.H, SHIPPED_OPTIONS, null);
                steps++;
                if (!r.ok) {
                    refused++;
                    continue;
                }
                const c = used(r);
                const s = selectPose(r.H, K, c.src, c.dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
                const oracle = cv.poseFromHomography(r.H, K);
                const eSel = poseError(K, s.pose, v.H, G);
                const eOracle = poseError(K, oracle, v.H, G);
                const better = s.candidates
                    ? Math.min(...s.candidates.map((cand) => poseError(K, cand, v.H, G)))
                    : eSel;
                rows.push({
                    tilt: v.tiltDeg,
                    eSel,
                    eOracle,
                    dist: poseDistance(K, s.pose, oracle, G),
                    r: r.stats.rmsError!,
                    ambiguous: s.ambiguous,
                    chosen: s.chosen,
                    // The selected candidate is the better of the two: its error is within
                    // τ_exact of the minimum over both. (The first form of this line,
                    // `better <= eSel + TAU_EXACT`, was true whatever was selected:
                    // the minimum is never above one of the values it was taken over.
                    // Caught by an outside reviewer on 2026-10-15; see the acceptance
                    // file's correction of that date, with the run both ways.)
                    betterAmong: eSel <= better + TAU_EXACT,
                    rejected: s.rejected,
                });
                // C8 on the fitted H as well.
                const local = closedFormPose(r.H, K);
                expect(local.good).toBe(oracle.good);
                expect(poseDistance(K, local, oracle, G)).toBeLessThanOrEqual(TAU_EXACT);
            }
        }
    }, 300_000);

    it("ran 252 steps and kept the well-conditioned ones", () => {
        expect(steps).toBe(252);
        expect(rows.length).toBeGreaterThan(0);
        console.log(
            `S2: ${rows.length} well-conditioned of ${steps} (${refused} refused by the tracker's gates)`,
        );
    });

    it("C4 FAILED as registered, on 7 of 252 renders, all fronto-parallel: pinned, so that a move in either direction is seen", () => {
        // The registered criterion: e(selected) ≤ e(oracle) + r on every
        // render. The first run (2026-10-15, the addendum) found 7 renders
        // over it, every one at tilt 0: there IPPE's rotation, read from the
        // Jacobian at one point, is noisier than the closed form's, which
        // reads the perspective row of the whole H. From 10° of tilt on, IPPE
        // is the more accurate (C5). The verdict stands as failed; this test
        // pins what was found so a later change is seen, and is not the
        // criterion.
        const failures = rows.filter((row) => row.eSel > row.eOracle + row.r);
        console.log(
            `C4: ${failures.length} of ${rows.length} renders over the bound:\n${failures
                .map(
                    (f) =>
                        `  tilt ${f.tilt}°: e(selected) ${f.eSel.toFixed(3)}, e(oracle) ${f.eOracle.toFixed(3)}, r ${f.r.toFixed(3)}`,
                )
                .join("\n")}`,
        );
        expect(failures.map((f) => f.tilt)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it("C5: the median error of the selected pose is at most the closed form's", () => {
        const mSel = median(rows.map((r) => r.eSel));
        const mOracle = median(rows.map((r) => r.eOracle));
        console.log(`S2 medians (px): selected ${mSel.toFixed(4)}, oracle ${mOracle.toFixed(4)}`);
        expect(mSel).toBeLessThanOrEqual(mOracle);
    });

    it("the oracle tolerance #105 asks for, d(selected, oracle) ≤ 2·e(oracle) + r: holds exactly where C4 holds", () => {
        // A consequence of C4 by the triangle inequality, so a render over
        // this bound is over C4's: checked as that implication, since C4's
        // verdict is the one that failed.
        const overTolerance = rows.filter((row) => row.dist > 2 * row.eOracle + row.r);
        const overC4 = rows.filter((row) => row.eSel > row.eOracle + row.r);
        console.log(`oracle tolerance: ${overTolerance.length} of ${rows.length} renders over it`);
        for (const row of overTolerance) expect(overC4).toContain(row);
    });

    it("§6's figures, and the selection: on every distinguishable fit the selected candidate is the better of the two", () => {
        const byTilt = new Map<
            number,
            { n: number; ambiguous: number; picked: number; among: number }
        >();
        for (const row of rows) {
            const b = byTilt.get(row.tilt) ?? { n: 0, ambiguous: 0, picked: 0, among: 0 };
            b.n++;
            if (row.ambiguous) b.ambiguous++;
            else if (row.betterAmong) b.picked++;
            if (row.betterAmong) b.among++;
            byTilt.set(row.tilt, b);
        }
        const lines = [...byTilt.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(
                ([tilt, b]) =>
                    `  tilt ${tilt}°: ${b.n} fits, ${b.ambiguous} ambiguous, better candidate selected on ${b.picked} of the ${b.n - b.ambiguous} distinguishable`,
            );
        const rejected = rows.reduce((n, r) => n + r.rejected, 0);
        console.log(`S2 by tilt:\n${lines.join("\n")}\n  depth-rule rejections: ${rejected}`);
        expect(lines.length).toBeGreaterThan(0);
        // Run both ways on 2026-10-15 (the acceptance file's correction of that
        // date): with the selector as it is, 252 of 252 and this passes; with
        // the selector mutated to take the candidate of higher RMS, 0 of 252
        // and this fails on every tilt step, as do C4's pin and C5.
        for (const [tilt, b] of byTilt) {
            expect(b.picked, `tilt ${tilt}°`).toBe(b.n - b.ambiguous);
        }
    });
});

describe("S3: #90's sweep on the shipped target, descriptive", () => {
    const patches = pinballPatches();
    const fixture = trackTarget(patches, PINBALL_STEP);
    const VIEWS: Mat3[] = [
        view({ target: image, frame: CAMERA, scale: SCALE }),
        view({
            target: image,
            frame: CAMERA,
            scale: SCALE,
            angle: (15 * Math.PI) / 180,
            perspective: [0.0004, -0.0003],
        }),
    ];

    /** RMS at the fixture's 64 patch centres: the sweep's own right-fit rule reads it. */
    function centreRms(A: Mat3, B: Mat3): number {
        let s = 0;
        for (let q = 0; q < patches.count; q++) {
            const [ax, ay] = project(A, fixture.centres[2 * q], fixture.centres[2 * q + 1]);
            const [bx, by] = project(B, fixture.centres[2 * q], fixture.centres[2 * q + 1]);
            s += (ax - bx) ** 2 + (ay - by) ** 2;
        }
        return Math.sqrt(s / patches.count);
    }
    function about(E: Mat3, H: Mat3): Mat3 {
        const [cx, cy] = project(H, (image.width - 1) / 2, (image.height - 1) / 2);
        return mat3Mul(mat3Mul(translation(cx, cy), mat3Mul(E, translation(-cx, -cy))), H);
    }
    function shifts(d: number): Mat3[] {
        return Array.from({ length: 16 }, (_, k) => {
            const a = (k * Math.PI) / 8;
            return translation(d * Math.cos(a), d * Math.sin(a));
        });
    }

    it("reports, per view, the medians of e(selected) and e(oracle), the share where IPPE is at least as close, and the ambiguous rate", () => {
        const deg = (a: number) => (a * Math.PI) / 180;
        const errors: Mat3[] = [translation(0, 0)];
        for (const d of [1, 2, 3, 4, 5, 6, 8]) errors.push(...shifts(d));
        for (const a of [1, 2, 3, 4, 5, 6]) errors.push(rotation(deg(a)), rotation(deg(-a)));
        for (const f of [1.02, 1.04, 1.06, 1.08, 1.1, 1.12])
            errors.push(scaling(f), scaling(1 / f));
        expect(errors.length).toBe(137);
        const perView = VIEWS.map(() => ({
            right: 0,
            eSel: [] as number[],
            eOracle: [] as number[],
            closer: 0,
            ambiguous: 0,
        }));
        let steps = 0;
        for (let seed = 1; seed <= 5; seed++) {
            const frames = VIEWS.map((H) => renderWarp(image, H, { ...RENDER, seed }));
            VIEWS.forEach((H, v) => {
                for (const E of errors) {
                    steps++;
                    const r = trackFrame(
                        frames[v],
                        shipped,
                        null,
                        about(E, H),
                        SHIPPED_OPTIONS,
                        null,
                    );
                    if (!r.ok || centreRms(r.H, H) >= 0.5) continue;
                    const c = used(r);
                    const s = selectPose(r.H, K, c.src, c.dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
                    const oracle = cv.poseFromHomography(r.H, K);
                    const eSel = poseError(K, s.pose, H, G);
                    const eOracle = poseError(K, oracle, H, G);
                    const p = perView[v];
                    p.right++;
                    p.eSel.push(eSel);
                    p.eOracle.push(eOracle);
                    if (eSel <= eOracle) p.closer++;
                    if (s.ambiguous) p.ambiguous++;
                }
            });
        }
        expect(steps).toBe(1370);
        const right = perView.reduce((n, p) => n + p.right, 0);
        expect(right).toBe(788);
        const lines = perView.map(
            (p, v) =>
                `  view ${v + 1}: ${p.right} right fits; median e(selected) ${median(p.eSel).toFixed(4)} px, median e(oracle) ${median(p.eOracle).toFixed(4)} px; selected at least as close on ${p.closer}; ambiguous ${p.ambiguous}`,
        );
        console.log(`S3 (#90's sweep, 1,370 steps):\n${lines.join("\n")}`);
    }, 300_000);
});
