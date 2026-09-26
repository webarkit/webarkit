/*
 *  tracker_options.test.ts
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

// NftTracker's M2 surface: its options and their domains, which mode it runs
// in, the fields every result carries, and the state machine's three moves —
// a detection locks, a lock tracks, and a frame that loses it is detected
// again at once. The pinned sequences are in tracker_state_machine.test.ts.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions, TrackResult } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import type { TargetDb } from "../src/target/types.js";
import { pinballPatches, pinballTrackingTarget } from "./fixtures/tracking_target.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";
import { renderWarp, view } from "./fixtures/warped_frames.js";

/** The reference device's camera path: 270 × 360 grey frames, the target at 0.45. */
const CAMERA = { width: 270, height: 360 };
const image = readPgm(TARGET_FIXTURE);

let cv: CvBackend;
let tracked: TargetDb;
let K: Mat3;
/** Two renders of one camera-path view, differing only in their noise. */
let still: [GrayImage, GrayImage];

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    tracked = pinballTrackingTarget(cv);
    K = intrinsics(CAMERA.width, CAMERA.height);
    const H = view({ target: image, frame: CAMERA, scale: 0.45 });
    const render = (seed: number) =>
        renderWarp(image, H, { ...CAMERA, blurPasses: 1, noiseSigma: 2, seed });
    still = [render(1), render(2)];
});

/** Every frame through one tracker, under one seeded RANSAC. */
function run(tracker: NftTracker, frames: readonly GrayImage[]): TrackResult[] {
    return withSeededRandom(1, () => frames.map((f, i) => tracker.process(f, i * 33))).value;
}

describe("NftTracker options (M2)", () => {
    it.each<[keyof NftTrackerOptions, unknown]>([
        ["maxFrameLevels", 0],
        ["maxFrameLevels", 257],
        ["maxFrameLevels", 1.5],
        ["alignMaxIterations", 0],
        ["alignEpsilon", 0],
        ["alignEpsilon", Infinity],
        ["tukeyC", -1],
        ["tukeyC", Number.NaN],
        ["fitMaxIterations", 0],
        ["fitEpsilon", 0],
        ["minTrackedPatches", 3],
        ["minTrackedPatches", 8.5],
        ["maxOutlierShare", -0.1],
        ["maxOutlierShare", 1],
        ["maxFitRms", 0],
        ["maxFitRms", Number.NaN],
        ["minPatchZncc", -0.1],
        ["minPatchZncc", 1],
        ["photometric", "yes"],
        ["detectionOnly", 1],
        ["clock", 42],
    ])("refuses %s = %s at construction, naming it", (name, value) => {
        const options = { [name]: value } as NftTrackerOptions;
        expect(() => new NftTracker(cv, tracked, K, options)).toThrow(RangeError);
        expect(() => new NftTracker(cv, tracked, K, options)).toThrow(new RegExp(name));
    });

    it("tracks a target with patches by default", () => {
        expect(new NftTracker(cv, tracked, K).detectionOnly).toBe(false);
    });

    it("is detection-only when asked, or when the target cannot be tracked (§5.7)", () => {
        const patchless = buildTargetFromImage(cv, image, { levels: 8 });
        const p = pinballPatches();
        const seven = {
            ...p,
            count: 7,
            score: p.score.subarray(0, 7),
            left: p.left.subarray(0, 7),
            top: p.top.subarray(0, 7),
            level: p.level.subarray(0, 7),
            pixels: p.pixels.subarray(0, 7 * 256),
        };
        const tiny = { ...p, patchSize: 2, pixels: p.pixels.subarray(0, 64 * 4) };
        expect(new NftTracker(cv, tracked, K, { detectionOnly: true }).detectionOnly).toBe(true);
        expect(new NftTracker(cv, patchless, K).detectionOnly).toBe(true);
        expect(new NftTracker(cv, { ...tracked, patches: seven }, K).detectionOnly).toBe(true);
        expect(new NftTracker(cv, { ...tracked, patches: tiny }, K).detectionOnly).toBe(true);
    });

    it("carries the M2 fields on an M1-shaped result: null tracking, null trackLoss, no timings without a clock", () => {
        const scene = readPgm(SCENE_FIXTURE);
        const { value: r } = withSeededRandom(1, () =>
            new NftTracker(cv, tracked, intrinsics(scene.width, scene.height), {
                maxSceneKeypoints: 900,
            }).process(scene, 0),
        );
        expect(r.state).toBe("DETECT");
        expect(r.trackLoss).toBeNull();
        expect(r.tracking).toBeNull();
        expect(r.timings).toBeNull();
    });
});

describe("NftTracker state machine (M2)", () => {
    it("locks on a detection and tracks the next frame: DETECT, then TRACK", () => {
        const [a, b] = run(new NftTracker(cv, tracked, K), still);
        expect(a.state).toBe("DETECT");
        expect(b.state).toBe("TRACK");
        expect(b.ok).toBe(true);
        if (!b.ok) return;
        expect(b.trackLoss).toBeNull();
        expect(b.tracking).not.toBeNull();
        expect(b.tracking!.frameLevels).toBe(1);
        expect(b.numMatches).toBe(b.tracking!.observed);
        expect(b.numInliers).toBe(b.tracking!.inliers);
        expect(b.sceneKeypoints).toEqual([]);
        expect(b.pose.R.length).toBe(9);
    });

    it("in detection-only mode, detects every frame and tracks none", () => {
        const results = run(new NftTracker(cv, tracked, K, { detectionOnly: true }), still);
        expect(results.map((r) => r.state)).toEqual(["DETECT", "DETECT"]);
        expect(results.map((r) => r.tracking)).toEqual([null, null]);
    });

    it("detects again at once on a frame that loses the lock, and says why", () => {
        const flat: GrayImage = {
            ...CAMERA,
            data: new Uint8Array(CAMERA.width * CAMERA.height).fill(128),
        };
        const [locked, covered, again] = run(new NftTracker(cv, tracked, K), [
            still[0],
            flat,
            still[1],
        ]);
        expect(locked.state).toBe("DETECT");
        // The lens covered: every patch lost, the lock dropped, and the
        // same frame's detection finds nothing.
        expect(covered.state).toBe("LOST");
        expect(covered.trackLoss).toBe("too-few-patches");
        expect(covered.tracking!.lost).toBe(covered.tracking!.attempted);
        // No lock survives a LOST frame: the next one detects.
        expect(again.state).toBe("DETECT");
        expect(again.trackLoss).toBeNull();
        expect(again.tracking).toBeNull();
    });

    it("re-detects on the same frame when a jump outruns tracking and the target is still in view", () => {
        // 25 px between two frames: far past the ~3.5 px a tracking step
        // survives, well inside the frame.
        const jumped = renderWarp(
            image,
            view({ target: image, frame: CAMERA, scale: 0.45, shift: [25, 0] }),
            { ...CAMERA, blurPasses: 1, noiseSigma: 2, seed: 3 },
        );
        const [locked, found] = run(new NftTracker(cv, tracked, K), [still[0], jumped]);
        expect(locked.state).toBe("DETECT");
        expect(found.state).toBe("DETECT");
        expect(found.trackLoss).not.toBeNull();
        expect(found.tracking).not.toBeNull();
        expect(found.sceneKeypoints.length).toBeGreaterThan(0);
    });

    it("times each frame with an injected clock, detection and tracking apart, and reads none of its own", () => {
        const tracker = new NftTracker(cv, tracked, K, { clock: () => performance.now() });
        const [detected, trackedFrame] = run(tracker, still);
        const d = detected.timings!;
        expect(d.detectMs).toBeGreaterThan(0);
        expect(d.detectMs).toBeLessThanOrEqual(d.totalMs);
        expect([d.trackMs, d.pyramidMs, d.alignMs, d.fitMs]).toEqual([0, 0, 0, 0]);
        const t = trackedFrame.timings!;
        expect(t.detectMs).toBe(0);
        expect(t.trackMs).toBeGreaterThan(0);
        expect(t.pyramidMs + t.alignMs + t.fitMs).toBeLessThanOrEqual(t.trackMs);
        expect(t.trackMs).toBeLessThanOrEqual(t.totalMs);
    });
});
