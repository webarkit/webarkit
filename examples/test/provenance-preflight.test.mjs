/*
 *  provenance-preflight.test.mjs
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
 * The provenance preflight (#136): whether the manifest `npm run build` wrote
 * describes this tree, its head HEAD, the tree clean and every hash the file's.
 * `preflight` takes git and the disk as readers, so every verdict here is
 * reached on a constructed tree with no git at all; the command itself is run
 * only where it exits 2 before asking git anything.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { outsideRoot, preflight } from "../../scripts/provenance-preflight.mjs";

const SCRIPT = fileURLToPath(new URL("../../scripts/provenance-preflight.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const hex = (c) => c.repeat(64);
// A SHA-1 repository's id, deliberately: such a repository is still valid. What the checkout itself
// prints may be either length: see `CHECKOUT_HEAD` and `PRODUCER_BLOB`.
const blob = (c) => c.repeat(40);

/** A full object id, as the preflight's `OBJECT_ID` reads one: SHA-1's or SHA-256's. */
const OBJECT_ID = "(?:[0-9a-f]{40}|[0-9a-f]{64})";
/** The command's line on the checkout's `HEAD`: the id is whichever length the repository uses. */
const CHECKOUT_HEAD = new RegExp(
    `manifest head: ${OTHER}; checkout HEAD: ${OBJECT_ID} -- built at another`,
);
/** The command's line on a producer's blob id, as {@link CHECKOUT_HEAD} reads the head. */
const PRODUCER_BLOB = new RegExp(
    `package\\.json: the manifest's blob id 0{40} is not the file's ${OBJECT_ID}$`,
    "m",
);

/** A manifest that describes `disk` below, built clean at HEAD. */
const manifest = () => ({
    schema: "webarkit-bench-provenance/1",
    head: HEAD,
    clean: true,
    dirtyPaths: [],
    bundle: { path: "examples/dist/webarkit-packages.mjs", sha256: hex("b") },
    sources: { "packages/p/src/a.ts": { sha256: hex("1"), blob: blob("1") } },
    build: {
        "scripts/build-provenance.mjs": { sha256: hex("5"), blob: blob("5") },
        "package.json": { sha256: hex("2"), blob: blob("2") },
    },
    served: { "examples/js/a.mjs": { sha256: hex("3"), blob: blob("3"), side: "both" } },
    // As the build writes it: every input the bundle took, jsfeat-next's file among them.
    bundledInputs: {
        "packages/p/dist/a.js": hex("7"),
        "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs": hex("4"),
    },
    dependencies: {
        "@webarkit/jsfeat-next": {
            version: "1.0.0",
            installedVersion: "1.0.0",
            file: "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs",
            sha256: hex("4"),
        },
    },
});
const disk = {
    "packages/p/src/a.ts": hex("1"),
    "packages/p/dist/a.js": hex("7"),
    "package.json": hex("2"),
    "scripts/build-provenance.mjs": hex("5"),
    "examples/js/a.mjs": hex("3"),
    "examples/dist/webarkit-packages.mjs": hex("b"),
    "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs": hex("4"),
};
const blobs = { "package.json": blob("2"), "scripts/build-provenance.mjs": blob("5") };

/**
 * The manifest as the build writes it where git is not usable (build-provenance.mjs): no head,
 * `clean` false, no dirty path, no sources (it lists them with `git ls-files`), and every blob id
 * null; the rest hashed as with git.
 */
function noGit() {
    const m = manifest();
    const unblobbed = (group) =>
        Object.fromEntries(Object.entries(group).map(([p, e]) => [p, { ...e, blob: null }]));
    return {
        ...m,
        head: null,
        clean: false,
        dirtyPaths: [],
        sources: {},
        build: unblobbed(m.build),
        served: unblobbed(m.served),
    };
}

/** The readers `preflight` takes, over `disk` unless `over` replaces one, each git reader counted. */
function tree(over = {}) {
    const calls = { head: 0, dirtyPaths: 0, blobs: 0 };
    const r = {
        head: () => HEAD,
        dirtyPaths: () => [],
        blobs: (paths) => paths.map((p) => blobs[p] ?? null),
        sha256: (path) => disk[path] ?? null,
        resolvesOutside: () => false,
        served: { "examples/js/a.mjs": "both" },
        ...over,
    };
    const t = {
        ...r,
        head: () => (calls.head++, r.head()),
        dirtyPaths: () => (calls.dirtyPaths++, r.dirtyPaths()),
        blobs: (paths) => (calls.blobs++, r.blobs(paths)),
    };
    return { t, calls };
}
const text = (r) => r.lines.join("\n");

describe("preflight", () => {
    it("passes a manifest that describes the tree, asking git once for each thing", () => {
        const { t, calls } = tree();
        const r = preflight(manifest(), t);
        expect(r.code, text(r)).toBe(0);
        expect(calls).toEqual({ head: 1, dirtyPaths: 1, blobs: 1 });
    });

    it.each([
        [
            "a head that is not HEAD",
            { ...manifest(), head: OTHER },
            {},
            new RegExp(
                `manifest head: ${OTHER}; checkout HEAD: ${HEAD} -- built at another commit`,
            ),
        ],
        [
            "a checkout git cannot describe",
            manifest(),
            { head: () => null, dirtyPaths: () => null, blobs: () => null },
            /checkout HEAD: unknown \(git unavailable\)/,
        ],
        [
            "a manifest built without git",
            { ...manifest(), head: null, clean: false },
            {},
            /manifest head: null; .* -- built without git/,
        ],
        // The build's own output without git: stale for any checkout, never malformed (Qodo, #210).
        [
            "the manifest the build writes without git",
            noGit(),
            {},
            /^manifest head: null; .* -- built without git$/m,
        ],
        [
            "the manifest the build writes without git, on a checkout git cannot describe",
            noGit(),
            { head: () => null, dirtyPaths: () => null, blobs: () => null },
            /^manifest head: null; checkout HEAD: unknown \(git unavailable\) -- built without git$/m,
        ],
        [
            "a dirty path in the tree now",
            manifest(),
            { dirtyPaths: () => ["examples/js/a.mjs"] },
            /manifest clean: true; tree clean now: false -- dirty: examples\/js\/a\.mjs/,
        ],
        [
            "a manifest built from a dirty tree",
            { ...manifest(), clean: false, dirtyPaths: ["examples/js/a.mjs"] },
            {},
            /manifest clean: false; .*-- built from a dirty tree: examples\/js\/a\.mjs/,
        ],
        [
            "a stale served hash",
            manifest(),
            { sha256: (p) => (p === "examples/js/a.mjs" ? hex("9") : disk[p]) },
            /examples\/js\/a\.mjs: the manifest's hash 3{12}… is not the file's 9{12}…/,
        ],
        [
            "a stale source hash",
            manifest(),
            { sha256: (p) => (p === "packages/p/src/a.ts" ? hex("9") : disk[p]) },
            /packages\/p\/src\/a\.ts: the manifest's hash 1{12}… is not the file's 9{12}…/,
        ],
        [
            "a stale producer hash",
            manifest(),
            { sha256: (p) => (p === "package.json" ? hex("9") : disk[p]) },
            /package\.json: the manifest's hash 2{12}… is not the file's 9{12}…/,
        ],
        [
            "a stale bundle hash",
            manifest(),
            { sha256: (p) => (p === "examples/dist/webarkit-packages.mjs" ? hex("9") : disk[p]) },
            /examples\/dist\/webarkit-packages\.mjs: the manifest's hash b{12}… is not the file's/,
        ],
        [
            "a stale jsfeat-next file",
            manifest(),
            { sha256: (p) => (p.startsWith("node_modules/") ? hex("9") : disk[p]) },
            /jsfeatNext\.mjs: the manifest's hash 4{12}… is not the file's 9{12}…/,
        ],
        // Gitignored, so `clean` cannot see it: only its hash can (Qodo on #210).
        [
            "a stale bundled input",
            manifest(),
            { sha256: (p) => (p === "packages/p/dist/a.js" ? hex("9") : disk[p]) },
            /packages\/p\/dist\/a\.js: the manifest's hash 7{12}… is not the file's 9{12}…/,
        ],
        [
            "a file missing on disk",
            manifest(),
            { sha256: (p) => (p === "examples/js/a.mjs" ? null : disk[p]) },
            /examples\/js\/a\.mjs: the manifest's hash 3{12}… is not the file's: none on disk/,
        ],
        [
            "a producer whose blob id is not the file's",
            manifest(),
            { blobs: (paths) => paths.map(() => blob("9")) },
            /package\.json: the manifest's blob id 2{40} is not the file's 9{40}/,
        ],
        [
            "a served file SERVED does not name",
            manifest(),
            { served: {} },
            /served: the manifest lists examples\/js\/a\.mjs, which SERVED does not/,
        ],
        [
            "a SERVED file the manifest does not list",
            manifest(),
            { served: { "examples/js/a.mjs": "both", "examples/js/z.mjs": "page" } },
            /served: SERVED names examples\/js\/z\.mjs, which the manifest does not list/,
        ],
        [
            "a served file on another side",
            manifest(),
            { served: { "examples/js/a.mjs": "page" } },
            /served: examples\/js\/a\.mjs is on side both in the manifest, page in SERVED/,
        ],
        // Not a key of SERVED's own, though `in` would find it on Object.prototype.
        [
            "a served file named like an Object property",
            {
                ...manifest(),
                served: {
                    ...manifest().served,
                    constructor: { sha256: hex("6"), blob: blob("6"), side: "page" },
                },
            },
            { sha256: (p) => (p === "constructor" ? hex("6") : disk[p]) },
            /served: the manifest lists constructor, which SERVED does not/,
        ],
        [
            "a producer git cannot give blob ids for",
            manifest(),
            { blobs: () => null },
            /build: git gave no blob ids for scripts\/build-provenance\.mjs, package\.json/,
        ],
    ])("fails on %s, naming it, with the remedy", (_, m, over, why) => {
        const r = preflight(m, tree(over).t);
        expect(r.code, text(r)).toBe(1);
        expect(text(r)).toMatch(why);
        expect(text(r)).toMatch(/\nremedy: .*npm run build/);
    });

    it("names every finding at once, the remedy once, and still asks git once each", () => {
        const { t, calls } = tree({
            dirtyPaths: () => ["examples/js/a.mjs", "package.json"],
            sha256: () => hex("9"),
        });
        const r = preflight({ ...manifest(), head: OTHER }, t);
        expect(r.code).toBe(1);
        for (const what of [
            /built at another commit/,
            /dirty: examples\/js\/a\.mjs, package\.json/,
            /packages\/p\/src\/a\.ts: the manifest's hash/,
            /examples\/js\/a\.mjs: the manifest's hash/,
            /package\.json: the manifest's hash/,
            /webarkit-packages\.mjs: the manifest's hash/,
            /jsfeatNext\.mjs: the manifest's hash/,
        ]) {
            expect(text(r)).toMatch(what);
        }
        expect(text(r).match(/remedy:/g)).toHaveLength(1);
        expect(calls).toEqual({ head: 1, dirtyPaths: 1, blobs: 1 });
    });

    it("names no blob id per file when git gave none, only that it gave none", () => {
        const r = preflight(manifest(), tree({ blobs: () => null }).t);
        expect(text(r)).not.toMatch(/the manifest's blob id/);
    });

    // HEAD names the commit to rebuild at only if the tree is clean: committing moves it.
    it("names the commit to rebuild at on a clean tree, and none on a dirty one", () => {
        const stale = tree({ sha256: (p) => (p === "examples/js/a.mjs" ? hex("9") : disk[p]) });
        expect(preflight(manifest(), stale.t).lines.at(-1)).toBe(
            `remedy: rebuild from a clean tree at ${HEAD} (npm run build)`,
        );
        const dirty = tree({ dirtyPaths: () => ["examples/js/a.mjs"] });
        expect(preflight(manifest(), dirty.t).lines.at(-1)).toBe(
            "remedy: commit, then rebuild from the clean tree (npm run build)",
        );
    });

    // Exit 2: no verdict, the field named, and git never asked (#206 and #209 are the same shape of
    // input elsewhere: there it throws or exits 1 with a stack).
    const m = manifest;
    it.each([
        ["null", null, /the manifest is not a JSON object/],
        ["an array", [], /the manifest is not a JSON object/],
        ["a string", "x", /the manifest is not a JSON object/],
        ["another schema", { ...m(), schema: "x/2" }, /schema: "x\/2" is not/],
        ["a head that is not a commit", { ...m(), head: "0123456" }, /head: "0123456" is not/],
        ["a clean flag that is not a boolean", { ...m(), clean: "yes" }, /clean: "yes" is not/],
        ["no dirtyPaths", { ...m(), dirtyPaths: undefined }, /dirtyPaths: undefined is not/],
        ["dirtyPaths not of strings", { ...m(), dirtyPaths: [1] }, /dirtyPaths: \[1\] is not/],
        [
            "a clean flag beside dirty paths",
            { ...m(), dirtyPaths: ["examples/js/a.mjs"] },
            /clean, dirtyPaths: the manifest says its tree is clean, but lists dirty paths/,
        ],
        [
            "a dirty flag beside no dirty path, from a git build",
            { ...m(), clean: false },
            /clean, dirtyPaths: the manifest says its tree is dirty, but lists no dirty path/,
        ],
        ["no bundle", { ...m(), bundle: undefined }, /bundle: undefined is not/],
        [
            "a bundle hash that is not SHA-256",
            { ...m(), bundle: { ...m().bundle, sha256: "abc" } },
            /bundle\.sha256: "abc" is not/,
        ],
        ["sources that are a list", { ...m(), sources: [] }, /sources: \[\] is not/],
        ["no build", { ...m(), build: undefined }, /build: undefined is not/],
        [
            "a null served entry",
            { ...m(), served: { "examples/js/a.mjs": null } },
            /served\["examples\/js\/a\.mjs"\]: null is not/,
        ],
        [
            "a served hash that is not SHA-256",
            {
                ...m(),
                served: { "examples/js/a.mjs": { ...m().served["examples/js/a.mjs"], sha256: 3 } },
            },
            /served\["examples\/js\/a\.mjs"\]\.sha256: 3 is not/,
        ],
        [
            "a served entry with no side",
            { ...m(), served: { "examples/js/a.mjs": { sha256: hex("3"), blob: blob("3") } } },
            /served\["examples\/js\/a\.mjs"\]\.side: undefined is not/,
        ],
        [
            "a blob id that is not an object id",
            { ...m(), build: { ...m().build, "package.json": { sha256: hex("2"), blob: "zz" } } },
            /build\["package\.json"\]\.blob: "zz" is not/,
        ],
        // The producer writes these paths and no other; any other would leave a file unchecked.
        [
            "a bundle elsewhere than the build writes it",
            { ...m(), bundle: { ...m().bundle, path: "package.json", sha256: hex("2") } },
            /bundle\.path: "package\.json" is not "examples\/dist\/webarkit-packages\.mjs"/,
        ],
        [
            "a jsfeat-next file other than the one bundled",
            {
                ...m(),
                dependencies: {
                    "@webarkit/jsfeat-next": {
                        ...m().dependencies["@webarkit/jsfeat-next"],
                        file: "package.json",
                    },
                },
            },
            /dependencies\["@webarkit\/jsfeat-next"\]\.file: "package\.json" is not "node_modules/,
        ],
        [
            "a build that does not hash both producer files",
            { ...m(), build: { "package.json": m().build["package.json"] } },
            /build: \["package\.json"\] is not \["scripts\/build-provenance\.mjs","package\.json"\]/,
        ],
        ["no sources", { ...m(), sources: {} }, /sources: \{\} is not an object of paths/],
        // Only the build without git writes no sources and null blob ids; a git build never does.
        [
            "no sources beside a dirty flag and a head",
            { ...m(), clean: false, dirtyPaths: ["examples/js/a.mjs"], sources: {} },
            /sources: \{\} is not an object of paths/,
        ],
        [
            "no sources beside no head that says its tree is clean",
            { ...noGit(), clean: true },
            /sources: \{\} is not an object of paths/,
        ],
        [
            "a null blob id in a git build",
            {
                ...m(),
                served: { "examples/js/a.mjs": { ...m().served["examples/js/a.mjs"], blob: null } },
            },
            /served\["examples\/js\/a\.mjs"\]\.blob: null is not a git object id/,
        ],
        [
            "no bundledInputs",
            { ...m(), bundledInputs: undefined },
            /bundledInputs: undefined is not an object of paths/,
        ],
        [
            "bundledInputs that are a list",
            { ...m(), bundledInputs: [] },
            /bundledInputs: \[\] is not an object of paths/,
        ],
        ["empty bundledInputs", { ...m(), bundledInputs: {} }, /bundledInputs: \{\} is not/],
        [
            "a bundled input whose hash is not SHA-256",
            { ...m(), bundledInputs: { ...m().bundledInputs, "packages/p/dist/a.js": "abc" } },
            /bundledInputs\["packages\/p\/dist\/a\.js"\]: "abc" is not a SHA-256/,
        ],
        [
            "a bundled input that is not a relative path",
            { ...m(), bundledInputs: { ...m().bundledInputs, "/etc/passwd": hex("7") } },
            /bundledInputs\["\/etc\/passwd"\]: .* is not a relative path/,
        ],
        [
            "a bundled input that climbs out of the repository",
            { ...m(), bundledInputs: { ...m().bundledInputs, "packages/../../x.js": hex("7") } },
            /bundledInputs\["packages\/\.\.\/\.\.\/x\.js"\]: .* is not a relative path/,
        ],
        // The build records jsfeat-next's file twice, in bundledInputs and dependencies; one file.
        [
            "jsfeat-next's two hashes disagreeing",
            {
                ...m(),
                bundledInputs: {
                    ...m().bundledInputs,
                    "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs": hex("8"),
                },
            },
            /bundledInputs\["node_modules\/@webarkit\/jsfeat-next\/dist\/jsfeatNext\.mjs"\]: 8{64} is not dependencies\["@webarkit\/jsfeat-next"\]\.sha256 4{64}/,
        ],
        // One path, two entries: only one of the hashes would be compared.
        [
            "a path both a source and a producer file",
            {
                ...m(),
                sources: { ...m().sources, "package.json": { sha256: hex("1"), blob: blob("1") } },
            },
            /package\.json: hashed in both sources and build/,
        ],
        [
            "a served file that is also the bundle",
            {
                ...m(),
                bundle: { ...m().bundle, path: "examples/js/a.mjs" },
            },
            /bundle\.path: "examples\/js\/a\.mjs" is not/,
        ],
        [
            "no jsfeat-next dependency",
            { ...m(), dependencies: {} },
            /dependencies\["@webarkit\/jsfeat-next"\]: undefined is not/,
        ],
        [
            "a jsfeat-next file that is not a path",
            {
                ...m(),
                dependencies: {
                    "@webarkit/jsfeat-next": {
                        ...m().dependencies["@webarkit/jsfeat-next"],
                        file: 0,
                    },
                },
            },
            /dependencies\["@webarkit\/jsfeat-next"\]\.file: 0 is not/,
        ],
    ])("exits 2 on %s, naming the field, without asking git", (_, bad, why) => {
        const { t, calls } = tree();
        const r = preflight(bad, t);
        expect(r.code, text(r)).toBe(2);
        expect(text(r)).toMatch(why);
        expect(calls).toEqual({ head: 0, dirtyPaths: 0, blobs: 0 });
    });

    // One rule for every path key (#217), the page's (`isRelativePath`, #209). The file's hash is
    // right in every case: the path is what is wrong, and at #216 such a manifest exited 0.
    describe.each(["sources", "build", "served", "bundledInputs"])("a key of %s", (group) => {
        const withKey = (key) => ({
            ...m(),
            [group]: {
                ...m()[group],
                [key]:
                    group === "bundledInputs"
                        ? hex("a")
                        : { sha256: hex("a"), blob: blob("a"), side: "both" },
            },
        });
        it.each([
            ["climbing out of the repository", "../outside.txt"],
            ["climbing out from inside it", "packages/../../outside.txt"],
            ["with a scheme", "https://example.com/x.mjs"],
            ["that is not a URL", "http://["],
            ["with a drive letter", "C:/outside.txt"],
            ["with a leading slash", "/etc/passwd"],
            ["with a backslash", "packages\\p\\a.js"],
            ["with a space the URL parser strips", " http://["],
            ["with a control character", "a\tb.js"],
            ["that is empty", ""],
        ])("exits 2 %s, naming the field, without reading it", (_, key) => {
            let reads = 0;
            const { t, calls } = tree({
                sha256: (p) => (reads++, p === key ? hex("a") : disk[p]),
            });
            const r = preflight(withKey(key), t);
            expect(r.code, text(r)).toBe(2);
            expect(r.lines).toEqual([
                `${group}[${JSON.stringify(key)}]: ${JSON.stringify(key)} is not a relative path`,
            ]);
            expect(calls).toEqual({ head: 0, dirtyPaths: 0, blobs: 0 });
            expect(reads).toBe(0);
        });
    });

    // What a path resolves to, symlinks included (#217): each thing the preflight reads, by name.
    it.each([
        ["sources", "packages/p/src/a.ts", `sources["packages/p/src/a.ts"]`],
        ["build", "package.json", `build["package.json"]`],
        ["served", "examples/js/a.mjs", `served["examples/js/a.mjs"]`],
        ["bundledInputs", "packages/p/dist/a.js", `bundledInputs["packages/p/dist/a.js"]`],
        ["the bundle", "examples/dist/webarkit-packages.mjs", "bundle.path"],
        [
            "jsfeat-next's file",
            "node_modules/@webarkit/jsfeat-next/dist/jsfeatNext.mjs",
            `dependencies["@webarkit/jsfeat-next"].file`,
        ],
    ])(
        "exits 2 when a path in %s resolves outside the repository, before reading",
        (_, p, field) => {
            let reads = 0;
            const { t, calls } = tree({
                resolvesOutside: (q) => q === p,
                sha256: (q) => (reads++, disk[q] ?? null),
            });
            const r = preflight(manifest(), t);
            expect(r.code, text(r)).toBe(2);
            expect(r.lines).toEqual([
                `${field}: ${JSON.stringify(p)} resolves outside the repository`,
            ]);
            expect(calls).toEqual({ head: 0, dirtyPaths: 0, blobs: 0 });
            expect(reads).toBe(0);
        },
    );
});

// A real link. A junction needs no privilege on Windows, and the type is ignored elsewhere, where
// it is a directory symlink: the same call the other temporary trees here make, so nothing skips.
describe("outsideRoot", () => {
    function tempTree(use) {
        const dir = mkdtempSync(join(tmpdir(), "provenance-outside-"));
        try {
            const root = join(dir, "root");
            const away = join(dir, "away");
            mkdirSync(join(root, "in"), { recursive: true });
            mkdirSync(join(root, "..foo"));
            mkdirSync(away);
            writeFileSync(join(root, "in/a.txt"), "a");
            writeFileSync(join(root, "..foo/a.txt"), "a");
            writeFileSync(join(away, "a.txt"), "a");
            symlinkSync(away, join(root, "link"), "junction");
            symlinkSync(join(root, "in"), join(root, "inner"), "junction");
            use(root);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it("reads a link that leaves the root as outside it", () => {
        tempTree((root) => expect(outsideRoot(root, "link/a.txt")).toBe(true));
    });
    it("reads a plain path and a link that stays in the root as inside it", () => {
        tempTree((root) => {
            expect(outsideRoot(root, "in/a.txt")).toBe(false);
            expect(outsideRoot(root, "inner/a.txt")).toBe(false);
        });
    });
    it("does not take a directory whose name starts with two dots for a climb", () => {
        tempTree((root) => expect(outsideRoot(root, "..foo/a.txt")).toBe(false));
    });
    // Not its question: the read then fails, and that is its own finding (exit 1, "none on disk").
    it("leaves a path that does not exist to the read", () => {
        tempTree((root) => expect(outsideRoot(root, "in/none.txt")).toBe(false));
    });
    it("resolves the root too, reached through a link of its own", () => {
        tempTree((root) => {
            symlinkSync(root, `${root}-alias`, "junction");
            expect(outsideRoot(`${root}-alias`, "in/a.txt")).toBe(false);
            expect(outsideRoot(`${root}-alias`, "link/a.txt")).toBe(true);
        });
    });
});

describe("the id patterns the command's test reads its output with", () => {
    const id = (n) => "a".repeat(n);
    const headLine = (n) => `manifest head: ${OTHER}; checkout HEAD: ${id(n)} -- built at another`;
    const blobLine = (n) =>
        `x\npackage.json: the manifest's blob id ${"0".repeat(40)} is not the file's ${id(n)}\ny`;

    it.each([40, 64])("accept a %i-character id", (n) => {
        expect(headLine(n)).toMatch(CHECKOUT_HEAD);
        expect(blobLine(n)).toMatch(PRODUCER_BLOB);
    });
    it.each([39, 50, 65])("refuse a %i-character id", (n) => {
        expect(headLine(n)).not.toMatch(CHECKOUT_HEAD);
        expect(blobLine(n)).not.toMatch(PRODUCER_BLOB);
    });
});

describe("node scripts/provenance-preflight.mjs", () => {
    /**
     * The command on a manifest whose text is `body`, or on a path that does not exist, run from
     * outside the repository: it reads the repository's files wherever it is run from.
     */
    function run(body) {
        const dir = mkdtempSync(join(tmpdir(), "provenance-preflight-"));
        try {
            const path = join(dir, "provenance.json");
            if (body !== undefined) writeFileSync(path, body);
            const r = spawnSync(process.execPath, [SCRIPT, path], { cwd: dir, encoding: "utf8" });
            return { status: r.status, out: r.stdout + r.stderr };
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it.each([
        [
            "a manifest it cannot read",
            undefined,
            /^provenance preflight: cannot read .*provenance\.json: /,
        ],
        [
            "text that is not JSON",
            "{",
            /^provenance preflight: cannot parse .*provenance\.json as JSON: /,
        ],
        [
            "JSON that is not an object",
            "[]",
            /^provenance preflight: .*the manifest is not a JSON object/,
        ],
        ["a manifest with a malformed field", '{"schema":"x"}', /schema: "x" is not/],
    ])("exits 2 on %s, with one line and no stack", (_, body, why) => {
        const r = run(body);
        expect(r.status, r.out).toBe(2);
        expect(r.out).toMatch(why);
        expect(r.out.trim().split("\n")).toHaveLength(1);
    });

    // Its own readers (git and the disk), on a case where each must fire whatever state this
    // checkout is in: the manifest `npm run build` wrote, its head, one served hash and one producer
    // blob id replaced. Each line shows its reader returned the checkout's value, not none.
    it("fails on the built manifest with its head, a served hash and a blob id replaced", () => {
        const m = JSON.parse(readFileSync(new URL("../dist/provenance.json", import.meta.url)));
        m.head = OTHER;
        m.served["examples/bench-nft.html"].sha256 = hex("0");
        m.build["package.json"].blob = blob("0");
        const r = run(JSON.stringify(m));
        expect(r.status, r.out).toBe(1);
        expect(r.out).toMatch(CHECKOUT_HEAD);
        expect(r.out).toMatch(/manifest clean: true; tree clean now: (true|false)/);
        expect(r.out).toMatch(
            /examples\/bench-nft\.html: the manifest's hash 0{12}… is not the file's [0-9a-f]{12}…/,
        );
        expect(r.out).toMatch(PRODUCER_BLOB);
    });

    const built = () =>
        JSON.parse(readFileSync(new URL("../dist/provenance.json", import.meta.url)));

    // Whatever state this checkout is in: 0 on a clean tree at the manifest's head, 1 otherwise.
    it("does not refuse the shape of the manifest the build wrote", () => {
        const r = run(JSON.stringify(built()));
        expect([0, 1], r.out).toContain(r.status);
    });

    it("exits 2 on a source outside the repository, naming the field", () => {
        const m = built();
        m.sources["../outside.txt"] = { sha256: hex("a"), blob: blob("a") };
        const r = run(JSON.stringify(m));
        expect(r.status, r.out).toBe(2);
        expect(r.out).toContain(`sources["../outside.txt"]: "../outside.txt" is not a relative`);
    });

    // The rule's other half on its own reader: a key that reads as a path inside the repository, a
    // link in it to a file outside, that file's real hash. `examples/dist` is gitignored, so the
    // link does not touch what `clean` covers, and the verdict comes before git is asked.
    it("exits 2 on a link in the repository to a file outside it, with that file's hash", () => {
        const away = mkdtempSync(join(tmpdir(), "provenance-away-"));
        const name = `.preflight-link-${process.pid}`;
        const link = join(REPO, "examples/dist", name);
        try {
            const bytes = "outside the repository\n";
            writeFileSync(join(away, "outside.txt"), bytes);
            symlinkSync(away, link, "junction");
            const key = `examples/dist/${name}/outside.txt`;
            const m = built();
            m.sources[key] = {
                sha256: createHash("sha256").update(bytes).digest("hex"),
                blob: blob("a"),
            };
            const r = run(JSON.stringify(m));
            expect(r.status, r.out).toBe(2);
            expect(r.out).toContain(
                `sources[${JSON.stringify(key)}]: ${JSON.stringify(key)} resolves outside the repository`,
            );
        } finally {
            rmSync(link, { recursive: true, force: true });
            rmSync(away, { recursive: true, force: true });
        }
    });
});
