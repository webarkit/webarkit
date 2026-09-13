/*
 *  decode.rs
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

#![no_main]

//! §8.4: `decode` never panics, always terminates, and never allocates beyond
//! the limits — on any input at all.
//!
//! The interesting inputs are not random bytes, which die at the magic. Seed the
//! corpus from `fixtures/nft-target/0.2/` (see the crate README) and let the
//! fuzzer mutate real files: that is what reaches the manifest, the accessors
//! and the consistency gates.

use libfuzzer_sys::fuzz_target;
use wnft_format::{DEFAULT_LIMITS, decode, encode};

fuzz_target!(|data: &[u8]| {
    if let Ok(decoded) = decode(data, &DEFAULT_LIMITS) {
        // §8.4's round trip: whatever decoded is a target this writer can emit,
        // and what it emits decodes back to the same values. A decode that
        // succeeds on a file the writer then refuses would mean the two
        // disagree about what a valid target is.
        let bytes = encode(&decoded.target).expect("a decoded target must re-encode (§7.3)");
        let again = decode(&bytes, &DEFAULT_LIMITS).expect("canonical output must decode");
        assert_eq!(again.target, decoded.target);
        assert!(again.warnings.is_empty(), "canonical output warns about nothing");
    }
});
