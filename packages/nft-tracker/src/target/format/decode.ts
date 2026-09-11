/*
 *  decode.ts
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
 * `decode`: bytes to a `TargetDb`, running the gates of §6.1 in exactly the
 * order that section fixes.
 *
 * The order is normative, and the comments below name each step so a later
 * reader can see it is preserved. Its purpose is stated in §6.1's preamble: a
 * `.wnft` may come from a URL an application's user chose, so nothing here
 * allocates in proportion to a size before that size has been checked. Every
 * number is validated by the manifest layer first; the arrays are materialised
 * only afterwards.
 *
 * Nothing throws. Every failure is a value (ADR-0001 point 7), which is what
 * lets a caller treat a hostile file as data rather than as an incident.
 */

import type {
    DescriptorSet,
    KeypointTable,
    PatchTable,
    TargetDb,
} from "../types.js";
import { materialise, type AccessorArray } from "./arrays.js";
import {
    checkConsistency,
    type SetArrays,
    type TargetArrays,
} from "./consistency.js";
import { parseContainer } from "./container.js";
import type { DecodeResult, Warning } from "./errors.js";
import { SUPPORTED_FORMAT_VERSION } from "./known.js";
import { resolveLimits, type DecodeOptions } from "./limits.js";
import {
    decodeManifest,
    validateManifest,
    type ManifestSpec,
} from "./manifest.js";

/** Materialise every array a validated manifest references. */
function materialiseAll(
    buffer: ArrayBufferLike,
    binStart: number,
    spec: ManifestSpec,
): TargetArrays {
    const get = (index: number): AccessorArray =>
        materialise(buffer, binStart, spec.accessors[index]!);

    const kp = spec.keypoints;
    const sets: SetArrays[] = spec.descriptorSets.map((s) => ({
        levelStart: get(s.levelStart) as Uint32Array,
        kpIndex: get(s.kpIndex) as Uint32Array,
        data: get(s.data) as Uint8Array | Float32Array,
    }));

    return {
        keypoints: {
            levelStart: get(kp.levelStart) as Uint32Array,
            x: get(kp.x) as Float32Array,
            y: get(kp.y) as Float32Array,
            angle: get(kp.angle) as Float32Array,
            score: get(kp.score) as Float32Array,
            size: kp.size === undefined ? undefined : (get(kp.size) as Float32Array),
            level: get(kp.level) as Uint8Array,
        },
        sets,
        patches:
            spec.patches === undefined
                ? undefined
                : {
                      score: get(spec.patches.score) as Float32Array,
                      left: get(spec.patches.left) as Uint16Array,
                      top: get(spec.patches.top) as Uint16Array,
                      level: get(spec.patches.level) as Uint8Array,
                      pixels: get(spec.patches.pixels) as Uint8Array,
                  },
        referenceImage:
            spec.referenceImage === undefined
                ? undefined
                : { pixels: get(spec.referenceImage.pixels) as Uint8Array },
    };
}

/**
 * Assemble the `TargetDb`.
 *
 * Absent optionals are **omitted**, never set to `undefined`: a decoded target
 * has to be indistinguishable from one built by hand, or §8.2's round trip
 * would depend on which of the two it started from.
 */
function buildTarget(spec: ManifestSpec, arrays: TargetArrays): TargetDb {
    const keypoints: KeypointTable = {
        count: spec.keypoints.count,
        detector: spec.keypoints.detector,
        levelStart: arrays.keypoints.levelStart,
        x: arrays.keypoints.x,
        y: arrays.keypoints.y,
        angle: arrays.keypoints.angle,
        score: arrays.keypoints.score,
        ...(arrays.keypoints.size === undefined
            ? {}
            : { size: arrays.keypoints.size }),
        level: arrays.keypoints.level,
    };

    const descriptorSets: DescriptorSet[] = spec.descriptorSets.map((s, i) => {
        const a = arrays.sets[i]!;
        const shared = {
            kind: s.kind,
            norm: s.norm,
            dimensions: s.dimensions,
            bytesPerDescriptor: s.bytesPerDescriptor,
            producer: s.producer,
            params: s.params,
            count: s.count,
            levelStart: a.levelStart,
            kpIndex: a.kpIndex,
        };
        // The union is discriminated by elementType, and the discriminant is
        // what says which typed array `data` is (§5.6).
        return s.elementType === "f32"
            ? { ...shared, elementType: "f32", data: a.data as Float32Array }
            : { ...shared, elementType: s.elementType, data: a.data as Uint8Array };
    });

    const patches: PatchTable | undefined =
        spec.patches === undefined || arrays.patches === undefined
            ? undefined
            : {
                  patchSize: spec.patches.patchSize,
                  count: spec.patches.count,
                  score: arrays.patches.score,
                  left: arrays.patches.left,
                  top: arrays.patches.top,
                  level: arrays.patches.level,
                  pixels: arrays.patches.pixels,
              };

    return {
        formatVersion: SUPPORTED_FORMAT_VERSION,
        ...(spec.head.generator === undefined
            ? {}
            : { generator: spec.head.generator }),
        extensionsUsed: spec.head.extensionsUsed,
        extensionsRequired: spec.head.extensionsRequired,
        meta: spec.meta,
        pyramid: spec.pyramid,
        keypoints,
        descriptorSets,
        ...(patches === undefined ? {} : { patches }),
        ...(spec.referenceImage === undefined || arrays.referenceImage === undefined
            ? {}
            : {
                  referenceImage: {
                      level: spec.referenceImage.level,
                      width: spec.referenceImage.width,
                      height: spec.referenceImage.height,
                      pixels: arrays.referenceImage.pixels,
                  },
              }),
        ...(spec.info === undefined ? {} : { info: spec.info }),
    };
}

/**
 * Decode a `.wnft` file.
 *
 * `input` may be a bare `ArrayBuffer` or any view of one. The view form is not
 * a convenience: §3 (rev 2) requires it, because a file embedded in a larger
 * buffer can start at an address JavaScript cannot view as a `Uint32Array`,
 * and that is the only way to reach the copy fallback from JavaScript at all.
 *
 * The buffer type is `ArrayBufferLike`, so a `SharedArrayBuffer` is accepted
 * too. Every read below is bounds-checked by the engine either way; a caller
 * sharing a buffer that another thread mutates mid-decode gets incoherent
 * data, which is its own concern and not a memory-safety one.
 */
export function decode(
    input: ArrayBufferLike | ArrayBufferView,
    options?: DecodeOptions,
): DecodeResult {
    const limits = resolveLimits(options);

    const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);

    // Step 0 — file size, before a single byte is read (§6.1 rev 2).
    if (bytes.byteLength > limits.maxFileBytes) {
        return {
            ok: false,
            error: "LIMIT_EXCEEDED",
            detail: `file is ${bytes.byteLength} bytes, limit ${limits.maxFileBytes}`,
        };
    }

    // Steps 1 and 2 — framing, and the checksums of the JSON and BIN chunks.
    const container = parseContainer(bytes);
    if (!container.ok) {
        return { ok: false, error: container.error, detail: container.detail };
    }
    const { json, bin, unknown } = container.value;

    const warnings: Warning[] = unknown.map((c) => ({
        code: "UNKNOWN_CHUNK_SKIPPED" as const,
        detail: `chunk type "${c.type}"`,
    }));

    // Steps 3 to 5 — manifest size, text, format version, extensions.
    const head = decodeManifest(
        bytes.subarray(json.dataStart, json.dataStart + json.length),
        limits,
    );
    if (!head.ok) return { ok: false, error: head.error, detail: head.detail };
    warnings.push(...head.warnings);

    // Step 6 — schema, accessors, resource limits.
    const spec = validateManifest(head.value, bin === null ? null : bin.length, limits);
    if (!spec.ok) return { ok: false, error: spec.error, detail: spec.detail };
    warnings.push(...spec.warnings);

    // Everything the sizes below come from has now been checked, so this is
    // the first allocation proportional to the file's own numbers.
    const binStart = bytes.byteOffset + (bin?.dataStart ?? 0);
    const arrays = materialiseAll(bytes.buffer, binStart, spec.value);

    // Step 7 — data consistency.
    const inconsistent = checkConsistency(spec.value, arrays);
    if (inconsistent !== null) {
        return {
            ok: false,
            error: inconsistent.error,
            detail: inconsistent.detail,
        };
    }

    return { ok: true, target: buildTarget(spec.value, arrays), warnings };
}
