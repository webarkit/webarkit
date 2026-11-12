/*
 *  2026-11-12-243-session-table.test.mjs
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
 * The session table's test (#252, #243): `npm run test:benchmarks`, after `npm run build` (the run
 * check it reads imports the packages' `dist`). The table,
 * `2026-11-12-243-session-table.json`, is what the session driver reads each run's URL, clip, export
 * name and run-check form from, so nothing is typed per run. Its rows must be the registration's,
 * character for character: the route and "The pinned strings" of "The runbook" in
 * `2026-11-10-243-registration.md`, read from that file's text here, not from a copy; the run
 * check's own pinned string (`FORMS.counted`, V3), which judges each run's `.url.txt`; and the
 * freeze of `2026-11-11-243-preflight.md`. `checkTable` is exercised both ways: it passes the
 * committed table, and fails on a one-character change to any URL, and on each other field.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FORMS, PAGE_URL, DEVICE, BLOCKS } from "./2026-11-11-243-run-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE = JSON.parse(readFileSync(join(HERE, "2026-11-12-243-session-table.json"), "utf8"));
const REGISTRATION = readFileSync(join(HERE, "2026-11-10-243-registration.md"), "utf8").replace(/\r\n/g, "\n");
const PREFLIGHT = readFileSync(join(HERE, "2026-11-11-243-preflight.md"), "utf8").replace(/\r\n/g, "\n");

/** What the registration's runbook says, read from its text. */
function fromRegistration(text) {
    const runbook = text.split("\n## The runbook\n")[1].split("\n## ")[0];
    const pinned = /\*\*The pinned strings\.\*\*[\s\S]*?```\n([^\n]+)\n```/.exec(runbook);
    const page = /the page: `([^`?]+)\?…`/.exec(runbook);
    const tunnel = /the tunnel: `adb -s (\S+) reverse tcp:(\d+) tcp:(\d+)`/.exec(runbook);
    const rows = [...runbook.matchAll(/^\| (\d+)–(\d+) \| `([^`]+)` \| (\d+)–(\d+) \| `([^`]+)\.json` \|$/gm)].map((m) => ({
        from: Number(m[1]),
        to: Number(m[2]),
        clip: m[3],
        nFrom: Number(m[4]),
        nTo: Number(m[5]),
        exportName: m[6],
    }));
    const idle = /then (\d+) s idle before the next run/.exec(runbook);
    const quiet = /in adb's log for (\w+) minutes/.exec(runbook);
    const label = /At the tablet: the device label `([^`]+)`/.exec(runbook);
    return {
        pinned: pinned?.[1],
        page: page?.[1],
        serial: tunnel?.[1],
        port: tunnel ? Number(tunnel[2]) : undefined,
        rows,
        idle: idle ? Number(idle[1]) : undefined,
        quiet: quiet?.[1],
        label: label?.[1],
    };
}

/** The freeze's head and bundle, read from the pre-flight record's table. */
function fromPreflight(text) {
    const head = /^\| Head \| `([0-9a-f]{40})`/m.exec(text);
    const bundle = /^\| Bundle \| `examples\/dist\/webarkit-packages\.mjs`, SHA-256 `([0-9a-f]{64})`/m.exec(text);
    return { head: head?.[1], bundle: bundle?.[1] };
}

const WORDS = { five: 5 };

/** Every reason the table is not the registration's; `[]` when it is. */
export function checkTable(t, reg = fromRegistration(REGISTRATION), pre = fromPreflight(PREFLIGHT)) {
    const why = [];
    const expect = (ok, what) => ok || why.push(what);
    if (!(reg.pinned && reg.page && reg.rows.length === 4)) return ["the registration's runbook could not be read"];
    expect(t.pinnedString === reg.pinned, `pinnedString ${JSON.stringify(t.pinnedString)} is not the registration's`);
    expect(t.page === reg.page, `page ${JSON.stringify(t.page)} is not the registration's route`);
    expect(t.page === PAGE_URL, `page is not the run check's PAGE_URL`);
    expect(t.port === reg.port && t.page === `http://localhost:${t.port}/examples/bench-nft.html`, `port ${t.port} is not the route's`);
    expect(t.device?.serial === reg.serial && t.device?.serial === DEVICE, `device serial ${t.device?.serial} is not the runbook's`);
    expect(t.device?.model === reg.label, `device model ${t.device?.model} is not the runbook's device label`);
    expect(t.freeze?.head === pre.head, `freeze head ${t.freeze?.head} is not the pre-flight record's`);
    expect(t.freeze?.bundleSha256 === pre.bundle, `freeze bundle ${t.freeze?.bundleSha256} is not the pre-flight record's`);
    expect(t.idleSeconds === reg.idle, `idleSeconds ${t.idleSeconds} is not the runbook's step 7`);
    expect(t.quietMinutes === WORDS[reg.quiet], `quietMinutes ${t.quietMinutes} is not the runbook's item 5`);
    expect(Number.isInteger(t.devtoolsPort) && t.devtoolsPort > 1024 && t.devtoolsPort !== t.port, `devtoolsPort ${t.devtoolsPort} is not a free local port of its own`);
    const s = t.sessions ?? [];
    expect(s.length === 2 && s[0].name === "A" && s[0].from === 1 && s[0].to === 16 && s[1].name === "B" && s[1].from === 17 && s[1].to === 32, "sessions are not the registration's A (1–16) and B (17–32)");
    const runs = t.runs ?? [];
    expect(runs.length === 32, `${runs.length} runs, not 32`);
    runs.forEach((r, i) => {
        const n = i + 1;
        const row = reg.rows.find((x) => n >= x.from && n <= x.to);
        const block = BLOCKS.find((b) => n >= b.from && n <= b.to);
        if (!row) return why.push(`run ${n}: no row of the registration's table`);
        const at = `run ${n}`;
        expect(r.run === n && row.nFrom === row.from && row.nTo === row.to, `${at}: run is ${r.run}, or the table's <n> is not its run`);
        expect(r.clip === row.clip && r.clip === block?.clip, `${at}: clip ${r.clip} is not ${row.clip}`);
        const name = row.exportName.replace("<n>", String(n));
        expect(r.exportName === name, `${at}: exportName ${r.exportName} is not ${name}`);
        expect(r.clipLabel === /^<date>-tab9-m9-([a-z]+)-<n>$/.exec(row.exportName)?.[1], `${at}: clipLabel ${r.clipLabel} is not the export name's`);
        expect(r.runCheckForm === "counted", `${at}: runCheckForm ${r.runCheckForm} is not counted`);
        expect(r.exportKind === "tracking", `${at}: exportKind ${r.exportKind} is not tracking`);
        const url = reg.page + reg.pinned.replace("<clip>", row.clip).replace("<n>", String(n));
        expect(r.url === url, `${at}: url ${r.url} is not the pinned string's ${url}`);
        expect(r.url === PAGE_URL + FORMS.counted.string(r.clip, n), `${at}: url is not the run check's pinned string`);
        expect(!/['"\s\\$`]/.test(r.url ?? ""), `${at}: url holds a character the shell would read`);
    });
    return why;
}

test("the registration's runbook is read: its pinned string, route, table, idle time and quiet minutes", () => {
    const reg = fromRegistration(REGISTRATION);
    assert.equal(reg.pinned, "?mode=tracking&target=wnft&detection=sync&clip=<clip>&loops=4&window=2000&seed=1&run=<n>");
    assert.equal(reg.page, "http://localhost:8093/examples/bench-nft.html");
    assert.equal(reg.rows.length, 4);
    assert.deepEqual(
        reg.rows.map((r) => r.exportName),
        ["<date>-tab9-m9-static-<n>", "<date>-tab9-m9-cross-<n>", "<date>-tab9-m9-table-<n>", "<date>-tab9-m9-wall-<n>"],
    );
    assert.equal(reg.idle, 120);
    assert.equal(reg.quiet, "five");
    assert.deepEqual(fromPreflight(PREFLIGHT), {
        head: "8192265bd462f0667e275ec9297fe2890a907935",
        bundle: "6d07b0c25475830458b68c6ef53c221fd4a3848c00bad1a62adbafcc95b074f2",
    });
});

test("the committed session table is the registration's, character for character", () => {
    assert.deepEqual(checkTable(TABLE), []);
});

/** Every one-character change at every position of every URL: each is refused. */
test("a one-character change anywhere in any URL is refused", () => {
    let tried = 0;
    for (let i = 0; i < TABLE.runs.length; i++) {
        const url = TABLE.runs[i].url;
        for (let k = 0; k < url.length; k++) {
            const c = url[k] === "x" ? "y" : "x";
            const t = structuredClone(TABLE);
            t.runs[i].url = url.slice(0, k) + c + url.slice(k + 1);
            assert.ok(checkTable(t).some((w) => w.startsWith(`run ${i + 1}: url`)), `run ${i + 1}, char ${k}`);
            tried++;
        }
        const t = structuredClone(TABLE);
        t.runs[i].url = url + "&";
        assert.ok(checkTable(t).length > 0);
    }
    assert.ok(tried > 32 * 100);
});

test("each other field, changed, is refused", () => {
    const mutations = [
        (t) => (t.pinnedString = t.pinnedString.replace("seed=1", "seed=2")),
        (t) => (t.page = t.page.replace("8093", "8094")),
        (t) => (t.port = 8094),
        (t) => (t.device.serial = "Tab9WEEA0001505"),
        (t) => (t.device.model = "Tab_9"),
        (t) => (t.freeze.head = t.freeze.head.replace(/.$/, "0")),
        (t) => (t.freeze.bundleSha256 = t.freeze.bundleSha256.replace(/^./, "7")),
        (t) => (t.idleSeconds = 60),
        (t) => (t.quietMinutes = 4),
        (t) => (t.devtoolsPort = t.port),
        (t) => (t.sessions[1].from = 16),
        (t) => t.runs.pop(),
        (t) => ([t.runs[3], t.runs[4]] = [t.runs[4], t.runs[3]]),
        (t) => (t.runs[4].run = 4),
        (t) => (t.runs[8].clip = "pinball-static.mp4"),
        (t) => (t.runs[16].exportName = "<date>-tab9-m9-table-16"),
        (t) => (t.runs[24].clipLabel = "bench"),
        (t) => (t.runs[0].runCheckForm = "preflight-static"),
        (t) => (t.runs[0].exportKind = "detection-only"),
    ];
    for (const [i, m] of mutations.entries()) {
        const t = structuredClone(TABLE);
        m(t);
        assert.ok(checkTable(t).length > 0, `mutation ${i} passed`);
    }
});

test("a registration whose pinned string changed by one character no longer matches the table", () => {
    const changed = REGISTRATION.replace("&loops=4&window=2000&seed=1&run=<n>", "&loops=4&window=2000&seed=1&run=<n>&");
    assert.notEqual(changed, REGISTRATION);
    assert.ok(checkTable(TABLE, fromRegistration(changed)).length > 0);
});
