/*
 *  backend.test.ts
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

import { describe, it, expect, beforeAll } from "vitest";
import { DescriptorMismatchError, UnsupportedCapabilityError, type CvBackend, type GrayImage } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "../src/index";

/**
 * The jsfeatNext backend against the contract it claims to implement.
 *
 * The conformance suite in `cv-backend-spec` pins the *rules* using a stub;
 * this pins that a real backend, running real computer vision, obeys them —
 * and that the pipeline actually composes end to end, which is #96's
 * acceptance criterion.
 */

const W = 200;
const H = 200;

/**
 * A textured scene with strong, well-separated corners.
 *
 * Smooth gradients would give FAST nothing to find and ORB nothing to
 * discriminate; pixel noise would defeat the descriptor, since the patch is
 * rectified by bilinear resampling that does not preserve content at the
 * Nyquist limit. Bright squares on a gently varying ground give both what they
 * need, and the generator is sampled at an offset to produce the second view,
 * so the two frames are an EXACT translation of one another rather than the
 * same shapes moved over a static background.
 */
function scene(x: number, y: number): number {
    let v = 60 + 25 * Math.sin(x / 23) * Math.cos(y / 19);
    for (const [cx, cy] of [
        [55, 45],
        [140, 60],
        [70, 150],
        [155, 140],
        [105, 100],
    ]) {
        if (Math.abs(x - cx) < 9 && Math.abs(y - cy) < 9) v = 215;
    }
    return v;
}

function render(dx = 0, dy = 0): GrayImage {
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) data[y * W + x] = scene(x - dx, y - dy) & 0xff;
    }
    return { data, width: W, height: H };
}

let cv: CvBackend;
beforeAll(async () => {
    cv = await createJsfeatNextBackend();
});

describe("capabilities are honest about what this backend can do", () => {
    it("advertises only what is reachable through the API", () => {
        expect(cv.capabilities.name).toBe("jsfeatnext");
        expect(cv.capabilities.descriptors).toEqual(["orb"]);
        expect(cv.capabilities.defaultDescriptor).toBe("orb");
        // jsfeatNext also ships yape and yape06, but DetectOptions has no
        // detector selector, so they are not reachable and must not be claimed.
        expect(cv.capabilities.detectors).toEqual(["fast"]);
    });

    it("declares no match filters, and omits the optional method entirely", () => {
        expect(cv.capabilities.matchFilters).toEqual([]);
        expect(cv.filterMatches).toBeUndefined();
    });
});

describe("detect", () => {
    it("finds keypoints and orients every one of them", () => {
        const kps = cv.detect(render());
        expect(kps.length).toBeGreaterThan(4);
        // The contract's Keypoint carries an angle, and describe() rotates by
        // whatever it is given -- an unset angle would not be "unrotated", it
        // would rotate by the jsfeatNext default of -1 radian.
        for (const k of kps) {
            expect(Number.isFinite(k.angle)).toBe(true);
            expect(k.angle).toBeGreaterThan(-Math.PI - 1e-9);
            expect(k.angle).toBeLessThanOrEqual(Math.PI + 1e-9);
        }
    });

    it("keeps every keypoint clear of the ORB sampling margin", () => {
        // Closer than 20px, some of ORB's sampled pairs read the warp fill of
        // 128 instead of the image, silently degrading the descriptor with no
        // flag to say so.
        for (const k of cv.detect(render())) {
            expect(k.x).toBeGreaterThanOrEqual(20);
            expect(k.y).toBeGreaterThanOrEqual(20);
            expect(k.x).toBeLessThan(W - 20);
            expect(k.y).toBeLessThan(H - 20);
        }
    });

    it("maxKeypoints is a genuine upper bound", () => {
        // The per-level budget rounds up, so a naive implementation returns one
        // keypoint per level and overshoots: 3 asked for, 6 levels, 6 returned.
        for (const max of [1, 3, 7, 20]) {
            expect(cv.detect(render(), { maxKeypoints: max }).length).toBeLessThanOrEqual(max);
        }
    });

    it("a capped detect still draws on every scale it searched", () => {
        // The point of the round-robin: a global "strongest N" sort would hand
        // the whole budget to level 0, since fine-level corners score highest,
        // and the coarse levels that make cross-scale matching work would never
        // appear at all.
        const levels = new Set(cv.detect(render(), { maxKeypoints: 12, levels: 4 }).map((k) => k.level));
        expect(levels.size).toBeGreaterThan(1);
    });

    it("keeps the strongest within a level", () => {
        const single = cv.detect(render(), { levels: 1 });
        const capped = cv.detect(render(), { levels: 1, maxKeypoints: 3 });
        expect(capped).toHaveLength(3);
        const best = single
            .map((k) => k.score)
            .sort((a, b) => b - a)
            .slice(0, 3);
        expect(capped.map((k) => k.score).sort((a, b) => b - a)).toEqual(best);
    });

    it("levels: 1 reports only level 0, and more levels reach coarser ones", () => {
        expect(new Set(cv.detect(render(), { levels: 1 }).map((k) => k.level))).toEqual(new Set([0]));
        const many = new Set(cv.detect(render(), { levels: 5 }).map((k) => k.level));
        expect(many.size).toBeGreaterThan(1);
    });

    it("a higher threshold yields no more keypoints than a lower one", () => {
        const lenient = cv.detect(render(), { threshold: 10 }).length;
        const strict = cv.detect(render(), { threshold: 60 }).length;
        expect(strict).toBeLessThanOrEqual(lenient);
    });
});

describe("describe", () => {
    it("produces self-describing 32-byte ORB descriptors", () => {
        const img = render();
        const kps = cv.detect(img, { maxKeypoints: 8 });
        const d = cv.describe(img, kps);

        expect(d.kind).toBe("orb");
        expect(d.norm).toBe("hamming");
        expect(d.bytesPerDescriptor).toBe(32);
        expect(d.count).toBe(kps.length);
        expect(d.data.length).toBe(kps.length * 32);
    });

    it("refuses an unsupported kind instead of substituting ORB", () => {
        const img = render();
        const kps = cv.detect(img, { maxKeypoints: 4 });
        try {
            cv.describe(img, kps, { kind: "teblid" });
            expect.unreachable("should have thrown");
        } catch (e) {
            const err = e as UnsupportedCapabilityError;
            expect(err).toBeInstanceOf(UnsupportedCapabilityError);
            expect(err.requested).toBe("teblid");
            expect(err.supported).toEqual(["orb"]);
            expect(err.backend).toBe("jsfeatnext");
        }
    });

    it("asking for the supported kind explicitly matches omitting it", () => {
        const img = render();
        const kps = cv.detect(img, { maxKeypoints: 5 });
        expect(cv.describe(img, kps, { kind: "orb" }).data).toEqual(cv.describe(img, kps).data);
    });

    it("returns storage the caller owns", () => {
        // The contract requires copies out: a later call must not be able to
        // rewrite descriptors the caller is still holding.
        const img = render();
        const kps = cv.detect(img, { maxKeypoints: 5 });
        const first = cv.describe(img, kps);
        const snapshot = Uint8Array.from(first.data);
        cv.describe(render(7, 5), cv.detect(render(7, 5), { maxKeypoints: 5 }));
        expect(first.data).toEqual(snapshot);
    });

    it("handles an empty keypoint set", () => {
        const d = cv.describe(render(), []);
        expect(d.count).toBe(0);
        expect(d.data.length).toBe(0);
    });
});

describe("match", () => {
    it("matches a frame against itself at distance zero", () => {
        const img = render();
        const kps = cv.detect(img, { maxKeypoints: 6 });
        const d = cv.describe(img, kps);
        const matches = cv.match(d, d);

        expect(matches.length).toBe(kps.length);
        for (const m of matches) {
            expect(m.queryIdx).toBe(m.trainIdx);
            expect(m.distance).toBe(0);
        }
    });

    it("rejects descriptor sets that cannot be compared", () => {
        const img = render();
        const d = cv.describe(img, cv.detect(img, { maxKeypoints: 4 }));
        const foreign = { ...d, kind: "teblid" as const };
        expect(() => cv.match(d, foreign)).toThrow(DescriptorMismatchError);
        expect(() => cv.match(d, { ...d, norm: "l2" as const })).toThrow(DescriptorMismatchError);
    });

    it("the ratio option filters, and never adds", () => {
        const a = render();
        const b = render(6, 4);
        const da = cv.describe(a, cv.detect(a, { maxKeypoints: 12 }));
        const db = cv.describe(b, cv.detect(b, { maxKeypoints: 12 }));

        const plain = cv.match(da, db);
        const ratio = cv.match(da, db, { ratio: 0.8 });
        expect(ratio.length).toBeLessThanOrEqual(plain.length);
    });

    it("maxDistance never admits a pair beyond it", () => {
        const a = render();
        const b = render(6, 4);
        const da = cv.describe(a, cv.detect(a, { maxKeypoints: 12 }));
        const db = cv.describe(b, cv.detect(b, { maxKeypoints: 12 }));
        for (const m of cv.match(da, db, { maxDistance: 40 })) {
            expect(m.distance).toBeLessThanOrEqual(40);
        }
    });

    it("empty input yields no matches rather than throwing", () => {
        const img = render();
        const d = cv.describe(img, cv.detect(img, { maxKeypoints: 4 }));
        expect(cv.match(d, cv.describe(img, []))).toEqual([]);
    });
});

/**
 * A correspondence set with a known homography and a controlled outlier
 * fraction, sized like the pinball demo's real case (~95 points, ~67% true
 * inliers under threshold-4 noise, rest pure noise). A synthetic PRNG rather
 * than Math.random so the SET is reproducible across runs -- RANSAC's own
 * internal sampling is still random, which is exactly what the test below
 * needs to exercise.
 */
function noisyCorrespondences(n: number, inlierFrac: number, seed: number) {
    let state = seed;
    const rand = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff), state / 0x7fffffff);
    const H = [1.15, 0.08, 12, -0.05, 1.08, 20, 0.00012, -0.00009, 1];
    const apply = (x: number, y: number) => {
        const w = H[6] * x + H[7] * y + H[8];
        return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    };
    const src = new Float64Array(n * 2);
    const dst = new Float64Array(n * 2);
    const nInliers = Math.round(n * inlierFrac);
    for (let i = 0; i < n; i++) {
        const x = rand() * 600;
        const y = rand() * 600;
        src[i * 2] = x;
        src[i * 2 + 1] = y;
        if (i < nInliers) {
            const [px, py] = apply(x, y);
            dst[i * 2] = px + (rand() - 0.5) * 1.5;
            dst[i * 2 + 1] = py + (rand() - 0.5) * 1.5;
        } else {
            dst[i * 2] = rand() * 700;
            dst[i * 2 + 1] = rand() * 700;
        }
    }
    return { src, dst, nInliers };
}

describe("estimateHomography restarts against a bad RANSAC draw (issue #96 follow-up)", () => {
    // What this pins down: jsfeatNext's motion_estimator.ransac shrinks its
    // remaining iteration budget the moment it finds an IMPROVING hypothesis,
    // from the inlier ratio that hypothesis achieved. That is usually right,
    // but if random sampling turns up a mediocre improving hypothesis before
    // the true best one, the budget shrinks prematurely and the run locks onto
    // the mediocre model -- with no symptom: `ok` is still true and
    // `numInliers` still looks like a plausible count, just a much smaller one.
    //
    // Confirmed directly before writing this test: on this exact
    // correspondence set, a SINGLE ransac() call landed on a 4-inlier model
    // once in 40 trials (true best is 64) -- reproducing, down to the same
    // inlier count, the failure first seen on the real pinball demo images.
    // Internally restarting and keeping the best result is the fix; this test
    // is what would catch a regression back to a single attempt.
    it("never returns a severely degenerate model across many independent runs", () => {
        // 200 trials, not 25: a single bad draw happens about 1 run in 40 at
        // RANSAC_RESTARTS = 1 (measured), so a short loop would only catch a
        // regression back to that about half the time. At 200, the chance of
        // missing every bad draw is under 1%.
        const { src, dst, nInliers } = noisyCorrespondences(95, 0.67, 42);
        for (let trial = 0; trial < 200; trial++) {
            const h = cv.estimateHomography(src, dst, { threshold: 4 });
            expect(h.ok).toBe(true);
            // 70% of the true inlier count: comfortably above what a bad draw
            // produces (measured: 4) and comfortably below normal runs
            // (measured: 57-64), so this cannot pass by accident.
            expect(h.numInliers).toBeGreaterThanOrEqual(Math.round(nInliers * 0.7));
        }
    });
});

describe("estimateHomography", () => {
    it("refuses fewer than the four points a homography needs", () => {
        const src = new Float64Array([0, 0, 1, 0, 1, 1]);
        const dst = new Float64Array([0, 0, 2, 0, 2, 2]);
        const r = cv.estimateHomography(src, dst);
        expect(r.ok).toBe(false);
        expect(r.numInliers).toBe(0);
    });

    it("throws when the two point lists disagree in length", () => {
        expect(() =>
            cv.estimateHomography(new Float64Array([0, 0, 1, 1]), new Float64Array([0, 0, 1, 1, 2, 2]))
        ).toThrow(/same number of points/);
    });

    it("recovers a known translation", () => {
        const dx = 9;
        const dy = -4;
        const n = 12;
        const src = new Float64Array(n * 2);
        const dst = new Float64Array(n * 2);
        for (let i = 0; i < n; i++) {
            const x = 30 + (i % 4) * 40;
            const y = 30 + Math.floor(i / 4) * 45;
            src[i * 2] = x;
            src[i * 2 + 1] = y;
            dst[i * 2] = x + dx;
            dst[i * 2 + 1] = y + dy;
        }

        const r = cv.estimateHomography(src, dst);
        expect(r.ok).toBe(true);
        expect(r.numInliers).toBe(n);
        expect(r.inliers.length).toBe(n);

        // Apply H to a point and check it lands where the translation says.
        const h = r.H;
        const px = 100;
        const py = 80;
        const w = h[6] * px + h[7] * py + h[8];
        expect((h[0] * px + h[1] * py + h[2]) / w).toBeCloseTo(px + dx, 3);
        expect((h[3] * px + h[4] * py + h[5]) / w).toBeCloseTo(py + dy, 3);
    });
});

describe("poseFromHomography", () => {
    it("returns a right-handed orthonormal rotation for the identity view", () => {
        const K = intrinsics(W, H);
        const pose = cv.poseFromHomography(Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), K);
        expect(pose.R.length).toBe(9);
        expect(pose.t.length).toBe(3);
        for (const v of pose.R) expect(Number.isFinite(v)).toBe(true);
    });

    it("honours a change of intrinsics between calls", () => {
        // The estimator caches K's inverse across frames; a different K must
        // still take effect, or a resolution change would be silently ignored.
        const wide = intrinsics(W, H, 90);
        const tele = intrinsics(W, H, 40);
        const Hm = Float64Array.from([1, 0, 10, 0, 1, 5, 0, 0, 1]);
        const a = cv.poseFromHomography(Hm, wide);
        const b = cv.poseFromHomography(Hm, tele);
        expect(a.t[2]).not.toBeCloseTo(b.t[2], 6);
    });

    it("flags a degenerate homography instead of returning nonsense", () => {
        const K = intrinsics(W, H);
        const pose = cv.poseFromHomography(new Float64Array(9), K);
        expect(pose.good).toBe(false);
    });
});

/**
 * Renders the same scene at a different resolution, so the CONTENT is scaled
 * rather than the picture merely cropped or moved.
 */
function renderAt(size: number): GrayImage {
    const data = new Uint8Array(size * size);
    const k = W / size;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) data[y * size + x] = scene(x * k, y * k) & 0xff;
    }
    return { data, width: size, height: size };
}

describe("multi-scale detection is what makes cross-scale matching possible", () => {
    // The regression test for the gap the pinball demo exposed: `detect` used
    // to ignore DetectOptions.levels entirely and run at a single scale, so a
    // target photographed smaller than its reference simply did not match. ORB
    // descriptors are not scale-invariant -- a descriptor encodes a patch at
    // one resolution -- so the pyramid is not an optimisation here, it is the
    // difference between working and not.
    const base = renderAt(200);
    const doubled = renderAt(400);

    const matchesWith = (levels: number) => {
        const kA = cv.detect(base, { levels, maxKeypoints: 300 });
        const kB = cv.detect(doubled, { levels, maxKeypoints: 300 });
        return cv.match(cv.describe(base, kA), cv.describe(doubled, kB), { ratio: 0.9 }).length;
    };

    it("a 2x scale change defeats single-level detection", () => {
        expect(matchesWith(1)).toBeLessThan(matchesWith(6));
    });

    it("coarse levels carry the correspondences a 2x change needs", () => {
        // Not just "more matches": the matches must actually come from the
        // levels the pyramid added, or the improvement would be coincidence.
        const kB = cv.detect(doubled, { levels: 6, maxKeypoints: 300 });
        expect(new Set(kB.map((k) => k.level)).size).toBeGreaterThan(2);
    });
});

describe("the full pipeline composes through the interface (issue #96)", () => {
    it("detect -> describe -> match -> estimateHomography -> poseFromHomography", () => {
        const dx = 8;
        const dy = 5;
        const a = render();
        const b = render(dx, dy);

        // 1-2. detect + describe, on both views
        // levels: 1 on purpose. The two views differ by a pure translation at
        // identical scale, so searching a pyramid buys nothing here and costs
        // precision: a keypoint found on a coarse level is scaled back up, so
        // sub-pixel error there becomes whole pixels at level 0 and the tight
        // tolerance below stops meaning anything. Cross-scale matching gets its
        // own test rather than being smuggled into this one.
        const ka = cv.detect(a, { maxKeypoints: 40, levels: 1 });
        const kb = cv.detect(b, { maxKeypoints: 40, levels: 1 });
        const da = cv.describe(a, ka);
        const db = cv.describe(b, kb);
        expect(da.count).toBeGreaterThan(4);

        // 3. match
        let matches = cv.match(da, db, { maxDistance: 60 });
        // At least 5: with exactly 4 correspondences a homography fits them
        // exactly by construction, so RANSAC would report success no matter how
        // wrong the matching was. Over-determining it is what makes the
        // agreement below evidence of anything. (Observed: 6 matches, 6
        // inliers, translation recovered to ~1e-5 px.)
        expect(matches.length).toBeGreaterThanOrEqual(5);

        // 4. the optional filter, skipped exactly as the contract documents
        if (cv.filterMatches) {
            matches = cv.filterMatches(
                matches,
                { keypoints: ka, width: W, height: H },
                { keypoints: kb, width: W, height: H }
            );
        }

        // 5. estimateHomography over the surviving correspondences
        const src = new Float64Array(matches.length * 2);
        const dst = new Float64Array(matches.length * 2);
        matches.forEach((m, i) => {
            src[i * 2] = ka[m.queryIdx].x;
            src[i * 2 + 1] = ka[m.queryIdx].y;
            dst[i * 2] = kb[m.trainIdx].x;
            dst[i * 2 + 1] = kb[m.trainIdx].y;
        });
        const h = cv.estimateHomography(src, dst, { threshold: 3 });
        expect(h.ok).toBe(true);

        // The two views ARE a pure translation, so the recovered homography
        // must move a point by roughly (dx, dy). Loose bounds: this rides on
        // real detection and matching, not synthetic correspondences.
        const px = 100;
        const py = 100;
        const w = h.H[6] * px + h.H[7] * py + h.H[8];
        expect((h.H[0] * px + h.H[1] * py + h.H[2]) / w).toBeCloseTo(px + dx, 0);
        expect((h.H[3] * px + h.H[4] * py + h.H[5]) / w).toBeCloseTo(py + dy, 0);

        // 6. pose
        const pose = cv.poseFromHomography(h.H, intrinsics(W, H));
        expect(pose.good).toBe(true);
        for (const v of pose.R) expect(Number.isFinite(v)).toBe(true);
        for (const v of pose.t) expect(Number.isFinite(v)).toBe(true);
    });
});
