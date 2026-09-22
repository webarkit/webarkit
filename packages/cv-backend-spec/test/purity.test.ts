/*
 *  purity.test.ts
 *  cv-backend-spec
 *
 *  This file is part of cv-backend-spec - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  cv-backend-spec is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  cv-backend-spec is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with cv-backend-spec.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * Tests for the purity conformance check itself.
 *
 * A checker that reports nothing is indistinguishable from a codebase with
 * nothing to report, so the cases that matter here are the **impure** stubs:
 * each one breaks purity in one method, in the shape a real defect takes, and
 * the check has to name it. Without these, `findPurityViolations` returning
 * `[]` against a real backend would mean only that it returns `[]`.
 */

import { describe, expect, it } from "vitest";
import {
    findPurityViolations,
    type CvBackend,
    type BackendCapabilities,
    type Descriptors,
    type GrayImage,
    type Keypoint,
    type Match,
    type PointArray,
} from "../src/index";

const CAPS: BackendCapabilities = {
    name: "stub",
    detectors: ["fast"],
    descriptors: ["orb"],
    defaultDescriptor: "orb",
    matchFilters: [],
};

/** A probe image with enough content that `shifted()` produces a different one. */
const IMAGE: GrayImage = {
    data: Uint8Array.from({ length: 32 * 32 }, (_, i) => (i * 7) & 0xff),
    width: 32,
    height: 32,
};

const descriptorsOf = (count: number, seed: number): Descriptors => ({
    data: Uint8Array.from({ length: count * 32 }, (_, i) => (i + seed) & 0xff),
    count,
    bytesPerDescriptor: 32,
    kind: "orb",
    norm: "hamming",
});

/**
 * A stub that is pure unless one of the `impure*` flags is set, in which case
 * the named method changes its answer on every call.
 */
function makeBackend(impure: { detect?: boolean; describe?: boolean; match?: boolean } = {}) {
    let detectCalls = 0;
    let describeCalls = 0;
    let matchCalls = 0;

    const backend: CvBackend = {
        capabilities: CAPS,

        detect(image: GrayImage): Keypoint[] {
            detectCalls += 1;
            // Content-derived, so the decoy image genuinely gives a different
            // answer and the probe is not comparing constants.
            const base = image.data[0]! % 5;
            const drift = impure.detect === true ? detectCalls : 0;
            return Array.from({ length: 4 }, (_, i) => ({
                x: i * 3 + base + drift,
                y: i * 2,
                score: 1,
                angle: 0,
                level: 0,
            }));
        },

        describe(_image: GrayImage, keypoints: Keypoint[]): Descriptors {
            describeCalls += 1;
            return descriptorsOf(keypoints.length, impure.describe === true ? describeCalls : 0);
        },

        match(query: Descriptors, _train: Descriptors): Match[] {
            matchCalls += 1;
            const drift = impure.match === true ? matchCalls : 0;
            return Array.from({ length: query.count }, (_, i) => ({
                queryIdx: i,
                trainIdx: i,
                distance: drift,
            }));
        },

        estimateHomography(src: PointArray, dst: PointArray) {
            return {
                H: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
                inliers: new Uint8Array(src.length / 2).fill(1),
                numInliers: src.length / 2,
                ok: src.length === dst.length && src.length > 0,
            };
        },

        poseFromHomography() {
            return {
                R: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
                t: new Float64Array([0, 0, 1]),
                good: true,
            };
        },
    };
    return backend;
}

describe("findPurityViolations", () => {
    it("reports nothing for a pure backend", () => {
        expect(findPurityViolations(makeBackend(), IMAGE).violations).toEqual([]);
    });

    it("reports what the probe exercised, so a caller can refuse a vacuous pass", () => {
        const { coverage } = findPurityViolations(makeBackend(), IMAGE);
        expect(coverage.keypoints).toBe(4);
        expect(coverage.descriptors).toBe(4);
        expect(coverage.matches).toBe(4);
    });

    it("catches an impure detect, and says what differed", () => {
        const { violations } = findPurityViolations(makeBackend({ detect: true }), IMAGE);
        expect(violations.map((v) => v.method)).toContain("detect");
        expect(violations.find((v) => v.method === "detect")?.detail).toMatch(/index 0:/);
    });

    it("catches an impure describe, down to the byte", () => {
        const { violations } = findPurityViolations(makeBackend({ describe: true }), IMAGE);
        const detail = violations.find((v) => v.method === "describe")?.detail;
        expect(detail).toMatch(/data byte \d+:/);
    });

    it("catches an impure match", () => {
        const { violations } = findPurityViolations(makeBackend({ match: true }), IMAGE);
        expect(violations.map((v) => v.method)).toContain("match");
    });

    it("separates the repeated calls with work on a different image", () => {
        // The historical defect was state carried across *unrelated* calls, so
        // a probe that repeated a call back to back would have missed it. This
        // asserts the decoy really is a different image: a backend whose answer
        // depends on content must see more than one.
        const seen: number[] = [];
        const cv = makeBackend();
        const spy: CvBackend = {
            ...cv,
            detect(image: GrayImage) {
                seen.push(image.data[0]!);
                return cv.detect(image);
            },
        };
        findPurityViolations(spy, IMAGE);
        expect(new Set(seen).size).toBeGreaterThan(1);
    });
});
