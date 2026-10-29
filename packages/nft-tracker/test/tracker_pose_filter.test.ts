/*
 *  tracker_pose_filter.test.ts
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

// The pose filter's tracker option (#106, Part 3): off by default, and off
// leaves `pose` as `poseSelection.pose`; on with its parameters omitted, the
// exported DEFAULT_ constants, which are the registered derived values; the
// refusals, each by name; and on the two registered paths, the filter moves
// `pose` and nothing else. The registered criteria's figures are the Stage 3
// check's (docs/benchmarks/2026-10-29-106-stage3-check.mjs), not these tests'.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import * as index from "../src/index.js";
import {
    DEFAULT_POSE_FILTER,
    DEFAULT_POSE_FILTER_D_CUTOFF,
    DEFAULT_POSE_FILTER_ROTATION_BETA,
    DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
    DEFAULT_POSE_FILTER_TRANSLATION_BETA,
    DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
    NftTracker,
} from "../src/tracker.js";
import type { NftTrackerOptions, TrackResult } from "../src/tracker.js";
import { PoseFilter } from "../src/pose/pose_filter.js";
import type { TargetDb } from "../src/target/types.js";
import {
    CAMERA,
    REST_FRAMES,
    restPath,
    run,
    SETTLE_REST_FRAMES,
    SETTLE_SLIDE_FRAMES,
    settlePath,
    shippedTarget,
} from "../ground-truth/tracker_sequences.js";

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;

type Run = ReturnType<typeof run>;
const runs: Record<string, Run> = {};
const PATHS = {
    rest: { path: restPath, n: REST_FRAMES },
    settle: { path: settlePath, n: SETTLE_SLIDE_FRAMES + SETTLE_REST_FRAMES },
};
const ARMS: Record<string, NftTrackerOptions | undefined> = {
    absent: undefined,
    off: { poseFilter: { mode: "off" } },
    on: { poseFilter: { mode: "one-euro" } },
};

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = shippedTarget();
    for (const [p, { path, n }] of Object.entries(PATHS)) {
        for (const [a, options] of Object.entries(ARMS)) {
            runs[`${p}/${a}`] = run(cv, K, target, path, n, options);
        }
    }
    runs["rest/explicit"] = run(cv, K, target, restPath, REST_FRAMES, {
        poseFilter: {
            mode: "one-euro",
            rotation: { minCutOff: 1, beta: 10 },
            translation: { minCutOff: 1, beta: 0.1 },
            dCutOff: 1,
        },
    });
    runs["rest/betaR100"] = run(cv, K, target, restPath, REST_FRAMES, {
        poseFilter: { mode: "one-euro", rotation: { beta: 100 } },
    });
}, 120_000);

const ok = (r: TrackResult): r is Extract<TrackResult, { ok: true }> => r.ok;
const samePose = (
    a: { R: Float64Array; t: Float64Array },
    b: { R: Float64Array; t: Float64Array },
) => a.R.every((v, i) => Object.is(v, b.R[i])) && a.t.every((v, i) => Object.is(v, b.t[i]));

describe("the poseFilter option: its default and its derived values", () => {
    it("defaults to off, frozen, as DEFAULT_CONDITIONING does", () => {
        expect(DEFAULT_POSE_FILTER).toEqual({ mode: "off" });
        expect(Object.isFrozen(DEFAULT_POSE_FILTER)).toBe(true);
    });

    it("exports the registered derived values as its DEFAULT_ constants", () => {
        expect(DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF).toBe(1);
        expect(DEFAULT_POSE_FILTER_ROTATION_BETA).toBe(10);
        expect(DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF).toBe(1);
        expect(DEFAULT_POSE_FILTER_TRANSLATION_BETA).toBe(0.1);
        expect(DEFAULT_POSE_FILTER_D_CUTOFF).toBe(1);
    });

    it("exports the option's defaults from the package's index, and not the filter module", () => {
        expect(index.DEFAULT_POSE_FILTER).toBe(DEFAULT_POSE_FILTER);
        expect(index.DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF).toBe(1);
        expect(index.DEFAULT_POSE_FILTER_ROTATION_BETA).toBe(10);
        expect(index.DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF).toBe(1);
        expect(index.DEFAULT_POSE_FILTER_TRANSLATION_BETA).toBe(0.1);
        expect(index.DEFAULT_POSE_FILTER_D_CUTOFF).toBe(1);
        expect("PoseFilter" in index).toBe(false);
        expect("so3Log" in index).toBe(false);
    });
});

describe("the poseFilter option: off", () => {
    for (const arm of ["absent", "off"]) {
        it(`gives pose === poseSelection.pose on every posed frame (${arm})`, () => {
            let posed = 0;
            for (const p of Object.keys(PATHS)) {
                for (const r of runs[`${p}/${arm}`].results.filter(ok)) {
                    expect(r.pose).toBe(r.poseSelection.pose);
                    posed++;
                }
            }
            expect(posed).toBeGreaterThan(100);
        });
    }

    it("is the same with the option absent and with { mode: 'off' }", () => {
        for (const p of Object.keys(PATHS)) {
            expect(runs[`${p}/off`].results).toEqual(runs[`${p}/absent`].results);
        }
    });
});

describe("the poseFilter option: on", () => {
    it("reads the DEFAULT_ constants for every omitted parameter", () => {
        const omitted = runs["rest/on"].results;
        const explicit = runs["rest/explicit"].results;
        omitted.forEach((r, k) => {
            const e = explicit[k];
            expect(r.ok).toBe(e.ok);
            if (ok(r) && ok(e)) expect(samePose(r.pose, e.pose)).toBe(true);
        });
        // Must fire: one parameter away from the derived value moves the pose.
        const other = runs["rest/betaR100"].results;
        expect(
            omitted.some((r, k) => ok(r) && !samePose(r.pose, (other[k] as typeof r).pose)),
        ).toBe(true);
    });

    it("is the module at the DEFAULT_ values, fed poseSelection.pose: Object.is on every component", () => {
        const f = new PoseFilter({
            rotation: {
                minCutOff: DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
                beta: DEFAULT_POSE_FILTER_ROTATION_BETA,
            },
            translation: {
                minCutOff: DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
                beta: DEFAULT_POSE_FILTER_TRANSLATION_BETA,
            },
            dCutOff: DEFAULT_POSE_FILTER_D_CUTOFF,
        });
        for (const r of runs["rest/on"].results) {
            const out = f.apply(ok(r) ? { ...r, pose: r.poseSelection.pose } : r);
            if (ok(r)) expect(samePose(out!, r.pose)).toBe(true);
            else expect(out).toBeNull();
        }
    });

    // On the registered paths (the registration, "The registered paths"):
    // the filter changes `pose`, and leaves `H`, the states and
    // `poseSelection` what the tracker computes without it.
    for (const p of Object.keys(PATHS)) {
        it(`changes pose and leaves H, the states and poseSelection unchanged on the ${p} path`, () => {
            const on = runs[`${p}/on`];
            const off = runs[`${p}/absent`];
            expect(on.states).toBe(off.states);
            let moved = 0;
            on.results.forEach((r, k) => {
                const u = off.results[k];
                expect(r.H).toEqual(u.H);
                if (!(ok(r) && ok(u))) return;
                expect(r.poseSelection).toEqual(u.poseSelection);
                expect(samePose(r.poseSelection.pose, u.pose)).toBe(true);
                if (!samePose(r.pose, u.pose)) moved++;
            });
            expect(moved).toBeGreaterThan(0);
        });
    }
});

describe("the poseFilter option: refusals, each by name", () => {
    const make = (poseFilter: unknown) => () =>
        new NftTracker(cv, target, K, { poseFilter } as unknown as NftTrackerOptions);

    it("accepts the documented shapes", () => {
        expect(make({ mode: "off" })).not.toThrow();
        expect(make({ mode: "one-euro" })).not.toThrow();
        expect(make({ mode: "one-euro", rotation: {}, translation: { beta: 0 } })).not.toThrow();
        expect(
            make({
                mode: "one-euro",
                rotation: { minCutOff: 0.5, beta: 0 },
                translation: { minCutOff: 3, beta: 100 },
                dCutOff: 2,
            }),
        ).not.toThrow();
    });

    it("refuses an unknown mode", () => {
        for (const mode of ["on", "One-Euro", undefined, null, 1]) {
            expect(make({ mode })).toThrow(RangeError);
            expect(make({ mode })).toThrow(/poseFilter\.mode/);
        }
    });

    it("refuses a parameter given with the filter off, as conditioning refuses a threshold", () => {
        for (const extra of [{ rotation: {} }, { translation: { beta: 1 } }, { dCutOff: 1 }]) {
            expect(make({ mode: "off", ...extra })).toThrow(RangeError);
            expect(make({ mode: "off", ...extra })).toThrow(/poseFilter/);
        }
    });

    for (const layer of ["rotation", "translation"]) {
        it(`refuses a non-finite or non-positive ${layer}.minCutOff`, () => {
            for (const v of [0, -1, NaN, Infinity, -Infinity, "1"]) {
                const f = make({ mode: "one-euro", [layer]: { minCutOff: v } });
                expect(f).toThrow(RangeError);
                expect(f).toThrow(new RegExp(`poseFilter\\.${layer}\\.minCutOff`));
            }
        });

        it(`refuses a negative or non-finite ${layer}.beta`, () => {
            for (const v of [-1, -1e-9, NaN, Infinity, -Infinity, "0"]) {
                const f = make({ mode: "one-euro", [layer]: { beta: v } });
                expect(f).toThrow(RangeError);
                expect(f).toThrow(new RegExp(`poseFilter\\.${layer}\\.beta`));
            }
        });

        // Ruling C: a layer passes through on the module only. `null` there
        // means "pass through", so the option must never hand it on.
        it(`refuses ${layer}: null, and any other non-object, rather than passing the layer through`, () => {
            for (const v of [null, 1, "x", true]) {
                const f = make({ mode: "one-euro", [layer]: v });
                expect(f).toThrow(RangeError);
                expect(f).toThrow(new RegExp(`poseFilter\\.${layer}`));
            }
        });
    }

    it("refuses a non-finite or non-positive dCutOff", () => {
        for (const v of [0, -1, NaN, Infinity, "1"]) {
            const f = make({ mode: "one-euro", dCutOff: v });
            expect(f).toThrow(RangeError);
            expect(f).toThrow(/poseFilter\.dCutOff/);
        }
    });
});
