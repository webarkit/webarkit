/*
 *  aliasing.rs
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

//! §6.1's bound on total materialised bytes, and §5.6's rule that a reader
//! preserves the file's `descriptorSets` order.
//!
//! Both are rules about what a reader does rather than about which files are
//! valid, so neither can be checked by a fixture's expected error code — which
//! is why they live here rather than in `corpus.rs`.

mod common;

use std::sync::Arc;

use wnft_format::testing::build_container;
use wnft_format::{DEFAULT_LIMITS, decode};

/// `valid/minimal.wnft` with `keypoints.y`, `.angle` and `.score` repointed at
/// the accessor `keypoints.x` already names.
///
/// §5.2 constrains distinct accessors' byte ranges — "accessors MUST NOT
/// overlap" — and says nothing about how many manifest *fields* may reference
/// one, so this is a legal file. All four fields are `f32` of count `N`, so
/// every per-field type and count check still passes, and the accessors the
/// other three used to name simply become unreferenced, which §5.2 allows in
/// as many words. No canonical writer emits this: §7.3 gives each array its
/// own accessor.
fn aliased_file() -> Vec<u8> {
    let parts = common::split(&common::read("valid/minimal.wnft"));
    let mut doc: serde_json::Value =
        serde_json::from_slice(&parts.json).expect("the fixture manifest parses");
    let x = doc["keypoints"]["x"].clone();
    for field in ["y", "angle", "score"] {
        doc["keypoints"][field] = x.clone();
    }
    let json = serde_json::to_vec(&doc).expect("the manifest re-serializes");
    build_container(&json, Some(&parts.bin))
}

#[test]
fn one_accessor_named_by_four_fields_is_materialised_once() {
    // §6.1: total materialised accessor bytes must not exceed the BIN chunk's
    // length. Nothing bounds the number of references, so a reader that
    // copies per reference allocates in proportion to those instead — at
    // §6.4's descriptor-set limit, roughly a gigabyte from a file well under
    // the file-size limit. Sharing one allocation is what holds the bound,
    // and pointer identity is its observable form: equal contents would also
    // hold for four separate copies, which is exactly the case being ruled
    // out.
    let decoded = decode(&aliased_file(), &DEFAULT_LIMITS).expect("the aliased file decodes");
    let kp = &decoded.target.keypoints;

    assert!(Arc::ptr_eq(&kp.x, &kp.y), "y must share x's allocation");
    assert!(
        Arc::ptr_eq(&kp.x, &kp.angle),
        "angle must share x's allocation"
    );
    assert!(
        Arc::ptr_eq(&kp.x, &kp.score),
        "score must share x's allocation"
    );

    // And the file really is the aliased one, not minimal.wnft read by
    // accident: in minimal.wnft these four carry different values.
    assert_eq!(kp.x.as_ref(), kp.y.as_ref());
}

#[test]
fn distinct_accessors_are_not_shared() {
    // The negative half. Without it, a reader that handed every f32 field one
    // global array would pass the test above while being catastrophically
    // wrong, and nothing here would notice.
    let decoded =
        decode(&common::read("valid/minimal.wnft"), &DEFAULT_LIMITS).expect("minimal decodes");
    let kp = &decoded.target.keypoints;
    assert!(!Arc::ptr_eq(&kp.x, &kp.y));
    assert_ne!(kp.x.as_ref(), kp.y.as_ref());
}

#[test]
fn the_reader_preserves_the_file_order_of_descriptor_sets() {
    // §5.6: the order is the file's, not the reader's. `unsorted-sets` is
    // `several-sets` with its sets in an order §7.3's canonical writer would
    // not emit; decoding both must give the same sets in different orders.
    // A reader that normalised on decode would make these two identical, and
    // §8.2 item 3's byte-identity half would still pass — so only this test
    // tells the two designs apart.
    let key = |s: &wnft_format::DescriptorSet| {
        (
            s.kind.clone(),
            s.norm.clone(),
            s.dimensions,
            s.producer.clone(),
        )
    };

    let unsorted = decode(
        &common::read("noncanonical/unsorted-sets.wnft"),
        &DEFAULT_LIMITS,
    )
    .expect("unsorted-sets decodes");
    let canonical = decode(&common::read("valid/several-sets.wnft"), &DEFAULT_LIMITS)
        .expect("several-sets decodes");

    let as_read: Vec<_> = unsorted.target.descriptor_sets.iter().map(key).collect();
    let expected: Vec<_> = canonical.target.descriptor_sets.iter().map(key).collect();

    assert!(as_read.len() >= 2, "the fixture needs at least two sets");
    assert_ne!(
        as_read, expected,
        "the fixture must actually present its sets out of canonical order"
    );

    let mut a = as_read;
    let mut b = expected;
    a.sort();
    b.sort();
    assert_eq!(a, b, "the same sets, only in another order");
}
