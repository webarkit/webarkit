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
import { provenanceFindings, provenanceRefusal } from "../js/bench-metrics.mjs";
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
        // Blind conditions (#110, A5): the check cannot see what ran, so it refuses.
        ["a module taken from the HTTP cache", manifest, { ...observed, unfetched: ["examples/js/a.mjs"] }, /HTTP cache without asking the server.*examples\/js\/a\.mjs.*no-store/],
        ["a full resource timeline", manifest, { ...observed, timelineFull: true }, /buffer overflowed.*To fix: reload the page\.$/],
    ])("refuses a session run on %s", (_, m, o, why) => {
        expect(provenanceRefusal(m, o, session)).toMatch(why);
    });

    it("names every reason at once, each remedy once", () => {
        const refusal = provenanceRefusal({ ...manifest, clean: false }, { ...observed, bundleSha256: "x" }, session);
        expect(refusal).toMatch(/dirty tree.*; the served bundle.*To fix: commit, run `npm run build`, and reload\.$/);
        expect(refusal.match(/npm run build/g)).toHaveLength(1);
    });

    it("gives a blind condition its own remedy, never a rebuild that cannot fix it", () => {
        for (const o of [{ ...observed, unfetched: ["examples/js/a.mjs"] }, { ...observed, timelineFull: true }]) {
            expect(provenanceRefusal(manifest, o, session)).not.toMatch(/npm run build/);
        }
    });

    it("refuses nothing outside a session run, and still reports what it found", () => {
        expect(provenanceRefusal(null, observed, { sessionRun: false })).toBeNull();
        const mismatch = { ...observed, bundleSha256: "x" };
        expect(provenanceRefusal(manifest, mismatch, { sessionRun: false })).toBeNull();
        expect(provenanceFindings(manifest, mismatch)).toMatch(/served bundle is not the one built/);
        expect(provenanceFindings(manifest, observed)).toBeNull();
    });

    describe("in a worker run", () => {
        const sides = {
            ...manifest,
            served: {
                ...manifest.served,
                "examples/js/w.mjs": { sha256: "w", side: "worker" },
                "examples/js/both.mjs": { sha256: "o", side: "both" },
                "examples/js/entry.mjs": { sha256: "e", side: "bundled" },
            },
        };
        const seen = {
            ...observed,
            served: { ...observed.served, "examples/js/w.mjs": "w", "examples/js/both.mjs": "o", "examples/js/entry.mjs": "e" },
            loaded: [...observed.loaded, "examples/js/w.mjs", "examples/js/both.mjs"],
        };
        const worker = { sessionRun: true, detection: "worker" };

        it("starts when every worker-side module was seen loading", () => {
            expect(provenanceRefusal(sides, seen, worker)).toBeNull();
        });

        it("refuses when the check is blind to a worker-side module, worker or both", () => {
            const blind = { ...seen, loaded: observed.loaded };
            expect(provenanceRefusal(sides, blind, worker)).toMatch(
                /cannot be seen: examples\/js\/w\.mjs, examples\/js\/both\.mjs|cannot be seen: examples\/js\/both\.mjs, examples\/js\/w\.mjs/,
            );
            expect(provenanceRefusal(sides, blind, worker)).toMatch(/To fix: run it in a browser that records/);
            expect(provenanceRefusal(sides, blind, worker)).not.toMatch(/npm run build/);
            // The same observation is no refusal in a synchronous run, which has no worker.
            expect(provenanceRefusal(sides, blind, { sessionRun: true, detection: "sync" })).toBeNull();
        });
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

    it("lists every package source, and served exactly what SERVED names, with its side", () => {
        const sources = Object.keys(manifest.sources);
        for (const p of ["cv-backend-spec", "cv-backend-jsfeatnext", "nft-tracker"]) {
            expect(sources).toContain(`packages/${p}/package.json`);
            expect(sources.some((s) => s.startsWith(`packages/${p}/src/`))).toBe(true);
        }
        expect(sources).toContain("package-lock.json");
        expect(Object.fromEntries(Object.entries(manifest.served).map(([p, e]) => [p, e.side]))).toEqual(SERVED);
    });
});

describe("SERVED", () => {
    /** The relative modules `text` imports, as repository paths, `from` being the importer's. */
    const imports = (text, from) =>
        [...text.matchAll(/\b(?:from|import)\s*["'](\.\.?\/[^"']+)["']/g)].map((m) => new URL(m[1], new URL(from, ROOT)).href.slice(ROOT.href.length));
    /** Every module reachable from `roots` by relative imports, the bundle left out. */
    const closure = (roots) => {
        const seen = new Set();
        const queue = [...roots];
        while (queue.length > 0) {
            const path = queue.shift();
            if (seen.has(path) || path.startsWith("examples/dist/")) continue;
            seen.add(path);
            queue.push(...imports(bytes(path).toString(), path));
        }
        return seen;
    };

    it("is the page, the bundle's entry, and every module each arm imports, on the side that imports it", () => {
        const page = bytes("examples/bench-nft.html").toString();
        const pageSide = closure(imports(page, "examples/bench-nft.html"));
        const workerSide = closure([`examples/${page.match(/const WORKER_MODULE = "([^"]+)";/)[1]}`]);
        const expected = { "examples/bench-nft.html": "page", "examples/js/packages-bundle.mjs": "bundled" };
        for (const p of new Set([...pageSide, ...workerSide])) {
            expected[p] = pageSide.has(p) && workerSide.has(p) ? "both" : pageSide.has(p) ? "page" : "worker";
        }
        expect(SERVED).toEqual(expected);
    });
});
