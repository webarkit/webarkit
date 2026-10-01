# 2026-10-01 — M3's write-up, audited independently

After the device session, its write-up was read by an agent that had not
written it, against the registration, before the PR merged. This is that
audit's record: what it read, what it found, and what became of each
finding. It found twelve problems in a write-up that had already been
checked twice — its figures against the reading script's output, which
caught two slips, and its author's own reread — and five of the twelve
changed a verdict word. That is the evidence that the independent read
belongs in a campaign's plan, not in what someone remembers at the end
(below).

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
| F1 | Every wall-clip row was read on both blocks pooled, although the registration reads each row on a bracketed pair and pools only step 10's spread rules. Read per block, row six's held-lock losses are **refused** in the second block (8.8% against 6.6%, +2.2 points over a bound of 2) and row seven is **not refused** in the first (+20.7%); pooled, they had been published as "met" and "refused". The record also said each block was "given beside" the pooled reading, and gave only row four's | overstates — changed verdict words | Fixed in all four documents: each wall row read per block, pooled figures moved to a table labelled as an unregistered summary that carries no verdict. Row six's refusal is recorded with the explanation the data allow — the difference reverses between the blocks, and its cause is open. Registered as precedent beside the asymmetry rule in the plan: pooling across brackets is not a registered reading |
| F2 | Row five, descriptive on the device, was written "met" and folded into "rows five and six hold", and "first-step confirmation" appeared among what the session decides | misread a verdict | Fixed: "descriptive: recorded without a verdict" everywhere; removed from what the session decides |
| F3 | The inconclusive wall verdict was read as "row four is not refused… all of that holds", and row four's prediction as "met on the pooled reading" | misread a verdict | Fixed: with step 10 tripped, row four's condition on the wall clip is neither met nor failed, and its readings are given as numbers only |
| F4 | The explanation of the per-frame TRACK share's miss leaned on the inconclusive lock reading ("the video-time share above shows it is not one"), and the summary's "more lock by video time" read as a comparison between modes | overstates | Fixed: the per-frame fall (15 and 21 points) set against the video-time readings (+5.6, −1.5) as numbers; "more video time locked than the prediction's input assumed (45% against round 2's 39.1%)" |
| F5 | The latency transfer was set against the adoption rule's 5 points on the wall clip | overstates | Fixed: on the wall clip the transfer explains and does not bear on the inconclusive verdict; the table clip is not inconclusive, so it does not weigh in there either |
| F6 | The summary and the PR dropped the record's qualifier on the table clip's "supports" | overstates | Fixed: it would support an adoption, cannot carry the verdict, and with the wall verdict inconclusive has no adoption to support |
| F7 | Step 10's worker rule, read per block, was called "as registered"; and "the bound cannot resolve … with two runs a mode, or four" was the record's own gloss | wording | Fixed: the worker rule has no pooled form; the synchronous rule "read as registered on the pooled sixteen loops, still trips (5.88 > 5)" |
| F8 | ADR-0001's entry framed a conclusion about point 5 as an M3 finding, although M3's plan says it does not test point 5's number and its row six registered `trackStepMs` p50 | overstates | Fixed: the entry says the plan did not test point 5; the p95 is recorded as a measurement read from the exports, not a registered row's result; the session does not change the tracker-side condition as M2 found it. ADR-0001's decision is untouched |
| F9 | The jitter clause's replacement was overstated three ways: "would have refused whatever the worker did" and "fires almost surely" (under the null it refuses about half the time, and a steadier worker passes); "costs nothing in detection power" (the static clip is saturated in TRACK share, not in `jitterPx`); "no data the verdict rests on existed" (the static runs existed, and the replacement turned row eight from refused to not refused). The summary and the PR did not say which way the change moved | overstates and understates | Decided by the project owner, accepted in full. Fixed in the record, in step 8's amended text (with a dated correction note; the 0.007 px bound unchanged), in the summary and in the PR: a false-refusal rate of about one half, which is what the clause was; the cost in power, bounded by the replacement still refusing a regression the size of round 1's drift; both halves of what existed — the static runs, refused, and no run of a moving clip; and the direction of the change |
| F10 | "Each section is committed before the runs that follow it" was false for the record's first two sections: the record was first committed after the static block | process claim wrong | Fixed: started after the static block, before run 5, and from then on committed before each following run |
| F11 | The Results claimed the lock came "before anything about frame time", but the validity checks and the static clip carry the thermal rule's `acquire` and the null control's `total` before it | wording | Fixed: the exception is stated — validity first, as step 12 orders it |
| F12 | Minor: two lock figures, 45.1% and 45.0%, unlabelled; "the worker's matched them" where one synchronous run differed; "at the band's floor" for a value inside the band; row five's refusals per `trackLoss` not given; row six's frames before a loss not given; row seven's second clause not read; "the excess is the wait" asserted on the wall clip, where the medians do not add | wording, and understates | Fixed: both figures labelled (a time-weighted share over all frames, and the mean of four runs' readings); the synchronous runs' first steps given run by run; "within the band, at its floor"; the refusals per `trackLoss` tabled per block; the frames before a loss tabled (they cost no more in the worker runs than in the synchronous ones, at p50 or p95); row seven's second clause read — every consumed detection in every worker run was consumed by the first frame processed after its arrival — and not refused; the wall clip's excess left undecomposed |

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
committed as a record beside the session's. Then a second fresh read of the
changed passages only, since a rewrite of verdict words can introduce its
own overstatements. Here the read was asked for at the end, after the
author had already checked the write-up twice, and it still found five
verdict words to change.
