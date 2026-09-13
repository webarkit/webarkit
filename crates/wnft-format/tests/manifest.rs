/*
 *  manifest.rs
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

//! §6.1 steps 3 to 6, against the fixtures that reach them.
//!
//! Every fixture here frames and checksums correctly (Task 3 covers the ones
//! that do not) and fails — or warns — for a reason the manifest layer owns.

mod common;

use wnft_format::testing::{decode_manifest, parse_container, validate_manifest};
use wnft_format::{DEFAULT_LIMITS, ErrorCode, Limits, WarningCode};

/// Run steps 3 to 6 on a fixture, with the limits the corpus prescribes.
fn run(relative: &str, limits: &Limits) -> Result<Vec<WarningCode>, ErrorCode> {
    let bytes = common::read(relative);
    let parsed = parse_container(&bytes).map_err(|e| e.code)?;
    let start = parsed.json.data_start;
    let json = bytes
        .get(start..start + parsed.json.length)
        .expect("in bounds");
    let (head, mut warnings) = decode_manifest(json, limits).map_err(|e| e.code)?;
    let bin = parsed.bin.map(|b| b.length);
    let (_spec, more) = validate_manifest(head, bin, limits).map_err(|e| e.code)?;
    warnings.extend(more);
    Ok(warnings.into_iter().map(|w| w.code).collect())
}

fn code(relative: &str) -> ErrorCode {
    run(relative, &DEFAULT_LIMITS).expect_err("this fixture must fail")
}

#[test]
fn step_3_rejects_a_manifest_above_the_limit_before_decoding_it() {
    // expectations.json gives this fixture maxManifestBytes: 32.
    let limits = Limits {
        max_manifest_bytes: 32,
        ..DEFAULT_LIMITS
    };
    assert_eq!(
        run("invalid/manifest-too-large.wnft", &limits).unwrap_err(),
        ErrorCode::ManifestTooLarge
    );
}

#[test]
fn step_4_rejects_bad_text_and_bad_json() {
    assert_eq!(
        code("invalid/bad-manifest-not-utf8.wnft"),
        ErrorCode::BadManifest
    );
    assert_eq!(
        code("invalid/bad-manifest-not-json.wnft"),
        ErrorCode::BadManifest
    );
}

#[test]
fn step_4_rejects_every_i_json_violation() {
    for relative in [
        "invalid/ijson-duplicate-key.wnft",
        "invalid/ijson-duplicate-key-escaped.wnft",
        "invalid/ijson-unpaired-surrogate.wnft",
        "invalid/ijson-integer-2p53.wnft",
        "invalid/ijson-infinity.wnft",
        "invalid/ijson-raw-noncharacter.wnft",
        "invalid/ijson-noncharacter-in-name.wnft",
    ] {
        assert_eq!(code(relative), ErrorCode::BadManifest, "{relative}");
    }
}

#[test]
fn step_5_rejects_a_later_minor_and_an_unimplemented_required_extension() {
    // §7.1: while the major is 0 a reader accepts nothing but its own exact
    // minor, or it would silently misread a file that broke the one before.
    assert_eq!(
        code("invalid/unsupported-format-version.wnft"),
        ErrorCode::UnsupportedFormatVersion
    );
    assert_eq!(
        code("invalid/unsupported-extension.wnft"),
        ErrorCode::UnsupportedExtension
    );
}

#[test]
fn step_5_prunes_an_unknown_optional_extension_and_warns() {
    assert_eq!(
        run("warnings/unknown-extension.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnknownExtensionIgnored]
    );
}

#[test]
fn step_6_rejects_every_accessor_domain_violation() {
    // §5.2: offset and count are integers in [0, 2^32 − 1], rejected *before*
    // any arithmetic uses them, and an accessor reference is an integer index.
    for relative in [
        "invalid/accessor-fractional-offset.wnft",
        "invalid/accessor-negative-count.wnft",
        "invalid/accessor-count-above-u32.wnft",
        "invalid/accessor-ref-not-index.wnft",
    ] {
        assert_eq!(code(relative), ErrorCode::BadManifest, "{relative}");
    }
}

#[test]
fn step_6_rejects_an_accessor_past_the_bin_chunk() {
    assert_eq!(
        code("invalid/bad-layout-out-of-bounds.wnft"),
        ErrorCode::BadLayout
    );
}

#[test]
fn step_6_rejects_every_pyramid_domain_violation() {
    // §5.4: level sizes are integers in [1, 2^16 − 1] and scaleStep is finite
    // and > 1 — a zero size or a step of 1 makes §3's mapping meaningless.
    for relative in [
        "invalid/level-size-zero.wnft",
        "invalid/level-size-above-u16.wnft",
        "invalid/scale-step-one.wnft",
    ] {
        assert_eq!(code(relative), ErrorCode::BadManifest, "{relative}");
    }
}

#[test]
fn step_6_enforces_the_resource_limits() {
    // expectations.json gives this fixture maxKeypoints: 4.
    let limits = Limits {
        max_keypoints: 4,
        ..DEFAULT_LIMITS
    };
    assert_eq!(
        run("invalid/limit-exceeded-keypoints.wnft", &limits).unwrap_err(),
        ErrorCode::LimitExceeded
    );
}

#[test]
fn an_unknown_kind_or_norm_is_kept_and_warned_about() {
    // §5.6: structurally understood, so it is preserved and re-emitted
    // unchanged. It stays unusable and still warns.
    assert_eq!(
        run("warnings/unknown-descriptor-kind.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnsupportedDescriptorSet]
    );
    assert_eq!(
        run("warnings/unknown-norm.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnsupportedDescriptorSet]
    );
}

#[test]
fn an_unknown_element_type_is_dropped_and_warned_about() {
    // §5.6: nothing says how wide an element is, so the set cannot be
    // interpreted at all and is dropped *before* its accessors are read — or a
    // broken one would report BAD_LAYOUT instead of warning.
    assert_eq!(
        run("warnings/unknown-element-type.wnft", &DEFAULT_LIMITS).unwrap(),
        vec![WarningCode::UnsupportedDescriptorSet]
    );
}

#[test]
fn every_valid_fixture_passes_steps_3_to_6_with_no_warnings() {
    for relative in [
        "valid/minimal.wnft",
        "valid/several-sets.wnft",
        "valid/single-level.wnft",
        "valid/zero-keypoints.wnft",
        "valid/no-patches.wnft",
        "valid/reference-image.wnft",
        "valid/boundary-max-safe-integer.wnft",
        "valid/params-numeric-keys.wnft",
    ] {
        assert_eq!(
            run(relative, &DEFAULT_LIMITS).unwrap(),
            vec![],
            "{relative}"
        );
    }
}
