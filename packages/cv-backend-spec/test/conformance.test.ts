import { describe, it, expect } from "vitest";
import {
    DescriptorMismatchError,
    UnsupportedCapabilityError,
    type BackendCapabilities,
    type CvBackend,
    type DescribeOptions,
    type DescriptorKind,
    type Descriptors,
    type FilterOptions,
    type FilterView,
    type GrayImage,
    type Keypoint,
    type Match,
    type PointArray,
} from "../src/index";

/**
 * Conformance tests for the contract itself.
 *
 * There is no real backend yet, so these exercise a stub that implements
 * `CvBackend` exactly as the contract prescribes. That is the point: the rules
 * being checked — refuse rather than substitute, reject unmatchable descriptor
 * sets, preserve match indices — are stated in prose in `cv_backend.ts` and are
 * invisible to the type system. A stub is what turns them into something a
 * future adapter can be checked against, and it doubles as the reference an
 * adapter author can copy the semantics from.
 */

const CAPS: BackendCapabilities = {
    name: "stub",
    detectors: ["fast"],
    descriptors: ["orb"],
    defaultDescriptor: "orb",
    matchFilters: [],
};

function descriptors(count: number, kind: DescriptorKind = "orb", norm: "hamming" | "l2" = "hamming"): Descriptors {
    return { data: new Uint8Array(count * 32), count, bytesPerDescriptor: 32, kind, norm };
}

/** A minimal backend that follows the negotiation rules to the letter. */
function makeBackend(overrides: Partial<CvBackend> = {}): CvBackend {
    const backend: CvBackend = {
        capabilities: CAPS,

        detect(_image: GrayImage): Keypoint[] {
            return [{ x: 10, y: 10, score: 1, angle: 0, level: 0 }];
        },

        describe(_image: GrayImage, keypoints: Keypoint[], options?: DescribeOptions): Descriptors {
            if (options?.kind && !CAPS.descriptors.includes(options.kind)) {
                throw new UnsupportedCapabilityError("descriptor", options.kind, CAPS.descriptors, CAPS.name);
            }
            return descriptors(keypoints.length, options?.kind ?? CAPS.defaultDescriptor);
        },

        match(query: Descriptors, train: Descriptors): Match[] {
            if (query.kind !== train.kind || query.norm !== train.norm) {
                throw new DescriptorMismatchError(query.kind, query.norm, train.kind, train.norm);
            }
            return [
                { queryIdx: 0, trainIdx: 7, distance: 12 },
                { queryIdx: 3, trainIdx: 1, distance: 30 },
            ];
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
    return { ...backend, ...overrides };
}

const IMAGE: GrayImage = { data: new Uint8Array(16 * 16), width: 16, height: 16 };

describe("descriptor selection and capability declaration (#128)", () => {
    it("resolves a preference list against capabilities, without the backend choosing", () => {
        // The acceptance criterion: a backend advertising only ORB, asked via a
        // preference list headed by TEBLID, must deterministically yield ORB --
        // and the DECISION must be the caller's, not a backend fallback.
        const cv = makeBackend();
        const preferred: DescriptorKind[] = ["teblid", "orb"];

        const kind = preferred.find((k) => cv.capabilities.descriptors.includes(k)) ?? cv.capabilities.defaultDescriptor;

        expect(kind).toBe("orb");
        const d = cv.describe(IMAGE, cv.detect(IMAGE), { kind });
        expect(d.kind).toBe("orb");
    });

    it("omitting the options reproduces the default descriptor exactly", () => {
        // Source compatibility with the pre-amendment contract: a caller that
        // never passes options must be unaffected by this change.
        const cv = makeBackend();
        const kps = cv.detect(IMAGE);
        expect(cv.describe(IMAGE, kps)).toEqual(cv.describe(IMAGE, kps, { kind: "orb" }));
        expect(cv.describe(IMAGE, kps).kind).toBe(cv.capabilities.defaultDescriptor);
    });

    it("refuses an unsupported explicit request instead of substituting", () => {
        const cv = makeBackend();
        expect(() => cv.describe(IMAGE, cv.detect(IMAGE), { kind: "teblid" })).toThrow(UnsupportedCapabilityError);
    });

    it("names the requested kind AND the supported set in the error", () => {
        // The message has to be enough to debug a mis-wired pipeline without
        // opening the backend, so assert on the payload, not just the type.
        const cv = makeBackend();
        try {
            cv.describe(IMAGE, cv.detect(IMAGE), { kind: "freak" });
            expect.unreachable("should have thrown");
        } catch (e) {
            const err = e as UnsupportedCapabilityError;
            expect(err).toBeInstanceOf(UnsupportedCapabilityError);
            expect(err.capability).toBe("descriptor");
            expect(err.requested).toBe("freak");
            expect(err.supported).toEqual(["orb"]);
            expect(err.backend).toBe("stub");
            expect(err.message).toContain("freak");
            expect(err.message).toContain("orb");
        }
    });

    it("descriptors are self-describing, so a shape match is not a kind match", () => {
        // Both are 32 bytes and both Hamming -- structurally indistinguishable.
        // Only the declared kind separates them.
        const orb = descriptors(4, "orb");
        const teblid = descriptors(4, "teblid");
        expect(orb.bytesPerDescriptor).toBe(teblid.bytesPerDescriptor);
        expect(orb.norm).toBe(teblid.norm);
        expect(orb.kind).not.toBe(teblid.kind);
    });

    it("match rejects mismatched descriptor families", () => {
        const cv = makeBackend();
        expect(() => cv.match(descriptors(4, "orb"), descriptors(4, "teblid"))).toThrow(DescriptorMismatchError);
    });

    it("match rejects mismatched norms even when the family agrees", () => {
        const cv = makeBackend();
        expect(() => cv.match(descriptors(4, "akaze", "hamming"), descriptors(4, "akaze", "l2"))).toThrow(
            DescriptorMismatchError
        );
    });

    it("match accepts an agreeing pair", () => {
        const cv = makeBackend();
        expect(() => cv.match(descriptors(4, "orb"), descriptors(6, "orb"))).not.toThrow();
    });
});

describe("the filterMatches seam (#129)", () => {
    const view = (n: number): FilterView => ({
        keypoints: Array.from({ length: n }, (_, i) => ({ x: i, y: i, score: 1, angle: 0, level: 0 })),
        width: 64,
        height: 64,
    });

    it("is optional: a backend without it declares no filters and callers skip it", () => {
        const cv = makeBackend();
        expect(cv.capabilities.matchFilters).toEqual([]);
        expect(cv.filterMatches).toBeUndefined();

        // the documented skip pattern must degrade to the unfiltered matches
        let matches = cv.match(descriptors(4), descriptors(8));
        if (cv.filterMatches) matches = cv.filterMatches(matches, view(4), view(8));
        expect(matches).toHaveLength(2);
    });

    it("an identity filter composes, and indices survive into estimateHomography", () => {
        // The seam's one hard rule: a filter returns a SUBSET with queryIdx /
        // trainIdx / distance untouched, because the caller still holds the
        // keypoint arrays those indices point into. If a filter renumbered,
        // the coordinates gathered below would silently be the wrong points.
        const identity: CvBackend["filterMatches"] = (matches) => matches.slice();
        const cv = makeBackend({
            capabilities: { ...CAPS, matchFilters: ["gms"] },
            filterMatches: identity,
        });

        const q = view(8);
        const t = view(12);
        const raw = cv.match(descriptors(8), descriptors(12));
        const filtered = cv.filterMatches!(raw, q, t);

        expect(filtered).toEqual(raw);
        for (let i = 0; i < filtered.length; i++) {
            expect(filtered[i].queryIdx).toBe(raw[i].queryIdx);
            expect(filtered[i].trainIdx).toBe(raw[i].trainIdx);
            expect(filtered[i].distance).toBe(raw[i].distance);
        }

        // gather correspondences by the surviving indices and finish the pipeline
        const src = new Float64Array(filtered.length * 2);
        const dst = new Float64Array(filtered.length * 2);
        filtered.forEach((m, i) => {
            src[i * 2] = q.keypoints[m.queryIdx].x;
            src[i * 2 + 1] = q.keypoints[m.queryIdx].y;
            dst[i * 2] = t.keypoints[m.trainIdx].x;
            dst[i * 2 + 1] = t.keypoints[m.trainIdx].y;
        });

        const h = cv.estimateHomography(src, dst);
        expect(h.ok).toBe(true);
        expect(h.H).toHaveLength(9);
        expect(cv.poseFromHomography(h.H, new Float64Array([1, 0, 8, 0, 1, 8, 0, 0, 1])).good).toBe(true);
    });

    it("a filter that dropped matches still yields a strict subset", () => {
        const dropFirst: CvBackend["filterMatches"] = (matches) => matches.slice(1);
        const cv = makeBackend({
            capabilities: { ...CAPS, matchFilters: ["gms"] },
            filterMatches: dropFirst,
        });
        const raw = cv.match(descriptors(4), descriptors(8));
        const filtered = cv.filterMatches!(raw, view(4), view(8));

        expect(filtered.length).toBeLessThan(raw.length);
        for (const m of filtered) expect(raw).toContainEqual(m);
    });

    it("refuses an unsupported filter kind, naming the supported set", () => {
        const caps = { ...CAPS, matchFilters: ["gms"] as const };
        const cv = makeBackend({
            capabilities: caps,
            filterMatches: (matches: Match[], _q: FilterView, _t: FilterView, options?: FilterOptions) => {
                if (options?.kind && !caps.matchFilters.includes(options.kind)) {
                    throw new UnsupportedCapabilityError("matchFilter", options.kind, caps.matchFilters, caps.name);
                }
                return matches;
            },
        });

        try {
            // 'logos' is not in MatchFilterKind yet; the cast stands in for a
            // caller compiled against a newer contract than this backend.
            cv.filterMatches!([], view(1), view(1), { kind: "logos" as never });
            expect.unreachable("should have thrown");
        } catch (e) {
            const err = e as UnsupportedCapabilityError;
            expect(err).toBeInstanceOf(UnsupportedCapabilityError);
            expect(err.capability).toBe("matchFilter");
            expect(err.supported).toEqual(["gms"]);
        }
    });
});

describe("the full pipeline composes through the interface", () => {
    it("detect -> describe -> match -> [filter] -> estimateHomography -> poseFromHomography", () => {
        const cv = makeBackend();
        const kps = cv.detect(IMAGE);
        const d = cv.describe(IMAGE, kps);
        let matches = cv.match(d, descriptors(8));
        if (cv.filterMatches) {
            matches = cv.filterMatches(matches, { keypoints: kps, width: 16, height: 16 }, view8());
        }
        const src = new Float64Array([0, 0, 1, 0, 1, 1, 0, 1]);
        const dst = new Float64Array([0, 0, 2, 0, 2, 2, 0, 2]);
        const h = cv.estimateHomography(src, dst);
        expect(h.ok).toBe(true);
        expect(cv.poseFromHomography(h.H, new Float64Array([1, 0, 8, 0, 1, 8, 0, 0, 1])).good).toBe(true);
        expect(matches.length).toBeGreaterThan(0);
    });

    function view8(): FilterView {
        return {
            keypoints: Array.from({ length: 8 }, (_, i) => ({ x: i, y: i, score: 1, angle: 0, level: 0 })),
            width: 64,
            height: 64,
        };
    }
});
