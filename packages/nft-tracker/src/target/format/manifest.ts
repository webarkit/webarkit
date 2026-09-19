/*
 *  manifest.ts
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
 * The manifest: bytes in, a validated description out.
 *
 * Two halves, matching §6.1. {@link decodeManifest} is steps 3 to 5 — getting
 * a JSON value at all from untrusted bytes, then the version and extension
 * gates. {@link validateManifest} is step 6 — the schema, the accessors and
 * the resource limits.
 *
 * Neither materialises an array. That is deliberate and is the whole point of
 * the ordering: §6.1 requires a reader never to allocate in proportion to a
 * size before that size has been checked, so the numbers are all validated
 * here and the allocation happens afterwards, in `arrays.ts`.
 */

import type { Params, TargetInfo } from "../types.js";
import { fail, type Failure, type Warning } from "./errors.js";
import { scanIJson } from "./ijson.js";
import {
    IMPLEMENTED_EXTENSIONS,
    KNOWN_DESCRIPTOR_KINDS,
    KNOWN_DESCRIPTOR_NORMS,
    KNOWN_ELEMENT_TYPES,
    SUPPORTED_FORMAT_VERSION,
} from "./known.js";
import type { DecodeLimits } from "./limits.js";

/**
 * The manifest, parsed and past the gates of §6.1 steps 3 to 5, but not yet
 * schema-checked: `doc` is still `unknown` field by field.
 */
export interface ManifestHead {
    readonly doc: Record<string, unknown>;
    readonly generator: string | undefined;
    /**
     * Already pruned to what this build implements (§7.3), so re-encoding
     * never advertises a payload that decoding threw away.
     */
    readonly extensionsUsed: readonly string[];
    readonly extensionsRequired: readonly string[];
}

export type ManifestResult =
    | {
          readonly ok: true;
          readonly value: ManifestHead;
          readonly warnings: readonly Warning[];
      }
    | ({ readonly ok: false } & Failure);

export const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * §6.1 steps 3 to 5, in that order: the size gate before any decoding, then
 * strict UTF-8, the I-JSON scan on the text, `JSON.parse` inside
 * `try`/`catch`, then the format version and the required extensions.
 *
 * The scan runs before the parse because two of its five checks cannot run
 * after it (§5). The parse is still guarded: this reader does not promise to
 * agree with `JSON.parse` on every malformed input, and pathological nesting
 * can raise a `RangeError` that step 4 makes `BAD_MANIFEST`.
 */
export function decodeManifest(
    bytes: Uint8Array,
    limits: DecodeLimits,
): ManifestResult {
    const no = (error: Parameters<typeof fail>[0], detail: string): ManifestResult => ({
        ok: false,
        ...fail(error, detail),
    });

    // Step 3 — size, before the manifest is decoded at all.
    if (bytes.length > limits.maxManifestBytes) {
        return no(
            "MANIFEST_TOO_LARGE",
            `JSON chunk is ${bytes.length} bytes, limit ${limits.maxManifestBytes}`,
        );
    }

    // Step 4 — strict UTF-8, the I-JSON checks on the text, then the parse.
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
        return no("BAD_MANIFEST", "the JSON chunk is not strict UTF-8");
    }
    const violation = scanIJson(text);
    if (violation !== null) {
        return no("BAD_MANIFEST", `${violation.path}: ${violation.reason}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return no("BAD_MANIFEST", `JSON.parse failed: ${String(e)}`);
    }
    if (!isObject(parsed)) {
        return no("BAD_MANIFEST", "the manifest's top level must be an object");
    }

    // Step 5 — format version, then extensions.
    const format = parsed["format"];
    if (!isObject(format)) return no("BAD_MANIFEST", "format must be an object");
    const version = format["version"];
    if (typeof version !== "string") {
        return no("BAD_MANIFEST", "format.version must be a string");
    }
    if (version !== SUPPORTED_FORMAT_VERSION) {
        // While the major is 0 only the exact minor is accepted (§7.1): each
        // minor may break the one before, so a reader that accepted a later
        // one would silently misread it.
        return no(
            "UNSUPPORTED_FORMAT_VERSION",
            `format.version "${version}" is not "${SUPPORTED_FORMAT_VERSION}"`,
        );
    }
    const generator = format["generator"];
    if (generator !== undefined && typeof generator !== "string") {
        return no("BAD_MANIFEST", "format.generator must be a string when present");
    }

    const used = parsed["extensionsUsed"] ?? [];
    const required = parsed["extensionsRequired"] ?? [];
    if (!isStringArray(used)) {
        return no("BAD_MANIFEST", "extensionsUsed must be an array of strings");
    }
    if (!isStringArray(required)) {
        return no("BAD_MANIFEST", "extensionsRequired must be an array of strings");
    }
    for (const name of required) {
        if (!used.includes(name)) {
            return no(
                "BAD_MANIFEST",
                `extensionsRequired lists "${name}", which extensionsUsed does not (§5.1)`,
            );
        }
    }
    for (const name of required) {
        if (!IMPLEMENTED_EXTENSIONS.includes(name)) {
            return no(
                "UNSUPPORTED_EXTENSION",
                `extensionsRequired lists "${name}", which this reader does not implement`,
            );
        }
    }

    // §7.3: an unknown non-required extension is ignored, and its name is
    // pruned from extensionsUsed, so re-encoding does not advertise a payload
    // that is no longer there.
    const warnings: Warning[] = [];
    const keptUsed: string[] = [];
    for (const name of used) {
        if (IMPLEMENTED_EXTENSIONS.includes(name)) {
            keptUsed.push(name);
        } else {
            warnings.push({
                code: "UNKNOWN_EXTENSION_IGNORED",
                detail: `extensionsUsed: ${name}`,
            });
        }
    }

    return {
        ok: true,
        value: {
            doc: parsed,
            generator,
            extensionsUsed: keptUsed,
            extensionsRequired: required,
        },
        warnings,
    };
}

export type AccessorType = "u8" | "u16" | "u32" | "f32";

export const ACCESSOR_TYPES = ["u8", "u16", "u32", "f32"] as const;

export const ELEMENT_SIZE: Readonly<Record<AccessorType, number>> = {
    u8: 1,
    u16: 2,
    u32: 4,
    f32: 4,
};

export interface Accessor {
    readonly offset: number;
    readonly count: number;
    readonly type: AccessorType;
}

/** One descriptor set, kept and structurally understood. */
export interface SetSpec {
    readonly kind: string;
    readonly norm: string;
    readonly elementType: "bits" | "u8" | "f32";
    readonly dimensions: number;
    readonly bytesPerDescriptor: number;
    readonly producer: string;
    readonly params: Params;
    /** Rows, `M`. */
    readonly count: number;
    readonly levelStart: number;
    readonly kpIndex: number;
    readonly data: number;
}

export interface PatchSpec {
    readonly patchSize: number;
    readonly count: number;
    readonly score: number;
    readonly left: number;
    readonly top: number;
    readonly level: number;
    readonly pixels: number;
}

export interface RefImageSpec {
    readonly level: number;
    readonly width: number;
    readonly height: number;
    readonly pixels: number;
}

/**
 * The whole manifest, validated, with every accessor reference resolved to an
 * **index** — not yet to an array. Materialising is `arrays.ts`'s job, and it
 * happens only after everything here has passed.
 */
export interface ManifestSpec {
    readonly head: ManifestHead;
    readonly accessors: readonly Accessor[];
    readonly meta: {
        readonly widthPx: number;
        readonly heightPx: number;
        readonly physicalSizeMm: readonly [number, number] | null;
    };
    readonly pyramid: {
        readonly scaleStep: number;
        readonly levelSizes: readonly (readonly [number, number])[];
    };
    readonly keypoints: {
        readonly count: number;
        readonly detector: { readonly kind: string; readonly params: Params };
        readonly levelStart: number;
        readonly x: number;
        readonly y: number;
        readonly angle: number;
        readonly score: number;
        readonly size: number | undefined;
        readonly level: number;
    };
    readonly descriptorSets: readonly SetSpec[];
    readonly patches: PatchSpec | undefined;
    readonly referenceImage: RefImageSpec | undefined;
    readonly info: TargetInfo | undefined;
}

export type ValidateResult =
    | {
          readonly ok: true;
          readonly value: ManifestSpec;
          readonly warnings: readonly Warning[];
      }
    | ({ readonly ok: false } & Failure);

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

/**
 * A JSON number with no fractional part in `[0, 2^32 − 1]` — the domain §5.2
 * fixes for `offset` and `count`.
 *
 * Checked **before** any arithmetic uses the value, so every product below has
 * `u32` operands and stays exact in a `Number` (below 2^53). `Number.isInteger`
 * rejects `NaN` and `Infinity` on its own.
 */
const isU32 = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= U32_MAX;

const isIntegerInRange = (v: unknown, lo: number, hi: number): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const isFiniteNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

/** An optional free-form object: absent means `{}` (§7.3). */
const readParams = (v: unknown): Params | null => {
    if (v === undefined) return {};
    return isObject(v) ? (v as Params) : null;
};

/**
 * §6.1 step 6: the schema, the accessors and the resource limits.
 *
 * Order matters and follows the specification: accessors first, because every
 * other field references them; then the pyramid, because `L` fixes how long
 * every `levelStart` must be; then the rest. Nothing here reads array
 * contents — that is step 7, in `consistency.ts`.
 */
export function validateManifest(
    head: ManifestHead,
    binLength: number | null,
    limits: DecodeLimits,
): ValidateResult {
    const doc = head.doc;
    const warnings: Warning[] = [];

    // First failure wins. Helpers below set this and return a placeholder, so
    // the validation reads as a straight sequence rather than a staircase of
    // early returns; every section ends by checking it.
    let failure: Failure | null = null;
    const bad = (detail: string): void => {
        failure ??= fail("BAD_MANIFEST", detail);
    };
    const layout = (detail: string): void => {
        failure ??= fail("BAD_LAYOUT", detail);
    };
    const limit = (detail: string): void => {
        failure ??= fail("LIMIT_EXCEEDED", detail);
    };
    const inconsistent = (detail: string): void => {
        failure ??= fail("INCONSISTENT_DATA", detail);
    };
    const stop = (): ValidateResult => ({ ok: false, ...failure! });

    // --- accessors (§5.2) -------------------------------------------------
    const rawAccessors = doc["accessors"];
    if (!Array.isArray(rawAccessors)) return { ok: false, ...fail("BAD_MANIFEST", "accessors must be an array") };
    const accessors: Accessor[] = [];
    for (let i = 0; i < rawAccessors.length; i += 1) {
        const a: unknown = rawAccessors[i];
        if (!isObject(a)) {
            bad(`accessors[${i}] must be an object`);
            break;
        }
        if (!isU32(a["offset"])) {
            bad(`accessors[${i}].offset must be an integer in [0, 2^32 − 1]`);
            break;
        }
        if (!isU32(a["count"])) {
            bad(`accessors[${i}].count must be an integer in [0, 2^32 − 1]`);
            break;
        }
        const type = a["type"];
        if (
            typeof type !== "string" ||
            !(ACCESSOR_TYPES as readonly string[]).includes(type)
        ) {
            bad(`accessors[${i}].type must be one of u8, u16, u32, f32`);
            break;
        }
        accessors.push({
            offset: a["offset"],
            count: a["count"],
            type: type as AccessorType,
        });
    }
    if (failure !== null) return stop();

    // §5.2 rev 2: accessors with no BIN chunk is BAD_LAYOUT, including when
    // every count is 0 — a case the bound below would not catch.
    if (accessors.length > 0 && binLength === null) {
        return { ok: false, ...fail("BAD_LAYOUT", "the manifest declares accessors but the file has no BIN chunk") };
    }
    const binBytes = binLength ?? 0;
    for (let i = 0; i < accessors.length; i += 1) {
        const a = accessors[i]!;
        const size = ELEMENT_SIZE[a.type];
        if (a.offset % size !== 0) {
            layout(`accessors[${i}].offset ${a.offset} is not a multiple of ${size}`);
            break;
        }
        // Both operands are u32, so the product is exact below 2^53 and this
        // comparison cannot be fooled by a wrap.
        const end = a.offset + a.count * size;
        if (end > binBytes) {
            layout(
                `accessors[${i}] ends at ${end}, past the BIN chunk's ${binBytes} bytes`,
            );
            break;
        }
    }
    if (failure !== null) return stop();

    // Overlap (§5.2). A zero-length accessor owns no bytes, so it takes part
    // in no overlap and two of them may share an offset.
    const occupied = accessors
        .map((a, i) => ({
            i,
            start: a.offset,
            end: a.offset + a.count * ELEMENT_SIZE[a.type],
        }))
        .filter((r) => r.end > r.start)
        .sort((p, q) => p.start - q.start);
    for (let k = 1; k < occupied.length; k += 1) {
        if (occupied[k]!.start < occupied[k - 1]!.end) {
            layout(
                `accessors[${occupied[k]!.i}] overlaps accessors[${occupied[k - 1]!.i}]`,
            );
            break;
        }
    }
    if (failure !== null) return stop();

    /** Resolve an accessor reference, checking the type and count its field fixes. */
    const ref = (
        value: unknown,
        path: string,
        type: AccessorType,
        count: number,
    ): number => {
        if (failure !== null) return 0;
        if (!isIntegerInRange(value, 0, accessors.length - 1)) {
            bad(`${path} must be an integer accessor index in [0, ${accessors.length})`);
            return 0;
        }
        const a = accessors[value]!;
        if (a.type !== type) {
            layout(`${path} expects an accessor of type ${type}, got ${a.type}`);
            return 0;
        }
        if (a.count !== count) {
            layout(`${path} expects ${count} elements, got ${a.count}`);
            return 0;
        }
        return value;
    };

    // --- pyramid (§5.4) ---------------------------------------------------
    const pyramidRaw = doc["pyramid"];
    if (!isObject(pyramidRaw)) return { ok: false, ...fail("BAD_MANIFEST", "pyramid must be an object") };
    const levelSizesRaw = pyramidRaw["levelSizes"];
    if (!Array.isArray(levelSizesRaw) || levelSizesRaw.length === 0) {
        return { ok: false, ...fail("BAD_MANIFEST", "pyramid.levelSizes must be a non-empty array") };
    }
    if (levelSizesRaw.length > limits.maxLevels) {
        return { ok: false, ...fail("LIMIT_EXCEEDED", `pyramid has ${levelSizesRaw.length} levels, limit ${limits.maxLevels}`) };
    }
    const levelSizes: [number, number][] = [];
    for (let l = 0; l < levelSizesRaw.length; l += 1) {
        const entry: unknown = levelSizesRaw[l];
        if (!Array.isArray(entry) || entry.length !== 2) {
            bad(`pyramid.levelSizes[${l}] must be a [width, height] pair`);
            break;
        }
        // A zero or negative size makes the level mapping of §3 meaningless.
        if (!isIntegerInRange(entry[0], 1, U16_MAX) || !isIntegerInRange(entry[1], 1, U16_MAX)) {
            bad(`pyramid.levelSizes[${l}] must hold integers in [1, 2^16 − 1]`);
            break;
        }
        levelSizes.push([entry[0], entry[1]]);
    }
    if (failure !== null) return stop();
    const L = levelSizes.length;

    const scaleStep = pyramidRaw["scaleStep"];
    // A scaleStep of 1 or less makes the level mapping of §3 a division by
    // zero or a reversal.
    if (!isFiniteNumber(scaleStep) || scaleStep <= 1) {
        return { ok: false, ...fail("BAD_MANIFEST", "pyramid.scaleStep must be finite and > 1") };
    }

    // --- meta (§5.3) ------------------------------------------------------
    const metaRaw = doc["meta"];
    if (!isObject(metaRaw)) return { ok: false, ...fail("BAD_MANIFEST", "meta must be an object") };
    if (
        !isIntegerInRange(metaRaw["widthPx"], 1, U16_MAX) ||
        !isIntegerInRange(metaRaw["heightPx"], 1, U16_MAX)
    ) {
        return { ok: false, ...fail("BAD_MANIFEST", "meta.widthPx and meta.heightPx must be integers in [1, 2^16 − 1]") };
    }
    const sizeMmRaw = metaRaw["physicalSizeMm"];
    let physicalSizeMm: readonly [number, number] | null = null;
    if (sizeMmRaw !== null) {
        if (
            !Array.isArray(sizeMmRaw) ||
            sizeMmRaw.length !== 2 ||
            !isFiniteNumber(sizeMmRaw[0]) ||
            !isFiniteNumber(sizeMmRaw[1]) ||
            sizeMmRaw[0] <= 0 ||
            sizeMmRaw[1] <= 0
        ) {
            return { ok: false, ...fail("BAD_MANIFEST", "meta.physicalSizeMm must be null or two numbers > 0") };
        }
        physicalSizeMm = [sizeMmRaw[0], sizeMmRaw[1]];
    }

    // --- keypoints (§5.5) -------------------------------------------------
    const kpRaw = doc["keypoints"];
    if (!isObject(kpRaw)) return { ok: false, ...fail("BAD_MANIFEST", "keypoints must be an object") };
    const N = kpRaw["count"];
    if (!isU32(N)) return { ok: false, ...fail("BAD_MANIFEST", "keypoints.count must be an integer in [0, 2^32 − 1]") };
    if (N > limits.maxKeypoints) {
        return { ok: false, ...fail("LIMIT_EXCEEDED", `keypoints.count is ${N}, limit ${limits.maxKeypoints}`) };
    }
    const detectorRaw = kpRaw["detector"];
    if (!isObject(detectorRaw) || typeof detectorRaw["kind"] !== "string") {
        return { ok: false, ...fail("BAD_MANIFEST", "keypoints.detector must be an object with a string kind") };
    }
    const detectorParams = readParams(detectorRaw["params"]);
    if (detectorParams === null) {
        return { ok: false, ...fail("BAD_MANIFEST", "keypoints.detector.params must be an object when present") };
    }
    const keypoints = {
        count: N,
        detector: { kind: detectorRaw["kind"], params: detectorParams },
        levelStart: ref(kpRaw["levelStart"], "keypoints.levelStart", "u32", L + 1),
        x: ref(kpRaw["x"], "keypoints.x", "f32", N),
        y: ref(kpRaw["y"], "keypoints.y", "f32", N),
        angle: ref(kpRaw["angle"], "keypoints.angle", "f32", N),
        score: ref(kpRaw["score"], "keypoints.score", "f32", N),
        size:
            kpRaw["size"] === undefined
                ? undefined
                : ref(kpRaw["size"], "keypoints.size", "f32", N),
        level: ref(kpRaw["level"], "keypoints.level", "u8", N),
    };
    if (failure !== null) return stop();

    // --- descriptorSets (§5.6) --------------------------------------------
    const setsRaw = doc["descriptorSets"];
    if (!Array.isArray(setsRaw) || setsRaw.length === 0) {
        return { ok: false, ...fail("BAD_MANIFEST", "descriptorSets must be an array with at least one entry") };
    }
    if (setsRaw.length > limits.maxDescriptorSets) {
        return { ok: false, ...fail("LIMIT_EXCEEDED", `${setsRaw.length} descriptor sets, limit ${limits.maxDescriptorSets}`) };
    }
    const descriptorSets: SetSpec[] = [];
    const seenKeys = new Set<string>();
    for (let i = 0; i < setsRaw.length; i += 1) {
        const s: unknown = setsRaw[i];
        if (!isObject(s)) {
            bad(`descriptorSets[${i}] must be an object`);
            break;
        }
        const kind = s["kind"];
        const norm = s["norm"];
        const elementType = s["elementType"];
        const producer = s["producer"];
        if (
            typeof kind !== "string" ||
            typeof norm !== "string" ||
            typeof elementType !== "string" ||
            typeof producer !== "string"
        ) {
            bad(`descriptorSets[${i}] needs string kind, norm, elementType and producer`);
            break;
        }

        // An unknown elementType leaves nothing interpretable — not the
        // element width, not the accessor type to expect — so the set is
        // dropped whole (§5.6). It must be dropped *before* its accessors are
        // read, or a broken one would report BAD_LAYOUT instead of warning.
        if (!(KNOWN_ELEMENT_TYPES as readonly string[]).includes(elementType)) {
            warnings.push({
                code: "UNSUPPORTED_DESCRIPTOR_SET",
                detail: `descriptorSets[${i}]: unknown elementType "${elementType}", dropped`,
            });
            continue;
        }
        const element = elementType as "bits" | "u8" | "f32";

        // An unknown kind or norm leaves the set structurally understood, so
        // it is kept, preserved and re-emitted unchanged — unusable, warned
        // about, and harmless to the rest of the file.
        if (
            !(KNOWN_DESCRIPTOR_KINDS as readonly string[]).includes(kind) ||
            !(KNOWN_DESCRIPTOR_NORMS as readonly string[]).includes(norm)
        ) {
            warnings.push({
                code: "UNSUPPORTED_DESCRIPTOR_SET",
                detail: `descriptorSets[${i}]: unknown kind "${kind}" or norm "${norm}"`,
            });
        }

        const dimensions = s["dimensions"];
        const bytesPerDescriptor = s["bytesPerDescriptor"];
        const M = s["count"];
        if (!isU32(dimensions) || !isU32(bytesPerDescriptor) || !isU32(M)) {
            bad(`descriptorSets[${i}] needs u32 dimensions, bytesPerDescriptor and count`);
            break;
        }
        const expectedBytes =
            element === "bits"
                ? dimensions % 8 === 0
                    ? dimensions / 8
                    : -1
                : element === "u8"
                  ? dimensions
                  : 4 * dimensions;
        if (bytesPerDescriptor !== expectedBytes) {
            inconsistent(
                `descriptorSets[${i}].bytesPerDescriptor is ${bytesPerDescriptor}, not the ${expectedBytes} that elementType "${element}" and dimensions ${dimensions} require`,
            );
            break;
        }
        const params = readParams(s["params"]);
        if (params === null) {
            bad(`descriptorSets[${i}].params must be an object when present`);
            break;
        }
        // The uniqueness key of 5.6. JSON.stringify rather than a
        // separator string: a producer or kind containing the separator
        // would otherwise let two different tuples collide.
        const key = JSON.stringify([kind, norm, dimensions, producer]);
        if (seenKeys.has(key)) {
            inconsistent(
                `descriptorSets[${i}] repeats the key (kind, norm, dimensions, producer) of an earlier set`,
            );
            break;
        }
        seenKeys.add(key);

        const dataCount = element === "f32" ? M * dimensions : M * bytesPerDescriptor;
        descriptorSets.push({
            kind,
            norm,
            elementType: element,
            dimensions,
            bytesPerDescriptor,
            producer,
            params,
            count: M,
            levelStart: ref(s["levelStart"], `descriptorSets[${i}].levelStart`, "u32", L + 1),
            kpIndex: ref(s["kpIndex"], `descriptorSets[${i}].kpIndex`, "u32", M),
            data: ref(
                s["data"],
                `descriptorSets[${i}].data`,
                element === "f32" ? "f32" : "u8",
                dataCount,
            ),
        });
        if (failure !== null) break;
    }
    if (failure !== null) return stop();

    // --- patches (§5.7) ---------------------------------------------------
    let patches: PatchSpec | undefined;
    const patchesRaw = doc["patches"];
    if (patchesRaw !== undefined) {
        if (!isObject(patchesRaw)) return { ok: false, ...fail("BAD_MANIFEST", "patches must be an object when present") };
        const P = patchesRaw["patchSize"];
        const Q = patchesRaw["count"];
        if (!isU32(P) || P < 1 || !isU32(Q)) {
            return { ok: false, ...fail("BAD_MANIFEST", "patches.patchSize must be a positive integer and patches.count a u32") };
        }
        if (P > limits.maxPatchSize) {
            return { ok: false, ...fail("LIMIT_EXCEEDED", `patches.patchSize is ${P}, limit ${limits.maxPatchSize}`) };
        }
        if (Q > limits.maxPatches) {
            return { ok: false, ...fail("LIMIT_EXCEEDED", `patches.count is ${Q}, limit ${limits.maxPatches}`) };
        }
        // Q and P are both checked u32s, so this product is exact.
        const pixelCount = Q * P * P;
        patches = {
            patchSize: P,
            count: Q,
            score: ref(patchesRaw["score"], "patches.score", "f32", Q),
            left: ref(patchesRaw["left"], "patches.left", "u16", Q),
            top: ref(patchesRaw["top"], "patches.top", "u16", Q),
            level: ref(patchesRaw["level"], "patches.level", "u8", Q),
            pixels: ref(patchesRaw["pixels"], "patches.pixels", "u8", pixelCount),
        };
        if (failure !== null) return stop();
    }

    // --- referenceImage (§5.8) --------------------------------------------
    let referenceImage: RefImageSpec | undefined;
    const refImageRaw = doc["referenceImage"];
    if (refImageRaw !== undefined) {
        if (!isObject(refImageRaw)) return { ok: false, ...fail("BAD_MANIFEST", "referenceImage must be an object when present") };
        const level = refImageRaw["level"];
        const width = refImageRaw["width"];
        const height = refImageRaw["height"];
        if (
            !isU32(level) ||
            !isIntegerInRange(width, 1, U16_MAX) ||
            !isIntegerInRange(height, 1, U16_MAX)
        ) {
            return { ok: false, ...fail("BAD_MANIFEST", "referenceImage needs a u32 level and sizes in [1, 2^16 − 1]") };
        }
        referenceImage = {
            level,
            width,
            height,
            pixels: ref(refImageRaw["pixels"], "referenceImage.pixels", "u8", width * height),
        };
        if (failure !== null) return stop();
    }

    // --- info (§5.9) ------------------------------------------------------
    const infoRaw = doc["info"];
    if (infoRaw !== undefined && !isObject(infoRaw)) {
        return { ok: false, ...fail("BAD_MANIFEST", "info must be an object when present") };
    }

    return {
        ok: true,
        value: {
            head,
            accessors,
            meta: {
                widthPx: metaRaw["widthPx"],
                heightPx: metaRaw["heightPx"],
                physicalSizeMm,
            },
            pyramid: { scaleStep, levelSizes },
            keypoints,
            descriptorSets,
            patches,
            referenceImage,
            info: infoRaw as TargetInfo | undefined,
        },
        warnings,
    };
}
