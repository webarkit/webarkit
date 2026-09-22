/*
 *  format-on-edit.mjs
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
 * A `PostToolUse` hook: format a file an agent just edited.
 *
 * Two languages, one process, because two hooks would mean two node startups
 * on every single edit:
 *
 * - **Rust** — `rustfmt` on a `.rs` under `crates/`. About 200 ms, and its
 *   output is what `cargo fmt --all --check` asks for, so hook and CI cannot
 *   disagree.
 * - **TypeScript and `.mjs`** — prettier, through its Node API rather than the
 *   CLI, which avoids a second process and reads `.prettierrc.json` and
 *   `.prettierignore` exactly as `npm run format` does. Scope is therefore the
 *   repository's, not this file's opinion of it: a path prettier ignores is
 *   left alone here too.
 *
 * Formatting only, never linting. `cargo clippy --workspace --all-targets`
 * takes seconds and would dominate a session if it ran after every edit; it
 * belongs on stop or pre-commit, where it already is as a CI gate.
 *
 * Three rules, because a hook that breaks an edit is worse than no hook:
 *
 * 1. **It never fails the tool call.** Exit status is always 0. A file that is
 *    syntactically invalid halfway through a multi-edit change must not block
 *    the next edit, and a contributor without a Rust toolchain — or before
 *    `npm install` — must not see errors.
 * 2. **It touches nothing outside the repository.** A path resolving outside
 *    it is ignored.
 * 3. **It reads its settings from the repository**: the Rust edition from the
 *    workspace `Cargo.toml`, the prettier options from `.prettierrc.json`.
 *    `rustfmt` defaults to edition 2015 and would silently format 2024 code by
 *    the wrong rules; a literal here would be one more thing to remember at the
 *    next bump.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));

/** Always succeed: see rule 1 above. */
function done(message) {
    if (message !== undefined) console.log(message);
    process.exit(0);
}

function readStdin() {
    try {
        return readFileSync(0, "utf8");
    } catch {
        return "";
    }
}

/** The workspace's Rust edition, so this file never has to be told about a bump. */
function rustEdition() {
    try {
        const m = /^\s*edition\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "Cargo.toml"), "utf8"));
        if (m !== null) return m[1];
    } catch {
        // A missing workspace manifest is not this hook's problem to report.
    }
    return "2024";
}

function formatRust(absolute, shown) {
    // `rustfmt` formats the one file given, in about 200 ms. Falling back to
    // `cargo fmt` would format the whole workspace, which is both slower and a
    // surprise: an edit to one file should not rewrite others.
    const probe = spawnSync("rustfmt", ["--version"], { stdio: "ignore" });
    if (probe.error !== undefined || probe.status !== 0) done(); // No toolchain. Not an error.

    try {
        execFileSync("rustfmt", ["--edition", rustEdition(), absolute], { stdio: "ignore" });
    } catch {
        // rustfmt refuses to format code it cannot parse. Mid-edit that is
        // normal, and saying so on every keystroke would be noise.
        done();
    }
    done(`rustfmt: formatted ${shown}`);
}

async function formatWithPrettier(absolute, shown) {
    let prettier;
    try {
        prettier = await import("prettier");
    } catch {
        done(); // Not installed yet. Not an error.
    }

    // Ask prettier itself whether this path is in scope, so `.prettierignore`
    // governs the hook exactly as it governs `npm run format`.
    const info = await prettier.getFileInfo(absolute, {
        ignorePath: join(ROOT, ".prettierignore"),
    });
    if (info.ignored || info.inferredParser === null) done();

    const before = readFileSync(absolute, "utf8");
    let after;
    try {
        const options = await prettier.resolveConfig(absolute);
        after = await prettier.format(before, { ...options, filepath: absolute });
    } catch {
        // Unparseable mid-edit source, same as the Rust case.
        done();
    }
    if (after === before) done();
    writeFileSync(absolute, after);
    done(`prettier: formatted ${shown}`);
}

async function main() {
    const raw = readStdin();
    if (raw.trim() === "") done();

    let filePath;
    try {
        filePath = JSON.parse(raw)?.tool_input?.file_path;
    } catch {
        done();
    }
    if (typeof filePath !== "string" || filePath === "") done();

    // Rule 2.
    const absolute = resolve(ROOT, filePath);
    const within = relative(ROOT, absolute);
    if (within.startsWith("..")) done();
    const shown = within.split(sep).join("/");

    if (absolute.endsWith(".rs")) {
        // Rust lives only in `crates/`; a stray `.rs` elsewhere is not ours.
        if (within === "crates" || within.startsWith(`crates${sep}`)) formatRust(absolute, shown);
        done();
    }

    if (/\.(ts|mts|cts|mjs|cjs|js)$/.test(absolute)) {
        await formatWithPrettier(absolute, shown);
    }
    done();
}

await main();
