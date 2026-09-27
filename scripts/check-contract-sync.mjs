/*
 *  check-contract-sync.mjs
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
 * `contract-check` — the one drift neither test suite can catch.
 *
 * `crates/wnft-format/src/known.rs` hand-transcribes the contract's
 * `DescriptorKind` and `DescriptorNorm` unions. Nothing links the two: no
 * codegen, no shared schema, and no test that compares them. A member present
 * in one and missing from the other makes one codec warn about and drop a
 * descriptor set that the other accepts — on a `.wnft` file no fixture
 * contains, so the shared corpus stays green either way. That is why this is a
 * script and not a test: the failure lives between two toolchains that share
 * this repository and the `fixtures/` corpus and nothing else.
 *
 * Three legs are checked, so the chain holds end to end:
 *
 *   contract union  ->  known.ts list  ->  known.rs list
 *   (cv_backend.ts)     (nft-tracker)      (wnft-format)
 *
 * The first leg is already enforced at compile time inside `known.ts`, by
 * `satisfies` in one direction and an `Exclude<...>` helper type in the other.
 * It is re-checked here anyway, for two reasons: this script must be runnable
 * without a TypeScript build, and a compile-time guard that is silently
 * deleted would take the guarantee with it. Its presence is asserted below.
 *
 * A fourth leg holds ADR-0002's lockstep. Every package under `packages/*`,
 * every crate under `crates/*`, the exact pins between the packages and both
 * lockfiles carry one version. Neither toolchain would notice otherwise:
 * - `npm ci` does not compare a workspace package's version with the
 *   lockfile's record of it;
 * - cargo run without `--locked`, as CI runs it, silently rewrites a stale
 *   Cargo.lock;
 * - review alone will not keep several files agreeing (ADR-0002).
 *
 * It deliberately does NOT compare the versions with the newest git tag:
 * - CI checks out a depth-1 clone with no tags, so the check would see nothing
 *   and pass vacuously;
 * - the release tags sit on `master`'s merge commits, not on ancestors of
 *   `dev`, so `git describe` from `dev` never finds them;
 * - between a release's version bump on `dev` and its tag, the manifests are
 *   rightly ahead of the newest tag, so equality would fail the one pull
 *   request that prepares a release.
 * Agreement with the tag belongs to the release procedure (CONTRIBUTING.md),
 * not to this check.
 *
 * Reads source text; builds nothing, and writes nothing. `--root <dir>` reads
 * a copy of the same files instead of this checkout, which is how its tests
 * break one value at a time; CI runs it without arguments.
 *
 * Exit status: 0 when everything agrees, 1 on any mismatch, 2 on bad usage.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: node scripts/check-contract-sync.mjs [--root <dir>]";

function usage(problem) {
    console.error(`contract-check: ${problem}\n${USAGE}`);
    process.exit(2);
}

// Strict on purpose: a mistyped flag must not quietly check this checkout
// instead of the directory it was meant to read.
function parseArguments(argv) {
    let root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        let value;
        if (arg === "--root") value = argv[++i];
        else if (arg.startsWith("--root=")) value = arg.slice("--root=".length);
        else usage(`unknown argument ${JSON.stringify(arg)}`);
        if (value === undefined || value === "" || value.startsWith("--")) {
            usage("--root needs a directory");
        }
        root = value;
    }
    return root;
}

const ROOT = parseArguments(process.argv.slice(2));

const CONTRACT = "packages/cv-backend-spec/src/cv_backend.ts";
const TS_KNOWN = "packages/nft-tracker/src/target/format/known.ts";
const RS_KNOWN = "crates/wnft-format/src/known.rs";

// Every version is compared with the contract package's: it is the root of
// the pins between the packages.
const REFERENCE_PACKAGE = "@webarkit/cv-backend-spec";
// The workspaces' own globs, `packages/*` (package.json) and `crates/*`
// (Cargo.toml), so a package or crate added later is checked without editing
// this script. The fuzz harness sits one level deeper and is not part of the
// lockstep (ADR-0002, point 1).
const NPM_PARENT = "packages";
const CRATE_PARENT = "crates";
const NPM_LOCK = "package-lock.json";
const CARGO_LOCK = "Cargo.lock";
const DEPENDENCY_SECTIONS = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
];

const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

/** Every double-quoted string in a fragment of source, in order. */
const quoted = (fragment) => [...fragment.matchAll(/"([^"\\]*)"/g)].map((m) => m[1]);

/** `export type NAME = "a" | "b";` — the contract's own union. */
function tsUnion(source, name, where) {
    const m = new RegExp(`export type ${name}\\s*=([^;]*);`).exec(source);
    if (m === null) fail(`${where}: no \`export type ${name}\` found`);
    return quoted(m[1]);
}

/** `export const NAME = [...] as const;` */
function tsList(source, name, where) {
    const m = new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source);
    if (m === null) fail(`${where}: no \`export const ${name} = [...]\` found`);
    return quoted(m[1]);
}

/** `export const NAME = <literal>;` */
function tsScalar(source, name, where) {
    const m = new RegExp(`export const ${name}\\s*=\\s*([^;]*);`).exec(source);
    if (m === null) fail(`${where}: no \`export const ${name}\` found`);
    return m[1].trim().replace(/^"|"$/g, "");
}

/** `pub(crate) const NAME: &[&str] = &[...];` */
function rsList(source, name, where) {
    const m = new RegExp(`const ${name}\\s*:\\s*&\\[&str\\]\\s*=\\s*&\\[([^\\]]*)\\]`).exec(source);
    if (m === null) fail(`${where}: no \`const ${name}: &[&str]\` found`);
    return quoted(m[1]);
}

/** `pub(crate) const NAME: <type> = <literal>;` */
function rsScalar(source, name, where) {
    const m = new RegExp(`const ${name}\\s*:[^=]*=\\s*([^;]*);`).exec(source);
    if (m === null) fail(`${where}: no \`const ${name}\` found`);
    return m[1].trim().replace(/^"|"$/g, "");
}

/** A file's text; `null`, with a problem recorded, if it cannot be read. */
function text(relative) {
    try {
        return read(relative);
    } catch (e) {
        fail(`${relative}: cannot be read (${e.code ?? e.message})`);
        return null;
    }
}

/**
 * A JSON object; `null`, with a problem recorded, if the file is missing, does
 * not parse, or holds something other than an object. A leading byte-order
 * mark is dropped, as npm and Node drop it.
 */
function json(relative) {
    const source = text(relative);
    if (source === null) return null;
    let value;
    try {
        value = JSON.parse(source.replace(/^﻿/, ""));
    } catch (e) {
        fail(`${relative}: not valid JSON (${e.message})`);
        return null;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail(`${relative}: not a JSON object`);
        return null;
    }
    return value;
}

/** `<parent>/<dir>/<file>` for each directory directly under `parent` that holds `file`. */
function manifestsUnder(parent, file) {
    let entries;
    try {
        entries = readdirSync(join(ROOT, parent), { withFileTypes: true });
    } catch (e) {
        fail(`${parent}/: cannot be listed (${e.code ?? e.message})`);
        return [];
    }
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${parent}/${entry.name}/${file}`)
        .filter((path) => existsSync(join(ROOT, path)))
        .sort();
}

/** The text of one TOML table, from its `header` line to the next table; `null` if absent. */
function tomlTable(source, header) {
    const lines = source.replace(/^﻿/, "").split(/\r?\n/);
    // `[ package ]  # a comment` is the same header as `[package]`.
    const bare = (line) => line.replace(/#.*$/, "").replace(/\s+/g, "");
    const start = lines.findIndex((line) => bare(line) === header);
    if (start < 0) return null;
    const body = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trimStart().startsWith("[")) break;
        body.push(line);
    }
    return body.join("\n");
}

/** `key = "value"` or `key = 'value'` in a TOML table's text: the string, or `null`. */
function tomlString(table, key) {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')\\s*(#.*)?$`, "m").exec(table);
    return m === null ? null : (m[1] ?? m[2]);
}

/**
 * Every version Cargo.lock records for the workspace's own package `name`.
 * Registry and git copies of the same name carry a `source` line, and are not
 * it.
 */
function cargoLockVersions(source, name) {
    return source
        .split("[[package]]")
        .slice(1)
        .filter(
            (block) => tomlString(block, "name") === name && tomlString(block, "source") === null,
        )
        .map((block) => tomlString(block, "version"));
}

const problems = [];
const notes = [];

function fail(message) {
    problems.push(message);
    return [];
}

/** Set equality, with order reported separately: order carries no meaning. */
function sameMembers(label, a, aWhere, b, bWhere) {
    const missingFromB = a.filter((x) => !b.includes(x));
    const missingFromA = b.filter((x) => !a.includes(x));
    if (missingFromB.length > 0 || missingFromA.length > 0) {
        const lines = [`${label}: ${aWhere} and ${bWhere} disagree.`];
        if (missingFromB.length > 0) {
            lines.push(`    in ${aWhere} but not ${bWhere}: ${missingFromB.join(", ")}`);
        }
        if (missingFromA.length > 0) {
            lines.push(`    in ${bWhere} but not ${aWhere}: ${missingFromA.join(", ")}`);
        }
        problems.push(lines.join("\n"));
        return;
    }
    if (a.join("\u0000") !== b.join("\u0000")) {
        // Membership is what decides whether a set is usable; order does not.
        // Still worth saying, because a diverging order is usually the visible
        // half of an edit that was only half applied.
        notes.push(
            `${label}: same members, different order — ${aWhere} has [${a.join(", ")}], ${bWhere} has [${b.join(", ")}]`,
        );
    }
}

function sameScalar(label, a, aWhere, b, bWhere) {
    if (a !== b) {
        problems.push(
            `${label}: ${aWhere} says ${JSON.stringify(a)}, ${bWhere} says ${JSON.stringify(b)}`,
        );
    }
}

const contract = read(CONTRACT);
const ts = read(TS_KNOWN);
const rs = read(RS_KNOWN);

// --- leg 0: the compile-time pin inside known.ts must still be there --------
// Without it, `known.ts` can drift from the contract between runs of this
// script, and a reviewer reading known.ts would have no signal at all.
for (const required of [
    "satisfies readonly DescriptorKind[]",
    "satisfies readonly DescriptorNorm[]",
    "satisfies readonly DetectorKind[]",
    "Exclude<",
]) {
    if (!ts.includes(required)) {
        problems.push(
            `${TS_KNOWN}: the compile-time pin is gone — \`${required}\` is no longer present.\n` +
                `    That guard is what ties these lists to the contract's unions at build time;\n` +
                `    this script is the backstop, not the replacement. Restore it.`,
        );
    }
}

// --- leg 1: contract union -> known.ts -------------------------------------
for (const [union, list] of [
    ["DescriptorKind", "KNOWN_DESCRIPTOR_KINDS"],
    ["DescriptorNorm", "KNOWN_DESCRIPTOR_NORMS"],
    ["DetectorKind", "KNOWN_DETECTOR_KINDS"],
]) {
    sameMembers(
        union,
        tsUnion(contract, union, CONTRACT),
        `${CONTRACT} (${union})`,
        tsList(ts, list, TS_KNOWN),
        `${TS_KNOWN} (${list})`,
    );
}

// --- leg 2: known.ts -> known.rs -------------------------------------------
// `KNOWN_DETECTOR_KINDS` has no Rust counterpart on purpose: §5.5 makes
// `detector.kind` informative, any string is legal, and the crate constrains
// it nowhere. Its absence is the rule working, not a gap.
for (const name of [
    "KNOWN_DESCRIPTOR_KINDS",
    "KNOWN_DESCRIPTOR_NORMS",
    "KNOWN_ELEMENT_TYPES",
    "IMPLEMENTED_EXTENSIONS",
]) {
    sameMembers(name, tsList(ts, name, TS_KNOWN), TS_KNOWN, rsList(rs, name, RS_KNOWN), RS_KNOWN);
}

// Two codecs claiming different versions of the same format would read each
// other's files as unsupported — loudly, but only once a file crosses between
// them, which is exactly what §8.2 item 4 exists to test and what a developer
// mid-bump would not hit.
for (const name of ["SUPPORTED_FORMAT_VERSION", "SUPPORTED_CONTAINER_MAJOR"]) {
    sameScalar(
        name,
        tsScalar(ts, name, TS_KNOWN),
        TS_KNOWN,
        rsScalar(rs, name, RS_KNOWN),
        RS_KNOWN,
    );
}

// --- leg 3: lockstep versions (ADR-0002) -----------------------------------
const contractProblems = problems.length;

const packages = [];
for (const file of manifestsUnder(NPM_PARENT, "package.json")) {
    const manifest = json(file);
    if (manifest === null) continue;
    if (typeof manifest.version !== "string") {
        fail(`${file}: no "version" field`);
        continue;
    }
    packages.push({ name: manifest.name, file, version: manifest.version, manifest });
}
const byName = new Map(packages.map((p) => [p.name, p]));

// Only the literal `version = "..."` is read. A crate that inherits its
// version (`version.workspace = true`) is refused rather than skipped: a
// version this check cannot see is one it would wave through.
const crates = [];
for (const file of manifestsUnder(CRATE_PARENT, "Cargo.toml")) {
    const source = text(file);
    if (source === null) continue;
    const table = tomlTable(source, "[package]");
    const name = table === null ? null : tomlString(table, "name");
    const version = table === null ? null : tomlString(table, "version");
    if (name === null || version === null) {
        fail(
            `${file}: no literal \`name\` and \`version = "..."\` in [package].\n` +
                `    This check reads the literal only; teach it [workspace.package] before inheriting.`,
        );
        continue;
    }
    crates.push({ name, file, version });
}

const reference = byName.get(REFERENCE_PACKAGE);
if (reference === undefined) {
    fail(`${NPM_PARENT}/: no package named ${REFERENCE_PACKAGE} to compare the others with`);
} else {
    for (const p of [...packages, ...crates]) {
        if (p !== reference) {
            sameScalar("version", reference.version, reference.file, p.version, p.file);
        }
    }
}

// Exact, not a range: under lockstep the right pin is the version itself, and
// a range would let a published copy of an older package satisfy it.
function samePins(dependencies, where) {
    for (const section of DEPENDENCY_SECTIONS) {
        for (const [dep, pinned] of Object.entries(dependencies[section] ?? {})) {
            const target = byName.get(dep);
            if (target === undefined) continue;
            sameScalar(`${dep} pin`, pinned, `${where} (${section})`, target.version, target.file);
        }
    }
}

for (const p of packages) samePins(p.manifest, p.file);

const lock = json(NPM_LOCK);
if (lock !== null) {
    for (const p of packages) {
        const key = p.file.slice(0, -"/package.json".length);
        const entry = lock.packages?.[key];
        if (entry === undefined) {
            fail(`${NPM_LOCK}: no entry for "${key}" (${p.name})`);
            continue;
        }
        sameScalar(
            `${p.name} in the lockfile`,
            entry.version,
            `${NPM_LOCK} "${key}"`,
            p.version,
            p.file,
        );
        samePins(entry, `${NPM_LOCK} "${key}"`);
    }
}

const cargoLock = crates.length > 0 ? text(CARGO_LOCK) : null;
if (cargoLock !== null) {
    for (const c of crates) {
        const locked = cargoLockVersions(cargoLock, c.name);
        if (locked.length !== 1) {
            fail(
                `${CARGO_LOCK}: ${locked.length === 0 ? "no" : locked.length} [[package]] ` +
                    `entr${locked.length === 1 ? "y" : "ies"} for the workspace's own "${c.name}"`,
            );
            continue;
        }
        sameScalar(`${c.name} in the lockfile`, locked[0], CARGO_LOCK, c.version, c.file);
    }
}

const versionProblems = problems.length - contractProblems;

// --- report ----------------------------------------------------------------

for (const note of notes) console.log(`note: ${note}`);

if (problems.length > 0) {
    console.error(
        `\ncontract-check: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`,
    );
    for (const p of problems) console.error(`  ${p}\n`);
    if (contractProblems > 0) {
        console.error(
            "The contract's unions, the TypeScript codec's lists and the Rust codec's\n" +
                "lists must agree. No test catches this: a member present in one and missing\n" +
                "from the other only shows up on a .wnft file that no fixture contains.\n",
        );
    }
    if (versionProblems > 0) {
        console.error(
            "Every package and crate, the exact pins between the packages and both\n" +
                "lockfiles carry one version: ADR-0002 (docs/adr/0002-lockstep-versioning.md).\n" +
                "Review alone will not keep several files agreeing; this check does.\n",
        );
    }
    process.exit(1);
}

console.log(
    `contract-check: the contract, known.ts and known.rs agree, and every package, pin and lockfile is at ${reference.version}.`,
);
