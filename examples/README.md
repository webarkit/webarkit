# 🖼️ Examples

Demos of the `CvBackend` contract. They live at the repo root rather than inside
a package because they exercise the **contract**, not one implementation —
swapping in another `CvBackend` (WebARKitLib-rs, once it implements one) later should mean changing one import, not rewriting a page.
See the [root README](../README.md) for how this fits into the wider webarkit ecosystem.

## 🚀 Running

Prerequisites: Node.js as pinned in [`.nvmrc`](../.nvmrc) (currently v24.18.0), npm 9+.

```bash
npm install
npm run build          # the examples load the built dist/, not the sources
npx http-server -p 8080 -s
```

Then open <http://localhost:8080/examples/pinball-static-jsfeatnext-backend.html>,
<http://localhost:8080/examples/pinball-webcam-jsfeatnext-backend.html>, or
<http://localhost:8080/examples/bench-nft.html>.

Serve over HTTP: ES modules do not load from `file://`, and `getUserMedia`
(the webcam demo) additionally requires a secure context — `http://localhost`
qualifies, a plain non-localhost `http://` host does not.

There is no bundler. The packages emit ESM with explicit file extensions, so an
import map in the page is enough to point the bare specifiers at the built
output.

## `pinball-static-jsfeatnext-backend.html`

Named for the backend it drives, leaving room for a `-purecv-backend` sibling
that runs the same page against the other implementation.

The full pipeline on two still images:

```
detect → describe → match → [filterMatches] → estimateHomography → poseFromHomography
```

It draws keypoints on both frames, match lines coloured by whether RANSAC kept
them, and — the part that actually tells you it worked — the target's outline
reprojected into the scene through the recovered homography. If that quadrilateral
lands on the pinball machine, every stage agreed with every other one.

Two things in it are not incidental, and both were found by the demo failing
first:

**The target is searched across scales, the scene is not.** In the photo the
printed target is about a third the size of the reference, and ORB descriptors
do not survive that on their own. The scene is treated like a live frame — one
level, whatever the camera gave — while the target is detected over eight
pyramid levels, which is how a tracker works too: the reference is prepared
once, offline, and the per-frame work stays cheap.

**Matching runs one target level at a time.** Pooling every level into a single
train set and applying Lowe's ratio test halves the match count, because the
same physical feature appears at several levels and the two best candidates are
then often both correct. Measured here: 99 matches per-level against 45 pooled (2.2×) — exact and
reproducible figures, re-measured after jsfeat-next 0.17 made `detect` a pure
function of its inputs (webarkit/webarkit#27, required since #28); the same
fix recovered the last corner of every image row, which is why every count
sits slightly above the 0.16-era measurements.
Partitioning is the caller's job — `Descriptors` is deliberately a flat buffer,
and `Keypoint.level` is what makes it possible from outside. Both pieces now
come from `@webarkit/nft-tracker`: `buildTargetFromImage` prepares the
multi-scale reference, and `buildLevelIndex` + `matchPerLevel` do the
per-level matching over the target's stored level ranges. The page keeps its
own explicit `detect → describe → match → estimateHomography →
poseFromHomography` calls, because showing every stage is what it is for.

The **"target from" selector** swaps `buildTargetFromImage` for a compiled
`.wnft` decoded from disk, leaving every later stage untouched — see
[Targets](#targets-targetspinballwnft) below.

### Why this one came first

Two reasons the static demo was built before the webcam one, not instead of it.

**Debuggability.** With a fixed input, anything strange on screen is the vision
code. A webcam adds lighting, focus, exposure, resolution and frame timing, all
of which can produce exactly the same symptom as a broken matcher. Getting the
pipeline right against two known images first is what made the webcam demo's
own parameters (resolution, keypoint cap, pyramid depth) measurable rather than
guessed — see its own section below.

**Architecture.** The `CvBackend` contract is deliberately *stateless*, and a
webcam demo is where that boundary actually gets tested: does the pipeline
still make sense called fresh every tick, with nothing carried over? The answer
turned out to be yes, with one caveat (see the known limitation below) — but a
*tracker* (which target, when to re-detect, what to do when tracking is lost,
how to smooth the pose over time) is still the high-level AR layer's job, not
either example's. Neither demo attempts it.

## `pinball-webcam-jsfeatnext-backend.html`

The same pipeline, live, through `NftTracker` — the page calls
`tracker.process(frame, timestampMs)` once per tick and draws what comes
back. Milestone M1 of
[ADR-0001](../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md) is
parity, so the tracker still carries **no state between ticks**: each frame is
detected, matched and pose-estimated from nothing, and a tick that fails to
lock on has no memory of the tick before it that did. The page still owns the
camera, the loop and the canvas; the package owns none of them (ADR point 7).

Parameters, chosen from measurements taken directly against these images (see
the commit `938aab0`'s follow-on and this README's own history for the sweep):
processing resolution capped at **480×360** and the scene capped at
**`maxKeypoints: 300`** — the two settings that gave the best speed/reliability
trade-off among six combinations tried (640×480, 480×360, 320×240 at a few
caps each); 320×240 was tried and rejected — not just slower, its matches
collapsed outright (12 instead of ~55), a resolution floor rather than a speed
one. The target stays at 8 pyramid levels, same as the static demo, computed
once before the camera even opens.

### Known limitation: single-scale live frame

Only the **target** is searched across pyramid levels; the live frame is
detected at `levels: 1` to stay fast. Comparing against the real ARToolKit
NFT / `WebARKitLib` engine (source in `webarkit/WebARKitLib`, `lib/SRC/KPM/FreakMatcher`)
surfaced why that is a real gap, not just a simplification: its
`numOctaves(width, height, kMinCoarseSize=8)` is called identically for the
reference image **and** the live query frame (`visual_database-inline.h`,
`addImage`/`query`) — at 320×240 (the actual resolution its own reference
example processes video frames at, `threejs_worker_ES6.js`: `pscale = 320 /
Math.max(vw, (vh/3)*4)`) that is still 5 octaves × 3 scales/octave = 15 scale
samples, symmetrically, on both sides.

This adapter's `detect()` does the equivalent — pyramid + `DetectOptions.levels`
— but this demo only spends that budget on the target. A caller needing the
live frame's own scale to vary (camera far from the target, or moving) should
pass `levels` > 1 to the scene's `detect()` call too; the trade-off is
per-frame cost, which is exactly why this demo does not do it by default (see
the parameters above). Worth revisiting once the cost of a lighter multi-level
search on the scene side is measured with the same rigour the current
parameters got — tracked informally against this file for now, no issue yet.

## `bench-nft.html`

Measures the pipeline frame-by-frame on whatever device opens it, against a
live webcam or a looped video file (a file loops so a short clip still fills
the measurement window, and so a run can be repeated). It changes nothing
about how the pipeline runs — it only times it, in eight stages per frame:
frame acquisition, grayscale conversion, `detect`, `describe`, `match`,
`estimateHomography`, `poseFromHomography`, and the frame total — plus the
tracker's own outcome (`locked on` / `too few matches` / `no consensus`).
p50, p95 and max are kept over a configurable window (frame count), and the
whole window is downloadable as JSON, with the user agent, the source and
processing resolutions, and a device label typed in by hand — none of that
is inferrable from the numbers alone, and a benchmark without it cannot be
told apart from the one run before it.

Two modes, selected before pressing Start:

- **stateless pipeline** — the same inline `detect → describe → match →
  estimateHomography → poseFromHomography` calls as the webcam demo above,
  against `@webarkit/nft-tracker`'s own `DEFAULT_SCENE_LEVELS` /
  `DEFAULT_MAX_SCENE_KEYPOINTS` / `DEFAULT_RATIO` / `DEFAULT_RANSAC_THRESHOLD`.
- **NftTracker** — `tracker.process(frame, timestampMs)`, once per tick.

Both modes are timed by wrapping the `CvBackend` instance passed to whichever
one is active, so the stage split is available for `NftTracker` even though
`process()` does not expose it itself. Milestone M1 of
[ADR-0001](../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md) is
parity, so the two modes are expected to report the same match/inlier counts
here; the point of measuring both under one roof is to have a timing baseline
in place *before* M2 gives the tracker state of its own, so that whatever
that costs is visible as a change against this page rather than a number with
nothing to compare it to.

## Targets: `targets/pinball.wnft`

The static demo's "target from" selector chooses between the two ways a target
can reach the page:

- **the image (built here)** — `buildTargetFromImage` at page load, over the
  `<img>` the page just decoded. This is what the demo has always done.
- **`targets/pinball.wnft`** — a target compiled once, offline, from the very
  same `images/pinball.jpg`, committed, and `decode`d here.

Everything after that point is identical for both, because a decoded target *is*
a target. That is the whole claim of the file format, and the selector is the
demo's way of showing it rather than asserting it — `packages/nft-tracker`'s
`test/wnft_roundtrip.test.ts` is the assertion.

**Expect the numbers to differ slightly between the two**, and do not read that
as loss. The file carries the target exactly; the two runs simply do not start
from the same pixels. This page builds its grey image with
`OffscreenCanvas.drawImage`, whose resampling is implementation-defined, and the
compiler used a box filter in Node. Measured on these images: 2067 keypoints and
99 matches built here, 2062 and 91 from the file. Both lock on, and the
recovered pose differs between them by less than it differs between two reloads
of *either* one — RANSAC draws its minimal sample from `Math.random`, and the
contract has no seed to pass it (webarkit/webarkit#24), so inlier counts and
translations move a little on every run regardless of where the target came
from.

What *does* separate the two is the **"target prepared in"** row, which the page
times apart from the per-frame **"pipeline"** row precisely so the difference is
visible: building the target here costs the page an order of magnitude more than
loading it does.

Don't read either figure as the cost of the format, in either direction. The
build row is worst on the first load, before the JIT has warmed up, and settles
lower afterwards; the file row is mostly the `fetch()` of 110 KB, not the
decode. Measured apart from both effects, the gap is roughly **200×** — 84 ms to
build against 0.40 ms to decode. The [root README](../README.md#-compiled-targets-wnft)
has the table and the conditions.

The file is regenerated with, and only with:

```bash
npm run build
node packages/nft-tracker/bin/compile-target.mjs examples/images/pinball.jpg \
    -o examples/targets/pinball.wnft --physical-size 210x262.5
```

The physical size is the sheet the reference was printed on: 210 mm wide, and a
height that keeps the image's own 4:5 aspect rather than a stationery size that
does not. Leave it out and model-plane units stay level-0 pixels — see
[`compile-target`'s options](../packages/nft-tracker/README.md#compiling-a-target).

`crates/wnft-format`'s `tests/real_target.rs` reads this file too. It is the
first real target both codecs see — every file in `fixtures/nft-target/` is
synthetic — so **recompiling it is a change to that test's expectations**, not a
refresh. Committed on purpose, for the same reason: a `.wnft` that changed
silently would make the demo and the Rust suite disagree about what the
repository means by "the pinball target".

## Shared code: `js/pinball-shared.mjs`

Both demos need the same two pieces — `toGray` (any drawable source to the
contract's `GrayImage`) and `project` (apply a homography to a point). Kept
in one module so the two pages can't drift against each other the way the
static demo's own inline copy did before this file existed. The
per-pyramid-level matching strategy that used to live here moved into
[`@webarkit/nft-tracker`](../packages/nft-tracker) — it is tracker logic, not
page logic, and the tracker needs it too. What stayed is what touches the DOM.

## Images

- `images/pinball.jpg` — the target, recovered from this repo's history (it was
  part of the NFT demo removed in `d1543e8`).
- `images/pinball-demo.jpg` — a phone photo of the printed target sitting on a
  desk, at an angle and a different scale than the reference. This is what
  drove the multi-scale detection and per-level matching in `109caaf`: at the
  photo's real-world scale, ORB simply had nothing to match against a
  single-scale reference.

The target should be the flat, frontal reference; the scene image should show it
from a different viewpoint, which is what makes the recovered homography
non-trivial.
