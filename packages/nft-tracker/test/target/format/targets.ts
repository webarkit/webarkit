/*
 *  targets.ts
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
 * In-memory targets for the writer's suites.
 *
 * One valid target, and one helper that plants a single value inside a
 * descriptor set's `params` — which is where §8.2 item 7 lives: the writer has
 * to reject exactly what a reader would, and `params` is the one place a
 * target can legally carry anything.
 */

import type { BitsDescriptorSet, JsonValue, TargetDb } from "../../../src/index.js";

/**
 * The target's single descriptor set, typed as the concrete variant rather
 * than as the union.
 *
 * A test that spreads a `DescriptorSet` and overrides `data` produces an
 * object whose `elementType` is still the whole union, which assigns to no
 * single variant. Spreading this instead keeps the discriminant narrow, and
 * says what the set actually is.
 */
export const goodBitsSet = (): BitsDescriptorSet => ({
    kind: "orb",
    norm: "hamming",
    elementType: "bits",
    dimensions: 32,
    bytesPerDescriptor: 4,
    producer: "jsfeatnext",
    params: {},
    count: 1,
    levelStart: new Uint32Array([0, 1]),
    kpIndex: new Uint32Array([0]),
    data: new Uint8Array([1, 2, 3, 4]),
});

/** L = 1, N = 1, one `orb` set of one row. The smallest legal target. */
export const good = (): TargetDb => ({
    formatVersion: "0.2",
    extensionsUsed: [],
    extensionsRequired: [],
    meta: { widthPx: 8, heightPx: 4, physicalSizeMm: null },
    pyramid: { scaleStep: 2, levelSizes: [[8, 4]] },
    keypoints: {
        count: 1,
        detector: { kind: "fast", params: {} },
        levelStart: new Uint32Array([0, 1]),
        x: new Float32Array([3]),
        y: new Float32Array([4]),
        angle: new Float32Array([0]),
        score: new Float32Array([1]),
        level: new Uint8Array([0]),
    },
    descriptorSets: [goodBitsSet()],
});

/** {@link good}, with one value planted at `descriptorSets[0].params.seed`. */
export const withParam = (value: JsonValue): TargetDb => {
    return {
        ...good(),
        descriptorSets: [{ ...goodBitsSet(), params: { seed: value } }],
    };
};
