/*
 *  level_scale.test.ts
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

import { describe, it, expect, beforeAll } from "vitest";
import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";
import { buildTargetFromImage, levelScale } from "../../src/index.js";
import type { TargetDb } from "../../src/index.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";

// levelScale is the one piece of arithmetic every tracking branch shares: the
// patch centre, the frame pyramid and the target pyramid all need s_l. It
// pins the rule the target builder already records as levelSizes, so the
// branches cannot each compute it a different way.
let target: TargetDb;

beforeAll(async () => {
    const cv = await createJsfeatNextBackend();
    target = buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 });
});

describe("levelScale", () => {
    it("is 1 at level 0 and halves per level for a step of 2", () => {
        expect(levelScale(2, 0)).toBe(1);
        expect(levelScale(2, 3)).toBe(0.125);
    });

    it("reproduces the level sizes the target builder records, bit for bit", () => {
        const { scaleStep, levelSizes } = target.pyramid;
        expect(levelSizes.length).toBeGreaterThan(1);
        levelSizes.forEach(([w, h], l) => {
            expect((target.meta.widthPx * levelScale(scaleStep, l)) | 0).toBe(w);
            expect((target.meta.heightPx * levelScale(scaleStep, l)) | 0).toBe(h);
        });
    });

    it("divides iteratively rather than calling Math.pow, down to the last bit", () => {
        // At these levels the two forms disagree in the last bit, and the
        // size check above cannot see it: both truncate to the same size.
        const step = Math.cbrt(2);
        expect(levelScale(step, 3)).toBe(0.4999999999999999);
        expect(levelScale(step, 6)).toBe(0.24999999999999994);
        expect(levelScale(step, 3)).not.toBe(Math.pow(step, -3));
    });

    it("stops at level 255, the deepest a u8 level index can name", () => {
        expect(levelScale(2, 255)).toBeGreaterThan(0);
        expect(() => levelScale(2, 256)).toThrow(RangeError);
    });

    it("rejects a step that underflows the scale to 0, instead of letting x_l / s_l overflow", () => {
        expect(() => levelScale(1e300, 2)).toThrow(RangeError);
    });

    it("rejects a step or level outside its domain instead of returning NaN", () => {
        expect(() => levelScale(1, 1)).toThrow(RangeError);
        expect(() => levelScale(Number.NaN, 1)).toThrow(RangeError);
        expect(() => levelScale(2, -1)).toThrow(RangeError);
        expect(() => levelScale(2, 1.5)).toThrow(RangeError);
    });
});
