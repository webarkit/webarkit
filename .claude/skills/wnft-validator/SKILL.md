---
name: wnft-validator
description: Check a .wnft target file — whether it is valid against the format specification, and whether a backend can actually use it. Use when a target fails to track, when a demo shows no matches, when triaging a file from an unknown source, after compiling a target, or whenever someone asks "is this .wnft good?".
---

# wnft-validator

## Run it

```bash
node packages/nft-tracker/bin/validate-target.mjs examples/targets/pinball.wnft
```

Needs `npm run build` first — the script imports the built `dist/`. Several
files at once are fine. `--json` for machine-readable output, `--decode-only`
to check the file against the specification without loading a backend.

Exit: `0` valid and usable, `1` invalid or unusable, `2` bad usage.

## It answers two questions, and they are not the same one

**Is the file valid?** Against `docs/specs/nft-target-format.md` — an error
code from §6.2, plus any warnings from that same table.

**Can a backend use it?** §6.3 selects a descriptor set against a runtime
backend's `capabilities`. This is the half that matters, because **a perfectly
valid file can be unusable**: `NO_USABLE_DESCRIPTORS` is an outcome of
*selection*, not of decoding. §8.1 exempts it by name from "one fixture per
error code", precisely because no file produces it on its own. If a target
decodes cleanly and still never tracks, this is the first thing to run.

## Reading the output

**`decode FAILED <CODE>`** — the file is invalid. The code is from §6.2 and
the detail names the offending field. The file is the problem, not the reader.

**`usable NO, on backend '<name>'`** — the file is *valid*. Nothing is wrong
with it as a file. No descriptor set in it fits this backend: §6.3 needs
`elementType` `"bits"`, `norm` `"hamming"`, and a `kind` the backend declares
in `capabilities.descriptors`. The message lists what the target offers and
what the backend reads. Usually the target was compiled for a different
backend, or with a family this one does not implement.

**`PRODUCER_MISMATCH`** — a warning, never a failure, and it does not change
the exit status. The chosen set was computed by a different backend than the
one reading it. The width probe checks descriptor *shape*; two backends can
agree on shape and still compute different bits, and this is the only signal
that they might (§6.3, ADR-0001's contract gaps). If matching is poor on a
target that validates cleanly, suspect this.

**`probe not conclusive`** — the backend would not describe the synthetic probe
keypoint. Reported as inconclusive rather than folded into a pass, because
calling it a pass is exactly the overclaim the probe exists to prevent.

**`UNSUPPORTED_DESCRIPTOR_SET`** in the warnings is often the rule working
rather than a fault: a set whose `kind`, `norm` or `elementType` this reader
does not know is warned about, and the rest of the file stays usable. Check
whether a *usable* set survived before treating it as a problem.

## Do not

- Do not conclude a target is fine because it decodes. That is what the
  usability pass is for, and skipping it is how a valid file that never tracks
  gets blamed on the tracker.
- Do not read `usable yes` as "this will match well". It means the shapes line
  up. Bit compatibility across producers is not established, which is what
  `PRODUCER_MISMATCH` is telling you when it appears.
- Do not fix a validation failure by editing the `.wnft`. It is generated —
  recompile it with `bin/compile-target.mjs`, or fix the codec, or fix the
  specification. The one file that is generated-but-committed,
  `examples/targets/pinball.wnft`, is also asserted on by
  `crates/wnft-format/tests/real_target.rs`, so recompiling it changes that
  test's expectations in the same commit.
