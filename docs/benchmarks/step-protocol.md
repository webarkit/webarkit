# The protocol for one milestone step

Status: proposed 2026-10-15, after M4 step 3 (#105).

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

Two rules on using a covariate to select frames or blocks:

- A covariate read to select data is read from the **control arm only**, never from the
  treatment arm. Reading it from the treatment arm selects on the dependent variable.
  This is the same rule the jitter clause already follows by being read on each block's
  own baseline arm.
- A selection must yield **contiguous runs** when the metric is frame-to-frame. jitterPx
  is computed between consecutive frames, so a scattered subset of qualifying frames
  yields nothing. Report the distribution of contiguous-run lengths, not just the count.

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

## Stage 5 — The box

The standing stop conditions, cited from here and never retyped into a prompt:

- All repository artifacts are in English.
- Do not run `gh pr merge`, do not enable auto-merge, do not merge or approve anything.
  Every merge is the maintainer's.
- Do not touch a frozen INPUT. `package.json`, `package-lock.json`, the tsconfigs, the
  target `.wnft` and the clips are frozen and attested by content hash: if the work needs
  one changed, stop and report, do not change it.
- The target's SHA-256 stays the one recorded at the campaign's start.
- `fixtures/nft-target/0.2/` and `0.3/` stay frozen. `tracking_target.ts` stays at 64
  patches.
- Committed benchmark exports are evidence: never re-edited, never deleted.
- `packages/nft-tracker/src/` imports no backend (ADR-0001 point 2).
- An accepted ADR's decision is never edited — only a ticked action item, a fixed link,
  or a "To revisit" measurement entry.
- A shipped CHANGELOG entry is never amended.
- The ZNCC gate is never lowered.
- The root `README.md` is not touched without the maintainer's say.
- Contract changes to `cv-backend-spec` are not merged unilaterally; the fourteen-day
  amendment rule governs and silence consents only for additive changes.
- Auto-fix stays off on PRs carrying committed evidence.
- Code work runs on any machine; a measurement campaign stays on the machine it started
  on. No subagents during a device session; subagents are fine for independent checks.
- Reading a frozen file is not changing it. Running a frozen module read-only is not
  changing it. Reimplementing a frozen metric instead of importing it **is** changing it:
  import the module or stop and report.

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

The common cause is not carelessness about any one of them. It is that none was ever
exercised against a case where it **must** fire and a case where it **must not**. So:
before a check or a metric is trusted, it is run on both, and the two results are recorded
beside its definition. A check that fires on both, or on neither, is not a check.

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

A step that ends in a negative result has succeeded at being a measurement. The record
says what was measured, in which regime, and what it refuted.