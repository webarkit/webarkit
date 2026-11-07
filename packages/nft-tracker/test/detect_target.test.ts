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
    targetGrid,
    targetSide,
} from "../src/index.js";
import type { DetectTargetOptions, TargetDb } from "../src/index.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "../ground-truth/fixtures/pgm.js";
import { withSeededRng } from "../ground-truth/fixtures/seeded_rng.js";

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
        const { value: d } = withSeededRng(cv, 1, (rng) =>
            detectTarget(cv, setup, scene, 12.5, rng),
        );
        const { value: r } = withSeededRng(cv, 1, (rng) =>
            new NftTracker(cv, target, K, { maxSceneKeypoints: 900, rngFor: () => rng }).process(
                scene,
                12.5,
            ),
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
        const a = withSeededRng(cv, 7, (rng) => detectTarget(cv, setup, scene, 0, rng));
        const b = withSeededRng(cv, 7, (rng) => detectTarget(cv, setup, scene, 0, rng));
        expect(b.value).toEqual(a.value);
        expect(b.draws).toBe(a.draws);
        expect(a.draws).toBeGreaterThan(0); // RANSAC drew: the region was not vacuous
    });

    it("fails explicitly on a blank frame: too-few-matches, fewer than 4 matches, 0 inliers", () => {
        const setup = prepareDetection(cv, target);
        const { value: d, draws } = withSeededRng(cv, 1, (rng) =>
            detectTarget(cv, setup, blank, 5, rng),
        );
        expect(d.ok).toBe(false);
        if (d.ok) return;
        expect(d.reason).toBe("too-few-matches");
        expect(d.numMatches).toBeLessThan(4);
        expect(d.numInliers).toBe(0);
        expect(d.timestampMs).toBe(5);
        expect(draws).toBe(0); // no RANSAC without 4 matches
    });

    // #137: a fit on four correspondences reproduces them exactly, so its
    // residual on its own points is zero by construction and RANSAC's
    // threshold cannot refuse it. The backend's `estimateHomography` is
    // stubbed to accept a fit with `k` inliers, the first `k` correspondences,
    // and `H` (the identity unless given: #202's cases construct their own).
    const acceptingWith = (
        k: number,
        H: ArrayLike<number> = [1, 0, 0, 0, 1, 0, 0, 0, 1],
    ): CvBackend =>
        new Proxy(cv, {
            get: (t, p) =>
                p === "estimateHomography"
                    ? (src: Float64Array) => {
                          const inliers = new Uint8Array(src.length >> 1);
                          inliers.fill(1, 0, k);
                          return {
                              H: Float64Array.from(H),
                              inliers,
                              numInliers: k,
                              ok: true,
                          };
                      }
                    : Reflect.get(t, p),
        });

    it("refuses a minimal fit the backend accepted: too-few-inliers, with the fit's 4 inliers", () => {
        const stub = acceptingWith(4);
        const setup = prepareDetection(stub, target, { maxSceneKeypoints: 900 });
        const d = detectTarget(stub, setup, scene, 3);
        expect(d.ok).toBe(false);
        if (d.ok) return;
        expect(d.reason).toBe("too-few-inliers");
        expect(d.numInliers).toBe(4);
        expect(d.numMatches).toBeGreaterThan(4);
        expect(d.timestampMs).toBe(3);
    });

    it("accepts a fit the backend accepted with 5 inliers, and carries those 5", () => {
        const stub = acceptingWith(5);
        const setup = prepareDetection(stub, target, { maxSceneKeypoints: 900 });
        const d = detectTarget(stub, setup, scene, 3);
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.numInliers).toBe(5);
        expect(d.correspondences.src.length).toBe(10);
        expect(d.correspondences.dst.length).toBe(10);
    });

    // #202: the facing rule (C3 of docs/benchmarks/2026-11-01-202-stage3-registration.md).
    // Each fit is built for the target's own level-0 grid, classified by the exported
    // classifier first, and only then handed to detectTarget with 7 inliers, past G5.
    describe("refuses a fit whose H does not show the target facing the camera (#202)", () => {
        const KC = [300, 0, 135, 0, 300, 180, 0, 0, 1];
        // H = K·[r1 r2 t] for a pose, as the probe's self-test builds its cases (its lines 232 to 239).
        const fromPose = (R: number[], t: number[]): number[] => {
            const M = [R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]];
            const H = new Array<number>(9).fill(0);
            for (let r = 0; r < 3; r++)
                for (let c = 0; c < 3; c++)
                    for (let k = 0; k < 3; k++) H[r * 3 + c] += KC[r * 3 + k] * M[k * 3 + c];
            return H;
        };
        const rotX = (a: number) => [
            1,
            0,
            0,
            0,
            Math.cos(a),
            -Math.sin(a),
            0,
            Math.sin(a),
            Math.cos(a),
        ];
        const size = () => target.pyramid.levelSizes[0];
        const grid = () => targetGrid(...size());
        const facing = () =>
            fromPose(rotX(0.2), [-(size()[0] - 1) / 2, -(size()[1] - 1) / 2, 2000]);
        // The camera on the plane's back, every grid point in front (the probe's lines 245 to 248).
        const reversed = () =>
            fromPose(rotX(Math.PI - 0.2), [-(size()[0] - 1) / 2, (size()[1] - 1) / 2, 2000]);
        // A steep pose whose plane crosses z = 0 inside the grid (the probe's lines 249 to 250).
        const mixed = () => fromPose(rotX(-1.2), [0, 0, 0.5 * (size()[1] - 1)]);
        // w = x + y: exactly 0 at the grid point (0, 0) and positive at the other 24; det H = −1.
        const zeroW = () => [1, 0, 1, 0, 1, 0, 1, 1, 0];
        // w = 1 everywhere, one-signed; the second row is 0, so det H = 0.
        const singular = () => [1, 0, 0, 0, 0, 0, 0, 0, 1];

        const decide = (H: number[]) => {
            const stub = acceptingWith(7, H);
            const setup = prepareDetection(stub, target, { maxSceneKeypoints: 900 });
            return detectTarget(stub, setup, scene, 3);
        };

        it("accepts a facing fit, and its negation −H, the same homography", () => {
            for (const H of [facing(), facing().map((v) => -v)]) {
                expect(targetSide(H, grid())).toBe("facing");
                const d = decide(H);
                expect(d.ok).toBe(true);
                if (!d.ok) return;
                expect(Array.from(d.H)).toEqual(H);
                expect(d.numInliers).toBe(7);
            }
        });

        it.each([
            ["reversed", reversed, "reversed"],
            ["mixed-w", mixed, "mixed-w"],
            ["one grid w exactly 0", zeroW, "mixed-w"],
            ["det H = 0 with one-signed w", singular, "singular"],
        ] as const)("refuses %s as not-facing, with the fit's 7 inliers", (_, build, side) => {
            const H = build();
            expect(targetSide(H, grid())).toBe(side);
            const d = decide(H);
            expect(d.ok).toBe(false);
            if (d.ok) return;
            expect(d.reason).toBe("not-facing");
            expect(d.numInliers).toBe(7);
            expect(d.numMatches).toBeGreaterThan(7);
            expect(d.timestampMs).toBe(3);
        });

        it("leaves a 4-inlier fit to G5, whatever its side: too-few-inliers", () => {
            const stub = acceptingWith(4, reversed());
            const d = detectTarget(stub, prepareDetection(stub, target), scene, 3);
            expect(d.ok).toBe(false);
            if (!d.ok) expect(d.reason).toBe("too-few-inliers");
        });
    });

    it("survives structuredClone with every field intact", () => {
        const setup = prepareDetection(cv, target, { maxSceneKeypoints: 900 });
        const { value: d } = withSeededRng(cv, 1, (rng) => detectTarget(cv, setup, scene, 0, rng));
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
