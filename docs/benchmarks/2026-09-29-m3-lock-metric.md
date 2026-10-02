# 2026-09-29 — M3: the lock metric, tested before any device time

The evidence behind "The lock metric, tested before any device time" in
[`README.md`](./README.md) ("2026-09-29 — M3: detection off the frame,
measured"). The decimation test and the whole-loop figures were computed
from exports already committed — the 24 tablet exports of tuning rounds 1
and 2, all in the synchronous tracking mode — by the two scripts at the end.
The checks' findings and the gate options' figures came from scratch scripts
and replay models run during the verification; they are not committed and
are quoted as reported, and the one the plan's decisions rest on, the
fallback's self-refusal, is re-run by committed code in the pre-flight.
Nothing ran on a device, and no worker code existed.

## The decimation test, as registered

`trackTimeShare` as first defined: 10 ms bins over the export's window
(the last 300 processed frames), cut into stretches at loop wraps, each bin
taking the state of the most recent processed frame at or before its start,
the last frame of a stretch contributing nothing. The script lays each
stretch's bins from its first kept record, not on a grid fixed to media
time; laid on a fixed grid, the same test moves the share by at most 3.64
and 5.74 points instead of 3.67 and 5.76, and the verdict is the same. Each run
recomputed from every second and every fourth processed record — from the
first record, and at every starting record — and, separately, with every
second frame inside a run of equal states removed (never a frame at which
the state changes). Moves are in points of the share.

| run | frames | TRACK per frame | trackTimeShare (10 ms grid) | every 2nd, phase 0 | every 4th, phase 0 | every 2nd, both phases: range of Δ | every 4th, four phases: range of Δ (mean Δ) | inside runs thinned |
|---|---|---|---|---|---|---|---|---|
| r1-baseline-static-repeat | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r1-baseline-static | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r1-baseline-table | 300 | 75.67% | 59.65% | 61.42 (+1.78) | 62.27 (+2.62) | 1.78 to 2.17 | 2.62 to 5.22 (+3.83) | +0.00 |
| r1-baseline-wall | 300 | 48.33% | 35.31% | 37.64 (+2.33) | 41.00 (+5.69) | 2.14 to 2.33 | -1.38 to 7.45 (+3.43) | +0.00 |
| r1-iter20-static | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r1-iter20-table | 300 | 76.67% | 60.64% | 63.80 (+3.16) | 66.18 (+5.54) | -0.60 to 3.16 | -3.61 to 5.54 (+1.90) | +0.00 |
| r1-iter20-wall | 300 | 47.33% | 32.48% | 32.61 (+0.13) | 36.37 (+3.89) | 0.13 to 3.64 | -0.42 to 6.06 (+3.27) | +0.00 |
| r1-stateless-static | 300 | 0.00% | 0.00% | 0.00 (+0.00) | 0.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r2-baseline-static-1 | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r2-baseline-static-2 | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r2-baseline-static-3 | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r2-baseline-table-1 | 300 | 68.00% | 50.38% | 54.05 (+3.67) | 56.14 (+5.76) | 0.25 to 3.67 | -0.22 to 5.76 (+3.89) | +0.00 |
| r2-baseline-table-2 | 300 | 75.67% | 59.82% | 58.86 (-0.96) | 61.52 (+1.70) | -0.96 to 3.64 | -2.93 to 6.12 (+1.88) | +0.00 |
| r2-baseline-table-3 | 300 | 70.67% | 53.23% | 53.09 (-0.14) | 57.65 (+4.42) | -0.14 to 3.99 | -2.21 to 9.18 (+3.27) | +0.00 |
| r2-baseline-wall-1 | 300 | 48.00% | 35.43% | 36.05 (+0.62) | 37.16 (+1.73) | 0.62 to 2.81 | -1.03 to 8.06 (+2.30) | +0.00 |
| r2-baseline-wall-2 | 300 | 49.67% | 35.01% | 34.99 (-0.03) | 38.12 (+3.11) | -0.03 to 4.00 | -1.96 to 6.24 (+2.85) | +0.00 |
| r2-baseline-wall-3 | 300 | 48.67% | 35.10% | 36.59 (+1.49) | 37.60 (+2.49) | 1.49 to 1.51 | 0.92 to 3.39 (+2.18) | +0.00 |
| r2-p32-s16-static | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r2-p32-s16-table | 300 | 77.67% | 60.01% | 60.41 (+0.41) | 62.90 (+2.89) | 0.41 to 0.93 | -1.08 to 2.89 (+1.30) | +0.00 |
| r2-p32-s16-wall | 300 | 45.00% | 30.16% | 32.38 (+2.22) | 26.71 (-3.46) | 2.22 to 4.12 | -3.46 to 13.06 (+5.51) | +0.00 |
| r2-p48-s16-static | 300 | 100.00% | 100.00% | 100.00 (+0.00) | 100.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |
| r2-p48-s16-table | 300 | 78.33% | 62.25% | 63.97 (+1.72) | 62.23 (-0.03) | 0.74 to 1.72 | -0.03 to 4.89 (+1.95) | +0.00 |
| r2-p48-s16-wall | 300 | 56.67% | 41.04% | 40.75 (-0.29) | 44.11 (+3.08) | -0.29 to 4.08 | 0.67 to 8.34 (+3.91) | +0.00 |
| r2-stateless-static | 300 | 0.00% | 0.00% | 0.00 (+0.00) | 0.00 (+0.00) | 0.00 to 0.00 | 0.00 to 0.00 (+0.00) | +0.00 |

largest |Δ|, points: every 2nd from the first 3.67, every 4th from the first 5.76; any phase: 4.12 and 13.06; four-phase mean 5.51; inside runs thinned 0.00

## Whole loops

The definition the plan adopts: media time unwrapped onto one timeline
(loop *k* covers [*k*·D, (*k* + 1)·D), D the clip's duration: its last
frame's media time plus one frame period), 10 ms bins over the loops that
start at or after the first wrap and end before the last frame, each bin
holding the state of the most recent processed frame at or before its
start, across a wrap. These committed runs hold zero to three whole loops
each; the plan's runs will hold four. The repeat spread per clip is
over the synchronous baselines of both rounds.

| run | clip | loops counted | whole-loop share | per-loop shares |
|---|---|---|---|---|
| r1-baseline-static-repeat | pinball-static.mp4 | 0 | —% |  |
| r1-baseline-static | pinball-static.mp4 | 1 | 100.00% | 100.0 |
| r1-baseline-table | pinball-bench-table.mp4 | 2 | 61.52% | 58.7, 64.4 |
| r1-baseline-wall | pinball-bench.mp4 | 1 | 35.87% | 35.9 |
| r1-iter20-static | pinball-static.mp4 | 1 | 100.00% | 100.0 |
| r1-iter20-table | pinball-bench-table.mp4 | 2 | 62.87% | 61.8, 63.9 |
| r1-iter20-wall | pinball-bench.mp4 | 1 | 37.54% | 37.5 |
| r1-stateless-static | pinball-static.mp4 | 2 | 0.00% | 0.0, 0.0 |
| r2-baseline-static-1 | pinball-static.mp4 | 1 | 100.00% | 100.0 |
| r2-baseline-static-2 | pinball-static.mp4 | 1 | 100.00% | 100.0 |
| r2-baseline-static-3 | pinball-static.mp4 | 1 | 100.00% | 100.0 |
| r2-baseline-table-1 | pinball-bench-table.mp4 | 3 | 52.21% | 52.2, 51.9, 52.5 |
| r2-baseline-table-2 | pinball-bench-table.mp4 | 2 | 60.62% | 57.6, 63.6 |
| r2-baseline-table-3 | pinball-bench-table.mp4 | 3 | 54.38% | 52.7, 56.5, 53.9 |
| r2-baseline-wall-1 | pinball-bench.mp4 | 2 | 37.00% | 40.2, 33.8 |
| r2-baseline-wall-2 | pinball-bench.mp4 | 2 | 38.50% | 35.1, 41.9 |
| r2-baseline-wall-3 | pinball-bench.mp4 | 2 | 36.87% | 34.9, 38.9 |
| r2-p32-s16-static | pinball-static.mp4 | 0 | —% |  |
| r2-p32-s16-table | pinball-bench-table.mp4 | 2 | 65.39% | 74.6, 56.2 |
| r2-p32-s16-wall | pinball-bench.mp4 | 2 | 30.14% | 32.9, 27.4 |
| r2-p48-s16-static | pinball-static.mp4 | 0 | —% |  |
| r2-p48-s16-table | pinball-bench-table.mp4 | 2 | 64.33% | 62.5, 66.2 |
| r2-p48-s16-wall | pinball-bench.mp4 | 2 | 39.05% | 37.5, 40.6 |
| r2-stateless-static | pinball-static.mp4 | 3 | 0.00% | 0.0, 0.0, 0.0 |

clip durations (s): {"pinball-static.mp4":12.167,"pinball-bench-table.mp4":8.9,"pinball-bench.mp4":11.96}
pinball-static.mp4: baseline whole-loop shares 100.00 / 100.00 / 100.00 / 100.00 (range 0.00); per-loop sd 0.00 over 4 loops
pinball-bench-table.mp4: baseline whole-loop shares 61.52 / 52.21 / 60.62 / 54.38 (range 9.31); per-loop sd 4.65 over 10 loops
pinball-bench.mp4: baseline whole-loop shares 35.87 / 37.00 / 38.50 / 36.87 (range 2.63); per-loop sd 3.09 over 7 loops

## What the verification found

Three independent checks, each run to refute the reading that the worker's
schedule cannot bias the share, made these four findings.

- **The estimator.** Deleting a frame whose state equals the previous kept
  frame's cannot change the share, exactly — its bins merge into that
  frame's with the same state — except at the first and last frame of a
  stretch. Uniform thinning with every in-stretch state change kept still
  moves it by up to 0.95 points (every 2nd) and 2.40 (every 4th), through
  those stretch ends; with them kept too, by 0.000. Its upward bias follows
  from the video time after each state — 72.1 ms after a TRACK frame, 140.4
  after an unlocked one (145.0 after DETECT, 122.3 after LOST) — and the
  identity Δ = Σ gⱼ(s̄ⱼ − sⱼ)/T predicts +1.67 and +2.65 points on average
  against +1.77 and +2.96 observed. With every gap made equal the bias
  reverses sign.
- **The tracker.** An unlocked frame given no detection returns LOST
  `no-detection` before `this.lock` is touched (`tracker.ts`, `process`);
  the lock is written only by the tracker's own detection (never reached in
  external mode), by `consume`, and by a tracking step, run only with a
  lock. Under the policy no detection is in flight while a lock holds, so a
  failed held step and a consumed detection never meet in one call. Both
  modes count the time from a detected frame to its first confirmed step as
  no lock.
- **The window.** It was the last 300 processed frames, and the driver
  stopped 59–130 ticks after the window's 300 frames were in. A worker run
  would cover about 13–21 s of the wall clip (1.1–1.8 loops) against 29–32 s
  (2.4–2.7 loops) for the synchronous mode, and a different part of the
  loop. The
  clips' lock is far from uniform: by second of the wall clip, pooled over
  its synchronous runs, 0 0 0 0 26 80 81 59 4 62 49 92% TRACK. With the lock
  held fixed and only the schedule changed, coverage alone moved the share
  by −8.8 to +7.9 points over 300–500 ticks; windows of whole loops, by
  about nothing (0.26–0.6 points over sub-windows of whole loops, 0.0 in
  the model).
- **The loss-observation gap.** A held lock's loss is observed after the
  frame before it, and those frames cost more than others: 77.4 ms of video
  after them against 71.6 between TRACK frames. Observing every loss 1 ms
  later credits 13–18 ms more of lock per 30 s of video at these runs' loss
  rates, about 0.05 points of share.

## The gate options, measured

- **The registered fallback, the every-frame replay.** External detection
  handed in one frame later reproduces the synchronous run exactly on the
  clips (three seeds), so every-frame "sync" is a detection one frame old.
  The worker there, at 70, 100 and 130 ms, loses 3.8, 15.4 and 20.2 points
  on the wall clip. The synchronous mode given its own device latency on the
  same schedule (acquisition, step and 83.2 ms, consumed at the next frame;
  161 ms at the median) scores 49.1% against 67.8%: the fallback refuses the
  synchronous mode against itself by 18.7 points.
- **The modelled device schedule.** External detection at the synchronous
  model's own latency processed every frame the synchronous run did, in the
  same state; its extra waiting frames never changed state; the share came
  out identical once edges were closed (42.85, 37.54 and 38.21% in both
  arms, three seeds), while the per-frame share fell from 59.3% to 32.7%.
  Lock falls in steps with latency: one wall-clip frame of it is worth
  3.5–12.6 points in the model. The worker-minus-sync figures the same
  model gave — +18.7, +6.1 and +2.6 points on the wall clip at 70, 100 and
  130 ms, and −1.4 on the table clip — counted the worker's latency from its
  frame rather than from its post, crediting it with the frame's
  acquisition (28 ms on the wall clip, 50 on the table clip); they are
  withdrawn, and the plan's pre-flight measures that comparison with the
  latency counted from the post, as the device measures it.
- **Adopted**: the device share over the same whole loops in both modes,
  edges closed, confirmed TRACK only, the wall clip deciding; TRACK-frame
  cost and held-lock losses reported as attribution; the modelled device
  schedule, fed after the session with each mode's measured latencies (the
  worker's from post to arrival, the synchronous pipeline's time), used to
  explain a result and to weigh in when the table clip is inconclusive,
  never to override the device.

## The scripts

Run with Node from the repository root; they read the committed exports from `docs/benchmarks/`, or from the directory given as their argument.

`decimation.mjs`:

```js
// trackTimeShare on a fixed 10 ms grid of media time, each bin taking the
// state of the most recent processed frame at or before the bin's start; the
// window is cut at loop wraps, and the last frame of each stretch contributes
// nothing. Tested by decimation on the committed round-1 and round-2 tablet
// exports: every 2nd and every 4th processed record (from the first, and at
// every phase), and, separately, thinning only frames inside a run of equal
// states (never a frame where the state changes).
import { readFileSync, readdirSync } from "node:fs";

const DIR = process.argv[2] ?? "docs/benchmarks/";
const BIN_MS = 10;

function stretches(frames) {
    const out = [];
    let cur = [];
    for (const f of frames) {
        if (cur.length && f.mediaTimeSeconds < cur[cur.length - 1].mediaTimeSeconds) {
            out.push(cur);
            cur = [];
        }
        cur.push(f);
    }
    if (cur.length) out.push(cur);
    return out;
}

function gridShare(frames) {
    let track = 0;
    let all = 0;
    for (const s of stretches(frames)) {
        const t0 = s[0].mediaTimeSeconds * 1000;
        const binsBefore = (tMs) => Math.ceil((tMs - t0) / BIN_MS - 1e-9);
        for (let i = 0; i + 1 < s.length; i++) {
            const n = binsBefore(s[i + 1].mediaTimeSeconds * 1000) - binsBefore(s[i].mediaTimeSeconds * 1000);
            all += n;
            if (s[i].state === "TRACK") track += n;
        }
    }
    return all ? track / all : null;
}

const perFrame = (frames) => frames.filter((f) => f.state === "TRACK").length / frames.length;
const every = (frames, k, phase) => frames.filter((_, j) => j % k === phase);
function interiorThinned(frames) {
    // Drop every second frame whose state equals both neighbours' (inside a
    // run); keep every frame at which the state changes, and the ends.
    const keep = [];
    let parity = 0;
    for (let j = 0; j < frames.length; j++) {
        const interior =
            j > 0 &&
            j + 1 < frames.length &&
            frames[j - 1].state === frames[j].state &&
            frames[j + 1].state === frames[j].state &&
            frames[j - 1].mediaTimeSeconds < frames[j].mediaTimeSeconds &&
            frames[j].mediaTimeSeconds < frames[j + 1].mediaTimeSeconds;
        if (interior && parity++ % 2 === 1) continue;
        keep.push(frames[j]);
    }
    return keep;
}

const pts = (x) => (x === null ? "—" : (100 * x).toFixed(2));
const d = (a, b) => (a === null || b === null ? "—" : (100 * (a - b) >= 0 ? "+" : "") + (100 * (a - b)).toFixed(2));
const files = readdirSync(DIR)
    .filter((f) => /^2026-09-2[89]-tab9-tuning-r[12]-.*\.json$/.test(f))
    .sort();
console.log("| run | frames | TRACK per frame | trackTimeShare (10 ms grid) | every 2nd, phase 0 | every 4th, phase 0 | every 2nd, both phases: range of Δ | every 4th, four phases: range of Δ (mean Δ) | inside runs thinned |");
console.log("|---|---|---|---|---|---|---|---|---|");
const worst = { k2: 0, k4: 0, k2p: 0, k4p: 0, k4mean: 0, thin: 0 };
for (const f of files) {
    const e = JSON.parse(readFileSync(DIR + f, "utf8"));
    const fr = e.frames;
    const full = gridShare(fr);
    const k2 = gridShare(every(fr, 2, 0));
    const k4 = gridShare(every(fr, 4, 0));
    const d2 = [0, 1].map((p) => gridShare(every(fr, 2, p)) - full);
    const d4 = [0, 1, 2, 3].map((p) => gridShare(every(fr, 4, p)) - full);
    const m4 = d4.reduce((a, b) => a + b, 0) / 4;
    const th = gridShare(interiorThinned(fr));
    worst.k2 = Math.max(worst.k2, Math.abs(k2 - full));
    worst.k4 = Math.max(worst.k4, Math.abs(k4 - full));
    worst.k2p = Math.max(worst.k2p, ...d2.map(Math.abs));
    worst.k4p = Math.max(worst.k4p, ...d4.map(Math.abs));
    worst.k4mean = Math.max(worst.k4mean, Math.abs(m4));
    worst.thin = Math.max(worst.thin, Math.abs(th - full));
    const rng = (xs) => `${(100 * Math.min(...xs)).toFixed(2)} to ${(100 * Math.max(...xs)).toFixed(2)}`;
    const name = f.replace(/^2026-09-2[89]-tab9-tuning-/, "").replace(/\.json$/, "");
    console.log(
        `| ${name} | ${fr.length} | ${pts(perFrame(fr))}% | ${pts(full)}% | ${pts(k2)} (${d(k2, full)}) | ${pts(k4)} (${d(k4, full)}) | ${rng(d2)} | ${rng(d4)} (${(100 * m4 >= 0 ? "+" : "") + (100 * m4).toFixed(2)}) | ${d(th, full)} |`,
    );
}
console.log(
    `\nlargest |Δ|, points: every 2nd from the first ${(100 * worst.k2).toFixed(2)}, every 4th from the first ${(100 * worst.k4).toFixed(2)}; any phase: ${(100 * worst.k2p).toFixed(2)} and ${(100 * worst.k4p).toFixed(2)}; four-phase mean ${(100 * worst.k4mean).toFixed(2)}; inside runs thinned ${(100 * worst.thin).toFixed(2)}`,
);
```

`whole-loops.mjs`:

```js
// trackTimeShare over whole loops of the clip, edges closed: media time is
// unwrapped onto one timeline (loop k covers [k·D, (k+1)·D)), each 10 ms bin
// takes the state of the most recent processed frame at or before its start,
// holding across a wrap, and only loops that start at or after the first wrap
// and end before the last frame are counted. D is the clip's duration, taken
// as its last frame's media time plus one frame period. Reports each run's
// whole-loop share, its per-loop shares, and the repeat spread per clip.
import { readFileSync, readdirSync } from "node:fs";

const DIR = process.argv[2] ?? "docs/benchmarks/";
const BIN = 0.01;
const files = readdirSync(DIR).filter((f) => /^2026-09-2[89]-tab9-tuning-r[12]-.*\.json$/.test(f)).sort();
const runs = files.map((f) => ({ f, e: JSON.parse(readFileSync(DIR + f, "utf8")) }));
const clipOf = (e) => e.bundledClip ?? e.source?.clip ?? "?";
// Clip duration per clip: max media time seen in any export of it, plus one period.
const dur = {};
for (const { e } of runs) {
    const c = clipOf(e);
    const ts = e.frames.map((x) => x.mediaTimeSeconds);
    const max = Math.max(...ts);
    const sorted = [...new Set(ts)].sort((a, b) => a - b);
    let period = Infinity;
    for (let i = 1; i < sorted.length; i++) period = Math.min(period, sorted[i] - sorted[i - 1]);
    dur[c] = Math.max(dur[c] ?? 0, max + period);
}
function wholeLoops(frames, D) {
    let loop = 0;
    const t = [];
    for (let i = 0; i < frames.length; i++) {
        if (i > 0 && frames[i].mediaTimeSeconds < frames[i - 1].mediaTimeSeconds) loop++;
        t.push(loop * D + frames[i].mediaTimeSeconds);
    }
    const firstWrap = Math.ceil(t[0] / D - 1e-9);
    const start = firstWrap * D;
    const lastLoop = Math.floor(t[t.length - 1] / D + 1e-9); // loops ending at or before the last frame
    const loops = [];
    let j = 0;
    for (let k = firstWrap; k < lastLoop; k++) {
        let track = 0;
        let all = 0;
        for (let b = k * D; b < (k + 1) * D - 1e-9; b += BIN) {
            while (j + 1 < t.length && t[j + 1] <= b + 1e-9) j++;
            if (t[j] > b + 1e-9) continue; // before the first frame
            all++;
            if (frames[j].state === "TRACK") track++;
        }
        loops.push(track / all);
    }
    return loops;
}
const byClip = {};
console.log("| run | clip | loops counted | whole-loop share | per-loop shares |");
console.log("|---|---|---|---|---|");
for (const { f, e } of runs) {
    const c = clipOf(e);
    const loops = wholeLoops(e.frames, dur[c]);
    const mean = loops.length ? loops.reduce((a, b) => a + b, 0) / loops.length : null;
    const name = f.replace(/^2026-09-2[89]-tab9-tuning-/, "").replace(/\.json$/, "");
    console.log(`| ${name} | ${c} | ${loops.length} | ${mean === null ? "—" : (100 * mean).toFixed(2)}% | ${loops.map((x) => (100 * x).toFixed(1)).join(", ")} |`);
    if (/baseline/.test(f) && mean !== null) (byClip[c] ??= []).push({ name, mean, loops });
}
console.log("\nclip durations (s):", JSON.stringify(Object.fromEntries(Object.entries(dur).map(([k, v]) => [k, +v.toFixed(3)]))));
for (const [c, xs] of Object.entries(byClip)) {
    const means = xs.map((x) => 100 * x.mean);
    const per = xs.flatMap((x) => x.loops.map((l) => 100 * l));
    const m = per.reduce((a, b) => a + b, 0) / per.length;
    const sd = Math.sqrt(per.reduce((a, b) => a + (b - m) ** 2, 0) / (per.length - 1));
    console.log(`${c}: baseline whole-loop shares ${means.map((x) => x.toFixed(2)).join(" / ")} (range ${(Math.max(...means) - Math.min(...means)).toFixed(2)}); per-loop sd ${sd.toFixed(2)} over ${per.length} loops`);
}
```
