/*
 *  pose_guard.test.ts
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

// The guard's rule on constructed homographies (#133; G4 of
// docs/benchmarks/2026-11-06-228-133-stage3-registration.md): just below, at
// and just above a threshold, at 10 and at another value, and a closed form
// with `good: false`. A tilt read at exactly the threshold is the one case
// that tells `<` from `<=`, and no corpus frame is known to read it, so the
// threshold here is set to the tilt the module itself reads off a constructed
// homography, the same double.

import { describe, expect, it } from "vitest";
import type { Mat3, Pose } from "@webarkit/cv-backend-spec";
import { closedFormPose } from "../../src/pose/closed_form.js";
import { guardPose, tiltDegOf } from "../../src/pose/pose_guard.js";

const K: Mat3 = Float64Array.from([175.8, 0, 101.5, 0, 175.8, 180, 0, 0, 1]);

const radians = (deg: number) => (deg * Math.PI) / 180;
const rotX = (deg: number): Mat3 => {
    const a = radians(deg);
    return Float64Array.from([1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]);
};
const rotZ = (deg: number): Mat3 => {
    const a = radians(deg);
    return Float64Array.from([Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]);
};
const mul = (A: Mat3, B: Mat3): Mat3 => {
    const o = new Float64Array(9);
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            for (let k = 0; k < 3; k++) o[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
    return o;
};
/** `K · [r1 r2 t]` for a plane tilted by `deg` about the x axis, rolled by `rollDeg`. */
const homographyAt = (deg: number, rollDeg = 0): Mat3 => {
    const R = mul(rotZ(rollDeg), rotX(deg));
    const M = Float64Array.from([R[0], R[1], -200, R[3], R[4], -250, R[6], R[7], 1400]);
    return mul(K, M);
};
/** A pose no closed form gives: where it comes back, the selection was kept. */
const selection = (): Pose => ({
    R: Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    t: Float64Array.from([1, 2, 3]),
    good: true,
});
const sameBits = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(Object.is(a[i], b[i])).toBe(true);
};

describe("tiltDegOf", () => {
    it("is the angle between the plane's normal and the optical axis, whatever the roll", () => {
        for (const deg of [0, 2.9, 7, 10, 45, 89, 135, 180]) {
            expect(Math.abs(tiltDegOf(rotX(deg)) - deg)).toBeLessThan(1e-9);
            expect(Math.abs(tiltDegOf(mul(rotZ(70), rotX(deg))) - deg)).toBeLessThan(1e-9);
        }
    });

    it("clamps R[8], so that rounding past 1 or -1 reads 0° or 180° and not NaN", () => {
        const R = rotX(0);
        R[8] = 1 + 1e-15;
        expect(tiltDegOf(R)).toBe(0);
        R[8] = -1 - 1e-15;
        expect(tiltDegOf(R)).toBe(180);
    });
});

describe("guardPose: the rule", () => {
    for (const T of [10, 25]) {
        it(`at T = ${T}: the closed form just below, the selection just above`, () => {
            const below = homographyAt(T - 1e-9, 30);
            const s = selection();
            const b = guardPose(below, K, s, T);
            expect(b.reading.guarded).toBe(true);
            expect(b.pose).not.toBe(s);
            const cf = closedFormPose(below, K);
            sameBits(b.pose.R, cf.R);
            sameBits(b.pose.t, cf.t);
            expect(b.pose.good).toBe(true);
            expect(Object.is(b.reading.tiltDeg, tiltDegOf(cf.R))).toBe(true);

            const above = guardPose(homographyAt(T + 1e-9, 30), K, s, T);
            expect(above.reading.guarded).toBe(false);
            expect(above.pose).toBe(s);
        });

        it(`at a tilt read at exactly the threshold, near ${T}: the selection, and the closed form 1e-9 above it`, () => {
            const H = homographyAt(T, 30);
            const s = selection();
            const exact = tiltDegOf(closedFormPose(H, K).R);
            expect(Math.abs(exact - T)).toBeLessThan(1e-9);

            const at = guardPose(H, K, s, exact);
            expect(at.reading.tiltDeg).toBe(exact);
            expect(at.reading.guarded).toBe(false);
            expect(at.pose).toBe(s);

            const justAbove = guardPose(H, K, s, exact + 1e-9);
            expect(justAbove.reading.tiltDeg).toBe(exact);
            expect(justAbove.reading.guarded).toBe(true);
            sameBits(justAbove.pose.R, closedFormPose(H, K).R);

            const justBelow = guardPose(H, K, s, exact - 1e-9);
            expect(justBelow.reading.guarded).toBe(false);
            expect(justBelow.pose).toBe(s);
        });
    }

    it("guards no frame at a threshold of 0, not even a tilt of 0", () => {
        const s = selection();
        const r = guardPose(homographyAt(0), K, s, 0);
        expect(r.reading.tiltDeg).toBe(0);
        expect(r.reading.guarded).toBe(false);
        expect(r.pose).toBe(s);
    });

    it("guards every tilt below 180 at a threshold of 180", () => {
        const r = guardPose(homographyAt(60), K, selection(), 180);
        expect(r.reading.guarded).toBe(true);
    });

    it("reads a threshold, and no constant: one tilt, the other way round at 40 and at 5", () => {
        const H = homographyAt(20);
        expect(guardPose(H, K, selection(), 40).reading.guarded).toBe(true);
        expect(guardPose(H, K, selection(), 5).reading.guarded).toBe(false);
    });

    it("reads the tilt from the closed form on H, not from the selection it is given", () => {
        // The selection is fronto-parallel; H is tilted by 20°.
        const r = guardPose(homographyAt(20), K, selection(), 10);
        expect(Math.abs(r.reading.tiltDeg! - 20)).toBeLessThan(1e-9);
        expect(r.reading.guarded).toBe(false);
    });

    it("is a function of its arguments: the same H reads the same after any other", () => {
        const H = homographyAt(9);
        const first = guardPose(H, K, selection(), 10);
        guardPose(homographyAt(40), K, selection(), 10);
        const second = guardPose(H, K, selection(), 10);
        expect(Object.is(first.reading.tiltDeg, second.reading.tiltDeg)).toBe(true);
        expect(second.reading.guarded).toBe(true);
    });

    it("writes to nothing it is given", () => {
        const H = homographyAt(5);
        const s = selection();
        const Hcopy = Float64Array.from(H);
        const sR = Float64Array.from(s.R);
        const st = Float64Array.from(s.t);
        guardPose(H, K, s, 10);
        sameBits(H, Hcopy);
        sameBits(s.R, sR);
        sameBits(s.t, st);
    });
});

describe("guardPose: a closed form with good: false", () => {
    it("has no tilt, and the frame keeps its selection", () => {
        const degenerate = new Float64Array(9);
        expect(closedFormPose(degenerate, K).good).toBe(false);
        const s = selection();
        for (const T of [0, 10, 180]) {
            const r = guardPose(degenerate, K, s, T);
            expect(r.reading).toEqual({ tiltDeg: null, guarded: false });
            expect(r.pose).toBe(s);
        }
    });
});
