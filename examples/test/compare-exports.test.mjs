/*
 *  compare-exports.test.mjs
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

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareExports, METRICS_VERSION } from "../js/bench-metrics.mjs";

const CLI = fileURLToPath(new URL("../../scripts/compare-bench.mjs", import.meta.url));

const at = (t, dx = 0) => ({
    mediaTimeSeconds: t,
    state: "TRACK",
    ok: true,
    corners: [
        [dx, 0],
        [1 + dx, 0],
        [1 + dx, 1],
        [dx, 1],
    ],
});
const lost = (t) => ({ mediaTimeSeconds: t, state: "LOST", ok: false, corners: null });
const run = (frames, o = {}) => ({
    metricsVersion: METRICS_VERSION,
    mode: "tracking",
    source: "bundled",
    bundledClip: "pinball-static.mp4",
    processingResolution: { width: 203, height: 360 },
    frames,
    ...o,
});

describe("compareExports", () => {
    it("restricts both runs to the media times both posed", () => {
        // The first run's frames off the common times are 7 px away: jitter if they were kept.
        const first = run([
            at(0.1, 7),
            at(0.2),
            at(0.3, 7),
            at(0.4),
            at(0.5, 7),
            at(0.6),
            at(0.7, 7),
            at(0.8),
        ]);
        const second = run([at(0.2), lost(0.3), at(0.4), lost(0.5), at(0.6), at(0.8)], {
            mode: "stateless",
        });
        const r = compareExports(first, second);
        expect(r.commonMediaTimes).toBe(4);
        expect(r.first).toMatchObject({
            posedFrames: 4,
            jitterWindows: 1,
            jitterPx: 0,
            spreadPx: 0,
        });
        expect(r.second).toMatchObject({ posedFrames: 4, jitterWindows: 1, jitterPx: 0 });
    });

    it("matches media times to the microsecond, not to the last bit", () => {
        expect(
            compareExports(run([at(5.933333)]), run([at(5.9333330000001)])).commonMediaTimes,
        ).toBe(1);
    });

    it("keeps every occurrence of a media time the loop revisits, one window per loop", () => {
        const loop = (dx) => [at(0.1, dx), at(0.2, dx), at(0.3, dx), at(0.4, dx)];
        const r = compareExports(run([...loop(0), ...loop(3)]), run(loop(0)));
        expect(r.first).toMatchObject({ posedFrames: 8, jitterWindows: 2, jitterPx: 0 });
        expect(r.second).toMatchObject({ posedFrames: 4, jitterWindows: 1 });
    });

    it.each([
        ["a webcam run", { source: "webcam", bundledClip: null }, /webcam/],
        [
            "an export from before per-frame corners",
            { metricsVersion: undefined },
            /metricsVersion/,
        ],
        ["another clip", { bundledClip: "pinball-bench.mp4" }, /different footage/],
        [
            "another frame size",
            { processingResolution: { width: 480, height: 270 } },
            /frame sizes/,
        ],
    ])("refuses %s", (_, other, why) => {
        expect(() => compareExports(run([]), run([], other))).toThrow(why);
    });

    it("refuses two runs that posed no media time in common, rather than compare nothing", () => {
        const first = run([at(0.1), at(0.2), lost(0.3)]);
        const second = run([lost(0.1), at(0.3), at(0.4)], { mode: "stateless" });
        expect(() => compareExports(first, second)).toThrow(/no media time both runs posed/);
    });
});

describe("scripts/compare-bench.mjs", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-bench-"));
    const write = (name, e) => {
        const p = join(dir, name);
        writeFileSync(p, JSON.stringify(e));
        return p;
    };
    const times = [0.1, 0.35, 0.6, 0.85];

    it("prints both runs and the aligned jitter", () => {
        const first = write("a.json", run(times.map((t) => at(t))));
        // x = 0, 1, 0, 1: a jitter of √0.4 about the window's line.
        const second = write(
            "b.json",
            run(
                times.map((t, i) => at(t, i % 2)),
                { mode: "stateless" },
            ),
        );
        const r = spawnSync(process.execPath, [CLI, first, second], { encoding: "utf8" });
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toMatch(/\| jitterPx, 4 common media times \| 0\.000 \| 0\.632 \|/);
    });

    it("exits 1 with a one-line reason, not a stack trace, on exports it cannot align", () => {
        const first = write("c.json", run([at(0.1)]));
        const second = write("d.json", run([at(0.1)], { source: "webcam", bundledClip: null }));
        const r = spawnSync(process.execPath, [CLI, first, second], { encoding: "utf8" });
        expect(r.status).toBe(1);
        expect(r.stderr.trim()).toMatch(
            /^cannot compare these exports: the second is a webcam run/,
        );
        expect(r.stderr).not.toMatch(/\n\s+at /);
    });

    it("exits 2 with a one-line reason, not a stack trace, on a file it cannot read", () => {
        const first = write("e.json", run([at(0.1)]));
        const r = spawnSync(process.execPath, [CLI, first, join(dir, "missing.json")], {
            encoding: "utf8",
        });
        expect(r.status).toBe(2);
        expect(r.stderr.trim()).toMatch(/^cannot read .*missing\.json/);
        expect(r.stderr).not.toMatch(/\n\s+at /);
    });

    it("exits 1 with a one-line reason, not a stack trace, on a file that is not JSON", () => {
        const first = write("f.json", run([at(0.1)]));
        const truncated = join(dir, "truncated.json");
        writeFileSync(truncated, JSON.stringify(run([at(0.1)])).slice(0, 40));
        const r = spawnSync(process.execPath, [CLI, first, truncated], { encoding: "utf8" });
        expect(r.status).toBe(1);
        expect(r.stderr.trim()).toMatch(/^cannot parse .*truncated\.json/);
        expect(r.stderr).not.toMatch(/\n\s+at /);
    });

    it("exits 2 on bad usage", () => {
        const r = spawnSync(process.execPath, [CLI, "only-one.json"], { encoding: "utf8" });
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/^usage:/);
    });
});
