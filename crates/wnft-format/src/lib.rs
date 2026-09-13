/*
 *  lib.rs
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

#![no_std]
#![forbid(unsafe_code)]
#![warn(missing_docs)]
// The crate reads untrusted input, so the panicking forms are denied outright
// rather than left to review: §6.1's promise is that a hostile file is a value,
// never an incident. These are inner attributes rather than a `[lints]` table
// because they must bind the library and NOT the test crates, whose whole idiom
// is `expect` and `assert!`.
//
// `clippy::arithmetic_side_effects` is deliberately absent. It fires on loop
// counters and on lengths this crate derived itself, and the only way through it
// is blanket `allow`s — which is worse than not having the lint. What it would
// have guarded is carried instead by the Global Constraint on checked
// arithmetic, by `overflow-checks = true` in the release profile, and by the
// fuzz target of §8.4.
#![deny(
    clippy::indexing_slicing,
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic
)]

//! Reader and canonical writer for the WebARKit `.wnft` NFT target format.
//!
//! The specification is the source of truth: `docs/specs/nft-target-format.md`,
//! format **0.2**. Section references throughout this crate (§4.2, §6.1, …)
//! point into it. Where this code and that document disagree, the document
//! wins and the code is the bug.
//!
//! This crate is the format's **second** implementation. The first is the
//! TypeScript codec in `packages/nft-tracker`. They are peers, and the point of
//! there being two is that a specification with one implementation is only a
//! description of that implementation (§1).
//!
//! # `no_std`
//!
//! The crate needs an allocator and nothing else, so a `.wnft` decodes on a
//! bare-metal target as well as on a desktop. The `std` feature, on by default,
//! adds `std::error::Error` impls and the standard allocator.
//!
//! # Untrusted input
//!
//! A `.wnft` may come from a URL an application's user chose (§6.1). Nothing
//! here panics on any input: every product and sum over a file-supplied number
//! is checked before it allocates or indexes, and every failure is a
//! [`DecodeError`] value rather than an unwind.

extern crate alloc;

#[cfg(feature = "std")]
extern crate std;

mod arrays;
mod canonical_json;
mod consistency;
mod container;
mod crc32;
mod encode;
mod error;
mod ijson;
mod known;
mod limits;
mod manifest;
mod rules;
mod target;
mod validate_target;

use alloc::string::String;
use alloc::vec::Vec;

use consistency::{check_consistency, materialise_all};
use container::parse_container;
use error::fail;
use manifest::{decode_manifest, validate_manifest};

pub use crc32::crc32;
pub use encode::encode;
pub use error::{DecodeError, Decoded, EncodeError, ErrorCode, Warning, WarningCode};
pub use limits::{DEFAULT_LIMITS, Limits};
pub use target::{
    DescriptorData, DescriptorSet, Detector, Keypoints, Meta, Params, Patches, Pyramid,
    ReferenceImage, Target,
};

/// Decode a `.wnft` file.
///
/// The gates of §6.1 run in exactly the order that section fixes, and the
/// order is the point: a `.wnft` may come from a URL an application's user
/// chose, so nothing here allocates in proportion to a size before that size
/// has been checked. Every number is settled by the manifest layer first; the
/// arrays are materialised only afterwards, and data consistency (step 7) is
/// the last gate before assembly.
///
/// Nothing panics. Every failure is a value, which is what lets a caller
/// treat a hostile file as data rather than as an incident.
///
/// # Errors
///
/// Any code of §6.2 the file earns; see [`ErrorCode`].
pub fn decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, DecodeError> {
    // Step 0 (§6.1 rev 2) — file size, before a single byte is read. This is
    // why a very large buffer that is not a `.wnft` at all reports
    // LIMIT_EXCEEDED and not BAD_MAGIC: nothing below this line has looked at
    // `bytes` yet.
    if bytes.len() > limits.max_file_bytes {
        return Err(fail(
            ErrorCode::LimitExceeded,
            alloc::format!(
                "the file is {} bytes, above the {}-byte limit",
                bytes.len(),
                limits.max_file_bytes
            ),
        ));
    }

    // Steps 1 and 2 — framing, and the checksums of the JSON and BIN\0 chunks.
    let parsed = parse_container(bytes)?;

    let json_end = parsed
        .json
        .data_start
        .checked_add(parsed.json.length)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "JSON chunk data range overflows"))?;
    let json_bytes = bytes
        .get(parsed.json.data_start..json_end)
        .ok_or_else(|| fail(ErrorCode::BadContainer, "JSON chunk data out of bounds"))?;

    let bin_bytes: &[u8] = match &parsed.bin {
        Some(chunk) => {
            let end = chunk
                .data_start
                .checked_add(chunk.length)
                .ok_or_else(|| fail(ErrorCode::BadContainer, "BIN chunk data range overflows"))?;
            bytes
                .get(chunk.data_start..end)
                .ok_or_else(|| fail(ErrorCode::BadContainer, "BIN chunk data out of bounds"))?
        }
        None => &[],
    };
    let bin_length = parsed.bin.as_ref().map(|chunk| chunk.length);

    // A chunk of an unknown type is skipped whole, with a warning, in file
    // order — this is the `decode` layer's own responsibility (`container`
    // only reports that such chunks exist).
    let mut warnings: Vec<Warning> = parsed
        .unknown
        .iter()
        .map(|chunk| Warning {
            code: WarningCode::UnknownChunkSkipped,
            detail: String::from_utf8_lossy(&chunk.kind).into_owned(),
        })
        .collect();

    // Steps 3 to 5 — manifest size, text, format version, extensions.
    let (head, manifest_warnings) = decode_manifest(json_bytes, limits)?;
    warnings.extend(manifest_warnings);

    // Step 6 — schema, accessors, resource limits.
    let (spec, schema_warnings) = validate_manifest(head, bin_length, limits)?;
    warnings.extend(schema_warnings);

    // Only now: materialise, because only now is every size checked. `None`
    // is unreachable once step 6 has passed — it is the belt to that step's
    // braces, not the primary enforcement.
    let arrays = materialise_all(bin_bytes, &spec).ok_or_else(|| {
        fail(
            ErrorCode::BadLayout,
            "an accessor does not fit the BIN chunk",
        )
    })?;

    // Step 7 — data consistency.
    if let Some(error) = check_consistency(&spec, &arrays) {
        return Err(error);
    }

    // Assemble. An absent optional is omitted (`None`), never present-but-
    // empty, so a decoded target is indistinguishable from one built by hand
    // (§8.2 item 2): `keypoints.size` and `params` are where this would
    // otherwise bite (an absent `params` decodes to an empty `Map`, which the
    // writer omits again, §7.3).
    let manifest::ManifestSpec {
        head,
        meta,
        pyramid,
        keypoints,
        descriptor_sets,
        patches,
        reference_image,
        info,
        accessors: _,
    } = spec;

    let target = Target {
        // Taken from this build's own constant, not from the file: correct
        // today only because §7.1's exact-minor rule means step 5 already
        // rejected any `format.version` other than `SUPPORTED_FORMAT_VERSION`,
        // so the two are guaranteed equal here. That stops being free once
        // the format reaches `1.0`, when "same major, any minor" (§7) makes a
        // 1.x file's own minor the one that must survive — this line will
        // need to carry the manifest's parsed version through `ManifestHead`
        // at that point rather than substituting the constant.
        format_version: String::from(known::SUPPORTED_FORMAT_VERSION),
        generator: head.generator,
        extensions_used: head.extensions_used,
        extensions_required: head.extensions_required,
        meta: Meta {
            width_px: meta.width_px,
            height_px: meta.height_px,
            physical_size_mm: meta.physical_size_mm,
        },
        pyramid: Pyramid {
            scale_step: pyramid.scale_step,
            level_sizes: pyramid.level_sizes,
        },
        keypoints: Keypoints {
            count: keypoints.count,
            detector: Detector {
                kind: keypoints.detector_kind,
                params: keypoints.detector_params,
            },
            level_start: arrays.keypoints.level_start,
            x: arrays.keypoints.x,
            y: arrays.keypoints.y,
            angle: arrays.keypoints.angle,
            score: arrays.keypoints.score,
            size: arrays.keypoints.size,
            level: arrays.keypoints.level,
        },
        descriptor_sets: descriptor_sets
            .into_iter()
            .zip(arrays.sets)
            .map(|(manifest_set, set_arrays)| DescriptorSet {
                kind: manifest_set.kind,
                norm: manifest_set.norm,
                dimensions: manifest_set.dimensions,
                bytes_per_descriptor: manifest_set.bytes_per_descriptor,
                producer: manifest_set.producer,
                params: manifest_set.params,
                count: manifest_set.count,
                level_start: set_arrays.level_start,
                kp_index: set_arrays.kp_index,
                data: set_arrays.data,
            })
            .collect(),
        // `Option::zip` silently drops data if the two sides ever disagreed
        // on `Some`/`None` — but they cannot: `materialise_all` builds
        // `arrays.patches`/`arrays.reference_image` from `Some`/`None` on
        // this very `spec.patches`/`spec.reference_image` (see
        // `consistency.rs`), so the two are `Some` or `None` together by
        // construction, not by coincidence checked here.
        patches: patches
            .zip(arrays.patches)
            .map(|(manifest_patches, patch_arrays)| Patches {
                patch_size: manifest_patches.patch_size,
                count: manifest_patches.count,
                score: patch_arrays.score,
                left: patch_arrays.left,
                top: patch_arrays.top,
                level: patch_arrays.level,
                pixels: patch_arrays.pixels,
            }),
        reference_image: reference_image.zip(arrays.reference_image).map(
            |(manifest_ref, ref_arrays)| ReferenceImage {
                level: manifest_ref.level,
                width: manifest_ref.width,
                height: manifest_ref.height,
                pixels: ref_arrays.pixels,
            },
        ),
        info,
    };

    Ok(Decoded { target, warnings })
}

/// Internals the crate's own test suites reach for. Not part of the public API
/// and not covered by semver: the two public functions are `decode` and
/// `encode`.
#[doc(hidden)]
pub mod testing {
    pub use crate::arrays::{Accessor, AccessorArray, AccessorType, materialise};
    pub use crate::container::{Chunk, ParsedContainer, build_container, parse_container};
    pub use crate::ijson::{MAX_EXACT_INTEGER, scan_ijson};
    pub use crate::manifest::{
        ManifestDescriptorSet, ManifestHead, ManifestKeypoints, ManifestMeta, ManifestPatches,
        ManifestPyramid, ManifestReferenceImage, ManifestSpec, decode_manifest, validate_manifest,
    };
}
