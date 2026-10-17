# Benchmark glossary

The words this directory's plans and records use for how a measurement is
made and read, each with the place that defines it. The plans and their
results are in [`README.md`](./README.md), in date order; the records beside
it are named by date.

- **An entry points; it does not define.** A definition copied here would be
  one more place the fact lives, and the first to go stale
  ([#102](https://github.com/webarkit/webarkit/issues/102), Part 4, its
  first rule).
- **Where no single sentence defines a term,** the entry says where its
  parts are. A few entries add a line of orientation: what a term is not,
  or which sense a section uses.
- **Measurement vocabulary only.** How the milestones are named and
  numbered is not here (#102, Part 1).

## M4's campaign

The words M4's campaign minted after #102 was opened on 2026-10-02, with
the older words each is easily taken for.

- **Counted run.** No single sentence defines it. Its parts:
  - the setup it runs under, and the validity rules it passes: M4's plan,
    [its first entries](./README.md#2026-10-13--m4-the-plans-first-entries-the-setup-and-the-pre-flight-run),
    "The setup, the same for every counted run" and "Validity rules";
  - the run-level checks read before the jitter clause:
    [the clause's item 1](./README.md#the-null-controls-jitter-clause-2026-10-14);
  - which exports are evidence: M4's runbook, step 7
    ([2026-10-06](./README.md#2026-10-06--m4-the-sessions-runbook-provenance-steps)).

  Round 0's runs are not counted runs (the jitter clause's item 3), and the
  pre-flight run is not a session run (M4's first entries, "The pre-flight
  run"). Not a *counted loop*: M3's
  [What is measured, and how it is read](./README.md#what-is-measured-and-how-it-is-read),
  and `SESSION_LOOPS` in
  [the metrics module](../../examples/js/bench-metrics.mjs).
- **Session run.** M3's term, older than the counted run. The page decides
  it and records it as `protocol.sessionRun`: `DEFINITIONS.protocol`, and
  `sessionRunGaps`, in the metrics module.
- **Round.** Two senses. M4's: the jitter clause's item 3, its round-0
  bullet, which also says how the other rounds are named. The tuning
  pass's: [The rounds](./README.md#the-rounds).
- **Block, arm, baseline arm.**
  [The null control's jitter clause](./README.md#the-null-controls-jitter-clause-2026-10-14):
  "Why a comparison stays inside one block", and its item 1 for the
  baseline arm. Two older senses: M3's bracketed blocks (below), and the
  detection arms, `sync` and `worker`, which round 0's arm test compares
  (the clause's item 3).
- **Instrument, subject, input, what is outside all three, the role rule,
  and the toolchain.**
  [The instrument, the subject and the inputs](./README.md#the-instrument-the-subject-and-the-inputs-2026-10-14).
  Not the section of M3's plan with a similar name,
  [The instrument](./README.md#the-instrument), whose scope includes the
  worker path M3 measured.
- **Manifest.** `examples/dist/provenance.json`: the opening comment of
  [`scripts/build-provenance.mjs`](../../scripts/build-provenance.mjs),
  which writes it; what Start checks against it, M4's runbook, step 4
  ([2026-10-06](./README.md#2026-10-06--m4-the-sessions-runbook-provenance-steps));
  in an export, `provenance` (`DEFINITIONS.provenance`).
- **Gross-abnormality filter.** The jitter clause's item 1; what it buys,
  the power tables in its item 3.
- **Within-block standard deviation: s₀, s₋b and s_r.** The jitter clause's
  item 3. Round 0's s₀:
  [Round 0's result](./README.md#round-0s-result-2026-10-14).
- **Operational reading, reading of record.** The jitter clause's item 3;
  what each decides, its item 5.
- **The three validity rules.** M4's plan,
  [its first entries](./README.md#2026-10-13--m4-the-plans-first-entries-the-setup-and-the-pre-flight-run),
  "Validity rules, read at analysis time from each committed export"; from
  round 1, rules 2 and 3 as
  [The instrument, the subject and the inputs](./README.md#the-instrument-the-subject-and-the-inputs-2026-10-14)
  changes them. Not the earlier plans' validity checks:
  [the `maxKeypoints` sweep's](./README.md#validity-checks-before-reading-any-timing),
  [M2's](./README.md#validity-checks-before-reading-any-number), and M3's
  runbook, step 7, in [The session's runbook](./README.md#the-sessions-runbook).
- **Pre-flight.** Three things carry the name:
  - M4's pre-flight run, on the tablet: M4's plan,
    [its first entries](./README.md#2026-10-13--m4-the-plans-first-entries-the-setup-and-the-pre-flight-run),
    "The pre-flight run";
  - M3's desktop pre-flight:
    [The desktop pre-flight](./README.md#the-desktop-pre-flight), and its
    record, [`2026-09-30-desktop-m3-preflight.md`](./2026-09-30-desktop-m3-preflight.md);
  - the earlier plans' pre-flight steps:
    [the `maxKeypoints` sweep's](./README.md#pre-flight-where-the-budget-binds-per-clip),
    and [M2's](./README.md#pre-flight-a-desktop-replay), with its record,
    [`2026-09-25-desktop-replay.md`](./2026-09-25-desktop-replay.md).
- **Calibration block.** The jitter clause's item 3, its round-0 bullet;
  the procedure,
  [Round 0, the calibration block: the session's procedure](./README.md#round-0-the-calibration-block-the-sessions-procedure-2026-10-14);
  the result, [Round 0's result](./README.md#round-0s-result-2026-10-14).
- **Session record, audit record.**
  [A correction's account is not part of the record it corrects](./README.md#a-corrections-account-is-not-part-of-the-record-it-corrects-2026-10-14).
  Round 0's pair:
  [the session record](./2026-10-14-tab9-m4-calibration-session.md) and
  [the audit record](./2026-10-14-tab9-m4-calibration-audit.md). M3's
  predate the rule: [its session record](./2026-10-01-m3-device-session.md)
  and [the write-up's audit](./2026-10-01-m3-write-up-audit.md).

- **Pose stage on tracker arms, ambiguous frame, fallback frame.**
  [#105's criteria, and the pose stage on tracker arms from round 1](./README.md#105s-criteria-and-the-pose-stage-on-tracker-arms-from-round-1-2026-10-15),
  and [#132](https://github.com/webarkit/webarkit/issues/132) for the
  finding. The selection rule, its margin and what the two counters count:
  [the acceptance criteria](./2026-10-15-m4-step3-ippe-acceptance.md), §5.
  Not the `pose` stage of the stateless arm, which stays a measurement.

- **Steadiness.** The corners' deviation under `H`, per `DEFINITIONS.jitterPx`
  in [the metrics module](../../examples/js/bench-metrics.mjs): a property of
  the homography, not of the pose. The plan's two defining lines are
  `README.md:4140` and `README.md:4150`, in
  [the null control's jitter clause](./README.md#the-null-controls-jitter-clause-2026-10-14);
  neither is restated here. Why the milestone says "homography steadiness"
  since 2026-10-15:
  [What M4's device half measures](./README.md#what-m4s-device-half-measures-and-which-steps-reach-it-2026-10-15).

## The earlier plans

The words #102 listed on 2026-10-02, from M2's and M3's plans.

- **Registered plan.** The tuning pass's opening paragraph,
  [M3: the tuning pass](./README.md#2026-09-28--m3-the-tuning-pass). What
  binds an M4 session: "What the plan rests on", in M4's
  [first entries](./README.md#2026-10-13--m4-the-plans-first-entries-the-setup-and-the-pre-flight-run).
  How a registered clause was withdrawn and replaced after its result was
  seen: M3's runbook, step 8, in
  [The session's runbook](./README.md#the-sessions-runbook). What a
  registration discloses of the data seen before it: "What was seen before
  it was written", in
  [the jitter clause](./README.md#the-null-controls-jitter-clause-2026-10-14).
- **Tuning pass, and its rounds.**
  [M3: the tuning pass](./README.md#2026-09-28--m3-the-tuning-pass) and
  [The rounds](./README.md#the-rounds); its result,
  [The pass](./README.md#the-pass-2026-09-29-not-tunable-above-the-contract).
- **Desktop baseline.** [The desktop baseline](./README.md#the-desktop-baseline),
  and its record,
  [`2026-09-28-desktop-tuning-baseline.md`](./2026-09-28-desktop-tuning-baseline.md).
- **Guard check, guard diff, guarded paths.** Two things share the word.
  - The independent check of the evidence guards: M3's runbook, step 1, in
    [The session's runbook](./README.md#the-sessions-runbook), and
    [its record](./2026-09-30-m3-guard-check.md); M4's, "The independent
    check of the evidence guards (2026-10-13)", in M4's
    [first entries](./README.md#2026-10-13--m4-the-plans-first-entries-the-setup-and-the-pre-flight-run),
    and [#120](https://github.com/webarkit/webarkit/issues/120).
  - The guard diff, over the guarded paths: M3's runbook, step 1; M4's
    runbook, step 1
    ([2026-10-06](./README.md#2026-10-06--m4-the-sessions-runbook-provenance-steps));
    and from round 1,
    [The instrument, the subject and the inputs](./README.md#the-instrument-the-subject-and-the-inputs-2026-10-14).
- **Device session, runbook, ready check.** The tuning pass's
  [A device session](./README.md#a-device-session); M3's
  [A device session](./README.md#a-device-session-1) and
  [The session's runbook](./README.md#the-sessions-runbook), whose step 3
  is the ready check; M4's runbook,
  [2026-10-06](./README.md#2026-10-06--m4-the-sessions-runbook-provenance-steps),
  and round 0's
  [session procedure](./README.md#round-0-the-calibration-block-the-sessions-procedure-2026-10-14).
- **Bracketed blocks.** The tuning pass's
  [A device session](./README.md#a-device-session), "Interleaved, from
  round 2 on"; M3's [A device session](./README.md#a-device-session-1).
  Reading across brackets: "Pooling across brackets is not a registered
  reading", under
  [M3's predictions](./README.md#predictions-and-what-would-refuse-each).
- **Null control.** M3's: [its A device session](./README.md#a-device-session-1),
  and the jitter clause of its runbook's step 8, in
  [The session's runbook](./README.md#the-sessions-runbook). M4's:
  [The null control's jitter clause](./README.md#the-null-controls-jitter-clause-2026-10-14),
  for [#103](https://github.com/webarkit/webarkit/issues/103).
- **Latency transfer.** `--transfer`, in the comment that opens
  [`scripts/replay-clips.mjs`](../../scripts/replay-clips.mjs); M3's
  runbook, step 12, in
  [The session's runbook](./README.md#the-sessions-runbook); how M3 read
  it: the adoption rule and row seven, under
  [M3's predictions](./README.md#predictions-and-what-would-refuse-each).
- **Predictions table, adoption rule.** M3's
  [Predictions, and what would refuse each](./README.md#predictions-and-what-would-refuse-each),
  with the adoption rule under its table. The tuning pass's
  [What every round is judged on](./README.md#what-every-round-is-judged-on)
  and [What adopting a result means](./README.md#what-adopting-a-result-means).
- **The words a row is read with: *met*, *missed*, *refused*, *not
  refused*, *descriptive*, *inconclusive*.** Where each is fixed or used,
  in M3's [predictions](./README.md#predictions-and-what-would-refuse-each)
  and [results](./README.md#results-2026-10-01):
  - *refused* and *not refused*: the predictions table's last column;
  - *met* and *missed*: said of a row's prediction, its "predicted"
    column. M3's session record reads its rows so, in its table of rows
    ([`2026-10-01-m3-device-session.md`](./2026-10-01-m3-device-session.md)),
    and M3's results use *missed*;
  - *descriptive*: "Row five's refusal requires corroboration", under the
    table;
  - *inconclusive*: the runbook's spread rules and null control, and the
    adoption rule.

  Where a descriptive row and a pooled figure stand: "Row five's refusal
  requires corroboration" and "Pooling across brackets is not a registered
  reading", both under the table. What happened when they were given
  verdict words: [the write-up's audit](./2026-10-01-m3-write-up-audit.md),
  F1 and F2.

## Metric terms

Written against `METRICS_VERSION` 1.

Every metric term is defined by its entry in `DEFINITIONS`, in
[`examples/js/bench-metrics.mjs`](../../examples/js/bench-metrics.mjs).
The page's exports carry the definitions they were measured under, as
`definitions`, beside `metricsVersion` (the module's comments on
`DEFINITIONS` and `METRICS_VERSION`). Not every committed export does: the
exports of 2026-09-19 and 2026-09-24, and the two pyramid probes of
2026-09-26, carry no `definitions`.

### `p50` and `p95`

`percentile` and `stats`, in the same module. Before comparing a
percentile from here with one another tool computed, read `percentile`'s
comment.

### `trackShare` and `trackTimeShare`

`DEFINITIONS.trackShare` and `DEFINITIONS.trackTimeShare`: two measures,
with similar names. Why M3 read its lock verdict on the second: "Per
processed frame, and by video time", in M3's
[What is measured, and how it is read](./README.md#what-is-measured-and-how-it-is-read).

### `LOST`: never acquired, or a lock lost

The `LOST` state, as `states` and `trackLoss` count it, covers two
conditions: a frame on which the tracker has not yet acquired the target,
and a lock lost after it was held. The export separates them with no new
field: a frame is **never yet acquired** if and only if no TRACK frame
precedes it in the run; otherwise it is a loss. `reason` is not relied on
to separate them (#143: unchecked). Every count of either in the record
declares which it counts, by
[the plan's rule of 2026-10-17](./README.md#counts-of-lost-frames-and-of-trackloss-declare-what-they-count-2026-10-17).
The state machine itself is `packages/nft-tracker/src/tracker.ts`, not
restated here. The finding, and why the rename to a distinct ACQUIRING state
waits for the post-campaign window:
[#143](https://github.com/webarkit/webarkit/issues/143).

### Every key of `DEFINITIONS`

One entry per key. [The staleness check](#the-staleness-check) holds this
list to the module.

- `alignment`
- `alignMs`
- `corners`
- `detectionAccounting`
- `detectionLocks`
- `detectionOutcomes`
- `detectionPath`
- `detectionTime`
- `detectionUse`
- `detectionUseFallbackFrames`
- `endedBy`
- `failure`
- `firstStepLatency`
- `firstSteps`
- `fitMs`
- `fits`
- `frameLevels`
- `frameMs`
- `frames`
- `heldLockSteps`
- `jitterPx`
- `jitterWindows`
- `lockLosses`
- `loopWraps`
- `lostVisibility`
- `lowQualityTrackFrames`
- `posedFrames`
- `protocol`
- `provenance`
- `pyramidMs`
- `quality`
- `reacquisitions`
- `reacquisitionsAtLoopWrap`
- `spreadPx`
- `staleReplies`
- `states`
- `summaryMs`
- `summaryMsFrames`
- `trackedPatches`
- `trackFramesWithDetectionInFlight`
- `trackShare`
- `trackStepMs`
- `trackTimeShare`
- `unlockedResidualMs`

## The staleness check

`examples/test/glossary.test.mjs`, in `npm test`, fails in two cases:
- the `METRICS_VERSION` recorded above is not the module's;
- the keys listed above and the keys of `DEFINITIONS` are not the same set.

It reads the module, and changes nothing in it. Why both conditions, and
what neither can see:
[#102](https://github.com/webarkit/webarkit/issues/102), Part 2.
