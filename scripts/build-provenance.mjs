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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

/** `{ path: { sha256, blob } }`, the blob id as `git add` would store the file. */
function hashed(paths) {
    const ids = execFileSync("git", ["hash-object", "--stdin-paths"], {
        cwd: ROOT,
        input: paths.join("\n") + "\n",
        encoding: "utf8",
    })
        .trim()
        .split("\n");
    return Object.fromEntries(paths.map((p, i) => [p, { sha256: sha256(read(p)), blob: ids[i] }]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
    const allowed = (p) =>
        p === ENTRY || p === JSFEAT_FILE || /^packages\/[^/]+\/dist\/.+\.js$/.test(p);
    const inputs = Object.keys(metafile.inputs).map((p) => p.replace(/\\/g, "/"));
    const foreign = inputs.filter((p) => !allowed(p));
    if (foreign.length > 0)
        throw new Error(`the bundle took inputs it may not: ${foreign.join(", ")}`);
    const imports = Object.values(metafile.outputs).flatMap((o) => o.imports);
    if (imports.length > 0)
        throw new Error(`the bundle still imports: ${imports.map((i) => i.path).join(", ")}`);

    // 3. The manifest.
    const lock = JSON.parse(read("package-lock.json"))?.packages?.[`node_modules/${JSFEAT}`];
    const installedVersion = JSON.parse(read(`node_modules/${JSFEAT}/package.json`)).version;
    if (!lock || lock.version !== installedVersion) {
        throw new Error(
            `${JSFEAT} ${installedVersion} is installed, the lockfile pins ${lock?.version}: run \`npm ci\``,
        );
    }
    const sources = git(
        "ls-files",
        "--",
        "packages/*/src/**",
        "packages/*/package.json",
        "packages/*/tsconfig*.json",
        "package-lock.json",
    )
        .trim()
        .split("\n");
    const dirtyPaths = git("status", "--porcelain", "--untracked-files=all", "--", ...CLEAN_PATHS)
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(3));
    const bundleBytes = read(BUNDLE);
    const manifest = {
        schema: "webarkit-bench-provenance/1",
        builtAt: new Date().toISOString(),
        head: git("rev-parse", "HEAD").trim(),
        clean: dirtyPaths.length === 0,
        dirtyPaths,
        bundle: {
            path: BUNDLE,
            sha256: sha256(bundleBytes),
            bytes: bundleBytes.length,
            entry: ENTRY,
        },
        sources: hashed(sources),
        served: Object.fromEntries(
            Object.entries(hashed(Object.keys(SERVED))).map(([p, h]) => [
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
        `${MANIFEST}: HEAD ${manifest.head.slice(0, 7)}, ${manifest.clean ? "clean" : `DIRTY (${dirtyPaths.length} paths)`}, bundle ${manifest.bundle.sha256.slice(0, 12)}…`,
    );
}
