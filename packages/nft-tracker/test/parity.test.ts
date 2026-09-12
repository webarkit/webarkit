/*
 *  parity.test.ts
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

import { describe, it, expect, beforeAll } from "vitest";
import type {
    CvBackend,
    Descriptors,
    GrayImage,
    Keypoint,
    Mat3,
    Match,
} from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";

/*
 * ---------------------------------------------------------------------------
 * The reference pipeline.
 *
 * A longhand transcription of examples/pinball-static-jsfeatnext-backend.html
 * and the buildLevelIndex / sliceDescriptors / matchPerLevel that lived in
 * examples/js/pinball-shared.mjs before this milestone moved them. It shares
 * NO code with src/ on purpose: a reference side that called the package's
 * own helpers would compare the tracker against itself.
 *
 * Do not refactor these into the package's versions. Their whole value is
 * that they are a frozen copy of the behaviour being preserved.
 * ---------------------------------------------------------------------------
 */

/** Verbatim from the demo: slices a Descriptors set down to `indices`. */
function sliceDescriptors(d: Descriptors, indices: number[]): Descriptors {
    const bytes = d.bytesPerDescriptor;
    const data = new Uint8Array(indices.length * bytes);
    indices.forEach((src, i) => data.set(d.data.subarray(src * bytes, (src + 1) * bytes), i * bytes));
    return { ...d, data, count: indices.length };
}

/** Verbatim from the demo: groups a multi-scale target's rows by level. */
function referenceLevelIndex(
    kTarget: Keypoint[],
    dTarget: Descriptors
): { level: number; indices: number[]; descriptors: Descriptors }[] {
    const byLevel = new Map<number, number[]>();
    kTarget.forEach((k, i) => {
        const bucket = byLevel.get(k.level);
        if (bucket) bucket.push(i);
        else byLevel.set(k.level, [i]);
    });
    const levels: { level: number; indices: number[]; descriptors: Descriptors }[] = [];
    for (const [level, indices] of byLevel) {
        if (indices.length < 2) continue;
        levels.push({ level, indices, descriptors: sliceDescriptors(dTarget, indices) });
    }
    return levels;
}

/** Verbatim from the demo: best hit per query keypoint, one level at a time. */
function referenceMatchPerLevel(
    cv: CvBackend,
    dQuery: Descriptors,
    levelIndex: ReturnType<typeof referenceLevelIndex>,
    ratio: number
): Match[] {
    const best = new Map<number, Match>();
    for (const { indices, descriptors } of levelIndex) {
        for (const m of cv.match(dQuery, descriptors, { ratio })) {
            const prev = best.get(m.queryIdx);
            if (!prev || m.distance < prev.distance) {
                best.set(m.queryIdx, {
                    queryIdx: m.queryIdx,
                    trainIdx: indices[m.trainIdx],
                    distance: m.distance,
                });
            }
        }
    }
    return [...best.values()];
}

interface ReferenceResult {
    ok: boolean;
    numMatches: number;
    numInliers: number;
    H: Mat3 | null;
}

/**
 * The static demo's `run()`, minus the drawing.
 *
 * Call it inside `withSeededRandom`: the `estimateHomography` below draws from
 * `Math.random`, because the contract exposes no RNG to pass one in. Nothing
 * else here draws, so the seeded region is larger than it strictly needs to be
 * and costs nothing.
 */
function referencePipeline(cv: CvBackend, target: GrayImage, scene: GrayImage): ReferenceResult {
    const LEVELS = 8;
    const kScene = cv.detect(scene, { levels: 1, maxKeypoints: 900 });
    const kTarget = cv.detect(target, { levels: LEVELS, maxKeypoints: LEVELS * 260 });
    const dScene = cv.describe(scene, kScene);
    const dTarget = cv.describe(target, kTarget);

    const targetLevels = referenceLevelIndex(kTarget, dTarget);
    let matches = referenceMatchPerLevel(cv, dScene, targetLevels, 0.8);

    if (cv.filterMatches) {
        matches = cv.filterMatches(
            matches,
            { keypoints: kScene, width: scene.width, height: scene.height },
            { keypoints: kTarget, width: target.width, height: target.height }
        );
    }

    if (matches.length < 4) return { ok: false, numMatches: matches.length, numInliers: 0, H: null };

    const src = new Float64Array(matches.length * 2);
    const dst = new Float64Array(matches.length * 2);
    matches.forEach((m, i) => {
        src[i * 2] = kTarget[m.trainIdx].x;
        src[i * 2 + 1] = kTarget[m.trainIdx].y;
        dst[i * 2] = kScene[m.queryIdx].x;
        dst[i * 2 + 1] = kScene[m.queryIdx].y;
    });

    const h = cv.estimateHomography(src, dst, { threshold: 4 });
    return { ok: h.ok, numMatches: matches.length, numInliers: h.numInliers, H: h.ok ? h.H : null };
}

/** Verbatim from the demo: applies a row-major 3x3 homography to a point. */
function project(H: Mat3, x: number, y: number): [number, number] {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * How far apart two homographies place the target's corners, in pixels.
 *
 * H is homogeneous, so element-wise comparison compares an arbitrary
 * normalisation rather than a map. The corners are what the demo actually
 * draws, so their displacement is the quantity that means something.
 */
function maxCornerDisplacement(a: Mat3, b: Mat3, width: number, height: number): number {
    const corners: [number, number][] = [
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1],
    ];
    let worst = 0;
    for (const [x, y] of corners) {
        const [ax, ay] = project(a, x, y);
        const [bx, by] = project(b, x, y);
        worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
    }
    return worst;
}

/**
 * Tolerance on that displacement, in pixels.
 *
 * The two pipelines are identical by construction except for one thing: the
 * tracker's target coordinates round-trip through Float32Array, because the
 * target format stores them that way (5.5), while the demo keeps the Float64
 * numbers detect() returned. f32 carries a 24-bit significand, so at the
 * target's largest coordinate (640 px) that costs at most 640 * 2^-24, about
 * 3.8e-5 px per coordinate.
 *
 * 0.05 px is ~1000x that quantisation -- enough headroom for the 4-point DLT's
 * conditioning and the inlier refit to amplify it -- while staying ~80x below
 * the 4 px RANSAC threshold the estimate is fitted to and ~20x below the one
 * pixel the demo's overlay is judged in on screen. Anything larger is not f32
 * rounding, and widening this number would only hide that.
 *
 * This argument depends on both sides drawing the same RANSAC samples, which
 * is what withSeededRandom buys and why it is worth its ugliness until
 * RansacOptions carries an rng.
 *
 * Measured on these fixtures: 7.52e-06 px, roughly four orders of magnitude
 * inside this bound.
 */
const MAX_CORNER_DISPLACEMENT_PX = 0.05;

const SEED = 20260911;

let cv: CvBackend;
let stableCv: CvBackend;
let target: GrayImage;
let scene: GrayImage;
let K: Mat3;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    stableCv = stabilise(cv);
    target = readPgm(TARGET_FIXTURE);
    scene = readPgm(SCENE_FIXTURE);
    K = intrinsics(scene.width, scene.height);
});

/**
 * A backend wrapper that makes detect and describe HISTORY-FREE, so the two
 * pipelines under comparison see identical detector and descriptor outputs.
 *
 * Why it exists: jsfeatNext's detect is history-dependent -- earlier calls
 * on the instance (describes, matches, RANSAC runs) can shift coarse-level
 * corners on a later detect of the same image (diagnosed on this branch; an
 * upstream defect to file). The parity argument compares two PIPELINES given
 * the same CV outputs; it was never meant to also measure the backend's
 * cache behaviour. This wrapper enforces the "identical by construction"
 * premise the tolerance comment below relies on:
 *
 * - detect: memoised per (image, full DetectOptions) -- the first call
 *   computes, every later call replays the same keypoint objects. Keying on
 *   the whole options object (rather than picking out `levels` and
 *   `maxKeypoints` by hand) means an option the key would otherwise ignore --
 *   `threshold` today, anything added tomorrow -- cannot silently replay the
 *   wrong keypoints for a call that only shares the fields we remembered to
 *   name. `JSON.stringify` is safe as a key here because every call site in
 *   this file builds its options object the same way, so property order is
 *   stable across calls.
 * - describe: a per-keypoint row cache keyed by keypoint OBJECT IDENTITY.
 *   Descriptor rows are computed once per keypoint (on the first describe
 *   that sees it) and later describes assemble their output from the cache,
 *   whatever the array order -- valid because ORB describes each keypoint
 *   independently. That independence is CHECKED at runtime, not just
 *   asserted here: whenever a describe call recomputes (because it includes
 *   at least one keypoint not yet cached), every already-cached keypoint's
 *   freshly computed row is compared byte-for-byte against the row on file,
 *   and a descriptor-family change (bytesPerDescriptor, kind or norm) is
 *   compared too. Either mismatch throws rather than silently serving stale
 *   or inconsistent rows.
 *
 * match, estimateHomography and poseFromHomography stay real.
 */
function stabilise(cv: CvBackend): CvBackend {
    const detectMemo = new Map<string, Keypoint[]>();
    const images = new Map<GrayImage, number>();
    const imageId = (img: GrayImage): number => {
        if (!images.has(img)) images.set(img, images.size);
        return images.get(img)!;
    };
    const rows = new Map<Keypoint, Uint8Array>();
    let rowMeta: { bytesPerDescriptor: number; kind: Descriptors["kind"]; norm: Descriptors["norm"] } | null = null;
    return {
        capabilities: cv.capabilities,
        detect: (img, o) => {
            const key = `${imageId(img)}|${JSON.stringify(o ?? {})}`;
            let kps = detectMemo.get(key);
            if (!kps) {
                kps = cv.detect(img, o);
                detectMemo.set(key, kps);
            }
            return kps;
        },
        describe: (img, kps, o) => {
            if (kps.some((k) => !rows.has(k))) {
                const d = cv.describe(img, kps, o);
                if (
                    rowMeta &&
                    (rowMeta.bytesPerDescriptor !== d.bytesPerDescriptor ||
                        rowMeta.kind !== d.kind ||
                        rowMeta.norm !== d.norm)
                ) {
                    throw new Error(
                        "stabilise: describe returned a different descriptor family " +
                            "(bytesPerDescriptor/kind/norm) than a previous call -- the row cache " +
                            "assumes one family for the life of the wrapper and cannot be trusted " +
                            "across a change."
                    );
                }
                rowMeta = { bytesPerDescriptor: d.bytesPerDescriptor, kind: d.kind, norm: d.norm };
                kps.forEach((k, i) => {
                    const fresh = d.data.subarray(i * d.bytesPerDescriptor, (i + 1) * d.bytesPerDescriptor);
                    const cached = rows.get(k);
                    if (cached && !cached.every((v, j) => v === fresh[j])) {
                        throw new Error(
                            "stabilise: describe produced different bytes for a keypoint it had " +
                                "already described -- the per-keypoint independence this cache relies " +
                                "on does not hold, and the parity comparison cannot be trusted."
                        );
                    }
                    rows.set(k, fresh);
                });
                return d;
            }
            const meta = rowMeta!;
            const data = new Uint8Array(kps.length * meta.bytesPerDescriptor);
            kps.forEach((k, i) => data.set(rows.get(k)!, i * meta.bytesPerDescriptor));
            return { data, count: kps.length, bytesPerDescriptor: meta.bytesPerDescriptor, kind: meta.kind, norm: meta.norm };
        },
        match: (q, t, o) => cv.match(q, t, o),
        estimateHomography: (s, d, o) => cv.estimateHomography(s, d, o),
        poseFromHomography: (H2, K2) => cv.poseFromHomography(H2, K2),
    };
}

describe("NftTracker reproduces the demo pipeline", () => {
    it("locks on where the demo locks on, with the same matches and inliers", () => {
        // Each side runs under its OWN freshly seeded Math.random, so both
        // consume the identical sequence from their first draw. Building the
        // target is left outside the seeded region: it draws nothing, and
        // keeping the region down to the pipelines makes the symmetry visible.
        const targetDb = buildTargetFromImage(stableCv, target, { levels: 8 });
        const { value: reference } = withSeededRandom(SEED, () => referencePipeline(stableCv, target, scene));
        const { value: tracked } = withSeededRandom(SEED, () =>
            // 900 is the STATIC demo's budget; the webcam demo's 300 is the default.
            new NftTracker(stableCv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        // Guard the fixture itself: if the reference pipeline no longer finds
        // the target, "the two agree" would be a vacuous pass.
        expect(reference.ok).toBe(true);
        expect(reference.numInliers).toBeGreaterThanOrEqual(10);

        expect(tracked.ok).toBe(reference.ok);
        expect(tracked.numMatches).toBe(reference.numMatches);
        // Exactly equal: see MAX_CORNER_DISPLACEMENT_PX -- an f32 perturbation
        // of 4e-5 px cannot move a correspondence across a 4 px threshold.
        expect(tracked.numInliers).toBe(reference.numInliers);
    });

    it("recovers the same homography, to within the f32 storage of the target's coordinates", () => {
        const targetDb = buildTargetFromImage(stableCv, target, { levels: 8 });
        const { value: reference } = withSeededRandom(SEED, () => referencePipeline(stableCv, target, scene));
        const { value: tracked } = withSeededRandom(SEED, () =>
            new NftTracker(stableCv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        expect(reference.ok && tracked.ok).toBe(true);
        if (!reference.H || !tracked.ok) return;

        const displacement = maxCornerDisplacement(tracked.H, reference.H, target.width, target.height);
        // Logged so a reviewer sees the headroom, not just the verdict.
        console.log(`parity: max corner displacement ${displacement.toExponential(2)} px`);
        expect(displacement).toBeLessThan(MAX_CORNER_DISPLACEMENT_PX);
    });

    it("finds the same scene keypoints the demo's own detect call finds", () => {
        // Both `expected` and `tracked.sceneKeypoints` go through stableCv, so
        // they hit the same detect memo key when the tracker's own call uses
        // the demo's exact options -- (scene, { levels: 1, maxKeypoints: 900 }).
        // What this pins is therefore that the tracker issues that exact call,
        // NOT that two independent detects on the real backend agree. The
        // strong form -- comparing two unmemoised detect() calls -- is what the
        // three unmitigated runs of this file showed the backend cannot
        // promise: jsfeatNext's detect is history-dependent, and the tracker's
        // internal call history differs from a detect issued fresh in a test.
        // Until that upstream defect is fixed, the honest claim is the weak
        // one: same options in, same (memoised) keypoints out.
        const expected = stableCv.detect(scene, { levels: 1, maxKeypoints: 900 });
        const targetDb = buildTargetFromImage(stableCv, target, { levels: 8 });
        const { value: tracked } = withSeededRandom(SEED, () =>
            new NftTracker(stableCv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        expect(tracked.sceneKeypoints.length).toBe(expected.length);
        expect(tracked.sceneKeypoints.map((k) => [k.x, k.y, k.level])).toEqual(
            expected.map((k) => [k.x, k.y, k.level])
        );
    });

    it("draws randomness only inside RANSAC, and the same amount on both sides", () => {
        // This test guards the instrument the two above depend on. Seeding a
        // GLOBAL reaches every consumer of Math.random in the process, which is
        // harmless only while nothing but RANSAC draws -- true of jsfeatNext
        // today, but a fact about a dependency, not a guarantee. Left
        // undefended, a new draw site upstream would shift the sequence under
        // every comparison in this file and the symptom would surface as a
        // mysterious tolerance failure somewhere else.
        const deterministic = withSeededRandom(SEED, () => {
            // Everything both pipelines do before RANSAC: the tracker's target
            // preparation, and the frame-side work, through this file's own
            // transcriptions rather than the package's helpers.
            const db = buildTargetFromImage(stableCv, target, { levels: 8 });
            const kScene = stableCv.detect(scene, { levels: 1, maxKeypoints: 900 });
            const kTarget = stableCv.detect(target, { levels: 8, maxKeypoints: 8 * 260 });
            const dScene = stableCv.describe(scene, kScene);
            const dTarget = stableCv.describe(target, kTarget);
            const matches = referenceMatchPerLevel(stableCv, dScene, referenceLevelIndex(kTarget, dTarget), 0.8);
            return db.keypoints.count + matches.length;
        });

        // Non-vacuous: the block above really did the work.
        expect(deterministic.value).toBeGreaterThan(0);
        // The assertion that names the culprit. If detect, describe, match or
        // the target builder ever starts drawing, this fails and points here.
        expect(deterministic.draws).toBe(0);

        const targetDb = buildTargetFromImage(stableCv, target, { levels: 8 });
        const reference = withSeededRandom(SEED, () => referencePipeline(stableCv, target, scene));
        const tracked = withSeededRandom(SEED, () =>
            new NftTracker(stableCv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        expect(reference.draws).toBeGreaterThan(0);
        // Equal counts mean both runs consumed the identical sequence, which is
        // what the tolerance argument above rests on.
        //
        // A mismatch has two possible causes, and they are distinguishable. A
        // new Math.random site: the zero-draw assertion above catches that
        // first, so if it passed and this failed, look elsewhere. Or RANSAC's
        // adaptive iteration budget diverging -- update_iters() shortens the
        // loop from an improving hypothesis's inlier ratio, so an f32-perturbed
        // coordinate flipping one intermediate hypothesis changes how many
        // draws the run takes, without necessarily changing the answer. If this
        // fails while the inlier-count and corner-displacement assertions still
        // pass, that is the second cause -- and it means the f32 perturbation
        // reaches further than the tolerance reasoning assumes, which is worth
        // understanding rather than silencing.
        expect(tracked.draws).toBe(reference.draws);
    });
});
