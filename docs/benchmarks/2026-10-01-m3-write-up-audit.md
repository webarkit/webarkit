# 2026-10-01 — M3's write-up, audited independently

After the device session, its write-up was read by an agent that had not
written it, against the registration, before the PR merged. This is that
audit's record: what it read, what it found, and what became of each
finding. It found twelve problems in a write-up that had already been
checked twice — its figures against the reading script's output, which
caught two slips, and its author's own reread — and the fixes of five of the
twelve changed a verdict word: F1, F2, F3, F6 and F8. A second read, of the
corrected passages only, found fourteen more, most of them introduced or
left by the first fix pass, one of them in a verdict word; a third read,
under a stopping rule set beforehand, found ten more and none in a verdict
word, so the correction stopped and those ten are listed below as known
imperfections. That is the evidence
that the independent read belongs in a campaign's plan, not in what someone
remembers at the end.

## What was read, and against what

- **The write-up**, at `9093860`: the session's record,
  [`2026-10-01-m3-device-session.md`](./2026-10-01-m3-device-session.md);
  the benchmarks file's "Results (2026-10-01)" subsection; ADR-0001's "To
  revisit" entry on point 5; and the body of
  [PR #97](https://github.com/webarkit/webarkit/pull/97).
- **The registration**: the M3 section of
  [`README.md`](./README.md#2026-09-29--m3-detection-off-the-frame-measured)
  at `0304390`, the head the session ran, with the one clause changed during
  the session — step 8's jitter allowance, replaced in `c884805` before any
  run of a moving clip — and the two records written before the session that
  it cites, [the pre-flight's](./2026-09-30-desktop-m3-preflight.md) and
  [the session additions'](./2026-10-01-m3-session-additions.md).
- **The scope**: the claims, not the numbers. Each row's verdict word against
  what the registration lets that row conclude; nothing reading as a verdict
  where the registration gives none; each condition read on the registered
  quantity and threshold; missed predictions written as missed; the wall
  clip's lock reported before any frame time, as the project owner required;
  the four documents consistent with one another; and the process claims
  against git and the exports' own start times. A number was recomputed only
  where a verdict word depended on it.
- **How**: a fresh agent, read-only — no edit, commit, push or post — with no
  device, on 2026-10-01.

## The findings

| | what it was | kind | what became of it |
|---|---|---|---|
| F1 | Every wall-clip row was read on both blocks pooled, although the registration reads each row on a bracketed pair and pools only step 10's spread rules. Read per block, row six's held-lock losses are **refused** in the second block (8.8% against 6.6%, +2.2 points over a bound of 2) and row seven is **not refused** in the first (+20.7%); pooled, they had been published as "met" and "refused". The record also said each block was "given beside" the pooled reading, and gave only row four's | overstates — changed verdict words | Fixed in all four documents: each wall row read per block, pooled figures moved to a table labelled as an unregistered summary that carries no verdict. Row six's refusal is recorded with the explanation the data allow — the difference reverses between the blocks, and its cause is open. Recorded after the session, as precedent, in the plan after the row-five paragraph (whose rule is that a change removing a path to refusal needs the stronger record): pooling across brackets is not a registered reading |
| F2 | Row five, descriptive on the device, was written "met" and folded into "rows five and six hold", and "first-step confirmation" appeared among what the session decides | misread a verdict — changed a verdict word | Fixed: "descriptive: recorded without a verdict" everywhere; kept among what the session decides only as "recorded without a verdict" |
| F3 | The inconclusive wall verdict was read as "row four is not refused… all of that holds", and row four's prediction as "met on the pooled reading" | misread a verdict — changed a verdict word | Fixed: with step 10 tripped, row four's condition on the wall clip is neither met nor failed, and its readings are given as numbers only |
| F4 | The explanation of the per-frame TRACK share's miss leaned on the inconclusive lock reading ("the video-time share above shows it is not one"), and the summary's "more lock by video time" read as a comparison between modes | overstates | Fixed: the per-frame fall (15 and 21 points) set against the video-time readings (+5.6, −1.5) as numbers; "more video time locked than the prediction's input assumed (45% against round 2's 39.1%)" |
| F5 | The latency transfer was set against the adoption rule's 5 points on the wall clip | overstates | Fixed: on the wall clip the transfer explains and does not bear on the inconclusive verdict; the table clip is not inconclusive, so it does not weigh in there either |
| F6 | The summary and the PR dropped the record's qualifier on the table clip's "supports" | overstates — changed a verdict word | Fixed: it would support an adoption, cannot carry the verdict, and with the wall verdict inconclusive has no adoption to support |
| F7 | Step 10's worker rule, read per block, was called "as registered"; and "the bound cannot resolve … with two runs a mode, or four" was the record's own gloss | wording | Fixed: the worker rule has no pooled form; the synchronous rule "read as registered on the pooled sixteen loops, still trips (5.88 > 5)" |
| F8 | ADR-0001's entry framed a conclusion about point 5 as an M3 finding, although M3's plan says it does not test point 5's number and its row six registered `trackStepMs` p50 | overstates — changed a verdict word ("stays met") | Fixed: the entry says the plan did not test point 5; the p95 is recorded as a measurement read from the exports, not a registered row's result; the session does not change the tracker-side condition as M2 found it. ADR-0001's decision is untouched |
| F9 | The jitter clause's replacement was overstated three ways: "would have refused whatever the worker did" and "fires almost surely" (it refuses whenever the worker's mean lands above, and a steadier worker passes); "costs nothing in detection power" (the static clip is saturated in TRACK share, not in `jitterPx`); "no data the verdict rests on existed" (the static runs existed, and the replacement turned row eight from refused to not refused). The summary and the PR did not say which way the change moved | overstates and understates | Decided by the project owner, accepted in full. Fixed in the record, in step 8's amended text (with a dated correction note; the 0.007 px bound unchanged), in the summary and in the PR: the defect stated as structural, with a rate as illustration only; the cost in power; both halves of what existed — the static runs, refused, and no run of a moving clip; and the direction of the change |
| F10 | "Each section is committed before the runs that follow it" was false for the record's first two sections: the record was first committed after the static block | process claim wrong | Fixed: started after the static block, before run 5, and from then on committed before each following run |
| F11 | The Results claimed the lock came "before anything about frame time", but the validity checks and the static clip carry the thermal rule's `acquire` and the null control's `total` before it | wording | Fixed: the exception is stated — validity first, as step 12 orders it |
| F12 | Minor: two lock figures, 45.1% and 45.0%, unlabelled; "the worker's matched them" where one synchronous run differed; "at the band's floor" for a value inside the band; row five's refusals per `trackLoss` not given; row six's frames before a loss not given; row seven's second clause not read; "the excess is the wait" asserted on the wall clip, where the medians do not add | wording, and understates | Fixed: both figures labelled (a time-weighted share over all frames, and the mean of four runs' readings); the synchronous runs' first steps given run by run; "within the band, at its floor"; the refusals per `trackLoss` tabled per block; the frames before a loss tabled (they cost no more in the worker runs than in the synchronous ones, at p50 or p95); row seven's second clause read — every consumed detection in every worker run was consumed by the first frame processed after its arrival — and not refused; the wall clip's excess left undecomposed |

## The second read, of the corrected passages

A second fresh agent, read-only, read only what the fixes changed
(`9093860..365bdf2`, and the PR body, rewritten in full), against the same
registration, and found fourteen problems — most introduced or left by the
first fix pass:

| | what it was | kind | what became of it |
|---|---|---|---|
| 1 | Row six's first wall block was called "met", but its held-lock losses were 2.3 points *better* than the synchronous runs', outside the predicted ±2 — introduced by F1's fix | misread a verdict | Fixed: not refused, and the prediction missed, in the worker's favour. A miss in the worker's favour is still a miss: the same rule, applied symmetrically, and the version of it most easily let slide |
| 2 | The old clause's "false-refusal rate of about one half" was stated as what the clause was. Before any data, under the null — no effect, two runs an arm, equal spread — it is about one in five: with D the difference of the arms' means and U the difference of the two synchronous runs, independent, P(D > \|U\|) = arctan(1/√2)/π ≈ 0.196. One in two holds only once the allowance has come out near zero | overstates | Decided by the project owner: the defect stated as structural — the allowance carries no information about dispersion, so the clause cannot tell a worse worker from one that landed higher by chance — with the rate demoted to an illustration: one in five before any data, about one in two given an allowance as small as this session's. A reader who disputes the rate cannot thereby dispute the replacement. Step 8's conditional text was already correct, and stays |
| 3 | "0.007 px would still refuse a regression the size of round 1's drift" overstated the power the replacement keeps | overstates | Decided by the project owner: the power kept, not the power claimed — a true regression of exactly 0.007 px sits on the bound and is refused about half the time; round 1's larger movement, 0.011 px, more often than not, by how much depending on the spread of the difference, which this session's four static runs can estimate and M4's calibration starts from |
| 4 | The record restated row four's refusal condition ("no reading put the worker more than 5 points below") one sentence after saying the readings are not put against row four — F3 in its third form | inconsistent | Fixed by stating the rule once, positively — with step 10 tripped, the wall readings are not put against row four at all, in either direction — and by no longer giving the numbers in a form that implies the comparison, the "above / below the synchronous range" labels included |
| 5 | Row six's open cause leaned toward clearing the worker | overstates | Fixed: no direct path, since no detection runs while a lock holds; indirect ones — which locks the worker sets, which frames the loop processes — not ruled out and not tested |
| 6 | What the session decides listed row six's refusal and not row seven's | understates | Fixed |
| 7 | The PR body's process sentence read as covering the whole session | fix incomplete (F10) | Fixed |
| 8 | A section written during the session had a second sentence rewritten after it without a marker | fix incomplete (F7) | Fixed: the correction note covers both changed sentences |
| 9 | This record said row five was removed from what the session decides; it was kept there, as "recorded without a verdict" | inconsistent | Fixed in F2's row |
| 10 | "Five of the twelve changed a verdict word", unnamed, and the PR's list did not match | inconsistent | Fixed: F1, F2, F3, F6 and F8, named above and marked in the table |
| 11 | The precedent said only step 10's spread rules are registered pooled; the latency transfer's inputs are too. And how a wall verdict reads after a pooled re-read that *passes* was never registered | inconsistent; a gap in the registration | Fixed: both named in the precedent, the second recorded as an unregistered case — moot here, for the next campaign's plan to decide before it runs |
| 12 | "Registered as precedent beside the asymmetry rule": no rule in the plan bears that name, and the precedent was recorded after the session | wording | Fixed: located by the row-five paragraph |
| 13 | Step 8's correction note covered one of its two post-session changes | wording | Fixed |
| 14 | Smaller wording: "Row seven, explained" for a row the record does not fully explain; "missed its prediction by more than 25%"; "the excess is the result waiting" in the summary and the PR; "not decisive" missing beside the per-frame miss; "the pooled reading still trips" in the PR; "row six's `trackStepMs` p50 is unchanged" for a row refused in one block | wording | Fixed |

## The third read, and its stopping rule

Set by the project owner before the third read ran. It reads only the
passages the second fix pass touched. **If it finds no verdict-word
problem, the correction stops**: any residual wording items are listed here
as known imperfections, named as such, and the PR merges — a record that
admits a few awkward sentences is worth more than a fourth rewrite that
introduces new ones. **If it finds another verdict-word problem, patching
stops**: the results section has then been edited past the point where
editing helps, and it is rewritten from the registered table — each row's
registration read, and what the data say written against it — rather than
repaired. The reads converge so far: five verdict-word problems in the
first, one in the second.

**The outcome: no verdict-word problem, so the correction stopped.** A
third fresh agent, read-only, read only what the second fix pass changed
(`365bdf2..ddbfe1c`, and the PR passages it rewrote), recomputed row six
from the exports because its verdict words depend on the numbers, and found
every verdict word in those passages consistent with the registration and
the data. It found ten other problems. As the rule says, they are not
patched: they are listed here as **known imperfections of this write-up**,
each with what the text should say, and the text stands as committed at
`ddbfe1c`. A reader should take the statement given here over the one in
the text.

1. **Row six's indirect-path example is selective** (the record, "Row six,
   the second block's refusal"). It cites only the second block's longer
   video after a worker TRACK frame before a loss (76.3 against 72.0 ms).
   That gap is longer in the worker runs in every block — 78.2 against
   76.9, 76.3 against 72.0, 75.8 against 71.0 — while the losses went the
   worker's way in the first block and were level on the table clip, so it
   does not by itself account for the refusal.
2. **The per-frame TRACK share's miss is said to carry "no verdict"** (the
   record, the summary, the PR). The registration's words are "not
   decisive … a miss asks for an explanation, and does not refuse the
   adoption"; "no verdict" is row five's vocabulary, not this prediction's.
3. **The record's Results introduction says the registration pools only
   step 10's spread rules.** It also pools the latency transfer's inputs,
   as the precedent and the record's own transfer section say.
4. **What the session decides omits row six's first-block miss.** In the
   first block held-lock losses went 2.3 points the worker's way, outside
   the predicted ±2: a miss in the worker's favour, not a refusal. Every
   other place says so; that sentence leaves it out.
5. **The PR's F1 item names only the hidden refusal.** Pooling also made
   row seven's first block a refusal (+26.1% pooled, against +20.7% for the
   block); the precedent's sentence on F1 has the same gap.
6. **The PR quotes "would still refuse"**, a phrase from an earlier version
   of the PR that the current body no longer contains: it means the earlier
   claim that 0.007 px would still refuse a regression the size of round
   1's drift.
7. **"Had the excess been anywhere near 0.007 px, none of this reasoning
   would have rescued it"** (the record) overstates the bound: an excess
   just under 0.007 px passes. It should read "had the excess exceeded
   0.007 px".
8. **This record's F9 row says the clause "refuses whenever the worker's
   mean lands above"** without its condition: that holds only with an
   allowance as small as this session's, as the second read's finding 2
   established.
9. **"+5.6 points (the verdict, above)"** in the record's row-four cells
   can be read as "+5.6 points is the verdict". It means: see the section
   on the verdict, above, where the wall reading is inconclusive.
10. **The PR's ADR-0001 line says patch alignment is still the step to move
   "so"** — because — the p95 is over 8 ms. The ADR's reason is that no
   step has moved into the backend and alignment is the step M2
   identified.

**What the three reads cost**, written down because it is the evidence for
the step: twelve findings in the first read (five changed verdict words),
fourteen in the second (one), ten in the third (none). Each fix pass made
most of the next read's findings; the verdict-word problems fell from five
to one to none, and the wording problems did not, which is why the rule
stops on the first and lists the second.

## The process claims, checked

The record says its sections from run 5 on were committed and pushed before
the runs that follow them; the audit checked each against the commit, the
local reflog's push, and the next run's own `run.startedAtIso`:

| commit | committed | pushed | next run starts |
|---|---|---|---|
| `c884805`, the jitter clause replaced | 07:52:31 | 07:52:35 | run 5, 07:54:59 |
| `5367e5a`, the wall block's spread rule trips | 08:08:54 | 08:08:59 | the wall block again, 08:11:12 |
| `d26d99f`, the wall verdict inconclusive | 08:22:40 | 08:22:44 | the table block, 08:24:29 |

## For the next campaign's plan

**Name the independent read of the write-up as a step**, after the session's
results are written and before the PR: an agent that wrote none of it reads
the write-up against the registration — the claims, row by row and verdict
by verdict, not the numbers — and its findings and what became of each are
committed as a record beside the session's. Then a fresh read of the
changed passages only, since a rewrite of verdict words can introduce its
own overstatements, under a stopping rule registered with the plan rather
than set at the end: stop when a read finds no verdict-word problem, and
rewrite the results from the registered table, rather than patch them, if a
read after the first still finds one. Here the read was asked for at the
end, after the author had already checked the write-up twice, and it still
found five verdict words to change; the second read found fourteen more
problems, one of them in a verdict word, most of them made by the first fix
pass.
