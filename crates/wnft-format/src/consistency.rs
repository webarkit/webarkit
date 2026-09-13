/*
 *  consistency.rs
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

//! Data consistency (§6.1 step 7): the last gate, and the only one that reads
//! array **contents** rather than shape. Everything step 6 settled — every
//! array's length, every number's domain — is assumed here; this module is
//! about agreement *between* fields.
//!
//! [`materialise_all`] copies every array a validated [`ManifestSpec`]
//! references out of the `BIN` chunk into a [`TargetArrays`]. `None` from it is
//! unreachable once step 6 has passed — every accessor it resolves was already
//! bounds- and type-checked — so `decode` turns that `None` into `BAD_LAYOUT`
//! as a belt to step 6's braces, not as the primary enforcement.
//!
//! [`check_consistency`] then checks the rules of §6.1 step 7 and the sections
//! it cites (§5.3–§5.8) against the materialised arrays. Every failure is
//! `INCONSISTENT_DATA` (§6.2).

use alloc::format;
use alloc::vec::Vec;

use crate::arrays::{Accessor, AccessorArray, materialise};
use crate::error::{DecodeError, ErrorCode, fail};
use crate::manifest::{
    ManifestDescriptorSet, ManifestPatches, ManifestReferenceImage, ManifestSpec,
};
use crate::target::DescriptorData;

/// `keypoints`' arrays (§5.5), materialised.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct KeypointArrays {
    pub(crate) level_start: Vec<u32>,
    pub(crate) x: Vec<f32>,
    pub(crate) y: Vec<f32>,
    pub(crate) angle: Vec<f32>,
    pub(crate) score: Vec<f32>,
    pub(crate) size: Option<Vec<f32>>,
    pub(crate) level: Vec<u8>,
}

/// One entry of `descriptorSets` (§5.6), materialised. `kind`, `norm`,
/// `dimensions`, `bytesPerDescriptor`, `producer`, `params` and `count` stay on
/// the matching [`ManifestDescriptorSet`] — they were never accessor
/// references, so there is nothing here for this task to copy.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SetArrays {
    pub(crate) level_start: Vec<u32>,
    pub(crate) kp_index: Vec<u32>,
    pub(crate) data: DescriptorData,
}

/// `patches`' arrays (§5.7), materialised.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PatchArrays {
    pub(crate) score: Vec<f32>,
    pub(crate) left: Vec<u16>,
    pub(crate) top: Vec<u16>,
    pub(crate) level: Vec<u8>,
    pub(crate) pixels: Vec<u8>,
}

/// `referenceImage`'s pixels (§5.8), materialised. `level`, `width` and
/// `height` stay on the matching [`ManifestReferenceImage`].
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ReferenceImageArrays {
    pub(crate) pixels: Vec<u8>,
}

/// Every array a validated [`ManifestSpec`] references, materialised out of
/// the `BIN` chunk and grouped the way [`crate::target::Target`] groups its
/// fields.
///
/// `sets` holds one entry per **kept** descriptor set, in
/// `ManifestSpec::descriptor_sets` order, so the two index together — a set
/// with an unknown `elementType` was already dropped in step 6, so the
/// manifest's list is already the kept list.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct TargetArrays {
    pub(crate) keypoints: KeypointArrays,
    pub(crate) sets: Vec<SetArrays>,
    pub(crate) patches: Option<PatchArrays>,
    pub(crate) reference_image: Option<ReferenceImageArrays>,
}

/// Materialise the accessor at index `idx`, or `None` if the index is out of
/// range. `spec`'s own construction guarantees every index it stores is in
/// range, so this is a belt, not the primary check.
fn materialise_at(bin: &[u8], accessors: &[Accessor], idx: usize) -> Option<AccessorArray> {
    materialise(bin, accessors.get(idx)?)
}

/// Narrow an [`AccessorArray`] to its `u8` variant, or `None` on a mismatch.
/// Unreachable once step 6 has resolved the accessor reference against the
/// expected type, exactly like [`materialise_at`]'s own `None`.
fn as_u8(arr: AccessorArray) -> Option<Vec<u8>> {
    match arr {
        AccessorArray::U8(v) => Some(v),
        _ => None,
    }
}

/// Narrow an [`AccessorArray`] to its `u16` variant.
fn as_u16(arr: AccessorArray) -> Option<Vec<u16>> {
    match arr {
        AccessorArray::U16(v) => Some(v),
        _ => None,
    }
}

/// Narrow an [`AccessorArray`] to its `u32` variant.
fn as_u32(arr: AccessorArray) -> Option<Vec<u32>> {
    match arr {
        AccessorArray::U32(v) => Some(v),
        _ => None,
    }
}

/// Narrow an [`AccessorArray`] to its `f32` variant.
fn as_f32(arr: AccessorArray) -> Option<Vec<f32>> {
    match arr {
        AccessorArray::F32(v) => Some(v),
        _ => None,
    }
}

/// Materialise one `u8`-accessor field.
fn field_u8(bin: &[u8], accessors: &[Accessor], idx: usize) -> Option<Vec<u8>> {
    as_u8(materialise_at(bin, accessors, idx)?)
}

/// Materialise one `u16`-accessor field.
fn field_u16(bin: &[u8], accessors: &[Accessor], idx: usize) -> Option<Vec<u16>> {
    as_u16(materialise_at(bin, accessors, idx)?)
}

/// Materialise one `u32`-accessor field.
fn field_u32(bin: &[u8], accessors: &[Accessor], idx: usize) -> Option<Vec<u32>> {
    as_u32(materialise_at(bin, accessors, idx)?)
}

/// Materialise one `f32`-accessor field.
fn field_f32(bin: &[u8], accessors: &[Accessor], idx: usize) -> Option<Vec<f32>> {
    as_f32(materialise_at(bin, accessors, idx)?)
}

/// One `materialise` call per accessor a validated `spec` references (§6.1,
/// between steps 6 and 7). `None` is unreachable once step 6 has passed —
/// `decode` turns it into `BAD_LAYOUT`.
pub(crate) fn materialise_all(bin: &[u8], spec: &ManifestSpec) -> Option<TargetArrays> {
    let accessors = &spec.accessors;
    let kp = &spec.keypoints;

    let keypoints = KeypointArrays {
        level_start: field_u32(bin, accessors, kp.level_start)?,
        x: field_f32(bin, accessors, kp.x)?,
        y: field_f32(bin, accessors, kp.y)?,
        angle: field_f32(bin, accessors, kp.angle)?,
        score: field_f32(bin, accessors, kp.score)?,
        size: match kp.size {
            Some(idx) => Some(field_f32(bin, accessors, idx)?),
            None => None,
        },
        level: field_u8(bin, accessors, kp.level)?,
    };

    let mut sets = Vec::with_capacity(spec.descriptor_sets.len());
    for set in &spec.descriptor_sets {
        let level_start = field_u32(bin, accessors, set.level_start)?;
        let kp_index = field_u32(bin, accessors, set.kp_index)?;
        let data = match set.element_type.as_str() {
            "f32" => DescriptorData::F32(field_f32(bin, accessors, set.data)?),
            "bits" => DescriptorData::Bits(field_u8(bin, accessors, set.data)?),
            "u8" => DescriptorData::U8(field_u8(bin, accessors, set.data)?),
            // Unreachable: step 6 drops any set whose elementType is not one
            // of these three before it is ever added to `descriptor_sets`.
            _ => return None,
        };
        sets.push(SetArrays {
            level_start,
            kp_index,
            data,
        });
    }

    let patches = match &spec.patches {
        None => None,
        Some(p) => Some(PatchArrays {
            score: field_f32(bin, accessors, p.score)?,
            left: field_u16(bin, accessors, p.left)?,
            top: field_u16(bin, accessors, p.top)?,
            level: field_u8(bin, accessors, p.level)?,
            pixels: field_u8(bin, accessors, p.pixels)?,
        }),
    };

    let reference_image = match &spec.reference_image {
        None => None,
        Some(r) => Some(ReferenceImageArrays {
            pixels: field_u8(bin, accessors, r.pixels)?,
        }),
    };

    Some(TargetArrays {
        keypoints,
        sets,
        patches,
        reference_image,
    })
}

/// Whether `level_start` is closed and non-decreasing against `total` (§5.5,
/// §5.6): `level_start[0] == 0`, non-decreasing, and its last entry equals
/// `total`. An empty slice is never closed — a real `levelStart` always has
/// at least one entry (`L >= 1`, so `L + 1 >= 2`).
fn level_start_closed(level_start: &[u32], total: u32) -> bool {
    match level_start.split_first() {
        Some((&first, rest)) if first == 0 => {
            let mut prev = first;
            for &next in rest {
                if next < prev {
                    return false;
                }
                prev = next;
            }
            prev == total
        }
        _ => false,
    }
}

/// Whether every keypoint's `level` agrees with `levelStart` (§5.5): for
/// every `l` in `[0, level_count)`, every index in
/// `[levelStart[l], levelStart[l+1])` has `level[i] == l`.
///
/// Comparing through `usize` rather than casting `l` down to `u8` means a
/// `level_count` a caller's `Limits` raised past 256 is handled correctly
/// too: no stored `level` value can ever equal such an `l`, so a non-empty
/// range at that `l` correctly fails rather than wrapping into a false match.
fn levels_agree(level_start: &[u32], level: &[u8], level_count: usize) -> bool {
    for l in 0..level_count {
        let (Some(&start), Some(&end)) = (level_start.get(l), level_start.get(l + 1)) else {
            return false;
        };
        let Some(range) = level.get((start as usize)..(end as usize)) else {
            return false;
        };
        if range.iter().any(|&lv| usize::from(lv) != l) {
            return false;
        }
    }
    true
}

/// Whether `sizes` is non-increasing level to level (§5.4). Destructured by
/// pattern rather than indexed: `clippy::indexing_slicing` is denied
/// crate-wide, and a `windows(2)` slice is exactly two elements wide, so a
/// slice pattern reads them without ever calling `Index`.
fn level_sizes_non_increasing(sizes: &[[u32; 2]]) -> bool {
    sizes.windows(2).all(|pair| match pair {
        [[prev_w, prev_h], [next_w, next_h]] => next_w <= prev_w && next_h <= prev_h,
        _ => true,
    })
}

/// Whether one descriptor set is consistent (§5.6): its `levelStart` closed
/// against `M`; unless `multiview`, `M == N` and `kpIndex` is the identity;
/// and, per level, every row's `kpIndex` both `< N` and pointing at a
/// keypoint whose `level` is that level.
fn check_descriptor_set(
    manifest_set: &ManifestDescriptorSet,
    set_arrays: &SetArrays,
    n: u32,
    level_count: usize,
    multiview: bool,
    keypoint_level: &[u8],
) -> bool {
    let m = manifest_set.count;
    if !level_start_closed(&set_arrays.level_start, m) {
        return false;
    }

    if !multiview {
        if m != n {
            return false;
        }
        // The identity permutation: kpIndex[i] == i for every i (§5.6, as
        // amended in 0.2 rev 4). A within-level permutation has no repeated
        // value and would otherwise decode while meaning that row `i` does
        // not describe keypoint `i`.
        for (i, &kp) in set_arrays.kp_index.iter().enumerate() {
            let Ok(i_u32) = u32::try_from(i) else {
                return false;
            };
            if kp != i_u32 {
                return false;
            }
        }
    }

    for l in 0..level_count {
        let (Some(&start), Some(&end)) = (
            set_arrays.level_start.get(l),
            set_arrays.level_start.get(l + 1),
        ) else {
            return false;
        };
        let Some(rows) = set_arrays.kp_index.get((start as usize)..(end as usize)) else {
            return false;
        };
        for &row in rows {
            if row >= n {
                return false;
            }
            let Some(&kp_level) = keypoint_level.get(row as usize) else {
                return false;
            };
            if usize::from(kp_level) != l {
                return false;
            }
        }
    }

    true
}

/// Whether every patch is in bounds (§5.7). `level[q] < L` is checked
/// **before** `levelSizes[level[q]]` is indexed — `level_sizes.get` returning
/// `None` *is* that check, not a check that happens to also catch it.
fn check_patches(
    patches: &ManifestPatches,
    arrays: &PatchArrays,
    level_sizes: &[[u32; 2]],
) -> bool {
    let p = patches.patch_size;
    for q in 0..arrays.level.len() {
        let (Some(&level), Some(&left), Some(&top)) =
            (arrays.level.get(q), arrays.left.get(q), arrays.top.get(q))
        else {
            return false;
        };
        // `level[q] < L`, checked by the fallibility of this lookup rather
        // than by a separate comparison — the ordering §5.7 requires falls
        // out of using `Option` instead of indexing.
        let Some(&[w, h]) = level_sizes.get(level as usize) else {
            return false;
        };
        let Some(right) = u32::from(left).checked_add(p) else {
            return false;
        };
        if right > w {
            return false;
        }
        let Some(bottom) = u32::from(top).checked_add(p) else {
            return false;
        };
        if bottom > h {
            return false;
        }
    }
    true
}

/// Whether `referenceImage` is consistent (§5.8). `level < L` is checked
/// before `width`/`height` are compared with `levelSizes[level]`, the same
/// way as [`check_patches`]: the fallible lookup performs the ordering.
fn check_reference_image(
    reference_image: &ManifestReferenceImage,
    level_sizes: &[[u32; 2]],
) -> bool {
    let Ok(level_idx) = usize::try_from(reference_image.level) else {
        return false;
    };
    let Some(&[w, h]) = level_sizes.get(level_idx) else {
        return false;
    };
    reference_image.width == w && reference_image.height == h
}

/// Check every rule of §6.1 step 7 (and the §5 sections it cites) against
/// `spec` and its materialised `arrays`. Every failure is `INCONSISTENT_DATA`
/// (§6.2); `None` means the file is consistent.
pub(crate) fn check_consistency(spec: &ManifestSpec, arrays: &TargetArrays) -> Option<DecodeError> {
    let level_count = spec.pyramid.level_sizes.len();
    let n = spec.keypoints.count;

    // Rule 1 (§5.5): keypoints.levelStart is closed.
    if !level_start_closed(&arrays.keypoints.level_start, n) {
        return Some(fail(
            ErrorCode::InconsistentData,
            "keypoints.levelStart is not closed and non-decreasing",
        ));
    }

    // Rule 2 (§5.5): level agrees with levelStart.
    if !levels_agree(
        &arrays.keypoints.level_start,
        &arrays.keypoints.level,
        level_count,
    ) {
        return Some(fail(
            ErrorCode::InconsistentData,
            "keypoints.level does not agree with keypoints.levelStart",
        ));
    }

    // Rule 3 (§5.3): meta equals levelSizes[0].
    let meta_matches = matches!(
        spec.pyramid.level_sizes.first(),
        Some(&[w, h]) if spec.meta.width_px == w && spec.meta.height_px == h
    );
    if !meta_matches {
        return Some(fail(
            ErrorCode::InconsistentData,
            "meta.widthPx/heightPx does not equal pyramid.levelSizes[0]",
        ));
    }

    // Rule 4 (§5.4): levelSizes is non-increasing.
    if !level_sizes_non_increasing(&spec.pyramid.level_sizes) {
        return Some(fail(
            ErrorCode::InconsistentData,
            "pyramid.levelSizes is not non-increasing",
        ));
    }

    // Rule 5 (§5.6): per descriptor set, including the multi-view condition
    // written out as the specification states it rather than hard-coded to
    // `false`, so it goes live unchanged the day the extension lands.
    let multiview = spec
        .head
        .extensions_required
        .iter()
        .any(|name| name == "WKNF_multiview");
    for (i, (manifest_set, set_arrays)) in spec.descriptor_sets.iter().zip(&arrays.sets).enumerate()
    {
        if !check_descriptor_set(
            manifest_set,
            set_arrays,
            n,
            level_count,
            multiview,
            &arrays.keypoints.level,
        ) {
            return Some(fail(
                ErrorCode::InconsistentData,
                format!("descriptorSets[{i}] is inconsistent with the keypoints"),
            ));
        }
    }

    // Rule 6 (§5.7): every patch in bounds.
    if let (Some(patches), Some(patch_arrays)) = (&spec.patches, &arrays.patches) {
        if !check_patches(patches, patch_arrays, &spec.pyramid.level_sizes) {
            return Some(fail(
                ErrorCode::InconsistentData,
                "a patch is out of bounds",
            ));
        }
    }

    // Rule 7 (§5.8): referenceImage in bounds and matching levelSizes.
    if let Some(reference_image) = &spec.reference_image {
        if !check_reference_image(reference_image, &spec.pyramid.level_sizes) {
            return Some(fail(
                ErrorCode::InconsistentData,
                "referenceImage is inconsistent with the pyramid",
            ));
        }
    }

    None
}
