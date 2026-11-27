# #279: the segmented reference for the fast clip

[#279](https://github.com/webarkit/webarkit/issues/279) brings the Tab 9's fast clip into the bench
as `examples/videos/pinball-fast.mp4`. This record is its segmented corner reference, made by
[#277](https://github.com/webarkit/webarkit/issues/277)'s method
([`2026-11-21-277-segmented-reference.md`](2026-11-21-277-segmented-reference.md)): artoolkit-nft-bench's
`segment.py`, per frame, the poster's four corners or the reason it was rejected. A reference, not
a criterion: it informs (is a lock on the poster?), it does not judge a few pixels.

**What this record does not hold:** any comparison with the tracker on this clip. That is
[#280](https://github.com/webarkit/webarkit/issues/280)'s, after its registration. No tracker ran
to make this record.

## Files

- [`2026-11-27-279-reference-fast.json`](2026-11-27-279-reference-fast.json): one row per frame of the
  clip (898), with its media time, its status (`accepted`, or the rejection reason) and, when
  accepted, its corners TL, TR, BR, BL in the bench's processing pixels (480×270). SHA-256
  `f005a5913110c8de04767bb05c99695c54dccb44219e0d081b632fd95deee99f`, recorded in the script as
  `REFERENCE_SHA256.fast`.
- [`2026-11-27-279-reference-fast-figures.txt`](2026-11-27-279-reference-fast-figures.txt): what the
  run printed.
- The script is #284's, extended: `node docs/benchmarks/2026-11-21-277-segmented-reference.mjs
segment --clip fast --nftbench <artoolkit-nft-bench clone> --python <python> --runs <dir> --write
docs/benchmarks --figures docs/benchmarks/2026-11-27-279-reference-fast-figures.txt`. `segment`
  without `--clip` runs the wall and table clips exactly as before; `compare` does not read this
  clip.

## Method

- **Source and basis.** The reference is segmented at 1280×720 on the file the bench clip was
  encoded from: artoolkit-nft-bench's `data/videos/tab9-2026-11-26/fast.mp4` at the merge commit of
  its PR #27, `46bd6d6128f28884c5088bc56e70cb4b9f4d2cfb`, read from git's object store and refused
  unless its SHA-256 is `6120c7a35bb3bf37ab2677f9fb449e3cb4e7cb8abdc47edd6b8e84aaf8141915`. Its
  corners are scaled to the processing frame (×0.375, pixel centres kept), as the wall's are, since
  #277 found `segment.py`'s quads at 480×270 wrong on late wall frames. The script refuses the bench
  clip unless it hashes as `af8d3cfe9d6256bab13d3688284033b4591d49e54158427ea1882e9958aa3dbb` and has
  the same frame times as its source.
- **The check.** The bench clip itself, decoded and scaled to 480×270 as the replay decodes it,
  segmented the same way: what each size accepts, and how far apart their corners are.
- **The segmenter.** `segment.py` at `d629264` (SHA-256 `b17b43ae…70ff`), as for the wall and table;
  its blob is the same at `46bd6d6`. Python 3.12.2, OpenCV 5.0.0, NumPy 2.5.3 (artoolkit-nft-bench's
  clone's `.venv`); ffmpeg 9.0.2.

## Acceptance

**879 of 898 frames accepted.** The 19 rejected are all `touches-border`, one run: frames 318–336,
10.599–11.198 s.

The check at 480×270 accepts 811 (38 `refinement-disagrees`, 49 `touches-border`), every one of them
also accepted at 1280×720. On the 811 both accept, the mean corner distance between the two is p50
1.610, p90 3.165, max 5.470 processing px. It is reported, as for the wall, not weighed.

`verify_encode.py`'s acceptance count on the same source, 880, is not this one: it decodes with
OpenCV and calls `segment_quad` alone, where this run decodes with ffmpeg to RGB, as the replay
does, and orders the corners as `segment_bank` does.

## By eye

**How the sample is drawn:** `segment_bank`'s spot-check draw, 24 frames, NumPy's
`default_rng(0).choice(898, 24, replace=False)`, sorted, drawn by the driver
(`--overlay-sample 24,0`): frames 2, 14, 36, 66, 154, 236, 248, 270, 446, 448, 484, 500, 538, 557,
563, 574, 601, 649, 718, 731, 744, 808, 835, 862. The overlays are at 1280×720, in the run
directory (`<runs>/overlay-fast/`), not committed. They were looked at whole, and each one's
bottom-left corner was then cropped and enlarged ×2. The verdicts are by eye, and no script checks
them.

- **All 24 accepted.** On every one the quad lies on the poster, TL marker on its top-left corner,
  and TL, TR and BR sit on the paper's corners.
- **The bottom-left corner sits inside the paper on 17 of the 24:** 66, 154, 236, 248, 446, 448,
  484, 500, 538, 557, 563, 574, 718, 731, 744, 808, 835. The quad's left side meets the bottom edge
  short of the corner and leaves out the poster's pale blue lower-left area. By eye, the corner is
  about 10 to 30 px inside it at 1280×720, about 4 to 11 processing px, most often 25 to 30 px
  (frames 154, 484, 500, 538, 557, 731, 808, 835). On the other 7 (2, 14, 36, 270, 601, 649, 862)
  it is on the corner. Those seven are the frames where the wall looks grey. The seventeen look
  warmer, but whether the light is the cause has not been checked.
- **Wrong quads:** none off the poster. The bottom-left corner above is the reference's error
  wherever it occurs, and is larger than artoolkit-nft-bench states for the wall clip ("the
  bottom-left corner about 8 px off", `results/phase1/README.md` at `d629264`). It has not been
  measured frame by frame. A distance read against this reference's BL corner, or against a mean
  of all four corners, carries it.

## Regeneration

The extension leaves the wall and table untouched: on this machine, `segment` without `--clip`
regenerated `2026-11-21-277-reference-wall.json`, `2026-11-21-277-reference-table.json` and
`2026-11-21-277-segmented-reference-segment-figures.txt` byte for byte (`cmp`). A second run of
`segment --clip fast` gave the same reference file, and `--self-test` passes with the fast file in
its hash checks.
