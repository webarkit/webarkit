/*
 *  generate-fixtures.mjs
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
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * The `.wnft` 0.3 conformance corpus (§8.1).
 *
 * `fixtures/nft-target/0.2/` is **not** this script's output any more. It is
 * the frozen corpus of a released version (§8.3), and this script must never
 * write to it again: regenerating it would silently rewrite the files a
 * backward-compatibility test exists to hold still.
 *
 * Fixtures are "produced by a committed, deterministic generator script and
 * never edited by hand". Two halves, and the split is the point:
 *
 * - `valid/` files go through `encode`, so they are canonical by construction
 *   — which is what makes §8.2 item 2's byte-identical round trip meaningful.
 * - everything else is framed directly, because they are files the canonical
 *   writer refuses to produce. A generator that could only call `encode` could
 *   not build a single `invalid/` case.
 *
 * Determinism: no clock, no randomness, no environment. Every value is
 * computed from an index, so the corpus reproduces byte for byte — which
 * `conformance.test.ts` checks by regenerating it.
 *
 * Imports the built `dist/`, so `npm run build` runs first; that is why the
 * `fixtures` script chains the two.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContainer, BIN_TYPE } from "../dist/target/format/container.js";
import { crc32 } from "../dist/target/format/crc32.js";
import { decode } from "../dist/target/format/decode.js";
import { encode } from "../dist/target/format/encode.js";
import { SUPPORTED_FORMAT_VERSION } from "../dist/target/format/known.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `fixtures/nft-target/`, one directory per format version. */
const CORPUS_ROOT = join(HERE, "..", "..", "..", "fixtures", "nft-target");

/**
 * Where this run writes: the directory named for the version the codec
 * actually supports, never a literal.
 *
 * This is load-bearing, not tidiness. `main` clears this directory before
 * writing, so that a fixture retired from the generator does not survive as a
 * stale file the suites keep reading. A hand-written version here would mean
 * that the one time someone bumps `SUPPORTED_FORMAT_VERSION` and forgets this
 * line, the generator deletes and rewrites the **frozen** corpus of the
 * previous version — the one §8.3 requires every future reader to keep intact
 * and reject explicitly. Derived, a bump writes a new directory and the old
 * one is never opened.
 */
const OUT = join(CORPUS_ROOT, SUPPORTED_FORMAT_VERSION);

/**
 * The version the `unsupported-format-version` fixture declares: the next
 * minor after the supported one, for the same reason `OUT` is derived. Left as
 * a literal, it would silently become *the* supported version at some future
 * bump, and the fixture would assert that a file this build reads perfectly is
 * rejected.
 */
const UNSUPPORTED_FORMAT_VERSION = (() => {
    const [major, minor] = SUPPORTED_FORMAT_VERSION.split(".");
    return `${major}.${Number(minor) + 1}`;
})();

/**
 * Refuse to delete anything that is not this version's own corpus directory.
 *
 * The guard is cheap and the thing it guards against is unrecoverable: a
 * malformed or empty version string would make `join` above resolve somewhere
 * else entirely, and `rmSync(..., { recursive: true })` does not ask twice.
 */
function assertSafeToClear() {
    if (!/^\d+\.\d+$/.test(SUPPORTED_FORMAT_VERSION)) {
        throw new Error(
            `SUPPORTED_FORMAT_VERSION is ${JSON.stringify(SUPPORTED_FORMAT_VERSION)}, ` +
                `which is not a "MAJOR.MINOR" version; refusing to delete anything`,
        );
    }
    const within = relative(resolve(CORPUS_ROOT), resolve(OUT));
    if (within !== SUPPORTED_FORMAT_VERSION) {
        throw new Error(
            `refusing to clear ${OUT}: it is not fixtures/nft-target/${SUPPORTED_FORMAT_VERSION}/`,
        );
    }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A single backslash, built so no escape in this file can be mis-read. */
const BS = String.fromCharCode(92);
/** The text of a `\uXXXX` escape, for manifests JSON.stringify cannot write. */
const uEsc = (hex) => `${BS}u${hex}`;

// --------------------------------------------------------------------------
// The base target
// --------------------------------------------------------------------------

/**
 * 64 x 48, two levels, 20 keypoints, one 256-bit ORB set, four 8 x 8 patches.
 *
 * Every value is computed from its index. The keypoints sit on a coarse
 * lattice so their coordinates are exact in f32 and legible in minimal.json.
 */
function baseTarget() {
    const N = 20; // 12 on level 0, 8 on level 1
    const levelStart = Uint32Array.from([0, 12, N]);
    const bytesPerDescriptor = 32;
    const P = 8;
    const Q = 4;

    return {
        formatVersion: SUPPORTED_FORMAT_VERSION,
        generator: "@webarkit/nft-tracker fixtures",
        extensionsUsed: [],
        extensionsRequired: [],
        meta: { widthPx: 64, heightPx: 48, physicalSizeMm: [128, 96] },
        pyramid: {
            scaleStep: 2,
            levelSizes: [
                [64, 48],
                [32, 24],
            ],
        },
        keypoints: {
            count: N,
            detector: { kind: "fast", params: { threshold: 20 } },
            levelStart,
            x: Float32Array.from({ length: N }, (_, i) => 4 + (i % 6) * 9),
            y: Float32Array.from({ length: N }, (_, i) => 4 + Math.floor(i / 6) * 9),
            angle: Float32Array.from({ length: N }, (_, i) => i * 0.25),
            score: Float32Array.from({ length: N }, (_, i) => 100 - i),
            level: Uint8Array.from({ length: N }, (_, i) => (i < 12 ? 0 : 1)),
        },
        descriptorSets: [
            {
                kind: "orb",
                norm: "hamming",
                elementType: "bits",
                dimensions: 256,
                bytesPerDescriptor,
                producer: "jsfeatnext",
                params: {},
                count: N,
                levelStart: levelStart.slice(),
                kpIndex: Uint32Array.from({ length: N }, (_, i) => i),
                data: Uint8Array.from(
                    { length: N * bytesPerDescriptor },
                    (_, i) => (i * 37 + 11) & 0xff,
                ),
            },
        ],
        patches: {
            patchSize: P,
            count: Q,
            // Level 0 is 64 x 48, so the largest patch here is at (24, 12):
            // 24 + 8 <= 64 and 12 + 8 <= 48.
            score: Float32Array.from({ length: Q }, (_, q) => 50 - q),
            left: Uint16Array.from({ length: Q }, (_, q) => q * 8),
            top: Uint16Array.from({ length: Q }, (_, q) => q * 4),
            level: new Uint8Array(Q),
            pixels: Uint8Array.from({ length: Q * P * P }, (_, i) => (i * 7) & 0xff),
        },
        info: { name: "fixture", compiler: { levels: 2, seed: 42 } },
    };
}

/** `encode`, refusing to skip a fixture it cannot produce. */
function write(target, what) {
    const r = encode(target);
    if (!r.ok) throw new Error(`${what}: encode returned ${r.error} at ${r.detail}`);
    return r.bytes;
}

// --------------------------------------------------------------------------
// Framing helpers, for the files encode() refuses to produce
// --------------------------------------------------------------------------

/** Split an encoded file into its manifest text and its BIN payload. */
function split(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = dv.getUint32(16, true);
    const manifestText = dec.decode(bytes.subarray(32, 32 + jsonLength));
    const jsonPadded = (jsonLength + 7) & ~7;
    const binHeader = 32 + jsonPadded;
    const binLength = dv.getUint32(binHeader, true);
    const binStart = binHeader + 16;
    return {
        manifestText,
        bin: bytes.slice(binStart, binStart + binLength),
    };
}

/** Frame a manifest **text** and a BIN payload into a file. */
const fileFrom = (manifestText, bin) => buildContainer(enc.encode(manifestText), bin);

/**
 * Frame arbitrary chunks, in the given order.
 *
 * `buildContainer` only ever writes JSON then BIN, which is the whole point of
 * a canonical writer — so the container-level invalid cases need this instead.
 */
function frameChunks(chunks) {
    const pad = (n) => (n + 7) & ~7;
    let total = 16;
    for (const c of chunks) total += 16 + pad(c.data.length);

    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    const ascii = (text, at) => {
        for (let i = 0; i < 4; i += 1) out[at + i] = text.charCodeAt(i) & 0xff;
    };

    ascii("WKNF", 0);
    dv.setUint16(4, 1, true);
    dv.setUint16(6, 0, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, 0, true);

    let at = 16;
    for (const c of chunks) {
        dv.setUint32(at, c.data.length, true);
        ascii(c.type, at + 4);
        dv.setUint32(at + 8, crc32(c.data), true);
        dv.setUint32(at + 12, 0, true);
        out.set(c.data, at + 16);
        if (c.type === "JSON") {
            out.fill(0x20, at + 16 + c.data.length, at + 16 + pad(c.data.length));
        }
        at += 16 + pad(c.data.length);
    }
    return out;
}

/** Frame a manifest **object**, through JSON.stringify — deliberately not canonical. */
const fileOf = (manifest, bin) => fileFrom(JSON.stringify(manifest), bin);

/** A deep copy of a manifest object, so each case mutates its own. */
const clone = (manifest) => JSON.parse(JSON.stringify(manifest));

// --------------------------------------------------------------------------
// The corpus
// --------------------------------------------------------------------------

export function buildFixtures() {
    const files = new Map();
    const expectations = {
        formatVersion: SUPPORTED_FORMAT_VERSION,
        valid: [],
        invalid: [],
        warnings: [],
        noncanonical: [],
    };

    const addValid = (name, target, extra = {}) => {
        const path = `valid/${name}.wnft`;
        files.set(path, write(target, path));
        expectations.valid.push({ file: path, ...extra });
        return path;
    };
    const addInvalid = (name, bytes, error, limits) => {
        const path = `invalid/${name}.wnft`;
        files.set(path, bytes);
        expectations.invalid.push({
            file: path,
            error,
            ...(limits === undefined ? {} : { limits }),
        });
    };
    const addWarning = (name, bytes, warnings) => {
        const path = `warnings/${name}.wnft`;
        files.set(path, bytes);
        expectations.warnings.push({ file: path, warnings });
    };
    const addNoncanonical = (name, bytes, canonical) => {
        const path = `noncanonical/${name}.wnft`;
        files.set(path, bytes);
        expectations.noncanonical.push({ file: path, canonical });
    };

    // --- valid/ -----------------------------------------------------------
    const base = baseTarget();
    addValid("minimal", base, { decoded: "valid/minimal.json" });

    {
        // Three sets: orb, teblid, and a second orb from another producer —
        // the "same kind, different bits" case of §5.6.
        const t = baseTarget();
        const orb = t.descriptorSets[0];
        t.descriptorSets = [
            orb,
            { ...orb, kind: "teblid", dimensions: 256, bytesPerDescriptor: 32 },
            { ...orb, producer: "purecv" },
        ];
        addValid("several-sets", t);
    }
    {
        const t = baseTarget();
        t.pyramid.levelSizes = [[64, 48]];
        t.keypoints.levelStart = Uint32Array.from([0, 20]);
        t.keypoints.level = new Uint8Array(20);
        t.descriptorSets[0].levelStart = Uint32Array.from([0, 20]);
        addValid("single-level", t);
    }
    {
        // N = 0: every bulk accessor has count 0 while levelStart keeps L + 1.
        const t = baseTarget();
        t.keypoints.count = 0;
        t.keypoints.levelStart = Uint32Array.from([0, 0, 0]);
        t.keypoints.x = new Float32Array(0);
        t.keypoints.y = new Float32Array(0);
        t.keypoints.angle = new Float32Array(0);
        t.keypoints.score = new Float32Array(0);
        t.keypoints.level = new Uint8Array(0);
        t.descriptorSets[0].count = 0;
        t.descriptorSets[0].levelStart = Uint32Array.from([0, 0, 0]);
        t.descriptorSets[0].kpIndex = new Uint32Array(0);
        t.descriptorSets[0].data = new Uint8Array(0);
        delete t.patches;
        addValid("zero-keypoints", t);
    }
    {
        // Detection-only, milestone M1.
        const t = baseTarget();
        delete t.patches;
        addValid("no-patches", t);
    }
    {
        const t = baseTarget();
        t.referenceImage = {
            level: 0,
            width: 64,
            height: 48,
            pixels: Uint8Array.from({ length: 64 * 48 }, (_, i) => (i * 13) & 0xff),
        };
        addValid("reference-image", t);
    }
    {
        // 2^53 − 1 must decode: it catches an off-by-one in check (c) of §5.
        const t = baseTarget();
        t.descriptorSets[0] = {
            ...t.descriptorSets[0],
            params: { seed: 9007199254740991 },
        };
        addValid("boundary-max-safe-integer", t);
    }
    const numericKeysPath = (() => {
        // The counterpart for the unsorted-params non-canonical case.
        const t = baseTarget();
        t.descriptorSets[0] = {
            ...t.descriptorSets[0],
            params: { 9: 1, 10: 2, a: 3, b: 4 },
        };
        return addValid("params-numeric-keys", t);
    })();

    const minimal = files.get("valid/minimal.wnft");
    const { manifestText: baseText, bin: baseBin } = split(minimal);
    const baseManifest = JSON.parse(baseText);

    // valid/minimal.json — the decoded values, for §8.2 item 1.
    {
        const r = decode(minimal);
        if (!r.ok) throw new Error(`valid/minimal.wnft does not decode: ${r.error}`);
        files.set(
            "valid/minimal.json",
            enc.encode(`${JSON.stringify(plain(r.target), null, 2)}\n`),
        );
    }

    // --- invalid/: one per error code of §6.2 -----------------------------
    {
        const bytes = minimal.slice();
        bytes.set(enc.encode("GLTF"), 0);
        addInvalid("bad-magic", bytes, "BAD_MAGIC");
    }
    {
        const bytes = minimal.slice();
        new DataView(bytes.buffer).setUint16(4, 2, true);
        addInvalid("unsupported-container", bytes, "UNSUPPORTED_CONTAINER");
    }
    {
        const bytes = minimal.slice();
        new DataView(bytes.buffer).setUint32(8, bytes.length + 8, true);
        addInvalid("bad-container-total-length", bytes, "BAD_CONTAINER");
    }
    {
        const bytes = minimal.slice();
        new DataView(bytes.buffer).setUint32(12, 1, true); // reserved flags
        addInvalid("bad-container-flags", bytes, "BAD_CONTAINER");
    }
    addInvalid(
        "bad-container-json-not-first",
        frameChunks([
            { type: BIN_TYPE, data: baseBin },
            { type: "JSON", data: enc.encode(baseText) },
        ]),
        "BAD_CONTAINER",
    );
    {
        // Flip a bit inside the BIN data; the stored CRC no longer matches.
        const bytes = minimal.slice();
        const jsonPadded = (enc.encode(baseText).length + 7) & ~7;
        bytes[32 + jsonPadded + 16] ^= 0x01;
        addInvalid("checksum-mismatch", bytes, "CHECKSUM_MISMATCH");
    }
    {
        // Small on disk; decoded with the manifest limit lowered (§6.4 makes
        // the limits configurable, so this exercises the real path).
        addInvalid("manifest-too-large", minimal, "MANIFEST_TOO_LARGE", {
            maxManifestBytes: 32,
        });
    }
    addInvalid("bad-manifest-not-json", fileFrom("not json", baseBin), "BAD_MANIFEST");
    {
        const text = enc.encode(baseText);
        text[text.length - 2] = 0xff; // not valid UTF-8
        addInvalid("bad-manifest-not-utf8", buildContainer(text, baseBin), "BAD_MANIFEST");
    }
    {
        const m = clone(baseManifest);
        m.format.version = UNSUPPORTED_FORMAT_VERSION;
        addInvalid("unsupported-format-version", fileOf(m, baseBin), "UNSUPPORTED_FORMAT_VERSION");
    }
    {
        const m = clone(baseManifest);
        m.extensionsUsed = ["WKNF_multiview"];
        m.extensionsRequired = ["WKNF_multiview"];
        addInvalid("unsupported-extension", fileOf(m, baseBin), "UNSUPPORTED_EXTENSION");
    }
    {
        const m = clone(baseManifest);
        m.accessors[0].offset = 1 << 30; // far past the chunk
        addInvalid("bad-layout-out-of-bounds", fileOf(m, baseBin), "BAD_LAYOUT");
    }
    addInvalid("limit-exceeded-keypoints", minimal, "LIMIT_EXCEEDED", {
        maxKeypoints: 4,
    });
    {
        const m = clone(baseManifest);
        m.meta.widthPx = 63;
        addInvalid("inconsistent-meta", fileOf(m, baseBin), "INCONSISTENT_DATA");
    }

    // --- invalid/: one per validation rule of §§5.2, 5.4, 5.6, 5.7, 5.8 ---
    const withManifest = (name, error, mutate) => {
        const m = clone(baseManifest);
        mutate(m);
        addInvalid(name, fileOf(m, baseBin), error);
    };

    withManifest("accessor-fractional-offset", "BAD_MANIFEST", (m) => {
        m.accessors[1].offset += 0.5;
    });
    withManifest("accessor-negative-count", "BAD_MANIFEST", (m) => {
        m.accessors[1].count = -1;
    });
    withManifest("accessor-count-above-u32", "BAD_MANIFEST", (m) => {
        m.accessors[1].count = 4294967296;
    });
    withManifest("accessor-ref-not-index", "BAD_MANIFEST", (m) => {
        m.keypoints.x = m.accessors.length;
    });
    withManifest("level-size-zero", "BAD_MANIFEST", (m) => {
        m.pyramid.levelSizes[1][0] = 0;
    });
    withManifest("level-size-above-u16", "BAD_MANIFEST", (m) => {
        m.pyramid.levelSizes[0][0] = 65536;
    });
    withManifest("scale-step-one", "BAD_MANIFEST", (m) => {
        m.pyramid.scaleStep = 1;
    });
    withManifest("level-sizes-growing", "INCONSISTENT_DATA", (m) => {
        m.pyramid.levelSizes[1] = [65, 24];
    });
    withManifest("patch-size-zero", "BAD_MANIFEST", (m) => {
        // §5.7: unlike `dimensions`, `0` is not legal for `patchSize`. The
        // pixels accessor is zeroed along with it — with P = 0 the expected
        // count Q x P x P is 0 — so the domain is the only rule broken and
        // the case cannot be satisfied by a BAD_LAYOUT instead.
        m.patches.patchSize = 0;
        m.accessors[m.patches.pixels].count = 0;
    });
    withManifest("physical-size-absent", "BAD_MANIFEST", (m) => {
        // §5.3: required. Only an explicit null means the size is unknown.
        delete m.meta.physicalSizeMm;
    });
    withManifest("extensions-used-null", "BAD_MANIFEST", (m) => {
        // §5.1 in 0.3: an explicit null is BAD_MANIFEST on every optional
        // key. Through 0.2 these two arrays read it as [].
        m.extensionsUsed = null;
    });
    // levelStart and kpIndex live in the BIN chunk, so these cases edit the
    // payload rather than the manifest text.
    {
        const bin = baseBin.slice();
        const dv = new DataView(bin.buffer);
        const setLevelStart = baseManifest.accessors[baseManifest.descriptorSets[0].levelStart].offset;
        dv.setUint32(setLevelStart, 1, true); // levelStart[0] = 1
        addInvalid("set-levelstart-not-zero", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        const bin = baseBin.slice();
        const dv = new DataView(bin.buffer);
        const setLevelStart = baseManifest.accessors[baseManifest.descriptorSets[0].levelStart].offset;
        dv.setUint32(setLevelStart + 8, 19, true); // levelStart[L] = 19, not M = 20
        addInvalid("set-levelstart-not-m", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        const bin = baseBin.slice();
        const dv = new DataView(bin.buffer);
        const kpIndex = baseManifest.accessors[baseManifest.descriptorSets[0].kpIndex].offset;
        dv.setUint32(kpIndex, 19, true); // row 0 (level 0) -> keypoint 19 (level 1)
        addInvalid("kpindex-wrong-level", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        // A within-level permutation: rows 0 and 1 swapped, both on level 0.
        // M = N, no value repeats and every row still lands on a keypoint of
        // its own level, so every rule but the identity itself holds — which
        // is why §5.6 (rev 4) had to make the identity a reader rule and not
        // only a writer one. Without WKNF_multiview this is INCONSISTENT_DATA.
        const bin = baseBin.slice();
        const dv = new DataView(bin.buffer);
        const kpIndex = baseManifest.accessors[baseManifest.descriptorSets[0].kpIndex].offset;
        dv.setUint32(kpIndex, 1, true);
        dv.setUint32(kpIndex + 4, 0, true);
        addInvalid("kpindex-permutation", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        const bin = baseBin.slice();
        const level = baseManifest.accessors[baseManifest.patches.level].offset;
        bin[level] = 2; // L = 2, so level 2 does not exist
        addInvalid("patch-level-out-of-range", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        const bin = baseBin.slice();
        const dv = new DataView(bin.buffer);
        const left = baseManifest.accessors[baseManifest.patches.left].offset;
        dv.setUint16(left, 60, true); // 60 + 8 > 64
        addInvalid("patch-crosses-right-edge", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        const bin = baseBin.slice();
        const dv = new DataView(bin.buffer);
        const top = baseManifest.accessors[baseManifest.patches.top].offset;
        dv.setUint16(top, 44, true); // 44 + 8 > 48
        addInvalid("patch-crosses-bottom-edge", fileFrom(baseText, bin), "INCONSISTENT_DATA");
    }
    {
        const refImage = files.get("valid/reference-image.wnft");
        const parts = split(refImage);
        const m = JSON.parse(parts.manifestText);
        m.referenceImage.level = 5;
        addInvalid(
            "reference-image-level-out-of-range",
            fileOf(m, parts.bin),
            "INCONSISTENT_DATA",
        );
    }

    // --- invalid/: one per I-JSON check of §5 -----------------------------
    // These are text edits by necessity: JSON.stringify cannot emit a
    // duplicate key, a lone surrogate escape, or a literal that is not a
    // finite double.
    const textCase = (name, mutate) =>
        addInvalid(name, fileFrom(mutate(baseText), baseBin), "BAD_MANIFEST");

    textCase("ijson-duplicate-key", (t) =>
        t.replace('"widthPx":64', '"widthPx":64,"widthPx":64'),
    );
    textCase("ijson-duplicate-key-escaped", (t) =>
        // "widthPx" and "widthPx" are the same name after unescaping;
        // this catches a reader that compared the raw text instead.
        t.replace('"widthPx":64', `"widthPx":64,"${uEsc("0077")}idthPx":64`),
    );
    textCase("ijson-unpaired-surrogate", (t) =>
        t.replace('"name":"fixture"', `"name":"${uEsc("D800")}"`),
    );
    textCase("ijson-integer-2p53", (t) =>
        t.replace('"seed":42', '"seed":9007199254740992'),
    );
    textCase("ijson-infinity", (t) => t.replace('"seed":42', '"seed":1e400'));
    textCase("ijson-raw-noncharacter", (t) =>
        // A raw U+FFFF: strict UTF-8 accepts it, and only check (e) catches it.
        t.replace('"name":"fixture"', `"name":"${String.fromCharCode(0xffff)}"`),
    );
    textCase("ijson-noncharacter-in-name", (t) =>
        t.replace('"name":"fixture"', `"${uEsc("FDD0")}":"fixture"`),
    );

    // --- warnings/ --------------------------------------------------------
    addWarning(
        "unknown-chunk",
        frameChunks([
            { type: "JSON", data: enc.encode(baseText) },
            { type: BIN_TYPE, data: baseBin },
            { type: "XTRA", data: enc.encode("future") },
        ]),
        ["UNKNOWN_CHUNK_SKIPPED"],
    );
    {
        const several = files.get("valid/several-sets.wnft");
        const parts = split(several);
        const m = JSON.parse(parts.manifestText);
        m.descriptorSets[0].kind = "wombat";
        addWarning("unknown-descriptor-kind", fileOf(m, parts.bin), [
            "UNSUPPORTED_DESCRIPTOR_SET",
        ]);
    }
    {
        const several = files.get("valid/several-sets.wnft");
        const parts = split(several);
        const m = JSON.parse(parts.manifestText);
        // "hamming2" appears in §5.6's prose but not in the contract's
        // DescriptorNorm, so this reader does not know it.
        m.descriptorSets[0].norm = "hamming2";
        addWarning("unknown-norm", fileOf(m, parts.bin), ["UNSUPPORTED_DESCRIPTOR_SET"]);
    }
    {
        const several = files.get("valid/several-sets.wnft");
        const parts = split(several);
        const m = JSON.parse(parts.manifestText);
        m.descriptorSets[0].elementType = "f16"; // dropped whole on decode
        addWarning("unknown-element-type", fileOf(m, parts.bin), [
            "UNSUPPORTED_DESCRIPTOR_SET",
        ]);
    }
    {
        const m = clone(baseManifest);
        m.extensionsUsed = ["WKNF_future"]; // used, not required: ignored
        addWarning("unknown-extension", fileOf(m, baseBin), [
            "UNKNOWN_EXTENSION_IGNORED",
        ]);
    }

    // --- noncanonical/ ----------------------------------------------------
    {
        // JSON.stringify of a reversed key order: different bytes, same values.
        const m = clone(baseManifest);
        const reversed = {};
        for (const key of Object.keys(m).reverse()) reversed[key] = m[key];
        addNoncanonical("key-order", fileOf(reversed, baseBin), "valid/minimal.wnft");
    }
    addNoncanonical(
        "whitespace",
        fileFrom(JSON.stringify(baseManifest, null, 2), baseBin),
        "valid/minimal.wnft",
    );
    {
        const m = clone(baseManifest);
        m.descriptorSets[0].params = {}; // the writer omits an empty params
        addNoncanonical(
            "explicit-empty-params",
            fileOf(m, baseBin),
            "valid/minimal.wnft",
        );
    }
    {
        const m = clone(baseManifest);
        m.futureKey = { anything: [1, 2, 3] }; // ignored, and not re-emitted
        addNoncanonical(
            "unknown-top-level-key",
            fileOf(m, baseBin),
            "valid/minimal.wnft",
        );
    }
    {
        const m = clone(baseManifest);
        m.descriptorSets[0].extensions = { WKNF_future: { payload: 1 } };
        addNoncanonical(
            "unknown-extension-payload",
            fileOf(m, baseBin),
            "valid/minimal.wnft",
        );
    }
    {
        // params keys unsorted, including "9" and "10": catches a writer that
        // handed them to JSON.stringify, which emits "9" first (§7.3).
        const parts = split(files.get(numericKeysPath));
        const m = JSON.parse(parts.manifestText);
        m.descriptorSets[0].params = { b: 4, a: 3, 9: 1, 10: 2 };
        addNoncanonical("unsorted-params", fileOf(m, parts.bin), numericKeysPath);
    }
    {
        // descriptorSets in an order the canonical writer would not emit.
        // §5.6 has the reader keep the file's order and §7.3 has the writer
        // sort on encode, so encode(decode(f)) lands back on the sorted
        // counterpart. A reader that sorted on decode, or a writer that did
        // not sort on encode, fails against this pair — and nothing else in
        // the corpus tells those two apart.
        const several = files.get("valid/several-sets.wnft");
        const parts = split(several);
        const m = JSON.parse(parts.manifestText);
        m.descriptorSets = m.descriptorSets.slice().reverse();
        addNoncanonical("unsorted-sets", fileOf(m, parts.bin), "valid/several-sets.wnft");
    }

    files.set(
        "expectations.json",
        enc.encode(`${JSON.stringify(expectations, null, 2)}\n`),
    );
    return files;
}

/** Typed arrays become plain arrays, so the JSON compares values. */
function plain(value) {
    return JSON.parse(
        JSON.stringify(value, (_key, v) =>
            ArrayBuffer.isView(v) ? Array.from(v) : v,
        ),
    );
}

function main() {
    // Built first, deleted second: a generator that throws half way through
    // must not leave the corpus gone. `buildFixtures` is pure — it returns
    // bytes and touches no file — so by the time anything is removed the
    // replacement is already in hand.
    const files = buildFixtures();
    assertSafeToClear();
    rmSync(OUT, { recursive: true, force: true });
    for (const [path, bytes] of files) {
        const full = join(OUT, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, bytes);
    }
    console.log(`wrote ${files.size} fixtures to ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
