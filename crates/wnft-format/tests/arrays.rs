/*
 *  arrays.rs
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

//! §3: unaligned reads are done by copying, never by casting.
//!
//! In Rust the question the TypeScript codec has to answer — view or copy? —
//! does not arise: every accessor is copied out with `from_le_bytes`, so an
//! offset that is odd, or a `BIN` chunk that begins anywhere at all, reads the
//! same values as an aligned one. These tests say that in the form of an
//! assertion rather than a comment.

use wnft_format::testing::{Accessor, AccessorArray, AccessorType, materialise};

#[test]
fn reads_little_endian_regardless_of_alignment() {
    // 0x04030201 and 0x08070605, twice: once at offset 0, once at offset 1.
    let aligned = [1u8, 2, 3, 4, 5, 6, 7, 8];
    let shifted = [0u8, 1, 2, 3, 4, 5, 6, 7, 8];

    let at_zero = materialise(
        &aligned,
        &Accessor {
            offset: 0,
            count: 2,
            ty: AccessorType::U32,
        },
    )
    .expect("in bounds");
    let at_one = materialise(
        &shifted,
        &Accessor {
            offset: 1,
            count: 2,
            ty: AccessorType::U32,
        },
    )
    .expect("in bounds");

    let expected = AccessorArray::U32(vec![0x0403_0201, 0x0807_0605]);
    assert_eq!(at_zero, expected);
    assert_eq!(at_one, expected, "an odd offset must read the same values");
}

#[test]
fn reads_every_element_type() {
    let bin = [0x00u8, 0x00, 0x80, 0x3F, 0x01, 0x02];
    assert_eq!(
        materialise(
            &bin,
            &Accessor {
                offset: 0,
                count: 1,
                ty: AccessorType::F32
            }
        ),
        Some(AccessorArray::F32(vec![1.0]))
    );
    assert_eq!(
        materialise(
            &bin,
            &Accessor {
                offset: 4,
                count: 1,
                ty: AccessorType::U16
            }
        ),
        Some(AccessorArray::U16(vec![0x0201]))
    );
    assert_eq!(
        materialise(
            &bin,
            &Accessor {
                offset: 4,
                count: 2,
                ty: AccessorType::U8
            }
        ),
        Some(AccessorArray::U8(vec![1, 2]))
    );
}

#[test]
fn a_zero_count_accessor_is_an_empty_array_not_a_failure() {
    // §5.2 rev 2 distinguishes a manifest whose accessors all have count 0 from
    // one with no accessors at all, so this must be Some, not None.
    assert_eq!(
        materialise(
            &[],
            &Accessor {
                offset: 0,
                count: 0,
                ty: AccessorType::U32
            }
        ),
        Some(AccessorArray::U32(vec![]))
    );
}

#[test]
fn an_accessor_past_the_chunk_is_none_not_a_panic() {
    assert_eq!(
        materialise(
            &[1, 2, 3],
            &Accessor {
                offset: 0,
                count: 2,
                ty: AccessorType::U32
            }
        ),
        None
    );
    // The product itself must not overflow on the way to that answer (§6.1).
    assert_eq!(
        materialise(
            &[1, 2, 3],
            &Accessor {
                offset: u32::MAX,
                count: u32::MAX,
                ty: AccessorType::F32
            }
        ),
        None
    );
}
