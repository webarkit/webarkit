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

//! The manifest: §6.1 steps 3 to 6.
//!
//! [`decode_manifest`] gets a JSON value out of untrusted bytes (step 4), then
//! checks `format.version` and the extension rules (step 5). [`validate_manifest`]
//! then checks the schema (step 6): every accessor domain, the pyramid, `meta`,
//! `keypoints`, `descriptorSets`, `patches`, `referenceImage` and `info`, plus
//! the resource limits of §6.4.
//!
//! Nothing here reads array **contents** — that is step 7 (Task 7's job) — and
//! nothing here calls [`crate::arrays::materialise`]. An accessor-referencing
//! manifest field resolves to a `usize` **index** into `accessors`, not to a
//! copied array: §6.1's whole point is that a reader never allocates in
//! proportion to a size before that size has been checked, and every count and
//! index here is settled with checked arithmetic before it is ever used to
//! size an allocation.
//!
//! # Validation order
//!
//! §6.1 step 6 is explicit that the order is normative, not stylistic:
//! accessors first, because every other field references them by index; then
//! the pyramid, because `L` fixes how long every `levelStart` accessor must be;
//! then the rest. Within a descriptor set, an unknown `elementType` is dropped
//! — with a warning — **before** its accessors are read, or a set that §5.6
//! says to skip silently would instead report `BAD_LAYOUT` for accessors that
//! were never meant to be validated.

use alloc::borrow::ToOwned;
use alloc::collections::BTreeSet;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

use serde_json::{Map, Value};

use crate::error::{DecodeError, ErrorCode, Warning, WarningCode, fail};
use crate::ijson::scan_ijson;
use crate::known::{
    IMPLEMENTED_EXTENSIONS, KNOWN_DESCRIPTOR_KINDS, KNOWN_DESCRIPTOR_NORMS, KNOWN_ELEMENT_TYPES,
    SUPPORTED_FORMAT_VERSION,
};
use crate::limits::Limits;
use crate::rules::U16_DOMAIN_MAX;
use crate::target::Params;

// Re-exported so a caller reaching for the accessor vocabulary can do it
// through this module rather than `crate::arrays` directly (Task 5's types are
// declared in `arrays.rs` so that task stayed self-contained).
pub(crate) use crate::arrays::{Accessor, AccessorType, element_size};

/// What steps 3 to 5 produce: the parsed manifest object, not yet
/// schema-checked, plus the three fields step 5 already settled.
///
/// `doc` keeps every top-level key — `meta`, `pyramid`, `keypoints`,
/// `descriptorSets`, `patches`, `referenceImage`, `info`, `accessors` — for
/// [`validate_manifest`] to read in step 6. `format.version` itself is not
/// stored: once step 5 has accepted it, its only legal value is
/// [`SUPPORTED_FORMAT_VERSION`], so there is nothing left to carry.
#[derive(Clone, Debug, PartialEq)]
pub struct ManifestHead {
    /// The manifest's top-level JSON object.
    pub doc: Map<String, Value>,
    /// `format.generator`, free text. Optional (§5.1).
    pub generator: Option<String>,
    /// `extensionsUsed` (§5.1), with every name this build does not
    /// implement already pruned (§7.3) and warned about.
    pub extensions_used: Vec<String>,
    /// `extensionsRequired` (§5.1): every name here is one this build
    /// implements, or `decode_manifest` would already have failed with
    /// `UNSUPPORTED_EXTENSION`.
    pub extensions_required: Vec<String>,
}

/// `meta` (§5.3), schema-checked but not yet cross-checked against
/// `pyramid.levelSizes[0]` — that equality is step 7, `INCONSISTENT_DATA`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ManifestMeta {
    /// `widthPx`, an integer in `[1, 2^16 − 1]`.
    pub width_px: u32,
    /// `heightPx`, an integer in `[1, 2^16 − 1]`.
    pub height_px: u32,
    /// `physicalSizeMm`: `[width, height]` in millimetres, both `> 0`, or
    /// `None` when the manifest carries an explicit `null`. The key itself
    /// is required — an absent key is `BAD_MANIFEST` (§1, §7.3; see the
    /// comment at the parse site).
    pub physical_size_mm: Option<[f64; 2]>,
}

/// `pyramid` (§5.4), schema-checked. `levelSizes` being non-increasing is
/// step 7, not here.
#[derive(Clone, Debug, PartialEq)]
pub struct ManifestPyramid {
    /// `scaleStep`: finite, `> 1`.
    pub scale_step: f64,
    /// `levelSizes`, `L` entries, each `[width, height]` with both an
    /// integer in `[1, 2^16 − 1]`.
    pub level_sizes: Vec<[u32; 2]>,
}

/// `keypoints` (§5.5), with every accessor-referencing field resolved to an
/// index into the manifest's `accessors`.
#[derive(Clone, Debug, PartialEq)]
pub struct ManifestKeypoints {
    /// `count`, `N`.
    pub count: u32,
    /// `detector.kind`: any string, including one this reader does not know.
    pub detector_kind: String,
    /// `detector.params`: an absent `params` is `{}` (§7.3).
    pub detector_params: Params,
    /// `levelStart` accessor index: `u32`, `L + 1` entries.
    pub level_start: usize,
    /// `x` accessor index: `f32`, `N` entries.
    pub x: usize,
    /// `y` accessor index: `f32`, `N` entries.
    pub y: usize,
    /// `angle` accessor index: `f32`, `N` entries.
    pub angle: usize,
    /// `score` accessor index: `f32`, `N` entries.
    pub score: usize,
    /// `size` accessor index, if present: `f32`, `N` entries.
    pub size: Option<usize>,
    /// `level` accessor index: `u8`, `N` entries.
    pub level: usize,
}

/// One entry of `descriptorSets` (§5.6) that survived — a set whose
/// `elementType` this build does not know never reaches this type; it is
/// dropped in [`validate_manifest`], with a warning, before its accessors are
/// read.
#[derive(Clone, Debug, PartialEq)]
pub struct ManifestDescriptorSet {
    /// `kind`, e.g. `"orb"`, `"teblid"`. May be one this build does not know.
    pub kind: String,
    /// `norm`, e.g. `"hamming"`. May be one this build does not know.
    pub norm: String,
    /// `elementType`: `"bits"`, `"u8"` or `"f32"` — always one of
    /// [`KNOWN_ELEMENT_TYPES`], since an unknown one is dropped before this
    /// type is built.
    pub element_type: String,
    /// `dimensions`: bits for `"bits"`, elements otherwise. `0` is legal
    /// (§5.6) — no minimum is imposed.
    pub dimensions: u32,
    /// `bytesPerDescriptor`, consistent with `dimensions` and `elementType`
    /// (checked here, `INCONSISTENT_DATA` on a mismatch).
    pub bytes_per_descriptor: u32,
    /// `producer`.
    pub producer: String,
    /// `params`: an absent `params` is `{}` (§7.3).
    pub params: Params,
    /// `count`, `M`.
    pub count: u32,
    /// `levelStart` accessor index: `u32`, `L + 1` entries.
    pub level_start: usize,
    /// `kpIndex` accessor index: `u32`, `M` entries.
    pub kp_index: usize,
    /// `data` accessor index: `f32` for `elementType == "f32"`, `u8`
    /// otherwise.
    pub data: usize,
}

/// `patches` (§5.7), if the manifest carries one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ManifestPatches {
    /// `patchSize`, `P`. An integer in `[1, 2^32 − 1]` — unlike `dimensions`
    /// (§5.6), `0` is not legal here.
    pub patch_size: u32,
    /// `count`, `Q`.
    pub count: u32,
    /// `score` accessor index: `f32`, `Q` entries.
    pub score: usize,
    /// `left` accessor index: `u16`, `Q` entries.
    pub left: usize,
    /// `top` accessor index: `u16`, `Q` entries.
    pub top: usize,
    /// `level` accessor index: `u8`, `Q` entries.
    pub level: usize,
    /// `pixels` accessor index: `u8`, `Q × P × P` entries.
    pub pixels: usize,
}

/// `referenceImage` (§5.8), if the manifest carries one. `level < L` and the
/// equality with `levelSizes[level]` are step 7, not here.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ManifestReferenceImage {
    /// `level`.
    pub level: u32,
    /// `width`, an integer in `[1, 2^16 − 1]`.
    pub width: u32,
    /// `height`, an integer in `[1, 2^16 − 1]`.
    pub height: u32,
    /// `pixels` accessor index: `u8`, `width × height` entries.
    pub pixels: usize,
}

/// The manifest, fully schema-checked (§6.1 step 6): every accessor domain
/// settled, every accessor reference resolved to an index, every count within
/// the configured resource limits. Nothing here has read an array's
/// **contents** — that is step 7.
#[derive(Clone, Debug, PartialEq)]
pub struct ManifestSpec {
    /// What steps 3 to 5 produced.
    pub head: ManifestHead,
    /// `accessors` (§5.2), domain-checked, non-overlapping, in bounds of the
    /// `BIN` chunk.
    pub accessors: Vec<Accessor>,
    /// `meta` (§5.3).
    pub meta: ManifestMeta,
    /// `pyramid` (§5.4).
    pub pyramid: ManifestPyramid,
    /// `keypoints` (§5.5).
    pub keypoints: ManifestKeypoints,
    /// `descriptorSets` (§5.6), with unknown-`elementType` entries already
    /// dropped.
    pub descriptor_sets: Vec<ManifestDescriptorSet>,
    /// `patches` (§5.7), if present.
    pub patches: Option<ManifestPatches>,
    /// `referenceImage` (§5.8), if present.
    pub reference_image: Option<ManifestReferenceImage>,
    /// `info` (§5.9), if present: free-form, carried through untouched.
    pub info: Option<Params>,
}

/// Decode the manifest bytes into a [`ManifestHead`] (§6.1 steps 3 to 5).
///
/// # Errors
///
/// `MANIFEST_TOO_LARGE` when `bytes` is above `limits.max_manifest_bytes`;
/// `BAD_MANIFEST` for anything not strict UTF-8, not I-JSON (§5), not JSON, or
/// whose top level is not an object, a missing/malformed `format` or
/// extension list, or an `extensionsRequired` name `extensionsUsed` does not
/// list; `UNSUPPORTED_FORMAT_VERSION` for a `format.version` other than
/// [`SUPPORTED_FORMAT_VERSION`]; `UNSUPPORTED_EXTENSION` for a required
/// extension this build does not implement.
pub fn decode_manifest(
    bytes: &[u8],
    limits: &Limits,
) -> Result<(ManifestHead, Vec<Warning>), DecodeError> {
    // Step 3: the manifest size limit, before a single byte is decoded.
    if bytes.len() > limits.max_manifest_bytes {
        return Err(fail(
            ErrorCode::ManifestTooLarge,
            format!(
                "the manifest is {} bytes, above the {}-byte limit",
                bytes.len(),
                limits.max_manifest_bytes
            ),
        ));
    }

    // Step 4: strict UTF-8, then the five I-JSON checks of §5 on the text,
    // then `serde_json::from_str`, then "the top level MUST be an object".
    let text = core::str::from_utf8(bytes)
        .map_err(|e| fail(ErrorCode::BadManifest, format!("not strict UTF-8: {e}")))?;

    if let Some(violation) = scan_ijson(text) {
        return Err(fail(
            ErrorCode::BadManifest,
            format!("{}: {}", violation.path, violation.reason),
        ));
    }

    let value: Value = serde_json::from_str(text)
        .map_err(|e| fail(ErrorCode::BadManifest, format!("not valid JSON: {e}")))?;

    let doc = match value {
        Value::Object(map) => map,
        _ => {
            return Err(fail(
                ErrorCode::BadManifest,
                "the top level of the manifest must be an object",
            ));
        }
    };

    // Step 5a: `format`.
    let format = doc
        .get("format")
        .and_then(Value::as_object)
        .ok_or_else(|| fail(ErrorCode::BadManifest, "format missing or not an object"))?;
    let version = format
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                "format.version missing or not a string",
            )
        })?;
    if version != SUPPORTED_FORMAT_VERSION {
        return Err(fail(
            ErrorCode::UnsupportedFormatVersion,
            format!("format.version {version:?} is not the supported {SUPPORTED_FORMAT_VERSION:?}"),
        ));
    }
    let generator = match format.get("generator") {
        None => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => {
            return Err(fail(
                ErrorCode::BadManifest,
                "format.generator must be a string",
            ));
        }
    };

    // Step 5b: `extensionsUsed` / `extensionsRequired`, each defaulting to `[]`.
    let mut extensions_used = read_string_array(&doc, "extensionsUsed")?;
    let extensions_required = read_string_array(&doc, "extensionsRequired")?;

    // Step 5c: the §5.1 subset rule, checked first, as `BAD_MANIFEST`.
    for name in &extensions_required {
        if !extensions_used.contains(name) {
            return Err(fail(
                ErrorCode::BadManifest,
                format!("extensionsRequired names {name:?}, which extensionsUsed does not list"),
            ));
        }
    }

    // Step 5d: every required extension MUST be one this build implements.
    for name in &extensions_required {
        if !IMPLEMENTED_EXTENSIONS.contains(&name.as_str()) {
            return Err(fail(
                ErrorCode::UnsupportedExtension,
                format!("extensionsRequired names {name:?}, which this build does not implement"),
            ));
        }
    }

    // Step 5e: prune every unimplemented name from `extensionsUsed`, warning
    // for each, so a later re-encode never advertises a payload this decode
    // threw away (§7.3).
    let mut warnings = Vec::new();
    extensions_used.retain(|name| {
        if IMPLEMENTED_EXTENSIONS.contains(&name.as_str()) {
            true
        } else {
            warnings.push(Warning {
                code: WarningCode::UnknownExtensionIgnored,
                detail: name.clone(),
            });
            false
        }
    });

    Ok((
        ManifestHead {
            doc,
            generator,
            extensions_used,
            extensions_required,
        },
        warnings,
    ))
}

/// Read a top-level array-of-strings field, defaulting to `[]` when absent —
/// used for `extensionsUsed` and `extensionsRequired` (§5.1).
///
/// An explicit `null` is accepted here too, as `[]`. §5.1 does not say what
/// `null` means for either field, so this is settled by matching the peer
/// TypeScript codec: it reads both with `?? []`, whose nullish coalescing
/// swallows `null` along with `undefined`, unlike every other optional key in
/// that codec, which checks `!== undefined` and rejects `null` explicitly.
/// This is suspected to be an artifact of reaching for `??` rather than a
/// considered decision — but §1 requires two implementations to decode any
/// file identically, suspect ones included, since untrusted input is exactly
/// where a divergence would matter and nobody would go looking for it. If the
/// peer ever tightens this to reject `null`, this arm must be tightened the
/// same way, in the same change.
fn read_string_array(doc: &Map<String, Value>, key: &str) -> Result<Vec<String>, DecodeError> {
    match doc.get(key) {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| {
                v.as_str().map(ToOwned::to_owned).ok_or_else(|| {
                    fail(
                        ErrorCode::BadManifest,
                        format!("{key} must be an array of strings"),
                    )
                })
            })
            .collect(),
        Some(_) => Err(fail(
            ErrorCode::BadManifest,
            format!("{key} must be an array"),
        )),
    }
}

/// Validate the manifest's schema (§6.1 step 6): accessors first, then the
/// pyramid (its length fixes `L`), then everything else. Resource limits
/// (§6.4) are checked alongside each field's domain.
///
/// `bin_length` is the `BIN\0` chunk's data length, or `None` when the file
/// has no such chunk.
///
/// # Errors
///
/// See the module docs and §6.2's table: `BAD_MANIFEST` for a type or domain
/// violation, `BAD_LAYOUT` for an accessor out of bounds, misaligned,
/// overlapping, or referenced with the wrong type or count,
/// `LIMIT_EXCEEDED` for a count or size above `limits`, and
/// `INCONSISTENT_DATA` for a duplicate descriptor-set key or a
/// `bytesPerDescriptor` that does not match `dimensions`.
pub fn validate_manifest(
    head: ManifestHead,
    bin_length: Option<usize>,
    limits: &Limits,
) -> Result<(ManifestSpec, Vec<Warning>), DecodeError> {
    let accessors = parse_accessors(&head.doc, bin_length)?;

    let pyramid = parse_pyramid(&head.doc, limits)?;
    let level_count = pyramid.level_sizes.len();

    let meta = parse_meta(&head.doc)?;
    let keypoints = parse_keypoints(&head.doc, &accessors, level_count, limits)?;

    let mut warnings = Vec::new();
    let descriptor_sets =
        parse_descriptor_sets(&head.doc, &accessors, level_count, limits, &mut warnings)?;

    let patches = parse_patches(&head.doc, &accessors, limits)?;
    let reference_image = parse_reference_image(&head.doc, &accessors)?;
    let info = parse_info(&head.doc)?;

    Ok((
        ManifestSpec {
            head,
            accessors,
            meta,
            pyramid,
            keypoints,
            descriptor_sets,
            patches,
            reference_image,
            info,
        },
        warnings,
    ))
}

/// Whether `value` is a JSON **number** with no fractional part, in
/// `[min, max]` — checked at the level of the *value*, not the literal
/// `serde_json` happened to store it as.
///
/// §5.2 says "a JSON number with no fractional part", a property of the
/// value; contrast §5's own check (c), worded "**integer literals** — no
/// fraction, no exponent", a property of the text. Different words, a
/// different rule: `serde_json` stores `20.0` as an `f64` (the literal has a
/// decimal point), so `Value::as_u64()` returns `None` for it even though
/// the *value* is a whole number. The peer TypeScript codec checks
/// `Number.isInteger(v)`, which is `true` for `20.0` — JavaScript has no
/// separate integer type — so a reader using `as_u64()` here would reject a
/// file the peer accepts, which §1 forbids.
///
/// This is safe from the ±(2^53 − 1) magnitude question: I-JSON check (c)
/// has already rejected, on the manifest **text**, every integer literal
/// (no fraction, no exponent) outside that range before this function ever
/// runs. A literal with a fraction or exponent — `20.0` included — is exempt
/// from check (c) by its own wording, and is exactly the case this function
/// exists for.
fn number_as_u32(value: &Value, min: u32, max: u32) -> Option<u32> {
    let n = value.as_f64()?;
    // `f64::fract` is a `std`-only method (it needs `libm` under `no_std`),
    // so the "no fractional part" check is done by truncating and comparing
    // instead: both `is_finite` and the `as u32` cast are core-language
    // operations, not method calls into a floating-point runtime.
    if !n.is_finite() || n < f64::from(min) || n > f64::from(max) {
        return None;
    }
    // `n` is finite and within `[min, max] ⊆ [0, u32::MAX]`, so this
    // truncating cast cannot overflow or saturate; it is exact exactly when
    // `n` has no fractional part, which is what "no fractional part" means.
    let truncated = n as u32;
    if f64::from(truncated) == n {
        Some(truncated)
    } else {
        None
    }
}

/// Require `doc[key]` to be a JSON number with no fractional part, in
/// `[min, max]` (§5.2, §6.1 step 6; see [`number_as_u32`]). A fractional,
/// negative, or out-of-range value is `BAD_MANIFEST` — never reaching the
/// checked arithmetic below.
fn require_u32(
    obj: &Map<String, Value>,
    key: &str,
    min: u32,
    max: u32,
    context: &str,
) -> Result<u32, DecodeError> {
    obj.get(key)
        .and_then(|v| number_as_u32(v, min, max))
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                format!("{context}.{key} must be an integer in [{min}, {max}]"),
            )
        })
}

/// `accessors` (§5.2): domain-checked, aligned, in bounds of the `BIN` chunk,
/// and non-overlapping.
fn parse_accessors(
    doc: &Map<String, Value>,
    bin_length: Option<usize>,
) -> Result<Vec<Accessor>, DecodeError> {
    let entries = doc
        .get("accessors")
        .and_then(Value::as_array)
        .ok_or_else(|| fail(ErrorCode::BadManifest, "accessors missing or not an array"))?;

    // §5.2 rev 2: a manifest with at least one accessor and no `BIN\0` chunk
    // is `BAD_LAYOUT`. This must be checked explicitly: treating an absent
    // chunk as length 0 would let every accessor with `count = 0` through the
    // bound check below, which is exactly the manifest this rule exists to
    // catch.
    if !entries.is_empty() && bin_length.is_none() {
        return Err(fail(
            ErrorCode::BadLayout,
            "the manifest declares accessors but the file has no BIN\\0 chunk",
        ));
    }
    let bin_len = bin_length.unwrap_or(0);

    let mut accessors = Vec::with_capacity(entries.len());
    // Byte spans of the accessors that own at least one byte — a zero-length
    // accessor owns none and cannot overlap anything (§5.2).
    let mut spans: Vec<(usize, usize)> = Vec::new();

    for (i, entry) in entries.iter().enumerate() {
        let ctx = format!("accessors[{i}]");
        let obj = entry
            .as_object()
            .ok_or_else(|| fail(ErrorCode::BadManifest, format!("{ctx} must be an object")))?;

        let offset = require_u32(obj, "offset", 0, u32::MAX, &ctx)?;
        let count = require_u32(obj, "count", 0, u32::MAX, &ctx)?;
        let ty_str = obj.get("type").and_then(Value::as_str).ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                format!("{ctx}.type missing or not a string"),
            )
        })?;
        let ty = match ty_str {
            "u8" => AccessorType::U8,
            "u16" => AccessorType::U16,
            "u32" => AccessorType::U32,
            "f32" => AccessorType::F32,
            other => {
                return Err(fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}.type {other:?} is not one of u8, u16, u32, f32"),
                ));
            }
        };

        let size = element_size(ty);
        if (offset as usize) % size != 0 {
            return Err(fail(
                ErrorCode::BadLayout,
                format!("{ctx}.offset is not a multiple of the element size"),
            ));
        }

        let byte_len = (count as usize).checked_mul(size).ok_or_else(|| {
            fail(
                ErrorCode::BadLayout,
                format!("{ctx} overflows offset + count * size"),
            )
        })?;
        let end = (offset as usize).checked_add(byte_len).ok_or_else(|| {
            fail(
                ErrorCode::BadLayout,
                format!("{ctx} overflows offset + count * size"),
            )
        })?;
        if end > bin_len {
            return Err(fail(
                ErrorCode::BadLayout,
                format!("{ctx} extends past the BIN chunk ({end} > {bin_len})"),
            ));
        }

        let start = offset as usize;
        if end > start {
            spans.push((start, end));
        }
        accessors.push(Accessor { offset, count, ty });
    }

    spans.sort_unstable_by_key(|&(start, _)| start);
    for pair in spans.windows(2) {
        if let [(_, prev_end), (next_start, _)] = pair {
            if next_start < prev_end {
                return Err(fail(ErrorCode::BadLayout, "accessors overlap"));
            }
        }
    }

    Ok(accessors)
}

/// Resolve `value` as an accessor reference: an integer index in
/// `[0, accessors.len())` whose accessor has exactly `ty` and `count`.
fn resolve_ref(
    value: &Value,
    accessors: &[Accessor],
    ty: AccessorType,
    count: u32,
    context: &str,
) -> Result<usize, DecodeError> {
    // §5.2: "an integer index in [0, accessors.length)" is the same
    // value-level domain as every other integer field here (see
    // `number_as_u32`) — a `20.0` index is as legal as a bare `20`.
    let idx = number_as_u32(value, 0, u32::MAX)
        .and_then(|n| usize::try_from(n).ok())
        .filter(|&i| i < accessors.len())
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                format!("{context} must be an integer index into accessors"),
            )
        })?;

    let accessor = accessors.get(idx).ok_or_else(|| {
        fail(
            ErrorCode::BadManifest,
            format!("{context} index out of range"),
        )
    })?;
    if accessor.ty != ty || accessor.count != count {
        return Err(fail(
            ErrorCode::BadLayout,
            format!("{context} refers to an accessor of the wrong type or count"),
        ));
    }

    Ok(idx)
}

/// Read `obj[key]` and resolve it as an accessor reference (see
/// [`resolve_ref`]). Missing is `BAD_MANIFEST`, not "absent means default": a
/// referencing field is required wherever it is used.
fn resolve_field(
    obj: &Map<String, Value>,
    key: &str,
    accessors: &[Accessor],
    ty: AccessorType,
    count: u32,
    context: &str,
) -> Result<usize, DecodeError> {
    let value = obj
        .get(key)
        .ok_or_else(|| fail(ErrorCode::BadManifest, format!("{context} missing")))?;
    resolve_ref(value, accessors, ty, count, context)
}

/// `L + 1`, as a `u32` — the length every `levelStart` accessor must have.
fn level_count_plus_one(level_count: usize) -> Result<u32, DecodeError> {
    level_count
        .checked_add(1)
        .and_then(|n| u32::try_from(n).ok())
        .ok_or_else(|| fail(ErrorCode::BadLayout, "too many pyramid levels to address"))
}

/// `pyramid` (§5.4).
fn parse_pyramid(
    doc: &Map<String, Value>,
    limits: &Limits,
) -> Result<ManifestPyramid, DecodeError> {
    let obj = doc
        .get("pyramid")
        .and_then(Value::as_object)
        .ok_or_else(|| fail(ErrorCode::BadManifest, "pyramid missing or not an object"))?;

    let level_sizes_val = obj
        .get("levelSizes")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                "pyramid.levelSizes missing or not an array",
            )
        })?;
    if level_sizes_val.is_empty() {
        return Err(fail(
            ErrorCode::BadManifest,
            "pyramid.levelSizes must be non-empty",
        ));
    }
    if level_sizes_val.len() > limits.max_levels {
        return Err(fail(
            ErrorCode::LimitExceeded,
            format!(
                "pyramid.levelSizes has {} entries, above the {}-level limit",
                level_sizes_val.len(),
                limits.max_levels
            ),
        ));
    }

    let mut level_sizes = Vec::with_capacity(level_sizes_val.len());
    for (i, entry) in level_sizes_val.iter().enumerate() {
        let ctx = format!("pyramid.levelSizes[{i}]");
        let pair = entry.as_array().filter(|a| a.len() == 2).ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                format!("{ctx} must be a two-element array"),
            )
        })?;
        let w = pair
            .first()
            .and_then(|v| number_as_u32(v, 1, U16_DOMAIN_MAX))
            .ok_or_else(|| {
                fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}[0] must be an integer in [1, 65535]"),
                )
            })?;
        let h = pair
            .get(1)
            .and_then(|v| number_as_u32(v, 1, U16_DOMAIN_MAX))
            .ok_or_else(|| {
                fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}[1] must be an integer in [1, 65535]"),
                )
            })?;
        level_sizes.push([w, h]);
    }

    let scale_step = obj
        .get("scaleStep")
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite() && *v > 1.0)
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                "pyramid.scaleStep must be finite and > 1",
            )
        })?;

    Ok(ManifestPyramid {
        scale_step,
        level_sizes,
    })
}

/// `meta` (§5.3).
fn parse_meta(doc: &Map<String, Value>) -> Result<ManifestMeta, DecodeError> {
    let obj = doc
        .get("meta")
        .and_then(Value::as_object)
        .ok_or_else(|| fail(ErrorCode::BadManifest, "meta missing or not an object"))?;

    let width_px = require_u32(obj, "widthPx", 1, U16_DOMAIN_MAX, "meta")?;
    let height_px = require_u32(obj, "heightPx", 1, U16_DOMAIN_MAX, "meta")?;

    // `physicalSizeMm` is REQUIRED, even though §5.3's prose only fixes the
    // domain of a *present* value ("null ... or [width, height]") and never
    // says in as many words that the key itself is mandatory. Two things
    // settle it in favour of requiring the key:
    //   - §1 is binding: "A file written by one implementation MUST decode
    //     to the same values in any other." The peer TypeScript codec's
    //     check is `if (sizeMmRaw !== null) { ... }`; an absent key reads as
    //     `undefined`, and `undefined !== null`, so that reader already
    //     rejects a missing key as BAD_MANIFEST. Treating "absent" as
    //     equivalent to "null" here would accept a file the peer rejects,
    //     breaking that guarantee silently.
    //   - §7.3's canonical writer omits a key only when it is in that
    //     section's short list of optional-and-omitted-when-empty fields:
    //     `params`, `extensionsUsed`, `extensionsRequired`. `physicalSizeMm`
    //     is not on that list, so no conforming file omits it — requiring
    //     the key here rejects nothing a compliant writer would produce.
    // Do not "fix" this back to lenient without re-reading both of the above.
    let physical_size_mm = match obj.get("physicalSizeMm") {
        None => {
            return Err(fail(
                ErrorCode::BadManifest,
                "meta.physicalSizeMm is required (null, or [width, height])",
            ));
        }
        Some(Value::Null) => None,
        Some(Value::Array(arr)) if arr.len() == 2 => {
            let w = arr
                .first()
                .and_then(Value::as_f64)
                .filter(|v| v.is_finite() && *v > 0.0)
                .ok_or_else(|| {
                    fail(
                        ErrorCode::BadManifest,
                        "meta.physicalSizeMm[0] must be a finite number > 0",
                    )
                })?;
            let h = arr
                .get(1)
                .and_then(Value::as_f64)
                .filter(|v| v.is_finite() && *v > 0.0)
                .ok_or_else(|| {
                    fail(
                        ErrorCode::BadManifest,
                        "meta.physicalSizeMm[1] must be a finite number > 0",
                    )
                })?;
            Some([w, h])
        }
        Some(_) => {
            return Err(fail(
                ErrorCode::BadManifest,
                "meta.physicalSizeMm must be null or [width, height]",
            ));
        }
    };

    Ok(ManifestMeta {
        width_px,
        height_px,
        physical_size_mm,
    })
}

/// An object field defaulting to `{}` when absent (§7.3): `detector.params`,
/// a descriptor set's `params`.
fn optional_object(
    obj: &Map<String, Value>,
    key: &str,
    context: &str,
) -> Result<Params, DecodeError> {
    match obj.get(key) {
        None => Ok(Params::new()),
        Some(Value::Object(m)) => Ok(m.clone()),
        Some(_) => Err(fail(
            ErrorCode::BadManifest,
            format!("{context}.{key} must be an object"),
        )),
    }
}

/// `keypoints` (§5.5).
fn parse_keypoints(
    doc: &Map<String, Value>,
    accessors: &[Accessor],
    level_count: usize,
    limits: &Limits,
) -> Result<ManifestKeypoints, DecodeError> {
    let obj = doc
        .get("keypoints")
        .and_then(Value::as_object)
        .ok_or_else(|| fail(ErrorCode::BadManifest, "keypoints missing or not an object"))?;

    let count = require_u32(obj, "count", 0, u32::MAX, "keypoints")?;
    if count > limits.max_keypoints {
        return Err(fail(
            ErrorCode::LimitExceeded,
            format!(
                "keypoints.count {count} is above the {}-keypoint limit",
                limits.max_keypoints
            ),
        ));
    }

    let detector_obj = obj
        .get("detector")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                "keypoints.detector missing or not an object",
            )
        })?;
    // Any string is a legal `kind`, including the empty one: it is
    // informative, and a reader MUST NOT constrain it further (§5.5).
    let detector_kind = detector_obj
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                "keypoints.detector.kind missing or not a string",
            )
        })?
        .to_owned();
    let detector_params = optional_object(detector_obj, "params", "keypoints.detector")?;

    let level_plus_one = level_count_plus_one(level_count)?;

    let level_start = resolve_field(
        obj,
        "levelStart",
        accessors,
        AccessorType::U32,
        level_plus_one,
        "keypoints.levelStart",
    )?;
    let x = resolve_field(obj, "x", accessors, AccessorType::F32, count, "keypoints.x")?;
    let y = resolve_field(obj, "y", accessors, AccessorType::F32, count, "keypoints.y")?;
    let angle = resolve_field(
        obj,
        "angle",
        accessors,
        AccessorType::F32,
        count,
        "keypoints.angle",
    )?;
    let score = resolve_field(
        obj,
        "score",
        accessors,
        AccessorType::F32,
        count,
        "keypoints.score",
    )?;
    let size = match obj.get("size") {
        None => None,
        Some(value) => Some(resolve_ref(
            value,
            accessors,
            AccessorType::F32,
            count,
            "keypoints.size",
        )?),
    };
    let level = resolve_field(
        obj,
        "level",
        accessors,
        AccessorType::U8,
        count,
        "keypoints.level",
    )?;

    Ok(ManifestKeypoints {
        count,
        detector_kind,
        detector_params,
        level_start,
        x,
        y,
        angle,
        score,
        size,
        level,
    })
}

/// `descriptorSets` (§5.6). A set with an unknown `elementType` is dropped —
/// with a warning — **before** its accessors are read; a set with an unknown
/// `kind` or `norm` alone is structurally understood and kept, still warned
/// about.
fn parse_descriptor_sets(
    doc: &Map<String, Value>,
    accessors: &[Accessor],
    level_count: usize,
    limits: &Limits,
    warnings: &mut Vec<Warning>,
) -> Result<Vec<ManifestDescriptorSet>, DecodeError> {
    let entries = doc
        .get("descriptorSets")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            fail(
                ErrorCode::BadManifest,
                "descriptorSets missing or not an array",
            )
        })?;
    if entries.is_empty() {
        return Err(fail(
            ErrorCode::BadManifest,
            "descriptorSets must have at least one entry",
        ));
    }
    if entries.len() > limits.max_descriptor_sets {
        return Err(fail(
            ErrorCode::LimitExceeded,
            format!(
                "descriptorSets has {} entries, above the {}-set limit",
                entries.len(),
                limits.max_descriptor_sets
            ),
        ));
    }

    let level_plus_one = level_count_plus_one(level_count)?;
    let mut sets = Vec::new();
    let mut seen_keys: BTreeSet<String> = BTreeSet::new();

    for (i, entry) in entries.iter().enumerate() {
        let ctx = format!("descriptorSets[{i}]");
        let obj = entry
            .as_object()
            .ok_or_else(|| fail(ErrorCode::BadManifest, format!("{ctx} must be an object")))?;

        let kind = obj
            .get("kind")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}.kind must be a string"),
                )
            })?
            .to_owned();
        let norm = obj
            .get("norm")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}.norm must be a string"),
                )
            })?
            .to_owned();
        let element_type = obj
            .get("elementType")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}.elementType must be a string"),
                )
            })?
            .to_owned();
        let producer = obj
            .get("producer")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}.producer must be a string"),
                )
            })?
            .to_owned();

        // §5.6: nothing says how wide an element is or which accessor type
        // to expect, so a set with an unknown `elementType` cannot be
        // interpreted at all. Drop it before its accessors — offset, count,
        // `data`'s expected type — are ever read.
        if !KNOWN_ELEMENT_TYPES.contains(&element_type.as_str()) {
            warnings.push(Warning {
                code: WarningCode::UnsupportedDescriptorSet,
                detail: format!("{ctx}: unknown elementType {element_type:?}"),
            });
            continue;
        }

        // An unknown `kind` or `norm` alone leaves the set structurally
        // understood (the element width and row count are still known), so
        // it is preserved and warned about rather than dropped (§5.6).
        if !KNOWN_DESCRIPTOR_KINDS.contains(&kind.as_str())
            || !KNOWN_DESCRIPTOR_NORMS.contains(&norm.as_str())
        {
            warnings.push(Warning {
                code: WarningCode::UnsupportedDescriptorSet,
                detail: format!("{ctx}: unknown kind {kind:?} or norm {norm:?}"),
            });
        }

        let dimensions = require_u32(obj, "dimensions", 0, u32::MAX, &ctx)?;
        let bytes_per_descriptor = require_u32(obj, "bytesPerDescriptor", 0, u32::MAX, &ctx)?;
        let count = require_u32(obj, "count", 0, u32::MAX, &ctx)?;

        let expected_bpd = match element_type.as_str() {
            "bits" => {
                if dimensions % 8 != 0 {
                    return Err(fail(
                        ErrorCode::InconsistentData,
                        format!(
                            "{ctx}: dimensions must be a multiple of 8 for elementType \"bits\""
                        ),
                    ));
                }
                dimensions / 8
            }
            "u8" => dimensions,
            "f32" => dimensions.checked_mul(4).ok_or_else(|| {
                fail(
                    ErrorCode::InconsistentData,
                    format!("{ctx}: dimensions is too large for elementType \"f32\""),
                )
            })?,
            _ => {
                return Err(fail(
                    ErrorCode::BadManifest,
                    format!("{ctx}.elementType is not recognised"),
                ));
            }
        };
        // §6.1 nominally assigns this consistency check to step 7 ("data
        // consistency" — §6.1's own step-7 bullet list includes "bytes_per_descriptor
        // consistent with elementType and dimensions"), not step 6. It is
        // evaluated here, in step 6, deliberately: the peer TypeScript codec
        // does the same, hoisting this exact check into its own `validateManifest`
        // (its step 6), at `manifest.ts:634`. Matching the peer's placement
        // keeps the two implementations identical on every file (§1), which
        // matters more here than which step's bucket the check nominally sits
        // in — the error code is `INCONSISTENT_DATA` either way, so no
        // observable behaviour depends on the step boundary. If the peer ever
        // moves this to a later pass, move this one the same way, in the same
        // change.
        if expected_bpd != bytes_per_descriptor {
            return Err(fail(
                ErrorCode::InconsistentData,
                format!(
                    "{ctx}: bytesPerDescriptor {bytes_per_descriptor} does not match dimensions {dimensions} for elementType {element_type:?}"
                ),
            ));
        }

        let params = optional_object(obj, "params", &ctx)?;

        // Uniqueness on (kind, norm, dimensions, producer) (§5.6). Built via
        // `format!("{:?}", ...)` of a small array so that a separator inside
        // `kind` or `producer` cannot forge a collision; unlike
        // `serde_json::to_string`, `Debug`-formatting a `[&str; 4]` cannot
        // fail, so there is no fallback path whose failure mode would quietly
        // collapse every key onto `""` and turn a false negative into a false
        // positive (every second set rejected as a duplicate).
        //
        // Same placement note as `bytesPerDescriptor` above: §6.1 nominally
        // assigns duplicate-key detection to step 7 ("duplicate descriptor-set
        // key", §6.2's own wording for `INCONSISTENT_DATA`), but it is
        // evaluated here, in step 6, deliberately, matching the peer's
        // `manifest.ts:649`. Revisit both sites together if the peer ever
        // moves this.
        let dimensions_str = format!("{dimensions}");
        let key = format!(
            "{:?}",
            [
                kind.as_str(),
                norm.as_str(),
                dimensions_str.as_str(),
                producer.as_str()
            ]
        );
        if !seen_keys.insert(key) {
            return Err(fail(
                ErrorCode::InconsistentData,
                format!("{ctx}: duplicate (kind, norm, dimensions, producer)"),
            ));
        }

        let level_start = resolve_field(
            obj,
            "levelStart",
            accessors,
            AccessorType::U32,
            level_plus_one,
            &format!("{ctx}.levelStart"),
        )?;
        let kp_index = resolve_field(
            obj,
            "kpIndex",
            accessors,
            AccessorType::U32,
            count,
            &format!("{ctx}.kpIndex"),
        )?;

        let (data_ty, data_count) = if element_type == "f32" {
            let n = count.checked_mul(dimensions).ok_or_else(|| {
                fail(
                    ErrorCode::BadLayout,
                    format!("{ctx}.data count overflows M * dimensions"),
                )
            })?;
            (AccessorType::F32, n)
        } else {
            let n = count.checked_mul(bytes_per_descriptor).ok_or_else(|| {
                fail(
                    ErrorCode::BadLayout,
                    format!("{ctx}.data count overflows M * bytesPerDescriptor"),
                )
            })?;
            (AccessorType::U8, n)
        };
        let data = resolve_field(
            obj,
            "data",
            accessors,
            data_ty,
            data_count,
            &format!("{ctx}.data"),
        )?;

        sets.push(ManifestDescriptorSet {
            kind,
            norm,
            element_type,
            dimensions,
            bytes_per_descriptor,
            producer,
            params,
            count,
            level_start,
            kp_index,
            data,
        });
    }

    Ok(sets)
}

/// `patches` (§5.7), optional.
fn parse_patches(
    doc: &Map<String, Value>,
    accessors: &[Accessor],
    limits: &Limits,
) -> Result<Option<ManifestPatches>, DecodeError> {
    let Some(value) = doc.get("patches") else {
        return Ok(None);
    };
    let obj = value
        .as_object()
        .ok_or_else(|| fail(ErrorCode::BadManifest, "patches must be an object"))?;

    // Unlike `dimensions` (§5.6), `0` is not legal here (§5.7 rev).
    let patch_size = require_u32(obj, "patchSize", 1, u32::MAX, "patches")?;
    if patch_size > limits.max_patch_size {
        return Err(fail(
            ErrorCode::LimitExceeded,
            format!(
                "patches.patchSize {patch_size} is above the {}-pixel limit",
                limits.max_patch_size
            ),
        ));
    }

    let count = require_u32(obj, "count", 0, u32::MAX, "patches")?;
    if count > limits.max_patches {
        return Err(fail(
            ErrorCode::LimitExceeded,
            format!(
                "patches.count {count} is above the {}-patch limit",
                limits.max_patches
            ),
        ));
    }

    let score = resolve_field(
        obj,
        "score",
        accessors,
        AccessorType::F32,
        count,
        "patches.score",
    )?;
    let left = resolve_field(
        obj,
        "left",
        accessors,
        AccessorType::U16,
        count,
        "patches.left",
    )?;
    let top = resolve_field(
        obj,
        "top",
        accessors,
        AccessorType::U16,
        count,
        "patches.top",
    )?;
    let level = resolve_field(
        obj,
        "level",
        accessors,
        AccessorType::U8,
        count,
        "patches.level",
    )?;

    let pixels_count = count
        .checked_mul(patch_size)
        .and_then(|v| v.checked_mul(patch_size))
        .ok_or_else(|| {
            fail(
                ErrorCode::BadLayout,
                "patches.pixels count overflows Q * P * P",
            )
        })?;
    let pixels = resolve_field(
        obj,
        "pixels",
        accessors,
        AccessorType::U8,
        pixels_count,
        "patches.pixels",
    )?;

    Ok(Some(ManifestPatches {
        patch_size,
        count,
        score,
        left,
        top,
        level,
        pixels,
    }))
}

/// `referenceImage` (§5.8), optional.
fn parse_reference_image(
    doc: &Map<String, Value>,
    accessors: &[Accessor],
) -> Result<Option<ManifestReferenceImage>, DecodeError> {
    let Some(value) = doc.get("referenceImage") else {
        return Ok(None);
    };
    let obj = value
        .as_object()
        .ok_or_else(|| fail(ErrorCode::BadManifest, "referenceImage must be an object"))?;

    let level = require_u32(obj, "level", 0, u32::MAX, "referenceImage")?;
    let width = require_u32(obj, "width", 1, U16_DOMAIN_MAX, "referenceImage")?;
    let height = require_u32(obj, "height", 1, U16_DOMAIN_MAX, "referenceImage")?;

    let pixels_count = width.checked_mul(height).ok_or_else(|| {
        fail(
            ErrorCode::BadLayout,
            "referenceImage pixels count overflows width * height",
        )
    })?;
    let pixels = resolve_field(
        obj,
        "pixels",
        accessors,
        AccessorType::U8,
        pixels_count,
        "referenceImage.pixels",
    )?;

    Ok(Some(ManifestReferenceImage {
        level,
        width,
        height,
        pixels,
    }))
}

/// `info` (§5.9), optional and free-form: carried through untouched.
fn parse_info(doc: &Map<String, Value>) -> Result<Option<Params>, DecodeError> {
    match doc.get("info") {
        None => Ok(None),
        Some(Value::Object(m)) => Ok(Some(m.clone())),
        Some(_) => Err(fail(ErrorCode::BadManifest, "info must be an object")),
    }
}
