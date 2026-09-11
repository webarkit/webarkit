/*
 *  arrays.ts
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
 * Accessor to typed array: a **view** into the file's own buffer when the
 * absolute byte offset divides by the element size, a **copy** when it does
 * not (§3).
 *
 * The copy path is not hypothetical. A `.wnft` embedded in a larger buffer, or
 * handed over as a `Uint8Array` whose `byteOffset` is odd, puts the `BIN` chunk
 * at an address JavaScript refuses to view as a `Uint32Array` — typed arrays
 * require the byte offset to be a multiple of the element size, and §3 forbids
 * reading misaligned data through a view.
 *
 * Inside a file the question never arises: chunk data is 8-aligned and every
 * accessor offset is a multiple of its element size, so only the file's own
 * base can misalign anything. That is why §3 (rev 2) requires a reader to
 * accept a view as well as a bare `ArrayBuffer` — without it this branch would
 * be unreachable from JavaScript, and so untestable.
 */

import { ELEMENT_SIZE, type Accessor, type AccessorType } from "./manifest.js";

export type AccessorArray = Uint8Array | Uint16Array | Uint32Array | Float32Array;

interface AccessorArrayConstructor {
    new (
        buffer: ArrayBufferLike,
        byteOffset: number,
        length: number,
    ): AccessorArray;
}

const CONSTRUCTOR: Readonly<Record<AccessorType, AccessorArrayConstructor>> = {
    u8: Uint8Array,
    u16: Uint16Array,
    u32: Uint32Array,
    f32: Float32Array,
};

/**
 * The array an accessor describes.
 *
 * `binStart` is the absolute offset of the `BIN` chunk's data within `buffer`,
 * not within the caller's view of it.
 *
 * `buffer` is `ArrayBufferLike` rather than `ArrayBuffer` because that is what
 * a typed array's own `.buffer` is: narrowing it would only mean a cast at
 * every call site.
 */
export function materialise(
    buffer: ArrayBufferLike,
    binStart: number,
    accessor: Accessor,
): AccessorArray {
    const size = ELEMENT_SIZE[accessor.type];
    const Ctor = CONSTRUCTOR[accessor.type];
    const absolute = binStart + accessor.offset;
    if (absolute % size === 0) {
        return new Ctor(buffer, absolute, accessor.count);
    }
    // `slice` allocates a fresh buffer whose data starts at offset 0, which is
    // aligned for every element type by construction.
    const copy = new Uint8Array(buffer, absolute, accessor.count * size).slice();
    return new Ctor(copy.buffer, 0, accessor.count);
}

/** Whether `array` reads `buffer` directly rather than a copy of it. */
export function isViewOf(array: AccessorArray, buffer: ArrayBufferLike): boolean {
    return array.buffer === buffer;
}
