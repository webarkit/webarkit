/*
 *  known.test.ts
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

import { describe, it, expect } from "vitest";
import {
    IMPLEMENTED_EXTENSIONS,
    KNOWN_DESCRIPTOR_KINDS,
    KNOWN_DESCRIPTOR_NORMS,
    KNOWN_DETECTOR_KINDS,
    KNOWN_ELEMENT_TYPES,
    SUPPORTED_CONTAINER_MAJOR,
    SUPPORTED_FORMAT_VERSION,
} from "../../../src/target/format/known.js";

describe("known values", () => {
    it("knows exactly the contract's descriptor kinds", () => {
        expect([...KNOWN_DESCRIPTOR_KINDS].sort()).toEqual([
            "akaze",
            "beblid",
            "freak",
            "orb",
            "teblid",
        ]);
    });

    it("knows exactly the contract's norms, so hamming2 stays unknown (§5.6)", () => {
        expect([...KNOWN_DESCRIPTOR_NORMS].sort()).toEqual(["hamming", "l2"]);
        expect(KNOWN_DESCRIPTOR_NORMS as readonly string[]).not.toContain("hamming2");
    });

    it("knows exactly the contract's detector kinds", () => {
        expect([...KNOWN_DETECTOR_KINDS].sort()).toEqual([
            "akaze",
            "fast",
            "orb",
            "yape",
            "yape06",
        ]);
    });

    it("knows the three element types the format defines (§5.6)", () => {
        expect([...KNOWN_ELEMENT_TYPES].sort()).toEqual(["bits", "f32", "u8"]);
    });

    it("implements no extension yet, so WKNF_multiview is unknown", () => {
        expect(IMPLEMENTED_EXTENSIONS).toEqual([]);
    });

    it("targets format 0.2 and container major 1", () => {
        expect(SUPPORTED_FORMAT_VERSION).toBe("0.2");
        expect(SUPPORTED_CONTAINER_MAJOR).toBe(1);
    });
});
