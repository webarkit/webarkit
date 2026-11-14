/*
 *  2026-11-13-262-stage1-border-parity.mjs
 *  webarkit
 *
 *  This file is part of webarkit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * #262, M10's Stage 1: TEBLID's border and its parity, as inputs for #264. Prints its findings;
 * every check that must hold is fatal (exit 1) before anything is printed after it.
 *
 *     npm run build
 *     node docs/benchmarks/2026-11-13-262-stage1-border-parity.mjs --fixtures <dir>
 *
 * ffmpeg and ffprobe must be on PATH (part 4 decodes the clips).
 *
 * <dir> holds jsfeatNext's OpenCV fixtures at its tag 1.2.0 (commit 9353b833d810c06dbfcd05152df8599e75eebab1),
 * not committed here: `tests/fixtures/opencv/teblid-p256.json` (SHA-256 2b9f5e84…) and
 * `scene-640x480.pgm` (SHA-256 892a3df1…, checked), fetched with
 *
 *     gh api repos/webarkit/jsfeatNext/contents/tests/fixtures/opencv/teblid-p256.json --header "Accept: application/vnd.github.raw" > <dir>/teblid-p256.json
 *     curl -sSL -o <dir>/scene-640x480.pgm https://raw.githubusercontent.com/webarkit/jsfeatNext/9353b833d810c06dbfcd05152df8599e75eebab1/tests/fixtures/opencv/scene-640x480.pgm
 *
 * 1. **Parity:** the installed `@webarkit/jsfeat-next` 1.2.0's `teblid.describe`, at 256 bits, on
 *    every case of jsfeatNext's own OpenCV 4.10.0 fixture (its keypoints, its scene), against the
 *    fixture's bytes, as `tests/parity/teblid.test.ts` reads them.
 * 2. **The path rule**, from the compiled code (`describe_all`): a keypoint takes OpenCV's fast
 *    path, which reads the integral image at flat offsets with no bounds check, iff
 *    `x ≥ E`, `x + E < cols`, `y ≥ E` and `y + E < rows`, with `E = fround(fround(32 · fround(v / 64)) · 1.75)`
 *    and `v = fround(scale_factor · fround(size))`; otherwise the clamped path, whose box corners
 *    are clamped into the image (`Q`, `ye`). E for the sizes `31 · ∛2^level`, levels 0 to 7.
 * 3. **The wrap test**, on a seeded random texture, 240 × 200: for each level's size and each roll
 *    from 0° to 359°, a keypoint at the fast path's nearest admissible distance from the left edge
 *    (and from the right edge), described on the texture and on a copy whose far side (the 80
 *    columns away from the keypoint) is redrawn. A descriptor that changes read a pixel it cannot
 *    see: a box that ran past the edge into the neighbouring row. Its control, which must fire:
 *    the columns the patch itself covers (15 to 44) redrawn. The same at 20 px from the edge,
 *    `BORDER`'s distance, where the clamped path runs; and at the top and bottom rows' fast-path
 *    distance, where an overrun would throw.
 * 3b. **The patch's reach**, per level: from a keypoint at x = 120, the smallest distance k at which
 *    redrawing every column k px or more to its left changes none of its 360 rolled descriptors;
 *    the reach is k − 1, checked to change some at k − 1. Set against BORDER's 20 · ∛2^level.
 * 4. **Where the keypoints fall:** the share of the scene's keypoints (every frame of the four
 *    clips, the tracker's detect options) and of `pinball.wnft`'s keypoints that take the clamped
 *    path.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import jsfeatNext from "@webarkit/jsfeat-next";
import { buildArms, loadClip } from "./2026-11-13-262-stage1-probe.mjs";
import { teblidSize } from "./2026-11-13-262-teblid-backend.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const nft = await import(pathToFileURL(join(ROOT, "packages/nft-tracker/dist/index.js")).href);
const U8C1 = jsfeatNext.U8_t | jsfeatNext.C1_t;
const Z = Math.fround;
const DEG2RAD = 0.017453292519943295;

function fail(why) {
    console.error(`262-border-parity: ${why}`);
    process.exit(1);
}
const at = process.argv.indexOf("--fixtures");
const dir = at > 0 ? process.argv[at + 1] : null;
if (!dir) fail("--fixtures <dir> is required");

const describe = (img, kps, sf = 1) => {
    const out = new jsfeatNext.matrix_t(32, Math.max(1, kps.length), U8C1);
    jsfeatNext.teblid.describe(img, kps, kps.length, out, { bits: 256, scale_factor: sf });
    return out.data.subarray(0, kps.length * 32);
};
const hex = (d, r) => Array.from(d.subarray(r * 32, r * 32 + 32), (b) => b.toString(16).padStart(2, "0")).join("");

// 1. Parity.
{
    const pgm = readFileSync(join(dir, "scene-640x480.pgm"));
    const sha = createHash("sha256").update(pgm).digest("hex");
    if (sha !== "892a3df1e86688f1c4cd82131bdb87abc753d95754d0058a0c8871ed76ddc20c") fail(`scene sha256 ${sha}`);
    const header = pgm.subarray(0, 15).toString("latin1");
    if (!/^P5\s+640\s+480\s+255\s$/.test(header)) fail(`scene header ${JSON.stringify(header)}`);
    const pixels = pgm.subarray(15);
    const crop = (w, h) => {
        const m = new jsfeatNext.matrix_t(w, h, U8C1);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.data[y * w + x] = pixels[y * 640 + x];
        return m;
    };
    const images = { scene: crop(640, 480), tiny: crop(24, 24) };
    const fx = JSON.parse(readFileSync(join(dir, "teblid-p256.json"), "utf8"));
    if (fx.meta.opencv_version !== "4.10.0" || fx.meta.params.bits !== 256) fail("not the 256-bit OpenCV 4.10.0 fixture");
    let rows = 0;
    let equal = 0;
    for (const c of fx.payload.cases) {
        const kps = c.keypoints.map(([x, y, size, deg]) => new jsfeatNext.keypoint_t(x, y, 0, 0, deg === -1 ? -1 : Z(deg) * DEG2RAD, size));
        const d = describe(images[c.image], kps, c.scale_factor);
        c.descriptors.forEach((h, i) => {
            rows++;
            if (hex(d, i) === h) equal++;
        });
    }
    if (equal !== rows) fail(`parity: ${equal} of ${rows} rows equal OpenCV's`);
    console.log(`1. parity: ${equal} of ${rows} rows of the fixture's ${fx.payload.cases.length} cases (scale_factor 1 and 5) equal OpenCV 4.10.0's, byte for byte`);
}

// 2. The path rule.
const E = (size, sf = 1) => Z(Z(32 * Z(Z(sf * Z(size)) / 64)) * 1.75);
const levels = [0, 1, 2, 3, 4, 5, 6, 7];
console.log(
    `2. fast-path margin E = 0.875 · size: ${levels.map((l) => `level ${l} size ${teblidSize(l).toFixed(3)} E ${E(teblidSize(l)).toFixed(3)} px`).join("; ")}`,
);
console.log(
    `   BORDER = 20 px at a level is 20 · ∛2^level in level-0 px; E is 27.125 · ∛2^level; so every keypoint within ${(27.125 - 20).toFixed(3)} · ∛2^level px of BORDER's line takes the clamped path`,
);

// 3. The wrap test.
let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0), s >>> 24);
const W = 240;
const H = 200;
const texture = () => {
    const m = new jsfeatNext.matrix_t(W, H, U8C1);
    for (let i = 0; i < W * H; i++) m.data[i] = rnd();
    return m;
};
const base = texture();
const redraw = (cols) => {
    const m = new jsfeatNext.matrix_t(W, H, U8C1);
    m.data.set(base.data);
    for (let y = 0; y < H; y++) for (const x of cols) m.data[y * W + x] = rnd();
    return m;
};
const farFromLeft = redraw(Array.from({ length: 80 }, (_, i) => W - 80 + i));
const farFromRight = redraw(Array.from({ length: 80 }, (_, i) => i));
// The control that must fire: the columns the keypoint's own patch covers, redrawn.
const nearLeft = redraw(Array.from({ length: 30 }, (_, i) => 15 + i));
const kp = (x, y, size, deg) => new jsfeatNext.keypoint_t(x, y, 0, 0, deg * DEG2RAD, size);
const changed = (kps, other) => {
    const a = describe(base, kps);
    const b = describe(other, kps);
    let n = 0;
    for (let r = 0; r < kps.length; r++) if (hex(a, r) !== hex(b, r)) n++;
    return n;
};
for (const l of [0, 1, 2]) {
    const size = teblidSize(l);
    const e = E(size);
    const xl = Math.ceil(e); // the smallest integer x with x >= E: the fast path
    const xr = W - 1 - Math.ceil(e); // x + E < W
    const angles = Array.from({ length: 360 }, (_, a) => a);
    const left = angles.map((a) => kp(xl, H / 2, size, a));
    const right = angles.map((a) => kp(xr, H / 2, size, a));
    const leftB = angles.map((a) => kp(20 * Math.cbrt(2) ** l, H / 2, size, a));
    const rightB = angles.map((a) => kp(W - 1 - 20 * Math.cbrt(2) ** l, H / 2, size, a));
    const control = changed(left, nearLeft);
    if (control === 0) fail(`wrap test, level ${l}: the control (the patch's own columns redrawn) changed no descriptor; the test cannot fire`);
    const nl = changed(left, farFromLeft);
    const nr = changed(right, farFromRight);
    const nlB = changed(leftB, farFromLeft);
    const nrB = changed(rightB, farFromRight);
    let threw = 0;
    for (const y of [Math.ceil(e), H - 1 - Math.ceil(e)]) {
        try {
            describe(base, angles.map((a) => kp(W / 2, y, size, a)));
        } catch {
            threw++;
        }
    }
    console.log(
        `3. level ${l} (size ${size.toFixed(3)}, E ${e.toFixed(3)}): control, columns 15–44 redrawn: ${control} of 360 changed; fast path at x = ${xl} and ${xr}, 360 rolls each: ${nl} and ${nr} descriptors changed when the far side was redrawn; ` +
            `clamped path at 20 · ∛2^${l} px from either edge: ${nlB} and ${nrB}; fast path at the top and bottom rows' distance: ${threw} of 2 batches threw`,
    );
}

// 3b. The patch's reach: for a keypoint well inside (x = 120, the fast path), the smallest distance
// k such that redrawing every column at distance k or more to its left changes none of its 360
// rolled descriptors. A keypoint nearer an edge than its reach has boxes the image cuts.
for (const l of [0, 1, 2]) {
    const size = teblidSize(l);
    const X = 120;
    const rolls = Array.from({ length: 360 }, (_, a) => kp(X, H / 2, size, a));
    let reach = null;
    for (let k = 1; k <= 100; k++) {
        const cols = Array.from({ length: X - k + 1 }, (_, i) => i); // columns 0 .. X - k
        if (changed(rolls, redraw(cols)) === 0) {
            reach = k;
            break;
        }
    }
    if (reach === null) fail(`reach, level ${l}: not found within 100 px`);
    if (changed(rolls, redraw(Array.from({ length: X - reach + 2 }, (_, i) => i))) === 0)
        fail(`reach, level ${l}: the column at distance ${reach - 1} changes nothing either; the search is wrong`);
    const border = 20 * Math.cbrt(2) ** l;
    console.log(
        `3b. level ${l} (size ${size.toFixed(3)}): the patch reaches ${reach - 1} px from the keypoint (redrawing at ${reach} px or more changes 0 of 360, at ${reach - 1} px changes some); BORDER's distance there is ${border.toFixed(3)} px, so a keypoint at BORDER's line ${reach - 1 > border ? `has boxes cut by up to ${(reach - 1 - border).toFixed(3)} px` : "has none cut"}`,
    );
}

// 4. Where the keypoints fall.
{
    const arms = await buildArms();
    const cv = arms.orb.cv;
    for (const name of ["table", "wall", "static", "cross"]) {
        const c = loadClip(name);
        let n = 0;
        let clamped = 0;
        let negative = 0;
        let upright = 0;
        for (const f of c.frames) {
            for (const k of cv.detect(f, { levels: nft.DEFAULT_SCENE_LEVELS, maxKeypoints: nft.DEFAULT_MAX_SCENE_KEYPOINTS })) {
                n++;
                const e = E(teblidSize(k.level));
                if (k.x < e || Z(k.x + e) >= f.width || k.y < e || Z(k.y + e) >= f.height) clamped++;
                if (k.angle < 0) negative++;
                if (k.angle === -1) upright++;
            }
        }
        console.log(
            `4. ${c.file} ${c.width}x${c.height}: ${clamped} of ${n} scene keypoints (${((100 * clamped) / n).toFixed(2)}%) take the clamped path; ${((100 * negative) / n).toFixed(2)}% have a negative angle; ${upright} an angle of exactly -1, which TEBLID reads as upright`,
        );
    }
    const t = arms.orb.target;
    const k = t.keypoints;
    let clamped = 0;
    for (let i = 0; i < k.count; i++) {
        const e = E(teblidSize(k.level[i]));
        if (k.x[i] < e || Z(k.x[i] + e) >= t.meta.widthPx || k.y[i] < e || Z(k.y[i] + e) >= t.meta.heightPx) clamped++;
    }
    console.log(`4. pinball.wnft ${t.meta.widthPx}x${t.meta.heightPx}: ${clamped} of ${k.count} keypoints take the clamped path`);
}
