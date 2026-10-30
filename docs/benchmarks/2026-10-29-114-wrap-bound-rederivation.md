# #114: the loop-wrap bound, re-derived from M4's recorded figures (2026-10-29)

**A re-derivation under [#114](https://github.com/webarkit/webarkit/issues/114)'s
"Criterion for revisiting it", made on 2026-10-29 in the first window after
M4's campaign, which closed under its condition 2 on 2026-10-23
([#167](https://github.com/webarkit/webarkit/pull/167)). It is a read of nine
committed exports: no device run, no bench-page run, no replay. The rule gives
0.5 s, the value `WRAP_BOUND_S` already has, so no value changes. What changes is
that the bound is now re-derived, not kept by choice, and that a test pins it.
#114 stays open.**

- **Base:** `origin/dev` at `12461e7ee105555be922e23f4868ee5417985921`, the
  merge commit of [#194](https://github.com/webarkit/webarkit/pull/194), after
  `git fetch origin`. The work was done in a separate worktree; the main
  checkout was not switched.
- **The computation** is
  [`2026-10-29-114-wrap-bound-rederivation.mjs`](./2026-10-29-114-wrap-bound-rederivation.mjs).
  It reads the nine exports and hashes them (fatal), and writes nothing. It
  imports no repository code, so it reproduces on any later tree. Its output is
  not committed; run it to reproduce every number here.

## The criterion

From #114, "Criterion for revisiting it", as corrected on 2026-10-13
(["The criterion's correction"](https://github.com/webarkit/webarkit/issues/114)),
a bullet and its first sub-bullet joined here:

> **Re-deriving the bound is deferred to the first window after the campaign.**
> Its input is the campaign's own recorded figures, and its rule is the same:
> the largest gap, doubled, rounded up to the next 0.1 s.

and what it reads (its list joined into one sentence here):

> three figures, on the campaign device, Tab_9_WiFi, over the counted loops
> only: the largest gap within a loop; the largest gap across a wrap; the
> largest media time after a wrap. The warm-up loop is recorded beside them,
> and gates nothing.

On the test, from the same section: "Pinning it in a test belongs with its
re-derivation, after the campaign."

No campaign is open, so `examples/js/bench-loops.mjs` is not frozen. Since
[#178](https://github.com/webarkit/webarkit/pull/178) the bound lives there,
not in `bench-metrics.mjs` as #114 says.

## The input, and what it does not cover

**The input is the campaign's nine committed Tab_9_WiFi exports,** and no other
export in `docs/benchmarks/` is dated on or after the campaign's opening:

- the pre-flight run, `2026-10-13-tab9-m4-preflight-sync-wall.json`;
- round 0's calibration block,
  `2026-10-14-tab9-m4-calibration-{sync,worker}-static-{1..4}.json` (`e9396df`).

Each records `deviceLabel` Tab_9_WiFi, `loops` `{ firstLoop: 1, loopCount: 4 }`,
five wraps, a frame of loop 5, and its `clipDurationS`. The script checks each
of these (fatal).

**Their provenance: all nine ran M3's pipeline.**

| export | `provenance.manifest.head` | `clean` | clip | detection path |
| --- | --- | --- | --- | --- |
| pre-flight, sync, wall | `37dc6d4` | true | `pinball-bench.mp4` | sync |
| calibration, sync, static 1–4 | `37dc6d4` | true | `pinball-static.mp4` | sync |
| calibration, worker, static 1–4 | `37dc6d4` | true | `pinball-static.mp4` | worker |

- `37dc6d4` is the merge commit of #113 (2026-10-13). Neither of M4's steps that
  landed is its ancestor: #134 (IPPE, #105, merge `e9147a7`) and #161 (the
  conditioning signal, #104, merge `1baa75a`) both came later
  (`git merge-base --is-ancestor`). The One Euro filter (#106) has not landed on
  `dev`.
- The exports' `tracker.options` carry no pose-method or conditioning field.
- So this re-derivation is on M3's per-frame cost again, not on M4's. "Why the
  campaign may need to retune it" named M4's added per-frame cost as the reason
  to revisit the bound. The campaign closed before any of M4's steps ran on the
  device, so that reason is not answered here.

**Round 0's record and this re-derivation read the same exports differently.**
Round 0's record (`2026-10-14-tab9-m4-calibration-session.md`, the bullet
"#114's figures") did not read the per-round figures: "Round 0 has no counted
run, so the figures are not read here". That was the per-round reading, made
"before the first counted run of each round". This re-derivation reads the
counted *loops* 1–4 of those same calibration exports, as the criterion says
for the re-derivation's input.

**What passes to the next campaign, not done here:** the per-round reading,
"before the first counted run of each round, against that round's pipeline",
and the registration of its figures with their headroom in that campaign's plan
(#114's comment of 2026-10-23).

## The figures, the rule and the result

Over counted loops 1–4. A gap across a wrap is the export's own `clipDurationS`
minus the frame before, plus the frame after. In brackets, frame periods of the
run's clip: slots of its frame rate, not decoded frames (see "The headroom, in
frames"). Two static gaps within a loop cross an empty slot, so their 4 periods
are 3 decoded-frame steps: static 1's 11.233333 → 11.366667 s and worker static
4's 11.3 → 11.433333 s.

| export | within a loop | across a wrap | after a wrap | within, warm-up included |
| --- | --- | --- | --- | --- |
| pre-flight, sync, wall | **200.7 ms (5)** | **120.4 ms (3)** | 0.0 ms (0) | 240.8 ms (6) |
| calibration, sync, static 1 | 133.3 ms (4) | 33.3 ms (1) | 0.0 ms (0) | 366.7 ms (11) |
| calibration, sync, static 2 | 100.0 ms (3) | 33.3 ms (1) | 0.0 ms (0) | 233.3 ms (7) |
| calibration, sync, static 3 | 100.0 ms (3) | 33.3 ms (1) | 0.0 ms (0) | 200.0 ms (6) |
| calibration, sync, static 4 | 100.0 ms (3) | 33.3 ms (1) | 0.0 ms (0) | 200.0 ms (6) |
| calibration, worker, static 1 | 100.0 ms (3) | 33.3 ms (1) | 0.0 ms (0) | 133.3 ms (4) |
| calibration, worker, static 2 | 133.3 ms (4) | 33.3 ms (1) | 0.0 ms (0) | 166.7 ms (5) |
| calibration, worker, static 3 | 100.0 ms (3) | 33.3 ms (1) | 0.0 ms (0) | 133.3 ms (4) |
| calibration, worker, static 4 | 133.3 ms (4) | 33.3 ms (1) | 0.0 ms (0) | 133.3 ms (4) |

- The largest within a loop is 0.200669 s, the pre-flight run's: frame 477,
  loop 3, 9.551839 s → 9.752508 s, as #114's comment of 2026-10-13 records.
- The largest across a wrap is 0.120401 s, the same run's. The largest after a
  wrap is 0 s: every wrap in all nine lands on media time 0.
- **The rule:** the largest of the three, 0.200669 s, doubled, 0.401338 s,
  rounded up to the next 0.1 s: **0.5 s**. The rule's text is "the largest
  gap"; taking the largest of all three figures, the media time after a wrap
  among them, is this record's reading of the criterion's list. That figure is
  0 here, so the result is the same either way.
- **The result: the bound stays 0.5 s, now re-derived rather than kept by
  choice,** on the campaign device, from the campaign's figures.

**The warm-up loop, recorded and not read.** Static 1's warm-up has the largest
gap of any loop, 366.7 ms (11 frame periods), in the run's first frames: frame
2, 0.466667 → 0.833333 s, after frame 1 at 0.466667 s, from frame 0 at 0.2 s. By the same rule it would give 0.8 s. It is not
read, because the criterion, as corrected on 2026-10-13, reads the counted loops
only, and the warm-up loop gates nothing.

## Two readings for Tab_9_WiFi

| reading | input | rule's result |
| --- | --- | --- |
| #114, "The bound's status" | the pre-campaign corpus, the skip across a wrap alone: 0.166667 s | 0.4 s |
| the criterion, this record | the campaign's exports, the largest of three figures: 0.200669 s, within a loop | **0.5 s** |

- **The criterion prescribes the second.** It reads three figures and takes the
  largest, and here the largest is within a loop, not across a wrap.
- Read like "The bound's status", on the skip across a wrap alone, this input
  gives 0.120401 s, and so 0.3 s. That is beside the record, not prescribed.
- **The corpus figure stays as #114 records it.** The Oppo A72's 0.266666 s,
  which gives 0.6 s, is outside the criterion's scope: the criterion reads the
  campaign device only.

## The headroom, in frames

Gaps come in whole frames: every gap and skip in the nine exports is a whole
number of frames to within 2 µs (checked, fatal).

**The wall clip, `pinball-bench.mp4`:** 298 frames of 40.134 ms in 11.959866 s.
It is clean: 12 frames are 0.481605 s and admitted across a wrap; 13 are
0.521739 s and refused. Measured: 3 frames across a wrap (120.4 ms), so 9 frames
of headroom, as #114's comment of 2026-10-13 records.

**The static clip, `pinball-static.mp4`:** 365 frame periods at 30 fps in
12.166667 s, and 363 decoded frames: `ffprobe -count_frames` gives 363, and the
slots k = 161 (5.366667 s) and k = 340 (11.333333 s) hold no frame. Every one
of the 363 media times the eight static exports record is k/30 s rounded to the
microsecond (checked, fatal), so they are the clip's every frame; the empty
slots are the two the exports never record. The last frame is k = 364, at
12.133333 s. Below, "n frames" across a wrap means n frame periods.

- **0.5 s always admits 14 frames.** The largest 14-frame skip across a wrap is
  0.466667 s.
- **15 frames are admitted or refused by rounding.** A 15-frame skip is exactly
  0.5 s, but on media times rounded to the µs it reads 0.5 s on 10 of its 15
  landings, admitted, and 0.500001 s on 5, refused. For example, frame 352 at
  11.733333 s → frame 2 at 0.066667 s skips 12.166667 − 11.733333 + 0.066667 =
  0.500001 s. The script prints all 15. Every landing is on two frames the
  exports record (checked, fatal): k = 350 to 364 before, j = 0 to 14 after.
  - *Corrected before commit: the maintainer's ruling of 2026-10-29 gave 11 of
    16 at 0.5 s and 5 of 16 at 0.500001 s. The count was the agent's, given in
    its brief check: it included a 16th landing from frame 365, which does not
    exist, since the clip's last frame is 364. The independent review found
  that the brief check had also called the clip's 365 frame periods 365
  frames; it has 363. The five refused landings, and
    the ruling, stand.*
- Measured: 1 frame across a wrap (33.3 ms), so at least 13 frames of headroom.

**Why it does not change the result.** The rule's input is 200.7 ms. The largest
observed skip across a wrap on the static clip is 33.3 ms, 1 frame. And 14
frames, which the bound always admits, already exceed the rule's doubled figure,
401.4 ms.

**Recorded as an open point, not decided here:** whether a wrap's "at most"
should tolerate the µs rounding of media times. A change to `TIME_EPS_S` would
also reach `bench-locks.mjs`, which reads the same constant. No issue is opened
from here; the maintainer will open one.

## The no-duration fallback: not revisited

#114 revisits it if either of two things happens. Neither has:

- **A bench clip shorter than about 1 s.** None: ffprobe gives
  `pinball-bench-table.mp4` 8.900000 s, `pinball-bench.mp4` 11.959866 s and
  `pinball-static.mp4` 12.166667 s, the three clips in `examples/videos/`.
- **The live summary given the run's duration.** It is not:
  `examples/bench-nft.html:812`, in `renderSummary`, still calls
  `summarizeRun(history)` without it. The export's call (`:1603`) is given the
  counted loops.

## The test, and the mutants it kills

`examples/test/bench-metrics.test.mjs`, "refuses 10 µs over the 0.5 s bound,
into the clip and across the wrap", beside "draws each bound at 0.5 s, inclusive
where the rule says at most":

- **into the clip:** 0.5 s after a wrap is accepted, and 0.50001 s refused;
- **across the wrap, with the duration:** 11.5 → 0 on a 12 s clip skips exactly
  0.5 s and is accepted. 11.5 → 0.00001 skips 0.5 + 0.00001, which rounds to the
  same double as 0.50001, and is refused. 11.5 and 12 are exact in binary.
- **without the duration:** the existing pair (a step back of exactly 0.5 s
  refused) stays as it was.

**Why 10 µs and not 1 µs.** The brief proposed 0.500001 s. The maintainer ruled
it out: on µs-rounded media times a 15-frame skip on the static clip reads
0.500001 s on 5 of its 15 landings, so a real restart can produce it, and a test
must not pin the refusal of a value a real restart can produce. No landing of
14, 15 or 16 frames produces 0.50001 s (the script checks it).

**What it cannot tell.** It catches an epsilon of 10 µs or more. It cannot tell
an epsilon of 1e-9 from one of 1e-7: on media times to the µs, no input can.
`bench-stall.test.mjs`, "disagree" case (3), already pins the epsilon from
below, at 5e-10 or more, with inputs finer than the data's.

**The mutants**, #120's B.2 (listed in #120's body, item 2, at `:415` and `:533`
of `bench-metrics.mjs` before #178's split; deferred to #114 in
[#120's comment of 2026-10-27](https://github.com/webarkit/webarkit/issues/120#issuecomment-6454224932)),
reapplied to `examples/js/bench-loops.mjs`, one at a time:

| mutant | edit | at `dev` | at the tip |
| --- | --- | --- | --- |
| W14 | `WRAP_BOUND_S` 0.5 → 0.549 | survives, 509 of 509 pass | **killed**: the new test fails, 509 of 510 pass |
| W9 | `TIME_EPS_S` 1e-9 → 1e-3 | survives, 509 of 509 pass | **killed**: the new test fails, 509 of 510 pass |
| W18 | `TIME_EPS_S` 1e-9 → 4e-3 | survives, 509 of 509 pass | **killed**: the new test fails, 509 of 510 pass |
| control | `WRAP_BOUND_S` → 0.55 | killed | killed, 2 tests |
| control | `TIME_EPS_S` → 1e-2 | killed, 3 tests | killed, 4 tests |

- **Run with `examples/test/provenance.test.mjs` excluded,** as the maintainer
  ruled. That file fails on any edit to a served file, whatever the edit: its
  "hashes the files on disk" test compares the built manifest's hashes with the
  files on disk. With it included, all three mutants "fail" at `dev` too, for
  that reason alone. The full suite, `provenance.test.mjs` included, is green at
  `dev` and at the tip, with a fresh build.
- `git diff` was empty after restoring each mutant.

**`bench-locks.mjs`'s uses of `TIME_EPS_S` are reached by no test at any
resolution.** It reads the constant at two places in `trackTimeShare`
(`bench-locks.mjs:124`, `:135`). With both replaced by 0, 1e-7, 1e-6, 1e-5 or
1e-3, all 509 tests still pass (provenance excluded). Adding such a test is out
of scope here.

## Commands and hashes

```bash
node docs/benchmarks/2026-10-29-114-wrap-bound-rederivation.mjs
```

On node v24.21.0, run twice: both stdouts were 4,703 bytes, SHA-256
`c75551702b1a59f52b08ac3c5365508d4130863249dc164e0eecf795848d658d`. The script
is 13,693 bytes, SHA-256
`3218137dbaa95b036e6259f4bcfad75dc899fc45d3040be11dfd54fa40495938`. Its fatal
checks were exercised on copies outside the repository: the script alone, with
no exports beside it, exits 1 with "no such file beside this script"; one export
with a byte appended exits 1 naming the export and both hashes.

## Independent: a reviewer's read

Before the PR, a fresh agent with no stake in the result checked the diff:
every figure with its own script, which uses neither the record's code nor the
repository's; every citation against #114, #120, #167 and #178; the provenance;
the code claims; the test's float claims, traced through `isLoopWrap`; and the
commit messages for closing keywords. It found no figure, citation or claim that
does not hold. It found one fact wrong: the static clip has 365 frame periods
and 363 decoded frames, not 365 frames. It also found four wording points: "no
code changes", where the change is to no value; the warm-up gap's frame
numbers; a joined quote not marked as joined; and "the largest of the three"
unstated as a reading. All five are applied above, and in the script, whose
hashes above are the final ones. A sixth, that `bench-loops.mjs`'s comment
said the epsilon is pinned without saying how far, is applied there.
