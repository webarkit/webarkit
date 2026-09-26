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

const SCRIPT = fileURLToPath(new URL("../bin/validate-target.mjs", import.meta.url));
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
let fallback: string;
let allRejected: string;

beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "wnft-validate-"));

    // A target that decodes perfectly and that jsfeatNext cannot use: `teblid`
    // is a family the contract defines and this backend does not compute, so
    // §6.3 selects nothing while §5 and §6.1 are entirely satisfied.
    const source = new Uint8Array(readFileSync(join(FIXTURES_DIR, "valid/minimal.wnft")));
    const decoded = decode(source);
    if (!decoded.ok) throw new Error(`minimal.wnft must decode: ${decoded.error}`);
    const target = structuredClone(decoded.target);
    (target.descriptorSets[0] as unknown as { kind: string }).kind = "teblid";
    const written = encode(target);
    if (!written.ok) throw new Error(`must re-encode: ${written.detail}`);

    unusable = join(tmp, "unusable.wnft");
    writeFileSync(unusable, written.bytes);

    // Two orb sets: a 128-bit one and a 256-bit one. §7.3 sorts by dimensions,
    // so the 128-bit set comes *first* in the file and is what §6.3 offers as
    // the first candidate — and jsfeatNext computes 32-byte ORB, so its width
    // probe must fail and selection must move on to the second. That is
    // §6.3's "moves on to the next candidate", and it is the case an earlier
    // version of this tool got wrong: it probed once and gave up.
    const good = decoded.target.descriptorSets[0]!;
    const narrow = {
        ...good,
        dimensions: 128,
        bytesPerDescriptor: 16,
        data: new Uint8Array(good.count * 16),
        kpIndex: good.kpIndex.slice(),
        levelStart: good.levelStart.slice(),
    };
    const twoSets = structuredClone(decoded.target);
    (twoSets as unknown as { descriptorSets: unknown[] }).descriptorSets = [
        narrow,
        { ...good, producer: "purecv" },
    ];
    const withFallback = encode(twoSets);
    if (!withFallback.ok) throw new Error(`must re-encode: ${withFallback.detail}`);
    fallback = join(tmp, "fallback.wnft");
    writeFileSync(fallback, withFallback.bytes);

    // One set, zero-dimension — legal under §5.6, and the wrong width for any
    // real backend. Every candidate is rejected, and nothing is left.
    const zero = structuredClone(decoded.target);
    (zero.descriptorSets[0] as unknown as Record<string, unknown>).dimensions = 0;
    (zero.descriptorSets[0] as unknown as Record<string, unknown>).bytesPerDescriptor = 0;
    (zero.descriptorSets[0] as unknown as Record<string, unknown>).data = new Uint8Array(0);
    const zeroDim = encode(zero);
    if (!zeroDim.ok) throw new Error(`must re-encode: ${zeroDim.detail}`);
    allRejected = join(tmp, "all-rejected.wnft");
    writeFileSync(allRejected, zeroDim.bytes);
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

    it("reports the demo target's tracking patches (§5.7)", () => {
        // compile-target writes a patches section, and the committed demo
        // target is compiled with it: a zero here means the file was compiled
        // detection-only, or by a compiler that predates patch selection.
        const human = run(PINBALL);
        const count = /target\s+.*, (\d+) patch(?:es)?\b/.exec(human.stdout);
        expect(count, human.stdout).not.toBeNull();
        expect(Number(count![1])).toBeGreaterThan(0);

        const r = run("--json", PINBALL);
        expect(r.status).toBe(0);
        const [parsed] = JSON.parse(r.stdout) as { target: { patches: number } }[];
        expect(parsed!.target.patches).toBe(Number(count![1]));
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

    it("moves on to the next candidate when one fails the width probe (§6.3)", () => {
        // The first set is 128-bit and this backend computes 32-byte ORB, so
        // its probe must fail; the 256-bit set behind it must then be chosen.
        // Probing only the first candidate would call this usable target
        // unusable — which is exactly what an earlier version of this tool did.
        const r = run(fallback);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("skipped     orb/hamming/128");
        expect(r.stdout).toMatch(/usable\s+yes on 'jsfeatnext' via orb\/hamming\/256/);
    });

    it("says what was rejected, not that the target offers nothing", () => {
        // Selection walks a shrinking copy of the set list, so the helper's own
        // message would describe the emptied copy once every candidate has been
        // tried. The verdict has to describe the file the user handed over.
        const r = run(allRejected);
        expect(r.status).toBe(1);
        expect(r.stdout).toContain("every candidate was probed and rejected");
        expect(r.stdout).not.toContain("offers []");
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
