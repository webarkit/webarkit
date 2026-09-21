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
  "format": { "version": "0.3" },
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
  "format": { "version": "0.3" },
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
        "format": { "version": "0.3", "generator": "gen" },
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

/// Every optional key's response to an *explicit* `null`. §5.1 now states the
/// rule for all eight and it is uniform: `BAD_MANIFEST`, never "the same as
/// absent".
///
/// It was not always uniform. Through format `0.2`, `extensionsUsed` and
/// `extensionsRequired` accepted `null` as `[]`, which this crate matched
/// deliberately because the peer's `?? []` did — a divergence on untrusted
/// input being worse than an enshrined-and-named quirk. Format `0.3` removes
/// the exception, so the two tests below moved from "accepted as empty" to
/// "rejected", and the pair is no longer special.
#[test]
fn null_format_generator_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["format"]["generator"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let err = decode_manifest(&bytes, &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_extensions_used_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["extensionsUsed"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let err = decode_manifest(&bytes, &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn null_extensions_required_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["extensionsRequired"] = serde_json::Value::Null;
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let err = decode_manifest(&bytes, &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn an_absent_extension_array_is_still_empty() {
    // The other half of the narrowing: absent still means `[]`. Rejecting
    // `null` must not be implemented by making the key required.
    let mut manifest = base_manifest();
    manifest
        .as_object_mut()
        .expect("the base manifest is an object")
        .remove("extensionsUsed");
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    assert_eq!(warnings, vec![]);
    assert_eq!(head.extensions_used, Vec::<String>::new());
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

/// §5.2: two accessors overlap when their byte ranges intersect. This is the
/// most intricate piece of logic in the module — sort by start, filter out
/// zero-length spans first, compare neighbours — so it gets its own tests
/// for both directions: overlap rejected, and the zero-length exemption that
/// lets two accessors legally share an offset.
#[test]
fn overlapping_accessors_are_bad_layout() {
    let mut manifest = base_manifest();
    // Accessor 0 ("levelStart") owns bytes [0, 12). This one owns [5, 6) —
    // inside it.
    manifest["accessors"]
        .as_array_mut()
        .expect("accessors is an array")
        .push(serde_json::json!({ "offset": 5, "count": 1, "type": "u8" }));
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadLayout);
}

#[test]
fn zero_length_accessors_may_share_an_offset() {
    let mut manifest = base_manifest();
    let accessors = manifest["accessors"]
        .as_array_mut()
        .expect("accessors is an array");
    // Two zero-length accessors at the same offset: neither owns a byte, so
    // §5.2's "each array owns its bytes" has nothing for them to violate.
    accessors.push(serde_json::json!({ "offset": 0, "count": 0, "type": "u8" }));
    accessors.push(serde_json::json!({ "offset": 0, "count": 0, "type": "u16" }));
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    assert_eq!(warnings, vec![]);
    let (_spec, warnings) =
        validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect("validate_manifest");
    assert_eq!(warnings, vec![]);
}

/// §5.2 rev 2: the bound check alone (`offset + count * size <= bin_length`)
/// would not catch a manifest whose accessors all have `count: 0` and whose
/// file has no `BIN\0` chunk at all — `0 <= 0` passes trivially. The explicit
/// "at least one accessor, no BIN chunk" check exists for exactly this case.
#[test]
fn accessors_with_no_bin_chunk_and_every_count_zero_is_bad_layout() {
    let mut manifest = base_manifest();
    for accessor in manifest["accessors"]
        .as_array_mut()
        .expect("accessors is an array")
    {
        accessor["count"] = serde_json::json!(0);
    }
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, None, &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadLayout);
}

/// §5.2: `offset` must be a multiple of the element size. The
/// `accessor-fractional-offset` fixture tests the *domain* (a fractional
/// literal); this tests *alignment* of an otherwise perfectly legal integer
/// offset — a distinct rule, previously untested.
#[test]
fn misaligned_offset_is_bad_layout() {
    let mut manifest = base_manifest();
    // Accessor 0 is `u32` (element size 4); offset 2 is in-domain and
    // in-bounds, but not a multiple of 4.
    manifest["accessors"][0]["offset"] = serde_json::json!(2);
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadLayout);
}

/// §5.2: "every field that references an accessor fixes the expected `type`
/// and `count`. A mismatch is `BAD_LAYOUT`" — a valid index into `accessors`
/// is not enough on its own.
#[test]
fn accessor_reference_with_wrong_type_is_bad_layout() {
    let mut manifest = base_manifest();
    // Accessor 1 ("x") is referenced expecting `f32`; retype it to `u32`
    // (same element size, so this isolates the type mismatch from any
    // alignment or bounds effect).
    manifest["accessors"][1]["type"] = serde_json::json!("u32");
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadLayout);
}

#[test]
fn accessor_reference_with_wrong_count_is_bad_layout() {
    let mut manifest = base_manifest();
    // Accessor 1 ("x") is referenced expecting count 20 (`N`); 19 keeps it
    // in-domain, in-bounds and non-overlapping, isolating the count mismatch.
    manifest["accessors"][1]["count"] = serde_json::json!(19);
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadLayout);
}

/// §5.6 rev 3 and §5.7 rev 4 are deliberately asymmetric: a descriptor set's
/// `dimensions: 0` is legal (a set whose descriptors carry nothing), while
/// `patches.patchSize: 0` is not (a patch of no pixels records a position at
/// which nothing was sampled). Asserting both directions pins that the two
/// revisions did not get merged into one rule by accident.
#[test]
fn dimensions_zero_is_accepted_but_patch_size_zero_is_rejected() {
    let mut with_zero_dimensions = base_manifest();
    with_zero_dimensions["descriptorSets"][0]["dimensions"] = serde_json::json!(0);
    with_zero_dimensions["descriptorSets"][0]["bytesPerDescriptor"] = serde_json::json!(0);
    // The "data" accessor (index 8) must now be zero-length too: its expected
    // count is `M * bytesPerDescriptor = 20 * 0 = 0`.
    with_zero_dimensions["accessors"][8]["count"] = serde_json::json!(0);
    let bytes = serde_json::to_vec(&with_zero_dimensions).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let (_spec, warnings) =
        validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect("dimensions: 0 is legal");
    assert_eq!(warnings, vec![]);

    let mut with_zero_patch_size = base_manifest();
    // `patchSize`'s domain check runs before `count` or any accessor
    // reference is read, so a minimal object is enough to reach it.
    with_zero_patch_size["patches"] = serde_json::json!({ "patchSize": 0 });
    let bytes = serde_json::to_vec(&with_zero_patch_size).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err =
        validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect_err("patchSize: 0 is illegal");
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn bytes_per_descriptor_mismatch_is_inconsistent_data() {
    let mut manifest = base_manifest();
    // dimensions: 256 bits -> bytesPerDescriptor must be 32; 31 does not match.
    manifest["descriptorSets"][0]["bytesPerDescriptor"] = serde_json::json!(31);
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::InconsistentData);
}

#[test]
fn duplicate_descriptor_set_key_is_inconsistent_data() {
    let mut manifest = base_manifest();
    let duplicate = manifest["descriptorSets"][0].clone();
    manifest["descriptorSets"]
        .as_array_mut()
        .expect("descriptorSets is an array")
        .push(duplicate);
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::InconsistentData);
}

#[test]
fn non_object_top_level_is_bad_manifest() {
    let err = decode_manifest(b"[1,2,3]", &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

/// §5.1/§6.1 step 5: the subset rule is checked *first*, as `BAD_MANIFEST` —
/// a name in `extensionsRequired` that is both absent from `extensionsUsed`
/// and unimplemented must report the structural failure, not
/// `UNSUPPORTED_EXTENSION`.
#[test]
fn extensions_required_not_in_extensions_used_is_bad_manifest_not_unsupported_extension() {
    let mut manifest = base_manifest();
    manifest["extensionsRequired"] = serde_json::json!(["WKNF_multiview"]);
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let err = decode_manifest(&bytes, &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

#[test]
fn max_levels_limit_exceeded() {
    let manifest = base_manifest();
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let limits = Limits {
        max_levels: 1,
        ..DEFAULT_LIMITS
    };
    let (head, _warnings) = decode_manifest(&bytes, &limits).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &limits).unwrap_err();
    assert_eq!(err.code, ErrorCode::LimitExceeded);
}

#[test]
fn max_descriptor_sets_limit_exceeded() {
    let manifest = base_manifest();
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let limits = Limits {
        max_descriptor_sets: 0,
        ..DEFAULT_LIMITS
    };
    let (head, _warnings) = decode_manifest(&bytes, &limits).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &limits).unwrap_err();
    assert_eq!(err.code, ErrorCode::LimitExceeded);
}

#[test]
fn max_patch_size_limit_exceeded() {
    let mut manifest = base_manifest();
    manifest["patches"] = serde_json::json!({ "patchSize": 8 });
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let limits = Limits {
        max_patch_size: 4,
        ..DEFAULT_LIMITS
    };
    let (head, _warnings) = decode_manifest(&bytes, &limits).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &limits).unwrap_err();
    assert_eq!(err.code, ErrorCode::LimitExceeded);
}

#[test]
fn max_patches_limit_exceeded() {
    let mut manifest = base_manifest();
    manifest["patches"] = serde_json::json!({ "patchSize": 8, "count": 10 });
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let limits = Limits {
        max_patches: 5,
        ..DEFAULT_LIMITS
    };
    let (head, _warnings) = decode_manifest(&bytes, &limits).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &limits).unwrap_err();
    assert_eq!(err.code, ErrorCode::LimitExceeded);
}

#[test]
fn empty_descriptor_sets_is_bad_manifest() {
    let mut manifest = base_manifest();
    manifest["descriptorSets"] = serde_json::json!([]);
    let bytes = serde_json::to_vec(&manifest).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err = validate_manifest(head, Some(1096), &DEFAULT_LIMITS).unwrap_err();
    assert_eq!(err.code, ErrorCode::BadManifest);
}

/// Pins `number_as_u32` (the Finding-1 fix) in both directions: a JSON number
/// with no fractional *value* is accepted even when `serde_json` stored it as
/// an `f64` because the literal carried a decimal point — `20.0` for
/// `keypoints.count` and for a `levelSizes` entry — while a genuinely
/// fractional value is still rejected.
#[test]
fn value_level_integer_domain_accepts_whole_floats_and_rejects_fractions() {
    let mut with_whole_float_count = base_manifest();
    with_whole_float_count["keypoints"]["count"] = serde_json::json!(20.0);
    let bytes = serde_json::to_vec(&with_whole_float_count).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let (_spec, warnings) =
        validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect("20.0 is a legal count");
    assert_eq!(warnings, vec![]);

    let mut with_whole_float_level_size = base_manifest();
    with_whole_float_level_size["pyramid"]["levelSizes"][1][0] = serde_json::json!(20.0);
    let bytes = serde_json::to_vec(&with_whole_float_level_size).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect("20.0 is a legal level size");

    let mut with_fractional_count = base_manifest();
    with_fractional_count["keypoints"]["count"] = serde_json::json!(20.5);
    let bytes = serde_json::to_vec(&with_fractional_count).expect("serialize");
    let (head, _warnings) = decode_manifest(&bytes, &DEFAULT_LIMITS).expect("decode_manifest");
    let err =
        validate_manifest(head, Some(1096), &DEFAULT_LIMITS).expect_err("20.5 is not an integer");
    assert_eq!(err.code, ErrorCode::BadManifest);
}
