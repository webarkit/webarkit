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

## Architecture — read this before editing

- npm-workspaces monorepo (`workspaces: ["packages/*"]`), **no Turborepo/Nx yet** — deliberately: with two packages, ordering the two build steps by hand in the root `package.json` script is simpler than standing up a task-graph tool. Revisit once there are several packages, or once builds start depending on each other's outputs in a way plain scripts can't express (see the root README's Layout section for the fuller reasoning, and [turbo.build/repo/docs](https://turbo.build/repo/docs) / [nx.dev](https://nx.dev) if evaluating that later).
- `packages/cv-backend-spec` — the `CvBackend` **contract only**: types and interfaces, no implementation. Neutral types (typed arrays, plain structs) — no `matrix_t`, no jsfeatNext- or WASM-specific types.
- `packages/cv-backend-jsfeatnext` — jsfeatNext's implementation of that contract. Depends on **both** the spec and `@webarkit/jsfeat-next` (`^0.16.0`); neither of those depends on it — keep that dependency arrow one-directional.
- `examples/` — demos live at the repo root, not inside a package, because they exercise the **contract**, not one implementation. See [`examples/README.md`](./examples/README.md).
- **Neither package is published to npm yet** (both are pre-1.0). Don't write installation instructions elsewhere in the repo that assume `npm install @webarkit/cv-backend-*` works from the public registry — it doesn't yet.

## Conventions

- TypeScript. License: **LGPL-3.0-or-later**. Existing `src/` files in both packages carry an LGPL header — match that template for new files in the same package. This repo does not yet have jsfeatNext's automated header-check script (`scripts/check-license-headers.mjs`); for now this is enforced by review, not CI.
- Preserve the public `CvBackend` contract surface (`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`, optional `filterMatches`) unless a change to `cv-backend-spec` is explicitly intended and reflected in both packages together.
- Keep the two packages' capability negotiation honest: `capabilities` must never claim something the API can't actually reach (see `cv-backend-jsfeatnext/README.md`'s own notes on `detectors`/`matchFilters` for why this matters).
- Never commit `.idea/` (already in `.gitignore`).

## Git & contribution workflow

- **Open PRs against `dev` — never `main`.** `dev` is the integration branch; `main` is for stable releases only. This matches the convention already in place in [webarkit/jsfeatNext](https://github.com/webarkit/jsfeatNext) and [webarkit/purecv](https://github.com/webarkit/purecv).
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):** `type(scope): summary` — e.g. `feat(cv-backend-jsfeatnext): …`, `fix(cv-backend-spec): …`, `docs: …`, `chore: …`, `test: …`, `refactor: …`, `ci: …`. Keep the subject imperative and concise. Common scopes so far: `cv-backend-spec`, `cv-backend-jsfeatnext`, `examples`, `ci` — omit the scope for changes spanning the whole repo (root README, this file, CI config).
- One branch per task/issue, branched from an up-to-date `dev`.

## Before you make changes

- Small, incremental, reviewable diffs. Match surrounding code style.
- Keep `npm run build`, `npm run typecheck`, and `npm test` green.
- If you're touching `estimateHomography` or anything RANSAC-related in `cv-backend-jsfeatnext`, read that package's README section on it first — its current behavior (`find_homography`, `RANSAC_RESTARTS = 3`) was arrived at empirically (see [webarkit/webarkit#11](https://github.com/webarkit/webarkit/issues/11)), not by default choice.
