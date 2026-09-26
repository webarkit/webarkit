# `@webarkit/nft-tracker`

Natural-feature tracking for planar image targets, written **above** the
[`CvBackend` contract](../cv-backend-spec) — the backend is injected by the
caller, so this package runs on any implementation of it.

> **Not published to npm, and pre-0.1.** Develop against it from the monorepo:
> `npm install` at the root symlinks the workspace packages together.

What exists today is the **target layer** — the in-memory shape of a trained
target, the codec for the `.wnft` files that store one, and
[`compile-target`](#compiling-a-target), which turns an image into such a file
— plus the tracker itself, `NftTracker`, now at **milestone M2**: a
`LOST → DETECT → TRACK` state machine
([ADR-0001](../../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md),
[#48](https://github.com/webarkit/webarkit/issues/48)). A frame without a lock
runs M1's `detect → describe → match → estimateHomography →
poseFromHomography`; a frame with one tracks the target's patches instead,
with `predictHomography`, `buildFramePyramid`, `alignPatch` and
`robustHomography`, and runs none of detect, describe or match. A target
without patches — anything `buildTargetFromImage` builds — keeps M1's
behaviour exactly: detection on every frame. See [The tracker](#the-tracker).

## The `.wnft` codec

[`docs/specs/nft-target-format.md`](../../docs/specs/nft-target-format.md) is
the source of truth; where this README and the specification disagree, the
specification wins. This build implements **format 0.3** and **container
major 1**.

```ts
import { decode, encode } from "@webarkit/nft-tracker";

const result = decode(await (await fetch("pinball.wnft")).arrayBuffer());
if (!result.ok) {
    // result.error is a code from §6.2; result.detail says which field.
    throw new Error(`${result.error}: ${result.detail}`);
}
for (const warning of result.warnings) {
    console.warn(warning.code, warning.detail);
}
const target = result.target; // a TargetDb
```

**Neither entry point throws.** Both return a result, as ADR-0001 point 7
requires: exceptions are reserved for contract violations, never for a bad
file. A `.wnft` may come from a URL an application's user chose, so a hostile
one has to be data, not an incident.

```ts
type DecodeResult =
    | { ok: true; target: TargetDb; warnings: readonly Warning[] }
    | { ok: false; error: ErrorCode; detail: string };

type EncodeResult =
    | { ok: true; bytes: Uint8Array }
    | { ok: false; error: "INVALID_TARGET"; detail: string };
```

`encode` is the **canonical** writer of §7.3: the same target always produces
the same bytes, and it validates the target against every rule a reader
applies *before* writing anything — so it never emits a file its own reader
would reject, and never coerces a value to make it serialisable. On failure
`detail` names the offending field path, e.g. `descriptorSets[1].params.seed`.

### Buffers and alignment

`decode` accepts a bare `ArrayBuffer` **or any view of one**:

```ts
decode(buffer);                    // the whole allocation
decode(new Uint8Array(buffer, 3)); // a file embedded at an unaligned offset
```

The view form is not a convenience. Arrays are read as zero-copy views into
the file wherever the alignment permits, and a file that does not start at an
8-aligned address — one embedded in a larger buffer, or in a WASM module —
puts its arrays at addresses JavaScript refuses to view. The codec detects
that and copies the affected arrays instead (§3); without the view form that
path would be unreachable.

### Resource limits

The defaults of §6.4, all overridable per call:

| Limit | Default |
|---|---|
| `maxFileBytes` | 64 MiB |
| `maxManifestBytes` | 1 MiB |
| `maxLevels` | 32 |
| `maxKeypoints` | 1 000 000 |
| `maxDescriptorSets` | 16 |
| `maxPatchSize` | 64 |

```ts
decode(bytes, { limits: { maxKeypoints: 50_000 } });
```

They are checked before anything is allocated in proportion to them — the
file-size limit before a single byte is read, which is why an oversized file
reports `LIMIT_EXCEEDED` rather than `BAD_MAGIC` even when it is not a `.wnft`
at all.

### Two things this does not do

- **It does not choose a descriptor set for a backend.** §6.3's selection
  intersects an application's preference order with a backend's
  `capabilities`, and probes the runtime backend for the descriptor width.
  That belongs to the tracker, which is where the backend is. Hence the codec
  never returns `NO_USABLE_DESCRIPTORS` or warns `PRODUCER_MISMATCH`.
- **It does not implement `WKNF_multiview`.** The format side is settled
  (§5.6), but adoption is blocked on k-nearest matching in the contract
  (§11, Q3), so claiming it would promise a ratio test this package cannot
  perform. A file with that name in `extensionsRequired` is rejected with
  `UNSUPPORTED_EXTENSION` rather than half-read, and one that merely lists it
  in `extensionsUsed` is ignored with `UNKNOWN_EXTENSION_IGNORED`.

## Compiling a target

`bin/compile-target.mjs` is the offline half: an image in, a `.wnft` out. It is
`buildTargetFromImage` with `@webarkit/cv-backend-jsfeatnext`, then
`selectPatches` for the §5.7 tracking patches, then `encode`, run from a command
line instead of from a page.

> **Repo-local dev tooling, not part of the package.** `bin/` names a concrete
> backend and a JPEG decoder, and both are **dev**Dependencies — the package
> itself stays backend-free, as ADR-0001 point 2 requires, and the library's own
> `src/` imports neither. There is no `bin` field in `package.json` and nothing
> here is published; run it from the monorepo.

```bash
npm run build                                  # the script imports dist/
node packages/nft-tracker/bin/compile-target.mjs examples/images/pinball.jpg \
    -o examples/targets/pinball.wnft --physical-size 210x262.5
```

The npm script is equivalent, and takes its paths the same way:

```bash
npm run compile-target -w @webarkit/nft-tracker -- examples/images/pinball.jpg \
    -o examples/targets/pinball.wnft --physical-size 210x262.5
```

Both read relative paths as relative to **where you typed the command**, which
takes a small deliberate effort: npm runs a workspace script with the cwd set to
the package, so without it `-o examples/targets/pinball.wnft` would land in
`packages/nft-tracker/` — quietly, reporting the path you asked for. The script
resolves against npm's `INIT_CWD` instead, and falls back to the cwd when it is
unset, which is exactly the case where the cwd is already the right answer.

| Option | Default | What it decides |
|---|---|---|
| `-o`, `--out` | *required* | where the `.wnft` goes |
| `--levels` | 8 | pyramid levels searched on the reference image |
| `--keypoints` | `levels * 260` | total keypoint budget |
| `--scale-step` | `2^(1/3)` | size ratio between levels; must be `> 1` |
| `--physical-size` | unknown | `<W>x<H>` in millimetres, both `> 0` (§5.3). Left out, model-plane units stay level-0 pixels (§3) |
| `--max-side` | 640 | cap on the image's longer side |
| `--seed` | 0 | RNG seed, recorded in `info.compiler` and enforced during the build |
| `--name` | the image's base name | `info.name` |
| `--patches` | 64 | tracking-patch budget; `0` compiles a detection-only target with no `patches` section |
| `--patch-size` | 16 | patch edge `P`, at least 3 |
| `--patch-levels` | 3 | how many of the finest pyramid levels patches may come from |
| `--patch-min-score` | 25 | minimum Shi–Tomasi score, (grey levels / level-0 px)² |
| `--patch-spacing` | `0.75 * sqrt(W * H / patches)` | minimum distance between patch centres, level-0 px (54 on pinball) |

Three of those deserve a word.

**`--max-side` decides the target's coordinate space.** Keypoints are stored in
level-0 pixels, so a page that draws them over the image it loaded must cap that
image the same way. 640 is the demos' own cap, which is why it is the default.

**`--seed` changes no target *data* today, and is not decorative.** Keep the two
apart, because the file is not the data:

- **The target data is unaffected.** No stage of the compile draws randomness,
  so the keypoints, the descriptors and the pyramid are the same at any seed.
- **The file still changes**, because the seed is recorded in `info.compiler` as
  provenance. Two compiles differing only in `--seed` therefore produce
  different bytes — same target, different manifest.

What makes the file reviewable as a diff is not that the seed is inert, it is
that everything is: fixed image, fixed options, fixed bytes, no clock
(`info.createdAt` is deliberately never written).

The seed is *enforced* rather than merely stored: the build runs with
`Math.random` replaced by a seeded generator and the script reports the number
of draws (`0`, so far). A backend that starts drawing therefore stays
reproducible instead of quietly making every recompile a new file — and when
that day comes, the seed will be changing target data too, which is the case
this option exists for.

**The patch options are first choices, not tuned values.** Each default's
reason, and what it was measured on, is written where it is defined in
`bin/compile-target.mjs`; the M2 tuning pass, which can measure alignment, is
expected to revise them. The score is defined in
[`src/tracking/select_patches.ts`](./src/tracking/select_patches.ts): the
smaller eigenvalue of the mean structure tensor of a window's interior, in
level-0 units so patches from different levels compete fairly. Fewer than four
qualifying patches is an error that names `--patches 0` as the way out, not a
target silently compiled without tracking.

**Selection scores every window, so the compiler caps them.** A combination of
image size, `--patch-levels` and `--patch-size` that would score more than
2^23 windows (about 250 MB and 5 s at worst) is refused before detection runs,
with the numbers and what to change: a smaller `--max-side` or fewer
`--patch-levels`. The default 640-px cap at three levels is about 0.63 M
windows. The bound is the compiler's, not `selectPatches`', because selection
runs offline on an image the developer chose; that changes when targets are
compiled in the browser from arbitrary images (M5), and the function's own
comment records it.

The level images patches are cut from are built by `buildFramePyramid`, the
function the tracker builds the live frame's pyramid with, so a stored patch
and the frame level it is aligned on were filtered alike (format spec §11,
Q11). `info.compiler.patchPyramid` names it. Files compiled before this used a
stand-in box filter and say so there. On pinball the switch replaced the one
level-1 patch with a level-0 window 0.87 px away, so all 64 patches are now
level 0.

[`examples/targets/pinball.wnft`](../../examples/targets) is one such target,
committed, and the static demo can load it instead of building its own.

## Validating a target

`bin/validate-target.mjs` is the other half of the offline tooling, and it
answers **two** questions rather than one:

- **Is the file valid?** `decode` against the specification — a §6.2 error code
  when it is not, and any §6.2 warnings when it is.
- **Can a backend use it?** §6.3 selection against a real backend's
  `capabilities`. This is the half worth having, because **a valid file can be
  unusable**: `NO_USABLE_DESCRIPTORS` is an outcome of *selection*, not of
  decoding — §8.1 exempts it by name from "one fixture per error code", because
  no file produces it on its own. If a target decodes cleanly and still never
  tracks, this is the first thing to run.

```bash
npm run build                                  # the script imports dist/
node packages/nft-tracker/bin/validate-target.mjs examples/targets/pinball.wnft
```

```
examples/targets/pinball.wnft
  decode      ok, format 0.3
  target      512x640, 8 levels, 2062 keypoints, 64 patches
  physical    210 x 262.5 mm
  set         orb/hamming/bits/256 by jsfeatnext, 2062 rows, 32 B each
  usable      yes on 'jsfeatnext' via orb/hamming/256 (probe: 32 B/descriptor, hamming)
```

The npm script is equivalent and reads relative paths the same way — relative
to where you typed the command, via `INIT_CWD`, for the reason the compile
section gives:

```bash
npm run validate-target -w @webarkit/nft-tracker -- examples/targets/pinball.wnft
```

| Option | What it does |
|---|---|
| `--decode-only` | check the file against the specification only; load no backend |
| `--json` | the same verdict, machine-readable |
| `-h`, `--help` | usage |

**Exit status:** `0` every file valid and usable, `1` any file invalid or
unusable, `2` bad usage. The three are kept apart on purpose — a bad
command line is not a bad target.

Three things in the output are worth knowing:

- **`skipped`** lines are §6.3 working. A candidate that fails the
  descriptor-width probe is skipped and selection moves on to the next; a
  target whose first set is the wrong width and whose second fits is *usable*.
- **`UNKNOWN`** is not `NO`. It means no candidate could be confirmed because a
  probe would not run — a check that did not happen, reported as such rather
  than dressed up as a pass. It still exits non-zero.
- **`PRODUCER_MISMATCH`** is a warning and never changes the exit status. The
  probe checks descriptor *shape*; two backends can agree on shape and still
  compute different bits, and this is the only signal that they might (§6.3,
  ADR-0001's contract gaps).

## The tracker

```ts
import { NftTracker } from "@webarkit/nft-tracker";

const tracker = new NftTracker(cv, target, K); // backend injected, K = intrinsics
const result = tracker.process(frame, timestampMs); // frame: GrayImage
console.log(result.state, result.quality);
if (result.ok) {
    // result.H maps target level-0 pixels into the frame, row-major 3×3.
}
```

`process` does not throw on a frame it cannot use; `result.ok` narrows the
union. Besides `H`, `pose`, `numMatches`, `numInliers`, `sceneKeypoints` and,
when not `ok`, a `reason`, every result carries:

| `state` | Meaning | `quality`, in `[0, 1]` |
|---|---|---|
| `"DETECT"` | Pose from the detection pipeline (`detect`/`describe`/`match`) | `numInliers / numMatches` |
| `"TRACK"` | Pose from patch tracking: `numMatches` are the patch correspondences fitted, `numInliers` those the fit kept, `sceneKeypoints` is empty | Sum of the robust fit's weights ÷ patches passed to `alignPatch` this frame |
| `"LOST"` | No pose (`ok: false`; `reason` says why) | `0` |

**The state machine.** A frame without a lock runs detection, and a detection
that succeeds locks the tracker on its homography. A frame with a lock predicts
this frame's homography from the last two, aligns the target's patches where
the prediction puts them, fits a homography to them and judges it. A step that
fails drops the lock and says why in `trackLoss` (`"no-prediction"`,
`"too-few-patches"`, `"fit-failed"`, `"too-many-outliers"` or `"poor-fit"`), and
the same frame is detected again; a detection that fails is `LOST`. Every
result also carries `tracking`, the step's patch counts (culled, attempted,
observed, lost, unconverged, rejected, failed) and its fit's outcome (inliers,
`rmsError`, `fitIterations`, and `fitConverged`, false when the fit stopped at
its iteration cap), and `timings`, when a `clock`
option is given: the tracker reads no clock of its own, and reports the
tracking step's time and its frame-pyramid share apart from detection.

**Detection-only.** With `detectionOnly: true`, or a target that cannot be
tracked — no patches (format spec §5.7), fewer than `minTrackedPatches`, or
smaller than 3 × 3 — every frame runs detection and nothing is carried between
frames: exactly M1. `tracker.detectionOnly` says which mode a tracker is in.
Targets from `buildTargetFromImage` carry no patches; `compile-target` writes
them.

**Options.** Every threshold the tracking state judges a frame by is an
option, checked at construction (a value out of its domain throws a
`RangeError` naming it), and every default is **provisional until the M2
tuning pass** (#48). The fixed guards against degeneracy are constants, not
tuning thresholds: `alignPatch`'s floor for a singular patch, and the
numerical singularity tests in `predictHomography` and `robustHomography`
(`SINGULAR_RELATIVE_DET`, `SINGULAR_PIVOT_RATIO`). Each option is
documented, with the measurement behind it, where it is defined in
[`src/tracker.ts`](./src/tracker.ts).

| Option | Default | What it bounds |
|---|---|---|
| `detectionOnly` | `false` | Never track |
| `maxFrameLevels` | 4 | Frame pyramid levels; fewer are built when the patches start on fewer (one on the camera path) |
| `alignMaxIterations`, `alignEpsilon` | 30, 0.01 px | `alignPatch`'s cap and convergence step |
| `photometric` | `true` | Gain and bias estimated per patch |
| `tukeyC`, `fitMaxIterations`, `fitEpsilon` | 4 px, 20, 1e-6 px | `robustHomography`'s cutoff, cap and tolerance |
| `minTrackedPatches` | 8 | Fewest correspondences, and fewest inliers, a frame may fit; up to 12 correspondences the inlier bound refuses before `maxOutlierShare` would, at 13–14 both refuse at the same count |
| `maxOutlierShare` | 0.45 | Share of correspondences the fit may weigh 0: #64's breakdown |
| `maxFitRms` | 0.6 px | The fit's weighted RMS residual |
| `minPatchZncc` | 0.6 | A converged patch's correlation with its window |
| `clock` | none | `() => ms`, for `timings` |

**What it survives**, measured on synthetic frames of the camera path (the
pinball target at 0.45 in 270 × 360; `test/tracking/track_frame.test.ts`,
`test/tracker_state_machine.test.ts`): one tracking step recovers the pose,
within 0.5 px RMS at the patch centres, from a prediction up to 4 px, 3.5° of
roll or 5% of scale off on every render measured, and refuses a prediction
further off in translation rather than accept a wrong pose. A sequence holds
through a sudden velocity change of 4 px per frame, with every tracked frame
within 0.1 px; a slow hand-held wander tracks every frame after the first, to
a median of 0.079 px.

**Known limitations.**

- **Re-acquisition is synchronous.** A frame that detects blocks for about the
  stateless cost, ~109 ms p50 on the reference device's camera path
  ([`docs/benchmarks/README.md`](../../docs/benchmarks/README.md)), against a
  33 ms frame budget. Asynchronous detection is M3 in #48's numbering
  (ADR-0001's action items use an older one).
- **A lock starts with no velocity.** The first prediction after a detection
  is the detection itself, so a target moving faster than about 4 px per frame
  is detected again on every frame until it slows.
- **A sudden rotation or change of scale can be tracked wrong for a frame or two.**
  From 4° of roll, or past 8% of scale, between two frames — on a step with
  no velocity to predict it, such as a lock's first — one step may accept a
  pose 0.55–1.6 px off (4–5° of roll; −4° already, on both views), up to
  9.4 px off (a target shrinking 8–11%) or 3.65 px off (growing 9%, one
  view), returned as `"TRACK"` with a quality of 0.12–0.20 (measured on 5
  renders × 2 views; the tests pin one render, whose worst is 9.19 px, in
  `test/tracking/track_frame.test.ts`). After the scale
  and roll changes measured, the next step came within 0.9 px or refused,
  and the one after within 0.25 px or re-detected. Right fits on as few
  patches also reach a quality of 0.20, so quality flags such a pose without
  separating it; which rule should is the tuning pass's question
  (`DEFAULT_MAX_FIT_RMS` in `src/tracker.ts` has the measurements).
- **A target leaving the frame** is tracked on the few patches still in view
  until too few are left; those last frames extrapolate, up to 1.2 px RMS off
  over the patch centres and 2.5 px at the target's far end.
- **Detection on a partly visible target can succeed far off.** That is M1's
  pipeline, unchanged: on the leave-and-return sequence, a target half out of
  the frame was detected `ok` 10–300 px RMS off, and once 61,615 px off
  (measured in review, not pinned). On that sequence tracking carried none of
  these poses: the next step refused every lock they seeded
  (`tracker_state_machine.test.ts`). The `"DETECT"` result itself is
  returned.
- **Patch levels** are the first thing the tuning pass should revisit: all of
  `examples/targets/pinball.wnft`'s patches are level 0, sharper than the frame
  they are aligned in on the camera path, which narrows the basin.

### The M2 tracking state

The functions a tracking-state frame is built from are defined in
[`src/tracking/types.ts`](./src/tracking/types.ts) and exported, so that the
three M2 implementation branches of
[#48](https://github.com/webarkit/webarkit/issues/48) worked against one fixed
contract; `NftTracker` puts them together per frame. Each records its own
decisions where it is defined: for
`buildFramePyramid` the filter and the Q11 assumption, for `alignPatch` the
warp, what it estimates, the coarse-to-fine schedule, the convergence test and
the cap; for `robustHomography` the initialisation, the scale of Tukey's
weights, the iteration cap, the convergence test, what counts as singular and
why, and its measured outlier breakdown; and for `predictHomography` what
velocity means for a homography, and the first frames after a lock.

| Export | What it does | Status |
|---|---|---|
| `selectPatches` | Compile time: the target's pyramid → the §5.7 `patches` table; `compile-target` writes it | **implemented** |
| `buildFramePyramid` | A grey pyramid of the frame (and of the target, at compile time) | **implemented** |
| `alignPatch` | Aligns one patch in the frame by IC-LK → a `PatchObservation` | **implemented** |
| `robustHomography` | IRLS with Tukey's biweight over the patch correspondences → `H` and per-patch weights. Deterministic: starts from the prediction, no RANSAC | **implemented** |
| `predictHomography` | Constant-velocity prediction of the next frame's `H`: the last frame-to-frame motion, applied once more | **implemented** |
| `levelScale` | `s_l`, a pyramid level's scale, computed the way the backend computes it | **implemented** |

The rules every implementation keeps are stated once, in that file's header:
§3 coordinates, pure and deterministic with no RNG, explicit failures instead
of `NaN`, and a cap on every loop that iterates to convergence. The types
themselves (`FramePyramid`, `PatchObservation`, `TrackingState`, and each
function's options, result and failure union) are exported alongside.

**`buildFramePyramid`** resamples each level from the previous one with a box
of width `r = s_{l−1} / s_l` over a bilinear reconstruction, centred where
decision D2 puts a level's pixels, so linear intensity is reproduced exactly
and no level's content is shifted. At step 2 that is the `[1, 2, 1] / 4`
decimation. The format does not say which filter produced a target's level
images (open question Q11); the tracker assumes a target's patches were cut
from levels this same function built, which `compile-target` does (above).
Even then, a patch is usually read on a shallower frame level than
its own, so the two differ in blur: that shows in the estimated gain and the
residual, hardly in position (a median of 0.016–0.042 px across patch levels
0 to 5; level 0, the sharpest, has the longest tail, 0.28 px at the 95th
percentile). The reasoning is in
[`frame_pyramid.ts`](./src/tracking/frame_pyramid.ts).

**`alignPatch`** places the patch's stored pixels where the prediction puts
them and aligns a translation — plus gain and bias with `photometric` — by
inverse-compositional Lucas–Kanade, starting on the frame level whose pixels
match the patch's and refining on the finest. Rotation, scale and
perspective come from the prediction. Each design choice, and the
measurement behind it, is in [`align_patch.ts`](./src/tracking/align_patch.ts);
the suites `test/tracking/align_patch_*.test.ts` re-measure them. In short,
for 8 × 8 pinball patches whose level matches the frame's scale:

| | Measured |
|---|---|
| Clean warps (frontal, rotated 30°, tilted) | median 0.022 px, worst 0.063 px |
| Sensor noise σ = 4 / 8 grey levels, plus blur | median 0.070 / 0.082 px |
| Converging from a prediction 3 / 4 / 8 px off | 97% / 89% / 37% (twice as far for a patch seen at twice its scale) |
| Prediction's rotation off by 10° / scale by 10% | 94% / 100% converge |
| Gain 0.6–1.3, bias ±40, compensated | as clean, and 96% converge from 3 px off; uncompensated, errors grow 14× to over 2000× (2.2× for a change pivoting at the patches' mean grey level) |
| A wrong convergence, beyond the basin | level-3 patches: told by `residual / gain`, at least 6.1 grey levels against at most 3.8 for a right one (on a half-contrast print); level-0 patches, sharper than the frame: the two overlap |

Their cost, in Node on a development machine, is measured by
`scripts/bench-tracking.mjs` (`npm run build` first): at the 270×360
camera-path frame, a four-level `∛2` pyramid takes about 1.8 ms, and a
matched patch about 15 µs at 8 × 8 or 36 µs at `compile-target`'s 16 × 16.
How that translates to the reference device, where 64 such patches and the
pyramid together overrun the tracker's ~10 ms, is recorded with its caveats
in [`docs/benchmarks/README.md`](../../docs/benchmarks/README.md). The tracker
builds only the pyramid levels its patches start on, and on the camera path
pinball's start on level 0 — the frame itself, nothing computed — so there the
patches are the cost: seen at about half their scale they take more
iterations, about 64 µs each at 16 × 16 in Node. An on-device measurement of
a tracking frame is #48's next step.

## Conformance

The suites in `test/target/format/` implement §8.2, §8.3 and §8.4 against the
committed corpus in [`fixtures/nft-target/`](../../fixtures/nft-target). §8.2
item 4, cross-implementation conformance, is a documented skip **here** — this
suite cannot run `cargo` — and is implemented from the other side, in
[`crates/wnft-format`](../../crates/wnft-format)'s `tests/writer.rs` over the
whole corpus and `tests/real_target.rs` over the compiled pinball target.

`test/wnft_roundtrip.test.ts` closes the loop the format exists for: a real
image through `buildTargetFromImage`, `encode`, `decode` and into `NftTracker`,
asserted to return the *same* numbers as the tracker driven straight from the
in-memory target. A file in between has to be invisible.

```bash
npm run build      # the fixture generator and compile-target import dist/
npm test
npm run fixtures   # regenerate the corpus; it must produce no diff
```

## Licence

LGPL-3.0-or-later, with the linking exception carried in every source file.
