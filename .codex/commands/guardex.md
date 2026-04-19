# /guardex

Run a GuardeX check-and-repair workflow for the current repository.

## Steps

1. Run `gx status`.
2. If status is degraded, run `gx doctor`.
3. If still degraded, run `gx scan` and summarize each finding with a fix.
4. If a GitHub bot review is present (`cr-gpt` or `chatgpt-codex-connector`), pull review content and dispatch a focused fix run:
   - One-shot: `bash scripts/gh-pr-review-autofix.sh --pr <number> --bot-regex 'cr-gpt|chatgpt-codex-connector'`
   - Continuous: `bash scripts/gh-pr-review-autofix-watch.sh --pr <number> --interval 45 --bot-regex 'cr-gpt|chatgpt-codex-connector'`
5. Report final verdict as one of:
   - `Repo is guarded`
   - `Repo is not guarded` (include blockers)

## Execution Environment

- Run from repo root.
- Required commands: `gx`, `gh`, `jq`, `bash`.
- Authenticate GitHub CLI first: `gh auth status` (and `gh auth login` if needed).

## Failure Handling

- On command failure, include:
  - failed command,
  - exit status,
  - exact next command to run.
- For degraded status:
  - warnings only -> include scan findings and concrete fixes.
  - any errors -> report `Repo is not guarded` until cleared.

## Style

- Keep output short and operational.
- Include exact commands you executed.
- Prefer concrete next actions over generic advice.
