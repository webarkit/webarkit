/*
 *  canonical_json.rs
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

//! Canonical serialisation (§7.3): the same content always produces the same
//! bytes from the same implementation.
//!
//! Two of §7.3's requirements come free in Rust and cost the TypeScript codec a
//! module:
//!
//! - **Key order inside `params` and `info`.** §7.3 requires Unicode code-point
//!   order. `serde_json::Map` is a `BTreeMap<String, Value>` (the
//!   `preserve_order` feature is deliberately off), and `String`'s `Ord` is
//!   byte order, which for valid UTF-8 *is* code-point order. So the sort is a
//!   property of the container rather than a step the writer must remember.
//! - **Sorting `descriptorSets` and the extension name arrays.** `str`'s `Ord`
//!   is the same byte order, so `sort_by` on the tuple is §7.3's comparator.
//!
//! What does not come free is the manifest's own key order, which §7.3 fixes as
//! "the order this specification lists them". `serde_json` would sort those
//! alphabetically, so the manifest is emitted by hand, member by member (see
//! `encode.rs`).
//!
//! Numbers are `serde_json`'s (`ryu`, shortest round-trip, `float_roundtrip` on
//! in `Cargo.toml`). They need not match the TypeScript codec's byte for byte:
//! §7.3's last paragraph and Q8 leave number formatting free across languages,
//! which is why cross-implementation conformance compares manifests **after
//! parsing** and requires byte identity only of the `BIN\0` chunk.

use alloc::string::String;

/// One JSON string, escaped exactly as `serde_json` would escape it.
///
/// Delegated to `serde_json::to_string` rather than hand-rolled, so this
/// crate's writer and its reader (`serde_json::from_str`, in `manifest.rs`)
/// never disagree about which characters need escaping. Serialising a `&str`
/// cannot fail — there is no I/O, and every Rust `&str` is already valid
/// UTF-8 — so the error path is unreachable in practice; `unwrap_or_else`
/// with an infallible fallback keeps that true without an `.unwrap()` the
/// crate-wide lints would refuse.
#[must_use]
pub(crate) fn json_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| String::from("\"\""))
}

/// A `u32` as a JSON number. Always an integer literal — a `u32` has no
/// fractional representation to worry about, unlike [`json_number_f64`].
#[must_use]
pub(crate) fn json_number_u32(n: u32) -> String {
    let mut s = String::new();
    // `u32::to_string` would need `alloc::string::ToString`; a manual
    // `itoa`-style loop is unnecessary here since `alloc::format!` already
    // does exactly this without pulling in a new trait import.
    let _ = core::fmt::Write::write_fmt(&mut s, format_args!("{n}"));
    s
}

/// A `usize` as a JSON number — for an accessor index, always small enough to
/// fit a `u32` in any file this crate can otherwise represent (§7.3's own
/// oversized-target check in `encode.rs` guarantees that before this is ever
/// called).
#[must_use]
pub(crate) fn json_number_usize(n: usize) -> String {
    let mut s = String::new();
    let _ = core::fmt::Write::write_fmt(&mut s, format_args!("{n}"));
    s
}

/// A finite `f64` as a JSON number, or `None` if it is not finite.
///
/// `validate_target` (§7.3) has already rejected any target carrying a
/// non-finite `f64` — `pyramid.scaleStep` and `meta.physicalSizeMm` are the
/// only typed `f64` fields, and both are checked there before `encode` ever
/// reaches serialisation. Reaching this function with a non-finite value is
/// therefore a bug in this crate, not a bad target: the caller treats `None`
/// as an internal-invariant failure (still reported as `INVALID_TARGET`,
/// never a panic), rather than as a new validation path of its own.
#[must_use]
pub(crate) fn json_number_f64(n: f64) -> Option<String> {
    if !n.is_finite() {
        return None;
    }
    serde_json::to_string(&n).ok()
}

/// `{ "k1": v1, "k2": v2, ... }`, in exactly the order given — the manifest's
/// own key order is normative (§7.3: "the order this specification lists
/// them"), so this joiner must never reorder its input.
#[must_use]
pub(crate) fn object(members: &[(&str, String)]) -> String {
    let mut out = String::from("{");
    for (i, (key, value)) in members.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&json_string(key));
        out.push(':');
        out.push_str(value);
    }
    out.push('}');
    out
}

/// `[ v1, v2, ... ]`, in the order given.
#[must_use]
pub(crate) fn array(items: &[String]) -> String {
    let mut out = String::from("[");
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(item);
    }
    out.push(']');
    out
}
