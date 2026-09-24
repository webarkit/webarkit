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
import type { Mat3, PointArray } from "@webarkit/cv-backend-spec";
import { robustHomography } from "../../src/index.js";
import type { RobustHomographyOptions } from "../../src/index.js";
import {
    chain,
    perspective,
    projectAll,
    rotationAbout,
    scaling,
    translation,
} from "./homography_helpers.js";

// Options used unless a test says otherwise. tukeyC is the detection state's
// RANSAC threshold (DEFAULT_RANSAC_THRESHOLD, 4 px); nothing here is tuned.
const OPTIONS: RobustHomographyOptions = { maxIterations: 20, tukeyC: 4, epsilon: 1e-6 };

/** Patch centres on an 8×5 grid over a 640×480 target, interleaved. */
function targetGrid(): PointArray {
    const pts: number[] = [];
    for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 8; i++) pts.push(20 + i * 85, 20 + j * 110);
    }
    return Float64Array.from(pts);
}

// A view of the target with some perspective: w stays in [0.9, 1.1].
const H_TRUE: Mat3 = chain(
    translation(70, 35),
    rotationAbout(0.1, 320, 240),
    scaling(0.85),
    perspective(1.5e-4, -2e-4),
);

describe("robustHomography input validation", () => {
    const src = targetGrid();
    const dst = projectAll(H_TRUE, src);

    it("rejects options outside their domain as invalid-options", () => {
        const bad: Partial<RobustHomographyOptions>[] = [
            { maxIterations: 0 },
            { maxIterations: -1 },
            { maxIterations: 1.5 },
            { maxIterations: Number.NaN },
            { maxIterations: Infinity },
            { tukeyC: 0 },
            { tukeyC: -4 },
            { tukeyC: Number.NaN },
            { tukeyC: Infinity },
            { epsilon: 0 },
            { epsilon: -1e-6 },
            { epsilon: Number.NaN },
            { epsilon: Infinity },
        ];
        for (const b of bad) {
            expect(
                robustHomography(src, dst, H_TRUE, { ...OPTIONS, ...b }),
                JSON.stringify(b),
            ).toEqual({
                ok: false,
                reason: "invalid-options",
            });
        }
    });

    it("rejects mismatched, odd or non-finite input as invalid-input", () => {
        const invalid = { ok: false, reason: "invalid-input" };
        expect(robustHomography(src, dst.subarray(0, dst.length - 2), H_TRUE, OPTIONS)).toEqual(
            invalid,
        );
        expect(robustHomography(src.subarray(1), dst.subarray(1), H_TRUE, OPTIONS)).toEqual(
            invalid,
        );
        expect(robustHomography(src, dst, H_TRUE.subarray(0, 8), OPTIONS)).toEqual(invalid);
        for (const v of [Number.NaN, Infinity, -Infinity]) {
            const s = src.slice();
            s[7] = v;
            const d = dst.slice();
            d[12] = v;
            const h = H_TRUE.slice();
            h[4] = v;
            expect(robustHomography(s, dst, H_TRUE, OPTIONS), `src ${v}`).toEqual(invalid);
            expect(robustHomography(src, d, H_TRUE, OPTIONS), `dst ${v}`).toEqual(invalid);
            expect(robustHomography(src, dst, h, OPTIONS), `initial ${v}`).toEqual(invalid);
        }
    });

    it("rejects fewer than four correspondences as too-few-points", () => {
        for (let n = 0; n < 4; n++) {
            expect(
                robustHomography(src.subarray(0, 2 * n), dst.subarray(0, 2 * n), H_TRUE, OPTIONS),
                `${n} points`,
            ).toEqual({ ok: false, reason: "too-few-points" });
        }
    });

    it("checks the options first, then the input, then the count", () => {
        const nan = Float64Array.from([0, 0, 1, Number.NaN]);
        expect(robustHomography(nan, nan, H_TRUE, { ...OPTIONS, tukeyC: 0 })).toEqual({
            ok: false,
            reason: "invalid-options",
        });
        expect(robustHomography(nan, nan, H_TRUE, OPTIONS)).toEqual({
            ok: false,
            reason: "invalid-input",
        });
    });

    it("leaves its inputs untouched", () => {
        const before = [Array.from(src), Array.from(dst), Array.from(H_TRUE)];
        robustHomography(src, dst, H_TRUE, OPTIONS);
        robustHomography(src.subarray(0, 6), dst.subarray(0, 6), H_TRUE, OPTIONS);
        expect([Array.from(src), Array.from(dst), Array.from(H_TRUE)]).toEqual(before);
    });
});
