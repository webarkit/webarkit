/*
 *  ijson.rs
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

//! The I-JSON scan: §5's five conformance checks, run in one pass over the
//! manifest **text**, before `serde_json` ever sees it.
//!
//! Two of the five cannot be done after parsing (§6.1 step 4): a duplicate
//! member name is gone once the parser has kept one of the two, and an integer
//! literal outside ±(2^53 − 1) has already been rounded to the nearest double.
//! The other three (unpaired surrogate escapes, infinities, noncharacters)
//! could be done on the parsed tree, but doing all five here is one pass
//! instead of two.
//!
//! The scan is its own small JSON tokenizer, with an **explicit stack**
//! (`Vec<Frame>`) rather than recursive descent: §6.1 step 4 requires
//! pathological nesting to be `BAD_MANIFEST`, not a crash, and a
//! recursive-descent scanner would blow the native stack on input a hostile
//! `.wnft` can trivially supply. It also rejects syntactically malformed JSON,
//! which makes it a syntax check too — but the caller still runs `serde_json`
//! afterwards, because agreeing with `serde_json` on every malformed input is
//! not a promise this scanner makes.
//!
//! # Strings, and why they are UTF-16 code units here
//!
//! A Rust `&str` is well-formed UTF-8 by construction, so it **cannot hold** a
//! lone surrogate — which is exactly what check (b) exists to detect. A
//! scanner that accumulated a JSON string's contents into a `String` would
//! therefore be structurally unable to fail check (b): building the `String`
//! is precisely what a lone surrogate escape makes impossible.
//!
//! Every JSON string this scanner reads — member name or value, escaped or
//! raw — is therefore decoded into a `Vec<u16>` of UTF-16 code units first.
//! Raw (non-ASCII) characters go through `char::encode_utf16`; `\uXXXX`
//! escapes contribute their code unit directly, unpaired or not. Checks (b)
//! and (e) run over that `Vec<u16>`. A `String` is built from it — via
//! `char::decode_utf16` — only for a member name, and only after (b) has
//! already passed, because building one is what check (a)'s duplicate-name set
//! needs to compare by value.

use alloc::collections::BTreeSet;
use alloc::string::String;
use alloc::vec::Vec;
use core::fmt::Write as _;

/// The largest integer an IEEE 754 double represents exactly — check (c).
pub(crate) const MAX_EXACT_INTEGER: i64 = 9_007_199_254_740_991;

/// Where a violation sits, e.g. `$.descriptorSets[0].params.seed`, and why.
///
/// `path` is free text for a human or a log, built while walking the text; it
/// is not part of the cross-implementation contract the way an [`ErrorCode`]
/// is (`crate::error::ErrorCode`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IJsonViolation {
    /// Where in the manifest the violation was found.
    pub path: String,
    /// Why the text at `path` fails an I-JSON check.
    pub reason: String,
}

/// Check (b): a high surrogate not followed by a low one, or a low one alone.
///
/// Operates on the UTF-16 code units a JSON string decodes to — see the module
/// docs for why a `&str` cannot be used here.
pub(crate) fn has_unpaired_surrogate(units: &[u16]) -> bool {
    let mut i = 0usize;
    while i < units.len() {
        let Some(&u) = units.get(i) else { break };
        if (0xD800..=0xDBFF).contains(&u) {
            match units.get(i + 1) {
                Some(&low) if (0xDC00..=0xDFFF).contains(&low) => {
                    i += 2;
                    continue;
                }
                _ => return true,
            }
        } else if (0xDC00..=0xDFFF).contains(&u) {
            return true;
        }
        i += 1;
    }
    false
}

/// Check (e): the 66 noncharacters, U+FDD0..U+FDEF and U+xFFFE/U+xFFFF at the
/// end of every plane.
///
/// The plane-end pair is recognised through its low surrogate alone: in
/// UTF-16 the low unit of U+xFFFE is always `0xDFFE` and of U+xFFFF always
/// `0xDFFF`, whatever the plane, and no other code point pairs to either.
/// Comparing code units numerically this way also keeps this source file free
/// of a literal noncharacter or lone surrogate — editors, git filters and
/// terminals all handle those differently, and a repository should not carry
/// a byte sequence nobody can safely edit.
pub(crate) fn has_noncharacter(units: &[u16]) -> bool {
    let mut i = 0usize;
    while i < units.len() {
        let Some(&u) = units.get(i) else { break };
        if (0xFDD0..=0xFDEF).contains(&u) {
            return true;
        }
        if (0xD800..=0xDBFF).contains(&u) {
            if let Some(&low) = units.get(i + 1) {
                if (0xDC00..=0xDFFF).contains(&low) {
                    if low == 0xDFFE || low == 0xDFFF {
                        return true;
                    }
                    i += 2;
                    continue;
                }
            }
            i += 1;
            continue;
        }
        if u == 0xFFFE || u == 0xFFFF {
            return true;
        }
        i += 1;
    }
    false
}

/// How a container (or the root value) was reached from its parent. Kept
/// separate from a precomputed path *string* per frame: a manifest can nest
/// 100,000 levels deep (§6.1 step 4's pathological-nesting case), and storing
/// a full path string at every level would make the scan quadratic in depth.
/// The full path is instead built on demand, from this cheap per-frame
/// breadcrumb, only when a violation is actually reported.
enum ReachedVia {
    /// The root value itself.
    Root,
    /// An array element, by index.
    Index(u64),
    /// An object member, by its unescaped name.
    Key(String),
}

/// An object's progress through `{ "a": 1, "b": 2 }`.
enum ObjectState {
    /// Just saw `{` or `,`: next is a member name or `}`.
    KeyOrClose,
    /// Just read a member name: next MUST be `:`.
    Colon {
        /// The member name already read (unescaped).
        key: String,
    },
    /// Just read `:`: next is the member's value.
    Value {
        /// The member name the upcoming value belongs to.
        key: String,
    },
    /// Just finished a member's value: next is `,` or `}`.
    CommaOrClose,
}

/// One container on the explicit stack: an array or an object, with enough
/// state to resume where the last token left off.
enum Frame {
    /// A JSON array.
    Array {
        /// How this array itself was reached.
        reached_via: ReachedVia,
        /// Index of the next element (or the one just finished).
        index: u64,
        /// `true` between `[`/`,` and the next value; `false` after a value,
        /// awaiting `,` or `]`.
        awaiting_value: bool,
    },
    /// A JSON object.
    Object {
        /// How this object itself was reached.
        reached_via: ReachedVia,
        /// Member names seen so far, unescaped — check (a)'s duplicate set.
        seen: BTreeSet<String>,
        /// Where we are between members.
        state: ObjectState,
    },
}

/// The textual suffix `reached_via` contributes to a path: nothing for the
/// root, `[index]` for an array element, `.key` for an object member.
fn suffix(reached_via: &ReachedVia) -> String {
    match reached_via {
        ReachedVia::Root => String::new(),
        ReachedVia::Index(index) => {
            let mut s = String::new();
            // `write!` to a `String` only fails on allocation failure, which
            // this crate has no way to recover from anyway; a short numeric
            // suffix is not where that would first show up.
            let _ = write!(s, "[{index}]");
            s
        }
        ReachedVia::Key(key) => {
            let mut s = String::with_capacity(key.len() + 1);
            s.push('.');
            s.push_str(key);
            s
        }
    }
}

/// The path of the innermost frame on `stack`, built by walking every frame's
/// `reached_via` breadcrumb. `O(depth)`, so it must only be called when a
/// violation is actually being reported — never on every token.
fn build_path(stack: &[Frame]) -> String {
    let mut path = String::from("$");
    for frame in stack {
        let reached_via = match frame {
            Frame::Array { reached_via, .. } | Frame::Object { reached_via, .. } => reached_via,
        };
        path.push_str(&suffix(reached_via));
    }
    path
}

/// Build a violation whose path is `stack`'s innermost frame, plus `extra`
/// (the value currently being read, which has no frame of its own yet).
fn violation_at(stack: &[Frame], extra: &ReachedVia, reason: &str) -> IJsonViolation {
    let mut path = build_path(stack);
    path.push_str(&suffix(extra));
    IJsonViolation {
        path,
        reason: String::from(reason),
    }
}

/// Decode a checked `Vec<u16>` (no unpaired surrogate, by construction of the
/// caller) into a `String`. Defensive on `Err`: this should be unreachable
/// once check (b) has passed, but the crate never panics on a code path it
/// merely believes is unreachable.
fn units_to_string(units: &[u16]) -> Result<String, ()> {
    let mut s = String::new();
    for unit in char::decode_utf16(units.iter().copied()) {
        match unit {
            Ok(c) => s.push(c),
            Err(_) => return Err(()),
        }
    }
    Ok(s)
}

/// Check (b) and (e) together, on a string's decoded units.
fn check_string(units: &[u16], stack: &[Frame], extra: &ReachedVia) -> Result<(), IJsonViolation> {
    if has_unpaired_surrogate(units) {
        return Err(violation_at(
            stack,
            extra,
            "string contains an unpaired surrogate escape",
        ));
    }
    if has_noncharacter(units) {
        return Err(violation_at(
            stack,
            extra,
            "string contains a Unicode noncharacter",
        ));
    }
    Ok(())
}

/// A byte at `at`, or `None` past the end. Never panics, unlike direct
/// indexing (denied crate-wide).
fn peek(bytes: &[u8], at: usize) -> Option<u8> {
    bytes.get(at).copied()
}

/// Advance `i` past ASCII JSON whitespace (space, tab, `\n`, `\r`).
fn skip_ws(bytes: &[u8], mut i: usize) -> usize {
    while matches!(peek(bytes, i), Some(b' ' | b'\t' | b'\n' | b'\r')) {
        i += 1;
    }
    i
}

/// Match a fixed literal (`"true"`, `"false"`, `"null"`) at `i`.
fn match_literal(bytes: &[u8], i: usize, literal: &str) -> Option<usize> {
    let literal_bytes = literal.as_bytes();
    let end = i.checked_add(literal_bytes.len())?;
    let slice = bytes.get(i..end)?;
    if slice == literal_bytes {
        Some(end)
    } else {
        None
    }
}

/// Read one JSON string starting at the opening `"` at `quote_at`, decoding it
/// to UTF-16 code units (module docs). Structural JSON string syntax
/// (termination, escapes, disallowed raw control characters) is also checked
/// here, since this scanner doubles as a syntax check.
fn parse_string_units(
    bytes: &[u8],
    text: &str,
    quote_at: usize,
    stack: &[Frame],
    extra: &ReachedVia,
) -> Result<(Vec<u16>, usize), IJsonViolation> {
    let mut units: Vec<u16> = Vec::new();
    let mut i = quote_at + 1;
    loop {
        let b = match bytes.get(i) {
            Some(&b) => b,
            None => return Err(violation_at(stack, extra, "unterminated string")),
        };
        match b {
            b'"' => return Ok((units, i + 1)),
            b'\\' => {
                let esc = match bytes.get(i + 1) {
                    Some(&b) => b,
                    None => return Err(violation_at(stack, extra, "unterminated escape")),
                };
                match esc {
                    b'"' => {
                        units.push(u16::from(b'"'));
                        i += 2;
                    }
                    b'\\' => {
                        units.push(u16::from(b'\\'));
                        i += 2;
                    }
                    b'/' => {
                        units.push(u16::from(b'/'));
                        i += 2;
                    }
                    b'b' => {
                        units.push(0x0008);
                        i += 2;
                    }
                    b'f' => {
                        units.push(0x000C);
                        i += 2;
                    }
                    b'n' => {
                        units.push(0x000A);
                        i += 2;
                    }
                    b'r' => {
                        units.push(0x000D);
                        i += 2;
                    }
                    b't' => {
                        units.push(0x0009);
                        i += 2;
                    }
                    b'u' => {
                        let hex_start = i + 2;
                        let hex_end = hex_start + 4;
                        let hex = match bytes.get(hex_start..hex_end) {
                            Some(hex) => hex,
                            None => {
                                return Err(violation_at(stack, extra, "truncated \\u escape"));
                            }
                        };
                        let hex_str = match core::str::from_utf8(hex) {
                            Ok(s) => s,
                            Err(_) => {
                                return Err(violation_at(stack, extra, "invalid \\u escape"));
                            }
                        };
                        let code = match u16::from_str_radix(hex_str, 16) {
                            Ok(code) => code,
                            Err(_) => {
                                return Err(violation_at(stack, extra, "invalid \\u escape"));
                            }
                        };
                        units.push(code);
                        i = hex_end;
                    }
                    _ => return Err(violation_at(stack, extra, "invalid escape sequence")),
                }
            }
            0x00..=0x1F => {
                return Err(violation_at(
                    stack,
                    extra,
                    "raw control character in string",
                ));
            }
            _ => {
                let ch = match text.get(i..).and_then(|rest| rest.chars().next()) {
                    Some(ch) => ch,
                    None => return Err(violation_at(stack, extra, "invalid UTF-8 in string")),
                };
                let mut buf = [0u16; 2];
                for unit in ch.encode_utf16(&mut buf).iter() {
                    units.push(*unit);
                }
                i += ch.len_utf8();
            }
        }
    }
}

/// Read one JSON number literal at `i` and apply checks (c) and (d).
///
/// The literal is parsed with `i128` rather than `i64` (check (c)) so that a
/// literal far outside ±(2^53 − 1) is still comparable rather than an `Err`
/// requiring a special case; a literal too large even for `i128` is, a
/// fortiori, outside the range and reported directly.
fn parse_number(
    bytes: &[u8],
    text: &str,
    i: usize,
    stack: &[Frame],
    extra: &ReachedVia,
) -> Result<usize, IJsonViolation> {
    let start = i;
    let mut j = i;
    if peek(bytes, j) == Some(b'-') {
        j += 1;
    }
    match peek(bytes, j) {
        Some(b'0') => j += 1,
        Some(c) if c.is_ascii_digit() => {
            j += 1;
            while matches!(peek(bytes, j), Some(c) if c.is_ascii_digit()) {
                j += 1;
            }
        }
        _ => return Err(violation_at(stack, extra, "invalid number literal")),
    }

    let mut is_integer = true;

    if peek(bytes, j) == Some(b'.') {
        is_integer = false;
        j += 1;
        match peek(bytes, j) {
            Some(c) if c.is_ascii_digit() => j += 1,
            _ => {
                return Err(violation_at(
                    stack,
                    extra,
                    "invalid number literal: digit expected after '.'",
                ));
            }
        }
        while matches!(peek(bytes, j), Some(c) if c.is_ascii_digit()) {
            j += 1;
        }
    }

    if matches!(peek(bytes, j), Some(b'e' | b'E')) {
        is_integer = false;
        j += 1;
        if matches!(peek(bytes, j), Some(b'+' | b'-')) {
            j += 1;
        }
        match peek(bytes, j) {
            Some(c) if c.is_ascii_digit() => j += 1,
            _ => {
                return Err(violation_at(
                    stack,
                    extra,
                    "invalid number literal: digit expected in exponent",
                ));
            }
        }
        while matches!(peek(bytes, j), Some(c) if c.is_ascii_digit()) {
            j += 1;
        }
    }

    let literal = match text.get(start..j) {
        Some(literal) => literal,
        None => {
            return Err(violation_at(
                stack,
                extra,
                "internal: number literal out of bounds",
            ));
        }
    };

    if is_integer {
        let max = i128::from(MAX_EXACT_INTEGER);
        match literal.parse::<i128>() {
            Ok(value) if value <= max && value >= -max => {}
            _ => {
                return Err(violation_at(
                    stack,
                    extra,
                    "integer literal outside +/-(2^53 - 1)",
                ));
            }
        }
    } else {
        match literal.parse::<f64>() {
            Ok(value) if value.is_infinite() => {
                return Err(violation_at(
                    stack,
                    extra,
                    "number literal rounds to infinity",
                ));
            }
            Ok(_) => {}
            Err(_) => return Err(violation_at(stack, extra, "invalid number literal")),
        }
    }

    Ok(j)
}

/// What a fully parsed value did to the cursor: either it was a scalar that
/// ends at the returned index, or it opened a container whose frame has
/// already been pushed onto the caller's stack.
enum ValueOutcome {
    /// A string, number, `true`, `false` or `null`, ending at this index.
    Scalar(usize),
    /// An object or array was opened; its frame is now on top of the stack.
    Opened(usize),
}

/// Parse one JSON value at `i`: an object/array open (pushes a [`Frame`]), a
/// string, a number, or `true`/`false`/`null`.
fn parse_value(
    bytes: &[u8],
    text: &str,
    i: usize,
    reached_via: ReachedVia,
    stack: &mut Vec<Frame>,
) -> Result<ValueOutcome, IJsonViolation> {
    let i = skip_ws(bytes, i);
    match peek(bytes, i) {
        Some(b'{') => {
            stack.push(Frame::Object {
                reached_via,
                seen: BTreeSet::new(),
                state: ObjectState::KeyOrClose,
            });
            Ok(ValueOutcome::Opened(i + 1))
        }
        Some(b'[') => {
            stack.push(Frame::Array {
                reached_via,
                index: 0,
                awaiting_value: true,
            });
            Ok(ValueOutcome::Opened(i + 1))
        }
        Some(b'"') => {
            let (units, next_i) = parse_string_units(bytes, text, i, stack, &reached_via)?;
            check_string(&units, stack, &reached_via)?;
            Ok(ValueOutcome::Scalar(next_i))
        }
        Some(b't') => match_literal(bytes, i, "true")
            .map(ValueOutcome::Scalar)
            .ok_or_else(|| violation_at(stack, &reached_via, "invalid literal")),
        Some(b'f') => match_literal(bytes, i, "false")
            .map(ValueOutcome::Scalar)
            .ok_or_else(|| violation_at(stack, &reached_via, "invalid literal")),
        Some(b'n') => match_literal(bytes, i, "null")
            .map(ValueOutcome::Scalar)
            .ok_or_else(|| violation_at(stack, &reached_via, "invalid literal")),
        Some(c) if c == b'-' || c.is_ascii_digit() => {
            let next_i = parse_number(bytes, text, i, stack, &reached_via)?;
            Ok(ValueOutcome::Scalar(next_i))
        }
        _ => Err(violation_at(stack, &reached_via, "expected a JSON value")),
    }
}

/// Record that the frame now on top of `stack` (or the root, if `stack` is
/// empty) just received a completed value — used both when a scalar was read
/// and when a container frame was just popped after its closing bracket.
fn note_value_produced(stack: &mut [Frame], have_root_value: &mut bool) {
    match stack.last_mut() {
        None => *have_root_value = true,
        Some(Frame::Array { awaiting_value, .. }) => *awaiting_value = false,
        Some(Frame::Object { state, .. }) => *state = ObjectState::CommaOrClose,
    }
}

/// What the frame on top of the stack needs next. A snapshot taken before any
/// mutation, so that the borrow used to read it ends before `stack` is
/// mutated again (avoiding two live mutable borrows of `stack` at once).
enum Need {
    /// Array: a value at `index`, or `]` if the array is empty so far.
    ArrayValueOrClose {
        /// The index the next element would have.
        index: u64,
    },
    /// Array: `,` (then another value) or `]`.
    ArrayCommaOrClose,
    /// Object: a member name, or `}` if the object is empty so far.
    ObjectKeyOrClose,
    /// Object: `:`, having just read member name `key`.
    ObjectColon {
        /// The member name already read.
        key: String,
    },
    /// Object: the value for member `key`.
    ObjectValue {
        /// The member name the value belongs to.
        key: String,
    },
    /// Object: `,` (then another member) or `}`.
    ObjectCommaOrClose,
}

/// Scan `text` for the five I-JSON checks of §5. `None` when the text passes
/// all five (and is syntactically valid JSON with one top-level value).
///
/// The scan is **iterative, with an explicit stack**, so pathological nesting
/// (§6.1 step 4) terminates rather than overflowing the native stack.
pub fn scan_ijson(text: &str) -> Option<IJsonViolation> {
    let bytes = text.as_bytes();
    let mut stack: Vec<Frame> = Vec::new();
    let mut have_root_value = false;
    let mut i: usize = 0;

    loop {
        i = skip_ws(bytes, i);

        if stack.is_empty() {
            if have_root_value {
                return if i < bytes.len() {
                    Some(IJsonViolation {
                        path: String::from("$"),
                        reason: String::from("trailing data after the top-level value"),
                    })
                } else {
                    None
                };
            }
            match parse_value(bytes, text, i, ReachedVia::Root, &mut stack) {
                Ok(ValueOutcome::Scalar(next_i)) => {
                    i = next_i;
                    have_root_value = true;
                }
                Ok(ValueOutcome::Opened(next_i)) => i = next_i,
                Err(v) => return Some(v),
            }
            continue;
        }

        let need = match stack.last() {
            Some(Frame::Array {
                index,
                awaiting_value: true,
                ..
            }) => Need::ArrayValueOrClose { index: *index },
            Some(Frame::Array {
                awaiting_value: false,
                ..
            }) => Need::ArrayCommaOrClose,
            Some(Frame::Object {
                state: ObjectState::KeyOrClose,
                ..
            }) => Need::ObjectKeyOrClose,
            Some(Frame::Object {
                state: ObjectState::Colon { key },
                ..
            }) => Need::ObjectColon { key: key.clone() },
            Some(Frame::Object {
                state: ObjectState::Value { key },
                ..
            }) => Need::ObjectValue { key: key.clone() },
            Some(Frame::Object {
                state: ObjectState::CommaOrClose,
                ..
            }) => Need::ObjectCommaOrClose,
            None => {
                return Some(IJsonViolation {
                    path: String::from("$"),
                    reason: String::from("internal: empty stack"),
                });
            }
        };

        match need {
            Need::ArrayValueOrClose { index } => match peek(bytes, i) {
                Some(b']') => {
                    i += 1;
                    stack.pop();
                    note_value_produced(&mut stack, &mut have_root_value);
                }
                _ => match parse_value(bytes, text, i, ReachedVia::Index(index), &mut stack) {
                    Ok(ValueOutcome::Scalar(next_i)) => {
                        i = next_i;
                        if let Some(Frame::Array { awaiting_value, .. }) = stack.last_mut() {
                            *awaiting_value = false;
                        }
                    }
                    Ok(ValueOutcome::Opened(next_i)) => i = next_i,
                    Err(v) => return Some(v),
                },
            },
            Need::ArrayCommaOrClose => match peek(bytes, i) {
                Some(b',') => {
                    i += 1;
                    if let Some(Frame::Array {
                        index,
                        awaiting_value,
                        ..
                    }) = stack.last_mut()
                    {
                        *index += 1;
                        *awaiting_value = true;
                    }
                }
                Some(b']') => {
                    i += 1;
                    stack.pop();
                    note_value_produced(&mut stack, &mut have_root_value);
                }
                _ => {
                    return Some(violation_at(
                        &stack,
                        &ReachedVia::Root,
                        "expected ',' or ']'",
                    ));
                }
            },
            Need::ObjectKeyOrClose => match peek(bytes, i) {
                Some(b'}') => {
                    i += 1;
                    stack.pop();
                    note_value_produced(&mut stack, &mut have_root_value);
                }
                Some(b'"') => match parse_string_units(bytes, text, i, &stack, &ReachedVia::Root) {
                    Ok((units, next_i)) => {
                        if has_unpaired_surrogate(&units) {
                            return Some(violation_at(
                                &stack,
                                &ReachedVia::Root,
                                "member name contains an unpaired surrogate escape",
                            ));
                        }
                        if has_noncharacter(&units) {
                            return Some(violation_at(
                                &stack,
                                &ReachedVia::Root,
                                "member name contains a Unicode noncharacter",
                            ));
                        }
                        let name = match units_to_string(&units) {
                            Ok(name) => name,
                            Err(()) => {
                                return Some(violation_at(
                                    &stack,
                                    &ReachedVia::Root,
                                    "member name is not valid UTF-16 after unescaping",
                                ));
                            }
                        };
                        let duplicate = matches!(
                            stack.last(),
                            Some(Frame::Object { seen, .. }) if seen.contains(&name)
                        );
                        if duplicate {
                            return Some(violation_at(
                                &stack,
                                &ReachedVia::Key(name),
                                "duplicate member name",
                            ));
                        }
                        if let Some(Frame::Object { seen, state, .. }) = stack.last_mut() {
                            seen.insert(name.clone());
                            *state = ObjectState::Colon { key: name };
                        }
                        i = next_i;
                    }
                    Err(v) => return Some(v),
                },
                _ => {
                    return Some(violation_at(
                        &stack,
                        &ReachedVia::Root,
                        "expected a member name or '}'",
                    ));
                }
            },
            Need::ObjectColon { key } => match peek(bytes, i) {
                Some(b':') => {
                    i += 1;
                    if let Some(Frame::Object { state, .. }) = stack.last_mut() {
                        *state = ObjectState::Value { key };
                    }
                }
                _ => return Some(violation_at(&stack, &ReachedVia::Key(key), "expected ':'")),
            },
            Need::ObjectValue { key } => {
                match parse_value(bytes, text, i, ReachedVia::Key(key), &mut stack) {
                    Ok(ValueOutcome::Scalar(next_i)) => {
                        i = next_i;
                        if let Some(Frame::Object { state, .. }) = stack.last_mut() {
                            *state = ObjectState::CommaOrClose;
                        }
                    }
                    Ok(ValueOutcome::Opened(next_i)) => i = next_i,
                    Err(v) => return Some(v),
                }
            }
            Need::ObjectCommaOrClose => match peek(bytes, i) {
                Some(b',') => {
                    i += 1;
                    if let Some(Frame::Object { state, .. }) = stack.last_mut() {
                        *state = ObjectState::KeyOrClose;
                    }
                }
                Some(b'}') => {
                    i += 1;
                    stack.pop();
                    note_value_produced(&mut stack, &mut have_root_value);
                }
                _ => {
                    return Some(violation_at(
                        &stack,
                        &ReachedVia::Root,
                        "expected ',' or '}'",
                    ));
                }
            },
        }
    }
}
