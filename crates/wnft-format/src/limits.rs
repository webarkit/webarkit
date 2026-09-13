/*
 *  limits.rs
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

//! Resource limits (§6.4).
//!
//! A `.wnft` may come from a URL an application's user chose, so the reader is
//! exposed to untrusted input and must refuse to allocate in proportion to a
//! number it has not yet accepted. §6.4 requires these limits to be enforced
//! *and* to be configurable: a build serving files it produced itself can raise
//! them; an application loading a URL a user typed should not.

/// The limits a decode enforces.
///
/// Deliberately **not** `#[non_exhaustive]`, unlike the error enums: §6.4
/// requires these to be configurable, and the natural way to configure one is
/// `Limits { max_keypoints: 4, ..DEFAULT_LIMITS }` — which `#[non_exhaustive]`
/// forbids outside this crate. A field added later is a breaking change here,
/// and that is the right trade for a struct whose whole purpose is to be built
/// by the caller.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    /// The whole file, in bytes. Checked at §6.1 step 0, before a single byte is
    /// read — which is why a file past this limit reports `LIMIT_EXCEEDED` and
    /// not `BAD_MAGIC`, even when it is not a `.wnft` at all.
    pub max_file_bytes: usize,
    /// The `JSON` chunk, in bytes. Checked before the manifest is decoded.
    pub max_manifest_bytes: usize,
    /// Pyramid levels, `L`.
    pub max_levels: usize,
    /// Keypoints per file, `N`.
    pub max_keypoints: u32,
    /// Descriptor sets per file.
    pub max_descriptor_sets: usize,
    /// The patch edge, `P`.
    pub max_patch_size: u32,
    /// The number of patches, `Q`. Bounded transitively anyway — `Q × P × P`
    /// pixel bytes have to exist in the `BIN` chunk — but §6.4 exists so that a
    /// reader checks a count rather than reasoning about what some other check
    /// implies.
    pub max_patches: u32,
}

/// The defaults §6.4 suggests.
pub const DEFAULT_LIMITS: Limits = Limits {
    max_file_bytes: 64 * 1024 * 1024,
    max_manifest_bytes: 1024 * 1024,
    max_levels: 32,
    max_keypoints: 1_000_000,
    max_descriptor_sets: 16,
    max_patch_size: 64,
    max_patches: 65_536,
};

impl Default for Limits {
    fn default() -> Self {
        DEFAULT_LIMITS
    }
}
