/*
 *  replay-seeding.test.mjs
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

// The replay's seeding (#151): scripts/replay-seeding.mjs's generators and
// guards, and the replay's own loop (scripts/replay-run.mjs) run under each
// policy on rendered frames of the committed target, so that no clip is
// decoded and no ffmpeg is needed. Imports the built dist/, as the replay does:
// `npm run build` first, which CI does.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    createJsfeatNextBackend,
    intrinsics,
} from "../../packages/cv-backend-jsfeatnext/dist/index.js";
import { decode, NftTracker } from "../../packages/nft-tracker/dist/index.js";
import { readPgm, TARGET_FIXTURE } from "../../packages/nft-tracker/ground-truth/fixtures/pgm.ts";
import {
    renderWarp,
    view,
} from "../../packages/nft-tracker/ground-truth/fixtures/warped_frames.ts";
import { targetCorners } from "../js/bench-metrics.mjs";
import { frameRng, runRng } from "../js/frame-rng.mjs";
import { replayRun } from "../../scripts/replay-run.mjs";
import {
    countGlobalRandomReads,
    runSeeding,
    seedingRefusal,
} from "../../scripts/replay-seeding.mjs";

const draws = (rng, n) => Array.from({ length: n }, () => rng());

describe("runSeeding", () => {
    it("is null without a seed: the replay draws from Math.random, as it always has", () => {
        expect(runSeeding(null, "frame")).toBeNull();
        expect(runSeeding(null, "run")).toBeNull();
    });

    it("under run, hands every detection one generator, mulberry32 of the seed (#188's policy)", () => {
        const s = runSeeding(7, "run");
        s.frame(0.5);
        const a = s.rngFor({ timestampMs: 500 });
        s.frame(1.5);
        expect(s.rngFor({ timestampMs: 1500 })).toBe(a);
        expect(s.detectionRng(2.5)).toBe(a);
        expect(draws(a, 16)).toEqual(draws(runRng(7), 16));
    });

    it("under run, gives each run its own generator", () => {
        const one = runSeeding(7, "run");
        const two = runSeeding(7, "run");
        expect(draws(one.detectionRng(0), 8)).toEqual(draws(two.detectionRng(0), 8));
    });

    it("under frame, hands the frame being processed frameRng(seed, its media time)", () => {
        const s = runSeeding(3, "frame");
        s.frame(29835616 / 1e6);
        expect(draws(s.rngFor({ timestampMs: 12.5 }), 16)).toEqual(
            draws(frameRng(3, 29.835616), 16),
        );
        // Keyed on the media time, never on timestampMs.
        s.frame(1 / 30);
        expect(draws(s.rngFor({ timestampMs: 12.5 }), 16)).toEqual(draws(frameRng(3, 1 / 30), 16));
    });

    it("under frame, gives a fresh generator to each detection, even of the same frame", () => {
        const s = runSeeding(3, "frame");
        s.frame(2);
        const a = s.rngFor({ timestampMs: 0 });
        const b = s.rngFor({ timestampMs: 0 });
        expect(a).not.toBe(b);
        expect(draws(a, 8)).toEqual(draws(b, 8));
    });

    it("under frame, keys an external detection on the detected frame's media time", () => {
        const s = runSeeding(3, "frame");
        s.frame(9);
        expect(draws(s.detectionRng(1.25), 8)).toEqual(draws(frameRng(3, 1.25), 8));
    });

    it("under frame, refuses a detection before any frame was set", () => {
        expect(() => runSeeding(3, "frame").rngFor({ timestampMs: 0 })).toThrow(/before the frame/);
    });

    it("refuses a policy it does not know", () => {
        expect(() => runSeeding(1, "frames")).toThrow(RangeError);
    });
});

describe("seedingRefusal", () => {
    it("is null for a backend that declares deterministicRansac", () => {
        expect(seedingRefusal({ capabilities: { name: "b", deterministicRansac: true } })).toBe(
            null,
        );
    });

    it.each([false, undefined])(
        "names a backend whose deterministicRansac is %s: it may ignore the generator",
        (value) => {
            expect(
                seedingRefusal({ capabilities: { name: "b", deterministicRansac: value } }),
            ).toBe(
                'the backend "b" does not declare deterministicRansac, so it may ignore an injected rng: refusing to run seeded',
            );
        },
    );
});

describe("countGlobalRandomReads", () => {
    it("counts none in a run that reads no Math.random, and returns its value", () => {
        expect(countGlobalRandomReads(() => 42)).toEqual({ value: 42, reads: 0 });
    });

    it("counts each read, passing it to the real Math.random", () => {
        const real = Math.random;
        const r = countGlobalRandomReads(() => [Math.random(), Math.random(), Math.random()]);
        expect(r.reads).toBe(3);
        for (const x of r.value) expect(x >= 0 && x < 1).toBe(true);
        expect(Math.random).toBe(real);
    });

    it("puts the real Math.random back when the run throws", () => {
        const real = Math.random;
        expect(() =>
            countGlobalRandomReads(() => {
                throw new Error("boom");
            }),
        ).toThrow("boom");
        expect(Math.random).toBe(real);
    });

    it("refuses a run that returns a thenable: its reads would not be seen", () => {
        expect(() => countGlobalRandomReads(() => Promise.resolve(1))).toThrow(TypeError);
    });
});

/** The reference device's camera path: 270 × 360 grey frames, the target at about 0.45. */
const CAMERA = { width: 270, height: 360 };
const image = readPgm(TARGET_FIXTURE);
/** Ten views of the target, a little apart; frame 0 is blank, so a lock never survives it. */
const VIEWS = 10;
const frames = [
    { data: new Uint8Array(CAMERA.width * CAMERA.height).fill(128), ...CAMERA },
    ...Array.from({ length: VIEWS }, (_, v) =>
        renderWarp(
            image,
            view({
                target: image,
                frame: CAMERA,
                scale: 0.42 + 0.01 * v,
                angle: 0.02 * v,
                shift: [3 * v - 12, 2 * v - 8],
            }),
            { ...CAMERA, blurPasses: 1, noiseSigma: 2, seed: v + 1 },
        ),
    ),
];
const pts = frames.map((_, i) => i / 30);

const cv = await createJsfeatNextBackend();
const decoded = decode(
    new Uint8Array(readFileSync(new URL("../targets/pinball.wnft", import.meta.url))),
);
const target = decoded.target;
const K = intrinsics(CAMERA.width, CAMERA.height);

/**
 * `replayRun` in tracking mode over `views` (indices into the ten), each after
 * the blank frame, so that every view is detected from LOST; returns, per
 * view, what the tracker's own detection on it gave.
 */
function detections(policy, views) {
    const order = views.flatMap((v) => [0, v + 1]);
    const seen = new Map();
    replayRun({
        NftTracker,
        cv,
        target,
        targetPoints: targetCorners(target.meta.widthPx, target.meta.heightPx),
        detectMs: 83.2,
        frames,
        pts,
        K,
        mode: "tracking",
        stepMs: null,
        order,
        options: {},
        probe: {
            frame: (frame, r) => {
                const v = frames.indexOf(frame) - 1;
                if (v < 0 || r.detectionUse !== "internal") return;
                seen.set(v, {
                    ok: r.ok,
                    numInliers: r.numInliers,
                    H: r.H ? Array.from(r.H) : null,
                });
            },
        },
        loops: 1,
        acquireMs: 0,
        unwrapped: false,
        seeding: runSeeding(1, policy),
    });
    return seen;
}

const ALL = Array.from({ length: VIEWS }, (_, v) => v);
const SUBSET = ALL.filter((v) => v % 3 !== 1);

/** The views both runs detected, and those of them whose detections differ. */
function compare(policy) {
    const every = detections(policy, ALL);
    const some = detections(policy, SUBSET);
    const common = SUBSET.filter((v) => every.has(v) && some.has(v));
    const differ = common.filter(
        (v) => JSON.stringify(every.get(v)) !== JSON.stringify(some.get(v)),
    );
    return { every, common, differ };
}

/**
 * `replayRun` over two loops of the first `n` views, each after the blank
 * frame, stamped on the loops' continuous timeline (`unwrapped`, as
 * `--external`'s arms 1 and 4 stamp theirs): per loop, per view, what the
 * tracker's own detection on it gave.
 */
function unwrappedDetections(policy, n) {
    const woven = Array.from({ length: n }, (_, v) => [frames[0], frames[v + 1]]).flat();
    const seen = [new Map(), new Map()];
    let k = 0;
    replayRun({
        NftTracker,
        cv,
        target,
        targetPoints: targetCorners(target.meta.widthPx, target.meta.heightPx),
        detectMs: 83.2,
        frames: woven,
        pts: woven.map((_, i) => i / 30),
        K,
        mode: "tracking",
        stepMs: null,
        order: null,
        options: {},
        probe: {
            frame: (frame, r) => {
                const loop = Math.floor(k / woven.length);
                const v = frames.indexOf(frame) - 1;
                k++;
                if (v < 0 || r.detectionUse !== "internal") return;
                seen[loop].set(v, { ok: r.ok, numInliers: r.numInliers, H: Array.from(r.H ?? []) });
            },
        },
        loops: 2,
        acquireMs: 0,
        unwrapped: true,
        seeding: runSeeding(1, policy),
    });
    return seen;
}

describe("the replay's loop, seeded per frame and per run (#151)", () => {
    // A frame stamped on the loops' timeline is a later stamp each loop, and
    // the same frame: the frame policy keys on its media time, never the stamp.
    it("under frame, detects a frame alike in every loop of an unwrapped run", () => {
        const [first, second] = unwrappedDetections("frame", 4);
        expect([...second.keys()]).toEqual([0, 1, 2, 3]);
        expect([...first.values()].filter((d) => d.ok).length).toBeGreaterThan(2);
        expect([...second.entries()]).toEqual([...first.entries()]);
    });

    // The point of the frame policy: a frame's detection is the same in a run
    // that processed every frame before it and in one that skipped some.
    it("under frame, detects every view both runs detected alike, whatever came before it", () => {
        const { every, common, differ } = compare("frame");
        expect(common).toEqual(SUBSET);
        // Detections that found the target, not only refusals that drew nothing.
        expect(SUBSET.filter((v) => every.get(v).ok).length).toBeGreaterThan(SUBSET.length / 2);
        expect(differ).toEqual([]);
    });

    // And what it corrects: under run, the generator one run hands its
    // detections has advanced by whatever the run detected before.
    it("under run, detects some view differently once the runs have detected different views", () => {
        const { common, differ } = compare("run");
        expect(common).toEqual(SUBSET);
        expect(differ.length).toBeGreaterThan(0);
        // The first view is detected first in both runs, from the same state.
        expect(differ).not.toContain(SUBSET[0]);
    });

    it("draws nothing from the global Math.random in a seeded run", () => {
        for (const policy of ["run", "frame"]) {
            expect(countGlobalRandomReads(() => detections(policy, SUBSET)).reads, policy).toBe(0);
        }
    });
});
