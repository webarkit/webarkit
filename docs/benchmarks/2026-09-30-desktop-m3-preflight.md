# 2026-09-30 — M3's desktop pre-flight

The pre-flight [the M3 plan](./README.md#the-desktop-pre-flight) registered
before it ran: `scripts/replay-clips.mjs --external <latency> --seed <seed>
--out <dir>`, for latencies of 50, 70, 100 and 130 ms and seeds 1, 2 and 3,
at commit `3bd0c1a`, one run at a time on an otherwise idle machine (Node
v24.21.0, Windows, Intel Core i7-9700), each (latency, seed) in its own
output directory. Each run replays the three bundled clips with the
committed 48-patch target (`9e8eb486…`) in five tracking arms: every frame,
synchronous; every frame, worker at the latency; every frame, the
synchronous mode as external detection at its modelled 83.2 ms; the device
schedule (scaled step), synchronous; the device schedule, worker at the
latency. Fourteen runs, about two minutes each, 21:08 to 21:34.

**Every registered falsifier holds.** The model's frame-boundary account is
confirmed exactly: every arm's first-step latency p50 is the frame the
account predicted. One prediction that carries no refusal missed upward
(the wall clip at 100 ms), and one reading of a falsifier's wording over
the point added today does not hold; both are below, with what was found.

## The harness is deterministic in latency and seed

Seed 1 at 70 ms was run twice, first, and the two runs' fifteen exports are
identical outside timing fields — every frame's state, loss reason,
detection use and corners, every job's frames and outcome, and every
summary figure that is not a measured time — although the scaled step the
device schedule uses, a desktop timing measured in each run, differed
between them (wall 14.4 and 14.9 ms, table 11.55 and 11.59, static 9.9 and
10.8). The arms that do not depend on the latency repeat identically across
the four runs of each seed, the device-schedule synchronous arm included,
over scaled steps from 13.7 to 15.2 ms on the wall clip, 10.9 to 12.3 on the
table clip and 9.5 to 10.5 on the static clip: no frame boundary moved
within those ranges. The two runs of seed 1 at 70 ms also reproduce the
values disclosed with the correction (`trackTimeShare` 45.2% against 40.4%
on the wall clip, 73.4% against 71.4% on the table clip); as registered,
that point is reported and weightless.

## The scaled steps are inside every falsifier's range

Wall clip 13.7–15.2 ms (the 70 ms falsifier needs 9.5–22.7, the 130 ms one
more than 2.8); table clip 10.9–12.3 ms (the 50 ms falsifier needs less
than 16.7). At those steps the table clip's floor, 83.3 ms less the step,
sits between 71.0 and 72.4 ms, so its 70 ms point fell under the floor in
every run, like 50 ms: on the device schedule the table clip's 50 and 70 ms
runs are identical, and so are its 100 and 130 ms runs, since each pair's
results arrive between the same two processed frames.

## The device schedule, run by run

`trackTimeShare` over loops 1–4, %; first-step latency p50 in video ms;
first steps confirmed over the counted loops.

### Wall clip

| latency | seed | sync | worker | worker − sync | first step, sync / worker | scaled step | first steps confirmed, sync / worker |
|---|---|---|---|---|---|---|---|
| 50 | 1 | 40.4 | 45.3 | +4.9 | 160.5 / 120.4 | 15.2 | 25/155 / 35/190 |
| 50 | 2 | 37.4 | 44.6 | +7.3 | 160.5 / 120.4 | 13.7 | 22/169 / 36/194 |
| 50 | 3 | 41.4 | 44.0 | +2.6 | 160.5 / 120.4 | 14.2 | 27/157 / 36/196 |
| 70 | 1 (weightless) | 40.4 | 45.2 | +4.8 | 160.5 / 120.4 | 14.4 | 25/155 / 44/188 |
| 70 | 2 | 37.4 | 44.1 | +6.8 | 160.5 / 120.4 | 14.0 | 22/169 / 45/193 |
| 70 | 3 | 41.4 | 44.1 | +2.8 | 160.5 / 120.4 | 14.8 | 27/157 / 44/192 |
| 100 | 1 | 40.4 | 42.9 | +2.5 | 160.5 / 160.5 | 14.4 | 25/155 / 31/135 |
| 100 | 2 | 37.4 | 42.2 | +4.8 | 160.5 / 160.5 | 14.6 | 22/169 / 32/136 |
| 100 | 3 | 41.4 | 42.2 | +0.8 | 160.5 / 160.5 | 14.5 | 27/157 / 32/141 |
| 130 | 1 | 40.4 | 35.0 | −5.4 | 160.5 / 200.7 | 15.0 | 25/155 / 26/141 |
| 130 | 2 | 37.4 | 39.7 | +2.3 | 160.5 / 200.7 | 14.4 | 22/169 / 23/126 |
| 130 | 3 | 41.4 | 34.7 | −6.7 | 160.5 / 200.7 | 14.7 | 27/157 / 25/138 |

### Table clip

| latency | seed | sync | worker | worker − sync | first step, sync / worker | scaled step | first steps confirmed, sync / worker |
|---|---|---|---|---|---|---|---|
| 50 | 1 | 71.4 | 73.4 | +2.1 | 166.7 / 133.3 | 11.4 | 10/58 / 10/62 |
| 50 | 2 | 72.5 | 75.0 | +2.5 | 166.7 / 133.3 | 10.9 | 12/54 / 11/61 |
| 50 | 3 | 70.4 | 73.5 | +3.1 | 166.7 / 133.3 | 11.2 | 11/60 / 11/65 |
| 70 | 1 (weightless) | 71.4 | 73.4 | +2.1 | 166.7 / 133.3 | 11.6 | 10/58 / 10/62 |
| 70 | 2 | 72.5 | 75.0 | +2.5 | 166.7 / 133.3 | 11.6 | 12/54 / 11/61 |
| 70 | 3 | 70.4 | 73.5 | +3.1 | 166.7 / 133.3 | 11.5 | 11/60 / 11/65 |
| 100 | 1 | 71.4 | 67.4 | −4.0 | 166.7 / 200.0 | 11.4 | 10/58 / 8/53 |
| 100 | 2 | 72.5 | 68.0 | −4.5 | 166.7 / 200.0 | 11.6 | 12/54 / 11/53 |
| 100 | 3 | 70.4 | 70.2 | −0.2 | 166.7 / 200.0 | 11.9 | 11/60 / 10/51 |
| 130 | 1 | 71.4 | 67.4 | −4.0 | 166.7 / 200.0 | 11.7 | 10/58 / 8/53 |
| 130 | 2 | 72.5 | 68.0 | −4.5 | 166.7 / 200.0 | 11.9 | 12/54 / 11/53 |
| 130 | 3 | 70.4 | 70.2 | −0.2 | 166.7 / 200.0 | 12.3 | 11/60 / 10/51 |

### Static clip

TRACK over all of loops 1–4 in every arm of every run: `trackTimeShare`
100%, no detection lock after the first.

## The falsifiers

| falsifier | read over | result | verdict |
|---|---|---|---|
| wall clip: the worker above the synchronous run at 70 ms | seeds 2 and 3 (seed 1 weightless) | 44.1% against 39.4% (+6.8, +2.8) | holds |
| wall clip: the worker not more than 5 points below at 70 ms | seeds 2 and 3 | +4.8 points | holds |
| wall clip: the worker below the synchronous run at 130 ms | seeds 1–3 | 36.5% against 39.7% (−5.4, +2.3, −6.7) | holds |
| table clip: the worker above the synchronous run at 50 ms | seeds 1–3 | 74.0% against 71.4% (+2.1, +2.5, +3.1) | holds |
| table clip: the worker below the synchronous run at 100 ms | seeds 1–3 | 68.5% against 71.4% (−4.0, −4.5, −0.2) | holds |
| table clip: the worker below the synchronous run at 130 ms | seeds 1–3 | 68.5% against 71.4% (the same frames as at 100 ms) | holds |
| the fallback's withdrawal: every-frame synchronous above the synchronous mode as external detection at 83.2 ms by more than 5 points, wall clip | seeds 1–3 | 18.6 points (17.9, 18.9, 19.0) | holds |
| every-frame worker falling as the latency grows, over the band (70, 100, 130 ms) | means over seeds | wall 52.0 → 48.0 → 46.5; table 76.4 → 75.3 → 74.0 | holds |
| device schedule: the worker's per-frame TRACK share below the synchronous run's while `trackTimeShare` holds | every run | 24 of 24 runs | holds |

## What did not go as predicted

**The wall clip at 100 ms came out above the synchronous run's range, not
within it or just below.** The worker's mean was 42.4% against the
synchronous runs' 37.4–41.4%, all three seeds positive (+2.5, +4.8, +0.8).
The frame account held: the worker's first step landed on the synchronous
frame, 160.5 ms after the detected one, in every seed. What differed is how
often first steps confirmed: 95 of 412 for the worker (23%) against 74 of
481 for the synchronous runs (15%) over the counted loops, at the same
160.5 ms. The first step is the same computation in both modes — a
detection starts a lock with no velocity and `trackFrame` runs from its
homography (`NftTracker.consume` for the worker, the frame after a DETECT
for the synchronous mode) — and while every detection finds the target the
two modes run the same chain of frames at 100 ms. They part after a
detection that finds nothing. The synchronous mode then detects the next
processed frame, with no step before it, and its first step comes 120.4 ms
later; those first steps confirmed 0 of 80 over all six loops of the three
seeds. The worker posts the frame that consumed the empty result, and its
next first step comes 160.5 ms after that. The two modes' rates are
therefore taken over different samples of frames, and the frame account,
which predicts when a first step comes, says nothing about which frames the
chains visit. This stays open. Row five of the device table (first steps
confirmed) reads it on the tablet; nothing registered for the device
changes.

**Over the point added today, the every-frame worker does not fall from 50
to 70 ms.** The falsifier was registered for the band, 70, 100 and 130 ms,
over which it holds. Read over 50 ms as well, it does not: wall 51.1% at
50 ms against 52.0% at 70; table 74.5% against 76.4%. The model predicts no
fall there. On the dominant path — a detection that follows a failed step —
50 and 70 ms arrive between the same two frames on both schedules (the wall
clip's 92.9 and 112.9 ms both land on the frame at 120.4 ms; the table
clip's 111.3 and 131.3 ms on the frame at 133.3), so the model makes them
equal. Per seed they are equal to within 0.2 points, except one seed on
each clip (wall seed 2, 2.4 points; table seed 1, 5.8 points), where the
faster retry after a detection that finds nothing — 80.2 ms instead of
120.4 on the wall clip — sends the run down another chain. This is not a
defect in the loop. A falsifier that says "falls" should say "does not
rise, where the latency crosses a frame boundary", which is what it
tested over the band.

## Reproducing it

The runs: `node scripts/replay-clips.mjs --external <L> --seed <S> --out
<dir>` for each (L, S), with `npm run build` first, sequentially. The two
scripts that compared and read them follow.

<details>
<summary><code>compare-runs.mjs</code>: the determinism check</summary>

```js
// Compares two replay --out directories of the same (latency, seed): every
// export's decision-relevant content must be identical. Timing-derived fields
// (measured wall-clock times, and the model times that include the measured
// scaled step) are set aside and reported separately.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [dirA, dirB] = process.argv.slice(2);
const TIMING_SUMMARY = ["trackStepMs", "pyramidMs", "alignMs", "fitMs", "frameMs", "unlockedResidualMs", "detectionTime"];
function strip(e) {
  const c = structuredClone(e);
  delete c.exportedAt; delete c.userAgent; delete c.stepMs; delete c.model;
  for (const k of TIMING_SUMMARY) if (c.runSummary) delete c.runSummary[k];
  for (const f of c.frames ?? []) { delete f.timings; delete f.trackerTimings; }
  for (const j of c.detection?.jobs ?? []) { delete j.postedAtMs; delete j.arrivedAtMs; delete j.handlerMs; delete j.workerMs; }
  return c;
}
function diffs(a, b, path = "", out = []) {
  if (out.length >= 8) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`); return out; }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diffs(a[k], b[k], `${path}.${k}`, out);
    return out;
  }
  if (!Object.is(a, b)) out.push(`${path}: ${a} ≠ ${b}`);
  return out;
}
const files = readdirSync(dirA).filter((f) => f.endsWith(".json")).sort();
const filesB = readdirSync(dirB).filter((f) => f.endsWith(".json")).sort();
let bad = 0;
if (files.join() !== filesB.join()) { console.log(`file sets differ:\n A ${files.join(", ")}\n B ${filesB.join(", ")}`); bad++; }
for (const f of files) {
  if (!filesB.includes(f)) continue;
  const A = JSON.parse(readFileSync(join(dirA, f), "utf8"));
  const B = JSON.parse(readFileSync(join(dirB, f), "utf8"));
  const d = diffs(strip(A), strip(B));
  const tA = A.runSummary?.trackTimeShare?.share, tB = B.runSummary?.trackTimeShare?.share;
  const stepNote = A.stepMs !== undefined ? ` step ${A.stepMs} | ${B.stepMs}` : "";
  console.log(`${d.length === 0 ? "IDENTICAL" : "DIFFERENT"} ${f}: frames ${A.frames?.length}/${B.frames?.length}, trackTimeShare ${tA} | ${tB}${stepNote}`);
  for (const line of d) console.log(`    ${line}`);
  if (d.length) bad++;
}
console.log(bad === 0 ? "DETERMINISM: identical outside timing fields" : `DETERMINISM: ${bad} file(s) differ`);
process.exit(bad === 0 ? 0 : 1);
```

</details>

<details>
<summary><code>analyze.mjs</code>: the tables and the falsifiers</summary>

```js
// Reads the pre-flight's --out directories and evaluates the spec's registered
// falsifiers (docs/benchmarks/README.md, "The desktop's predictions").
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const PF = process.argv[2];
const CLIPS = { "pinball-bench.mp4": "wall", "pinball-bench-table.mp4": "table", "pinball-static.mp4": "static" };
const LATS = [50, 70, 100, 130];
const SEEDS = [1, 2, 3];
const kind = (s) =>
  s.startsWith("every frame, sync as external") ? "EF-fallback" :
  s.startsWith("every frame, sync") ? "EF-sync" :
  s.startsWith("every frame, worker") ? "EF-worker" :
  s.startsWith("device scaled step, sync") ? "DEV-sync" :
  s.startsWith("device scaled step, worker") ? "DEV-worker" : s;
const runs = {}; // runs[L][seed][clip][kind] = row
for (const L of LATS) for (const S of SEEDS) {
  const dir = join(PF, `out-${L}-s${S}${L === 70 && S === 1 ? "-a" : ""}`);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const e = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const s = e.runSummary;
    const row = {
      share: s.trackTimeShare?.share ?? null,
      perFrame: s.trackShare,
      step: e.stepMs ?? null,
      locks: s.detectionLocks ? `${s.detectionLocks.confirmed}/${s.detectionLocks.n}` : "—",
      fsl: s.firstStepLatency?.videoMs?.p50 ?? null,
      acc: e.detection?.accounting ? `${e.detection.accounting.requests}=${e.detection.accounting.consumptions}+${e.detection.accounting.dropped}+${e.detection.accounting.discardedAtStop}` : "—",
    };
    ((((runs[L] ??= {})[S] ??= {})[CLIPS[e.bundledClip] ?? e.bundledClip] ??= {})[kind(e.schedule)] = row);
  }
}
const pct = (v) => (v == null ? "—" : (100 * v).toFixed(1));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const get = (L, S, clip, k) => runs[L]?.[S]?.[clip]?.[k];
console.log("## Device schedule (scaled step): trackTimeShare %, sync | worker | worker − sync, first-step latency p50 (video ms) sync/worker, scaled step\n");
for (const clip of ["wall", "table", "static"]) {
  console.log(`### ${clip}\n\n| latency | seed | sync % | worker % | Δ points | first step sync / worker ms | step ms | first steps confirmed sync / worker |\n|---|---|---|---|---|---|---|---|`);
  for (const L of LATS) for (const S of SEEDS) {
    const a = get(L, S, clip, "DEV-sync"), b = get(L, S, clip, "DEV-worker");
    if (!a || !b) continue;
    console.log(`| ${L} | ${S}${L === 70 && S === 1 ? " (weightless)" : ""} | ${pct(a.share)} | ${pct(b.share)} | ${((b.share - a.share) * 100).toFixed(1)} | ${a.fsl ?? "—"} / ${b.fsl ?? "—"} | ${a.step?.toFixed?.(1) ?? a.step} / ${b.step?.toFixed?.(1) ?? b.step} | ${a.locks} / ${b.locks} |`);
  }
  console.log("");
}
const verdict = (name, ok, detail) => console.log(`- ${ok === null ? "NOT READ" : ok ? "HOLDS" : "REFUSED"} — ${name}: ${detail}`);
const devMeans = (L, seeds, clip) => {
  const a = [], b = [];
  for (const S of seeds) { const x = get(L, S, clip, "DEV-sync"), y = get(L, S, clip, "DEV-worker"); if (x && y) { a.push(x.share); b.push(y.share); } }
  return { sync: mean(a), worker: mean(b), n: a.length };
};
const stepsIn = (L, seeds, clip, lo, hi) => seeds.every((S) => { const x = get(L, S, clip, "DEV-worker"); return x && x.step > lo && x.step < hi; });
console.log("## Falsifiers\n");
{ const m = devMeans(70, [2, 3], "wall"); const inRange = stepsIn(70, [2, 3], "wall", 9.5, 22.7);
  verdict("wall, above sync at 70 ms (seeds 2-3)", inRange ? m.worker > m.sync : null, `worker ${pct(m.worker)} vs sync ${pct(m.sync)} (n ${m.n}); steps in 9.5-22.7: ${inRange}`);
  verdict("wall, not more than 5 points lost at 70 ms (seeds 2-3)", inRange ? m.sync - m.worker <= 0.05 : null, `Δ ${((m.worker - m.sync) * 100).toFixed(1)} points`); }
{ const m = devMeans(130, SEEDS, "wall"); const inRange = stepsIn(130, SEEDS, "wall", 2.8, Infinity);
  verdict("wall, below sync at 130 ms (seeds 1-3)", inRange ? m.worker < m.sync : null, `worker ${pct(m.worker)} vs sync ${pct(m.sync)} (n ${m.n}); steps > 2.8: ${inRange}`); }
{ const m = devMeans(50, SEEDS, "table"); const inRange = stepsIn(50, SEEDS, "table", -Infinity, 16.7);
  verdict("table, above sync at 50 ms (seeds 1-3)", inRange ? m.worker > m.sync : null, `worker ${pct(m.worker)} vs sync ${pct(m.sync)} (n ${m.n}); steps < 16.7: ${inRange}`); }
for (const L of [100, 130]) { const m = devMeans(L, SEEDS, "table");
  verdict(`table, below sync at ${L} ms (seeds 1-3)`, m.n ? m.worker < m.sync : null, `worker ${pct(m.worker)} vs sync ${pct(m.sync)} (n ${m.n})`); }
{ const d = []; for (const L of LATS) for (const S of SEEDS) { const a = get(L, S, "wall", "EF-sync"), b = get(L, S, "wall", "EF-fallback"); if (a && b) d.push({ L, S, diff: a.share - b.share }); }
  const bySeed = SEEDS.map((S) => d.find((x) => x.S === S)).filter(Boolean);
  const md = mean(bySeed.map((x) => x.diff));
  verdict("fallback withdrawal: every-frame sync minus sync-as-external(83.2) > 5 points on the wall clip", md == null ? null : md > 0.05, `mean over seeds ${md == null ? "—" : (md * 100).toFixed(1)} points; per seed ${bySeed.map((x) => (x.diff * 100).toFixed(1)).join(", ")}`); }
for (const clip of ["wall", "table"]) {
  const ms = LATS.map((L) => mean(SEEDS.map((S) => get(L, S, clip, "EF-worker")?.share).filter((v) => v != null)));
  const falls = ms.every((v, i) => i === 0 || (v != null && ms[i - 1] != null && v < ms[i - 1]));
  verdict(`every-frame worker falls with latency (${clip})`, ms.every((v) => v != null) ? falls : null, `50/70/100/130: ${ms.map(pct).join(" / ")}`);
}
for (const clip of ["wall", "table"]) {
  const rows = [];
  for (const L of LATS) for (const S of SEEDS) { const a = get(L, S, clip, "DEV-sync"), b = get(L, S, clip, "DEV-worker"); if (a && b) rows.push(b.perFrame < a.perFrame); }
  verdict(`device schedule: worker per-frame TRACK share below sync's (${clip})`, rows.length ? rows.every(Boolean) : null, `${rows.filter(Boolean).length} of ${rows.length} runs`);
}
console.log("\n## Cross-run consistency of arms that do not depend on latency (same seed)\n");
for (const clip of ["wall", "table", "static"]) for (const k of ["EF-sync", "EF-fallback", "DEV-sync"]) for (const S of SEEDS) {
  const vals = LATS.map((L) => get(L, S, clip, k)?.share).filter((v) => v != null);
  const steps = LATS.map((L) => get(L, S, clip, k)?.step).filter((v) => v != null);
  const same = vals.every((v) => v === vals[0]);
  console.log(`- ${clip} ${k} seed ${S}: ${same ? "identical" : "DIFFERS"} across ${vals.length} runs (${[...new Set(vals.map(pct))].join(", ")}${k === "DEV-sync" ? `; steps ${[...new Set(steps.map((x) => x?.toFixed?.(2)))].join(", ")}` : ""})`);
}
```

</details>
