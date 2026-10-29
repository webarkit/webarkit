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
import { pinballTrackingTarget } from "../ground-truth/fixtures/tracking_target.js";
import { withSeededRandom } from "../ground-truth/fixtures/seeded_rng.js";
import {
    CAMERA,
    centreMax,
    centreRms,
    frameAt,
    image,
    inView,
    leaveAndReturn,
    run as runPath,
    SEED,
    shippedLeaveAndReturn,
    shippedTarget,
    shippedVelocitySteps,
    shippedWander,
    velocityStep,
    wander,
} from "../ground-truth/tracker_sequences.js";
import type { Pose } from "../ground-truth/tracker_sequences.js";

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
});

/** `run` on this file's backend and K. */
const run = (t: TargetDb, path: (i: number) => Pose, n: number, options?: NftTrackerOptions) =>
    runPath(cv, K, t, path, n, options);

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

    it("loses the target when it leaves the frame (LOST on frames 39–66), detects on each of the 26 fast return frames and locks on 25, refusing frame 68's 4-inlier fit (#137), and tracks again from frame 93", () => {
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
        // frame is detected again at once. The detection is a 4-inlier fit,
        // which detectTarget refuses (#137), so the frame is LOST; so is
        // frame 68's. Measured before the gate, the two fits were 193.7 and
        // 255.7 px RMS from the true homography.
        const firstLoss = results.findIndex((r, i) => i > 10 && r.state !== "TRACK");
        expect(firstLoss).toBe(39);
        expect(results[39].trackLoss).toBe("too-few-patches");
        // On the way back the target moves 5–10 px a frame, past what one
        // step survives, and a lock after a detection starts with no
        // velocity: every frame re-detects until the motion slows.
        expect(states).toBe(
            "D" + "T".repeat(38) + "L".repeat(28) + "DL" + "D".repeat(24) + "T".repeat(13),
        );
        for (const i of [39, 68]) {
            const r = results[i];
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe("too-few-inliers");
            expect(r.numInliers).toBe(4);
        }
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

    it("makes a minimal detection LOST with no lock (too-few-inliers), and locks on one of 5 inliers (#137)", () => {
        // The backend's own fit, its inlier mask cut to the first `k`: the
        // homography is right, only the count is minimal.
        const cutTo = (k: number) => {
            let calls = 0;
            const backend = new Proxy(cv, {
                get: (t, p) =>
                    p === "estimateHomography"
                        ? (...a: Parameters<CvBackend["estimateHomography"]>) => {
                              calls++;
                              const h = t.estimateHomography(...a);
                              if (!h.ok) return h;
                              const inliers = new Uint8Array(h.inliers.length);
                              for (let i = 0, kept = 0; i < inliers.length && kept < k; i++) {
                                  if (h.inliers[i]) {
                                      inliers[i] = 1;
                                      kept++;
                                  }
                              }
                              return { ...h, inliers, numInliers: k };
                          }
                        : Reflect.get(t, p),
            });
            return { backend, calls: () => calls };
        };
        const { frame: f0 } = frameAt(wander(0), 0);
        const { frame: f1 } = frameAt(wander(1), 1);

        const four = cutTo(4);
        const t4 = new NftTracker(four.backend, target, K);
        const r0 = withSeededRandom(SEED, () => t4.process(f0, 0)).value;
        expect(r0.state).toBe("LOST");
        expect(r0.ok).toBe(false);
        if (!r0.ok) expect(r0.reason).toBe("too-few-inliers");
        expect(r0.numInliers).toBe(4);
        expect(r0.H).toBeNull();
        expect(r0.pose).toBeNull();
        const r1 = withSeededRandom(SEED, () => t4.process(f1, 33)).value;
        expect(r1.state).not.toBe("TRACK");
        expect(four.calls()).toBe(2); // no lock: frame 1 detected again

        const five = cutTo(5);
        const t5 = new NftTracker(five.backend, target, K);
        expect(withSeededRandom(SEED, () => t5.process(f0, 0)).value.state).toBe("DETECT");
        expect(withSeededRandom(SEED, () => t5.process(f1, 33)).value.state).toBe("TRACK");
        expect(five.calls()).toBe(1); // locked: frame 1 tracked, no detection
    }, 60_000);
});

// #90's ground-truth sequences on the shipped target are defined in
// ground-truth/tracker_sequences.ts, with their paths, their true homographies
// and the error measures; what they return is asserted here.
describe("the shipped target, examples/targets/pinball.wnft, on ground truth", () => {
    let shipped: TargetDb;

    beforeAll(() => {
        shipped = shippedTarget();
    });

    it("is the default's target: 48 patches of 16 × 16, 47 of level 0 and one of level 1", () => {
        const p = shipped.patches!;
        expect([p.count, p.patchSize]).toEqual([48, 16]);
        expect([0, 1, 2].map((l) => p.level.filter((x) => x === l).length)).toEqual([47, 1, 0]);
    });

    it("leaves and returns as the fixture does, extrapolating up to 3.4 px RMS (8.2 at the far point) while the part in view stays within 0.36 px", () => {
        // Measured: the same states as the fixture's run; on frames 36–38,
        // with 9–11 inliers left, 3.01 / 3.37 / 3.25 px RMS over the whole
        // target (worst point 7.37 / 8.24 / 7.65), 0.34–0.36 in view (worst
        // 0.72). Every other TRACK frame is within 0.55 px RMS.
        const { results, truths, states } = shippedLeaveAndReturn(cv, K);
        // Frames 39 and 68 are 4-inlier detections, refused (#137).
        expect(states).toBe(
            "D" + "T".repeat(38) + "L".repeat(28) + "DL" + "D".repeat(24) + "T".repeat(13),
        );
        for (const i of [39, 68]) {
            const r = results[i];
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe("too-few-inliers");
            expect(r.numInliers).toBe(4);
        }
        const tracked = results.flatMap((r, i) => (r.state === "TRACK" ? [i] : []));
        const whole = tracked.map((i) => centreRms(results[i].H!, truths[i]));
        const worst = tracked.map((i) => centreMax(results[i].H!, truths[i]));
        const seen = tracked.map((i) => inView(results[i].H!, truths[i]));
        expect(Math.max(...whole)).toBeLessThan(4.2);
        expect(Math.max(...worst)).toBeLessThan(10.3);
        expect(Math.max(...seen.map((e) => e.rms))).toBeLessThan(0.45);
        expect(Math.max(...seen.map((e) => e.max))).toBeLessThan(0.9);
        // The extrapolation is confined to the frames that fit few patches.
        const far = tracked.filter((_, k) => whole[k] > 1.5);
        expect(far).toEqual([36, 37, 38]);
    }, 60_000);

    it("tracks a slow wander as the fixture does, within 0.11 px RMS (worst point 0.35)", () => {
        const { results, truths, states } = shippedWander(cv, K);
        expect(states).toBe("D" + "T".repeat(39));
        const tracked = results.flatMap((r, i) => (r.state === "TRACK" ? [i] : []));
        expect(Math.max(...tracked.map((i) => centreRms(results[i].H!, truths[i])))).toBeLessThan(
            0.14,
        );
        expect(Math.max(...tracked.map((i) => centreMax(results[i].H!, truths[i])))).toBeLessThan(
            0.44,
        );
    }, 60_000);

    it("survives a velocity change of 4 px/frame; from 5 px/frame every moving frame re-detects (the fixture tracks 5)", () => {
        const expected: [number, string][] = [
            [2, "D" + "T".repeat(14)],
            [3, "D" + "T".repeat(14)],
            [4, "D" + "T".repeat(14)],
            [5, "DTTTT" + "D".repeat(10)],
            [6, "DTTTT" + "D".repeat(10)],
        ];
        const runs = shippedVelocitySteps(cv, K);
        for (const [v, pinned] of expected) {
            const { results, truths, states } = runs.find((r) => r.v === v)!;
            expect(states).toBe(pinned);
            results.forEach((r, i) => {
                if (r.state === "TRACK") expect(centreRms(r.H!, truths[i])).toBeLessThan(0.13);
            });
        }
    }, 60_000);
});
