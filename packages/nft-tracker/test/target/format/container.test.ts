/*
 *  container.test.ts
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
    align8,
    BIN_TYPE,
    buildContainer,
    parseContainer,
} from "../../../src/target/format/container.js";
import { binChunk, buildRaw, jsonChunk } from "./raw.js";

const ok = (r: ReturnType<typeof parseContainer>) => {
    if (!r.ok) throw new Error(`expected ok, got ${r.error}: ${r.detail}`);
    return r.value;
};
const err = (r: ReturnType<typeof parseContainer>) => {
    if (r.ok) throw new Error("expected a failure");
    return r.error;
};

const MANIFEST = '{"format":{"version":"0.2"}}';
const BIN = new Uint8Array([1, 2, 3, 4, 5]);

describe("BIN_TYPE", () => {
    it('is "BIN" followed by NUL, not by a space (§4.2)', () => {
        expect(BIN_TYPE).toHaveLength(4);
        expect(BIN_TYPE.charCodeAt(3)).toBe(0);
    });
});

describe("parseContainer", () => {
    it("frames a JSON + BIN file and reports unpadded lengths", () => {
        const c = ok(
            parseContainer(buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] })),
        );
        expect(c.json.length).toBe(MANIFEST.length);
        expect(c.json.dataStart).toBe(32);
        expect(c.bin?.length).toBe(5);
        // 16 header + 16 chunk header + 28 padded to 32 + 16 chunk header.
        expect(c.bin?.dataStart).toBe(80);
        expect(c.unknown).toEqual([]);
    });

    it("starts every chunk's data at an 8-aligned offset (§4.2)", () => {
        const c = ok(
            parseContainer(buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] })),
        );
        expect(c.json.dataStart % 8).toBe(0);
        expect((c.bin?.dataStart ?? 1) % 8).toBe(0);
    });

    it("rejects a buffer too short to hold a header", () => {
        expect(err(parseContainer(new Uint8Array(15)))).toBe("BAD_CONTAINER");
    });

    it("rejects a wrong magic", () => {
        expect(
            err(parseContainer(buildRaw({ magic: "GLTF", chunks: [jsonChunk(MANIFEST)] }))),
        ).toBe("BAD_MAGIC");
    });

    it("rejects an unknown container major", () => {
        expect(
            err(
                parseContainer(
                    buildRaw({ containerMajor: 2, chunks: [jsonChunk(MANIFEST)] }),
                ),
            ),
        ).toBe("UNSUPPORTED_CONTAINER");
    });

    it("accepts a newer container minor (§7.1)", () => {
        expect(
            ok(
                parseContainer(
                    buildRaw({ containerMinor: 7, chunks: [jsonChunk(MANIFEST)] }),
                ),
            ),
        ).toBeDefined();
    });

    it("rejects a total_length that is not the buffer length", () => {
        expect(
            err(parseContainer(buildRaw({ totalLength: 999, chunks: [jsonChunk(MANIFEST)] }))),
        ).toBe("BAD_CONTAINER");
    });

    it("rejects a non-zero flags field", () => {
        expect(
            err(parseContainer(buildRaw({ flags: 1, chunks: [jsonChunk(MANIFEST)] }))),
        ).toBe("BAD_CONTAINER");
    });

    it("rejects a non-zero reserved word in a chunk header", () => {
        const raw = buildRaw({ chunks: [{ ...jsonChunk(MANIFEST), reserved: 1 }] });
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("rejects a chunk whose stored length runs past the file", () => {
        const raw = buildRaw({ chunks: [{ ...jsonChunk(MANIFEST), length: 4096 }] });
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("rejects a file whose first chunk is not JSON", () => {
        expect(
            err(parseContainer(buildRaw({ chunks: [binChunk(BIN), jsonChunk(MANIFEST)] }))),
        ).toBe("BAD_CONTAINER");
    });

    it("rejects a second JSON chunk", () => {
        expect(
            err(
                parseContainer(
                    buildRaw({ chunks: [jsonChunk(MANIFEST), jsonChunk(MANIFEST)] }),
                ),
            ),
        ).toBe("BAD_CONTAINER");
    });

    it("rejects two BIN chunks", () => {
        expect(
            err(
                parseContainer(
                    buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN), binChunk(BIN)] }),
                ),
            ),
        ).toBe("BAD_CONTAINER");
    });

    it("rejects a BIN chunk that is not second", () => {
        const raw = buildRaw({
            chunks: [jsonChunk(MANIFEST), { type: "XTRA", data: BIN }, binChunk(BIN)],
        });
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("reports an unknown chunk after JSON and BIN", () => {
        const raw = buildRaw({
            chunks: [jsonChunk(MANIFEST), binChunk(BIN), { type: "XTRA", data: BIN }],
        });
        expect(ok(parseContainer(raw)).unknown.map((c) => c.type)).toEqual(["XTRA"]);
    });

    it("accepts an unknown chunk in second place when there is no BIN (§4.2, rev 2)", () => {
        const raw = buildRaw({
            chunks: [jsonChunk(MANIFEST), { type: "XTRA", data: BIN }],
        });
        const c = ok(parseContainer(raw));
        expect(c.bin).toBeNull();
        expect(c.unknown.map((x) => x.type)).toEqual(["XTRA"]);
    });

    it("rejects a corrupted JSON chunk by checksum", () => {
        expect(
            err(parseContainer(buildRaw({ chunks: [{ ...jsonChunk(MANIFEST), crc: 0 }] }))),
        ).toBe("CHECKSUM_MISMATCH");
    });

    it("rejects a corrupted BIN chunk by checksum", () => {
        const raw = buildRaw({
            chunks: [jsonChunk(MANIFEST), { ...binChunk(BIN), crc: 0 }],
        });
        expect(err(parseContainer(raw))).toBe("CHECKSUM_MISMATCH");
    });

    it("does not checksum an unknown chunk (§6.1 step 2 names only JSON and BIN)", () => {
        const raw = buildRaw({
            chunks: [jsonChunk(MANIFEST), binChunk(BIN), { type: "XTRA", data: BIN, crc: 0 }],
        });
        expect(ok(parseContainer(raw)).unknown).toHaveLength(1);
    });

    it("locates chunks relative to the view, not to the underlying buffer", () => {
        const whole = buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] });
        const shifted = new Uint8Array(whole.length + 3);
        shifted.set(whole, 3);
        const c = ok(parseContainer(shifted.subarray(3)));
        expect(c.json.dataStart).toBe(32);
        expect(c.bin?.dataStart).toBe(80);
    });

    it("never throws on a truncated valid file, at any offset", () => {
        const whole = buildRaw({ chunks: [jsonChunk(MANIFEST), binChunk(BIN)] });
        for (let n = 0; n < whole.length; n += 1) {
            const r = parseContainer(whole.subarray(0, n));
            expect(r.ok, `truncated at ${n}`).toBe(false);
        }
        expect(parseContainer(whole).ok).toBe(true);
    });

    it("aligns to a multiple of 8", () => {
        expect([0, 1, 7, 8, 9, 16].map(align8)).toEqual([0, 8, 8, 8, 16, 16]);
    });

    it("aligns across the whole u32 range without wrapping", () => {
        // Regression. `(n + 7) & ~7` is a 32-bit *signed* operation, so a
        // chunk_length at or above 2^31 came back negative: the bounds check
        // below then passed, the cursor went negative, and the next DataView
        // read threw instead of returning a failure. Found by the §8.4 fuzzer.
        expect(align8(0x7ffffff8)).toBe(0x7ffffff8);
        expect(align8(0x80000000)).toBe(0x80000000);
        expect(align8(0x80000001)).toBe(0x80000008);
        expect(align8(0xffffffff)).toBe(0x100000000);
        for (const n of [0x80000000, 0xfffffff9, 0xffffffff]) {
            expect(align8(n), `align8(${n})`).toBeGreaterThanOrEqual(n);
        }
    });

    it("rejects a chunk_length at 2^31 without throwing", () => {
        const raw = buildRaw({
            chunks: [{ ...jsonChunk(MANIFEST), length: 0x80000000 }],
        });
        expect(() => parseContainer(raw)).not.toThrow();
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });

    it("rejects a chunk_length at 2^32 − 1 without throwing", () => {
        const raw = buildRaw({
            chunks: [{ ...jsonChunk(MANIFEST), length: 0xffffffff }],
        });
        expect(() => parseContainer(raw)).not.toThrow();
        expect(err(parseContainer(raw))).toBe("BAD_CONTAINER");
    });
});

describe("buildContainer", () => {
    const json = new TextEncoder().encode(MANIFEST);

    it("frames what parseContainer reads back", () => {
        const c = ok(parseContainer(buildContainer(json, BIN)));
        expect(c.json.length).toBe(json.length);
        expect(c.bin?.length).toBe(BIN.length);
        expect(c.unknown).toEqual([]);
    });

    it("writes a total_length equal to the file it produced", () => {
        const bytes = buildContainer(json, BIN);
        expect(new DataView(bytes.buffer).getUint32(8, true)).toBe(bytes.length);
    });

    it("pads the JSON chunk with spaces and the BIN chunk with zeros (§4.2)", () => {
        const bytes = buildContainer(json, BIN);
        const c = ok(parseContainer(bytes));
        const jsonPad = bytes.subarray(
            c.json.dataStart + c.json.length,
            c.json.dataStart + align8(c.json.length),
        );
        expect(jsonPad.length).toBeGreaterThan(0);
        expect([...jsonPad].every((b) => b === 0x20)).toBe(true);
        const binPad = bytes.subarray(
            c.bin!.dataStart + c.bin!.length,
            c.bin!.dataStart + align8(c.bin!.length),
        );
        expect(binPad.length).toBeGreaterThan(0);
        expect([...binPad].every((b) => b === 0x00)).toBe(true);
    });

    it("starts every chunk's data 8-aligned, whatever the manifest length", () => {
        for (let extra = 0; extra < 9; extra += 1) {
            const padded = new TextEncoder().encode(MANIFEST + " ".repeat(extra));
            const c = ok(parseContainer(buildContainer(padded, BIN)));
            expect(c.json.dataStart % 8).toBe(0);
            expect(c.bin!.dataStart % 8).toBe(0);
        }
    });

    it("omits the BIN chunk when given none", () => {
        expect(ok(parseContainer(buildContainer(json, null))).bin).toBeNull();
    });

    it("frames an empty BIN chunk rather than omitting it", () => {
        const c = ok(parseContainer(buildContainer(json, new Uint8Array(0))));
        expect(c.bin).not.toBeNull();
        expect(c.bin!.length).toBe(0);
    });

    it("is byte-identical for the same input", () => {
        expect(buildContainer(json, BIN)).toEqual(buildContainer(json, BIN));
    });

    it("writes a BIN chunk type parseContainer recognises as BIN, not as unknown", () => {
        const c = ok(parseContainer(buildContainer(json, BIN)));
        expect(c.bin?.type).toBe(BIN_TYPE);
        expect(c.unknown).toEqual([]);
    });
});
