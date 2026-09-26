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
 * Reads source text; builds nothing, and writes nothing.
 *
 * Exit status: 0 when everything agrees, 1 on any mismatch.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CONTRACT = "packages/cv-backend-spec/src/cv_backend.ts";
const TS_KNOWN = "packages/nft-tracker/src/target/format/known.ts";
const RS_KNOWN = "crates/wnft-format/src/known.rs";

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

// --- report ----------------------------------------------------------------

for (const note of notes) console.log(`note: ${note}`);

if (problems.length > 0) {
    console.error(
        `\ncontract-check: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`,
    );
    for (const p of problems) console.error(`  ${p}\n`);
    console.error(
        "The contract's unions, the TypeScript codec's lists and the Rust codec's\n" +
            "lists must agree. No test catches this: a member present in one and missing\n" +
            "from the other only shows up on a .wnft file that no fixture contains.\n",
    );
    process.exit(1);
}

console.log("contract-check: the contract, known.ts and known.rs agree.");
