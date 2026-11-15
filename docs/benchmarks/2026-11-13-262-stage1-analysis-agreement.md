## Agreement of accepted detections with a lasting lock (a proxy, not ground truth)

Reference: the frames on which the ORB arm's every-frame tracking run (seed 1, ratio 0.8) holds a lock of 50 or more consecutive TRACK frames, its H there. Distance: the mean, frame px, over the target's four corners, between an accepted stateless detection's H and the reference H on the same frame, every seed.

| clip | ratio | arm | reference frames | accepted on them | ≤ 5 px | 5–20 px | > 20 px | median px |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cross | 0.8 | orb | 416 | 3328 | 3272 | 56 | 0 | 1.75 |
| cross | 0.8 | teblid | 416 | 3328 | 3298 | 30 | 0 | 1.55 |
| static | 0.8 | orb | 362 | 2896 | 2896 | 0 | 0 | 0.95 |
| static | 0.8 | teblid | 362 | 2896 | 2896 | 0 | 0 | 0.96 |
| table | 0.7 | orb | 206 | 1560 | 1512 | 48 | 0 | 1.32 |
| table | 0.7 | teblid | 206 | 1531 | 1477 | 36 | 18 | 1.27 |
| table | 0.75 | orb | 206 | 1617 | 1561 | 49 | 7 | 1.39 |
| table | 0.75 | teblid | 206 | 1618 | 1515 | 80 | 23 | 1.25 |
| table | 0.8 | orb | 206 | 1627 | 1592 | 33 | 2 | 1.36 |
| table | 0.8 | teblid | 206 | 1617 | 1528 | 82 | 7 | 1.30 |
| table | 0.85 | orb | 206 | 1635 | 1557 | 62 | 16 | 1.44 |
| table | 0.85 | teblid | 206 | 1625 | 1504 | 104 | 17 | 1.41 |
| table | 0.9 | orb | 206 | 1632 | 1503 | 100 | 29 | 1.50 |
| table | 0.9 | teblid | 206 | 1628 | 1457 | 140 | 31 | 1.67 |
| wall | 0.7 | orb | 190 | 1520 | 1422 | 75 | 23 | 1.26 |
| wall | 0.7 | teblid | 190 | 1512 | 1425 | 58 | 29 | 1.25 |
| wall | 0.75 | orb | 190 | 1520 | 1466 | 45 | 9 | 1.26 |
| wall | 0.75 | teblid | 190 | 1518 | 1453 | 53 | 12 | 1.27 |
| wall | 0.8 | orb | 190 | 1515 | 1443 | 57 | 15 | 1.30 |
| wall | 0.8 | teblid | 190 | 1514 | 1486 | 20 | 8 | 1.20 |
| wall | 0.85 | orb | 190 | 1511 | 1459 | 38 | 14 | 1.33 |
| wall | 0.85 | teblid | 190 | 1519 | 1485 | 22 | 12 | 1.19 |
| wall | 0.9 | orb | 190 | 1510 | 1455 | 38 | 17 | 1.41 |
| wall | 0.9 | teblid | 190 | 1517 | 1466 | 32 | 19 | 1.22 |

