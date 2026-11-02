# `ground-truth/`

Reference values for measurements: the inputs whose figures a measurement is
read against, kept apart from the tests that assert on them.

**The rule: a file here supplies reference values to a measurement, and holds
no unit tests.** The assertions are in `test/`, which imports from here. A test
that only reads these files, such as `examples/test/detection-worker-core.test.mjs`,
stays where it is.

## What is here

- **#90's sweep**, [`tracking/track_frame_sweep.ts`](./tracking/track_frame_sweep.ts):
  one tracking step on the shipped target, `examples/targets/pinball.wnft`, from
  137 predictions on both views of five renders, at the tracker's own defaults,
  with the verdict on every fit (right within 0.5 px RMS at the 64 patch
  centres, wrong further off, otherwise refused). Asserted in
  `test/tracking/track_frame.test.ts`: no wrong fit, 788 right, at least 11
  inliers on every right fit.
- **#90's sequences**, [`tracker_sequences.ts`](./tracker_sequences.ts):
  `NftTracker` on camera paths of the pinball target, with the true homography
  of every frame, and the shipped target's runs on them (leave and return, a
  slow wander, and velocity steps of 2 to 6 px per frame). The backend and `K`
  are the caller's, as ADR-0001 injects a backend: nothing here imports one.
  Asserted in `test/tracker_state_machine.test.ts`.
- **The fixtures both read**, in [`fixtures/`](./fixtures/): the target's image
  and its reader, the 64-patch tracking target, the renders, and the seeded
  random numbers the renders and the sequences draw.
  `pinball-scene-640.pgm` and `make-fixtures.mjs` are here because the other
  files' bytes refer to them: `pgm.ts` names the scene as `SCENE_FIXTURE`, and
  `make-fixtures.mjs` writes both PGMs beside itself. The generator supplies
  nothing to a measurement; what it made is hashed.

The views, renders, paths and error measures in the two modules are also what
the unit tests on M2's 64-patch fixture use, in the same two test files; those
tests import them from here, and stay in `test/`.

## The freeze

During a measurement campaign these files are inputs, frozen and attested by
their hashes: a change to one changes what the campaign's figures are read
against. The rule that decides it is the role, not the path: a file that
supplies reference values to a counted measurement is an input, wherever it
lives ([#129](https://github.com/webarkit/webarkit/pull/129),
`docs/benchmarks/README.md`, "The instrument, the subject and the inputs
(2026-10-14)", item 3). M4's campaign froze these files where they then lay,
in `test/`, and [#130](https://github.com/webarkit/webarkit/issues/130) moved
them here after it closed, so that a frozen input no longer shares a directory,
or a file, with tests that are free to change.

**The next campaign's plan names these paths as inputs, with their hashes.**
The table gives each file as it is now: as #130 left it, except
`tracker_sequences.ts`, which #106 and #188 changed since, and
`seeded_rng.ts`, which #188 changed (below). Nothing checks it against the
files, so the plan records the hashes at its own start rather than copying
these.

| File                              | SHA-256                                                            | M4's recorded hash, at `37dc6d4`                                   |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `fixtures/tracking_target.ts`     | `9407d82ec31bb4c4510a1b230062d3ed09994de69c4101f4f0f98bca1348209a` | equal, as `test/fixtures/tracking_target.ts`                       |
| `fixtures/warped_frames.ts`       | `0afb9e6dc0bbe7ebf1d9cf264926e837e6ad2bd8b94a4bee9d725afb3d886e97` | equal, as `test/fixtures/warped_frames.ts`                         |
| `fixtures/pgm.ts`                 | `523c80d9e4f6a1beec41e4fda9f289da1f2badc0fe83a2be9d5364ce5ca7befc` | equal, as `test/fixtures/pgm.ts`                                   |
| `fixtures/seeded_rng.ts`          | `1a56058dfc6daf403e376c66624f37ba9201287fe6b4b6a9bc997637d2c1c380` | changed by #188; equal before it, as `test/fixtures/seeded_rng.ts` |
| `fixtures/pinball-target-640.pgm` | `1c82be7f22b00e04a9d878912955330e6f6a212f07da668f4ec7c94e760487e3` | equal, as `test/fixtures/pinball-target-640.pgm`                   |
| `fixtures/pinball-scene-640.pgm`  | `de5d5b1ffb4823b47e6e2904e12a8f4dbf6952c8ea8a6a58f3e96bc7d0fbbc7e` | not recorded; unchanged since `37dc6d4`                            |
| `fixtures/make-fixtures.mjs`      | `30bb61bbe3c118e37419a00f3e8f0df11a60f48b96f51f6ab961ac309a139d78` | not recorded; unchanged since `37dc6d4`                            |
| `tracking/track_frame_sweep.ts`   | `089491e0f52473dcc1527f4968de9ceea2cceee7a8bbb8491bd8bfd1fb6bab78` | new; split out of `test/tracking/track_frame.test.ts`              |
| `tracker_sequences.ts`            | `b3a3bb3934911d02bb5781b848b0bdded9413dca840b490b27b0bd05ffde947d` | new; split out of `test/tracker_state_machine.test.ts`             |

**`tracker_sequences.ts` changed after #130.** #106's Part 3 added the two
paths the maintainer's ruling of 2026-10-29 registers beside the sequences, the
rest path and the settle path of #197's probe
([the registration](../../../docs/benchmarks/2026-10-29-106-stage3-registration.md),
"The registered paths"). Nothing else in the file changed, and no campaign was
open. As #130 left it, its SHA-256 was
`b3a1d87c1aaee1f186550eeb23c39a09b17adc6652280e762380dcfbdede432b`; after #106,
`62dffdd279de22a1e66c2a60e14fde926e9117dae54ffc48d1a3793a4f915d0d`.

**`seeded_rng.ts` and `tracker_sequences.ts` changed in #188 (2026-11-02).**
`withSeededRandom`, which replaced the global `Math.random` for a run, is
gone. `seeded_rng.ts` now builds `mulberry32(seed)`, unchanged, wrapped in a
counter, passes it to the tracker through `rngFor` or to `detectTarget`
directly, refuses a backend that does not declare `deterministicRansac`, and
refuses any read of the global inside a seeded region
([#137](https://github.com/webarkit/webarkit/issues/137), "Usage rule,
2026-10-15"). `run` in `tracker_sequences.ts` keeps one generator for the
run, as before, so the draws are the same ones: every sweep and sequence
result, and every run's draw count, serialised before and after, is byte for
byte the same (#188's pull request). Before #188 their SHA-256 were
`fb7883c55c47ec31140fc7fc75d0543f5f4b59909887872c9869da5b0d691f82` and
`62dffdd279de22a1e66c2a60e14fde926e9117dae54ffc48d1a3793a4f915d0d`.

M4 recorded two more hashes, of `test/tracking/track_frame.test.ts` and
`test/tracker_state_machine.test.ts`. Those files were split, so their hashes
have no successor here: what they held as ground truth is in the two modules,
and what they held as unit tests stays in them.

**Two comments in the moved fixtures name the old paths, and are left as they
are**, because the five fixtures moved byte for byte so that their hashes stay
equal to M4's, and that equality is the proof that the move changed nothing a
measurement reads:

- `fixtures/make-fixtures.mjs`, line 45, gives its usage as
  `node packages/nft-tracker/test/fixtures/make-fixtures.mjs`. It is now
  `node packages/nft-tracker/ground-truth/fixtures/make-fixtures.mjs`.
- `fixtures/tracking_target.ts`, lines 62 to 65, names
  `tracker_state_machine.test.ts` and `tracking/track_frame.test.ts` as where
  the blocks that decode `examples/targets/pinball.wnft` pin the shipped
  target on ground truth. Those blocks are now `tracker_sequences.ts` and
  `tracking/track_frame_sweep.ts`; their assertions stay in the two test
  files.

The comments moved into the two modules are kept as written too: where one says
"this file", "here", "above" or "the fixture tests", it means the test file it
came from.

## Rerunning #160's and #186's probes

The scripts behind the #160 and #186 records
(`docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.mjs`,
`docs/benchmarks/2026-10-28-92-stage1-weighing.mjs`) hash the seven files at
their old paths in `test/`, and import three of them from there. On a tree
after #130 they stop at their first check, before printing anything:
`test/tracking/track_frame.test.ts` still exists, split, so it fails with
`fatal: packages/nft-tracker/test/tracking/track_frame.test.ts: sha256 …, not
the record's cc6c70bc…`. That is expected: they are records of a commit, and
are not edited.

**After #188 (2026-11-02), the same holds for every dated record that reads
`seeded_rng.ts`.** None is edited, and each stays re-runnable at its own
commit:

- **#104's and #92's scripts**, the two above, hash `seeded_rng.ts` at its
  old `test/fixtures/` path. They already stop at the tip, since #130.
- **#106's two scripts** read it at its path here.
  `2026-10-29-106-stage3-check.mjs` takes `withSeededRandom` from it, which
  no longer exists, so it stops at the tip.
  `2026-10-29-106-stage1-pose-filter-probe.mjs` prints the file's hash and
  checks nothing against it. It already stopped before #188, at
  `FATAL: the joint grid's poses on the original sequences changed from
3b275a1: 1d2763c4…`, and stops at the same line, with the same hash, after
  it (run on both, 2026-11-02).
- **#202's three scripts** (`2026-11-01-202-stage1-probe.mjs`,
  `2026-11-01-202-stage3-check.mjs` and `2026-11-01-202-stage3-c0.mjs`)
  load `tracker_sequences.ts`, which imports it. Its exports, and `run`'s
  signature and result, are unchanged, and none of the three pins a hash of a
  ground-truth file, so by reading they still run at the tip and print the new
  hashes. They were not run for #188.

To rerun one, read a checkout of a commit before #130, such as `805f1f5`:

```bash
git worktree add --detach ../webarkit-805f1f5 805f1f5
cd ../webarkit-805f1f5 && npm ci && npm run build
node --experimental-transform-types docs/benchmarks/2026-10-21-104-stage1-threshold-derivation.mjs
```

A copy of a script outside the repository reads the checkout that
`WEBARKIT_ROOT` names, as each script says beside its `ROOT`:
`WEBARKIT_ROOT=../webarkit-805f1f5 node --experimental-transform-types <copy>`.

## Not here

- **`seeded_rng.ts` was not retired by #130's move.** It replaced
  `Math.random` globally, a workaround #24's injectable RNG made unnecessary,
  and its retirement was left for later in
  [#24](https://github.com/webarkit/webarkit/issues/24)'s comment of
  2026-10-24, which says `seeded_rng.ts` "stays until #92 and #130".
  [#188](https://github.com/webarkit/webarkit/issues/188) retired the global
  swap on 2026-11-02 (above). Outside this directory the global is still
  replaced in seven files, five of which seed it:
    - `cv-backend-jsfeatnext`'s `test/ransac_rng.test.ts` seeds it on
      purpose: its hash measures the backend with no `rng`, the evidence
      that an absent `rng` keeps the backend's behaviour (#24).
    - `bin/compile-target.mjs` seeds it during a compile to enforce zero
      draws (#137's item 4); it calls no `estimateHomography`.
    - `scripts/jitter-dry-run.mjs`, `scripts/replay-clips.mjs`'s `--seed`
      and `examples/test/detection-worker-core.test.mjs` (two helpers) seed it for the
      tracker or the bench page, and belong with
      [#151](https://github.com/webarkit/webarkit/issues/151), which moves the
      replay and the bench page to an injected generator.
    - `test/pose/ippe.test.ts` and `test/pose/s2_oracle_hash.test.ts` only
      count reads, passing each to the real `Math.random`.
      #151, the per-frame seeding policy, is related work on the same RNG and
      does not name this file.
- **The build does not see this directory.** `tsconfig.json` compiles `src/`
  alone; `tsconfig.test.json` includes `ground-truth/` for the typecheck.
- **Prettier sees the two modules, not `fixtures/`.** `npm run format:check`
  covers `ground-truth/**/*.ts`, but `.prettierignore`'s `fixtures/` keeps any
  directory of that name out, as it did under `test/`, so the fixtures stay
  byte-exact and the format hook cannot rewrite a frozen input.
