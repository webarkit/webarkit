# #243, M9's session B on the Tab 9: runs 17 to 32, table and wall (2026-11-12)

The second and last counted session of M9's campaign, under
[the registration](./2026-11-10-243-registration.md) as amended by
[its addendum](./2026-11-11-243-registration-addendum.md) and
[its second addendum](./2026-11-12-243-registration-addendum-2.md), on the freeze recorded in
[the pre-flight's record](./2026-11-11-243-preflight.md). Session B is the table block (runs 17 to
24, `pinball-bench-table.mp4`) and the wall block (runs 25 to 32, `pinball-bench.mp4`). Session A,
the static and cross blocks, is recorded in [its own record](./2026-11-12-tab9-m9-session-A.md).

**Outcome.** All sixteen counted runs passed V1 to V8 as each ended, and again after the session.
**One run was re-run:** run 27's first attempt was stopped at the tablet by a second press of Start,
failed V1, V6 and V8, and was re-run once, at once, at its position, as the stopping rules say; the
re-run passed. No Start was refused. The serving checkout passed `check:provenance` before each
sitting's first run and after the last. The session ran in two sittings. No figure was read before
its block's eighth run had passed its checks. Every V11 check passed on all sixteen exports. By the
registration's outcome rules, **P2 is held** (below). The wall clip carries no criterion: its CF −
IPPE reading is descriptive, by the maintainer's ruling of 2026-11-10.

## The freeze, checked

The freeze is the pre-flight record's, with the link monitor's one change admitted by the maintainer's
ruling of 2026-11-12 (the second addendum, entry 2).

| What | Value | Checked |
| --- | --- | --- |
| Serving checkout | `D:/kalwalt-github/webarkit-m9-serve`, worktree detached at `8192265bd462f0667e275ec9297fe2890a907935` | `git rev-parse HEAD` while the session was prepared, by `pronto` at 16:56:38Z, 19:01:28Z and 19:04:10Z, and after the session at 19:40:47Z |
| Pathspec status | the runbook's `git status --porcelain --untracked-files=all -- …` | empty before (preparation and each `pronto`) and after the session; the two empty untracked files `check:provenance` and `node` at the checkout's root, from the pre-flight's incident 2, are still there, outside the pathspec, and were left in place |
| `check:provenance` | `node scripts/provenance-preflight.mjs` in the serving checkout, on v24.21.0 | exit 0 while the session was prepared, at 16:56:40Z, 19:01:30Z and 19:04:12Z (`pronto`), and at 19:40:47Z: "describes this tree: HEAD 8192265…, clean, every hash the file's" |
| Manifest | `examples/dist/provenance.json`, `a5d1d8b8b676ce60880d0eb3f6996a6aeb9dc22b90c5fd2ec4827587b9fd79af` | while the session was prepared, and after it |
| Bundle | `examples/dist/webarkit-packages.mjs`, `6d07b0c25475830458b68c6ef53c221fd4a3848c00bad1a62adbafcc95b074f2` | preparation, every `pronto` and `inizia`, and after the session |
| Target | `examples/targets/pinball.wnft`, `9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282` | preparation and after the session; every export's `target.sha256` (V4) |
| Clips | `pinball-bench-table.mp4` `06a99f902bcc8e55fbda1e3e8baa169eafde3307e3b29580d8faef37af35c19d`, `pinball-bench.mp4` `6d30ffb6e05447f4f1ba706d7b2be6a8bea24247c3eba31e92bded8a4be8a89d` | twice per run into each `.clip.txt` (V4); preparation and after the session |
| Driver | `2026-11-12-243-session.sh`, `19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576` | on `origin/dev` and in the committing worktree while the session was prepared; the session log, at each sourcing and each `pronto` |
| Session table | `2026-11-12-243-session-table.json`, `0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274` | the same |
| Link monitor | `2026-11-11-243-link-monitor.mjs`, `90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6` (the second addendum's); its test `ddc9cbac2ae0ac81cd40cfe9066e08f9376d818557652153583549f7803a09f7` | the same |
| Run check | `2026-11-11-243-run-check.mjs`, `b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11`, the serving checkout's | the same |
| Analysis | `2026-11-11-243-analysis.mjs`, `a802acde66a65e8e98d2aa41b3c7d5e47cd7b3891d9c0df5602c20481d618b90`, identical on `origin/dev`, in the serving checkout and in the committing worktree | while the session was prepared, and before the analysis |
| Chrome on the tablet | **156.0.8078.81**, read by `pronto` at 16:56:48Z, 19:01:37Z and 19:04:19Z through the DevTools endpoint (`/json/version`, its `Browser` field), the source the second addendum names; the pre-flight's and session A's build. Every export's `userAgent` reads `Chrome/156.0.0.0` | before each sitting |
| Node | v24.21.0, the pin, for the serving checkout's `check:provenance`, the run check after the session and the analysis. For the driver's at-once checks (the link monitor and the run check at `finisci`): the checklist's `node --version` printed v24.21.0 at both sittings, by the maintainer's confirmation after the session; no record was made at the time (difference 4) | `node --version` in those directories |

**The serving machine.** The maintainer's notebook `nitro-walt`, Windows 11 Home 10.0.26300, Git Bash
(GNU bash 5.3.15), as in the pre-flight and session A; no build was made in the serving checkout since
the freeze's. adb 1.0.41, 37.0.0-14910828. **The server** was session A's, still running:
`http-server -p 8093 -s -c-1` (http-server 14.1.1, by `npx`), started at 14:34:57Z, sending
`cache-control: no-cache, no-store, must-revalidate` (difference 1). **The tunnel**
`tcp:8093 tcp:8093` was already set, on transport 3, and stayed so through the session. **The
committing worktree** is `D:/kalwalt-github/webarkit-m9-session-b`, branch `docs/m9-session-b` from
`origin/dev` at `f956fb095bed815895c7ae46bf9c9431339eb31a` (the merge of #255, session A), after
`git fetch origin`; the driver was sourced from it, with the output folder
`D:/kalwalt-github/m9-sessione-b`, outside every checkout, which did not exist when the session was
prepared.

## Before the session

**While the session was prepared,** before the first sitting, by the agent:

1. the hashes above on `origin/dev`, and the serving checkout's head, pathspec status,
   `check:provenance` (exit 0) and bundle;
2. the server: stopping session A's server to start a new one was not permitted in the agent's
   session, so the running server was checked instead: the bytes it serves equal the serving
   checkout's for the manifest, the bundle, `examples/bench-nft.html`, `examples/js/bench-metrics.mjs`,
   the target and both of session B's clips, and `docs/benchmarks/2026-11-12-243-session.sh`, which
   every checkout at a later head holds and `8192265` does not, answers 404 (difference 1);
3. the tunnel present; adb's log (`C:\Users\perda\AppData\Local\Temp\adb.log`, 2,002 bytes) last
   named the device in a `connection terminated` line at 13:41:39Z, as in session A;
4. **the dry check:** the driver sourced once in a scratch shell, exactly as the checklist has it
   (from the committing worktree's root, after `cd` from the home directory), then `node --version`,
   which printed v24.21.0, and `stato` (16:44:14Z to 16:44:20Z). Its lines are the session log's
   first seven. It began no run; sourcing created the output folder, empty but for the log.
   **`stato` named run 1, not run 17, as next** (difference 3);
5. **`inizia 17` in an empty folder,** at the maintainer's question before the session: the driver's
   code gates a session's first run on a passed `pronto` within the hour and a quiet link, never on
   the previous session's last run; its test "the session's first run needs pronto first; the second
   session's first run does not need the first session's last" passed (v24.21.0); and in a
   throwaway folder in the agent's scratch directory, with the driver's test seams, a fake `adb` and
   the real serving checkout, `inizia 17` passed both gates and the serving checkout's and stopped
   at its first adb call (`devices -l`), while `inizia 18`, the control, refused at once with
   "il run 17 (table) non è completo: nuovo". Nothing reached the tablet.

**At each sitting, by `pronto`** (the session log, below):

| Sitting | `pronto` | Result |
| --- | --- | --- |
| 1 | 16:56:38Z–16:56:49Z | `PRONTO OK`: the bundle and `check:provenance`, exit 0; the head and the pathspec status, empty; `no-store`; the device and the tunnel; no `bench-nft-*.json` in the tablet's download folder; the link quiet; no bench page open; Chrome 156.0.8078.81 |
| 2 | 19:01:28Z–19:01:38Z | **STOP**, one check failed: the table block's eight exports were still in the tablet's download folder (incident 2) |
| 2 | 19:04:10Z–19:04:20Z | `PRONTO OK`, every check as in sitting 1 |

**Chrome's cached files:** `pronto` prints their clearing as a step by hand ("A MANO"), since it
cannot see it; the checklist's line 5 asked the maintainer to clear them at each sitting. The
maintainer cleared them before run 17 and before run 25, and confirmed it after the session; no
record was made at the time (difference 5). **The link:** adb's log held 2,002 bytes, its last `connection terminated` line naming the device
at 13:41:39Z, from before the preparation to after the last run.

## The runs, in order

Times are UTC, on 2026-11-12. "Monitor" is the link monitor's `## begin` and `## end`; "page" is the
export's `run.startedAtIso` and `run.endedAtIso`; "clip readings" are the two lines of `.clip.txt`.
Every counted run ended by `done`, with `failure: null` and `lostVisibility: false`, at seed 1,
policy `frame`, `metricsVersion` 2, `loops` 4 from loop 1, at the freeze's head and bundle. Every link
log reads `no drop: true`, with `transport_id` 3 at both ends and the mapping present at both, and
`adb.log` at 2,002 bytes at begin and at end. Every pull's SHA-256 equals the tablet file's, compared
by `finisci`. Every `.url.txt` is the pinned string for its run (V3). Every `deviceLabel` is
`Tab_9_WiFi`.

| # | Export (`2026-11-12-tab9-m9-…`) | Monitor | Page | Clip readings | `run.order` | Frames = ticks | Export SHA-256 | Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | `table-17` | 16:57:32.725–16:59:00.347 | 16:57:59.237–16:58:44.409 | 16:57:32, 16:58:59 | 17 | 647 | `8d42320dcb0bf567…` | 1,430,801 |
| 18 | `table-18` | 17:01:23.853–17:02:58.160 | 17:01:52.770–17:02:37.906 | 17:01:24, 17:02:57 | 18 | 620 | `2d25b8915263d200…` | 1,367,633 |
| 19 | `table-19` | 17:05:53.151–17:07:25.561 | 17:06:27.865–17:07:13.076 | 17:05:53, 17:07:24 | 19 | 560 | `49dc99b148bee32f…` | 1,240,707 |
| 20 | `table-20` | 17:11:11.267–17:12:46.338 | 17:11:37.171–17:12:22.297 | 17:11:11, 17:12:45 | 20 | 639 | `b3dfe005b98269dd…` | 1,408,811 |
| 21 | `table-21` | 17:15:56.803–17:17:14.299 | 17:16:20.430–17:17:05.708 | 17:15:57, 17:17:13 | 21 | 647 | `167feecb8970236b…` | 1,434,189 |
| 22 | `table-22` | 17:20:30.957–17:22:17.818 | 17:21:20.980–17:22:06.206 | 17:20:31, 17:22:17 | 22 | 613 | `3ecb1b0afd21956f…` | 1,350,659 |
| 23 | `table-23` | 17:24:38.233–17:25:56.504 | 17:25:00.383–17:25:45.619 | 17:24:38, 17:25:55 | 23 | 657 | `4f92a02d40b093fc…` | 1,452,812 |
| 24 | `table-24` | 17:28:09.733–17:29:28.210 | 17:28:33.715–17:29:18.937 | 17:28:10, 17:29:27 | 24 | 665 | `44945089d5968731…` | 1,465,989 |
| 25 | `wall-25` | 19:04:37.638–19:06:29.584 | 19:05:21.871–19:06:22.060 | 19:04:37, 19:06:28 | 25 | 632 | `196a03e42b4cf1a9…` | 1,313,943 |
| 26 | `wall-26` | 19:08:52.337–19:10:28.883 | 19:09:18.432–19:10:18.740 | 19:08:52, 19:10:28 | 26 | 616 | `39e5cf7b799bea42…` | 1,282,979 |
| 27 | `wall-27`, the re-run | 19:17:34.716–19:19:19.107 | 19:18:12.232–19:19:12.445 | 19:17:35, 19:19:18 | 27 | 618 | `a69765c5a40ab9a4…` | 1,292,181 |
| 28 | `wall-28` | 19:22:22.750–19:23:56.136 | 19:22:48.783–19:23:48.939 | 19:22:23, 19:23:55 | 28 | 631 | `7799641beb48c4bb…` | 1,313,665 |
| 29 | `wall-29` | 19:26:42.201–19:28:21.980 | 19:27:08.540–19:28:08.706 | 19:26:42, 19:28:21 | 29 | 639 | `398edde13bb7cc15…` | 1,332,418 |
| 30 | `wall-30` | 19:30:42.668–19:32:16.228 | 19:31:07.654–19:32:07.892 | 19:30:42, 19:32:15 | 30 | 613 | `d07c0af09fb524a2…` | 1,279,240 |
| 31 | `wall-31` | 19:34:28.605–19:36:00.699 | 19:34:53.828–19:35:54.056 | 19:34:28, 19:35:59 | 31 | 637 | `30b64633b0103b43…` | 1,326,262 |
| 32 | `wall-32` | 19:38:46.620–19:40:26.002 | 19:39:11.239–19:40:11.407 | 19:38:46, 19:40:25 | 32 | 627 | `8f1b7761703abc80…` | 1,307,980 |

The exports' full SHA-256s, of the pulled files and of the committed blobs alike:

- `table-17`: `8d42320dcb0bf567e411b831a155152a95876166036daeff98bb1849cddb792b`
- `table-18`: `2d25b8915263d200e0ac29cf1f816d3ba3c9d102584a7b01aac3fc59a9ed052d`
- `table-19`: `49dc99b148bee32f676f60a650c10dbc9cbdef93ddb56e33813a65d7c709d69a`
- `table-20`: `b3dfe005b98269dd603953bb00d9f541814c2eddac5a7ca22d649e9694bacab1`
- `table-21`: `167feecb8970236b0262ef01694ed6e8e75e21394e148908d82e3cdac60e61fc`
- `table-22`: `3ecb1b0afd21956f370adda9dae3bb38994c6e199d51ddc44c644ff67d431e0f`
- `table-23`: `4f92a02d40b093fc1cba63ac6c052c69c4382f89a61c0578b40c377771b4e9d0`
- `table-24`: `44945089d59687314e487896d3086da8eedb6f51b939cfe05971fb53122e9610`
- `wall-25`: `196a03e42b4cf1a96c8d687a19ab93944ee1bfcf82a1f9d2cc63605c2f79e3e6`
- `wall-26`: `39e5cf7b799bea425dd692f3584cae19a7b155bb1d84dd681c024b66faebbd33`
- `wall-27`: `a69765c5a40ab9a497617b67ca108c4aae92f079c034c6403cea8bd19c12117f`
- `wall-28`: `7799641beb48c4bbc70485293e4415dd6cf6c2baefc56ae17f1d8d3e7ba26d76`
- `wall-29`: `398edde13bb7cc157d8f1736b123ee63d944c6d4aa4b872cbddfb0bc9015fadc`
- `wall-30`: `d07c0af09fb524a282b2de70d2a82078fe2d50133bb44117cc46651e0b29de0d`
- `wall-31`: `30b64633b0103b4318a3cf745278ef25725e397d49b0f9bf862fde844301c89c`
- `wall-32`: `8f1b7761703abc80bfe685f96a100ba7a10ec27639cdfdf8cc6a385768b09210`

**The two sittings.** The first ran from the sourcing at 16:56:17Z to run 24's end at 17:29:30Z;
the maintainer then paused for about an hour and a half, during which nothing was done in the output
folder, the serving checkout or on the tablet, and the server and the tunnel stayed up. Before the
second, the agent read at 19:00:00Z the server's `no-store`, the device on transport 3, the tunnel,
and no new `connection terminated` line. The second ran from the new sourcing at 19:01:04Z to run
32's end at 19:40:27Z.

**Between runs.** From one monitor's end to the next one's begin: 143.5, 175.0, 225.7, 190.5,
196.7, 140.4 and 133.2 s before runs 18 to 24; 5,709.4 s before run 25 (the pause); 142.8 s before
run 26; 425.8 s before run 27's re-run, which includes the failed attempt (136.7 s from run 26's end
to its begin, 163.3 s from its end to the re-run's begin); then 183.6, 166.1, 140.7, 132.4 and
165.9 s before runs 28 to 32. The shortest is 132.4 s. Each `inizia` that began a run found no
bench page open in the tablet's Chrome. Run 17 began 43 s after the first `PRONTO OK`, run 25 17 s
after the second.

**The re-run of run 27.** The first attempt (incident 3) is not counted, and its export and logs are
not committed. Its link monitor ran from 19:12:45.549Z to 19:14:51.442Z (`inizia 27` at 19:12:39Z;
`no drop: true`; clip readings 19:12:45 and 19:14:32, the wall clip's hash); its page ran from
19:14:16.503Z to 19:14:18.049Z, 16 frames, `endedBy` `"stopped"`. The run check at 19:14:52Z, exit
1:

- **V1 FAIL:** `run.endedBy` is `"stopped"`, not `"done"`;
- **V6 FAIL:** `protocol.sessionRun` false, with the gaps "run.endedBy stopped: a session run ends
  itself on the first frame after its counted loops (done)" and "trackTimeShare is not complete: a
  tracking run's lock is read over its counted loops whole";
- **V8 FAIL:** `stall-check.mjs` exits 1: no frame of loop 5, and no frame in loops 1 to 4;
- V2 to V5 and V7 PASS.

The cause, by the maintainer at the tablet: Start pressed a second time, by mistake, during the
run, which stopped it. **The rule:** the registration's stopping rules, "A run that fails a validity
rule is re-run once, at once, at its own position. Its export and logs are not committed, and the
record names the run, its time and the rule." The re-run's link monitor began at 19:17:34Z
(`inizia 27` at 19:17:28Z), and the re-run passed. It was
position 27's one allowed re-run; no position failed twice.

## The checks

### V1 to V8, every run

**PASS on all sixteen counted exports**, by the run check at the freeze head with `--form counted`,
each as its run ended (`finisci`, step 6, in the session log) and all sixteen again after the
session, from 19:41:15Z to 19:41:35Z, from the serving checkout on v24.21.0, on the exports in the
output folder before they were copied. The second pass's output, abridged to its verdict lines
(identical for each export, each exiting 0):

```
# 2026-11-11-243-run-check.mjs: …/2026-11-12-tab9-m9-<table|wall>-<n>.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
```

### The count and the identity (M4's step 7)

Sixteen exports, one per position 17 to 32, each with its `.url.txt`, `.clip.txt` and `.link.txt`;
each `run.order` equals its `<n>`; each `bundledClip` is its name's (`pinball-bench-table.mp4` for
`table-17` to `table-24`, `pinball-bench.mp4` for `wall-25` to `wall-32`); each
`provenance.manifest.head` is `8192265bd462f0667e275ec9297fe2890a907935`. The output folder held 65
files: these 64 and the session log. The 64 files were copied unchanged into `docs/benchmarks/` at
19:41:45Z; each copy's SHA-256 equals its source's, and each committed blob's equals the pulled file's.

### V9 and V10, readings, not gates

By the analysis (below). V10: `run.lostVisibility` false on all sixteen.

| Block | `acquire` p50 over counted loops, ms, runs in order | `trackStepMs` p50, ms, runs in order | Last against first | Flagged (M3's bounds, 1.9 ms and 6.6%, quoted as M3's) |
| --- | --- | --- | --- | --- |
| table, runs 17–24 | 31.7, 32.7, 32.8, 31.5, 31.5, 31.9, 31.4, 31.7 | 12.5, 12.7, 12.8, 12.5, 12.7, 12.6, 12.6, 12.6 | `acquire` 0.0 ms (the analysis prints −0.0000); `trackStepMs` +0.1 ms (0.8%) | no |
| wall, runs 25–32 | 24.7, 24.5, 25.6, 25.4, 25.0, 25.2, 24.8, 25.0 | 14.3, 14.3, 15.0, 14.9, 14.6, 14.5, 14.3, 14.2 | `acquire` +0.3 ms; `trackStepMs` −0.1 ms (−0.7%) | no |

## The analysis

Run after both blocks' eighth runs had passed their checks (run 24 at 17:29:29Z, run 32 at
19:40:27Z, and all sixteen again at 19:41:35Z), from 19:42:01Z to 19:42:06Z: the frozen script,
`--block`, from the serving checkout, so that it imports the freeze's built modules, on the copies
in the committing worktree, which were committed afterwards, unchanged, in `bec3e5e`:

```
node docs/benchmarks/2026-11-11-243-analysis.mjs --block <the committing worktree>/docs/benchmarks/2026-11-12-tab9-m9-table-{17..24}.json
node docs/benchmarks/2026-11-11-243-analysis.mjs --block <the committing worktree>/docs/benchmarks/2026-11-12-tab9-m9-wall-{25..32}.json
```

Both exited 0 with an empty stderr. Their stdout was written to a scratch file and copied beside this
record at 19:42:54Z, unchanged; it is committed there, and is the same, byte for byte, run again on
the exports in the output folder at 19:42:49Z:

- table: [`2026-11-12-243-session-B-analysis-table.txt`](./2026-11-12-243-session-B-analysis-table.txt),
  317 lines, SHA-256 `39543a9cf332bf34a251006f4ca068fa0a00738a2953d1e14069c9fb56cffe21`;
- wall: [`2026-11-12-243-session-B-analysis-wall.txt`](./2026-11-12-243-session-B-analysis-wall.txt),
  325 lines, SHA-256 `b8ecee5b582a4a3f388c7b0918f9addff79057c317c24a4e3456504537079d0a`.

What follows is read from those two files; every figure is theirs, rounded here to four decimals,
and in full there. The analysis numbers a block's runs 1 to 8: on the table block they are runs 17
to 24, on the wall block runs 25 to 32. `K` assumed: `intrinsics(203, 360)` on the table clip and
`intrinsics(480, 270)` on the wall clip, 60° of horizontal field, for every arm and figure (the
registration, "K assumed, 2026-11-10"): every tilt, selection and switch below is the assumed
camera's.

### V11, every export

On all sixteen: the fields each arm needs present, the filter off, `metricsVersion` 2; `K` equal to
`intrinsics` of the processing resolution, element by element; every `H` finite on an `ok` frame;
`runSummary.poseJitterPx` recomputed over the counted loops equal bit for bit; route (b)'s
reprojection within 1e-9 px on every frame with `poseCorners`; CF's `good` on every `ok` frame; the
tilt computed on every `ok` frame. **No fatal check fired.** **Route (b)'s null-corners frames: 0 in
every run** (`ok` TRACK frames with null `poseCorners`); route (b) serves P7 alone, on the static
clip, which is session A's.

Counted frames: table 458 to 542 a run (LOST 61 to 72, DETECT 13 to 32, TRACK 364 to 461); wall 483
to 515 a run (LOST 130 to 135, DETECT 73 to 97, TRACK 253 to 307). Every run within `?window=2000`,
frames equal to ticks, 5 wraps, no step back in `timestampMs`.

**TRACK frames on 8 or 9 inliers** (the registration's third reporting rule), as the analysis names
them in each reading's selection: none in P2's selections on the table clip; on the wall clip's
descriptive selection, in run 25 at 10.956522 s (loop 3, 9 inliers), run 29 at 6.381271 s (loop 4,
8) and 10.956522 s (loop 4, 9), run 30 at 10.956522 s (loop 1, 9) and run 31 at 8.307692 s (loop 2,
9), the same frames in its TRACK frames.

### The frame-fidelity share, beside every spread

**D3, measured in the pre-flight and ruled negligible for this campaign by the maintainer on
2026-11-11:** 25 of 1,145 pairs differ (2.18%, a lower bound on the grab's infidelity, read under
detection-only load on the static clip); 13 of 535 pairs within a run and 12 of 610 across the two
runs; nine media times have a differing pair, 1.533333, 3.5, 5.0, 6.8, 7.333333, 9.2, 10.2, 10.666667
and 12.133333 s, the static clip's final frame. It reaches only the spread between runs. It stands
beside every s_d and every arm's s below, in each row as "D3: 25 of 1,145 (2.18%)".

### The criterion

Each reading is d = J(Y) − J(X) per run on the selection, X IPPE and Y CF; over the 8 runs, d̄,
s_d, the interval d̄ ± 2.3646 × s_d ÷ √8 and the count of the predicted sign; then the same without
the most influential media time. Held needs the interval wholly on the predicted side and at least 7
of 8 of the predicted sign, both with and without that media time; P2 holds only if it holds on the
selection and on its TRACK frames. The replay figure from Stage 1 stands beside it as the
registration's basis, a reading, not a threshold.

| | Reading | With every media time: d̄ [interval], s_d, sign count | The most influential media time | Without it: d̄ [interval], s_d, sign count | Basis (the registration) | D3 beside the spread | Reading's outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **P2** | CF − IPPE, table, below 10°, the selection | −0.8749 [−0.9641, −0.7857], 0.1067, 8 of 8 | 7.100000 s, 17 occurrences, TRACK and DETECT, 16 to 65 inliers, tilt 3.97° to 4.51° | −0.8261 [−0.9193, −0.7329], 0.1114, 8 of 8 | −0.9569 / −0.5981 / −0.5684; spreads 0.290 and 0.241 over seeds; without 8.466667 s: −0.9569 / −0.4436 / −0.4210 | D3: 25 of 1,145 (2.18%) | held |
| | the selection's TRACK frames | −0.8362 [−0.9265, −0.7458], 0.1081, 8 of 8 | 7.133333 s, 12 occurrences, TRACK, 20 to 37 inliers, tilt 4.40° to 4.49° | −0.7966 [−0.8891, −0.7040], 0.1107, 8 of 8 | | D3: 25 of 1,145 (2.18%) | held |

**Each arm's spread over the runs,** s [its 95% interval, s × [0.661, 2.035]], X then Y as the
analysis prints them:

- P2, the selection: IPPE 0.1142 [0.0755, 0.2324]; CF 0.0473 [0.0313, 0.0963]; D3: 25 of 1,145
  (2.18%);
- P2, its TRACK frames: IPPE 0.1390 [0.0919, 0.2829]; CF 0.0676 [0.0447, 0.1377]; D3: 25 of 1,145
  (2.18%).

**Selections:** per run, 361 to 444 frames in 26 to 28 windows on the selection, 347 to 441 in 25
to 28 on its TRACK frames; the windows each run's selection emptied, and the frames per window, are
in the table file's P2 section.

**The registered outcome:**

| Criterion | Clip | Outcome | By the registration's rule |
| --- | --- | --- | --- |
| P2 | table | **held** | held on the selection with and without 7.100000 s, and on its TRACK frames with and without 7.133333 s ("A criterion holds only if it holds on both") |

With session A's six, every criterion of the registration has now been read on its block: P1, P3,
P4, P5, P6 and P7 in session A's record, P2 here. The campaign's closing addendum reads them
together (the registration, "The campaign closes").

### Descriptive readings, never criteria

Labelled descriptive by the registration; no direction is claimed from them, and no outcome is read.

- **CF − IPPE below 10° on the wall clip** (the maintainer's ruling of 2026-11-10), in the criteria's
  form:

  | Reading | With every media time: d̄ [interval], s_d, signs | The most influential media time | Without it: d̄ [interval], s_d, signs | Each arm's s [95% interval] | D3 beside the spread |
  | --- | --- | --- | --- | --- | --- |
  | the selection | +0.0128 [−0.0700, +0.0956], 0.0991, 3 below 0 and 5 above | 11.719064 s, 16 occurrences, TRACK, 35 to 38 inliers, tilt 9.14° to 9.19° | +0.0341 [−0.0430, +0.1112], 0.0922, 3 below 0 and 5 above | IPPE 0.3899 [0.2577, 0.7933]; CF 0.4327 [0.2860, 0.8805] | D3: 25 of 1,145 (2.18%) |
  | its TRACK frames | −0.0019 [−0.0697, +0.0659], 0.0811, 4 below 0 and 4 above | 10.795987 s, 8 occurrences, TRACK, 36 to 38 inliers, tilt 9.08° to 9.11° | −0.0362 [−0.1090, +0.0366], 0.0871, 5 below 0 and 3 above | IPPE 0.2696 [0.1782, 0.5486]; CF 0.3386 [0.2238, 0.6890] | D3: 25 of 1,145 (2.18%) |

  The selection holds 83 to 102 frames a run in 8 to 10 windows, nearly all in the 7–10° band.
- **The tilt bands** (Stage 2's Tilt row, the first addendum's entry 1), per run, in the two output
  files' first tables. Table: posed counted frames in every band from 1–3° to 20–30° and over 40°,
  most of them in 7–10° (205 to 252 a run), 0 to 2 in 30–40°, and 0 or 1 in 0–1°; the CF − IPPE jitter difference is printed for the bands
  below 10° only. Wall: frames from 3–5° up, almost none below 7° (0 or 1 in each of 3–5° and 5–7°),
  82 to 102 in 7–10°.
- **Above 10°: the corner distance, CF to IPPE.** Table: 2.0596 to 2.7348 px a run on 10–15°, over
  16 to 27 frames; the bands from 15° up hold 0 to 9 frames a run. Wall: 0.9278 to 1.0403 px on
  10–15° (103 to 129 frames), 0.3978 to 0.4435 px on 15–20° (40 to 54), 0.5888 to 0.6395 px on
  20–30° (79 to 95); 30–40° and over 40° hold 3 to 15 frames a run. Every band's figure, per run,
  is in the output files.
- **Each arm's `poseSpreadPx`** over the counted loops, per run: table IPPE 26.3447 to 27.0284, CF
  26.0622 to 27.0214, GUARD 26.0707 to 26.7190; wall IPPE 44.9789 to 45.8784, CF 45.1525 to 72.9962,
  GUARD 44.9721 to 45.8619.

## Incidents

1. **`inizia 22`, 17:19:25Z: a bench page was still open.** Run 21's tab
   (`9BA9CD3CD713298EE44624B76BA0B8EB`, its `run=21` URL) was open in the tablet's Chrome after run
   21 had completed at 17:17:16Z. The driver refused before beginning anything: no link monitor, no
   `.clip.txt` or `.url.txt`, no `.state/22.before`. This is the driver's own gate (the second
   addendum, entry 1: "a run the driver refuses to begin was never begun"), not a validity rule. The
   maintainer closed the tab, and `inizia 22` found no bench page open at 17:20:29Z; run 22's link
   monitor began at 17:20:31Z. Not a run, not a refused Start; no repair, no file moved.
2. **`pronto`, 19:01:38Z, at the second sitting: the tablet's download folder still held the table
   block's eight exports** (`bench-nft-tracking-Tab-9-WiFi-1794502731231.json` to
   `…-1794504563345.json`): `finisci` pulls an export with `adb pull`, which copies it and leaves it
   on the tablet. Every other check passed. **The repair, the agent's, on the maintainer's
   instruction:**
   - each file's SHA-256 on the tablet (`sha256sum` there) equals, in order, the pulled
     `table-17` to `table-24` export's, and each is the file the session log names at its run's step
     5;
   - `/sdcard/Download/old/` already existed (21 entries); none of the eight names was in it;
   - at 19:03:32Z to 19:03:33Z each was moved there with `adb shell mv -n`, and hashed again there,
     with the same eight hashes; no `bench-nft-*.json` was left in `/sdcard/Download/`.

   No file in the output folder was touched. `pronto` passed at 19:04:20Z. Not a run.
3. **Run 27's first attempt, 19:12:39Z to 19:14:53Z: run check exit 1, V1, V6 and V8 FAIL.** As
   "The re-run of run 27" above gives it. **The repair, the agent's, by the stopping rules and the
   second addendum's entry 6:** at 19:16:14Z to 19:16:15Z the attempt's export, `.url.txt`,
   `.clip.txt` and `.link.txt` and the driver's `.state/27.before` and `.state/27.runcheck` were moved
   with `mv -n` out of the output folder into `D:/kalwalt-github/m9-sessione-b-scartati/run27-tentativo1/`,
   outside every checkout, each file hashed before and after with the same SHA-256 (the export
   `26cfd5800d830fbc52b331926e77aa3b171e9553c2836f7edb555fa3800e6d85`, 80,285 bytes). They are never
   committed. The attempt's export also stays on the tablet, in `/sdcard/Download/`
   (`bench-nft-tracking-Tab-9-WiFi-1794510858745.json`), where the re-run's `inizia` listed it among
   the files present before it. Before the re-run, `chiudi-tab` closed the attempt's tab (19:17:09Z
   to 19:17:18Z), before the re-run began; the re-run's link monitor began at 19:17:34Z.
4. **`inizia 30`, 19:30:17Z: "il run 29 è finito 116 s fa; attendi ancora 4 s (passo 7)".** The
   driver refused before beginning anything; run 30's link monitor began at 19:30:42Z. Not a run, not a
   refused Start; no repair.

There was no other incident: no other `STOP`, no refused Start, no USB drop, and no file moved,
renamed or deleted but those of incidents 2 and 3.

## Differences from the runbook

1. **The server was not started for this session.** The runbook's command was running from session
   A, started at 14:34:57Z, still serving on port 8093 (`http-server -p 8093 -s -c-1`); stopping it
   to start a new one was not permitted in the agent's session. What the runbook asks of the server
   was checked instead, before the session: the bytes it served equal the serving checkout's (above,
   "Before the session", item 2) and it sent `no-store`; every `pronto` read `no-store` again, and V2
   and V5 held on every export, so the page loaded the freeze's bundle and manifest.
2. **The session ran in two sittings,** with a pause of about an hour and a half after run 24, and
   `pronto` again before run 25; the table block lies wholly in the first, the wall block wholly in
   the second, so no block spans the pause.
3. **`stato` names run 1 as next in session B's output folder.** It takes the first run of the whole
   table that has no files in the output folder, and session B's folder holds none of runs 1 to 16.
   Its other lines ("completi", "in corso", "da riparare") are right; `inizia 17` opened the session
   as the driver's code and test provide (above, item 5), and `finisci` named each next run. The
   driver was not changed: the checklist told the maintainer to follow `finisci` and never to type
   `inizia 1`, and no run but 17 to 32 was begun.
4. **The `node` of the driver's at-once checks.** By the maintainer's ruling of 2026-11-12 on session
   A's difference 4: on this notebook the version manager (nvm for Windows) resolves a `node` by the
   working directory's `.nvmrc`, v24.21.0 at either checkout's root and v24.18.0 in the home
   directory and in `docs/benchmarks/` (read while the session was prepared). The driver runs the
   link monitor and the run check with the `node` of the operator's working directory. So the
   checklist's first line put the pin first, `cd /d/kalwalt-github/webarkit-m9-session-b`, the
   committing worktree's root, where the `source` line, given as a path relative to that root,
   resolves; and its line right after the `source` was `node --version`, which had to print v24.21.0
   at each sitting, or the maintainer was to stop. The ruling also said that `pronto`'s output would
   show `node --version`. Before the session the maintainer instructed instead that the driver not be
   changed, and that the checklist carry `node --version` as its own line; `pronto` prints no `node`
   version. **The result:** the operator's `node --version` was typed in the operator's own Git Bash
   and is not logged, so no record made at the time shows which `node` ran the driver's at-once
   checks; no stop was reported at either sitting. **The maintainer confirmed on 2026-11-12, after
   the session, that it printed v24.21.0 at both sittings.** The agent's dry check printed v24.21.0
   too, but it ran in a scratch shell that the agent started in the same directory, not in the
   operator's Git Bash. What the record rests on ran on the pin: the run check of all sixteen exports
   after the session, which gave the same verdicts as the at-once checks, and the analysis.
5. **Chrome's cached files** ("Before each session", item 4): their clearing is the operator's, at
   the tablet, which `pronto` cannot see; the checklist asked for it at each sitting, after `pronto`.
   The maintainer cleared them before run 17 and before run 25 and confirmed it on 2026-11-12, after
   the session; no record was made at the time.
6. **The analysis ran from the serving checkout,** on the copies in the committing worktree, so that
   it imported the freeze's built `dist/` (as session A's difference 3). It is the same script, by its
   hash, and its stdout is the same on the output folder's exports.

The runbook's commands before the session and for each run were carried out by the driver, as the
second addendum admits. The file operations of incidents 2 and 3 were the agent's: incident 3's by
the second addendum's entry 6, which makes setting a run aside the agent's, and incident 2's, on the
tablet, which entry 6 does not cover, on the maintainer's instruction. Neither is counted as a
difference.

## Storage

Plain JSON, by the maintainer's ruling of 2026-11-10. The sixteen exports are 21,600,269 bytes on
disk, their 48 `.txt` files the rest of the 64. **Stored, by the README's command,** in two throwaway
bare clones of the committing worktree, each repacked on one thread at git's default compression
(`git -c core.compression=-1 -c pack.compression=-1 -c pack.threads=1 repack -a -d -F`, as session
A's record gives it), which gave the same figures:

- **14.90 MB** (14,902,538 bytes) at `f956fb0`, the branch's base;
- **17.83 MB** (17,834,844 bytes) at the exports' commit `bec3e5e`, so the sixteen exports and their
  `.txt` files add **2.93 MB** (2,932,306 bytes).

The same clones read 8,264,877 bytes at `351bdca`, where session A's read 8,264,199: a clone holding
more history packs older blobs into different deltas. **At the census commit `22acd9d`,** in two
fresh clones repacked the same way, which again agree: 14,898,309 bytes at `f956fb0`, 17,830,615 at
`bec3e5e`, the same 2,932,306 bytes added by the exports, and **17.86 MB** (17,860,013 bytes) at
`22acd9d`, with this record and the analysis's two stdouts. The pull request reports the figure at
its own head.

## The stall census

`examples/test/bench-stall.test.mjs` pins two totals over every committed export in
`docs/benchmarks/`, so these exports move both. They are updated in this record's pull request, in a
commit of their own that changes only the two assert lines (the second addendum, entry 5):

- exports passing every arm: 107 to **123**, the sixteen session B exports (+16), each passing every
  arm;
- step backs read with the clip's duration: 362 to **442**, their 80 loop wraps (+80), 5 in each
  export, each agreeing with `isLoopWrap`.

Every other assert of the census passes unchanged (46 of the file's 48 tests passed with the exports
present and the two counts not yet moved; the two failed on exactly 123 and 442).

## What is committed

- the sixteen exports, each with its `.url.txt`, `.clip.txt` and `.link.txt`, unchanged;
- this record, and the analysis's two stdouts beside it, whose hashes the criteria's addendum will
  cite;
- the stall census's two counts.

Not committed: run 27's first attempt (incident 3); the driver's `.state/` records (`<n>.before` and
`<n>.runcheck` for runs 17 to 32) and its session log, which is quoted in full below.

## The driver's session log

`D:/kalwalt-github/m9-sessione-b/m9-session.log`, 42,624 bytes, SHA-256
`be1c8f8a3b32c15427728678b2bfc7e1a7560096448a8fa0ce9af2e7960455b8`, in full:

```
2026-11-12T16:44:14Z driver M9 caricato: Tab9WEEA0001504 (Tab_9_WiFi), 32 run, uscita D:/kalwalt-github/m9-sessione-b. Comandi: pronto, inizia N, finisci N, riapri N, chiudi-tab, stato
2026-11-12T16:44:14Z sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-12-243-session.sh
2026-11-12T16:44:14Z sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-12-243-session-table.json
2026-11-12T16:44:14Z sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-11-243-link-monitor.mjs
2026-11-12T16:44:14Z sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 D:/kalwalt-github/webarkit-m9-serve/docs/benchmarks/2026-11-11-243-run-check.mjs
2026-11-12T16:44:20Z completi: nessuno
2026-11-12T16:44:20Z prossimo: run 1, il primo della sessione A. Scrivi: pronto, poi inizia 1
2026-11-12T16:56:17Z driver M9 caricato: Tab9WEEA0001504 (Tab_9_WiFi), 32 run, uscita D:/kalwalt-github/m9-sessione-b. Comandi: pronto, inizia N, finisci N, riapri N, chiudi-tab, stato
2026-11-12T16:56:17Z sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-12-243-session.sh
2026-11-12T16:56:17Z sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-12-243-session-table.json
2026-11-12T16:56:17Z sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-11-243-link-monitor.mjs
2026-11-12T16:56:17Z sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 D:/kalwalt-github/webarkit-m9-serve/docs/benchmarks/2026-11-11-243-run-check.mjs
2026-11-12T16:56:38Z pronto: dispositivo Tab9WEEA0001504 (Tab_9_WiFi), checkout di servizio D:/kalwalt-github/webarkit-m9-serve, uscita D:/kalwalt-github/m9-sessione-b
2026-11-12T16:56:38Z     sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 2026-11-12-243-session.sh
2026-11-12T16:56:38Z     sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 2026-11-12-243-session-table.json
2026-11-12T16:56:38Z     sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 2026-11-11-243-link-monitor.mjs
2026-11-12T16:56:38Z     sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 2026-11-11-243-run-check.mjs
2026-11-12T16:56:38Z OK  HEAD del checkout di servizio = testa del freeze 8192265
2026-11-12T16:56:39Z OK  bundle 6d07b0c2… = freeze
2026-11-12T16:56:39Z OK  git status sul pathspec del runbook: vuoto
2026-11-12T16:56:40Z OK  check:provenance, exit 0
2026-11-12T16:56:41Z OK  cache-control: no-cache, no-store, must-revalidate
2026-11-12T16:56:41Z OK  dispositivo Tab9WEEA0001504 collegato, modello Tab_9_WiFi
2026-11-12T16:56:41Z OK  tunnel tcp:8093 tcp:8093
2026-11-12T16:56:42Z OK  nessun bench-nft-*.json nei Download del tablet
2026-11-12T16:56:42Z OK  collegamento quieto da almeno 5 minuti (adb.log)
2026-11-12T16:56:48Z OK  nessuna pagina del banco aperta nel Chrome del tablet
2026-11-12T16:56:48Z OK  Chrome sul tablet: Chrome/156.0.8078.81 (fonte: DevTools /json/version, la build di chrome://version)
2026-11-12T16:56:49Z   nota: Chrome è aperto sul PC; chrome://inspect e «Discover USB devices» devono restare chiusi
2026-11-12T16:56:49Z A MANO  sul tablet: svuota i file in cache di Chrome (runbook, item 4); il driver non lo vede
2026-11-12T16:56:49Z PRONTO OK
2026-11-12T16:57:26Z 1. tunnel tcp:8093 presente
2026-11-12T16:57:31Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-17.link.txt
2026-11-12T16:57:32Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-17.link.txt
2026-11-12T16:57:33Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-17.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T16:57:33Z 3. URL aperto sul tablet: run=17, clip=pinball-bench-table.mp4
2026-11-12T16:57:33Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T16:57:33Z    Poi scrivi: finisci 17
2026-11-12T16:58:58Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794502731231.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794502731231.json: 1 file pulled, 0 skipped. 24.3 MB/s (1430801 bytes in 0.056s)
2026-11-12T16:58:59Z    scaricata in 2026-11-12-tab9-m9-table-17.json, SHA-256 8d42320dcb0bf567… uguale al tablet
2026-11-12T16:58:59Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-17.link.txt: no drop: true
2026-11-12T16:59:00Z    monitor del collegamento finito: no drop: true
2026-11-12T16:59:02Z run check del run 17:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-17.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T16:59:02Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T16:59:02Z run 17 completo.
2026-11-12T16:59:02Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 18 dalle 17:01:00Z.
2026-11-12T17:01:18Z 1. tunnel tcp:8093 presente
2026-11-12T17:01:22Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-18.link.txt
2026-11-12T17:01:24Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-18.link.txt
2026-11-12T17:01:24Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-18.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:01:24Z 3. URL aperto sul tablet: run=18, clip=pinball-bench-table.mp4
2026-11-12T17:01:24Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:01:24Z    Poi scrivi: finisci 18
2026-11-12T17:02:56Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794502967105.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794502967105.json: 1 file pulled, 0 skipped. 24.3 MB/s (1367633 bytes in 0.054s)
2026-11-12T17:02:57Z    scaricata in 2026-11-12-tab9-m9-table-18.json, SHA-256 2d25b8915263d200… uguale al tablet
2026-11-12T17:02:57Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-18.link.txt: no drop: true
2026-11-12T17:02:58Z    monitor del collegamento finito: no drop: true
2026-11-12T17:02:59Z run check del run 18:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-18.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:02:59Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:02:59Z run 18 completo.
2026-11-12T17:02:59Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 19 dalle 17:04:58Z.
2026-11-12T17:05:47Z 1. tunnel tcp:8093 presente
2026-11-12T17:05:51Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-19.link.txt
2026-11-12T17:05:53Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-19.link.txt
2026-11-12T17:05:53Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-19.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:05:53Z 3. URL aperto sul tablet: run=19, clip=pinball-bench-table.mp4
2026-11-12T17:05:53Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:05:54Z    Poi scrivi: finisci 19
2026-11-12T17:07:24Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794503240335.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794503240335.json: 1 file pulled, 0 skipped. 24.8 MB/s (1240707 bytes in 0.048s)
2026-11-12T17:07:24Z    scaricata in 2026-11-12-tab9-m9-table-19.json, SHA-256 49dc99b148bee32f… uguale al tablet
2026-11-12T17:07:24Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-19.link.txt: no drop: true
2026-11-12T17:07:25Z    monitor del collegamento finito: no drop: true
2026-11-12T17:07:26Z run check del run 19:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-19.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:07:27Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:07:27Z run 19 completo.
2026-11-12T17:07:27Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 20 dalle 17:09:25Z.
2026-11-12T17:11:05Z 1. tunnel tcp:8093 presente
2026-11-12T17:11:09Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-20.link.txt
2026-11-12T17:11:11Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-20.link.txt
2026-11-12T17:11:11Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-20.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:11:12Z 3. URL aperto sul tablet: run=20, clip=pinball-bench-table.mp4
2026-11-12T17:11:12Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:11:12Z    Poi scrivi: finisci 20
2026-11-12T17:12:44Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794503555438.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794503555438.json: 1 file pulled, 0 skipped. 27.5 MB/s (1408811 bytes in 0.049s)
2026-11-12T17:12:45Z    scaricata in 2026-11-12-tab9-m9-table-20.json, SHA-256 b3dfe005b98269dd… uguale al tablet
2026-11-12T17:12:45Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-20.link.txt: no drop: true
2026-11-12T17:12:46Z    monitor del collegamento finito: no drop: true
2026-11-12T17:12:47Z run check del run 20:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-20.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:12:47Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:12:48Z run 20 completo.
2026-11-12T17:12:48Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 21 dalle 17:14:46Z.
2026-11-12T17:15:33Z 1. tunnel tcp:8093 presente
2026-11-12T17:15:55Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-21.link.txt
2026-11-12T17:15:57Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-21.link.txt
2026-11-12T17:15:57Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-21.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:15:57Z 3. URL aperto sul tablet: run=21, clip=pinball-bench-table.mp4
2026-11-12T17:15:57Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:15:57Z    Poi scrivi: finisci 21
2026-11-12T17:17:12Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794503829589.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794503829589.json: 1 file pulled, 0 skipped. 27.5 MB/s (1434189 bytes in 0.050s)
2026-11-12T17:17:13Z    scaricata in 2026-11-12-tab9-m9-table-21.json, SHA-256 167feecb8970236b… uguale al tablet
2026-11-12T17:17:13Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-21.link.txt: no drop: true
2026-11-12T17:17:14Z    monitor del collegamento finito: no drop: true
2026-11-12T17:17:15Z run check del run 21:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-21.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:17:15Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:17:16Z run 21 completo.
2026-11-12T17:17:16Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 22 dalle 17:19:14Z.
2026-11-12T17:19:20Z 1. tunnel tcp:8093 presente
2026-11-12T17:19:25Z STOP: una pagina del banco è aperta nel Chrome del tablet
2026-11-12T17:19:25Z   Chiudila sul tablet, oppure scrivi: chiudi-tab
2026-11-12T17:19:25Z   → Di' all'agente: "STOP inizia 22: una pagina del banco è aperta nel Chrome del tablet". Non spostare, rinominare o cancellare alcun file.
2026-11-12T17:19:25Z   scheda 9BA9CD3CD713298EE44624B76BA0B8EB: http://localhost:8093/examples/bench-nft.html?mode=tracking&target=wnft&detection=sync&clip=pinball-bench-table.mp4&loops=4&window=2000&seed=1&run=21
2026-11-12T17:20:25Z 1. tunnel tcp:8093 presente
2026-11-12T17:20:29Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-22.link.txt
2026-11-12T17:20:31Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-22.link.txt
2026-11-12T17:20:31Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-22.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:20:31Z 3. URL aperto sul tablet: run=22, clip=pinball-bench-table.mp4
2026-11-12T17:20:31Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:20:31Z    Poi scrivi: finisci 22
2026-11-12T17:22:16Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794504131055.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794504131055.json: 1 file pulled, 0 skipped. 26.7 MB/s (1350659 bytes in 0.048s)
2026-11-12T17:22:16Z    scaricata in 2026-11-12-tab9-m9-table-22.json, SHA-256 3ecb1b0afd21956f… uguale al tablet
2026-11-12T17:22:17Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-22.link.txt: no drop: true
2026-11-12T17:22:18Z    monitor del collegamento finito: no drop: true
2026-11-12T17:22:19Z run check del run 22:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-22.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:22:19Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:22:19Z run 22 completo.
2026-11-12T17:22:19Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 23 dalle 17:24:17Z.
2026-11-12T17:24:32Z 1. tunnel tcp:8093 presente
2026-11-12T17:24:37Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-23.link.txt
2026-11-12T17:24:38Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-23.link.txt
2026-11-12T17:24:38Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-23.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:24:39Z 3. URL aperto sul tablet: run=23, clip=pinball-bench-table.mp4
2026-11-12T17:24:39Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:24:39Z    Poi scrivi: finisci 23
2026-11-12T17:25:54Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794504350852.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794504350852.json: 1 file pulled, 0 skipped. 27.9 MB/s (1452812 bytes in 0.050s)
2026-11-12T17:25:55Z    scaricata in 2026-11-12-tab9-m9-table-23.json, SHA-256 4f92a02d40b093fc… uguale al tablet
2026-11-12T17:25:55Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-23.link.txt: no drop: true
2026-11-12T17:25:56Z    monitor del collegamento finito: no drop: true
2026-11-12T17:25:57Z run check del run 23:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-23.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:25:58Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:25:58Z run 23 completo.
2026-11-12T17:25:58Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 24 dalle 17:27:56Z.
2026-11-12T17:28:04Z 1. tunnel tcp:8093 presente
2026-11-12T17:28:08Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-24.link.txt
2026-11-12T17:28:09Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-table-24.link.txt
2026-11-12T17:28:10Z    clip pinball-bench-table.mp4 letta in 2026-11-12-tab9-m9-table-24.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T17:28:10Z 3. URL aperto sul tablet: run=24, clip=pinball-bench-table.mp4
2026-11-12T17:28:10Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T17:28:10Z    Poi scrivi: finisci 24
2026-11-12T17:29:26Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794504563345.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794504563345.json: 1 file pulled, 0 skipped. 26.2 MB/s (1465989 bytes in 0.053s)
2026-11-12T17:29:27Z    scaricata in 2026-11-12-tab9-m9-table-24.json, SHA-256 44945089d5968731… uguale al tablet
2026-11-12T17:29:27Z    clip pinball-bench-table.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-24.link.txt: no drop: true
2026-11-12T17:29:28Z    monitor del collegamento finito: no drop: true
2026-11-12T17:29:29Z run check del run 24:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-table-24.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T17:29:29Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T17:29:30Z run 24 completo.
2026-11-12T17:29:30Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 25 dalle 17:31:28Z.
2026-11-12T19:01:04Z driver M9 caricato: Tab9WEEA0001504 (Tab_9_WiFi), 32 run, uscita D:/kalwalt-github/m9-sessione-b. Comandi: pronto, inizia N, finisci N, riapri N, chiudi-tab, stato
2026-11-12T19:01:04Z sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-12-243-session.sh
2026-11-12T19:01:04Z sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-12-243-session-table.json
2026-11-12T19:01:05Z sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 D:/kalwalt-github/webarkit-m9-session-b/docs/benchmarks/2026-11-11-243-link-monitor.mjs
2026-11-12T19:01:05Z sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 D:/kalwalt-github/webarkit-m9-serve/docs/benchmarks/2026-11-11-243-run-check.mjs
2026-11-12T19:01:28Z pronto: dispositivo Tab9WEEA0001504 (Tab_9_WiFi), checkout di servizio D:/kalwalt-github/webarkit-m9-serve, uscita D:/kalwalt-github/m9-sessione-b
2026-11-12T19:01:28Z     sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 2026-11-12-243-session.sh
2026-11-12T19:01:28Z     sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 2026-11-12-243-session-table.json
2026-11-12T19:01:28Z     sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 2026-11-11-243-link-monitor.mjs
2026-11-12T19:01:28Z     sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 2026-11-11-243-run-check.mjs
2026-11-12T19:01:28Z OK  HEAD del checkout di servizio = testa del freeze 8192265
2026-11-12T19:01:28Z OK  bundle 6d07b0c2… = freeze
2026-11-12T19:01:29Z OK  git status sul pathspec del runbook: vuoto
2026-11-12T19:01:30Z OK  check:provenance, exit 0
2026-11-12T19:01:30Z OK  cache-control: no-cache, no-store, must-revalidate
2026-11-12T19:01:30Z OK  dispositivo Tab9WEEA0001504 collegato, modello Tab_9_WiFi
2026-11-12T19:01:31Z OK  tunnel tcp:8093 tcp:8093
2026-11-12T19:01:31Z NO  sul tablet ci sono già esportazioni: bench-nft-tracking-Tab-9-WiFi-1794502731231.json bench-nft-tracking-Tab-9-WiFi-1794502967105.json bench-nft-tracking-Tab-9-WiFi-1794503240335.json bench-nft-tracking-Tab-9-WiFi-1794503555438.json bench-nft-tracking-Tab-9-WiFi-1794503829589.json bench-nft-tracking-Tab-9-WiFi-1794504131055.json bench-nft-tracking-Tab-9-WiFi-1794504350852.json bench-nft-tracking-Tab-9-WiFi-1794504563345.json
2026-11-12T19:01:32Z OK  collegamento quieto da almeno 5 minuti (adb.log)
2026-11-12T19:01:37Z OK  nessuna pagina del banco aperta nel Chrome del tablet
2026-11-12T19:01:37Z OK  Chrome sul tablet: Chrome/156.0.8078.81 (fonte: DevTools /json/version, la build di chrome://version)
2026-11-12T19:01:38Z   nota: Chrome è aperto sul PC; chrome://inspect e «Discover USB devices» devono restare chiusi
2026-11-12T19:01:38Z A MANO  sul tablet: svuota i file in cache di Chrome (runbook, item 4); il driver non lo vede
2026-11-12T19:01:38Z STOP: 1 controlli non superati
2026-11-12T19:01:38Z   → Di' all'agente: "STOP pronto: 1 controlli non superati". Non spostare, rinominare o cancellare alcun file.
2026-11-12T19:04:10Z pronto: dispositivo Tab9WEEA0001504 (Tab_9_WiFi), checkout di servizio D:/kalwalt-github/webarkit-m9-serve, uscita D:/kalwalt-github/m9-sessione-b
2026-11-12T19:04:10Z     sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 2026-11-12-243-session.sh
2026-11-12T19:04:10Z     sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 2026-11-12-243-session-table.json
2026-11-12T19:04:10Z     sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 2026-11-11-243-link-monitor.mjs
2026-11-12T19:04:10Z     sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 2026-11-11-243-run-check.mjs
2026-11-12T19:04:11Z OK  HEAD del checkout di servizio = testa del freeze 8192265
2026-11-12T19:04:11Z OK  bundle 6d07b0c2… = freeze
2026-11-12T19:04:11Z OK  git status sul pathspec del runbook: vuoto
2026-11-12T19:04:12Z OK  check:provenance, exit 0
2026-11-12T19:04:12Z OK  cache-control: no-cache, no-store, must-revalidate
2026-11-12T19:04:13Z OK  dispositivo Tab9WEEA0001504 collegato, modello Tab_9_WiFi
2026-11-12T19:04:13Z OK  tunnel tcp:8093 tcp:8093
2026-11-12T19:04:13Z OK  nessun bench-nft-*.json nei Download del tablet
2026-11-12T19:04:14Z OK  collegamento quieto da almeno 5 minuti (adb.log)
2026-11-12T19:04:19Z OK  nessuna pagina del banco aperta nel Chrome del tablet
2026-11-12T19:04:19Z OK  Chrome sul tablet: Chrome/156.0.8078.81 (fonte: DevTools /json/version, la build di chrome://version)
2026-11-12T19:04:20Z   nota: Chrome è aperto sul PC; chrome://inspect e «Discover USB devices» devono restare chiusi
2026-11-12T19:04:20Z A MANO  sul tablet: svuota i file in cache di Chrome (runbook, item 4); il driver non lo vede
2026-11-12T19:04:20Z PRONTO OK
2026-11-12T19:04:32Z 1. tunnel tcp:8093 presente
2026-11-12T19:04:36Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-25.link.txt
2026-11-12T19:04:37Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-25.link.txt
2026-11-12T19:04:38Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-25.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:04:38Z 3. URL aperto sul tablet: run=25, clip=pinball-bench.mp4
2026-11-12T19:04:38Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:04:38Z    Poi scrivi: finisci 25
2026-11-12T19:06:27Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794510384810.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794510384810.json: 1 file pulled, 0 skipped. 25.6 MB/s (1313943 bytes in 0.049s)
2026-11-12T19:06:28Z    scaricata in 2026-11-12-tab9-m9-wall-25.json, SHA-256 196a03e42b4cf1a9… uguale al tablet
2026-11-12T19:06:28Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-25.link.txt: no drop: true
2026-11-12T19:06:29Z    monitor del collegamento finito: no drop: true
2026-11-12T19:06:31Z run check del run 25:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-25.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:06:31Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:06:31Z run 25 completo.
2026-11-12T19:06:31Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 26 dalle 19:08:29Z.
2026-11-12T19:08:46Z 1. tunnel tcp:8093 presente
2026-11-12T19:08:51Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-26.link.txt
2026-11-12T19:08:52Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-26.link.txt
2026-11-12T19:08:52Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-26.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:08:53Z 3. URL aperto sul tablet: run=26, clip=pinball-bench.mp4
2026-11-12T19:08:53Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:08:53Z    Poi scrivi: finisci 26
2026-11-12T19:10:27Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794510623700.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794510623700.json: 1 file pulled, 0 skipped. 22.4 MB/s (1282979 bytes in 0.055s)
2026-11-12T19:10:28Z    scaricata in 2026-11-12-tab9-m9-wall-26.json, SHA-256 39e5cf7b799bea42… uguale al tablet
2026-11-12T19:10:28Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-26.link.txt: no drop: true
2026-11-12T19:10:29Z    monitor del collegamento finito: no drop: true
2026-11-12T19:10:30Z run check del run 26:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-26.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:10:30Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:10:30Z run 26 completo.
2026-11-12T19:10:30Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 27 dalle 19:12:28Z.
2026-11-12T19:12:39Z 1. tunnel tcp:8093 presente
2026-11-12T19:12:44Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-27.link.txt
2026-11-12T19:12:45Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-27.link.txt
2026-11-12T19:12:46Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-27.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:12:46Z 3. URL aperto sul tablet: run=27, clip=pinball-bench.mp4
2026-11-12T19:12:46Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:12:46Z    Poi scrivi: finisci 27
2026-11-12T19:14:31Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794510858745.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794510858745.json: 1 file pulled, 0 skipped. 6.4 MB/s (80285 bytes in 0.012s)
2026-11-12T19:14:32Z    scaricata in 2026-11-12-tab9-m9-wall-27.json, SHA-256 26cfd5800d830fbc… uguale al tablet
2026-11-12T19:14:32Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-27.link.txt: no drop: true
2026-11-12T19:14:51Z    monitor del collegamento finito: no drop: true
2026-11-12T19:14:52Z run check del run 27:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-27.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 FAIL
  - run.endedBy is "stopped", not "done"
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 FAIL
  - protocol.sessionRun false, not true
  - protocol.gaps ["run.endedBy stopped: a session run ends itself on the first frame after its counted loops (done)","trackTimeShare is not complete: a tracking run's lock is read over its counted loops whole"], not none
V7 PASS
V8 FAIL
  - stall-check.mjs exits 1: FAIL coverage: no frame of loop 5, which closes loop 4; FAIL coverage: loop 1: no frame; FAIL coverage: loop 2: no frame; FAIL coverage: loop 3: no frame; FAIL coverage: loop 4: no frame
run check: FAIL (V1, V6, V8)
2026-11-12T19:14:52Z 6. run check: V1 FAIL V2 PASS V3 PASS V4 PASS V5 PASS V6 FAIL V7 PASS V8 FAIL exit 1
2026-11-12T19:14:53Z STOP: il run 27 non supera il run check (exit 1); vale la regola di arresto
2026-11-12T19:14:53Z   → Di' all'agente: "STOP finisci 27: il run 27 non supera il run check (exit 1); vale la regola di arresto". Non spostare, rinominare o cancellare alcun file.
2026-11-12T19:17:09Z scheda 1629: http://localhost:8093/examples/bench-nft.html?mode=tracking&target=wnft&detection=sync&clip=pinball-bench.mp4&loops=4&window=2000&seed=1&run=27
2026-11-12T19:17:17Z chiesta la chiusura della scheda 1629
2026-11-12T19:17:18Z nessuna pagina del banco resta aperta
2026-11-12T19:17:28Z 1. tunnel tcp:8093 presente
2026-11-12T19:17:33Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-27.link.txt
2026-11-12T19:17:34Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-27.link.txt
2026-11-12T19:17:35Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-27.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:17:35Z 3. URL aperto sul tablet: run=27, clip=pinball-bench.mp4
2026-11-12T19:17:35Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:17:35Z    Poi scrivi: finisci 27
2026-11-12T19:19:17Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794511154932.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794511154932.json: 1 file pulled, 0 skipped. 24.7 MB/s (1292181 bytes in 0.050s)
2026-11-12T19:19:18Z    scaricata in 2026-11-12-tab9-m9-wall-27.json, SHA-256 a69765c5a40ab9a4… uguale al tablet
2026-11-12T19:19:18Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-27.link.txt: no drop: true
2026-11-12T19:19:19Z    monitor del collegamento finito: no drop: true
2026-11-12T19:19:20Z run check del run 27:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-27.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:19:20Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:19:20Z run 27 completo.
2026-11-12T19:19:20Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 28 dalle 19:21:19Z.
2026-11-12T19:22:17Z 1. tunnel tcp:8093 presente
2026-11-12T19:22:21Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-28.link.txt
2026-11-12T19:22:22Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-28.link.txt
2026-11-12T19:22:23Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-28.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:22:23Z 3. URL aperto sul tablet: run=28, clip=pinball-bench.mp4
2026-11-12T19:22:23Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:22:23Z    Poi scrivi: finisci 28
2026-11-12T19:23:54Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794511431534.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794511431534.json: 1 file pulled, 0 skipped. 28.9 MB/s (1313665 bytes in 0.043s)
2026-11-12T19:23:55Z    scaricata in 2026-11-12-tab9-m9-wall-28.json, SHA-256 7799641beb48c4bb… uguale al tablet
2026-11-12T19:23:55Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-28.link.txt: no drop: true
2026-11-12T19:23:56Z    monitor del collegamento finito: no drop: true
2026-11-12T19:23:57Z run check del run 28:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-28.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:23:57Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:23:57Z run 28 completo.
2026-11-12T19:23:57Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 29 dalle 19:25:56Z.
2026-11-12T19:26:22Z 1. tunnel tcp:8093 presente
2026-11-12T19:26:40Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-29.link.txt
2026-11-12T19:26:42Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-29.link.txt
2026-11-12T19:26:42Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-29.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:26:42Z 3. URL aperto sul tablet: run=29, clip=pinball-bench.mp4
2026-11-12T19:26:42Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:26:42Z    Poi scrivi: finisci 29
2026-11-12T19:28:20Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794511692033.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794511692033.json: 1 file pulled, 0 skipped. 29.2 MB/s (1332418 bytes in 0.043s)
2026-11-12T19:28:21Z    scaricata in 2026-11-12-tab9-m9-wall-29.json, SHA-256 398edde13bb7cc15… uguale al tablet
2026-11-12T19:28:21Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-29.link.txt: no drop: true
2026-11-12T19:28:22Z    monitor del collegamento finito: no drop: true
2026-11-12T19:28:23Z run check del run 29:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-29.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:28:23Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:28:23Z run 29 completo.
2026-11-12T19:28:23Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 30 dalle 19:30:21Z.
2026-11-12T19:30:17Z STOP: il run 29 è finito 116 s fa; attendi ancora 4 s (passo 7)
2026-11-12T19:30:17Z   Poi: inizia 30
2026-11-12T19:30:17Z   → Di' all'agente: "STOP inizia 30: il run 29 è finito 116 s fa; attendi ancora 4 s (passo 7)". Non spostare, rinominare o cancellare alcun file.
2026-11-12T19:30:36Z 1. tunnel tcp:8093 presente
2026-11-12T19:30:41Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-30.link.txt
2026-11-12T19:30:42Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-30.link.txt
2026-11-12T19:30:43Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-30.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:30:43Z 3. URL aperto sul tablet: run=30, clip=pinball-bench.mp4
2026-11-12T19:30:43Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:30:43Z    Poi scrivi: finisci 30
2026-11-12T19:32:14Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794511931872.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794511931872.json: 1 file pulled, 0 skipped. 25.9 MB/s (1279240 bytes in 0.047s)
2026-11-12T19:32:15Z    scaricata in 2026-11-12-tab9-m9-wall-30.json, SHA-256 d07c0af09fb524a2… uguale al tablet
2026-11-12T19:32:15Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-30.link.txt: no drop: true
2026-11-12T19:32:16Z    monitor del collegamento finito: no drop: true
2026-11-12T19:32:17Z run check del run 30:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-30.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:32:17Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:32:17Z run 30 completo.
2026-11-12T19:32:17Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 31 dalle 19:34:16Z.
2026-11-12T19:34:22Z 1. tunnel tcp:8093 presente
2026-11-12T19:34:27Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-31.link.txt
2026-11-12T19:34:28Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-31.link.txt
2026-11-12T19:34:29Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-31.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:34:29Z 3. URL aperto sul tablet: run=31, clip=pinball-bench.mp4
2026-11-12T19:34:29Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:34:29Z    Poi scrivi: finisci 31
2026-11-12T19:35:59Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794512156470.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794512156470.json: 1 file pulled, 0 skipped. 26.6 MB/s (1326262 bytes in 0.047s)
2026-11-12T19:35:59Z    scaricata in 2026-11-12-tab9-m9-wall-31.json, SHA-256 30b64633b0103b43… uguale al tablet
2026-11-12T19:36:00Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-31.link.txt: no drop: true
2026-11-12T19:36:01Z    monitor del collegamento finito: no drop: true
2026-11-12T19:36:02Z run check del run 31:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-31.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:36:02Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:36:02Z run 31 completo.
2026-11-12T19:36:02Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 32 dalle 19:38:00Z.
2026-11-12T19:38:41Z 1. tunnel tcp:8093 presente
2026-11-12T19:38:45Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-32.link.txt
2026-11-12T19:38:46Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-wall-32.link.txt
2026-11-12T19:38:47Z    clip pinball-bench.mp4 letta in 2026-11-12-tab9-m9-wall-32.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T19:38:47Z 3. URL aperto sul tablet: run=32, clip=pinball-bench.mp4
2026-11-12T19:38:47Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T19:38:47Z    Poi scrivi: finisci 32
2026-11-12T19:40:24Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794512414318.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794512414318.json: 1 file pulled, 0 skipped. 30.1 MB/s (1307980 bytes in 0.041s)
2026-11-12T19:40:25Z    scaricata in 2026-11-12-tab9-m9-wall-32.json, SHA-256 8f1b7761703abc80… uguale al tablet
2026-11-12T19:40:25Z    clip pinball-bench.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-32.link.txt: no drop: true
2026-11-12T19:40:26Z    monitor del collegamento finito: no drop: true
2026-11-12T19:40:27Z run check del run 32:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-b/2026-11-12-tab9-m9-wall-32.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T19:40:27Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T19:40:27Z run 32 completo.
2026-11-12T19:40:27Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab). Fine della sessione B.
```
