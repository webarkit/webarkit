/*
 *  arrays.test.ts
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
import { isViewOf, materialise } from "../../../src/target/format/arrays.js";

/** A buffer whose BIN data starts at `base`, holding `bytes` from there. */
const at = (base: number, bytes: number[]): { buffer: ArrayBuffer; base: number } => {
    const buffer = new ArrayBuffer(base + bytes.length);
    new Uint8Array(buffer).set(bytes, base);
    return { buffer, base };
};

describe("materialise", () => {
    it("views a u8 array without copying", () => {
        const { buffer, base } = at(0, [1, 2, 3]);
        const a = materialise(buffer, base, { offset: 0, count: 3, type: "u8" });
        expect([...a]).toEqual([1, 2, 3]);
        expect(isViewOf(a, buffer)).toBe(true);
    });

    it("views a u32 array from an 8-aligned base", () => {
        const { buffer, base } = at(8, [1, 0, 0, 0, 2, 0, 0, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u32" });
        expect([...a]).toEqual([1, 2]);
        expect(isViewOf(a, buffer)).toBe(true);
    });

    it("copies a u32 array when the base is not a multiple of 4 (§3)", () => {
        const { buffer, base } = at(2, [1, 0, 0, 0, 2, 0, 0, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u32" });
        expect([...a]).toEqual([1, 2]);
        expect(isViewOf(a, buffer)).toBe(false);
    });

    it("copies a u16 array when the base is odd", () => {
        const { buffer, base } = at(1, [5, 0, 6, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u16" });
        expect([...a]).toEqual([5, 6]);
        expect(isViewOf(a, buffer)).toBe(false);
    });

    it("still views a u8 array from an odd base — one byte is always aligned", () => {
        const { buffer, base } = at(3, [7, 8]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u8" });
        expect([...a]).toEqual([7, 8]);
        expect(isViewOf(a, buffer)).toBe(true);
    });

    it("produces the same values through a view and through a copy", () => {
        const payload = [0, 0, 128, 63, 0, 0, 0, 64]; // 1.0, 2.0 as little-endian f32
        const viewed = materialise(at(8, payload).buffer, 8, {
            offset: 0,
            count: 2,
            type: "f32",
        });
        const copied = materialise(at(3, payload).buffer, 3, {
            offset: 0,
            count: 2,
            type: "f32",
        });
        expect([...viewed]).toEqual([1, 2]);
        expect([...copied]).toEqual([1, 2]);
    });

    it("honours the accessor's own offset inside the BIN chunk", () => {
        const { buffer, base } = at(8, [9, 9, 9, 9, 7, 0, 0, 0]);
        const a = materialise(buffer, base, { offset: 4, count: 1, type: "u32" });
        expect([...a]).toEqual([7]);
    });

    it("produces an empty array for a zero-count accessor", () => {
        const { buffer, base } = at(8, []);
        expect(
            materialise(buffer, base, { offset: 0, count: 0, type: "f32" }).length,
        ).toBe(0);
    });

    it("never lets a copy alias the source buffer", () => {
        const { buffer, base } = at(1, [5, 0, 6, 0]);
        const a = materialise(buffer, base, { offset: 0, count: 2, type: "u16" });
        a[0] = 99;
        expect(new Uint8Array(buffer)[1]).toBe(5);
    });

    it("returns the typed array the accessor's type names", () => {
        const { buffer, base } = at(8, [1, 0, 0, 0]);
        expect(
            materialise(buffer, base, { offset: 0, count: 4, type: "u8" }),
        ).toBeInstanceOf(Uint8Array);
        expect(
            materialise(buffer, base, { offset: 0, count: 2, type: "u16" }),
        ).toBeInstanceOf(Uint16Array);
        expect(
            materialise(buffer, base, { offset: 0, count: 1, type: "u32" }),
        ).toBeInstanceOf(Uint32Array);
        expect(
            materialise(buffer, base, { offset: 0, count: 1, type: "f32" }),
        ).toBeInstanceOf(Float32Array);
    });
});
