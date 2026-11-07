/*
 *  pose-metric.test.mjs
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

/**
 * `METRICS_VERSION` 2 against its registration, #228's criteria M0, M1, M5 and
 * M6 (docs/benchmarks/2026-11-06-228-133-stage3-registration.md, "Stage 3, B").
 * The criteria that need the clips are the dated check's, beside that file.
 *
 * The hashes below were taken at `122f637`, version 1's last commit on `dev`:
 * of each string of `DEFINITIONS`, of the two frozen functions' source with its
 * line endings normalised, and of two committed exports' comparison.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    compareExports,
    cornerJitter,
    countedLoopFrames,
    DEFINITIONS,
    frameRecord,
    METRICS_VERSION,
    READABLE_METRICS_VERSIONS,
    reprojectCorners,
    sequenceRefusal,
    summarizeRun,
} from "../js/bench-metrics.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const repo = (rel) => new URL(`../../${rel}`, import.meta.url);
const committed = (name) => JSON.parse(readFileSync(repo(`docs/benchmarks/${name}`), "utf8"));
/** A top-level function's text in a module, as a diff reads it: under Vitest, `toString` gives the transformed source. */
function source(file, name) {
    const text = readFileSync(repo(file), "utf8").replace(/\r\n/g, "\n");
    const start = text.indexOf(`export function ${name}(`);
    return sha256(text.slice(start, text.indexOf("\n}\n", start) + 3));
}

const VERSION_1_DEFINITIONS = {
    frames: "79cd6eb68c9edbaf56991ae6deffd06a",
    states: "8cb72fd8ee9271cbf50640b53b058cd3",
    trackShare: "01258d19a3e17f8929a31a1689979a91",
    loopWraps: "9b15d150f485c392cbfb739faadf5564",
    reacquisitions: "a1339661738774d07628686551ddb251",
    reacquisitionsAtLoopWrap: "fe3a4d988ae6867e06363d46f75aed83",
    lockLosses: "718651cf7f18f1667305e23624b962ec",
    firstSteps: "a5f209dfa13ef345b4dc6cba7585b99f",
    heldLockSteps: "a7392bfcb074ccf4285ad14dc52e819d",
    trackStepMs: "2c0615bfc595e1e3c275555e798a8fba",
    pyramidMs: "b9c9532832797db6330862f456b7dc5d",
    alignMs: "b466b89d1fd6324e78c8ca320125abb4",
    fitMs: "c23f46b78acd2372aa6c0801ee16c802",
    frameLevels: "c1bb4ecd01ad2a6cd9c8b66f6c60f391",
    fits: "97487f00bf072cc29f9e65b40af2ea87",
    quality: "83f16b93764b9338b55cfb18131941b7",
    trackedPatches: "ed19e67c0158122ffc067467643f18e5",
    lowQualityTrackFrames: "bd7eb7a85008b0f58c724024028955be",
    posedFrames: "c873930231fd9120b2bd0976c70b8ebc",
    jitterWindows: "4ccb1de818535ef508763b78828ef249",
    corners: "52e065cc978e3dd4656a1397d82adc68",
    jitterPx: "8fdffd81bf4868ee0bdf72f917270b6b",
    spreadPx: "4b1ece85f26274ed16d9194701641a33",
    alignment: "911231d6f150852d24864bfe5a928573",
    detectionPath: "3a66668119ce74835e5d38331d959a55",
    seed: "e9cd56e16a76e34767c89795bc135aed",
    seedPolicy: "d5ca74592785c0b9cc4a20ed361d6259",
    summaryMs: "089dbc6b8d78b09a65ff0101fe40a5f9",
    summaryMsFrames: "a201e598385486bb7fce847d95bcea64",
    endedBy: "3b4382064227a71727c0274daf9fc06f",
    failure: "7170a735b15f71ee38e4c553a486b433",
    lostVisibility: "26c7bf2a73d9bea97a0420279f915b5a",
    protocol: "d02481ba55a33af26d47119561eea5f1",
    provenance: "19a81396b977aa3230d7b2ca357da676",
    detectionAccounting: "8a221a930a812d03d733134a65087c71",
    detectionUseFallbackFrames: "362acc4d359966a1779ee748957637c8",
    staleReplies: "aaf146bf765711b1e0ad11d7ebec013a",
    detectionUse: "8e975fd27a9ce2b5cface396ff2060e5",
    trackTimeShare: "a3563e4055a78c8e3bfbe2e30169c97d",
    detectionLocks: "3698451e1a94ba525ec67e652b3c85c6",
    firstStepLatency: "2e4f63cddc48bfc7a2cf9dacab5ced23",
    detectionOutcomes: "a7028b32b2f221d16f3c55c9a9ac089c",
    trackFramesWithDetectionInFlight: "8af50d23ba8976da40cfa47f4223786f",
    frameMs: "598635bdbd27ecab56e7ed8c32026602",
    unlockedResidualMs: "9fd97b5b395faa6e5489593ae806c718",
    detectionTime: "53fa39a0d2068148ab66c82fcd64efb7",
};
const NEW_DEFINITIONS = [
    "H",
    "poseCorners",
    "posePosedFrames",
    "poseJitterWindows",
    "poseJitterPx",
    "poseSpreadPx",
    "poseCornerDistancePx",
];
const SUMMARY_KEYS = ["posePosedFrames", "poseJitterWindows", "poseJitterPx", "poseSpreadPx"];

/** The registered wording, read from the record itself: `- **`key`:** "…"`, one line each. */
function registeredWording() {
    const text = readFileSync(
        repo("docs/benchmarks/2026-11-06-228-133-stage3-registration.md"),
        "utf8",
    );
    const section = text.slice(
        text.indexOf("### `DEFINITIONS`, the exact wording"),
        text.indexOf("### What the bump does"),
    );
    return Object.fromEntries(
        [...section.matchAll(/^- \*\*`([^`]+)`:\*\* "(.*)"\r?$/gm)].map((m) => [m[1], m[2]]),
    );
}

describe("M0: version 1's definitions, byte for byte, and the seven new keys", () => {
    it("is version 2", () => {
        expect(METRICS_VERSION).toBe(2);
    });

    it.each(Object.entries(VERSION_1_DEFINITIONS))("%s keeps its string", (key, hash) => {
        expect(sha256(DEFINITIONS[key]).slice(0, 32)).toBe(hash);
    });

    it("has only the seven new keys beside version 1's, which stay in their order", () => {
        const version1 = Object.keys(VERSION_1_DEFINITIONS);
        expect(Object.keys(DEFINITIONS).slice(0, version1.length)).toEqual(version1);
        expect(Object.keys(DEFINITIONS).slice(version1.length).sort()).toEqual(
            [...NEW_DEFINITIONS].sort(),
        );
    });

    it("reads the seven in the record's wording, byte for byte", () => {
        const wording = registeredWording();
        expect(Object.keys(wording).sort()).toEqual([...NEW_DEFINITIONS].sort());
        for (const key of NEW_DEFINITIONS) expect(DEFINITIONS[key], key).toBe(wording[key]);
    });
});

/** Four frames in one second, with a wobble no straight line takes out. */
const posedFrames = (t0, wobble = 0.5, extra = () => ({})) =>
    [0, 0.25, 0.5, 0.75].map((dt, i) => {
        const d = i % 2 ? wobble : -wobble;
        const corners = (x) => [
            [x, 0],
            [x + 3, 0],
            [x + 3, 2],
            [x, 2],
        ];
        return {
            mediaTimeSeconds: t0 + dt,
            state: "TRACK",
            ok: true,
            corners: corners(100 + 7 * d),
            poseCorners: corners(d),
            ...extra(i),
        };
    });
const lostFrame = (t) => ({
    mediaTimeSeconds: t,
    state: "LOST",
    ok: false,
    corners: null,
    poseCorners: null,
});

describe("M1: the frozen metric", () => {
    it("leaves cornerJitter's source as it was", () => {
        expect(source("examples/js/bench-summary.mjs", "cornerJitter")).toBe(
            "004b6d9ad88c5ea45472babe7d1798b7241b1044eb159c333c578946bf2b1e1e",
        );
    });

    it("leaves reprojectCorners' source as it was", () => {
        expect(source("examples/js/bench-frames.mjs", "reprojectCorners")).toBe(
            "03be5d340460c82713a449c8c1fc98fddb5ed0a7af30fc3fa0fa9c3976d08e9d",
        );
    });

    const asPose = (frames) => frames.map((f) => ({ ...f, corners: f.poseCorners }));

    it("gives the summary's four keys from a call of it, over poseCorners", () => {
        const frames = [...posedFrames(0), ...posedFrames(1, 0.25)];
        const s = summarizeRun(frames);
        const frozen = cornerJitter(asPose(frames));
        expect({
            posePosedFrames: s.posePosedFrames,
            poseJitterWindows: s.poseJitterWindows,
            poseJitterPx: s.poseJitterPx,
            poseSpreadPx: s.poseSpreadPx,
        }).toEqual({
            posePosedFrames: frozen.posedFrames,
            poseJitterWindows: frozen.jitterWindows,
            poseJitterPx: frozen.jitterPx,
            poseSpreadPx: frozen.spreadPx,
        });
        expect(frozen.jitterWindows).toBe(2);
        expect(frozen.jitterPx).toBeGreaterThan(0);
        // The two families read different corners: `corners`' wobble is seven times this.
        expect(s.jitterPx).toBeCloseTo(7 * s.poseJitterPx, 9);
    });

    it("reads a frame with corners and no poseCorners in one family only", () => {
        const frames = posedFrames(0, 0.5, (i) => (i === 0 ? { poseCorners: null } : {}));
        const s = summarizeRun(frames);
        expect(s.posedFrames).toBe(4);
        expect(s.jitterWindows).toBe(1);
        expect(s.posePosedFrames).toBe(3);
        expect(s.poseJitterWindows).toBe(0);
        expect(s.poseJitterPx).toBeNull();
    });

    it("reads the loops by the clip's duration, as the summary always has", () => {
        // A restart that skips 0.7 s across the wrap: only the duration tells it from one.
        const frames = [...posedFrames(11), lostFrame(0.4)];
        expect(() => summarizeRun(frames)).not.toThrow();
        expect(() => summarizeRun(frames, { clipDurationS: 12 })).toThrow(
            /not the clip restarting/,
        );
    });

    it("keeps a window from spanning a wrap no posed frame is beside", () => {
        // Only an unposed frame stands at the wrap, so loops read from the posed frames alone
        // would pool the two passes' frames in one window.
        const pass = () => posedFrames(0).slice(0, 2);
        const frames = [...pass(), lostFrame(1.9), ...pass()];
        const s = summarizeRun(frames);
        expect(s.posePosedFrames).toBe(4);
        expect(s.poseJitterWindows).toBe(0);
    });

    it("reads the counted loops as every other key does", () => {
        const loop = (wobble) => [
            ...posedFrames(0, wobble),
            ...posedFrames(1, wobble),
            lostFrame(1.9),
        ];
        const frames = [...loop(5), ...loop(0.5), ...loop(5)];
        const counted = { firstLoop: 1, loopCount: 1 };
        const s = summarizeRun(frames, { clipDurationS: 2, loops: counted });
        const read = countedLoopFrames(frames, { clipDurationS: 2, ...counted });
        expect(s.posePosedFrames).toBe(8);
        expect(s.poseJitterPx).toBe(cornerJitter(asPose(read), { clipDurationS: 2 }).jitterPx);
        expect(s.poseJitterPx).toBeLessThan(cornerJitter(asPose(frames)).jitterPx);
    });

    it("has zero and null on the frames of an export older than the keys", () => {
        const frames = posedFrames(0).map(({ poseCorners: _gone, ...f }) => f);
        const s = summarizeRun(frames);
        expect([s.posePosedFrames, s.poseJitterWindows, s.poseJitterPx, s.poseSpreadPx]).toEqual([
            0,
            0,
            null,
            null,
        ]);
    });
});

describe("M5: the export", () => {
    const K = [100, 0, 50, 0, 100, 60, 0, 0, 1];
    const targetPoints = [
        [0, 0],
        [3, 0],
        [3, 2],
        [0, 2],
    ];
    // A quarter turn about x: not its own transpose, and its depth varies with y.
    const R = Float64Array.of(1, 0, 0, 0, 0, -1, 0, 1, 0);
    const t = Float64Array.of(1, 2, 10);
    const pose = { R, t, good: true };
    // By hand, K · [r1 r2 t] = [100 50 600; 0 60 800; 0 1 10], so x' = (100x + 50y + 600) / w,
    // y' = (60y + 800) / w and w = y + 10.
    const projected = [
        [60, 80],
        [90, 80],
        [(100 * 3 + 50 * 2 + 600) / 12, (60 * 2 + 800) / 12],
        [(50 * 2 + 600) / 12, (60 * 2 + 800) / 12],
    ];
    const H = Float64Array.of(0.1 + 0.2, 1 / 3, 7, 2 / 3, 1e-17, 11, 1e-9, Math.PI / 1e4, 1);
    const base = {
        stageTimings: {},
        timestampMs: 1000,
        mediaTimeSeconds: 1.5,
        targetPoints,
        K,
    };
    const tracked = { ok: true, state: "TRACK", H, pose, sceneKeypoints: [], numMatches: 9 };
    const detected = { ok: true, H, pose, sceneKeypoints: [], numMatches: 9, numInliers: 9 };
    const failed = {
        ok: false,
        reason: "too-few-matches",
        H: null,
        pose: null,
        sceneKeypoints: [],
        numMatches: 2,
        numInliers: 0,
    };
    const expectProjected = (corners) => {
        expect(corners).toHaveLength(4);
        corners.forEach(([x, y], c) => {
            expect(x, `corner ${c}, x`).toBeCloseTo(projected[c][0], 10);
            expect(y, `corner ${c}, y`).toBeCloseTo(projected[c][1], 10);
        });
    };

    it.each([
        ["tracking", tracked],
        ["detection-only", { ...tracked, state: "DETECT" }],
        ["stateless", detected],
    ])("gives H and poseCorners on a posed %s frame", (mode, result) => {
        const r = frameRecord({ mode, result, ...base });
        expectProjected(r.poseCorners);
        expect(r.H).toEqual(Array.from(H));
        expect(Array.isArray(r.H)).toBe(true);
    });

    it.each(["tracking", "detection-only", "stateless"])(
        "gives null for both on a %s frame that is not ok",
        (mode) => {
            const r = frameRecord({ mode, result: { ...failed, state: "LOST" }, ...base });
            expect(r.H).toBeNull();
            expect(r.poseCorners).toBeNull();
        },
    );

    it("reads no pose off a frame that is not ok, should one carry it", () => {
        const r = frameRecord({
            mode: "tracking",
            result: { ...failed, state: "LOST", pose },
            ...base,
        });
        expect(r.poseCorners).toBeNull();
    });

    it("keeps H at full precision, read back through JSON", () => {
        const back = JSON.parse(
            JSON.stringify(frameRecord({ mode: "tracking", result: tracked, ...base })),
        );
        H.forEach((v, i) => expect(Object.is(back.H[i], v), `H[${i}]`).toBe(true));
    });

    it("keeps version 1's keys in their place, with the two new ones after them", () => {
        const keys = Object.keys(frameRecord({ mode: "tracking", result: tracked, ...base }));
        expect(keys.slice(-2).sort()).toEqual(["H", "poseCorners"]);
        expect(keys.slice(0, -2).at(-1)).toBe("corners");
        expect(keys).toHaveLength(21);
    });

    it("reads the result's pose, not the selection's: filtered or guarded", () => {
        const other = { R: Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1), t, good: true };
        const r = frameRecord({
            mode: "tracking",
            result: { ...tracked, poseSelection: { pose: other } },
            ...base,
        });
        expectProjected(r.poseCorners);
    });

    it.each([
        ["no pose on an ok frame", null],
        ["a pose whose good is false", { R, t, good: false }],
        ["a target wholly behind the camera", { R, t: Float64Array.of(1, 2, -20), good: true }],
        ["one corner behind the camera", { R, t: Float64Array.of(1, 2, -1), good: true }],
        ["a corner at depth zero", { R, t: Float64Array.of(1, 2, 0), good: true }],
        ["a depth that is not a number", { R, t: Float64Array.of(1, 2, NaN), good: true }],
    ])("gives no poseCorners on %s", (_, p) => {
        const r = frameRecord({ mode: "tracking", result: { ...tracked, pose: p }, ...base });
        expect(r.poseCorners).toBeNull();
    });

    it("needs the depth rule: reprojectCorners alone accepts a target wholly behind", () => {
        const behind = {
            R: Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1),
            t: Float64Array.of(1, 2, -10),
            good: true,
        };
        // K · [r1 r2 t] of that pose, all its w negative: the same homography, and a pose no eye sees.
        expect(reprojectCorners([100, 0, -400, 0, 100, -400, 0, 0, -10], targetPoints)).toEqual([
            [40, 40],
            [10, 40],
            [10, 20],
            [40, 20],
        ]);
        const r = frameRecord({ mode: "tracking", result: { ...tracked, pose: behind }, ...base });
        expect(r.poseCorners).toBeNull();
    });

    it("gives no poseCorners when the four do not project to finite points", () => {
        const singular = [Infinity, 0, 0, 0, 100, 0, 0, 0, 1];
        const r = frameRecord({ mode: "tracking", result: tracked, ...base, K: singular });
        expect(r.poseCorners).toBeNull();
    });

    it.each([
        ["absent", undefined],
        ["null", null],
        ["of the wrong length", [1, 2, 3]],
    ])("throws with K %s", (_, bad) => {
        for (const [mode, result] of [
            ["tracking", tracked],
            ["detection-only", tracked],
            ["stateless", detected],
            ["tracking", { ...failed, state: "LOST" }],
        ]) {
            expect(() => frameRecord({ mode, result, ...base, K: bad })).toThrow(/\bK\b/);
        }
    });

    it("puts the summary's four keys after version 1's", () => {
        expect(Object.keys(summarizeRun(posedFrames(0))).slice(-4)).toEqual(SUMMARY_KEYS);
    });

    it("defines every key the frame and the summary add", () => {
        for (const key of ["H", "poseCorners", ...SUMMARY_KEYS]) {
            expect(DEFINITIONS, key).toHaveProperty(key);
        }
    });
});

describe("M6: the gate, and the pose part of a comparison", () => {
    const run = (frames, metricsVersion = 2, o = {}) => ({
        metricsVersion,
        mode: "tracking",
        source: "bundled",
        bundledClip: "pinball-static.mp4",
        processingResolution: { width: 203, height: 360 },
        frames,
        ...o,
    });
    const SQUARE = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
    ];
    const shifted = (shifts) => SQUARE.map(([x, y], c) => [x + shifts[c][0], y + shifts[c][1]]);
    const moved = (dx) => shifted(SQUARE.map(() => [dx, 0]));
    const frame = (t, poseCorners = SQUARE) => ({
        mediaTimeSeconds: t,
        state: "TRACK",
        ok: true,
        corners: SQUARE,
        poseCorners,
    });
    const underH = ({ commonMediaTimes, first, second }) =>
        sha256(JSON.stringify({ commonMediaTimes, first, second }));
    const TIMES = [0.1, 0.2, 0.3, 0.4];

    it("reads versions 1 and 2, and nothing else", () => {
        expect(READABLE_METRICS_VERSIONS).toEqual([1, 2]);
        expect(Object.isFrozen(READABLE_METRICS_VERSIONS)).toBe(true);
    });

    it.each([
        [
            "2026-09-26-tab9-ondevice-stateless-wall.json",
            "2026-09-26-oppo-a72-ondevice-stateless-wall.json",
            "6dc54109e067ea99896b0a56d8817e18335143dc644d66d7dec87be508719644",
        ],
        [
            "2026-09-28-tab9-tuning-r1-baseline-wall.json",
            "2026-09-28-tab9-tuning-r1-iter20-wall.json",
            "dac4990358b93957e07dc4c2878ce322b829ccd36f73c7efd8658ce017bec02d",
        ],
    ])("compares two committed version 1 exports as at the base: %s, %s", (a, b, hash) => {
        const first = committed(a);
        const second = committed(b);
        expect([first.metricsVersion, second.metricsVersion]).toEqual([1, 1]);
        const r = compareExports(first, second);
        expect(underH(r)).toBe(hash);
        expect(r.pose).toBeNull();
    });

    it("compares a version 1 and a version 2 likewise, in either order, pose part null", () => {
        const v1 = committed("2026-09-26-tab9-ondevice-stateless-wall.json");
        const other = committed("2026-09-26-oppo-a72-ondevice-stateless-wall.json");
        const v2 = {
            ...other,
            metricsVersion: 2,
            frames: other.frames.map((f) => ({ ...f, poseCorners: f.corners })),
        };
        const r = compareExports(v1, v2);
        expect(underH(r)).toBe("6dc54109e067ea99896b0a56d8817e18335143dc644d66d7dec87be508719644");
        expect(r.pose).toBeNull();
        expect(compareExports(v2, v1).pose).toBeNull();
    });

    it("gives no pose part on a pair with a version 1 export, whatever its frames carry", () => {
        const frames = TIMES.map((t) => frame(t));
        expect(compareExports(run(frames), run(frames)).pose.commonFrames).toBe(4);
        expect(compareExports(run(frames, 1), run(frames)).pose).toBeNull();
        expect(compareExports(run(frames), run(frames, 1)).pose).toBeNull();
        expect(compareExports(run(frames, 1), run(frames, 1)).pose).toBeNull();
    });

    it("gives two version 2 exports the pose part, with a corner distance of known value", () => {
        const a = run([0.1, 0.2, 0.3, 0.4, 0.5].map((t) => frame(t)));
        // Per frame the four corners move by 1, 2, 3 and 6 px times a frame's factor: a mean of 3
        // times it, a sum of 12 times it. The factors are 1, 2, 3, 40, 50: a median of 9 px, and a
        // mean over the frames would read far above it.
        const by = (f) => [
            [f, 0],
            [0, 2 * f],
            [-3 * f, 0],
            [0, -6 * f],
        ];
        const b = run([1, 2, 3, 40, 50].map((f, i) => frame(0.1 * (i + 1), shifted(by(f)))));
        const r = compareExports(a, b);
        expect(r.pose.commonMediaTimes).toBe(5);
        expect(r.pose.commonFrames).toBe(5);
        expect(r.pose.poseCornerDistancePx).toBe(9);
        expect(r.pose.first).toEqual({
            poseJitterPx: 0,
            poseSpreadPx: 0,
            poseJitterWindows: 1,
        });
        expect(r.pose.second.poseJitterWindows).toBe(1);
        expect(r.pose.second.poseJitterPx).toBeGreaterThan(0);
        expect(r.pose.second.poseSpreadPx).toBeGreaterThan(0);
        // The comparison under H does not move: the same corners in both.
        expect(r.first.jitterPx).toBe(0);
        expect(r.second.jitterPx).toBe(0);
    });

    it("reads the pose part only on the media times where both have poseCorners", () => {
        const times = [0.2, 0.3, 0.4, 0.5];
        const a = run([frame(0.1, moved(500)), ...times.map((t) => frame(t))]);
        const b = run([frame(0.1, null), ...times.map((t) => frame(t))]);
        const r = compareExports(a, b);
        expect(r.commonMediaTimes).toBe(5);
        expect(r.pose.commonMediaTimes).toBe(4);
        expect(r.pose.first.poseSpreadPx).toBe(0);
        expect(r.pose.poseCornerDistancePx).toBe(0);
    });

    it("gives a null pose part, and stands under H, with no common poseCorners", () => {
        const a = run([frame(0.1), frame(0.2, null)]);
        const b = run([frame(0.1, null), frame(0.2)]);
        const r = compareExports(a, b);
        expect(r.commonMediaTimes).toBe(2);
        expect(r.first.posedFrames).toBe(2);
        expect(r.pose).toBeNull();
    });

    it("gives a null pose part on two version 2 exports with no poseCorners at all", () => {
        const { poseCorners: _gone, ...bare } = frame(0.1);
        expect(compareExports(run([bare]), run([bare])).pose).toBeNull();
    });

    it("pairs the k-th frame with the k-th at a media time, when a loop is unposed in one", () => {
        // First: loop 0 at 2 px, loop 1 at 8 px. Second: loop 0 unposed, loop 1 at 0 px. Its one
        // posed pass pairs with the first's first, the k-th with the k-th: 2 px, and not 8.
        const a = run([
            ...TIMES.map((t) => frame(t, moved(2))),
            lostFrame(0.9),
            ...TIMES.map((t) => frame(t, moved(8))),
        ]);
        const b = run([
            ...TIMES.map((t) => frame(t, null)),
            lostFrame(0.9),
            ...TIMES.map((t) => frame(t)),
        ]);
        const r = compareExports(a, b);
        expect(r.pose.commonMediaTimes).toBe(4);
        expect(r.pose.commonFrames).toBe(4);
        expect(r.pose.poseCornerDistancePx).toBe(2);
        // Every occurrence is kept in each run's jitter, as `alignment` keeps them.
        expect(r.pose.first.poseJitterWindows).toBe(2);
        expect(r.pose.second.poseJitterWindows).toBe(1);
    });

    it("reads each run's loops from all its frames in the pose part too", () => {
        const frames = [
            frame(10.5),
            frame(11.0),
            lostFrame(11.5),
            lostFrame(11.9),
            lostFrame(0.05),
            lostFrame(0.5),
            frame(1.0),
            frame(1.5),
        ];
        const r = compareExports(run(frames), run(frames));
        expect(r.pose.first.poseJitterWindows).toBe(0);
        expect(r.pose.first.poseJitterPx).toBeNull();
    });

    it("reads each run's wraps by its own clip duration in the pose part too", () => {
        // A step back of exactly 0.5 s: a wrap only with the duration, and refused without it.
        const frames = [frame(0.2), frame(0.55), frame(0.05), frame(0.2)];
        const timed = run(frames, 2, { clipDurationS: 0.6 });
        expect(() => compareExports(run(frames), run(frames))).toThrow(/not the clip restarting/);
        expect(compareExports(timed, timed).pose.commonFrames).toBe(4);
    });

    it.each([
        ["no version", undefined],
        ["null", null],
        ["version 3", 3],
        ["version 0", 0],
        ["the string 2", "2"],
    ])("refuses %s, naming what it reads, in either place", (_, version) => {
        const good = run([frame(0.1)]);
        const bad = { ...good, metricsVersion: version };
        for (const pair of [
            [good, bad],
            [bad, good],
        ]) {
            expect(() => compareExports(...pair)).toThrow(/metricsVersion .*not 1 or 2/);
        }
    });

    describe("sequenceRefusal", () => {
        const expected = { sha256: "ab", clips: ["pinball-static.mp4"] };
        const e = (metricsVersion) => ({
            metricsVersion,
            mode: "tracking",
            source: "bundled",
            bundledClip: "pinball-static.mp4",
            target: { sha256: "ab" },
            tracker: { options: {} },
            processingBox: { width: 360, height: 360 },
            processingResolution: { width: 203, height: 360 },
        });

        it.each([1, 2])("reads version %i", (version) => {
            expect(sequenceRefusal(e(version), expected)).toBeNull();
        });

        it.each([[undefined], [null], [3], [0], ["2"]])("refuses version %s", (version) => {
            expect(sequenceRefusal(e(version), expected)).toMatch(/metricsVersion .*not 1 or 2/);
        });

        it("reads the committed export whose replay R-replay's stdout holds", () => {
            const wnft = readFileSync(repo("examples/targets/pinball.wnft"));
            expect(
                sequenceRefusal(committed("2026-10-13-tab9-m4-preflight-sync-wall.json"), {
                    sha256: sha256(wnft),
                    clips: ["pinball-bench.mp4"],
                }),
            ).toBeNull();
        });
    });
});
