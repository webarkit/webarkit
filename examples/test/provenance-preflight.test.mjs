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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { preflight } from "../../scripts/provenance-preflight.mjs";

const SCRIPT = fileURLToPath(new URL("../../scripts/provenance-preflight.mjs", import.meta.url));

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const hex = (c) => c.repeat(64);
const blob = (c) => c.repeat(40);

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
        expect(r.out).toMatch(
            new RegExp(`manifest head: ${OTHER}; checkout HEAD: [0-9a-f]{40} -- built at another`),
        );
        expect(r.out).toMatch(/manifest clean: true; tree clean now: (true|false)/);
        expect(r.out).toMatch(
            /examples\/bench-nft\.html: the manifest's hash 0{12}… is not the file's [0-9a-f]{12}…/,
        );
        expect(r.out).toMatch(
            /package\.json: the manifest's blob id 0{40} is not the file's [0-9a-f]{40}/,
        );
    });
});
