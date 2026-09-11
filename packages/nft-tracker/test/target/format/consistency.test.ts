/*
 *  consistency.test.ts
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
import { checkConsistency } from "../../../src/target/format/consistency.js";

type Spec = Parameters<typeof checkConsistency>[0];
type Arrays = Parameters<typeof checkConsistency>[1];

/**
 * L = 2, N = 3 (two keypoints on level 0, one on level 1), M = 3, Q = 1, P = 2.
 *
 * The literals below carry only the fields the checker reads. They are cast
 * rather than built as a full `ManifestSpec`, because `head` and `accessors`
 * play no part in step 7 and spelling them out would bury what each case is
 * actually about.
 */
const spec = () => ({
    meta: { widthPx: 8, heightPx: 4, physicalSizeMm: null },
    pyramid: { scaleStep: 2, levelSizes: [[8, 4], [4, 2]] as [number, number][] },
    keypoints: { count: 3 },
    descriptorSets: [{ count: 3 }],
    patches: { patchSize: 2, count: 1 },
    referenceImage: undefined as unknown,
    head: { extensionsRequired: [] as readonly string[] },
});

const arrays = () => ({
    keypoints: {
        levelStart: new Uint32Array([0, 2, 3]),
        x: new Float32Array([1, 2, 3]),
        y: new Float32Array([1, 2, 3]),
        angle: new Float32Array([0, 0, 0]),
        score: new Float32Array([1, 1, 1]),
        size: undefined,
        level: new Uint8Array([0, 0, 1]),
    },
    sets: [
        {
            levelStart: new Uint32Array([0, 2, 3]),
            kpIndex: new Uint32Array([0, 1, 2]),
            data: new Uint8Array(12),
        },
    ],
    patches: {
        score: new Float32Array([1]),
        left: new Uint16Array([0]),
        top: new Uint16Array([0]),
        level: new Uint8Array([0]),
        pixels: new Uint8Array(4),
    },
    referenceImage: undefined,
});

const check = (
    mutateSpec: (s: ReturnType<typeof spec>) => void = () => {},
    mutateArrays: (a: ReturnType<typeof arrays>) => void = () => {},
): string | null => {
    const s = spec();
    const a = arrays();
    mutateSpec(s);
    mutateArrays(a);
    return checkConsistency(s as unknown as Spec, a as unknown as Arrays)?.error ?? null;
};

describe("checkConsistency — the valid pair", () => {
    it("accepts it", () => {
        expect(check()).toBeNull();
    });
});

describe("checkConsistency — keypoint level ranges (§5.5)", () => {
    it("rejects levelStart[0] ≠ 0 (§5.5, rev 2)", () => {
        expect(
            check(() => {}, (a) => {
                a.keypoints.levelStart = new Uint32Array([1, 2, 3]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a levelStart that decreases", () => {
        expect(
            check(() => {}, (a) => {
                a.keypoints.levelStart = new Uint32Array([0, 3, 2]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects levelStart[L] ≠ N", () => {
        expect(
            check(() => {}, (a) => {
                a.keypoints.levelStart = new Uint32Array([0, 2, 2]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a level that disagrees with levelStart", () => {
        expect(
            check(() => {}, (a) => {
                a.keypoints.level = new Uint8Array([0, 1, 1]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("accepts a level that holds no keypoints", () => {
        expect(
            check(() => {}, (a) => {
                a.keypoints.levelStart = new Uint32Array([0, 3, 3]);
                a.keypoints.level = new Uint8Array([0, 0, 0]);
                a.sets[0]!.levelStart = new Uint32Array([0, 3, 3]);
            }),
        ).toBeNull();
    });
});

describe("checkConsistency — pyramid and meta (§5.3, §5.4)", () => {
    it("rejects meta that disagrees with levelSizes[0]", () => {
        expect(check((s) => { s.meta.widthPx = 9; })).toBe("INCONSISTENT_DATA");
        expect(check((s) => { s.meta.heightPx = 5; })).toBe("INCONSISTENT_DATA");
    });

    it("rejects levelSizes growing between two levels", () => {
        expect(check((s) => { s.pyramid.levelSizes = [[8, 4], [9, 2]]; })).toBe(
            "INCONSISTENT_DATA",
        );
        expect(check((s) => { s.pyramid.levelSizes = [[8, 4], [4, 5]]; })).toBe(
            "INCONSISTENT_DATA",
        );
    });

    it("accepts two levels of the same size", () => {
        expect(check((s) => { s.pyramid.levelSizes = [[8, 4], [8, 4]]; })).toBeNull();
    });
});

describe("checkConsistency — descriptor sets (§5.6)", () => {
    it("rejects levelStart[0] ≠ 0", () => {
        expect(
            check(() => {}, (a) => {
                a.sets[0]!.levelStart = new Uint32Array([1, 2, 3]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects levelStart[L] ≠ M", () => {
        expect(
            check(() => {}, (a) => {
                a.sets[0]!.levelStart = new Uint32Array([0, 2, 2]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a kpIndex past the keypoint count", () => {
        expect(
            check(() => {}, (a) => {
                a.sets[0]!.kpIndex = new Uint32Array([0, 1, 3]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a kpIndex referencing a keypoint of another level", () => {
        // Row 0 sits in level 0's range but points at keypoint 2, a level-1 one.
        expect(
            check(() => {}, (a) => {
                a.sets[0]!.kpIndex = new Uint32Array([2, 1, 0]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects M ≠ N without WKNF_multiview (§5.6)", () => {
        expect(
            check(
                (s) => { s.descriptorSets[0]!.count = 2; },
                (a) => {
                    a.sets[0]!.levelStart = new Uint32Array([0, 2, 2]);
                    a.sets[0]!.kpIndex = new Uint32Array([0, 1]);
                    a.sets[0]!.data = new Uint8Array(8);
                },
            ),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a repeated kpIndex without WKNF_multiview", () => {
        expect(
            check(() => {}, (a) => {
                a.sets[0]!.kpIndex = new Uint32Array([0, 0, 2]);
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("accepts an empty descriptorSets, since every set may have been dropped", () => {
        expect(
            check(
                (s) => { s.descriptorSets = []; },
                (a) => { a.sets = []; },
            ),
        ).toBeNull();
    });
});

describe("checkConsistency — patches (§5.7)", () => {
    it("rejects a patch on a level that does not exist", () => {
        expect(
            check(() => {}, (a) => { a.patches!.level = new Uint8Array([2]); }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a patch crossing the right edge of its level", () => {
        expect(
            check(() => {}, (a) => { a.patches!.left = new Uint16Array([7]); }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a patch crossing the bottom edge of its level", () => {
        expect(
            check(() => {}, (a) => { a.patches!.top = new Uint16Array([3]); }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("accepts a patch flush against the right and bottom edges", () => {
        expect(
            check(() => {}, (a) => {
                a.patches!.left = new Uint16Array([6]);
                a.patches!.top = new Uint16Array([2]);
            }),
        ).toBeNull();
    });

    it("checks the level before indexing levelSizes with it (§5.7)", () => {
        expect(() =>
            check(() => {}, (a) => { a.patches!.level = new Uint8Array([200]); }),
        ).not.toThrow();
        expect(
            check(() => {}, (a) => { a.patches!.level = new Uint8Array([200]); }),
        ).toBe("INCONSISTENT_DATA");
    });
});

describe("checkConsistency — referenceImage (§5.8)", () => {
    it("rejects a level that does not exist, without indexing levelSizes", () => {
        expect(() =>
            check((s) => {
                s.referenceImage = { level: 5, width: 8, height: 4 };
            }),
        ).not.toThrow();
        expect(
            check((s) => {
                s.referenceImage = { level: 5, width: 8, height: 4 };
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects a size that disagrees with its level", () => {
        expect(
            check((s) => {
                s.referenceImage = { level: 1, width: 8, height: 4 };
            }),
        ).toBe("INCONSISTENT_DATA");
    });

    it("accepts a reference image matching its level", () => {
        expect(
            check((s) => {
                s.referenceImage = { level: 1, width: 4, height: 2 };
            }),
        ).toBeNull();
    });
});
