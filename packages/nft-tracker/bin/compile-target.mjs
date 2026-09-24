/*
 *  compile-target.mjs
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

/**
 * `compile-target` — an image in, a `.wnft` file out.
 *
 *     node packages/nft-tracker/bin/compile-target.mjs \
 *         examples/images/pinball.jpg -o examples/targets/pinball.wnft
 *
 * It is the offline half of the tracker, run by hand: `buildTargetFromImage`
 * with `@webarkit/cv-backend-jsfeatnext`, then `selectPatches` for the
 * tracking patches (§5.7), then `encode`. The first two are the library calls
 * the demos already make, with the result written to disk instead of kept in
 * memory, so a target can be prepared once and shipped as a file.
 *
 * **Tracking patches** are cut from a target pyramid that
 * `bin/target-pyramid.mjs` builds — a stand-in until `buildFramePyramid`
 * exists; that file says why it matters and what changes when it goes. The
 * five patch options and their defaults are documented where the defaults are
 * defined, below.
 *
 * **Determinism is a feature, not a side effect.** The same image and the same
 * options must produce the same bytes, or a compiled target could not be
 * committed and reviewed as a diff. `detect`/`describe` are pure functions of
 * their inputs (jsfeat-next 0.17, webarkit/webarkit#27), `encode` is the
 * canonical writer of §7.3, and nothing here reads a clock — `info.createdAt`
 * is deliberately never set, for the same reason `buildTargetFromImage` does
 * not set it.
 *
 * **What `--seed` is for.** No stage of the compile draws randomness today, so
 * the seed changes nothing about the output. It is still accepted, recorded in
 * `info.compiler`, and *enforced*: the build runs with `Math.random` replaced
 * by a seeded generator, and the script reports how many draws it made. Zero
 * is the expected answer, and the run is reproducible whatever that answer
 * turns out to be — which is the property a committed `.wnft` rests on. A
 * backend that starts drawing (or one that already does, once another
 * implements the contract) therefore stays reproducible instead of silently
 * making every recompile a new file.
 *
 * Imports the built `dist/`, so `npm run build` runs first — the same
 * arrangement as `scripts/generate-fixtures.mjs`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import process from "node:process";

import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";

import {
    buildTargetFromImage,
    DEFAULT_KEYPOINTS_PER_LEVEL,
    DEFAULT_SCALE_STEP,
    DEFAULT_LIMITS,
    DEFAULT_TARGET_LEVELS,
    encode,
    levelScale,
    selectPatches,
} from "../dist/index.js";
import { grayFromJpegFile } from "./image.mjs";
import { buildTargetPyramid } from "./target-pyramid.mjs";

/**
 * Default cap on the image's longer side, in pixels.
 *
 * 640, the static demo's own cap. It is a default rather than a constant
 * because it decides the target's coordinate space: keypoints are stored in
 * level-0 pixels (§3), so a page that wants to draw them over the image it
 * loaded must cap that image the same way. Change one and change the other.
 */
const DEFAULT_MAX_SIDE = 640;

/*
 * Tracking-patch defaults (§5.7). First choices with their reasons, measured
 * on `examples/images/pinball.jpg` at the default cap; the M2 tuning pass,
 * which can measure alignment itself, is expected to revise them, which is
 * why each one is an option rather than a constant.
 */

/**
 * `P`, the patch edge. 16 gives the score and the alignment `14² = 196`
 * interior gradient samples — enough to condition a translation + gain/bias
 * fit on real texture, where 8 (§9's example) leaves 36 — while staying
 * local: 16 level-0 px is 3% of a 512-px target, so the prediction's
 * perspective varies little across one patch. 64 of them are 16 KB.
 */
const DEFAULT_PATCH_SIZE = 16;

/**
 * `maxPatches`, the budget. Tracking needs four inliers per frame; 64 leaves
 * room to lose most of them to occlusion, the frame edge and the robust fit,
 * while a frame's alignment cost stays linear in a small number.
 */
const DEFAULT_MAX_PATCHES = 64;

/**
 * How many of the target's pyramid levels patches may come from, finest
 * first. Scores are in level-0 units (`select_patches.ts`), so levels compete
 * on how precisely they localise, and a coarser level rarely wins: on the
 * pinball target, 63 of the 64 patches come from level 0 and one from level
 * 1, and allowing six or all eight levels instead of three selects exactly
 * the same 64. Three levels span a factor `2^(2/3)` ≈ 1.6 at the default
 * step, and keep a patch's footprint local (under 26 level-0 px for P=16);
 * the limit is there for the images where coarse texture would win.
 */
const DEFAULT_PATCH_LEVELS = 3;

/**
 * Minimum score, (grey levels / level-0 px)²: a mean squared gradient of 25,
 * so an RMS of 5 grey levels per pixel even in the patch's *weakest*
 * direction — several times the gradient that sensor and JPEG noise produce
 * on a flat surface. On pinball this rejects 57% of all level-0 windows, the
 * least-textured ones (the median P=16 window scores 17; a quarter score
 * under 2).
 */
const DEFAULT_PATCH_MIN_SCORE = 25;

/**
 * Default spacing between patch centres, level-0 px: 0.75 × `√(W·H / Q)`,
 * rounded. `√(W·H / Q)` is the side of one cell if the budget tiled the
 * image exactly; three quarters of it leaves room for about twice the budget
 * in a hexagonal packing, so the budget still fills when parts of the target
 * are flat, while forbidding the clusters a bare score ranking produces. On
 * pinball it is 54 px; at 1.0 × (72 px) only 42 of 64 patches fit, at 0.5 ×
 * (27 px) the patches cover 32 rather than 52 cells of an 8 × 8 grid.
 */
function defaultPatchSpacing(width, height, maxPatches) {
    return Math.round(0.75 * Math.sqrt((width * height) / maxPatches));
}

/** What `info.compiler.patchPyramid` records while `target-pyramid.mjs` stands in. */
const PATCH_PYRAMID = "stand-in: bin/target-pyramid.mjs, area-weighted box";

/**
 * What `info.compiler.patchScore` records: which quantity `patches.score`
 * holds, in which units. §5.7 fixes the quantity (Shi–Tomasi's minimum
 * eigenvalue) but not its normalisation, so without this a score — and
 * `patchMinScore` beside it — cannot be read by anyone who did not also read
 * `select_patches.ts`, and a compiler that normalised differently would
 * write numbers on another scale into the same field unnoticed.
 */
/**
 * The most patch windows `compile-target` lets `selectPatches` score: 2^23.
 *
 * `selectPatches` keeps every window scoring at least `--patch-min-score`
 * as a candidate, and on a fully textured image that can be every window,
 * whatever the threshold. Measured on noise at `--patch-min-score 0` (the
 * worst case, and the one a threshold cannot be relied on to avoid): about
 * 30 bytes and 0.55 s per million windows, so this cap is roughly 250 MB and
 * 5 s. The default 640-px cap at three levels is about 0.63 M windows.
 *
 * The bound lives here, not in `selectPatches`: see the note on its cost in
 * `src/tracking/select_patches.ts` for why, and for when that changes.
 */
const MAX_PATCH_WINDOWS = 2 ** 23;

/**
 * How many `P × P` windows `selectPatches` will score on the first
 * `patchLevels` levels of a `width × height` target: each level at the size
 * `ImagePyramid` defines, `(w · s_l) | 0` × `(h · s_l) | 0`. An upper bound,
 * since the target may end up with fewer levels than asked for.
 *
 * The loop stops at the first level smaller than 1 × 1, which comes long
 * before `s_l` could underflow, and at level 255, the last a `.wnft` can
 * name (`level` is `u8`, §5.7), so `levelScale` is never handed an argument
 * it throws on.
 */
function patchWindows(width, height, scaleStep, patchLevels, P) {
    let windows = 0;
    for (let l = 0; l < Math.min(patchLevels, 256); l++) {
        const s = levelScale(scaleStep, l);
        const w = (width * s) | 0;
        const h = (height * s) | 0;
        if (w < 1 || h < 1) break;
        if (w >= P && h >= P) windows += (w - P + 1) * (h - P + 1);
    }
    return windows;
}

const PATCH_SCORE =
    "lambda-min of the mean structure tensor over the window interior, " +
    "central differences, (grey levels / level-0 px)^2";

/**
 * The directory the command was typed in, which is not always the cwd.
 *
 * npm runs a workspace script with the cwd set to the **package**, so
 * `npm run compile-target -w @webarkit/nft-tracker -- examples/images/pinball.jpg
 * -o examples/targets/pinball.wnft` from the repository root would resolve both
 * paths inside `packages/nft-tracker/`. The input half fails loudly; the output
 * half does not — it writes `packages/nft-tracker/examples/targets/…` and
 * reports the path the user asked for, which is the worse of the two.
 *
 * `INIT_CWD` is how npm says where the command actually came from. It is set by
 * the package manager, not by the shell or the operating system, so it behaves
 * identically on Windows, Linux and macOS (yarn and pnpm set it too). Running
 * the script directly with `node` leaves it unset — and then the cwd already
 * *is* the invocation directory, so the fallback is not a guess.
 *
 * `||` rather than `??`, so an empty `INIT_CWD` falls back as well.
 *
 * The rule this buys is the one every command-line tool is expected to follow:
 * a relative path is relative to where you typed it.
 */
const INVOCATION_DIR = process.env.INIT_CWD || process.cwd();

/** {@link resolve}, but anchored to {@link INVOCATION_DIR}. */
const fromInvocation = (path) => resolve(INVOCATION_DIR, path);

const USAGE = `usage: compile-target <image.jpg> -o <out.wnft> [options]

  -o, --out <path>            where to write the .wnft file (required)
      --levels <n>            pyramid levels to search (default ${DEFAULT_TARGET_LEVELS})
      --keypoints <n>         total keypoint budget (default levels * ${DEFAULT_KEYPOINTS_PER_LEVEL})
      --scale-step <x>        size ratio between levels (default 2^(1/3))
      --physical-size <WxH>   printed size in millimetres, e.g. 210x297
                              (default: unknown, units stay level-0 pixels)
      --max-side <px>         cap the image's longer side (default ${DEFAULT_MAX_SIDE})
      --seed <n>              RNG seed, recorded and enforced (default 0)
      --patches <n>           tracking-patch budget, 0 for none (default ${DEFAULT_MAX_PATCHES})
      --patch-size <px>       patch edge, at least 3 (default ${DEFAULT_PATCH_SIZE})
      --patch-levels <n>      pyramid levels patches may come from (default ${DEFAULT_PATCH_LEVELS})
      --patch-min-score <x>   minimum Shi-Tomasi score (default ${DEFAULT_PATCH_MIN_SCORE})
      --patch-spacing <px>    minimum distance between patch centres, level-0 px
                              (default 0.75 * sqrt(width * height / patches))
      --name <text>           info.name (default: the image's base name)
  -h, --help                  this text
`;

/** Exit code for anything the user can fix by changing the command line. */
const EXIT_USAGE = 2;

class UsageError extends Error {}

/**
 * mulberry32 — a 32-bit PRNG, four lines, identical across platforms, which
 * `Math.random` is not. The same generator `test/fixtures/seeded_rng.ts` uses;
 * spelled out again rather than imported because that one is a test fixture
 * and this is shipped tooling, and four lines is cheaper than a dependency
 * from `bin/` into `test/`.
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Runs `run` with `Math.random` seeded and counted, then restores the real one. */
function withSeededRandom(seed, run) {
    const real = Math.random;
    const seeded = mulberry32(seed);
    let draws = 0;
    Math.random = () => {
        draws += 1;
        return seeded();
    };
    try {
        return { value: run(), draws };
    } finally {
        Math.random = real;
    }
}

/**
 * A positive — or with `zero`, non-negative — finite number from `text`, or a
 * `UsageError` naming `flag`.
 */
function positiveNumber(text, flag, { integer = false, zero = false } = {}) {
    const value = Number(text);
    if (
        text.trim() === "" ||
        !Number.isFinite(value) ||
        value < 0 ||
        (value === 0 && !zero) ||
        (integer && !Number.isInteger(value))
    ) {
        const what = zero ? "non-negative" : "positive";
        throw new UsageError(
            `${flag} expects a ${what} ${integer ? "integer" : "number"}, got "${text}"`,
        );
    }
    return value;
}

/**
 * `WxH` in millimetres, both `> 0` (§5.3).
 *
 * Rejected here rather than left to `encode`: a bad size would otherwise
 * surface as an `INVALID_TARGET` naming a JSON path, long after the image was
 * decoded and described, and would not tell the user which flag to fix.
 */
function parsePhysicalSize(text) {
    const match = /^([0-9.]+)x([0-9.]+)$/.exec(text);
    if (!match) {
        throw new UsageError(`--physical-size expects <width>x<height> in mm, got "${text}"`);
    }
    return [
        positiveNumber(match[1], "--physical-size"),
        positiveNumber(match[2], "--physical-size"),
    ];
}

/**
 * The command line as an options object.
 *
 * A named step rather than inline in `main`, so that reading `main` shows what
 * the script does and not how it reads `argv`.
 */
function parseArgs(argv) {
    const options = {
        image: null,
        out: null,
        levels: DEFAULT_TARGET_LEVELS,
        maxKeypoints: null,
        scaleStep: DEFAULT_SCALE_STEP,
        physicalSizeMm: null,
        maxSide: DEFAULT_MAX_SIDE,
        seed: 0,
        name: null,
        maxPatches: DEFAULT_MAX_PATCHES,
        patchSize: DEFAULT_PATCH_SIZE,
        patchLevels: DEFAULT_PATCH_LEVELS,
        patchMinScore: DEFAULT_PATCH_MIN_SCORE,
        patchSpacing: null,
        help: false,
    };

    /** The value after a flag, or a `UsageError` if the flag ends the line. */
    const next = (args, i, flag) => {
        if (i + 1 >= args.length) throw new UsageError(`${flag} expects a value`);
        return args[i + 1];
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case "-h":
            case "--help":
                options.help = true;
                break;
            case "-o":
            case "--out":
                options.out = next(argv, i, arg);
                i += 1;
                break;
            case "--levels":
                options.levels = positiveNumber(next(argv, i, arg), arg, { integer: true });
                i += 1;
                break;
            case "--keypoints":
                options.maxKeypoints = positiveNumber(next(argv, i, arg), arg, { integer: true });
                i += 1;
                break;
            case "--scale-step":
                options.scaleStep = positiveNumber(next(argv, i, arg), arg);
                i += 1;
                break;
            case "--physical-size":
                options.physicalSizeMm = parsePhysicalSize(next(argv, i, arg));
                i += 1;
                break;
            case "--max-side":
                options.maxSide = positiveNumber(next(argv, i, arg), arg, { integer: true });
                i += 1;
                break;
            case "--seed": {
                // Any 32-bit value seeds mulberry32, zero included, so this is
                // the one numeric flag that is not required to be positive.
                // The upper bound is not pedantry: `--seed 1e300` is an integer
                // by `Number.isInteger`, seeds mulberry32 as 0 after `>>> 0`,
                // and would then fail as `INVALID_TARGET at info.compiler.seed`
                // (§7.3's integer rule) long after the image was described —
                // the same reason `parsePhysicalSize` rejects here rather than
                // leaving it to `encode`.
                const text = next(argv, i, arg);
                options.seed = Number(text);
                if (!Number.isSafeInteger(options.seed) || Math.abs(options.seed) > 0xffffffff) {
                    // Spelled out, and matching the bound above exactly: the
                    // check admits 0xffffffff, so a message saying "2^32"
                    // would name a value the CLI refuses.
                    throw new UsageError(
                        `--seed expects an integer in [-4294967295, 4294967295], got "${text}"`,
                    );
                }
                i += 1;
                break;
            }
            case "--name":
                options.name = next(argv, i, arg);
                i += 1;
                break;
            case "--patches":
                options.maxPatches = positiveNumber(next(argv, i, arg), arg, {
                    integer: true,
                    zero: true,
                });
                i += 1;
                break;
            case "--patch-size":
                options.patchSize = positiveNumber(next(argv, i, arg), arg, { integer: true });
                i += 1;
                break;
            case "--patch-levels":
                options.patchLevels = positiveNumber(next(argv, i, arg), arg, { integer: true });
                i += 1;
                break;
            case "--patch-min-score":
                options.patchMinScore = positiveNumber(next(argv, i, arg), arg, { zero: true });
                i += 1;
                break;
            case "--patch-spacing":
                options.patchSpacing = positiveNumber(next(argv, i, arg), arg, { zero: true });
                i += 1;
                break;
            default:
                if (arg.startsWith("-")) throw new UsageError(`unknown option "${arg}"`);
                if (options.image !== null) {
                    throw new UsageError(
                        `only one image at a time, got "${options.image}" and "${arg}"`,
                    );
                }
                options.image = arg;
        }
    }

    if (options.help) return options;
    if (options.image === null) throw new UsageError("no input image");
    if (options.out === null) throw new UsageError("no output path: pass -o/--out <file.wnft>");
    if (options.scaleStep <= 1) {
        throw new UsageError(`--scale-step must be > 1, got ${options.scaleStep}`);
    }
    // selectPatches' own domain (SelectPatchesOptions), checked here so the
    // message names the flag rather than arriving as "invalid-options".
    if (options.maxPatches !== 0 && options.maxPatches < 4) {
        throw new UsageError(
            `--patches must be 0 (no patches) or at least 4, the minimum for a homography, ` +
                `got ${options.maxPatches}`,
        );
    }
    if (options.patchSize < 3) {
        throw new UsageError(`--patch-size must be at least 3, got ${options.patchSize}`);
    }
    // §6.4's default resource limits. `encode` does not enforce them, so
    // without these checks the compiler would write a file that its own
    // `decode` — and validate-target — refuse with LIMIT_EXCEEDED.
    if (options.maxPatches > DEFAULT_LIMITS.maxPatches) {
        throw new UsageError(
            `--patches must be at most ${DEFAULT_LIMITS.maxPatches}, the default decoder ` +
                `limit (§6.4), got ${options.maxPatches}`,
        );
    }
    if (options.patchSize > DEFAULT_LIMITS.maxPatchSize) {
        throw new UsageError(
            `--patch-size must be at most ${DEFAULT_LIMITS.maxPatchSize}, the default decoder ` +
                `limit (§6.4), got ${options.patchSize}`,
        );
    }

    options.maxKeypoints ??= options.levels * DEFAULT_KEYPOINTS_PER_LEVEL;
    options.name ??= basename(options.image, extname(options.image));
    return options;
}

async function main(argv) {
    const options = parseArgs(argv);
    if (options.help) {
        process.stdout.write(USAGE);
        return 0;
    }

    const image = grayFromJpegFile(fromInvocation(options.image), options.maxSide);

    // Refused before the backend runs, so an oversized compile fails in the
    // time it takes to decode the image rather than after detection.
    if (options.maxPatches !== 0) {
        const patchLevels = Math.min(options.patchLevels, options.levels);
        const windows = patchWindows(
            image.width,
            image.height,
            options.scaleStep,
            patchLevels,
            options.patchSize,
        );
        if (windows > MAX_PATCH_WINDOWS) {
            throw new UsageError(
                `tracking patches would score ${windows} windows on a ` +
                    `${image.width}x${image.height} image at --patch-levels ${patchLevels} ` +
                    `and --patch-size ${options.patchSize}, over the limit of ` +
                    `${MAX_PATCH_WINDOWS}. Use a smaller --max-side or fewer --patch-levels ` +
                    `(or --patches 0 for a detection-only target). A higher ` +
                    `--patch-min-score keeps fewer candidates on most images, but cannot ` +
                    `lift this limit: on a fully textured image every window can qualify.`,
            );
        }
    }

    const cv = await createJsfeatNextBackend();

    const patchSpacing =
        options.patchSpacing ??
        (options.maxPatches === 0
            ? 0
            : defaultPatchSpacing(image.width, image.height, options.maxPatches));

    // Patch selection runs inside the seeded region too, so the reported draw
    // count covers the whole build and not only the backend's part of it.
    const built = withSeededRandom(options.seed, () => {
        const db = buildTargetFromImage(cv, image, {
            levels: options.levels,
            maxKeypoints: options.maxKeypoints,
            scaleStep: options.scaleStep,
            physicalSizeMm: options.physicalSizeMm,
            name: options.name,
        });
        if (options.maxPatches === 0) return { db, patches: null };

        // A PREFIX of the target's levels — the first --patch-levels, each at
        // the size the file records for it. `SelectPatches` in
        // src/tracking/types.ts asks for "exactly the target's
        // levelSizes.length levels", so this departs from its wording, on
        // purpose. The reason it gives for that rule is that a patch must not
        // name a level the file lacks and must be bounds-checked against the
        // file's own sizes (§5.7, INCONSISTENT_DATA); a prefix at the file's
        // sizes guarantees both. It is also the only way to limit the levels:
        // SelectPatchesOptions has no such knob, and types.ts is fixed for
        // this branch. Aligning the wording ("the first k ≤ L levels, each of
        // exactly the file's size") is a coordinated change to types.ts
        // across the three #48 branches, not one to make here.
        const { scaleStep, levelSizes } = db.pyramid;
        const pyramid = buildTargetPyramid(
            image,
            scaleStep,
            levelSizes.slice(0, options.patchLevels),
        );
        const selected = selectPatches(pyramid, {
            patchSize: options.patchSize,
            maxPatches: options.maxPatches,
            minScore: options.patchMinScore,
            minSpacing: patchSpacing,
        });
        return { db, patches: selected };
    });

    const selected = built.value.patches;
    if (selected !== null && !selected.ok) {
        process.stderr.write(
            `compile-target: no tracking patches: selectPatches said "${selected.reason}". ` +
                (selected.reason === "too-few-patches"
                    ? `Fewer than four windows qualify; lower --patch-min-score or ` +
                      `--patch-spacing, or pass --patches 0 for a detection-only target.\n`
                    : `\n`),
        );
        return 1;
    }

    // `buildTargetFromImage` writes `info.name` and nothing else, so the
    // provenance the compiler owns is added here rather than taught to the
    // library: these are this script's arguments, not the builder's. Together
    // with the image beside it, they are what makes a committed `.wnft`
    // rebuildable by someone who did not run the command.
    const target = {
        ...built.value.db,
        ...(selected === null ? {} : { patches: selected.patches }),
        info: {
            ...built.value.db.info,
            compiler: {
                tool: "@webarkit/nft-tracker compile-target",
                source: basename(options.image),
                levels: options.levels,
                maxKeypoints: options.maxKeypoints,
                scaleStep: options.scaleStep,
                maxSide: options.maxSide,
                seed: options.seed,
                maxPatches: options.maxPatches,
                ...(selected === null
                    ? {}
                    : {
                          patchSize: options.patchSize,
                          // What was used, not what was asked for: a target
                          // with fewer levels than --patch-levels offers only
                          // the levels it has.
                          patchLevels: Math.min(
                              options.patchLevels,
                              built.value.db.pyramid.levelSizes.length,
                          ),
                          patchMinScore: options.patchMinScore,
                          patchSpacing,
                          patchPyramid: PATCH_PYRAMID,
                          patchScore: PATCH_SCORE,
                      }),
            },
        },
    };

    const written = encode(target);
    if (!written.ok) {
        process.stderr.write(
            `compile-target: encode refused this target: ${written.error} at ${written.detail}\n`,
        );
        return 1;
    }

    const out = fromInvocation(options.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, written.bytes);

    const levels = target.pyramid.levelSizes.length;
    const patchCount = target.patches?.count ?? 0;
    process.stdout.write(
        `${options.out}: ${image.width}x${image.height}, ` +
            `${target.keypoints.count} keypoints over ${levels} level${levels === 1 ? "" : "s"}, ` +
            `${patchCount} patch${patchCount === 1 ? "" : "es"}, ` +
            `${written.bytes.length} bytes ` +
            `(${built.draws} random draw${built.draws === 1 ? "" : "s"})\n`,
    );
    return 0;
}

main(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((e) => {
        if (e instanceof UsageError) {
            process.stderr.write(`compile-target: ${e.message}\n\n${USAGE}`);
            process.exitCode = EXIT_USAGE;
            return;
        }
        process.stderr.write(`compile-target: ${e.message}\n`);
        process.exitCode = 1;
    });
