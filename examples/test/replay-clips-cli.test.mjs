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
import {
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/replay-clips.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));

function run(...args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 60000 });
    return { status: r.status, stderr: r.stderr };
}

/**
 * The script run from a temporary copy of the repository's layout whose
 * examples/dist holds `dist` (name → contents) and nothing else, so that a test
 * can hand `--packages bundle` a manifest without touching the examples/dist
 * the other tests read. The script finds examples/ beside its own real path,
 * so scripts/ is copied; examples/js, examples/targets and packages/ are
 * linked (a junction on Windows), and removing the copy removes the links, not
 * what they point at.
 */
function runInTree(dist, ...args) {
    const root = mkdtempSync(join(tmpdir(), "replay-clips-tree-"));
    try {
        cpSync(join(REPO, "scripts"), join(root, "scripts"), { recursive: true });
        mkdirSync(join(root, "examples", "dist"), { recursive: true });
        for (const dir of ["examples/js", "examples/targets", "packages"]) {
            symlinkSync(join(REPO, dir), join(root, dir), "junction");
        }
        for (const [name, body] of Object.entries(dist)) {
            writeFileSync(join(root, "examples", "dist", name), body);
        }
        const r = spawnSync(
            process.execPath,
            [join(root, "scripts", "replay-clips.mjs"), ...args],
            {
                encoding: "utf8",
                timeout: 60000,
            },
        );
        return { status: r.status, stderr: r.stderr };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
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

    // #95, Task 7: --tracking-only skips the default runs' detection-only runs, and these
    // forms run none, so it was accepted and did nothing: silently redundant.
    it.each([
        ["--external", "70"],
        ["--transfer", "session"],
        ["--sequence", "export.json"],
    ])("refuses --tracking-only with %s, which runs no detection-only run", (form, value) => {
        const r = run(form, value, "--tracking-only");
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(new RegExp(`--tracking-only.*${form}`));
        expect(r.stderr.trim().split("\n")).toHaveLength(1);
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
            // The session ran the tracker's defaults, and the transfer replays what it ran.
            ["--options", "minTrackedPatches:6"],
        ]) {
            const r = run("--transfer", "session", ...other);
            expect(r.status, other[0]).toBe(2);
            expect(r.stderr, other[0]).toMatch(new RegExp(`--transfer.*${other[0]}`));
            expect(r.stderr.trim().split("\n"), other[0]).toHaveLength(1);
        }
    });

    // #120 (RO2, RO3, RO7, RO9): each usage check could go with every test green. Where the
    // command would otherwise go on to decode the clips, `--options minTrackedPatches:100` adds a
    // later refusal that stops it before any clip is decoded, so a missing check shows as the
    // wrong line, never as a run that needs ffmpeg.
    it.each([
        ["--seed", ["--seed", "abc"], /^replay-clips: --seed expects an integer/],
        [
            "--device-ratio",
            ["--device-ratio", "0"],
            /^replay-clips: --device-ratio expects a positive/,
        ],
        ["--packages", ["--packages", "foo"], /^replay-clips: --packages expects dist or bundle/],
    ])("refuses a %s it cannot read, in one usage line", (flag, given, why) => {
        const r = run(...given, "--options", "minTrackedPatches:100");
        expect(r.stderr, `the ${flag} check`).toMatch(why);
        expect(r.status, `the ${flag} check`).toBe(2);
        expect(r.stderr.trim().split("\n")).toHaveLength(1);
    });

    it("refuses --sequence with --options, in one usage line", () => {
        const r = run("--sequence", "export.json", "--options", "minTrackedPatches:6");
        expect(r.stderr, "the --sequence and --options check").toMatch(
            /^replay-clips: --sequence replays an export with its own recorded options/,
        );
        expect(r.status).toBe(2);
        expect(r.stderr.trim().split("\n")).toHaveLength(1);
    });

    // #120 (RS1): an export sequenceRefusal refuses is refused before its clip is decoded.
    it("refuses to replay a worker run's export as a sequence, naming the file", () => {
        const dir = mkdtempSync(join(tmpdir(), "replay-clips-sequence-"));
        try {
            const file = join(dir, "worker-1.json");
            writeFileSync(file, JSON.stringify(pageExport("worker")));
            const r = run("--sequence", file);
            expect(r.stderr, "sequenceRefusal at --sequence").toMatch(
                /^cannot replay .*worker-1\.json: it is a worker-detection run/,
            );
            expect(r.status).toBe(1);
            expect(r.stderr.trim().split("\n")).toHaveLength(1);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // #120 (RB1, RB2): no test ran `--packages bundle`. A manifest it cannot read, and one
    // built where git could not describe the tree, are refused by name before the header reads
    // `head`: without the refusal, #113's TypeError at the header came back.
    describe("--packages bundle's refusals of the build's manifest", () => {
        const bundle = readFileSync(join(REPO, "examples/dist/webarkit-packages.mjs"));
        const manifest = (o) =>
            JSON.stringify({
                schema: "webarkit-bench-provenance/1",
                head: null,
                clean: false,
                dirtyPaths: [],
                bundle: {
                    path: "examples/dist/webarkit-packages.mjs",
                    sha256: createHash("sha256").update(bundle).digest("hex"),
                },
                ...o,
            });

        it("refuses a manifest built where git could not describe the tree, by name", () => {
            for (const o of [
                { head: null, clean: false },
                { head: null, clean: true },
            ]) {
                const r = runInTree(
                    { "provenance.json": manifest(o), "webarkit-packages.mjs": bundle },
                    "--packages",
                    "bundle",
                );
                expect(r.stderr, "bundleManifestRefusal at --packages bundle").toMatch(
                    /^replay-clips: --packages bundle needs a manifest whose commit is known: .*\(head null\)/,
                );
                expect(r.status, JSON.stringify(o)).toBe(2);
                expect(r.stderr.trim().split("\n")).toHaveLength(1);
            }
        });

        // The later refusal again stops a command whose manifest check went, before any decode.
        it("refuses a manifest that is missing or is not JSON, by name", () => {
            for (const dist of [
                { "webarkit-packages.mjs": bundle },
                { "provenance.json": '{"head": ', "webarkit-packages.mjs": bundle },
            ]) {
                const r = runInTree(
                    dist,
                    "--packages",
                    "bundle",
                    "--options",
                    "minTrackedPatches:100",
                );
                expect(r.stderr, "the unreadable manifest at --packages bundle").toMatch(
                    /^replay-clips: --packages bundle needs examples\/dist\/provenance\.json: run `npm run build`/,
                );
                expect(r.status).toBe(2);
                expect(r.stderr.trim().split("\n")).toHaveLength(1);
            }
        });
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

        // Only a session's runs are transferred: the page records whether an export is one.
        it("refuses a page export that is not a session run, or has no protocol record, naming it", () => {
            const balanced = {
                requests: 4,
                posted: 3,
                consumptions: 2,
                ignored: 0,
                dropped: 1,
                discardedAtStop: 1,
            };
            const session = { sessionRun: true, gaps: [] };
            const worker = (o = {}) =>
                pageExport("worker", {
                    detection: { path: "worker", jobs: [], accounting: balanced },
                    protocol: session,
                    ...o,
                });
            const stopped = transfer({
                "worker-1.json": worker(),
                "sync-1.json": pageExport("sync", {
                    protocol: { sessionRun: false, gaps: ["run.endedBy stopped: by hand"] },
                }),
            });
            expect(stopped.status).toBe(1);
            expect(stopped.stderr).toMatch(
                /sync-1\.json is not a session run: run\.endedBy stopped: by hand/,
            );
            expect(stopped.stderr.trim().split("\n")).toHaveLength(1);
            const none = transfer({
                "worker-1.json": worker({ protocol: undefined }),
                "sync-1.json": pageExport("sync", { protocol: session }),
            });
            expect(none.status).toBe(1);
            expect(none.stderr).toMatch(
                /worker-1\.json is not a session run \(no protocol record\)/,
            );
            expect(none.stderr.trim().split("\n")).toHaveLength(1);
            // #95: a record that says sessionRun is recomputed, with the tracker's own defaults.
            // These exports record none of the fields the rule reads, so it is not borne out.
            const claimed = transfer({
                "worker-1.json": worker(),
                "sync-1.json": pageExport("sync", { protocol: session }),
            });
            expect(claimed.status).toBe(1);
            expect(claimed.stderr).toMatch(
                /worker-1\.json records a session run, but recomputed from the export it has gaps: loops none: /,
            );
            expect(claimed.stderr.trim().split("\n")).toHaveLength(1);
        });

        it("refuses a file that is not JSON, naming it", () => {
            const r = transfer({ "truncated.json": '{"frames": [' });
            expect(r.status).toBe(1);
            expect(r.stderr).toMatch(/truncated\.json/);
            expect(r.stderr.trim().split("\n")).toHaveLength(1);
        });
    });
});
