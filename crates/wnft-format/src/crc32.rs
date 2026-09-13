/*
 *  crc32.rs
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

//! CRC-32/ISO-HDLC (§4.2): reflected polynomial `0xEDB88320`, initial value and
//! final XOR `0xFFFFFFFF` — the variant zlib, PNG and `crc32fast` use, so that a
//! chunk checksums the same here and in the TypeScript codec.
//!
//! Written out rather than delegated, because the checksum is part of the file
//! format and a format's own definition of it should be readable in the crate
//! that claims to implement it — and because a `no_std` crate with an allocator
//! and nothing else is a cheaper thing to depend on. `crc32fast` is a
//! **dev**-dependency, and the test suite cross-checks the two.
//!
//! CRC-32 detects **accidental** corruption — a truncated download, a bad cache
//! entry, a damaged copy. It detects no tampering at all, because whoever
//! changes the data recomputes it; that is the transport's job (HTTPS,
//! Subresource Integrity), not this format's (§4.2).

/// The byte-at-a-time table, built at compile time.
// `clippy::indexing_slicing` is denied crate-wide (untrusted-input safety), but
// here `n` is a `const`-block loop counter bounded by the literal `256`, never
// data, and clippy's own suggested fix (`.get`/`.get_mut`) is not usable in a
// constant block. So this is the one place the lint is allowed locally rather
// than routed through `get`.
#[allow(clippy::indexing_slicing)]
const TABLE: [u32; 256] = {
    let mut table = [0u32; 256];
    let mut n = 0usize;
    while n < 256 {
        let mut c = n as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
            k += 1;
        }
        table[n] = c;
        n += 1;
    }
    table
};

/// CRC-32 of `bytes`, as §4.2 defines it.
#[must_use]
pub fn crc32(bytes: &[u8]) -> u32 {
    let mut c: u32 = 0xFFFF_FFFF;
    for &b in bytes {
        // Both indices are masked to a byte, so neither can be out of range —
        // but `indexing_slicing` is denied crate-wide and this is data-derived,
        // so it goes through `get` like everything else.
        let index = ((c ^ u32::from(b)) & 0xFF) as usize;
        let entry = TABLE.get(index).copied().unwrap_or(0);
        c = entry ^ (c >> 8);
    }
    c ^ 0xFFFF_FFFF
}
