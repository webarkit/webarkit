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

import { fail, type Failure, type Warning } from "./errors.js";
import { scanIJson } from "./ijson.js";
import { IMPLEMENTED_EXTENSIONS, SUPPORTED_FORMAT_VERSION } from "./known.js";
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
