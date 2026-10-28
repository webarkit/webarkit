/*
 *  tracker_sequences.ts
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

// #90's ground-truth sequences: NftTracker on camera paths of the pinball
// target, with the true homography of every frame, and the shipped target's
// three runs on them. Moved from test/tracker_state_machine.test.ts (#130),
// which asserts on what the runs return; the paths, `run` and the error
// measures are shared with that file's own tests, which import them from here.
// The backend and K are the caller's, injected as ADR-0001 injects a backend:
// nothing here imports one. The moved comments are kept as written: where one
// says "this file", "here" or "the fixture tests", it means that test file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions } from "../src/tracker.js";
import { decode } from "../src/target/format/index.js";
import type { TargetDb } from "../src/target/types.js";
import { trackTarget } from "../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches } from "./fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";
import { project, renderWarp, view } from "./fixtures/warped_frames.js";

/** The reference device's camera path: 270 × 360 grey frames, the target at about 0.45. */
export const CAMERA = { width: 270, height: 360 };
export const SEED = 20260925;
export const image = readPgm(TARGET_FIXTURE);

export interface Pose {
    scale: number;
    angle: number;
    shift: [number, number];
    perspective?: [number, number];
}

/** One frame of a path: #63's generator, one pass of blur, σ = 2 noise, a drifting exposure. */
export function frameAt(
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
export function wander(i: number): Pose {
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
export function leaveAndReturn(i: number): Pose {
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
export const velocityStep =
    (v: number) =>
    (i: number): Pose => ({ scale: 0.45, angle: 0, shift: [i < 5 ? 0 : v * (i - 4), 0] });

/** A whole path through one tracker, under one seeded RANSAC. States as "D", "T", "L". */
export function run(
    cv: CvBackend,
    K: Mat3,
    t: TargetDb,
    path: (i: number) => Pose,
    n: number,
    options?: NftTrackerOptions,
) {
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

const patchCentres = trackTarget(pinballPatches(), PINBALL_STEP).centres;

/** RMS, frame px, over the 64 patch centres of the target, between two homographies. */
export function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let i = 0; i < patchCentres.length; i += 2) {
        const [ax, ay] = project(A, patchCentres[i], patchCentres[i + 1]);
        const [bx, by] = project(B, patchCentres[i], patchCentres[i + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / (patchCentres.length / 2));
}

/** The largest distance, frame px, between where `A` and `B` put one patch centre. */
export function centreMax(A: Mat3, B: Mat3): number {
    let worst = 0;
    for (let i = 0; i < patchCentres.length; i += 2) {
        const [ax, ay] = project(A, patchCentres[i], patchCentres[i + 1]);
        const [bx, by] = project(B, patchCentres[i], patchCentres[i + 1]);
        worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
    }
    return worst;
}

/**
 * The shipped configuration, pinned on ground truth: the committed
 * `examples/targets/pinball.wnft`, decoded, on the same sequences. Every other
 * test here runs the 64-patch fixture, which stays independent of
 * compile-target's defaults on purpose (fixtures/tracking_target.ts); this
 * block is the one that follows them, so a change to the default that moves
 * the tracker's accuracy moves a pinned number, and has to be looked at.
 *
 * Errors are measured as the fixture tests measure them, at the fixture's 64
 * patch centres, and also over those the truth puts inside the frame: a
 * target leaving the frame is tracked on the patches still in view, and the
 * pose extrapolates to the rest. With the 48 patches of M3's tuning pass
 * (round 2) that extrapolation is 3.4 px RMS over the whole target at worst,
 * 8.2 px at its far point, where the 64 of M2 were 1.2 and 2.5; the part in
 * view stays within 0.36 px (docs/benchmarks/README.md, round 4). Pinned below
 * about 1.25 times the measured value, as elsewhere in this file.
 */
export function shippedTarget(): TargetDb {
    const SHIPPED = fileURLToPath(
        new URL("../../../examples/targets/pinball.wnft", import.meta.url),
    );
    const decoded = decode(new Uint8Array(readFileSync(SHIPPED)));
    if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
    return decoded.target;
}

/** The pose error over the measuring points the truth puts inside the frame, RMS and worst. */
export function inView(A: Mat3, truth: Mat3): { rms: number; max: number } {
    let s = 0;
    let n = 0;
    let max = 0;
    for (let i = 0; i < patchCentres.length; i += 2) {
        const [tx, ty] = project(truth, patchCentres[i], patchCentres[i + 1]);
        if (!(tx >= 0 && tx <= CAMERA.width - 1 && ty >= 0 && ty <= CAMERA.height - 1)) continue;
        const [ax, ay] = project(A, patchCentres[i], patchCentres[i + 1]);
        const d = Math.hypot(ax - tx, ay - ty);
        s += d * d;
        n++;
        max = Math.max(max, d);
    }
    return { rms: n === 0 ? 0 : Math.sqrt(s / n), max };
}

/** The shipped target leaving the frame and returning: 106 frames. */
export function shippedLeaveAndReturn(cv: CvBackend, K: Mat3) {
    return run(cv, K, shippedTarget(), leaveAndReturn, 106);
}

/** The shipped target on a slow wander: 40 frames. */
export function shippedWander(cv: CvBackend, K: Mat3) {
    return run(cv, K, shippedTarget(), wander, 40);
}

/** The velocity changes the shipped target is stepped through, px/frame. */
export const SHIPPED_VELOCITIES = [2, 3, 4, 5, 6];

/** The shipped target at rest, then moving at each of `SHIPPED_VELOCITIES`: 15 frames each. */
export function shippedVelocitySteps(cv: CvBackend, K: Mat3) {
    return SHIPPED_VELOCITIES.map((v) => ({
        v,
        ...run(cv, K, shippedTarget(), velocityStep(v), 15),
    }));
}
