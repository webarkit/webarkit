/*
 *  build-provenance.test.mjs
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
 * `scripts/build-provenance.mjs` run end to end (#120, part D): what `clean`
 * and `dirtyPaths` say of a changed tree, what a build without git records,
 * that the packages are rebuilt before they are bundled, that the bundle
 * refuses an input outside the packages, and that a build replacing a manifest
 * clean at another commit warns first (#135), whose decision is also tested
 * case by case without a build. provenance.test.mjs reads the
 * manifest `npm run build` wrote for this checkout, which is clean in CI, so
 * none of these could show there.
 *
 * Each build runs in a temporary clone of this checkout, never in it: the
 * examples/dist the other tests read is not written. Needs git, and
 * `npm run build` first, as CI does: the packages' dist/ is copied from here.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { replacedBuildWarning } from "../../scripts/build-provenance.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGES = ["cv-backend-spec", "cv-backend-jsfeatnext", "nft-tracker"];
/** A commit no clone is at: the head of the attested build a test's build replaces (#135). */
const ATTESTED_HEAD = "0123456789abcdef0123456789abcdef01234567";

/**
 * A clone of this checkout's HEAD in a temporary directory, set up to build
 * there: the working tree's build script copied over HEAD's (it is what is
 * tested), each package's dist/ copied from here as the stale build a
 * developer would have, and node_modules linked entry by entry, except that
 * the three packages point at the clone's own packages/ and jsfeat-next is
 * copied, so that every input the bundle takes is inside the clone, as the
 * build's allowlist requires. Links are junctions on Windows; removing the
 * clone removes them, not what they point at.
 */
function cloneForBuild() {
    const root = mkdtempSync(join(tmpdir(), "build-provenance-"));
    execFileSync("git", ["clone", "--quiet", "--shared", REPO, root]);
    cpSync(join(REPO, "scripts/build-provenance.mjs"), join(root, "scripts/build-provenance.mjs"));
    mkdirSync(join(root, "node_modules/@webarkit"), { recursive: true });
    for (const name of readdirSync(join(REPO, "node_modules"))) {
        if (name === "@webarkit" || name === ".package-lock.json") continue;
        symlinkSync(join(REPO, "node_modules", name), join(root, "node_modules", name), "junction");
    }
    for (const p of PACKAGES) {
        symlinkSync(join(root, "packages", p), join(root, "node_modules/@webarkit", p), "junction");
        cpSync(join(REPO, "packages", p, "dist"), join(root, "packages", p, "dist"), {
            recursive: true,
        });
    }
    cpSync(
        join(REPO, "node_modules/@webarkit/jsfeat-next"),
        join(root, "node_modules/@webarkit/jsfeat-next"),
        { recursive: true },
    );
    return root;
}

/** `npm run build`'s script, run in `root`; git may not look above it for a repository. */
function build(root) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(root, "scripts/build-provenance.mjs")], {
            cwd: root,
            env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root) },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", reject);
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
}

const manifestOf = (root) =>
    JSON.parse(readFileSync(join(root, "examples/dist/provenance.json"), "utf8"));

describe("scripts/build-provenance.mjs, run in a clone", () => {
    const roots = [];
    // Each build takes about 10 s.
    const runs = {};

    beforeAll(async () => {
        const changed = cloneForBuild();
        roots.push(changed);
        // A tracked file under scripts/, an untracked one under examples/js, and a package
        // source whose new export only a rebuilt dist/ carries into the bundle.
        appendFileSync(join(changed, "scripts/compare-bench.mjs"), "\n// changed by a test\n");
        writeFileSync(join(changed, "examples/js/zz-untracked.mjs"), "export {};\n");
        appendFileSync(
            join(changed, "packages/nft-tracker/src/index.ts"),
            "\nexport const PROBE_120 = 120;\n",
        );

        const noGit = cloneForBuild();
        roots.push(noGit);
        rmSync(join(noGit, ".git"), { recursive: true, force: true });

        const foreign = cloneForBuild();
        roots.push(foreign);
        appendFileSync(
            join(foreign, "examples/js/packages-bundle.mjs"),
            '\nimport "./pinball-shared.mjs";\n',
        );

        // #135: a manifest clean at another commit, as an attested build leaves it.
        const attested = cloneForBuild();
        roots.push(attested);
        mkdirSync(join(attested, "examples/dist"), { recursive: true });
        writeFileSync(
            join(attested, "examples/dist/provenance.json"),
            JSON.stringify({ head: ATTESTED_HEAD, clean: true, dirtyPaths: [] }),
        );

        // One at a time: three at once loaded the machine enough to push a CLI test elsewhere in
        // the suite past its timeout, then 5 s, now the suite's 15 s (#212).
        for (const [name, root] of Object.entries({ changed, noGit, foreign, attested })) {
            runs[name] = { root, ...(await build(root)) };
        }
    }, 300_000);

    afterAll(() => {
        for (const root of roots) rmSync(root, { recursive: true, force: true });
    });

    // #120 (BB5, BB6, BB7): `clean` read true while `dirtyPaths` listed a file; a change under
    // scripts/, and an untracked file, went unseen.
    it("lists each changed path under CLEAN_PATHS, an untracked one included, and is not clean", () => {
        const { status, stderr, root } = runs.changed;
        expect(status, stderr).toBe(0);
        const m = manifestOf(root);
        expect(m.dirtyPaths, "a tracked file changed under scripts/").toContain(
            "scripts/compare-bench.mjs",
        );
        expect(m.dirtyPaths, "an untracked file under examples/js").toContain(
            "examples/js/zz-untracked.mjs",
        );
        expect(m.dirtyPaths, "a package source changed").toContain(
            "packages/nft-tracker/src/index.ts",
        );
        expect(m.clean, `clean beside dirtyPaths ${JSON.stringify(m.dirtyPaths)}`).toBe(
            m.dirtyPaths.length === 0,
        );
        expect(m.head).toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
    });

    // #120 (BB8): without the packages' build first, the bundle was made from the stale dist/
    // and every test stayed green.
    it("bundles the packages as their sources are now, rebuilding dist/ first", () => {
        const { status, stderr, root } = runs.changed;
        expect(status, stderr).toBe(0);
        const bundle = readFileSync(join(root, "examples/dist/webarkit-packages.mjs"));
        expect(bundle.toString().includes("PROBE_120"), "the package build before the bundle").toBe(
            true,
        );
        expect(manifestOf(root).bundle.sha256).toBe(
            createHash("sha256").update(bundle).digest("hex"),
        );
    });

    // #120 (BB12): built without git, the manifest's head read "unknown", and
    // `replay-clips --packages bundle` then ran on it.
    it("records no commit and a tree not known to be clean where git cannot describe it", () => {
        const { status, stderr, root } = runs.noGit;
        expect(status, stderr).toBe(0);
        expect(stderr).toMatch(/git is not usable here/);
        const m = manifestOf(root);
        expect(m.head, "head without git").toBeNull();
        expect(m.clean).toBe(false);
        expect(m.dirtyPaths).toEqual([]);
        // #127: the producer is still hashed, with no blob id to give.
        expect(Object.keys(m.build).sort()).toEqual([
            "package.json",
            "scripts/build-provenance.mjs",
        ]);
        for (const [path, { sha256, blob }] of Object.entries(m.build)) {
            expect(blob, `${path}'s blob without git`).toBeNull();
            expect(sha256).toBe(
                createHash("sha256")
                    .update(readFileSync(join(root, path)))
                    .digest("hex"),
            );
        }
    });

    // #120 (BB1, BB9): an entry that imports a module other than the packages built, and the
    // bundle's hash did not even change.
    it("refuses a bundle entry that imports a module outside the packages, and writes no manifest", () => {
        const { status, stderr, root } = runs.foreign;
        expect(status, "the bundle's input allowlist").not.toBe(0);
        expect(stderr).toMatch(
            /the bundle took inputs it may not: examples\/js\/pinball-shared\.mjs/,
        );
        expect(existsSync(join(root, "examples/dist/provenance.json"))).toBe(false);
    });

    // #135: the build said nothing when it replaced an attested build.
    it("warns first, on stderr, before it replaces a manifest clean at another commit, then builds as before", () => {
        const { status, stderr, root } = runs.attested;
        expect(status, stderr).toBe(0);
        const m = manifestOf(root);
        expect(m.head).not.toBe(ATTESTED_HEAD);
        const tree = m.clean ? "a clean tree" : `a DIRTY tree (${m.dirtyPaths.length} paths)`;
        // The first thing the build writes to stderr, before any package's build.
        expect(stderr.startsWith(`build-provenance: warning: `), stderr).toBe(true);
        expect(stderr.split("\n")[0]).toBe(
            `build-provenance: warning: examples/dist/provenance.json attests a clean build of ${ATTESTED_HEAD}. This build of ${m.head}, from ${tree}, replaces that attested build. \`npm run check:provenance\` shows the new state afterwards.`,
        );
    });

    it("stays silent where there is no manifest to replace", () => {
        for (const name of ["changed", "noGit", "foreign"]) {
            expect(runs[name].stderr, name).not.toMatch(/build-provenance: warning:/);
        }
    });
});

describe("replacedBuildWarning (#135)", () => {
    const HEAD = "1".repeat(40);
    const clean = { head: HEAD, dirtyPaths: [] };
    const manifest = (o) => JSON.stringify({ head: ATTESTED_HEAD, clean: true, ...o });

    it("warns on a manifest clean at a commit other than the one being built, naming both", () => {
        const w = replacedBuildWarning(manifest(), clean);
        expect(w).toBe(
            `build-provenance: warning: examples/dist/provenance.json attests a clean build of ${ATTESTED_HEAD}. This build of ${HEAD}, from a clean tree, replaces that attested build. \`npm run check:provenance\` shows the new state afterwards.`,
        );
    });

    it("says when the tree being built is dirty, and how many paths", () => {
        const w = replacedBuildWarning(manifest(), {
            head: HEAD,
            dirtyPaths: [" M scripts/compare-bench.mjs", "?? examples/js/x.mjs"],
        });
        expect(w).toContain(`This build of ${HEAD}, from a DIRTY tree (2 paths), replaces`);
    });

    it("warns where git is not usable: the attested build is replaced by one of no known commit", () => {
        const w = replacedBuildWarning(manifest(), { head: null, dirtyPaths: [] });
        expect(w).toContain(
            `attests a clean build of ${ATTESTED_HEAD}. This build of an unknown commit (git is not usable here) replaces`,
        );
    });

    it.each([
        ["no manifest", null],
        ["one that cannot be read", ""],
        ["one that is not JSON", '{"head": "abc", "clean": tr'],
        ["JSON that is not an object", "42"],
        ["JSON null", "null"],
        ["a list", "[]"],
        ["a clean one that names no head", JSON.stringify({ clean: true })],
        ["a clean one whose head is not a string", JSON.stringify({ clean: true, head: 7 })],
        ["a dirty one", manifest({ clean: false })],
        ["one whose clean is not true", manifest({ clean: "true" })],
        ["one at the same head", manifest({ head: HEAD })],
    ])("stays silent on %s", (_, text) => {
        expect(replacedBuildWarning(text, clean)).toBeNull();
    });

    it("stays silent on one at the same head even when the tree is now dirty", () => {
        const dirty = { head: HEAD, dirtyPaths: [" M package.json"] };
        expect(replacedBuildWarning(manifest({ head: HEAD }), dirty)).toBeNull();
    });
});
