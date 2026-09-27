/*
 *  check-contract-sync.test.mjs
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

// `scripts/check-contract-sync.mjs`, driven as CI drives it: spawned, with
// `--root` pointing at a copy of the files it reads, one value broken per case.
// It lives beside `compare-exports.test.mjs`, which tests `compare-bench.mjs`
// the same way, so `npm test` runs it with no extra wiring.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = join(REPO, "scripts", "check-contract-sync.mjs");

const SPEC = "packages/cv-backend-spec/package.json";
const JSFEATNEXT = "packages/cv-backend-jsfeatnext/package.json";
const TRACKER = "packages/nft-tracker/package.json";
const CRATE = "crates/wnft-format/Cargo.toml";
const NPM_LOCK = "package-lock.json";
const CARGO_LOCK = "Cargo.lock";
const RS_KNOWN = "crates/wnft-format/src/known.rs";

/** Everything the script reads, copied as it stands in this checkout. */
const FILES = [
    "packages/cv-backend-spec/src/cv_backend.ts",
    "packages/nft-tracker/src/target/format/known.ts",
    RS_KNOWN,
    SPEC,
    JSFEATNEXT,
    TRACKER,
    CRATE,
    NPM_LOCK,
    CARGO_LOCK,
];

/** The version every manifest carries today; the cases break one copy of it. */
const VERSION = JSON.parse(readFileSync(join(REPO, SPEC), "utf8")).version;

const roots = [];
afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A copy of the checked files in a fresh directory, with `edits` applied as
 * `[file, from, to]` text replacements and `added` written as new files. Each
 * replacement must match exactly once: a case whose edit silently missed would
 * test the untouched tree.
 */
function tree(edits = [], added = {}) {
    const root = mkdtempSync(join(tmpdir(), "contract-check-"));
    roots.push(root);
    for (const file of FILES) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        copyFileSync(join(REPO, file), join(root, file));
    }
    for (const [file, from, to] of edits) {
        const path = join(root, file);
        const text = readFileSync(path, "utf8");
        const at = text.indexOf(from);
        if (at < 0 || text.indexOf(from, at + 1) >= 0) {
            throw new Error(`edit to ${file} must match exactly once: ${JSON.stringify(from)}`);
        }
        writeFileSync(path, text.replace(from, to));
    }
    for (const [file, text] of Object.entries(added)) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), text);
    }
    return root;
}

/** Rewrites a JSON file of the copy in place: `mutate` edits the parsed value. */
function editJson(root, file, mutate) {
    const path = join(root, file);
    const value = JSON.parse(readFileSync(path, "utf8"));
    mutate(value);
    writeFileSync(path, JSON.stringify(value, null, 2));
}

const spawn = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
const run = (root) => spawn("--root", root);

/** Fails with a message that names every one of `parts`. */
function expectFailure(edits, ...parts) {
    return expectFailureIn(tree(edits), ...parts);
}

function expectFailureIn(root, ...parts) {
    const r = run(root);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    for (const part of parts) expect(r.stderr).toContain(part);
    return r.stderr;
}

function expectPass(root) {
    const r = run(root);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    return r.stdout;
}

describe("check-contract-sync: lockstep versions (ADR-0002)", () => {
    it("passes on this checkout, and on an unchanged copy of it", () => {
        const here = spawn();
        expect(here.status, here.stdout + here.stderr).toBe(0);
        expect(expectPass(tree())).toContain(VERSION);
    });

    it("fails when a package.json disagrees with the others, naming both files and values", () => {
        expectFailure(
            [[TRACKER, `"version": "${VERSION}"`, `"version": "9.9.9"`]],
            TRACKER,
            SPEC,
            '"9.9.9"',
            `"${VERSION}"`,
        );
    });

    it("fails when the crate disagrees with the packages", () => {
        expectFailure(
            [[CRATE, `version = "${VERSION}"`, `version = "9.9.9"`]],
            CRATE,
            SPEC,
            '"9.9.9"',
            `"${VERSION}"`,
        );
    });

    it("checks every package under packages/, not a fixed list", () => {
        const extra = "packages/extra/package.json";
        expectFailureIn(
            tree([], { [extra]: JSON.stringify({ name: "@webarkit/extra", version: "9.9.9" }) }),
            extra,
            '"9.9.9"',
            SPEC,
        );
    });

    it("checks every crate under crates/, not a fixed list", () => {
        const extra = "crates/extra/Cargo.toml";
        expectFailureIn(
            tree([], { [extra]: '[package]\nname = "extra"\nversion = "9.9.9"\n' }),
            extra,
            '"9.9.9"',
            SPEC,
        );
    });

    it("fails when a dependency pin names another version than its package's", () => {
        expectFailure(
            [
                [
                    JSFEATNEXT,
                    `"@webarkit/cv-backend-spec": "${VERSION}"`,
                    `"@webarkit/cv-backend-spec": "0.1.0"`,
                ],
            ],
            JSFEATNEXT,
            "@webarkit/cv-backend-spec",
            '"0.1.0"',
            SPEC,
            `"${VERSION}"`,
        );
    });

    it("checks devDependencies pins as well", () => {
        expectFailure(
            [
                [
                    TRACKER,
                    `"@webarkit/cv-backend-jsfeatnext": "${VERSION}"`,
                    `"@webarkit/cv-backend-jsfeatnext": "0.1.0"`,
                ],
            ],
            TRACKER,
            "@webarkit/cv-backend-jsfeatnext",
            '"0.1.0"',
            JSFEATNEXT,
        );
    });

    it.each(["peerDependencies", "optionalDependencies"])("checks %s pins as well", (section) => {
        expectFailure(
            [
                [
                    TRACKER,
                    '"dependencies": {',
                    `"${section}": { "@webarkit/cv-backend-spec": "0.1.0" },\n  "dependencies": {`,
                ],
            ],
            TRACKER,
            `(${section})`,
            '"0.1.0"',
        );
    });

    it.each([`^${VERSION}`, `~${VERSION}`, `>=${VERSION}`, "*"])(
        "requires the pins between the packages to be exact, so %s fails",
        (range) => {
            expectFailure(
                [
                    [
                        JSFEATNEXT,
                        `"@webarkit/cv-backend-spec": "${VERSION}"`,
                        `"@webarkit/cv-backend-spec": "${range}"`,
                    ],
                ],
                JSFEATNEXT,
                `"${range}"`,
            );
        },
    );

    it("fails when package-lock.json still records an old version of a package", () => {
        expectFailure(
            [
                [
                    NPM_LOCK,
                    `"packages/nft-tracker": {\n      "name": "@webarkit/nft-tracker",\n      "version": "${VERSION}"`,
                    `"packages/nft-tracker": {\n      "name": "@webarkit/nft-tracker",\n      "version": "0.1.0"`,
                ],
            ],
            NPM_LOCK,
            "@webarkit/nft-tracker",
            '"0.1.0"',
            TRACKER,
        );
    });

    it("fails when package-lock.json still records an old pin", () => {
        expectFailure(
            [
                [
                    NPM_LOCK,
                    `"@webarkit/cv-backend-jsfeatnext": "${VERSION}"`,
                    `"@webarkit/cv-backend-jsfeatnext": "0.1.0"`,
                ],
            ],
            NPM_LOCK,
            "@webarkit/cv-backend-jsfeatnext",
            '"0.1.0"',
        );
    });

    it("fails when a package-lock.json entry drops a pin its manifest declares", () => {
        const root = tree();
        editJson(root, NPM_LOCK, (lock) => {
            delete lock.packages["packages/cv-backend-jsfeatnext"].dependencies[
                "@webarkit/cv-backend-spec"
            ];
        });
        expectFailureIn(
            root,
            `${NPM_LOCK} "packages/cv-backend-jsfeatnext" (dependencies)`,
            "no @webarkit/cv-backend-spec",
            JSFEATNEXT,
        );
    });

    it("fails when a package-lock.json entry records a pin its manifest does not declare", () => {
        const root = tree();
        editJson(root, NPM_LOCK, (lock) => {
            lock.packages["packages/cv-backend-spec"].dependencies = {
                "@webarkit/nft-tracker": VERSION,
            };
        });
        expectFailureIn(
            root,
            `${NPM_LOCK} "packages/cv-backend-spec"`,
            "@webarkit/nft-tracker",
            SPEC,
        );
    });

    it("fails when Cargo.lock still records an old version of the crate", () => {
        expectFailure(
            [
                [
                    CARGO_LOCK,
                    `name = "wnft-format"\nversion = "${VERSION}"`,
                    `name = "wnft-format"\nversion = "0.1.0"`,
                ],
            ],
            CARGO_LOCK,
            CRATE,
            '"0.1.0"',
        );
    });

    it("reads the crate's own Cargo.lock entry, not a registry copy of the same name", () => {
        const registry = (version) =>
            `[[package]]\nname = "wnft-format"\nversion = "${version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n\n`;
        const own = `[[package]]\nname = "wnft-format"\nversion = "${VERSION}"`;
        // A registry copy at another version is not the crate: this passes.
        expectPass(tree([[CARGO_LOCK, own, registry("0.1.0") + own]]));
        // A stale own entry is caught even when a registry copy agrees.
        expectFailure(
            [
                [
                    CARGO_LOCK,
                    own,
                    registry(VERSION) + `[[package]]\nname = "wnft-format"\nversion = "0.1.0"`,
                ],
            ],
            CARGO_LOCK,
            '"0.1.0"',
        );
    });

    describe("fails closed rather than skipping what it cannot read", () => {
        it("a crate version inherited from the workspace", () => {
            expectFailure([[CRATE, `version = "${VERSION}"`, "version.workspace = true"]], CRATE);
        });

        it("a package.json without a version", () => {
            expectFailure([[TRACKER, `"version": "${VERSION}",`, ""]], TRACKER, '"version"');
        });

        it("a package.json that is not valid JSON", () => {
            expectFailure(
                [[TRACKER, `"version": "${VERSION}",`, `"version": "${VERSION}",,`]],
                TRACKER,
                "not valid JSON",
            );
        });

        it("a package.json that parses to something other than an object", () => {
            const root = tree();
            writeFileSync(join(root, SPEC), "null");
            expectFailureIn(root, SPEC);
        });

        it("a package missing from package-lock.json", () => {
            expectFailure(
                [[NPM_LOCK, '"packages/nft-tracker": {', '"packages/nft-tracker-old": {']],
                NPM_LOCK,
                'no entry for "packages/nft-tracker"',
            );
        });

        it("a crate missing from Cargo.lock", () => {
            expectFailure(
                [[CARGO_LOCK, 'name = "wnft-format"', 'name = "wnft-format-old"']],
                CARGO_LOCK,
                '"wnft-format"',
            );
        });

        it("a missing Cargo.lock, reported rather than thrown", () => {
            const root = tree();
            rmSync(join(root, CARGO_LOCK));
            const stderr = expectFailureIn(root, CARGO_LOCK);
            expect(stderr).not.toContain("    at ");
        });
    });

    describe("accepts what its toolchains accept", () => {
        it("a byte-order mark at the start of a package.json", () => {
            const root = tree();
            const path = join(root, TRACKER);
            writeFileSync(path, String.fromCharCode(0xfeff) + readFileSync(path, "utf8"));
            expectPass(root);
        });

        it("a comment after [package], and a single-quoted version", () => {
            expectPass(
                tree([
                    [CRATE, "[package]", "[package] # the codec"],
                    [CRATE, `version = "${VERSION}"`, `version = '${VERSION}'`],
                ]),
            );
        });

        it("a multiline array before name and version, closed on its own line", () => {
            expectPass(tree([[CRATE, "[package]\n", '[package]\nkeywords = [\n    "ar",\n]\n']]));
        });

        it("a multiline array whose element line starts with [", () => {
            expectPass(tree([[CRATE, "[package]\n", '[package]\nexclude = [\n    ["a"],\n]\n']]));
        });

        it("a multiline string with a line that starts with [", () => {
            expectPass(
                tree([[CRATE, "[package]\n", '[package]\nreadme = """\n[beta] notes\n"""\n']]),
            );
        });
    });

    it("points at ADR-0002 when versions disagree", () => {
        expect(
            expectFailure([[TRACKER, `"version": "${VERSION}"`, `"version": "9.9.9"`]]),
        ).toContain("ADR-0002");
    });
});

describe("check-contract-sync: arguments", () => {
    it("reads the contract legs from --root too", () => {
        expectFailure([[RS_KNOWN, `"hamming"`, `"hammingx"`]], RS_KNOWN);
    });

    it("accepts --root=<dir>", () => {
        const root = tree([[TRACKER, `"version": "${VERSION}"`, `"version": "9.9.9"`]]);
        const r = spawn(`--root=${root}`);
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stderr).toContain('"9.9.9"');
    });

    it.each([[["--roots", "x"]], [["--root"]], [["--root", "--verbose"]], [["extra"]]])(
        "refuses %j with exit 2 instead of checking this checkout",
        (args) => {
            const r = spawn(...args);
            expect(r.status, r.stdout + r.stderr).toBe(2);
        },
    );
});
