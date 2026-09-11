/*
 *  container.ts
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
 * The container of §4: framing, and nothing else.
 *
 * This layer knows byte offsets, chunk headers and CRC-32. It knows nothing
 * about JSON, accessors or targets, and that split is load-bearing: §2
 * requires a reader to reject a container it cannot frame *before* it looks
 * for the manifest, and the fixture generator needs the framing on its own to
 * build files the canonical writer refuses to emit.
 *
 * `DataView` appears here and, for misaligned arrays, in `arrays.ts`. Nowhere
 * else in the codec reads raw bytes.
 */

import { crc32 } from "./crc32.js";
import { fail, type Failure } from "./errors.js";
import { SUPPORTED_CONTAINER_MAJOR } from "./known.js";

export const MAGIC = "WKNF";
export const HEADER_SIZE = 16;
export const CHUNK_HEADER_SIZE = 16;

/**
 * The `BIN` chunk type: `B`, `I`, `N`, **NUL** (§4.2).
 *
 * Built from a code point rather than written as a literal so that no source
 * file in this package contains a NUL byte — which would make git and grep
 * treat it as binary.
 */
export const BIN_TYPE = `BIN${String.fromCharCode(0)}`;

const JSON_TYPE = "JSON";
const JSON_PAD = 0x20;
const OTHER_PAD = 0x00;

/** Round up to a multiple of 8 — the padding rule of §4.2. */
export function align8(n: number): number {
    return (n + 7) & ~7;
}

/**
 * One chunk located inside the buffer given to {@link parseContainer}.
 *
 * `dataStart` is relative to that buffer's own start, not to the underlying
 * `ArrayBuffer`, and `length` excludes the padding, exactly as `chunk_length`
 * does.
 */
export interface Chunk {
    readonly type: string;
    readonly dataStart: number;
    readonly length: number;
}

export interface ParsedContainer {
    readonly json: Chunk;
    /** `null` when the file has no `BIN\0` chunk. */
    readonly bin: Chunk | null;
    /** Chunks of a type this build does not know; each warrants a warning. */
    readonly unknown: readonly Chunk[];
}

export type ParseResult =
    | { readonly ok: true; readonly value: ParsedContainer }
    | ({ readonly ok: false } & Failure);

function readType(bytes: Uint8Array, at: number): string {
    return String.fromCharCode(
        bytes[at]!,
        bytes[at + 1]!,
        bytes[at + 2]!,
        bytes[at + 3]!,
    );
}

const no = (error: Parameters<typeof fail>[0], detail: string): ParseResult => ({
    ok: false,
    ...fail(error, detail),
});

/**
 * §6.1 steps 1 and 2: frame the file, then check the two checksums.
 *
 * Every read is bounds-checked before it happens, so a truncated or hostile
 * buffer produces a failure rather than an exception — which is what lets
 * `decode` promise never to throw.
 */
export function parseContainer(bytes: Uint8Array): ParseResult {
    if (bytes.length < HEADER_SIZE) {
        return no(
            "BAD_CONTAINER",
            `file is ${bytes.length} bytes, below the ${HEADER_SIZE}-byte header`,
        );
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (readType(bytes, 0) !== MAGIC) {
        return no("BAD_MAGIC", `magic is not "${MAGIC}"`);
    }
    const major = view.getUint16(4, true);
    if (major !== SUPPORTED_CONTAINER_MAJOR) {
        return no(
            "UNSUPPORTED_CONTAINER",
            `container_major ${major} is not ${SUPPORTED_CONTAINER_MAJOR}`,
        );
    }
    // container_minor, at offset 6, is read and ignored on purpose: a newer
    // minor only adds chunks a reader can skip (§7.1).
    const totalLength = view.getUint32(8, true);
    if (totalLength !== bytes.length) {
        return no(
            "BAD_CONTAINER",
            `total_length ${totalLength} is not the buffer length ${bytes.length}`,
        );
    }
    const flags = view.getUint32(12, true);
    if (flags !== 0) {
        return no("BAD_CONTAINER", `flags is reserved and must be 0, got ${flags}`);
    }

    const chunks: Chunk[] = [];
    const storedCrc: number[] = [];
    let at = HEADER_SIZE;
    while (at < totalLength) {
        if (at + CHUNK_HEADER_SIZE > totalLength) {
            return no("BAD_CONTAINER", `chunk header at ${at} runs past the file`);
        }
        const length = view.getUint32(at, true);
        const type = readType(bytes, at + 4);
        const crc = view.getUint32(at + 8, true);
        const reserved = view.getUint32(at + 12, true);
        if (reserved !== 0) {
            return no(
                "BAD_CONTAINER",
                `chunk "${type}" reserved word must be 0, got ${reserved}`,
            );
        }
        const dataStart = at + CHUNK_HEADER_SIZE;
        // `length` is a u32 and `align8` of one stays exact in a Number, so
        // this sum cannot wrap and the comparison cannot be fooled.
        const padded = align8(length);
        if (dataStart + padded > totalLength) {
            return no(
                "BAD_CONTAINER",
                `chunk "${type}" of ${length} bytes at ${dataStart} runs past the file`,
            );
        }
        chunks.push({ type, dataStart, length });
        storedCrc.push(crc);
        at = dataStart + padded;
    }

    if (chunks.length === 0 || chunks[0]!.type !== JSON_TYPE) {
        return no("BAD_CONTAINER", "the first chunk must be JSON");
    }
    if (chunks.filter((c) => c.type === JSON_TYPE).length !== 1) {
        return no("BAD_CONTAINER", "there must be exactly one JSON chunk");
    }
    const binIndexes = chunks
        .map((c, i) => (c.type === BIN_TYPE ? i : -1))
        .filter((i) => i >= 0);
    if (binIndexes.length > 1) {
        return no("BAD_CONTAINER", "there must be at most one BIN chunk");
    }
    if (binIndexes.length === 1 && binIndexes[0] !== 1) {
        return no("BAD_CONTAINER", "the BIN chunk must be the second chunk");
    }
    // An unknown chunk in second place is fine when there is no BIN chunk
    // (§4.2, rev 2) — that is what leaves room for future container minors.

    const json = chunks[0]!;
    const bin = binIndexes.length === 1 ? chunks[1]! : null;

    // §6.1 step 2 checksums JSON and BIN only. An unknown chunk is skipped
    // whole, so verifying its CRC would reject a file over bytes this reader
    // never reads.
    for (const index of bin === null ? [0] : [0, 1]) {
        const c = chunks[index]!;
        const actual = crc32(bytes.subarray(c.dataStart, c.dataStart + c.length));
        if (actual !== storedCrc[index]) {
            return no(
                "CHECKSUM_MISMATCH",
                `chunk "${c.type}" checksum is ${actual}, stored ${storedCrc[index]}`,
            );
        }
    }

    return {
        ok: true,
        value: { json, bin, unknown: chunks.filter((c) => c !== json && c !== bin) },
    };
}

function writeType(out: Uint8Array, at: number, type: string): void {
    for (let i = 0; i < 4; i += 1) out[at + i] = type.charCodeAt(i) & 0xff;
}

function writeChunk(
    out: Uint8Array,
    view: DataView,
    at: number,
    type: string,
    data: Uint8Array,
    pad: number,
): number {
    view.setUint32(at, data.length, true);
    writeType(out, at + 4, type);
    view.setUint32(at + 8, crc32(data), true);
    view.setUint32(at + 12, 0, true); // reserved, MUST be 0 (§4.2)
    out.set(data, at + CHUNK_HEADER_SIZE);
    const dataEnd = at + CHUNK_HEADER_SIZE + data.length;
    const chunkEnd = at + CHUNK_HEADER_SIZE + align8(data.length);
    out.fill(pad, dataEnd, chunkEnd);
    return chunkEnd;
}

/**
 * The framing half of the canonical writer (§7.3): header, then `JSON`, then
 * `BIN\0`, and no other chunk.
 *
 * `bin` is `null` only for a manifest declaring no accessor at all, which no
 * real target produces — keypoints always carry arrays. An empty
 * `Uint8Array` is framed as a present, zero-length chunk rather than omitted:
 * the two are different files, and §5.2 (rev 2) distinguishes them.
 */
export function buildContainer(json: Uint8Array, bin: Uint8Array | null): Uint8Array {
    const total =
        HEADER_SIZE +
        CHUNK_HEADER_SIZE +
        align8(json.length) +
        (bin === null ? 0 : CHUNK_HEADER_SIZE + align8(bin.length));

    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);

    writeType(out, 0, MAGIC);
    view.setUint16(4, SUPPORTED_CONTAINER_MAJOR, true);
    view.setUint16(6, 0, true);
    view.setUint32(8, total, true);
    view.setUint32(12, 0, true); // flags, reserved

    let at = writeChunk(out, view, HEADER_SIZE, JSON_TYPE, json, JSON_PAD);
    if (bin !== null) at = writeChunk(out, view, at, BIN_TYPE, bin, OTHER_PAD);
    return out;
}
