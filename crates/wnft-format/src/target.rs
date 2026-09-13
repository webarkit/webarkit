/*
 *  target.rs
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

//! The decoded target (§5): the in-memory shape a decode produces and an
//! encode consumes.
//!
//! Every array here is **structure-of-arrays**, not an array of objects — a
//! `Keypoints` is four-plus parallel `Vec`s indexed by the same `i`, not a
//! `Vec<Keypoint>`. That is what the file itself stores (§5.2's accessors are
//! per-field, not per-record), and it keeps a decode a number of allocations
//! proportional to the number of *arrays*, not to `N`: one `Vec` per field,
//! filled once, rather than `N` small structs each carrying its own layout.
//!
//! Coordinates (`keypoints.x`/`y`/`angle`/`score`/`size`, `patches.score`) are
//! `f32`, not `f64` (§5.5). That halves the arrays, and `f32`'s precision at
//! 4096 px — about 0.0005 px — is far below what any detector achieves.
//! Consumers widen to `f64` themselves at the point they need it (e.g. when
//! building the contract's `PointArray`); the file does not pay for a
//! precision nothing on either side of it needs.
//!
//! `patches.left` and `patches.top` are **level** coordinates, not level-0
//! (§3, §5.7) — the only positions in a target that are not. They are the
//! top-left pixel of the patch on the image at `patches.level[q]`, because the
//! stored pixels are read from exactly that level at those indices; storing
//! them in level-0 coordinates would reintroduce a rounding step and make the
//! stored pixels ambiguous about what they actually sample.

use alloc::string::String;
use alloc::vec::Vec;

/// Free-form content (§5.5, §5.6, §5.9). `serde_json::Map` is a `BTreeMap`
/// unless the `preserve_order` feature is on, which it deliberately is not:
/// §7.3 requires keys sorted by Unicode code point, and for valid UTF-8 that is
/// exactly Rust's byte order on `String`. The canonical sort is therefore a
/// property of the container, not a step the writer has to remember.
pub type Params = serde_json::Map<String, serde_json::Value>;

/// A decoded target (§5.1): everything a `.wnft` file's manifest and `BIN`
/// chunk describe, materialised into owned arrays.
#[derive(Clone, Debug, PartialEq)]
pub struct Target {
    /// `format.version`, `"MAJOR.MINOR"` (§5.1, §7.1).
    pub format_version: String,
    /// `format.generator`: free text naming what produced the file. Optional.
    pub generator: Option<String>,
    /// `extensionsUsed` (§5.1): names of extensions present in the file.
    pub extensions_used: Vec<String>,
    /// `extensionsRequired` (§5.1): the subset of `extensionsUsed` a reader
    /// MUST understand to read the file correctly.
    pub extensions_required: Vec<String>,
    /// `meta` (§5.3).
    pub meta: Meta,
    /// `pyramid` (§5.4).
    pub pyramid: Pyramid,
    /// `keypoints` (§5.5).
    pub keypoints: Keypoints,
    /// `descriptorSets` (§5.6).
    pub descriptor_sets: Vec<DescriptorSet>,
    /// `patches` (§5.7). Absent when the file carries no patches; the tracker
    /// then runs in detection-only mode.
    pub patches: Option<Patches>,
    /// `referenceImage` (§5.8).
    pub reference_image: Option<ReferenceImage>,
    /// `info` (§5.9): free-form, preserved and round-tripped unchanged.
    pub info: Option<Params>,
}

/// `meta` (§5.3): the reference image's own dimensions and physical size.
#[derive(Clone, Debug, PartialEq)]
pub struct Meta {
    /// `widthPx`. MUST equal `pyramid.level_sizes[0][0]`.
    pub width_px: u32,
    /// `heightPx`. MUST equal `pyramid.level_sizes[0][1]`.
    pub height_px: u32,
    /// `physicalSizeMm`: `[width, height]` in millimetres, or `None` if
    /// unknown, in which case model-plane units are level-0 pixels (§3).
    pub physical_size_mm: Option<[f64; 2]>,
}

/// `pyramid` (§5.4): the scale pyramid the detector ran over.
#[derive(Clone, Debug, PartialEq)]
pub struct Pyramid {
    /// `scaleStep`: the size ratio between consecutive levels, `> 1`.
    pub scale_step: f64,
    /// `levelSizes`, one `[width, height]` per level, authoritative — sizes
    /// are recorded as produced, not recomputed, because implementations
    /// round differently. Non-increasing; its length is `L`.
    pub level_sizes: Vec<[u32; 2]>,
}

/// The detector that produced `keypoints` (§5.5, the `detector` sub-object of
/// `Keypoints`).
///
/// Only [`Keypoints`] embeds one. A [`DescriptorSet`] carries its own `kind`
/// and `params` fields directly rather than nesting a `Detector` (§5.6), and
/// the two `kind`s are different vocabularies: `Detector.kind` is a
/// `DetectorKind` (e.g. `"fast"`), while `DescriptorSet.kind` is a
/// `DescriptorKind` (e.g. `"orb"`, `"teblid"`).
#[derive(Clone, Debug, PartialEq)]
pub struct Detector {
    /// `kind`: any string, including one this reader does not know — it is
    /// informative, not constrained.
    pub kind: String,
    /// `params`: free-form, family-specific. An absent `params` in the file is
    /// equivalent to `{}` (§7.3).
    pub params: Params,
}

/// `keypoints` (§5.5): every keypoint found across the pyramid, in
/// structure-of-arrays form, sorted by level ascending.
#[derive(Clone, Debug, PartialEq)]
pub struct Keypoints {
    /// `N`, the number of keypoints.
    pub count: u32,
    /// `detector`.
    pub detector: Detector,
    /// `levelStart`, `L + 1` entries: keypoints of level `l` are the indices
    /// `[level_start[l], level_start[l + 1])`. `level_start[0] = 0`,
    /// `level_start[L] = N`, non-decreasing.
    pub level_start: Vec<u32>,
    /// `x`: level-0 pixel coordinate (§3), `N` entries.
    pub x: Vec<f32>,
    /// `y`: level-0 pixel coordinate (§3), `N` entries.
    pub y: Vec<f32>,
    /// `angle`, radians, exactly as the detector produced it. No assumed
    /// range: angles are periodic (§3).
    pub angle: Vec<f32>,
    /// `score`: the detector's response, `N` entries.
    pub score: Vec<f32>,
    /// `size`: diameter, in level-0 pixels, of the region the descriptor
    /// sampled. `None` means unknown (the field was absent).
    pub size: Option<Vec<f32>>,
    /// `level`: pyramid level, `N` entries. MUST agree with `level_start`.
    pub level: Vec<u8>,
}

/// The element array of a descriptor set (§5.6), discriminated by
/// `elementType` exactly as the manifest field is.
///
/// A fourth "unknown" variant would be unreachable: §5.6 drops a set whose
/// `elementType` the reader does not know, so such a set never reaches this
/// type. An unknown `kind` or `norm`, by contrast, leaves the set structurally
/// understood, which is why those two are plain `String`s on [`DescriptorSet`]
/// rather than an enum here.
#[derive(Clone, Debug, PartialEq)]
pub enum DescriptorData {
    /// `"bits"`: packed binary, `dimensions` bits per descriptor.
    Bits(Vec<u8>),
    /// `"u8"`: one byte per element.
    U8(Vec<u8>),
    /// `"f32"`: one 32-bit float per element.
    F32(Vec<f32>),
}

impl DescriptorData {
    /// The manifest spelling of this variant's `elementType` (§5.6).
    #[must_use]
    pub const fn element_type(&self) -> &'static str {
        match self {
            Self::Bits(_) => "bits",
            Self::U8(_) => "u8",
            Self::F32(_) => "f32",
        }
    }

    /// The number of elements stored — bytes for `Bits`/`U8`, `f32`s for
    /// `F32`. Not the same unit across variants; see §5.6 for how `count`
    /// relates to it for each `elementType`.
    #[must_use]
    pub fn len(&self) -> usize {
        match self {
            Self::Bits(v) | Self::U8(v) => v.len(),
            Self::F32(v) => v.len(),
        }
    }

    /// Whether the array has no elements.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        match self {
            Self::Bits(v) | Self::U8(v) => v.is_empty(),
            Self::F32(v) => v.is_empty(),
        }
    }
}

/// One entry of `descriptorSets` (§5.6): `M` descriptor rows, grouped by
/// level in the same order as the keypoints.
#[derive(Clone, Debug, PartialEq)]
pub struct DescriptorSet {
    /// `kind`, e.g. `"orb"`, `"freak"`, `"teblid"`.
    pub kind: String,
    /// `norm`: distance, e.g. `"hamming"`, `"hamming2"`, `"l2"`.
    pub norm: String,
    /// `dimensions`: bits for `"bits"`, elements otherwise. `0` is legal — it
    /// describes a set whose descriptors carry nothing, and
    /// `bytes_per_descriptor` MUST then be `0` too (§5.6). Unlike
    /// `Patches.patch_size`, no minimum is imposed here.
    pub dimensions: u32,
    /// `bytesPerDescriptor`.
    pub bytes_per_descriptor: u32,
    /// `producer`: `capabilities.name` of the backend that computed the set.
    pub producer: String,
    /// `params`: free-form, family-specific. An absent `params` in the file is
    /// equivalent to `{}` (§7.3).
    pub params: Params,
    /// `M`, the number of rows.
    pub count: u32,
    /// `levelStart`, `L + 1` entries: row ranges per level, closed and
    /// agreeing with the keypoints (§5.6).
    pub level_start: Vec<u32>,
    /// `kpIndex`, `M` entries: the keypoint each row describes. The identity
    /// permutation unless `WKNF_multiview` is required (§5.6).
    pub kp_index: Vec<u32>,
    /// The descriptor bytes/elements themselves.
    pub data: DescriptorData,
}

/// `patches` (§5.7): fixed-size image patches sampled around keypoints.
#[derive(Clone, Debug, PartialEq)]
pub struct Patches {
    /// `patchSize`, `P`. Never `0` (§5.7).
    pub patch_size: u32,
    /// `Q`, the number of patches.
    pub count: u32,
    /// `score`: Shi–Tomasi minimum eigenvalue, `Q` entries.
    pub score: Vec<f32>,
    /// `left`: top-left pixel column, in the patch's **own level's**
    /// coordinates (§3), not level-0. `Q` entries.
    pub left: Vec<u16>,
    /// `top`: top-left pixel row, in the patch's **own level's** coordinates
    /// (§3), not level-0. `Q` entries.
    pub top: Vec<u16>,
    /// `level`: pyramid level the patch was sampled from, `Q` entries.
    pub level: Vec<u8>,
    /// `pixels`: row-major, `P × P` per patch, `Q × P × P` bytes total,
    /// stored without extra smoothing.
    pub pixels: Vec<u8>,
}

/// `referenceImage` (§5.8): an optional full-resolution (or chosen-level)
/// grayscale copy of the target image.
#[derive(Clone, Debug, PartialEq)]
pub struct ReferenceImage {
    /// `level`: the pyramid level the image was taken from, `< L`.
    pub level: u32,
    /// `width`, MUST equal `pyramid.level_sizes[level][0]`.
    pub width: u32,
    /// `height`, MUST equal `pyramid.level_sizes[level][1]`.
    pub height: u32,
    /// Row-major grayscale pixels, `width × height` bytes.
    pub pixels: Vec<u8>,
}
