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

//! §8.2 item 6: the checksum variant §4.2 pins, by its published test vector.

use wnft_format::crc32;

#[test]
fn spec_test_vector() {
    // §4.2: "Test vector: the ASCII bytes `123456789` give `0xCBF43926`."
    assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
}

#[test]
fn empty_input_is_zero() {
    // Not in the specification, but implied by it: init and final XOR are both
    // 0xFFFFFFFF, so an empty message checksums to 0. A table built with the
    // wrong polarity fails this while still passing nothing else.
    assert_eq!(crc32(b""), 0);
}

#[test]
fn agrees_with_crc32fast_on_a_spread_of_inputs() {
    // The hand-written table is fifteen lines and easy to get subtly wrong.
    // crc32fast implements the same variant (§4.2 names it), so it is the
    // second opinion that keeps the table honest.
    for len in [0usize, 1, 7, 8, 9, 64, 255, 256, 1024] {
        let data: Vec<u8> = (0..len).map(|i| (i.wrapping_mul(31) % 251) as u8).collect();
        let mut hasher = crc32fast::Hasher::new();
        hasher.update(&data);
        assert_eq!(crc32(&data), hasher.finalize(), "length {len}");
    }
}
