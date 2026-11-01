# #202, Stage 3: the facing rule's criteria and prediction, registered before the implementation (2026-11-01)

**Registered on 2026-11-01, before any implementation of the facing rule,
under [the step protocol](./step-protocol.md), Stage 3: "Criteria are
registered in their own commit, before the implementation, and that commit is
cited by hash". Its basis is
[#218](https://github.com/webarkit/webarkit/pull/218)'s merge,
`f872707da83340ef9defb668c11dd7ec1cf3b18c`, and the probe it merged,
[`2026-11-01-202-stage1-probe.md`](./2026-11-01-202-stage1-probe.md) with its
script and its addendum of the same day. The rule's form is
[the maintainer's ruling of 2026-11-01 on #218's probe](https://github.com/webarkit/webarkit/issues/202#issuecomment-6559359479);
the probe's scope is
[#202's comment of 2026-10-31](https://github.com/webarkit/webarkit/issues/202#issuecomment-6540801041).
This is Part 2 of three: Part 1 was the probe, Part 3 implements the rule
against what is registered here. Nothing here is measured against the rule.
The results go in an addendum beside this registration (below, "What a failed
criterion means").**

The ruling, quoted in part (cut where marked):

> **The rule registered at Stage 3 is GWM:** a detection is accepted only if
> its `H` shows the target facing the camera, that is, column `facing` of the
> probe's axis A (the target's 5 × 5 grid `w` all of one sign and, with `H`
> scaled so they are positive, `det H > 0`). It refuses column `mixed-w` (GW)
> and column `reversed` (GM), on the G5 base.
>
> - **GW's part** rests on the probe's measurement: 38–49 refusals a run on
>   the wall clip and 45–67 on the table, none at a frame G0 posed with
>   corners; its must-fire set is the sequences' frames 67 and 69, both
>   wrong, and no right detection there is `mixed-w`.
> - **GM's part** has no must-fire set on the corpus (the probe's
>   expressibility section). It rests on geometry: an orientation-reversing
>   `H` shows the target from behind, which a visible printed target cannot
>   be. Its acceptance is the probe's prediction on the replay and a unit
>   test on a constructed reversed `H`, and the registration says so.
> - **What the rule changes:** detections that today return `ok: true` with a
>   pose and no corners (what #200's demo drew) become refusals, with a reason
>   of their own, as G5's `"too-few-inliers"`. […]
> - **The stateless mode** is brought to parity (#191's precedent).
>   `METRICS_VERSION` stays 1.

Figures cited from the probe are its record's, at `f872707`, by section;
lines of its script are lines of
`docs/benchmarks/2026-11-01-202-stage1-probe.mjs` at `f872707`. "G0" is the
shipped pipeline at the base, G5 included; "GWM" is the probe's wrapper arm
that refuses columns `mixed-w` and `reversed`.

## Step 0: provenance, and the brief's check

- **Ref:** `docs/202-stage3-registration`, branched from `origin/dev` at
  **`f872707da83340ef9defb668c11dd7ec1cf3b18c`** (#218's merge), after
  `git fetch origin`. Node v24.21.0, the pin; Windows 11. The session ran on
  Claude Opus 5.5, with no advisor, as the brief asked.
- **Milestone 9's description** gives the closing condition this registration
  serves, its first way: "a rule is registered before its implementation,
  implemented, and accepted on its registered criteria, with the bench page's
  stateless mode brought to parity if the rule acts in detection (#191's
  precedent)".
- **The brief's citations held** at that SHA: the protocol's Stage 3 (lines
  135, 140 to 142 and 145); the probe record's sections "The method", "The
  candidates", "Expressibility: the must-fire set", "Stage 2: the declared
  covariates", "Stage 3: drafts" (GW, GM, GWM), "What this probe does not
  establish" and the addendum with GW and GWM; axis A in the script (lines
  129 to 147) and its fatal on `det H = 0` (line 634); G5's refusal at
  `detection.ts` lines 454 to 463, before the inliers are copied (line 465);
  `targetGrid` in `src/pose/select_pose.ts` (line 87); the detection worker's
  call of `detectTarget` (`examples/js/detection-worker-core.mjs`, line 124);
  #191's parity test, `examples/test/bench-stateless.test.mjs`;
  `examples/js/bench-frames.mjs` line 179; the "device scaled step, sync" arm
  (`scripts/replay-clips.mjs`, line 969), whose export carries each frame's
  `corners`.
- **Four of the brief's points did not hold, and the maintainer ruled on them
  on 2026-11-01, before this file was written.** The rulings were given to the
  session that wrote this registration; this file is where they are recorded,
  as corrections to the brief.
  1. **C0 as briefed was refuted by construction.** The brief asked every
     result field on every `facing` DETECT frame to equal the base's. At the
     base a `mixed-w` or `reversed` detection sets a lock (`tracker.ts`, lines
     919 to 921), so the frame after it runs the tracking step first and
     records `tracking` and `trackLoss` (lines 855 to 879) before detecting
     again. At the implementation the refused detection sets no lock, and
     both fields are null on that frame. Leave-and-return frame 70 is such a
     frame: `facing`, after the refused frame 69. **Ruled:** those three fields
     (`tracking`, `trackLoss`, `trackLossConditioning`) are excepted on the
     frame immediately after a frame the rule refuses, and covered there by
     C1 against the probe's GWM rows. #137's addendum is the precedent for the
     knock-on ("the frame after a refusal detects afresh, so its `trackLoss`
     reads null where it read `too-few-patches`").
  2. **P (b) cannot be read on the scaled-step arm.** There the time a frame
     keeps the replay busy is `acquireMs`, plus the scaled step if the frame
     ran a tracking step, plus the 83.2 ms detection if it is not TRACK
     (`replay-clips.mjs`, lines 638 to 642). The frame after a base `mixed-w`
     or `reversed` detection runs a tracking step; the frame after a refusal
     does not. From the first refusal on, the two runs process different
     frames, and no frame pairing exists (#137's P-G5 (b), the same reason).
     And a refused frame is exported LOST with `corners` null and no `H`, so
     its column cannot be read from the export. **Ruled:** on that arm (a)
     and (c) only, read through the corners; (b) is not registered there; C1
     covers it frame by frame on the every-frame schedule; (d),
     `trackTimeShare`, is not registered.
  3. **The failure reasons are listed in `DEFINITIONS.detectionOutcomes`**
     (`examples/js/bench-definitions.mjs`, lines 136 to 137), not in its
     `detectionUse` entry (lines 129 to 130). #137's registration's review
     made the same correction. **Ruled:** cited as `detectionOutcomes`.
  4. **C2's must-fire set changes a pinned ground-truth string by
     construction** (below, C2). **Ruled:** the expected string is written
     here ahead of time, labelled as derived, not measured, with the arms
     whose strings are unknown; Part 3 stops and reports every changed
     string, whether or not it matches.
- **Accepted additions:** `det H = 0` with one-signed `w` is refused, and is
  C3's fifth constructed case; the reason is `"not-facing"`; the readers of
  the reason include `examples/README.md` (about line 252) and the webcam
  demo's per-reason message (about line 434); and, the maintainer's own
  addition, the static demo's note (below, "The treatment").
- **Seen before registration:** the probe's two recorded stdouts, in the
  probe session's scratch directory, at their recorded SHA-256
  (`1ad32881…`, line 4 reading "built clean at
  `9b387ae28952ae7e37827d3582b686bdad1b8f30`"; `039ad945…`), and nothing
  else. No figure of any implementation exists yet.
- **What exists and was not seen:** the probe's own replay,
  `replay-clips.mjs --external 70 --seed 1`, runs every `--external` arm
  (`scripts/replay-clips.mjs`, lines 930 to 975), so it wrote a "device
  scaled step, sync" export of each clip at seed 1, built at `9b387ae`,
  whose code trees equal `f872707`'s (`git diff 9b387ae f872707` touches
  only the probe's two files), and printed that arm's summary row to the
  probe session's log. That is seed 1 of P's control. This session listed
  the files' names and read neither them nor the log. P's registered runs
  do not reuse them; they repeat that control (below, "How each is read").

## The treatment, as code will express it

- **Where:** in `detectTarget` (`packages/nft-tracker/src/detection.ts`),
  after G5's refusal (lines 454 to 463) and before the inliers are copied
  (line 465), so the main thread and the detection worker
  (`examples/js/detection-worker-core.mjs`, line 124, which calls
  `detectTarget`) run the same code. An accepted fit with at least
  `MIN_DETECTION_INLIERS` inliers whose `H` is not `facing` by axis A is
  refused. G5 runs first: a 4-inlier fit is `"too-few-inliers"`, whatever its
  column.
- **Axis A, exactly as the probe defines it** (script lines 129 to 147, the
  header's method item 3, lines 55 to 59):
  - **the grid:** `targetGrid` (`src/pose/select_pose.ts`, line 87) of the
    target's **level-0** size, `target.pyramid.levelSizes[0]`, the 25 points
    the tracker's pose selection uses (`tracker.ts`, lines 773 to 774).
    `DetectionSetup` today holds the **meta** size (`detection.ts`, lines 358
    to 359); the probe checked the two equal on `pinball.wnft` (script line
    563), and the rule uses the level-0 grid, built once in
    `prepareDetection`;
  - `wᵢ = H[6]·xᵢ + H[7]·yᵢ + H[8]` on the 25 points. **All of one sign, and
    none zero** (`every(x > 0)` or `every(x < 0)`, strict, script lines 137
    to 138): `s` is that sign, and the fit is `facing` when `s · det H > 0`,
    `reversed` when `< 0`. Any `w` of the other sign, or any `w` exactly 0:
    `mixed-w`;
  - **`det H = 0` with one-signed `w`:** the probe made it fatal (script line
    634) and never met it. **This registration's addition, ruled: it is not
    `facing`, so it is refused.** The reason: a singular `H` maps the target
    to a line or a point, which shows no face; it is not a homography the
    pose selection can decompose, and accepting what the rule cannot
    classify would make the rule's acceptance depend on a case it was never
    measured on.
- **The classifier:** one function, exported from the package's index as
  `MIN_DETECTION_INLIERS` is (`src/index.ts`, line 49). Proposed:
  `targetSide(H, grid)`, returning `"facing"`, `"reversed"`, `"mixed-w"` or
  `"singular"` (the last for `det H = 0` with one-signed `w`). `detectTarget`
  refuses every value but `"facing"`. Part 3 may rename it; the contract above
  is what is registered.
- **The reason:** `"not-facing"`. **The refused result carries the fit's
  `numInliers`**, `numMatches` and `sceneKeypoints`, in G5's shape
  (`detection.ts`, lines 456 to 462). The tracker makes the frame LOST with
  no lock (`detected`, lines 1085 to 1100, passes the reason through; a lock
  is set only on an ok detection, lines 919 to 921), as for any failed
  detection.
- **Where the reason is spelled out, and what each place needs.** Every
  reader of `"too-few-inliers"` outside `docs/benchmarks/`, by `grep`:
  - **gains `"not-facing"`:**
    - `DetectionFailure`, `detection.ts` lines 262 to 273;
    - `TrackFailure`, `tracker.ts` from line 430 (the tracker fills it from
      the detection's reason);
    - the bench page's reason labels, `examples/bench-nft.html` line 535;
    - `DEFINITIONS.detectionOutcomes`, `examples/js/bench-definitions.mjs`
      lines 136 to 137 ("failed, per reason");
    - the package README's reasons, `packages/nft-tracker/README.md` about
      line 309;
    - `examples/README.md`, about line 252;
    - the webcam demo's per-reason message,
      `examples/pinball-webcam-jsfeatnext-backend.html` about line 434;
    - `examples/js/bench-stateless.mjs`, lines 146 to 157 (below);
    - a CHANGELOG entry.
  - **needs nothing:** `examples/js/bench-frames.mjs` line 179: a
    `"not-facing"` frame did run `estimateHomography`, and its filter
    excludes only `"too-few-matches"`. `src/tracking/types.ts` line 338 and
    `src/tracking/robust_homography.ts` lines 89 to 130: the tracking step's
    own loss reason, a separate vocabulary that this rule does not enter.
  - **tests that pin the reason**, extended or left as they are by Part 3:
    `test/detect_target.test.ts`, `test/tracker_state_machine.test.ts`,
    `test/tracker_external_detection.test.ts`,
    `examples/test/bench-stateless.test.mjs`.
  - **The static demo** (`examples/pinball-static-jsfeatnext-backend.html`)
    stays the contract's raw pipeline, as ruled on #191. Its note that the
    tracker refuses detections the demo does not (lines 158 to 160, G5's)
    gains the facing rule.
- **The stateless mode** (`examples/js/bench-stateless.mjs`) applies the same
  rule through the same exported function, so the two cannot drift (#191).
  It imports no package (lines 32 to 35): the values it runs with arrive in
  `deps` (lines 59 to 88), from the page's `STATELESS_DEPS`
  (`examples/bench-nft.html`, lines 766 to 772). `deps` gains the classifier
  and `targetGrid`, guarded as `MIN_DETECTION_INLIERS` is (a missing one
  throws, naming it), and the refusal sits after its G5 refusal, in
  `detectTarget`'s order, with the same reason and count.
- **Nothing else changes:** the tracking step, the pose selector
  (`selectPose`), the conditioning signal and `poseFilter` are untouched.
  C0 checks it on every `facing` DETECT frame (`H`, `pose`, `poseSelection`,
  `conditioning` and every other field equal to the base's), and C1 on every
  frame of the clips against the probe, TRACK frames included, by the
  fields its rows carry (`state`, `ok`, `inliers`, `H`, `corners`,
  `poseCorners` and the rest of C1's list). The full results of TRACK frames
  are compared by neither.
- `METRICS_VERSION` stays 1: the rule changes which frames are posed, not a
  definition.

## C0 to C4: what the implementation must reproduce (basis: the probe)

These are checks of the implementation, not predictions: the probe measured
GWM on the every-frame schedule, and Stage 3 says a measured outcome is cited
as a basis. Each is exercised both ways in Part 3.

### C0, facing is unchanged

- **The check.** On every DETECT frame the base classifies `facing` by axis
  A, every result field at the implementation equals the base's, where the
  base is **the registration's merge commit** (this file's merge into `dev`;
  not this file's basis, `f872707`):
  - **on the replay's clips**, the three of them, seeds 1 to 8, all six loops,
    every frame processed, RANSAC seeded as the probe seeds it;
  - **on the ground truth's sequences**, `shippedLeaveAndReturn`,
    `shippedWander` and `shippedVelocitySteps`
    (`ground-truth/tracker_sequences.ts`, lines 243 to 256), seeded by the
    module (`SEED` 20260925): 50 `facing` DETECT frames at the base, by the
    probe's expressibility run.
  - **Fields compared:** every field of every result, recursively: `ok`,
    `state`, `quality`, `timestampMs`, `numMatches`, `numInliers`, `H`, `pose`
    (`R`, `t`, `good`), `poseSelection` (`pose`, `candidates`, `chosen`,
    `outcome`, `ambiguous`, `margin`, `rejected`), `conditioning`,
    `sceneKeypoints`, `trackLoss`, `trackLossConditioning`, `tracking`,
    `timings`, `needsDetection`, `detectionUse`, `detectionLatencyMs`. The two
    results have the same keys at every level; arrays and typed arrays are
    compared element by element; every leaf with `Object.is`.
  - **The exception (correction 1):** on the frame immediately after a frame
    the rule refuses at the implementation (its reason `"not-facing"`),
    `tracking`, `trackLoss` and `trackLossConditioning` are not compared.
    Every other field there is. The three are covered there by C1.
  - The implementation's frame at the same index is compared; a base `facing`
    DETECT frame that is not DETECT at the implementation is a differing
    frame.
- _Basis:_ the probe's method: the rule acts only on a fit it refuses, and
  every other step is untouched; on the every-frame schedule GWM's DETECT
  frames are G0's less its refusals, on every seed (the addendum's tables).
- _Refuted by_ any field that differs outside the exception, on any clip,
  seed, sequence or frame.
- _Both ways:_ the comparison run on the base against itself reports
  nothing; given a copy of one base result with one leaf changed (a component
  of `pose.t`, then `poseSelection.margin`) it reports that leaf; given
  `tracking` changed on a `facing` frame that does not follow a refusal it
  reports it, and on one that does it does not.

### C1, fidelity to the probe

- **The check.** On the three clips at seeds 1 to 8, the every-frame
  schedule, the implementation's per-frame rows (the check copy's G0, below)
  equal the probe's GWM rows at the base, frame by frame. The implementation
  refuses exactly the frames the probe's GWM arm refused, and no others.
  - **Fields compared:** every field of the row (script lines 683 to 697 and
    706): `k`, `loop`, `t`, `state`, `ok`, `reason`, `inliers`, `corners`,
    `outcome`, `chosen`, `selBehind`, `poseCorners`, `H`, and `gate`, the
    wrapper's log of the frame's fit, every key of it but `gate.refused`,
    which is the arm's own label (GWM's wrapper sets it, G0's never does).
  - **The exception, as #137's C2:** on a frame the GWM arm refused (its row's
    `gate.refused` not null), `reason` and `inliers` may differ. The probe's
    wrapper returns the backend's failure shape, `numInliers: 0` (script line
    661), which `detectTarget` files as `"no-consensus"`; the implementation
    reads `"not-facing"` with the fit's count. Every other field there is
    compared.
  - **No others:** the frames whose implementation row reads `"not-facing"`
    are exactly the frames whose GWM row has `gate.refused` not null, on every
    clip and seed.
  - The two runs have the same number of rows; a row present in one only is a
    differing frame.
- _Basis:_ the probe's GWM arm, on every seed of every clip: its refusals,
  cells and figures (the addendum, "Per clip and seed").
- _Refuted by_ any frame that differs outside the exception, or a refused
  frame set that differs, on any clip and seed.

### C2, must-fire and must-not-fire on the sequences

- **The check**, on the ground truth's sequences at the module's `SEED`
  (20260925, one seed), through `NftTracker`, which runs `detectTarget`:
  - **must-fire:** leave-and-return frames **67** (5 inliers, `mixed-w ×
    none`, 300.456 px from the truth) and **69** (8 inliers, `mixed-w × two`,
    61,614.862 px) are refused, each `ok: false`, `state` `"LOST"`, reason
    `"not-facing"`, `numInliers` the fit's (5 and 8);
  - **must-not-fire:** no other DETECT frame of the 52 is refused: every frame
    reading `"not-facing"` in the three sequences is one of the two, and the
    other 50 DETECT frames of the base are DETECT at the implementation;
  - the remaining DETECT frames are all `facing` (none `reversed`, none
    `mixed-w`).
- _Basis:_ the probe's expressibility run (the addendum, "Must-fire and
  must-not-fire on the ground truth's sequences"): 52 DETECT frames, 50
  `facing` and 2 `mixed-w`, both wrong; no right detection `mixed-w`.
- _Refuted by_ frame 67 or 69 accepted, any other frame refused with
  `"not-facing"`, or a remaining DETECT frame that is not `facing`.
- **The ground-truth strings (correction 4).** C2's must-fire set changes a
  pinned state string by construction. `test/tracker_state_machine.test.ts`
  pins leave-and-return on the shipped target, through
  `shippedLeaveAndReturn` (lines 374 to 378), the arm the probe's
  expressibility classified, as `D T×38 L×28 D L D×24 T×13` (frame 67 the
  `D`, 68 the `L`, G5's refusal). With 67 and 69 refused, **derived, not
  measured:** `D T×38 L×31 D×23 T×13` on that arm. **Two arms whose strings
  may change and are unknown,** neither of which the probe classified: the
  same file's fixture-target arm (`run(target, leaveAndReturn, 106)`, its
  test at line 177, the string at lines 207 to 209, the same today), and
  `test/tracker_external_detection.test.ts`'s M2 arm
  (`D T×38 L×28 D L L D×23 T×13`, seeded `SEED + i` per frame). Both
  tracker arms also pin frames 39 and 68 as `"too-few-inliers"` with 4
  inliers (lines 210 to 215 and 379 to 384), which the rule does not touch,
  and their tests' titles (lines 177 and 369) name the states they assert. **Part 3 stops and reports every changed
  ground-truth string, with old and new values, whether or not it matches the
  derived one;** accepting a changed string is the maintainer's.

### C3, the unit cases

- **The check.** Through `detectTarget` with a stub backend whose
  `estimateHomography` accepts a constructed `H` with at least 5 inliers, as
  `test/detect_target.test.ts` stubs it (`acceptingWith`, lines 122 to 136,
  which today returns a fixed identity `H` and is extended to take a
  constructed one), five constructed fits, each classified by the exported classifier and
  accepted or refused as the rule says:
  1. **`facing`:** accepted, `ok: true`, `H` the fit's; and its negation `−H`
     (every grid `w` negative, the same homography), also `facing` and
     accepted (the probe's normalisation, check B);
  2. **`reversed`** (the camera on the plane's back, the grid in front, as
     the probe's self-test constructs it, script lines 245 to 248): refused,
     `"not-facing"`, the fit's `numInliers`;
  3. **`mixed-w`** (the grid's `w` of both signs, script lines 249 to 250):
     refused, the same;
  4. **one grid `w` exactly 0**, every other of one sign: `mixed-w`, refused;
  5. **`det H = 0` with one-signed `w`** (the registration's addition):
     `"singular"`, refused.
- _Basis:_ the probe's self-test (`--self-test`, check A and C), which
  classifies cases 1 to 3 so; cases 4 and 5 follow from the definition above.
- _Refuted by_ any case classified or decided otherwise.
- _Both ways:_ on a scratch copy of `detection.ts` without the new refusal,
  cases 2 to 5 fail; with a refusal of every fit, case 1 fails. The file is
  restored in a `finally` and `git diff`-ed before the next run.

### C4, the stateless parity

- **The check.** #191's parity test (`examples/test/bench-stateless.test.mjs`,
  its `describe` at line 158) extended so the stateless pipeline and
  `detectTarget` agree on a `reversed` and a `mixed-w` fit: both refuse,
  reason `"not-facing"`, the same `numInliers` and `numMatches`; and on a
  `facing` fit both accept, as today. A `deps` without the classifier throws,
  naming it.
- _Basis:_ #191's precedent: the stateless mode measures the same detection
  work as the tracker's, which a rule in one and not the other would break.
- _Refuted by_ any disagreement, or a missing classifier that does not throw.
- _Both ways:_ on a scratch copy of `bench-stateless.mjs` without the new
  refusal, the two new cases fail; with a refusal of every fit, the
  `facing` case fails; restored as in C3.

## P: the prediction for the scaled-step regime

The regime the probe did not run: the `--external` arm **"device scaled step,
sync"** (`scripts/replay-clips.mjs`, line 969), seeds 1 to 8, base and
implementation in the same session, as #137's P-G5. Its export carries each
frame's `state`, `ok`, `reason`, `numInliers` and `corners`, and no `H`
(`examples/js/bench-frames.mjs`, `frameRecord`, lines 104 to 147).

**Axis A through the corners**, on an accepted DETECT frame (correction 2).
`corners` is `reprojectCorners(H, targetPoints)` (`bench-frames.mjs`, lines 59
to 73), the four target corners, which are grid points (the meta size equals
the level-0 size, checked by the probe, script line 563):

- **`corners` null ⇔ `mixed-w`.** `reprojectCorners` returns null when the
  corners' `w` differ in sign or a point does not project to a finite one
  (a `w` of 0). `w` is affine in (x, y), so its extremes on the grid are at
  the corners: the grid's `w` are one-signed and none zero exactly when the
  corners' are. The probe checked both halves, fatally, on every accepted fit
  and every DETECT frame of all six loops (the addendum, "The equivalence,
  checked frame by frame").
- **Corners mirrored ⇔ `reversed`**, on a frame with corners: the signed area
  of the four corners against theirs in target coordinates,
  (0, 0), (w − 1, 0), (w − 1, h − 1), (0, h − 1), as the probe reads Input 1
  (script lines 476 to 492). With `w` one-signed, the map's Jacobian
  determinant has the sign of `det H / w³`, that is of `s · det H`, so the
  winding reverses exactly in column `reversed`. The probe checked it,
  fatally, on every DETECT frame outside `mixed-w` ("The classes and the
  algebra's check", "Mirrored corners").

Each part reads the counted loops (loops 1 to 4, `countedLoopFrames`,
`examples/js/bench-loops.mjs` line 222, over the export's `frames` and its
`clipDurationS`) of each clip's export.

- **(a) No accepted detection outside `facing`.** At the implementation,
  DETECT frames with `corners` null (`mixed-w`), DETECT frames with mirrored
  corners (`reversed`), and DETECT frames whose corners enclose zero area,
  counted apart as the probe's Input 1 counts them (script line 488): **0, 0
  and 0 on every seed of every clip.** A zero-area quadrilateral is neither
  null nor mirrored; at the implementation it would be an accepted fit the
  rule should have refused as `"singular"` or `mixed-w`.
  - **This part follows from the rule's definition and the two equivalences,
    and the record says so:** its outcome on the every-frame schedule is
    settled by the probe's GWM arm (columns `mixed-w` and `reversed` 0 on
    every seed), which is its basis. What it reads on this schedule is the
    implementation in the arm the device runs, on frames the probe never
    processed, and the equivalences on them.
  - _Refuted by_ any such frame on any seed of any clip.
  - _Void_ **per half and per clip:** GW's half (`corners` null) on a clip
    where the control (run A, below) has no DETECT frame with `corners` null
    on any seed; GM's half (mirrored) on a clip where the control has no
    mirrored DETECT frame on any seed. The rule could not be seen acting
    there, and a half that cannot be seen is not reported as held. GM's half
    may well be void: the probe saw 0 to 2 reversed detections a run on the
    every-frame schedule, and this schedule processes fewer frames. The
    static clip is expected void in both halves, having no counted DETECT
    frame on the every-frame schedule.
- **(b) With corners below the base's by GM's refusals: not registered for
  this schedule** (correction 2). No frame pairing exists after the first
  refusal, and a refused frame's column cannot be read from the export. C1
  registers it where it is defined, frame by frame on the every-frame
  schedule.
- **(c) Every posed frame has corners.** At the implementation, the counted
  frames with `ok` true equal the counted frames with `corners` not null,
  **on every seed of every clip**, TRACK frames included.
  - _Basis:_ the probe's GW and GWM rows: ok equals with corners on every
    seed of both hand-held clips, and every TRACK frame there rests on a
    `facing` detection and has corners (the addendum, "What the lock does
    after a mixed-w detection"). On this schedule the TRACK frames are not
    the probe's, which is what makes (c) a prediction.
  - _Refuted by_ one ok frame without corners, on any seed of any clip.
  - _Void_ on a clip where the control's ok equals its with corners on every
    seed: the rule removes nothing (c) can see there.
- **(d) `trackTimeShare`: not registered** (correction 2). The probe measured
  it only on the every-frame schedule, where it cannot respond ("The
  candidates", "Responsiveness"), so no margin can be derived from the probe;
  on this schedule a refusal changes the frames processed, and on it #137's
  G5 moved `trackTimeShare` beyond ±0.5 points on seven of eight seeds of
  each hand-held clip (#137's registration, its addendum, P-G5 (c)). The
  figure is
  printed beside the others and carries no verdict.

Counts are whole frames; "0" and "equal" admit no margin.

## How each is read, as commands

**The two builds.** The base: a worktree at the registration's merge commit.
The implementation: Part 3's commit. Each from a clean tree:

    npm ci && npm run build
    npm run check:provenance         (exit 0)

**C1, at the base**, the original probe script, unchanged:

    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <base replay>
    node docs/benchmarks/2026-11-01-202-stage1-probe.mjs --replay <base replay> --out <base run> > <base run>/stdout.txt
    node --experimental-transform-types docs/benchmarks/2026-11-01-202-stage1-probe.mjs --expressibility > <base run>/expressibility.txt

- Its checks must pass there.
- **It must reproduce the probe's recorded output.** Stdout's line 4 reads
  "built clean at" the build's head. With that hash set to
  `9b387ae28952ae7e37827d3582b686bdad1b8f30`, the head the recorded run was
  built at, stdout's SHA-256 is
  `1ad328812f7040593bc2eb8d82e57e8f91bdccc98af3cafc9e72f3682b131713`. The
  expressibility stdout is
  `039ad945b45bbea8de6d8acfdf519a67aafd6badc41ef930de636e726ec16030`
  unchanged. Otherwise the comparison stops.
- That holds only while stdout's line 3, the tree digests of the code under
  test, is unchanged. Between `9b387ae` and `f872707` only the probe's two
  files changed, and this registration adds one docs file; a merge into
  `dev` that touches `packages/*/src`, `packages/*/dist` or `examples/js`
  before this registration merges would change line 3, and C1 could not be
  read at all. That is a stop, not a ground to edit the expected hash.
- Its GWM rows are `<base run>/<clip>-GWM-s<seed>.jsonl` and its G0 rows
  `<base run>/<clip>-G0-s<seed>.jsonl` (`<clip>` the file name without
  `.mp4`, script line 725); stdout prints each file's SHA-256 (line 1013).

**C1, at the implementation**: **the check copy**,
`docs/benchmarks/<date>-202-stage3-check.mjs`, a copy of the probe script
written in Part 3:

    node scripts/replay-clips.mjs --external 70 --seed 1 --packages bundle --out <tip replay>
    WEBARKIT_ROOT=<implementation checkout> node docs/benchmarks/<date>-202-stage3-check.mjs --replay <tip replay> --out <tip run> > <tip run>/stdout.txt
    WEBARKIT_ROOT=<implementation checkout> node --experimental-transform-types docs/benchmarks/<date>-202-stage3-check.mjs --expressibility > <tip run>/expressibility.txt

Its rows are `<tip run>/<clip>-G0-s<seed>.jsonl`. The wrapper's G0 never
refuses, so at the implementation G0 is the implemented rule. **Lines of the
probe script at `f872707` the copy may change, and nothing else:**

- **line 2 and lines 28 to 92:** the license block's file name and the doc
  comment, naming the copy and this registration;
- **line 100:** `SCRIPT`, the copy's own name;
- **lines 176 to 177:** `CANDIDATES`, the G0 arm only, and its comment;
- **lines 783 to 785:** check J, the DETECT frames of the counted loops equal
  the wrapper's accepted calls with at least 5 inliers. Under the rule an
  accepted call whose `side` is not `facing` ends as a `"not-facing"` LOST
  frame. The copy derives the refusals the rule must make from the calls
  (`ransacOk`, `n ≥ 5` and `side` not `facing`; a failed call carries no
  `side`, script lines 607 to 611), requires the frames of those calls and
  the `"not-facing"` frames to be the same set, each frame carrying its call's
  count, and the DETECT frames to equal the accepted calls less that set: the
  form #137's check 14 took after its review, which can fire when the rule is
  missing;
- **in `report`:** line 921 (stdout's first line, naming the probe), line 974
  (GMP's additivity, which reads GM's and GP's runs), lines 977 to 982 (the
  reconciliation with #137's G5 row, which no longer describes this G0) and
  lines 1000 to 1009 (GW and GWM beside G0, which read their runs);
- **in `expressibility`:** lines 1092 to 1115, the sequences' loop and its
  summary lines, so that it prints, per sequence, every frame reading
  `"not-facing"` with its index, reason and `numInliers`, and every DETECT
  frame as before; and the must-fire and must-not-fire tests of C2, fatal if
  they fail. Line 1100's must-not-fire check stays.

**Kept byte-identical**, among the rest: axis A (lines 127 to 147), the
self-test (lines 223 to 329), the inputs' hashes (lines 331 to 401), the
decoding and schedule (lines 522 to 553), the wrapper (lines 595 to 664),
including its fatal on `det H = 0` (line 634: if the implementation meets one,
the copy stops, and that is a stop), `run` (lines 666 to 708) and every other
check, check D included: G0 on seed 1 against `replay-clips.mjs`'s own
"every frame, sync" export at the same commit, so the copy's decoding is again
proved against the instrument. If the implementation changes a pinned input
(script lines 335 to 343, 380 to 390), the copy is not widened to admit it:
that is a stop. In Part 3's PR, a diff between the original and the copy
shows only the lines above, and the PR carries it.

**Text the copy may not change, stale at the implementation,** as #137's
addendum recorded its own: the tables' "refused" and "refused at G0's
corners" columns (lines 957 to 966), which read the wrapper's refusals and
will show 0, since the tracker refuses and the wrapper does not; line 1010's
"every candidate"; and the header's method items the doc-comment change does
not reach. **No figure is taken from them;** every verdict reads the rows,
through the comparison.

**The comparison**, for C1, a script written in Part 3,
`docs/benchmarks/<date>-202-stage3-compare.mjs`:

    node docs/benchmarks/<date>-202-stage3-compare.mjs --base <base run> --tip <tip run>

- It reads the 24 pairs (three clips, seeds 1 to 8):
  `<tip run>/<clip>-G0-s<seed>.jsonl` against
  `<base run>/<clip>-GWM-s<seed>.jsonl`, by C1's fields, key (`k`) and
  exception.
- It prints, per clip and seed, the rows compared, the frames the exception
  covers, the refused frames on each side, and every differing frame with its
  field and both values, or none.
- It reads only files whose SHA-256 begins with the value the same directory's
  `stdout.txt` prints for them (script line 1013), and checks the base's
  `stdout.txt` against the recorded hash as above. A missing, unlisted, empty
  or unparseable file, or a row without an integer `k` or one of the compared
  fields, fails it (the protocol: a missing input never falls back to a
  default).

**C0**, a script written in Part 3, `docs/benchmarks/<date>-202-stage3-c0.mjs`:

    node --experimental-transform-types docs/benchmarks/<date>-202-stage3-c0.mjs --base <base checkout> --tip <implementation checkout> --base-run <base run>

- It holds the probe's lines 127 to 147 (axis A, with the `BREAK` it reads,
  lines 113 to 122), 522 to 553 (decoding and schedule) and 571 to 579
  (`mulberry32`), byte-identical. On each checkout it runs `NftTracker` from
  that checkout's built `dist/`, with no options, on the three clips at seeds
  1 to 8 and all six loops, every frame, the backend's `estimateHomography`
  given `{ ...options, rng }` as the probe's wrapper gives it (script line
  605) and its result returned unchanged; and the three sequences through each
  checkout's `ground-truth/tracker_sequences.ts`, loaded with the probe's
  resolve hook (script lines 1022 to 1033).
- **Tied to the probe:** on every clip and seed, its base run's DETECT frames,
  their `H` and their axis-A column equal the base probe run's G0 rows
  (`state`, `H`, `gate.side`), frame by frame; on the sequences, its base
  DETECT frames and columns equal the base expressibility stdout's. Otherwise
  it stops.
- It prints, per clip and seed and per sequence, the `facing` DETECT frames
  compared, the frames under the exception, and every differing field with
  both values, or none.

**C2**: the check copy's `--expressibility` stdout at the implementation
(above), against the base's (`<base run>/expressibility.txt`, the recorded
`039ad945…`), by the comparison script with two more arguments:

    node docs/benchmarks/<date>-202-stage3-compare.mjs --base <base run> --tip <tip run> --expressibility

It reads both files' "every DETECT" lines and the copy's `"not-facing"`
lines, and prints, per sequence, every base DETECT frame with its fate at the
implementation: DETECT with the same inliers and column, or `"not-facing"`
with its count. C2's must-fire set is the frames reading `"not-facing"`, its
must-not-fire set the rest. And `npm test` at the implementation, with every
changed ground-truth string reported against its value at the base.

**C3 and C4**: `npm test` at the implementation; the scratch both-ways runs
of C3 and C4, each restored and `git diff`-ed, recorded in the addendum.

**P**: for each seed n from 1 to 8, three runs of the same command, as #137's
P-G5: two at the base (the control, run A, and its repeat, run B) and one at
the implementation (the candidate), each with the build its C1 run used:

    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/A/s<n>
    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/tip/s<n>
    node scripts/replay-clips.mjs --external 70 --seed <n> --packages bundle --out <root>/B/s<n>

- All 24 in one session on one machine, one at a time, seeds ascending, and
  within a seed A, the candidate, B: the scaled step is a wall-clock
  measurement (arm 1's `trackStepMs` p50 times `--device-ratio`), so runs side
  by side would slow each other, and B after the candidate brackets it.
- Each part reads `replay-<clip>-tracking-device-scaled-step-sync.json` for
  each clip, after checking its `seed`, `schedule`, `bundledClip` and
  `packageSource` (the manifest's bundle from a clean tree): (a) the DETECT
  frames with `corners` null and with mirrored corners, per seed, candidate
  and A (A for the void test); (c) the counted frames with `ok` and with
  `corners`, per seed, candidate and A. The reader is a script written in
  Part 3, `docs/benchmarks/<date>-202-stage3-p.mjs <root>`, which refuses an
  export that fails its checks.
- **Beside every figure, not a verdict:** the export's `stepMs`, for A, the
  candidate and B; `runSummary.trackTimeShare.share` for each; and where runs
  A and B differ in any figure (a) or (c) reads, that is reported.

**The new checking code is exercised both ways before its result is read**
(the protocol, "Every check is exercised both ways"), and the cases are
recorded in the addendum:

- the comparison on the base's GWM rows against themselves, as a tip
  directory: no differing frame; one tip row's `state` changed outside the
  exception: that frame reported, and only it; `inliers` and `reason`
  changed on an exception frame: nothing reported; a file whose SHA-256 is
  not its listed one, and a base stdout that is not the recorded one: each
  refused;
- the copy's check J, run against the base checkout (where the rule is
  missing): it exits 1, naming a frame whose accepted call is not `facing`
  and which is DETECT;
- the copy's C2 tests, with the must-fire set changed to a frame that is
  accepted: it exits 1;
- C0's comparison, as under C0 above;
- P's reader: an export with its `seed` changed, an export removed, the A
  and candidate runs swapped: each refused; and on a known positive, a
  control export of a hand-held clip, it counts DETECT frames with `corners`
  null above 0, so it can see what (a) reads.

## What a failed criterion means

A criterion that fails is never edited. Its result goes in an addendum beside
this registration, and an addendum may be added more than once; each one
stands (Stage 3). The results of C0 to C4 and of each registered part of P go
in such an addendum, with the commands, the figures and one verdict each:
**held**, **refuted**, or, for a part of P, **void**.

- **C0 to C4 refuted:** Part 3 stops before the PR. The implementation is not
  the treatment registered here, or not the rule that was measured.
- **The base run not reproducing the probe's recorded output, a check of the
  copy failing, or a changed ground-truth string:** a stop of the same kind,
  reported with what differs; a changed string is the maintainer's to accept.
- **P refuted:** recorded, and the PR proceeds. The rule does not change:
  changing it is a new probe.
- **A part of P void:** recorded as void, never as held, and the PR proceeds.

## What this registration does not register

The probe's list ("What this probe does not establish"), carried over:

- **That any refused fit on the clips was wrong, or any kept one right.** The
  clips carry no ground truth (#92's block); only the sequences do.
- **The `facing` wrong detections:** leave-and-return frames 70 to 72,
  `facing × two`, 11 to 37 inliers, 51.964, 19.065 and 9.779 px from the
  truth, pass the rule. No geometric rule reaches them; #92 holds that
  question.
- **A must-fire set for GM's part.** No input with a known answer produces a
  reversed `H`; GM's part rests on geometry, and its acceptance is C1 on the
  replay and C3's constructed case.
- **The demo's 40 poses** (#202's body): the demo's session was not replayed,
  and its schedule and seeding are unknown.
- **The sequences on more than one seed.**
- **Any device figure.** Every run here is a desktop replay.
- **P (b) and (d) on the scaled-step schedule** (above).
- **#42's condition**, read on the probe's hull figures and not triggered; not
  decided here.

## The independent review, and what it changed

A reviewer subagent, briefed with the protocol, the brief's requirements, the
maintainer's rulings and the sources, but not this session's reasoning, read
the draft at `f872707` before any commit. It checked every line citation and
figure and found no critical finding. As applied:

- **Important:**
  - The draft said no scaled-step run existed at this base. The probe's own
    seed-1 replay ran that arm. Now disclosed in Step 0, as existing and not
    seen.
  - C2 cited lines 207 to 209 as the shipped target's arm. They are the
    fixture target's. The shipped arm is lines 374 to 378, and C2 now names
    both, with the frames-39-and-68 assertions and the tests' titles.
  - P (a)'s void test was joint, so GM's half could read as held without
    ever being seen. It is now per half.
  - The treatment said C0 covers every frame the rule passes. C0 compares
    `facing` DETECT frames only, and the sentence now says so. TRACK frames'
    full results are compared by neither C0 nor C1, which is recorded. C0
    was not widened beyond the ruling.
  - C2's must-not-fire needs the base's expressibility stdout beside the
    tip's. It now has a command.
- **Minor, applied:**
  - C1 is blocked if a merge changes the hashed trees before this file
    merges.
  - The copy's stale text is listed, with "no figure is taken from them".
  - The copy's header range is narrowed to lines 2 and 28 to 92.
  - Check J now filters `ransacOk`.
  - P (a) counts zero-area corners apart.
  - P's reader has a known-positive case.
  - C3 and C4 now have an over-refusing case.
  - `acceptingWith`'s lines are corrected, and it returns a fixed `H` today.
  - An unsourced "comparable reach" for #137's G5 is replaced by its
    measured movement.
- **Confirmed, no change:**
  - The base reproduction rule (line 4 is script line 929's).
  - The check copy's ranges are sufficient for a G0-only run.
  - Both P equivalences hold.
  - The derived string is consistent (no randomness drawn by frame 70's
    tracking step at the base).
- **Not applied:** none of its findings was rejected.

## Constraints kept

One file, this one. No code, package, lockfile, tsconfig, target, clip or
fixture touched; no export committed. No CHANGELOG line: a registration, no
behaviour change. No issue commented on, edited or closed.
