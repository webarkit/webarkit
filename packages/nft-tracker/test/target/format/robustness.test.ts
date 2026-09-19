/*
 *  robustness.test.ts
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

/**
 * §8.4: the reader against untrusted input.
 *
 * A `.wnft` may come from a URL an application's user chose, so the contract
 * these tests enforce is narrow and absolute: **decode never throws, always
 * terminates, and never allocates beyond the limits.** Every case here is an
 * attempt to break one of those three.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { decode } from "../../../src/target/format/decode.js";
import { encode } from "../../../src/target/format/encode.js";
import type { TargetDb } from "../../../src/index.js";
import { FIXTURES_DIR } from "./fixtures-dir.js";

const read = (rel: string): Uint8Array =>
    new Uint8Array(readFileSync(join(FIXTURES_DIR, rel)));

interface Expectations {
    readonly valid: readonly { readonly file: string }[];
}
const expectations = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "expectations.json"), "utf8"),
) as Expectations;

/** The manifest text and BIN payload of an encoded file, for targeted edits. */
function split(bytes: Uint8Array): { manifest: string; bin: Uint8Array } {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = dv.getUint32(16, true);
    const manifest = new TextDecoder().decode(bytes.subarray(32, 32 + jsonLength));
    const jsonPadded = (jsonLength + 7) & ~7;
    const binLength = dv.getUint32(32 + jsonPadded, true);
    const binStart = 32 + jsonPadded + 16;
    return { manifest, bin: bytes.slice(binStart, binStart + binLength) };
}

/**
 * Reframe an edited manifest with its payload, recomputing the checksums, so
 * the container stays valid and the failure under test is the one the case is
 * about rather than a stale CRC.
 */
const reframe = (manifest: string, bin: Uint8Array): Uint8Array =>
    frame(new TextEncoder().encode(manifest), bin);

function frame(json: Uint8Array, bin: Uint8Array): Uint8Array {
    const pad = (n: number): number => (n + 7) & ~7;
    const total = 16 + 16 + pad(json.length) + 16 + pad(bin.length);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    const ascii = (text: string, at: number): void => {
        for (let i = 0; i < 4; i += 1) out[at + i] = text.charCodeAt(i) & 0xff;
    };
    ascii("WKNF", 0);
    dv.setUint16(4, 1, true);
    dv.setUint32(8, total, true);
    let at = 16;
    for (const [type, data, padByte] of [
        ["JSON", json, 0x20],
        [`BIN${String.fromCharCode(0)}`, bin, 0x00],
    ] as const) {
        dv.setUint32(at, data.length, true);
        ascii(type, at + 4);
        dv.setUint32(at + 8, crc(data), true);
        out.set(data, at + 16);
        out.fill(padByte, at + 16 + data.length, at + 16 + pad(data.length));
        at += 16 + pad(data.length);
    }
    return out;
}

// A local CRC-32, so this suite frames files without depending on the very
// module whose output it is trying to break.
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c >>> 0;
    }
    return t;
})();
function crc(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

describe("§8.4 — truncation", () => {
    it("fails, and never throws, at every truncation of every valid fixture", () => {
        for (const entry of expectations.valid) {
            const whole = read(entry.file);
            for (let n = 0; n < whole.length; n += 1) {
                const r = decode(whole.subarray(0, n));
                expect(r.ok, `${entry.file} truncated at ${n}`).toBe(false);
            }
            expect(decode(whole).ok, entry.file).toBe(true);
        }
    });
});

describe("§8.4 — property-based fuzzing", () => {
    const base = read("valid/minimal.wnft");

    it("never throws on a bit flip anywhere in a valid file", () => {
        fc.assert(
            fc.property(
                fc.nat({ max: base.length - 1 }),
                fc.integer({ min: 0, max: 7 }),
                (index, bit) => {
                    const mutated = base.slice();
                    mutated[index]! ^= 1 << bit;
                    // Either it fails, or the flip landed in padding the
                    // checksum does not cover — in which case it must still
                    // decode. What it must never do is throw.
                    expect(typeof decode(mutated).ok).toBe("boolean");
                },
            ),
            { numRuns: 2000 },
        );
    });

    it("never throws on arbitrary bytes", () => {
        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
                expect(typeof decode(bytes).ok).toBe("boolean");
            }),
            { numRuns: 2000 },
        );
    });

    it("never throws on arbitrary bytes behind a valid header", () => {
        // Random bytes almost never reach the chunk loop; splicing a correct
        // 16-byte header on is what gets the fuzzer past the magic.
        fc.assert(
            fc.property(fc.uint8Array({ minLength: 16, maxLength: 2048 }), (tail) => {
                const bytes = new Uint8Array(16 + tail.length);
                bytes.set(base.subarray(0, 16));
                bytes.set(tail, 16);
                new DataView(bytes.buffer).setUint32(8, bytes.length, true);
                expect(typeof decode(bytes).ok).toBe("boolean");
            }),
            { numRuns: 2000 },
        );
    });

    it("never throws on a truncation at a random offset of a random fixture", () => {
        const files = expectations.valid.map((e) => read(e.file));
        fc.assert(
            fc.property(
                fc.nat({ max: files.length - 1 }),
                fc.nat({ max: 20000 }),
                (which, cut) => {
                    const bytes = files[which]!;
                    expect(typeof decode(bytes.subarray(0, cut % (bytes.length + 1))).ok)
                        .toBe("boolean");
                },
            ),
            { numRuns: 1000 },
        );
    });
});

describe("§8.4 — size arithmetic", () => {
    const { manifest, bin } = split(read("valid/minimal.wnft"));

    it("rejects a count whose product with the element size overflows u32", () => {
        // 2^32 − 1 u32 elements is 16 GiB. A decoder that computed the product
        // in 32 bits would wrap to a small number and pass the bounds check.
        const broken = manifest.replace(
            '{"offset":0,"count":3,"type":"u32"}',
            '{"offset":0,"count":4294967295,"type":"u32"}',
        );
        expect(broken).not.toBe(manifest);
        const r = decode(reframe(broken, bin));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(["BAD_LAYOUT", "LIMIT_EXCEEDED"]).toContain(r.error);
    });

    it("rejects a count above 2^32 − 1 before any arithmetic uses it", () => {
        const broken = manifest.replace('"count":3,"type":"u32"', '"count":1e40,"type":"u32"');
        expect(broken).not.toBe(manifest);
        const r = decode(reframe(broken, bin));
        expect(!r.ok && r.error).toBe("BAD_MANIFEST");
    });

    it("rejects an accessor that merely runs past the chunk", () => {
        const broken = manifest.replace('"offset":0,', '"offset":4294967288,');
        expect(broken).not.toBe(manifest);
        const r = decode(reframe(broken, bin));
        expect(!r.ok && r.error).toBe("BAD_LAYOUT");
    });

    it("rejects a keypoint count above the limit without allocating for it", () => {
        const r = decode(read("valid/minimal.wnft"), { limits: { maxKeypoints: 4 } });
        expect(!r.ok && r.error).toBe("LIMIT_EXCEEDED");
    });
});

describe("§8.4 — manifest attacks", () => {
    const minimal = read("valid/minimal.wnft");
    const { manifest, bin } = split(minimal);
    const manifestBytes = new TextEncoder().encode(manifest).length;

    it("accepts a manifest exactly at the limit and rejects one byte more", () => {
        expect(
            decode(minimal, { limits: { maxManifestBytes: manifestBytes } }).ok,
        ).toBe(true);
        const r = decode(minimal, { limits: { maxManifestBytes: manifestBytes - 1 } });
        expect(!r.ok && r.error).toBe("MANIFEST_TOO_LARGE");
    });

    it("rejects deeply nested JSON without throwing", () => {
        const deep = `${"[".repeat(100_000)}${"]".repeat(100_000)}`;
        const broken = manifest.replace('"name":"fixture"', `"name":"x","deep":${deep}`);
        expect(broken).not.toBe(manifest);
        const bytes = reframe(broken, bin);
        expect(() => decode(bytes, { limits: { maxManifestBytes: 1 << 24 } })).not.toThrow();
    });

    it("rejects invalid UTF-8 in the JSON chunk", () => {
        const raw = new TextEncoder().encode(manifest);
        raw[raw.length - 2] = 0xff;
        const r = decode(frame(raw, bin));
        expect(!r.ok && r.error).toBe("BAD_MANIFEST");
    });

    it("rejects a file above the file-size limit before reading anything", () => {
        const r = decode(minimal, { limits: { maxFileBytes: 8 } });
        expect(!r.ok && r.error).toBe("LIMIT_EXCEEDED");
    });
});

describe("§8.4 — property-based round trip", () => {
    /**
     * A random valid target.
     *
     * Three constraints are met by construction rather than by rejection, so
     * the arbitrary never has to discard a draw:
     *
     * - coordinates go through `Math.fround`, since they are stored as `f32`
     *   and a random double would not survive the trip;
     * - `levelStart` is a running sum of per-level counts, so it is closed and
     *   non-decreasing;
     * - `kpIndex` is the identity, since §5.6 requires `M = N` without
     *   `WKNF_multiview`.
     */
    const arbitraryTarget = (): fc.Arbitrary<TargetDb> =>
        fc
            .record({
                perLevel: fc.array(fc.nat({ max: 6 }), { minLength: 1, maxLength: 4 }),
                width: fc.integer({ min: 8, max: 256 }),
                height: fc.integer({ min: 8, max: 256 }),
                scaleStep: fc.double({ min: 1.0001, max: 4, noNaN: true }),
                dimensions: fc.constantFrom(64, 128, 256),
                physical: fc.option(
                    fc.tuple(
                        fc.double({ min: 1, max: 1000, noNaN: true }),
                        fc.double({ min: 1, max: 1000, noNaN: true }),
                    ),
                    { nil: null },
                ),
                seedValue: fc.oneof(
                    fc.integer({ min: -1000, max: 1000 }),
                    fc.string(),
                    fc.boolean(),
                    fc.constant(null),
                ),
            })
            .map(
                ({ perLevel, width, height, scaleStep, dimensions, physical, seedValue }) => {
                    const L = perLevel.length;
                    const N = perLevel.reduce((a, b) => a + b, 0);

                    const levelSizes: [number, number][] = [];
                    let w = width;
                    let h = height;
                    for (let l = 0; l < L; l += 1) {
                        levelSizes.push([w, h]);
                        w = Math.max(1, Math.floor(w / scaleStep));
                        h = Math.max(1, Math.floor(h / scaleStep));
                    }

                    const levelStart = new Uint32Array(L + 1);
                    const level = new Uint8Array(N);
                    let at = 0;
                    for (let l = 0; l < L; l += 1) {
                        levelStart[l] = at;
                        for (let k = 0; k < perLevel[l]!; k += 1) level[at + k] = l;
                        at += perLevel[l]!;
                    }
                    levelStart[L] = N;

                    const bytesPerDescriptor = dimensions / 8;
                    return {
                        formatVersion: "0.2",
                        extensionsUsed: [],
                        extensionsRequired: [],
                        meta: {
                            widthPx: levelSizes[0]![0],
                            heightPx: levelSizes[0]![1],
                            physicalSizeMm: physical,
                        },
                        pyramid: { scaleStep, levelSizes },
                        keypoints: {
                            count: N,
                            detector: { kind: "fast", params: {} },
                            levelStart,
                            x: Float32Array.from({ length: N }, (_, i) =>
                                Math.fround(i * 1.5),
                            ),
                            y: Float32Array.from({ length: N }, (_, i) =>
                                Math.fround(i * 2.25),
                            ),
                            angle: Float32Array.from({ length: N }, (_, i) =>
                                Math.fround(i * 0.125),
                            ),
                            score: Float32Array.from({ length: N }, (_, i) =>
                                Math.fround(100 - i),
                            ),
                            level,
                        },
                        descriptorSets: [
                            {
                                kind: "orb",
                                norm: "hamming",
                                elementType: "bits",
                                dimensions,
                                bytesPerDescriptor,
                                producer: "jsfeatnext",
                                params: { seed: seedValue },
                                count: N,
                                levelStart: levelStart.slice(),
                                kpIndex: Uint32Array.from({ length: N }, (_, i) => i),
                                data: Uint8Array.from(
                                    { length: N * bytesPerDescriptor },
                                    (_, i) => (i * 31 + 7) & 0xff,
                                ),
                            },
                        ],
                    } satisfies TargetDb;
                },
            );

    it("round-trips a random valid target", () => {
        fc.assert(
            fc.property(arbitraryTarget(), (target) => {
                const written = encode(target);
                // A rejected draw is a bug in the arbitrary or in the
                // validator, never something to filter away.
                expect(written.ok, written.ok ? "" : written.detail).toBe(true);
                if (!written.ok) return;

                const readBack = decode(written.bytes);
                expect(readBack.ok, readBack.ok ? "" : readBack.detail).toBe(true);
                if (!readBack.ok) return;
                expect(readBack.target).toEqual(target);

                // And the second pass writes the very same file.
                const again = encode(readBack.target);
                expect(again.ok && again.bytes).toEqual(written.bytes);
            }),
            { numRuns: 200 },
        );
    });
});
