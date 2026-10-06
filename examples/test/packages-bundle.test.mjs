/*
 *  packages-bundle.test.mjs
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
 * The bench page's shared bundle (#110, §1–2): one artifact both detection
 * arms load, the page through its import map and the worker by URL. What is
 * pinned here: that it imports nothing (a module worker reads no import map),
 * that `export *` dropped no name, that both arms resolve to the same URL, and
 * the build wiring that makes it.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const BUNDLE = new URL("../dist/webarkit-packages.mjs", import.meta.url);
const ROOT_PACKAGE = JSON.parse(read("../../package.json"));
const PACKAGES = ["cv-backend-spec", "cv-backend-jsfeatnext", "nft-tracker"];

describe("the shared package bundle", () => {
    it("is built, and imports nothing", () => {
        // A missing file is this test's failure, not a skip: `npm run build` writes it.
        expect(existsSync(BUNDLE), "run `npm run build` first").toBe(true);
        const text = readFileSync(BUNDLE, "utf8");
        expect(text).not.toMatch(/^\s*import[\s{*"']/m);
        expect(text).not.toMatch(/\bimport\s*\(/);
        expect(text).not.toMatch(/^\s*export\s[^;]*\bfrom\s*["']/m);
    });

    it("exports every name of the three packages: export * dropped none", async () => {
        const bundle = Object.keys(await import(BUNDLE.href)).sort();
        const names = [];
        for (const p of PACKAGES) names.push(...Object.keys(await import(`../../packages/${p}/dist/index.js`)));
        // A name two packages share would be dropped from the bundle, silently.
        expect(new Set(names).size).toBe(names.length);
        expect(bundle).toEqual(names.sort());
    });

    it("is what the page's import map and the worker load, by one URL", () => {
        const page = read("../bench-nft.html");
        const map = JSON.parse(page.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
        expect(Object.keys(map).sort()).toEqual(PACKAGES.map((p) => `@webarkit/${p}`).sort());
        const pageUrl = new URL("http://host/examples/bench-nft.html");
        for (const target of Object.values(map)) {
            expect(new URL(target, pageUrl).pathname).toBe("/examples/dist/webarkit-packages.mjs");
        }
        expect(page).toMatch(/const WORKER_MODULE = "js\/detection-worker\.mjs";/);
        const worker = read("../js/detection-worker.mjs");
        const specifiers = [...worker.matchAll(/^import [^;]* from "([^"]+)";$/gm)].map((m) => m[1]);
        expect(specifiers.filter((s) => !s.startsWith("./"))).toEqual(["../dist/webarkit-packages.mjs"]);
        const workerUrl = new URL("js/detection-worker.mjs", pageUrl);
        expect(new URL("../dist/webarkit-packages.mjs", workerUrl).pathname).toBe("/examples/dist/webarkit-packages.mjs");
    });

    it("is built by the provenance script, with esbuild pinned exactly", () => {
        // No caret: a bundler that moves under a benchmark moves the code it measures.
        expect(ROOT_PACKAGE.devDependencies.esbuild).toBe("0.28.2");
        expect(ROOT_PACKAGE.scripts.build).toBe("node scripts/build-provenance.mjs");
        expect(ROOT_PACKAGE.scripts["build:worker"]).toBeUndefined();
    });
});
