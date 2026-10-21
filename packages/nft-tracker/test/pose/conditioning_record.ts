/*
 *  conditioning_record.ts
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

// What the two conditioning tests share: the record's K, built from the
// sentence that defines it rather than from the function that computes it,
// and the comparison of a computed figure with one as the derivation of
// record prints it.

import { expect } from "vitest";
import type { Mat3 } from "@webarkit/cv-backend-spec";

/**
 * `K` on the sweep's frames, as 2026-10-15-m4-step3-ippe-acceptance.md §3
 * states it: "a 60° horizontal field of view, so f = 135 / tan 30° = 233.83
 * px, principal point at the frame's centre" of 270 × 360. Zero skew.
 * `conditioning.test.ts` checks it against `intrinsics(270, 360)`.
 */
export const RECORD_K: Mat3 = (() => {
    const f = 135 / Math.tan(Math.PI / 6);
    return Float64Array.from([f, 0, 135, 0, f, 180, 0, 0, 1]);
})();

/**
 * Asserts that `value` agrees with a figure as #160's tables print it, to the
 * digits printed: `|value − figure| ≤ half a unit of the figure's last
 * decimal`. The figure is passed as the table's own text, sign included
 * (the tables use U+2212 for minus), so that what the test compares against
 * can be checked against the record by eye.
 */
export function expectTableDigits(value: number, figure: string): void {
    const text = figure.replace("−", "-").replace("+", "");
    const expected = Number(text);
    if (!Number.isFinite(expected)) throw new Error(`not a figure: ${figure}`);
    const dot = text.indexOf(".");
    const decimals = dot < 0 ? 0 : text.length - dot - 1;
    const tolerance = 0.5 * 10 ** -decimals;
    const difference = Math.abs(value - expected);
    expect(
        difference <= tolerance,
        `${value} is not ${figure} to its digits: off by ${difference}, allowed ${tolerance}`,
    ).toBe(true);
}
