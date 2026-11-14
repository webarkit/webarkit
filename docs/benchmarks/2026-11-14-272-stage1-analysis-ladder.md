## Question 3: the lag ladder, the shipped step from each first step's own detection

+L: the step on the clip frame L after the detected one (+0 its own frame). Own lag: the frame the run stepped on. Counts summed over seeds 1–8; the per-seed share confirmed at +0 minus at the own lag is d.

| clip | schedule | first steps | own lag, clip frames (median, range) | +0 | +1 | +2 | +3 | +4 | +5 | own lag | refused at +0 (seeds with one) | confirmed at +0, refused at own lag | d = +0 − own lag, per seed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| table | every | 84 | 1 (1–1) | 26 of 84 | 22 of 84 | 26 of 84 | 24 of 84 | 26 of 84 | 22 of 84 | 22 | 58 (8 of 8) | 8 | 0.056 (s 0.197; [-0.109, 0.221]; range -0.286–0.400) |
| table | device-15 | 73 | 5 (4–5) | 48 of 73 | 43 of 73 | 31 of 73 | 38 of 73 | 39 of 73 | 40 of 73 | 40 | 25 (8 of 8) | 8 | 0.094 (s 0.111; [0.001, 0.186]; range 0.000–0.250) |
| table | device-25 | 73 | 5 (4–5) | 48 of 73 | 43 of 73 | 31 of 73 | 38 of 73 | 39 of 73 | 40 of 73 | 40 | 25 (8 of 8) | 8 | 0.094 (s 0.111; [0.001, 0.186]; range 0.000–0.250) |
| wall | every | 170 | 1 (1–1) | 100 of 170 | 64 of 170 | 24 of 170 | 18 of 170 | 8 of 170 | 0 of 170 | 64 | 70 (8 of 8) | 36 | 0.214 (s 0.123; [0.110, 0.317]; range 0.000–0.364) |
| wall | device-15 | 266 | 3 (3–3) | 218 of 266 | 170 of 266 | 88 of 266 | 40 of 266 | 30 of 266 | 22 of 266 | 40 | 48 (8 of 8) | 180 | 0.672 (s 0.043; [0.636, 0.708]; range 0.600–0.737) |
| wall | device-25 | 365 | 4 (3–4) | 309 of 365 | 279 of 365 | 212 of 365 | 143 of 363 | 111 of 363 | 102 of 363 | 112 | 56 (8 of 8) | 197 | 0.536 (s 0.056; [0.490, 0.583]; range 0.439–0.600) |
| static | every | 8 | 1 (1–1) | 8 of 8 | 8 of 8 | 8 of 8 | 8 of 8 | 8 of 8 | 8 of 8 | 8 | 0 (0 of 8) | 0 | 0.000 (s 0.000; [0.000, 0.000]; range 0.000–0.000) |
| cross | every | 16 | 1 (1–1) | 16 of 16 | 16 of 16 | 16 of 16 | 16 of 16 | 16 of 16 | 16 of 16 | 16 | 0 (0 of 8) | 0 | 0.000 (s 0.000; [0.000, 0.000]; range 0.000–0.000) |

### Refusals at +0, by reason (summed over seeds)

- table, every: too-few-patches 46, poor-fit 12
- table, device-15: too-few-patches 15, poor-fit 10
- table, device-25: too-few-patches 15, poor-fit 10
- wall, every: poor-fit 44, too-few-patches 26
- wall, device-15: poor-fit 38, too-few-patches 10
- wall, device-25: poor-fit 42, too-few-patches 14

