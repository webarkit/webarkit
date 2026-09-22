/*
 *  purity.test.ts
 *  cv-backend-jsfeatnext
 *
 *  This file is part of cv-backend-jsfeatnext - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  cv-backend-jsfeatnext is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  cv-backend-jsfeatnext is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with cv-backend-jsfeatnext.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * The contract's purity rule, run against this backend (#27).
 *
 * `detect`, `describe` and `match` are pure functions of their arguments —
 * implied by "stateless", stated on `CvBackend`, and until now enforced by
 * nothing. This backend is exactly where that mattered: its `detect` used to
 * return different keypoints for the same image across calls, because FAST read
 * one never-written scratch cell per row and two pool buffers leaked per
 * overflow. A person noticed that a compiled target would not reproduce; no
 * test looked.
 *
 * The check itself lives in `@webarkit/cv-backend-spec` rather than here, so
 * the next backend inherits it instead of having to remember it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { findPurityViolations, type CvBackend, type GrayImage } from "@webarkit/cv-backend-spec";

import { createJsfeatNextBackend } from "../src/index.js";

const W = 200;
const H = 200;

/**
 * The same textured scene `backend.test.ts` uses, and for its reasons: smooth
 * gradients give FAST nothing to find and ORB nothing to discriminate, while
 * pixel noise defeats the descriptor. Bright squares on a gently varying ground
 * give both what they need.
 */
function render(): GrayImage {
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
            let v = 60 + 25 * Math.sin(x / 23) * Math.cos(y / 19);
            for (const [cx, cy] of [
                [55, 45],
                [140, 60],
                [70, 150],
                [155, 140],
                [105, 100],
            ]) {
                if (Math.abs(x - cx!) < 9 && Math.abs(y - cy!) < 9) v = 215;
            }
            data[y * W + x] = v & 0xff;
        }
    }
    return { data, width: W, height: H };
}

let cv: CvBackend;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
});

describe("purity (#27)", () => {
    it("detect, describe and match are pure functions of their inputs", () => {
        const report = findPurityViolations(cv, render());

        // Reported before the assertion that matters, so a failure says what
        // changed rather than only that something did.
        expect(report.violations).toEqual([]);
    });

    it("the probe actually exercised all three, so a pass is not vacuous", () => {
        // A probe image yielding no keypoints produces no descriptors and no
        // matches, and every comparison inside the check then trivially
        // succeeds. That green would establish nothing, which is worse than a
        // red one — this is the guard against it.
        const { coverage } = findPurityViolations(cv, render());

        expect(coverage.keypoints).toBeGreaterThan(0);
        expect(coverage.descriptors).toBeGreaterThan(0);
        expect(coverage.matches).toBeGreaterThan(0);
    });

    it("is still pure on a backend that has already done unrelated work", () => {
        // The historical defect made the *first* call on a fresh backend
        // disagree with every later one, because an overflow had permanently
        // rotated the buffer pool. A check run only on a pristine instance
        // would have missed it.
        const image = render();
        for (let i = 0; i < 3; i += 1) {
            cv.detect({
                data: new Uint8Array(W * H).fill(i * 40),
                width: W,
                height: H,
            });
        }

        expect(findPurityViolations(cv, image).violations).toEqual([]);
    });
});
