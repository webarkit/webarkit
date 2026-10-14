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
  - It is carried by the difference between the two sessions. M3's four
    average 40.8 ms and 0.14192 px; round 0's eight average 30.96 ms and
    0.14064 px. The two sessions also differ in Chrome and harness, so the
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
  overstated wording (B1, B3 and B4), so by the rule the correction has not
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

Its findings, and what became of each, are recorded below when it has run.
