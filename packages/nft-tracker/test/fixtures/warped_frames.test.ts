/*
 *  warped_frames.test.ts
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

import { describe, it, expect } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { crc32 } from "../../src/target/format/crc32.js";
import { readPgm, TARGET_FIXTURE } from "./pgm.js";
import {
    IDENTITY,
    mat3Inv,
    mat3Mul,
    project,
    renderWarp,
    scaling,
    translation,
    view,
} from "./warped_frames.js";

// The generator every tracking measurement is taken on. Each property below
// is one the measurements rely on: if the generator moved a pixel, blurred
// more than it says or drew different noise, every accuracy figure in the
// tracking suites would silently change meaning.

const target = readPgm(TARGET_FIXTURE);

function flat(width: number, height: number, value: number): GrayImage {
    return { data: new Uint8Array(width * height).fill(value), width, height };
}

describe("renderWarp", () => {
    it("reproduces the target exactly under the identity", () => {
        const frame = renderWarp(target, IDENTITY, { width: target.width, height: target.height });
        expect(frame.width).toBe(target.width);
        expect(frame.height).toBe(target.height);
        expect(Buffer.from(frame.data).equals(Buffer.from(target.data))).toBe(true);
    });

    it("shifts by whole pixels exactly, and shows the background where the target is not", () => {
        const [tx, ty] = [7, -5];
        const frame = renderWarp(target, translation(tx, ty), {
            width: 100,
            height: 80,
            background: 3,
        });
        const expected = new Uint8Array(frame.data.length);
        for (let y = 0; y < frame.height; y++) {
            for (let x = 0; x < frame.width; x++) {
                const [X, Y] = [x - tx, y - ty];
                const inside = X >= 0 && Y >= 0 && X < target.width && Y < target.height;
                expected[y * frame.width + x] = inside ? target.data[Y * target.width + X] : 3;
            }
        }
        expect(Buffer.from(frame.data).equals(Buffer.from(expected))).toBe(true);
    });

    it("applies gain and bias as round(gain · v + bias), clamped to [0, 255]", () => {
        const [gain, bias] = [1.37, -41.5];
        const frame = renderWarp(target, IDENTITY, {
            width: target.width,
            height: target.height,
            gain,
            bias,
        });
        const expected = new Uint8Array(target.data.length);
        let clampedLow = 0;
        let clampedHigh = 0;
        for (let i = 0; i < target.data.length; i++) {
            const v = Math.round(gain * target.data[i] + bias);
            if (v < 0) clampedLow++;
            if (v > 255) clampedHigh++;
            expected[i] = Math.min(255, Math.max(0, v));
        }
        expect(Buffer.from(frame.data).equals(Buffer.from(expected))).toBe(true);
        // Both clamps are exercised, not just the linear part.
        expect(clampedLow).toBeGreaterThan(0);
        expect(clampedHigh).toBeGreaterThan(0);
    });

    it("blurs with passes of [1, 2, 1] / 4: two passes turn an impulse into the 5×5 binomial, variance 1 px² per axis", () => {
        const impulse = flat(15, 15, 0);
        impulse.data[7 * 15 + 7] = 255;
        const frame = renderWarp(impulse, IDENTITY, {
            width: 15,
            height: 15,
            background: 0,
            blurPasses: 2,
        });
        // 255 · b_i · b_j / 256 rounds to exactly b_i · b_j for b = [1, 4, 6, 4, 1].
        const b = [1, 4, 6, 4, 1];
        let sum = 0;
        let varianceX = 0;
        for (let y = 0; y < 15; y++) {
            for (let x = 0; x < 15; x++) {
                const inKernel = Math.abs(x - 7) <= 2 && Math.abs(y - 7) <= 2;
                const expected = inKernel ? b[x - 5] * b[y - 5] : 0;
                const v = frame.data[y * 15 + x];
                expect(v).toBe(expected);
                sum += v;
                varianceX += v * (x - 7) ** 2;
            }
        }
        expect(sum).toBe(256);
        expect(varianceX / sum).toBe(1); // passes / 2
    });

    it("area-samples when minifying: 1-px stripes at scale 1/2 average to flat grey instead of aliasing", () => {
        const stripes = flat(64, 64, 0);
        for (let i = 0; i < stripes.data.length; i++) stripes.data[i] = i % 2 === 0 ? 0 : 255;
        const frame = renderWarp(stripes, scaling(0.5), { width: 32, height: 32 });
        // Column 0 reaches half a pixel past the stripes' left edge, where the
        // edge pixel is extended; every other column sees two whole stripes.
        for (let y = 0; y < 32; y++) {
            for (let x = 1; x < 32; x++) expect(frame.data[y * 32 + x]).toBe(128);
        }
    });

    it("adds seeded noise of the requested sigma (5 grey levels, within 3%) and zero mean", () => {
        const sigma = 5;
        const base = flat(256, 256, 128);
        const frame = renderWarp(base, IDENTITY, {
            width: 256,
            height: 256,
            noiseSigma: sigma,
            seed: 11,
        });
        let sum = 0;
        let sumSq = 0;
        for (const v of frame.data) {
            sum += v - 128;
            sumSq += (v - 128) ** 2;
        }
        const n = frame.data.length;
        const mean = sum / n;
        const std = Math.sqrt(sumSq / n - mean * mean);
        expect(Math.abs(mean)).toBeLessThan(0.1);
        expect(Math.abs(std / sigma - 1)).toBeLessThan(0.03);

        const again = renderWarp(base, IDENTITY, {
            width: 256,
            height: 256,
            noiseSigma: sigma,
            seed: 11,
        });
        const other = renderWarp(base, IDENTITY, {
            width: 256,
            height: 256,
            noiseSigma: sigma,
            seed: 12,
        });
        expect(Buffer.from(again.data).equals(Buffer.from(frame.data))).toBe(true);
        expect(Buffer.from(other.data).equals(Buffer.from(frame.data))).toBe(false);
    });

    it("is deterministic, and pinned: a perspective render with every effect has a fixed CRC-32", () => {
        // A literal homography, so the pin does not depend on Math.cos and
        // friends, which the language leaves implementation-approximated.
        const H: Mat3 = Float64Array.from([
            0.55, -0.12, 60, 0.1, 0.52, 40, 0.0002, -0.0001, 1,
        ]);
        const options = {
            width: 320,
            height: 240,
            blurPasses: 1,
            gain: 0.8,
            bias: 12,
            noiseSigma: 3,
            seed: 7,
        };
        const frame = renderWarp(target, H, options);
        expect(renderWarp(target, H, options).data).toEqual(frame.data);
        // Recorded from the first run of this generator. Like the .wnft corpus,
        // a change here is a change to every measurement taken on these frames:
        // explain it in the commit that updates the value, do not just re-record.
        expect(crc32(frame.data)).toBe(0x0b4ad64e);
    });
});

describe("homography helpers", () => {
    it("invert and compose consistently: H⁻¹ · H is the identity and project round-trips", () => {
        const H = view({
            target: { width: 512, height: 640 },
            frame: { width: 640, height: 480 },
            scale: 0.63,
            angle: 0.5,
            perspective: [0.0003, -0.0005],
            shift: [12, -7],
        });
        const I = mat3Mul(mat3Inv(H), H);
        for (let i = 0; i < 9; i++) expect(I[i] / I[8]).toBeCloseTo(IDENTITY[i], 12);
        const [x, y] = project(H, 100.25, 321.5);
        const [X, Y] = project(mat3Inv(H), x, y);
        expect(X).toBeCloseTo(100.25, 9);
        expect(Y).toBeCloseTo(321.5, 9);
    });

    it("builds a view that puts the target centre at the frame centre plus the shift, at the requested scale", () => {
        const H = view({
            target: { width: 512, height: 640 },
            frame: { width: 640, height: 480 },
            scale: 0.63,
            angle: 0.5,
            perspective: [0.0003, -0.0005],
            shift: [12, -7],
        });
        const [cx, cy] = project(H, 255.5, 319.5);
        expect(cx).toBeCloseTo(319.5 + 12, 9);
        expect(cy).toBeCloseTo(239.5 - 7, 9);
        // Local scale at the centre: |det J| = scale², whatever the angle and
        // perspective, since the perspective term is applied about the centre.
        const d = 1e-4;
        const [xr, yr] = project(H, 255.5 + d, 319.5);
        const [xd, yd] = project(H, 255.5, 319.5 + d);
        const det = ((xr - cx) * (yd - cy) - (xd - cx) * (yr - cy)) / (d * d);
        expect(Math.sqrt(det)).toBeCloseTo(0.63, 6);
    });
});
