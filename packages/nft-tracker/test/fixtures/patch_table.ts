/*
 *  patch_table.ts
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
 * Patch tables for the alignment tests, cut from a pyramid the way §5.7
 * defines a patch: `P × P` pixels copied verbatim from one level, at integer
 * level coordinates `(left, top)`.
 *
 * Test infrastructure, not patch selection: which sites to cut is the test's
 * choice, stated where it is made.
 */

import { levelScale } from "../../src/index.js";
import type { ImagePyramid, PatchTable } from "../../src/index.js";

export interface PatchSite {
    readonly level: number;
    /** Level coordinates of the top-left pixel, as `PatchTable.left`/`top`. */
    readonly left: number;
    readonly top: number;
}

/** A `PatchTable` of `sites`, in order, with `P × P` pixels each. Scores are 0. */
export function cutPatches(
    pyramid: ImagePyramid,
    P: number,
    sites: readonly PatchSite[],
): PatchTable {
    const Q = sites.length;
    const pixels = new Uint8Array(Q * P * P);
    sites.forEach((site, q) => {
        const img = pyramid.levels[site.level];
        if (
            img === undefined ||
            site.left < 0 ||
            site.top < 0 ||
            site.left + P > img.width ||
            site.top + P > img.height
        ) {
            throw new Error(`cutPatches: site ${JSON.stringify(site)} is outside its level`);
        }
        for (let i = 0; i < P; i++) {
            for (let j = 0; j < P; j++) {
                pixels[q * P * P + i * P + j] = img.data[(site.top + i) * img.width + site.left + j];
            }
        }
    });
    return {
        patchSize: P,
        count: Q,
        score: new Float32Array(Q),
        left: Uint16Array.from(sites, (s) => s.left),
        top: Uint16Array.from(sites, (s) => s.top),
        level: Uint8Array.from(sites, (s) => s.level),
        pixels,
    };
}

/**
 * The patch centre in TARGET level-0 coordinates, exactly as types.ts defines
 * the correspondence's target-side point.
 */
export function patchCentre(site: PatchSite, P: number, scaleStep: number): [number, number] {
    const s = levelScale(scaleStep, site.level);
    return [(site.left + (P - 1) / 2) / s, (site.top + (P - 1) / 2) / s];
}

export interface SiteOptions {
    /** Minimum distance between two chosen patch centres, level px. */
    readonly minSpacing: number;
    /** Minimum distance from a window to the level's edge, level px. */
    readonly margin: number;
    /** Candidate grid step, level px. Default 2. */
    readonly stride?: number;
}

/**
 * Up to `count` sites on one level whose `P × P` window is well textured,
 * for tests that need patches worth aligning.
 *
 * Candidates on a `stride` grid are ranked by the smallest eigenvalue of the
 * window's gradient structure tensor (central differences, which read one
 * pixel past the window — the level has it), then taken greedily, skipping
 * any closer than `minSpacing` to one already taken. Ties rank by
 * `(top, left)`, so the choice is deterministic.
 */
export function texturedSites(
    pyramid: ImagePyramid,
    P: number,
    level: number,
    count: number,
    options: SiteOptions,
): PatchSite[] {
    const img = pyramid.levels[level];
    const { width, height, data } = img;
    const stride = options.stride ?? 2;
    const lo = Math.max(1, options.margin);
    const candidates: { left: number; top: number; score: number }[] = [];
    for (let top = lo; top + P + lo <= height; top += stride) {
        for (let left = lo; left + P + lo <= width; left += stride) {
            let xx = 0;
            let xy = 0;
            let yy = 0;
            for (let i = 0; i < P; i++) {
                for (let j = 0; j < P; j++) {
                    const k = (top + i) * width + left + j;
                    const gx = (data[k + 1] - data[k - 1]) / 2;
                    const gy = (data[k + width] - data[k - width]) / 2;
                    xx += gx * gx;
                    xy += gx * gy;
                    yy += gy * gy;
                }
            }
            const mean = (xx + yy) / 2;
            const d = (xx - yy) / 2;
            candidates.push({ left, top, score: mean - Math.sqrt(d * d + xy * xy) });
        }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left);
    const chosen: PatchSite[] = [];
    for (const c of candidates) {
        if (chosen.length === count) break;
        const far = chosen.every(
            (s) => Math.hypot(s.left - c.left, s.top - c.top) >= options.minSpacing,
        );
        if (far) chosen.push({ level, left: c.left, top: c.top });
    }
    return chosen;
}
