/*
 *  build_from_image.test.ts
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
import type { CvBackend, GrayImage } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";
import { buildTargetFromImage, DEFAULT_SCALE_STEP } from "../src/target/build_from_image.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";

let cv: CvBackend;
let image: GrayImage;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    image = readPgm(TARGET_FIXTURE);
});

describe("buildTargetFromImage", () => {
    it("records the image's own size, and no physical size unless told one", () => {
        const target = buildTargetFromImage(cv, image, { levels: 4 });
        expect(target.meta.widthPx).toBe(image.width);
        expect(target.meta.heightPx).toBe(image.height);
        expect(target.meta.physicalSizeMm).toBeNull();
        expect(target.formatVersion).toBe("0.2");
        expect(target.extensionsUsed).toEqual([]);
        expect(target.extensionsRequired).toEqual([]);
    });

    it("sorts keypoints by level even though detect() returns them interleaved", () => {
        // The jsfeatNext adapter fills a maxKeypoints budget round-robin across
        // levels, so its output is NOT level-ordered -- assert that first, or
        // this test could pass against a backend that never interleaved.
        const raw = cv.detect(image, { levels: 4, maxKeypoints: 4 * 260 });
        const rawSorted = raw.every((k, i) => i === 0 || raw[i - 1].level <= k.level);
        expect(rawSorted).toBe(false);

        const { keypoints } = buildTargetFromImage(cv, image, { levels: 4 });
        for (let i = 1; i < keypoints.count; i++) {
            expect(keypoints.level[i]).toBeGreaterThanOrEqual(keypoints.level[i - 1]);
        }
    });

    it("gives levelStart ranges that agree with the per-keypoint level", () => {
        const { keypoints, pyramid } = buildTargetFromImage(cv, image, { levels: 4 });
        const L = pyramid.levelSizes.length;
        expect(keypoints.levelStart.length).toBe(L + 1);
        expect(keypoints.levelStart[0]).toBe(0);
        expect(keypoints.levelStart[L]).toBe(keypoints.count);
        for (let l = 0; l < L; l++) {
            for (let i = keypoints.levelStart[l]; i < keypoints.levelStart[l + 1]; i++) {
                expect(keypoints.level[i]).toBe(l);
            }
        }
    });

    it("emits one descriptor row per keypoint, identity-mapped (no multiview)", () => {
        const target = buildTargetFromImage(cv, image, { levels: 4 });
        expect(target.descriptorSets).toHaveLength(1);
        const set = target.descriptorSets[0];
        expect(set.elementType).toBe("bits");
        expect(set.norm).toBe("hamming");
        expect(set.kind).toBe(cv.capabilities.defaultDescriptor);
        expect(set.producer).toBe(cv.capabilities.name);
        expect(set.count).toBe(target.keypoints.count);
        expect(set.dimensions).toBe(set.bytesPerDescriptor * 8);
        expect(set.data.length).toBe(set.count * set.bytesPerDescriptor);
        expect(Array.from(set.levelStart)).toEqual(Array.from(target.keypoints.levelStart));
        for (let i = 0; i < set.count; i++) expect(set.kpIndex[i]).toBe(i);
    });

    it("stores the descriptors the backend computed for the UNROUNDED keypoints", () => {
        // f32 storage is a storage decision (5.5); it must not reach describe(),
        // whose sampling patch is positioned from the coordinates it is handed.
        const target = buildTargetFromImage(cv, image, { levels: 4 });
        const raw = cv.detect(image, { levels: 4, maxKeypoints: 4 * 260 });
        const order = raw.map((_, i) => i).sort((a, b) => raw[a].level - raw[b].level || a - b);
        const expected = cv.describe(image, order.map((i) => raw[i]));

        expect(Array.from(target.descriptorSets[0].data)).toEqual(Array.from(expected.data));
    });

    it("defaults the scale step to the cube root of 2 and reflects it in levelSizes", () => {
        expect(DEFAULT_SCALE_STEP).toBe(Math.cbrt(2));
        const { pyramid } = buildTargetFromImage(cv, image, { levels: 4 });
        expect(pyramid.scaleStep).toBe(Math.cbrt(2));
        expect(pyramid.levelSizes[0]).toEqual([image.width, image.height]);
        // Level 1 is one step down, truncated the way the backend truncates.
        expect(pyramid.levelSizes[1]).toEqual([
            (image.width / Math.cbrt(2)) | 0,
            (image.height / Math.cbrt(2)) | 0,
        ]);
        for (let l = 1; l < pyramid.levelSizes.length; l++) {
            expect(pyramid.levelSizes[l][0]).toBeLessThanOrEqual(pyramid.levelSizes[l - 1][0]);
            expect(pyramid.levelSizes[l][1]).toBeLessThanOrEqual(pyramid.levelSizes[l - 1][1]);
        }
    });

    it("takes the scale step from the caller when the backend's differs", () => {
        const { pyramid } = buildTargetFromImage(cv, image, { levels: 4, scaleStep: 2 });
        expect(pyramid.scaleStep).toBe(2);
        expect(pyramid.levelSizes[1]).toEqual([(image.width / 2) | 0, (image.height / 2) | 0]);
    });

    it("rejects a scale step that would make the level mapping meaningless", () => {
        expect(() => buildTargetFromImage(cv, image, { scaleStep: 1 })).toThrow(/scaleStep/);
        expect(() => buildTargetFromImage(cv, image, { scaleStep: Number.NaN })).toThrow(/scaleStep/);
    });

    it("refuses an image with nothing to detect rather than returning an empty target", () => {
        const blank: GrayImage = { data: new Uint8Array(64 * 64).fill(128), width: 64, height: 64 };
        expect(() => buildTargetFromImage(cv, blank)).toThrow(/no keypoints/i);
    });

    it("records the name it is given, and no wall-clock timestamp", () => {
        const target = buildTargetFromImage(cv, image, { levels: 4, name: "pinball" });
        expect(target.info?.name).toBe("pinball");
        // A clock read would make two builds of the same image differ, which
        // ADR-0001 point 7's determinism rule does not allow.
        expect(target.info?.createdAt).toBeUndefined();
    });
});
