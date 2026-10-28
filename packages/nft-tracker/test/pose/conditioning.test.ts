/*
 *  conditioning.test.ts
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

// The conditioning signal of #104 (M4's step 2) as a pure function: its two
// quantities on the two exact views of #90's sweep, its invariances, what it
// does on an input it cannot read, and the refusal rule. The agreement with
// the derivation of record (docs/benchmarks/2026-10-21-104-stage1-threshold-
// derivation.md) on the sweep's fitted homographies is conditioning_sweep
// .test.ts, which runs the sweep; this file is the part that runs in
// milliseconds.
//
// The arithmetic under test was written from #104's body ("The signal") and
// from the derivation's prose, not from its script: the point of comparing
// two implementations is that they were arrived at separately.

import { describe, it, expect } from "vitest";
import type { Mat3 } from "@webarkit/cv-backend-spec";
import { intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { conditioning, conditioningRefuses } from "../../src/pose/conditioning.js";
import { readPgm, TARGET_FIXTURE } from "../../ground-truth/fixtures/pgm.js";
import { view } from "../../ground-truth/fixtures/warped_frames.js";
import { expectTableDigits, RECORD_K } from "./conditioning_record.js";
import { CONDITIONING_FIXTURE } from "./conditioning_fixture.js";

const image = readPgm(TARGET_FIXTURE);
const CAMERA = { width: 270, height: 360 };

/** The sweep's two views, as `track_frame.test.ts` builds them (its `VIEWS`). */
const VIEW_0 = view({ target: image, frame: CAMERA, scale: 0.45 });
const VIEW_1 = view({
    target: image,
    frame: CAMERA,
    scale: 0.45,
    angle: (15 * Math.PI) / 180,
    perspective: [0.0004, -0.0003],
});

describe("the record's K", () => {
    it("is intrinsics(270, 360): f = 135 / tan 30°, principal point (135, 180), no skew", () => {
        // 2026-10-15-m4-step3-ippe-acceptance.md, §3 "Inputs, fixed": "K =
        // intrinsics(270, 360) of cv-backend-jsfeatnext, the frozen tests'
        // camera: a 60° horizontal field of view, so f = 135 / tan 30° =
        // 233.83 px, principal point at the frame's centre." RECORD_K is
        // built from that sentence; this checks it against the function.
        const K = intrinsics(CAMERA.width, CAMERA.height);
        for (let i = 0; i < 9; i++) expect(K[i]).toBeCloseTo(RECORD_K[i], 9);
        expect(RECORD_K[0]).toBeCloseTo(233.83, 2);
        expect(RECORD_K[1]).toBe(0);
    });
});

describe("conditioning(H, K): the two quantities", () => {
    it("reads the fatal anchor on the sweep's second view's exact H: d_scale +0.008425, d_orth −0.03126", () => {
        // #160, "Where K comes from": "Under this K it reads d_scale
        // +0.008425 and d_orth −0.03126, and the check passes; the record
        // states magnitudes, and the sign of d_orth is negative."
        const r = conditioning(VIEW_1, RECORD_K);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expectTableDigits(r.dScale, "+0.008425");
        expectTableDigits(r.dOrth, "−0.03126");
    });

    it("reads 0 on the first view's exact H, a similarity, below 1e-12", () => {
        // #160, the same section: "The first view's exact H is a similarity
        // (no perspective term), so the first two columns of K⁻¹H are s/f
        // times two orthogonal unit vectors for any K without skew: both
        // quantities are 0 there whatever f, and the script checks that too
        // (below 10⁻¹²)."
        const r = conditioning(VIEW_0, RECORD_K);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Math.abs(r.dScale)).toBeLessThan(1e-12);
        expect(Math.abs(r.dOrth)).toBeLessThan(1e-12);
        // And whatever f: the same at 45° and 90° of field of view.
        for (const fov of [45, 90]) {
            const s = conditioning(VIEW_0, intrinsics(CAMERA.width, CAMERA.height, fov));
            expect(s.ok).toBe(true);
            if (!s.ok) return;
            expect(Math.abs(s.dScale)).toBeLessThan(1e-12);
            expect(Math.abs(s.dOrth)).toBeLessThan(1e-12);
        }
    });

    it("is invariant to the scale of H, sign included: a ratio of norms and a cosine", () => {
        const r = conditioning(VIEW_1, RECORD_K);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (const k of [2, 0.001, -1, -37.5]) {
            const s = conditioning(VIEW_1.map((v) => k * v) as unknown as Mat3, RECORD_K);
            expect(s.ok).toBe(true);
            if (!s.ok) return;
            expect(s.dScale).toBeCloseTo(r.dScale, 14);
            expect(s.dOrth).toBeCloseTo(r.dOrth, 14);
        }
    });

    it("depends on f on the second view: the figures are the record's K's only", () => {
        // #160, "Beyond the brief": view 1's signal "depends on f". Not a
        // figure of the record, but the dependence is: an implementation
        // that ignored K (read H's own columns) would be constant here.
        const at60 = conditioning(VIEW_1, RECORD_K);
        const at90 = conditioning(VIEW_1, intrinsics(CAMERA.width, CAMERA.height, 90));
        expect(at60.ok && at90.ok).toBe(true);
        if (!at60.ok || !at90.ok) return;
        expect(at60.dOrth).not.toBeCloseTo(at90.dOrth, 3);
    });
});

describe("conditioning(H, K): an input it cannot read", () => {
    const zeroColumn: Mat3 = Float64Array.from([0, 1, 2, 0, 3, 4, 0, 5, 1]);
    const singularK: Mat3 = Float64Array.from([0, 0, 135, 0, 0, 180, 0, 0, 1]);
    const nan: Mat3 = Float64Array.from([NaN, 0, 0, 0, 1, 0, 0, 0, 1]);
    const inf: Mat3 = Float64Array.from([Infinity, 0, 0, 0, 1, 0, 0, 0, 1]);

    it.each([
        ["H with a zero first column", zeroColumn, RECORD_K],
        ["H all zero", new Float64Array(9) as Mat3, RECORD_K],
        ["a singular K", VIEW_1, singularK],
        ["a NaN in H", nan, RECORD_K],
        ["an infinity in H", inf, RECORD_K],
        // The third column of H does not enter b1 or b2, so a reading that
        // checked only the two columns it uses would pass these (found in
        // review, on #161): the claim is that a non-finite entry anywhere in
        // H is refused, and the code must match the claim.
        ["a NaN in H's third column", Float64Array.from([1, 0, NaN, 0, 1, 0, 0, 0, 1]), RECORD_K],
        [
            "an infinity in H's third column",
            Float64Array.from([1, 0, 0, 0, 1, Infinity, 0, 0, 1]),
            RECORD_K,
        ],
        ["a NaN in H's last entry", Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, NaN]), RECORD_K],
        ["a NaN in K", VIEW_1, nan],
    ])("returns ok: false and does not throw on %s", (_name, H, K) => {
        let r;
        expect(() => (r = conditioning(H, K))).not.toThrow();
        expect(r).toEqual({ ok: false, reason: "degenerate" });
    });
});

describe("conditioningRefuses(reading, thresholds): the refusing state's rule", () => {
    const t = { maxDScale: 0.01, maxDOrth: 0.03 };

    it("refuses when |d_scale| exceeds its threshold, or |d_orth| exceeds its own, and not otherwise", () => {
        expect(conditioningRefuses({ ok: true, dScale: 0.005, dOrth: 0.02 }, t)).toBe(false);
        expect(conditioningRefuses({ ok: true, dScale: -0.005, dOrth: -0.02 }, t)).toBe(false);
        expect(conditioningRefuses({ ok: true, dScale: 0.011, dOrth: 0.0 }, t)).toBe(true);
        expect(conditioningRefuses({ ok: true, dScale: -0.011, dOrth: 0.0 }, t)).toBe(true);
        expect(conditioningRefuses({ ok: true, dScale: 0.0, dOrth: 0.031 }, t)).toBe(true);
        expect(conditioningRefuses({ ok: true, dScale: 0.0, dOrth: -0.031 }, t)).toBe(true);
    });

    it("does not refuse a reading exactly at a threshold: the rule is >, as #153's kind E states it", () => {
        // 2026-10-19-104-stage1-effect-size-probe.md, "The refusal, three
        // kinds and two scopes": "refuse when |d_scale| > τ or |d_orth| > τ".
        expect(conditioningRefuses({ ok: true, dScale: 0.01, dOrth: 0.03 }, t)).toBe(false);
    });

    it("refuses a reading it could not take: an instrument that cannot tell clean from blind refuses when blind", () => {
        expect(conditioningRefuses({ ok: false, reason: "degenerate" }, t)).toBe(true);
        expect(conditioningRefuses({ ok: true, dScale: NaN, dOrth: 0 }, t)).toBe(true);
        expect(conditioningRefuses({ ok: true, dScale: 0, dOrth: NaN }, t)).toBe(true);
    });
});

describe("check (b) on sixteen of the sweep's fitted homographies: the shipped arithmetic reads #160's figures", () => {
    // conditioning_fixture.ts: the eight gross fits, the six floor-setting
    // right fits, two of the sixteen with the thinnest margins. Each figure
    // is #160's, to the digits it prints. conditioning_sweep.test.ts ties each
    // H here to the sweep's own fit; this file only reads them.
    it("has the composition its header states: 8 gross, 6 right, 2 wrong but not gross", () => {
        expect(CONDITIONING_FIXTURE.length).toBe(16);
        expect(CONDITIONING_FIXTURE.filter((c) => c.gross).length).toBe(8);
        expect(CONDITIONING_FIXTURE.filter((c) => c.right).length).toBe(6);
        expect(CONDITIONING_FIXTURE.filter((c) => !c.right && !c.gross).length).toBe(2);
        expect(new Set(CONDITIONING_FIXTURE.map((c) => c.id)).size).toBe(16);
    });

    it.each(CONDITIONING_FIXTURE.map((c) => [c.id, c] as const))("%s", (_id, c) => {
        const r = conditioning(Float64Array.from(c.H), RECORD_K);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const f = c.figures;
        expect(
            f.dScale !== undefined ||
                f.dOrth !== undefined ||
                f.absDScale !== undefined ||
                f.absDOrth !== undefined,
        ).toBe(true);
        if (f.dScale !== undefined) expectTableDigits(r.dScale, f.dScale);
        if (f.dOrth !== undefined) expectTableDigits(r.dOrth, f.dOrth);
        if (f.absDScale !== undefined) expectTableDigits(Math.abs(r.dScale), f.absDScale);
        if (f.absDOrth !== undefined) expectTableDigits(Math.abs(r.dOrth), f.absDOrth);
    });

    it("separates, on these sixteen and per view, as a property of the fixture — not a statement about the sweep", () => {
        // On this fixture the largest right reading on each view lies below
        // every gross reading's larger quantity on that view, and the gross
        // fits are refused at the fixture's own per-view floors while the
        // right ones are not. The sweep's conclusion is #160's, read over
        // 1,370 steps per target; conditioning_sweep.test.ts reads it there.
        // Sixteen chosen cases say nothing about that population.
        for (const v of [0, 1] as const) {
            const on = CONDITIONING_FIXTURE.filter((c) => c.view === v);
            const read = (c: (typeof on)[number]) => {
                const r = conditioning(Float64Array.from(c.H), RECORD_K);
                if (!r.ok) throw new Error(`${c.id}: degenerate`);
                return r;
            };
            const right = on.filter((c) => c.right).map(read);
            const gross = on.filter((c) => c.gross).map(read);
            expect(right.length).toBeGreaterThan(0);
            expect(gross.length).toBe(v === 0 ? 3 : 5);
            const floors = {
                maxDScale: Math.max(...right.map((r) => Math.abs(r.dScale))),
                maxDOrth: Math.max(...right.map((r) => Math.abs(r.dOrth))),
            };
            for (const r of right) expect(conditioningRefuses(r, floors)).toBe(false);
            for (const r of gross) expect(conditioningRefuses(r, floors)).toBe(true);
        }
    });
});
