# #92, Stage 1: the weighing of the residual limit's candidates on #90's sweep, on the shipped target and on M2's 64 patches (2026-10-28)

**A Stage 1 probe under [the step protocol](./step-protocol.md), run on
2026-10-28: synthetic, plus a read of committed exports. No device run, no
bench-page run, no replay of a bundled clip. It weighs the candidates
[#92](https://github.com/webarkit/webarkit/issues/92) names for the residual
limit `maxFitRms`, on every fit
[#90](https://github.com/webarkit/webarkit/pull/90)'s sweep produces: the
limit scaled by the inlier count (C1), a bound on the scale change one step
implies (C2), and [#104](https://github.com/webarkit/webarkit/issues/104)'s
signal read as a change rather than a level (C3). Beside them it reads the
real steps of the committed tracking exports. It implements none of them: no
file under `packages/*/src/` is changed, and the tracker computes none of the
candidates. Not campaign data, and never reportable as a round. It registers
no value: a threshold, and the choice among the candidates, are the
maintainer's.**

The computation is
[`2026-10-28-92-stage1-weighing.mjs`](./2026-10-28-92-stage1-weighing.mjs).
It reads the frozen sweep's inputs where they lie, runs the tracking step on
them, reads the committed exports, and writes nothing. Its output is not
committed; run it to reproduce every number here:

```bash
node --experimental-transform-types docs/benchmarks/2026-10-28-92-stage1-weighing.mjs
```

after `npm ci` and `npm run build` once, as for #160's script (the jsfeatNext
backend's module, imported for `intrinsics`, imports the spec's built
`dist`).

## Step 0: provenance

- **Ref:** `docs/92-stage1-weighing`, branched from `origin/dev`.
- **`origin/dev` at branching: `00e3821dfdc59ba911940e46989e7ffea5141fb0`,**
  the merge commit of [#185](https://github.com/webarkit/webarkit/pull/185),
  after `git fetch origin`. The brief asked for `00e3821` or a descendant; it
  was `00e3821` itself. The main checkout stayed on `master` and was not
  switched. The work was done in a separate worktree, and every reading below
  is at that SHA.
- **Node v24.21.0**, the pin. `npm ci` and `npm run build` ran in the
  worktree. The build's manifest reads `HEAD 00e3821, clean, bundle
  66687a9714dd…`. The bundle is not read by this probe.
- **#160's script rerun unchanged, against its record.** At `00e3821`,
  [`2026-10-21-104-stage1-threshold-derivation.mjs`](./2026-10-21-104-stage1-threshold-derivation.mjs)
  (33,583 bytes, SHA-256 `a6deaa8a…a807`, the record's) was run twice. Both
  stdouts were 187,267 bytes with SHA-256
  `afb7c9dbf7b9540716a6498cb7880a87dd96f9acf67bed142c63f1bb8488e560`, which
  is the hash
  [#160's record](./2026-10-21-104-stage1-threshold-derivation.md) gives for
  its two runs at `9fa0ff1` ("Determinism and the guards"). So the instrument
  this probe copies is the record's, byte for byte, at this SHA. One run took
  about 22 s here.

### The citation check, and the rulings

The brief's citations and rulings were checked against their sources at
`00e3821` before any other work (Stage 4). Two rulings did not hold on the
code, and were the brief's errors. The maintainer re-ruled both on
2026-10-28, and the re-rulings are what this probe applies. Their source is
the maintainer's message in the session; this record is where they are
written down.

- **Ruling 1a, "the fit RMS corrected for the fit's degrees of freedom,
  `rms · sqrt(m / (m − p))`", did not hold.** `robustHomography` is an IRLS
  with Tukey's biweight. Its weights `w = (1 − (r/c)²)²` vary continuously
  in (0, 1] with the data, and its `rmsError` is `√(Σ w r² / Σ w)`,
  normalised by Σw and not by a count
  (`src/tracking/robust_homography.ts`, lines 192 to 217). `numInliers`
  counts the weights above 0 (line 139). The DLT it iterates solves
  h̃₁ … h̃₈ with h̃₉ = 1 (lines 288 to 319), and minimises a weighted
  algebraic error, not the geometric residual it reports (lines 69 to 75).
  With data-dependent weights, m is not 2 × inliers. That is the brief's
  own example of a stop.
  - **Re-ruling:** keep it only as a labelled heuristic, not a statistical
    correction. ρ = rms · √(2n / (2n − 8)) is reported with n = inliers and
    with n = n_eff = Σw side by side. 1b, the free boundary, is the primary
    answer for C1.
- **Ruling 2a, "the previous accepted pose is taken to be the view's exact
  H", did not hold as the tracker's notion.** `trackFrame(frame, target,
  previous, current, …)` takes "the last two homographies"
  (`src/tracking/track_frame.ts`, lines 293 to 306). The sweep calls it with
  `previous = null, current = about(E, H)` (`track_frame.test.ts`, lines 696
  to 703). With `previous = null` the prediction is `current` itself, "zero
  velocity", the first frame after a detection
  (`src/tracking/predict_homography.ts`, lines 80 to 86 and 107). So the
  tracker's previous pose in a sweep step is `about(E, H)`. Three sources
  read the sweep the same way:
  - `tracker.ts`, lines 93 and 94: "That takes such a change on a step with
    no velocity to predict it — a lock's first";
  - `DEFINITIONS.firstSteps`: "a lock's first step, which has no velocity to
    predict with";
  - round 3's table in `README.md` (line 2402): "from the target shrinking
    by 1.10–1.12".

  But the fit depends only on the prediction (`track_frame.ts`, lines 335 to
  337). So the same fits are what a held lock would produce whose previous
  pose was exact and whose velocity was wrong by E.
  - **Re-ruling:** report both readings side by side, each named for what it
    models.
    - **(i) held lock:** H_prev = the view's exact H, with a velocity error
      E. This is #92's scenario.
    - **(ii) first step after a detection:** H_prev = about(E, H), the
      tracker's own notion.
- **Ruling 3a** used the same previous pose ("as in 2a") and fell with it.
  **Re-ruling:** the same two readings for ΔE = E(H_fit) − E(H_prev), signed
  and absolute.
- **The comment's two gaps, 0.01211 and 0.00909** (#92, 2026-10-21), are
  #160's per-view one-τ interval widths: 0.01564 − 0.003526 and
  0.04174 − 0.03265 (#160's record, its table under "One threshold for both
  quantities"). A per-view constant shift of E reproduces them exactly and
  adds nothing within a view. The test that matters is pooled, and the
  re-ruling makes it the question of C3. Under signed ΔE in reading (i), the
  script reproduces both per-view widths, 0.01211 and 0.009091.
- **The fov-90° statement** ("at fov 90° the second view's gap is
  negative"): confirmed for the signed form in both readings (below). The
  |ΔE| form differs, and the case is reported as found.
- **The export fields:** `DEFINITIONS` defines no per-frame `state`,
  `tracking` or `processingResolution`. This is a finding, recorded under
  "The real steps" and not fixed here. The fields are cited instead by the
  code that writes them.
- **"Why now":** the brief cited #160's script, lines 138 to 155, for the
  order of this weighing before
  [#130](https://github.com/webarkit/webarkit/issues/130). Those lines hash
  eight paths, the seven ground-truth files and the target, and say nothing
  about #130. The reason rests on #130 itself: it is open, and moves the
  seven ground-truth files out of `test/` "after M4's campaign". It also
  rests on `docs/benchmarks/README.md`, lines 5134 and 5135 ("They move out
  of `test/` after the campaign", with the link to #130). The instrument hashes
  the files at their current paths, so it reads the sweep only until #130
  lands.
- **Everything else in the brief held as quoted:**
  - #92's body and its three comments;
  - the `poor-fit` rule, at `track_frame.ts` line 422 exactly;
  - #160's gross rule, its line 397, fatal on eight;
  - round 3's "The residual limit's margin" (`2026-09-29-desktop-tuning-r3.md`,
    lines 146 to 165);
  - #160's item 8, whose text names 45° and 90° and whose code and record
    read 45°, 60° and 90°.

## What was read, by file and line range

Line numbers are at `00e3821`.

- `AGENTS.md`, `CLAUDE.md`, `docs/benchmarks/step-protocol.md`: whole.
- #92's body and its three comments; #130's body.
- `2026-10-21-104-stage1-threshold-derivation.mjs`, 1 to 576, and its
  record, 1 to 639: whole.
- `2026-09-29-desktop-tuning-r3.md`, 130 to 185.
- `docs/benchmarks/README.md`: line 2402, and 5128 to 5137.
- `packages/nft-tracker/src/tracking/track_frame.ts`, 40 to 483;
  `robust_homography.ts`, 26 to 400; `predict_homography.ts`, 26 to 118.
- `src/tracker.ts`: 66 to 100, 209, 218, 252, 279, 430 to 475, and 896.
- `packages/nft-tracker/test/tracking/track_frame.test.ts`: 80 to 130, 170
  to 182, and 625 to 716.
- `warped_frames.ts`: the lines that name gain and bias.
- `examples/js/bench-definitions.mjs`: its key list, and 64 to 100.
- `examples/js/bench-frames.mjs`, 42 to 160; `examples/bench-nft.html`, 627,
  1318 to 1332, and 1735 to 1752.

## The instrument

- **#160's driver, copied, and shown to be the same.** A test file cannot be
  imported, and #160's script is not a module. So its lines 114 to 402 are
  copied:
  - the hashes of the seven attested files and the target;
  - the imports and resolve hook;
  - the 137 predictions on two views of five renders, and the K checks;
  - step 0, fatal on 788 right and 0 wrong (shipped, at least 11 inliers)
    and on 787 and 24 (M2's 64);
  - the gross label, fatal on eight.

  #160's lines 114 to 402 are this script's lines 108 to 396. A `diff` of
  those two ranges shows one line differing, and no other: each fit carries
  one more field, `weights`, the fit's final Tukey weights. One import,
  `readdirSync`, is added after the copy.
- **Its identity is checked by what it prints.** The K block, the step 0
  block and the table of the 24 wrong fits are printed by #160's own lines,
  copied unchanged. Each must hash to the SHA-256 of the same block in
  #160's stdout above (fatal). Those three hashes were taken from that
  stdout, whose whole hash is the record's.
- **Nothing in the tracker is reimplemented.** These are imported:
  - the renderer, the views, the patches, the target and the step;
  - `signal`'s inputs and `intrinsics`.

  The candidates' own arithmetic is this file's:
  - ρ;
  - the Jacobian of a homography;
  - a four-point homography for the exports.

  Each is checked against a case whose answer is known (below).
- **Per fit, beside #160's fields:**
  - the inliers (weights above 0, checked equal to `stats.inliers`, fatal);
  - n_eff = Σw, checked to keep 2·n_eff − 8 positive (fatal);
  - the fit RMS, ρ(n) and ρ(n_eff);
  - |ln s| and ΔE under both readings, ΔE at 45°, 60° and 90°;
  - the verdict: right, wrong gross, or wrong other.
- **The scale change.** s = √|det J|, with J the 2 × 2 Jacobian of
  H_fit · H_prev⁻¹ at H_prev's image of the target centre `((w − 1)/2,
  (h − 1)/2)`, `about`'s centre. Three checks guard it (fatal):
  - **The known-scale check:** each of the 137 predictions about each view
    must imply exactly its own scale, 1 for a shift or a roll and f for
    `scaling(f)`, to 10⁻⁹ in ln.
  - **Every Jacobian's closed form against central differences**, to 10⁻⁶
    relative. The first check alone cannot see the projective terms, since
    `about(E, H) · H⁻¹` is affine.
  - **Every step's evaluation point, by the chain rule:** ln s must equal
    ½ ln |det J_H(c)| − ½ ln |det J_P(c)| at the target-space centre c, to
    10⁻⁹. Added after the independent review found that the first two pass
    a Jacobian evaluated at the wrong point.

## The sweep: 1,599 fits

| target | right | wrong, gross | wrong, other |
|---|---|---|---|
| shipped, 48 patches | 788 | 0 | 0 |
| M2's 64 patches | 787 | 8 | 16 |

The right fits of both targets are 1,575. The gross eight are #160's, on
M2's 64 patches only, so every row below reads the same eight against the
right fits it names.

### For reference: the unscaled RMS, today's form

`maxFitRms` refuses a fit whose RMS is above it. Read as a threshold over
the same fits:

| right fits read | largest right RMS (whose) | smallest gross RMS (whose) | interval |
|---|---|---|---|
| both targets, both views | 0.3906 (shipped, seed 5, view 0, shift 3 px @ 247.5°, 34 inliers) | 0.4236 (seed 3, view 0, `scale x1.1`, 9.193 px off, 8 inliers) | [0.3906, 0.4236), width 0.03305, ratio 1.085 |
| M2's 64 only | 0.3703 | 0.4236 | [0.3703, 0.4236) |
| view 1, both targets | 0.3674 | 0.4449 | [0.3674, 0.4449) |

On this sweep a fixed limit separates, in every scope, if it is set in that
interval. The shipped 0.6 is not in it. That is round 3's finding (#92's
comment of 2026-09-29): the gross fits sit at 0.42 to 0.56 px, under 0.6.
All sixteen non-gross wrong fits (RMS 0.226 to 0.364) pass anywhere in the
interval.

### C1a: ρ = rms · √(2n / (2n − 8)), a labelled heuristic

`robustHomography` is an IRLS with data-dependent weights, whose `rmsError`
is normalised by Σw (`robust_homography.ts`, lines 192 to 217). So neither
count below makes ρ a degrees-of-freedom correction.

| form | both targets, both views | view 0 | view 1 | shipped only, both views | M2's 64 only, both views |
|---|---|---|---|---|---|
| n = inliers | [0.4444, 0.5991), width 0.1547, ratio 1.348 | [0.4444, 0.5991) | [0.4415, 0.6291) | [0.4158, 0.5991) | [0.4444, 0.5991) |
| n = n_eff = Σw | [0.4461, 0.6061), width 0.1599, ratio 1.358 | [0.4461, 0.6061) | [0.4432, 0.6374) | [0.4170, 0.6061) | [0.4461, 0.6061) |

- **Where the bounds come from.**
  - The largest right ρ belongs to M2's `scale x1.08` fits on 13 inliers
    (0.4444 at seed 3, view 0).
  - The smallest gross ρ belongs to the 8-inlier `scale x1.1` fit (seed 3,
    view 0), whose RMS 0.4236 is the gross fits' smallest.
- **The two counts differ by little.** Inliers − n_eff is at most 1.662 over
  every fit, with a median of 0.1997, and 0.18 to 0.39 on the gross eight.
  So the two forms move the interval by under 0.01.
- **Against the unscaled RMS,** the scaling widens the pooled interval from a
  ratio of 1.085 to 1.348. It does so because the gross fits have few
  inliers (8 to 10), so √(2n / (2n − 8)) raises them most.
- **The sixteen:** all pass at the tightest τ in every scope with both
  targets' right fits. Read against the shipped target's right fits alone,
  one is refused at the tightest τ.

### C1b: the free boundary, the primary answer for C1

A limit L(n) on the RMS that does not decrease with the inlier count, and
separates, exists iff each gross fit's RMS exceeds the largest RMS of a right
fit with at most as many inliers. C1a's ρ(n) is one form of L. A separating
L must still sit at or above every right fit's RMS at its own n. Today's
constant 0.6 is non-decreasing too, and passes all eight.

- **A separating L exists, on each target and on both, per view and pooled,
  and the existence does not depend on the RMS.**
  - The gross fits have 8 to 10 inliers (four on 8, one on 9, three on 10).
  - No right fit of either target has fewer than 11: 11 on the shipped
    target, 12 on M2's 64, and 13 on M2's view 0.
  - So for every gross fit the envelope of right fits at or below its count
    is empty. The existence condition does not depend on n above 10.
- **The separation is in the inlier count, not in the residual.** A step
  from refuse-all at n ≤ 10 to refuse-none at n ≥ 11, a minimum of 11
  inliers with the RMS unconstrained, is one separating L.
  - The margin is one inlier on the shipped target (its fewest right, 11,
    against the gross fits' most, 10) and two on M2's.
  - The tracker's `minTrackedPatches` is 8 (`tracker.ts`, line 252).
- **Right fits by inlier count near the boundary,** both targets and both
  views:

  | inliers | right fits | their largest RMS | gross fits | their smallest RMS | non-gross wrong fits |
  |---|---|---|---|---|---|
  | 8 | 0 | – | 4 | 0.424 | 5 (RMS 0.227–0.283) |
  | 9 | 0 | – | 1 | 0.539 | 0 |
  | 10 | 0 | – | 3 | 0.509 | 0 |
  | 11 | 11 | 0.296 | 0 | – | 2 |
  | 12 | 9 | 0.317 | 0 | – | 6 |
  | 13 | 11 | 0.370 | 0 | – | 3 |
  | 14 | 11 | 0.370 | 0 | – | 0 |

  The script prints every count, 8 to 58.
- **The sixteen, against every separating L,** both targets and both views:
  - 0 are refused by every separating L;
  - 11 are passed by every one: they have 11 to 13 inliers and lie among the
    right fits' RMS;
  - 5 are decided by the choice of L: the five `roll +5°` fits, on 8
    inliers.

## C2: the scale change one step implies

The quantity is |ln s|, s = √|det J| of H_fit · H_prev⁻¹ at H_prev's image
of the target centre.

### (i) Held lock: H_prev = the view's exact H

| set | n | p50 | p99 | max | min |
|---|---|---|---|---|---|
| right fits | 1,575 | 0.000128 | 0.001248 | 0.002742 | |
| gross fits | 8 | 0.02998 | | 0.03543 | 0.02717 |
| the sixteen | 16 | 0.002835 | | 0.004330 | 0.002236 |

| right fits read | interval for τ (refuse when \|ln s\| > τ) | width | ratio | the sixteen at the tightest τ |
|---|---|---|---|---|
| both targets, both views | [0.002742, 0.02717) | 0.02443 | 9.91 | 10 refused, 6 passed |
| view 0 | [0.002469, 0.02740) | 0.02493 | 11.1 | 8 refused, 1 passed |
| view 1 | [0.002742, 0.02717) | 0.02443 | 9.91 | 6 refused, 1 passed |
| shipped only, both views | [0.001989, 0.02717) | 0.02518 | 13.7 | 16 refused |
| M2's 64 only, both views | [0.002742, 0.02717) | 0.02443 | 9.91 | 10 refused, 6 passed |

- **The bounds.** The largest right value is M2's `scale x1.08` (seed 1,
  view 1, 12 inliers). The smallest gross value is `scale x1.1` at seed 2,
  view 1, 9.400 px off.
- **Separation:** pooled and per view, on each target, with a factor of
  about 10 between the bounds. The right side is the fit's own error with no
  motion between frames, since a held lock's previous pose is exact here.
  On the device, real motion adds to it (below). Measured on these gross fits, they imply a
  step of 2.8% to 3.6% in scale against the exact pose. The sixteen sit at
  0.0022 to 0.0043, around the right fits' maximum (0.002742): ten above it
  and six below it, pooled. None is refused at every τ in the interval.
- **Margins:** the right side is set by M2's patches (0.002742; the shipped
  target's own is 0.001989), and the wrong side by the eight.

### (ii) First step after a detection: H_prev = about(E, H)

| set | n | p50 | p99 | max | min |
|---|---|---|---|---|---|
| right fits | 1,575 | 0.000136 | 0.07469 | 0.07756 | |
| gross fits | 8 | 0.06654 | | 0.07790 | 0.06314 |

- **No single τ separates, in any scope.** Pooled, the largest right value
  is 0.07756 (shipped, seed 1, view 1, `scale /1.08`, 12 inliers). The
  smallest gross is 0.06314 (seed 2, view 0, `scale x1.1`, 7.108 px off).
  The width is −0.01442.
  - At τ just below 0.06314, 21 right fits are refused.
  - At τ = 0.07756, 7 of the 8 gross fits pass.
  - Per view and per target there is no interval either; the counts differ
    (the script's table).
- **The cost a scale bound pays on first steps, measured.** A right fit from
  a scale prediction implies its prediction's scale, by construction:

  | prediction | ln f | right fits | their \|ln s\| |
  |---|---|---|---|
  | ×1.02, /1.02 | 0.01980 | 20, 20 | 0.01932–0.01983, 0.01965–0.02026 |
  | ×1.04, /1.04 | 0.03922 | 20, 20 | 0.03862–0.03891, 0.03894–0.03949 |
  | ×1.06, /1.06 | 0.05827 | 14, 16 | 0.05683–0.05738, 0.05789–0.05858 |
  | ×1.08, /1.08 | 0.07696 | 9, 12 | 0.07422–0.07490, 0.07615–0.07756 |
  | ×1.10, ×1.12 and reciprocals | 0.0953, 0.1133 | 0 | – |

  The gross fits, all from `scale x1.1` and `scale x1.12` predictions,
  imply against their predictions:
  - seven at 0.06314 to 0.06814, between the right fits from ±6%
    predictions (at most 0.05858) and those from ±8% (at least 0.07422),
    where no right fit lies;
  - one at 0.07790 (`scale x1.12`), above every right fit.

  So the gross fits imply less scale change than the right recoveries from
  ±8% predictions. No upper τ separates because those 21 right fits, 12 from
  `scale /1.08` and 9 from `scale x1.08` at 0.07422 to 0.07756, all lie above
  the smallest gross value. Every τ that refuses all eight refuses them too.

## C3: #104's signal read as a change

The quantity is ΔE = E(H_fit) − E(H_prev), E as #160 computes it:
E = max(|d_scale|, |d_orth|) of K⁻¹H. It is read in both readings, signed
(refuse when ΔE > τ) and absolute (refuse when |ΔE| > τ). In reading (i)
E(H_prev) is the view's baseline: 0 on view 0 and 0.03126 on view 1 under
the record's K.

### At 60°, the record's K

| reading, form | both targets, both views | view 0 | view 1 | shipped only | M2's 64 only | the sixteen at the tightest τ, pooled |
|---|---|---|---|---|---|---|
| (i), signed ΔE | [0.003526, 0.01048), width 0.006953, ratio 2.97 | [0.003526, 0.01564), 0.01211 | [0.001388, 0.01048), 0.009091 | [0.002936, 0.01048) | [0.003526, 0.01048) | 9 refused, 7 passed |
| (i), \|ΔE\| | [0.004897, 0.01048), width 0.005581, ratio 2.14 | [0.003526, 0.01564), 0.01211 | [0.004897, 0.01048), 0.005581 | [0.002936, 0.01048) | [0.004897, 0.01048) | 8 refused, 8 passed |
| (ii), signed ΔE | [0.003803, 0.01564), width 0.01183, ratio 4.11 | [0.003526, 0.01564), 0.01211 | [0.003803, 0.01666), 0.01286 | [0.003564, 0.01564) | [0.003803, 0.01564) | 8 refused, 8 passed |
| (ii), \|ΔE\| | [0.006741, 0.01564), width 0.008897, ratio 2.32 | [0.003526, 0.01564), 0.01211 | [0.006741, 0.01666), 0.009922 | [0.006741, 0.01564) | [0.005002, 0.01564) | 16 passed |

- **Pooled over both views, one threshold separates, in all four forms.**
  #160's level form did not do this: there, the pooled interval was empty,
  with a width of −0.01701.
- **Under (i), signed:**
  - The right side is set by view 0's largest right E (0.003526, M2's
    `scale x1.08`), now above view 1's right fits once its baseline is
    subtracted (at most 0.001388).
  - The wrong side is set by view 1's `scale x1.12` gross fit (ΔE 0.01048,
    E 0.04174 less the baseline 0.03126).
  - This is the comment's conjecture, "a wrong fit does not raise the level,
    it steps over it", holding pooled at 60°.
- **The absolute form costs margin under (i).** View 1's right fits lie on
  both sides of the baseline (E 0.02636 to 0.03265 about 0.03126). So |ΔE|
  reaches 0.004897 on the low side, against 0.001388 signed.
- **Under (ii)** the baseline is each fit's own prediction's E. On view 1
  that moves the smallest gross ΔE from 0.01048 under (i) to 0.01666. The
  smallest gross value pooled is view 0's 0.01564, as in #160.

### Under three fields of view, pooled and per view, both targets

| reading | form | fov | pooled: largest right, smallest gross, width | view 0 | view 1 |
|---|---|---|---|---|---|
| (i) | signed | 45° | 0.003541, 0.01381, **0.01027** | 0.02475 | 0.01245 |
| (i) | signed | 60° | 0.003526, 0.01048, **0.006953** | 0.01211 | 0.009091 |
| (i) | signed | 90° | 0.003516, −0.007789, **−0.01130 (none)** | 0.006698 | −0.009193 (none) |
| (i) | \|ΔE\| | 45° | 0.005584, 0.01381, **0.008231** | 0.02475 | 0.008231 |
| (i) | \|ΔE\| | 60° | 0.004897, 0.01048, **0.005581** | 0.01211 | 0.005581 |
| (i) | \|ΔE\| | 90° | 0.004359, 0.004455, **0.0000959** | 0.006698 | 0.0000959 |
| (ii) | signed | 45° | 0.005147, 0.02354, **0.01839** | 0.02475 | 0.01839 |
| (ii) | signed | 60° | 0.003803, 0.01564, **0.01183** | 0.01211 | 0.01286 |
| (ii) | signed | 90° | 0.004217, −0.005651, **−0.009868 (none)** | 0.006698 | −0.009868 (none) |
| (ii) | \|ΔE\| | 45° | 0.01234, 0.02354, **0.01120** | 0.02475 | 0.01120 |
| (ii) | \|ΔE\| | 60° | 0.006741, 0.01564, **0.008897** | 0.01211 | 0.009922 |
| (ii) | \|ΔE\| | 90° | 0.004896, 0.002626, **−0.002270 (none)** | 0.006698 | −0.002270 (none) |

- **At 45° and 60°, every form separates pooled.**
- **At 90°, the signed form fails in both readings, on view 1,** as the
  comment says. The second view's gap is negative: −0.009193 under (i),
  which is #160's level-form gap at 90° to the digit, as a constant shift
  must give. #160 prints it as its pooled 90° gap; it equals view 1's
  because both extremes there are view 1's. A gross fit's E there falls *below* its view's baseline (the
  smallest gross ΔE is −0.007789).
- **The fov-90° view-1 case, as found:**
  - The absolute form under (i) separates there, by 0.0000959: largest right
    0.004359, smallest gross 0.004455, a ratio of 1.022. That is a positive
    width and not a tie at the four figures printed, and it is the thinnest
    margin in this document.
  - Under (ii) the absolute form fails at 90° (width −0.002270).
  - So at 90° the form that separates is the one whose sign was discarded,
    because the gross fit's step went down.
- **K's focal length is the input the sweep does not define** (#160, "Where
  K comes from"). This table is how much of C3 rests on it.

### The blindness the comment names

It is a property of the form, stated from its definition and not measured
here. ΔE reads E(H_fit) against E(H_prev), so a fit whose E stays at the
same wrong level from step to step reads ΔE ≈ 0, and is passed by any τ.
The sweep has no sequence in which to show it: each step starts from a
prediction built on the exact H.

## The real steps: the committed tracking exports

### Which frames, and the fields that say so

Every committed export in `docs/benchmarks/` whose `mode` is `"tracking"` is
read: 57 exports, listed by name and SHA-256 in the script's output. A step
is a pair of consecutive frames meeting all of these:
- both have `state` `"TRACK"`;
- both have corners;
- the second is later in media time (a loop wrap is the clip's, not a step);
- the second was not posed from a consumed detection (`detectionUse`
  `"consumed"`: no such pair occurred).

The fields:

- **`state`:** written by `examples/js/bench-frames.mjs`, line 135, `state:
  tracker ? result.state : …`, which is NftTracker's own `result.state`.
  `"TRACK"` is "a `"TRACK"` result from a step that held" (`tracker.ts`,
  line 896). `DEFINITIONS` defines it only through the summary key `states`
  (line 66: "Frames per state. NftTracker's result.state; …"), and through
  `firstSteps` and `heldLockSteps` (lines 77 to 80). Of those,
  `heldLockSteps` reads: "Tracking steps that follow a TRACK frame: a held
  lock's". So a step between two TRACK frames is a held lock's step: reading
  (i)'s case, not (ii)'s.
- **`tracking`:** written at line 138, `tracking: tracker && result.tracking
  ? { ...result.tracking } : null`, the step's `TrackStats` (inliers,
  rmsError, …). All 25,658 TRACK frames read carry it, with an RMS.
- **`corners`:** written at line 145, `corners: result.ok ?
  reprojectCorners(result.H, targetPoints) : null`. These are the target's
  corners `(0, 0), (w − 1, 0), (w − 1, h − 1), (0, h − 1)` under the frame's
  H (`reprojectCorners`, lines 59 to 73; `targetCorners`, lines 42 to 49;
  `DEFINITIONS.corners`, line 99). Four points fix a homography, so the
  script recovers each frame's H from them up to scale. It checks the
  recovered H reprojects all four corners to 10⁻⁶ px (fatal). The corners
  are stored at full precision.
- **`processingResolution`:** written by `examples/bench-nft.html`, line 1749,
  from `lastProcessingResolution`, set at line 1330 to the probed processing
  frame's size, "what `detect` actually sees". It is the size `intrinsics`
  is called with there (line 1331). It is the K used here: `intrinsics(w, h)`
  at the default 60°.
- **Finding:** `DEFINITIONS` (`bench-definitions.mjs`, from line 64) has no
  entry for the per-frame `state`, `tracking` or `processingResolution`.
  They are recorded here, as the brief asked, and not added.

**#137, and what these steps are.** Only TRACK-to-TRACK steps are read. The
wrong detections with flipped poses #137 found are DETECT frames, which no
step here touches. But the exports carry no ground truth. A TRACK frame is an
accepted step, and `tracker.ts` (lines 96 to 97) says a wrong pose "is
returned as `"TRACK"` meanwhile". So these distributions are of accepted
steps, right or wrong, not of true motion.

### C2 and C3: per clip

The quantities are |ln s| at the target centre's image in frame t − 1, and
|ΔE| under each export's own K. Each count of steps "at or above" is against
the smallest gross value under each reading:
- |ln s|: 0.02717 (i), 0.06314 (ii);
- |ΔE| at 60°: 0.01048 (i), 0.01564 (ii).

| clip | exports | TRACK frames | steps read | \|ln s\| p50, p99, max | at or above (i), (ii) | \|ΔE\| p50, p99, max | at or above (i), (ii) |
|---|---|---|---|---|---|---|---|
| `pinball-bench-table.mp4` (hand-held, table) | 14 | 3,920 | 3,692 | 0.006245, 0.02344, 0.1013 | 20, 5 | 0.001418, 0.008821, 0.07705 | 26, 13 |
| `pinball-bench.mp4` (hand-held, wall) | 19 | 4,778 | 4,319 | 0.006021, 0.02388, 0.2196 | 38, 20 | 0.001845, 0.03970, 0.2908 | 249, 146 |
| `pinball-static.mp4` | 23 | 16,660 | 16,560 | 0.0001846, 0.001286, 0.001976 | 0, 0 | 0.0001595, 0.001111, 0.003540 | 0, 0 |
| webcam | 1 | 300 | 299 | 0.001373, 0.01314, 0.02212 | 0, 0 | 0.0003688, 0.001803, 0.003891 | 0, 0 |

- **Steps excluded:**
  - none for missing corners or for a consumed detection;
  - 77 on the static clip for not moving forward in media time, its loop
    wraps.

  The per-export figures are in the script's output.
- **The steps at or above the smallest gross value, by the inliers of frame
  t's step and by whether the lock held for the next two frames.** The last
  column counts the steps on more than 10 inliers whose next two frames are
  both TRACK.

  | clip | quantity, reading | at or above | on a step with at most 10 inliers | followed by a frame not TRACK within two | more than 10 inliers, both next frames TRACK |
  |---|---|---|---|---|---|
  | table | \|ln s\| (i) | 20 | 1 | 6 | 13 |
  | table | \|ln s\| (ii) | 5 | 0 | 0 | 5 |
  | table | \|ΔE\| (i) | 26 | 1 | 4 | 21 |
  | table | \|ΔE\| (ii) | 13 | 0 | 2 | 11 |
  | wall | \|ln s\| (i) | 38 | 28 | 25 | 7 |
  | wall | \|ln s\| (ii) | 20 | 20 | 20 | 0 |
  | wall | \|ΔE\| (i) | 249 | 68 | 53 | 161 |
  | wall | \|ΔE\| (ii) | 146 | 52 | 44 | 79 |

  - **The wall clip's largest steps recur at the same media times across
    exports:**
    - 7.946 → 7.987 s, |ln s| 0.219 to 0.220 and |ΔE| 0.290 to 0.291, six
      times in five exports, each on an 8-inlier step and each followed by
      DETECT or LOST;
    - two consecutive steps, 10.796 → 10.876 s (|ln s| 0.127, on 8 inliers)
      and 10.876 → 10.957 s (0.145, on 9), often followed by DETECT or LOST.
  - **Steps at the bound with many inliers that keep the lock:** the table
    clip's 6.733 → 6.833 s, |ln s| 0.029 on 55 inliers with the next two
    frames TRACK. Others sit at 28 and 32 inliers. The same media times in
    another export carry 56 inliers, but there the next frame is TRACK and
    the one after DETECT. The script lists every step at or above
    0.02717 under (i), with its next two states.
  - That the first group are wrong fits and the second right ones is a
    **conjecture**, from inliers and lock loss. The exports cannot decide
    it.

### C1: the TRACK frames' own fits

Each TRACK frame's step is read through `tracking.inliers` and
`tracking.rmsError`. The counts are read at both ends of the sweep's
intervals:
- above the largest right value (RMS 0.3906, ρ(n) 0.4444), the most a
  separating τ could refuse;
- at or above the smallest gross value (RMS 0.4236, ρ(n) 0.5991), what every
  separating τ refuses. C2 and C3 are read at this end.

They are also read against the gross fits' largest inlier count (10).
`n_eff` is not exported, so ρ(n_eff) is not read on the exports.

| clip | TRACK frames | inliers min, p1, p50 | at most 10 inliers | RMS p50, p99, max | RMS above 0.3906, at or above 0.4236 | ρ(n) above 0.4444, at or above 0.5991 |
|---|---|---|---|---|---|---|
| table | 3,920 | 8, 11, 36 | 37 | 0.2541, 0.5434, 0.6000 | 296, 207 | 259, 54 |
| wall | 4,778 | 8, 9, 32 | 189 | 0.2375, 0.5740, 0.5991 | 436, 345 | 423, 154 |
| static | 16,660 | 13, 26, 40 | 0 | 0.1948, 0.2343, 0.4583 | 5, 5 | 5, 0 |
| webcam | 300 | 19, 27, 56 | 0 | 0.3289, 0.4059, 0.4879 | 4, 3 | 3, 0 |

On the device, the accepted steps' residuals reach well past the sweep's
right fits: the hand-held clips' 99th percentile is 0.54 to 0.57 px, against
the sweep's right maximum of 0.39. That some of those frames are wrong is a
**conjecture**, from the steps above. How many is not known, since nothing
here can label a device frame.

## Summary

Each cell gives the one-τ interval [largest right, smallest gross), its
width and, after the bar, where the sixteen fall at the tightest τ. Where no
interval exists, it gives the measured reason. ΔE is at 60°. The script
prints every cell on each target separately; the cells below read both
targets' right fits.

| candidate | form | pooled, both views | view 0 | view 1 | the sixteen (pooled) |
|---|---|---|---|---|---|
| reference | RMS | [0.3906, 0.4236), 0.03305 | [0.3906, 0.4236) | [0.3674, 0.4449) | 16 passed |
| C1a | ρ(n) | [0.4444, 0.5991), 0.1547 | [0.4444, 0.5991) | [0.4415, 0.6291) | 16 passed |
| C1a | ρ(n_eff) | [0.4461, 0.6061), 0.1599 | [0.4461, 0.6061) | [0.4432, 0.6374) | 16 passed |
| C1b | a non-decreasing L(n) | one exists: right fits ≥ 11 inliers, gross ≤ 10, for example a minimum of 11 inliers | same | same | 11 passed by every separating L, 5 decided by L |
| C2 | (i) \|ln s\| | [0.002742, 0.02717), 0.02443 | [0.002469, 0.02740) | [0.002742, 0.02717) | 10 refused, 6 passed |
| C2 | (ii) \|ln s\| | none: 0.07756 ≥ 0.06314; 21 right refused or 7 gross passed | none | none | – |
| C3 | (i) signed ΔE | [0.003526, 0.01048), 0.006953 | [0.003526, 0.01564) | [0.001388, 0.01048) | 9 refused, 7 passed |
| C3 | (i) \|ΔE\| | [0.004897, 0.01048), 0.005581 | [0.003526, 0.01564) | [0.004897, 0.01048) | 8 refused, 8 passed |
| C3 | (ii) signed ΔE | [0.003803, 0.01564), 0.01183 | [0.003526, 0.01564) | [0.003803, 0.01666) | 8 refused, 8 passed |
| C3 | (ii) \|ΔE\| | [0.006741, 0.01564), 0.008897 | [0.003526, 0.01564) | [0.006741, 0.01666) | 16 passed |

At 90° of field of view, C3's signed forms and (ii)'s absolute form have no
pooled interval, and (i)'s absolute form has one of width 0.0000959 (the
table above).

## Stage 1's two answers, per candidate

Each answer is the two questions of Stage 1:
- **Responsiveness:** does the candidate separate the gross fits from the
  right ones on the sweep?
- **Expressibility:** do the committed clips leave room for the bound?

No verdict on adoption is drawn.

- **C1, the limit scaled by the inlier count.**
  - **Responsiveness:** yes. Both forms of 1a separate in every scope, and
    under 1b a separating non-decreasing limit exists on each target and on
    both. But 1b shows the separation is carried by the inlier count alone:
    no right fit has fewer than 11, no gross fit more than 10. So on this
    sweep a bare minimum of 11 inliers separates, and so does the unscaled
    RMS set in [0.3906, 0.4236).
  - **Expressibility:** the hand-held clips hold TRACK frames that a bound
    set from the sweep would refuse. The counts are given at both ends of
    each interval: every separating τ refuses the second figure, and none
    refuses more than the first.
    - 37 (table) and 189 (wall) frames have at most 10 inliers;
    - RMS: 296 and 436 above the largest right value, 207 and 345 at or
      above the smallest gross value;
    - ρ(n): 259 and 423 above the largest right value, 54 and 154 at or
      above the smallest gross value.

    The sweep's right fits do not cover the device's residuals, and the
    exports cannot say which of those frames are right.
- **C2, the scale change one step implies.**
  - **Responsiveness:** under (i), the held lock, yes, by a factor of about
    10 (pooled [0.002742, 0.02717)). Under (ii), the first step, no, in any
    scope. A right first step implies its prediction's scale by
    construction. The 21 right fits from ±8% predictions (0.07422 to 0.07756)
    lie above seven of the eight gross fits (0.06314 to 0.06814), and the
    eighth (0.07790) lies above them all.
  - **Expressibility:** the steps the exports read are held-lock steps, so
    (i) is the reading they test. The hand-held clips' 99th percentiles,
    0.0234 and 0.0239, sit below the interval's top. But 20 (table) and 38
    (wall) steps reach or pass 0.02717, up to 0.10 and 0.22. Of those, 13
    and 7 are on more than 10 inliers with the lock held for the next two
    frames: these are the steps a bound refusing every gross fit would also
    refuse, unless they are wrong.
- **C3, the signal read as a change.**
  - **Responsiveness:** pooled over both views, yes at 45° and 60° in all
    four forms, which the level form could not do. At 90° the signed forms
    fail in both readings, and the absolute form holds under (i) by
    0.0000959 and fails under (ii). Blind by definition to a steadily badly
    conditioned fit.
  - **Expressibility:** under (i), 26 (table) and 249 (wall) steps reach or
    pass 0.01048, of which 21 and 161 are on more than 10 inliers with the
    lock held for the next two frames. The wall clip's 99th percentile,
    0.0397, is above it; the table's, 0.0088, is below it. The static clip
    and the webcam stay below 0.0039.

## What each candidate would need to be registered (Stages 2 and 3)

If the maintainer chooses one, these are what the protocol would ask of it.
None is done here.

- **Stage 2, the covariates that could invert the sign of the effect:**
  - **For C1:**
    - the device's inlier distribution on TRACK frames;
    - the render model behind the sweep's residuals against the device's:
      the sweep's right fits reach 0.39 px, while accepted device steps
      reach 0.6.
  - **For C2:**
    - which step type the bound reads. Held lock and first step give
      opposite answers on the sweep;
    - the motion per processed frame, which a worker run's schedule
      changes.
  - **For C3:**
    - K's focal length, which turns the signed form's pooled answer from yes
      at 60° to no at 90°;
    - the view's own baseline, the second view's perspective;
    - the step type again.

  Each covariate needs to be computed per frame and reported per clip. For
  the device clips, that needs a label for right and wrong that the exports
  do not have.
- **Stage 3, criteria and a prediction refutable both ways,** registered in
  their own commit before any implementation:
  - the chosen form and reading, and the scope (per view or pooled);
  - the threshold, with its derivation from the interval above;
  - on the sweep: all eight gross fits refused and none of the 1,575 right
    fits refused, which this probe says is reachable for every candidate but
    C2 (ii);
  - on the device: the TRACK frames or steps it would refuse, named, with
    what would refute the prediction there;
  - #92's own condition (its body, "What it must not do"): that it "must
    move them in the good direction only".

## Determinism and the guards

- **Two runs, byte-identical.** The script was run twice at `00e3821` with
  the command above. Both stdouts were 318,178 bytes, SHA-256
  `f2278d65a27b238f51591c839ca947d1bff010d1cfce4d87154acc81537462a2`. The
  script is 54,670 bytes, SHA-256
  `26abae2d0e80d3815f1fa2e2eeeb759828ddd3cebf7d67eecd177d90403c580c`. Each
  run took about 22 s. The step is deterministic, as #160 says: the renders
  draw from `mulberry32(seed)`, `trackFrame` draws nothing, and the exports
  are read in name order.
- **Every check this file adds, exercised on the failing side,** with four
  of the copied driver's.
  - **How:** each was run on a scratch copy of the script outside the
    repository, pointed at the worktree with `WEBARKIT_ROOT`, with one check
    altered. The harness refused any alteration whose text did not occur
    exactly once in the script.
  - **What must happen:** each altered copy must exit 1, naming what
    disagrees on stderr, with nothing on stdout. The unmodified copy must
    exit 0, and its output differed from the in-repository run on one line
    only: the provenance line, which prints the root it was pointed at
    instead of "this checkout".
  - **Clean-up:** the copies were deleted afterwards and their absence
    confirmed. The in-repository script was compared before and after and
    was unchanged.
  - **Input checks:** the committed exports cannot be edited. So each of
    these is exercised by altering its predicate until it fires on the real
    data, which shows the check stops the run, not that a malformed export
    exists.
  - **The driver's other checks** are its K checks, the record's view-1
    figures, the prediction count, a misnamed path or root, the degenerate
    column and the fewest-inliers pin. #160's record exercised them on the
    same lines ("Determinism and the guards"). The driver's remaining guards,
    which neither record exercised, are:
    - the imports' being functions, and the fixture's shapes;
    - the target's decode and patch count;
    - the defaults' export;
    - the 1,370-step and right + wrong + refused totals.

  | copy | what was changed | exit | stdout | stderr, the `fatal:` line |
  |---|---|---|---|---|
  | unmodified | nothing | 0 | 318,285 bytes: the in-repository 318,178 with "this checkout" replaced by the worktree's path | none |
  | a wrong hash | the last digit of `track_frame.test.ts`'s recorded hash | 1 | empty | `packages/nft-tracker/test/tracking/track_frame.test.ts: sha256 cc6c70bc…2973, not the record's cc6c70bc…2974` |
  | step 0, a count | M2's 787 → 788 | 1 | empty | `step 0: M2's 64 patches 787 right, 24 wrong; the record says 788 and 24` |
  | step 0, the real refusal | `minTrackedPatches` one below the default: the driver genuinely not the sweep | 1 | empty | `step 0: shipped target 788 right, 1 wrong; the sweep pins 788 and 0` |
  | the gross label | its error floor 7.05 → 7.2 px | 1 | empty | `7 wrong fits match the record's description of the gross eight, not 8` |
  | the driver's identity, a hash | #160's K-block hash, last digit | 1 | empty | `the driver is not #160's: its K block hashes to 95d25eac…0f4a, #160's to 95d25eac…0f4b` |
  | the driver's identity, a genuine change | the two targets swept in the other order | 1 | empty | `the driver is not #160's: its step0 block hashes to bff9ec18…680f, #160's to 9aea81b4…e3e6` |
  | the driver's identity, a change it cannot see | the renders' bias 10 → 11 | 0 | the unmodified copy's, byte for byte | none: see below |
  | positive weights | the comparison with `stats.inliers` off by one | 1 | empty | `a fit has 39 positive weights and stats.inliers 39` (the message prints the unaltered values, so it reads as agreement; the comparison it reports on is the altered one) |
  | n_eff | the bound on 2·n_eff raised a hundredfold | 1 | empty | `a fit's n_eff is 38.79831710964205: 2 n_eff − 8 is not positive and the heuristic is undefined` |
  | ΔE at 60° against #160's E | 10⁻⁹ added to #160's side | 1 | empty | `ΔE at 60° disagrees with #160's E` |
  | K at 60° | the record's K's focal length moved by 1 | 1 | empty | `intrinsics(270, 360, 60) is not the record's K` |
  | each prediction affine | `E[8] === 1` → `=== 2` | 1 | empty | `prediction none is not affine` |
  | the Jacobian, known scales | the expected scale multiplied by 1.001 | 1 | empty | `prediction none: ln s 0, its own scale's 0.0004997501665417116` |
  | the Jacobian, central differences | the difference quotient's step 2h → 2.1h, in the numeric form only | 1 | empty | `a step's Jacobian: closed form 1, central differences 0.9523809523792199` |
  | the Jacobian, the chain rule | evaluated at the target-space centre instead of H_prev's image of it | 1 | empty | `a step's ln s is 0.0015224331830064955 at P's image of the centre, 0.0001648245331720144 by the chain rule at the centre` |
  | the Jacobian, the closed form's projective term | one sign flipped, which both the numeric and the chain-rule checks can see | 1 | empty | `a step's ln s is 2.2204460492503126e-16 at P's image of the centre, 0.0006970168866115012 by the chain rule at the centre` |
  | a step's determinant | finite and non-zero → above 10 | 1 | empty | `a step's Jacobian has determinant 1` |
  | the four-point solve's pivot | 10⁻¹² → 10¹² | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json, frame 0: the four corners do not fix a homography` |
  | the four-corner homography | its reprojection tolerance 10⁻⁶ → 10⁻³⁰ px | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json, frame 0: the recovered H misses corner 1` |
  | malformed corners | the corner count 4 → 5 in the shape check | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json, frame 0: malformed corners` |
  | an export not JSON | `"x"` appended before parsing | 1 | empty | `2026-09-19-laptop-stateless-pinball-bench-table.json: not JSON` |
  | a tracking export without frames | the predicate inverted | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json: a tracking export without frames` |
  | no processingResolution | width > 0 → > 100000 | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json: no processingResolution` |
  | no target size | width > 1 → > 100000 | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json: no target size` |
  | no clip | the predicate inverted | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json: no clip` |
  | a frame without state | the predicate inverted | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json, frame 0: no state` |
  | a TRACK frame without its step's fit | the inlier count read off-integer | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json, frame 0: a TRACK frame without its step's inliers and rmsError` |
  | a step without media time | the predicate inverted | 1 | empty | `2026-09-26-oppo-a72-ondevice-tracking-static.json, frame 1: no media time` |
  | no tracking export read | the predicate inverted | 1 | empty | `no tracking export read` |

  - **The bias row.** The renders apply it (`warped_frames.ts`, line 234),
    but the tracking step estimates a gain and a bias per patch
    (`DEFAULT_PHOTOMETRIC = true`, `tracker.ts`, line 209). A uniform +1 is
    absorbed, and no printed figure moves. So the alteration is not a change
    the output can show, and the identity check, which reads what the driver
    prints, rightly passes it. It was kept in the table because it bounds
    what that check can see: a driver change that moves no printed figure of
    the three blocks passes. The targets' order is a genuine change that
    does move one.
  - **The projective-term row** is caught by the chain-rule check, not the
    numeric one. The mutated closed form is also what the chain rule reads,
    and on the known-scale cases of view 1 the two disagree before any
    projective fit reaches the numeric comparison. That is why the numeric
    check has its own row, a mutation of the difference quotient that the
    chain rule does not read. It was run singly, after the harness's other copies,
    in the same way.
  - **Sizes are in bytes.** A first run of the harness counted characters,
    which this output, full of `…`, `×` and `→`, does not equal. The table
    is from a rerun that counts bytes, on the script as committed.

## Independent: a reviewer's read

As the protocol requires of figures that gate a decision, a fresh session
read both files and the sources at `00e3821` before the commit. It was told
to refute rather than confirm, and to edit nothing. What it did and found:

- **What it reproduced:**
  - its own run's stdout and the script's hash, as stated at the time;
  - #160's rerun hash;
  - the three identity blocks' hashes in both stdouts;
  - the driver diff, one line;
  - the 77 not-forward pairs, all loop wraps;
  - the consumed-detection exclusion, which never fires because a consumed
    TRACK frame never follows a TRACK frame;
  - one guard row, the central-difference sign, by its own copy.
- **What it compared:** about 400 figures in the document against the
  stdout, all of which matched, and about 45 citations by file, line or
  issue.
- **Four important findings, all applied before the commit:**
  - **C2 (ii):** the claim that the gross fits' implied steps lie inside the
    band of the right ±8% recoveries was false. They lie between the ±6% and
    ±8% bands, and one above both. The mechanism sentence built on it was
    removed. The section now states the figures.
  - **C1b:** "any non-decreasing limit works" read as "every". It now reads
    as existence: a separating non-decreasing limit exists, such as a
    minimum of 11 inliers. Today's 0.6 is non-decreasing too, and separates
    nothing.
  - **The guards:** "every check exercised" claimed more than was done:
    by the reviewer's count, seven of about twenty-one added checks. Every check this file adds now
    has its row, and the driver's checks are accounted for as above.
  - **C1's device counts** were read at the interval's bottom, while C2's
    and C3's are read at its top. The script now prints both ends, and the
    record gives both.
- **One minor finding that changed the script:** no check saw where the
  Jacobian is evaluated. A copy evaluating it at the target-space centre
  exited 0 and moved C2 several-fold. The chain-rule check was added, and it
  has its row above.
- **The other minor findings, applied:**
  - two line citations (README lines 5134 and 5135; #160's driver at this
    script's lines 108 to 396);
  - the eight hashed paths;
  - two lines added to "What was read";
  - one unlabelled conjecture now labelled;
  - the 56-inlier step, which did not keep the lock by the two-frame rule,
    taken out of that group;
  - two consecutive steps no longer merged;
  - #160's pooled 90° gap noted as view 1's;
  - the held-lock right side noted as motion-free;
  - two wording fixes.
- **What it set aside, and why:**
  - the readings and the heuristic, which are the maintainer's re-rulings;
  - the older exports' corner convention, under which |ln s| is invariant
    and ΔE moves by well under 10⁻³;
  - the bias row, which it judged a disclosure and not a defect.

Every figure and hash in this document is from the script as committed,
after those changes. The stdout and script hashes above are the final ones,
not the ones the reviewer checked.

## What this probe does not decide

- **Which candidate, which form, which reading, and the threshold.** These
  are the maintainer's. No value here is proposed, and the intervals are
  reported as intervals.
- **Whether the sixteen non-gross wrong fits must be refused.** Nothing in
  the record says so; where each falls is reported.
- **Which device frames are wrong.** The exports carry no ground truth. The
  conjectures above (8-inlier steps followed by lock loss) are labelled as
  conjectures.
- **The blindness of C3**, which is stated from the definition and not
  measured.
- **Whether a threshold derived at the sweep's K transfers to a device's.**
  The field-of-view table measures how much C3 depends on it, not the
  transfer.

## Constraints kept

- **Synthetic, plus a read of committed exports.** No device run, no
  bench-page run, no replay. No committed export was edited.
- **No frozen input changed.** No file under `packages/*/src/` changed. The
  seven ground-truth files and the target are hash-checked on every run.
  `examples/targets/pinball.wnft` was read and not recompiled.
  `fixtures/nft-target/` was untouched.
- **Records unchanged:** `docs/benchmarks/README.md`, `step-protocol.md`
  and #160's two files.
- **Issues untouched:** no issue was opened, edited, closed or commented on.
- **The two files** are this document and its script, on
  `docs/92-stage1-weighing`, off `dev` at `00e3821`.
