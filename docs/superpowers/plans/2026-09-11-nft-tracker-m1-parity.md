# NFT tracker M1 — parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `NftTracker` in `packages/nft-tracker` that reproduces, exactly, what the webcam demo does today — no new behaviour — plus the per-level detection helpers and an in-memory target builder it needs, proven by a parity test against the static demo's own pipeline.

**Architecture:** Three new source files above the `CvBackend` contract. `detection.ts` holds the per-level matching strategy lifted out of `examples/js/pinball-shared.mjs`, rewritten against `DescriptorSet.levelStart` subarray **views** (target-format spec §5.6) instead of the demo's index-list copies. `target/build_from_image.ts` turns a `GrayImage` into an in-memory `TargetDb` with the backend (multi-level `detect` + `describe`) — the seed of the target compiler. `tracker.ts` composes the two into a stateless-per-frame `process(frame, timestampMs)`. No DOM, no timers, injectable RNG (ADR-0001 point 7). The demos then import from the package instead of carrying the logic themselves.

**Tech Stack:** TypeScript 5.9, Vitest 4, npm workspaces. Runtime dependency: `@webarkit/cv-backend-spec` only. `@webarkit/cv-backend-jsfeatnext` and `jpeg-js` are devDependencies (tests and fixture generation).

**Spec:**
- [`docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md`](../../adr/0001-nft-tracker-ts-reference-above-cvbackend.md) — especially **point 3** (division of labour) and **point 7** (portability rules), and action item **4** (this milestone).
- [`docs/specs/nft-target-format.md`](../../specs/nft-target-format.md) — §3 (conventions), §5.4–§5.6 (pyramid, keypoints, descriptor sets), §6.3 (choosing a descriptor set).
- [`examples/README.md`](../../../examples/README.md) — why the target is multi-scale and the scene is not, and why matching runs one level at a time.

---

## Global Constraints

- **Language:** every repository artifact — code, comments, commit messages, PR title and body — in **English**. (This plan's originating conversation is in Italian; the code is not.)
- **License header:** every new `.ts` / `.mjs` file in `packages/nft-tracker` carries the LGPL-3.0-or-later header used by `packages/nft-tracker/src/target/types.ts`, with the file's own name on line 2 and `nft-tracker` on line 3. Copy it verbatim from an existing file and change only those two lines. Not enforced by CI — enforced by review.
- **Do not touch `packages/nft-tracker/src/target/format/`.** The codec lives on `feat/nft-target-format`. Work only with the types in `src/target/types.ts`, which this branch does not modify either.
- **Do not touch `packages/cv-backend-spec` or `packages/cv-backend-jsfeatnext`.** Contract gaps found while building the tracker are filed as issues and fixed in their own PRs, reviewed separately — they do not ride along in a tracker PR. This branch has found one already (see *The RNG, and why the test stubs a global* below); note any others in the PR body rather than fixing them here.
- **Dependency arrow:** `nft-tracker` depends on `cv-backend-spec` at runtime and on nothing else. `cv-backend-jsfeatnext` stays a devDependency.
- **Float64 geometry** (ADR point 7). Stored target coordinates are `Float32Array` because spec §5.5 says so; every *computed* geometric quantity is `Float64Array`.
- **Explicit result types**, `{ ok, ... }`. Exceptions only for contract violations, never for control flow (ADR point 7).
- **Commit messages:** Conventional Commits, `type(scope): summary`, imperative. Scopes used here: `nft-tracker`, `examples`. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **Branch:** `feat/nft-tracker-m1`, in the worktree `D:/kalwalt-github/webarkit-m1`. The PR targets **`dev`**, never `master`.
- **Node:** `.nvmrc` pins v24.18.0, which is not installed on this machine; v24.20.0 is. `package.json` requires `>=18`, so v24.20.0 is fine, but the nvm shim on `PATH` resolves to the missing v24.18.0 and fails. Prefix every command with the working install:
  ```bash
  export PATH="/c/Users/perda/AppData/Local/Author Software/nvm/installs/v24.20.0:$PATH"
  ```
  (PowerShell: `$env:Path = "C:\Users\perda\AppData\Local\Author Software\nvm\installs\v24.20.0;$env:Path"`.)
- **Build before test.** `cv-backend-jsfeatnext` is consumed by the new tests through its package entry (`dist/index.js`), so `npm run build` must have run. CI runs `npm install`, `npm run build`, `npm run typecheck`, `npm test` — all four must stay green.

---

## File structure

| Path | Responsibility |
|---|---|
| `packages/nft-tracker/src/detection.ts` | **Create.** §6.3 descriptor-set choice, per-level views over `levelStart`, per-level matching. Nothing about targets-from-images or about frames. |
| `packages/nft-tracker/src/target/build_from_image.ts` | **Create.** `GrayImage` + backend → in-memory `TargetDb`. Knows the spec's table layout; knows nothing about matching. |
| `packages/nft-tracker/src/tracker.ts` | **Create.** `NftTracker`, its options and its result type. Composes the two above; owns no pixels. |
| `packages/nft-tracker/src/index.ts` | **Modify.** Re-export the new public surface. |
| `packages/nft-tracker/test/fixtures/make-fixtures.mjs` | **Create.** One-off generator: the two demo JPEGs → two PGM files. Not run by CI. |
| `packages/nft-tracker/test/fixtures/pgm.ts` | **Create.** Minimal PGM (P5) reader used by the tests. |
| `packages/nft-tracker/test/fixtures/pinball-target-640.pgm` | **Create (generated).** 512×640 grayscale target. |
| `packages/nft-tracker/test/fixtures/pinball-scene-640.pgm` | **Create (generated).** 640×480 grayscale scene. |
| `packages/nft-tracker/test/fixtures/seeded_rng.ts` | **Create.** mulberry32, and `withSeededRandom` — the temporary `Math.random` stub, counting its draws so the stub's blast radius is asserted rather than assumed. One place, deletable in one edit. |
| `packages/nft-tracker/test/fixtures/pgm.test.ts` | **Create.** Pins the fixtures' identity. |
| `packages/nft-tracker/test/detection.test.ts` | **Create.** Unit tests, stub backend, hand-built `TargetDb`. |
| `packages/nft-tracker/test/build_from_image.test.ts` | **Create.** Real backend on the target fixture. |
| `packages/nft-tracker/test/tracker.test.ts` | **Create.** Unit tests for the state and options surface. |
| `packages/nft-tracker/test/parity.test.ts` | **Create.** The headline test: tracker vs. a transcription of the static demo. |
| `packages/nft-tracker/package.json` | **Modify.** `jpeg-js` devDependency. |
| `examples/js/pinball-shared.mjs` | **Modify.** Remove what moved; keep `toGray` and `project`. |
| `examples/pinball-static-jsfeatnext-backend.html` | **Modify.** Use the package's target builder and detection helpers; keep its own explicit pipeline. |
| `examples/pinball-webcam-jsfeatnext-backend.html` | **Modify.** Use `NftTracker`. |
| `examples/README.md`, `README.md` | **Modify.** Keep the prose true. |

## The RNG, and why the test stubs a global (read before Task 4)

ADR-0001 point 7 requires that every random choice go through an injectable RNG, "as jsfeatNext's RANSAC already allows". End to end, it does not:

- `jsfeatNext.ransac_params_t(size, thresh, eps, prob, rng)` takes an RNG as its **fifth** constructor argument and defaults it to `() => Math.random()`; `motion_estimator.ransac` draws minimal samples through `params.rng`.
- `cv-backend-jsfeatnext` builds `new jsfeatNext.ransac_params_t(4, threshold, 0.5, confidence)` — four arguments — so the default `Math.random` is what actually runs.
- `RansacOptions` carries `threshold`, `maxIterations`, `confidence` and no RNG, so a caller cannot reach it.

That is a contract gap, and closing it belongs in its own PR against `cv-backend-spec` and `cv-backend-jsfeatnext` together, not in a tracker PR. **This branch does not close it.**

So two things follow, and both are deliberate:

1. **`NftTracker` has no `rng` option.** In M1 the tracker makes no random choice of its own — the single random choice in the pipeline lives inside `estimateHomography`, below the tracker. An option that accepted a generator and then had nowhere to pass it would be exactly the unreachable capability this repo's conventions forbid. ADR point 7 is satisfied by the tracker having no randomness to inject, and the option arrives, in one line, the day `RansacOptions.rng` does.
2. **The tests seed the global instead.** `withSeededRandom(seed, fn)` swaps `Math.random` for a mulberry32 for the duration of one call and restores it in a `finally`. It lives in `test/fixtures/seeded_rng.ts` — test-only code, one place, deletable in a single edit once the contract field lands, which its own comment says.

Stubbing a global is worse than injecting a generator, and the code should say so rather than pretend otherwise. It is worth being precise about what it costs:

- It reaches every consumer of `Math.random` in the process for the duration of the call, not just RANSAC. Nothing else in the jsfeatNext pipeline draws — `detect`, `describe` and `match` are deterministic, and `ransac_params_t`/`get_subset` are the only two `Math.random` sites in the library — so today the blast radius is exactly the intended one. That is an observation about a dependency, not a guarantee, which is the real reason it is temporary. **So it is asserted, not documented:** `withSeededRandom` counts the draws taken inside the region, and Task 5 pins that the deterministic stages take zero and that both pipelines take the same number. A new draw site appearing upstream then fails an assertion that names it, instead of silently shifting the sequence under every comparison built on the helper.
- It has to be **re-entered around each run** rather than installed once: two pipelines drawing in turn from one generator would consume different tails, and the second would prove nothing. `withSeededRandom` makes that structural — each run gets its own seeded generator from its own call.

**When webarkit/webarkit#24 lands**, the change here is mechanical: add `rng?: () => number` to `NftTrackerOptions`, pass it to `estimateHomography`, and replace the global swap in `withSeededRandom` with an injected `mulberry32(seed)`. `mulberry32` stays, and so does the **draw counting** — it pins where randomness may be consumed at all, which is worth knowing with an injected generator too; only the global swap goes.

---

### Task 1: Grayscale fixtures for the demo images

The parity test runs in Node under Vitest: no `OffscreenCanvas`, no JPEG decoder. The demo's `toGray` downscales through the browser's `drawImage`, which cannot be reproduced off-browser — and does not need to be. Parity compares two pipelines fed **the same** `GrayImage`; where those pixels came from does not affect the comparison, only how representative it is. So the JPEGs are decoded **once**, by a committed script, into two PGM (P5) files at exactly the sizes the static demo produces. The tests then read plain binary — no decoder at test time, an input a reviewer can inspect, and a data file `cargo test` will also be able to read when the Rust side arrives (ADR point 7).

**Files:**
- Modify: `packages/nft-tracker/package.json` (add the `jpeg-js` devDependency)
- Create: `packages/nft-tracker/test/fixtures/make-fixtures.mjs`
- Create: `packages/nft-tracker/test/fixtures/pgm.ts`
- Create (generated): `packages/nft-tracker/test/fixtures/pinball-target-640.pgm`, `packages/nft-tracker/test/fixtures/pinball-scene-640.pgm`
- Create: `packages/nft-tracker/test/fixtures/seeded_rng.ts`
- Test: `packages/nft-tracker/test/fixtures/pgm.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readPgm(url: URL): GrayImage` from `test/fixtures/pgm.ts`
  - `TARGET_FIXTURE: URL`, `SCENE_FIXTURE: URL` from `test/fixtures/pgm.ts`
  - `mulberry32(seed: number): () => number`, `interface SeededRun<T> { value: T; draws: number }` and `withSeededRandom<T>(seed: number, run: () => T): SeededRun<T>` from `test/fixtures/seeded_rng.ts`
  - Two PGM files: target 512×640, scene 640×480.

- [ ] **Step 1: Add the devDependency**

```bash
npm install --save-dev --workspace @webarkit/nft-tracker jpeg-js@^0.4.4
```

Then check `packages/nft-tracker/package.json` shows `jpeg-js` under `devDependencies` and that `package-lock.json` changed. `jpeg-js` is needed **only** to regenerate the fixtures; nothing under `src/` or the test suite imports it.

- [ ] **Step 2: Write the fixture generator**

Create `packages/nft-tracker/test/fixtures/make-fixtures.mjs` with the standard LGPL header, then:

```js
/**
 * Regenerates the grayscale fixtures the tests read, from the demo images.
 *
 * Run by hand, not by CI:
 *
 *     node packages/nft-tracker/test/fixtures/make-fixtures.mjs
 *
 * The browser demos build their `GrayImage` with `OffscreenCanvas.drawImage`,
 * whose resampling is implementation-defined and unavailable in Node. This
 * script does not try to match it: the parity test compares two pipelines on
 * the SAME pixels, so what matters is that these pixels are deterministic,
 * reproducible from files in the repo, and the size the demo would produce.
 */

import { readFileSync, writeFileSync } from "node:fs";
import jpeg from "jpeg-js";

/** The static demo's cap: the longer side is scaled down to 640. */
const MAX_SIDE = 640;

const IMAGES = [
    { src: "../../../../examples/images/pinball.jpg", out: "./pinball-target-640.pgm" },
    { src: "../../../../examples/images/pinball-demo.jpg", out: "./pinball-scene-640.pgm" },
];

/** Rec. 601 luma — the same weighting `examples/js/pinball-shared.mjs` uses. */
function toGrayFull(rgba, width, height) {
    const gray = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        gray[i] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) | 0;
    }
    return gray;
}

/**
 * Box (area-average) downscale.
 *
 * Grayscaling before downscaling rather than after is free: Rec. 601 luma and
 * an area average are both linear in the channels, so the two commute up to
 * the final rounding.
 */
function boxDownscale(src, sw, sh, dw, dh) {
    const out = new Uint8Array(dw * dh);
    for (let oy = 0; oy < dh; oy++) {
        const y0 = Math.floor((oy * sh) / dh);
        const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * sh) / dh));
        for (let ox = 0; ox < dw; ox++) {
            const x0 = Math.floor((ox * sw) / dw);
            const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * sw) / dw));
            let sum = 0;
            let n = 0;
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++, n++) sum += src[y * sw + x];
            }
            out[oy * dw + ox] = Math.round(sum / n);
        }
    }
    return out;
}

/** PGM "P5": an ASCII header, then width*height raw bytes. */
function writePgm(path, gray, width, height) {
    const header = Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii");
    writeFileSync(path, Buffer.concat([header, Buffer.from(gray)]));
}

for (const { src, out } of IMAGES) {
    const srcUrl = new URL(src, import.meta.url);
    const outUrl = new URL(out, import.meta.url);
    const { data, width, height } = jpeg.decode(readFileSync(srcUrl), { useTArray: true });

    // The same scale rule as `toGray` without a maxHeight: cap the LONGER side.
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const dw = Math.max(1, Math.round(width * scale));
    const dh = Math.max(1, Math.round(height * scale));

    const gray = toGrayFull(data, width, height);
    writePgm(outUrl, boxDownscale(gray, width, height, dw, dh), dw, dh);
    console.log(`${out}: ${width}x${height} -> ${dw}x${dh}`);
}
```

- [ ] **Step 3: Generate the fixtures**

```bash
node packages/nft-tracker/test/fixtures/make-fixtures.mjs
```

Expected output, exactly:

```
./pinball-target-640.pgm: 614x768 -> 512x640
./pinball-scene-640.pgm: 2000x1500 -> 640x480
```

If the sizes differ, stop: either the demo images changed or the scale rule was mistranscribed. Do not adjust the expectation to match the output.

- [ ] **Step 4: Write the PGM reader and its failing test**

Create `packages/nft-tracker/test/fixtures/pgm.ts` (LGPL header, then):

```ts
import { readFileSync } from "node:fs";
import type { GrayImage } from "@webarkit/cv-backend-spec";

export const TARGET_FIXTURE = new URL("./pinball-target-640.pgm", import.meta.url);
export const SCENE_FIXTURE = new URL("./pinball-scene-640.pgm", import.meta.url);

/**
 * Reads a binary PGM ("P5") into the contract's `GrayImage`.
 *
 * Deliberately strict: it accepts only the exact header shape
 * `make-fixtures.mjs` writes — no comments, no whitespace variants, maxval
 * 255. A fixture reader that guessed would turn a corrupt fixture into a
 * plausible-looking image and a mystifying test failure three files away.
 */
export function readPgm(url: URL): GrayImage {
    const bytes = readFileSync(url);
    const match = /^P5\n(\d+) (\d+)\n255\n/.exec(bytes.subarray(0, 64).toString("ascii"));
    if (!match) throw new Error(`${url.pathname}: not a P5 PGM written by make-fixtures.mjs`);

    const width = Number(match[1]);
    const height = Number(match[2]);
    const pixels = bytes.subarray(match[0].length);
    if (pixels.length !== width * height) {
        throw new Error(
            `${url.pathname}: header says ${width}x${height} (${width * height} bytes), ` +
                `file holds ${pixels.length}`
        );
    }
    // Copy rather than view: `GrayImage.data` is a Uint8Array the caller owns,
    // and a view would keep the whole file buffer alive behind it.
    return { data: new Uint8Array(pixels), width, height };
}
```

Create `packages/nft-tracker/test/fixtures/pgm.test.ts` (LGPL header, then):

```ts
import { describe, it, expect } from "vitest";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./pgm.js";

describe("the committed fixtures are the demo's own images at the demo's own size", () => {
    it("reads the target at 512x640", () => {
        const target = readPgm(TARGET_FIXTURE);
        // pinball.jpg is 614x768; the static demo caps the longer side at 640.
        expect([target.width, target.height]).toEqual([512, 640]);
        expect(target.data.length).toBe(512 * 640);
    });

    it("reads the scene at 640x480", () => {
        const scene = readPgm(SCENE_FIXTURE);
        // pinball-demo.jpg is 2000x1500, same 640 cap.
        expect([scene.width, scene.height]).toEqual([640, 480]);
        expect(scene.data.length).toBe(640 * 480);
    });

    it("holds real image content, not a blank or constant buffer", () => {
        const { data } = readPgm(TARGET_FIXTURE);
        let min = 255;
        let max = 0;
        for (const v of data) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        expect(max - min).toBeGreaterThan(100);
    });
});
```

- [ ] **Step 5: Write the seeded RNG helper**

Create `packages/nft-tracker/test/fixtures/seeded_rng.ts` (LGPL header, then):

```ts
/**
 * mulberry32 — a 32-bit PRNG, four lines, period 2^32. Far longer than any
 * RANSAC run will consume, and identical across platforms, which `Math.random`
 * is not.
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** What a seeded region produced, and how much randomness it consumed. */
export interface SeededRun<T> {
    readonly value: T;
    /** `Math.random` calls made inside the region. */
    readonly draws: number;
}

/**
 * Runs `run` with `Math.random` replaced by a seeded, counting generator, then
 * puts the real one back.
 *
 * TEMPORARY, and the least pleasant thing in this test suite. The only random
 * choice in the tracker's pipeline is the minimal-sample draw inside
 * `estimateHomography`, and the contract's `RansacOptions` carries no RNG for
 * a caller to seed — jsfeatNext's `ransac_params_t` accepts one as its fifth
 * argument, but `cv-backend-jsfeatnext` does not pass it through
 * (webarkit/webarkit#24). Until that lands, reaching the generator means
 * reaching the global.
 *
 * Each call installs a FRESH generator, which is the point: two pipelines
 * drawing in turn from one generator would consume different tails, and
 * comparing them would prove nothing. `finally` restores the real
 * `Math.random` even when `run` throws, so one failing test cannot leave the
 * rest of the file running on a stub.
 *
 * **Why it counts.** Swapping a global reaches every consumer of
 * `Math.random` in the process, not just RANSAC. That is harmless only for as
 * long as nothing else in the pipeline draws — true of jsfeatNext today, but
 * an observation about a dependency, not a guarantee, and exactly the kind of
 * assumption that rots silently. A new draw site upstream would shift the
 * sequence underneath every comparison built on this helper, and every symptom
 * would show up somewhere else. `draws` makes that self-checking: the parity
 * test asserts the deterministic stages draw zero and that both pipelines draw
 * the same amount, so a new site fails an assertion that names it instead of
 * quietly moving the numbers.
 *
 * When webarkit/webarkit#24 lands, DELETE the global swap — pass
 * `rng: mulberry32(seed)` to `estimateHomography` (and to `NftTrackerOptions`)
 * instead. **Keep the counting.** It is not a workaround for the global; it
 * pins where randomness is allowed to be consumed at all, which stays worth
 * knowing with an injected generator — the counter simply moves onto that
 * generator.
 */
export function withSeededRandom<T>(seed: number, run: () => T): SeededRun<T> {
    const real = Math.random;
    const seeded = mulberry32(seed);
    let draws = 0;
    Math.random = () => {
        draws++;
        return seeded();
    };
    try {
        // `value` is evaluated before `draws` is read, so the count is final.
        return { value: run(), draws };
    } finally {
        Math.random = real;
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test -w @webarkit/nft-tracker && npm run typecheck -w @webarkit/nft-tracker
```

Expected: PASS. (The fixtures were generated in Step 3, so these tests pass on their first run — they are here to pin the fixtures' identity, not to drive the reader's implementation.)

- [ ] **Step 7: Commit**

```bash
git add packages/nft-tracker/test/fixtures packages/nft-tracker/package.json package-lock.json
git commit -F - <<'MSG'
test(nft-tracker): add grayscale fixtures for the demo images

The parity test runs in Node, where the demos' OffscreenCanvas path does not
exist. A committed script decodes the two demo JPEGs once and writes them as
PGM at the sizes the static demo produces (512x640 target, 640x480 scene);
the tests read plain binary, so no decoder runs at test time and the input is
inspectable. jpeg-js is a devDependency of the generator alone.

The pixels do not have to match the browser's resampling: parity compares two
pipelines on the SAME GrayImage, so determinism is what the fixture owes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: `detection.ts` — per-level views and per-level matching

This is the move the milestone is named for. `examples/js/pinball-shared.mjs` currently groups a multi-scale target with `buildLevelIndex(kTarget, dTarget)`, which walks `Keypoint[]`, collects per-level **index lists**, and calls a private `sliceDescriptors` that **copies** each level's rows into a fresh `Uint8Array`. The package version does neither: a `TargetDb`'s rows are already grouped by level (spec §5.6), so a level is a `subarray` **view** over `data` plus a `subarray` view over `kpIndex`. No bytes are copied and no index list is built.

Two behaviours of the demo must survive the rewrite exactly, or Task 5 fails:

1. **Levels with fewer than two rows are skipped.** Lowe's ratio test needs a second-nearest neighbour; a one-row train set has none. The demo's `if (indices.length < 2) continue;` is not an optimisation.
2. **Ties go to the first level seen.** The demo keeps a match only when `m.distance < prev.distance`, strictly, iterating levels in ascending order. Same comparison, same order.

**Files:**
- Create: `packages/nft-tracker/src/detection.ts`
- Modify: `packages/nft-tracker/src/index.ts`
- Test: `packages/nft-tracker/test/detection.test.ts`

**Interfaces:**
- Consumes: `TargetDb`, `BitsDescriptorSet`, `DescriptorSet` from `./target/types.js`; `CvBackend`, `Descriptors`, `DescriptorKind`, `DescriptorNorm`, `Match` from `@webarkit/cv-backend-spec`.
- Produces:
  - `type UsableDescriptorSet = BitsDescriptorSet & { readonly kind: DescriptorKind; readonly norm: DescriptorNorm }`
  - `interface TargetLevelView { readonly level: number; readonly descriptors: Descriptors; readonly kpIndex: Uint32Array }`
  - `chooseDescriptorSet(cv: CvBackend, target: TargetDb): UsableDescriptorSet`
  - `buildLevelIndex(set: UsableDescriptorSet): TargetLevelView[]`
  - `matchPerLevel(cv: CvBackend, query: Descriptors, levels: readonly TargetLevelView[], ratio: number): Match[]`

  Tasks 5 and 7 call all three. `matchPerLevel` returns matches whose `trainIdx` is an index into `target.keypoints`, never a row index — callers never see the per-level slicing.

- [ ] **Step 1: Write the failing test**

Create `packages/nft-tracker/test/detection.test.ts` (LGPL header, then):

```ts
import { describe, it, expect } from "vitest";
import type { CvBackend, DescriptorKind, Descriptors, Match } from "@webarkit/cv-backend-spec";
import { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "../src/detection.js";
import type { UsableDescriptorSet } from "../src/detection.js";
import type { DescriptorSet, TargetDb } from "../src/target/types.js";

const BPD = 4; // 32-bit descriptors: enough to be distinct, small enough to read

/**
 * A descriptor set with `rowsPerLevel` rows per level, one row per keypoint.
 * Row `i` is filled with the byte `i`, so a view's identity is visible by eye.
 */
function makeSet(rowsPerLevel: readonly number[], overrides: Record<string, unknown> = {}): DescriptorSet {
    const total = rowsPerLevel.reduce((a, b) => a + b, 0);
    const levelStart = new Uint32Array(rowsPerLevel.length + 1);
    for (let l = 0; l < rowsPerLevel.length; l++) levelStart[l + 1] = levelStart[l] + rowsPerLevel[l];
    const data = new Uint8Array(total * BPD);
    for (let i = 0; i < total; i++) data.fill(i, i * BPD, (i + 1) * BPD);
    return {
        kind: "orb",
        norm: "hamming",
        elementType: "bits",
        dimensions: BPD * 8,
        bytesPerDescriptor: BPD,
        producer: "test",
        params: {},
        count: total,
        levelStart,
        kpIndex: Uint32Array.from({ length: total }, (_, i) => i),
        data,
        ...overrides,
    } as DescriptorSet;
}

function makeTarget(sets: readonly DescriptorSet[]): TargetDb {
    return {
        formatVersion: "0.2",
        extensionsUsed: [],
        extensionsRequired: [],
        meta: { widthPx: 64, heightPx: 64, physicalSizeMm: null },
        pyramid: { scaleStep: Math.cbrt(2), levelSizes: [[64, 64]] },
        keypoints: {
            count: 0,
            detector: { kind: "fast", params: {} },
            levelStart: new Uint32Array([0]),
            x: new Float32Array(0),
            y: new Float32Array(0),
            angle: new Float32Array(0),
            score: new Float32Array(0),
            level: new Uint8Array(0),
        },
        descriptorSets: sets,
    };
}

/** A backend that implements only what these tests exercise. */
function stubBackend(
    match: (q: Descriptors, t: Descriptors) => Match[],
    descriptors: readonly DescriptorKind[] = ["orb"]
): CvBackend {
    return {
        capabilities: {
            name: "stub",
            detectors: ["fast"],
            descriptors,
            defaultDescriptor: "orb",
            matchFilters: [],
        },
        detect: () => [],
        describe: () => ({ data: new Uint8Array(0), count: 0, bytesPerDescriptor: BPD, kind: "orb", norm: "hamming" }),
        match,
        estimateHomography: () => ({ H: new Float64Array(9), inliers: new Uint8Array(0), numInliers: 0, ok: false }),
        poseFromHomography: () => ({ R: new Float64Array(9), t: new Float64Array(3), good: false }),
    };
}

const query: Descriptors = { data: new Uint8Array(BPD), count: 1, bytesPerDescriptor: BPD, kind: "orb", norm: "hamming" };

describe("chooseDescriptorSet", () => {
    it("picks the first set the backend can actually consume", () => {
        const unusable = makeSet([3], { kind: "teblid" }); // structurally fine, not implemented here
        const usable = makeSet([3]);
        const cv = stubBackend(() => []);
        expect(chooseDescriptorSet(cv, makeTarget([unusable, usable]))).toBe(usable);
    });

    it("rejects a set whose norm is not hamming", () => {
        const cv = stubBackend(() => []);
        const target = makeTarget([makeSet([3], { norm: "l2" })]);
        expect(() => chooseDescriptorSet(cv, target)).toThrow(/no descriptor set/i);
    });

    it("rejects a non-binary set, which the contract's Descriptors cannot carry", () => {
        const cv = stubBackend(() => []);
        const f32 = makeSet([3], { elementType: "f32", data: new Float32Array(12) });
        expect(() => chooseDescriptorSet(cv, makeTarget([f32]))).toThrow(/no descriptor set/i);
    });
});

describe("buildLevelIndex", () => {
    it("exposes each level as a VIEW over the set's bytes, never a copy", () => {
        const set = makeSet([3, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);

        expect(levels.map((l) => l.level)).toEqual([0, 1]);
        // Same backing store, and offset at the level's first row.
        expect(levels[1].descriptors.data.buffer).toBe(set.data.buffer);
        expect(levels[1].descriptors.data.byteOffset).toBe(3 * BPD);
        expect(levels[1].descriptors.count).toBe(2);
        // A view, proven the only way that cannot be faked: write through the
        // parent and read it back through the child.
        set.data[3 * BPD] = 200;
        expect(levels[1].descriptors.data[0]).toBe(200);
        expect(levels[1].kpIndex.buffer).toBe(set.kpIndex.buffer);
    });

    it("skips a level with fewer than two rows, because the ratio test needs a runner-up", () => {
        const set = makeSet([4, 1, 2]) as UsableDescriptorSet;
        expect(buildLevelIndex(set).map((l) => l.level)).toEqual([0, 2]);
    });

    it("carries kind and norm onto every level view, so match() can still guard the pairing", () => {
        const set = makeSet([2]) as UsableDescriptorSet;
        const [view] = buildLevelIndex(set);
        expect(view.descriptors.kind).toBe("orb");
        expect(view.descriptors.norm).toBe("hamming");
        expect(view.descriptors.bytesPerDescriptor).toBe(BPD);
    });
});

describe("matchPerLevel", () => {
    it("remaps trainIdx from a level row back to the target keypoint", () => {
        // Level 1 starts at row 3; kpIndex is identity, so row 3 is keypoint 3.
        const set = makeSet([3, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        const cv = stubBackend((_q, t) => (t.count === 2 ? [{ queryIdx: 0, trainIdx: 0, distance: 5 }] : []));

        expect(matchPerLevel(cv, query, levels, 0.8)).toEqual([{ queryIdx: 0, trainIdx: 3, distance: 5 }]);
    });

    it("honours kpIndex rather than assuming rows and keypoints line up", () => {
        const set = makeSet([2], { kpIndex: Uint32Array.from([7, 9]) }) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        const cv = stubBackend(() => [{ queryIdx: 0, trainIdx: 1, distance: 5 }]);

        expect(matchPerLevel(cv, query, levels, 0.8)[0].trainIdx).toBe(9);
    });

    it("keeps the lowest-distance hit per query keypoint across levels", () => {
        const set = makeSet([2, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        let call = 0;
        const cv = stubBackend(() =>
            call++ === 0
                ? [{ queryIdx: 0, trainIdx: 0, distance: 30 }]
                : [{ queryIdx: 0, trainIdx: 1, distance: 12 }]
        );

        expect(matchPerLevel(cv, query, levels, 0.8)).toEqual([{ queryIdx: 0, trainIdx: 3, distance: 12 }]);
    });

    it("breaks an exact tie in favour of the level seen first, as the demo does", () => {
        const set = makeSet([2, 2]) as UsableDescriptorSet;
        const levels = buildLevelIndex(set);
        let call = 0;
        const cv = stubBackend(() =>
            call++ === 0
                ? [{ queryIdx: 0, trainIdx: 0, distance: 20 }]
                : [{ queryIdx: 0, trainIdx: 0, distance: 20 }]
        );

        // Level 0's row 0 is keypoint 0; level 1's row 0 is keypoint 2.
        expect(matchPerLevel(cv, query, levels, 0.8)[0].trainIdx).toBe(0);
    });

    it("passes the caller's ratio down to every per-level match call", () => {
        const set = makeSet([2, 2]) as UsableDescriptorSet;
        const seen: (number | undefined)[] = [];
        const cv = stubBackend(() => []);
        const spied: CvBackend = { ...cv, match: (_q, _t, o) => (seen.push(o?.ratio), []) };

        matchPerLevel(spied, query, buildLevelIndex(set), 0.8);
        expect(seen).toEqual([0.8, 0.8]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -w @webarkit/nft-tracker -- detection
```

Expected: FAIL — `Failed to resolve import "../src/detection.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/nft-tracker/src/detection.ts` (LGPL header, then):

```ts
/**
 * Matching a query frame against a multi-scale target, one pyramid level at a
 * time.
 *
 * Why not one `match()` call against every level pooled together: Lowe's ratio
 * test assumes the second-nearest neighbour is a WRONG match, but a pooled
 * multi-scale set holds the same physical feature at several levels, so the
 * two best candidates are often both correct, the ratio approaches 1, and the
 * test throws them away. Measured on the demo images: matching per level found
 * roughly 2.5x the matches of pooling everything into one call, at the same
 * ratio threshold (see `examples/README.md`).
 *
 * This logic began in `examples/js/pinball-shared.mjs`, where it had to build
 * a per-level index list and copy each level's descriptor rows into a fresh
 * buffer, because a `Keypoint[]` plus a flat `Descriptors` is all the contract
 * hands back. A `TargetDb`'s rows are already grouped by level, so here a
 * level is a `subarray` view and nothing is copied (target format §5.6).
 */

import type {
    CvBackend,
    DescriptorKind,
    DescriptorNorm,
    Descriptors,
    Match,
} from "@webarkit/cv-backend-spec";
import type { BitsDescriptorSet, TargetDb } from "./target/types.js";

/**
 * A `BitsDescriptorSet` whose `kind` and `norm` a backend has accepted.
 *
 * `DescriptorSet` types those two as open unions, because the file format has
 * to keep a family the reader does not know (§5.6); the contract's
 * `Descriptors` types them as closed unions. {@link chooseDescriptorSet} is
 * the one place that check happens, so it is the one place the narrowing is
 * justified — everything downstream takes this type and needs no cast.
 */
export type UsableDescriptorSet = BitsDescriptorSet & {
    readonly kind: DescriptorKind;
    readonly norm: DescriptorNorm;
};

/** One pyramid level of a target, ready to pass to `match()` as a train set. */
export interface TargetLevelView {
    /** Pyramid level this view covers. */
    readonly level: number;
    /** This level's rows, as a view over the set's own bytes. */
    readonly descriptors: Descriptors;
    /** This level's `kpIndex` rows: `kpIndex[i]` is row `i`'s keypoint. */
    readonly kpIndex: Uint32Array;
}

/**
 * Picks the first descriptor set this backend can consume (§6.3).
 *
 * Usable means all three of: `elementType` is `"bits"` — the contract's
 * `Descriptors.data` is a `Uint8Array`, so nothing else fits through it at
 * all; `norm` is `"hamming"`; and `kind` is one the backend declares, since
 * `match` rejects a set whose family it did not compute.
 *
 * First-usable, not best-usable: §6.3's full preference ordering belongs with
 * the codec, and a target built by {@link buildTargetFromImage} carries
 * exactly one set. Throwing rather than returning `null` is deliberate — a
 * target whose descriptors this backend cannot read is a mismatch between
 * target and backend, not a frame that failed to track.
 */
export function chooseDescriptorSet(cv: CvBackend, target: TargetDb): UsableDescriptorSet {
    const supported: readonly string[] = cv.capabilities.descriptors;
    for (const set of target.descriptorSets) {
        if (set.elementType !== "bits") continue;
        if (set.norm !== "hamming") continue;
        if (!supported.includes(set.kind)) continue;
        return set as UsableDescriptorSet;
    }
    const offered = target.descriptorSets
        .map((s) => `${s.kind}/${s.norm}/${s.elementType}`)
        .join(", ");
    throw new Error(
        `@webarkit/nft-tracker: no descriptor set in this target is usable by backend ` +
            `'${cv.capabilities.name}'. The target offers [${offered}]; the backend reads ` +
            `binary hamming sets of kind [${supported.join(", ")}].`
    );
}

/**
 * One view per pyramid level, over the set's own bytes.
 *
 * Levels holding fewer than two rows are left out: `match` runs a k=2 ratio
 * test, which has no runner-up to compare against in a one-row train set. The
 * demo this came from did the same, and for the same reason.
 */
export function buildLevelIndex(set: UsableDescriptorSet): TargetLevelView[] {
    const bpd = set.bytesPerDescriptor;
    const levels: TargetLevelView[] = [];
    for (let level = 0; level + 1 < set.levelStart.length; level++) {
        const start = set.levelStart[level];
        const end = set.levelStart[level + 1];
        if (end - start < 2) continue;
        levels.push({
            level,
            descriptors: {
                data: set.data.subarray(start * bpd, end * bpd),
                count: end - start,
                bytesPerDescriptor: bpd,
                kind: set.kind,
                norm: set.norm,
            },
            kpIndex: set.kpIndex.subarray(start, end),
        });
    }
    return levels;
}

/**
 * Matches `query` against each level in turn, keeping the best hit per query
 * keypoint.
 *
 * `trainIdx` in the result indexes `target.keypoints`, not a level's rows: the
 * per-level slicing never escapes this function. Ties keep the level seen
 * first — the comparison is strict, and levels come in ascending order.
 */
export function matchPerLevel(
    cv: CvBackend,
    query: Descriptors,
    levels: readonly TargetLevelView[],
    ratio: number
): Match[] {
    const best = new Map<number, Match>();
    for (const { descriptors, kpIndex } of levels) {
        for (const m of cv.match(query, descriptors, { ratio })) {
            const previous = best.get(m.queryIdx);
            if (previous && previous.distance <= m.distance) continue;
            best.set(m.queryIdx, {
                queryIdx: m.queryIdx,
                trainIdx: kpIndex[m.trainIdx],
                distance: m.distance,
            });
        }
    }
    return [...best.values()];
}
```

- [ ] **Step 4: Export it**

In `packages/nft-tracker/src/index.ts`, above the existing `export type { ... } from "./target/types.js";` block, add:

```ts
export { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "./detection.js";
export type { TargetLevelView, UsableDescriptorSet } from "./detection.js";
```

- [ ] **Step 5: Run the tests and typecheck to verify they pass**

```bash
npm test -w @webarkit/nft-tracker && npm run typecheck -w @webarkit/nft-tracker
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/src/detection.ts packages/nft-tracker/src/index.ts packages/nft-tracker/test/detection.test.ts
git commit -F - <<'MSG'
feat(nft-tracker): move per-level matching into the package

buildLevelIndex and matchPerLevel came out of examples/js/pinball-shared.mjs,
where high-level tracking logic had no business living, and were rewritten
against a TargetDb. The demo had to collect per-level index lists and copy
each level's descriptor rows into a fresh buffer; a target's rows are already
grouped by level, so a level is now a subarray view over data and kpIndex and
nothing is copied (target format 5.6).

Two demo behaviours are preserved deliberately and pinned by tests: a level
with fewer than two rows is skipped, because the ratio test has no runner-up
without one, and an exact distance tie keeps the level seen first.

chooseDescriptorSet applies the consumable subset of 6.3 -- binary, hamming,
a kind the backend declares -- and is the single place the format's open
kind/norm unions are narrowed to the contract's closed ones.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: `target/build_from_image.ts` — an in-memory target from one image

The seed of the target compiler: what the two demos do by hand today (`cv.detect(target, { levels: 8, maxKeypoints: 8 * 260 })` then `cv.describe(target, kTarget)`) becomes one call returning a `TargetDb` that satisfies the target format's structural rules.

Three things are not mechanical, and each needs its comment in the code:

1. **Keypoints must be sorted by level.** Spec §5.5 requires ascending level order, and `levelStart` depends on it. `cv.detect` does **not** deliver that when `maxKeypoints` is set: the jsfeatNext adapter fills its budget round-robin across levels, so the array comes back interleaved. A **stable** sort by level fixes it, and stability matters — it keeps each level's members in the order the detector produced them, which is the order the demo's `Map`-of-index-lists also preserved. Without stability the parity test's tie-breaks drift.
2. **Describe before storing, not after.** Spec §5.5 stores `x`/`y` as `f32`. `describe` positions its sampling patch from the coordinates it is handed, so describing f32-rounded keypoints would compute different bits from the demo's. Detect → describe → *then* narrow to `f32`. Descriptors then come out byte-identical to the demo's, which is what leaves the parity test with exactly one source of divergence to reason about.
3. **`levelSizes` is reconstructed, not observed.** §5.4 wants the sizes as the producer made them, but the contract exposes no pyramid geometry — the scale step is a backend-internal constant (`Math.cbrt(2)` in `cv-backend-jsfeatnext`), which is precisely the "`Keypoint.level` is ambiguous across backends" gap ADR-0001 lists. So `scaleStep` is an explicit parameter with a documented default, and the sizes are recomputed the way the backend computes them: repeated division, then `| 0`. A `TODO` in the code points at the contract issue.

**Files:**
- Create: `packages/nft-tracker/src/target/build_from_image.ts`
- Modify: `packages/nft-tracker/src/index.ts`
- Test: `packages/nft-tracker/test/build_from_image.test.ts`

**Interfaces:**
- Consumes: `TargetDb`, `KeypointTable`, `BitsDescriptorSet`, `PyramidInfo`, `TargetMeta` from `./types.js`; `CvBackend`, `GrayImage`, `Keypoint` from `@webarkit/cv-backend-spec`. `readPgm`/`TARGET_FIXTURE` from Task 1.
- Produces:
  - `const DEFAULT_SCALE_STEP: number` (= `Math.cbrt(2)`)
  - `const DEFAULT_TARGET_LEVELS = 8`
  - `const DEFAULT_KEYPOINTS_PER_LEVEL = 260`
  - `interface BuildTargetOptions { levels?: number; maxKeypoints?: number; scaleStep?: number; physicalSizeMm?: readonly [number, number] | null; name?: string }`
  - `buildTargetFromImage(cv: CvBackend, image: GrayImage, options?: BuildTargetOptions): TargetDb`

  Tasks 5, 6 and 7 all call `buildTargetFromImage`.

- [ ] **Step 1: Write the failing test**

Create `packages/nft-tracker/test/build_from_image.test.ts` (LGPL header, then):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";
import { buildTargetFromImage, DEFAULT_SCALE_STEP } from "../src/target/build_from_image.js";
import { readPgm, TARGET_FIXTURE } from "./fixtures/pgm.js";

let cv: CvBackend;
let image: GrayImage;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    image = readPgm(TARGET_FIXTURE);
});

describe("buildTargetFromImage", () => {
    it("records the image's own size, and no physical size unless told one", () => {
        const target = buildTargetFromImage(cv, image, { levels: 4 });
        expect(target.meta.widthPx).toBe(image.width);
        expect(target.meta.heightPx).toBe(image.height);
        expect(target.meta.physicalSizeMm).toBeNull();
        expect(target.formatVersion).toBe("0.2");
        expect(target.extensionsUsed).toEqual([]);
        expect(target.extensionsRequired).toEqual([]);
    });

    it("sorts keypoints by level even though detect() returns them interleaved", () => {
        // The jsfeatNext adapter fills a maxKeypoints budget round-robin across
        // levels, so its output is NOT level-ordered -- assert that first, or
        // this test could pass against a backend that never interleaved.
        const raw = cv.detect(image, { levels: 4, maxKeypoints: 4 * 260 });
        const rawSorted = raw.every((k, i) => i === 0 || raw[i - 1].level <= k.level);
        expect(rawSorted).toBe(false);

        const { keypoints } = buildTargetFromImage(cv, image, { levels: 4 });
        for (let i = 1; i < keypoints.count; i++) {
            expect(keypoints.level[i]).toBeGreaterThanOrEqual(keypoints.level[i - 1]);
        }
    });

    it("gives levelStart ranges that agree with the per-keypoint level", () => {
        const { keypoints, pyramid } = buildTargetFromImage(cv, image, { levels: 4 });
        const L = pyramid.levelSizes.length;
        expect(keypoints.levelStart.length).toBe(L + 1);
        expect(keypoints.levelStart[0]).toBe(0);
        expect(keypoints.levelStart[L]).toBe(keypoints.count);
        for (let l = 0; l < L; l++) {
            for (let i = keypoints.levelStart[l]; i < keypoints.levelStart[l + 1]; i++) {
                expect(keypoints.level[i]).toBe(l);
            }
        }
    });

    it("emits one descriptor row per keypoint, identity-mapped (no multiview)", () => {
        const target = buildTargetFromImage(cv, image, { levels: 4 });
        expect(target.descriptorSets).toHaveLength(1);
        const set = target.descriptorSets[0];
        expect(set.elementType).toBe("bits");
        expect(set.norm).toBe("hamming");
        expect(set.kind).toBe(cv.capabilities.defaultDescriptor);
        expect(set.producer).toBe(cv.capabilities.name);
        expect(set.count).toBe(target.keypoints.count);
        expect(set.dimensions).toBe(set.bytesPerDescriptor * 8);
        expect(set.data.length).toBe(set.count * set.bytesPerDescriptor);
        expect(Array.from(set.levelStart)).toEqual(Array.from(target.keypoints.levelStart));
        for (let i = 0; i < set.count; i++) expect(set.kpIndex[i]).toBe(i);
    });

    it("stores the descriptors the backend computed for the UNROUNDED keypoints", () => {
        // f32 storage is a storage decision (5.5); it must not reach describe(),
        // whose sampling patch is positioned from the coordinates it is handed.
        const target = buildTargetFromImage(cv, image, { levels: 4 });
        const raw = cv.detect(image, { levels: 4, maxKeypoints: 4 * 260 });
        const order = raw.map((_, i) => i).sort((a, b) => raw[a].level - raw[b].level || a - b);
        const expected = cv.describe(image, order.map((i) => raw[i]));

        expect(Array.from(target.descriptorSets[0].data)).toEqual(Array.from(expected.data));
    });

    it("defaults the scale step to the cube root of 2 and reflects it in levelSizes", () => {
        expect(DEFAULT_SCALE_STEP).toBe(Math.cbrt(2));
        const { pyramid } = buildTargetFromImage(cv, image, { levels: 4 });
        expect(pyramid.scaleStep).toBe(Math.cbrt(2));
        expect(pyramid.levelSizes[0]).toEqual([image.width, image.height]);
        // Level 1 is one step down, truncated the way the backend truncates.
        expect(pyramid.levelSizes[1]).toEqual([
            (image.width / Math.cbrt(2)) | 0,
            (image.height / Math.cbrt(2)) | 0,
        ]);
        for (let l = 1; l < pyramid.levelSizes.length; l++) {
            expect(pyramid.levelSizes[l][0]).toBeLessThanOrEqual(pyramid.levelSizes[l - 1][0]);
            expect(pyramid.levelSizes[l][1]).toBeLessThanOrEqual(pyramid.levelSizes[l - 1][1]);
        }
    });

    it("takes the scale step from the caller when the backend's differs", () => {
        const { pyramid } = buildTargetFromImage(cv, image, { levels: 4, scaleStep: 2 });
        expect(pyramid.scaleStep).toBe(2);
        expect(pyramid.levelSizes[1]).toEqual([(image.width / 2) | 0, (image.height / 2) | 0]);
    });

    it("rejects a scale step that would make the level mapping meaningless", () => {
        expect(() => buildTargetFromImage(cv, image, { scaleStep: 1 })).toThrow(/scaleStep/);
        expect(() => buildTargetFromImage(cv, image, { scaleStep: Number.NaN })).toThrow(/scaleStep/);
    });

    it("refuses an image with nothing to detect rather than returning an empty target", () => {
        const blank: GrayImage = { data: new Uint8Array(64 * 64).fill(128), width: 64, height: 64 };
        expect(() => buildTargetFromImage(cv, blank)).toThrow(/no keypoints/i);
    });

    it("records the name it is given, and no wall-clock timestamp", () => {
        const target = buildTargetFromImage(cv, image, { levels: 4, name: "pinball" });
        expect(target.info?.name).toBe("pinball");
        // A clock read would make two builds of the same image differ, which
        // ADR-0001 point 7's determinism rule does not allow.
        expect(target.info?.createdAt).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -w @webarkit/nft-tracker -- build_from_image
```

Expected: FAIL — `Failed to resolve import "../src/target/build_from_image.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/nft-tracker/src/target/build_from_image.ts` (LGPL header, then):

```ts
/**
 * Builds an in-memory {@link TargetDb} from a single reference image.
 *
 * This is the seed of the target compiler, and for now it does exactly what
 * the demos do by hand: detect over a pyramid, describe, and lay the result
 * out the way `docs/specs/nft-target-format.md` specifies. Synthetic views,
 * tracking patches and a stored reference image belong to milestone M4; none
 * of them is written here, and every field they would fill is optional in the
 * format precisely so this step can leave them out.
 *
 * Nothing here encodes bytes. The `.wnft` codec is a separate component; this
 * produces the decoded shape it would also produce.
 */

import type { CvBackend, Descriptors, GrayImage, Keypoint } from "@webarkit/cv-backend-spec";
import type { BitsDescriptorSet, KeypointTable, TargetDb } from "./types.js";

/**
 * The format version this builder writes into `formatVersion`.
 *
 * Local to this file on purpose: the codec owns version negotiation (§7) and
 * will export its own constant when it lands. Duplicating the string here is
 * cheaper than reaching across into a component that does not exist yet.
 */
const FORMAT_VERSION = "0.2";

/**
 * Size ratio between consecutive pyramid levels when the caller does not say.
 *
 * The cube root of 2, so three levels halve the image — the step
 * `cv-backend-jsfeatnext` uses internally.
 *
 * It has to be a parameter at all because the contract does not carry it: a
 * `Keypoint.level` only means something together with the step that produced
 * it, and that step is each backend's private constant. Passing a target
 * built against one backend's step to a backend with a different one would
 * silently describe at the wrong scale. This default is therefore right for
 * today's only backend and a guess for any other.
 *
 * TODO: replace the default with the backend's declared step once
 * `BackendCapabilities` carries one. Tracked as the "`Keypoint.level` is
 * ambiguous across backends" contract gap in
 * `docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md`.
 */
export const DEFAULT_SCALE_STEP = Math.cbrt(2);

/** Pyramid levels searched on the reference image — the demos' own setting. */
export const DEFAULT_TARGET_LEVELS = 8;

/** Keypoint budget per level, so `maxKeypoints` scales with the pyramid. */
export const DEFAULT_KEYPOINTS_PER_LEVEL = 260;

export interface BuildTargetOptions {
    /** Pyramid levels to search. Default {@link DEFAULT_TARGET_LEVELS}. */
    readonly levels?: number;
    /**
     * Total keypoint budget. Default
     * `levels * DEFAULT_KEYPOINTS_PER_LEVEL`, matching both demos.
     */
    readonly maxKeypoints?: number;
    /** See {@link DEFAULT_SCALE_STEP}. Must be finite and `> 1`. */
    readonly scaleStep?: number;
    /**
     * `[width, height]` in millimetres. `null` (the default) means unknown,
     * and model-plane units stay level-0 pixels (§3).
     */
    readonly physicalSizeMm?: readonly [number, number] | null;
    /** Recorded in `info.name`. Provenance only; nothing reads it. */
    readonly name?: string;
}

export function buildTargetFromImage(
    cv: CvBackend,
    image: GrayImage,
    options?: BuildTargetOptions
): TargetDb {
    const levels = options?.levels ?? DEFAULT_TARGET_LEVELS;
    const maxKeypoints = options?.maxKeypoints ?? levels * DEFAULT_KEYPOINTS_PER_LEVEL;
    const scaleStep = options?.scaleStep ?? DEFAULT_SCALE_STEP;

    if (!Number.isFinite(scaleStep) || scaleStep <= 1) {
        throw new Error(
            `@webarkit/nft-tracker: scaleStep must be finite and > 1, got ${scaleStep}. ` +
                `A step of 1 or less makes the level-to-level-0 mapping of the target ` +
                `format's section 3 a division by zero or an identity.`
        );
    }

    const detected = cv.detect(image, { levels, maxKeypoints });
    if (detected.length === 0) {
        throw new Error(
            `@webarkit/nft-tracker: no keypoints found in a ${image.width}x${image.height} ` +
                `image over ${levels} levels. A target with no features cannot be matched ` +
                `against anything.`
        );
    }

    // detect() fills a maxKeypoints budget round-robin across levels, so its
    // output is interleaved; the format requires ascending level order (5.5).
    // The sort is STABLE (`|| a - b`): it must not reorder within a level, or
    // the per-level match tie-breaks shift against the demo's.
    const order = detected
        .map((_, i) => i)
        .sort((a, b) => detected[a].level - detected[b].level || a - b);
    const sorted = order.map((i) => detected[i]);

    // Described BEFORE the coordinates are narrowed to f32 below: describe()
    // positions its sampling patch from the coordinates it is handed, so
    // rounding first would compute different bits than the pipeline this
    // package replaces.
    const described = cv.describe(image, sorted);

    const levelCount = sorted[sorted.length - 1].level + 1;
    const keypoints = toKeypointTable(cv, sorted, levelCount);
    const descriptorSet = toDescriptorSet(cv, described, keypoints.levelStart);

    return {
        formatVersion: FORMAT_VERSION,
        generator: `@webarkit/nft-tracker buildTargetFromImage (${cv.capabilities.name})`,
        extensionsUsed: [],
        extensionsRequired: [],
        meta: {
            widthPx: image.width,
            heightPx: image.height,
            physicalSizeMm: options?.physicalSizeMm ?? null,
        },
        pyramid: {
            scaleStep,
            levelSizes: levelSizes(image, levelCount, scaleStep),
        },
        keypoints,
        descriptorSets: [descriptorSet],
        // `info.createdAt` is deliberately unset: a clock read would make two
        // builds of the same image differ, and ADR-0001 point 7 requires
        // fixtures to reproduce. A compiler that wants provenance can add it.
        ...(options?.name === undefined ? {} : { info: { name: options.name } }),
    };
}

/**
 * Reconstructs each level's size the way the backend computed it: repeated
 * division by the step, truncated with `| 0` (the format records this
 * rounding as `cv-backend-jsfeatnext`'s, §5.4). Iterated division rather than
 * `Math.pow(step, -l)` because that is literally what the backend does, and
 * the two disagree in the last bits.
 *
 * §5.4 wants the sizes as the producer made them; the contract exposes no
 * pyramid geometry, so this is a reconstruction from the declared step. Same
 * contract gap as {@link DEFAULT_SCALE_STEP}.
 */
function levelSizes(
    image: GrayImage,
    levelCount: number,
    scaleStep: number
): [number, number][] {
    const sizes: [number, number][] = [[image.width, image.height]];
    let scale = 1;
    for (let level = 1; level < levelCount; level++) {
        scale /= scaleStep;
        const width = (image.width * scale) | 0;
        const height = (image.height * scale) | 0;
        if (width < 1 || height < 1) {
            throw new Error(
                `@webarkit/nft-tracker: level ${level} of a ${image.width}x${image.height} ` +
                    `image at scaleStep ${scaleStep} would be ${width}x${height}, but the ` +
                    `target format requires every level size to be at least 1 (section 5.4). ` +
                    `The backend reported a keypoint at this level, so the step is probably ` +
                    `not the one it used.`
            );
        }
        sizes.push([width, height]);
    }
    return sizes;
}

/** Keypoints, level-sorted already, as the format's structure of arrays (§5.5). */
function toKeypointTable(cv: CvBackend, sorted: readonly Keypoint[], levelCount: number): KeypointTable {
    const count = sorted.length;
    const levelStart = new Uint32Array(levelCount + 1);
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const angle = new Float32Array(count);
    const score = new Float32Array(count);
    const level = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const k = sorted[i];
        x[i] = k.x;
        y[i] = k.y;
        angle[i] = k.angle;
        score[i] = k.score;
        level[i] = k.level;
    }

    // One pass over the sorted levels: each boundary is where the level
    // changes, and every level past the last one seen ends at `count`.
    let next = 0;
    for (let l = 0; l <= levelCount; l++) {
        while (next < count && sorted[next].level < l) next++;
        levelStart[l] = next;
    }
    levelStart[levelCount] = count;

    const detector = cv.capabilities.detectors[0];
    if (detector === undefined) {
        throw new Error(
            `@webarkit/nft-tracker: backend '${cv.capabilities.name}' declares no detectors, ` +
                `so there is nothing honest to record in keypoints.detector.kind.`
        );
    }
    // `DetectOptions` carries no detector selector, so the backend ran the one
    // detector it has; its first declared entry is the honest answer. Revisit
    // when the contract lets a caller choose.
    return { count, detector: { kind: detector, params: {} }, levelStart, x, y, angle, score, level };
}

/** The single descriptor set (§5.6). One row per keypoint, in keypoint order. */
function toDescriptorSet(
    cv: CvBackend,
    described: Descriptors,
    levelStart: Uint32Array
): BitsDescriptorSet {
    return {
        kind: described.kind,
        norm: described.norm,
        elementType: "bits",
        dimensions: described.bytesPerDescriptor * 8,
        bytesPerDescriptor: described.bytesPerDescriptor,
        producer: cv.capabilities.name,
        params: {},
        count: described.count,
        // Rows are in the same order as the keypoints, so the keypoints' own
        // level ranges describe them too.
        levelStart,
        // M = N and kpIndex[i] = i: anything else needs WKNF_multiview (§5.6),
        // which arrives with synthetic views in M4.
        kpIndex: Uint32Array.from({ length: described.count }, (_, i) => i),
        // `describe` allocates a fresh buffer per call, so taking it rather
        // than copying is safe and saves N x bytesPerDescriptor.
        data: described.data,
    };
}
```

- [ ] **Step 4: Export it**

In `packages/nft-tracker/src/index.ts`, add below the `./detection.js` exports:

```ts
export {
    buildTargetFromImage,
    DEFAULT_KEYPOINTS_PER_LEVEL,
    DEFAULT_SCALE_STEP,
    DEFAULT_TARGET_LEVELS,
} from "./target/build_from_image.js";
export type { BuildTargetOptions } from "./target/build_from_image.js";
```

- [ ] **Step 5: Run the tests and typecheck to verify they pass**

```bash
npm run build && npm test -w @webarkit/nft-tracker && npm run typecheck -w @webarkit/nft-tracker
```

Expected: PASS. If "sorts keypoints by level even though detect() returns them interleaved" fails on its **first** assertion (`rawSorted` is already `true`), the backend's round-robin changed — check `detectImpl` before touching the test.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/src/target/build_from_image.ts packages/nft-tracker/src/index.ts packages/nft-tracker/test/build_from_image.test.ts
git commit -F - <<'MSG'
feat(nft-tracker): build an in-memory target from a reference image

buildTargetFromImage does what both demos do by hand -- multi-level detect,
then describe -- and lays the result out as the target format specifies. It
is the seed of the target compiler; synthetic views, patches and a stored
reference image are M4 and are simply absent, which the format allows.

Three details are load-bearing. detect() fills a maxKeypoints budget
round-robin, so its output is interleaved and has to be stably sorted before
5.5's level ordering holds. Descriptors are computed from the unrounded
coordinates and only then narrowed to f32 for storage, so the bits match what
the demo pipeline produces. levelSizes is reconstructed from an explicit
scaleStep, defaulting to Math.cbrt(2), because the contract exposes no
pyramid geometry -- the "Keypoint.level is ambiguous across backends" gap
from ADR-0001, with a TODO pointing at it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: `tracker.ts` — `NftTracker`

M1 is **parity**, so this class does exactly what the webcam demo's tick does and nothing more: detect the frame at one level, describe, match per target level, optionally filter, estimate a homography, decompose it. No state carries between calls — that is M2's patch tracker and state machine — so `process` is a pure function of `(frame, timestampMs)` plus the constructor's target.

The only states M1 has are "a homography was agreed on" and "one was not, for one of two reasons". `ok` follows the demos exactly: they print "locked on" from `h.ok` alone, regardless of whether the pose came out degenerate, and report the pose separately. Copying that is the point.

**Files:**
- Create: `packages/nft-tracker/src/tracker.ts`
- Modify: `packages/nft-tracker/src/index.ts`
- Test: `packages/nft-tracker/test/tracker.test.ts`

**Interfaces:**
- Consumes: `buildLevelIndex`, `chooseDescriptorSet`, `matchPerLevel`, `TargetLevelView` from `./detection.js`; `TargetDb` from `./target/types.js`; `CvBackend`, `GrayImage`, `Keypoint`, `Mat3`, `Pose` from `@webarkit/cv-backend-spec`. `buildTargetFromImage` (tests only) from Task 3, `withSeededRandom` from Task 1.
- Produces:
  - `type TrackFailure = "too-few-matches" | "no-consensus"`
  - `interface NftTrackerOptions { sceneLevels?: number; maxSceneKeypoints?: number; ratio?: number; ransacThreshold?: number }` — no `rng`, see *The RNG, and why the test stubs a global* above
  - `type TrackResult` — a union on `ok`, both arms carrying `timestampMs`, `numMatches`, `numInliers`, `sceneKeypoints`
  - `class NftTracker { constructor(cv, target, K, options?); process(frame, timestampMs): TrackResult }`
  - Defaults: `DEFAULT_SCENE_LEVELS = 1`, `DEFAULT_MAX_SCENE_KEYPOINTS = 300`, `DEFAULT_RATIO = 0.8`, `DEFAULT_RANSAC_THRESHOLD = 4`

  Tasks 6 and 7 consume all of it.

- [ ] **Step 1: Write the failing test**

Create `packages/nft-tracker/test/tracker.test.ts` (LGPL header, then):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { CvBackend, GrayImage, Mat3 } from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import type { TargetDb } from "../src/target/types.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";

let cv: CvBackend;
let target: TargetDb;
let scene: GrayImage;
let K: Mat3;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    target = buildTargetFromImage(cv, readPgm(TARGET_FIXTURE), { levels: 8 });
    scene = readPgm(SCENE_FIXTURE);
    K = intrinsics(scene.width, scene.height);
});

describe("NftTracker.process", () => {
    it("locks on to the target in the scene, and reports the pose separately", () => {
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        // Seeded because RANSAC draws from Math.random and nothing else can
        // reach it yet -- see withSeededRandom's own comment. `draws` is
        // ignored here; the parity test is where it is asserted.
        const { value: result } = withSeededRandom(1, () => tracker.process(scene, 0));

        expect(result.ok).toBe(true);
        if (!result.ok) return; // narrows the union for the assertions below
        expect(result.numInliers).toBeGreaterThanOrEqual(10);
        expect(result.numMatches).toBeGreaterThanOrEqual(result.numInliers);
        expect(result.H.length).toBe(9);
        expect(result.H.every(Number.isFinite)).toBe(true);
        expect(result.pose.R.length).toBe(9);
        expect(result.pose.t.length).toBe(3);
    });

    it("echoes the timestamp it was handed, and keeps no clock of its own", () => {
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        expect(withSeededRandom(1, () => tracker.process(scene, 1234.5)).value.timestampMs).toBe(1234.5);
    });

    it("exposes the frame's keypoints so an overlay can draw them", () => {
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        const { value: result } = withSeededRandom(1, () => tracker.process(scene, 0));
        expect(result.sceneKeypoints.length).toBeGreaterThan(100);
        expect(result.sceneKeypoints.length).toBeLessThanOrEqual(900);
    });

    it("reports too-few-matches on a frame with nothing in it", () => {
        const blank: GrayImage = { data: new Uint8Array(320 * 240).fill(128), width: 320, height: 240 };
        const tracker = new NftTracker(cv, target, K);
        const { value: result } = withSeededRandom(1, () => tracker.process(blank, 0));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("too-few-matches");
        expect(result.numMatches).toBeLessThan(4);
        expect(result.H).toBeNull();
        expect(result.pose).toBeNull();
    });

    it("gives the same answer twice for the same frame under the same seed", () => {
        // ADR-0001 point 7: fixtures have to reproduce. Each run gets its OWN
        // freshly seeded generator -- one generator shared across both would
        // hand the second run a different tail and test nothing.
        const tracker = new NftTracker(cv, target, K, { maxSceneKeypoints: 900 });
        const { value: a } = withSeededRandom(7, () => tracker.process(scene, 0));
        const { value: b } = withSeededRandom(7, () => tracker.process(scene, 0));

        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(b.numInliers).toBe(a.numInliers);
        expect(Array.from(b.H)).toEqual(Array.from(a.H));
    });

    it("honours maxSceneKeypoints rather than a hard-coded budget", () => {
        const { value: few } = withSeededRandom(1, () =>
            new NftTracker(cv, target, K, { maxSceneKeypoints: 50 }).process(scene, 0)
        );
        expect(few.sceneKeypoints.length).toBeLessThanOrEqual(50);
    });

    it("refuses a target whose descriptors this backend cannot read", () => {
        const alien: TargetDb = {
            ...target,
            descriptorSets: [{ ...target.descriptorSets[0], kind: "akaze" }],
        };
        expect(() => new NftTracker(cv, alien, K)).toThrow(/no descriptor set/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -w @webarkit/nft-tracker -- tracker
```

Expected: FAIL — `Failed to resolve import "../src/tracker.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/nft-tracker/src/tracker.ts` (LGPL header, then):

```ts
/**
 * The NFT tracker: find a trained planar target in a camera frame.
 *
 * **Milestone M1 is parity, not progress.** This does exactly what the webcam
 * demo did inline — detect the frame at one level, describe, match the target
 * one pyramid level at a time, optionally filter, estimate a homography,
 * decompose it — and carries nothing from one frame to the next. Repeated
 * detection is not yet tracking; the patch tracker and the state machine that
 * make it tracking are M2, IPPE and temporal filtering are M3.
 *
 * Portability rules it keeps (ADR-0001 point 7): no DOM, no timers, no
 * `requestAnimationFrame`, no camera access — the application owns the loop
 * and hands in a `GrayImage` and a timestamp; results are explicit
 * `{ ok, ... }` values, never exceptions.
 *
 * **On determinism.** Point 7 also asks that every random choice go through an
 * injectable RNG. This class makes none: the one random choice in the pipeline
 * is the minimal-sample draw inside `estimateHomography`, which is below the
 * contract, and `RansacOptions` carries no RNG for a caller to seed. So there
 * is deliberately no `rng` option here — it would accept a generator and have
 * nowhere to pass it. When the contract gains the field this class forwards
 * it and the option appears; until then `process` is exactly as reproducible
 * as the backend's RANSAC is, and the tests are explicit about that.
 */

import type {
    CvBackend,
    GrayImage,
    Keypoint,
    Mat3,
    Pose,
} from "@webarkit/cv-backend-spec";
import { buildLevelIndex, chooseDescriptorSet, matchPerLevel } from "./detection.js";
import type { TargetLevelView } from "./detection.js";
import type { TargetDb } from "./target/types.js";

/**
 * Pyramid levels searched in the LIVE frame.
 *
 * One, deliberately: the target is prepared once, offline, over many levels,
 * and the per-frame work stays cheap. This is the demos' known limitation —
 * a camera moving far from the target has no scale search of its own — kept
 * here so M1 changes nothing. See `examples/README.md`.
 */
export const DEFAULT_SCENE_LEVELS = 1;

/** Keypoint budget for the live frame — the webcam demo's measured setting. */
export const DEFAULT_MAX_SCENE_KEYPOINTS = 300;

/** Lowe ratio for each per-level match call. */
export const DEFAULT_RATIO = 0.8;

/** RANSAC reprojection threshold, in pixels of the live frame. */
export const DEFAULT_RANSAC_THRESHOLD = 4;

/** Why a frame produced no homography. */
export type TrackFailure =
    /** Fewer than the 4 correspondences a homography needs. */
    | "too-few-matches"
    /** Enough matches, but RANSAC found no model they agree on. */
    | "no-consensus";

export interface NftTrackerOptions {
    /** See {@link DEFAULT_SCENE_LEVELS}. */
    readonly sceneLevels?: number;
    /** See {@link DEFAULT_MAX_SCENE_KEYPOINTS}. */
    readonly maxSceneKeypoints?: number;
    /** See {@link DEFAULT_RATIO}. */
    readonly ratio?: number;
    /** See {@link DEFAULT_RANSAC_THRESHOLD}. */
    readonly ransacThreshold?: number;
}

/** What one frame produced. `ok` narrows the union. */
export type TrackResult =
    | {
          readonly ok: true;
          /** Echoed back from `process`; the tracker reads no clock. */
          readonly timestampMs: number;
          readonly numMatches: number;
          readonly numInliers: number;
          /** Row-major 3x3 mapping target level-0 pixels into the frame. */
          readonly H: Mat3;
          /**
           * Decomposition of {@link H}. Present whenever `ok`, but check
           * `pose.good`: a homography RANSAC agreed on can still be
           * geometrically degenerate.
           */
          readonly pose: Pose;
          /** The frame's keypoints, as detected. For overlays. */
          readonly sceneKeypoints: readonly Keypoint[];
      }
    | {
          readonly ok: false;
          readonly reason: TrackFailure;
          readonly timestampMs: number;
          readonly numMatches: number;
          readonly numInliers: number;
          readonly H: null;
          readonly pose: null;
          readonly sceneKeypoints: readonly Keypoint[];
      };

export class NftTracker {
    private readonly levels: TargetLevelView[];
    private readonly sceneLevels: number;
    private readonly maxSceneKeypoints: number;
    private readonly ratio: number;
    private readonly ransacThreshold: number;
    /**
     * The target's keypoints as the contract's array-of-objects, built once —
     * and only when the backend has a `filterMatches` to feed them to, since
     * materialising N objects a frame-filter will never read is pure waste.
     */
    private readonly targetKeypoints: Keypoint[] | null;

    /**
     * @param cv     The backend. Injected, never imported: the tracker runs on
     *               any implementation of the contract (ADR-0001 point 2).
     * @param target A trained target, e.g. from `buildTargetFromImage`.
     * @param K      Camera intrinsics for the frames that will be passed to
     *               {@link process}, row-major 3x3. A parameter because the
     *               tracker never sees the camera.
     */
    constructor(
        private readonly cv: CvBackend,
        private readonly target: TargetDb,
        private readonly K: Mat3,
        options?: NftTrackerOptions
    ) {
        // Both throw on a target this backend cannot read, in the constructor
        // rather than on the first frame: it is a mismatch between target and
        // backend, not a frame that failed to track.
        this.levels = buildLevelIndex(chooseDescriptorSet(cv, target));
        this.sceneLevels = options?.sceneLevels ?? DEFAULT_SCENE_LEVELS;
        this.maxSceneKeypoints = options?.maxSceneKeypoints ?? DEFAULT_MAX_SCENE_KEYPOINTS;
        this.ratio = options?.ratio ?? DEFAULT_RATIO;
        this.ransacThreshold = options?.ransacThreshold ?? DEFAULT_RANSAC_THRESHOLD;
        this.targetKeypoints = cv.filterMatches ? toKeypointArray(target) : null;
    }

    process(frame: GrayImage, timestampMs: number): TrackResult {
        const sceneKeypoints = this.cv.detect(frame, {
            levels: this.sceneLevels,
            maxKeypoints: this.maxSceneKeypoints,
        });
        const sceneDescriptors = this.cv.describe(frame, sceneKeypoints);
        let matches = matchPerLevel(this.cv, sceneDescriptors, this.levels, this.ratio);

        // Skipped exactly as the contract documents when a backend has none.
        if (this.cv.filterMatches && this.targetKeypoints) {
            matches = this.cv.filterMatches(
                matches,
                { keypoints: sceneKeypoints, width: frame.width, height: frame.height },
                {
                    keypoints: this.targetKeypoints,
                    width: this.target.meta.widthPx,
                    height: this.target.meta.heightPx,
                }
            );
        }

        if (matches.length < 4) {
            return {
                ok: false,
                reason: "too-few-matches",
                timestampMs,
                numMatches: matches.length,
                numInliers: 0,
                H: null,
                pose: null,
                sceneKeypoints,
            };
        }

        // src = target points, dst = frame points, so H maps the target plane
        // into the frame and its corners can be drawn straight onto it.
        const src = new Float64Array(matches.length * 2);
        const dst = new Float64Array(matches.length * 2);
        const kp = this.target.keypoints;
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            // f32 -> number widens here, which is what §5.5 means by "readers
            // widen to Float64 when building the contract's PointArray".
            src[i * 2] = kp.x[m.trainIdx];
            src[i * 2 + 1] = kp.y[m.trainIdx];
            dst[i * 2] = sceneKeypoints[m.queryIdx].x;
            dst[i * 2 + 1] = sceneKeypoints[m.queryIdx].y;
        }

        const h = this.cv.estimateHomography(src, dst, { threshold: this.ransacThreshold });
        if (!h.ok) {
            return {
                ok: false,
                reason: "no-consensus",
                timestampMs,
                numMatches: matches.length,
                numInliers: h.numInliers,
                H: null,
                pose: null,
                sceneKeypoints,
            };
        }

        return {
            ok: true,
            timestampMs,
            numMatches: matches.length,
            numInliers: h.numInliers,
            H: h.H,
            pose: this.cv.poseFromHomography(h.H, this.K),
            sceneKeypoints,
        };
    }
}

/**
 * The target's keypoint table back as the contract's `Keypoint[]`.
 *
 * `filterMatches` takes an array of objects; a `TargetDb` stores a structure
 * of arrays. The conversion happens once, in the constructor, not per frame.
 */
function toKeypointArray(target: TargetDb): Keypoint[] {
    const kp = target.keypoints;
    const out: Keypoint[] = new Array(kp.count);
    for (let i = 0; i < kp.count; i++) {
        out[i] = { x: kp.x[i], y: kp.y[i], score: kp.score[i], angle: kp.angle[i], level: kp.level[i] };
    }
    return out;
}
```

- [ ] **Step 4: Export it**

In `packages/nft-tracker/src/index.ts`, add:

```ts
export {
    DEFAULT_MAX_SCENE_KEYPOINTS,
    DEFAULT_RANSAC_THRESHOLD,
    DEFAULT_RATIO,
    DEFAULT_SCENE_LEVELS,
    NftTracker,
} from "./tracker.js";
export type { NftTrackerOptions, TrackFailure, TrackResult } from "./tracker.js";
```

- [ ] **Step 5: Run the tests and typecheck to verify they pass**

```bash
npm run build && npm test -w @webarkit/nft-tracker && npm run typecheck -w @webarkit/nft-tracker
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/src/tracker.ts packages/nft-tracker/src/index.ts packages/nft-tracker/test/tracker.test.ts
git commit -F - <<'MSG'
feat(nft-tracker): add NftTracker, at parity with the webcam demo

process(frame, timestampMs) runs the demo's own tick: detect the frame at one
level, describe, match the target per pyramid level, optionally filter,
estimate a homography, decompose it. Nothing carries between frames, because
nothing did before -- the patch tracker and the state machine that turn
repeated detection into tracking are M2.

The result is an explicit union on `ok`, with the two failure reasons the
demos already distinguished ("too few matches" and "no consensus"); `ok`
follows h.ok alone, as the demos do, and a degenerate pose is reported
through pose.good rather than by failing the frame. sceneKeypoints comes back
with it because both demos draw them.

No DOM, no timers, no camera, and K is a constructor parameter, per ADR-0001
point 7. There is deliberately no rng option: the tracker makes no random
choice of its own, and the one in the pipeline lives inside
estimateHomography, which the contract gives no way to seed. An option with
nowhere to pass it would be an unreachable capability; it lands the day
RansacOptions.rng does.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: The parity test

**What parity means here.** The reference side of this test is a **transcription of the static demo's pipeline**, written out longhand in the test file — including its own private copies of the demo's `buildLevelIndex` and `sliceDescriptors` and `matchPerLevel`, taken verbatim from `examples/js/pinball-shared.mjs` as it stands **before** Task 6 deletes them. It must share no code with `src/`. A reference side that imported the package's helpers would be comparing the tracker against itself and would pass no matter what broke.

**Where the two sides are allowed to differ, and by how much.** Each side runs inside its own `withSeededRandom(SEED, …)`, so RANSAC's minimal-sample draw starts from the same generator state in both and the two draw the identical samples. Nothing else in the jsfeatNext pipeline consumes randomness — `detect`, `describe` and `match` are deterministic — so the seeded region covers exactly the one place that matters. Everything else is identical by construction: the same `GrayImage` inputs, the same detector calls, byte-identical descriptors (Task 3 describes before narrowing to `f32`), the same match order and the same tie-breaks (Task 2).

Exactly **one** difference survives: the tracker's target coordinates round-trip through `Float32Array`, because the target format stores them that way (§5.5), while the demo keeps the `Float64` numbers `detect` returned. `f32` has a 24-bit significand, so at the target's largest coordinate (640 px) the quantisation is at most `640 × 2⁻²⁴ ≈ 3.8 × 10⁻⁵` px per coordinate.

That gives the two assertions their shapes:

- **Inlier count: exactly equal.** A 4 × 10⁻⁵ px perturbation cannot move a correspondence across a 4 px RANSAC threshold unless it was already sitting within 4 × 10⁻⁵ px of it. If this fails, something other than `f32` storage changed — that is a finding, not a tolerance to widen.
- **Homography: compared by what it does, to within 0.05 px.** `H` is homogeneous — defined up to scale — so comparing it element-wise compares an arbitrary normalisation, not a map. Reproject the target's four corners through both homographies and take the largest displacement. **0.05 px** is roughly 10³ × the `f32` quantisation of the inputs, so it absorbs the conditioning of the 4-point DLT and the inlier refit without being slack; it is ~80 × below the 4 px threshold the estimate is fitted to, and ~20 × below the single pixel the demo's overlay is judged in on screen. A divergence of, say, half a pixel is not `f32` rounding and must be understood, not accommodated.

**If it fails:** use `superpowers:systematic-debugging`. Do **not** raise the tolerance to get to green. The likely culprits, in order: the sort in Task 3 lost its stability, so per-level tie-breaks moved; `describe` was called on rounded coordinates; a level with fewer than two rows stopped being skipped; the two runs are sharing one seeded region instead of getting one each.

**Files:**
- Test: `packages/nft-tracker/test/parity.test.ts`

**Interfaces:**
- Consumes: `NftTracker` (Task 4), `buildTargetFromImage` (Task 3), `readPgm`/`TARGET_FIXTURE`/`SCENE_FIXTURE`/`withSeededRandom` (Task 1), `createJsfeatNextBackend`/`intrinsics` from `@webarkit/cv-backend-jsfeatnext`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `packages/nft-tracker/test/parity.test.ts` (LGPL header, then):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type {
    CvBackend,
    Descriptors,
    GrayImage,
    Keypoint,
    Mat3,
    Match,
} from "@webarkit/cv-backend-spec";
import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
import { NftTracker } from "../src/tracker.js";
import { buildTargetFromImage } from "../src/target/build_from_image.js";
import { readPgm, SCENE_FIXTURE, TARGET_FIXTURE } from "./fixtures/pgm.js";
import { withSeededRandom } from "./fixtures/seeded_rng.js";

/*
 * ---------------------------------------------------------------------------
 * The reference pipeline.
 *
 * A longhand transcription of examples/pinball-static-jsfeatnext-backend.html
 * and the buildLevelIndex / sliceDescriptors / matchPerLevel that lived in
 * examples/js/pinball-shared.mjs before this milestone moved them. It shares
 * NO code with src/ on purpose: a reference side that called the package's
 * own helpers would compare the tracker against itself.
 *
 * Do not refactor these into the package's versions. Their whole value is
 * that they are a frozen copy of the behaviour being preserved.
 * ---------------------------------------------------------------------------
 */

/** Verbatim from the demo: slices a Descriptors set down to `indices`. */
function sliceDescriptors(d: Descriptors, indices: number[]): Descriptors {
    const bytes = d.bytesPerDescriptor;
    const data = new Uint8Array(indices.length * bytes);
    indices.forEach((src, i) => data.set(d.data.subarray(src * bytes, (src + 1) * bytes), i * bytes));
    return { ...d, data, count: indices.length };
}

/** Verbatim from the demo: groups a multi-scale target's rows by level. */
function referenceLevelIndex(
    kTarget: Keypoint[],
    dTarget: Descriptors
): { level: number; indices: number[]; descriptors: Descriptors }[] {
    const byLevel = new Map<number, number[]>();
    kTarget.forEach((k, i) => {
        const bucket = byLevel.get(k.level);
        if (bucket) bucket.push(i);
        else byLevel.set(k.level, [i]);
    });
    const levels: { level: number; indices: number[]; descriptors: Descriptors }[] = [];
    for (const [level, indices] of byLevel) {
        if (indices.length < 2) continue;
        levels.push({ level, indices, descriptors: sliceDescriptors(dTarget, indices) });
    }
    return levels;
}

/** Verbatim from the demo: best hit per query keypoint, one level at a time. */
function referenceMatchPerLevel(
    cv: CvBackend,
    dQuery: Descriptors,
    levelIndex: ReturnType<typeof referenceLevelIndex>,
    ratio: number
): Match[] {
    const best = new Map<number, Match>();
    for (const { indices, descriptors } of levelIndex) {
        for (const m of cv.match(dQuery, descriptors, { ratio })) {
            const prev = best.get(m.queryIdx);
            if (!prev || m.distance < prev.distance) {
                best.set(m.queryIdx, {
                    queryIdx: m.queryIdx,
                    trainIdx: indices[m.trainIdx],
                    distance: m.distance,
                });
            }
        }
    }
    return [...best.values()];
}

interface ReferenceResult {
    ok: boolean;
    numMatches: number;
    numInliers: number;
    H: Mat3 | null;
}

/**
 * The static demo's `run()`, minus the drawing.
 *
 * Call it inside `withSeededRandom`: the `estimateHomography` below draws from
 * `Math.random`, because the contract exposes no RNG to pass one in. Nothing
 * else here draws, so the seeded region is larger than it strictly needs to be
 * and costs nothing.
 */
function referencePipeline(cv: CvBackend, target: GrayImage, scene: GrayImage): ReferenceResult {
    const LEVELS = 8;
    const kScene = cv.detect(scene, { levels: 1, maxKeypoints: 900 });
    const kTarget = cv.detect(target, { levels: LEVELS, maxKeypoints: LEVELS * 260 });
    const dScene = cv.describe(scene, kScene);
    const dTarget = cv.describe(target, kTarget);

    const targetLevels = referenceLevelIndex(kTarget, dTarget);
    let matches = referenceMatchPerLevel(cv, dScene, targetLevels, 0.8);

    if (cv.filterMatches) {
        matches = cv.filterMatches(
            matches,
            { keypoints: kScene, width: scene.width, height: scene.height },
            { keypoints: kTarget, width: target.width, height: target.height }
        );
    }

    if (matches.length < 4) return { ok: false, numMatches: matches.length, numInliers: 0, H: null };

    const src = new Float64Array(matches.length * 2);
    const dst = new Float64Array(matches.length * 2);
    matches.forEach((m, i) => {
        src[i * 2] = kTarget[m.trainIdx].x;
        src[i * 2 + 1] = kTarget[m.trainIdx].y;
        dst[i * 2] = kScene[m.queryIdx].x;
        dst[i * 2 + 1] = kScene[m.queryIdx].y;
    });

    const h = cv.estimateHomography(src, dst, { threshold: 4 });
    return { ok: h.ok, numMatches: matches.length, numInliers: h.numInliers, H: h.ok ? h.H : null };
}

/** Verbatim from the demo: applies a row-major 3x3 homography to a point. */
function project(H: Mat3, x: number, y: number): [number, number] {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * How far apart two homographies place the target's corners, in pixels.
 *
 * H is homogeneous, so element-wise comparison compares an arbitrary
 * normalisation rather than a map. The corners are what the demo actually
 * draws, so their displacement is the quantity that means something.
 */
function maxCornerDisplacement(a: Mat3, b: Mat3, width: number, height: number): number {
    const corners: [number, number][] = [
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1],
    ];
    let worst = 0;
    for (const [x, y] of corners) {
        const [ax, ay] = project(a, x, y);
        const [bx, by] = project(b, x, y);
        worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
    }
    return worst;
}

/**
 * Tolerance on that displacement, in pixels.
 *
 * The two pipelines are identical by construction except for one thing: the
 * tracker's target coordinates round-trip through Float32Array, because the
 * target format stores them that way (5.5), while the demo keeps the Float64
 * numbers detect() returned. f32 carries a 24-bit significand, so at the
 * target's largest coordinate (640 px) that costs at most 640 * 2^-24, about
 * 3.8e-5 px per coordinate.
 *
 * 0.05 px is ~1000x that quantisation -- enough headroom for the 4-point DLT's
 * conditioning and the inlier refit to amplify it -- while staying ~80x below
 * the 4 px RANSAC threshold the estimate is fitted to and ~20x below the one
 * pixel the demo's overlay is judged in on screen. Anything larger is not f32
 * rounding, and widening this number would only hide that.
 *
 * This argument depends on both sides drawing the same RANSAC samples, which
 * is what withSeededRandom buys and why it is worth its ugliness until
 * RansacOptions carries an rng.
 */
const MAX_CORNER_DISPLACEMENT_PX = 0.05;

const SEED = 20260911;

let cv: CvBackend;
let target: GrayImage;
let scene: GrayImage;
let K: Mat3;

beforeAll(async () => {
    cv = await createJsfeatNextBackend();
    target = readPgm(TARGET_FIXTURE);
    scene = readPgm(SCENE_FIXTURE);
    K = intrinsics(scene.width, scene.height);
});

describe("NftTracker reproduces the demo pipeline", () => {
    it("locks on where the demo locks on, with the same matches and inliers", () => {
        // Each side runs under its OWN freshly seeded Math.random, so both
        // consume the identical sequence from their first draw. Building the
        // target is left outside the seeded region: it draws nothing, and
        // keeping the region down to the pipelines makes the symmetry visible.
        const targetDb = buildTargetFromImage(cv, target, { levels: 8 });
        const { value: reference } = withSeededRandom(SEED, () => referencePipeline(cv, target, scene));
        const { value: tracked } = withSeededRandom(SEED, () =>
            // 900 is the STATIC demo's budget; the webcam demo's 300 is the default.
            new NftTracker(cv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        // Guard the fixture itself: if the reference pipeline no longer finds
        // the target, "the two agree" would be a vacuous pass.
        expect(reference.ok).toBe(true);
        expect(reference.numInliers).toBeGreaterThanOrEqual(10);

        expect(tracked.ok).toBe(reference.ok);
        expect(tracked.numMatches).toBe(reference.numMatches);
        // Exactly equal: see MAX_CORNER_DISPLACEMENT_PX -- an f32 perturbation
        // of 4e-5 px cannot move a correspondence across a 4 px threshold.
        expect(tracked.numInliers).toBe(reference.numInliers);
    });

    it("recovers the same homography, to within the f32 storage of the target's coordinates", () => {
        const targetDb = buildTargetFromImage(cv, target, { levels: 8 });
        const { value: reference } = withSeededRandom(SEED, () => referencePipeline(cv, target, scene));
        const { value: tracked } = withSeededRandom(SEED, () =>
            new NftTracker(cv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        expect(reference.ok && tracked.ok).toBe(true);
        if (!reference.H || !tracked.ok) return;

        const displacement = maxCornerDisplacement(tracked.H, reference.H, target.width, target.height);
        // Logged so a reviewer sees the headroom, not just the verdict.
        console.log(`parity: max corner displacement ${displacement.toExponential(2)} px`);
        expect(displacement).toBeLessThan(MAX_CORNER_DISPLACEMENT_PX);
    });

    it("finds the same scene keypoints the demo's own detect call finds", () => {
        // The frame side of the pipeline should be bit-identical: nothing about
        // it goes through the target format, so any difference here is a bug in
        // how the tracker calls detect, not a rounding effect.
        const expected = cv.detect(scene, { levels: 1, maxKeypoints: 900 });
        const targetDb = buildTargetFromImage(cv, target, { levels: 8 });
        const { value: tracked } = withSeededRandom(SEED, () =>
            new NftTracker(cv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        expect(tracked.sceneKeypoints.length).toBe(expected.length);
        expect(tracked.sceneKeypoints.map((k) => [k.x, k.y, k.level])).toEqual(
            expected.map((k) => [k.x, k.y, k.level])
        );
    });

    it("draws randomness only inside RANSAC, and the same amount on both sides", () => {
        // This test guards the instrument the two above depend on. Seeding a
        // GLOBAL reaches every consumer of Math.random in the process, which is
        // harmless only while nothing but RANSAC draws -- true of jsfeatNext
        // today, but a fact about a dependency, not a guarantee. Left
        // undefended, a new draw site upstream would shift the sequence under
        // every comparison in this file and the symptom would surface as a
        // mysterious tolerance failure somewhere else.
        const deterministic = withSeededRandom(SEED, () => {
            // Everything both pipelines do before RANSAC: the tracker's target
            // preparation, and the frame-side work, through this file's own
            // transcriptions rather than the package's helpers.
            const db = buildTargetFromImage(cv, target, { levels: 8 });
            const kScene = cv.detect(scene, { levels: 1, maxKeypoints: 900 });
            const kTarget = cv.detect(target, { levels: 8, maxKeypoints: 8 * 260 });
            const dScene = cv.describe(scene, kScene);
            const dTarget = cv.describe(target, kTarget);
            const matches = referenceMatchPerLevel(cv, dScene, referenceLevelIndex(kTarget, dTarget), 0.8);
            return db.keypoints.count + matches.length;
        });

        // Non-vacuous: the block above really did the work.
        expect(deterministic.value).toBeGreaterThan(0);
        // The assertion that names the culprit. If detect, describe, match or
        // the target builder ever starts drawing, this fails and points here.
        expect(deterministic.draws).toBe(0);

        const targetDb = buildTargetFromImage(cv, target, { levels: 8 });
        const reference = withSeededRandom(SEED, () => referencePipeline(cv, target, scene));
        const tracked = withSeededRandom(SEED, () =>
            new NftTracker(cv, targetDb, K, { maxSceneKeypoints: 900 }).process(scene, 0)
        );

        expect(reference.draws).toBeGreaterThan(0);
        // Equal counts mean both runs consumed the identical sequence, which is
        // what the tolerance argument above rests on.
        //
        // A mismatch has two possible causes, and they are distinguishable. A
        // new Math.random site: the zero-draw assertion above catches that
        // first, so if it passed and this failed, look elsewhere. Or RANSAC's
        // adaptive iteration budget diverging -- update_iters() shortens the
        // loop from an improving hypothesis's inlier ratio, so an f32-perturbed
        // coordinate flipping one intermediate hypothesis changes how many
        // draws the run takes, without necessarily changing the answer. If this
        // fails while the inlier-count and corner-displacement assertions still
        // pass, that is the second cause -- and it means the f32 perturbation
        // reaches further than the tolerance reasoning assumes, which is worth
        // understanding rather than silencing.
        expect(tracked.draws).toBe(reference.draws);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm run build && npm test -w @webarkit/nft-tracker -- parity
```

Expected: PASS, with a logged displacement several orders of magnitude below `0.05`.

- [ ] **Step 3: Record the measured headroom**

Take the number from the `parity:` log line and write it into the `MAX_CORNER_DISPLACEMENT_PX` doc comment as a final sentence, e.g.:

```ts
 * Measured on these fixtures: 3.1e-04 px, three orders of magnitude inside
 * this bound.
```

A tolerance with no recorded observation next to it is indistinguishable from a guess, and the next person to see this test fail needs to know whether 0.04 px would have been normal.

- [ ] **Step 4: If it fails, debug it — do not widen the tolerance**

Invoke `superpowers:systematic-debugging`. Check, in this order:

1. Is the sort in `build_from_image.ts` still stable (`|| a - b` present)? An unstable sort reorders within a level and moves `matchPerLevel`'s tie-breaks.
2. Is `cv.describe` called on `sorted` (the detected keypoints) rather than on anything rebuilt from the `f32` table?
3. Does `buildLevelIndex` still skip levels with fewer than two rows?
4. Is each side inside its **own** `withSeededRandom(SEED, …)` call? One call wrapping both runs would let the first consume draws the second then never sees.
5. Compare `numMatches` first: if the match counts already differ, the divergence is upstream of RANSAC and none of the homography reasoning applies.
6. Read the draw counts from "draws randomness only inside RANSAC". A non-zero count for the deterministic stages means a dependency started drawing and the global stub is no longer isolating RANSAC — fix that before trusting any other number in this file.

- [ ] **Step 5: Run the whole suite**

```bash
npm run build && npm run typecheck && npm test
```

Expected: PASS, all workspaces.

- [ ] **Step 6: Commit**

```bash
git add packages/nft-tracker/test/parity.test.ts
git commit -F - <<'MSG'
test(nft-tracker): pin NftTracker against the static demo's pipeline

The reference side is a longhand transcription of the static demo, carrying
its own frozen copies of buildLevelIndex, sliceDescriptors and matchPerLevel
as they stood in examples/js/pinball-shared.mjs. It shares no code with src/
deliberately: a reference that called the package's helpers would compare the
tracker against itself.

Both sides pass an equivalent freshly-seeded generator to estimateHomography,
so RANSAC draws the same minimal samples, which leaves exactly one difference
between them -- the tracker's target coordinates round-trip through f32,
because the format stores them that way. Inlier counts must therefore match
exactly, and the homographies are compared by the displacement of the
target's reprojected corners, bounded at 0.05 px: ~1000x the f32 quantisation
of the inputs, ~80x below the RANSAC threshold, ~20x below the pixel the
demo's overlay is judged in.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Move the demos onto the package, and keep the prose true

The two demos are not interchangeable, and this task treats them differently on purpose.

- The **static demo** is the *contract* demo: `examples/README.md` calls it "the full pipeline on two still images", it names every stage on screen, and it draws match lines coloured by RANSAC's inlier mask. Hiding those stages behind `NftTracker` would delete the thing the page exists to show. It keeps its explicit pipeline and takes the package's **target builder and detection helpers** instead of the demo-local ones.
- The **webcam demo** is the tracking demo, and M1 is exactly what it does. Its whole per-tick pipeline collapses into one `tracker.process(...)` call.

Both stop importing `buildLevelIndex`/`matchPerLevel` from `pinball-shared.mjs`, which is what lets Task 2's move actually delete something.

**Files:**
- Modify: `examples/js/pinball-shared.mjs`
- Modify: `examples/pinball-static-jsfeatnext-backend.html`
- Modify: `examples/pinball-webcam-jsfeatnext-backend.html`
- Modify: `examples/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything Tasks 2–4 produced, through `@webarkit/nft-tracker`'s built `dist/index.js`.
- Produces: nothing.

- [ ] **Step 1: Strip `pinball-shared.mjs` down to what still belongs there**

In `examples/js/pinball-shared.mjs`, delete `sliceDescriptors`, `buildLevelIndex` and `matchPerLevel` entirely (everything from the `sliceDescriptors` doc comment to the end of the file), and replace the module's summary comment with:

```js
/**
 * Shared between the static and webcam pinball demos, so the two don't drift:
 * pixel-to-GrayImage conversion and homography point projection. Both are
 * page concerns — they touch the DOM or the canvas — which is exactly why
 * they stayed here when the per-pyramid-level matching strategy moved into
 * `@webarkit/nft-tracker`, where the tracker needs it too.
 */
```

Keep `toGray` and `project` exactly as they are.

- [ ] **Step 2: Point both pages at the package**

In **both** HTML files, add `@webarkit/nft-tracker` to the import map:

```json
          "@webarkit/cv-backend-jsfeatnext": "../packages/cv-backend-jsfeatnext/dist/index.js",
          "@webarkit/nft-tracker": "../packages/nft-tracker/dist/index.js"
```

- [ ] **Step 3: Rework the static demo's target preparation**

In `examples/pinball-static-jsfeatnext-backend.html`, change the imports to:

```js
      import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
      import {
        buildLevelIndex,
        buildTargetFromImage,
        chooseDescriptorSet,
        matchPerLevel,
      } from "@webarkit/nft-tracker";
      import { toGray, project } from "./js/pinball-shared.mjs";
```

Then replace the detection block — from `const LEVELS = 8;` down to the `let matches = matchPerLevel(...)` line — with:

```js
        // The scene is treated like a live frame: one level, whatever scale the
        // camera happened to give us. The TARGET is the thing we search across
        // scales, which is how a tracker works too - the reference is prepared
        // once, offline, and the frame is cheap. buildTargetFromImage is that
        // offline step, and what it returns is the same in-memory target a
        // compiled .wnft file decodes to.
        const LEVELS = 8;
        const kScene = cv.detect(scene, { levels: 1, maxKeypoints: 900 });
        const dScene = cv.describe(scene, kScene);
        const targetDb = buildTargetFromImage(cv, target, { levels: LEVELS, name: "pinball" });

        // Match each target level SEPARATELY and keep the best hit per scene
        // keypoint, rather than pooling every level into one train set — see
        // matchPerLevel's own doc comment for why. Measured on these images:
        // 98 matches per-level against 46 pooled, at the same ratio.
        const targetLevels = buildLevelIndex(chooseDescriptorSet(cv, targetDb));
        let matches = matchPerLevel(cv, dScene, targetLevels, 0.8);
```

`matches[i].trainIdx` now indexes `targetDb.keypoints`, a structure of arrays, not a `kTarget` array of objects. Replace every remaining `kTarget[...]` read accordingly:

- the `src`/`dst` fill: `src[i * 2] = targetDb.keypoints.x[m.trainIdx];` and `src[i * 2 + 1] = targetDb.keypoints.y[m.trainIdx];`
- `drawKeypoints`: `for (let i = 0; i < targetDb.keypoints.count; i++) ctx.fillRect(targetDb.keypoints.x[i] - 1, targetDb.keypoints.y[i] - 1, 2, 2);`
- `drawMatches`: `ctx.moveTo(targetDb.keypoints.x[m.trainIdx], targetDb.keypoints.y[m.trainIdx]);`
- the `filterMatches` train view: build it from the table only when the backend has the method —

```js
        if (cv.filterMatches) {
          const kTarget = Array.from({ length: targetDb.keypoints.count }, (_, i) => ({
            x: targetDb.keypoints.x[i],
            y: targetDb.keypoints.y[i],
            score: targetDb.keypoints.score[i],
            angle: targetDb.keypoints.angle[i],
            level: targetDb.keypoints.level[i],
          }));
          matches = cv.filterMatches(
            matches,
            { keypoints: kScene, width: scene.width, height: scene.height },
            { keypoints: kTarget, width: targetDb.meta.widthPx, height: targetDb.meta.heightPx }
          );
        }
```

- `stat("keypoints (target)", ...)`: `targetDb.keypoints.count`.

`drawOutline`'s corners already use `target.width`/`target.height` from the `GrayImage`, which is still in scope — leave them.

- [ ] **Step 4: Put the webcam demo on `NftTracker`**

In `examples/pinball-webcam-jsfeatnext-backend.html`, change the imports to:

```js
      import { createJsfeatNextBackend, intrinsics } from "@webarkit/cv-backend-jsfeatnext";
      import { NftTracker, buildTargetFromImage } from "@webarkit/nft-tracker";
      import { toGray, project } from "./js/pinball-shared.mjs";
```

In `main()`, replace the three lines that detect, describe and index the target with:

```js
        const targetDb = buildTargetFromImage(cv, target, { levels: TARGET_LEVELS, name: "pinball" });
```

and pass `targetDb` where `target, kTarget, targetLevels` were passed before (`startCamera(cv, targetDb)`; the `GrayImage` itself is no longer needed after this point, since `targetDb.meta` carries the size).

In `startCamera`, after `const K = intrinsics(probe.width, probe.height);`, construct the tracker and hand it to the loop:

```js
        // The tracker owns the pipeline from here on: ADR-0001 point 7 keeps
        // the loop, the camera and the canvas out of the package, which is why
        // this page still owns all three.
        const tracker = new NftTracker(cv, targetDb, K, { maxSceneKeypoints: SCENE_MAX_KEYPOINTS });
        runLoop(tracker, targetDb);
```

Replace the body of `tick()` from `const scene = toGray(...)` down to the end of the pose block with:

```js
          const scene = toGray(video, video.videoWidth, video.videoHeight, PROC_WIDTH, PROC_HEIGHT);
          const result = tracker.process(scene, t0);
```

and rewrite the drawing and stats against `result`, preserving every string the page printed before:

```js
          octx.clearRect(0, 0, overlay.width, overlay.height);
          octx.fillStyle = "#60a5fa";
          for (const k of result.sceneKeypoints) octx.fillRect(k.x - 1, k.y - 1, 2, 2);

          if (result.ok) {
            const corners = [
              [0, 0],
              [targetDb.meta.widthPx - 1, 0],
              [targetDb.meta.widthPx - 1, targetDb.meta.heightPx - 1],
              [0, targetDb.meta.heightPx - 1],
            ].map(([x, y]) => project(result.H, x, y));
            octx.strokeStyle = "#fbbf24";
            octx.lineWidth = 3;
            octx.beginPath();
            corners.forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y)));
            octx.closePath();
            octx.stroke();
          }

          statusEl.textContent = result.ok
            ? "locked on"
            : result.reason === "too-few-matches"
              ? "too few matches"
              : "no consensus";
          renderStats([
            ["fps", fps.toFixed(1)],
            ["keypoints (scene)", result.sceneKeypoints.length],
            ["matches", result.numMatches],
            // "—" exactly where the old code had no `h` to report: below four
            // matches the pipeline never reached RANSAC.
            ["inliers", result.numMatches >= 4 ? `${result.numInliers} / ${result.numMatches}` : "—"],
            ["pose", result.ok ? (result.pose.good ? "recovered" : "degenerate") : "—"],
            ["frame time", `${elapsed.toFixed(1)} ms`],
          ]);
```

Update `runLoop`'s signature and its `startCamera` call site to match (`runLoop(tracker, targetDb)` — `video` is already module-scope), and drop the now-unused `cv`, `target`, `kTarget`, `targetLevels` and `K` parameters it used to thread through.

- [ ] **Step 5: Serve the demos and confirm they still behave**

```bash
npm run build && npx http-server -p 8080 -s
```

Open <http://localhost:8080/examples/pinball-static-jsfeatnext-backend.html>. Expected, unchanged from before this branch: status "locked on", a yellow quadrilateral sitting on the pinball machine in the right-hand image, green match lines, and a keypoint/match/inlier count in the same ballpark the page showed before.

Then open <http://localhost:8080/examples/pinball-webcam-jsfeatnext-backend.html>, click Start, and point the camera at the printed target (or at the target image on another screen). Expected: the same overlay and the same four status strings as before. Check the browser console is clean.

If a page shows nothing, check the console first for an import-map miss — `@webarkit/nft-tracker` resolves to `dist/`, so `npm run build` must have run after Tasks 2–4.

- [ ] **Step 6: Bring the prose back in line**

In `examples/README.md`:

- In the **"Shared code: `js/pinball-shared.mjs`"** section, replace "the same three pieces" with "the same two pieces", drop the per-level matching from the list, and add: "The per-pyramid-level matching strategy that used to live here moved into [`@webarkit/nft-tracker`](../packages/nft-tracker) — it is tracker logic, not page logic, and the tracker needs it too. What stayed is what touches the DOM."
- In the **`pinball-static-jsfeatnext-backend.html`** section, under "Matching runs one target level at a time", add: "Both pieces now come from `@webarkit/nft-tracker`: `buildTargetFromImage` prepares the multi-scale reference, and `buildLevelIndex` + `matchPerLevel` do the per-level matching over the target's stored level ranges. The page keeps its own explicit `detect → describe → match → estimateHomography → poseFromHomography` calls, because showing every stage is what it is for."
- In the **`pinball-webcam-jsfeatnext-backend.html`** section, replace the opening sentence with: "The same pipeline, live, through `NftTracker` — the page calls `tracker.process(frame, timestampMs)` once per tick and draws what comes back. Milestone M1 of [ADR-0001](../docs/adr/0001-nft-tracker-ts-reference-above-cvbackend.md) is parity, so the tracker still carries **no state between ticks**: each frame is detected, matched and pose-estimated from nothing, and a tick that fails to lock on has no memory of the tick before it that did. The page still owns the camera, the loop and the canvas; the package owns none of them (ADR point 7)."

In the root `README.md`, line 39, replace "Currently the in-memory target types only" with "Currently the in-memory target types, an image-to-target builder, per-pyramid-level matching and a detection-only `NftTracker` (milestone M1)".

- [ ] **Step 7: Run everything**

```bash
npm run build && npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add examples packages/nft-tracker README.md
git commit -F - <<'MSG'
refactor(examples): drive the demos from @webarkit/nft-tracker

pinball-shared.mjs keeps toGray and project -- the two page concerns -- and
loses buildLevelIndex, matchPerLevel and sliceDescriptors, which are now the
package's.

The two demos take the package differently, on purpose. The webcam demo is
the tracking demo and M1 is exactly what it does, so its per-tick pipeline
collapses into one tracker.process() call; every status string and stat it
printed is preserved. The static demo is the CONTRACT demo -- it names every
stage on screen and colours match lines by RANSAC's mask -- so it keeps its
explicit pipeline and takes only buildTargetFromImage and the per-level
matching helpers. Hiding those stages behind the tracker would delete what
the page exists to show.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Finishing

- [ ] **Verification.** Use `superpowers:verification-before-completion`. At minimum, from a clean tree in the worktree: `npm install`, `npm run build`, `npm run typecheck`, `npm test` — the four things CI runs — plus both demo pages opened in a browser (Task 6, step 5). Report what actually ran and what it printed; a claim of "verified" without the output is not one.
- [ ] **Review.** Use `superpowers:requesting-code-review` and dispatch the **`nft-reviewer`** agent over the full branch diff (`git diff dev...feat/nft-tracker-m1`). It checks against ADR-0001, the target format spec and AGENTS.md. Points worth its attention explicitly: the reconstruction of `levelSizes` from a caller-supplied `scaleStep`; whether the parity tolerance in Task 5 is argued or merely asserted; and whether `withSeededRandom` is scoped tightly enough and sufficiently signposted as temporary.
- [ ] **Address the review** with `superpowers:receiving-code-review`, then re-run the four commands.
- [ ] **Land it.** Use `superpowers:finishing-a-development-branch`. The PR targets **`dev`**, never `master`. The body should state, in English: what M1 delivers; that ADR-0001 action item 4 is now done (and that it may be ticked in a follow-up, since an accepted ADR's action list is the one part of it that tracks progress); that the target codec is deliberately untouched because it lives on `feat/nft-target-format`; and that the tests seed `Math.random` because `RansacOptions` carries no RNG, linking webarkit/webarkit#24 — noting that the global swap goes when it lands, while the draw counting that makes the stub self-checking stays. End the body with:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

## Left for later, on purpose

Worth saying out loud in the PR so a reviewer does not read these as oversights:

- **`packages/nft-tracker` still has no README.** The package had none before this branch, and adding one is a larger piece of writing than this diff should carry. The root README's table row is updated instead.
- **`RansacOptions` carries no RNG** (webarkit/webarkit#24), so the tests seed `Math.random` through `withSeededRandom` instead. That PR is one field on the contract plus one line in the adapter, passing it as `ransac_params_t`'s fifth argument, both packages in one commit. **The follow-up here, when it lands:**
  1. Add `rng?: () => number` to `NftTrackerOptions` and forward it to `estimateHomography`.
  2. Replace the global swap inside `withSeededRandom` with an injected `mulberry32(seed)`, passed down as `rng`.
  3. **Keep `draws` and every assertion on it.** The counter is not scaffolding for the global — it pins where randomness may be consumed at all, and the "deterministic stages draw zero" assertion is as useful with an injected generator as without one. Only the global swap goes.
- **The contract gaps ADR-0001 lists are still unfiled** (action item 5). Task 3 adds a `TODO` pointing at the "`Keypoint.level` is ambiguous across backends" gap, which `DEFAULT_SCALE_STEP` exists because of; filing them is its own piece of work.
- **The live frame is still searched at one level.** That is the demos' documented limitation and M1 is parity, so it stays.
- **`ScaleStep` is a guess for any backend but jsfeatNext.** Closing that needs the contract to declare the step — the gap above.
