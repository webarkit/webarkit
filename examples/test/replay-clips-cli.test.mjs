/*
 *  replay-clips-cli.test.mjs
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

// scripts/replay-clips.mjs refuses a tuning command it would otherwise run
// on the wrong configuration: a flag given last with no value, and a target
// the tracker would run detection-only. Both exit 2 before any clip is
// decoded, so these run in about a second each. Imports the built dist/, as
// the script does: `npm run build` first, which CI does.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/replay-clips.mjs", import.meta.url));

function run(...args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 60000 });
    return { status: r.status, stderr: r.stderr };
}

/**
 * `--transfer` on a directory holding `files` (name → JSON body, or a string
 * written as is), removed afterwards. Every refusal these tests look for
 * comes before a clip is decoded, so none of them needs ffmpeg.
 */
function transfer(files, ...args) {
    const dir = mkdtempSync(join(tmpdir(), "replay-clips-transfer-"));
    try {
        for (const [name, body] of Object.entries(files)) {
            writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
        }
        return run("--transfer", dir, ...args);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** The SHA-256 of the target the script replays, as a page export names it. */
const TARGET_SHA256 = createHash("sha256")
    .update(readFileSync(fileURLToPath(new URL("../targets/pinball.wnft", import.meta.url))))
    .digest("hex");

/** A page export with no frames: enough for the refusals that come before its numbers are read. */
const pageExport = (path, o = {}) => ({
    mode: "tracking",
    source: "bundled",
    bundledClip: "pinball-bench.mp4",
    target: { sha256: TARGET_SHA256 },
    detection: { path, jobs: [] },
    frames: [],
    ...o,
});

describe("replay-clips.mjs command line", () => {
    // Found in review: a trailing flag read as absent, so the replay ran the
    // default target or options while the command named a candidate.
    it.each([
        "--target",
        "--options",
        "--seed",
        "--device-ratio",
        "--out",
        "--sequence",
        "--external",
        "--transfer",
    ])("refuses %s given last, with no value", (flag) => {
        const r = run("--tracking-only", flag);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(new RegExp(`${flag} expects a value`));
    });

    // Found in review: the probe mirrored a lock the tracker never took, and
    // reported a divergence where the run was simply detection-only.
    it("refuses a target the tracker would not track under the options given", () => {
        const r = run("--seed", "1", "--options", "minTrackedPatches:100");
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/\d+ patches.*minTrackedPatches \(100\).*detection-only/);
    });

    // --external replaces the run table with the M3 arms, and --sequence
    // replays a device export's frames one by one: the two are different runs.
    it("refuses --external with --sequence", () => {
        const r = run("--external", "70", "--sequence", "export.json");
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/--external.*--sequence/);
    });

    it.each(["abc", "-5", "", "Infinity"])(
        "refuses a latency that is not a number of milliseconds (%j)",
        (latency) => {
            const r = run("--external", latency);
            expect(r.status).toBe(2);
            expect(r.stderr).toMatch(/--external expects/);
            expect(r.stderr.trim().split("\n")).toHaveLength(1);
        },
    );

    // --transfer replays the clips with a session's measured latencies and
    // its own step: --external's latency, --sequence's one export and
    // --device-ratio's scaled step are each another source for what it takes
    // from the session.
    it("refuses --transfer with --external or --sequence", () => {
        for (const other of [
            ["--external", "70"],
            ["--sequence", "export.json"],
            ["--device-ratio", "3"],
        ]) {
            const r = run("--transfer", "session", ...other);
            expect(r.status, other[0]).toBe(2);
            expect(r.stderr, other[0]).toMatch(new RegExp(`--transfer.*${other[0]}`));
            expect(r.stderr.trim().split("\n"), other[0]).toHaveLength(1);
        }
    });

    it("refuses a directory it cannot read, as a usage error", () => {
        const r = run("--transfer", join(tmpdir(), "replay-clips-no-such-directory"));
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/--transfer/);
        expect(r.stderr.trim().split("\n")).toHaveLength(1);
    });

    describe("--transfer's refusals, before any clip is decoded", () => {
        it("refuses a directory with no page export of both paths for a clip", () => {
            // One path only: nothing to compare the sync mode's latencies with.
            const r = transfer({ "sync-1.json": pageExport("sync") });
            expect(r.status).toBe(1);
            expect(r.stderr).toMatch(/no worker and sync exports/);
            expect(r.stderr).toMatch(/pinball-bench\.mp4/);
            expect(r.stderr.trim().split("\n")).toHaveLength(1);
            // None at all.
            const empty = transfer({});
            expect(empty.status).toBe(1);
            expect(empty.stderr).toMatch(/no worker and sync exports/);
        });

        it("refuses a clip whose exports name another target, naming the file", () => {
            const r = transfer({
                "worker-1.json": pageExport("worker"),
                "sync-1.json": pageExport("sync", { target: { sha256: "cd" } }),
            });
            expect(r.status).toBe(1);
            expect(r.stderr).toMatch(/sync-1\.json.*sha256 cd/);
            expect(r.stderr.trim().split("\n")).toHaveLength(1);
        });

        // A session holding an invalid worker run is an invalid session: the
        // accounting the page asserted before it exported is asserted again.
        it("refuses a worker export whose accounting does not balance, or has none, naming it", () => {
            const unbalanced = transfer({
                "worker-1.json": pageExport("worker", {
                    detection: {
                        path: "worker",
                        jobs: [],
                        accounting: {
                            requests: 5,
                            posted: 3,
                            consumptions: 2,
                            ignored: 0,
                            dropped: 1,
                            discardedAtStop: 1,
                        },
                    },
                }),
                "sync-1.json": pageExport("sync"),
            });
            expect(unbalanced.status).toBe(1);
            expect(unbalanced.stderr).toMatch(
                /worker-1\.json.*detection accounting does not balance: requests 5/,
            );
            expect(unbalanced.stderr.trim().split("\n")).toHaveLength(1);
            const none = transfer({
                "worker-1.json": pageExport("worker"),
                "sync-1.json": pageExport("sync"),
            });
            expect(none.status).toBe(1);
            expect(none.stderr).toMatch(/worker-1\.json.*no detection accounting/);
            expect(none.stderr.trim().split("\n")).toHaveLength(1);
        });

        it("refuses a file that is not JSON, naming it", () => {
            const r = transfer({ "truncated.json": '{"frames": [' });
            expect(r.status).toBe(1);
            expect(r.stderr).toMatch(/truncated\.json/);
            expect(r.stderr.trim().split("\n")).toHaveLength(1);
        });
    });
});
