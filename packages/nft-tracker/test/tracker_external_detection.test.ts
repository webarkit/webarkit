/*
 *  tracker_external_detection.test.ts
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

// External detection (M3): `process` consuming a Detection computed
// elsewhere, and the `externalDetection` mode in which the tracker never
// detects itself. Every test is synchronous: "elsewhere" is this file, which
// calls `detectTarget` on one frame and hands the result to a later `process`
// call, the way a worker's message would arrive. RANSAC draws only inside
// `detectTarget`, under a seed; the tracker's own calls draw nothing, and the
// tests say so. The frames are the camera path of tracker_state_machine.test.ts,
// whose helpers are copied here rather than imported, so that file stays
// exactly as M2 left it.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import { detectTarget, prepareDetection } from "../src/detection.js";
import type { Detection, DetectionSetup } from "../src/detection.js";
import type { TargetDb } from "../src/target/types.js";
import { pinballTrackingTarget } from "./fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";
import { renderWarp, view } from "./fixtures/warped_frames.js";

/** The reference device's camera path: 270 × 360 grey frames, the target at about 0.45. */
const CAMERA = { width: 270, height: 360 };
const SEED = 20260927;
const image = readPgm(TARGET_FIXTURE);

interface Pose {
    scale: number;
    angle: number;
    shift: [number, number];
    perspective?: [number, number];
}

/** One frame of a path: #63's generator, one pass of blur, σ = 2 noise, a drifting exposure. */
function frameAt(
    pose: Pose,
    i: number,
    frameSize: { width: number; height: number } = CAMERA,
): GrayImage {
    const H = view({ target: image, frame: frameSize, ...pose });
    return renderWarp(image, H, {
        ...frameSize,
        blurPasses: 1,
        noiseSigma: 2,
        gain: 1 + 0.08 * Math.sin(i / 5),
        bias: 6 * Math.sin(i / 7),
        seed: i + 1,
    });
}

/** A slow hand-held wander that starts at rest: shift ≤ 20 px, 10° of roll, ±6% scale, mild tilt. */
function wander(i: number): Pose {
    const c = (period: number) => 1 - Math.cos(i / period);
    return {
        scale: 0.45 + 0.03 * c(7),
        angle: ((5 * Math.PI) / 180) * c(11),
        shift: [10 * c(8), 8 * c(10)],
        perspective: [0.0003 * c(9), -0.0002 * c(13)],
    };
}

/** A lens covered: every pixel 128. */
const flat: GrayImage = { ...CAMERA, data: new Uint8Array(CAMERA.width * CAMERA.height).fill(128) };

/**
 * The backend behind a Proxy that counts every method call by name, so a
 * test can say which backend calls a frame made — none on a waiting frame,
 * one (the pose) on a tracked one.
 */
function countingBackend(cv: CvBackend): { cv: CvBackend; calls: Record<string, number> } {
    const calls: Record<string, number> = {};
    const proxied = new Proxy(cv, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
                const name = String(property);
                calls[name] = (calls[name] ?? 0) + 1;
                return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
        },
    });
    return { cv: proxied, calls };
}

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;
let setup: DetectionSetup;
let f0: GrayImage;
let f1: GrayImage;
let f2: GrayImage;
/** A detection of `f0`, at timestamp 0, under `SEED`. */
let d0: Detection;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
    setup = prepareDetection(cv, target);
    f0 = frameAt(wander(0), 0);
    f1 = frameAt(wander(1), 1);
    f2 = frameAt(wander(2), 2);
    d0 = withSeededRandom(SEED, () => detectTarget(cv, setup, f0, 0)).value;
    if (!d0.ok) throw new Error(`fixture: frame 0 did not detect (${d0.reason})`);
});

/** An external-mode tracker on a counting backend. */
function external(options: { detectionOnly?: boolean } = {}) {
    const counted = countingBackend(cv);
    const tracker = new NftTracker(counted.cv, target, K, { externalDetection: true, ...options });
    return { tracker, calls: counted.calls };
}

describe("NftTracker with a detection handed in (M3)", () => {
    it("external mode: a frame without a lock and without a detection is LOST no-detection, needsDetection true, and makes no backend call", () => {
        const { tracker, calls } = external();
        const r = tracker.process(f0, 0);
        expect(r.ok).toBe(false);
        expect(r.state).toBe("LOST");
        if (r.ok) return;
        expect(r.reason).toBe("no-detection");
        expect(r.needsDetection).toBe(true);
        expect(r.detectionUse).toBe("none");
        expect(r.detectionLatencyMs).toBeNull();
        expect(r.numMatches).toBe(0);
        expect(r.numInliers).toBe(0);
        expect(r.sceneKeypoints).toEqual([]);
        expect(r.trackLoss).toBeNull();
        expect(r.tracking).toBeNull();
        expect(r.quality).toBe(0);
        expect(calls).toEqual({});
    });

    it("consumes a detection of frame 0 on frame 1 and confirms it on that frame: TRACK, latency 33 ms, one backend call (the pose)", () => {
        const { tracker, calls } = external();
        tracker.process(f0, 0);
        const r = tracker.process(f1, 33, d0);
        expect(r.state).toBe("TRACK");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.detectionUse).toBe("consumed");
        expect(r.detectionLatencyMs).toBe(33);
        expect(r.needsDetection).toBe(false);
        expect(r.trackLoss).toBeNull();
        expect(r.tracking).not.toBeNull();
        expect(r.numMatches).toBe(r.tracking!.observed);
        expect(r.sceneKeypoints).toEqual(d0.sceneKeypoints);
        expect(r.timestampMs).toBe(33);
        expect(calls).toEqual({ poseFromHomography: 1 });
    });

    it("refuses a detection the confirming step cannot carry: LOST unconfirmed, with the step's loss and the detection's counts", () => {
        const { tracker, calls } = external();
        const r = tracker.process(flat, 33, d0);
        expect(r.ok).toBe(false);
        expect(r.state).toBe("LOST");
        if (r.ok) return;
        expect(r.reason).toBe("unconfirmed");
        expect(r.trackLoss).toBe("too-few-patches");
        expect(r.tracking!.lost).toBe(r.tracking!.attempted);
        expect(r.numMatches).toBe(d0.numMatches);
        expect(r.numInliers).toBe(d0.numInliers);
        expect(r.sceneKeypoints).toEqual(d0.sceneKeypoints);
        expect(r.needsDetection).toBe(true);
        expect(r.detectionUse).toBe("consumed");
        expect(r.detectionLatencyMs).toBe(33);
        expect(calls).toEqual({});
    });

    it("refuses a detection across a change of frame size without throwing", () => {
        // A phone turned between the detected frame and this one: the
        // prediction, made for the other geometry, keeps too few patches.
        const turned = frameAt(wander(1), 1, { width: 360, height: 270 });
        const { tracker } = external();
        const r = tracker.process(turned, 33, d0);
        expect(r.state).toBe("LOST");
        if (r.ok) return;
        expect(r.reason).toBe("unconfirmed");
        expect(r.trackLoss).toBe("too-few-patches");
    });

    it("returns a failed detection as LOST with its own reason and counts, needsDetection true, no backend call", () => {
        const failed = withSeededRandom(SEED, () => detectTarget(cv, setup, flat, 0)).value;
        expect(failed.ok).toBe(false);
        if (failed.ok) return;
        const { tracker, calls } = external();
        const r = tracker.process(f1, 33, failed);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe(failed.reason);
        expect(r.numMatches).toBe(failed.numMatches);
        expect(r.numInliers).toBe(failed.numInliers);
        expect(r.sceneKeypoints).toEqual(failed.sceneKeypoints);
        expect(r.needsDetection).toBe(true);
        expect(r.detectionUse).toBe("consumed");
        expect(r.detectionLatencyMs).toBe(33);
        expect(r.tracking).toBeNull();
        expect(r.trackLoss).toBeNull();
        expect(calls).toEqual({});
    });

    it("ignores a detection handed in while the lock holds: TRACK, detectionUse ignored, latency null", () => {
        const { tracker } = external();
        tracker.process(f0, 0);
        expect(tracker.process(f1, 33, d0).state).toBe("TRACK");
        const r = tracker.process(f2, 66, d0);
        expect(r.state).toBe("TRACK");
        expect(r.detectionUse).toBe("ignored");
        expect(r.detectionLatencyMs).toBeNull();
        expect(r.needsDetection).toBe(false);
    });

    it("a frame that drops its lock and consumes a detection reports the confirming step, not the first", () => {
        // The lock drops on the covered lens; the failed detection handed in
        // with it is consumed, and the result is the detection's.
        const failed = withSeededRandom(SEED, () => detectTarget(cv, setup, flat, 66)).value;
        const a = external();
        a.tracker.process(f0, 0);
        expect(a.tracker.process(f1, 33, d0).state).toBe("TRACK");
        const r = a.tracker.process(flat, 66, failed);
        expect(r.state).toBe("LOST");
        if (r.ok) return;
        expect(r.reason).toBe("too-few-matches");
        expect(r.trackLoss).toBe("too-few-patches");
        expect(r.detectionUse).toBe("consumed");
        expect(r.detectionLatencyMs).toBe(0);
        expect(r.needsDetection).toBe(true);

        // The lock drops on a 25 px jump; the detection of that very frame,
        // handed in with it, is confirmed by a second step on the same frame.
        const jumped = renderWarp(
            image,
            view({ target: image, frame: CAMERA, scale: 0.45, shift: [25, 0] }),
            { ...CAMERA, blurPasses: 1, noiseSigma: 2, seed: 3 },
        );
        const dJumped = withSeededRandom(SEED, () => detectTarget(cv, setup, jumped, 66)).value;
        expect(dJumped.ok).toBe(true);
        const b = external();
        b.tracker.process(f0, 0);
        expect(b.tracker.process(f1, 33, d0).state).toBe("TRACK");
        const s = b.tracker.process(jumped, 66, dJumped);
        expect(s.state).toBe("TRACK");
        expect(s.trackLoss).toBeNull();
        expect(s.detectionUse).toBe("consumed");
        expect(s.detectionLatencyMs).toBe(0);
        expect(s.tracking!.observed).toBeGreaterThanOrEqual(8);
    });

    it("default mode consumes a handed-in detection too, and does not detect again itself", () => {
        const counted = countingBackend(cv);
        const tracker = new NftTracker(counted.cv, target, K);
        const r = tracker.process(f1, 33, d0);
        expect(r.state).toBe("TRACK");
        expect(r.detectionUse).toBe("consumed");
        expect(r.detectionLatencyMs).toBe(33);
        expect(r.needsDetection).toBe(false);
        expect(counted.calls).toEqual({ poseFromHomography: 1 });
    });

    it("detection-only external mode returns a consumed detection as DETECT, unconfirmed, and always needs one", () => {
        const { tracker, calls } = external({ detectionOnly: true });
        expect(tracker.detectionOnly).toBe(true);
        const r = tracker.process(f1, 33, d0);
        expect(r.state).toBe("DETECT");
        expect(r.ok).toBe(true);
        if (!r.ok || !d0.ok) return;
        expect(Array.from(r.H)).toEqual(Array.from(d0.H));
        expect(r.quality).toBe(d0.numInliers / d0.numMatches);
        expect(r.numMatches).toBe(d0.numMatches);
        expect(r.sceneKeypoints).toEqual(d0.sceneKeypoints);
        expect(r.needsDetection).toBe(true);
        expect(r.detectionUse).toBe("consumed");
        expect(r.detectionLatencyMs).toBe(33);
        expect(r.tracking).toBeNull();
        expect(calls).toEqual({ poseFromHomography: 1 });
        const next = tracker.process(f2, 66);
        expect(next.state).toBe("LOST");
        if (next.ok) return;
        expect(next.reason).toBe("no-detection");
        expect(next.needsDetection).toBe(true);
    });

    it("draws nothing from Math.random on any frame in external mode", () => {
        const { tracker } = external();
        expect(withSeededRandom(SEED, () => tracker.process(f0, 0)).draws).toBe(0);
        expect(withSeededRandom(SEED, () => tracker.process(f1, 33, d0)).draws).toBe(0);
        expect(withSeededRandom(SEED, () => tracker.process(f2, 66)).draws).toBe(0);
    });
});
