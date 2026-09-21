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

use wnft_format::{DEFAULT_LIMITS, Decoded, ErrorCode, decode};

#[test]
fn every_frozen_version_is_rejected_for_being_that_version() {
    // §8.3 requires a reader to decode a frozen corpus correctly or reject it
    // explicitly, never misread it. Under §7.1's exact-minor rule for `0.x`
    // the obligation is sharper than that floor: a file of a frozen minor is
    // refused for *being* that minor, and not for some incidental reason that
    // could stop applying if those bytes were ever regenerated.
    for version in common::FROZEN_VERSIONS {
        let dir = common::frozen_corpus(version).join("valid");
        let mut seen = 0usize;
        for entry in std::fs::read_dir(&dir).expect("the frozen valid/ directory") {
            let path = entry.expect("a directory entry").path();
            if path.extension().and_then(|e| e.to_str()) != Some("wnft") {
                continue;
            }
            let bytes = std::fs::read(&path).expect("reading a frozen fixture");
            let err = decode(&bytes, &DEFAULT_LIMITS)
                .err()
                .unwrap_or_else(|| panic!("{} decoded, but {version} is frozen", path.display()));
            assert_eq!(
                err.code,
                ErrorCode::UnsupportedFormatVersion,
                "{}",
                path.display()
            );
            seen += 1;
        }
        assert!(seen > 0, "the frozen {version} corpus has no valid/ files");
    }
}

#[test]
fn the_corpus_is_the_version_this_build_reads() {
    let e = common::expectations();
    assert_eq!(e.format_version, "0.3");

    // Lower bounds, not exact counts: the corpus is allowed to grow without a
    // change to this file (that is the whole point of driving these suites
    // from `expectations.json` rather than listing fixtures by hand). But a
    // well-formed index with every category emptied out would otherwise make
    // six of this file's seven tests iterate zero times, pass, and report
    // 7/7 green while establishing nothing — this guards against exactly
    // that silent-empty-corpus failure mode.
    assert!(e.valid.len() >= 8, "valid corpus shrank below 8 cases");
    assert!(
        e.invalid.len() >= 36,
        "invalid corpus shrank below 36 cases"
    );
    assert!(
        e.warnings.len() >= 5,
        "warnings corpus shrank below 5 cases"
    );
    assert!(
        e.noncanonical.len() >= 6,
        "noncanonical corpus shrank below 6 cases"
    );
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
    // re-encoding half is in tests/writer.rs.
    //
    // "The same values" is compared after putting `descriptorSets` in §7.3's
    // canonical order. §5.6 has the reader preserve the file's order rather
    // than normalise it, so `noncanonical/unsorted-sets` decodes to its
    // counterpart in every respect except that one — and comparing raw would
    // fail it for the single reason the pair exists to test. The tolerance is
    // confined to this half: writer.rs still demands byte identity, which is
    // what proves the writer re-sorts.
    for case in common::expectations().noncanonical {
        let mut a = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let mut b = decode(&common::read(&case.canonical), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.canonical, e.code));
        sort_sets(&mut a.target);
        sort_sets(&mut b.target);
        assert_eq!(a.target, b.target, "{} vs {}", case.file, case.canonical);
    }
}

/// `descriptorSets` in §7.3's canonical order: by `kind`, `norm`,
/// `dimensions`, `producer`. §5.6 makes that key unique across a file's sets,
/// so the sort is total and this cannot mask a difference of its own.
fn sort_sets(target: &mut wnft_format::Target) {
    target.descriptor_sets.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then_with(|| a.norm.cmp(&b.norm))
            .then_with(|| a.dimensions.cmp(&b.dimensions))
            .then_with(|| a.producer.cmp(&b.producer))
    });
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
