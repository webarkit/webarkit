/*
 *  frame_levels.ts
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

/**
 * How many levels the live frame's pyramid needs this frame.
 *
 * `alignPatch` starts a patch on the level where one patch pixel is closest to
 * one level pixel, among the levels that hold its window, and refines on
 * finer ones only; it never reads a level coarser than its start. So a
 * pyramid deeper than the deepest start level is built and never read. This
 * function asks `alignPatch`'s own choice ({@link alignmentStart}) for every
 * candidate, prepared at the prediction, over the `maxLevels`-level pyramid
 * the frame would have, and returns one more than the deepest start — so
 * `alignPatch` starts every candidate on the pyramid this returns where it
 * would on the deeper one, and aligns it identically (frame_levels.test.ts
 * checks both, bit for bit, on two views and across a frame edge). The
 * windows it reads are the ones the alignment then uses, warped once.
 *
 * Which levels hold a window is not monotone in depth, which is why the
 * choice is asked rather than estimated from the scale alone: each level's
 * size is rounded down, so near the right or bottom edge a coarser level can
 * hold a window a finer one cannot, and a patch seen larger than its scale
 * (`σ > √r`) is read on level 0 through footprints that reach further than
 * its window. A first version sized the pyramid by the scale alone; in
 * review, as a target seen at σ ≈ 1.13–1.3 crossed the edge of a 640 × 480
 * frame, it lost 6 to 60 of 63,000–75,000 patch alignments (5–7 distinct
 * patches), none of them enough to lose the pose.
 *
 * What it saves, measured: pinball's compiled patches are all level 0, and on
 * the 270 × 360 camera path the target appears at about half its compiled
 * size, so every one starts — and ends — on frame level 0, and one level is
 * all it needs: the frame itself, by reference, nothing computed. Four levels
 * cost 1.85 ms in Node here, an estimated 5.6–7.5 ms on the reference device
 * (docs/benchmarks/README.md), and align those patches bit-identically.
 *
 * What building fewer levels than this would cost: a patch seen larger than
 * its own scale (σ > √r) then starts on level 0, read through footprints from
 * the first iteration — measured at σ = 2 as 61% rather than 65% converging
 * from 12 px off and 35% rather than 40% from 16 px, with every iteration
 * paying the footprint's samples (`startLevel`'s notes) — or, at an edge,
 * on no level at all.
 */

import type { PreparedPatch } from "./align_patch.js";
import { alignmentStart } from "./align_patch.js";
import { pyramidScales } from "./frame_pyramid.js";

/**
 * @param prepared       The patches that will be aligned this frame, each
 *                       prepared at the prediction (`preparePatch`); a failed
 *                       one reads no level and is skipped.
 * @param frameScaleStep The frame pyramid's step.
 * @param frame          The frame's size.
 * @param maxLevels      Upper bound, an integer in `[1, 256]`.
 */
export function frameLevelsFor(
    prepared: readonly PreparedPatch[],
    frameScaleStep: number,
    frame: { readonly width: number; readonly height: number },
    maxLevels: number,
): number {
    // A large step's deepest scales underflow to 0; the levels before them
    // are the only ones that can hold anything, and still count.
    let count = maxLevels;
    let scales = pyramidScales(frameScaleStep, count);
    while (scales === null && count > 1) scales = pyramidScales(frameScaleStep, --count);
    if (scales === null) return 1;
    const shape = {
        scaleStep: frameScaleStep,
        levels: Array.from(scales, (s) => ({
            width: (frame.width * s) | 0,
            height: (frame.height * s) | 0,
        })),
    };
    let deepest = 0;
    for (const p of prepared) {
        if (!p.ok) continue;
        const start = alignmentStart(shape, scales, p);
        if (start > deepest) deepest = start;
    }
    return deepest + 1;
}
