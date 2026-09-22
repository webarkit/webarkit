/*
 *  validate_target.test.ts
 *  @webarkit/nft-tracker
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
 * `bin/validate-target.mjs`, driven as a user drives it — spawned, not
 * imported, for the reason `compile_target.test.ts` gives: everything
 * interesting about a CLI lives in the part an import skips.
 *
 * The case that matters most here is the one `decode` alone cannot produce: a
 * file that is **valid and unusable**. `NO_USABLE_DESCRIPTORS` is an outcome of
 * §6.3 selection against a backend's capabilities, not of decoding, so no
 * fixture in the corpus can carry it (§8.1 exempts it by name). The suite
 * builds one instead, out of a corpus fixture, with this package's own codec.
 *
 * **Needs `dist/` to be current**: the script imports the built output.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decode, encode } from "../src/target/format/index.js";
import { FIXTURES_DIR } from "./target/format/fixtures-dir.js";

const SCRIPT = fileURLToPath(
    new URL("../bin/validate-target.mjs", import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PINBALL = join(REPO_ROOT, "examples/targets/pinball.wnft");

interface Run {
    readonly status: number;
    readonly stdout: string;
}

function run(...args: string[]): Run {
    try {
        const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
            cwd: REPO_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { status: 0, stdout };
    } catch (error) {
        const e = error as { status?: number; stdout?: string };
        return { status: e.status ?? -1, stdout: e.stdout ?? "" };
    }
}

let tmp: string;
let unusable: string;

beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "wnft-validate-"));

    // A target that decodes perfectly and that jsfeatNext cannot use: `teblid`
    // is a family the contract defines and this backend does not compute, so
    // §6.3 selects nothing while §5 and §6.1 are entirely satisfied.
    const source = new Uint8Array(
        readFileSync(join(FIXTURES_DIR, "valid/minimal.wnft")),
    );
    const decoded = decode(source);
    if (!decoded.ok) throw new Error(`minimal.wnft must decode: ${decoded.error}`);
    const target = structuredClone(decoded.target);
    (target.descriptorSets[0] as { kind: string }).kind = "teblid";
    const written = encode(target);
    if (!written.ok) throw new Error(`must re-encode: ${written.detail}`);

    unusable = join(tmp, "unusable.wnft");
    writeFileSync(unusable, written.bytes);
});

afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
});

describe("validate-target", () => {
    it("accepts a real target and reports it usable", () => {
        const r = run(PINBALL);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("decode      ok, format");
        expect(r.stdout).toMatch(/usable\s+yes on 'jsfeatnext'/);
        // The width probe must have actually run, not been assumed.
        expect(r.stdout).toContain("probe: 32 B/descriptor, hamming");
    });

    it("reports a decode failure with its §6.2 code, and exits 1", () => {
        const r = run(join(FIXTURES_DIR, "invalid/bad-magic.wnft"));
        expect(r.status).toBe(1);
        expect(r.stdout).toContain("BAD_MAGIC");
    });

    it("calls a valid target unusable when no set fits the backend", () => {
        // The whole reason this tool exists: decode says yes, §6.3 says no.
        const r = run(unusable);
        expect(r.status).toBe(1);
        expect(r.stdout).toContain("decode      ok, format");
        expect(r.stdout).toMatch(/usable\s+NO, on backend 'jsfeatnext'/);
    });

    it("--decode-only passes that same file, because it is valid", () => {
        const r = run("--decode-only", unusable);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("decode      ok, format");
        // Not `toContain("usable")`: the fixture's own filename carries that
        // substring. What must be absent is the report line itself.
        expect(r.stdout).not.toMatch(/^\s+usable\s+/m);
    });

    it("warns PRODUCER_MISMATCH when the chosen set came from another backend", () => {
        // §6.2 makes this a warning, never a failure: the probe checks
        // descriptor shape, and two backends can agree on shape while
        // computing different bits (§6.3, ADR-0001's contract gaps).
        const r = run(join(FIXTURES_DIR, "warnings/unknown-descriptor-kind.wnft"));
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("PRODUCER_MISMATCH");
        expect(r.stdout).toContain("produced by 'purecv'");
    });

    it("--json emits the same verdict in a machine-readable shape", () => {
        const r = run("--json", unusable);
        expect(r.status).toBe(1);
        const parsed = JSON.parse(r.stdout) as {
            valid: boolean;
            usable: { ok: boolean; chosen: string | null };
        }[];
        expect(parsed).toHaveLength(1);
        expect(parsed[0]!.valid).toBe(true);
        expect(parsed[0]!.usable.ok).toBe(false);
        expect(parsed[0]!.usable.chosen).toBeNull();
    });

    it("exits 2 on bad usage, distinct from an invalid target", () => {
        expect(run().status).toBe(2);
        expect(run("--bogus", PINBALL).status).toBe(2);
    });

    it("fails the run when any one of several files fails", () => {
        const r = run(PINBALL, unusable);
        expect(r.status).toBe(1);
        expect(r.stdout).toContain("usable      yes");
        expect(r.stdout).toContain("usable      NO");
    });
});
