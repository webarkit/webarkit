/*
 *  pgm.test.ts
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
 */

import { describe, it, expect } from "vitest";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./pgm.js";

describe("the committed fixtures are the demo's own images at the demo's own size", () => {
    it("reads the target at 512x640", () => {
        const target = readPgm(TARGET_FIXTURE);
        // pinball.jpg is 614x768; the static demo caps the longer side at 640.
        expect([target.width, target.height]).toEqual([512, 640]);
        expect(target.data.length).toBe(512 * 640);
    });

    it("reads the scene at 640x480", () => {
        const scene = readPgm(SCENE_FIXTURE);
        // pinball-demo.jpg is 2000x1500, same 640 cap.
        expect([scene.width, scene.height]).toEqual([640, 480]);
        expect(scene.data.length).toBe(640 * 480);
    });

    it("holds real image content, not a blank or constant buffer", () => {
        const { data } = readPgm(TARGET_FIXTURE);
        let min = 255;
        let max = 0;
        for (const v of data) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        expect(max - min).toBeGreaterThan(100);
    });
});
