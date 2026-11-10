# #243, M9's registration: the arms and the runs, the declared covariates, the criteria, the validity rules, the pre-flight and the runbook (2026-11-10)

**M9's step 4 (milestone 11, "Before the first counted run", item 4), under
[the step protocol](./step-protocol.md), Stages 2 and 3. Written before any M9 device run, from the
desktop Stage 1 probe, [`2026-11-10-243-stage1-probe.md`](./2026-11-10-243-stage1-probe.md) (#249),
called "Stage 1" below, and from the decisions in
[#243's comment of 2026-11-10](https://github.com/webarkit/webarkit/issues/243), called D1 to D7 there and
here. It registers no code. What it needs is named in "What must exist before the pre-flight", and
is made in one later PR. After this record's merge, the plan changes only by a dated addendum to it,
and only before the pre-flight. The pre-flight freezes the plan and the instrument together. By the
step protocol's Stage 3, these criteria are registered in their own commit, which carries this file
alone and is cited by its hash, so the PR that carries it merges with a merge commit and is never
squashed.**

**The draft put ten choices to the maintainer.** Each is recorded where it applies, as "the
maintainer's ruling of 2026-11-10", with the draft's argument kept beside it. He also accepted the
draft's corrections of the brief's citations (Step 0) and ruled that the two scripts be made in one PR.

## Step 0: provenance and the brief check

- **Ref:** `docs/m9-registration`, branched from `origin/dev` at
  **`d859a228a5f8f8840d0614c30ad8b891c0832353`** (the merge of #249), after `git fetch origin`. Node
  v24.21.0, the `.nvmrc` pin; npm 11.19.0; Windows 11 Pro, Git Bash; the maintainer's PC. The session
  ran on Claude Opus 5.5 with the advisor tool. The tool names no model.
- **`npm ci`, then `npm run build`, then `npm run check:provenance`:** exit 0, "describes this tree:
  HEAD d859a228…, clean". The manifest reads bundle
  **`6d07b0c25475830458b68c6ef53c221fd4a3848c00bad1a62adbafcc95b074f2`** (350,665 bytes). Stage 1's
  base, `f49f166`, read the same bundle: #249 changed nothing the bundle embeds.
- **The inputs at this head,** SHA-256 on disk:

  | File | SHA-256 |
  |---|---|
  | `examples/targets/pinball.wnft` | `9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282` |
  | `examples/videos/pinball-static.mp4` | `978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6` |
  | `examples/videos/pinball-bench-table.mp4` | `06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d` |
  | `examples/videos/pinball-bench.mp4` (the wall clip) | `6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d` |
  | `examples/videos/pinball-tilt-cross.mp4` | `3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e` |
  | `scripts/stall-check.mjs` | `8d1b3abf63ec17840351e82f3262ab8f74bbd3108575686d284da733b17c2983` |

  The target's hash is M4's, the one `AGENTS.md`'s rule reads, and the cross clip's is the one
  `examples/README.md` gives.
- **What was read, and how much of it.**
  - **Whole:** `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, the step protocol, Stage 1, #228's registration
    and its metric addendum (2026-11-07), milestone 11's description, and #243 with its comments.
  - **In part:**
    - **`docs/benchmarks/README.md`:** M3's "A device session", its thermal rule and runbook steps 9 to
      12; M4's 2026-10-06 runbook, the 2026-10-13 setup, pre-flight and validity rules; the null control's
      jitter clause, items 1 to 3 and 5 to 6; round 0's procedure and result; "The instrument, the
      subject and the inputs"; the 2026-10-19 closing criterion; and the 2026-10-23 entry.
    - **#228's repeat:** its figures first, and section C whole. B and E only through the figures first,
      and through the registration's citations of them.
    - **#228's first record and the guard's addendum (2026-11-06):** headings, with their figures read
      through the registration and the metric addendum, which cite them.
    - **#239's probe:** its opening and figures first.
    - **`examples/README.md`:** the bench page's section, its URL parameters, the run protocol and session
      runs, and the clips.
    - **#135, #196, #123 and #227:** the closing or last comments.

    Every figure quoted below is from a passage read, and a figure taken through a citation says whose.
- **What held when read against the sources:**
  - milestone 11's description;
  - #243's body and its two comments, the one of 2026-11-10 with D1 to D7;
  - Stage 1's Q1 to Q5, as the brief cites them;
  - #228's registration and its metric addendum; the repeat where read;
  - #239's probe where read;
  - `examples/README.md` on `?run=`, `?seed=`, `?poseFilter=`, session runs, `--transfer` and `--sequence`;
  - `TILT_BORROWED_ACQUIRE_MS` (`scripts/replay-clips.mjs:306`);
  - `DEFINITIONS.protocol` (`examples/js/bench-definitions.mjs:129`);
  - #135's and #196's decisions, in their closing comments;
  - #227's finding;
  - M4's setup, validity rules, null control, round 0's procedure and the 2026-10-23 entry, all in
    `docs/benchmarks/README.md`.
- **What differs from the brief. None of these changes what is asked. The maintainer accepted each
  correction on 2026-11-10, and the record uses the corrected wording throughout:**
  1. **"The thermal rule and the run order, as M4's."** M4 registered neither for a counted round. Its
     plan says "the run order, the validity checks beyond those three, and the stopping rules" were
     "not written yet" (README, the 2026-10-13 entry), and its campaign closed before they were
     (2026-10-23). The order M4 did register is round 0's, S W W S S W W S. The thermal rule in the
     record is M3's: the 2026-09-29 plan, "The thermal rule, registered before the session", and its
     runbook's step 9. That rule guards against a slowing the worker path causes, with bounds from M3's
     tuning round 2. This record takes from round 0 only that a block's runs are consecutive, back
     to back. Its order is not round 0's: round 0 interleaved two arms, and M9 runs eight runs of one
     clip ("Seeds, runs, order"). Its thermal reading is V9, below, which quotes M3's bounds as M3's.
  2. **"Start's provenance check on every session run (#135 …)".** Start's check is #110's. #135 decided
     a build warning and left the place of `check:provenance` in the runbook to this record. Both are
     placed below.
  3. **"gzip past 20 MB (README, 'A device session')".** The rule is in M3's "A device session"
     (2026-09-28). It adds that `scripts/compare-bench.mjs` and `replay-clips.mjs --sequence` "then
     learn to read `.json.gz`". Neither does today: no `.gz` reader exists under `scripts/` or
     `examples/js/`. So the rule's premise does not hold today. See "Storage" below.
  4. **"`sessionRunGaps` … whether a filtered run counts".** Measured here, not argued from the text. A
     constructed tracking export with `tracker.options.poseFilter` `{ mode: "one-euro" }`, a `poseGuard`
     key and `seed` 7 gets no gap from `sessionRunGaps` at this head: the function checks
     `TUNABLE_TRACKER_OPTIONS`, which has neither option, and never reads `seed`. So `protocol.sessionRun`
     cannot tell the arms or the seeds apart, and V6 below reads them.

## What M9 measures, and why one export is enough

D1, quoted: "IPPE against the closed form (CF) against the guard, below 10° and across the cross clip's
crossing. The One Euro filter on against off, at rest, on the static clip. Above 10°, only the corner
distance, as a descriptive reading. No filter lag and no accuracy: stability only, as `poseJitterPx` and
`poseSpreadPx` read it."

**Every arm comes from one unfiltered export** (Stage 1, Q1, Q5). The pose does not feed back into
tracking, and the export carries `H`, `processingResolution` and `poseCorners` at full precision, so:

| Arm | Derived from one counted export, as Stage 1 derived it |
|---|---|
| **IPPE** | the export's `frames[].poseCorners`, as written. The tracker's selection, unfiltered and unguarded |
| **CF** | `closedFormPose(H, K)` with `K = intrinsics(processingResolution)`, the frame's own `H`, projected onto the target's corners as `frameRecord` projects them (`poseCornersOf`), imported, not copied |
| **GUARD** | CF's corners where `tiltDegOf` of CF's `R` is below 10°, the export's `poseCorners` at 10° and above, and the export's `poseCorners` where CF's `good` is false, as `guardPose` decides (`pose_guard.ts`) |
| **FILTER** | Route (b), as ruled below: `PoseFilter` at the package's defaults, fed the pose recovered from the export's `poseCorners` (a four-point homography from the target's corners, then the closed form), stamped with the export's own `timestampMs`, its reset rule fed the export's `state` and `ok` |

**Why this design, in one sentence: every comparison of the campaign is between arms on the same
frames of the same run, so the frames' pixels are identical by construction.** Three consequences:

- D3's condition, "arms are compared on pixel-identical frame pairs wherever the measurement allows",
  holds by construction for every criterion below. Frame fidelity (#227) reaches no criterion. It reaches
  only the spread between runs, where it belongs to the noise (README, the null control's jitter clause:
  "In a calibration of noise, it is part of the noise and must stay in").
- The step protocol's Stage 2 rule, "the arms are compared on the frames both posed", is met by
  construction. The selection only has to require that both arms have corners on a frame.
- **A conjecture, not measured:** a state that moves between runs, such as heat or the slow state #123
  holds, does not enter a paired difference, because both arms share every frame and every moment. That
  holds if the state acts on the frames and not on how each estimator reads them. #123's state is
  unexplained, so whether it could act on IPPE and CF differently on the same frame is not known.

**Below 10° the guard is CF on every frame** (Stage 1, Q4: checked frame by frame, fatal). So below 10°
the record registers one comparison, CF against IPPE, and the guard only across cross's crossing.

### The filter's route

**The maintainer's ruling of 2026-11-10: route (b) for every counted reading. No filtered run is
counted. The pre-flight has one filtered run, only to confirm the parameters the page records.** The
argument it accepted:

- **Against D1:** D1 compares "on against off". Route (b) reads both from one run, on the same frames, the
  same stamps and the same pixels. Route (a) reads them from two runs, so its difference carries
  everything that differs between two device runs. That is the selection confound the Stage 2 rule
  exists for, plus frame fidelity, which (a) cannot hold apart (#227).
- **Against the device's wall-clock stamps (Stage 1, Q2):** the filter reads `timestampMs`. A device run
  stamps `performance.now()`, so a filter carried across each wrap is the device's condition, not the
  replay's media-time stamps. Route (b) uses the export's own stamps, the very ones the page's filter
  would have read on that run. Route (a) uses them too, but on another run.
- **What (b) costs:** it reproduces the tracker's filter to 5.12e-13 px, not bit for bit (Stage 1, Q1), on
  a difference of 0.0708 px. That is eleven orders of magnitude, so rounding cannot move a sign. Its
  correctness rests on the code path, quoted in Stage 1 (Q2: `t0` to `tracker.process` and to
  `frameRecord`'s `timestampMs`), and on Stage 1's control: the true input fed to the same harness
  reproduces the tracker's output bit for bit on all 34,880 frames, on both clocks.
- **Why a filtered export cannot check (b) frame by frame.** The filter's input is the unfiltered
  selection, and a filtered export records only the filter's output: its `poseCorners` are the
  filter's (Stage 1, Q5: "in a filtered run, the unfiltered selection, since its `poseCorners` are the
  filter's"). `H` does not give the input back either, since CF on `H` is not the selection (Stage 1,
  Q1: off by up to 2.0737 px after the filter). So no frame of a filtered run has both (b)'s input and
  the page's output, and (a) against (b) exists only between two runs, on different frames. Such a
  comparison is a reading that cannot fail. **So the pre-flight runs one filtered run for one thing
  only:** the filter's parameters as the page records them (`tracker.options.poseFilter`). They must
  equal the package defaults the analysis imports (1, 10, 1, 0.1, 1, as Stage 1 asserted them), or the
  campaign stops. Its pose figures are not read.
- **Two fatal checks of (b),** in the analysis, before any figure:
  - **An `ok` TRACK frame whose `poseCorners` are null for a reason the filter does not reset on,** on
    any frame of the run, warm-up loop included, since the filter carries from it into the counted
    loops. The tracker resets on a null pose, a state other than TRACK, a pose that is not good or a stamp
    that does not advance (`pose_filter.ts:263`). `poseCorners` is null for a pose that is not good, where
    the tracker resets too and (b) reproduces it. But it is also null when a corner's depth is not
    positive or a projection is not finite (`DEFINITIONS.poseCorners`), and the filter does not reset
    there. An export cannot tell these cases apart, since it carries no `good`. So the check fires on
    every `ok` TRACK frame with null `poseCorners`, the reproducible case included. Its cost is a stop,
    never a wrong figure: it fails rather than guess. Stage 1 met none. #228's metric addendum records the depth
    rule firing once in the corpus, in a warm-up loop (M2), which is why the warm-up is read.
  - **The recovered pose reprojects the export's `poseCorners`** within 1e-9 px. Stage 1's largest was
    1.45e-12 px.

### #248's two questions, settled for this campaign

**(i) The maintainer's ruling of 2026-11-10: a filtered run is not a counted run of this campaign,
whatever its `protocol.sessionRun` reads, and validity rule V6 reads the filter setting, the seed and
`metricsVersion` on every counted export. `DEFINITIONS.protocol` and `sessionRunGaps` stay unchanged.**
**Why V6 exists:** `sessionRunGaps` would not refuse a filtered export. Found in the code and confirmed on
a constructed export (Step 0, item 4): it reads only `TUNABLE_TRACKER_OPTIONS`, which does not hold
`poseFilter`, and it never reads `seed`. `DEFINITIONS.protocol` names `?tracker=`, so a filtered run at
otherwise-default settings exports as a session run. Under route (b) the question touches no counted
reading. The one filtered pre-flight run carries `?run=` only so that Start checks its provenance.

**(ii) The maintainer's ruling of 2026-11-10: `--transfer` plans no filtered cohort and is not run in this
campaign. #248's refusal of filtered exports stays.** No
criterion below needs a desktop replay of a device schedule, since every arm is computed from the device's
own export. Whether it should ever plan filtered cohorts is a question for a campaign that compares
runs. This one does not.

Neither answer needs a code change.

### Seeds, runs, order

**The maintainer's ruling of 2026-11-10: eight consecutive runs per clip, all `?seed=1`, in the order
static, cross, table, wall, across two sessions.** **Generality over
seeds rests on Stage 1's replays, seeds 1 to 8, where every readable comparison kept one sign over all
eight. The device runs measure the device's run-to-run spread at one seed.** The argument it accepted:

**Every counted run seeded with `?seed=1`, policy `frame`, the same seed in every run.**

- **Why seeded.** An unseeded run draws RANSAC from `Math.random`. Its draws would then enter the
  spread between runs, which the criteria are read against. On the table clip that draw spread is about
  0.29 px over seeds 1 to 8 (Stage 1, Q4), larger than some differences the plan reads. Seeding holds the
  draws at each media time. What still varies between runs is the device: which frames it processes,
  their timing, and their pixels (#227). That is the run-to-run spread the brief asks for.
- **Why one seed and not 1 to 8.** Varying the seed would add the draw spread back into the spread. The
  replays already measured the draw spread, at seeds 1 to 8. A pairing of device run k with replay seed k
  would be weak, since the device detects at media times the replay's schedules do not.
- **What it costs:** the device figures belong to seed 1's draws at the media times the device detected.
  On the static clip that is a single detection a run, and the seeds were one observation there anyway
  (Stage 1, Q2).

**8 consecutive runs per clip, one block per clip.**

- **Why 8:** 7 degrees of freedom, as round 0's s₀ had. On 7 degrees of freedom the 95% interval for σ
  runs from 0.661 s to 2.035 s, as round 0's s₀ interval did, against a factor of about seventy on one
  (the step protocol, "What the record says afterwards", which gives the one-degree figures).
- **Why consecutive:** these are the consecutive baselines #123 and the milestone ask for. Every run of a
  block is the same URL apart from `run=`, so each is a baseline of the others.
- **Blocks and sessions:** no figure pools two blocks (the README's null control clause: "no comparison
  ever spans two blocks"), and a block is not repeated across sessions, which is this plan's own choice.
  Each criterion is read on one block, one clip. **What that costs:** a held result covers one block in
  one session. It cannot say
  whether the direction holds in another state of the device, which M4's design meant blocks repeated
  across sessions to test ("Blocks are repeated across sessions to see whether an effect holds across
  states"). Repeating the four blocks in a second pair of sessions would double the device time. That is
  not in the plan as ruled.
- **The order:** static (runs 1 to 8), cross (9 to 16), table (17 to 24), wall (25 to 32). Static first
  because the filter and the cleanest CF − IPPE reading rest on it, and cross second because the guard
  does. No counterbalancing is planned: both arms of a difference share every run, so a run's position
  can confound a difference only through the conjecture above, that a moving state acts on the frames
  and not on how each estimator reads them.
- **Two counted sessions,** so that neither runs on a partial budget: session A is static and
  cross (runs 1 to 16), session B is table and wall (17 to 32). The estimate is about 3.5 minutes a run,
  5 loops plus 120 s idle, so about an hour a session.
- **Mid and sweep are not run** (D4: optional). Five loops of sweep are 4,340 frames, and of mid 3,285.
  A device that processed more than 2000 of them would overflow `?window=2000`, and the run would not be
  a session run (`ticks` ≠ `windowSize`). What they could add above 10° is descriptive only, and the
  corner distance on cross covers it.

## Stage 2: the declared covariates

**The control arm** is IPPE's export itself: `H`, `state`, `numInliers`, `mediaTimeSeconds`,
`timestampMs`, the timings. Every covariate that selects frames is a function of `H` or of tracking. By
Q1 no arm changes `H` or tracking, so these are the control's values and every arm's (Stage 2, first
rule). **Every selection reports its frames, its windows (`jitterWindows` of `cornerJitter`) and the
frames per window, and names the windows it emptied** (Stage 2, third rule). Each is reported per clip
and per run, in the session's addendum.

| Covariate | Computed per frame as | Where it is reported | The sign it could move, and the replay figure behind it |
|---|---|---|---|
| **Tilt** | `acos(clamp(R[8], −1, 1))`, degrees, of `closedFormPose(H, K)` on the frame's own `H`; none where CF's `good` is false. Selects "below 10°": tilt < 10. Bands as #228's registration: 0–1, 1–3, 3–5, 5–7, 7–10, 10–15, 15–20, 20–30, 30–40, over 40 | per clip and run: frames, windows and the CF − IPPE difference per band, beside each criterion | CF − IPPE, device schedules: static −0.1498 at about 2.9°; table −0.957 to −0.568; cross −0.094 to −0.089, borrowed; the sign is not consistent above 10° (#228's repeat, B) |
| **State** | `state`, DETECT or TRACK | every criterion read on its selection and on that selection's TRACK frames, side by side | table −0.9569 / −0.5981 / −0.5684, against −0.9618 / −0.6027 / −0.5684 on TRACK frames (Stage 1, Q4) |
| **Inliers** | `numInliers` | beside the most influential media time of each criterion, and beside each guard switch | the wall clip at 15 ms: one TRACK frame on 26 inliers multiplies CF − IPPE twelvefold, −0.0032 to −0.0373 (Stage 1, Q4) |
| **The loop's wrap** | a step back in media time between consecutive frames (`isLoopWrap`); a switch or a window at a wrap reported apart | per run: the wraps, the switches at a wrap, the filter's reading with and without the windows after a wrap (P7) | the filter: −0.0708 with media time 0.000, −0.0923 without (Stage 1, Q4); 3 guard switches a run at the wrap on cross, a DETECT frame, 0.00 px |
| **The schedule's timing** | the gaps of `timestampMs` and of media time between consecutive processed frames; `acquire` and `total` p50 over counted loops; frames processed per loop | per run, beside every reading. Not a selection | the replays model 66.7 ms and its multiples (Stage 1, Q2); the device's spacing is not that, and none is invented. The filter reads it |
| **Frame fidelity** (D3, #227) | measured in the pre-flight (item 4) as a share; not per frame in counted runs, which carry no pixel hash | the pre-flight's record; beside the spread of every criterion | none: no criterion compares two runs' frames (above). The share bounds what the spread between runs contains |
| **`K` assumed** | `intrinsics(processingResolution)`, 60° of horizontal field, the same for every arm; declared, not per frame | beside every figure and every claim about the guard | the crossover itself (#228's repeat, E) |

**K assumed, 2026-11-10.** Every figure of this campaign uses `intrinsics(w, h)`, 60° of horizontal field
of view: 175.80 px at the static, table and tilt clips' 203 px of width, 415.69 px at the wall clip's 480.
So every tilt, the frames counted below 10°, the guard's switches and the crossing's media time belong to
the assumed camera. **What that limits:** the guard's 10° is a read tilt, not a true one. At the
maintainer's figure of about 1005 px at 720 px of width (#228's repeat, question E, which records it as
the maintainer's figure, not measured in this repository), a true 10° reads 6.33° (#228's registration,
Stage 3 A, "The scope": "at 1005 px, true 10° reads 6.33°"). The selection "below
10°" and the switch's place on cross therefore hold for this `K` only. No result here says where IPPE or
CF is better for a real camera. That is #109's.

**Reporting rules,** #228's registration's three, kept:

- **A figure one frame can move is read with and without that frame.** The procedure for device data is
  in "How each criterion is read", below. By the jackknife rule, a deletion from a window at exactly four
  frames drops the window, so `n` stands beside it.
- **A seed is not a replicate of the noise.** A run is. The spread a criterion reads is between runs.
- **A single TRACK frame on 8 or 9 inliers** is named when it carries a reading.

## Stage 3: the criteria and the predictions

### How each criterion is read

**One run gives one paired difference.** For a comparison "Y − X" on a selection S of a run's counted
loops, d = J(Y on S) − J(X on S). J is the frozen `cornerJitter`, imported, with its `include` option. Its
`corners` are the arm's corners, and S is the frames where both arms have corners and the covariate's
rule holds, as Stage 1 read it. The 8 runs of a block give d₁ … d₈.

- **The run-to-run spread** is s_d, the sample standard deviation of the d's, on 7 degrees of freedom.
  Each arm's own spread, s of its reading over the 8 runs with its 95% interval, s × [0.661, 2.035], is
  reported beside it. These are the consecutive baselines' figures.
- **The interval:** d̄ ± t(0.975; 7) × s_d ÷ √8, with t = 2.3646.
- **The count:** the runs whose d has the predicted sign, of 8.
- **The most influential media time,** per block. Candidates are the media times in S of any run, keyed
  as `compareExports` keys them (`mediaKey`). For each candidate, drop it from every run that holds it,
  recompute each d, and take the median over the 8. The candidate that moves the median most is it, ties
  to the earliest media time. Stage 1's procedure, with runs in place of seeds. The criterion is then read
  again without it, its media time, state, inliers and tilt beside it.

**Three outcomes, and none is a default:**

- **Held:** with the most influential media time and without it, the interval lies wholly on the
  predicted side of 0, **and** at least 7 of the 8 d's have the predicted sign. Each sign count alone
  has a one-sided binomial probability of 9/256 = 0.035 under no effect.
- **Refuted:** the same, on the opposite side: with and without it, the interval wholly on the other
  side and at least 7 of 8 d's of the opposite sign.
- **Not shown:** anything else, including held with the frame and not without it. It is recorded as
  "not shown", never as "no effect".

**The margin.** Each prediction states its replay figure from Stage 1, device schedules, as its basis.
**The device's magnitude is unknown.** The replays model which frames a device processes, not its timing
or its frames' fidelity (Stage 1, "What this probe does not establish"). So no criterion registers a
magnitude. Each registers a direction against the device's own spread. The replay figure stands beside the
device's d̄ as a reading.

### The criteria

| | Comparison, clip, selection | Predicted direction | Basis (Stage 1, device schedules: Q4; P6 Q3) | Refuted by |
|---|---|---|---|---|
| **P1** | CF − IPPE, static, below 10° (every posed frame; 2.83° to 3.05°) | negative: IPPE jitters more | −0.1498, the 8 seeds one observation; −0.1421 without 7.666667 s | the interval above 0 and 7 of 8 d's positive, with and without the frame |
| **P2** | CF − IPPE, table, below 10° | negative | −0.9569 / −0.5981 / −0.5684; spreads 0.290 and 0.241 over seeds; without 8.466667 s: −0.9569 / −0.4436 / −0.4210 | the same, positive |
| **P3** | CF − IPPE, cross, below 10° | negative | −0.0944 / −0.0896 / −0.0888, **on the borrowed acquisition**; without 0.166611 s: −0.0861 / −0.0833 / −0.0786 | the same, positive |
| **P4** | GUARD − IPPE, cross, the whole clip | positive: the guard jitters more than IPPE across the crossing | +0.1283 / +0.1315 / +0.1328, borrowed; without 8.330744 s: +0.0931 / +0.0963 / +0.0975 | the interval below 0 and 7 of 8 negative, with and without |
| **P5** | GUARD − CF, cross, the whole clip | positive | +0.1892 / +0.1903 / +0.1906, borrowed; without 8.330744 s: +0.1544 / +0.1554 / +0.1557 | the same, negative |
| **P6** | the guard's switches in the footage, cross, per counted loop | exactly one per loop, near the crossing | one per pass at 8.331 s, tilt 9.99° to 10.17°, a 4.41 px jump, in all 8 seeds, borrowed; 3 a run at the wrap, on DETECT, apart | below |
| **P7** | FILTER − IPPE (filter on − off), static, the whole clip; and the same without the first window after each wrap | negative: the filter steadies the pose | −0.0708, one observation; −0.0923 without 0.000 s | the interval above 0 and 7 of 8 positive, with and without the frame, on both readings (below) |

**P2, P3:** read on the selection and on its TRACK frames. A criterion holds only if it holds on both, and
is refuted only if it is refuted on both (the State row), since the whole selection holds detections on the
hand-held clips. Any other pair of outcomes is "not shown".

**P4, P5, the crossing.** Stage 1 conjectures, without measuring it, why the guard reads above both arms.
The 4.41 px step falls inside one one-second window, [8, 9) s, where the metric fits one line through both
estimators. These two criteria predict that reading on the device. They do not claim that the guard is
less stable at rest.

**P6, the switch count.** A switch is a change of estimator between two consecutive counted frames that
both have a tilt and both arms' corners. One at a step back in media time is counted apart, as the wrap's.
The tilt is a function of `H` alone, so the count is the control's.

- **Held:** every one of the 32 counted loops (8 runs × 4) has exactly one switch in the footage, at a
  media time from 7.797 s to 8.831 s.
- **Refuted, chatter:** at least two of the 8 runs each have a loop with three or more switches in the
  footage. Three or more is the guard switching back and forth near 10°.
- **Not shown:** anything else. That includes a loop with no switch, or with two, where frames posed on
  one side only leave the crossing unread. The loop and its frames are named.
- The media time window is taken from the replays' crossings, 8.297 s (every frame) and 8.331 s
  (device schedules, borrowed), each widened by half a second, to 7.797 s and 8.831 s. On the device's
  frames the crossing falls at the first processed frame whose tilt reaches 10°.
- **The pre-flight's cross run does not preview P6:** its checks-only analysis computes the tilt on every
  frame but counts no switch, and prints no tilt by media time.

**P7, the wrap.** On wall-clock stamps the filter carries across every wrap (Stage 1, Q2), so the corners'
jump at the loop is spread over the frames after it. Stage 1 gives the jump as about 3 px, citing the
tracking mode's plan, and conjectures that this is why a reset lowers the jitter. Dropping one media time
cannot remove that. **The maintainer's ruling of 2026-11-10:** P7 is read twice, on the whole clip (D1's
"at rest", as Stage 1 read it) and on the clip without the window of media time [0, 1) s of each counted
loop, the first second after each wrap, and holds only if both agree. The window is taken from the control
arm's media times, so it selects nothing on the outcome. Each reading has its own outcome, by "How each
criterion is read", and P7's is:

- **held** when both readings are held;
- **refuted** when both are refuted;
- **not shown** otherwise. Where the whole clip is held and the reading without the wraps is not, the
  record also says that the filter's reading is the wrap's.

**The tilt clips' acquisition was borrowed.** The pre-flight measures the real one (item 2). Nothing in a
criterion depends on it: each criterion registers a direction against the device's own spread, read on
the device's own frames, and the replay figures are a basis, not a threshold. **What changes if it
differs:** only the label. P3 to P6's basis is a replay on an acquisition the device does not have, and
the record says by how much. `TILT_BORROWED_ACQUIRE_MS` is not changed, and the replay is not run again:
changing a script after the pre-flight would break the freeze, and before it, a new replay would only
re-label a basis that no criterion reads.

### Descriptive readings, never criteria

- **CF − IPPE below 10° on the wall clip. The maintainer's ruling of 2026-11-10: descriptive only.**
  Stage 1 found it
  not readable on the replays. At 25 ms the sign is 2 above and 6 below, and turns to 6 above and 2 below
  without one media time. At 15 ms one media time moves −0.0032 to −0.0373. A prediction on a sign the
  corpus already shows unstable would be read as a criterion that "failed", where the record already knows
  the corpus cannot express it (Stage 1 of the protocol: "rescoped to what the corpus covers"). It is
  reported in the criteria's form, d̄, the interval, the count and the media time, labelled descriptive.
- **Above 10°: only the corner distance** (D1). Per run and per band from 10–15° up: the median over the
  band's common frames of the mean distance between one frame's four corners in the two arms, CF to IPPE,
  as `compareExports` computes `poseCornerDistancePx`. It is read by calling that function, unchanged, on
  two exports built from one: IPPE's, and a copy with CF's corners. `compareExports` takes no selection
  and reads every frame, the warm-up loop included, so in both copies `poseCorners` is set to null outside
  the band and outside the counted loops before the call. #228's repeat reads 6.17 px at 10–15° on
  cross, at every frame (its figures first). No jitter difference is read above 10°, and no direction is claimed there.
- **FILTER − IPPE's corner distance** on the static clip, the same way, outside the counted loops nulled:
  the offset and lag the jitter
  metric cannot see, with no truth in it.
- **Each arm's `poseSpreadPx`.**

### What a failed criterion means

A criterion that is refuted, or not shown, is never edited. Its result is recorded in an addendum beside
this file, and addenda may be added more than once, each standing. **Refuted** means the device reverses
the replays' direction on this footage and this `K`: a measured result, M9's answer for that regime.
**Not shown** means the device's spread or one frame leaves the direction unread. It is not "no effect",
and a void reading (a selection with no window) is recorded as void. No failed criterion stops the
campaign, and no criterion is re-run to make it hold. A failed **validity** rule (below) invalidates the
run, never the criterion.

**No accuracy and no lag.** Every criterion is in jitter, and `poseJitterPx` reads jitter, not accuracy,
and cannot see a constant offset, nor at a constant rate a constant lag (`DEFINITIONS.poseJitterPx`). A
held P1 says IPPE's pose moves more about its own line below 10° on this device, with this `K`. It does not
say IPPE's pose is further from the truth. A held P7 says the filtered pose moves less. It says nothing of
the delay the filter adds.

## Validity rules, read at analysis time from each committed export

In M4's form (README, the 2026-10-13 entry). **V1 to V8 are the run-level rules:** the run check reads them
right after each run, and a run that fails one is not counted and is re-run as the stopping rules say.
**V9 and V10 are readings, not gates.** **V11 is the analysis's:** it is read only after a block's eighth
run, when no at-once re-run is possible, so a V11 failure stops the analysis of that block, and the
maintainer rules on what follows, as for a second failure in the stopping rules.

- **V1. `run.failure` is `null` and `run.endedBy` is `"done"`.**
- **V2. The manifest is the freeze's.** `provenance.manifest.head` equals the freeze's head, compared in
  full. `clean` is true and `dirtyPaths` empty, the two compared with each other (#119). `bundle.sha256`,
  every entry of `served`, `sources`, `toolchain`, `dependencies` and `build`, and every other field of
  the manifest, equal the freeze manifest's, field for field. Only `builtAt` may differ.
- **V3. The parameters are the pinned string's, exactly.** The field check and the recorded URL
  (`<export>.url.txt`), as M4's rule 3. Both must pass. The pinned string is in the runbook.
- **V4. The inputs.** `target.sha256` is `9e8eb486…`, in full (`AGENTS.md`: the target's SHA-256 stays the
  one recorded at the campaign's start; this campaign's start is its pre-flight). The clip is read beside
  the export, as M4 read it from round 1 (#126): `<export>.clip.txt` holds the SHA-256 of
  `examples/videos/<clip>` on the serving machine, with its UTC time, when the URL is opened and again after
  the export is pulled. Both equal Step 0's table.
- **V5. Provenance at Start.** `provenance.refusal` is `null`. Every `provenance.observed.served[path]`
  equals `provenance.manifest.served[path].sha256`, and `observed.bundleSha256` equals
  `manifest.bundle.sha256`.
- **V6. The arm and the draws.** `metricsVersion` is 2, and `tracker.options.poseFilter` is `{ mode: "off" }`.
  `tracker.options` holds no `poseGuard`, or one with `mode` `"off"`. `seed` is 1 and `seedPolicy` is
  `"frame"`. `protocol.sessionRun` is true with no gap. V6 exists because `sessionRunGaps`, which produces
  `protocol.sessionRun`, reads none of the others (Step 0, item 4).
- **V7. The link.** No drop, attested by the link monitor as M4's setup item 4 defines it, its log beside the
  export as `<export>.link.txt`.
- **V8. The loops.** The page's loop-wrap rule refused nothing. A run it refuses is a rejected sample, and
  its export, if the page lets one be taken, is never committed (README, the 2026-10-06 entry).
  `scripts/stall-check.mjs`, at Step 0's hash, passes. **#196's edge, stated:** the 0.5 s bound is not on
  the step back, which at a wrap is about the clip's length. It is on the video skipped across the wrap:
  the frame after it lands within 0.5 s of the clip's start, and the skip is at most 0.5 s
  (`examples/js/bench-loops.mjs:60-67`). The page's media times are rounded to the microsecond. The test
  in `examples/test/bench-metrics.test.mjs` pins the edge on the static clip's times: a 15-frame skip
  across the wrap is admitted on 10 landings at 0.5 s and refused on 5 at 0.500001 s, and a 14-frame skip
  is admitted on every landing. The epsilon at `bench-locks.mjs:124` cannot be observed on µs data. The rule
  is not changed in the campaign.
- **V9. The thermal reading. The maintainer's ruling of 2026-11-10: recorded, not a trigger for a redo.
  Every comparison is within a run, so drift reaches only the spread.** Each run's `acquire` p50 and
  `trackStepMs` p50 over counted loops are reported in order through each block, with the last run's
  change from the first. The thermal rule in the record is M3's, not M4's (Step 0, item 1). M3's rule redid a block when its closing run was slower than its
  opening one by more than 6.6% (`trackStepMs` p50) or 1.9 ms (`acquire` p50). That rule existed because
  a block of sync and worker runs could let heat favour one arm. Here no arm is ever in another run, so
  drift reaches only the spread, as the ruling says: it moves which frames a run processes, which the
  spread between runs is meant to contain. That rests on the conjecture under "What M9 measures", that a
  moving state acts on the frames and not on how each estimator reads them. A block whose last run is slower than its first by more than M3's
  bounds is flagged, and those bounds are quoted as M3's, not derived for this pipeline.
- **V10. Visibility.** `run.lostVisibility` is reported, not gating, as M4's step 5.
- **V11. The analysis's own fatal checks,** before any figure:
  - `K` from `processingResolution` equals `intrinsics` of it, element by element;
  - CF's `good` on every posed frame, or the frame is named;
  - the two checks of route (b) above;
  - `runSummary.poseJitterPx` recomputed from the export's frames over its counted loops equals the
    recorded value, bit for bit;
  - every `H` finite on an `ok` frame (#239 found none that is not; the check costs nothing).

### Where `check:provenance` sits, and the serving checkout (#135)

**The constraint.** `check:provenance` passes only when the manifest's head is the checkout's `HEAD` and
the tree is clean (`scripts/provenance-preflight.mjs`: `const headOk = m.head !== null && head !== null &&
m.head === head`). A commit in the serving checkout moves `HEAD` and fails it from then on. Committing a
session's exports there would also move `HEAD` past the freeze's head. M4 committed in the checkout it
served from ("A commit after the build moves the checkout's HEAD, and leaves the build as it is"), but
the preflight did not exist then (#136, 2026-10-31).

**The maintainer's ruling of 2026-11-10: a serving checkout of its own, a git worktree detached at the
freeze's head, never committed into, on the PC or the notebook alike, with the exports committed from
another checkout. Beside it stands the validity rule of "The serving machine", below: on each serving
machine, before its first counted run, the bundle built there must hash the same as the one recorded at
the freeze.** The checkout is built once there. It serves the page, holds the build and runs `check:provenance`. The exports and
records are committed from another checkout, on the campaign's own branch. The maintainer's main checkout
is not switched for it. On the notebook, the same: a worktree detached at the freeze's head.

**`npm run check:provenance`, exit 0, in the serving checkout, at four points:**

1. after the freeze's build;
2. before each session's first run;
3. after each session's last run, before the exports are copied out for committing;
4. after any build there.

A non-zero exit before a run means no run starts. After a session it is that session's tree-changed rule:
the runs after the change are not counted, as M4's step 6. The build's #135 warning, if it fires, stops
the session until `check:provenance` passes.

### The serving machine

**The campaign may be served from the maintainer's notebook rather than his PC.** The page runs on the
tablet. The serving machine serves bytes and reads the clips' hashes, and replays nothing counted. M4's item
5 held a campaign to one machine ("A measurement campaign stays on the machine it started on"), because
"the machine's decoder, scaler and clocks are not" attested; it expired with M4's campaign. In M9 the
decoder, the scaler and the clocks that measure are the tablet's, and the serving machine's role is
attested by what it serves. So this record allows the PC or the notebook, by the ruling above. What is
needed: **before the first device run on a machine, its build must
equal the freeze's**, which means `npm ci` and `npm run build` there at the freeze's head. Its manifest
must then equal the freeze manifest in every field V2 reads, so every field but `builtAt`: the bundle,
all of `served`, `sources`, `toolchain`, `dependencies` and `build` among them. `check:provenance` must pass, and the clips' and the target's SHA-256 must
equal Step 0's. Otherwise no run on that machine counts. The repository's `.gitattributes` sets
`eol=lf` (`git ls-files --eol` reads `attr/text=auto eol=lf` on the page and `bench-metrics.mjs`), so a
Windows checkout does not change the served bytes. V2 would catch it if it did. **The node version is the
pin, v24.21.0, and the toolchain recorded at the freeze is held to the campaign's end** (M4's item 5); the
notebook's node must be the pin.

## The stopping rules, and when the campaign closes

- **A run that fails a validity rule** is re-run once, at once, at its own position. Its export and logs are
  not committed, and the record names the run, its time and the rule. A second failure at the same position
  stops the session, and the maintainer rules before anything else runs (round 0's rule, extended to the
  campaign).
- **A run the loop-wrap rule refuses** is a rejected sample, re-run as above, not recorded (README, the
  2026-10-06 entry).
- **The lock screen, a USB drop, a lost tunnel:** the run is invalid by V7 or V1, and the rule above
  applies.
- **A block is not redone for its figures.** No figure is read until the block's eighth run has passed its
  checks (round 0's step 6: "No `jitterPx` is read, by anyone, until the eighth run's checks have passed"),
  and nothing read decides a redo.
- **The campaign closes** when either holds, whichever comes first:
  1. P1 to P7 and the descriptive readings have been read on the four blocks and recorded in an addendum
     beside this file. The addendum names the campaign's last exports.
  2. The maintainer rules, in a dated entry giving the reason, that the registered plan cannot be read. The
     entry names the last exports, as the 2026-10-23 entry did for M4.

  Either way, that addendum or entry closes the window `AGENTS.md` opens for the target ("from its first
  device run until its last device exports are committed"). M9's window opens with the pre-flight's first
  device run.

## The pre-flight (step 5)

**What it is:** the first device session, on the build that will be frozen. It is not a round, and none of
its exports is counted. **No pose figure of it is read.** The analysis runs on its exports in a
checks-only mode that prints the fatal checks and the covariates below, and no jitter, distance or
difference of any arm.

**What it measures:**

1. **The ready check,** M4's, in the serving checkout: its `HEAD` is the freeze candidate's head, the tree
   is clean, the server sends `no-store`, `check:provenance` passes, and the tablet's Chrome full build is
   read from `chrome://version`.
2. **The tilt clips' acquisition.** One cross run at the counted runs' pinned string (seed 1, `run=1`). Its
   `acquire` p50 over counted loops is the measured constant, against the borrowed 36.9 ms, recorded. Its
   frames processed per loop are checked against the window: five loops must stay within `?window=2000`.
   If they do not, the campaign stops before the freeze, since cross cannot then be a session run.
3. **The filter's parameters.** One static run with `&poseFilter=one-euro` (`run=1`). Its
   `tracker.options.poseFilter` must equal the analysis's imported defaults, or the campaign stops.
   Beside it, one unfiltered static run at the counted runs' pinned string (seed 1, `run=2`), so that the
   analysis meets an unfiltered static export, with route (b)'s two checks, before the freeze.
4. **Frame fidelity's share (D3), as #151 measured it. The maintainer's ruling of 2026-11-10: two
   detection-only static runs, `numMatches` compared at repeated media times, read as a lower bound.
   Every arm comes from the same frames of the same run, so fidelity reaches no criterion, only the
   spread.** Two consecutive detection-only runs of the static clip at `?seed=1`, `?mode=detection-only`, uncounted. Every frame
   detects, so every media time a run visits more than once, within a run and across the two, gives a
   pair. A pair whose `numMatches` differ had different pixels: it is counted before any RANSAC draw
   (#227: "`numMatches` is counted before any RANSAC draw, so the pixels differed").
   `numSceneKeypoints` cannot help on this clip. FAST finds about 1,200 to 1,300 corners a frame there,
   above the budget of 300 (`examples/README.md`, the static clip), so it reads the budget on every
   frame. The share of differing pairs is a **lower bound** on the grab's infidelity, since two different
   grabs can match alike. It is read under detection-only load, which is heavier than the counted runs'
   tracking load. It needs no tool and no change to the export. The form has been checked against
   `startRefusal` (`examples/js/bench-params.mjs`) by reading, and is refused by none of its rules. It
   has never been opened. The pre-flight is its first opening, and a refused Start there is reported,
   not worked around.

   The alternative is a hash of each grab's pixels, as `check:page` does. That instruments the page over
   the DevTools protocol (`scripts/page-check.mjs`, `instrument({ hashGrabs })`), and would need a driver
   for the tablet's Chrome, a new tool, inside the timed acquisition. Not taken.

   **What the share decides:** no criterion compares two runs' frames, so it decides no criterion. It is
   stated beside every spread. If it is not negligible, D3 asks for the decision with the figure in hand,
   before the freeze.
5. **The analysis end to end** on the cross export of item 2 and the unfiltered static export of item 3,
   checks only (the filtered export carries no IPPE arm, Stage 1, Q5, and is read for its parameters only): every field
   each arm needs present (Stage 1's Q5 list), every V11 check passing, and the tilt computed on every
   posed frame. No switch is counted, and no tilt, jitter, distance or difference is printed.
6. **Every export of the pre-flight passes V1 to V8**, with V6 read for its own arm and parameters. The
   two detection-only runs are not session runs by `sessionRunGaps` ("a session run is a tracking or a
   stateless run"), so V6's `sessionRun` is not read on them. Their `?loops=` and `?run=` still make Start
   check their provenance.

**What stops the campaign before the freeze:** a failed item 2 window check, a failed item 3 parameter
check, a V11 failure on a pre-flight export, or a `check:provenance` failure that a rebuild at the head
does not clear. Each is reported to the maintainer, who rules.

**The freeze.** At the pre-flight's end its head, the full manifest, the bundle's SHA-256, the Chrome build
and the toolchain are recorded in the pre-flight's record. From then on there is no dependency bump, no
change to the instrument (`examples/bench-nft.html`, `examples/js`, `scripts`), to the subject
(`packages/*/src/`, held by V2's bundle and `sources`), to the analysis and run-check scripts, or to the
inputs, until the campaign closes (milestone 11, item 5).

## What must exist before the pre-flight

**The maintainer's ruling of 2026-11-10: items 1 and 2 are made in one later PR, not two, with its own
prompt, after this registration merges and before the pre-flight.** Neither is written in this PR.

1. **The analysis script,** `docs/benchmarks/<date>-243-analysis.mjs`. From an export it derives the four
   arms, the covariates, the criteria's readings, the most influential media time and the checks above,
   each fatal, with a `--checks-only` mode for the pre-flight. It imports the frozen modules
   (`cornerJitter`, `summarizeRun`, `compareExports`, `frameRecord`'s projection, `closedFormPose`,
   `intrinsics`, `tiltDegOf`, `PoseFilter`) and copies none. Stage 1's script and its `--page-export` mode
   are its base. Every check is exercised both ways, and its readings reproduce Stage 1's Q4 rows, which are
   summaries over seeds 1 to 8, on Stage 1's replay exports at those eight seeds. It is not the instrument by M4's definition, but the freeze holds it
   too.
2. **The run-level check,** a script that reads V1 to V8 from one export and its three `.txt` files, prints
   each rule's verdict and no pose figure, and exits non-zero on any failure. M4's ran from outside the
   repository. This one is committed with the analysis script, since no document outside the repository
   is a source for any session. Every rule is exercised both ways on constructed exports.
3. **Storage. The maintainer's ruling of 2026-11-10: plain JSON, as every committed export so far, and
   no change to the instrument. The README's 20 MB rule belongs to `docs/benchmarks/README.md`, which this
   PR does not edit, and revisiting it is a separate change, to be proposed after the campaign.** Neither
   `scripts/compare-bench.mjs` nor `replay-clips.mjs --sequence` reads `.json.gz` today. The directory stores 8.0 MB in git history at this head (README's command). A
   version 2 export deflates to about 320 bytes a frame, measured here on the replay's version 2 exports:
   398,277 bytes for 1,243 frames, against about 157 for version 1. A device run of five loops is about 700
   to 1,400 frames, so about 0.22 to 0.45 MB stored. The 32 counted runs and the 5 pre-flight exports come
   to about 8 to 17 MB, so the directory **may pass** the 20 MB trigger within the campaign, at about 17 to
   24 MB, 16 to 25 MB unrounded. The draft gave "17 to 24 MB", which the ruling quotes, from a per-export
   figure rounded up at its low end (0.25 for 0.22). **Gzip would lower that total by about 4% only.** Measured here on one version 2 replay export (cross, 15 ms,
   2,503,083 bytes): `gzip -9` gives 394,404 bytes, and git's default deflate gives about 410 KB. Git
   compresses every blob it packs, and the trigger is the stored size, "its size stored in git history".
   Committed in one throwaway repository, the gzipped file stored 394,542 bytes, the plain one 532,811 as
   a loose object, at git's lower loose-object level. So gzip saves about 4% of the stored size against a
   packed plain export, and it stops git from storing one export as a delta of a similar one. The README's
   "about 9 times smaller" holds on disk, not in history. Plain JSON keeps `git diff` and the viewer, and
   needs no reader change. Whether the trigger's rule should be revisited is for the README's owner, and
   this record does not edit it.
4. **No change to `TILT_BORROWED_ACQUIRE_MS`, to the page, to `DEFINITIONS` or to `sessionRunGaps`** is
   needed (above).

## The runbook

**Who does what** (round 0's division). The serving machine, the maintainer's PC or notebook, runs the
server, the tunnel, the link monitor, the command that opens each run, the pull of each export, the clip's
hash readings and the run-level checks. The maintainer, at the tablet, types the device label, presses
Start and then Download JSON, keeps the page in the foreground, and closes the run's tab.

**The route,** M4's (the setup's item 3):

- the server: `npx http-server -p 8093 -s -c-1` at the repository root;
- the tunnel: `adb -s Tab9WEEA0001504 reverse tcp:8093 tcp:8093`;
- the page: `http://localhost:8093/examples/bench-nft.html?…`.

**The pinned strings.** Every counted run is this, character for character, with `<clip>` and `<n>`
filled and nothing else:

```
?mode=tracking&target=wnft&detection=sync&clip=<clip>&loops=4&window=2000&seed=1&run=<n>
```

The pre-flight's three other forms:

```
?mode=tracking&target=wnft&detection=sync&clip=pinball-static.mp4&loops=4&window=2000&seed=1&poseFilter=one-euro&run=1
?mode=detection-only&target=wnft&clip=pinball-static.mp4&loops=4&window=2000&seed=1&run=1
?mode=detection-only&target=wnft&clip=pinball-static.mp4&loops=4&window=2000&seed=1&run=2
```

Its cross run is the counted form with `clip=pinball-tilt-cross.mp4&…&run=1`, and its unfiltered static
run the counted form with `clip=pinball-static.mp4&…&run=2`.

| Runs | `<clip>` | `<n>` | Export name |
|---|---|---|---|
| 1–8 | `pinball-static.mp4` | 1–8 | `<date>-tab9-m9-static-<n>.json` |
| 9–16 | `pinball-tilt-cross.mp4` | 9–16 | `<date>-tab9-m9-cross-<n>.json` |
| 17–24 | `pinball-bench-table.mp4` | 17–24 | `<date>-tab9-m9-table-<n>.json` |
| 25–32 | `pinball-bench.mp4` | 25–32 | `<date>-tab9-m9-wall-<n>.json` |

Pre-flight exports are named `<date>-tab9-m9-preflight-<what>.json` (`cross`, `static-filter`, `static`,
`fidelity-1`, `fidelity-2`), apart from the counted names, so that no count of a session's exports takes
them in.

**Before each session,** each result in the session record:

1. on the serving machine, the build check of "The serving machine" (the first time on that machine), then,
   in the serving checkout, `check:provenance`, exit 0;
2. in the serving checkout, `git rev-parse HEAD` is the freeze's head, and
   `git status --porcelain --untracked-files=all -- examples/bench-nft.html examples/js scripts packages package.json package-lock.json examples/targets/pinball.wnft examples/videos`
   prints nothing;
3. `curl -sI http://localhost:8093/examples/js/bench-metrics.mjs` reads `Cache-Control` with `no-store`;
4. on the tablet: Chrome's cached files cleared; no `bench-nft-*.json` in the download folder; the full
   build from `chrome://version`;
5. the link quiet: no `connection terminated` line naming the device in adb's log for five minutes.

**Each run, in order:**

1. `adb -s Tab9WEEA0001504 reverse --list` shows `tcp:8093 tcp:8093`, or the run does not start.
2. The link monitor begins. The clip's SHA-256 is read into `<export>.clip.txt` with the UTC time.
3. The URL is opened with one command, never typed:
   `adb -s Tab9WEEA0001504 shell "am start -a android.intent.action.VIEW -d '<URL>' com.android.chrome"`.
   `<URL>` is written to `<export>.url.txt`.
4. At the tablet: the device label `Tab_9_WiFi`, Start, the page in the foreground until `done`, then
   Download JSON. A refused Start is not a run: its remedy is applied, the URL opened again, Start pressed
   again.
5. The export is pulled with `adb pull`, unchanged, and renamed. The clip's SHA-256 is read again into
   `.clip.txt`, and the link monitor ends, its log `<export>.link.txt`.
6. The run-level checks: V1 to V8, by a script that prints no pose figure. A failure follows the stopping
   rules.
7. The run's tab is closed, then 120 s idle before the next run.

**After each session:**

- in the serving checkout, `check:provenance`, the head and the clean tree again;
- the exports and their `.txt` files copied, unchanged, into the committing checkout;
- the count and the identity, M4's step 7: one export per position, each with its `.url.txt`,
  `.clip.txt` and `.link.txt`, `run.order` equal to its `<n>`, `bundledClip` its name's, and the freeze's
  head;
- then, and only after the block's eighth run passed, the analysis on that block.

**What is committed, and where.** All in `docs/benchmarks/`:

- each counted export and its three `.txt` files;
- the pre-flight's exports and theirs;
- the session record, `<date>-tab9-m9-session-<A|B>.md`, with the Chrome build, each run's checks, any
  re-run and the thermal readings;
- the analysis's stdout hash in the criteria's addendum.

Plain JSON, by the maintainer's ruling of 2026-11-10 ("What must exist", item 3). Each session's PR reports the directory's
stored size by the README's command. Committed exports are evidence, never edited or deleted (`AGENTS.md`,
"Test assets").

## What this registration does not register

- **Accuracy, at any tilt, for any arm,** and the filter's lag (D1, D7; #92, #109).
- **The guard's adoption, or a threshold for a real camera** (#228's registration, R2's item 1; #109).
- **A true `K`.** Every tilt, selection and switch is the assumed camera's.
- **Any comparison between two runs' frames.** No criterion reads one. The filter's route (a) is not a
  counted reading.
- **The worker path, the stateless mode, the detection-only mode** (apart from the pre-flight's fidelity
  item), **the scaled step and `--seed-policy run`.**
- **Mid and sweep.**
- **A desktop replay as campaign data,** and `--transfer`.
- **A change to `DEFINITIONS`, to `sessionRunGaps`, to the wrap rule or to `TILT_BORROWED_ACQUIRE_MS`.**
- **Anything #123 holds:** the between-block spread is outside every criterion here, since no comparison
  spans two runs.
- **Any figure of the filter on the guard.**

## The advisor's consultations

**Consultation 1, after the reading and before any text was drafted.** What came back, and what changed:

- **The seeds.** The first plan seeded run k with seed k, to pair it with the replay's seed k. The advisor
  answered that this folds the draw spread into the spread the criteria are read against, and that the
  pairing is weak. **Followed:** one seed, `?seed=1`, in every run.
- **The filtered pre-flight runs cannot check route (b),** since a filtered export lacks the filter's input,
  so the first plan's "check" could not fail. **Followed:** the filtered run attests the parameters only,
  and (b) rests on the code path and Stage 1's control. The fatal check on an `ok` TRACK frame with null
  `poseCorners` was its proposal.
- **`sessionRunGaps` reads neither `poseFilter` nor `seed`; verify it.** **Followed and measured** (Step 0,
  item 4), and V6 added.
- **Missing: the closing criterion and the stopping rules; the filter across the wrap; a count prediction
  for the switches, with chatter as the refuting outcome; the influential media time's procedure on device
  data, and whether "held" needs both readings.** **All followed:** the stopping rules and the close; P7's
  second reading; P6; "How each criterion is read".
- **Storage, the analysis script, the fidelity tool and the tilt constant are instrument questions to settle
  before the stop.** **Followed:** "What must exist before the pre-flight", item 4 of the pre-flight, and the
  borrowed acquisition's paragraph, which keeps the plan from ever needing the replay again.
- **M3's thermal rule does not transfer to a single-path block.** **Followed:** the draft's V9 proposed a form,
  quoting M3's bounds as M3's, and the maintainer ruled it.
- **The serving machine's check is the whole manifest and the toolchain, not the bundle alone; and the line
  endings.** **Followed.**
- **Read `CONTRIBUTING.md`, both addenda, and the repeat's B, C and E; quote figures from the source.**
  **Not followed in full before drafting,** though the draft's Step 0 claimed it was: consultation 2 found
  the claim. After it, `CONTRIBUTING.md` and the metric addendum were read whole. The repeat's B and E, and
  the guard's addendum, were read only as Step 0 says.
- **The degrees of freedom are within one block; say whether blocks repeat; say no pose figure is read in
  the pre-flight; check the window against mid and sweep.** **Followed.**

**Consultation 2, on the whole draft, Stage 3 included, before the stop.** It found the Stage 3 text
holding: a paired difference per run, three outcomes and direction-only margins. What came back, and what
changed:

- **Blocking: the runbook's provenance steps could not all pass.** `check:provenance` needs the
  manifest's head to be `HEAD`, and the draft committed exports in the checkout it served from. Read in
  `scripts/provenance-preflight.mjs` and confirmed. **Followed:** a serving checkout detached at the freeze
  ("Where `check:provenance` sits").
- **Blocking: Step 0 claimed reads that had not been made,** of `CONTRIBUTING.md`, both addenda and the
  repeat's B and E. **Followed:** `CONTRIBUTING.md` and the metric addendum were then read whole, and
  Step 0 now says what was read and how much. 6.33° and 6.17 px now name their sources.
- **Gzip may buy nothing, since git already deflates blobs.** **Followed, and measured:** about 4% of the
  stored size. The storage proposal changed from gzip to plain JSON, and "passes" to "may pass".
- **P6 was previewed by the pre-flight's checks-only mode, which counted switches; and "half a second
  either side" did not match 7.5 to 9.0 s.** **Both followed.**
- **"Nothing a run does at another moment enters a paired difference" was a fact claimed for an
  unexplained state.** **Followed:** labelled a conjecture, with what one block per clip costs stated in
  "Seeds, runs, order".
- **`numSceneKeypoints` saturates on the static clip; the detection-only form was never opened; the run
  check needs a home.** **All followed.**

## The independent review

A fresh reviewer, a subagent told to read only and to consult no advisor, checked the record after the
rulings were applied, against the sources, the code, the issues and the rulings. **It found correct:**
every Stage 1 figure quoted, recomputed against the record; the inputs' SHA-256; the bundle; every
computed figure; the cited README passages and code lines; the pinned strings against `startRefusal`;
the ten rulings and the four corrected citations. It reported 2 errors, 9 misleading passages and 13
nits, and **all were applied** before the commit:

- **Errors:**
  - V8 put the wrap rule's 0.5 s bound on the step back, where it is on the video skipped across the
    wrap.
  - Consultation 1 still said the reads had been made before drafting.
- **Misleading:**
  - the re-run rule could not apply to V11, read after the block;
  - the paired-difference conjecture was restated as a fact twice;
  - "round 0's order";
  - Stage 2 cited for not repeating blocks;
  - the corner distance had no way to select a band through `compareExports`;
  - the pre-flight met no unfiltered static export, so a run was added (item 3);
  - M4's machine rule was described as the replay machine's only;
  - P7's outcomes were ambiguous;
  - route (b)'s null check did not say what it does on a pose that is not good, or on the warm-up loop.
- **Nits:** draft wording left over, the manifest fields, the storage arithmetic, the source of the 3 px,
  V6's wording, the interval's citation, the freeze's list, the jackknife wording, "held result", P6's
  basis, the seeds the analysis reproduces, P2 and P3's refuted outcome, and Stage 3's own-commit rule.

The storage fix changes one figure the ruling quotes. The per-export range is 0.22 to 0.45 MB, not 0.25,
so the total is about 16 to 25 MB unrounded, and the record states both.

## Constraints kept

This file only. No change under `packages/`, `examples/` or `scripts/`, to `docs/benchmarks/README.md`, or
to any dated record. No issue commented on, edited or closed. Outside the repository, in the session's
scratch directory, none committed:
- the `sessionRunGaps` check of Step 0, item 4;
- a version 2 replay of the tilt clips at seed 1 (`--clips tilt`), used only to size an export;
- a throwaway git repository holding one of those exports plain and gzipped, for the storage ruling.
