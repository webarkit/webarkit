/*
 *  encode.test.ts
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
import { encode } from "../../../src/target/format/encode.js";
import type { TargetDb } from "../../../src/index.js";
import { good, goodBitsSet, withParam } from "./targets.js";

const bytesOf = (r: ReturnType<typeof encode>): Uint8Array => {
    if (!r.ok) throw new Error(`expected ok, got ${r.error}: ${r.detail}`);
    return r.bytes;
};

/** The manifest text of an encoded target, padding stripped. */
const manifestOf = (target: TargetDb): string => {
    const bytes = bytesOf(encode(target));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getUint32(16, true);
    return new TextDecoder().decode(bytes.subarray(32, 32 + length));
};

describe("encode — refusal (§7.3)", () => {
    it("returns INVALID_TARGET and no bytes for a rejected target", () => {
        const r = encode(withParam(Number.NaN));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toBe("INVALID_TARGET");
        expect(r.detail).toBe("descriptorSets[0].params.seed");
        expect("bytes" in r).toBe(false);
    });

    it("refuses a target with no descriptor set", () => {
        const r = encode({ ...good(), descriptorSets: [] });
        expect(!r.ok && r.error).toBe("INVALID_TARGET");
    });

    it("refuses each of the §8.2 item 7 values, through the public entry point", () => {
        for (const value of [
            String.fromCharCode(0xd800),
            9007199254740992,
            Number.POSITIVE_INFINITY,
            String.fromCharCode(0xffff),
            Number.NaN,
        ]) {
            const r = encode(withParam(value));
            expect(r.ok, String(value)).toBe(false);
            if (r.ok) continue;
            expect(r.error).toBe("INVALID_TARGET");
            expect(r.detail).toBe("descriptorSets[0].params.seed");
        }
    });
});

describe("encode — the file it produces", () => {
    it("decodes back to the same target", () => {
        const t = good();
        const r = decode(bytesOf(encode(t)));
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        if (!r.ok) return;
        expect(r.warnings).toEqual([]);
        expect(r.target).toEqual(t);
    });

    it("round-trips a target with every optional section", () => {
        const t: TargetDb = {
            ...good(),
            generator: "test 1.0",
            meta: { widthPx: 8, heightPx: 4, physicalSizeMm: [80, 40] },
            keypoints: { ...good().keypoints, size: new Float32Array([7]) },
            patches: {
                patchSize: 2,
                count: 1,
                score: new Float32Array([1]),
                left: new Uint16Array([0]),
                top: new Uint16Array([0]),
                level: new Uint8Array([0]),
                pixels: new Uint8Array([1, 2, 3, 4]),
            },
            referenceImage: {
                level: 0,
                width: 8,
                height: 4,
                pixels: new Uint8Array(32),
            },
            info: { name: "x", compiler: { seed: 42 } },
        };
        const r = decode(bytesOf(encode(t)));
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        if (!r.ok) return;
        expect(r.target).toEqual(t);
    });

    it("is byte-identical for the same target", () => {
        expect(bytesOf(encode(good()))).toEqual(bytesOf(encode(good())));
    });

    it("puts the manifest keys in the specification's order (§7.3)", () => {
        const order = [...manifestOf(good()).matchAll(/"([a-zA-Z]+)":/g)].map(
            (m) => m[1],
        );
        let at = -1;
        for (const key of [
            "format",
            "meta",
            "pyramid",
            "keypoints",
            "descriptorSets",
            "accessors",
        ]) {
            const next = order.indexOf(key);
            expect(next, key).toBeGreaterThan(at);
            at = next;
        }
    });

    it("omits empty optional objects and arrays (§7.3)", () => {
        const text = manifestOf(good());
        expect(text).not.toContain('"extensionsUsed"');
        expect(text).not.toContain('"extensionsRequired"');
        expect(text).not.toContain('"params"');
        expect(text).not.toContain('"generator"');
        expect(text).not.toContain('"patches"');
        expect(text).not.toContain('"info"');
    });

    it("starts every accessor at a multiple of 8 (§7.3)", () => {
        for (const m of manifestOf(good()).matchAll(/"offset":(\d+)/g)) {
            expect(Number(m[1]) % 8).toBe(0);
        }
    });

    it("sorts descriptorSets by kind, norm, dimensions, producer (§7.3)", () => {
        const t = good();
        const second = { ...goodBitsSet(), kind: "akaze" as const };
        const text = manifestOf({ ...t, descriptorSets: [goodBitsSet(), second] });
        expect(text.indexOf('"akaze"')).toBeLessThan(text.indexOf('"orb"'));
    });

    it("sorts params keys by code point, not by JavaScript's key order", () => {
        const t = good();
        const text = manifestOf({
            ...t,
            descriptorSets: [
                { ...goodBitsSet(), params: { 9: 1, 10: 2, b: 3, a: 4 } },
            ],
        });
        const params = text.slice(text.indexOf('"params":'));
        expect(params.indexOf('"10"')).toBeLessThan(params.indexOf('"9"'));
        expect(params.indexOf('"a"')).toBeLessThan(params.indexOf('"b"'));
    });

    it("writes no insignificant whitespace in the manifest", () => {
        expect(manifestOf(good())).not.toMatch(/[:,]\s/);
    });

    it("round-trips 2^53 − 1 in params exactly", () => {
        const t = withParam(9007199254740991);
        const r = decode(bytesOf(encode(t)));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.target.descriptorSets[0]!.params["seed"]).toBe(9007199254740991);
    });

    it("re-encodes what it decoded to the very same bytes", () => {
        const first = bytesOf(encode(good()));
        const r = decode(first);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(bytesOf(encode(r.target))).toEqual(first);
    });
});
