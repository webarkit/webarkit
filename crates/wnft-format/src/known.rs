/*
 *  known.rs
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

//! What this build recognises.
//!
//! §5.6 needs at run time what the format's prose gives as a list: whether a
//! set's family, metric or element type is one this reader knows decides
//! whether the set is usable, preserved, or dropped.

/// The only `format.version` this build reads or writes (§7.1).
// Not read until the manifest layer (Task 4) checks it; the allow is removed
// there the same way Task 3 removed it from `error::fail`.
#[allow(dead_code)]
pub(crate) const SUPPORTED_FORMAT_VERSION: &str = "0.2";

/// The only `container_major` this build frames (§7.1). Any `container_minor` is
/// accepted: a newer minor only adds chunks a reader can skip.
pub(crate) const SUPPORTED_CONTAINER_MAJOR: u16 = 1;

/// `"WKNF"` (§4.1).
pub(crate) const MAGIC: [u8; 4] = *b"WKNF";

/// The `JSON` chunk type (§4.2).
pub(crate) const JSON_TYPE: [u8; 4] = *b"JSON";

/// The `BIN\0` chunk type (§4.2).
pub(crate) const BIN_TYPE: [u8; 4] = [b'B', b'I', b'N', 0];

/// Descriptor families this build recognises. A set whose `kind` is not here
/// stays **present but unusable**, with `UNSUPPORTED_DESCRIPTOR_SET` (§5.6): its
/// element width is still known, so it round-trips unchanged.
///
/// **Source of truth: the `DescriptorKind` union in
/// `packages/cv-backend-spec/src/cv_backend.ts`.** This list is a transcription
/// of it and must be resynced whenever that union changes — the TypeScript codec
/// pins the correspondence with a type-level exhaustiveness check, and Rust has
/// no view of the union at all, so here it is maintained by hand.
///
/// Getting it wrong is a divergence the shared corpus **cannot catch**: a kind
/// present in one list and missing from the other makes one codec warn and drop
/// a set the other accepts, on a file no fixture contains. Check the union, do
/// not recall it.
// Not read until Task 6 (§5.6 descriptor-set validation).
#[allow(dead_code)]
pub(crate) const KNOWN_DESCRIPTOR_KINDS: &[&str] = &["orb", "freak", "beblid", "teblid", "akaze"];

/// Distance metrics this build recognises. Same source of truth: the
/// `DescriptorNorm` union in `packages/cv-backend-spec/src/cv_backend.ts`, and
/// the same resync obligation.
///
/// §5.6's prose lists `"hamming2"` among the possibilities and it is
/// deliberately **not** here: the contract's `DescriptorNorm` does not define
/// it, so a set using it is one this reader does not know — warned about and
/// preserved. That is the rule working, not a gap in this list.
// Not read until Task 6 (§5.6 descriptor-set validation).
#[allow(dead_code)]
pub(crate) const KNOWN_DESCRIPTOR_NORMS: &[&str] = &["hamming", "l2"];

/// Element types the format defines (§5.6). Unlike `kind` and `norm`, an
/// unknown one makes a set uninterpretable, so such a set is dropped.
// Not read until Task 6 (§5.6 descriptor-set validation).
#[allow(dead_code)]
pub(crate) const KNOWN_ELEMENT_TYPES: &[&str] = &["bits", "u8", "f32"];

/// Extensions this build implements — none, because format 0.2 defines none to
/// implement.
///
/// `WKNF_multiview` is the only extension §5.6 names, and in 0.2 it defines **no
/// payload**: it is purely a permission, relaxing the `M = N` and identity-
/// `kpIndex` rules for a file that lists it in `extensionsRequired`. There is
/// nothing here for a codec to implement, and nothing this list could truthfully
/// claim. (What is blocked on k-nearest matching in the contract, Q3, is a
/// *tracker's* ability to run a correct ratio test over multi-view rows — not
/// this crate, which performs no matching at all.)
///
/// The consequences are exactly the specified ones: the name in
/// `extensionsRequired` gives `UNSUPPORTED_EXTENSION`, in `extensionsUsed` alone
/// it is pruned with `UNKNOWN_EXTENSION_IGNORED`, and `M != N` or a non-identity
/// `kpIndex` is therefore always `INCONSISTENT_DATA`.
// Not read until the manifest layer (Task 4/6) checks extensionsRequired.
#[allow(dead_code)]
pub(crate) const IMPLEMENTED_EXTENSIONS: &[&str] = &[];
