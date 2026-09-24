/*
 *  real_target.rs
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

//! `examples/targets/pinball.wnft` — the first **real** target both codecs read.
//!
//! Everything in `fixtures/nft-target/0.3/` is synthetic: each file was built
//! to exercise one rule, with values computed from an index so the corpus
//! reproduces byte for byte. That is exactly what a conformance corpus should
//! be, and it is also its blind spot. A synthetic file never has 2062
//! keypoints spread unevenly over eight pyramid levels, never carries ORB rows
//! a real detector produced, and never grows to a hundred kilobytes. A rule
//! that happens to hold at 20 keypoints and two levels is not thereby a rule.
//!
//! This file closes that gap with one target compiled from
//! `examples/images/pinball.jpg` by
//! `packages/nft-tracker/bin/compile-target.mjs` — the TypeScript codec's
//! writer, on the demos' own photograph. This crate reads it and never
//! produces it, the same discipline `fixtures/nft-target/README.md` sets for
//! the corpus and for the same reason: an implementation that rebuilt its own
//! input would be checking itself against itself.
//!
//! The numbers asserted below are properties of **the committed file**, not of
//! today's backend. Recompiling with a different backend, a different cap or a
//! different keypoint budget produces a different target, and this test is
//! then supposed to fail until someone says which file the repository means.

mod common;

use std::path::{Path, PathBuf};

use wnft_format::{DEFAULT_LIMITS, DescriptorData, decode, encode};

/// The compiled demo target, resolved from the crate rather than the current
/// directory. It sits under `examples/`, not under `fixtures/`: it is a demo
/// asset this suite happens to read, and adding it to the conformance corpus
/// would put a file in there that the corpus generator does not produce.
fn demo_target() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples/targets/pinball.wnft")
        .canonicalize()
        .expect("examples/targets/pinball.wnft must be present")
}

fn read_demo_target() -> Vec<u8> {
    let path = demo_target();
    std::fs::read(&path).unwrap_or_else(|e| panic!("reading {}: {e}", path.display()))
}

#[test]
fn decodes_the_compiled_pinball_target() {
    let bytes = read_demo_target();
    let decoded = decode(&bytes, &DEFAULT_LIMITS)
        .unwrap_or_else(|e| panic!("pinball.wnft must decode, got {e}"));

    // A file the canonical writer produced from a supported backend has
    // nothing for a conforming reader to warn about; anything here would mean
    // the two codecs disagree about what is ordinary.
    assert!(
        decoded.warnings.is_empty(),
        "expected no warnings, got {:?}",
        decoded.warnings
    );

    let target = decoded.target;
    assert_eq!(target.format_version, "0.3");

    // 614 x 768, capped to a 640 longer side by compile-target's `--max-side`.
    assert_eq!(target.meta.width_px, 512);
    assert_eq!(target.meta.height_px, 640);
    assert_eq!(target.meta.physical_size_mm, Some([210.0, 262.5]));

    // §5.3: meta's pixel size is level 0's.
    assert_eq!(target.pyramid.level_sizes[0], [512, 640]);
    assert_eq!(target.pyramid.level_sizes.len(), 8);
    // The cube root of 2, the step `cv-backend-jsfeatnext` uses internally.
    assert!(
        (target.pyramid.scale_step - 2f64.cbrt()).abs() < 1e-12,
        "scale_step was {}",
        target.pyramid.scale_step
    );

    let kp = target.keypoints;
    assert_eq!(kp.count, 2062);
    // FAST found them; ORB described them. The two are separate fields
    // precisely because one backend mixes detectors and descriptors like this.
    assert_eq!(kp.detector.kind, "fast");
    assert_eq!(kp.x.len(), kp.count as usize);
    assert_eq!(kp.y.len(), kp.count as usize);
    assert_eq!(kp.level.len(), kp.count as usize);

    // §5.5's level table, on a real distribution rather than a fixture's
    // hand-placed one: L + 1 entries, starting at 0, ending at N, never
    // stepping backwards, and agreeing with the per-keypoint `level`.
    assert_eq!(kp.level_start.len(), target.pyramid.level_sizes.len() + 1);
    assert_eq!(kp.level_start[0], 0);
    assert_eq!(*kp.level_start.last().expect("non-empty"), kp.count);
    for window in kp.level_start.windows(2) {
        assert!(
            window[0] <= window[1],
            "level_start must not step backwards: {window:?}"
        );
    }
    for level in 0..target.pyramid.level_sizes.len() {
        let range = kp.level_start[level] as usize..kp.level_start[level + 1] as usize;
        for i in range {
            assert_eq!(
                kp.level[i] as usize, level,
                "keypoint {i} sits in level {level}'s range but reports level {}",
                kp.level[i]
            );
        }
    }

    // One 256-bit ORB set, one row per keypoint — what `buildTargetFromImage`
    // produces until synthetic views arrive (§5.6, no multiview).
    assert_eq!(target.descriptor_sets.len(), 1);
    let set = &target.descriptor_sets[0];
    assert_eq!(set.kind, "orb");
    assert_eq!(set.norm, "hamming");
    assert_eq!(set.dimensions, 256);
    assert_eq!(set.bytes_per_descriptor, 32);
    assert_eq!(set.count, kp.count);
    assert_eq!(set.level_start.as_ref(), kp.level_start.as_ref());
    assert!(
        set.kp_index
            .iter()
            .enumerate()
            .all(|(i, &k)| k as usize == i),
        "without WKNF_multiview every row maps to its own keypoint"
    );
    match &set.data {
        DescriptorData::Bits(data) => {
            assert_eq!(
                data.len(),
                set.count as usize * set.bytes_per_descriptor as usize
            );
        }
        other => panic!("expected a `bits` set, got `{}`", other.element_type()),
    }

    // §5.7's tracking patches: compile-target's defaults, 64 patches of
    // 16 x 16 cut from the finest three levels, as it chose them for this
    // image — 63 from level 0 and one from level 1.
    let patches = target
        .patches
        .expect("compile-target writes a patches section");
    assert_eq!(patches.patch_size, 16);
    assert_eq!(patches.count, 64);
    let p = patches.patch_size as usize;
    let q = patches.count as usize;
    assert_eq!(patches.score.len(), q);
    assert_eq!(patches.left.len(), q);
    assert_eq!(patches.top.len(), q);
    assert_eq!(patches.level.len(), q);
    assert_eq!(patches.pixels.len(), q * p * p);
    let mut per_level = [0usize; 3];
    for i in 0..q {
        let level = patches.level[i] as usize;
        assert!(
            level < 3,
            "patch {i} is from level {level}, beyond --patch-levels 3"
        );
        per_level[level] += 1;
        // §5.7's bounds rule, on the level sizes this file records. The
        // decoder has already enforced it; asserting it here says the real
        // distribution reaches the edges it is allowed to and no further.
        let [w, h] = target.pyramid.level_sizes[level];
        assert!(
            patches.left[i] as usize + p <= w as usize,
            "patch {i} past the right edge"
        );
        assert!(
            patches.top[i] as usize + p <= h as usize,
            "patch {i} past the bottom edge"
        );
        // No flat patch: every one was selected for its texture.
        let window = &patches.pixels[i * p * p..(i + 1) * p * p];
        let (lo, hi) = window
            .iter()
            .fold((u8::MAX, u8::MIN), |(lo, hi), &v| (lo.min(v), hi.max(v)));
        assert!(hi > lo, "patch {i} is flat");
    }
    assert_eq!(per_level, [63, 1, 0]);
    // The compiler's selection order, and its default minimum score.
    assert!(patches.score.iter().all(|&s| s.is_finite() && s >= 25.0));
    assert!(
        patches.score.windows(2).all(|w| w[0] >= w[1]),
        "patches are stored best score first"
    );

    // Which pyramid the patches were cut from is provenance, not format: the
    // level images come from a stand-in filter until the tracker's own
    // pyramid builder exists (the specification's open question Q11). Once
    // it does, the file is recompiled, level 1's patch changes, and this
    // assertion is the one that says so.
    let compiler = target
        .info
        .as_ref()
        .and_then(|info| info.get("compiler"))
        .and_then(|c| c.as_object())
        .expect("compile-target records info.compiler");
    assert_eq!(
        compiler.get("maxPatches").and_then(|v| v.as_u64()),
        Some(64)
    );
    assert!(
        compiler
            .get("patchPyramid")
            .and_then(|v| v.as_str())
            .is_some_and(|s| s.starts_with("stand-in")),
        "patchPyramid was {:?}",
        compiler.get("patchPyramid")
    );
    // §5.7 names the score's quantity but not its units, so the `>= 25.0`
    // above means something only together with the definition the compiler
    // recorded beside it.
    assert!(
        compiler
            .get("patchScore")
            .and_then(|v| v.as_str())
            .is_some_and(|s| s.contains("level-0 px")),
        "patchScore was {:?}",
        compiler.get("patchScore")
    );
}

#[test]
fn re_encodes_the_compiled_pinball_target_conformantly() {
    // §8.2 item 4, on a real target: the `BIN\0` chunk byte-identical, the
    // manifest equal after parsing. `tests/writer.rs` makes this claim about
    // every synthetic `valid/` fixture; making it about a hundred-kilobyte
    // file a real detector produced is what says the two writers agree on
    // sizes and shapes no fixture reaches. See that file's module docs for why
    // the comparison is item 4's and not byte identity of the whole file.
    let bytes = read_demo_target();
    let decoded = decode(&bytes, &DEFAULT_LIMITS)
        .unwrap_or_else(|e| panic!("pinball.wnft must decode, got {e}"));
    let re = encode(&decoded.target)
        .unwrap_or_else(|e| panic!("pinball.wnft must re-encode, got {}", e.detail));

    let a = common::split(&re);
    let b = common::split(&bytes);
    assert_eq!(a.bin, b.bin, "the BIN chunk must be byte-identical");

    let mut am: serde_json::Value = serde_json::from_slice(&a.json).expect("manifest parses");
    let mut bm: serde_json::Value = serde_json::from_slice(&b.json).expect("manifest parses");
    common::normalize_numbers(&mut am);
    common::normalize_numbers(&mut bm);
    assert_eq!(am, bm, "the manifests must be equal after parsing");
}
