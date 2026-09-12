/*
 *  consistency.ts
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
 * §6.1 step 7: data consistency.
 *
 * The last gate before a `TargetDb` exists, and the only one that reads array
 * *contents*. Everything it needs — that the arrays are the right length, that
 * every number is in its domain — has already been settled by the schema, so
 * these functions are about agreement between fields, not about shape.
 *
 * Two orderings here are normative, not stylistic: a patch's level and a
 * reference image's level are checked to be below `L` **before** either is
 * used to index `levelSizes` (§5.7, §5.8).
 */

import { fail, type Failure } from "./errors.js";
import type { ManifestSpec } from "./manifest.js";

export interface KeypointArrays {
    readonly levelStart: Uint32Array;
    readonly x: Float32Array;
    readonly y: Float32Array;
    readonly angle: Float32Array;
    readonly score: Float32Array;
    readonly size: Float32Array | undefined;
    readonly level: Uint8Array;
}

export interface SetArrays {
    readonly levelStart: Uint32Array;
    readonly kpIndex: Uint32Array;
    readonly data: Uint8Array | Float32Array;
}

export interface PatchArrays {
    readonly score: Float32Array;
    readonly left: Uint16Array;
    readonly top: Uint16Array;
    readonly level: Uint8Array;
    readonly pixels: Uint8Array;
}

export interface ReferenceImageArrays {
    readonly pixels: Uint8Array;
}

/** The materialised arrays, grouped as a `TargetDb` groups them. */
export interface TargetArrays {
    readonly keypoints: KeypointArrays;
    /** One entry per **kept** descriptor set, in `spec.descriptorSets` order. */
    readonly sets: readonly SetArrays[];
    readonly patches: PatchArrays | undefined;
    readonly referenceImage: ReferenceImageArrays | undefined;
}

const inconsistent = (detail: string): Failure => fail("INCONSISTENT_DATA", detail);

/**
 * A `levelStart` array is **closed** when it starts at 0, never decreases and
 * ends at the element count (§5.5 rev 2, §5.6).
 *
 * Its length is `L + 1`, which the schema has already checked, so this only
 * reads contents.
 */
function checkClosedRange(
    levelStart: Uint32Array,
    total: number,
    what: string,
): Failure | null {
    if (levelStart[0] !== 0) {
        return inconsistent(`${what}.levelStart[0] is ${levelStart[0]}, must be 0`);
    }
    for (let l = 1; l < levelStart.length; l += 1) {
        if (levelStart[l]! < levelStart[l - 1]!) {
            return inconsistent(`${what}.levelStart decreases at index ${l}`);
        }
    }
    const last = levelStart[levelStart.length - 1]!;
    if (last !== total) {
        return inconsistent(`${what}.levelStart ends at ${last}, must be ${total}`);
    }
    return null;
}

export function checkConsistency(
    spec: ManifestSpec,
    arrays: TargetArrays,
): Failure | null {
    const levelSizes = spec.pyramid.levelSizes;
    const L = levelSizes.length;
    const N = spec.keypoints.count;
    const kp = arrays.keypoints;

    // --- keypoints (§5.5) -------------------------------------------------
    const kpRange = checkClosedRange(kp.levelStart, N, "keypoints");
    if (kpRange !== null) return kpRange;

    for (let l = 0; l < L; l += 1) {
        const from = kp.levelStart[l]!;
        const to = kp.levelStart[l + 1]!;
        for (let i = from; i < to; i += 1) {
            if (kp.level[i] !== l) {
                return inconsistent(
                    `keypoints.level[${i}] is ${kp.level[i]}, but levelStart puts it on level ${l}`,
                );
            }
        }
    }

    // --- meta against the pyramid (§5.3) ----------------------------------
    const level0 = levelSizes[0]!;
    if (spec.meta.widthPx !== level0[0] || spec.meta.heightPx !== level0[1]) {
        return inconsistent(
            `meta is ${spec.meta.widthPx}x${spec.meta.heightPx}, but levelSizes[0] is ${level0[0]}x${level0[1]}`,
        );
    }

    // --- the pyramid shrinks (§5.4) ---------------------------------------
    for (let l = 0; l + 1 < L; l += 1) {
        const here = levelSizes[l]!;
        const next = levelSizes[l + 1]!;
        if (next[0] > here[0] || next[1] > here[1]) {
            return inconsistent(
                `pyramid.levelSizes grows from level ${l} (${here[0]}x${here[1]}) to ${l + 1} (${next[0]}x${next[1]})`,
            );
        }
    }

    // --- descriptor sets (§5.6) -------------------------------------------
    // The multi-view rule's condition is written out rather than hard-coded,
    // even though IMPLEMENTED_EXTENSIONS is empty today and a required
    // WKNF_multiview was already rejected at step 5. It is the specification's
    // condition, and it goes live unchanged the day the extension lands.
    const multiview = spec.head.extensionsRequired.includes("WKNF_multiview");

    for (let s = 0; s < arrays.sets.length; s += 1) {
        const set = arrays.sets[s]!;
        const M = spec.descriptorSets[s]!.count;
        const what = `descriptorSets[${s}]`;

        const setRange = checkClosedRange(set.levelStart, M, what);
        if (setRange !== null) return setRange;

        if (!multiview && M !== N) {
            return inconsistent(
                `${what} has ${M} rows for ${N} keypoints; M != N needs WKNF_multiview in extensionsRequired (§5.6)`,
            );
        }

        for (let l = 0; l < L; l += 1) {
            const from = set.levelStart[l]!;
            const to = set.levelStart[l + 1]!;
            for (let r = from; r < to; r += 1) {
                const k = set.kpIndex[r]!;
                if (k >= N) {
                    return inconsistent(
                        `${what}.kpIndex[${r}] is ${k}, past the ${N} keypoints`,
                    );
                }
                if (kp.level[k] !== l) {
                    // Without this a row could be matched at one level and
                    // then mapped onto a keypoint from another, silently
                    // corrupting the per-level correspondences (§5.6).
                    return inconsistent(
                        `${what}.kpIndex[${r}] points at keypoint ${k} on level ${kp.level[k]}, but the row is on level ${l}`,
                    );
                }
                if (!multiview && k !== r) {
                    return inconsistent(
                        `${what}.kpIndex[${r}] is ${k}; without WKNF_multiview each row must describe its own keypoint (§5.6)`,
                    );
                }
            }
        }
    }

    // --- patches (§5.7) ---------------------------------------------------
    if (arrays.patches !== undefined && spec.patches !== undefined) {
        const P = spec.patches.patchSize;
        const patches = arrays.patches;
        for (let q = 0; q < spec.patches.count; q += 1) {
            const l = patches.level[q]!;
            // Checked before levelSizes is indexed with it (§5.7).
            if (l >= L) {
                return inconsistent(`patches.level[${q}] is ${l}, past the ${L} levels`);
            }
            const size = levelSizes[l]!;
            if (patches.left[q]! + P > size[0]) {
                return inconsistent(
                    `patch ${q} spans x ${patches.left[q]}..${patches.left[q]! + P}, past level ${l}'s width ${size[0]}`,
                );
            }
            if (patches.top[q]! + P > size[1]) {
                return inconsistent(
                    `patch ${q} spans y ${patches.top[q]}..${patches.top[q]! + P}, past level ${l}'s height ${size[1]}`,
                );
            }
        }
    }

    // --- referenceImage (§5.8) --------------------------------------------
    if (spec.referenceImage !== undefined) {
        const { level, width, height } = spec.referenceImage;
        // Checked before levelSizes is indexed with it (§5.8).
        if (level >= L) {
            return inconsistent(
                `referenceImage.level is ${level}, past the ${L} levels`,
            );
        }
        const size = levelSizes[level]!;
        if (width !== size[0] || height !== size[1]) {
            return inconsistent(
                `referenceImage is ${width}x${height}, but level ${level} is ${size[0]}x${size[1]}`,
            );
        }
    }

    return null;
}
