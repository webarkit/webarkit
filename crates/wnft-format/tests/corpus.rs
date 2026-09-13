/*
 *  corpus.rs
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

//! §8.2 items 1 and 5, and §8.4's truncation test, against the shared corpus.
//!
//! `expectations.json` is the machine-readable index the generator emits
//! alongside the files, so it cannot drift from them. Reading it rather than
//! listing the fixtures here is what keeps this suite honest when the corpus
//! grows: a new fixture is exercised without a change to this file.

mod common;

use wnft_format::{DEFAULT_LIMITS, Decoded, decode};

#[test]
fn the_corpus_is_the_version_this_build_reads() {
    assert_eq!(common::expectations().format_version, "0.2");
}

#[test]
fn every_valid_fixture_decodes_with_no_warnings() {
    for case in common::expectations().valid {
        let result = decode(&common::read(&case.file), &DEFAULT_LIMITS);
        let Decoded { warnings, .. } = result
            .unwrap_or_else(|e| panic!("{} must decode, got {}: {}", case.file, e.code, e.detail));
        assert!(
            warnings.is_empty(),
            "{} must decode cleanly, got {warnings:?}",
            case.file
        );
    }
}

#[test]
fn every_invalid_fixture_yields_exactly_its_code() {
    // §8.2 item 5. The code, not the detail: the detail is free text, only the
    // code is shared across implementations (§6.2).
    for case in common::expectations().invalid {
        let limits = common::limits_for(&case.limits);
        let error = decode(&common::read(&case.file), &limits)
            .err()
            .unwrap_or_else(|| panic!("{} must not decode", case.file));
        assert_eq!(
            error.code.as_str(),
            case.error,
            "{}: {}",
            case.file,
            error.detail
        );
    }
}

#[test]
fn every_warning_fixture_yields_exactly_its_warnings() {
    for case in common::expectations().warnings {
        let decoded = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let actual: Vec<&str> = decoded.warnings.iter().map(|w| w.code.as_str()).collect();
        let expected: Vec<&str> = case.warnings.iter().map(String::as_str).collect();
        assert_eq!(actual, expected, "{}", case.file);
    }
}

#[test]
fn every_noncanonical_fixture_decodes_to_its_counterpart() {
    // §8.2 item 3, first half: the decoded values must match, which is what
    // makes §7.3's "a decoder keeps only what it understands" testable. The
    // re-encoding half is in tests/writer.rs, once encode exists.
    for case in common::expectations().noncanonical {
        let a = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let b = decode(&common::read(&case.canonical), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.canonical, e.code));
        assert_eq!(a.target, b.target, "{} vs {}", case.file, case.canonical);
    }
}

#[test]
fn minimal_decodes_to_the_values_minimal_json_records() {
    // §8.2 item 1.
    let decoded = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("minimal.wnft must decode");
    let expected: serde_json::Value = serde_json::from_slice(&common::read("valid/minimal.json"))
        .expect("minimal.json must parse");
    assert_eq!(common::target_to_json(&decoded.target), expected);
}

#[test]
fn truncating_every_valid_fixture_at_every_byte_never_panics() {
    // §8.4, over the whole corpus, and shaped like the container suite's own
    // truncation test for the same reason: **not panicking is the claim that
    // matters**, and in Rust the assertion is the call itself — an unwinding
    // panic in a test thread fails the test. `is_err` is a consequence, and it
    // holds because §4.1 requires `total_length` to equal the buffer length, so
    // no proper prefix of a valid file is itself a valid file.
    for case in common::expectations().valid {
        let bytes = common::read(&case.file);
        for cut in 0..=bytes.len() {
            let head = bytes.get(..cut).expect("cut is within the buffer");
            let result = decode(head, &DEFAULT_LIMITS); // the no-panic assertion

            if cut == bytes.len() {
                // The positive control: the untruncated file must decode, or
                // the loop would pass against a `decode` that always failed.
                assert!(result.is_ok(), "{} must decode untruncated", case.file);
            } else {
                assert!(
                    result.is_err(),
                    "{} truncated to {cut} bytes must not decode",
                    case.file
                );
            }
        }
    }
}
