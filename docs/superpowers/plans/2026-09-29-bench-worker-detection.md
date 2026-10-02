# Bench Worker Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bench page an optional module worker that runs the tracker's detection pipeline off the frame loop under the approved on-demand policy, give the desktop replay the same policy with a modelled latency, and define every metric the measurement reads — so that the plan in the spec can run.

**Architecture:** One policy module (`examples/js/detection-policy.mjs`) owns "post on `needsDetection`, at most one in flight, drop not queue, hand the result to the next `process` call" and its accounting; the page and the replay both drive it, so they cannot drift. The worker is a thin entry (`examples/js/detection-worker.mjs`) over a Node-testable core (`examples/js/detection-worker-core.mjs`), bundled by esbuild into `examples/dist/` because a module worker does not read the page's import map. Every quantity the spec's rows read is a pure function in `examples/js/bench-metrics.mjs` with a `DEFINITIONS` entry and tests; `packages/nft-tracker` does not change.

**Tech Stack:** Plain ES modules in `examples/` and `scripts/` (no TypeScript there), Vitest (`vitest run --root examples`), esbuild 0.28.2 (exact pin), Node 24, desktop Chrome for the page checks, the built `dist/` of the three packages.

**Spec:** `docs/benchmarks/README.md`, section "2026-09-29 — M3: detection off the frame, measured" (and its evidence record `docs/benchmarks/2026-09-29-m3-lock-metric.md`).

## Global Constraints

- `packages/nft-tracker` does not change. If a task seems to need a change there, stop and report it: that would mean #78's contract is incomplete.
- The worker's source lives under `examples/`, loaded as a module worker; the page still works with the worker disabled — `?detection=sync`, the default, is the baseline and cannot be removed.
- New metrics are defined once in `examples/js/bench-metrics.mjs`, each with its own `DEFINITIONS` entry and tests. Do not redefine `trackMs`, `alignMs` or `pyramidMs`. No existing definition changes meaning, so `METRICS_VERSION` stays 1 (a bump would make `compare-bench` refuse every committed export).
- esbuild is a root devDependency pinned exactly: `"esbuild": "0.28.2"`, no caret, as `prettier` is pinned at 3.6.2. The root `build` script runs the bundling step explicitly after the three packages' builds, since it reads their `dist/`.
- The bundle is build output: `examples/dist/` is already covered by `.gitignore`'s `dist/`; never commit it.
- New files carry the LGPL header `examples/js/bench-metrics.mjs` carries. Code, comments, commit messages and docs in English. Conventional Commits (`feat(examples): …`, `test(examples): …`, `chore: …`); the PR goes to `dev`.
- Formatting: `scripts/*.mjs` is in prettier's scope (the edit hook formats it); `examples/` is not.
- The accounting identity is asserted, never described: `requests = consumptions + dropped + discardedAtStop`, and `ignored = 0`.
- A lock is a confirmed TRACK. `trackTimeShare` reads loops 1–4 of a run that starts at the clip's first frame, on a 10 ms grid fixed to media time, holding across wraps; a run records at least one frame of loop 5.
- Gates before the PR: `npm run build`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run check:contract`.

## Review Focus

1. **A result from a previous run reaching a new one** (Stop, then Start, while a job is in flight): it must be discarded and counted, never handed to the new run's tracker. Task 6 pins it (jobs carry a run id).
2. **The worker failing mid-run** (an `error` reply, `onerror`, or a job that never returns): the run must stop with the error shown and refuse to export, not run on in `no-detection` for ever. Task 6 pins the error path; the job timeout is 5 s.
3. **A detection posted before a loop wrap and consumed after it**: every latency is counted on a continuous clock (the page's `performance.now()`; the replay's unwrapped timeline), never on media time that resets. Tasks 4 and 7 pin it.
4. **`?detection=worker` where it cannot run** — the image target, `stateless` or `detection-only` mode, a webcam source with `?loops=` — refused at Start with a one-line reason, before any source starts. Task 3 pins it.
5. **A run that fills the 2,000-frame window before loop 5**: its loop 1 would lose its first bins. `trackTimeShare` must report the run incomplete (`share: null, complete: false`) rather than a number; the page's export says so. Task 4 pins it.

---

### Task 1: The worker's core, tested in Node

**Files:**
- Create: `examples/js/detection-worker-core.mjs`
- Create: `examples/js/instrument-backend.mjs`
- Modify: `examples/js/bench-metrics.mjs` (`DETECTION_STAGES`)
- Modify: `examples/bench-nft.html` (replace the inline `instrumentBackend` at 657–676 with an import of the moved function; behaviour identical)
- Test: `examples/test/detection-worker-core.test.mjs`

**Interfaces:**
- Produces:
  - `instrumentBackend(cv, timings, clock = () => performance.now())` in `instrument-backend.mjs` — the page's function moved verbatim: wraps `detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography` (key `pose`) and `filterMatches` when present, adding each call's duration into `timings[key]`; passes `capabilities` through.
  - `DETECTION_STAGES = Object.freeze(["detect", "describe", "match", "filterMatches", "estimateHomography"])` in `bench-metrics.mjs`, which owns what the metrics mean; the worker core imports it from there.
  - `async prepareWorkerDetection({ targetBytes, options }, deps) → { cv, setup, targetSha256 }` where `deps = { createBackend, decode, prepareDetection, sha256Hex }`; throws `Error` with the decoder's `error: detail` when `decode` fails.
  - `runWorkerDetection(state, { jobId, runId, frame, timestampMs }, deps) → { type: "result", jobId, runId, detection, workerMs }` where `deps = { detectTarget, now }`, `workerMs` has every `DETECTION_STAGES` key the backend has plus `total` (the whole `detectTarget` call on the worker's clock).
  - The message protocol, documented in the core's header comment: page → worker `{ type: "init", targetBytes: ArrayBuffer, options: { sceneLevels, maxSceneKeypoints, ratio, ransacThreshold } }` and `{ type: "detect", jobId, runId, frame: { width, height, data }, timestampMs }`; worker → page `{ type: "ready", targetSha256 }`, the `result` above, and `{ type: "error", jobId?, runId?, message }`.

- [ ] **Step 1: Write the failing tests** in `examples/test/detection-worker-core.test.mjs`, with the real modules (`../../packages/nft-tracker/dist/index.js`, `../../packages/cv-backend-jsfeatnext/dist/index.js`, `../js/bench-metrics.mjs`), the committed `examples/targets/pinball.wnft`, and a camera view rendered as the package's shipped-target tests render one (`readPgm(TARGET_FIXTURE)`, `view`, `renderWarp` from `packages/nft-tracker/test/fixtures/`). Seed `Math.random` with a local mulberry32 around each detection.
  - `it("prepares the same setup the tracker builds, and reports the target's SHA-256")`: `targetSha256` equals `await sha256Hex(bytes)`; `setup.maxSceneKeypoints === 300`, `setup.ratio === 0.8`.
  - `it("detects exactly what detectTarget detects on the main thread")`: same seed → `numMatches`, `numInliers`, `Array.from(H)` and `sceneKeypoints` equal a direct `detectTarget(cv2, prepareDetection(cv2, target, options), frame, 12.5)`.
  - `it("returns a reply that survives structuredClone, with the job and run ids and the worker's stage times")`: `structuredClone(reply)` `toEqual` `reply`; `reply.jobId === 7`, `reply.runId === 3`; `Object.keys(reply.workerMs)` includes `detect`, `describe`, `match`, `estimateHomography`, `total`, and not `filterMatches` (jsfeatNext has none); every value ≥ 0; `workerMs.total ≥` the stages' sum.
  - `it("refuses a target the decoder refuses, with the decoder's reason")`: bytes `new Uint8Array(16)` → rejects with `/decode|magic|header/i`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build && npx vitest run --root examples detection-worker-core`
Expected: FAIL — `detection-worker-core.mjs` does not exist.

- [ ] **Step 3: Implement** `instrument-backend.mjs` (move the page's function; the page imports it) and `detection-worker-core.mjs` (`prepareWorkerDetection`, `runWorkerDetection`). The core imports nothing itself: every dependency comes in `deps`, so the Node test injects the real modules and the worker entry injects the bundled ones.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root examples detection-worker-core`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add examples/js/detection-worker-core.mjs examples/js/instrument-backend.mjs examples/js/bench-metrics.mjs examples/bench-nft.html examples/test/detection-worker-core.test.mjs
git commit -m "feat(examples): the detection worker's core, testable in Node, and a shared backend instrumentation"
```

### Task 2: The worker entry, bundled by esbuild at build time

**Files:**
- Create: `examples/js/detection-worker.mjs`
- Modify: `package.json` (devDependency `"esbuild": "0.28.2"`; scripts `build` and `build:worker`)
- Modify: `package-lock.json` (via `npm install --save-dev --save-exact esbuild@0.28.2`)
- Modify: `AGENTS.md` (the Build paragraph: a fourth step, and why it comes last)
- Test: `examples/test/detection-worker-bundle.test.mjs`

**Interfaces:**
- Consumes: Task 1's `prepareWorkerDetection`, `runWorkerDetection`, `instrumentBackend`, and the protocol.
- Produces: `examples/dist/detection-worker.mjs`, a self-contained ESM bundle loadable by `new Worker(new URL("./dist/detection-worker.mjs", location.href), { type: "module" })` from `examples/bench-nft.html`.

- [ ] **Step 1: Write the failing test** `examples/test/detection-worker-bundle.test.mjs`:
  - `it("is built, and resolves every module at build time: no bare import is left")`: the file exists; its text matches none of `/\bfrom\s*["']@/`, `/\bimport\s*\(\s*["']@/`, `/\bimport\s*["']@/`.
  - `it("pins esbuild exactly")`: root `package.json`'s `devDependencies.esbuild === "0.28.2"`.
  - `it("builds the worker after the three packages, explicitly")`: the root `build` script ends with `&& npm run build:worker`, and `build:worker` names `examples/js/detection-worker.mjs` and `--outfile=examples/dist/detection-worker.mjs`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --root examples detection-worker-bundle`
Expected: FAIL — no bundle, no esbuild pin.

- [ ] **Step 3: Implement.** `npm install --save-dev --save-exact esbuild@0.28.2`. `build:worker` is `esbuild examples/js/detection-worker.mjs --bundle --format=esm --platform=browser --target=es2022 --outfile=examples/dist/detection-worker.mjs`; `build` becomes the current chain `&& npm run build:worker`. The entry imports the packages by bare name (`@webarkit/nft-tracker`, `@webarkit/cv-backend-jsfeatnext`, `../js/bench-metrics.mjs`'s `sha256Hex`), injects them into the core, and wires `self.onmessage`: `init` → `ready` or `error`; `detect` → `result` or `error` with the job's ids; any throw becomes an `error` reply, never an unhandled rejection. AGENTS.md's Build line gains: "then bundles `examples/js/detection-worker.mjs` into `examples/dist/` with esbuild — last, because it reads the packages' `dist/`, and because a module worker does not read the page's import map."

- [ ] **Step 4: Run the build and the test**

Run: `npm run build && npx vitest run --root examples detection-worker-bundle`
Expected: build exits 0 and writes `examples/dist/detection-worker.mjs`; PASS, 3 tests. `git status --short` shows no file under `examples/dist/`.

- [ ] **Step 5: Commit**

```bash
git add examples/js/detection-worker.mjs package.json package-lock.json AGENTS.md examples/test/detection-worker-bundle.test.mjs
git commit -m "feat(examples): bundle the detection worker with esbuild, pinned, after the packages' build"
```

### Task 3: The policy, its accounting, and the run parameters

**Files:**
- Create: `examples/js/detection-policy.mjs`
- Modify: `examples/js/bench-metrics.mjs` (`DETECTION_PATHS`, `accountingError`, `parseRunParams`, `startRefusal`, two `DEFINITIONS` entries)
- Test: `examples/test/detection-policy.test.mjs`, `examples/test/bench-metrics.test.mjs`

**Interfaces:**
- Produces, in `detection-policy.mjs`:
  - `createDetectionPolicy() → { take(): Detection | null, afterProcess(result, post: () => void): void, arrive(detection): void, stop(): void, get inFlight(): boolean, get held(): boolean, accounting(): Accounting }`.
  - `Accounting = { requests, posted, consumptions, ignored, dropped, discardedAtStop }` — all whole-run counts. `take()` returns the held detection and marks it handed (at most once). `afterProcess` first settles a handed detection by `result.detectionUse` (`"consumed"` → `consumptions++`; `"ignored"` → `ignored++`; anything else throws `Error("a handed-in detection was neither consumed nor ignored")`), then, if `result.needsDetection`, counts a request and calls `post()` (`posted++`, in flight) when nothing is in flight or held, else counts `dropped`. `arrive` with nothing in flight throws. `stop()` counts an in-flight or held job as `discardedAtStop`; calls after `stop()` are no-ops.
- Produces, in `bench-metrics.mjs`:
  - `DETECTION_PATHS = Object.freeze(["sync", "worker"])`.
  - `accountingError(acc) → string | null`: `null` iff every count is a whole number ≥ 0, `requests === consumptions + dropped + discardedAtStop`, and `ignored === 0`; otherwise one line naming the counts, e.g. `"detection accounting does not balance: requests 41 ≠ consumptions 30 + dropped 9 + discardedAtStop 1"` or `"2 detections were handed in while a lock held (ignored), where the policy allows none"`.
  - `parseRunParams` gains `detection` (`"sync"` default; `?detection=` other than `sync`/`worker` → `paramErrors` `"?detection=${raw}: expected sync or worker"`), `loops` (`parsePositiveInt`; a present but invalid raw → `paramErrors`), `run` (same). The full-shape `toEqual` test gains the three keys.
  - `startRefusal({ mode, target, minTrackedPatches, file, detection = "sync", source = null, loops = null })` also refuses: `detection === "worker"` with a mode other than `tracking` (`"?detection=worker runs in tracking mode only."`), with a target that is not the `.wnft` (`"?detection=worker needs the .wnft target: the worker decodes its bytes."`); and `loops` with `source === "webcam"` (`"?loops= needs a looping clip, not the webcam."`).
  - `DEFINITIONS.detectionAccounting` and `DEFINITIONS.detectionPath` (non-summary keys: add them to the test's list beside `corners` and `alignment`).

- [ ] **Step 1: Write the failing tests.** In `detection-policy.test.mjs`, driving the policy with fake results (`{ needsDetection, detectionUse }`) and a counting `post`:
  - `it("posts on needsDetection when idle, and hands the result to the next process call exactly once")`: frame 1 `needsDetection` → `post` called once, `inFlight`; `arrive(d)` → `held`; `take()` returns `d`, a second `take()` returns `null`; `afterProcess({ detectionUse: "consumed", needsDetection: false })` → `accounting()` `{ requests: 1, posted: 1, consumptions: 1, ignored: 0, dropped: 0, discardedAtStop: 0 }`.
  - `it("drops a request while one is in flight, and does not queue it")`: two `needsDetection` results while in flight → `dropped: 2`, `post` called once.
  - `it("posts again from the very call that refused a consumed detection")`: handed `d`, result `{ detectionUse: "consumed", needsDetection: true }` → `consumptions: 1`, `post` called a second time in the same `afterProcess`.
  - `it("counts an in-flight job and a held one as discarded at Stop, and ignores arrivals after it")`.
  - `it("counts a detection handed in while a lock held as ignored")`, and `it("throws when a handed-in detection is neither consumed nor ignored")`, and `it("throws when a result arrives with nothing in flight")`.
  - `it("keeps requests = consumptions + dropped + discardedAtStop over a random run")`: 2,000 steps of seeded random `needsDetection`/arrival/stop events → `accountingError(policy.accounting()) === null`.
  In `bench-metrics.test.mjs`:
  - `describe("accountingError")`: `null` on a balanced run; `/does not balance/` when `requests` exceeds the sum; `/ignored/` when `ignored: 1`; `/whole number/` on `-1` or `1.5`; every message one line.
  - In `describe("parsePositiveInt and parseRunParams")`: `?detection=worker&loops=4&run=3` → `detection: "worker", loops: 4, run: 3`; `?detection=gpu` → `paramErrors` `[/\?detection=gpu: expected sync or worker/]`; `?loops=0` → `paramErrors` `[/\?loops=/]`; absent → `detection: "sync", loops: null, run: null`.
  - In `describe("startRefusal")`: the three new refusals, each one line; `detection: "worker"` with `mode: "tracking"`, a `.wnft` target and a bundled source → `null`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --root examples detection-policy bench-metrics`
Expected: FAIL — module missing; `parseRunParams` shape mismatch.

- [ ] **Step 3: Implement** `detection-policy.mjs` and the `bench-metrics.mjs` additions. The `DEFINITIONS` text for `detectionAccounting` states the identity and the whole-run span; for `detectionPath`, "sync: the tracker detects on the frame loop (M2); worker: a module worker detects, under the on-demand policy (docs/benchmarks/README.md, 2026-09-29)".

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run --root examples detection-policy bench-metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/js/detection-policy.mjs examples/js/bench-metrics.mjs examples/test/detection-policy.test.mjs examples/test/bench-metrics.test.mjs
git commit -m "feat(examples): the on-demand detection policy, its asserted accounting, and the worker's run parameters"
```

### Task 4: Frame records and the lock over whole loops

**Files:**
- Modify: `examples/js/bench-metrics.mjs` (`frameRecord`, `framesForStage`, `unwrapMediaTimes`, `countedLoopFrames`, `trackTimeShare`)
- Test: `examples/test/bench-metrics.test.mjs`

**Interfaces:**
- Produces:
  - `frameRecord({ ..., detection = null })` adds `needsDetection` (`result.needsDetection ?? false` for a tracker, else `false`), `detectionUse` (`result.detectionUse ?? null`), `detectionLatencyMs` (`result.detectionLatencyMs ?? null`), `detectionInFlight` (`detection?.inFlight ?? false`) and `detectedAt` — `{ timestampMs, mediaTimeSeconds, framesAgo }` of the frame the used detection was computed on: `detection.detectedAt` for a consumed one (the page supplies it), this frame itself (`framesAgo: 0`) when `result.detectionUse === "internal"`, else `null`. The key-enumerating `toEqual` (test 167–187) gains the five keys.
  - `framesForStage(frames, stage)` for `detect`/`describe`/`match`/`filterMatches`: frames with `detectionUse === "internal"`; a record without `detectionUse` (older exports) falls back to `state !== "TRACK"`. `estimateHomography` keeps its extra `reason !== "too-few-matches"`.
  - `unwrapMediaTimes(frames, clipDurationS) → number[]`: seconds on one timeline, loop *k* adding *k*·D, loop 0 holding the first frame.
  - `countedLoopFrames(frames, { clipDurationS, firstLoop = 1, loopCount = 4 }) → frames` whose unwrapped time is in [first·D, (first + count)·D).
  - `trackTimeShare(frames, { clipDurationS, firstLoop = 1, loopCount = 4, binMs = 10 }) → { share, perLoop, binMs, loops: [firstLoop, firstLoop + loopCount - 1], complete }`: bin *j* of loop *k* starts at *k*·D + *j*·`binMs`; each bin takes the state of the most recent frame at or before its start, holding across wraps; TRACK bins ÷ bins. `complete` is false — and `share` and `perLoop` null — unless some frame precedes loop *first*'s first bin and some frame lies in loop *first + count*.

- [ ] **Step 1: Write the failing tests** (a `frame(state, t, o)`-style factory with `mediaTimeSeconds` on a 1-second test clip, `D = 1`):
  - `it("records what became of detection on every frame")`: a consumed result with `detection: { inFlight: false, detectedAt: { timestampMs: 100, mediaTimeSeconds: 0.2, framesAgo: 3 } }` → the five fields; an internal one → `detectedAt` is the frame itself with `framesAgo: 0`; a stateless result → `needsDetection: false, detectionUse: null`.
  - `it("takes the detection stages over the frames that ran the tracker's own detection, and reads older exports as M2's")`.
  - `it("reads the lock over loops 1 to 4 on a fixed grid, holding the state across a wrap")`: hand-built frames where loop 1 is TRACK from 0.5 s on, the warm-up's last frame TRACK → loop 1's first half TRACK too; `perLoop[0] === 1`.
  - `it("is exactly unchanged when frames inside a run of equal states are removed")`: on every committed `docs/benchmarks/2026-09-29-tab9-tuning-r2-*-{wall,table}*.json` (read from the repo; `clipDurationS` 11.96 and 8.9, `firstLoop: 0`, `loopCount` = the whole loops present), removing every second frame whose state equals both neighbours' leaves `share` identical to the last digit.
  - `it("reports a run incomplete when loop 5 was not reached or loop 1 has no frame before it")`: `complete: false, share: null`.
  - `it("uses the bin size it reports")`: `binMs: 10` in the result.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root examples bench-metrics`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Implement** the five changes. `trackTimeShare` walks bins with one pointer over the unwrapped times (the committed `whole-loops.mjs` in the spec's record does the same over `firstLoop..`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --root examples bench-metrics`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs
git commit -m "feat(examples): frame records say what became of detection; trackTimeShare over whole loops"
```

### Task 5: Detection locks, first steps, frame time and where detection's time goes

**Files:**
- Modify: `examples/js/bench-metrics.mjs` (`detectionLocks`, `firstStepLatency`, `detectionOutcomes`, `trackFramesWithDetectionInFlight`, `frameMs`, `unlockedResidualMs`, `detectionTime`, `summarizeRun`, `DEFINITIONS`)
- Test: `examples/test/bench-metrics.test.mjs`

**Interfaces:**
- Consumes: Task 4's record fields, `countedLoopFrames`, `trackTimeShare`; Task 1's `DETECTION_STAGES` (in the same file).
- Produces:
  - `detectionLocks(frames) → { n, confirmed, refused: { [trackLoss]: count }, reacquisitions, reacquisitionsAtLoopWrap }`. A detection lock is set on a DETECT frame (the tracker's own detection) or on a frame with `detectionUse === "consumed"` whose state is TRACK or whose `reason` is `"unconfirmed"`; its first step is the next frame's after a DETECT frame and the same frame's after a consumed one. `n`, `confirmed` (first step TRACK) and `refused` count locks whose first step is in `frames`; `reacquisitions` counts locks set after an earlier frame had a pose, the first frame after a loop wrap counted apart.
  - `firstStepLatency(frames, { clipDurationS = null }) → { ms, videoMs, frames }` (each `stats(...)`), per detection lock with its first step in `frames`: main-thread ms (first-step frame's `timestampMs` − `detectedAt.timestampMs`), video ms (on unwrapped times when `clipDurationS` is given, else only where media time did not wrap), and processed frames (`detectedAt.framesAgo` + 1 after a DETECT frame, `detectedAt.framesAgo` after a consumed one).
  - `detectionOutcomes(frames) → { used, failed: { [reason]: count }, locked, ignored }` over frames with `detectionUse` `"internal"` or `"consumed"` (`failed`: the detection's own `too-few-matches` / `no-consensus`), `ignored` over `"ignored"`.
  - `trackFramesWithDetectionInFlight(frames) → number`.
  - `frameMs(frames) → { all, track, unlocked }`, `stats` of `timings.total`.
  - `unlockedResidualMs(frames) → stats` of `timings.total − timings.acquire − timings.gray − (timings.detectionPost ?? 0)` per unlocked frame.
  - `detectionTime(frames, jobs = [], { clipDurationS = null }) → { onLoop: { share, msPerVideoSecond, postMs, handlerMs }, offLoop: { workerMs, msPerVideoSecond }, postToArrivalMs }`. On the loop: the `DETECTION_STAGES` on frames with `detectionUse === "internal"`, plus `timings.detectionPost`, plus each job's `handlerMs`; `share` over Σ `timings.total` + Σ `handlerMs`; per video second over the frames' covered media time. Off the loop: each job's `workerMs.total`. `postToArrivalMs`: `stats` of `arrivedAtMs − postedAtMs` — the spec's `detectionPostToArrivalMs`. A job is `{ jobId, runId, tick, postedAtMs, arrivedAtMs, handlerMs, workerMs, consumedAtTick, outcome }`.
  - `summarizeRun(frames, { clipDurationS = null, loops = null, jobs = [], accounting = null } = {})`: with `loops` (`{ firstLoop, loopCount }`), every existing and new frame metric reads `countedLoopFrames`, and `trackTimeShare` reads all frames; adds the keys `trackTimeShare`, `detectionLocks`, `firstStepLatency`, `detectionOutcomes`, `trackFramesWithDetectionInFlight`, `frameMs`, `unlockedResidualMs`, `detectionTime`, `detectionAccounting` (the given accounting with `error: accountingError(accounting)`, or `null`). Without options the existing keys are unchanged and the new ones are `null` or empty.
  - A `DEFINITIONS` entry for every new key (the existing invariant test enforces it), each naming its source fields and the frames it counts, in the file's style.

- [ ] **Step 1: Write the failing tests.**
  - `it("reproduces M2's firstSteps and reacquisitions on the exports they were published from")`: for `docs/benchmarks/2026-09-29-tab9-tuning-r2-p48-s16-wall.json` and `-table.json`, `detectionLocks(e.frames)` `n`/`confirmed`/`reacquisitions` equal `e.runSummary.firstSteps.n` (106 and 48), `.confirmed` (14 and 11) and `e.runSummary.reacquisitions` (104 and 46).
  - `it("counts a consumed detection's lock on its own frame, confirmed or refused per trackLoss")`: consumed TRACK → `confirmed: 1`; consumed LOST `unconfirmed` with `trackLoss: "too-few-patches"` → `refused: { "too-few-patches": 1 }`; consumed LOST `too-few-matches` → no lock, `detectionOutcomes.failed["too-few-matches"] === 1`.
  - `it("measures first-step latency by one rule in both modes")`: sync DETECT at t=0 then TRACK at t=120 → `ms.p50 === 120, frames.p50 === 1`; worker consumed TRACK at t=120 with `detectedAt { timestampMs: 0, framesAgo: 3 }` → `ms.p50 === 120, frames.p50 === 3`; across a wrap with `clipDurationS` → the unwrapped video ms, not a negative one.
  - `it("attributes detection's time on the loop to its parts")`: a sync record with `detect: 7, describe: 10, match: 50, estimateHomography: 2, total: 100` → `onLoop.share === 0.69`; a worker run with `detectionPost: 0.4` on one frame and one job `handlerMs: 0.2` → `onLoop.postMs.p50 === 0.4`, `onLoop.handlerMs.p50 === 0.2`.
  - `it("bounds the unlocked frames' residual frame by frame, a frame that did not post subtracting no post")`.
  - `it("reads every summary metric over the counted loops, and the lock over whole loops, when loops are given")`, and `it("leaves every existing summary key unchanged when no options are given")` (a snapshot of `summarizeRun(window)` for an existing fixture, minus the new keys, equals today's).
  - `it("carries the accounting and its error in the summary")`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root examples bench-metrics`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Implement** the functions and `summarizeRun`'s options; add the `DEFINITIONS` entries.

- [ ] **Step 4: Run the examples' tests**

Run: `npx vitest run --root examples`
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add examples/js/bench-metrics.mjs examples/test/bench-metrics.test.mjs
git commit -m "feat(examples): detection locks by one rule for both modes, first-step latency, and where detection's time goes"
```

### Task 6: The page's worker path

**Files:**
- Modify: `examples/bench-nft.html`
- Modify: `examples/README.md` (the worker mode, its parameters, and that `npm run build` makes the bundle)

**Interfaces:**
- Consumes: Tasks 1–5 (`createDetectionPolicy`, `accountingError`, `parseRunParams`'s `detection`/`loops`/`run`, `startRefusal`'s new arguments, `frameRecord`'s `detection`, `summarizeRun`'s options, `DETECTION_STAGES`, `instrumentBackend`).
- Produces: exports that carry `detection: { path, policy: "on-demand, one in flight, dropped not queued", workerBundleSha256, jobs, accounting }`, `run: { order, startedAtIso, endedAtIso }`, `loops: { firstLoop: 1, loopCount }`, `clipDurationS`, and `runSummary` from `summarizeRun(history, { clipDurationS, loops, jobs, accounting })`.

- [ ] **Step 1: Wire the parameters and the worker's lifecycle.**
  - Keep the `.wnft` bytes: `targets.wnft.bytes = bytes` in `main()` (1435–1459).
  - `TUNING.detection === "worker"`: create the worker once in `main()` from `new URL("./dist/detection-worker.mjs", location.href)` as a module worker; fetch that URL too and record `workerBundleSha256 = await sha256Hex(...)`. Start is not enabled until the worker has answered `init` (the target bytes, copied with `bytes.slice(0)`, and `{ sceneLevels: DEFAULT_SCENE_LEVELS, maxSceneKeypoints, ratio: DEFAULT_RATIO, ransacThreshold: DEFAULT_RANSAC_THRESHOLD }`) with `ready` and a `targetSha256` equal to the page's target record's; `error`, `onerror`, or a mismatch shows the error and keeps Start disabled. `maxKeypoints` is read at Start, so `init` is re-sent at Start when it differs from the last one sent.
  - `startRefusal` gets `detection`, `source` and `loops`; a refusal starts no source.
  - Every run gets a `runId` (incrementing); Stop calls `policy.stop()`; a reply whose `runId` is not the current run's is discarded (counted in the export as `staleReplies`), never handed in.

- [ ] **Step 2: Wire the tick.** In worker mode: `new NftTracker(icv, targetDb, K, { ...TUNING.trackerOverrides, maxSceneKeypoints, externalDetection: true, clock })`; `trackerOptions()` records `externalDetection`. Per tick: `const handed = policy.take()`; `result = tracker.process(frame, t0, handed)`; then `policy.afterProcess(result, post)` where `post` stamps `postedAtMs = performance.now()`, posts `{ type: "detect", jobId, runId, frame, timestampMs: t0 }` with `frame.data.buffer` **transferred** (the main thread no longer reads this frame's pixels after `process`; `toGrayTimed` allocates a fresh buffer every tick) and records the job with its `tick` and the frame's `t0`/`mediaTime`; `timings.detectionPost` is `post`'s duration, inside `timings.total` (compute `total` after `afterProcess`). The `message` handler stamps `arrivedAtMs`, times itself into the job's `handlerMs`, and calls `policy.arrive(detection)`. `frameRecord` gets `detection: { inFlight: policy.inFlight, detectedAt }` with the consumed job's `{ timestampMs, mediaTimeSeconds, framesAgo: ticks − job.tick }`. A job without a reply for 5 s stops the run with an error. Sync mode is unchanged.

- [ ] **Step 3: Wire the run protocol and the export.** `?loops=N`: the page stops itself on the first processed frame of loop N + 1 (counting wraps from the run's first frame; `clipDurationS = video.duration`) and sets the status row to `done`; the window then must hold every frame since loop 0's last frame, else the export's `runSummary.trackTimeShare.complete` is false. `?run=` goes into `run.order`; `startedAtIso`/`endedAtIso` are `new Date().toISOString()` at Start and at the stop. The download refuses, with `accountingError`'s message, a worker run whose accounting does not balance. New stats rows (worker mode: jobs, dropped, in flight; `trackTimeShare`) go before the `window` row, which stays last (the driver reads it).

- [ ] **Step 4: Check it in desktop Chrome** (the bench tools' static server and CDP driver, outside the repo, as round 2 used them):
  - `?mode=tracking&detection=sync&clip=pinball-bench.mp4&window=2000&loops=1&run=1`: the export's `runSummary` equals, key for key, what the page exported before this task for the existing keys; `detection.path === "sync"`.
  - The same with `detection=worker`: `detection.accounting` balances (`accountingError` null), `ignored === 0`, `runSummary.trackFramesWithDetectionInFlight === 0`, jobs have `postedAtMs < arrivedAtMs`, `runSummary.detectionTime.onLoop.share < 0.05`, `trackTimeShare.complete === true` with `perLoop.length === 1`.
  - Stop mid-run while a job is in flight, Start again: the old job's reply is counted in `staleReplies` and the new run's accounting balances.
  - `?detection=worker&mode=stateless` and `&target=image`: Start refused, one line, no video plays.
  - With `examples/dist/detection-worker.mjs` renamed away, `?detection=worker`: Start stays disabled and the error names the worker (restore the file after).
  Expected: all five as stated; no console error other than the deliberate one.

- [ ] **Step 5: Commit**

```bash
git add examples/bench-nft.html examples/README.md
git commit -m "feat(examples): the bench page's worker path, on-demand, with its run protocol and asserted accounting"
```

### Task 7: The replay's external-detection arms

**Files:**
- Modify: `scripts/replay-clips.mjs`
- Modify: `examples/js/bench-metrics.mjs` (`sequenceRefusal` refuses a worker export)
- Test: `examples/test/replay-clips-cli.test.mjs`, `examples/test/bench-metrics.test.mjs`

**Interfaces:**
- Consumes: `createDetectionPolicy` (Task 3); `summarizeRun`'s options (Task 5); `prepareDetection`, `detectTarget` from `../packages/nft-tracker/dist/index.js`.
- Produces: `--external <latencyMs>` (a finite number ≥ 0; incompatible with `--sequence`), which replaces the run table with five arms on each clip — `tracking, every frame, sync`; `tracking, every frame, worker (L ms)`; `tracking, every frame, sync as external at its device latency` (the fallback re-check: ready at the frame's work + 83.2 ms); `tracking, device scaled step, sync`; `tracking, device scaled step, worker (L ms)`. Constants `M3_ACQUIRE_MS = { "pinball-static.mp4": 42.2, "pinball-bench.mp4": 27.7, "pinball-bench-table.mp4": 50.0 }` (round 2's adopted-target `acquire` + `gray` p50) for both modes in these arms, and `M3_LOOPS = 6` (loop 0 warm-up, loops 1–4 counted, loop 5 closes them). Each export gains `detection: { path, model: { latencyMs, acquireMs, detectMs: 83.2 }, accounting }` and `runSummary` from `summarizeRun(records, { clipDurationS: period, loops: { firstLoop: 1, loopCount: 4 }, accounting })`.

- [ ] **Step 1: Write the failing tests.**
  - In the CLI test: add `--external` to the "expects a value" list; `it("refuses --external with --sequence")` → status 2, `/--external.*--sequence/`; `it("refuses a latency that is not a number of milliseconds")` for `abc` and `-5` → status 2, `/--external expects/`.
  - In `bench-metrics.test.mjs`: `it("refuses to replay a worker run's frames as a sequence")`: `sequenceRefusal({ ...validExport, detection: { path: "worker" } }, …)` → `/worker/`, one line.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run build && npx vitest run --root examples replay-clips-cli bench-metrics`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement.** In the external arms: `new NftTracker(cv, target, K, { ...options, externalDetection: true, clock })` and `setup = prepareDetection(cv, target, options)` from the same options; timestamps on the unwrapped timeline (`times[k] * 1000`) for `process` and `detectTarget`, so no latency goes negative at a wrap; `mediaTimeSeconds` stays `pts`. Per processed frame: `policy.take()` → `process` → `policy.afterProcess(result, post)`, where `post` computes the detection now (inside `seeded()`, so it is reproducible) and makes it ready at `times[k] + (acquireMs + (result.tracking ? stepMs : 0) + L) / 1000`; before each frame, a ready job whose time has come is `policy.arrive`d. A waiting frame's busy time is `acquireMs + (result.tracking ? stepMs : 0)`. The tuning probe is off for these arms. After the run, `accountingError` must be `null`, else exit 1 with its message. The header prints the latency and the acquisitions; the table adds `trackTimeShare` (and per loop), first steps by detection lock, and first-step latency p50 in video ms.

- [ ] **Step 4: Run the tests, then one real replay**

Run: `npx vitest run --root examples replay-clips-cli bench-metrics`, then `node scripts/replay-clips.mjs --external 70 --seed 1 --tracking-only`
Expected: PASS; the replay prints five arms per clip, every worker arm's accounting balanced, `trackTimeShare` complete for every arm.

- [ ] **Step 5: Commit**

```bash
git add scripts/replay-clips.mjs examples/js/bench-metrics.mjs examples/test/replay-clips-cli.test.mjs examples/test/bench-metrics.test.mjs
git commit -m "feat(scripts): replay-clips models the worker's on-demand detection, with latency counted from the post"
```

### Task 8: The latency transfer, for after the session

**Files:**
- Modify: `scripts/replay-clips.mjs`
- Test: `examples/test/replay-clips-cli.test.mjs`

**Interfaces:**
- Consumes: Task 7's external arms; the session's page exports (Task 6's shape).
- Produces: `--transfer <dir>` (incompatible with `--external` and `--sequence`): reads every `*.json` page export in `<dir>`, groups them by clip and `detection.path`, and on the device schedule replays each clip twice as external detection — latencies drawn with replacement (under the run's seed) from the worker runs' `postToArrivalMs` values and from the sync runs' per-frame pipeline times (the `DETECTION_STAGES` sum on `detectionUse === "internal"` frames), each after the session's own `acquire` + `gray` p50 for that mode and the session's `trackStepMs` p50 for the step. It prints, per clip, the two arms' `trackTimeShare` and the difference.

- [ ] **Step 1: Write the failing tests:** `it("refuses --transfer with --external or --sequence")` → status 2; `it("refuses a directory with no page export of both paths for a clip")` → status 1, `/no worker and sync exports/`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root examples replay-clips-cli`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement** the flag and the two arms, reusing Task 7's loop with a latency drawn per job instead of a constant.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --root examples replay-clips-cli`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/replay-clips.mjs examples/test/replay-clips-cli.test.mjs
git commit -m "feat(scripts): replay-clips transfers the session's measured latencies into points of lock"
```

### Task 9: Gates, and the branch reviewed as a whole

- [ ] **Step 1: Run the gates from the worktree root**

Run: `npm run build && npm run typecheck && npm test && npm run format:check && npm run check:contract`
Expected: every step exits 0; `git status --short` shows nothing under `examples/dist/`; `git diff dev -- packages/nft-tracker` is empty.

- [ ] **Step 2: Request the whole-branch review** (superpowers:requesting-code-review), with the spec, this plan and its Review Focus; fix what it finds under TDD.

- [ ] **Step 3: Commit any fixes**, each with its test.

## After the code, per the spec

Not tasks of this plan; each is a step of the spec's measurement, in its order: the desktop pre-flight (`--external 70`, `100`, `130`, seeds 1–3; record committed as the spec's rounds were); the on-device check that the worker loads and reports `ready` on `Tab_9_WiFi`; the bench driver (outside the repo) taught to wait for the page's `done` status and to pass `?loops=4&window=2000&run=<n>`; the device session of thirteen runs; `--transfer` over its exports; the results, the exports committed with both sizes reported, and the PR to `dev`.
