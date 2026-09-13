/*
 *  arrays.rs
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

//! An accessor to an owned array, always by copy (§3).
//!
//! The TypeScript codec has a decision to make here — a view into the file's
//! own buffer when the absolute offset divides by the element size, a copy
//! when it does not. Rust has none: copying is the only safe option without
//! `unsafe`, and it is also the correct one, because §3 forbids reading
//! misaligned data through a view and a `.wnft` embedded with `include_bytes!`
//! is guaranteed only 1-byte alignment. `from_le_bytes` on a fixed-size array
//! is the whole mechanism, so an offset that is odd, or a `BIN` chunk that
//! begins anywhere at all, reads the same values as an aligned one.
//!
//! `Accessor` and `AccessorType` are declared here rather than in
//! `manifest.rs` so this task is self-contained; `manifest.rs` re-exports both
//! once it exists.

use alloc::vec::Vec;

/// One entry of the manifest's `accessors` array (§5.2): where an array lives
/// in the `BIN` chunk, and how to read it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Accessor {
    /// Byte offset from the start of the `BIN` chunk data. MUST be a multiple
    /// of the element size (§5.2).
    pub offset: u32,
    /// Number of **elements**, not bytes (§5.2).
    pub count: u32,
    /// The element type.
    pub ty: AccessorType,
}

/// An accessor's element type (§5.2): `"u8"`, `"u16"`, `"u32"` or `"f32"`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessorType {
    /// `"u8"`.
    U8,
    /// `"u16"`.
    U16,
    /// `"u32"`.
    U32,
    /// `"f32"`.
    F32,
}

/// An accessor materialised into an owned array, one variant per
/// [`AccessorType`].
///
/// `pub`, not `pub(crate)`: `arrays` is a private module, so this is reached
/// from outside the crate only through `testing`'s re-export, and a `pub use`
/// of a `pub(crate)` item there is `E0365` (private type in a public
/// interface). Nothing about that changes this type's actual reach — the
/// crate's only public surface is still `decode`/`encode` plus the vocabulary
/// in §6.2; `testing` is `#[doc(hidden)]` and explicitly exempt from semver.
#[derive(Clone, Debug, PartialEq)]
pub enum AccessorArray {
    /// `u8` elements.
    U8(Vec<u8>),
    /// `u16` elements.
    U16(Vec<u16>),
    /// `u32` elements.
    U32(Vec<u32>),
    /// `f32` elements.
    F32(Vec<f32>),
}

/// The width in bytes of one element of `ty` (§5.2).
#[must_use]
pub(crate) const fn element_size(ty: AccessorType) -> usize {
    match ty {
        AccessorType::U8 => 1,
        AccessorType::U16 => 2,
        AccessorType::U32 => 4,
        AccessorType::F32 => 4,
    }
}

/// Copy `accessor`'s array out of `bin`, the `BIN` chunk's data.
///
/// `None` when the accessor does not fit `bin` — the manifest layer has
/// already ruled this out by the time a real decode reaches here (§5.2,
/// §6.1), so `None` here is the belt to that braces, not the primary
/// enforcement. A zero-`count` accessor is always `Some` of an empty array:
/// §5.2 (rev 2) distinguishes a manifest whose accessors all have `count = 0`
/// from one with no accessors at all, and this function must not collapse
/// that distinction into a failure.
///
/// `pub`, not `pub(crate)`, for the same reason as [`AccessorArray`]: it is
/// reached from outside the crate only through `testing`'s re-export.
pub fn materialise(bin: &[u8], accessor: &Accessor) -> Option<AccessorArray> {
    let size = element_size(accessor.ty);
    // §6.1's checked arithmetic: the product is computed before it is used to
    // slice, so a count near u32::MAX is a None rather than a wrap.
    let bytes = (accessor.count as usize).checked_mul(size)?;
    let start = accessor.offset as usize;
    let end = start.checked_add(bytes)?;
    let slice = bin.get(start..end)?;
    Some(match accessor.ty {
        AccessorType::U8 => AccessorArray::U8(slice.to_vec()),
        AccessorType::U16 => AccessorArray::U16(
            slice
                .chunks_exact(2)
                .filter_map(|c| <[u8; 2]>::try_from(c).ok().map(u16::from_le_bytes))
                .collect(),
        ),
        AccessorType::U32 => AccessorArray::U32(
            slice
                .chunks_exact(4)
                .filter_map(|c| <[u8; 4]>::try_from(c).ok().map(u32::from_le_bytes))
                .collect(),
        ),
        AccessorType::F32 => AccessorArray::F32(
            slice
                .chunks_exact(4)
                .filter_map(|c| <[u8; 4]>::try_from(c).ok().map(f32::from_le_bytes))
                .collect(),
        ),
    })
}
