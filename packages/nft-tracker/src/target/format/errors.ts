/*
 *  errors.ts
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
 * The codec's result vocabulary: the error and warning codes of §6.2, and the
 * two result types the public entry points return.
 *
 * Types and unions only, deliberately: ADR-0001 point 7 reserves exceptions
 * for contract violations and requires explicit result types for everything
 * else, so these shapes are what `decode` and `encode` promise, and nothing
 * here can throw.
 */

import type { TargetDb } from "../types.js";

/**
 * Every failure a reader can report (§6.2), plus the writer's own
 * `INVALID_TARGET` (§7.3).
 *
 * `NO_USABLE_DESCRIPTORS` is deliberately absent. §6.2 defines it as the
 * outcome of choosing a descriptor set against a runtime backend's
 * capabilities (§6.3), which is not part of the codec: nothing here knows what
 * a backend can consume. It belongs to whatever layer performs that selection,
 * and listing it here would promise a decode path that cannot produce it.
 */
export type ErrorCode =
    | "BAD_MAGIC"
    | "UNSUPPORTED_CONTAINER"
    | "BAD_CONTAINER"
    | "CHECKSUM_MISMATCH"
    | "MANIFEST_TOO_LARGE"
    | "BAD_MANIFEST"
    | "UNSUPPORTED_FORMAT_VERSION"
    | "UNSUPPORTED_EXTENSION"
    | "BAD_LAYOUT"
    | "LIMIT_EXCEEDED"
    | "INCONSISTENT_DATA"
    | "INVALID_TARGET";

/**
 * Warnings a successful decode can carry (§6.2).
 *
 * `PRODUCER_MISMATCH` is absent for the same reason `NO_USABLE_DESCRIPTORS`
 * is: it compares the chosen set's `producer` with a runtime backend's
 * `capabilities.name`, and no backend is in play here.
 */
export type WarningCode =
    | "UNKNOWN_CHUNK_SKIPPED"
    | "UNKNOWN_EXTENSION_IGNORED"
    | "UNSUPPORTED_DESCRIPTOR_SET";

/**
 * One warning.
 *
 * `detail` names what triggered it — a chunk type, an extension name, a
 * descriptor-set index — because §6.2 requires warnings to be part of the
 * returned result rather than only logged, so that an application can act on
 * one. Acting on it needs to know which thing it was about.
 */
export interface Warning {
    readonly code: WarningCode;
    readonly detail: string;
}

/** A failure travelling up through the codec's internal layers. */
export interface Failure {
    readonly error: ErrorCode;
    readonly detail: string;
}

/** The reader's result. Never an exception (ADR-0001 point 7). */
export type DecodeResult =
    | {
          readonly ok: true;
          readonly target: TargetDb;
          readonly warnings: readonly Warning[];
      }
    | { readonly ok: false; readonly error: ErrorCode; readonly detail: string };

/**
 * The writer's result (§7.3).
 *
 * `detail` names the offending field path, e.g.
 * `"descriptorSets[1].params.seed"`, so the caller can find the value without
 * re-validating the target itself.
 */
export type EncodeResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | {
          readonly ok: false;
          readonly error: "INVALID_TARGET";
          readonly detail: string;
      };

/** Build a {@link Failure}. Shorthand used throughout the codec. */
export function fail(error: ErrorCode, detail: string): Failure {
    return { error, detail };
}
