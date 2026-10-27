/*
 *  bench-stall.test.mjs
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

// The stall check (#117): each arm passed and failed on a synthetic export,
// then the verdict over every committed export with frames, as the M3 record's
// check-committed.mjs reads them, and the command on two of them.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    BOUND_MS,
    CLIP_S,
    DEVICE_MAX_MS,
    EXCESS_FRACTION,
    stallCheck,
} from "../js/bench-stall.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const BENCHMARKS = `${REPO}docs/benchmarks/`;
const SCRIPT = `${REPO}scripts/stall-check.mjs`;

// A 12 s clip sampled every 62.5 ms: both exact in binary, so a gap built to
// sit on a bound sits on it exactly.
const D = 12;
const DT = 0.0625;
const loopTimes = () => Array.from({ length: D / DT }, (_, k) => k * DT);

/** Media times `t` as an export's frames, under `extra`. */
const exportOf = (times, extra = {}) => ({
    clipDurationS: D,
    frames: times.map((t) => ({ mediaTimeSeconds: t })),
    ...extra,
});

/**
 * A session export: loops 0 to `last`, the warm-up loop 0, loops 1 to 4
 * counted and a frame of loop 5 closing them. `edit(loop, times)` may change a
 * loop's media times.
 */
function session({ last = 5, edit = (_, t) => t } = {}) {
    const times = [];
    for (let loop = 0; loop <= last; loop++) times.push(...edit(loop, loopTimes()));
    return exportOf(times, { loops: { firstLoop: 1, loopCount: 4 } });
}

/** `times` with every frame strictly between `from` and `to` dropped: one gap of `to - from`. */
const cut = (times, from, to) => times.filter((t) => t <= from || t >= to);

/** The arms a verdict fails, by its lines' prefixes. */
const armsFailed = (r) => [...new Set(r.fails.map((l) => l.split(":")[0]))];

describe("stallCheck's bounds", () => {
    it("are the M3 record's", () => {
        expect(BOUND_MS).toBe(500);
        expect(DEVICE_MAX_MS).toBe(240.8);
        expect(EXCESS_FRACTION).toBe(0.03);
        expect(CLIP_S).toEqual({
            "pinball-bench.mp4": 11.959866,
            "pinball-bench-table.mp4": 8.9,
            "pinball-static.mp4": 12.166667,
        });
    });
});

describe("stallCheck on a session export", () => {
    it("passes a clean run, read over loops 1 to 4", () => {
        const r = stallCheck(session());
        expect(r.fails).toEqual([]);
        expect(r).toMatchObject({ maxGap: 62.5, maxAt: 1, loops: 5, read: [1, 2, 3, 4] });
        expect(r.worstExcess).toBe(0);
        expect(r.D).toBe(D);
    });

    describe("gaps", () => {
        const stutter = (s) => session({ edit: (l, t) => (l === 2 ? cut(t, 6, 6 + s) : t) });

        it("fails a gap above 500 ms, and no other arm", () => {
            const r = stallCheck(stutter(0.5625));
            expect(armsFailed(r)).toEqual(["gaps"]);
            expect(r.fails[0]).toMatch(
                /^gaps: frame \d+: a gap of 562\.5 ms in media time, above 500 ms$/,
            );
            expect(r.maxGap).toBe(562.5);
        });

        it("passes a gap of exactly 500 ms", () => {
            const r = stallCheck(stutter(0.5));
            expect(r.fails).toEqual([]);
            expect(r.maxGap).toBe(500);
        });
    });

    describe("monotonicity", () => {
        it("fails a frame shown again half a second later, and counts it as a loop", () => {
            // Loop 2 steps back from 6.0 s to 5.5 s: 11.5 s across a would-be wrap.
            const r = stallCheck(
                session({
                    edit: (l, t) =>
                        l === 2 ? [...t.filter((x) => x <= 6), 5.5, ...t.filter((x) => x > 6)] : t,
                }),
            );
            expect(armsFailed(r)).toContain("monotonicity");
            expect(r.fails).toContain(
                `monotonicity: frame ${2 * 192 + 97}: media time steps back from 6.000 s to 5.500 s, which is not the clip restarting (11500 ms across the wrap)`,
            );
            expect(r.loops).toBe(6);
        });

        it("passes a wrap whose gap across it is exactly 500 ms", () => {
            const r = stallCheck(
                session({ edit: (l, t) => (l === 2 ? t.filter((x) => x <= 11.5) : t) }),
            );
            expect(r.fails).toEqual([]);
            expect(r.maxGap).toBe(500);
        });
    });

    describe("coverage", () => {
        it("fails a run with no frame of loop 5, and no other arm", () => {
            const r = stallCheck(session({ last: 4 }));
            expect(r.fails).toEqual(["coverage: no frame of loop 5, which closes loop 4"]);
        });

        it("fails each counted loop of which there is no frame", () => {
            const r = stallCheck(session({ last: 2 }));
            expect(r.fails).toEqual([
                "coverage: no frame of loop 5, which closes loop 4",
                "coverage: loop 3: no frame",
                "coverage: loop 4: no frame",
            ]);
        });

        it("fails a counted loop that ends more than 500 ms before the clip's end", () => {
            const r = stallCheck(
                session({ edit: (l, t) => (l === 3 ? t.filter((x) => x <= 11.375) : t) }),
            );
            expect(r.fails).toContain(
                "coverage: loop 3 covers 0.000–11.375 s of a 12.000 s clip, short by more than 500 ms at an end",
            );
        });

        it("fails a counted loop that starts more than 500 ms after the clip's start", () => {
            const r = stallCheck(
                session({ edit: (l, t) => (l === 3 ? t.filter((x) => x >= 0.625) : t) }),
            );
            expect(r.fails).toContain(
                "coverage: loop 3 covers 0.625–11.938 s of a 12.000 s clip, short by more than 500 ms at an end",
            );
        });

        it("does not read the warm-up loop", () => {
            // Loop 0 starts 3 s in, as a run started mid-clip would, and stutters
            // three times: neither is read.
            const r = stallCheck(
                session({
                    edit: (l, t) =>
                        l === 0
                            ? cut(
                                  cut(
                                      cut(
                                          t.filter((x) => x >= 3),
                                          4,
                                          4.375,
                                      ),
                                      6,
                                      6.375,
                                  ),
                                  8,
                                  8.375,
                              )
                            : t,
                }),
            );
            expect(r.fails).toEqual([]);
            expect(r.worstExcess).toBe(0);
        });
    });

    describe("cumulative", () => {
        // Each stutter of 375 ms is under the per-gap bound, and exceeds 240.8 ms
        // by 134.2 ms; the bound is 3% of 12 s, 360 ms.
        const stutters = (n) =>
            session({
                edit: (l, t) =>
                    l === 2 ? [2, 5, 8].slice(0, n).reduce((x, s) => cut(x, s, s + 0.375), t) : t,
            });

        it("fails three stutters under the per-gap bound in one loop, and no other arm", () => {
            const r = stallCheck(stutters(3));
            expect(armsFailed(r)).toEqual(["cumulative"]);
            expect(r.fails[0]).toBe(
                "cumulative: loop 2: its gaps exceed 240.8 ms by 403 ms in all, above 3% of the clip (360 ms)",
            );
            expect(r.worstExcess).toBeCloseTo(3 * (375 - 240.8), 9);
        });

        it("passes two", () => {
            const r = stallCheck(stutters(2));
            expect(r.fails).toEqual([]);
            expect(r.worstExcess).toBeCloseTo(2 * (375 - 240.8), 9);
        });
    });
});

describe("stallCheck on an older export, a window of its run (no loops)", () => {
    // From 6 s into loop 0 to 6 s into loop 3: loops 1 and 2 are whole.
    const window = (first = (t) => t) =>
        exportOf([
            ...first(loopTimes().filter((t) => t >= 6)),
            ...loopTimes(),
            ...loopTimes(),
            ...loopTimes().filter((t) => t <= 6),
        ]);

    it("reads the loops wholly inside the window, and passes a clean one", () => {
        const r = stallCheck(window());
        expect(r.fails).toEqual([]);
        expect(r).toMatchObject({ loops: 3, read: [1, 2] });
    });

    it("needs no frame of a loop after them, where a session export's counted loops do", () => {
        // The same frames read as a session counting loops 1 to 3: loop 3 is
        // the window's partial last loop, and nothing closes it.
        const r = stallCheck({ ...window(), loops: { firstLoop: 1, loopCount: 3 } });
        expect(r.read).toEqual([1, 2, 3]);
        expect(r.fails).toContain("coverage: no frame of loop 4, which closes loop 3");
    });

    it("fails a first loop that ends short of the clip's end", () => {
        const r = stallCheck(window((t) => t.filter((x) => x <= 11.375)));
        expect(r.fails).toContain(
            "coverage: the window's first loop ends at 11.375 s, short of the clip's end",
        );
    });

    it("fails a last loop that does not start at the clip's start", () => {
        const e = exportOf([
            ...loopTimes().filter((t) => t >= 6),
            ...loopTimes(),
            ...loopTimes().filter((t) => t >= 0.625),
        ]);
        expect(stallCheck(e).fails).toContain(
            "coverage: the window's last loop starts at 0.625 s, not the clip's start",
        );
    });
});

describe("stallCheck with nothing to read", () => {
    it("fails an export with no clip duration, and reads no frame", () => {
        const e = { frames: loopTimes().map((t) => ({ mediaTimeSeconds: t })) };
        expect(stallCheck(e)).toEqual({
            fails: ["no clip duration or no frames to read (undefined, 192 frames)"],
            maxGap: null,
            loops: 0,
        });
    });

    it("fails an export with fewer than two frames", () => {
        expect(stallCheck(exportOf([0])).fails).toEqual([
            "no clip duration or no frames to read (12, 1 frames)",
        ]);
        expect(stallCheck({ clipDurationS: D }).fails).toEqual([
            "no clip duration or no frames to read (12, 0 frames)",
        ]);
    });

    it("reads a bundled clip's duration when the export does not record one", () => {
        const e = {
            bundledClip: "pinball-bench-table.mp4",
            frames: [0, 0.1].map((t) => ({ mediaTimeSeconds: t })),
        };
        expect(stallCheck(e).D).toBe(8.9);
    });

    it("stops at a frame with no finite media time", () => {
        const r = stallCheck(exportOf([0, 0.0625, null, 0.1875]));
        expect(r).toEqual({ fails: ["frame 2: no finite media time"], maxGap: null, loops: 0 });
    });
});

/** Every committed export with frames, read as check-committed.mjs reads them. */
function corpus() {
    const rows = [];
    for (const name of readdirSync(BENCHMARKS)
        .filter((f) => f.endsWith(".json"))
        .sort()) {
        const e = JSON.parse(readFileSync(`${BENCHMARKS}${name}`, "utf8"));
        if (!Array.isArray(e.frames) || e.frames.length < 2) continue;
        rows.push({ name, r: stallCheck(e) });
    }
    return rows;
}

describe("stallCheck over the committed exports", () => {
    const rows = corpus();
    const read = rows.filter(({ r }) => r.maxGap !== null);
    const KNOWN_STALL = "2026-09-24-tab9-ondevice-stateless-static-mk300-manual-1.json";

    it("fails one export, the known 866.7 ms stall, on the gap arm alone", () => {
        const failing = read.filter(({ r }) => r.fails.length);
        expect(failing.map(({ name }) => name)).toEqual([KNOWN_STALL]);
        expect(armsFailed(failing[0].r)).toEqual(["gaps"]);
        expect(failing[0].r.maxGap.toFixed(1)).toBe("866.7");
    });

    it("passes every arm on the other 86", () => {
        expect(read.filter(({ r }) => !r.fails.length)).toHaveLength(86);
    });

    it("leaves unread only the exports with no clip duration", () => {
        const unread = rows.filter(({ r }) => r.maxGap === null);
        expect(unread).toHaveLength(9);
        for (const { r } of unread)
            expect(r.fails[0]).toMatch(/^no clip duration or no frames to read/);
    });

    // The verdicts M3's and M4's records wrote, reproduced from the module, at
    // the precision the command prints them.
    it("reproduces M3's device session: largest gap 240.8 ms, no excess in a counted loop", () => {
        const m3 = read.filter(({ name }) => name.startsWith("2026-10-01-tab9-m3-"));
        expect(m3).toHaveLength(17);
        for (const { name, r } of m3) {
            expect(r.fails, name).toEqual([]);
            expect(r.read, name).toEqual([1, 2, 3, 4]);
            // sync-wall-2, -3 and -4 hold gaps of 240.802 and 240.803 ms, so an
            // excess of 0.002 or 0.003 ms over the bound's 240.8: "0 ms" printed.
            expect(r.worstExcess.toFixed(0), name).toBe("0");
        }
        expect(Math.max(...m3.map(({ r }) => r.maxGap)).toFixed(1)).toBe("240.8");
    });

    it("reproduces M4's pre-flight PASS", () => {
        const [{ r }] = read.filter(
            ({ name }) => name === "2026-10-13-tab9-m4-preflight-sync-wall.json",
        );
        expect(r.fails).toEqual([]);
    });

    it("reproduces M4's calibration: every run passes, with its largest gap and where", () => {
        const recorded = [
            ["sync-static-1", "366.7", 2],
            ["worker-static-1", "133.3", 7],
            ["worker-static-2", "166.7", 7],
            ["sync-static-2", "233.3", 1],
            ["sync-static-3", "200.0", 1],
            ["worker-static-3", "133.3", 90],
            ["worker-static-4", "133.3", 6],
            ["sync-static-4", "200.0", 1],
        ];
        for (const [run, gap, at] of recorded) {
            const [{ r }] = read.filter(
                ({ name }) => name === `2026-10-14-tab9-m4-calibration-${run}.json`,
            );
            expect(r.fails, run).toEqual([]);
            expect(r.read, run).toEqual([1, 2, 3, 4]);
            expect(r.worstExcess, run).toBe(0);
            expect([r.maxGap.toFixed(1), r.maxAt], run).toEqual([gap, at]);
        }
    });
});

describe("scripts/stall-check.mjs", () => {
    const run = (name) => {
        const r = spawnSync(process.execPath, [SCRIPT, `${BENCHMARKS}${name}`], {
            encoding: "utf8",
            timeout: 60000,
        });
        return { status: r.status, lines: r.stdout.trim().split("\n") };
    };

    it("exits 0 on a passing export, its last line PASS", () => {
        const { status, lines } = run("2026-10-13-tab9-m4-preflight-sync-wall.json");
        expect(status).toBe(0);
        expect(lines.at(-1)).toBe("stall check: PASS");
        expect(lines[0]).toMatch(
            /^largest gap \d+\.\d ms \(frame \d+\); loops seen 0–\d+, read 1, 2, 3, 4;/,
        );
    });

    it("exits 1 on the known stall, naming the gap arm, its last line FAIL", () => {
        const { status, lines } = run(
            "2026-09-24-tab9-ondevice-stateless-static-mk300-manual-1.json",
        );
        expect(status).toBe(1);
        expect(lines.at(-1)).toBe("stall check: FAIL");
        expect(lines.filter((l) => l.startsWith("FAIL "))).toEqual([
            expect.stringMatching(
                /^FAIL gaps: frame \d+: a gap of 866\.7 ms in media time, above 500 ms$/,
            ),
        ]);
    });
});
