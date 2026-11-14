## Question 1: the metric and its spread, the shipped arm (ORB, ratio 0.8), seeds 1–8

Each run over its two loops. Lock rate: `trackShare`. Re-lock latency: the median over a run's losses, processed frames and ms of media time (definition in the script's header). Censored: losses never re-locked in the run.

| clip | schedule | lock rate | re-lock latency, frames | re-lock latency, ms | losses | censored | first steps confirmed / first steps | share confirmed | held-lock steps lost | lasting locks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| table | every | 0.7917 (s 0.0253; [0.7705, 0.8128]; range 0.7678–0.8277) | a seed with none: 4.00, 11.00, n/a, n/a, n/a, n/a, n/a, n/a | a seed with none: 133.3, 366.7, n/a, n/a, n/a, n/a, n/a, n/a | 0.75 (s 1.49; [-0.49, 1.99]; range 0.00–4.00) | 0 | 22 / 84 | 0.264 (s 0.109; [0.173, 0.355]; range 0.167–0.429) | 6 | 2.00 (s 0.00; [2.00, 2.00]; range 2.00–2.00) |
| table | device-15 | 0.8363 (s 0.0126; [0.8257, 0.8469]; range 0.8145–0.8478) | 1.06 (s 0.18; [0.91, 1.21]; range 1.00–1.50) | 177.1 (s 29.5; [152.5, 201.7]; range 166.7–250.0) | 3.00 (s 0.93; [2.23, 3.77]; range 2.00–4.00) | 0 | 40 / 73 | 0.585 (s 0.139; [0.469, 0.701]; range 0.375–0.800) | 24 | 2.00 (s 0.00; [2.00, 2.00]; range 2.00–2.00) |
| table | device-25 | 0.8363 (s 0.0126; [0.8257, 0.8469]; range 0.8145–0.8478) | 1.06 (s 0.18; [0.91, 1.21]; range 1.00–1.50) | 177.1 (s 29.5; [152.5, 201.7]; range 166.7–250.0) | 3.00 (s 0.93; [2.23, 3.77]; range 2.00–4.00) | 0 | 40 / 73 | 0.585 (s 0.139; [0.469, 0.701]; range 0.375–0.800) | 24 | 2.00 (s 0.00; [2.00, 2.00]; range 2.00–2.00) |
| wall | every | 0.6774 (s 0.0068; [0.6717, 0.6831]; range 0.6678–0.6879) | 2.50 (s 0.93; [1.73, 3.27]; range 1.00–3.00) | 100.3 (s 37.2; [69.3, 131.4]; range 40.1–120.4) | 6.00 (s 0.00; [6.00, 6.00]; range 6.00–6.00) | 0 | 64 / 170 | 0.395 (s 0.094; [0.317, 0.474]; range 0.267–0.571) | 48 | 4.00 (s 0.00; [4.00, 4.00]; range 4.00–4.00) |
| wall | device-15 | 0.7797 (s 0.0205; [0.7625, 0.7968]; range 0.7624–0.8037) | 9.88 (s 1.25; [8.83, 10.92]; range 8.00–11.00) | 1189.0 (s 150.1; [1063.5, 1314.4]; range 963.2–1324.4) | 3.00 (s 1.07; [2.11, 3.89]; range 2.00–4.00) | 0 | 40 / 266 | 0.151 (s 0.022; [0.133, 0.170]; range 0.100–0.176) | 24 | 4.00 (s 0.00; [4.00, 4.00]; range 4.00–4.00) |
| wall | device-25 | 0.5382 (s 0.0235; [0.5185, 0.5579]; range 0.5023–0.5614) | 1.56 (s 0.50; [1.15, 1.98]; range 1.00–2.00) | 250.8 (s 79.5; [184.3, 317.3]; range 160.5–321.1) | 12.75 (s 2.05; [11.03, 14.47]; range 10.00–15.00) | 4 | 112 / 365 | 0.311 (s 0.079; [0.245, 0.377]; range 0.196–0.395) | 102 | 0.00 (s 0.00; [0.00, 0.00]; range 0.00–0.00) |
| static | every | 0.9986 (s 0.0000; [0.9986, 0.9986]; range 0.9986–0.9986) | a seed with none: n/a, n/a, n/a, n/a, n/a, n/a, n/a, n/a | a seed with none: n/a, n/a, n/a, n/a, n/a, n/a, n/a, n/a | 0.00 (s 0.00; [0.00, 0.00]; range 0.00–0.00) | 0 | 8 / 8 | 1.000 (s 0.000; [1.000, 1.000]; range 1.000–1.000) | 0 | 1.00 (s 0.00; [1.00, 1.00]; range 1.00–1.00) |
| cross | every | 0.9976 (s 0.0000; [0.9976, 0.9976]; range 0.9976–0.9976) | a seed with none: n/a, n/a, n/a, n/a, n/a, n/a, n/a, n/a | a seed with none: n/a, n/a, n/a, n/a, n/a, n/a, n/a, n/a | 0.00 (s 0.00; [0.00, 0.00]; range 0.00–0.00) | 0 | 16 / 16 | 1.000 (s 0.000; [1.000, 1.000]; range 1.000–1.000) | 0 | 2.00 (s 0.00; [2.00, 2.00]; range 2.00–2.00) |

- table: 8 of 8 device-15 runs give the same frames and states as their device-25 run.

- wall: 0 of 8 device-15 runs give the same frames and states as their device-25 run.

### The selection effect: the next-frame step after every accepted detection, against the first steps the every-frame runs take

Population: every frame of one loop detected stateless at the seed, and from each accepted detection the shipped first step on the next frame. Runs: the every-frame runs' first steps (`lockSteps`), both loops.

| clip | accepted detections a seed | their next-frame step confirmed (share) | the runs' first steps a seed | confirmed (share) |
| --- | --- | --- | --- | --- |
| table | 210.1 (s 3.4; [207.2, 213.0]; range 206.0–216.0) | 0.956 (s 0.017; [0.942, 0.970]; range 0.931–0.976) | 10.5 (s 2.6; [8.4, 12.6]; range 6.0–14.0) | 0.264 (s 0.109; [0.173, 0.355]; range 0.167–0.429) |
| wall | 210.6 (s 1.4; [209.4, 211.8]; range 209.0–213.0) | 0.874 (s 0.013; [0.863, 0.885]; range 0.854–0.895) | 21.3 (s 5.0; [17.1, 25.4]; range 14.0–30.0) | 0.395 (s 0.094; [0.317, 0.474]; range 0.267–0.571) |

