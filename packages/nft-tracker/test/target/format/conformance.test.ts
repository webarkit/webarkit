/*
 *  conformance.test.ts
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
 * §8.2 and §8.3, against the committed corpus.
 *
 * Each block names the item it implements, so coverage can be checked without
 * re-reading the specification.
 *
 * **This suite needs `dist/` to be current**, because the fixture generator
 * imports the built output — that is what lets one script serve both `npm run
 * fixtures` and the determinism check below. `npm run build` before `npm test`
 * (AGENTS.md), which is also CI's order.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { crc32 } from "../../../src/target/format/crc32.js";
import { decode } from "../../../src/target/format/decode.js";
import { encode } from "../../../src/target/format/encode.js";
import type { DecodeOptions } from "../../../src/target/format/limits.js";
// @ts-expect-error — the generator is a plain .mjs script with no type
// declarations. It is imported rather than duplicated so that "the corpus is
// what its generator produces" is a real check and not a second generator.
import { buildFixtures } from "../../../scripts/generate-fixtures.mjs";
import { CORPUS_ROOT, FIXTURES_DIR } from "./fixtures-dir.js";

const read = (rel: string): Uint8Array =>
    new Uint8Array(readFileSync(join(FIXTURES_DIR, rel)));

interface Expectations {
    readonly formatVersion: string;
    readonly valid: readonly { readonly file: string; readonly decoded?: string }[];
    readonly invalid: readonly {
        readonly file: string;
        readonly error: string;
        readonly limits?: DecodeOptions["limits"];
    }[];
    readonly warnings: readonly {
        readonly file: string;
        readonly warnings: readonly string[];
    }[];
    readonly noncanonical: readonly {
        readonly file: string;
        readonly canonical: string;
    }[];
}

const expectations = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "expectations.json"), "utf8"),
) as Expectations;

/** Typed arrays become plain arrays, so comparisons are about values. */
const plain = (value: unknown): unknown =>
    JSON.parse(
        JSON.stringify(value, (_key, v: unknown) =>
            ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v,
        ),
    );

const bytesOf = (r: ReturnType<typeof encode>): Uint8Array => {
    if (!r.ok) throw new Error(`encode failed: ${r.error} at ${r.detail}`);
    return r.bytes;
};

describe("§8.2 item 1 — decode(valid/minimal.wnft) equals valid/minimal.json", () => {
    it("matches, value for value", () => {
        const r = decode(read("valid/minimal.wnft"));
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        if (!r.ok) return;
        const want = JSON.parse(
            readFileSync(join(FIXTURES_DIR, "valid/minimal.json"), "utf8"),
        ) as unknown;
        expect(plain(r.target)).toEqual(want);
    });
});

describe("§8.2 item 2 — same-implementation round trip", () => {
    it.each(expectations.valid.map((e) => e.file))(
        "encode(decode(%s)) is byte-identical",
        (file) => {
            const original = read(file);
            const r = decode(original);
            expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
            if (!r.ok) return;
            expect(r.warnings).toEqual([]);
            expect(bytesOf(encode(r.target))).toEqual(original);
        },
    );
});

describe("§8.2 item 3 — non-canonical inputs", () => {
    it.each(expectations.noncanonical.map((e) => [e.file, e.canonical]))(
        "%s decodes like %s and re-encodes to it",
        (file, canonical) => {
            const r = decode(read(file));
            const c = decode(read(canonical));
            expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
            expect(c.ok).toBe(true);
            if (!r.ok || !c.ok) return;
            // Same values...
            expect(plain(r.target)).toEqual(plain(c.target));
            // ...and re-encoding yields the counterpart, not the input. This
            // is what makes §7.3's "keeps only what it understands" testable
            // rather than a disclaimer.
            expect(bytesOf(encode(r.target))).toEqual(read(canonical));
        },
    );
});

describe("§8.2 item 4 — cross-implementation conformance", () => {
    // Not runnable: crates/wnft-format does not exist yet. When it does, this
    // compares BIN chunks byte for byte and manifests after parsing (§7.3
    // leaves number formatting to each language, open question Q8). The corpus
    // committed here is what it will be compared against, so the gap is a
    // missing peer, not a missing fixture.
    it.skip("BIN chunks byte-identical and manifests equal after parsing", () => {
        expect.unreachable("needs the Rust codec");
    });
});

describe("§8.2 item 5 — every invalid file yields exactly its error code", () => {
    it.each(expectations.invalid.map((e) => [e.file, e.error] as const))(
        "%s -> %s",
        (file, error) => {
            const entry = expectations.invalid.find((e) => e.file === file)!;
            const options =
                entry.limits === undefined ? undefined : { limits: entry.limits };
            const r = decode(read(file), options);
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.error).toBe(error);
            expect(r.detail.length).toBeGreaterThan(0);
        },
    );

    it("never throws on any invalid fixture", () => {
        for (const e of expectations.invalid) {
            expect(() => decode(read(e.file)), e.file).not.toThrow();
        }
    });
});

describe("§8.2 item 5 — every warning file decodes with exactly its warnings", () => {
    it.each(expectations.warnings.map((e) => e.file))("%s", (file) => {
        const entry = expectations.warnings.find((e) => e.file === file)!;
        const r = decode(read(file));
        expect(r.ok, r.ok ? "" : `${r.error}: ${r.detail}`).toBe(true);
        if (!r.ok) return;
        expect([...r.warnings.map((w) => w.code)].sort()).toEqual(
            [...entry.warnings].sort(),
        );
    });
});

describe("§8.2 item 6 — the CRC-32 test vector", () => {
    it('"123456789" gives 0xCBF43926', () => {
        expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    });
});

describe("§8.2 item 7 — the writer rejects what the reader would", () => {
    // The rule lives in validate-target.test.ts; item 7 is phrased in terms of
    // encode(), so it is asserted here through the public entry point too.
    const base = () => {
        const r = decode(read("valid/minimal.wnft"));
        if (!r.ok) throw new Error("valid/minimal.wnft does not decode");
        return r.target;
    };

    it.each([
        ["an unpaired surrogate", String.fromCharCode(0xd800)],
        ["the integer 2^53", 9007199254740992],
        ["a literal rounding to infinity", Number.POSITIVE_INFINITY],
        ["a Unicode noncharacter", String.fromCharCode(0xffff)],
        ["NaN, which JSON.stringify would coerce to null", Number.NaN],
    ])("refuses %s in params, and emits no bytes", (_what, value) => {
        const target = base();
        const r = encode({
            ...target,
            descriptorSets: [
                { ...target.descriptorSets[0]!, params: { seed: value } },
            ],
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toBe("INVALID_TARGET");
        expect(r.detail).toBe("descriptorSets[0].params.seed");
        expect("bytes" in r).toBe(false);
    });

    it("accepts 2^53 − 1, the boundary that must encode", () => {
        const target = base();
        const r = encode({
            ...target,
            descriptorSets: [
                {
                    ...target.descriptorSets[0]!,
                    params: { seed: 9007199254740991 },
                },
            ],
        });
        expect(r.ok).toBe(true);
    });
});

describe("§8.1 — the corpus is what its generator produces", () => {
    it("reproduces every committed file byte for byte", () => {
        const built = buildFixtures() as Map<string, Uint8Array>;
        expect(built.size).toBeGreaterThan(0);
        for (const [path, bytes] of built) {
            expect(new Uint8Array(readFileSync(join(FIXTURES_DIR, path))), path).toEqual(
                bytes,
            );
        }
    });

    it("commits nothing the generator does not produce", () => {
        const built = buildFixtures() as Map<string, Uint8Array>;
        const onDisk: string[] = [];
        const walk = (dir: string, prefix: string): void => {
            for (const name of readdirSync(join(FIXTURES_DIR, dir))) {
                const rel = prefix === "" ? name : `${prefix}/${name}`;
                if (statSync(join(FIXTURES_DIR, rel)).isDirectory()) walk(rel, rel);
                else onDisk.push(rel);
            }
        };
        walk("", "");
        expect(onDisk.sort()).toEqual([...built.keys()].sort());
    });
});

describe("§8.3 — evolution", () => {
    it("rejects a file declaring format 0.3", () => {
        const r = decode(read("invalid/unsupported-format-version.wnft"));
        expect(!r.ok && r.error).toBe("UNSUPPORTED_FORMAT_VERSION");
    });

    it("ignores an unknown top-level key and does not re-emit it", () => {
        const r = decode(read("noncanonical/unknown-top-level-key.wnft"));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const text = new TextDecoder().decode(bytesOf(encode(r.target)));
        expect(text).not.toContain("futureKey");
    });

    it("ignores an unknown key inside a descriptor set and does not re-emit it", () => {
        const r = decode(read("noncanonical/unknown-extension-payload.wnft"));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const text = new TextDecoder().decode(bytesOf(encode(r.target)));
        expect(text).not.toContain("WKNF_future");
        expect(text).not.toContain("extensions");
    });

    it("preserves params and info unchanged — they are data, not unknown keys", () => {
        const r = decode(read("valid/params-numeric-keys.wnft"));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.target.descriptorSets[0]!.params).toEqual({
            9: 1,
            10: 2,
            a: 3,
            b: 4,
        });
        expect(r.target.info).toEqual({
            name: "fixture",
            compiler: { levels: 2, seed: 42 },
        });
        // And they survive a round trip.
        const again = decode(bytesOf(encode(r.target)));
        expect(again.ok && again.target.descriptorSets[0]!.params).toEqual(
            r.target.descriptorSets[0]!.params,
        );
        expect(again.ok && again.target.info).toEqual(r.target.info);
    });

    it("rejects an unknown extension in extensionsRequired", () => {
        const r = decode(read("invalid/unsupported-extension.wnft"));
        expect(!r.ok && r.error).toBe("UNSUPPORTED_EXTENSION");
    });

    it("ignores the same extension when it is only used", () => {
        const r = decode(read("warnings/unknown-extension.wnft"));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.target.extensionsUsed).toEqual([]);
        expect(r.warnings.map((w) => w.code)).toEqual(["UNKNOWN_EXTENSION_IGNORED"]);
    });

    it("keeps the other sets usable when one is of an unknown family", () => {
        const r = decode(read("warnings/unknown-descriptor-kind.wnft"));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Three sets in the file; the unknown kind is preserved, not dropped.
        expect(r.target.descriptorSets).toHaveLength(3);
        expect(r.target.descriptorSets.some((s) => s.kind === "orb")).toBe(true);
    });

    it("drops a set with an unknown elementType, leaving the others", () => {
        const r = decode(read("warnings/unknown-element-type.wnft"));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.target.descriptorSets).toHaveLength(2);
    });

    it("rejects M ≠ N without WKNF_multiview", () => {
        const r = decode(read("invalid/set-levelstart-not-m.wnft"));
        expect(!r.ok && r.error).toBe("INCONSISTENT_DATA");
    });

    it("reads or rejects every frozen version's corpus, never misreads it", () => {
        // The backward-compatibility corpus. Today only 0.2 exists; written as
        // a loop so a future frozen directory is covered the day it lands.
        const versions = readdirSync(CORPUS_ROOT).filter((name) =>
            statSync(join(CORPUS_ROOT, name)).isDirectory(),
        );
        expect(versions).toContain("0.2");
        for (const version of versions) {
            const dir = join(CORPUS_ROOT, version);
            const walk = (sub: string): void => {
                for (const name of readdirSync(join(dir, sub))) {
                    const rel = sub === "" ? name : `${sub}/${name}`;
                    if (statSync(join(dir, rel)).isDirectory()) {
                        walk(rel);
                        continue;
                    }
                    if (!rel.endsWith(".wnft")) continue;
                    const bytes = new Uint8Array(readFileSync(join(dir, rel)));
                    const r = decode(bytes);
                    // Either it decodes, or it fails with an explicit code.
                    // What it must never do is throw, or half-read.
                    expect(() => decode(bytes), `${version}/${rel}`).not.toThrow();
                    if (!r.ok) expect(r.error.length, `${version}/${rel}`).toBeGreaterThan(0);
                }
            };
            walk("");
        }
    });
});
