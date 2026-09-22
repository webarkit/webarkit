/*
 *  format-rust-on-edit.mjs
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
 * A `PostToolUse` hook: run `rustfmt` on a `.rs` file an agent just edited.
 *
 * Why only Rust, and why only formatting:
 *
 * - **Rust only**, because this repository has no TypeScript formatter. There
 *   is no prettier and no eslint anywhere in it, so the "TS" half of the
 *   original proposal is not a hook at all — it is a decision to adopt a
 *   formatter, which would reformat the whole codebase in one commit and
 *   deserves its own issue.
 * - **Formatting only**, not linting. `rustfmt` on one file takes about
 *   200 ms and its result is what `cargo fmt --all --check` asks for, so the
 *   hook and CI can never disagree. `cargo clippy --workspace --all-targets`
 *   takes seconds and would dominate a session if it ran after every edit; it
 *   belongs on stop or pre-commit, not here.
 *
 * Three rules this hook holds to, because a hook that breaks an edit is worse
 * than no hook:
 *
 * 1. **It never fails the tool call.** Exit status is always 0. A file that is
 *    syntactically invalid halfway through a multi-edit change must not block
 *    the next edit, and a contributor with no Rust toolchain editing
 *    documentation must not see errors.
 * 2. **It touches nothing outside `crates/`.** Any other path is ignored.
 * 3. **It reads the edition from the workspace `Cargo.toml`** rather than
 *    hard-coding it. `rustfmt` defaults to edition 2015 and would silently
 *    format 2024 code by the wrong rules; a literal here would be one more
 *    thing to remember at the next edition bump.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const raw = readStdin();
if (raw.trim() === "") done();

let filePath;
try {
    filePath = JSON.parse(raw)?.tool_input?.file_path;
} catch {
    done();
}
if (typeof filePath !== "string" || filePath === "") done();

// Rule 2: inside crates/, and Rust.
const absolute = resolve(ROOT, filePath);
const within = relative(ROOT, absolute);
if (
    !absolute.endsWith(".rs") ||
    within.startsWith("..") ||
    !(within === "crates" || within.startsWith(`crates${sep}`))
) {
    done();
}

// Rule 3: the edition is the workspace's, not this file's opinion of it.
let edition = "2024";
try {
    const m = /^\s*edition\s*=\s*"([^"]+)"/m.exec(
        readFileSync(join(ROOT, "Cargo.toml"), "utf8"),
    );
    if (m !== null) edition = m[1];
} catch {
    // Fall through to the default; a missing workspace manifest is not this
    // hook's problem to report.
}

// `rustfmt` first: it formats the one file given and takes ~200 ms. Falling
// back to `cargo fmt` would format the whole workspace, which is both slower
// and a surprise — an edit to one file should not rewrite others.
const probe = spawnSync("rustfmt", ["--version"], { stdio: "ignore" });
if (probe.error !== undefined || probe.status !== 0) {
    done(); // No Rust toolchain here. Not an error.
}

try {
    execFileSync("rustfmt", ["--edition", edition, absolute], {
        stdio: "ignore",
    });
} catch {
    // rustfmt refuses to format code it cannot parse. Mid-edit that is
    // normal and expected, and saying so on every keystroke would be noise.
    done();
}

done(`rustfmt: formatted ${within.split(sep).join("/")}`);
