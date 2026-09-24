/*
 *  robust_homography.test.ts
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
import type { Mat3 } from "@webarkit/cv-backend-spec";
import { robustHomography } from "../../src/index.js";

// Stub test: this function is not implemented yet, and must say so with an
// explicit failure rather than a wrong answer. The branch that implements it
// replaces this file with the real tests.

describe("robustHomography (stub)", () => {
    it("fails explicitly and leaves its inputs untouched", () => {
        const points = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]);
        const initial: Mat3 = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        const before = [Array.from(points), Array.from(initial)];
        const r = robustHomography(points, points, initial, {
            maxIterations: 10,
            tukeyC: 4,
            epsilon: 0.01,
        });
        expect(r).toEqual({ ok: false, reason: "not-implemented" });
        expect([Array.from(points), Array.from(initial)]).toEqual(before);
    });
});
