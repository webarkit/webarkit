/*
 *  2026-11-11-243-link-monitor.test.mjs
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
 * The link monitor's tests: `node --test docs/benchmarks/2026-11-11-243-link-monitor.test.mjs`,
 * after `npm run build` (the run check it reads with imports the packages' `dist`). Not run by
 * `npm test`, which covers the workspaces and `examples/test/`, and the pre-flight changes nothing
 * under `examples/`. Every case runs the monitor's `begin` and `end` on a constructed adb client and
 * a constructed adb.log, then reads the log with the run check's V7.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEVICE, monitorBegin, monitorEnd } from "./2026-11-11-243-link-monitor.mjs";
import { v7 } from "./2026-11-11-243-run-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const M4_LOG = join(HERE, "2026-10-14-tab9-m4-calibration-sync-static-1.link.txt");
const dir = mkdtempSync(join(tmpdir(), "m9-link-monitor-"));
let serial = 0;

const VERSION =
    "Android Debug Bridge version 1.0.41\r\nVersion 37.0.0-14910828\r\nInstalled as C:\\Users\\x\\platform-tools\\adb.exe\r\nRunning on Windows 10.0.26300\r\n";
const devicesOut = (id, state = "device") =>
    `List of devices attached\r\n${DEVICE}        ${state} product:Tab_9_WiFi_EEA model:Tab_9_WiFi device:Tab_9_WiFi transport_id:${id}\r\n\r\n`;
const REVERSE = "UsbFfs tcp:8093 tcp:8093\r\n";

/** A constructed adb client: `--version`, then `devices -l` and `reverse --list` per end. */
function fakeAdb({ begin = { id: 3 }, end = { id: 3 }, reverseEnd = REVERSE } = {}) {
    let ended = false;
    const adb = (args) => {
        if (args[0] === "--version") return VERSION;
        if (args.includes("devices")) {
            const at = ended ? end : begin;
            return devicesOut(at.id, at.state);
        }
        if (args.includes("reverse")) return ended ? reverseEnd : REVERSE;
        throw new Error(`unexpected adb ${args.join(" ")}`);
    };
    return { adb, end: () => (ended = true) };
}

/**
 * Runs begin, lets `between` write to the adb.log, runs end. Returns the log's text and the
 * verdict, and V7's reasons on it.
 */
function session({ before = "--- adb starting ---\r\nline\r\n", between = () => {}, ...adbOpts } = {}) {
    const n = ++serial;
    const adbLog = join(dir, `adb-${n}.log`);
    const path = join(dir, `run-${n}.link.txt`);
    writeFileSync(adbLog, before);
    const fake = fakeAdb(adbOpts);
    monitorBegin(path, { adb: fake.adb, adbLog, now: () => "2026-11-11T17:00:00.000Z" });
    between(adbLog);
    fake.end();
    const noDrop = monitorEnd(path, { adb: fake.adb, adbLog, now: () => "2026-11-11T17:04:00.000Z" });
    const text = readFileSync(path, "utf8");
    return { text, noDrop, why: v7(text) };
}

const TERMINATED = `11-11 18:02:00.000 1 2 I adb     : transport.cpp:1170 ${DEVICE}: connection terminated: read failed\r\n`;

test("the run check's V7 passes one of M4's committed logs unchanged", () => {
    assert.deepEqual(v7(readFileSync(M4_LOG, "utf8")), []);
});

test("the monitor reproduces M4's committed log byte for byte, from the same readings", () => {
    const m4 = readFileSync(M4_LOG, "utf8");
    const adbLog = join(dir, "adb-m4.log");
    writeFileSync(adbLog, Buffer.alloc(166008, 0x20));
    const path = join(dir, "m4.link.txt");
    const section = (name) => m4.split(`## ${name} `)[1];
    const out = (text, cmd) => {
        const after = text.split(`$ ${cmd}\n`)[1];
        return after.split(/\n(?=\$ |adb\.log length)/)[0] + "\n";
    };
    let ended = false;
    const adb = (args) => {
        const s = section(ended ? "end" : "begin");
        if (args[0] === "--version") return out(s, "adb --version");
        if (args.includes("devices")) return out(s, `adb -s ${DEVICE} devices -l`);
        return out(s, `adb -s ${DEVICE} reverse --list`);
    };
    const adbLogName = "C:\\Users\\perda\\AppData\\Local\\Temp\\adb.log";
    // The header names the log by path; the readings come from a copy of the right length.
    monitorBegin(path, { adb, adbLog, now: () => "2026-10-14T11:54:43.370Z" });
    ended = true;
    assert.equal(monitorEnd(path, { adb, adbLog, now: () => "2026-10-14T11:56:54.207Z" }), true);
    const ours = readFileSync(path, "utf8").replace(adbLog, adbLogName);
    assert.equal(ours, m4);
});

test("a clean adb.log between begin and end: no drop, and V7 passes", () => {
    const r = session({ between: (log) => appendFileSync(log, "11-11 18:01:00.000 1 2 I adb     : something else\r\n") });
    assert.equal(r.noDrop, true);
    assert.match(r.text, /^no drop: true$/m);
    assert.match(r.text, /between begin and end \(\d+ bytes\)\nsomething|between begin and end \(\d+ bytes\)\n11-11 18:01:00\.000/);
    assert.deepEqual(r.why, []);
});

test("a termination naming the device between begin and end: a drop, and V7 fails", () => {
    const r = session({ between: (log) => appendFileSync(log, TERMINATED) });
    assert.equal(r.noDrop, false);
    assert.match(r.text, new RegExp(`^connection terminated lines naming ${DEVICE}: 1$`, "m"));
    assert.match(r.text, /^no drop: false$/m);
    assert.ok(r.why.some((w) => /connection terminated/.test(w)));
    assert.ok(r.why.some((w) => /no drop: true/.test(w)));
});

test("a termination written before the begin is not the run's", () => {
    const r = session({ before: TERMINATED });
    assert.equal(r.noDrop, true);
    assert.deepEqual(r.why, []);
});

test("a termination naming another device is not a drop of this one", () => {
    const r = session({ between: (log) => appendFileSync(log, TERMINATED.replace(DEVICE, "OTHER0001")) });
    assert.equal(r.noDrop, true);
    assert.deepEqual(r.why, []);
});

test("a transport_id that changes: a drop, and V7 fails", () => {
    const r = session({ end: { id: 4 } });
    assert.equal(r.noDrop, false);
    assert.ok(r.why.some((w) => /transport_id changed/.test(w)));
});

test("the device unauthorized at the end: a drop", () => {
    const r = session({ end: { id: 3, state: "unauthorized" } });
    assert.equal(r.noDrop, false);
    assert.ok(r.why.length > 0);
});

test("the mapping gone at the end: a drop, and V7 fails", () => {
    const r = session({ reverseEnd: "" });
    assert.equal(r.noDrop, false);
    assert.ok(r.why.some((w) => /mapping .* at the end/.test(w)));
});

test("a log shorter at the end than at the begin: a drop, the new log copied", () => {
    const r = session({ between: (log) => writeFileSync(log, "--- adb starting ---\r\n") });
    assert.equal(r.noDrop, false);
    assert.match(r.text, /the log shrank from/);
    assert.match(r.text, /^--- adb starting ---$/m);
    assert.ok(r.why.length > 0);
});

test("begin refuses a log that exists, and end one that has no begin or already ended", () => {
    const r = session();
    assert.equal(r.noDrop, true);
    const path = join(dir, `run-${serial}.link.txt`);
    const adbLog = join(dir, `adb-${serial}.log`);
    const { adb } = fakeAdb();
    assert.throws(() => monitorBegin(path, { adb, adbLog }), /exists/);
    assert.throws(() => monitorEnd(path, { adb, adbLog }), /already has an end/);
    const empty = join(dir, "empty.link.txt");
    writeFileSync(empty, "");
    assert.throws(() => monitorEnd(empty, { adb, adbLog }), /not a link monitor/);
});
