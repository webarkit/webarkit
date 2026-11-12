# #243, M9's registration: second addendum, of 2026-11-12 — the session driver, the link monitor's begin fix and `test:benchmarks` (#252)

**An addendum to [`2026-11-10-243-registration.md`](./2026-11-10-243-registration.md), "the
registration" below, whose criteria are cited by `8ec7b0c51a6406f3abfec1fa83d9a39c7c71c3ff`, and to its
[first addendum](./2026-11-11-243-registration-addendum.md). Neither is edited, nor is
[the pre-flight's record](./2026-11-11-243-preflight.md). This file changes no criterion, no
prediction, no validity rule or its verdict, no outcome rule, no stopping rule and no pinned string.
It is written after the pre-flight and before round 1. The registration lets the plan change only
before the pre-flight ("After this record's merge, the plan changes only by a dated addendum to it,
and only before the pre-flight"); nothing below is the plan. It records how the runbook's steps are
carried out from round 1 on, and the one change to a file the freeze holds. The maintainer admitted
both on 2026-11-12, as #252 proposed: "Before M9's counted rounds, if the maintainer rules that it
can enter as a registration addendum before round 1." This file is committed alone, and its pull
request merges with a merge commit, so that it can be cited by hash.**

## 1. The session driver is admitted into the rounds' runbook

**Why.** The pre-flight ran its commands as shell blocks pasted into Git Bash, and pasting caused its
three incidents (the record, "Incidents"): a setup block whose braces were lost, so that two lines ran
with an empty run name; a paste of old terminal output that ran a `mv` over a failed attempt's link
log; and run 4 recorded under run 5's name. Its fix that evening was `preflight.sh`, a script outside
the repository (version 2, SHA-256 `38918931224959064a6fa3ca54ba12204ad65dca2a2d3aea30173cdc9dd73fd4`,
never committed). **M9's counted rounds run only through the committed driver.**

**What.** Three files, all in `docs/benchmarks/`:

- [`2026-11-12-243-session.sh`](./2026-11-12-243-session.sh), the driver, ported from
  `preflight.sh`'s second version, sourced once in Git Bash:
  `source docs/benchmarks/2026-11-12-243-session.sh <output folder> <serving checkout>`. Its commands
  are `pronto`, `inizia <n>`, `finisci <n>`, `riapri <n>`, `chiudi-tab` and `stato`, each driven by run
  number only;
- [`2026-11-12-243-session-table.json`](./2026-11-12-243-session-table.json), the session table, from
  which the driver reads every run's clip, export name, run-check form, export kind and URL (entry 4);
- their tests, `2026-11-12-243-session.test.mjs` (a fake `adb` and a fake DevTools endpoint, every
  refusal both ways, the pre-flight's three incidents replayed) and
  `2026-11-12-243-session-table.test.mjs`.

**Where, and why not `scripts/`.** The freeze holds the instrument, `examples/bench-nft.html`,
`examples/js` and `scripts` (the registration, "The pre-flight (step 5)", "The freeze"). The driver is
not the instrument: it runs on the serving machine, never on the page, and the page and the bundle are
the same bytes with it as without it. It goes beside the campaign's other scripts, under
`docs/benchmarks/`, and touches no file the freeze holds. The serving checkout stays the worktree
detached at the freeze's head, `8192265bd462f0667e275ec9297fe2890a907935`, never committed into, and the
bundle stays `6d07b0c25475830458b68c6ef53c221fd4a3848c00bad1a62adbafcc95b074f2`. The driver is sourced
from another checkout, the one holding this addendum, and runs the link monitor from there, as the
pre-flight ran it from its committing worktree (the record, "Differences from the runbook", item 3).
The run check it runs is the serving checkout's, at the freeze's head.

**The runbook, step by step.** Each step of "Before each session" and "Each run, in order" is now
carried out by a driver command. The runbook's text keeps its meaning: the same commands, the same
pathspec, the same order, the same files.

| The runbook's step | Carried out by |
|---|---|
| Before each session, 1: the build check of "The serving machine" (first time on a machine), then `check:provenance`, exit 0 | `pronto` reads the serving checkout's bundle hash against the table's and runs `check:provenance` there (`node scripts/provenance-preflight.mjs`). The build itself, once per serving machine, stays the agent's, before the session: the driver builds nothing. |
| Before each session, 2: `git rev-parse HEAD` is the freeze's head, and the pathspec's `git status --porcelain --untracked-files=all` prints nothing | `pronto`, with the runbook's command and pathspec, against the table's head |
| Before each session, 3: `curl -sI …/examples/js/bench-metrics.mjs` reads `no-store` | `pronto`, the same command |
| Before each session, 4: Chrome's cached files cleared; no `bench-nft-*.json` in the download folder; the full build from `chrome://version` | The cache stays the operator's, at the tablet: `pronto` prints it as a step by hand, since it cannot see it. The download folder: `pronto` (`adb shell ls /sdcard/Download/`). The build: `pronto` reads it through Chrome's DevTools endpoint (`/json/version`, its `Browser` field, which gives the version number `chrome://version` shows, such as `Chrome/156.0.8078.81`, without its "(Official Build) (64bit)"), or, when that cannot be reached, the package manager's `versionName`, and says which source it used. |
| Before each session, 5: no `connection terminated` line naming the device in adb's log for five minutes | `pronto`, from `adb.log`, printing the minutes still to wait; `inizia` checks it again for the session's first run |
| Each run, 1: `reverse --list` shows `tcp:8093 tcp:8093`, or the run does not start | `inizia <n>` |
| Each run, 2: the link monitor begins; the clip's SHA-256 into `<export>.clip.txt` | `inizia <n>`, with the first addendum's command, entry 2 |
| Each run, 3: the URL opened with one command, never typed, and written to `<export>.url.txt` | `inizia <n>`, with the runbook's `am start` command and the table's URL |
| Each run, 4: at the tablet: the label, Start, `done`, Download JSON; a refused Start's remedy and the URL opened again | The operator, at the tablet. The URL opened again: `riapri <n>` |
| Each run, 5: the export pulled with `adb pull`, unchanged, and renamed; the clip's SHA-256 again; the link monitor ends | `finisci <n>`. The export is pulled straight to its name, and its SHA-256 compared with the tablet file's; nothing is renamed after. |
| Each run, 6: the run-level checks, V1 to V8 | `finisci <n>`, with `2026-11-11-243-run-check.mjs --form counted` |
| Each run, 7: the run's tab closed, then 120 s idle | The operator closes the tab at the tablet, or types `chiudi-tab`, which closes the bench page's tabs only on an explicit `si`. The next `inizia` refuses while a bench page is open or before 120 s have passed since the previous run's monitor ended. |
| After each session | Unchanged, the agent's, as the runbook writes it. `stato` shows which runs are complete. |

**What the driver refuses, and what that adds.** `inizia` refuses when the run's files or its
`.state` records exist, another run has begun and not ended, the previous run is not complete or ended less than 120 s
ago, the session's first run has no passed `pronto` within the hour, the serving checkout's `HEAD`,
bundle or pathspec status is not the freeze's, the device is not connected as the table's model, the
tunnel is down, the tablet's download folder cannot be read, or a bench page is open in the tablet's
Chrome (read through the DevTools endpoint, `adb forward tcp:9222 localabstract:chrome_devtools_remote`,
after checking that no other forward, host process or client holds that socket). `finisci` refuses
anything but exactly one new export of the run's kind since `inizia`, and a pulled file whose SHA-256
differs from the tablet's. Most enforce the runbook's own order, or one of its "or the run does not
start". Two are the driver's own gates, not the runbook's text: a passed `pronto` within the hour
before a session's first run, and no bench page open in the tablet's Chrome (which replaces "the run's
tab is closed" as something the operator must remember). Neither is a validity rule, and neither
changes a verdict: a run the driver refuses to begin was never begun. A run whose link log reads a drop, or which
fails the run check, at `finisci`, follows the stopping rules exactly as before.

**What it never does.** It never moves, renames, deletes or overwrites a file. It creates files, and
appends to `.clip.txt` and to its session log. It starts and stops nothing on the host but the adb
forward it owns. Its exports go to an output folder outside every checkout, given once when it is
sourced, and are committed later, from another checkout, as the runbook's "After each session" says.

## 2. The link monitor's begin fix: the one change to a file the freeze holds

**The files.** [`2026-11-11-243-link-monitor.mjs`](./2026-11-11-243-link-monitor.mjs), held by the freeze
since the pre-flight at SHA-256 `8785946b65f7e099d027fa4717f6f4db3aec7c4ff0648b40a3c7e7fd972f4873`, and its
test, `2026-11-11-243-link-monitor.test.mjs`, recorded beside it at
`aa57c4f3cd3b4e0b1a4f7ee96ffb717cbef47821877adecdc568e37efb9fe315` with 11 cases (the record, "The
freeze"). The monitor changes by the fix below; its test gains the fix's case and a case reading the
pre-flight's five logs, and its header names `test:benchmarks`. No other file the freeze holds
changes.

**The defect.** Qodo's review of #253, recorded in #252's comment, item 1: `begin` took its UTC time and
its three adb readings before it read `adb.log`'s length. A `connection terminated` line written in
between would fall before the baseline, and `end` would not copy it. **The fix** reads the length
first, then the time and the readings. The log's format and the verdict's rules are unchanged; the fix
can only take in a line the old order would have missed. Its test appends a termination to `adb.log`
during each of `begin`'s three adb calls and checks that the end's verdict is a drop and that the run
check's V7 fails. The case fails on the pre-fix file and passes on the fixed one.

**Why it is admitted.** The monitor attests V7, and a monitor that can miss a drop at its own begin is
weaker evidence than the rule asks for. The rounds have not begun. The registration's freeze lists the
instrument, the subject, the analysis and run-check scripts and the inputs; the monitor joined it by
the maintainer's ruling of 2026-11-11, recorded with the pre-flight, and this addendum is that ruling's
one exception.

**The maintainer's ruling, on GitHub.** His comment on #243 of 2026-11-12
([issuecomment-6823059266](https://github.com/webarkit/webarkit/issues/243#issuecomment-6823059266)),
word for word:

> **The maintainer's ruling of 2026-11-12: the link monitor's begin fix is admitted into M9, before round 1.**
>
> `docs/benchmarks/2026-11-11-243-link-monitor.mjs` has been held by M9's freeze since the pre-flight (#253). Qodo's review of #253 found a race in it: `begin` read `adb.log`'s length after taking its timestamp and adb readings. A termination written in between would fall before the baseline and be missed. The fix reads the length first and changes nothing else. The log's format and the verdict rule are unchanged.
>
> I admit this change to a frozen file, as the one exception to the freeze, for these reasons:
> - it changes only when V7's evidence starts, and widens it to cover the begin readings. It can only turn a missed drop into a seen one, never the reverse;
> - it touches no instrument file, no subject file, no analysis or run-check script and no input, and the bundle stays `6d07b0c2…`;
> - every pre-flight verdict stands. Each of the five committed pre-flight logs' `adb.log` gained 0 bytes between begin and end, and the run check's V7 passes all five unchanged under the fixed monitor;
> - it is made before round 1, so every counted run is monitored by one version of the file.
> The second registration addendum (#254) records the change and quotes this ruling. The monitor's new SHA-256 is recorded there, and the rounds' records check it.

Under this ruling the pre-flight's five logs keep their verdicts: each reads `no drop: true` as
committed, and none is rewritten.

**The pre-flight's logs keep their verdicts.** They were written before the fix and stay as committed.
As #252's comment shows from `adb.log`, that day's terminations naming the device were at 16:56:48Z,
16:59:38Z, 17:40:36Z, 17:41:29Z and 19:35:35Z, and none falls within a second of any run's begin. Read
against the same `adb.log` (`%TEMP%\adb.log` on the serving machine, still holding that day's lines),
the line before each committed log's baseline was written at least eighteen minutes before its begin,
and the next line after the run's end:

| Log (`2026-11-11-tab9-m9-preflight-…`) | Begin (UTC) | End (UTC) | Baseline | Last line before it (UTC) | Next line (UTC) |
|---|---|---|---|---|---|
| `cross` | 17:34:47.587 | 17:37:23.404 | 712 bytes | 16:59:38.726 | 17:40:36.280 |
| `static-filter` | 18:00:21.331 | 18:02:33.817 | 1,061 bytes | 17:41:29.908 | 19:35:35.538 |
| `static` | 19:01:09.087 | 19:02:48.329 | 1,061 bytes | 17:41:29.908 | 19:35:35.538 |
| `fidelity-1` | 19:05:35.405 | 19:07:21.357 | 1,061 bytes | 17:41:29.908 | 19:35:35.538 |
| `fidelity-2` | 19:26:29.531 | 19:28:09.911 | 1,061 bytes | 17:41:29.908 | 19:35:35.538 |

Each log's `adb.log` gained 0 bytes between its begin and its end. A baseline read earlier in the same
begin would have read the same length, so the fixed monitor would have written the same five logs. The
monitor's test reads the five committed logs with the run check's V7, unchanged, and each passes.

**Its hash.** The fixed monitor's SHA-256 is
`90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6`, and its test's
`ddc9cbac2ae0ac81cd40cfe9066e08f9376d818557652153583549f7803a09f7`, as the ruling above says this addendum
records; the pull request gives them too. The driver writes the SHA-256 of itself, the session table,
the link monitor and the run check into its session log when it is sourced and at each `pronto`, and
each round's session record cites them from there.

**The forward and the tunnel.** #252 asks that "the link monitor must show that the forward does not
disturb the tunnel". It was shown on the Tab 9 before this addendum's pull request was opened: a
throwaway link monitor, not a run, around six cycles of the driver's own forward, `/json/version`,
`/json/list` and the forward's removal, read `no drop: true`, with the same `transport_id` and the
mapping at both ends; the pull request records it. In a run, `inizia` removes its forward before the
link monitor begins, so a forward falls inside a monitored window only through `riapri` or
`chiudi-tab`, and V7 reads that window as it reads any other.

## 3. `test:benchmarks`

`npm run test:benchmarks` runs `docs/benchmarks/*.test.mjs` under `node --test`: the link monitor's,
the fidelity script's, the session table's and the session driver's tests (#252's comment, item 2).
Until now they ran only when called by hand. It is not part of `npm test`. CI runs it as its own step
of the `build-and-test` job, after the build that the run check those tests import needs, and after
`npm test`. `AGENTS.md` names it in its command list.

## 4. The session table is the runbook's, character for character

The table's 32 runs are copied from the runbook's table and its pinned string,
`?mode=tracking&target=wnft&detection=sync&clip=<clip>&loops=4&window=2000&seed=1&run=<n>`, with
`<clip>` and `<n>` filled and nothing else, on the route's page,
`http://localhost:8093/examples/bench-nft.html`. Each row holds the run number, the clip, the export
name (`<date>-tab9-m9-<static|cross|table|wall>-<n>`), the run-check form (`counted`), the export kind
(`tracking`) and the full URL. The table also holds the device (`Tab9WEEA0001504`, model
`Tab_9_WiFi`), the port (8093), the freeze's head and bundle hash, the idle time (120 s), the quiet
minutes (5) and the two sessions (A, runs 1 to 16; B, 17 to 32). One value is the driver's own and not
the registration's: the local port of the DevTools forward, 9222.

Its test reads the pinned string, the page, the table of runs, the idle time and the quiet minutes
from the registration's text, the freeze from the pre-flight record's, and the pinned string again from
the run check's `FORMS.counted`, which judges every `.url.txt` (V3). It fails on a one-character change
at any position of any URL, and on a change to any other field.

## 5. The stall census's counts

`examples/test/bench-stall.test.mjs` pins two totals over every committed export, so each pull request
that commits exports updates them, as the pre-flight record says ("The stall census"). The first
assert's title read "the other 86" after the pre-flight's PR moved its count to 91; it now names no
number ("every other export"), so that the counts are the asserts alone.

## 6. The operator never touches a file; repairs are the agent's

The operator, at the serving machine, types the driver's commands and nothing else. The operator never
moves, renames or deletes a file, and every `STOP` the driver prints says what to tell the agent and
never suggests touching one. Repairs are the agent's: when a run is set aside under the stopping rules,
the agent moves the run's files and its `.state/<n>.*` records out of the output folder, records them,
and the run is begun again at its position with `inizia <n>`.

## What this addendum does not change

No criterion, prediction, validity rule (V1 to V11) or its verdict, outcome rule or stopping rule; no
pinned string, clip, target or seed; the instrument, the subject, the analysis and the run check, the
serving checkout and its build. The freeze holds as the pre-flight record states it, with the link
monitor's one change of entry 2.
