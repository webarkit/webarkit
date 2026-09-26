# CLAUDE.md

The canonical, tool-agnostic guidance for this repo lives in **AGENTS.md**. It is imported below — treat it as the source of truth.

@AGENTS.md

## Claude-specific notes

- **A hook reformats code you edit.** `.claude/settings.json` runs
  `.claude/hooks/format-on-edit.mjs` after every Edit/Write: `rustfmt` on a
  `.rs` under `crates/`, prettier on TypeScript and `.mjs`. So a file may come
  back on disk differently from what you wrote. Both produce exactly what CI
  demands (`cargo fmt --all --check`, `npm run format:check`), so hook and CI
  cannot disagree, and it never fails a tool call: unparseable mid-edit source,
  a missing Rust toolchain and a repository before `npm install` are all silent
  no-ops. Prettier’s half asks prettier itself whether a path is in scope, so
  `.prettierignore` governs the hook as it governs `npm run format`. Personal
  hooks belong in `.claude/settings.local.json`, which is gitignored.
- On this Windows machine, prefer the Bash tool's POSIX shell for git/npm commands in this repo; PowerShell works too but the commands used in commit messages and this repo's own docs assume bash-style quoting.
- **Never round-trip a source file through PowerShell** (`Get-Content -Raw` then `Set-Content`). It reads as the system ANSI codepage and writes UTF-8, so every non-ASCII character is double-encoded -- a section sign becomes the two code points U+00C2 U+00A7, an em dash becomes three -- and a BOM is prepended. Source here is full of `§` section references, so the damage is silent and wide. Edit files with the Edit/Write tools or a POSIX tool; use PowerShell to *run* things, not to rewrite them.
- `npm run build` before `npm test` when in doubt: `cv-backend-jsfeatnext`'s tests import from its own `src/`, but its typecheck step (`npm run typecheck`) needs `cv-backend-spec`'s built `dist/` to resolve — a stale or missing sibling build is a common source of confusing type errors that look like real bugs.
- Root README, and both package READMEs, get read by humans deciding whether to adopt this contract — keep them in sync with reality when behavior changes (see how `cv-backend-jsfeatnext/README.md`'s `estimateHomography` section and version requirement had to be corrected after #11/#12 landed).
- Don't invent ecosystem facts about sibling repos (WebARKitLib-rs, PureCV, jsartoolkitNFT) from memory — check the actual repo (`gh repo view`, `gh api repos/webarkit/<repo>/readme`) before describing its status, since these move fast and this org iterates on plans across repos.
