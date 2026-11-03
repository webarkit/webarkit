/*
 *  tracker_rng.test.ts
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

// The injectable RNG (webarkit/webarkit#188): `detectTarget`'s `rng` and the
// tracker's `rngFor` reach `estimateHomography` as `RansacOptions.rng`
// (webarkit/webarkit#24), and nothing else changes. A backend double records
// the options of every `estimateHomography` call and forwards it to
// jsfeatNext, so the pipeline runs for real: what is asserted is what the
// contract receives, not what the double returns.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, Mat3, RansacOptions } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions } from "../src/tracker.js";
import { detectTarget, prepareDetection } from "../src/detection.js";
import type { TargetDb } from "../src/target/types.js";
import { pinballTrackingTarget } from "../ground-truth/fixtures/tracking_target.js";
import { mulberry32 } from "../ground-truth/fixtures/seeded_rng.js";
import { CAMERA, frameAt, leaveAndReturn, wander } from "../ground-truth/tracker_sequences.js";

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
});

/** `cv`, recording the options of every `estimateHomography` call, in order. */
function recording(): { backend: CvBackend; calls: (RansacOptions | undefined)[] } {
    const calls: (RansacOptions | undefined)[] = [];
    const backend = Object.create(cv) as CvBackend;
    backend.estimateHomography = (src, dst, options) => {
        calls.push(options);
        return cv.estimateHomography(src, dst, options);
    };
    return { backend, calls };
}

const frame = (i: number) => frameAt(wander(i), i).frame;

describe("detectTarget's rng", () => {
    it("reaches estimateHomography as RansacOptions.rng, beside the threshold", () => {
        const { backend, calls } = recording();
        const setup = prepareDetection(backend, target);
        const rng = mulberry32(1);
        const d = detectTarget(backend, setup, frame(0), 0, rng);
        expect(d.ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({ threshold: setup.ransacThreshold, rng });
        expect(calls[0]!.rng).toBe(rng);
    });

    it("absent, leaves the options exactly as before #188: no rng key, not even undefined", () => {
        const { backend, calls } = recording();
        const setup = prepareDetection(backend, target);
        detectTarget(backend, setup, frame(0), 0);
        expect(calls).toHaveLength(1);
        expect(Object.keys(calls[0]!)).toEqual(["threshold"]);
    });
});

describe("NftTracker's rngFor", () => {
    /** A path that detects, tracks, loses the target and detects it again. */
    const N = 80;
    const pathFrame = (i: number) => frameAt(leaveAndReturn(i), i).frame;

    it("is called once per detection the tracker runs, with that frame's timestamp, and never on a TRACK frame", () => {
        const { backend, calls } = recording();
        const asked: unknown[] = [];
        const rngs: (() => number)[] = [];
        const tracker = new NftTracker(backend, target, K, {
            rngFor: (f) => {
                asked.push(f);
                const rng = mulberry32(f.timestampMs);
                rngs.push(rng);
                return rng;
            },
        });
        const states: string[] = [];
        const detected: number[] = [];
        for (let i = 0; i < N; i++) {
            const before = calls.length;
            const r = tracker.process(pathFrame(i), i * 33);
            states.push(r.state[0]);
            // A frame without a lock at its end ran a detection; a TRACK frame ran none.
            if (r.state !== "TRACK") detected.push(i * 33);
            // A detection that reached the estimate passed it this frame's generator.
            if (calls.length > before) {
                expect(r.state).not.toBe("TRACK");
                expect(calls.length).toBe(before + 1);
                expect(calls[before]!.rng).toBe(rngs[rngs.length - 1]);
            }
        }
        expect(states.join("")).toMatch(/^DT+L+D/); // the path exercises every branch
        expect(asked).toEqual(detected.map((timestampMs) => ({ timestampMs })));
        expect(calls.length).toBeGreaterThan(1);
    }, 60_000);

    it("returning undefined is today's behaviour: no rng key in the options", () => {
        const { backend, calls } = recording();
        let n = 0;
        const tracker = new NftTracker(backend, target, K, {
            rngFor: () => {
                n++;
                return undefined;
            },
        });
        tracker.process(frame(0), 0);
        expect(n).toBe(1);
        expect(calls).toHaveLength(1);
        expect(Object.keys(calls[0]!)).toEqual(["threshold"]);
    });

    it("absent, leaves the options exactly as before #188", () => {
        const { backend, calls } = recording();
        new NftTracker(backend, target, K).process(frame(0), 0);
        expect(calls).toHaveLength(1);
        expect(Object.keys(calls[0]!)).toEqual(["threshold"]);
    });

    it("is never called with externalDetection: a handed-in detection is the caller's to seed", () => {
        const { backend, calls } = recording();
        let n = 0;
        const tracker = new NftTracker(backend, target, K, {
            externalDetection: true,
            rngFor: () => {
                n++;
                return mulberry32(1);
            },
        });
        const d = detectTarget(
            backend,
            prepareDetection(backend, target),
            frame(0),
            0,
            mulberry32(1),
        );
        expect(calls).toHaveLength(1);
        tracker.process(frame(1), 33);
        tracker.process(frame(1), 33, d);
        expect(n).toBe(0);
        expect(calls).toHaveLength(1);
    });

    it.each<[string, unknown]>([
        ["a number", 1],
        ["a string", "mulberry32"],
        ["an object", {}],
        ["null", null],
    ])("throws a RangeError when the option is %s, not a function", (_, v) => {
        expect(
            () => new NftTracker(cv, target, K, { rngFor: v } as unknown as NftTrackerOptions),
        ).toThrow(/rngFor must be a function/);
        expect(
            () => new NftTracker(cv, target, K, { rngFor: v } as unknown as NftTrackerOptions),
        ).toThrow(RangeError);
    });

    it("throws a RangeError when the factory returns something other than a function or undefined", () => {
        const tracker = new NftTracker(cv, target, K, {
            rngFor: (() => 0.5) as unknown as NftTrackerOptions["rngFor"],
        });
        expect(() => tracker.process(frame(0), 0)).toThrow(RangeError);
        expect(() => tracker.process(frame(0), 0)).toThrow(/rngFor returned/);
    });
});
