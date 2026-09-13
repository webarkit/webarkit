/*
 *  validate_target.rs
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

//! Validate an in-memory [`Target`] against everything §5 and §6 require of a
//! file, before the writer emits a single byte (§7.3): "the writer MUST NOT
//! emit a file that a conforming reader would reject."
//!
//! This duplicates the rule list `manifest.rs` and `consistency.rs` already
//! enforce on decode, deliberately: the reader validates a *parsed* manifest,
//! addressed by accessor indices into a `BIN` chunk it has not yet built; the
//! writer validates *owned* arrays before any accessor exists. What the two
//! share is the rule list, which is why this module is ordered exactly like
//! §5: format and extensions, pyramid, meta, keypoints, descriptor sets,
//! patches, reference image, `info`.
//!
//! The exception is `level_start_closed`, `levels_agree` and
//! `level_sizes_non_increasing`, plus `U16_DOMAIN_MAX`: none of these has a
//! shape difference between reader and writer — both sides already have a
//! materialised `&[u32]` / `&[[u32; 2]]` in hand — so they live once, in
//! `crate::rules`, and both this module and `consistency.rs` call them.
//!
//! [`validate_target`] returns the offending field path on failure, e.g.
//! `"descriptorSets[1].params.seed"`, and `None` when `target` is one this
//! build can safely re-encode.
//!
//! Checks (b) and (e) of §5 (surrogates, noncharacters) apply to **every**
//! string in the manifest, not only the free-form content of `params` and
//! `info` — the reader's own `scan_ijson` (`ijson.rs`) scans the whole
//! manifest text. So besides the recursive scan `check_params` runs over
//! `params`/`info`, this module also runs [`string_offends`] directly over
//! every other manifest string a hand-built `Target` can put a noncharacter
//! or surrogate escape into: `format.generator`, `keypoints.detector.kind`,
//! and each descriptor set's `kind`, `norm` and `producer`. A decoded target
//! already passed the reader's scan on all of these, so this only matters
//! for a target assembled by hand — for example a target compiler that
//! copies a `producer` string from backend metadata it did not itself
//! validate — but that is exactly the input `validate_target` exists for.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

use serde_json::{Number, Value};

use crate::ijson::{MAX_EXACT_INTEGER, has_noncharacter, has_unpaired_surrogate};
use crate::known::{IMPLEMENTED_EXTENSIONS, SUPPORTED_FORMAT_VERSION};
use crate::rules::{U16_DOMAIN_MAX, level_sizes_non_increasing, level_start_closed, levels_agree};
use crate::target::{DescriptorSet, Params, Target};

/// A JSON string's UTF-16 code units, for checks (b) and (e) (§5). A Rust
/// `&str` cannot hold a lone surrogate — `encode_utf16` can never produce one
/// from a well-formed `char` sequence — so [`has_unpaired_surrogate`] is
/// unreachable here in practice; the call stays anyway so this rule list
/// still matches §5's five checks, and the day a `Params` is built from
/// something that *can* carry one (raw code units from an FFI boundary, say)
/// the guard is already in place.
///
/// This is also why no test targets check (b) directly on a hand-built
/// `Target`: there is no well-typed way to construct the input it would
/// need. `tests/writer.rs` documents this the same way, at the one test that
/// exercises check (e) instead and notes the gap rather than faking it.
fn string_units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// Checks (b) and (e) on one string, member name or value alike.
fn string_offends(s: &str) -> bool {
    let units = string_units(s);
    has_unpaired_surrogate(&units) || has_noncharacter(&units)
}

/// Checks (c) and (d) on one JSON number.
///
/// (d): a non-finite number. `serde_json::Number` cannot itself hold NaN or
/// an infinity — `serde_json` refuses to construct one — so this arm is
/// unreachable on any `Value` this crate could have parsed or built through
/// `serde_json::json!`. It is checked anyway, both because a hostile
/// `Params` should never be trusted to satisfy an invariant "by
/// construction", and because the real vector for (d) is the *typed* `f64`
/// fields (`pyramid.scale_step`, `meta.physical_size_mm`), checked
/// separately in [`validate_target`] itself.
///
/// (c), and **deliberately stricter than the reader** (§7.3): the reader's
/// check (c) constrains an integer *literal* in the manifest text, so it
/// accepts `1e+21` (it carries an exponent). This function instead applies
/// the range to the *value*, because Q8 leaves number formatting free across
/// languages: another implementation may write the very same value as the
/// literal `1000000000000000000000`, which *is* an integer literal outside
/// ±(2^53 − 1) and which every conforming reader — this one included —
/// rejects. Refusing it here, at the value level, is what keeps this writer
/// from producing a file only some conforming readers can open.
///
/// No `f64::fract()` here — it is a `std`-only method (needs `libm` under
/// `no_std`, same reason `manifest.rs`'s `number_as_u32` avoids it). None is
/// needed anyway: once `|f| > 2^53 - 1`, IEEE 754's 52-bit mantissa can no
/// longer represent a fractional component at that magnitude at all — every
/// finite `f64` that large already *is* an integer. So for a `Number` stored
/// as `Float` (no `as_i64`/`as_u64`), the magnitude comparison alone decides
/// check (c); nothing below `max` needs to be integer-or-not, since (c) only
/// restricts integer-valued numbers and every non-integer one is by
/// definition within the range `as_i64`/`as_u64` would have covered.
fn number_offends(n: &Number) -> bool {
    let max = MAX_EXACT_INTEGER;
    if let Some(i) = n.as_i64() {
        return i < -max || i > max;
    }
    if let Some(u) = n.as_u64() {
        // `max` is positive, so this cast is exact.
        return u > max as u64;
    }
    match n.as_f64() {
        Some(f) if !f.is_finite() => true, // (d), defensive — see above.
        Some(f) => f < -(max as f64) || f > max as f64,
        None => false,
    }
}

/// Checks (b), (c), (d) and (e) of §5, recursively, over one free-form value
/// (`detector.params`, a descriptor set's `params`, or `info`). Check (a) has
/// no counterpart: a `serde_json::Map` cannot hold a duplicate member name,
/// which is exactly why §5 scopes key uniqueness to construction.
///
/// Returns the offending path (rooted at `path`) on the first violation.
fn check_free_form(value: &Value, path: &str) -> Option<String> {
    match value {
        Value::Object(map) => {
            for (key, v) in map {
                if string_offends(key) {
                    return Some(format!("{path}.{key}"));
                }
                let child = format!("{path}.{key}");
                if let Some(bad) = check_free_form(v, &child) {
                    return Some(bad);
                }
            }
            None
        }
        Value::Array(items) => {
            for (i, v) in items.iter().enumerate() {
                let child = format!("{path}[{i}]");
                if let Some(bad) = check_free_form(v, &child) {
                    return Some(bad);
                }
            }
            None
        }
        Value::String(s) => {
            if string_offends(s) {
                Some(path.to_string())
            } else {
                None
            }
        }
        Value::Number(n) => {
            if number_offends(n) {
                Some(path.to_string())
            } else {
                None
            }
        }
        Value::Bool(_) | Value::Null => None,
    }
}

/// `check_free_form` over a [`Params`] object itself (`detector.params`, a
/// descriptor set's `params`, `info`) rather than a bare [`Value`] — every
/// call site in [`validate_target`] has one of these, never a loose scalar.
fn check_params(params: &Params, path: &str) -> Option<String> {
    check_free_form(&Value::Object(params.clone()), path)
}

/// The expected `bytesPerDescriptor` for `element_type` and `dimensions`
/// (§5.6), or `None` on a domain violation (`dimensions` not a multiple of 8
/// for `"bits"`, or an overflow computing `4 * dimensions` for `"f32"`).
fn expected_bytes_per_descriptor(element_type: &str, dimensions: u32) -> Option<u32> {
    match element_type {
        "bits" => {
            if dimensions % 8 != 0 {
                None
            } else {
                Some(dimensions / 8)
            }
        }
        "u8" => Some(dimensions),
        "f32" => dimensions.checked_mul(4),
        _ => None,
    }
}

/// One descriptor set's own checks (§5.6), everything except the
/// cross-target uniqueness of its key, which the caller tracks.
#[allow(clippy::too_many_arguments)]
fn validate_descriptor_set(
    set: &DescriptorSet,
    index: usize,
    n: u32,
    level_count: usize,
    multiview: bool,
    keypoint_level: &[u8],
) -> Option<String> {
    let ctx = format!("descriptorSets[{index}]");
    let m = set.count;

    // Checks (b)/(e) on the three plain strings §5.6 leaves otherwise
    // unconstrained ("any string" is a domain claim, not an I-JSON
    // exemption) — see the module docs on why these three are checked
    // outside `params`.
    if string_offends(&set.kind) {
        return Some(format!("{ctx}.kind"));
    }
    if string_offends(&set.norm) {
        return Some(format!("{ctx}.norm"));
    }
    if string_offends(&set.producer) {
        return Some(format!("{ctx}.producer"));
    }

    let expected_bpd = expected_bytes_per_descriptor(set.data.element_type(), set.dimensions);
    if expected_bpd != Some(set.bytes_per_descriptor) {
        return Some(format!("{ctx}.bytesPerDescriptor"));
    }

    let Some(expected_level_start_len) = level_count.checked_add(1) else {
        return Some(String::from("pyramid.levelSizes"));
    };
    if set.level_start.len() != expected_level_start_len {
        return Some(format!("{ctx}.levelStart"));
    }
    if !level_start_closed(&set.level_start, m) {
        return Some(format!("{ctx}.levelStart"));
    }
    if set.kp_index.len() as u64 != u64::from(m) {
        return Some(format!("{ctx}.kpIndex"));
    }

    let data_len = set.data.len();
    let expected_data_len: u64 = if set.data.element_type() == "f32" {
        u64::from(m) * u64::from(set.dimensions)
    } else {
        u64::from(m) * u64::from(set.bytes_per_descriptor)
    };
    if data_len as u64 != expected_data_len {
        return Some(format!("{ctx}.data"));
    }

    if !multiview {
        if m != n {
            return Some(ctx);
        }
        for (i, &kp) in set.kp_index.iter().enumerate() {
            let Ok(i_u32) = u32::try_from(i) else {
                return Some(format!("{ctx}.kpIndex"));
            };
            if kp != i_u32 {
                return Some(format!("{ctx}.kpIndex"));
            }
        }
    }

    for l in 0..level_count {
        let (Some(&start), Some(&end)) = (set.level_start.get(l), set.level_start.get(l + 1))
        else {
            return Some(format!("{ctx}.levelStart"));
        };
        let Some(rows) = set.kp_index.get((start as usize)..(end as usize)) else {
            return Some(format!("{ctx}.kpIndex"));
        };
        for &row in rows {
            if row >= n {
                return Some(format!("{ctx}.kpIndex"));
            }
            let Some(&kp_level) = keypoint_level.get(row as usize) else {
                return Some(format!("{ctx}.kpIndex"));
            };
            if usize::from(kp_level) != l {
                return Some(format!("{ctx}.kpIndex"));
            }
        }
    }

    check_params(&set.params, &format!("{ctx}.params"))
}

/// Validate `target` against every rule of §5 and §6 a conforming reader
/// would enforce on decode. Returns the offending field path on the first
/// violation, `None` when `target` may be safely re-encoded.
#[allow(clippy::too_many_lines)]
pub(crate) fn validate_target(target: &Target) -> Option<String> {
    // --- format, extensions (§5.1, §7.1) ------------------------------------
    if target.format_version != SUPPORTED_FORMAT_VERSION {
        return Some(String::from("format.version"));
    }
    for name in &target.extensions_required {
        if !target.extensions_used.contains(name) {
            return Some(String::from("extensionsRequired"));
        }
        if !IMPLEMENTED_EXTENSIONS.contains(&name.as_str()) {
            return Some(String::from("extensionsRequired"));
        }
    }
    for name in &target.extensions_used {
        if !IMPLEMENTED_EXTENSIONS.contains(&name.as_str()) {
            return Some(String::from("extensionsUsed"));
        }
    }
    if let Some(generator) = &target.generator {
        if string_offends(generator) {
            return Some(String::from("format.generator"));
        }
    }

    // --- pyramid (§5.4) ------------------------------------------------------
    let level_sizes = &target.pyramid.level_sizes;
    if level_sizes.is_empty() {
        return Some(String::from("pyramid.levelSizes"));
    }
    for (i, &[w, h]) in level_sizes.iter().enumerate() {
        if !(1..=U16_DOMAIN_MAX).contains(&w) || !(1..=U16_DOMAIN_MAX).contains(&h) {
            return Some(format!("pyramid.levelSizes[{i}]"));
        }
    }
    if !level_sizes_non_increasing(level_sizes) {
        return Some(String::from("pyramid.levelSizes"));
    }
    if !target.pyramid.scale_step.is_finite() || target.pyramid.scale_step <= 1.0 {
        return Some(String::from("pyramid.scaleStep"));
    }
    let level_count = level_sizes.len();

    // --- meta (§5.3) -----------------------------------------------------------
    let Some(&[level0_w, level0_h]) = level_sizes.first() else {
        return Some(String::from("pyramid.levelSizes"));
    };
    if target.meta.width_px != level0_w {
        return Some(String::from("meta.widthPx"));
    }
    if target.meta.height_px != level0_h {
        return Some(String::from("meta.heightPx"));
    }
    if let Some([w, h]) = target.meta.physical_size_mm {
        if !w.is_finite() || w <= 0.0 {
            return Some(String::from("meta.physicalSizeMm[0]"));
        }
        if !h.is_finite() || h <= 0.0 {
            return Some(String::from("meta.physicalSizeMm[1]"));
        }
    }

    // --- keypoints (§5.5) --------------------------------------------------
    let kp = &target.keypoints;
    let n = kp.count;
    let n_usize = n as usize;
    let Some(expected_level_start_len) = level_count.checked_add(1) else {
        return Some(String::from("pyramid.levelSizes"));
    };
    if kp.level_start.len() != expected_level_start_len {
        return Some(String::from("keypoints.levelStart"));
    }
    if kp.x.len() != n_usize {
        return Some(String::from("keypoints.x"));
    }
    if kp.y.len() != n_usize {
        return Some(String::from("keypoints.y"));
    }
    if kp.angle.len() != n_usize {
        return Some(String::from("keypoints.angle"));
    }
    if kp.score.len() != n_usize {
        return Some(String::from("keypoints.score"));
    }
    if let Some(size) = &kp.size {
        if size.len() != n_usize {
            return Some(String::from("keypoints.size"));
        }
    }
    if kp.level.len() != n_usize {
        return Some(String::from("keypoints.level"));
    }
    // Any string is a legal detector.kind, the empty one included (§5.5 rev
    // 3): refusing one would make a file the reader accepts impossible to
    // re-emit. It still MUST pass checks (b)/(e) like every other manifest
    // string, "any string" being a claim about §5.5's domain, not about I-JSON.
    if string_offends(&kp.detector.kind) {
        return Some(String::from("keypoints.detector.kind"));
    }
    if !level_start_closed(&kp.level_start, n) {
        return Some(String::from("keypoints.levelStart"));
    }
    if !levels_agree(&kp.level_start, &kp.level, level_count) {
        return Some(String::from("keypoints.level"));
    }
    if let Some(bad) = check_params(&kp.detector.params, "keypoints.detector.params") {
        return Some(bad);
    }

    // --- descriptorSets (§5.6) ----------------------------------------------
    if target.descriptor_sets.is_empty() {
        return Some(String::from("descriptorSets"));
    }
    let multiview = target
        .extensions_required
        .iter()
        .any(|name| name == "WKNF_multiview");
    let mut seen_keys: Vec<(String, String, u32, String)> = Vec::new();
    for (i, set) in target.descriptor_sets.iter().enumerate() {
        let key = (
            set.kind.clone(),
            set.norm.clone(),
            set.dimensions,
            set.producer.clone(),
        );
        if seen_keys.contains(&key) {
            return Some(format!("descriptorSets[{i}]"));
        }
        seen_keys.push(key);

        if let Some(bad) = validate_descriptor_set(set, i, n, level_count, multiview, &kp.level) {
            return Some(bad);
        }
    }

    // --- patches (§5.7) ------------------------------------------------------
    if let Some(patches) = &target.patches {
        if patches.patch_size == 0 {
            return Some(String::from("patches.patchSize"));
        }
        let q = patches.count;
        let q_usize = q as usize;
        if patches.score.len() != q_usize {
            return Some(String::from("patches.score"));
        }
        if patches.left.len() != q_usize {
            return Some(String::from("patches.left"));
        }
        if patches.top.len() != q_usize {
            return Some(String::from("patches.top"));
        }
        if patches.level.len() != q_usize {
            return Some(String::from("patches.level"));
        }
        let expected_pixels = (q_usize)
            .checked_mul(patches.patch_size as usize)
            .and_then(|v| v.checked_mul(patches.patch_size as usize));
        if expected_pixels != Some(patches.pixels.len()) {
            return Some(String::from("patches.pixels"));
        }
        for qi in 0..q_usize {
            let (Some(&level), Some(&left), Some(&top)) = (
                patches.level.get(qi),
                patches.left.get(qi),
                patches.top.get(qi),
            ) else {
                return Some(String::from("patches.level"));
            };
            // `level[q] < L`, checked first via the fallible lookup.
            let Some(&[w, h]) = level_sizes.get(level as usize) else {
                return Some(format!("patches.level[{qi}]"));
            };
            let Some(right) = u32::from(left).checked_add(patches.patch_size) else {
                return Some(format!("patches.left[{qi}]"));
            };
            if right > w {
                return Some(format!("patches.left[{qi}]"));
            }
            let Some(bottom) = u32::from(top).checked_add(patches.patch_size) else {
                return Some(format!("patches.top[{qi}]"));
            };
            if bottom > h {
                return Some(format!("patches.top[{qi}]"));
            }
        }
    }

    // --- referenceImage (§5.8) ------------------------------------------------
    if let Some(reference_image) = &target.reference_image {
        let Some(&[w, h]) = level_sizes.get(reference_image.level as usize) else {
            return Some(String::from("referenceImage.level"));
        };
        if reference_image.width != w {
            return Some(String::from("referenceImage.width"));
        }
        if reference_image.height != h {
            return Some(String::from("referenceImage.height"));
        }
        let expected =
            (reference_image.width as usize).checked_mul(reference_image.height as usize);
        if expected != Some(reference_image.pixels.len()) {
            return Some(String::from("referenceImage.pixels"));
        }
    }

    // --- info (§5.9) -----------------------------------------------------------
    if let Some(info) = &target.info {
        if let Some(bad) = check_params(info, "info") {
            return Some(bad);
        }
    }

    None
}
