/*
 *  page-check.mjs
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
 * `check:page` — the bench page's checks (#120), in headless Chrome.
 *
 * `examples/bench-nft.html` is page glue that no unit test reaches (#98), so
 * what #113 attested on it is checked here, by driving the page as a person
 * would, and reading what it shows and exports:
 *
 * - a synchronous `?loops=1` run that ends itself `done`, with its stage table
 *   and its export's `summaryMs`;
 * - the same run with one frame's media time a fabricated step back to 0.2 s,
 *   mid-clip (#115): the page refuses it as the clip restarting, by the clip's
 *   duration (#96), and the run fails on that frame, its export saying so;
 * - a worker run, stopped by hand and exported, on a target whose decoding
 *   warns (#95, Task 1: the worker's decoder warnings reach the page);
 * - on the same page, the worker failing after that run ended (#95, Qodo's
 *   finding 3 on #100, and the later worker error): the run fails, Start stays
 *   disabled, a second failure is logged rather than shown, and Download is
 *   refused, naming the first cause;
 * - worker mode with a `.wnft` that does not load (#95, Task 6): the failure's
 *   cause is named, and Start stays disabled;
 * - a synchronous Start on a `.wnft` that does not load: the refusal names its
 *   404, and is the outcome of the click;
 * - and the page guards #120 found untested (part A): a sync run without
 *   `?loops=`, with the same fabricated step back, refused at Download; the
 *   `protocol` of the `?loops=1` and worker exports; Start under a `?tracker=`
 *   it cannot read; Start's provenance check on a `?run=1` session run, under
 *   nine faults, one per Start; a worker run whose detection post throws; and
 *   the worker failing while the source starts, at the page's first Start;
 * - and one smoke check of the pose demo,
 *   `examples/pinball-pose-jsfeatnext-backend.html` (#200): its pose drawn
 *   under `"TRACK"`, with the pose filter off and then on.
 *
 * Nothing in the page is changed. Faults are injected from outside, through
 * the DevTools protocol, before the page's own scripts run: the page's
 * `Worker` is kept so that an `ErrorEvent` can be dispatched on it, the
 * video's frame callback is wrapped, in two scenarios only, so that one frame's
 * `mediaTime` can be replaced, an
 * export's `Blob` is kept as `URL.createObjectURL` receives it, `console.warn`
 * and `console.error` are recorded, and the promise of Start's click handler
 * is kept, so that the outcome of a click is read when the handler has
 * finished, not at a fixed time. A worker's `postMessage`, a media element's
 * `play()`, `fetch` and `performance.getEntriesByType` are wrapped too, and
 * pass everything through until a check arms their fault ({@link instrument}).
 * Every wait is on a condition, with a deadline; no fixed sleep decides a
 * check.
 *
 * Serves the repository's `examples/` itself, on a free port of 127.0.0.1,
 * with `Cache-Control: no-store`, at `/examples/` so that the page's
 * provenance check finds the files its manifest lists where it lists them.
 * Anything outside `examples/` is a 404, except the pose demo's import-map
 * targets, which its check's page answers itself ({@link poseDemo}). Writes the tuning target the worker
 * checks load first (`scripts/unknown-chunk-target.mjs`).
 *
 * Needs `npm run build` first, from a committed tree: the `?loops=1` run is a
 * session run, which the page refuses on a manifest built from a dirty tree.
 * Chrome is `CHROME_PATH`, or else the platform's usual install path; Google
 * Chrome rather than Chromium, since the bundled clips are H.264.
 * `CHROME_ARGS` adds flags to Chrome's command line, split on spaces (for
 * example `--no-sandbox` where the sandbox cannot start).
 *
 * Usage: `npm run check:page`. Prints one PASS or FAIL line per check. Exit
 * status: 0 when every check passes, 1 when one fails, 2 when the checks
 * could not run (no Chrome, no build).
 */

import { existsSync, readFileSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { UNKNOWN_CHUNK_TARGET_PARAM, writeUnknownChunkTarget } from "./unknown-chunk-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = join(ROOT, "examples");
/** A `?targetFile=` the checks need absent: its load fails with a 404. */
const ABSENT_TARGET = "tuning/page-check-absent-target.wnft";
const WORKER_WHERE = "The detection worker (examples/js/detection-worker.mjs)";
/** The stages a synchronous run on jsfeatNext times, in table order: no `filterMatches`. */
const SYNC_STAGES = [
    "acquire",
    "gray",
    "detect",
    "describe",
    "match",
    "estimateHomography",
    "pose",
    "total",
];
const STAGE_LABELS = [
    "frame acquisition",
    "grayscale conversion",
    "detect",
    "describe",
    "match",
    "estimateHomography",
    "poseFromHomography",
    "total",
];
const READY_MS = 90_000;
const RUN_MS = 120_000;
const CLICK_MS = 30_000;

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".wnft": "application/octet-stream",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".mp4": "video/mp4",
};

class SetupError extends Error {}

/**
 * Serves `examples/` at `/examples/`, never cached, with byte ranges (a
 * `<video>` that cannot seek by range stalls at its loop).
 */
function serve() {
    const server = createServer((req, res) => {
        const headers = { "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
        let file = null;
        try {
            file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)));
        } catch {
            // A path that does not decode names no file.
        }
        let stat = null;
        if (file?.startsWith(SERVED + sep) && existsSync(file)) stat = statSync(file);
        if (!stat?.isFile() || (req.method !== "GET" && req.method !== "HEAD")) {
            res.writeHead(404, headers).end();
            return;
        }
        headers["Content-Type"] = TYPES[extname(file)] ?? "application/octet-stream";
        let start = 0;
        let end = stat.size - 1;
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        const range = match && (match[1] !== "" || match[2] !== "") ? match : null;
        if (range) {
            start = range[1] === "" ? Math.max(0, stat.size - Number(range[2])) : Number(range[1]);
            end = range[1] !== "" && range[2] !== "" ? Math.min(end, Number(range[2])) : end;
            if (start > end) {
                res.writeHead(416, { ...headers, "Content-Range": `bytes */${stat.size}` }).end();
                return;
            }
            headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
        }
        headers["Content-Length"] = end - start + 1;
        res.writeHead(range ? 206 : 200, headers);
        if (req.method === "HEAD") res.end();
        else createReadStream(file, { start, end }).pipe(res);
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

/** Chrome: `CHROME_PATH`, or the first of the platform's usual install paths that exists. */
function findChrome() {
    if (process.env.CHROME_PATH) {
        if (!existsSync(process.env.CHROME_PATH)) {
            throw new SetupError(
                `CHROME_PATH is ${process.env.CHROME_PATH}, which does not exist.`,
            );
        }
        return process.env.CHROME_PATH;
    }
    const env = process.env;
    const candidates =
        process.platform === "win32"
            ? [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]
                  .filter(Boolean)
                  .map((dir) => join(dir, "Google", "Chrome", "Application", "chrome.exe"))
            : process.platform === "darwin"
              ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
              : [
                    "/usr/bin/google-chrome",
                    "/usr/bin/google-chrome-stable",
                    "/opt/google/chrome/chrome",
                ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) {
        throw new SetupError(
            `no Chrome found (looked for ${candidates.join(", ")}). Install Google Chrome, or set CHROME_PATH to its executable.`,
        );
    }
    return found;
}

/**
 * Runs in the page before its own scripts: records what the checks read and
 * keeps what they inject faults through. Changes nothing the page does,
 * unless `fabricatedWrap` arms that fault: then the first frame callback
 * after a delivered frame whose `mediaTime` was at least `fromS` into the clip,
 * and at least `beforeEndS` before its end, receives `mediaTime: toS` instead,
 * and every other frame is untouched. The condition is on the previous
 * delivered frame, not the replaced one, because that is the time
 * `advanceLoop` compares against: a first frame replaced would have no
 * earlier time, and no step back would be seen. Delivered means as the page's
 * callback received it, after any replacement. Kept: the previous delivered
 * time, as `fabricatedWrap.replacedAfterS`, and what the replaced frame
 * carried, as `fabricatedWrap.replacedS`.
 *
 * The other faults are armed later, by a check, in `window.__pageCheck.faults`
 * (#120, part A), and each wrapper passes everything through while its own is
 * unset:
 * - `detectPost`, a message: the next `detect` job posted to a worker throws
 *   it, and the fault is spent;
 * - `workerFailsOnPlay`, a message: the next `play()` of a media element first
 *   fails the page's worker, an `ErrorEvent` with it and the worker
 *   terminated, as a worker's uncaught error arrives; then the fault is spent;
 * - `fetch`, `{ path, appendByte, cacheControl }`: the response to a `fetch`
 *   of `path`, as served, with a space appended to its body or its
 *   `Cache-Control` replaced;
 * - `timeline`, `{ type, path, set, remove, add }`: what
 *   `performance.getEntriesByType(type)` returns, with the entry of `path`
 *   given `set`'s fields, or removed, or with `add` appended.
 */
function instrument({ fabricatedWrap = null } = {}) {
    const pc = {
        workers: [],
        exports: [],
        startClicks: [],
        console: [],
        fabricatedWrap,
        faults: {},
    };
    window.__pageCheck = pc;
    if (fabricatedWrap) {
        const requestVideoFrameCallback = HTMLVideoElement.prototype.requestVideoFrameCallback;
        let deliveredS;
        HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
            const video = this;
            return requestVideoFrameCallback.call(this, function (now, metadata) {
                const { fromS, beforeEndS, toS } = fabricatedWrap;
                const previousS = deliveredS;
                if (
                    fabricatedWrap.replacedS === undefined &&
                    previousS >= fromS &&
                    previousS <= video.duration - beforeEndS
                ) {
                    fabricatedWrap.replacedAfterS = previousS;
                    fabricatedWrap.replacedS = metadata?.mediaTime;
                    deliveredS = toS;
                    return callback.call(this, now, { ...metadata, mediaTime: toS });
                }
                deliveredS = metadata?.mediaTime;
                return callback.call(this, now, metadata);
            });
        };
    }
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
        constructor(...args) {
            super(...args);
            pc.workers.push(this);
        }
        postMessage(message, ...rest) {
            const thrown = pc.faults.detectPost;
            if (thrown && message?.type === "detect") {
                pc.faults.detectPost = null;
                throw new Error(thrown);
            }
            return super.postMessage(message, ...rest);
        }
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
        const message = pc.faults.workerFailsOnPlay;
        if (message) {
            pc.faults.workerFailsOnPlay = null;
            pc.workers[0].dispatchEvent(new ErrorEvent("error", { message }));
            pc.workers[0].terminate();
        }
        return play.call(this);
    };
    const fetch = window.fetch;
    window.fetch = async function (...args) {
        const fault = pc.faults.fetch;
        if (!fault) return fetch.apply(this, args);
        const response = await fetch.apply(this, args);
        const { path, appendByte, cacheControl } = fault;
        if (new URL(response.url).pathname !== path) return response;
        let body = await response.arrayBuffer();
        if (appendByte) {
            // A space: the manifest, so changed, still parses.
            const longer = new Uint8Array(body.byteLength + 1).fill(0x20);
            longer.set(new Uint8Array(body));
            body = longer.buffer;
        }
        const headers = new Headers(response.headers);
        if (cacheControl) headers.set("Cache-Control", cacheControl);
        const faulted = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
        // A constructed Response has no URL, and the page names a file by it.
        Object.defineProperty(faulted, "url", { value: response.url });
        return faulted;
    };
    const getEntriesByType = Performance.prototype.getEntriesByType;
    Performance.prototype.getEntriesByType = function (type) {
        const entries = getEntriesByType.call(this, type);
        const fault = pc.faults.timeline;
        if (fault?.type !== type) return entries;
        const out = entries.flatMap((e) =>
            new URL(e.name).pathname !== fault.path
                ? [e]
                : fault.remove
                  ? []
                  : [{ ...e.toJSON(), ...fault.set }],
        );
        return fault.add ? [...out, fault.add] : out;
    };
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = function (object) {
        if (object instanceof Blob && object.type === "application/json") pc.exports.push(object);
        return createObjectURL.call(this, object);
    };
    for (const level of ["warn", "error"]) {
        const native = console[level];
        console[level] = function (...args) {
            pc.console.push(`${level}: ${args.map(String).join(" ")}`);
            return native.apply(this, args);
        };
    }
    const addEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (type === "click" && this instanceof HTMLElement && this.id === "start") {
            const wrapped = function (...args) {
                const outcome = listener.apply(this, args);
                pc.startClicks.push(Promise.resolve(outcome));
                return outcome;
            };
            return addEventListener.call(this, type, wrapped, options);
        }
        return addEventListener.call(this, type, listener, options);
    };
}

const results = [];

/**
 * A page load's checks, by name: each records PASS when its function returns,
 * FAIL with what it threw. A name left unrecorded when the scenario stops —
 * a deadline passed, the page failed — is FAIL with that reason, so every
 * check is named in the output whatever happens.
 */
async function scenario(names, body) {
    const recorded = new Set();
    const check = async (name, fn) => {
        if (!names.includes(name)) throw new Error(`unlisted check: ${name}`);
        try {
            await fn();
            results.push({ name, ok: true });
        } catch (e) {
            results.push({ name, ok: false, why: e.message });
        }
        recorded.add(name);
    };
    try {
        await body(check);
    } catch (e) {
        for (const name of names) {
            if (!recorded.has(name))
                results.push({ name, ok: false, why: `the scenario stopped: ${e.message}` });
        }
    }
}

function expect(ok, message) {
    if (!ok) throw new Error(message);
}

/**
 * A fresh page, in its own browser context, with the instrumentation in place
 * (given `faults`, see {@link instrument}), at `query`.
 */
async function openPage(browser, base, query, faults = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.evaluateOnNewDocument(instrument, faults);
    await page.goto(`${base}/examples/bench-nft.html?${query}`, { waitUntil: "load" });
    const read = {
        status: () => page.evaluate(() => document.getElementById("status")?.textContent ?? ""),
        error: () => page.evaluate(() => document.getElementById("error").textContent),
        startDisabled: () => page.evaluate(() => document.getElementById("start").disabled),
        stopDisabled: () => page.evaluate(() => document.getElementById("stop").disabled),
        console: () => page.evaluate(() => window.__pageCheck.console),
        exports: () => page.evaluate(() => window.__pageCheck.exports.length),
        lastExport: async () =>
            JSON.parse(await page.evaluate(() => window.__pageCheck.exports.at(-1).text())),
        stats: () =>
            page.evaluate(() => {
                const out = {};
                for (const dt of document.querySelectorAll("#stats dt")) {
                    out[dt.textContent] = dt.nextElementSibling?.textContent ?? "";
                }
                return out;
            }),
        stageTable: () =>
            page.evaluate(() =>
                [...document.querySelectorAll("#percentiles tbody tr")].map((tr) =>
                    [...tr.cells].map((c) => c.textContent),
                ),
            ),
    };
    /** Waits until `fn` (run in the page) is truthy; past `ms`, throws naming `what` and where the page stood. */
    const waitFor = async (fn, ms, what, arg) => {
        try {
            await page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg);
        } catch (e) {
            if (e.name !== "TimeoutError") throw e;
            const where = `status "${await read.status()}", error line "${await read.error()}"`;
            const errors = pageErrors.length ? `; page errors: ${pageErrors.join(" | ")}` : "";
            throw new Error(`no ${what} within ${ms / 1000} s (${where}${errors})`);
        }
    };
    const waitReady = () =>
        waitFor(
            () =>
                document.getElementById("status")?.textContent === "ready" &&
                !document.getElementById("start").disabled,
            READY_MS,
            'status "ready" with Start enabled',
        );
    const click = (id) => page.evaluate((id) => document.getElementById(id).click(), id);
    /** Clicks Start, enabled, and waits for that click's handler to finish: its outcome is what the handler left. */
    const clickStart = async () => {
        expect(
            !(await read.startDisabled()),
            `Start is disabled (status "${await read.status()}")`,
        );
        const before = await page.evaluate(() => window.__pageCheck.startClicks.length);
        await click("start");
        await waitFor(
            async (before) => {
                const clicks = window.__pageCheck.startClicks;
                if (clicks.length === before) return false;
                await clicks.at(-1);
                return true;
            },
            CLICK_MS,
            "end of Start's click handler",
            before,
        );
    };
    const close = () => context.close();
    return { page, pageErrors, read, waitFor, waitReady, click, clickStart, close };
}

const isTime = (text) => /^\d+\.\d{2}$/.test(text);

/**
 * An export of a run without `?run=` says it is not a session run (#120,
 * PG20): its `protocol` is `{ sessionRun: false, gaps }`, and the gaps
 * include the missing `run.order`, whatever else keeps it from one. That is
 * the export's sense (`sessionRunGaps`): Start's provenance check holds any
 * `?loops=` or `?run=` run to a session run's code, so the `?loops=1` run is
 * one there, and its export is not one here.
 */
function notASessionRun(e) {
    const { sessionRun, gaps } = e.protocol ?? {};
    expect(
        sessionRun === false &&
            Array.isArray(gaps) &&
            gaps.some((g) => g.startsWith("run.order none: ")),
        `protocol ${JSON.stringify(e.protocol)}`,
    );
}

/** A sync `?loops=1` run on the bundled wall clip: a `?loops=` run is the one that reads loop wraps. */
const SYNC_LOOPS_QUERY = "mode=tracking&target=wnft&clip=pinball-bench.mp4&loops=1&window=2000";

/** Waits for a run to end, whichever way: done, stopped or failed. */
const waitRunEnd = (p) =>
    p.waitFor(
        () =>
            ["done", "stopped", "failed"].includes(document.getElementById("status")?.textContent),
        RUN_MS,
        "end of the run",
    );

/** Waits for a live run to have at least `n` frames in its window. */
const waitFrames = (p, n) =>
    p.waitFor(
        (n) => {
            const row = [...document.querySelectorAll("#stats dt")].find(
                (dt) => dt.textContent === "window",
            );
            const frames = /^(\d+) \//.exec(row?.nextElementSibling?.textContent ?? "");
            return frames && Number(frames[1]) >= n;
        },
        RUN_MS,
        `${n} frames`,
        n,
    );

/** A sync `?loops=1` run on the bundled wall clip, which ends itself. */
async function syncLoopsRun(browser, base) {
    const names = [
        "sync ?loops=1 run: ends itself, status done",
        "sync ?loops=1 run: the stage table has every stage, timed",
        "sync ?loops=1 run: its stats read trackTimeShare over loop 1",
        "sync ?loops=1 run: the export says done, and its summaryMs has every stage over the counted loops",
        "sync ?loops=1 run: the export's protocol says it is not a session run, and why",
    ];
    await scenario(names, async (check) => {
        const p = await openPage(browser, base, SYNC_LOOPS_QUERY);
        try {
            await p.waitReady();
            await p.click("start");
            await waitRunEnd(p);
            await check(names[0], async () => {
                const status = await p.read.status();
                expect(
                    status === "done",
                    `status "${status}", error line "${await p.read.error()}"`,
                );
            });
            await check(names[1], async () => {
                const rows = await p.read.stageTable();
                const labels = rows.slice(0, STAGE_LABELS.length).map((r) => r[0]);
                expect(
                    JSON.stringify(labels) === JSON.stringify(STAGE_LABELS),
                    `the table's first rows are [${labels.join(", ")}], not [${STAGE_LABELS.join(", ")}]`,
                );
                const untimed = rows
                    .slice(0, STAGE_LABELS.length)
                    .filter((r) => !r.slice(1).every(isTime));
                expect(
                    untimed.length === 0,
                    `rows without p50/p95/max: ${JSON.stringify(untimed)}`,
                );
            });
            await check(names[2], async () => {
                const share = (await p.read.stats()).trackTimeShare ?? "(no row)";
                expect(
                    /^\d+\.\d% over loops 1–1 \(\d+\.\d%\)$/.test(share),
                    `trackTimeShare row reads "${share}"`,
                );
            });
            await check(names[3], async () => {
                const before = await p.read.exports();
                await p.click("download");
                expect(
                    (await p.read.exports()) === before + 1,
                    `Download exported nothing: "${await p.read.error()}"`,
                );
                const e = await p.read.lastExport();
                expect(
                    e.run?.endedBy === "done" && e.run.failure === null,
                    `run ${JSON.stringify(e.run)}`,
                );
                expect(e.detection?.path === "sync", `detection.path ${e.detection?.path}`);
                expect(
                    e.summaryMsFrames === "counted loops",
                    `summaryMsFrames "${e.summaryMsFrames}"`,
                );
                const stages = Object.keys(e.summaryMs ?? {});
                expect(
                    JSON.stringify(stages) === JSON.stringify(SYNC_STAGES),
                    `summaryMs has [${stages.join(", ")}], not [${SYNC_STAGES.join(", ")}]`,
                );
                const bad = stages.filter((s) =>
                    ["p50", "p95", "max"].some((k) => !Number.isFinite(e.summaryMs[s][k])),
                );
                expect(bad.length === 0, `summaryMs stages without p50/p95/max: ${bad.join(", ")}`);
            });
            // One counted loop, not four, and no ?run=: what keeps it from a session's (#120, PG20).
            await check(names[4], async () => notASessionRun(await p.read.lastExport()));
        } finally {
            await p.close();
        }
    });
}

/**
 * The same sync `?loops=1` run, with one frame's media time a fabricated step
 * back to 0.2 s, mid-clip (#115). 0.2 s is within 0.5 s of the start, so only
 * the clip's duration refuses it (#96): with the duration, the skip across the
 * wrap is more than 0.5 s; without it, a step back of more than 0.5 s reads as
 * the clip restarting, and the run would end `done` a loop early. So the page's
 * refusal is seen whole: `advanceLoop` given the duration, its throw, and
 * `tick` turning that into a failed run. The frame replaced is the one after a
 * delivered frame at least 1.5 s into the clip and 1 s before its end, so the
 * step is always back from a time the page has read: replacing the first
 * frame of a run that started late would show no step at all.
 */
async function syncFabricatedWrap(browser, base) {
    const names = [
        "sync ?loops=1 run, a fabricated step back to 0.2 s mid-clip: the run fails on that frame, its export says so, and nothing escapes the frame callback",
    ];
    await scenario(names, async (check) => {
        const p = await openPage(browser, base, SYNC_LOOPS_QUERY, {
            fabricatedWrap: { fromS: 1.5, beforeEndS: 1, toS: 0.2 },
        });
        try {
            await p.waitReady();
            await p.click("start");
            await waitRunEnd(p);
            await check(names[0], async () => {
                const status = await p.read.status();
                const error = await p.read.error();
                const { replacedAfterS, replacedS } = await p.page.evaluate(
                    () => window.__pageCheck.fabricatedWrap,
                );
                const fault =
                    replacedS === undefined
                        ? "(none replaced)"
                        : `the frame replaced carried ${replacedS} s, after a delivered ${replacedAfterS} s`;
                expect(status === "failed", `status "${status}", error line "${error}"; ${fault}`);
                const cause = error.split("\n\n")[0];
                expect(
                    /^The run failed on frame \d+: media time 0\.2 s, /.test(cause) &&
                        cause.includes(" is not the clip restarting: it skips ") &&
                        cause.includes(" across the wrap (clipDurationS "),
                    `error line "${error}"; ${fault}`,
                );
                const before = await p.read.exports();
                await p.click("download");
                expect(
                    (await p.read.exports()) === before + 1,
                    `Download exported nothing: "${await p.read.error()}"`,
                );
                const e = await p.read.lastExport();
                expect(
                    e.run?.endedBy === "failed" && e.run.failure === cause,
                    `run ${JSON.stringify(e.run)}, error line's cause "${cause}"`,
                );
                expect(p.pageErrors.length === 0, `page errors: ${p.pageErrors.join(" | ")}`);
            });
        } finally {
            await p.close();
        }
    });
}

/**
 * A sync run without `?loops=`, with the same fabricated step back (#120,
 * PG21): no loop is counted while it runs, so the run goes on, and stopped,
 * it is the Download that reads the step, by the clip's duration, and refuses
 * the export in one line, rather than throw out of the click.
 */
async function syncFabricatedWrapNoLoops(browser, base) {
    const names = [
        "sync run without ?loops=, a fabricated step back to 0.2 s mid-clip: Download refuses it across the wrap, in one line",
    ];
    await scenario(names, async (check) => {
        const p = await openPage(
            browser,
            base,
            "mode=tracking&target=wnft&clip=pinball-bench.mp4&window=2000",
            { fabricatedWrap: { fromS: 1.5, beforeEndS: 1, toS: 0.2 } },
        );
        try {
            await p.waitReady();
            await p.click("start");
            // Running, the replaced frame processed (its callback runs as it is
            // replaced), and 60 frames in the window. The refusal reads only the
            // replaced frame and the one before it, so none need follow it.
            await p.waitFor(
                () => window.__pageCheck.fabricatedWrap.replacedS !== undefined,
                RUN_MS,
                "replaced frame",
            );
            await waitFrames(p, 60);
            await p.click("stop");
            await check(names[0], async () => {
                const status = await p.read.status();
                expect(status === "stopped", `status "${status}" after Stop`);
                await p.click("download");
                const error = await p.read.error();
                const exported = await p.read.exports();
                expect(exported === 0, `Download exported the run (${exported} exports)`);
                expect(
                    error.startsWith("Not exported: ") &&
                        error.includes(" is not the clip restarting: it skips ") &&
                        error.includes(" across the wrap (clipDurationS ") &&
                        !error.includes("\n"),
                    `error line "${error}"`,
                );
                expect(
                    (await p.read.status()) === "stopped",
                    `status "${await p.read.status()}" after Download`,
                );
                expect(p.pageErrors.length === 0, `page errors: ${p.pageErrors.join(" | ")}`);
            });
        } finally {
            await p.close();
        }
    });
}

/**
 * A worker run on the unknown-chunk target, stopped and exported; then, on
 * the same page, the worker failing twice after that run ended.
 */
async function workerRunThenFailures(browser, base) {
    const names = [
        "Task 1: the worker's decoder warning reaches the page",
        "worker run: stopped by the user, and exported with its accounting balanced",
        "worker run: the export's protocol says it is not a session run, and why",
        "worker failure after the run ended: the run fails, and the error line names the cause",
        "worker failure: Start stays disabled",
        "later worker error: logged, and the error line keeps the first cause",
        "Download of the failed run is refused, naming the first cause",
    ];
    const first = "page-check: the worker failed after the run ended";
    const second = "page-check: the worker failed again";
    const firstMessage = `${WORKER_WHERE} failed: ${first}.`;
    await scenario(names, async (check) => {
        const p = await openPage(
            browser,
            base,
            `mode=tracking&target=wnft&detection=worker&clip=pinball-bench.mp4&window=2000&targetFile=${UNKNOWN_CHUNK_TARGET_PARAM}`,
        );
        try {
            await p.waitReady();
            await check(names[0], async () => {
                const line = `warn: ./targets/${UNKNOWN_CHUNK_TARGET_PARAM}, in the detection worker: UNKNOWN_CHUNK_SKIPPED — chunk type "XTRA"`;
                const seen = await p.read.console();
                expect(seen.includes(line), `no "${line}" among [${seen.join(" | ")}]`);
            });
            await p.click("start");
            // Running, with a detection consumed and frames past it.
            await p.waitFor(
                () => {
                    const rows = {};
                    for (const dt of document.querySelectorAll("#stats dt")) {
                        rows[dt.textContent] = dt.nextElementSibling?.textContent ?? "";
                    }
                    const consumed = /, (\d+) consumed$/.exec(rows["detection jobs"] ?? "");
                    const frames = /^(\d+) \//.exec(rows.window ?? "");
                    return (
                        consumed && Number(consumed[1]) >= 1 && frames && Number(frames[1]) >= 30
                    );
                },
                RUN_MS,
                "consumed detection and 30 frames",
            );
            await p.click("stop");
            await check(names[1], async () => {
                const status = await p.read.status();
                expect(status === "stopped", `status "${status}" after Stop`);
                await p.click("download");
                expect(
                    (await p.read.exports()) === 1,
                    `Download exported nothing: "${await p.read.error()}"`,
                );
                const e = await p.read.lastExport();
                expect(
                    e.run?.endedBy === "stopped" && e.run.failure === null,
                    `run ${JSON.stringify(e.run)}`,
                );
                expect(e.detection?.path === "worker", `detection.path ${e.detection?.path}`);
                expect(
                    e.target?.file === `targets/${UNKNOWN_CHUNK_TARGET_PARAM}`,
                    `target ${e.target?.file}`,
                );
                const a = e.detection.accounting;
                expect(
                    a.ignored === 0 &&
                        a.consumptions >= 1 &&
                        a.requests === a.consumptions + a.dropped + a.discardedAtStop,
                    `accounting ${JSON.stringify(a)}`,
                );
                expect(e.frames.length >= 30, `${e.frames.length} frames`);
            });
            // Stopped by hand, with no ?loops= and no ?run= (#120, PG20).
            await check(names[2], async () => notASessionRun(await p.read.lastExport()));
            // The worker fails after the run ended: an ErrorEvent on it, as a
            // worker's uncaught error arrives. Its handler runs inside
            // dispatchEvent, so the page has settled when this returns.
            const fail = (message) =>
                p.page.evaluate((message) => {
                    window.__pageCheck.workers[0].dispatchEvent(
                        new ErrorEvent("error", { message }),
                    );
                }, message);
            await fail(first);
            await check(names[3], async () => {
                const status = await p.read.status();
                const error = await p.read.error();
                expect(status === "failed", `status "${status}", error line "${error}"`);
                expect(
                    error.startsWith(`${firstMessage}\n\nThe worker failed after the run ended`),
                    `error line "${error}"`,
                );
            });
            await check(names[4], async () => {
                expect(await p.read.startDisabled(), "Start is enabled");
            });
            await fail(second);
            await check(names[5], async () => {
                const line = `error: The detection worker failed again, after "${firstMessage}": ${WORKER_WHERE} failed: ${second}.`;
                const seen = await p.read.console();
                expect(seen.includes(line), `no "${line}" among [${seen.join(" | ")}]`);
                const error = await p.read.error();
                expect(
                    error.startsWith(firstMessage) && !error.includes(second),
                    `error line "${error}"`,
                );
            });
            await check(names[6], async () => {
                await p.click("download");
                const error = await p.read.error();
                const exported = await p.read.exports();
                expect(exported === 1, `Download exported the failed run (${exported} exports)`);
                expect(error === `Not exported: ${firstMessage}`, `error line "${error}"`);
            });
        } finally {
            await p.close();
        }
    });
}

/** Worker mode on a `.wnft` that does not load: the worker cannot start. */
async function workerAbsentTarget(browser, base) {
    const names = [
        "Task 6: worker mode names the .wnft load failure's cause",
        "worker that could not start: Start stays disabled",
    ];
    await scenario(names, async (check) => {
        const p = await openPage(
            browser,
            base,
            `mode=tracking&target=wnft&detection=worker&targetFile=${ABSENT_TARGET}`,
        );
        try {
            // Where main() ends: failed, or (wrongly) ready.
            await p.waitFor(
                () => ["failed", "ready"].includes(document.getElementById("status")?.textContent),
                READY_MS,
                'status "failed" or "ready"',
            );
            await check(names[0], async () => {
                const status = await p.read.status();
                const error = await p.read.error();
                const expected = `${WORKER_WHERE} needs targets/${ABSENT_TARGET}, which could not be loaded (HTTP 404).`;
                expect(
                    status === "failed" && error === expected,
                    `status "${status}", error line "${error}"`,
                );
            });
            await check(names[1], async () => {
                expect(
                    await p.read.startDisabled(),
                    `Start is enabled (status "${await p.read.status()}")`,
                );
            });
        } finally {
            await p.close();
        }
    });
}

/** A synchronous Start on a `.wnft` that does not load: refused, with the 404. */
async function syncAbsentTarget(browser, base) {
    const names = ["synchronous Start refusal names the 404 of the missing target"];
    await scenario(names, async (check) => {
        const p = await openPage(
            browser,
            base,
            `mode=tracking&target=wnft&targetFile=${ABSENT_TARGET}`,
        );
        try {
            await p.waitReady();
            await p.click("start");
            // The click's outcome is what its handler left when it finished.
            await p.waitFor(
                async () => {
                    const clicks = window.__pageCheck.startClicks;
                    if (clicks.length === 0) return false;
                    await clicks.at(-1);
                    return true;
                },
                CLICK_MS,
                "end of Start's click handler",
            );
            await check(names[0], async () => {
                const status = await p.read.status();
                const error = await p.read.error();
                const expected = `targets/${ABSENT_TARGET} could not be loaded (HTTP 404).`;
                expect(
                    status === "failed" && error === expected,
                    `status "${status}", error line "${error}"`,
                );
            });
        } finally {
            await p.close();
        }
    });
}

/**
 * Start with a URL parameter the page cannot read (#120, PG1): refused with
 * the parameter's own error, which the page showed at load, and no run
 * starts. Read without it, `?tracker=` would run the tracker's defaults under
 * a URL that names an override.
 */
async function syncParamRefusal(browser, base) {
    const names = [
        "Start under a ?tracker= the page cannot read: refused with the parameter's error, and no run starts",
    ];
    await scenario(names, async (check) => {
        const p = await openPage(
            browser,
            base,
            "mode=tracking&target=wnft&clip=pinball-bench.mp4&tracker=minTrackedPatches:abc",
        );
        try {
            await p.waitReady();
            const shown = await p.read.error();
            await p.clickStart();
            await check(names[0], async () => {
                expect(
                    shown.startsWith("?tracker=: minTrackedPatches"),
                    `error line at load "${shown}"`,
                );
                const status = await p.read.status();
                const error = await p.read.error();
                expect(
                    status === "failed" && error === shown,
                    `status "${status}", error line "${error}"`,
                );
                expect(await p.read.stopDisabled(), "Stop is enabled: a run started");
            });
        } finally {
            await p.close();
        }
    });
}

/**
 * Start's provenance check on a session run (#110, §5; #120, PG4, PG5, PG5b,
 * PG6b, PG6c, PG7, PG8, PG9, PG10, PG33, PG34): a sync `?run=1` page with no `?loops=`, so a session run by its
 * `?run=` alone, and one fault per Start, each undone when the click's handler
 * has finished. Unfaulted, the build being clean, Start would start the run,
 * so each refusal is its own fault's, and the check reads it whole: the
 * refusal's one finding, before its remedy. The overflow is last: the page
 * keeps it for good, as it does a real one.
 */
async function syncProvenanceFaults(browser, base) {
    const bundle = "examples/dist/webarkit-packages.mjs";
    const module = "examples/js/run-lifecycle.mjs";
    const outside = "https://outside.page-check.invalid/module.mjs";
    const cache = "run from the HTTP cache (a hit, or a 304), so what ran is unknown";
    const resource = (fields) => ({ timeline: { type: "resource", ...fields } });
    const starts = [
        {
            name: "sync ?run=1 Start, the served bundle's bytes changed: refused, the bundle not the one built",
            fault: { fetch: { path: `/${bundle}`, appendByte: true } },
            finding: "the served bundle is not the one built",
        },
        {
            name: "sync ?run=1 Start, the manifest's bytes changed since the page loaded: refused, naming that",
            fault: { fetch: { path: "/examples/dist/provenance.json", appendByte: true } },
            finding: "the manifest changed since the page loaded",
        },
        {
            name: "sync ?run=1 Start, the bundle served cacheable: refused, naming its Cache-Control",
            fault: { fetch: { path: `/${bundle}`, cacheControl: "max-age=3600" } },
            finding: `the server lets the browser cache: ${bundle} (max-age=3600)`,
        },
        {
            name: "sync ?run=1 Start, the bundle's timeline entry a cache hit (transferSize 0): refused, run from the cache",
            fault: resource({ path: `/${bundle}`, set: { transferSize: 0 } }),
            finding: `${cache}: ${bundle}`,
        },
        {
            name: "sync ?run=1 Start, a module's timeline entry a 304 (encodedBodySize 0): refused, run from the cache",
            fault: resource({ path: `/${module}`, set: { encodedBodySize: 0 } }),
            finding: `${cache}: ${module}`,
        },
        {
            name: "sync ?run=1 Start, the page's navigation entry a cache hit: refused, run from the cache",
            fault: {
                timeline: {
                    type: "navigation",
                    path: "/examples/bench-nft.html",
                    set: { transferSize: 0 },
                },
            },
            finding: `${cache}: examples/bench-nft.html`,
        },
        {
            name: "sync ?run=1 Start, a module loaded from outside the repository: refused, as one the manifest does not list",
            fault: resource({
                add: {
                    name: outside,
                    initiatorType: "script",
                    transferSize: 1300,
                    encodedBodySize: 1000,
                    responseStatus: 200,
                },
            }),
            finding: `modules loaded that the manifest does not list: ${outside}`,
        },
        {
            name: "sync ?run=1 Start, the bundle missing from the timeline: refused, as not seen loading",
            fault: resource({ path: `/${bundle}`, remove: true }),
            finding: `modules this run loads are not in the page's resource timeline, so what ran cannot be seen: ${bundle}`,
        },
        {
            name: "sync ?run=1 Start, the resource-timing buffer overflowed: refused, naming the overflow",
            overflow: true,
            finding: "the resource-timing buffer overflowed, so later loads went unrecorded",
        },
    ];
    await scenario(
        starts.map((s) => s.name),
        async (check) => {
            const p = await openPage(
                browser,
                base,
                "mode=tracking&target=wnft&clip=pinball-bench.mp4&run=1&window=2000",
            );
            try {
                await p.waitReady();
                for (const start of starts) {
                    await check(start.name, async () => {
                        await p.page.evaluate((start) => {
                            if (start.overflow)
                                performance.dispatchEvent(new Event("resourcetimingbufferfull"));
                            else window.__pageCheck.faults = start.fault;
                        }, start);
                        try {
                            await p.clickStart();
                        } finally {
                            await p.page.evaluate(() => {
                                window.__pageCheck.faults = {};
                            });
                        }
                        const status = await p.read.status();
                        const error = await p.read.error();
                        expect(
                            status === "failed" &&
                                error.startsWith(`Provenance: ${start.finding}. To fix: `),
                            `status "${status}", error line "${error}"`,
                        );
                        expect(await p.read.stopDisabled(), "Stop is enabled: a run started");
                    });
                }
            } finally {
                await p.close();
            }
        },
    );
}

/** The bundled wall clip on the worker path, on the committed target. */
const WORKER_QUERY =
    "mode=tracking&target=wnft&detection=worker&clip=pinball-bench.mp4&window=2000";

/**
 * A worker run whose detection post throws (#120, PG18): the frame's own
 * guard on the worker path fails the run on that frame, rather than leave the
 * loop dead with the run live and no error shown.
 */
async function workerDetectPostThrows(browser, base) {
    const names = [
        "worker run, a detection job's post throws: the run fails on that frame, naming the cause",
        "worker run whose post threw: Start stays disabled, and Download is refused, naming the cause",
    ];
    const thrown = "page-check: the detection job's post threw";
    await scenario(names, async (check) => {
        const p = await openPage(browser, base, WORKER_QUERY);
        try {
            await p.waitReady();
            await p.click("start");
            // Armed with frames in the window: a run failed on its first frame
            // has none, and its Download stays disabled, refusing nothing. The
            // next frame without a lock posts, and the clip's first frames have
            // none, so the fault fires within a frame or two of being armed.
            await waitFrames(p, 30);
            await p.page.evaluate((thrown) => {
                window.__pageCheck.faults.detectPost = thrown;
            }, thrown);
            await waitRunEnd(p);
            let cause;
            await check(names[0], async () => {
                const status = await p.read.status();
                const error = await p.read.error();
                cause = error.split("\n\n")[0];
                expect(
                    status === "failed" &&
                        new RegExp(`^The worker path failed on frame \\d+: ${thrown}$`).test(
                            cause,
                        ) &&
                        error.endsWith(
                            "\n\nThe run stopped, and it will not be exported. Reload the page to run again.",
                        ),
                    `status "${status}", error line "${error}"`,
                );
            });
            await check(names[1], async () => {
                expect(await p.read.startDisabled(), "Start is enabled");
                await p.click("download");
                const error = await p.read.error();
                const exported = await p.read.exports();
                expect(exported === 0, `Download exported the failed run (${exported} exports)`);
                expect(error === `Not exported: ${cause}`, `error line "${error}"`);
            });
        } finally {
            await p.close();
        }
    });
}

/**
 * The worker failing while the source starts, after `workerReady`, at the
 * page's first Start (#120, PG23): no run is live for the failure to fail, and
 * none has run for it to attach to, so Start's own check is the only guard,
 * and the run does not start. The fault is the source's `play()`, which Start
 * awaits after `workerReady`: armed after the page is ready, it always lands in
 * that window.
 */
async function workerFailsWhileSourceStarts(browser, base) {
    const names = [
        "worker failing while the source starts, at the first Start: the run does not start, and the error line names the failure",
    ];
    const message = "page-check: the worker failed while the source started";
    await scenario(names, async (check) => {
        const p = await openPage(browser, base, WORKER_QUERY);
        try {
            await p.waitReady();
            await p.page.evaluate((message) => {
                window.__pageCheck.faults.workerFailsOnPlay = message;
            }, message);
            await p.clickStart();
            await check(names[0], async () => {
                const spent = await p.page.evaluate(
                    () => window.__pageCheck.faults.workerFailsOnPlay === null,
                );
                expect(spent, "the source's play() was not called: the fault never fired");
                const status = await p.read.status();
                const error = await p.read.error();
                expect(
                    status === "failed" &&
                        error ===
                            `${WORKER_WHERE} failed: ${message}.\n\nThe run did not start, and nothing was exported. Reload the page to run again.`,
                    `status "${status}", error line "${error}"`,
                );
                expect(await p.read.stopDisabled(), "Stop is enabled: a run started");
                expect(await p.read.startDisabled(), "Start is enabled");
            });
        } finally {
            await p.close();
        }
    });
}

/** The pose demo (#200), which is not the bench page and has no manifest. */
const POSE_PAGE = "examples/pinball-pose-jsfeatnext-backend.html";

/**
 * The directories of the pose page's import-map targets, as served paths:
 * read from the page's own map, so that what its check serves outside
 * `examples/` is exactly what the map names.
 */
function poseMapDirs() {
    const html = readFileSync(join(ROOT, POSE_PAGE), "utf8");
    const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]);
    return Object.values(map.imports).map(
        (target) => new URL(".", new URL(target, `http://x/${POSE_PAGE}`)).pathname,
    );
}

/**
 * The pose demo (#200), on the bundled static clip: once the tracker has held
 * `"TRACK"`, the page reports a pose drawn (its `data-poses-drawn`, not
 * pixels), and again after the filter is switched on, with no error raised.
 *
 * The only check that intercepts requests. The bench page loads one bundle
 * from `examples/dist/`, so every other check is served by {@link serve}
 * alone. This page keeps the other demos' import map onto the packages'
 * `dist/` and `node_modules/`, outside `examples/`, where `serve` answers
 * 404. Rather than widen `serve` for every check, this check's page answers
 * the map's targets itself, read-only from the repository, and only those:
 * any other request outside `examples/` still reaches `serve` and 404s.
 */
async function poseDemo(browser, base) {
    const names = [
        "pose demo, static clip: the pose is drawn under TRACK, filter off and then on, with no error",
    ];
    await scenario(names, async (check) => {
        const dirs = poseMapDirs();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const path = new URL(req.url()).pathname;
            const file = normalize(join(ROOT, decodeURIComponent(path)));
            const mapped = dirs.some((d) => path.startsWith(d));
            if (mapped && req.method() === "GET" && existsSync(file) && statSync(file).isFile()) {
                req.respond({
                    status: 200,
                    headers: { "Cache-Control": "no-store" },
                    contentType: TYPES[extname(file)] ?? "application/octet-stream",
                    body: readFileSync(file),
                });
            } else {
                req.continue();
            }
        });
        const data = () => page.evaluate(() => ({ ...document.body.dataset }));
        const waitFor = async (fn, ms, what, arg) => {
            try {
                await page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg);
            } catch (e) {
                if (e.name !== "TimeoutError") throw e;
                const status = await page.evaluate(
                    () => document.getElementById("status").textContent,
                );
                const error = await page.evaluate(
                    () => document.getElementById("error").textContent,
                );
                const report = JSON.stringify(await data());
                const errors = pageErrors.length ? `; page errors: ${pageErrors.join(" | ")}` : "";
                throw new Error(
                    `no ${what} within ${ms / 1000} s (status "${status}", error line "${error}", report ${report}${errors})`,
                );
            }
        };
        try {
            await page.goto(`${base}/${POSE_PAGE}`, { waitUntil: "load" });
            await waitFor(() => document.body.dataset.ready === "true", READY_MS, "ready page");
            await page.select("#source", "pinball-static.mp4");
            await page.evaluate(() => document.getElementById("start").click());
            await check(names[0], async () => {
                // Run in the page, so `filter` comes in as an argument, not a closure.
                const tracked = (filter) =>
                    document.body.dataset.filter === filter &&
                    Number(document.body.dataset.trackRun) >= 10;
                await waitFor(tracked, RUN_MS, '10 "TRACK" results in a row, filter off', "off");
                const off = await data();
                expect(Number(off.posesDrawn) > 0, `filter off: posesDrawn ${off.posesDrawn}`);
                await page.select("#filter", "one-euro");
                await waitFor(
                    tracked,
                    RUN_MS,
                    '10 "TRACK" results in a row, filter on',
                    "one-euro",
                );
                const on = await data();
                expect(
                    Number(on.posesDrawn) > Number(off.posesDrawn),
                    `filter on: posesDrawn ${on.posesDrawn}, after ${off.posesDrawn} with it off`,
                );
                const error = await page.evaluate(
                    () => document.getElementById("error").textContent,
                );
                expect(
                    on.errors === "0" && error === "" && pageErrors.length === 0,
                    `errors ${on.errors}, error line "${error}", page errors: ${pageErrors.join(" | ")}`,
                );
            });
        } finally {
            await context.close();
        }
    });
}

async function main() {
    const t0 = Date.now();
    for (const file of ["dist/webarkit-packages.mjs", "dist/provenance.json"]) {
        if (!existsSync(join(SERVED, file)))
            throw new SetupError(`examples/${file} is missing: run \`npm run build\` first.`);
    }
    if (existsSync(join(SERVED, "targets", ABSENT_TARGET))) {
        throw new SetupError(
            `examples/targets/${ABSENT_TARGET} exists, and the checks need it absent: remove it.`,
        );
    }
    const executablePath = findChrome();
    let target;
    try {
        target = await writeUnknownChunkTarget();
    } catch (e) {
        throw new SetupError(`the tuning target: ${e.message}`);
    }
    const manifest = JSON.parse(readFileSync(join(SERVED, "dist/provenance.json"), "utf8"));
    const server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    const extra = (process.env.CHROME_ARGS ?? "").split(" ").filter(Boolean);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath,
            headless: true,
            args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", ...extra],
        });
        console.log(
            `${await browser.version()} (${executablePath}); serving examples/ at ${base}; manifest HEAD ${manifest.head}, ${manifest.clean ? "clean" : "dirty"}; ${UNKNOWN_CHUNK_TARGET_PARAM} sha256 ${target.sha256.slice(0, 12)}…`,
        );
        // Downloads are read from the export's Blob, never written to disk.
        const cdp = await browser.target().createCDPSession();
        await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" });
        await syncLoopsRun(browser, base);
        await syncFabricatedWrap(browser, base);
        await syncFabricatedWrapNoLoops(browser, base);
        await workerRunThenFailures(browser, base);
        await workerAbsentTarget(browser, base);
        await syncAbsentTarget(browser, base);
        await syncParamRefusal(browser, base);
        await syncProvenanceFaults(browser, base);
        await workerDetectPostThrows(browser, base);
        await workerFailsWhileSourceStarts(browser, base);
        await poseDemo(browser, base);
    } finally {
        await browser?.close();
        server.close();
    }
    for (const r of results) console.log(r.ok ? `PASS  ${r.name}` : `FAIL  ${r.name}: ${r.why}`);
    const passed = results.filter((r) => r.ok).length;
    console.log(
        `${passed} of ${results.length} checks passed, in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    return passed === results.length ? 0 : 1;
}

try {
    process.exitCode = await main();
} catch (e) {
    console.error(`check:page: ${e instanceof SetupError ? "" : "could not run: "}${e.message}`);
    process.exitCode = 2;
}
