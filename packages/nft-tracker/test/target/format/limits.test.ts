/*
 *  limits.test.ts
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
    DEFAULT_LIMITS,
    resolveLimits,
} from "../../../src/target/format/limits.js";

describe("resolveLimits", () => {
    it("uses the §6.4 defaults when given nothing", () => {
        expect(resolveLimits()).toEqual({
            maxFileBytes: 64 * 1024 * 1024,
            maxManifestBytes: 1024 * 1024,
            maxLevels: 32,
            maxKeypoints: 1_000_000,
            maxDescriptorSets: 16,
            maxPatchSize: 64,
        });
    });

    it("overrides only the named limits", () => {
        const r = resolveLimits({ limits: { maxKeypoints: 10 } });
        expect(r.maxKeypoints).toBe(10);
        expect(r.maxFileBytes).toBe(DEFAULT_LIMITS.maxFileBytes);
    });

    it("does not let a caller mutate the defaults", () => {
        const r = resolveLimits({ limits: { maxLevels: 2 } });
        expect(r).not.toBe(DEFAULT_LIMITS);
        expect(DEFAULT_LIMITS.maxLevels).toBe(32);
    });

    it("treats an empty options object as no override", () => {
        expect(resolveLimits({})).toEqual(DEFAULT_LIMITS);
    });
});
