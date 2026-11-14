## M9's committed device exports: the gap from a detection to its first step, and the step's verdict

Every lock of each run's whole frame list (`detectionLockList`, the page's), its first step's frame against the detected one: the gap in clip frames (by media time on the clip's own frame times) and in ms of media time; verdict confirmed or the step's `trackLoss`. Summed over the 8 runs of each clip.

| clip | locks with a first step | gap, clip frames: median (range) | gap ms: median | confirmed at gap 1 / 2 / 3 / 4 / 5 / ≥ 6 (of n) |
| --- | --- | --- | --- | --- |
| table | 248 | 4 (3–9) | 133.3 | 0 of 0 / 0 of 0 / 6 of 11 / 52 of 129 / 44 of 93 / 4 of 15 |
| wall | 816 | 4 (2–7) | 160.5 | 0 of 0 / 0 of 1 / 3 of 99 / 178 of 621 / 27 of 88 / 1 of 7 |

