/*
 *  level_scale.ts
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
 * `s_l`, the scale of pyramid level `l` relative to level 0 (format spec §3):
 * a level-`l` coordinate is `x_l = x0 · s_l`, and a level-0 one is
 * `x0 = x_l / s_l`.
 *
 * Computed by dividing 1 by `scaleStep` `l` times, **not** as
 * `Math.pow(scaleStep, -l)`. The two disagree in the last bits, and the
 * iterated form is the one `build_from_image` records as `levelSizes`
 * (the backend's own `scale /= scaleStep`). Every tracking branch uses this
 * helper rather than its own arithmetic, so patch centres, frame levels and
 * target levels agree exactly.
 *
 * Every tracking function validates its inputs before calling this, and
 * returns an explicit failure for a bad step or level. Reaching an
 * out-of-domain argument here is therefore a contract violation, and throws
 * a `RangeError` rather than returning `NaN`, `0` or a runaway loop into the
 * geometry.
 *
 * @param scaleStep Size ratio between consecutive levels; finite and `> 1`.
 * @param level Pyramid level; an integer in `[0, MAX_LEVEL]`.
 * @returns `s_l`, finite and `> 0`. A step so large that `s_l` underflows to
 *          0 throws, since `x_l / s_l` would then be infinite.
 */
export function levelScale(scaleStep: number, level: number): number {
    if (!(Number.isFinite(scaleStep) && scaleStep > 1)) {
        throw new RangeError(`levelScale: scaleStep must be finite and > 1, got ${scaleStep}`);
    }
    if (!(Number.isInteger(level) && level >= 0 && level <= MAX_LEVEL)) {
        throw new RangeError(
            `levelScale: level must be an integer in [0, ${MAX_LEVEL}], got ${level}`,
        );
    }
    let scale = 1;
    for (let l = 0; l < level; l++) scale /= scaleStep;
    if (!(scale > 0)) {
        throw new RangeError(
            `levelScale: level ${level} of scaleStep ${scaleStep} underflows to 0`,
        );
    }
    return scale;
}

/**
 * The deepest pyramid level: a `.wnft` stores a patch's or keypoint's level
 * as `u8` (§5.5, §5.7), so no level beyond 255 can be named.
 */
export const MAX_LEVEL = 255;
