/*
 *  types.ts
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
 * The **in-memory** shape of a trained NFT target.
 *
 * This is the decoded form of a `.wnft` file, as specified in
 * `docs/specs/nft-target-format.md` (format 0.1). Section references below
 * point into that document, which is the source of truth: where these types
 * and the specification disagree, the specification wins.
 *
 * Two flows meet here, which is why the shape is defined before either is
 * written: the **target compiler** produces a `TargetDb`, and the **codec**
 * decodes one from bytes and encodes one back.
 *
 * **What is deliberately absent.** Accessors, chunks, byte offsets, padding
 * and CRC-32 are framing concerns of the codec (§4, §5.2). Nothing here
 * describes where a value sat in the file — only what it means once read.
 * A consumer of a `TargetDb` never needs to know it came from a file at all.
 *
 * @see {@link https://github.com/webarkit/webarkit/blob/dev/docs/specs/nft-target-format.md}
 */

import type {
    DescriptorKind,
    DescriptorNorm,
    DetectorKind,
} from "@webarkit/cv-backend-spec";

/**
 * A value the contract enumerates, or any other string the file may carry.
 *
 * The contract's `DescriptorKind`, `DescriptorNorm` and `DetectorKind` are
 * closed unions of what backends implement *today*. A `.wnft` file is not
 * bound by that: §5.6 requires a set whose family or metric the reader does
 * not know to stay **present but unusable** (warning
 * `UNSUPPORTED_DESCRIPTOR_SET`) while the rest of the file keeps working. A
 * closed union could not represent such a set at all, so the codec would have
 * to drop it and contradict the specification.
 *
 * The `(string & {})` half keeps editor completion for the known values while
 * still accepting the unknown ones.
 */
type Known<T extends string> = T | (string & {});

/** Free-form, implementation-defined parameters (§5.5, §5.6, §5.9). */
export type Params = Readonly<Record<string, unknown>>;

/**
 * Physical and pixel size of the target (§5.3).
 *
 * `widthPx`/`heightPx` equal `pyramid.levelSizes[0]`; the codec enforces that,
 * these types only record it.
 */
export interface TargetMeta {
    readonly widthPx: number;
    readonly heightPx: number;
    /**
     * `[width, height]` in millimetres, both `> 0`, or `null` when unknown.
     * When `null`, model-plane units are level-0 pixels (§3).
     */
    readonly physicalSizeMm: readonly [number, number] | null;
}

/**
 * Geometry of the image pyramid the target was trained on (§5.4).
 *
 * `levelSizes` is authoritative and never recomputed from `scaleStep`:
 * implementations round differently, so sizes are recorded as produced.
 */
export interface PyramidInfo {
    /** Size ratio between consecutive levels, e.g. `2^(1/3)`. Finite and `> 1`. */
    readonly scaleStep: number;
    /** `[width, height]` per level, level 0 first. Its length is `L`. */
    readonly levelSizes: readonly (readonly [number, number])[];
}

/** Which detector produced the keypoints, and how (§5.5). Informative. */
export interface DetectorInfo {
    readonly kind: Known<DetectorKind>;
    readonly params: Params;
}

/**
 * Keypoints as a structure of arrays (§5.5), `N = count` entries each.
 *
 * Structure-of-arrays rather than an array of objects: it is what the file
 * stores, it keeps the decode a set of typed-array views instead of `N` object
 * allocations, and it is the fixed-shape data ADR-0001 point 7 asks for.
 *
 * Keypoints are sorted by level, ascending.
 *
 * Coordinates are `Float32Array`, not `Float64Array`: §5.5 stores them as
 * `f32` because that halves the arrays and is still far below detector
 * accuracy. Readers widen to `Float64` when building the contract's
 * `PointArray` — ADR-0001 point 7's float64 rule governs computed geometry,
 * not this storage.
 */
export interface KeypointTable {
    /** `N`. */
    readonly count: number;
    readonly detector: DetectorInfo;
    /**
     * `L + 1` entries: the keypoints of level `l` are the indices
     * `[levelStart[l], levelStart[l + 1])`, and `levelStart[L] = N`.
     */
    readonly levelStart: Uint32Array;
    /** Level-0 coordinates (§3), `N` entries. */
    readonly x: Float32Array;
    /** Level-0 coordinates (§3), `N` entries. */
    readonly y: Float32Array;
    /** Radians, as the detector produced them; no range is guaranteed. */
    readonly angle: Float32Array;
    /** Detector response. */
    readonly score: Float32Array;
    /**
     * Diameter, in level-0 pixels, of the region the descriptor sampled.
     * Absent when the producer did not record it.
     */
    readonly size?: Float32Array;
    /** Pyramid level per keypoint; agrees with {@link levelStart}. */
    readonly level: Uint8Array;
}

/**
 * Fields shared by every descriptor set (§5.6).
 *
 * `count`, `bytesPerDescriptor`, `kind` and `norm` are named exactly as in the
 * contract's `Descriptors` on purpose: a per-level slice of a binary set is
 * then a `subarray` view plus these fields, and the descriptor bytes are
 * never copied or converted.
 *
 * The names line up; the *types* of `kind` and `norm` deliberately do not.
 * They are open unions here (§5.6 requires an unknown family to stay
 * representable), so they do not assign to the contract's closed
 * `DescriptorKind`/`DescriptorNorm` on their own. What narrows them is the
 * §6.3 usability check — a set is consumable only when `elementType` is
 * `"bits"`, `norm` is `"hamming"` and `kind` is one the backend declares.
 * That guard belongs to the codec and lands with it; it is not a conversion
 * of the data.
 */
interface DescriptorSetBase {
    readonly kind: Known<DescriptorKind>;
    readonly norm: Known<DescriptorNorm>;
    /** Number of bits for `"bits"`, number of elements otherwise. */
    readonly dimensions: number;
    /**
     * `dimensions / 8` for `"bits"`, `dimensions` for `"u8"`,
     * `4 × dimensions` for `"f32"`.
     */
    readonly bytesPerDescriptor: number;
    /** `capabilities.name` of the backend that computed the set. */
    readonly producer: string;
    readonly params: Params;
    /** Rows, `M`. */
    readonly count: number;
    /**
     * `L + 1` entries: the rows of level `l` are `[levelStart[l],
     * levelStart[l + 1])`, `levelStart[0] = 0` and `levelStart[L] = M`.
     */
    readonly levelStart: Uint32Array;
    /**
     * `M` entries: the keypoint each row describes. Every row in the range of
     * level `l` references a keypoint whose level is `l`. Several rows may
     * describe the same keypoint only under the `WKNF_multiview` extension.
     */
    readonly kpIndex: Uint32Array;
}

/**
 * Packed binary descriptors — the only form the current contract can consume
 * (§6.3), since `Descriptors.data` is a `Uint8Array` and every
 * `DescriptorKind` defined today is binary.
 */
export interface BitsDescriptorSet extends DescriptorSetBase {
    readonly elementType: "bits";
    /** `M × bytesPerDescriptor` bytes, row-major. */
    readonly data: Uint8Array;
}

/** Byte-valued descriptors, one byte per dimension. */
export interface U8DescriptorSet extends DescriptorSetBase {
    readonly elementType: "u8";
    /** `M × bytesPerDescriptor` bytes, row-major. */
    readonly data: Uint8Array;
}

/** Float descriptors, e.g. for a future float family. */
export interface F32DescriptorSet extends DescriptorSetBase {
    readonly elementType: "f32";
    /** `M × dimensions` floats, row-major. */
    readonly data: Float32Array;
}

/**
 * One descriptor set (§5.6), discriminated by `elementType`.
 *
 * The discriminant carries the element array with it, so narrowing on
 * `elementType` yields the right typed array, and §6.3's usability rule —
 * only `"bits"` + `"hamming"` is consumable today — is a type guard rather
 * than a comment.
 */
export type DescriptorSet =
    | BitsDescriptorSet
    | U8DescriptorSet
    | F32DescriptorSet;

/**
 * Tracking patches (§5.7), `Q = count` entries.
 *
 * `left`/`top` are **level** coordinates, not level-0: the pixels are read
 * from `level[q]`'s image at exactly those integer indices (§3). These are
 * the only positions in a target that are not in level-0 coordinates.
 *
 * Pixels carry no extra smoothing; blur is a tracker runtime parameter.
 */
export interface PatchTable {
    /** `P`, the patch edge in pixels. */
    readonly patchSize: number;
    /** `Q`. */
    readonly count: number;
    /** Shi–Tomasi minimum eigenvalue. */
    readonly score: Float32Array;
    /** Top-left pixel, in the coordinates of the patch's own level. */
    readonly left: Uint16Array;
    /** Top-left pixel, in the coordinates of the patch's own level. */
    readonly top: Uint16Array;
    /** Pyramid level the patch was cut from. */
    readonly level: Uint8Array;
    /** `Q × P × P` grayscale values, row-major, `P × P` per patch. */
    readonly pixels: Uint8Array;
}

/**
 * The optional stored reference image (§5.8).
 *
 * Optional because of its size; it enables re-compilation, debugging and
 * dense refinement.
 */
export interface ReferenceImage {
    /** Pyramid level this image is of. */
    readonly level: number;
    /** Equals `pyramid.levelSizes[level][0]`. */
    readonly width: number;
    /** Equals `pyramid.levelSizes[level][1]`. */
    readonly height: number;
    /** `width × height` grayscale values, row-major. */
    readonly pixels: Uint8Array;
}

/**
 * Free-form provenance (§5.9). No field is required, and readers must not
 * depend on any of them; the named ones are what the specification suggests.
 */
export interface TargetInfo {
    readonly name?: string;
    /** ISO 8601. */
    readonly createdAt?: string;
    readonly compiler?: Params;
    readonly trackability?: number;
    readonly [key: string]: unknown;
}

/**
 * A decoded NFT target: everything the tracker needs to find and follow one
 * planar image.
 *
 * Mirrors the manifest's top level (§5.1) minus the framing: `accessors` is
 * gone, and each field that referenced an accessor holds the typed array
 * itself.
 */
export interface TargetDb {
    /** `"MAJOR.MINOR"` as stored (§5.1). Interpreting it is the codec's job (§7). */
    readonly formatVersion: string;
    /** Free text identifying what wrote the file. */
    readonly generator?: string;
    /** Names of extensions present in the file. */
    readonly extensionsUsed: readonly string[];
    /**
     * Subset of {@link extensionsUsed} a reader must understand to read the
     * file correctly. `WKNF_multiview` here is what permits `M ≠ N` in a
     * descriptor set (§5.6).
     */
    readonly extensionsRequired: readonly string[];
    /** Top-level extension payloads, keyed by extension name (§5.1). */
    readonly extensions?: Readonly<Record<string, unknown>>;
    readonly meta: TargetMeta;
    readonly pyramid: PyramidInfo;
    readonly keypoints: KeypointTable;
    /** At least one entry (§5.1). Usability is decided per set (§6.3). */
    readonly descriptorSets: readonly DescriptorSet[];
    readonly patches?: PatchTable;
    readonly referenceImage?: ReferenceImage;
    readonly info?: TargetInfo;
}
