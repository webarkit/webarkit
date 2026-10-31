/*
 *  replay-checks.mjs
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
 * Verdicts of `scripts/replay-clips.mjs`'s refusals that come after a clip is
 * decoded (#207). The script parses its command line when it is imported, and
 * these run only once ffmpeg has decoded a clip, so no test reached them: each
 * is here as a function that returns `null` or the reason, and the script
 * prints the reason and exits, as it did. Not served by the bench page.
 */

/**
 * RS2: `--sequence` replays an export at its own processing box, which must fit
 * the clip to the resolution the export ran at (`processingResolution`). `box`
 * is the export's box, `fitted` what it fits the clip to here.
 */
export function sequenceResolutionRefusal(box, fitted, recorded) {
    if (fitted.width === recorded.width && fitted.height === recorded.height) return null;
    return `its box ${box.width}x${box.height} fits the clip to ${fitted.width}x${fitted.height} here, but it ran at ${recorded.width}x${recorded.height}`;
}

/**
 * RE2: an `--external` arm's `trackTimeShare` must be complete, the run
 * reaching loop `firstLoop + loopCount`: a share read short of it is not the
 * device's.
 */
export function trackTimeShareRefusal(trackTimeShare, { firstLoop, loopCount }) {
    if (trackTimeShare.complete) return null;
    return `trackTimeShare is incomplete: the run does not reach loop ${firstLoop + loopCount}`;
}
