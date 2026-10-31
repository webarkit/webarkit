/*
 *  replay-decoding-check.mjs
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
 * `check:replay` — `scripts/replay-clips.mjs`'s refusals that run only after
 * ffmpeg has decoded a clip, run against real decoding (#207).
 *
 * `npm test` checks their verdicts (`scripts/replay-checks.mjs`), on
 * constructed inputs; no test there reaches the script's own branches, which
 * act on a verdict only once a clip is decoded. This runs the script, each
 * check in both directions:
 *
 * - **RS2,** `--sequence` on an export whose box fits the clip to another
 *   resolution than the one it ran at: the committed M4 pre-flight export,
 *   cut to its first 60 frames so that a replay takes seconds, replays past
 *   the check and exits 0; the same, its `processingResolution` changed to
 *   481×270, is refused, exit 1. Both are written to a temporary directory,
 *   never into `docs/`.
 * - **RE2,** an `--external` arm that does not reach the loop after its counted
 *   ones: `--external 70 --device-ratio 100000` scales the device schedule's
 *   step past the run, so the static clip's scaled-step arm processes no frame
 *   of loop 5, and is refused, exit 1. Its first arm, every frame and
 *   synchronous, has no step for the ratio to scale, and its row, printed only
 *   once the check passed, comes first.
 *
 * RE1, an `--external` arm whose detection accounting does not balance, has
 * no case: no input unbalances it (the tracker asks for a detection only
 * without a lock, so none is handed in while one holds). TPR1, the step
 * probe, throws by itself, and `npm test` drives it.
 *
 * Needs ffmpeg and ffprobe on the PATH, and the packages built (`npm run
 * build`). **CI does not run it: it has no ffmpeg.** Without either, it exits 2
 * and says what is missing; it never passes or skips. Exits 0 when every check
 * passes, 1 when one fails, one line per check. About 30 s.
 *
 *     npm run check:replay
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = join(REPO, "scripts/replay-clips.mjs");
const EXPORT = join(REPO, "docs/benchmarks/2026-10-13-tab9-m4-preflight-sync-wall.json");
/** The frames the RS2 cases keep: the first with TRACK frames enough for the replay's ratio. */
const FRAMES = 60;
const TIMEOUT_MS = 180000;

class SetupError extends Error {}

/** `replay-clips.mjs` with `args`, its exit status and both streams. */
function replay(args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: REPO,
        encoding: "utf8",
        timeout: TIMEOUT_MS,
    });
    if (r.error) throw new Error(`replay-clips.mjs ${args.join(" ")}: ${r.error.message}`);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const results = [];
/** One check: `why` is null when it passed, else what it saw. */
function check(name, why) {
    results.push({ name, why });
}

/** Null when `r` exited `status` with exactly `stderr`, else what it did instead. */
function exited(r, status, stderr) {
    if (r.status === status && r.stderr.trimEnd() === stderr) return null;
    return `exit ${r.status}, stderr ${JSON.stringify(r.stderr.trimEnd().slice(-300))}`;
}

function requireTools() {
    for (const tool of ["ffmpeg", "ffprobe"]) {
        const r = spawnSync(tool, ["-version"], { encoding: "utf8" });
        if (r.error || r.status !== 0) {
            throw new SetupError(
                `${tool} is required on the PATH, and was not found (${r.error?.code ?? `exit ${r.status}`}): these checks replay decoded clips.`,
            );
        }
    }
    for (const file of [
        "packages/cv-backend-jsfeatnext/dist/index.js",
        "packages/nft-tracker/dist/index.js",
    ]) {
        if (!existsSync(join(REPO, file))) {
            throw new SetupError(`${file} is missing: run \`npm run build\` first.`);
        }
    }
}

function rs2(dir) {
    const e = JSON.parse(readFileSync(EXPORT, "utf8"));
    e.frames = e.frames.slice(0, FRAMES);
    const fits = join(dir, "preflight-cut.json");
    writeFileSync(fits, JSON.stringify(e));
    const passed = replay(["--sequence", fits, "--seed", "1"]);
    check(
        `RS2 passing: the M4 pre-flight export, first ${FRAMES} frames, replays past the resolution check`,
        passed.status === 0 &&
            passed.stderr === "" &&
            passed.stdout.includes(`${FRAMES} frames of pinball-bench.mp4, replayed 3 times`)
            ? null
            : `exit ${passed.status}, stderr ${JSON.stringify(passed.stderr.slice(-300))}`,
    );

    e.processingResolution = { width: 481, height: 270 };
    const misfit = join(dir, "preflight-cut-481x270.json");
    writeFileSync(misfit, JSON.stringify(e));
    check(
        "RS2 refusing: the same export recorded at 481×270, exit 1 and RS2's line",
        exited(
            replay(["--sequence", misfit, "--seed", "1"]),
            1,
            `cannot replay ${misfit}: its box 480x360 fits the clip to 480x270 here, but it ran at 481x270`,
        ),
    );
}

function re2() {
    const r = replay(["--external", "70", "--seed", "1", "--device-ratio", "100000"]);
    check(
        "RE2 passing: the static clip's every-frame synchronous arm, which no ratio scales, prints its row",
        r.stdout.includes("| pinball-static.mp4, 203×360 | tracking, every frame, sync |")
            ? null
            : `no such row; exit ${r.status}`,
    );
    check(
        "RE2 refusing: the static clip's scaled-step arm at --device-ratio 100000, exit 1 and RE2's line",
        exited(
            r,
            1,
            "replay-clips: pinball-static.mp4, device scaled step, sync: trackTimeShare is incomplete: the run does not reach loop 5",
        ),
    );
}

function main() {
    const t0 = Date.now();
    requireTools();
    const dir = mkdtempSync(join(tmpdir(), "replay-decoding-check-"));
    try {
        rs2(dir);
        re2();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    for (const r of results)
        console.log(r.why === null ? `PASS  ${r.name}` : `FAIL  ${r.name}: ${r.why}`);
    const passed = results.filter((r) => r.why === null).length;
    console.log(
        `${passed} of ${results.length} checks passed, in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    return passed === results.length ? 0 : 1;
}

try {
    process.exitCode = main();
} catch (e) {
    console.error(`check:replay: ${e instanceof SetupError ? "" : "could not run: "}${e.message}`);
    process.exitCode = 2;
}
