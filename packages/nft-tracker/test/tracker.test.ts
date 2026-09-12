/*
 *  tracker.test.ts
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
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import type { TargetDb } from "../src/target/types.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";

let cv: CvBackend;
let target: TargetDb;
let scene: GrayImage;
let K: Mat3;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    target = buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 });
    scene = readPgm(SCENE_FIXTURE);
    K = intrinsics(scene.width, scene.height);
});

describe("NftTracker.process", () => {
    it("locks on to the target in the scene, and reports the pose separately", () => {
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        // Seeded because RANSAC draws from Math.random and nothing else can
        // reach it yet -- see withSeededRandom's own comment. `draws` is
        // ignored here; the parity test is where it is asserted.
        const { value: result } = withSeededRandom(1, () => tracker.process(scene, 0));

        expect(result.ok).toBe(true);
        if (!result.ok) return; // narrows the union for the assertions below
        expect(result.numInliers).toBeGreaterThanOrEqual(10);
        expect(result.numMatches).toBeGreaterThanOrEqual(result.numInliers);
        expect(result.H.length).toBe(9);
        expect(result.H.every(Number.isFinite)).toBe(true);
        expect(result.pose.R.length).toBe(9);
        expect(result.pose.t.length).toBe(3);
    });

    it("echoes the timestamp it was handed, and keeps no clock of its own", () => {
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        expect(withSeededRandom(1, () => tracker.process(scene, 1234.5)).value.timestampMs).toBe(1234.5);
    });

    it("exposes the frame's keypoints so an overlay can draw them", () => {
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        const { value: result } = withSeededRandom(1, () => tracker.process(scene, 0));
        expect(result.sceneKeypoints.length).toBeGreaterThan(100);
        expect(result.sceneKeypoints.length).toBeLessThanOrEqual(900);
    });

    it("reports too-few-matches on a frame with nothing in it", () => {
        const blank: GrayImage = { data: new Uint8Array(320 * 240).fill(128), width: 320, height: 240 };
        const tracker = new NftTracker(cv, target, K);
        const { value: result } = withSeededRandom(1, () => tracker.process(blank, 0));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("too-few-matches");
        expect(result.numMatches).toBeLessThan(4);
        expect(result.H).toBeNull();
        expect(result.pose).toBeNull();
    });

    it("gives the same answer twice for the same frame under the same seed", () => {
        // ADR-0001 point 7: fixtures have to reproduce. Each run gets its OWN
        // freshly seeded generator -- one generator shared across both would
        // hand the second run a different tail and test nothing.
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        const { value: a } = withSeededRandom(7, () => tracker.process(scene, 0));
        const { value: b } = withSeededRandom(7, () => tracker.process(scene, 0));

        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(b.numInliers).toBe(a.numInliers);
        expect(Array.from(b.H)).toEqual(Array.from(a.H));
    });

    it("honours maxSceneKeypoints rather than a hard-coded budget", () => {
        const { value: few } = withSeededRandom(1, () =>
            new NftTracker(cv, target, K, { maxSceneKeypoints: 50 }).process(scene, 0)
        );
        expect(few.sceneKeypoints.length).toBeLessThanOrEqual(50);
    });

    it("refuses a target whose descriptors this backend cannot read", () => {
        const alien: TargetDb = {
            ...target,
            descriptorSets: [{ ...target.descriptorSets[0], kind: "akaze" }],
        };
        expect(() => new NftTracker(cv, alien, K)).toThrow(/no descriptor set/i);
    });
});
