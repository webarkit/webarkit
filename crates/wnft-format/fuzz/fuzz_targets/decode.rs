/*
 *  decode.rs
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

#![no_main]

//! §8.4: `decode` never panics, always terminates, and never allocates beyond
//! the limits — on any input at all.
//!
//! The interesting inputs are not random bytes, which die at the magic. Seed the
//! corpus from `fixtures/nft-target/0.2/` (see the crate README) and let the
//! fuzzer mutate real files: that is what reaches the manifest, the accessors
//! and the consistency gates.
//!
//! `decode` not panicking is the base claim, and it needs no assertion of its
//! own: reaching the end of this closure at all is that claim holding. What
//! is asserted below is §8.4's round trip on top of it, and §5.6 and §7.3
//! each carve out one legal case that round trip does not cover.

use std::sync::Arc;

use libfuzzer_sys::fuzz_target;
use wnft_format::{
    DEFAULT_LIMITS, DescriptorData, DescriptorSet, ErrorCode, Keypoints, Params, Patches, Target,
    decode, encode, testing::MAX_EXACT_INTEGER,
};

/// Bitwise `f32` equality: `NaN == NaN` and `-0.0 != 0.0`.
///
/// Both binary arrays this crate decodes (`keypoints.x`/`y`/`angle`/`score`/
/// `size`, `patches.score`, an `f32` descriptor set's `data`) are legally
/// allowed to carry NaN — nothing in `validate_target` rejects it, and
/// `from_le_bytes`/`to_le_bytes` are bit casts, so decode → encode → decode
/// preserves the bits exactly even when they spell a NaN. `PartialEq` on
/// `f32` disagrees with itself there (`NaN != NaN`), which is a property of
/// float comparison, not of the round trip, so the round-trip check compares
/// bit patterns instead.
///
/// That choice also settles signed zero the other way from `PartialEq`:
/// `-0.0 == 0.0` under `PartialEq`, but their bits differ, so this function
/// says `-0.0 != 0.0`. That is deliberate, not a side effect. The round trip
/// here is a bit-for-bit one (a plain `from_le_bytes`/`to_le_bytes` cast), so
/// a genuine round trip never turns `-0.0` into `0.0` or back — the sign bit
/// survives untouched, same as every other bit. Bitwise comparison therefore
/// never misfires on valid data, and it additionally catches a real bug
/// `PartialEq` would hide: an implementation that normalised `-0.0` to `0.0`
/// (or vice versa) partway through would still be flagged, whereas ordinary
/// `PartialEq` would call that silent corruption a pass.
fn f32_bits_eq(a: &[f32], b: &[f32]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits())
}

fn f32_opt_bits_eq(a: &Option<Arc<[f32]>>, b: &Option<Arc<[f32]>>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => f32_bits_eq(a, b),
        (None, None) => true,
        _ => false,
    }
}

/// `Keypoints` equality with NaN-tolerant, bitwise comparison of every `f32`
/// field. `detector`, `level_start` and `level` carry no floats, so plain
/// `==` is exact for them.
fn keypoints_eq(a: &Keypoints, b: &Keypoints) -> bool {
    a.count == b.count
        && a.detector == b.detector
        && a.level_start == b.level_start
        && f32_bits_eq(&a.x, &b.x)
        && f32_bits_eq(&a.y, &b.y)
        && f32_bits_eq(&a.angle, &b.angle)
        && f32_bits_eq(&a.score, &b.score)
        && f32_opt_bits_eq(&a.size, &b.size)
        && a.level == b.level
}

/// `DescriptorData` equality: `Bits`/`U8` are plain bytes (`==` is exact),
/// `F32` needs the same NaN-tolerant bitwise comparison as the keypoint
/// arrays, for the same reason (§5.6 imposes no finiteness rule on
/// descriptor elements either).
fn descriptor_data_eq(a: &DescriptorData, b: &DescriptorData) -> bool {
    match (a, b) {
        (DescriptorData::Bits(a), DescriptorData::Bits(b)) => a == b,
        (DescriptorData::U8(a), DescriptorData::U8(b)) => a == b,
        (DescriptorData::F32(a), DescriptorData::F32(b)) => f32_bits_eq(a, b),
        _ => false,
    }
}

/// `DescriptorSet` equality, field by field. `params` is `serde_json::Value`
/// content: `serde_json::Number` cannot itself represent NaN or an infinity
/// (`serde_json` refuses to construct one — see `validate_target.rs`'s note
/// on check (d)), so plain `==` is exact there; only `data` needs the
/// bitwise treatment.
fn descriptor_set_eq(a: &DescriptorSet, b: &DescriptorSet) -> bool {
    a.kind == b.kind
        && a.norm == b.norm
        && a.dimensions == b.dimensions
        && a.bytes_per_descriptor == b.bytes_per_descriptor
        && a.producer == b.producer
        && a.params == b.params
        && a.count == b.count
        && a.level_start == b.level_start
        && a.kp_index == b.kp_index
        && descriptor_data_eq(&a.data, &b.data)
}

/// §7.3's canonical sort key for `descriptorSets` (kind, norm, dimensions,
/// producer), duplicated here for the same reason the order-insensitive
/// comparison below needs it: `encode` sorts by this key before writing,
/// `decode` preserves file order, so comparing two decodes of the same
/// content needs to normalise on it first.
fn descriptor_set_sort_key(s: &DescriptorSet) -> (&str, &str, u32, &str) {
    (
        s.kind.as_str(),
        s.norm.as_str(),
        s.dimensions,
        s.producer.as_str(),
    )
}

/// Order-insensitive, NaN-tolerant equality for `descriptor_sets`. See the
/// module-level comment on why order is not part of the contract here, and
/// `descriptor_set_eq` for why only `data` needs bitwise comparison.
fn descriptor_sets_eq_unordered(a: &[DescriptorSet], b: &[DescriptorSet]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut a: Vec<&DescriptorSet> = a.iter().collect();
    let mut b: Vec<&DescriptorSet> = b.iter().collect();
    a.sort_by(|x, y| descriptor_set_sort_key(x).cmp(&descriptor_set_sort_key(y)));
    b.sort_by(|x, y| descriptor_set_sort_key(x).cmp(&descriptor_set_sort_key(y)));
    a.iter().zip(b.iter()).all(|(x, y)| descriptor_set_eq(x, y))
}

/// `patches.score` is the one `f32` array outside `keypoints` and
/// `descriptorSets`; everything else in `Patches` is integral bytes, so only
/// `score` needs bitwise comparison.
fn patches_eq(a: &Option<Patches>, b: &Option<Patches>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => {
            a.patch_size == b.patch_size
                && a.count == b.count
                && f32_bits_eq(&a.score, &b.score)
                && a.left == b.left
                && a.top == b.top
                && a.level == b.level
                && a.pixels == b.pixels
        }
        (None, None) => true,
        _ => false,
    }
}

/// §8.4's round-trip equality: every field of `Target` compared strictly,
/// except that `descriptor_sets` order is not part of the contract (see
/// `descriptor_sets_eq_unordered`) and every `f32` array is compared bitwise
/// so a NaN anywhere in valid binary data does not make a faithful round trip
/// look like a mismatch (see `f32_bits_eq`).
///
/// `meta.physical_size_mm` (`f64`) and `pyramid.scale_step` (`f64`) do not
/// need the same treatment: `validate_target` requires both finite
/// (`w.is_finite()`, `scale_step.is_finite()`), so neither can ever carry a
/// NaN in a target that reached `encode` successfully, and plain `==` is
/// exact for them.
fn targets_round_trip_eq(a: &Target, b: &Target) -> bool {
    a.format_version == b.format_version
        && a.generator == b.generator
        && a.extensions_used == b.extensions_used
        && a.extensions_required == b.extensions_required
        && a.meta == b.meta
        && a.pyramid == b.pyramid
        && keypoints_eq(&a.keypoints, &b.keypoints)
        && descriptor_sets_eq_unordered(&a.descriptor_sets, &b.descriptor_sets)
        && patches_eq(&a.patches, &b.patches)
        && a.reference_image == b.reference_image
        && a.info == b.info
}

/// Checks (c) at the value level, mirroring `validate_target.rs`'s private
/// `number_offends` (the writer's own, deliberately-stricter-than-the-reader
/// rule on integer-*valued* numbers — see §7.3's paragraph on check (c)).
/// That function is not part of the crate's public or `testing` surface, so
/// this is a duplicate, not a call, but it is checked against the same
/// specification sentence and reuses the crate's own `MAX_EXACT_INTEGER`
/// rather than re-deriving the constant.
fn number_offends(n: &serde_json::Number) -> bool {
    let max = MAX_EXACT_INTEGER;
    if let Some(i) = n.as_i64() {
        return i < -max || i > max;
    }
    if let Some(u) = n.as_u64() {
        // `max` is positive, so this cast is exact.
        return u > max as u64;
    }
    match n.as_f64() {
        Some(f) if !f.is_finite() => true,
        Some(f) => f < -(max as f64) || f > max as f64,
        None => false,
    }
}

/// Recursively scans one JSON value for a check-(c)-offending number,
/// anywhere inside it — `params` and `info` are free-form (§5.5, §5.6,
/// §5.9), so the offending value can be nested arbitrarily deep in an object
/// or array, not just a top-level member.
fn value_has_oversized_integer(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::Number(n) => number_offends(n),
        serde_json::Value::Array(items) => items.iter().any(value_has_oversized_integer),
        serde_json::Value::Object(map) => map.values().any(value_has_oversized_integer),
        serde_json::Value::String(_) | serde_json::Value::Bool(_) | serde_json::Value::Null => {
            false
        }
    }
}

fn params_has_oversized_integer(p: &Params) -> bool {
    p.values().any(value_has_oversized_integer)
}

/// Whether `target`'s free-form content (`keypoints.detector.params`, every
/// descriptor set's `params`, and `info`) carries a number that offends
/// check (c) at the value level — the condition §7.3 documents as the
/// writer's one deliberate extra rejection beyond what the reader enforces.
fn target_has_oversized_integer(target: &Target) -> bool {
    params_has_oversized_integer(&target.keypoints.detector.params)
        || target
            .descriptor_sets
            .iter()
            .any(|s| params_has_oversized_integer(&s.params))
        || target
            .info
            .as_ref()
            .is_some_and(params_has_oversized_integer)
}

fuzz_target!(|data: &[u8]| {
    let Ok(decoded) = decode(data, &DEFAULT_LIMITS) else {
        return;
    };

    match encode(&decoded.target) {
        Ok(bytes) => {
            // The real round trip (§8.4): what the writer emits for an
            // accepted target must decode back to the same values.
            let again =
                decode(&bytes, &DEFAULT_LIMITS).expect("canonical output must decode (§8.4)");

            // §7.3 requires the canonical writer to sort `descriptorSets` by
            // (kind, norm, dimensions, producer) before writing (see the sort
            // in src/encode.rs, just before the BIN layout); `decode`, by
            // contrast, preserves the manifest's own file order verbatim
            // (each set is pushed in file order in the `descriptorSets`
            // parse loop in src/manifest.rs). So a `decoded.target` whose
            // sets are not already in that sorted order re-encodes into
            // sorted order and decodes back as `again.target` in that
            // (possibly different) `Vec` order -- a legal disagreement in
            // `descriptor_sets` order, not a reader/writer bug.
            //
            // Note: the specification does not say whether a reader is
            // expected to normalise `descriptorSets` order on decode. This
            // codec and its TypeScript peer both happen to preserve file
            // order, so they agree today -- but that agreement is a shared
            // implementation choice, not a written contract, and a future
            // change to either side's ordering behavior would not violate
            // any documented rule.
            //
            // `targets_round_trip_eq` folds this order-insensitivity together
            // with the NaN-tolerant, bitwise comparison every `f32` array
            // needs (see its doc comment): every other field of `Target`,
            // and every non-ordering field of each `DescriptorSet`, is still
            // compared strictly.
            assert!(
                targets_round_trip_eq(&again.target, &decoded.target),
                "round trip changed values (§8.4)"
            );

            // §7.3's opening line: the same content always produces the same
            // bytes. Encoding twice must not be able to disagree with itself.
            let bytes_again =
                encode(&decoded.target).expect("encode must succeed again on the same target");
            assert_eq!(bytes, bytes_again, "encode is not deterministic (§7.3)");
        }
        Err(err) => {
            // An accepted decode that `encode` then refuses is legal for two
            // documented reasons, not one, and this arm now checks for
            // exactly those two rather than trusting the error code alone
            // (see below for why the code can't be trusted):
            //
            // - §5.6: a file whose every descriptor set has an unknown
            //   `elementType` still decodes (each such set is dropped with
            //   `UNSUPPORTED_DESCRIPTOR_SET`), but the resulting target then
            //   carries no descriptor set at all, and §5.1 requires at least
            //   one. The canonical writer refuses to re-emit that target
            //   rather than write a file §5.1 forbids. Detected directly:
            //   `decoded.target.descriptor_sets.is_empty()`.
            // - §7.3's paragraph on check (c), quoted in `number_offends`'s
            //   doc comment: "the writer is deliberately stricter than the
            //   reader" there, because "number formatting is not fixed
            //   across languages" (Q8), so the writer refuses any
            //   integer-valued number outside ±(2^53 − 1) in `params` or
            //   `info` even though the reader would have accepted the same
            //   value spelled with a fraction or exponent (e.g. `1e21`).
            //   Detected by `target_has_oversized_integer`, which walks
            //   `keypoints.detector.params`, every descriptor set's
            //   `params`, and `info` recursively, since these are arbitrary
            //   JSON and the offending value can be nested anywhere in them.
            //
            // Unlike §5.6's case, §7.3's can fire with descriptor sets very
            // much present, so the two checks are independent, not
            // mutually exclusive branches of one condition.
            //
            // Every `EncodeError` this crate constructs carries
            // `ErrorCode::InvalidTarget` (`encode.rs`'s `invalid()` hardcodes
            // it, and `too_large()` delegates to `invalid()`), so asserting
            // only `err.code == ErrorCode::InvalidTarget` can never fail and
            // proves nothing about *why* the writer refused. The two checks
            // below are what actually verify the refusal was for one of the
            // two documented reasons; the code assertion is kept alongside
            // them only as a cheap, currently-redundant sanity check that
            // would start pulling its own weight if `EncodeError` ever grows
            // a second code.
            assert_eq!(
                err.code,
                ErrorCode::InvalidTarget,
                "encode failed with an unexpected error code"
            );
            assert!(
                decoded.target.descriptor_sets.is_empty()
                    || target_has_oversized_integer(&decoded.target),
                "encode failed for a reason other than §5.6's no-descriptor-sets case or \
                 §7.3's check-(c) case: {err:?}"
            );
        }
    }
});
