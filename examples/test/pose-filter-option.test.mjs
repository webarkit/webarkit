/*
 *  pose-filter-option.test.mjs
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
 * The bench page's `poseFilter` option (#243, Qodo's first finding on #248):
 * `poseFilterOption("one-euro", pkg)` writes every parameter out from the
 * package's `DEFAULT_POSE_FILTER_*`, so that an export stays readable after a
 * default changes, and a tracker built with it runs as one built with
 * `{ mode: "one-euro" }`, those being its defaults. Checked on the package's
 * own seeded rest path (`ground-truth/tracker_sequences.ts`), the one its
 * filter tests use.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
    createJsfeatNextBackend,
    intrinsics,
} from "../../packages/cv-backend-jsfeatnext/dist/index.js";
import * as pkg from "../../packages/nft-tracker/dist/index.js";
import {
    CAMERA,
    REST_FRAMES,
    restPath,
    run,
    shippedTarget,
} from "../../packages/nft-tracker/ground-truth/tracker_sequences.ts";
import { POSE_FILTER_DEFAULT_NAMES, poseFilterOption } from "../js/bench-metrics.mjs";

describe("poseFilterOption", () => {
    it("writes out every default for one-euro, read from the package's constants", () => {
        expect(poseFilterOption("one-euro", pkg)).toEqual({
            mode: "one-euro",
            rotation: {
                minCutOff: pkg.DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
                beta: pkg.DEFAULT_POSE_FILTER_ROTATION_BETA,
            },
            translation: {
                minCutOff: pkg.DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
                beta: pkg.DEFAULT_POSE_FILTER_TRANSLATION_BETA,
            },
            dCutOff: pkg.DEFAULT_POSE_FILTER_D_CUTOFF,
        });
        // Every constant the option reads is one the package exports, as a number.
        for (const name of POSE_FILTER_DEFAULT_NAMES) expect(typeof pkg[name], name).toBe("number");
    });

    it('is { mode: "off" } for off and for no ?poseFilter=, reading no package', () => {
        expect(poseFilterOption("off")).toEqual({ mode: "off" });
        expect(poseFilterOption(null)).toEqual({ mode: "off" });
    });

    it("is a fresh object each call, frozen to its layers", () => {
        const a = poseFilterOption("one-euro", pkg);
        expect(a).not.toBe(poseFilterOption("one-euro", pkg));
        expect(
            Object.isFrozen(a) && Object.isFrozen(a.rotation) && Object.isFrozen(a.translation),
        ).toBe(true);
        expect(Object.isFrozen(poseFilterOption(null))).toBe(true);
    });

    it("refuses, for one-euro, a package without one of the five, naming it", () => {
        expect(() => poseFilterOption("one-euro", {})).toThrow(TypeError);
        const lacking = { ...pkg, DEFAULT_POSE_FILTER_D_CUTOFF: undefined };
        expect(() => poseFilterOption("one-euro", lacking)).toThrow(
            /^poseFilterOption: the tracker package exports no DEFAULT_POSE_FILTER_D_CUTOFF$/,
        );
    });
});

describe("a tracker built with the written-out option", () => {
    const runs = {};
    beforeAll(async () => {
        const cv = await createJsfeatNextBackend();
        const K = intrinsics(CAMERA.width, CAMERA.height);
        const target = shippedTarget();
        const arms = {
            written: poseFilterOption("one-euro", pkg),
            mode: { mode: "one-euro" },
            off: { mode: "off" },
        };
        for (const [name, poseFilter] of Object.entries(arms)) {
            runs[name] = run(cv, K, target, restPath, REST_FRAMES, { poseFilter });
        }
    }, 120_000);

    const samePose = (a, b) =>
        a.R.every((v, i) => Object.is(v, b.R[i])) && a.t.every((v, i) => Object.is(v, b.t[i]));

    it('gives the poses one built with { mode: "one-euro" } gives, frame for frame', () => {
        const written = runs.written.results;
        const mode = runs.mode.results;
        expect(written).toHaveLength(REST_FRAMES);
        expect(runs.written.states).toBe(runs.mode.states);
        let posed = 0;
        written.forEach((r, k) => {
            expect(r.ok, `frame ${k}`).toBe(mode[k].ok);
            if (r.ok) {
                posed++;
                expect(samePose(r.pose, mode[k].pose), `frame ${k}`).toBe(true);
            }
        });
        expect(posed).toBeGreaterThan(0);
    });

    // Must fire: the two filtered arms differ from the unfiltered one, so their agreement is
    // the filter's, not two trackers that both ran unfiltered.
    it("filters: its poses are not the unfiltered tracker's", () => {
        const off = runs.off.results;
        const moved = runs.written.results.filter(
            (r, k) => r.ok && off[k].ok && !samePose(r.pose, off[k].pose),
        ).length;
        expect(moved).toBeGreaterThan(0);
    });
});
