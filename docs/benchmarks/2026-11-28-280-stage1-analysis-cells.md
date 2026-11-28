## Eligible events, per clip, schedule and lever (before any class)

Events: distinct lock states (#278's key), repeats left out. Eligible: the lever can respond (V: a DETECT chain; F0, Ffb: every age-1 state; Fs: a ≠ b, its power taken). Across a wrap: eligible events whose input spans a loop wrap (from the record two before the step to the step), counted apart and excluded from every deciding figure.

| clip | schedule | lever | rows | events | eligible | Fs no verdict | across a wrap (discordant) | counted discordant |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast | every | V | 1046 | 452 | 356 | – | 0 (0) | 108 |
| fast | every | F0 | 298 | 93 | 93 | – | 0 (0) | 12 |
| fast | every | Fs | 298 | 93 | 0 | 0 | 0 (0) | 0 |
| fast | every | Ffb | 298 | 93 | 93 | – | 0 (0) | 5 |
| fast | device-15 (modelled) | V | 436 | 193 | 140 | – | 0 (0) | 31 |
| fast | device-15 (modelled) | F0 | 146 | 53 | 53 | – | 0 (0) | 6 |
| fast | device-15 (modelled) | Fs | 146 | 53 | 53 | 0 | 0 (0) | 10 |
| fast | device-15 (modelled) | Ffb | 146 | 53 | 53 | – | 0 (0) | 6 |
| fast | device-25 (modelled) | V | 436 | 193 | 140 | – | 0 (0) | 31 |
| fast | device-25 (modelled) | F0 | 146 | 53 | 53 | – | 0 (0) | 6 |
| fast | device-25 (modelled) | Fs | 146 | 53 | 53 | 0 | 0 (0) | 10 |
| fast | device-25 (modelled) | Ffb | 146 | 53 | 53 | – | 0 (0) | 6 |
| table | every | V | 84 | 34 | 6 | – | 0 (0) | 1 |
| table | every | F0 | 22 | 9 | 9 | – | 0 (0) | 2 |
| table | every | Fs | 22 | 9 | 0 | 0 | 0 (0) | 0 |
| table | every | Ffb | 22 | 9 | 9 | – | 0 (0) | 2 |
| table | device-15 | V | 73 | 49 | 13 | – | 0 (0) | 8 |
| table | device-15 | F0 | 40 | 24 | 24 | – | 0 (0) | 3 |
| table | device-15 | Fs | 40 | 24 | 24 | 0 | 0 (0) | 3 |
| table | device-15 | Ffb | 40 | 24 | 24 | – | 0 (0) | 3 |
| table | device-25 | V | 73 | 49 | 13 | – | 0 (0) | 8 |
| table | device-25 | F0 | 40 | 24 | 24 | – | 0 (0) | 3 |
| table | device-25 | Fs | 40 | 24 | 24 | 0 | 0 (0) | 3 |
| table | device-25 | Ffb | 40 | 24 | 24 | – | 0 (0) | 3 |
| wall | every | V | 170 | 63 | 38 | – | 0 (0) | 16 |
| wall | every | F0 | 64 | 22 | 22 | – | 0 (0) | 0 |
| wall | every | Fs | 64 | 22 | 0 | 0 | 0 (0) | 0 |
| wall | every | Ffb | 64 | 22 | 22 | – | 0 (0) | 0 |
| wall | device-15 | V | 266 | 118 | 105 | – | 0 (0) | 27 |
| wall | device-15 | F0 | 40 | 14 | 14 | – | 0 (0) | 2 |
| wall | device-15 | Fs | 40 | 14 | 14 | 0 | 0 (0) | 0 |
| wall | device-15 | Ffb | 40 | 14 | 14 | – | 0 (0) | 1 |
| wall | device-25 | V | 365 | 213 | 155 | – | 0 (0) | 33 |
| wall | device-25 | F0 | 112 | 42 | 42 | – | 0 (0) | 7 |
| wall | device-25 | Fs | 112 | 42 | 42 | 0 | 0 (0) | 4 |
| wall | device-25 | Ffb | 112 | 42 | 42 | – | 0 (0) | 4 |

## The classes, per cell

Win: the carried arm lasts N with no kept step beyond the margin on an accepted reference frame; tie: lost before N; wrong: a kept step beyond the margin; censored: a loop's end before N. Wins against wins, two-sided exact sign test. Void: fewer than 6 counted discordant events (events), or fewer than 6 wins in all (wins).

| clip | schedule | lever | events lever-kept / shipped-kept | wins lever / shipped | p | reading | ties | wrong | censored | censored as wins: wins, p | three corners: wins, p, wrong | clip frames: lever / shipped, p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast | every | V | 108 / 0 | 28 / 0 | 0.0000 | **moves** | 79 / 0 | 1 / 0 | 0 / 0 | 28 / 0, 0.0000 (**moves**) | 28 / 0, 0.0000 (**moves**), 1 / 0 | 4 / 0, 0.1250 |
| fast | every | F0 | 5 / 7 | 0 / 0 | 1.0000 | void (wins) | 5 / 7 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| fast | every | Fs | 0 / 0 | 0 / 0 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| fast | every | Ffb | 5 / 0 | 0 / 0 | 1.0000 | void (events) | 5 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| fast | device-15 (modelled) | V | 23 / 8 | 0 / 8 | 0.0078 | moves down | 23 / 0 | 0 / 0 | 0 / 0 | 0 / 8, 0.0078 (moves down) | 0 / 8, 0.0078 (moves down), 0 / 0 | 0 / 1, 1.0000 |
| fast | device-15 (modelled) | F0 | 6 / 0 | 0 / 0 | 1.0000 | void (wins) | 6 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| fast | device-15 (modelled) | Fs | 6 / 4 | 0 / 0 | 1.0000 | void (wins) | 6 / 4 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| fast | device-15 (modelled) | Ffb | 6 / 0 | 0 / 0 | 1.0000 | void (wins) | 6 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| fast | device-25 (modelled) | V | 23 / 8 | 0 / 8 | 0.0078 | moves down | 23 / 0 | 0 / 0 | 0 / 0 | 0 / 8, 0.0078 (moves down) | 0 / 8, 0.0078 (moves down), 0 / 0 | 0 / 1, 1.0000 |
| fast | device-25 (modelled) | F0 | 6 / 0 | 0 / 0 | 1.0000 | void (wins) | 6 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| fast | device-25 (modelled) | Fs | 6 / 4 | 0 / 0 | 1.0000 | void (wins) | 6 / 4 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| fast | device-25 (modelled) | Ffb | 6 / 0 | 0 / 0 | 1.0000 | void (wins) | 6 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| table | every | V | 0 / 1 | 0 / 1 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 1, 1.0000 (void (events)) | 0 / 1, 1.0000 (void (events)), 0 / 0 | 0 / 1, 1.0000 |
| table | every | F0 | 2 / 0 | 2 / 0 | 0.5000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 0, 0.5000 (void (events)) | 2 / 0, 0.5000 (void (events)), 0 / 0 | 2 / 0, 0.5000 |
| table | every | Fs | 0 / 0 | 0 / 0 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| table | every | Ffb | 2 / 0 | 2 / 0 | 0.5000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 0, 0.5000 (void (events)) | 2 / 0, 0.5000 (void (events)), 0 / 0 | 2 / 0, 0.5000 |
| table | device-15 | V | 0 / 8 | 0 / 0 | 1.0000 | void (wins) | 0 / 8 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-15 | F0 | 3 / 0 | 0 / 0 | 1.0000 | void (events) | 3 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-15 | Fs | 3 / 0 | 0 / 0 | 1.0000 | void (events) | 3 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-15 | Ffb | 3 / 0 | 0 / 0 | 1.0000 | void (events) | 3 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-25 | V | 0 / 8 | 0 / 0 | 1.0000 | void (wins) | 0 / 8 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-25 | F0 | 3 / 0 | 0 / 0 | 1.0000 | void (events) | 3 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-25 | Fs | 3 / 0 | 0 / 0 | 1.0000 | void (events) | 3 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| table | device-25 | Ffb | 3 / 0 | 0 / 0 | 1.0000 | void (events) | 3 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | every | V | 13 / 3 | 8 / 3 | 0.2266 | does not move | 5 / 0 | 0 / 0 | 0 / 0 | 8 / 3, 0.2266 (does not move) | 8 / 3, 0.2266 (does not move), 0 / 0 | 1 / 3, 0.6250 |
| wall | every | F0 | 0 / 0 | 0 / 0 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | every | Fs | 0 / 0 | 0 / 0 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | every | Ffb | 0 / 0 | 0 / 0 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | device-15 | V | 20 / 7 | 2 / 7 | 0.1797 | does not move | 17 / 0 | 1 / 0 | 0 / 0 | 2 / 7, 0.1797 (does not move) | 2 / 7, 0.1797 (does not move), 0 / 0 | 2 / 5, 0.4531 |
| wall | device-15 | F0 | 1 / 1 | 0 / 1 | 1.0000 | void (events) | 1 / 0 | 0 / 0 | 0 / 0 | 0 / 1, 1.0000 (void (events)) | 0 / 1, 1.0000 (void (events)), 0 / 0 | 0 / 1, 1.0000 |
| wall | device-15 | Fs | 0 / 0 | 0 / 0 | 1.0000 | void (events) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | device-15 | Ffb | 1 / 0 | 0 / 0 | 1.0000 | void (events) | 1 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | device-25 | V | 16 / 17 | 0 / 0 | 1.0000 | void (wins) | 15 / 14 | 1 / 3 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 1 / 3 | 0 / 0, 1.0000 |
| wall | device-25 | F0 | 4 / 3 | 0 / 0 | 1.0000 | void (wins) | 4 / 3 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (wins)) | 0 / 0, 1.0000 (void (wins)), 0 / 0 | 0 / 0, 1.0000 |
| wall | device-25 | Fs | 2 / 2 | 0 / 0 | 1.0000 | void (events) | 2 / 2 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |
| wall | device-25 | Ffb | 4 / 0 | 0 / 0 | 1.0000 | void (events) | 4 / 0 | 0 / 0 | 0 / 0 | 0 / 0, 1.0000 (void (events)) | 0 / 0, 1.0000 (void (events)), 0 / 0 | 0 / 0, 1.0000 |

## The stop conditions on the clips, read mechanically (the verdict is the probe file's)

1. Corpus: not every lever is void on every fast cell.
   - V: every not void; device-15 (modelled) not void; device-25 (modelled) not void
   - F0: every void (wins); device-15 (modelled) void (wins); device-25 (modelled) void (wins)
   - Fs: every void (events); device-15 (modelled) void (wins); device-25 (modelled) void (wins)
   - Ffb: every void (events); device-15 (modelled) void (wins); device-25 (modelled) void (wins)
2. Metric: V moves fast every (28 / 0, p 0.0000).
   - V fast every: main moves (28 / 0); three-corner moves; censored as wins moves; **clip-frame collapse void (frames) (differs)**
   - F0 fast every: main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
   - Fs fast every: main void (events) (0 / 0); three-corner void (events); censored as wins void (events); clip-frame collapse void (frames)
   - Ffb fast every: main void (events) (0 / 0); three-corner void (events); censored as wins void (events); clip-frame collapse void (frames)
   - V fast device-15 (modelled): main moves down (0 / 8); three-corner moves down; censored as wins moves down; **clip-frame collapse void (frames) (differs)**
   - F0 fast device-15 (modelled): main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
   - Fs fast device-15 (modelled): main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
   - Ffb fast device-15 (modelled): main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
   - V fast device-25 (modelled): main moves down (0 / 8); three-corner moves down; censored as wins moves down; **clip-frame collapse void (frames) (differs)**
   - F0 fast device-25 (modelled): main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
   - Fs fast device-25 (modelled): main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
   - Ffb fast device-25 (modelled): main void (wins) (0 / 0); three-corner void (wins); censored as wins void (wins); clip-frame collapse void (frames)
3. Wrong locks on the clips (lever's carries / shipped arm's carries on the same cell's counted discordant events; void where the shipped arm has fewer than 10 carries; the three-corner reading after the semicolon):
   - V: fast every 1 / 0 **more** (void: 0 shipped carries); 1 / 0 **more**; fast device-15 (modelled) 0 / 0 (void: 8 shipped carries); 0 / 0; fast device-25 (modelled) 0 / 0 (void: 8 shipped carries); 0 / 0; table every 0 / 0 (void: 1 shipped carries); 0 / 0; table device-15 0 / 0 (void: 8 shipped carries); 0 / 0; table device-25 0 / 0 (void: 8 shipped carries); 0 / 0; wall every 0 / 0 (void: 3 shipped carries); 0 / 0; wall device-15 1 / 0 **more** (void: 7 shipped carries); 0 / 0; wall device-25 1 / 3; 1 / 3
   - F0: fast every 0 / 0 (void: 7 shipped carries); 0 / 0; fast device-15 (modelled) 0 / 0 (void: 0 shipped carries); 0 / 0; fast device-25 (modelled) 0 / 0 (void: 0 shipped carries); 0 / 0; table every 0 / 0 (void: 0 shipped carries); 0 / 0; table device-15 0 / 0 (void: 0 shipped carries); 0 / 0; table device-25 0 / 0 (void: 0 shipped carries); 0 / 0; wall every 0 / 0 (void: 0 shipped carries); 0 / 0; wall device-15 0 / 0 (void: 1 shipped carries); 0 / 0; wall device-25 0 / 0 (void: 3 shipped carries); 0 / 0
   - Fs: fast every 0 / 0 (void: 0 shipped carries); 0 / 0; fast device-15 (modelled) 0 / 0 (void: 4 shipped carries); 0 / 0; fast device-25 (modelled) 0 / 0 (void: 4 shipped carries); 0 / 0; table every 0 / 0 (void: 0 shipped carries); 0 / 0; table device-15 0 / 0 (void: 0 shipped carries); 0 / 0; table device-25 0 / 0 (void: 0 shipped carries); 0 / 0; wall every 0 / 0 (void: 0 shipped carries); 0 / 0; wall device-15 0 / 0 (void: 0 shipped carries); 0 / 0; wall device-25 0 / 0 (void: 2 shipped carries); 0 / 0
   - Ffb: fast every 0 / 0 (void: 0 shipped carries); 0 / 0; fast device-15 (modelled) 0 / 0 (void: 0 shipped carries); 0 / 0; fast device-25 (modelled) 0 / 0 (void: 0 shipped carries); 0 / 0; table every 0 / 0 (void: 0 shipped carries); 0 / 0; table device-15 0 / 0 (void: 0 shipped carries); 0 / 0; table device-25 0 / 0 (void: 0 shipped carries); 0 / 0; wall every 0 / 0 (void: 0 shipped carries); 0 / 0; wall device-15 0 / 0 (void: 0 shipped carries); 0 / 0; wall device-25 0 / 0 (void: 0 shipped carries); 0 / 0
4. Control (table, wall): no lever's wins are below the shipped step's with p < 0.05 on any control cell.
5. Modelled device cells: no lever moves only the fast clip's device cells.

