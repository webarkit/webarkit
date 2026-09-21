---
name: contract-check
description: Check that the CvBackend contract's DescriptorKind/DescriptorNorm/DetectorKind unions, the TypeScript codec's known.ts lists and the Rust codec's known.rs lists still agree. Use before committing any change to packages/cv-backend-spec/src/cv_backend.ts, to either known.ts or known.rs, or to the supported format version — and when deciding whether a descriptor-set warning is a bug or the rule working.
---

# contract-check

## Run it

```bash
npm run check:contract
```

No build, no install, no Rust toolchain — it reads source text. It also runs as
its own CI job.

## What it protects

`crates/wnft-format/src/known.rs` **hand-transcribes** the contract's
`DescriptorKind` and `DescriptorNorm` unions. Nothing links the two: no
codegen, no shared schema, no test.

A member in one list and not the other makes one codec warn about and drop a
descriptor set the other accepts — on a `.wnft` file that no fixture contains.
Both test suites stay green. `npm test` cannot see it, `cargo test` cannot see
it, and §8.2 item 4's cross-implementation comparison cannot see it either,
because the shared corpus is generated from one side only.

Three legs are checked:

```
contract union  ->  known.ts list  ->  known.rs list
(cv_backend.ts)     (nft-tracker)      (wnft-format)
```

plus `SUPPORTED_FORMAT_VERSION` and `SUPPORTED_CONTAINER_MAJOR` on both codecs,
and the continued presence of the compile-time pin inside `known.ts`.

## Reading a failure

**Leg 1 — the contract and `known.ts` disagree.** `known.ts` is wrong,
essentially always. It exists to enumerate the union; the union is the
contract. Add or remove the member there, then re-run — leg 2 will now fail
too, which is the point.

**Leg 2 — `known.ts` and `known.rs` disagree.** Decide which side the *contract*
supports, then fix the other. A family the contract defines belongs in both. A
family it does not — `"hamming2"` is the standing example, named in §5.6's
prose but absent from `DescriptorNorm` — belongs in neither, and a set using it
being warned about and preserved is the rule working, not a gap to fill.

**The version scalars disagree.** One codec would reject the other's files with
`UNSUPPORTED_FORMAT_VERSION`. Almost always a half-finished format bump: the
bump touches the specification, both codecs, the fixture corpus directory and
`examples/targets/pinball.wnft` together.

**"the compile-time pin is gone".** Someone removed the `satisfies` or the
`Exclude<...>` guard in `known.ts`. Restore it. This script is the backstop for
the seam between the two languages; that guard is what gives the TypeScript
side an error at build time instead of at review time.

**A `note:` line about order** is not a failure and the script exits 0.
Membership decides whether a set is usable; order does not. It is still worth
looking at, because a diverging order is usually the visible half of an edit
that was applied to one file and not the other.

## Do not

- Do not "fix" a failure by editing whichever file is easier. Work out what the
  contract says first.
- Do not add a member to `known.rs` alone to silence a warning about a real
  file. If a `.wnft` in the wild carries a family the contract does not define,
  the warning is correct and the fix is a contract change with its own ADR.
- Do not delete the compile-time pin because this script now covers it. Build-
  time feedback beats CI feedback, and the script asserts the pin is present
  precisely so the two do not collapse into one.
