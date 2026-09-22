/*
 *  purity.ts
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
 *
 */

/**
 * A conformance check for the contract's purity rule (see {@link CvBackend}).
 *
 * `detect`, `describe` and `match` are pure functions of their arguments. That
 * is implied by "stateless" and stated on the interface, but a type signature
 * cannot enforce it, and the way it breaks is quiet: a buffer pool that leaks
 * on an error path, a scratch cell read before it is written, a cache keyed on
 * something that is not the input. Results then depend on call *history*, and
 * every consumer above the contract inherits that — a target compiled twice
 * differs, a tracker re-acquires differently, a fixture stops reproducing.
 *
 * This is not hypothetical. `cv-backend-jsfeatnext`'s `detect` had exactly this
 * shape of defect: FAST wrote each row's corner columns 1-based and read them
 * back 0-based, so one never-written scratch cell per row fed non-maximum
 * suppression, and two pool buffers leaked per overflow — which is why the
 * *first* call on a fresh backend disagreed with every later one. It was found
 * by a person noticing that a compiled target would not reproduce, not by a
 * test, because no test looked.
 *
 * **Why this lives in the contract package.** It contains no computer vision
 * and no backend-specific type: it calls the contract's own methods and
 * compares their outputs. A contract that cannot be conformance-checked is a
 * contract in name only, and a check that lives in one backend's test suite
 * protects only that backend — the next implementation reintroduces the bug and
 * nothing notices.
 *
 * **It is framework-agnostic on purpose.** It returns findings rather than
 * asserting, so it adds no test-runner dependency to this package. The caller
 * does the asserting, in whatever runner it uses.
 *
 * **`estimateHomography` is not probed, and that is a decision, not an
 * oversight.** It samples randomly, so it is the contract's one deliberate
 * exception to purity. It becomes pure *for a given RNG* the moment one can be
 * injected ([#24](https://github.com/webarkit/webarkit/issues/24)), and should
 * join this check then, with the RNG fixed. Until it does, a caller wanting
 * determinism from it has to pin the seed itself — which is exactly what it
 * cannot do yet.
 */

import type {
    CvBackend,
    DescribeOptions,
    Descriptors,
    DetectOptions,
    GrayImage,
    Keypoint,
    Mat3,
    Match,
    MatchOptions,
    Pose,
} from "./cv_backend.js";

/** One way an implementation was observed not to be a pure function. */
export interface PurityViolation {
    /**
     * The contract method whose result changed.
     *
     * `estimateHomography` is absent on purpose, and the absence is the one
     * thing here worth stating rather than leaving to inference: it samples
     * randomly, so it is the contract's single deliberate exception to purity.
     * Once an RNG can be injected (#24) it becomes pure *for a given RNG*, and
     * belongs in this list with that RNG fixed.
     */
    readonly method: "detect" | "describe" | "match" | "poseFromHomography";
    /** What differed, precisely enough to start debugging from. */
    readonly detail: string;
}

/**
 * What {@link findPurityViolations} actually exercised.
 *
 * Reported so a caller can refuse a **vacuous** pass. A probe image that yields
 * no keypoints produces no descriptors and no matches, and every comparison
 * below then trivially succeeds — a green check that established nothing, which
 * is worse than a red one.
 */
export interface PurityCoverage {
    readonly keypoints: number;
    readonly descriptors: number;
    readonly matches: number;
    /**
     * Whether the intervening call really saw different pixels.
     *
     * If it did not, the probe degenerates into repeating a call back to back,
     * and the history dependence this check exists for is not exercised at all
     * — the most important kind of vacuous pass here, and the least visible.
     */
    readonly decoyDiffers: boolean;
    /**
     * Whether `poseFromHomography` actually recovered a pose.
     *
     * A backend that refuses every input returns `good: false` twice and
     * compares equal, which is deterministic but establishes nothing about the
     * path that matters. Same reason the counts above are reported.
     */
    readonly poseGood: boolean;
}

/** The result of a purity probe. */
export interface PurityReport {
    readonly violations: readonly PurityViolation[];
    readonly coverage: PurityCoverage;
}

export interface PurityProbeOptions {
    readonly detect?: DetectOptions;
    readonly describe?: DescribeOptions;
    /**
     * Matching is option-dependent: ratio testing, cross-checking and a
     * distance cap are separate paths through an implementation, and state
     * confined to one of them would pass a probe that only ever used the
     * defaults.
     */
    readonly match?: MatchOptions;
    /**
     * The pair `poseFromHomography` is probed with. Defaults to a mild
     * perspective transform and plausible intrinsics, which is enough to reach
     * the decomposition rather than an early rejection.
     */
    readonly pose?: { readonly H: Mat3; readonly K: Mat3 };
}

/** A homography with real rotation in it, so the decomposition has work to do. */
const DEFAULT_H = (): Mat3 =>
    new Float64Array([0.94, -0.18, 42, 0.16, 0.97, -25, 0.00021, -0.00014, 1]);

/** Plausible pinhole intrinsics for a 640x480 frame. */
const DEFAULT_K = (): Mat3 => new Float64Array([800, 0, 320, 0, 800, 240, 0, 0, 1]);

function poseDifference(a: Pose, b: Pose): string | null {
    if (a.good !== b.good) return `good ${String(a.good)} then ${String(b.good)}`;
    for (const field of ["R", "t"] as const) {
        const x = a[field];
        const y = b[field];
        if (x.length !== y.length) return `${field} length ${x.length} then ${y.length}`;
        for (let i = 0; i < x.length; i += 1) {
            if (x[i] !== y[i]) return `${field}[${i}]: ${x[i]} then ${y[i]}`;
        }
    }
    return null;
}

const keypointKey = (k: Keypoint): string => `${k.x},${k.y},${k.score},${k.angle},${k.level}`;

/**
 * Detached copies, taken before anything else runs.
 *
 * Holding the first result by reference and comparing it after an intervening
 * call is the one way this check can be blind to the defect it exists for: a
 * backend that reuses an output array or a descriptor buffer would have both
 * sides of the comparison observing the *same*, final contents. The comparison
 * then always succeeds, and the aliasing it should have caught is exactly what
 * every consumer above the contract would suffer.
 */
const copyKeypoints = (ks: readonly Keypoint[]): Keypoint[] => ks.map((k) => ({ ...k }));
const copyDescriptors = (d: Descriptors): Descriptors => ({ ...d, data: Uint8Array.from(d.data) });
const copyMatches = (ms: readonly Match[]): Match[] => ms.map((m) => ({ ...m }));

/** Whether two images hold the same bytes. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
}

const matchKey = (m: Match): string => `${m.queryIdx},${m.trainIdx},${m.distance}`;

function firstDifference<T>(
    a: readonly T[],
    b: readonly T[],
    key: (v: T) => string,
): string | null {
    if (a.length !== b.length)
        return `${a.length} results on the first call, ${b.length} on the second`;
    for (let i = 0; i < a.length; i += 1) {
        const ka = key(a[i]!);
        const kb = key(b[i]!);
        if (ka !== kb) return `index ${i}: ${ka} on the first call, ${kb} on the second`;
    }
    return null;
}

function descriptorsDifference(a: Descriptors, b: Descriptors): string | null {
    if (a.count !== b.count) return `count ${a.count} then ${b.count}`;
    if (a.bytesPerDescriptor !== b.bytesPerDescriptor) {
        return `bytesPerDescriptor ${a.bytesPerDescriptor} then ${b.bytesPerDescriptor}`;
    }
    if (a.kind !== b.kind) return `kind "${a.kind}" then "${b.kind}"`;
    if (a.norm !== b.norm) return `norm "${a.norm}" then "${b.norm}"`;
    if (a.data.length !== b.data.length) {
        return `data length ${a.data.length} then ${b.data.length}`;
    }
    for (let i = 0; i < a.data.length; i += 1) {
        if (a.data[i] !== b.data[i]) {
            return `data byte ${i}: ${a.data[i]} then ${b.data[i]} (descriptor ${Math.floor(i / a.bytesPerDescriptor)})`;
        }
    }
    return null;
}

/**
 * Call `detect`, `describe` and `match` twice each on identical inputs, with an
 * unrelated call in between, and report every difference.
 *
 * **The call in between is the point.** Repeating a call back to back catches
 * only the crudest impurity; what breaks in practice is state carried *across*
 * unrelated work — a pool rotated by an earlier overflow, a cache warmed by a
 * different image. So each pair is separated by a call on `decoy`, which must
 * differ from `image` for the probe to mean anything.
 *
 * `decoy` defaults to a shifted copy of `image`, which is enough to exercise a
 * different code path without needing a second fixture from the caller.
 */
export function findPurityViolations(
    cv: CvBackend,
    image: GrayImage,
    options: PurityProbeOptions = {},
    decoy: GrayImage = shifted(image),
): PurityReport {
    const violations: PurityViolation[] = [];
    const add = (method: PurityViolation["method"], detail: string | null): void => {
        if (detail !== null) violations.push({ method, detail });
    };

    // --- detect ------------------------------------------------------------
    const kp1Live = cv.detect(image, options.detect);
    const kp1 = copyKeypoints(kp1Live);
    cv.detect(decoy, options.detect); // the unrelated call
    const kp2Live = cv.detect(image, options.detect);
    if (kp2Live === kp1Live) {
        add(
            "detect",
            "returned the very same array on both calls; outputs are owned by the caller",
        );
    }
    add("detect", firstDifference(kp1, copyKeypoints(kp2Live), keypointKey));

    // --- describe ----------------------------------------------------------
    // Described against `kp1` both times: the input must be identical, so a
    // difference can only come from the implementation.
    const d1Live = cv.describe(image, kp1, options.describe);
    const d1 = copyDescriptors(d1Live);
    cv.describe(decoy, cv.detect(decoy, options.detect), options.describe);
    const d2Live = cv.describe(image, kp1, options.describe);
    if (d2Live.data === d1Live.data || d2Live.data.buffer === d1Live.data.buffer) {
        add("describe", "reused the same descriptor buffer; outputs are owned by the caller");
    }
    add("describe", descriptorsDifference(d1, copyDescriptors(d2Live)));

    // --- match -------------------------------------------------------------
    // A set against itself: every row has an exact counterpart, so the result
    // is well defined without depending on the probe image's content.
    const m1Live = cv.match(d1, d1, options.match);
    const m1 = copyMatches(m1Live);
    cv.match(
        d1,
        cv.describe(decoy, cv.detect(decoy, options.detect), options.describe),
        options.match,
    );
    const m2Live = cv.match(d1, d1, options.match);
    if (m2Live === m1Live) {
        add("match", "returned the very same array on both calls; outputs are owned by the caller");
    }
    add("match", firstDifference(m1, copyMatches(m2Live), matchKey));

    // --- poseFromHomography ------------------------------------------------
    // Deterministic math, and therefore held to the same rule as the other
    // three. It is cheap to check and the contract would otherwise be silent
    // about it, which in a contract reads as permission.
    const H = options.pose?.H ?? DEFAULT_H();
    const K = options.pose?.K ?? DEFAULT_K();
    const p1Live = cv.poseFromHomography(H, K);
    const p1: Pose = {
        R: Float64Array.from(p1Live.R),
        t: Float64Array.from(p1Live.t),
        good: p1Live.good,
    };
    cv.poseFromHomography(DEFAULT_H(), new Float64Array([650, 0, 400, 0, 650, 300, 0, 0, 1]));
    const p2Live = cv.poseFromHomography(H, K);
    if (p2Live.R === p1Live.R || p2Live.t === p1Live.t) {
        add("poseFromHomography", "reused the same R or t array; outputs are owned by the caller");
    }
    add("poseFromHomography", poseDifference(p1, p2Live));

    return {
        violations,
        coverage: {
            keypoints: kp1.length,
            descriptors: d1.count,
            matches: m1.length,
            decoyDiffers: !sameBytes(decoy.data, image.data),
            poseGood: p1.good,
        },
    };
}

/**
 * `image` with its rows rotated by a third of its height — and guaranteed to
 * differ from it.
 *
 * A cheap way to get a *different* image with the same dimensions and the same
 * statistics, so the unrelated call above exercises the implementation rather
 * than a degenerate uniform buffer.
 *
 * Rotation alone is not enough, which is easy to miss: a single-row image, a
 * uniform one, or one whose rows repeat at this offset rotates onto itself.
 * The decoy would then be the probe image, the intervening call would exercise
 * nothing, and the whole check would quietly degenerate into repeating a call
 * back to back. Inverting the bytes cannot coincide, so it is the fallback.
 */
function shifted(image: GrayImage): GrayImage {
    const { width, height, data } = image;
    const out = new Uint8Array(data.length);
    const by = Math.max(1, Math.floor(height / 3));
    for (let y = 0; y < height; y += 1) {
        const from = ((y + by) % height) * width;
        out.set(data.subarray(from, from + width), y * width);
    }
    if (sameBytes(out, data)) {
        for (let i = 0; i < out.length; i += 1) out[i] = data[i]! ^ 0xff;
    }
    return { data: out, width, height };
}
