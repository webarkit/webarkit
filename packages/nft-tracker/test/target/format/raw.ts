/*
 *  raw.ts
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
 * Hand-built container bytes, for tests and for the fixture generator's
 * `invalid/` cases.
 *
 * These are files the canonical writer would never produce — a wrong magic, a
 * forged checksum, a chunk running past the end — so they cannot be built
 * through `encode`, and being able to build them is the whole point.
 *
 * Every field is a parameter with a correct default, so a test overrides
 * exactly the one thing it is about and nothing else drifts.
 */

import { crc32 } from "../../../src/target/format/crc32.js";
import { BIN_TYPE } from "../../../src/target/format/container.js";

export interface RawChunk {
    /** Exactly four ASCII characters, e.g. `"JSON"` or {@link BIN_TYPE}. */
    readonly type: string;
    readonly data: Uint8Array;
    /** Overrides the computed CRC-32, to forge a mismatch. */
    readonly crc?: number;
    /** Overrides the stored length, to forge an out-of-bounds chunk. */
    readonly length?: number;
    /** Overrides the reserved word, which MUST be 0 (§4.2). */
    readonly reserved?: number;
}

export interface RawFile {
    readonly magic?: string;
    readonly containerMajor?: number;
    readonly containerMinor?: number;
    /** Overrides `total_length`, to forge a truncation mismatch. */
    readonly totalLength?: number;
    /** Overrides `flags`, which MUST be 0 (§4.1). */
    readonly flags?: number;
    readonly chunks: readonly RawChunk[];
}

const align8 = (n: number): number => (n + 7) & ~7;

export function buildRaw(file: RawFile): Uint8Array {
    let total = 16;
    for (const c of file.chunks) total += 16 + align8(c.data.length);

    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    const ascii = (s: string, at: number): void => {
        for (let i = 0; i < 4; i += 1) out[at + i] = s.charCodeAt(i) & 0xff;
    };

    ascii(file.magic ?? "WKNF", 0);
    view.setUint16(4, file.containerMajor ?? 1, true);
    view.setUint16(6, file.containerMinor ?? 0, true);
    view.setUint32(8, file.totalLength ?? total, true);
    view.setUint32(12, file.flags ?? 0, true);

    let at = 16;
    for (const c of file.chunks) {
        view.setUint32(at, c.length ?? c.data.length, true);
        ascii(c.type, at + 4);
        view.setUint32(at + 8, c.crc ?? crc32(c.data), true);
        view.setUint32(at + 12, c.reserved ?? 0, true);
        out.set(c.data, at + 16);
        // §4.2: the JSON chunk pads with spaces, every other chunk with zeros.
        const dataEnd = at + 16 + c.data.length;
        const chunkEnd = at + 16 + align8(c.data.length);
        if (c.type === "JSON") out.fill(0x20, dataEnd, chunkEnd);
        at = chunkEnd;
    }
    return out;
}

/** A `JSON` chunk from manifest text. */
export const jsonChunk = (text: string): RawChunk => ({
    type: "JSON",
    data: new TextEncoder().encode(text),
});

/**
 * A `BIN\0` chunk. The type's fourth byte is NUL, not a space, which is why
 * this imports the constant rather than spelling it again.
 */
export const binChunk = (data: Uint8Array): RawChunk => ({
    type: BIN_TYPE,
    data,
});
