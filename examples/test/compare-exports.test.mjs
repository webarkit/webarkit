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
import { compareExports, DEFINITIONS, METRICS_VERSION } from "../js/bench-metrics.mjs";

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

    // #96: the loops are read off each run's own frames, not off the posed frames both share,
    // which can skip a wrap's neighbours, as when the target is out of view at the clip's end.
    it("reads each run's loops from all its frames, so a wrap no posed frame is beside still counts", () => {
        const frames = [
            at(10.5),
            at(11.0),
            lost(11.5),
            lost(11.9),
            lost(0.05),
            lost(0.5),
            at(1.0),
            at(1.5),
        ];
        const r = compareExports(run(frames), run(frames, { mode: "stateless" }));
        expect(r.commonMediaTimes).toBe(4);
        // Two windows of two frames each, at 10–11 s of loop 0 and 1–2 s of loop 1: neither
        // holds 4, and none spans the wrap.
        expect(r.first).toMatchObject({ posedFrames: 4, jitterWindows: 0, jitterPx: null });
    });

    // The independent check of #96: nothing pinned that each export's own clip duration is
    // what its wraps are read by; passing none survived.
    it("reads each run's wraps by its own clip duration, where it records one", () => {
        // A restart that skips 0.7 s across the wrap: only the duration tells it from one.
        const frames = [at(11.0), at(11.3), lost(0.4), at(0.6), at(0.8)];
        expect(() => compareExports(run(frames), run(frames))).not.toThrow();
        expect(() =>
            compareExports(run(frames, { clipDurationS: 12 }), run(frames, { clipDurationS: 12 })),
        ).toThrow(
            /^frame 2: media time 0\.4 s, after 11\.3 s, is not the clip restarting: it skips 1\.1 s/,
        );
    });

    it("matches media times to the microsecond, not to the last bit", () => {
        expect(
            compareExports(run([at(5.933333)]), run([at(5.9333330000001)])).commonMediaTimes,
        ).toBe(1);
    });

    it("keeps every occurrence of a media time the loop revisits, one window per loop", () => {
        const loop = (dx) => [at(0.1, dx), at(0.2, dx), at(0.3, dx), at(0.4, dx)];
        // The clip restarts after its end (#96): an unposed frame stands there.
        const r = compareExports(run([...loop(0), lost(0.9), ...loop(3)]), run(loop(0)));
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

// #243: the filter is a tracker option; it changes the pose, never the footage. Neither
// compareExports nor compare-bench.mjs reads tracker.options today: this guards against a
// future refusal of a pair that differs there.
describe("two exports of the same footage that differ only in the pose filter", () => {
    const times = [0.1, 0.35, 0.6, 0.85];
    const withFilter = (mode, pdx) =>
        run(
            times.map((t, i) => ({ ...at(t), poseCorners: at(t, i % 2 ? pdx : 0).corners })),
            { tracker: { detectionOnly: false, options: { poseFilter: { mode } } } },
        );
    const off = withFilter("off", 1);
    const oneEuro = withFilter("one-euro", 0.25);

    it("compare as a pair, in compareExports", () => {
        const r = compareExports(off, oneEuro);
        expect(r.commonMediaTimes).toBe(4);
        expect(r.pose.commonFrames).toBe(4);
        expect(r.pose.first.poseJitterPx).toBeGreaterThan(r.pose.second.poseJitterPx);
    });

    it("compare as a pair, in scripts/compare-bench.mjs", () => {
        const dir = mkdtempSync(join(tmpdir(), "compare-bench-filter-"));
        const paths = [
            ["off.json", off],
            ["one-euro.json", oneEuro],
        ].map(([name, e]) => {
            const p = join(dir, name);
            writeFileSync(p, JSON.stringify(e));
            return p;
        });
        const r = spawnSync(process.execPath, [CLI, ...paths], { encoding: "utf8" });
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toMatch(/4 common media times/);
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

    describe("the pose part", () => {
        // A version 2 frame: corners still, and poseCorners `pdx` px to the right of them.
        const posed = (t, pdx) => ({
            ...at(t),
            poseCorners: at(t, pdx).corners,
        });
        const unposed = (t) => ({ ...at(t), poseCorners: null });
        const rowsOf = (stdout) => stdout.split("\n").filter((l) => l.startsWith("| "));
        const cli = (a, b) => {
            const r = spawnSync(process.execPath, [CLI, a, b], { encoding: "utf8" });
            expect(r.status, r.stderr).toBe(0);
            return r.stdout;
        };

        it("prints each run's whole window and the pose part on common media times, with their definitions", () => {
            // poseCorners still on the common times, plus one frame at 0.5 s, 4 px off, that the
            // second run lacks: in the first's whole window (spread √(4 · 12.8 ÷ 20) = 1.6), not in
            // its common times, so a row reading the wrong one of the two shows.
            const firstFrames = times.map((t) => posed(t, 0));
            firstFrames.splice(2, 0, posed(0.5, 4));
            const first = write("p2a.json", run(firstFrames));
            // poseCorners x = 0, 2, 0, 2: a jitter of √1.6 about the window's line, a spread of
            // 1, and a corner distance from the first's of 0, 2, 0, 2 px. Its corners are still.
            const second = write(
                "p2b.json",
                run(
                    times.map((t, i) => posed(t, 2 * (i % 2))),
                    { mode: "stateless" },
                ),
            );
            const out = cli(first, second);
            const rows = rowsOf(out);
            expect(rows).toContain("| jitterPx, 4 common media times | 0.000 | 0.000 |");
            expect(rows).toContain("| posePosedFrames, whole window | 5 | 4 |");
            expect(rows).toContain("| poseJitterPx, whole window | 2.064 | 1.265 |");
            expect(rows).toContain("| poseSpreadPx, whole window | 1.600 | 1.000 |");
            expect(rows).toContain("| poseJitterWindows, 4 common media times | 1 | 1 |");
            expect(rows).toContain("| poseJitterPx, 4 common media times | 0.000 | 1.265 |");
            expect(rows).toContain("| poseSpreadPx, 4 common media times | 0.000 | 1.000 |");
            expect(rows).toContain(
                "| poseCornerDistancePx, the pair's median over 4 common frames: descriptive, never a criterion | 2.000 |  |",
            );
            // The pose rows follow the corners' rows, in the same table.
            const last = rows.findIndex((l) => l.startsWith("| spreadPx, 4 common"));
            expect(rows.findIndex((l) => l.startsWith("| posePosedFrames"))).toBe(last + 1);
            expect(rows.at(-1)).toMatch(/^\| poseCornerDistancePx/);
            expect(out).not.toMatch(/pose part, common media times/);
            for (const key of [
                "posePosedFrames",
                "poseJitterPx",
                "poseSpreadPx",
                "poseJitterWindows",
                "poseCornerDistancePx",
            ]) {
                expect(out).toContain(`\n${key}: ${DEFINITIONS[key]}`);
            }
        });

        it("says, in one row, that a pair with a version 1 export has no pose part", () => {
            const first = write(
                "p1a.json",
                run(
                    times.map((t) => at(t)),
                    { metricsVersion: 1 },
                ),
            );
            const second = write(
                "p1b.json",
                run(
                    times.map((t) => posed(t, 0)),
                    { mode: "stateless" },
                ),
            );
            const out = cli(first, second);
            const rows = rowsOf(out);
            expect(rows).toContain("| posePosedFrames, whole window | — | 4 |");
            expect(rows).toContain("| poseJitterPx, whole window | — | 0.000 |");
            expect(rows).toContain("| poseSpreadPx, whole window | — | 0.000 |");
            expect(rows.at(-1)).toBe(
                "| pose part, common media times | none: the first export is metricsVersion 1, which records no poseCorners |  |",
            );
            expect(out).not.toMatch(/poseCornerDistancePx|poseJitterWindows/);
            expect(out).toContain(`\nposeJitterPx: ${DEFINITIONS.poseJitterPx}`);
            // Two version 1 exports: the row names both.
            expect(rowsOf(cli(first, first)).at(-1)).toBe(
                "| pose part, common media times | none: both exports are metricsVersion 1, which records no poseCorners |  |",
            );
        });

        it("says, in one row, that two version 2 exports with no common posed media time have no pose part", () => {
            // Both posed every frame, so the corners' comparison stands; poseCorners never meet.
            const first = write(
                "p0a.json",
                run(times.map((t, i) => (i < 2 ? posed(t, 0) : unposed(t)))),
            );
            const second = write(
                "p0b.json",
                run(
                    times.map((t, i) => (i < 2 ? unposed(t) : posed(t, 0))),
                    { mode: "stateless" },
                ),
            );
            const out = cli(first, second);
            const rows = rowsOf(out);
            expect(rows).toContain("| jitterPx, 4 common media times | 0.000 | 0.000 |");
            expect(rows).toContain("| posePosedFrames, whole window | 2 | 2 |");
            expect(rows.at(-1)).toBe(
                "| pose part, common media times | none: no media time has poseCorners in both runs |  |",
            );
            expect(out).not.toMatch(/poseCornerDistancePx|poseJitterWindows/);
        });
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
