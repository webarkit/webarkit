# @webarkit/cv-backend-spec

[![CI](https://github.com/webarkit/webarkit/actions/workflows/CI.yml/badge.svg)](https://github.com/webarkit/webarkit/actions/workflows/CI.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: LGPL v3](https://img.shields.io/badge/License-LGPL%20v3-blue.svg)](../../LICENSE)

Minimal stateless computer-vision backend interface. Defines the contract
that a high-level AR project depends on — not an implementation. Part of the
[webarkit](../../README.md) monorepo.

Two interchangeable implementations are expected:

- **[jsfeatNext](https://github.com/webarkit/jsfeatNext)** (TypeScript) — reference implementation, numeric oracle. Implements this contract today, via [`@webarkit/cv-backend-jsfeatnext`](../cv-backend-jsfeatnext).
- **[WebARKitLib-rs](https://github.com/webarkit/WebARKitLib-rs)** (Rust → WASM) — production-performance implementation, planned. Runs on [PureCV](https://github.com/webarkit/purecv) as its CV-primitives layer underneath; neither is wired into this contract yet.

## 📦 Installation

Not yet published to npm — this package is pre-1.0 and currently consumed from source, inside the `webarkit` npm-workspaces monorepo:

```bash
git clone https://github.com/webarkit/webarkit.git
cd webarkit
npm install
npm run build -w @webarkit/cv-backend-spec
```

## What's in scope

`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`, plus
the optional `filterMatches` — pure CV primitives operating on neutral types
(typed arrays, plain structs). No `matrix_t`, no jsfeatNext-specific types, no
WASM-specific types: each backend converts internally at its own boundary.

## Capabilities and negotiation

Backends are interchangeable because they share these signatures — but only as
far as they share *capabilities*. The moment one backend has a descriptor
another lacks, signatures stop being enough, so what a backend implements is
part of the contract:

```ts
const cv = await createBackend();
cv.capabilities;
// { name: 'jsfeatnext', detectors: ['fast'],
//   descriptors: ['orb'], defaultDescriptor: 'orb', matchFilters: [] }
```

(`detectors` names only `fast` here even though the jsfeatNext adapter's underlying
library also ships `yape`: `DetectOptions` has no detector selector yet, so `yape`
isn't reachable through this contract today, and claiming it in `capabilities`
would be exactly the dishonesty the rules below exist to prevent.)

Three rules govern how a caller and a backend agree on what to run. They exist
to turn silent failures into loud ones:

- **Omitting an option is always valid** and selects the backend default, so
  code written against the original contract keeps working unchanged.
- **An unsupported explicit request throws** `UnsupportedCapabilityError`,
  naming both the request and the supported set. A backend never substitutes a
  descriptor it does happen to have — choosing a fallback is the caller's
  decision, made against `capabilities`:

  ```ts
  const preferred: DescriptorKind[] = ["teblid", "freak", "orb"];
  const kind =
    preferred.find((k) => cv.capabilities.descriptors.includes(k)) ??
    cv.capabilities.defaultDescriptor;
  ```

- **`match` rejects descriptor sets that cannot be compared**, throwing
  `DescriptorMismatchError` when the `kind` or `norm` differ. This guards the
  nastiest failure in the system: ORB and 256-bit TEBLID are both 32 bytes and
  both Hamming-compared, so matching one against the other throws nothing and
  returns confident, meaningless distances — RANSAC finds no consensus and the
  tracker simply never locks on, with nothing anywhere pointing at the cause.

## Match filtering

`filterMatches` is an optional step between `match` and `estimateHomography`,
the seam for geometric consistency filters such as GMS. Raising the inlier
ratio before RANSAC runs matters more than it looks: iterations for a given
confidence go as `log(1 - p) / log(1 - r⁴)`, so the 4-point minimal sample makes
the cost fall steeply as `r` rises.

A filter returns a **subset** with `queryIdx` / `trainIdx` / `distance`
untouched — callers still hold the keypoint arrays those indices point into.
Backends that do not implement it omit the method and declare
`matchFilters: []`, so the caller skips it:

```ts
let matches = cv.match(queryDesc, trainDesc, { ratio: 0.75 });
if (cv.filterMatches) matches = cv.filterMatches(matches, queryView, trainView);
```

## What's explicitly out of scope

Target training, tracking loops, pose refinement/filtering, geometric
validation, and renderer adapters (`modelViewGL`, `projectionGL`) are
high-level, stateful, AR-specific concerns. They depend on this interface —
they don't belong in it.

## Usage

```ts
import type { CvBackend } from "@webarkit/cv-backend-spec";

async function run(createBackend: () => Promise<CvBackend>) {
  const cv = await createBackend(); // e.g. from @webarkit/jsfeat-next-cv-backend
  const kps = cv.detect(frame);
  const { descriptors } = cv.detectAndCompute
    ? cv.detectAndCompute(frame)
    : { descriptors: cv.describe(frame, kps) };
  // ...
}
```

## Status

Draft — API surface may still change before `1.0.0`. See the root
[README](../../README.md) for open questions.
