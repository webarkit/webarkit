/*
 *  decode.test.ts
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
import { decode } from "../../../src/target/format/decode.js";
import { BIN_TYPE } from "../../../src/target/format/container.js";
import { buildRaw, jsonChunk } from "./raw.js";

/**
 * A minimal but complete valid file, built by hand so this suite depends on
 * neither the encoder nor the fixture corpus.
 *
 * L = 1, N = 1, one `orb` set of one 4-byte row, no patches. The accessors sit
 * in first-appearance order, each at a multiple of 8:
 *
 *   0 keypoints.levelStart u32 x2 @ 0    1 x   f32 @ 8    2 y     f32 @ 16
 *   3 angle f32 @ 24                     4 score f32 @ 32 5 level u8  @ 40
 *   6 set.levelStart u32 x2 @ 48         7 set.kpIndex u32 @ 56
 *   8 set.data u8 x4 @ 64
 */
const manifestOf = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
        format: { version: "0.2" },
        meta: { widthPx: 8, heightPx: 4, physicalSizeMm: null },
        pyramid: { scaleStep: 2, levelSizes: [[8, 4]] },
        keypoints: {
            count: 1,
            detector: { kind: "fast", params: {} },
            levelStart: 0, x: 1, y: 2, angle: 3, score: 4, level: 5,
        },
        descriptorSets: [
            {
                kind: "orb", norm: "hamming", elementType: "bits", dimensions: 32,
                bytesPerDescriptor: 4, producer: "jsfeatnext", params: {},
                count: 1, levelStart: 6, kpIndex: 7, data: 8,
            },
        ],
        accessors: [
            { offset: 0, count: 2, type: "u32" },
            { offset: 8, count: 1, type: "f32" },
            { offset: 16, count: 1, type: "f32" },
            { offset: 24, count: 1, type: "f32" },
            { offset: 32, count: 1, type: "f32" },
            { offset: 40, count: 1, type: "u8" },
            { offset: 48, count: 2, type: "u32" },
            { offset: 56, count: 1, type: "u32" },
            { offset: 64, count: 4, type: "u8" },
        ],
        ...overrides,
    });

const binPayload = (): Uint8Array => {
    const bin = new Uint8Array(68);
    const dv = new DataView(bin.buffer);
    dv.setUint32(0, 0, true);
    dv.setUint32(4, 1, true);
    dv.setFloat32(8, 3, true);
    dv.setFloat32(16, 4, true);
    dv.setFloat32(24, 0, true);
    dv.setFloat32(32, 1, true);
    bin[40] = 0;
    dv.setUint32(48, 0, true);
    dv.setUint32(52, 1, true);
    dv.setUint32(56, 0, true);
    bin.set([1, 2, 3, 4], 64);
    return bin;
};

const validBytes = (
    manifest: string = manifestOf(),
    extraChunks: { type: string; data: Uint8Array }[] = [],
): Uint8Array =>
    buildRaw({
        chunks: [
            jsonChunk(manifest),
            { type: BIN_TYPE, data: binPayload() },
            ...extraChunks,
        ],
    });

describe("decode — a valid file", () => {
    it("returns the target and no warnings", () => {
        const r = decode(validBytes());
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        if (!r.ok) return;
        expect(r.warnings).toEqual([]);
        expect(r.target.formatVersion).toBe("0.2");
        expect(r.target.meta).toEqual({ widthPx: 8, heightPx: 4, physicalSizeMm: null });
        expect(r.target.pyramid.levelSizes).toEqual([[8, 4]]);
        expect([...r.target.keypoints.x]).toEqual([3]);
        expect([...r.target.keypoints.y]).toEqual([4]);
        expect(r.target.keypoints.detector).toEqual({ kind: "fast", params: {} });
        expect(r.target.descriptorSets).toHaveLength(1);
        expect([...r.target.descriptorSets[0]!.data]).toEqual([1, 2, 3, 4]);
        expect(r.target.extensionsUsed).toEqual([]);
    });

    it("omits absent optionals rather than setting them to undefined", () => {
        const r = decode(validBytes());
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect("patches" in r.target).toBe(false);
        expect("referenceImage" in r.target).toBe(false);
        expect("info" in r.target).toBe(false);
        expect("generator" in r.target).toBe(false);
        expect("size" in r.target.keypoints).toBe(false);
    });

    it("accepts a bare ArrayBuffer as well as a view", () => {
        const bytes = validBytes();
        expect(decode(bytes).ok).toBe(true);
        expect(decode(bytes.buffer).ok).toBe(true);
    });

    it("decodes the same values from a non-8-aligned base (§3)", () => {
        const bytes = validBytes();
        const shifted = new Uint8Array(bytes.length + 3);
        shifted.set(bytes, 3);
        const a = decode(bytes);
        const b = decode(shifted.subarray(3));
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect([...b.target.keypoints.levelStart]).toEqual([
            ...a.target.keypoints.levelStart,
        ]);
        expect([...b.target.keypoints.x]).toEqual([...a.target.keypoints.x]);
        expect([...b.target.descriptorSets[0]!.kpIndex]).toEqual([
            ...a.target.descriptorSets[0]!.kpIndex,
        ]);
        expect([...b.target.descriptorSets[0]!.data]).toEqual([
            ...a.target.descriptorSets[0]!.data,
        ]);
    });

    it("carries the generator through when the file has one", () => {
        const r = decode(
            validBytes(manifestOf({ format: { version: "0.2", generator: "gen 1" } })),
        );
        expect(r.ok && r.target.generator).toBe("gen 1");
    });
});

describe("decode — the order of the gates (§6.1)", () => {
    it("checks the file size before the magic (step 0)", () => {
        const r = decode(buildRaw({ magic: "GLTF", chunks: [jsonChunk("{}")] }), {
            limits: { maxFileBytes: 8 },
        });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.error).toBe("LIMIT_EXCEEDED");
    });

    it("reports BAD_MAGIC when the size is within the limit", () => {
        const r = decode(buildRaw({ magic: "GLTF", chunks: [jsonChunk("{}")] }));
        expect(!r.ok && r.error).toBe("BAD_MAGIC");
    });

    it("checks the checksum before the manifest's content (step 2 before 4)", () => {
        const r = decode(
            buildRaw({ chunks: [{ ...jsonChunk("not json at all"), crc: 0 }] }),
        );
        expect(!r.ok && r.error).toBe("CHECKSUM_MISMATCH");
    });

    it("reaches the manifest when the checksum is right", () => {
        const r = decode(buildRaw({ chunks: [jsonChunk("not json at all")] }));
        expect(!r.ok && r.error).toBe("BAD_MANIFEST");
    });

    it("reports BAD_LAYOUT for a manifest with accessors and no BIN chunk", () => {
        const r = decode(buildRaw({ chunks: [jsonChunk(manifestOf())] }));
        expect(!r.ok && r.error).toBe("BAD_LAYOUT");
    });
});

describe("decode — warnings", () => {
    it("warns about an unknown chunk and still decodes", () => {
        const r = decode(
            validBytes(manifestOf(), [{ type: "XTRA", data: new Uint8Array([9, 9]) }]),
        );
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        if (!r.ok) return;
        expect(r.warnings.map((w) => w.code)).toEqual(["UNKNOWN_CHUNK_SKIPPED"]);
        expect(r.warnings[0]!.detail).toContain("XTRA");
    });

    it("warns about an unknown extension and prunes it (§7.3)", () => {
        const r = decode(
            validBytes(manifestOf({ extensionsUsed: ["WKNF_future"] })),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.warnings.map((w) => w.code)).toEqual(["UNKNOWN_EXTENSION_IGNORED"]);
        expect(r.target.extensionsUsed).toEqual([]);
    });
});

describe("decode — never throws", () => {
    it("returns a failure for every truncation of a valid file", () => {
        const whole = validBytes();
        for (let n = 0; n < whole.length; n += 1) {
            const r = decode(whole.subarray(0, n));
            expect(r.ok, `truncated at ${n}`).toBe(false);
        }
        expect(decode(whole).ok).toBe(true);
    });

    it("returns a failure for an empty buffer", () => {
        expect(decode(new ArrayBuffer(0)).ok).toBe(false);
    });

    it("returns a failure for arbitrary bytes", () => {
        const junk = new Uint8Array(256);
        for (let i = 0; i < junk.length; i += 1) junk[i] = (i * 37) & 0xff;
        expect(() => decode(junk)).not.toThrow();
        expect(decode(junk).ok).toBe(false);
    });
});
