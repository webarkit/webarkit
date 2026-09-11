/*
 *  encode.ts
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
 * `encode`: the canonical writer of §7.3.
 *
 * The same content always produces the same bytes. Four phases, in this order:
 *
 * 1. **Validate** (`validate-target.ts`), and emit nothing on failure — §7.3
 *    forbids writing a file a conforming reader would reject.
 * 2. **Lay out** the `BIN` chunk: accessors in the order their fields first
 *    appear in the manifest, each starting at a multiple of 8.
 * 3. **Emit** the manifest with the keys in the order this specification lists
 *    them, `descriptorSets` sorted, empty optionals omitted.
 * 4. **Frame** (`container.ts`).
 *
 * The manifest is built by hand rather than with `JSON.stringify`, because key
 * order is part of the output and `JSON.stringify` does not let a caller fix
 * it — and, for `params` and `info`, actively gets it wrong (§7.3).
 */

import type { DescriptorSet, JsonValue, TargetDb } from "../types.js";
import type { AccessorArray } from "./arrays.js";
import {
    canonicalJson,
    compareByCodePoint,
    jsonNumber,
    jsonString,
} from "./canonical-json.js";
import { align8, buildContainer } from "./container.js";
import type { EncodeResult } from "./errors.js";
import type { AccessorType } from "./manifest.js";
import { validateTarget } from "./validate-target.js";

interface PlannedAccessor {
    readonly offset: number;
    readonly count: number;
    readonly type: AccessorType;
    readonly source: AccessorArray;
}

/** Which accessor index each manifest field ends up referencing. */
interface AccessorPlan {
    readonly keypoints: {
        readonly levelStart: number;
        readonly x: number;
        readonly y: number;
        readonly angle: number;
        readonly score: number;
        readonly size: number | undefined;
        readonly level: number;
    };
    readonly sets: readonly {
        readonly levelStart: number;
        readonly kpIndex: number;
        readonly data: number;
    }[];
    readonly patches:
        | {
              readonly score: number;
              readonly left: number;
              readonly top: number;
              readonly level: number;
              readonly pixels: number;
          }
        | undefined;
    readonly referenceImage: { readonly pixels: number } | undefined;
}

interface Layout {
    readonly accessors: readonly PlannedAccessor[];
    /** The BIN chunk's **unpadded** length: `chunk_length` excludes padding. */
    readonly binBytes: number;
    readonly plan: AccessorPlan;
}

function accessorTypeOf(array: AccessorArray): AccessorType {
    if (array instanceof Uint8Array) return "u8";
    if (array instanceof Uint16Array) return "u16";
    if (array instanceof Uint32Array) return "u32";
    return "f32";
}

/**
 * Assign every array an accessor, in the order its field first appears in the
 * manifest, each at a multiple of 8 (§7.3).
 *
 * `buildContainer` adds the chunk padding itself (§4.2), so the length
 * returned here is the unpadded one.
 */
function layOutAccessors(
    target: TargetDb,
    sets: readonly DescriptorSet[],
): Layout {
    const accessors: PlannedAccessor[] = [];
    let cursor = 0;

    const add = (source: AccessorArray): number => {
        const offset = align8(cursor);
        accessors.push({
            offset,
            count: source.length,
            type: accessorTypeOf(source),
            source,
        });
        cursor = offset + source.byteLength;
        return accessors.length - 1;
    };

    const kp = target.keypoints;
    const plan = {
        keypoints: {
            levelStart: add(kp.levelStart),
            x: add(kp.x),
            y: add(kp.y),
            angle: add(kp.angle),
            score: add(kp.score),
            size: kp.size === undefined ? undefined : add(kp.size),
            level: add(kp.level),
        },
        sets: sets.map((s) => ({
            levelStart: add(s.levelStart),
            kpIndex: add(s.kpIndex),
            data: add(s.data),
        })),
        patches:
            target.patches === undefined
                ? undefined
                : {
                      score: add(target.patches.score),
                      left: add(target.patches.left),
                      top: add(target.patches.top),
                      level: add(target.patches.level),
                      pixels: add(target.patches.pixels),
                  },
        referenceImage:
            target.referenceImage === undefined
                ? undefined
                : { pixels: add(target.referenceImage.pixels) },
    };

    return { accessors, binBytes: cursor, plan };
}

/**
 * The `BIN` chunk.
 *
 * Each array is copied as raw bytes. Every platform this format targets is
 * little-endian (§3), so a typed array's own memory is already the
 * little-endian encoding the file requires — no per-element conversion, and
 * none that could disagree with what the reader views back.
 */
function buildBin(
    accessors: readonly PlannedAccessor[],
    binBytes: number,
): Uint8Array {
    const out = new Uint8Array(binBytes);
    for (const a of accessors) {
        const src = new Uint8Array(
            a.source.buffer,
            a.source.byteOffset,
            a.source.byteLength,
        );
        out.set(src, a.offset);
    }
    return out;
}

/** `descriptorSets` sorted by `kind`, `norm`, `dimensions`, `producer` (§7.3). */
function sortSets(sets: readonly DescriptorSet[]): readonly DescriptorSet[] {
    return [...sets].sort(
        (a, b) =>
            compareByCodePoint(a.kind, b.kind) ||
            compareByCodePoint(a.norm, b.norm) ||
            a.dimensions - b.dimensions ||
            compareByCodePoint(a.producer, b.producer),
    );
}

const member = (key: string, value: string): string =>
    `${jsonString(key)}:${value}`;

const object = (members: readonly (string | null)[]): string =>
    `{${members.filter((m): m is string => m !== null).join(",")}}`;

const array = (items: readonly string[]): string => `[${items.join(",")}]`;

/**
 * Free-form content, omitted when empty (§7.3) and otherwise serialised with
 * its keys in code-point order.
 */
const freeForm = (key: string, value: Record<string, JsonValue>): string | null =>
    Object.keys(value).length === 0
        ? null
        : member(key, canonicalJson(value as JsonValue));

function emitManifest(
    target: TargetDb,
    sets: readonly DescriptorSet[],
    layout: Layout,
): string {
    const p = layout.plan;
    const accessors = layout.accessors;

    const sortedNames = (names: readonly string[]): readonly string[] =>
        [...names].sort(compareByCodePoint);

    const levelSizes = array(
        target.pyramid.levelSizes.map((s) =>
            array([jsonNumber(s[0]), jsonNumber(s[1])]),
        ),
    );

    const physicalSizeMm =
        target.meta.physicalSizeMm === null
            ? "null"
            : array([
                  jsonNumber(target.meta.physicalSizeMm[0]),
                  jsonNumber(target.meta.physicalSizeMm[1]),
              ]);

    return object([
        member(
            "format",
            object([
                member("version", jsonString(target.formatVersion)),
                target.generator === undefined
                    ? null
                    : member("generator", jsonString(target.generator)),
            ]),
        ),
        target.extensionsUsed.length === 0
            ? null
            : member(
                  "extensionsUsed",
                  array(sortedNames(target.extensionsUsed).map(jsonString)),
              ),
        target.extensionsRequired.length === 0
            ? null
            : member(
                  "extensionsRequired",
                  array(sortedNames(target.extensionsRequired).map(jsonString)),
              ),
        member(
            "meta",
            object([
                member("widthPx", jsonNumber(target.meta.widthPx)),
                member("heightPx", jsonNumber(target.meta.heightPx)),
                member("physicalSizeMm", physicalSizeMm),
            ]),
        ),
        member(
            "pyramid",
            object([
                member("scaleStep", jsonNumber(target.pyramid.scaleStep)),
                member("levelSizes", levelSizes),
            ]),
        ),
        member(
            "keypoints",
            object([
                member("count", jsonNumber(target.keypoints.count)),
                member(
                    "detector",
                    object([
                        member("kind", jsonString(target.keypoints.detector.kind)),
                        freeForm("params", target.keypoints.detector.params),
                    ]),
                ),
                member("levelStart", jsonNumber(p.keypoints.levelStart)),
                member("x", jsonNumber(p.keypoints.x)),
                member("y", jsonNumber(p.keypoints.y)),
                member("angle", jsonNumber(p.keypoints.angle)),
                member("score", jsonNumber(p.keypoints.score)),
                p.keypoints.size === undefined
                    ? null
                    : member("size", jsonNumber(p.keypoints.size)),
                member("level", jsonNumber(p.keypoints.level)),
            ]),
        ),
        member(
            "descriptorSets",
            array(
                sets.map((s, i) =>
                    object([
                        member("kind", jsonString(s.kind)),
                        member("norm", jsonString(s.norm)),
                        member("elementType", jsonString(s.elementType)),
                        member("dimensions", jsonNumber(s.dimensions)),
                        member(
                            "bytesPerDescriptor",
                            jsonNumber(s.bytesPerDescriptor),
                        ),
                        member("producer", jsonString(s.producer)),
                        freeForm("params", s.params),
                        member("count", jsonNumber(s.count)),
                        member("levelStart", jsonNumber(p.sets[i]!.levelStart)),
                        member("kpIndex", jsonNumber(p.sets[i]!.kpIndex)),
                        member("data", jsonNumber(p.sets[i]!.data)),
                    ]),
                ),
            ),
        ),
        target.patches === undefined || p.patches === undefined
            ? null
            : member(
                  "patches",
                  object([
                      member("patchSize", jsonNumber(target.patches.patchSize)),
                      member("count", jsonNumber(target.patches.count)),
                      member("score", jsonNumber(p.patches.score)),
                      member("left", jsonNumber(p.patches.left)),
                      member("top", jsonNumber(p.patches.top)),
                      member("level", jsonNumber(p.patches.level)),
                      member("pixels", jsonNumber(p.patches.pixels)),
                  ]),
              ),
        target.referenceImage === undefined || p.referenceImage === undefined
            ? null
            : member(
                  "referenceImage",
                  object([
                      member("level", jsonNumber(target.referenceImage.level)),
                      member("width", jsonNumber(target.referenceImage.width)),
                      member("height", jsonNumber(target.referenceImage.height)),
                      member("pixels", jsonNumber(p.referenceImage.pixels)),
                  ]),
              ),
        target.info === undefined
            ? null
            : freeForm("info", target.info as Record<string, JsonValue>),
        member(
            "accessors",
            array(
                accessors.map((a) =>
                    object([
                        member("offset", jsonNumber(a.offset)),
                        member("count", jsonNumber(a.count)),
                        member("type", jsonString(a.type)),
                    ]),
                ),
            ),
        ),
    ]);
}

/**
 * Write a target as a canonical `.wnft` file.
 *
 * Returns `{ ok: false, error: "INVALID_TARGET", detail }` and no bytes for a
 * target a conforming reader would reject, `detail` naming the offending field
 * path (§7.3).
 */
export function encode(target: TargetDb): EncodeResult {
    const invalid = validateTarget(target);
    if (invalid !== null) {
        return { ok: false, error: "INVALID_TARGET", detail: invalid.path };
    }

    const sets = sortSets(target.descriptorSets);
    const layout = layOutAccessors(target, sets);
    const bin = buildBin(layout.accessors, layout.binBytes);
    const manifest = emitManifest(target, sets, layout);

    return {
        ok: true,
        bytes: buildContainer(new TextEncoder().encode(manifest), bin),
    };
}
