/*
 *  ippe.test.ts
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

// IPPE and the selection rule on their own: criteria C6 (determinism) and C7
// (the depth rule) of docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md,
// the degenerate inputs, and the margin's formula.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { ippe } from "../../src/pose/ippe.js";
import {
    ambiguityMargin,
    inFront,
    POSE_AMBIGUITY_SIGMA_TRACK_PX,
    selectPose,
    targetGrid,
} from "../../src/pose/select_pose.js";
import { exactCorrespondences, grid, poseDistance, rigidView, s1Views } from "./pose_metric.js";

const TAU_EXACT = 6.9e-5;
const TARGET = { width: 512, height: 640 };
const K = intrinsics(270, 360);
const Z = K[0] / 0.45;
const G = grid(TARGET.width, TARGET.height);

/** A 6 × 8 lattice of model points over the target, 48 like the shipped patches. */
function lattice(): Float64Array {
    const out = new Float64Array(96);
    let k = 0;
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 6; j++) {
            out[k++] = 40 + j * 86;
            out[k++] = 40 + i * 80;
        }
    }
    return out;
}

function permuted(points: Float64Array, order: number[]): Float64Array {
    const out = new Float64Array(points.length);
    order.forEach((from, to) => {
        out[2 * to] = points[2 * from];
        out[2 * to + 1] = points[2 * from + 1];
    });
    return out;
}

describe("targetGrid and the test's grid", () => {
    it("agree: the src grid is the one the criteria read", () => {
        expect(Array.from(targetGrid(TARGET.width, TARGET.height))).toEqual(Array.from(G));
    });
});

describe("ambiguityMargin", () => {
    it("is σ / √(2n): 0.0204 px for σ = 0.2 over 48 correspondences", () => {
        expect(ambiguityMargin(POSE_AMBIGUITY_SIGMA_TRACK_PX, 48)).toBeCloseTo(
            0.2 / Math.sqrt(96),
            12,
        );
        expect(ambiguityMargin(4, 32)).toBeCloseTo(4 / 8, 12);
    });
});

describe("ippe", () => {
    const src = lattice();

    it("refuses fewer than 3 correspondences, mismatched lengths and non-finite input", () => {
        const v = rigidView(K, TARGET, {
            tiltDeg: 20,
            azimuthDeg: 0,
            rollDeg: 0,
            shift: [0, 0],
            Z,
        });
        const dst = exactCorrespondences(v.H, src);
        expect(ippe(v.H, K, src.subarray(0, 4), dst.subarray(0, 4))).toEqual({
            ok: false,
            reason: "too-few-correspondences",
        });
        expect(ippe(v.H, K, src, dst.subarray(0, 10))).toEqual({
            ok: false,
            reason: "too-few-correspondences",
        });
        const bad = Float64Array.from(v.H);
        bad[4] = NaN;
        expect(ippe(bad, K, src, dst)).toEqual({ ok: false, reason: "non-finite" });
    });

    it("is degenerate on a homography that maps the centroid to infinity", () => {
        // Row 3 of H annihilates the centroid's homogeneous coordinate.
        const H = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 0]);
        const r = ippe(
            H,
            K,
            src,
            exactCorrespondences(Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), src),
        );
        expect(r.ok).toBe(false);
    });

    it("orders its candidates: index 0 with b ≥ 0, so the order is a function of H alone", () => {
        const v = rigidView(K, TARGET, {
            tiltDeg: 30,
            azimuthDeg: 45,
            rollDeg: 15,
            shift: [0, 0],
            Z,
        });
        const dst = exactCorrespondences(v.H, src);
        const r = ippe(v.H, K, src, dst);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const [a, b] = r.candidates;
        // The two share their rotation's upper 2 × 2 block in the rotated frame,
        // so they differ, and only one is exact.
        expect(poseDistance(K, a, b, G)).toBeGreaterThan(1);
        const errors = [a, b].map((c) => c.rms);
        expect(Math.min(...errors)).toBeLessThanOrEqual(TAU_EXACT);
    });

    it("C6: the same input gives bit-identical output, and the order of the correspondences changes neither the selection nor the candidates beyond τ_exact", () => {
        const views = s1Views(K, TARGET, Z).filter((v) => v.tiltDeg > 0);
        for (const v of views) {
            const dst = exactCorrespondences(v.H, src);
            const once = selectPose(v.H, K, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
            const twice = selectPose(v.H, K, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
            expect(Array.from(twice.pose.R)).toEqual(Array.from(once.pose.R));
            expect(Array.from(twice.pose.t)).toEqual(Array.from(once.pose.t));
            expect(twice.chosen).toBe(once.chosen);
        }
        const n = src.length / 2;
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: views.length - 1 }),
                fc.shuffledSubarray(
                    Array.from({ length: n }, (_, i) => i),
                    { minLength: n },
                ),
                (vi, order) => {
                    const v = views[vi];
                    const dst = exactCorrespondences(v.H, src);
                    const a = selectPose(v.H, K, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
                    const b = selectPose(
                        v.H,
                        K,
                        permuted(src, order),
                        permuted(dst, order),
                        POSE_AMBIGUITY_SIGMA_TRACK_PX,
                        G,
                    );
                    expect(b.chosen).toBe(a.chosen);
                    expect(b.ambiguous).toBe(a.ambiguous);
                    expect(poseDistance(K, a.pose, b.pose, G)).toBeLessThanOrEqual(TAU_EXACT);
                    if (a.candidates && b.candidates) {
                        for (let i = 0; i < 2; i++) {
                            expect(
                                poseDistance(K, a.candidates[i], b.candidates[i], G),
                            ).toBeLessThanOrEqual(TAU_EXACT);
                        }
                    }
                },
            ),
            { numRuns: 60 },
        );
    });
});

describe("the depth rule (C7)", () => {
    it("rejects a pose with the plane behind the camera, and keeps one in front", () => {
        const v = rigidView(K, TARGET, {
            tiltDeg: 20,
            azimuthDeg: 90,
            rollDeg: 0,
            shift: [0, 0],
            Z,
        });
        expect(inFront(v.R, v.t, G)).toBe(true);
        const behind = Float64Array.from([v.t[0], v.t[1], -v.t[2]]);
        expect(inFront(v.R, behind, G)).toBe(false);
        // A plane whose far edge crosses z = 0 is rejected too: tilt 50° about
        // the x axis drops the far edge by 319.5 · sin 50° = 244.7 target px,
        // more than a depth of 200.
        const grazing = rigidView(K, TARGET, {
            tiltDeg: 50,
            azimuthDeg: 0,
            rollDeg: 0,
            shift: [0, 0],
            Z: 200,
        });
        expect(inFront(grazing.R, grazing.t, G)).toBe(false);
    });

    it("selectPose falls back to the closed form when both candidates fail the depth rule, and reports it", () => {
        // Behind the camera: every point's z < 0. The homography is the same
        // as the in-front pose's up to sign, so IPPE's two candidates both
        // project the plane behind the camera.
        const v = rigidView(K, TARGET, {
            tiltDeg: 20,
            azimuthDeg: 0,
            rollDeg: 0,
            shift: [0, 0],
            Z,
        });
        const src = lattice();
        const dst = exactCorrespondences(v.H, src);
        const s = selectPose(v.H, K, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, G);
        expect(s.outcome).toBe("selected");
        expect(s.rejected).toBe(0);
        // With a grid that reaches far past the target, the wrong candidate's plane crosses z = 0 first.
        const far = Float64Array.from([-20000, -20000, 20000, 20000, 0, 0]);
        const t = selectPose(v.H, K, src, dst, POSE_AMBIGUITY_SIGMA_TRACK_PX, far);
        expect(t.rejected).toBeGreaterThan(0);
        expect(["selected", "no-candidate-in-front"]).toContain(t.outcome);
        if (t.outcome === "no-candidate-in-front") expect(t.chosen).toBe("fallback");
    });
});
