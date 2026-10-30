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
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
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
import { detectTarget, prepareDetection } from "../src/detection.js";
import type { TargetDb } from "../src/target/types.js";
import { withSeededRandom } from "../ground-truth/fixtures/seeded_rng.js";
import {
    CAMERA,
    frameAt,
    SEED,
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

describe("the poseFilter option: every result reaches the filter, a LOST one included", () => {
    // With external detection a LOST frame can be followed, on the next call,
    // by a TRACK carried from a consumed detection, with no DETECT between
    // them to reset the filter: so only the LOST frame itself can, and its
    // timestamp is the reference the next frame is judged against. Through
    // `run`, every LOST is followed by a DETECT, which resets anyway.
    const stream = (t3: number) => {
        const setup = prepareDetection(cv, target);
        const frame = (i: number) => frameAt(restPath(i), i).frame;
        const blank: GrayImage = {
            width: CAMERA.width,
            height: CAMERA.height,
            data: new Uint8Array(CAMERA.width * CAMERA.height),
        };
        const detect = (i: number, ts: number) =>
            withSeededRandom(SEED, () => detectTarget(cv, setup, frame(i), ts)).value;
        const tracker = new NftTracker(cv, target, K, {
            externalDetection: true,
            poseFilter: { mode: "one-euro" },
        });
        return [
            tracker.process(frame(0), 0, detect(0, 0)),
            tracker.process(frame(1), 33),
            tracker.process(blank, 66),
            tracker.process(frame(3), t3, detect(3, t3)),
            tracker.process(frame(4), t3 + 33),
            tracker.process(frame(5), t3 + 66),
        ];
    };
    const passes = (r: TrackResult) => ok(r) && r.pose === r.poseSelection.pose;

    it("resets on the LOST frame, and judges the next frame's timestamp against the LOST frame's", () => {
        const r = stream(66);
        expect(r.map((x) => x.state[0]).join("")).toBe("TTLTTT");
        expect(passes(r[0])).toBe(true); // seeds
        expect(passes(r[1])).toBe(false);
        expect(passes(r[3])).toBe(true); // 66 does not exceed the LOST frame's 66
        expect(passes(r[4])).toBe(true); // seeds
        expect(passes(r[5])).toBe(false);
        // Must fire: at 70 ms, frame 3 seeds after the LOST frame's reset, and
        // frame 4 is filtered. A LOST frame that never reached the filter
        // would leave it seeded by frames 0 and 1, and frame 3 filtered.
        const later = stream(70);
        expect(later.map((x) => x.state[0]).join("")).toBe("TTLTTT");
        expect(passes(later[3])).toBe(true);
        expect(passes(later[4])).toBe(false);
    });
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

    // The maintainer's ruling of 2026-10-30 on #199, point 4: an unknown key
    // inside poseFilter, or inside its rotation or translation object, is
    // refused by name — a misspelt parameter would otherwise run at its
    // default without a word. Only there: conditioning and the other options
    // are unchanged.
    it("refuses an unknown key, naming it, and suggests the key a case slip meant", () => {
        const cases: [unknown, RegExp, RegExp | null][] = [
            [{ mode: "one-euro", dCutoff: 1 }, /poseFilter\.dCutoff/, /dCutOff/],
            [{ mode: "one-euro", foo: 1 }, /poseFilter\.foo/, null],
            [{ mode: "off", rotaton: {} }, /poseFilter\.rotaton/, null],
            [
                { mode: "one-euro", rotation: { minCutoff: 3 } },
                /poseFilter\.rotation\.minCutoff/,
                /minCutOff/,
            ],
            [
                { mode: "one-euro", rotation: { beta: 1, extra: 0 } },
                /poseFilter\.rotation\.extra/,
                null,
            ],
            [
                { mode: "one-euro", translation: { Beta: 1 } },
                /poseFilter\.translation\.Beta/,
                /beta/,
            ],
        ];
        for (const [poseFilter, name, hint] of cases) {
            const f = make(poseFilter);
            expect(f).toThrow(RangeError);
            expect(f).toThrow(name);
            expect(f).toThrow(/not a known key/);
            if (hint !== null) expect(f).toThrow(new RegExp(`did you mean ${hint.source}\\?`));
        }
    });

    it("leaves unknown keys elsewhere as they were: conditioning's and the options' own", () => {
        const options = (o: unknown) => () =>
            new NftTracker(cv, target, K, o as unknown as NftTrackerOptions);
        expect(options({ conditioning: { mode: "off", maxDscale: 1 } })).not.toThrow();
        expect(options({ conditioning: { mode: "report", foo: 1 } })).not.toThrow();
        expect(options({ poseFIlter: { mode: "one-euro" } })).not.toThrow();
    });
});

// Qodo's second review of #199, finding 1, as the maintainer ruled it: the
// option accepts any finite positive cutoff and finite non-negative beta, and
// at such values `2π · cutoff · te` can overflow to Infinity, which made
// One Euro's α = ∞ / ∞ = NaN. An overflowing cutoff now gives α = 1: the
// filter follows its input on that frame.
describe("the poseFilter option: extreme finite parameters", () => {
    const EXTREME = {
        poseFilter: {
            mode: "one-euro",
            rotation: { minCutOff: 1e308, beta: 1e308 },
            translation: { minCutOff: 1e308, beta: 1e308 },
            dCutOff: 1e308,
        },
    } as const;

    it("gives finite poses marked good, following the input, at cutoffs and betas of 1e308", () => {
        const { results } = run(cv, K, target, restPath, 12, EXTREME);
        let filtered = 0;
        for (const r of results) {
            if (!ok(r)) continue;
            expect([...r.pose.R, ...r.pose.t].every(Number.isFinite)).toBe(true);
            expect(r.pose.good).toBe(true);
            if (r.pose === r.poseSelection.pose) continue;
            filtered++;
            // α = 1: the filtered pose is its input, to rounding.
            const u = r.poseSelection.pose;
            for (let i = 0; i < 9; i++) expect(Math.abs(r.pose.R[i] - u.R[i])).toBeLessThan(1e-9);
            for (let i = 0; i < 3; i++) expect(Math.abs(r.pose.t[i] - u.t[i])).toBeLessThan(1e-9);
        }
        expect(filtered).toBeGreaterThan(5);
    });
});

// The maintainer's ruling of 2026-10-30 on #199, point 2: with the filter on,
// a timestampMs that is not finite is a contract violation, refused before
// the frame is processed; it is not a reset cause, so the registered reset
// rule is unchanged. With the filter off, nothing changes (C0).
describe("the poseFilter option: a timestamp that is not finite", () => {
    const frame = (i: number) => frameAt(restPath(i), i).frame;
    /** Frames through one tracker under one seeded generator; a call that throws is recorded as "threw". */
    const through = (options: NftTrackerOptions | undefined, calls: [number, number][]) => {
        const tracker = new NftTracker(cv, target, K, options);
        return withSeededRandom(SEED, () =>
            calls.map(([i, ts]) => {
                try {
                    return tracker.process(frame(i), ts);
                } catch (e) {
                    return e instanceof RangeError ? `threw: ${e.message}` : e;
                }
            }),
        ).value;
    };
    const ON = { poseFilter: { mode: "one-euro" } } as const;

    it("throws a RangeError naming timestampMs, with the filter on", () => {
        for (const ts of [NaN, Infinity, -Infinity]) {
            const [r0, r1] = through(ON, [
                [0, 0],
                [1, ts],
            ]);
            expect(typeof r0).toBe("object");
            expect(r1).toMatch(/^threw: .*timestampMs/);
        }
    });

    it("throws before the frame is processed: the tracker goes on as if the call never happened", () => {
        const clean = through(ON, [
            [0, 0],
            [1, 33],
            [2, 66],
        ]);
        const refused = through(ON, [
            [0, 0],
            [1, Infinity],
            [1, 33],
            [2, 66],
        ]);
        expect(refused[1]).toMatch(/^threw: /);
        expect([refused[0], refused[2], refused[3]]).toEqual(clean);
        // Must fire: a frame that was processed, here a finite one at 16 ms,
        // leaves the tracker and the filter in another state.
        const extra = through(ON, [
            [0, 0],
            [1, 16],
            [1, 33],
            [2, 66],
        ]);
        expect([extra[0], extra[2], extra[3]]).not.toEqual(clean);
    });

    it("changes nothing with the filter off: a timestamp that is not finite is echoed, as before", () => {
        for (const options of [undefined, { poseFilter: { mode: "off" } } as const]) {
            const r = through(options, [
                [0, 0],
                [1, NaN],
                [2, Infinity],
            ]);
            for (const x of r) expect(typeof x).toBe("object");
            expect((r[1] as TrackResult).timestampMs).toBeNaN();
            expect((r[2] as TrackResult).timestampMs).toBe(Infinity);
        }
    });
});
