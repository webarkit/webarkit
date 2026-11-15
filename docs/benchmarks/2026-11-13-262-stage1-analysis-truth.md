## Question 1: detections scored against the true H, synthetic frames

Score: `inView(H, T)`, the RMS distance, frame px, over the target's 64 patch centres the truth puts inside the 270 × 360 frame.

| grid | ratio | arm | detections | accepted | RMS ≤ 2 px | 2–5 | 5–10 | 10–20 | > 20 | worst RMS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 0.7 | orb | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.57 |
| easy | 0.7 | teblid | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.66 |
| easy | 0.75 | orb | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.50 |
| easy | 0.75 | teblid | 360 | 360 | 359 | 1 | 0 | 0 | 0 | 2.05 |
| easy | 0.8 | orb | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.50 |
| easy | 0.8 | teblid | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.38 |
| easy | 0.85 | orb | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.59 |
| easy | 0.85 | teblid | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.13 |
| easy | 0.9 | orb | 360 | 360 | 359 | 1 | 0 | 0 | 0 | 2.16 |
| easy | 0.9 | teblid | 360 | 360 | 360 | 0 | 0 | 0 | 0 | 1.66 |
| hard | 0.7 | orb | 216 | 113 | 36 | 40 | 7 | 14 | 16 | 68.95 |
| hard | 0.7 | teblid | 216 | 102 | 58 | 17 | 16 | 11 | 0 | 15.26 |
| hard | 0.75 | orb | 216 | 105 | 47 | 40 | 10 | 2 | 6 | 42.11 |
| hard | 0.75 | teblid | 216 | 108 | 75 | 21 | 3 | 5 | 4 | 269.92 |
| hard | 0.8 | orb | 216 | 106 | 65 | 32 | 2 | 4 | 3 | 141.28 |
| hard | 0.8 | teblid | 216 | 113 | 73 | 29 | 5 | 3 | 3 | 42.36 |
| hard | 0.85 | orb | 216 | 112 | 65 | 30 | 5 | 6 | 6 | 282.08 |
| hard | 0.85 | teblid | 216 | 128 | 87 | 25 | 9 | 6 | 1 | 30.28 |
| hard | 0.9 | orb | 216 | 125 | 63 | 29 | 7 | 12 | 14 | 69.23 |
| hard | 0.9 | teblid | 216 | 126 | 80 | 33 | 6 | 4 | 3 | 177.76 |
| partial | 0.7 | orb | 128 | 128 | 116 | 7 | 5 | 0 | 0 | 8.31 |
| partial | 0.7 | teblid | 128 | 128 | 119 | 1 | 8 | 0 | 0 | 6.35 |
| partial | 0.75 | orb | 128 | 128 | 112 | 9 | 7 | 0 | 0 | 7.10 |
| partial | 0.75 | teblid | 128 | 128 | 119 | 4 | 5 | 0 | 0 | 9.31 |
| partial | 0.8 | orb | 128 | 128 | 115 | 7 | 5 | 0 | 1 | 25.37 |
| partial | 0.8 | teblid | 128 | 128 | 113 | 10 | 5 | 0 | 0 | 8.02 |
| partial | 0.85 | orb | 128 | 127 | 117 | 5 | 4 | 1 | 0 | 16.71 |
| partial | 0.85 | teblid | 128 | 128 | 116 | 5 | 7 | 0 | 0 | 7.41 |
| partial | 0.9 | orb | 128 | 126 | 111 | 9 | 3 | 2 | 1 | 148.34 |
| partial | 0.9 | teblid | 128 | 126 | 117 | 3 | 5 | 0 | 1 | 30.54 |

### No target in the frame (160 detections a cell)

| ratio | arm | accepted | reasons |
| --- | --- | --- | --- |
| 0.7 | orb | 0 of 160 | too-few-matches 160 |
| 0.7 | teblid | 0 of 160 | too-few-matches 160 |
| 0.75 | orb | 0 of 160 | too-few-matches 160 |
| 0.75 | teblid | 0 of 160 | too-few-matches 160 |
| 0.8 | orb | 0 of 160 | too-few-matches 160 |
| 0.8 | teblid | 0 of 160 | too-few-matches 160 |
| 0.85 | orb | 0 of 160 | too-few-matches 160 |
| 0.85 | teblid | 0 of 160 | too-few-matches 160 |
| 0.9 | orb | 0 of 160 | too-few-matches 160 |
| 0.9 | teblid | 0 of 160 | too-few-matches 160 |

### The tracker's sequences (one run each, ratio 0.8): states, and each DETECT frame's RMS against the truth and whether its next frame is TRACK

- **orb, leaveAndReturn:** `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT`; DETECT frames: 0 0.98 px held; 70 21.70 px dropped; 71 5.17 px dropped; 72 1.94 px dropped; 73 1.08 px dropped; 74 0.81 px dropped; 75 1.04 px dropped; 76 1.11 px dropped; 77 0.95 px dropped; 78 0.90 px dropped; 79 0.90 px dropped; 80 0.93 px dropped; 81 1.17 px dropped; 82 0.89 px dropped; 83 0.96 px dropped; 84 0.87 px dropped; 85 0.93 px dropped; 86 0.90 px dropped; 87 1.01 px dropped; 88 1.65 px dropped; 89 0.95 px dropped; 90 0.98 px dropped; 91 0.98 px dropped; 92 0.98 px held
- **orb, wander:** `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT`; DETECT frames: 0 0.98 px held
- **teblid, leaveAndReturn:** `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT`; DETECT frames: 0 0.86 px held; 70 4.92 px dropped; 71 7.63 px dropped; 72 2.73 px dropped; 73 1.61 px dropped; 74 1.06 px dropped; 75 0.89 px dropped; 76 1.80 px dropped; 77 1.09 px dropped; 78 0.83 px dropped; 79 0.85 px dropped; 80 0.74 px dropped; 81 1.17 px dropped; 82 0.77 px dropped; 83 0.82 px dropped; 84 0.67 px dropped; 85 0.78 px dropped; 86 0.77 px dropped; 87 0.78 px dropped; 88 0.85 px dropped; 89 0.87 px dropped; 90 0.85 px dropped; 91 0.82 px dropped; 92 0.76 px held
- **teblid, wander:** `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT`; DETECT frames: 0 0.86 px held

