/*
 *  tracker_state_machine.test.ts
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

// NftTracker's LOST → DETECT → TRACK on synthetic sequences of the camera
// path: the pinball target at about 0.45 in 270 × 360 frames, each rendered
// by #63's generator along a motion path. Detections draw from a seeded
// RANSAC, so a whole sequence is deterministic, and every state string and
// count below is pinned exactly; errors are pinned below about 1.2–1.3 ×
// their measured value, which each test states.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions, TrackResult } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import type { TargetDb } from "../src/target/types.js";
import { trackTarget } from "../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches, pinballTrackingTarget } from "./fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";
import { project, renderWarp, view } from "./fixtures/warped_frames.js";

/** The reference device's camera path: 270 × 360 grey frames, the target at about 0.45. */
const CAMERA = { width: 270, height: 360 };
const SEED = 20260925;
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
): { frame: GrayImage; H: Mat3 } {
    const H = view({ target: image, frame: frameSize, ...pose });
    const frame = renderWarp(image, H, {
        ...frameSize,
        blurPasses: 1,
        noiseSigma: 2,
        gain: 1 + 0.08 * Math.sin(i / 5),
        bias: 6 * Math.sin(i / 7),
        seed: i + 1,
    });
    return { frame, H };
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

const smoothstep = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
};

/** Rest 10 frames, slide 260 px right over 40 (fully out past 250), stay out 6, slide back over 40, rest 10. */
function leaveAndReturn(i: number): Pose {
    const x =
        i < 10
            ? 0
            : i < 50
              ? 260 * smoothstep((i - 10) / 40)
              : i < 56
                ? 260
                : i < 96
                  ? 260 * (1 - smoothstep((i - 56) / 40))
                  : 0;
    return { scale: 0.45, angle: 0, shift: [x, 0] };
}

/** At rest for 5 frames, then moving right at `v` px/frame: the first moving frame's prediction is off by `v`. */
const velocityStep =
    (v: number) =>
    (i: number): Pose => ({ scale: 0.45, angle: 0, shift: [i < 5 ? 0 : v * (i - 4), 0] });

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
});

/** A whole path through one tracker, under one seeded RANSAC. States as "D", "T", "L". */
function run(t: TargetDb, path: (i: number) => Pose, n: number, options?: NftTrackerOptions) {
    const tracker = new NftTracker(cv, t, K, options);
    const truths: Mat3[] = [];
    const { value: results } = withSeededRandom(SEED, () =>
        Array.from({ length: n }, (_, i) => {
            const { frame, H } = frameAt(path(i), i);
            truths.push(H);
            return tracker.process(frame, i * 33);
        }),
    );
    const states = results.map((r) => r.state[0]).join("");
    return { results, truths, states };
}

/** Like `run`, but each frame gets its own freshly seeded RANSAC, so one frame can be compared with a fresh tracker's. */
function runSeededPerFrame(
    t: TargetDb,
    path: (i: number) => Pose,
    n: number,
    options?: NftTrackerOptions,
) {
    const tracker = new NftTracker(cv, t, K, options);
    return Array.from({ length: n }, (_, i) => {
        const { frame } = frameAt(path(i), i);
        const result = withSeededRandom(SEED + i, () => tracker.process(frame, i * 33)).value;
        return { frame, result };
    });
}

const patchCentres = trackTarget(pinballPatches(), PINBALL_STEP).centres;

/** RMS, frame px, over the 64 patch centres of the target, between two homographies. */
function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let i = 0; i < patchCentres.length; i += 2) {
        const [ax, ay] = project(A, patchCentres[i], patchCentres[i + 1]);
        const [bx, by] = project(B, patchCentres[i], patchCentres[i + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / (patchCentres.length / 2));
}

/** The largest distance, frame px, between where `A` and `B` put one patch centre. */
function centreMax(A: Mat3, B: Mat3): number {
    let worst = 0;
    for (let i = 0; i < patchCentres.length; i += 2) {
        const [ax, ay] = project(A, patchCentres[i], patchCentres[i + 1]);
        const [bx, by] = project(B, patchCentres[i], patchCentres[i + 1]);
        worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
    }
    return worst;
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

/** The pose error of every frame with a pose, `null` where there is none. */
function errors(results: TrackResult[], truths: Mat3[]): (number | null)[] {
    return results.map((r, i) => (r.ok ? centreRms(r.H, truths[i]) : null));
}

/** Locks a fresh tracker on the first wander frame, and returns it with its result. */
function locked(): { tracker: NftTracker; first: TrackResult } {
    const tracker = new NftTracker(cv, target, K);
    const { frame } = frameAt(wander(0), 0);
    const first = withSeededRandom(SEED, () => tracker.process(frame, 0)).value;
    return { tracker, first };
}

describe("NftTracker on camera-path sequences", () => {
    it("locks on frame 0 and tracks 39 of 39 frames of a slow wander, within 0.079 px RMS (worst 0.099)", () => {
        // Measured: the detection that locks is 0.978 px off at the patch
        // centres; tracking holds the next 39 frames to a median of 0.079 px
        // and a worst of 0.099 px, on a one-level pyramid throughout.
        const { results, truths, states } = run(target, wander, 40);
        expect(states).toBe("D" + "T".repeat(39));
        const e = errors(results, truths);
        expect(e[0]).toBeLessThan(1.2);
        const tracked = results.flatMap((r, i) => (r.state === "TRACK" ? [e[i]!] : []));
        expect(median(tracked)).toBeLessThan(0.096);
        expect(Math.max(...tracked)).toBeLessThan(0.12);
        results.forEach((r) => {
            if (r.state !== "TRACK") return;
            expect(r.tracking!.frameLevels).toBe(1);
            expect(r.sceneKeypoints.length).toBe(0);
            expect(r.trackLoss).toBeNull();
            expect(r.numMatches).toBe(r.tracking!.observed);
            expect(r.numInliers).toBe(r.tracking!.inliers);
        });
    }, 60_000);

    it("is deterministic: the same sequence gives the same states and homographies", () => {
        const a = run(target, wander, 40);
        const b = run(target, wander, 40);
        expect(b.states).toBe(a.states);
        a.results.forEach((r, i) => {
            const s = b.results[i];
            expect(s.state).toBe(r.state);
            expect(s.H === null ? null : Array.from(s.H)).toEqual(
                r.H === null ? null : Array.from(r.H),
            );
        });
    }, 60_000);

    it("in detection-only mode reproduces M1 frame by frame, carrying nothing between frames", () => {
        expect(run(target, wander, 6, { detectionOnly: true }).states).toBe("DDDDDD");
        runSeededPerFrame(target, wander, 6, { detectionOnly: true }).forEach(
            ({ frame, result }, i) => {
                const fresh = withSeededRandom(SEED + i, () =>
                    new NftTracker(cv, target, K).process(frame, i * 33),
                ).value;
                expect(result.state).toBe("DETECT");
                expect(fresh.state).toBe("DETECT");
                expect(result.numMatches).toBe(fresh.numMatches);
                expect(result.numInliers).toBe(fresh.numInliers);
                expect(Array.from(result.H!)).toEqual(Array.from(fresh.H!));
            },
        );
        const patchless = buildTargetFromImage(cv, image, { levels: 8 });
        const p = run(patchless, wander, 6);
        expect(p.states).toBe("DDDDDD");
        expect(p.results.map((r) => r.tracking)).toEqual([null, null, null, null, null, null]);
    }, 60_000);

    it("loses the target when it leaves the frame (LOST on frames 40–66), re-detects it on each of the 26 fast return frames, and tracks again from frame 93", () => {
        const { results, truths, states } = run(target, leaveAndReturn, 106);
        // A TRACK result is a pose the tracker vouches for: never one several
        // px off, whatever a detection seeded it with. Measured: at most
        // 1.196 px RMS over the patch centres, and 2.485 px at the worst one,
        // on the last frames before the target leaves, which fit the few
        // patches still in view and extrapolate to the rest — the worst is
        // at the far end, outside the frame.
        const e = errors(results, truths);
        const trackErrors = results.flatMap((r, i) => (r.state === "TRACK" ? [e[i]!] : []));
        expect(Math.max(...trackErrors)).toBeLessThan(1.5);
        const worst = results.flatMap((r, i) =>
            r.ok && r.state === "TRACK" ? [centreMax(r.H, truths[i])] : [],
        );
        expect(Math.max(...worst)).toBeLessThan(3);
        expect(states[0]).toBe("D");
        expect(states.slice(1, 10)).toBe("TTTTTTTTT");
        // The target is out of the frame from frame 47 to 58.
        expect(states.slice(47, 59)).toBe("L".repeat(12));
        // Tracking drops at frame 39, with 7 patches left in view, and that
        // frame is detected again at once.
        const firstLoss = results.findIndex((r, i) => i > 10 && r.state !== "TRACK");
        expect(firstLoss).toBe(39);
        expect(results[39].trackLoss).toBe("too-few-patches");
        // On the way back the target moves 5–10 px a frame, past what one
        // step survives, and a lock after a detection starts with no
        // velocity: every frame re-detects until the motion slows.
        expect(states).toBe(
            "D" + "T".repeat(38) + "D" + "L".repeat(27) + "D".repeat(26) + "T".repeat(13),
        );
    }, 60_000);

    it("survives a sudden velocity change of 4 px/frame; at 6 px/frame every moving frame refuses and re-detects", () => {
        // At rest for 5 frames, then moving right at v px/frame: the first
        // moving frame's prediction is v px off. Measured: every TRACK frame
        // within 0.094 px of the truth.
        const expected: [number, string][] = [
            [2, "D" + "T".repeat(14)],
            [3, "D" + "T".repeat(14)],
            [3.5, "D" + "T".repeat(14)],
            [4, "D" + "T".repeat(14)],
            [6, "DTTTT" + "D".repeat(10)],
        ];
        for (const [v, pinned] of expected) {
            const { results, truths, states } = run(target, velocityStep(v), 15);
            expect(states).toBe(pinned);
            const e = errors(results, truths);
            results.forEach((r, i) => {
                if (r.state === "TRACK") expect(e[i]!).toBeLessThan(0.12);
            });
            if (v === 6) {
                expect(results.slice(5).map((r) => r.trackLoss)).toEqual(
                    Array(10).fill("fit-failed"),
                );
            }
        }
    }, 60_000);

    it("never tracks across a change of frame size: the rotated frame is detected again", () => {
        // Locked on a 270 × 360 frame, then handed a 360 × 270 one (a phone
        // turned): the prediction, made for the other geometry, keeps 5
        // patches, and the frame is detected afresh.
        const { tracker, first } = locked();
        expect(first.state).toBe("DETECT");
        const size = { width: 360, height: 270 };
        const { frame } = frameAt(wander(1), 1, size);
        const r = withSeededRandom(SEED + 1, () => tracker.process(frame, 33)).value;
        expect(r.state).toBe("DETECT");
        expect(r.trackLoss).toBe("too-few-patches");
        expect(r.tracking!.observed).toBe(5);
    }, 60_000);

    it("loses a covered lens, then re-detects on the next real frame", () => {
        const { tracker } = locked();
        const flat: GrayImage = {
            ...CAMERA,
            data: new Uint8Array(CAMERA.width * CAMERA.height).fill(128),
        };
        const covered = withSeededRandom(SEED, () => tracker.process(flat, 33)).value;
        expect(covered.state).toBe("LOST");
        expect(covered.trackLoss).toBe("too-few-patches");
        expect(covered.tracking!.lost).toBe(covered.tracking!.attempted);
        if (!covered.ok) expect(covered.reason).toBe("too-few-matches");
        const { frame } = frameAt(wander(2), 2);
        const again = withSeededRandom(SEED, () => tracker.process(frame, 66)).value;
        expect(again.state).toBe("DETECT");
    }, 60_000);

    it("refuses a frame that is not a GrayImage while locked, with a RangeError", () => {
        const { tracker, first } = locked();
        expect(first.state).toBe("DETECT");
        const bad: GrayImage = { data: new Uint8Array(10), width: 270, height: 360 };
        expect(() => tracker.process(bad, 33)).toThrow(RangeError);
    }, 60_000);

    it("tracks a frame whose buffer is longer than width × height, reading its first w · h bytes as the backend does", () => {
        // Found in review: GrayImage does not fix data.length, and the
        // reference backend reads the first w · h bytes of a longer buffer —
        // a pooled one, say — so such a frame detected, and the next, locked,
        // threw. The same frame padded tracks exactly as it does unpadded.
        const padded = (frame: GrayImage): GrayImage => {
            const data = new Uint8Array(frame.width * frame.height + 16).fill(255);
            data.set(frame.data);
            return { ...frame, data };
        };
        const { frame: f0 } = frameAt(wander(0), 0);
        const { frame: f1 } = frameAt(wander(1), 1);
        const plain = new NftTracker(cv, target, K);
        const longer = new NftTracker(cv, target, K);
        for (const [i, f] of [f0, f1].entries()) {
            const a = withSeededRandom(SEED, () => plain.process(f, 33 * i)).value;
            const b = withSeededRandom(SEED, () => longer.process(padded(f), 33 * i)).value;
            expect(b).toEqual(a);
        }
        const last = withSeededRandom(SEED, () => longer.process(padded(f1), 66)).value;
        expect(last.state).toBe("TRACK");
    }, 60_000);
});
