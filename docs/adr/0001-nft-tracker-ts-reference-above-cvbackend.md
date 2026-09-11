# ADR-0001: NFT tracker — TypeScript reference above `CvBackend`, measured Rust port, shared target format

**Status:** Accepted
**Date:** 2026-09-10
**Deciders:** @kalwalt

## Context

WebARKit needs a natural-feature-tracking (NFT) layer for planar image targets: find a trained image in the camera feed, keep tracking it frame to frame with a stable pose, and recover when it is lost.

Where the org stands today:

- `@webarkit/cv-backend-spec` defines a **stateless, synchronous** CV contract (`detect`, `describe`, `match`, optional `filterMatches`, `estimateHomography`, `poseFromHomography`) with capability negotiation. Its header comment explicitly places target training, the tracking loop, pose refinement, validation and temporal filtering **above** the contract, written once against it.
- `@webarkit/cv-backend-jsfeatnext` implements the contract end to end. Today it has the FAST detector, ORB descriptors, ratio/cross-check matching and RANSAC homography with restarts; it has no match filter yet. It is the org's numeric oracle.
- The webcam example runs the pipeline **stateless per tick**: every frame is detected from scratch and nothing carries over. That is repeated detection, not tracking — every frame pays full detection cost and produces an independent, noisy pose estimate.
- Per-level target matching (`buildLevelIndex` + `matchPerLevel` in `examples/js/pinball-shared.mjs`) finds roughly 2.5× the matches of pooled matching. This is high-level logic that currently lives in an example.
- **WebARKitLib-rs, with PureCV as its CV layer, is the planned production WASM backend.** It does not speak `CvBackend` yet; an adapter package is expected, the way `cv-backend-jsfeatnext` wraps jsfeatNext. WebARKitLib-rs also contains its own port of the ARToolKit NFT/KPM engine, kept for jsartoolkitNFT marker compatibility; this ADR does not touch it.
- The org's established porting practice is reference-first — OpenCV → jsfeatNext (TS) → PureCV (Rust) — with the TS implementation acting as the oracle for the Rust one.

Forces at play:

- The tracker is stateful and algorithmically dense, and it will change a lot while it is tuned. Iteration speed and debuggability matter more than raw speed at first.
- It should run on every backend that implements the contract, not on one.
- Real-time budget on mid-range mobile: 33 ms per frame at 30 fps, shared with camera acquisition and rendering.
- A target trained once must be usable by every implementation of the tracker, now and after a possible port.

## Decision

1. **Placement.** A new workspace package, `packages/nft-tracker` (package name TBD, e.g. `@webarkit/nft-tracker`), implements the tracker in TypeScript, above the contract.

2. **Dependencies.** The only runtime dependency is `@webarkit/cv-backend-spec`. Backend packages (`cv-backend-jsfeatnext` today, the WebARKitLib-rs adapter later) are **devDependencies**, used by tests and examples. The backend is injected by the caller:

   ```ts
   const cv = await createJsfeatNextBackend();  // later: the WebARKitLib-rs adapter
   const tracker = new NftTracker(cv, target, K);
   ```

   The dependency arrow stays one-directional: nothing depends on `nft-tracker` except applications and examples.

3. **Division of labour.** Work proportional to the pixels of a whole frame goes through the backend (detection, description, matching, homography estimation). Work on tens of points or on small patches lives in the tracker (patch tracking, pose from homography with ambiguity resolution, temporal filtering, the state machine). If profiling shows a tracker-side step is too slow, it moves down into the contract as a new **optional** method with a capability flag — the pattern already used for `filterMatches`. Expected candidates, in order: the frame pyramid for tracking, synthetic-view warping in the target compiler, patch alignment.

4. **TypeScript is the reference implementation.** If a Rust port (inside WebARKitLib-rs) ever happens, it is a *port of the TS reference*, validated against it through shared fixtures. Algorithm changes land in TS first and are then ported. The two implementations never evolve independently.

5. **The Rust port is conditional on a measured criterion, not scheduled.** It is triggered when, on the reference device (TBD — a mid-range Android phone), over a recorded test sequence, **either**:

   - the JS↔WASM boundary overhead (marshalling and copies across the contract) exceeds **10% of the frame budget at p95** (> 3.3 ms per frame), **or**
   - tracker-side TypeScript compute in the tracking state exceeds **8 ms per frame at p95**,

   **and** moving individual steps into the backend (point 3) has not brought it back under the threshold. The thresholds are proposals, to be confirmed or revised after the first measurements.

6. **The target format is shared from day one.** Trained targets use a binary, versioned, language-neutral format, specified in [`docs/specs/nft-target-format.md`](../specs/nft-target-format.md) before any code reads or writes it. The format — not the TS source — is the contract between the TS and Rust implementations.

   The format has two codecs. The TypeScript codec in `packages/nft-tracker` is the one the tracker requires. A Rust codec, `crates/wnft-format` in this monorepo, is written from this specification — not ported from the TypeScript source — so that two independent implementations expose ambiguities in the specification, and so that WebARKitLib-rs and Rust tooling can read targets. It is a stateless, fully specified component, so it is neither the tracker port of point 5 nor Option C: points 4 and 5 govern the tracker only. Both codecs consume the same fixtures, which only the TypeScript generator produces.

7. **Portability rules for the TS code**, so that a port stays cheap:

   - **Pure core.** Input: a `GrayImage` and a timestamp. Output: a pose result. No DOM, timers, `requestAnimationFrame`, workers or camera access inside the package; the application owns the loop.
   - **Explicit result types** (`{ ok, ... }`, as `HomographyResult` already does). Exceptions are reserved for contract violations, never used for control flow.
   - **Fixed-shape data.** Typed arrays and plain structs; no dynamic property bags.
   - **Determinism.** Every random choice goes through an injectable RNG (as jsfeatNext's RANSAC already allows), so fixtures are reproducible.
   - **Float64 geometry**, as the contract requires.
   - **Fixtures are data files** (frame sequences, expected homographies and poses) in a shared directory, readable by both `vitest` and `cargo test`.

## Options considered

### Option A — TS reference above the contract, conditional Rust port (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Backends supported | Every contract implementation |
| Debuggability | High — readable TS, jsfeatNext as oracle |
| Performance | Unknown until measured; tracking-state frames make no backend calls |
| Fit with existing practice | Same shape as OpenCV → jsfeatNext → PureCV |

**Pros:** First real consumer of the contract, so it validates the contract's design. Works today on jsfeatNext. No commitment to Rust until data justifies it.
**Cons:** Detection-state frames make several boundary crossings on a WASM backend. If the port is triggered, two implementations must be kept aligned under the reference/port discipline.

### Option B — Tracker in Rust, inside WebARKitLib-rs only

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Backends supported | WebARKitLib-rs only |
| Debuggability | Low–medium |
| Performance | Best — one boundary crossing per frame |
| Fit with existing practice | Skips the TS reference step |

**Pros:** Maximum performance; a single implementation.
**Cons:** The contract becomes irrelevant for NFT, which is its main use case. No jsfeatNext path and no oracle. Slow iteration during the tuning-heavy phase.

### Option C — TS and Rust developed in parallel, independently

**Pros:** Both exist early.
**Cons:** Two stateful implementations of the same algorithm drift apart, and effort goes into reconciling them rather than into tracking quality. **Rejected.**

### Option D — Stateful tracking primitives inside the contract

**Cons:** Breaks the stateless, synchronous contract that both backends and the negotiation rules are built on. Stateless optional primitives (point 3) already cover the performance need. **Rejected.**

## Trade-off analysis

The deciding trade-off is **iteration speed and backend neutrality now** versus **peak performance later**. Option A does not give up peak performance permanently: point 3 moves hot steps into the backend, and point 5 keeps a full port available. Option B gives up backend neutrality permanently.

The expected cost of Option A on a WASM backend is small but unmeasured: tracking-state frames make no backend call at all, while detection-state frames make about five calls with frame-sized copies. Point 5 exists precisely to replace this expectation with a number.

## Consequences

**Easier:**

- NFT works on jsfeatNext immediately, and on WebARKitLib-rs as soon as its adapter exists, with no tracker changes.
- New descriptors (TEBLID) and filters (GMS) are picked up through capability negotiation, with no tracker changes.
- The contract gets a real consumer, which surfaces its gaps early.

**Harder:**

- If the port is triggered, two implementations must be kept aligned.
- The target format has to be designed carefully up front.
- The monorepo gains a Cargo workspace and a Rust job in CI, which raises the prerequisites for contributors touching the format.

**Contract gaps surfaced by this ADR** (to be filed as separate `cv-backend-spec` issues):

- **`Keypoint.level` is ambiguous across backends.** A level index only has meaning together with the pyramid scale step that produced it, and that step is an internal constant of each backend (`Math.cbrt(2)` in `cv-backend-jsfeatnext`), not part of the contract. Passing stored keypoints to another backend's `describe` — for example to re-describe a target on the runtime backend — silently computes descriptors at the wrong scale if the steps differ. Proposal: declare the step (e.g. as a capability). The target format already records it.
- **Same `DescriptorKind`, different bits.** Two backends that both declare `"orb"` (or `"teblid"`) may produce different bits because of the sampling pattern, the smoothing or the orientation quantisation. The `kind` guard from jsfeatNext#128 cannot see this. Proposal: a cross-backend descriptor conformance test on a fixture image, or a variant/version field on `Descriptors`.
- **No k-nearest matching.** `match` exposes the best match or an internal ratio test, but not the k nearest neighbours. Multi-view target descriptors need a ratio test where the second-best candidate belongs to a *different keypoint*, which the tracker cannot do without the neighbours.
- **Missing selectors.** `DetectOptions` has no detector selector and no spatial-distribution control (grid or bucketing); `RansacOptions` has no estimator selector (e.g. PROSAC). All are non-breaking additions.
- **Single pose.** `poseFromHomography` returns one pose. Planar ambiguity resolution (IPPE, two candidates) is done in the tracker for now.

**To revisit:**

- The point 5 thresholds, after the first measurements on the reference device.
- Whether `nft-tracker` should be split (e.g. the target compiler as its own package) once it grows.

## Action items

1. [x] Review and accept this ADR; add a pointer to `docs/adr/` in `AGENTS.md`.
2. [x] Review and accept [`docs/specs/nft-target-format.md`](../specs/nft-target-format.md) (v0).
3. [x] Scaffold `packages/nft-tracker` (package.json, tsconfig, vitest, LGPL headers) and append it to the root `build` script **after** the spec — the build order is load-bearing.
4. [ ] **M1 — parity:** a detection-only `NftTracker` equivalent to the webcam demo; move `buildLevelIndex` / `matchPerLevel` from `examples/js/pinball-shared.mjs` into the package, with tests.
5. [ ] File the contract issues listed under "Contract gaps".
6. [ ] Pick the reference device; record baseline numbers for the stateless demo.
7. [ ] **M2** patch tracker + state machine → **M3** IPPE + One Euro filter → **M4** target compiler with synthetic views. Each milestone is measured against the previous one on the same recorded sequences.

## References

- `packages/cv-backend-spec/src/cv_backend.ts` — the contract and its layering statement.
- `examples/README.md` — per-level matching, the stateless webcam demo, the single-scale live-frame limitation.
- jsfeatNext#96 (contract), jsfeatNext#128 (descriptor selection and capabilities), jsfeatNext#129 (`filterMatches`); webarkit/webarkit#11 (RANSAC restarts).
- D. Wagner, G. Reitmayr, A. Mulloni, T. Drummond, D. Schmalstieg, *Real-Time Detection and Tracking for Augmented Reality on Mobile Phones*, IEEE TVCG 16(3), 2010 — the detection + patch-tracker architecture.
- F. Göttl, P. Gagel, J. Grubert, *Efficient Pose Tracking from Natural Features in Standard Web Browsers*, Web3D 2018 (arXiv:1804.08424) — the same architecture in WebAssembly.
- T. Collins, A. Bartoli, *Infinitesimal Plane-Based Pose Estimation*, IJCV 109(3), 2014.
