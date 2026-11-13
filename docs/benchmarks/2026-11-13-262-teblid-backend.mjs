/*
 *  2026-11-13-262-teblid-backend.mjs
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
 * #262, M10's Stage 1: TEBLID-256 as prototype code, a `CvBackend` wrapped around the jsfeatNext
 * backend. Nothing under `packages/` is changed; this module is imported by the probe's runner
 * (`2026-11-13-262-stage1-probe.mjs`), and is not a library.
 *
 * - `teblidBackend(inner)`: every method is `inner`'s, except `describe`, which calls
 *   `jsfeatNext.teblid.describe` on the full-resolution image, and `capabilities.descriptors`,
 *   which is `["teblid"]`. A tracker built on it describes the scene with no `kind`
 *   (`detection.ts`, `cv.describe(frame, sceneKeypoints)`), so scene and target are both TEBLID.
 * - `teblidTarget(cv, orbTarget, image)`: the ORB target with its one descriptor set replaced by
 *   TEBLID-256 descriptors of the same keypoints, described on `image` (the reference image the
 *   ORB target was compiled from). Keypoints, patches, pyramid and meta are the ORB target's own
 *   objects, so the two arms differ by their descriptors only.
 * - `timedBackend(inner, sink)`: `inner`, with the wall time of each detection-stage call added
 *   to `sink[stage]` (`detect`, `describe`, `match`, `estimateHomography`). Desktop timings.
 *
 * **The TEBLID call, exactly:** for each keypoint `k` (level-0 px, `k.level` its pyramid level in
 * the backend's ∛2 pyramid, `k.angle` the backend's `orb.ic_angle` in radians),
 * `new keypoint_t(k.x, k.y, k.score, k.level, k.angle)` with `size = 31 * Math.cbrt(2) ** k.level`,
 * then `jsfeatNext.teblid.describe(img, kps, n, out, { bits: 256, scale_factor: 1.0 })`, `img` the
 * frame's full-resolution U8C1 matrix, `out` 32 bytes by `n` rows.
 */

import jsfeatNext from "@webarkit/jsfeat-next";

/** The jsfeatNext backend's pyramid step (`SCALE_STEP` in `jsfeatnext_backend.ts`). */
export const SCALE_STEP = Math.cbrt(2);
/** ORB's patch diameter at level 0, which TEBLID's `size` takes for ORB-style keypoints. */
export const ORB_PATCH = 31;
export const TEBLID_OPTIONS = Object.freeze({ bits: 256, scale_factor: 1.0 });
const BYTES = 32;
const U8C1 = jsfeatNext.U8_t | jsfeatNext.C1_t;

/** A keypoint's TEBLID `size`, in level-0 px. */
export const teblidSize = (level) => ORB_PATCH * SCALE_STEP ** level;

/** The full-resolution matrix of a `GrayImage`. */
function toMatrix(image) {
    const m = new jsfeatNext.matrix_t(image.width, image.height, U8C1);
    m.data.set(image.data.subarray(0, image.width * image.height));
    return m;
}

/** TEBLID-256 of `keypoints` on `image`, as the contract's `Descriptors`. */
export function describeTeblid(image, keypoints) {
    const n = keypoints.length;
    const out = new jsfeatNext.matrix_t(BYTES, Math.max(1, n), U8C1);
    if (n > 0) {
        const kps = keypoints.map((k) => {
            const kp = new jsfeatNext.keypoint_t(k.x, k.y, k.score, k.level, k.angle);
            kp.size = teblidSize(k.level);
            return kp;
        });
        jsfeatNext.teblid.describe(toMatrix(image), kps, n, out, TEBLID_OPTIONS);
    }
    return {
        data: new Uint8Array(out.data.subarray(0, n * BYTES)),
        count: n,
        bytesPerDescriptor: BYTES,
        kind: "teblid",
        norm: "hamming",
    };
}

export function teblidBackend(inner) {
    const capabilities = {
        ...inner.capabilities,
        name: `${inner.capabilities.name}+teblid-probe`,
        descriptors: ["teblid"],
        defaultDescriptor: "teblid",
    };
    const cv = Object.create(inner);
    Object.defineProperty(cv, "capabilities", { value: capabilities });
    cv.describe = (image, keypoints, options) => {
        if (options?.kind !== undefined && options.kind !== "teblid") {
            throw new Error(`teblid probe backend: kind ${options.kind} refused`);
        }
        if (options?.bits !== undefined && options.bits !== 256) {
            throw new Error(`teblid probe backend: bits ${options.bits} refused`);
        }
        return describeTeblid(image, keypoints);
    };
    cv.detectAndCompute = (image, options) => {
        const keypoints = inner.detect(image, options);
        return { keypoints, descriptors: cv.describe(image, keypoints, options) };
    };
    return cv;
}

/** The ORB target with a TEBLID-256 set in place of its ORB set: same keypoints, same rows. */
export function teblidTarget(cv, orbTarget, image) {
    const [orb, ...rest] = orbTarget.descriptorSets;
    if (rest.length !== 0 || orb.kind !== "orb") {
        throw new Error("teblidTarget: expected a target with exactly one ORB set");
    }
    if (image.width !== orbTarget.meta.widthPx || image.height !== orbTarget.meta.heightPx) {
        throw new Error(
            `teblidTarget: image ${image.width}x${image.height}, target ${orbTarget.meta.widthPx}x${orbTarget.meta.heightPx}`,
        );
    }
    if (Math.abs(orbTarget.pyramid.scaleStep - SCALE_STEP) > 1e-6) {
        throw new Error(`teblidTarget: target scaleStep ${orbTarget.pyramid.scaleStep}`);
    }
    const kp = orbTarget.keypoints;
    // Rows in the set's own order: row r describes keypoint kpIndex[r].
    const rows = Array.from(orb.kpIndex, (i) => ({
        x: kp.x[i],
        y: kp.y[i],
        score: kp.score[i],
        angle: kp.angle[i],
        level: kp.level[i],
    }));
    const d = cv.describe(image, rows);
    const set = {
        ...orb,
        kind: "teblid",
        producer: cv.capabilities.name,
        dimensions: 256,
        bytesPerDescriptor: BYTES,
        data: d.data,
    };
    return { ...orbTarget, descriptorSets: [set] };
}

export const STAGES = ["detect", "describe", "match", "estimateHomography"];

export function timedBackend(inner, sink) {
    const cv = Object.create(inner);
    for (const s of STAGES) {
        cv[s] = (...a) => {
            const t0 = performance.now();
            try {
                return inner[s](...a);
            } finally {
                sink[s] += performance.now() - t0;
            }
        };
    }
    return cv;
}
