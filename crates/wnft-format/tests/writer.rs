/*
 *  writer.rs
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

//! §7.3 and §8.2 items 2, 3 and 7.
//!
//! **On byte identity.** §8.2 item 2's guarantee is scoped "same-implementation",
//! and item 3's was scoped the same way by 0.2 rev 4: this corpus was written by
//! the TypeScript codec, and §7.3's last paragraph leaves number formatting free
//! across languages (Q8). So the comparison here is item 4's — the `BIN\0`
//! chunk byte-identical, the manifest equal after parsing. That is the
//! conformance the specification actually requires of a second implementation,
//! and asserting more would be asserting something Q8 says is not yet decided.
//!
//! "Equal after parsing" is not the same as "equal as `serde_json::Value`s
//! without help": this writer stores `pyramid.scaleStep` and
//! `meta.physicalSizeMm` as typed `f64`s, and `serde_json`'s float formatter
//! renders a whole number like `2.0`, not `2` — while the TypeScript-written
//! corpus, having no separate integer type, writes the bare literal `2`.
//! `serde_json::Value`'s derived `PartialEq` is representation-sensitive
//! (`common::normalize_numbers`'s doc comment goes into why), so
//! `assert_conformant` below normalises both sides before comparing. That
//! normalisation only ever collapses *representations* of the same
//! mathematical value; it cannot mask a genuine mismatch.

mod common;

use wnft_format::{DEFAULT_LIMITS, ErrorCode, decode, encode};

/// §8.2 item 4's comparison: BIN byte-identical, manifests equal after
/// parsing (with `common::normalize_numbers` reconciling whole-number
/// representation differences the two implementations are free to disagree
/// on — see the module docs).
fn assert_conformant(actual: &[u8], expected: &[u8], what: &str) {
    let a = common::split(actual);
    let b = common::split(expected);
    assert_eq!(a.bin, b.bin, "{what}: the BIN chunk must be byte-identical");
    let mut am: serde_json::Value = serde_json::from_slice(&a.json).expect("manifest parses");
    let mut bm: serde_json::Value = serde_json::from_slice(&b.json).expect("manifest parses");
    common::normalize_numbers(&mut am);
    common::normalize_numbers(&mut bm);
    assert_eq!(am, bm, "{what}: the manifests must be equal after parsing");
}

#[test]
fn every_valid_fixture_round_trips() {
    // §8.2 item 2, at the scope item 4 fixes for a second implementation.
    for relative in common::valid_fixtures() {
        let bytes = common::read(&relative);
        let decoded = decode(&bytes, &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{relative} must decode, got {}", e.code));
        let re = encode(&decoded.target)
            .unwrap_or_else(|e| panic!("{relative} must re-encode, got {}", e.detail));
        assert_conformant(&re, &bytes, &relative);
    }
}

#[test]
fn every_noncanonical_fixture_re_encodes_to_its_counterpart() {
    // §8.2 item 3, second half: to the *counterpart*, not to the input. This is
    // what makes §7.3's "a decoder keeps only what it understands" testable
    // rather than a disclaimer — the unknown top-level key, the unknown
    // extension payload and the explicit empty params must all be gone.
    for case in common::noncanonical_cases() {
        let decoded = decode(&common::read(&case.file), &DEFAULT_LIMITS)
            .unwrap_or_else(|e| panic!("{} must decode, got {}", case.file, e.code));
        let re = encode(&decoded.target).expect("must re-encode");
        assert_conformant(&re, &common::read(&case.canonical), &case.file);
    }
}

#[test]
fn re_encoding_is_deterministic() {
    // §7.3's first line. Two encodes of the same target are the same bytes.
    let decoded =
        decode(&common::read("valid/several-sets.wnft"), &DEFAULT_LIMITS).expect("must decode");
    let a = encode(&decoded.target).expect("must encode");
    let b = encode(&decoded.target).expect("must encode");
    assert_eq!(a, b);
}

#[test]
fn params_keys_are_sorted_by_code_point_not_numerically() {
    // §7.3's note: JavaScript enumerates integer-like keys numerically and
    // first, so {"10":a,"9":b} serialises as "9" before "10", whereas code-point
    // order puts "10" first. Rust has the opposite hazard — none — but the
    // fixture exists to catch either, so it is exercised here too.
    let bytes = common::read("noncanonical/unsorted-params.wnft");
    let decoded = decode(&bytes, &DEFAULT_LIMITS).expect("must decode");
    let re = encode(&decoded.target).expect("must encode");
    assert_conformant(
        &re,
        &common::read("valid/params-numeric-keys.wnft"),
        "unsorted-params",
    );
    let manifest = String::from_utf8(common::split(&re).json).expect("utf-8");
    let ten = manifest.find("\"10\"").expect("the key \"10\" is present");
    let nine = manifest.find("\"9\"").expect("the key \"9\" is present");
    assert!(ten < nine, "code-point order puts \"10\" before \"9\"");
}

// --- §8.2 item 7: the writer rejects what the reader would -------------------

/// A decoded minimal target, with one value injected into its descriptor set's
/// `params` at the given key.
fn minimal_with_param(key: &str, value: serde_json::Value) -> wnft_format::Target {
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    target
        .descriptor_sets
        .get_mut(0)
        .expect("minimal has one set")
        .params
        .insert(key.to_string(), value);
    target
}

fn rejects(key: &str, value: serde_json::Value) {
    let error = encode(&minimal_with_param(key, value))
        .err()
        .unwrap_or_else(|| panic!("params.{key} must be refused"));
    assert_eq!(error.code, ErrorCode::InvalidTarget);
    assert!(
        error.detail.contains(key),
        "detail must name the offending path, got {:?}",
        error.detail
    );
}

#[test]
fn the_writer_accepts_the_baseline_before_the_offending_value_is_injected() {
    // Red-then-green scaffolding for every `rejects(...)` test below: prove
    // the accepted shape actually encodes on its own, so a passing `rejects`
    // call is known to fail *because of* the injected value and not for some
    // unrelated reason (a test that could never fail pins nothing).
    let baseline = minimal_with_param("ok", serde_json::json!("plain"));
    assert!(encode(&baseline).is_ok());
}

#[test]
fn the_writer_refuses_an_integer_at_two_to_the_53() {
    // Check (c). §7.3 makes the writer stricter than the reader here on purpose:
    // Q8 leaves number formatting free, so another implementation may write the
    // same value as an integer literal, which every conforming reader rejects.
    rejects("big", serde_json::json!(9_007_199_254_740_992i64));
}

#[test]
fn the_writer_accepts_the_largest_exactly_representable_integer() {
    // The boundary the check above must not overshoot.
    let target = minimal_with_param("big", serde_json::json!(9_007_199_254_740_991i64));
    assert!(encode(&target).is_ok());
}

#[test]
fn the_writer_refuses_a_noncharacter() {
    // Check (e). Built from a code unit rather than written as a literal, so
    // no source file here contains one. Check (b) (an unpaired surrogate) has
    // no test of its own: a Rust `String` cannot hold a lone surrogate at
    // all, so it is unreachable from a well-typed `Target` — see
    // `validate_target.rs`'s module docs and `string_units`'s doc comment for
    // where that unreachability is recorded instead of asserted here.
    let noncharacter = String::from_utf16(&[0xFDD0]).expect("U+FDD0 is well-formed");
    rejects("nc", serde_json::json!(noncharacter));
}

// --- task-8 review finding 1: checks (b)/(e) apply outside params/info too --

#[test]
fn the_writer_refuses_a_noncharacter_in_format_generator() {
    // §5's checks (b) and (e) apply to every string in the manifest, not
    // only the free-form content of `params`/`info` — the reader's own
    // `scan_ijson` scans the whole manifest text. `format.generator` is the
    // simplest manifest string outside a free-form object, so it stands in
    // for the whole "every other plain string" family this review flagged.
    let noncharacter = String::from_utf16(&[0xFDD0]).expect("U+FDD0 is well-formed");
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    assert!(encode(&target).is_ok(), "the baseline must encode first");
    target.generator = Some(noncharacter);
    let error = encode(&target).expect_err("a noncharacter in generator must be refused");
    assert_eq!(error.code, ErrorCode::InvalidTarget);
    assert!(
        error.detail.contains("format.generator"),
        "detail must name the offending path, got {:?}",
        error.detail
    );
}

#[test]
fn the_writer_refuses_a_noncharacter_in_a_descriptor_sets_producer() {
    // The other family: a descriptor set's own plain strings (`kind`,
    // `norm`, `producer`) are exactly as unconstrained by §5.6's domain as
    // `detector.kind` is, and exactly as bound by checks (b)/(e) as anything
    // else in the manifest. `producer` stands in for all three — `kind` and
    // `norm` go through the identical `string_offends` call in
    // `validate_descriptor_set`.
    let noncharacter = String::from_utf16(&[0xFDD0]).expect("U+FDD0 is well-formed");
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    assert!(encode(&target).is_ok(), "the baseline must encode first");
    target
        .descriptor_sets
        .get_mut(0)
        .expect("minimal has one set")
        .producer = noncharacter;
    let error = encode(&target).expect_err("a noncharacter in producer must be refused");
    assert_eq!(error.code, ErrorCode::InvalidTarget);
    assert!(
        error.detail.contains("producer"),
        "detail must name the offending path, got {:?}",
        error.detail
    );
}

#[test]
fn the_writer_refuses_a_non_finite_number() {
    // Checks (d) and the NaN rule of §7.3: JSON.stringify turns both into null,
    // and a file that decodes cleanly with a value silently changed is the one
    // outcome worse than a refused write. serde_json cannot even hold them, so
    // the guard lives where a Target could: physicalSizeMm and scaleStep.
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    // Prove the baseline (before the mutation) is itself encodable, so this
    // test cannot pass merely because *something else* about `target` is
    // already invalid.
    assert!(encode(&target).is_ok());
    target.meta.physical_size_mm = Some([f64::NAN, 96.0]);
    let error = encode(&target).expect_err("NaN must be refused");
    assert_eq!(error.code, ErrorCode::InvalidTarget);
    assert!(error.detail.contains("physicalSizeMm"));
}

// --- §8.3: evolution ---------------------------------------------------------

#[test]
fn a_later_minor_is_rejected() {
    // §8.3's first bullet, from the writer's side: a target claiming 0.3 is one
    // this build cannot write, because it would be claiming a meaning it does
    // not implement.
    let mut target = decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS)
        .expect("must decode")
        .target;
    assert!(encode(&target).is_ok());
    target.format_version = "0.3".to_string();
    assert_eq!(
        encode(&target).expect_err("0.3 must be refused").code,
        ErrorCode::InvalidTarget
    );
}

#[test]
fn a_preserved_unknown_kind_set_re_encodes_unchanged() {
    // §5.6 rev 3's hazard, from the writer's side: a set with an unknown
    // `kind` (known `elementType`) is "structurally understood" and MUST be
    // "preserved and re-emitted unchanged" on decode — a legal file that
    // decodes but cannot be re-emitted is exactly what that revision exists
    // to rule out. `tests/corpus.rs` already covers the *decode* half (the
    // set survives, §8.1's warning fires); this is the *encode* half §8.1
    // states as its reason for the fixture existing at all.
    //
    // This fixture is not itself in canonical order (its three sets are
    // "wombat", "orb", "teblid" in the file, not sorted by (kind, norm,
    // dimensions, producer)), so re-encoding it legitimately reorders them —
    // §7.3 requires that sort, and §7.3 only promises byte/member identity
    // for a fixture already in canonical form (§8.2 item 2). So "unchanged"
    // here is checked as a value round trip modulo that reordering: sort
    // both sides' `descriptorSets` by the same key before comparing, so the
    // assertion is about each set's own fields (kind included) surviving
    // intact, not about the array position the source file happened to use.
    let decoded = decode(
        &common::read("warnings/unknown-descriptor-kind.wnft"),
        &DEFAULT_LIMITS,
    )
    .expect("must decode");
    assert!(
        decoded.target.descriptor_sets.len() >= 2,
        "the unknown-kind set is preserved beside the valid one (§5.6)"
    );
    let re = encode(&decoded.target).expect("must re-encode");
    let round_tripped = decode(&re, &DEFAULT_LIMITS)
        .expect("the canonical re-encode must itself decode")
        .target;

    fn sort_key(set: &wnft_format::DescriptorSet) -> (String, String, u32, String) {
        (
            set.kind.clone(),
            set.norm.clone(),
            set.dimensions,
            set.producer.clone(),
        )
    }
    let mut before = decoded.target;
    let mut after = round_tripped;
    before.descriptor_sets.sort_by_key(sort_key);
    after.descriptor_sets.sort_by_key(sort_key);
    assert_eq!(
        after, before,
        "the unknown-kind set (and everything else) must survive encode unchanged"
    );
}

#[test]
fn a_dropped_unknown_element_type_set_does_not_reappear() {
    // §5.6 rev 3's other half: a set with an unknown `elementType` is
    // dropped on decode, and §7.3's "a decoder keeps only what it
    // understands, and the canonical writer emits only that" means it MUST
    // NOT reappear on re-encode either.
    let bytes = common::read("warnings/unknown-element-type.wnft");
    let decoded = decode(&bytes, &DEFAULT_LIMITS).expect("must decode");
    let re = encode(&decoded.target).expect("must re-encode");
    // The dropped set's family/norm/producer identify it uniquely against
    // whatever the valid set in the same fixture carries; asserting its
    // count of descriptor sets shrank (rather than merely "some set with an
    // unknown elementType is gone") pins the exact hazard §5.6 rev 3 names:
    // a decoded target with N sets must re-encode with exactly the sets it
    // actually carries, not the file's original N.
    let source_sets = {
        let source_manifest: serde_json::Value =
            serde_json::from_slice(&common::split(&bytes).json).expect("manifest parses");
        source_manifest["descriptorSets"]
            .as_array()
            .expect("descriptorSets is an array")
            .len()
    };
    assert!(
        decoded.target.descriptor_sets.len() < source_sets,
        "the unknown-elementType set must have been dropped on decode"
    );
    let re_manifest: serde_json::Value =
        serde_json::from_slice(&common::split(&re).json).expect("manifest parses");
    let re_sets = re_manifest["descriptorSets"]
        .as_array()
        .expect("descriptorSets is an array")
        .len();
    assert_eq!(
        re_sets,
        decoded.target.descriptor_sets.len(),
        "re-encoding must not resurrect the dropped set"
    );
}
