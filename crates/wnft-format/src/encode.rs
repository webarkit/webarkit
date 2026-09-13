/*
 *  encode.rs
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

//! The canonical writer (§7.3): validate, lay out the `BIN` chunk, emit the
//! manifest, frame. Four phases, in that order, and the order is load-bearing
//! — nothing is written until validation has passed, and the accessor table
//! is not final until every array is laid out.
//!
//! §7.3's promise is that the same content always produces the same bytes
//! *from the same implementation*. Cross-implementation conformance is
//! item 4's, weaker, comparison — the `BIN\0` chunk byte-identical, the
//! manifest equal after parsing — because Q8 leaves number formatting free
//! across languages (`tests/writer.rs`'s module docs go into why).

use alloc::format;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

use crate::arrays::{Accessor, AccessorType};
use crate::canonical_json::{
    array, json_number_f64, json_number_u32, json_number_usize, json_string, object,
};
use crate::container::{CHUNK_HEADER_LEN, HEADER_LEN, align8, build_container};
use crate::error::{EncodeError, ErrorCode};
use crate::target::{DescriptorData, DescriptorSet, Params, Target};
use crate::validate_target::validate_target;

/// Build an [`EncodeError`] naming `path` — the shorthand every failure in
/// this module and in [`validate_target`] goes through.
fn invalid(path: impl Into<String>) -> EncodeError {
    EncodeError {
        code: ErrorCode::InvalidTarget,
        detail: path.into(),
    }
}

/// The one error a size check anywhere in this module can return: either an
/// individual `accessors[].offset`/chunk `chunk_length` (§5.2, §4.2) or the
/// whole file's own `total_length` (§4.1) would need more than a `u32` can
/// hold.
///
/// All three are `u32` fields, so `u32::MAX` (4 GiB, minus one byte) is the
/// largest any of them can describe — not a limit this crate invented, but
/// the one those fields already impose. Before this task, `build_container`
/// reached this same ceiling by truncating silently
/// (`u32::try_from(...).unwrap_or(u32::MAX)`, in two places: one chunk's own
/// `chunk_length`, and the file's `total_length`), which wrote a length that
/// did not describe the bytes that followed it: a malformed file, not a
/// refused one. Checking every one of them here, before a single byte
/// reaches `build_container`, turns that into `INVALID_TARGET` instead.
fn too_large() -> EncodeError {
    invalid(
        "the target's encoded file would exceed 2^32 - 1 bytes, the largest an accessor offset, a chunk_length or the container's total_length can address",
    )
}

/// The whole file [`build_container`] would emit for a `JSON` chunk of
/// `json_len` bytes and a `BIN\0` chunk of `bin_len` bytes: the 16-byte file
/// header, plus a 16-byte chunk header and that chunk's *padded* data for
/// each of the two chunks (§4.1, §4.2) — this crate always emits exactly
/// `JSON` then `BIN\0`, never a bare `JSON` chunk alone (see `encode`'s
/// final call). Mirrors `build_container`'s own arithmetic so `encode` can
/// check the total *before* calling it rather than trust it not to overflow
/// silently — see [`too_large`] for why that trust used to be misplaced.
///
/// `None` when the total cannot be computed at all — on a 32-bit target a
/// `json_len`/`bin_len` well short of `u32::MAX` can already overflow
/// `usize` itself — **or** when it can, but exceeds `u32::MAX`: the field
/// this total becomes (`total_length`, §4.1) is a `u32`, so a computable but
/// oversized total is exactly as much a reason to refuse as an
/// uncomputable one. Folding the `u32::MAX` comparison in here (rather than
/// leaving it to the caller) is what makes this function directly
/// testable without allocating the multi-gigabyte buffers a real oversized
/// `Target` would need: every case below is a plain `usize` arithmetic
/// question.
fn total_file_size(json_len: usize, bin_len: usize) -> Option<usize> {
    let padded_json = align8(json_len)?;
    let padded_bin = align8(bin_len)?;
    let total = HEADER_LEN
        .checked_add(CHUNK_HEADER_LEN)?
        .checked_add(padded_json)?
        .checked_add(CHUNK_HEADER_LEN)?
        .checked_add(padded_bin)?;
    if total > u32::MAX as usize {
        None
    } else {
        Some(total)
    }
}

/// The `BIN` chunk under construction: raw bytes, plus one [`Accessor`] per
/// array appended, in the order §7.3 fixes ("accessors in the order their
/// fields first appear in the manifest").
struct BinBuilder {
    bytes: Vec<u8>,
    accessors: Vec<Accessor>,
}

impl BinBuilder {
    fn new() -> Self {
        Self {
            bytes: Vec::new(),
            accessors: Vec::new(),
        }
    }

    /// Pad to the next multiple of 8 with zero bytes (§7.3, §4.2).
    fn align(&mut self) -> Result<(), EncodeError> {
        let rem = self.bytes.len() % 8;
        if rem == 0 {
            return Ok(());
        }
        let pad = 8 - rem;
        let new_len = self.bytes.len().checked_add(pad).ok_or_else(too_large)?;
        self.bytes.resize(new_len, 0);
        Ok(())
    }

    /// Append `data` (already little-endian, §3), aligned, and record an
    /// accessor for it. Returns the accessor's index into `self.accessors`.
    fn push(&mut self, ty: AccessorType, count: usize, data: &[u8]) -> Result<usize, EncodeError> {
        self.align()?;
        let offset = u32::try_from(self.bytes.len()).map_err(|_| too_large())?;
        let count_u32 = u32::try_from(count).map_err(|_| too_large())?;
        self.bytes.extend_from_slice(data);
        // Re-checked after extending: the offset alone fitting `u32` does not
        // guarantee the chunk's new *length* still does.
        u32::try_from(self.bytes.len()).map_err(|_| too_large())?;
        let idx = self.accessors.len();
        self.accessors.push(Accessor {
            offset,
            count: count_u32,
            ty,
        });
        Ok(idx)
    }

    fn push_u8(&mut self, values: &[u8]) -> Result<usize, EncodeError> {
        self.push(AccessorType::U8, values.len(), values)
    }

    fn push_u16(&mut self, values: &[u16]) -> Result<usize, EncodeError> {
        let byte_len = values.len().checked_mul(2).ok_or_else(too_large)?;
        let mut bytes = Vec::with_capacity(byte_len);
        for v in values {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        self.push(AccessorType::U16, values.len(), &bytes)
    }

    fn push_u32(&mut self, values: &[u32]) -> Result<usize, EncodeError> {
        let byte_len = values.len().checked_mul(4).ok_or_else(too_large)?;
        let mut bytes = Vec::with_capacity(byte_len);
        for v in values {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        self.push(AccessorType::U32, values.len(), &bytes)
    }

    fn push_f32(&mut self, values: &[f32]) -> Result<usize, EncodeError> {
        let byte_len = values.len().checked_mul(4).ok_or_else(too_large)?;
        let mut bytes = Vec::with_capacity(byte_len);
        for v in values {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        self.push(AccessorType::F32, values.len(), &bytes)
    }
}

/// Encode `target` into a canonical `.wnft` buffer (§7.3).
///
/// # Errors
///
/// [`ErrorCode::InvalidTarget`] when `target` is one a conforming reader
/// would reject — `detail` names the offending field path, e.g.
/// `"descriptorSets[1].params.seed"`. Nothing is written on failure.
pub fn encode(target: &Target) -> Result<Vec<u8>, EncodeError> {
    // Phase 1: validate. Nothing below this line runs on a target this
    // build could not safely re-emit.
    if let Some(path) = validate_target(target) {
        return Err(invalid(path));
    }

    // Phase 2: sort descriptorSets by (kind, norm, dimensions, producer)
    // (§7.3). `str`'s `Ord` is byte order, which for valid UTF-8 is Unicode
    // code-point order — the same comparator §7.3 wants.
    let mut sets: Vec<&DescriptorSet> = target.descriptor_sets.iter().collect();
    sets.sort_by(|a, b| {
        (
            a.kind.as_str(),
            a.norm.as_str(),
            a.dimensions,
            a.producer.as_str(),
        )
            .cmp(&(
                b.kind.as_str(),
                b.norm.as_str(),
                b.dimensions,
                b.producer.as_str(),
            ))
    });

    // Phase 3: lay out the BIN chunk. Accessors in the order their fields
    // first appear in the manifest (§7.3): keypoints, then per sorted set,
    // then patches, then referenceImage.
    let mut bin = BinBuilder::new();
    let kp = &target.keypoints;

    let kp_level_start_idx = bin.push_u32(&kp.level_start)?;
    let kp_x_idx = bin.push_f32(&kp.x)?;
    let kp_y_idx = bin.push_f32(&kp.y)?;
    let kp_angle_idx = bin.push_f32(&kp.angle)?;
    let kp_score_idx = bin.push_f32(&kp.score)?;
    let kp_size_idx = match &kp.size {
        Some(values) => Some(bin.push_f32(values)?),
        None => None,
    };
    let kp_level_idx = bin.push_u8(&kp.level)?;

    struct SetIndices {
        level_start: usize,
        kp_index: usize,
        data: usize,
    }
    let mut set_indices = Vec::with_capacity(sets.len());
    for set in &sets {
        let level_start = bin.push_u32(&set.level_start)?;
        let kp_index = bin.push_u32(&set.kp_index)?;
        let data = match &set.data {
            DescriptorData::F32(values) => bin.push_f32(values)?,
            DescriptorData::Bits(values) | DescriptorData::U8(values) => bin.push_u8(values)?,
        };
        set_indices.push(SetIndices {
            level_start,
            kp_index,
            data,
        });
    }

    let patch_indices = match &target.patches {
        Some(patches) => {
            let score = bin.push_f32(&patches.score)?;
            let left = bin.push_u16(&patches.left)?;
            let top = bin.push_u16(&patches.top)?;
            let level = bin.push_u8(&patches.level)?;
            let pixels = bin.push_u8(&patches.pixels)?;
            Some((score, left, top, level, pixels))
        }
        None => None,
    };

    let reference_image_pixels_idx = match &target.reference_image {
        Some(reference_image) => Some(bin.push_u8(&reference_image.pixels)?),
        None => None,
    };

    // Phase 4: emit the manifest, keys in §5.1's order.
    let mut top: Vec<(&str, String)> = Vec::new();

    let mut format_members: Vec<(&str, String)> =
        vec![("version", json_string(&target.format_version))];
    if let Some(generator) = &target.generator {
        format_members.push(("generator", json_string(generator)));
    }
    top.push(("format", object(&format_members)));

    if !target.extensions_used.is_empty() {
        let mut names = target.extensions_used.clone();
        names.sort();
        top.push((
            "extensionsUsed",
            array(&names.iter().map(|s| json_string(s)).collect::<Vec<_>>()),
        ));
    }
    if !target.extensions_required.is_empty() {
        let mut names = target.extensions_required.clone();
        names.sort();
        top.push((
            "extensionsRequired",
            array(&names.iter().map(|s| json_string(s)).collect::<Vec<_>>()),
        ));
    }

    let physical_size_mm = match target.meta.physical_size_mm {
        Some([w, h]) => {
            let w_json = json_number_f64(w).ok_or_else(|| invalid("meta.physicalSizeMm[0]"))?;
            let h_json = json_number_f64(h).ok_or_else(|| invalid("meta.physicalSizeMm[1]"))?;
            format!("[{w_json},{h_json}]")
        }
        None => String::from("null"),
    };
    top.push((
        "meta",
        object(&[
            ("widthPx", json_number_u32(target.meta.width_px)),
            ("heightPx", json_number_u32(target.meta.height_px)),
            ("physicalSizeMm", physical_size_mm),
        ]),
    ));

    let scale_step_json =
        json_number_f64(target.pyramid.scale_step).ok_or_else(|| invalid("pyramid.scaleStep"))?;
    let level_sizes_json = array(
        &target
            .pyramid
            .level_sizes
            .iter()
            .map(|&[w, h]| format!("[{},{}]", json_number_u32(w), json_number_u32(h)))
            .collect::<Vec<_>>(),
    );
    top.push((
        "pyramid",
        object(&[
            ("scaleStep", scale_step_json),
            ("levelSizes", level_sizes_json),
        ]),
    ));

    let mut detector_members: Vec<(&str, String)> = vec![("kind", json_string(&kp.detector.kind))];
    if !kp.detector.params.is_empty() {
        detector_members.push(("params", params_json(&kp.detector.params)));
    }
    let mut keypoints_members: Vec<(&str, String)> = vec![
        ("count", json_number_u32(kp.count)),
        ("detector", object(&detector_members)),
        ("levelStart", json_number_usize(kp_level_start_idx)),
        ("x", json_number_usize(kp_x_idx)),
        ("y", json_number_usize(kp_y_idx)),
        ("angle", json_number_usize(kp_angle_idx)),
        ("score", json_number_usize(kp_score_idx)),
    ];
    if let Some(idx) = kp_size_idx {
        keypoints_members.push(("size", json_number_usize(idx)));
    }
    keypoints_members.push(("level", json_number_usize(kp_level_idx)));
    top.push(("keypoints", object(&keypoints_members)));

    let descriptor_sets_json = array(
        &sets
            .iter()
            .zip(&set_indices)
            .map(|(set, indices)| {
                descriptor_set_json(set, indices.level_start, indices.kp_index, indices.data)
            })
            .collect::<Vec<_>>(),
    );
    top.push(("descriptorSets", descriptor_sets_json));

    if let (Some(patches), Some((score, left, top_idx, level, pixels))) =
        (&target.patches, &patch_indices)
    {
        top.push((
            "patches",
            object(&[
                ("patchSize", json_number_u32(patches.patch_size)),
                ("count", json_number_u32(patches.count)),
                ("score", json_number_usize(*score)),
                ("left", json_number_usize(*left)),
                ("top", json_number_usize(*top_idx)),
                ("level", json_number_usize(*level)),
                ("pixels", json_number_usize(*pixels)),
            ]),
        ));
    }

    if let (Some(reference_image), Some(pixels_idx)) =
        (&target.reference_image, reference_image_pixels_idx)
    {
        top.push((
            "referenceImage",
            object(&[
                ("level", json_number_u32(reference_image.level)),
                ("width", json_number_u32(reference_image.width)),
                ("height", json_number_u32(reference_image.height)),
                ("pixels", json_number_usize(pixels_idx)),
            ]),
        ));
    }

    if let Some(info) = &target.info {
        top.push(("info", params_json(info)));
    }

    top.push((
        "accessors",
        array(&bin.accessors.iter().map(accessor_json).collect::<Vec<_>>()),
    ));

    let manifest = object(&top);

    // Bound the *whole file*, not just the BIN payload (finding 2 of the
    // task-8 review): the BIN chunk alone fitting u32::MAX bytes (checked
    // incrementally by every `BinBuilder::push` above) does not bound
    // `total_length` — the file header, both chunk headers and the padded
    // manifest all add to it too, and a manifest whose own free-form
    // `params`/`info` are large enough, atop a near-maximal BIN chunk, can
    // still push `total_length` past what its `u32` field can hold.
    // `total_file_size` folds the `u32::MAX` comparison in, so `None` here
    // covers both "cannot even be computed" and "computable but oversized".
    total_file_size(manifest.len(), bin.bytes.len()).ok_or_else(too_large)?;

    Ok(build_container(manifest.as_bytes(), Some(&bin.bytes)))
}

/// `params`/`info`: delegated whole to `serde_json`, whose `Map` is a
/// `BTreeMap` (§7.3's code-point key order, for free — see the module docs
/// of `canonical_json.rs`).
fn params_json(params: &Params) -> String {
    serde_json::to_string(params).unwrap_or_else(|_| String::from("{}"))
}

/// One `descriptorSets` entry, keys in §5.1's order.
fn descriptor_set_json(
    set: &DescriptorSet,
    level_start_idx: usize,
    kp_index_idx: usize,
    data_idx: usize,
) -> String {
    let mut members: Vec<(&str, String)> = vec![
        ("kind", json_string(&set.kind)),
        ("norm", json_string(&set.norm)),
        ("elementType", json_string(set.data.element_type())),
        ("dimensions", json_number_u32(set.dimensions)),
        (
            "bytesPerDescriptor",
            json_number_u32(set.bytes_per_descriptor),
        ),
        ("producer", json_string(&set.producer)),
    ];
    if !set.params.is_empty() {
        members.push(("params", params_json(&set.params)));
    }
    members.push(("count", json_number_u32(set.count)));
    members.push(("levelStart", json_number_usize(level_start_idx)));
    members.push(("kpIndex", json_number_usize(kp_index_idx)));
    members.push(("data", json_number_usize(data_idx)));
    object(&members)
}

/// One `accessors` entry: `offset`, `count`, `type` (§5.2, §7.3).
fn accessor_json(accessor: &Accessor) -> String {
    let ty = match accessor.ty {
        AccessorType::U8 => "u8",
        AccessorType::U16 => "u16",
        AccessorType::U32 => "u32",
        AccessorType::F32 => "f32",
    };
    object(&[
        ("offset", json_number_u32(accessor.offset)),
        ("count", json_number_u32(accessor.count)),
        ("type", json_string(ty)),
    ])
}

/// [`total_file_size`]'s own arithmetic, exercised directly: a real `Target`
/// whose manifest or `BIN` chunk actually reaches multi-gigabyte size is not
/// something a test can afford to build, but the bound only needs `usize`
/// lengths, never the bytes themselves, so it is fully testable without one
/// (finding 2 of the task-8 review).
#[cfg(test)]
mod tests {
    // Direct indexing and `expect` are the idiom in this crate's own test
    // modules, the same way `consistency.rs`'s does — see that module's
    // `mod tests` for why the crate-wide denies are lifted here.
    #![allow(
        clippy::indexing_slicing,
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic
    )]

    use super::total_file_size;

    #[test]
    fn total_file_size_sums_header_two_chunk_headers_and_padded_data() {
        // 16-byte file header + 16-byte JSON header + 8 bytes of JSON data
        // (already a multiple of 8, no padding) + 16-byte BIN header + 4
        // bytes of BIN data padded to 8.
        let total = total_file_size(8, 4).expect("small sizes must not overflow");
        assert_eq!(total, 16 + 16 + 8 + 16 + 8);
    }

    #[test]
    fn total_file_size_pads_each_chunk_independently() {
        // JSON at 1 byte pads to 8; BIN at 9 bytes pads to 16.
        let total = total_file_size(1, 9).expect("small sizes must not overflow");
        assert_eq!(total, 16 + 16 + 8 + 16 + 16);
    }

    #[test]
    fn total_file_size_refuses_a_file_that_would_exceed_u32_max() {
        // Two chunks each well within u32::MAX on their own, but whose sum
        // (plus headers) is not — exactly the case a per-chunk-only bound
        // (the `BinBuilder` guard alone) would miss. This is finding 2's
        // counter-example made concrete: it needs no multi-gigabyte
        // allocation, only the two lengths `total_file_size` is handed.
        let half =
            (usize::try_from(u32::MAX).expect("u32::MAX fits usize on any target width") / 2) + 1;
        assert_eq!(total_file_size(half, half), None);
    }

    #[test]
    fn total_file_size_accepts_the_largest_representable_total_and_refuses_one_byte_more() {
        // `total_file_size`'s result is always `48 + a multiple of 8`
        // (header + two chunk headers, each all multiples of 8, plus two
        // independently 8-aligned chunks), and `u32::MAX` (4_294_967_295) is
        // odd — so the boundary this function can actually reach is the
        // largest multiple of 8 not exceeding `u32::MAX`, one 8-byte step
        // below it is still accepted, and one 8-byte step above must not be.
        let max = usize::try_from(u32::MAX).expect("u32::MAX fits usize on any target width");
        let largest_reachable = max - (max % 8); // 4_294_967_288
        let overhead = 16 + 16 + 16;
        let json_len = 0usize;
        let bin_len = largest_reachable - overhead;
        assert_eq!(bin_len % 8, 0, "test setup: bin_len must need no padding");

        assert_eq!(
            total_file_size(json_len, bin_len),
            Some(largest_reachable),
            "the largest multiple of 8 at or under u32::MAX must be accepted"
        );
        assert_eq!(
            total_file_size(json_len, bin_len + 8),
            None,
            "one 8-byte step past u32::MAX must be refused"
        );
    }
}
