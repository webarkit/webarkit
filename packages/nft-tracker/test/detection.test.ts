/*
 *  detection.test.ts
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
import type { CvBackend, DescriptorKind, Descriptors, Match } from "@webarkit/cv-backend-spec";
import { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "../src/detection.js";
import type { UsableDescriptorSet } from "../src/detection.js";
import type { DescriptorSet, TargetDb } from "../src/target/types.js";

const BPD = 4; // 32-bit descriptors: enough to be distinct, small enough to read

/**
 * A descriptor set with `rowsPerLevel` rows per level, one row per keypoint.
 * Row `i` is filled with the byte `i`, so a view's identity is visible by eye.
 */
function makeSet(rowsPerLevel: readonly number[], overrides: Record<string, unknown> = {}): DescriptorSet {
    const total = rowsPerLevel.reduce((a, b) => a + b, 0);
    const levelStart = new Uint32Array(rowsPerLevel.length + 1);
    for (let l = 0; l < rowsPerLevel.length; l++) levelStart[l + 1] = levelStart[l] + rowsPerLevel[l];
    const data = new Uint8Array(total * BPD);
    for (let i = 0; i < total; i++) data.fill(i, i * BPD, (i + 1) * BPD);
    return {
        kind: "orb",
        norm: "hamming",
        elementType: "bits",
        dimensions: BPD * 8,
        bytesPerDescriptor: BPD,
        producer: "test",
        params: {},
        count: total,
        levelStart,
        kpIndex: Uint32Array.from({ length: total }, (_, i) => i),
        data,
        ...overrides,
    } as DescriptorSet;
}

function makeTarget(sets: readonly DescriptorSet[]): TargetDb {
    return {
        formatVersion: "0.2",
        extensionsUsed: [],
        extensionsRequired: [],
        meta: { widthPx: 64, heightPx: 64, physicalSizeMm: null },
        pyramid: { scaleStep: Math.cbrt(2), levelSizes: [[64, 64]] },
        keypoints: {
            count: 0,
            detector: { kind: "fast", params: {} },
            levelStart: new Uint32Array([0]),
            x: new Float32Array(0),
            y: new Float32Array(0),
            angle: new Float32Array(0),
            score: new Float32Array(0),
            level: new Uint8Array(0),
        },
        descriptorSets: sets,
    };
}

/** A backend that implements only what these tests exercise. */
function stubBackend(
    match: (q: Descriptors, t: Descriptors) => Match[],
    descriptors: readonly DescriptorKind[] = ["orb"]
): CvBackend {
    return {
        capabilities: {
            name: "stub",
            detectors: ["fast"],
            descriptors,
            defaultDescriptor: "orb",
            matchFilters: [],
        },
        detect: () => [],
        describe: () => ({ data: new Uint8Array(0), count: 0, bytesPerDescriptor: BPD, kind: "orb", norm: "hamming" }),
        match,
        estimateHomography: () => ({ H: new Float64Array(9), inliers: new Uint8Array(0), numInliers: 0, ok: false }),
        poseFromHomography: () => ({ R: new Float64Array(9), t: new Float64Array(3), good: false }),
    };
}

const query: Descriptors = { data: new Uint8Array(BPD), count: 1, bytesPerDescriptor: BPD, kind: "orb", norm: "hamming" };

describe("chooseDescriptorSet", () => {
    it("picks the first set the backend can actually consume", () => {
        const unusable = makeSet([3], { kind: "teblid" }); // structurally fine, not implemented here
        const usable = makeSet([3]);
        const cv = stubBackend(() => []);
        expect(chooseDescriptorSet(cv, makeTarget([unusable, usable]))).toBe(usable);
    });

    it("rejects a set whose norm is not hamming", () => {
        const cv = stubBackend(() => []);
        const target = makeTarget([makeSet([3], { norm: "l2" })]);
        expect(() => chooseDescriptorSet(cv, target)).toThrow(/no descriptor set/i);
    });

    it("rejects a non-binary set, which the contract's Descriptors cannot carry", () => {
        const cv = stubBackend(() => []);
        const f32 = makeSet([3], { elementType: "f32", data: new Float32Array(12) });
        expect(() => chooseDescriptorSet(cv, makeTarget([f32]))).toThrow(/no descriptor set/i);
    });
});

describe("buildLevelIndex", () => {
    it("exposes each level as a VIEW over the set's bytes, never a copy", () => {
        const set = makeSet([3, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);

        expect(levels.map((l) => l.level)).toEqual([0, 1]);
        // Same backing store, and offset at the level's first row.
        expect(levels[1].descriptors.data.buffer).toBe(set.data.buffer);
        expect(levels[1].descriptors.data.byteOffset).toBe(3 * BPD);
        expect(levels[1].descriptors.count).toBe(2);
        // A view, proven the only way that cannot be faked: write through the
        // parent and read it back through the child.
        set.data[3 * BPD] = 200;
        expect(levels[1].descriptors.data[0]).toBe(200);
        expect(levels[1].kpIndex.buffer).toBe(set.kpIndex.buffer);
    });

    it("skips a level with fewer than two rows, because the ratio test needs a runner-up", () => {
        const set = makeSet([4, 1, 2]) as UsableDescriptorSet;
        expect(buildLevelIndex(set).map((l) => l.level)).toEqual([0, 2]);
    });

    it("carries kind and norm onto every level view, so match() can still guard the pairing", () => {
        const set = makeSet([2]) as UsableDescriptorSet;
        const [view] = buildLevelIndex(set);
        expect(view.descriptors.kind).toBe("orb");
        expect(view.descriptors.norm).toBe("hamming");
        expect(view.descriptors.bytesPerDescriptor).toBe(BPD);
    });
});

describe("matchPerLevel", () => {
    it("remaps trainIdx from a level row back to the target keypoint", () => {
        // Level 1 starts at row 3; kpIndex is identity, so row 3 is keypoint 3.
        const set = makeSet([3, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        const cv = stubBackend((_q, t) => (t.count === 2 ? [{ queryIdx: 0, trainIdx: 0, distance: 5 }] : []));

        expect(matchPerLevel(cv, query, levels, 0.8)).toEqual([{ queryIdx: 0, trainIdx: 3, distance: 5 }]);
    });

    it("honours kpIndex rather than assuming rows and keypoints line up", () => {
        const set = makeSet([2], { kpIndex: Uint32Array.from([7, 9]) }) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        const cv = stubBackend(() => [{ queryIdx: 0, trainIdx: 1, distance: 5 }]);

        expect(matchPerLevel(cv, query, levels, 0.8)[0].trainIdx).toBe(9);
    });

    it("keeps the lowest-distance hit per query keypoint across levels", () => {
        const set = makeSet([2, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        let call = 0;
        const cv = stubBackend(() =>
            call++ === 0
                ? [{ queryIdx: 0, trainIdx: 0, distance: 30 }]
                : [{ queryIdx: 0, trainIdx: 1, distance: 12 }]
        );

        expect(matchPerLevel(cv, query, levels, 0.8)).toEqual([{ queryIdx: 0, trainIdx: 3, distance: 12 }]);
    });

    it("breaks an exact tie in favour of the level seen first, as the demo does", () => {
        const set = makeSet([2, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        let call = 0;
        const cv = stubBackend(() =>
            call++ === 0
                ? [{ queryIdx: 0, trainIdx: 0, distance: 20 }]
                : [{ queryIdx: 0, trainIdx: 0, distance: 20 }]
        );

        // Level 0's row 0 is keypoint 0; level 1's row 0 is keypoint 2.
        expect(matchPerLevel(cv, query, levels, 0.8)[0].trainIdx).toBe(0);
    });

    it("passes the caller's ratio down to every per-level match call", () => {
        const set = makeSet([2, 2]) as UsableDescriptorSet;
        const seen: (number | undefined)[] = [];
        const cv = stubBackend(() => []);
        const spied: CvBackend = { ...cv, match: (_q, _t, o) => (seen.push(o?.ratio), []) };

        matchPerLevel(spied, query, buildLevelIndex(set), 0.8);
        expect(seen).toEqual([0.8, 0.8]);
    });
});
