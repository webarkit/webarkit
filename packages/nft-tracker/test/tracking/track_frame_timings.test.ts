/*
 *  track_frame_timings.test.ts
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

// Where trackFrame's clock readings go. Found in review (webarkit/webarkit#66):
// alignMs also timed frameLevelsFor, which chooses the pyramid's depth and is
// neither alignment nor pyramid building. The two tracking modules the step
// calls are wrapped so the injected clock advances only inside them — by 1
// in each patch's preparePatch (the warp, alignPatch's first half) and by
// 1000 in frameLevelsFor — so every timing field is exact.

import { describe, it, expect, vi } from "vitest";
import { trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions } from "../../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { renderWarp, view } from "../fixtures/warped_frames.js";

const time = vi.hoisted(() => ({ now: 0 }));

vi.mock("../../src/tracking/frame_levels.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/tracking/frame_levels.js")>();
    return {
        ...actual,
        frameLevelsFor: (...args: Parameters<typeof actual.frameLevelsFor>) => {
            time.now += 1000;
            return actual.frameLevelsFor(...args);
        },
    };
});

vi.mock("../../src/tracking/align_patch.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/tracking/align_patch.js")>();
    return {
        ...actual,
        preparePatch: (...args: Parameters<typeof actual.preparePatch>) => {
            time.now += 1;
            return actual.preparePatch(...args);
        },
    };
});

const OPTIONS: TrackFrameOptions = {
    maxFrameLevels: 4,
    align: { maxIterations: 30, epsilon: 0.01, photometric: true },
    fit: { maxIterations: 20, tukeyC: 4, epsilon: 1e-6 },
    minTrackedPatches: 8,
    maxOutlierShare: 0.45,
    maxFitRms: 0.6,
    minPatchZncc: 0.6,
};

describe("trackFrame's timings", () => {
    it("count each patch's warp as alignment, and the choice of pyramid depth in trackMs only", () => {
        const image = readPgm(TARGET_FIXTURE);
        const target = trackTarget(pinballPatches(), PINBALL_STEP);
        const CAMERA = { width: 270, height: 360 };
        const H = view({ target: image, frame: CAMERA, scale: 0.45 });
        const frame = renderWarp(image, H, { ...CAMERA, blurPasses: 1, noiseSigma: 2, seed: 3 });
        time.now = 0;
        const r = trackFrame(frame, target, null, H, OPTIONS, () => time.now);
        expect(r.ok).toBe(true);
        expect(r.stats.attempted).toBe(64);
        expect(r.timings).toEqual({ trackMs: 1064, pyramidMs: 0, alignMs: 64, fitMs: 0 });
    });
});
