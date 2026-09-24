/*
 *  predict_homography.test.ts
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
import { predictHomography } from "../../src/index.js";

describe("predictHomography", () => {
    it("predicts current itself when there is no velocity yet (previous = null)", () => {
        // The first frame after a lock has one pose and no motion: zero velocity.
        // current[8] = 2, so the rescale to H[8] = 1 is an exact halving and the
        // comparison can be bit for bit.
        const current: Mat3 = Float64Array.from([2, 0.25, 40, -0.5, 1.5, 60, 0.001, 0.002, 2]);
        const before = Array.from(current);
        const r = predictHomography(null, current);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Array.from(r.H)).toEqual(before.map((v) => v / 2));
        expect(r.H[8]).toBe(1);
        expect(r.H).not.toBe(current);
        expect(Array.from(current)).toEqual(before);
    });
});
