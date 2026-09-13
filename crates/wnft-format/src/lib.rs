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

mod container;
mod crc32;
mod error;
mod ijson;
mod known;
mod limits;

pub use crc32::crc32;
pub use error::{DecodeError, EncodeError, ErrorCode, Warning, WarningCode};
pub use limits::{DEFAULT_LIMITS, Limits};

/// Internals the crate's own test suites reach for. Not part of the public API
/// and not covered by semver: the two public functions are `decode` and
/// `encode`.
#[doc(hidden)]
pub mod testing {
    pub use crate::container::{Chunk, ParsedContainer, build_container, parse_container};
    pub use crate::ijson::scan_ijson;
}
