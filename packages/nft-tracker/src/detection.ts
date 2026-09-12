/*
 *  detection.ts
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
 * Matching a query frame against a multi-scale target, one pyramid level at a
 * time.
 *
 * Why not one `match()` call against every level pooled together: Lowe's ratio
 * test assumes the second-nearest neighbour is a WRONG match, but a pooled
 * multi-scale set holds the same physical feature at several levels, so the
 * two best candidates are often both correct, the ratio approaches 1, and the
 * test throws them away. Measured on the demo images: matching per level found
 * roughly 2.5x the matches of pooling everything into one call, at the same
 * ratio threshold (see `examples/README.md`).
 *
 * This logic began in `examples/js/pinball-shared.mjs`, where it had to build
 * a per-level index list and copy each level's descriptor rows into a fresh
 * buffer, because a `Keypoint[]` plus a flat `Descriptors` is all the contract
 * hands back. A `TargetDb`'s rows are already grouped by level, so here a
 * level is a `subarray` view and nothing is copied (target format §5.6).
 */

import type {
    CvBackend,
    DescriptorKind,
    DescriptorNorm,
    Descriptors,
    Match,
} from "@webarkit/cv-backend-spec";
import type { BitsDescriptorSet, TargetDb } from "./target/types.js";

/**
 * A `BitsDescriptorSet` whose `kind` and `norm` a backend has accepted.
 *
 * `DescriptorSet` types those two as open unions, because the file format has
 * to keep a family the reader does not know (§5.6); the contract's
 * `Descriptors` types them as closed unions. {@link chooseDescriptorSet} is
 * the one place that check happens, so it is the one place the narrowing is
 * justified — everything downstream takes this type and needs no cast.
 */
export type UsableDescriptorSet = BitsDescriptorSet & {
    readonly kind: DescriptorKind;
    readonly norm: DescriptorNorm;
};

/** One pyramid level of a target, ready to pass to `match()` as a train set. */
export interface TargetLevelView {
    /** Pyramid level this view covers. */
    readonly level: number;
    /** This level's rows, as a view over the set's own bytes. */
    readonly descriptors: Descriptors;
    /** This level's `kpIndex` rows: `kpIndex[i]` is row `i`'s keypoint. */
    readonly kpIndex: Uint32Array;
}

/**
 * Picks the first descriptor set this backend can consume (§6.3).
 *
 * Usable means all three of: `elementType` is `"bits"` — the contract's
 * `Descriptors.data` is a `Uint8Array`, so nothing else fits through it at
 * all; `norm` is `"hamming"`; and `kind` is one the backend declares, since
 * `match` rejects a set whose family it did not compute.
 *
 * First-usable, not best-usable: §6.3's full preference ordering belongs with
 * the codec, and a target built by {@link buildTargetFromImage} carries
 * exactly one set. Throwing rather than returning `null` is deliberate — a
 * target whose descriptors this backend cannot read is a mismatch between
 * target and backend, not a frame that failed to track.
 */
export function chooseDescriptorSet(cv: CvBackend, target: TargetDb): UsableDescriptorSet {
    const supported: readonly string[] = cv.capabilities.descriptors;
    for (const set of target.descriptorSets) {
        if (set.elementType !== "bits") continue;
        if (set.norm !== "hamming") continue;
        if (!supported.includes(set.kind)) continue;
        return set as UsableDescriptorSet;
    }
    const offered = target.descriptorSets
        .map((s) => `${s.kind}/${s.norm}/${s.elementType}`)
        .join(", ");
    throw new Error(
        `@webarkit/nft-tracker: no descriptor set in this target is usable by backend ` +
            `'${cv.capabilities.name}'. The target offers [${offered}]; the backend reads ` +
            `binary hamming sets of kind [${supported.join(", ")}].`
    );
}

/**
 * One view per pyramid level, over the set's own bytes.
 *
 * Levels holding fewer than two rows are left out: `match` runs a k=2 ratio
 * test, which has no runner-up to compare against in a one-row train set. The
 * demo this came from did the same, and for the same reason.
 */
export function buildLevelIndex(set: UsableDescriptorSet): TargetLevelView[] {
    const bpd = set.bytesPerDescriptor;
    const levels: TargetLevelView[] = [];
    for (let level = 0; level + 1 < set.levelStart.length; level++) {
        const start = set.levelStart[level];
        const end = set.levelStart[level + 1];
        if (end - start < 2) continue;
        levels.push({
            level,
            descriptors: {
                data: set.data.subarray(start * bpd, end * bpd),
                count: end - start,
                bytesPerDescriptor: bpd,
                kind: set.kind,
                norm: set.norm,
            },
            kpIndex: set.kpIndex.subarray(start, end),
        });
    }
    return levels;
}

/**
 * Matches `query` against each level in turn, keeping the best hit per query
 * keypoint.
 *
 * `trainIdx` in the result indexes `target.keypoints`, not a level's rows: the
 * per-level slicing never escapes this function. Ties keep the level seen
 * first — the comparison is strict, and levels come in ascending order.
 */
export function matchPerLevel(
    cv: CvBackend,
    query: Descriptors,
    levels: readonly TargetLevelView[],
    ratio: number
): Match[] {
    const best = new Map<number, Match>();
    for (const { descriptors, kpIndex } of levels) {
        for (const m of cv.match(query, descriptors, { ratio })) {
            const previous = best.get(m.queryIdx);
            if (previous && previous.distance <= m.distance) continue;
            best.set(m.queryIdx, {
                queryIdx: m.queryIdx,
                trainIdx: kpIndex[m.trainIdx],
                distance: m.distance,
            });
        }
    }
    return [...best.values()];
}
