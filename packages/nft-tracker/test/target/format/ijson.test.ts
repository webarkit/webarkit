/*
 *  ijson.test.ts
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
    hasNoncharacter,
    hasUnpairedSurrogate,
    MAX_EXACT_INTEGER,
    scanIJson,
} from "../../../src/target/format/ijson.js";

/**
 * A single backslash, and the code points below, are **built** rather than
 * typed.
 *
 * This suite is about how a reader treats escapes, lone surrogates and
 * noncharacters, so the one thing it must not do is depend on an editor, a
 * git filter or a terminal preserving such characters in its own source. Every
 * input below is assembled from a number.
 */
const BS = String.fromCharCode(92);

/** The JSON text `{"x":"<escapes>"}` carrying `\uXXXX` escapes. */
const escaped = (...hex: string[]): string =>
    `{"x":"${hex.map((h) => `${BS}u${h}`).join("")}"}`;

/** The JSON text `{"x":"<raw code point>"}`. */
const raw = (cp: number): string => `{"x":"${String.fromCodePoint(cp)}"}`;

const reason = (text: string): string | null => scanIJson(text)?.reason ?? null;

describe("scanIJson — accepts conforming I-JSON", () => {
    it("accepts the manifest shapes the specification shows", () => {
        expect(
            scanIJson(
                '{"format":{"version":"0.2"},"accessors":[{"offset":0,"count":3,"type":"f32"}]}',
            ),
        ).toBeNull();
        expect(scanIJson('{"a":[1,-2,3.5,true,false,null,""],"b":{}}')).toBeNull();
        expect(scanIJson('{"a":[{"b":{}},[],{}],"c":[[[]]]}')).toBeNull();
        expect(scanIJson('  {"a" : 1 , "b" : [ 2 ] }  ')).toBeNull();
    });

    it("accepts 2^53 − 1, the boundary §8.1 requires to decode", () => {
        expect(scanIJson('{"seed":9007199254740991}')).toBeNull();
        expect(scanIJson('{"seed":-9007199254740991}')).toBeNull();
        expect(MAX_EXACT_INTEGER).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("accepts a literal rounding to zero — every parser reads 0 (§5 d)", () => {
        expect(scanIJson('{"x":1e-400}')).toBeNull();
    });

    it("accepts a big magnitude written with an exponent or a fraction", () => {
        expect(scanIJson('{"x":1e20}')).toBeNull();
        expect(scanIJson('{"x":9007199254740993.0}')).toBeNull();
    });

    it("accepts a well-formed surrogate pair written as escapes", () => {
        expect(scanIJson(escaped("D83D", "DE00"))).toBeNull();
    });

    it("accepts the code point just past the U+FDD0..U+FDEF block", () => {
        expect(scanIJson(raw(0xfdf0))).toBeNull();
    });
});

describe("scanIJson — check (a), duplicate member names", () => {
    it("rejects a repeated name", () => {
        expect(reason('{"a":1,"a":2}')).toMatch(/duplicate/i);
    });

    it("rejects the same name written two ways, compared after unescaping", () => {
        expect(reason(`{"a":1,"${BS}u0061":2}`)).toMatch(/duplicate/i);
    });

    it("rejects a duplicate nested inside params, and names the object", () => {
        const v = scanIJson('{"params":{"k":1,"k":2}}');
        expect(v?.reason).toMatch(/duplicate/i);
        expect(v?.path).toBe("$.params");
    });

    it("allows the same name in two different objects", () => {
        expect(scanIJson('{"a":{"k":1},"b":{"k":2}}')).toBeNull();
    });
});

describe("scanIJson — check (b), unpaired surrogate escapes", () => {
    it("rejects a lone high surrogate", () => {
        expect(reason(escaped("D800"))).toMatch(/surrogate/i);
    });

    it("rejects a lone low surrogate", () => {
        expect(reason(escaped("DC00"))).toMatch(/surrogate/i);
    });

    it("rejects a high surrogate followed by another high surrogate", () => {
        expect(reason(escaped("D800", "D800"))).toMatch(/surrogate/i);
    });

    it("rejects one in a member name", () => {
        expect(reason(`{"${BS}uD800":1}`)).toMatch(/surrogate/i);
    });
});

describe("scanIJson — check (c), integer literals beyond ±(2^53 − 1)", () => {
    it("rejects 2^53 and −2^53", () => {
        expect(reason('{"seed":9007199254740992}')).toMatch(/integer/i);
        expect(reason('{"seed":-9007199254740992}')).toMatch(/integer/i);
    });

    it("rejects the value that would collapse onto 2^53", () => {
        expect(reason('{"seed":9007199254740993}')).toMatch(/integer/i);
    });

    it("rejects an integer literal far past any double", () => {
        expect(reason(`{"seed":${"9".repeat(400)}}`)).toMatch(/integer/i);
    });
});

describe("scanIJson — check (d), literals rounding to infinity", () => {
    it("rejects 1e400, -1e400 and 1.5e400", () => {
        expect(reason('{"x":1e400}')).toMatch(/infinit/i);
        expect(reason('{"x":-1e400}')).toMatch(/infinit/i);
        expect(reason('{"x":1.5e400}')).toMatch(/infinit/i);
    });
});

describe("scanIJson — check (e), Unicode noncharacters", () => {
    it("rejects a raw U+FFFF and U+FFFE, which strict UTF-8 accepts", () => {
        expect(reason(raw(0xffff))).toMatch(/noncharacter/i);
        expect(reason(raw(0xfffe))).toMatch(/noncharacter/i);
    });

    it("rejects the ends of the U+FDD0..U+FDEF block", () => {
        expect(reason(raw(0xfdd0))).toMatch(/noncharacter/i);
        expect(reason(raw(0xfdef))).toMatch(/noncharacter/i);
    });

    it("rejects an escaped U+FDD0 in a member name", () => {
        expect(reason(`{"${BS}uFDD0":1}`)).toMatch(/noncharacter/i);
    });

    it("rejects a plane-end noncharacter, raw or escaped", () => {
        expect(reason(raw(0x1ffff))).toMatch(/noncharacter/i);
        expect(reason(raw(0x10fffe))).toMatch(/noncharacter/i);
        expect(reason(escaped("D83F", "DFFF"))).toMatch(/noncharacter/i);
    });
});

describe("scanIJson — syntax and termination", () => {
    it("rejects malformed JSON without throwing", () => {
        const bad = [
            "",
            "{",
            "}",
            "[1,]",
            '{"a"}',
            '{"a":}',
            "{a:1}",
            "'x'",
            "01",
            "+1",
            ".5",
            "1.",
            "tru",
            '{"a":1}x',
            "[1 2]",
            '{"a":1 "b":2}',
            "[",
            '{"a"',
            '{"a":1,}',
            "nul",
            "[,]",
            "{]",
            "--1",
            "1e",
            "0x1",
            "[1]]",
        ];
        for (const s of bad) expect(scanIJson(s), JSON.stringify(s)).not.toBeNull();
    });

    it("rejects a raw control character inside a string", () => {
        expect(scanIJson(`{"a":"${String.fromCharCode(1)}"}`)).not.toBeNull();
    });

    it("rejects an invalid escape", () => {
        expect(scanIJson(`{"a":"${BS}q"}`)).not.toBeNull();
    });

    it("never accepts text JSON.parse rejects", () => {
        const corpus = [
            '{"a":1}',
            "[1,2,3]",
            '"s"',
            "1",
            "true",
            "null",
            '{"a":[{"b":{}}]}',
            '{"a":1,}',
            "[,]",
            "{]",
            "--1",
            "1e",
            "0x1",
            "[1]]",
            "01",
            ".5",
            "1.",
        ];
        for (const s of corpus) {
            let parses = true;
            try {
                JSON.parse(s);
            } catch {
                parses = false;
            }
            if (!parses) expect(scanIJson(s), JSON.stringify(s)).not.toBeNull();
        }
    });

    it("terminates on deep nesting instead of overflowing the stack", () => {
        expect(scanIJson("[".repeat(200_000) + "]".repeat(200_000))).toBeNull();
        expect(scanIJson('{"a":'.repeat(50_000) + "1" + "}".repeat(50_000))).toBeNull();
    });

    it("reports the path of the offending value", () => {
        expect(scanIJson('{"descriptorSets":[{"params":{"seed":1e400}}]}')?.path).toBe(
            "$.descriptorSets[0].params.seed",
        );
        expect(scanIJson('{"a":[1,2,1e400]}')?.path).toBe("$.a[2]");
    });
});

describe("the helpers the writer reuses on in-memory values", () => {
    it("hasUnpairedSurrogate agrees with well-formedness", () => {
        expect(hasUnpairedSurrogate("ok")).toBe(false);
        expect(hasUnpairedSurrogate(String.fromCodePoint(0x1f600))).toBe(false);
        expect(hasUnpairedSurrogate(String.fromCharCode(0xd800))).toBe(true);
        expect(hasUnpairedSurrogate(`${String.fromCharCode(0xdc00)}x`)).toBe(true);
    });

    it("hasNoncharacter finds every family §5 (e) lists", () => {
        expect(hasNoncharacter("plain")).toBe(false);
        expect(hasNoncharacter(String.fromCharCode(0xfdd0))).toBe(true);
        expect(hasNoncharacter(String.fromCharCode(0xfdef))).toBe(true);
        expect(hasNoncharacter(String.fromCharCode(0xfdf0))).toBe(false);
        expect(hasNoncharacter(String.fromCharCode(0xfffe))).toBe(true);
        expect(hasNoncharacter(String.fromCharCode(0xffff))).toBe(true);
        expect(hasNoncharacter(String.fromCodePoint(0x1fffe))).toBe(true);
        expect(hasNoncharacter(String.fromCodePoint(0x10ffff))).toBe(true);
        expect(hasNoncharacter(String.fromCodePoint(0x1f600))).toBe(false);
    });
});
