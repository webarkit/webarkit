/*
 *  validate-target.ts
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
 * §7.3: **the writer MUST NOT emit a file that a conforming reader would
 * reject.**
 *
 * So everything §5 and §6 require of a file is checked against the in-memory
 * target *before* a byte is written, and on failure the writer returns an
 * error instead of emitting anything.
 *
 * The rules below all have a counterpart in `manifest.ts` or `consistency.ts`,
 * and the duplication is deliberate. The reader validates a parsed manifest
 * addressed by accessor indices; the writer validates typed arrays already in
 * memory. A shared abstraction over the two shapes would obscure both. What is
 * shared is the *rule list*, which is why this file is ordered like §5.
 */

import type { JsonValue, TargetDb } from "../types.js";
import {
    hasNoncharacter,
    hasUnpairedSurrogate,
    MAX_EXACT_INTEGER,
} from "./ijson.js";
import {
    IMPLEMENTED_EXTENSIONS,
    KNOWN_ELEMENT_TYPES,
    SUPPORTED_FORMAT_VERSION,
} from "./known.js";

export interface TargetViolation {
    /** The offending field path, e.g. `descriptorSets[1].params.seed` (§7.3). */
    readonly path: string;
}

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

const isU32 = (v: number): boolean =>
    Number.isInteger(v) && v >= 0 && v <= U32_MAX;

/**
 * The four I-JSON checks that survive into memory, applied to `params` and
 * `info` (§7.3, §8.2 item 7).
 *
 * Check (a), key uniqueness, has no counterpart here: an in-memory object
 * cannot hold a duplicate member name, which is precisely why §5 scopes that
 * one to construction.
 *
 * `NaN` is rejected for the reason §7.3 spells out: `JSON.stringify` turns it
 * into `null`, so a target carrying one would encode to a file that decodes
 * cleanly with the value silently changed.
 *
 * Returns the path of the first offending value, or `null`.
 */
function checkFreeForm(value: JsonValue, path: string): string | null {
    if (typeof value === "number") {
        // (d), and the NaN rule.
        if (!Number.isFinite(value)) return path;
        // (c). An integer-valued double serialises as an integer literal, and
        // outside this range two implementations would not read it back the
        // same way — so a reader would reject the file.
        if (Number.isInteger(value) && Math.abs(value) > MAX_EXACT_INTEGER) {
            return path;
        }
        return null;
    }
    if (typeof value === "string") {
        // (b) and (e).
        return hasUnpairedSurrogate(value) || hasNoncharacter(value) ? path : null;
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            const bad = checkFreeForm(value[i]!, `${path}[${i}]`);
            if (bad !== null) return bad;
        }
        return null;
    }
    if (typeof value === "object" && value !== null) {
        const object = value as { readonly [key: string]: JsonValue };
        for (const key of Object.keys(object)) {
            // Member names are strings too, and (e) covers them explicitly.
            if (hasUnpairedSurrogate(key) || hasNoncharacter(key)) {
                return `${path}.${key}`;
            }
            const bad = checkFreeForm(object[key]!, `${path}.${key}`);
            if (bad !== null) return bad;
        }
        return null;
    }
    return null; // boolean, null
}

/**
 * Check a target against every rule a reader applies.
 *
 * `null` means `encode` may proceed; otherwise the path §7.3 puts in `detail`.
 */
export function validateTarget(target: TargetDb): TargetViolation | null {
    const at = (path: string): TargetViolation => ({ path });

    // --- version and extensions (§5.1, §7.1) ------------------------------
    if (target.formatVersion !== SUPPORTED_FORMAT_VERSION) {
        return at("formatVersion");
    }
    for (const name of target.extensionsRequired) {
        if (!target.extensionsUsed.includes(name)) return at("extensionsRequired");
        if (!IMPLEMENTED_EXTENSIONS.includes(name)) return at("extensionsRequired");
    }
    for (const name of target.extensionsUsed) {
        // A decoded target has already had unimplemented names pruned (§7.3);
        // one built by hand must not reintroduce them, since this writer
        // cannot produce the payload they promise.
        if (!IMPLEMENTED_EXTENSIONS.includes(name)) return at("extensionsUsed");
    }

    // --- pyramid (§5.4) ---------------------------------------------------
    const levelSizes = target.pyramid.levelSizes;
    const L = levelSizes.length;
    if (L === 0) return at("pyramid.levelSizes");
    for (let l = 0; l < L; l += 1) {
        const [w, h] = levelSizes[l]!;
        if (!Number.isInteger(w) || w < 1 || w > U16_MAX) {
            return at(`pyramid.levelSizes[${l}][0]`);
        }
        if (!Number.isInteger(h) || h < 1 || h > U16_MAX) {
            return at(`pyramid.levelSizes[${l}][1]`);
        }
        if (l > 0) {
            const previous = levelSizes[l - 1]!;
            if (w > previous[0]) return at(`pyramid.levelSizes[${l}][0]`);
            if (h > previous[1]) return at(`pyramid.levelSizes[${l}][1]`);
        }
    }
    if (!Number.isFinite(target.pyramid.scaleStep) || target.pyramid.scaleStep <= 1) {
        return at("pyramid.scaleStep");
    }

    // --- meta (§5.3) ------------------------------------------------------
    const level0 = levelSizes[0]!;
    if (target.meta.widthPx !== level0[0]) return at("meta.widthPx");
    if (target.meta.heightPx !== level0[1]) return at("meta.heightPx");
    const sizeMm = target.meta.physicalSizeMm;
    if (sizeMm !== null) {
        if (!Number.isFinite(sizeMm[0]) || sizeMm[0] <= 0) {
            return at("meta.physicalSizeMm[0]");
        }
        if (!Number.isFinite(sizeMm[1]) || sizeMm[1] <= 0) {
            return at("meta.physicalSizeMm[1]");
        }
    }

    // --- keypoints (§5.5) -------------------------------------------------
    const kp = target.keypoints;
    const N = kp.count;
    if (!isU32(N)) return at("keypoints.count");
    if (kp.levelStart.length !== L + 1) return at("keypoints.levelStart");
    for (const [name, array] of [
        ["x", kp.x],
        ["y", kp.y],
        ["angle", kp.angle],
        ["score", kp.score],
        ["level", kp.level],
    ] as const) {
        if (array.length !== N) return at(`keypoints.${name}`);
    }
    if (kp.size !== undefined && kp.size.length !== N) return at("keypoints.size");
    if (typeof kp.detector.kind !== "string" || kp.detector.kind.length === 0) {
        return at("keypoints.detector.kind");
    }
    if (kp.levelStart[0] !== 0) return at("keypoints.levelStart");
    for (let l = 1; l < kp.levelStart.length; l += 1) {
        if (kp.levelStart[l]! < kp.levelStart[l - 1]!) return at("keypoints.levelStart");
    }
    if (kp.levelStart[L] !== N) return at("keypoints.levelStart");
    for (let l = 0; l < L; l += 1) {
        for (let i = kp.levelStart[l]!; i < kp.levelStart[l + 1]!; i += 1) {
            if (kp.level[i] !== l) return at("keypoints.level");
        }
    }
    const detectorParams = checkFreeForm(
        kp.detector.params as JsonValue,
        "keypoints.detector.params",
    );
    if (detectorParams !== null) return at(detectorParams);

    // --- descriptorSets (§5.6) --------------------------------------------
    if (target.descriptorSets.length === 0) return at("descriptorSets");
    const multiview = target.extensionsRequired.includes("WKNF_multiview");
    const seenKeys = new Set<string>();

    for (let s = 0; s < target.descriptorSets.length; s += 1) {
        const set = target.descriptorSets[s]!;
        const what = `descriptorSets[${s}]`;
        if (!(KNOWN_ELEMENT_TYPES as readonly string[]).includes(set.elementType)) {
            return at(`${what}.elementType`);
        }
        if (!isU32(set.dimensions) || set.dimensions < 1) {
            return at(`${what}.dimensions`);
        }
        const expectedBytes =
            set.elementType === "bits"
                ? set.dimensions % 8 === 0
                    ? set.dimensions / 8
                    : -1
                : set.elementType === "u8"
                  ? set.dimensions
                  : 4 * set.dimensions;
        if (set.bytesPerDescriptor !== expectedBytes) {
            return at(`${what}.bytesPerDescriptor`);
        }
        if (typeof set.producer !== "string") return at(`${what}.producer`);

        const M = set.count;
        if (!isU32(M)) return at(`${what}.count`);
        if (set.levelStart.length !== L + 1) return at(`${what}.levelStart`);
        if (set.kpIndex.length !== M) return at(`${what}.kpIndex`);
        const expectedData =
            set.elementType === "f32" ? M * set.dimensions : M * set.bytesPerDescriptor;
        if (set.data.length !== expectedData) return at(`${what}.data`);

        if (set.levelStart[0] !== 0) return at(`${what}.levelStart`);
        for (let l = 1; l < set.levelStart.length; l += 1) {
            if (set.levelStart[l]! < set.levelStart[l - 1]!) {
                return at(`${what}.levelStart`);
            }
        }
        if (set.levelStart[L] !== M) return at(`${what}.levelStart`);
        if (!multiview && M !== N) return at(`${what}.count`);

        for (let l = 0; l < L; l += 1) {
            for (let r = set.levelStart[l]!; r < set.levelStart[l + 1]!; r += 1) {
                const k = set.kpIndex[r]!;
                if (k >= N) return at(`${what}.kpIndex`);
                if (kp.level[k] !== l) return at(`${what}.kpIndex`);
                if (!multiview && k !== r) return at(`${what}.kpIndex`);
            }
        }

        const key = `${set.kind} ${set.norm} ${set.dimensions} ${set.producer}`;
        if (seenKeys.has(key)) return at(what);
        seenKeys.add(key);

        const params = checkFreeForm(set.params as JsonValue, `${what}.params`);
        if (params !== null) return at(params);
    }

    // --- patches (§5.7) ---------------------------------------------------
    const patches = target.patches;
    if (patches !== undefined) {
        const P = patches.patchSize;
        const Q = patches.count;
        if (!isU32(P) || P < 1) return at("patches.patchSize");
        if (!isU32(Q)) return at("patches.count");
        for (const [name, array] of [
            ["score", patches.score],
            ["left", patches.left],
            ["top", patches.top],
            ["level", patches.level],
        ] as const) {
            if (array.length !== Q) return at(`patches.${name}`);
        }
        if (patches.pixels.length !== Q * P * P) return at("patches.pixels");
        for (let q = 0; q < Q; q += 1) {
            const l = patches.level[q]!;
            // Checked before levelSizes is indexed with it (§5.7).
            if (l >= L) return at("patches.level");
            const size = levelSizes[l]!;
            if (patches.left[q]! + P > size[0]) return at("patches.left");
            if (patches.top[q]! + P > size[1]) return at("patches.top");
        }
    }

    // --- referenceImage (§5.8) --------------------------------------------
    const image = target.referenceImage;
    if (image !== undefined) {
        // Checked before levelSizes is indexed with it (§5.8).
        if (!isU32(image.level) || image.level >= L) return at("referenceImage.level");
        const size = levelSizes[image.level]!;
        if (image.width !== size[0]) return at("referenceImage.width");
        if (image.height !== size[1]) return at("referenceImage.height");
        if (image.pixels.length !== image.width * image.height) {
            return at("referenceImage.pixels");
        }
    }

    // --- info (§5.9) ------------------------------------------------------
    if (target.info !== undefined) {
        const info = checkFreeForm(target.info as unknown as JsonValue, "info");
        if (info !== null) return at(info);
    }

    return null;
}
