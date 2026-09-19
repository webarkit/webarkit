/*
 *  ijson.rs
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

//! §5 checks (a) to (e), against the seven fixtures §8.1 requires for them.

mod common;

use wnft_format::testing::{parse_container, scan_ijson};

/// The manifest text of a fixture, straight out of its JSON chunk.
fn manifest(relative: &str) -> String {
    let bytes = common::read(relative);
    let parsed = parse_container(&bytes).expect("the fixture must frame");
    let start = parsed.json.data_start;
    let end = start + parsed.json.length;
    let chunk = bytes.get(start..end).expect("the JSON chunk is in bounds");
    String::from_utf8(chunk.to_vec()).expect("these fixtures are valid UTF-8")
}

fn violates(relative: &str) {
    assert!(
        scan_ijson(&manifest(relative)).is_some(),
        "{relative} must fail an I-JSON check"
    );
}

#[test]
fn check_a_rejects_a_duplicate_member_name() {
    violates("invalid/ijson-duplicate-key.wnft");
}

#[test]
fn check_a_compares_names_after_unescaping() {
    // "a" and "a" are the same name. This catches an implementation that
    // compared the raw text instead of the unescaped names (§5 (a), §8.1).
    violates("invalid/ijson-duplicate-key-escaped.wnft");
}

#[test]
fn check_b_rejects_an_unpaired_surrogate_escape() {
    violates("invalid/ijson-unpaired-surrogate.wnft");
}

#[test]
fn check_c_rejects_an_integer_literal_at_two_to_the_53() {
    violates("invalid/ijson-integer-2p53.wnft");
}

#[test]
fn check_c_accepts_the_largest_exactly_representable_integer() {
    // The boundary file carries 9007199254740991 = 2^53 - 1, which MUST decode:
    // it catches an off-by-one in check (c) (§8.1).
    assert!(
        scan_ijson(&manifest("valid/boundary-max-safe-integer.wnft")).is_none(),
        "2^53 - 1 is exactly representable and must pass"
    );
}

#[test]
fn check_d_rejects_a_literal_that_rounds_to_infinity() {
    violates("invalid/ijson-infinity.wnft");
}

#[test]
fn check_e_rejects_a_raw_noncharacter_in_a_value() {
    // A noncharacter is well-formed UTF-8 and passes the strict decoding of
    // step 4, so only check (e) catches it (§5 (e), §8.1).
    violates("invalid/ijson-raw-noncharacter.wnft");
}

#[test]
fn check_e_rejects_an_escaped_noncharacter_in_a_member_name() {
    violates("invalid/ijson-noncharacter-in-name.wnft");
}

#[test]
fn every_valid_and_noncanonical_fixture_passes_every_check() {
    for relative in [
        "valid/minimal.wnft",
        "valid/several-sets.wnft",
        "valid/single-level.wnft",
        "valid/zero-keypoints.wnft",
        "valid/no-patches.wnft",
        "valid/reference-image.wnft",
        "valid/params-numeric-keys.wnft",
        "noncanonical/key-order.wnft",
        "noncanonical/whitespace.wnft",
        "noncanonical/explicit-empty-params.wnft",
        "noncanonical/unknown-top-level-key.wnft",
        "noncanonical/unknown-extension-payload.wnft",
        "noncanonical/unsorted-params.wnft",
    ] {
        assert!(
            scan_ijson(&manifest(relative)).is_none(),
            "{relative} must pass every I-JSON check"
        );
    }
}

#[test]
fn a_literal_rounding_to_zero_is_accepted() {
    // §5 (d): "Literals that round to zero (e.g. 1e-400) are fine: every
    // implementation reads 0." Only (d) bounds magnitude, and only upward.
    assert!(scan_ijson(r#"{"a":1e-400}"#).is_none());
}

#[test]
fn deeply_nested_input_terminates() {
    // §6.1 step 4: a RangeError from pathological nesting is BAD_MANIFEST, so
    // the scan is iterative with an explicit stack and must not blow the Rust
    // stack either.
    let deep = "[".repeat(100_000) + &"]".repeat(100_000);
    let _ = scan_ijson(&deep); // must return, either way, without overflowing
}
