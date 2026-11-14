## M9's committed device exports, re-derived (table runs 17–24, wall runs 25–32; one ORB arm, `?seed=1`, the device's own schedule)

Each run read by `summarizeRun` over its counted loops (`loops` and `clipDurationS` as the export records them); `reacquisitions`, `firstSteps` and `heldLockSteps` are checked against the export's own `runSummary`, fatally. Matches and inliers at detection: on the frames that are not TRACK. LOST frames by the sequence rule, over the run's whole frame list (warm-up loop included), not only its counted loops.

| run | lock rate | re-acquisitions | first steps confirmed / n | held-lock steps lost / n | matches on non-TRACK frames, median | inliers on DETECT frames, median | LOST never yet acquired: reasons | LOST lock lost: reasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| table-17 | 0.8277 | 22 | 9 / 23 | 5 / 436 | 7 | 9 | 12: too-few-inliers 7, too-few-matches 3, no-consensus 1, not-facing 1 | 69: too-few-inliers 36, too-few-matches 12, no-consensus 12, not-facing 9 |
| table-18 | 0.8012 | 31 | 13 / 32 | 9 / 402 | 7 | 16 | 15: too-few-inliers 8, too-few-matches 3, no-consensus 2, not-facing 2 | 69: too-few-inliers 40, too-few-matches 13, no-consensus 10, not-facing 6 |
| table-19 | 0.7948 | 30 | 10 / 31 | 6 / 363 | 7 | 23 | 14: too-few-inliers 8, too-few-matches 3, no-consensus 2, not-facing 1 | 64: too-few-inliers 35, too-few-matches 14, no-consensus 9, not-facing 6 |
| table-20 | 0.7996 | 29 | 15 / 30 | 11 / 406 | 7 | 16 | 12: too-few-inliers 8, too-few-matches 2, no-consensus 1, not-facing 1 | 73: too-few-inliers 45, too-few-matches 14, no-consensus 8, not-facing 6 |
| table-21 | 0.8321 | 26 | 11 / 27 | 7 / 435 | 7 | 12 | 15: too-few-inliers 9, no-consensus 2, too-few-matches 2, not-facing 2 | 62: too-few-inliers 35, no-consensus 12, too-few-matches 10, not-facing 5 |
| table-22 | 0.8240 | 23 | 10 / 24 | 6 / 425 | 7 | 17 | 17: too-few-inliers 8, too-few-matches 4, not-facing 3, no-consensus 2 | 68: too-few-inliers 41, too-few-matches 10, no-consensus 9, not-facing 8 |
| table-23 | 0.8506 | 14 | 7 / 15 | 3 / 460 | 6 | 17 | 14: too-few-inliers 6, too-few-matches 5, not-facing 2, no-consensus 1 | 67: too-few-inliers 41, too-few-matches 11, no-consensus 11, not-facing 4 |
| table-24 | 0.8463 | 12 | 7 / 13 | 3 / 456 | 6 | 12 | 13: too-few-inliers 7, too-few-matches 4, no-consensus 1, not-facing 1 | 71: too-few-inliers 40, too-few-matches 16, no-consensus 10, not-facing 5 |
| wall-25 | 0.5542 | 86 | 19 / 87 | 16 / 275 | 9 | 71 | 32: too-few-inliers 21, too-few-matches 6, no-consensus 3, not-facing 2 | 136: too-few-inliers 79, too-few-matches 29, not-facing 18, no-consensus 10 |
| wall-26 | 0.5495 | 90 | 25 / 90 | 24 / 272 | 9 | 72 | 32: too-few-inliers 16, too-few-matches 8, not-facing 5, no-consensus 3 | 133: too-few-inliers 67, too-few-matches 33, not-facing 22, no-consensus 11 |
| wall-27 | 0.5551 | 87 | 24 / 88 | 22 / 271 | 9 | 71 | 29: too-few-inliers 18, too-few-matches 6, not-facing 4, no-consensus 1 | 131: too-few-inliers 60, too-few-matches 29, not-facing 29, no-consensus 13 |
| wall-28 | 0.5752 | 78 | 21 / 78 | 19 / 287 | 9 | 68 | 30: too-few-inliers 14, too-few-matches 8, not-facing 6, no-consensus 2 | 134: too-few-inliers 73, too-few-matches 29, not-facing 21, no-consensus 11 |
| wall-29 | 0.5813 | 77 | 19 / 77 | 16 / 293 | 9 | 72 | 30: too-few-inliers 14, too-few-matches 9, not-facing 6, no-consensus 1 | 134: too-few-inliers 74, too-few-matches 26, not-facing 26, no-consensus 8 |
| wall-30 | 0.5238 | 96 | 25 / 96 | 24 / 253 | 10 | 71 | 29: too-few-inliers 14, too-few-matches 9, not-facing 3, no-consensus 3 | 134: too-few-inliers 70, too-few-matches 27, not-facing 21, no-consensus 16 |
| wall-31 | 0.5961 | 72 | 20 / 72 | 19 / 307 | 9 | 68 | 30: too-few-inliers 12, not-facing 9, too-few-matches 6, no-consensus 3 | 136: too-few-inliers 75, too-few-matches 30, not-facing 21, no-consensus 10 |
| wall-32 | 0.5657 | 82 | 18 / 83 | 14 / 283 | 9 | 71 | 28: too-few-inliers 11, too-few-matches 9, not-facing 5, no-consensus 3 | 136: too-few-inliers 86, too-few-matches 23, not-facing 14, no-consensus 13 |

- **table, over its 8 runs:** lock rate 0.8220 (s 0.0214; [0.8041, 0.8399]; range 0.7948–0.8506); re-acquisitions 23.38 (s 7.17; [17.38, 29.37]; range 12.00–31.00); first steps confirmed 82 of 195 over the counted loops, 106 of 248 over every frame of the runs.
- **wall, over its 8 runs:** lock rate 0.5626 (s 0.0222; [0.5441, 0.5812]; range 0.5238–0.5961); re-acquisitions 83.50 (s 7.78; [76.99, 90.01]; range 72.00–96.00); first steps confirmed 171 of 671 over the counted loops, 209 of 816 over every frame of the runs.

