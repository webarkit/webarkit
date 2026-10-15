/*
 *  select_pose.ts
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
 * The choice between IPPE's two poses: #105's selection rule, as the
 * maintainer set it on 2026-10-15 and as
 * `docs/benchmarks/2026-10-15-m4-step3-ippe-acceptance.md` (§5) registers it.
 * Per frame, with no memory of earlier frames, deterministic:
 *
 * - (a) a candidate that puts any point of the target's grid behind the
 *   camera (`z ≤ 0`) is rejected;
 * - (b) of the survivors, the one with the lower RMS reprojection error over
 *   the frame's correspondences;
 * - (c) when both survive and their errors are within the margin `m`, the
 *   frame is **ambiguous**: the pose is the frame's own closed-form
 *   decomposition ({@link closedFormPose}, the control's algorithm), and the
 *   caller counts the frame.
 *
 * Why no history: the campaign's jitter is a frame-to-frame quantity whose
 * threshold was calibrated on arms whose pose does not depend on the previous
 * frame; a selector with memory would make a wrong branch self-sustaining
 * and read as lower jitter, and would make the tracker arm differ from the
 * control in two ways at once (the maintainer's ruling, 2026-10-15).
 *
 * The margin `m = σ / √(2n)` is the resolution of an RMS over `n` points with
 * per-axis noise `σ`: `‖r‖²` has mean `2σ²` and variance `4σ⁴`, so the mean
 * of `n` has standard deviation `2σ² / √n` and its square root `σ / √(2n)`.
 * Two RMS figures closer than that are not distinguishable on this data.
 */

import type { Mat3, PointArray, Pose, Vec3 } from "@webarkit/cv-backend-spec";
import { closedFormPose } from "./closed_form.js";
import { ippe } from "./ippe.js";
import type { PoseCandidate } from "./ippe.js";

/**
 * `σ` on a tracking step, frame px: the alignment's accuracy under noise, as
 * `test/tracking/align_patch_accuracy.test.ts` pins it (median error below
 * 0.2 px at σ = 8 grey levels, blur included). An upper bound for the renders
 * and clips the tracker sees. On a detection the caller passes its RANSAC
 * threshold instead: an inlier lies within it of the fit by definition.
 */
export const POSE_AMBIGUITY_SIGMA_TRACK_PX = 0.2;

/** `m = σ / √(2n)`. */
export function ambiguityMargin(sigma: number, n: number): number {
    return sigma / Math.sqrt(2 * n);
}

/** The 5 × 5 grid over `[0, w − 1] × [0, h − 1]`, target level-0 px, `[x0, y0, x1, y1, …]`: the depth rule reads it. */
export function targetGrid(width: number, height: number): Float64Array {
    const out = new Float64Array(50);
    let k = 0;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            out[k++] = ((width - 1) * j) / 4;
            out[k++] = ((height - 1) * i) / 4;
        }
    }
    return out;
}

/** Whether every point of `grid` has `z > 0` under `(R, t)`: rule (a). */
export function inFront(R: Mat3, t: Vec3, grid: PointArray): boolean {
    for (let i = 0; i < grid.length; i += 2) {
        if (!(R[6] * grid[i] + R[7] * grid[i + 1] + t[2] > 0)) return false;
    }
    return true;
}

export type PoseSelectionOutcome =
    /** One candidate chosen by rules (a) and (b). */
    | "selected"
    /** Both candidates survive (a) within `m`: rule (c), the closed form. */
    | "ambiguous"
    /** Both candidates put the plane behind the camera: the closed form. */
    | "no-candidate-in-front"
    /** IPPE found no pose for this `H`: the closed form, whose `good` says whether it did. */
    | "degenerate";

export interface PoseSelection {
    /** The frame's pose: the chosen candidate, or the closed form. */
    readonly pose: Pose;
    /** IPPE's two candidates, `null` when IPPE was degenerate. */
    readonly candidates: readonly [PoseCandidate, PoseCandidate] | null;
    /** Which candidate `pose` is, or `"fallback"` for the closed form. */
    readonly chosen: 0 | 1 | "fallback";
    readonly outcome: PoseSelectionOutcome;
    /** `outcome === "ambiguous"`: what the per-run counter counts. */
    readonly ambiguous: boolean;
    /** `m` for this frame, frame px. */
    readonly margin: number;
    /** Candidates rejected by the depth rule, 0 to 2. */
    readonly rejected: number;
}

/**
 * The frame's pose from `H` under `K`, over the correspondences `src` (target
 * level-0 px) → `dst` (frame px) the frame's estimate used, with the noise
 * `sigma` of those correspondences and the target's `grid` for the depth rule.
 */
export function selectPose(
    H: Mat3,
    K: Mat3,
    src: PointArray,
    dst: PointArray,
    sigma: number,
    grid: PointArray,
): PoseSelection {
    const n = src.length >> 1;
    const margin = ambiguityMargin(sigma, n);
    const r = ippe(H, K, src, dst);
    if (!r.ok) {
        return {
            pose: closedFormPose(H, K),
            candidates: null,
            chosen: "fallback",
            outcome: "degenerate",
            ambiguous: false,
            margin,
            rejected: 0,
        };
    }
    const [c0, c1] = r.candidates;
    const front0 = inFront(c0.R, c0.t, grid);
    const front1 = inFront(c1.R, c1.t, grid);
    const rejected = (front0 ? 0 : 1) + (front1 ? 0 : 1);
    let chosen: 0 | 1 | null = null;
    let outcome: PoseSelectionOutcome;
    if (front0 && front1) {
        if (Math.abs(c0.rms - c1.rms) <= margin) {
            outcome = "ambiguous";
        } else {
            chosen = c0.rms < c1.rms ? 0 : 1;
            outcome = "selected";
        }
    } else if (front0 || front1) {
        chosen = front0 ? 0 : 1;
        outcome = "selected";
    } else {
        outcome = "no-candidate-in-front";
    }
    if (chosen === null) {
        return {
            pose: closedFormPose(H, K),
            candidates: r.candidates,
            chosen: "fallback",
            outcome,
            ambiguous: outcome === "ambiguous",
            margin,
            rejected,
        };
    }
    const c = chosen === 0 ? c0 : c1;
    return {
        pose: { R: c.R, t: c.t, good: true },
        candidates: r.candidates,
        chosen,
        outcome,
        ambiguous: false,
        margin,
        rejected,
    };
}
