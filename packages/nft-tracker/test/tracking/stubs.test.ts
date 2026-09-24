/*
 *  stubs.test.ts
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

import { describe, it, expect } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import type { PatchTable } from "../../src/target/types.js";
import {
    alignPatch,
    buildFramePyramid,
    predictHomography,
    robustHomography,
    selectPatches,
} from "../../src/index.js";
import type { FramePyramid, PatchObservation, TrackingState } from "../../src/index.js";

// Every tracking function in this PR is a stub. These tests pin two things:
// each one answers with an explicit failure, and the types can express real
// inputs and outputs. `npm run typecheck` is the other half of the assertion.
const frame: GrayImage = { data: new Uint8Array(16 * 12).fill(128), width: 16, height: 12 };
const pyramid: FramePyramid = { scaleStep: 2, levels: [frame] };
const P = 4;
const patches: PatchTable = {
    patchSize: P,
    count: 1,
    score: Float32Array.from([1]),
    left: Uint16Array.from([2]),
    top: Uint16Array.from([3]),
    level: Uint8Array.from([0]),
    pixels: new Uint8Array(P * P),
};
const identity: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const points = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]);

describe("tracking stubs", () => {
    it("selectPatches fails explicitly", () => {
        const r = selectPatches(pyramid, {
            patchSize: P,
            maxPatches: 4,
            minScore: 0,
            minSpacing: 0,
        });
        expect(r).toEqual({ ok: false, reason: "not-implemented" });
    });

    it("buildFramePyramid fails explicitly", () => {
        expect(buildFramePyramid(frame, { levels: 2, scaleStep: 2 })).toEqual({
            ok: false,
            reason: "not-implemented",
        });
    });

    it("alignPatch fails explicitly", () => {
        const r = alignPatch(pyramid, patches, 0, 2, identity, {
            maxIterations: 10,
            epsilon: 0.01,
            photometric: true,
        });
        expect(r).toEqual({ ok: false, reason: "not-implemented" });
    });

    it("robustHomography fails explicitly", () => {
        const r = robustHomography(points, points, identity, {
            maxIterations: 10,
            tukeyC: 4,
            epsilon: 0.01,
        });
        expect(r).toEqual({ ok: false, reason: "not-implemented" });
    });

    it("predictHomography fails explicitly", () => {
        expect(predictHomography(null, identity)).toEqual({
            ok: false,
            reason: "not-implemented",
        });
    });

    it("stubs leave their inputs untouched", () => {
        const before = Array.from(identity);
        predictHomography(identity, identity);
        robustHomography(points, points, identity, { maxIterations: 1, tukeyC: 1, epsilon: 1 });
        expect(Array.from(identity)).toEqual(before);
    });

    it("the observation and state types describe what a branch will return", () => {
        const obs: PatchObservation = {
            index: 0,
            x: 5.5,
            y: 6.5,
            residual: 0,
            converged: true,
            iterations: 3,
            frameLevel: 0,
            gain: 1,
            bias: 0,
        };
        const states: TrackingState[] = ["LOST", "DETECT", "TRACK"];
        expect(Object.keys(obs)).toHaveLength(9);
        expect(states).toHaveLength(3);
    });
});
