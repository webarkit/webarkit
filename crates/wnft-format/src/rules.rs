/*
 *  rules.rs
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

//! Domain and consistency rules shared verbatim by the reader (`manifest.rs`,
//! `consistency.rs`) and the writer (`validate_target.rs`).
//!
//! `validate_target.rs`'s module doc explains why most of its rule list is
//! deliberately *not* shared: the reader validates a parsed manifest,
//! addressed by accessor indices into a `BIN` chunk it has not yet built,
//! while the writer validates owned arrays before any accessor exists — most
//! checks therefore need two implementations with two different shapes of
//! input, even though they enforce the same rule. That argument does not
//! apply to what lives here: each of these operates on an already-materialised
//! `&[u32]` / `&[[u32; 2]]` on both sides, with no shape difference at all, so
//! duplicating them bought nothing but two copies to keep in sync. This
//! module is their one home.

/// The largest value in §5.4's/§5.8's `[1, 2^16 − 1]` domain.
pub(crate) const U16_DOMAIN_MAX: u32 = u16::MAX as u32;

/// Whether `level_start` is closed and non-decreasing against `total` (§5.5,
/// §5.6): `level_start[0] == 0`, non-decreasing, and its last entry equals
/// `total`. An empty slice is never closed — a real `levelStart` always has
/// at least one entry (`L >= 1`, so `L + 1 >= 2`).
pub(crate) fn level_start_closed(level_start: &[u32], total: u32) -> bool {
    match level_start.split_first() {
        Some((&first, rest)) if first == 0 => {
            let mut prev = first;
            for &next in rest {
                if next < prev {
                    return false;
                }
                prev = next;
            }
            prev == total
        }
        _ => false,
    }
}

/// Whether every keypoint's `level` agrees with `levelStart` (§5.5): for
/// every `l` in `[0, level_count)`, every index in
/// `[levelStart[l], levelStart[l+1])` has `level[i] == l`.
///
/// Comparing through `usize` rather than casting `l` down to `u8` means a
/// `level_count` a caller's `Limits` raised past 256 is handled correctly
/// too: no stored `level` value can ever equal such an `l`, so a non-empty
/// range at that `l` correctly fails rather than wrapping into a false match.
pub(crate) fn levels_agree(level_start: &[u32], level: &[u8], level_count: usize) -> bool {
    for l in 0..level_count {
        let (Some(&start), Some(&end)) = (level_start.get(l), level_start.get(l + 1)) else {
            return false;
        };
        let Some(range) = level.get((start as usize)..(end as usize)) else {
            return false;
        };
        if range.iter().any(|&lv| usize::from(lv) != l) {
            return false;
        }
    }
    true
}

/// Whether `sizes` is non-increasing level to level (§5.4). Destructured by
/// pattern rather than indexed: `clippy::indexing_slicing` is denied
/// crate-wide, and a `windows(2)` slice is exactly two elements wide, so a
/// slice pattern reads them without ever calling `Index`.
pub(crate) fn level_sizes_non_increasing(sizes: &[[u32; 2]]) -> bool {
    sizes.windows(2).all(|pair| match pair {
        [[prev_w, prev_h], [next_w, next_h]] => next_w <= prev_w && next_h <= prev_h,
        _ => true,
    })
}
