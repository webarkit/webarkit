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

Then open <http://localhost:8080/examples/pinball-static-jsfeatnext-backend.html>.

Serve over HTTP: ES modules do not load from `file://`.

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

### Why static and not a webcam

Two reasons, and the second is the real one.

**Debuggability.** With a fixed input, anything strange on screen is the vision
code. A webcam adds lighting, focus, exposure, resolution and frame timing, all
of which can produce exactly the same symptom as a broken matcher.

**Architecture.** The `CvBackend` contract is deliberately *stateless*. A live
demo needs a per-frame loop — which target, when to re-detect, what to do when
tracking is lost, how to smooth the pose over time — and that orchestration is
the high-level AR layer's job, not an example's. Writing it here would mean
writing it twice and throwing one away.

A webcam demo becomes the right thing to build once that layer exists; it will
then reuse this adapter unchanged.

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
