# @webarkit/cv-backend-spec

Minimal stateless computer-vision backend interface. Defines the contract
that a high-level AR project depends on — not an implementation.

Two interchangeable implementations are expected:

- **jsfeatNext** (TypeScript) — reference implementation, numeric oracle.
- **PureCV** (Rust → WASM, planned) — production-performance implementation.

## What's in scope

`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography` —
pure CV primitives operating on neutral types (typed arrays, plain structs).
No `matrix_t`, no jsfeatNext-specific types, no WASM-specific types: each
backend converts internally at its own boundary.

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
