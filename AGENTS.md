# AGENTS.md — webarkit

> Canonical instructions for AI coding agents (Claude Code, GitHub Copilot, Cursor, Antigravity, Codex, …).
> This is the **single source of truth**; `CLAUDE.md`, `.agents/instructions.md`, and `.github/copilot-instructions.md` point here.
> Every package carries its own `AGENTS.md` for package-local detail — [`cv-backend-spec`](./packages/cv-backend-spec/AGENTS.md), [`cv-backend-jsfeatnext`](./packages/cv-backend-jsfeatnext/AGENTS.md), [`nft-tracker`](./packages/nft-tracker/AGENTS.md) — each with a thin `CLAUDE.md` importing it. Those files **add to** this one and never override it; where they disagree, this file wins and the package file is the bug.

## What this project is

**webarkit** is the central repository for the [webarkit](https://github.com/webarkit) organization: the shared **`CvBackend` contract** that lets a high-level WebAR project swap computer-vision backends without rewriting itself, plus the reference backend that implements it. See the root [README](./README.md) for the full "why" and how this fits alongside jsfeatNext, WebARKitLib-rs, PureCV and jsartoolkitNFT — don't duplicate that context here, read it there.

## Environment & commands

- **Node:** version pinned in [`.nvmrc`](./.nvmrc) (currently v24.18.0); `package.json` sets a floor of `>=18`. **Package manager:** npm 9+ (for [workspaces](https://docs.npmjs.com/cli/v9/using-npm/workspaces)).
- Install: `npm install` — resolves and symlinks every workspace package, no publish step needed to develop against them together.
- Build: `npm run build` — builds `@webarkit/cv-backend-spec`, **then** `@webarkit/cv-backend-jsfeatnext`, **then** `@webarkit/nft-tracker`, in that order. That order is load-bearing, not incidental — but the chain is not simply "each on the previous", and the difference is the architecture showing through. `cv-backend-jsfeatnext`'s build type-checks against the spec's freshly-built `dist/`. `nft-tracker`'s build needs the **spec's** `dist/` and *not* the backend's: its `src/` may not import a backend at all (ADR-0001, point 2), so it compiles fine with `cv-backend-jsfeatnext/dist` deleted — the injected-backend rule made visible in the build graph. What does need the backend built is `nft-tracker`'s **typecheck**, which widens the program to `test/`, where a real backend is injected; that step runs after `build`. npm's own default (alphabetical) workspace build order broke this once already (see commit `109caaf`) — don't "simplify" this into a bare `npm run build --workspaces`.
- Typecheck: `npm run typecheck` — `tsc` across `src/` **and** `test/` in every workspace (separate from build, which only checks `src/`).
- **Test:** `npm test` — Vitest across every workspace, then over `examples/test/` (`npm run test:examples`): the bench page's logic lives in `examples/js/bench-metrics.mjs`, and `examples/` is not a workspace, so the root declares `vitest` for it.
- These four are exactly what the `build-and-test` job in [`.github/workflows/CI.yml`](./.github/workflows/CI.yml) runs on every push and pull request. Do not claim a change is verified without actually running them.
- **Contract sync:** `npm run check:contract` — the contract's `DescriptorKind`/`DescriptorNorm`/`DetectorKind` unions, the TypeScript codec's `known.ts` lists and the Rust codec's `known.rs` lists must agree, and both codecs must claim the same format and container version. Reads source text: no build, no install, no Rust toolchain. It is its own CI job (`contract-sync`) because what it checks belongs to neither toolchain — see the Conventions note below for why no test suite can catch it.
- **Rust:** stable, 1.85 or newer (edition 2024); the crates live in a Cargo workspace at the repository root (`members = ["crates/*"]`), beside the npm workspaces. The two toolchains share this repository and the `fixtures/` corpus and nothing else — there is no build ordering between them.
  - Test: `cargo test --workspace`
  - Format: `cargo fmt --all --check`
  - Lint: `cargo clippy --workspace --all-targets -- -D warnings`
  - `no_std` check: `cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf` — a bare-metal target, because a crate that accidentally depends on `std` still builds for the *host* with `--no-default-features`. Install it once with `rustup target add thumbv7em-none-eabihf`.
  - These four are exactly what the `rust` job in [`.github/workflows/CI.yml`](./.github/workflows/CI.yml) runs. Do not claim a change is verified without actually running them.
  - Fuzzing (§8.4) is **not** in CI: it needs nightly and has no natural stopping point. See [`crates/wnft-format/README.md`](./crates/wnft-format/README.md).

## Architecture — read this before editing

- npm-workspaces monorepo (`workspaces: ["packages/*"]`), **no Turborepo/Nx yet** — deliberately: with three packages in one straight line, ordering the build steps by hand in the root `package.json` script is still simpler than standing up a task-graph tool. Revisit once there are several packages, or once builds start depending on each other's outputs in a way plain scripts can't express (see the root README's Layout section for the fuller reasoning, and [turbo.build/repo/docs](https://turbo.build/repo/docs) / [nx.dev](https://nx.dev) if evaluating that later).
- `packages/cv-backend-spec` — the `CvBackend` **contract only**: types and interfaces, no implementation. Neutral types (typed arrays, plain structs) — no `matrix_t`, no jsfeatNext- or WASM-specific types. Zero runtime dependencies, and it must stay that way. See its own [`AGENTS.md`](./packages/cv-backend-spec/AGENTS.md).
- `packages/cv-backend-jsfeatnext` — jsfeatNext's implementation of that contract, and the org's numeric oracle. Depends on **both** the spec and `@webarkit/jsfeat-next` (`^0.17.0`); neither of those depends on it — keep that dependency arrow one-directional. See its own [`AGENTS.md`](./packages/cv-backend-jsfeatnext/AGENTS.md).
- `packages/nft-tracker` — the NFT tracker, written **above** the contract ([ADR-0001](./docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md)), and the TypeScript codec for the `.wnft` target format in `src/target/format`. Its only runtime dependency is the spec; every backend is a devDependency and is injected by the caller, so nothing in its `src/` may import one. It has its own [`AGENTS.md`](./packages/nft-tracker/AGENTS.md) for the rest, including the fixture generator's delete-before-write behaviour.
- `examples/` — demos live at the repo root, not inside a package, because they exercise the **contract**, not one implementation. See [`examples/README.md`](./examples/README.md).
- **No package is published to npm yet** (all pre-1.0, and `nft-tracker` is additionally `"private": true`). Don't write installation instructions elsewhere in the repo that assume `npm install @webarkit/cv-backend-*` works from the public registry — it doesn't yet.
- `crates/wnft-format` — the Rust codec for the `.wnft` target format. It is the format's **second** implementation and a **peer** of the TypeScript codec in `packages/nft-tracker/src/target/format`, not a port of it: [`docs/specs/nft-target-format.md`](./docs/specs/nft-target-format.md) is the source of truth, and the point of there being two implementations is that a specification with one is only a description of that one (§1). Implement from the specification text; if the two codecs disagree, that is a specification bug or a codec bug and it is decided before code is written.
- `examples/targets/pinball.wnft` is **generated but committed**, by
  `packages/nft-tracker/bin/compile-target.mjs` from `examples/images/pinball.jpg`
  (the exact command is in [`examples/README.md`](./examples/README.md)). Two
  things read it: the static demo's "target from" selector, and
  `crates/wnft-format/tests/real_target.rs`, for which it is the first real —
  as opposed to synthetic — target either codec has seen. Recompiling it is
  therefore a change to that test's expectations, not a refresh: update the
  asserted counts in the same commit, or don't recompile. It is deliberately
  **not** in `fixtures/nft-target/`, which may only hold what the corpus
  generator produces.
- **`fixtures/nft-target/` is generated, shared, and read-only for Rust.** The TypeScript generator produces it; `crates/wnft-format` consumes it and MUST NEVER regenerate it. A second implementation that rebuilt the corpus from its own writer would be checking itself against itself, and §8.2 item 4 would prove nothing. See [`fixtures/nft-target/README.md`](./fixtures/nft-target/README.md).

## Test assets

- **Deterministic fixtures that a committed script regenerates** — the `.wnft` corpus in `fixtures/nft-target/`, the PGMs in `packages/nft-tracker/test/fixtures/`, `examples/targets/*.wnft` — stay in this repository, next to their generator. A format change must touch the spec, the fixtures and both codecs in one PR; splitting them out into another repository makes it possible to forget one of the three.
- **Opaque binary media** (video, photos) is added only when it serves a reproducible measurement, is re-encoded as small as the measurement allows, and is replaced as rarely as possible — every replacement leaves the old bytes in this repository's git history forever.
- When the media total passes roughly 50 MB, or a clip needs replacing more than once or twice, move it to a versioned npm package (`@webarkit/test-assets`, a devDependency) instead of committing it directly. Not a submodule, and not a branch-name-pinned sibling repository the way OpenCV vendors `opencv_extra`: both let the two trees drift apart and fail CI for reasons unrelated to the change at hand. Current total: about 4.1 MB, across the three clips in `examples/videos/`.
- **Benchmark exports** (`docs/benchmarks/`) keep the per-frame JSON for the runs a milestone is measured against; the directory's own README carries the summary. If the per-frame files become numerous, keep the summaries and only the most recent runs' raw files, and say so there when that happens.

## Conventions

- **Language:** every repository artifact — code, comments, commit messages, PR titles and bodies, issues, docs — is written in English, whatever language the conversation with the agent uses.
- **Formatting is prettier's job, not review's.** `npm run format` writes, `npm run format:check` is a CI gate, and `.prettierrc.json` holds the settings (4-space, `printWidth` 100, double quotes, trailing commas — chosen to match what the code already looked like, so adopting it moved about 1,800 lines rather than all 15,000). Scope is `packages/*/src`, `packages/*/test`, `packages/*/bin` and `scripts/` — deliberately **not** Markdown and not `examples/`, whose pages are read together with their inline scripts. Rust keeps `cargo fmt`. A `PostToolUse` hook runs both on files an agent edits, so agent output arrives formatted rather than being corrected in review.
- TypeScript, and Rust in `crates/`. License: **LGPL-3.0-or-later**. Existing `src/` files in both packages and in `crates/wnft-format` (its `src/`, `tests/` and fuzz target included) carry an LGPL header — match that template for new files in the same crate or package. This repo does not yet have jsfeatNext's automated header-check script (`scripts/check-license-headers.mjs`); for now this is enforced by review, not CI.
- Preserve the public `CvBackend` contract surface (`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`, optional `filterMatches`) unless a change to `cv-backend-spec` is explicitly intended and reflected in both packages together. Changing `DescriptorKind` or `DescriptorNorm` in `packages/cv-backend-spec/src/cv_backend.ts` requires resyncing `crates/wnft-format/src/known.rs`, which hand-transcribes both unions: a drift shows up only as a descriptor set that one codec warns about and drops while the other accepts it, on a file no fixture contains, so the shared corpus cannot catch it. `npm run check:contract` ([`scripts/check-contract-sync.mjs`](./scripts/check-contract-sync.mjs)) is what catches it instead; run it after touching either union, and don't take a green `npm test` and `cargo test` as evidence on this point, because neither can see it.
- Keep capability negotiation between the contract and its implementations honest: `capabilities` must never claim something the API can't actually reach (see `cv-backend-jsfeatnext/README.md`'s own notes on `detectors`/`matchFilters` for why this matters).
- Never commit `.idea/` (already in `.gitignore`).

## Design records

- Architecture decisions live in [`docs/adr/`](./docs/adr/); the formats and protocols they decide are specified in [`docs/specs/`](./docs/specs/). Read the relevant record before changing anything it covers.
- **An accepted ADR's decision is never edited in place.** Changing it needs the next ADR: state what it supersedes there, and mark the old one `Superseded by ADR-XXXX`. Only ADRs still in `Proposed` are edited freely.
- Three edits to an accepted ADR are allowed in place, because none of them changes the decision: ticking off an action item, fixing a broken link, and adding an entry under "To revisit" that records a measurement or a fact which may later justify revisiting the decision. The third is the one worth explaining, since it looks the most like changing the decision without actually doing so: it doesn't change what was decided, it records the evidence a future superseding ADR would be written from — and if that evidence is written down somewhere else instead, the next person to read the ADR weighs the original decision without it.

## Git & contribution workflow

- **Open PRs against `dev` — never `master`.** `dev` is the integration branch; `master` is for stable releases only. This matches the convention already in place in [webarkit/jsfeatNext](https://github.com/webarkit/jsfeatNext) and [webarkit/purecv](https://github.com/webarkit/purecv) (both of which call their release branch `main` — this repo's is named `master`, so don't copy the branch name verbatim from those, only the workflow).
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):** `type(scope): summary` — e.g. `feat(cv-backend-jsfeatnext): …`, `fix(cv-backend-spec): …`, `docs: …`, `chore: …`, `test: …`, `refactor: …`, `ci: …`. Keep the subject imperative and concise. Common scopes so far: `cv-backend-spec`, `cv-backend-jsfeatnext`, `examples`, `ci` — omit the scope for changes spanning the whole repo (root README, this file, CI config).
- One branch per task/issue, branched from an up-to-date `dev`.

## Before you make changes

- Small, incremental, reviewable diffs. Match surrounding code style.
- Keep `npm run build`, `npm run typecheck`, and `npm test` green.
- If you're touching `estimateHomography` or anything RANSAC-related in `cv-backend-jsfeatnext`, read that package's README section on it first — its current behavior (`find_homography`, `RANSAC_RESTARTS = 3`) was arrived at empirically (see [webarkit/webarkit#11](https://github.com/webarkit/webarkit/issues/11)), not by default choice.
