## Question 2: the refusals, the shipped arm, seeds 1–8 summed

### First steps by `trackLoss` (refused ones), `too-few-patches` split by where it fired: before the fit (fewer than 8 observations) or after it (fewer than 8 inliers)

| clip | schedule | first steps | confirmed | too-few-patches before the fit | after the fit | poor-fit | too-many-outliers | fit-failed | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| table | every | 84 | 22 | 44 | 2 | 16 | 0 | 0 | 0 |
| table | device-15 | 73 | 40 | 15 | 0 | 18 | 0 | 0 | 0 |
| table | device-25 | 73 | 40 | 15 | 0 | 18 | 0 | 0 | 0 |
| wall | every | 170 | 64 | 80 | 10 | 16 | 0 | 0 | 0 |
| wall | device-15 | 266 | 40 | 172 | 14 | 8 | 14 | 18 | 0 |
| wall | device-25 | 365 | 112 | 179 | 21 | 24 | 6 | 23 | 0 |

### Per patch, through `trackFrame` (the runner's `patches` mode): first steps against held-lock steps; shares of attempted patches, the median over steps, and the pooled share

Unconverged is split by re-aligning with the cap doubled: the same observation means the cap did not bind (at an edge), another means it did (at the cap).

| clip | schedule | steps | n | culled (of 48) | converged and kept | unconverged at the cap | at an edge | rejected by the ZNCC gate | lost | failed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| table | every | first, refused | 62 | 0.0 | 0.11 / 0.15 | 0.69 / 0.69 | 0.00 / 0.00 | 0.08 / 0.08 | 0.06 / 0.07 | 0.00 / 0.00 |
| table | every | first, confirmed | 22 | 0.0 | 0.40 / 0.35 | 0.50 / 0.52 | 0.00 / 0.00 | 0.10 / 0.10 | 0.04 / 0.03 | 0.00 / 0.00 |
| table | every | held | 3374 | 0.0 | 0.73 / 0.73 | 0.19 / 0.20 | 0.00 / 0.00 | 0.06 / 0.06 | 0.00 / 0.01 | 0.00 / 0.00 |
| table | device-15 | first, refused | 33 | 0.0 | 0.17 / 0.16 | 0.65 / 0.67 | 0.00 / 0.00 | 0.08 / 0.10 | 0.06 / 0.07 | 0.00 / 0.00 |
| table | device-15 | first, confirmed | 40 | 0.0 | 0.46 / 0.44 | 0.45 / 0.47 | 0.00 / 0.00 | 0.04 / 0.06 | 0.00 / 0.02 | 0.00 / 0.00 |
| table | device-15 | held | 1506 | 0.0 | 0.71 / 0.67 | 0.23 / 0.28 | 0.00 / 0.00 | 0.04 / 0.05 | 0.00 / 0.01 | 0.00 / 0.00 |
| table | device-25 | first, refused | 33 | 0.0 | 0.17 / 0.16 | 0.65 / 0.67 | 0.00 / 0.00 | 0.08 / 0.10 | 0.06 / 0.07 | 0.00 / 0.00 |
| table | device-25 | first, confirmed | 40 | 0.0 | 0.46 / 0.44 | 0.45 / 0.47 | 0.00 / 0.00 | 0.04 / 0.06 | 0.00 / 0.02 | 0.00 / 0.00 |
| table | device-25 | held | 1506 | 0.0 | 0.71 / 0.67 | 0.23 / 0.28 | 0.00 / 0.00 | 0.04 / 0.05 | 0.00 / 0.01 | 0.00 / 0.00 |
| wall | every | first, refused | 106 | 0.0 | 0.13 / 0.13 | 0.77 / 0.74 | 0.00 / 0.00 | 0.04 / 0.06 | 0.04 / 0.07 | 0.00 / 0.00 |
| wall | every | first, confirmed | 64 | 0.0 | 0.35 / 0.37 | 0.63 / 0.57 | 0.00 / 0.00 | 0.02 / 0.04 | 0.02 / 0.02 | 0.00 / 0.00 |
| wall | every | held | 3222 | 0.0 | 0.67 / 0.64 | 0.25 / 0.30 | 0.00 / 0.00 | 0.04 / 0.05 | 0.02 / 0.02 | 0.00 / 0.00 |
| wall | device-15 | first, refused | 226 | 0.0 | 0.08 / 0.10 | 0.77 / 0.78 | 0.00 / 0.00 | 0.06 / 0.05 | 0.06 / 0.07 | 0.00 / 0.00 |
| wall | device-15 | first, confirmed | 40 | 0.0 | 0.21 / 0.26 | 0.68 / 0.64 | 0.00 / 0.00 | 0.06 / 0.07 | 0.02 / 0.02 | 0.00 / 0.00 |
| wall | device-15 | held | 2576 | 0.0 | 0.71 / 0.67 | 0.23 / 0.27 | 0.00 / 0.00 | 0.04 / 0.04 | 0.02 / 0.02 | 0.00 / 0.00 |
| wall | device-25 | first, refused | 253 | 0.0 | 0.10 / 0.11 | 0.75 / 0.75 | 0.00 / 0.00 | 0.06 / 0.06 | 0.08 / 0.08 | 0.00 / 0.00 |
| wall | device-25 | first, confirmed | 112 | 0.0 | 0.38 / 0.44 | 0.48 / 0.48 | 0.00 / 0.00 | 0.04 / 0.06 | 0.02 / 0.02 | 0.00 / 0.00 |
| wall | device-25 | held | 961 | 0.0 | 0.56 / 0.53 | 0.38 / 0.41 | 0.00 / 0.00 | 0.04 / 0.04 | 0.02 / 0.02 | 0.00 / 0.00 |

