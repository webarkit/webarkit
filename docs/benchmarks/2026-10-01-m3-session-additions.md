# 2026-10-01 — Two additions to M3's plan, before the device session

Both come from what the desktop pre-flight found, both were made before the
device session and with none of its data, and neither changes a threshold.
They are written into the plan
([`README.md`](./README.md#2026-09-29--m3-detection-off-the-frame-measured)):
the first beside the predictions table, the second in the runbook's step 7.
Nothing here touches the paths the guard check covers (`examples/bench-nft.html`,
`examples/js`, `scripts`, `packages`): the check is a script over the
export, recorded below, so [the guard check](./2026-09-30-m3-guard-check.md)
at `c261b77` still covers the code the session runs.

## Row five's refusal requires corroboration

The pre-flight showed that which frames each mode's chain visits can open
7.7 points in the raw confirm rate with identical confirmation behaviour
(on the 95 pairs where both modes detected the same frame and ran the first
step on the same frame, 92 agreed in outcome). A refusal on row five's
5-point bound therefore needs corroboration, and the route that would give
it — reading the comparison on pairs of matched frames — exists on the
desktop by construction, since both modes replay one deterministic clip.
On the tablet the two modes are separate runs whose processed frames are
chosen by real time. No committed export has a worker run, so the upper
bound was measured instead: round 2's three repeated synchronous runs of
the baseline target on the wall clip
(`2026-09-29-tab9-tuning-r2-baseline-wall-{1,2,3}.json`), the most
favourable case there is — same mode, same clip, each started at media
time 0, so their loops count the same passes. A frame is keyed by its pass
and its media time.

| runs | processed frames shared | detections on the same frame | detections that found the target, on the same frame | first steps on the same frame | detection locks matched: the same detected frame and the same first-step frame |
|---|---|---|---|---|---|
| 1–2 | 133 of 300 and 300 (44.3%) | 58 of 156 and 151 (37.2%, 38.4%) | 43 of 120 and 120 (35.8%) | 34 of 120 and 120 (28.3%) | 25 of 120 and 120 (20.8%) |
| 1–3 | 122 of 300 and 300 (40.7%) | 47 of 156 and 154 (30.1%, 30.5%) | 35 of 120 and 126 (29.2%, 27.8%) | 24 of 120 and 126 (20.0%, 19.0%) | 19 of 120 and 126 (15.8%, 15.1%) |
| 2–3 | 148 of 300 and 300 (49.3%) | 65 of 151 and 154 (43.0%, 42.2%) | 51 of 120 and 126 (42.5%, 40.5%) | 48 of 120 and 126 (40.0%, 38.1%) | 37 of 120 and 126 (30.8%, 29.4%) |

Each export is a 300-frame window (the run's last 300 frames, from late in
loop 0 into loop 3), and the windows cover the clip over slightly different
spans. Within the span both windows of a pair cover, about 30 s:

| runs | common span, s | frames shared within it | detection locks within it, matched | matched locks: confirmed in both / in neither / in one only |
|---|---|---|---|---|
| 1–2 | 30.2 | 133 of 281 and 291 (47.3%, 45.7%) | 25 of 119 and 118 | 4 / 20 / 1 |
| 1–3 | 30.3 | 122 of 283 and 287 (43.1%, 42.5%) | 19 of 119 and 122 | 3 / 16 / 0 |
| 2–3 | 31.1 | 148 of 300 and 293 (49.3%, 50.5%) | 37 of 120 and 125 | 2 / 34 / 1 |

**Pairs exist, and they agree, but there are too few to read row five
from.** Matched locks agree in outcome 79 times in 81 — a pair is a clean
comparison — but 19 to 37 of them per pair of runs over about two and a half
loops is at most 30 to 60 over a session run's four, and only about one in
nine of them confirms. A 5-point difference would then rest on two or three
discordant pairs, against about one that two runs of the same mode produce
by chance. That is in the most favourable case: a synchronous run and a
worker run can only share fewer, since their chains part after any
detection that finds nothing, and the worker processes waiting frames the
synchronous mode skips. So the plan takes the second route: on the device
row five is descriptive, recorded without a verdict, and the lock verdict
rests on row four, which was already the adoption gate.

## A per-run check for a stalled clip

The guard re-check saw a video hang and the page not notice it. The
runbook's three-minute limit on `done` catches a total hang. A partial
stall — the clip freezes for some seconds and resumes, the run completes —
passed every check the runbook had, while `trackTimeShare`, which weights
by video time and decides adoption, holds a state over the frozen span.

**Was it already detectable? The data is in every export; nothing read it.**
Each frame records its `mediaTimeSeconds` (and its `timestampMs`), but:
`isLoopWrap` reads any backward step in media time as a loop wrap, so a
backward step in the middle of the clip silently moves the run's timeline on
by a whole clip; nothing reads the forward gap between two frames; and
`trackTimeShare.complete` checks only the run's two ends. So a check was
added, computed from the export, outside the guarded paths:
`stall-check.mjs`, below. A **gap** is the media time between two
consecutive processed frames; across a loop wrap it is the clip's end after
the first frame plus the next frame's media time, so a backward step that is
not the clip restarting reads as a gap of nearly the whole clip. The run
fails if:

- any gap, across a wrap included, exceeds **500 ms** — which covers a
  forward jump and a backward step that is not a loop restart;
- any counted loop (1 to 4) starts more than 500 ms after the clip's start
  or ends more than 500 ms before its end;
- no frame of loop 5 closes loop 4.

**The bound, from the tablet.** The largest gap in each of round 2's sixteen
committed tablet exports (`2026-09-29-tab9-tuning-r2-*.json`, real runs on
these clips, known good):

| export | clip, mode | frames | largest gap within a loop, ms | its p99, ms | largest gap across a wrap, ms | largest wall-clock gap, ms |
|---|---|---|---|---|---|---|
| baseline-static-1, -2, -3 | static, tracking | 300 each | 100.0, 100.0, 100.0 | 100.0 | 33.3 | 103.9, 118.2, 97.7 |
| p32-s16-static, p48-s16-static | static, tracking | 300 each | 100.0, 100.0 | 66.7, 100.0 | 33.3 | 87.8, 90.4 |
| stateless-static | static, stateless | 300 | 200.0 | 166.7 | 133.3 | 196.5 |
| baseline-table-1, -2, -3 | table, tracking | 300 each | 200.0, 200.0, 200.0 | 166.7 | 33.3 | 206.1, 191.3, 217.3 |
| p32-s16-table, p48-s16-table | table, tracking | 300 each | 166.7, 200.0 | 166.7 | 33.3 | 188.6, 201.7 |
| baseline-wall-1, -2, -3 | wall, tracking | 300 each | 200.7, 200.7, 240.8 | 200.7 | 120.4 | 217.3, 218.2, 234.1 |
| p32-s16-wall, p48-s16-wall | wall, tracking | 300 each | 200.7, 240.8 | 160.5, 200.7 | 120.4 | 203.7, 249.6 |

The largest is 240.8 ms, six frames of the wall clip, a synchronous
detection's tick and the frames it skips; the worker removes detection from
the loop, so its gaps are shorter. The bound is that doubled and rounded up,
500 ms: a session run is about five times as long as these 300-frame
windows, so its longest normal gap can be rarer than any they saw, and a
gap under 500 ms can hold at most half a second of video under one state —
about 1% of the wall clip's 47.8 counted seconds, a fifth of the adoption
bound.

**Tested before it is relied on.** It passes the three page exports of the
guard check's real session runs at `c261b77` (the table clip's synchronous
`run=1`, largest gap 100.0 ms, and worker `run=2`, 33.3 ms; the static
clip's stateless `run=5`, 100.0 ms) and all thirty replay exports of the
pre-flight's 100 ms seed 1 and 50 ms seed 2 runs. Made from the real worker
export, it fails a freeze of 0.6 s of media time in loop 2 (a 633.3 ms gap),
a frame of loop 2 shown again half a second later (a backward step that
reads, across the would-be wrap, as a gap of 8.4 s), and a loop 3 that ends
0.6 s early; it passes the same freeze cut to leave a gap of exactly
500 ms.

What firing means is the runbook's rule for every step-7 check: the run is
invalid, not a result, and is run again once in its place; invalid twice,
the session stops until the cause is explained.

## Dates

The plan is dated 2026-09-29; the desktop pre-flight ran on 2026-09-30, and
its record's corrections and the guard checks were made the same day,
after it. These additions are dated 2026-10-01, and the device session runs
on 2026-10-01 after them, so its exports carry that date. No day is
missing between the pre-flight and the session: they are consecutive.

## The scripts

Run from the repository root.

<details>
<summary><code>pairing.mjs</code>: how many frames, detections and first steps two tablet runs share</summary>

```js
// How many frames, detections and first steps two device runs share: round 2's
// three repeated synchronous runs of the baseline target on the wall clip, the
// most favourable case for pairing (same mode, same clip, same start), so an
// upper bound on what two runs in different modes can share. A frame is keyed
// by its pass through the clip and its media time (microseconds): every run
// starts at media time 0, so its loops count the same passes.
import { readFileSync } from "node:fs";
const runs = [1, 2, 3].map((n) => {
  const e = JSON.parse(readFileSync(`docs/benchmarks/2026-09-29-tab9-tuning-r2-baseline-wall-${n}.json`, "utf8"));
  if (e.startAtSeconds !== 0) throw new Error(`run ${n} did not start at media time 0`);
  const f = e.frames;
  let loop = 0;
  const key = f.map((x, i) => {
    if (i > 0 && x.mediaTimeSeconds < f[i - 1].mediaTimeSeconds) loop++;
    return `${loop}:${Math.round(x.mediaTimeSeconds * 1e6)}`;
  });
  const frames = new Set(key);
  const detections = new Set(key.filter((_, i) => f[i].state !== "TRACK")); // the M2 tracker detects on every frame that is not TRACK
  const found = new Set(key.filter((_, i) => f[i].state === "DETECT"));
  const steps = new Set(), locks = new Set();
  for (let i = 0; i + 1 < f.length; i++) {
    if (f[i].state === "DETECT" && f[i + 1].tracking) { steps.add(key[i + 1]); locks.add(`${key[i]}>${key[i + 1]}`); }
  }
  return { n, frames, detections, found, steps, locks };
});
const shared = (a, b) => [...a].filter((k) => b.has(k)).length;
const pct = (x, n) => `${x}/${n} (${n ? ((100 * x) / n).toFixed(1) : "—"}%)`;
console.log("| runs | processed frames shared | detections on the same frame | detections that found the target, same frame | first steps on the same frame | detection locks matched (same detected frame, same first-step frame) |");
console.log("|---|---|---|---|---|---|");
for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
  const a = runs[i], b = runs[j];
  const row = [["frames"], ["detections"], ["found"], ["steps"], ["locks"]].map(([k]) => {
    const s = shared(a[k], b[k]);
    return `${pct(s, a[k].size)} of ${a.n}; ${pct(s, b[k].size)} of ${b.n}`;
  });
  console.log(`| ${a.n}–${b.n} | ${row.join(" | ")} |`);
}

// The same, within the span of the clip both windows cover, and the outcome
// agreement of the matched locks: the noise a pair-matched reading has between
// two device runs that should not differ at all.
const D = 11.959866;
const reload = (n) => {
  const f = JSON.parse(readFileSync(`docs/benchmarks/2026-09-29-tab9-tuning-r2-baseline-wall-${n}.json`, "utf8")).frames;
  let loop = 0;
  const t = f.map((x, i) => { if (i > 0 && x.mediaTimeSeconds < f[i - 1].mediaTimeSeconds) loop++; return loop * D + x.mediaTimeSeconds; });
  return { f, t };
};
console.log("\n| runs | common span, s | frames shared within it | locks within it, matched | matched locks: both confirmed / neither / one only |");
console.log("|---|---|---|---|---|");
for (const [i, j] of [[1, 2], [1, 3], [2, 3]]) {
  const A = reload(i), B = reload(j);
  const lo = Math.max(A.t[0], B.t[0]), hi = Math.min(A.t[A.t.length - 1], B.t[B.t.length - 1]);
  const keyOf = (t) => Math.round(t * 1e6);
  const inSpan = (R) => R.t.map((t, k) => (t >= lo && t <= hi ? k : -1)).filter((k) => k >= 0);
  const fa = new Set(inSpan(A).map((k) => keyOf(A.t[k]))), fb = new Set(inSpan(B).map((k) => keyOf(B.t[k])));
  const lockMap = (R) => {
    const m = new Map();
    for (const k of inSpan(R)) if (R.f[k].state === "DETECT" && R.f[k + 1]?.tracking && R.t[k + 1] <= hi) m.set(`${keyOf(R.t[k])}>${keyOf(R.t[k + 1])}`, R.f[k + 1].state === "TRACK");
    return m;
  };
  const la = lockMap(A), lb = lockMap(B);
  let both = 0, neither = 0, one = 0;
  for (const [k, ca] of la) if (lb.has(k)) { const cb = lb.get(k); if (ca && cb) both++; else if (!ca && !cb) neither++; else one++; }
  const shared = [...fa].filter((k) => fb.has(k)).length;
  console.log(`| ${i}–${j} | ${(hi - lo).toFixed(1)} | ${shared} of ${fa.size} and ${fb.size} (${((100 * shared) / fa.size).toFixed(1)}%, ${((100 * shared) / fb.size).toFixed(1)}%) | ${both + neither + one} of ${la.size} and ${lb.size} | ${both} / ${neither} / ${one} |`);
}
```

</details>

<details>
<summary><code>gaps.mjs</code>: the largest media-time gaps in round 2's tablet exports</summary>

```js
// The largest gap in media time between consecutive processed frames, in every
// committed round 2 tablet export: within a loop, and across a loop wrap
// (the clip's end after the last frame, plus the next frame's media time).
import { readFileSync, readdirSync } from "node:fs";
const D = { "pinball-bench.mp4": 11.959866, "pinball-bench-table.mp4": 8.9, "pinball-static.mp4": 12.166667 };
const files = readdirSync("docs/benchmarks").filter((f) => /^2026-09-29-tab9-tuning-r2-.*\.json$/.test(f)).sort();
console.log("| export | clip | mode | frames | largest gap within a loop, ms | its p99, ms | largest gap across a wrap, ms | wraps | largest wall-clock gap, ms |");
console.log("|---|---|---|---|---|---|---|---|---|");
const worst = {};
for (const name of files) {
  const e = JSON.parse(readFileSync(`docs/benchmarks/${name}`, "utf8"));
  const f = e.frames, d = D[e.bundledClip];
  const within = [], across = [], wall = [];
  let back = 0;
  for (let i = 1; i < f.length; i++) {
    const g = f[i].mediaTimeSeconds - f[i - 1].mediaTimeSeconds;
    if (g < 0) { across.push((d - f[i - 1].mediaTimeSeconds + f[i].mediaTimeSeconds) * 1000); back++; }
    else within.push(g * 1000);
    wall.push(f[i].timestampMs - f[i - 1].timestampMs);
  }
  within.sort((a, b) => a - b);
  const p99 = within[Math.min(within.length - 1, Math.floor(0.99 * (within.length - 1) + 0.5))];
  const maxW = within[within.length - 1], maxA = across.length ? Math.max(...across) : null, maxWall = Math.max(...wall);
  const k = `${e.bundledClip} ${e.mode}`;
  worst[k] = Math.max(worst[k] ?? 0, maxW, maxA ?? 0);
  console.log(`| ${name.replace("2026-09-29-tab9-tuning-r2-", "").replace(".json", "")} | ${e.bundledClip.replace(".mp4", "")} | ${e.mode} | ${f.length} | ${maxW.toFixed(1)} | ${p99.toFixed(1)} | ${maxA === null ? "—" : maxA.toFixed(1)} | ${back} | ${maxWall.toFixed(1)} |`);
}
console.log("\nlargest gap per clip and mode, within a loop or across a wrap:", JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
```

</details>

<details>
<summary><code>stall-check.mjs</code>: the stall check, over one export (<code>node stall-check.mjs &lt;export.json&gt;</code>; exit 0 pass, 1 fail)</summary>

```js
// The stall check of the M3 runbook's step 7, over one page export:
//   node stall-check.mjs <export.json>   — exit 0 if every check passes, 1 if any fails.
// It reads only the export: the frames' media times, `clipDurationS` and `loops`.
// A gap is the media time between two consecutive processed frames; across a
// loop wrap (media time going back) it is the clip's end after the first frame
// plus the next frame's media time, so a backward step that is not the clip
// restarting reads as a gap of almost the whole clip.
import { readFileSync } from "node:fs";
const BOUND_MS = 500; // round 2's largest gap on the tablet, 240.8 ms, doubled and rounded up (see the runbook, step 7)
const e = JSON.parse(readFileSync(process.argv[2], "utf8"));
const D = e.clipDurationS;
const { firstLoop = 1, loopCount = 4 } = e.loops ?? {};
const f = e.frames ?? [];
const fails = [];
if (!(D > 0) || f.length < 2) fails.push(`no clip duration or no frames to read (clipDurationS ${D}, ${f.length} frames)`);
else {
  let loop = 0, maxGap = 0, maxAt = null;
  const loops = new Map(); // loop -> [first media time, last media time]
  const note = (k, m) => { const s = loops.get(k); if (!s) loops.set(k, [m, m]); else s[1] = m; };
  note(0, f[0].mediaTimeSeconds);
  for (let i = 1; i < f.length; i++) {
    const prev = f[i - 1].mediaTimeSeconds, cur = f[i].mediaTimeSeconds;
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) { fails.push(`frame ${i}: no finite media time`); break; }
    let gapMs;
    if (cur < prev) {
      gapMs = (D - prev + cur) * 1000; // a loop restart: the rest of the clip, then the new loop's start
      if (gapMs > BOUND_MS) fails.push(`frame ${i}: media time steps back from ${prev.toFixed(3)} s to ${cur.toFixed(3)} s, which is not the clip restarting (${gapMs.toFixed(0)} ms across the wrap)`);
      loop++;
    } else gapMs = (cur - prev) * 1000;
    if (gapMs > maxGap) { maxGap = gapMs; maxAt = i; }
    note(loop, cur);
  }
  if (maxGap > BOUND_MS) fails.push(`frame ${maxAt}: a gap of ${maxGap.toFixed(1)} ms in media time, above the ${BOUND_MS} ms bound`);
  for (let k = firstLoop; k < firstLoop + loopCount; k++) {
    const s = loops.get(k);
    if (!s) { fails.push(`loop ${k}: no frame`); continue; }
    if (s[0] * 1000 > BOUND_MS || (D - s[1]) * 1000 > BOUND_MS) fails.push(`loop ${k}: covers ${s[0].toFixed(3)}–${s[1].toFixed(3)} s of a ${D.toFixed(3)} s clip, short by more than ${BOUND_MS} ms at an end`);
  }
  if (!loops.has(firstLoop + loopCount)) fails.push(`no frame of loop ${firstLoop + loopCount}, which closes loop ${firstLoop + loopCount - 1}`);
  console.log(`largest gap ${maxGap.toFixed(1)} ms (frame ${maxAt}); loops seen 0–${loop}; bound ${BOUND_MS} ms`);
}
for (const line of fails) console.log(`FAIL ${line}`);
console.log(fails.length ? "stall check: FAIL" : "stall check: PASS");
process.exit(fails.length ? 1 : 0);
```

</details>
