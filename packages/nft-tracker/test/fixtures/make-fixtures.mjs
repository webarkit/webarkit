/*
 *  make-fixtures.mjs
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
 */

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
