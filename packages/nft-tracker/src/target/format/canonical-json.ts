/*
 *  canonical-json.ts
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
 * Canonical serialisation (§7.3): the same content must always produce the
 * same bytes.
 *
 * Two traps make that harder than `JSON.stringify`, and both are pinned by a
 * test in this module's suite:
 *
 * - `JSON.stringify({ 10: "a", 9: "b" })` yields `{"9":"b","10":"a"}`.
 *   JavaScript enumerates integer-like keys numerically and first, while §7.3
 *   requires Unicode code-point order, which puts `"10"` before `"9"`. This is
 *   the trap §7.3's own note to TypeScript implementers warns about.
 * - The default array comparator orders by UTF-16 **code unit**, so a
 *   character whose first unit is a high surrogate sorts below every BMP
 *   character above `0xDBFF`. Code-point order is the opposite.
 *
 * So `params` and `info` are serialised here, explicitly, rather than handed
 * to `JSON.stringify`.
 */

import type { JsonValue } from "../types.js";

/**
 * Unicode code-point order (§7.3).
 *
 * Not `a < b`: that compares UTF-16 code units. Iterating a string yields
 * whole code points, which is exactly the difference.
 */
export function compareByCodePoint(a: string, b: string): number {
    const ia = a[Symbol.iterator]();
    const ib = b[Symbol.iterator]();
    for (;;) {
        const x = ia.next();
        const y = ib.next();
        if (x.done === true) return y.done === true ? 0 : -1;
        if (y.done === true) return 1;
        const cx = x.value.codePointAt(0)!;
        const cy = y.value.codePointAt(0)!;
        if (cx !== cy) return cx - cy;
    }
}

/** One JSON string. `JSON.stringify` escapes deterministically. */
export function jsonString(s: string): string {
    return JSON.stringify(s);
}

/**
 * One JSON number.
 *
 * Throws on `NaN` and infinities rather than returning an error. §7.3 forbids
 * the writer from coercing them — `JSON.stringify` would emit `null`, and the
 * file would decode cleanly with the value silently changed, the one outcome
 * worse than a refused write — and `validateTarget` has already rejected any
 * target carrying one. Reaching here with a non-finite number is therefore a
 * contract violation, which is what ADR-0001 point 7 reserves exceptions for.
 */
export function jsonNumber(n: number): string {
    if (!Number.isFinite(n)) {
        throw new TypeError(
            `canonical JSON cannot represent ${String(n)}; validate the target first`,
        );
    }
    return JSON.stringify(n);
}

/**
 * Canonical serialisation of free-form content — `params` and `info` (§7.3).
 *
 * Their content is arbitrary, so it has no key order of its own; sorting by
 * code point, recursively, is what makes the round trip byte-identical.
 */
export function canonicalJson(value: JsonValue): string {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return jsonNumber(value);
    if (typeof value === "string") return jsonString(value);
    if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
    }
    const object = value as { readonly [key: string]: JsonValue };
    const keys = Object.keys(object).sort(compareByCodePoint);
    const members = keys.map((k) => `${jsonString(k)}:${canonicalJson(object[k]!)}`);
    return `{${members.join(",")}}`;
}
