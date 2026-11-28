## V's wrong locks: their margin, and their fraction of the poster's width

Every V event classed wrong on the four-corner reading, any clip and schedule: the kept output beyond 10 px, how far beyond, its corners, and the distance and the excess as fractions of the poster's TL–TR width on that clip frame (#284's recorded gross rows: 0.169 to 0.234 of the width).

| event | clip frame (s) | arm | step | distance | beyond by | TL / TR / BR / BL | poster width | distance / width | excess / width | three-corner | outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast/every/s5/k725/V | 725 (24.161) | V | 0 | 11.70 | 1.70 | 12.8 / 21.4 / 2.1 / 10.5 | 177.7 | 0.066 | 0.010 | 12.12 | lost at 1 |
| wall/device-15/s3/k136/V | 208 (8.348) | V | 0 | 11.12 | 1.12 | 9.2 / 3.1 / 2.8 / 29.4 | 163.7 | 0.068 | 0.007 | 5.02 | lost at 1 |
| wall/device-25/s1/k92/V | 271 (10.876) | shipped | 6 | 31.48 | 21.48 | 51.9 / 66.4 / 2.1 / 5.5 | 186.2 | 0.169 | 0.115 | 40.15 | lost at 7 |
| wall/device-25/s5/k93/V | 271 (10.876) | shipped | 6 | 31.48 | 21.48 | 51.9 / 66.4 / 2.1 / 5.5 | 186.2 | 0.169 | 0.115 | 40.15 | lost at 7 |
| wall/device-25/s8/k36/V | 114 (4.575) | V | 0 | 21.24 | 11.24 | 55.7 / 25.3 / 1.3 / 2.6 | 90.4 | 0.235 | 0.124 | 27.45 | lost at 1 |
| wall/device-25/s8/k207/V | 271 (10.876) | shipped | 6 | 31.48 | 21.48 | 51.9 / 66.4 / 2.1 / 5.5 | 186.2 | 0.169 | 0.115 | 40.15 | lost at 7 |

6 kept outputs beyond the margin in V's events.

## Fast `every`, clip frames 720–735, loop 1, every seed: the shipped arm's and V's records

Each record: its state and, where it has corners on a frame the reference accepts, its mean corner distance (px). D detect, T track, L lost; a dash where the reference rejects the frame or the record has no corners.

| seed | arm | 720 | 721 | 722 | 723 | 724 | 725 | 726 | 727 | 728 | 729 | 730 | 731 | 732 | 733 | 734 | 735 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | shipped | D 4.6 | D 5.2 | D 6.3 | D 4.0 | D 5.2 | D 4.5 | D 3.4 | D 4.7 | D 5.6 | D 5.9 | D 6.1 | T 5.1 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 1 | V | D 4.6 | D 5.2 | D 6.3 | D 4.0 | D 5.2 | D 4.5 | D 3.4 | T 4.1 | T 4.9 | T 5.2 | T 5.1 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 2 | shipped | D 4.6 | D 5.7 | D 5.1 | D 4.1 | D 5.6 | D 4.9 | D 3.2 | D 4.7 | D 5.3 | D 6.2 | D 5.9 | T 5.1 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 2 | V | D 4.6 | D 5.7 | D 5.1 | D 4.1 | D 5.6 | D 4.9 | D 3.2 | T 4.1 | D 5.3 | D 6.2 | T 5.3 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 3 | shipped | D 4.5 | D 5.5 | D 4.2 | D 4.3 | D 5.4 | D 4.6 | D 3.2 | D 4.5 | D 5.5 | D 6.0 | D 5.6 | T 5.1 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 3 | V | D 4.5 | D 5.5 | D 4.2 | D 4.3 | D 5.4 | D 4.6 | D 3.2 | T 4.1 | D 5.5 | D 6.0 | T 5.1 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 4 | shipped | D 4.5 | D 5.5 | D 3.4 | D 3.8 | D 4.8 | D 4.4 | D 3.5 | D 4.6 | D 6.1 | D 5.9 | D 5.6 | T 5.1 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 4 | V | D 4.5 | D 5.5 | D 3.4 | D 3.8 | D 4.8 | D 4.4 | D 3.5 | T 4.1 | T 4.9 | T 5.2 | T 5.1 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 5 | shipped | D 4.5 | D 5.5 | D 5.4 | D 4.8 | D 5.3 | D 4.2 | D 3.7 | D 4.6 | D 5.7 | D 5.7 | D 5.5 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 5 | V | D 4.5 | D 5.5 | D 5.4 | D 4.8 | D 5.3 | T 11.7 | D 3.7 | D 4.6 | T 5.0 | T 5.2 | T 5.1 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 6 | shipped | D 4.6 | D 5.5 | D 3.8 | D 3.3 | D 4.4 | D 4.5 | D 3.8 | D 4.5 | D 5.6 | D 5.8 | D 5.6 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 6 | V | D 4.6 | D 5.5 | D 3.8 | D 3.3 | D 4.4 | D 4.5 | D 3.8 | T 4.2 | T 4.9 | T 5.2 | T 5.1 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 7 | shipped | D 4.6 | D 6.9 | D 4.5 | D 5.4 | D 5.2 | D 4.9 | D 3.2 | D 4.7 | D 5.3 | D 5.8 | D 5.5 | T 5.1 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 7 | V | D 4.6 | D 6.9 | D 4.5 | D 5.4 | D 5.2 | D 4.9 | D 3.2 | T 4.0 | D 5.3 | D 5.8 | T 5.3 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 8 | shipped | D 4.6 | D 6.5 | D 4.9 | D 3.7 | D 5.0 | D 4.9 | D 3.6 | D 5.1 | D 5.4 | D 5.9 | D 5.6 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |
| 8 | V | D 4.6 | D 6.5 | D 4.9 | D 3.7 | D 5.0 | D 4.9 | D 3.6 | T 4.1 | T 4.9 | T 5.2 | T 5.1 | T 5.2 | T 5.2 | T 5.6 | T 5.3 | T 5.5 |

TRACK records V adds on fast `every`, per seed, loop 1 / loop 2: s1 16 / 16; s2 11 / 11; s3 11 / 11; s4 11 / 11; s5 14 / 14; s6 15 / 15; s7 11 / 11; s8 17 / 17. Out of 898 frames a loop.

## V's lasting carries on fast `every`, by clip frame

- clip frame 727 (24.228 s): seeds 1, 4, 5, 6, 8
- clip frame 728 (24.261 s): seeds 1, 2, 3, 4, 5, 6, 8
- clip frame 729 (24.294 s): seeds 1, 2, 3, 4, 5, 6, 7, 8
- clip frame 730 (24.328 s): seeds 1, 2, 3, 4, 5, 6, 7, 8
- 28 carries, 4 clip frames.

## The fast clip's carries that were lost: at which carried step, and why

`lostAt`: the carried step on which the lock was refused (1 the step after the paired one). Median: the mean of the two middle values on an even count.

| schedule | lever | direction | lost | lostAt min / median / max | reasons |
| --- | --- | --- | --- | --- | --- |
| every | V | lever-kept | 80 | 1 / 4 / 25 | poor-fit 79, too-few-patches 1 |
| every | F0 | lever-kept | 5 | 1 / 5 / 5 | poor-fit 5 |
| every | F0 | shipped-kept | 7 | 9 / 9 / 11 | poor-fit 7 |
| every | Ffb | lever-kept | 5 | 1 / 5 / 5 | poor-fit 5 |
| device-15 (modelled) | V | lever-kept | 23 | 1 / 1 / 8 | too-few-patches 6, fit-failed 15, too-many-outliers 1, poor-fit 1 |
| device-15 (modelled) | F0 | lever-kept | 6 | 7 / 10 / 10 | poor-fit 6 |
| device-15 (modelled) | Fs | lever-kept | 6 | 7 / 10 / 10 | poor-fit 6 |
| device-15 (modelled) | Fs | shipped-kept | 4 | 1 / 1 / 1 | poor-fit 4 |
| device-15 (modelled) | Ffb | lever-kept | 6 | 7 / 10 / 10 | poor-fit 6 |
| device-25 (modelled) | V | lever-kept | 23 | 1 / 1 / 8 | too-few-patches 6, fit-failed 15, too-many-outliers 1, poor-fit 1 |
| device-25 (modelled) | F0 | lever-kept | 6 | 7 / 10 / 10 | poor-fit 6 |
| device-25 (modelled) | Fs | lever-kept | 6 | 7 / 10 / 10 | poor-fit 6 |
| device-25 (modelled) | Fs | shipped-kept | 4 | 1 / 1 / 1 | poor-fit 4 |
| device-25 (modelled) | Ffb | lever-kept | 6 | 3 / 3 / 6 | poor-fit 6 |

## #278's one-hop `acrossWrap` rows

2 of 5673 paired rows: wall/device-25/s1/k109/V (repeats false, can respond false, discordant null); wall/device-25/s5/k110/V (repeats false, can respond false, discordant null).

## The fast clip's `device-15` and `device-25` runs

- none: 8 of 8 seeds give the same records on both schedules.
- V: 8 of 8 seeds give the same records on both schedules.
- F0: 8 of 8 seeds give the same records on both schedules.
- Fs: 8 of 8 seeds give the same records on both schedules.
- Ffb: 0 of 8 seeds give the same records on both schedules.

## Fs and Ffb on fast `device-15` (modelled), per seed

- 0 of 8 seeds: Fs's run and Ffb's run give the same records.
- Fs's counts per seed (age-1 steps, acted, no verdict): s1 16/16/0; s2 16/16/0; s3 16/16/0; s4 16/16/0; s5 16/16/0; s6 16/16/0; s7 16/16/0; s8 16/16/0
- Ffb's counts per seed (age-1 steps, acted, fell back): s1 16/16/4; s2 16/16/2; s3 16/16/2; s4 16/16/2; s5 16/16/2; s6 16/16/2; s7 16/16/2; s8 16/16/2

