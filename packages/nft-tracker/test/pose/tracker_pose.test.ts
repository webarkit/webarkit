/*
 *  tracker_pose.test.ts
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

// The tracker with IPPE in place of the backend's decomposition: criteria C10
// (no `poseFromHomography` call, on any frame) and C11 (the counter) of
// docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md, on a camera-path
// sequence of tracker_state_machine.test.ts's kind, with the shipped target.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../../src/tracker.js";
import type { TrackResult } from "../../src/tracker.js";
import { decode } from "../../src/target/format/index.js";
import type { TargetDb } from "../../src/target/types.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { withSeededRandom } from "../fixtures/seeded_rng.js";
import { renderWarp, view } from "../fixtures/warped_frames.js";
import { grid, poseError } from "./pose_metric.js";

const CAMERA = { width: 270, height: 360 };
const SEED = 20261015;
const image = readPgm(TARGET_FIXTURE);
const G = grid(image.width, image.height);

/** A backend that counts every call of each method and forwards it. */
function counting(cv: CvBackend): { cv: CvBackend; calls: Record<string, number> } {
    const calls: Record<string, number> = {};
    const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
    const wrapped: CvBackend = {
        capabilities: cv.capabilities,
        detect: (...a) => (count("detect"), cv.detect(...a)),
        describe: (...a) => (count("describe"), cv.describe(...a)),
        match: (...a) => (count("match"), cv.match(...a)),
        estimateHomography: (...a) => (count("estimateHomography"), cv.estimateHomography(...a)),
        poseFromHomography: (...a) => (count("poseFromHomography"), cv.poseFromHomography(...a)),
    };
    if (cv.filterMatches) {
        const f = cv.filterMatches.bind(cv);
        (wrapped as { filterMatches?: CvBackend["filterMatches"] }).filterMatches = (...a) => (
            count("filterMatches"),
            f(...a)
        );
    }
    return { cv: wrapped, calls };
}

function frameAt(i: number): { frame: GrayImage; H: Mat3 } {
    const c = (period: number) => 1 - Math.cos(i / period);
    const H = view({
        target: image,
        frame: CAMERA,
        scale: 0.45 + 0.03 * c(7),
        angle: ((5 * Math.PI) / 180) * c(11),
        shift: [10 * c(8), 8 * c(10)],
        perspective: [0.0003 * c(9), -0.0002 * c(13)],
    });
    const frame = renderWarp(image, H, {
        ...CAMERA,
        blurPasses: 1,
        noiseSigma: 2,
        gain: 1 + 0.08 * Math.sin(i / 5),
        bias: 6 * Math.sin(i / 7),
        seed: i + 1,
    });
    return { frame, H };
}

let backend: CvBackend;
let K: Mat3;
let target: TargetDb;

beforeAll(async () => {
    backend = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    const decoded = decode(
        new Uint8Array(
            readFileSync(
                fileURLToPath(
                    new URL("../../../../examples/targets/pinball.wnft", import.meta.url),
                ),
            ),
        ),
    );
    if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
    target = decoded.target;
});

function run(n: number, options?: ConstructorParameters<typeof NftTracker>[3]) {
    const { cv, calls } = counting(backend);
    const tracker = new NftTracker(cv, target, K, options);
    const truths: Mat3[] = [];
    const { value: results } = withSeededRandom(SEED, () =>
        Array.from({ length: n }, (_, i) => {
            const { frame, H } = frameAt(i);
            truths.push(H);
            return tracker.process(frame, i * 33);
        }),
    );
    return { tracker, results, truths, calls };
}

describe("NftTracker's pose comes from IPPE", () => {
    it("C10: calls the backend's poseFromHomography 0 times over 40 frames, DETECT and TRACK alike", () => {
        const { results, calls } = run(40);
        const states = results.map((r) => r.state[0]).join("");
        expect(states.startsWith("D")).toBe(true);
        expect(states).toContain("T");
        expect(calls.poseFromHomography ?? 0).toBe(0);
        expect(calls.detect).toBeGreaterThan(0);
    });

    it("C10, detection-only: 0 calls as well", () => {
        const { results, calls } = run(6, { detectionOnly: true });
        expect(results.every((r) => r.state !== "TRACK")).toBe(true);
        expect(results.some((r) => r.ok)).toBe(true);
        expect(calls.poseFromHomography ?? 0).toBe(0);
    });

    it("every posed frame carries a selection whose pose is the result's pose; the errors against the path are reported", () => {
        const { results, truths } = run(40);
        const posed = results.filter((r): r is Extract<TrackResult, { ok: true }> => r.ok);
        expect(posed.length).toBeGreaterThan(30);
        const eSel: number[] = [];
        const eOracle: number[] = [];
        for (const r of posed) {
            expect(r.poseSelection.pose).toBe(r.pose);
            expect(r.pose.good).toBe(true);
            const i = results.indexOf(r);
            // The path's homographies carry perspective terms that no rigid
            // pose reproduces exactly, so both decompositions have an error
            // against them. Reported, not judged: the criteria judge on the
            // rigid sets (acceptance.test.ts).
            eSel.push(poseError(K, r.pose, truths[i], G));
            eOracle.push(poseError(K, backend.poseFromHomography(r.H, K), truths[i], G));
        }
        const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
        console.log(
            `wander path, ${posed.length} posed frames: median e(selected) ${med(eSel).toFixed(3)} px, median e(oracle) ${med(eOracle).toFixed(3)} px`,
        );
    });

    it("C11: the per-run counter equals the number of frames reported ambiguous, and the fallback count every frame on the closed form", () => {
        const { tracker, results } = run(40);
        const ambiguous = results.filter((r) => r.ok && r.poseSelection.ambiguous).length;
        expect(tracker.ambiguousFrames).toBe(ambiguous);
        const fallbacks = results.filter(
            (r) => r.ok && r.poseSelection.chosen === "fallback",
        ).length;
        expect(tracker.fallbackFrames).toBe(fallbacks);
        expect(fallbacks).toBeGreaterThanOrEqual(ambiguous);
        const outcomes = results
            .filter((r): r is Extract<TrackResult, { ok: true }> => r.ok)
            .map((r) => r.poseSelection.outcome);
        console.log(
            `sequence of 40: ${outcomes.length} posed, ${ambiguous} ambiguous, outcomes ${JSON.stringify(
                Object.fromEntries(
                    [...new Set(outcomes)].map((o) => [o, outcomes.filter((x) => x === o).length]),
                ),
            )}`,
        );
    });

    it("a fresh tracker starts its counter at 0", () => {
        const tracker = new NftTracker(backend, target, K);
        expect(tracker.ambiguousFrames).toBe(0);
        expect(tracker.fallbackFrames).toBe(0);
    });
});
