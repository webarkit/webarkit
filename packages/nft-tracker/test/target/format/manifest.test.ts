/*
 *  manifest.test.ts
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

import { describe, it, expect } from "vitest";
import { decodeManifest } from "../../../src/target/format/manifest.js";
import { DEFAULT_LIMITS } from "../../../src/target/format/limits.js";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const run = (s: string | Uint8Array, limits = DEFAULT_LIMITS) =>
    decodeManifest(typeof s === "string" ? utf8(s) : s, limits);
const errorOf = (r: ReturnType<typeof run>): string | null =>
    r.ok ? null : r.error;

const MINIMAL = '{"format":{"version":"0.2"}}';

describe("decodeManifest — size (§6.1 step 3)", () => {
    it("rejects a manifest above the limit, before decoding it", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: 16 };
        expect(errorOf(run(MINIMAL, limits))).toBe("MANIFEST_TOO_LARGE");
    });

    it("accepts a manifest exactly at the limit", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: MINIMAL.length };
        expect(run(MINIMAL, limits).ok).toBe(true);
    });

    it("rejects a manifest one byte above the limit", () => {
        const limits = { ...DEFAULT_LIMITS, maxManifestBytes: MINIMAL.length - 1 };
        expect(errorOf(run(MINIMAL, limits))).toBe("MANIFEST_TOO_LARGE");
    });
});

describe("decodeManifest — text (§6.1 step 4)", () => {
    it("rejects bytes that are not strict UTF-8", () => {
        expect(errorOf(run(new Uint8Array([0x7b, 0xff, 0x7d])))).toBe("BAD_MANIFEST");
    });

    it("rejects a lone surrogate encoded raw in the UTF-8 bytes", () => {
        // ED A0 80 is the CESU-8 spelling of U+D800, which strict UTF-8 refuses
        // — so §5 check (b) only ever has to deal with \u escapes.
        const cesu8 = new Uint8Array([
            0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x7d,
        ]);
        expect(errorOf(run(cesu8))).toBe("BAD_MANIFEST");
    });

    it("rejects each I-JSON violation as BAD_MANIFEST", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"a":1,"a":2}'))).toBe(
            "BAD_MANIFEST",
        );
        expect(errorOf(run('{"format":{"version":"0.2"},"a":9007199254740992}'))).toBe(
            "BAD_MANIFEST",
        );
        expect(errorOf(run('{"format":{"version":"0.2"},"a":1e400}'))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("names the offending path in the detail", () => {
        const r = run('{"format":{"version":"0.2"},"info":{"x":1e400}}');
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.detail).toContain("$.info.x");
    });

    it("rejects text that is not JSON", () => {
        expect(errorOf(run("not json"))).toBe("BAD_MANIFEST");
    });

    it("rejects a top level that is not an object", () => {
        expect(errorOf(run("[1,2]"))).toBe("BAD_MANIFEST");
        expect(errorOf(run("null"))).toBe("BAD_MANIFEST");
        expect(errorOf(run('"s"'))).toBe("BAD_MANIFEST");
        expect(errorOf(run("1"))).toBe("BAD_MANIFEST");
    });

    it("does not throw on pathological nesting", () => {
        const deep = `{"a":`.repeat(100_000) + "1" + "}".repeat(100_000);
        expect(() => run(deep)).not.toThrow();
        expect(run(deep).ok).toBe(false);
    });
});

describe("decodeManifest — version and extensions (§6.1 step 5)", () => {
    it("accepts exactly 0.2", () => {
        expect(run(MINIMAL).ok).toBe(true);
    });

    it("rejects every other version while the major is 0 (§7.1)", () => {
        for (const v of ["0.1", "0.3", "1.0", "0.2.0", "", "x"]) {
            expect(errorOf(run(`{"format":{"version":"${v}"}}`)), v).toBe(
                "UNSUPPORTED_FORMAT_VERSION",
            );
        }
    });

    it("rejects a malformed format object as BAD_MANIFEST, not as a version", () => {
        expect(errorOf(run("{}"))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{}}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":{"version":2}}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":"0.2"}'))).toBe("BAD_MANIFEST");
        expect(errorOf(run('{"format":null}'))).toBe("BAD_MANIFEST");
    });

    it("carries the optional generator through", () => {
        const r = run('{"format":{"version":"0.2","generator":"gen 1.0"}}');
        expect(r.ok && r.value.generator).toBe("gen 1.0");
        const bare = run(MINIMAL);
        expect(bare.ok && bare.value.generator).toBeUndefined();
    });

    it("rejects a generator that is not a string", () => {
        expect(errorOf(run('{"format":{"version":"0.2","generator":1}}'))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects an unimplemented extension in extensionsRequired", () => {
        const r = run(
            '{"format":{"version":"0.2"},"extensionsUsed":["WKNF_multiview"],"extensionsRequired":["WKNF_multiview"]}',
        );
        expect(errorOf(r)).toBe("UNSUPPORTED_EXTENSION");
    });

    it("prunes an unimplemented extension used but not required, and warns", () => {
        const r = run('{"format":{"version":"0.2"},"extensionsUsed":["WKNF_multiview"]}');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.extensionsUsed).toEqual([]);
        expect(r.warnings.map((w) => w.code)).toEqual(["UNKNOWN_EXTENSION_IGNORED"]);
        expect(r.warnings[0]!.detail).toContain("WKNF_multiview");
    });

    it("treats absent extension arrays as empty", () => {
        const r = run(MINIMAL);
        expect(r.ok && r.value.extensionsUsed).toEqual([]);
        expect(r.ok && r.value.extensionsRequired).toEqual([]);
        expect(r.ok && r.warnings).toEqual([]);
    });

    it("rejects extension arrays that are not arrays of strings", () => {
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsUsed":"x"}'))).toBe(
            "BAD_MANIFEST",
        );
        expect(errorOf(run('{"format":{"version":"0.2"},"extensionsRequired":[1]}'))).toBe(
            "BAD_MANIFEST",
        );
    });

    it("rejects a required extension that is not also used (§5.1)", () => {
        expect(
            errorOf(
                run(
                    '{"format":{"version":"0.2"},"extensionsRequired":["WKNF_x"],"extensionsUsed":[]}',
                ),
            ),
        ).toBe("BAD_MANIFEST");
    });

    it("checks the version before the extensions", () => {
        // A 0.3 file with an unimplemented required extension is a version
        // problem: §6.1 step 5 reads the version first.
        expect(
            errorOf(
                run(
                    '{"format":{"version":"0.3"},"extensionsUsed":["WKNF_x"],"extensionsRequired":["WKNF_x"]}',
                ),
            ),
        ).toBe("UNSUPPORTED_FORMAT_VERSION");
    });

    it("hands the parsed document back for the schema pass", () => {
        const r = run('{"format":{"version":"0.2"},"meta":{"widthPx":8}}');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.doc["meta"]).toEqual({ widthPx: 8 });
    });
});
