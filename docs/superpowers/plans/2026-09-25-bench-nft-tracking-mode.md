# bench-nft tracking mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `examples/bench-nft.html` a tracking mode beside stateless and detection-only, make ADR-0001 point 5's figure (tracker-side TypeScript compute in the tracking state, against 8 ms p95) directly readable from a run, and write the on-device measurement plan into `docs/benchmarks/README.md` before any device run.

**Architecture:** One pure ES module, `examples/js/bench-metrics.mjs`, holds every run metric and its definition, plus the page's URL and target logic and the replay's schedule logic, tested with Vitest under `examples/test/`. The page, a comparison CLI (`scripts/compare-bench.mjs`) and a desktop replay (`scripts/replay-clips.mjs`) all import it, so an export, a comparison and a replay cannot mean different things by one name. The page loads `examples/targets/pinball.wnft` for tracking, records the tracker's own per-frame fields verbatim, and adds a run summary and an on-device frame-pyramid probe. Nothing under `packages/` changes: every per-frame field the brief asks for is already in `TrackResult`, `TrackTimings` and `TrackStats`.

**Tech Stack:** Plain ES modules (no bundler, import map), Vitest 4.1 (already hoisted; declared at the root by this plan), Node 24, ffmpeg/ffprobe for the desktop pre-flight only.

**Spec:** the brief, verbatim in [Appendix A](#appendix-a--the-brief-verbatim) — the binding authority this plan argues from.

**Planning evidence:** a desktop replay of every bundled-clip frame through `NftTracker` (scratch scripts, 2026-09-25), then an adversarial review of the first draft of this plan by four independent reviewers (brief compliance, code against the repository, measurement soundness, and a dry run of Tasks 1–4's tests: all passed as written). This revision answers every Critical and Important finding; the ones that changed the design are marked **(review)** below. Tasks 1–4's code and tests, assembled from this plan as written, pass (64 of 64), and Task 6's replay script, run as written, reproduces the planning numbers within RANSAC's run-to-run variation.

---

## Decisions for review (made here; flagged because they are yours)

Each was ruled on with evidence; the plan implements the ruling shown. Say so if you want another.

**D1. "Jitter" is measured within one-second windows, detrended — and the brief's standard deviation is reported beside it, untested. (review)** The brief defines jitter as "the standard deviation, in pixels, of the target's four reprojected corners over the run". On `pinball-static.mp4` that number mostly measures the footage: the replay shows the target's top corners drifting about 3.7 px over the 12 s clip and jumping about 3 px back at each loop — detection and tracking agree on it, so it is in the clip — and the SD over a run is 0.90 px tracked against 1.04–1.08 px detection-only (1.16×), whatever either does. My first draft replaced it with a frame-to-frame (successive-difference) estimate; the review showed that estimate is wrong for a tracker, whose error is correlated from frame to frame: it shrinks with the spacing between processed frames (tracked ÷ detection-only fell 6.1× → 4.3× → 3.1× → 2.4× at 1, 2, 4, 8 frames), so it would reward a faster tracker — or M3's low-pass filter — by construction. Ruling:
- **`jitterPx`**: the corners' standard deviation about their own straight-line motion within each one-second window of media time (a window never spans a loop wrap), pooled over the windows holding at least 4 frames with corners, with n − 2 degrees of freedom per window. It equals the SD for a target still in the image, does not count motion that is straight over a second, and does not depend on how many frames per second a run processed: in the replay, tracking gave 0.124–0.140 px on every schedule. This is the tested number and the one M3 and M4 compare against.
- **`spreadPx`**: the brief's definition, the corners' SD over the run. Reported in every export and in the comparison, **not tested**: on this clip it is the footage's drift.
If you want the brief's number to be the tested one, prediction 3 has to be rewritten, not renamed: on this clip it would read "tracked ≈ stateless".

**D2. An on-device frame-pyramid probe, because the tracker's `pyramidMs` cannot test #63's proxy.** `frameLevelsFor` (#66) builds only the levels the patches start on; `pinball.wnft`'s 64 patches are all level 0 and are seen below their own scale on every clip and on the camera path, so the tracker builds one level — the frame itself, nothing computed. The replay: `frameLevels` 1 on 100% of TRACK frames on all three clips, `pyramidMs` 0.00–0.01 ms desktop. On the device it will read 0 (the clock step is 0.1 ms), and will not be compared with #63's four-level estimate of **5.6–7.5 ms**. (The brief's 5.9–7.1 ms is commit d11eb18's figure, replaced by 88585a3 before #63 merged; `docs/superpowers/plans/2026-09-25-nft-tracker-m2-state-machine.md` records it.) Ruling: a "Time frame pyramid" button runs `buildFramePyramid` on the device by #63's method, at #63's sizes and depths (p50 of 300 runs after 50 warm-up; 270×360, 480×270, 640×480; 1–6 levels; step ∛2) and downloads the result — the direct measurement the proxy estimated. Page-only, no change to `packages/`.

**D3. Vitest for `examples/`, run by the root `npm test`.** `examples/` has no tests and is not a workspace; the logic here needs TDD and must run in CI. Ruling: `"vitest": "^4.1.11"` in the root `devDependencies` (already installed and hoisted — this declares it), a root script `"test:examples": "vitest run --root examples"`, and `test` running it after the workspaces. One test framework; the alternative, `node --test`, needs no declaration but brings a second.

**D4. Mode values `stateless`, `detection-only`, `tracking`. (review)** The old value `tracker` meant detection-only by necessity (the page's target had no patches); no committed export uses it (grep in `docs/benchmarks/`). Ruling: rename it `detection-only`, pass `detectionOnly: true` explicitly, and say in `examples/README.md` what `tracker` meant. The CDP driver kept outside the repository (`memory/bench-tools/tablet-sweep.mjs`) needs updating before it drives any run in this plan: it must load the new URL (`?mode=…&target=wnft&window=300&clip=…`) and poll for `300 / 300`. Setting `#mode` by script fires no `change` event, so it would otherwise run with the in-page target and a 120-frame window, and a tracking run would be refused at Start.

**D5. A committed desktop replay as the plan's pre-flight. (review)** `scripts/replay-clips.mjs` produces every pre-flight number the README plan cites — including loop wraps (it replays two loops), the aligned jitter comparison, first-step confirmation and held-lock losses — so each can be traced, as exports are. With `--sequence <export.json>` it also replays exactly the frames a device export processed: that is the proxy check's denominator (prediction 1). Needs ffmpeg on PATH; run by hand, not in CI.

**D6. The stateless comparison runs use `pinball.wnft` too.** Every device run in this plan, stateless included, uses the same target file, so the comparison isolates the tracking state from the target's origin. The page's default target stays the in-page build, so an unparameterised run is the run it always was; tracking selects the file.

**D7. A 300-frame window, run past its fill, and URL parameters for hand-run devices. (review)** 300 frames covers at least one loop of every clip in every mode (TRACK share depends on which part of a moving clip the window saw); an export is about 0.45 MB. Each run goes on for at least 50 frames after the window fills, so the window holds no cold-JIT steps; the export records `ticks` (frames processed in the run) so that can be checked. `?mode=`, `?target=`, `?window=` and `?clip=` join `?maxKeypoints=`, `?procWidth=`/`?procHeight=` and `?camera=`.

**D8. "So the comparison is on one page" is read as: one table. (review)** The page shows one run at a time. `scripts/compare-bench.mjs` prints the tracking and stateless runs of a clip side by side, aligned on the media times both posed, and that table goes into the README's Results next to the verdicts. (The alternative, a page control that loads a second export, is not in this plan.)

**The Oppo A72:** the brief says you will run it; nothing here drives it (no adb, no CDP). It is not the reference device; point 5 is not evaluated on it.

---

## Global Constraints

- **No change under `packages/`.** No measurement hook is missing: `TrackResult` carries `state`, `quality`, `trackLoss`, `tracking` (`TrackStats`: `fitIterations`, `fitConverged`, `inliers`, `observed`, `attempted`, `culled`, …) and `timings` (`TrackTimings`: `totalMs`, `detectMs`, `trackMs`, `pyramidMs`, `alignMs`, `fitMs`, given a `clock`). If one turns out to be missing: stop — it needs its own commit and justification.
- **Report the tracker's timings; never redefine them.** `trackMs`: "the whole step: prediction, cull, pyramid depth, pyramid, alignment, fit, judgement", without the pose. `alignMs`: "`alignPatch`, both halves: each patch's warp (`preparePatch`) and its alignment"; `frameLevelsFor` counts in `trackMs` only (ec3bbb2). `pyramidMs`: `buildFramePyramid`. `fitMs`: `robustHomography` (track_frame.ts `TrackStepTimings`; tracker.ts `TrackTimings`).
- **The tracking target is `examples/targets/pinball.wnft`, loaded (fetched and `decode`d), never built in the page.** The page says which target a run used; the export records it with the file's SHA-256.
- **ADR-0001 point 5's figure** is `trackMs` on TRACK frames, reported as its own p50/p95 — readable without deriving it from anything else. Point 5 is defined "over a recorded test sequence", so it is decided on the bundled clips, not on the camera run.
- **8 ms** is point 5's threshold at p95. **~10 ms** is what the camera path leaves after its 23 ms `acquire` (docs/benchmarks/README.md, "Webcam: `acquire` without a video decoder").
- **#63's pyramid estimate is 5.6–7.5 ms** (four ∛2 levels of 270×360, device, by proxy) — not 5.9–7.1.
- **The README measurement plan is written before any device run and stays unchanged once runs start**; results go below it.
- **License headers:** new files use the webarkit LGPL template of `scripts/check-contract-sync.mjs` ("This file is part of webarkit.").
- **Formatting:** `npm run format:check` covers `scripts/*.mjs`, not `examples/`. New `examples/` `.mjs` files are formatted with `npx prettier --ignore-path "" --write <files>` before each commit that touches them (CI does not enforce it; `examples/`'s HTML stays unformatted, as before).
- **Gates:** `npm run build`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run check:contract` — run unpiped, each followed by `echo "exit $?"`, and their output pasted, not summarised.
- **Git:** branch `feat/bench-nft-tracking-mode` from `origin/dev` (created, at 8b14b91). Conventional Commits; each message ends with the `Co-Authored-By` line. PR against `dev`, milestone "M2: patch tracking" (#3). Push with `-u origin feat/bench-nft-tracking-mode` (the branch was created tracking `origin/dev`).
- **Never round-trip a source file through PowerShell.** Edit with Edit/Write; run commands in Git Bash.
- **The Oppo A72 is never driven from here.** Tab_9_WiFi over adb/CDP only if you ask, always with `-s Tab9WEEA0001504`.
- **English** in every artifact.

## Review Focus

Conditions the brief implies that no unit test exercises in the browser, each with the check that pins it:

1. **Tracking mode with a target that cannot be tracked** (`?mode=tracking&target=image`) — Start refuses, before any source starts, naming `targets/pinball.wnft`, and shows no camera or clip hint; nothing is committed to the export state. Never a detection-only run under the "tracking" label. `trackabilityError` is unit-tested (Task 4); the page wiring is smoke step (d) in Task 5.
2. **A window that spans a loop wrap** — no jitter window mixes the two sides of a wrap; a re-detection on the first frame after one is counted apart. Unit-tested (Task 2); smoke step (a) in Task 5 uses a 450-frame window, longer than the static clip's 363 frames, and checks `loopWraps ≥ 1`.
3. **A degenerate DETECT pose** whose corners do not all project in front of the camera, or to finite points — `corners: null`, left out of jitter. Unit-tested (Task 1).
4. **Exports that cannot be aligned** (no `metricsVersion`, a webcam run, another clip, another processing size) — `compare-bench.mjs` refuses with a one-line reason, no stack trace, exit 1; bad usage exits 2. Tested (Task 3).
5. **A run with no TRACK frames** (stateless, or a tracking run that never locks) — the summary reports `n: 0` and `null` statistics: never `NaN`, never 0 ms. Unit-tested (Task 2); smoke step (b) checks a stateless export.

---

## File structure

| File | | Responsibility |
|---|---|---|
| `examples/js/bench-metrics.mjs` | create | Every run metric and its definition; per-frame records; stage filters; alignment of two exports; URL parameters and trackability for the page; probe and replay helpers. Pure: no DOM, no clock of its own. |
| `examples/test/bench-metrics.test.mjs` | create | Tests for the module, except alignment. |
| `examples/test/compare-exports.test.mjs` | create | Tests for `compareExports` and the CLI. |
| `scripts/compare-bench.mjs` | create | CLI: two exports side by side, aligned by media time. |
| `scripts/replay-clips.mjs` | create | Desktop pre-flight, and the proxy check's denominator (`--sequence`). |
| `examples/bench-nft.html` | modify | Tracking mode, target selector, per-frame fields, run summary, pyramid probe, URL parameters. |
| `examples/js/pinball-shared.mjs` | modify | `export` on `fitSize`, so the replay sizes frames as the pages do. |
| `package.json`, `package-lock.json` | modify | `vitest` declared at the root; `test:examples`; `test` runs it. |
| `AGENTS.md` | modify | `npm test` also runs `examples/test/`. |
| `examples/README.md` | modify | The `bench-nft.html` section. |
| `docs/benchmarks/README.md` | modify | The measurement plan, with the pre-flight. |

---

### Task 1: Test wiring and per-frame records

**Files:** Modify `package.json` (root), `package-lock.json`. Create `examples/js/bench-metrics.mjs`, `examples/test/bench-metrics.test.mjs`.

**Interfaces:**
- Consumes: `TrackResult` (packages/nft-tracker/src/tracker.ts); the page's stateless result `{ ok, reason?, numMatches, numInliers, H, pose, sceneKeypoints }`; a row-major `Mat3`.
- Produces:
  - `percentile(sortedAsc, p): number` — rank `⌊p/100·n⌋`, clamped; `NaN` when empty.
  - `stats(values): { n, min, p50, p95, max }` — `null` statistics when empty.
  - `targetCorners(widthPx, heightPx): [x, y][4]`.
  - `reprojectCorners(H, points): [x, y][] | null`.
  - `frameRecord({ mode, result, stageTimings, timestampMs, mediaTimeSeconds, targetPoints }): FrameRecord` with `mode ∈ "stateless" | "detection-only" | "tracking"` and `FrameRecord = { timestampMs, mediaTimeSeconds, timings, ok, reason, numSceneKeypoints, numMatches, numInliers, state, quality, trackLoss, tracking, trackerTimings, corners }`.
  - `framesForStage(frames, stage): FrameRecord[]`.

- [ ] **Step 1: Declare Vitest at the root; add the examples script**

```bash
cd /d/kalwalt-github/webarkit && npm install --save-dev vitest@^4.1.11
```
Expected: root `package.json` gains `"vitest": "^4.1.11"` in `devDependencies` and `package-lock.json`'s root entry gains it; no package is downloaded ("up to date"/"changed 0").

In root `package.json` `scripts`, replace `"test": "npm run test --workspaces --if-present",` with:
```json
"test": "npm run test --workspaces --if-present && npm run test:examples",
"test:examples": "vitest run --root examples",
```

- [ ] **Step 2: Write the failing tests**

Create `examples/test/bench-metrics.test.mjs`:

```js
/*
 *  bench-metrics.test.mjs
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

import { describe, expect, it } from "vitest";
import {
    frameRecord,
    framesForStage,
    percentile,
    reprojectCorners,
    stats,
    targetCorners,
} from "../js/bench-metrics.mjs";

describe("percentile", () => {
    it("takes the sample at rank ⌊p/100 · n⌋, as the page always has", () => {
        const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(percentile(s, 50)).toBe(6);
        expect(percentile(s, 95)).toBe(10);
        expect(percentile([7], 95)).toBe(7);
    });

    it("is NaN on no samples", () => {
        expect(percentile([], 50)).toBeNaN();
    });
});

describe("stats", () => {
    it("sorts a copy and reports n, min, p50, p95 and max", () => {
        const values = [3, 1, 2];
        expect(stats(values)).toEqual({ n: 3, min: 1, p50: 2, p95: 3, max: 3 });
        expect(values).toEqual([3, 1, 2]);
    });

    it("reports null statistics, not NaN, on no values", () => {
        expect(stats([])).toEqual({ n: 0, min: null, p50: null, p95: null, max: null });
    });
});

describe("targetCorners and reprojectCorners", () => {
    it("names a w × h target's corners in level-0 px, clockwise from the origin", () => {
        expect(targetCorners(512, 640)).toEqual([
            [0, 0],
            [511, 0],
            [511, 639],
            [0, 639],
        ]);
    });

    it("projects them through H", () => {
        const H = [2, 0, 10, 0, 2, 20, 0, 0, 1];
        expect(reprojectCorners(H, targetCorners(3, 2))).toEqual([
            [10, 20],
            [14, 20],
            [14, 22],
            [10, 22],
        ]);
    });

    it("divides by w", () => {
        expect(reprojectCorners([1, 0, 0, 0, 1, 0, 0, 0, 2], [[4, 6]])).toEqual([[2, 3]]);
    });

    it("is null when a corner lands on the other side of the camera from the rest", () => {
        // w = 1 − x / 100: positive at x = 0, negative at x = 511.
        const H = [1, 0, 0, 0, 1, 0, -0.01, 0, 1];
        expect(reprojectCorners(H, targetCorners(512, 640))).toBeNull();
    });

    it("is null when a projection is not finite", () => {
        expect(reprojectCorners([1, 0, 0, 0, 1, 0, 0, 0, 0], targetCorners(2, 2))).toBeNull();
        expect(reprojectCorners([NaN, 0, 0, 0, 1, 0, 0, 0, 1], targetCorners(2, 2))).toBeNull();
    });
});

describe("frameRecord", () => {
    const targetPoints = targetCorners(3, 2);
    const H = [1, 0, 5, 0, 1, 7, 0, 0, 1];
    const tracking = {
        frameLevels: 1,
        culled: 2,
        attempted: 62,
        observed: 58,
        lost: 1,
        unconverged: 1,
        rejected: 2,
        failed: 0,
        inliers: 55,
        rmsError: 0.24,
        fitIterations: 3,
        fitConverged: true,
    };
    const trackerTimings = {
        totalMs: 4.2,
        detectMs: 0,
        trackMs: 4,
        pyramidMs: 0,
        alignMs: 3.8,
        fitMs: 0.1,
    };
    const stageTimings = { acquire: 20, total: 25 };
    const base = { stageTimings, timestampMs: 1000, mediaTimeSeconds: 1.5, targetPoints };

    it("copies what the tracker reports on a TRACK frame, as it reports it", () => {
        const result = {
            ok: true,
            state: "TRACK",
            quality: 0.86,
            timestampMs: 1000,
            numMatches: 58,
            numInliers: 55,
            H,
            pose: {},
            sceneKeypoints: [],
            trackLoss: null,
            tracking,
            timings: trackerTimings,
        };
        const r = frameRecord({ mode: "tracking", result, ...base });
        expect(r).toEqual({
            timestampMs: 1000,
            mediaTimeSeconds: 1.5,
            timings: { acquire: 20, total: 25 },
            ok: true,
            reason: null,
            numSceneKeypoints: 0,
            numMatches: 58,
            numInliers: 55,
            state: "TRACK",
            quality: 0.86,
            trackLoss: null,
            tracking,
            trackerTimings,
            corners: [
                [5, 7],
                [7, 7],
                [7, 8],
                [5, 8],
            ],
        });
        // Copies: the page reuses one timings object every tick.
        expect(r.tracking).not.toBe(tracking);
        expect(r.timings).not.toBe(stageTimings);
    });

    it("keeps a DETECT frame's track loss: the lock it dropped before detecting again", () => {
        const result = {
            ok: true,
            state: "DETECT",
            quality: 0.5,
            numMatches: 80,
            numInliers: 40,
            H,
            pose: {},
            sceneKeypoints: [{ x: 1, y: 1 }],
            trackLoss: "too-few-patches",
            tracking: { ...tracking, inliers: 0, rmsError: null, fitIterations: 0, fitConverged: null },
            timings: trackerTimings,
        };
        const r = frameRecord({ mode: "tracking", result, ...base });
        expect(r).toMatchObject({ state: "DETECT", trackLoss: "too-few-patches", numSceneKeypoints: 1 });
    });

    it("gives the stateless pipeline DETECT or LOST, and no tracker fields", () => {
        const ok = frameRecord({
            mode: "stateless",
            result: { ok: true, numMatches: 90, numInliers: 60, H, pose: {}, sceneKeypoints: [{}, {}] },
            ...base,
        });
        expect(ok).toMatchObject({
            state: "DETECT",
            quality: null,
            trackLoss: null,
            tracking: null,
            trackerTimings: null,
            reason: null,
            numSceneKeypoints: 2,
        });
        const lost = frameRecord({
            mode: "stateless",
            result: {
                ok: false,
                reason: "too-few-matches",
                numMatches: 2,
                numInliers: 0,
                H: null,
                pose: null,
                sceneKeypoints: [],
            },
            ...base,
        });
        expect(lost).toMatchObject({ state: "LOST", reason: "too-few-matches", corners: null });
    });

    it("records a tracker without a clock as having no timings", () => {
        const result = {
            ok: false,
            state: "LOST",
            quality: 0,
            reason: "no-consensus",
            numMatches: 9,
            numInliers: 3,
            H: null,
            pose: null,
            sceneKeypoints: [],
            trackLoss: null,
            tracking: null,
            timings: null,
        };
        expect(frameRecord({ mode: "detection-only", result, ...base })).toMatchObject({
            state: "LOST",
            quality: 0,
            tracking: null,
            trackerTimings: null,
            corners: null,
        });
    });
});

describe("framesForStage", () => {
    const f = (state, extra = {}) => ({
        state,
        ok: state !== "LOST",
        reason: state === "LOST" ? "no-consensus" : null,
        ...extra,
    });
    const frames = [f("DETECT"), f("TRACK"), f("LOST", { reason: "too-few-matches" }), f("LOST"), f("TRACK")];

    it("takes detection's stages over the frames that detected: every frame but TRACK", () => {
        for (const s of ["detect", "describe", "match", "filterMatches"]) {
            expect(framesForStage(frames, s)).toEqual([frames[0], frames[2], frames[3]]);
        }
    });

    it("takes estimateHomography over the detections that found four matches", () => {
        expect(framesForStage(frames, "estimateHomography")).toEqual([frames[0], frames[3]]);
    });

    it("takes the pose over every frame with one, TRACK included", () => {
        expect(framesForStage(frames, "pose")).toEqual([frames[0], frames[1], frames[4]]);
    });

    it("takes acquire, gray and total over every frame", () => {
        for (const s of ["acquire", "gray", "total"]) expect(framesForStage(frames, s)).toEqual(frames);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: FAIL — `Cannot find module '../js/bench-metrics.mjs'` (or "Failed to load url").

- [ ] **Step 4: Write the module's first part**

Create `examples/js/bench-metrics.mjs`:

```js
/*
 *  bench-metrics.mjs
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
 * The bench's logic, apart from its page: every run metric `bench-nft.html`
 * reports and the one text defining each, the page's URL parameters, and the
 * helpers its pyramid probe and the desktop replay share. The page, the
 * comparison script (`scripts/compare-bench.mjs`) and the replay
 * (`scripts/replay-clips.mjs`) all import this module, so two exports — or an
 * export and a replay — cannot mean different things by one name. Pure: no
 * DOM, and no clock of its own. Tested in `examples/test/`.
 */

/**
 * The sample at rank `⌊p/100 · n⌋` of an ascending array, clamped to the last;
 * `NaN` when there is none. The page's definition since its first export.
 */
export function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0) return NaN;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
    return sortedAsc[idx];
}

/** `{ n, min, p50, p95, max }` of `values`, sorting a copy; every statistic `null` when there are none. */
export function stats(values) {
    if (values.length === 0) return { n: 0, min: null, p50: null, p95: null, max: null };
    const s = [...values].sort((a, b) => a - b);
    return { n: s.length, min: s[0], p50: percentile(s, 50), p95: percentile(s, 95), max: s[s.length - 1] };
}

/** A `w × h` target's four corners, in its level-0 pixels, clockwise from the origin. */
export function targetCorners(widthPx, heightPx) {
    return [
        [0, 0],
        [widthPx - 1, 0],
        [widthPx - 1, heightPx - 1],
        [0, heightPx - 1],
    ];
}

/**
 * `points` projected by the row-major homography `H`, or `null` when one of
 * them does not project to a finite point, or when they do not all land on the
 * same side of the camera (their `w` differ in sign): a pose whose outline
 * cannot be drawn, and whose corners would make any statistic of them
 * meaningless. `H` and `−H` are the same homography, so all-negative `w` is
 * accepted.
 */
export function reprojectCorners(H, points) {
    const out = [];
    let side = 0;
    for (const [x, y] of points) {
        const w = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / w;
        const v = (H[3] * x + H[4] * y + H[5]) / w;
        if (!(Number.isFinite(u) && Number.isFinite(v))) return null;
        const s = Math.sign(w);
        if (side !== 0 && s !== side) return null;
        side = s;
        out.push([u, v]);
    }
    return out;
}

/**
 * One frame of an export. `mode` is `"stateless"`, `"detection-only"` or
 * `"tracking"`; `result` is what that mode returned — `NftTracker`'s
 * `TrackResult`, or the page's stateless-pipeline result, which has no state,
 * quality or tracking fields. What the tracker reports is copied as it
 * reports it; nothing is recomputed. `stageTimings` is the page's per-stage
 * timings object (copied: the page reuses one every tick), and `targetPoints`
 * the target's corners from {@link targetCorners}.
 *
 * `mediaTimeSeconds` is the frame's position in the clip — compare two
 * exports by it, never by index: frames the main thread was too busy for are
 * skipped, and two modes skip different ones (examples/README.md).
 * `numSceneKeypoints` is what `detect` returned: at most the run's
 * `maxKeypoints`, fewer on a frame with fewer corners — `match` is a
 * brute-force search over these, so a `match` timing means nothing without
 * it — and 0 on a TRACK frame, where nothing is detected.
 */
export function frameRecord({ mode, result, stageTimings, timestampMs, mediaTimeSeconds, targetPoints }) {
    const tracker = mode !== "stateless";
    return {
        timestampMs,
        mediaTimeSeconds,
        timings: { ...stageTimings },
        ok: result.ok,
        reason: result.ok ? null : result.reason,
        numSceneKeypoints: result.sceneKeypoints.length,
        numMatches: result.numMatches,
        numInliers: result.numInliers,
        state: tracker ? result.state : result.ok ? "DETECT" : "LOST",
        quality: tracker ? result.quality : null,
        trackLoss: tracker ? result.trackLoss : null,
        tracking: tracker && result.tracking ? { ...result.tracking } : null,
        trackerTimings: tracker && result.timings ? { ...result.timings } : null,
        corners: result.ok ? reprojectCorners(result.H, targetPoints) : null,
    };
}

/**
 * The frames on which `stage` ran, so its percentiles are taken over frames
 * that paid for it, not diluted by frames where it was skipped and its timing
 * stayed at zero. Detection (`detect`, `describe`, `match`, `filterMatches`)
 * runs on every frame that is not TRACK — a lock that fails is detected again
 * on the same frame; `estimateHomography` on the detections that found four
 * matches; the pose on every frame with one, TRACK included; `acquire`,
 * `gray` and `total` on every frame.
 */
export function framesForStage(frames, stage) {
    const detected = (f) => f.state !== "TRACK";
    switch (stage) {
        case "detect":
        case "describe":
        case "match":
        case "filterMatches":
            return frames.filter(detected);
        case "estimateHomography":
            return frames.filter((f) => detected(f) && f.reason !== "too-few-matches");
        case "pose":
            return frames.filter((f) => f.ok);
        default:
            return frames;
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: PASS — `Test Files  1 passed (1)`, `Tests  17 passed (17)`.

- [ ] **Step 6: Format and commit**

```bash
cd /d/kalwalt-github/webarkit && npx prettier --ignore-path "" --write examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs && npm run test:examples && git add package.json package-lock.json examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs && git commit -m "feat(examples): per-frame bench records, tested under npm test

bench-nft.html's per-frame record, stage filters and corner reprojection
move into examples/js/bench-metrics.mjs, so the page, a comparison script
and a desktop replay can share one definition of each. examples/ is not a
workspace, so the root declares vitest (already hoisted) and npm test runs
examples/test/ after the workspaces.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: 17 passed again after prettier; one commit.

---

### Task 2: Run metrics and their definitions

**Files:** Modify `examples/js/bench-metrics.mjs`, `examples/test/bench-metrics.test.mjs`.

**Interfaces:**
- Consumes: `stats`, `FrameRecord` (Task 1).
- Produces: `METRICS_VERSION = 1`; `LOW_QUALITY = 0.2`; `JITTER_WINDOW_S = 1`; `DEFINITIONS` (frozen: metric name → text); `isLoopWrap(prev, cur)`; `countLoopWraps(frames)`; `reacquisitions(frames) → { reacquisitions, reacquisitionsAtLoopWrap }`; `lockSteps(frames) → { firstSteps: { n, confirmed }, heldLockSteps: { n, lost } }`; `cornerJitter(frames) → { posedFrames, jitterWindows, jitterPx, spreadPx }`; `summarizeRun(frames) → RunSummary` with keys `frames, states, trackShare, reacquisitions, reacquisitionsAtLoopWrap, loopWraps, lockLosses, firstSteps, heldLockSteps, trackStepMs, pyramidMs, alignMs, fitMs, frameLevels, fits, quality, trackedPatches, lowQualityTrackFrames, posedFrames, jitterWindows, jitterPx, spreadPx` — every one also a key of `DEFINITIONS`.

- [ ] **Step 1: Write the failing tests**

In `examples/test/bench-metrics.test.mjs`, replace the import with:
```js
import {
    cornerJitter,
    countLoopWraps,
    DEFINITIONS,
    frameRecord,
    framesForStage,
    lockSteps,
    METRICS_VERSION,
    percentile,
    reacquisitions,
    reprojectCorners,
    stats,
    summarizeRun,
    targetCorners,
} from "../js/bench-metrics.mjs";
```
and append:

```js
describe("loop wraps, re-acquisitions and lock steps", () => {
    const f = (state, t, o = {}) => ({ state, ok: state !== "LOST", mediaTimeSeconds: t, tracking: null, trackLoss: null, ...o });
    const step = { observed: 40 };

    it("counts a wrap wherever media time goes back", () => {
        expect(countLoopWraps([f("DETECT", 11.9), f("TRACK", 12.1), f("TRACK", 0.03), f("TRACK", 0.07)])).toBe(1);
        expect(countLoopWraps([])).toBe(0);
    });

    it("counts DETECT frames after an earlier pose, not the window's first lock", () => {
        const frames = [
            f("LOST", 0.1),
            f("DETECT", 0.2),
            f("TRACK", 0.3),
            f("DETECT", 0.4),
            f("LOST", 0.5),
            f("DETECT", 0.6),
            f("DETECT", 0.7),
            f("TRACK", 0.8),
        ];
        expect(reacquisitions(frames)).toEqual({ reacquisitions: 3, reacquisitionsAtLoopWrap: 0 });
    });

    it("counts a DETECT on the first frame after a wrap apart: the jump there is the clip's", () => {
        const frames = [f("DETECT", 11.8), f("TRACK", 11.9), f("DETECT", 0.03), f("TRACK", 0.07)];
        expect(reacquisitions(frames)).toEqual({ reacquisitions: 0, reacquisitionsAtLoopWrap: 1 });
    });

    it("counts every posed frame after the first in a detection-only window", () => {
        const frames = [f("DETECT", 1), f("DETECT", 2), f("LOST", 3), f("DETECT", 4)];
        expect(reacquisitions(frames)).toEqual({ reacquisitions: 2, reacquisitionsAtLoopWrap: 0 });
    });

    it("tells a lock's first step from a held lock's, and counts which held", () => {
        const frames = [
            f("DETECT", 0.1),
            f("TRACK", 0.2, { tracking: step }), // first step: confirmed
            f("TRACK", 0.3, { tracking: step }), // held
            f("DETECT", 0.4, { tracking: step, trackLoss: "poor-fit" }), // held, lost
            f("DETECT", 0.5, { tracking: step, trackLoss: "too-few-patches" }), // first step, refused
            f("TRACK", 0.6, { tracking: step }), // first step: confirmed
            f("LOST", 0.7),
            f("DETECT", 0.8), // no step: nothing was locked
        ];
        expect(lockSteps(frames)).toEqual({ firstSteps: { n: 3, confirmed: 2 }, heldLockSteps: { n: 2, lost: 1 } });
    });

    it("finds no lock steps where nothing tracks", () => {
        expect(lockSteps([f("DETECT", 0.1), f("DETECT", 0.2), f("LOST", 0.3)])).toEqual({
            firstSteps: { n: 0, confirmed: 0 },
            heldLockSteps: { n: 0, lost: 0 },
        });
    });
});

describe("cornerJitter", () => {
    const at = (t, dx = 0, dy = 0) => ({
        mediaTimeSeconds: t,
        corners: [
            [dx, dy],
            [100 + dx, dy],
            [100 + dx, 200 + dy],
            [dx, 200 + dy],
        ],
    });

    it("is 0 for a target that does not move", () => {
        expect(cornerJitter([at(0.1), at(0.2), at(0.3), at(0.4)])).toEqual({
            posedFrames: 4,
            jitterWindows: 1,
            jitterPx: 0,
            spreadPx: 0,
        });
    });

    it("does not count motion that is straight within a second, which the spread counts in full", () => {
        const frames = Array.from({ length: 300 }, (_, i) => at(i / 30, 0.1 * i));
        const r = cornerJitter(frames);
        expect(r.jitterWindows).toBe(10);
        expect(r.jitterPx).toBeCloseTo(0, 9);
        expect(r.spreadPx).toBeCloseTo(0.1 * Math.sqrt((300 * 300 - 1) / 12), 9);
    });

    it("measures the residual about each window's line, with n − 2 degrees of freedom", () => {
        // x = 0, 1, 0, 1 at t = 0, 0.25, 0.5, 0.75: the line through them has slope 0.8,
        // residuals ±0.2 and ±0.6, so Σr² = 0.8 per corner and dof = 4 − 2.
        const frames = [at(0, 0), at(0.25, 1), at(0.5, 0), at(0.75, 1)];
        const r = cornerJitter(frames);
        expect(r.jitterPx).toBeCloseTo(Math.sqrt(0.4), 12);
        expect(r.spreadPx).toBeCloseTo(0.5, 12);
    });

    it("estimates the corners' standard deviation for a still target, at any frame rate", () => {
        // Park–Miller through Box–Muller: deterministic normal noise, σ = 0.3 px per axis.
        let seed = 12345;
        const u = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
        const frames = Array.from({ length: 6000 }, (_, i) => ({
            mediaTimeSeconds: i / 30,
            corners: Array.from({ length: 4 }, () => [0.3 * g(), 0.3 * g()]),
        }));
        const every = cornerJitter(frames);
        const fourth = cornerJitter(frames.filter((_, i) => i % 4 === 0));
        expect(every.spreadPx).toBeCloseTo(0.3 * Math.SQRT2, 2);
        expect(every.jitterPx / every.spreadPx).toBeGreaterThan(0.97);
        expect(every.jitterPx / every.spreadPx).toBeLessThan(1.03);
        expect(fourth.jitterPx / every.jitterPx).toBeGreaterThan(0.95);
        expect(fourth.jitterPx / every.jitterPx).toBeLessThan(1.05);
    });

    it("never mixes the two sides of a loop wrap in one window", () => {
        // Still within each loop, 5 px apart between them: one window each, both 0.
        const frames = [at(0.1), at(0.3), at(0.5), at(0.7), at(0.2, 5), at(0.4, 5), at(0.6, 5), at(0.8, 5)];
        expect(cornerJitter(frames)).toMatchObject({ jitterWindows: 2, jitterPx: 0 });
    });

    it("skips windows with fewer than 4 frames with corners", () => {
        const frames = [at(0.1), at(0.2), { mediaTimeSeconds: 0.3, corners: null }, at(0.4), at(1.2, 3), at(1.5, 1)];
        expect(cornerJitter(frames)).toMatchObject({ posedFrames: 5, jitterWindows: 0, jitterPx: null });
    });

    it("reports null, not NaN, without the frames to measure", () => {
        expect(cornerJitter([])).toEqual({ posedFrames: 0, jitterWindows: 0, jitterPx: null, spreadPx: null });
        expect(cornerJitter([at(0.1, 1, 2)])).toEqual({ posedFrames: 1, jitterWindows: 0, jitterPx: null, spreadPx: 0 });
    });
});

describe("summarizeRun", () => {
    const stepTimings = (trackMs) => ({
        totalMs: trackMs + 0.2,
        detectMs: 0,
        trackMs,
        pyramidMs: 0,
        alignMs: trackMs - 0.3,
        fitMs: 0.1,
    });
    const step = (o = {}) => ({
        frameLevels: 1,
        culled: 0,
        attempted: 64,
        observed: 60,
        lost: 0,
        unconverged: 1,
        rejected: 3,
        failed: 0,
        inliers: 57,
        rmsError: 0.23,
        fitIterations: 3,
        fitConverged: true,
        ...o,
    });
    const frame = (state, t, o = {}) => ({
        state,
        ok: state !== "LOST",
        mediaTimeSeconds: t,
        quality: state === "TRACK" ? 0.88 : state === "DETECT" ? 0.6 : 0,
        trackLoss: null,
        tracking: null,
        trackerTimings: null,
        corners:
            state === "LOST"
                ? null
                : [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                      [0, 1],
                  ],
        ...o,
    });
    const window = [
        frame("DETECT", 0.1, { trackerTimings: stepTimings(0) }),
        frame("TRACK", 0.2, { tracking: step(), trackerTimings: stepTimings(12) }),
        frame("TRACK", 0.3, {
            tracking: step({ fitIterations: 20, fitConverged: false }),
            trackerTimings: stepTimings(14),
            quality: 0.15,
        }),
        frame("DETECT", 0.4, {
            trackLoss: "too-few-patches",
            tracking: step({ observed: 5, inliers: 0, rmsError: null, fitIterations: 0, fitConverged: null }),
            trackerTimings: stepTimings(9),
        }),
        frame("TRACK", 0.5, { tracking: step({ frameLevels: 2 }), trackerTimings: stepTimings(10) }),
    ];

    it("reads the tracking step's timings on TRACK frames only", () => {
        const s = summarizeRun(window);
        expect(s.trackStepMs).toEqual({ n: 3, min: 10, p50: 12, p95: 14, max: 14 });
        expect(s.alignMs.p50).toBeCloseTo(11.7, 12);
        expect(s.pyramidMs).toEqual({ n: 3, min: 0, p50: 0, p95: 0, max: 0 });
    });

    it("counts states, share, losses, lock steps, levels, fits and low-quality TRACK frames", () => {
        const s = summarizeRun(window);
        expect(s).toMatchObject({
            frames: 5,
            states: { LOST: 0, DETECT: 2, TRACK: 3 },
            trackShare: 0.6,
            reacquisitions: 1,
            reacquisitionsAtLoopWrap: 0,
            loopWraps: 0,
            lockLosses: { "too-few-patches": 1 },
            firstSteps: { n: 2, confirmed: 2 },
            heldLockSteps: { n: 2, lost: 1 },
            frameLevels: { 1: 2, 2: 1 },
            lowQualityTrackFrames: 1,
            jitterWindows: 1,
            jitterPx: 0,
        });
        expect(s.fits).toEqual({ n: 3, capped: 1, iterations: { n: 3, min: 3, p50: 3, p95: 20, max: 20 } });
        expect(s.quality).toMatchObject({ n: 3, min: 0.15 });
        expect(s.trackedPatches).toMatchObject({ n: 3, p50: 57 });
    });

    it("reports a stateless window's tracker metrics as absent, not as zero", () => {
        const s = summarizeRun([frame("DETECT", 0.1, { quality: null }), frame("LOST", 0.2, { quality: null })]);
        expect(s.trackStepMs).toEqual({ n: 0, min: null, p50: null, p95: null, max: null });
        expect(s.fits).toEqual({
            n: 0,
            capped: 0,
            iterations: { n: 0, min: null, p50: null, p95: null, max: null },
        });
        expect(s.trackShare).toBe(0);
    });

    it("reports an empty window without NaN", () => {
        expect(summarizeRun([])).toMatchObject({ frames: 0, trackShare: null, jitterPx: null, spreadPx: null });
    });

    it("defines every metric it reports, once, in DEFINITIONS", () => {
        for (const key of Object.keys(summarizeRun(window))) expect(DEFINITIONS, key).toHaveProperty(key);
        for (const key of ["corners", "alignment"]) expect(DEFINITIONS).toHaveProperty(key);
        expect(Object.isFrozen(DEFINITIONS)).toBe(true);
        expect(METRICS_VERSION).toBe(1);
    });
});
```

(The `lockSteps` tests pin the rule the implementation follows: a step is a frame whose `tracking` is not `null`; it is a lock's *first* step when the previous frame of the window was DETECT, a *held* lock's when it was TRACK; a first step is *confirmed* when it returned TRACK, a held lock *lost* when `trackLoss` is set.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: FAIL — the new describes with `… is not a function` (Vitest turns a missing named import into `undefined`); Task 1's 17 tests pass.

- [ ] **Step 3: Implement**

Append to `examples/js/bench-metrics.mjs`:

```js
/** Bumped whenever a definition in {@link DEFINITIONS} changes meaning; every export records it. */
export const METRICS_VERSION = 1;

/** The quality at or below which a TRACK frame is counted in `lowQualityTrackFrames`. */
export const LOW_QUALITY = 0.2;

/** The media-time window `jitterPx` is taken within, seconds. */
export const JITTER_WINDOW_S = 1;

/** What each exported metric means, in the words the page shows and every export carries. */
export const DEFINITIONS = Object.freeze({
    frames: "Frames in the window: the last windowSize ticks of the run, one per video frame the page processed.",
    states:
        "Frames per state. NftTracker's result.state; the stateless pipeline has no tracker, and its frames are DETECT with a pose and LOST without one, as a detection-only tracker's are for the same frame (M1).",
    trackShare:
        "TRACK frames ÷ frames. Counted per processed frame: a TRACK frame costs less than a DETECT frame, so more of them fit in a second of video.",
    loopWraps: "Frames whose mediaTimeSeconds is lower than the frame's before: the video looped between the two. A webcam has none.",
    reacquisitions:
        "DETECT frames after an earlier frame of the window had a pose, other than the first frame after a loop wrap. In the stateless and detection-only modes every posed frame after the first is one.",
    reacquisitionsAtLoopWrap:
        "DETECT frames that are the first after a loop wrap and follow an earlier pose: the jump there is the clip's, not the tracker's.",
    lockLosses:
        "Frames per trackLoss reason: the tracking steps that dropped the lock (tracker.ts, TrackLoss). The same frame is then detected again.",
    firstSteps:
        "Tracking steps (frames whose tracking is not null) that follow a DETECT frame: a lock's first step, which has no velocity to predict with. confirmed: those that returned TRACK.",
    heldLockSteps:
        "Tracking steps that follow a TRACK frame: a held lock's. lost: those that set trackLoss.",
    trackStepMs:
        "{ n, min, p50, p95, max } of NftTracker's timings.trackMs on TRACK frames: the whole tracking step (prediction, cull, pyramid depth, pyramid, alignment, fit, judgement), without the pose (a backend call), frame acquisition or grey conversion. ADR-0001 point 5's tracker-side TypeScript compute in the tracking state; its threshold is 8 ms at p95.",
    pyramidMs: "The same, over timings.pyramidMs: the part of the step in buildFramePyramid.",
    alignMs:
        "The same, over timings.alignMs: the part of the step in alignPatch, each patch's warp and its alignment. Choosing the pyramid's depth counts in trackMs only.",
    fitMs: "The same, over timings.fitMs: the part of the step in robustHomography.",
    frameLevels: "TRACK frames per tracking.frameLevels: the frame pyramid levels the step built, 1 being the frame itself with nothing computed.",
    fits: "Tracking steps whose robust fit returned (tracking.fitConverged not null): how many, how many stopped at fitMaxIterations (capped: reported by the tracker, not refused), and their iterations.",
    quality: "{ n, min, p50, p95, max } of result.quality on TRACK frames: the sum of the fit's weights ÷ the patches passed to alignPatch.",
    trackedPatches:
        "The same, over tracking.inliers on TRACK frames: the correspondences the fit kept with a weight above 0 (result.numInliers), the count minTrackedPatches bounds.",
    lowQualityTrackFrames:
        "TRACK frames with a quality of at most 0.20. The wrong poses #66 measured after a sudden roll or scale change had 0.12–0.20, but right fits on few patches reach it too: this counts candidates, not wrong poses.",
    posedFrames: "Frames with corners.",
    jitterWindows: "The one-second windows jitterPx pools: those holding at least 4 frames with corners.",
    corners:
        "Per frame: the target's corners (0, 0), (w − 1, 0), (w − 1, h − 1) and (0, h − 1), in target level-0 px, projected into the frame by the frame's H, in frame px. null without a pose, or when the four do not all project to finite points on the same side of the camera.",
    jitterPx:
        "The corners' standard deviation about their own straight-line motion within each one-second window of media time, frame px: in each window (never spanning a loop wrap) holding at least 4 frames with corners, a least-squares line in time is fitted to each corner's x and to its y; jitterPx = √(Σ residual² ÷ (4 · Σ(n − 2))) over those windows, n being each window's frames. Equal to the corners' SD for a target still in the image; motion that is straight over a second does not count; with n − 2 degrees of freedom per window it does not depend, in expectation, on how many frames per second the run processed.",
    spreadPx:
        "√(Σ|cᵢ − c̄|² ÷ (4 · n)), frame px, over the n frames with corners, c̄ being each corner's mean: the corners' standard deviation over the run. It counts any motion of the target in the image, and a clip's drift, along with jitter.",
    alignment:
        "Two exports of the same footage compared on common frames: each restricted to its frames with corners at the media times, to the microsecond, where both have a frame with corners (every occurrence kept when a loop revisits one); jitterPx and spreadPx are then taken over each restricted run as defined above.",
});

/** Whether the video looped between two consecutive frames: media time went back. */
export function isLoopWrap(prev, cur) {
    return cur.mediaTimeSeconds < prev.mediaTimeSeconds;
}

/** See `DEFINITIONS.loopWraps`. */
export function countLoopWraps(frames) {
    let wraps = 0;
    for (let i = 1; i < frames.length; i++) if (isLoopWrap(frames[i - 1], frames[i])) wraps++;
    return wraps;
}

/** See `DEFINITIONS.reacquisitions` and `DEFINITIONS.reacquisitionsAtLoopWrap`. */
export function reacquisitions(frames) {
    let hadPose = false;
    let count = 0;
    let atWrap = 0;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (f.state === "DETECT" && hadPose) {
            if (i > 0 && isLoopWrap(frames[i - 1], f)) atWrap++;
            else count++;
        }
        if (f.ok) hadPose = true;
    }
    return { reacquisitions: count, reacquisitionsAtLoopWrap: atWrap };
}

/** See `DEFINITIONS.firstSteps` and `DEFINITIONS.heldLockSteps`. */
export function lockSteps(frames) {
    const firstSteps = { n: 0, confirmed: 0 };
    const heldLockSteps = { n: 0, lost: 0 };
    for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        if (!f.tracking) continue;
        const before = frames[i - 1].state;
        if (before === "DETECT") {
            firstSteps.n++;
            if (f.state === "TRACK") firstSteps.confirmed++;
        } else if (before === "TRACK") {
            heldLockSteps.n++;
            if (f.trackLoss) heldLockSteps.lost++;
        }
    }
    return { firstSteps, heldLockSteps };
}

/**
 * See `DEFINITIONS.jitterPx`, `spreadPx`, `posedFrames` and `jitterWindows`.
 * `frames` in the order they were processed: a loop wrap is read from it.
 */
export function cornerJitter(frames) {
    const posed = frames.filter((f) => f.corners);
    let spreadPx = null;
    if (posed.length > 0) {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const f of posed) mean += f.corners[c][axis];
                mean /= posed.length;
                for (const f of posed) sum += (f.corners[c][axis] - mean) ** 2;
            }
        }
        spreadPx = Math.sqrt(sum / (4 * posed.length));
    }
    const windows = new Map();
    let loop = 0;
    for (let i = 0; i < frames.length; i++) {
        if (i > 0 && isLoopWrap(frames[i - 1], frames[i])) loop++;
        const f = frames[i];
        if (!f.corners) continue;
        const key = `${loop}:${Math.floor(f.mediaTimeSeconds / JITTER_WINDOW_S)}`;
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push(f);
    }
    let residuals = 0;
    let dof = 0;
    let used = 0;
    for (const w of windows.values()) {
        const n = w.length;
        if (n < 4) continue;
        let tMean = 0;
        for (const f of w) tMean += f.mediaTimeSeconds;
        tMean /= n;
        let tSpread = 0;
        for (const f of w) tSpread += (f.mediaTimeSeconds - tMean) ** 2;
        if (tSpread === 0) continue;
        for (let c = 0; c < 4; c++) {
            for (let axis = 0; axis < 2; axis++) {
                let mean = 0;
                for (const f of w) mean += f.corners[c][axis];
                mean /= n;
                let slope = 0;
                for (const f of w) slope += (f.mediaTimeSeconds - tMean) * (f.corners[c][axis] - mean);
                slope /= tSpread;
                for (const f of w) {
                    residuals += (f.corners[c][axis] - mean - slope * (f.mediaTimeSeconds - tMean)) ** 2;
                }
            }
        }
        dof += n - 2;
        used++;
    }
    return {
        posedFrames: posed.length,
        jitterWindows: used,
        jitterPx: dof > 0 ? Math.sqrt(residuals / (4 * dof)) : null,
        spreadPx,
    };
}

/** A run's summary over its window of frame records. Every key is defined in {@link DEFINITIONS}. */
export function summarizeRun(frames) {
    const states = { LOST: 0, DETECT: 0, TRACK: 0 };
    const lockLosses = {};
    for (const f of frames) {
        states[f.state]++;
        if (f.trackLoss) lockLosses[f.trackLoss] = (lockLosses[f.trackLoss] ?? 0) + 1;
    }
    const track = frames.filter((f) => f.state === "TRACK");
    const timed = track.filter((f) => f.trackerTimings);
    const stepTiming = (key) => stats(timed.map((f) => f.trackerTimings[key]));
    const stepped = track.filter((f) => f.tracking);
    const frameLevels = {};
    for (const f of stepped) frameLevels[f.tracking.frameLevels] = (frameLevels[f.tracking.frameLevels] ?? 0) + 1;
    const fits = frames.filter((f) => f.tracking && f.tracking.fitConverged !== null);
    return {
        frames: frames.length,
        states,
        trackShare: frames.length > 0 ? states.TRACK / frames.length : null,
        ...reacquisitions(frames),
        loopWraps: countLoopWraps(frames),
        lockLosses,
        ...lockSteps(frames),
        trackStepMs: stepTiming("trackMs"),
        pyramidMs: stepTiming("pyramidMs"),
        alignMs: stepTiming("alignMs"),
        fitMs: stepTiming("fitMs"),
        frameLevels,
        fits: {
            n: fits.length,
            capped: fits.filter((f) => f.tracking.fitConverged === false).length,
            iterations: stats(fits.map((f) => f.tracking.fitIterations)),
        },
        quality: stats(track.map((f) => f.quality)),
        trackedPatches: stats(stepped.map((f) => f.tracking.inliers)),
        lowQualityTrackFrames: track.filter((f) => f.quality <= LOW_QUALITY).length,
        ...cornerJitter(frames),
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: PASS — 1 file, 35 tests (17 + 6 + 7 + 5).

- [ ] **Step 5: Format and commit**

```bash
cd /d/kalwalt-github/webarkit && npx prettier --ignore-path "" --write examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs && npm run test:examples && git add examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs && git commit -m "feat(examples): run metrics for the tracking state, each defined once

TRACK share, re-acquisitions (the first frame after a loop wrap counted
apart), a lock's first steps and a held lock's, trackMs on TRACK frames as
ADR-0001 point 5's figure, pyramidMs, alignMs and fitMs as the tracker
reports them, fit health, and the corners' jitter and spread. jitterPx is
their SD about each one-second window's straight line, so neither a clip's
drift nor a run's frame rate moves it; spreadPx is their SD over the run.
DEFINITIONS holds each metric's one text; a test checks every reported
metric has one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Aligning two exports

**Files:** Modify `examples/js/bench-metrics.mjs`. Create `examples/test/compare-exports.test.mjs`, `scripts/compare-bench.mjs`.

**Interfaces:**
- Consumes: `cornerJitter`, `summarizeRun`, `METRICS_VERSION`, `DEFINITIONS` (Task 2).
- Produces: `mediaKey(seconds): number` (microseconds); `compareExports(first, second) → { commonMediaTimes, first: CornerJitter, second: CornerJitter }`, throwing `Error("cannot compare these exports: …")`; CLI `node scripts/compare-bench.mjs <first.json> <second.json>` → Markdown table; exit 1 on refusal (one line on stderr), 2 on bad usage.

- [ ] **Step 1: Write the failing tests**

Create `examples/test/compare-exports.test.mjs`:

```js
/*
 *  compare-exports.test.mjs
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

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareExports, METRICS_VERSION } from "../js/bench-metrics.mjs";

const CLI = fileURLToPath(new URL("../../scripts/compare-bench.mjs", import.meta.url));

const at = (t, dx = 0) => ({
    mediaTimeSeconds: t,
    state: "TRACK",
    ok: true,
    corners: [
        [dx, 0],
        [1 + dx, 0],
        [1 + dx, 1],
        [dx, 1],
    ],
});
const lost = (t) => ({ mediaTimeSeconds: t, state: "LOST", ok: false, corners: null });
const run = (frames, o = {}) => ({
    metricsVersion: METRICS_VERSION,
    mode: "tracking",
    source: "bundled",
    bundledClip: "pinball-static.mp4",
    processingResolution: { width: 203, height: 360 },
    frames,
    ...o,
});

describe("compareExports", () => {
    it("restricts both runs to the media times both posed", () => {
        // The first run's frames off the common times are 7 px away: jitter if they were kept.
        const first = run([at(0.1, 7), at(0.2), at(0.3, 7), at(0.4), at(0.5, 7), at(0.6), at(0.7, 7), at(0.8)]);
        const second = run([at(0.2), lost(0.3), at(0.4), lost(0.5), at(0.6), at(0.8)], { mode: "stateless" });
        const r = compareExports(first, second);
        expect(r.commonMediaTimes).toBe(4);
        expect(r.first).toMatchObject({ posedFrames: 4, jitterWindows: 1, jitterPx: 0, spreadPx: 0 });
        expect(r.second).toMatchObject({ posedFrames: 4, jitterWindows: 1, jitterPx: 0 });
    });

    it("matches media times to the microsecond, not to the last bit", () => {
        expect(compareExports(run([at(5.933333)]), run([at(5.9333330000001)])).commonMediaTimes).toBe(1);
    });

    it("keeps every occurrence of a media time the loop revisits, one window per loop", () => {
        const loop = (dx) => [at(0.1, dx), at(0.2, dx), at(0.3, dx), at(0.4, dx)];
        const r = compareExports(run([...loop(0), ...loop(3)]), run(loop(0)));
        expect(r.first).toMatchObject({ posedFrames: 8, jitterWindows: 2, jitterPx: 0 });
        expect(r.second).toMatchObject({ posedFrames: 4, jitterWindows: 1 });
    });

    it.each([
        ["a webcam run", { source: "webcam", bundledClip: null }, /webcam/],
        ["an export from before per-frame corners", { metricsVersion: undefined }, /metricsVersion/],
        ["another clip", { bundledClip: "pinball-bench.mp4" }, /different footage/],
        ["another frame size", { processingResolution: { width: 480, height: 270 } }, /frame sizes/],
    ])("refuses %s", (_, other, why) => {
        expect(() => compareExports(run([]), run([], other))).toThrow(why);
    });
});

describe("scripts/compare-bench.mjs", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-bench-"));
    const write = (name, e) => {
        const p = join(dir, name);
        writeFileSync(p, JSON.stringify(e));
        return p;
    };
    const times = [0.1, 0.35, 0.6, 0.85];

    it("prints both runs and the aligned jitter", () => {
        const first = write("a.json", run(times.map((t) => at(t))));
        // x = 0, 1, 0, 1: a jitter of √0.4 about the window's line.
        const second = write("b.json", run(times.map((t, i) => at(t, i % 2)), { mode: "stateless" }));
        const r = spawnSync(process.execPath, [CLI, first, second], { encoding: "utf8" });
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toMatch(/\| jitterPx, 4 common media times \| 0\.000 \| 0\.632 \|/);
    });

    it("exits 1 with a one-line reason, not a stack trace, on exports it cannot align", () => {
        const first = write("c.json", run([at(0.1)]));
        const second = write("d.json", run([at(0.1)], { source: "webcam", bundledClip: null }));
        const r = spawnSync(process.execPath, [CLI, first, second], { encoding: "utf8" });
        expect(r.status).toBe(1);
        expect(r.stderr.trim()).toMatch(/^cannot compare these exports: the second is a webcam run/);
        expect(r.stderr).not.toMatch(/\n\s+at /);
    });

    it("exits 2 on bad usage", () => {
        const r = spawnSync(process.execPath, [CLI, "only-one.json"], { encoding: "utf8" });
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/^usage:/);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: FAIL — `compareExports is not a function` in its describe; the CLI tests fail (a missing script exits 1 with a `MODULE_NOT_FOUND` stack: the first on its status 0, the second on its stderr match, the third on status 2). Task 1–2's 35 tests pass.

- [ ] **Step 3: Implement `compareExports`**

Append to `examples/js/bench-metrics.mjs`:

```js
/** A media time as the key two exports are matched on: microseconds, as `requestVideoFrameCallback` reports them. */
export const mediaKey = (seconds) => Math.round(seconds * 1e6);

/**
 * Two exports of the same footage, aligned as `DEFINITIONS.alignment` says,
 * and {@link cornerJitter} of each. Two runs never process the same frames —
 * the main thread skips the ones it is too busy for, and two modes skip
 * different ones — so this is the comparison on common footage that their
 * arrays' indices cannot give. Throws on exports that cannot be aligned,
 * saying why.
 */
export function compareExports(first, second) {
    const refuse = (why) => {
        throw new Error(`cannot compare these exports: ${why}`);
    };
    for (const [name, e] of [
        ["the first", first],
        ["the second", second],
    ]) {
        if (!Array.isArray(e?.frames)) refuse(`${name} has no frames`);
        if (e.source === "webcam") {
            refuse(`${name} is a webcam run, whose mediaTimeSeconds is time since its stream started, not a position in a clip`);
        }
        if (e.metricsVersion !== METRICS_VERSION) {
            refuse(`${name} has metricsVersion ${e.metricsVersion ?? "(none)"}, not ${METRICS_VERSION}: its frames do not carry corners as defined here`);
        }
    }
    if (first.source !== second.source || first.bundledClip !== second.bundledClip) {
        refuse(`they ran on different footage (${first.bundledClip ?? first.source}, ${second.bundledClip ?? second.source})`);
    }
    const a = first.processingResolution;
    const b = second.processingResolution;
    if (a?.width !== b?.width || a?.height !== b?.height) {
        refuse(`their corners are in different frame sizes (${a?.width}x${a?.height}, ${b?.width}x${b?.height})`);
    }
    const posed = (e) => new Set(e.frames.filter((f) => f.corners).map((f) => mediaKey(f.mediaTimeSeconds)));
    const inFirst = posed(first);
    const common = new Set([...posed(second)].filter((k) => inFirst.has(k)));
    const restrict = (e) => e.frames.filter((f) => f.corners && common.has(mediaKey(f.mediaTimeSeconds)));
    return {
        commonMediaTimes: common.size,
        first: cornerJitter(restrict(first)),
        second: cornerJitter(restrict(second)),
    };
}
```

- [ ] **Step 4: Write the CLI**

Create `scripts/compare-bench.mjs`:

```js
/*
 *  compare-bench.mjs
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
 * Two `bench-nft.html` exports of the same footage, side by side: each run's
 * summary, recomputed from its frames, and the corners' jitter and spread on
 * the frames both runs posed (`compareExports` and `DEFINITIONS` in
 * examples/js/bench-metrics.mjs define every number printed here).
 *
 *     node scripts/compare-bench.mjs <first.json> <second.json>
 *
 * Exits 1, with a one-line reason, on two exports it cannot align; 2 on bad
 * usage.
 */

import { readFileSync } from "node:fs";
import { compareExports, DEFINITIONS, summarizeRun } from "../examples/js/bench-metrics.mjs";

const [firstPath, secondPath] = process.argv.slice(2);
if (!firstPath || !secondPath) {
    console.error("usage: node scripts/compare-bench.mjs <first.json> <second.json>");
    process.exit(2);
}
const first = JSON.parse(readFileSync(firstPath, "utf8"));
const second = JSON.parse(readFileSync(secondPath, "utf8"));

let aligned;
try {
    aligned = compareExports(first, second);
} catch (e) {
    console.error(e.message);
    process.exit(1);
}
if (first.source === "file") {
    console.warn("Both are 'video file' runs: nothing in the exports shows they used the same file.");
}

const a = summarizeRun(first.frames);
const b = summarizeRun(second.frames);
const num = (v, digits) => (v === null || v === undefined ? "—" : v.toFixed(digits));
const share = (v) => (v === null ? "—" : `${(100 * v).toFixed(1)}%`);
const ms = (s) => (s.n > 0 ? `${num(s.p50, 2)} / ${num(s.p95, 2)} (n ${s.n})` : "—");
const name = (e, path) => `${e.mode}, ${e.target?.file ?? "target not recorded"} (${path})`;
const counts = (s) => `${s.frames} (${s.states.LOST} / ${s.states.DETECT} / ${s.states.TRACK})`;
const rows = [
    ["run", name(first, firstPath), name(second, secondPath)],
    ["footage", first.bundledClip ?? first.source, second.bundledClip ?? second.source],
    ["frames (LOST / DETECT / TRACK)", counts(a), counts(b)],
    ["TRACK share", share(a.trackShare), share(b.trackShare)],
    ["re-acquisitions (at loop wraps)", `${a.reacquisitions} (${a.reacquisitionsAtLoopWrap})`, `${b.reacquisitions} (${b.reacquisitionsAtLoopWrap})`],
    ["first steps confirmed", `${a.firstSteps.confirmed} / ${a.firstSteps.n}`, `${b.firstSteps.confirmed} / ${b.firstSteps.n}`],
    ["held-lock steps lost", `${a.heldLockSteps.lost} / ${a.heldLockSteps.n}`, `${b.heldLockSteps.lost} / ${b.heldLockSteps.n}`],
    ["trackStepMs p50 / p95", ms(a.trackStepMs), ms(b.trackStepMs)],
    ["pyramidMs p50 / p95", ms(a.pyramidMs), ms(b.pyramidMs)],
    ["capped fits / fits", `${a.fits.capped} / ${a.fits.n}`, `${b.fits.capped} / ${b.fits.n}`],
    ["jitterPx, whole window", num(a.jitterPx, 3), num(b.jitterPx, 3)],
    ["spreadPx, whole window", num(a.spreadPx, 3), num(b.spreadPx, 3)],
    [`jitterPx, ${aligned.commonMediaTimes} common media times`, num(aligned.first.jitterPx, 3), num(aligned.second.jitterPx, 3)],
    [`spreadPx, ${aligned.commonMediaTimes} common media times`, num(aligned.first.spreadPx, 3), num(aligned.second.spreadPx, 3)],
];
console.log("| | first | second |");
console.log("|---|---|---|");
for (const [label, x, y] of rows) console.log(`| ${label} | ${x} | ${y} |`);
console.log(`\njitterPx: ${DEFINITIONS.jitterPx}\n\nspreadPx: ${DEFINITIONS.spreadPx}\n\nCommon media times: ${DEFINITIONS.alignment}`);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: PASS — 2 files, 45 tests (35 + 7 + 3).

- [ ] **Step 6: Format and commit**

```bash
cd /d/kalwalt-github/webarkit && npx prettier --write scripts/compare-bench.mjs && npx prettier --ignore-path "" --write examples/js/bench-metrics.mjs examples/test/compare-exports.test.mjs && npm run test:examples && npm run format:check && git add examples/js/bench-metrics.mjs examples/test/compare-exports.test.mjs scripts/compare-bench.mjs && git commit -m "feat(examples): align two bench exports by media time

compareExports restricts two exports of one clip to the media times both
posed, to the microsecond, and takes the corners' jitter and spread of
each: two runs skip different frames, so their indices never line up.
jitterPx is windowed, so the two restricted runs measure the same thing
whatever their frame rates. It refuses a webcam run, an export without
metricsVersion 1, another clip and another frame size, in one line.
scripts/compare-bench.mjs prints both summaries and the aligned numbers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: 45 passed; `All matched files use Prettier code style!`.

---

### Task 4: Page and replay logic, tested: URL parameters, trackability, probe, schedule, target record

**Files:** Modify `examples/js/bench-metrics.mjs`, `examples/test/bench-metrics.test.mjs`.

**Interfaces:**
- Consumes: `percentile`, `mediaKey` (Tasks 1, 3).
- Produces:
  - `MODES` (frozen `["stateless", "detection-only", "tracking"]`); `parsePositiveInt(raw): number | null`; `parseRunParams(search, { bundledClips }) → { maxKeypoints, procWidth, procHeight, camera, mode, target, windowSize, clip }` (each `null` when absent or out of domain; `camera` is a `facingMode` value; `target` defaults to `"wnft"` for `mode=tracking`; `windowSize` clamped to 10–2000).
  - `trackabilityError(db, minTrackedPatches): string | null` — the constructor's rule (`patches` present, `patchSize ≥ 3`, `count ≥ minTrackedPatches`).
  - `clockResolution(clock, samples = 50): number | null`; `timeRepeated(fn, { clock, warmup = 50, runs = 300 }) → { p50, p95 }`; `texturedFrame(width, height) → GrayImage`.
  - `sha256Hex(bytes, subtle = globalThis.crypto?.subtle): Promise<string | null>`; `targetRecord({ source, file, sha256, db, builtWith = null })`.
  - `nextFrameIndex(times, i, busyMs): number`; `framesAt(pts, mediaTimes): number[]`.

- [ ] **Step 1: Write the failing tests**

Extend the import in `examples/test/bench-metrics.test.mjs` (case-insensitive alphabetical, as Task 2's list) with `clockResolution`, `framesAt`, `MODES`, `nextFrameIndex`, `parsePositiveInt`, `parseRunParams`, `sha256Hex`, `targetRecord`, `texturedFrame`, `timeRepeated`, `trackabilityError`, and append:

```js
describe("parsePositiveInt and parseRunParams", () => {
    const clips = ["pinball-bench.mp4", "pinball-static.mp4"];

    it("reads a positive integer, and nothing else", () => {
        expect(parsePositiveInt("300")).toBe(300);
        expect(parsePositiveInt("150.9")).toBe(150);
        for (const raw of [null, "", " ", "abc", "0", "-5", "1e999"]) expect(parsePositiveInt(raw)).toBeNull();
    });

    it("sets nothing without parameters", () => {
        expect(parseRunParams("", { bundledClips: clips })).toEqual({
            maxKeypoints: null,
            procWidth: null,
            procHeight: null,
            camera: null,
            mode: null,
            target: null,
            windowSize: null,
            clip: null,
        });
    });

    it("reads a tracking run's URL, and gives tracking the file by default", () => {
        const p = parseRunParams("?mode=tracking&window=300&clip=pinball-static.mp4&maxKeypoints=150", {
            bundledClips: clips,
        });
        expect(p).toMatchObject({ mode: "tracking", target: "wnft", windowSize: 300, clip: "pinball-static.mp4", maxKeypoints: 150 });
    });

    it("keeps an explicit target, even one tracking cannot use: Start refuses it", () => {
        expect(parseRunParams("?mode=tracking&target=image", { bundledClips: clips }).target).toBe("image");
    });

    it("drops what is out of its domain, and clamps the window to 10–2000", () => {
        const p = parseRunParams("?mode=tracker&target=png&clip=other.mp4&window=5&camera=side", { bundledClips: clips });
        expect(p).toMatchObject({ mode: null, target: null, clip: null, windowSize: 10, camera: null });
        expect(parseRunParams("?window=99999", { bundledClips: clips }).windowSize).toBe(2000);
        expect(parseRunParams("?camera=front", { bundledClips: clips }).camera).toBe("user");
        expect(parseRunParams("?camera=rear", { bundledClips: clips }).camera).toBe("environment");
        expect(MODES).toEqual(["stateless", "detection-only", "tracking"]);
    });
});

describe("trackabilityError", () => {
    const db = (patches) => ({ patches });

    it("accepts a target NftTracker would track", () => {
        expect(trackabilityError(db({ count: 64, patchSize: 16 }), 8)).toBeNull();
    });

    it.each([
        ["no patches", undefined, /no patches/],
        ["patches under 3 × 3", { count: 64, patchSize: 2 }, /3 × 3/],
        ["fewer patches than minTrackedPatches", { count: 7, patchSize: 16 }, /minTrackedPatches/],
    ])("refuses a target with %s, naming targets/pinball.wnft", (_, patches, why) => {
        const message = trackabilityError(db(patches), 8);
        expect(message).toMatch(why);
        expect(message).toMatch(/targets\/pinball\.wnft/);
    });
});

describe("clockResolution", () => {
    it("finds the smallest step a coarse clock takes", () => {
        let calls = 0;
        expect(clockResolution(() => Math.floor(calls++ / 7) * 0.1, 20)).toBeCloseTo(0.1, 12);
    });

    it("is null for a clock that never moves", () => {
        expect(clockResolution(() => 5, 2)).toBeNull();
    });
});

describe("timeRepeated", () => {
    it("times runs after untimed warm-up runs, and ranks p50 and p95 as bench-tracking.mjs does", () => {
        let now = 0;
        let i = 0;
        const r = timeRepeated(() => void (now += ++i), { clock: () => now, warmup: 5, runs: 10 });
        // Timed calls add 6 … 15: p50 is rank 5 of 10, p95 rank 9.
        expect(r).toEqual({ p50: 11, p95: 15 });
    });
});

describe("texturedFrame", () => {
    it("is bench-tracking.mjs's texture, pixel for pixel", () => {
        const f = texturedFrame(5, 4);
        expect(f.width).toBe(5);
        expect(f.height).toBe(4);
        expect(f.data).toBeInstanceOf(Uint8Array);
        for (const [x, y] of [
            [0, 0],
            [4, 0],
            [2, 3],
            [4, 3],
        ]) {
            const v =
                128 +
                50 * Math.sin(0.35 * x + 0.2 * y) +
                40 * Math.cos(0.23 * y - 0.31 * x) +
                20 * Math.sin(0.57 * x) * Math.cos(0.49 * y);
            expect(f.data[y * 5 + x]).toBe(Math.round(v));
        }
    });
});

describe("sha256Hex and targetRecord", () => {
    it("hashes bytes to lowercase hex", async () => {
        expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });

    it("is null without SubtleCrypto, as on a page served over plain http from another host", async () => {
        expect(await sha256Hex(new Uint8Array(1), null)).toBeNull();
    });

    const meta = { widthPx: 512, heightPx: 640 };
    const pyramid = { scaleStep: Math.cbrt(2), levelSizes: [[512, 640], [406, 507]] };

    it("says what a decoded target carries", () => {
        const db = { meta, pyramid, keypoints: { count: 2062 }, patches: { count: 64, patchSize: 16 } };
        expect(targetRecord({ source: "wnft", file: "targets/pinball.wnft", sha256: "ab", db })).toEqual({
            source: "wnft",
            file: "targets/pinball.wnft",
            sha256: "ab",
            builtWith: null,
            widthPx: 512,
            heightPx: 640,
            levels: 2,
            keypoints: 2062,
            patches: 64,
            patchSize: 16,
        });
    });

    it("says a target built in the page has no patches, and how it was built", () => {
        const db = { meta, pyramid, keypoints: { count: 2067 } };
        const builtWith = { function: "buildTargetFromImage", maxSide: 640, levels: 8 };
        expect(targetRecord({ source: "image", file: "images/pinball.jpg", sha256: null, db, builtWith })).toMatchObject({
            patches: 0,
            patchSize: null,
            builtWith,
        });
    });
});

describe("nextFrameIndex and framesAt", () => {
    const times = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30];

    it("takes the first frame at or after the busy time, and runs off the end when there is none", () => {
        expect(nextFrameIndex(times, 0, 10)).toBe(1); // done before the next frame
        expect(nextFrameIndex(times, 0, 50)).toBe(2); // 50 ms: frame 1 (33 ms) went stale
        expect(nextFrameIndex(times, 1, 30)).toBe(2); // under one interval (33.3 ms)
        expect(nextFrameIndex(times, 4, 120)).toBe(6);
    });

    it("finds each media time's frame to the microsecond, and throws on one no frame has", () => {
        expect(framesAt([0.1, 0.133333, 0.166667], [0.166667, 0.1333330000001, 0.1])).toEqual([2, 1, 0]);
        expect(() => framesAt([0.1, 0.133333], [0.12])).toThrow(/no frame at media time 0\.12/);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: FAIL — the new describes with `… is not a function` or `undefined`; the earlier 45 tests pass.

- [ ] **Step 3: Implement**

Append to `examples/js/bench-metrics.mjs`:

```js
/** The page's modes, as its `<select>` and the `?mode=` parameter name them. */
export const MODES = Object.freeze(["stateless", "detection-only", "tracking"]);

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
 */
export function parseRunParams(search, { bundledClips }) {
    const p = new URLSearchParams(search);
    const mode = MODES.includes(p.get("mode")) ? p.get("mode") : null;
    const t = p.get("target");
    const windowSize = parsePositiveInt(p.get("window"));
    const camera = p.get("camera");
    return {
        maxKeypoints: parsePositiveInt(p.get("maxKeypoints")),
        procWidth: parsePositiveInt(p.get("procWidth")),
        procHeight: parsePositiveInt(p.get("procHeight")),
        camera: camera === "front" ? "user" : camera === "rear" ? "environment" : null,
        mode,
        target: t === "image" || t === "wnft" ? t : mode === "tracking" ? "wnft" : null,
        windowSize: windowSize === null ? null : Math.min(2000, Math.max(10, windowSize)),
        clip: bundledClips.includes(p.get("clip")) ? p.get("clip") : null,
    };
}

/**
 * Why `NftTracker` would run detection-only on `db` — the constructor's rule:
 * no patches, patches under 3 × 3, or fewer than `minTrackedPatches` — or
 * `null` when it would track. The page checks this before starting a
 * tracking run, so a run is never exported as tracking while it detects.
 */
export function trackabilityError(db, minTrackedPatches) {
    const p = db.patches;
    const use = "choose targets/pinball.wnft";
    if (!p) return `Tracking needs a target with patches, and this one has no patches: ${use}.`;
    if (p.patchSize < 3) return `This target's patches are ${p.patchSize} × ${p.patchSize}, and alignPatch needs at least 3 × 3: ${use}.`;
    if (p.count < minTrackedPatches) {
        return `This target has ${p.count} patches, fewer than minTrackedPatches (${minTrackedPatches}): ${use}.`;
    }
    return null;
}

/**
 * The smallest step `clock` was seen to take over `samples` attempts, or
 * `null` if it never moved. Chrome coarsens `performance.now()` to 0.1 ms on a
 * page that is not cross-origin isolated, so a stage under that reads 0 or
 * 0.1 ms; exports record this so such values are read as what they are.
 */
export function clockResolution(clock, samples = 50) {
    let best = Infinity;
    for (let s = 0; s < samples; s++) {
        const t0 = clock();
        let t1 = t0;
        for (let spin = 0; t1 === t0 && spin < 1e6; spin++) t1 = clock();
        if (t1 > t0) best = Math.min(best, t1 - t0);
    }
    return best === Infinity ? null : best;
}

/**
 * `fn` timed `runs` times after `warmup` untimed runs, `{ p50, p95 }` in the
 * clock's unit: the method of packages/nft-tracker/scripts/bench-tracking.mjs,
 * whose numbers #63's device estimates came from, so the page's probe measures
 * what that script estimated.
 */
export function timeRepeated(fn, { clock, warmup = 50, runs = 300 }) {
    for (let i = 0; i < warmup; i++) fn();
    const samples = new Array(runs);
    for (let i = 0; i < runs; i++) {
        const t0 = clock();
        fn();
        samples[i] = clock() - t0;
    }
    samples.sort((a, b) => a - b);
    return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

/**
 * The smooth, deterministic texture bench-tracking.mjs times the frame pyramid
 * on. The pyramid's arithmetic does not depend on the pixels; the texture
 * matches so the two measurements are of the same thing.
 */
export function texturedFrame(width, height) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v =
                128 +
                50 * Math.sin(0.35 * x + 0.2 * y) +
                40 * Math.cos(0.23 * y - 0.31 * x) +
                20 * Math.sin(0.57 * x) * Math.cos(0.49 * y);
            data[y * width + x] = Math.round(v);
        }
    }
    return { data, width, height };
}

/**
 * SHA-256 of `bytes` as lowercase hex, or `null` without SubtleCrypto — which
 * browsers give only to a secure context (https://, or http://localhost).
 */
export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
    if (!subtle) return null;
    const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What an export records about the target a run used: where it came from
 * (`"wnft"`, a file loaded and decoded; `"image"`, built in the page), the
 * file and its SHA-256, how it was built when it was, and what it carries.
 */
export function targetRecord({ source, file, sha256, db, builtWith = null }) {
    return {
        source,
        file,
        sha256,
        builtWith,
        widthPx: db.meta.widthPx,
        heightPx: db.meta.heightPx,
        levels: db.pyramid.levelSizes.length,
        keypoints: db.keypoints.count,
        patches: db.patches ? db.patches.count : 0,
        patchSize: db.patches ? db.patches.patchSize : null,
    };
}

/**
 * The frame a device busy for `busyMs` after frame `i` processes next: the
 * first whose time is at or after `times[i] + busyMs`, or `times.length`
 * when none is. `times` ascending, seconds — the desktop replay's model of
 * `requestVideoFrameCallback` skipping the frames that went stale.
 */
export function nextFrameIndex(times, i, busyMs) {
    const until = times[i] + busyMs / 1000;
    let j = i + 1;
    while (j < times.length && times[j] < until) j++;
    return j;
}

/** The index in `pts` of each of `mediaTimes`, matched to the microsecond; throws on one no frame has. */
export function framesAt(pts, mediaTimes) {
    const index = new Map(pts.map((t, i) => [mediaKey(t), i]));
    return mediaTimes.map((t) => {
        const i = index.get(mediaKey(t));
        if (i === undefined) throw new Error(`no frame at media time ${t}`);
        return i;
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /d/kalwalt-github/webarkit && npm run test:examples`
Expected: PASS — 2 files, 64 tests (45 + 5 + 4 + 2 + 1 + 1 + 4 + 2; each `it.each` row is a test).

- [ ] **Step 5: Format and commit**

```bash
cd /d/kalwalt-github/webarkit && npx prettier --ignore-path "" --write examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs && npm run test:examples && git add examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs && git commit -m "feat(examples): the bench page's URL, target and probe logic, tested

parseRunParams reads the run from the address bar (mode, target, window,
clip, and the existing budget, box and camera), defaulting a tracking run
to the target file. trackabilityError is NftTracker's own rule, checked
before a tracking run starts. clockResolution, timeRepeated and
texturedFrame time the frame pyramid on the device by bench-tracking.mjs's
method; targetRecord and sha256Hex say which target a run used;
nextFrameIndex and framesAt are the desktop replay's schedule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The page

The page's layout is not test-driven (brief); its logic is Tasks 1–4's. This task wires it and verifies it with a headless desktop smoke run.

**Files:** Modify `examples/bench-nft.html`.

**Interfaces:**
- Consumes: `bench-metrics.mjs` (everything above); from `@webarkit/nft-tracker`: `decode`, `buildFramePyramid`, `NftTracker` (`detectionOnly`, `clock`, `.detectionOnly`), the `DEFAULT_*` constants.
- Produces: an export with the existing fields plus `metricsVersion`, `target`, `tracker`, `clockResolutionMs`, `crossOriginIsolated`, `ticks`, `definitions`, `runSummary`; frames with `state`, `quality`, `trackLoss`, `tracking`, `trackerTimings`, `corners`. A `{ kind: "pyramid-probe", … }` export from the probe.

- [ ] **Step 1: Markup** — lede, mode, target, buttons, summary panel, legend, CSS.

Replace the `<p class="lede">…</p>` (lines 247–259) with:

```html
    <p class="lede">
      Measures the <code>detect → describe → match → estimateHomography → poseFromHomography</code> pipeline and
      <code>NftTracker</code>'s tracking state frame-by-frame, on this device, against a live webcam or a looped video
      file. Measurement only — nothing here changes how the pipeline runs, it only times it. Three modes share every
      parameter and call the backend the same way: <strong>stateless pipeline</strong> writes the detection calls out
      inline (as the <a href="./pinball-static-jsfeatnext-backend.html">static demo</a> does);
      <strong>NftTracker, detection-only</strong> runs <code>tracker.process()</code> with
      <code>detectionOnly: true</code> — M1 of
      <a href="../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md">ADR-0001</a>, which reports the same
      numbers as the stateless pipeline; <strong>NftTracker, tracking</strong> runs M2's
      <code>LOST → DETECT → TRACK</code> state machine, which needs a target with patches:
      <code>targets/pinball.wnft</code>, loaded from the file, never built here. Every run metric is defined once, in
      <code>js/bench-metrics.mjs</code>, and each export carries those definitions.
    </p>
```

Replace the options of `<select id="mode">` with:

```html
                <select id="mode">
                  <option value="stateless" selected>stateless pipeline</option>
                  <option value="detection-only">NftTracker, detection-only</option>
                  <option value="tracking">NftTracker, tracking</option>
                </select>
```

After the row that holds `procHeight` (its closing `</div>`), insert:

```html
            <div class="row">
              <label
                >target
                <select id="target">
                  <option value="image" selected>built here from images/pinball.jpg (no patches)</option>
                  <option value="wnft">targets/pinball.wnft, loaded (patches)</option>
                </select>
              </label>
            </div>
```

In `.buttons`, after the Download button: `<button id="probe" class="secondary" disabled>Time frame pyramid</button>`.

After the "Per-stage timing" panel's closing `</div>`:

```html
        <div class="panel">
          <h2>Run summary, over the window</h2>
          <dl id="summary"></dl>
          <p class="definition" id="definitions"></p>
        </div>
```

Replace the legend's second `<span>` with:

```html
            <span><i class="swatch" style="background: #fbbf24"></i> target outline, detected (DETECT)</span>
            <span><i class="swatch" style="background: #4ade80"></i> target outline, tracked (TRACK)</span>
```

In `<style>`, after the `.err` rule:

```css
      .definition {
        color: var(--muted);
        font-size: 12px;
        margin: 10px 0 0;
        white-space: pre-line;
      }
```

- [ ] **Step 2: Imports and constants**

Replace the module script's two `import` statements with:

```js
      import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
      import {
        buildFramePyramid,
        buildLevelIndex,
        buildTargetFromImage,
        chooseDescriptorSet,
        decode,
        matchPerLevel,
        NftTracker,
        DEFAULT_ALIGN_EPSILON,
        DEFAULT_ALIGN_MAX_ITERATIONS,
        DEFAULT_FIT_EPSILON,
        DEFAULT_FIT_MAX_ITERATIONS,
        DEFAULT_MAX_FIT_RMS,
        DEFAULT_MAX_FRAME_LEVELS,
        DEFAULT_MAX_OUTLIER_SHARE,
        DEFAULT_MAX_SCENE_KEYPOINTS,
        DEFAULT_MIN_PATCH_ZNCC,
        DEFAULT_MIN_TRACKED_PATCHES,
        DEFAULT_PHOTOMETRIC,
        DEFAULT_RANSAC_THRESHOLD,
        DEFAULT_RATIO,
        DEFAULT_SCENE_LEVELS,
        DEFAULT_TUKEY_C,
      } from "@webarkit/nft-tracker";
      import { toGrayTimed } from "./js/pinball-shared.mjs";
      import {
        clockResolution,
        DEFINITIONS,
        frameRecord,
        framesForStage,
        METRICS_VERSION,
        parsePositiveInt,
        parseRunParams,
        percentile,
        sha256Hex,
        summarizeRun,
        targetCorners,
        targetRecord,
        texturedFrame,
        timeRepeated,
        trackabilityError,
      } from "./js/bench-metrics.mjs";
```

(`project` is no longer imported: the overlay draws the record's `corners`.)

Replace `const TARGET = "./images/pinball.jpg";` and `const TARGET_LEVELS = 8;` with:

```js
      const TARGET_IMAGE = "./images/pinball.jpg";
      const TARGET_FILE = "./targets/pinball.wnft";
      const TARGET_LEVELS = 8;
      /** The long side the in-page target is built at, as the webcam demo builds its own. */
      const TARGET_MAX_SIDE = 640;
      /** The tracking step's own timings (TrackTimings), shown over TRACK frames only — see DEFINITIONS. */
      const TRACKER_STAGES = ["trackMs", "pyramidMs", "alignMs", "fitMs"];
      const TRACKER_STAGE_LABELS = {
        trackMs: "tracking step, TRACK frames",
        pyramidMs: "· frame pyramid",
        alignMs: "· patch alignment",
        fitMs: "· robust fit",
      };
      /** The injected clock: the tracker reads none of its own (ADR-0001 point 7). */
      const clock = () => performance.now();
      /** buildFramePyramid on this device, at the sizes and depths #63 estimated by proxy (docs/benchmarks/README.md). */
      const PROBE_SIZES = [
        [270, 360],
        [480, 270],
        [640, 480],
      ];
      const PROBE_LEVELS = [1, 2, 3, 4, 5, 6];
      const PROBE_SCALE_STEP = Math.cbrt(2);
      const PROBE_WARMUP = 50;
      const PROBE_RUNS = 300;
```

After `const downloadButton = $("download");`:

```js
      const probeButton = $("probe");
      const modeSelect = $("mode");
      const targetSelect = $("target");
      const windowSizeInput = $("windowSize");
      const summaryDl = $("summary");
```

- [ ] **Step 3: State; the moved functions**

After `let lastProcessingResolution = …;`:

```js
      /** The target the last run used (`targetRecord`) and its tracker's configuration, snapshotted at Start. */
      let lastTarget = null;
      let lastTracker = null;
      /** Frames processed since Start, of which the window keeps the last windowSize: the export's `ticks`. */
      let ticks = 0;
      /** The two targets, prepared at page load: `image` always, `wnft` when the file loaded. */
      const targets = { image: null, wnft: null };
      /** `clockResolution(clock)`, measured once at page load. */
      let clockResolutionMs = null;
```

Delete the page's own `framesForStage` (with its doc comment), `percentile` and `parsePositiveInt`: all three now come from `bench-metrics.mjs`. Each existing `framesForStage(s)` call becomes `framesForStage(history, s)`.

- [ ] **Step 4: Percentile table, run summary, definitions**

Replace `renderPercentiles` with:

```js
      function renderPercentiles() {
        percentilesBody.replaceChildren();
        const rows = activeStages().map((s) => [STAGE_LABELS[s], framesForStage(history, s).map((f) => f.timings[s])]);
        if (lastMode !== "stateless") {
          const track = history.filter((f) => f.state === "TRACK" && f.trackerTimings);
          for (const k of TRACKER_STAGES) rows.push([TRACKER_STAGE_LABELS[k], track.map((f) => f.trackerTimings[k])]);
        }
        for (const [label, raw] of rows) {
          const values = raw.sort((a, b) => a - b);
          const tr = document.createElement("tr");
          const cells = [
            label,
            values.length ? percentile(values, 50).toFixed(2) : "—",
            values.length ? percentile(values, 95).toFixed(2) : "—",
            values.length ? values[values.length - 1].toFixed(2) : "—",
          ];
          for (const c of cells) {
            const td = document.createElement("td");
            td.textContent = c;
            tr.append(td);
          }
          percentilesBody.append(tr);
        }
      }

      /** The run's summary over the window: `summarizeRun`, whose every key DEFINITIONS explains. */
      function renderSummary() {
        const s = summarizeRun(history);
        const ms = (st) => (st.n ? `${st.p50.toFixed(2)} / ${st.p95.toFixed(2)} ms (n ${st.n})` : "—");
        const px = (v) => (v === null ? "—" : `${v.toFixed(3)} px`);
        const rows = [
          ["target", lastTarget ? `${lastTarget.file}, ${lastTarget.patches} patches` : "—"],
          ["frames", `${s.frames}: LOST ${s.states.LOST}, DETECT ${s.states.DETECT}, TRACK ${s.states.TRACK}`],
          ["TRACK share", s.trackShare === null ? "—" : `${(100 * s.trackShare).toFixed(1)}%`],
          ["re-acquisitions", `${s.reacquisitions} (+${s.reacquisitionsAtLoopWrap} at loop wraps)`],
          ["first steps confirmed", `${s.firstSteps.confirmed} of ${s.firstSteps.n}`],
          ["held-lock steps lost", `${s.heldLockSteps.lost} of ${s.heldLockSteps.n}`],
          ["tracking step p50 / p95", `${ms(s.trackStepMs)}; ADR-0001 point 5: 8 ms at p95`],
          ["frame pyramid p50 / p95", ms(s.pyramidMs)],
          ["capped fits", `${s.fits.capped} of ${s.fits.n}`],
          ["jitter", px(s.jitterPx)],
          ["spread", px(s.spreadPx)],
        ];
        summaryDl.replaceChildren();
        for (const [label, value] of rows) {
          const dt = document.createElement("dt");
          dt.textContent = label;
          const dd = document.createElement("dd");
          dd.textContent = value;
          summaryDl.append(dt, dd);
        }
      }

      function renderDefinitions() {
        $("definitions").textContent = [
          `tracking step — ${DEFINITIONS.trackStepMs}`,
          `jitter — ${DEFINITIONS.jitterPx}`,
          `spread — ${DEFINITIONS.spreadPx}`,
        ].join("\n\n");
      }
```

- [ ] **Step 5: Overlay from the record**

```js
      function drawOverlay(result, record) {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        octx.fillStyle = "#60a5fa";
        for (const k of result.sceneKeypoints) octx.fillRect(k.x - 1, k.y - 1, 2, 2);
        if (record.corners) {
          octx.strokeStyle = record.state === "TRACK" ? "#4ade80" : "#fbbf24";
          octx.lineWidth = 3;
          octx.beginPath();
          record.corners.forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y)));
          octx.closePath();
          octx.stroke();
        }
      }
```

- [ ] **Step 6: The tracker's configuration, and `runBenchmark`**

Before `runBenchmark`:

```js
      /**
       * The tracker's options as this page runs it: its own defaults, which the
       * page does not override, except the scene keypoint budget. Recorded in
       * the export so a run stays readable after a default changes.
       */
      function trackerOptions(maxKeypoints, mode) {
        return {
          detectionOnly: mode === "detection-only",
          sceneLevels: DEFAULT_SCENE_LEVELS,
          maxSceneKeypoints: maxKeypoints,
          ratio: DEFAULT_RATIO,
          ransacThreshold: DEFAULT_RANSAC_THRESHOLD,
          maxFrameLevels: DEFAULT_MAX_FRAME_LEVELS,
          alignMaxIterations: DEFAULT_ALIGN_MAX_ITERATIONS,
          alignEpsilon: DEFAULT_ALIGN_EPSILON,
          photometric: DEFAULT_PHOTOMETRIC,
          tukeyC: DEFAULT_TUKEY_C,
          fitMaxIterations: DEFAULT_FIT_MAX_ITERATIONS,
          fitEpsilon: DEFAULT_FIT_EPSILON,
          minTrackedPatches: DEFAULT_MIN_TRACKED_PATCHES,
          maxOutlierShare: DEFAULT_MAX_OUTLIER_SHARE,
          maxFitRms: DEFAULT_MAX_FIT_RMS,
          minPatchZncc: DEFAULT_MIN_PATCH_ZNCC,
        };
      }
```

In `runBenchmark`, replace the tracker construction (`const tracker = mode === "tracker" ? … : null;`) with:

```js
        lastTracker = null;
        const tracker =
          mode === "stateless"
            ? null
            : new NftTracker(icv, targetDb, K, {
                maxSceneKeypoints: maxKeypoints,
                detectionOnly: mode === "detection-only",
                clock,
              });
        // Start already refused an untrackable target (trackabilityError, the
        // constructor's own rule); this only guards the two drifting apart.
        if (mode === "tracking" && tracker.detectionOnly) {
          throw new Error("The tracker would run detection-only on this target: use targets/pinball.wnft.");
        }
        lastTracker = tracker ? { detectionOnly: tracker.detectionOnly, options: trackerOptions(maxKeypoints, mode) } : null;
        ticks = 0;
        const targetPoints = targetCorners(targetDb.meta.widthPx, targetDb.meta.heightPx);
```

In `tick`, replace everything from `history.push({` through the end of `renderStats([…]);` (the `statusText` computation included) with:

```js
          // `mediaTimeSeconds`: the frame's position in the clip; see
          // frameRecord's doc and examples/README.md ("A shared startAt is not
          // a shared frame sequence"). Compare two exports by it, never by index.
          const record = frameRecord({
            mode,
            result,
            stageTimings: timings,
            timestampMs: t0,
            mediaTimeSeconds: metadata?.mediaTime ?? video.currentTime,
            targetPoints,
          });
          ticks++;
          history.push(record);
          if (history.length > windowSize) history.splice(0, history.length - windowSize);

          drawOverlay(result, record);
          const tracked = record.state === "TRACK";
          const statusText = tracked
            ? "tracking"
            : record.ok
              ? "locked on (detected)"
              : record.reason === "too-few-matches"
                ? "too few matches"
                : "no consensus";
          renderStats([
            ["status", statusText],
            ["mode", mode],
            ["state", record.state],
            ["target", lastTarget.file],
            ["fps", fps.toFixed(1)],
            ["keypoints (scene)", tracked ? "— (not detected)" : `${record.numSceneKeypoints} / ${maxKeypoints}`],
            ["matches", tracked ? "—" : record.numMatches],
            ["inliers", !tracked && record.numMatches >= 4 ? `${record.numInliers} / ${record.numMatches}` : "—"],
            ["tracked patches", tracked ? `${record.tracking.inliers} / ${record.tracking.attempted}` : "—"],
            ["quality", record.quality === null ? "—" : record.quality.toFixed(2)],
            ["track loss", record.trackLoss ?? "—"],
            ["tracking step", record.tracking && record.trackerTimings ? `${record.trackerTimings.trackMs.toFixed(1)} ms` : "—"],
            ["pose", result.ok ? (result.pose.good ? "recovered" : "degenerate") : "—"],
            ["frame time", `${timings.total.toFixed(1)} ms`],
            // Last, as before: the CDP driver reads the window count from the last row.
            ["window", `${history.length} / ${windowSize}`],
          ]);
```

The old inline comments on `mediaTimeSeconds` and `numSceneKeypoints` go: `frameRecord`'s doc (Task 1) now carries both, and the comment above keeps the pointer.

In the throttled block, render both:

```js
          if (now - lastPercentileRenderAt >= PERCENTILE_RENDER_INTERVAL_MS || history.length === 1) {
            lastPercentileRenderAt = now;
            renderPercentiles();
            renderSummary();
          }
```

- [ ] **Step 7: Export**

Replace `downloadHistory` with a save helper and the run export:

```js
      function saveJson(payload, name) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      function deviceSlug() {
        return ($("deviceLabel").value || "device").replace(/[^a-z0-9-]+/gi, "-");
      }

      function downloadHistory() {
        const summary = {};
        for (const s of activeStages()) {
          const values = framesForStage(history, s)
            .map((f) => f.timings[s])
            .sort((a, b) => a - b);
          summary[s] = {
            p50: values.length ? percentile(values, 50) : null,
            p95: values.length ? percentile(values, 95) : null,
            max: values.length ? values[values.length - 1] : null,
          };
        }

        const payload = {
          exportedAt: new Date().toISOString(),
          // The version of js/bench-metrics.mjs's definitions this export's
          // metrics and per-frame fields follow; `definitions` spells them out.
          // Absent in exports that predate the tracking mode.
          metricsVersion: METRICS_VERSION,
          userAgent: navigator.userAgent,
          deviceLabel: $("deviceLabel").value || null,
          mode: lastMode,
          // Which target the run used (targetRecord): its file, SHA-256, and
          // what it carries. Absent in older exports, which all built theirs
          // from images/pinball.jpg in the page.
          target: lastTarget,
          // The tracker's options as it ran (null for the stateless pipeline):
          // its defaults, except maxSceneKeypoints.
          tracker: lastTracker,
          // The step performance.now() takes here; a timing under it reads 0.
          clockResolutionMs,
          crossOriginIsolated: globalThis.crossOriginIsolated === true,
          // Frames processed since Start; the window is the last windowSize of
          // them, so ticks − windowSize frames ran before it (warm-up).
          ticks,
          source: lastSource,
          // … every existing field below keeps its current comment verbatim …
          bundledClip: lastBundledClip,
          camera: lastCamera,
          sourceResolution: lastSourceResolution,
          startAtSeconds: lastStartAtSeconds,
          maxKeypoints: lastMaxKeypoints,
          processingBox: lastProcessingBox,
          processingResolution: lastProcessingResolution,
          windowSize: history.length,
          summaryMs: summary,
          // Over the same frames as summaryMs; see definitions.
          runSummary: summarizeRun(history),
          definitions: DEFINITIONS,
          frames: history,
        };
        saveJson(payload, `bench-nft-${payload.mode}-${deviceSlug()}-${Date.now()}.json`);
      }
```

("Keeps its current comment verbatim" is an instruction to the implementer: each existing field's comment from the current `downloadHistory` stays attached to it; none is dropped.)

- [ ] **Step 8: The pyramid probe**

After `downloadHistory`:

```js
      /**
       * buildFramePyramid on this device, by bench-tracking.mjs's method (p50
       * and p95 of 300 runs after 50 warm-up), on its texture, at the sizes and
       * depths #63 estimated by proxy. The tracker's own pyramidMs cannot
       * measure those: it builds only the levels its patches start on, which for
       * pinball.wnft on these paths is one — the frame itself.
       */
      async function runPyramidProbe() {
        probeButton.disabled = true;
        startButton.disabled = true;
        clearError();
        try {
          const rows = [];
          for (const [width, height] of PROBE_SIZES) {
            const frame = texturedFrame(width, height);
            for (const levels of PROBE_LEVELS) {
              setStatusText(`timing the frame pyramid: ${width}×${height}, ${levels} level(s)…`);
              // Let the status repaint; the timing itself blocks the thread.
              await new Promise((r) => setTimeout(r, 0));
              const t = timeRepeated(
                () => {
                  const built = buildFramePyramid(frame, { levels, scaleStep: PROBE_SCALE_STEP });
                  if (!built.ok) throw new Error(`buildFramePyramid: ${built.reason}`);
                },
                { clock, warmup: PROBE_WARMUP, runs: PROBE_RUNS },
              );
              rows.push({ width, height, levels, p50: t.p50, p95: t.p95 });
            }
          }
          saveJson(
            {
              kind: "pyramid-probe",
              exportedAt: new Date().toISOString(),
              metricsVersion: METRICS_VERSION,
              userAgent: navigator.userAgent,
              deviceLabel: $("deviceLabel").value || null,
              clockResolutionMs,
              crossOriginIsolated: globalThis.crossOriginIsolated === true,
              scaleStep: PROBE_SCALE_STEP,
              warmup: PROBE_WARMUP,
              runs: PROBE_RUNS,
              rows,
            },
            `bench-nft-pyramid-probe-${deviceSlug()}-${Date.now()}.json`,
          );
          const four = rows.find((r) => r.width === 270 && r.height === 360 && r.levels === 4);
          setStatusText(`pyramid probe done: 270×360, 4 levels, p50 ${four.p50.toFixed(2)} ms`);
        } catch (e) {
          showError(e.message);
        } finally {
          probeButton.disabled = false;
          startButton.disabled = false;
        }
      }
```

- [ ] **Step 9: URL parameters**

Replace `initRunInputs` (and its doc comment) with:

```js
      /**
       * URL parameters pre-fill the controls (`parseRunParams` lists them and
       * their domains), so a run on a phone reached over `adb reverse` is set
       * from the address bar. With none, a run is the one this page measured
       * before each control existed.
       */
      function initRunInputs() {
        const p = parseRunParams(location.search, {
          bundledClips: [...bundledClipSelect.options].map((o) => o.value),
        });
        maxKeypointsInput.value = String(p.maxKeypoints ?? DEFAULT_MAX_SCENE_KEYPOINTS);
        procWidthInput.value = String(p.procWidth ?? PROC_WIDTH);
        procHeightInput.value = String(p.procHeight ?? PROC_HEIGHT);
        if (p.camera) cameraSelect.value = p.camera;
        if (p.mode) modeSelect.value = p.mode;
        if (p.target) targetSelect.value = p.target;
        if (p.windowSize) windowSizeInput.value = String(p.windowSize);
        if (p.clip) {
          bundledClipSelect.value = p.clip;
          document.querySelector('input[name="source"][value="bundled"]').checked = true;
        }
      }
```

- [ ] **Step 10: `main` — both targets, the clock, the Start guard, the listeners**

In `main`, replace the target preparation (from `setStatusText("preparing target…");` through `const targetDb = buildTargetFromImage(…);`) with:

```js
        clockResolutionMs = clockResolution(clock);
        renderDefinitions();

        setStatusText("preparing targets…");
        // Built in the page, as this page always has: the default target, so a
        // run with no parameters is the run it always was. The timings object
        // is thrown away — this is paid once, outside the frames measured.
        const imageBytes = await (await fetch(TARGET_IMAGE)).arrayBuffer();
        const targetImg = await loadImage(TARGET_IMAGE);
        const gray = toGrayTimed(
          targetImg,
          targetImg.naturalWidth,
          targetImg.naturalHeight,
          TARGET_MAX_SIDE,
          undefined,
          resetTimings({}),
        );
        const imageDb = buildTargetFromImage(cv, gray, { levels: TARGET_LEVELS, name: "pinball" });
        targets.image = {
          db: imageDb,
          record: targetRecord({
            source: "image",
            file: "images/pinball.jpg",
            sha256: await sha256Hex(imageBytes),
            db: imageDb,
            builtWith: { function: "buildTargetFromImage", maxSide: TARGET_MAX_SIDE, levels: TARGET_LEVELS },
          }),
        };
        // Loaded and decoded, never built here: the only target with patches,
        // and the one compile-target's defaults made (examples/README.md).
        try {
          const response = await fetch(TARGET_FILE);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          const decoded = decode(bytes);
          if (!decoded.ok) throw new Error(`${decoded.error} — ${decoded.detail}`);
          for (const w of decoded.warnings) console.warn(`${TARGET_FILE}: ${w.code} — ${w.detail}`);
          targets.wnft = {
            db: decoded.target,
            record: targetRecord({
              source: "wnft",
              file: "targets/pinball.wnft",
              sha256: await sha256Hex(bytes),
              db: decoded.target,
            }),
          };
        } catch (e) {
          targetSelect.querySelector('option[value="wnft"]').disabled = true;
          errorEl.textContent =
            `targets/pinball.wnft could not be loaded (${e.message}); the tracking mode needs it. ` +
            "Serve the repository root, so examples/targets/ is reachable next to this page.";
        }
```

Then, in the rest of `main`:

- Swap `updateSourceInputs(); initRunInputs();` to `initRunInputs(); updateSourceInputs();` (`?clip=` may change the source radio, and the inputs' enabled state must follow it).
- Add, with the other listeners:
  ```js
          // Choosing tracking chooses the only target it can run on.
          modeSelect.addEventListener("change", () => {
            if (modeSelect.value === "tracking") targetSelect.value = "wnft";
          });
          probeButton.addEventListener("click", runPyramidProbe);
  ```
  and `probeButton.disabled = false;` next to `startButton.disabled = false;`.
- At the top of the Start handler, **before** `startButton.disabled = true;` and the `try` — so a refusal starts no source, commits nothing, and carries no camera or clip hint:
  ```js
            clearError();
            const mode = modeSelect.value;
            const target = targets[targetSelect.value];
            const refusal = !target
              ? "targets/pinball.wnft is not loaded (see above)."
              : mode === "tracking"
                ? trackabilityError(target.db, DEFAULT_MIN_TRACKED_PATCHES)
                : null;
            if (refusal) {
              showError(refusal);
              return;
            }
  ```
  Remove the handler's own later `clearError();` and `const mode = $("mode").value;`. Next to `lastMode = mode;` add `lastTarget = target.record;`; pass `target.db` to `runBenchmark` in place of `targetDb`; set `probeButton.disabled = true;` next to `stopButton.disabled = false;`.
- In the Stop handler and in the Start handler's `catch`, add `probeButton.disabled = false;`.
- `readMaxKeypoints` and `readProcessingBox` keep calling `parsePositiveInt`, now imported.

- [ ] **Step 11: Build, then smoke-test headless on the desktop**

Not a device measurement — a wiring check. Serve the repository with `memory/bench-tools/serve.py` (a `.claude/launch.json` entry, `"runtimeExecutable": "python"`, started with `preview_start`; the file deleted afterwards). Drive a headless Chrome (`"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9224 --autoplay-policy=no-user-gesture-required about:blank`) with a scratch CDP script adapted from `memory/bench-tools/tablet-sweep.mjs` (not committed): open `http://localhost:8080/examples/bench-nft.html?<parameters>`, hook `URL.createObjectURL` as the driver does, click Start, poll the last `#stats` row until `N / N` then 50 more frames, click Stop and Download, and save the export's text to the scratchpad. Also collect `console.error` and uncaught errors (`Runtime.exceptionThrown`, `Runtime.consoleAPICalled`).

| # | parameters | checks on the export |
|---|---|---|
| a | `mode=tracking&window=450&clip=pinball-static.mp4` | `mode` "tracking"; `target.file` "targets/pinball.wnft", `target.patches` 64, `target.sha256` 64 hex digits; `tracker.detectionOnly` false; `metricsVersion` 1; `ticks ≥ 500`; every frame has `state` and `corners`; TRACK frames have `trackerTimings.trackMs > 0` and `tracking.frameLevels === 1`; `runSummary.trackShare > 0.9`, `runSummary.loopWraps ≥ 1` (450 frames outlast the clip's 363), `runSummary.jitterWindows > 0`, `runSummary.trackStepMs.n > 0`; `definitions.jitterPx` present |
| b | `mode=stateless&target=wnft&window=60&clip=pinball-static.mp4` | `tracker` null; `runSummary.trackStepMs` `{ n: 0, p50: null, … }`; frames' `state` ∈ {DETECT, LOST}; `summaryMs.match` present |
| c | `mode=detection-only&target=wnft&window=60&clip=pinball-static.mp4` | `tracker.detectionOnly` true; `runSummary.states.TRACK` 0 |
| d | `mode=tracking&target=image&clip=pinball-static.mp4` | Start refuses: `#error` reads the `trackabilityError` message (naming `targets/pinball.wnft`) with no clip hint; the video never starts (`video.src` empty) |
| e | no parameters; click "Time frame pyramid" | a `kind: "pyramid-probe"` export with 18 rows; 270×360 at 1 level with `p50` < 0.1; at 4 levels well above it |

Then `node scripts/compare-bench.mjs <a.json> <b.json>` — expected: exit 0, and both "common media times" rows with numbers in both columns.

Expected: every check holds and no console error or uncaught exception is logged. A failing check sends you to systematic-debugging; do not loosen it.

- [ ] **Step 12: Commit**

```bash
cd /d/kalwalt-github/webarkit && git add examples/bench-nft.html && git commit -m "feat(examples): a tracking mode in bench-nft.html

Beside the stateless pipeline and NftTracker detection-only (the old
'tracker' value, now with detectionOnly: true), a tracking mode runs the
M2 state machine on examples/targets/pinball.wnft, fetched and decoded,
never built in the page; Start refuses a target the tracker would not
track, before any source starts. Each frame records the tracker's state,
timings, fit health, quality and counts as it reports them, plus the
target's reprojected corners. A run summary shows TRACK share,
re-acquisitions, first steps confirmed and held locks lost, trackMs on
TRACK frames (ADR-0001 point 5's figure) and pyramidMs, and the corners'
jitter and spread, each defined once in js/bench-metrics.mjs and exported
with its definition. The export records the target and its SHA-256, the
tracker's options, the clock's resolution and the frames processed. A
pyramid probe times buildFramePyramid on the device by bench-tracking.mjs's
method, which the tracker's pyramidMs cannot: it builds one level here.
?mode=, ?target=, ?window= and ?clip= set a run from the address bar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The desktop pre-flight, and the proxy's denominator

**Files:** Modify `examples/js/pinball-shared.mjs` (`fitSize` exported). Create `scripts/replay-clips.mjs`.

**Interfaces:**
- Consumes: `frameRecord`, `summarizeRun`, `compareExports`, `targetCorners`, `targetRecord`, `sha256Hex`, `stats`, `nextFrameIndex`, `framesAt`, `METRICS_VERSION` (Tasks 1–4); `fitSize` (`pinball-shared.mjs`); `NftTracker`, `decode` (`packages/nft-tracker/dist`); `createJsfeatNextBackend`, `intrinsics` (`packages/cv-backend-jsfeatnext/dist`).
- Produces: default mode — a Markdown table (per clip × schedule × mode), the static clip's aligned comparisons, and first-step loss patch counts, on stdout; `--out <dir>` also writes export-shaped JSON (`kind: "replay"`). `--sequence <export.json>` — replays exactly the frames a device export processed, once to warm up and then 3 times, and prints the median `trackStepMs` p50/p95: the proxy check's denominator.

- [ ] **Step 1: Export `fitSize`**

In `examples/js/pinball-shared.mjs`, change `function fitSize(` to `export function fitSize(`, and add to its doc comment: "Exported for `scripts/replay-clips.mjs`, which must size its frames as the pages do."

- [ ] **Step 2: Write the replay**

Create `scripts/replay-clips.mjs`:

```js
/*
 *  replay-clips.mjs
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
 * A desktop pre-flight for bench-nft.html's tracking mode, and the proxy
 * check's denominator. Replays the bundled clips' frames, at the page's
 * processing size, through NftTracker with examples/targets/pinball.wnft, and
 * summarises them with the page's own metrics (examples/js/bench-metrics.mjs).
 *
 *     npm run build
 *     node scripts/replay-clips.mjs [--out <dir>]
 *     node scripts/replay-clips.mjs --sequence <tracking export.json>
 *
 * **Not an on-device measurement, and not the browser's pixels.** ffmpeg and
 * ffprobe (on PATH) decode the clips and scale them (bilinear) where the page
 * has the browser's decoder and drawImage; the grey conversion is the page's.
 * Timings are this machine's.
 *
 * Default: two loops of each clip, per schedule. "every frame" processes them
 * all. The "device" schedules model a device that processes only the frames it
 * is free for (nextFrameIndex): busy for the clip's acquire + gray p50 on
 * Tab_9_WiFi, plus a detection (83.2 ms) on a frame that detected, plus a
 * tracking step of 15 or 25 ms on a frame that ran one — the step being what
 * the device run measures. The model leaves out the page's own per-frame work
 * (the overlay and the stats panel after `total`), the video callback's
 * latency, and JIT warm-up: it brackets, it does not predict to the frame.
 *
 * --sequence replays the frames a tracking export processed, by their media
 * times (framesAt), once to warm up and then three times, and prints the
 * median of the three runs' trackStepMs p50 and p95: the device ÷ desktop
 * ratio on the same frames, which prediction 1 in docs/benchmarks/README.md
 * reads the proxy from.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJsfeatNextBackend, intrinsics } from "../packages/cv-backend-jsfeatnext/dist/index.js";
import { decode, NftTracker } from "../packages/nft-tracker/dist/index.js";
import {
    compareExports,
    framesAt,
    frameRecord,
    METRICS_VERSION,
    nextFrameIndex,
    sha256Hex,
    stats,
    summarizeRun,
    targetCorners,
    targetRecord,
} from "../examples/js/bench-metrics.mjs";
import { fitSize } from "../examples/js/pinball-shared.mjs";

const EXAMPLES = fileURLToPath(new URL("../examples/", import.meta.url));
/** bench-nft.html's default processing box. */
const BOX = { width: 480, height: 360 };
const CLIPS = ["pinball-static.mp4", "pinball-bench.mp4", "pinball-bench-table.mp4"];
/**
 * acquire + gray p50 on Tab_9_WiFi (docs/benchmarks/README.md): the wall clip
 * 18.9 + 1.5 ms (2026-09-19); the static and table clips 35.9–36.0 + 0.9 and
 * 40.1 + 0.9 ms (the 2026-09-24 sweep).
 */
const DEVICE_ACQUIRE_MS = {
    "pinball-static.mp4": 36.9,
    "pinball-bench.mp4": 20.4,
    "pinball-bench-table.mp4": 41.0,
};
/** detect + describe + match + estimateHomography p50 on the camera path (the rear-camera runs): 7.1 + 10.3 + 64.0 + 1.8. */
const DEVICE_DETECT_MS = 83.2;
const LOOPS = 2;
const RUNS = [
    { mode: "tracking", schedule: "every frame", stepMs: null },
    { mode: "tracking", schedule: "device, 15 ms step", stepMs: 15 },
    { mode: "tracking", schedule: "device, 25 ms step", stepMs: 25 },
    { mode: "detection-only", schedule: "every frame", stepMs: null },
    { mode: "detection-only", schedule: "device", stepMs: 0 },
];

const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? process.argv[i + 1] : null;
};

function probe(path) {
    const json = JSON.parse(
        execFileSync(
            "ffprobe",
            ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:frame=pts_time", "-of", "json", path],
            { maxBuffer: 64 << 20 },
        ).toString(),
    );
    return { width: json.streams[0].width, height: json.streams[0].height, pts: json.frames.map((f) => Number(f.pts_time)) };
}

/** Every frame, as the page's GrayImage: ffmpeg's RGB at the processing size, the page's Rec. 601 luma. */
function greyFrames(path, width, height) {
    const rgb = execFileSync(
        "ffmpeg",
        ["-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf", `scale=${width}:${height}:flags=bilinear`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        { maxBuffer: 1 << 30 },
    );
    const n = width * height;
    const frames = [];
    for (let o = 0; o + 3 * n <= rgb.length; o += 3 * n) {
        const data = new Uint8Array(n);
        for (let i = 0, p = o; i < n; i++, p += 3) {
            data[i] = (rgb[p] * 0.299 + rgb[p + 1] * 0.587 + rgb[p + 2] * 0.114) | 0;
        }
        frames.push({ data, width, height });
    }
    return frames;
}

async function loadClip(clip) {
    const path = join(EXAMPLES, "videos", clip);
    const { width: sw, height: sh, pts } = probe(path);
    const { width, height } = fitSize(sw, sh, BOX.width, BOX.height);
    const frames = greyFrames(path, width, height);
    if (frames.length !== pts.length) throw new Error(`${clip}: ${frames.length} frames decoded, ${pts.length} timestamps`);
    return { frames, pts, width, height };
}

const cv = await createJsfeatNextBackend();
const wnft = readFileSync(join(EXAMPLES, "targets/pinball.wnft"));
const decoded = decode(new Uint8Array(wnft));
if (!decoded.ok) throw new Error(`pinball.wnft: ${decoded.error}`);
const target = decoded.target;
const targetPoints = targetCorners(target.meta.widthPx, target.meta.heightPx);
const targetRec = targetRecord({ source: "wnft", file: "targets/pinball.wnft", sha256: await sha256Hex(wnft), db: target });

/** One replay: `order` is the frame indices to process, or null for the device schedule over `LOOPS` loops. */
function replay({ clip, frames, pts, K, mode, stepMs, order }) {
    const tracker = new NftTracker(cv, target, K, {
        detectionOnly: mode === "detection-only",
        clock: () => performance.now(),
    });
    const records = [];
    const push = (i) => {
        const result = tracker.process(frames[i], pts[i] * 1000);
        records.push(frameRecord({ mode, result, stageTimings: {}, timestampMs: pts[i] * 1000, mediaTimeSeconds: pts[i], targetPoints }));
        return result;
    };
    if (order) {
        for (const i of order) push(i);
        return records;
    }
    // LOOPS loops on one continuous timeline, as the page's looping <video> plays them.
    const period = pts[pts.length - 1] - pts[0] + (pts[1] - pts[0]);
    const times = Array.from({ length: LOOPS * pts.length }, (_, k) => pts[k % pts.length] + Math.floor(k / pts.length) * period);
    for (let k = 0; k < times.length; ) {
        const result = push(k % pts.length);
        if (stepMs === null) {
            k++;
            continue;
        }
        const busy = DEVICE_ACQUIRE_MS[clip] + (result.tracking ? stepMs : 0) + (result.state === "TRACK" ? 0 : DEVICE_DETECT_MS);
        k = nextFrameIndex(times, k, busy);
    }
    return records;
}

const exportOf = (clip, run, res, records) => ({
    kind: "replay",
    metricsVersion: METRICS_VERSION,
    exportedAt: new Date().toISOString(),
    userAgent: `Node ${process.version} ${process.platform}/${process.arch}`,
    mode: run.mode,
    schedule: run.schedule,
    target: targetRec,
    source: "bundled",
    bundledClip: clip,
    processingResolution: res,
    runSummary: summarizeRun(records),
    frames: records,
});

const fmt = (v, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));
const pct = (v) => (v === null ? "—" : `${(100 * v).toFixed(1)}%`);
console.log(`Node ${process.version}, ${process.platform}/${process.arch}, ${cpus()[0]?.model ?? "unknown CPU"}\n`);

const sequencePath = arg("--sequence");
if (sequencePath) {
    const e = JSON.parse(readFileSync(sequencePath, "utf8"));
    if (e.mode !== "tracking" || e.source !== "bundled") throw new Error("--sequence needs a tracking run on a bundled clip");
    const { frames, pts, width, height } = await loadClip(e.bundledClip);
    if (width !== e.processingResolution.width || height !== e.processingResolution.height) {
        throw new Error(`${e.bundledClip}: the export ran at ${e.processingResolution.width}x${e.processingResolution.height}, this replay at ${width}x${height}`);
    }
    const order = framesAt(pts, e.frames.map((f) => f.mediaTimeSeconds));
    const K = intrinsics(width, height);
    replay({ clip: e.bundledClip, frames, pts, K, mode: "tracking", stepMs: null, order }); // warm-up
    const runs = [0, 1, 2].map(() => summarizeRun(replay({ clip: e.bundledClip, frames, pts, K, mode: "tracking", stepMs: null, order })).trackStepMs);
    const median = (k) => stats(runs.map((s) => s[k])).p50;
    const device = e.runSummary?.trackStepMs ?? summarizeRun(e.frames).trackStepMs;
    console.log(`${sequencePath}: ${e.frames.length} frames of ${e.bundledClip}, replayed 3 times after a warm-up`);
    console.log(`trackStepMs p50 / p95 — device ${fmt(device.p50)} / ${fmt(device.p95)}; here, median of 3: ${fmt(median("p50"))} / ${fmt(median("p95"))}`);
    console.log(`device ÷ here, p50: ${fmt(device.p50 / median("p50"))}`);
    process.exit(0);
}

const outDir = arg("--out");
if (outDir) mkdirSync(outDir, { recursive: true });
console.log(
    "| clip, at | mode, schedule | frames | TRACK share | re-acq. (at wraps) | wraps | first steps confirmed | held-lock steps lost | lock losses | trackStepMs p50 / p95 | align share | frame levels | capped / fits | quality ≤ 0.20 | jitterPx | spreadPx |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const clip of CLIPS) {
    const { frames, pts, width, height } = await loadClip(clip);
    const K = intrinsics(width, height);
    const exports = [];
    for (const run of RUNS) {
        const records = replay({ clip, frames, pts, K, mode: run.mode, stepMs: run.stepMs, order: null });
        const e = exportOf(clip, run, { width, height }, records);
        exports.push(e);
        const s = e.runSummary;
        const losses = Object.entries(s.lockLosses).map(([k, v]) => `${k} ${v}`).join(", ") || "—";
        const align = s.alignMs.n > 0 ? fmt(s.alignMs.p50 / s.trackStepMs.p50) : "—";
        console.log(
            `| ${clip}, ${width}×${height} | ${run.mode}, ${run.schedule} | ${s.frames} | ${pct(s.trackShare)} | ${s.reacquisitions} (${s.reacquisitionsAtLoopWrap}) | ${s.loopWraps} | ${s.firstSteps.confirmed} / ${s.firstSteps.n} | ${s.heldLockSteps.lost} / ${s.heldLockSteps.n} | ${losses} | ${fmt(s.trackStepMs.p50)} / ${fmt(s.trackStepMs.p95)} | ${align} | ${JSON.stringify(s.frameLevels)} | ${s.fits.capped} / ${s.fits.n} | ${s.lowQualityTrackFrames} | ${fmt(s.jitterPx, 3)} | ${fmt(s.spreadPx, 3)} |`,
        );
        if (outDir) {
            const slug = `${clip.replace(/\.mp4$/, "")}-${run.mode}-${run.schedule.replace(/[^a-z0-9]+/gi, "-")}`;
            writeFileSync(join(outDir, `replay-${slug}.json`), JSON.stringify(e, null, 2));
        }
    }
    const firstStepLosses = exports[0].frames.filter((f, i, all) => f.trackLoss && i > 0 && all[i - 1].state === "DETECT");
    const note = [];
    if (firstStepLosses.length > 0) {
        note.push(
            `first-step losses (every frame): ${firstStepLosses.length}; observed patches p50 ${stats(firstStepLosses.map((f) => f.tracking.observed)).p50}, culled p50 ${stats(firstStepLosses.map((f) => f.tracking.culled)).p50} of ${target.patches.count}`,
        );
    }
    if (clip === "pinball-static.mp4") {
        for (const [a, b, label] of [
            [0, 3, "every frame, both modes"],
            [1, 4, "device schedules (tracking 15 ms step)"],
            [2, 4, "device schedules (tracking 25 ms step)"],
        ]) {
            const r = compareExports(exports[a], exports[b]);
            note.push(
                `aligned, ${label}: ${r.commonMediaTimes} common media times — jitterPx tracking ${fmt(r.first.jitterPx, 3)}, detection-only ${fmt(r.second.jitterPx, 3)} (÷ ${fmt(r.second.jitterPx / r.first.jitterPx)}); spreadPx ${fmt(r.first.spreadPx, 3)}, ${fmt(r.second.spreadPx, 3)}`,
            );
        }
    }
    for (const line of note) console.log(`\n${clip}: ${line}`);
    console.log("");
}
```

- [ ] **Step 3: Format, run, and read the output**

```bash
cd /d/kalwalt-github/webarkit && npx prettier --write scripts/replay-clips.mjs && npx prettier --ignore-path "" --write examples/js/pinball-shared.mjs && npm run build && node scripts/replay-clips.mjs > "$SCRATCH/replay-output.md" 2>&1; echo "exit $?"; cat "$SCRATCH/replay-output.md"
```
(`$SCRATCH`: this session's scratchpad directory.) Before running, check `git diff examples/js/pinball-shared.mjs` shows only the `export` and the doc sentence; if prettier reformats more of that file, revert its reformatting and keep the two-line change.

Expected: `exit 0`, in about 1.5 minutes; 15 table rows (3 clips × 5 runs) plus the notes. Two planning runs (2026-09-25: the scratch scripts, then this script as written, dry-run from the plan; RANSAC draws vary between runs, so counts move a little) gave, as ranges over both:

| clip | run | TRACK share | first steps confirmed | held-lock steps lost | trackStepMs p50 / p95 | capped / fits | jitterPx | spreadPx |
|---|---|---|---|---|---|---|---|---|
| static | tracking, every frame | 99.9% | 1 / 1 | 0 / 724 | 3.9–4.0 / 4.9–5.7 | 0 | 0.124–0.131 | 0.896 |
| | tracking, device 15 / 25 ms | 99.7% | 1 / 1 | 0 / 361–362 | 3.9–4.1 / 5.5–6.2 | 0 | 0.128–0.140 | 0.894–0.897 |
| | detection-only, every / device | — | — | — | — | — | 0.41–0.48 / 0.39–0.40 | 1.02–1.08 |
| wall | tracking, every frame | 69.5–69.6% | 4–5 / 133–137 | 3–4 / 413–414 | 6.5–6.9 / 9.3–11.2 | 0 | — | — |
| | tracking, device 15 ms | 78.6–80.7% | 4 / 67–75 | 3 / 329–346 | 6.5–6.6 / 9.2–9.9 | 0–1 | — | — |
| | tracking, device 25 ms | 56.7–59.4% | 15–16 / 75–76 | 14–16 / 124–128 | 6.7–7.0 / 8.7–9.2 | 4 / 138 | — | — |
| table | tracking, every frame | 78.7–79.2% | 2–3 / 99–102 | 1–2 / 422 | 5.1–5.4 / 6.7–7.6 | 0 | — | — |
| | tracking, device 15 ms | 80.6–82.3% | 6–7 / 36–37 | 5–6 / 172–176 | 5.8–6.0 / 7.6–8.2 | 0 | — | — |
| | tracking, device 25 ms | 82.4–83.5% | 6–7 / 34–35 | 5–6 / 175–177 | 5.9–6.0 / 7.8–8.0 | 2 / 183 | — | — |

On the static clip, aligned: every frame, jitterPx 0.124–0.131 tracked against 0.41–0.48 (÷ 3.1–3.8); device schedules 0.135–0.158 against 0.39–0.40 (÷ 2.6–2.9); spreadPx 0.85–0.90 against 0.99–1.04. First-step losses on the moving clips: 0–1 patches observed and 24–27 of 64 culled at p50. `frameLevels` `{"1": …}` on every TRACK frame; align share 0.97–0.99. TRACK frames at quality ≤ 0.20: 0 (static), 3–5 (wall), 1–3 (table).

A difference beyond RANSAC variation (TRACK share by more than ~5 points, a different loss pattern, jitter by more than ~20%) is a finding: rule on it in the ledger before Task 7, and use the committed script's numbers in the README.

- [ ] **Step 4: Commit**

```bash
cd /d/kalwalt-github/webarkit && git add examples/js/pinball-shared.mjs scripts/replay-clips.mjs && git commit -m "feat(scripts): replay the bundled clips through the tracker, as a pre-flight

Every frame of the three bundled clips, decoded by ffmpeg at bench-nft's
processing size, through NftTracker with pinball.wnft, tracking and
detection-only, two loops each, summarised with js/bench-metrics.mjs, so
the device runs' predictions come from the page's own definitions. Device
schedules model the frames a busy device skips, and state what the model
leaves out. --sequence replays the frames a device export processed: the
denominator of the desktop-to-device proxy. Not an on-device measurement,
nor the browser's pixels; needs ffmpeg on PATH; not in CI. pinball-shared
exports fitSize so the replay sizes frames as the pages do.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation, with the measurement plan

**Files:** Modify `AGENTS.md`, `examples/README.md`, `docs/benchmarks/README.md`.

- [ ] **Step 1: AGENTS.md**

In "Environment & commands", replace `- **Test:** \`npm test\` — Vitest across every workspace.` with:
```markdown
- **Test:** `npm test` — Vitest across every workspace, then over `examples/test/` (`npm run test:examples`): the bench page's logic lives in `examples/js/bench-metrics.mjs`, and `examples/` is not a workspace, so the root declares `vitest` for it.
```

- [ ] **Step 2: examples/README.md, the `bench-nft.html` section**

Edit in place, in this order (line numbers are the current file's):

1. **Line 149–152**, the end of the opening paragraph's first sentence: replace "in eight stages per frame: … — plus the tracker's own outcome (`locked on` / `too few matches` / `no consensus`)." with "in eight stages per frame (frame acquisition, grayscale conversion, `detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography` and the frame total) and, when `NftTracker` runs, in its own timings of its tracking step."
2. **Lines 159–166** ("Two modes, selected before pressing Start:" and its two bullets) — replace with:

````markdown
Three modes, selected before pressing Start (or with `?mode=`):

- **stateless pipeline** (`stateless`) — the same inline `detect → describe →
  match → estimateHomography → poseFromHomography` calls as the static demo,
  against `@webarkit/nft-tracker`'s own `DEFAULT_SCENE_LEVELS` /
  `DEFAULT_MAX_SCENE_KEYPOINTS` / `DEFAULT_RATIO` / `DEFAULT_RANSAC_THRESHOLD`.
- **NftTracker, detection-only** (`detection-only`) — `tracker.process(frame,
  timestampMs)` with `detectionOnly: true`: M1 of
  [ADR-0001](../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md),
  every frame detected from scratch, the same pipeline as the stateless mode
  and expected to report the same match and inlier counts. Exports made before
  the tracking mode called this mode `tracker`; their target had no patches,
  so it was detection-only too.
- **NftTracker, tracking** (`tracking`) — M2's `LOST → DETECT → TRACK` state
  machine: a detection locks on, and the frames after it track the target's
  patches without detecting. It needs a target with patches.
````

3. **Lines 168–203** (max keypoints, processing box, camera) — keep unchanged.
4. **Lines 205–215** ("Both modes are timed by wrapping …" to "… a number with nothing to compare it to.") — replace with:

````markdown
Every mode is timed by wrapping the `CvBackend` instance passed to it, so the
stage split is available for `NftTracker` even though `process()` does not
expose it. Both `NftTracker` modes are also given a `clock`
(`performance.now`), and the tracker reports its tracking step's own
`timings`: `trackMs` for the whole step, of which `pyramidMs` is
`buildFramePyramid`, `alignMs` `alignPatch` (each patch's warp and its
alignment) and `fitMs` `robustHomography` — exactly as `src/tracker.ts`
defines them. On a TRACK frame nothing is detected, so the detection stages'
percentiles are taken over the frames that detected.

**The target** (`?target=`). By default the page builds its target at load
with `buildTargetFromImage`, from `images/pinball.jpg` at 640 px on its long
side; that target has no patches, and a run with no parameters stays the run
this page always measured. The other choice is `targets/pinball.wnft`,
fetched and decoded, never built here — the only target with patches (64 of
16 × 16, all from level 0) — and the tracking mode selects it. Start refuses
to track a target the tracker would not track, before any source starts,
rather than run detection-only under the tracking label. The export's
`target` records which one a run used: `file`, the file's `sha256`,
`builtWith` for the in-page build, and what it carries.
````

5. **Lines 217–242** ("Comparing the two modes on the same footage" and "A shared `startAt` …"): keep; change "a stateless-pipeline run and an NftTracker run then measure" to "two runs then measure"; change the words "Stateless-pipeline and" (line 235) and "NftTracker cost" (line 236) — which wrap across two lines — to "Two modes cost"; and append to the paragraph's last sentence: "`scripts/compare-bench.mjs` does exactly that (below)."
6. **After line 242**, before `## The bundled reference clips`, insert:

````markdown
**What each frame records.** Besides the stage timings and the counts every
export has always had (`numSceneKeypoints`, `numMatches`, `numInliers`, `ok`,
`reason`, `mediaTimeSeconds`), each frame carries its `state` (`LOST`,
`DETECT` or `TRACK`; for the stateless pipeline, `DETECT` with a pose and
`LOST` without one), the tracker's `quality`, `trackLoss`, `tracking` (the
step's patch counts and its fit's `inliers`, `rmsError`, `fitIterations` and
`fitConverged`) and `trackerTimings` — copied as the tracker reports them,
`null` without a tracker — and `corners`, the target's four corners
reprojected into the frame by the frame's homography.

**The run summary.** The "Run summary" panel, and the export's `runSummary`,
over the same window as the stage percentiles: the frames per state and the
**TRACK share**; **re-acquisitions** (a re-detection on the first frame after
a loop wrap counted apart); a lock's **first steps**, and how many were
confirmed, and a **held lock's steps**, and how many were lost;
**`trackStepMs`** — `trackMs` on TRACK frames, ADR-0001 point 5's tracker-side
TypeScript compute in the tracking state, against its 8 ms at p95 —
`pyramidMs`, `alignMs`, `fitMs` and the frame pyramid levels built; fit health
(fits that stopped at their cap, which the tracker reports rather than
refuses); quality and tracked patches; and the corners' **`jitterPx`** —
their standard deviation about their own straight-line motion within each
one-second window, so neither a slow drift of the footage nor the run's frame
rate moves it — and **`spreadPx`**, their standard deviation over the whole
run, motion and drift included. Each is defined once, in
[`js/bench-metrics.mjs`](./js/bench-metrics.mjs)'s `DEFINITIONS`; the page
shows the ones it headlines, and every export carries all of them with
`metricsVersion`, so two exports cannot mean different things by one name.
The export also records `ticks`, the frames processed since Start (the window
is the last `windowSize` of them), and `clockResolutionMs`: Chrome coarsens
`performance.now()` to 0.1 ms on a page that is not cross-origin isolated, so
a stage cheaper than that reads 0.

**Comparing two exports: `scripts/compare-bench.mjs`.**
`node scripts/compare-bench.mjs first.json second.json` prints both runs'
summaries and the corners' jitter and spread on the frames both posed
(`DEFINITIONS.alignment`): the tracking and the stateless run of one clip,
side by side, on the same footage. It refuses — one line, exit 1 — exports it
cannot align: a webcam run (its media time is the stream's), an export from
before `metricsVersion` 1, another clip, another processing size.

**Timing the frame pyramid on the device.** The tracker builds only the
pyramid levels its patches start on; with `pinball.wnft`'s level-0 patches,
on the bundled clips and on the camera path, that is one level — the frame
itself, nothing computed — so `pyramidMs` reads about 0. The **Time frame
pyramid** button measures what #63 estimated instead: `buildFramePyramid` at
1–6 levels of 270×360, 480×270 and 640×480, by
`packages/nft-tracker/scripts/bench-tracking.mjs`'s method (p50 and p95 of 300
runs after 50 warm-up), downloaded as its own JSON.

**URL parameters.** Besides `?maxKeypoints=`, `?procWidth=`/`?procHeight=`
and `?camera=`: `?mode=`, `?target=`, `?window=` (10–2000 frames) and
`?clip=` (a bundled clip's file name, which also selects that source) — e.g.
`bench-nft.html?mode=tracking&window=300&clip=pinball-static.mp4`
(tracking defaults to `target=wnft`).
````

7. **"## Shared code: `js/pinball-shared.mjs`"** — append:

````markdown
`js/bench-metrics.mjs` is the bench page's other module: every run metric it
reports and the text defining each, its URL parameters, and the helpers its
pyramid probe and the desktop replay share — no DOM, tested in
`examples/test/` by the root `npm test`. `scripts/compare-bench.mjs` and
`scripts/replay-clips.mjs` (a desktop pre-flight that replays the bundled
clips through the tracker; ffmpeg needed) import it too, so a comparison or a
replay means by each name what the page does.
````

- [ ] **Step 3: docs/benchmarks/README.md — the measurement plan**

Append at the end of the file. Fill the pre-flight table and every "replay" number in the text from Task 6's committed-script output; the values below are the planning replay's, and a range that the committed output moves out of is adjusted, with a ledger line saying so:

````markdown
## 2026-09-25 — M2: the tracking state on the reference device

A measurement plan, written down **before** any of its runs, as the
`maxKeypoints` sweep's was. The runs are made by hand after the page's
tracking mode is merged; their results go in a Results section at the end of
this one, and the plan itself stays as written.

This is #48's first "Evaluation" item. `bench-nft.html` now has a
**tracking** mode, beside **stateless** and **detection-only**, and reports
the figure ADR-0001 point 5 decides on — tracker-side TypeScript compute in
the tracking state — as a number of its own.

### What a run reports

- **The target.** Tracking needs patches, so every run in this plan uses
  `examples/targets/pinball.wnft` (64 patches of 16 × 16, all from level 0),
  loaded from the file — the stateless runs too, so the comparison is between
  modes, not between targets. The export records it, with the file's SHA-256.
- **Per frame:** the `state`; the tracker's `trackerTimings` (`trackMs`,
  `pyramidMs`, `alignMs`, `fitMs`, as `src/tracker.ts` defines them); its
  `tracking` counts (`fitIterations`, `fitConverged`, `inliers`, `observed`,
  `culled`, …); its `quality`; and the target's four `corners`, reprojected
  into the frame.
- **Per run** (`runSummary`, and the page's "Run summary" panel): TRACK
  share; re-acquisitions; a lock's first steps and how many were confirmed, a
  held lock's steps and how many were lost; **`trackStepMs`** — `trackMs` on
  TRACK frames, point 5's figure; `pyramidMs`, frame levels, capped fits; and
  the corners' `jitterPx` and `spreadPx`.

Each is defined once, in `examples/js/bench-metrics.mjs`; every export carries
the definitions and their `metricsVersion`. `scripts/compare-bench.mjs` puts
two exports of one clip side by side, on the media times both posed — the one
table the tracked and stateless numbers are compared in.

**Two numbers for "jitter", and why.** Taken literally — the corners'
standard deviation over the run, `spreadPx` — jitter on `pinball-static.mp4`
mostly measures the clip: its framing drifts, the target's top corners moving
about 3.7 px over the 12 s and about 3 px back at each loop, and detection and
tracking agree on the drift. So the number tested here is `jitterPx`: the
corners' standard deviation about their own straight-line motion within each
one-second window of media time, pooled with n − 2 degrees of freedom per
window. It equals the SD for a target still in the image, does not count
motion that is straight over a second, and does not depend on how many frames
a run processed per second — which matters, because a tracker's error is
correlated from frame to frame, and a frame-to-frame measure would have
flattered a faster run (or a smoothing filter) by that alone. `spreadPx` is
reported beside it, untested.

### Pre-flight: a desktop replay

Not an on-device measurement. `node scripts/replay-clips.mjs` runs each
bundled clip's frames — decoded and scaled by ffmpeg to the page's processing
size, not by the browser — through `NftTracker` with `pinball.wnft`, two
loops, on the desktop PC this plan was written on (Intel i7-9700, Node 24,
Windows). Besides "every frame", **device schedules** model a device that
processes only the frames it is free for: after a frame at media time *t*,
the next is the first at or after *t* + busy, where busy is the clip's own
acquire + gray p50 on `Tab_9_WiFi` (above), plus 83.2 ms on a frame that
detected (the rear-camera runs' detect, describe, match and
estimateHomography), plus a tracking step of 15 or 25 ms on a frame that ran
one. The model leaves out the page's own work per frame (the overlay and the
stats panel, after `total`), the video callback's latency and JIT warm-up, so
it brackets the device rather than predicting it to the frame.

| clip, processed at | tracking, schedule | TRACK share | first steps confirmed | held-lock steps lost | `trackStepMs` p50 / p95, desktop | capped fits |
|---|---|---|---|---|---|---|
| static, 203×360 | every frame | 99.9% | 1 / 1 | 0 / 724 | 3.9–4.0 / 4.9–5.7 | 0 |
| | device, 15 or 25 ms | 99.7% | 1 / 1 | 0 / 361–362 | 3.9–4.1 / 5.5–6.2 | 0 |
| wall, 480×270 | every frame | 69.5–69.6% | 4–5 / 133–137 | 3–4 / 413–414 | 6.5–6.9 / 9.3–11.2 | 0 |
| | device, 15 ms | 79–81% | 4 / 67–75 | 3 / 329–346 | 6.5–6.6 / 9.2–9.9 | 0–1 |
| | device, 25 ms | 57–59% | 15–16 / 75–76 | 14–16 / 124–128 | 6.7–7.0 / 8.7–9.2 | 4 of 138 |
| table, 203×360 | every frame | 79% | 2–3 / 99–102 | 1–2 / 422 | 5.1–5.4 / 6.7–7.6 | 0 |
| | device, 15 or 25 ms | 81–84% | 6–7 / 34–37 | 5–6 / 172–177 | 5.8–6.0 / 7.6–8.2 | 0–2 |

(Ranges over two replays, which differ by RANSAC's draws.) Also from the
replay:

- **Frame levels:** 1 on every TRACK frame of every clip and schedule;
  alignment is 97–99% of `trackStepMs`.
- **The static clip holds its lock through its loops:** no re-acquisition at
  the wrap, on any schedule.
- **On the moving clips, a lock is almost never lost once held; it is a
  detection the first step cannot confirm.** Nearly every lock loss is a
  lock's first step, with 0–1 patches observed and 24–27 of the 64 culled at
  p50: a detection of a target partly out of view, or of the wrong place,
  which the step refuses rather than tracks. Held locks lose 0–3% of their
  steps — except the wall clip on the 25 ms schedule, 11–13%, where each
  processed step spans two frames.
- **Jitter, static clip, aligned on common frames:** every frame, `jitterPx`
  0.124–0.131 tracked against 0.41–0.48 detection-only (÷ 3.1–3.8); device
  schedules, 0.135–0.158 against 0.39–0.40 (÷ 2.6–2.9). `spreadPx` 0.85–0.90
  against 0.99–1.08.
- **Quality ≤ 0.20:** 3–5 TRACK frames on the wall clip (the lowest 0.12),
  1–3 on the table clip, none on the static clip.

### The runs

**Every run:** `maxKeypoints` 300, processing box 480×360, window 300 frames
(at least one loop of every clip in every mode), start at 0, target
`targets/pinball.wnft`. Load the page fresh for each run with its parameters
in the URL, press Start, and let it run **at least 50 frames past the window
filling** (the window shows `300 / 300`; wait a further ~5 s) before Stop and
Download, so the window holds no cold-JIT frames. About two minutes idle
between runs, the same charging state throughout.

**`Tab_9_WiFi`** (the reference device; its own Chrome over `adb reverse`;
device label `Tab_9_WiFi`), in this order:

| # | source | mode | URL parameters |
|---|---|---|---|
| 1 | static | tracking | `?mode=tracking&window=300&clip=pinball-static.mp4` |
| 2 | static | stateless | `?mode=stateless&target=wnft&window=300&clip=pinball-static.mp4` |
| 3 | wall | tracking | `?mode=tracking&window=300&clip=pinball-bench.mp4` |
| 4 | wall | stateless | `?mode=stateless&target=wnft&window=300&clip=pinball-bench.mp4` |
| 5 | table | tracking | `?mode=tracking&window=300&clip=pinball-bench-table.mp4` |
| 6 | table | stateless | `?mode=stateless&target=wnft&window=300&clip=pinball-bench-table.mp4` |
| 7 | static | tracking (repeat of 1) | as 1 |
| 8 | wall | tracking (repeat of 3) | as 3 |
| 9 | table | tracking (repeat of 5) | as 5 |
| 10 | rear camera | tracking | `?mode=tracking&window=300&camera=rear` — the printed target in view, hand-held |
| 11 | — | pyramid probe | no parameters; press "Time frame pyramid" |

**Oppo A72** (a second sample, not the reference device: point 5 is not
evaluated on it), by hand: runs 1–6 and 11.

**File names:** `YYYY-MM-DD-<tab9|oppo-a72>-ondevice-<tracking|stateless>-<static|wall|table>.json`,
`…-repeat.json` for 7–9, `…-tracking-camera.json` for 10,
`…-pyramid-probe.json` for 11. An export of 300 frames is about 0.45 MB;
whether every Oppo export is committed, or its summary, is decided with the
results. The stateless reference for the camera path stays the 2026-09-24
rear-camera runs (109.0 and 109.7 ms `total` p50, `acquire` 23.0 ms).

After the runs, the denominator of the proxy check (prediction 1) is taken on
the desktop from each tracking export:
`node scripts/replay-clips.mjs --sequence <export.json>` replays exactly the
frames it processed.

### Validity checks (before reading any number)

1. `userAgent` contains `Android`; the device label is as planned.
2. Each export's `mode` is the planned one; its `target.file` is
   `targets/pinball.wnft`, and `target.sha256` is the same in every export.
3. Tracking runs: `tracker.detectionOnly === false`.
4. 300 frames; `ticks − 300 ≥ 50` (no cold-JIT frame in the window). File
   runs: `runSummary.loopWraps ≥ 1` (the window saw the whole clip).
5. Repeats (7–9 against 1, 3, 5): `trackStepMs` p50 within ±10%, TRACK share
   within ±10 points — else the session drifted and that result is
   **inconclusive**, not falsified. (On the wall clip, TRACK share can also
   cross the regime boundary of prediction 4 between two runs; that is read as
   inconclusive too.)
6. `clockResolutionMs` recorded (0.1 ms expected): a timing under it reads 0
   or 0.1.

### What each should show, and what would falsify it

Results between "holds" and "falsified" are reported as **inconclusive**, not
rounded toward either side.

**1. Tracker-side compute against 8 ms, and against the ~10 ms the camera
path leaves after `acquire`.** Replay `trackStepMs` p50, desktop, over its
schedules and runs: static 3.9–4.3 ms, wall 6.5–7.5, table 5.1–7.7 — alignment
97–99% of it. The desktop-to-device proxy (the `gray` loop in
`bench-tracking.mjs`) measured 3.4–3.8× on this machine over three runs, and
3.1–4.1× in #63's container. If it holds, the device's `trackStepMs` p50 is
about **12–18 ms** on the static clip, **20–31 ms** on the wall clip and
**16–32 ms** on the table clip, and p95 above each. The camera path aligns the
same 64 patches, below their scale, on a 270×360 frame: expect it near the
static clip. So:

- **Point 5, decided on the recorded clips** (it is defined "over a recorded
  test sequence"). **Holds:** `trackStepMs` p95 > 8 ms on all three clips —
  point 5's tracker-side condition is then met on the reference device; by
  point 5 that triggers nothing yet (point 3 comes first, and the step to move
  is patch alignment, not the pyramid: see 2). **Falsified:** p95 ≤ 8 ms on
  the static clip, where the tracker holds its lock throughout.
- **The ~10 ms, on the camera run** (the path it is defined on). **Holds:** the
  camera run's `trackStepMs` p50 > 33 − `acquire` p50 − `gray` p50 of that
  same run (about 10 ms). **Falsified:** ≤ it. Hand-held and not reproducible,
  so this verdict is about the camera path, and the static clip's
  `trackStepMs` corroborates it. Expected TRACK-frame `total` p50 on the
  camera run: 23 + 1.2 + `trackStepMs` + the pose ≈ 36–42 ms, over the 33 ms
  frame.
- **The proxy, on the same frames.** For each tracking export, device p50 ÷
  `--sequence` replay p50 (median of three). **Holds:** 3.1–4.1 on each clip.
  **Wrong:** below 2.5 or above 5.0. Between: inconclusive.

**2. `pyramidMs` against #63's 5.6–7.5 ms.** #63 estimated a four-level ∛2
pyramid of 270×360 at 5.6–7.5 ms on the reference device, by the proxy above.
The tracker does not build that pyramid here: `frameLevelsFor` (#66) builds
only the levels the patches start on, and `pinball.wnft`'s patches are all
level 0 and are seen below their own scale on every clip and on the camera
path, so they start on frame level 0 — the frame itself, nothing computed.
The replay: frame levels 1 on every TRACK frame, `pyramidMs` 0.00–0.01 ms.

- **Prediction:** `tracking.frameLevels` = 1 on ≥ 99% of TRACK frames and
  `pyramidMs` p95 ≤ 0.1 ms (one clock step), on every run. **Falsified:**
  frame levels > 1 on more than 1% of TRACK frames (the target seen at more
  than about 1.12× its level-0 scale).
- So the run's `pyramidMs` does not test #63's estimate; the **pyramid probe**
  (run 11) does: `buildFramePyramid` on the device, by #63's method, at #63's
  sizes. #63's device estimates for 270×360 at 2 / 3 / 4 / 5 / 6 levels:
  2.7–3.7 / 4.5–6.0 / **5.6–7.5** / 6.4–8.5 / 6.8–9.1 ms; this machine's three
  runs of `bench-tracking.mjs` today, by its own 3.4–3.8× proxy: 2.9–3.2 /
  5.0–5.4 / 6.1–6.8 / 7.6–7.9 / 7.6–8.3 ms. **Holds** (the proxy was right):
  the device's four-level 270×360 p50 within 5.6–7.5 ms. **Wrong:** below 4.5
  or above 9.4 ms (25% beyond either end). Otherwise inconclusive.
- Either way, on these paths the pyramid costs nothing today; point 3's first
  candidate would save nothing here until patches from deeper levels make the
  tracker build more.

**3. Jitter on the static clip, tracked against stateless.** Runs 1 and 2,
read through `scripts/compare-bench.mjs` on the media times both posed. The
replay under device schedules gave `jitterPx` 0.135–0.158 tracked against
0.39–0.40 (÷ 2.6–2.9); every frame, 0.124–0.131 against 0.41–0.48
(÷ 3.1–3.8).

- **Holds:** stateless ÷ tracking `jitterPx` ≥ 2. **Falsified:** < 1.3
  (the tracker not measurably steadier). Between: inconclusive.
- Tracking's `jitterPx` itself (expected 0.10–0.20 px) and the ratio are the
  numbers M3 (IPPE and the One Euro filter) and M4 compare against. Both are
  reported, whatever the verdict.
- `spreadPx` is reported for both (expected 0.8–1.1 px, within about 20% of
  each other) and **not tested**: on this clip it is the footage's drift.

**4. Lock share on the three clips, and what #66's bounds predict for
handheld footage.** #66 pins that one tracking step recovers the pose from a
prediction up to 4 px, 3.5° of roll or 5% of scale off, and that from 4° of
roll or past 8% of scale — on a step with no velocity to predict it, such as
a lock's first — it may accept a wrong pose (up to 9.19 px off on the pinned
render) that does not persist past a frame or two. The prediction is
constant-velocity, so a *held* lock must survive the change of the target's
motion between two processed frames; a *first* step must survive all of the
motion since the detection, over the whole detection tick (about 120 ms, 3–4
frames at 30 fps), plus the detection's own error. For hand-held footage that
predicts:

- **held locks rarely fail:** a hand's roll and scale change between two
  processed frames stay far inside 3.5° and 5%, and its change of velocity
  mostly inside 4 px — until the device skips frames, which widens every step;
- **first steps are the fragile ones,** and a detection the step cannot
  confirm is refused, not tracked wrong;
- so **TRACK share is set by how much of a clip holds a confirmable
  detection**, and by whether the device keeps up with the frame rate.

The replay agrees (the pre-flight above). Predicted on `Tab_9_WiFi`, per run:

| clip | TRACK share | held-lock steps lost | first steps confirmed |
|---|---|---|---|
| static | ≥ 95% | 0–1 | every one |
| wall | 70–85% if a TRACK tick keeps up with the clip (`acquire` + `gray` + `trackStepMs` p50 < 40 ms at 24.9 fps); 50–65% if it does not | ≤ 5% of held steps if it keeps up; ≤ 20% if not | ≤ 30% |
| table | 70–90% (at 41 ms `acquire`, a TRACK tick never keeps up with 30 fps) | ≤ 5% | ≤ 30% |

- **Falsified:** static TRACK share < 90%, or more than 1 held-lock step lost;
  on a moving clip, held-lock losses above twice the bound in its column, or
  TRACK share more than 10 points outside its range. Within 10 points of the
  range: inconclusive.
- **Wrong poses** from rotation or scale cannot be seen without ground truth;
  `lowQualityTrackFrames` (quality ≤ 0.20) is recorded as the watch number
  (replay: 0 / 3–5 / 1–3). The camera run's TRACK share is reported, not
  tested.

**5. Fit health.** In the replay, 0–4 fits per run reached the iteration cap
— at most 2.9%, on the wall clip's 25 ms schedule — and iterations were 3–4 at
p50. **Prediction:** capped fits ≤ 3% of `fits.n` on every run. Above 5% on
any run: not a falsification, a finding for the tuning pass (#66 measured 1 in
484 on synthetic frames).

**6. The Oppo A72.** Not the reference device; point 5 is not evaluated on
it. On 2026-09-19 its stateless `total` p50 was 1.16× `Tab_9_WiFi`'s, and its
stages 1.0–1.4× at p50 — the `gray` loop, the tracker proxy, 1.40×. **Expected**
(reported, not tested): `trackStepMs` p50 1.2–1.7× Tab9's on each clip; a
slower tick skips more frames, so TRACK share on the moving clips at or below
Tab9's; jitter on the static clip within the same bands as prediction 3.

### What this plan does not test

- **Whether a TRACK pose is right.** There is no ground truth on these clips;
  the tracker's accuracy is pinned on synthetic frames in
  `packages/nft-tracker`'s tests.
- **Tuning.** Every threshold stays at its provisional default; these runs
  supply the tuning pass's inputs (#48), not its decisions.
````

- [ ] **Step 4: Check the docs**

```bash
cd /d/kalwalt-github/webarkit && grep -n "5\.9–7\.1\|5.9-7.1" docs/benchmarks/README.md examples/README.md AGENTS.md; echo "exit $?"
```
Expected: no matches, `exit 1`. Then reread the three edited sections against the code once: every metric name in prose exists in `DEFINITIONS`, every URL parameter in `parseRunParams`, every number in the README's pre-flight in Task 6's output.

- [ ] **Step 5: Commit**

```bash
cd /d/kalwalt-github/webarkit && git add AGENTS.md examples/README.md docs/benchmarks/README.md && git commit -m "docs(benchmarks): the M2 tracking-state measurement plan

Written before any device run: the runs on Tab_9_WiFi and the Oppo A72,
validity checks, and for each question what should hold and what would
falsify it. Tracker-side compute against 8 ms, decided on the recorded
clips, and against the ~10 ms the camera path leaves; the proxy checked on
the same frames; pyramidMs against #63's 5.6-7.5 ms, which it cannot test
(one level is built here), and a probe that can; jitter, tracked against
stateless, as a windowed SD a clip's drift and a run's frame rate do not
move; lock share, from #66's bounds, split into a lock's first steps and a
held lock's. Predictions come from a desktop replay of the clips through
the tracker. examples/README.md documents the tracking mode; AGENTS.md
says npm test runs examples/test/.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verification, review, and the PR

- [ ] **Step 1: The gates (verification-before-completion)** — run each unpiped, paste the output, do not summarise:

```bash
cd /d/kalwalt-github/webarkit && npm run build; echo "exit $?"
cd /d/kalwalt-github/webarkit && npm run typecheck; echo "exit $?"
cd /d/kalwalt-github/webarkit && npm test; echo "exit $?"
cd /d/kalwalt-github/webarkit && npm run format:check; echo "exit $?"
cd /d/kalwalt-github/webarkit && npm run check:contract; echo "exit $?"
cd /d/kalwalt-github/webarkit && git diff --stat origin/dev -- packages/ crates/; echo "exit $?"
```
Expected: `exit 0` each; `npm test` shows cv-backend-spec 33, cv-backend-jsfeatnext 27, nft-tracker 662 + 1 skipped, and the examples suite's count, all passing; `All matched files use Prettier code style!`; the contract check passes; the last `git diff` prints nothing (no change under `packages/` or `crates/`).

- [ ] **Step 2: nft-reviewer** — dispatch the `nft-reviewer` agent on `origin/dev..HEAD` with the brief (Appendix A), this plan's Decisions, Global Constraints and Review Focus, and the ledger's `Ruling:` lines. Ask it to check in particular: no tracker timing is redefined; `trackStepMs` is exactly `trackMs` on TRACK frames; the README plan's predictions follow from the replay output and the cited sections; nothing under `packages/` changed. Act on findings as executing-plans' Final Review says: re-grade by effect; Critical and Important fixed in one pass, each RED→GREEN; minors to the ledger.

- [ ] **Step 3: finishing-a-development-branch** — the integration choice is the brief's (a PR against `dev`):

```bash
cd /d/kalwalt-github/webarkit && git push -u origin feat/bench-nft-tracking-mode
```
then `gh pr create --base dev --milestone "M2: patch tracking" --title "feat(examples): a tracking mode in bench-nft.html, and the M2 measurement plan" --body-file <scratchpad>/pr-body.md` — the body: what the page now measures; D1–D8 with their evidence; the pre-flight; where the plan lives; what is not in it (no device results yet); the gate output; ending with the Claude Code attribution line. Then bind the PR with the ccd_pr tools and read its CI.

---

## Appendix A — the brief, verbatim

> Read AGENTS.md, ADR-0001 (points 3 and 5), docs/benchmarks/README.md,
> examples/bench-nft.html, examples/README.md, and the state machine merged
> in #66 (src/tracker.ts, src/tracking/track_frame.ts and the package
> README's tracking section).
>
> Use writing-plans first and show me the plan. Then test-driven-development
> for anything with logic — the metrics, the alignment of two exports — not
> for the page's layout.
>
> GOAL
>
> Add a tracking mode to bench-nft.html, beside stateless and
> detection-only, and make ADR-0001 point 5's figure directly readable.
>
> The target. Tracking needs a target that carries patches:
> examples/targets/pinball.wnft has 64 (validate-target confirms it).
> Load that file in tracking mode rather than building a target in the
> page, so the run is reproducible and matches compile-target's defaults.
> Say in the page which target a run used, and record it in the export.
>
> PER FRAME, record:
> - the state (LOST / DETECT / TRACK);
> - the timings the tracker already reports — trackMs, alignMs, pyramidMs,
>   fitMs — keeping their meanings as #66 documents them. alignMs is "in
>   alignPatch": the warp plus the alignment loop, not frameLevelsFor,
>   which counts in trackMs only (ec3bbb2). Do not redefine them here;
>   report them.
> - the fit's health, which #66 added for exactly this: fitIterations and
>   fitConverged. A fit that reached its cap is reported, not refused, and
>   a run where that happens often means something the tuning pass needs.
> - the tracker's quality measure and its tracked-patch count.
>
> PER RUN, report:
> - share of frames in TRACK, and the number of re-acquisitions;
> - p50 / p95 of tracker-side TypeScript compute on TRACK frames,
>   excluding frame acquisition. This is ADR-0001 point 5's figure against
>   its 8 ms threshold, so it must be readable without deriving it from
>   anything else;
> - pyramidMs separately. #63 estimated 5.9-7.1 ms on the reference device
>   out of the ~10 ms the camera path leaves the whole tracker, by a proxy;
>   this run measures it directly, and that comparison is the point;
> - jitter on the static clip: the standard deviation, in pixels, of the
>   target's four reprojected corners over the run. Report it for the
>   stateless pipeline on the same clip too, so the comparison is on one
>   page. Define it once, in the page and in the export, so two exports
>   cannot mean different things by it.
>
> No change to packages/ unless a measurement hook is genuinely missing.
> If one is, say so and keep it minimal — it is a tracker change inside a
> bench PR, so it needs its own commit and its own justification.
>
> THE MEASUREMENT PLAN, before I run anything
>
> Write the plan into docs/benchmarks/README.md, not into the PR body:
> which clips, which device, which modes, how many runs, and for each one
> what it should show if things hold, plus what result would falsify it.
> Things worth stating expectations for:
> - tracking-state cost against 8 ms, and against the ~10 ms the camera
>   path leaves after acquire;
> - pyramidMs against #63's 5.9-7.1 ms estimate — if the direct
>   measurement disagrees, the proxy was wrong and that is worth knowing;
> - jitter, tracked against stateless: the tracker should be steadier, and
>   by how much is the number M3 and M4 will be compared against;
> - lock share on the three clips. #66 pins that one step recovers to
>   +-3.5 deg of roll and +-5% of scale, and that from 4 deg or 8% wrong
>   poses are accepted (up to 9.19 px, not persisting past a frame or
>   two). Say what that predicts for handheld footage.
>
> I will run: reference device (Tab_9_WiFi) and Oppo A72, the two moving
> clips and the static one, plus a camera run on the reference device.
> Camera runs need the rear camera (the selector from #60).
>
> Gates: npm run build, typecheck, test, format:check, check:contract.
> Close with verification-before-completion — paste the gate output — then
> nft-reviewer, then finishing-a-development-branch. PR against dev,
> milestone "M2: patch tracking".
