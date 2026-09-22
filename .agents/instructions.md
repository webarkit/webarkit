# Agent instructions

The canonical instructions for this repository live in **[`AGENTS.md`](../AGENTS.md)** at the project root.

Please read that file first. It covers the layout — an npm-workspaces monorepo (`packages/cv-backend-spec` is the `CvBackend` contract, `packages/cv-backend-jsfeatnext` is jsfeatNext's implementation of it, `packages/nft-tracker` is the NFT tracker and the TypeScript `.wnft` codec, built in that order) beside a **Cargo workspace** (`crates/wnft-format`, the Rust codec for the same format). The two toolchains share this repository and the `fixtures/` corpus and nothing else; there is no build ordering between them.

It also covers the exact commands CI runs — `npm install`, `npm run build`, `npm run typecheck`, `npm test` for the npm side, and `cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` plus a `thumbv7em-none-eabihf` `no_std` build for the Rust side — the Conventional Commits + `dev`-not-`master` PR convention shared with [webarkit/jsfeatNext](https://github.com/webarkit/jsfeatNext) and [webarkit/purecv](https://github.com/webarkit/purecv) (this repo's release branch is `master`, not `main` like those two), and the LGPL license header expected on new source files.

Design records live in [`docs/adr/`](../docs/adr/) and the formats they decide in [`docs/specs/`](../docs/specs/); read the relevant one before changing anything it covers. An accepted ADR's decision is never edited in place.

Every package carries its own `AGENTS.md` with package-local detail — [cv-backend-spec](../packages/cv-backend-spec/AGENTS.md), [cv-backend-jsfeatnext](../packages/cv-backend-jsfeatnext/AGENTS.md), [nft-tracker](../packages/nft-tracker/AGENTS.md) — each with a thin `CLAUDE.md` importing it. Those add to the root file and never override it.

No package is published to npm yet (all are pre-1.0, and `nft-tracker` is `"private": true`) — see the root [README](../README.md) for building from source and for how this repo fits into the wider webarkit ecosystem (jsfeatNext, WebARKitLib-rs, PureCV, jsartoolkitNFT).
