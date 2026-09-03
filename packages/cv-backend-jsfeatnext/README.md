# @webarkit/cv-backend-jsfeatnext

The **jsfeatNext** implementation of [`@webarkit/cv-backend-spec`](../cv-backend-spec)'s
`CvBackend` contract — pure TypeScript, no WASM.

```ts
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";

const cv = await createJsfeatNextBackend();

const { keypoints, descriptors } = cv.detectAndCompute(frame, { maxKeypoints: 500 });
let matches = cv.match(descriptors, target.descriptors, { ratio: 0.75 });
if (cv.filterMatches) matches = cv.filterMatches(matches, queryView, trainView);

const h = cv.estimateHomography(src, dst, { threshold: 3 });
if (h.ok) {
  const pose = cv.poseFromHomography(h.H, intrinsics(frame.width, frame.height));
}
```

## Why this package exists separately

The dependency arrow runs **one way**: this package depends on both the contract
and jsfeatNext, and neither of them depends on it. jsfeatNext stays a
contract-agnostic computer-vision library that knows nothing about WebAR, and
the contract stays implementable by anyone. All the translation between them —
flat typed arrays and plain structs on one side, `matrix_t` / `keypoint_t` on
the other — is confined here.

## What it advertises

```ts
cv.capabilities;
// { name: 'jsfeatnext', detectors: ['fast'], descriptors: ['orb'],
//   defaultDescriptor: 'orb', matchFilters: [] }
```

Two of those deserve a note, because they are narrower than what jsfeatNext can
technically do — deliberately:

- **`detectors: ['fast']`** although jsfeatNext also ships `yape` and `yape06`.
  `DetectOptions` carries no detector selector yet, so those are not reachable
  through this API. Advertising a capability the caller cannot invoke is exactly
  the dishonesty the negotiation rules exist to prevent.
- **`matchFilters: []`** and `filterMatches` omitted entirely, until a GMS
  implementation exists. Callers skip the step with
  `if (cv.filterMatches) …`, which is the documented pattern.

## Behaviour worth knowing

**Keypoints are oriented by `detect`.** ORB's `describe` rotates each sampling
patch by the angle it is handed — it does not work the orientation out itself,
and an unset angle rotates by −1 radian rather than leaving the patch upright.
`detect` therefore fills `Keypoint.angle` via `orb.ic_angle`, so its output is
immediately usable by `describe`, which is what the contract's `angle` field
promises.

**Keypoints stay 20 px clear of every edge.** Two jsfeatNext constraints meet
and the stricter wins: `orb.describe` needs 20 px (closer in, some sampled pairs
read the warp fill of 128 instead of the image and the descriptor is silently
degraded), `orb.ic_angle` needs 15 px (it reads its patch with no bounds check).

**`maxKeypoints` keeps the strongest.** Corners are sorted by score before
truncation, so capping does not just keep whichever ones the raster scan reached
first.

**Returned arrays belong to the caller.** Every typed array is copied out.
jsfeatNext reuses its scratch matrices between calls, so handing back views
would hand back storage the next call overwrites.

## Errors

Both come from the contract package, so a caller can catch them uniformly
regardless of which backend is plugged in:

- `UnsupportedCapabilityError` — an explicit `kind` this backend does not
  implement. It is never silently substituted; choosing a fallback is the
  caller's decision, made against `capabilities`.
- `DescriptorMismatchError` — `match` was given two descriptor sets whose
  `kind` or `norm` disagree. Without this the matcher would return confident,
  meaningless Hamming distances and the tracker would simply never lock on.

## Requirements

`@webarkit/jsfeat-next` **≥ 0.15.0** — earlier releases lack `bfmatcher`,
`pose_estimator` and `orb.ic_angle`, all of which this adapter needs.
