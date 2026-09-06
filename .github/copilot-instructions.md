# GitHub Copilot instructions — webarkit

The full guidance is in **[`AGENTS.md`](../AGENTS.md)** (source of truth). Critical points, inlined because Copilot injects this file directly:

- **Central repo for the webarkit org's shared `CvBackend` contract** — `packages/cv-backend-spec` (the interface: `detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`, optional `filterMatches`) and `packages/cv-backend-jsfeatnext` (jsfeatNext's implementation of it). `examples/` at the repo root exercises the contract directly. Neither package is on npm yet (pre-1.0).
- **Node** version pinned in `.nvmrc` (currently v24.18.0), npm 9+ for workspaces. Commands, in the order CI runs them: `npm install` → `npm run build` (builds `cv-backend-spec` **then** `cv-backend-jsfeatnext` — that order is load-bearing, npm's default alphabetical order broke it once, see `109caaf`) → `npm run typecheck` (src **and** test) → `npm test` (Vitest).
- **No Turborepo/Nx** yet — deliberate, revisit once there are more packages.
- License: LGPL-3.0-or-later; match the existing LGPL header on new files in `packages/*/src`.
- **Git workflow:** branch off `dev`, PR against **`dev`**, never `main` — same convention as `webarkit/jsfeatNext` and `webarkit/purecv`. Commit messages follow **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:`), scoped by package where relevant (`cv-backend-spec`, `cv-backend-jsfeatnext`, `examples`, `ci`).
