# #243, M9's registration: addendum of 2026-11-11, the maintainer's rulings on the analysis PR

**An addendum to [`2026-11-10-243-registration.md`](./2026-11-10-243-registration.md), "the
registration" below, whose criteria are cited by `8ec7b0c51a6406f3abfec1fa83d9a39c7c71c3ff`. The
registration is not edited. This file changes no criterion, no prediction, no validity rule's verdict
and no outcome rule. It records how the analysis script and the run-level check, made in one PR
under "What must exist before the pre-flight", items 1 and 2, read two passages that do not decide
for themselves what the scripts must do. Each entry quotes the passages and the maintainer's ruling.
Written before the pre-flight, as the registration allows ("After this record's merge, the plan
changes only by a dated addendum to it, and only before the pre-flight").**

## 1. The tilt bands at 10° and above: corner distance, not a jitter difference

**The passages.**

- Stage 2, the Tilt row of the declared covariates, column "Where it is reported": "per clip and run:
  frames, windows and the CF − IPPE difference per band, beside each criterion". Its bands are
  "#228's registration: 0–1, 1–3, 3–5, 5–7, 7–10, 10–15, 15–20, 20–30, 30–40, over 40".
- "Descriptive readings, never criteria", "Above 10°: only the corner distance (D1)": "No jitter
  difference is read above 10°, and no direction is claimed there."

Read together, the first asks for a CF − IPPE difference in every band, five of them above 10°, and
the second forbids a jitter difference there.

**The maintainer's ruling of 2026-11-11.** The specific passage ("Descriptive readings": "No jitter
difference is read above 10°", D1) governs. Stage 2's Tilt row lists #228's bands for the table's
frames and windows, and its "CF − IPPE difference per band" applies to the bands below 10°. The
analysis prints frames and windows for every band, the CF − IPPE jitter difference for the bands
below 10° only, and the corner distance, as "Descriptive readings" defines it, for the bands at 10°
and above.

## 2. `<export>.clip.txt`: its line format, and the command that writes it

**The passages.**

- V4: "`<export>.clip.txt` holds the SHA-256 of `examples/videos/<clip>` on the serving machine, with
  its UTC time, when the URL is opened and again after the export is pulled. Both equal Step 0's
  table."
- The runbook, "Each run, in order", step 2: "The clip's SHA-256 is read into `<export>.clip.txt` with
  the UTC time"; step 5: "The clip's SHA-256 is read again into `.clip.txt`".

Both say what the file holds, and neither says how a reading is written, so the run-level check had
no format to parse. No `.clip.txt` exists in this repository: M4 registered the file for its round 1
(`docs/benchmarks/README.md`, "The instrument, the subject and the inputs", 2026-10-14), and its
campaign closed before round 1 ran.

**The maintainer's ruling of 2026-11-11: the strict format.** The file is exactly two lines, in time
order, each

```
<ISO-8601 UTC time ending in Z> <64 lowercase hex> examples/videos/<clip>
```

with the path naming the export's `bundledClip`. Anything else fails V4. The file is written by a
command, never typed: at both of the runbook's readings, step 2 (when the URL is opened) and step 5
(after the export is pulled), in the serving checkout, Git Bash on Windows, with `<clip>` and
`<export>` filled:

```bash
printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(sha256sum examples/videos/<clip> | cut -d' ' -f1)" "examples/videos/<clip>" >> <export>.clip.txt
```

The run-level check's tests build their passing file in that command's output format, and fail it on
one line, three lines, the hash of another clip, a path other than `bundledClip`, a time that is not
UTC, and two lines out of order.
