/*
 *  pose-draw.mjs
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
 * The pose demo's drawing math (#200): what `pinball-pose-jsfeatnext-backend.html`
 * draws of a `Pose`, as frame pixels, through `K · [R | t]`.
 *
 * The model is the target's plane, in target level-0 pixels, `z = 0` on the
 * plane: the convention of `projectPose` in
 * `packages/nft-tracker/test/pose/pose_metric.ts`, written again here from its
 * definition rather than imported, since nothing under `test/` is served. A
 * point `(x, y, z)` goes to the camera frame as `R · (x, y, z) + t`, and to
 * the frame as `π(K · ·)`.
 *
 * Pure: no DOM, no canvas. It measures nothing, and no exported value reads
 * it (examples/README.md).
 */

/** The box's height, as a fraction of the target's width. */
export const BOX_HEIGHT_FRACTION = 0.25;
/** Each axis's length, as a fraction of the target's width. */
export const AXIS_FRACTION = 0.3;
/**
 * The sign of `z` that stands toward the camera. `Pose` is in the OpenCV
 * camera frame (`cv-backend-spec`: "camera looks down +Z"), so a point's
 * depth is the third component of `R · (x, y, z) + t`. The target's `x` runs
 * right and `y` down, as the camera's own axes do, so a proper `R` (det +1)
 * that shows the target's printed side keeps `z` pointing the way the camera
 * looks: into the target, away from the camera. Toward the camera is then
 * `-z`. The tests check this on synthetic poses, and the page reports it on
 * every pose it draws (`data-box-top-nearer`).
 */
export const TOWARD_CAMERA = -1;

/**
 * `π(K · (R · (x, y, z) + t))`, and the point's depth, the third component of
 * `R · (x, y, z) + t`. A point with `w ≤ 0` (`w`, the third component of the
 * product with `K`) is on or behind the camera's plane: it is reported, with
 * no `point`, since dividing by it would draw a wrapped point.
 *
 * @returns `{ ok: true, point: [u, v], depth, w }` or `{ ok: false, depth, w }`.
 */
export function projectPoint(K, R, t, [x, y, z]) {
    const X = R[0] * x + R[1] * y + R[2] * z + t[0];
    const Y = R[3] * x + R[4] * y + R[5] * z + t[1];
    const Z = R[6] * x + R[7] * y + R[8] * z + t[2];
    const u = K[0] * X + K[1] * Y + K[2] * Z;
    const v = K[3] * X + K[4] * Y + K[5] * Z;
    const w = K[6] * X + K[7] * Y + K[8] * Z;
    if (!(w > 0)) return { ok: false, depth: Z, w };
    return { ok: true, point: [u / w, v / w], depth: Z, w };
}

/**
 * What the page draws of `pose`, on a target `width × height` level-0 pixels:
 *
 * - `outline`: the target's four corners at `z = 0`, in the order the other
 *   demos project under `H` (top-left, top-right, bottom-right, bottom-left);
 * - `top`: the same corners lifted toward the camera by
 *   `BOX_HEIGHT_FRACTION · width`, the top of a box standing on the target;
 * - `axes`: the target's centre, and the ends of its `x`, `y` and `z` axes
 *   from it, `AXIS_FRACTION · width` long, `z` toward the camera;
 * - `depth`: the outline's and the top's depths, by corner.
 *
 * All or nothing: if any point is behind the camera, nothing is returned to
 * draw, and `behind` names the shapes it was in.
 *
 * @returns `{ ok: true, outline, top, axes, depth: { base, top } }` or
 *          `{ ok: false, reason: "behind-camera", behind }`.
 */
export function poseShapes(K, pose, width, height) {
    const { R, t } = pose;
    const h = TOWARD_CAMERA * BOX_HEIGHT_FRACTION * width;
    const L = AXIS_FRACTION * width;
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const corners = [
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1],
    ];
    const shapes = {
        outline: corners.map(([x, y]) => projectPoint(K, R, t, [x, y, 0])),
        top: corners.map(([x, y]) => projectPoint(K, R, t, [x, y, h])),
        axes: [
            [cx, cy, 0],
            [cx + L, cy, 0],
            [cx, cy + L, 0],
            [cx, cy, TOWARD_CAMERA * L],
        ].map((p) => projectPoint(K, R, t, p)),
    };
    const behind = Object.keys(shapes).filter((k) => shapes[k].some((p) => !p.ok));
    if (behind.length > 0) return { ok: false, reason: "behind-camera", behind };
    const [origin, x, y, z] = shapes.axes.map((p) => p.point);
    return {
        ok: true,
        outline: shapes.outline.map((p) => p.point),
        top: shapes.top.map((p) => p.point),
        axes: { origin, x, y, z },
        depth: {
            base: shapes.outline.map((p) => p.depth),
            top: shapes.top.map((p) => p.depth),
        },
    };
}

/**
 * The angle of the rotation between `Ra` and `Rb`, in degrees:
 * `acos((trace(Raᵀ · Rb) − 1) / 2)`, the cosine clamped to `[−1, 1]`. A
 * display on the page, not a metric.
 */
export function rotationAngleDeg(Ra, Rb) {
    let trace = 0;
    for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) trace += Ra[3 * k + i] * Rb[3 * k + i];
    }
    const c = Math.min(1, Math.max(-1, (trace - 1) / 2));
    return (Math.acos(c) * 180) / Math.PI;
}
