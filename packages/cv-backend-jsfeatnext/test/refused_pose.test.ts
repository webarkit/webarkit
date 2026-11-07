/*
 *  refused_pose.test.ts
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

// #224: a refused pose is a function of its arguments. The contract says
// poseFromHomography is pure: "The same inputs produce the same outputs on every
// call, whatever ran in between". jsfeatNext's `estimate` sets `good = false` and
// leaves R and t as they were when it refuses an (H, K), and the adapter keeps
// one pose_t between calls, so before #224 a refused pair returned zeros on a
// fresh backend and the previous good call's R and t after one.

import { describe, it, expect } from "vitest";
import type { Mat3, Pose } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "../src/index";

const W = 640;
const H = 480;
const HM = Float64Array.from([1, 0.02, 10, -0.01, 1, 5, 1e-5, 2e-5, 1]);

function hWith(index: number, value: number): Mat3 {
    const Hm = Float64Array.from(HM);
    Hm[index] = value;
    return Hm;
}

function kWith(index: 0 | 2 | 5, value: number): Mat3 {
    const K = intrinsics(W, H);
    K[index] = value;
    return K;
}

const ZERO_H = Float64Array.from([0, 0, 0, 0, 0, 0, 0, 0, 1]);

// [name, H, K]. All but the last are refused by the library's `estimate`; the
// last by the adapter's own guard on K (#94), which already returned zeros.
const REFUSED: [string, Mat3, Mat3][] = [
    ["the all-zero H with H[8] = 1", ZERO_H, intrinsics(W, H)],
    ["an H with a NaN", hWith(4, NaN), intrinsics(W, H)],
    ["an H with an Infinity", hWith(2, Infinity), intrinsics(W, H)],
    ["a K with cx = NaN", HM, kWith(2, NaN)],
    ["a K with cy = Infinity", HM, kWith(5, Infinity)],
    ["a K the guard refuses (fx = 0)", HM, kWith(0, 0)],
];

function expectZeroRefusal(pose: Pose): void {
    expect(pose.good).toBe(false);
    expect(Array.from(pose.R)).toEqual(new Array(9).fill(0));
    expect(Array.from(pose.t)).toEqual([0, 0, 0]);
}

describe("poseFromHomography: a refused pose depends only on its arguments (#224)", () => {
    for (const [name, Hr, Kr] of REFUSED) {
        it(`${name}: the same result fresh and after a good call`, async () => {
            const fresh = (await createJsfeatNextBackend()).poseFromHomography(Hr, Kr);

            const cv = await createJsfeatNextBackend();
            expect(cv.poseFromHomography(HM, intrinsics(W, H)).good).toBe(true);
            const after = cv.poseFromHomography(Hr, Kr);

            expect(after.R).toEqual(fresh.R);
            expect(after.t).toEqual(fresh.t);
            expect(after.good).toEqual(fresh.good);
        });

        it(`${name}: good false with zero R and t, fresh and after a good call`, async () => {
            expectZeroRefusal((await createJsfeatNextBackend()).poseFromHomography(Hr, Kr));

            const cv = await createJsfeatNextBackend();
            expect(cv.poseFromHomography(HM, intrinsics(W, H)).good).toBe(true);
            expectZeroRefusal(cv.poseFromHomography(Hr, Kr));
        });
    }
});
