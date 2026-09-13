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

/// A minimal, otherwise-valid manifest, with `meta.physicalSizeMm: null`.
/// `accessors` covers a 1096-byte `BIN` chunk (the `data` accessor ends at
/// `456 + 640 = 1096`).
const MANIFEST_WITH_NULL_PHYSICAL_SIZE_MM: &str = r#"{
  "format": { "version": "0.2" },
  "meta": { "widthPx": 64, "heightPx": 48, "physicalSizeMm": null },
  "pyramid": { "scaleStep": 2, "levelSizes": [[64, 48], [32, 24]] },
  "keypoints": {
    "count": 20,
    "detector": { "kind": "fast" },
    "levelStart": 0, "x": 1, "y": 2, "angle": 3, "score": 4, "level": 5
  },
  "descriptorSets": [
    {
      "kind": "orb", "norm": "hamming", "elementType": "bits",
      "dimensions": 256, "bytesPerDescriptor": 32, "producer": "jsfeatnext",
      "count": 20, "levelStart": 6, "kpIndex": 7, "data": 8
    }
  ],
  "accessors": [
    { "offset": 0, "count": 3, "type": "u32" },
    { "offset": 16, "count": 20, "type": "f32" },
    { "offset": 96, "count": 20, "type": "f32" },
    { "offset": 176, "count": 20, "type": "f32" },
    { "offset": 256, "count": 20, "type": "f32" },
    { "offset": 336, "count": 20, "type": "u8" },
    { "offset": 360, "count": 3, "type": "u32" },
    { "offset": 376, "count": 20, "type": "u32" },
    { "offset": 456, "count": 640, "type": "u8" }
  ]
}"#;

/// The same manifest, but `meta` omits `physicalSizeMm` entirely rather than
/// carrying it as `null`.
const MANIFEST_MISSING_PHYSICAL_SIZE_MM: &str = r#"{
  "format": { "version": "0.2" },
  "meta": { "widthPx": 64, "heightPx": 48 },
  "pyramid": { "scaleStep": 2, "levelSizes": [[64, 48], [32, 24]] },
  "keypoints": {
    "count": 20,
    "detector": { "kind": "fast" },
    "levelStart": 0, "x": 1, "y": 2, "angle": 3, "score": 4, "level": 5
  },
  "descriptorSets": [
    {
      "kind": "orb", "norm": "hamming", "elementType": "bits",
      "dimensions": 256, "bytesPerDescriptor": 32, "producer": "jsfeatnext",
      "count": 20, "levelStart": 6, "kpIndex": 7, "data": 8
    }
  ],
  "accessors": [
    { "offset": 0, "count": 3, "type": "u32" },
    { "offset": 16, "count": 20, "type": "f32" },
    { "offset": 96, "count": 20, "type": "f32" },
    { "offset": 176, "count": 20, "type": "f32" },
    { "offset": 256, "count": 20, "type": "f32" },
    { "offset": 336, "count": 20, "type": "u8" },
    { "offset": 360, "count": 3, "type": "u32" },
    { "offset": 376, "count": 20, "type": "u32" },
    { "offset": 456, "count": 640, "type": "u8" }
  ]
}"#;

/// §1 requires two conforming decoders to agree on every legal file, and the
/// peer TypeScript codec's own check (`if (sizeMmRaw !== null) { ... }`)
/// already rejects a manifest whose `meta` omits `physicalSizeMm` — `undefined
/// !== null` sends it into the validating branch, which then fails on a
/// non-array. This crate must reject the same file, even though §5.3's prose
/// never spells out that the *key* (as opposed to the value it may hold) is
/// required. An explicit `null`, by contrast, is squarely inside §5.3's
/// documented domain and must decode to `None`.
#[test]
fn meta_physical_size_mm_null_decodes_to_none_but_absent_key_is_bad_manifest() {
    let (head, warnings) = decode_manifest(
        MANIFEST_WITH_NULL_PHYSICAL_SIZE_MM.as_bytes(),
        &DEFAULT_LIMITS,
    )
    .expect("decode_manifest");
    assert_eq!(warnings, vec![]);
    let (spec, warnings) =
        validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect("validate_manifest");
    assert_eq!(warnings, vec![]);
    assert_eq!(spec.meta.physical_size_mm, None);

    let (head, _warnings) = decode_manifest(
        MANIFEST_MISSING_PHYSICAL_SIZE_MM.as_bytes(),
        &DEFAULT_LIMITS,
    )
    .expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS)
        .expect_err("an absent meta.physicalSizeMm must be BAD_MANIFEST");
    assert_eq!(err.code, ErrorCode::BadManifest);
}

/// A minimal, fully valid manifest as a `serde_json::Value`, so each test
/// below can flip exactly one key to an explicit `null` without hand-editing
/// JSON text. `accessors` covers a 1096-byte `BIN` chunk (the `data`
/// accessor ends at `456 + 640 = 1096`) — every test below that reaches
/// `validate_manifest` passes that same length.
fn base_manifest() -> serde_json::Value {
    serde_json::json!({
        "format": { "version": "0.2", "generator": "gen" },
        "meta": { "widthPx": 64, "heightPx": 48, "physicalSizeMm": [128.0, 96.0] },
        "pyramid": { "scaleStep": 2.0, "levelSizes": [[64, 48], [32, 24]] },
        "keypoints": {
            "count": 20,
            "detector": { "kind": "fast" },
            "levelStart": 0, "x": 1, "y": 2, "angle": 3, "score": 4, "level": 5
        },
        "descriptorSets": [
            {
                "kind": "orb", "norm": "hamming", "elementType": "bits",
                "dimensions": 256, "bytesPerDescriptor": 32, "producer": "jsfeatnext",
                "count": 20, "levelStart": 6, "kpIndex": 7, "data": 8
            }
        ],
        "accessors": [
            { "offset": 0, "count": 3, "type": "u32" },
            { "offset": 16, "count": 20, "type": "f32" },
            { "offset": 96, "count": 20, "type": "f32" },
            { "offset": 176, "count": 20, "type": "f32" },
            { "offset": 256, "count": 20, "type": "f32" },
            { "offset": 336, "count": 20, "type": "u8" },
            { "offset": 360, "count": 3, "type": "u32" },
            { "offset": 376, "count": 20, "type": "u32" },
            { "offset": 456, "count": 640, "type": "u8" }
        ]
    })
}

/// Every optional key's response to an *explicit* `null`, matched row for row
/// against the peer TypeScript codec's `manifest.ts` (verified by the
/// coordinator's ruling, not re-derived from the specification text, which is
/// silent on all eight). `format.generator`, the two `params` objects,
/// `patches`, `referenceImage` and `info` all reject `null` as `BAD_MANIFEST`
/// in the peer (each checks `!== undefined` and then a type, so `null` falls
/// through to the type check and fails it); `extensionsUsed` and
/// `extensionsRequired` are the peer's one inconsistent pair, both read with
/// `?? []`, which is why they alone accept `null` as `[]` (see the comment on
/// `read_string_array`).
#[test]
fn null_format_generator_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["format"]["generator"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let err = decode_manifest(&bytes, &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_extensions_used_is_accepted_as_empty() {
    let mut manifest = base_manifest();
    manifest["extensionsUsed"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    assert_eq!(warnings, vec![]);
    assert_eq!(head.extensions_used, Vec::<String>::new());
}

#[test]
fn null_extensions_required_is_accepted_as_empty() {
    let mut manifest = base_manifest();
    manifest["extensionsRequired"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    assert_eq!(warnings, vec![]);
    assert_eq!(head.extensions_required, Vec::<String>::new());
}

#[test]
fn null_keypoints_detector_params_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["keypoints"]["detector"]["params"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_descriptor_set_params_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["descriptorSets"][0]["params"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_patches_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["patches"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_reference_image_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["referenceImage"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_info_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["info"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}
