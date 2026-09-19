/*
 *  known.ts
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
 * What this build recognises.
 *
 * The contract's `DescriptorKind`, `DescriptorNorm` and `DetectorKind` are
 * *types*, and §5.6 needs the same information at run time: whether a set's
 * family, metric or element type is one this reader knows decides whether the
 * set is usable, preserved or dropped. These lists are that information, and
 * the assertions at the bottom keep them from drifting from the unions.
 */

import type {
    DescriptorKind,
    DescriptorNorm,
    DetectorKind,
} from "@webarkit/cv-backend-spec";

/** The only `format.version` this build reads or writes (§7.1). */
export const SUPPORTED_FORMAT_VERSION = "0.2";

/**
 * The only `container_major` this build frames (§7.1).
 *
 * Any `container_minor` is accepted: a newer minor only adds chunks a reader
 * can skip.
 */
export const SUPPORTED_CONTAINER_MAJOR = 1;

/**
 * Descriptor families this build recognises.
 *
 * A set whose `kind` is not here stays **present but unusable**, with the
 * warning `UNSUPPORTED_DESCRIPTOR_SET` (§5.6): its element width is still
 * known, so it round-trips unchanged and the rest of the file keeps working.
 */
export const KNOWN_DESCRIPTOR_KINDS = [
    "orb",
    "freak",
    "beblid",
    "teblid",
    "akaze",
] as const satisfies readonly DescriptorKind[];

/**
 * Distance metrics this build recognises.
 *
 * §5.6's prose lists `"hamming2"` among the possibilities, and it is
 * deliberately **not** here: the contract's `DescriptorNorm` does not define
 * it, so a set using it is one this reader does not know — warned about and
 * preserved. That is the rule working, not a gap in this list.
 */
export const KNOWN_DESCRIPTOR_NORMS = [
    "hamming",
    "l2",
] as const satisfies readonly DescriptorNorm[];

/** Detector families the contract enumerates. Informative only (§5.5). */
export const KNOWN_DETECTOR_KINDS = [
    "fast",
    "yape",
    "yape06",
    "orb",
    "akaze",
] as const satisfies readonly DetectorKind[];

/**
 * Element types the format defines (§5.6).
 *
 * Unlike `kind` and `norm`, an unknown one makes a set uninterpretable —
 * nothing says how wide an element is or which accessor type to expect — so
 * such a set is dropped on decode rather than preserved.
 */
export const KNOWN_ELEMENT_TYPES = ["bits", "u8", "f32"] as const;

/**
 * Extensions this build implements — none yet.
 *
 * `WKNF_multiview` (§5.6) is specified, but its adoption is blocked on
 * k-nearest matching in the contract (§11, Q3), so listing it here would claim
 * a ratio test this package cannot perform. The consequences are exactly the
 * specified ones: the name in `extensionsRequired` gives
 * `UNSUPPORTED_EXTENSION`, in `extensionsUsed` alone it is pruned with
 * `UNKNOWN_EXTENSION_IGNORED`, and `M ≠ N` is therefore always
 * `INCONSISTENT_DATA`.
 */
export const IMPLEMENTED_EXTENSIONS: readonly string[] = [];

// The lists above must be exactly the contract's unions, not merely subsets.
// A family the contract gains and this file does not would silently become
// "unknown", and every file carrying it would start warning instead of
// working. `satisfies` above catches a value that is not in the union; this
// catches a union member that is not in the value.
type MissingKind = Exclude<
    DescriptorKind,
    (typeof KNOWN_DESCRIPTOR_KINDS)[number]
>;
type MissingNorm = Exclude<
    DescriptorNorm,
    (typeof KNOWN_DESCRIPTOR_NORMS)[number]
>;
type MissingDetector = Exclude<
    DetectorKind,
    (typeof KNOWN_DETECTOR_KINDS)[number]
>;

const KNOWN_LISTS_ARE_EXHAUSTIVE: [
    MissingKind,
    MissingNorm,
    MissingDetector,
] extends [never, never, never]
    ? true
    : never = true;
void KNOWN_LISTS_ARE_EXHAUSTIVE;
