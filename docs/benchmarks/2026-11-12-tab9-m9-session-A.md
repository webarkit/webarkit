# #243, M9's session A on the Tab 9: runs 1 to 16, static and cross (2026-11-12)

The first counted session of M9's campaign, under
[the registration](./2026-11-10-243-registration.md) as amended by
[its addendum](./2026-11-11-243-registration-addendum.md) and
[its second addendum](./2026-11-12-243-registration-addendum-2.md), on the freeze recorded in
[the pre-flight's record](./2026-11-11-243-preflight.md). Session A is the static block (runs 1 to
8, `pinball-static.mp4`) and the cross block (runs 9 to 16, `pinball-tilt-cross.mp4`). The table and
wall blocks are session B's.

**Outcome.** All sixteen runs passed V1 to V8 at once, and again after the session; **no run was
re-run** and no Start was refused. The serving checkout passed `check:provenance` before the first run
and after the last. No figure was read before its block's eighth run had passed its checks. Every V11
check passed on all sixteen exports. By the registration's outcome rules, P1, P7, P3, P4, P5 and P6
are each **held** (below). One run's export carries a mistyped device label (run 12,
`Tab_9_WiFii`), which no validity rule reads (difference 1).

## The freeze, checked

The freeze is the pre-flight record's, with the link monitor's one change admitted by the maintainer's
ruling of 2026-11-12 (the second addendum, entry 2).

| What | Value | Checked |
| --- | --- | --- |
| Serving checkout | `D:/kalwalt-github/webarkit-m9-serve`, worktree detached at `8192265bd462f0667e275ec9297fe2890a907935` | `git rev-parse HEAD` while the session was prepared, by `pronto` at 14:37:49Z, and after the session at 15:50:11Z |
| Pathspec status | the runbook's `git status --porcelain --untracked-files=all -- …` | empty before (`pronto`) and after the session; the two empty untracked files `check:provenance` and `node` at the checkout's root, from the pre-flight's incident 2, are still there, outside the pathspec, and were left in place |
| `check:provenance` | `node scripts/provenance-preflight.mjs` in the serving checkout | exit 0 at 14:37:51Z (`pronto`) and at 15:50:11Z: "describes this tree: HEAD 8192265…, clean, every hash the file's" |
| Manifest | `examples/dist/provenance.json`, `a5d1d8b8b676ce60880d0eb3f6996a6aeb9dc22b90c5fd2ec4827587b9fd79af` | after the session |
| Bundle | `examples/dist/webarkit-packages.mjs`, `6d07b0c25475830458b68c6ef53c221fd4a3848c00bad1a62adbafcc95b074f2` | `pronto` and after the session |
| Target | `examples/targets/pinball.wnft`, `9e8eb4863b58b635ad7fc2bd9f937d924b369a9002580e52a35ef0db7b0d5282` | after the session; every export's `target.sha256` (V4) |
| Clips | `pinball-static.mp4` `978cb9f26c465d49b8714eb050eccb6b5bdd494883af6606c3d6293d31b276b6`, `pinball-tilt-cross.mp4` `3a332a308f6fa36d6b72508892f737700fbb55fb4efb651f1e9fefafc695308e` | twice per run into each `.clip.txt` (V4), and after the session |
| Driver | `2026-11-12-243-session.sh`, `19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576` | the session log, at sourcing and at `pronto` |
| Session table | `2026-11-12-243-session-table.json`, `0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274` | the same |
| Link monitor | `2026-11-11-243-link-monitor.mjs`, `90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6` (the second addendum's) | the same |
| Run check | `2026-11-11-243-run-check.mjs`, `b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11`, the serving checkout's | the same |
| Analysis | `2026-11-11-243-analysis.mjs`, `a802acde66a65e8e98d2aa41b3c7d5e47cd7b3891d9c0df5602c20481d618b90`, identical in the serving checkout and the committing worktree | before the analysis |
| Chrome on the tablet | **156.0.8078.81**, read by `pronto` at 14:38:03Z through the DevTools endpoint (`/json/version`, its `Browser` field: `Chrome/156.0.8078.81`), the source the second addendum names; the pre-flight's build. Every export's `userAgent` reads `Chrome/156.0.0.0` | before run 1 |
| Node | v24.21.0, the pin | in both checkouts |

**The serving machine.** The maintainer's notebook `nitro-walt`, Windows 11 Home 10.0.26300, Git Bash
5.3.15, as in the pre-flight; no build was made there since the freeze's. The server:
`npx http-server -p 8093 -s -c-1` at the serving checkout's root, http-server 14.1.1, sending
`cache-control: no-cache, no-store, must-revalidate` (read at 14:35:01Z and by `pronto`). adb 1.0.41,
37.0.0-14910828. The tunnel `tcp:8093 tcp:8093` was set before the session. **The committing
worktree** is `D:/kalwalt-github/webarkit-m9-session-a`, branch `docs/m9-session-a` from `origin/dev`
at `351bdca105f91b5d808689dc980a6e64d2c5989e` (the merge of #254); the driver was sourced from it,
with the output folder `D:/kalwalt-github/m9-sessione-a`, outside every checkout and empty when the
session was prepared.

## Before the session

All by `pronto`, 14:37:48Z to 14:38:04Z, `PRONTO OK` (the session log, below):

1. the bundle and `check:provenance`, exit 0;
2. the head and the runbook's pathspec status, empty;
3. `no-store`;
4. no `bench-nft-*.json` in the tablet's download folder; no bench page open in the tablet's Chrome;
   the Chrome build, 156.0.8078.81. **Chrome's cached files:** `pronto` prints the clearing as a step
   by hand ("A MANO"), since it cannot see it; the maintainer's checklist asked for it before run 1,
   and no record of it was kept (difference 2);
5. the link quiet: adb's log (`C:\Users\perda\AppData\Local\Temp\adb.log`, 2,002 bytes) last named the
   device in a `connection terminated` line at 13:41:39Z, 56 minutes before `pronto`.

Before `pronto`, while the session was prepared, the driver was sourced once in a scratch shell and
`stato` run (14:35:27Z to 14:35:33Z), a dry check; its lines are the session log's first seven. It
began no run and wrote nothing but the log.

## The runs, in order

Times are UTC, on 2026-11-12. "Monitor" is the link monitor's `## begin` and `## end`; "page" is the
export's `run.startedAtIso` and `run.endedAtIso`; "clip readings" are the two lines of `.clip.txt`.
Every run ended by `done`, with `failure: null` and `lostVisibility: false`, at seed 1, policy
`frame`, `metricsVersion` 2, `loops` 4 from loop 1, at the freeze's head and bundle. Every link log
reads `no drop: true`, with `transport_id` 3 at both ends and the mapping present at both, and
`adb.log` at 2,002 bytes at begin and at end. Every pull's SHA-256 equals the tablet file's, compared
by `finisci`. Every `.url.txt` is the pinned string for its run (V3).

| # | Export (`2026-11-12-tab9-m9-…`) | Monitor | Page | Clip readings | `run.order` | Frames = ticks | `deviceLabel` | Export SHA-256 | Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `static-1` | 14:39:43.076–14:41:50.102 | 14:40:19.864–14:41:21.131 | 14:39:43, 14:41:49 | 1 | 1,131 | `Tab_9_WiFi` | `651af49691f7cde1…` | 2,589,422 |
| 2 | `static-2` | 14:44:46.017–14:46:57.690 | 14:45:25.319–14:46:26.553 | 14:44:46, 14:46:56 | 2 | 1,212 | `Tab_9_WiFi` | `ddba2a03d72d2eb3…` | 2,771,751 |
| 3 | `static-3` | 14:49:16.611–14:50:58.431 | 14:49:44.120–14:50:45.381 | 14:49:16, 14:50:57 | 3 | 1,204 | `Tab_9_WiFi` | `989647d23e53b61b…` | 2,752,392 |
| 4 | `static-4` | 14:53:53.563–14:55:35.962 | 14:54:17.402–14:55:18.698 | 14:53:53, 14:55:35 | 4 | 1,199 | `Tab_9_WiFi` | `f4a0e437ae88b91d…` | 2,742,051 |
| 5 | `static-5` | 14:58:13.250–15:00:16.971 | 14:58:41.302–14:59:42.516 | 14:58:13, 15:00:16 | 5 | 1,226 | `Tab_9_WiFi` | `3f0ff8ea5db7038d…` | 2,801,815 |
| 6 | `static-6` | 15:02:34.717–15:04:18.008 | 15:03:01.099–15:04:02.337 | 15:02:35, 15:04:17 | 6 | 1,215 | `Tab_9_WiFi` | `7e6155f048724630…` | 2,778,623 |
| 7 | `static-7` | 15:06:39.537–15:08:21.107 | 15:07:03.888–15:08:05.094 | 15:06:39, 15:08:18 | 7 | 1,223 | `Tab_9_WiFi` | `0519598588593213…` | 2,797,084 |
| 8 | `static-8` | 15:10:39.164–15:12:24.415 | 15:11:09.124–15:12:10.409 | 15:10:39, 15:12:22 | 8 | 1,210 | `Tab_9_WiFi` | `e4036454dab5d923…` | 2,766,519 |
| 9 | `cross-9` | 15:15:49.681–15:17:41.875 | 15:16:13.726–15:17:24.208 | 15:15:50, 15:17:40 | 9 | 1,276 | `Tab_9_WiFi` | `1eb683fcf053e8a6…` | 2,920,047 |
| 10 | `cross-10` | 15:20:13.948–15:22:01.794 | 15:20:38.214–15:21:48.761 | 15:20:14, 15:22:00 | 10 | 1,322 | `Tab_9_WiFi` | `b1aefbb518a1c612…` | 3,023,599 |
| 11 | `cross-11` | 15:24:18.152–15:26:09.420 | 15:24:48.315–15:25:58.838 | 15:24:18, 15:26:08 | 11 | 1,323 | `Tab_9_WiFi` | `05b61f7d7581cd6e…` | 3,024,235 |
| 12 | `cross-12` | 15:28:56.568–15:30:56.393 | 15:29:23.783–15:30:34.312 | 15:28:56, 15:30:55 | 12 | 1,322 | **`Tab_9_WiFii`** | `99117ab34a64d717…` | 3,021,821 |
| 13 | `cross-13` | 15:33:19.321–15:35:11.049 | 15:33:41.713–15:34:52.210 | 15:33:19, 15:35:10 | 13 | 1,293 | `Tab_9_WiFi` | `f235cd454bf919ff…` | 2,958,033 |
| 14 | `cross-14` | 15:37:28.040–15:39:29.774 | 15:38:07.488–15:39:18.135 | 15:37:28, 15:39:29 | 14 | 1,320 | `Tab_9_WiFi` | `943544fb01add43b…` | 3,019,073 |
| 15 | `cross-15` | 15:41:44.199–15:44:30.175 | 15:42:24.008–15:43:34.530 | 15:41:44, 15:44:29 | 15 | 1,241 | `Tab_9_WiFi` | `e3c4814366bf338d…` | 2,841,267 |
| 16 | `cross-16` | 15:46:45.843–15:48:38.750 | 15:47:15.152–15:48:25.769 | 15:46:46, 15:48:37 | 16 | 1,249 | `Tab_9_WiFi` | `e45ccae3c9b777e9…` | 2,859,197 |

The exports' full SHA-256s, of the pulled files and of the committed blobs alike:

- `static-1`: `651af49691f7cde11e3d79cb903e22b3be2e0d2e02bc21075fc254b1affa6774`
- `static-2`: `ddba2a03d72d2eb3a73df211090e136cebf63fe8855fd7cc4c4783e65553c324`
- `static-3`: `989647d23e53b61ba9560dbf9fdd880ad523796b7cb71a17c30d58788f67f7e5`
- `static-4`: `f4a0e437ae88b91d2a2893da2d51d0036c88838a20006eef80a82367221699ee`
- `static-5`: `3f0ff8ea5db7038d89cac5ca4aa8ddc2ac28a57e376d3c81509a05e69b9d9a91`
- `static-6`: `7e6155f048724630da24e651713acc407be091c152ff62bcf4ad251aec76cfe3`
- `static-7`: `051959858859321343a9116024e7118fbac7a038c845f3f40e252b511fd55aff`
- `static-8`: `e4036454dab5d92324bef29bcd02171e848c8c6f3f34be12cccddec0a81d1210`
- `cross-9`: `1eb683fcf053e8a6ff5d32712958f0a528cda987f4c848647ec5d5ffa7b0a58c`
- `cross-10`: `b1aefbb518a1c6129762f8a013bb79dc5ef6827aaef1b313281dff2475853bbf`
- `cross-11`: `05b61f7d7581cd6e70879d2de6de6e447d25d4f5f9d37da7b2378af0140ede04`
- `cross-12`: `99117ab34a64d71722cf4376ab17e06fc76cdc8609ea8c450a899f326a428082`
- `cross-13`: `f235cd454bf919ff0d0a804d4d984e67f796cd0794c9ba6b51322e1b84e3e020`
- `cross-14`: `943544fb01add43bb445c79a383150a54faec70ee6b4c1ddc9c06d78e4c31385`
- `cross-15`: `e3c4814366bf338db92e4726b5599193d4de8e556cb2928a18443b4531b20c52`
- `cross-16`: `e45ccae3c9b777e94096c8ac01e70e7c887d86d1a2170c76a8123cb378f33901`

**Between runs.** From one monitor's end to the next one's begin, at least 134.4 s passed (runs 14
to 15); the gaps were 175.9, 138.9, 175.1, 157.3, 137.7, 141.5, 138.1, 205.3, 152.1, 136.4, 167.1,
142.9, 137.0, 134.4 and 135.7 s before runs 2 to 16. Each `inizia` found no bench page open in the
tablet's Chrome, so each run's tab had been closed (step 7). Run 1 began 1 min 33 s after
`PRONTO OK`, within the hour the driver allows. The session ran in one sitting.

**After the session.** adb's log still held 2,002 bytes at 15:50Z: no `connection terminated` line
was written during the session.

## The checks

### V1 to V8, every run

**PASS on all sixteen**, by the run check at the freeze head with `--form counted`, each as its run
ended (`finisci`, step 6, in the session log) and all sixteen again after the session, on the
exports in the output folder before they were copied. The second pass's output, abridged to its
verdict lines (identical for each export):

```
# 2026-11-11-243-run-check.mjs: …/2026-11-12-tab9-m9-<static|cross>-<n>.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
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

Sixteen exports, one per position 1 to 16, each with its `.url.txt`, `.clip.txt` and `.link.txt`;
each `run.order` equals its `<n>`; each `bundledClip` is its name's (`pinball-static.mp4` for
`static-1` to `static-8`, `pinball-tilt-cross.mp4` for `cross-9` to `cross-16`); each
`provenance.manifest.head` is `8192265bd462f0667e275ec9297fe2890a907935`. The output folder held no
other export. The 64 files were copied unchanged into `docs/benchmarks/`; each copy's SHA-256 equals
its source's, and each committed blob's equals the pulled file's.

### V9 and V10, readings, not gates

By the analysis (below). V10: `run.lostVisibility` false on all sixteen.

| Block | `acquire` p50 over counted loops, ms, runs in order | `trackStepMs` p50, ms, runs in order | Last against first | Flagged (M3's bounds, 1.9 ms and 6.6%, quoted as M3's) |
| --- | --- | --- | --- | --- |
| static, runs 1–8 | 28.1, 27.6, 27.7, 28.3, 27.9, 27.8, 27.5, 27.8 | 9.3, 9.3, 9.3, 9.4, 9.5, 9.3, 9.3, 9.4 | `acquire` −0.3 ms; `trackStepMs` +0.1 ms (1.1%) | no |
| cross, runs 9–16 | 28.1, 27.9, 28.0, 27.8, 27.9, 27.8, 28.7, 28.5 | 10.6, 10.6, 10.6, 10.6, 10.7, 10.6, 10.8, 10.7 | `acquire` +0.4 ms; `trackStepMs` +0.1 ms (0.9%) | no |

## The analysis

Run after both blocks' eighth runs had passed their checks (run 8 at 15:12:26Z, run 16 at
15:48:40Z), from 15:53:05Z to 15:54:10Z: the frozen script, `--block`, from the serving checkout, so
that it imports the freeze's built modules, on the committed copies in the committing worktree:

```
node docs/benchmarks/2026-11-11-243-analysis.mjs --block <the committing worktree>/docs/benchmarks/2026-11-12-tab9-m9-static-{1..8}.json
node docs/benchmarks/2026-11-11-243-analysis.mjs --block <the committing worktree>/docs/benchmarks/2026-11-12-tab9-m9-cross-{9..16}.json
```

Both exited 0 with an empty stderr. Their stdout, in full, is committed beside this record, and is
the same, byte for byte, run on the exports in the output folder:

- static: [`2026-11-12-243-session-A-analysis-static.txt`](./2026-11-12-243-session-A-analysis-static.txt),
  454 lines, SHA-256 `a98a0c11fb0fe107049387e58bcd89e8cc1570580a0e4a89e22cba5f44dc3d7d`;
- cross: [`2026-11-12-243-session-A-analysis-cross.txt`](./2026-11-12-243-session-A-analysis-cross.txt),
  451 lines, SHA-256 `8cbc43672ce11af2dd2a8d376102c2a1e9ff21ed1b8ef2f94b1cafc791efc6e0`.

What follows is read from those two files; every figure is theirs, rounded here to four decimals,
and in full there. `K` assumed: `intrinsics(203, 360)`, 60° of horizontal field, for every arm and
figure (the registration, "K assumed, 2026-11-10"): every tilt, selection and switch below is the
assumed camera's.

### V11, every export

On all sixteen: the fields each arm needs present, the filter off, `metricsVersion` 2; `K` equal to
`intrinsics(203, 360)` element by element; every `H` finite on an `ok` frame; `runSummary.poseJitterPx`
recomputed over the counted loops equal bit for bit; route (b)'s reprojection within 1e-9 px on every
frame with `poseCorners`; CF's `good` on every `ok` frame; the tilt computed on every `ok` frame. **No
fatal check fired.** **Route (b)'s null-corners frames: 0 in every run** (`ok` TRACK frames with null
`poseCorners`), so the filter was run one way and P7 read once, as the registration provides for a
run without one.

Counted frames: static 957 to 1,003 a run, all TRACK (no DETECT, no LOST); cross 1,040 to 1,073 a
run, 4 DETECT each, no LOST. Every run within `?window=2000`, frames equal to ticks, 5 wraps, no step
back in `timestampMs`. No TRACK frame on 8 or 9 inliers carries a reading (the smallest inlier count
beside a reading is 21).

### The frame-fidelity share, beside every spread

**D3, measured in the pre-flight and ruled negligible for this campaign by the maintainer on
2026-11-11:** 25 of 1,145 pairs differ (2.18%, a lower bound on the grab's infidelity, read under
detection-only load on the static clip); 13 of 535 pairs within a run and 12 of 610 across the two
runs; nine media times have a differing pair, 1.533333, 3.5, 5.0, 6.8, 7.333333, 9.2, 10.2, 10.666667
and 12.133333 s, the clip's final frame. It reaches only the spread between runs. It stands beside
every s_d and every arm's s below, and is repeated in each criterion's row.

### The criteria

Each reading is d = J(Y) − J(X) per run on the selection; over the 8 runs, d̄, s_d, the interval
d̄ ± 2.3646 × s_d ÷ √8 and the count of the predicted sign; then the same without the most
influential media time. Held needs the interval wholly on the predicted side and at least 7 of 8 of
the predicted sign, both with and without that media time. The replay figure from Stage 1 stands
beside each as the registration's basis, a reading, not a threshold.

| | Reading | With every media time: d̄ [interval], s_d, sign count | The most influential media time | Without it: d̄ [interval], s_d, sign count | Basis (the registration) | D3 beside the spread | Reading's outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **P1** | CF − IPPE, static, below 10°, the selection | −0.1791 [−0.1830, −0.1752], 0.0046, 8 of 8 | 0.000000 s, 32 occurrences, TRACK, 21 to 27 inliers, tilt 2.82° to 2.90° | −0.1735 [−0.1768, −0.1701], 0.0040, 8 of 8 | −0.1498; −0.1421 without 7.666667 s | 2.18% (25 of 1,145) | held |
| | the selection's TRACK frames (every counted static frame is TRACK) | the same | the same | the same | | 2.18% | held |
| **P7** | FILTER − IPPE, static, route (b), one way, the whole clip | −0.0683 [−0.0700, −0.0665], 0.0021, 8 of 8 | 0.000000 s, 32 occurrences, as P1's | −0.0857 [−0.0871, −0.0843], 0.0017, 8 of 8 | −0.0708; −0.0923 without 0.000 s | 2.18% | held |
| | the same, without the first second after each wrap | −0.0943 [−0.0955, −0.0931], 0.0014, 8 of 8 | 2.000000 s, 25 occurrences, TRACK, 39 inliers, tilt 2.85° to 2.87° | −0.0987 [−0.1002, −0.0972], 0.0018, 8 of 8 | | 2.18% | held |
| **P3** | CF − IPPE, cross, below 10°, the selection | −0.1232 [−0.1254, −0.1210], 0.0027, 8 of 8 | 0.000000 s, 29 occurrences, DETECT, 40 inliers, tilt 5.53° | −0.1099 [−0.1123, −0.1075], 0.0029, 8 of 8 | −0.0944 / −0.0896 / −0.0888, borrowed acquisition; −0.0861 / −0.0833 / −0.0786 without 0.166611 s | 2.18% | held |
| | the selection's TRACK frames | −0.1105 [−0.1131, −0.1079], 0.0031, 8 of 8 | 4.331967 s, 22 occurrences, TRACK, 34 to 35 inliers, tilt 3.62° to 3.67° | −0.1144 [−0.1172, −0.1117], 0.0033, 8 of 8 | | 2.18% | held |
| **P4** | GUARD − IPPE, cross, the whole clip, the selection | +0.0923 [+0.0885, +0.0961], 0.0046, 8 of 8 | 8.130811 s, 24 occurrences, TRACK, 38 inliers, tilt 9.90° to 9.96° | +0.0688 [+0.0623, +0.0754], 0.0078, 8 of 8 | +0.1283 / +0.1315 / +0.1328, borrowed; +0.0931 / +0.0963 / +0.0975 without 8.330744 s | 2.18% | held |
| | its TRACK frames, beside it | +0.1098 [+0.1053, +0.1142], 0.0054, 8 of 8 | 8.130811 s, as above | +0.0857 [+0.0780, +0.0934], 0.0092, 8 of 8 | | 2.18% | held |
| **P5** | GUARD − CF, cross, the whole clip, the selection | +0.1793 [+0.1750, +0.1835], 0.0051, 8 of 8 | 8.130811 s, as P4's | +0.1559 [+0.1483, +0.1635], 0.0091, 8 of 8 | +0.1892 / +0.1903 / +0.1906, borrowed; +0.1544 / +0.1554 / +0.1557 without 8.330744 s | 2.18% | held |
| | its TRACK frames, beside it | +0.1867 [+0.1822, +0.1912], 0.0053, 8 of 8 | 8.130811 s, as above | +0.1627 [+0.1546, +0.1707], 0.0096, 8 of 8 | | 2.18% | held |

**Each arm's spread over the runs,** s [its 95% interval, s × [0.661, 2.035]], with D3's 2.18% beside
each (the analysis prints them per reading, X then Y):

- P1, the selection and its TRACK frames: IPPE 0.0042 [0.0028, 0.0085]; CF 0.0008 [0.0005, 0.0016];
- P7, the whole clip: IPPE 0.0042 [0.0028, 0.0085]; FILTER 0.0034 [0.0022, 0.0069]; without the
  wraps' first second: IPPE 0.0032 [0.0021, 0.0064]; FILTER 0.0034 [0.0022, 0.0069];
- P3, the selection: IPPE 0.0046 [0.0030, 0.0093]; CF 0.0031 [0.0020, 0.0063]; its TRACK frames:
  IPPE 0.0028 [0.0019, 0.0058]; CF 0.0016 [0.0011, 0.0033];
- P4, the selection: IPPE 0.0036 [0.0024, 0.0074]; GUARD 0.0037 [0.0024, 0.0075]; its TRACK frames:
  IPPE 0.0035 [0.0023, 0.0070]; GUARD 0.0035 [0.0023, 0.0072];
- P5, the selection: CF 0.0035 [0.0023, 0.0072]; GUARD 0.0037 [0.0024, 0.0075]; its TRACK frames:
  CF 0.0035 [0.0023, 0.0072]; GUARD 0.0035 [0.0023, 0.0072].

**P6, the guard's switches in the footage, cross.** In every one of the 32 counted loops (8 runs × 4)
exactly one switch, inside [7.797, 8.831] s: at 8.197456 s in 23 loops, 8.230778 s in 8 and
8.164133 s in 1, each on a TRACK frame on 38 or 39 inliers, the tilt crossing from 9.90°–9.96° to
10.06°–10.12°. No run has a loop with three or more switches. Switches at a wrap, counted apart: 3 in
every run. Pairs skipped for want of a tilt or an arm's corners: 0. The registration's basis: one per
pass at 8.331 s in all 8 seeds, borrowed; 3 a run at the wrap, apart. D3 beside it: 2.18%.

**The registered outcomes:**

| Criterion | Clip | Outcome | By the registration's rule |
| --- | --- | --- | --- |
| P1 | static | **held** | held on the selection with and without 0.000000 s (the TRACK frames, the same frames, beside it) |
| P7 | static | **held** | both readings held, the whole clip and without the wraps' first second, each with and without its most influential media time; one way, no null-corners frame |
| P3 | cross | **held** | held on the selection and on its TRACK frames, each with and without its media time ("held only if it holds on both") |
| P4 | cross | **held** | held on the selection with and without 8.130811 s (the TRACK frames, also held, beside it) |
| P5 | cross | **held** | held on the selection with and without 8.130811 s (the TRACK frames, also held, beside it) |
| P6 | cross | **held** | every one of the 32 counted loops has exactly one switch in the footage, inside [7.797, 8.831] s |

P2 (table) and the wall clip's descriptive reading are session B's.

### Descriptive readings, never criteria

Labelled descriptive by the registration; no direction is claimed from them.

- **The tilt bands** (Stage 2's Tilt row, the first addendum's entry 1), per run, in the two output
  files' first tables. Static: every posed counted frame in 1–3° (928 to 972 frames a run) or 3–5° (29
  to 37); none at 10° or above. Cross: frames in 3–5°, 5–7°, 7–10° and 10–15°, none at 15° or above.
  The CF − IPPE jitter difference is printed for the bands below 10° only.
- **Above 10°: the corner distance, CF to IPPE,** on cross's 10–15° band: 6.0705 to 6.0933 px a run,
  over 423 to 432 frames. The bands from 15° up hold no frame.
- **FILTER − IPPE's corner distance,** static, the whole clip, outside the counted loops nulled:
  0.1599 to 0.1624 px a run, over 957 to 1,003 frames.
- **Each arm's `poseSpreadPx`** over the counted loops, per run: static IPPE 0.9578 to 0.9772, CF
  0.8814 to 0.8957, GUARD equal to CF in every run, FILTER 0.9177 to 0.9373; cross IPPE 18.8409 to
  19.0153, CF 18.4749 to 18.6446, GUARD 18.7896 to 18.9646.

## Incidents

1. **`inizia N`, 14:39:23Z.** Between `PRONTO OK` and run 1, the letter `N` was typed in place of a
   run number. The driver refused at once ("STOP: 'N' non è un numero di run") before any check,
   reading or command: it began no monitor, opened no URL and wrote no file but the log's three lines.
   It is not a run and not a refused Start. Run 1 began fourteen seconds later with `inizia 1`.

There was no other incident: no `STOP`, no refused Start, no USB drop, no repair and no file moved,
renamed or deleted, in the output folder or on the tablet.

## Differences from the runbook

1. **Run 12's device label** reads `Tab_9_WiFii` in its export (`deviceLabel`), and in the tablet's
   file name (`bench-nft-tracking-Tab-9-WiFii-1794497451299.json`), against step 4's `Tab_9_WiFi`; a
   typo at the tablet. No validity rule reads the label (V1 to V8 passed, and V11 and the analysis do
   not read it), so the run is counted as it stands by the stopping rules, which re-run only a run
   that fails a validity rule. The export is committed unchanged.
2. **Chrome's cached files** ("Before each session", item 4): their clearing is the operator's, at
   the tablet, which `pronto` cannot see; no record of it was kept.
3. **The analysis ran from the serving checkout,** on the copies in the committing worktree, so that
   it imported the freeze's built `dist/` (the committing worktree had no build then). It is the same
   script, by its hash, and its stdout is the same on the output folder's exports.

The runbook's commands before the session and for each run were carried out by the driver, as the
second addendum admits; that is not counted as a difference.

## Storage

Plain JSON, by the maintainer's ruling of 2026-11-10. The sixteen exports are 45,666,929 bytes on
disk, their 48 `.txt` files the rest of the 64. **Stored, by the README's command,** in a throwaway
bare clone repacked at git's default compression
(`git -c core.compression=-1 -c pack.compression=-1 repack -a -d -F`), since the machine's global
`core.compression` is 0: **15.05 MB** (15,053,628 bytes) at the exports' commit `03ac3dc`, against
8.41 MB (8,413,885 bytes) at `351bdca`, so the exports add **6.64 MB** (6,639,743 bytes), 0.39 to
0.44 MB an export. The pull request reports the figure at its own head.

## The stall census

`examples/test/bench-stall.test.mjs` pins two totals over every committed export in
`docs/benchmarks/`, so these exports move both. They are updated in this record's pull request, in a
commit of their own that changes only the two assert lines (the second addendum, entry 5):

- exports passing every arm: 91 to **107**, the sixteen session A exports (+16), each passing every arm;
- step backs read with the clip's duration: 282 to **362**, their 80 loop wraps (+80), 5 in each
  export, each agreeing with `isLoopWrap`.

Every other assert of the census passes unchanged (46 of the file's 48 tests passed with the exports
present and the two counts not yet moved; the two failed on exactly 107 and 362).

## What is committed

- the sixteen exports, each with its `.url.txt`, `.clip.txt` and `.link.txt`, unchanged;
- this record, and the analysis's two stdouts beside it, whose hashes the criteria's addendum will
  cite;
- the stall census's two counts.

Not committed: the driver's `.state/` records (`<n>.before` and `<n>.runcheck` for runs 1 to 16) and
its session log, which is quoted in full below.

## The driver's session log

`D:/kalwalt-github/m9-sessione-a/m9-session.log`, 34,200 bytes, SHA-256
`437e8d4c11eb895c77805035c6fc1092a1f501029c7133cc4e4eb84c81c65949`, in full:

```
2026-11-12T14:35:27Z driver M9 caricato: Tab9WEEA0001504 (Tab_9_WiFi), 32 run, uscita D:/kalwalt-github/m9-sessione-a. Comandi: pronto, inizia N, finisci N, riapri N, chiudi-tab, stato
2026-11-12T14:35:27Z sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 D:/kalwalt-github/webarkit-m9-session-a/docs/benchmarks/2026-11-12-243-session.sh
2026-11-12T14:35:27Z sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 D:/kalwalt-github/webarkit-m9-session-a/docs/benchmarks/2026-11-12-243-session-table.json
2026-11-12T14:35:27Z sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 D:/kalwalt-github/webarkit-m9-session-a/docs/benchmarks/2026-11-11-243-link-monitor.mjs
2026-11-12T14:35:27Z sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 D:/kalwalt-github/webarkit-m9-serve/docs/benchmarks/2026-11-11-243-run-check.mjs
2026-11-12T14:35:33Z completi: nessuno
2026-11-12T14:35:33Z prossimo: run 1, il primo della sessione A. Scrivi: pronto, poi inizia 1
2026-11-12T14:37:37Z driver M9 caricato: Tab9WEEA0001504 (Tab_9_WiFi), 32 run, uscita D:/kalwalt-github/m9-sessione-a. Comandi: pronto, inizia N, finisci N, riapri N, chiudi-tab, stato
2026-11-12T14:37:38Z sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 D:/kalwalt-github/webarkit-m9-session-a/docs/benchmarks/2026-11-12-243-session.sh
2026-11-12T14:37:38Z sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 D:/kalwalt-github/webarkit-m9-session-a/docs/benchmarks/2026-11-12-243-session-table.json
2026-11-12T14:37:38Z sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 D:/kalwalt-github/webarkit-m9-session-a/docs/benchmarks/2026-11-11-243-link-monitor.mjs
2026-11-12T14:37:38Z sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 D:/kalwalt-github/webarkit-m9-serve/docs/benchmarks/2026-11-11-243-run-check.mjs
2026-11-12T14:37:48Z pronto: dispositivo Tab9WEEA0001504 (Tab_9_WiFi), checkout di servizio D:/kalwalt-github/webarkit-m9-serve, uscita D:/kalwalt-github/m9-sessione-a
2026-11-12T14:37:48Z     sha256 19e7d192440e3b59b124260f969ea0d02e40844d33cebd280d926684ce5ca576 2026-11-12-243-session.sh
2026-11-12T14:37:49Z     sha256 0d047f813877fb691dc61ae699bac0e7bae379a1b75c7b6fdacb2cec0daba274 2026-11-12-243-session-table.json
2026-11-12T14:37:49Z     sha256 90eca3e47d02fa2d2f1a08fdf2186078bd4b826925e038bc4ee0487281db42a6 2026-11-11-243-link-monitor.mjs
2026-11-12T14:37:49Z     sha256 b8535d217d47d69080f769dffb9f8bacd1a18677d6d5ef491cb15387900fcc11 2026-11-11-243-run-check.mjs
2026-11-12T14:37:49Z OK  HEAD del checkout di servizio = testa del freeze 8192265
2026-11-12T14:37:49Z OK  bundle 6d07b0c2… = freeze
2026-11-12T14:37:49Z OK  git status sul pathspec del runbook: vuoto
2026-11-12T14:37:51Z OK  check:provenance, exit 0
2026-11-12T14:37:51Z OK  cache-control: no-cache, no-store, must-revalidate
2026-11-12T14:37:51Z OK  dispositivo Tab9WEEA0001504 collegato, modello Tab_9_WiFi
2026-11-12T14:37:53Z OK  tunnel tcp:8093 tcp:8093
2026-11-12T14:37:53Z OK  nessun bench-nft-*.json nei Download del tablet
2026-11-12T14:37:54Z OK  collegamento quieto da almeno 5 minuti (adb.log)
2026-11-12T14:38:03Z OK  nessuna pagina del banco aperta nel Chrome del tablet
2026-11-12T14:38:03Z OK  Chrome sul tablet: Chrome/156.0.8078.81 (fonte: DevTools /json/version, la build di chrome://version)
2026-11-12T14:38:04Z   nota: Chrome è aperto sul PC; chrome://inspect e «Discover USB devices» devono restare chiusi
2026-11-12T14:38:04Z A MANO  sul tablet: svuota i file in cache di Chrome (runbook, item 4); il driver non lo vede
2026-11-12T14:38:04Z PRONTO OK
2026-11-12T14:39:23Z STOP: 'N' non è un numero di run
2026-11-12T14:39:23Z   I run sono 1–32
2026-11-12T14:39:23Z   → Di' all'agente: "STOP inizia: 'N' non è un numero di run". Non spostare, rinominare o cancellare alcun file.
2026-11-12T14:39:37Z 1. tunnel tcp:8093 presente
2026-11-12T14:39:42Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-1.link.txt
2026-11-12T14:39:43Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-1.link.txt
2026-11-12T14:39:43Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-1.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T14:39:43Z 3. URL aperto sul tablet: run=1, clip=pinball-static.mp4
2026-11-12T14:39:43Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T14:39:43Z    Poi scrivi: finisci 1
2026-11-12T14:41:48Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794494490841.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794494490841.json: 1 file pulled, 0 skipped. 25.7 MB/s (2589422 bytes in 0.096s)
2026-11-12T14:41:49Z    scaricata in 2026-11-12-tab9-m9-static-1.json, SHA-256 651af49691f7cde1… uguale al tablet
2026-11-12T14:41:49Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-1.link.txt: no drop: true
2026-11-12T14:41:50Z    monitor del collegamento finito: no drop: true
2026-11-12T14:41:51Z run check del run 1:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-1.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T14:41:51Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T14:41:52Z run 1 completo.
2026-11-12T14:41:52Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 2 dalle 14:43:50Z.
2026-11-12T14:44:40Z 1. tunnel tcp:8093 presente
2026-11-12T14:44:44Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-2.link.txt
2026-11-12T14:44:46Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-2.link.txt
2026-11-12T14:44:46Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-2.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T14:44:46Z 3. URL aperto sul tablet: run=2, clip=pinball-static.mp4
2026-11-12T14:44:46Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T14:44:46Z    Poi scrivi: finisci 2
2026-11-12T14:46:55Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794494809622.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794494809622.json: 1 file pulled, 0 skipped. 30.4 MB/s (2771751 bytes in 0.087s)
2026-11-12T14:46:56Z    scaricata in 2026-11-12-tab9-m9-static-2.json, SHA-256 ddba2a03d72d2eb3… uguale al tablet
2026-11-12T14:46:57Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-2.link.txt: no drop: true
2026-11-12T14:46:57Z    monitor del collegamento finito: no drop: true
2026-11-12T14:46:59Z run check del run 2:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-2.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T14:46:59Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T14:46:59Z run 2 completo.
2026-11-12T14:46:59Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 3 dalle 14:48:57Z.
2026-11-12T14:49:11Z 1. tunnel tcp:8093 presente
2026-11-12T14:49:15Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-3.link.txt
2026-11-12T14:49:16Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-3.link.txt
2026-11-12T14:49:17Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-3.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T14:49:17Z 3. URL aperto sul tablet: run=3, clip=pinball-static.mp4
2026-11-12T14:49:17Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T14:49:17Z    Poi scrivi: finisci 3
2026-11-12T14:50:56Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794495050104.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794495050104.json: 1 file pulled, 0 skipped. 29.8 MB/s (2752392 bytes in 0.088s)
2026-11-12T14:50:57Z    scaricata in 2026-11-12-tab9-m9-static-3.json, SHA-256 989647d23e53b61b… uguale al tablet
2026-11-12T14:50:57Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-3.link.txt: no drop: true
2026-11-12T14:50:58Z    monitor del collegamento finito: no drop: true
2026-11-12T14:50:59Z run check del run 3:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-3.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T14:50:59Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T14:51:00Z run 3 completo.
2026-11-12T14:51:00Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 4 dalle 14:52:58Z.
2026-11-12T14:53:47Z 1. tunnel tcp:8093 presente
2026-11-12T14:53:52Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-4.link.txt
2026-11-12T14:53:53Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-4.link.txt
2026-11-12T14:53:54Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-4.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T14:53:54Z 3. URL aperto sul tablet: run=4, clip=pinball-static.mp4
2026-11-12T14:53:54Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T14:53:54Z    Poi scrivi: finisci 4
2026-11-12T14:55:34Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794495328073.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794495328073.json: 1 file pulled, 0 skipped. 29.4 MB/s (2742051 bytes in 0.089s)
2026-11-12T14:55:35Z    scaricata in 2026-11-12-tab9-m9-static-4.json, SHA-256 f4a0e437ae88b91d… uguale al tablet
2026-11-12T14:55:35Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-4.link.txt: no drop: true
2026-11-12T14:55:36Z    monitor del collegamento finito: no drop: true
2026-11-12T14:55:37Z run check del run 4:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-4.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T14:55:37Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T14:55:37Z run 4 completo.
2026-11-12T14:55:37Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 5 dalle 14:57:35Z.
2026-11-12T14:57:48Z 1. tunnel tcp:8093 presente
2026-11-12T14:58:12Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-5.link.txt
2026-11-12T14:58:13Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-5.link.txt
2026-11-12T14:58:13Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-5.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T14:58:14Z 3. URL aperto sul tablet: run=5, clip=pinball-static.mp4
2026-11-12T14:58:14Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T14:58:14Z    Poi scrivi: finisci 5
2026-11-12T15:00:15Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794495609141.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794495609141.json: 1 file pulled, 0 skipped. 30.3 MB/s (2801815 bytes in 0.088s)
2026-11-12T15:00:16Z    scaricata in 2026-11-12-tab9-m9-static-5.json, SHA-256 3f0ff8ea5db7038d… uguale al tablet
2026-11-12T15:00:16Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-5.link.txt: no drop: true
2026-11-12T15:00:17Z    monitor del collegamento finito: no drop: true
2026-11-12T15:00:18Z run check del run 5:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-5.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:00:18Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:00:18Z run 5 completo.
2026-11-12T15:00:18Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 6 dalle 15:02:16Z.
2026-11-12T15:02:28Z 1. tunnel tcp:8093 presente
2026-11-12T15:02:33Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-6.link.txt
2026-11-12T15:02:34Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-6.link.txt
2026-11-12T15:02:35Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-6.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:02:35Z 3. URL aperto sul tablet: run=6, clip=pinball-static.mp4
2026-11-12T15:02:35Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:02:35Z    Poi scrivi: finisci 6
2026-11-12T15:04:16Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794495847713.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794495847713.json: 1 file pulled, 0 skipped. 26.7 MB/s (2778623 bytes in 0.099s)
2026-11-12T15:04:17Z    scaricata in 2026-11-12-tab9-m9-static-6.json, SHA-256 7e6155f048724630… uguale al tablet
2026-11-12T15:04:17Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-6.link.txt: no drop: true
2026-11-12T15:04:18Z    monitor del collegamento finito: no drop: true
2026-11-12T15:04:19Z run check del run 6:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-6.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:04:19Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:04:19Z run 6 completo.
2026-11-12T15:04:19Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 7 dalle 15:06:18Z.
2026-11-12T15:06:33Z 1. tunnel tcp:8093 presente
2026-11-12T15:06:38Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-7.link.txt
2026-11-12T15:06:39Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-7.link.txt
2026-11-12T15:06:39Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-7.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:06:40Z 3. URL aperto sul tablet: run=7, clip=pinball-static.mp4
2026-11-12T15:06:40Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:06:40Z    Poi scrivi: finisci 7
2026-11-12T15:08:15Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794496090447.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794496090447.json: 1 file pulled, 0 skipped. 14.4 MB/s (2797084 bytes in 0.185s)
2026-11-12T15:08:18Z    scaricata in 2026-11-12-tab9-m9-static-7.json, SHA-256 0519598588593213… uguale al tablet
2026-11-12T15:08:19Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-7.link.txt: no drop: true
2026-11-12T15:08:21Z    monitor del collegamento finito: no drop: true
2026-11-12T15:08:23Z run check del run 7:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-7.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:08:24Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:08:24Z run 7 completo.
2026-11-12T15:08:24Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 8 dalle 15:10:21Z.
2026-11-12T15:10:32Z 1. tunnel tcp:8093 presente
2026-11-12T15:10:37Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-8.link.txt
2026-11-12T15:10:39Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-static-8.link.txt
2026-11-12T15:10:39Z    clip pinball-static.mp4 letta in 2026-11-12-tab9-m9-static-8.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:10:40Z 3. URL aperto sul tablet: run=8, clip=pinball-static.mp4
2026-11-12T15:10:40Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:10:40Z    Poi scrivi: finisci 8
2026-11-12T15:12:20Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794496337291.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794496337291.json: 1 file pulled, 0 skipped. 20.6 MB/s (2766519 bytes in 0.128s)
2026-11-12T15:12:22Z    scaricata in 2026-11-12-tab9-m9-static-8.json, SHA-256 e4036454dab5d923… uguale al tablet
2026-11-12T15:12:22Z    clip pinball-static.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-8.link.txt: no drop: true
2026-11-12T15:12:24Z    monitor del collegamento finito: no drop: true
2026-11-12T15:12:26Z run check del run 8:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-static-8.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:12:26Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:12:27Z run 8 completo.
2026-11-12T15:12:27Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 9 dalle 15:14:24Z.
2026-11-12T15:15:38Z 1. tunnel tcp:8093 presente
2026-11-12T15:15:47Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-9.link.txt
2026-11-12T15:15:50Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-9.link.txt
2026-11-12T15:15:50Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-9.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:15:51Z 3. URL aperto sul tablet: run=9, clip=pinball-tilt-cross.mp4
2026-11-12T15:15:51Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:15:51Z    Poi scrivi: finisci 9
2026-11-12T15:17:38Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794496650266.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794496650266.json: 1 file pulled, 0 skipped. 16.7 MB/s (2920047 bytes in 0.167s)
2026-11-12T15:17:40Z    scaricata in 2026-11-12-tab9-m9-cross-9.json, SHA-256 1eb683fcf053e8a6… uguale al tablet
2026-11-12T15:17:40Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-9.link.txt: no drop: true
2026-11-12T15:17:42Z    monitor del collegamento finito: no drop: true
2026-11-12T15:17:44Z run check del run 9:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-9.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:17:45Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:17:45Z run 9 completo.
2026-11-12T15:17:45Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 10 dalle 15:19:41Z.
2026-11-12T15:20:06Z 1. tunnel tcp:8093 presente
2026-11-12T15:20:12Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-10.link.txt
2026-11-12T15:20:14Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-10.link.txt
2026-11-12T15:20:14Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-10.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:20:15Z 3. URL aperto sul tablet: run=10, clip=pinball-tilt-cross.mp4
2026-11-12T15:20:15Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:20:15Z    Poi scrivi: finisci 10
2026-11-12T15:21:59Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794496914763.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794496914763.json: 1 file pulled, 0 skipped. 26.3 MB/s (3023599 bytes in 0.110s)
2026-11-12T15:22:00Z    scaricata in 2026-11-12-tab9-m9-cross-10.json, SHA-256 b1aefbb518a1c612… uguale al tablet
2026-11-12T15:22:01Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-10.link.txt: no drop: true
2026-11-12T15:22:02Z    monitor del collegamento finito: no drop: true
2026-11-12T15:22:03Z run check del run 10:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-10.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:22:03Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:22:04Z run 10 completo.
2026-11-12T15:22:04Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 11 dalle 15:24:01Z.
2026-11-12T15:24:10Z 1. tunnel tcp:8093 presente
2026-11-12T15:24:16Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-11.link.txt
2026-11-12T15:24:18Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-11.link.txt
2026-11-12T15:24:18Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-11.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:24:18Z 3. URL aperto sul tablet: run=11, clip=pinball-tilt-cross.mp4
2026-11-12T15:24:18Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:24:18Z    Poi scrivi: finisci 11
2026-11-12T15:26:07Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794497163766.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794497163766.json: 1 file pulled, 0 skipped. 27.5 MB/s (3024235 bytes in 0.105s)
2026-11-12T15:26:08Z    scaricata in 2026-11-12-tab9-m9-cross-11.json, SHA-256 05b61f7d7581cd6e… uguale al tablet
2026-11-12T15:26:08Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-11.link.txt: no drop: true
2026-11-12T15:26:09Z    monitor del collegamento finito: no drop: true
2026-11-12T15:26:11Z run check del run 11:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-11.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:26:11Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:26:12Z run 11 completo.
2026-11-12T15:26:12Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 12 dalle 15:28:09Z.
2026-11-12T15:28:50Z 1. tunnel tcp:8093 presente
2026-11-12T15:28:55Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-12.link.txt
2026-11-12T15:28:56Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-12.link.txt
2026-11-12T15:28:57Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-12.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:28:57Z 3. URL aperto sul tablet: run=12, clip=pinball-tilt-cross.mp4
2026-11-12T15:28:57Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:28:57Z    Poi scrivi: finisci 12
2026-11-12T15:30:54Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFii-1794497451299.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFii-1794497451299.json: 1 file pulled, 0 skipped. 31.1 MB/s (3021821 bytes in 0.093s)
2026-11-12T15:30:55Z    scaricata in 2026-11-12-tab9-m9-cross-12.json, SHA-256 99117ab34a64d717… uguale al tablet
2026-11-12T15:30:55Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-12.link.txt: no drop: true
2026-11-12T15:30:56Z    monitor del collegamento finito: no drop: true
2026-11-12T15:30:57Z run check del run 12:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-12.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:30:58Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:30:58Z run 12 completo.
2026-11-12T15:30:58Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 13 dalle 15:32:56Z.
2026-11-12T15:33:13Z 1. tunnel tcp:8093 presente
2026-11-12T15:33:18Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-13.link.txt
2026-11-12T15:33:19Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-13.link.txt
2026-11-12T15:33:19Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-13.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:33:20Z 3. URL aperto sul tablet: run=13, clip=pinball-tilt-cross.mp4
2026-11-12T15:33:20Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:33:20Z    Poi scrivi: finisci 13
2026-11-12T15:35:09Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794497697459.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794497697459.json: 1 file pulled, 0 skipped. 30.5 MB/s (2958033 bytes in 0.093s)
2026-11-12T15:35:10Z    scaricata in 2026-11-12-tab9-m9-cross-13.json, SHA-256 f235cd454bf919ff… uguale al tablet
2026-11-12T15:35:10Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-13.link.txt: no drop: true
2026-11-12T15:35:11Z    monitor del collegamento finito: no drop: true
2026-11-12T15:35:12Z run check del run 13:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-13.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:35:12Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:35:12Z run 13 completo.
2026-11-12T15:35:12Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 14 dalle 15:37:11Z.
2026-11-12T15:37:22Z 1. tunnel tcp:8093 presente
2026-11-12T15:37:26Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-14.link.txt
2026-11-12T15:37:28Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-14.link.txt
2026-11-12T15:37:28Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-14.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:37:28Z 3. URL aperto sul tablet: run=14, clip=pinball-tilt-cross.mp4
2026-11-12T15:37:28Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:37:28Z    Poi scrivi: finisci 14
2026-11-12T15:39:28Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794497961872.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794497961872.json: 1 file pulled, 0 skipped. 26.1 MB/s (3019073 bytes in 0.110s)
2026-11-12T15:39:28Z    scaricata in 2026-11-12-tab9-m9-cross-14.json, SHA-256 943544fb01add43b… uguale al tablet
2026-11-12T15:39:29Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-14.link.txt: no drop: true
2026-11-12T15:39:30Z    monitor del collegamento finito: no drop: true
2026-11-12T15:39:31Z run check del run 14:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-14.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:39:31Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:39:31Z run 14 completo.
2026-11-12T15:39:31Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 15 dalle 15:41:29Z.
2026-11-12T15:41:38Z 1. tunnel tcp:8093 presente
2026-11-12T15:41:43Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-15.link.txt
2026-11-12T15:41:44Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-15.link.txt
2026-11-12T15:41:44Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-15.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:41:45Z 3. URL aperto sul tablet: run=15, clip=pinball-tilt-cross.mp4
2026-11-12T15:41:45Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:41:45Z    Poi scrivi: finisci 15
2026-11-12T15:44:28Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794498263080.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794498263080.json: 1 file pulled, 0 skipped. 26.4 MB/s (2841267 bytes in 0.103s)
2026-11-12T15:44:29Z    scaricata in 2026-11-12-tab9-m9-cross-15.json, SHA-256 e3c4814366bf338d… uguale al tablet
2026-11-12T15:44:29Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-15.link.txt: no drop: true
2026-11-12T15:44:30Z    monitor del collegamento finito: no drop: true
2026-11-12T15:44:31Z run check del run 15:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-15.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:44:32Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:44:32Z run 15 completo.
2026-11-12T15:44:32Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia 16 dalle 15:46:30Z.
2026-11-12T15:46:39Z 1. tunnel tcp:8093 presente
2026-11-12T15:46:44Z    nessuna pagina del banco aperta nel Chrome del tablet
link monitor: begun, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-16.link.txt
2026-11-12T15:46:46Z 2. monitor del collegamento iniziato: 2026-11-12-tab9-m9-cross-16.link.txt
2026-11-12T15:46:46Z    clip pinball-tilt-cross.mp4 letta in 2026-11-12-tab9-m9-cross-16.clip.txt
Starting: Intent { act=android.intent.action.VIEW dat=http://localhost:8093/... pkg=com.android.chrome }
2026-11-12T15:46:46Z 3. URL aperto sul tablet: run=16, clip=pinball-tilt-cross.mp4
2026-11-12T15:46:46Z 4. Sul tablet: etichetta Tab_9_WiFi, Start, pagina in primo piano fino a «done», poi Download JSON.
2026-11-12T15:46:46Z    Poi scrivi: finisci 16
2026-11-12T15:48:37Z 5. esportazione sul tablet: bench-nft-tracking-Tab-9-WiFi-1794498510015.json
/sdcard/Download/bench-nft-tracking-Tab-9-WiFi-1794498510015.json: 1 file pulled, 0 skipped. 28.3 MB/s (2859197 bytes in 0.096s)
2026-11-12T15:48:37Z    scaricata in 2026-11-12-tab9-m9-cross-16.json, SHA-256 e45ccae3c9b777e9… uguale al tablet
2026-11-12T15:48:38Z    clip pinball-tilt-cross.mp4 letta di nuovo
link monitor: ended, D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-16.link.txt: no drop: true
2026-11-12T15:48:39Z    monitor del collegamento finito: no drop: true
2026-11-12T15:48:40Z run check del run 16:
# 2026-11-11-243-run-check.mjs: D:/kalwalt-github/m9-sessione-a/2026-11-12-tab9-m9-cross-16.json, form counted, freeze head 8192265bd462f0667e275ec9297fe2890a907935
V1 PASS
V2 PASS
V3 PASS
V4 PASS
V5 PASS
V6 PASS
V7 PASS
V8 PASS
run check: PASS
2026-11-12T15:48:40Z 6. run check: V1 PASS V2 PASS V3 PASS V4 PASS V5 PASS V6 PASS V7 PASS V8 PASS exit 0
2026-11-12T15:48:40Z run 16 completo.
2026-11-12T15:48:40Z 7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab). Fine della sessione A.
```
