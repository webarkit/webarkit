/*
 *  predict_homography.ts
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

import type { Mat3 } from "@webarkit/cv-backend-spec";
import { adjugate3, mul3, scaledToUnitMax } from "./mat3.js";
import type { PredictHomography } from "./types.js";

/**
 * Constant-velocity prediction of the next frame's H — see
 * {@link PredictHomography} for the contract.
 *
 * **What "velocity" is for a homography.** The motion between the last two
 * frames as a homography of its own, `V = current · previous⁻¹` (frame t−1 →
 * frame t), and the prediction applies it once more: `V · current`. Velocity
 * lives in the group of homographies, composed by multiplication, rather than
 * in the nine entries, because:
 *
 * - **It does not depend on the arbitrary scale of a homography.** `λH` is the
 *   same homography as `H`. Scaling `previous` by `β` and `current` by `α`
 *   scales `V · current` by `α²/β`, which the rescale to `H[8] = 1` removes.
 *   The additive extrapolation `2·current − previous` changes with `α/β`, so
 *   it would predict a different pose for the same two poses.
 * - **It is exact for the motion a hand-held camera makes most: rotating
 *   about its own centre.** A camera rotation `R` per frame moves every image
 *   point by the same homography `K R K⁻¹`, whatever the scene, so `V` is
 *   constant and `V · current` is the next pose exactly. The additive form
 *   adds a spurious zoom of order `θ²` to every rotation by `θ` it predicts.
 * - **It is the constant-velocity model of a Lie group, without the
 *   logarithm.** For steps of one frame, `exp(ξ) · current` with
 *   `exp(ξ) = V` is `V · current`. `log`/`exp` would only be needed to scale
 *   the velocity by a ratio of frame intervals, which this model, being
 *   frame-indexed, does not do (see {@link PredictHomography}).
 *
 * Measuring the velocity on the target side instead, `U = previous⁻¹ ·
 * current`, predicts the same thing: `current · U` and `V · current` are both
 * `current · previous⁻¹ · current`.
 *
 * `previous⁻¹` is computed as the adjugate: the two differ only by the scalar
 * `det(previous)`, which the final rescale removes. Both inputs are first
 * rescaled to unit max-norm, since the contract accepts them at any scale and
 * a triple product of homographies at `1e200` would overflow.
 */
export const predictHomography: PredictHomography = (previous, current) => {
    if (previous === null) return { ok: true, H: scaledToUnitCorner(current) };
    const cur = scaledToUnitMax(current);
    const velocity = mul3(cur, adjugate3(scaledToUnitMax(previous)));
    return { ok: true, H: scaledToUnitCorner(mul3(velocity, cur)) };
};

/** A new array: `m` scaled so that `m[8] = 1`. */
function scaledToUnitCorner(m: Mat3): Mat3 {
    const out = new Float64Array(9);
    for (let i = 0; i < 9; i++) out[i] = m[i] / m[8];
    return out;
}
