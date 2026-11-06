/*
 *  tracker_pose_guard.test.ts
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

// The guard's tracker option (#133): G0's leg neither reference can reach, and
// G4's constructed cases on the tracker, of
// docs/benchmarks/2026-11-06-228-133-stage3-registration.md. The registered
// figures on the clips, and G1, G2, G3 and G5 there, are the dated check's
// (docs/benchmarks/2026-11-06-228-133-stage3-guard-check.mjs), since CI has no
// ffmpeg to decode them.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import * as index from "../src/index.js";
import {
    DEFAULT_POSE_FILTER_D_CUTOFF,
    DEFAULT_POSE_FILTER_ROTATION_BETA,
    DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
    DEFAULT_POSE_FILTER_TRANSLATION_BETA,
    DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
    DEFAULT_POSE_GUARD,
    DEFAULT_POSE_GUARD_THRESHOLD_DEG,
    NftTracker,
} from "../src/tracker.js";
import type { NftTrackerOptions, TrackResult } from "../src/tracker.js";
import { closedFormPose } from "../src/pose/closed_form.js";
import { PoseFilter } from "../src/pose/pose_filter.js";
import { tiltDegOf } from "../src/pose/pose_guard.js";
import { detectTarget, prepareDetection } from "../src/detection.js";
import { seededSource, withSeededRng } from "../ground-truth/fixtures/seeded_rng.js";
import {
    CAMERA,
    frameAt,
    leaveAndReturn,
    restPath,
    run,
    SEED,
    SHIPPED_VELOCITIES,
    settlePath,
    SETTLE_REST_FRAMES,
    SETTLE_SLIDE_FRAMES,
    shippedTarget,
    velocityStep,
    wander,
} from "../ground-truth/tracker_sequences.js";
import type { TargetDb } from "../src/target/types.js";

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;

const ON = { poseGuard: { mode: "closed-form-below" } } as const;

/** The three shipped sequences, as `tracker_sequences.ts` runs them, under `options`. */
const shippedSequences = (options?: NftTrackerOptions) => ({
    leaveAndReturn: run(cv, K, target, leaveAndReturn, 106, options),
    wander: run(cv, K, target, wander, 40, options),
    ...Object.fromEntries(
        SHIPPED_VELOCITIES.map((v) => [
            `velocity${v}`,
            run(cv, K, target, velocityStep(v), 15, options),
        ]),
    ),
});

/** The first path at which two values differ, every leaf by `Object.is`; `null` when none does. */
function firstDifference(a: unknown, b: unknown, path = "$"): string | null {
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
        if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return path;
        const x = a as unknown as ArrayLike<number>;
        const y = b as unknown as ArrayLike<number>;
        if (x.length !== y.length) return `${path}.length`;
        for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) return `${path}[${i}]`;
        return null;
    }
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return Object.is(a, b) ? null : path;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return path;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join("|") !== kb.join("|")) return `${path}{${ka.join(",")} / ${kb.join(",")}}`;
    for (const k of ka) {
        const d = firstDifference(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
            `${path}.${k}`,
        );
        if (d !== null) return d;
    }
    return null;
}

const ok = (r: TrackResult): r is Extract<TrackResult, { ok: true }> => r.ok;
const samePose = (
    a: { R: Float64Array; t: Float64Array; good: boolean },
    b: { R: Float64Array; t: Float64Array; good: boolean },
) =>
    a.good === b.good &&
    a.R.every((v, i) => Object.is(v, b.R[i])) &&
    a.t.every((v, i) => Object.is(v, b.t[i]));

/** One tracker over `n` frames of a path, returned with its counter. */
function counted(
    path: (i: number) => ReturnType<typeof restPath>,
    n: number,
    o?: NftTrackerOptions,
) {
    const seeded = seededSource(cv);
    const tracker = new NftTracker(cv, target, K, { ...o, rngFor: seeded.rngFor });
    const { value: results } = seeded.run(SEED, () =>
        Array.from({ length: n }, (_, i) => tracker.process(frameAt(path(i), i).frame, i * 33)),
    );
    return { results, fallbackFrames: tracker.fallbackFrames };
}

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = shippedTarget();
}, 120_000);

describe("the poseGuard option: its default", () => {
    it("defaults to off, frozen, with a threshold of 10 for the mode that reads one", () => {
        expect(DEFAULT_POSE_GUARD).toEqual({ mode: "off" });
        expect(Object.isFrozen(DEFAULT_POSE_GUARD)).toBe(true);
        expect(DEFAULT_POSE_GUARD_THRESHOLD_DEG).toBe(10);
    });

    it("exports the option's defaults from the package's index, and not the guard's module", () => {
        expect(index.DEFAULT_POSE_GUARD).toBe(DEFAULT_POSE_GUARD);
        expect(index.DEFAULT_POSE_GUARD_THRESHOLD_DEG).toBe(10);
        expect("guardPose" in index).toBe(false);
        expect("tiltDegOf" in index).toBe(false);
    });
});

describe("G0: { mode: 'off' } is the option absent", () => {
    it("holds every result of the shipped sequences equal, recursively, Object.is on each leaf", () => {
        const absent = shippedSequences();
        const off = shippedSequences({ poseGuard: { mode: "off" } });
        const names = Object.keys(absent) as (keyof typeof absent)[];
        expect(names.length).toBe(2 + SHIPPED_VELOCITIES.length);
        let frames = 0;
        for (const name of names) {
            const a = absent[name] as { results: TrackResult[] };
            const b = off[name] as { results: TrackResult[] };
            expect(b.results.length).toBe(a.results.length);
            a.results.forEach((r, k) => {
                // `run` injects no clock, so `timings` is null here and compared with the rest.
                expect(r.timings).toBeNull();
                expect(firstDifference(r, b.results[k], `${name}[${k}]`)).toBeNull();
                expect("poseGuard" in b.results[k]).toBe(false);
                expect("poseGuard" in r).toBe(false);
                frames++;
            });
        }
        expect(frames).toBe(106 + 40 + 15 * SHIPPED_VELOCITIES.length);
        // Must fire: one leaf moved, and one key added, in a copy of one result.
        const r = absent.wander.results[10];
        expect(ok(r)).toBe(true);
        if (ok(r)) {
            const H = Float64Array.from(r.H);
            H[4] += 1e-9;
            expect(firstDifference(r, { ...r, H })).toBe("$.H[4]");
            expect(firstDifference(r, { ...r, poseGuard: null })).not.toBeNull();
        }
    }, 120_000);
});

describe("the poseGuard option: on", () => {
    let off: ReturnType<typeof counted>;
    let on: ReturnType<typeof counted>;
    const N = SETTLE_SLIDE_FRAMES + SETTLE_REST_FRAMES;
    beforeAll(() => {
        off = counted(settlePath, N);
        on = counted(settlePath, N, ON);
    }, 120_000);

    it("gives each posed frame the closed form below 10°, on DETECT and TRACK alike", () => {
        const states = new Set<string>();
        for (const r of on.results.filter(ok)) {
            const cf = closedFormPose(r.H, K);
            expect(r.poseGuard!.tiltDeg).toBe(tiltDegOf(cf.R));
            expect(r.poseGuard!.guarded).toBe(r.poseGuard!.tiltDeg! < 10);
            if (r.poseGuard!.guarded) {
                expect(samePose(r.pose, cf)).toBe(true);
                states.add(r.state);
            } else {
                expect(r.pose).toBe(r.poseSelection.pose);
            }
        }
        expect(states).toEqual(new Set(["DETECT", "TRACK"]));
    });

    it("changes pose and poseGuard, and no other field", () => {
        expect(on.results.length).toBe(off.results.length);
        on.results.forEach((r, k) => {
            const { pose: _p, poseGuard: _g, ...rest } = r as Extract<TrackResult, { ok: true }>;
            const { pose: _q, ...restOff } = off.results[k] as Extract<TrackResult, { ok: true }>;
            expect(firstDifference(rest, restOff, `[${k}]`)).toBeNull();
        });
        expect(
            on.results.some((r, k) => {
                const u = off.results[k];
                return ok(r) && ok(u) && !samePose(r.pose, u.pose);
            }),
        ).toBe(true);
    });

    it("leaves the option's key absent on a frame that is not ok", () => {
        const { results } = run(cv, K, target, leaveAndReturn, 106, ON);
        const lost = results.filter((r) => !r.ok);
        expect(lost.length).toBeGreaterThan(0);
        for (const r of lost) expect("poseGuard" in r).toBe(false);
        for (const r of results.filter(ok)) expect("poseGuard" in r).toBe(true);
    }, 60_000);

    it("reads the DEFAULT_ threshold when it is omitted", () => {
        const explicit = counted(settlePath, N, {
            poseGuard: { mode: "closed-form-below", thresholdDeg: 10 },
        });
        explicit.results.forEach((r, k) => {
            expect(firstDifference(r, on.results[k], `[${k}]`)).toBeNull();
        });
    }, 60_000);

    it("runs on a detection-only tracker's frames, and on a detection handed in", () => {
        const { results } = run(cv, K, target, restPath, 3, { ...ON, detectionOnly: true });
        const posed = results.filter(ok);
        expect(posed.length).toBe(3);
        for (const r of posed) {
            expect(r.state).toBe("DETECT");
            expect(r.poseGuard!.guarded).toBe(r.poseGuard!.tiltDeg! < 10);
        }
        // Handed in, a detection is tracked onto the frame at once: a "TRACK" result.
        const setup = prepareDetection(cv, target);
        const frame = frameAt(restPath(0), 0).frame;
        const detection = withSeededRng(cv, SEED, (rng) =>
            detectTarget(cv, setup, frame, 0, rng),
        ).value;
        const handed = new NftTracker(cv, target, K, { ...ON, externalDetection: true });
        const r = handed.process(frame, 0, detection);
        if (!ok(r)) throw new Error("the handed-in detection was not consumed");
        expect(r.detectionUse).toBe("consumed");
        expect(r.state).toBe("TRACK");
        expect(r.poseGuard!.guarded).toBe(r.poseGuard!.tiltDeg! < 10);
        expect(samePose(r.pose, closedFormPose(r.H, K))).toBe(r.poseGuard!.guarded);
    });
});

describe("the poseGuard option: the threshold is a parameter (G4)", () => {
    const N = 12;

    it("at a frame's own tilt: the selection at exactly it, the closed form 1e-9 above it", () => {
        const off = counted(restPath, N).results;
        const j = 8;
        const frame = off[j];
        if (!ok(frame)) throw new Error("the rest path's frame 8 has no pose");
        const exact = tiltDegOf(closedFormPose(frame.H, K).R);
        const at = counted(restPath, N, {
            poseGuard: { mode: "closed-form-below", thresholdDeg: exact },
        }).results[j];
        const above = counted(restPath, N, {
            poseGuard: { mode: "closed-form-below", thresholdDeg: exact + 1e-9 },
        }).results[j];
        const below = counted(restPath, N, {
            poseGuard: { mode: "closed-form-below", thresholdDeg: exact - 1e-9 },
        }).results[j];
        if (!(ok(at) && ok(above) && ok(below))) throw new Error("a frame lost its pose");
        expect(at.poseGuard).toEqual({ tiltDeg: exact, guarded: false });
        expect(at.pose).toBe(at.poseSelection.pose);
        expect(above.poseGuard).toEqual({ tiltDeg: exact, guarded: true });
        expect(samePose(above.pose, closedFormPose(frame.H, K))).toBe(true);
        expect(below.poseGuard).toEqual({ tiltDeg: exact, guarded: false });
    }, 60_000);

    it("guards no frame at 0, with the key still present", () => {
        for (const r of counted(restPath, N, {
            poseGuard: { mode: "closed-form-below", thresholdDeg: 0 },
        }).results.filter(ok)) {
            expect(r.poseGuard!.guarded).toBe(false);
            expect(r.pose).toBe(r.poseSelection.pose);
        }
    }, 60_000);
});

describe("the poseGuard option: the counter (G2, on a synthetic path)", () => {
    const N = SETTLE_SLIDE_FRAMES + SETTLE_REST_FRAMES;

    it("is the off run's count plus the frames guarded whose selection had not fallen back", () => {
        const off = counted(settlePath, N);
        for (const thresholdDeg of [0, 10, 180]) {
            const on = counted(settlePath, N, {
                poseGuard: { mode: "closed-form-below", thresholdDeg },
            });
            const added = on.results
                .filter(ok)
                .filter((r) => r.poseGuard!.guarded && r.poseSelection.chosen !== "fallback");
            expect(on.fallbackFrames).toBe(off.fallbackFrames + added.length);
            if (thresholdDeg > 0) expect(added.length).toBeGreaterThan(0);
        }
    }, 120_000);

    it("counts a frame both guarded and fallen back once", () => {
        // On the corpus such frames are G2's negative in the dated check. Here,
        // the counter's own inputs over every frame this path reaches.
        const on = counted(leaveAndReturn, 106, ON);
        const off = counted(leaveAndReturn, 106);
        const posed = on.results.filter(ok);
        const fellBack = posed.filter((r) => r.poseSelection.chosen === "fallback").length;
        const guardedOnly = posed.filter(
            (r) => r.poseGuard!.guarded && r.poseSelection.chosen !== "fallback",
        ).length;
        expect(off.fallbackFrames).toBe(fellBack);
        expect(on.fallbackFrames).toBe(fellBack + guardedOnly);
    }, 60_000);
});

describe("the poseGuard option: with the filter (G5, on a synthetic path)", () => {
    it("filters the guard's output, frame by frame, and leaves poseSelection", () => {
        const N = SETTLE_SLIDE_FRAMES + SETTLE_REST_FRAMES;
        const guarded = counted(settlePath, N, ON).results;
        const both = counted(settlePath, N, { ...ON, poseFilter: { mode: "one-euro" } }).results;
        const filter = new PoseFilter({
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
        let moved = 0;
        guarded.forEach((g, k) => {
            const out = filter.apply(g);
            const b = both[k];
            if (!(ok(g) && ok(b))) {
                expect(b.ok).toBe(g.ok);
                return;
            }
            expect(samePose(b.pose, out!)).toBe(true);
            expect(firstDifference(b.poseSelection, g.poseSelection)).toBeNull();
            expect(firstDifference(b.poseGuard, g.poseGuard)).toBeNull();
            if (!samePose(b.pose, g.pose)) moved++;
        });
        expect(moved).toBeGreaterThan(0);
    }, 120_000);
});

describe("the poseGuard option: refusals, each by name", () => {
    const make = (poseGuard: unknown) => () =>
        new NftTracker(cv, target, K, { poseGuard } as unknown as NftTrackerOptions);

    it("accepts the documented shapes", () => {
        expect(make({ mode: "off" })).not.toThrow();
        expect(make({ mode: "closed-form-below" })).not.toThrow();
        for (const thresholdDeg of [0, 7, 10, 180]) {
            expect(make({ mode: "closed-form-below", thresholdDeg })).not.toThrow();
        }
    });

    it("refuses an unknown mode", () => {
        for (const mode of ["on", "closed-form", undefined, null, 1]) {
            expect(make({ mode })).toThrow(RangeError);
            expect(make({ mode })).toThrow(/poseGuard\.mode/);
        }
    });

    it("refuses a threshold given with the guard off", () => {
        for (const thresholdDeg of [10, 0]) {
            expect(make({ mode: "off", thresholdDeg })).toThrow(RangeError);
            expect(make({ mode: "off", thresholdDeg })).toThrow(/poseGuard\.thresholdDeg/);
        }
    });

    it("refuses a threshold that is not finite or lies outside [0, 180]", () => {
        for (const thresholdDeg of [NaN, Infinity, -Infinity, -1e-9, 180.000001, "10", null]) {
            const f = make({ mode: "closed-form-below", thresholdDeg });
            expect(f).toThrow(RangeError);
            expect(f).toThrow(/poseGuard\.thresholdDeg/);
        }
    });

    it("refuses a key the option does not read, naming it, and suggests the key a case slip meant", () => {
        const cases: [unknown, RegExp, RegExp | null][] = [
            [
                { mode: "closed-form-below", thresholddeg: 7 },
                /poseGuard\.thresholddeg/,
                /thresholdDeg/,
            ],
            [{ mode: "closed-form-below", threshold: 7 }, /poseGuard\.threshold\b/, null],
            [{ mode: "off", foo: 1 }, /poseGuard\.foo/, null],
        ];
        for (const [poseGuard, name, hint] of cases) {
            const f = make(poseGuard);
            expect(f).toThrow(RangeError);
            expect(f).toThrow(name);
            expect(f).toThrow(/not a known key/);
            if (hint !== null) expect(f).toThrow(new RegExp(`did you mean ${hint.source}\\?`));
        }
    });
});
