/*
 *  compile_target.test.ts
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
 * `bin/compile-target.mjs`, driven as a user drives it: a real process, a real
 * JPEG in, a real `.wnft` out, decoded back with this package's own decoder.
 *
 * The script is spawned rather than imported. Everything interesting about a
 * CLI is in the part an import skips — argument parsing, defaults, exit codes,
 * writing the file — and a test that imported its internals would check the
 * parts that were never in doubt.
 *
 * **This suite needs `dist/` to be current**: the script imports the built
 * output, exactly as `scripts/generate-fixtures.mjs` does and for the same
 * reason. `npm run build` before `npm test` (AGENTS.md), which is also CI's
 * order.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decode } from "../src/target/format/decode.js";
import type { DecodeResult } from "../src/target/format/errors.js";

const SCRIPT = fileURLToPath(new URL("../bin/compile-target.mjs", import.meta.url));
const IMAGE = fileURLToPath(new URL("../../../examples/images/pinball.jpg", import.meta.url));
/** The repository root — what npm reports as `INIT_CWD` when run from there. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
/** The package directory — what npm makes the cwd for a workspace script. */
const PACKAGE_DIR = fileURLToPath(new URL("../", import.meta.url));

let work: string;

beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "wnft-compile-"));
});

afterAll(() => {
    rmSync(work, { recursive: true, force: true });
});

/**
 * Runs the CLI, returning its stdout. Throws with stderr attached on failure.
 *
 * `stdio` pipes stderr rather than inheriting it — the default — so that the
 * usage text the refusal cases below deliberately provoke is captured and
 * asserted on, instead of being printed into the middle of the test run's own
 * output where it reads like something went wrong.
 */
function compile(args: readonly string[]): string {
    return execFileSync(process.execPath, [SCRIPT, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

/** Runs the CLI expecting it to refuse, returning `{ status, stderr }`. */
function compileExpectingFailure(args: readonly string[]): { status: number; stderr: string } {
    try {
        compile(args);
    } catch (e) {
        const err = e as { status?: number; stderr?: string };
        return { status: err.status ?? -1, stderr: err.stderr ?? "" };
    }
    throw new Error(`compile-target ${args.join(" ")} was expected to fail, but succeeded`);
}

/** Decodes a file the CLI wrote, failing loudly rather than returning a union. */
function decodeFile(path: string): Extract<DecodeResult, { ok: true }> {
    const result = decode(new Uint8Array(readFileSync(path)));
    if (!result.ok) throw new Error(`${path}: decode said ${result.error} — ${result.detail}`);
    return result;
}

describe("compile-target", () => {
    it("compiles an image into a .wnft the decoder accepts without warnings", () => {
        const out = join(work, "defaults.wnft");
        compile([IMAGE, "-o", out]);

        const decoded = decodeFile(out);
        expect(decoded.warnings).toEqual([]);
        // 614 x 768 capped to a 640 longer side.
        expect(decoded.target.meta.widthPx).toBe(512);
        expect(decoded.target.meta.heightPx).toBe(640);
        expect(decoded.target.meta.physicalSizeMm).toBeNull();
        expect(decoded.target.keypoints.count).toBeGreaterThan(0);
        expect(decoded.target.descriptorSets).toHaveLength(1);
        expect(decoded.target.descriptorSets[0].kind).toBe("orb");
        expect(decoded.target.descriptorSets[0].norm).toBe("hamming");
    });

    it("honours --levels, --physical-size and --seed", () => {
        const out = join(work, "options.wnft");
        compile([IMAGE, "-o", out, "--levels", "4", "--physical-size", "210x297", "--seed", "7"]);

        const { target } = decodeFile(out);
        expect(target.pyramid.levelSizes.length).toBeLessThanOrEqual(4);
        expect(target.meta.physicalSizeMm).toEqual([210, 297]);
        // The seed is provenance: it is recorded so a file can be rebuilt, and
        // the next test is what shows the build honours it.
        expect((target.info as { compiler?: { seed?: number; levels?: number } })?.compiler).toMatchObject({
            seed: 7,
            levels: 4,
        });
    });

    it("is deterministic: the same arguments produce the same bytes", () => {
        const first = join(work, "repeat-a.wnft");
        const second = join(work, "repeat-b.wnft");
        compile([IMAGE, "-o", first, "--levels", "3", "--seed", "1"]);
        compile([IMAGE, "-o", second, "--levels", "3", "--seed", "1"]);

        expect(new Uint8Array(readFileSync(second))).toEqual(new Uint8Array(readFileSync(first)));
    });

    /*
     * npm runs a workspace script with the cwd set to the PACKAGE, not to the
     * directory the command was typed in. Left alone, that makes every
     * relative path in the command mean something other than it reads: an
     * input is not found, and -- worse, because it is silent -- an output
     * lands inside `packages/nft-tracker/` while the script reports the path
     * the user asked for.
     *
     * The script therefore resolves relative paths against `INIT_CWD`, which
     * npm sets to the invocation directory. These two cases pin both halves
     * of that: the first reproduces npm's environment exactly without needing
     * npm, and the second checks that npm really does set it -- on whatever
     * platform this suite is running, which is the only way to claim it works
     * on more than one.
     */
    describe("paths relative to where the command was typed", () => {
        const RELATIVE_IMAGE = "examples/images/pinball.jpg";
        let outDir: string;

        beforeAll(() => {
            // Inside the repository, because a path relative to the repo root
            // is what is being tested and the OS temp directory may not even
            // be on the same drive (Windows), where `relative()` gives up and
            // returns an absolute path.
            outDir = join(REPO_ROOT, ".tmp-compile-target");
        });

        afterAll(() => {
            rmSync(outDir, { recursive: true, force: true });
            rmSync(join(PACKAGE_DIR, ".tmp-compile-target"), { recursive: true, force: true });
        });

        it("resolves them against INIT_CWD, as npm sets it", () => {
            const relativeOut = ".tmp-compile-target/from-env.wnft";
            execFileSync(process.execPath, [SCRIPT, RELATIVE_IMAGE, "-o", relativeOut, "--levels", "2"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
                // Exactly what npm hands a workspace script.
                cwd: PACKAGE_DIR,
                env: { ...process.env, INIT_CWD: REPO_ROOT },
            });

            expect(existsSync(join(outDir, "from-env.wnft"))).toBe(true);
            // The bug this replaces was silent: it reported success while
            // writing here instead.
            expect(existsSync(join(PACKAGE_DIR, relativeOut))).toBe(false);
        });

        it("works through the real npm script, from the repository root", () => {
            const relativeOut = ".tmp-compile-target/from-npm.wnft";
            execFileSync(
                "npm",
                ["run", "--silent", "compile-target", "-w", "@webarkit/nft-tracker", "--",
                 RELATIVE_IMAGE, "-o", relativeOut, "--levels", "2"],
                {
                    encoding: "utf8",
                    stdio: ["ignore", "pipe", "pipe"],
                    cwd: REPO_ROOT,
                    // npm is `npm.cmd` on Windows, and since the fix for
                    // CVE-2024-27980 Node refuses to spawn a `.cmd` without a
                    // shell. No argument below contains a space or a shell
                    // metacharacter, so this is a launcher detail and not an
                    // injection surface.
                    shell: process.platform === "win32",
                }
            );

            expect(existsSync(join(outDir, "from-npm.wnft"))).toBe(true);
            expect(existsSync(join(PACKAGE_DIR, relativeOut))).toBe(false);
        });
    });

    it("refuses to run without an output path", () => {
        const failure = compileExpectingFailure([IMAGE]);
        expect(failure.status).toBe(2);
        expect(failure.stderr).toMatch(/--out/);
    });

    it("refuses a --seed the manifest could not hold as an integer", () => {
        const out = join(work, "never-written.wnft");
        // An integer by `Number.isInteger`, but §7.3 has no such integer and
        // `>>> 0` would quietly turn it into the seed 0.
        const failure = compileExpectingFailure([IMAGE, "-o", out, "--seed", "1e300"]);
        expect(failure.status).toBe(2);
        expect(failure.stderr).toMatch(/--seed/);
        // The message must name the domain the check actually enforces. An
        // off-by-one here is not cosmetic: it is a CLI telling the user that a
        // value it rejects is allowed.
        expect(failure.stderr).toContain("[-4294967295, 4294967295]");
    });

    it("accepts the largest seed it says it accepts", () => {
        const out = join(work, "max-seed.wnft");
        compile([IMAGE, "-o", out, "--levels", "2", "--seed", "4294967295"]);

        const { target } = decodeFile(out);
        expect((target.info as { compiler?: { seed?: number } })?.compiler?.seed).toBe(4294967295);
    });

    it("honours a non-default --max-side", () => {
        const out = join(work, "small.wnft");
        compile([IMAGE, "-o", out, "--levels", "3", "--max-side", "320"]);

        const { target, warnings } = decodeFile(out);
        expect(warnings).toEqual([]);
        // 614 x 768 capped to a 320 longer side, the longer side being the
        // height — a cap applied to the width alone would leave 614 x 768
        // untouched, which is the bug this asserts against.
        expect(target.meta.widthPx).toBe(256);
        expect(target.meta.heightPx).toBe(320);
        expect(target.pyramid.levelSizes[0]).toEqual([256, 320]);
        // `--max-side` decides the target's coordinate space, so a reader has
        // to be able to find out which one it got.
        expect((target.info as { compiler?: { maxSide?: number } })?.compiler?.maxSide).toBe(320);
    });

    it("refuses a --physical-size that is not two positive millimetre lengths", () => {
        const out = join(work, "never-written.wnft");
        const failure = compileExpectingFailure([IMAGE, "-o", out, "--physical-size", "210x0"]);
        expect(failure.status).toBe(2);
        expect(failure.stderr).toMatch(/--physical-size/);
    });
});
