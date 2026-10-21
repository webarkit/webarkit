# #104, Stage 1 probe: the threshold derivation from #90's sweep, on the shipped target and on M2's 64 patches (2026-10-21)

**A Stage 1 probe under [the step protocol](./step-protocol.md), run on
2026-10-21, synthetic throughout: no device run, no bench-page run, no
replay of a bundled clip, no export read. It derives `d_scale` and `d_orth`
on every fit [#90](https://github.com/webarkit/webarkit/pull/90)'s sweep
produces, on the shipped target and on M2's 64 patches, and reports whether
a threshold on them refuses every gross wrong fit and no right fit, in the
two forms the brief named. It implements no part of the signal: no file
under `packages/*/src/` is changed, and the tracker computes neither
quantity. A derivation, not a device measurement; not campaign data; never
reportable as a round. It proposes no value: the threshold is the
maintainer's, and [#104](https://github.com/webarkit/webarkit/issues/104)'s
body requires it recorded, with its derivation, before M4's campaign reads
it.**

The computation is
[`2026-10-21-104-stage1-threshold-derivation.mjs`](./2026-10-21-104-stage1-threshold-derivation.mjs),
which reads the frozen sweep's inputs where they lie, runs the tracking step
on them and writes nothing. Its output is not committed; run it to reproduce
every number here:

```bash
node --experimental-transform-types docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.mjs
```

after `npm ci` and `npm run build` once (the jsfeatNext backend's module,
imported for `intrinsics`, imports the spec's built `dist`). The flag is
explained under "The freeze".

## Step 0: provenance

- **Ref:** `docs/104-stage1-threshold-derivation`, branched from `dev`.
- **HEAD of `dev` at branching: `9fa0ff15a1b454009109cbd427494f36e90846d6`**,
  the merge commit of [#159](https://github.com/webarkit/webarkit/pull/159).
  `git fetch origin` was run first; `origin/dev` was `9fa0ff1`, its last
  three commits `9fa0ff1` (that merge), `8344273` (#159's commit) and
  `b2cdc11` (the merge of #158). The working tree the session opened on was
  on `test/95-two-arm-draws-and-thenable-guard` at `8344273` and clean; the
  work was done in a separate worktree checked out at `9fa0ff1`, and every
  reading below is at that SHA. Node v24.21.0, the pin. `npm ci` and
  `npm run build` were run in that worktree; the build's manifest reads
  HEAD `9fa0ff1`, clean, bundle `d568c8edca35…`, the same bundle hash #153
  records at `1f28fce`. The bundle is not read by this probe; the build is
  needed only because `packages/cv-backend-jsfeatnext/src/jsfeatnext_backend.ts`,
  imported for `intrinsics`, imports two error classes from
  `@webarkit/cv-backend-spec`, which resolves to that package's `dist`.
  `nft-tracker`'s `src` imports only types from the spec.
- **The passages the brief rests on, verified against their sources at that
  commit:**
  1. **The sweep.** `packages/nft-tracker/test/tracking/track_frame.test.ts`,
     lines 642 to 714, the block "trackFrame with the shipped target's
     patches": the committed target decoded, the tracker's exported defaults
     mapped "as its constructor maps them" (`SHIPPED_OPTIONS`, lines 659 to
     675), 137 predictions on two views of five renders (seeds 1 to 5), and
     the assertions `expect(wrong).toEqual([])`, `expect(right.length).toBe(788)`,
     `expect(Math.min(...right)).toBeGreaterThanOrEqual(11)` (lines 710 to
     712). The ground-truth blocks on the same target in
     `tracker_state_machine.test.ts` are at its lines 402 to 488; they are
     the camera-path sequences, not the sweep, and this probe reads nothing
     from them.
  2. **The attested inputs.** `docs/benchmarks/README.md`, "The instrument,
     the subject and the inputs (2026-10-14)", item 3, the table under
     "#90's ground truth" (lines 5116 to 5124): the seven files and their
     SHA-256 at `37dc6d4`. All seven hash to the table's values at
     `9fa0ff1`, and the script checks it on every run (below). The target,
     `examples/targets/pinball.wnft`, hashes to `9e8eb4863b58…`, the value
     every M4 export records as `target.sha256`.
  3. **"788 right fits, no wrong fit, over five renders, in roughly 9 s."**
     The counts are the test's assertions (passage 1). The time is commit
     `679be0a`'s message: "788 right fits, no wrong fit, in about 9 s", and
     the same message says "fails … on M2's 64-patch target (its 24)".
  4. **"Eight gross wrong fits among them."** #104's body, "Relation to
     #92": "The 64-patch target of v0.3.0 accepts eight gross wrong fits on
     #90's sweep". The body does not say "among the 24"; that the eight are
     among the 24 is the record's:
     [`2026-09-29-desktop-tuning-r3.md`](./2026-09-29-desktop-tuning-r3.md),
     "The residual limit's margin", the M2 row of its table: "24, at
     0.226–0.555; the 8 gross ones (7.1–9.4 px off, from `scale x1.1` and
     `scale x1.12`) at 0.424–0.555", and the plan's table under "The gross
     wrong fits belong to the residual limit, not to the patch size"
     (`README.md`, the table at lines 2400 to 2405, its M2 row): "8, 7.1–9.4 px off, at 0.42–0.56 px, from the
     target shrinking by 1.10–1.12".
  5. **The signal.** #104's body, "The signal": `d_scale = ‖b1‖ / ‖b2‖ − 1`
     and `d_orth = b1·b2 / (‖b1‖ ‖b2‖)` with `b1`, `b2` the first two columns
     of `K⁻¹H`, "both 0 for a plane seen by a pinhole camera". Kind E is
     #153's pair, "refuse when |`d_scale`| > τ or |`d_orth`| > τ"
     ([`2026-10-19-104-stage1-effect-size-probe.md`](./2026-10-19-104-stage1-effect-size-probe.md),
     "The exports, the method and the checks", the bullet "The refusal,
     three kinds and two scopes").
  6. **What the threshold's derivation must be, and when it is recorded.**
     #104's body, "What it must show", its third bullet: "Its thresholds
     come with their derivation from the sweep, recorded before M4's
     campaign (step 5) reads them." The brief calls this "item 3"; the
     body's bullets are unnumbered, and it is the third of four. The same
     list's first bullet: "On #90's ground-truth sweep, `d_scale` and
     `d_orth` separate the gross wrong fits from the right ones (788 right
     fits over five renders). The margin must not depend on one patch set:
     the sweep is run on the shipped target and on M2's 64 patches"; its
     second: "It refuses none of today's right fits."
  7. **The view the record says inflates the signal.** `README.md`,
     "#104's state, settled (report, 2026-10-15)": "the sweep's second view
     is not a plane homography for the camera, and the signal reads
     `d_scale` 0.0084 and `d_orth` 0.031 on its exact `H`, so a threshold
     derived on that view would be inflated; the separation has to be shown
     per view." The finding it draws from:
     [`2026-10-14-tab9-m4-calibration-session.md`](./2026-10-14-tab9-m4-calibration-session.md),
     "Four checks that could not distinguish the condition they claim to
     detect": "#90's sweep signal for step 2, `d_scale` and `d_orth`,
     nonzero on correct fits of a view that is not a plane homography for
     the camera (0.0084 and 0.031 on its exact `H`)". Neither names the
     `K` under which those two values were read; passage 8 does.
  8. **K on the sweep's frames.**
     [`2026-10-15-m4-step3-ippe-acceptance.md`](./2026-10-15-m4-step3-ippe-acceptance.md),
     §3 "Inputs, fixed": "**The camera:** `K = intrinsics(270, 360)` of
     `cv-backend-jsfeatnext`, the frozen tests' camera: a 60° horizontal
     field of view, so `f = 135 / tan 30° = 233.83 px`, principal point at
     the frame's centre." And §2 on the sweep's views: "#90's sweep has
     none: its views are built by `view()` from a scale, a roll, a shift and
     two perspective terms, and a homography of that family is in general
     not `K · [r1 r2 t]` for any rigid pose."
  9. **The freeze's rule on reading and reimplementing.**
     `step-protocol.md`, Stage 5, the last entry of the box: "Reading a
     frozen file is not changing it. Running a frozen module read-only is
     not changing it. Reimplementing a frozen metric instead of importing
     it **is** changing it: import the module or stop and report. —
     *Recorded in no file.* A draft pending ratification".

  All nine hold as quoted, with the two wording notes made at passages 4
  and 6. **One ruling in the brief is recorded in no repository file:**
  that the probe may reimplement the sweep's driver, conditional on step 0.
  Its source is the brief itself, the maintainer's; it is applied below
  exactly as conditioned, and the condition is checked by the script
  before any figure is computed.

## What was read, by file and line range

So that a thorough read can be told from a skim. Line numbers are at
`9fa0ff1`.

- `docs/benchmarks/step-protocol.md`, 1 to 441, whole.
- `docs/benchmarks/README.md`: 2378 to 2450 (the gross wrong fits and
  round 3's table); 5085 to 5135 (item 3 of "The instrument, the subject
  and the inputs", with the hash table); 5413 to 5475 ("#104: a joint
  claim, or none", through its 2026-10-16 bullets); 5596 to 5640 ("#104's
  state, settled" and the entries after it); 5670 to 5760 ("#137's fix
  follows the campaign, and what stays open before round 1 of #104"); 5813
  to 5880 (the closing criterion, entries 1 and 2).
- `docs/benchmarks/2026-10-19-104-stage1-effect-size-probe.md`: 1 to 40,
  41 to 268, 573 to 600, 1032 to 1051, 1261 to 1300; its script, 1 to 120
  and 270 to 300. `2026-10-18-137-stage1-probe.md`: its section headings
  only, for the shape. `2026-10-16-104-stage1-probe.md`: 1 to 448, whole.
- `docs/benchmarks/2026-09-29-desktop-tuning-r3.md`, 140 to 175;
  `2026-10-15-m4-step3-ippe-acceptance.md`, 45 to 125;
  `2026-10-14-tab9-m4-calibration-session.md`, 690 to 720;
  `2026-10-15-m4-step3-ippe-c4-characterisation.md`, 318 to 340.
- `packages/nft-tracker/test/tracking/track_frame.test.ts`, 40 to 714
  (everything after the licence header). `tracker_state_machine.test.ts`:
  its `describe` and `it` lines only (211 to 472, by search), to confirm
  that the sweep is not in it.
- `packages/nft-tracker/test/fixtures/warped_frames.ts`, 40 to 316;
  `tracking_target.ts`, 356 to 418; `seeded_rng.ts`, 458 to 530; `pgm.ts`,
  lines 43 and 54 (the fixture URL and `readPgm`'s signature);
  `test/tracking/homography_helpers.ts`, 570 to 754 (read for its
  `planeView`, which the sweep does not use; nothing taken from it).
- `packages/nft-tracker/src/tracking/track_frame.ts`, 179 to 299 (the
  result types and `trackFrame`'s signature); `src/tracker.ts`, the eleven
  `DEFAULT_*` lines (186 to 299, by search); `src/index.ts`, its
  `track_frame` export line (83).
- `packages/cv-backend-jsfeatnext/src/jsfeatnext_backend.ts`, 590 to 612
  (`intrinsics`); jsfeatNext 0.17.0's `pose_estimator.intrinsics` in the
  installed `dist/jsfeatNext.js` (minified: `f = 0.5·w / tan(0.5·fov)`,
  principal point `(0.5·w, 0.5·h)`) and its declaration in
  `types/src/pose_estimator/pose_estimator.d.ts`, 84 to 92.
- `AGENTS.md` and `CLAUDE.md`, whole; #104's body; #90's body and the
  message of its commit `679be0a`.

## The freeze, and how this probe works under it

- **Every attested input is hashed before anything else, and read where it
  lies.** The script hashes the seven files of item 3's table and the
  target, compares each to the record's value, and exits on any mismatch
  (fatal). Nothing is copied: the fixtures (`view`, `renderWarp`,
  `translation`, `rotation`, `scaling`, `mat3Mul`, `mat3Inv`, `project`;
  `pinballPatches`, `PINBALL_STEP`; `readPgm`, `TARGET_FIXTURE`), the
  tracking step (`trackFrame`, `trackTarget`), the codec (`decode`), the
  eleven defaults and `intrinsics` are imported from the TypeScript files
  the tests import them from.
- **How TypeScript is imported without a build of the tests.** Node
  v24.21.0 strips types from a `.ts` file it is asked to import. Two things
  stand in the way, and the script handles both without touching a file.
  The fixtures and `src` write their specifiers as `.js`, as the test
  runner resolves them; a resolve hook (`module.registerHooks`) maps a
  `.js` specifier that fails to resolve, when the importer is a `.ts` file,
  onto the `.ts` file beside it, and nothing else. And `src/tracker.ts`
  uses a parameter property, which strip-only mode refuses, so the script
  is run with `--experimental-transform-types`. The code that runs is the
  frozen files' own; the transform removes types and rewrites that one
  construct, as the test runner's transpiler does.
- **The driver is reimplemented, under the maintainer's conditional
  permission.** `track_frame.test.ts` cannot be imported, so the loop that
  perturbs and fits is written again in the script, from the test's lines
  85 to 109 (the image, the patches, the camera, the two views, the render
  settings), 111 to 126 (`centreRms` at the fixture's 64 patch centres,
  `about`), 173 to 179 (`shifts`) and 683 to 713 (the 137 predictions,
  seeds 1 to 5, the step, the verdict). The verdict is the sweep's own:
  right when `centreRms(r.H, H) < 0.5` px, wrong when the step ends `ok`
  further off, otherwise refused by its `loss`. The error is measured at
  M2's 64 patch centres for both targets, "as everywhere in this file"
  (the test's block comment, line 640).
- **Known limitation,** as every derivation script's here: no test and no
  format check cover `docs/`, so the script could break silently later while
  its figures stay in the record, and a defect of its own would reproduce.
  Its guards are the checks below; they catch a changed input, a changed
  default, a changed `K` and a driver that is not the sweep, not a defect
  in the signal arithmetic, which is this file's.

## Step 0: the sweep reproduced, or stop

The condition the permission rests on, checked by the script before any
figure, with every other count the record gives for the same steps:

| target | steps | right | wrong | refused, by loss | fewest inliers on a right fit |
|---|---|---|---|---|---|
| shipped, 48 patches | 1,370 | **788** | **0** | fit-failed 402, poor-fit 30, too-few-patches 132, too-many-outliers 18 | 11 |
| M2's 64 patches | 1,370 | **787** | **24** | fit-failed 385, poor-fit 14, too-few-patches 142, too-many-outliers 18 | 12 |

- **The shipped target: 788 right, no wrong fit, at least 11 inliers.** The
  test's three assertions, to the count. The script refuses any other
  count (fatal), and that refusal was exercised two ways: with the expected
  count altered, and with the driver genuinely not the sweep, the minimum
  lowered to 7, which the test's own comment says "admits one fit 1.2 px
  off" (the guards, below).
- **M2's 64 patches: 24 wrong, 787 right.** `679be0a`'s 24, and the round 3
  record's "787 / 690 / 788 / 802 … the same 24 / 1 / 0 / 3 wrong fits".
  The fewest inliers on a right fit of this fixture is 12, as the test's
  own block on the fixture pins (`track_frame.test.ts`, line 482,
  `expect(Math.min(...right.map((f) => f.inliers))).toBe(13)` on its one
  render with the residual limit lifted; over five renders at the defaults
  the minimum is 12, and the plan's M2 record, `README.md` line 1673, says
  "right fits with at least 12 inliers"). Both counts are fatal checks as
  well.
- **Time.** The two targets together take 18.0 to 18.2 s on this machine
  (seeds at 3.4 to 3.6 s each for both targets; timings go to stderr,
  so stdout stays byte-identical), consistent with the record's "about
  9 s" for one target. Not a figure of the record; stated because the
  brief asked.

**Gross against non-gross: how the driver distinguishes them, and what it
cannot.** No operational definition of "gross" exists in anything this
probe read. #104's body says "eight gross wrong fits" and no more; the
round 3 record describes them (passage 4): of the 24, "the 8 gross ones
(7.1–9.4 px off, from `scale x1.1` and `scale x1.12`) at 0.424–0.555" of
residual. The script labels a wrong fit gross when it matches that
description, prediction `scale x1.1` or `scale x1.12` and an error that
rounds to the record's 7.1 to 9.4 px (at or above 7.05 and below 9.45),
and requires the label to fall on exactly eight (fatal). It does: eight
fits, errors 7.108 to 9.400 px, residuals 0.424 to 0.555 px, inliers 8 to
10, two on each of renders 1 to 4 and none on render 5, three on view 0
and five on view 1. The other
sixteen are 0.522 to 1.491 px off: ten from `roll -4°` (0.546 to 0.644
px, 11 to 13 inliers), five from `roll +5°` (0.741 to 1.491 px, 8
inliers), one from `scale x1.08` (0.522 px, 13 inliers). So the two groups
are separated by a gap in error from 1.491 to 7.108 px on this sweep, and
the label matches the record's description; but the distinction is the
record's description matched, not a definition applied, and the script adds
none.

## Where K comes from

The sweep's views carry no camera. `view()` builds each as
`T(frame centre + shift) · R(angle) · S(scale) · P(perspective) · T(−target centre)`
(`warped_frames.ts`, lines 163 to 178), and the acceptance document says
what that means for the signal (passage 8): "a homography of that family
is in general not `K · [r1 r2 t]` for any rigid pose". The one `K` the
record applies to a frame of the sweep's size is the same document's §3,
"`K = intrinsics(270, 360)` of `cv-backend-jsfeatnext`, the frozen tests'
camera: a 60° horizontal field of view, so `f = 135 / tan 30° = 233.83 px`,
principal point at the frame's centre". The script imports that function,
evaluates it at 270 × 360 and checks the result against that sentence
(fatal): `f = 233.827`, principal point `(135, 180)`, no skew. It is the
same function #104's probe used on the exports at their processing
resolution.

That it is the record's `K` and not an assumption of this file is checked
by the one measurement the record holds of the signal on this sweep
(passage 7): the signal on the second view's exact `H` must read 0.0084
and 0.031 to the two figures the record gives (fatal). Under this `K` it
reads `d_scale` +0.008425 and `d_orth` −0.03126, and the check passes; the
record states magnitudes, and the sign of `d_orth` is negative. The first
view's exact `H` is a similarity (no perspective term), so the first two
columns of `K⁻¹H` are `s/f` times two orthogonal unit vectors for any `K`
without skew: both quantities are 0 there whatever `f`, and the script
checks that too (below 10⁻¹²). The second view's are not: its perspective
row `(0.0004, −0.0003, ·)` enters `b1` and `b2` as a third component that
`K⁻¹` leaves alone while dividing the other two by `f`, so its signal, and
every right fit's on that view, depends on `f`. How much is measured under
"Beyond the brief".

## The measurement

On every step that ends `ok`, 1,599 fits (788 and 787 right, 24 wrong),
with `B = K⁻¹H`, `b1` and `b2` its first two columns, the two quantities as
#104 defines them, and `E = max(|d_scale|, |d_orth|)`. The script prints
every fit with its identity (target, seed, view, prediction) and the
sweep's verdict; this section summarises.

**The 24 wrong fits of M2's 64 patches**, by error:

| gross | seed | view | prediction | error px | inliers | fit RMS px | `d_scale` | `d_orth` | E |
|---|---|---|---|---|---|---|---|---|---|
| gross | 2 | 1 | scale x1.1 | 9.400 | 8 | 0.449 | +0.03166 | +0.04916 | 0.04916 |
| gross | 4 | 1 | scale x1.1 | 9.363 | 8 | 0.456 | +0.03171 | +0.04837 | 0.04837 |
| gross | 3 | 0 | scale x1.1 | 9.193 | 8 | 0.424 | −0.02596 | +0.05690 | 0.05690 |
| gross | 4 | 1 | scale x1.12 | 8.148 | 8 | 0.445 | +0.04174 | −0.01356 | 0.04174 |
| gross | 1 | 1 | scale x1.1 | 7.888 | 9 | 0.539 | +0.04645 | −0.01785 | 0.04645 |
| gross | 3 | 1 | scale x1.1 | 7.686 | 10 | 0.527 | +0.04420 | −0.01389 | 0.04420 |
| gross | 1 | 0 | scale x1.1 | 7.274 | 10 | 0.555 | −0.003502 | +0.01564 | 0.01564 |
| gross | 2 | 0 | scale x1.1 | 7.108 | 10 | 0.509 | −0.003256 | +0.02181 | 0.02181 |
| | 3 | 1 | roll +5° | 1.491 | 8 | 0.283 | −0.004742 | −0.03349 | 0.03349 |
| | 1 | 1 | roll +5° | 1.347 | 8 | 0.227 | −0.001464 | −0.03411 | 0.03411 |
| | 1 | 0 | roll +5° | 0.880 | 8 | 0.264 | −0.005104 | −0.006002 | 0.006002 |
| | 5 | 0 | roll +5° | 0.834 | 8 | 0.264 | −0.004378 | −0.005979 | 0.005979 |
| | 2 | 0 | roll +5° | 0.741 | 8 | 0.258 | −0.003695 | −0.006524 | 0.006524 |
| | 2 | 1 | roll -4° | 0.644 | 12 | 0.235 | +0.01114 | −0.02603 | 0.02603 |
| | 5 | 0 | roll -4° | 0.621 | 11 | 0.255 | +0.005357 | +0.001759 | 0.005357 |
| | 4 | 1 | roll -4° | 0.614 | 12 | 0.238 | +0.01069 | −0.02623 | 0.02623 |
| | 1 | 0 | roll -4° | 0.613 | 11 | 0.243 | +0.005648 | +0.001762 | 0.005648 |
| | 2 | 0 | roll -4° | 0.610 | 12 | 0.246 | +0.005093 | +0.002642 | 0.005093 |
| | 4 | 0 | roll -4° | 0.585 | 13 | 0.231 | +0.004684 | +0.003081 | 0.004684 |
| | 1 | 1 | roll -4° | 0.578 | 12 | 0.229 | +0.01041 | −0.02693 | 0.02693 |
| | 5 | 1 | roll -4° | 0.573 | 12 | 0.226 | +0.01024 | −0.02695 | 0.02695 |
| | 3 | 1 | roll -4° | 0.571 | 12 | 0.244 | +0.009963 | −0.02682 | 0.02682 |
| | 3 | 0 | roll -4° | 0.546 | 13 | 0.240 | +0.003958 | +0.002916 | 0.003958 |
| | 1 | 0 | scale x1.08 | 0.522 | 13 | 0.364 | +0.0008628 | +0.003647 | 0.003647 |

**The right fits, per target and view** (absolute values; p50, p90, p99,
max), and the extremes of the wrong fits beside them:

| set | n | \|`d_scale`\| p50, p90, p99, max | \|`d_orth`\| p50, p90, p99, max | E max |
|---|---|---|---|---|
| shipped, view 0, right | 391 | 0.000125, 0.000506, 0.00103, 0.00228 | 0.000302, 0.000688, 0.00191, 0.00294 | 0.00294 |
| shipped, view 1, right | 397 | 0.00795, 0.00813, 0.00848, 0.00927 | 0.0309, 0.0312, 0.0315, 0.03155 | 0.03155 |
| M2's 64, view 0, right | 395 | 0.000781, 0.00102, 0.00222, 0.00262 | 0.000354, 0.000853, 0.00188, 0.00353 | 0.00353 |
| M2's 64, view 1, right | 392 | 0.00907, 0.00926, 0.00957, 0.00966 | 0.0312, 0.0315, 0.0321, 0.03265 | 0.03265 |
| both targets, both views, right | 1,575 | 0.00647, 0.00911, 0.00936, 0.00966 | 0.0281, 0.0313, 0.0318, 0.03265 | 0.03265 |
| gross, view 0 | 3 | min 0.00326, max 0.02596 | min 0.01564, max 0.05690 | min 0.01564 |
| gross, view 1 | 5 | min 0.03166, max 0.04645 | min 0.01356, max 0.04916 | min 0.04174 |
| the sixteen, view 0 | 9 | min 0.000863, max 0.00565 | min 0.00176, max 0.00652 | min 0.00365, max 0.00652 |
| the sixteen, view 1 | 7 | min 0.00146, max 0.01114 | min 0.02603, max 0.03411 | min 0.02603, max 0.03411 |

**The distributions**, as counts of right fits per bin of E, bins
`[0, 0.001) [0.001, 0.002) [0.002, 0.005) [0.005, 0.01) [0.01, 0.02) [0.02, 0.05)`
and nothing above 0.05:

- shipped, view 0: `381 6 4 0 0 0`; view 1: `0 0 0 0 0 397`.
- M2's 64, view 0: `333 54 8 0 0 0`; view 1: `0 0 0 0 0 392`.

So the right fits are two populations, by view and not by target. On view
0 every right fit of both targets has E below 0.0036, and the exact `H`
reads 0. On view 1 every right fit of both targets has E between 0.026 and
0.033, and the exact `H` reads 0.031: the fits sit around the view's own
signal, `d_scale` +0.0058 to +0.0097 about +0.0084 and `d_orth` −0.0327 to
−0.0264 about −0.0313 (the shipped target's narrower, +0.0058 to +0.0093
and −0.0316 to −0.0291). The inflation the record predicted (passage 7) is
this: on the second view a right fit reads about 0.03 because the view
does, not because the fit is ambiguous. The gross fits, by contrast, are
not two populations: 0.0156 to 0.0569 on view 0, 0.0417 to 0.0492 on view
1, and the three with the largest error (9.2 to 9.4 px) carry the largest
`d_orth` (0.048 to 0.057).

## One threshold for both quantities (#153's kind E)

Refuse when E > τ. Every right fit survives iff τ ≥ the largest right E;
every gross fit is refused iff τ < the smallest gross E. The derivation is
the interval between the two, if the first is below the second.

| right fits read | largest right E, and whose | smallest gross E, and whose | separates | interval for τ | width | ratio |
|---|---|---|---|---|---|---|
| both targets, both views | 0.03265 (M2's 64, seed 2, view 1, roll +3°, 23 inliers) | 0.01564 (seed 1, view 0, scale x1.1, 7.274 px) | **no** | none | −0.01701 | 0.479 |
| both targets, view 0 only, against the three gross fits of view 0 | 0.003526 (M2's 64, seed 3, view 0, scale x1.08, 13 inliers) | 0.01564 (the same) | yes | [0.003526, 0.01564) | 0.01211 | 4.44 |
| both targets, view 1 only, against the five gross fits of view 1 | 0.03265 (the same as the first row) | 0.04174 (seed 4, view 1, scale x1.12, 8.148 px) | yes | [0.03265, 0.04174) | 0.00909 | 1.28 |
| the shipped target only, both views, against all eight | 0.03155 (shipped, seed 5, view 1, shift 4 px @ 247.5°, 20 inliers) | 0.01564 (the same) | **no** | none | −0.01591 | 0.496 |
| M2's 64 patches only, both views, against all eight | 0.03265 | 0.01564 | **no** | none | −0.01701 | 0.479 |

- **Pooled over both views, no single τ separates.** The two gross fits of
  view 0 with the smallest signal (seeds 1 and 2, `scale x1.1`, 10 inliers,
  7.274 and 7.108 px off, E 0.01564 and 0.02181) sit below every right fit
  of view 1 (E 0.02636 and up). At τ = 0.03265, the tightest that refuses
  no right fit, those two gross fits pass and six are refused; at any τ
  below 0.01564, every gross fit is refused and so are all 789 right fits
  of view 1 (397 shipped, 392 M2). The margin by which it fails is the
  difference, 0.01701 in E, or a factor of 2.09.
- **Per view, both separate, by different margins.** On view 0 the interval
  is [0.003526, 0.01564): a factor of 4.4 between the largest right E and
  the smallest gross E, with the margin on the right side set by M2's
  `scale x1.08` fits (the shipped target's own view-0 maximum is 0.00294)
  and on the wrong side by the two 10-inlier `scale x1.1` fits. On view 1
  the interval is [0.03265, 0.04174): a factor of 1.28, width 0.00909,
  lying 0.0017 to 0.011 above the view's own inflation of 0.031. Both
  intervals are
  of right fits against gross fits on the same view; a threshold applied
  by the tracker does not know which view it is on, and what that means
  for the two intervals is not decided here.
- **The shipped target alone bounds τ from below at 0.03155** (its right
  fits' largest E, on view 1); M2's 64 patches at 0.03265. The two bounds
  differ by 0.0011, so on this sweep the right side of the margin does not
  depend much on the patch set; the wrong side is the 64-patch target's
  alone, since the shipped target produces no wrong fit.

## Two separate thresholds

Refuse when |`d_scale`| > τ_s or |`d_orth`| > τ_o. The right fits admit
every pair with τ_s at or above their largest |`d_scale`| and τ_o at or
above their largest |`d_orth`|; the tightest such pair is the floor of the
region, and each gross fit is refused there iff it exceeds either floor.

| right fits read | τ_s floor, and whose | τ_o floor, and whose | gross refused at the floor pair | region |
|---|---|---|---|---|
| both targets, both views | 0.009661 (M2's 64, seed 4, view 1, shift 3 px @ 112.5°) | 0.03265 (M2's 64, seed 2, view 1, roll +3°) | **6 of 8** | empty |
| both targets, view 0 only, against view 0's three | 0.002624 (M2's 64, seed 4, view 0, roll -3°) | 0.003526 (M2's 64, seed 3, view 0, scale x1.08) | 3 of 3 | τ_s ≥ 0.002624 and τ_o ≥ 0.003526, each bounded above only by the other's catch (below) |
| both targets, view 1 only, against view 1's five | 0.009661 (the same) | 0.03265 (the same) | 5 of 5 | τ_s in [0.009661, 0.04174) with τ_o at its floor; τ_o unbounded above with τ_s at its floor |
| the shipped target only, both views, against all eight | 0.009270 (shipped, seed 4, view 1, roll +4°) | 0.03155 (shipped, seed 5, view 1, shift 4 px @ 247.5°) | 6 of 8 | empty |

**Each gross fit against the pooled floor pair** (0.009661, 0.03265), as
its excess over each threshold, positive meaning refused by that quantity:

| seed | view | prediction | error px | \|`d_scale`\| over τ_s | \|`d_orth`\| over τ_o | refused |
|---|---|---|---|---|---|---|
| 2 | 0 | scale x1.1 | 7.108 | −0.006405 | −0.01084 | no |
| 1 | 0 | scale x1.1 | 7.274 | −0.006159 | −0.01701 | no |
| 2 | 1 | scale x1.1 | 9.400 | +0.02200 | +0.01651 | by both |
| 4 | 1 | scale x1.1 | 9.363 | +0.02205 | +0.01572 | by both |
| 3 | 0 | scale x1.1 | 9.193 | +0.01630 | +0.02425 | by both |
| 4 | 1 | scale x1.12 | 8.148 | +0.03208 | −0.01909 | by `d_scale` alone |
| 3 | 1 | scale x1.1 | 7.686 | +0.03454 | −0.01876 | by `d_scale` alone |
| 1 | 1 | scale x1.1 | 7.888 | +0.03679 | −0.01480 | by `d_scale` alone |

- **Pooled, the two-threshold form fails on the same two fits as the
  single one,** and for the same reason: their |`d_scale`| (0.0033, 0.0035)
  is below view 1's right fits' |`d_scale`| (up to 0.0097), and their
  |`d_orth`| (0.0156, 0.0218) below view 1's right fits' |`d_orth`| (up to
  0.0327). Separating the quantities buys nothing against them, because on
  both quantities they lie inside the other view's right fits. Of the six
  that are refused, each clears the pair by at least 0.02200 on the larger
  of its two excesses; the smallest positive excess on any single
  quantity among them is 0.0163 (seed 3, view 0, on `d_scale`).
- **Per view, both separate.** On view 0, each of the three gross fits
  exceeds both floors, so each threshold alone catches all three and
  neither bounds the other from above: the smallest excess is 0.000633 on
  `d_scale` (seed 2) and 0.01211 on `d_orth` (seed 1); read on `d_scale`
  alone the view-0 margin is thin (0.003256 against 0.002624, a factor of
  1.24), read on `d_orth` alone it is 0.01564 against 0.003526, a factor
  of 4.4. On view 1, three of the five are caught by `d_scale` alone
  (|`d_orth`| 0.0136 to 0.0179, below the view's right fits), so τ_s must
  stay below 0.04174 there while τ_o may rise without limit; the smallest
  excess is 0.02200 on `d_scale` (seed 2).
- The quantities differ in kind, a ratio minus one against a cosine, and
  on this sweep they also differ in which gross fits they catch: on view 1
  `d_orth` alone misses three of five, on view 0 `d_scale` alone catches
  all three by a thin margin. Which form is registered is not decided here.

## The sixteen

Where the other sixteen wrong fits fall, beside the eight, in E and
against the pooled largest right E (0.03265); the full values are in the
24-fit table above.

| view | fits | E | at the view's one-τ interval | at the view's floor pair |
|---|---|---|---|---|
| 0 | nine: five `roll -4°` (0.546 to 0.621 px, 11 to 13 inliers), three `roll +5°` (0.741 to 0.880 px, 8 inliers), one `scale x1.08` (0.522 px, 13 inliers) | 0.003647 to 0.006524 | all nine refused at every τ in [0.003526, 0.01564): the smallest, 0.003647, clears the interval's lower end by 0.000121, a factor of 1.03 | all nine refused |
| 1 | seven: five `roll -4°` (0.571 to 0.644 px, 12 inliers), two `roll +5°` (1.347 and 1.491 px, 8 inliers) | 0.02603 to 0.03411 | the five `roll -4°` fits, E 0.02603 to 0.02695, pass at every τ in [0.03265, 0.04174); the two `roll +5°` fits, E 0.03349 and 0.03411, are refused at τ below 0.03349 and pass from there | all seven refused: the five `roll -4°` fits by `d_scale`, 0.009963 to 0.01114 against the floor 0.009661, excesses 0.000302 to 0.001479; the two `roll +5°` by `d_orth` |

Pooled against 0.03265: fourteen of the sixteen lie below it, among the
right fits of view 1 in E; the two `roll +5°` fits of view 1 lie above it
by 0.00084 and 0.00146.

So on view 0 any threshold that refuses the gross fits refuses the sixteen
too, with the thinnest of all margins in this document between the
largest right E and the smallest of the nine. On view 1 the five
`roll -4°` fits, 0.57 to 0.64 px off on 12 inliers, lie inside the right
fits' range of E and are refused only by the two-threshold form, through
`d_scale`, by at most 0.0015. Nothing in the record says whether the
signal must refuse a wrong fit that is not gross; the figures are reported
and no rule is drawn from them.

## Beyond the brief: how much rests on K's focal length

The derivation's pooled failure is the second view's inflation, and that
inflation is a function of `f`. The same extremes under `intrinsics(270,
360, fov)` at three fields of view, the signal recomputed on the same
fitted `H` (nothing re-run):

| fov | f | largest right E, view 0 | view 1 | smallest gross E, view 0 | view 1 | pooled one-τ interval |
|---|---|---|---|---|---|---|
| 45° | 325.9 | 0.003541 | 0.06038 | 0.02829 | 0.07283 | none (−0.03209) |
| 60°, the record's | 233.8 | 0.003526 | 0.03265 | 0.01564 | 0.04174 | none (−0.01701) |
| 90° | 135.0 | 0.003516 | 0.01199 | 0.01021 | 0.002801 | none (−0.009193) |

View 0 is insensitive to `f`, as the similarity argument predicts. View 1
is not: its right fits' largest E falls by a factor of 2.7 from 60° to
90° and rises by 1.85 to 45°, and at 90° its smallest gross E (0.0028)
falls below view 0's largest right E (0.0035), so even the per-view
separation on view 1 reverses there. Under none of the three fields of
view does a single pooled τ separate.
This is reported as the sensitivity of the figures to the one input the
sweep does not define, and it is why the margins above are stated under
the record's `K` only.

## Determinism and the guards

- **Two runs, byte-identical.** The script was run twice at `9fa0ff1` with
  the command above; stdout was 187,267 bytes both times, SHA-256
  `afb7c9dbf7b9540716a6498cb7880a87dd96f9acf67bed142c63f1bb8488e560`. The
  script is 33,583 bytes, SHA-256
  `a6deaa8a0d427753b280652367643d42637bc4bf3e173a598314a059e357a807`.
  Two earlier drafts of the script, which differed only in the wording of
  fatal messages, produced the same 187,267 bytes and the same hash. The
  step is deterministic by construction: the renders draw from
  `mulberry32(seed)` and `trackFrame` draws nothing; the test's "is pure
  and deterministic" block (lines 599 to 614) pins the same.
- **Every check exercised on the failing side,** on scratch copies of the
  script outside the repository, each pointed at the worktree with
  `WEBARKIT_ROOT` and each with one check inverted or one input misnamed.
  Each must exit 1 naming what disagrees on stderr and print nothing on
  stdout; the unmodified copy must exit 0 with the in-repository output.
  The copies were deleted afterwards and their absence confirmed.

  | copy | what was changed | exit | stdout | stderr, the `fatal:` line |
  |---|---|---|---|---|
  | unmodified | nothing | 0 | 187,375 bytes | none. Its output differs from the in-repository run on one line only, the provenance line, which prints the root it was pointed at instead of "this checkout"; every other byte is the same |
  | frozen hash altered | the last digit of `track_frame.test.ts`'s recorded hash | 1 | empty | `track_frame.test.ts: sha256 cc6c70bc…6973, not the record's cc6c70bc…6974` |
  | frozen path misnamed | `seeded_rng.ts` → `seeded_rngs.ts` | 1 | empty | `seeded_rngs.ts: no such file under <the worktree>` |
  | root misnamed | `WEBARKIT_ROOT` at an empty directory | 1 | empty | `track_frame.test.ts: no such file under <that directory>` |
  | K's focal check | `tan 30°` → `tan 31°` in the record's formula | 1 | empty | `K's focal length is 233.82685902179844, not the record's 135 / tan 30° = 224.67773011731992` |
  | K's principal point | the expected centre moved by one pixel | 1 | empty | `K's principal point is (135, 180), not the frame's centre (134, 180)` |
  | K⁻¹K tolerance | 10⁻¹² → 10⁻²⁰ | 1 | empty | `K⁻¹ K is not the identity to 1e-20` |
  | the record's view-1 figures | 0.0084 → 0.0085 | 1 | empty | `view 1's exact H reads d_scale 0.008424983244543327, d_orth -0.031262000840560425 under this K; the record says 0.0085 and 0.031` |
  | the prediction count | roll ±6° dropped | 1 | empty | `135 predictions, not 137` |
  | step 0, shipped count | 788 → 789 | 1 | empty | `step 0: shipped target 788 right, 0 wrong; the sweep pins 789 and 0` |
  | step 0, the real refusal | `minTrackedPatches` 7 in place of the default 8: the driver genuinely not the sweep | 1 | empty | `step 0: shipped target 788 right, 1 wrong; the sweep pins 788 and 0`, the one wrong fit the test's comment at line 680 predicts for a minimum of 7 |
  | step 0, M2 count | 24 → 25 | 1 | empty | `step 0: M2's 64 patches 787 right, 24 wrong; the record says 787 and 25` |
  | step 0, fewest inliers | 11 → 12 | 1 | empty | `step 0: a right fit on the shipped target has 11 inliers; the sweep pins at least 12` |
  | the gross description | the error floor 7.05 → 7.2 px | 1 | empty | `7 wrong fits match the record's description of the gross eight, not 8` |
  | a degenerate column | the norm check `n1 > 0` → `n1 > 1` | 1 | empty | `a fit's K⁻¹H has a degenerate column` |

  Every altered copy in the table exits 1 with its reason and an empty
  stdout; the unmodified copy exits 0. The copies and their outputs lived under
  the session's scratch directory, outside the repository; after the run
  the directory was removed and its absence confirmed. The run that
  produced this table is the one on the final script; two earlier runs on
  the drafts behaved the same, their only difference being three messages
  that named the script's own pin instead of the altered one, which is
  why the pins became constants the message reads.

## Independent: a reviewer's read

As the protocol requires of a figure that gates a decision, a fresh
session read this document against the script's output and the sources
at `9fa0ff1` before the commit, with the instruction to refute rather
than confirm, and without editing anything. What it did and found:

- **Every figure attributed to the output, checked.** All 24 rows of the
  wrong-fit table, every entry of the per-view summary, the histograms,
  the five one-threshold rows, the four two-threshold rows, the eight
  excesses, the sixteen's ranges and the field-of-view table agree with
  the output; the script's size and hash agree.
- **The headline, recomputed independently from the output's per-fit
  table:** largest right E 0.03265, smallest gross E 0.01564, 789 right
  fits on view 1, none of them below E 0.02636; two gross fits at or
  below 0.03265, 789 right fits at or above 0.01564. Not refuted.
- **The script, read for a defect that would reproduce:** none found. The
  column convention of `K⁻¹H`, the reimplemented `about` and `centreRms`,
  the prediction list's order, the verdict rule, the quantile and the
  threshold logic were each checked against the test or the definition;
  every `fatal` exits before any figure is printed. One observation, not
  a defect: the record's `K` puts the principal point at (135, 180), half
  a pixel from `view()`'s frame centre of (134.5, 179.5).
- **Two guards exercised by the reviewer** on its own scratch copies, the
  hash check and the shipped count, each exiting 1 with the table's
  message and nothing on stdout; the unmodified script's output hashed to
  the value above.
- **Five wording findings, all applied before the commit:** the gross
  eight were said to lie "on five renders" where they lie on renders 1 to
  4; a "≥ 12 inliers" sentence was attributed to the round 3 record,
  which does not contain it; the view-1 maximum under 90° was said to
  "halve" where it falls by 2.7; the view-1 interval was said to lie
  "about 0.009 above" the inflation, conflating its width with its
  offset; and "under no field of view" claimed more than the three
  measured. Two more on form: the gross label's error window is stated
  as the script codes it, and a tally of the guards table's rows was
  replaced by a reference to the table.
- **Also noted:** the one ruling applied that is recorded in no
  repository file, the permission to reimplement the driver, is disclosed
  under "Step 0: provenance" and conditioned on a reproduction the
  reviewer confirmed to the fit; that disclosure is the maintainer's to
  accept. Node prints an `ExperimentalWarning` for the transform flag on
  stderr; stdout is unaffected.

## What this probe does not decide

- **The threshold**, in either form: the maintainer's, recorded with this
  derivation before the campaign reads it (passage 6). No value in this
  document is proposed, and the intervals are reported as intervals.
- **Whether the sixteen must be refused.** Nothing in the record says so;
  where each falls is reported.
- **What the per-view intervals mean for a tracker that does not know its
  view.** The pooled failure is the second view's inflation, which the
  record predicted and this probe measures; whether the registration reads
  the derivation per view, pools it, or treats the second view's signal as
  the view's and not the fit's, is the registration's.
- **K for the device.** The sweep's `K` is the record's for its frames; the
  campaign's instrument reads `intrinsics` at each export's processing
  resolution, and the sensitivity table says how much of the second view's
  figures `f` carries. Whether a threshold derived at one `K` transfers to
  another is not measured here.
- **Whether a right fit of the device's footage reads as these do.** #104's
  probe measured the signal on the device's posed frames (its item 3); this
  derivation is on synthetic renders of one target image. No comparison is
  made.
- **The operational meaning of "gross".** The eight are identified by the
  record's description, which this sweep reproduces with a gap in error
  from 1.49 to 7.11 px; the gap is a property of this sweep.

## Constraints kept

Synthetic throughout: no device run, no bench-page run, no replay of a
bundled clip, no committed export read or edited. No file under
`packages/*/src/` changed; no frozen input changed, and each is hash-checked
on every run; `examples/targets/pinball.wnft` read and not recompiled;
`fixtures/nft-target/` untouched; `examples/dist/provenance.json` written by
the build at `9fa0ff1` and not edited. `docs/benchmarks/README.md` and
`step-protocol.md` unchanged; no issue opened, edited, closed or commented
on. The two files are this document and its script, on
`docs/104-stage1-threshold-derivation`, off `dev` at `9fa0ff1`.
