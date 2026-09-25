# webarkit

[![CI](https://github.com/webarkit/webarkit/actions/workflows/CI.yml/badge.svg)](https://github.com/webarkit/webarkit/actions/workflows/CI.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-2024-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![no_std](https://img.shields.io/badge/no__std-forbid(unsafe__code)-success)](./crates/wnft-format)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)
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
| [`@webarkit/cv-backend-jsfeatnext`](./packages/cv-backend-jsfeatnext) | The jsfeatNext implementation of that contract. Depends on the spec **and** on `@webarkit/jsfeat-next` (>= 0.17.0); neither of those depends on it. |
| [`@webarkit/nft-tracker`](./packages/nft-tracker) | Natural-feature tracking for planar image targets, written **above** the contract. Depends on the spec alone — the backend is injected by the caller, so it runs on any implementation. Currently the target layer — the in-memory target types, the `.wnft` codec (`decode`/`encode`) for the files that store one, an image-to-target builder — plus per-pyramid-level matching and a detection-only `NftTracker` (milestone M1), whose per-frame result reports a `state` (`DETECT` or `LOST`) and a `quality`. The milestone-M2 tracking-state contract — patch selection, frame pyramid, IC-LK patch alignment, IRLS homography, constant-velocity prediction — is defined and exported; patch selection is implemented and `compile-target` writes its patches into the `.wnft`, the IRLS homography and the constant-velocity prediction are implemented too, and the frame pyramid and patch alignment are still **stubs** that return `not-implemented` until their implementations land ([#48](https://github.com/webarkit/webarkit/issues/48)). See [ADR-0001](./docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md) and the [target format spec](./docs/specs/nft-target-format.md). |

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

These three are exactly what CI's Node job runs on every push and pull request.
The Rust crate in `crates/` is a separate CI job, and needs a stable toolchain
(1.85+, edition 2024):

```bash
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
```

Those four are the whole Rust gate. The last one needs `rustup target add
thumbv7em-none-eabihf` once: it is a bare-metal target because that is the only
way to prove the crate really is `no_std` — one that accidentally depends on
`std` still builds for the *host* with `--no-default-features`, since the host's
`std` is right there.

## 🖼️ Examples

Two runnable demos exercise the full `CvBackend` pipeline — `detect → describe → match → estimateHomography → poseFromHomography` — end to end against real images and a live webcam:

```bash
npm run build
npx http-server -p 8080 -s
```

Then open `http://localhost:8080/examples/pinball-static-jsfeatnext-backend.html` (two still photos, easiest to debug) or `.../pinball-webcam-jsfeatnext-backend.html` (live camera, stateless per tick).

See [`examples/README.md`](./examples/README.md) for what each demo shows, why the static one came first, and the multi-scale detection/matching details that came out of building them.

## 🎯 Compiled targets (`.wnft`)

A tracker needs a *prepared* reference image: keypoints over a pyramid, plus a
descriptor for each. The demos used to compute that in the browser on every page
load. It can instead be compiled once, offline, into a `.wnft` file — the format
specified in [`docs/specs/nft-target-format.md`](./docs/specs/nft-target-format.md)
and implemented twice, in TypeScript ([`packages/nft-tracker`](./packages/nft-tracker))
and in Rust ([`crates/wnft-format`](./crates/wnft-format)):

```bash
npm run build
node packages/nft-tracker/bin/compile-target.mjs examples/images/pinball.jpg \
    -o examples/targets/pinball.wnft --physical-size 210x262.5
```

The static demo's **"target from"** selector runs the same pipeline either way,
which is how you can see that the file carries a target rather than merely
storing one.

To check one — a file you were given, or one that refuses to track:

```bash
node packages/nft-tracker/bin/validate-target.mjs examples/targets/pinball.wnft
```

It answers two questions, and they are not the same one. **Is the file valid?**
against the specification, with a §6.2 error code when it is not. **Can a
backend use it?** by running §6.3's descriptor-set selection against a real
backend's capabilities — because a perfectly valid file can still be unusable,
and decoding alone never says so. Exit `0` valid and usable, `1` neither, `2`
bad usage; `--decode-only` checks the file without loading a backend, `--json`
for scripts.

### What it buys you

Preparing this target costs roughly **200× more than loading it**. Measured on
one development machine (Node as pinned in [`.nvmrc`](./.nvmrc), jsfeatNext
backend, `examples/images/pinball.jpg` at 512×640 → 2062 keypoints over 8 levels,
a 110,600-byte file), median of 30 runs after warm-up. That file predates the
tracking patches; the committed one now also carries 64 of them and is 128,144
bytes, and has not been re-measured:

| | median | min–max |
|---|---|---|
| `buildTargetFromImage` — detect + describe, 8 pyramid levels | **84.0 ms** | 68.6 – 120.9 |
| `decode` of the `.wnft` | **0.40 ms** | 0.27 – 1.44 |
| `decode` + reading every descriptor byte | 0.48 ms | 0.42 – 0.87 |

Three things that table says, which a single ratio would not:

- **The descriptors are not the cost of decoding.** Touching all 2062 × 32 bytes
  adds 0.08 ms. They are stored as raw bytes and arrive as raw bytes; what the
  decoder actually spends its time on is the CRC-32 over the file and the
  manifest. "Loading descriptors" is very nearly free.
- **The two costs scale differently.** Building grows with image area × pyramid
  levels; decoding grows with file size, at a tiny constant. Raising `--levels`
  or `--max-side` widens the gap rather than closing it.
- **The demo's own "target prepared in" row shows a much smaller gap** (~25 ms
  for the file path) because it times the `fetch()` of the file (110 KB when
  measured, 128 KB with today's patches) along with
  the decode. That is the honest answer to "what did it cost to get a target
  here?", and it is dominated by the network, not by the format.

One machine, one image, one backend: the direction is not in doubt, the exact
factor is.

## 🗂️ Layout

This is an npm-workspaces monorepo — no build-system layer ([Turborepo](https://turbo.build/repo/docs)/[Nx](https://nx.dev))
yet; at three packages, ordering the build steps by hand is still simpler
than standing up a task graph. Revisit once there are several more, or once
builds start depending on each other's outputs in a way plain scripts
cannot express.

```
webarkit/
  crates/
    wnft-format/         # the Rust codec for .wnft — a peer of the TypeScript
                         # one, written from the spec, not ported from it
  examples/
    targets/             # compiled .wnft targets the demos can load
  fixtures/
    nft-target/          # the .wnft conformance corpus, one directory per
                         # released format version (generated, never edited)
  packages/
    cv-backend-spec/
    cv-backend-jsfeatnext/
    nft-tracker/
```

`crates/` is a Cargo workspace beside the npm ones. The two toolchains share
this repository and the `fixtures/` corpus and nothing else — there is no build
ordering between them, which is why CI runs them as independent jobs.

`fixtures/` sits at the repository root, not inside `nft-tracker`, for the
reason `examples/` does: the corpus pins down the **format**, which
`crates/wnft-format` is checked against too, not one implementation of it. The
point of a second implementation is that a specification with one is only a
description of that one — so the Rust codec *consumes* that corpus and never
regenerates it.

## ❓ Open questions for discussion

- Package naming: `cv-backend-spec` vs `cv-contract` vs something else.
- Should the high-level AR project eventually live here too as
  `packages/ar-core`, or stay a separate repo that depends on
  `@webarkit/cv-backend-spec` via npm?
- Publishing: npm org scope `@webarkit/*` — confirm we still hold it /
  who has publish rights.
- Do we want a monorepo tool once we have 3+ packages, or is npm workspaces
  enough long-term?
