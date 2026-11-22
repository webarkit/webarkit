/*
 *  2026-11-22-278-stage1-tools.mjs
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
 * #278, M12's Stage 1 tooling: the instruments #280 runs, built on #273's runner, levers and
 * analysis and on #277's reference. **No verdict and no criterion:** every mode writes rows; none
 * sums them into a figure for or against a lever. The record beside this file says what each
 * computes (`2026-11-22-278-stage1-tools.md`).
 *
 *     npm run build
 *     node docs/benchmarks/2026-11-22-278-stage1-tools.mjs --self-test
 *     node docs/benchmarks/2026-11-22-278-stage1-tools.mjs paired --runs <dir> --out <dir> --gross-margin <px> [--clips table,wall] [--schedules every,device-15,device-25] [--seeds 1-8] [--trial]
 *     node docs/benchmarks/2026-11-22-278-stage1-tools.mjs deep   --runs <dir> --out <dir> --gross-margin <px> [--clips …] [--schedules …] [--seeds 1-8] [--trial]
 *     node docs/benchmarks/2026-11-22-278-stage1-tools.mjs m9     --out <dir> --repro-threshold <px> --gross-margin <px> [--trial]
 *     node --experimental-transform-types docs/benchmarks/2026-11-22-278-stage1-tools.mjs wrong --runs <dir> --out <dir> [--clips table,wall] [--seeds 1-8] [--trial]
 *
 * ffmpeg and ffprobe on PATH. `<runs>` holds `2026-11-14-272-stage1-probe.mjs runs --levers none`'s
 * files (`run-<clip>-none-s<seed>-<schedule>.json`, and for `wrong` the `--mirror` ones,
 * `mirror-<clip>-none-s<seed>-every.json`), flat, as that runner writes them. Each mode writes
 * `<out>/<mode>.jsonl` (a header line, then one row a line) and `<out>/<mode>-summary.json` (the
 * end-to-end counts, none by lever or direction), only after every guard and every fatal check of
 * the mode has passed. `--trial` labels every header `TRIAL, not for registration`.
 *
 * **Definitions** (the brief's for #278, as built):
 * - **A lock's age:** 0 at the first step after a detection (its `previous` is `null`), 1 at the
 *   first held step, and so on. Read from the runner's `steps` (`first`), and from the records'
 *   states on M9's exports and the synthetic sequences.
 * - **A lock state:** the step's `previous` and `current` and its frame. On a desktop run they are
 *   the runner's `Hprev` and `Hstart`; they are checked, fatally, equal to the `H` of the records
 *   two and one processed frames before (the rule M9's exports are read by, which record no lock).
 * - **V** (age 0 only): #273's V, its `firstStep("V", …)`: `previous` the `H` of the detection on
 *   the processed frame before the lock's own, when that frame is a DETECT frame (a chain, as
 *   #273's ladder reads it); on any other state V is the shipped step (`eligible: false`).
 * - **F0** (age 1 only): `trackFrame(frame, track, current, current)`: the prediction is `current`.
 * - **Fs** (age 1 only): the velocity scaled to the interval it is applied over. The motion from
 *   `previous` to `current` is `M = current · previous⁻¹`; measured over `a` clip frames (from the
 *   detection's frame to the first step's) and applied over `b` (from the first step's to this
 *   one), the prediction is `M^(b/a) · current`, the step `trackFrame(frame, track, null, that)`.
 *   `a` and `b` are counted in clip frames on the loops' timeline, each processed frame placed by
 *   its media time: on `every` both are 1, and `M¹ · current` is the shipped prediction, so Fs
 *   calls the shipped step itself there (`b === a`), checked by the self-test. The ratio on the
 *   unwrapped media times is recorded beside it (`rMedia`). `M^(b/a)` is {@link powH}: the motion
 *   conjugated into a frame normalised to the image's half-size, its determinant set to 1, then
 *   `exp((b/a) · log M)`.
 * - **Ffb** (age 1 only): the shipped step; on a refusal only, F0's step on the same frame. The
 *   second alignment is `extraSteps: 1`, charged one more `stepMs` on a device schedule (as
 *   #273's R3), nothing on `every`.
 * - Every other step is the shipped step: `deep` carries a lock with the shipped step only.
 * - **N** is #273's `LASTING` (`2026-11-14-272-stage1-analysis.mjs`), read from its source text by
 *   {@link readConstant}, not restated. Its unit there is consecutive processed `TRACK` frames of a
 *   run (`runFigures`), each one confirmed step, counted from the lock's first step: a lock
 *   "lasts" when that run reaches N. So `deep` carries a lock from its paired step at age `a` for
 *   at most `N − (a + 1)` more steps: the conversion from a lock's length to steps after the
 *   paired one, made once, in {@link stepsToLast}.
 * - **"Wrong" on the synthetic sequences:** #273's own definition, a confirmed step whose output
 *   `H` is more than `RIGHT` px RMS off the truth (`inView`), `RIGHT` read from #273's analysis
 *   (`truthReport`) by {@link readConstant}; on #273's mirrored frames every confirmed step is
 *   wrong (no threshold).
 * - **The reference** (#277's, `loadReferenceFrom`): beside every arm's output on the wall and
 *   table clips, the mean corner distance (`meanCornerDistance`) of its corners
 *   (`reprojectCorners` of the target's four corners, as `frameRecord` computes a record's) to the
 *   reference's on that clip frame, or `null` with the reason; `beyondMargin` against
 *   `--gross-margin`, a required parameter with no default (#277's 3.75 px is not reused: its
 *   record says so). Nothing is summed into a criterion.
 * - **M9's reproduction:** the desktop's shipped step on the desktop's decode of the same clip
 *   frame (placed by media time to the microsecond, `framesAt`, as #273's `m9` mode places them),
 *   from the state rebuilt from the export's records, against the device's verdict. #273's `m9`
 *   mode has no per-state disagreement measure (it reads gaps and verdicts only), so the measure
 *   is defined here: the verdict class (kept, lost) must agree, and where both kept, the mean
 *   corner distance between the desktop's output corners and the record's `corners` must be at
 *   most `--repro-threshold`, a required parameter with no default. Only reproduced states get
 *   lever rows.
 *
 * Every guard runs before any row is written, and every fatal check (a step that does not
 * reproduce its run's, a state the records do not rebuild) exits 1 before the mode writes
 * anything.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nextFrameIndex, framesAt, targetCorners, reprojectCorners } from "../../examples/js/bench-metrics.mjs";
import { loopTimes, loopPeriod } from "../../scripts/replay-run.mjs";
import { CLIPS as REFERENCE_CLIPS, loadReferenceFrom, referenceRefusal, runRefusal, meanCornerDistance } from "./2026-11-21-277-segmented-reference.mjs";

// The ground truth's sequences are TypeScript, imported by `wrong` as #273's truth script imports
// them (the same resolve hook: a `.js` specifier from a `.ts` file falls back to the `.ts`).
registerHooks({
    resolve(specifier, context, next) {
        try {
            return next(specifier, context);
        } catch (e) {
            const fromTs = typeof context.parentURL === "string" && context.parentURL.endsWith(".ts");
            if (e?.code === "ERR_MODULE_NOT_FOUND" && fromTs && specifier.endsWith(".js")) return next(`${specifier.slice(0, -3)}.ts`, context);
            throw e;
        }
    },
});

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const SCRIPT_REL = "docs/benchmarks/2026-11-22-278-stage1-tools.mjs";
const RUNNER_REL = "docs/benchmarks/2026-11-14-272-stage1-probe.mjs";
const LEVERS_REL = "docs/benchmarks/2026-11-14-272-stage1-levers.mjs";
const ANALYSIS_REL = "docs/benchmarks/2026-11-14-272-stage1-analysis.mjs";
const TRUTH_REL = "docs/benchmarks/2026-11-14-272-stage1-truth.mjs";
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const TRIAL_LABEL = "TRIAL, not for registration";
const AGE_LEVERS = { 0: ["V"], 1: ["F0", "Fs", "Ffb"] };

function fail(why) {
    console.error(`278-stage1-tools: ${why}`);
    process.exit(1);
}

// --- constants read from #273's committed source, never restated ---------------------------

/**
 * The value of `const <name> = <literal>;` in a committed file, read from its source text: the
 * declaration must occur exactly once, on one line, and its literal be numbers, strings, `null` and
 * an object or array of them. `{ value }` or `{ why }`.
 */
export function readConstantFrom(text, name, where) {
    const re = new RegExp(`^\\s*const ${name} = (.+);\\s*$`, "gm");
    const found = [...text.matchAll(re)];
    if (found.length !== 1) return { why: `${where}: ${found.length} declarations of ${name}, expected exactly one` };
    const literal = found[0][1];
    if (!/^[\s\d.\-+eE{}[\]:,"'\w]+$/.test(literal) || /\b(function|=>|new|import|require)\b/.test(literal)) return { why: `${where}: ${name} is not a literal (${literal})` };
    try {
        return { value: Function(`"use strict"; return (${literal});`)() };
    } catch (e) {
        return { why: `${where}: ${name}'s literal does not evaluate (${e.message})` };
    }
}
export function readConstant(rel, name) {
    const { value, why } = readConstantFrom(readFileSync(join(ROOT, rel), "utf8"), name, rel);
    if (why) fail(why);
    return value;
}
const LASTING = readConstant(ANALYSIS_REL, "LASTING");
const WRONG_PX = readConstant(ANALYSIS_REL, "RIGHT");
const LOOPS = readConstant(RUNNER_REL, "LOOPS");
const RATIO = readConstant(RUNNER_REL, "RATIO");
const STEP_MS = readConstant(RUNNER_REL, "SCHEDULES");
const ACQUIRE_MS = readConstant(RUNNER_REL, "DEVICE_ACQUIRE_MS");

// --- guards: pure, each a refusal string or null; exercised by --self-test ------------------

/** The seeds: exactly 1 to 8, each once. */
export function seedsRefusal(seeds) {
    const dup = seeds.filter((s, i) => seeds.indexOf(s) !== i);
    if (dup.length) return `seed(s) ${[...new Set(dup)].join(", ")} given more than once`;
    const missing = SEEDS.filter((s) => !seeds.includes(s));
    if (missing.length) return `seed(s) ${missing.join(", ")} missing of 1 to 8`;
    const extra = seeds.filter((s) => !SEEDS.includes(s));
    if (extra.length) return `seed(s) ${extra.join(", ")} outside 1 to 8`;
    return null;
}

/** A required numeric parameter: present, finite, not negative. */
export function paramRefusal(raw, name) {
    if (raw === undefined || raw === null) return `${name} is required and has no default: the Stage 1's registration sets it`;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || String(raw).trim() === "") return `${name} ${JSON.stringify(raw)} is not a non-negative number`;
    return null;
}

/**
 * A clip's reference: the file present, its bytes as #277 recorded them (`loadReferenceFrom`'s
 * result), made from this clip's bytes, and one row per clip frame at the clip's media times.
 */
export function referenceGuard({ exists, name, loaded, clipSha256, pts }) {
    if (!exists) return `${name} missing`;
    if (loaded.why) return loaded.why;
    if (loaded.ref.sourceSha256 !== clipSha256) return `${name} was made from a clip with SHA-256 ${loaded.ref.sourceSha256}, this clip's is ${clipSha256}`;
    const why = referenceRefusal(loaded.ref, pts);
    return why ? `${name}: ${why}` : null;
}

/**
 * A run's frames against the clip: every record at a clip frame's media time; on `every`, exactly
 * the clip's frames over the runner's loops, in order (#283's rule). Not on a device schedule,
 * whose frames follow the tracker's state (`scripts/replay-run.mjs`, lines 115–117).
 */
export function runFramesRefusal(frames, pts, scheduleName, loops) {
    const at = new Set(pts);
    for (let k = 0; k < frames.length; k++) if (!at.has(frames[k].mediaTimeSeconds)) return `record ${k} at ${frames[k].mediaTimeSeconds} s: no clip frame at that media time`;
    if (scheduleName !== "every") return null;
    if (frames.length !== loops * pts.length) return `${frames.length} records on every, the clip's ${pts.length} frames over ${loops} loops are ${loops * pts.length}`;
    for (let k = 0; k < frames.length; k++) if (frames[k].mediaTimeSeconds !== pts[k % pts.length]) return `record ${k} at ${frames[k].mediaTimeSeconds} s on every, the clip's frame ${k % pts.length} is at ${pts[k % pts.length]} s`;
    return null;
}

/** M9's recorded states: every record placed on a clip frame by its media time (`framesAt`, to the microsecond). */
export function m9PlaceRefusal(frames, pts, name) {
    try {
        framesAt(
            pts,
            frames.map((f) => f.mediaTimeSeconds),
        );
        return null;
    } catch (e) {
        return `${name}: a recorded state the mapping cannot place on a clip frame (${e.message})`;
    }
}

// --- the levers, the carry and the events: pure, steps injected ------------------------------

const mul3 = (A, B) => {
    const C = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
};
const det3 = (A) => A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
function inv3(A) {
    const d = det3(A);
    if (!(Math.abs(d) > 0) || !Number.isFinite(d)) return null;
    const C = new Float64Array([
        A[4] * A[8] - A[5] * A[7], A[2] * A[7] - A[1] * A[8], A[1] * A[5] - A[2] * A[4],
        A[5] * A[6] - A[3] * A[8], A[0] * A[8] - A[2] * A[6], A[2] * A[3] - A[0] * A[5],
        A[3] * A[7] - A[4] * A[6], A[1] * A[6] - A[0] * A[7], A[0] * A[4] - A[1] * A[3],
    ]);
    for (let i = 0; i < 9; i++) C[i] /= d;
    return C;
}
const I3 = () => new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const add3 = (A, B, s = 1) => A.map((v, i) => v + s * B[i]);
const scale3 = (A, s) => A.map((v) => v * s);
const norm3 = (A) => Math.sqrt(A.reduce((s, v) => s + v * v, 0));
/** Matrix square root, Denman–Beavers. */
function sqrtm(A) {
    let Y = Float64Array.from(A);
    let Z = I3();
    for (let it = 0; it < 100; it++) {
        const Yi = inv3(Y);
        const Zi = inv3(Z);
        if (!Yi || !Zi) return null;
        const Yn = scale3(add3(Y, Zi), 0.5);
        const Zn = scale3(add3(Z, Yi), 0.5);
        const delta = norm3(add3(Yn, Y, -1));
        Y = Yn;
        Z = Zn;
        if (delta < 1e-15 * norm3(Y)) break;
    }
    return Y.every(Number.isFinite) ? Y : null;
}
/** Matrix logarithm by inverse scaling and squaring: square roots until near I, then the series. */
function logm(A) {
    let B = Float64Array.from(A);
    let k = 0;
    while (norm3(add3(B, I3(), -1)) > 0.2) {
        B = sqrtm(B);
        if (!B || ++k > 60) return null;
    }
    const X = add3(B, I3(), -1);
    let term = Float64Array.from(X);
    let L = Float64Array.from(X);
    for (let j = 2; j <= 80; j++) {
        term = mul3(term, X);
        L = add3(L, term, (j % 2 === 0 ? -1 : 1) / j);
    }
    return scale3(L, 2 ** k);
}
/** Matrix exponential by scaling and squaring. */
function expm(B) {
    const s = Math.max(0, Math.ceil(Math.log2(norm3(B) || 1)) + 2);
    const C = scale3(B, 2 ** -s);
    let term = I3();
    let E = I3();
    for (let j = 1; j <= 30; j++) {
        term = scale3(mul3(term, C), 1 / j);
        E = add3(E, term);
    }
    for (let i = 0; i < s; i++) E = mul3(E, E);
    return E;
}
/**
 * `M^r` for a homography `M` in a `width × height` frame: conjugated into coordinates centred on
 * the image and scaled by its half-size (so that a motion of pixels is a matrix near I), its
 * determinant set to 1, then `exp(r · log M)`, and conjugated back. `null` when it cannot be taken.
 */
export function powH(M, r, width, height) {
    const s = Math.max(width, height) / 2;
    const T = new Float64Array([1 / s, 0, -width / 2 / s, 0, 1 / s, -height / 2 / s, 0, 0, 1]);
    const Ti = inv3(T);
    let N = mul3(mul3(T, M), Ti);
    const d = det3(N);
    if (!(d > 0)) return null;
    N = scale3(N, 1 / Math.cbrt(d));
    const L = logm(N);
    if (!L) return null;
    const P = mul3(mul3(Ti, expm(scale3(L, r))), T);
    return P.every(Number.isFinite) ? P : null;
}
/** Fs's prediction: `(current · previous⁻¹)^(b/a) · current`, `H[8]` set to 1; `null` when it cannot be taken. */
export function scaledPrediction(previous, current, a, b, width, height) {
    const pi = inv3(previous);
    if (!pi) return null;
    const Mr = powH(mul3(current, pi), b / a, width, height);
    if (!Mr) return null;
    const P = mul3(Mr, current);
    if (!(Math.abs(P[8]) > 0)) return null;
    return scale3(P, 1 / P[8]);
}

/**
 * A lever's step on one lock state. `step(previous, current)` is the shipped `trackFrame` on the
 * state's frame and `vStep(Hprev, Hdet)` #273's `firstStep("V", …)` there. `state`: `{ age,
 * previous, current, Hchain, a, b, width, height }`. Returns `{ r, extraSteps, eligible, fellBack }`.
 */
export function leverStep(lever, state, step, vStep) {
    const { previous, current } = state;
    switch (lever) {
        case "V":
            if (state.age !== 0) throw new RangeError("V acts at age 0 only");
            if (!state.Hchain) return { r: step(null, current), extraSteps: 0, eligible: false, fellBack: false };
            return { r: vStep(state.Hchain, current), extraSteps: 0, eligible: true, fellBack: false };
        case "F0":
            if (state.age !== 1) throw new RangeError("F0 acts at age 1 only");
            return { r: step(current, current), extraSteps: 0, eligible: true, fellBack: false };
        case "Fs": {
            if (state.age !== 1) throw new RangeError("Fs acts at age 1 only");
            if (!(Number.isInteger(state.a) && state.a > 0 && Number.isInteger(state.b) && state.b > 0)) throw new RangeError(`Fs: intervals ${state.a}, ${state.b}`);
            // b/a = 1: M¹ · current is the shipped prediction, so the shipped step itself.
            if (state.a === state.b) return { r: step(previous, current), extraSteps: 0, eligible: true, fellBack: false };
            const P = scaledPrediction(previous, current, state.a, state.b, state.width, state.height);
            if (!P) return { r: { ok: false, loss: "fs-no-scaled-prediction", stats: { inliers: 0, rmsError: null } }, extraSteps: 0, eligible: true, fellBack: false };
            return { r: step(null, P), extraSteps: 0, eligible: true, fellBack: false };
        }
        case "Ffb": {
            if (state.age !== 1) throw new RangeError("Ffb acts at age 1 only");
            const a = step(previous, current);
            if (a.ok) return { r: a, extraSteps: 0, eligible: true, fellBack: false };
            return { r: step(current, current), extraSteps: 1, eligible: true, fellBack: true };
        }
        default:
            throw new RangeError(`unknown lever ${lever}`);
    }
}

/** The processed frame after timeline index `k` on a schedule: the next on `every`; else `replay-run.mjs`'s rule, a kept step's busy time `acquire + stepMs · (1 + extraSteps)`. */
export function nextProcessed(times, k, stepMs, acquireMs, extraSteps) {
    if (stepMs === null) return k + 1;
    return nextFrameIndex(times, k, acquireMs + stepMs * (1 + extraSteps));
}

/** Steps after a paired step at age `age` for the lock to reach `lasting` confirmed steps from its first: `lasting − (age + 1)` (N's unit is a lock's consecutive TRACK frames, `runFigures`). */
export const stepsToLast = (lasting, age) => Math.max(0, lasting - (age + 1));

/**
 * The arm that kept, carried on from its own state with the shipped step: from timeline index
 * `from` (its paired step, which charged `extraSteps`), on the schedule's next frames, for `need`
 * steps at most. `stepAt(i, previous, current)` steps clip frame `i`. Outcome `lasted`, `lost`
 * (`at`, `loss`) or `censored` (`reason`: `loop end`, the next frame in the next loop; `run end`,
 * past the run's last frame).
 */
export function carry({ times, n, from, extraSteps, stepMs, acquireMs, need, previous, current, stepAt }) {
    const loop0 = Math.floor(from / n);
    const steps = [];
    let prev = previous;
    let cur = current;
    let idx = nextProcessed(times, from, stepMs, acquireMs, extraSteps);
    for (let j = 1; j <= need; j++) {
        if (idx >= times.length) return { outcome: "censored", reason: "run end", kept: j - 1, steps };
        if (Math.floor(idx / n) !== loop0) return { outcome: "censored", reason: "loop end", kept: j - 1, steps };
        const r = stepAt(idx % n, prev, cur);
        steps.push({ k: idx, i: idx % n, r });
        if (!r.ok) return { outcome: "lost", at: j, loss: r.loss, kept: j - 1, steps };
        prev = cur;
        cur = r.H;
        idx = nextProcessed(times, idx, stepMs, acquireMs, 0);
    }
    return { outcome: "lasted", kept: need, steps };
}

/** Paired events: a lock state seen again (the second loop, identical seeds) is marked with the event it repeats. */
export function eventRegistry() {
    const seen = new Map();
    return (key, id) => {
        if (seen.has(key)) return { event: seen.get(key), repeats: true };
        seen.set(key, id);
        return { event: id, repeats: false };
    };
}
const stateKey = (parts) => createHash("sha1").update(JSON.stringify(parts)).digest("hex");

/**
 * One M9 state against the desktop: `{ verdictMatch, distance, reproduced, why }`. Reproduced when
 * the verdict class agrees and, where both kept, the corners are within `threshold` px.
 */
export function m9Classify(device, desktop, threshold) {
    const verdictMatch = device.kept === desktop.kept;
    if (!verdictMatch) return { verdictMatch, distance: null, reproduced: false, why: `device ${device.kept ? "kept" : "lost"}, desktop ${desktop.kept ? "kept" : "lost"}` };
    if (!device.kept) return { verdictMatch, distance: null, reproduced: true, why: null };
    if (!device.corners || !desktop.corners) return { verdictMatch, distance: null, reproduced: false, why: "no corners on one side" };
    const distance = meanCornerDistance(device.corners, desktop.corners);
    return { verdictMatch, distance, reproduced: distance <= threshold, why: distance <= threshold ? null : "corners beyond the reproduction threshold" };
}

/** An M9 state's rows: the state's, and the levers' only when it reproduces. `leverRow(lever)` makes one lever row. */
export function m9StateRows(state, classify, leverRow) {
    const row = { ...state, ...classify };
    const levers = classify.reproduced && state.age === 1 ? AGE_LEVERS[1].map(leverRow) : [];
    return { row, levers };
}

// --- shared I/O ------------------------------------------------------------------------------

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i < 0) return fallback;
    const v = process.argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(`${name} needs a value`);
    return v;
}
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
function seedList(s) {
    const m = /^(\d+)-(\d+)$/.exec(s);
    if (m) return Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i);
    return list(s).map((x) => {
        if (!/^\d+$/.test(x)) fail(`--seeds: ${x}`);
        return +x;
    });
}
function requireParam(name) {
    const raw = arg(name, undefined);
    const why = paramRefusal(raw, name);
    if (why) fail(why);
    return Number(raw);
}
const sha256File = (rel) => createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex");
const git = (...a) => execFileSync("git", a, { cwd: ROOT }).toString().trim();
const sameH = (a, b) => a && b && a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
const f64 = (a) => (a ? Float64Array.from(a) : null);

function header(mode, { clips, params, trial }) {
    return {
        kind: "278-stage1-tools",
        mode,
        trial,
        label: trial ? TRIAL_LABEL : null,
        script: { path: SCRIPT_REL, commit: git("log", "-1", "--format=%H", "--", SCRIPT_REL) || null },
        runner: { path: RUNNER_REL, commit: git("log", "-1", "--format=%H", "--", RUNNER_REL) },
        levers: { path: LEVERS_REL, commit: git("log", "-1", "--format=%H", "--", LEVERS_REL) },
        head: git("rev-parse", "HEAD"),
        clean: git("status", "--porcelain") === "",
        clips: Object.fromEntries(clips.map((c) => [c.name, { file: `examples/videos/${c.file}`, sha256: c.sha256 }])),
        parameters: {
            ...params,
            N: LASTING,
            NSource: `${ANALYSIS_REL}, LASTING: a lock's consecutive TRACK frames from its first step (runFigures); a carry from age a runs N − (a + 1) steps`,
        },
        node: process.version,
        startedAt: new Date().toISOString(),
    };
}
function writeOut(out, mode, head, rows, summary) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${mode}.jsonl`), [head, ...rows].map((r) => JSON.stringify(r)).join("\n") + "\n");
    writeFileSync(join(out, `${mode}-summary.json`), JSON.stringify({ header: head, summary }, null, 2));
    console.log(JSON.stringify({ mode, label: head.label, summary }, null, 2));
}

/** The tracker's packages, the shipped arm's backend and target, and the step options. Loaded only by the modes, so --self-test runs without a build. */
async function stepping() {
    const { buildArms, loadClip, CLIP_FILES } = await load("docs/benchmarks/2026-11-13-262-stage1-probe.mjs");
    const { firstStep, stepOptions, trackFrame, trackTarget } = await load(LEVERS_REL);
    const { countGlobalRandomReads } = await load("scripts/replay-seeding.mjs");
    const { intrinsics } = await load("packages/cv-backend-jsfeatnext/dist/index.js");
    const arms = await buildArms();
    const arm = arms.orb;
    const track = trackTarget(arm.target.patches, arm.target.pyramid.scaleStep);
    const targetPoints = targetCorners(arm.target.meta.widthPx, arm.target.meta.heightPx);
    return { arm, track, targetPoints, firstStep, stepOptions, trackFrame, loadClip, CLIP_FILES, countGlobalRandomReads, intrinsics };
}

/** The clips a mode needs, decoded once, with their SHA-256 and, for wall and table, #277's reference (guarded). */
function loadClips(S, names) {
    return names.map((name) => {
        if (!S.CLIP_FILES[name]) fail(`unknown clip ${name}`);
        const clip = S.loadClip(name);
        const sha256 = sha256File(`examples/videos/${clip.file}`);
        let ref = null;
        if (name in REFERENCE_CLIPS) {
            const fileName = `2026-11-21-277-reference-${name}.json`;
            const dir = join(ROOT, "docs/benchmarks");
            const exists = existsSync(join(dir, fileName));
            const loaded = exists ? loadReferenceFrom(dir, name) : null;
            const why = referenceGuard({ exists, name: fileName, loaded, clipSha256: sha256, pts: clip.pts });
            if (why) fail(why);
            ref = loaded.ref;
        }
        return { ...clip, name, sha256, ref, times: loopTimes(clip.pts, LOOPS), period: loopPeriod(clip.pts) };
    });
}

/** An arm's output beside the reference: verdict, fit, corners and the reference distance. */
function armOut(r, clip, i, targetPoints, margin, extra = {}) {
    const corners = r.ok ? reprojectCorners(r.H, targetPoints) : null;
    return { kept: !!r.ok, loss: r.ok ? null : r.loss, inliers: r.stats?.inliers ?? null, rms: r.stats?.rmsError ?? null, corners, reference: refCell(clip, i, corners, r.ok, margin), ...extra };
}
function refCell(clip, i, corners, kept, margin) {
    if (!clip.ref) return { distance: null, reason: "no reference for this clip", beyondMargin: null };
    const row = clip.ref.rows[i];
    if (row.status !== "accepted") return { distance: null, reason: `reference frame ${row.status}`, beyondMargin: null };
    if (!kept) return { distance: null, reason: "the arm refused the step", beyondMargin: null };
    if (!corners) return { distance: null, reason: "the output has no corners", beyondMargin: null };
    const distance = meanCornerDistance(corners, row.corners);
    return { distance, reason: null, beyondMargin: distance > margin };
}
function tallyRef(t, cell) {
    if (cell.distance === null) t.without++;
    else t.with++;
}

/** Each record's index on the loops' timeline: its clip frame plus the loops before it (a loop starts where the media time steps back). */
function timeline(frames, pts) {
    const at = new Map(pts.map((t, i) => [t, i]));
    let loop = 0;
    return frames.map((f, k) => {
        if (k > 0 && f.mediaTimeSeconds < frames[k - 1].mediaTimeSeconds) loop++;
        return loop * pts.length + at.get(f.mediaTimeSeconds);
    });
}

function runFile(dir, prefix, clip, seed, schedule) {
    return join(dir, `${prefix}-${clip}-none-s${seed}-${schedule}.json`);
}

/**
 * Every run a mode reads, guarded before any row: the seeds, each file present, #277's run check
 * (the none arm of this clip, seed and schedule, at the clip's size), and its frames on the clip.
 */
function loadRuns(dir, clips, schedules, seeds, prefix = "run") {
    const why = seedsRefusal(seeds);
    if (why) fail(`--seeds: ${why}`);
    const runs = [];
    for (const clip of clips)
        for (const schedule of schedules) {
            if (!(schedule in STEP_MS)) fail(`--schedules: ${schedule}`);
            for (const seed of seeds) {
                const file = runFile(dir, prefix, clip.name, seed, schedule);
                if (!existsSync(file)) fail(`${file} missing: seed ${seed} of ${clip.name} ${schedule}`);
                const run = JSON.parse(readFileSync(file, "utf8"));
                const rw = prefix === "mirror" ? mirrorRunRefusal(run, { clip: clip.name, seed, schedule, size: [clip.width, clip.height] }) : runRefusal(run, { clip: clip.name, seed, schedule, size: [clip.width, clip.height] });
                if (rw) fail(`${file}: ${rw}`);
                const fw = runFramesRefusal(run.frames, clip.pts, schedule, LOOPS);
                if (fw) fail(`${file}: ${fw}`);
                runs.push({ clip, schedule, seed, file, run });
            }
        }
    return runs;
}
function mirrorRunRefusal(run, { clip, seed, schedule, size }) {
    if (run.kind !== "272-stage1-run" || run.mirror !== true) return "not a mirrored run of 2026-11-14-272-stage1-probe.mjs";
    if (run.ratio !== RATIO || run.loops !== LOOPS) return `ratio ${run.ratio}, loops ${run.loops}: not the runner's`;
    if (run.lever !== "none" || run.seed !== seed || run.scheduleName !== schedule || run.clip !== clip) return `not the none arm of ${clip} seed ${seed} ${schedule}`;
    if (run.size?.[0] !== size[0] || run.size?.[1] !== size[1]) return `frames ${run.size}, the clip's ${size}`;
    return null;
}

/**
 * The lock states of one desktop run, each with its age, checked fatally: ages from the runner's
 * steps; `previous` and `current` equal to the `H` of the records two and one before.
 */
function runStates(R) {
    const { run, file } = R;
    const states = [];
    let last = null;
    for (const s of run.steps) {
        let age;
        if (s.first) age = 0;
        else {
            if (!last || last.s.frame !== s.frame - 1 || !last.s.ok) fail(`${file}: held step at record ${s.frame} does not follow a kept step on the record before`);
            age = last.age + 1;
        }
        const k = s.frame;
        const before = run.frames[k - 1];
        if (!before || !sameH(s.Hstart, before.H)) fail(`${file}: the state at record ${k}: current is not the record before's H`);
        if (age === 0 && s.Hprev !== null) fail(`${file}: a first step at record ${k} with a previous`);
        if (age >= 1 && !sameH(s.Hprev, run.frames[k - 2]?.H)) fail(`${file}: the state at record ${k}: previous is not the H two records before`);
        states.push({ s, k, age });
        last = { s, age };
    }
    return states;
}

// --- paired and deep -------------------------------------------------------------------------

async function pairedCore(mode) {
    const t0 = Date.now();
    const runsDir = arg("--runs", null);
    const out = arg("--out", null);
    if (!runsDir || !out) fail(`${mode} needs --runs <dir> and --out <dir>`);
    const margin = requireParam("--gross-margin");
    const seeds = seedList(arg("--seeds", "1-8"));
    const sw = seedsRefusal(seeds);
    if (sw) fail(`--seeds: ${sw}`);
    const trial = process.argv.includes("--trial");
    const clipNames = list(arg("--clips", "table,wall"));
    const schedules = list(arg("--schedules", "every,device-15,device-25"));
    const S = await stepping();
    const clips = loadClips(S, clipNames);
    const runs = loadRuns(runsDir, clips, schedules, seeds);
    const opts = S.stepOptions({ ratio: RATIO });
    const rows = [];
    const deepRows = [];
    const counts = { lockStates: 0, byAge: { 0: 0, 1: 0 }, rows: 0, pairedEvents: 0, repeatRows: 0, discordantEvents: 0, reference: { with: 0, without: 0 }, deep: { carries: 0, censored: 0, censoredBy: {}, reference: { with: 0, without: 0 } } };
    const registries = new Map();
    for (const R of runs) {
        const { clip, schedule, seed, run, file } = R;
        const idx = timeline(run.frames, clip.pts);
        const stepMs = STEP_MS[schedule];
        const stepAt = (i, previous, current) => S.trackFrame(clip.frames[i], S.track, previous, current, opts, null);
        const regKey = `${clip.name}|${schedule}`;
        if (!registries.has(regKey)) registries.set(regKey, eventRegistry());
        const register = registries.get(regKey);
        const states = runStates(R);
        counts.lockStates += states.length;
        for (const { s, k, age } of states) {
            if (!(age in AGE_LEVERS)) continue;
            counts.byAge[age]++;
            const i = idx[k] % clip.pts.length;
            const previous = f64(s.Hprev);
            const current = f64(s.Hstart);
            const shipped = stepAt(i, previous, current);
            // The shipped step reproduces the run's, verdict, fit and H, and its corners the record's.
            const reproduces = shipped.ok === s.ok && (shipped.ok ? sameH(shipped.H, s.H) : shipped.loss === s.loss) && shipped.stats.inliers === s.stats.inliers && shipped.stats.rmsError === s.stats.rmsError;
            if (!reproduces) fail(`${file}: the shipped step at record ${k} does not reproduce the run's step`);
            const shippedOut = armOut(shipped, clip, i, S.targetPoints, margin);
            if (shipped.ok && JSON.stringify(shippedOut.corners) !== JSON.stringify(run.frames[k].corners)) fail(`${file}: record ${k}'s corners are not the shipped H's reprojected target corners`);
            const kd = age >= 1 ? idx[k - 2] : null;
            const state = { age, previous, current, Hchain: age === 0 && run.frames[k - 2]?.state === "DETECT" ? f64(run.frames[k - 2].H) : null, a: age === 1 ? idx[k - 1] - kd : null, b: age === 1 ? idx[k] - idx[k - 1] : null, width: clip.width, height: clip.height };
            const rMedia = age === 1 ? (clip.times[idx[k]] - clip.times[idx[k - 1]]) / (clip.times[idx[k - 1]] - clip.times[kd]) : null;
            const vStep = (Hprev, Hdet) => S.firstStep("V", clip.frames[i], S.track, { Hdet, Hprev, corr: null }, opts).r;
            for (const lever of AGE_LEVERS[age]) {
                const L = leverStep(lever, state, (p, c) => stepAt(i, p, c), vStep);
                const leverOut = armOut(L.r, clip, i, S.targetPoints, margin, { extraSteps: L.extraSteps, chargedMs: stepMs === null ? 0 : L.extraSteps * stepMs, fellBack: L.fellBack });
                const id = `${clip.name}/${schedule}/s${seed}/k${k}/${lever}`;
                const ev = register(stateKey([lever, i, s.Hprev, s.Hstart]), id);
                const discordant = shipped.ok === L.r.ok ? null : L.r.ok ? "lever-kept" : "shipped-kept";
                rows.push({ id, clip: clip.name, schedule, seed, record: k, timelineIndex: idx[k], clipFrame: i, mediaTimeSeconds: run.frames[k].mediaTimeSeconds, age, lever, eligible: L.eligible, a: state.a, b: state.b, rMedia, event: ev.event, repeats: ev.repeats, discordant, shipped: shippedOut, lever_: leverOut });
                counts.rows++;
                tallyRef(counts.reference, shippedOut.reference);
                tallyRef(counts.reference, leverOut.reference);
                if (ev.repeats) {
                    counts.repeatRows++;
                    continue;
                }
                counts.pairedEvents++;
                if (!discordant) continue;
                counts.discordantEvents++;
                if (mode !== "deep") continue;
                const keptArm = discordant === "lever-kept" ? { r: L.r, extraSteps: L.extraSteps } : { r: shipped, extraSteps: 0 };
                const need = stepsToLast(LASTING, age);
                const c = carry({ times: clip.times, n: clip.pts.length, from: idx[k], extraSteps: keptArm.extraSteps, stepMs, acquireMs: ACQUIRE_MS[clip.name], need, previous: current, current: keptArm.r.H, stepAt });
                counts.deep.carries++;
                if (c.outcome === "censored") {
                    counts.deep.censored++;
                    counts.deep.censoredBy[c.reason] = (counts.deep.censoredBy[c.reason] ?? 0) + 1;
                }
                const steps = c.steps.map((x) => {
                    const o = armOut(x.r, clip, x.i, S.targetPoints, margin);
                    tallyRef(counts.deep.reference, o.reference);
                    return { timelineIndex: x.k, clipFrame: x.i, mediaTimeSeconds: clip.pts[x.i], ...o };
                });
                deepRows.push({ event: id, clip: clip.name, schedule, seed, record: k, age, lever, direction: discordant, carriedArm: discordant === "lever-kept" ? lever : "shipped", need, outcome: c.outcome, lostAt: c.at ?? null, loss: c.loss ?? null, censoredBy: c.reason ?? null, keptSteps: c.kept, lockLength: age + 1 + c.kept, steps });
            }
        }
    }
    const params = { grossMargin: margin, seeds, schedules, levers: AGE_LEVERS };
    const head = header(mode, { clips, params, trial });
    const seconds = (Date.now() - t0) / 1000;
    if (mode === "paired") writeOut(out, mode, head, rows, { ...counts, deep: undefined, seconds });
    else writeOut(out, mode, head, deepRows, { lockStates: counts.lockStates, pairedEvents: counts.pairedEvents, discordantEvents: counts.discordantEvents, ...counts.deep, seconds });
}

// --- m9 --------------------------------------------------------------------------------------

async function m9Mode() {
    const t0 = Date.now();
    const out = arg("--out", null);
    if (!out) fail("m9 needs --out <dir>");
    const threshold = requireParam("--repro-threshold");
    const margin = requireParam("--gross-margin");
    const trial = process.argv.includes("--trial");
    const dir = join(ROOT, "docs/benchmarks");
    const names = readdirSync(dir).filter((n) => /^2026-11-12-tab9-m9-(table|wall)-\d+\.json$/.test(n)).sort();
    const byClip = { table: names.filter((n) => n.includes("-table-")), wall: names.filter((n) => n.includes("-wall-")) };
    if (names.length !== 16 || byClip.table.length !== 8 || byClip.wall.length !== 8) fail(`m9: ${names.length} exports (table ${byClip.table.length}, wall ${byClip.wall.length}), expected 16, 8 each`);
    const S = await stepping();
    const clips = loadClips(S, ["table", "wall"]);
    const opts = S.stepOptions({ ratio: RATIO });
    // Every export guarded before any row: its clip, its size, every record placed on a clip frame.
    const exports = names.map((n) => {
        const e = JSON.parse(readFileSync(join(dir, n), "utf8"));
        const clip = clips.find((c) => c.file === e.bundledClip);
        if (!clip) fail(`${n}: bundled clip ${e.bundledClip} is neither table's nor wall's`);
        if (e.processingResolution?.width !== clip.width || e.processingResolution?.height !== clip.height) fail(`${n}: processed at ${JSON.stringify(e.processingResolution)}, the desktop decodes ${clip.width}x${clip.height}`);
        if (e.detection?.path !== "sync") fail(`${n}: detection path ${e.detection?.path}, not sync: its locks are not the tracker's own detections`);
        const why = m9PlaceRefusal(e.frames, clip.pts, n);
        if (why) fail(why);
        return { n, e, clip };
    });
    const rows = [];
    const counts = { exports: 16, steps: 0, states: 0, mapped: 0, byClass: { kept: { states: 0, reproduced: 0 }, lost: { states: 0, reproduced: 0 } }, age1: 0, age1Reproduced: 0, leverRows: 0, reference: { with: 0, without: 0 } };
    for (const { n, e, clip } of exports) {
        const F = e.frames;
        const ix = framesAt(clip.pts, F.map((f) => f.mediaTimeSeconds));
        const t = F.map((f, k) => f.mediaTimeSeconds);
        let loop = 0;
        const idx = ix.map((i, k) => {
            if (k > 0 && t[k] < t[k - 1]) loop++;
            return loop * clip.pts.length + i;
        });
        const unwrapped = idx.map((x) => clip.pts[x % clip.pts.length] + Math.floor(x / clip.pts.length) * clip.period);
        const stepAt = (i, previous, current) => S.trackFrame(clip.frames[i], S.track, previous, current, opts, null);
        const register = eventRegistry();
        F.forEach((rec, k) => {
            if (!rec.tracking) return;
            counts.steps++;
            let age = 0;
            let j = k - 1;
            while (j >= 0 && F[j].state === "TRACK") {
                age++;
                j--;
            }
            if (j < 0 || F[j].state !== "DETECT") fail(`${n}: the step at record ${k} is in a lock no detection started`);
            if (age < 1) return;
            counts.states++;
            const i = ix[k];
            counts.mapped++;
            const previous = f64(F[k - 2].H);
            const current = f64(F[k - 1].H);
            const desktop = stepAt(i, previous, current);
            const device = { kept: rec.state === "TRACK", loss: rec.state === "TRACK" ? null : rec.trackLoss ?? null, corners: rec.corners ?? null };
            const desk = armOut(desktop, clip, i, S.targetPoints, margin);
            const cls = m9Classify(device, desk, threshold);
            const klass = device.kept ? "kept" : "lost";
            counts.byClass[klass].states++;
            if (cls.reproduced) counts.byClass[klass].reproduced++;
            if (age === 1) {
                counts.age1++;
                if (cls.reproduced) counts.age1Reproduced++;
            }
            const a = age === 1 ? idx[k - 1] - idx[k - 2] : null;
            const b = age === 1 ? idx[k] - idx[k - 1] : null;
            const state = { age, previous, current, Hchain: null, a, b, width: clip.width, height: clip.height };
            const base = { export: n, clip: clip.name, record: k, timelineIndex: idx[k], clipFrame: i, mediaTimeSeconds: rec.mediaTimeSeconds, age, a, b, rMedia: age === 1 ? (unwrapped[k] - unwrapped[k - 1]) / (unwrapped[k - 1] - unwrapped[k - 2]) : null, device: { ...device, reference: refCell(clip, i, device.corners, device.kept, margin) }, desktop: desk };
            const leverRow = (lever) => {
                const L = leverStep(lever, state, (p, c) => stepAt(i, p, c), null);
                const ev = register(stateKey([lever, i, F[k - 2].H, F[k - 1].H]), `${n}/k${k}/${lever}`);
                // No schedule here: the device's frames are the device's; Ffb's second alignment is recorded, not charged.
                const o = armOut(L.r, clip, i, S.targetPoints, margin, { extraSteps: L.extraSteps, fellBack: L.fellBack });
                tallyRef(counts.reference, o.reference);
                return { kind: "lever", export: n, clip: clip.name, record: k, clipFrame: i, age, lever, event: ev.event, repeats: ev.repeats, discordant: desk.kept === L.r.ok ? null : L.r.ok ? "lever-kept" : "shipped-kept", lever_: o };
            };
            const { row, levers } = m9StateRows(base, cls, leverRow);
            tallyRef(counts.reference, row.device.reference);
            tallyRef(counts.reference, row.desktop.reference);
            rows.push({ kind: "state", ...row });
            for (const L of levers) rows.push(L);
            counts.leverRows += levers.length;
        });
    }
    const head = header("m9", { clips, params: { reproThreshold: threshold, grossMargin: margin, reproMeasure: "verdict class equal, and where both kept the mean corner distance of the desktop's output to the record's corners at most reproThreshold px", levers: { 1: AGE_LEVERS[1] } }, trial });
    writeOut(out, "m9", head, rows, { ...counts, seconds: (Date.now() - t0) / 1000 });
}

// --- wrong -----------------------------------------------------------------------------------

/** #273's truth script's sequences (`2026-11-14-272-stage1-truth.mjs`, `SEQS`; it runs on import, so they are listed here, as named there). */
const SEQUENCES = (seq) => [
    ["wander", seq.wander, 40],
    ["leaveAndReturn", seq.leaveAndReturn, 106],
    ["settlePath", seq.settlePath, 80],
    ["restPath", seq.restPath, 60],
    ...[2, 3, 4, 5, 6, 8, 10].map((v) => [`velocityStep(${v})`, seq.velocityStep(v), 20]),
];
/** A frame mirrored left to right, as #273's runner mirrors it (`mirrored`, not exported there); checked by the shipped step reproducing the mirrored run's. */
function mirrored(f) {
    const data = new Uint8Array(f.data.length);
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) data[y * f.width + x] = f.data[y * f.width + (f.width - 1 - x)];
    return { data, width: f.width, height: f.height };
}

async function wrongMode() {
    const t0 = Date.now();
    const runsDir = arg("--runs", null);
    const out = arg("--out", null);
    if (!runsDir || !out) fail("wrong needs --runs <dir> (the mirrored runs) and --out <dir>");
    const seeds = seedList(arg("--seeds", "1-8"));
    const trial = process.argv.includes("--trial");
    const clipNames = list(arg("--clips", "table,wall"));
    let seq;
    try {
        seq = await load("packages/nft-tracker/ground-truth/tracker_sequences.ts");
    } catch (e) {
        fail(`wrong: the ground truth's sequences do not load (run with node --experimental-transform-types): ${e.message}`);
    }
    const S = await stepping();
    const clips = loadClips(S, clipNames);
    const runs = loadRuns(runsDir, clips, ["every"], seeds, "mirror");
    const rows = [];
    const tally = {};
    const count = (set, lever, age, kept, wrong) => {
        const k = `${set}|${lever}|${age}`;
        tally[k] ??= { set, lever, age, states: 0, confirmed: 0, wrong: 0 };
        tally[k].states++;
        if (kept) tally[k].confirmed++;
        if (wrong) tally[k].wrong++;
    };
    const counts = { sequences: { lockStates: 0, byAge: { 0: 0, 1: 0 } }, mirror: { lockStates: 0, byAge: { 0: 0, 1: 0 } } };

    // The synthetic sequences: the ground truth's own run, its states rebuilt from its results.
    const { cv, target } = S.arm;
    const K = S.intrinsics(seq.CAMERA.width, seq.CAMERA.height);
    const sOpts = S.stepOptions({});
    for (const [name, path, n] of SEQUENCES(seq)) {
        const { value: g, reads } = S.countGlobalRandomReads(() => seq.run(cv, K, target, path, n));
        if (reads !== 0) fail(`wrong ${name}: ${reads} read(s) of the global Math.random`);
        const res = g.results;
        res.forEach((r, k) => {
            if (!r.tracking) return;
            let age = 0;
            let j = k - 1;
            while (j >= 0 && res[j].state === "TRACK") {
                age++;
                j--;
            }
            if (j < 0 || res[j].state !== "DETECT") fail(`wrong ${name}: the step at frame ${k} is in a lock no detection started`);
            counts.sequences.lockStates++;
            if (!(age in AGE_LEVERS)) return;
            counts.sequences.byAge[age]++;
            const { frame, H: T } = seq.frameAt(path(k), k);
            const previous = age >= 1 ? f64(res[k - 2].H) : null;
            const current = f64(res[k - 1].H);
            const stepAt = (p, c) => S.trackFrame(frame, S.track, p, c, sOpts, null);
            const shipped = stepAt(previous, current);
            const kept = r.state === "TRACK";
            if (shipped.ok !== kept || (kept && !sameH(shipped.H, r.H))) fail(`wrong ${name}: the shipped step at frame ${k} does not reproduce the ground truth's run`);
            const score = (x) => (x.ok ? seq.inView(x.H, T).rms : null);
            const state = { age, previous, current, Hchain: age === 0 && res[k - 2]?.state === "DETECT" ? f64(res[k - 2].H) : null, a: age === 1 ? 1 : null, b: age === 1 ? 1 : null, width: frame.width, height: frame.height };
            const vStep = (Hprev, Hdet) => S.firstStep("V", frame, S.track, { Hdet, Hprev, corr: null }, sOpts).r;
            const sScore = score(shipped);
            count("sequences", "shipped", age, shipped.ok, shipped.ok && sScore > WRONG_PX);
            for (const lever of AGE_LEVERS[age]) {
                const L = leverStep(lever, state, stepAt, vStep);
                const ls = score(L.r);
                count("sequences", lever, age, L.r.ok, L.r.ok && ls > WRONG_PX);
                rows.push({ set: "sequence", name, frame: k, age, lever, eligible: L.eligible, shipped: { kept: shipped.ok, score: sScore, wrong: shipped.ok && sScore > WRONG_PX }, lever_: { kept: !!L.r.ok, loss: L.r.ok ? null : L.r.loss, score: ls, wrong: !!L.r.ok && ls > WRONG_PX, fellBack: L.fellBack } });
            }
        });
    }

    // #273's mirrored frames: every confirmed step is wrong.
    const mOpts = S.stepOptions({ ratio: RATIO });
    const mirroredFrames = new Map(clips.map((c) => [c.name, c.frames.map(mirrored)]));
    for (const R of runs) {
        const { clip, seed, run, file } = R;
        const idx = timeline(run.frames, clip.pts);
        const frames = mirroredFrames.get(clip.name);
        const states = runStates(R);
        counts.mirror.lockStates += states.length;
        for (const { s, k, age } of states) {
            if (!(age in AGE_LEVERS)) continue;
            counts.mirror.byAge[age]++;
            const i = idx[k] % clip.pts.length;
            const stepAt = (p, c) => S.trackFrame(frames[i], S.track, p, c, mOpts, null);
            const previous = f64(s.Hprev);
            const current = f64(s.Hstart);
            const shipped = stepAt(previous, current);
            if (shipped.ok !== s.ok || (s.ok && !sameH(shipped.H, s.H)) || (!s.ok && shipped.loss !== s.loss)) fail(`${file}: the shipped step at record ${k} does not reproduce the mirrored run's`);
            const state = { age, previous, current, Hchain: age === 0 && run.frames[k - 2]?.state === "DETECT" ? f64(run.frames[k - 2].H) : null, a: age === 1 ? idx[k - 1] - idx[k - 2] : null, b: age === 1 ? idx[k] - idx[k - 1] : null, width: clip.width, height: clip.height };
            const vStep = (Hprev, Hdet) => S.firstStep("V", frames[i], S.track, { Hdet, Hprev, corr: null }, mOpts).r;
            count(`mirror-${clip.name}`, "shipped", age, shipped.ok, shipped.ok);
            for (const lever of AGE_LEVERS[age]) {
                const L = leverStep(lever, state, stepAt, vStep);
                count(`mirror-${clip.name}`, lever, age, L.r.ok, !!L.r.ok);
                rows.push({ set: "mirror", clip: clip.name, seed, record: k, clipFrame: i, age, lever, eligible: L.eligible, shipped: { kept: shipped.ok, wrong: shipped.ok }, lever_: { kept: !!L.r.ok, loss: L.r.ok ? null : L.r.loss, wrong: !!L.r.ok, fellBack: L.fellBack } });
            }
        }
    }
    const head = header("wrong", { clips, params: { wrongPx: WRONG_PX, wrongSource: `${ANALYSIS_REL}, truthReport's RIGHT: a confirmed step whose output H is more than RIGHT px RMS off the truth (inView); ${TRUTH_REL}'s header`, seeds, sequences: SEQUENCES(seq).map(([nm, , n]) => `${nm} (${n})`) }, trial });
    writeOut(out, "wrong", head, [...rows, { kind: "per-lever-and-age", cells: Object.values(tally) }], { ...counts, seconds: (Date.now() - t0) / 1000 });
}

// --- self-test -------------------------------------------------------------------------------

function selfTest() {
    const fails = [];
    const T = (name, ok) => ok || fails.push(name);

    // The guards, each on a case where it must fire and one where it must not.
    T("seeds 1 to 8 pass", seedsRefusal(SEEDS) === null);
    T("a missing seed is refused", seedsRefusal([1, 2, 3, 4, 5, 6, 7]) !== null);
    T("a duplicate seed is refused", seedsRefusal([1, 2, 3, 4, 5, 6, 7, 8, 8]) !== null);
    T("a required parameter given passes", paramRefusal("1.5", "--repro-threshold") === null);
    T("a missing reproduction threshold is refused", paramRefusal(undefined, "--repro-threshold") !== null);
    T("a missing gross margin is refused", paramRefusal(undefined, "--gross-margin") !== null);
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const ref = { sourceSha256: "abc", rows: [{ i: 0, t: 0, status: "accepted", corners: q }, { i: 1, t: 0.04, status: "touches-border", corners: null }] };
    T("a matching reference passes", referenceGuard({ exists: true, name: "r", loaded: { ref }, clipSha256: "abc", pts: [0, 0.04] }) === null);
    T("a missing reference file is refused", referenceGuard({ exists: false, name: "r", loaded: null, clipSha256: "abc", pts: [0, 0.04] }) !== null);
    T("a reference whose source SHA-256 is not the clip's is refused", referenceGuard({ exists: true, name: "r", loaded: { ref }, clipSha256: "abd", pts: [0, 0.04] }) !== null);
    const pts = [0, 0.04, 0.08];
    const fr = (ts) => ts.map((t) => ({ mediaTimeSeconds: t }));
    T("an every run on the clip's frames passes", runFramesRefusal(fr([0, 0.04, 0.08, 0, 0.04, 0.08]), pts, "every", 2) === null);
    T("a record with no clip frame at its media time is refused", runFramesRefusal(fr([0, 0.05, 0.08, 0, 0.04, 0.08]), pts, "device-15", 2) !== null);
    T("an every run of another frame count is refused", runFramesRefusal(fr([0, 0.04, 0.08, 0, 0.04]), pts, "every", 2) !== null);
    T("an every run that skips a clip frame is refused", runFramesRefusal(fr([0, 0.08, 0.08, 0, 0.04, 0.08]), pts, "every", 2) !== null);
    T("a device run on fewer of the clip's frames passes", runFramesRefusal(fr([0, 0.08, 0.04]), pts, "device-25", 2) === null);
    T("M9 states on the clip's frames pass", m9PlaceRefusal(fr([0, 0.04, 0.08]), pts, "e") === null);
    T("an M9 state the mapping cannot place is refused", m9PlaceRefusal(fr([0, 0.06]), pts, "e") !== null);
    T("readConstant reads one literal", readConstantFrom("const A = 50;\n", "A", "f").value === 50);
    T("readConstant refuses a missing declaration", readConstantFrom("const B = 50;\n", "A", "f").why !== undefined);
    T("readConstant refuses two declarations", readConstantFrom("const A = 1;\nconst A = 2;\n", "A", "f").why !== undefined);
    T("readConstant reads an object literal", readConstantFrom('const S = { every: null, "device-15": 15 };\n', "S", "f").value["device-15"] === 15);

    // Fs is the shipped step on every (intervals 1 and 1), and something else where they differ.
    const P0 = new Float64Array([1, 0.02, 3, -0.01, 1.01, 2, 1e-5, 2e-5, 1]);
    const C0 = new Float64Array([1.01, 0.03, 7, -0.012, 1.02, 4, 1e-5, 2.5e-5, 1]);
    const calls = [];
    const fake = (p, c) => {
        calls.push([p, c]);
        return { ok: true, H: c, stats: { inliers: 10, rmsError: 0.1 } };
    };
    const shippedR = fake(P0, C0);
    const st = (a, b) => ({ age: 1, previous: P0, current: C0, Hchain: null, a, b, width: 480, height: 270 });
    calls.length = 0;
    const fsEvery = leverStep("Fs", st(1, 1), fake, null);
    T("Fs on every calls the shipped step with the shipped state", calls.length === 1 && calls[0][0] === P0 && calls[0][1] === C0);
    T("Fs on every gives the shipped step's result", sameH(fsEvery.r.H, shippedR.H) && fsEvery.extraSteps === 0);
    calls.length = 0;
    leverStep("Fs", st(4, 1), fake, null);
    T("Fs on a device interval (4 measured, 1 applied) steps from a scaled prediction", calls.length === 1 && calls[0][0] === null && !sameH(calls[0][1], C0));
    // M^r itself: r = 1 is M, r = 2 is M·M, two halves are M, a translation scales.
    const M = mul3(C0, inv3(P0));
    const nM = (A) => scale3(A, 1 / A[8]);
    const close = (A, B, tol) => nM(A).every((v, i) => Math.abs(v - nM(B)[i]) <= tol * (1 + Math.abs(nM(B)[i])));
    T("powH(M, 1) is M", close(powH(M, 1, 480, 270), M, 1e-9));
    T("powH(M, 2) is M·M", close(powH(M, 2, 480, 270), mul3(M, M), 1e-9));
    T("powH(M, 1/2) twice is M", close(mul3(powH(M, 0.5, 480, 270), powH(M, 0.5, 480, 270)), M, 1e-9));
    const tr = powH(new Float64Array([1, 0, 12, 0, 1, -8, 0, 0, 1]), 0.25, 480, 270);
    T("powH of a translation by 1/4 is a quarter of it", Math.abs(tr[2] / tr[8] - 3) < 1e-9 && Math.abs(tr[5] / tr[8] + 2) < 1e-9);

    // Ffb: the shipped step when it keeps; F0's on a refusal, charged a second step on a device schedule only.
    const refuseFirst = () => {
        let n = 0;
        return (p, c) => (n++ === 0 ? { ok: false, loss: "poor-fit", stats: { inliers: 3, rmsError: 1 } } : { ok: true, H: c, stats: { inliers: 9, rmsError: 0.2 } });
    };
    const fb = leverStep("Ffb", st(1, 1), refuseFirst(), null);
    T("Ffb falls back to F0's step on a refusal", fb.fellBack && fb.r.ok && fb.extraSteps === 1);
    T("Ffb keeps the shipped step when it confirms", leverStep("Ffb", st(1, 1), fake, null).extraSteps === 0);
    const times = loopTimes(Array.from({ length: 30 }, (_, i) => i / 30), 2);
    T("a charged second step moves the next frame on a device schedule", nextProcessed(times, 0, 25, 20.4, 1) > nextProcessed(times, 0, 25, 20.4, 0));
    T("a charged second step moves nothing on every", nextProcessed(times, 0, null, 20.4, 1) === 1 && nextProcessed(times, 0, null, 20.4, 0) === 1);

    // deep: carried N steps, lost before N, censored at the loop's and the run's end.
    const keepAll = (i, p, c) => ({ ok: true, H: c, loss: null });
    const loseAt = (m) => {
        let n = 0;
        return (i, p, c) => (++n === m ? { ok: false, loss: "too-few-patches" } : { ok: true, H: c });
    };
    const base = { times, n: 30, extraSteps: 0, stepMs: null, acquireMs: 20.4, previous: P0, current: C0 };
    T("stepsToLast: N − (age + 1)", stepsToLast(50, 0) === 49 && stepsToLast(50, 1) === 48);
    const lasted = carry({ ...base, from: 2, need: 5, stepAt: keepAll });
    T("a discordant event carried N steps lasts", lasted.outcome === "lasted" && lasted.kept === 5 && lasted.steps.length === 5);
    const lost = carry({ ...base, from: 2, need: 5, stepAt: loseAt(3) });
    T("a discordant event lost before N is lost at its step", lost.outcome === "lost" && lost.at === 3 && lost.kept === 2);
    const atLoop = carry({ ...base, from: 27, need: 5, stepAt: keepAll });
    T("a carry reaching the loop's end is censored there", atLoop.outcome === "censored" && atLoop.reason === "loop end" && atLoop.kept === 2);
    const atEnd = carry({ ...base, from: 57, need: 5, stepAt: keepAll });
    T("a carry reaching the run's end is censored there", atEnd.outcome === "censored" && atEnd.reason === "run end" && atEnd.kept === 2);
    const dev = carry({ ...base, from: 0, need: 3, stepAt: keepAll, stepMs: 25, extraSteps: 1 });
    T("a device carry follows replay-run's timing, the paired step's charge included", dev.steps[0].k === nextFrameIndex(times, 0, 20.4 + 50) && dev.steps[1].k === nextFrameIndex(times, dev.steps[0].k, 20.4 + 25));

    // A repeated state is marked with the event it repeats, not counted twice.
    const reg = eventRegistry();
    const e1 = reg("k", "first");
    const e2 = reg("k", "second");
    const e3 = reg("other", "third");
    T("a repeated state is marked as repeating its event", !e1.repeats && e2.repeats && e2.event === "first");
    T("a distinct state is its own event", !e3.repeats && e3.event === "third");

    // M9: a recorded state that does not reproduce is reported as such and gets no lever rows.
    const st1 = { age: 1, previous: P0, current: C0, a: 4, b: 1, width: 480, height: 270 };
    const leverRows = [];
    const lr = (l) => (leverRows.push(l), { lever: l });
    const keptDev = { kept: true, corners: q };
    const far = m9StateRows(st1, m9Classify(keptDev, { kept: true, corners: q.map(([x, y]) => [x + 5, y]) }, 1), lr);
    T("a state beyond the reproduction threshold is reported not reproduced", far.row.reproduced === false && far.row.distance === 5);
    T("a state that does not reproduce gets no lever rows", far.levers.length === 0 && leverRows.length === 0);
    const flip = m9StateRows(st1, m9Classify({ kept: false, corners: null }, { kept: true, corners: q }, 1), lr);
    T("a state whose verdict class differs is reported not reproduced", flip.row.reproduced === false && flip.row.verdictMatch === false && flip.levers.length === 0);
    const near = m9StateRows(st1, m9Classify(keptDev, { kept: true, corners: q.map(([x, y]) => [x + 0.5, y]) }, 1), lr);
    T("a state within the threshold reproduces and gets F0, Fs and Ffb rows", near.row.reproduced === true && near.levers.length === 3);

    if (fails.length) {
        console.error(`self-test: ${fails.length} failed\n${fails.join("\n")}`);
        process.exit(1);
    }
    console.log("self-test: passed");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [mode] = process.argv.slice(2);
    if (mode === "--self-test") selfTest();
    else if (mode === "paired" || mode === "deep") await pairedCore(mode);
    else if (mode === "m9") await m9Mode();
    else if (mode === "wrong") await wrongMode();
    else fail("mode: paired | deep | m9 | wrong | --self-test");
}
