# Agent instructions

The canonical instructions for this repository live in **[`AGENTS.md`](../AGENTS.md)** at the project root.

Please read that file first — it covers the npm-workspaces layout (`packages/cv-backend-spec` is the `CvBackend` contract, `packages/cv-backend-jsfeatnext` is jsfeatNext's implementation of it, in that build order), the exact commands CI runs (`npm install`, `npm run build`, `npm run typecheck`, `npm test`), the Conventional Commits + `dev`-not-`master` PR convention shared with [webarkit/jsfeatNext](https://github.com/webarkit/jsfeatNext) and [webarkit/purecv](https://github.com/webarkit/purecv) (this repo's release branch is `master`, not `main` like those two), and the LGPL license header expected on new source files.

Neither package is published to npm yet (both are pre-1.0) — see the root [README](../README.md) for installing from source and for how this repo fits into the wider webarkit ecosystem (jsfeatNext, WebARKitLib-rs, PureCV, jsartoolkitNFT).
