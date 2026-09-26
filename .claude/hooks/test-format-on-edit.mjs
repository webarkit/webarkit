/*
 *  test-format-on-edit.mjs
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
 * Tests for `format-on-edit.mjs`.
 *
 *     node .claude/hooks/test-format-on-edit.mjs
 *
 * Not part of `npm test`, and not in CI: CI does not run hooks, and this suite
 * deliberately dirties real repository files — it uglifies one source file per
 * language, runs the hook against it, and restores the original bytes. A run
 * that dies halfway leaves those files modified; `git checkout --` puts them
 * back.
 *
 * It exists because the hook's three rules are claims about *failure*
 * behaviour, which nothing else in the repository exercises. Two of them were
 * found to be false by review rather than by running: the boundary rule was
 * checked on path strings, so a symlink inside the repository pointing outside
 * it was followed and the external file rewritten; and the prettier branch let
 * filesystem errors reject past `done()`, so the hook exited non-zero on a
 * path that had become a directory. Both have cases here now.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const HOOK = join(ROOT, ".claude", "hooks", "format-on-edit.mjs");

const TS = join(ROOT, "packages", "nft-tracker", "src", "detection.ts");
const RS = join(ROOT, "crates", "wnft-format", "src", "known.rs");
const IGNORED = join(ROOT, "examples", "js", "pinball-shared.mjs");

const read = (p) => readFileSync(p, "utf8");
const write = (p, s) => writeFileSync(p, s);

const ORIGINAL = new Map([TS, RS, IGNORED].map((p) => [p, read(p)]));
const restore = () => {
    for (const [p, s] of ORIGINAL) write(p, s);
};

/** Run the hook with a `PostToolUse` payload. Returns its status and stdout. */
function run(payload) {
    const input = typeof payload === "string" ? payload : JSON.stringify(payload);
    try {
        const stdout = execFileSync(process.execPath, [HOOK], {
            cwd: ROOT,
            input,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { status: 0, stdout: stdout.trim() };
    } catch (error) {
        return { status: error.status ?? -1, stdout: (error.stdout ?? "").trim() };
    }
}

const edited = (relative) => ({ tool_input: { file_path: relative } });

let failures = 0;
let skipped = 0;

function check(label, condition, detail = "") {
    if (!condition) failures += 1;
    console.log(`${condition ? "PASS  " : "FAIL  "}${label}${detail ? `  ${detail}` : ""}`);
}

// --- formatting, both languages ---------------------------------------------

write(TS, `${ORIGINAL.get(TS)}\n\nexport const _scratch   =    {a:1,   b:2};\n`);
{
    const r = run(edited("packages/nft-tracker/src/detection.ts"));
    check(
        "formats an in-scope .ts with prettier",
        r.status === 0 && r.stdout.startsWith("prettier:") && read(TS).includes("{ a: 1, b: 2 }"),
        `exit=${r.status}`,
    );
}
restore();

write(RS, `${ORIGINAL.get(RS)}\n\nfn    _scratch( ) ->u8{let  x=1;x}\n`);
{
    const r = run(edited("crates/wnft-format/src/known.rs"));
    // A machine without a Rust toolchain is a silent no-op, not a failure.
    const noToolchain = r.status === 0 && r.stdout === "";
    if (noToolchain) {
        skipped += 1;
        console.log("SKIP  formats a .rs with rustfmt  (no rustfmt on PATH)");
    } else {
        check(
            "formats a .rs with rustfmt",
            r.status === 0 && r.stdout.startsWith("rustfmt:") && read(RS).includes("let x = 1;"),
            `exit=${r.status}`,
        );
    }
}
restore();

// --- scope -------------------------------------------------------------------

write(IGNORED, `${ORIGINAL.get(IGNORED)}\n\nexport const _scratch   =    {a:1,   b:2};\n`);
{
    const r = run(edited("examples/js/pinball-shared.mjs"));
    check(
        "leaves a .prettierignore'd path alone",
        r.status === 0 && r.stdout === "" && read(IGNORED).includes("{a:1,   b:2}"),
        `exit=${r.status}`,
    );
}
restore();

{
    const r = run(edited("AGENTS.md"));
    check("ignores Markdown", r.status === 0 && r.stdout === "", `exit=${r.status}`);
}

// --- rule 2: the repository boundary, on resolved paths ----------------------

{
    const r = run(edited("../../elsewhere/evil.ts"));
    check("ignores a path escaping the repository", r.status === 0 && r.stdout === "");
}

{
    // The case a lexical check misses: a symlink *inside* the repository whose
    // target is outside it. Before this was fixed, the hook followed it and
    // rewrote the external file.
    const outside = join(tmpdir(), `wnft-hook-escape-${process.pid}.ts`);
    const link = join(ROOT, "packages", "nft-tracker", "src", "_escape_test.ts");
    const contents = "export const outside   =   {a:1,  b:2};\n";
    write(outside, contents);
    let created = false;
    try {
        symlinkSync(outside, link, "file");
        created = true;
    } catch {
        skipped += 1;
        console.log(
            "SKIP  a symlink out of the repository is not followed  (cannot create symlinks here)",
        );
    }
    if (created) {
        const r = run(edited("packages/nft-tracker/src/_escape_test.ts"));
        check(
            "does not follow a symlink out of the repository",
            r.status === 0 && read(outside) === contents,
            `exit=${r.status}`,
        );
        unlinkSync(link);
    }
    rmSync(outside, { force: true });
}

// --- rule 1: nothing fails the tool call -------------------------------------

write(TS, `${ORIGINAL.get(TS)}\n\nexport const broken = {{{ ;\n`);
{
    const r = run(edited("packages/nft-tracker/src/detection.ts"));
    check(
        "survives unparseable TypeScript, and leaves it alone",
        r.status === 0 && read(TS).includes("{{{ ;"),
        `exit=${r.status}`,
    );
}
restore();

{
    // A filesystem error rather than a parse error: the path is a directory.
    // Before this was fixed, readFileSync rejected past done() and the hook
    // exited 1.
    const asDirectory = join(ROOT, "packages", "nft-tracker", "src", "_dir_test.ts");
    mkdirSync(asDirectory, { recursive: true });
    const r = run(edited("packages/nft-tracker/src/_dir_test.ts"));
    check("survives a path that is a directory", r.status === 0, `exit=${r.status}`);
    rmSync(asDirectory, { recursive: true, force: true });
}

for (const [label, payload] of [
    ["malformed JSON", "{not json"],
    ["empty stdin", ""],
    ["an absent file_path", JSON.stringify({ tool_input: {} })],
]) {
    const r = run(payload);
    check(`survives ${label}`, r.status === 0, `exit=${r.status}`);
}

// --- the suite must not leave the tree dirty ---------------------------------

restore();
check(
    "every touched file is restored byte-for-byte",
    [...ORIGINAL].every(([p, s]) => read(p) === s),
);

console.log(
    `\n${failures === 0 ? "ok" : `${failures} failed`}${skipped > 0 ? `, ${skipped} skipped` : ""}`,
);
process.exit(failures === 0 ? 0 : 1);
