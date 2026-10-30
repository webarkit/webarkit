/*
 *  pose_filter.test.ts
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

// The pose filter's module (#106, Part 3), at unit scale: its three
// properties — the output is always a rotation, it forgets on reset and
// passes the reset frame and the seeding frame through, it is deterministic
// for a given clock — and a layer set to pass through. Each is exercised
// both ways (docs/benchmarks/step-protocol.md, "Every check is exercised both
// ways"): on a stream where it must hold, and on one where the property's
// absence shows. The streams are synthetic, built here, so that each reset
// cause is isolated; the registered criteria on the ground-truth sequences
// are the Stage 3 check's (docs/benchmarks/2026-10-29-106-stage3-check.mjs).

import { describe, it, expect } from "vitest";
import type { Pose } from "@webarkit/cv-backend-spec";
import { PoseFilter, so3Exp, so3Log } from "../../src/pose/pose_filter.js";
import type { PoseFilterInput, PoseFilterLayers } from "../../src/pose/pose_filter.js";

/** The derived pair (the registration, "The derived parameters"). */
const LAYERS: PoseFilterLayers = {
    rotation: { minCutOff: 1, beta: 10 },
    translation: { minCutOff: 1, beta: 0.1 },
    dCutOff: 1,
};

/** Rodrigues, written here so that the inputs do not come from the module under test. */
function rot(axis: [number, number, number], angle: number): Float64Array {
    const n = Math.hypot(...axis);
    const [x, y, z] = axis.map((a) => a / n);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const C = 1 - c;
    return Float64Array.from([
        c + x * x * C,
        x * y * C - z * s,
        x * z * C + y * s,
        y * x * C + z * s,
        c + y * y * C,
        y * z * C - x * s,
        z * x * C - y * s,
        z * y * C + x * s,
        c + z * z * C,
    ]);
}

function mul3(a: Float64Array, b: Float64Array): Float64Array {
    const o = new Float64Array(9);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
}

/** ‖RᵀR − I‖_F and |det R − 1|. */
function rotationDefects(R: Float64Array): { ortho: number; det: number } {
    const Rt = Float64Array.from([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    const M = mul3(Rt, R);
    let s = 0;
    for (let i = 0; i < 9; i++) s += (M[i] - (i % 4 === 0 ? 1 : 0)) ** 2;
    const det =
        R[0] * (R[4] * R[8] - R[5] * R[7]) -
        R[1] * (R[3] * R[8] - R[5] * R[6]) +
        R[2] * (R[3] * R[7] - R[4] * R[6]);
    return { ortho: Math.sqrt(s), det: Math.abs(det - 1) };
}

/** A hand-held-like stream: a slow turn and drift with a deterministic jitter, frame k at `k · 33` ms. */
function pose(k: number): Pose {
    const j = (p: number) => 0.004 * Math.sin(k * p);
    const R = mul3(rot([0.3, 1, 0.2], 0.02 * k + j(1.7)), rot([1, 0, 0.4], 0.3 + j(2.3)));
    const t = Float64Array.from([0.1 * k + j(3.1), -0.05 * k + j(1.3), 4 + j(2.9)]);
    return { R, t, good: true };
}

const track = (k: number, timestampMs = k * 33, p: Pose = pose(k)): PoseFilterInput => ({
    ok: true,
    state: "TRACK",
    pose: p,
    timestampMs,
});

function runStream(frames: readonly PoseFilterInput[], layers: PoseFilterLayers = LAYERS) {
    const f = new PoseFilter(layers);
    return frames.map((fr) => f.apply(fr));
}

const samePose = (a: Pose, b: Pose) =>
    a.R.every((v, i) => Object.is(v, b.R[i])) && a.t.every((v, i) => Object.is(v, b.t[i]));

const digest = (out: readonly (Pose | null)[]) =>
    out.map((p) => (p === null ? "-" : [...p.R, ...p.t].map(String).join(","))).join("\n");

describe("so3Log and so3Exp", () => {
    it("read a rotation back from its rotation vector, small steps included", () => {
        for (const angle of [0, 1e-14, 1e-8, 2e-3, 0.3, 2, Math.PI - 2e-3]) {
            const R = rot([0.2, -0.7, 0.5], angle);
            const w = so3Log(R);
            expect(Math.hypot(...w)).toBeCloseTo(angle, 12);
            const back = so3Exp(w);
            for (let i = 0; i < 9; i++) expect(Math.abs(back[i] - R[i])).toBeLessThan(1e-12);
        }
    });

    // The probe's `so3Log` exits near π (script line 200); a library cannot, and
    // the antisymmetric part alone cannot read the axis there. Both ways: the
    // antisymmetric part's own scale `θ / ‖v‖` is not finite at π, and the
    // module's log is.
    it("reads a rotation at and near π from the symmetric part, where the antisymmetric part vanishes", () => {
        for (const angle of [Math.PI, Math.PI - 1e-9, Math.PI - 1e-5, Math.PI - 5e-4]) {
            const R = rot([0.6, 0.3, -0.74], angle);
            const w = so3Log(R);
            expect(w.every(Number.isFinite)).toBe(true);
            expect(Math.hypot(...w)).toBeCloseTo(angle, 9);
            const back = so3Exp(w);
            for (let i = 0; i < 9; i++) expect(Math.abs(back[i] - R[i])).toBeLessThan(1e-9);
        }
        // A half-turn built as 2nnᵀ − I is exactly symmetric: its antisymmetric
        // part is exactly 0, where `rot` leaves sin(π) ≈ 1.2e-16 in it.
        const n = [0.6, 0.3, -0.74].map((a, _, all) => a / Math.hypot(...all));
        const H = Float64Array.from({ length: 9 }, (_, i) => {
            const r = Math.floor(i / 3);
            const c = i % 3;
            return 2 * n[r] * n[c] - (r === c ? 1 : 0);
        });
        const v = [H[7] - H[5], H[2] - H[6], H[3] - H[1]];
        expect(v).toEqual([0, 0, 0]);
        const theta = Math.atan2(Math.hypot(...v) / 2, (H[0] + H[4] + H[8] - 1) / 2);
        const naive = v.map((x) => (theta / Math.hypot(...v)) * x);
        expect(naive.some((x) => !Number.isFinite(x))).toBe(true);
        const w = so3Log(H);
        expect(w.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...w)).toBeCloseTo(Math.PI, 12);
        const back = so3Exp(w);
        for (let i = 0; i < 9; i++) expect(Math.abs(back[i] - H[i])).toBeLessThan(1e-12);
    });
});

describe("PoseFilter: the output is always a rotation", () => {
    it("keeps every filtered R orthonormal with det 1, where averaging R element by element does not", () => {
        const frames = Array.from({ length: 60 }, (_, k) => track(k));
        const out = runStream(frames);
        let filtered = 0;
        for (const p of out) {
            const d = rotationDefects(p!.R);
            expect(d.ortho).toBeLessThanOrEqual(1e-9);
            expect(d.det).toBeLessThanOrEqual(1e-9);
            if (!samePose(p!, frames[out.indexOf(p)].pose!)) filtered++;
        }
        expect(filtered).toBe(59);
        // Must fire: the same stream averaged element by element, the probe's
        // "elementwise" variant at its simplest (one EMA on the nine entries).
        let Rbar = Float64Array.from(frames[0].pose!.R);
        let worst = 0;
        for (const fr of frames.slice(1)) {
            Rbar = Rbar.map((v, i) => v + 0.2 * (fr.pose!.R[i] - v));
            worst = Math.max(worst, rotationDefects(Rbar).ortho);
        }
        expect(worst).toBeGreaterThan(1e-9);
    });
});

describe("PoseFilter: it forgets on reset, and passes the reset frame and the seeding frame through", () => {
    /** Frames that pass through return their input pose, the same object. */
    const passes = (out: readonly (Pose | null)[], frames: readonly PoseFilterInput[], k: number) =>
        out[k] === frames[k].pose;

    it("seeds on the first TRACK and filters the next", () => {
        const frames = [0, 1, 2].map((k) => track(k));
        const out = runStream(frames);
        expect(passes(out, frames, 0)).toBe(true);
        expect(passes(out, frames, 1)).toBe(false);
        expect(samePose(out[1]!, frames[1].pose!)).toBe(false);
        expect(out[1]!.good).toBe(true);
    });

    it("resets on a result that is not TRACK: a DETECT passes through and does not seed", () => {
        const frames: PoseFilterInput[] = [
            track(0),
            track(1),
            { ...track(2), state: "DETECT" },
            track(3),
            track(4),
        ];
        const out = runStream(frames);
        expect(passes(out, frames, 2)).toBe(true);
        expect(passes(out, frames, 3)).toBe(true); // seeds
        expect(passes(out, frames, 4)).toBe(false);
        // Must fire: the same stream all TRACK filters frames 2 and 3.
        const all = runStream(frames.map((_, k) => track(k)));
        expect(samePose(all[2]!, frames[2].pose!)).toBe(false);
        expect(samePose(all[3]!, frames[3].pose!)).toBe(false);
    });

    it("resets on a LOST result, which has no pose, and keeps its timestamp", () => {
        const lost: PoseFilterInput = { ok: false, state: "LOST", pose: null, timestampMs: 66 };
        const frames = [track(0), track(1), lost, track(3, 66), track(4), track(5)];
        const out = runStream(frames);
        expect(out[2]).toBeNull();
        // 66 does not exceed the LOST frame's 66: a reset, so frame 3 passes
        // through, frame 4 seeds, frame 5 is filtered.
        expect(passes(out, frames, 3)).toBe(true);
        expect(passes(out, frames, 4)).toBe(true);
        expect(passes(out, frames, 5)).toBe(false);
        // Must fire: at 70 ms frame 3 seeds, and frame 4 is filtered.
        const later = [...frames.slice(0, 3), track(3, 70), track(4), track(5)];
        const o2 = runStream(later);
        expect(passes(o2, later, 3)).toBe(true);
        expect(passes(o2, later, 4)).toBe(false);
    });

    it("resets on pose.good === false", () => {
        const bad = { ...pose(3), good: false };
        const frames = [track(0), track(1), track(2), track(3, 99, bad), track(4), track(5)];
        const out = runStream(frames);
        expect(passes(out, frames, 3)).toBe(true);
        expect(passes(out, frames, 4)).toBe(true); // seeds
        expect(passes(out, frames, 5)).toBe(false);
        // Must fire: the good pose on frame 3 is filtered, and so is frame 4.
        const good = runStream(frames.map((_, k) => track(k)));
        expect(samePose(good[3]!, frames[3].pose!)).toBe(false);
        expect(samePose(good[4]!, frames[4].pose!)).toBe(false);
    });

    // The cross-reset case (f853004): the last input timestamp is kept apart
    // from the seeding timestamp. Frame 0 is a DETECT, so frame 1 passes
    // through under the ruled rule and under a rule that forgets the
    // timestamp on reset alike; frame 2 tells them apart.
    for (const [name, t1] of [
        ["repeated", 0],
        ["reversed", -33],
    ] as const) {
        it(`resets on a ${name} timestamp right after a reset`, () => {
            const frames: PoseFilterInput[] = [
                { ...track(0), state: "DETECT" },
                track(1, t1),
                track(2),
                track(3),
            ];
            const out = runStream(frames);
            expect(passes(out, frames, 1)).toBe(true);
            expect(passes(out, frames, 2)).toBe(true); // frame 1 reset; frame 2 seeds
            expect(passes(out, frames, 3)).toBe(false);
            // Must fire: with frame 1 at 33 ms, frame 1 seeds and frame 2 is filtered.
            const ok = [frames[0], track(1), track(2), track(3)];
            const o2 = runStream(ok);
            expect(passes(o2, ok, 1)).toBe(true);
            expect(passes(o2, ok, 2)).toBe(false);
        });
    }

    it("resets on a repeated timestamp while seeded, and does not hold the previous value", () => {
        const frames = [track(0), track(1), track(2), track(3, 66), track(4), track(5)];
        const out = runStream(frames);
        expect(passes(out, frames, 3)).toBe(true);
        expect(passes(out, frames, 4)).toBe(true);
        expect(passes(out, frames, 5)).toBe(false);
    });

    it("forgets the state on reset: after one, the stream filters as a fresh filter does", () => {
        const head = [0, 1, 2, 3, 4].map((k) => track(k));
        const tail = [6, 7, 8, 9].map((k) => track(k));
        const detect: PoseFilterInput = { ...track(5), state: "DETECT" };
        const out = runStream([...head, detect, ...tail]);
        const fresh = runStream(tail);
        for (let k = 0; k < tail.length; k++) expect(samePose(out[6 + k]!, fresh[k]!)).toBe(true);
        // Must fire: without the reset, frame 6 is filtered against frames 0 to 4.
        const kept = runStream([...head, track(5), ...tail]);
        expect(samePose(kept[6]!, fresh[0]!)).toBe(false);
    });

    it("never writes into the poses it is given, nor reuses its output's arrays", () => {
        const frames = Array.from({ length: 8 }, (_, k) => track(k));
        const copies = frames.map((f) => ({
            R: Float64Array.from(f.pose!.R),
            t: Float64Array.from(f.pose!.t),
        }));
        const f = new PoseFilter(LAYERS);
        const out = frames.map((fr) => f.apply(fr));
        const snapshot = out.map((p) => ({
            R: Float64Array.from(p!.R),
            t: Float64Array.from(p!.t),
        }));
        frames.forEach((fr, k) =>
            expect(samePose(fr.pose!, { ...copies[k], good: true })).toBe(true),
        );
        f.apply(track(8));
        out.forEach((p, k) => expect(samePose(p!, { ...snapshot[k], good: true })).toBe(true));
        for (let k = 1; k < out.length; k++) {
            expect(out[k]!.R).not.toBe(out[k - 1]!.R);
            expect(out[k]!.t).not.toBe(out[k - 1]!.t);
        }
    });
});

describe("PoseFilter: deterministic for a given clock", () => {
    const frames = Array.from({ length: 40 }, (_, k) => track(k));

    it("gives the same output twice, reads no clock, and reads the timestamps it is given", () => {
        const a = digest(runStream(frames));
        expect(digest(runStream(frames))).toBe(a);
        const perfNow = performance.now;
        const dateNow = Date.now;
        const stub = () => {
            throw new Error("clock read");
        };
        performance.now = stub;
        Date.now = stub;
        let stubbed: string;
        try {
            stubbed = digest(runStream(frames));
        } finally {
            performance.now = perfNow;
            Date.now = dateNow;
        }
        expect(stubbed).toBe(a);
        // Must fire: the same poses on half the spacing filter differently.
        const halved = frames.map((f) => ({ ...f, timestampMs: f.timestampMs / 2 }));
        expect(digest(runStream(halved))).not.toBe(a);
    });
});

describe("PoseFilter: a layer set to pass through", () => {
    const frames = Array.from({ length: 20 }, (_, k) => track(k));

    it("leaves the rotation unchanged with the rotation layer off, and filters the translation", () => {
        const out = runStream(frames, { ...LAYERS, rotation: null });
        for (let k = 0; k < frames.length; k++) {
            expect(out[k]!.R.every((v, i) => Object.is(v, frames[k].pose!.R[i]))).toBe(true);
        }
        expect(out.slice(1).some((p, k) => !Object.is(p!.t[0], frames[k + 1].pose!.t[0]))).toBe(
            true,
        );
    });

    it("leaves the translation unchanged with the translation layer off, and filters the rotation", () => {
        const out = runStream(frames, { ...LAYERS, translation: null });
        for (let k = 0; k < frames.length; k++) {
            expect(out[k]!.t.every((v, i) => Object.is(v, frames[k].pose!.t[i]))).toBe(true);
        }
        expect(out.slice(1).some((p, k) => !Object.is(p!.R[0], frames[k + 1].pose!.R[0]))).toBe(
            true,
        );
    });

    it("filters the translation with both layers on as with the rotation off", () => {
        const both = runStream(frames);
        const tOnly = runStream(frames, { ...LAYERS, rotation: null });
        for (let k = 0; k < frames.length; k++) {
            expect(both[k]!.t.every((v, i) => Object.is(v, tOnly[k]!.t[i]))).toBe(true);
        }
    });
});
