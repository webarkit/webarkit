# Contributing to webarkit

Thank you for your interest in contributing to `webarkit`! By following these guidelines, you help keep the project clean, organized, and easy to maintain.

## Pull Request Workflow

To contribute to the project, please follow these steps:

1. **Sync with the `dev` branch**: Ensure your local copy is up to date before starting new work.
   ```powershell
   git checkout dev
   git pull origin dev
   ```
2. **Create a new branch**: Create a descriptive branch starting from `dev`.
   ```powershell
   git checkout -b your-branch-name
   ```
3. **Develop and Test**: Make your changes and ensure they pass all tests (see the [Testing](#testing) section).
4. **Submit the Pull Request**: Open a PR against the `dev` branch of the main repository.

> **Important**: All PRs must be made against the `dev` branch. The `master` branch is reserved exclusively for stable releases.

## Releasing

Releases are cut by @kalwalt, from `dev` into `master`: the release pull request is the one pull request that targets `master`. Steps 1 and 3–4 are what the `v0.2.0` and `v0.3.0` releases did, with the gates CI runs today. Steps 2, 5 and 6 are new with ADR-0002 and [#72](https://github.com/webarkit/webarkit/issues/72).

1. **Check that `dev` is green**: CI's gates must pass on `dev` before the release is opened. To run them locally:
   ```powershell
   npm install
   npm run build
   npm run typecheck
   npm run format:check
   npm run check:contract
   npm test
   cargo test --workspace
   cargo fmt --all --check
   cargo clippy --workspace --all-targets -- -D warnings
   rustup target add thumbv7em-none-eabihf   # once
   cargo build -p wnft-format --no-default-features --target thumbv7em-none-eabihf
   ```
2. **Close the changelog entry**: In [`CHANGELOG.md`](CHANGELOG.md), rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add its compare link at the foot of the file, and open a fresh, empty `## [Unreleased]` above it. The section should already be complete: every pull request that changed behaviour added its own line to `[Unreleased]` when it landed (see [Commit Message Conventions](#commit-message-conventions)), so this step edits a heading, not a history.
3. **Open the release pull request**:
   * It goes from `dev` into `master`.
   * It is titled `chore(release): vX.Y.Z — <milestone>`, for example [`chore(release): v0.3.0 — M2 complete`](https://github.com/webarkit/webarkit/pull/74). `release` is the one scope that names no part of the repository.
   * Its body is the release notes, and the release notes **are** that version's changelog entry: paste the section from step 2, whole. The changelog is the source, because it is reviewed line by line as each change lands, and the pull request body is a copy of it; nothing is written twice, and the two cannot drift.
   * It is merged with a merge commit.
4. **Tag the merge commit**: After the merge, @kalwalt puts an annotated tag on the **merge commit**, not on the tip of `dev`. The tag's message repeats the pull request's title without `chore(release): `. `v0.2.0` and `v0.3.0` are both annotated tags on the merge commits of [#45](https://github.com/webarkit/webarkit/pull/45) and [#74](https://github.com/webarkit/webarkit/pull/74).
   ```powershell
   git tag -a vX.Y.Z -m "vX.Y.Z — <milestone>" merge-commit-sha
   git push origin vX.Y.Z
   ```
5. **Create the GitHub Release**: On that tag, in the web interface, @kalwalt creates a GitHub Release titled like the tag's message, with the same notes as the pull request's body. `v0.1.0`, `v0.2.0` and `v0.3.0` get theirs retroactively, from their entries in `CHANGELOG.md`.
6. **Versions**: The package versions match the release tag; [ADR-0002](docs/adr/0002-lockstep-versioning.md) records why. Every manifest, the exact pins between the packages and both lockfiles are raised on `dev` before the release pull request is opened, and `npm run check:contract` fails when any of them disagrees. Nothing checks them against the tag itself.

What the project does **not** do today:
* It publishes nothing to npm or crates.io.
* It generates nothing: the changelog, the release notes and the GitHub Release are written by hand, from the same text.

### Release gates

Before the annotated tag, all of these hold and the release PR says so:

1. `dev` green on build, typecheck, `check:contract`, `format:check` and the full test suite.
   (`npm run lint` is not a gate: no workspace defines a `lint` script, so it runs nothing.)
2. The CHANGELOG's `[Unreleased]` section closed into the version being released.
3. Every package and crate at the release version. `check:contract`
   ([#79](https://github.com/webarkit/webarkit/pull/79)) enforces that they all carry one version;
   nothing checks that it is the version being released (the **Versions** step of the procedure
   above), so that half is this gate's — named here so the gate is visible and not only mechanical.
4. The milestone's open issues examined, not necessarily zero: each is closed, or moved to another
   milestone with its reason recorded in the issue. A milestone may ship with work deferred; it may
   not ship with work unexamined.
5. If the release ships a new `.wnft` format minor, its fixture corpus is frozen under
   `fixtures/nft-target/<version>/` in the release PR
   ([format spec §8.3](docs/specs/nft-target-format.md#83-evolution-tests),
   [ADR-0002](docs/adr/0002-lockstep-versioning.md)). If the format version is unchanged, the
   release PR states that instead.
6. Releasing closes the milestone, and the release notes say what the milestone did **not** deliver.

## Amending the cv-backend-spec contract

`@webarkit/cv-backend-spec` has a second owner (@ThorstenBux). An amendment is opened as an issue or
a PR that names the change and a decision date.

- **Additive** changes — a new optional method, a new capability flag, a new declared field — are
  adopted if no objection is raised by that date, with the decision and the wait recorded in the
  issue.
- **Breaking** changes — a changed signature or changed semantics of an existing method — need
  explicit consent, whatever the date.

Either way the outcome is written in the issue, so a later reader sees that the other owner had the
chance to object.

The decision date is **fourteen days** from the amendment being opened unless it states another,
and a shorter one is said out loud with its reason.

An objection that arrives after an additive change was adopted on silence is handled as a new
amendment, not as a reversal — unless nothing has been built on it yet, in which case it is simply
withdrawn.

## Testing

Before submitting a commit or a Pull Request, it is essential to verify that the code works correctly and adheres to the project's quality standards.

This is an npm-workspaces monorepo — run these from the repo root; they cover both `@webarkit/cv-backend-spec` and `@webarkit/cv-backend-jsfeatnext`:

* **Install dependencies** (first time, or after pulling changes to `package-lock.json`):
  ```powershell
  npm install
  ```
* **Build** (also verifies the packages compile against each other):
  ```powershell
  npm run build
  ```
* **Type check** (`src/` and `test/` in every workspace):
  ```powershell
  npm run typecheck
  ```
* **Run tests**:
  ```powershell
  npm test
  ```

These are exactly the checks CI runs on every push and pull request (see `.github/workflows/CI.yml`). If you add a new feature, make sure to include appropriate tests in the relevant package's `test/` directory (Vitest, e.g. `packages/cv-backend-jsfeatnext/test/*.test.ts`).

## Commit Message Conventions

This project strictly adheres to the [Conventional Commits](https://www.conventionalcommits.org/) specification, enforced by review. It buys a history that reads at a glance — what kind of change, to which part of the repository — and release notes that are easy to write from it. Nothing is generated from the messages: there is no release, changelog or publish automation, and the changelog is written by hand.

**Where changelog entries come from.** A pull request that changes observable behaviour — a new option, a changed result, a format change, a fix a user could notice — adds its own line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), in the same pull request, written for someone who wants to know what changed for them rather than as the commit subject repeated. That rule is what keeps the file honest: without it the changelog becomes something someone reconstructs at release time. Documentation, test and tooling changes that a user of the packages would not notice add no line.

Please ensure your PR titles and commit messages follow this format:

`<type>(<optional scope>): <description>`

### 1. Allowed Types
* **`feat`**: A new feature.
* **`fix`**: A bug fix.
* **`docs`**: Documentation-only changes.
* **`refactor`**: A code change that neither fixes a bug nor adds a feature (e.g., restructuring).
* **`test`**: Adding missing tests or correcting existing ones.
* **`chore`**: Changes to the build process, dependencies, or auxiliary tools.
* **`ci`**: Changes to CI configuration or workflows.

### 2. Project-Specific Scopes
To help categorize changes, use one of the following scopes when a change is confined to one part of the repo:
* **`cv-backend-spec`**: The `CvBackend` contract package — interfaces, types, capability negotiation.
* **`cv-backend-jsfeatnext`**: The jsfeatNext implementation of that contract.
* **`examples`**: The demo pages exercising the contract.
* **`ci`**: The GitHub Actions workflow.

Omit the scope for changes spanning the whole repo (root README, `AGENTS.md`, root `package.json`, etc.).

### 3. Examples
* `feat(cv-backend-jsfeatnext): add descriptor selection support`
* `fix(cv-backend-spec): correct capability negotiation for filterMatches`
* `docs: update README with ecosystem overview`
* `chore(ci): add CI workflow`

If your PR introduces a breaking change, please include `BREAKING CHANGE:` in the footer or append a `!` after the type/scope (e.g., `feat(cv-backend-spec)!: change the estimateHomography return shape`).

## Creating Issues

Before creating a new issue, please search the [existing issues](https://github.com/webarkit/webarkit/issues) to see if it has already been reported.

When creating an issue, please provide as much information as possible:
* **For Bug Reports**: Include a clear description of the bug, steps to reproduce it, the expected behavior, and any relevant error messages or logs.
* **For Feature Requests**: Explain the purpose of the feature, why it is needed, and how it should work.

## Reporting Bugs and Feature Requests

If you encounter a bug or have an idea for a new feature, we invite you to open an [Issue](https://github.com/webarkit/webarkit/issues). Please be as detailed as possible in the description to help us resolve the issue quickly.

## Code of Conduct

We adopt the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) to promote an inclusive and respectful environment for all contributors.
