/*
 *  validate-target.test.ts
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
import { validateTarget } from "../../../src/target/format/validate-target.js";
import type { JsonValue, TargetDb } from "../../../src/index.js";
import { good, goodBitsSet, withParam } from "./targets.js";

const pathOf = (t: TargetDb): string | null => validateTarget(t)?.path ?? null;

describe("validateTarget — the good target", () => {
    it("accepts it", () => {
        expect(validateTarget(good())).toBeNull();
    });
});

describe("validateTarget — §8.2 item 7: the writer rejects what the reader would", () => {
    it("rejects an unpaired surrogate in params (§5 check b)", () => {
        expect(pathOf(withParam(String.fromCharCode(0xd800)))).toBe(
            "descriptorSets[0].params.seed",
        );
    });

    it("rejects the integer 2^53 in params (§5 check c)", () => {
        expect(pathOf(withParam(9007199254740992))).toBe(
            "descriptorSets[0].params.seed",
        );
    });

    it("accepts 2^53 − 1, the boundary that must encode", () => {
        expect(validateTarget(withParam(9007199254740991))).toBeNull();
    });

    it("rejects a value that would serialise to infinity (§5 check d)", () => {
        expect(pathOf(withParam(Number.POSITIVE_INFINITY))).toBe(
            "descriptorSets[0].params.seed",
        );
        expect(pathOf(withParam(Number.NEGATIVE_INFINITY))).toBe(
            "descriptorSets[0].params.seed",
        );
    });

    it("rejects a Unicode noncharacter in params (§5 check e)", () => {
        expect(pathOf(withParam(String.fromCharCode(0xffff)))).toBe(
            "descriptorSets[0].params.seed",
        );
        expect(pathOf(withParam(String.fromCodePoint(0x10ffff)))).toBe(
            "descriptorSets[0].params.seed",
        );
        expect(pathOf(withParam(String.fromCharCode(0xfdd0)))).toBe(
            "descriptorSets[0].params.seed",
        );
    });

    it("rejects NaN, which JSON.stringify would coerce to null (§7.3)", () => {
        expect(pathOf(withParam(Number.NaN))).toBe("descriptorSets[0].params.seed");
    });

    it("checks params keys as well as values", () => {
        const t = good();
        const broken: TargetDb = {
            ...t,
            descriptorSets: [
                {
                    ...t.descriptorSets[0]!,
                    params: { [String.fromCharCode(0xfdd0)]: 1 },
                },
            ],
        };
        expect(pathOf(broken)).toMatch(/^descriptorSets\[0\]\.params/);
    });

    it("checks nested params content and names the full path", () => {
        expect(pathOf(withParam({ inner: [1, 1e400] } as unknown as JsonValue))).toBe(
            "descriptorSets[0].params.seed.inner[1]",
        );
    });

    it("checks info the same way", () => {
        const t: TargetDb = { ...good(), info: { name: String.fromCharCode(0xfffe) } };
        expect(pathOf(t)).toBe("info.name");
    });

    it("checks the detector's params too", () => {
        const t = good();
        const broken: TargetDb = {
            ...t,
            keypoints: {
                ...t.keypoints,
                detector: { kind: "fast", params: { t: Number.NaN } },
            },
        };
        expect(pathOf(broken)).toBe("keypoints.detector.params.t");
    });

    it("accepts ordinary free-form content", () => {
        expect(
            validateTarget(withParam({ a: [1, "x", null, true], b: { c: 1.5 } })),
        ).toBeNull();
    });
});

describe("validateTarget — structural rules mirroring the reader", () => {
    it("rejects a format version this build does not read", () => {
        expect(pathOf({ ...good(), formatVersion: "0.3" })).toBe("formatVersion");
    });

    it("rejects an empty descriptorSets (§5.1)", () => {
        expect(pathOf({ ...good(), descriptorSets: [] })).toBe("descriptorSets");
    });

    it("rejects a scaleStep of 1 or less", () => {
        expect(
            pathOf({ ...good(), pyramid: { scaleStep: 1, levelSizes: [[8, 4]] } }),
        ).toBe("pyramid.scaleStep");
    });

    it("rejects a level size outside [1, 2^16 − 1]", () => {
        expect(
            pathOf({ ...good(), pyramid: { scaleStep: 2, levelSizes: [[0, 4]] } }),
        ).toMatch(/^pyramid\.levelSizes/);
        expect(
            pathOf({ ...good(), pyramid: { scaleStep: 2, levelSizes: [[65536, 4]] } }),
        ).toMatch(/^pyramid\.levelSizes/);
    });

    it("rejects a pyramid that grows between two levels", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                pyramid: { scaleStep: 2, levelSizes: [[8, 4], [9, 4]] },
                keypoints: { ...t.keypoints, levelStart: new Uint32Array([0, 1, 1]) },
                descriptorSets: [
                    { ...t.descriptorSets[0]!, levelStart: new Uint32Array([0, 1, 1]) },
                ],
            }),
        ).toMatch(/^pyramid\.levelSizes/);
    });

    it("rejects meta that disagrees with levelSizes[0]", () => {
        expect(
            pathOf({
                ...good(),
                meta: { widthPx: 9, heightPx: 4, physicalSizeMm: null },
            }),
        ).toBe("meta.widthPx");
    });

    it("rejects a physicalSizeMm entry that is not > 0", () => {
        expect(
            pathOf({
                ...good(),
                meta: { widthPx: 8, heightPx: 4, physicalSizeMm: [0, 40] },
            }),
        ).toBe("meta.physicalSizeMm[0]");
    });

    it("rejects a bytesPerDescriptor inconsistent with elementType", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                descriptorSets: [{ ...t.descriptorSets[0]!, bytesPerDescriptor: 5 }],
            }),
        ).toBe("descriptorSets[0].bytesPerDescriptor");
    });

    it("rejects an array whose length disagrees with its count", () => {
        const t = good();
        expect(
            pathOf({ ...t, keypoints: { ...t.keypoints, x: new Float32Array([1, 2]) } }),
        ).toBe("keypoints.x");
    });

    it("rejects a levelStart that is not closed", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                keypoints: { ...t.keypoints, levelStart: new Uint32Array([1, 1]) },
            }),
        ).toBe("keypoints.levelStart");
    });

    it("rejects M ≠ N without WKNF_multiview", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                descriptorSets: [
                    {
                        ...goodBitsSet(),
                        count: 0,
                        levelStart: new Uint32Array([0, 0]),
                        kpIndex: new Uint32Array([]),
                        data: new Uint8Array([]),
                    },
                ],
            }),
        ).toMatch(/^descriptorSets\[0\]/);
    });

    it("rejects two sets with the same (kind, norm, dimensions, producer)", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                descriptorSets: [t.descriptorSets[0]!, t.descriptorSets[0]!],
            }),
        ).toBe("descriptorSets[1]");
    });

    it("rejects a patch out of its level's bounds", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                patches: {
                    patchSize: 2,
                    count: 1,
                    score: new Float32Array([1]),
                    left: new Uint16Array([7]),
                    top: new Uint16Array([0]),
                    level: new Uint8Array([0]),
                    pixels: new Uint8Array(4),
                },
            }),
        ).toBe("patches.left");
    });

    it("rejects a reference image that disagrees with its level", () => {
        const t = good();
        expect(
            pathOf({
                ...t,
                referenceImage: {
                    level: 0,
                    width: 4,
                    height: 4,
                    pixels: new Uint8Array(16),
                },
            }),
        ).toBe("referenceImage.width");
    });

    it("rejects an extension it does not implement", () => {
        expect(
            pathOf({
                ...good(),
                extensionsUsed: ["WKNF_x"],
                extensionsRequired: ["WKNF_x"],
            }),
        ).toMatch(/^extensions/);
    });

    it("rejects a required extension that is not also used", () => {
        expect(
            pathOf({ ...good(), extensionsUsed: [], extensionsRequired: ["WKNF_x"] }),
        ).toBe("extensionsRequired");
    });
});
