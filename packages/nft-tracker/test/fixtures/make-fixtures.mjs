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

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { grayFromJpegFile } from "../../bin/image.mjs";

/** The static demo's cap: the longer side is scaled down to 640. */
const MAX_SIDE = 640;

const IMAGES = [
    { src: "../../../../examples/images/pinball.jpg", out: "./pinball-target-640.pgm" },
    { src: "../../../../examples/images/pinball-demo.jpg", out: "./pinball-scene-640.pgm" },
];

/** PGM "P5": an ASCII header, then width*height raw bytes. */
function writePgm(path, gray, width, height) {
    const header = Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii");
    writeFileSync(path, Buffer.concat([header, Buffer.from(gray)]));
}

for (const { src, out } of IMAGES) {
    const srcPath = fileURLToPath(new URL(src, import.meta.url));
    const outUrl = new URL(out, import.meta.url);

    // One definition of "a JPEG in examples/images to grey pixels" lives in
    // bin/image.mjs, shared with compile-target: if these fixtures and a
    // compiled .wnft disagreed about what the same photograph is, every
    // symptom would show up somewhere else.
    const { data, width, height } = grayFromJpegFile(srcPath, MAX_SIDE);
    writePgm(outUrl, data, width, height);
    console.log(`${out}: -> ${width}x${height}`);
}
