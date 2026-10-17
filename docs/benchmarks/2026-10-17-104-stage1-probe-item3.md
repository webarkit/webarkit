# #104, Stage 1 probe, item 3 completed: #92's two candidates on the probe's instrument (2026-10-17)

**A dated addendum to [the Stage 1 probe](./2026-10-16-104-stage1-probe.md),
run on 2026-10-17 under [the step protocol](./step-protocol.md). The probe is
merged and nothing in it is rewritten: its item 3 carries a one-line pointer
here and stands as written. Not campaign data: no provenance, no device, the
instrument untouched, never reportable as a round. Every filter below is
applied post hoc to a recorded export and changes no `H`, so every movement it
produces is frame selection in full, as the probe's item 5 rules for its own
figures; no figure here is a threshold, and no filter value is a value for
round 1.** The probe's item 3 covered three of the five candidates for #104's
gate: `d_scale`, `d_orth` and the inlier count. This addendum measures the
fourth, [#92](https://github.com/webarkit/webarkit/issues/92)'s inlier-scaled
residual limit, and settles the fifth, #92's bound on the scale change a
single step may imply, which has no quantity at a detection.

The computation is
[`2026-10-17-104-stage1-probe-item3.mjs`](./2026-10-17-104-stage1-probe-item3.mjs),
the harness, which reads the probe's exports, the shadow replays' observed
calls (below), the frozen metrics module and the bundle, and writes nothing
but its report. The measurement was first delivered as a message on
2026-10-17, as its brief asked; this file is the maintainer's follow-up to it,
as the step protocol requires and as the probe records of its own brief.

## The instrument, and the one addition to it

The probe's: the eight seeded desktop replays at `37dc6d4` (seeds 1 to 8,
`scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle`, node
v24.21.0, bundle `3a2567c15d59…`), the "every frame, sync" arm of the two
hand-held clips, counted loops 1 to 4. `cornerJitter`, `countedLoopFrames`,
`targetCorners` and `reprojectCorners` are imported unchanged from
`examples/js/bench-metrics.mjs`, identical at `37dc6d4` and at this commit;
each filter is `cornerJitter`'s own `include`, and a non-DETECT frame is always
kept; the signal is recovered from the four corners as the probe recovers it.
The static clip holds no DETECT frame in its counted loops (the probe, item 2)
and is not read.

**The exports carry no residual for a detection.** A DETECT frame's
`tracking.rmsError` is the failed tracking step's on that frame and is null;
`frameRecord` exports neither the fit's `H` nor its correspondences. #92's
first candidate reads exactly that residual, so the probe's exports cannot
measure it post hoc. The addition is a **shadow replay**: the same worktree,
bundle, node and command, with
[`2026-10-17-104-stage1-probe-item3-observer.mjs`](./2026-10-17-104-stage1-probe-item3-observer.mjs)
loaded by `--import`. It wraps `estimateHomography` on the backend's
prototype, calls the original, records `H`, the counts and the RMS transfer
error of `H` over the correspondences RANSAC's own mask marks, and returns the
original result untouched. It draws no `Math.random`. Nothing in the tracker,
the backend, the bundle or the replay script changes, so the shadow is the
probe's run with one quantity read off it, and that is checkable:

- **The shadow equals the recorded run, frame for frame:** `state`, `ok`,
  `numInliers`, `numMatches`, `mediaTimeSeconds`, `timestampMs` and `corners`
  on every frame, and `runSummary.jitterPx`, on 8 of 8 seeds of both clips.
  The harness asserts it; it can fail, and it did not.
- **Every posed detection matches one observed call,** by projecting the
  call's `H` onto `targetCorners` and comparing to the frame's exported
  `corners` exactly, with the same inlier and match counts: 674 of 674 on the
  wall clip and 383 of 383 on the table clip, over the whole exports. Where
  other arms detected the same frame under the same seed, the duplicate calls
  carry the same residual on every one. The worker and external arms detect
  on frames that depend on wall-clock timing, so the calls file itself is not
  byte-identical run to run (seed 1: 2,164 calls with the run alone, 2,127
  with eight in parallel); every arm's frame count and the sync arm's frames
  are, and the harness reads only those.
- **The probe reproduces through the harness:** the recorded
  `runSummary.jitterPx` on all 16 exports; every row of the probe's filter
  tables (the SD of each A, S, O and E filter in its items 2 and 3); the 449
  and 258 posed detections; the 64 and 32 lasting lock births and their origin
  counts.
- **The shadow exports are not committed,** 227 MB for the eight seeds
  (`AGENTS.md`, "Test assets"). The observer regenerates them, with the command
  in its header; the harness then reproduces every figure in this file from
  them and the probe's exports.
- **A known limitation, as the probe script's:** the observer and the harness
  are covered by no test and by no format check (`docs/` is outside both), so
  a change in the replay script, in a dependency or in the exports' shape
  could break them without notice while the figures they produced stay in
  this record; and the tools have no tests, so a defect in either would
  produce a wrong result reproducibly. Their guards are the three checks
  above, which catch a changed `cornerJitter`, a wrap that did not take, a run
  that differs and a call that matches no frame, not a defect in the residual
  arithmetic itself.

The residual a detection gate would read is RANSAC's inlier RMS under its 4 px
threshold (`DEFAULT_RANSAC_THRESHOLD`), on keypoint matches. #92 was written
about the tracking step's `maxFitRms` of 0.6 px on patch alignment. The two
are different quantities in different regimes, and the figures below show it.

## 1. Candidate 2 is not a test at a detection

#92's second candidate bounds the scale change a single step may imply: the
fitted homography's scale against the step's prediction. At a detection the
tracker holds no prediction. `previous` is null after every detection
(`packages/nft-tracker/src/tracker.ts`: "A detection starts a lock with no
velocity: `previous = null`"), and the detection's `H` is RANSAC's on
keypoint matches, independent of any earlier pose. The quantity has no
referent. The only one the exports could offer is the previous frame's pose,
and what that gives, on the posed detections of the counted loops and on the
lasting lock births (50 or more counted frames), eight seeds pooled:

| | wall | table |
|---|---|---|
| posed detections | 449 | 258 |
| with a posed previous frame | 282 | 42 |
| previous frame's state: DETECT / TRACK / LOST | 333 / 97 / 19 | 224 / 7 / 27 |
| lasting lock births | 64 | 32 |
| births with a posed previous frame | 54 | 12 |
| births whose previous frame is a TRACK frame | 0 | 0 |
| births whose previous frame is a DETECT frame | 64 | 32 |

By inliers, posed detections with a posed previous frame: wall 4: 4 of 71,
5: 12 of 72, 6: 4 of 4, 7: 3 of 9, 8 to 15: 37 of 71, 16 and up: 222 of 222;
table 4: 7 of 64, 5: 10 of 96, 6: 9 of 56, 7: 9 of 31, 8 to 15: 7 of 11.

So the frame before every one of the 96 births is another DETECT frame, never
a tracked pose. The 97 and 7 detections that do follow a TRACK frame are the
re-detections on the frame after a lock fails, and none of them starts a
lasting lock here. A bound defined on the previous frame's pose compares two
independent detections: that is inter-detection consistency, a different test
from the one #92 proposed, and it is undefined on 10 of the wall clip's 64
births and 20 of the table clip's 32. That is the result. The candidate is
settled by definition, not measured, and it does not enter the side-by-side of
section 3.

## 2. Candidate 1, the inlier-scaled residual limit, is structurally wrong at the detection gate

#92 fixes the direction, a fit on fewer points is allowed less residual, and
not the shape. Three forms are measured, `rms` being the observed residual
and `n` the inliers; *beyond the brief,* the plain and linear ones, measured
to settle what the scaling does:

- **plain,** `rms ≤ c`: the unscaled reference, what a residual limit is
  today.
- **linear,** `rms ≤ c · n / 8`: its limit at n = 4 is c / 2, above zero.
- **dof,** `rms ≤ c · √(1 − 4/n)`, equivalently `σ̂ = rms / √(1 − 4/n) ≤ c`:
  the form with a derivation, since a homography fitted to n points leaves
  2n − 8 residual degrees of freedom and its RMS under noise σ is
  σ · √(1 − 4/n). Its limit at n = 4 is 0 and σ̂ is undefined there, so a
  4-inlier fit has no residual estimate and is refused.

**The residual, by inliers,** on the posed detections of the counted loops,
eight seeds pooled: p10, p50, p90, max; `maxErr` is the largest single
transfer error in the fit.

Wall clip:

| inliers | n | rms (px) | maxErr p50, max | σ̂ |
|---|---|---|---|---|
| 4 | 71 | 0.000, 0.000, 0.000, 0.000 | 0.000, 0.000 | undefined |
| 5 | 72 | 0.419, 0.730, 1.079, 1.185 | 1.235, 1.765 | 0.938, 1.633, 2.412, 2.650 |
| 6 | 4 | 0.890, 1.035, 1.408, 1.542 | 1.613, 2.565 | 1.541, 1.793, 2.438, 2.672 |
| 7 to 8 | 61 | 0.396, 0.414, 1.283, 1.568 | 0.618, 3.562 | 0.561, 0.586, 1.859, 2.217 |
| 9 to 15 | 19 | 0.569, 1.234, 1.544, 2.259 | 2.753, 3.744 | 0.763, 1.547, 2.072, 2.917 |
| 16 and up | 222 | 0.875, 1.064, 1.468, 1.606 | 2.951, 3.977 | 0.900, 1.093, 1.543, 1.688 |

Table clip:

| inliers | n | rms (px) | maxErr p50, max | σ̂ |
|---|---|---|---|---|
| 4 | 64 | 0.000, 0.000, 0.000, 0.000 | 0.000, 0.000 | undefined |
| 5 | 96 | 0.296, 0.710, 1.243, 1.658 | 1.141, 3.039 | 0.662, 1.589, 2.779, 3.708 |
| 6 | 56 | 0.224, 0.634, 1.655, 1.828 | 1.035, 3.878 | 0.388, 1.098, 2.867, 3.166 |
| 7 | 31 | 0.742, 1.084, 1.375, 1.585 | 1.777, 3.817 | 1.133, 1.656, 2.101, 2.420 |
| 9 to 13 | 11 | 0.327, 0.467, 0.577, 1.907 | 0.755, 3.473 | 0.422, 0.627, 0.720, 2.462 |

### 2.1 Zero stays zero

A 4-inlier fit is exact on its own points: the residual is zero by
construction, and it measures between 4.6 × 10⁻⁹ and 4.3 × 10⁻⁵ px on all 135
four-inlier detections (71 and 64), exactly zero on none. On the probe's
separation question, 4-inlier detections against every detection with 5 or
more, the probability that a 4-inlier frame's residual exceeds a rest frame's
is **0.000** on both clips, against 0.830 and 0.662 for |`d_scale`|: the
4-inlier fits carry the smallest residual in the record. Two consequences,
both structural:

- A multiplicative scaling cannot penalise them. Zero times any limit's factor
  stays below any positive limit: the plain and linear forms refuse 0 of the
  71 and 0 of the 64 at every c, and their refusal sets share no frame with
  A ≥ 5's.
- The dof form refuses them only because its limit vanishes at n = 4. A fit
  that passes "σ̂ ≤ c" cannot exist there, whatever c is: at n = 4 the
  candidate is a count rule, not a residual reading. Its refusal of the
  4-inlier frames is A ≥ 5's, frame for frame (71 of 71 and 64 of 64, section
  3).

### 2.2 The right fits' residual grows with the inlier count, and not as the correction says

The medians above rise with n: 0.73 px at 5 inliers, 1.06 px at 16 or more,
on the wall clip; the 66-inlier detections that start the wall clip's 32
lasting locks sit at 1.41 to 1.56 px (section 2.4). More inliers under a 4 px
threshold means more of the match noise in the fit. The dof form corrects for
this with √(1 − 4/n): 0.447 at n = 5, 0.707 at n = 8, 0.866 at n = 16, 0.969
at n = 66, relative to its asymptote. The correction's shape can be read only
on right fits, and the right fits this record names are the detections that
start the lasting locks (section 2.4). On those, like for like, median rms
against the correction's ratio:

| wall clip, from, to | observed median rms | the dof correction |
|---|---|---|
| 8-inlier births (0.414 px) to 9-inlier births (0.569 px) | × 1.37 | × 1.05 |
| 8-inlier births (0.414 px) to 66-inlier births (1.416 px) | × 3.42 | × 1.37 |

The rise of all detections' medians from 5 inliers to 16 and up, × 1.46
against the correction's × 1.94, reads nothing about the correction: its low
end is the 5-inlier detections, which are wrong fits on this record (they
start one-frame locks, the probe's item 7), and what it says is only that a
wrong 5-point fit carries a residual as small as a right 8-point fit's. No
5-inlier frame has an rms below the 8-inlier births' median, and all 72 have
one below their maximum of 1.315 px.

So the correction is too flat in n: the right fits' residual rises faster
with the inlier count than √(1 − 4/n) says, by a factor of 2.5 between 8 and
66 inliers. σ̂ then does not order fits by their correctness. On the births
it runs 0.586 at 8 inliers (median), 0.763 at 9, 1.570 at 11 and 1.461 at
66; on all detections 1.63 at 5, 0.59 at 7 to 8, 1.55 at 9 to 15, 1.09 at 16
and up. **One cause, two faces,** both in section 3's tables. At c = 1.5 the
dof form refuses 38 frames of 40 to 66 inliers that no other test touches,
right fits by every other reading whose σ̂ the flat correction leaves above
1.5. And it passes 21 of the 72 five-inlier frames, rms 0.419 to 0.629 px
and σ̂ 0.938 to 1.406, all 21 refused by the count and by `d_scale`, 3 of
them by `d_orth` too; it could refuse them only at c below 0.938, where it
refuses all 32 sixty-six-inlier births (σ̂ 1.451 and up), the 11-inlier one
and part of the 8-inlier ones, 37 to 44 of the 64 births at c = 1 and 0.75
(section 2.3). No c orders the many-inlier right fits below the few-inlier
wrong fits. The plain form, which corrects nothing, shows the same thing
starkly: it refuses all 32 sixty-six-inlier births at c ≤ 1.25 (their rms
1.41 to 1.56 px) while passing every 4-inlier frame.

Two corrections to how this was first put. The brief for this addendum
compared a 45% rise with "the dof correction's 13% at n = 16", a threefold
under-correction: that sets a change between two groups beside the
correction's distance from its asymptote at one n, and the like-for-like
figures are the table's. And this file's first commit (`c3a5a1c`) called the
correction mis-shaped in both directions, too steep between 5 and 16 and too
flat above: the first direction was read off medians whose low end is wrong
fits, it does not hold on the right fits, and it is withdrawn; the passes it
was to explain follow from the one direction that does hold.

**Separation, where the probe put the residual seed sensitivity,** 5 to 7
inliers against 8 or more, as the probability that a low frame's value
exceeds a high frame's, and the best single cut:

| wall clip | P(low > high) | best cut misses of 85 low, catches of 293 high |
|---|---|---|
| rms | 0.244 | 85, 1 |
| σ̂ | 0.752 | 29, 19 at 1.633 |
| \|`d_scale`\| | 0.970 | 4, 16 at 0.248 |
| \|`d_orth`\| | 0.941 | 42, 0 at 0.806 |

On the table clip the high group holds 11 frames and every best cut refuses
all of them: σ̂ reads 0.794, rms 0.700, |`d_scale`| 0.783, |`d_orth`| 0.820,
none clean.

### 2.3 What the forms do to the seed sensitivity

`jitterPx` over seeds 1 to 8 under the dof form; the SD on 7 degrees of
freedom with its 95% interval; windows kept; posed frames refused; lasting
lock births refused, pooled. Recorded for comparison (the probe, items 2, 3
and 7): wall none 6.43 px, A ≥ 8 0.286 and 0 of 64 births, E ≤ 0.05 0.011
and 32 of 64, E ≤ 0.2 0.012 and 6 of 64; table none 824 px, A ≥ 8 0.142 and
27 of 32, E ≤ 0.05 0.143 and 27 of 32, E ≤ 0.2 0.221 and 0 of 32.

Wall clip, dof form:

| c | seeds 1 to 8 (px) | ratio | SD [95%] (px) | windows | refused posed | births refused |
|---|---|---|---|---|---|---|
| 0.25, 0.5 | 5.34 5.33 5.31 5.33 5.31 5.32 5.31 5.32 | 1.01 | 0.011 [0.007, 0.022] | 36 | 54 to 61 | 64 of 64 |
| 0.75 | 5.42 5.37 5.34 5.39 5.34 5.34 5.35 5.39 | 1.01 | 0.029 [0.019, 0.059] | 36 | 48 to 55 | 44 of 64 |
| 1 | 5.40 5.34 5.30 5.39 5.93 5.79 5.81 5.84 | 1.12 | 0.264 [0.174, 0.537] | 36 | 33 to 39 | 37 of 64 |
| 1.25 | 5.43 5.37 5.34 5.41 5.94 5.82 6.37 5.87 | 1.19 | 0.368 [0.244, 0.750] | 36 | 28 to 33 | 36 of 64 |
| 1.5 | 5.47 5.37 5.34 5.49 5.94 5.81 6.38 5.90 | 1.20 | 0.361 [0.239, 0.734] | 36 | 20 to 26 | 9 of 64 |
| 2 | 5.59 5.90 6.12 5.70 6.39 6.13 6.37 6.08 | 1.14 | 0.289 [0.191, 0.589] | 36 | 7 to 14 | 0 of 64 |
| 3 | 5.75 5.91 6.11 5.70 6.39 6.55 6.37 6.41 | 1.15 | 0.330 [0.218, 0.672] | 36 | 5 to 12 | 0 of 64 |

Table clip, dof form:

| c | seeds 1 to 8 (px) | ratio | SD [95%] (px) | windows | refused posed | births refused |
|---|---|---|---|---|---|---|
| 0.25 | 2.36 2.36 2.76 2.36 3.37 2.36 2.33 2.35 | 1.44 | 0.366 [0.242, 0.745] | 29 to 32 | 26 to 36 | 32 of 32 |
| 0.5 | 2.36 2.41 2.76 2.36 3.85 2.45 2.41 2.35 | 1.64 | 0.516 [0.341, 1.050] | 29 to 32 | 24 to 33 | 26 of 32 |
| 0.75 | 3.72 3.56 3.56 3.19 4.44 2.54 3.20 3.34 | 1.75 | 0.541 [0.358, 1.102] | 30 to 32 | 23 to 29 | 20 of 32 |
| 1 | 3.72 3.55 3.56 3.20 4.44 4.81 3.20 3.42 | 1.50 | 0.583 [0.385, 1.187] | 30 to 32 | 23 to 28 | 20 of 32 |
| 1.25 | 3.72 3.94 3.57 3.31 4.50 4.86 3.32 3.71 | 1.47 | 0.554 [0.366, 1.127] | 31 to 32 | 19 to 24 | 0 of 32 |
| 1.5 | 3.72 3.94 3.57 3.31 4.50 4.86 3.32 3.73 | 1.47 | 0.553 [0.366, 1.125] | 31 to 32 | 18 to 23 | 0 of 32 |
| 2 | 8.63 10.76 4.16 6.36 7.29 11.93 14.42 7.41 | 3.46 | 3.314 [2.191, 6.745] | 31 to 32 | 13 to 18 | 0 of 32 |
| 3 | 8.63 11.19 15.89 8.90 19.09 18.16 14.76 14.74 | 2.21 | 3.976 [2.629, 8.092] | 31 to 33 | 5 to 12 | 0 of 32 |

At c = 3 the dof form is A ≥ 5 on `jitterPx` to the last digit on both clips:
the only frames it refuses beyond the 4-inlier ones (σ̂ above 3: two on the
table clip's seed 4, one on its seed 7, none on the wall clip) sit in
loop-first windows that A ≥ 5 already leaves with fewer than four frames.

**The plain and linear forms collapse nothing.** Over c from 0.25 to 3 the
plain form's SD runs 6.04 to 6.58 px on the wall clip and 148 to 824 px on
the table clip; the linear form's 5.93 to 6.48 px and 148 to 824 px. The
reason is section 2.1's: both pass every 4-inlier frame, and those are the
frames the seed moves (the probe, item 2). What they refuse instead is the
other end: the plain form at c ≤ 0.5 refuses 44 to 64 of the wall clip's 64
births and 22 to 26 of the table clip's 32; the linear form at c = 0.25
refuses 32 and 32. The limit ranks fits in the wrong order.

**Reading.** The dof form does collapse the seed sensitivity, through the
frames it refuses by count at n = 4 and by σ̂ above. On the wall clip it
reaches the signal's level, an SD of 0.01 to 0.03 px, only while refusing 44
to 64 of the 64 births; with the births preserved, at c ≥ 2, it sits at 0.29
to 0.33 px, the count's level between N = 5 and N = 8 (0.29 to 0.38 px). On the table clip
with the births preserved, at c = 1.25 to 1.5, it reaches 0.55 px, where
E ≤ 0.2 reaches 0.22 px at the same zero births. These are comparisons of
separation on a non-causal surrogate; none of the c values is a value for
anything.

### 2.4 The lock births

The detections that start the lasting locks, as the probe attributes them
(item 7), with their residual:

| clip, origin inliers | n | rms (px) | σ̂ | \|`d_scale`\| | \|`d_orth`\| |
|---|---|---|---|---|---|
| wall, 8 | 23 | 0.414 to 1.315 | 0.586 to 1.859 | 0.034 to 0.099 | 0.014 to 0.233 |
| wall, 9 | 8 | 0.569 to 0.809 | 0.763 to 1.085 | 0.073 to 0.450 | 0.055 to 0.161 |
| wall, 11 | 1 | 1.253 | 1.570 | 0.190 | 0.048 |
| wall, 66 | 32 | 1.406 to 1.555 | 1.451 to 1.604 | 0.003 to 0.031 | 0.000 to 0.018 |
| table, 6 | 20 | 0.247 to 0.634 | 0.428 to 1.098 | 0.030 to 0.097 | 0.013 to 0.058 |
| table, 7 | 7 | 0.742 | 1.133 | 0.114 | 0.017 |
| table, 9 | 4 | 0.467 to 0.515 | 0.627 to 0.691 | 0.033 to 0.040 | 0.040 to 0.043 |
| table, 13 | 1 | 0.577 | 0.693 | 0.040 | 0.042 |

The wall clip's 66-inlier births, the record's best fits by every other
reading, carry its highest residuals: a plain limit at c ≤ 1.25 refuses all
32 of them and no 4-inlier frame.

## 3. Refusal sets side by side

Four tests on the posed DETECT frames of the counted loops, eight seeds
pooled: the count at A ≥ 8, `d_scale` at S ≤ 0.05, `d_orth` at O ≤ 0.05, the
pair at E ≤ 0.05 and E ≤ 0.2, and the dof residual. Candidate 2 has no set
(section 1). The residual's c is chosen two ways, neither a threshold:
size-matched to A ≥ 8's refusal count on the wall clip (c = 1.5, 184 against
156), and the smallest c on the grid that refuses no lock birth (c = 2 on the
wall clip; c = 1.25 on the table clip, where 1.5 refuses the same zero births
and is shown instead, so that both clips are read at one value). On the table
clip A ≥ 8 refuses 247 of 258 frames, so size-matching there gives c = 0.25
and every pair agrees trivially.

Wall clip, 449 frames; both, X only, Y only, Jaccard:

| X, Y | X | Y | both | X only | Y only | Jaccard |
|---|---|---|---|---|---|---|
| A ≥ 8, S ≤ 0.05 | 156 | 223 | 156 | 0 | 67 | 0.700 |
| A ≥ 8, O ≤ 0.05 | 156 | 184 | 138 | 18 | 46 | 0.683 |
| A ≥ 8, E ≤ 0.05 | 156 | 226 | 156 | 0 | 70 | 0.690 |
| A ≥ 8, E ≤ 0.2 | 156 | 199 | 156 | 0 | 43 | 0.784 |
| S ≤ 0.05, O ≤ 0.05 | 223 | 184 | 181 | 42 | 3 | 0.801 |
| A ≥ 8, Rdof ≤ 1.5 | 156 | 184 | 129 | 27 | 55 | 0.611 |
| S ≤ 0.05, Rdof ≤ 1.5 | 223 | 184 | 141 | 82 | 43 | 0.530 |
| O ≤ 0.05, Rdof ≤ 1.5 | 184 | 184 | 142 | 42 | 42 | 0.628 |
| E ≤ 0.05, Rdof ≤ 1.5 | 226 | 184 | 144 | 82 | 40 | 0.541 |
| E ≤ 0.2, Rdof ≤ 1.5 | 199 | 184 | 142 | 57 | 42 | 0.589 |
| A ≥ 8, Rdof ≤ 2 | 156 | 87 | 81 | 75 | 6 | 0.500 |
| A ≥ 5, Rdof ≤ 2 | 71 | 87 | 71 | 0 | 16 | 0.816 |
| A ≥ 5, Rplain ≤ 1 | 71 | 164 | 0 | 71 | 164 | 0.000 |

Table clip, 258 frames:

| X, Y | X | Y | both | X only | Y only | Jaccard |
|---|---|---|---|---|---|---|
| A ≥ 8, S ≤ 0.05 | 247 | 232 | 226 | 21 | 6 | 0.893 |
| A ≥ 8, O ≤ 0.05 | 247 | 205 | 204 | 43 | 1 | 0.823 |
| A ≥ 8, E ≤ 0.05 | 247 | 253 | 247 | 0 | 6 | 0.976 |
| S ≤ 0.05, O ≤ 0.05 | 232 | 205 | 184 | 48 | 21 | 0.727 |
| A ≥ 8, Rdof ≤ 1.5 | 247 | 164 | 163 | 84 | 1 | 0.657 |
| S ≤ 0.05, Rdof ≤ 1.5 | 232 | 164 | 154 | 78 | 10 | 0.636 |
| O ≤ 0.05, Rdof ≤ 1.5 | 205 | 164 | 153 | 52 | 11 | 0.708 |
| E ≤ 0.05, Rdof ≤ 1.5 | 253 | 164 | 164 | 89 | 0 | 0.648 |
| E ≤ 0.2, Rdof ≤ 1.5 | 205 | 164 | 158 | 47 | 6 | 0.749 |
| A ≥ 5, Rplain ≤ 1 | 64 | 57 | 0 | 64 | 57 | 0.000 |

**How many of the four refuse each frame,** count, `d_scale`, `d_orth` and
the dof residual, by inliers:

- Wall clip, Rdof ≤ 1.5: refused by none 183, by one 62, by two 56, by three
  19, by all four 129. All 71 four-inlier frames by all four; of the 72
  five-inlier frames 51 by all four, 3 by three, 18 by two, so the residual
  passes 21 of them; the 16-and-up frames 183 by none, 38 by one, 1 by two.
  The 62 refused by one test alone:
  **40 by the residual** (38 with 16 or more inliers, σ̂ 1.504 to 1.688, and 2
  with 8 to 15, σ̂ 2.065) and 22 by `d_scale`. The 56 refused by two: 33 by
  `d_scale` and `d_orth`, 18 by the count and `d_scale`, 3 by `d_orth` and the
  residual, 2 by `d_scale` and the residual.
- Wall clip, Rdof ≤ 2: by none 221, by one 29, by two 57, by three 61, by all
  four 81. The residual alone refuses 2 frames; the 87 it refuses are 81 of
  A ≥ 8's and 71 of A ≥ 5's, so with the births preserved it is nearly a
  subset of the count.
- Table clip, Rdof ≤ 1.5: by none 5, by one 4, by two 46, by three 60, by all
  four 143. The residual alone refuses no frame; the count and `d_scale`
  together refuse 33, the count and `d_orth` 11.

**Lock births refused,** pooled, with the overlap of each test's set with
E ≤ 0.05's; the recorded counts are the probe's item 7:

| test | wall, of 64 | of them also E ≤ 0.05's 32 | table, of 32 |
|---|---|---|---|
| A ≥ 5 | 0 | 0 | 0 |
| A ≥ 8 | 0 | 0 | 27: the 6- and 7-inlier births |
| S ≤ 0.05 | 29: 8-inlier 20, 9-inlier 8, 11-inlier 1 | 29 | 26 |
| O ≤ 0.05 | 11: 8-inlier 3, 9-inlier 8 | 11 | 1 |
| E ≤ 0.05 | 32 | 32 | 27 |
| E ≤ 0.2 | 6: 8-inlier 3, 9-inlier 3 | 6 | 0 |
| Rdof ≤ 1.5 | 9: 8-inlier 3, 11-inlier 1, 66-inlier 5 | 4 | 0 |
| Rdof ≤ 2 | 0 | 0 | 0 |
| Rdof ≤ 0.25 | 64 | 32 | 32: including the four 9-inlier and the 13-inlier |
| Rplain ≤ 1 | 36: 8-inlier 3, 11-inlier 1, 66-inlier 32 | 4 | 0 |

On the table clip the count at 8, `d_scale` at 0.05 and the pair at 0.05
refuse the same 26 to 27 births, and the pair at 0.2, the dof residual at
1.25 to 2 and the plain form at c ≥ 0.75 refuse none.

**The reading.** The count and the signal are near-equivalent at the values
where the seed sensitivity collapses, as the probe's item 3 ruled, and this
addendum changes nothing there: on the wall clip A ≥ 8's refusal set is a
subset of S ≤ 0.05's and of E's, and on the table clip A ≥ 8 and E ≤ 0.05
agree on 247 of 253 frames and on 27 of 27 births. The residual is a third,
partly different test. On the wall clip it refuses 40 frames no other test
touches, passes 21 five-inlier frames that the count and `d_scale` refuse, and its refused
births overlap the signal's on 1 to 4 of its 9. Its one point of full
agreement with the others, the 4-inlier frames, is its count rule at n = 4,
not a residual reading. Candidate 2 is not a test at a detection.

## 4. Item 3 is complete

The probe's item 3 covered three of five candidates. With this addendum four
are measured on the same instrument, `d_scale`, `d_orth`, the inlier count
and the inlier-scaled residual limit, and the fifth is settled by definition.
The discriminator question is answered as the probe's ruling of 2026-10-16
answers it: the count and the signal collapse the seed sensitivity and are
near-equivalent at the values where they do, the residual does so only
through its count rule at n = 4 and otherwise ranks fits in the wrong order
at the detection gate, and the step-scale bound has nothing to read there.
What #104 registers from this, and whether #92's two directions stay open for
the tracking step they were written for, is the maintainer's; this addendum
measures the detection gate only.

## 5. Open, registered and not run

**The 40 frames the residual alone refuses on the wall clip are four
instants.** At c = 1.5 the dof form refuses 40 frames that no other test
touches; on the table clip it refuses none alone. Their split: 38 have 16 or
more inliers, σ̂ 1.504 to 1.688; 2 have 9 inliers, σ̂ 2.065. By media time
they are four instants of the clip, recurring across seeds and counted loops,
not a population of frames:

| media time | frames | inliers of matches | seeds | σ̂ |
|---|---|---|---|---|
| 3.4515 s | 2 | 9 of 15 | 2 and 3, one loop each | 2.065 |
| 8.2676 s | 32 | 42 of 60 on 30, 40 of 60 on 2 | all eight, all four loops | 1.534 to 1.688 |
| 8.3077 s | 1 | 51 of 65 | 1 | 1.540 |
| 8.3478 s | 5 | 66 of 84 | 1, 2, 3, 6 and 7, one loop each | 1.504 to 1.604 |

So the 38 are three instants, 8.27 s on every seed and loop, 8.31 s once and
8.35 s five times, and the 2 nine-inlier frames are one. For context, all
222 detections with 16 or more inliers on the clip fall on seven instants
between 7.75 and 8.35 s, 31 or 32 frames each. That stretch is not the clip's
start, as this file's previous commit (`e4ced2f`) had it: the clip runs
11.96 s, and 7.75 s is where a running lock fails on every one of its 32
occurrences, the frame before it being a TRACK frame on 32 of 32. **The seven
instants, and the fate of the lock each starts,** read on every seed and
counted loop, 32 occurrences each except the two that seed 4's loop 1 skips:

| media time | inliers of matches | σ̂ | the lock it starts | frame before it |
|---|---|---|---|---|
| 7.7458 s | 73 of 95 | 0.896 to 1.092 | dies on the next frame on 31 of 32; on seed 4, loop 1, it holds 7 frames, to 8.067 s | TRACK, the lock from 3.5 s |
| 7.7860 s | 73 of 85 | 0.990 to 1.629 | dies on the next frame, 31 of 31 | DETECT |
| 7.8261 s | 78 of 98 | 0.970 to 0.985 | holds 5 frames, then dies, 31 of 31 | DETECT |
| 8.0669 s | 75 of 95 | 1.089 to 1.210 | holds 4 frames, then dies, 32 of 32 | TRACK |
| 8.2676 s | 42 of 60 on 30, 40 of 60 on 2 | 1.534 to 1.688 | dies on the next frame, 32 of 32 | TRACK |
| 8.3077 s | 51 of 65 | 1.425 to 1.540 | dies on the next frame, 32 of 32 | DETECT |
| 8.3478 s | 66 of 84 | 1.451 to 1.604 | lasts, 89 tracked frames, 32 of 32: the clip's lasting locks (section 2.4) | DETECT |

Every lock that dies is followed by a DETECT frame, never a LOST one: the
tracker re-detects at once. The count, `d_scale` and `d_orth` accept all
seven instants.

**What the table shows,** as an observation on one window of one clip and
not a general claim. Six of the seven high-inlier detections fail before the
seventh holds, on every occurrence, 32 or 31. Their inlier counts are 73, 73,
78, 75, 42, 51 and 66, and the one that lasts has 66: the two highest, 78 and
75, both die. Its σ̂, 1.451 to 1.604, is higher than that of four of the six
that die on every occurrence but one (7.7860 s reaches 1.629 once in 31),
higher than 8.3077 s's on 28 of 32, and lower than 8.2676 s's on 31 of 32.
So on this window neither the inlier count nor the residual orders a
surviving lock above a doomed one, and every one of the seven sits far above
the gate's minimum of 4 inliers.

**Does σ̂ order the doomed births below the lasting one? No.** This file's
previous commit registered, and did not run, the question whether the
detections at 8.27 s and 8.31 s, which the count accepts and whose locks die
on the next frame, are poor fits. On the table it reduces to one reading. A c
that refuses both on every occurrence while passing 8.35 s on every
occurrence would have to lie at or above the lasting instant's largest σ̂,
1.604, and below the doomed instants' smallest, 1.425. No such c exists, for
either instant on its own: 8.27 s needs c below 1.534, 8.31 s below 1.425,
and the lasting instant reaches 1.604. Within a single seed and loop the
8.27 s detection does sit above the 8.35 s one on 31 of 32, but the 8.31 s
detection does so on 4 of 32: σ̂ places one doomed birth above the lasting
one and the other below it. That is the answer, and it closes the registered
question; no test on these instants stays registered here.

Two things do not change with it. The addendum's verdict on candidate 1
stands: its failure at four inliers (section 2.1) is structural, and this is
a different matter. And no c here is a threshold: the probe's item 5 binds,
the filter is post hoc, and two doomed births on one clip could have
established nothing even had σ̂ ordered them. Why the locks born at 8.27 s
and 8.31 s die on the next frame on every seed while the one born at 8.35 s
lasts is not this addendum's question.

**The consequence for the lock-birth constraint.** The constraint recorded
on 2026-10-16, that a threshold must preserve the lock births with the counts
as recorded (the probe's item 7, in the wording the reviewer gave it in #142's
review), already counts only lasting locks, 50 or more counted frames, so none
of the six detections that die on this window is among its 64 births, and a
filter that refuses them costs it nothing: the dof residual at c = 1.5 refuses
8.2676 s on all 32 occurrences and 8.3077 s on 1, and the 9 births it does
refuse are 3 eight-inlier, 1 eleven-inlier and 5 of the 8.3478 s ones
(section 3). It is not refuted; it rests on one cut at 50 counted frames that
reads no fate on either side of it, a one-frame lock and a seven-frame one
counting alike as none and a 50-frame and a 221-frame one alike as one, and
restating it on the fate of every birth on both clips is registered and not
run.

## What this addendum does not decide

- Any threshold, for any of the four tests: section 2.3's and section 3's c
  and τ values are comparison points, chosen by set size or by births
  preserved, on a post-hoc filter that changes no `H` (the probe, item 5).
- #104's scope and registered claim, which the maintainer draws from the
  probe and this addendum together.
- Whether #92's two directions hold for the tracking step's `maxFitRms`, the
  defect they were written for; the detection gate is a different regime
  (section 2's preamble), and nothing here reads the tracking step.
- Why the locks born at 8.27 s and 8.31 s die on the next frame on every seed
  while the one born at 8.35 s lasts (section 5); the registered question on
  those instants is closed there.
