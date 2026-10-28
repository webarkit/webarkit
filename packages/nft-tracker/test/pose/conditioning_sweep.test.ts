/*
 *  conditioning_sweep.test.ts
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

// #104's synthetic acceptance, as M4's milestone (appended 2026-10-21) states
// it: "a synthetic acceptance with two arms — must-not-fire on the right fits
// of both targets (788 on the shipped target, 787 on M2's 64 patches), and
// must-fire on the eight gross wrong fits of M2's 64 patches. Those eight are
// the must-fire set because the shipped target produces no wrong fit on this
// sweep". And check (b) of the same step: the shipped arithmetic
// (src/pose/conditioning.ts) agrees with the derivation of record,
// docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.md (#160), on
// the sweep's own fitted homographies, to the digits that document prints.
// Every figure asserted below is quoted from it, by table.
//
// WHAT THIS FILE COVERS, AND WHAT IT DOES NOT. It runs #90's sweep — 137
// predictions on two views of five renders, 1,370 tracking steps per target
// — on the shipped target and on M2's 64 patches, with the tracker's
// defaults, and reads the signal on every fit that ends ok. It asserts the
// readings #160 tabulates and the two arms at the per-view floors #160
// derived. It asserts NO threshold: none is registered ("No threshold value
// is registered by this milestone"), and the pairs the arms are run at are
// the sweep's own per-view floors, measured here and checked against #160's
// figures — the test's parameters, not a value for the tracker. Pooled over
// the two views the arms cannot both hold, and the test asserts that too, as
// #160 found it: six of the eight refused, two not. Nothing here is a claim
// about any footage, device or K other than the sweep's frames under the
// record's K.
//
// THE DRIVER. When this was written the sweep lived in
// test/tracking/track_frame.test.ts, a frozen input (docs/benchmarks/README.md,
// "The instrument, the subject and the inputs", item 3), which could not be
// imported without running its tests and was not changed here. It is now
// ground-truth/tracking/track_frame_sweep.ts (#130), which can be imported;
// the copy below is kept as written. Its loop is written again below from the test file —
// the image, the two views, the render settings, `centreRms`, `about`,
// `shifts`, the 137 predictions, the step and the verdict — as #160's script
// did under the maintainer's conditional permission, and under the same
// condition: before any figure is read, the reproduction must give the
// counts the record pins (step 0 below), or the file fails as a whole.
// `trackFrame`, `trackTarget`, the fixtures, the codec and the defaults are
// imported, not reimplemented.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import type { Mat3 } from "@webarkit/cv-backend-spec";
import {
    DEFAULT_ALIGN_EPSILON,
    DEFAULT_ALIGN_MAX_ITERATIONS,
    DEFAULT_FIT_EPSILON,
    DEFAULT_FIT_MAX_ITERATIONS,
    DEFAULT_MAX_FIT_RMS,
    DEFAULT_MAX_FRAME_LEVELS,
    DEFAULT_MAX_OUTLIER_SHARE,
    DEFAULT_MIN_PATCH_ZNCC,
    DEFAULT_MIN_TRACKED_PATCHES,
    DEFAULT_PHOTOMETRIC,
    DEFAULT_TUKEY_C,
} from "../../src/index.js";
import { decode } from "../../src/target/format/index.js";
import { trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions } from "../../src/tracking/track_frame.js";
import { conditioning, conditioningRefuses } from "../../src/pose/conditioning.js";
import type { ConditioningReading } from "../../src/pose/conditioning.js";
import { PINBALL_STEP, pinballPatches } from "../../ground-truth/fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../../ground-truth/fixtures/pgm.js";
import {
    mat3Mul,
    project,
    renderWarp,
    rotation,
    scaling,
    translation,
    view,
} from "../../ground-truth/fixtures/warped_frames.js";
import { expectTableDigits, RECORD_K } from "./conditioning_record.js";
import { CONDITIONING_FIXTURE } from "./conditioning_fixture.js";

// ---- The sweep, from track_frame.test.ts ------------------------------------

const image = readPgm(TARGET_FIXTURE);
const patches = pinballPatches();
const m2 = trackTarget(patches, PINBALL_STEP);
const decoded = decode(
    new Uint8Array(
        readFileSync(
            fileURLToPath(new URL("../../../../examples/targets/pinball.wnft", import.meta.url)),
        ),
    ),
);
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const shipped = trackTarget(decoded.target.patches!, decoded.target.pyramid.scaleStep);

const CAMERA = { width: 270, height: 360 };
const VIEWS: Mat3[] = [
    view({ target: image, frame: CAMERA, scale: 0.45 }),
    view({
        target: image,
        frame: CAMERA,
        scale: 0.45,
        angle: (15 * Math.PI) / 180,
        perspective: [0.0004, -0.0003],
    }),
];
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10, seed: 3 };
/** The tracker's defaults, as the frozen test's `SHIPPED_OPTIONS` maps them. */
const OPTIONS: TrackFrameOptions = {
    maxFrameLevels: DEFAULT_MAX_FRAME_LEVELS,
    align: {
        maxIterations: DEFAULT_ALIGN_MAX_ITERATIONS,
        epsilon: DEFAULT_ALIGN_EPSILON,
        photometric: DEFAULT_PHOTOMETRIC,
    },
    fit: {
        maxIterations: DEFAULT_FIT_MAX_ITERATIONS,
        tukeyC: DEFAULT_TUKEY_C,
        epsilon: DEFAULT_FIT_EPSILON,
    },
    minTrackedPatches: DEFAULT_MIN_TRACKED_PATCHES,
    maxOutlierShare: DEFAULT_MAX_OUTLIER_SHARE,
    maxFitRms: DEFAULT_MAX_FIT_RMS,
    minPatchZncc: DEFAULT_MIN_PATCH_ZNCC,
};

/** RMS, frame px, between where `A` and `B` put M2's 64 patch centres: the error, for both targets. */
function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let q = 0; q < patches.count; q++) {
        const [ax, ay] = project(A, m2.centres[2 * q], m2.centres[2 * q + 1]);
        const [bx, by] = project(B, m2.centres[2 * q], m2.centres[2 * q + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / patches.count);
}

/** `E` applied in the frame about the target centre's image: the prediction is `E · truth`. */
function about(E: Mat3, H: Mat3): Mat3 {
    const [cx, cy] = project(H, (image.width - 1) / 2, (image.height - 1) / 2);
    return mat3Mul(mat3Mul(translation(cx, cy), mat3Mul(E, translation(-cx, -cy))), H);
}

/** The 137 predictions, labelled as #160's tables label them. */
function predictions(): { label: string; E: Mat3 }[] {
    const deg = (a: number) => (a * Math.PI) / 180;
    const out: { label: string; E: Mat3 }[] = [{ label: "none", E: translation(0, 0) }];
    for (const d of [1, 2, 3, 4, 5, 6, 8]) {
        for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8;
            out.push({
                label: `shift ${d} px @ ${k * 22.5}°`,
                E: translation(d * Math.cos(a), d * Math.sin(a)),
            });
        }
    }
    for (const a of [1, 2, 3, 4, 5, 6]) {
        out.push({ label: `roll +${a}°`, E: rotation(deg(a)) });
        out.push({ label: `roll -${a}°`, E: rotation(deg(-a)) });
    }
    for (const f of [1.02, 1.04, 1.06, 1.08, 1.1, 1.12]) {
        out.push({ label: `scale x${f}`, E: scaling(f) });
        out.push({ label: `scale x1/${f}`, E: scaling(1 / f) });
    }
    return out;
}

type Target = "shipped" | "m2";

interface Fit {
    readonly target: Target;
    readonly seed: number;
    readonly view: 0 | 1;
    readonly prediction: string;
    /** `centreRms(H, truth)`, px. */
    readonly error: number;
    readonly inliers: number;
    readonly right: boolean;
    readonly H: Mat3;
    readonly reading: ConditioningReading;
}

const fits: Fit[] = [];

/** The step's own verdict: right within 0.5 px RMS at the patch centres, else wrong. */
function sweep(target: Target, tracked: typeof m2): { right: Fit[]; wrong: Fit[] } {
    const right: Fit[] = [];
    const wrong: Fit[] = [];
    const preds = predictions();
    if (preds.length !== 137) throw new Error(`${preds.length} predictions, not 137`);
    for (let seed = 1; seed <= 5; seed++) {
        const frames = VIEWS.map((H) => renderWarp(image, H, { ...RENDER, seed }));
        VIEWS.forEach((truth, v) => {
            for (const p of preds) {
                const r = trackFrame(frames[v], tracked, null, about(p.E, truth), OPTIONS, null);
                if (!r.ok) continue;
                const error = centreRms(r.H, truth);
                const fit: Fit = {
                    target,
                    seed,
                    view: v as 0 | 1,
                    prediction: p.label,
                    error,
                    inliers: r.stats.inliers,
                    right: error < 0.5,
                    H: Float64Array.from(r.H),
                    reading: conditioning(r.H, RECORD_K),
                };
                (fit.right ? right : wrong).push(fit);
                fits.push(fit);
            }
        });
    }
    return { right, wrong };
}

/**
 * The record's description of the gross eight, as #160 codes it: "prediction
 * scale x1.1 or scale x1.12 and an error that rounds to the record's 7.1 to
 * 9.4 px (at or above 7.05 and below 9.45)".
 */
const isGross = (f: Fit) =>
    (f.prediction === "scale x1.1" || f.prediction === "scale x1.12") &&
    f.error >= 7.05 &&
    f.error < 9.45;

let gross: Fit[];
let sixteen: Fit[];

/**
 * The counts the record pins for the sweep, read by the messages below so
 * that an altered pin names itself: the frozen test's assertions for the
 * shipped target (788 right, none wrong, at least 11 inliers), and #160's
 * step 0 for M2's 64 patches (787 right, 24 wrong, at least 12 inliers,
 * eight gross).
 */
const PINS = {
    shipped: { right: 788, wrong: 0, minInliers: 11 },
    m2: { right: 787, wrong: 24, minInliers: 12, gross: 8 },
} as const;

/** Step 0: the sweep reproduced to the record's counts, or nothing below is read. */
beforeAll(() => {
    const s = sweep("shipped", shipped);
    if (s.wrong.length !== PINS.shipped.wrong || s.right.length !== PINS.shipped.right) {
        throw new Error(
            `step 0: shipped target ${s.right.length} right, ${s.wrong.length} wrong; the sweep pins ${PINS.shipped.right} and ${PINS.shipped.wrong}`,
        );
    }
    const fewestShipped = Math.min(...s.right.map((f) => f.inliers));
    if (fewestShipped < PINS.shipped.minInliers) {
        throw new Error(
            `step 0: a right fit on the shipped target has ${fewestShipped} inliers; the sweep pins at least ${PINS.shipped.minInliers}`,
        );
    }
    const t = sweep("m2", m2);
    if (t.wrong.length !== PINS.m2.wrong || t.right.length !== PINS.m2.right) {
        throw new Error(
            `step 0: M2's 64 patches ${t.right.length} right, ${t.wrong.length} wrong; the record says ${PINS.m2.right} and ${PINS.m2.wrong}`,
        );
    }
    const fewestM2 = Math.min(...t.right.map((f) => f.inliers));
    if (fewestM2 < PINS.m2.minInliers) {
        throw new Error(
            `step 0: a right fit on M2's 64 patches has ${fewestM2} inliers; the record says at least ${PINS.m2.minInliers}`,
        );
    }
    gross = t.wrong.filter(isGross);
    sixteen = t.wrong.filter((f) => !isGross(f));
    if (gross.length !== PINS.m2.gross) {
        throw new Error(
            `${gross.length} wrong fits match the record's description of the gross eight, not ${PINS.m2.gross}`,
        );
    }
}, 240_000);

// ---- Helpers over the fits --------------------------------------------------

const ok = (f: Fit) => {
    if (!f.reading.ok) throw new Error(`${describeFit(f)}: K⁻¹H has a degenerate column`);
    return f.reading;
};
const absScale = (f: Fit) => Math.abs(ok(f).dScale);
const absOrth = (f: Fit) => Math.abs(ok(f).dOrth);
const E = (f: Fit) => Math.max(absScale(f), absOrth(f));
const describeFit = (f: Fit) => `${f.target} seed ${f.seed} view ${f.view} ${f.prediction}`;
const rightOn = (view: 0 | 1, target?: Target) =>
    fits.filter((f) => f.right && f.view === view && (target === undefined || f.target === target));
const argmax = (xs: Fit[], by: (f: Fit) => number) =>
    xs.reduce((best, f) => (by(f) > by(best) ? f : best));
const find = (target: Target, seed: number, view: 0 | 1, prediction: string) => {
    const f = fits.find(
        (g) =>
            g.target === target &&
            g.seed === seed &&
            g.view === view &&
            g.prediction === prediction,
    );
    if (!f) throw new Error(`no fit: ${target} seed ${seed} view ${view} ${prediction}`);
    return f;
};
/** Counts per bin of E: `[0, 0.001) [0.001, 0.002) [0.002, 0.005) [0.005, 0.01) [0.01, 0.02) [0.02, 0.05)`. */
function histogram(xs: Fit[]): number[] {
    const edges = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05];
    const bins = [0, 0, 0, 0, 0, 0];
    for (const f of xs) {
        const e = E(f);
        const i = edges.findIndex((edge) => e < edge);
        if (i < 0) throw new Error(`${describeFit(f)}: E ${e} is not below 0.05`);
        bins[i]++;
    }
    return bins;
}

// ---- Check (b): the readings #160 prints -------------------------------------

describe("the eight gross wrong fits of M2's 64 patches read as #160's per-fit table prints them", () => {
    // #160, "The measurement", the 24-fit table's gross rows: seed, view,
    // prediction, error px, d_scale, d_orth.
    const table: [number, 0 | 1, string, string, string, string][] = [
        [2, 1, "scale x1.1", "9.400", "+0.03166", "+0.04916"],
        [4, 1, "scale x1.1", "9.363", "+0.03171", "+0.04837"],
        [3, 0, "scale x1.1", "9.193", "−0.02596", "+0.05690"],
        [4, 1, "scale x1.12", "8.148", "+0.04174", "−0.01356"],
        [1, 1, "scale x1.1", "7.888", "+0.04645", "−0.01785"],
        [3, 1, "scale x1.1", "7.686", "+0.04420", "−0.01389"],
        [1, 0, "scale x1.1", "7.274", "−0.003502", "+0.01564"],
        [2, 0, "scale x1.1", "7.108", "−0.003256", "+0.02181"],
    ];

    it("is the table's eight: three on view 0, five on view 1, two on each of renders 1 to 4", () => {
        const ids = gross.map((f) => `${f.seed}/${f.view}/${f.prediction}`).sort();
        expect(ids).toEqual(table.map(([s, v, p]) => `${s}/${v}/${p}`).sort());
        expect(gross.filter((f) => f.view === 0).length).toBe(3);
        expect([1, 2, 3, 4].map((s) => gross.filter((f) => f.seed === s).length)).toEqual([
            2, 2, 2, 2,
        ]);
    });

    it.each(table)(
        "seed %i view %i %s: %s px off, d_scale %s, d_orth %s",
        (seed, v, p, error, ds, dorth) => {
            const f = find("m2", seed, v, p);
            expect(isGross(f)).toBe(true);
            expectTableDigits(f.error, error);
            const r = ok(f);
            expectTableDigits(r.dScale, ds);
            expectTableDigits(r.dOrth, dorth);
        },
    );
});

describe("the right fits read as #160's per-view table prints them", () => {
    // #160, "The right fits, per target and view": n, and the maxima of
    // |d_scale|, |d_orth| and E; the distributions as counts per bin of E.
    const table: [Target, 0 | 1, number, string, string, string, number[]][] = [
        ["shipped", 0, 391, "0.00228", "0.00294", "0.00294", [381, 6, 4, 0, 0, 0]],
        ["shipped", 1, 397, "0.00927", "0.03155", "0.03155", [0, 0, 0, 0, 0, 397]],
        ["m2", 0, 395, "0.00262", "0.00353", "0.00353", [333, 54, 8, 0, 0, 0]],
        ["m2", 1, 392, "0.00966", "0.03265", "0.03265", [0, 0, 0, 0, 0, 392]],
    ];

    it.each(table)(
        "%s, view %i: %i right fits, largest |d_scale| %s, |d_orth| %s, E %s",
        (target, v, n, ds, dorth, e, bins) => {
            const xs = rightOn(v, target);
            expect(xs.length).toBe(n);
            expectTableDigits(Math.max(...xs.map(absScale)), ds);
            expectTableDigits(Math.max(...xs.map(absOrth)), dorth);
            expectTableDigits(Math.max(...xs.map(E)), e);
            expect(histogram(xs)).toEqual(bins);
        },
    );

    it("the floors, and whose they are: #160's two-threshold table", () => {
        // "Two separate thresholds", the τ_s and τ_o floors with the fit each
        // belongs to, for the pooled, view-0 and shipped-only rows.
        const pooled = fits.filter((f) => f.right);
        const s = argmax(pooled, absScale);
        expect(describeFit(s)).toBe("m2 seed 4 view 1 shift 3 px @ 112.5°");
        expectTableDigits(absScale(s), "0.009661");
        const o = argmax(pooled, absOrth);
        expect(describeFit(o)).toBe("m2 seed 2 view 1 roll +3°");
        expectTableDigits(absOrth(o), "0.03265");
        expect(o.inliers).toBe(23);
        const s0 = argmax(rightOn(0), absScale);
        expect(describeFit(s0)).toBe("m2 seed 4 view 0 roll -3°");
        expectTableDigits(absScale(s0), "0.002624");
        const o0 = argmax(rightOn(0), absOrth);
        expect(describeFit(o0)).toBe("m2 seed 3 view 0 scale x1.08");
        expectTableDigits(absOrth(o0), "0.003526");
        expect(o0.inliers).toBe(13);
        const shippedS = argmax(
            fits.filter((f) => f.right && f.target === "shipped"),
            absScale,
        );
        expect(describeFit(shippedS)).toBe("shipped seed 4 view 1 roll +4°");
        expectTableDigits(absScale(shippedS), "0.009270");
        const shippedO = argmax(
            fits.filter((f) => f.right && f.target === "shipped"),
            absOrth,
        );
        expect(describeFit(shippedO)).toBe("shipped seed 5 view 1 shift 4 px @ 247.5°");
        expectTableDigits(absOrth(shippedO), "0.03155");
        expect(shippedO.inliers).toBe(20);
    });

    it("the view-1 right fits sit around the view's own signal: d_scale +0.0058 to +0.0097, d_orth −0.03265 to −0.0264", () => {
        // #160, "The distributions", the paragraph after the histograms,
        // which gives the d_orth range as "−0.0327 to −0.0264". Its −0.0327
        // is the prose rounding the per-view table's 0.03265 once more (the
        // fit is M2's seed 2, view 1, roll +3°, |d_orth| 0.03265 in both of
        // #160's tables); the value read here, −0.032650, agrees with the
        // table to its digits and with the prose to 0.3 of its last digit,
        // so the table's figure is what is asserted. Not a disagreement of
        // arithmetic: a rounding of a rounding, in the prose only.
        const xs = rightOn(1).map(ok);
        expectTableDigits(Math.min(...xs.map((r) => r.dScale)), "+0.0058");
        expectTableDigits(Math.max(...xs.map((r) => r.dScale)), "+0.0097");
        expectTableDigits(Math.min(...xs.map((r) => r.dOrth)), "−0.03265");
        expectTableDigits(Math.max(...xs.map((r) => r.dOrth)), "−0.0264");
    });
});

describe("the smallest gross readings, and the sixteen, as #160 prints them", () => {
    it("gross, view 0: |d_scale| 0.00326 to 0.02596, |d_orth| 0.01564 to 0.05690; view 1: 0.03166 to 0.04645 and 0.01356 to 0.04916", () => {
        // #160, "The right fits, per target and view", its two gross rows.
        const g0 = gross.filter((f) => f.view === 0);
        const g1 = gross.filter((f) => f.view === 1);
        expectTableDigits(Math.min(...g0.map(absScale)), "0.00326");
        expectTableDigits(Math.max(...g0.map(absScale)), "0.02596");
        expectTableDigits(Math.min(...g0.map(absOrth)), "0.01564");
        expectTableDigits(Math.max(...g0.map(absOrth)), "0.05690");
        expectTableDigits(Math.min(...g0.map(E)), "0.01564");
        expectTableDigits(Math.min(...g1.map(absScale)), "0.03166");
        expectTableDigits(Math.max(...g1.map(absScale)), "0.04645");
        expectTableDigits(Math.min(...g1.map(absOrth)), "0.01356");
        expectTableDigits(Math.max(...g1.map(absOrth)), "0.04916");
        expectTableDigits(Math.min(...g1.map(E)), "0.04174");
    });

    it("the sixteen: nine on view 0 at E 0.003647 to 0.006524, seven on view 1 at 0.02603 to 0.03411", () => {
        // #160, "The sixteen". Reported; no rule is drawn from them there or here.
        const s0 = sixteen.filter((f) => f.view === 0);
        const s1 = sixteen.filter((f) => f.view === 1);
        expect(s0.length).toBe(9);
        expect(s1.length).toBe(7);
        expectTableDigits(Math.min(...s0.map(E)), "0.003647");
        expectTableDigits(Math.max(...s0.map(E)), "0.006524");
        expectTableDigits(Math.min(...s1.map(E)), "0.02603");
        expectTableDigits(Math.max(...s1.map(E)), "0.03411");
        expect(describeFit(argmax(s0, (f) => -E(f)))).toBe("m2 seed 1 view 0 scale x1.08");
    });
});

// ---- The two arms --------------------------------------------------------------

describe("the acceptance's two arms, read per view at the view's own floors (M4's milestone: 'The #104 clause above is read per view')", () => {
    /** The view's floor pair: the largest |d_scale| and |d_orth| over its right fits of both targets. */
    const floors = (v: 0 | 1) => ({
        maxDScale: Math.max(...rightOn(v).map(absScale)),
        maxDOrth: Math.max(...rightOn(v).map(absOrth)),
    });

    it.each([0, 1] as const)(
        "must-not-fire, view %i: no right fit of either target is refused at the view's floor pair, and none is unreadable",
        (v) => {
            const t = floors(v);
            const refused = rightOn(v).filter((f) => conditioningRefuses(f.reading, t));
            expect(refused.map(describeFit)).toEqual([]);
            expect(rightOn(v).every((f) => f.reading.ok)).toBe(true);
            expect(rightOn(v).length).toBe(v === 0 ? 391 + 395 : 397 + 392);
        },
    );

    it.each([0, 1] as const)(
        "must-fire, view %i: each gross wrong fit on the view is refused at the view's floor pair",
        (v) => {
            const t = floors(v);
            const g = gross.filter((f) => f.view === v);
            expect(g.length).toBe(v === 0 ? 3 : 5);
            for (const f of g) expect(conditioningRefuses(f.reading, t), describeFit(f)).toBe(true);
        },
    );

    it("pooled over both views, the arms cannot both hold: at the pooled floor pair six of the eight are refused and two are not, as #160 found", () => {
        // #160, "Two separate thresholds", the table "Each gross fit against
        // the pooled floor pair (0.009661, 0.03265)": the two of seeds 1 and 2
        // on view 0 pass; three are refused by both quantities, three by
        // d_scale alone.
        const t = {
            maxDScale: Math.max(...fits.filter((f) => f.right).map(absScale)),
            maxDOrth: Math.max(...fits.filter((f) => f.right).map(absOrth)),
        };
        const passing = gross.filter((f) => !conditioningRefuses(f.reading, t)).map(describeFit);
        expect(passing.sort()).toEqual([
            "m2 seed 1 view 0 scale x1.1",
            "m2 seed 2 view 0 scale x1.1",
        ]);
        const byScaleAlone = gross
            .filter((f) => absScale(f) > t.maxDScale && !(absOrth(f) > t.maxDOrth))
            .map(describeFit);
        expect(byScaleAlone.sort()).toEqual([
            "m2 seed 1 view 1 scale x1.1",
            "m2 seed 3 view 1 scale x1.1",
            "m2 seed 4 view 1 scale x1.12",
        ]);
        expect(fits.filter((f) => f.right && conditioningRefuses(f.reading, t))).toEqual([]);
    });
});

// ---- The fixture of chosen matrices is the sweep's ---------------------------

describe("conditioning_fixture.ts holds the sweep's own fitted homographies", () => {
    it.each(CONDITIONING_FIXTURE.map((c) => [c.id, c] as const))(
        "%s: H equals the fit the sweep produces, entry for entry",
        (_id, c) => {
            const f = find(c.target, c.seed, c.view, c.prediction);
            expect(c.H.length).toBe(9);
            for (let i = 0; i < 9; i++) expect(c.H[i]).toBe(f.H[i]);
            expect(c.gross).toBe(isGross(f));
            expect(c.right).toBe(f.right);
            if (c.figures.inliers !== undefined) expect(f.inliers).toBe(c.figures.inliers);
            if (c.figures.error !== undefined) expectTableDigits(f.error, c.figures.error);
        },
    );

    it("holds every gross fit", () => {
        const ids = CONDITIONING_FIXTURE.filter((c) => c.gross).map(
            (c) => `${c.seed}/${c.view}/${c.prediction}`,
        );
        expect(ids.sort()).toEqual(gross.map((f) => `${f.seed}/${f.view}/${f.prediction}`).sort());
    });
});
