/*
 *  ijson.ts
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
 * The five I-JSON checks of §5, in one pass over the manifest **text**.
 *
 * Two of them cannot be done any other way. A duplicate member name is gone
 * after parsing — the parser kept one of the two and nothing records that
 * there was another — and an integer literal outside ±(2^53 − 1) has already
 * been rounded, so `9007199254740993` is `9007199254740992` by the time it is
 * a value. The other three could be done by walking the parsed tree; doing all
 * five here is one pass instead of two.
 *
 * The scan is iterative, with an explicit stack, so pathological nesting
 * terminates rather than overflowing. (`JSON.parse` may still throw a
 * `RangeError` on such input; §6.1 step 4 makes that `BAD_MANIFEST` too, and
 * the caller catches it.)
 *
 * It rejects malformed JSON as well, which makes it a syntax check — but the
 * caller still parses inside `try`/`catch`, because agreeing with `JSON.parse`
 * on every malformed input is not something this file promises.
 */

/** The largest integer an IEEE 754 double represents exactly — check (c). */
export const MAX_EXACT_INTEGER = 9007199254740991;

export interface IJsonViolation {
    /** Where the offending value sits, e.g. `$.descriptorSets[0].params.seed`. */
    readonly path: string;
    readonly reason: string;
}

/**
 * Check (b). A string is ill-formed when a high surrogate is not followed by a
 * low one, or a low one stands alone.
 *
 * Written out rather than taken from `String.prototype.isWellFormed`, which
 * needs Node 20 while this package's `engines` floor is Node 18.
 */
export function hasUnpairedSurrogate(s: string): boolean {
    for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
            if (next < 0xdc00 || next > 0xdfff) return true;
            i += 1;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            return true;
        }
    }
    return false;
}

/**
 * Check (e). The 66 noncharacters: U+FDD0..U+FDEF, and U+xFFFE / U+xFFFF at
 * the end of every plane.
 *
 * The plane-end families are recognised through the low surrogate alone: in
 * UTF-16 the low unit of U+xFFFE is always `0xDFFE` and of U+xFFFF always
 * `0xDFFF`, whatever the plane, and no other code point pairs to either.
 *
 * Code units are compared numerically rather than matched by a regular
 * expression, so that no source file in this package has to contain a
 * noncharacter or a lone surrogate as a literal — characters that editors,
 * git filters and terminals all handle differently.
 */
export function hasNoncharacter(s: string): boolean {
    for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c >= 0xfdd0 && c <= 0xfdef) return true;
        if (c === 0xfffe || c === 0xffff) return true;
        if (c >= 0xd800 && c <= 0xdbff) {
            const low = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
            if (low === 0xdffe || low === 0xdfff) return true;
        }
    }
    return false;
}

interface Frame {
    readonly kind: "object" | "array";
    /** Path of this container itself. */
    readonly path: string;
    /** Names seen so far; `null` for an array. Check (a). */
    readonly names: Set<string> | null;
    /** Path of the member currently being read, for reporting. */
    member: string;
    index: number;
}

// Sticky, so scanning a number costs its own length rather than a slice of the
// rest of the manifest.
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
};

type StringRead = { readonly value: string } | { readonly violation: string };

export function scanIJson(text: string): IJsonViolation | null {
    const n = text.length;
    let i = 0;
    const stack: Frame[] = [];

    const here = (): string =>
        stack.length === 0 ? "$" : stack[stack.length - 1]!.member;
    const bad = (reason: string): IJsonViolation => ({ path: here(), reason });

    const skipWs = (): void => {
        while (i < n) {
            const c = text.charCodeAt(i);
            if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) break;
            i += 1;
        }
    };

    /** Reads the string at `text[i] === '"'`, returning its unescaped value. */
    const readString = (): StringRead => {
        i += 1;
        let out = "";
        for (;;) {
            if (i >= n) return { violation: "unterminated string" };
            const c = text.charCodeAt(i);
            if (c === 0x22) {
                i += 1;
                return { value: out };
            }
            if (c === 0x5c) {
                i += 1;
                if (i >= n) return { violation: "unterminated escape" };
                const e = text[i]!;
                i += 1;
                if (e === "u") {
                    const hex = text.slice(i, i + 4);
                    if (hex.length < 4 || !HEX4.test(hex)) {
                        return { violation: "malformed unicode escape" };
                    }
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                } else {
                    const simple = SIMPLE_ESCAPES[e];
                    if (simple === undefined) {
                        return { violation: `invalid escape: ${e}` };
                    }
                    out += simple;
                }
                continue;
            }
            if (c < 0x20) return { violation: "raw control character in a string" };
            out += text[i]!;
            i += 1;
        }
    };

    /** Checks (b) and (e) on an unescaped string, name or value alike. */
    const checkString = (s: string): string | null => {
        if (hasUnpairedSurrogate(s)) {
            return "string contains an unpaired surrogate (§5 check b)";
        }
        if (hasNoncharacter(s)) {
            return "string contains a Unicode noncharacter (§5 check e)";
        }
        return null;
    };

    const literal = (word: string): boolean => {
        if (text.startsWith(word, i)) {
            i += word.length;
            return true;
        }
        return false;
    };

    /**
     * Reads one value at `i`. `"opened"` means a non-empty container was
     * entered and its frame is now on the stack; `"closed"` means the value is
     * complete.
     */
    const readValue = (): IJsonViolation | "opened" | "closed" => {
        if (i >= n) return bad("unexpected end of input");
        const c = text[i]!;
        if (c === "{" || c === "[") {
            const kind = c === "{" ? "object" : "array";
            const path = here();
            i += 1;
            skipWs();
            if (i < n && text[i] === (kind === "object" ? "}" : "]")) {
                i += 1;
                return "closed";
            }
            stack.push({
                kind,
                path,
                names: kind === "object" ? new Set<string>() : null,
                member: path,
                index: 0,
            });
            return "opened";
        }
        if (c === '"') {
            const s = readString();
            if ("violation" in s) return bad(s.violation);
            const problem = checkString(s.value);
            return problem === null ? "closed" : bad(problem);
        }
        if (c === "t") return literal("true") ? "closed" : bad("invalid literal");
        if (c === "f") return literal("false") ? "closed" : bad("invalid literal");
        if (c === "n") return literal("null") ? "closed" : bad("invalid literal");

        NUMBER.lastIndex = i;
        const m = NUMBER.exec(text);
        if (m === null || m.index !== i) return bad("invalid value");
        const lit = m[0];
        i = NUMBER.lastIndex;
        if (INTEGER.test(lit)) {
            const v = BigInt(lit);
            if (v > BigInt(MAX_EXACT_INTEGER) || v < -BigInt(MAX_EXACT_INTEGER)) {
                return bad(
                    `integer literal ${lit} is outside the exactly representable range (§5 check c)`,
                );
            }
        }
        if (!Number.isFinite(Number(lit))) {
            return bad(`number literal ${lit} rounds to infinity (§5 check d)`);
        }
        return "closed";
    };

    /** Reads `"name" :` into the frame on top of the stack. */
    const readMember = (): IJsonViolation | null => {
        const frame = stack[stack.length - 1]!;
        skipWs();
        if (i >= n || text[i] !== '"') {
            return { path: frame.path, reason: "expected a member name" };
        }
        const s = readString();
        if ("violation" in s) return { path: frame.path, reason: s.violation };
        const problem = checkString(s.value);
        if (problem !== null) return { path: frame.path, reason: problem };
        if (frame.names!.has(s.value)) {
            return {
                path: frame.path,
                reason: `duplicate member name "${s.value}" (§5 check a)`,
            };
        }
        frame.names!.add(s.value);
        frame.member = `${frame.path}.${s.value}`;
        skipWs();
        if (i >= n || text[i] !== ":") {
            return { path: frame.member, reason: "expected ':'" };
        }
        i += 1;
        return null;
    };

    // Two states, which is what keeps the loop flat: a value is expected at
    // `i`, or the value just read is complete and the enclosing container
    // decides what follows.
    let mode: "value" | "after" = "value";
    for (;;) {
        if (mode === "value") {
            skipWs();
            const r = readValue();
            if (typeof r === "object") return r;
            if (r === "opened") {
                const frame = stack[stack.length - 1]!;
                if (frame.kind === "object") {
                    const v = readMember();
                    if (v !== null) return v;
                } else {
                    frame.member = `${frame.path}[0]`;
                }
                continue; // still "value": the member's own value comes next
            }
            mode = "after";
            continue;
        }

        if (stack.length === 0) break;
        const frame = stack[stack.length - 1]!;
        skipWs();
        if (i >= n) return { path: frame.path, reason: "unexpected end of input" };
        const c = text[i]!;
        const close = frame.kind === "object" ? "}" : "]";
        if (c === close) {
            i += 1;
            stack.pop();
            continue; // still "after": the container is itself a finished value
        }
        if (c !== ",") {
            return { path: frame.member, reason: `expected ',' or '${close}'` };
        }
        i += 1;
        if (frame.kind === "object") {
            const v = readMember();
            if (v !== null) return v;
        } else {
            frame.index += 1;
            frame.member = `${frame.path}[${frame.index}]`;
        }
        mode = "value";
    }

    skipWs();
    if (i !== n) {
        return { path: "$", reason: "trailing content after the top-level value" };
    }
    return null;
}
