# 2026-09-30 — M3's evidence guards, checked independently

The bench page and the replay carry guards whose job is to stop an invalid
measurement being published as valid. The [M3 device session](./README.md#the-sessions-runbook)
rests on them, so each was checked by an agent that did not write it: every
failure reproduced before its fix and after it, in desktop Chrome for the
page and in Node for the replay, and the transfer refusal mutation-tested.
The checkers' own reports stay outside the repository; this is their record.

## The guards

- **A throw while a frame is processed ends the run, and a failed run is
  never exported as valid.** First `93f5465` (a throw from the tracker's
  `process` fails a worker run); since `2a5ef29`, a throw anywhere in the
  frame callback, in both paths; since `417b154`, the export of a failed
  run says so (`run.endedBy`, `run.failure`), and the session protocol
  flags it.
- **A worker that fails after `ready` refuses Start with its own cause**
  (`cc73220`), rather than a run started on a dead worker.
- **`scripts/replay-clips.mjs --transfer` refuses a worker export whose
  detection accounting does not hold** (`807bbdc`), and any export that is
  not a session run (`51ba54e`, `0aee29c`).
- **A refused Download leaves the run's status as it ended** (`dedd917`).

## The first check, at `c0c4265`

Run on 2026-09-30, on the code of `807bbdc` (the commits between were
documentation only). All three of `93f5465`, `cc73220` and `807bbdc`
passed: each failure reproduced on the parent page or code and gone at
the check's head, and removing `transferPlan`'s accounting refusal failed
six tests, each for the right reason. It found one gap the guards did not
cover — a throw later in a worker run's frame than the three guarded calls
still ended the loop silently, and that run still exported with its
accounting balanced — which `2a5ef29` then closed, and three minor points,
now in [#95](https://github.com/webarkit/webarkit/issues/95).

It does not cover what the session runs. Thirteen later commits,
`b7b866a` to `417b154`, changed the guarded code: the frame callback's
failure path, Download's refusals, `transferPlan`'s refusals and the
session protocol, `failRun`. Their review read the code and ran its tests;
none exercised the page in a browser independently. So the check was run
again.

## The second check, at `c261b77`

Run on 2026-09-30, 23:14–23:45, by a fresh agent, on the head the device
session will run. Headless Chrome 153.0.8010.54; parent pages served
through a route that returns `git show <sha>:<path>`, so nothing was
written into the worktree; the worker bundle under test checked by its
SHA-256 against a fresh build of the head's source and against the export's
own `workerBundleSha256`. Every item passed, and no defect was found.

| item | before the fix | at `c261b77` |
|---|---|---|
| a throw from `process` in a worker run | on `6ec25e8`: the loop died silently, and after Stop, Download saved a file whose accounting balanced | `failed`, "The worker path failed on frame 44: …", Download refused ("Not exported: …"), nothing saved, the status still `failed` after the refusal |
| a throw later in the frame (the overlay drawing), worker run | on `93f5465`: silent, and exported | `failed` and refused |
| the same throw in a synchronous run | — | `failed`; the export, which a synchronous run may save, carries `run.endedBy: "failed"`, `run.failure`, and `protocol.sessionRun: false` with a gap naming how it ended |
| a worker failing after `ready`, while Start starts its source | on `93f5465`: the run started anyway, and either timed out 5 s later with a message that hid the cause, or was exported | Start refused at once with the worker's own cause: no frame processed, no job, nothing saved |
| the runbook's own URLs, table clip, `run=1` synchronous and `run=2` worker | — | both ended `done` on their own (44.9 and 45.0 s); `protocol.sessionRun: true` with no gaps, `run.endedBy: "done"`, `summaryMsFrames: "counted loops"`, `detectionUseFallbackFrames` 0; the worker run's accounting 278 = 147 + 130 + 1 with none ignored, and no TRACK frame with a detection in flight; every check of the runbook's step 7 that does not need the tablet passes |
| `--transfer`'s refusals | — | the two focused test files pass, 241 of 241; removing the accounting refusal fails 7 tests and removing the session-run refusal fails 3, each for the right reason (both restored, the worktree clean); the two real exports above get past every refusal, and six edited copies of the worker export — accounting unbalanced, `ignored` 1, accounting absent, `protocol` absent, and `sessionRun` false with and without a gap — are each refused, exit 1, one line naming the file |
| the synchronous path | — | the synchronous run above exports as a valid session run |

Three further checks passed: a throw at the run's own end, which on
`e147068` still exported as a valid session run, fails the run at
`c261b77`; a worker failing in the middle of a run fails it and refuses its
Download; and the runbook's stateless run is a valid session run.

**One observation, not a defect.** On the checking machine, with a
GPU-heavy application running, one run's video stalled and the page stayed
at `tracking` with no error until the checker's three-minute limit: the
page does not notice a stalled source. On the tablet that is caught by the
runbook's step 6, under which a run with no `done` within three minutes is
invalid.

## What the device session requires of it

The check covers `c261b77`. Before the session,
`git diff --stat c261b77 HEAD -- examples/bench-nft.html examples/js scripts packages`
shows nothing — the code the session runs is the code checked — or the
check runs again on the new head, by an agent that did not write the
change, before any device run.
