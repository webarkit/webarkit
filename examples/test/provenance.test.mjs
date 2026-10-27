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

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { provenanceFindings, provenanceRefusal } from "../js/bench-metrics.mjs";
import { SERVED } from "../../scripts/build-provenance.mjs";

const ROOT = new URL("../../", import.meta.url);
const bytes = (path) => readFileSync(new URL(path, ROOT));
const sha256 = (path) => createHash("sha256").update(bytes(path)).digest("hex");

describe("provenanceRefusal", () => {
    const manifest = {
        head: "0123456789abcdef0123456789abcdef01234567",
        clean: true,
        dirtyPaths: [],
        bundle: { path: "examples/dist/webarkit-packages.mjs", sha256: "b" },
        served: {
            "examples/bench-nft.html": { sha256: "h" },
            "examples/js/a.mjs": { sha256: "a" },
        },
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
        ["no manifest", null, observed, /^Provenance: no manifest/],
        [
            "a manifest changed since page load",
            manifest,
            { ...observed, manifestChanged: true },
            /changed since the page loaded/,
        ],
        [
            "a dirty tree",
            { ...manifest, clean: false, dirtyPaths: ["examples/js/a.mjs"] },
            observed,
            /dirty tree \(examples\/js\/a\.mjs\)/,
        ],
        [
            "another bundle",
            manifest,
            { ...observed, bundleSha256: "x" },
            /served bundle is not the one built/,
        ],
        [
            "a served file that differs",
            manifest,
            { ...observed, served: { ...observed.served, "examples/js/a.mjs": "x" } },
            /differ from the build: examples\/js\/a\.mjs/,
        ],
        [
            "a served file that could not be fetched",
            manifest,
            { ...observed, served: { "examples/bench-nft.html": "h" } },
            /differ from the build: examples\/js\/a\.mjs/,
        ],
        [
            "a module the manifest does not list",
            manifest,
            { ...observed, loaded: [...observed.loaded, "examples/js/z.mjs"] },
            /does not list: examples\/js\/z\.mjs/,
        ],
        // Blind conditions (#110, A5): the check cannot see what ran, so it refuses.
        [
            "a module run from the HTTP cache",
            manifest,
            { ...observed, unfetched: ["examples/js/a.mjs"] },
            /run from the HTTP cache \(a hit, or a 304\).*examples\/js\/a\.mjs.*no-store/,
        ],
        [
            "a response the browser may store",
            manifest,
            {
                ...observed,
                cacheControl: {
                    "examples/js/a.mjs": "max-age=3600",
                    "examples/bench-nft.html": "no-store",
                },
            },
            /lets the browser cache: examples\/js\/a\.mjs \(max-age=3600\)\. To fix: serve with Cache-Control: no-store/,
        ],
        [
            "a response with no Cache-Control at all",
            manifest,
            { ...observed, cacheControl: { "examples/js/a.mjs": null } },
            /lets the browser cache: examples\/js\/a\.mjs \(no Cache-Control\)/,
        ],
        [
            "a full resource timeline",
            manifest,
            { ...observed, timelineFull: true },
            /buffer overflowed.*To fix: reload the page\.$/,
        ],
        [
            "a bundle missing from the timeline",
            manifest,
            { ...observed, loaded: ["examples/js/a.mjs"] },
            /not in the page's resource timeline.*examples\/dist\/webarkit-packages\.mjs/,
        ],
        [
            "a manifest built without git",
            { ...manifest, head: null, clean: false },
            observed,
            /git could not describe the tree.*To fix: in a git checkout, commit/,
        ],
    ])("refuses a session run on %s", (_, m, o, why) => {
        expect(provenanceRefusal(m, o, session)).toMatch(why);
    });

    // #119: Start read `head` only for null, so `head: ""` passed, and it read `clean` alone, so
    // `clean: true` beside a non-empty `dirtyPaths` passed. No build writes either.
    it.each([
        ["an empty head", { ...manifest, head: "" }, /the manifest's head "" is not a full commit/],
        [
            "a short head",
            { ...manifest, head: "0123456" },
            /the manifest's head "0123456" is not a full commit/,
        ],
        [
            "a head that is not hex",
            { ...manifest, head: "z".repeat(40) },
            /the manifest's head "z{40}" is not a full commit/,
        ],
        [
            "a head one digit too long",
            { ...manifest, head: `${manifest.head}0` },
            /the manifest's head "[0-9a-f]{41}" is not a full commit/,
        ],
        [
            "an upper-case head",
            { ...manifest, head: manifest.head.toUpperCase() },
            /the manifest's head "[0-9A-F]{40}" is not a full commit/,
        ],
        [
            "a clean flag beside dirty paths",
            { ...manifest, dirtyPaths: ["examples/js/a.mjs"] },
            /the manifest says its tree is clean, but lists dirty paths \(examples\/js\/a\.mjs\)/,
        ],
        [
            "a clean flag beside no list of dirty paths",
            { ...manifest, dirtyPaths: undefined },
            /the manifest says its tree is clean, but its dirtyPaths is not a list \(none\)/,
        ],
        [
            "a dirty flag beside no dirty path, from a git build",
            { ...manifest, clean: false },
            /the manifest says its tree is dirty, but lists no dirty path/,
        ],
    ])("refuses a session run on a manifest with %s, as hand-edited or broken", (_, m, why) => {
        const r = provenanceRefusal(m, observed, session);
        expect(r, `provenanceFindings took ${JSON.stringify(m)}`).toMatch(why);
        expect(r).toMatch(
            /, so it was hand-edited or written by a broken build\. To fix: run `npm run build`\.$/,
        );
    });

    it("lets a session run start on a full commit hash, SHA-1's or SHA-256's", () => {
        for (const head of [manifest.head, "0123456789abcdef".repeat(4)]) {
            expect(provenanceRefusal({ ...manifest, head }, observed, session)).toBeNull();
        }
    });

    // The build without git writes head null, clean false and dirtyPaths []: a dirty flag beside
    // no dirty path, which is its own finding, never the flags' disagreement.
    it("reads a manifest built without git as such, not as one whose flags disagree", () => {
        const r = provenanceRefusal({ ...manifest, head: null, clean: false }, observed, session);
        expect(r).toMatch(/git could not describe the tree/);
        expect(r).not.toMatch(/hand-edited|dirty tree/);
    });

    // #120 (PF3, PF4, PF5, PF6, PF12): each of these passed with every row above green. A refusal
    // that went missing fails as an assertion naming provenanceFindings, not as a null `toMatch`.
    it.each([
        [
            "a manifest that records no head",
            Object.fromEntries(Object.entries(manifest).filter(([k]) => k !== "head")),
            observed,
            /git could not describe the tree/,
        ],
        [
            "a manifest built without git that says its tree is clean",
            { ...manifest, head: null, clean: true },
            observed,
            /git could not describe the tree/,
        ],
        [
            "a manifest that records no clean flag",
            { ...manifest, clean: undefined },
            observed,
            /built from a dirty tree/,
        ],
        [
            "a manifest whose clean flag is not a boolean",
            { ...manifest, clean: "true" },
            observed,
            /built from a dirty tree/,
        ],
        [
            "a bundle that could not be fetched at Start",
            manifest,
            { ...observed, bundleSha256: null },
            /served bundle is not the one built/,
        ],
        [
            "a response the browser may store and revalidate (no-cache)",
            manifest,
            { ...observed, cacheControl: { "examples/js/a.mjs": "no-cache" } },
            /lets the browser cache: examples\/js\/a\.mjs \(no-cache\)/,
        ],
    ])("refuses a session run on %s", (what, m, o, why) => {
        expect(
            provenanceRefusal(m, o, session),
            `provenanceFindings let a session run start on ${what}`,
        ).toEqual(expect.stringMatching(why));
    });

    it("passes responses that carry no-store, among other directives", () => {
        const cacheControl = {
            "examples/js/a.mjs": "no-store",
            "examples/bench-nft.html": "no-cache, no-store, must-revalidate",
        };
        expect(provenanceRefusal(manifest, { ...observed, cacheControl }, session)).toBeNull();
    });

    it("names every reason at once, each remedy once", () => {
        const refusal = provenanceRefusal(
            { ...manifest, clean: false, dirtyPaths: ["examples/js/a.mjs"] },
            { ...observed, bundleSha256: "x" },
            session,
        );
        expect(refusal).toMatch(
            /dirty tree.*; the served bundle.*To fix: commit, run `npm run build`, and reload\.$/,
        );
        expect(refusal.match(/npm run build/g)).toHaveLength(1);
    });

    it("names every other finding beside a changed manifest, with every remedy", () => {
        const cacheControl = { "examples/js/a.mjs": "max-age=3600" };
        const refusal = provenanceRefusal(
            manifest,
            { ...observed, manifestChanged: true, cacheControl },
            session,
        );
        expect(refusal).toMatch(/changed since the page loaded; the server lets the browser cache/);
        expect(refusal).toMatch(/To fix: reload the page; serve with Cache-Control: no-store/);
    });

    it("gives a blind condition its own remedy, never a rebuild that cannot fix it", () => {
        for (const o of [
            { ...observed, unfetched: ["examples/js/a.mjs"] },
            { ...observed, timelineFull: true },
            { ...observed, cacheControl: { "examples/js/a.mjs": "max-age=0" } },
        ]) {
            expect(provenanceRefusal(manifest, o, session)).not.toMatch(/npm run build/);
        }
    });

    it("refuses nothing outside a session run, and still reports what it found", () => {
        expect(provenanceRefusal(null, observed, { sessionRun: false })).toBeNull();
        const mismatch = { ...observed, bundleSha256: "x" };
        expect(provenanceRefusal(manifest, mismatch, { sessionRun: false })).toBeNull();
        expect(provenanceFindings(manifest, mismatch)).toMatch(
            /served bundle is not the one built/,
        );
        expect(provenanceFindings(manifest, observed)).toBeNull();
    });

    describe("in a worker run", () => {
        const sides = {
            ...manifest,
            served: {
                ...manifest.served,
                "examples/js/p.mjs": { sha256: "p", side: "page" },
                "examples/js/w.mjs": { sha256: "w", side: "worker" },
                "examples/js/both.mjs": { sha256: "o", side: "both" },
                "examples/js/entry.mjs": { sha256: "e", side: "bundled" },
            },
        };
        const seen = {
            ...observed,
            served: {
                ...observed.served,
                "examples/js/p.mjs": "p",
                "examples/js/w.mjs": "w",
                "examples/js/both.mjs": "o",
                "examples/js/entry.mjs": "e",
            },
            loaded: [
                ...observed.loaded,
                "examples/js/p.mjs",
                "examples/js/w.mjs",
                "examples/js/both.mjs",
            ],
        };
        const worker = { sessionRun: true, detection: "worker" };
        const sync = { sessionRun: true, detection: "sync" };
        const without = (...paths) => ({
            ...seen,
            loaded: seen.loaded.filter((p) => !paths.includes(p)),
        });

        it("starts when every module the run loads was seen loading; the bundled entry is never required", () => {
            expect(provenanceRefusal(sides, seen, worker)).toBeNull();
            expect(provenanceRefusal(sides, seen, sync)).toBeNull();
        });

        it("refuses a worker run blind to a worker-side module, worker or both", () => {
            const refusal = provenanceRefusal(
                sides,
                without("examples/js/w.mjs", "examples/js/both.mjs"),
                worker,
            );
            expect(refusal).toMatch(
                /cannot be seen: examples\/js\/w\.mjs, examples\/js\/both\.mjs/,
            );
            expect(refusal).toMatch(/To fix: run it in a browser that records module loads/);
            expect(refusal).not.toMatch(/npm run build/);
        });

        it("does not ask a synchronous run for the worker's own modules", () => {
            expect(provenanceRefusal(sides, without("examples/js/w.mjs"), sync)).toBeNull();
        });

        it.each([
            ["a page-side module", "examples/js/p.mjs"],
            ["a module both arms load", "examples/js/both.mjs"],
            ["the bundle", "examples/dist/webarkit-packages.mjs"],
        ])("refuses either arm blind to %s", (_, path) => {
            for (const arm of [sync, worker]) {
                expect(provenanceRefusal(sides, without(path), arm)).toMatch(
                    new RegExp(`cannot be seen: ${path.replace(/[./]/g, "\\$&")}`),
                );
            }
        });
    });
});

describe("the manifest npm run build writes", () => {
    const manifest = JSON.parse(bytes("examples/dist/provenance.json"));

    /**
     * Why a hash in the manifest differs from the file on disk, as one line per
     * condition with both values, and the remedy. A hash that differs has one of
     * two causes with different remedies: the manifest was built at another
     * commit, or at this one with a dirty tree. The checkout's state comes from
     * git; without git the lines say so. (#135: the root build overwrote an
     * attested build without a word, and this message was the only account.)
     */
    const whyStale = () => {
        const git = (...args) => {
            try {
                return execFileSync("git", args, {
                    cwd: fileURLToPath(ROOT),
                    encoding: "utf8",
                }).trim();
            } catch {
                return null;
            }
        };
        const head = git("rev-parse", "HEAD");
        const status = git("status", "--porcelain", "--untracked-files=no");
        const dirty = status === null ? null : status.split("\n").filter(Boolean);
        return [
            `manifest head: ${manifest.head}; checkout HEAD: ${head ?? "unknown (git unavailable)"}${head && head !== manifest.head ? " -- built at another commit" : ""}`,
            `manifest clean: ${manifest.clean}; tree clean now: ${dirty === null ? "unknown (git unavailable)" : dirty.length === 0}${dirty && dirty.length > 0 ? " -- dirty: " + dirty.join(", ") : ""}${manifest.dirtyPaths?.length ? "; manifest dirtyPaths: " + manifest.dirtyPaths.join(", ") : ""}`,
            `remedy: rebuild from a clean tree at ${head ?? "the expected commit"} (npm run build)`,
        ].join("\n");
    };

    /**
     * `h` is `path`'s hash in the manifest. The message is built only when the
     * hashes differ: `whyStale` runs git twice, and as an eager argument it ran
     * for every file, which on Windows took the test past vitest's 5 s timeout.
     */
    const expectHash = (path, h) => {
        const onDisk = sha256(path);
        expect(
            h,
            h === onDisk
                ? undefined
                : `${path}: the manifest's hash is not the file's\n${whyStale()}`,
        ).toBe(onDisk);
    };

    it("hashes the files on disk, the bundle and jsfeat-next's included (rebuild after an edit)", () => {
        expect(manifest.schema).toBe("webarkit-bench-provenance/1");
        expect(manifest.head).toMatch(/^[0-9a-f]{40}$/);
        for (const [path, { sha256: h }] of Object.entries({
            ...manifest.sources,
            ...manifest.served,
        })) {
            expectHash(path, h);
        }
        expectHash(manifest.bundle.path, manifest.bundle.sha256);
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
        expect(
            Object.fromEntries(Object.entries(manifest.served).map(([p, e]) => [p, e.side])),
        ).toEqual(SERVED);
    });
});

describe("SERVED", () => {
    /** The relative modules `text` imports, as repository paths, `from` being the importer's. */
    const imports = (text, from) =>
        [...text.matchAll(/\b(?:from|import)\s*["'](\.\.?\/[^"']+)["']/g)].map((m) =>
            new URL(m[1], new URL(from, ROOT)).href.slice(ROOT.href.length),
        );
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
        const workerSide = closure([
            `examples/${page.match(/const WORKER_MODULE = "([^"]+)";/)[1]}`,
        ]);
        const expected = {
            "examples/bench-nft.html": "page",
            "examples/js/packages-bundle.mjs": "bundled",
        };
        for (const p of new Set([...pageSide, ...workerSide])) {
            expected[p] =
                pageSide.has(p) && workerSide.has(p) ? "both" : pageSide.has(p) ? "page" : "worker";
        }
        expect(SERVED).toEqual(expected);
    });
});
