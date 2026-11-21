# #277: a segmented corner reference for the wall and table clips (2026-11-21)

**A reference, not a criterion.** The poster's four corners on every frame of the wall and table
clips, found by `webarkit/artoolkit-nft-bench`'s colour segmentation with no NFT code, and set beside
the shipped arm's `TRACK` corners on seeded desktop replays. It informs (is a lock on the poster?);
it does not judge a few pixels (see "Limits"). No figure here is campaign data. Nothing under
`packages/` or `examples/` changes. For #277, M12's item 3; #280 uses it.

The files:

- [`2026-11-21-277-reference-wall.json`](./2026-11-21-277-reference-wall.json), SHA-256
  `7a8ba4c3b5e9a925646b8707a97b08da2dfacf7518ab070d2438476ea5d8d4e1`;
- [`2026-11-21-277-reference-table.json`](./2026-11-21-277-reference-table.json), SHA-256
  `062ee5aa4639a8d6b263c3f765418ba327b67d1efcf6fd8bba31d0584923168b`;
- [`2026-11-21-277-segmented-reference.mjs`](./2026-11-21-277-segmented-reference.mjs), which
  produces both and the comparison, and records both hashes (`REFERENCE_SHA256`);
- [`2026-11-21-277-segment-frames.py`](./2026-11-21-277-segment-frames.py), the driver it runs
  `segment.py` through;
- [`2026-11-21-277-segmented-reference-segment-figures.txt`](./2026-11-21-277-segmented-reference-segment-figures.txt),
  what `segment` printed: every figure in "How the frames are segmented", "The wall clip" and "The
  table clip" below;
- [`2026-11-21-277-segmented-reference-figures.txt`](./2026-11-21-277-segmented-reference-figures.txt),
  what `compare` printed: every figure in "Beside the tracker" below.

The by-eye verdicts are the one thing here no script produces (see "By eye").

Each reference file holds one row per processing frame: the frame index, its media time (ffprobe's
`pts_time`, the replay's `mediaTimeSeconds`), `accepted` or the rejection reason, `segment.py`'s
confidence, and the corners TL, TR, BR, BL in the bench's processing pixels (pixel centres at
integers, rounded to 0.001 px), `null` on a rejected frame. Its header records the
`artoolkit-nft-bench` commit, `segment.py`'s SHA-256, the command, the decode, the source file's
SHA-256, the source, processing and segmented sizes, the scale, and the Python, OpenCV and NumPy
versions.

## Base, machine, tools

- **Ref:** `docs/277-segmented-reference`, a worktree branched from `origin/dev` at **`40b1738`**
  (the merge of #283). `npm ci`, then `npm run build`: the manifest reads head `40b1738`, clean,
  bundle `9ba55b81c57c…`.
- **The machine:** the maintainer's desktop `DESKTOP-GSMIJFJ`: Windows 11 Pro, Intel Core i7-9700
  @ 3.00 GHz, ffmpeg and ffprobe 9.0.2 gyan.dev essentials build, Node v24.21.0 (the `.nvmrc` pin),
  npm 11.19.0, Git Bash.
- **`artoolkit-nft-bench`:** its clone on this machine is `D:/kalwalt-github/artoolkit5-refactor`
  (`origin` is `webarkit/artoolkit-nft-bench`), checked out on `feat/recording-quality`. It was not
  switched: the script reads the commit **`d629264eaba1ddc345028ad3fe6d1b8e520930cd`**, `dev`'s head
  on 2026-11-21 (#24's merge), from git's object store (`git cat-file`) into the run directory.
  `segment.py` there has SHA-256 `b17b43ae…cf70ff` and is the same at the clone's checked-out head.
  Nothing was written into the clone; `git status` is the same before and after.
- **Python:** the clone's own `.venv` (Python 3.12.2, OpenCV 5.0.0, NumPy 2.5.3), used unchanged,
  with `PYTHONPATH` set to the exported `python/` folder (the driver records the `segment.py` file
  it imported and refuses another hash).
- **The model:** Claude Opus 5.5. No advisor, as the brief said: this is a reference, not a measured
  change.
- **The run directory:** `D:/kalwalt-github/webarkit-runs/m12-segment/`, outside the repository and
  the temporary folder: the per-frame driver output at both sizes, the overlays, the replays.

## How the frames are segmented

`segment.py` is called as `segment_bank` calls it (`python/nftbench/segment.py`): `segment_quad` on
the colour frame, accepted when it returns a quad with confidence at least 0.5, the corners ordered
by `order_corners` against the last accepted quad. `segment_bank` itself cannot be used: it reads a
frame bank and needs its colour video at the bank's size. `segment.py` is not changed. Its
rejections carry no reason, so the driver names each one by the `return None, 0.0` line
`segment_quad` returned from (a trace), and refuses to run if those lines are not the ten it knows.

The frames are decoded as the replay decodes them (`2026-11-13-262-stage1-probe.mjs`'s `loadClip`:
ffprobe's timestamps, `fitSize` into `PAGE_PROCESSING_BOX`, ffmpeg's bilinear scale with
`-fps_mode passthrough`), kept in RGB because the segmentation needs colour. The processing sizes:
wall 1280×720 to **480×270**, table 1080×1920 to **203×360** (scale 203/1080 by 360/1920: x and y
are scaled apart).

**The driver reproduces `segmentation.md`.** On the wall clip at 1280×720 it accepts 291 of 298
frames and rejects 7, as `results/phase1/segmentation.md` records (291, 7 "truncated", 0 low
confidence); its reasons split the 7 into 3 touching the border (frames 197 to 199) and 4 whose
refinement disagrees with the rough quad, which `segment_bank` counts together.

## The wall clip: the source and the mapping

**Ours is theirs byte for byte.** `examples/videos/pinball-bench.mp4` and `artoolkit-nft-bench`'s
`data/videos/pinball-bench.mp4` at `d629264` have the same SHA-256 (`6d30ffb6…a8a89d`; the script
refuses otherwise): the same file at the same 1280×720, 298 frames, not the same footage at another
size. The frame mapping is the identity. What differs is only the size it is segmented at.

**At the processing size the segmentation is wrong on late frames.** Segmented at 480×270, 269
frames are accepted (21 refinement-disagrees, 8 touching the border). Against the 1280×720
segmentation scaled to 480×270, on the 265 frames both accept: mean corner distance p50 0.708, p90
3.079, p99 5.064, max 5.347 processing px; the largest single corner p50 2.069, p90 9.335, max
16.486 px; 112 frames above 1 px, of which 9 come before frame 172 and 103 from it on, as the poster
grows (the segment figures list them). Drawn by hand over the 1280×720 frames for `segment_bank`'s
24-frame sample, the 480×270 quad's left side is mis-fitted on frames 174, 211, 233 and 241 (it
leaves the paper at the top left and cuts into the print at the bottom left), and slightly off on
183, 230 and 280, while the 1280×720 quad sits on the paper edge on every accepted tile. Four clearly
wrong quads among 21 accepted tiles fail `segmentation.md`'s own gate, at most 2 wrong among the
accepted tiles.

**The maintainer's ruling (2026-11-21):** the wall's reference is the 1280×720 segmentation, its
corners scaled to the processing frame (`x' = (x + 0.5) · 480/1280 − 0.5`, the same for y with
270/720), and the 480×270 run is reported as what segmenting at the smaller size costs, above. The
brief had said the reference stays the one at the processing size; that was written expecting our
clip to be the same footage at another size.

**Acceptance:** 291 of 298 frames; rejected: 4 refinement-disagrees, 3 touches-border.

## The table clip

`segment.py` had never run on its grey textured background. **At its processing size, 203×360, it
accepts all 267 frames.** At its source size (1080×1920, the check), it accepts 170 and rejects 97 as
not rectangular (`rect < 0.9`: the component's area against its quad's); where both accept, the two
agree to p50 0.384, p90 0.697, max 1.235 processing px (largest single corner 2.113 px; 1 frame above
1 px). So on the table the processing size is the better basis, and it is the reference, as the
brief said.

**Acceptance:** 267 of 267 frames.

## By eye

**How the sample is drawn:** `segment_bank`'s spot-check draw, 24 frames of the clip, NumPy's
`default_rng(0).choice(n, 24, replace=False)`, sorted; the driver draws it itself
(`--overlay-sample 24,0`). For the wall it is the same 24 frames `segmentation.md` looked at.

`segment` writes each clip's sample overlays at its basis size into `<runs>/overlay-<clip>/` (the
table's at 203×360 ×3, the wall's at 1280×720). The views below were cropped and enlarged from them,
or drawn by hand from the run's per-frame output; the verdicts are by eye and no script checks them.

- **Table** (203×360, rendered ×3 and cropped to the poster): frames 0, 4, 10, 18, 44, 66, 73, 76,
  125, 128, 141, 146, 155, 156, 164, 178, 188, 205, 207, 216, 232, 245, 250, 259. All 24 accepted;
  every quad lies on the paper's edges, the TL marker on the poster's top-left corner. **Wrong quads:
  0.** On the last frames the poster comes within a few pixels of the frame's top edge without
  touching it.
- **Wall** (by hand: the reference's corners drawn over the 480×270 processing frames, ×3, and
  again at 1280×720 beside the 480×270 run's): frames 0, 4, 11, 21, 49, 75, 81, 85, 141, 144, 158, 164, 174,
  175, 183, 185, 199, 211, 230, 233, 241, 261, 274, 280. 23 accepted, every quad on the paper's edges
  with the TL marker on the top-left corner; frame 199 rejected, the poster touching the top edge, as
  `segmentation.md` found. **Wrong quads: 0.**

The overlays are in the run directory (`seg2/overlay-<clip>/`), not committed.

## Beside the tracker

The shipped arm (ORB, `pinball.wnft`, `{ ratio: 0.8 }`) on #273's runner,
`2026-11-14-272-stage1-probe.mjs runs --levers none --clips table,wall --seeds 1-8`, once per
schedule (`every`, `device-15`, `device-25`), two loops each. The runner checks its `none` arm
against `replayRun` frame for frame, fatally. For every `TRACK` record with an accepted reference
frame (both loops counted): the mean over the four corners of the distance between the record's
`corners` (the target's corner pixels through its `H`) and the reference's.

**The allowance, fixed before any distance was computed** (in `7d1d469`, the first commit, ahead of
the first `compare`): from `artoolkit-nft-bench`'s own statements about this segmentation on the wall
clip at 1280×720, its error, "about 1-2 px on sharp frames" (`segmentation.md`), taken as 2 px, and
its offset from the print's projected corners, three corners 1 to 2 px inward and the bottom-left
about 8 px (`results/phase1/README.md`), taken as 8 px, the largest, and applied to the mean of all
four: 10 px at 1280×720, **3.75 processing px**. The table has no stated figure of its own: the same
3.75 px is carried over, unmeasured. Blur makes the segmentation "worse", by an amount nobody has
stated, and the allowance does not cover it. A record beyond it is read as a lock off the poster.

**Wall** (reference: 291 of 298 frames):

| schedule | `TRACK` records | with a reference | mean corner distance p10 / p50 / p90 / p99 / max (px) | p50 per corner TL / TR / BR / BL (px) | beyond 3.75 px |
|---|---|---|---|---|---|
| every | 3230 | 3182 (48 on a rejected frame) | 1.36 / 2.32 / 3.56 / 5.88 / 34.43 | 1.41 / 1.89 / 1.90 / 3.43 | 304 |
| device-15 | 2584 | 2584 | 1.40 / 2.28 / 3.19 / 5.34 / 34.43 | 1.42 / 1.86 / 1.84 / 3.42 | 130 |
| device-25 | 965 | 955 (10 on a rejected frame) | 1.48 / 2.33 / 3.24 / 5.28 / 31.48 | 1.42 / 1.87 / 1.96 / 3.47 | 43 |

**Table** (reference: 267 of 267 frames):

| schedule | `TRACK` records | with a reference | mean corner distance p10 / p50 / p90 / p99 / max (px) | p50 per corner TL / TR / BR / BL (px) | beyond 3.75 px |
|---|---|---|---|---|---|
| every | 3382 | 3382 | 1.46 / 1.73 / 2.42 / 2.50 / 13.80 | 0.49 / 2.10 / 2.55 / 2.05 | 2 |
| device-15 | 1514 | 1514 | 1.45 / 1.85 / 2.44 / 2.53 / 3.97 | 0.53 / 2.11 / 2.65 / 2.19 | 2 |
| device-25 | 1514 | 1514 | 1.45 / 1.85 / 2.44 / 2.53 / 3.97 | 0.53 / 2.11 / 2.65 / 2.19 | 2 |

No `TRACK` record lacked corners. On the table the two device schedules give the same figures; the
figures file lists each.

**The frames beyond the allowance.** Beyond 3.75 px, read by the rule fixed in `7d1d469` as locks
off the poster: **wall 304 records on `every`, 130 on `device-15`, 43 on `device-25`; table 2, 2 and
2.** Per clip frame (the figures file has the full list):

- **Wall, two records far off the poster:** clip frame 191 (7.666 s), on every seed of `every` and
  `device-15`, 34.43 px; clip frame 271 (10.876 s), on seeds 1, 5, 6 and 8 of `device-25`, 31.48 px.
  The figures file prints the records around each schedule's largest distance (seed 1 record 191 on
  `every`, seed 2 record 117 on `device-15`, seed 8 record 213 on `device-25`): each is a single
  `TRACK` record confirmed on 8 inliers (quality 0.161 or 0.162), after steps at 3.81 px (frame 190)
  or 2.29 px (frame 269); the next record is a step at 1.99 px (frame 192) or a detection at 3.90 px
  (frame 273).
- **Wall, the rest:** per-frame maxima 3.81 to 7.41 px. On `every`, 18 clip frames from 190 to 294 besides 191, each
  on all 8 seeds and both loops (288 records); on `device-15`, 7 of those frames, and frame 91 on seed
  6; on `device-25`, 4 of them, and frame 93 on seed 5.
- **Table:** clip frame 56 (1.867 s) on seed 1 of `every`, both loops, 13.80 px; clip frame 69
  (2.300 s) on seed 5 of `device-15` and `device-25`, both loops, 3.97 px: a `TRACK` record on 8
  inliers between detections at 3.34 and 8.06 px (the records around it are in the figures file).

**Read after the results, not by the rule:** of the wall's records beyond the allowance, all but the
two far ones are within 3.81 to 7.41 px. They sit on the late frames, where the poster is largest,
and the bottom-left corner carries most of the distance (p50 3.4 px against 1.4 to 1.9 px for the
others), where `artoolkit-nft-bench` states its 8 px offset. The allowance applies that offset to the
mean of the four corners, so it covers it only in part, and a reference that does not judge a few
pixels cannot say whether those records are the tracker's error or its own. The same holds for the
table's 1.900 s record below, beyond the allowance by 0.07 px. **So the rule over-reads, and 3.75 px
is not to be reused as a criterion:** a later use (#280 among them) fixes its own margin, before
reading, from the reference's measured error (`artoolkit-nft-bench`'s #11), or states why it cannot.
This changes no count above.

**Cross-check, M12's verification's one off-target lock (table, 1.900 s, seed 1).** The brief gives
it; it is not in this repository, its issues or the run directories, so it is taken as given. Seed
1's records within 0.1 s of 1.900 s, on every schedule (`compare`'s `CROSS_CHECK`):

| schedule | loop | media time | state | inliers | mean corner distance (px) |
|---|---|---|---|---|---|
| every | 1 and 2, the same records | 1.800 s | LOST | 6 | – |
| | | 1.833 s | DETECT | 5 | **18.48** |
| | | 1.867 s | TRACK | 8 | **13.80** |
| | | 1.900 s | DETECT | 7 | 3.82 |
| | | 1.933 s | LOST | 6 | – |
| | | 1.967 s | DETECT | 10 | 3.30 |
| | | 2.000 s | DETECT | 9 | 2.83 |
| device-15, device-25 (the same records) | 1 | 1.900 s | DETECT | 7 | 3.82 |
| | 2 | 1.800 s | LOST | 6 | – |
| | 2 | 1.933 s | LOST | 6 | – |

**The reference flags it.** On the every-frame schedule a detection at 1.833 s on 5 inliers is 18.48
px off the poster, and the first step from it, at 1.867 s, is confirmed 13.80 px off. That step is
the table clip's largest `TRACK` distance on any schedule. The record at 1.900 s itself is a fresh
detection, 3.82 px from the reference: beyond the allowance by 0.07 px, so off the poster by the
rule. On the device schedules no frame between 1.800 and 1.933 s is
processed in either loop but 1.900 s in loop 1, so that lock never forms. In the first
`compare` run the cross-check listed only the 1.900 s records. Its window was widened to 0.1 s after
that run showed 1.900 s to be a detection, so that the lock before it is listed; the change is
`CROSS_CHECK.window`, said in its comment.

## Limits

- **Colour segmentation, checked by eye.** The poster is wherever the colour differs from the
  frame's border; the corners are where four refined edges meet. Each clip's acceptance has been
  looked at on one 24-frame sample, not frame by frame.
- **It informs, it does not judge a few pixels.** Its error has only been stated ("about 1-2 px on
  sharp frames, worse under blur", on the wall clip at 1280×720) and estimated against an engine's
  poses, never measured. `artoolkit-nft-bench`'s manual annotations (its #11) are what would measure
  it. Until then a distance of a few pixels says nothing about which of the two is wrong, and the
  allowance above is a statement turned into a number, not a bound.
- **The allowance's rule was fixed before the results, and its count is reported as it reads;** the
  reading after the results is labelled as such ("Read after the results, not by the rule").
- **The paper, not the print.** The corners are the paper's, which is not the target image's edge:
  `artoolkit-nft-bench` finds the offset uneven, up to about 8 px at one corner at 1280×720, with
  causes it has not separated (the field of view, the poster's flatness, the segmentation).
- **On the table, nothing is stated:** the allowance is the wall's, carried over unmeasured, and
  `segment.py` accepts every frame at 203×360 but only 170 of 267 at 1080×1920.
- **No calibration.** Neither clip has measured intrinsics; the reference is in image pixels and says
  nothing about a pose.
- **On the wall, the basis is the source size,** by the maintainer's ruling: at 480×270 the same
  segmentation is wrong on late frames. A clip that is not `artoolkit-nft-bench`'s would need its
  own check of which size to segment at.

## Reproducing

From the repository root, after `npm ci` and `npm run build`, with ffmpeg and ffprobe on `PATH`:

```sh
node docs/benchmarks/2026-11-21-277-segmented-reference.mjs --self-test
node docs/benchmarks/2026-11-21-277-segmented-reference.mjs segment --nftbench <artoolkit-nft-bench clone> --python <python with cv2 and numpy> --runs <dir> --figures <file>
for s in every device-15 device-25; do
    node docs/benchmarks/2026-11-14-272-stage1-probe.mjs runs --out <replays>/$s --schedule $s --clips table,wall --seeds 1-8 --levers none
done
node docs/benchmarks/2026-11-21-277-segmented-reference.mjs compare --replays <replays> --figures <file>
```

`segment` writes the reference files into `<dir>` (or `--write`), says whether each is
byte-identical to the committed one, and exits 1 if not. Run three times on this machine, into three
run directories, it wrote both files byte-identical each time. It refuses a driver that imported a
`segment.py` other than the export's, by hash or by path. `compare` refuses a reference file whose
SHA-256 is not the recorded one, a clip whose SHA-256 is not the one the reference was made from, a
reference whose rows are not the clip's frames, and a replay file that is not the `none` arm of the
clip, seed and schedule it is read as. The self-test needs no ffmpeg. It checks the refusals on
constructed input: a missing frame, a repeated frame, a frame count other than the clip's, a row
whose corners are not four finite points. It also reads both committed reference files through
`compare`'s loader, requiring their recorded hashes, and refuses a copy of each with one byte
changed.
