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
fails on any of four arms:

- **gaps** — any gap exceeds **500 ms**: a single stutter;
- **monotonicity** — a backward step in media time whose gap across the
  wrap exceeds 500 ms: not the clip restarting, so a loop `isLoopWrap`
  would fabricate;
- **coverage** — a counted loop (1 to 4) starts more than 500 ms after the
  clip's start or ends more than 500 ms before its end, or no frame of
  loop 5 closes loop 4;
- **cumulative** — in a counted loop, the time by which its gaps exceed
  240.8 ms, summed, is more than **3%** of the clip's duration: a run full
  of small stutters, each under 500 ms.

*Extended the same day, before the session: the cumulative arm, and the
check run over every committed export (below).*

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

**The cumulative bound, beside it.** The per-gap bound guards a single
stutter; it does not guard a run full of small ones — ten gaps of 450 ms
each pass it and together hold about a tenth of the counted video under one
state, more than the adoption rule's 5 points. So each counted loop also
sums the time by which its gaps exceed 240.8 ms, the largest gap a valid
tablet run showed: the excess, not the whole gap, because 240.8 ms of any
gap is what a valid run already holds under one state. Round 2's sixteen
exports show no gap above 240.8 ms at all — the excess is zero in every
loop of every export — and the top of the tail thins fast: on the wall clip
39 gaps of 200.7 ms and 2 of 240.8 in 1,480, on the table clip 162 of
166.7 ms and 12 of 200.0 in 1,478, each frame up seven to twenty times
rarer. A session run, about five times as many gaps, would show a gap above
240.8 ms rarely — about one run in several — and exceed it by a frame, some
40 ms, about 0.4% of a loop. The bound is the margin over that zero: one stutter at the per-gap
bound in a loop of the shortest clip — 259.2 ms of excess in 8.9 s, 2.9% —
rounded up, **3% of each counted loop's duration** (359 ms on the wall
clip, 267 on the table clip, 365 on the static clip). So the two keep
distinct jobs, side by side:

| bound | guards | value | from |
|---|---|---|---|
| per gap | a single stutter | 500 ms | round 2's largest gap, 240.8 ms, doubled and rounded up |
| cumulative, per counted loop | a run full of small stutters | the gaps' excess over 240.8 ms, summed: 3% of the loop's duration | round 2's excess, zero everywhere, plus one stutter at the per-gap bound in a loop of the shortest clip (2.9%), rounded up |

A single stutter at the per-gap bound never trips the cumulative one, two
near it in one loop do, and a run that passes both can hold abnormally at
most 3% of its counted video — 3 points of `trackTimeShare` at the very
worst, under the adoption rule's 5.

**Tested before it is relied on.** It passes the three page exports of the
guard check's real session runs at `c261b77` (the table clip's synchronous
`run=1`, largest gap 100.0 ms, and worker `run=2`, 33.3 ms; the static
clip's stateless `run=5`, 100.0 ms) and all thirty replay exports of the
pre-flight's 100 ms seed 1 and 50 ms seed 2 runs. Made from the real worker
export, it fails a freeze of 0.6 s of media time in loop 2 (a 633.3 ms gap),
a frame of loop 2 shown again half a second later (a backward step that
reads, across the would-be wrap, as a gap of 8.4 s), and a loop 3 that ends
0.6 s early; it passes the same freeze cut to leave a gap of exactly
500 ms. The cumulative arm fails three stutters of about 450 ms in one loop
(678 ms of excess against 267, though each passes the per-gap bound) and
passes one stutter at the bound (259 ms), two of about 350 ms in one loop
(252 ms), and one of about 450 ms in each of the four counted loops (226 ms
a loop).

**Run over every committed export.** `isLoopWrap` feeds the measurement,
not only the checking: `unwrapMediaTimes` counts a loop at each wrap it
reports, and that timeline is what `trackTimeShare` bins and what selects
a run's counted-loop frames; the same reading opens `jitterPx`'s windows and
counts `loopWraps` and the reacquisitions and held-lock losses at a wrap. A
false wrap in a committed run would therefore have corrupted figures
already published from it. So the check ran, all four arms, over every
committed export with frames (`check-committed.mjs`, below):

- **Round 2's sixteen tablet exports pass every arm** — gaps, monotonicity,
  coverage over every loop wholly inside each 300-frame window and at its
  two partial ends, cumulative. No committed round 2 run holds a
  fabricated wrap.
- **The 45 other exports on the three bundled clips** — round 1's, the M2
  runs of 2026-09-26, the sweeps of 2026-09-24, the first runs of
  2026-09-19, Oppo and laptop included — **all pass monotonicity**, and 44
  pass every arm. The one that does not is
  `2026-09-24-tab9-ondevice-stateless-static-mk300-manual-1`, with an
  866.7 ms forward gap: the stall its record already describes ("the server
  used for the manual runs did not support HTTP range requests, so the
  video stalled briefly at every loop"), from which only a `match` p50 — a
  per-frame time, which reads no media time — was published. The check
  found the one documented stall in the committed data.
- **The nine others with frames** — six acquisition tests on clips of their
  own, whose duration no export records, and three camera runs — were read
  for monotonicity alone, which needs no duration: each of the six steps
  back once, to the start of its clip from its end, and the camera runs
  never step back.

**One known failure in the corpus:**
`2026-09-24-tab9-ondevice-stateless-static-mk300-manual-1` fails the gap
arm — its 866.7 ms gap is the stall its record documents, the 2026-09-24
manual runs having been served without HTTP range requests — and it is the
only committed export that fails any arm; `check-committed.mjs` labels it
so. A run of the check over the corpus that finds this failure and no other
has found nothing new.

So `isLoopWrap`'s reading of any backward step as a wrap is a latent defect
in the measurement that no committed export triggers, and no published
figure rests on a fabricated loop. For the session, the stall check's
monotonicity arm refuses such a run before it is read; hardening
`isLoopWrap` itself is a change to a path the guard check covers, left for
after the campaign and tracked in
[#96](https://github.com/webarkit/webarkit/issues/96).

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

Run from the repository root, the four files side by side (`check-committed.mjs` imports `stall-check.mjs`).

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
//   node stall-check.mjs <export.json>   — exit 0 if every arm passes, 1 if any fails.
// It reads only the export: the frames' media times, `clipDurationS` and `loops`.
//
// A gap is the media time between two consecutive processed frames. Across a
// loop wrap (media time going back) it is the clip's end after the first frame
// plus the next frame's media time, so a backward step that is not the clip
// restarting reads as a gap of nearly the whole clip. Four arms:
//   gaps          — no gap above BOUND_MS: a single stutter;
//   monotonicity  — every backward step is the clip restarting (its gap across
//                   the wrap within BOUND_MS): no fabricated loop;
//   coverage      — every loop read starts within BOUND_MS of the clip's start
//                   and ends within BOUND_MS of its end;
//   cumulative    — in every loop read, the time by which gaps exceed
//                   DEVICE_MAX_MS, summed, is at most EXCESS_FRACTION of the
//                   clip's duration: a run full of small stutters.
// A session export (it has `loops`) is read over its counted loops, and needs a
// frame of the loop after them. An older export, a window of its run, is read
// over every loop wholly inside the window, and the inner ends of the two
// partial ones.
import { readFileSync } from "node:fs";
const BOUND_MS = 500; // round 2's largest gap on the tablet, 240.8 ms, doubled and rounded up
const DEVICE_MAX_MS = 240.8; // round 2's largest gap on the tablet: what a valid run already holds under one state
const EXCESS_FRACTION = 0.03; // one stutter at BOUND_MS in a loop of the shortest clip (259.2 ms of 8.9 s, 2.9%), rounded up
// For exports older than `clipDurationS`: the bundled clips' durations (ffprobe).
const CLIP_S = { "pinball-bench.mp4": 11.959866, "pinball-bench-table.mp4": 8.9, "pinball-static.mp4": 12.166667 };

export function stallCheck(e) {
    const D = e.clipDurationS ?? CLIP_S[e.bundledClip];
    const f = e.frames ?? [];
    const fails = [];
    if (!(D > 0) || f.length < 2) {
        return { fails: [`no clip duration or no frames to read (${D}, ${f.length} frames)`], maxGap: null, loops: 0 };
    }
    let loop = 0;
    let maxGap = 0;
    let maxAt = null;
    const span = new Map(); // loop -> [first media time, last media time]
    const excess = new Map(); // loop -> ms by which its gaps exceed DEVICE_MAX_MS
    span.set(0, [f[0].mediaTimeSeconds, f[0].mediaTimeSeconds]);
    for (let i = 1; i < f.length; i++) {
        const prev = f[i - 1].mediaTimeSeconds;
        const cur = f[i].mediaTimeSeconds;
        if (!Number.isFinite(prev) || !Number.isFinite(cur)) {
            fails.push(`frame ${i}: no finite media time`);
            return { fails, maxGap: null, loops: loop };
        }
        let gapMs;
        if (cur < prev) {
            gapMs = (D - prev + cur) * 1000;
            if (gapMs > BOUND_MS) {
                fails.push(
                    `monotonicity: frame ${i}: media time steps back from ${prev.toFixed(3)} s to ${cur.toFixed(3)} s, which is not the clip restarting (${gapMs.toFixed(0)} ms across the wrap)`,
                );
            }
            loop++;
            span.set(loop, [cur, cur]);
        } else {
            gapMs = (cur - prev) * 1000;
            span.get(loop)[1] = cur;
        }
        if (gapMs > maxGap) {
            maxGap = gapMs;
            maxAt = i;
        }
        if (gapMs > DEVICE_MAX_MS) excess.set(loop, (excess.get(loop) ?? 0) + gapMs - DEVICE_MAX_MS);
    }
    if (maxGap > BOUND_MS) fails.push(`gaps: frame ${maxAt}: a gap of ${maxGap.toFixed(1)} ms in media time, above ${BOUND_MS} ms`);
    // The loops read: a session export's counted ones; an older window's whole ones.
    let read;
    if (e.loops) {
        const { firstLoop = 1, loopCount = 4 } = e.loops;
        read = Array.from({ length: loopCount }, (_, k) => firstLoop + k);
        if (loop < firstLoop + loopCount) fails.push(`coverage: no frame of loop ${firstLoop + loopCount}, which closes loop ${firstLoop + loopCount - 1}`);
    } else {
        read = Array.from({ length: Math.max(0, loop - 1) }, (_, k) => k + 1);
        // The window's partial ends: the first loop must reach the clip's end, the last must start at its start.
        if (loop > 0 && (D - span.get(0)[1]) * 1000 > BOUND_MS) fails.push(`coverage: the window's first loop ends at ${span.get(0)[1].toFixed(3)} s, short of the clip's end`);
        if (loop > 0 && span.get(loop)[0] * 1000 > BOUND_MS) fails.push(`coverage: the window's last loop starts at ${span.get(loop)[0].toFixed(3)} s, not the clip's start`);
    }
    for (const k of read) {
        const s = span.get(k);
        if (!s) {
            fails.push(`coverage: loop ${k}: no frame`);
            continue;
        }
        if (s[0] * 1000 > BOUND_MS || (D - s[1]) * 1000 > BOUND_MS) {
            fails.push(`coverage: loop ${k} covers ${s[0].toFixed(3)}–${s[1].toFixed(3)} s of a ${D.toFixed(3)} s clip, short by more than ${BOUND_MS} ms at an end`);
        }
        const x = excess.get(k) ?? 0;
        if (x > EXCESS_FRACTION * D * 1000) {
            fails.push(`cumulative: loop ${k}: its gaps exceed ${DEVICE_MAX_MS} ms by ${x.toFixed(0)} ms in all, above ${(100 * EXCESS_FRACTION).toFixed(0)}% of the clip (${(EXCESS_FRACTION * D * 1000).toFixed(0)} ms)`);
        }
    }
    const worstExcess = Math.max(0, ...read.map((k) => excess.get(k) ?? 0));
    return { fails, maxGap, maxAt, loops: loop, read, worstExcess, D };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
    const r = stallCheck(JSON.parse(readFileSync(process.argv[2], "utf8")));
    if (r.maxGap !== null) {
        console.log(`largest gap ${r.maxGap.toFixed(1)} ms (frame ${r.maxAt}); loops seen 0–${r.loops}, read ${r.read.join(", ") || "none"}; most excess over ${DEVICE_MAX_MS} ms in a loop read ${r.worstExcess.toFixed(0)} ms; bounds ${BOUND_MS} ms a gap, ${(100 * EXCESS_FRACTION).toFixed(0)}% of a loop in excess`);
    }
    for (const line of r.fails) console.log(`FAIL ${line}`);
    console.log(r.fails.length ? "stall check: FAIL" : "stall check: PASS");
    process.exit(r.fails.length ? 1 : 0);
}
```

</details>

<details>
<summary><code>check-committed.mjs</code>: the stall check over every committed export with frames</summary>

```js
// The stall check over every committed export that has frames on a bundled
// clip: round 2's sixteen tablet exports, then the rest. Run from the
// repository root, with stall-check.mjs beside this script.
import { readFileSync, readdirSync } from "node:fs";
import { stallCheck } from "./stall-check.mjs";
// Failures already explained, so that a run over the corpus does not rediscover them.
const KNOWN = {
  "2026-09-24-tab9-ondevice-stateless-static-mk300-manual-1.json":
    "known: the 866.7 ms gap is the stall its record documents (the 2026-09-24 manual runs were served without HTTP range requests); the one committed export that fails any arm",
};
const all = readdirSync("docs/benchmarks").filter((f) => f.endsWith(".json")).sort();
const r2 = all.filter((f) => /^2026-09-29-tab9-tuning-r2-/.test(f));
const rest = all.filter((f) => !r2.includes(f));
const row = (name) => {
  const e = JSON.parse(readFileSync(`docs/benchmarks/${name}`, "utf8"));
  if (!Array.isArray(e.frames) || e.frames.length < 2) return { name, skip: "no frames" };
  const r = stallCheck(e);
  if (r.maxGap === null) return { name, skip: r.fails[0] };
  const arm = (a) => (r.fails.some((l) => l.startsWith(a + ":")) ? "FAIL" : "pass");
  return { name, clip: e.bundledClip, mode: e.mode, frames: e.frames.length, maxGap: r.maxGap, wraps: r.loops, read: r.read.length, worstExcess: r.worstExcess, gaps: arm("gaps"), mono: arm("monotonicity"), cov: arm("coverage"), cum: arm("cumulative"), fails: r.fails };
};
for (const [title, list] of [["Round 2's sixteen tablet exports", r2], ["Every other committed export with frames", rest]]) {
  console.log(`\n### ${title}\n\n| export | clip, mode | frames | largest gap, ms | wraps | whole loops read | gaps | monotonicity | coverage | cumulative (most excess in a loop, ms) |\n|---|---|---|---|---|---|---|---|---|---|`);
  let n = 0, pass = 0;
  const skipped = [];
  for (const name of list) {
    const x = row(name);
    if (x.skip) { skipped.push(`${name} (${x.skip})`); continue; }
    n++;
    if (!x.fails.length) pass++;
    console.log(`| ${name.replace(/\.json$/, "")} | ${(x.clip ?? "—").replace(".mp4", "")}, ${x.mode} | ${x.frames} | ${x.maxGap.toFixed(1)} | ${x.wraps} | ${x.read} | ${x.gaps} | ${x.mono} | ${x.cov} | ${x.cum} (${x.worstExcess.toFixed(0)}) |`);
    for (const l of x.fails) console.log(`|  | ${l} | | | | | | | | |`);
    if (x.fails.length && KNOWN[name]) console.log(`|  | ${KNOWN[name]} | | | | | | | | |`);
  }
  console.log(`\n${pass} of ${n} pass every arm.${skipped.length ? " Not read: " + skipped.join("; ") + "." : ""}`);
}
```

</details>
