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

To maintain a clean and automated release history, this project strictly adheres to the [Conventional Commits](https://www.conventionalcommits.org/) specification.

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
