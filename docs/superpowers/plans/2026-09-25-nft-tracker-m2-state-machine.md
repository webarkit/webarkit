# NFT tracker M2 — unified pyramid filter and the LOST → DETECT → TRACK state machine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `compile-target`'s tracking patches from `buildFramePyramid` (commit 1), then make `NftTracker` a LOST → DETECT → TRACK state machine built from the three merged M2 modules, with a detection-only mode that leaves the M1 parity test untouched.

**Architecture:** One new pure function does a whole tracking step: `trackFrame` (`src/tracking/track_frame.ts`). It predicts, culls patches outside the frame, builds the frame pyramid once and only as deep as the patches need (`frameLevelsFor`, `src/tracking/frame_levels.ts`), aligns, fits and judges. It reads per-patch failure reasons and reports why a frame was lost. `NftTracker` (`src/tracker.ts`) keeps only the lock (the last two homographies) and decides between tracking and the unchanged M1 detection path. Every threshold is an `NftTrackerOptions` field with a documented, provisional default. Timings come from an injected clock, never one the tracker reads itself.

**Tech Stack:** TypeScript 5.9, Vitest 4, npm workspaces; Rust (cargo) only for `crates/wnft-format/tests/real_target.rs` in commit 1.

**Spec:**
- The request itself (the conversation that produced this plan), quoted where it binds.
- [ADR-0001](../../adr/0001-nft-tracker-ts-reference-above-cvbackend.md): points 2 (injected backend), 3 (the frame pyramid is the first candidate to move into the backend), 5 (the 8 ms p95 of tracker-side compute in the tracking state) and 7 (pure core, explicit results, determinism).
- [Format spec](../../specs/nft-target-format.md) §5.7 (patches; "a file without `patches` … the tracker then runs in detection-only mode") and §11 Q11.
- [`src/tracking/types.ts`](../../../packages/nft-tracker/src/tracking/types.ts): the contract the modules implement. It is **not** changed by this plan.
- Issue [#48](https://github.com/webarkit/webarkit/issues/48) (M2 checklist, definition of done) and [#65](https://github.com/webarkit/webarkit/issues/65) (the filter mismatch, measured).
- [`docs/benchmarks/README.md`](../../benchmarks/README.md): "Webcam: `acquire` without a video decoder" (~109 ms stateless, ~10 ms left for the tracker) and "M2: frame pyramid and patch alignment, off-device".

---

## Global Constraints

- **Do not change** `packages/cv-backend-spec`, the `.wnft` format, or `packages/nft-tracker/src/tracking/types.ts`. **If a signature does not hold, stop and tell the user**. Do not work around it.
- **Never loosen a tolerance or a threshold to make a test pass.** An unexpected failure goes through `superpowers:systematic-debugging`: find the cause before changing anything.
- **Every threshold is an option** with a documented default and a comment saying it is **provisional until the M2 tuning pass** (#48, "Evaluation"; the user's step 5).
- **Tests state the numbers they pin**, as the #62–#64 suites do: the measured value in the test name or beside the assertion, not a loose bound. Rule used throughout: counts and state sequences are pinned **exactly** (the whole pipeline is deterministic); an error or distance measured as `m` is asserted `< ⌈1.2·m⌉₂` (1.2 × m, rounded up at two significant figures), and `m` is written next to it.
- The M1 parity test, `packages/nft-tracker/test/parity.test.ts`, **passes unchanged**: `git diff dev -- packages/nft-tracker/test/parity.test.ts` stays empty.
- Reuse #63's frame generator, `test/fixtures/warped_frames.ts` (`view`, `renderWarp`). **Do not write a second one.** Motion paths are functions that return `view()` arguments per frame.
- `src/` imports no backend (ADR-0001 point 2). No DOM, timers or clock reads in `src/` (point 7). Timings use a clock the caller passes in.
- Explicit `{ ok, … }` results. Exceptions only for contract violations (an invalid frame, options out of domain, a target the backend cannot read).
- New `.ts`/`.mjs` files carry the LGPL header of `packages/nft-tracker/src/tracker.ts` lines 1–38, with the file's own name on line 2.
- English in every artifact. Conventional Commits (`feat(nft-tracker): …`, `test(nft-tracker): …`, `docs(nft-tracker): …`), imperative. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Branch `feat/nft-state-machine` (already checked out, clean, equal to `origin/dev` at `c1b2912`). The PR targets **`dev`**.
- **`packages/nft-tracker/dist` is stale on this machine** (its `frame_pyramid.js` is the stub). `npm run build` before anything that imports `dist/` (`bin/*.mjs`, `compile_target.test.ts`).
- Use the Bash tool (POSIX) for git/npm/cargo. **Never round-trip a source file through PowerShell** (`§` and `—` get double-encoded). A PostToolUse hook runs prettier/rustfmt on edited files, so an edited file may differ on disk from what was written.
- Node: `node --version` prints v24.21.0 here, which satisfies `>=18` (`.nvmrc` pins v24.18.0, not installed). Rust: cargo 1.93.0.
- **Gates** (all of them, since commit 1 regenerates `pinball.wnft`): `npm run build`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run check:contract`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`.

## What the measurements before this plan found

These are scratch measurements (`<scratchpad>/spike/`, not committed). The tests below re-measure what they rely on.

| Question | Answer | Source |
|---|---|---|
| What does the filter switch change on pinball? | One patch of 64. The level-1 window (242, 288) scores 206.19 under the stand-in box filter and 189.39 under `buildFramePyramid`. The level-0 window (306, 365), 0.87 px away, scores 195.69 under both and takes its place at index 37. The other 63 are identical in position, score, pixels and order. Per level: 63/1/0 → **64/0/0**. Selecting from 6 or 8 levels picks the same 64. | spike S1 |
| How much do coarse-level scores move? | Median candidate score falls 7% at level 1 and 24% at level 2. The new filter blurs more; mean brightness is unchanged. | spike S1 |
| How far off is a detected H? | ~1.0 px RMS at the 64 patch centres (median; p90 1.16, worst 1.70). Worst single patch 5.5 px. 108 of 108 camera-path frames lock. Most of it is a level-dependent systematic offset, not scatter (0.19–0.48 px RMS once the mean is removed). | spike S2 |
| Basin of pinball's 16×16 level-0 patches on the camera path (σ ≈ 0.5) | 98% converge from 1 px, 90% from 2 px, 74% from 3 px, 54% from 4 px. Every alignment ends on frame level 0. | reader workflow's critic |
| What prediction error does a whole step (align + robust fit) survive at scale 0.45? | Translation: **3.5 px** (100% of trials within 0.5 px RMS at the patch centres). 4 px: 85.9%. 4.5 px: 10.9%. 6 px: none (31% `too-few-inliers`, the rest wrong). Rotation 3°: 100%, 4°: 0%. Scale 5%: 100%, 6%: 25%. | spike S3 |
| Does a 1-level frame pyramid cost basin? | For these patches, no: 1 level and 4 levels give **bit-identical results, 0 of 35,072 alignments differ**, at scales 0.45, 0.7 and 1.0. | spike S3 |
| Can gain/residual gate wrong alignments? | At σ ≈ 0.45, **no**. Right alignments have a median gain of 0.51 (patches sharper than the frame). The best residual/gain threshold keeps 66% of right alignments and still passes 15% of wrong ones. At σ = 1 a gate at 35.2 keeps 100% of right alignments and rejects 94% of wrong ones. | spike S3 |
| Should unconverged alignments feed the fit? | No. With them, translation survival is unchanged (3.5 px) but rotation 3° drops to 0% and scale 5% to 25%. | spike S3 |
| Cost in Node here | `alignPatch` at scale 0.45: median 63.5 µs, so 64 patches take ≈ 4–4.7 ms. `buildFramePyramid` 270×360: 1 level 0.001 ms, 2 levels 0.77 ms, 4 levels 1.85 ms. | spike S3 |

Two corrections to the request's premises, to be repeated in the PR body:
- **The frame pyramid's device estimate is 5.6–7.5 ms** (four levels, 270×360). The 5.9–7.1 ms figure is from commit d11eb18 and was replaced by 88585a3 before #63 merged.
- **"step 4" and "step 5" appear in no repository document.** This plan reads them as #48's Evaluation items: on-device measurement against ADR-0001 point 5, then the tuning pass.

## Decisions this plan makes (for review)

1. **Tracking is the default. Detection-only is entered two ways.** One is `detectionOnly: true`. The other is a target that cannot be tracked: no `patches` (§5.7 says exactly this), `patchSize < 3`, or fewer than `minTrackedPatches` patches. Every existing caller (the parity and tracker tests, the webcam demo, `bench-nft.html`) builds its target with `buildTargetFromImage`, which writes no patches, so none of them changes behaviour. The parity test passes unchanged, and it exercises the same DETECT path the state machine uses.
2. **A frame that loses the lock is re-detected on the same frame.** It reports DETECT, or LOST if detection fails too, with `trackLoss` saying why the lock went. It does not report LOST first and detect on the next frame. Cost: that frame pays a tracking step plus detection.
3. **Velocity follows `predictHomography`'s own documented contract.** The first frame after a detection predicts with `previous = null`. The second uses the detected H as `previous`, so the first velocity carries the detection's error (~1 px RMS, measured). Flagged for the tuning pass, alongside refining the detected H with one tracking step on the detection frame.
4. **Per-patch outcomes are read, not guessed.**
   - `"singular"` counts the patch as **lost** this frame: no correspondence.
   - `converged: false` is **unconverged**: no correspondence either (measured to hurt the fit).
   - `"outside-frame"` and the other failures count as **failed**.
   - A patch whose predicted window is not inside the frame is **culled** before `alignPatch`, so it counts in no denominator.
5. **LOST criteria, with the 45% figure in view.**
   - Fewer than `minTrackedPatches` = **8** correspondences.
   - `robustHomography` fails.
   - The fit gives weight 0 to more than `maxOutlierShare` = **0.45** of the correspondences. That is #64's measured breakdown, beyond which failures begin.
   - Why 8: it is the smallest count at which every fit the 45% rule accepts still has one more inlier (5) than a homography needs (4).
6. **`quality`** is exactly `tracker.ts`'s existing definition: Σ weights ÷ patches passed to `alignPatch`.
7. **The residual gate exists and is off by default** (`maxPatchResidual = Infinity`). The measurement above explains why. It is the tuning pass's hook once patch levels change.
8. **The frame pyramid is built once per tracking frame, only as deep as the patches start** (`frameLevelsFor`, capped by `maxFrameLevels` = 4). On the camera path that is **1 level, i.e. no computation at all**. `timings.pyramidMs` reports it separately.
9. **§11 is not revised in commit 1.** No sentence of it becomes wrong because of this commit. The one false sentence ("keeps them comparable by building both pyramids with one function") becomes true. The stale clause ("open until the first measurement …") was already stale and is #65's to revise together with the Q11 decision. The commit message and the PR body say so.
10. **The plan file itself** (this document) is not committed unless the user asks; the M1 and codec plans were.

## Review Focus

Inputs no task's happy path exercises. Each line has its test in the task named.

1. **The frame changes size while locked** (a phone rotated from 270×360 to 360×270). Expected: no TRACK on a prediction made for the other geometry. The cull or the fit fails, and the frame is re-detected. → Task 5, "a frame of another size while locked".
2. **A flat or covered frame while locked** (a hand over the lens). Expected: every attempted patch ends `singular` (lost), then `too-few-patches`, then detection, then LOST. No exception. → Task 3 (`trackFrame` on a flat frame) and Task 5.
3. **A target whose patches cannot be tracked**: fewer than `minTrackedPatches`, or `patchSize` 1 or 2 (legal in §5.7). Expected: detection-only, visible as `tracker.detectionOnly === true`. No per-frame failures. → Task 5.
4. **An invalid frame while locked** (`data.length ≠ width · height`). Expected: a `RangeError` naming the frame, the contract-violation path M1 leaves to the backend. → Task 5.
5. **Options out of domain** (`minTrackedPatches: 3`, `maxOutlierShare: 1`, `alignEpsilon: 0`, …). Expected: a `RangeError` at construction naming the option, not a silent fall back to detection on every frame. → Task 4.

---

## File structure

| Path | Responsibility |
|---|---|
| `packages/nft-tracker/bin/compile-target.mjs` | **Modify (T1).** Patches cut from `buildFramePyramid`; provenance string; docs. |
| `packages/nft-tracker/bin/target-pyramid.mjs` | **Delete (T1).** The stand-in. |
| `packages/nft-tracker/test/target_pyramid.test.ts` | **Delete (T1).** The stand-in's suite. |
| `packages/nft-tracker/test/compile_target.test.ts` | **Modify (T1).** Checks pixels against `buildFramePyramid`, and the new provenance. |
| `examples/targets/pinball.wnft` | **Regenerate (T1).** |
| `crates/wnft-format/tests/real_target.rs` | **Modify (T1).** `[64, 0, 0]`, the new provenance, comments. |
| `packages/nft-tracker/src/tracking/frame_pyramid.ts`, `align_patch.ts` | **Modify (T1, docs).** The "compile-target does not do this yet" notes. |
| `packages/nft-tracker/README.md` | **Modify (T1, T6).** |
| `packages/nft-tracker/src/tracking/align_patch.ts` | **Modify (T2).** Export `startLevel` (one keyword plus a doc line), so the pyramid depth follows alignment's own rule. |
| `packages/nft-tracker/src/tracking/frame_levels.ts` | **Create (T2).** `frameLevelsFor`: how many frame levels this frame's patches start on. |
| `packages/nft-tracker/test/fixtures/tracking_target.ts` | **Create (T2).** The pinball target as `compile-target` builds it at its defaults, in memory. Patches only for the pure suites; patches plus keypoints and descriptors for the tracker suite. |
| `packages/nft-tracker/test/tracking/frame_levels.test.ts` | **Create (T2).** |
| `packages/nft-tracker/src/tracking/track_frame.ts` | **Create (T3).** `trackTarget`, `trackFrame`, `PatchOutcome`, `TrackStats`, `TrackLoss`, `TrackFrameOptions`, `TrackStepTimings`. |
| `packages/nft-tracker/test/tracking/track_frame.test.ts` | **Create (T3).** |
| `packages/nft-tracker/src/tracker.ts` | **Modify (T4).** Options, validation, lock, state machine, result fields, timings. |
| `packages/nft-tracker/src/index.ts` | **Modify (T4).** Export the new defaults and types. |
| `packages/nft-tracker/test/tracker_options.test.ts` | **Create (T4).** Option validation and mode selection. |
| `packages/nft-tracker/test/tracker_state_machine.test.ts` | **Create (T5).** Sequences: lock, follow, lose, re-acquire, determinism, detection-only, velocity steps, review-focus cases. |
| `packages/nft-tracker/src/target/build_from_image.ts` | **Modify (T6, one doc sentence).** Stale "tracking patches belong to milestone M4". |
| `README.md` | **Modify (T6).** The `nft-tracker` row. |

---

### Task 1: `compile-target` cuts its patches from `buildFramePyramid` (COMMIT 1)

**Files:**
- Modify: `packages/nft-tracker/bin/compile-target.mjs:40-56, 93-98, 132-142, 167-219, 545-582`
- Delete: `packages/nft-tracker/bin/target-pyramid.mjs`, `packages/nft-tracker/test/target_pyramid.test.ts`
- Modify: `packages/nft-tracker/test/compile_target.test.ts:300-377`
- Regenerate: `examples/targets/pinball.wnft`
- Modify: `crates/wnft-format/tests/real_target.rs:165-168, 207, 215-237`
- Modify (docs): `packages/nft-tracker/src/tracking/frame_pyramid.ts:121-144`, `packages/nft-tracker/src/tracking/align_patch.ts:153-166`, `packages/nft-tracker/README.md:214-222` and the `buildFramePyramid` paragraph (`which compile-target does not do yet (above)`)

**Interfaces:**
- Consumes: `buildFramePyramid(frame, { levels, scaleStep })` from `dist/index.js` (already exported).
- Produces: `info.compiler.patchPyramid` = `"buildFramePyramid (@webarkit/nft-tracker): a box of width r over the bilinear reconstruction, rounded to nearest"`. Rust asserts `starts_with("buildFramePyramid")`; TS asserts `/^buildFramePyramid/`.

- [ ] **Step 1: Build, so `bin/` and the CLI test see the real `buildFramePyramid`**

Run: `npm run build`
Expected: exit 0. `wc -c packages/nft-tracker/dist/tracking/frame_pyramid.js` is now well over 2100 bytes (it was the stub).

- [ ] **Step 2: Write the failing TS test.** In `compile_target.test.ts`, replace the stand-in loader (lines 301–311, `PYRAMID_MODULE` and `BuildTargetPyramid`) and the pixel check (lines 356–376) as follows. Also add `buildFramePyramid` to the existing `import { levelScale } from "../src/index.js";` line.

```ts
        it("writes the documented defaults, every patch exactly its level's pixels", () => {
            const out = join(work, "patches-default.wnft");
            const stdout = compile([IMAGE, "-o", out]);
            expect(stdout).toContain("64 patches");

            const { target, warnings } = decodeFile(out);
            expect(warnings).toEqual([]);
            const patches = target.patches!;
            expect(patches.patchSize).toBe(16);
            expect(patches.count).toBe(64);
            expect(Math.max(...patches.level)).toBeLessThan(3);
            expect(compilerInfo(target.info)).toMatchObject({
                maxPatches: 64,
                patchSize: 16,
                patchLevels: 3,
                patchMinScore: 25,
                // 0.75 * sqrt(512 * 640 / 64), rounded.
                patchSpacing: 54,
                // The function the tracker builds the live frame's pyramid
                // with (format spec §11, Q11), named so a reader can tell.
                patchPyramid: expect.stringMatching(/^buildFramePyramid/),
                // §5.7 leaves the score's units open; the file says which.
                patchScore: expect.stringContaining("level-0 px"),
            });

            // The pixels a reader decodes are the pixels of the level the
            // compiler cut them from, at (left, top), in the pyramid
            // buildFramePyramid builds at the file's own step and sizes. The
            // fixture PGM is the same 512 x 640 image compile-target decodes
            // from pinball.jpg.
            const built = buildFramePyramid(readPgm(TARGET_FIXTURE), {
                levels: 3,
                scaleStep: target.pyramid.scaleStep,
            });
            if (!built.ok) throw new Error(`buildFramePyramid: ${built.reason}`);
            const pyramid = built.pyramid;
            expect(pyramid.levels.map((l) => [l.width, l.height])).toEqual(
                target.pyramid.levelSizes.slice(0, 3),
            );
            const P = patches.patchSize;
            for (let q = 0; q < patches.count; q++) {
                const level = pyramid.levels[patches.level[q]];
                const expected = new Uint8Array(P * P);
                for (let i = 0; i < P; i++) {
                    const start = (patches.top[q] + i) * level.width + patches.left[q];
                    expected.set(level.data.subarray(start, start + P), i * P);
                }
                expect(patches.pixels.subarray(q * P * P, (q + 1) * P * P)).toEqual(expected);
            }
        });
```

Keep `interface CompilerInfo`, `compilerInfo` and `centresOf` as they are. Remove the now unused `ImagePyramid` type import if nothing else uses it.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/nft-tracker/test/compile_target.test.ts -t "documented defaults"` (from the repo root; or `-w @webarkit/nft-tracker`)
Expected: FAIL. `patchPyramid` is `"stand-in: bin/target-pyramid.mjs, area-weighted box"`, which does not match `/^buildFramePyramid/`.

- [ ] **Step 4: Write the failing Rust expectation.** In `crates/wnft-format/tests/real_target.rs`:

Lines 165–167 become:
```rust
    // §5.7's tracking patches: compile-target's defaults, 64 patches of
    // 16 x 16 cut from the finest three levels, as it chose them for this
    // image — every one from level 0 (see the `patchPyramid` note below for
    // the one that moved there).
```
Line 207 becomes:
```rust
    assert_eq!(per_level, [64, 0, 0]);
```
Lines 215–237 become:
```rust
    // Which pyramid the patches were cut from is provenance, not format: the
    // specification's open question Q11 asks whether the file should record
    // it or the specification fix one. compile-target cuts them from
    // `buildFramePyramid`, the function the tracker builds the live frame's
    // pyramid with. Before that it used a stand-in box filter, under which
    // this file's patch 37 was the level-1 window (242, 288), scoring 206.19;
    // `buildFramePyramid` blurs more, that window scores 189.39, and the
    // level-0 window (306, 365), 0.87 px away and scoring 195.69 under both,
    // took its place. This assertion is the one that says which filter the
    // committed file used.
    let compiler = target
        .info
        .as_ref()
        .and_then(|info| info.get("compiler"))
        .and_then(|c| c.as_object())
        .expect("compile-target records info.compiler");
    assert_eq!(
        compiler.get("maxPatches").and_then(|v| v.as_u64()),
        Some(64)
    );
    assert!(
        compiler
            .get("patchPyramid")
            .and_then(|v| v.as_str())
            .is_some_and(|s| s.starts_with("buildFramePyramid")),
        "patchPyramid was {:?}",
        compiler.get("patchPyramid")
    );
```

- [ ] **Step 5: Run it and watch it fail**

Run: `cargo test -p wnft-format --test real_target`
Expected: FAIL at `assert_eq!(per_level, [64, 0, 0])` with `left: [63, 1, 0]`.

- [ ] **Step 6: Switch the compiler.** In `compile-target.mjs`:

(a) Imports (lines 86–97). Add `buildFramePyramid` to the `../dist/index.js` import and delete `import { buildTargetPyramid } from "./target-pyramid.mjs";`.

(b) Header paragraph (lines 52–56) becomes:
```js
 * **Tracking patches** are cut from the target's pyramid as
 * `buildFramePyramid` builds it — the function the tracker builds the live
 * frame's pyramid with, so a stored patch and the frame level it is aligned
 * on were filtered alike (format spec §11, Q11). The five patch options and
 * their defaults are documented where the defaults are defined, below.
```

(c) `DEFAULT_PATCH_LEVELS` doc (lines 132–141) becomes:
```js
/**
 * How many of the target's pyramid levels patches may come from, finest
 * first. Scores are in level-0 units (`select_patches.ts`), so levels compete
 * on how precisely they localise, and a coarser level rarely wins: on the
 * pinball target all 64 patches come from level 0, and allowing six or all
 * eight levels instead of three selects exactly the same 64. (While a box
 * filter built the levels, one level-1 window won by a small margin; the
 * pyramid filter blurs more, and it lost to a level-0 window 0.87 px away.)
 * Three levels span a factor `2^(2/3)` ≈ 1.6 at the default step, and keep a
 * patch's footprint local (under 26 level-0 px for P=16); the limit is there
 * for the images where coarse texture would win.
 */
```

(d) Lines 167–219. Replace `PATCH_PYRAMID` with the constant below. Move the misplaced `patchScore` JSDoc (currently lines 170–177, stranded above `MAX_PATCH_WINDOWS`) down onto `PATCH_SCORE`, where it belongs. `MAX_PATCH_WINDOWS`, `patchWindows` and `PATCH_SCORE` themselves are unchanged.
```js
/**
 * What `info.compiler.patchPyramid` records: the filter that built the level
 * images patches are cut from. §5.7 does not say (open question Q11), so the
 * file carries it as provenance; `crates/wnft-format/tests/real_target.rs`
 * asserts it on the committed demo target.
 */
const PATCH_PYRAMID =
    "buildFramePyramid (@webarkit/nft-tracker): a box of width r over the bilinear " +
    "reconstruction, rounded to nearest";
```

(e) The pyramid build inside `withSeededRandom` (lines 557–574). Replace the comment and the `buildTargetPyramid` call with:
```js
        // A PREFIX of the target's levels, the first --patch-levels, each at
        // the size the file records for it. `SelectPatches` in
        // src/tracking/types.ts asks for "exactly the target's
        // levelSizes.length levels", so this departs from its wording, on
        // purpose. The reason it gives for that rule is that a patch must not
        // name a level the file lacks and must be bounds-checked against the
        // file's own sizes (§5.7, INCONSISTENT_DATA); a prefix at the file's
        // sizes guarantees both. Aligning the wording ("the first k ≤ L
        // levels, each of exactly the file's size") is a change to types.ts,
        // the contract the tracking modules share, and not one to make here.
        const { scaleStep, levelSizes } = db.pyramid;
        const levels = Math.min(options.patchLevels, levelSizes.length);
        const built = buildFramePyramid(image, { levels, scaleStep });
        if (!built.ok) {
            throw new Error(`buildFramePyramid refused the target image: ${built.reason}`);
        }
        // buildFramePyramid computes its sizes by the rule the file records
        // (§5.4), and a patch is in bounds only against the file's sizes, so
        // the two are compared rather than assumed equal.
        built.pyramid.levels.forEach((level, l) => {
            const [w, h] = levelSizes[l];
            if (level.width !== w || level.height !== h) {
                throw new Error(
                    `pyramid level ${l} is ${level.width}x${level.height}, ` +
                        `but the target records ${w}x${h}`,
                );
            }
        });
        const selected = selectPatches(built.pyramid, {
```
(the `selectPatches` options that follow are unchanged).

- [ ] **Step 7: Delete the stand-in and its suite**

```bash
git rm packages/nft-tracker/bin/target-pyramid.mjs packages/nft-tracker/test/target_pyramid.test.ts
```

- [ ] **Step 8: Keep the old file for the diff, rebuild, recompile the demo target with its documented command**

```bash
cp examples/targets/pinball.wnft "$SCRATCH/pinball-before.wnft"   # $SCRATCH = the session scratchpad
npm run build
node packages/nft-tracker/bin/compile-target.mjs examples/images/pinball.jpg \
    -o examples/targets/pinball.wnft --physical-size 210x262.5
```
Expected stdout: `examples/targets/pinball.wnft: 512x640, 2062 keypoints over 8 levels, 64 patches, <N> bytes (0 random draws)`.

- [ ] **Step 9: Say how much changed.** Write `$SCRATCH/diff-patches.mjs`. It decodes both files with `packages/nft-tracker/dist/index.js`'s `decode` and prints:
  - per patch: `(q, level, left, top, score)` side by side for every index where they differ;
  - how many patches are identical in `(level, left, top)`, in `score`, in pixels;
  - per-level counts before and after;
  - byte sizes;
  - `info.compiler.patchPyramid` before and after;
  - whether `keypoints`/`descriptorSets` bytes are identical.

Run: `node "$SCRATCH/diff-patches.mjs"`
Expected, from spike S1:
  - index 37 changes from `(1, 242, 288, 206.19)` to `(0, 306, 365, 195.69)`;
  - the other 63 are identical in position, score and pixels;
  - per level `63/1/0 → 64/0/0`;
  - keypoints and descriptors are identical.

A different result is a finding: stop and debug it (`superpowers:systematic-debugging`) before continuing. Record the printed numbers for the commit message.

- [ ] **Step 10: Run both expectations; now they pass**

Run: `npx vitest run packages/nft-tracker/test/compile_target.test.ts && cargo test -p wnft-format --test real_target`
Expected: PASS, both.

- [ ] **Step 11: Correct the prose that the switch made false**
  - `frame_pyramid.ts`, the "Open question Q11" note, first bullet (lines 128–132). Replace it with:
    ```
     * - **`compile-target` does this**, at the target's own `scaleStep`, and
     *   names this function in `info.compiler.patchPyramid`; files compiled
     *   before it did name a stand-in box filter there instead. On
     *   `examples/targets/pinball.wnft` the point is moot for now: all 64 of
     *   its patches come from level 0, which no filter touches.
    ```
  - `align_patch.ts:153-156`: `— not yet true of \`compile-target\`'s coarser levels, which come from a stand-in —` becomes `— as \`compile-target\` does —`.
  - `packages/nft-tracker/README.md` lines 214–222. Replace the stand-in paragraph with: "The level images patches are cut from are built by `buildFramePyramid`, the function the tracker builds the live frame's pyramid with, so a stored patch and the frame level it is aligned on were filtered alike (format spec §11, Q11). `info.compiler.patchPyramid` names it. Files compiled before this used a stand-in box filter and say so there. On pinball the switch replaced the one level-1 patch with a level-0 window 0.87 px away, so all 64 patches are now level 0."
  - Same README, `buildFramePyramid` paragraph: "…which `compile-target` does not do yet (above)." becomes "…which `compile-target` does (above)."
  - Grep for anything else now false: `grep -rn "stand-in\|target-pyramid\|63 of\|one from level 1" --include=*.md --include=*.ts --include=*.mjs --include=*.rs . | grep -v node_modules | grep -v /dist/`. Expected remaining hits: none in live text (`cv-backend-jsfeatnext/test/backend.test.ts:129` uses "stand-in" in an unrelated sense). Also check `examples/README.md`'s "128 KB now" against the new byte size.
  - `docs/specs/nft-target-format.md`: **no change**, for the reason in Decisions §9.

- [ ] **Step 12: Run every gate**

```bash
npm run build && npm run typecheck && npm test && npm run format:check && npm run check:contract
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```
Expected: all exit 0.

- [ ] **Step 13: Commit**

```bash
git add -A packages/nft-tracker/bin packages/nft-tracker/test/compile_target.test.ts \
    packages/nft-tracker/src/tracking/frame_pyramid.ts packages/nft-tracker/src/tracking/align_patch.ts \
    packages/nft-tracker/README.md examples/targets/pinball.wnft crates/wnft-format/tests/real_target.rs
git status --short   # target_pyramid.test.ts and target-pyramid.mjs show as deleted, nothing unexpected
git commit -F - <<'EOF'
feat(nft-tracker): cut compile-target's patches from buildFramePyramid

compile-target built the pyramid it cuts tracking patches from with
bin/target-pyramid.mjs, an area-weighted box filter written as a stand-in
while buildFramePyramid did not exist (#62). It exists now (#63), and it is
the function the tracker builds the live frame's pyramid with, so the
compiler switches to it; the stand-in and its suite go, and the compiler
now checks the pyramid's level sizes against the ones the file records.

What moved on examples/targets/pinball.wnft, recompiled with the command in
examples/README.md: one patch of 64. <numbers from Step 9: index 37, the
level-1 window (242, 288) at 206.19 under the box filter and 189.39 under
buildFramePyramid, replaced by the level-0 window (306, 365), 0.87 px away,
195.69 under both; the other 63 identical in position, score, pixels and
order; keypoints and descriptors byte-identical; <old> -> <new> bytes.>
Coarse levels blur more under the new filter: the median candidate score
falls 7% at level 1 and 24% at level 2. All 64 patches are now level 0, so
real_target.rs's per-level count becomes [64, 0, 0], and it asserts the
new patchPyramid provenance.

Why now, as #65 measured it: position hardly depends on the filter (median
alignment error 0.016-0.042 px across patch levels 0-5), but gain
(0.86-1.10) and residual do, and those are what the tracking state reads.
This is the cheapest point to make the pair consistent, before any
threshold is tuned against it.

Format spec §11 needs no revision for this commit. Q11's sentence that the
tracker "keeps them comparable by building both pyramids with one function"
was untrue of every compiled file until now and becomes true. Its stale
clause (the cross-level measurement "still to come") predates this change
and is #65's to revise, with the decision on Q11 itself.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Replace the `<…>` span with Step 9's printed numbers before committing. It is the one part of this message only the measurement can supply.

---

### Task 2: `frameLevelsFor`: build only the frame levels the patches start on

**Files:**
- Modify: `packages/nft-tracker/src/tracking/align_patch.ts:515-551` (export `startLevel`)
- Create: `packages/nft-tracker/src/tracking/frame_levels.ts`
- Create: `packages/nft-tracker/test/fixtures/tracking_target.ts`
- Test: `packages/nft-tracker/test/tracking/frame_levels.test.ts`

**Interfaces:**
- Consumes: `startLevel(usable: number[], scales: Float64Array, scaleAtCentre: number): number` (align_patch.ts, now exported), `pyramidScales(scaleStep, count)` (frame_pyramid.ts).
- Produces:
  - `frameLevelsFor(prediction: Mat3, centres: Float64Array, patchScales: Float64Array, candidates: readonly number[], frameScaleStep: number, frame: { readonly width: number; readonly height: number }, maxLevels: number): number`, in `[1, maxLevels]`.
  - The test fixture `pinballPatches(): PatchTable` (compile-target's defaults on `TARGET_FIXTURE`, i.e. the same 64 patches `pinball.wnft` carries after Task 1).
  - The test fixture `pinballTrackingTarget(cv: CvBackend): TargetDb` (`buildTargetFromImage(cv, image, { levels: 8 })` plus those patches).
  - The test fixture `PINBALL_STEP` (`Math.cbrt(2)`).

- [ ] **Step 1: The test fixture** `test/fixtures/tracking_target.ts` (LGPL header, name on line 2):

```ts
/**
 * The pinball target as `compile-target` builds it at its defaults, in memory:
 * keypoints and descriptors from `buildTargetFromImage`, tracking patches from
 * `selectPatches` over `buildFramePyramid` — the same 64 patches
 * `examples/targets/pinball.wnft` carries (the compile-target suite checks
 * the file's pixels against this very pyramid). Built here rather than
 * decoded from that file so recompiling it never moves the tracking suites:
 * the committed file is `crates/wnft-format/tests/real_target.rs`'s to pin.
 *
 * The four patch options are compile-target's defaults, repeated: patch size
 * 16, 64 patches, minimum score 25, spacing round(0.75 · √(512 · 640 / 64)) =
 * 54, from the first three levels (bin/compile-target.mjs).
 */

import type { CvBackend } from "@webarkit/cv-backend-spec";
import { buildFramePyramid, buildTargetFromImage, selectPatches } from "../../src/index.js";
import type { PatchTable, TargetDb } from "../../src/index.js";
import { readPgm, TARGET_FIXTURE } from "./pgm.js";

export const PINBALL_STEP = Math.cbrt(2);

let cached: PatchTable | null = null;

export function pinballPatches(): PatchTable {
    if (cached !== null) return cached;
    const built = buildFramePyramid(readPgm(TARGET_FIXTURE), { levels: 3, scaleStep: PINBALL_STEP });
    if (!built.ok) throw new Error(`buildFramePyramid: ${built.reason}`);
    const selected = selectPatches(built.pyramid, {
        patchSize: 16,
        maxPatches: 64,
        minScore: 25,
        minSpacing: 54,
    });
    if (!selected.ok) throw new Error(`selectPatches: ${selected.reason}`);
    cached = selected.patches;
    return cached;
}

export function pinballTrackingTarget(cv: CvBackend): TargetDb {
    const db = buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 });
    return { ...db, patches: pinballPatches() };
}
```

- [ ] **Step 2: Write the failing tests** `test/tracking/frame_levels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { alignPatch, buildFramePyramid, levelScale } from "../../src/index.js";
import type { FramePyramid } from "../../src/index.js";
import { frameLevelsFor } from "../../src/tracking/frame_levels.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { project, renderWarp, view } from "../fixtures/warped_frames.js";

const image = readPgm(TARGET_FIXTURE);
const patches = pinballPatches();
const P = patches.patchSize;
const scales = Float64Array.from(patches.level, (l) => levelScale(PINBALL_STEP, l));
const centres = new Float64Array(2 * patches.count);
for (let q = 0; q < patches.count; q++) {
    centres[2 * q] = (patches.left[q] + (P - 1) / 2) / scales[q];
    centres[2 * q + 1] = (patches.top[q] + (P - 1) / 2) / scales[q];
}
const all = Array.from({ length: patches.count }, (_, q) => q);
const CAMERA = { width: 270, height: 360 };

function pyramid(frame: GrayImage, levels: number): FramePyramid {
    const r = buildFramePyramid(frame, { levels, scaleStep: PINBALL_STEP });
    if (!r.ok) throw new Error(r.reason);
    return r.pyramid;
}

describe("frameLevelsFor", () => {
    it("builds only level 0 for pinball's level-0 patches on the camera path (scales 0.45, 0.7, 1.0)", () => {
        for (const scale of [0.45, 0.7, 1]) {
            const H = view({ target: image, frame: CAMERA, scale });
            expect(frameLevelsFor(H, centres, scales, all, PINBALL_STEP, CAMERA, 4)).toBe(1);
        }
    });

    it("goes as deep as the most magnified patch starts: σ = 1.5 → 3 levels, σ = 2 → 4", () => {
        // A level-0 patch seen at σ frame px per patch px starts where σ·s_l
        // is nearest 1: s_2 = 0.63 for 1.5 (cost 1.058), s_3 = 0.5 for 2.
        const frame = { width: 1280, height: 1600 };
        expect(frameLevelsFor(view({ target: image, frame, scale: 1.5 }), centres, scales, all, PINBALL_STEP, frame, 7)).toBe(3);
        expect(frameLevelsFor(view({ target: image, frame, scale: 2 }), centres, scales, all, PINBALL_STEP, frame, 7)).toBe(4);
    });

    it("never goes deeper than maxLevels, nor than the frame holds levels of at least 2 × 2", () => {
        const frame = { width: 1280, height: 1600 };
        const H = view({ target: image, frame, scale: 2 });
        expect(frameLevelsFor(H, centres, scales, all, PINBALL_STEP, frame, 2)).toBe(2);
        // 3 × 3: level 1 is 2 × 2, level 2 would be 1 × 1.
        expect(frameLevelsFor(H, centres, scales, all, PINBALL_STEP, { width: 3, height: 3 }, 7)).toBe(2);
    });

    it("is 1 with no candidate patch, or a prediction that puts every patch behind the camera", () => {
        const H = view({ target: image, frame: CAMERA, scale: 2 });
        expect(frameLevelsFor(H, centres, scales, [], PINBALL_STEP, CAMERA, 4)).toBe(1);
        const behind = Float64Array.from(H, (v) => -v);
        expect(frameLevelsFor(behind, centres, scales, all, PINBALL_STEP, CAMERA, 4)).toBe(1);
    });

    it("changes no alignment: on the levels it asks for, every patch aligns bit-identically to a 7-level pyramid", () => {
        const options = { maxIterations: 30, epsilon: 0.01, photometric: true };
        for (const [scale, frame] of [
            [0.45, CAMERA],
            [2, { width: 640, height: 480 }],
        ] as const) {
            const H = view({ target: image, frame, scale });
            const rendered = renderWarp(image, H, { ...frame, blurPasses: 1, noiseSigma: 2, seed: 5 });
            const levels = frameLevelsFor(H, centres, scales, all, PINBALL_STEP, frame, 7);
            const few = pyramid(rendered, levels);
            const many = pyramid(rendered, 7);
            let compared = 0;
            for (const q of all) {
                const a = alignPatch(few, patches, q, PINBALL_STEP, H, options);
                const b = alignPatch(many, patches, q, PINBALL_STEP, H, options);
                expect(a).toEqual(b);
                compared++;
            }
            expect(compared).toBe(64);
        }
    });
});
```
(Format the long lines with prettier; the hook will.)

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/nft-tracker/test/tracking/frame_levels.test.ts`
Expected: FAIL with "Cannot find module …/frame_levels.js".

- [ ] **Step 4: Export `startLevel`.** In `align_patch.ts`, change `function startLevel(` to `export function startLevel(` and add to its doc comment, after the first paragraph:
```
 * Exported so `frameLevelsFor` (frame_levels.ts) builds a frame pyramid
 * exactly as deep as this rule will start on, from one source of truth.
```

- [ ] **Step 5: Write `src/tracking/frame_levels.ts`** (LGPL header, name on line 2):

```ts
/**
 * How many levels the live frame's pyramid needs this frame.
 *
 * `alignPatch` starts a patch on the level where one patch pixel is closest to
 * one level pixel ({@link startLevel}) and refines on finer ones only; it
 * never reads a level coarser than its start. So a pyramid deeper than the
 * deepest start level is built and never read. This function applies the
 * same rule to every candidate patch, at the prediction, and returns one more
 * than the deepest start it finds — at most `maxLevels`, and never a level
 * smaller than 2 × 2, below which `alignPatch` can use no level.
 *
 * What it saves, measured: pinball's compiled patches are all level 0, and on
 * the 270 × 360 camera path the target appears at about half its compiled
 * size, so every one starts — and ends — on frame level 0, and one level is
 * all it needs: the frame itself, by reference, nothing computed. Four levels
 * cost 1.85 ms in Node here, an estimated 5.6–7.5 ms on the reference device
 * (docs/benchmarks/README.md), and align those patches bit-identically.
 *
 * What building fewer levels than this would cost: a patch seen larger than
 * its own scale (σ > √r) then starts on level 0, read through footprints from
 * the first iteration — measured at σ = 2 as 61% rather than 65% converging
 * from 12 px off and 35% rather than 40% from 16 px, with every iteration
 * paying the footprint's samples (`startLevel`'s notes). This function never
 * builds fewer than the prediction asks for, up to `maxLevels`.
 */

import type { Mat3 } from "@webarkit/cv-backend-spec";
import { startLevel } from "./align_patch.js";
import { pyramidScales } from "./frame_pyramid.js";

/**
 * @param prediction    Target level-0 → frame level-0, `H[8] > 0` (as
 *                      `predictHomography` returns it). A point it sends to
 *                      or behind the horizon is skipped.
 * @param centres       Every patch's centre in target level-0 px, interleaved.
 * @param patchScales   `s_l` of every patch's level.
 * @param candidates    The patches that will be aligned this frame.
 * @param frameScaleStep The frame pyramid's step.
 * @param frame         The frame's size.
 * @param maxLevels     Upper bound, an integer in `[1, 256]`.
 */
export function frameLevelsFor(
    prediction: Mat3,
    centres: Float64Array,
    patchScales: Float64Array,
    candidates: readonly number[],
    frameScaleStep: number,
    frame: { readonly width: number; readonly height: number },
    maxLevels: number,
): number {
    const scales = pyramidScales(frameScaleStep, maxLevels);
    if (scales === null) return 1;
    let fit = 1;
    while (
        fit < maxLevels &&
        ((frame.width * scales[fit]) | 0) >= 2 &&
        ((frame.height * scales[fit]) | 0) >= 2
    ) {
        fit++;
    }
    if (fit === 1) return 1;
    const usable = Array.from({ length: fit }, (_, l) => l);
    let deepest = 0;
    for (const q of candidates) {
        const sigma = scaleAt(prediction, centres[2 * q], centres[2 * q + 1]) / patchScales[q];
        if (!(sigma > 0 && sigma < Infinity)) continue;
        deepest = Math.max(deepest, startLevel(usable, scales, sigma));
    }
    return deepest + 1;
}

/**
 * Frame level-0 px per target level-0 px at `(X, Y)`, `√|det J|` of the
 * prediction there — what `alignPatch` calls the scale at a patch's centre,
 * before dividing by the patch's level scale; `NaN` at or beyond the horizon.
 */
function scaleAt(H: Mat3, X: number, Y: number): number {
    const w = H[6] * X + H[7] * Y + H[8];
    if (!(w > 0)) return Number.NaN;
    const x = (H[0] * X + H[1] * Y + H[2]) / w;
    const y = (H[3] * X + H[4] * Y + H[5]) / w;
    const a = (H[0] - H[6] * x) / w;
    const b = (H[1] - H[7] * x) / w;
    const c = (H[3] - H[6] * y) / w;
    const d = (H[4] - H[7] * y) / w;
    return Math.sqrt(Math.abs(a * d - b * c));
}
```

- [ ] **Step 6: Run the tests; they pass**

Run: `npx vitest run packages/nft-tracker/test/tracking/frame_levels.test.ts packages/nft-tracker/test/tracking/align_patch*.test.ts`
Expected: PASS (the align_patch suites prove the export changed nothing).

- [ ] **Step 7: Commit**

```bash
npm run build && npm run typecheck
git add packages/nft-tracker/src/tracking/align_patch.ts packages/nft-tracker/src/tracking/frame_levels.ts \
    packages/nft-tracker/test/fixtures/tracking_target.ts packages/nft-tracker/test/tracking/frame_levels.test.ts
git commit -F - <<'EOF'
feat(nft-tracker): size the frame pyramid to the levels the patches start on

alignPatch starts each patch on the frame level whose pixels match the
patch's and never reads a coarser one, so a frame pyramid deeper than the
deepest start level is built and never read. frameLevelsFor applies
alignPatch's own start rule (startLevel, now exported) to every candidate
patch at the prediction and returns one more than the deepest start, capped
by the caller and by the frame's size.

On the camera path (270 x 360, pinball at about half its compiled scale)
every patch starts on level 0, so one level is enough: the frame itself,
nothing computed, where four cost an estimated 5.6-7.5 ms on the reference
device. The tests pin that, and that on the levels it asks for every patch
aligns bit-identically to a 7-level pyramid (64 of 64, at 0.45 and at 2x).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: `trackFrame`: one tracking step, pure

**Files:**
- Create: `packages/nft-tracker/src/tracking/track_frame.ts`
- Test: `packages/nft-tracker/test/tracking/track_frame.test.ts`

**Interfaces:**
- Consumes: `predictHomography`, `buildFramePyramid`, `alignPatch`, `robustHomography` (types.ts signatures, unchanged), `frameLevelsFor` (Task 2), `levelScale`.
- Produces (all exported from `track_frame.ts`; the types are re-exported publicly in Task 4):

```ts
export interface TrackTarget {
    readonly patches: PatchTable;
    /** The target's pyramid step; also the frame pyramid's. */
    readonly scaleStep: number;
    /** Every patch centre, target level-0 px, interleaved `(x, y)`. */
    readonly centres: Float64Array;
    /** `s_l` of every patch's level. */
    readonly patchScales: Float64Array;
}
export function trackTarget(patches: PatchTable, scaleStep: number): TrackTarget;

export const PatchOutcome: { readonly Culled: 0; readonly Observed: 1; readonly Unconverged: 2; readonly Lost: 3; readonly Rejected: 4; readonly Failed: 5 };

export type TrackLoss = "no-prediction" | "too-few-patches" | "fit-failed" | "too-many-outliers";

export interface TrackStats {
    readonly frameLevels: number; readonly culled: number; readonly attempted: number;
    readonly observed: number; readonly lost: number; readonly unconverged: number;
    readonly rejected: number; readonly failed: number; readonly inliers: number;
    readonly rmsError: number | null;
}

export interface TrackStepTimings { readonly trackMs: number; readonly pyramidMs: number; readonly alignMs: number; readonly fitMs: number }

export interface TrackFrameOptions {
    readonly maxFrameLevels: number;
    readonly align: AlignPatchOptions;
    readonly fit: RobustHomographyOptions;
    readonly minTrackedPatches: number;
    readonly maxOutlierShare: number;
    readonly maxPatchResidual: number;
}

export type TrackFrameResult =
    | { readonly ok: true; readonly H: Mat3; readonly quality: number; readonly weights: Float64Array;
        readonly stats: TrackStats; readonly outcomes: Uint8Array; readonly timings: TrackStepTimings | null }
    | { readonly ok: false; readonly loss: TrackLoss;
        readonly stats: TrackStats; readonly outcomes: Uint8Array; readonly timings: TrackStepTimings | null };

export function trackFrame(frame: GrayImage, target: TrackTarget, previous: Mat3 | null, current: Mat3,
    options: TrackFrameOptions, clock: (() => number) | null): TrackFrameResult;
```

- [ ] **Step 1: Write the failing tests** `test/tracking/track_frame.test.ts`. Fixed setup:

```ts
import { describe, it, expect } from "vitest";
import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { PatchOutcome, trackFrame, trackTarget } from "../../src/tracking/track_frame.js";
import type { TrackFrameOptions, TrackFrameResult } from "../../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches } from "../fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "../fixtures/pgm.js";
import { mat3Mul, project, renderWarp, rotation, scaling, translation, view } from "../fixtures/warped_frames.js";

const image = readPgm(TARGET_FIXTURE);
const patches = pinballPatches();
const target = trackTarget(patches, PINBALL_STEP);
const CAMERA = { width: 270, height: 360 };
/** The camera path's geometry: the 512 × 640 target at 0.45 in a 270 × 360 frame (σ ≈ 0.45). */
const OPTIONS: TrackFrameOptions = {
    maxFrameLevels: 4,
    align: { maxIterations: 30, epsilon: 0.01, photometric: true },
    fit: { maxIterations: 20, tukeyC: 4, epsilon: 1e-6 },
    minTrackedPatches: 8,
    maxOutlierShare: 0.45,
    maxPatchResidual: Infinity,
};
const VIEWS: Mat3[] = [
    view({ target: image, frame: CAMERA, scale: 0.45 }),
    view({ target: image, frame: CAMERA, scale: 0.45, angle: (15 * Math.PI) / 180, perspective: [0.0004, -0.0003] }),
];
const RENDER = { ...CAMERA, blurPasses: 1, noiseSigma: 2, gain: 0.9, bias: 10, seed: 3 };
const FRAMES = VIEWS.map((H) => renderWarp(image, H, RENDER));

/** RMS, frame px, between where `A` and `B` put the 64 patch centres. */
function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let q = 0; q < patches.count; q++) {
        const [ax, ay] = project(A, target.centres[2 * q], target.centres[2 * q + 1]);
        const [bx, by] = project(B, target.centres[2 * q], target.centres[2 * q + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / patches.count);
}

/** `E` applied in the frame about the target centre's image: the prediction is `E · truth`. */
function about(E: Mat3, H: Mat3): Mat3 {
    const [cx, cy] = project(H, (image.width - 1) / 2, (image.height - 1) / 2);
    return mat3Mul(mat3Mul(translation(cx, cy), mat3Mul(E, translation(-cx, -cy))), H);
}

function count(outcomes: Uint8Array, code: number): number {
    return outcomes.reduce((n, o) => n + (o === code ? 1 : 0), 0);
}
```

Tests (each is an `it` in `describe("trackFrame", …)`):

(a) **Exact pose, the step's accuracy and bookkeeping.** For each of `FRAMES`, with `previous = null` and `current = VIEWS[v]`:
  - `r.ok`;
  - the stats agree with the outcomes (`attempted = count − culled`; `observed + lost + unconverged + rejected + failed = attempted`; each counter equals `count(outcomes, code)`);
  - `r.weights.length === r.stats.observed`;
  - `r.quality === Σ r.weights / r.stats.attempted` exactly (tracker.ts's definition);
  - `r.stats.frameLevels === 1`;
  - `centreRms(r.H, VIEWS[v])` is pinned.

  Pin the stats object with `toEqual` and the RMS by the global rule. Spike S3 reports, at d = 0, 59 observed of ~60 attempted on view 0 and a median fit RMS of 0.092 px. Its view 1 is not this plan's view 1, so measure both views.

(b) **Culling.** View 0 shifted so that half the target leaves the frame: `view({ …, scale: 0.45, shift: [130, 0] })`, rendered with `RENDER`. Assert:
  - `culled > 0`;
  - every culled patch is one whose four corner samples are not all inside `[0, 269] × [0, 359]` under the prediction (recompute this in the test with `project`);
  - no culled patch is counted in `attempted`.

  Pin the counts.

(c) **A patch that loses its target ends Lost, and none of its positions reaches the fit** (the request's point 1). Occlude with a flat block: copy `FRAMES[0]`, set to 128 every pixel with `x ≥ 135, y < 180` (the target's upper right quadrant), and track from the exact pose. The block is painted after rendering, so it is exactly flat, with no noise. Assert:
  - every patch whose whole predicted window (its four corner samples, projected by the truth) lies inside the block ends `PatchOutcome.Lost` (the singular reason), not `Unconverged`. Patches straddling the block's edge are partly textured, so they are not asserted on; they are counted, and the count is pinned;
  - `r.weights.length === r.stats.observed` and every observed patch's centre lies outside the block;
  - `centreRms(r.H, VIEWS[0])` stays pinned below its measured value, and `r.quality` drops to about `(64 − lost) / 64` of the unoccluded case.

  Pin `lost`, `observed`, `quality` and the RMS.

(d) **A flat frame loses every patch.** A frame of 128 everywhere (270 × 360), from the exact pose, gives:
  - `r.ok === false`, `r.loss === "too-few-patches"`;
  - `r.stats.lost === r.stats.attempted`, `r.stats.observed === 0`, `r.stats.inliers === 0`, `r.stats.rmsError === null`.

(e) **The prediction error one step survives** (the request's point 4). For `d ∈ {0, 1, 2, 3, 3.5, 4, 4.5, 6}` px, in 16 directions, on both views (32 trials per d): prediction `about(translation(d·cos a, d·sin a), H)`, `previous = null`. Count trials with `r.ok && centreRms(r.H, truth) < 0.5`, and tally the `loss` reasons of the rest.

  Expected shape, from spike S3 (4 views there, 2 here, so the counts are this test's own):
  - 32/32 up to 3.5 px;
  - 4 px mostly passing (85.9% there);
  - 4.5 px mostly failing (10.9% there);
  - 6 px none.

  Pin the per-d counts and loss tallies exactly. The test name states the headline: `"survives a prediction up to 3.5 px off (32/32 recovered within 0.5 px); at 4.5 px, <n>/32; at 6 px, none"`. A 6-px trial that ends `ok` with a wrong H would be a bug in the breakdown rule: assert there are none, i.e. every `ok` result at 6 px has `centreRms < 0.5`.

(f) **Rotation and scale.** On view 0, `about(rotation(±θ), H)` for θ ∈ {2°, 3°, 4°} and `about(scaling(k), H)` for k ∈ {1/1.06, 1/1.05, 1.05, 1.06}. Pin which pass (spike S3: 3° and 5% pass, 4° and 6% do not).

(g) **The breakdown rule does work.**
  - Re-run (e)'s 32 trials at 4 px with `maxOutlierShare: 0`. Every trial whose fit gives some correspondence weight 0 now ends `"too-many-outliers"`. Pin how many of the 32 do; at 0.45 they passed. The count must be > 0, or the rule is not exercised: if it is 0, move to 4.5 px and say so in the test.
  - Re-run (e)'s 32 trials at 6 px with `maxOutlierShare: 1 − 1e-12`. Pin how many fits would then be accepted, and their `centreRms`. These are the wrong fits the 0.45 rule turns away: spike S3 saw 38% inliers per observation there, with the fit 24 px off at the median.

(h) **The residual gate.**
  - With `maxPatchResidual: Infinity` (the default), `rejected === 0` on every frame above.
  - With `maxPatchResidual: 20` on view 0 at d = 0: `rejected > 0`; every rejected patch's `alignPatch` observation (recomputed in the test) has `residual / gain > 20`; and no rejected patch's position reaches the fit (`weights.length === observed`).

(i) **No prediction.** `previous` = the zero matrix: `r.ok === false`, `r.loss === "no-prediction"`, `r.stats.frameLevels === 0`, `r.stats.attempted === 0`.

(j) **Pure and deterministic.**
  - Two calls with the same arguments give `toEqual` results.
  - After both, `FRAMES[0].data`, `patches.pixels`, `VIEWS[0]` and a non-null `previous` equal copies taken before (compare with `Uint8Array.from`/`Float64Array.from` snapshots).

(k) **Timings.**
  - With `clock === null`, `r.timings === null`.
  - With `clock = () => performance.now()`: every field is finite and ≥ 0, and `pyramidMs + alignMs + fitMs <= trackMs`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/nft-tracker/test/tracking/track_frame.test.ts`
Expected: FAIL with "Cannot find module …/track_frame.js".

- [ ] **Step 3: Write `src/tracking/track_frame.ts`** (LGPL header, name on line 2):

```ts
/**
 * One frame of the tracking state: predict, cull, build the frame pyramid
 * once, align every visible patch, fit, judge. Pure: the state it needs —
 * the last two homographies — is passed in, and `NftTracker` keeps it.
 *
 * **Per-patch outcomes** ({@link PatchOutcome}) are read from `alignPatch`'s
 * result, never inferred:
 *
 * - `"singular"` is a patch that **lost** its target this frame: with gain
 *   and bias estimated, that is how an alignment that finds no match ends —
 *   the fitted gain collapses (align_patch.ts, point 6). It gives no
 *   correspondence, and is not a property of the patch: next frame it is
 *   aligned again.
 * - `converged: false` gives no correspondence either: the aligner endorsed
 *   no position. Measured on pinball at the camera path's scale, feeding
 *   those positions to the fit left translation survival unchanged but broke
 *   it at 3° of rotation and 5% of scale.
 * - Any other failure is **failed**; with the cull below it is rare.
 *
 * **Culled** patches — whose four corner samples the prediction does not put
 * inside the frame, where no frame level could hold them — are never passed
 * to `alignPatch`, and so count neither in `attempted` nor in `quality`
 * (tracker.ts's definition).
 *
 * **The judgement.** A frame is lost when fewer than `minTrackedPatches`
 * correspondences remain; when `robustHomography` fails; or when it gives
 * weight 0 to more than `maxOutlierShare` of them — past #64's measured
 * breakdown (every outlier rejected in 2000 seeds of 2000 up to 45%,
 * failures from 50%), where the fit may have locked onto the outliers.
 */

import type { GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import type { PatchTable } from "../target/types.js";
import { alignPatch } from "./align_patch.js";
import { frameLevelsFor } from "./frame_levels.js";
import { buildFramePyramid } from "./frame_pyramid.js";
import { levelScale } from "./level_scale.js";
import { predictHomography } from "./predict_homography.js";
import { robustHomography } from "./robust_homography.js";
import type { AlignPatchOptions, RobustHomographyOptions } from "./types.js";

/** A target's patches with the geometry every frame reuses, computed once. */
export interface TrackTarget {
    readonly patches: PatchTable;
    /** The target's pyramid step; the frame's pyramid is built with it too. */
    readonly scaleStep: number;
    /** Every patch centre, target level-0 px, interleaved `(x, y)`: the fit's `src`. */
    readonly centres: Float64Array;
    /** `s_l` of every patch's level. */
    readonly patchScales: Float64Array;
}

/**
 * The geometry of `patches`, once. Centres follow types.ts's rule for a
 * correspondence's target-side point, `((left + (P − 1)/2) / s_l, …)`, with
 * `s_l` from `levelScale` (which throws on a step it cannot use: a target
 * that reaches here has been decoded or built, so its step is valid).
 */
export function trackTarget(patches: PatchTable, scaleStep: number): TrackTarget {
    const Q = patches.count;
    const half = (patches.patchSize - 1) / 2;
    const centres = new Float64Array(2 * Q);
    const patchScales = new Float64Array(Q);
    for (let q = 0; q < Q; q++) {
        const s = levelScale(scaleStep, patches.level[q]);
        patchScales[q] = s;
        centres[2 * q] = (patches.left[q] + half) / s;
        centres[2 * q + 1] = (patches.top[q] + half) / s;
    }
    return { patches, scaleStep, centres, patchScales };
}

/** What happened to each patch this frame, one code per patch in `outcomes`. */
export const PatchOutcome = {
    /** Not passed to `alignPatch`: its predicted window is not inside the frame, or there was no prediction. */
    Culled: 0,
    /** Converged and kept: a correspondence of the fit. */
    Observed: 1,
    /** Reached `alignPatch`'s iteration cap: no position. */
    Unconverged: 2,
    /** `alignPatch` said `"singular"`: the patch lost its target this frame. */
    Lost: 3,
    /** Converged, but `residual / gain` above `maxPatchResidual`. */
    Rejected: 4,
    /** Any other `alignPatch` failure. */
    Failed: 5,
} as const;

/** Why a tracking step failed. */
export type TrackLoss =
    /** `predictHomography` failed on the last two poses. */
    | "no-prediction"
    /** Fewer than `minTrackedPatches` correspondences survived alignment. */
    | "too-few-patches"
    /** `robustHomography` returned no fit. */
    | "fit-failed"
    /** The fit gave weight 0 to more than `maxOutlierShare` of the correspondences. */
    | "too-many-outliers";

/** A step's patch counts: `culled + attempted = patches.count`, and the five outcomes of attempted patches sum to `attempted`. */
export interface TrackStats {
    /** Frame pyramid levels built (1: the frame alone); 0 when no prediction was made. */
    readonly frameLevels: number;
    readonly culled: number;
    /** Patches passed to `alignPatch`: `quality`'s denominator. */
    readonly attempted: number;
    readonly observed: number;
    readonly lost: number;
    readonly unconverged: number;
    readonly rejected: number;
    readonly failed: number;
    /** The fit's correspondences with weight > 0; 0 when no fit ran or it failed. */
    readonly inliers: number;
    /** The fit's weighted RMS residual, frame px; `null` when no fit ran or it failed. */
    readonly rmsError: number | null;
}

/** Where a step's time went, ms, by the injected clock. */
export interface TrackStepTimings {
    /** The whole step: prediction, cull, pyramid, alignment, fit, judgement. */
    readonly trackMs: number;
    readonly pyramidMs: number;
    readonly alignMs: number;
    readonly fitMs: number;
}

export interface TrackFrameOptions {
    readonly maxFrameLevels: number;
    readonly align: AlignPatchOptions;
    readonly fit: RobustHomographyOptions;
    readonly minTrackedPatches: number;
    readonly maxOutlierShare: number;
    readonly maxPatchResidual: number;
}

export type TrackFrameResult =
    | {
          readonly ok: true;
          /** Target level-0 → frame level-0, `H[8] = 1`. */
          readonly H: Mat3;
          /** Σ weights ÷ `stats.attempted`, in `[0, 1]`. */
          readonly quality: number;
          /** The fit's weights, one per observed patch, in patch order. */
          readonly weights: Float64Array;
          readonly stats: TrackStats;
          readonly outcomes: Uint8Array;
          readonly timings: TrackStepTimings | null;
      }
    | {
          readonly ok: false;
          readonly loss: TrackLoss;
          readonly stats: TrackStats;
          readonly outcomes: Uint8Array;
          readonly timings: TrackStepTimings | null;
      };

/**
 * One tracking step. `previous`/`current` are the last two homographies, as
 * `predictHomography` takes them (`previous = null` right after a
 * detection). Throws a `RangeError` only for a frame that is not a valid
 * `GrayImage` — a contract violation, like the backend's own.
 */
export function trackFrame(
    frame: GrayImage,
    target: TrackTarget,
    previous: Mat3 | null,
    current: Mat3,
    options: TrackFrameOptions,
    clock: (() => number) | null,
): TrackFrameResult {
    const now = clock ?? (() => 0);
    const start = now();
    const { patches } = target;
    const outcomes = new Uint8Array(patches.count);
    const counts = { frameLevels: 0, culled: patches.count, attempted: 0, observed: 0, lost: 0, unconverged: 0, rejected: 0, failed: 0 };
    let pyramidMs = 0;
    let alignMs = 0;
    let fitMs = 0;
    const timings = (): TrackStepTimings | null =>
        clock === null ? null : { trackMs: now() - start, pyramidMs, alignMs, fitMs };
    const lose = (loss: TrackLoss, inliers = 0, rmsError: number | null = null): TrackFrameResult => ({
        ok: false,
        loss,
        stats: { ...counts, inliers, rmsError },
        outcomes,
        timings: timings(),
    });

    const predicted = predictHomography(previous, current);
    if (!predicted.ok) return lose("no-prediction");
    const H = predicted.H;

    const candidates: number[] = [];
    for (let q = 0; q < patches.count; q++) {
        if (windowInFrame(H, target, q, frame.width, frame.height)) candidates.push(q);
    }
    counts.attempted = candidates.length;
    counts.culled = patches.count - candidates.length;

    const levels = frameLevelsFor(
        H, target.centres, target.patchScales, candidates, target.scaleStep, frame, options.maxFrameLevels,
    );
    const pyramidStart = now();
    const built = buildFramePyramid(frame, { levels, scaleStep: target.scaleStep });
    pyramidMs = now() - pyramidStart;
    if (!built.ok) {
        throw new RangeError(`@webarkit/nft-tracker: not a valid frame (${built.reason})`);
    }
    counts.frameLevels = levels;

    const src = new Float64Array(2 * candidates.length);
    const dst = new Float64Array(2 * candidates.length);
    const alignStart = now();
    for (const q of candidates) {
        const r = alignPatch(built.pyramid, patches, q, target.scaleStep, H, options.align);
        if (!r.ok) {
            if (r.reason === "singular") {
                outcomes[q] = PatchOutcome.Lost;
                counts.lost++;
            } else {
                outcomes[q] = PatchOutcome.Failed;
                counts.failed++;
            }
            continue;
        }
        const o = r.observation;
        if (!o.converged) {
            outcomes[q] = PatchOutcome.Unconverged;
            counts.unconverged++;
            continue;
        }
        if (o.residual / o.gain > options.maxPatchResidual) {
            outcomes[q] = PatchOutcome.Rejected;
            counts.rejected++;
            continue;
        }
        outcomes[q] = PatchOutcome.Observed;
        const k = counts.observed++;
        src[2 * k] = target.centres[2 * q];
        src[2 * k + 1] = target.centres[2 * q + 1];
        dst[2 * k] = o.x;
        dst[2 * k + 1] = o.y;
    }
    alignMs = now() - alignStart;

    if (counts.observed < options.minTrackedPatches) return lose("too-few-patches");
    const fitStart = now();
    const fit = robustHomography(
        src.subarray(0, 2 * counts.observed), dst.subarray(0, 2 * counts.observed), H, options.fit,
    );
    fitMs = now() - fitStart;
    if (!fit.ok) return lose("fit-failed");
    const outliers = counts.observed - fit.numInliers;
    if (outliers / counts.observed > options.maxOutlierShare) {
        return lose("too-many-outliers", fit.numInliers, fit.rmsError);
    }
    let sum = 0;
    for (let i = 0; i < fit.weights.length; i++) sum += fit.weights[i];
    return {
        ok: true,
        H: fit.H,
        quality: sum / counts.attempted,
        weights: fit.weights,
        stats: { ...counts, inliers: fit.numInliers, rmsError: fit.rmsError },
        outcomes,
        timings: timings(),
    };
}

/**
 * Whether the prediction puts all four corner samples of patch `q` inside
 * frame level 0, `[0, w − 1] × [0, h − 1]`, in front of the camera. A
 * homography maps the patch's square to a convex quadrilateral whose vertices
 * are those corners, so every sample is inside if they are: this is exactly
 * `alignPatch`'s own test on level 0, the most permissive level, without its
 * P² projections. A patch failing it could be aligned on no level.
 */
function windowInFrame(H: Mat3, target: TrackTarget, q: number, width: number, height: number): boolean {
    const { patches } = target;
    const last = patches.patchSize - 1;
    const s = target.patchScales[q];
    for (let k = 0; k < 4; k++) {
        const X = (patches.left[q] + (k & 1 ? last : 0)) / s;
        const Y = (patches.top[q] + (k & 2 ? last : 0)) / s;
        const w = H[6] * X + H[7] * Y + H[8];
        if (!(w > 0)) return false;
        const x = (H[0] * X + H[1] * Y + H[2]) / w;
        const y = (H[3] * X + H[4] * Y + H[5]) / w;
        if (!(x >= 0 && x <= width - 1 && y >= 0 && y <= height - 1)) return false;
    }
    return true;
}
```
(`counts` is a local mutable record copied into the readonly `TrackStats`; prettier reformats the long calls.)

- [ ] **Step 4: Run; fix only what the tests show; then pin the measured numbers.** Run: `npx vitest run packages/nft-tracker/test/tracking/track_frame.test.ts --reporter=verbose --disableConsoleIntercept`. For every pinned value, print it first, check it against the expected shape above, and then write it in. If a value falls outside the shape (for example (e) below 32/32 at 3 px, or any `ok` result at 6 px with an RMS ≥ 0.5), stop and use `superpowers:systematic-debugging`. The spike used these same functions, so a difference is a finding, not noise.

- [ ] **Step 5: Run again: PASS. Then the package suite and typecheck**

Run: `npm run build && npm run typecheck -w @webarkit/nft-tracker && npm test -w @webarkit/nft-tracker`
Expected: all pass.

- [ ] **Step 6: Commit**: `feat(nft-tracker): trackFrame, one tracking step from prediction to judgement`. The body names the per-patch outcome policy, the three LOST criteria with the 45% and minimum-8 reasoning, and (e)'s pinned survival figures.

---

### Task 4: `NftTracker` becomes LOST → DETECT → TRACK

**Files:**
- Modify: `packages/nft-tracker/src/tracker.ts` (whole body; M1's detection code moves unchanged into a private `detect`)
- Modify: `packages/nft-tracker/src/index.ts`
- Test: `packages/nft-tracker/test/tracker_options.test.ts`

**Interfaces:**
- Consumes: `trackFrame`, `trackTarget`, `TrackLoss`, `TrackStats`, `TrackStepTimings` (Task 3).
- Produces (public, via `index.ts`):
  - new defaults `DEFAULT_MAX_FRAME_LEVELS` (4), `DEFAULT_ALIGN_MAX_ITERATIONS` (30), `DEFAULT_ALIGN_EPSILON` (0.01), `DEFAULT_PHOTOMETRIC` (true), `DEFAULT_TUKEY_C` (4), `DEFAULT_FIT_MAX_ITERATIONS` (20), `DEFAULT_FIT_EPSILON` (1e-6), `DEFAULT_MIN_TRACKED_PATCHES` (8), `DEFAULT_MAX_OUTLIER_SHARE` (0.45), `DEFAULT_MAX_PATCH_RESIDUAL` (Infinity);
  - `NftTrackerOptions` gains `detectionOnly`, `maxFrameLevels`, `alignMaxIterations`, `alignEpsilon`, `photometric`, `tukeyC`, `fitMaxIterations`, `fitEpsilon`, `minTrackedPatches`, `maxOutlierShare`, `maxPatchResidual`, `clock`;
  - `TrackResult` gains `trackLoss: TrackLoss | null`, `tracking: TrackStats | null`, `timings: TrackTimings | null` on both branches;
  - new `TrackTimings { totalMs, detectMs, trackMs, pyramidMs, alignMs, fitMs }`;
  - `NftTracker.detectionOnly: boolean` (readonly).

- [ ] **Step 1: Write the failing tests** `test/tracker_options.test.ts` (real backend, no sequences):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import type { TargetDb } from "../src/target/types.js";
import { pinballPatches, pinballTrackingTarget } from "./fixtures/tracking_target.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";

let cv: CvBackend;
let tracked: TargetDb;
let K: Mat3;
beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    tracked = pinballTrackingTarget(cv);
    K = intrinsics(270, 360);
});

describe("NftTracker options (M2)", () => {
    it.each<[keyof NftTrackerOptions, unknown]>([
        ["maxFrameLevels", 0], ["maxFrameLevels", 257], ["maxFrameLevels", 1.5],
        ["alignMaxIterations", 0], ["alignEpsilon", 0], ["alignEpsilon", Infinity],
        ["tukeyC", -1], ["tukeyC", Number.NaN], ["fitMaxIterations", 0], ["fitEpsilon", 0],
        ["minTrackedPatches", 3], ["minTrackedPatches", 8.5],
        ["maxOutlierShare", -0.1], ["maxOutlierShare", 1],
        ["maxPatchResidual", 0], ["maxPatchResidual", Number.NaN],
        ["photometric", "yes"], ["detectionOnly", 1], ["clock", 42],
    ])("refuses %s = %s at construction, naming it", (name, value) => {
        expect(() => new NftTracker(cv, tracked, K, { [name]: value } as NftTrackerOptions)).toThrow(
            new RegExp(`${name}`),
        );
    });

    it("tracks a target with patches by default", () => {
        expect(new NftTracker(cv, tracked, K).detectionOnly).toBe(false);
    });

    it("is detection-only when asked, or when the target cannot be tracked (§5.7)", () => {
        const patchless = buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 });
        const p = pinballPatches();
        const seven = { ...p, count: 7, score: p.score.subarray(0, 7), left: p.left.subarray(0, 7),
            top: p.top.subarray(0, 7), level: p.level.subarray(0, 7), pixels: p.pixels.subarray(0, 7 * 256) };
        expect(new NftTracker(cv, tracked, K, { detectionOnly: true }).detectionOnly).toBe(true);
        expect(new NftTracker(cv, patchless, K).detectionOnly).toBe(true);
        expect(new NftTracker(cv, { ...tracked, patches: seven }, K).detectionOnly).toBe(true);
        expect(new NftTracker(cv, { ...tracked, patches: { ...p, patchSize: 2, pixels: p.pixels.subarray(0, 64 * 4) } }, K).detectionOnly).toBe(true);
    });

    it("carries the M2 fields on an M1-shaped result: null tracking, null trackLoss, no timings without a clock", () => {
        const scene = readPgm(SCENE_FIXTURE);
        const { value: r } = withSeededRandom(1, () =>
            new NftTracker(cv, tracked, intrinsics(scene.width, scene.height), { maxSceneKeypoints: 900 }).process(scene, 0),
        );
        expect(r.state).toBe("DETECT");
        expect(r.trackLoss).toBeNull();
        expect(r.tracking).toBeNull();
        expect(r.timings).toBeNull();
    });

    it("times the frame with an injected clock, and reads none of its own", () => {
        const scene = readPgm(SCENE_FIXTURE);
        const { value: r } = withSeededRandom(1, () =>
            new NftTracker(cv, tracked, intrinsics(scene.width, scene.height), {
                maxSceneKeypoints: 900,
                clock: () => performance.now(),
            }).process(scene, 0),
        );
        expect(r.timings).not.toBeNull();
        const t = r.timings!;
        expect(t.detectMs).toBeGreaterThan(0);
        expect(t.detectMs).toBeLessThanOrEqual(t.totalMs);
        expect([t.trackMs, t.pyramidMs, t.alignMs, t.fitMs]).toEqual([0, 0, 0, 0]);
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run packages/nft-tracker/test/tracker_options.test.ts`
Expected: FAIL. The constructor throws nothing, and `detectionOnly`, `trackLoss`, `tracking` and `timings` are undefined.

- [ ] **Step 3: Rewrite `src/tracker.ts`.** Keep the header and M1's constants and comments as they are. The class doc comment is rewritten in Task 6; for now change only its first paragraph so it no longer says the tracker carries nothing. The new parts:

```ts
import type { CvBackend, GrayImage, Keypoint, Mat3, Pose } from "@webarkit/cv-backend-spec";
import { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "./detection.js";
import type { TargetLevelView } from "./detection.js";
import type { TargetDb } from "./target/types.js";
import { trackFrame, trackTarget } from "./tracking/track_frame.js";
import type { TrackFrameOptions, TrackLoss, TrackStats, TrackStepTimings, TrackTarget } from "./tracking/track_frame.js";
import type { TrackingState } from "./tracking/types.js";

// …M1's DEFAULT_SCENE_LEVELS … DEFAULT_RANSAC_THRESHOLD, unchanged…

/*
 * The tracking state's defaults. Every one is provisional until the M2
 * tuning pass (#48, "Evaluation"), which replaces each with a measured value
 * and its reason. Where one was measured already, the measurement is cited;
 * the others are the configurations #63 and #64 measured their functions
 * under.
 */

/**
 * Most frame pyramid levels a tracking frame builds. Fewer are built when the
 * patches start on fewer (`frameLevelsFor`): on the camera path, pinball's
 * patches need one, the frame itself. Four covers a level-0 patch seen at up
 * to twice its scale. Provisional until the M2 tuning pass.
 */
export const DEFAULT_MAX_FRAME_LEVELS = 4;
/** `alignPatch`'s iteration cap per level: #63's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_ALIGN_MAX_ITERATIONS = 30;
/** `alignPatch`'s convergence step, frame px: #63's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_ALIGN_EPSILON = 0.01;
/**
 * Estimate gain and bias with each patch's translation: camera exposure
 * changes, and a lost patch then ends `"singular"`, which the tracker reads
 * (align_patch.ts, point 6). Provisional until the M2 tuning pass.
 */
export const DEFAULT_PHOTOMETRIC = true;
/**
 * Tukey's cutoff, frame px: the detection state's RANSAC threshold, and #64's
 * configuration for its 45% breakdown. It also bounds the prediction error a
 * step survives (3.5 px measured on the camera path; track_frame.test.ts).
 * Provisional until the M2 tuning pass.
 */
export const DEFAULT_TUKEY_C = 4;
/** `robustHomography`'s iteration cap: #64's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_FIT_MAX_ITERATIONS = 20;
/** `robustHomography`'s convergence tolerance, px: #64's measured configuration. Provisional until the M2 tuning pass. */
export const DEFAULT_FIT_EPSILON = 1e-6;
/**
 * Fewest correspondences a tracking frame may fit. With
 * {@link DEFAULT_MAX_OUTLIER_SHARE}, 8 is the smallest count at which every
 * accepted fit keeps at least 5 inliers — one more than a homography needs,
 * so no accepted fit is exactly determined. Provisional until the M2 tuning
 * pass.
 */
export const DEFAULT_MIN_TRACKED_PATCHES = 8;
/**
 * Largest share of correspondences the fit may weigh 0 before the frame is
 * lost: #64's measured breakdown (every outlier rejected in 2000 seeds of
 * 2000 up to 45%; failures from 50%, 40 patches, a prediction 3 px off).
 * Provisional until the M2 tuning pass.
 */
export const DEFAULT_MAX_OUTLIER_SHARE = 0.45;
/**
 * Largest `residual / gain` (grey levels) a converged patch may have and
 * still reach the fit. Off: measured on pinball at the camera path's scale
 * (σ ≈ 0.45), right and wrong alignments overlap — the best threshold keeps
 * 66% of right ones and still passes 15% of wrong ones — because level-0
 * patches are far sharper than the frame there (median gain 0.51). At σ = 1
 * a gate at 35 keeps every right alignment and rejects 94% of wrong ones:
 * the tuning pass should set this together with patch levels. Provisional.
 */
export const DEFAULT_MAX_PATCH_RESIDUAL = Infinity;

/** Why a frame produced no homography. */
export type TrackFailure = "too-few-matches" | "no-consensus";   // unchanged, with its member docs

export interface NftTrackerOptions {
    // …M1's four, unchanged…
    /** Never track: every frame runs detection, and nothing is carried between frames (M1). Default `false`. */
    readonly detectionOnly?: boolean;
    /** See {@link DEFAULT_MAX_FRAME_LEVELS}. Integer in `[1, 256]`. */
    readonly maxFrameLevels?: number;
    /** See {@link DEFAULT_ALIGN_MAX_ITERATIONS}. Integer `≥ 1`. */
    readonly alignMaxIterations?: number;
    /** See {@link DEFAULT_ALIGN_EPSILON}. Finite, `> 0`. */
    readonly alignEpsilon?: number;
    /** See {@link DEFAULT_PHOTOMETRIC}. */
    readonly photometric?: boolean;
    /** See {@link DEFAULT_TUKEY_C}. Finite, `> 0`. */
    readonly tukeyC?: number;
    /** See {@link DEFAULT_FIT_MAX_ITERATIONS}. Integer `≥ 1`. */
    readonly fitMaxIterations?: number;
    /** See {@link DEFAULT_FIT_EPSILON}. Finite, `> 0`. */
    readonly fitEpsilon?: number;
    /** See {@link DEFAULT_MIN_TRACKED_PATCHES}. Integer `≥ 4`. */
    readonly minTrackedPatches?: number;
    /** See {@link DEFAULT_MAX_OUTLIER_SHARE}. In `[0, 1)`. */
    readonly maxOutlierShare?: number;
    /** See {@link DEFAULT_MAX_PATCH_RESIDUAL}. `> 0`, `Infinity` allowed. */
    readonly maxPatchResidual?: number;
    /**
     * A clock in milliseconds, e.g. `() => performance.now()`. When given,
     * every result carries {@link TrackTimings}; the tracker reads no clock of
     * its own (ADR-0001 point 7).
     */
    readonly clock?: () => number;
}

/** Where a frame's time went, ms, by the `clock` option. */
export interface TrackTimings {
    /** The whole `process` call. */
    readonly totalMs: number;
    /** The detection pipeline, pose included, when it ran this frame; else 0. */
    readonly detectMs: number;
    /**
     * The tracking step when it ran — prediction, cull, pyramid, alignment,
     * fit, judgement; the pose (a backend call) is not in it. On `"TRACK"`
     * frames, ADR-0001 point 5's "tracker-side TypeScript compute in the
     * tracking state". Else 0.
     */
    readonly trackMs: number;
    /** Part of `trackMs` building the frame pyramid: ADR-0001 point 3's first candidate for the backend. */
    readonly pyramidMs: number;
    /** Part of `trackMs` in `alignPatch`. */
    readonly alignMs: number;
    /** Part of `trackMs` in `robustHomography`. */
    readonly fitMs: number;
}

/** Fields every result carries in M2, on both branches. */
interface TrackingFields {
    /**
     * Why the lock this frame started with was dropped; `null` if it held, or
     * there was none. A frame that drops its lock is detected again at once,
     * so this can accompany a `"DETECT"` result as well as a `"LOST"` one.
     */
    readonly trackLoss: TrackLoss | null;
    /** The tracking step's patch counts, when one ran this frame; else `null`. */
    readonly tracking: TrackStats | null;
    /** `null` without the `clock` option. */
    readonly timings: TrackTimings | null;
}

export type TrackResult =
    | (TrackingFields & { /* M1's ok: true fields, unchanged; add to the docs of
          `numMatches`/`numInliers`/`sceneKeypoints`: on "TRACK" they are the
          correspondences fitted, the fit's weight > 0 count, and empty */ })
    | (TrackingFields & { /* M1's ok: false fields, unchanged */ });
```
In the class:

```ts
const NO_KEYPOINTS: readonly Keypoint[] = Object.freeze([]);

type Detected = Omit<Extract<TrackResult, { ok: true }>, keyof TrackingFields>
    | Omit<Extract<TrackResult, { ok: false }>, keyof TrackingFields>;

export class NftTracker {
    // …M1's fields…
    /** Whether every frame runs detection, never tracking. See the class notes. */
    readonly detectionOnly: boolean;
    private readonly track: TrackTarget | null;
    private readonly trackOptions: TrackFrameOptions;
    private readonly clock: (() => number) | null;
    /** The last two homographies while locked: `previous` is `null` right after a detection. */
    private lock: { readonly previous: Mat3 | null; readonly current: Mat3 } | null = null;

    constructor(cv, target, K, options?) {
        // …M1's body, unchanged…
        const o = resolveTrackingOptions(options);   // throws RangeError naming the option
        this.trackOptions = o.track;
        this.clock = o.clock;
        const p = target.patches;
        this.track =
            !o.detectionOnly && p !== undefined && p.patchSize >= 3 && p.count >= o.track.minTrackedPatches
                ? trackTarget(p, target.pyramid.scaleStep)
                : null;
        this.detectionOnly = this.track === null;
    }

    process(frame: GrayImage, timestampMs: number): TrackResult {
        const clock = this.clock;
        const start = clock === null ? 0 : clock();
        let trackLoss: TrackLoss | null = null;
        let tracking: TrackStats | null = null;
        let step: TrackStepTimings | null = null;
        if (this.lock !== null && this.track !== null) {
            const r = trackFrame(frame, this.track, this.lock.previous, this.lock.current, this.trackOptions, clock);
            tracking = r.stats;
            step = r.timings;
            if (r.ok) {
                this.lock = { previous: this.lock.current, current: r.H };
                const pose = this.cv.poseFromHomography(r.H, this.K);
                return {
                    ok: true, state: "TRACK", quality: r.quality, timestampMs,
                    numMatches: r.stats.observed, numInliers: r.stats.inliers,
                    H: r.H, pose, sceneKeypoints: NO_KEYPOINTS,
                    trackLoss: null, tracking, timings: this.timings(start, 0, step),
                };
            }
            trackLoss = r.loss;
            this.lock = null;
        }
        const detectStart = clock === null ? 0 : clock();
        const detected = this.detect(frame, timestampMs);
        const detectMs = clock === null ? 0 : clock() - detectStart;
        if (detected.ok && this.track !== null) this.lock = { previous: null, current: detected.H };
        const fields = { trackLoss, tracking, timings: this.timings(start, detectMs, step) };
        return detected.ok ? { ...detected, ...fields } : { ...detected, ...fields };
    }

    /** M1's whole pipeline, moved here unchanged: detect, describe, match per level, filter, estimate, pose. */
    private detect(frame: GrayImage, timestampMs: number): Detected {
        // The body of M1's process(), current tracker.ts lines 197-274,
        // moved verbatim: its three return objects are exactly `Detected`.
    }

    private timings(start: number, detectMs: number, step: TrackStepTimings | null): TrackTimings | null {
        if (this.clock === null) return null;
        return {
            totalMs: this.clock() - start,
            detectMs,
            trackMs: step?.trackMs ?? 0,
            pyramidMs: step?.pyramidMs ?? 0,
            alignMs: step?.alignMs ?? 0,
            fitMs: step?.fitMs ?? 0,
        };
    }
}

/** The M2 options, defaulted and checked: a value out of its domain is a contract violation, reported at construction. */
function resolveTrackingOptions(options: NftTrackerOptions | undefined): {
    detectionOnly: boolean; clock: (() => number) | null; track: TrackFrameOptions;
} {
    const o = options ?? {};
    const integer = (name: string, v: number, lo: number, hi = Infinity) => {
        if (!(Number.isInteger(v) && v >= lo && v <= hi)) throw new RangeError(`NftTracker: ${name} must be an integer in [${lo}, ${hi}], got ${v}`);
        return v;
    };
    const positive = (name: string, v: number, allowInfinity = false) => {
        if (!(v > 0 && (allowInfinity || Number.isFinite(v)))) throw new RangeError(`NftTracker: ${name} must be ${allowInfinity ? "" : "finite and "}> 0, got ${v}`);
        return v;
    };
    const flag = (name: string, v: unknown) => {
        if (typeof v !== "boolean") throw new RangeError(`NftTracker: ${name} must be a boolean, got ${String(v)}`);
        return v;
    };
    const share = o.maxOutlierShare ?? DEFAULT_MAX_OUTLIER_SHARE;
    if (!(share >= 0 && share < 1)) throw new RangeError(`NftTracker: maxOutlierShare must be in [0, 1), got ${share}`);
    if (o.clock !== undefined && typeof o.clock !== "function") throw new RangeError(`NftTracker: clock must be a function, got ${String(o.clock)}`);
    return {
        detectionOnly: flag("detectionOnly", o.detectionOnly ?? false),
        clock: o.clock ?? null,
        track: {
            maxFrameLevels: integer("maxFrameLevels", o.maxFrameLevels ?? DEFAULT_MAX_FRAME_LEVELS, 1, 256),
            align: {
                maxIterations: integer("alignMaxIterations", o.alignMaxIterations ?? DEFAULT_ALIGN_MAX_ITERATIONS, 1),
                epsilon: positive("alignEpsilon", o.alignEpsilon ?? DEFAULT_ALIGN_EPSILON),
                photometric: flag("photometric", o.photometric ?? DEFAULT_PHOTOMETRIC),
            },
            fit: {
                maxIterations: integer("fitMaxIterations", o.fitMaxIterations ?? DEFAULT_FIT_MAX_ITERATIONS, 1),
                tukeyC: positive("tukeyC", o.tukeyC ?? DEFAULT_TUKEY_C),
                epsilon: positive("fitEpsilon", o.fitEpsilon ?? DEFAULT_FIT_EPSILON),
            },
            minTrackedPatches: integer("minTrackedPatches", o.minTrackedPatches ?? DEFAULT_MIN_TRACKED_PATCHES, 4),
            maxOutlierShare: share,
            maxPatchResidual: positive("maxPatchResidual", o.maxPatchResidual ?? DEFAULT_MAX_PATCH_RESIDUAL, true),
        },
    };
}
```
The "not detected" branch of `detect` returns M1's objects minus nothing: every M1 field stays as it was. `resolveTrackingOptions` runs **before** M1's `chooseDescriptorSet` call, so a bad option is reported even with a mismatched target.

`src/index.ts`: add the ten `DEFAULT_*` constants to the `./tracker.js` export. Add `TrackTimings` to its type export. Add `export type { TrackLoss, TrackStats } from "./tracking/track_frame.js";`.

- [ ] **Step 4: Run the new suite, the M1 suites and parity**

Run: `npx vitest run packages/nft-tracker/test/tracker_options.test.ts packages/nft-tracker/test/tracker.test.ts packages/nft-tracker/test/parity.test.ts packages/nft-tracker/test/wnft_roundtrip.test.ts`
Expected: PASS, all. `git diff --stat dev -- packages/nft-tracker/test/parity.test.ts packages/nft-tracker/test/tracker.test.ts` prints nothing.

- [ ] **Step 5: Gates for the package, then commit**: `feat(nft-tracker): LOST -> DETECT -> TRACK in NftTracker`

```bash
npm run build && npm run typecheck && npm test -w @webarkit/nft-tracker && npm run format:check
```
The body covers: the default mode and the two detection-only routes; same-frame re-detection; the velocity policy; the result's new fields; and that the parity and tracker suites are unchanged.

---

### Task 5: The tracker on synthetic sequences

**Files:**
- Test: `packages/nft-tracker/test/tracker_state_machine.test.ts`

**Interfaces:**
- Consumes: `NftTracker` (Task 4); `pinballTrackingTarget` (Task 2); `view`, `renderWarp`, `project` (#63's generator); `withSeededRandom`.

- [ ] **Step 1: Write the sequences and the tests.** Setup:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import type { NftTrackerOptions, TrackResult } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import type { TargetDb } from "../src/target/types.js";
import { trackTarget } from "../src/tracking/track_frame.js";
import { PINBALL_STEP, pinballPatches, pinballTrackingTarget } from "./fixtures/tracking_target.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";
import { project, renderWarp, view } from "./fixtures/warped_frames.js";

/** The reference device's camera path: 270 × 360 grey frames, the target at about 0.45. */
const CAMERA = { width: 270, height: 360 };
const SEED = 20260925;
const image = readPgm(TARGET_FIXTURE);

interface Pose { scale: number; angle: number; shift: [number, number]; perspective?: [number, number] }

/** One frame of a path: #63's generator, one pass of blur, σ = 2 noise, a drifting exposure. */
function frameAt(pose: Pose, i: number): { frame: GrayImage; H: Mat3 } {
    const H = view({ target: image, frame: CAMERA, ...pose });
    const frame = renderWarp(image, H, {
        ...CAMERA, blurPasses: 1, noiseSigma: 2,
        gain: 1 + 0.08 * Math.sin(i / 5), bias: 6 * Math.sin(i / 7), seed: i + 1,
    });
    return { frame, H };
}

/** A slow hand-held wander that starts at rest: shift ≤ 20 px, 10° of roll, ±6% scale, mild tilt. */
function wander(i: number): Pose {
    const c = (period: number) => 1 - Math.cos(i / period);
    return {
        scale: 0.45 + 0.03 * c(7),
        angle: ((5 * Math.PI) / 180) * c(11),
        shift: [10 * c(8), 8 * c(10)],
        perspective: [0.0003 * c(9), -0.0002 * c(13)],
    };
}

const smoothstep = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

/** Rest 10 frames, slide 260 px right over 40 (fully out past 250), stay out 6, slide back over 40, rest 10. */
function leaveAndReturn(i: number): Pose {
    const x = i < 10 ? 0 : i < 50 ? 260 * smoothstep((i - 10) / 40) : i < 56 ? 260 : i < 96 ? 260 * (1 - smoothstep((i - 56) / 40)) : 0;
    return { scale: 0.45, angle: 0, shift: [x, 0] };
}

/** At rest for 5 frames, then moving right at `v` px/frame: the first moving frame's prediction is off by `v`. */
const velocityStep = (v: number) => (i: number): Pose => ({ scale: 0.45, angle: 0, shift: [i < 5 ? 0 : v * (i - 4), 0] });

function run(target: TargetDb, path: (i: number) => Pose, n: number, options?: NftTrackerOptions) {
    const tracker = new NftTracker(cv, target, K, options);
    const truths: Mat3[] = [];
    const { value: results } = withSeededRandom(SEED, () =>
        Array.from({ length: n }, (_, i) => {
            const { frame, H } = frameAt(path(i), i);
            truths.push(H);
            return tracker.process(frame, i * 33);
        }),
    );
    const states = results.map((r) => r.state[0]).join("");   // "D", "T", "L"
    return { results, truths, states };
}

const patchCentres = trackTarget(pinballPatches(), PINBALL_STEP).centres;

/** RMS, frame px, over the 64 patch centres of the target, between two homographies. */
function centreRms(A: Mat3, B: Mat3): number {
    let s = 0;
    for (let i = 0; i < patchCentres.length; i += 2) {
        const [ax, ay] = project(A, patchCentres[i], patchCentres[i + 1]);
        const [bx, by] = project(B, patchCentres[i], patchCentres[i + 1]);
        s += (ax - bx) ** 2 + (ay - by) ** 2;
    }
    return Math.sqrt(s / (patchCentres.length / 2));
}

/** Like `run`, but each frame gets its own freshly seeded RANSAC, so one frame can be compared with a fresh tracker's. */
function runSeededPerFrame(t: TargetDb, path: (i: number) => Pose, n: number, options?: NftTrackerOptions) {
    const tracker = new NftTracker(cv, t, K, options);
    return Array.from({ length: n }, (_, i) => {
        const { frame } = frameAt(path(i), i);
        return { frame, result: withSeededRandom(SEED + i, () => tracker.process(frame, i * 33)).value };
    });
}

let cv: CvBackend;
let K: Mat3;
let target: TargetDb;
beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    K = intrinsics(CAMERA.width, CAMERA.height);
    target = pinballTrackingTarget(cv);
});
```

Tests:

(a) **Locks, then follows** (the headline). `run(target, wander, 40)`. Assert:
  - `states === "D" + "T".repeat(39)`;
  - on every TRACK frame: `tracking.frameLevels === 1`, `sceneKeypoints.length === 0`, `trackLoss === null`, `numMatches === tracking.observed`, `numInliers === tracking.inliers`;
  - `centreRms(H, truth)` over the 39 TRACK frames: median and max pinned by the global rule, and the frame-0 DETECT error printed beside them (spike S2: ~1.0 px). That shows what tracking takes the error from.
  - Name: `"locks on frame 0 and tracks 39 of 39 frames of a slow wander, within <median> px RMS (worst <max>)"`.

(b) **Deterministic.** Two `run(target, wander, 40)` calls, each under its own `withSeededRandom(SEED)` (inside `run`), give the same `states` and `Array.from(H)` for every frame.

(c) **Detection-only reproduces M1 frame by frame.**
  - `run(target, wander, 6, { detectionOnly: true })` gives `states === "DDDDDD"`.
  - `runSeededPerFrame(target, wander, 6, { detectionOnly: true })`: for each frame i, `withSeededRandom(SEED + i, () => new NftTracker(cv, target, K).process(frame, i * 33))` on a fresh tracker returns the same `Array.from(H)`, `numMatches` and `numInliers`. That is, the mode carries nothing between frames.
  - Also for a patchless target (`buildTargetFromImage(cv, image, { levels: 8 })`) under the default options: `states === "DDDDDD"` and `tracking === null` on every frame.

(d) **Loses the target when it leaves the frame, then re-acquires it.** `run(target, leaveAndReturn, 106)`. Property assertions, which must hold before any pinning:
  - `states[0] === "D"` and `states.slice(1, 10) === "TTTTTTTTT"`;
  - every frame in which no patch centre is inside the frame (`i` in 50–55) is `"L"`;
  - the first non-TRACK frame after frame 10 carries `trackLoss === "too-few-patches"`;
  - the last 10 frames are `"T"`.

  Then pin the whole `states` string exactly. Say in the name how many frames were DETECT during the return: re-acquisition at speed re-detects until the motion drops below the survivable prediction error, since the first prediction after a detection has no velocity.

(e) **Survives a velocity step of up to 3.5 px/frame** (the request's point 4, in practice). `run(target, velocityStep(v), 15)` for `v ∈ {2, 3, 3.5, 4, 6}`.
  - Expected: `"D" + "T".repeat(14)` for v ≤ 3.5.
  - For 6: frame 5 fails, with `trackLoss` in {"too-few-patches", "fit-failed", "too-many-outliers"}. Then each frame re-detects while the motion lasts.
  - Pin all five strings.
  - Name: `"survives a sudden velocity change of 3.5 px/frame; at 6 px/frame the lock breaks and every moving frame re-detects"`.

(f) **Review focus 1 — another frame size while locked.** Lock on `frameAt(wander(0), 0)`. Then pass a 360 × 270 render of the same target (`view` with `frame: { width: 360, height: 270 }`).
  - The result is never `"TRACK"` with `centreRms(H, truth360) >= 1`: either it tracks correctly or it re-detects. Pin the state and `trackLoss`.

(g) **Review focus 2 — a covered lens while locked.** Lock as in (f), then a frame of 128 everywhere.
  - The result is `"LOST"`, `trackLoss === "too-few-patches"`, `tracking.lost === tracking.attempted`, `reason` from detection.
  - The next real frame re-detects (`"D"`).

(h) **Review focus 4 — an invalid frame while locked.** Lock as in (f), then `{ data: new Uint8Array(10), width: 270, height: 360 }`: `expect(() => tracker.process(bad, 0)).toThrow(RangeError)`.

- [ ] **Step 2: Run.** The properties in (a)–(h) must hold as written. If one does not, stop and use `superpowers:systematic-debugging` (for instance, if the wander loses its lock, find which frame and why before touching anything). Once they hold, pin the measured strings and errors, stating each measured value in its test.

Run: `npx vitest run packages/nft-tracker/test/tracker_state_machine.test.ts --reporter=verbose --disableConsoleIntercept`
Expected after pinning: PASS. Suite time is dominated by rendering, a few seconds; give each `it` a 60 s timeout.

- [ ] **Step 3: Commit**: `test(nft-tracker): the state machine on synthetic camera-path sequences`. The body lists every pinned figure: the lock/follow error, the leave/return string, and the velocity-step strings.

---

### Task 6: Say what M2 is, and what it is not yet

**Files:**
- Modify: `packages/nft-tracker/src/tracker.ts` (the class doc comment; the `TrackResult` doc's "Until M2's state machine lands…" sentence)
- Modify: `packages/nft-tracker/src/target/build_from_image.ts:44-47`
- Modify: `packages/nft-tracker/README.md` (intro paragraph; "The tracker"; "The M2 tracking state: in progress")
- Modify: `README.md` (the `nft-tracker` row)

- [ ] **Step 1: The class doc comment.** Replace M1's with the following. Every number in it is one a test pins; update each to the pinned value.

```ts
/**
 * The NFT tracker: find a trained planar target in a camera frame, then follow it.
 *
 * **LOST → DETECT → TRACK (milestone M2).** A frame without a lock runs the
 * detection pipeline of M1 — detect the frame at one level, describe, match
 * the target one pyramid level at a time, optionally filter, estimate a
 * homography, decompose it — and a detection that succeeds locks the tracker
 * on its homography. A frame with a lock runs none of detect, describe or
 * match: it predicts this frame's homography from the last two
 * (`predictHomography`), aligns the target's patches (§5.7) where the
 * prediction puts them (`alignPatch`, on a frame pyramid built once and only
 * as deep as the patches start), fits a homography to them
 * (`robustHomography`) and judges it (`trackFrame`). A step that fails drops
 * the lock, says why (`trackLoss`), and the same frame is detected again; a
 * detection that fails is `"LOST"`.
 *
 * **Detection-only.** With `detectionOnly`, or a target that cannot be
 * tracked — no patches ("the tracker then runs in detection-only mode",
 * §5.7), fewer than `minTrackedPatches`, or smaller than 3 × 3 — every frame
 * is detected from scratch and nothing is carried between frames: exactly
 * M1, which the parity test checks unchanged. `detectionOnly` says which.
 *
 * **Known limitation: re-acquisition is synchronous.** A frame that detects
 * blocks for about the stateless cost — ~109 ms p50 on the reference
 * device's camera path (docs/benchmarks/README.md, "Webcam: `acquire`
 * without a video decoder") against a 33 ms frame budget. Asynchronous
 * detection is M3 (#48's numbering).
 *
 * **What tracking survives**, measured on synthetic camera-path frames
 * (270 × 360, pinball at 0.45; tracker_state_machine.test.ts,
 * track_frame.test.ts): a prediction up to <3.5> px off, <3>° of roll or
 * <5>% of scale; a sudden velocity change of <3.5> px per frame. The first
 * prediction after a detection has no velocity, and the second's carries the
 * detection's own error (about 1 px RMS on those frames), so fast motion
 * keeps re-detecting until it slows.
 *
 * **Patch levels are the first thing the tuning pass should revisit.** Every
 * patch of `examples/targets/pinball.wnft` comes from level 0, and on the
 * camera path the target is seen at about half that scale: each patch is
 * sharper than the frame it is aligned in. That is why the basin is the
 * narrow one (90% converging from 2 px, 74% from 3) and why residual and
 * gain cannot tell a wrong alignment from a right one there
 * (`DEFAULT_MAX_PATCH_RESIDUAL` is off). Patches at the level the target is
 * viewed at measured a wider basin and a residual gate that works.
 *
 * Portability rules it keeps (ADR-0001 point 7): no DOM, no timers, no
 * `requestAnimationFrame`, no camera access and no clock — the application
 * owns the loop, hands in a `GrayImage` and a timestamp, and may hand in a
 * `clock` to have each result timed; results are explicit `{ ok, ... }`
 * values, never exceptions (a frame that is not a `GrayImage` and options out
 * of their domain are contract violations, and throw).
 *
 * **On determinism.** (M1's paragraph, kept, plus:) The tracking state draws
 * nothing: a sequence of frames gives the same states and homographies,
 * bit for bit, for the same RANSAC draws in its detections.
 */
```
(`<…>` marks the four figures Task 3 (e)/(f) and Task 5 (e) pin; write the pinned values.)

- [ ] **Step 2: The rest of the prose**
  - `TrackResult`'s doc: drop "Until M2's state machine lands, `process` runs detection on every frame, so it reports only `"DETECT"` and `"LOST"`." Add the TRACK meanings of `numMatches`, `numInliers` and `sceneKeypoints`.
  - `build_from_image.ts:44-47`: "Synthetic views, tracking patches and a stored reference image belong to milestone M4; none of them is written here" becomes "Tracking patches are `compile-target`'s to add (`selectPatches`, M2); synthetic views and a stored reference image belong to later milestones. None of them is written here".
  - `packages/nft-tracker/README.md`:
    - The intro paragraph: M2 is now the state machine, not "still to come".
    - "The tracker": the TRACK row loses "Not produced yet". Add a paragraph on detection-only, `trackLoss`, `tracking`, `timings`/`clock`, the new options table (name, default, provisional), and the known limitation.
    - Rename "The M2 tracking state: in progress" to "The M2 tracking state". Its sentence "the state machine that calls them per frame is not [implemented]" is now false.
  - `README.md`: the `nft-tracker` row's "The tracking state machine that puts them together is still to come ([#48]…)" becomes a sentence saying it exists. It tracks a compiled target (LOST → DETECT → TRACK), with detection-only kept.

- [ ] **Step 3: Gates, then commit**: `docs(nft-tracker): describe the M2 state machine and its known limitation`

---

## Finishing

- [ ] **Verification.** Use `superpowers:verification-before-completion`. From a clean tree run every gate in Global Constraints, and **paste their output** into the conversation, not a summary. Then:
  - `git diff dev -- packages/nft-tracker/test/parity.test.ts` must be empty;
  - `git diff --stat dev -- packages/cv-backend-spec packages/nft-tracker/src/tracking/types.ts docs/specs` must be empty;
  - `node packages/nft-tracker/bin/validate-target.mjs examples/targets/pinball.wnft` must report the file valid and usable.
- [ ] **Review.** Use `superpowers:requesting-code-review` and dispatch the **`nft-reviewer`** agent over `git diff dev...feat/nft-state-machine`. Points for its attention:
  - whether each threshold's default is argued or merely asserted;
  - the per-patch outcome policy against align_patch.ts point 6;
  - the 45%/8 reasoning against #64's measurement;
  - that `src/` reads no clock and imports no backend;
  - that `frameLevelsFor` cannot build fewer levels than alignment starts on;
  - that the parity test and `types.ts` are untouched.
- [ ] **Address the review** with `superpowers:receiving-code-review`; re-run the gates.
- [ ] **Land it** with `superpowers:finishing-a-development-branch`: a PR to **`dev`**. The body, in English:
  - what the PR delivers, commit by commit;
  - commit 1's measured change, with the #65 framing (position hardly moves; gain and residual do, and those are what the state machine reads);
  - why §11 is not revised;
  - the state machine and its decisions (the list above);
  - the pinned figures;
  - **the known limitation**: re-acquisition is synchronous, about the stateless cost (~109 ms on the reference device, camera path), and asynchronous detection is M3;
  - the prediction error the tracker survives;
  - patch levels as the tuning pass's first item;
  - the cost expectation for step 4, clearly labelled as a Node figure and not a device one. A tracking frame builds no pyramid on the camera path (1 level), and aligns 64 patches in ≈ 4–4.7 ms in Node, which the gray-loop proxy puts well above the ~10 ms. That makes the patch budget, not the pyramid, the thing to measure first;
  - the corrections (5.6–7.5 ms, not 5.9–7.1; "step 4/5" read as #48's Evaluation items);
  - left for later: the tuning pass; `bench-nft.html`'s tracking mode; #65's 0.3 rev 2 and the Q11 decision; the detection's level-dependent offset (below); Issue #48's Oppo A72 measurement, which conflicts with the standing instruction to bench on `Tab_9_WiFi` only and is not this PR's to settle.

  End the body with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

## Found along the way, not fixed here

- **A level-dependent offset in the detected homography.** On synthetic camera-path frames the detected H is ~1 px RMS off at the patch centres. Once its mean is removed, only 0.19–0.48 px of scatter is left. The mean grows as the frame's scale matches a coarser target level: 0.66 px RMS at L1's scale, 1.17 px at L3's. That is 2–3× the D2 half-pixel term. Tracking corrects it on the first TRACK frame, but it seeds the first velocity. Worth its own issue: where coarse-level keypoints' coordinates come from, in `cv-backend-jsfeatnext` or in `buildTargetFromImage`.
- **`SelectPatches`' wording in types.ts** still asks for all of a target's levels, while `compile-target` passes a prefix. #62 proposed the rewording; it is a `types.ts` change, out of scope here.
