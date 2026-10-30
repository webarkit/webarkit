/*
 *  bench-params.mjs
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
 * The page's URL parameters, the tracker options a tuning run may override,
 * and why the page must not start a run (`startRefusal`).
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, under the same name.
 */

/** The page's modes, as its `<select>` and the `?mode=` parameter name them. */
export const MODES = Object.freeze(["stateless", "detection-only", "tracking"]);

/** Where a run's detection happens, as `?detection=` names it: see `DEFINITIONS.detectionPath`. */
export const DETECTION_PATHS = Object.freeze(["sync", "worker"]);

/**
 * A positive integer from `raw`, or `null` for anything else (empty, `abc`,
 * `0`, `-5`, `1e999`), so a malformed URL parameter or an emptied field falls
 * back to its default rather than reaching `detect` or the canvas as `NaN`.
 */
export function parsePositiveInt(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * The run parameters `search` (a URL's query string) sets, each `null` when
 * absent or out of its domain: `?maxKeypoints=`, `?procWidth=`,
 * `?procHeight=`, `?camera=rear|front` (as a `facingMode`),
 * `?mode=stateless|detection-only|tracking`, `?target=image|wnft`, `?window=`
 * (clamped to 10–2000 frames) and `?clip=` (one of `bundledClips`). Tracking
 * needs patches, which only the file carries, so `mode=tracking` defaults the
 * target to `"wnft"`; an explicit `target=image` is kept, and Start refuses it.
 *
 * Two more, for the tuning pass, and handled the other way: `?targetFile=`
 * (a candidate `.wnft` under `examples/targets/tuning/`, which is never
 * committed, in place of `targets/pinball.wnft`) and `?tracker=` (tracker
 * option overrides, {@link parseTrackerOverrides}). One of those out of its
 * domain is **not** dropped: it goes in `paramErrors`, which the page shows
 * and refuses to start on. Dropping it would run the defaults under a URL
 * that names a candidate — an export labelled with parameters it did not run
 * with, the one failure a tuning round cannot afford.
 *
 * The worker path's three are handled the same way, for the same reason: a
 * run that fell back to `sync` under a URL that asked for the worker would be
 * exported as what it was not. `?detection=` is one of
 * {@link DETECTION_PATHS} and is `"sync"` when absent, and `?loops=` (the
 * clip loops a run lasts) and `?run=` (its place in the session's order) are
 * positive integers, `null` when absent; one present and unreadable goes in
 * `paramErrors`.
 */
export function parseRunParams(search, { bundledClips }) {
    const p = new URLSearchParams(search);
    const mode = MODES.includes(p.get("mode")) ? p.get("mode") : null;
    const t = p.get("target");
    const windowSize = parsePositiveInt(p.get("window"));
    const camera = p.get("camera");
    const paramErrors = [];
    const rawFile = p.get("targetFile");
    let targetFile = null;
    if (rawFile !== null) {
        if (TUNING_TARGET.test(rawFile)) targetFile = rawFile;
        else
            paramErrors.push(
                `?targetFile=${rawFile}: a candidate target must be tuning/<name>.wnft, one file directly under examples/targets/tuning/.`,
            );
    }
    const overrides = parseTrackerOverrides(p.get("tracker"));
    if (!overrides.ok) paramErrors.push(`?tracker=: ${overrides.error}`);
    const rawDetection = p.get("detection");
    let detection = "sync";
    if (rawDetection !== null) {
        if (DETECTION_PATHS.includes(rawDetection)) detection = rawDetection;
        else
            paramErrors.push(
                `?detection=${rawDetection}: expected ${DETECTION_PATHS.join(" or ")}`,
            );
    }
    const positive = (name) => {
        const raw = p.get(name);
        // Digits only: ?loops=4.7 (or 0x4, 1e1) is present but unreadable,
        // never 4 loops.
        const n = /^\s*\d+\s*$/.test(raw ?? "") ? parsePositiveInt(raw) : null;
        if (raw !== null && n === null)
            paramErrors.push(`?${name}=${raw}: expected a positive integer`);
        return n;
    };
    const loops = positive("loops");
    const run = positive("run");
    return {
        maxKeypoints: parsePositiveInt(p.get("maxKeypoints")),
        procWidth: parsePositiveInt(p.get("procWidth")),
        procHeight: parsePositiveInt(p.get("procHeight")),
        camera: camera === "front" ? "user" : camera === "rear" ? "environment" : null,
        mode,
        target: t === "image" || t === "wnft" ? t : mode === "tracking" ? "wnft" : null,
        windowSize: windowSize === null ? null : Math.min(2000, Math.max(10, windowSize)),
        clip: bundledClips.includes(p.get("clip")) ? p.get("clip") : null,
        targetFile,
        trackerOverrides: overrides.ok ? overrides.options : {},
        detection,
        loops,
        run,
        paramErrors,
    };
}

/**
 * A candidate target's path under `examples/targets/`: `tuning/<name>.wnft`,
 * one plain file name, no directory and no leading dot, so the page can only
 * fetch from the git-ignored scratch directory.
 */
const TUNING_TARGET = /^tuning\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.wnft$/;

/**
 * The `NftTracker` options a tuning run may override: the tracking state's,
 * every one. The detection options are not here — the page sets
 * `maxSceneKeypoints` from `?maxKeypoints=`, and the rest are not what the
 * tuning pass tunes. Domains are the tracker's, checked by its constructor,
 * which throws a `RangeError` naming the option; this only reads the text.
 */
export const TUNABLE_TRACKER_OPTIONS = Object.freeze([
    "maxFrameLevels",
    "alignMaxIterations",
    "alignEpsilon",
    "photometric",
    "tukeyC",
    "fitMaxIterations",
    "fitEpsilon",
    "minTrackedPatches",
    "maxOutlierShare",
    "maxFitRms",
    "minPatchZncc",
]);

const integerFrom = (lo, hi = Infinity) => ({
    test: (v) => Number.isInteger(v) && v >= lo && v <= hi,
    text: hi === Infinity ? `an integer ≥ ${lo}` : `an integer in [${lo}, ${hi}]`,
});
const POSITIVE = { test: (v) => v > 0, text: "finite and > 0" };
const FRACTION = { test: (v) => v >= 0 && v < 1, text: "in [0, 1)" };

/**
 * Each numeric override's domain, as `NftTracker`'s constructor checks it
 * (`resolveTrackingOptions` in packages/nft-tracker/src/tracker.ts). Checked
 * here too so the page refuses Start before any source starts, in every mode:
 * left to the tracker, a value out of its domain started the clip before the
 * constructor threw, and a stateless run ignored it silently.
 */
const OVERRIDE_DOMAINS = Object.freeze({
    maxFrameLevels: integerFrom(1, 256),
    alignMaxIterations: integerFrom(1),
    alignEpsilon: POSITIVE,
    tukeyC: POSITIVE,
    fitMaxIterations: integerFrom(1),
    fitEpsilon: POSITIVE,
    minTrackedPatches: integerFrom(4),
    maxOutlierShare: FRACTION,
    maxFitRms: POSITIVE,
    minPatchZncc: FRACTION,
});

/**
 * Tracker option overrides from `key:value` pairs separated by commas —
 * `minTrackedPatches:6,alignEpsilon:0.03` — as the page's `?tracker=` and the
 * replay's `--options` take them: `{ ok: true, options }`, empty for no text,
 * or `{ ok: false, error }` naming the first thing wrong. Keys are
 * {@link TUNABLE_TRACKER_OPTIONS}; values are numbers in the tracker's own
 * domain for that option, and `true` or `false` for `photometric`.
 */
export function parseTrackerOverrides(raw) {
    const options = {};
    if (raw === null || raw === undefined || String(raw).trim() === "")
        return { ok: true, options };
    for (const part of String(raw).split(",")) {
        const pair = part.trim();
        const colon = pair.indexOf(":");
        if (colon < 0) return { ok: false, error: `"${pair}" is not key:value` };
        const key = pair.slice(0, colon).trim();
        const text = pair.slice(colon + 1).trim();
        if (!TUNABLE_TRACKER_OPTIONS.includes(key)) {
            return {
                ok: false,
                error: `unknown option "${key}"; one of ${TUNABLE_TRACKER_OPTIONS.join(", ")}`,
            };
        }
        if (Object.hasOwn(options, key)) return { ok: false, error: `"${key}" given twice` };
        if (key === "photometric") {
            if (text !== "true" && text !== "false") {
                return { ok: false, error: `photometric is true or false, got "${text}"` };
            }
            options[key] = text === "true";
            continue;
        }
        const value = text === "" ? NaN : Number(text);
        if (!Number.isFinite(value)) {
            return { ok: false, error: `${key}: "${text}" is not a finite number` };
        }
        const domain = OVERRIDE_DOMAINS[key];
        if (!domain.test(value)) {
            return { ok: false, error: `${key} must be ${domain.text}, got ${text}` };
        }
        options[key] = value;
    }
    return { ok: true, options };
}

/**
 * The committed target, as the page names it: the file a run loads with no
 * `?targetFile=`, and the one a session run tracks ({@link sessionRunGaps}).
 */
export const DEFAULT_TARGET_FILE = "targets/pinball.wnft";

/**
 * Why `NftTracker` would run detection-only on `db` — the constructor's rule:
 * no patches, patches under 3 × 3, or fewer than `minTrackedPatches` — or
 * `null` when it would track. The page checks this before starting a
 * tracking run, so a run is never exported as tracking while it detects.
 */
export function trackabilityError(db, minTrackedPatches) {
    const p = db.patches;
    const use = `choose ${DEFAULT_TARGET_FILE}`;
    if (!p) return `Tracking needs a target with patches, and this one has no patches: ${use}.`;
    if (p.patchSize < 3)
        return `This target's patches are ${p.patchSize} × ${p.patchSize}, and alignPatch needs at least 3 × 3: ${use}.`;
    if (p.count < minTrackedPatches) {
        return `This target has ${p.count} patches, fewer than minTrackedPatches (${minTrackedPatches}): ${use}.`;
    }
    return null;
}

/**
 * Why the page must not start a run, or `null` when it may: a mode that is
 * not one of {@link MODES} (a script that set `#mode` to a value the page no
 * longer has, such as the old `tracker`, leaves the select empty), a target
 * that did not load, or a tracking run on a target the tracker would not
 * track (`trackabilityError`). Checked before any source starts. `file` is
 * the target file the page tried to load, for the message, and `loadFailure`
 * why it did not load, when the page knows: named here, since the page clears
 * its error line at Start, and a message pointing above it would point at
 * nothing.
 *
 * Three more refusals for the worker's run parameters, none of which applies
 * to a caller that passes none of them: `detection` `"worker"` outside the
 * tracking mode, or on a `target` that is not the `.wnft` (its
 * `record.source`, from {@link targetRecord}: the worker decodes the file's
 * bytes, and the page's built image target has none); and `loops` on a
 * `source` (the media source, `"webcam"` among them) that does not loop.
 */
export function startRefusal({
    mode,
    target,
    minTrackedPatches,
    file = DEFAULT_TARGET_FILE,
    loadFailure = null,
    detection = "sync",
    source = null,
    loops = null,
}) {
    if (!MODES.includes(mode)) return `Unknown mode "${mode}": choose one of ${MODES.join(", ")}.`;
    if (!target) {
        return loadFailure
            ? `${file} could not be loaded (${loadFailure}).`
            : `${file} is not loaded.`;
    }
    if (detection === "worker") {
        if (mode !== "tracking") return "?detection=worker runs in tracking mode only.";
        if (target.record?.source !== "wnft") {
            return "?detection=worker needs the .wnft target: the worker decodes its bytes.";
        }
    }
    if (loops !== null && source === "webcam")
        return "?loops= needs a looping clip, not the webcam.";
    return mode === "tracking" ? trackabilityError(target.db, minTrackedPatches) : null;
}
