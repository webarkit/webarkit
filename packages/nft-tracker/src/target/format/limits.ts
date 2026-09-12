/*
 *  limits.ts
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
 * Resource limits (§6.4).
 *
 * A `.wnft` file may come from a URL an application's user chose, so the
 * reader is exposed to untrusted input and must refuse to allocate in
 * proportion to a number it has not yet accepted. §6.4 requires these limits
 * to be enforced *and* to be configurable: a build serving files it produced
 * itself can raise them; an application loading a URL a user typed should not.
 */

export interface DecodeLimits {
    /**
     * The whole file, in bytes. Checked at §6.1 step 0, before a single byte
     * is read — which is why a file past this limit reports `LIMIT_EXCEEDED`
     * and not `BAD_MAGIC`, even when it is not a `.wnft` at all.
     */
    readonly maxFileBytes: number;
    /** The `JSON` chunk, in bytes. Checked before the manifest is decoded. */
    readonly maxManifestBytes: number;
    readonly maxLevels: number;
    readonly maxKeypoints: number;
    readonly maxDescriptorSets: number;
    /** The patch edge `P`. */
    readonly maxPatchSize: number;
    /**
     * The number of patches `Q`.
     *
     * Bounded transitively anyway — `Q x P x P` pixel bytes have to exist in
     * the BIN chunk — but 6.4 exists so that a reader checks a count rather
     * than reasoning about what some other check implies.
     */
    readonly maxPatches: number;
}

/** The defaults §6.4 suggests. */
export const DEFAULT_LIMITS: DecodeLimits = Object.freeze({
    maxFileBytes: 64 * 1024 * 1024,
    maxManifestBytes: 1024 * 1024,
    maxLevels: 32,
    maxKeypoints: 1_000_000,
    maxDescriptorSets: 16,
    maxPatchSize: 64,
    maxPatches: 65_536,
});

export interface DecodeOptions {
    /** Overrides for individual limits; anything omitted keeps its default. */
    readonly limits?: Partial<DecodeLimits>;
}

/** Merge caller overrides onto {@link DEFAULT_LIMITS}, without mutating it. */
export function resolveLimits(options?: DecodeOptions): DecodeLimits {
    return { ...DEFAULT_LIMITS, ...options?.limits };
}
