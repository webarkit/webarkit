/*
 *  build_from_image.ts
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
 * Builds an in-memory {@link TargetDb} from a single reference image.
 *
 * This is the seed of the target compiler, and for now it does exactly what
 * the demos do by hand: detect over a pyramid, describe, and lay the result
 * out the way `docs/specs/nft-target-format.md` specifies. Synthetic views,
 * tracking patches and a stored reference image belong to milestone M4; none
 * of them is written here, and every field they would fill is optional in the
 * format precisely so this step can leave them out.
 *
 * Nothing here encodes bytes. The `.wnft` codec is a separate component; this
 * produces the decoded shape it would also produce.
 */

import type { CvBackend, Descriptors, GrayImage, Keypoint } from "@webarkit/cv-backend-spec";
import type { BitsDescriptorSet, KeypointTable, TargetDb } from "./types.js";

/**
 * The format version this builder writes into `formatVersion`.
 *
 * Local to this file on purpose: the codec owns version negotiation (§7) and
 * will export its own constant when it lands. Duplicating the string here is
 * cheaper than reaching across into a component that does not exist yet.
 */
const FORMAT_VERSION = "0.2";

/**
 * Size ratio between consecutive pyramid levels when the caller does not say.
 *
 * The cube root of 2, so three levels halve the image — the step
 * `cv-backend-jsfeatnext` uses internally.
 *
 * It has to be a parameter at all because the contract does not carry it: a
 * `Keypoint.level` only means something together with the step that produced
 * it, and that step is each backend's private constant. Passing a target
 * built against one backend's step to a backend with a different one would
 * silently describe at the wrong scale. This default is therefore right for
 * today's only backend and a guess for any other.
 *
 * TODO: replace the default with the backend's declared step once
 * `BackendCapabilities` carries one. Tracked as the "`Keypoint.level` is
 * ambiguous across backends" contract gap in
 * `docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md`.
 */
export const DEFAULT_SCALE_STEP = Math.cbrt(2);

/** Pyramid levels searched on the reference image — the demos' own setting. */
export const DEFAULT_TARGET_LEVELS = 8;

/** Keypoint budget per level, so `maxKeypoints` scales with the pyramid. */
export const DEFAULT_KEYPOINTS_PER_LEVEL = 260;

export interface BuildTargetOptions {
    /** Pyramid levels to search. Default {@link DEFAULT_TARGET_LEVELS}. */
    readonly levels?: number;
    /**
     * Total keypoint budget. Default
     * `levels * DEFAULT_KEYPOINTS_PER_LEVEL`, matching both demos.
     */
    readonly maxKeypoints?: number;
    /** See {@link DEFAULT_SCALE_STEP}. Must be finite and `> 1`. */
    readonly scaleStep?: number;
    /**
     * `[width, height]` in millimetres. `null` (the default) means unknown,
     * and model-plane units stay level-0 pixels (§3).
     */
    readonly physicalSizeMm?: readonly [number, number] | null;
    /** Recorded in `info.name`. Provenance only; nothing reads it. */
    readonly name?: string;
}

export function buildTargetFromImage(
    cv: CvBackend,
    image: GrayImage,
    options?: BuildTargetOptions
): TargetDb {
    const levels = options?.levels ?? DEFAULT_TARGET_LEVELS;
    const maxKeypoints = options?.maxKeypoints ?? levels * DEFAULT_KEYPOINTS_PER_LEVEL;
    const scaleStep = options?.scaleStep ?? DEFAULT_SCALE_STEP;

    if (!Number.isFinite(scaleStep) || scaleStep <= 1) {
        throw new Error(
            `@webarkit/nft-tracker: scaleStep must be finite and > 1, got ${scaleStep}. ` +
                `A step of 1 or less makes the level-to-level-0 mapping of the target ` +
                `format's section 3 a division by zero or an identity.`
        );
    }

    const detected = cv.detect(image, { levels, maxKeypoints });
    if (detected.length === 0) {
        throw new Error(
            `@webarkit/nft-tracker: no keypoints found in a ${image.width}x${image.height} ` +
                `image over ${levels} levels. A target with no features cannot be matched ` +
                `against anything.`
        );
    }

    // detect() fills a maxKeypoints budget round-robin across levels, so its
    // output is interleaved; the format requires ascending level order (5.5).
    // The sort is STABLE (`|| a - b`): it must not reorder within a level, or
    // the per-level match tie-breaks shift against the demo's.
    const order = detected
        .map((_, i) => i)
        .sort((a, b) => detected[a].level - detected[b].level || a - b);
    const sorted = order.map((i) => detected[i]);

    // Described BEFORE the coordinates are narrowed to f32 below: describe()
    // positions its sampling patch from the coordinates it is handed, so
    // rounding first would compute different bits than the pipeline this
    // package replaces.
    const described = cv.describe(image, sorted);

    const levelCount = sorted[sorted.length - 1].level + 1;
    const keypoints = toKeypointTable(cv, sorted, levelCount);
    const descriptorSet = toDescriptorSet(cv, described, keypoints.levelStart);

    return {
        formatVersion: FORMAT_VERSION,
        generator: `@webarkit/nft-tracker buildTargetFromImage (${cv.capabilities.name})`,
        extensionsUsed: [],
        extensionsRequired: [],
        meta: {
            widthPx: image.width,
            heightPx: image.height,
            physicalSizeMm: options?.physicalSizeMm ?? null,
        },
        pyramid: {
            scaleStep,
            levelSizes: levelSizes(image, levelCount, scaleStep),
        },
        keypoints,
        descriptorSets: [descriptorSet],
        // `info.createdAt` is deliberately unset: a clock read would make two
        // builds of the same image differ, and ADR-0001 point 7 requires
        // fixtures to reproduce. A compiler that wants provenance can add it.
        ...(options?.name === undefined ? {} : { info: { name: options.name } }),
    };
}

/**
 * Reconstructs each level's size the way the backend computed it: repeated
 * division by the step, truncated with `| 0` (the format records this
 * rounding as `cv-backend-jsfeatnext`'s, §5.4). Iterated division rather than
 * `Math.pow(step, -l)` because that is literally what the backend does, and
 * the two disagree in the last bits.
 *
 * §5.4 wants the sizes as the producer made them; the contract exposes no
 * pyramid geometry, so this is a reconstruction from the declared step. Same
 * contract gap as {@link DEFAULT_SCALE_STEP}.
 */
function levelSizes(
    image: GrayImage,
    levelCount: number,
    scaleStep: number
): [number, number][] {
    const sizes: [number, number][] = [[image.width, image.height]];
    let scale = 1;
    for (let level = 1; level < levelCount; level++) {
        scale /= scaleStep;
        const width = (image.width * scale) | 0;
        const height = (image.height * scale) | 0;
        if (width < 1 || height < 1) {
            throw new Error(
                `@webarkit/nft-tracker: level ${level} of a ${image.width}x${image.height} ` +
                    `image at scaleStep ${scaleStep} would be ${width}x${height}, but the ` +
                    `target format requires every level size to be at least 1 (section 5.4). ` +
                    `The backend reported a keypoint at this level, so the step is probably ` +
                    `not the one it used.`
            );
        }
        sizes.push([width, height]);
    }
    return sizes;
}

/** Keypoints, level-sorted already, as the format's structure of arrays (§5.5). */
function toKeypointTable(cv: CvBackend, sorted: readonly Keypoint[], levelCount: number): KeypointTable {
    const count = sorted.length;
    const levelStart = new Uint32Array(levelCount + 1);
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const angle = new Float32Array(count);
    const score = new Float32Array(count);
    const level = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const k = sorted[i];
        x[i] = k.x;
        y[i] = k.y;
        angle[i] = k.angle;
        score[i] = k.score;
        level[i] = k.level;
    }

    // One pass over the sorted levels: each boundary is where the level
    // changes, and every level past the last one seen ends at `count`.
    let next = 0;
    for (let l = 0; l <= levelCount; l++) {
        while (next < count && sorted[next].level < l) next++;
        levelStart[l] = next;
    }
    levelStart[levelCount] = count;

    const detector = cv.capabilities.detectors[0];
    if (detector === undefined) {
        throw new Error(
            `@webarkit/nft-tracker: backend '${cv.capabilities.name}' declares no detectors, ` +
                `so there is nothing honest to record in keypoints.detector.kind.`
        );
    }
    // `DetectOptions` carries no detector selector, so the backend ran the one
    // detector it has; its first declared entry is the honest answer. Revisit
    // when the contract lets a caller choose.
    return { count, detector: { kind: detector, params: {} }, levelStart, x, y, angle, score, level };
}

/** The single descriptor set (§5.6). One row per keypoint, in keypoint order. */
function toDescriptorSet(
    cv: CvBackend,
    described: Descriptors,
    levelStart: Uint32Array
): BitsDescriptorSet {
    return {
        kind: described.kind,
        norm: described.norm,
        elementType: "bits",
        dimensions: described.bytesPerDescriptor * 8,
        bytesPerDescriptor: described.bytesPerDescriptor,
        producer: cv.capabilities.name,
        params: {},
        count: described.count,
        // Rows are in the same order as the keypoints, so the keypoints' own
        // level ranges describe them too.
        levelStart,
        // M = N and kpIndex[i] = i: anything else needs WKNF_multiview (§5.6),
        // which arrives with synthetic views in M4.
        kpIndex: Uint32Array.from({ length: described.count }, (_, i) => i),
        // `describe` allocates a fresh buffer per call, so taking it rather
        // than copying is safe and saves N x bytesPerDescriptor.
        data: described.data,
    };
}
