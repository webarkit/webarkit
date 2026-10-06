/*
 *  build-provenance.mjs
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
 * `npm run build`: the packages, the bench page's shared bundle, and the
 * provenance manifest that attests it (#110, §4).
 *
 *     node scripts/build-provenance.mjs
 *
 * In this order, each step on the previous one's output:
 * 1. **The packages' build**, run here (spec, then backend, then tracker), so
 *    the chain from `src/` to `dist/` to the bundle is true by construction: no
 *    bundle is made from a `dist/` this run did not just build (D5).
 * 2. **The bundle**, `examples/dist/webarkit-packages.mjs`, from
 *    `examples/js/packages-bundle.mjs`. It refuses an input other than the three
 *    packages' `dist/` and jsfeat-next's `jsfeatNext.mjs`, and an output that
 *    still imports anything: a module worker reads no import map.
 * 3. **The manifest**, `examples/dist/provenance.json`: `HEAD`, whether the
 *    tracked inputs were clean, and each one's SHA-256 (what the page compares)
 *    and git blob id (what a check from the repository compares). Its
 *    authority is that the build which made the bundle wrote it; the page
 *    checks the bytes the server serves against it at Start (`provenanceRefusal`
 *    in `examples/js/bench-metrics.mjs`).
 *
 * jsfeat-next is a `node_modules` dependency, so it has no source hash: the
 * manifest records its lockfile entry, the version installed (refused if the
 * two differ), and the hash of the file the bundle holds (D4).
 */

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, version as esbuildVersion } from "esbuild";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGES = [
    "@webarkit/cv-backend-spec",
    "@webarkit/cv-backend-jsfeatnext",
    "@webarkit/nft-tracker",
];
const ENTRY = "examples/js/packages-bundle.mjs";
const BUNDLE = "examples/dist/webarkit-packages.mjs";
const MANIFEST = "examples/dist/provenance.json";
const JSFEAT = "@webarkit/jsfeat-next";
const JSFEAT_FILE = `node_modules/${JSFEAT}/dist/jsfeatNext.mjs`;
/** What `clean` covers: the M4 runbook's guarded paths, and what installs the packages. */
export const CLEAN_PATHS = [
    "examples/bench-nft.html",
    "examples/js",
    "scripts",
    "packages",
    "package.json",
    "package-lock.json",
];
/**
 * What the bench page serves unbuilt, and which arm loads it: the page, every
 * `examples/js` module it or the worker loads, and the bundle's entry, which
 * nothing loads unbuilt (`bundled`). The page refuses a session run that loads
 * a module not listed here, and a worker run in which a `worker` or `both`
 * module is not seen loading (#110, A1); a test checks the list and the sides
 * against the imports themselves.
 */
export const SERVED = {
    "examples/bench-nft.html": "page",
    "examples/js/bench-metrics.mjs": "both",
    "examples/js/detection-policy.mjs": "page",
    "examples/js/detection-replies.mjs": "page",
    "examples/js/detection-worker-core.mjs": "worker",
    "examples/js/detection-worker.mjs": "worker",
    "examples/js/instrument-backend.mjs": "both",
    "examples/js/packages-bundle.mjs": "bundled",
    "examples/js/pinball-shared.mjs": "page",
};

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(ROOT + path);

/**
 * Whether git can describe this tree. `npm install` runs this script (through
 * `prepare`), and a source download without `.git`, or a machine without git,
 * must still install: the build then degrades instead of failing.
 */
function gitUsable() {
    // A commit to name, not only a work tree: after `git init` with nothing
    // committed, `HEAD` does not resolve. Quiet: git's own `fatal:` is not news.
    try {
        execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
            cwd: ROOT,
            stdio: ["ignore", "pipe", "ignore"],
        });
        return true;
    } catch {
        return false;
    }
}

/** `{ path: { sha256, blob } }`, the blob id as `git add` would store the file, `null` without git. */
function hashed(paths, withGit) {
    const ids = withGit
        ? execFileSync("git", ["hash-object", "--stdin-paths"], {
              cwd: ROOT,
              input: paths.join("\n") + "\n",
              encoding: "utf8",
          })
              .trim()
              .split("\n")
        : [];
    return Object.fromEntries(
        paths.map((p, i) => [p, { sha256: sha256(read(p)), blob: ids[i] ?? null }]),
    );
}

// Run, not imported (the tests import SERVED). Both sides real paths: Node
// resolves links for `import.meta.url` but not in `argv[1]`, and a build that
// silently did nothing would leave a stale bundle its manifest still attests.
if (
    process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
    // 1. The packages, in the order AGENTS.md explains.
    for (const name of PACKAGES)
        execSync(`npm run build -w ${name}`, { cwd: ROOT, stdio: "inherit" });

    // 2. The bundle.
    const { metafile } = await build({
        absWorkingDir: ROOT,
        entryPoints: [ENTRY],
        outfile: BUNDLE,
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        metafile: true,
        logLevel: "warning",
    });
    const dists = PACKAGES.map((name) => `packages/${name.slice("@webarkit/".length)}/dist/`);
    const allowed = (p) =>
        p === ENTRY ||
        p === JSFEAT_FILE ||
        (dists.some((d) => p.startsWith(d)) && p.endsWith(".js"));
    const inputs = Object.keys(metafile.inputs).map((p) => p.replace(/\\/g, "/"));
    const foreign = inputs.filter((p) => !allowed(p));
    if (foreign.length > 0)
        throw new Error(`the bundle took inputs it may not: ${foreign.join(", ")}`);
    const imports = Object.values(metafile.outputs).flatMap((o) => o.imports);
    if (imports.length > 0)
        throw new Error(`the bundle still imports: ${imports.map((i) => i.path).join(", ")}`);
    // The metafile lists only what esbuild resolved: a dynamic import it could
    // not would be left in the text alone.
    if (/^\s*import[\s{*"']|\bimport\s*\(/m.test(read(BUNDLE).toString())) {
        throw new Error(`the bundle's text still contains an import: ${BUNDLE}`);
    }

    // 3. The manifest.
    const lock = JSON.parse(read("package-lock.json"))?.packages?.[`node_modules/${JSFEAT}`];
    const installedVersion = JSON.parse(read(`node_modules/${JSFEAT}/package.json`)).version;
    if (!lock || lock.version !== installedVersion) {
        throw new Error(
            `${JSFEAT} ${installedVersion} is installed, the lockfile pins ${lock?.version}: run \`npm ci\``,
        );
    }
    // Without git the commit and the tree's cleanliness are unknown: the
    // manifest says so (`head` null, `clean` false), the page refuses a session
    // run on it, and the build still succeeds.
    const withGit = gitUsable();
    if (!withGit) {
        console.warn(
            "build-provenance: git is not usable here, so the manifest records no commit and an unknown tree; session runs will be refused.",
        );
    }
    const sources = !withGit
        ? []
        : git(
              "ls-files",
              "--",
              "packages/*/src/**",
              "packages/*/package.json",
              "packages/*/tsconfig*.json",
              "package-lock.json",
          )
              .trim()
              .split("\n")
              // A tracked file deleted and not staged is not hashed: `dirtyPaths`
              // lists it, and the tree reads dirty.
              .filter((p) => existsSync(ROOT + p));
    const dirtyPaths = !withGit
        ? []
        : git("status", "--porcelain", "--untracked-files=all", "--", ...CLEAN_PATHS)
              .split("\n")
              .filter(Boolean)
              .map((line) => line.slice(3));
    const bundleBytes = read(BUNDLE);
    const manifest = {
        schema: "webarkit-bench-provenance/1",
        builtAt: new Date().toISOString(),
        head: withGit ? git("rev-parse", "HEAD").trim() : null,
        clean: withGit && dirtyPaths.length === 0,
        dirtyPaths,
        bundle: {
            path: BUNDLE,
            sha256: sha256(bundleBytes),
            bytes: bundleBytes.length,
            entry: ENTRY,
        },
        sources: hashed(sources, withGit),
        served: Object.fromEntries(
            Object.entries(hashed(Object.keys(SERVED), withGit)).map(([p, h]) => [
                p,
                { ...h, side: SERVED[p] },
            ]),
        ),
        bundledInputs: Object.fromEntries(
            inputs.filter((p) => p !== ENTRY).map((p) => [p, sha256(read(p))]),
        ),
        dependencies: {
            [JSFEAT]: {
                version: lock.version,
                resolved: lock.resolved,
                integrity: lock.integrity,
                installedVersion,
                file: JSFEAT_FILE,
                sha256: sha256(read(JSFEAT_FILE)),
            },
        },
        toolchain: { node: process.version, esbuild: esbuildVersion },
    };
    mkdirSync(ROOT + "examples/dist", { recursive: true });
    writeFileSync(ROOT + MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log(
        `${MANIFEST}: HEAD ${manifest.head?.slice(0, 7) ?? "unknown (no git)"}, ${manifest.clean ? "clean" : withGit ? `DIRTY (${dirtyPaths.length} paths)` : "not known to be clean"}, bundle ${manifest.bundle.sha256.slice(0, 12)}…`,
    );
}
