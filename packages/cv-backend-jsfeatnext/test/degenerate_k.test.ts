/*
 *  degenerate_k.test.ts
 *  cv-backend-jsfeatnext
 *
 *  This file is part of cv-backend-jsfeatnext - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  cv-backend-jsfeatnext is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  cv-backend-jsfeatnext is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with cv-backend-jsfeatnext.  If not, see <http://www.gnu.org/licenses/>.
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

// #94: a K that jsfeatNext refuses. Since 1.0.0 its pose_estimator throws on a
// zero or non-finite focal length (constructor and setIntrinsics); the
// contract's Pose says `good` is false when H or K is degenerate. Under 0.17.0
// the same K gave `good: true`, with a NaN pose, or a finite but meaningless one
// for an infinite focal length.

import { describe, it, expect } from "vitest";
import type { Mat3, Pose } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "../src/index";

const W = 320;
const H = 240;
const HM = Float64Array.from([1, 0.02, 10, -0.01, 1, 5, 1e-5, 2e-5, 1]);

/** `intrinsics(W, H)` with one entry replaced. */
function kWith(index: 0 | 4, value: number): Mat3 {
    const K = intrinsics(W, H);
    K[index] = value;
    return K;
}

const DEGENERATE: [string, Mat3][] = [
    ["fx = 0", kWith(0, 0)],
    ["fx = -0", kWith(0, -0)],
    ["fy = 0", kWith(4, 0)],
    ["fx = NaN", kWith(0, NaN)],
    ["fy = NaN", kWith(4, NaN)],
    ["fx = Infinity", kWith(0, Infinity)],
    ["fy = -Infinity", kWith(4, -Infinity)],
];

function expectRefused(pose: Pose): void {
    expect(pose.good).toBe(false);
    expect(Array.from(pose.R)).toEqual(new Array(9).fill(0));
    expect(Array.from(pose.t)).toEqual([0, 0, 0]);
}

describe("poseFromHomography on a K jsfeatNext refuses (#94)", () => {
    for (const [name, K] of DEGENERATE) {
        it(`${name}: good false and no throw, on a fresh backend`, async () => {
            const cv = await createJsfeatNextBackend();
            expectRefused(cv.poseFromHomography(HM, K));
        });

        it(`${name}: good false and no throw, after a valid K`, async () => {
            const cv = await createJsfeatNextBackend();
            expect(cv.poseFromHomography(HM, intrinsics(W, H)).good).toBe(true);
            expectRefused(cv.poseFromHomography(HM, K));
        });
    }

    it("passes a K the library accepts on to it, a negative focal length included", async () => {
        // The guard is the library's predicate, not a stricter one: fx < 0 is
        // accepted by jsfeatNext, so it must reach the estimator and come back good.
        const cv = await createJsfeatNextBackend();
        const pose = cv.poseFromHomography(HM, kWith(0, -intrinsics(W, H)[0]));
        expect(pose.good).toBe(true);
        expect([...pose.R, ...pose.t].every(Number.isFinite)).toBe(true);
    });

    it("leaves the estimator and lastK untouched", async () => {
        // Read through the private fields: a later pose depends only on (H, K),
        // so it cannot show on its own that the refusal changed no state.
        type Internals = { poseEstimator: object | null; lastK: Float64Array | null };
        const cv = await createJsfeatNextBackend();
        const internals = cv as unknown as Internals;
        cv.poseFromHomography(HM, DEGENERATE[0][1]);
        expect(internals.poseEstimator).toBeNull();
        expect(internals.lastK).toBeNull();

        const K1 = intrinsics(W, H);
        cv.poseFromHomography(HM, K1);
        const estimator = internals.poseEstimator;
        for (const [, K] of DEGENERATE) cv.poseFromHomography(HM, K);
        expect(internals.poseEstimator).toBe(estimator);
        expect(Array.from(internals.lastK ?? [])).toEqual(Array.from(K1));
    });

    it("a valid K afterwards gives a fresh backend's pose", async () => {
        const K1 = intrinsics(W, H);
        const K2 = intrinsics(W, H, 45);
        const fresh1 = (await createJsfeatNextBackend()).poseFromHomography(HM, K1);
        const fresh2 = (await createJsfeatNextBackend()).poseFromHomography(HM, K2);

        // A degenerate K first: no estimator may be left behind.
        const a = await createJsfeatNextBackend();
        a.poseFromHomography(HM, DEGENERATE[0][1]);
        expect(a.poseFromHomography(HM, K1)).toEqual(fresh1);

        // After a valid K: the same K again, and then another.
        const b = await createJsfeatNextBackend();
        b.poseFromHomography(HM, K1);
        for (const [, K] of DEGENERATE) b.poseFromHomography(HM, K);
        expect(b.poseFromHomography(HM, K1)).toEqual(fresh1);
        for (const [, K] of DEGENERATE) b.poseFromHomography(HM, K);
        expect(b.poseFromHomography(HM, K2)).toEqual(fresh2);
    });
});

// A principal point that is not finite is not the adapter's to refuse: the
// library's constructor accepts that K, and since 1.1.0 its `estimate` answers
// it with `good: false`. Under 0.17.0 the same K gave `good: true` with a NaN
// pose. Only `good` is asserted here: R and t on that path, zero since #224,
// are asserted in refused_pose.test.ts.
describe("poseFromHomography on a K whose principal point is not finite (#94)", () => {
    const PRINCIPAL_POINT: [string, 2 | 5, number][] = [
        ["cx = NaN", 2, NaN],
        ["cx = Infinity", 2, Infinity],
        ["cy = NaN", 5, NaN],
        ["cy = Infinity", 5, Infinity],
    ];

    for (const [name, index, value] of PRINCIPAL_POINT) {
        it(`${name}: good false and no throw`, async () => {
            const cv = await createJsfeatNextBackend();
            const K = intrinsics(W, H);
            K[index] = value;
            expect(cv.poseFromHomography(HM, K).good).toBe(false);
        });
    }
});
