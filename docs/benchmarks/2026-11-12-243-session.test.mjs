/*
 *  2026-11-12-243-session.test.mjs
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
 * The session driver's tests (#252, #243): `npm run test:benchmarks`. Each case sources
 * `2026-11-12-243-session.sh` in bash, with `M9_TEST_SEAMS=1`, against:
 *
 * - a fake `adb`, a bash script whose device, tunnel, forwards, download folder and adb.log are
 *   files of the case;
 * - a fake DevTools endpoint and a fake page server, HTTP servers in this process. The DevTools one
 *   answers only while the fake adb's forward is on, as a real forward would;
 * - the real link monitor (`2026-11-11-243-link-monitor.mjs`), its `adb` calls sent to the fake;
 * - a stub run check, and a fake serving checkout: a git repository with a stub
 *   `scripts/provenance-preflight.mjs`;
 * - stubs for `mv`, `rm`, `cp` and every other command that moves, renames or deletes a file,
 *   first on the PATH, each recording any call. No case may call one.
 *
 * Every refusal is exercised both ways: the case that must refuse, and a case that must pass
 * (step-protocol.md, "Every check is exercised both ways"). The pre-flight's three incidents
 * (2026-11-11-243-preflight.md, "Incidents") are replayed. bash is `M9_TEST_BASH`, or Git for
 * Windows' on Windows (where `bash` may be WSL's), or `bash`.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fwd = (p) => p.replace(/\\/g, "/");
const HERE = fwd(dirname(fileURLToPath(import.meta.url)));
const DRIVER = `${HERE}/2026-11-12-243-session.sh`;
const MONITOR = `${HERE}/2026-11-11-243-link-monitor.mjs`;
const REAL_TABLE = JSON.parse(readFileSync(`${HERE}/2026-11-12-243-session-table.json`, "utf8"));
const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";
const BASH = process.env.M9_TEST_BASH ?? (process.platform === "win32" && existsSync(GIT_BASH) ? GIT_BASH : "bash");
const SERIAL = REAL_TABLE.device.serial;
const MODEL = REAL_TABLE.device.model;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const ROOT = fwd(mkdtempSync(join(tmpdir(), "m9-session-")));
const CLIPS = ["pinball-static.mp4", "pinball-tilt-cross.mp4", "pinball-bench-table.mp4", "pinball-bench.mp4"];
const FORBIDDEN = ["mv", "rm", "cp", "ln", "rmdir", "unlink", "truncate", "shred", "rename", "install"];

// ------------------------------------------------------------------------------------------------
// The fakes.
// ------------------------------------------------------------------------------------------------

const FAKE_ADB = `#!/usr/bin/env bash
F="$M9_FAKE"
printf '%s\\n' "$*" >> "$F/adb.calls"
serial=""
[ "$1" = "-s" ] && { serial="$2"; shift 2; }
case "$1" in
  --version) printf 'Android Debug Bridge version 1.0.41\\r\\nVersion 37.0.0-fake\\r\\n' ;;
  devices) printf 'List of devices attached\\r\\n'; cat "$F/devices"; printf '\\r\\n' ;;
  reverse) cat "$F/reverse" ;;
  forward)
    case "$2" in
      --list) cat "$F/forwards" ;;
      --remove) printf off > "$F/dt.forward"; grep -v " $3 " "$F/forwards" > "$F/forwards.next"; cat "$F/forwards.next" > "$F/forwards" ;;
      *) printf on > "$F/dt.forward"; printf '%s %s %s\\n' "$serial" "$2" "$3" >> "$F/forwards" ;;
    esac ;;
  shell)
    c="$2"
    case "$c" in
      "ls /sdcard/Download/") [ -e "$F/ls.fail" ] && { echo "ls: /sdcard/Download/: I/O error"; exit 1; }; ls "$F/downloads" ;;
      "sha256sum /sdcard/Download/"*) [ -e "$F/sha.wrong" ] && { echo "0000 x"; exit 0; }; (cd "$F/downloads" && sha256sum "\${c#sha256sum /sdcard/Download/}") ;;
      "am start "*) printf '%s\\n' "$c" >> "$F/am.log"; echo "Starting: Intent { act=android.intent.action.VIEW }" ;;
      "cat /proc/net/unix") if [ -e "$F/unix" ]; then cat "$F/unix"; else echo "cat: /proc/net/unix: Permission denied"; exit 1; fi ;;
      "dumpsys package com.android.chrome") cat "$F/dumpsys" 2>/dev/null ;;
      *) echo "fake adb: unknown shell command: $c"; exit 1 ;;
    esac ;;
  pull) cat "$F/downloads/\${2#/sdcard/Download/}" > "$3" ;;
  *) echo "fake adb: unknown command: $*"; exit 1 ;;
esac
`;

/** The real link monitor, its adb calls sent to the fake adb through bash. */
const MONITOR_WRAPPER = `import { spawnSync } from "node:child_process";
import { monitorBegin, monitorEnd } from ${JSON.stringify(pathToFileURL(MONITOR).href)};
const argv = process.argv.slice(2);
const i = argv.indexOf("--adb-log");
const adbLog = argv[i + 1];
const [what, path] = argv.filter((_, k) => k !== i && k !== i + 1);
const adb = (args) => {
    const r = spawnSync(process.env.M9_TEST_BASH_PATH, [process.env.M9_ADB, ...args], { encoding: "utf8" });
    return (r.stdout ?? "") + (r.stderr ?? "");
};
try {
    if (what === "begin") { monitorBegin(path, { adb, adbLog }); process.exit(0); }
    process.exit(monitorEnd(path, { adb, adbLog }) ? 0 : 1);
} catch (err) { console.error(err.message); process.exit(2); }
`;

const RUNCHECK_STUB = `import { appendFileSync, existsSync, readFileSync } from "node:fs";
const F = process.env.M9_FAKE;
appendFileSync(F + "/runcheck.calls", JSON.stringify(process.argv.slice(2)) + "\\n");
const code = existsSync(F + "/runcheck.exit") ? Number(readFileSync(F + "/runcheck.exit", "utf8")) : 0;
for (let v = 1; v <= 8; v++) console.log("V" + v + " " + (code === 0 || v !== 7 ? "PASS" : "FAIL"));
process.exit(code);
`;

const PROVENANCE_STUB = `import { existsSync, readFileSync } from "node:fs";
const f = process.env.M9_FAKE + "/provenance.exit";
const code = existsSync(f) ? Number(readFileSync(f, "utf8")) : 0;
console.log(code === 0 ? "provenance preflight: describes this tree" : "provenance preflight: HEAD differs");
process.exit(code);
`;

const GUARD = (name) => `#!/usr/bin/env bash
printf '%s %s\\n' ${JSON.stringify(name)} "$*" >> "$M9_FAKE/forbidden.calls"
exit 1
`;

const BIN = `${ROOT}/bin`;
const GUARD_BIN = `${ROOT}/guard`;
const MONITOR_JS = `${ROOT}/monitor.mjs`;
const RUNCHECK_JS = `${ROOT}/runcheck.mjs`;

function git(cwd, ...args) {
    const r = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
}

/** A fake serving checkout: a git repository with the clips, a bundle and a stub preflight. */
function makeServe(name) {
    const d = `${ROOT}/${name}`;
    for (const sub of ["examples/dist", "examples/videos", "examples/js", "scripts", "docs/benchmarks"]) mkdirSync(`${d}/${sub}`, { recursive: true });
    for (const c of CLIPS) writeFileSync(`${d}/examples/videos/${c}`, `clip ${c}\n`);
    writeFileSync(`${d}/examples/js/bench-metrics.mjs`, "export {};\n");
    writeFileSync(`${d}/scripts/provenance-preflight.mjs`, PROVENANCE_STUB);
    writeFileSync(`${d}/.gitignore`, "examples/dist/\n");
    git(d, "init", "-q");
    git(d, "add", "-A");
    git(d, "commit", "-q", "-m", "serve");
    writeFileSync(`${d}/examples/dist/webarkit-packages.mjs`, "bundle\n");
    writeFileSync(`${d}/examples/dist/provenance.json`, "{}\n");
    return { dir: d, head: git(d, "rev-parse", "HEAD"), bundle: sha("bundle\n") };
}

// ------------------------------------------------------------------------------------------------
// The HTTP fakes: the page server (no-store) and the DevTools endpoint.
// ------------------------------------------------------------------------------------------------

let current = null; // the running case
const page = http.createServer((req, res) => {
    const headers = { "Content-Type": "text/javascript" };
    if (current.cacheControl) headers["Cache-Control"] = current.cacheControl;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : "export {};\n");
});
const devtools = http.createServer((req, res) => {
    const state = existsSync(`${current.fake}/dt.forward`) ? readFileSync(`${current.fake}/dt.forward`, "utf8") : "off";
    if (state !== "on" && state !== "held") return req.socket.destroy();
    const json = (v) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(v));
    };
    if (req.url === "/json/version") {
        if (current.noVersion) return req.socket.destroy();
        return json({ Browser: "Chrome/156.0.8078.81", "Protocol-Version": "1.3" });
    }
    if (req.url === "/json/list" || req.url === "/json") return json(current.tabs);
    const close = /^\/json\/close\/(.+)$/.exec(req.url);
    if (close) {
        const before = current.tabs.length;
        current.tabs = current.tabs.filter((t) => t.id !== close[1]);
        current.closed.push(close[1]);
        res.writeHead(current.tabs.length < before ? 200 : 404);
        return res.end(current.tabs.length < before ? "Target is closing" : "No such target id");
    }
    res.writeHead(404);
    res.end();
});

const listen = (srv) => new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv.address().port)));
let PAGE_PORT = 0;
let DT_PORT = 0;

before(async () => {
    mkdirSync(BIN, { recursive: true });
    mkdirSync(GUARD_BIN, { recursive: true });
    writeFileSync(`${BIN}/adb`, FAKE_ADB);
    chmodSync(`${BIN}/adb`, 0o755);
    for (const name of FORBIDDEN) {
        writeFileSync(`${GUARD_BIN}/${name}`, GUARD(name));
        chmodSync(`${GUARD_BIN}/${name}`, 0o755);
    }
    writeFileSync(MONITOR_JS, MONITOR_WRAPPER);
    writeFileSync(RUNCHECK_JS, RUNCHECK_STUB);
    PAGE_PORT = await listen(page);
    DT_PORT = await listen(devtools);
});
after(() => {
    page.close();
    devtools.close();
});

let SERVE = null;
let serial = 0;
const pad = (n, w = 2) => String(n).padStart(w, "0");
/** A line of the adb server's log, in its local-time format, `secondsAgo` before now. */
const adbLine = (secondsAgo, text) => {
    const d = new Date(Date.now() - secondsAgo * 1000);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}  4242  4243 I adb     : ${text}\n`;
};
const TERMINATED = `transport.cpp:1170 ${SERIAL}: connection terminated: read failed`;
/**
 * The tunnel as `adb reverse --list` shows it: the case's page port, which the driver reads from its
 * table, and the runbook's tcp:8093, which the link monitor (held by the freeze) has fixed.
 */
const TUNNEL_FOR = (port) => `UsbFfs tcp:8093 tcp:8093\r\nUsbFfs tcp:${port} tcp:${port}\r\n`;
const BENCH_TAB = (id = "AAA1", n = 1) => ({
    id,
    type: "page",
    title: "bench-nft",
    url: `http://localhost:8093/examples/bench-nft.html?mode=tracking&target=wnft&detection=sync&clip=pinball-static.mp4&loops=4&window=2000&seed=1&run=${n}`,
});
const OTHER_TAB = { id: "OTH1", type: "page", title: "Example", url: "https://example.com/" };

/** A test table: the committed one, its ports, freeze and idle time the case's. */
function makeTable(path, serve, { idleSeconds = 0 } = {}) {
    const t = structuredClone(REAL_TABLE);
    t.port = PAGE_PORT;
    t.devtoolsPort = DT_PORT;
    t.page = t.page.replace(":8093/", `:${PAGE_PORT}/`);
    for (const r of t.runs) r.url = r.url.replace(":8093/", `:${PAGE_PORT}/`);
    t.freeze = { head: serve.head, bundleSha256: serve.bundle };
    t.idleSeconds = idleSeconds;
    writeFileSync(path, JSON.stringify(t, null, 2));
    return t;
}

/** A new case: its output folder, fake device state and table. */
function mk({ serve = SERVE, idleSeconds = 0, terminatedAgo = null, logAge = 3600 } = {}) {
    const k = ++serial;
    const c = { k, out: `${ROOT}/out-${k}`, fake: `${ROOT}/fake-${k}`, serve: serve.dir, tabs: [], closed: [], cacheControl: "no-cache, no-store, must-revalidate" };
    mkdirSync(`${c.fake}/downloads`, { recursive: true });
    const f = (name, text) => writeFileSync(`${c.fake}/${name}`, text);
    f("devices", `${SERIAL}        device product:Tab_9_WiFi_EEA model:${MODEL} device:Tab_9_WiFi transport_id:3\r\n`);
    f("reverse", TUNNEL_FOR(PAGE_PORT));
    f("forwards", "");
    f("dt.forward", "off");
    f("dumpsys", "    versionName=156.0.8078.81\n    versionName=131.0.6778.260\n");
    c.adbLog = `${c.fake}/adb.log`;
    let log = "--- adb starting (pid 4242) ---\n" + adbLine(logAge, "main.cpp:66 Android Debug Bridge version 1.0.41");
    if (terminatedAgo !== null) log += adbLine(terminatedAgo, TERMINATED);
    f("adb.log", log);
    c.table = `${c.fake}/table.json`;
    c.t = makeTable(c.table, serve, { idleSeconds });
    c.set = f;
    c.download = (name, text = `{"export":"${name}"}\n`) => writeFileSync(`${c.fake}/downloads/${name}`, text);
    c.read = (name) => readFileSync(`${c.out}/${name}`, "utf8");
    c.files = () => (existsSync(c.out) ? readdirSync(c.out).filter((x) => !x.startsWith(".")).sort() : []);
    c.today = new Date().toISOString().slice(0, 10);
    c.stem = (label, n) => `${c.today}-tab9-m9-${label}-${n}`;
    return c;
}

/**
 * Sources the driver and runs each command in one bash, in order. Returns, per command, its output
 * and exit status, and the whole output.
 */
async function drive(c, cmds, { stdin = "", seams = true, args } = {}) {
    current = c;
    const src = args ?? `'${c.out}' '${c.serve}'`;
    // Git for Windows' bash puts /usr/bin first on its PATH: the guards go first again here.
    const guardPath = `$(cygpath -u '${GUARD_BIN}' 2>/dev/null || echo '${GUARD_BIN}')`;
    const script = [
        `export PATH="${guardPath}:$PATH"`,
        `source '${DRIVER}' ${src}; echo "@@source $?"`,
        ...expand(c, cmds).map((cmd, i) => `echo "@@${i}"\n${cmd}\necho "@@rc $?"`),
    ].join("\n");
    const env = {
        ...process.env,
        M9_TABLE: c.table,
        M9_ADB: `${BIN}/adb`,
        M9_ADB_LOG: c.adbLog,
        M9_MONITOR: MONITOR_JS,
        M9_RUNCHECK: RUNCHECK_JS,
        M9_FAKE: c.fake,
        M9_TEST_BASH_PATH: BASH,
        PATH: `${GUARD_BIN}${delimiter}${process.env.PATH}`,
    };
    if (seams) env.M9_TEST_SEAMS = "1";
    else delete env.M9_TEST_SEAMS;
    const all = await new Promise((resolve) => {
        const p = spawn(BASH, ["-c", script], { env });
        let out = "";
        p.stdout.on("data", (d) => (out += d));
        p.stderr.on("data", (d) => (out += d));
        p.on("close", () => resolve(out.replace(/\r\n/g, "\n")));
        p.stdin.end(stdin);
    });
    const source = /@@source (\d+)/.exec(all);
    const steps = cmds.map((_, i) => {
        const from = all.indexOf(`@@${i}\n`);
        const body = from < 0 ? "" : all.slice(from + `@@${i}\n`.length);
        const rc = /@@rc (\d+)/.exec(body);
        return { out: rc ? body.slice(0, rc.index) : body, rc: rc ? Number(rc[1]) : null };
    });
    assert.ok(!existsSync(`${c.fake}/forbidden.calls`), `a forbidden command ran: ${existsSync(`${c.fake}/forbidden.calls`) ? readFileSync(`${c.fake}/forbidden.calls`, "utf8") : ""}`);
    return { all, source: source ? Number(source[1]) : null, steps };
}

const refused = (s, re) => {
    assert.equal(s.rc, 1, `expected a refusal, got rc ${s.rc}:\n${s.out}`);
    assert.match(s.out, /STOP: /);
    assert.match(s.out, /Di' all'agente/);
    assert.doesNotMatch(s.out, /\b(sposta|rinomina|cancella) (il|i|questo) file\b/);
    if (re) assert.match(s.out, re);
};
const passed = (s, re) => {
    assert.equal(s.rc, 0, `expected a pass, got rc ${s.rc}:\n${s.out}`);
    assert.doesNotMatch(s.out, /STOP: /);
    if (re) assert.match(s.out, re);
};
const amCount = (c) => (existsSync(`${c.fake}/am.log`) ? readFileSync(`${c.fake}/am.log`, "utf8").trim().split("\n").length : 0);

/** inizia n, the export downloaded on the tablet, finisci n: one complete run. */
const RUN = (n) => [`inizia ${n}`, `__dl ${n}`, `finisci ${n}`];
/**
 * The pseudo-commands: `__dl <n>`, the tablet's Download JSON for run n; `__ready`, a passed ready
 * check as pronto logs it, for the cases that do not test pronto itself (pronto is slow on Windows).
 */
function expand(c, cmds) {
    return cmds.map((cmd) => {
        const m = /^__dl (\d+)$/.exec(cmd);
        if (m) return `printf '{"run":${m[1]}}\\n' > '${c.fake}/downloads/bench-nft-tracking-Tab-9-WiFi-${1794424000000 + Number(m[1])}.json'`;
        if (cmd === "__ready") return `printf '%s PRONTO OK\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> '${c.out}/m9-session.log'`;
        return cmd;
    });
}

before(() => {
    SERVE = makeServe("serve");
});

// ------------------------------------------------------------------------------------------------
// Loading.
// ------------------------------------------------------------------------------------------------

test("source loads the committed table: 32 runs, the Tab 9, with no test seam", async () => {
    const c = mk();
    const r = await drive(c, ["echo ${#M9_RUNS[@]} $M9_SERIAL $M9_MODEL ${M9_URL[9]}"], { seams: false });
    assert.equal(r.source, 0, r.all);
    assert.match(r.all, /driver M9 caricato: Tab9WEEA0001504 \(Tab_9_WiFi\), 32 run/);
    assert.doesNotMatch(r.all, /\[prova\]/);
    assert.match(r.steps[0].out, new RegExp(`^32 ${SERIAL} ${MODEL} http://localhost:8093/examples/bench-nft\\.html\\?mode=tracking&target=wnft&detection=sync&clip=pinball-tilt-cross\\.mp4&loops=4&window=2000&seed=1&run=9$`, "m"));
});

test("source refuses without its two folders, and an output folder inside a checkout", async () => {
    const c = mk();
    const r1 = await drive(c, ["type inizia >/dev/null 2>&1 && echo defined || echo undefined"], { args: "" });
    assert.equal(r1.source, 1);
    assert.match(r1.all, /STOP: uso: source/);
    assert.match(r1.all, /→ Di' all'agente: "STOP source: uso: source/);
    assert.match(r1.steps[0].out, /undefined/);
    const r2 = await drive(c, ["type inizia >/dev/null 2>&1 && echo defined || echo undefined"], { args: `'${SERVE.dir}/inside' '${SERVE.dir}'` });
    assert.equal(r2.source, 1);
    assert.match(r2.all, /dentro un checkout git/);
    const r3 = await drive(c, ["type inizia >/dev/null 2>&1 && echo defined || echo undefined"]);
    assert.equal(r3.source, 0);
    assert.match(r3.steps[0].out, /^defined/m);
});

// ------------------------------------------------------------------------------------------------
// pronto: every item of "Before each session", both ways.
// ------------------------------------------------------------------------------------------------

test("pronto passes a ready session, writes only the session log, and removes its forward", async () => {
    const c = mk();
    const r = await drive(c, ["pronto"]);
    const s = r.steps[0];
    passed(s, /PRONTO OK/);
    for (const re of [
        /OK  HEAD del checkout di servizio/,
        /OK  bundle/,
        /OK  git status sul pathspec del runbook: vuoto/,
        /OK  check:provenance, exit 0/,
        /OK  Cache-Control: no-cache, no-store, must-revalidate/,
        /OK  dispositivo Tab9WEEA0001504 collegato, modello Tab_9_WiFi/,
        /OK  tunnel tcp:\d+ tcp:\d+/,
        /OK  nessun bench-nft-\*\.json/,
        /OK  collegamento quieto da almeno 5 minuti/,
        /OK  nessuna pagina del banco aperta/,
        /OK  Chrome sul tablet: Chrome\/156\.0\.8078\.81 \(fonte: DevTools \/json\/version, la build di chrome:\/\/version\)/,
        /A MANO  sul tablet: svuota i file in cache di Chrome/,
    ])
        assert.match(s.out, re);
    assert.deepEqual(c.files(), ["m9-session.log"]);
    assert.ok(!existsSync(`${c.out}/.state`));
    assert.equal(readFileSync(`${c.fake}/forwards`, "utf8"), "");
    assert.equal(readFileSync(`${c.fake}/dt.forward`, "utf8"), "off");
    assert.match(c.read("m9-session.log"), /Z PRONTO OK$/m);
});

const PRONTO_FAULTS = [
    ["the serving checkout's bundle", (c) => (c.t.freeze.bundleSha256 = sha("other\n")), /NO  bundle/],
    ["check:provenance", (c) => c.set("provenance.exit", "1"), /NO  check:provenance/],
    ["no-store", (c) => (c.cacheControl = "max-age=3600"), /NO  il server non manda no-store/],
    ["the device unauthorized", (c) => c.set("devices", `${SERIAL}        unauthorized transport_id:3\r\n`), /NO  dispositivo/],
    ["another device's model", (c) => c.set("devices", `${SERIAL}        device product:x model:A72 device:x transport_id:3\r\n`), /NO  dispositivo/],
    ["the tunnel", (c) => c.set("reverse", ""), /NO  tunnel/],
    ["an export already on the tablet", (c) => c.download("bench-nft-tracking-Tab-9-WiFi-1.json"), /NO  sul tablet ci sono già esportazioni: bench-nft-tracking/],
    ["a termination 60 s ago", (c) => c.set("adb.log", "--- adb starting (pid 1) ---\n" + adbLine(3600, "x") + adbLine(60, TERMINATED)), /NO  collegamento non quieto: attendi ancora 4 min/],
    ["an adb server started 2 min ago", (c) => c.set("adb.log", "--- adb starting (pid 1) ---\n" + adbLine(120, "main.cpp:66 Android Debug Bridge")), /NO  collegamento non quieto: attendi ancora 3 min/],
    ["another forward on the DevTools socket", (c) => c.set("forwards", `${SERIAL} tcp:9229 localabstract:chrome_devtools_remote\n`), /NO  DevTools: un altro inoltro tiene il socket DevTools del tablet: Tab9WEEA0001504 tcp:9229/],
    ["the local DevTools port held", (c) => c.set("dt.forward", "held"), /NO  DevTools: la porta locale tcp:\d+ è già usata/],
    ["a client on the tablet's DevTools socket", (c) => c.set("unix", "Num       RefCount Protocol Flags    Type St Inode Path\n0000: 00000002 00000000 00010000 0001 01 1001 @chrome_devtools_remote\n0000: 00000003 00000000 00000000 0001 03 1002 @chrome_devtools_remote\n"), /NO  DevTools: sul tablet 1 client sono già collegati/],
    ["a bench tab open", (c) => (c.tabs = [BENCH_TAB()]), /NO  pagine del banco aperte: AAA1/],
];
for (const [what, fault, re] of PRONTO_FAULTS) {
    test(`pronto refuses ${what}, and names it`, async () => {
        const c = mk();
        fault(c);
        writeFileSync(c.table, JSON.stringify(c.t));
        const s = (await drive(c, ["pronto"])).steps[0];
        refused(s, re);
        assert.match(s.out, /STOP: 1 controlli non superati/);
        assert.doesNotMatch(s.out, /PRONTO OK/);
        assert.equal(readFileSync(`${c.fake}/forwards`, "utf8").includes(`tcp:${DT_PORT}`), false);
    });
}

test("pronto passes the tablet's DevTools socket with only its listener, and reads Chrome from the package manager when DevTools has no version", async () => {
    const c = mk();
    c.set("unix", "Num       RefCount Protocol Flags    Type St Inode Path\n0000: 00000002 00000000 00010000 0001 01 1001 @chrome_devtools_remote\n");
    c.noVersion = true;
    c.tabs = [OTHER_TAB];
    const s = (await drive(c, ["pronto"])).steps[0];
    passed(s, /PRONTO OK/);
    assert.match(s.out, /OK  Chrome sul tablet: 156\.0\.8078\.81 \(fonte: package manager, versionName/);
    assert.match(s.out, /OK  nessuna pagina del banco aperta/);
});

test("pronto refuses a moved or dirty serving checkout", async () => {
    const moved = makeServe("serve-moved");
    const c = mk({ serve: moved });
    writeFileSync(`${moved.dir}/examples/js/new.mjs`, "export {};\n");
    git(moved.dir, "add", "-A");
    git(moved.dir, "commit", "-q", "-m", "moved");
    const s1 = (await drive(c, ["pronto"])).steps[0];
    refused(s1, /NO  HEAD del checkout di servizio è [0-9a-f]{40}, non/);
    const dirty = makeServe("serve-dirty");
    const d = mk({ serve: dirty });
    appendFileSync(`${dirty.dir}/examples/js/bench-metrics.mjs`, "// edited\n");
    const s2 = (await drive(d, ["pronto"])).steps[0];
    refused(s2, /NO  git status sul pathspec: +M examples\/js\/bench-metrics\.mjs/);
});

// ------------------------------------------------------------------------------------------------
// One run, end to end.
// ------------------------------------------------------------------------------------------------

test("pronto, inizia 1, the tablet's download, finisci 1: one complete run, its four files the runbook's", async () => {
    const c = mk();
    const r = await drive(c, ["pronto", ...RUN(1), "stato"]);
    passed(r.steps[1], /3\. URL aperto sul tablet: run=1, clip=pinball-static\.mp4/);
    assert.match(r.steps[1].out, /4\. Sul tablet: etichetta Tab_9_WiFi, Start/);
    assert.match(r.steps[1].out, /Poi scrivi: finisci 1/);
    passed(r.steps[3], /run 1 completo\./);
    assert.match(r.steps[3].out, /6\. run check: V1 PASS .* V8 PASS exit 0/);
    assert.match(r.steps[3].out, /7\. Chiudi la scheda del run sul tablet \(o scrivi: chiudi-tab\), poi inizia 2 dalle \d\d:\d\d:\d\dZ/);
    const stem = c.stem("static", 1);
    assert.deepEqual(c.files(), [`${stem}.clip.txt`, `${stem}.json`, `${stem}.link.txt`, `${stem}.url.txt`, "m9-session.log"]);
    assert.equal(c.read(`${stem}.url.txt`), `${c.t.runs[0].url}\n`);
    assert.equal(c.read(`${stem}.json`), '{"run":1}\n');
    const clip = c.read(`${stem}.clip.txt`).split("\n").filter(Boolean);
    assert.equal(clip.length, 2);
    for (const l of clip) assert.match(l, new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ ${sha("clip pinball-static.mp4\n")} examples/videos/pinball-static\\.mp4$`));
    const link = c.read(`${stem}.link.txt`);
    assert.match(link, /^# link monitor, M4 setup item 4/);
    assert.match(link, /^no drop: true$/m);
    assert.equal(readFileSync(`${c.fake}/am.log`, "utf8"), `am start -a android.intent.action.VIEW -d '${c.t.runs[0].url}' com.android.chrome\n`);
    const calls = readFileSync(`${c.fake}/runcheck.calls`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(calls, [["--manifest", `${SERVE.dir}/examples/dist/provenance.json`, "--form", "counted", `${c.out}/${stem}.json`]]);
    assert.match(r.steps[4].out, /completi: 1 /);
    assert.match(r.steps[4].out, /prossimo: run 2 \(static\)\. Scrivi: inizia 2/);
});

test("the session's first run needs pronto first; the second session's first run does not need the first session's last", async () => {
    const c = mk();
    const r = await drive(c, ["inizia 1", "pronto", "inizia 17"]);
    refused(r.steps[0], /il run 1 apre la sessione A: prima serve pronto/);
    assert.equal(c.files().filter((x) => /static-1./.test(x)).length, 0);
    passed(r.steps[2], /URL aperto sul tablet: run=17, clip=pinball-bench-table\.mp4/);
    assert.ok(existsSync(`${c.out}/${c.stem("table", 17)}.link.txt`));
});

test("the session's first run refuses a link that is not quiet, with the minutes still to wait", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", `printf '%s' '${adbLine(90, TERMINATED).trim()}' >> '${c.adbLog}'; echo`, "inizia 1"]);
    passed(r.steps[0]);
    refused(r.steps[2], /collegamento non quieto: attendi ancora 4 min/);
    assert.deepEqual(c.files(), ["m9-session.log"]);
});

// ------------------------------------------------------------------------------------------------
// The pre-flight's three incidents, replayed.
// ------------------------------------------------------------------------------------------------

test("incident 1: an empty run variable cannot arise — no command writes a run's file without a run number of the table", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", 'inizia ""', "inizia", 'inizia "$UNSET_RUN"', 'finisci ""', "finisci", 'riapri ""', "inizia 1 2"]);
    for (const s of r.steps.slice(1)) refused(s, /vuole un solo numero di run|non è un numero di run/);
    assert.deepEqual(c.files(), ["m9-session.log"]);
    assert.ok(!existsSync(`${c.out}/.link.txt`) && !existsSync(`${c.out}/.url.txt`));
    assert.equal(amCount(c), 0);
});

test("incident 3: run 4 cannot be saved under run 5's name — finisci 5 refuses while run 4 is in progress, and inizia 5 refuses before run 4 ends", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", ...RUN(1), ...RUN(2), ...RUN(3), "inizia 4", "__dl 4", "finisci 5", "inizia 5", "finisci 4"]);
    refused(r.steps[12], /il run 5 non è stato avviato con inizia 5; è in corso .*-tab9-m9-static-4/);
    refused(r.steps[13], /tab9-m9-static-4\.link\.txt è iniziato e non finito/);
    passed(r.steps[14], /run 4 completo/);
    assert.ok(existsSync(`${c.out}/${c.stem("static", 4)}.json`));
    assert.equal(c.files().filter((f) => /static-5/.test(f)).length, 0);
    assert.equal(c.read(`${c.stem("static", 4)}.json`), '{"run":4}\n');
});

test("incident 2: no command ever moves, renames or deletes a file — the driver holds no such command, and none ran in any case", () => {
    // Comments out; strings left in, so that a name inside one is caught too (stricter, not looser).
    const code = readFileSync(DRIVER, "utf8")
        .split("\n")
        .filter((l) => !/^\s*#/.test(l))
        .join("\n");
    for (const name of FORBIDDEN) assert.doesNotMatch(code, new RegExp(`(^|[\\s;&|({\`])${name}(\\s|$)`, "m"), `${name} in the driver`);
    // Every shell redirection that is not an append writes /dev/null, or a new file under `set -C`
    // (noclobber). `=>`, `->` and `2>&1` are not such writes, nor is a `>` inside a string: the
    // `node -e '…'` programs go first, then each line's quoted strings, escapes read, then its
    // trailing comment.
    const shell = code
        .replace(/node -e '[^']*'/g, "node -e ''")
        .split("\n")
        .map((l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''").replace(/(^|\s)#.*$/, ""))
        .join("\n");
    const writes = [...shell.matchAll(/(?<![>&0-9<=\-])>(?![>&=])\s*(\S+)/g)].map((m) => ({ target: m[1], line: shell.slice(shell.lastIndexOf("\n", m.index) + 1, shell.indexOf("\n", m.index)) }));
    assert.ok(writes.length > 0);
    for (const w of writes) assert.ok(w.target.startsWith("/dev/null") || /set -C/.test(w.line), `a write that may overwrite: ${w.line.trim()}`);
    // The same scan finds an overwrite when there is one: it is not blind.
    assert.ok([..."x() { printf '%s' a > \"$f\"; }".matchAll(/(?<![>&0-9<=\-])>(?![>&=])\s*(\S+)/g)].length === 1);
    assert.match("  mv \"$a\" \"$b\"", new RegExp(`(^|[\\s;&|({\`])mv(\\s|$)`, "m"));
});

test("the guards are what the driver's shell finds first for every command that moves, renames or deletes", async () => {
    const c = mk();
    const r = await drive(c, [`for x in ${FORBIDDEN.join(" ")}; do type -P "$x"; done`]);
    const found = r.steps[0].out.trim().split("\n");
    assert.equal(found.length, FORBIDDEN.length, r.steps[0].out);
    for (const p of found) assert.ok(p.includes("/guard/"), `${p} is not a guard`);
});

test("a repeated run is refused, and its files are never written twice", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", ...RUN(1), "inizia 1", "finisci 1"]);
    refused(r.steps[4], /il run 1 ha già i suoi file/);
    refused(r.steps[5], /il run 1 non è in corso \(stato: completo\)/);
    assert.equal(c.read(`${c.stem("static", 1)}.clip.txt`).trim().split("\n").length, 2);
    assert.equal(amCount(c), 1);
});

// ------------------------------------------------------------------------------------------------
// The argument.
// ------------------------------------------------------------------------------------------------

test("a bracketed paste's ~ or escape on the argument is refused with a clear line; the bare number passes", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", "inizia '1~'", "inizia $'\\e[200~1'", "inizia '1~~'", "inizia $'\\e[200~12\\e[201~'", "inizia '1[200~x'", "inizia 1"]);
    for (const s of r.steps.slice(1, 6)) refused(s, /contiene i caratteri dell'incolla \(\^\[\[200~ … ~\)/);
    // The hint names the number left once the paste's markers are out, and no other.
    assert.match(r.steps[1].out, /Digita il numero a mano, senza incollarlo: inizia 1\n/);
    assert.match(r.steps[2].out, /Digita il numero a mano, senza incollarlo: inizia 1\n/);
    assert.match(r.steps[3].out, /Digita il numero a mano, senza incollarlo: inizia 1\n/);
    assert.match(r.steps[4].out, /Digita il numero a mano, senza incollarlo: inizia 12\n/);
    assert.match(r.steps[5].out, /Digita il numero a mano, senza incollarlo\n/);
    assert.doesNotMatch(r.all, /inizia 200|inizia 1200|inizia 2001/);
    passed(r.steps[6], /run=1/);
});

test("the wrong number is refused: 0, 33, 05, a word; a skipped run is refused; the next run passes", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", "inizia 0", "inizia 33", "inizia 05", "inizia uno", ...RUN(1), "inizia 3", "inizia 2"]);
    refused(r.steps[1], /'0' non è un numero di run/);
    refused(r.steps[2], /il run 33 non è nella tabella \(run 1–32\)/);
    refused(r.steps[3], /'05' non è un numero di run/);
    refused(r.steps[4], /'uno' non è un numero di run/);
    refused(r.steps[8], /il run 2 \(static\) non è completo: nuovo/);
    passed(r.steps[9], /run=2/);
});

// ------------------------------------------------------------------------------------------------
// The refusals of inizia, each both ways.
// ------------------------------------------------------------------------------------------------

test("a bench tab already open: inizia refuses and names it; chiudi-tab closes only on «si», and only bench tabs", async () => {
    const c = mk();
    await drive(c, ["__ready"]);
    c.tabs = [BENCH_TAB("AAA1", 1), OTHER_TAB];
    let r = await drive(c, ["inizia 1"]);
    refused(r.steps[0], /una pagina del banco è aperta nel Chrome del tablet/);
    assert.match(r.steps[0].out, /scheda AAA1: http:\/\/localhost:8093\/examples\/bench-nft\.html\?mode=tracking/);
    assert.match(r.steps[0].out, /oppure scrivi: chiudi-tab/);
    assert.doesNotMatch(r.steps[0].out, /OTH1/);
    assert.deepEqual(c.files(), ["m9-session.log"]);
    r = await drive(c, ["chiudi-tab"], { stdin: "no\n" });
    assert.equal(r.steps[0].rc, 1);
    assert.match(r.steps[0].out, /nessuna scheda chiusa/);
    assert.equal(c.tabs.length, 2);
    r = await drive(c, ["chiudi-tab", "inizia 1"], { stdin: "si\n" });
    passed(r.steps[0], /chiusa la scheda AAA1/);
    assert.deepEqual(c.closed, ["AAA1"]);
    assert.deepEqual(c.tabs, [OTHER_TAB]);
    passed(r.steps[1], /run=1/);
    assert.equal(readFileSync(`${c.fake}/forwards`, "utf8"), "");
});

test("inizia refuses when the DevTools socket is held or the tabs cannot be read", async () => {
    const c = mk();
    await drive(c, ["__ready"]);
    c.set("forwards", `OTHER0001 tcp:9333 localabstract:chrome_devtools_remote\n`);
    let r = await drive(c, ["inizia 1"]);
    refused(r.steps[0], /un altro inoltro tiene il socket DevTools/);
    c.set("forwards", "");
    c.tabs = { not: "a list" };
    r = await drive(c, ["inizia 1"]);
    refused(r.steps[0], /le schede di Chrome sul tablet non si leggono/);
    c.tabs = [];
    r = await drive(c, ["inizia 1"]);
    passed(r.steps[0], /run=1/);
    assert.deepEqual(c.files().length, 4);
});

test("the tunnel down: inizia refuses and writes nothing; restored, it passes", async () => {
    const c = mk();
    await drive(c, ["__ready"]);
    c.set("reverse", "");
    let r = await drive(c, ["inizia 1"]);
    refused(r.steps[0], /il tunnel tcp:\d+ manca/);
    assert.deepEqual(c.files(), ["m9-session.log"]);
    assert.ok(!existsSync(`${c.out}/.state/1.before`));
    c.set("reverse", TUNNEL_FOR(PAGE_PORT));
    r = await drive(c, ["inizia 1"]);
    passed(r.steps[0], /1\. tunnel tcp:\d+ presente/);
});

test("a serving checkout moved or dirtied after pronto: every inizia checks it, and refuses", async () => {
    const s = makeServe("serve-later");
    const c = mk({ serve: s });
    const r1 = await drive(c, ["__ready", ...RUN(1)]);
    passed(r1.steps[3], /run 1 completo/);
    appendFileSync(`${s.dir}/examples/js/bench-metrics.mjs`, "// edited\n");
    let r = await drive(c, ["inizia 2"]);
    refused(r.steps[0], /il checkout di servizio non è pulito: +M examples\/js\/bench-metrics\.mjs/);
    git(s.dir, "add", "-A");
    git(s.dir, "commit", "-q", "-m", "moved");
    r = await drive(c, ["inizia 2"]);
    refused(r.steps[0], /il checkout di servizio è a [0-9a-f]{40}, non alla testa del freeze/);
    git(s.dir, "checkout", "-q", "--detach", s.head);
    r = await drive(c, ["inizia 2"]);
    passed(r.steps[0], /run=2/);
    writeFileSync(`${s.dir}/examples/dist/webarkit-packages.mjs`, "rebuilt\n");
    r = await drive(c, ["riapri 2"]);
    refused(r.steps[0], /il bundle del checkout di servizio è [0-9a-f]{64}, non/);
});

test("the idle time: inizia refuses before it has passed, with the seconds left; after it, it passes", async () => {
    const c = mk({ idleSeconds: 3600 });
    const r = await drive(c, ["__ready", ...RUN(1), "inizia 2", "stato"]);
    refused(r.steps[4], /il run 1 è finito \d+ s fa; attendi ancora \d+ s \(passo 7\)/);
    assert.match(r.steps[5].out, /prossimo: run 2 \(static\), tra \d+ s\. Chiudi la scheda del run 1, poi: inizia 2/);
    c.t.idleSeconds = 1;
    writeFileSync(c.table, JSON.stringify(c.t));
    const r2 = await drive(c, ["sleep 2", "inizia 2"]);
    passed(r2.steps[1], /run=2/);
});

test("the tablet's folder unreadable: inizia refuses and leaves no record of the run", async () => {
    const c = mk();
    await drive(c, ["__ready"]);
    c.set("ls.fail", "");
    const r = await drive(c, ["inizia 1"]);
    refused(r.steps[0], /i Download del tablet non si leggono/);
    assert.ok(!existsSync(`${c.out}/.state/1.before`));
    assert.deepEqual(c.files(), ["m9-session.log"]);
});

// ------------------------------------------------------------------------------------------------
// finisci: exactly one new export of the run's kind.
// ------------------------------------------------------------------------------------------------

test("no new export, then two: finisci refuses each and writes nothing; with exactly one, it passes", async () => {
    const c = mk();
    c.download("bench-nft-tracking-Tab-9-WiFi-old.json");
    let r = await drive(c, ["pronto"]);
    refused(r.steps[0]);
    const d = mk();
    r = await drive(d, ["__ready", "inizia 1", "finisci 1"]);
    refused(r.steps[2], /nessuna nuova esportazione sul tablet da inizia 1/);
    assert.match(r.steps[2].out, /premi Download JSON e scrivi di nuovo: finisci 1/);
    d.download("bench-nft-tracking-Tab-9-WiFi-1.json");
    d.download("bench-nft-tracking-Tab-9-WiFi-2.json");
    r = await drive(d, ["finisci 1"]);
    refused(r.steps[0], /2 nuove esportazioni sul tablet da inizia 1, non una: bench-nft-tracking-Tab-9-WiFi-1\.json bench-nft-tracking-Tab-9-WiFi-2\.json/);
    assert.ok(!existsSync(`${d.out}/${d.stem("static", 1)}.json`));
    assert.equal(d.read(`${d.stem("static", 1)}.clip.txt`).trim().split("\n").length, 1);
    const e = mk();
    r = await drive(e, ["__ready", "inizia 1", "finisci 1", "__dl 1", "finisci 1"]);
    refused(r.steps[2], /nessuna nuova esportazione/);
    passed(r.steps[4], /run 1 completo/);
});

test("an export of another kind, and a pulled export whose SHA-256 differs from the tablet's, are refused", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", "inizia 1", `printf x > '${c.fake}/downloads/bench-nft-detection-only-Tab-9-WiFi-1.json'`, "finisci 1"]);
    refused(r.steps[3], /la nuova esportazione bench-nft-detection-only-Tab-9-WiFi-1\.json non è di tipo tracking/);
    const d = mk();
    d.set("sha.wrong", "");
    const r2 = await drive(d, ["__ready", ...RUN(1)]);
    refused(r2.steps[3], /lo SHA-256 dell'esportazione scaricata .* non è quello del tablet/);
});

test("a drop during the run: finisci refuses, the link log says no drop: false, and the next run refuses to begin", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", "inizia 1", `printf '%s\\n' '${adbLine(0, TERMINATED).trim()}' >> '${c.adbLog}'`, "__dl 1", "finisci 1", "inizia 2", "stato"]);
    refused(r.steps[4], /il run 1 ha un calo del collegamento \(no drop: false\)/);
    assert.match(c.read(`${c.stem("static", 1)}.link.txt`), /^no drop: false$/m);
    refused(r.steps[5], /il run 1 \(static\) non è completo: finito-male/);
    assert.match(r.steps[6].out, /da riparare \(dall'agente\): 1\(finito-male\)/);
});

test("a run that fails the run check: finisci refuses and records it, and the next run refuses to begin", async () => {
    const c = mk();
    c.set("runcheck.exit", "1");
    const r = await drive(c, ["__ready", ...RUN(1), "inizia 2"]);
    refused(r.steps[3], /il run 1 non supera il run check \(exit 1\)/);
    assert.match(r.steps[3].out, /V7 FAIL/);
    assert.match(readFileSync(`${c.out}/.state/1.runcheck`, "utf8"), /^exit 1$/m);
    refused(r.steps[4], /il run 1 \(static\) non è completo: finito-male/);
});

test("finisci before inizia, and riapri on a run not in progress, are refused", async () => {
    const c = mk();
    const r = await drive(c, ["__ready", "finisci 1", "riapri 1"]);
    refused(r.steps[1], /il run 1 non è stato avviato con inizia 1/);
    refused(r.steps[2], /il run 1 non è in corso \(stato: nuovo\)/);
    assert.equal(amCount(c), 0);
});

test("a run's leftover .state record refuses inizia, so an old run check can never mark a retry complete", async () => {
    const c = mk();
    mkdirSync(`${c.out}/.state`, { recursive: true });
    writeFileSync(`${c.out}/.state/1.runcheck`, "V1 PASS\nexit 0\n");
    let r = await drive(c, ["__ready", "inizia 1", "stato"]);
    refused(r.steps[1], /il run 1 ha già i suoi record in \.state: 1\.runcheck/);
    assert.match(r.steps[2].out, /da riparare \(dall'agente\): 1\(confuso\)/);
    assert.equal(amCount(c), 0);
    // A run check record already there when finisci writes its own: refused, never read as this run's.
    const d = mk();
    r = await drive(d, ["__ready", "inizia 1", "__dl 1", `printf 'exit 0\\n' > '${d.out}/.state/1.runcheck'`, "finisci 1", "inizia 2"]);
    refused(r.steps[4], /il risultato del run check non si scrive in \.state\/1\.runcheck/);
    assert.equal(readFileSync(`${d.out}/.state/1.runcheck`, "utf8"), "exit 0\n");
});

test("riapri refuses a run begun without its clip reading, URL or export list", async () => {
    const c = mk();
    const stem = c.stem("static", 1);
    mkdirSync(`${c.out}/.state`, { recursive: true });
    writeFileSync(`${c.out}/${stem}.link.txt`, "# link monitor, M4 setup item 4 — device x\n\n## begin 2026-11-12T10:00:00.000Z\n");
    writeFileSync(`${c.out}/.state/1.before`, "");
    const r = await drive(c, ["__ready", "riapri 1"]);
    refused(r.steps[1], /il run 1 non ha la lettura della clip, l'URL o la lista delle esportazioni di inizia/);
    assert.equal(amCount(c), 0);
});

test("source and pronto log the SHA-256 of the driver, the table, the link monitor and the run check", async () => {
    const c = mk();
    const r = await drive(c, ["pronto"]);
    const log = c.read("m9-session.log");
    for (const f of [DRIVER, c.table, MONITOR_JS, RUNCHECK_JS]) {
        const h = sha(readFileSync(f));
        assert.ok(log.includes(`sha256 ${h} ${f}`), `${f} not logged at source`);
        assert.match(r.steps[0].out, new RegExp(`sha256 ${h} ${f.split("/").pop().replace(/\./g, "\\.")}`));
    }
});

test("riapri opens the run's own URL again, once its old tab is closed", async () => {
    const c = mk();
    await drive(c, ["__ready", "inizia 1"]);
    c.tabs = [BENCH_TAB("REF1", 1)];
    let r = await drive(c, ["riapri 1"]);
    refused(r.steps[0], /una pagina del banco è aperta/);
    assert.equal(amCount(c), 1);
    c.tabs = [];
    r = await drive(c, ["riapri 1"]);
    passed(r.steps[0], /URL del run 1 riaperto/);
    const am = readFileSync(`${c.fake}/am.log`, "utf8").trim().split("\n");
    assert.deepEqual(am, [am[0], am[0]]);
    assert.equal(c.read(`${c.stem("static", 1)}.url.txt`), `${c.t.runs[0].url}\n`);
});

test("stato says what is in progress and what is next", async () => {
    const c = mk();
    const r = await drive(c, ["stato", "__ready", "inizia 1", "stato"]);
    assert.match(r.steps[0].out, /prossimo: run 1, il primo della sessione A\. Scrivi: pronto, poi inizia 1/);
    assert.match(r.steps[3].out, /in corso: run 1 \(static\)\. Sul tablet: Start, «done», Download JSON; poi: finisci 1/);
});
