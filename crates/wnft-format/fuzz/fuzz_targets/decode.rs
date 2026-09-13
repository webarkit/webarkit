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
//! is asserted below is §8.4's round trip on top of it, and §5.6 and §7.3
//! each carve out one legal case that round trip does not cover.

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
            let again =
                decode(&bytes, &DEFAULT_LIMITS).expect("canonical output must decode (§8.4)");
            assert_eq!(again.target, decoded.target);

            // §7.3's opening line: the same content always produces the same
            // bytes. Encoding twice must not be able to disagree with itself.
            let bytes_again =
                encode(&decoded.target).expect("encode must succeed again on the same target");
            assert_eq!(bytes, bytes_again, "encode is not deterministic (§7.3)");
        }
        Err(err) => {
            // An accepted decode that `encode` then refuses is legal for two
            // documented reasons, not one:
            //
            // - §5.6: a file whose every descriptor set has an unknown
            //   `elementType` still decodes (each such set is dropped with
            //   `UNSUPPORTED_DESCRIPTOR_SET`), but the resulting target then
            //   carries no descriptor set at all, and §5.1 requires at least
            //   one. The canonical writer refuses to re-emit that target
            //   rather than write a file §5.1 forbids.
            // - §7.3's paragraph on check (c): the writer is deliberately
            //   stricter than the reader there. Check (c) constrains integer
            //   *literals*, so a reader accepts an integer-valued number
            //   outside ±(2^53 − 1) when it is written with a fraction or
            //   exponent (e.g. `1e21`). The writer nonetheless refuses to
            //   re-emit any such value wherever it appears in `params` or
            //   `info`, because another implementation might render the same
            //   value as a bare integer literal that every conforming reader
            //   rejects.
            //
            // Unlike §5.6's case, §7.3's can fire with descriptor sets very
            // much present, so no assertion on the shape of `decoded.target`
            // admits both without also admitting a real reader/writer
            // disagreement. The error code is what both cases share. Do not
            // turn this back into an `expect`: any other code reaching this
            // arm means the writer refused a target the reader accepted for
            // a reason neither §5.6 nor §7.3 names, which is exactly the
            // disagreement §8.4's round trip exists to catch.
            assert_eq!(
                err.code,
                ErrorCode::InvalidTarget,
                "encode failed for a reason other than INVALID_TARGET"
            );
        }
    }
});
