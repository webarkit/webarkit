/*
 *  seeded_rng.test.ts
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

// ground-truth/fixtures/seeded_rng.ts after webarkit/webarkit#188: the
// seeded generator is injected through RansacOptions.rng, never installed as
// the global Math.random, and every seeded region refuses a read of the
// global (webarkit/webarkit#137, "Usage rule, 2026-10-15", points 1 and 3).
// Each check is exercised both ways: a constructed direct Math.random call,
// and a backend that does not declare deterministicRansac, must trip it.

import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { TargetDb } from "../src/target/types.js";
import { pinballTrackingTarget } from "../ground-truth/fixtures/tracking_target.js";
import {
    countedMulberry32,
    countGlobalRandomReads,
    mulberry32,
    requireDeterministicRansac,
    seededSource,
    withSeededRng,
} from "../ground-truth/fixtures/seeded_rng.js";
import { CAMERA, frameAt, wander } from "../ground-truth/tracker_sequences.js";

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
});

/** `cv` with its capabilities replaced. */
function declaring(deterministicRansac: boolean | undefined): CvBackend {
    const b = Object.create(cv) as CvBackend;
    Object.defineProperty(b, "capabilities", {
        value: { ...cv.capabilities, deterministicRansac },
    });
    return b;
}

describe("countedMulberry32", () => {
    it("hands out mulberry32(seed)'s sequence, and counts it", () => {
        const plain = mulberry32(20260925);
        const counted = countedMulberry32(20260925);
        expect(counted.draws()).toBe(0);
        for (let i = 0; i < 100; i++) expect(counted.rng()).toBe(plain());
        expect(counted.draws()).toBe(100);
    });
});

describe("requireDeterministicRansac", () => {
    it("passes on jsfeatNext, which declares the capability", () => {
        expect(cv.capabilities.deterministicRansac).toBe(true);
        expect(() => requireDeterministicRansac(cv)).not.toThrow();
    });

    it.each([false, undefined])("refuses a backend whose deterministicRansac is %s", (v) => {
        expect(() => requireDeterministicRansac(declaring(v))).toThrow(/deterministicRansac/);
        expect(() => seededSource(declaring(v))).toThrow(/deterministicRansac/);
        expect(() => withSeededRng(declaring(v), 1, () => 0)).toThrow(/deterministicRansac/);
    });
});

describe("a seeded region's zero-global-read check", () => {
    it("passes a region that reads no global, and counts the generator's draws", () => {
        const r = withSeededRng(cv, 1, (rng) => rng() + rng());
        expect(r.draws).toBe(2);
    });

    it("throws on a direct Math.random call inside the region, and restores the global", () => {
        const real = Math.random;
        expect(() => withSeededRng(cv, 1, () => Math.random())).toThrow(
            /1 read\(s\) of the global Math\.random/,
        );
        expect(Math.random).toBe(real);
    });

    it("is a counting wrapper: the reads it counts are the real Math.random's", () => {
        const real = Math.random;
        const r = countGlobalRandomReads(() => [Math.random(), Math.random()]);
        expect(r.reads).toBe(2);
        expect(r.value.every((x) => x >= 0 && x < 1)).toBe(true);
        expect(Math.random).toBe(real);
    });

    it("holds over a real tracker run, and trips on a backend that reads the global itself", () => {
        const frames = Array.from({ length: 6 }, (_, i) => frameAt(wander(i), i).frame);
        const s = seededSource(cv);
        const tracker = new NftTracker(cv, target, K, { rngFor: s.rngFor });
        const r = s.run(1, () =>
            frames.map((f, i) => tracker.process(f, i * 33).state[0]).join(""),
        );
        expect(r.value).toMatch(/^DT/);
        expect(r.draws).toBeGreaterThan(0);

        // A random choice that bypasses the injected generator.
        const leaky = Object.create(cv) as CvBackend;
        leaky.estimateHomography = (src, dst, options) => {
            Math.random();
            return cv.estimateHomography(src, dst, options);
        };
        const t = seededSource(leaky);
        const leaking = new NftTracker(leaky, target, K, { rngFor: t.rngFor });
        expect(() => t.run(1, () => leaking.process(frames[0], 0))).toThrow(
            /read\(s\) of the global Math\.random/,
        );
    }, 60_000);
});

describe("seededSource", () => {
    it("answers rngFor with the region's generator inside a region, and undefined outside", () => {
        const s = seededSource(cv);
        expect(s.rngFor()).toBeUndefined();
        const seen = s.run(7, (rng) => [s.rngFor() === rng, s.rngFor() === s.rngFor()]);
        expect(seen.value).toEqual([true, true]);
        expect(s.rngFor()).toBeUndefined();
    });

    it("makes a fresh generator for each region", () => {
        const s = seededSource(cv);
        const a = s.run(7, (rng) => [rng(), rng(), rng()]);
        const b = s.run(7, (rng) => [rng(), rng(), rng()]);
        expect(b.value).toEqual(a.value);
        expect(a.draws).toBe(3);
        expect(b.draws).toBe(3);
    });

    it("refuses a region inside another", () => {
        const s = seededSource(cv);
        expect(() => s.run(1, () => s.run(2, () => 0))).toThrow(/do not nest/);
        expect(s.rngFor()).toBeUndefined();
    });
});
