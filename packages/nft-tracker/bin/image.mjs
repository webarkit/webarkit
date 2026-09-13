/*
 *  image.mjs
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
 * A JPEG file on disk to the contract's `GrayImage`, in Node, the way the
 * browser demos do it.
 *
 * **Why this exists as its own module.** Two things in this repository turn
 * `examples/images/*.jpg` into grey pixels: `bin/compile-target.mjs`, which
 * compiles a `.wnft`, and `test/fixtures/make-fixtures.mjs`, which writes the
 * PGM fixtures the tests read. If those two rules ever drifted, a compiled
 * target and the fixtures would disagree about what the same photograph is,
 * and every symptom would appear somewhere else. One definition, imported
 * twice.
 *
 * **It does not match the browser bit for bit, and does not try to.** The
 * demos build their `GrayImage` with `OffscreenCanvas.drawImage`, whose
 * resampling is implementation-defined and unavailable here. What this
 * guarantees instead is that the pixels are deterministic, reproducible from
 * files in the repository, and the size the demo would produce — which is
 * what a target compiled offline needs in order to line up with a demo that
 * draws the same image at the same cap.
 *
 * JPEG only: `jpeg-js` is the single decoder this package already carries (as a
 * **dev**Dependency — `bin/` is repo-local tooling, not part of the package's
 * surface), and the images in `examples/images/` are JPEGs. A second format is
 * a new dependency and a new decision, so it waits for someone who needs one.
 */

import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";

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

/**
 * Decode `path` and return `{ data, width, height }` — the contract's
 * `GrayImage` — with the longer side scaled down to at most `maxSide`.
 *
 * `maxSide` caps the LONGER side, matching `toGray(source, w, h, maxWidth)`
 * called without a `maxHeight` in `examples/js/pinball-shared.mjs`. Capping
 * width alone would let a portrait image (its longer side is height) sail
 * past uncapped, which is exactly the shape of `examples/images/pinball.jpg`.
 *
 * @param {string} path     A JPEG file.
 * @param {number} maxSide  Cap on the longer side, in pixels.
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
export function grayFromJpegFile(path, maxSide) {
    const { data, width, height } = jpeg.decode(readFileSync(path), { useTArray: true });
    const gray = toGrayFull(data, width, height);

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const dw = Math.max(1, Math.round(width * scale));
    const dh = Math.max(1, Math.round(height * scale));
    if (dw === width && dh === height) return { data: gray, width, height };

    return { data: boxDownscale(gray, width, height, dw, dh), width: dw, height: dh };
}
