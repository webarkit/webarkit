/*
 *  jsfeatnext_backend.ts
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
 * jsfeatNext implementation of the `CvBackend` contract.
 *
 * Everything jsfeatNext-specific is confined to this file: the contract speaks
 * flat typed arrays and plain structs, jsfeatNext speaks `matrix_t`,
 * `keypoint_t` and `point_t`, and the translation happens here so neither side
 * has to know about the other. jsfeatNext itself has no dependency on the
 * contract — the direction of the arrow is the whole point of the design.
 *
 * Per the contract's boundary rules, every typed array handed back is a fresh
 * copy owned by the caller: jsfeatNext reuses its scratch matrices between
 * calls, so returning views into them would hand out storage that the next call
 * silently overwrites.
 */

import jsfeatNext from "@webarkit/jsfeat-next";
import type { matrix_t } from "@webarkit/jsfeat-next";
import {
    DescriptorMismatchError,
    UnsupportedCapabilityError,
    type BackendCapabilities,
    type CvBackend,
    type DescribeOptions,
    type Descriptors,
    type DetectOptions,
    type GrayImage,
    type HomographyResult,
    type Keypoint,
    type Mat3,
    type Match,
    type MatchOptions,
    type PointArray,
    type Pose,
    type RansacOptions,
} from "@webarkit/cv-backend-spec";

const U8C1 = jsfeatNext.U8_t | jsfeatNext.C1_t;
const F64C1 = jsfeatNext.F64_t | jsfeatNext.C1_t;

/** Bytes in one ORB descriptor. */
const ORB_BYTES = 32;

/**
 * Keep-out margin from the image edge, in pixels.
 *
 * Two jsfeatNext requirements meet here and the stricter one wins.
 * `orb.describe` needs 20 px — closer in, some of the 256 sampled pairs fall
 * outside the image and read the `warp_affine` constant fill of 128, so those
 * bits are decided by the fill rather than the picture and the descriptor is
 * silently degraded, with no flag saying so. `orb.ic_angle` needs 15 px, since
 * it reads its circular patch with no bounds check at all.
 *
 * Detecting closer to the edge and filtering afterwards would be wasted work:
 * the detector's `border` argument exists for exactly this.
 */
const BORDER = 20;

/**
 * Scale step between pyramid levels: the cube root of 2, so three levels halve
 * the size.
 *
 * jsfeatNext's own ORB sample uses sqrt(2), and that turns out to be a little
 * too coarse. ORB samples a fixed-radius pattern, so a descriptor only matches
 * across a limited band of scales, and measured on a printed target
 * photographed at an angle that band spans a factor of about 1.31 — from 160 to
 * 210 px for a feature whose best response is at 180. A sqrt(2) step (1.414)
 * is wider than the band, so consecutive levels can straddle it and match at
 * neither; 2^(1/3) (1.26) is guaranteed to land inside. The cost is one extra
 * level per octave.
 */
const SCALE_STEP = Math.cbrt(2);

/**
 * Pyramid levels searched when the caller does not say.
 *
 * ORB is not scale-invariant on its own — a descriptor encodes the appearance
 * of a patch at one resolution, so a target photographed smaller than its
 * reference simply does not match. Searching a single level is markedly
 * cheaper, and is the right choice for a tracking loop that already knows the
 * scale, but as a DEFAULT it makes the backend look broken on exactly the task
 * it exists for. A caller optimising a 60 fps loop can pass `levels: 1`.
 */
const DEFAULT_LEVELS = 6;

const CAPABILITIES: BackendCapabilities = {
    name: "jsfeatnext",
    // Only FAST is listed, though jsfeatNext also ships yape and yape06:
    // `DetectOptions` carries no detector selector yet (deliberately deferred
    // in the contract), so those two are not reachable through this API.
    // Advertising a capability the caller cannot actually invoke would be a
    // lie the negotiation rules are specifically meant to prevent.
    detectors: ["fast"],
    descriptors: ["orb"],
    defaultDescriptor: "orb",
    // No geometric match filter yet. GMS is tracked separately; until it
    // exists, `filterMatches` is omitted entirely and this stays empty.
    matchFilters: [],
};

/** Wraps a `GrayImage`'s pixels in a jsfeatNext single-channel matrix. */
function toMatrix(image: GrayImage): matrix_t {
    const m = new jsfeatNext.matrix_t(image.width, image.height, U8C1);
    if (image.data.length < image.width * image.height) {
        throw new Error(
            `@webarkit/cv-backend-jsfeatnext: image data holds ${image.data.length} bytes, ` +
                `but ${image.width}x${image.height} needs ${image.width * image.height}`
        );
    }
    m.data.set(image.data.subarray(0, image.width * image.height));
    return m;
}

/** Row-major 3x3 `Float64Array` to a jsfeatNext F64 matrix. */
function toMat3(m: Mat3, what: string): matrix_t {
    if (m.length !== 9) {
        throw new Error(`@webarkit/cv-backend-jsfeatnext: ${what} must have 9 elements, got ${m.length}`);
    }
    const out = new jsfeatNext.matrix_t(3, 3, F64C1);
    out.data.set(m);
    return out;
}

/**
 * A pool of `keypoint_t` for the detectors to fill.
 *
 * `fast_corners.detect` writes `corners[n]` with **no bounds check** — run out
 * of slots and it dereferences `undefined` and throws a TypeError from inside
 * the library. So the pool cannot be sized by optimism; {@link detectInto}
 * grows and retries against a hard bound.
 */
function makePool(n: number): InstanceType<typeof jsfeatNext.keypoint_t>[] {
    const pool = new Array(n);
    for (let i = 0; i < n; i++) pool[i] = new jsfeatNext.keypoint_t(0, 0, 0, 0, -1);
    return pool;
}

export class JsfeatNextBackend implements CvBackend {
    readonly capabilities = CAPABILITIES;

    /** Reused across frames; grown on demand by {@link detectInto}. */
    private pool = makePool(1024);

    /**
     * Pose estimator, kept between calls so `K` is inverted once rather than
     * per frame. `poseFromHomography` is stateless from the caller's point of
     * view — the cache is keyed on `K`'s contents and re-primed whenever they
     * change, so the result depends only on the arguments.
     */
    private poseEstimator: InstanceType<typeof jsfeatNext.pose_estimator> | null = null;
    private lastK: Float64Array | null = null;
    private readonly pose = new jsfeatNext.pose_t();

    /**
     * Runs FAST into the pool, growing it until it fits.
     *
     * The detector has no cap of its own and no bounds check, so a textured
     * frame at a low threshold can produce more corners than any fixed pool.
     * Doubling on failure terminates because the retry is capped at the number
     * of pixels the detector can actually consider — corners come from distinct
     * positions inside the border, so it cannot exceed that.
     */
    private detectInto(img: matrix_t, border: number): number {
        const hardCap = Math.max(1, (img.cols - 2 * border) * (img.rows - 2 * border));
        for (;;) {
            try {
                return jsfeatNext.fast_corners.detect(img, this.pool, border);
            } catch (e) {
                if (this.pool.length >= hardCap) throw e;
                this.pool = makePool(Math.min(this.pool.length * 2, hardCap));
            }
        }
    }

    /**
     * Builds the scale pyramid a multi-level detect/describe works over.
     *
     * Level 0 is the image itself; each further level is resampled down by
     * {@link SCALE_STEP}. Levels that would leave no room for the ORB margin
     * are dropped rather than searched pointlessly.
     */
    private pyramid(image: GrayImage, levels: number): { img: matrix_t; scale: number }[] {
        const level0 = toMatrix(image);
        const out = [{ img: level0, scale: 1 }];
        let scale = 1;
        for (let i = 1; i < levels; i++) {
            scale /= SCALE_STEP;
            const w = (image.width * scale) | 0;
            const h = (image.height * scale) | 0;
            // Below this there is no interior left once the 20px margin is
            // taken off both sides, so the level can hold no keypoints at all.
            if (w <= 2 * BORDER + 2 || h <= 2 * BORDER + 2) break;
            const img = new jsfeatNext.matrix_t(w, h, U8C1);
            jsfeatNext.imgproc.resample(level0, img, w, h);
            out.push({ img, scale });
        }
        return out;
    }

    detect(image: GrayImage, options?: DetectOptions): Keypoint[] {
        jsfeatNext.fast_corners.set_threshold(options?.threshold ?? 20);
        const levels = Math.max(1, options?.levels ?? DEFAULT_LEVELS);
        const pyr = this.pyramid(image, levels);
        // Budget per LEVEL, not overall. Level 0 has far more corners than the
        // small levels and scores them higher, so a single global cap applied
        // after the fact starves exactly the coarse levels that make matching
        // across a scale change possible -- which is the whole reason for
        // searching a pyramid. jsfeatNext's own ORB sample caps per level too.
        const perLevel =
            options?.maxKeypoints !== undefined ? Math.max(1, Math.ceil(options.maxKeypoints / pyr.length)) : Infinity;

        const byLevel: Keypoint[][] = [];
        for (let lev = 0; lev < pyr.length; lev++) {
            const { img, scale } = pyr[lev];
            const count = this.detectInto(img, BORDER);

            let picked: number[] = [];
            for (let i = 0; i < count; i++) picked.push(i);
            if (picked.length > perLevel) {
                picked.sort((a, b) => this.pool[b].score - this.pool[a].score);
                picked = picked.slice(0, perLevel);
            }

            byLevel.push(
                picked.map((i) => {
                    const k = this.pool[i];
                    return {
                        // Coordinates are reported in LEVEL-0 space, so a caller
                        // never has to know which level a point came from to
                        // draw it or feed it to estimateHomography. `level` is
                        // kept so describe() can go back to the right
                        // resolution.
                        //
                        // Note the precision cost: a point found on a coarse
                        // level is multiplied back up, so half a pixel there
                        // becomes several here. Passing `levels: 1` is the
                        // right call when the scale is already known.
                        x: k.x / scale,
                        y: k.y / scale,
                        score: k.score,
                        // Orientation is measured on the level the point was
                        // found on: the intensity centroid of a 15px patch is a
                        // different quantity at a different resolution.
                        angle: jsfeatNext.orb.ic_angle(img, k.x, k.y),
                        level: lev,
                    };
                })
            );
        }

        const max = options?.maxKeypoints;
        if (max === undefined) return byLevel.flat();

        // Round-robin rather than concatenate-then-trim. Ceil() on the per-level
        // budget can overshoot the total (3 keypoints over 6 levels is 1 each,
        // which is 6), and maxKeypoints has to stay a genuine upper bound;
        // taking turns keeps it exact without letting one scale crowd out the
        // rest, which a global score sort would do immediately.
        const found: Keypoint[] = [];
        for (let rank = 0; found.length < max; rank++) {
            let any = false;
            for (const level of byLevel) {
                if (rank >= level.length) continue;
                found.push(level[rank]);
                any = true;
                if (found.length === max) break;
            }
            if (!any) break;
        }
        return found;
    }

    describe(image: GrayImage, keypoints: Keypoint[], options?: DescribeOptions): Descriptors {
        if (options?.kind && !CAPABILITIES.descriptors.includes(options.kind)) {
            throw new UnsupportedCapabilityError(
                "descriptor",
                options.kind,
                CAPABILITIES.descriptors,
                CAPABILITIES.name
            );
        }

        const count = keypoints.length;
        const data = new Uint8Array(count * ORB_BYTES);
        if (count === 0) {
            return { data, count, bytesPerDescriptor: ORB_BYTES, kind: "orb", norm: "hamming" };
        }

        // A descriptor encodes a patch at ONE resolution, so each keypoint must
        // be described on the level it was detected on. Describing everything
        // against level 0 would throw away the scale information detect() went
        // to the trouble of finding.
        let maxLevel = 0;
        for (const k of keypoints) maxLevel = Math.max(maxLevel, k.level | 0);
        const pyr = this.pyramid(image, maxLevel + 1);

        const byLevel = new Map<number, number[]>();
        keypoints.forEach((k, i) => {
            const lev = Math.min(k.level | 0, pyr.length - 1);
            const bucket = byLevel.get(lev);
            if (bucket) bucket.push(i);
            else byLevel.set(lev, [i]);
        });

        const scratch = new jsfeatNext.matrix_t(ORB_BYTES, 1, U8C1);
        for (const [lev, indices] of byLevel) {
            const { img, scale } = pyr[lev];
            if (this.pool.length < indices.length) this.pool = makePool(indices.length);
            indices.forEach((srcIdx, j) => {
                const k = keypoints[srcIdx];
                const slot = this.pool[j];
                // back down from level-0 coordinates to this level's grid
                slot.x = k.x * scale;
                slot.y = k.y * scale;
                slot.score = k.score;
                slot.level = lev;
                slot.angle = k.angle;
            });
            scratch.resize(ORB_BYTES, indices.length, 1);
            jsfeatNext.orb.describe(img, this.pool, indices.length, scratch);
            indices.forEach((srcIdx, j) => {
                data.set(scratch.data.subarray(j * ORB_BYTES, (j + 1) * ORB_BYTES), srcIdx * ORB_BYTES);
            });
        }

        return { data, count, bytesPerDescriptor: ORB_BYTES, kind: "orb", norm: "hamming" };
    }

    detectAndCompute(
        image: GrayImage,
        options?: DetectOptions & DescribeOptions
    ): { keypoints: Keypoint[]; descriptors: Descriptors } {
        const keypoints = this.detect(image, options);
        return { keypoints, descriptors: this.describe(image, keypoints, options) };
    }

    match(query: Descriptors, train: Descriptors, options?: MatchOptions): Match[] {
        if (query.kind !== train.kind || query.norm !== train.norm) {
            throw new DescriptorMismatchError(query.kind, query.norm, train.kind, train.norm);
        }
        if (query.count === 0 || train.count === 0) return [];

        const q = this.toDescriptorMatrix(query);
        const t = this.toDescriptorMatrix(train);
        const bf = jsfeatNext.bfmatcher;

        let matches;
        if (options?.ratio !== undefined) {
            // k=2 plus Lowe's ratio, per the contract: one `match` entry point
            // rather than exposing knnMatch separately.
            matches = bf.ratio_test(bf.knnMatch(q, t, 2), options.ratio);
        } else {
            // `cross_check` is state on the shared singleton, so it is restored
            // in `finally` — leaving it set would silently change the behaviour
            // of every later match, including other callers'.
            const previous = bf.cross_check;
            bf.cross_check = options?.crossCheck ?? false;
            try {
                matches = bf.match(q, t, options?.maxDistance ?? 256);
            } finally {
                bf.cross_check = previous;
            }
        }

        return matches.map((m) => ({ queryIdx: m.queryIdx, trainIdx: m.trainIdx, distance: m.distance }));
    }

    private toDescriptorMatrix(d: Descriptors): matrix_t {
        const needed = d.count * d.bytesPerDescriptor;
        if (d.data.length < needed) {
            throw new Error(
                `@webarkit/cv-backend-jsfeatnext: descriptor data holds ${d.data.length} bytes, ` +
                    `but ${d.count} x ${d.bytesPerDescriptor} needs ${needed}`
            );
        }
        const m = new jsfeatNext.matrix_t(d.bytesPerDescriptor, d.count, U8C1);
        m.data.set(d.data.subarray(0, needed));
        return m;
    }

    estimateHomography(src: PointArray, dst: PointArray, options?: RansacOptions): HomographyResult {
        if (src.length !== dst.length) {
            throw new Error(
                `@webarkit/cv-backend-jsfeatnext: src and dst must hold the same number of points, ` +
                    `got ${src.length / 2} and ${dst.length / 2}`
            );
        }
        const count = src.length >> 1;
        const H = new jsfeatNext.matrix_t(3, 3, F64C1);

        // A homography needs 4 correspondences; RANSAC below would sample from
        // an impossible set otherwise.
        if (count < 4) {
            return { H: new Float64Array(9), inliers: new Uint8Array(count), numInliers: 0, ok: false };
        }

        const from = [];
        const to = [];
        for (let i = 0; i < count; i++) {
            from.push({ x: src[i * 2], y: src[i * 2 + 1], score: 0, level: 0, angle: -1 });
            to.push({ x: dst[i * 2], y: dst[i * 2 + 1], score: 0, level: 0, angle: -1 });
        }

        const params = new jsfeatNext.ransac_params_t(4, options?.threshold ?? 3, 0.5, options?.confidence ?? 0.99);
        const mask = new jsfeatNext.matrix_t(count, 1, U8C1);
        const ok = jsfeatNext.motion_estimator.ransac(
            params,
            jsfeatNext.homography2d,
            from,
            to,
            count,
            H,
            mask,
            options?.maxIterations ?? 1000
        );

        const inliers = new Uint8Array(count);
        let numInliers = 0;
        for (let i = 0; i < count; i++) {
            const bit = mask.data[i] ? 1 : 0;
            inliers[i] = bit;
            numInliers += bit;
        }

        return { H: new Float64Array(H.data.subarray(0, 9)), inliers, numInliers, ok: !!ok && numInliers >= 4 };
    }

    poseFromHomography(H: Mat3, K: Mat3): Pose {
        const Km = toMat3(K, "K");
        if (!this.poseEstimator) {
            this.poseEstimator = new jsfeatNext.pose_estimator(Km);
            this.lastK = new Float64Array(K);
        } else if (!this.lastK || !sameK(this.lastK, K)) {
            this.poseEstimator.setIntrinsics(Km);
            this.lastK = new Float64Array(K);
        }

        this.poseEstimator.estimate(toMat3(H, "H"), this.pose);
        return {
            R: new Float64Array(this.pose.R.data.subarray(0, 9)),
            t: new Float64Array(this.pose.t),
            good: this.pose.good,
        };
    }
}

function sameK(a: Float64Array, b: Mat3): boolean {
    for (let i = 0; i < 9; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Builds the jsfeatNext backend.
 *
 * `async` to satisfy `CreateCvBackend`, which exists because a WASM backend
 * must instantiate its module before use. Pure TypeScript has nothing to wait
 * for, so this resolves immediately — the shape is what lets a caller swap
 * backends without restructuring its startup.
 */
export const createJsfeatNextBackend = async (): Promise<CvBackend> => new JsfeatNextBackend();

/**
 * Rough pinhole intrinsics from image size and horizontal field of view, for
 * the uncalibrated case. Re-exported from jsfeatNext so a caller does not need
 * to depend on it directly just to build a `K`.
 */
export function intrinsics(width: number, height: number, fovXdeg = 60): Mat3 {
    const K = jsfeatNext.pose_estimator.intrinsics(width, height, fovXdeg);
    return new Float64Array(K.data.subarray(0, 9));
}
