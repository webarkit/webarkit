/*
 *  detection-worker-bundle.test.mjs
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
 * The detection worker's bundle, and the build that makes it. A module worker
 * does not read the page's import map, and the packages import each other by
 * bare name, so the worker is one file with nothing left to resolve at run
 * time. What is pinned here is that property, and the build wiring that
 * produces it: the tool at an exact version, and its step last in the chain,
 * after the `dist/` of the packages it reads.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BUNDLE = new URL("../dist/detection-worker.mjs", import.meta.url);
const ROOT_PACKAGE = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

describe("the detection worker's bundle", () => {
    it("is built, and resolves every module at build time: no bare import is left", () => {
        // `npm run build` writes it. A missing file is this test's failure, not
        // a skip: a worker that was never bundled is the worker that cannot load.
        expect(existsSync(BUNDLE), "run `npm run build` first").toBe(true);

        const text = readFileSync(BUNDLE, "utf8");
        expect(text).not.toMatch(/\bfrom\s*["']@/);
        expect(text).not.toMatch(/\bimport\s*\(\s*["']@/);
        expect(text).not.toMatch(/\bimport\s*["']@/);
    });

    it("pins esbuild exactly", () => {
        // No caret: a bundler that moves under a benchmark moves the code the
        // benchmark measures. `prettier` is pinned the same way.
        expect(ROOT_PACKAGE.devDependencies.esbuild).toBe("0.28.2");
    });

    it("builds the worker after the three packages, explicitly", () => {
        const { build, "build:worker": buildWorker } = ROOT_PACKAGE.scripts;
        expect(build.endsWith(" && npm run build:worker")).toBe(true);
        expect(buildWorker).toContain("examples/js/detection-worker.mjs");
        expect(buildWorker).toContain("--outfile=examples/dist/detection-worker.mjs");
    });
});
