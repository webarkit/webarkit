# `@webarkit/nft-tracker`

Natural-feature tracking for planar image targets, written **above** the
[`CvBackend` contract](../cv-backend-spec) — the backend is injected by the
caller, so this package runs on any implementation of it.

> **Not published to npm, and pre-0.1.** Develop against it from the monorepo:
> `npm install` at the root symlinks the workspace packages together.

What exists today is the **target layer** — the in-memory shape of a trained
target, the codec for the `.wnft` files that store one, and
[`compile-target`](#compiling-a-target), which turns an image into such a file
— plus **milestone M1** of the tracker itself: `NftTracker`, a per-frame
`detect → describe → match → estimateHomography → poseFromHomography` with no
state carried between frames. Repeated detection is not yet tracking; the
patch tracker and the state machine that make it tracking are M2
([ADR-0001](../../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md),
[#48](https://github.com/webarkit/webarkit/issues/48)). M2's types and
function signatures are in place; `selectPatches` is implemented and
`compile-target` writes its patches, and the rest are **stubs** for now — see
[The tracker](#the-tracker).

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

The level images patches are cut from come from a **stand-in**,
`bin/target-pyramid.mjs` (an area-weighted box filter), until
`buildFramePyramid` exists: stored patches must be filtered the way the live
frame's pyramid will be (format spec §11, Q11). Every file it produced says so
in `info.compiler.patchPyramid`. When `buildFramePyramid` lands, the compiler
switches to it and `examples/targets/pinball.wnft` is recompiled; level 0's
patches are the image itself and do not move, coarser levels' do.

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
| `"TRACK"` | Pose from patch tracking. **Not produced yet**: it comes with M2's state machine | Sum of the robust fit's weights ÷ patches passed to `alignPatch` this frame |
| `"LOST"` | No pose (`ok: false`; `reason` says why) | `0` |

Today every frame runs detection, so a result is only ever `DETECT` or `LOST`.

### The M2 tracking state: all but `selectPatches` are stubs for now

The functions a tracking-state frame will be built from are defined in
[`src/tracking/types.ts`](./src/tracking/types.ts) and exported, so that the
three M2 implementation branches of
[#48](https://github.com/webarkit/webarkit/issues/48) work against one fixed
contract. **Most are still stubs:** each of those returns
`{ ok: false, reason: "not-implemented" }` until its branch lands, and nothing
should be built on them yet.

| Export | What it will do | Status |
|---|---|---|
| `selectPatches` | Compile time: the target's pyramid → the §5.7 `patches` table; `compile-target` writes it | **implemented** |
| `buildFramePyramid` | A grey pyramid of the frame (and of the target, at compile time) | stub |
| `alignPatch` | Aligns one patch in the frame by IC-LK → a `PatchObservation` | stub |
| `robustHomography` | IRLS with Tukey's biweight over the patch correspondences → `H` and per-patch weights | stub |
| `predictHomography` | Constant-velocity prediction of the next frame's `H` | stub |
| `levelScale` | `s_l`, a pyramid level's scale, computed the way the backend computes it | **implemented** |

The rules every implementation keeps are stated once, in that file's header:
§3 coordinates, pure and deterministic with no RNG, explicit failures instead
of `NaN`, and a cap on every loop that iterates to convergence. The types
themselves (`FramePyramid`, `PatchObservation`, `TrackingState`, and each
function's options, result and failure union) are exported alongside.

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
