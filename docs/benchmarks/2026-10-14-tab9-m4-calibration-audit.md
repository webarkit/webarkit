# 2026-10-14 — Round 0's write-up, read independently

The record of the independent read of M4 round 0's write-up: what it read,
what it recomputed, what it found, and what became of each finding. The
maintainer asked for it before the merge, as desk work once the device session
was over. The session's brief had excluded subagents for the device session
only.

## What was read, and how

- **The write-up, at `62b9d21`:**
  - the session record, [`2026-10-14-tab9-m4-calibration-session.md`](./2026-10-14-tab9-m4-calibration-session.md);
  - the README's "Round 0's result (2026-10-14)";
  - the body of [PR #125](https://github.com/webarkit/webarkit/pull/125).

  It was read as committed (`git show 62b9d21:…`), not from the working tree.
- **What was not read:** `7c0cc66`, the acquire finding and the correlation,
  committed while the read ran. The second read covers it (below).
- **The registration:** the README's M4 section at `62b9d21`, including the
  round-0 procedure registered in `ba29b89`.
- **The raw data:**
  - the eight exports, their `.url.txt` and `.link.txt`, and M3's four static
    exports;
  - each confirmed byte-identical to `62b9d21`. The `.link.txt` files differ
    on disk only in line endings.
- **How:**
  - **The agent:** a fresh one, which had written none of the write-up. It
    was read-only: no edit, commit, push or post, and no rebuild of the
    attested build. It kept its scratch scripts outside the repository.
  - **What it recomputed:** every figure from the exports.
    - Each run's `jitterPx`, twice: through the page's own `cornerJitter` and
      `countedLoopFrames`, and through its own implementation of the written
      definition.
    - Every quantile, through its own incomplete beta and gamma functions.
    - The power rows, by numerical integration of the noncentral t.
  - **What else it read:** every claim against what the registration lets it
    conclude.

## What it recomputed

- **The eight x values:**
  - through the page's functions, bit for bit equal to the recorded
    `runSummary.jitterPx`;
  - through its own implementation, within 3 × 10⁻¹⁶;
  - counts, windows and per-loop values all equal.
- **The arm test:** D = 0.00129528 px, s_p = 0.00114633 px, A = 0.00198340
  px, accepted; t = 1.598, p = 0.161.
- **s₀** = 0.00126716 px on 7 degrees of freedom, with an interval of
  0.00083781 to 0.00257902 px.
- **The operational threshold, k = 2:** 3.344084 × s₀ = 0.00423749 px.
- **The within-run check:** F = 1.468765 on 7 and 21.
- **M3's four:** F = (s₀ ÷ s_M3)² = 14.10303.
- **Every quantile the record quotes,** to four decimals.
- **The run-level checks,** all passing in all eight runs:
  - rules 1 to 3, with the recorded URL;
  - the provenance at Start: served hashes, `no-store` on all 11 responses,
    no refusal;
  - the link verdict, re-derived from each log's contents rather than its
    verdict line;
  - step 7's identity;
  - the stall check, with the embedded copy `cccb475b…`.
- **The timestamps, the export hashes and the storage figures** in the
  record.

Its verdict: **the foundation stands.** The eight numbers, the arm test, s₀,
its interval and the provisional threshold reproduce. The arithmetic errors
it found are cosmetic (A1, A2, A8). What needed correcting was interpretive
(A3 to A7).

## The findings

| # | Finding | Kind | What became of it |
|---|---|---|---|
| A1 | M3's `acquire` p50 given as "40.8 to 40.9"; one of the four, `sync-static-2`, is 40.6 | error | Fixed: "40.6 to 40.9", in the table and in the acquire finding (`7c0cc66` had repeated it) |
| A2 | k = 3's threshold printed 7.6069 × 10⁻⁶; it is 7.6068 × 10⁻⁶, from the rounded or the exact F | error, last digit | Fixed |
| A3 | Round 1's 0.0092 px was put in units of s₀ (7.3 s₀) and read against the k = 2 power table, under a heading that drew no verdict. The plan rules that round 1's size does not transfer, and s₀ is read with the frame-set variation in, while 0.0092 px is on common footage | overstates | Fixed: the bullet now says round 1's figure is not set against s₀, and why, with a dated correction note |
| A4 | "What it does not change … as the clause and the brief require": an interpretive ruling written as fact, and the brief cited as a source, which the plan does not allow | overstates | Fixed: "the brief" removed. The ruling is now the maintainer's of 2026-10-14, which came with the review: the exclusion stands on the general reason, as the registration already said. Its first wording, "with one leg cut", was corrected under B1. It is recorded in the acquire finding, beside the correlation that bears on it |
| A5 | "The arms are found one population of repeats" leads, without what item 1 lets an accepted block claim. It is the registration's own wording, which item 1 bounds | overstates | Fixed: "not shown to differ" leads, with \|D\| = 1.02 s₀ and the 0.777 pass rate at 1 σ |
| A6 | "The runs do not differ by more than sampling within a run makes them differ": a non-significant F read as proof of the null | overstates | Fixed: "are not shown to differ" |
| A7 | The readiness condition, a quiet link, was registered in `ba29b89` (11:54:11Z) after the 27 drops (11:42:41–11:47:53Z) and the watch (11:48:26–11:53:29Z) it prescribes | omission | Fixed: disclosed in the record, which adds that the condition reads no jitter and gates no run |
| A8 | Products printed from rounded inputs do not reproduce in the last digit (for example 3.3441 × 0.0012672 = 0.0042376, printed 0.0042375) | nit | Fixed: the record says its figures are from unrounded values, and gives s₀, s_p and s_M3 to one more digit |
| A9 | The clip's bytes, `examples/videos/pinball-static.mp4`, are attested by no check: not in the manifest, the guarded paths or the export. It is the kind of dropped check the plan found for the target | omission, at the registration | Half fixed: the record gives the clip's SHA-256 (`978cb9f2…`, equal to its blob at `37dc6d4`) and its state. The server's `last-modified`, read before run 1 (11:43Z), gave 2026-09-26. How later sessions attest the clip is [#126](https://github.com/webarkit/webarkit/issues/126), opened at the maintainer's ruling, to be decided before round 1 with #124. Rule 3 is not changed for round 0 |
| A10 | The `.link.txt` files' normalization from CRLF to LF was disclosed only in the PR body, which is not a source | omission | Fixed: one bullet in the record |
| A11 | The drops, the watch, the "Opened" column and the 29-minute figure cannot be checked from the repository | nit | Fixed: adb's log is committed as `2026-10-14-tab9-m4-calibration-before-run-1.adb.txt`, filtered to the lines naming the device, which leaves out the PC's adb key fingerprint. The watch's output and the "Opened" times are said to come from terminal output not kept |
| A12 | An eight-run range and a four-run range set side by side, though they are not comparable | nit | Fixed: the comparison is the F; the expected ranges (2.85 σ and 2.06 σ) are given |
| A13 | "Near the upper bound" without its p | nit | Fixed: two-sided p = 0.053 |
| A14 | The PR body: "9.4 MB before this branch" is at `ba29b89`, while the merge base gives 9.3 MB. "55 MB on disk" mixes binary and decimal units. "No independent read was made" is now stale | nit | Fixed in the PR body |
| A15 | "Every run, every check" did not say that the loop-wrap rule refused nothing | nit | Fixed |
| A16 | "The tracker's own steps were the same", a judgement word in a descriptive row | nit | Fixed: "moved by at most 0.2 ms at p50", with the figures |

## Beyond the findings

**The correlation, recomputed independently** before it was in the
write-up. Its figures equal the record's:
- Pearson r = 0.4275, with t = 1.158 on 6 degrees of freedom and p = 0.291.
- The exact permutation p, over 8! orderings, is 0.297.
- Leaving out run 3 gives r = 0.004.
- Its Spearman ρ, 0.405, differs from the record's 0.467. The difference is
  in how one tie is ranked:
  - runs 1 and 8 have exactly the same `acquire` p50 in the raw values,
    28.299999952 ms;
  - the record's 0.467 averages their ranks, the standard treatment;
  - the read's 0.405 breaks the tie by order, run 1 below run 8, and the
    other order gives 0.524.

**Two figures it computed, which are not in the record:**
- **r between counted frames and x:** −0.493.
- **r pooled with M3's four:** 0.63, p = 0.028 on 10 degrees of freedom.
  - It crosses blocks, Chrome versions and harnesses.
  - By the plan's rule against pooling across blocks, it is a labelled
    summary at most, and supports no verdict.
  - It is mostly carried by the difference between the two sessions:
    61.5% of the pooled cross-product (3.38 × 10⁻² of 5.49 × 10⁻² ms·px).
    With each session centred, r = 0.42. M3's four average 40.8 ms and
    0.14192 px; round 0's eight average 30.96 ms and 0.14064 px. The two sessions also differ in Chrome and harness, so the
    figure says nothing about `acquire` within a block.
  - *Corrected on 2026-10-14, from the second read, B11. This bullet first
    said the figure "points the other way" from the within-block reading,
    which gave a cross-session summary a direction of evidence.*

**What it raised for the maintainer.** Round 0 does not reproduce the M3
pattern on which the argument for a state frozen within a block rests:
- s₀, 0.00127 px, is about one run's resampling SD, 0.0013 to 0.0015 px;
- round 0's within-run F, 1.47 (p = 0.23), puts the run-to-run spread about
  at the loop-to-loop one;
- M3's four are under-dispersed: F = 0.13, with a lower-tail probability of
  0.06;
- s₀ ÷ s_M3 = 3.76 (F = 14.10, two-sided p = 0.053).

It changes no figure and not the acceptance. It bears on #123 and on the
premise behind the back-to-back design.

## The second read, of the changed passages

- **The same agent re-read** what changed from `62b9d21` to `fcf9550`:
  - the acquire finding and the correlation (`7c0cc66`);
  - the fixes above, with this record and the committed adb excerpt;
  - the updated PR body.
- **What it confirmed:** every new figure in that range. That covers the
  correlation's sums, the per-run products, the leave-one-out values, the
  six-run SD, the 70-labeling table and its counts, the p-values, the
  expected ranges, the timing of `ba29b89`, the adb excerpt's counts, the
  clip's hash, and the storage figures.
- **What it cannot verify:** the server's `last-modified` before run 1, the
  "Opened" times, the watch script's output, and the hashes on the tablet.
- **On the review's claims:** nothing in the record states the three claims
  of the maintainer's review that the data refuted. Three passages could be
  read toward two of them (B3, B6, B15).
- **Its verdict:** the correction can stop after B1 to B4, which are wording
  only. Its own read did not cover `549b4ba`, the refuted claims and the
  plan's dated notes.

| # | Finding | Kind | What became of it |
|---|---|---|---|
| B1 | "One of the plan's two supports … is cut" and "with one of its two legs cut": the registration rests the exclusion "on the general reason alone", and "one cost of a frame" was a factual premise cited from M3, not a load-bearing leg. At arm level the cost was balanced: mean `acquire` p50 30.37 ms in the sync arm, 31.55 ms in the worker arm | overstates the registration | Brought to the maintainer, since the "two legs" wording was the maintainer's ruling. The maintainer ruled that framing inaccurate. Fixed in the record, the README, this record's A4 row and the PR body, with a dated note in the record |
| B2 | "Both enter round 1 untried": the session's re-run rule was registered for that session only | misstates the registration | Fixed: item 5's redo enters round 1 untried; what replaces a failed counted run is for the stopping rules |
| B3 | The correlation given without its test, and "does not predict beyond run 3" without "cannot exclude" (README, PR body) | overstates by omission | Fixed in both: t = 1.158, p = 0.291, not shown; eight runs cannot exclude a moderate relation |
| B4 | "Holds each run's x as measured, which the accepted arm test supports" | overstates | Fixed: it assumes the arm test's null, which is not rejected but not shown |
| B5 | "Each gets the same D, s_p and A" reads as the same values | nit | Fixed: "read with the same formulas" |
| B6 | The heading "… what it did to the arm test" presumes an effect | nit | Fixed: "whether it mattered to the arm test"; the permutation p, 12 of 70 = 0.171, added beside the t test's 0.161 |
| B7 | "About 17% of the time (Fisher's z)": the t test's power, by simulation, is about 18.5% (17.5% by Fisher's z, at r = 0.4275) | nit | Brought to the maintainer, since the 17% was in the maintainer's ruling and in #123's comment. The maintainer ruled "about 18%" everywhere. Fixed in the record, with a dated note, in the README, and in #123's comment, with a dated note on the edit |
| B8 | "What did not move: the tracker's own steps" (record and README) undoes part of A16 | nit | Fixed in both: "moved by at most 0.2 ms at p50" |
| B9 | The clip's `last-modified` was called "during the session", but it was read at 11:43Z, before run 1, and not kept | nit | Fixed, with what it shows and what it cannot |
| B10 | Two deferrals with no issue: the clip's check in later sessions, and `acquire` as a covariate | omission | The second is ruled: archived as a report (`549b4ba`). The first is held by [#126](https://github.com/webarkit/webarkit/issues/126), opened at the maintainer's ruling |
| B11 | The pooled r = 0.63 "points the other way": a cross-session summary given a direction of evidence | overstates | Fixed here, with a dated note, and in #123's comment, which carried the same phrase |
| B12 | The A5 row left out that the first wording was the registration's own | nit | Fixed |
| B13 | "Gates no run" (it gated run 1's start); the committed excerpt attests more than the record said | nit | Fixed: it gated run 1's start and decides no run's validity; what the excerpt shows from 11:48:14Z to 11:54:43Z is stated |
| B14 | The README result printed 3.3441 × s₀ = 0.0042375 without the unrounded s₀ | nit | Fixed |
| B15 | The slope's 0.00137 px over 28 → 42 ms reads as an effect size | nit | Fixed: the 0.00137 is dropped; the slope is carried by run 3, and without it is 1.3 × 10⁻⁶ px per ms |

## The third read, and its stopping rule

Stated on 2026-10-14, before the read runs, as the maintainer ruled.

- **The rule, M3's:** the correction stops when a read finds no wrong figure
  and no overstated verdict.
- **Where it stands:** the second read found no wrong figure. It did find
  overstated wording (B1 to B4, and B11; corrected after the third read,
  C4), so by the rule the correction has not
  stopped, and this third read runs.
- **Its limit:** if this read finds a wrong figure again, the correction
  stops there. Its findings go to the maintainer instead of into a fourth
  pass. At that point the signal is about the process, not the document, and
  a fourth pass would not fix it.
- **The case neither covers:** an overstated verdict but no wrong figure. The
  rule does not stop the correction then, and whether a fourth read follows
  is the maintainer's to rule.
- **Its scope:**
  - `549b4ba`: the three refuted claims and the plan's dated notes;
  - `eec47b8`: the second read's fixes;
  - the commit that applies B1 and B7, which also states this rule;
  - #123's comment as edited, and the PR body.
- **Its reader:** a fresh agent, not the one that made the first two reads.
  Several passages in scope are that agent's own suggested wordings (B1, B4,
  B9 and B11), so it would be reading text it wrote.

## The third read's findings

- **The reader:** a fresh agent, which had made neither earlier read.
- **What it read:** `fcf9550` to `a906345`, #123's comment as edited, and the
  PR body.
- **What it recomputed:** every figure in that scope, from the exports, the
  adb excerpt, the link logs and git.
- **The result: no wrong figure, and three overstated verdicts (C1, C2,
  C3).** So by the rule the correction continued.
- **What it could not check:** the 11:43Z `last-modified`, the watch's
  output, the "Opened" times, the hashes on the tablet, and who wrote which
  passage.

| # | Finding | Kind | Wording whose | What became of it |
|---|---|---|---|---|
| C1 | "What is refuted is that the placement of the slow runs made [the margin] smaller than it would otherwise be" reverses the enumeration: the split that ran did make the margin smaller | overstated verdict | the agent's | Fixed: the claim refuted is that the placement kept \|D\| smaller and the margin larger. Of the 30 one-arm splits, 28 give a larger margin; of all 70, 58. The record now says what that does to the result |
| C2 | "It does not carry jitter", where the evidence is a leave-one-out beside p = 0.291 and about 18% power | overstated verdict | the maintainer's | Fixed: "it does not carry the block's spread", with the six-run SD and "a moderate relation is not excluded" |
| C3 | "So its failure does not bite on the arm test": a consequence asserted, not computed | overstated verdict | the maintainer's | Fixed: the computation replaces it. Regressing x on the arm and on `acquire` gives an arm effect of 0.001196 px, against the raw D of 0.0012953 px |
| C4 | The stopping rule's list of the second read's overstatements, "B1, B3 and B4", left out B2 and B11 | nit | the agent's | Fixed |
| C5 | "They are the first instances" against item 3's "rather than the new rule's" | nit | the maintainer's | Fixed: the first two are the rule's first instances, and the third, a figure, came with them |
| C6 | The 18.5% and 17.5% are for r = 0.4275, not 0.43 | nit | the agent's | Fixed: "at the observed r = 0.4275", in the record and in #123's comment |
| C7 | s₀ "matches one run's resampling noise", though 0.00127 sits just below 0.0013–0.0015 and is not tested against it | nit | the maintainer's | Fixed in the plan's note and in #123's comment: "is about"; M3's lower tail, 0.061, added to the note |
| C8 | The excerpt "attests the watch", but it attests only its no-termination finding | nit | the agent's | Fixed |
| C9 | The pooled r is "carried by" the gap between the sessions; that gap carries 61.5% of the cross-product, and r is 0.42 with each session centred | nit | the agent's | Fixed here and in #123's comment: "mostly carried", with those figures |
| C10 | #123's heading, "no evidence that it moves `jitterPx`"; the registered phrasing is "not shown" | nit | the maintainer's | Fixed: "not shown to move" |
| C11 | #123, "the device's state changes within a block", names a cause | nit | the agent's | Fixed: "something in the device or browser, not measured, changes within a block" |
| C12 | #123's opening named "the anomaly that opened this issue", where #123 was opened on the twelvefold ratio and round 0 bears on its M3 side | nit | the agent's | Fixed: the maintainer's own wording, "the anomaly that motivated the shared-state hypothesis" |
| C13 | #123's links were pinned to `549b4ba`, which shows superseded text | nit | the agent's | Fixed: re-pinned to the commit that applies these fixes |
| C14 | The PR body still called the second read pending, stopped its contents at `fcf9550`, and gave storage at `fcf9550` | nit | the agent's | Fixed |

**Whose wording each overstated verdict was in.** The agent computed this
from the commits, as the maintainer's rule on attribution requires.
- **The first read's:** A3 to A7, all in the agent's wording. A5 was the
  registration's phrase, which the agent led with.
- **The second read's:**
  - B1, the maintainer's "two legs" framing;
  - B2, B3, B4 and B11, the agent's.
- **The third read's:**
  - C1, the agent's;
  - C2 and C3, the maintainer's.
- **The total:** of the overstated verdicts the second and third reads found,
  three are in the maintainer's wording and five in the agent's.
- **A correction:** the maintainer's ruling on the third read called all six
  of C1, C2, C3, C5, C7 and C10 the maintainer's phrases, and every
  overstated verdict of the second and third reads the maintainer's wording.
  Both statements are corrected here. C1 was the agent's sentence, and C5,
  C7 and C10 were rated nits, not overstated verdicts.

## The fourth read, and its stopping rule

Stated on 2026-10-14, before the read runs, as the maintainer ruled.

- **The rule:** the same as the third read's. The correction stops when a
  read finds no wrong figure and no overstated verdict.
- **Its limit:** a wrong figure stops the correction there, and goes to the
  maintainer.
- **This is the last read of this record.** When it reports and CI is green
  on the final head, the maintainer says when to merge. Any wording
  improvement after that goes into round 1's record, not back into this one:
  a record corrected without end stops being a record.
- **What it is asked to report besides,** at the maintainer's request: whose
  wording each finding is in.
  - The maintainer's question was whether the looseness was the
    maintainer's, or the document is hard to state precisely.
  - The attribution above changes the question. Overstated verdicts have
    been found in both authors' wording, and every figure has reproduced
    each time.
  - The fixes it reads are the agent's text. Several of them are wordings
    the third reader proposed, and the maintainer ruled on them.
  - So the reader is asked to name which diagnosis its findings support, if
    any.
- **Its scope:** the commit that applies the third read's fixes, #123's
  comment as edited, and the PR body.
- **Its reader:** a fresh agent, which has made none of the earlier reads.
- **Its findings** are recorded below as found, with no further fix applied
  to this record.

## The fourth read's findings, recorded as found

- **The reader:** a fresh agent, which had made none of the earlier reads.
- **What it read:** `a906345` to `c6a8566`, #123's comment as edited at
  14:12:57Z, and the PR body as edited at 14:13:27Z.
- **What it recomputed:** every figure in scope, and all twelve x values
  again, bit for bit.
- **The result: no wrong figure, and two overstated verdicts (D1, D2).** Both
  are in the agent's own new text about the correction process. It also
  found four nits.
- **Under the rule:** the correction would continue. This was the last read
  of this record, as stated before it ran, so its findings are recorded here
  as found. No fix is applied to this record, and wording improvements go
  into round 1's record.

| # | Finding | Kind | Wording whose | What became of it |
|---|---|---|---|---|
| D1 | "Every figure has reproduced each time", in the fourth read's stopping rule above, is false. The first read found two figures that did not reproduce: A1 (M3's `acquire` range) and A2 (k = 3's threshold in its last digit). What is true is that every figure the result rests on has reproduced each time | overstated verdict | the agent's | Recorded as found, not fixed |
| D2 | "The agent computed this from the commits", above "Whose wording each overstated verdict was in". The commits cannot separate C1 from C2: both entered in `549b4ba`. The split was assigned from the maintainer's rulings in the session, which are not in the repository. The reader found no attribution false, only that its stated basis cannot produce it | overstated verdict | the agent's | Recorded as found, not fixed. What is true: each phrase's commit was located from the history, and the phrase was assigned from the maintainer's rulings in the session |
| D3 | The PR body says the second and third reads' fixes were "made by" the readers, who were read-only; the text is the agent's | nit | the agent's | Recorded as found |
| D4 | "That strengthens the acceptance against the luck reading": the enumeration rebuts the luck reading but cannot add support to the acceptance, as the next bullet says | nit | the maintainer's "strengthens", kept, with the agent's scope | Recorded as found |
| D5 | "The result has not eroded … the arm test … unchanged since `e9396df`": the figures and the decision are unchanged, but A5 changed the arm test's lead reading from "one population of repeats" to "not shown to differ" | nit | the agent's | Recorded as found |
| D6 | "The first read's: A3 to A7": A7 was rated an omission, not an overstated verdict | nit | the agent's | Recorded as found. No count is affected |

**The third reader's fixes, as applied, drew no finding:** C1, C2, C3, C5,
C7, C10, C11 and C12.

**Its answer to the maintainer's question on authorship: neither diagnosis
as stated.**
- **Not "the maintainer's wording":** this read's two overstated verdicts are
  the agent's own sentences, written without a ruling or a reader's proposal.
- **Not plainly "the document is hard to state":** the measurement statements
  now read cleanly, and every figure reproduces.
- **What the findings are consistent with:** across the four reads, every
  overstatement sits in a sentence saying what a computation or the record
  means, never in the computation beside it. Both authors wrote such
  sentences, and each new layer of them carried new ones. In this read, that
  layer was the record's account of its own correction (D1, D2, D5).
- **Its conjecture, labelled as such and not measured (#102's fourth rule):**
  the looseness comes from newly written summary sentences, which go
  unchecked until the next independent read, rather than from one author.
- **What the counts cannot do:** they are small, and not normalised by how
  much each author wrote, so they cannot rank whose wording is looser.

**Outside this record, raised for the maintainer.** #102 Part 4's fourth
rule still carries the two forms C5 and C2 corrected here:
- "its first instances: all three are the maintainer's";
- "Without one run, it does not correlate with jitter: r = 0.004".

It also pins the session record at `549b4ba`.

## A reviewer error, recorded 2026-10-15: a band rule spanning a heterogeneous regime

On #105's characterisation the maintainer stated, before seeing the table, a
rule for the refutation band of an above-crossover prediction: one band over
every tilt step from 10° upward, its edges the largest and smallest per-step
median plus and minus twice the largest per-step standard error of the
median. The implementer applied it as written and showed what it gives: an
upper edge above 1 (1.190 by sd, 1.224 by quartiles), because the rule
admits the 10° step, whose median is 0.968 against 0.29 to 0.42 from 15° on.
The rule treated the ratio as homogeneous across a regime the table shows is
not, and the single worst step set an edge that swallowed the claim. The
error is the reviewer's, corrected by the implementer's arithmetic. The
criteria and the description are untouched; the arithmetic stays beside the
description, labelled not registered, with the defect named
([the characterisation](./2026-10-15-m4-step3-ippe-c4-characterisation.md)).

## A reviewer error, recorded 2026-10-15: the ambiguity fallback imports the defect IPPE avoids

On 2026-10-15 the maintainer ruled that an ambiguous IPPE frame (#105's rule
(c)) falls back to the frame's own homography-derived pose, the closed form,
calling it the control's path and therefore safe. A seeded headless
measurement over the corpus (#137) shows what that imports: on every frame
where IPPE's selected pose puts the target plane behind the camera, the pose
is the closed form's, reached by fallback, and on no frame where IPPE's own
candidate was selected is the plane behind. Per hand-held clip the closed
form puts the plane behind on 28 of 257, 41 of 265, 50 of 329 and 46 of 275
posed frames; IPPE's selected pose on 14, 14, 24 and 19, all of them fallback
frames. The error is the reviewer's: the fallback is the leak. Its dominant
trigger is not ambiguity: of those 71 frames, 50 are "both candidates
behind the camera", a degenerate `H` with no admissible pose at all, where
the fallback copies a pose already known to be behind and the honest action
is to refuse; the ambiguous case the ruling reasoned about is 21 frames
across four clips. The same count establishes what the morning's ruling left
unverified: rule (a), the depth test, works as written and roughly halves
the behind-camera poses. Not changed yet: the remedy is upstream, at the
detection gate (#137), and patching the fallback first would hide the cause.

## Two entries from the audit of the standing constraints, 2026-10-15

- **A scoped rule recited as a general one (a reviewer error).** "The ZNCC
  gate is never lowered" was recited in the step prompts as a standing
  constraint. The record scopes it to M3's tuning pass: the plan's
  "`minPatchZncc` is not a knob here" (its tuning pass, the rounds), which
  is correct as written and is not changed. The general form was the
  reviewer's, and is withdrawn as a general rule.
- **A constraint recited without ever having been decided or configured,
  withdrawn.** "Auto-fix off on evidence PRs" was recited in the step
  prompts. Checked on 2026-10-15: `.github/` holds one workflow, `CI.yml`,
  which builds and tests on push and pull request and commits nothing, plus
  issue templates and the Copilot instructions; there is no dependabot,
  renovate, pre-commit or auto-commit configuration in the repository, and
  the only bots on pull requests are reviewers that comment. Nothing in this
  repository fixes or commits to a branch, so there was nothing to turn off.
  The constraint is withdrawn; it does not simply disappear.

## Three reviewer errors in the brief for #104's Stage 1 probe, recorded 2026-10-16

The brief for [#104's Stage 1 probe](./2026-10-16-104-stage1-probe.md) was
the maintainer's; the implementing session found each of the three against
the sources, as [the step protocol](./step-protocol.md)'s Stage 4 requires of
a session's first action, and the maintainer ruled them in here the same day.
The errors are the reviewer's, found by the implementer.

- **One channel named of two, and the one named carries nothing where it was
  claimed.** The brief stated that refusing frames reaches `jitterPx` "not
  through the values of H, but through window eligibility". The metric's code
  has two channels: a refused frame leaves the residual pool and the line fit
  of a window that stays eligible (`bench-metrics.mjs`, lines 933 to 934 and
  985 to 991), and a window left with fewer than four frames leaves the pool
  (line 963). On the wall clip the filter at five inliers keeps 36 of 36
  windows on all eight seeds and moves seed 3 from 27.46 to 6.11 px: the
  channel the brief named carries nothing there, and the other carries all of
  it. On the table clip both act. The probe's item 1 records the decomposition.
- **The treatment's signal conflated with the probe's filter.** The brief
  stated that "#104's treatment refuses exactly those fits", the 4-to-6-inlier
  detections. #104's treatment refuses by `d_scale` and `d_orth`; the probe's
  filter refuses by inlier count. Whether the two coincide was the probe's
  item 3 to measure, and they do not coincide: as filters at the values under
  which the seed sensitivity collapses they are near-equivalent, and frame by
  frame on the 4-versus-5 split they disagree (the probe's item 3, and the maintainer's ruling there that
  the brief's item 3 asked the wrong question).
- **The brief contradicted Stage 1's own requirement, one day after the
  protocol was written, by its author.** Stage 1 of the protocol produces "the
  numbers, and a named file under `docs/benchmarks/` recording them as a
  probe". The brief asked for a message only and for nothing written to a
  tracked file. The reason, recorded with it: the brief was written freehand
  from recollection, which is exactly what Stage 4 forbids, "the brief is
  generated, not recalled", quoting its sources by line. Stage 4 was broken in
  the first application of the protocol, by the person who wrote Stage 4. The
  maintainer ruled the brief wrong and the file was written. This entry is the
  protocol's first evidence about itself, and it is worth more than the other
  two: a rule that its own author cannot follow from memory one day on is a
  rule that has to be enforced by the generated brief's citation check, not by
  recollection.
