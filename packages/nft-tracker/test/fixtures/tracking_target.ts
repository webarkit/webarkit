/*
 *  tracking_target.ts
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
 * The pinball target as `compile-target` builds it at its defaults, in memory:
 * keypoints and descriptors from `buildTargetFromImage`, tracking patches from
 * `selectPatches` over `buildFramePyramid` — the same 64 patches
 * `examples/targets/pinball.wnft` carries (the compile-target suite checks
 * the file's pixels against this very pyramid). Built here rather than
 * decoded from that file so recompiling it never moves the tracking suites:
 * the committed file is `crates/wnft-format/tests/real_target.rs`'s to pin.
 *
 * The four patch options are compile-target's defaults, repeated: patch size
 * 16, 64 patches, minimum score 25, spacing round(0.75 · √(512 · 640 / 64)) =
 * 54, from the first three levels (bin/compile-target.mjs).
 */

import type { CvBackend } from "@webarkit/cv-backend-spec";
import { buildFramePyramid, buildTargetFromImage, selectPatches } from "../../src/index.js";
import type { PatchTable, TargetDb } from "../../src/index.js";
import { readPgm, TARGET_FIXTURE } from "./pgm.js";

export const PINBALL_STEP = Math.cbrt(2);

let cached: PatchTable | null = null;

export function pinballPatches(): PatchTable {
    if (cached !== null) return cached;
    const built = buildFramePyramid(readPgm(TARGET_FIXTURE), {
        levels: 3,
        scaleStep: PINBALL_STEP,
    });
    if (!built.ok) throw new Error(`buildFramePyramid: ${built.reason}`);
    const selected = selectPatches(built.pyramid, {
        patchSize: 16,
        maxPatches: 64,
        minScore: 25,
        minSpacing: 54,
    });
    if (!selected.ok) throw new Error(`selectPatches: ${selected.reason}`);
    cached = selected.patches;
    return cached;
}

export function pinballTrackingTarget(cv: CvBackend): TargetDb {
    const db = buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 });
    return { ...db, patches: pinballPatches() };
}
