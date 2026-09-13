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
use crate::container::build_container;
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

/// The one error every [`BinBuilder`] method can return: the target's `BIN`
/// chunk would need to be larger than an `accessors[].offset` (§5.2) or the
/// container's own `chunk_length` (§4.2) can address.
///
/// Both are `u32` fields, so `u32::MAX` (4 GiB, minus one byte) is the
/// largest `BIN` chunk this format can describe at all — not a limit this
/// crate invented, but the one the two `u32` fields already impose. Before
/// this task, `build_container` reached this same ceiling by truncating
/// silently (`u32::try_from(...).unwrap_or(u32::MAX)`), which wrote a
/// `chunk_length` that did not describe the bytes that followed it: a
/// malformed file, not a refused one. Checking it here, before a single byte
/// reaches `build_container`, turns that into `INVALID_TARGET` instead.
fn too_large() -> EncodeError {
    invalid(
        "the target's BIN chunk would exceed 2^32 - 1 bytes, the largest an accessor offset or the container's chunk_length can address",
    )
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
