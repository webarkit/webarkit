/*
 *  types.test.ts
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
import type { Descriptors } from "@webarkit/cv-backend-spec";
import type { DescriptorSet, TargetDb } from "../src/index";

/**
 * The package has no behaviour yet — these types *are* the deliverable, and
 * the point of this suite is that a target built the way the specification
 * describes one type-checks against them.
 *
 * `npm run typecheck` is therefore the real assertion: it compiles this file
 * against `tsconfig.test.json`, so a type that cannot express a legal target
 * fails there. The runtime expectations below pin the array-length invariants
 * the literal claims, so that a wrong fixture cannot quietly stand in as
 * evidence that the types are right.
 */

// A 2-level, 4-keypoint target: the smallest thing that still exercises
// per-level ranges, a descriptor set and patches.
const L = 2;
const N = 4;
const M = 4;
const BYTES_PER_DESCRIPTOR = 32; // 256-bit ORB
const P = 8;
const Q = 2;

const target: TargetDb = {
    formatVersion: "0.1",
    generator: "@webarkit/nft-tracker 0.0.0",
    extensionsUsed: [],
    extensionsRequired: [],
    meta: {
        widthPx: 64,
        heightPx: 48,
        physicalSizeMm: [80, 60],
    },
    pyramid: {
        scaleStep: Math.cbrt(2),
        levelSizes: [
            [64, 48],
            [50, 38],
        ],
    },
    keypoints: {
        count: N,
        detector: { kind: "fast", params: { threshold: 20 } },
        // 3 keypoints on level 0, 1 on level 1.
        levelStart: Uint32Array.from([0, 3, N]),
        x: Float32Array.from([10, 20, 30, 12.5]),
        y: Float32Array.from([11, 21, 31, 13.5]),
        angle: Float32Array.from([0, 1.2, -0.4, 2.9]),
        score: Float32Array.from([31, 44, 22, 19]),
        level: Uint8Array.from([0, 0, 0, 1]),
    },
    descriptorSets: [
        {
            kind: "orb",
            norm: "hamming",
            elementType: "bits",
            dimensions: 256,
            bytesPerDescriptor: BYTES_PER_DESCRIPTOR,
            producer: "jsfeatnext",
            params: { wtaK: 2 },
            count: M,
            levelStart: Uint32Array.from([0, 3, M]),
            kpIndex: Uint32Array.from([0, 1, 2, 3]),
            data: new Uint8Array(M * BYTES_PER_DESCRIPTOR),
        },
    ],
    patches: {
        patchSize: P,
        count: Q,
        score: Float32Array.from([0.6, 0.4]),
        left: Uint16Array.from([4, 8]),
        top: Uint16Array.from([5, 9]),
        level: Uint8Array.from([0, 1]),
        pixels: new Uint8Array(Q * P * P),
    },
    referenceImage: {
        level: 0,
        width: 64,
        height: 48,
        pixels: new Uint8Array(64 * 48),
    },
    info: { name: "fixture", trackability: 0.5 },
};

describe("TargetDb", () => {
    it("holds the level ranges the specification requires", () => {
        // §5.5: L + 1 entries, last one equal to N.
        expect(target.keypoints.levelStart.length).toBe(L + 1);
        expect(target.keypoints.levelStart[L]).toBe(N);
        expect(target.pyramid.levelSizes.length).toBe(L);

        // §5.6: levelStart[0] = 0, levelStart[L] = M, one kpIndex per row.
        const set = target.descriptorSets[0]!;
        expect(set.levelStart[0]).toBe(0);
        expect(set.levelStart[L]).toBe(M);
        expect(set.kpIndex.length).toBe(M);
    });

    it("sizes its bulk arrays as the specification prescribes", () => {
        const set = target.descriptorSets[0]!;
        expect(set.data.length).toBe(M * set.bytesPerDescriptor);

        const patches = target.patches!;
        expect(patches.pixels.length).toBe(patches.count * P * P);

        const image = target.referenceImage!;
        expect(image.pixels.length).toBe(image.width * image.height);
    });

    it("narrows a descriptor set on elementType", () => {
        const set: DescriptorSet = target.descriptorSets[0]!;

        if (set.elementType === "f32") {
            // Unreachable for this fixture; present so the narrowing itself is
            // type-checked in both directions.
            expectTypeIsFloat32(set.data);
            return;
        }

        // Narrowed to Uint8Array by the discriminant alone.
        expectTypeIsUint8(set.data);
        expect(set.data).toBeInstanceOf(Uint8Array);
    });

    it("yields a stored set that satisfies the contract's Descriptors", () => {
        const set = target.descriptorSets[0]!;
        expect(set.elementType).toBe("bits");
        expect(set.norm).toBe("hamming");
        if (set.elementType !== "bits") return; // narrowing, already asserted

        // §6.3: only bits + hamming is consumable today. The field names line
        // up with Descriptors, so the descriptor bytes go across as a view,
        // with no copy and no conversion — that much this assignment does
        // show at compile time.
        //
        // What it does NOT show is that `kind` and `norm` carry over on their
        // own: they are open unions here (§5.6 keeps an unknown family
        // representable), so they do not assign to the contract's closed
        // unions. Narrowing them is the job of the §6.3 usability guard, which
        // arrives with the codec; until then the fixture states them
        // literally, and that literal is the gap, not a proof.
        const descriptors: Descriptors = {
            data: set.data,
            count: set.count,
            bytesPerDescriptor: set.bytesPerDescriptor,
            kind: "orb",
            norm: "hamming",
        };

        expect(descriptors.count).toBe(M);
        expect(descriptors.data.length).toBe(M * BYTES_PER_DESCRIPTOR);
    });

    it("accepts a target without the optional sections", () => {
        const minimal: TargetDb = {
            formatVersion: "0.1",
            extensionsUsed: [],
            extensionsRequired: [],
            meta: { widthPx: 8, heightPx: 8, physicalSizeMm: null },
            pyramid: { scaleStep: 2, levelSizes: [[8, 8]] },
            keypoints: {
                count: 0,
                detector: { kind: "fast", params: {} },
                levelStart: Uint32Array.from([0, 0]),
                x: new Float32Array(0),
                y: new Float32Array(0),
                angle: new Float32Array(0),
                score: new Float32Array(0),
                level: new Uint8Array(0),
            },
            descriptorSets: [
                {
                    kind: "orb",
                    norm: "hamming",
                    elementType: "bits",
                    dimensions: 256,
                    bytesPerDescriptor: BYTES_PER_DESCRIPTOR,
                    producer: "jsfeatnext",
                    params: {},
                    count: 0,
                    levelStart: Uint32Array.from([0, 0]),
                    kpIndex: new Uint32Array(0),
                    data: new Uint8Array(0),
                },
            ],
        };

        expect(minimal.patches).toBeUndefined();
        expect(minimal.referenceImage).toBeUndefined();
        expect(minimal.info).toBeUndefined();
        expect(minimal.meta.physicalSizeMm).toBeNull();
    });

    it("can hold a set whose family the contract does not enumerate", () => {
        // §5.6: an unknown kind or norm must stay representable, so that the
        // reader can mark it unusable and keep the rest of the file working.
        const exotic: DescriptorSet = {
            kind: "some-future-family",
            norm: "hamming2",
            elementType: "f32",
            dimensions: 64,
            bytesPerDescriptor: 4 * 64,
            producer: "purecv",
            params: {},
            count: 1,
            levelStart: Uint32Array.from([0, 1]),
            kpIndex: Uint32Array.from([0]),
            data: new Float32Array(64),
        };

        expect(exotic.data).toBeInstanceOf(Float32Array);
        expect(exotic.data.length).toBe(exotic.dimensions * exotic.count);
    });
});

/** Compile-time assertions: these fail to typecheck if narrowing regresses. */
function expectTypeIsUint8(_value: Uint8Array): void {}
function expectTypeIsFloat32(_value: Float32Array): void {}
