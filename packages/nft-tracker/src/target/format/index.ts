/*
 *  index.ts
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
 * The `.wnft` codec's public surface.
 *
 * Two functions and the types they return. Everything else —
 * `parseContainer`, `scanIJson`, `validateManifest`, `materialise`,
 * `validateTarget` — stays internal: it is reachable by deep import for the
 * fixture generator and the test suites, and is not part of what this package
 * promises to keep working.
 *
 * @see {@link https://github.com/webarkit/webarkit/blob/dev/docs/specs/nft-target-format.md}
 */

export { decode } from "./decode.js";
export { encode } from "./encode.js";
export { DEFAULT_LIMITS } from "./limits.js";
export type { DecodeLimits, DecodeOptions } from "./limits.js";
export type {
    DecodeResult,
    EncodeResult,
    ErrorCode,
    Warning,
    WarningCode,
} from "./errors.js";
