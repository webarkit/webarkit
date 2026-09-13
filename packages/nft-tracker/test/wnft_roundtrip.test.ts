/*
 *  wnft_roundtrip.test.ts
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

/**
 * The whole target path, end to end: image -> buildTargetFromImage -> encode
 * -> decode -> NftTracker, against the same tracker driven straight from the
 * in-memory target.
 *
 * **What this proves that the codec's own tests do not.** `test/target/format`
 * checks the codec against the specification and the shared corpus: synthetic
 * targets, built to exercise a rule. Nothing there hands a *real* target,
 * produced by a real backend from a real image, to the thing that consumes
 * one. This does, and asserts the strongest claim available — not "close
 * enough", but that the two trackers return the **same** numbers, bit for
 * bit. A file in between must be invisible.
 *
 * That claim is only reachable because every stage below is deterministic:
 * `detect`/`describe` are pure functions of their inputs (jsfeat-next 0.17,
 * webarkit/webarkit#27), the coordinates are already `f32` before they are
 * written, and the descriptor rows are bytes. The one remaining draw is
 * RANSAC's minimal sample, which is why both runs go through
 * `withSeededRandom` with the same seed — see `fixtures/seeded_rng.ts` for
 * why that has to reach a global today (webarkit/webarkit#24).
 *
 * So an equality failure here is never noise. It means the file lost or
 * changed something, and `expectTargetsEqual` says which field.
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import { decode, encode } from "../src/target/format/index.js";
import type { TargetDb } from "../src/target/types.js";
import { NftTracker } from "../src/tracker.js";
import type { TrackResult } from "../src/tracker.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";

/** Arbitrary, fixed: any seed works, the same one for both runs is the point. */
const SEED = 0x5eed;

type Backend = Awaited<ReturnType<typeof createJsfeatNextBackend>>;

let cv: Backend;
let targetImage: GrayImage;
let sceneImage: GrayImage;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    targetImage = readPgm(TARGET_FIXTURE);
    sceneImage = readPgm(SCENE_FIXTURE);
});

/** Every field of a decoded target, compared against the one that was encoded. */
function expectTargetsEqual(actual: TargetDb, expected: TargetDb): void {
    expect(actual.formatVersion).toBe(expected.formatVersion);
    expect(actual.generator).toBe(expected.generator);
    expect(actual.extensionsUsed).toEqual(expected.extensionsUsed);
    expect(actual.extensionsRequired).toEqual(expected.extensionsRequired);
    expect(actual.meta).toEqual(expected.meta);
    expect(actual.pyramid.scaleStep).toBe(expected.pyramid.scaleStep);
    expect(actual.pyramid.levelSizes).toEqual(expected.pyramid.levelSizes);

    const a = actual.keypoints;
    const e = expected.keypoints;
    expect(a.count).toBe(e.count);
    expect(a.detector).toEqual(e.detector);
    // Typed arrays, compared as typed arrays: `toEqual` on two of the same
    // kind is element-wise, and a length or element difference names itself.
    expect(a.levelStart).toEqual(e.levelStart);
    expect(a.x).toEqual(e.x);
    expect(a.y).toEqual(e.y);
    expect(a.angle).toEqual(e.angle);
    expect(a.score).toEqual(e.score);
    expect(a.level).toEqual(e.level);
    expect(a.size).toEqual(e.size);

    expect(actual.descriptorSets.length).toBe(expected.descriptorSets.length);
    for (let s = 0; s < expected.descriptorSets.length; s++) {
        const as = actual.descriptorSets[s];
        const es = expected.descriptorSets[s];
        expect(as.kind).toBe(es.kind);
        expect(as.norm).toBe(es.norm);
        expect(as.elementType).toBe(es.elementType);
        expect(as.dimensions).toBe(es.dimensions);
        expect(as.producer).toBe(es.producer);
        expect(as.params).toEqual(es.params);
        expect(as.count).toBe(es.count);
        expect(as.levelStart).toEqual(es.levelStart);
        expect(as.kpIndex).toEqual(es.kpIndex);
        expect(as.data).toEqual(es.data);
    }

    // The three optional members, compared even though this builder writes
    // only `info` and leaves the other two `undefined`. `info` is not
    // decoration: it is the key `compile-target` records its provenance in
    // (§5.9), and a decoder that dropped the whole object would otherwise
    // sail through every assertion above. The two `undefined`s cost nothing
    // and pin the shape, so a builder that starts emitting patches or a
    // reference image gets this comparison for free instead of silently
    // leaving the file unchecked.
    expect(actual.info).toEqual(expected.info);
    expect(actual.patches).toEqual(expected.patches);
    expect(actual.referenceImage).toEqual(expected.referenceImage);
}

/** One tracked frame, with the RANSAC draw seeded so two runs can be compared. */
function trackSeeded(target: TargetDb, frame: GrayImage): { result: TrackResult; draws: number } {
    const K = intrinsics(frame.width, frame.height);
    const run = withSeededRandom(SEED, () => new NftTracker(cv, target, K).process(frame, 0));
    return { result: run.value, draws: run.draws };
}

/** Homographies as plain arrays, so a mismatch prints all nine elements. */
const elements = (H: Mat3): number[] => Array.from(H);

describe("image -> build -> encode -> decode -> track", () => {
    /**
     * Built and round-tripped once for the whole file. Both cases below need
     * the same pair, and building a 2000-keypoint target twice costs more than
     * the rest of this suite put together.
     */
    let built: TargetDb;
    let viaFile: TargetDb;

    beforeAll(() => {
        built = buildTargetFromImage(cv, targetImage, {
            levels: 8,
            physicalSizeMm: [210, 297],
            name: "pinball",
        });

        const written = encode(built);
        if (!written.ok) {
            throw new Error(`encode refused the target: ${written.error} at ${written.detail}`);
        }

        const read = decode(written.bytes);
        if (!read.ok) throw new Error(`decode rejected our own bytes: ${read.error} — ${read.detail}`);
        expect(read.warnings).toEqual([]);
        viaFile = read.target;
    });

    it("round-trips a real target through a .wnft file unchanged", () => {
        expectTargetsEqual(viaFile, built);
    });

    it("tracks a frame identically whether or not the target went through a file", () => {
        const direct = trackSeeded(built, sceneImage);
        const fromFile = trackSeeded(viaFile, sceneImage);

        // The frame has to actually track, or "identical" would be the empty
        // claim that two failures look alike.
        expect(direct.result.ok).toBe(true);
        expect(fromFile.result.ok).toBe(true);

        expect(fromFile.result.numMatches).toBe(direct.result.numMatches);
        expect(fromFile.result.numInliers).toBe(direct.result.numInliers);
        // Both runs drew the same amount of randomness. Without this, a
        // divergence that happened to consume a different number of samples
        // could still land on equal numbers by luck.
        expect(fromFile.draws).toBe(direct.draws);

        if (!direct.result.ok || !fromFile.result.ok) return;
        expect(elements(fromFile.result.H)).toEqual(elements(direct.result.H));
        expect(fromFile.result.pose.good).toBe(direct.result.pose.good);
        expect(Array.from(fromFile.result.pose.R)).toEqual(Array.from(direct.result.pose.R));
        expect(Array.from(fromFile.result.pose.t)).toEqual(Array.from(direct.result.pose.t));
    });
});
