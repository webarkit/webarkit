# webarkit

> **Status: draft / proposal.** This restructuring is not yet agreed with
> [@ThorstenBux](https://github.com/ThorstenBux). Nothing here is final —
> package name, monorepo layout, and scope are all open for discussion.

Central repository for the [webarkit](https://github.com/webarkit)
organization. Home for packages shared across the WebAR toolchain rather than
owned by a single library:

- **jsfeatNext** ([webarkit/jsfeatNext](https://github.com/webarkit/jsfeatNext)) —
  TypeScript computer-vision primitives (rewrite of jsfeat).
- **PureCV** (planned) — Rust → WASM computer-vision backend, interchangeable
  with jsfeatNext behind the same contract.
- **jsartoolkitNFT** ([webarkit/jsartoolkitNFT](https://github.com/webarkit/jsartoolkitNFT)) —
  architectural reference: KPM (WASM) as the stateless CV layer, TypeScript
  orchestration on top.
- A future high-level AR project (target training, tracking loop, pose
  refinement, renderer adapters) that consumes a CV backend without knowing
  which implementation it's talking to.

## Why a shared contract package

jsfeatNext and PureCV should be interchangeable CV backends for any
high-level AR project. That only works if both implement the same interface,
defined once, owned by neither backend. This repo is where that interface —
and any other org-wide shared contract — lives.

## Packages

| Package | Description |
|---|---|
| [`@webarkit/cv-backend-spec`](./packages/cv-backend-spec) | Minimal stateless CV backend interface (`detect`, `describe`, `match`, `estimateHomography`, `poseFromHomography`) implemented by jsfeatNext and (future) PureCV. |

## Layout

This is an npm-workspaces monorepo — no build-system layer (Turborepo/Nx)
yet; adding one is premature with a single package. Revisit once there are
several.

```
webarkit/
  packages/
    cv-backend-spec/
```

## Open questions for discussion

- Package naming: `cv-backend-spec` vs `cv-contract` vs something else.
- Should the high-level AR project eventually live here too as
  `packages/ar-core`, or stay a separate repo that depends on
  `@webarkit/cv-backend-spec` via npm?
- Publishing: npm org scope `@webarkit/*` — confirm we still hold it /
  who has publish rights.
- Do we want a monorepo tool once we have 3+ packages, or is npm workspaces
  enough long-term?
