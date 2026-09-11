# webarkit

[![CI](https://github.com/webarkit/webarkit/actions/workflows/CI.yml/badge.svg)](https://github.com/webarkit/webarkit/actions/workflows/CI.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: LGPL v3](https://img.shields.io/badge/License-LGPL%20v3-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/webarkit/webarkit.svg?style=social)](https://github.com/webarkit/webarkit/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/webarkit/webarkit.svg?style=social)](https://github.com/webarkit/webarkit/network/members)

Central repository for the [webarkit](https://github.com/webarkit) organization — home for the **shared contract** that lets a high-level WebAR project swap computer-vision backends without rewriting itself, plus the reference backend that implements it.

## 🤔 Why this project exists

Every WebAR pipeline needs the same core steps — detect features, describe them, match them across frames, estimate a homography, recover a pose — but the *right* implementation of those steps depends on the target: a pure-TypeScript backend is easiest to debug and ship with zero build step, while a Rust → WASM backend is what you want once performance matters. Without a shared interface, "switch backend later" means a rewrite.

This repo is where that interface lives, defined once and owned by neither backend, so a high-level AR project can depend on the *contract* instead of on any one implementation.

## 🧭 Status

**Early / actively evolving.** This repository moved from proposal to working code — `@webarkit/cv-backend-spec` and `@webarkit/cv-backend-jsfeatnext` both build, are tested in CI, and back real example pages (see [Examples](#-examples) below) — but the packages are **pre-1.0 and not yet published to npm**. Expect API surface to still shift.

> The original restructuring proposal below is kept for context, even though the layout it describes is what's actually in place. Treat package naming, scope, and layout as open for discussion, not frozen.

## 🧩 The ecosystem: more than one way to build WebAR CV

`webarkit` is one piece of a larger, deliberately pluralistic effort — the org is exploring more than one architecture at once rather than betting on a single stack too early:

- **[jsfeatNext](https://github.com/webarkit/jsfeatNext)** — a TypeScript rewrite of [jsfeat](https://github.com/inspirit/jsfeat). Pure JS/TS, no WASM, no build step required to consume it. This repo's **reference implementation** of the `CvBackend` contract, and the numeric oracle other backends get checked against.
- **[WebARKitLib-rs](https://github.com/webarkit/WebARKitLib-rs)** — a full Rust port of the original [WebARKitLib](https://github.com/webarkit/WebARKitLib) (C/C++, ARToolKit-derived): the whole NFT/KPM marker-tracking engine end to end, not just CV primitives. Published as `webarkitlib-rs` on crates.io and `@webarkit/webarkitlib-wasm` on npm. Its CV-primitives layer is planned to be **[PureCV](https://github.com/webarkit/purecv)** — a pure-Rust reimplementation of OpenCV's `core`/`imgproc`/`features2d`/`video`/`calib3d` modules (memory-safe, SIMD-accelerated, portable down to `no_std` microcontrollers), already published on its own (`purecv` on crates.io, `@webarkit/purecv-wasm` on npm) and under active development. Neither speaks this repo's `CvBackend` contract yet — wrapping PureCV as its own `CvBackend`, the way `cv-backend-jsfeatnext` wraps jsfeatNext, is a separate, not-yet-scheduled possibility.
- **[jsartoolkitNFT](https://github.com/webarkit/jsartoolkitNFT)** — an architectural reference: KPM (WASM) as the stateless CV layer with TypeScript orchestration on top, which is the split this repo's contract formalizes. Whether it actually becomes a `CvBackend` here is still open **(?)** — it would need restructuring, or a new adapter layer, to speak this contract, and that isn't happening in the near term.

If you're deciding where to plug in: **jsfeatNext** is the place to start today (it's the only backend that implements the contract end to end). **WebARKitLib-rs** (running on PureCV underneath) is not a drop-in `CvBackend` yet.

## 📦 Packages

| Package | Description |
|---|---|
| [`@webarkit/cv-backend-spec`](./packages/cv-backend-spec) | Minimal stateless CV backend interface (`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`) implemented by jsfeatNext and (future) WebARKitLib-rs. |
| [`@webarkit/cv-backend-jsfeatnext`](./packages/cv-backend-jsfeatnext) | The jsfeatNext implementation of that contract. Depends on the spec **and** on `@webarkit/jsfeat-next` (>= 0.16.0); neither of those depends on it. |
| [`@webarkit/nft-tracker`](./packages/nft-tracker) | Natural-feature tracking for planar image targets, written **above** the contract. Depends on the spec alone — the backend is injected by the caller, so it runs on any implementation. Currently the in-memory target types only; see [ADR-0001](./docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md) and the [target format spec](./docs/specs/nft-target-format.md). |

None of the three is published to npm yet — see [Getting started](#-getting-started) for installing from source. `nft-tracker` is `private` and pre-0.1.

## 🚀 Getting started

### Prerequisites

- Node.js — version pinned in [`.nvmrc`](./.nvmrc) (currently v24.18.0); `package.json` sets a floor of `>=18`.
- npm 9+ (for [workspaces](https://docs.npmjs.com/cli/v9/using-npm/workspaces) support).

### Install

```bash
git clone https://github.com/webarkit/webarkit.git
cd webarkit
npm install
```

`npm install` resolves and symlinks every workspace package, so `cv-backend-jsfeatnext` and `nft-tracker` pick up `cv-backend-spec` straight from the sibling folder — no publish step needed to develop against them together.

### Build, typecheck, test

```bash
npm run build       # cv-backend-spec, then cv-backend-jsfeatnext, then nft-tracker (in that order — see .github/workflows/CI.yml)
npm run typecheck   # tsc across src/ + test/ in every workspace
npm test            # vitest across every workspace
```

These three are exactly what CI runs on every push and pull request.

## 🖼️ Examples

Two runnable demos exercise the full `CvBackend` pipeline — `detect → describe → match → estimateHomography → poseFromHomography` — end to end against real images and a live webcam:

```bash
npm run build
npx http-server -p 8080 -s
```

Then open `http://localhost:8080/examples/pinball-static-jsfeatnext-backend.html` (two still photos, easiest to debug) or `.../pinball-webcam-jsfeatnext-backend.html` (live camera, stateless per tick).

See [`examples/README.md`](./examples/README.md) for what each demo shows, why the static one came first, and the multi-scale detection/matching details that came out of building them.

## 🗂️ Layout

This is an npm-workspaces monorepo — no build-system layer ([Turborepo](https://turbo.build/repo/docs)/[Nx](https://nx.dev))
yet; at three packages, ordering the build steps by hand is still simpler
than standing up a task graph. Revisit once there are several more, or once
builds start depending on each other's outputs in a way plain scripts
cannot express.

```
webarkit/
  examples/
  packages/
    cv-backend-spec/
    cv-backend-jsfeatnext/
    nft-tracker/
```

## ❓ Open questions for discussion

- Package naming: `cv-backend-spec` vs `cv-contract` vs something else.
- Should the high-level AR project eventually live here too as
  `packages/ar-core`, or stay a separate repo that depends on
  `@webarkit/cv-backend-spec` via npm?
- Publishing: npm org scope `@webarkit/*` — confirm we still hold it /
  who has publish rights.
- Do we want a monorepo tool once we have 3+ packages, or is npm workspaces
  enough long-term?
