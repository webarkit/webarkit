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
//!
//! `decode` not panicking is the base claim, and it needs no assertion of its
//! own: reaching the end of this closure at all is that claim holding. What
//! is asserted below is §8.4's round trip on top of it, and §5.6 carves out
//! one legal case that round trip does not cover.

use libfuzzer_sys::fuzz_target;
use wnft_format::{DEFAULT_LIMITS, ErrorCode, decode, encode};

fuzz_target!(|data: &[u8]| {
    let Ok(decoded) = decode(data, &DEFAULT_LIMITS) else {
        return;
    };

    match encode(&decoded.target) {
        Ok(bytes) => {
            // The real round trip (§8.4): what the writer emits for an
            // accepted target must decode back to the same values.
            let again = decode(&bytes, &DEFAULT_LIMITS)
                .expect("canonical output must decode (§8.2 item 4)");
            assert_eq!(again.target, decoded.target);

            // §7.3's opening line: the same content always produces the same
            // bytes. Encoding twice must not be able to disagree with itself.
            let bytes_again =
                encode(&decoded.target).expect("encode must succeed again on the same target");
            assert_eq!(bytes, bytes_again, "encode is not deterministic (§7.3)");
        }
        Err(err) => {
            // §5.6: a file whose every descriptor set has an unknown
            // `elementType` still decodes (each such set is dropped with
            // `UNSUPPORTED_DESCRIPTOR_SET`), but the resulting target then
            // carries no descriptor set at all, and §5.1 requires at least
            // one. The canonical writer refuses to re-emit that target with
            // `INVALID_TARGET` rather than write a file §5.1 forbids — this
            // is the one documented case where an accepted decode is not
            // re-encodable, not a reader/writer disagreement. Do not turn
            // this back into an `expect`: anything else reaching this arm
            // (any other code, or `INVALID_TARGET` with sets still present)
            // means the writer refused a target the reader accepted for a
            // reason §5.6 does not name, which is exactly the disagreement
            // §8.4's round trip exists to catch.
            assert_eq!(
                err.code,
                ErrorCode::InvalidTarget,
                "encode failed for a reason other than INVALID_TARGET"
            );
            assert!(
                decoded.target.descriptor_sets.is_empty(),
                "encode refused a target that still has descriptor sets (§5.6)"
            );
        }
    }
});
