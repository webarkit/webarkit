/*
 *  robust_homography.ts
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

import type { PointArray } from "@webarkit/cv-backend-spec";
import { isFiniteMat3 } from "./mat3.js";
import type { RobustHomography, RobustHomographyOptions, Stub } from "./types.js";

/**
 * Stub — see {@link RobustHomography}. Branch C implements it here and changes
 * the annotation from `Stub<RobustHomography>` to `RobustHomography`; nothing else in the
 * package needs to change.
 */
export const robustHomography: Stub<RobustHomography> = (src, dst, initial, options) => {
    if (!validOptions(options)) return { ok: false, reason: "invalid-options" };
    if (src.length !== dst.length || src.length % 2 !== 0) {
        return { ok: false, reason: "invalid-input" };
    }
    if (!allFinite(src) || !allFinite(dst) || !isFiniteMat3(initial)) {
        return { ok: false, reason: "invalid-input" };
    }
    if (src.length / 2 < 4) return { ok: false, reason: "too-few-points" };
    return { ok: false, reason: "not-implemented" };
};

/**
 * The domains stated on {@link RobustHomographyOptions}, finite included: a
 * cutoff or a tolerance of `Infinity` is not a distance.
 */
function validOptions(o: RobustHomographyOptions): boolean {
    return (
        Number.isInteger(o.maxIterations) &&
        o.maxIterations >= 1 &&
        Number.isFinite(o.tukeyC) &&
        o.tukeyC > 0 &&
        Number.isFinite(o.epsilon) &&
        o.epsilon > 0
    );
}

function allFinite(a: PointArray): boolean {
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
    return true;
}
