/*
 *  manifest.test.ts
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
import {
    decodeManifest,
    validateManifest,
} from "../../../src/target/format/manifest.js";
import { DEFAULT_LIMITS } from "../../../src/target/format/limits.js";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const run = (s: string | Uint8Array, limits = DEFAULT_LIMITS) =>
    decodeManifest(typeof s === "string" ? utf8(s) : s, limits);
const errorOf = (r: ReturnType<typeof run>): string | null =>
    r.ok ? null : r.error;

const MINIMAL = '{"format":{"version":"0.2"}}';

describe("decodeManifest — size (§6.1 step 3)", () => {
    it("rejects a manifest above the limit, before decoding it", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: 16 };
        expect(errorOf(run(MINIMAL, limits))).toBe("MANIFEST_TOO_LARGE");
    });

    it("accepts a manifest exactly at the limit", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: MINIMAL.length };
        expect(run(MINIMAL, limits).ok).toBe(true);
    });

    it("rejects a manifest one byte above the limit", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: MINIMAL.length - 1 };
        expect(errorOf(run(MINIMAL, limits))).toBe("MANIFEST_TOO_LARGE");
    });
});

describe("decodeManifest — text (§6.1 step 4)", () => {
    it("rejects bytes that are not strict UTF-8", () => {
        expect(errorOf(run(new Uint8Array([0x7b, 0xff, 0x7d])))).toBe("BAD_MANIFEST");
    });

    it("rejects a lone surrogate encoded raw in the UTF-8 bytes", () => {
        // ED A0 80 is the CESU-8 spelling of U+D800, which strict UTF-8 refuses
        // — so §5 check (b) only ever has to deal with \u escapes.
        const cesu8 = new Uint8Array([
            0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x7d,
        ]);
        expect(errorOf(run(cesu8))).toBe("BAD_MANIFEST");
    });

    it("rejects each I-JSON violation as BAD_MANIFEST", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"a":1,"a":2}'))).toBe(
            "BAD_MANIFEST",
        );
        expect(errorOf(run('{"format":{"version":"0.2"},"a":9007199254740992}'))).toBe(
            "BAD_MANIFEST",
        );
        expect(errorOf(run('{"format":{"version":"0.2"},"a":1e400}'))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("names the offending path in the detail", () => {
        const r = run('{"format":{"version":"0.2"},"info":{"x":1e400}}');
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.detail).toContain("$.info.x");
    });

    it("rejects text that is not JSON", () => {
        expect(errorOf(run("not json"))).toBe("BAD_MANIFEST");
    });

    it("rejects a top level that is not an object", () => {
        expect(errorOf(run("[1,2]"))).toBe("BAD_MANIFEST");
        expect(errorOf(run("null"))).toBe("BAD_MANIFEST");
        expect(errorOf(run('"s"'))).toBe("BAD_MANIFEST");
        expect(errorOf(run("1"))).toBe("BAD_MANIFEST");
    });

    it("does not throw on pathological nesting", () => {
        const deep = `{"a":`.repeat(100_000) + "1" + "}".repeat(100_000);
        expect(() => run(deep)).not.toThrow();
        expect(run(deep).ok).toBe(false);
    });
});

describe("decodeManifest — version and extensions (§6.1 step 5)", () => {
    it("accepts exactly 0.2", () => {
        expect(run(MINIMAL).ok).toBe(true);
    });

    it("rejects every other version while the major is 0 (§7.1)", () => {
        for (const v of ["0.1", "0.3", "1.0", "0.2.0", "", "x"]) {
            expect(errorOf(run(`{"format":{"version":"${v}"}}`)), v).toBe(
                "UNSUPPORTED_FORMAT_VERSION",
            );
        }
    });

    it("rejects a malformed format object as BAD_MANIFEST, not as a version", () => {
        expect(errorOf(run("{}"))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{}}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{"version":2}}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":"0.2"}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":null}'))).toBe("BAD_MANIFEST");
    });

    it("carries the optional generator through", () => {
        const r = run('{"format":{"version":"0.2","generator":"gen 1.0"}}');
        expect(r.ok && r.value.generator).toBe("gen 1.0");
        const bare = run(MINIMAL);
        expect(bare.ok && bare.value.generator).toBeUndefined();
    });

    it("rejects a generator that is not a string", () => {
        expect(errorOf(run('{"format":{"version":"0.2","generator":1}}'))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects an unimplemented extension in extensionsRequired", () => {
        const r = run(
            '{"format":{"version":"0.2"},"extensionsUsed":["WKNF_multiview"],"extensionsRequired":["WKNF_multiview"]}',
        );
        expect(errorOf(r)).toBe("UNSUPPORTED_EXTENSION");
    });

    it("prunes an unimplemented extension used but not required, and warns", () => {
        const r = run('{"format":{"version":"0.2"},"extensionsUsed":["WKNF_multiview"]}');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.extensionsUsed).toEqual([]);
        expect(r.warnings.map((w) => w.code)).toEqual(["UNKNOWN_EXTENSION_IGNORED"]);
        expect(r.warnings[0]!.detail).toContain("WKNF_multiview");
    });

    it("treats absent extension arrays as empty", () => {
        const r = run(MINIMAL);
        expect(r.ok && r.value.extensionsUsed).toEqual([]);
        expect(r.ok && r.value.extensionsRequired).toEqual([]);
        expect(r.ok && r.warnings).toEqual([]);
    });

    it("rejects extension arrays that are not arrays of strings", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsUsed":"x"}'))).toBe(
            "BAD_MANIFEST",
        );
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsRequired":[1]}'))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects a required extension that is not also used (§5.1)", () => {
        expect(
            errorOf(
                run(
                    '{"format":{"version":"0.2"},"extensionsRequired":["WKNF_x"],"extensionsUsed":[]}',
                ),
            ),
        ).toBe("BAD_MANIFEST");
    });

    it("checks the version before the extensions", () => {
        // A 0.3 file with an unimplemented required extension is a version
        // problem: §6.1 step 5 reads the version first.
        expect(
            errorOf(
                run(
                    '{"format":{"version":"0.3"},"extensionsUsed":["WKNF_x"],"extensionsRequired":["WKNF_x"]}',
                ),
            ),
        ).toBe("UNSUPPORTED_FORMAT_VERSION");
    });

    it("hands the parsed document back for the schema pass", () => {
        const r = run('{"format":{"version":"0.2"},"meta":{"widthPx":8}}');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.doc["meta"]).toEqual({ widthPx: 8 });
    });
});

/**
 * A known-good manifest: 2 levels, 3 keypoints, one `orb` set of 3 rows, one
 * 2x2 patch. Every case below starts from this and changes exactly one thing,
 * so a failure names the rule it broke and nothing else.
 */
const good = () => ({
    format: { version: "0.2" },
    meta: { widthPx: 8, heightPx: 4, physicalSizeMm: [80, 40] },
    pyramid: { scaleStep: 2, levelSizes: [[8, 4], [4, 2]] },
    keypoints: {
        count: 3,
        detector: { kind: "fast", params: { threshold: 20 } },
        levelStart: 0, x: 1, y: 2, angle: 3, score: 4, level: 5,
    },
    descriptorSets: [
        {
            kind: "orb", norm: "hamming", elementType: "bits", dimensions: 32,
            bytesPerDescriptor: 4, producer: "jsfeatnext", count: 3,
            levelStart: 6, kpIndex: 7, data: 8,
        },
    ],
    patches: {
        patchSize: 2, count: 1,
        score: 9, left: 10, top: 11, level: 12, pixels: 13,
    },
    accessors: [
        { offset: 0, count: 3, type: "u32" },    //  0 keypoints.levelStart (L+1)
        { offset: 16, count: 3, type: "f32" },   //  1 x
        { offset: 32, count: 3, type: "f32" },   //  2 y
        { offset: 48, count: 3, type: "f32" },   //  3 angle
        { offset: 64, count: 3, type: "f32" },   //  4 score
        { offset: 80, count: 3, type: "u8" },    //  5 level
        { offset: 88, count: 3, type: "u32" },   //  6 set.levelStart
        { offset: 104, count: 3, type: "u32" },  //  7 set.kpIndex
        { offset: 120, count: 12, type: "u8" },  //  8 set.data (3 x 4 bytes)
        { offset: 136, count: 1, type: "f32" },  //  9 patches.score
        { offset: 144, count: 1, type: "u16" },  // 10 patches.left
        { offset: 152, count: 1, type: "u16" },  // 11 patches.top
        { offset: 160, count: 1, type: "u8" },   // 12 patches.level
        { offset: 168, count: 4, type: "u8" },   // 13 patches.pixels (1 x 2 x 2)
    ],
});

const BIN_LENGTH = 172;

type Good = ReturnType<typeof good>;
type Mutable = Record<string, unknown>;

const validate = (
    mutate: (m: Good) => void = () => {},
    binLength: number | null = BIN_LENGTH,
    limits = DEFAULT_LIMITS,
) => {
    const m = good();
    mutate(m);
    const head = run(JSON.stringify(m), limits);
    if (!head.ok) {
        throw new Error(`the fixture itself failed step 5: ${head.error} ${head.detail}`);
    }
    return validateManifest(head.value, binLength, limits);
};
const vErr = (r: ReturnType<typeof validate>): string | null =>
    r.ok ? null : r.error;

describe("validateManifest — the known-good manifest", () => {
    it("accepts it with no warnings", () => {
        const r = validate();
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        expect(r.ok && r.warnings).toEqual([]);
    });

    it("accepts an absent patches section", () => {
        expect(validate((m) => { delete (m as Mutable)["patches"]; }).ok).toBe(true);
    });

    it("accepts an absent params, treating it as {} (§7.3)", () => {
        const r = validate((m) => {
            delete (m.keypoints.detector as Mutable)["params"];
        });
        expect(r.ok && r.value.keypoints.detector.params).toEqual({});
    });

    it("accepts a reference image that matches its level", () => {
        const r = validate((m) => {
            m.accessors.push({ offset: 176, count: 32, type: "u8" });
            (m as Mutable)["referenceImage"] = {
                level: 0, width: 8, height: 4, pixels: 14,
            };
        }, 208);
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
    });

    it("accepts an info object and hands it back unchanged", () => {
        const r = validate((m) => {
            (m as Mutable)["info"] = { name: "x", nested: { a: [1, 2] } };
        });
        expect(r.ok && r.value.info).toEqual({ name: "x", nested: { a: [1, 2] } });
    });
});

describe("validateManifest — required keys and types (BAD_MANIFEST)", () => {
    for (const key of ["meta", "pyramid", "keypoints", "descriptorSets", "accessors"]) {
        it(`rejects a missing ${key}`, () => {
            expect(vErr(validate((m) => { delete (m as Mutable)[key]; }))).toBe(
                "BAD_MANIFEST",
            );
        });
    }

    it("rejects an empty descriptorSets (§5.1 requires at least one entry)", () => {
        expect(vErr(validate((m) => { m.descriptorSets = []; }))).toBe("BAD_MANIFEST");
    });

    it("rejects an info that is not an object", () => {
        expect(vErr(validate((m) => { (m as Mutable)["info"] = 1; }))).toBe(
            "BAD_MANIFEST",
        );
    });
});

describe("validateManifest — accessor domains (§5.2)", () => {
    it("rejects a fractional offset", () => {
        expect(vErr(validate((m) => { m.accessors[0]!.offset = 0.5; }))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects a negative count", () => {
        expect(vErr(validate((m) => { m.accessors[0]!.count = -1; }))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects a count above 2^32 − 1", () => {
        expect(vErr(validate((m) => { m.accessors[0]!.count = 4294967296; }))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects an unknown accessor type", () => {
        expect(
            vErr(validate((m) => { (m.accessors[0] as Mutable)["type"] = "i32"; })),
        ).toBe("BAD_MANIFEST");
    });

    it("rejects an accessor reference that is not an index in range", () => {
        expect(vErr(validate((m) => { m.keypoints.x = 99; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.keypoints.x = -1; }))).toBe("BAD_MANIFEST");
        expect(vErr(validate((m) => { m.keypoints.x = 1.5; }))).toBe("BAD_MANIFEST");
        expect(
            vErr(validate((m) => { (m.keypoints as Mutable)["x"] = "1"; })),
        ).toBe("BAD_MANIFEST");
    });
});

describe("validateManifest — accessor layout (BAD_LAYOUT)", () => {
    it("rejects an offset that is not a multiple of the element size", () => {
        expect(vErr(validate((m) => { m.accessors[1]!.offset = 18; }))).toBe(
            "BAD_LAYOUT",
        );
    });

    it("rejects an accessor running past the BIN chunk", () => {
        expect(vErr(validate(() => {}, 100))).toBe("BAD_LAYOUT");
    });

    it("rejects overlapping accessors", () => {
        expect(vErr(validate((m) => { m.accessors[2]!.offset = 16; }))).toBe(
            "BAD_LAYOUT",
        );
    });

    it("allows two zero-length accessors to share an offset", () => {
        const r = validate((m) => {
            m.accessors.push({ offset: 176, count: 0, type: "u8" });
            m.accessors.push({ offset: 176, count: 0, type: "u8" });
        }, 176);
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
    });

    it("rejects a field whose accessor has the wrong type", () => {
        expect(
            vErr(validate((m) => { (m.accessors[1] as Mutable)["type"] = "u32"; })),
        ).toBe("BAD_LAYOUT");
    });

    it("rejects a field whose accessor has the wrong count", () => {
        expect(vErr(validate((m) => { m.accessors[1]!.count = 2; }))).toBe("BAD_LAYOUT");
    });

    it("rejects a manifest with accessors and no BIN chunk (§5.2, rev 2)", () => {
        expect(vErr(validate(() => {}, null))).toBe("BAD_LAYOUT");
    });

    it("rejects it even when every accessor has count 0 (§5.2, rev 2)", () => {
        expect(
            vErr(
                validate((m) => {
                    for (const a of m.accessors) a.count = 0;
                }, null),
            ),
        ).toBe("BAD_LAYOUT");
    });

    it("rejects a count × size product that would exceed the chunk", () => {
        expect(vErr(validate((m) => { m.accessors[8]!.count = 4294967295; }))).toBe(
            "BAD_LAYOUT",
        );
    });
});

describe("validateManifest — pyramid and meta domains (§5.3, §5.4)", () => {
    it("rejects a level size of 0, above 2^16 − 1, or fractional", () => {
        expect(vErr(validate((m) => { m.pyramid.levelSizes[1] = [0, 2]; }))).toBe(
            "BAD_MANIFEST",
        );
        expect(vErr(validate((m) => { m.pyramid.levelSizes[1] = [65536, 2]; }))).toBe(
            "BAD_MANIFEST",
        );
        expect(vErr(validate((m) => { m.pyramid.levelSizes[1] = [1.5, 2]; }))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects a scaleStep of 1 or less, or a non-finite one", () => {
        for (const s of [1, 0.5, 0, -2]) {
            expect(vErr(validate((m) => { m.pyramid.scaleStep = s; })), String(s)).toBe(
                "BAD_MANIFEST",
            );
        }
    });

    it("rejects zero levels", () => {
        expect(vErr(validate((m) => { m.pyramid.levelSizes = []; }))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects a physicalSizeMm entry that is not > 0", () => {
        expect(vErr(validate((m) => { m.meta.physicalSizeMm = [0, 40]; }))).toBe(
            "BAD_MANIFEST",
        );
        expect(vErr(validate((m) => { m.meta.physicalSizeMm = [-1, 40]; }))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("accepts a null physicalSizeMm", () => {
        expect(
            validate((m) => { (m.meta as Mutable)["physicalSizeMm"] = null; }).ok,
        ).toBe(true);
    });
});

describe("validateManifest — descriptor sets (§5.6)", () => {
    it("rejects a bytesPerDescriptor inconsistent with bits", () => {
        expect(
            vErr(validate((m) => { m.descriptorSets[0]!.bytesPerDescriptor = 5; })),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects bits whose dimensions is not a multiple of 8", () => {
        expect(
            vErr(
                validate((m) => {
                    m.descriptorSets[0]!.dimensions = 33;
                    m.descriptorSets[0]!.bytesPerDescriptor = 4;
                }),
            ),
        ).toBe("INCONSISTENT_DATA");
    });

    it("rejects two sets with the same (kind, norm, dimensions, producer)", () => {
        expect(
            vErr(validate((m) => { m.descriptorSets.push({ ...m.descriptorSets[0]! }); })),
        ).toBe("INCONSISTENT_DATA");
    });

    it("accepts two sets that differ only by producer", () => {
        const r = validate((m) => {
            m.accessors.push(
                { offset: 176, count: 3, type: "u32" },
                { offset: 192, count: 3, type: "u32" },
                { offset: 208, count: 12, type: "u8" },
            );
            m.descriptorSets.push({
                ...m.descriptorSets[0]!,
                producer: "purecv",
                levelStart: 14, kpIndex: 15, data: 16,
            });
        }, 224);
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
    });

    it("keeps a set with an unknown kind and warns", () => {
        const r = validate((m) => { m.descriptorSets[0]!.kind = "wombat"; });
        expect(r.ok).toBe(true);
        expect(r.ok && r.value.descriptorSets).toHaveLength(1);
        expect(r.ok && r.warnings.map((w) => w.code)).toEqual([
            "UNSUPPORTED_DESCRIPTOR_SET",
        ]);
    });

    it("keeps a set with an unknown norm and warns (hamming2 is not in the contract)", () => {
        const r = validate((m) => { m.descriptorSets[0]!.norm = "hamming2"; });
        expect(r.ok && r.value.descriptorSets).toHaveLength(1);
        expect(r.ok && r.warnings.map((w) => w.code)).toEqual([
            "UNSUPPORTED_DESCRIPTOR_SET",
        ]);
    });

    it("drops a set with an unknown elementType and warns (§5.6)", () => {
        const r = validate((m) => { m.descriptorSets[0]!.elementType = "f16"; });
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        expect(r.ok && r.value.descriptorSets).toEqual([]);
        expect(r.ok && r.warnings.map((w) => w.code)).toEqual([
            "UNSUPPORTED_DESCRIPTOR_SET",
        ]);
    });

    it("does not validate a dropped set's accessors, so it stays a warning", () => {
        const r = validate((m) => {
            m.descriptorSets[0]!.elementType = "f16";
            m.descriptorSets[0]!.data = 999; // would be BAD_MANIFEST if it were read
        });
        expect(r.ok).toBe(true);
    });
});

describe("validateManifest — resource limits (§6.4)", () => {
    it("rejects more levels than the limit", () => {
        expect(
            vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxLevels: 1 })),
        ).toBe("LIMIT_EXCEEDED");
    });

    it("rejects more keypoints than the limit", () => {
        expect(
            vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxKeypoints: 2 })),
        ).toBe("LIMIT_EXCEEDED");
    });

    it("rejects more descriptor sets than the limit", () => {
        expect(
            vErr(
                validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxDescriptorSets: 0 }),
            ),
        ).toBe("LIMIT_EXCEEDED");
    });

    it("rejects a patch size above the limit", () => {
        expect(
            vErr(validate(() => {}, BIN_LENGTH, { ...DEFAULT_LIMITS, maxPatchSize: 1 })),
        ).toBe("LIMIT_EXCEEDED");
    });
});

describe("validateManifest — unknown keys (§5.1)", () => {
    it("ignores an unknown key at the top level", () => {
        expect(validate((m) => { (m as Mutable)["future"] = { a: 1 }; }).ok).toBe(true);
    });

    it("ignores an unknown key inside a descriptor set", () => {
        expect(
            validate((m) => { (m.descriptorSets[0] as Mutable)["future"] = 1; }).ok,
        ).toBe(true);
    });
});
