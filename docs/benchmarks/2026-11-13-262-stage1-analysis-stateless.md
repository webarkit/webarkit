## Stateless mode, every frame of one loop, over seeds 1–8

| clip | ratio | arm | accepted (share, mean over seeds; range) | at least 4 matches | matches, median / mean | inliers on accepted, median | reasons, summed over seeds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cross | 0.8 | orb | 1.0000 (1.0000–1.0000) | 1.0000 | 66 / 66.31 | 58 |  |
| cross | 0.8 | teblid | 1.0000 (1.0000–1.0000) | 1.0000 | 81 / 81.04 | 69 |  |
| static | 0.8 | orb | 1.0000 (1.0000–1.0000) | 1.0000 | 127 / 126.65 | 117 |  |
| static | 0.8 | teblid | 1.0000 (1.0000–1.0000) | 1.0000 | 144 / 144.38 | 132 |  |
| table | 0.7 | orb | 0.7341 (0.7341–0.7341) | 0.7603 | 27 / 26.41 | 34 | too-few-matches 512, too-few-inliers 56 |
| table | 0.7 | teblid | 0.7168 (0.7116–0.7191) | 0.7528 | 25 / 29.84 | 37 | too-few-matches 528, too-few-inliers 71, no-consensus 4, not-facing 2 |
| table | 0.75 | orb | 0.7715 (0.7603–0.7790) | 0.8240 | 35 / 34.01 | 40 | too-few-matches 376, too-few-inliers 82, no-consensus 16, not-facing 14 |
| table | 0.75 | teblid | 0.7669 (0.7566–0.7753) | 0.9064 | 35 / 40.82 | 43 | too-few-inliers 243, too-few-matches 200, no-consensus 39, not-facing 16 |
| table | 0.8 | orb | 0.7907 (0.7753–0.8127) | 0.9925 | 48 / 48.48 | 51 | too-few-inliers 245, not-facing 161, no-consensus 25, too-few-matches 16 |
| table | 0.8 | teblid | 0.7865 (0.7678–0.7978) | 1.0000 | 56 / 61.72 | 57 | too-few-inliers 229, not-facing 222, no-consensus 5 |
| table | 0.85 | orb | 0.8062 (0.7865–0.8202) | 1.0000 | 85 / 86.72 | 60 | not-facing 411, too-few-inliers 3 |
| table | 0.85 | teblid | 0.8137 (0.7978–0.8315) | 1.0000 | 107 / 110.24 | 72 | not-facing 396, too-few-inliers 2 |
| table | 0.9 | orb | 0.8202 (0.8090–0.8390) | 1.0000 | 175 / 177.06 | 73 | not-facing 384 |
| table | 0.9 | teblid | 0.8282 (0.8052–0.8464) | 1.0000 | 206 / 204.44 | 84 | not-facing 367 |
| wall | 0.7 | orb | 0.6913 (0.6913–0.6913) | 0.7114 | 41 / 33.73 | 53 | too-few-matches 688, too-few-inliers 48 |
| wall | 0.7 | teblid | 0.6913 (0.6913–0.6913) | 0.7081 | 40 / 32.89 | 50 | too-few-matches 696, too-few-inliers 33, not-facing 7 |
| wall | 0.75 | orb | 0.7085 (0.7047–0.7148) | 0.7349 | 57 / 43.52 | 64 | too-few-matches 632, too-few-inliers 49, not-facing 14 |
| wall | 0.75 | teblid | 0.7169 (0.7148–0.7215) | 0.7852 | 54 / 45.66 | 64 | too-few-matches 512, too-few-inliers 127, not-facing 22, no-consensus 14 |
| wall | 0.8 | orb | 0.7102 (0.7047–0.7181) | 0.9430 | 76 / 59.35 | 77 | too-few-inliers 389, too-few-matches 136, not-facing 105, no-consensus 61 |
| wall | 0.8 | teblid | 0.7332 (0.7181–0.7416) | 0.9866 | 81 / 65.74 | 80 | too-few-inliers 321, not-facing 198, no-consensus 85, too-few-matches 32 |
| wall | 0.85 | orb | 0.7219 (0.6980–0.7315) | 1.0000 | 121 / 94.05 | 89 | not-facing 546, too-few-inliers 117 |
| wall | 0.85 | teblid | 0.7345 (0.7248–0.7483) | 1.0000 | 128 / 105.75 | 98 | not-facing 570, too-few-inliers 62, no-consensus 1 |
| wall | 0.9 | orb | 0.7315 (0.7148–0.7416) | 1.0000 | 205 / 164.87 | 101 | not-facing 634, too-few-inliers 6 |
| wall | 0.9 | teblid | 0.7395 (0.7181–0.7517) | 1.0000 | 217 / 178.08 | 110 | not-facing 618, too-few-inliers 3 |

### Paired per frame, same seed and ratio: frames one arm accepts and the other refuses, summed over seeds

| clip | ratio | both | TEBLID only | ORB only | neither | frames × seeds |
| --- | --- | --- | --- | --- | --- | --- |
| cross | 0.8 | 3336 | 0 | 0 | 0 | 3336 |
| static | 0.8 | 2904 | 0 | 0 | 0 | 2904 |
| table | 0.7 | 1523 | 8 | 45 | 560 | 2136 |
| table | 0.75 | 1616 | 22 | 32 | 466 | 2136 |
| table | 0.8 | 1626 | 54 | 63 | 393 | 2136 |
| table | 0.85 | 1651 | 87 | 71 | 327 | 2136 |
| table | 0.9 | 1671 | 98 | 81 | 286 | 2136 |
| wall | 0.7 | 1640 | 8 | 8 | 728 | 2384 |
| wall | 0.75 | 1687 | 22 | 2 | 673 | 2384 |
| wall | 0.8 | 1678 | 70 | 15 | 621 | 2384 |
| wall | 0.85 | 1685 | 66 | 36 | 597 | 2384 |
| wall | 0.9 | 1702 | 61 | 42 | 579 | 2384 |

### Detection stages, desktop wall time per frame, ms, over every frame of the 8 seeds (prototype timings; nitro-walt)

| clip | ratio | arm | detect p50 / p95 | describe p50 / p95 | match p50 / p95 | estimateHomography p50 / p95 | sum p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cross | 0.8 | orb | 1.42 / 2.12 | 2.34 / 3.98 | 19.35 / 28.42 | 0.58 / 1.00 | 23.89 / 34.92 |
| cross | 0.8 | teblid | 1.51 / 2.17 | 2.60 / 3.90 | 20.24 / 28.08 | 0.69 / 1.17 | 25.30 / 34.43 |
| static | 0.8 | orb | 2.90 / 7.13 | 3.04 / 8.44 | 26.40 / 49.05 | 0.54 / 1.19 | 34.17 / 61.39 |
| static | 0.8 | teblid | 3.12 / 6.71 | 3.82 / 8.27 | 28.12 / 44.10 | 0.60 / 1.39 | 36.80 / 56.62 |
| table | 0.7 | orb | 1.44 / 2.69 | 2.16 / 3.12 | 17.26 / 24.68 | 0.28 / 0.53 | 21.39 / 29.78 |
| table | 0.7 | teblid | 1.36 / 2.57 | 2.37 / 3.51 | 16.60 / 25.10 | 0.30 / 0.56 | 20.80 / 30.53 |
| table | 0.75 | orb | 1.47 / 2.77 | 2.18 / 3.69 | 17.60 / 26.68 | 0.34 / 0.64 | 21.83 / 32.71 |
| table | 0.75 | teblid | 1.59 / 3.03 | 2.80 / 4.66 | 20.86 / 29.43 | 0.43 / 0.85 | 26.11 / 36.21 |
| table | 0.8 | orb | 1.84 / 4.28 | 2.93 / 7.61 | 23.26 / 48.41 | 0.68 / 1.59 | 29.09 / 58.99 |
| table | 0.8 | teblid | 2.08 / 6.58 | 3.73 / 10.20 | 27.47 / 55.37 | 0.93 / 3.72 | 35.40 / 71.18 |
| table | 0.85 | orb | 1.39 / 2.65 | 2.13 / 3.08 | 16.30 / 23.78 | 1.87 / 5.73 | 22.55 / 31.91 |
| table | 0.85 | teblid | 1.49 / 2.88 | 2.57 / 3.79 | 19.40 / 27.28 | 2.81 / 11.21 | 27.54 / 38.49 |
| table | 0.9 | orb | 1.36 / 2.70 | 2.11 / 3.04 | 16.35 / 23.37 | 12.15 / 37.46 | 33.78 / 58.65 |
| table | 0.9 | teblid | 1.39 / 2.81 | 2.41 / 3.52 | 17.63 / 25.31 | 13.31 / 45.20 | 36.80 / 67.96 |
| wall | 0.7 | orb | 1.72 / 3.08 | 2.31 / 4.00 | 20.19 / 29.40 | 0.34 / 0.64 | 25.17 / 35.61 |
| wall | 0.7 | teblid | 1.76 / 3.58 | 3.09 / 5.47 | 21.20 / 32.62 | 0.38 / 0.77 | 26.95 / 41.91 |
| wall | 0.75 | orb | 1.74 / 3.20 | 2.34 / 4.42 | 20.09 / 30.89 | 0.41 / 0.81 | 24.99 / 37.61 |
| wall | 0.75 | teblid | 1.70 / 3.05 | 2.86 / 4.69 | 20.20 / 28.86 | 0.45 / 0.82 | 25.82 / 36.13 |
| wall | 0.8 | orb | 1.89 / 5.35 | 2.63 / 7.24 | 21.35 / 41.48 | 0.65 / 1.79 | 27.42 / 53.22 |
| wall | 0.8 | teblid | 1.95 / 5.04 | 3.11 / 8.55 | 22.39 / 45.68 | 0.75 / 2.25 | 29.23 / 57.71 |
| wall | 0.85 | orb | 1.69 / 3.07 | 2.30 / 3.85 | 20.09 / 29.75 | 1.64 / 4.38 | 26.76 / 37.65 |
| wall | 0.85 | teblid | 1.57 / 2.83 | 2.58 / 4.30 | 17.50 / 27.02 | 1.72 / 5.39 | 24.12 / 36.16 |
| wall | 0.9 | orb | 1.69 / 2.99 | 2.31 / 3.75 | 19.83 / 28.88 | 7.02 / 23.51 | 32.77 / 49.66 |
| wall | 0.9 | teblid | 1.57 / 2.79 | 2.54 / 4.08 | 17.55 / 26.73 | 6.25 / 26.78 | 29.84 / 49.74 |

