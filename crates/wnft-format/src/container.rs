/*
 *  container.rs
 *  wnft-format
 *
 *  This file is part of wnft-format - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  wnft-format is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  wnft-format is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with wnft-format.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

//! The container: byte offsets, chunk headers and CRC-32 (§4), and the framing
//! half of §6.1 steps 1 and 2. Nothing here knows about JSON, accessors or a
//! target — §2 requires a reader to reject a container it cannot frame before
//! it looks for the manifest, and that split is what makes this module
//! possible to test, and to trust, on its own.
//!
//! Every read goes through [`u32_at`], [`u16_at`] or [`type_at`], each of which
//! copies out of a bounds-checked slice rather than casting a pointer. That is
//! what lets [`parse_container`] turn a truncated or hostile buffer into a
//! [`DecodeError`] instead of a panic (§6.1).

use alloc::vec::Vec;

use crate::crc32::crc32;
use crate::error::{DecodeError, ErrorCode, fail};
use crate::known::{BIN_TYPE, JSON_TYPE, MAGIC, SUPPORTED_CONTAINER_MAJOR};

/// The file header is 16 bytes (§4.1).
const HEADER_LEN: usize = 16;

/// Every chunk header is 16 bytes (§4.2).
const CHUNK_HEADER_LEN: usize = 16;

/// One chunk, framed but not interpreted: where its data lives in the buffer,
/// and how long that data is (excluding padding).
///
/// `Copy` is load-bearing: [`ParsedContainer`]'s `json` and `bin` fields are
/// both read independently by later stages, and without it the first read
/// would move the field out of the struct.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Chunk {
    /// The 4-byte chunk type, e.g. `*b"JSON"` or `[b'B', b'I', b'N', 0]`.
    pub kind: [u8; 4],
    /// Byte offset of the chunk's data (after its 16-byte header), in the
    /// original buffer.
    pub data_start: usize,
    /// Length of the chunk's data, excluding padding.
    pub length: usize,
}

/// The result of framing a `.wnft` buffer: which chunk is which, with none of
/// them interpreted yet.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedContainer {
    /// The one required `JSON` chunk.
    pub json: Chunk,
    /// The `BIN\0` chunk, if the file has one.
    pub bin: Option<Chunk>,
    /// Chunks of a type this build does not know (§4.2), in file order. Each
    /// warrants `UNKNOWN_CHUNK_SKIPPED` at the `decode` layer; this layer only
    /// reports that they exist.
    pub unknown: Vec<Chunk>,
}

/// Round up to a multiple of 8 — the padding rule of §4.2. `None` on overflow,
/// which a `chunk_length` near `u32::MAX` reaches on a 32-bit target.
pub(crate) fn align8(n: usize) -> Option<usize> {
    n.checked_add(7).map(|m| m & !7)
}

/// Read a little-endian `u32` at `at`, by copy — never a pointer cast (§3).
fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    let end = at.checked_add(4)?;
    let slice = bytes.get(at..end)?;
    let array: [u8; 4] = slice.try_into().ok()?;
    Some(u32::from_le_bytes(array))
}

/// Read a little-endian `u16` at `at`, by copy.
fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    let end = at.checked_add(2)?;
    let slice = bytes.get(at..end)?;
    let array: [u8; 2] = slice.try_into().ok()?;
    Some(u16::from_le_bytes(array))
}

/// Read a 4-byte type tag at `at`.
fn type_at(bytes: &[u8], at: usize) -> Option<[u8; 4]> {
    let end = at.checked_add(4)?;
    bytes.get(at..end)?.try_into().ok()
}

/// A chunk header, read but not yet validated against its neighbours.
struct RawChunk {
    kind: [u8; 4],
    crc32: u32,
    data_start: usize,
    length: usize,
}

/// Read one chunk header at `header_start` and return it together with the
/// offset just past its padded data. `None` on any bounds or arithmetic
/// failure — the caller turns that into `BAD_CONTAINER`.
fn read_chunk_header(bytes: &[u8], header_start: usize) -> Option<(RawChunk, usize)> {
    // §4.2: offset 0 chunk_length (u32), offset 4 chunk_type (u8[4]),
    // offset 8 crc32 (u32), offset 12 reserved (u32, MUST be 0).
    let chunk_length = u32_at(bytes, header_start)?;
    let kind = type_at(bytes, header_start.checked_add(4)?)?;
    let crc32 = u32_at(bytes, header_start.checked_add(8)?)?;
    let reserved = u32_at(bytes, header_start.checked_add(12)?)?;
    if reserved != 0 {
        return None;
    }

    let data_start = header_start.checked_add(CHUNK_HEADER_LEN)?;
    let length = usize::try_from(chunk_length).ok()?;
    let data_end = data_start.checked_add(length)?;
    // The data itself must be in bounds before anything else is derived from it.
    if data_end > bytes.len() {
        return None;
    }
    let padded_length = align8(length)?;
    let next_header_start = data_start.checked_add(padded_length)?;
    // The padded region (data plus padding) must also stay in bounds, even
    // though the padding bytes themselves are never read here.
    if next_header_start > bytes.len() {
        return None;
    }

    Some((
        RawChunk {
            kind,
            crc32,
            data_start,
            length,
        },
        next_header_start,
    ))
}

/// Frame a `.wnft` buffer: §4 plus §6.1 steps 1 and 2. Everything after this —
/// the manifest, accessors, the target — is a later layer's job.
///
/// # Errors
///
/// Returns a [`DecodeError`] whose `code` is one of `BAD_CONTAINER`,
/// `BAD_MAGIC`, `UNSUPPORTED_CONTAINER` or `CHECKSUM_MISMATCH`. Never panics,
/// on any input, including a hostile or truncated one (§6.1).
pub fn parse_container(bytes: &[u8]) -> Result<ParsedContainer, DecodeError> {
    // 1. Header must be present at all.
    if bytes.len() < HEADER_LEN {
        return Err(fail(
            ErrorCode::BadContainer,
            "buffer shorter than the 16-byte file header",
        ));
    }

    // 2. Magic.
    let magic =
        type_at(bytes, 0).ok_or_else(|| fail(ErrorCode::BadContainer, "magic out of bounds"))?;
    if magic != MAGIC {
        return Err(fail(ErrorCode::BadMagic, "magic is not \"WKNF\""));
    }

    // 3. container_major supported; container_minor read and ignored.
    let container_major = u16_at(bytes, 4)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "container_major out of bounds"))?;
    if container_major != SUPPORTED_CONTAINER_MAJOR {
        return Err(fail(
            ErrorCode::UnsupportedContainer,
            alloc::format!("container_major {container_major} is not supported"),
        ));
    }
    let _container_minor = u16_at(bytes, 6)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "container_minor out of bounds"))?;

    // 4. total_length equals the buffer length.
    let total_length = u32_at(bytes, 8)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "total_length out of bounds"))?;
    let total_length = usize::try_from(total_length).map_err(|_| {
        fail(
            ErrorCode::BadContainer,
            "total_length does not fit in usize",
        )
    })?;
    if total_length != bytes.len() {
        return Err(fail(
            ErrorCode::BadContainer,
            "total_length does not equal the buffer length",
        ));
    }

    // 5. flags MUST be 0.
    let flags =
        u32_at(bytes, 12).ok_or_else(|| fail(ErrorCode::BadContainer, "flags out of bounds"))?;
    if flags != 0 {
        return Err(fail(ErrorCode::BadContainer, "flags is not 0"));
    }

    // 6. Walk chunks from offset 16 to total_length.
    let mut chunks: Vec<RawChunk> = Vec::new();
    let mut cursor = HEADER_LEN;
    while cursor < total_length {
        let (chunk, next_cursor) = read_chunk_header(bytes, cursor).ok_or_else(|| {
            fail(
                ErrorCode::BadContainer,
                "chunk header out of bounds or malformed",
            )
        })?;
        chunks.push(chunk);
        cursor = next_cursor;
    }
    if cursor != total_length {
        // A chunk's padded end landed past total_length without failing bounds
        // above only if total_length itself was inconsistent; read_chunk_header
        // already checks against bytes.len(), so this guards the (theoretical)
        // case bytes.len() > total_length, which is excluded by step 4 — kept
        // as a defensive check rather than assumed away.
        return Err(fail(
            ErrorCode::BadContainer,
            "chunks do not exactly fill total_length",
        ));
    }

    // 7. First chunk is JSON and there is exactly one.
    let mut json: Option<Chunk> = None;
    let mut bin: Option<Chunk> = None;
    let mut unknown: Vec<Chunk> = Vec::new();

    for (index, raw) in chunks.iter().enumerate() {
        let as_chunk = Chunk {
            kind: raw.kind,
            data_start: raw.data_start,
            length: raw.length,
        };
        if raw.kind == JSON_TYPE {
            if index != 0 || json.is_some() {
                return Err(fail(
                    ErrorCode::BadContainer,
                    "JSON chunk missing, duplicated, or not first",
                ));
            }
            json = Some(as_chunk);
        } else if raw.kind == BIN_TYPE {
            // 8. At most one BIN\0, and if present it is at index 1.
            if index != 1 || bin.is_some() {
                return Err(fail(
                    ErrorCode::BadContainer,
                    "BIN chunk duplicated or out of place",
                ));
            }
            bin = Some(as_chunk);
        } else {
            unknown.push(as_chunk);
        }
    }

    let json = json.ok_or_else(|| fail(ErrorCode::BadContainer, "no JSON chunk"))?;

    // 9. Checksums of JSON and BIN\0 only — never the unknown chunks'.
    verify_checksum(bytes, &chunks, JSON_TYPE, &json)?;
    if let Some(bin_chunk) = bin.as_ref() {
        verify_checksum(bytes, &chunks, BIN_TYPE, bin_chunk)?;
    }

    Ok(ParsedContainer { json, bin, unknown })
}

/// Find the raw chunk of the given `kind` (there is at most one that matters:
/// `JSON` or `BIN\0`, each already confirmed unique) and verify its CRC-32
/// against the stored value.
fn verify_checksum(
    bytes: &[u8],
    chunks: &[RawChunk],
    kind: [u8; 4],
    chunk: &Chunk,
) -> Result<(), DecodeError> {
    let raw = chunks.iter().find(|c| c.kind == kind).ok_or_else(|| {
        fail(
            ErrorCode::BadContainer,
            "chunk vanished between framing and checksum",
        )
    })?;
    let data_end = chunk
        .data_start
        .checked_add(chunk.length)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "chunk data range overflows"))?;
    let data = bytes
        .get(chunk.data_start..data_end)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "chunk data out of bounds"))?;
    if crc32(data) != raw.crc32 {
        return Err(fail(
            ErrorCode::ChecksumMismatch,
            "chunk CRC-32 does not match",
        ));
    }
    Ok(())
}

/// Pad `data` to a multiple of 8 bytes with `pad_byte`, appending to `out`.
fn write_padded(out: &mut Vec<u8>, data: &[u8], pad_byte: u8) {
    out.extend_from_slice(data);
    let padded_len = align8(data.len()).unwrap_or(data.len());
    let pad_len = padded_len.saturating_sub(data.len());
    out.resize(out.len() + pad_len, pad_byte);
}

/// Write one chunk header: `chunk_length`, `chunk_type`, `crc32`, then a
/// zero `reserved` field (§4.2).
fn write_chunk_header(out: &mut Vec<u8>, kind: [u8; 4], data: &[u8]) {
    let chunk_length = u32::try_from(data.len()).unwrap_or(u32::MAX);
    out.extend_from_slice(&chunk_length.to_le_bytes());
    out.extend_from_slice(&kind);
    out.extend_from_slice(&crc32(data).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
}

/// Build the canonical container for a manifest and an optional binary blob
/// (§7.3): the file header, then a `JSON` chunk padded with `0x20`, then — only
/// when `bin` is `Some`, including `Some(&[])` — a `BIN\0` chunk padded with
/// `0x00`. No other chunk is ever written.
///
/// A present, zero-length `BIN\0` chunk (`bin = Some(&[])`) and an absent one
/// (`bin = None`) are different files: §5.2 rev 2 distinguishes a manifest that
/// declares zero-length accessors from one that declares none at all.
#[must_use]
pub fn build_container(json: &[u8], bin: Option<&[u8]>) -> Vec<u8> {
    let mut body: Vec<u8> = Vec::new();

    write_chunk_header(&mut body, JSON_TYPE, json);
    write_padded(&mut body, json, b' ');

    if let Some(bin_data) = bin {
        write_chunk_header(&mut body, BIN_TYPE, bin_data);
        write_padded(&mut body, bin_data, 0);
    }

    let total_length = HEADER_LEN
        .checked_add(body.len())
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(u32::MAX);

    let mut out = Vec::with_capacity(HEADER_LEN + body.len());
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&SUPPORTED_CONTAINER_MAJOR.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes()); // container_minor
    out.extend_from_slice(&total_length.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // flags
    out.extend_from_slice(&body);
    out
}
