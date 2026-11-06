/*
 *  pose_guard.ts
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

/**
 * The guard of #133: the closed form below a tilt threshold, the selection at
 * it and above it. The treatment registered in
 * `docs/benchmarks/2026-11-06-228-133-stage3-registration.md` ("Stage 3, A"),
 * which the tracker's `poseGuard` option reaches, and nothing else does.
 *
 * **The scope, as registered.** The default threshold of 10° was derived from
 * a construction that renders and estimates with the same `K`: the
 * characterisation's table, on `e`. Under a focal-length mismatch the crossover
 * moves, in opposite directions on two readings (#233, question E), and a tilt
 * read through an assumed `K` is not one true tilt. So the threshold is a
 * parameter, no claim is made that 10° suits any real camera, and the guard's
 * adoption, and its threshold for a calibrated camera, wait for #109.
 */

import type { Mat3, Pose } from "@webarkit/cv-backend-spec";
import { closedFormPose } from "./closed_form.js";

/** What the guard read on one frame, and what it did. */
export interface PoseGuardReading {
    /**
     * The tilt, degrees, of the closed form on the frame's own `H`: the angle
     * between the plane's normal and the optical axis, through the tracker's
     * `K`. `null` when the closed form has `good: false`, which has no tilt.
     */
    readonly tiltDeg: number | null;
    /**
     * The guard's own decision on the frame, taken before any filter: the tilt
     * is below the threshold, so the unfiltered pose is the guard's closed
     * form. With the `poseFilter` option on, the result's `pose` is the
     * filter's output on that pose, and this still reads `true`.
     *
     * It is not a report of whether the pose is a closed form. On a frame whose
     * selection had already fallen back to the closed form, it is `true` only
     * when that closed form's tilt is below the threshold, and the two poses
     * are then equal. At the threshold and above it, or with no tilt, it is
     * `false`, and the unfiltered pose is still that closed form, the
     * selection's own.
     */
    readonly guarded: boolean;
}

/** `acos(clamp(R[8], −1, 1))`, degrees. */
export function tiltDegOf(R: Mat3): number {
    return (Math.acos(Math.min(1, Math.max(-1, R[8]))) * 180) / Math.PI;
}

/**
 * The guard on one frame: a function of its arguments, with no state, so the
 * tilt is the frame's own and never a previous frame's. Below `thresholdDeg`,
 * the closed form on `H`; at it and above it, `selected`, the same object, so
 * IPPE is what a tilt of exactly the threshold gets. A closed form with
 * `good: false` has no tilt, and the frame keeps `selected`. Writes to nothing
 * it is given.
 */
export function guardPose(
    H: Mat3,
    K: Mat3,
    selected: Pose,
    thresholdDeg: number,
): { readonly pose: Pose; readonly reading: PoseGuardReading } {
    const closedForm = closedFormPose(H, K);
    if (!closedForm.good) return { pose: selected, reading: { tiltDeg: null, guarded: false } };
    const tiltDeg = tiltDegOf(closedForm.R);
    const guarded = tiltDeg < thresholdDeg;
    return { pose: guarded ? closedForm : selected, reading: { tiltDeg, guarded } };
}
