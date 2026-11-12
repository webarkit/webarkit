/*
 *  2026-11-11-243-link-monitor.mjs
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
 * M9's link monitor (#243): validity rule V7 of docs/benchmarks/2026-11-10-243-registration.md,
 * "No drop, attested by the link monitor as M4's setup item 4 defines it, its log beside the
 * export as `<export>.link.txt`". M4's monitor ran from outside the repository and is not on the
 * notebook that serves M9's pre-flight. This one is written from the definition in
 * docs/benchmarks/README.md (M4's setup, item 4, 2026-10-13) and reproduces the format of M4's
 * eight committed `.link.txt` logs, which `2026-11-11-243-run-check.mjs` reads. The maintainer's
 * ruling of 2026-11-11, before the pre-flight: committed with the pre-flight's record, and held by
 * the freeze from the pre-flight on, like the analysis and the run check.
 *
 * The definition, quoted from M4's setup item 4:
 *
 * - "It runs from before Start to after the export's download. At each end it records the UTC
 *   time, `adb -s Tab9WEEA0001504 devices -l` (whose `transport_id` changes at every
 *   reconnection), and `adb -s Tab9WEEA0001504 reverse --list`. At the start it also records
 *   `adb --version`."
 * - "Between the two ends, it keeps everything the adb server's own log gained. That log is
 *   `%TEMP%\adb.log` on the session's Windows PC. The monitor notes the log's length at the start,
 *   and at the end copies every line written since."
 * - "'No drop' holds when all three agree: the log gained no `connection terminated` line naming
 *   the device, the `transport_id` is the same at both ends, and the mapping shows at both ends.
 *   Anything else is a drop."
 *
 * Usage, in Git Bash, the runbook's steps 2 and 5 of "Each run, in order":
 *
 *     node docs/benchmarks/2026-11-11-243-link-monitor.mjs begin <export stem>.link.txt
 *     node docs/benchmarks/2026-11-11-243-link-monitor.mjs end   <export stem>.link.txt
 *
 * `begin` writes the header and the `## begin` section to a file that must not exist yet. `end`
 * appends the `## end`, `## adb.log lines written between begin and end (N bytes)` and
 * `## verdict` sections, reading the begin's length and readings back from the file. `end` exits 0
 * on "no drop: true", 1 on a drop (the log is written either way), and 2 when it cannot read or
 * write what it needs. `--adb-log <path>` names the adb server's log; the default is
 * `%TEMP%\adb.log`.
 *
 * Three things this monitor does that M4's committed logs do not show, since all eight of them
 * gained 0 bytes and were stored after a CRLF-to-LF normalization (2026-10-14's session record):
 *
 * - adb's own output and the gained log lines are written with LF line endings, each `\r` before
 *   a line feed dropped. The `(N bytes)` in the heading counts the log's raw bytes, CRs included.
 * - "Naming the device" is read as M4's rule and the run check read it: a line that matches
 *   `connection terminated` and contains the serial.
 * - The `transport_id` agrees only when the device line reads `device` at both ends, as the run
 *   check's reading of a log requires; and a log shorter at the end than at the start (the adb
 *   server restarted and began a new log) is a drop, its whole new content copied.
 *
 * Exercised both ways in docs/benchmarks/2026-11-11-243-link-monitor.test.mjs (`node --test`),
 * which also reproduces one of M4's committed logs byte for byte and reads the output with the run
 * check's V7.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync, appendFileSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "2026-11-11-243-link-monitor.mjs";
/** The tablet the runbook names. */
export const DEVICE = "Tab9WEEA0001504";
/** The mapping the runbook's tunnel makes. */
export const MAPPING = "tcp:8093 tcp:8093";

/** adb's output as lines: CRLF read as LF, trailing blank lines dropped. */
export const lines = (text) => text.replace(/\r\n/g, "\n").replace(/\s+$/, "").split("\n");

/** The device's state and `transport_id` in `devices -l`, or null when its line is not there once. */
export function transportOf(devicesLines) {
    const found = devicesLines
        .map((l) => new RegExp(`^${DEVICE}\\s+(\\S+)\\b.*\\btransport_id:(\\d+)`).exec(l))
        .filter(Boolean);
    return found.length === 1 ? { state: found[0][1], id: found[0][2] } : null;
}

/** The mapping in `reverse --list`'s output. */
export const hasMapping = (reverseLines) => reverseLines.some((l) => l.includes(MAPPING));

/** The `## begin` file: the header and the start's readings. */
export function beginText({ now, adbLog, version, devices, reverse, logLength }) {
    return [
        `# link monitor, M4 setup item 4 — device ${DEVICE}, adb.log ${adbLog}`,
        "",
        `## begin ${now}`,
        "$ adb --version",
        ...lines(version),
        `$ adb -s ${DEVICE} devices -l`,
        ...lines(devices),
        `$ adb -s ${DEVICE} reverse --list`,
        ...lines(reverse),
        `adb.log length: ${logLength} bytes`,
        "",
        "",
    ].join("\n");
}

/** What `begin` recorded, read back from the file: the log's length, the device line and the mapping. */
export function readBegin(text) {
    if (!text.startsWith("# link monitor, M4 setup item 4")) throw new Error("not a link monitor's log");
    const all = text.split("\n");
    if (all.some((l) => /^## end\b/.test(l))) throw new Error("the log already has an end");
    const at = all.findIndex((l) => /^## begin /.test(l));
    if (at < 0) throw new Error("the log has no begin");
    const section = all.slice(at + 1);
    const len = section.map((l) => /^adb\.log length: (\d+) bytes$/.exec(l)).find(Boolean);
    if (!len) throw new Error("the begin records no adb.log length");
    const devAt = section.indexOf(`$ adb -s ${DEVICE} devices -l`);
    const revAt = section.indexOf(`$ adb -s ${DEVICE} reverse --list`);
    const lenAt = section.findIndex((l) => /^adb\.log length: /.test(l));
    return {
        logLength: Number(len[1]),
        transport: transportOf(section.slice(devAt + 1, revAt)),
        mapping: hasMapping(section.slice(revAt + 1, lenAt)),
    };
}

const describe = (t) => (t === null ? "none" : `${t.id} (${t.state})`);

/**
 * The end's sections and the verdict. `gained` is the raw text the log gained since the begin
 * (null when the log shrank, with `shrunk` its whole new content), `gainedBytes` its raw length.
 */
export function endText({ begin, now, devices, reverse, logLength, gained, gainedBytes }) {
    const shrank = logLength < begin.logLength;
    const copied = (gained ?? "").replace(/\r\n/g, "\n");
    const endTransport = transportOf(lines(devices));
    const endMapping = hasMapping(lines(reverse));
    const terminated = copied.split("\n").filter((l) => /connection terminated/i.test(l) && l.includes(DEVICE));
    const bt = begin.transport;
    const sameTransport = bt !== null && endTransport !== null && bt.state === "device" && endTransport.state === "device" && bt.id === endTransport.id;
    const noDrop = terminated.length === 0 && sameTransport && begin.mapping && endMapping && !shrank;
    const heading = shrank
        ? `## adb.log lines written between begin and end (${gainedBytes} bytes; the log shrank from ${begin.logLength} to ${logLength} bytes, so the whole new log is copied)`
        : `## adb.log lines written between begin and end (${gainedBytes} bytes)`;
    const text = [
        `## end ${now}`,
        `$ adb -s ${DEVICE} devices -l`,
        ...lines(devices),
        `$ adb -s ${DEVICE} reverse --list`,
        ...lines(reverse),
        `adb.log length: ${logLength} bytes`,
        "",
        `${heading}\n${copied}`,
        "",
        "## verdict",
        `connection terminated lines naming ${DEVICE}: ${terminated.length}`,
        `transport_id: begin ${describe(bt)}, end ${describe(endTransport)} -> ${sameTransport ? "same" : "not the same device link"}`,
        `mapping ${MAPPING}: begin ${begin.mapping ? "present" : "absent"}, end ${endMapping ? "present" : "absent"}`,
        ...(shrank ? [`adb.log: shrank from ${begin.logLength} to ${logLength} bytes, the server restarted`] : []),
        `no drop: ${noDrop}`,
        "",
    ].join("\n");
    return { text, noDrop };
}

/** The adb client, run once: its stdout and stderr, as the shell would show them. */
export function runAdb(args) {
    const r = spawnSync("adb", args, { encoding: "utf8" });
    if (r.error) throw new Error(`adb ${args.join(" ")}: ${r.error.message}`);
    return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

const defaultLog = () => join(process.env.TEMP ?? process.env.TMP ?? ".", "adb.log");

/** The runbook's step 2: the header and the begin. */
export function monitorBegin(path, { adb = runAdb, adbLog = defaultLog(), now = () => new Date().toISOString() } = {}) {
    if (existsSync(path)) throw new Error(`${path} exists: a run's link log is begun once`);
    if (!existsSync(adbLog)) throw new Error(`the adb server's log ${adbLog} does not exist`);
    const t = now();
    const version = adb(["--version"]);
    const devices = adb(["-s", DEVICE, "devices", "-l"]);
    const reverse = adb(["-s", DEVICE, "reverse", "--list"]);
    const logLength = statSync(adbLog).size;
    writeFileSync(path, beginText({ now: t, adbLog, version, devices, reverse, logLength }), { flag: "wx" });
}

/** The runbook's step 5: the end, what the log gained, and the verdict. Returns `noDrop`. */
export function monitorEnd(path, { adb = runAdb, adbLog = defaultLog(), now = () => new Date().toISOString() } = {}) {
    const begin = readBegin(readFileSync(path, "utf8"));
    const t = now();
    const devices = adb(["-s", DEVICE, "devices", "-l"]);
    const reverse = adb(["-s", DEVICE, "reverse", "--list"]);
    if (!existsSync(adbLog)) throw new Error(`the adb server's log ${adbLog} does not exist`);
    const logLength = statSync(adbLog).size;
    const from = logLength < begin.logLength ? 0 : begin.logLength;
    const bytes = Buffer.alloc(logLength - from);
    const fd = openSync(adbLog, "r");
    try {
        readSync(fd, bytes, 0, bytes.length, from);
    } finally {
        closeSync(fd);
    }
    const { text, noDrop } = endText({ begin, now: t, devices, reverse, logLength, gained: bytes.toString("utf8"), gainedBytes: bytes.length });
    appendFileSync(path, text);
    return noDrop;
}

function main(argv) {
    const usage = (why) => {
        process.stderr.write(`${SCRIPT}: ${why}\nusage: node docs/benchmarks/${SCRIPT} begin|end [--adb-log <path>] <export stem>.link.txt\n`);
        process.exit(2);
    };
    const i = argv.indexOf("--adb-log");
    let adbLog = defaultLog();
    if (i >= 0) {
        if (argv[i + 1] === undefined) usage("--adb-log needs a value");
        adbLog = argv[i + 1];
        argv = argv.filter((_, k) => k !== i && k !== i + 1);
    }
    const [what, path, ...rest] = argv;
    if (!["begin", "end"].includes(what) || path === undefined || rest.length) usage("one of begin or end, and one path");
    if (!path.endsWith(".link.txt")) usage(`${path}: the log is named <export stem>.link.txt`);
    try {
        if (what === "begin") {
            monitorBegin(resolve(path), { adbLog });
            process.stdout.write(`link monitor: begun, ${path}\n`);
            process.exit(0);
        }
        const noDrop = monitorEnd(resolve(path), { adbLog });
        process.stdout.write(`link monitor: ended, ${path}: no drop: ${noDrop}\n`);
        process.exit(noDrop ? 0 : 1);
    } catch (err) {
        usage(err.message);
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
