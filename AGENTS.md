# AGENTS.md — webarkit

> Canonical instructions for AI coding agents (Claude Code, GitHub Copilot, Cursor, Antigravity, Codex, …).
> This is the **single source of truth**; `CLAUDE.md`, `.agents/instructions.md`, and `.github/copilot-instructions.md` point here.

## What this project is

**webarkit** is the central repository for the [webarkit](https://github.com/webarkit) organization: the shared **`CvBackend` contract** that lets a high-level WebAR project swap computer-vision backends without rewriting itself, plus the reference backend that implements it. See the root [README](./README.md) for the full "why" and how this fits alongside jsfeatNext, WebARKitLib-rs, PureCV and jsartoolkitNFT — don't duplicate that context here, read it there.

## Environment & commands

- **Node:** version pinned in [`.nvmrc`](./.nvmrc) (currently v24.18.0); `package.json` sets a floor of `>=18`. **Package manager:** npm 9+ (for [workspaces](https://docs.npmjs.com/cli/v9/using-npm/workspaces)).
- Install: `npm install` — resolves and symlinks both workspace packages, no publish step needed to develop against both together.
- Build: `npm run build` — builds `@webarkit/cv-backend-spec` **then** `@webarkit/cv-backend-jsfeatnext`, in that order. That order is load-bearing, not incidental: `cv-backend-jsfeatnext`'s build type-checks against the spec's freshly-built `dist/`, and npm's own default (alphabetical) workspace build order broke this once already (see commit `109caaf`) — don't "simplify" this into a bare `npm run build --workspaces`.
- Typecheck: `npm run typecheck` — `tsc` across `src/` **and** `test/` in every workspace (separate from build, which only checks `src/`).
- **Test:** `npm test` — Vitest across every workspace.
- These four are exactly what [`.github/workflows/CI.yml`](./.github/workflows/CI.yml) runs on every push and pull request. Do not claim a change is verified without actually running them.
- **Rust:** stable, 1.85 or newer (edition 2024); the crates live in a Cargo workspace at the repository root (`members = ["crates/*"]`), beside the npm workspaces. The two toolchains share this repository and the `fixtures/` corpus and nothing else — there is no build ordering between them.
  - Test: `cargo test --workspace`
  - Format: `cargo fmt --all --check`
  - Lint: `cargo clippy --workspace --all-targets -- -D warnings`
  - `no_std` check: `cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf` — a bare-metal target, because a crate that accidentally depends on `std` still builds for the *host* with `--no-default-features`. Install it once with `rustup target add thumbv7em-none-eabihf`.
  - These four are exactly what the `rust` job in [`.github/workflows/CI.yml`](./.github/workflows/CI.yml) runs. Do not claim a change is verified without actually running them.
  - Fuzzing (§8.4) is **not** in CI: it needs nightly and has no natural stopping point. See [`crates/wnft-format/README.md`](./crates/wnft-format/README.md).

## Architecture — read this before editing

- npm-workspaces monorepo (`workspaces: ["packages/*"]`), **no Turborepo/Nx yet** — deliberately: with two packages, ordering the two build steps by hand in the root `package.json` script is simpler than standing up a task-graph tool. Revisit once there are several packages, or once builds start depending on each other's outputs in a way plain scripts can't express (see the root README's Layout section for the fuller reasoning, and [turbo.build/repo/docs](https://turbo.build/repo/docs) / [nx.dev](https://nx.dev) if evaluating that later).
- `packages/cv-backend-spec` — the `CvBackend` **contract only**: types and interfaces, no implementation. Neutral types (typed arrays, plain structs) — no `matrix_t`, no jsfeatNext- or WASM-specific types.
- `packages/cv-backend-jsfeatnext` — jsfeatNext's implementation of that contract. Depends on **both** the spec and `@webarkit/jsfeat-next` (`^0.16.0`); neither of those depends on it — keep that dependency arrow one-directional.
- `examples/` — demos live at the repo root, not inside a package, because they exercise the **contract**, not one implementation. See [`examples/README.md`](./examples/README.md).
- **Neither package is published to npm yet** (both are pre-1.0). Don't write installation instructions elsewhere in the repo that assume `npm install @webarkit/cv-backend-*` works from the public registry — it doesn't yet.
- `crates/wnft-format` — the Rust codec for the `.wnft` target format. It is the format's **second** implementation and a **peer** of the TypeScript codec in `packages/nft-tracker/src/target/format`, not a port of it: [`docs/specs/nft-target-format.md`](./docs/specs/nft-target-format.md) is the source of truth, and the point of there being two implementations is that a specification with one is only a description of that one (§1). Implement from the specification text; if the two codecs disagree, that is a specification bug or a codec bug and it is decided before code is written.
- **`fixtures/nft-target/` is generated, shared, and read-only for Rust.** The TypeScript generator produces it; `crates/wnft-format` consumes it and MUST NEVER regenerate it. A second implementation that rebuilt the corpus from its own writer would be checking itself against itself, and §8.2 item 4 would prove nothing. See [`fixtures/nft-target/README.md`](./fixtures/nft-target/README.md).

## Conventions

- **Language:** every repository artifact — code, comments, commit messages, PR titles and bodies, issues, docs — is written in English, whatever language the conversation with the agent uses.
- TypeScript. License: **LGPL-3.0-or-later**. Existing `src/` files in both packages carry an LGPL header — match that template for new files in the same package. This repo does not yet have jsfeatNext's automated header-check script (`scripts/check-license-headers.mjs`); for now this is enforced by review, not CI.
- Preserve the public `CvBackend` contract surface (`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`, optional `filterMatches`) unless a change to `cv-backend-spec` is explicitly intended and reflected in both packages together.
- Keep the two packages' capability negotiation honest: `capabilities` must never claim something the API can't actually reach (see `cv-backend-jsfeatnext/README.md`'s own notes on `detectors`/`matchFilters` for why this matters).
- Never commit `.idea/` (already in `.gitignore`).

## Design records

- Architecture decisions live in [`docs/adr/`](./docs/adr/); the formats and protocols they decide are specified in [`docs/specs/`](./docs/specs/). Read the relevant record before changing anything it covers.
- **An accepted ADR is not edited — it is superseded by a new one.** To change an accepted decision, write the next ADR, state what it supersedes, and mark the old one `Superseded by ADR-XXXX`. Only ADRs still in `Proposed` are edited in place.

## Git & contribution workflow

- **Open PRs against `dev` — never `master`.** `dev` is the integration branch; `master` is for stable releases only. This matches the convention already in place in [webarkit/jsfeatNext](https://github.com/webarkit/jsfeatNext) and [webarkit/purecv](https://github.com/webarkit/purecv) (both of which call their release branch `main` — this repo's is named `master`, so don't copy the branch name verbatim from those, only the workflow).
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):** `type(scope): summary` — e.g. `feat(cv-backend-jsfeatnext): …`, `fix(cv-backend-spec): …`, `docs: …`, `chore: …`, `test: …`, `refactor: …`, `ci: …`. Keep the subject imperative and concise. Common scopes so far: `cv-backend-spec`, `cv-backend-jsfeatnext`, `examples`, `ci` — omit the scope for changes spanning the whole repo (root README, this file, CI config).
- One branch per task/issue, branched from an up-to-date `dev`.

## Before you make changes

- Small, incremental, reviewable diffs. Match surrounding code style.
- Keep `npm run build`, `npm run typecheck`, and `npm test` green.
- If you're touching `estimateHomography` or anything RANSAC-related in `cv-backend-jsfeatnext`, read that package's README section on it first — its current behavior (`find_homography`, `RANSAC_RESTARTS = 3`) was arrived at empirically (see [webarkit/webarkit#11](https://github.com/webarkit/webarkit/issues/11)), not by default choice.
