Cross-check: the GMS runs' ratio-tested set equals the stateless runs' matches and acceptance, every frame of every run.

## GMS, as a question: what each match set keeps and what it changes, every frame of one loop, summed over seeds 1–8

| clip | arm | set | matches, median / mean | frames with at least 4 | accepted | accepted where the ratio set is not | refused where the ratio set is accepted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| table | orb | ratio | 48 / 48.48 | 2120 of 2136 | 1689 | 0 | 0 |
| table | orb | ratioGms | 0 / 2.12 | 456 of 2136 | 325 | 0 | 1364 |
| table | orb | ratioGmsRS | 23 / 22.07 | 1472 of 2136 | 1440 | 0 | 249 |
| table | orb | nn | 300 / 296.62 | 2136 of 2136 | 1772 | 123 | 40 |
| table | orb | nnGms | 0 / 1.35 | 296 of 2136 | 165 | 0 | 1524 |
| table | orb | nnGmsRS | 20 / 23.19 | 1352 of 2136 | 1259 | 0 | 430 |
| table | teblid | ratio | 56 / 61.72 | 2136 of 2136 | 1680 | 0 | 0 |
| table | teblid | ratioGms | 0 / 4.42 | 576 of 2136 | 480 | 0 | 1200 |
| table | teblid | ratioGmsRS | 27 / 30.18 | 1456 of 2136 | 1431 | 1 | 250 |
| table | teblid | nn | 300 / 296.62 | 2136 of 2136 | 1812 | 155 | 23 |
| table | teblid | nnGms | 0 / 3.41 | 464 of 2136 | 401 | 0 | 1279 |
| table | teblid | nnGmsRS | 41 / 38.81 | 1424 of 2136 | 1404 | 1 | 277 |
| wall | orb | ratio | 76 / 59.35 | 2248 of 2384 | 1693 | 0 | 0 |
| wall | orb | ratioGms | 0 / 1.07 | 352 of 2384 | 127 | 0 | 1566 |
| wall | orb | ratioGmsRS | 18 / 20.15 | 1424 of 2384 | 1355 | 0 | 338 |
| wall | orb | nn | 300 / 245.76 | 2384 of 2384 | 1779 | 100 | 14 |
| wall | orb | nnGms | 0 / 0.14 | 40 of 2384 | 0 | 0 | 1693 |
| wall | orb | nnGmsRS | 11 / 17.79 | 1336 of 2384 | 1209 | 0 | 484 |
| wall | teblid | ratio | 81 / 65.74 | 2352 of 2384 | 1748 | 0 | 0 |
| wall | teblid | ratioGms | 0 / 0.85 | 264 of 2384 | 53 | 0 | 1695 |
| wall | teblid | ratioGmsRS | 23 / 24.36 | 1432 of 2384 | 1404 | 0 | 344 |
| wall | teblid | nn | 300 / 245.76 | 2384 of 2384 | 1771 | 57 | 34 |
| wall | teblid | nnGms | 0 / 0.20 | 48 of 2384 | 15 | 0 | 1733 |
| wall | teblid | nnGmsRS | 18 / 26.91 | 1440 of 2384 | 1296 | 0 | 452 |

`ratio`: the ratio test at 0.8, as `detectTarget`. `nn`: nearest neighbour per level, best across levels. `Gms`: `gms.filter` at OpenCV's defaults; `GmsRS`: with rotation and scale. Each set through `estimateHomography` at 4 px and `detectTarget`'s two refusals (fewer than 5 inliers, not facing).

