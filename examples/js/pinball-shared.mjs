/*
 *  pinball-shared.mjs
 *  cv-backend-jsfeatnext
 *
 *  This file is part of cv-backend-jsfeatnext - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  cv-backend-jsfeatnext is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  cv-backend-jsfeatnext is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with cv-backend-jsfeatnext.  If not, see <http://www.gnu.org/licenses/>.
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
 * Shared between the static and webcam pinball demos, so the two don't drift:
 * pixel-to-GrayImage conversion and homography point projection. Both are
 * page concerns — they touch the DOM or the canvas — which is exactly why
 * they stayed here when the per-pyramid-level matching strategy moved into
 * `@webarkit/nft-tracker`, where the tracker needs it too.
 */

/**
 * Any drawable source (an `<img>`, a `<video>` frame, an `OffscreenCanvas`) to
 * the contract's `GrayImage`, downscaled so its longer side is `maxWidth`.
 *
 * Grayscale conversion is a preprocessing step above the contract by design:
 * the backend takes single-channel pixels and does not care where they came
 * from, which is what lets the same interface serve a still image and a live
 * video frame identically.
 *
 * @param source     Anything `CanvasRenderingContext2D.drawImage` accepts.
 * @param sourceW    Natural width of `source` (`naturalWidth`/`videoWidth`).
 * @param sourceH    Natural height of `source` (`naturalHeight`/`videoHeight`).
 * @param maxWidth   Cap on the longer side after downscaling.
 * @param maxHeight  Optional cap on the other side; omit to preserve aspect.
 */
export function toGray(source, sourceW, sourceH, maxWidth, maxHeight) {
    // Two different contracts share this parameter list, disambiguated by
    // whether maxHeight is given. With it: fit within a maxWidth x maxHeight
    // box, preserving aspect (both axes bounded) -- what the webcam demo
    // needs, since it wants a frame no bigger than its processing budget on
    // EITHER axis. Without it: cap only the longer side, as documented above
    // -- get that wrong and a portrait source (its longer side is height)
    // sails straight past maxWidth uncapped, since maxWidth alone only ever
    // constrains sourceW.
    const scale = maxHeight
        ? Math.min(1, maxWidth / sourceW, maxHeight / sourceH)
        : Math.min(1, maxWidth / Math.max(sourceW, sourceH));
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i++, p += 4) {
        // Rec. 601 luma, the same weighting jsfeatNext's own grayscale uses.
        data[i] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) | 0;
    }
    return { data, width: w, height: h };
}

/** Applies a row-major 3x3 homography to a point. */
export function project(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
