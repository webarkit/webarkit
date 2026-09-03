# Examples

Demos of the `CvBackend` contract. They live at the repo root rather than inside
a package because they exercise the **contract**, not one implementation —
swapping in PureCV later should mean changing one import, not rewriting a page.

## Running

```bash
npm install
npm run build          # the examples load the built dist/, not the sources
npx http-server -p 8080 -s
```

Then open <http://localhost:8080/examples/pinball-static-jsfeatnext-backend.html>
or <http://localhost:8080/examples/pinball-webcam-jsfeatnext-backend.html>.

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
then often both correct. Measured here: 95 matches per-level against 38 pooled.
Partitioning is the caller's job — `Descriptors` is deliberately a flat buffer,
and `Keypoint.level` is what makes it possible from outside.

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

The same pipeline, live, once per tick, with **no state carried between
ticks** — each frame is detected, matched, and pose-estimated from nothing,
exactly like a fresh call to the static demo's pipeline would be. A tick that
fails to lock on has no memory of the tick before it that did.

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

## Shared code: `js/pinball-shared.mjs`

Both demos need the same three pieces — `toGray` (any drawable source to the
contract's `GrayImage`), `project` (apply a homography to a point), and the
per-pyramid-level matching strategy (`buildLevelIndex` + `matchPerLevel`) that
makes multi-scale target matching actually work (see the static demo's own
notes on why pooling levels into one `match()` call halves the results). Kept
in one module so the two pages can't drift against each other the way the
static demo's own inline copy did before this file existed.

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
