## Question 4: right or wrong on synthetic truth, by mechanism

A detection is right within 2 px RMS of the truth (`inView`), else wrong. A first step is read on the detection it started from; its output H is scored too ("out > 2 px": a confirmed step whose pose is wrong whatever its detection).

### The ground truth's sequences (seed 20260925, one run each)

| sequence | frames | lever | states | DETECT frames: right / wrong | first steps from a right detection: confirmed / n | from a wrong one: confirmed / n | confirmed with out > 2 px | TRACK frames (over 2 px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wander | 40 | none | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| wander | 40 | V | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| wander | 40 | R1 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| wander | 40 | R2 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| wander | 40 | R3 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| wander | 40 | S | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| wander | 40 | T | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 39 (0) |
| leaveAndReturn | 106 | none | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 22 / 2 | 2 / 22 | 0 / 2 | 0 | 51 (0) |
| leaveAndReturn | 106 | V | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 2 / 2 | 2 / 2 | 0 / 2 | 0 | 71 (0) |
| leaveAndReturn | 106 | R1 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTT` | 19 / 2 | 2 / 19 | 0 / 2 | 0 | 54 (0) |
| leaveAndReturn | 106 | R2 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTT` | 16 / 2 | 2 / 16 | 0 / 2 | 0 | 57 (0) |
| leaveAndReturn | 106 | R3 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTT` | 15 / 2 | 2 / 15 | 0 / 2 | 0 | 58 (0) |
| leaveAndReturn | 106 | S | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 22 / 2 | 2 / 22 | 0 / 2 | 0 | 51 (0) |
| leaveAndReturn | 106 | T | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTT` | 22 / 2 | 2 / 22 | 0 / 2 | 0 | 51 (0) |
| settlePath | 80 | none | `LLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 21 / 2 | 1 / 21 | 0 / 2 | 0 | 43 (0) |
| settlePath | 80 | V | `LLLLLLLLLLLLLLDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 2 | 1 / 1 | 0 / 2 | 0 | 63 (0) |
| settlePath | 80 | R1 | `LLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 17 / 2 | 1 / 17 | 0 / 2 | 0 | 47 (0) |
| settlePath | 80 | R2 | `LLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 15 / 2 | 1 / 15 | 0 / 2 | 0 | 49 (0) |
| settlePath | 80 | R3 | `LLLLLLLLLLLLLLDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 13 / 2 | 1 / 13 | 0 / 2 | 0 | 51 (0) |
| settlePath | 80 | S | `LLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 21 / 2 | 1 / 21 | 0 / 2 | 0 | 43 (0) |
| settlePath | 80 | T | `LLLLLLLLLLLLLLDDDDDDDDDDDDDDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 21 / 2 | 1 / 21 | 0 / 2 | 0 | 43 (0) |
| restPath | 60 | none | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| restPath | 60 | V | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| restPath | 60 | R1 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| restPath | 60 | R2 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| restPath | 60 | R3 | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| restPath | 60 | S | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| restPath | 60 | T | `DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 59 (0) |
| velocityStep(2) | 20 | none | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(2) | 20 | V | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(2) | 20 | R1 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(2) | 20 | R2 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(2) | 20 | R3 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(2) | 20 | S | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(2) | 20 | T | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | none | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | V | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | R1 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | R2 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | R3 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | S | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(3) | 20 | T | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | none | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | V | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | R1 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | R2 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | R3 | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | S | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(4) | 20 | T | `DTTTTTTTTTTTTTTTTTTT` | 1 / 0 | 1 / 1 | 0 / 0 | 0 | 19 (0) |
| velocityStep(5) | 20 | none | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(5) | 20 | V | `DTTTTDDTTTTTTTTTTTTT` | 3 / 0 | 2 / 3 | 0 / 0 | 0 | 17 (0) |
| velocityStep(5) | 20 | R1 | `DTTTTDDTTTTTTTTTTTTT` | 3 / 0 | 2 / 3 | 0 / 0 | 0 | 17 (0) |
| velocityStep(5) | 20 | R2 | `DTTTTDTTTTTTTTTTTTTT` | 2 / 0 | 2 / 2 | 0 / 0 | 0 | 18 (0) |
| velocityStep(5) | 20 | R3 | `DTTTTDTTTTTTTTTTTTTT` | 2 / 0 | 2 / 2 | 0 / 0 | 0 | 18 (0) |
| velocityStep(5) | 20 | S | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(5) | 20 | T | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(6) | 20 | none | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(6) | 20 | V | `DTTTTDDTTTTTTTTTTTTT` | 3 / 0 | 2 / 3 | 0 / 0 | 0 | 17 (0) |
| velocityStep(6) | 20 | R1 | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(6) | 20 | R2 | `DTTTTDTTTTTTTTTTTTTT` | 2 / 0 | 2 / 2 | 0 / 0 | 0 | 18 (0) |
| velocityStep(6) | 20 | R3 | `DTTTTDTTTTTTTTTTTTTT` | 2 / 0 | 2 / 2 | 0 / 0 | 0 | 18 (0) |
| velocityStep(6) | 20 | S | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(6) | 20 | T | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(8) | 20 | none | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(8) | 20 | V | `DTTTTDDTTTTTTTTTTTTT` | 3 / 0 | 2 / 3 | 0 / 0 | 0 | 17 (0) |
| velocityStep(8) | 20 | R1 | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(8) | 20 | R2 | `DTTTTDTTTTTTTTTTTTTT` | 2 / 0 | 2 / 2 | 0 / 0 | 0 | 18 (0) |
| velocityStep(8) | 20 | R3 | `DTTTTDTTTTTTTTTTTTTT` | 2 / 0 | 2 / 2 | 0 / 0 | 0 | 18 (0) |
| velocityStep(8) | 20 | S | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(8) | 20 | T | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(10) | 20 | none | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(10) | 20 | V | `DTTTTDDTTTTTTTTTTTTT` | 3 / 0 | 2 / 3 | 0 / 0 | 0 | 17 (0) |
| velocityStep(10) | 20 | R1 | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(10) | 20 | R2 | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(10) | 20 | R3 | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(10) | 20 | S | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |
| velocityStep(10) | 20 | T | `DTTTTDDDDDDDDDDDDDDD` | 16 / 0 | 1 / 15 | 0 / 0 | 0 | 4 (0) |

### #262's grids as short paths (4 frames; speed px a frame), each grid × speed one mechanism, seeds summed

| grid | speed | lever | paths | DETECT frames: right / wrong | first steps from right: confirmed / n | from wrong: confirmed / n | confirmed with out > 2 px | TRACK frames (over 2 px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 0 | none | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 0 | V | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 0 | R1 | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 0 | R2 | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 0 | R3 | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 0 | S | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 0 | T | 360 | 359 / 1 | 359 / 359 | 1 / 1 | 0 | 1080 (0) |
| easy | 4 | none | 360 | 1082 / 1 | 122 / 844 | 0 / 1 | 0 | 357 (0) |
| easy | 4 | V | 360 | 603 / 1 | 360 / 603 | 0 / 1 | 0 | 836 (0) |
| easy | 4 | R1 | 360 | 1036 / 1 | 146 / 822 | 0 / 1 | 0 | 403 (0) |
| easy | 4 | R2 | 360 | 520 / 1 | 308 / 469 | 1 / 1 | 0 | 919 (0) |
| easy | 4 | R3 | 360 | 425 / 1 | 339 / 405 | 1 / 1 | 8 | 1014 (8) |
| easy | 4 | S | 360 | 1103 / 1 | 112 / 855 | 0 / 1 | 0 | 336 (0) |
| easy | 4 | T | 360 | 1082 / 1 | 122 / 844 | 0 / 1 | 0 | 357 (0) |
| easy | 8 | none | 360 | 1439 / 1 | 0 / 1079 | 0 / 1 | 0 | 0 (0) |
| easy | 8 | V | 360 | 719 / 1 | 360 / 719 | 0 / 1 | 0 | 720 (0) |
| easy | 8 | R1 | 360 | 1434 / 1 | 5 / 1079 | 0 / 1 | 0 | 5 (0) |
| easy | 8 | R2 | 360 | 1247 / 1 | 64 / 951 | 0 / 1 | 0 | 192 (0) |
| easy | 8 | R3 | 360 | 1159 / 1 | 105 / 904 | 0 / 1 | 0 | 280 (0) |
| easy | 8 | S | 360 | 1439 / 1 | 0 / 1079 | 0 / 1 | 0 | 0 (0) |
| easy | 8 | T | 360 | 1439 / 1 | 0 / 1079 | 0 / 1 | 0 | 0 (0) |
| hard | 0 | none | 216 | 75 / 72 | 71 / 73 | 26 / 58 | 1 | 276 (1) |
| hard | 0 | V | 216 | 76 / 72 | 72 / 74 | 25 / 58 | 1 | 275 (1) |
| hard | 0 | R1 | 216 | 85 / 81 | 73 / 83 | 22 / 67 | 0 | 255 (0) |
| hard | 0 | R2 | 216 | 75 / 71 | 71 / 73 | 26 / 57 | 1 | 277 (1) |
| hard | 0 | R3 | 216 | 75 / 70 | 71 / 73 | 29 / 57 | 0 | 276 (0) |
| hard | 0 | S | 216 | 68 / 67 | 66 / 67 | 30 / 54 | 0 | 286 (0) |
| hard | 0 | T | 216 | 75 / 72 | 71 / 73 | 26 / 67 | 1 | 276 (1) |
| hard | 4 | none | 216 | 250 / 125 | 11 / 189 | 7 / 101 | 1 | 34 (1) |
| hard | 4 | V | 216 | 169 / 103 | 72 / 158 | 13 / 93 | 1 | 139 (1) |
| hard | 4 | R1 | 216 | 268 / 129 | 4 / 199 | 5 / 104 | 0 | 12 (0) |
| hard | 4 | R2 | 216 | 243 / 124 | 13 / 183 | 7 / 101 | 2 | 42 (2) |
| hard | 4 | R3 | 216 | 215 / 115 | 26 / 164 | 11 / 97 | 4 | 79 (4) |
| hard | 4 | S | 216 | 259 / 126 | 8 / 197 | 8 / 102 | 0 | 24 (0) |
| hard | 4 | T | 216 | 250 / 125 | 11 / 189 | 7 / 112 | 1 | 34 (1) |
| hard | 8 | none | 216 | 274 / 139 | 0 / 202 | 0 / 108 | 0 | 0 (0) |
| hard | 8 | V | 216 | 172 / 117 | 64 / 159 | 11 / 102 | 0 | 124 (0) |
| hard | 8 | R1 | 216 | 274 / 139 | 0 / 202 | 0 / 108 | 0 | 0 (0) |
| hard | 8 | R2 | 216 | 274 / 139 | 0 / 202 | 0 / 108 | 0 | 0 (0) |
| hard | 8 | R3 | 216 | 274 / 139 | 0 / 202 | 0 / 108 | 0 | 0 (0) |
| hard | 8 | S | 216 | 274 / 139 | 0 / 202 | 0 / 108 | 0 | 0 (0) |
| hard | 8 | T | 216 | 274 / 139 | 0 / 202 | 0 / 118 | 0 | 0 (0) |
| partial | 0 | none | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 0 | V | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 0 | R1 | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 0 | R2 | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 0 | R3 | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 0 | S | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 0 | T | 128 | 116 / 12 | 116 / 116 | 12 / 12 | 0 | 384 (0) |
| partial | 4 | none | 128 | 267 / 44 | 66 / 217 | 3 / 35 | 0 | 201 (0) |
| partial | 4 | V | 128 | 171 / 25 | 117 / 171 | 10 / 24 | 0 | 316 (0) |
| partial | 4 | R1 | 128 | 186 / 35 | 96 / 168 | 6 / 27 | 0 | 291 (0) |
| partial | 4 | R2 | 128 | 142 / 35 | 109 / 138 | 7 / 27 | 0 | 335 (0) |
| partial | 4 | R3 | 128 | 131 / 35 | 112 / 130 | 7 / 27 | 0 | 346 (0) |
| partial | 4 | S | 128 | 270 / 48 | 64 / 216 | 0 / 38 | 0 | 192 (0) |
| partial | 4 | T | 128 | 267 / 44 | 66 / 217 | 3 / 35 | 0 | 201 (0) |
| partial | 8 | none | 128 | 457 / 54 | 0 / 346 | 0 / 37 | 0 | 0 (0) |
| partial | 8 | V | 128 | 238 / 21 | 120 / 238 | 7 / 20 | 0 | 252 (0) |
| partial | 8 | R1 | 128 | 457 / 54 | 0 / 346 | 0 / 37 | 0 | 0 (0) |
| partial | 8 | R2 | 128 | 457 / 54 | 0 / 346 | 0 / 37 | 0 | 0 (0) |
| partial | 8 | R3 | 128 | 404 / 54 | 20 / 313 | 0 / 37 | 0 | 53 (0) |
| partial | 8 | S | 128 | 457 / 54 | 0 / 346 | 0 / 37 | 0 | 0 (0) |
| partial | 8 | T | 128 | 457 / 54 | 0 / 346 | 0 / 38 | 0 | 0 (0) |

### The stress set: the hard grid's detections at every ratio, each lever's first step on the next frame (held or 4 px a frame), seeds summed

Right/wrong by the detection's score on its own frame. "Void" where fewer than 10 wrong detections exist: no reading of "confirms no wrong one".

| ratio | right detections | wrong | lever | right confirmed | wrong confirmed | confirmed with out > 2 px |
| --- | --- | --- | --- | --- | --- | --- |
| 0.7 | 102 | 92 | none | 52 | 24 | 1 |
| 0.7 | 102 | 92 | V | 52 | 24 | 1 |
| 0.7 | 102 | 92 | R1 | 46 | 12 | 1 |
| 0.7 | 102 | 92 | R2 | 60 | 22 | 1 |
| 0.7 | 102 | 92 | R3 | 60 | 26 | 0 |
| 0.7 | 102 | 92 | S | 51 | 29 | 0 |
| 0.75 | 126 | 70 | none | 64 | 19 | 1 |
| 0.75 | 126 | 70 | V | 64 | 19 | 1 |
| 0.75 | 126 | 70 | R1 | 60 | 18 | 1 |
| 0.75 | 126 | 70 | R2 | 64 | 19 | 1 |
| 0.75 | 126 | 70 | R3 | 76 | 26 | 0 |
| 0.75 | 126 | 70 | S | 63 | 16 | 0 |
| 0.8 | 132 | 76 | none | 68 | 23 | 1 |
| 0.8 | 132 | 76 | V | 68 | 23 | 1 |
| 0.8 | 132 | 76 | R1 | 54 | 9 | 0 |
| 0.8 | 132 | 76 | R2 | 73 | 21 | 0 |
| 0.8 | 132 | 76 | R3 | 81 | 26 | 2 |
| 0.8 | 132 | 76 | S | 66 | 30 | 0 |
| 0.85 | 122 | 88 | none | 62 | 27 | 0 |
| 0.85 | 122 | 88 | V | 62 | 27 | 0 |
| 0.85 | 122 | 88 | R1 | 50 | 16 | 0 |
| 0.85 | 122 | 88 | R2 | 64 | 26 | 0 |
| 0.85 | 122 | 88 | R3 | 70 | 28 | 0 |
| 0.85 | 122 | 88 | S | 57 | 30 | 0 |
| 0.9 | 132 | 102 | none | 73 | 16 | 2 |
| 0.9 | 132 | 102 | V | 73 | 16 | 2 |
| 0.9 | 132 | 102 | R1 | 57 | 5 | 1 |
| 0.9 | 132 | 102 | R2 | 74 | 18 | 2 |
| 0.9 | 132 | 102 | R3 | 79 | 20 | 1 |
| 0.9 | 132 | 102 | S | 77 | 27 | 6 |

### The single-step perturbation sweep (137 predictions × 2 views × 5 renders), right within 0.5 px RMS as the suite scores it

| lever | steps | right | wrong (px RMS) | refused |
| --- | --- | --- | --- | --- |
| none | 1370 | 788 | 0 | 582 |
| R1 | 1370 | 847 | 0 | 523 |
| R2 | 1370 | 1092 | 16 (2.04, 0.56, 7.06, 6.36, 0.68, 1.87, 6.93, 6.35, 9.29, 1.96, 0.59, 0.71, 9.27, 7.52, 1.86, 9.23) | 262 |
| R3 | 1370 | 1155 | 0 | 215 |

