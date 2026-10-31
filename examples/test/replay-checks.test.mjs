/*
 *  replay-checks.test.mjs
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

// The verdicts of two of scripts/replay-clips.mjs's refusals that come after
// a clip is decoded, so that no command-line test reaches them without ffmpeg
// (#207): RS2, `--sequence` on an export whose box fits the clip to another
// resolution than the one it ran at, and RE2, an `--external` arm that does
// not reach the loop after its counted ones. The script prints each reason
// and exits 1; these check the reason, on constructed inputs.

import { describe, expect, it } from "vitest";
import { summarizeRun } from "../js/bench-metrics.mjs";
import { sequenceResolutionRefusal, trackTimeShareRefusal } from "../../scripts/replay-checks.mjs";

describe("sequenceResolutionRefusal (RS2)", () => {
    const box = { width: 480, height: 360 };

    it("passes an export whose box fits the clip to the resolution it ran at", () => {
        expect(
            sequenceResolutionRefusal(
                box,
                { width: 480, height: 270 },
                { width: 480, height: 270 },
            ),
        ).toBeNull();
    });

    it("refuses one that ran at another width, naming the box and both sizes", () => {
        expect(
            sequenceResolutionRefusal(
                box,
                { width: 480, height: 270 },
                { width: 481, height: 270 },
            ),
        ).toBe("its box 480x360 fits the clip to 480x270 here, but it ran at 481x270");
    });

    it("refuses one that ran at another height", () => {
        expect(
            sequenceResolutionRefusal(
                { width: 360, height: 360 },
                { width: 203, height: 360 },
                { width: 203, height: 361 },
            ),
        ).toBe("its box 360x360 fits the clip to 203x360 here, but it ran at 203x361");
    });
});

describe("trackTimeShareRefusal (RE2)", () => {
    /** One TRACK frame every half second of a 1 s clip, over `loops` loops, then loop `loops`'s first frame. */
    const frames = (loops) => {
        const out = [];
        for (let k = 0; k < loops; k++) {
            for (const t of [0, 0.5]) {
                out.push({ state: "TRACK", mediaTimeSeconds: t, timestampMs: 1000 * (k + t) });
            }
        }
        out.push({ state: "TRACK", mediaTimeSeconds: 0, timestampMs: 1000 * loops });
        return out;
    };
    const counted = { firstLoop: 1, loopCount: 4 };
    const share = (records) =>
        summarizeRun(records, { clipDurationS: 1, loops: counted }).trackTimeShare;

    it("passes a run that reaches the loop after its counted ones", () => {
        const t = share(frames(5));
        expect(t.complete).toBe(true);
        expect(trackTimeShareRefusal(t, counted)).toBeNull();
    });

    it("refuses a run that stops inside its last counted loop, naming the loop it did not reach", () => {
        const t = share(frames(5).slice(0, -1));
        expect(t.complete).toBe(false);
        expect(trackTimeShareRefusal(t, counted)).toBe(
            "trackTimeShare is incomplete: the run does not reach loop 5",
        );
    });

    it("names the loop from the counted loops it is given", () => {
        expect(trackTimeShareRefusal({ complete: false }, { firstLoop: 0, loopCount: 2 })).toBe(
            "trackTimeShare is incomplete: the run does not reach loop 2",
        );
    });
});
