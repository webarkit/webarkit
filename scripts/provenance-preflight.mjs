/*
 *  provenance-preflight.mjs
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
 * `npm run check:provenance`: whether the manifest `npm run build` wrote
 * describes this tree (#136).
 *
 *     node scripts/provenance-preflight.mjs [manifest]
 *
 * An explicit path is read as given, relative to the current directory;
 * without one, the repository's `examples/dist/provenance.json`.
 *
 * It does, when the manifest's head is this checkout's `HEAD`, the tree is
 * clean over the paths the build's `clean` covers (`CLEAN_PATHS`, the M4
 * runbook's step 2), and every file the manifest hashes (`sources`, `served`,
 * `build`, `bundledInputs`, the bundle and jsfeat-next's file) hashes the same
 * on disk, with `served` listing exactly what `SERVED` names. CI runs it after
 * the build; a device session runs it on the serving PC before measuring. A
 * developer's checkout fails it after any edit until the next build, which is
 * why it is a command and not part of `npm test` (#136).
 *
 * Exits 0 if the manifest describes the tree, 1 if it does not, with one line
 * per finding and the remedy, and 2, with one line naming the field, when the
 * manifest cannot be read, is not JSON or has a field of the wrong shape: then
 * there is nothing to compare, and git is not asked.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BUNDLE, CLEAN_PATHS, JSFEAT_FILE, PRODUCER, SERVED } from "./build-provenance.mjs";

const SCHEMA = "webarkit-bench-provenance/1";
const JSFEAT = "@webarkit/jsfeat-next";
const SHA256 = /^[0-9a-f]{64}$/;
/** A full object id, SHA-1's or SHA-256's, as the page reads `head`. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** A repository-relative path as the build writes one: forward slashes, no root, no drive. */
const RELATIVE = /^(?![/]|[A-Za-z]:)[^\\]+$/;

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));

/**
 * The first field of `m` whose shape is wrong, as `field: value is not …`, or
 * null. Only what the comparison reads is checked, and the paths the build
 * always writes (the bundle's, jsfeat-next's file, the producer's): any other
 * would leave a file the page reads unchecked. A path is hashed once: two
 * entries for one path would have only one of their hashes compared.
 */
function shapeError(m) {
    if (!isObject(m)) return `the manifest is not a JSON object: ${show(m)}`;
    const bad = (field, value, what) => `${field}: ${show(value)} is not ${what}`;
    if (m.schema !== SCHEMA) return bad("schema", m.schema, `"${SCHEMA}"`);
    if (m.head !== null && !(typeof m.head === "string" && OBJECT_ID.test(m.head))) {
        return bad("head", m.head, "a full commit id or null");
    }
    if (typeof m.clean !== "boolean") return bad("clean", m.clean, "a boolean");
    if (!Array.isArray(m.dirtyPaths) || !m.dirtyPaths.every((p) => typeof p === "string")) {
        return bad("dirtyPaths", m.dirtyPaths, "a list of paths");
    }
    // The build without git writes head null, clean false and no dirty path: its own finding.
    if (m.clean && m.dirtyPaths.length > 0) {
        return "clean, dirtyPaths: the manifest says its tree is clean, but lists dirty paths";
    }
    if (!m.clean && m.head !== null && m.dirtyPaths.length === 0) {
        return "clean, dirtyPaths: the manifest says its tree is dirty, but lists no dirty path";
    }
    if (!isObject(m.bundle)) return bad("bundle", m.bundle, "an object");
    if (m.bundle.path !== BUNDLE) return bad("bundle.path", m.bundle.path, `"${BUNDLE}"`);
    if (typeof m.bundle.sha256 !== "string" || !SHA256.test(m.bundle.sha256)) {
        return bad("bundle.sha256", m.bundle.sha256, "a SHA-256");
    }
    // Without git the build lists no sources (`git ls-files`) and records every blob id null: its
    // own manifest, stale for any checkout (the head finding says "built without git"), not a
    // malformed one. Only in that state: a git build always has sources and blob ids.
    const noGit = m.head === null && !m.clean && m.dirtyPaths.length === 0;
    const hashedIn = { [BUNDLE]: "bundle", [JSFEAT_FILE]: "dependencies" };
    for (const group of ["sources", "build", "served"]) {
        const empty = isObject(m[group]) && Object.keys(m[group]).length === 0;
        if (!isObject(m[group]) || (empty && !(group === "sources" && noGit))) {
            return bad(group, m[group], "an object of paths");
        }
        for (const [path, e] of Object.entries(m[group])) {
            const field = `${group}[${JSON.stringify(path)}]`;
            if (!isObject(e)) return bad(field, e, "an object");
            if (typeof e.sha256 !== "string" || !SHA256.test(e.sha256)) {
                return bad(`${field}.sha256`, e.sha256, "a SHA-256");
            }
            if (
                !(e.blob === null && noGit) &&
                !(typeof e.blob === "string" && OBJECT_ID.test(e.blob))
            ) {
                return bad(
                    `${field}.blob`,
                    e.blob,
                    noGit ? "a git object id or null" : "a git object id",
                );
            }
            if (group === "served" && typeof e.side !== "string") {
                return bad(`${field}.side`, e.side, "a side");
            }
            if (Object.hasOwn(hashedIn, path)) {
                return `${path}: hashed in both ${hashedIn[path]} and ${group}`;
            }
            hashedIn[path] = group;
        }
    }
    if (JSON.stringify(Object.keys(m.build).sort()) !== JSON.stringify([...PRODUCER].sort())) {
        return bad("build", Object.keys(m.build), JSON.stringify(PRODUCER));
    }
    const field = `dependencies[${JSON.stringify(JSFEAT)}]`;
    const dep = isObject(m.dependencies) ? m.dependencies[JSFEAT] : undefined;
    if (!isObject(dep)) return bad(field, dep, "an object");
    if (dep.file !== JSFEAT_FILE) return bad(`${field}.file`, dep.file, `"${JSFEAT_FILE}"`);
    if (typeof dep.sha256 !== "string" || !SHA256.test(dep.sha256)) {
        return bad(`${field}.sha256`, dep.sha256, "a SHA-256");
    }
    // Every input the bundle took: the packages' gitignored dist/ files and jsfeat-next's, which
    // `clean` cannot see. Outside the one-path-one-group rule above, because the build records
    // jsfeat-next's file both here and in `dependencies`: one file's hash, so the two must agree.
    if (!isObject(m.bundledInputs) || Object.keys(m.bundledInputs).length === 0) {
        return bad("bundledInputs", m.bundledInputs, "an object of paths");
    }
    for (const [path, h] of Object.entries(m.bundledInputs)) {
        const input = `bundledInputs[${JSON.stringify(path)}]`;
        if (!RELATIVE.test(path) || path.split("/").includes("..")) {
            return bad(input, path, "a relative path");
        }
        if (typeof h !== "string" || !SHA256.test(h)) return bad(input, h, "a SHA-256");
        if (path === JSFEAT_FILE && h !== dep.sha256) {
            return `${input}: ${h} is not ${field}.sha256 ${dep.sha256}`;
        }
    }
    return null;
}

/**
 * The verdict on `manifest` against the tree `t` reads: `{ code, lines }`.
 *
 * `t.head()` is the checkout's `HEAD`, `t.dirtyPaths()` the paths the build's
 * `clean` would call dirty now, `t.blobs(paths)` their git blob ids (each null
 * without git), `t.sha256(path)` a file's hash (null if it cannot be read),
 * and `t.served` what `SERVED` names. Each git reader is called once per run,
 * however many entries the manifest has (#136: the test this replaces ran git
 * twice per entry, past vitest's timeout on Windows), and none is called on a
 * manifest whose shape is wrong.
 */
export function preflight(manifest, t) {
    const malformed = shapeError(manifest);
    if (malformed !== null) return { code: 2, lines: [malformed] };
    const m = manifest;
    const head = t.head();
    const dirty = t.dirtyPaths();
    const findings = [];

    // The two conditions #134's message named, each with both values.
    const headOk = m.head !== null && head !== null && m.head === head;
    findings.push(
        `manifest head: ${m.head}; checkout HEAD: ${head ?? "unknown (git unavailable)"}${m.head === null ? " -- built without git" : head !== null && !headOk ? " -- built at another commit" : ""}`,
    );
    const cleanOk = m.clean && dirty !== null && dirty.length === 0;
    findings.push(
        `manifest clean: ${m.clean}; tree clean now: ${dirty === null ? "unknown (git unavailable)" : dirty.length === 0}${dirty?.length ? " -- dirty: " + dirty.join(", ") : ""}${m.dirtyPaths.length ? " -- built from a dirty tree: " + m.dirtyPaths.join(", ") : ""}`,
    );
    let ok = headOk && cleanOk;

    // Each path once (`shapeError` refuses a second entry), each group's own entries.
    const hashed = [
        // A source the manifest leaves out cannot be stale unseen: every source is tracked under
        // CLEAN_PATHS, so with the head HEAD and the tree clean it is HEAD's (Qodo on #210).
        ...Object.entries(m.sources),
        ...Object.entries(m.served),
        ...Object.entries(m.build),
        [BUNDLE, m.bundle],
        // jsfeat-next's version is not compared with the install: the bundle takes one file of
        // it (the build's `allowed()`), compared here, so another version with the same bytes
        // changes nothing the page runs, and the build refuses an install the lockfile does not
        // pin (Qodo on #210).
        [JSFEAT_FILE, m.dependencies[JSFEAT]],
        // The gitignored inputs `clean` cannot see; jsfeat-next's file is compared just above.
        ...Object.entries(m.bundledInputs)
            .filter(([path]) => path !== JSFEAT_FILE)
            .map(([path, h]) => [path, { sha256: h }]),
    ];
    for (const [path, { sha256: h }] of hashed) {
        const onDisk = t.sha256(path);
        if (onDisk === h) continue;
        ok = false;
        findings.push(
            `${path}: the manifest's hash ${h.slice(0, 12)}… is not the file's${onDisk === null ? ": none on disk" : ` ${onDisk.slice(0, 12)}…`}`,
        );
    }
    // The blob ids of the build's producer (#127), in one call. Only these: a served or source
    // file's blob id adds nothing its SHA-256 has not said.
    const producer = Object.keys(m.build);
    const ids = t.blobs(producer);
    if (!Array.isArray(ids) || ids.length !== producer.length) {
        ok = false;
        findings.push(`build: git gave no blob ids for ${producer.join(", ")}`);
    } else
        producer.forEach((path, i) => {
            const id = ids[i];
            if (m.build[path].blob === id) return;
            ok = false;
            findings.push(
                `${path}: the manifest's blob id ${m.build[path].blob} is not the file's ${id}`,
            );
        });

    for (const [path, { side }] of Object.entries(m.served)) {
        if (!Object.hasOwn(t.served, path)) {
            ok = false;
            findings.push(`served: the manifest lists ${path}, which SERVED does not`);
        } else if (t.served[path] !== side) {
            ok = false;
            findings.push(
                `served: ${path} is on side ${side} in the manifest, ${t.served[path]} in SERVED`,
            );
        }
    }
    for (const path of Object.keys(t.served)) {
        if (!Object.hasOwn(m.served, path)) {
            ok = false;
            findings.push(`served: SERVED names ${path}, which the manifest does not list`);
        }
    }

    if (ok) return { code: 0, lines: [] };
    // A commit to name only on a clean tree: committing a dirty one moves HEAD.
    const remedy =
        head !== null && dirty !== null && dirty.length === 0
            ? `rebuild from a clean tree at ${head}`
            : "commit, then rebuild from the clean tree";
    return { code: 1, lines: [...findings, `remedy: ${remedy} (npm run build)`] };
}

// Run, not imported (the tests import `preflight`), as build-provenance.mjs is.
if (
    process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
    const ROOT = fileURLToPath(new URL("../", import.meta.url));
    // An explicit path is read as given, relative to the current directory, as any command reads
    // its arguments; without one, the repository's manifest, wherever the command runs. The
    // files the manifest names are always read from the repository (`sha256` below).
    const path = process.argv[2] ?? "examples/dist/provenance.json";
    const refuse = (line) => {
        console.error(`provenance preflight: ${line}`);
        process.exit(2);
    };
    let text;
    try {
        text = readFileSync(process.argv[2] ?? ROOT + path, "utf8");
    } catch (e) {
        refuse(`cannot read ${path}: ${e.message}`);
    }
    let manifest;
    try {
        manifest = JSON.parse(text);
    } catch (e) {
        refuse(`cannot parse ${path} as JSON: ${e.message}`);
    }
    const git = (args, input) => {
        try {
            return execFileSync("git", args, {
                cwd: ROOT,
                input,
                encoding: "utf8",
                stdio: ["pipe", "pipe", "ignore"],
            });
        } catch {
            return null;
        }
    };
    const r = preflight(manifest, {
        head: () => git(["rev-parse", "--verify", "--quiet", "HEAD"])?.trim() || null,
        // As the build computes `dirtyPaths`, so that "clean now" means what `clean` meant.
        dirtyPaths: () =>
            git(["status", "--porcelain", "--untracked-files=all", "--", ...CLEAN_PATHS])
                ?.split("\n")
                .filter(Boolean)
                .map((line) => line.slice(3)) ?? null,
        blobs: (paths) =>
            paths.length === 0
                ? []
                : (git(["hash-object", "--stdin-paths"], paths.join("\n") + "\n")
                      ?.trim()
                      .split("\n") ?? null),
        sha256: (p) => {
            try {
                return createHash("sha256")
                    .update(readFileSync(ROOT + p))
                    .digest("hex");
            } catch {
                return null;
            }
        },
        served: SERVED,
    });
    if (r.code === 2) refuse(`${path}: ${r.lines[0]}`);
    if (r.code === 1) {
        console.error(`provenance preflight: ${path} does not describe this tree`);
        for (const line of r.lines) console.error(line);
        process.exit(1);
    }
    console.log(
        `provenance preflight: ${path} describes this tree: HEAD ${manifest.head}, clean, every hash the file's`,
    );
}
