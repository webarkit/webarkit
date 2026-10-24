/*
 *  glossary.test.mjs
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
 * The glossary's staleness check (#102, Part 2). `docs/benchmarks/glossary.md`
 * records the `METRICS_VERSION` it was written against and lists every key of
 * `DEFINITIONS`, defining none of them. This fails when either drifts from
 * `examples/js/bench-metrics.mjs`, which it reads and never changes.
 *
 * Its limit, which #102 records: a definition whose meaning changes with no
 * bump of `METRICS_VERSION`, and no key added or removed, passes.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFINITIONS, METRICS_VERSION } from "../js/bench-metrics.mjs";

const GLOSSARY = readFileSync(
    new URL("../../docs/benchmarks/glossary.md", import.meta.url),
    "utf8",
).replace(/\r\n/g, "\n");

const KEYS_HEADING = "### Every key of `DEFINITIONS`";

/** The lines after `heading`, up to the next heading of any level. */
function sectionLines(text, heading) {
    const lines = text.split("\n");
    const start = lines.indexOf(heading);
    if (start < 0) throw new Error(`the glossary has no heading "${heading}"`);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^#{1,6} /.test(line));
    return end < 0 ? rest : rest.slice(0, end);
}

describe("the benchmark glossary against bench-metrics.mjs (#102)", () => {
    it("records the module's METRICS_VERSION, once", () => {
        const recorded = [
            ...GLOSSARY.matchAll(/^Written against `METRICS_VERSION` (\d+)\.$/gm),
        ].map((m) => Number(m[1]));
        expect(recorded).toEqual([METRICS_VERSION]);
    });

    it("lists every key of DEFINITIONS once, and nothing else", () => {
        const items = sectionLines(GLOSSARY, KEYS_HEADING).filter((line) => line.startsWith("- "));
        const listed = items.map((line) => /^- `([^`]+)`$/.exec(line)?.[1]);
        const keys = Object.keys(DEFINITIONS);
        expect({
            malformed: items.filter((_, i) => listed[i] === undefined),
            missing: keys.filter((k) => !listed.includes(k)),
            unknown: listed.filter((k) => k !== undefined && !keys.includes(k)),
            repeated: listed.filter((k, i) => k !== undefined && listed.indexOf(k) !== i),
        }).toEqual({ malformed: [], missing: [], unknown: [], repeated: [] });
    });
});
