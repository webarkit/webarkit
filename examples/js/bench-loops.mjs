/*
 *  bench-loops.mjs
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
 * The run's timeline: loop wraps, media time unwrapped onto one timeline, the
 * counted loops' frames, and the refusals every reader of them shares.
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, except the helpers this module shares with the
 * other `bench-*.mjs` modules, listed at its end.
 */

/**
 * How much video a loop wrap may skip across the clip's end, how far into the
 * clip the frame after it may be, and how far back it steps at least, seconds
 * (#96).
 *
 * For the first two, where 0.5 s comes from and what it is now are in #114,
 * "Where 0.5 s comes from" and "The bound's status". Read with the clip's
 * duration, the second follows from the first.
 *
 * Chosen, for the third. Without a duration, "steps back more than 0.5 s"
 * stands in for "from near the clip's end", reusing the value; it was not
 * derived. The smallest real step back in the committed exports is 8.63 s.
 *
 * #114 says when the first two are re-derived, and by what rule ("Criterion
 * for revisiting it"). They were re-derived on 2026-10-29 from M4's recorded
 * figures, and the rule gives 0.5 s again:
 * docs/benchmarks/2026-10-29-114-wrap-bound-rederivation.md. The bound is
 * pinned to within 10 µs by bench-metrics.test.mjs, "refuses 10 µs over the
 * 0.5 s bound", and the epsilon it is read with to below 10 µs; that test says
 * what it cannot tell.
 */
const WRAP_BOUND_S = 0.5;

/**
 * Whether the video looped between two consecutive frames, `prev` then `cur`:
 * the clip restarting. A step forward, or none, is no wrap. A step back is one
 * only when `cur` is within 0.5 s of the clip's start (media time 0) and, given
 * `clipDurationS`, the video skipped across the wrap — from `prev` to the
 * clip's end, a frame up to 1 ms past it standing at it as on
 * {@link unwrapMediaTimes}' timeline, then from its start to `cur` — is at most
 * 0.5 s; without it, which is the end, the step back must be more than 0.5 s.
 *
 * Any other step back — a stutter, a decoder hiccup, a seek — is refused with a
 * `RangeError`, in one line naming `frame` when given, rather than read as the
 * clip restarting: every reader of a wrap counts a loop there, so a step read
 * as one would miscount loops, shift `trackTimeShare`'s bins and the counted
 * loops, split `jitterPx`'s windows and misattribute wrap counts (#96). Without
 * a clip duration a seek back to the clip's start from more than 0.5 s into it
 * cannot be told from a restart.
 */
export function isLoopWrap(prev, cur, clipDurationS = null, frame = null) {
    const before = prev.mediaTimeSeconds;
    const m = cur.mediaTimeSeconds;
    if (!(m < before)) return false;
    const skipped =
        clipDurationS === null ? null : clipDurationS - Math.min(before, clipDurationS) + m;
    const why =
        m < 0
            ? "it is before the clip's start"
            : m > WRAP_BOUND_S + TIME_EPS_S
              ? "it is more than 0.5 s into the clip"
              : skipped !== null
                ? skipped > WRAP_BOUND_S + TIME_EPS_S
                    ? `it skips ${seconds(skipped)} across the wrap (clipDurationS ${seconds(clipDurationS)}), more than 0.5 s`
                    : null
                : before - m <= WRAP_BOUND_S
                  ? `it steps back ${seconds(before - m)}, not more than 0.5 s (no clipDurationS to read the wrap by)`
                  : null;
    if (why === null) return true;
    throw new RangeError(
        `${frame === null ? "" : `frame ${frame}: `}media time ${seconds(m)}, after ${seconds(before)}, is not the clip restarting: ${why}; a step back that is not, a stutter or a seek, is refused rather than read as a loop`,
    );
}

/**
 * For each of `frames`, in the order they were processed, whether it is the
 * first after a loop wrap ({@link isLoopWrap}). Every consecutive pair is read,
 * so each reader of a wrap refuses the same runs, whichever frames it counts.
 */
function wrapsOf(frames, clipDurationS = null) {
    return frames.map((f, i) => i > 0 && isLoopWrap(frames[i - 1], f, clipDurationS, i));
}

/**
 * See `DEFINITIONS.loopWraps`. Here and in every reader of a wrap below,
 * `clipDurationS`, when the caller has it, is what {@link isLoopWrap} reads a
 * wrap by.
 */
export function countLoopWraps(frames, { clipDurationS = null } = {}) {
    return wrapsOf(frames, clipDurationS).filter(Boolean).length;
}

/** The loop parameters a caller may get wrong, refused by name rather than read as `NaN`. */
function refuseUnless(ok, message) {
    if (!ok) throw new RangeError(message);
}

const positiveNumber = (n) => Number.isFinite(n) && n > 0;

const checkClipDuration = (clipDurationS) =>
    refuseUnless(
        positiveNumber(clipDurationS),
        `clipDurationS must be a positive number of seconds, got ${clipDurationS}`,
    );

/**
 * How close, in seconds, a frame's time must come to a bin's start to count
 * as at or before it: `mediaTimeSeconds` are microseconds, and a bin's start
 * is computed, so equality between the two has to survive rounding.
 */
const TIME_EPS_S = 1e-9;

/**
 * How far past `clipDurationS` a frame's media time may be, seconds, and still
 * be read as the clip's: rounding between the duration the browser reports and
 * the times its frames carry, not a clip longer than the duration.
 */
const CLIP_END_TOLERANCE_S = 0.001;

/** A time in seconds as a refusal names it: to the microsecond, as media times are. */
const seconds = (s) => `${+s.toFixed(6)} s`;

/**
 * Every frame's time on one timeline, seconds: loop *k* adds *k*·D to its
 * media time, D being `clipDurationS`, and a loop is counted at each wrap
 * ({@link isLoopWrap}, given D: the clip restarting; any other step back in
 * media time is refused, naming the frame). The first frame is in loop 0
 * whatever its media time: a run that starts mid-clip has a first pass that is
 * only part of one. `frames` in the order they were processed.
 *
 * A D shorter than the clip would lay each loop over the next, and a share read
 * on that timeline would look whole while it is not the run's, so it is
 * refused, in one line naming the frame, its media time and D: a `RangeError`
 * when a frame's media time is past D by more than 1 ms. So is a step back that
 * is not the clip restarting ({@link isLoopWrap}, read with D), which leaves no
 * way for a frame's unwrapped time to come before the frame's before it. A frame past D by at most
 * 1 ms — rounding between the duration and the frames' times — stands at D, so
 * the next loop's first frame, at k·D, does not come before it, whichever
 * frames the run's schedule processed. A media time that is not a finite number
 * has no place on the timeline, and is refused in the same way. What unwraps
 * through this — {@link countedLoopFrames}, {@link trackTimeShare},
 * `summarizeRun` with `loops` — refuses with it.
 */
export function unwrapMediaTimes(frames, clipDurationS) {
    checkClipDuration(clipDurationS);
    return unwrap(frames, clipDurationS);
}

/** {@link unwrapMediaTimes} for a `clipDurationS` its caller has already checked. */
function unwrap(frames, clipDurationS) {
    const D = seconds(clipDurationS);
    const overlaps = "a duration shorter than the clip lays its loops over each other";
    let loop = 0;
    return frames.map((f, i) => {
        const m = f.mediaTimeSeconds;
        if (!Number.isFinite(m)) {
            throw new RangeError(
                `frame ${i}: media time ${String(m)} is not a finite number of seconds: it has no place on the run's timeline`,
            );
        }
        if (m > clipDurationS + CLIP_END_TOLERANCE_S) {
            throw new RangeError(
                `frame ${i}: media time ${seconds(m)} is past clipDurationS ${D} by more than 1 ms: ${overlaps}`,
            );
        }
        // A step back that is not the clip restarting is refused here, so the time never goes
        // back: a restart unwraps to the loop's start or after it, at or past the frame before.
        if (i > 0 && isLoopWrap(frames[i - 1], f, clipDurationS, i)) loop++;
        // Up to 1 ms past D, a frame stands at D: the tolerance holds across the wrap after it.
        return loop * clipDurationS + Math.min(m, clipDurationS);
    });
}

/** `clipDurationS`, `firstLoop` and `loopCount`, checked; the loops counted are `firstLoop` to `firstLoop + loopCount - 1`. */
function countedLoops({ clipDurationS, firstLoop = 1, loopCount = 4 }) {
    checkClipDuration(clipDurationS);
    refuseUnless(
        Number.isInteger(firstLoop) && firstLoop >= 0,
        `firstLoop must be a whole number ≥ 0, got ${firstLoop}`,
    );
    refuseUnless(
        Number.isInteger(loopCount) && loopCount >= 1,
        `loopCount must be a whole number ≥ 1, got ${loopCount}`,
    );
    return { firstLoop, loopCount };
}

/**
 * The frames of the counted loops, in the order they were processed: those
 * whose unwrapped time ({@link unwrapMediaTimes}) is in
 * [`firstLoop`·D, (`firstLoop` + `loopCount`)·D). A run starts at the clip's
 * first frame, so loop 0 is a warm-up that is not counted, and the loops
 * counted are 1 to 4 unless the caller says otherwise. See
 * {@link trackTimeShare} for why.
 */
export function countedLoopFrames(frames, options = {}) {
    const { firstLoop, loopCount } = countedLoops(options);
    const D = options.clipDurationS;
    const t = unwrap(frames, D);
    const from = firstLoop * D;
    const to = (firstLoop + loopCount) * D;
    return frames.filter((_, i) => t[i] >= from && t[i] < to);
}

/** A media time as the key two exports are matched on: microseconds, as `requestVideoFrameCallback` reports them. */
export const mediaKey = (seconds) => Math.round(seconds * 1e6);

// Shared with the other bench-*.mjs modules; bench-metrics.mjs does not re-export them.
export {
    wrapsOf,
    refuseUnless,
    positiveNumber,
    checkClipDuration,
    TIME_EPS_S,
    CLIP_END_TOLERANCE_S,
    unwrap,
    countedLoops,
};
