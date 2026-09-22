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
 */

import type {
    CvBackend,
    DescribeOptions,
    Descriptors,
    DetectOptions,
    GrayImage,
    Keypoint,
    Match,
} from "./cv_backend.js";

/** One way an implementation was observed not to be a pure function. */
export interface PurityViolation {
    /** The contract method whose result changed. */
    readonly method: "detect" | "describe" | "match";
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
}

/** The result of a purity probe. */
export interface PurityReport {
    readonly violations: readonly PurityViolation[];
    readonly coverage: PurityCoverage;
}

export interface PurityProbeOptions {
    readonly detect?: DetectOptions;
    readonly describe?: DescribeOptions;
}

const keypointKey = (k: Keypoint): string => `${k.x},${k.y},${k.score},${k.angle},${k.level}`;

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
    const kp1 = cv.detect(image, options.detect);
    cv.detect(decoy, options.detect); // the unrelated call
    const kp2 = cv.detect(image, options.detect);
    add("detect", firstDifference(kp1, kp2, keypointKey));

    // --- describe ----------------------------------------------------------
    // Described against kp1 both times: the input must be identical, so a
    // difference can only come from the implementation.
    const d1 = cv.describe(image, kp1, options.describe);
    cv.describe(decoy, cv.detect(decoy, options.detect), options.describe);
    const d2 = cv.describe(image, kp1, options.describe);
    add("describe", descriptorsDifference(d1, d2));

    // --- match -------------------------------------------------------------
    // A set against itself: every row has an exact counterpart, so the result
    // is well defined without depending on the probe image's content.
    const m1 = cv.match(d1, d1);
    cv.match(d1, cv.describe(decoy, cv.detect(decoy, options.detect), options.describe));
    const m2 = cv.match(d1, d1);
    add("match", firstDifference(m1, m2, matchKey));

    return {
        violations,
        coverage: { keypoints: kp1.length, descriptors: d1.count, matches: m1.length },
    };
}

/**
 * `image` with its rows rotated by a third of its height.
 *
 * A cheap way to get a *different* image with the same dimensions and the same
 * statistics, so the unrelated call above exercises the implementation rather
 * than a degenerate uniform buffer.
 */
function shifted(image: GrayImage): GrayImage {
    const { width, height, data } = image;
    const out = new Uint8Array(data.length);
    const by = Math.max(1, Math.floor(height / 3));
    for (let y = 0; y < height; y += 1) {
        const from = ((y + by) % height) * width;
        out.set(data.subarray(from, from + width), y * width);
    }
    return { data: out, width, height };
}
