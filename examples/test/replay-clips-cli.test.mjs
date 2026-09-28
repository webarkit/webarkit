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
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/replay-clips.mjs", import.meta.url));

function run(...args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 60000 });
    return { status: r.status, stderr: r.stderr };
}

describe("replay-clips.mjs command line", () => {
    // Found in review: a trailing flag read as absent, so the replay ran the
    // default target or options while the command named a candidate.
    it.each(["--target", "--options", "--seed", "--device-ratio", "--out", "--sequence"])(
        "refuses %s given last, with no value",
        (flag) => {
            const r = run("--tracking-only", flag);
            expect(r.status).toBe(2);
            expect(r.stderr).toMatch(new RegExp(`${flag} expects a value`));
        },
    );

    // Found in review: the probe mirrored a lock the tracker never took, and
    // reported a divergence where the run was simply detection-only.
    it("refuses a target the tracker would not track under the options given", () => {
        const r = run("--seed", "1", "--options", "minTrackedPatches:100");
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/64 patches.*minTrackedPatches \(100\).*detection-only/);
    });
});
