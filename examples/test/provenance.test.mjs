/*
 *  provenance.test.mjs
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
 * The provenance check (#110, §4–5): Start's refusal, decided by
 * `provenanceRefusal`; the manifest `npm run build` writes, against the files
 * on disk; and its list of served files, against the imports the page and the
 * worker actually make. What the page fetches at Start, and what the browser
 * caches, no test here can see: those are shown by a browser run.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { provenanceRefusal } from "../js/bench-metrics.mjs";
import { SERVED } from "../../scripts/build-provenance.mjs";

const ROOT = new URL("../../", import.meta.url);
const bytes = (path) => readFileSync(new URL(path, ROOT));
const sha256 = (path) => createHash("sha256").update(bytes(path)).digest("hex");

describe("provenanceRefusal", () => {
    const manifest = {
        clean: true,
        dirtyPaths: [],
        bundle: { path: "examples/dist/webarkit-packages.mjs", sha256: "b" },
        served: { "examples/bench-nft.html": { sha256: "h" }, "examples/js/a.mjs": { sha256: "a" } },
    };
    const observed = {
        manifestChanged: false,
        bundleSha256: "b",
        served: { "examples/bench-nft.html": "h", "examples/js/a.mjs": "a" },
        loaded: ["examples/dist/webarkit-packages.mjs", "examples/js/a.mjs"],
    };
    const session = { sessionRun: true };

    it("lets a session run start on what the manifest attests", () => {
        expect(provenanceRefusal(manifest, observed, session)).toBeNull();
    });

    it.each([
        ["no manifest", null, observed, /^No provenance manifest/],
        ["a manifest changed since page load", manifest, { ...observed, manifestChanged: true }, /changed since the page loaded/],
        ["a dirty tree", { ...manifest, clean: false, dirtyPaths: ["examples/js/a.mjs"] }, observed, /dirty tree \(examples\/js\/a\.mjs\)/],
        ["another bundle", manifest, { ...observed, bundleSha256: "x" }, /served bundle is not the one built/],
        ["a served file that differs", manifest, { ...observed, served: { ...observed.served, "examples/js/a.mjs": "x" } }, /differ from the build: examples\/js\/a\.mjs/],
        ["a served file that could not be fetched", manifest, { ...observed, served: { "examples/bench-nft.html": "h" } }, /differ from the build: examples\/js\/a\.mjs/],
        ["a module the manifest does not list", manifest, { ...observed, loaded: [...observed.loaded, "examples/js/z.mjs"] }, /does not list: examples\/js\/z\.mjs/],
    ])("refuses a session run on %s", (_, m, o, why) => {
        expect(provenanceRefusal(m, o, session)).toMatch(why);
    });

    it("names every reason at once", () => {
        const refusal = provenanceRefusal({ ...manifest, clean: false }, { ...observed, bundleSha256: "x" }, session);
        expect(refusal).toMatch(/dirty tree.*; the served bundle/);
    });

    it("refuses nothing outside a session run", () => {
        expect(provenanceRefusal(null, observed, { sessionRun: false })).toBeNull();
        expect(provenanceRefusal({ ...manifest, clean: false }, { ...observed, manifestChanged: true }, { sessionRun: false })).toBeNull();
    });
});

describe("the manifest npm run build writes", () => {
    const manifest = JSON.parse(bytes("examples/dist/provenance.json"));

    it("hashes the files on disk, the bundle and jsfeat-next's included (rebuild after an edit)", () => {
        expect(manifest.schema).toBe("webarkit-bench-provenance/1");
        expect(manifest.head).toMatch(/^[0-9a-f]{40}$/);
        for (const [path, { sha256: h }] of Object.entries({ ...manifest.sources, ...manifest.served })) {
            expect(h, path).toBe(sha256(path));
        }
        expect(manifest.bundle.sha256).toBe(sha256(manifest.bundle.path));
        const jsfeat = manifest.dependencies["@webarkit/jsfeat-next"];
        expect(jsfeat.sha256).toBe(sha256(jsfeat.file));
        expect(jsfeat.installedVersion).toBe(jsfeat.version);
    });

    it("lists every package source, and served exactly what SERVED names", () => {
        const sources = Object.keys(manifest.sources);
        for (const p of ["cv-backend-spec", "cv-backend-jsfeatnext", "nft-tracker"]) {
            expect(sources).toContain(`packages/${p}/package.json`);
            expect(sources.some((s) => s.startsWith(`packages/${p}/src/`))).toBe(true);
        }
        expect(sources).toContain("package-lock.json");
        expect(Object.keys(manifest.served)).toEqual(SERVED);
    });
});

describe("SERVED", () => {
    /** The relative modules `text` imports, as repository paths, `from` being the importer's. */
    const imports = (text, from) =>
        [...text.matchAll(/\b(?:from|import)\s*["'](\.\.?\/[^"']+)["']/g)].map((m) => new URL(m[1], new URL(from, ROOT)).href.slice(ROOT.href.length));

    it("is the page, the bundle's entry, and every module the page and the worker import", () => {
        const page = bytes("examples/bench-nft.html").toString();
        const worker = `examples/${page.match(/const WORKER_MODULE = "([^"]+)";/)[1]}`;
        const seen = new Set();
        const queue = [...imports(page, "examples/bench-nft.html"), worker];
        while (queue.length > 0) {
            const path = queue.shift();
            if (seen.has(path) || path.startsWith("examples/dist/")) continue;
            seen.add(path);
            queue.push(...imports(bytes(path).toString(), path));
        }
        const expected = ["examples/bench-nft.html", "examples/js/packages-bundle.mjs", ...seen].sort();
        expect([...SERVED].sort()).toEqual(expected);
    });
});
