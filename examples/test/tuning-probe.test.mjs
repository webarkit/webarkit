/*
 *  tuning-probe.test.mjs
 *  webarkit
 *
 *  This file is part of webarkit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

// TPR1 (#207): scripts/tuning-probe.mjs's step probe throws when it diverges
// from the tracker, and replay-clips.mjs runs it only on frames ffmpeg decoded.
// Here it is driven with no clip: a frame painted from the target's own
// patches, on which the tracking step holds, and tracker results constructed
// to agree with the probe's step or to disagree with it in one way at a time.
//
// Of the nine `diverged` sites, these reach the four that compare the probe
// with the tracker's result: the mirror lock (both ways), each of the step's
// counts, the step's outcome against the state, and the homography. The other
// five compare the probe's re-alignment with its own `trackFrame` call on the
// same inputs (the prediction, its pyramid of the frame's first width × height
// bytes, and each patch's alignment, convergence and ZNCC against the outcome
// the step gave it), which the package computes the same way from the same
// arguments. No input whose values read the same each time sets them apart.
// One whose accessors change between the two calls does: a frame whose `data`
// getter returns other bytes once `trackFrame` has read it reaches the patch's
// alignment (`:203`), and one byte fewer the pyramid (`:191`); the review of
// #207's branch reached the prediction (`:186`) and convergence (`:207`) so.
// The replay hands the probe plain arrays, and no test here uses such an
// input. Imports the built dist/, as the probe does: `npm run build` first,
// which CI does.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decode } from "../../packages/nft-tracker/dist/index.js";
import { trackFrame, trackTarget } from "../../packages/nft-tracker/dist/tracking/track_frame.js";
import { createStepProbe, stepOptions } from "../../scripts/tuning-probe.mjs";

const target = decode(
    new Uint8Array(readFileSync(new URL("../targets/pinball.wnft", import.meta.url))),
).target;

/**
 * The target's size in pixels, mid-grey, with each patch painted over its
 * footprint at level 0 (nearest neighbour): under the identity, every patch
 * aligns where the target puts it. `extra` bytes are appended to the buffer.
 */
function paintedFrame(extra = 0) {
    const { widthPx: width, heightPx: height } = target.meta;
    const { patchSize: s, count, level, left, top, pixels } = target.patches;
    const data = new Uint8Array(width * height + extra).fill(128);
    for (let q = 0; q < count; q++) {
        const k = Math.pow(target.pyramid.scaleStep, level[q]);
        for (
            let y = Math.floor(top[q] * k);
            y < Math.min(height, Math.ceil((top[q] + s) * k));
            y++
        ) {
            for (
                let x = Math.floor(left[q] * k);
                x < Math.min(width, Math.ceil((left[q] + s) * k));
                x++
            ) {
                const u = Math.min(s - 1, Math.floor(x / k - left[q]));
                const v = Math.min(s - 1, Math.floor(y / k - top[q]));
                data[y * width + x] = pixels[q * s * s + v * s + u];
            }
        }
    }
    return { width, height, data };
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const track = trackTarget(target.patches, target.pyramid.scaleStep);
/** The step the tracker takes on `f` from the lock's last two poses, at its defaults. */
const stepOn = (f, previous, current) =>
    trackFrame(f, track, previous, current, stepOptions(), null);
const frame = paintedFrame();
/** The step on `frame` locked on the identity by a detection. */
const step = stepOn(frame, null, IDENTITY);
const detected = { state: "DETECT", H: IDENTITY, tracking: null };
/** The tracker's TRACK result for `s`. */
const trackedBy = (s, o = {}) => ({ state: "TRACK", H: s.H, tracking: { ...s.stats }, ...o });
const tracked = (o = {}) => trackedBy(step, o);
const DIVERGED = "tuning probe diverged from the tracker at frame";

describe("createStepProbe (TPR1)", () => {
    it("tracks on the painted frame, so the probe's step runs in full", () => {
        expect(step.ok).toBe(true);
        expect(step.stats.observed).toBe(target.patches.count);
        expect(step.stats.frameLevels).toBeGreaterThan(0);
    });

    it("passes a tracker whose step agrees with its own", () => {
        const probe = createStepProbe(target);
        probe.frame(frame, detected);
        probe.frame(frame, tracked());
        // A held lock predicts from its last two poses, so the next step is its own.
        const next = stepOn(frame, IDENTITY, step.H);
        expect(next.ok).toBe(true);
        probe.frame(frame, trackedBy(next));
        expect(probe.summary().steps).toBe(2);
    });

    it("passes frames on which neither the tracker nor its mirror holds a lock", () => {
        const probe = createStepProbe(target);
        probe.frame(frame, { state: "LOST", H: null, tracking: null });
        probe.frame(frame, { state: "LOST", H: null, tracking: null });
        expect(probe.summary().steps).toBe(0);
    });

    it("throws when the tracker runs a step its mirror lock does not hold", () => {
        const probe = createStepProbe(target);
        expect(() => probe.frame(frame, tracked())).toThrow(
            `${DIVERGED} 0: the tracker ran a step, the mirror lock says otherwise`,
        );
    });

    it("throws when the tracker runs no step on a frame its mirror lock holds", () => {
        const probe = createStepProbe(target);
        probe.frame(frame, detected);
        expect(() => probe.frame(frame, { state: "LOST", H: null, tracking: null })).toThrow(
            `${DIVERGED} 1: the tracker did not run a step, the mirror lock says otherwise`,
        );
    });

    it.each([
        "frameLevels",
        "culled",
        "attempted",
        "observed",
        "lost",
        "unconverged",
        "rejected",
        "failed",
        "inliers",
        "rmsError",
        "fitIterations",
        "fitConverged",
    ])("throws when the tracker's step reports another %s, naming both", (k) => {
        const probe = createStepProbe(target);
        probe.frame(frame, detected);
        const theirs = typeof step.stats[k] === "boolean" ? !step.stats[k] : step.stats[k] + 1;
        expect(() =>
            probe.frame(frame, tracked({ tracking: { ...step.stats, [k]: theirs } })),
        ).toThrow(`${DIVERGED} 1: ${k}: probe ${step.stats[k]}, tracker ${theirs}`);
    });

    it("throws when the tracker's state disagrees with whether the step held", () => {
        const probe = createStepProbe(target);
        probe.frame(frame, detected);
        expect(() => probe.frame(frame, tracked({ state: "LOST", H: null }))).toThrow(
            `${DIVERGED} 1: step ok true, state LOST`,
        );
    });

    it("throws when the tracker's TRACK homography is not the step's", () => {
        const probe = createStepProbe(target);
        probe.frame(frame, detected);
        const H = Array.from(step.H);
        H[2] += 1e-9;
        expect(() => probe.frame(frame, tracked({ H }))).toThrow(
            `${DIVERGED} 1: a different homography`,
        );
    });

    // The tracker reads a frame's first width × height bytes (`firstPixels`),
    // and so does the probe's own pyramid of it: a longer buffer, a pooled one
    // say, is no divergence.
    it("passes a frame on a longer buffer, reading its first width × height bytes", () => {
        const long = paintedFrame(1);
        const theirs = stepOn(long, null, IDENTITY);
        expect(theirs.ok).toBe(true);
        const probe = createStepProbe(target);
        probe.frame(long, detected);
        probe.frame(long, trackedBy(theirs));
        expect(probe.summary().steps).toBe(1);
    });
});
