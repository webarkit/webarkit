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

//! §6.1 steps 1 and 2, against the fixtures that exercise them.

mod common;

use wnft_format::ErrorCode;
use wnft_format::testing::parse_container;

fn code(relative: &str) -> ErrorCode {
    parse_container(&common::read(relative))
        .expect_err("this fixture must not frame")
        .code
}

#[test]
fn a_valid_file_frames_into_json_then_bin() {
    let bytes = common::read("valid/minimal.wnft");
    let parsed = parse_container(&bytes).expect("minimal.wnft must frame");
    assert_eq!(&parsed.json.kind, b"JSON");
    assert_eq!(
        parsed.json.data_start, 32,
        "16-byte file header + 16-byte chunk header"
    );
    let bin = parsed.bin.expect("minimal.wnft has a BIN chunk");
    assert_eq!(&bin.kind, b"BIN\0");
    assert!(parsed.unknown.is_empty());
    // §4.2: chunk data starts 8-aligned, so a reader could view it.
    assert_eq!(parsed.json.data_start % 8, 0);
    assert_eq!(bin.data_start % 8, 0);
}

#[test]
fn each_framing_fixture_yields_its_code() {
    assert_eq!(code("invalid/bad-magic.wnft"), ErrorCode::BadMagic);
    assert_eq!(
        code("invalid/unsupported-container.wnft"),
        ErrorCode::UnsupportedContainer
    );
    assert_eq!(
        code("invalid/bad-container-total-length.wnft"),
        ErrorCode::BadContainer
    );
    assert_eq!(
        code("invalid/bad-container-flags.wnft"),
        ErrorCode::BadContainer
    );
    assert_eq!(
        code("invalid/bad-container-json-not-first.wnft"),
        ErrorCode::BadContainer
    );
    assert_eq!(
        code("invalid/checksum-mismatch.wnft"),
        ErrorCode::ChecksumMismatch
    );
}

#[test]
fn an_unknown_chunk_is_reported_not_rejected() {
    // §4.2: an unknown chunk is ignored by readers, and may sit second when the
    // file has no BIN chunk. It warrants a warning, which decode() raises.
    let bytes = common::read("warnings/unknown-chunk.wnft");
    let parsed = parse_container(&bytes).expect("an unknown chunk must not break framing");
    assert_eq!(parsed.unknown.len(), 1);
}

#[test]
fn truncating_at_every_byte_never_panics() {
    // §8.4: "every valid fixture, truncated at every byte offset, yields
    // ok: false and never throws."
    //
    // **Not panicking is the claim that matters**, and it is the weaker one: a
    // reader that rejected everything would satisfy `is_err` and still be
    // useless, whereas one that unwinds on a truncated download has failed at
    // the thing §6.1 exists to guarantee. In Rust the assertion is the call
    // itself — an unwinding panic in a test thread fails the test — so every
    // iteration below asserts it by completing.
    let bytes = common::read("valid/minimal.wnft");
    for cut in 0..=bytes.len() {
        let head = bytes.get(..cut).expect("cut is within the buffer");
        let result = parse_container(head); // the no-panic assertion

        if cut == bytes.len() {
            // The positive control: the same loop, at full length, must frame.
            // Without it the test passes just as well against a `parse_container`
            // that returns Err unconditionally.
            assert!(result.is_ok(), "the untruncated file must frame");
        } else {
            // A consequence, not the point — and it holds here for a specific
            // reason worth stating: §4.1 requires `total_length` to equal the
            // buffer length, so no proper prefix of a valid file can itself be
            // a valid file. If that rule ever changes, this branch is what goes,
            // and the no-panic claim above stays.
            assert!(
                result.is_err(),
                "a {cut}-byte prefix must not frame as a whole file"
            );
        }
    }
}

#[test]
fn round_trips_through_build_container() {
    let bytes = common::read("valid/minimal.wnft");
    let parsed = parse_container(&bytes).expect("minimal.wnft must frame");
    let json = bytes
        .get(parsed.json.data_start..parsed.json.data_start + parsed.json.length)
        .expect("the JSON chunk is in bounds");
    let bin = parsed.bin.map(|b| {
        bytes
            .get(b.data_start..b.data_start + b.length)
            .expect("the BIN chunk is in bounds")
            .to_vec()
    });
    let rebuilt = wnft_format::testing::build_container(json, bin.as_deref());
    assert_eq!(
        rebuilt, bytes,
        "framing is deterministic and canonical (§7.3)"
    );
}
