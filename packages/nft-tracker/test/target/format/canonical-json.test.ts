/*
 *  canonical-json.test.ts
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
    canonicalJson,
    compareByCodePoint,
    jsonNumber,
} from "../../../src/target/format/canonical-json.js";

describe("compareByCodePoint", () => {
    it("orders ASCII by code point, not alphabetically", () => {
        expect(["b", "a", "C"].sort(compareByCodePoint).join("")).toBe("Cab");
    });

    it("puts a shorter string before its own extension", () => {
        expect(["ab", "a"].sort(compareByCodePoint)).toEqual(["a", "ab"]);
    });

    it('puts "10" before "9", unlike JavaScript\'s own key order (§7.3)', () => {
        expect(["9", "10"].sort(compareByCodePoint)).toEqual(["10", "9"]);
        // The trap itself, so the reason this function exists stays visible.
        expect(JSON.stringify({ 10: "a", 9: "b" })).toBe('{"9":"b","10":"a"}');
    });

    it("orders by code point, not by UTF-16 code unit", () => {
        const bmp = String.fromCharCode(0xfffd);
        const astral = String.fromCodePoint(0x10000);
        expect([bmp, astral].sort(compareByCodePoint)).toEqual([bmp, astral]);
        // The default comparator disagrees, which is the other reason.
        expect([bmp, astral].sort()).toEqual([astral, bmp]);
    });

    it("reports equality", () => {
        expect(compareByCodePoint("x", "x")).toBe(0);
        expect(compareByCodePoint("", "")).toBe(0);
    });
});

describe("canonicalJson", () => {
    it("emits no insignificant whitespace", () => {
        expect(canonicalJson({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
    });

    it("sorts object keys by code point, recursively", () => {
        expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
        expect(canonicalJson({ x: { 9: 1, 10: 2 } })).toBe('{"x":{"10":2,"9":1}}');
        expect(canonicalJson({ z: { b: { d: 1, c: 2 } }, a: 0 })).toBe(
            '{"a":0,"z":{"b":{"c":2,"d":1}}}',
        );
    });

    it("does not sort arrays", () => {
        expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    });

    it("emits the scalar forms", () => {
        expect(canonicalJson(null)).toBe("null");
        expect(canonicalJson(true)).toBe("true");
        expect(canonicalJson(false)).toBe("false");
        expect(canonicalJson("s")).toBe('"s"');
        expect(canonicalJson(0)).toBe("0");
        expect(canonicalJson(-1.5)).toBe("-1.5");
    });

    it("emits empty containers", () => {
        expect(canonicalJson({})).toBe("{}");
        expect(canonicalJson([])).toBe("[]");
    });

    it("round-trips through JSON.parse with the same values", () => {
        const v = { z: [1, { b: "x", a: null }], 10: true, 9: 1.25 };
        expect(JSON.parse(canonicalJson(v))).toEqual(v);
    });

    it("is byte-identical for two objects built in a different key order", () => {
        expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    });

    it("keeps 2^53 − 1 exact", () => {
        expect(canonicalJson({ seed: 9007199254740991 })).toBe(
            '{"seed":9007199254740991}',
        );
    });
});

describe("jsonNumber", () => {
    it("emits finite numbers", () => {
        expect(jsonNumber(1)).toBe("1");
        expect(jsonNumber(1.2599210498948732)).toBe("1.2599210498948732");
        expect(jsonNumber(-0)).toBe("0");
    });

    it("throws on NaN and the infinities rather than coercing them (§7.3)", () => {
        expect(() => jsonNumber(Number.NaN)).toThrow();
        expect(() => jsonNumber(Number.POSITIVE_INFINITY)).toThrow();
        expect(() => jsonNumber(Number.NEGATIVE_INFINITY)).toThrow();
        // What it refuses to do: JSON.stringify would silently write null.
        expect(JSON.stringify(Number.NaN)).toBe("null");
    });
});
