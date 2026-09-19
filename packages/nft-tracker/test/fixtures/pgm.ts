/*
 *  pgm.ts
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
