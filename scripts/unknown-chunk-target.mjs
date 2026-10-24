/*
 *  unknown-chunk-target.mjs
 *  webarkit
 *
 *  This file is part of webarkit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * The tuning target the bench page's checks load (#120):
 * `examples/targets/tuning/unknown-chunk.wnft`, which is
 * `examples/targets/pinball.wnft` with one more chunk after its `BIN\0`, of a
 * type no reader knows (`XTRA`). A reader skips such a chunk whole and warns
 * `UNKNOWN_CHUNK_SKIPPED` (spec §4.2, §6.1), so the target is pinball's, and
 * decoding it gives a warning. That warning is what the page checks look for
 * on the worker path (#95, Task 1: the worker dropped the decoder's warnings).
 *
 * `examples/targets/tuning/` is git-ignored: the file is written here each
 * time, never committed. `pinball.wnft` is read, never written, and its
 * SHA-256 is checked unchanged after the write. The chunk is framed with the
 * codec's own CRC-32 and padding rule, and the result is decoded with the
 * codec's own reader before anything uses it. Needs `npm run build` first:
 * the codec is read from `packages/nft-tracker/dist/`.
 *
 * Usage: `node scripts/unknown-chunk-target.mjs`. `scripts/page-check.mjs`
 * calls `writeUnknownChunkTarget` itself. Exit status: 0 when the file is
 * written and reads as it must, 1 otherwise.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "examples/targets/pinball.wnft");
export const UNKNOWN_CHUNK_TARGET = join(ROOT, "examples/targets/tuning/unknown-chunk.wnft");
/** What the page's `?targetFile=` names it. */
export const UNKNOWN_CHUNK_TARGET_PARAM = "tuning/unknown-chunk.wnft";
const CHUNK_TYPE = "XTRA";
const CHUNK_DATA = new TextEncoder().encode(
    "bench-nft.html's page checks: a chunk no reader knows",
);
/** pinball.wnft's patch count, as #120 records it for this target. */
const PATCHES = 48;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function codec() {
    const dist = join(ROOT, "packages/nft-tracker/dist/target/format");
    const url = (file) => pathToFileURL(join(dist, file)).href;
    try {
        const { decode } = await import(url("decode.js"));
        const { align8, CHUNK_HEADER_SIZE } = await import(url("container.js"));
        const { crc32 } = await import(url("crc32.js"));
        return { decode, align8, CHUNK_HEADER_SIZE, crc32 };
    } catch (e) {
        throw new Error(`the .wnft codec is not built (${e.message}): run \`npm run build\` first`);
    }
}

/**
 * `source` with `type`/`data` framed as one more chunk at its end, and the
 * header's `total_length` grown to match (§4.1, §4.2): length, type, the
 * data's CRC-32, a reserved 0, then the data padded with zeros to 8 bytes.
 */
function appendChunk(source, type, data, { align8, CHUNK_HEADER_SIZE, crc32 }) {
    const at = source.length;
    const out = new Uint8Array(at + CHUNK_HEADER_SIZE + align8(data.length));
    out.set(source);
    const view = new DataView(out.buffer);
    view.setUint32(8, out.length, true);
    view.setUint32(at, data.length, true);
    for (let i = 0; i < 4; i += 1) out[at + 4 + i] = type.charCodeAt(i);
    view.setUint32(at + 8, crc32(data), true);
    view.setUint32(at + 12, 0, true);
    out.set(data, at + CHUNK_HEADER_SIZE);
    return out;
}

/** What `bytes` must decode to: pinball's target, with one warning for the chunk. */
function checkDecoded(bytes, decode) {
    const decoded = decode(bytes);
    if (!decoded.ok) throw new Error(`it does not decode: ${decoded.error} — ${decoded.detail}`);
    const warnings = decoded.warnings.map((w) => `${w.code} (${w.detail})`);
    const expected = `UNKNOWN_CHUNK_SKIPPED (chunk type "${CHUNK_TYPE}")`;
    if (warnings.length !== 1 || warnings[0] !== expected) {
        throw new Error(`it decodes with warnings [${warnings.join(", ")}], not [${expected}]`);
    }
    const patches = decoded.target.patches?.count ?? null;
    if (patches !== PATCHES) throw new Error(`it decodes with ${patches} patches, not ${PATCHES}`);
    return { warning: warnings[0], patches };
}

/**
 * Writes the target, then reads it back and checks it, and checks that
 * `pinball.wnft` was left as it was. Returns what it checked; throws, naming
 * what is wrong, otherwise.
 */
export async function writeUnknownChunkTarget() {
    const c = await codec();
    const source = new Uint8Array(readFileSync(SOURCE));
    const sourceSha = sha256(source);
    const clean = c.decode(source);
    if (!clean.ok || clean.warnings.length !== 0) {
        throw new Error(
            "examples/targets/pinball.wnft does not decode cleanly, so it is no base for this target",
        );
    }
    const bytes = appendChunk(source, CHUNK_TYPE, CHUNK_DATA, c);
    mkdirSync(dirname(UNKNOWN_CHUNK_TARGET), { recursive: true });
    writeFileSync(UNKNOWN_CHUNK_TARGET, bytes);
    const read = checkDecoded(new Uint8Array(readFileSync(UNKNOWN_CHUNK_TARGET)), c.decode);
    const after = sha256(readFileSync(SOURCE));
    if (after !== sourceSha)
        throw new Error(`examples/targets/pinball.wnft changed: ${sourceSha} → ${after}`);
    return { ...read, sha256: sha256(bytes), bytes: bytes.length, pinballSha256: sourceSha };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    try {
        const r = await writeUnknownChunkTarget();
        console.log(
            `examples/targets/${UNKNOWN_CHUNK_TARGET_PARAM}: ${r.bytes} bytes, sha256 ${r.sha256}; decodes with ${r.warning} and ${r.patches} patches; pinball.wnft unchanged (${r.pinballSha256})`,
        );
    } catch (e) {
        console.error(`unknown-chunk-target: ${e.message}`);
        process.exit(1);
    }
}
