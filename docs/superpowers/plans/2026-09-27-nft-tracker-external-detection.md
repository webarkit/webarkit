# NFT tracker M3 — re-detection off the frame: external detection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an application run `NftTracker`'s detection pipeline where it likes — in a worker it owns, typically — and hand the result back to the state machine, so that a frame without a lock costs the package nothing while a detection is in flight; without changing what the tracker does on any frame where no detection is handed in.

**Architecture:** The detection pipeline that `NftTracker.detect` runs today becomes two exported pure functions in `src/detection.ts`: `prepareDetection(cv, target, options)` builds the per-target `DetectionSetup` once, and `detectTarget(cv, setup, frame, timestampMs)` runs the pipeline on one frame and returns a `Detection`, a fixed-shape struct that survives `structuredClone` (so a worker can post it). `NftTracker` uses those same two functions for its own synchronous detection, so M2 and M3 share one pipeline by construction. `process` gains an optional third argument, a `Detection` computed elsewhere: when the tracker has no lock it consumes it, locks on its homography and runs the tracking step **on the same frame** — the detection is of an earlier frame, so the step is what carries its pose to this one and checks it. A new option, `externalDetection: true`, makes the tracker never detect on its own: a frame without a lock and without a handed-in detection is `LOST` with `reason: "no-detection"`, makes no backend call, and says `needsDetection: true`. The tracker keeps no request state, no frame and no in-flight bookkeeping: the application owns the worker, the loop and the policy of how many detections it has running (ADR-0001 point 7).

**Tech Stack:** TypeScript 5.9, Vitest 4, npm workspaces. Runtime dependency of `@webarkit/nft-tracker` stays `@webarkit/cv-backend-spec` only. No Rust changes.

**Spec:** the design chosen in the conversation that produced this plan (option B of three: "the tracker's step takes an optional already-computed detection result produced elsewhere"), and:
- [ADR-0001](../../adr/0001-nft-tracker-ts-reference-above-cvbackend.md): point 3 (work proportional to a whole frame goes through the backend; nothing here moves a step into the backend, that is the next branch), point 7 (pure core, no workers or timers in the package, explicit results, determinism, fixed-shape data).
- [`packages/cv-backend-spec/src/cv_backend.ts`](../../../packages/cv-backend-spec/src/cv_backend.ts), boundary contract item 2: primitives stay synchronous; "if you want to offload work, offload a whole pipeline step to a Worker". The whole step offloaded here is the detection pipeline; the contract is not changed.
- [`docs/benchmarks/README.md`](../../benchmarks/README.md), "Results (2026-09-26)": the detection pipeline is 79.2 ms p50 on `Tab_9_WiFi` (87.8 p95); re-detection is 65–69% of the wall clip's frame time from 22–24% of its frames; 78–84% of a lock's first steps refuse the detection they were handed. "The pipeline's cost is the one that asynchronous detection (M3) … would take off the frame."
- Issue [#48](https://github.com/webarkit/webarkit/issues/48), "Out of scope": M3 is "asynchronous detection in a worker, latency reconciliation". This plan is the latency-reconciliation half and the package side of the worker half; the worker demo is a follow-up (see "Not in this plan").

---

## Global Constraints

- **Do not change** `packages/cv-backend-spec`, `packages/cv-backend-jsfeatnext`, the `.wnft` format, `crates/`, or any tuning threshold or default value. **No IPPE, no One Euro.** If something here needs one of those, stop and tell the user.
- **The state machine's observable behaviour on a frame where no detection is handed in does not change.** `git diff dev -- packages/nft-tracker/test/parity.test.ts packages/nft-tracker/test/tracker_state_machine.test.ts` stays empty, and both pass unchanged. The M2 tests that `toEqual` two results still pass because both sides carry the new fields.
- `src/` imports no backend (ADR-0001 point 2): `packages/nft-tracker` must still build with `packages/cv-backend-jsfeatnext/dist` deleted (the Finishing section checks it). No DOM, timers, workers, `requestAnimationFrame`, clock reads or held frames in `src/` (point 7).
- **Tests are deterministic and synchronous.** No real worker, no timer, no `await` of anything but `createJsfeatNextBackend()` in `beforeAll`. RANSAC is seeded through `withSeededRandom` (`test/fixtures/seeded_rng.ts`), one fresh generator per pipeline run, and every test that seeds asserts what drew and what did not. Latency is simulated by the test loop handing a detection to a later `process` call.
- **New failure and state reasons** extend the existing unions: `TrackFailure` in `src/tracker.ts` gains two members; the new `DetectionUse` union lives in `src/tracking/types.ts` beside `TrackingState`, changed once in Task 2. No parallel enum anywhere else.
- **Fixed-shape data.** `Detection` and `DetectionSetup` are plain structs of typed arrays, numbers, strings and `Keypoint[]`; no functions, no class instances, nothing `structuredClone` refuses.
- Explicit `{ ok, … }` results. Exceptions only for contract violations: options out of domain, a target the backend cannot read, a frame that is not a `GrayImage` while locked (as today).
- **Tests state the numbers they pin**: state strings and counts exactly; a measured value written beside its assertion.
- New `.ts` files carry the LGPL header of `packages/nft-tracker/src/tracker.ts` lines 1–38, with the file's own name on line 2.
- English in every artifact. Conventional Commits (`feat(nft-tracker): …`, `test(nft-tracker): …`, `docs(nft-tracker): …`), imperative subject. Every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```
- Branch `feat/nft-tracker-async-detect` in the worktree `D:\kalwalt-github\webarkit-m3-async`, off `dev` at `8db3867` (v0.3.0). The PR targets **`dev`**.
- Use the Bash tool (POSIX) for git/npm. **Never round-trip a source file through PowerShell.** A PostToolUse hook runs prettier on edited `.ts`/`.mjs`, so a file may differ on disk from what was written; `npm run format:check` is the arbiter.
- Node here is v24.21.0 (`>=18` required; `.nvmrc` pins v24.18.0). `structuredClone` is a global from Node 17.
- **Gates**, all from the repository root of the worktree, in this order: `npm install`, `npm run build`, `npm run typecheck`, `npm run format:check`, `npm run check:contract`, `npm test`. Report each with its actual output. `cargo test` is not needed unless something under `crates/` changed, which nothing here should.

## Design (approved in chat, recorded here)

**Exports** (all from `src/detection.ts`, re-exported by `src/index.ts`):

```ts
export interface DetectTargetOptions {
    readonly sceneLevels?: number;        // DEFAULT_SCENE_LEVELS, 1
    readonly maxSceneKeypoints?: number;  // DEFAULT_MAX_SCENE_KEYPOINTS, 300
    readonly ratio?: number;              // DEFAULT_RATIO, 0.8
    readonly ransacThreshold?: number;    // DEFAULT_RANSAC_THRESHOLD, 4
}

/** Everything `detectTarget` needs from the target, computed once. */
export interface DetectionSetup {
    readonly levels: readonly TargetLevelView[];
    /** The target's keypoints as the contract's array, for `filterMatches`; `null` when the backend has none. */
    readonly targetKeypoints: readonly Keypoint[] | null;
    readonly targetWidth: number;
    readonly targetHeight: number;
    /** The target's keypoint coordinates, f32 as stored (§5.5); widened to f64 per match. */
    readonly keypointX: Float32Array;
    readonly keypointY: Float32Array;
    readonly sceneLevels: number;
    readonly maxSceneKeypoints: number;
    readonly ratio: number;
    readonly ransacThreshold: number;
}

export type DetectionFailure = "too-few-matches" | "no-consensus";

export type Detection =
    | {
          readonly ok: true;
          /** The timestamp `detectTarget` was given for the frame it detected. */
          readonly timestampMs: number;
          readonly numMatches: number;
          readonly numInliers: number;
          /** Target level-0 → frame level-0, row-major. */
          readonly H: Mat3;
          readonly sceneKeypoints: readonly Keypoint[];
      }
    | {
          readonly ok: false;
          readonly timestampMs: number;
          readonly reason: DetectionFailure;
          readonly numMatches: number;
          readonly numInliers: number;
          readonly sceneKeypoints: readonly Keypoint[];
      };

export function prepareDetection(cv: CvBackend, target: TargetDb, options?: DetectTargetOptions): DetectionSetup;
export function detectTarget(cv: CvBackend, setup: DetectionSetup, frame: GrayImage, timestampMs: number): Detection;
```

`prepareDetection` throws the same error `NftTracker`'s constructor throws today on a target the backend cannot read (`chooseDescriptorSet`). `detectTarget` is M2's private `NftTracker.detect` minus `state`, `quality` and `pose`: the tracker adds those. The four `DEFAULT_*` detection constants move from `tracker.ts` to `detection.ts`; `index.ts` exports them from there; nothing else about them changes.

**`NftTracker`:**

- `NftTrackerOptions.externalDetection?: boolean`, default `false`, validated as a boolean like `detectionOnly` (a non-boolean throws a `RangeError` naming it). Allowed together with `detectionOnly`.
- `process(frame: GrayImage, timestampMs: number, detection?: Detection | null): TrackResult`. A detection is trusted as `detectTarget` produced it; it is not validated.
- The frame, in order. (1) If locked, the tracking step runs exactly as in M2. If it holds: `"TRACK"`, and a handed-in detection is **ignored** (`detectionUse: "ignored"`). If it fails, the lock is dropped and `trackLoss` says why, as in M2. (2) Without a lock now: if a detection was handed in, it is **consumed** (`detectionUse: "consumed"`, `detectionLatencyMs = timestampMs − detection.timestampMs`) — see the table. Else, if `externalDetection` is `false`, the tracker runs `detectTarget` itself, exactly M2 (`detectionUse: "internal"`). Else the frame is `"LOST"` with `reason: "no-detection"`, `numMatches: 0`, `numInliers: 0`, empty `sceneKeypoints`, no backend call (`detectionUse: "none"`).
- `needsDetection` is `true` iff the tracker ends the frame without a lock and `externalDetection` is `true`. In detection-only external mode that is every frame. In the default mode it is always `false`.

What consuming a detection does:

| the detection | the tracker | result |
|---|---|---|
| `ok`, tracker tracks | locks `{ previous: null, current: H }` and runs `trackFrame` on **this** frame. Holds → keeps the new lock. Fails → lock `null`. | holds: `"TRACK"` from the step, `sceneKeypoints` = the detection's (the detected frame's, for overlays). Fails: `"LOST"`, `reason: "unconfirmed"`, `trackLoss` = the step's loss, `numMatches`/`numInliers` = the detection's, `sceneKeypoints` = the detection's. |
| `ok`, detection-only | no lock, as M2 | `"DETECT"`, `H`, `pose = cv.poseFromHomography(H, K)`, `quality = numInliers / numMatches`, counts and keypoints from the detection — M2's DETECT result, for an earlier frame. |
| not `ok` | no lock | `"LOST"` with the detection's `reason`, counts and keypoints. |

`tracking` and `trackLoss` are those of the **last** tracking step run this frame (a frame that drops a lock and then confirms a consumed detection ran two; only such a frame can). `timings.trackMs` sums the steps run this frame; `timings.detectMs` is 0 on a frame that consumed a detection.

**Result fields**, on both branches of `TrackResult` (added to `TrackingFields`):

```ts
readonly needsDetection: boolean;
readonly detectionUse: DetectionUse;          // "none" | "internal" | "consumed" | "ignored", in tracking/types.ts
readonly detectionLatencyMs: number | null;   // non-null iff "consumed"
```

`TrackFailure` becomes `"too-few-matches" | "no-consensus" | "no-detection" | "unconfirmed"`.

**Why the confirming step runs on the consuming frame, and not the next** (as M2's `"DETECT"` then `"TRACK"` does): a handed-in detection is of an earlier frame, so its `H` is not this frame's pose; returning it as `"DETECT"` would report a pose for the wrong frame and delay the check by one more frame of motion, on a path where 78–84% of first steps already refuse. The default mode is not changed to do the same, because that would change M2's behaviour on frames with no detection handed in.

**Parity with M2, exactly.** Run the M2 tracker with each frame `i` under seed `S + i` (`runSeededPerFrame` in `tracker_state_machine.test.ts`). Run an external tracker on the same frames, with a test loop that, on every frame whose result says `needsDetection` and while nothing is in flight, computes `detectTarget` on that frame under seed `S + i` and hands the result to `process` one frame later. Then, for every `i`: the external state is `"TRACK"` iff M2's is, and those results are `toEqual` except for the three new fields; where M2 is `"DETECT"` or `"LOST"` the external state is `"LOST"`; the detection the loop computed for frame `i` equals M2's frame-`i` result in `ok`, `reason`, `numMatches`, `numInliers`, `H` and `sceneKeypoints`; and the external `process` calls draw nothing from `Math.random`. This holds because both machines hold the same lock at the start of every frame: M2 locks on `H_i` at `i` and steps from it at `i + 1`; the external tracker consumes `H_i` at `i + 1` and steps from it there, and the steps are the same pure function of the same inputs.

**Not in this plan** (say so in the PR body): a worker demo in `examples/` (the demos and the bench page run unchanged on the default mode; the worker path is exercised by the synchronous tests and by `structuredClone`); moving any step into the backend (next branch); a staleness limit on a consumed detection (the confirming step is the check; a threshold would be a new tunable); using a detection that arrives while a lock is held (ignored; patch tracking is anchored to the target's own patches and does not drift); `bench-metrics.mjs` counting first steps by `detectionUse` in external mode (no export uses that mode yet).

## Review Focus

Inputs the design implies that no task's tests would otherwise exercise; each line's test is added to the task named.

1. **A detection handed to the default-mode tracker** (no `externalDetection`) while it has no lock: consumed, not ignored, and the internal detection does not also run — one code path decides. Task 3.
2. **A detection for a frame of another size** than the one it is consumed on (a phone turned between the two): the confirming step refuses (`"unconfirmed"`, `trackLoss: "too-few-patches"`, as M2's rotated-frame test does), never throws. Task 3.
3. **A detection that fails, handed in**: the frame is `"LOST"` with the detection's own reason and counts, `needsDetection` true, no backend call. Task 3.
4. **`structuredClone(detection)`**, the worker path's actual input: consumed identically to the original. Task 4.
5. **A frame that drops its lock and consumes a detection in the same call** (the caller had one in flight when the lock was still held): `trackLoss`, `tracking` and `timings` describe the confirming step, and the result is `"TRACK"` or `"unconfirmed"`, never the first step's loss with a `"TRACK"` state. Task 3.

## File structure

- `packages/nft-tracker/src/detection.ts` — modify: add `DetectTargetOptions`, `DetectionSetup`, `DetectionFailure`, `Detection`, `prepareDetection`, `detectTarget`, and the four detection `DEFAULT_*` constants moved from `tracker.ts`.
- `packages/nft-tracker/src/tracking/types.ts` — modify: `DetectionUse`.
- `packages/nft-tracker/src/tracker.ts` — modify: `TrackFailure`, `NftTrackerOptions.externalDetection`, `TrackingFields`, `process`'s third argument and the consuming logic; delete the private `detect`; the header comment's "Known limitation" paragraph.
- `packages/nft-tracker/src/index.ts` — modify: exports.
- `packages/nft-tracker/test/detect_target.test.ts` — create.
- `packages/nft-tracker/test/tracker_external_detection.test.ts` — create.
- `packages/nft-tracker/test/tracker_options.test.ts` — modify: the option's validation, the three fields on an M1-shaped result.
- `packages/nft-tracker/README.md` — modify: "The tracker" section.
- `packages/nft-tracker/AGENTS.md` — modify: one line under the portability rules, that the worker is the application's.

---

### Task 1: `prepareDetection` and `detectTarget`, and `NftTracker` built on them

**Files:**
- Modify: `packages/nft-tracker/src/detection.ts`
- Modify: `packages/nft-tracker/src/tracker.ts` (constants out; `detect` replaced)
- Modify: `packages/nft-tracker/src/index.ts`
- Create: `packages/nft-tracker/test/detect_target.test.ts`

**Interfaces:**
- Consumes: `buildLevelIndex`, `chooseDescriptorSet`, `matchPerLevel` (`detection.ts`), `toKeypointArray` (`tracker.ts`, moves to `detection.ts`).
- Produces: the exports listed under Design, with exactly those signatures. `NftTracker` holds a `private readonly setup: DetectionSetup` built in the constructor by `prepareDetection(cv, target, options)` and calls `detectTarget(this.cv, this.setup, frame, timestampMs)` where it called `this.detect` before.

- [ ] **Step 1: Write the failing tests** in `test/detect_target.test.ts` (the LGPL header, then the fixtures `tracker.test.ts` uses: `createJsfeatNextBackend`, `buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 })`, `readPgm(SCENE_FIXTURE)`, `withSeededRandom`):

```ts
describe("detectTarget", () => {
    it("is the tracker's own detection: same matches, inliers, H and keypoints as NftTracker.process under the same seed", () => {
        const setup = prepareDetection(cv, target, { maxSceneKeypoints: 900 });
        const { value: d } = withSeededRandom(1, () => detectTarget(cv, setup, scene, 12.5));
        const { value: r } = withSeededRandom(1, () =>
            new NftTracker(cv, target, K, { maxSceneKeypoints: 900 }).process(scene, 12.5),
        );
        expect(d.ok).toBe(true);
        expect(r.ok).toBe(true);
        if (!d.ok || !r.ok) return;
        expect(d.timestampMs).toBe(12.5);
        expect(d.numMatches).toBe(r.numMatches);
        expect(d.numInliers).toBe(r.numInliers);
        expect(Array.from(d.H)).toEqual(Array.from(r.H));
        expect(d.sceneKeypoints).toEqual(r.sceneKeypoints);
    });

    it("is pure: the same frame under the same seed gives the same Detection", () => { /* two runs, toEqual */ });

    it("fails explicitly on a blank frame: too-few-matches, fewer than 4 matches, 0 inliers", () => { /* blank 320×240 of 128 */ });

    it("survives structuredClone with every field intact", () => {
        /* structuredClone(d) toEqual d; d.H stays a Float64Array of length 9 */
    });
});

describe("prepareDetection", () => {
    it("takes the documented defaults: sceneLevels 1, maxSceneKeypoints 300, ratio 0.8, ransacThreshold 4", () => {
        /* compare each field with the DEFAULT_* constants imported from ../src/index.js */
    });
    it("builds one level view per target level with at least two rows, over the set's own bytes", () => {
        /* setup.levels.length === buildLevelIndex(chooseDescriptorSet(cv, target)).length */
    });
    it("materialises the target's keypoints only for a backend with filterMatches", () => {
        expect(prepareDetection(cv, target).targetKeypoints).toBeNull(); // jsfeatNext has none
        // A Proxy, not a spread: the backend is a class instance, and a spread would drop its methods.
        const filtering = new Proxy(cv, {
            get: (t, p) => (p === "filterMatches" ? (m: Match[]) => m : Reflect.get(t, p)),
        });
        expect(prepareDetection(filtering, target).targetKeypoints).toHaveLength(target.keypoints.count);
    });
    it("throws on a target whose descriptors the backend cannot read", () => { /* kind: "akaze", /no descriptor set/i */ });
});
```

- [ ] **Step 2: Run the file; verify it fails** with `prepareDetection`/`detectTarget` not exported.

Run: `npx vitest run test/detect_target.test.ts` from `packages/nft-tracker`.

- [ ] **Step 3: Implement in `src/detection.ts`.** Move `DEFAULT_SCENE_LEVELS`, `DEFAULT_MAX_SCENE_KEYPOINTS`, `DEFAULT_RATIO`, `DEFAULT_RANSAC_THRESHOLD` with their doc comments, and `toKeypointArray`, from `tracker.ts`. Write `prepareDetection` (level index, `targetKeypoints` iff `cv.filterMatches`, `meta.widthPx`/`heightPx`, `keypoints.x`/`y`, resolved options) and `detectTarget` as the body of M2's `NftTracker.detect` with `state`, `quality` and `pose` removed and `timestampMs` echoed. Add a doc comment on `detectTarget` saying it is the whole pipeline step the contract's boundary note 2 means by "offload a whole pipeline step to a Worker", that it holds no state and reads no clock, and that its result is `structuredClone`-safe.

- [ ] **Step 4: Rebuild `NftTracker` on them** in `src/tracker.ts`: replace the four option fields and `levels`/`targetKeypoints` with `private readonly setup: DetectionSetup`; delete the private `detect`; in `process`, build the `Detected` result from `detectTarget`'s `Detection` (add `state`, `quality`, `pose`). Update `src/index.ts` to export the four constants and the new names from `./detection.js`.

- [ ] **Step 5: Run the whole package suite and typecheck; verify every existing test passes unchanged.**

Run, from the repository root: `npm run build && npm run typecheck && npm test -w @webarkit/nft-tracker`
Expected: all green; in particular `parity.test.ts` and `tracker_state_machine.test.ts`, untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/src/detection.ts packages/nft-tracker/src/tracker.ts packages/nft-tracker/src/index.ts packages/nft-tracker/test/detect_target.test.ts
git commit -m "refactor(nft-tracker): export the detection pipeline as prepareDetection and detectTarget"
```

### Task 2: The M3 surface, with M2 behaviour: `externalDetection`, `DetectionUse`, the new result fields

**Files:**
- Modify: `packages/nft-tracker/src/tracking/types.ts`
- Modify: `packages/nft-tracker/src/tracker.ts`
- Modify: `packages/nft-tracker/src/index.ts`
- Modify: `packages/nft-tracker/test/tracker_options.test.ts`

**Interfaces:**
- Produces: `DetectionUse` in `tracking/types.ts` (exported from `index.ts`); `TrackFailure` with `"no-detection"` and `"unconfirmed"`; `NftTrackerOptions.externalDetection`; `NftTracker.externalDetection: boolean` (readonly, like `detectionOnly`); `TrackingFields.needsDetection`, `.detectionUse`, `.detectionLatencyMs`. After this task the default mode sets `detectionUse` to `"internal"` on a frame that ran the internal detection and `"none"` otherwise, `needsDetection` to `false`, `detectionLatencyMs` to `null`. `process` does **not** yet accept a detection; `externalDetection: true` is accepted and stored but not yet acted on (Task 3).

- [ ] **Step 1: Write the failing tests** in `tracker_options.test.ts`:

```ts
// in the it.each table of refused options:
["externalDetection", "later"],

it("carries the M3 fields on an M2 result: needsDetection false, detectionUse internal on a detected frame, none on a tracked one, latency null", () => {
    // one still frame detected, the next tracked (as the existing lock test does)
    // detected: needsDetection false, detectionUse "internal", detectionLatencyMs null
    // tracked:  needsDetection false, detectionUse "none",     detectionLatencyMs null
});

it("stores externalDetection, default false", () => {
    expect(new NftTracker(cv, tracked, K).externalDetection).toBe(false);
    expect(new NftTracker(cv, tracked, K, { externalDetection: true }).externalDetection).toBe(true);
});
```

- [ ] **Step 2: Run; verify the three fail** (`RangeError` not thrown; fields `undefined`).

- [ ] **Step 3: Implement.** `DetectionUse` in `tracking/types.ts` with a doc comment for each of the four values (the Design table's wording). In `tracker.ts`: the two `TrackFailure` members, each documented; the option, validated through the existing `flag` helper in `resolveTrackingOptions`; the three fields on `TrackingFields`, documented; `process` sets them as this task's Interfaces say. Export `DetectionUse` from `index.ts`.

- [ ] **Step 4: Run the package suite and typecheck; verify green.** The `toEqual` comparisons in `tracker_state_machine.test.ts` ("tracks a frame whose buffer is longer…") still hold, both sides carrying the new fields.

- [ ] **Step 5: Commit**

```bash
git add packages/nft-tracker/src packages/nft-tracker/test/tracker_options.test.ts
git commit -m "feat(nft-tracker): the externalDetection option and the M3 result fields, with M2 behaviour"
```

### Task 3: `process` consumes a handed-in detection

**Files:**
- Modify: `packages/nft-tracker/src/tracker.ts`
- Create: `packages/nft-tracker/test/tracker_external_detection.test.ts`

**Interfaces:**
- Consumes: `prepareDetection`, `detectTarget`, `Detection` (Task 1); the fields and option of Task 2.
- Produces: `process(frame, timestampMs, detection?: Detection | null)` behaving as the Design section's order and table say.

Test scaffolding, in the new file: the `CAMERA`, `frameAt`, `wander`, `SEED` and `locked()` helpers of `tracker_state_machine.test.ts` (copy the small ones; do not import from that file, which stays untouched), `pinballTrackingTarget`, and a `countingBackend(cv)` helper: a `Proxy` over `cv` that counts calls per method name and forwards them, so a test can assert which backend calls a frame made.

- [ ] **Step 1: Write the failing tests**, one `it` each, in this order:

```ts
it("external mode: a frame without a lock and without a detection is LOST no-detection, needsDetection true, and makes no backend call");
    // detectionUse "none", detectionLatencyMs null, numMatches 0, sceneKeypoints [], counts: every method 0

it("consumes a detection of frame 0 on frame 1 and confirms it on that frame: TRACK, latency 33 ms, one backend call (the pose)");
    // detectTarget(frame0) under SEED, tracker.process(frame1, 33, d): state "TRACK", detectionUse "consumed",
    // detectionLatencyMs 33, needsDetection false, sceneKeypoints toEqual d.sceneKeypoints, counts: poseFromHomography 1, others 0

it("refuses a detection the confirming step cannot carry: LOST unconfirmed, with the step's loss and the detection's counts");
    // a detection of wander(0) consumed on the flat 128 frame: reason "unconfirmed", trackLoss "too-few-patches",
    // numMatches/numInliers = d's, tracking.lost === tracking.attempted, needsDetection true

it("refuses a detection across a change of frame size without throwing");            // Review Focus 2: 360×270 frame; "unconfirmed", trackLoss "too-few-patches"

it("returns a failed detection as LOST with its own reason and counts, needsDetection true, no backend call");  // Review Focus 3

it("ignores a detection handed in while the lock holds: TRACK, detectionUse ignored, latency null");
    // lock via a consumed detection at frame 1, then process(frame2, 66, staleDetection): "ignored"

it("a frame that drops its lock and consumes a detection reports the confirming step, not the first");  // Review Focus 5
    // locked on wander, hand the flat frame together with a detection of the flat frame (failed) → LOST with the detection's reason,
    // trackLoss "too-few-patches", detectionUse "consumed"; and with an ok detection of wander(2) on frame wander(2): "TRACK"

it("default mode consumes a handed-in detection too, and does not detect again itself");  // Review Focus 1
    // tracker without externalDetection, no lock, process(frame1, 33, d): "TRACK", detectionUse "consumed", counts: detect 0, poseFromHomography 1

it("detection-only external mode returns a consumed detection as DETECT, unconfirmed, and always needs one");
    // { detectionOnly: true, externalDetection: true }: process(frame1, 33, d): state "DETECT", H toEqual d.H,
    // quality d.numInliers / d.numMatches, needsDetection true; process(frame2, 66): LOST no-detection

it("draws nothing from Math.random on any frame in external mode");
    // withSeededRandom around process calls: draws === 0, whether consuming or not
```

- [ ] **Step 2: Run; verify they fail** (`process` ignores its third argument; states differ).

- [ ] **Step 3: Implement `process`** in `tracker.ts` following the Design section's order: the M2 step block unchanged; then a `consume(detection, frame, timestampMs, …)` private method for the table's three rows; then the internal detection or the `"no-detection"` result. `needsDetection = this.externalDetection && this.lock === null` computed last. Keep `timings` honest: `trackMs` sums the steps run, `detectMs` is 0 on a consuming frame. Update the class header comment: replace the "Known limitation: re-acquisition is synchronous" paragraph with one that says what external detection is, why the confirming step runs on the consuming frame, and that the tracker keeps no request state.

- [ ] **Step 4: Run the new file, then the package suite and typecheck; verify green** — including `tracker_state_machine.test.ts` unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/nft-tracker/src/tracker.ts packages/nft-tracker/test/tracker_external_detection.test.ts
git commit -m "feat(nft-tracker): process consumes a detection computed elsewhere and confirms it on the same frame"
```

### Task 4: Parity with M2, and the latency sequences

**Files:**
- Modify: `packages/nft-tracker/test/tracker_external_detection.test.ts`

**Interfaces:**
- Consumes: everything above. Adds to the test file the loop helper `runExternal(t, path, n, latency, options?)` implementing the Design section's caller: at most one detection in flight; a detection of frame `i` computed under `SEED + i` and handed to `process` on frame `i + latency`; every `process` call under `SEED + i` with `draws` asserted 0; returns `{ results, detections: Map<number, Detection>, states }` with states as `"D"`/`"T"`/`"L"`. And `runM2(t, path, n)`: `runSeededPerFrame`'s loop, copied.

- [ ] **Step 1: Write the parity test** (Design section, "Parity with M2, exactly") over the three M2 paths — `wander` (40 frames), `leaveAndReturn` (106), `velocityStep(6)` (15) — copying those path functions from `tracker_state_machine.test.ts`:

```ts
it.each([["wander", wander, 40], ["leaveAndReturn", leaveAndReturn, 106], ["velocityStep(6)", velocityStep(6), 15]])(
    "at latency 1 reproduces M2 on %s: the same TRACK frames bit for bit, its detections one frame later, LOST where M2 detected",
    (_, path, n) => {
        const m2 = runM2(target, path, n);
        const ext = runExternal(target, path, n, 1);
        expect(ext.states).toBe(m2.states.replace(/D/g, "L"));
        m2.results.forEach((a, i) => {
            const b = ext.results[i];
            if (a.state === "TRACK") {
                const { needsDetection, detectionUse, detectionLatencyMs, ...rest } = b;
                const { needsDetection: _n, detectionUse: _u, detectionLatencyMs: _l, ...expected } = a;
                expect(rest).toEqual(expected);
            } else {
                const d = ext.detections.get(i)!;   // the loop detected frame i because ext was LOST at i
                expect(d.ok).toBe(a.ok);
                expect(d.numMatches).toBe(a.numMatches);
                expect(d.numInliers).toBe(a.numInliers);
                expect(d.sceneKeypoints).toEqual(a.sceneKeypoints);
                if (a.ok && d.ok) expect(Array.from(d.H)).toEqual(Array.from(a.H));
                if (i + 1 < n) {
                    expect(ext.results[i + 1].detectionUse).toBe("consumed");
                    expect(ext.results[i + 1].detectionLatencyMs).toBe(33);
                    expect(ext.results[i + 1].trackLoss).toBe(m2.results[i + 1].trackLoss);
                }
            }
        });
    },
    120_000,
);
```

Note for the implementer: `m2.states` for these paths are pinned in `tracker_state_machine.test.ts` (`"D" + "T".repeat(39)`, the 106-frame string, `"DTTTT" + "D".repeat(10)`); assert the derived strings literally as well, so a change on either side is visible.

- [ ] **Step 2: Run; verify it passes.** If it does not, the implementation of Task 3 departs from the Design section's order; debug with `superpowers:systematic-debugging` — do not adjust the assertion.

- [ ] **Step 3: Write the latency tests**, first with the structural assertions only, run them, then pin the measured state strings exactly and re-run:

```ts
it("locks through 3 frames of latency on a slow wander", () => {
    // runExternal(target, wander, 40, 3): states pinned exactly once measured (expected "LLL" + "T".repeat(37));
    // every consumed frame has detectionLatencyMs 99; the loop computed exactly 1 detection; the tracker draws 0.
});
it("re-acquires through 3 frames of latency on leave-and-return, refusing stale detections on the fast return", () => {
    // runExternal(target, leaveAndReturn, 106, 3): states pinned exactly once measured; every "unconfirmed" LOST frame
    // has detectionUse "consumed" and a trackLoss; the count of detections the loop computed is pinned.
});
it("is deterministic: the same external sequence twice gives the same states, fields and homographies", () => {
    // runExternal twice at latency 2 on leaveAndReturn; results toEqual, frame by frame
});
it("consumes a structuredClone of a detection exactly as the original", () => {          // Review Focus 4
    // two trackers, frame 1 with d and with structuredClone(d): results toEqual
});
```

- [ ] **Step 4: Run the file, then the whole package suite; verify green.**

- [ ] **Step 5: Commit**

```bash
git add packages/nft-tracker/test/tracker_external_detection.test.ts
git commit -m "test(nft-tracker): external detection reproduces M2 at latency 1, and holds through latency on the camera paths"
```

### Task 5: Say what M3's package side is, and what it is not

**Files:**
- Modify: `packages/nft-tracker/README.md` ("The tracker": the result-field list, the state machine paragraph, the options table, the "Re-acquisition is synchronous" limitation)
- Modify: `packages/nft-tracker/AGENTS.md` (portability rules: one sentence)
- Modify: `packages/nft-tracker/src/index.ts` (verify every new export is there; nothing else)

- [ ] **Step 1: README.** Under "The tracker": add `needsDetection`, `detectionUse` and `detectionLatencyMs` to the list of fields every result carries; add `"no-detection"` and `"unconfirmed"` where `reason` is explained; a new bold paragraph **External detection** with the worker sketch from the Design section (`prepareDetection` in the worker from the same `.wnft`, `detectTarget` there, `process(frame, t, detection)` on the main thread), the consuming rule and the table, the "ignored while locked" rule, and the one-line reason the confirming step runs on the consuming frame; `externalDetection` in the options table; replace the "Re-acquisition is synchronous" limitation with: the pipeline still costs 79 ms p50 on the reference device wherever it runs, and in the default mode it still blocks the frame — external detection moves it, and only the application can move it off the thread; a worker demo is the follow-up.

- [ ] **Step 2: AGENTS.md** of the package, under "Portability rules for `src/`", after "Pure core": one sentence — the worker that runs `detectTarget` is the application's; `src/` never posts to one, and `Detection` is the struct that crosses that boundary.

- [ ] **Step 3: Run `npm run format:check` and the package suite; verify green.**

- [ ] **Step 4: Commit**

```bash
git add packages/nft-tracker/README.md packages/nft-tracker/AGENTS.md packages/nft-tracker/src/index.ts
git commit -m "docs(nft-tracker): document external detection and the confirming step"
```

## Finishing

1. **The build-order rule**, from the worktree root:
   ```bash
   rm -rf packages/cv-backend-jsfeatnext/dist && npm run build -w @webarkit/nft-tracker && npm run build
   ```
   Expected: the first build succeeds without the backend's `dist/`; the second restores everything.
2. **Gates**, in this order, each reported with its actual output: `npm install`, `npm run build`, `npm run typecheck`, `npm run format:check`, `npm run check:contract`, `npm test`.
3. **The demos and the bench page still run**: serve the worktree root (`node bench-tools/serve.mjs` or the static server the memory notes name) and open `examples/bench-nft.html?mode=tracking&window=60&clip=pinball-static.mp4` in the built-in browser; Start, wait for the window to fill, Stop; the "Run summary" panel shows a TRACK share and no console error. Open `examples/pinball-static-jsfeatnext-backend.html` and check it draws. The webcam demo cannot be driven headlessly; state that.
4. `superpowers:verification-before-completion`, then `superpowers:requesting-code-review` and the `nft-reviewer` agent on `git diff dev...HEAD`, against ADR-0001 points 2, 3 and 7.
5. Open the PR against `dev`. The body: what changed, the parity argument in three sentences, the numbers from the benchmarks it is built on, the "Not in this plan" list, and the gates' output.

## Found along the way, not fixed here

Record here anything found while executing that this plan does not own (contract gaps, a stale doc, a test that should exist), for the PR body.
