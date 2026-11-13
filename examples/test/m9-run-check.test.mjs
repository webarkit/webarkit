/*
 *  m9-run-check.test.mjs
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
 * M9's run-level check, docs/benchmarks/2026-11-11-243-run-check.mjs (#243): V1 to V8,
 * each exercised both ways on a constructed export and its three `.txt` files. One
 * export passes every rule, and each fault, applied to a copy of it, fails its rule
 * alone. The passing `.clip.txt` is in the format of the addendum's command
 * (docs/benchmarks/2026-11-11-243-registration-addendum.md, entry 2).
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as tracker from "../../packages/nft-tracker/dist/index.js";
import { sessionDefaults } from "../js/bench-export-checks.mjs";
import { poseFilterOption } from "../js/bench-params.mjs";
import {
    CLIP_SHA256,
    DEVICE,
    PAGE_URL,
    ROOT,
    TARGET_SHA256,
    checkRun,
    sidecars,
} from "../../docs/benchmarks/2026-11-11-243-run-check.mjs";

const SCRIPT = join(ROOT, "docs", "benchmarks", "2026-11-11-243-run-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "m9-run-check-"));
const STATIC = "pinball-static.mp4";
const D = 12.166667;

/** The freeze's manifest: the shape a build writes, with made-up hashes. */
const freeze = () => ({
    schema: "webarkit-bench-provenance/1",
    builtAt: "2026-11-12T10:00:00.000Z",
    head: "a".repeat(40),
    clean: true,
    dirtyPaths: [],
    bundle: {
        path: "examples/dist/webarkit-packages.mjs",
        sha256: "b".repeat(64),
        bytes: 1,
        entry: "examples/js/packages-bundle.mjs",
    },
    sources: { "package-lock.json": { sha256: "c".repeat(64), blob: "d".repeat(40) } },
    build: { "scripts/build-provenance.mjs": { sha256: "e".repeat(64), blob: "f".repeat(40) } },
    served: {
        "examples/bench-nft.html": { sha256: "1".repeat(64), blob: "2".repeat(40), side: "page" },
        "examples/js/bench-metrics.mjs": {
            sha256: "3".repeat(64),
            blob: "4".repeat(40),
            side: "both",
        },
    },
    bundledInputs: {},
    dependencies: { "@webarkit/jsfeat-next": { version: "1.2.0" } },
    toolchain: { node: "v24.21.0", esbuild: "0.28.2" },
});

/** A counted static run, run 3: frames every 66.7 ms of media time over the warm-up, four counted loops and loop 5's first frame. */
function exportOf({ order = 3, clip = STATIC } = {}) {
    const defaults = sessionDefaults(tracker);
    const frames = [];
    for (let loop = 0; loop <= 5; loop++) {
        for (let t = 0; t < D - 0.0667; t += 0.0667) {
            frames.push({
                mediaTimeSeconds: Math.round(t * 1e6) / 1e6,
                timestampMs: frames.length * 66.7,
                state: "TRACK",
                ok: true,
            });
            if (loop === 5) break;
        }
    }
    const m = freeze();
    m.builtAt = "2026-11-13T09:00:00.000Z";
    return {
        metricsVersion: 2,
        mode: "tracking",
        target: {
            source: "wnft",
            file: defaults.targetFile,
            sha256: TARGET_SHA256,
            widthPx: 1,
            heightPx: 1,
        },
        tracker: {
            detectionOnly: false,
            options: { ...defaults.trackerOptions, poseFilter: poseFilterOption(null, tracker) },
        },
        detection: { path: "sync" },
        seed: 1,
        seedPolicy: "frame",
        run: { order, endedBy: "done", failure: null, lostVisibility: false },
        protocol: { sessionRun: true, gaps: [] },
        provenance: {
            manifest: m,
            observed: {
                served: Object.fromEntries(Object.entries(m.served).map(([p, v]) => [p, v.sha256])),
                bundleSha256: m.bundle.sha256,
            },
            refusal: null,
            note: null,
        },
        loops: { firstLoop: 1, loopCount: 4 },
        clipDurationS: D,
        ticks: frames.length,
        windowSize: frames.length,
        source: "bundled",
        bundledClip: clip,
        camera: null,
        maxKeypoints: defaults.maxKeypoints,
        processingBox: { ...defaults.processingBox },
        processingResolution: { width: 203, height: 360 },
        frames,
    };
}
const url = (e) =>
    `${PAGE_URL}?mode=tracking&target=wnft&detection=sync&clip=${e.bundledClip}&loops=4&window=2000&seed=1&run=${e.run.order}\n`;
/** A `.clip.txt` line as the addendum's printf writes it. */
const clipLine = (time, clip, hash = CLIP_SHA256[clip]) =>
    `${time} ${hash} examples/videos/${clip}\n`;
const clipTxt = (clip) =>
    clipLine("2026-11-13T09:00:01Z", clip) + clipLine("2026-11-13T09:04:12Z", clip);
const linkTxt = ({
    begin = 28,
    end = 28,
    mappingEnd = true,
    terminated = false,
    verdict = true,
} = {}) =>
    [
        `# link monitor, M4 setup item 4 — device ${DEVICE}, adb.log C:\\Users\\x\\AppData\\Local\\Temp\\adb.log`,
        "",
        "## begin 2026-11-13T09:00:00.000Z",
        "$ adb --version",
        "Android Debug Bridge version 1.0.41",
        `$ adb -s ${DEVICE} devices -l`,
        "List of devices attached",
        `${DEVICE}        device product:Tab_9_WiFi_EEA model:Tab_9_WiFi device:Tab_9_WiFi transport_id:${begin}`,
        `$ adb -s ${DEVICE} reverse --list`,
        "UsbFfs tcp:8093 tcp:8093",
        "adb.log length: 166008 bytes",
        "",
        "## end 2026-11-13T09:04:13.000Z",
        `$ adb -s ${DEVICE} devices -l`,
        "List of devices attached",
        `${DEVICE}        device product:Tab_9_WiFi_EEA model:Tab_9_WiFi device:Tab_9_WiFi transport_id:${end}`,
        `$ adb -s ${DEVICE} reverse --list`,
        ...(mappingEnd ? ["UsbFfs tcp:8093 tcp:8093"] : []),
        "",
        `## adb.log lines written between begin and end (${terminated ? 80 : 0} bytes)`,
        ...(terminated ? [`11-13 09:02:00.000 adb E usb: connection terminated: ${DEVICE}`] : []),
        "",
        "## verdict",
        `connection terminated lines naming ${DEVICE}: ${terminated ? 1 : 0}`,
        `no drop: ${verdict}`,
        "",
    ].join("\n");

let serial = 0;
/** Writes `e` and its files to a fresh path and runs every rule; `form` and the files' texts can be changed. */
function run(
    e,
    {
        form = "counted",
        url: u = url(e),
        clip = clipTxt(e.bundledClip),
        link = linkTxt(),
        root = ROOT,
    } = {},
) {
    const path = join(dir, `run-${++serial}.json`);
    writeFileSync(path, JSON.stringify(e));
    const stem = path.replace(/\.json$/, "");
    if (u !== null) writeFileSync(`${stem}.url.txt`, u);
    if (clip !== null) writeFileSync(`${stem}.clip.txt`, clip);
    if (link !== null) writeFileSync(`${stem}.link.txt`, link);
    return Object.fromEntries(
        checkRun({ e, exportPath: path, freeze: freeze(), form, files: sidecars(path), root }),
    );
}
const failing = (v) =>
    Object.entries(v)
        .filter(([, why]) => why.length > 0)
        .map(([r]) => r);

describe("the passing export", () => {
    it("passes V1 to V8", () => {
        expect(failing(run(exportOf()))).toEqual([]);
    });
});

describe("V1, each fault failing V1 alone", () => {
    it("a failure recorded", () => {
        const e = exportOf();
        e.run.failure = "The run failed on frame 12: boom";
        expect(failing(run(e))).toEqual(["V1"]);
    });
    it("a run ended by Stop", () => {
        const e = exportOf();
        e.run.endedBy = "stopped";
        expect(failing(run(e))).toEqual(["V1"]);
    });
});

describe("V2, the freeze's manifest", () => {
    it("builtAt alone may differ: the passing export's differs", () => {
        expect(exportOf().provenance.manifest.builtAt).not.toBe(freeze().builtAt);
    });
    it("fails another head, a dirty tree, a clean flag that disagrees with dirtyPaths, and another served hash", () => {
        const head = exportOf();
        head.provenance.manifest.head = "b".repeat(40);
        expect(run(head).V2.join()).toMatch(/head/);
        const dirty = exportOf();
        dirty.provenance.manifest.clean = false;
        dirty.provenance.manifest.dirtyPaths = ["examples/js/x.mjs"];
        expect(run(dirty).V2.join()).toMatch(/clean is false/);
        const lies = exportOf();
        lies.provenance.manifest.dirtyPaths = ["examples/js/x.mjs"];
        expect(run(lies).V2.join()).toMatch(/disagree/);
        const tool = exportOf();
        tool.provenance.manifest.toolchain.node = "v24.22.0";
        expect(run(tool).V2.join()).toMatch(/field toolchain/);
    });
});

describe("V3, the pinned string: the field check and the recorded URL", () => {
    it("fails a URL with a parameter added, a field the string does not set, a lost frame, and a run outside its clip's block", () => {
        const e = exportOf();
        expect(failing(run(e, { url: url(e).replace("&run=", "&procHeight=300&run=") }))).toEqual([
            "V3",
        ]);
        const box = exportOf();
        box.processingBox.height = 300;
        expect(failing(run(box))).toEqual(["V3"]);
        const opt = exportOf();
        opt.tracker.options.minTrackedPatches += 1;
        expect(failing(run(opt))).toEqual(["V3"]);
        const lost = exportOf();
        lost.windowSize -= 1;
        expect(failing(run(lost))).toEqual(["V3"]);
        const block = exportOf({ order: 9 });
        expect(run(block).V3.join()).toMatch(/pins no string/);
        expect(failing(run(exportOf({ order: 9, clip: "pinball-tilt-cross.mp4" })))).toEqual([]);
    });
    it("a missing .url.txt fails", () => {
        expect(run(exportOf(), { url: null }).V3.join()).toMatch(/url\.txt file is missing/);
    });
});

describe("V4, the inputs: the target, and .clip.txt in the addendum's format", () => {
    const e = exportOf();
    const at = (t) => clipLine(t, STATIC);
    it("fails another target hash", () => {
        const t = exportOf();
        t.target.sha256 = "0".repeat(64);
        expect(failing(run(t))).toEqual(["V4"]);
    });
    it.each([
        ["one line", at("2026-11-13T09:00:01Z")],
        ["three lines", clipTxt(STATIC) + at("2026-11-13T09:05:00Z")],
        [
            "a hash of the wrong clip",
            at("2026-11-13T09:00:01Z") +
                clipLine("2026-11-13T09:04:12Z", STATIC, CLIP_SHA256["pinball-bench.mp4"]),
        ],
        [
            "a path other than bundledClip",
            at("2026-11-13T09:00:01Z") +
                `2026-11-13T09:04:12Z ${CLIP_SHA256[STATIC]} examples/videos/pinball-bench.mp4\n`,
        ],
        ["a time that is not UTC", at("2026-11-13T09:00:01Z") + at("2026-11-13T10:04:12+01:00")],
        ["two lines out of order", at("2026-11-13T09:04:12Z") + at("2026-11-13T09:00:01Z")],
        [
            "an upper-case hash",
            at("2026-11-13T09:00:01Z") +
                `2026-11-13T09:04:12Z ${CLIP_SHA256[STATIC].toUpperCase()} examples/videos/${STATIC}\n`,
        ],
        ["no file", null],
    ])("fails %s", (_, clip) => {
        expect(failing(run(e, { clip }))).toEqual(["V4"]);
    });
    it("passes the addendum's command's own output", () => {
        // `printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(sha256sum …)" "examples/videos/<clip>"`, twice.
        expect(
            run(e, { clip: at("2026-11-13T09:00:01Z") + at("2026-11-13T09:00:01Z") }).V4,
        ).toEqual([]);
    });
});

describe("V5, provenance at Start", () => {
    it("fails a refusal, a served file the page saw differently, a manifest path not observed, and another bundle", () => {
        const r = exportOf();
        r.provenance.refusal = "the manifest's head is not this tree's";
        expect(failing(run(r))).toEqual(["V5"]);
        const s = exportOf();
        s.provenance.observed.served["examples/bench-nft.html"] = "9".repeat(64);
        expect(failing(run(s))).toEqual(["V5"]);
        const missing = exportOf();
        delete missing.provenance.observed.served["examples/js/bench-metrics.mjs"];
        expect(failing(run(missing))).toEqual(["V5"]);
        const b = exportOf();
        b.provenance.observed.bundleSha256 = "9".repeat(64);
        expect(failing(run(b))).toEqual(["V5"]);
    });
});

describe("V6, the arm and the draws", () => {
    it("fails a guard on, another seed's policy, metricsVersion 1 and a session-run gap", () => {
        const g = exportOf();
        g.tracker.options.poseGuard = { mode: "closed-form-below", thresholdDeg: 10 };
        expect(failing(run(g))).toEqual(["V6"]);
        const off = exportOf();
        off.tracker.options.poseGuard = { mode: "off" };
        expect(failing(run(off))).toEqual([]);
        const p = exportOf();
        p.seedPolicy = "run";
        expect(run(p).V6.join()).toMatch(/seedPolicy/);
        const v = exportOf();
        v.metricsVersion = 1;
        expect(failing(run(v))).toEqual(["V6"]);
        const gap = exportOf();
        gap.protocol = { sessionRun: false, gaps: ["something"] };
        expect(failing(run(gap))).toEqual(["V6"]);
    });
    it("a filtered run fails the counted form, and passes the pre-flight's filter form at the package's defaults only", () => {
        const f = exportOf({ order: 1 });
        f.tracker.options.poseFilter = poseFilterOption("one-euro", tracker);
        expect(run(f).V6.join()).toMatch(/poseFilter/);
        const u = `${PAGE_URL}?mode=tracking&target=wnft&detection=sync&clip=pinball-static.mp4&loops=4&window=2000&seed=1&poseFilter=one-euro&run=1\n`;
        expect(failing(run(f, { form: "preflight-filter", url: u }))).toEqual([]);
        const beta = exportOf({ order: 1 });
        beta.tracker.options.poseFilter = { ...poseFilterOption("one-euro", tracker), dCutOff: 2 };
        expect(failing(run(beta, { form: "preflight-filter", url: u }))).toEqual(["V3", "V6"]);
    });
    it("the fidelity form does not read sessionRun, and its own string passes", () => {
        const d = exportOf({ order: 2 });
        d.mode = "detection-only";
        d.protocol = {
            sessionRun: false,
            gaps: ["mode detection-only: a session run is a tracking or a stateless run"],
        };
        const u = `${PAGE_URL}?mode=detection-only&target=wnft&clip=pinball-static.mp4&loops=4&window=2000&seed=1&run=2\n`;
        expect(failing(run(d, { form: "preflight-fidelity", url: u }))).toEqual([]);
        expect(failing(run(d, { url: u }))).toEqual(["V3", "V6"]);
    });
});

describe("V7, the link", () => {
    it.each([
        ["a connection terminated line naming the device", { terminated: true }],
        ["a transport_id that changed", { end: 29 }],
        ["the mapping gone at the end", { mappingEnd: false }],
        ["the monitor's own verdict a drop", { verdict: false }],
    ])("fails %s", (_, o) => {
        expect(failing(run(exportOf(), { link: linkTxt(o) }))).toEqual(["V7"]);
    });
    it("fails a missing log", () => {
        expect(failing(run(exportOf(), { link: null }))).toEqual(["V7"]);
    });
});

describe("V8, the loops", () => {
    it("fails a stall the stall check refuses: a 0.6 s gap in media time", () => {
        const e = exportOf();
        e.frames.splice(400, 9);
        e.ticks = e.windowSize = e.frames.length;
        expect(failing(run(e))).toEqual(["V8"]);
    });
    it("fails a step back the loop-wrap rule refuses", () => {
        const e = exportOf();
        e.frames[300].mediaTimeSeconds = 2;
        e.frames[301].mediaTimeSeconds = 1;
        const v = run(e);
        expect(v.V8.join()).toMatch(/loop-wrap rule refuses/);
    });
    it("fails a stall-check.mjs that is not Step 0's", () => {
        const root = mkdtempSync(join(tmpdir(), "m9-root-"));
        mkdirSync(join(root, "scripts"));
        mkdirSync(join(root, "examples", "js"), { recursive: true });
        copyFileSync(
            join(ROOT, "scripts", "stall-check.mjs"),
            join(root, "scripts", "stall-check.mjs"),
        );
        writeFileSync(join(root, "scripts", "stall-check.mjs"), "\n", { flag: "a" });
        expect(run(exportOf(), { root }).V8.join()).toMatch(/not Step 0's/);
    });
});

describe("the command line", () => {
    it("exits 0 on a passing run and 1 on a failing one, printing verdicts and no pose figure", () => {
        const e = exportOf();
        const path = join(dir, "cli.json");
        writeFileSync(path, JSON.stringify(e));
        writeFileSync(join(dir, "cli.url.txt"), url(e));
        writeFileSync(join(dir, "cli.clip.txt"), clipTxt(STATIC));
        writeFileSync(join(dir, "cli.link.txt"), linkTxt());
        const m = join(dir, "freeze.json");
        writeFileSync(m, JSON.stringify(freeze()));
        const ok = spawnSync(process.execPath, [SCRIPT, "--manifest", m, path], {
            encoding: "utf8",
        });
        expect(ok.status).toBe(0);
        expect(ok.stdout).toMatch(/run check: PASS/);
        expect(ok.stdout).not.toMatch(/jitter|poseCorners|distance/i);
        writeFileSync(join(dir, "cli.link.txt"), linkTxt({ end: 30 }));
        const bad = spawnSync(process.execPath, [SCRIPT, "--manifest", m, path], {
            encoding: "utf8",
        });
        expect(bad.status).toBe(1);
        expect(bad.stdout).toMatch(/V7 FAIL/);
        const usage = spawnSync(process.execPath, [SCRIPT, path], { encoding: "utf8" });
        expect(usage.status).toBe(2);
    });
});

describe("the remaining faults and forms", () => {
    it("the pre-flight's cross and unfiltered static forms pass their own strings, and refuse another position", () => {
        const cross = exportOf({ order: 1, clip: "pinball-tilt-cross.mp4" });
        expect(failing(run(cross, { form: "preflight-cross" }))).toEqual([]);
        expect(failing(run(exportOf({ order: 2 }), { form: "preflight-static" }))).toEqual([]);
        expect(failing(run(exportOf({ order: 1 }), { form: "preflight-static" }))).toEqual(["V3"]);
    });
    it("V6: a seed other than 1 fails V3 and V6", () => {
        const e = exportOf();
        e.seed = 2;
        expect(failing(run(e))).toEqual(["V3", "V6"]);
    });
    it("V7: a repeated section cannot hide a drop; the single clean section passes", () => {
        const clean = linkTxt();
        expect(run(exportOf(), { link: clean }).V7).toEqual([]);
        const dropped = linkTxt({ terminated: true });
        const at = dropped.indexOf("## verdict");
        const cleanLog = "## adb.log lines written between begin and end (0 bytes)\n\n";
        const hidden = dropped.slice(0, at) + cleanLog + dropped.slice(at);
        const why = run(exportOf(), { link: hidden }).V7.join();
        expect(why).toMatch(/"## adb\.log" section more than once/);
    });
    it("V7: a log without its verdict section fails", () => {
        const link = linkTxt().replace(/## verdict[\s\S]*$/, "");
        expect(run(exportOf(), { link }).V7.join()).toMatch(/no "## verdict" section/);
    });
    it("V8: a run the page's wrap rule failed fails V8 as well as V1", () => {
        const e = exportOf();
        e.run.failure =
            "The run failed on frame 300: media time 1.000000 s, after 2.000000 s, is not the clip restarting: it is more than 0.5 s into the clip";
        e.run.endedBy = "failed";
        expect(failing(run(e))).toEqual(["V1", "V8"]);
    });
    it("V4: a time with fractional seconds is not the addendum's command's output", () => {
        const clip =
            clipLine("2026-11-13T09:00:01Z", STATIC) + clipLine("2026-11-13T09:04:12.5Z", STATIC);
        expect(failing(run(exportOf(), { clip }))).toEqual(["V4"]);
    });
});
