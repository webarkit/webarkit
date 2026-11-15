/*
 * #228 and #133, the Stage 2 and 3 registration: the references its criteria name, recomputable
 * from this repository (docs/benchmarks/2026-11-06-228-133-stage3-registration.md, "The
 * references"). No figure of the guard or the metric is computed here.
 *
 *     node docs/benchmarks/2026-11-06-228-133-stage3-references.mjs --self-test
 *     node docs/benchmarks/2026-11-06-228-133-stage3-references.mjs --replay <run dir> [--v1-projection]
 *     node --experimental-transform-types docs/benchmarks/2026-11-06-228-133-stage3-references.mjs --ground-truth <out.json>
 *
 * <run dir> holds ext/*.json, def/*.json and seq.stdout, written at a built commit, from a clean
 * tree, by:
 *
 *     node scripts/replay-clips.mjs --external 70 --seed 1 --seed-policy frame --packages bundle --out <run dir>/ext
 *     node scripts/replay-clips.mjs --seed 1 --seed-policy frame --packages bundle --out <run dir>/def
 *     node scripts/replay-clips.mjs --sequence docs/benchmarks/2026-10-13-tab9-m4-preflight-sync-wall.json --seed 1 --seed-policy frame --packages bundle > <run dir>/seq.stdout
 *
 * Every failed check exits 1 before any figure is printed.
 *
 * **A reference belongs to a machine (#271).** R-replay is a hash of what this machine's ffmpeg
 * decoded and this machine's Node computed, not a constant of the code: #262's Stage 1 (#270) found
 * it different on two machines at the same commits, from clean trees with the same bundle, and the
 * same on one machine across two commits. By the maintainer's ruling of 2026-11-14, an identity
 * check compares base and tip on one machine and names that machine's reference. The known ones:
 *
 *     the desktop   Windows 11 Pro, Intel Core i7-9700, ffmpeg 9.0.2 gyan.dev essentials build
 *                   R-replay 98323f06… (the registration's), R-truth d1d427f3…
 *     nitro-walt    Windows 11 Home, Intel Core i7-11800H, ffmpeg 9.0.2 gyan.dev full build
 *                   R-replay 6cdfcb85… (#270), R-truth d1d427f3… (#271)
 *
 * R-truth's frames are rendered, not decoded, and it is the same on both. docs/benchmarks/README.md
 * ("2026-11-14 — The references are per machine") keeps this list.
 *
 * So the script, in every mode:
 * - refuses a Node version other than the one `.nvmrc` pins, printing both, before it reads
 *   anything; the pin is this script's own repository's, and `--root`, accepted with
 *   --ground-truth only, must pin the same. Run it from the repository's root: on nitro-walt the nvm shim resolves `.nvmrc` only
 *   in the current directory, and from a subdirectory runs another version silently;
 * - names the machine on stderr in --replay and --ground-truth (host, OS, CPU, ffmpeg's version and
 *   build lines, Node), so a reference is never quoted without it. Stdout is unchanged: the checks
 *   that read its last line or count its lines (2026-11-07-228-133-stage3-metric-check.mjs,
 *   2026-11-08-239-probe.mjs) read the same text;
 * - prints, in --replay, each of the 19 per-output hashes with its output's name above the
 *   aggregate (as it always has), so a mismatch between machines localises to an output; #270's
 *   2026-11-13-262-frame-hashes-nitro-walt.txt then localises it to a decoded frame.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { cpus, hostname, release, tmpdir, version as osVersion } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const M = "<masked>";
const sha = (s) => createHash("sha256").update(s).digest("hex");

const STAT_KEYS = ["min", "p50", "p95", "max"];
const maskStats = (o) => {
    if (o && typeof o === "object") for (const k of STAT_KEYS) if (k in o) o[k] = M;
};
const maskSchedule = (s) =>
    typeof s === "string" ? s.replace(/scaled step \([0-9.]+ ms\)/g, `scaled step (${M} ms)`) : s;

/**
 * #211's mask, as #94 applied it: what a replay's clock and build write into an export. Everything
 * else is compared, `packageSource.manifestClean` included, so a dirty tree moves the hash.
 */
function maskExport(j) {
    j.exportedAt = M;
    if ("stepMs" in j) j.stepMs = M;
    j.schedule = maskSchedule(j.schedule);
    const ps = j.packageSource;
    if (ps) for (const k of ["manifestHead", "bundleSha256", "manifestBundleSha256"]) if (k in ps) ps[k] = M;
    for (const f of j.frames ?? []) {
        if (f.trackerTimings) for (const k of Object.keys(f.trackerTimings)) f.trackerTimings[k] = M;
    }
    const rs = j.runSummary ?? {};
    for (const k of ["trackStepMs", "alignMs", "fitMs", "pyramidMs"]) maskStats(rs[k]);
    for (const job of j.detection?.jobs ?? []) {
        if ("postedAtMs" in job) job.postedAtMs = M;
        if ("arrivedAtMs" in job) job.arrivedAtMs = M;
    }
    if (j.tuningProbe?.perPatchUs) maskStats(j.tuningProbe.perPatchUs);
    return j;
}

const MASKED_COLUMNS = new Set([
    "trackStepMs p50 / p95",
    "align share",
    "alignMs p50 / p95",
    "µs per attempted patch p50 / p95",
]);

/** The same mask on a replay's stdout. */
function maskStdout(text) {
    const out = [];
    let header = null;
    const lines = text.split(/\r?\n/);
    const isSep = (l) => l !== undefined && /^\|( *-+ *\|)+$/.test(l);
    for (const [i, line] of lines.entries()) {
        if (line.startsWith("|")) {
            const cells = line.split("|").slice(1, -1).map((c) => c.trim());
            if (isSep(lines[i + 1])) {
                header = cells;
                out.push(line);
                continue;
            }
            if (cells.every((c) => /^-+$/.test(c))) {
                out.push(line);
                continue;
            }
            const masked = cells.map((c, k) => (header && MASKED_COLUMNS.has(header[k]) ? M : maskSchedule(c)));
            out.push(`| ${masked.join(" | ")} |`);
            continue;
        }
        let l = line.replace(
            /^packages: bundle ([0-9a-f]+)… \((.*)\), built at ([0-9a-f]+), (clean|DIRTY)$/,
            `packages: bundle ${M}… ($2), built at ${M}, $4`,
        );
        l = l.replace(/the scaled step is [0-9.]+ ms/, `the scaled step is ${M} ms`);
        l = l.replace(/(here, median of 3: )[0-9.]+ \/ [0-9.]+/, `$1${M} / ${M}`);
        l = l.replace(/(device ÷ here, p50: )[0-9.]+/, `$1${M}`);
        out.push(maskSchedule(l));
    }
    return out.join("\n");
}

/** #94's classification, from `scripts/replay-clips.mjs`'s code: an export whose frames depend on the scaled step. */
const isStepDependent = (f) =>
    (f.startsWith("def/") && f.endsWith("-tracking-device-scaled-step.json")) ||
    (f.startsWith("ext/") && !f.endsWith("-tracking-every-frame-sync.json"));

/** The list hash of the 19 step-independent outputs, `[name, masked text]` in order. */
function listHash(outputs) {
    if (outputs.length !== 19) throw new Error(`expected 19 step-independent outputs, got ${outputs.length}`);
    return sha(outputs.map(([n, t]) => `${sha(t)}  ${n}`).join("\n") + "\n");
}

const V2_FRAME_KEYS = ["H", "poseCorners"];
const V2_SUMMARY_KEYS = ["posePosedFrames", "poseJitterWindows", "poseJitterPx", "poseSpreadPx"];

/**
 * What a version 2 export holds of version 1: `metricsVersion` set back, and the keys version 2 adds
 * deleted, by name, each required present. No other key is touched, so anything else that changed
 * moves the hash.
 */
function projectToV1(j) {
    if (j.metricsVersion !== 2) throw new Error(`metricsVersion ${j.metricsVersion}, not 2`);
    j.metricsVersion = 1;
    for (const k of V2_SUMMARY_KEYS) {
        if (!(k in (j.runSummary ?? {}))) throw new Error(`the summary has no ${k}`);
        delete j.runSummary[k];
    }
    for (const f of j.frames ?? []) {
        for (const k of V2_FRAME_KEYS) {
            if (!(k in f)) throw new Error(`a frame has no ${k}`);
            delete f[k];
        }
    }
    return j;
}

/** #226's serialisation: keys sorted, typed arrays as arrays, a non-finite number as its string, undefined dropped. */
function canonical(x) {
    if (x === null || typeof x !== "object") return typeof x === "number" && !Number.isFinite(x) ? String(x) : x;
    if (ArrayBuffer.isView(x)) return Array.from(x, (v) => (Number.isFinite(v) ? v : String(v)));
    if (Array.isArray(x)) return x.map(canonical);
    const o = {};
    for (const k of Object.keys(x).sort()) if (x[k] !== undefined) o[k] = canonical(x[k]);
    return o;
}

function selfTest() {
    const failures = [];
    const check = (name, fn) => {
        try {
            if (fn() !== true) failures.push(name);
        } catch (e) {
            failures.push(`${name}: ${e.message}`);
        }
    };
    const throws = (fn) => {
        try {
            fn();
            return false;
        } catch (e) {
            return e.message !== "not implemented";
        }
    };
    const base = () => ({
        kind: "replay",
        metricsVersion: 1,
        exportedAt: "2026-11-06T00:00:00.000Z",
        schedule: "device, scaled step (12.34 ms)",
        stepMs: 12.34,
        packageSource: { bundleSha256: "aa", manifestBundleSha256: "aa", manifestHead: "h", manifestClean: true },
        runSummary: {
            frames: 2,
            trackStepMs: { n: 2, min: 1, p50: 2, p95: 3, max: 4 },
            jitterPx: 0.5,
            detectionTime: { postToArrivalMs: { n: 1, p50: 9 } },
        },
        frames: [{ numInliers: 30, corners: [[1, 2]], trackerTimings: { trackMs: 5 } }],
    });
    const masked = (e) => JSON.stringify(maskExport(e), null, 1);
    const changed = (edit) => {
        const e = base();
        edit(e);
        return masked(e) !== masked(base());
    };

    // The mask must not fire on what #211's mask names...
    for (const [name, edit] of Object.entries({
        exportedAt: (e) => (e.exportedAt = "other"),
        "the frame's trackerTimings": (e) => (e.frames[0].trackerTimings.trackMs = 6),
        "trackStepMs's p50": (e) => (e.runSummary.trackStepMs.p50 = 7),
        stepMs: (e) => (e.stepMs = 99),
        "the schedule's embedded step": (e) => (e.schedule = "device, scaled step (99.9 ms)"),
        "the bundle's hash": (e) => (e.packageSource.bundleSha256 = "bb"),
        "the manifest's head": (e) => (e.packageSource.manifestHead = "z"),
    })) {
        check(`mask holds: ${name}`, () => !changed(edit));
    }
    // Each named field on its own: a mask that lost one must fail here, and not only on the real run.
    const fields = () => {
        const e = base();
        e.packageSource.manifestBundleSha256 = "aa";
        for (const k of ["alignMs", "fitMs", "pyramidMs"]) e.runSummary[k] = { n: 2, min: 1, p50: 2, p95: 3, max: 4 };
        e.detection = { jobs: [{ postedAtMs: 1, arrivedAtMs: 2, frameIndex: 3 }] };
        e.tuningProbe = { perPatchUs: { n: 2, min: 1, p50: 2, p95: 3, max: 4 } };
        return e;
    };
    const holds = (edit) => {
        const e = fields();
        edit(e);
        return masked(e) === masked(fields());
    };
    for (const k of ["trackStepMs", "alignMs", "fitMs", "pyramidMs"]) {
        for (const s of ["min", "p50", "p95", "max"]) {
            check(`mask holds: ${k}'s ${s}`, () => holds((e) => (e.runSummary[k][s] = 99)));
        }
        check(`mask sees: ${k}'s n`, () => !holds((e) => (e.runSummary[k].n = 99)));
    }
    for (const s of ["min", "p50", "p95", "max"]) {
        check(`mask holds: the probe's perPatchUs ${s}`, () => holds((e) => (e.tuningProbe.perPatchUs[s] = 99)));
    }
    check("mask holds: manifestBundleSha256", () => holds((e) => (e.packageSource.manifestBundleSha256 = "bb")));
    check("mask holds: a job's postedAtMs", () => holds((e) => (e.detection.jobs[0].postedAtMs = 99)));
    check("mask holds: a job's arrivedAtMs", () => holds((e) => (e.detection.jobs[0].arrivedAtMs = 99)));
    check("mask sees: a job's other key", () => !holds((e) => (e.detection.jobs[0].frameIndex = 99)));

    // ...and must fire on everything else.
    for (const [name, edit] of Object.entries({
        "a frame's numInliers": (e) => (e.frames[0].numInliers = 31),
        "a frame's corner": (e) => (e.frames[0].corners[0][0] = 1.000000001),
        "trackStepMs's n, which the mask keeps": (e) => (e.runSummary.trackStepMs.n = 3),
        "the summary's jitterPx": (e) => (e.runSummary.jitterPx = 0.6),
        "the manifest's clean flag": (e) => (e.packageSource.manifestClean = false),
        "postToArrivalMs, which only #211's separate row masks": (e) =>
            (e.runSummary.detectionTime.postToArrivalMs.p50 = 10),
    })) {
        check(`mask sees: ${name}`, () => changed(edit));
    }

    const stdout = (ratio, here, count) =>
        `| clip | trackStepMs p50 / p95 | frames |\n|---|---|---|\n| wall | ${here} | ${count} |\nhere, median of 3: ${here}\ndevice ÷ here, p50: ${ratio}\n`;
    check("stdout mask holds: the timed columns and lines", () =>
        maskStdout(stdout("3.1", "1.2 / 3.4", 5)) === maskStdout(stdout("2.9", "1.1 / 3.3", 5)),
    );
    check("stdout mask sees: an untimed cell", () =>
        maskStdout(stdout("3.1", "1.2 / 3.4", 5)) !== maskStdout(stdout("3.1", "1.2 / 3.4", 6)),
    );

    const table = (col, v) => `| ${col} | n |\n|---|---|\n| ${v} | 1 |\n`;
    for (const col of ["trackStepMs p50 / p95", "align share", "alignMs p50 / p95", "µs per attempted patch p50 / p95"]) {
        check(`stdout mask holds: the column ${col}`, () => maskStdout(table(col, "1")) === maskStdout(table(col, "2")));
    }
    check("stdout mask sees: another column", () => maskStdout(table("frames", "1")) !== maskStdout(table("frames", "2")));
    check("stdout mask holds: the scaled step's line", () =>
        maskStdout("the scaled step is 1.5 ms") === maskStdout("the scaled step is 2.5 ms"),
    );
    check("stdout mask holds: a schedule's embedded step", () =>
        maskStdout("device, scaled step (1.5 ms)") === maskStdout("device, scaled step (2.5 ms)"),
    );
    check("stdout mask holds: the build's header, bundle and head", () =>
        maskStdout("packages: bundle aa… (the manifest's), built at bb, clean") ===
        maskStdout("packages: bundle cc… (the manifest's), built at dd, clean"),
    );
    check("stdout mask sees: a dirty build", () =>
        maskStdout("packages: bundle aa… (x), built at bb, clean") !==
        maskStdout("packages: bundle aa… (x), built at bb, DIRTY"),
    );

    check("classified: a default run's fixed-step export is independent", () =>
        isStepDependent("def/replay-pinball-bench-tracking-device-15-ms-step.json") === false,
    );
    check("classified: a default run's scaled-step export is dependent", () =>
        isStepDependent("def/replay-pinball-bench-tracking-device-scaled-step.json") === true,
    );
    check("classified: --external's arm 1 is independent", () =>
        isStepDependent("ext/replay-pinball-bench-tracking-every-frame-sync.json") === false,
    );
    check("classified: --external's other arms are dependent", () =>
        isStepDependent("ext/replay-pinball-bench-tracking-every-frame-worker.json") === true,
    );

    const outputs = Array.from({ length: 19 }, (_, i) => [`def/${i}.json`, `text ${i}`]);
    check("the list hash is the sha256 of the outputs' hash lines", () =>
        listHash(outputs) === sha(outputs.map(([n, t]) => `${sha(t)}  ${n}`).join("\n") + "\n"),
    );
    check("the list hash moves with one output", () =>
        listHash(outputs) !== listHash(outputs.map(([n, t], i) => [n, i === 7 ? `${t}!` : t])),
    );
    check("18 outputs are refused, not hashed", () => throws(() => listHash(outputs.slice(1))));

    const v2 = () => {
        const e = base();
        e.metricsVersion = 2;
        e.runSummary.posePosedFrames = 1;
        e.runSummary.poseJitterWindows = 0;
        e.runSummary.poseJitterPx = null;
        e.runSummary.poseSpreadPx = 0;
        e.frames[0].H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        e.frames[0].poseCorners = [[1, 2]];
        return e;
    };
    check("the projection of a version 2 export is the version 1 export", () =>
        JSON.stringify(projectToV1(v2())) === JSON.stringify(base()),
    );
    check("the projection refuses an export of another version, every key present, by its version", () => {
        const e = v2();
        e.metricsVersion = 1;
        try {
            projectToV1(e);
            return false;
        } catch (err) {
            return /metricsVersion 1, not 2/.test(err.message);
        }
    });
    check("the projection refuses an export with no summary key", () => {
        const e = v2();
        delete e.runSummary.poseSpreadPx;
        return throws(() => projectToV1(e));
    });
    check("the projection keeps a key it does not name", () => {
        const e = v2();
        e.frames[0].poseExtra = 1;
        return JSON.stringify(projectToV1(e)) !== JSON.stringify(base());
    });
    check("the projection keeps a version 1 value", () => {
        const e = v2();
        e.frames[0].numInliers = 31;
        return JSON.stringify(projectToV1(e)) !== JSON.stringify(base());
    });
    check("the projection refuses a frame with no poseCorners key", () => {
        const e = v2();
        delete e.frames[0].poseCorners;
        return throws(() => projectToV1(e));
    });

    check("canonical: keys sorted, typed arrays as arrays, non-finite as strings, undefined dropped", () =>
        JSON.stringify(canonical({ b: Float64Array.from([1, Infinity]), a: undefined, c: { z: NaN, y: 2 } })) ===
        '{"b":[1,"Infinity"],"c":{"y":2,"z":"NaN"}}',
    );
    check("canonical: one draw count moves the hash", () =>
        sha(JSON.stringify(canonical({ runs: [{ draws: 5232 }] }))) !==
        sha(JSON.stringify(canonical({ runs: [{ draws: 5233 }] }))),
    );

    // #271: the Node check, both ways.
    check("node: the pinned version passes, with .nvmrc's newline and either v prefix", () =>
        nodeMismatch("v24.21.0\r\n", "v24.21.0") === null && nodeMismatch("24.21.0", "v24.21.0") === null,
    );
    check("node: another version is refused, naming both", () => {
        const why = nodeMismatch("v24.21.0\n", "v24.18.0");
        return why !== null && why.includes("v24.18.0") && why.includes("v24.21.0");
    });
    check("node: a version that only shares a prefix is refused", () => nodeMismatch("v24.21.0", "v24.21.01") !== null);
    // #271: the pin is the script's own repository's; --root's must equal it. Temporary trees, each
    // with its own .nvmrc (or none).
    {
        const base = mkdtempSync(join(tmpdir(), "references-pin-"));
        const tree = (name, pin) => {
            const dir = join(base, name);
            mkdirSync(dir);
            if (pin !== null) writeFileSync(join(dir, ".nvmrc"), `${pin}\n`);
            return dir;
        };
        try {
            const own21 = tree("own21", "v24.21.0");
            const own18 = tree("own18", "v24.18.0");
            const other21 = tree("other21", "v24.21.0");
            const other18 = tree("other18", "v24.18.0");
            const bare = tree("bare", null);
            check("pin: the script's differs from the running Node, --root's equals it: refused", () => {
                const why = pinRefusal(own18, other21, "v24.21.0");
                return why !== null && why.includes("v24.18.0") && why.includes("v24.21.0");
            });
            check("pin: the script's equals the running Node, --root's differs: refused, naming both files", () => {
                const why = pinRefusal(own21, other18, "v24.21.0");
                return (
                    why !== null &&
                    why.includes(join(other18, ".nvmrc")) &&
                    why.includes(join(own21, ".nvmrc")) &&
                    why.includes("v24.18.0") &&
                    why.includes("v24.21.0")
                );
            });
            check("pin: --root with no .nvmrc: refused", () => {
                const why = pinRefusal(own21, bare, "v24.21.0");
                return why !== null && why.includes(join(bare, ".nvmrc"));
            });
            check("pin: both equal the running Node: passes", () => pinRefusal(own21, other21, "v24.21.0") === null);
            check("pin: no --root: only the script's pin is read", () =>
                pinRefusal(own21, null, "v24.21.0") === null && pinRefusal(own18, null, "v24.21.0") !== null,
            );
            check("pin: the script's own tree with no .nvmrc: refused", () => pinRefusal(bare, null, "v24.21.0") !== null);
        } finally {
            rmSync(base, { recursive: true, force: true });
        }
    }
    check("machine: six lines, the host and Node named", () => {
        const lines = machine();
        return lines.length === 6 && lines[0] === `machine: ${hostname()}` && lines[5] === `node: ${process.version}`;
    });

    if (failures.length > 0) {
        console.error(`self-test: ${failures.length} failed\n${failures.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

function fail(why) {
    console.error(`references: ${why}`);
    process.exit(1);
}

/**
 * #271: why this Node may not compute a reference, or `null`. `pinned` is `.nvmrc`'s text, `running`
 * `process.version`; a leading `v` and surrounding whitespace are ignored on either.
 */
function nodeMismatch(pinned, running) {
    const norm = (v) => String(v).trim().replace(/^v/, "");
    if (norm(pinned) === norm(running)) return null;
    return (
        `Node v${norm(running)} runs this script, and .nvmrc pins v${norm(pinned)}. A reference is computed ` +
        `on the pinned Node only. Run it from the repository's root, where the nvm shim reads .nvmrc (#271).`
    );
}

/**
 * #271: why this run may not compute a reference, or `null`. The pin is always `scriptRoot`'s
 * `.nvmrc` (this script's own repository), checked against `running` by {@link nodeMismatch}.
 * With `otherRoot` (--root, for --ground-truth only), that tree's `.nvmrc` must pin the same
 * version: ground truth computed from a tree is computed on the Node that tree pins. A missing
 * `.nvmrc` on either side is a refusal.
 */
function pinRefusal(scriptRoot, otherRoot, running) {
    const pinOf = (v) => String(v).trim().replace(/^v/, "");
    const read = (root) => {
        const path = join(root, ".nvmrc");
        try {
            return { path, pin: readFileSync(path, "utf8"), error: null };
        } catch (e) {
            return { path, pin: null, error: e.message };
        }
    };
    const own = read(scriptRoot);
    if (own.pin === null) return `cannot read ${own.path}: ${own.error}`;
    const why = nodeMismatch(own.pin, running);
    if (why) return why;
    if (otherRoot === null || otherRoot === undefined) return null;
    const other = read(otherRoot);
    if (other.pin === null) {
        return `--root pins no Node: cannot read ${other.path} (${other.error}); this script's ${own.path} pins v${pinOf(own.pin)}.`;
    }
    if (pinOf(other.pin) !== pinOf(own.pin)) {
        return (
            `--root's ${other.path} pins v${pinOf(other.pin)}, and this script's ${own.path} pins v${pinOf(own.pin)}: ` +
            `ground truth computed from a tree is computed on the Node that tree pins (#271).`
        );
    }
    return null;
}

/** #271: the machine a reference is computed on, as lines for stderr. */
function machine() {
    let ffmpeg = ["not found on the PATH", ""];
    try {
        ffmpeg = execFileSync("ffmpeg", ["-version"], { encoding: "utf8" }).split(/\r?\n/).slice(0, 2);
    } catch {
        // Reported as not found; --ground-truth does not need it.
    }
    return [
        `machine: ${hostname()}`,
        `os: ${osVersion()} (${release()}, ${process.platform} ${process.arch})`,
        `cpu: ${cpus()[0]?.model ?? "unknown"}`,
        `ffmpeg: ${ffmpeg[0]}`,
        `ffmpeg build: ${ffmpeg[1]}`,
        `node: ${process.version}`,
    ];
}

function replayHash(dir, project) {
    for (const p of ["ext", "def", "seq.stdout"]) if (!existsSync(join(dir, p))) fail(`${dir} has no ${p}`);
    const outputs = [];
    const text = (name) => {
        const j = JSON.parse(readFileSync(join(dir, name), "utf8"));
        return JSON.stringify(maskExport(project ? projectToV1(j) : j), null, 1);
    };
    for (const g of ["def", "ext"]) {
        for (const f of readdirSync(join(dir, g)).sort()) {
            const name = `${g}/${f}`;
            if (!isStepDependent(name)) outputs.push([name, text(name)]);
        }
    }
    outputs.push(["seq.stdout", maskStdout(readFileSync(join(dir, "seq.stdout"), "utf8"))]);
    const hash = listHash(outputs);
    for (const [n, t] of outputs) console.log(`${sha(t)}  ${n}`);
    console.log(`19 step-independent outputs${project ? ", projected to version 1" : ""}: ${hash}`);
}

async function groundTruth(root, out) {
    // A `.js` specifier in the ground truth's TypeScript resolves to its `.ts`.
    registerHooks({
        resolve(specifier, context, next) {
            try {
                return next(specifier, context);
            } catch (e) {
                const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
                if (e?.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) {
                    return next(`${specifier.slice(0, -3)}.ts`, context);
                }
                throw e;
            }
        },
    });
    const load = (rel) => import(pathToFileURL(join(root, rel)).href);
    // A read of the global generator stops the run. A counting wrapper (the ground truth's
    // `countGlobalRandomReads`) may stand in its place, and reads through to this one.
    const real = Math.random;
    let globalReads = 0;
    let opened = 0;
    const outside = () => (globalReads++, real());
    let current = outside;
    Object.defineProperty(Math, "random", {
        configurable: true,
        get: () => current,
        set: (v) => {
            if (v !== outside) opened++;
            current = v;
        },
    });
    const { createJsfeatNextBackend, intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
    const sw = await load("packages/nft-tracker/ground-truth/tracking/track_frame_sweep.ts");
    const seq = await load("packages/nft-tracker/ground-truth/tracker_sequences.ts");
    const tt = await load("packages/nft-tracker/ground-truth/fixtures/tracking_target.ts");
    const realCv = await createJsfeatNextBackend();
    // Draws of an injected `RansacOptions.rng`, per generator in order of first use: one per run.
    const injected = [];
    const cv = Object.create(realCv);
    cv.estimateHomography = (src, dst, options) => {
        if (typeof options?.rng !== "function") return realCv.estimateHomography(src, dst, options);
        let e = injected.find((x) => x.rng === options.rng);
        if (!e) injected.push((e = { rng: options.rng, draws: 0 }));
        return realCv.estimateHomography(src, dst, { ...options, rng: () => (e.draws++, options.rng()) });
    };
    const K = intrinsics(seq.CAMERA.width, seq.CAMERA.height);
    const runs = [];
    const record = (name, r) => {
        const from = injected.length;
        const out = r();
        const list = Array.isArray(out) ? out : [out];
        list.forEach((one, j) => {
            runs.push({
                name: Array.isArray(out) ? `${name}/v${one.v}` : name,
                states: one.states,
                results: canonical(one.results),
                truths: canonical(one.truths),
                draws: injected[from + j]?.draws ?? 0,
            });
        });
    };
    const shipped = seq.shippedTarget();
    const fixture = tt.pinballTrackingTarget(cv);
    const SETTLE = seq.SETTLE_SLIDE_FRAMES + seq.SETTLE_REST_FRAMES;
    const oneEuro = { poseFilter: { mode: "one-euro" } };
    record("shipped/leaveAndReturn", () => seq.shippedLeaveAndReturn(cv, K));
    record("shipped/wander", () => seq.shippedWander(cv, K));
    record("shipped/velocity", () => seq.shippedVelocitySteps(cv, K));
    record("shipped/rest", () => seq.run(cv, K, shipped, seq.restPath, seq.REST_FRAMES));
    record("shipped/rest/one-euro", () => seq.run(cv, K, shipped, seq.restPath, seq.REST_FRAMES, oneEuro));
    record("shipped/settle", () => seq.run(cv, K, shipped, seq.settlePath, SETTLE));
    record("shipped/settle/one-euro", () => seq.run(cv, K, shipped, seq.settlePath, SETTLE, oneEuro));
    record("fixture/leaveAndReturn", () => seq.run(cv, K, fixture, seq.leaveAndReturn, 106));
    record("fixture/wander", () => seq.run(cv, K, fixture, seq.wander, 40));
    const openedBefore = opened;
    const sweep = sw.shippedSweep();
    if (globalReads !== 0) fail(`${globalReads} reads of the global Math.random`);
    const text = JSON.stringify(
        canonical({
            runs,
            sweep: { right: sweep.right, wrong: sweep.wrong, steps: sweep.steps, regionsOpened: opened - openedBefore },
        }),
    );
    writeFileSync(out, text);
    for (const r of runs) console.log(`${r.name}: ${r.results.length} frames, draws ${r.draws}`);
    console.log(`ground truth: ${text.length} bytes, sha256 ${sha(text)}`);
}

const [mode, ...args] = process.argv.slice(2);
const USAGE = "usage: --self-test | --replay <run dir> [--v1-projection] | --ground-truth <out.json> [--root <dir>]";
const SCRIPT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const rootAt = args.indexOf("--root");
// --root names the tree --ground-truth loads; no other mode reads a tree, so it is refused there.
if (rootAt >= 0 && (mode !== "--ground-truth" || !args[rootAt + 1])) fail(USAGE);
const ROOT = rootAt >= 0 ? args[rootAt + 1] : SCRIPT_ROOT;
{
    const why = pinRefusal(SCRIPT_ROOT, rootAt >= 0 ? ROOT : null, process.version);
    if (why) fail(why);
}
if (mode === "--replay" || mode === "--ground-truth") for (const line of machine()) console.error(line);
if (mode === "--self-test") selfTest();
else if (mode === "--replay" && args[0]) {
    try {
        replayHash(args[0], args.includes("--v1-projection"));
    } catch (e) {
        fail(e.message);
    }
}
else if (mode === "--ground-truth" && args[0]) await groundTruth(ROOT, args[0]);
else fail(USAGE);
