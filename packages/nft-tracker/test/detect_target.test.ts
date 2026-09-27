/*
 *  detect_target.test.ts
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

// The detection pipeline as two exported pure functions (M3):
// `prepareDetection` once per target, `detectTarget` once per frame. They are
// the tracker's own pipeline, so the first test pins that against
// `NftTracker.process` on the same frame under the same seed; the rest pin
// the properties a worker relies on — purity, explicit failure, and a result
// that survives `structuredClone`.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3, Match } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import {
    buildLevelIndex,
    buildTargetFromImage,
    chooseDescriptorSet,
    DEFAULT_MAX_SCENE_KEYPOINTS,
    DEFAULT_RANSAC_THRESHOLD,
    DEFAULT_RATIO,
    DEFAULT_SCENE_LEVELS,
    detectTarget,
    NftTracker,
    prepareDetection,
} from "../src/index.js";
import type { DetectTargetOptions, TargetDb } from "../src/index.js";
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

const blank: GrayImage = { data: new Uint8Array(320 * 240).fill(128), width: 320, height: 240 };

describe("detectTarget", () => {
    it("is the tracker's own detection: same matches, inliers, H and keypoints as NftTracker.process under the same seed", () => {
        const setup = prepareDetection(cv, target, { maxSceneKeypoints: 900 });
        const { value: d } = withSeededRandom(1, () => detectTarget(cv, setup, scene, 12.5));
        const { value: r } = withSeededRandom(1, () =>
            new NftTracker(cv, target, K, { maxSceneKeypoints: 900 }).process(scene, 12.5),
        );
        expect(d.ok).toBe(true);
        expect(r.ok).toBe(true);
        if (!d.ok || !r.ok) return;
        expect(d.timestampMs).toBe(12.5);
        expect(d.numMatches).toBe(r.numMatches);
        expect(d.numInliers).toBe(r.numInliers);
        expect(Array.from(d.H)).toEqual(Array.from(r.H));
        expect(d.sceneKeypoints).toEqual(r.sceneKeypoints);
    });

    it("is pure: the same frame under the same seed gives the same Detection", () => {
        const setup = prepareDetection(cv, target, { maxSceneKeypoints: 900 });
        const a = withSeededRandom(7, () => detectTarget(cv, setup, scene, 0));
        const b = withSeededRandom(7, () => detectTarget(cv, setup, scene, 0));
        expect(b.value).toEqual(a.value);
        expect(b.draws).toBe(a.draws);
        expect(a.draws).toBeGreaterThan(0); // RANSAC drew: the region was not vacuous
    });

    it("fails explicitly on a blank frame: too-few-matches, fewer than 4 matches, 0 inliers", () => {
        const setup = prepareDetection(cv, target);
        const { value: d, draws } = withSeededRandom(1, () => detectTarget(cv, setup, blank, 5));
        expect(d.ok).toBe(false);
        if (d.ok) return;
        expect(d.reason).toBe("too-few-matches");
        expect(d.numMatches).toBeLessThan(4);
        expect(d.numInliers).toBe(0);
        expect(d.timestampMs).toBe(5);
        expect(draws).toBe(0); // no RANSAC without 4 matches
    });

    it("survives structuredClone with every field intact", () => {
        const setup = prepareDetection(cv, target, { maxSceneKeypoints: 900 });
        const { value: d } = withSeededRandom(1, () => detectTarget(cv, setup, scene, 0));
        const copy = structuredClone(d);
        expect(copy).toEqual(d);
        expect(copy.ok).toBe(true);
        if (!copy.ok) return;
        expect(copy.H).toBeInstanceOf(Float64Array);
        expect(copy.H.length).toBe(9);
    });
});

describe("prepareDetection", () => {
    it("takes the documented defaults: sceneLevels 1, maxSceneKeypoints 300, ratio 0.8, ransacThreshold 4", () => {
        const setup = prepareDetection(cv, target);
        expect(setup.sceneLevels).toBe(DEFAULT_SCENE_LEVELS);
        expect(setup.maxSceneKeypoints).toBe(DEFAULT_MAX_SCENE_KEYPOINTS);
        expect(setup.ratio).toBe(DEFAULT_RATIO);
        expect(setup.ransacThreshold).toBe(DEFAULT_RANSAC_THRESHOLD);
        expect([
            DEFAULT_SCENE_LEVELS,
            DEFAULT_MAX_SCENE_KEYPOINTS,
            DEFAULT_RATIO,
            DEFAULT_RANSAC_THRESHOLD,
        ]).toEqual([1, 300, 0.8, 4]);
        const custom = prepareDetection(cv, target, {
            sceneLevels: 2,
            maxSceneKeypoints: 50,
            ratio: 0.7,
            ransacThreshold: 3,
        });
        expect([
            custom.sceneLevels,
            custom.maxSceneKeypoints,
            custom.ratio,
            custom.ransacThreshold,
        ]).toEqual([2, 50, 0.7, 3]);
    });

    it("builds one level view per target level with at least two rows, over the set's own bytes, and the target's geometry", () => {
        const setup = prepareDetection(cv, target);
        const expected = buildLevelIndex(chooseDescriptorSet(cv, target));
        expect(setup.levels.length).toBe(expected.length);
        setup.levels.forEach((level, i) => {
            expect(level.level).toBe(expected[i].level);
            expect(level.descriptors.count).toBe(expected[i].descriptors.count);
        });
        expect(setup.targetWidth).toBe(target.meta.widthPx);
        expect(setup.targetHeight).toBe(target.meta.heightPx);
        expect(setup.keypointX).toBe(target.keypoints.x);
        expect(setup.keypointY).toBe(target.keypoints.y);
    });

    it("materialises the target's keypoints only for a backend with filterMatches", () => {
        expect(prepareDetection(cv, target).targetKeypoints).toBeNull(); // jsfeatNext has none
        // A Proxy, not a spread: the backend is a class instance, and a spread would drop its methods.
        const filtering = new Proxy(cv, {
            get: (t, p) => (p === "filterMatches" ? (m: Match[]) => m : Reflect.get(t, p)),
        });
        const kps = prepareDetection(filtering, target).targetKeypoints;
        expect(kps).not.toBeNull();
        expect(kps!.length).toBe(target.keypoints.count);
        expect(kps![0]).toEqual({
            x: target.keypoints.x[0],
            y: target.keypoints.y[0],
            score: target.keypoints.score[0],
            angle: target.keypoints.angle[0],
            level: target.keypoints.level[0],
        });
    });

    it("throws on a target whose descriptors the backend cannot read", () => {
        const alien: TargetDb = {
            ...target,
            descriptorSets: [{ ...target.descriptorSets[0], kind: "akaze" }],
        };
        expect(() => prepareDetection(cv, alien)).toThrow(/no descriptor set/i);
    });

    // Found in review: with the reference backend, maxSceneKeypoints NaN made
    // detect return no keypoints, so a caller got a failed detection instead
    // of an error naming the option. Validated like the tracking options.
    it.each<[keyof DetectTargetOptions, unknown]>([
        ["sceneLevels", 0],
        ["sceneLevels", 1.5],
        ["sceneLevels", Number.NaN],
        ["maxSceneKeypoints", 0],
        ["maxSceneKeypoints", Number.NaN],
        ["maxSceneKeypoints", 299.5],
        ["ratio", 0],
        ["ratio", 1.01],
        ["ratio", Number.NaN],
        ["ransacThreshold", 0],
        ["ransacThreshold", -4],
        ["ransacThreshold", Infinity],
        ["ransacThreshold", "4"],
    ])("refuses %s = %s with a RangeError naming it", (name, value) => {
        const options = { [name]: value } as DetectTargetOptions;
        expect(() => prepareDetection(cv, target, options)).toThrow(RangeError);
        expect(() => prepareDetection(cv, target, options)).toThrow(new RegExp(name));
    });

    it("accepts the domain's edges: sceneLevels 1, maxSceneKeypoints 1, ratio 1", () => {
        const edge = prepareDetection(cv, target, {
            sceneLevels: 1,
            maxSceneKeypoints: 1,
            ratio: 1,
        });
        expect([edge.sceneLevels, edge.maxSceneKeypoints, edge.ratio]).toEqual([1, 1, 1]);
    });
});
