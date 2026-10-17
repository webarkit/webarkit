# The protocol for one milestone step

Status: drafted 2026-10-15, after M4 step 3 (#105); revised 2026-10-16 with that day's
findings (#123's seed test and frame-set decomposition, #137's gate and RNG findings, and
#139's ratification of the box's entries), and 2026-10-17 with the comparison rule (Stage
2) and the two rules on checks. Maintained, not written once: a finding that
settles after the draft is folded in, dated, rather than left for an amendment.

Everything else in `docs/benchmarks/` governs a measurement: provenance, served-file
hashes, block order, the jitter clause, run validity, what the record may and may not
say. All of it starts from the moment a step and its criteria exist.

Nothing governed how a step gets chosen and scoped. M4 step 3 is why this document
exists, in two findings of increasing severity. #105 was written on the premise that IPPE
improves pose quality, implemented in full, and only then measured — at which point the
extended grid put the crossover between 7° and 10° of tilt and the corpus measurement put
round 1's static clip entirely below it. Then the dry run found something worse: the
step's registered metric, jitterPx, reads the target's corners under H, and the treatment
changes the pose and leaves H untouched. The metric cannot respond to the treatment at
all. Both measurements cost hours of machine time on data already in hand, and nothing in
the process required either one first.

The rule the five stages below exist to enforce: **a quantity a decision rests on is
measured before the decision, and when it is cheap it is measured first.**

Each stage names what it produces and what stops it. A stage's output is a number or a
file, never an argument. The step prompt handed to an implementing session is generated
from this document; it is not retyped from recollection.

---

## Stage 1 — Feasibility probe

Runs **before the step is scoped**, and before any issue text commits to an outcome.

Two questions, in this order. The first is cheaper and kills more steps.

**Responsiveness: can the registered metric move at all when the treatment is applied?**
Not "is the effect large enough to detect" — whether the metric is a function of the thing
the treatment changes. Answer it from the metric's own code, by quoting the lines that
compute it, and then confirm it empirically: apply the treatment to existing data and show
the metric changing. A metric that cannot move is not a weak measurement, it is not a
measurement, and a campaign run on it would attest a zero that means nothing.

**Expressibility: what must be true of the existing corpus for the effect to appear?**
Then measure that, on data and code already in hand. No implementation, no new fixtures,
no device.

Produces: the numbers, and a named file under `docs/benchmarks/` recording them as a
probe — explicitly not campaign data, needing no provenance, never reportable as a round.
**A headless count enters the record only from a seeded run, with the seed stated.** The
shipped path draws RANSAC from an unseeded `Math.random`, so an unseeded count moves by a
few frames between runs of the same script and two reports of one measurement disagree
for no reason the record can name (#137: 259, 260 and 261 posed frames on three unseeded
runs of one clip; two seeded runs byte-identical).

Stops the step when: the metric cannot respond, or the corpus cannot express the effect.
Either is a result, not a setback, and it is written down. A step whose metric cannot
respond needs a different metric, which means a changed instrument, which means this
campaign ends and another begins — so the probe must precede the campaign, not sit inside
it. A step whose corpus cannot express the effect is rescoped to what the corpus covers,
or deferred until the corpus changes, which while a campaign is open means deferred,
because the clips are frozen INPUTS and cannot be added to mid-campaign.

> Origin: #105. Both facts were knowable before any implementation: the metric's
> dependence on H from the frozen module's own source, and the clips' tilt distribution
> from the oracle's poses over clips we already had.

## Stage 2 — Declared covariates

Ask: which property of the input could plausibly **invert the sign** of this effect? Is
it measured per frame? Is it reportable per clip?

Produces: the covariate list in the step's issue, each with how it is computed and where
it is reported.

Three rules on using a covariate to select frames or blocks, and on comparing the arms a
selection leaves:

- A covariate read to select data is read from the **control arm only**, never from the
  treatment arm. Reading it from the treatment arm selects on the dependent variable.
  This is the same rule the jitter clause already follows by being read on each block's
  own baseline arm.
- **When the treatment can change which frames are posed, the arms are compared on the
  frames both posed, never on whole-set figures** (added 2026-10-17). The control-arm
  rule's sibling: that one keeps the selection off the dependent variable, this one keeps
  the comparison off the selection. Its evidence, from a read-only decomposition of
  2026-10-16 of M3's twelve hand-held exports by the method of
  `docs/benchmarks/2026-10-16-frame-set-overlap.mjs`: on M3's 20 sync-worker pairs the
  whole-set differences, sync minus worker, run +0.05 to +85.5 px, while the same arms on
  shared media times differ by −1.5 to +2.8 px on the wall clip and −0.15 to +0.27 px on
  the table clip. The
  rule is already applied in #104's registered joint claim, which reads the arms on their
  common media times (the plan, "#104: a joint claim, or none"), and M3's hand-held rows
  never compared jitter across arms: it is registered before it was needed, not after it
  was broken.
  - *The failure it guards against, in the forms it took in a single day, 2026-10-17: two
    figures compared on incompatible bases. A bound against a noise belonging to a
    different counterfactual. A per-run figure against a movement, on runs of different
    window counts. A change between two groups against a correction's distance from its
    asymptote at one point. A trend read off a population that mixed right and wrong
    fits. Each was caught, three of them by the implementing session.*
- A selection is reported in the metric's own unit of eligibility, not only as a frame
  count. `jitterPx` is not a consecutive-frame difference: `cornerJitter` fits a line in
  time to each corner within each one-second window of media time, keeps a window only
  when it holds at least four selected frames with corners and a nonzero time spread, and
  pools the residuals over the windows kept with `n − 2` degrees of freedom each
  (`examples/js/bench-metrics.mjs`, `cornerJitter`; `DEFINITIONS.jitterPx`). So a
  scattered subset of qualifying frames is usable, which is how `compareExports` reads
  two runs on their common media times, and a selection is judged by the windows it
  leaves: report the windows kept (`jitterWindows`) and the frames per window beside the
  frame count, and say which windows the selection emptied. A metric that is a
  consecutive-frame difference would need contiguous runs instead; name the metric's
  eligibility rule, do not assume one.
  - *The first draft of this bullet required contiguous runs for `jitterPx`, on the
    belief that it is computed between consecutive frames. It is not, and the rule would
    have refused subsets the metric reads. Caught by Copilot's review of #140, from the
    metric's code: a rule in this document that fired where it must not, never exercised
    the way the document requires of every check.*

> Origin: #105. Tilt was the covariate that decided the step and no one named it in
> advance.

## Stage 3 — Criteria and prediction, refutable in both directions

Criteria are registered in their own commit, before the implementation, and that commit
is cited by hash — so the PR carrying it merges with a merge commit and is never
squashed.

For each regime the covariates define, the prediction states: the direction, the margin,
and **what result would refute it**. A prediction with no refuting outcome is rejected at
review. A prediction whose outcome a prior measurement has already settled is not a
prediction; if a probe has measured the effect, the prediction cites the probe as its
basis and says so.

A criterion that fails is never edited. The result is recorded in an addendum beside it.
An addendum may be added more than once; each one stands.

Produces: the criteria file, its hash, and the prediction in the step's registration.

> Origin: C4 failed on 7 of 252 fitted renders and was not rewritten. The near-miss was a
> single-sentence prediction that IPPE is better, which the grid had already refuted below
> the crossover.

## Stage 4 — The brief is generated, not recalled

The brief quotes the issue, the ADR and the plan **by line**. The implementing session's
first action is to verify every quoted citation against the source and report each
mismatch before doing anything else.

Produces: a citation check at the head of the session's first report.

> Origin: two reviewer errors in one step — ADR-0001 point 2 cited as point 7, and the
> frozen instrument's pose stage not listed among the collisions. Both were caught by the
> implementing session reading the sources. Informal, it caught them twice; required, it
> catches them every time.

A ruling in the brief is checked the same way as a citation, before it is registered. The
third reviewer error of the same step was a ruling, not a quote: an ambiguous-frame
fallback to the closed form was ruled in as "the control's path and therefore safe", and
was found to import exactly the defect the new estimator's depth rule avoids. Measured
over four hand-held clips, fifty of the seventy-one frames on which the selected pose put
the plane behind the camera were degenerate (both candidates behind: a homography with no
admissible pose at all), and only twenty-one were ambiguous. The fallback fired mostly on
frames that should have had no pose, and the case the ruling reasoned about was the
minority. Recorded as the reviewer's error in round 0's audit record (#137, #138). The
rule: a fallback the brief rules in is exercised on the frames it will actually see before
it is registered, like any check.

## Stage 5 — The box

**The box lists rules only where it cites the file that records them, and anything
without a citation is a draft pending the maintainer's ratification.** Reconciled on
2026-10-16 against #139, which ratified the entries the audit of 2026-10-15 had found
recorded nowhere, and against the audit record
(`2026-10-14-tab9-m4-calibration-audit.md`, "Two entries from the audit of the standing
constraints"). The standing stop conditions, cited from here and never retyped into a
prompt:

- All repository artifacts are in English. — `AGENTS.md`, "Conventions", "Language".
- Do not run `gh pr merge`, do not enable auto-merge, do not merge or approve anything.
  Every merge is the maintainer's. — *Recorded in no file.* `CONTRIBUTING.md`'s workflow
  and #108 say who merges and who closes, not that a session never does. A draft pending
  ratification, recited since 2026-10-01.
- Do not touch a frozen INPUT. The packages' `package.json` files, `package-lock.json`,
  the tsconfigs, the target `.wnft` and the clips are frozen and attested by a content
  hash recorded for each (the manifest's `sources`, `target.sha256`, the clip's hash
  file). The root `package.json` is frozen too but attested by no hash: the manifest does
  not list it, so only the guard diff over it between `37dc6d4` and the round's head
  shows it unchanged, and #127 holds the gap for after the campaign. If the work needs
  any of them changed, stop and report, do not change it. — `docs/benchmarks/README.md`,
  "The instrument, the subject and the inputs (2026-10-14)", item 3.
- The target's SHA-256 stays the one recorded at the campaign's start. — `AGENTS.md`,
  "Architecture", the `examples/targets/pinball.wnft` bullet.
- `fixtures/nft-target/` is frozen per released format version, and the Rust codec never
  regenerates it. — `fixtures/nft-target/README.md`; `AGENTS.md`, "Architecture".
- `tracking_target.ts` stays at 64 patches: an invariant, not a default. —
  `packages/nft-tracker/AGENTS.md` (#139, A1).
- Committed benchmark exports are evidence: never re-edited, never deleted. —
  `AGENTS.md`, "Test assets" (#139, A2).
- `packages/nft-tracker/src/` imports no backend. — `AGENTS.md`, "Architecture";
  ADR-0001, point 2.
- An accepted ADR's decision is never edited — only a ticked action item, a fixed link,
  or a "To revisit" measurement entry. — `AGENTS.md`, "Design records".
- A shipped CHANGELOG entry is never amended. — `CONTRIBUTING.md`, the release procedure
  (#139, A3).
- `minPatchZncc` is not lowered **within M3's tuning pass**, the scope the record gives
  it: `docs/benchmarks/README.md:1602`, "`minPatchZncc` is not a knob here". It is not a
  general rule; the general form the step prompts recited was a reviewer error (the audit
  record, B).
- The root `README.md` is not changed without the maintainer's say. — `AGENTS.md`,
  "Test assets" (#139, A4).
- Contract changes to `cv-backend-spec` are not merged unilaterally; the fourteen-day
  amendment rule governs and silence consents only for additive changes. —
  `CONTRIBUTING.md`, "Amending the cv-backend-spec contract".
- Code work runs on any machine; a measurement campaign stays on the machine it started
  on, and the rule expires with the campaign. — `docs/benchmarks/README.md`, "The
  instrument, the subject and the inputs (2026-10-14)", item 5 (#139, A5).
- The jsfeatNext 1.x upgrade waits for the campaign's close, with the dependency freeze
  it follows from. — the same section, item 3 (#139, A6); #94 carries the pointer.
- No document outside this repository and its issues is a source for any session. —
  `docs/benchmarks/README.md`, "What the plan rests on" (2026-10-13).
- Reading a frozen file is not changing it. Running a frozen module read-only is not
  changing it. Reimplementing a frozen metric instead of importing it **is** changing it:
  import the module or stop and report. — *Recorded in no file.* A draft pending
  ratification; the practice is the record's (round 0's item 3 and the frame-set script
  import the module unchanged).

Not in the box:

- "Auto-fix stays off on PRs carrying committed evidence" was recited in the step prompts
  without ever having been decided or configured (nothing in this repository fixes or
  commits to a branch), and was withdrawn on 2026-10-16; the check behind the withdrawal
  is the audit record's entry C.
- "No subagents during a device session" is not a standing rule. It is a per-brief
  instruction, stated in the brief of the session it binds, and it binds no other.

---

## Every check is exercised both ways

One day's work on #105 turned up five instruments that could not distinguish the condition
they claimed to detect:

- the frozen pose stage, reading 0 on every tracker frame while still counting every ok
  frame, so its percentiles were counts of zero;
- the provenance test, red on every development machine by construction, so its red
  carries no information;
- jitterPx, blind to a pose treatment because it reads corners under H;
- #90's sweep signal, nonzero on correct fits on a view that is not a plane homography for
  the camera, so thresholds derived there are inflated;
- the acceptance suite's "better candidate selected" flag, comparing the minimum of two
  errors against one of those same two, so it was true whatever the selector chose — a
  test that could not fail, and the counts it produced reached two sentences of the
  record before an outside reviewer caught it.

A sixth was found the same day, and it differs from the five in one way that matters:
**it ships.** The detection gate accepts a homography fitted on four correspondences, and
a fit on four reproduces those four exactly, so its residual on its own points is zero by
construction and RANSAC's threshold cannot reject it. The detection path's only acceptance
test is a point count that four satisfies; the patch minimum and the fit-RMS gate belong to
the tracking step and never see a detection. On the hand-held clips, 17% to 24% of posed
frames are such fits, most with a flipped pose, and their corners enter every exported
metric as posed frames (#137). The five were instruments of the record; this one is in the
measured pipeline, so its blindness reaches the campaign's data.

The common cause is not carelessness about any one of them. It is that none was ever
exercised against a case where it **must** fire and a case where it **must not**. So:
before a check or a metric is trusted, it is run on both, and the two results are recorded
beside its definition. A check that fires on both, or on neither, is not a check.

The most general form of the same defect is **a requirement with no check, which is a check
that cannot fail.** ADR-0001 point 7 requires that every random choice go through an
injectable RNG; in the shipped path RANSAC draws from the global `Math.random`, the
contract offers no injection point (#24 creates one: adopted on silence on 2026-10-16, as
its comment of that day records under `CONTRIBUTING.md`'s amendment rule; its wiring is
post-campaign), and no test fails when a random choice bypasses an injectable RNG. The
requirement stood accepted for weeks with nothing able to detect its breach. An accepted
requirement is listed with the check that enforces it, or it is listed as unenforced; a
same-input-same-result test proves determinism when the RNG is injected and does not
catch a draw that bypasses it, so the enforcing test counts reads of the global during a
run and asserts zero, exercised both ways (#137's usage rule).

The wording rule that follows, because this is where a blind instrument does its real
damage: **a zero produced by an instrument that cannot respond is never recorded as "no
effect".** The prediction resting on it is *void*, not refuted, and no statement about the
treatment follows from the zero. An attested null reads to a later reader like evidence;
a void prediction reads like what it is.

Two rules about the record's own numbers, which is where the fifth one did its damage:

- **Every figure in the record is traceable to a check that can fail.** A count produced
  by an assertion that cannot fail is not a measurement of anything, and it reaches the
  record looking exactly like one.
- **A sentence in the record is judged by its plain reading, not by what it was meant to
  say.** "The closer of the two on 240 of 240" was written about IPPE's two candidates and
  reads as a comparison against the closed form. When the two readings differ, the sentence
  is wrong, whichever one the author had in mind.

Two rules on checks, added 2026-10-17:

- **A figure that gates a decision gets one independent attempt at refutation before it
  is recorded,** and what the attempt found is recorded beside it, including when it found
  nothing. Its evidence, from 2026-10-17: three independent attempts on a window-bootstrap
  figure found that an independent per-run resample carries no covariance between arms
  measured on shared footage, which the reviewer had accepted; two attempts on a
  frame-resample figure found that its 2.36% rate was a net count ratio, not the rate the
  runs' frame sets differ by. Both findings changed what reached the record (the plan,
  M3's runbook step 8, its note of 2026-10-17): the paired resample stands beside the
  independent one, and the frame resample is recorded at the pair's own dropped fractions,
  0.303 and 0.331, not at 2.36%.
- **A check that fires and does not stop the figure is not a gate.** Exercising a check
  both ways shows that it responds; it does not show that its failure prevents the result
  from being reported. Both must be shown, and the second is the one that was missing. Its
  instance, from 2026-10-17: the four checks of #104's item 3 harness
  (`docs/benchmarks/2026-10-17-104-stage1-probe-item3.mjs`), shadow equality, jitter
  reproduction, unmatched detections and inconsistent duplicate residuals, each responded
  correctly and counted its failures, and the harness printed every figure anyway; a posed
  detection with no observed residual was admitted by every filter. Found by the review
  tool on #144, before it had produced a wrong figure, and fixed by making the checks fatal
  ahead of any computation (`71cfdac`).

The addenda written in a step's last hours get the least scrutiny and carry the most of
its conclusions. They are read by someone who did not produce them.

## What the record says afterwards

Unchanged from `docs/benchmarks/README.md` and #102 Part 4, restated here because these
four decide whether a step's outcome survives being read later:

- A fact lives in one place.
- A derived figure carries its derivation. A bound stated more tightly than it was
  measured is not a bound: the crossover is "between 7° and 10°", not "about 8°".
- A commit whose hash is cited in the record is not squashed.
- A mechanism or a cause is a conjecture until measured, and is labelled as one.
- **A figure that bounds variability never comes from the difference of two
  observations.** This is a policy, and its reason is a number, not an impossibility: two
  observations do estimate a dispersion, `s² = (x₁ − x₂)² ÷ 2` on one degree of freedom,
  but on one degree of freedom the 95% interval for σ runs from 0.45 s to 32 s, a factor
  of about seventy, so a tolerance set from it bounds nothing. A spread, a tolerance or a
  threshold therefore comes from repeats, with its degrees of freedom stated and its
  interval beside it, or from a prior measured movement with its derivation beside it.
  The plan states the rule beside M3's step 8; it is restated here because it was
  applied again on 2026-10-16 and the application was the implementer's, not the
  brief's: the seed test of #123 was asked for as two runs and run as eight, with the
  standard deviation on seven degrees of freedom and its interval, because on one degree
  of freedom the estimate could not have bounded the spread the test exists to bound.
  The plan's sentence at that place carries a dated correction of 2026-10-16 to the same
  effect.

A step that ends in a negative result has succeeded at being a measurement. The record
says what was measured, in which regime, and what it refuted.