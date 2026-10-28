/*
 *  tracker_conditioning.test.ts
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

// The conditioning signal (#104, M4's step 2) in the tracker's pose path: its
// three states — off, the default; reporting; refusing with the caller's
// thresholds — on the two places the path reads a fit's H under K before the
// pose step: a detection's (`detected`) and a tracking step's (`tracked`).
// The signal's arithmetic is test/pose/conditioning.test.ts; its agreement
// with the derivation of record on #90's sweep is conditioning_sweep.test.ts.
// The thresholds used here are the test's own, chosen to exercise the
// mechanism; none is registered (M4's milestone, appended 2026-10-21: "No
// threshold value is registered by this milestone").

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { DEFAULT_CONDITIONING, NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions, TrackResult } from "../src/tracker.js";
import { detectTarget, prepareDetection } from "../src/detection.js";
import type { Detection } from "../src/detection.js";
import type { TargetDb } from "../src/target/types.js";
import { pinballTrackingTarget } from "../ground-truth/fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../ground-truth/fixtures/pgm.js";
import { withSeededRandom } from "../ground-truth/fixtures/seeded_rng.js";
import { renderWarp, view } from "../ground-truth/fixtures/warped_frames.js";

const CAMERA = { width: 270, height: 360 };
const SEED = 20261021;
const image = readPgm(TARGET_FIXTURE);

/** A hand-held wander of tracker_pose.test.ts's kind: mild tilt, so the signal is small and nonzero. */
function frameAt(i: number): GrayImage {
    const c = (period: number) => 1 - Math.cos(i / period);
    const H = view({
        target: image,
        frame: CAMERA,
        scale: 0.45 + 0.03 * c(7),
        angle: ((5 * Math.PI) / 180) * c(11),
        shift: [10 * c(8), 8 * c(10)],
        perspective: [0.0003 * c(9), -0.0002 * c(13)],
    });
    return renderWarp(image, H, {
        ...CAMERA,
        blurPasses: 1,
        noiseSigma: 2,
        gain: 1 + 0.08 * Math.sin(i / 5),
        bias: 6 * Math.sin(i / 7),
        seed: i + 1,
    });
}

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;
let frames: GrayImage[];
/** A detection of frame 0, for the external path. */
let d0: Detection;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
    frames = Array.from({ length: 24 }, (_, i) => frameAt(i));
    d0 = withSeededRandom(SEED, () =>
        detectTarget(cv, prepareDetection(cv, target), frames[0], 0),
    ).value;
    if (!d0.ok) throw new Error(`fixture: frame 0 did not detect (${d0.reason})`);
});

/** Every frame through one tracker under one seeded RANSAC. */
function run(options?: NftTrackerOptions, n = frames.length): TrackResult[] {
    const tracker = new NftTracker(cv, target, K, options);
    return withSeededRandom(SEED, () =>
        frames.slice(0, n).map((f, i) => tracker.process(f, i * 33)),
    ).value;
}

const states = (rs: readonly TrackResult[]) => rs.map((r) => r.state);
const homographies = (rs: readonly TrackResult[]) => rs.map((r) => (r.ok ? Array.from(r.H) : null));

describe("the default: off", () => {
    it("DEFAULT_CONDITIONING is { mode: 'off' }, and a tracker built without the option is off", () => {
        // Forced, not a preference: the campaign's baseline arm is today's
        // pipeline, and the default must not change it (the brief; M4's
        // milestone, appended 2026-10-21, "switchable, default off").
        expect(DEFAULT_CONDITIONING).toEqual({ mode: "off" });
        expect(new NftTracker(cv, target, K).conditioningMode).toBe("off");
        expect(new NftTracker(cv, target, K, {}).conditioningMode).toBe("off");
    });

    it("carries conditioning: null on every result, DETECT, TRACK and LOST", () => {
        const rs = run();
        expect(states(rs)[0]).toBe("DETECT");
        expect(states(rs)).toContain("TRACK");
        for (const r of rs) {
            expect(r.conditioning).toBeNull();
            expect(r.trackLossConditioning).toBeNull();
        }
        const only = run({ detectionOnly: true }, 3);
        for (const r of only) {
            expect(r.conditioning).toBeNull();
            expect(r.trackLossConditioning).toBeNull();
        }
    });
});

describe("the option's domain", () => {
    it.each<[string, unknown]>([
        ["a mode that is not one of the three", { mode: "sideways" }],
        ["a string in place of the object", "report"],
        ["refuse without thresholds", { mode: "refuse" }],
        ["refuse with one threshold", { mode: "refuse", maxDScale: 0.01 }],
        ["refuse with a NaN threshold", { mode: "refuse", maxDScale: NaN, maxDOrth: 0.03 }],
        [
            "refuse with a threshold of −Infinity",
            { mode: "refuse", maxDScale: 0.01, maxDOrth: -Infinity },
        ],
        ["refuse with a negative threshold", { mode: "refuse", maxDScale: -0.01, maxDOrth: 0.03 }],
        // A threshold outside the refusing state would be dropped silently,
        // and a caller who gave one meant to refuse (found in review).
        ["report with thresholds", { mode: "report", maxDScale: 0.01, maxDOrth: 0.03 }],
        ["off with a threshold", { mode: "off", maxDOrth: 0.03 }],
        ["refuse with a string threshold", { mode: "refuse", maxDScale: "0.01", maxDOrth: 0.03 }],
    ])("refuses %s at construction, naming the option", (_name, conditioning) => {
        const options = { conditioning } as unknown as NftTrackerOptions;
        expect(() => new NftTracker(cv, target, K, options)).toThrow(RangeError);
        expect(() => new NftTracker(cv, target, K, options)).toThrow(/conditioning/);
    });

    it("accepts +Infinity as a threshold, leaving that quantity unbounded while the other still refuses", () => {
        // #160, "Two separate thresholds": on view 1 "τ_o unbounded above
        // with τ_s at its floor". A reading is still taken under it.
        const tracker = new NftTracker(cv, target, K, {
            conditioning: { mode: "refuse", maxDScale: Infinity, maxDOrth: Infinity },
        });
        expect(tracker.conditioningMode).toBe("refuse");
        const rs = run(
            { conditioning: { mode: "refuse", maxDScale: Infinity, maxDOrth: Infinity } },
            4,
        );
        expect(states(rs)).toEqual(states(run(undefined, 4)));
        for (const r of rs) if (r.ok) expect(r.conditioning?.ok).toBe(true);
        const only = run({ conditioning: { mode: "refuse", maxDScale: 0, maxDOrth: Infinity } }, 2);
        for (const r of only) expect(r.ok ? null : r.reason).toBe("conditioning");
    });

    it("accepts the three states, thresholds of 0 included", () => {
        expect(
            new NftTracker(cv, target, K, { conditioning: { mode: "off" } }).conditioningMode,
        ).toBe("off");
        expect(
            new NftTracker(cv, target, K, { conditioning: { mode: "report" } }).conditioningMode,
        ).toBe("report");
        expect(
            new NftTracker(cv, target, K, {
                conditioning: { mode: "refuse", maxDScale: 0, maxDOrth: 0 },
            }).conditioningMode,
        ).toBe("refuse");
    });
});

describe("reporting", () => {
    it("exposes the two quantities, separately, on every frame with a pose, and refuses nothing", () => {
        const base = run();
        const rs = run({ conditioning: { mode: "report" } });
        expect(states(rs)).toEqual(states(base));
        expect(homographies(rs)).toEqual(homographies(base));
        for (const r of rs) {
            if (!r.ok) {
                expect(r.conditioning).toBeNull();
                continue;
            }
            expect(r.conditioning).not.toBeNull();
            expect(r.conditioning!.ok).toBe(true);
            if (!r.conditioning!.ok) continue;
            expect(Number.isFinite(r.conditioning!.dScale)).toBe(true);
            expect(Number.isFinite(r.conditioning!.dOrth)).toBe(true);
            expect(r.trackLoss).not.toBe("conditioning");
            expect(r.trackLossConditioning).toBeNull();
        }
    });

    it("reads a detection's H as well as a tracking step's", () => {
        const only = run({ detectionOnly: true, conditioning: { mode: "report" } }, 3);
        for (const r of only) {
            expect(r.state).toBe("DETECT");
            expect(r.conditioning?.ok).toBe(true);
        }
    });
});

describe("refusing", () => {
    const everything = { mode: "refuse", maxDScale: 0, maxDOrth: 0 } as const;
    const nothing = { mode: "refuse", maxDScale: 1, maxDOrth: 1 } as const;

    it("at thresholds of 0, refuses every detection: LOST with reason conditioning, the reading carried, no pose", () => {
        const rs = run({ conditioning: everything }, 6);
        for (const r of rs) {
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.state).toBe("LOST");
            expect(r.reason).toBe("conditioning");
            expect(r.pose).toBeNull();
            expect(r.H).toBeNull();
            expect(r.conditioning?.ok).toBe(true);
            // Nothing was locked, so no step ran.
            expect(r.trackLoss).toBeNull();
        }
    });

    it("at thresholds of 0, refuses the step that confirms a consumed detection: unconfirmed, trackLoss conditioning", () => {
        const tracker = new NftTracker(cv, target, K, {
            externalDetection: true,
            conditioning: everything,
        });
        const r = withSeededRandom(SEED, () => tracker.process(frames[1], 33, d0)).value;
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe("unconfirmed");
        expect(r.trackLoss).toBe("conditioning");
        expect(r.trackLossConditioning?.ok).toBe(true);
        expect(r.conditioning).toBeNull();
        expect(r.detectionUse).toBe("consumed");
        expect(r.pose).toBeNull();
    });

    it("at thresholds no fit reaches, behaves as the default and carries the readings", () => {
        const base = run();
        const rs = run({ conditioning: nothing });
        expect(states(rs)).toEqual(states(base));
        expect(homographies(rs)).toEqual(homographies(base));
        for (const r of rs) if (r.ok) expect(r.conditioning?.ok).toBe(true);
    });

    it("refuses a held lock's step by its reading: the lock drops, trackLoss says conditioning, and the frame is detected again", () => {
        // The threshold is set from this sequence's own readings, between the
        // first detection's and the largest a tracking step reads, so the
        // refusal fires on a known frame. A mechanism check; no value claim.
        const reported = run({ conditioning: { mode: "report" } });
        expect(reported[0].state).toBe("DETECT");
        const orth = reported.map((r) =>
            r.ok && r.conditioning?.ok ? Math.abs(r.conditioning.dOrth) : -1,
        );
        let at = 1;
        for (let i = 2; i < orth.length; i++) if (orth[i] > orth[at]) at = i;
        expect(reported[at].state).toBe("TRACK");
        expect(orth[0]).toBeLessThan(orth[at]);
        const maxDOrth = orth[at] * 0.999;
        // Every frame before `at` must pass too, for the states to agree there.
        for (let i = 0; i < at; i++) expect(orth[i]).toBeLessThanOrEqual(maxDOrth);
        const rs = run({ conditioning: { mode: "refuse", maxDScale: 1, maxDOrth } });
        expect(states(rs).slice(0, at)).toEqual(states(reported).slice(0, at));
        const r = rs[at];
        expect(r.trackLoss).toBe("conditioning");
        // The refused step's reading survives the detection that follows on
        // the same frame (found in review).
        expect(r.trackLossConditioning?.ok).toBe(true);
        if (r.trackLossConditioning?.ok) {
            expect(Math.abs(r.trackLossConditioning.dOrth)).toBeGreaterThan(maxDOrth);
        }
        for (const before of rs.slice(0, at)) expect(before.trackLossConditioning).toBeNull();
        expect(r.tracking).not.toBeNull();
        // The frame then runs detection, as after any loss: DETECT, or LOST
        // with a detection failure — never TRACK, and never a conditioning
        // reason from the step itself.
        expect(r.state).not.toBe("TRACK");
        if (r.ok) expect(r.detectionUse).toBe("internal");
    });
});
