/*
 *  pose-draw.test.mjs
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

import { describe, expect, it } from "vitest";
import {
    AXIS_FRACTION,
    BOX_HEIGHT_FRACTION,
    TOWARD_CAMERA,
    poseShapes,
    projectPoint,
    rotationAngleDeg,
} from "../js/pose-draw.mjs";

// A target of the size targets/pinball.wnft's level 0 has the order of, and a
// camera of the processing box's size: the numbers are arbitrary, the
// relations the tests check are not.
const W = 640;
const H = 452;
const K = new Float64Array([520, 0, 239.5, 0, 520, 179.5, 0, 0, 1]);

/** Row-major R of a rotation by `deg` about the unit `axis` (Rodrigues). */
function rotation(axis, deg) {
    const n = Math.hypot(...axis);
    const [x, y, z] = axis.map((a) => a / n);
    const th = (deg * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const C = 1 - c;
    return new Float64Array([
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

/** `π(K · [r1 r2 t] · (x, y, 1))`, the plane homography's projection, written apart from the module. */
function planeHomography(R, t, x, y) {
    const X = R[0] * x + R[1] * y + t[0];
    const Y = R[3] * x + R[4] * y + t[1];
    const Z = R[6] * x + R[7] * y + t[2];
    const u = K[0] * X + K[1] * Y + K[2] * Z;
    const v = K[3] * X + K[4] * Y + K[5] * Z;
    const w = K[6] * X + K[7] * Y + K[8] * Z;
    return [u / w, v / w];
}

/** A target `dist` px in front of the camera, centred on the optical axis, turned by `R`. */
function poseAt(R, dist) {
    const c = [(W - 1) / 2, (H - 1) / 2];
    return {
        R,
        t: new Float64Array([
            -(R[0] * c[0] + R[1] * c[1]),
            -(R[3] * c[0] + R[4] * c[1]),
            dist - (R[6] * c[0] + R[7] * c[1]),
        ]),
        good: true,
    };
}

const POSES = {
    frontal: poseAt(rotation([0, 0, 1], 0), 900),
    oblique: poseAt(rotation([1, 0.4, 0.1], 35), 1100),
    rolled: poseAt(rotation([0.2, -1, 0.5], 50), 1400),
};

describe("projectPoint", () => {
    it("projects a point in front of the camera, with its depth", () => {
        const { R, t } = POSES.frontal;
        const p = projectPoint(K, R, t, [(W - 1) / 2, (H - 1) / 2, 0]);
        expect(p.ok).toBe(true);
        expect(p.point[0]).toBeCloseTo(K[2], 9);
        expect(p.point[1]).toBeCloseTo(K[5], 9);
        expect(p.depth).toBeCloseTo(900, 9);
    });

    it("reports a point behind the camera (w < 0) instead of a wrapped point", () => {
        const { R, t } = poseAt(rotation([0, 0, 1], 0), -900);
        const p = projectPoint(K, R, t, [0, 0, 0]);
        expect(p.ok).toBe(false);
        expect(p.point).toBeUndefined();
        expect(p.w).toBeLessThan(0);
    });

    it("reports a point on the camera's plane (w = 0)", () => {
        const { R, t } = poseAt(rotation([0, 0, 1], 0), 0);
        const p = projectPoint(K, R, t, [0, 0, 0]);
        expect(p.ok).toBe(false);
        expect(p.w).toBe(0);
    });
});

describe("poseShapes", () => {
    for (const [name, pose] of Object.entries(POSES)) {
        it(`${name}: the outline at z = 0 is the plane homography K·[r1 r2 t]'s projection, to 1e-9 px`, () => {
            const s = poseShapes(K, pose, W, H);
            expect(s.ok).toBe(true);
            const corners = [
                [0, 0],
                [W - 1, 0],
                [W - 1, H - 1],
                [0, H - 1],
            ];
            expect(s.outline).toHaveLength(4);
            corners.forEach(([x, y], i) => {
                const [u, v] = planeHomography(pose.R, pose.t, x, y);
                expect(Math.abs(s.outline[i][0] - u)).toBeLessThan(1e-9);
                expect(Math.abs(s.outline[i][1] - v)).toBeLessThan(1e-9);
            });
        });

        it(`${name}: every corner of the box's top is nearer the camera than the corner it stands on`, () => {
            const s = poseShapes(K, pose, W, H);
            expect(s.top).toHaveLength(4);
            for (let i = 0; i < 4; i++) {
                expect(s.depth.top[i]).toBeLessThan(s.depth.base[i]);
            }
        });
    }

    it("stands the box on the target, its height the stated fraction of the target's width", () => {
        // Frontal: depth falls by exactly the box's height, and only depth.
        const s = poseShapes(K, POSES.frontal, W, H);
        for (let i = 0; i < 4; i++) {
            expect(s.depth.base[i] - s.depth.top[i]).toBeCloseTo(BOX_HEIGHT_FRACTION * W, 9);
        }
        expect(TOWARD_CAMERA).toBe(-1);
    });

    it("draws the three axes from the target's centre, each AXIS_FRACTION of its width long", () => {
        const { R, t } = POSES.oblique;
        const s = poseShapes(K, POSES.oblique, W, H);
        const c = [(W - 1) / 2, (H - 1) / 2];
        const L = AXIS_FRACTION * W;
        expect(s.axes.origin).toEqual(projectPoint(K, R, t, [c[0], c[1], 0]).point);
        expect(s.axes.x).toEqual(projectPoint(K, R, t, [c[0] + L, c[1], 0]).point);
        expect(s.axes.y).toEqual(projectPoint(K, R, t, [c[0], c[1] + L, 0]).point);
        expect(s.axes.z).toEqual(projectPoint(K, R, t, [c[0], c[1], TOWARD_CAMERA * L]).point);
    });

    it("refuses a pose with any drawn point behind the camera, naming the shape, and draws nothing", () => {
        // The plane in front, but so near that the box's top passes behind the camera.
        const s = poseShapes(K, poseAt(rotation([0, 0, 1], 0), 0.2 * W), W, H);
        expect(s.ok).toBe(false);
        expect(s.reason).toBe("behind-camera");
        expect(s.behind).toContain("top");
        expect(s.outline).toBeUndefined();
        expect(s.top).toBeUndefined();
        expect(s.axes).toBeUndefined();
    });

    it("refuses a target wholly behind the camera", () => {
        const s = poseShapes(K, poseAt(rotation([0, 0, 1], 0), -900), W, H);
        expect(s.ok).toBe(false);
        expect(s.behind).toEqual(expect.arrayContaining(["outline", "top", "axes"]));
    });
});

describe("rotationAngleDeg", () => {
    it("is 0 between a rotation and itself, and the angle of the relative rotation otherwise", () => {
        const a = rotation([1, 0.4, 0.1], 35);
        expect(rotationAngleDeg(a, a)).toBeCloseTo(0, 6);
        const b = rotation([0, 0, 1], 0);
        expect(rotationAngleDeg(a, b)).toBeCloseTo(35, 9);
        expect(rotationAngleDeg(b, a)).toBeCloseTo(35, 9);
    });
});
