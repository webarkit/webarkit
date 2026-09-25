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
back. `NftTracker` carries state between ticks only for a target with
tracking patches (milestone M2 of
[#48](https://github.com/webarkit/webarkit/issues/48)); this page builds its
target with `buildTargetFromImage`, which writes none, so the tracker runs
detection-only — M1 of
[ADR-0001](../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md) — and
carries **no state between ticks**: each frame is detected, matched and
pose-estimated from nothing, and a tick that fails to lock on has no memory of
the tick before it that did. The page still owns the
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
live webcam, a user-chosen video file, or one of three bundled reference clips
(`videos/pinball-*.mp4`) — the two video sources loop, so a short clip
still fills the measurement window and a run can be repeated; a webcam is
already live and has no clip to loop. It changes nothing
about how the pipeline runs — it only times it, in eight stages per frame
(frame acquisition, grayscale conversion, `detect`, `describe`, `match`,
`estimateHomography`, `poseFromHomography` and the frame total) and, when
`NftTracker` runs, in its own timings of its tracking step.
p50, p95 and max are kept over a configurable window (frame count), and the
whole window is downloadable as JSON, with the user agent, the source and
processing resolutions, and a device label typed in by hand — none of that
is inferrable from the numbers alone, and a benchmark without it cannot be
told apart from the one run before it.

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

One of those defaults can be overridden per run: **max keypoints (scene)**,
the `maxKeypoints` budget passed to the scene-side `detect` (the stateless
pipeline passes it directly, `NftTracker` receives it as
`maxSceneKeypoints`). It defaults to `DEFAULT_MAX_SCENE_KEYPOINTS`, so a run
that leaves it alone is the same run this page measured before the control
existed. It can also be set from the URL —
`bench-nft.html?maxKeypoints=150` — which is quicker than a number field on a
phone reached over `adb reverse`; a missing, non-numeric or non-positive
value falls back to the default. The export records the budget a run used as
`maxKeypoints` (an export without that field predates the control and ran at
the default), and every frame records `numSceneKeypoints`, what `detect`
actually returned. The two differ whenever a frame has fewer corners than the
budget, and a timing taken on such a frame says nothing about the budget.

The **processing box** can be overridden the same way. Every frame is fitted
into it with aspect ratio preserved, which decides how many pixels the
`acquire` stage draws and reads back, and how many `detect` then searches.
It defaults to 480×360, the page's box from the start, and can be set with
the two "processing box" fields or from the URL:
`bench-nft.html?procWidth=360&procHeight=360`. A square box gives the same
long side to a portrait and a landscape source, which is how the two can be
compared at equal output size. The export records the configured box as
`processingBox` (absent in exports that predate it, which used 480×360),
next to `processingResolution`, the size the source was actually fitted to.

For a **webcam** source, a menu next to the radio chooses the **rear**
(default) or **front** camera, or set it from the URL with `?camera=rear` or
`?camera=front`. Without it, Android Chrome opens the front camera, which
can't be pointed at a target while you look at the screen. The request is a
preference (`facingMode: { ideal: … }`), so a laptop with a single webcam
still gets that webcam. The export's `camera` field records what was asked
for and what the camera actually delivered: `facingMode`, `frameRate`, and
the camera's name as the browser reports it. The frame rate is recorded
because, on the file path, frame rate measurably changed `acquire` (see
[`docs/benchmarks/README.md`](../docs/benchmarks/README.md)). The field is
`null` for file and bundled-clip runs.

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

**Comparing two modes on the same footage.** `timestampMs` passed to each
tick is `performance.now()`, not `video.currentTime`, so two separate Start
clicks against a looped video land at two different, arbitrary points in the
loop by default — two runs then measure
different content, not just different code paths, which defeats the point of
comparing them. The **"start at (s)"** field (either video source; a webcam
has no timeline to seek) seeks there before the first tick, so running it once
for each mode with the same value gives two runs over the same *starting*
point. The export carries `startAtSeconds` (`null` for a webcam run) precisely
so a downloaded report can be checked to have actually started from the same
point, rather than trusted on the assumption that the field was set the same
way both times.

**A shared `startAt` is not a shared frame sequence, though.**
`requestVideoFrameCallback` fires once per frame the browser actually
*presents*, and a main thread busy for longer than the clip's own frame
interval (real here: `total`'s own p50 sits close to a ~25fps clip's ~40ms
budget) makes the browser coalesce to the latest decoded frame, skipping
whichever ones went stale while it was blocked. Two modes cost a slightly
different number of milliseconds per frame, so
they skip a different number of frames and drift apart — tick 47 in one run
is not guaranteed to be the same clip moment as tick 47 in the other, even
from an identical `startAt`. Each frame's own `mediaTimeSeconds` (from
`requestVideoFrameCallback`'s metadata, or `video.currentTime` on the rAF
fallback) is recorded for exactly this reason: **compare two exports by
`mediaTimeSeconds`, not by array index or position in `frames`.**
`scripts/compare-bench.mjs` does exactly that (below).

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

## The bundled reference clips: `videos/pinball-*.mp4`

A "user-chosen video file" is reproducible only as long as whoever reruns the
benchmark still has the exact same file — which nobody but the original tester
does. The **"bundled clip"** radio loads one of these committed files instead
(fetched by URL, no file picker), so a report from one run can actually be
compared against a report from another: same footage, byte for byte, on
whoever's device opens the page. The dropdown next to the radio picks which
one; the export's `bundledClip` field records which was actually used, for
the same reason `startAtSeconds` does.

- **`pinball-bench.mp4`** — 11.96s, 1280×720, ~940 KB. The printed
  `pinball.jpg` target on a wall, filmed frontally at an angle and a distance
  that changes over the clip, the same real-scene conditions
  `images/pinball-demo.jpg` was shot under for the static demo.
- **`pinball-bench-table.mp4`** — 8.90s, 1080×1920 (portrait), ~2.3 MB. The
  same target lying flat on a table, filmed from a steep oblique angle — a
  much harder shot for a single-scale scene detector (see the webcam demo's
  own "known limitation" section above) than the frontal wall clip, and
  useful for exactly that reason.
- **`pinball-static.mp4`** — 12.17s, 720×1280 (portrait), 30 fps, ~920 KB.
  The printed target on a wall again, but with the camera held **fixed**: the
  framing does not change over the clip, so every frame shows the same scene.
  That makes it the clip for measuring a parameter rather than a scene. Any
  change in a stage's timing between two runs on it comes from the parameter,
  not from what the camera was pointed at. It also fills a scene `detect`
  budget on every frame: at this page's processing size (203×360) FAST finds
  roughly 1,200–1,300 corners per frame, well above any budget below 1,000.
  Committed as delivered: already H.264 (`libx264`), no audio track, no
  rotation tag (the frame is stored portrait, so the rotation pitfall below
  does not apply), and `moov` ahead of `mdat` (the `+faststart` layout). The
  command that produced it was not recorded.

The first two are re-encoded from a phone-captured original with `-an` (audio dropped;
nothing here reads it) and `-crf 28` (visually lossless at this content and
resolution, a large size cut from the source's typical ~15 Mbps phone
bitrate). Beyond that the two commands differ, and the difference matters:

```bash
# pinball-bench.mp4 -- landscape source, explicitly downscaled
ffmpeg -i original.mp4 -vf scale=1280:720 -an -c:v libx264 -preset medium -crf 28 -movflags +faststart videos/pinball-bench.mp4

# pinball-bench-table.mp4 -- portrait phone recording, NO -vf at all
ffmpeg -i original.mp4 -an -c:v libx264 -preset medium -crf 28 -movflags +faststart videos/pinball-bench-table.mp4
```

The table clip's source carries a `rotate: 90` / `displaymatrix: -90°` tag (a
portrait recording stored as a 1920×1080 landscape-coded frame, tagged to
display rotated). ffmpeg auto-applies that correction ONLY when no `-vf` is
given; supplying one — as the wall clip's command does, to downscale it —
replaces ffmpeg's own auto-rotate step instead of adding to it, so the
rotation tag is silently dropped and the output plays back squished into the
wrong aspect ratio. This is not hypothetical: it happened on the first attempt
at this exact file, produced a `pinball-bench-table.mp4` that looked distorted
and never locked onto anything, and cost the original raw recording (kept in
no other copy) to find. Check `ffmpeg -i` for a `rotate`/`displaymatrix` line
before deciding whether a re-encode may use `-vf` at all; if it must (to
resize), bake the rotation in explicitly rather than omitting it, and verify
with an extracted frame before compressing away the only copy.

The wall clip's own processing-box note: 720p and CRF 28 keep it close in size
to `images/pinball-demo.jpg` (877 KB) while still exceeding this page's own
processing box (480×360, fitted with aspect preserved — a 16:9 source like
this one actually lands at 480×270, not 480×360; the export's
`processingResolution` records that real size, not the configured box) by a
comfortable margin — downscaling further would start constraining what a
*higher* processing resolution could be benchmarked against later. The table
clip is left at its native 1080×1920 rather than downscaled to match, since
after the rotation incident above the priority was verifying orientation over
minimizing size a second time; revisit if its ~2.3 MB becomes a real problem.

`pinball-bench.mp4` has an [ADR-0001](../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md)
action item 6 baseline measured against it, run **on** the reference device
chosen there (a Samsung-class Android tablet), not merely sourced from
footage recorded on it — see [`docs/benchmarks/README.md`](../docs/benchmarks/README.md)
for the numbers, the device, and why that distinction is called out
explicitly. Re-encoding a clip a baseline depends on is a change to that
baseline's premise, not a refresh: a new baseline needs a new measurement,
the same way recompiling `targets/pinball.wnft` needs updating the Rust test
that reads it (see [Targets](#targets-targetspinballwnft) below).

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
lower afterwards; the file row is mostly the `fetch()` of the file (110 KB when
measured, before it carried tracking patches; 128 KB now), not the decode.
Measured apart from both effects, the gap is roughly **200×** — 84 ms to build
against 0.40 ms to decode. The [root README](../README.md#-compiled-targets-wnft)
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

`js/bench-metrics.mjs` is the bench page's other module: every run metric it
reports and the text defining each, its URL parameters, and the helpers its
pyramid probe and the desktop replay share — no DOM, tested in
`examples/test/` by the root `npm test`. `scripts/compare-bench.mjs` and
`scripts/replay-clips.mjs` (a desktop pre-flight that replays the bundled
clips through the tracker; ffmpeg needed) import it too, so a comparison or a
replay means by each name what the page does.

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
