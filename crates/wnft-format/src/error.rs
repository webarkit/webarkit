/*
 *  error.rs
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

//! The result vocabulary: the codes of §6.2, plus the writer's own
//! `INVALID_TARGET` (§7.3).
//!
//! §6.2 requires a reader to "return a result, never an exception", and
//! warnings to be "part of the returned result, not only logged", so an
//! application can act on one. Both are values here for that reason.
//!
//! `NO_USABLE_DESCRIPTORS` and `PRODUCER_MISMATCH` are deliberately absent.
//! §6.2 defines both as outcomes of choosing a descriptor set against a runtime
//! backend's capabilities (§6.3), and nothing in this crate knows what a backend
//! can consume — §8.1 makes the same point when it exempts
//! `NO_USABLE_DESCRIPTORS` from "one fixture per error code". Listing them here
//! would promise a decode path that cannot produce them.

use alloc::string::String;
use alloc::vec::Vec;

use crate::target::Target;

/// Every failure this codec can report (§6.2, §7.3).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ErrorCode {
    /// `magic` is not `"WKNF"`.
    BadMagic,
    /// `container_major` is one this build does not frame.
    UnsupportedContainer,
    /// Framing broken: length mismatch, chunk out of bounds, `JSON` missing or
    /// duplicated, `BIN\0` duplicated or out of place, non-zero reserved field.
    BadContainer,
    /// A chunk's CRC-32 does not match.
    ChecksumMismatch,
    /// The `JSON` chunk is above the manifest limit.
    ManifestTooLarge,
    /// Not strict UTF-8, not JSON, not I-JSON, not an object, a required key
    /// missing, a wrong type, or a value outside the domain its section fixes.
    BadManifest,
    /// `format.version` is not the one this build supports (§7.1).
    UnsupportedFormatVersion,
    /// A name in `extensionsRequired` this build does not implement.
    UnsupportedExtension,
    /// An accessor out of bounds, misaligned, overlapping, or with the wrong
    /// type or count.
    BadLayout,
    /// A count or size above the resource limits (§6.4).
    LimitExceeded,
    /// A rule of §6.1 step 7 violated, or a duplicate descriptor-set key.
    InconsistentData,
    /// The writer's own: a target a conforming reader would reject (§7.3).
    InvalidTarget,
}

impl ErrorCode {
    /// The code's spelling in §6.2, identical across implementations.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::BadMagic => "BAD_MAGIC",
            Self::UnsupportedContainer => "UNSUPPORTED_CONTAINER",
            Self::BadContainer => "BAD_CONTAINER",
            Self::ChecksumMismatch => "CHECKSUM_MISMATCH",
            Self::ManifestTooLarge => "MANIFEST_TOO_LARGE",
            Self::BadManifest => "BAD_MANIFEST",
            Self::UnsupportedFormatVersion => "UNSUPPORTED_FORMAT_VERSION",
            Self::UnsupportedExtension => "UNSUPPORTED_EXTENSION",
            Self::BadLayout => "BAD_LAYOUT",
            Self::LimitExceeded => "LIMIT_EXCEEDED",
            Self::InconsistentData => "INCONSISTENT_DATA",
            Self::InvalidTarget => "INVALID_TARGET",
        }
    }
}

impl core::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Warnings a successful decode can carry (§6.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum WarningCode {
    /// A chunk of a type this build does not know, skipped whole.
    UnknownChunkSkipped,
    /// A name in `extensionsUsed` but not `extensionsRequired` that this build
    /// does not implement. Its payloads are ignored and the name is pruned from
    /// the decoded `extensions_used` (§7.3).
    UnknownExtensionIgnored,
    /// A set with an unknown `kind`, `norm` or `elementType` (§5.6).
    UnsupportedDescriptorSet,
}

impl WarningCode {
    /// The code's spelling in §6.2, identical across implementations.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnknownChunkSkipped => "UNKNOWN_CHUNK_SKIPPED",
            Self::UnknownExtensionIgnored => "UNKNOWN_EXTENSION_IGNORED",
            Self::UnsupportedDescriptorSet => "UNSUPPORTED_DESCRIPTOR_SET",
        }
    }
}

impl core::fmt::Display for WarningCode {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// One warning. `detail` names what triggered it — a chunk type, an extension
/// name, a descriptor-set index — because acting on a warning needs to know
/// which thing it was about (§6.2).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Warning {
    /// The code.
    pub code: WarningCode,
    /// What triggered it.
    pub detail: String,
}

/// A decode failure. `detail` is free text for a human or a log; only `code` is
/// part of the cross-implementation contract.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodeError {
    /// The code (§6.2).
    pub code: ErrorCode,
    /// Free text naming what failed.
    pub detail: String,
}

/// An encode failure (§7.3). `code` is always [`ErrorCode::InvalidTarget`], and
/// `detail` names the offending field path, e.g.
/// `"descriptorSets[1].params.seed"`, so the caller can find the value without
/// re-validating the target itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncodeError {
    /// Always [`ErrorCode::InvalidTarget`].
    pub code: ErrorCode,
    /// The offending field path.
    pub detail: String,
}

/// A successful decode: the target, and every warning the file raised.
#[derive(Clone, Debug, PartialEq)]
pub struct Decoded {
    /// The decoded target.
    pub target: Target,
    /// Warnings, in the order the reader raised them (§6.2).
    pub warnings: Vec<Warning>,
}

impl core::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

impl core::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

#[cfg(feature = "std")]
impl std::error::Error for DecodeError {}

#[cfg(feature = "std")]
impl std::error::Error for EncodeError {}

/// Build a [`DecodeError`]. Shorthand used throughout the codec.
pub(crate) fn fail(code: ErrorCode, detail: impl Into<String>) -> DecodeError {
    DecodeError {
        code,
        detail: detail.into(),
    }
}
