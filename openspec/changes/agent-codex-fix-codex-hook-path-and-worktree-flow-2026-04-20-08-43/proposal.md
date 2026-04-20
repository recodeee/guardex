## Why

- Codex sessions in this repo were failing on `UserPromptSubmit` because settings still referenced
  `/.agents/hooks/*.py`, but those files now live under `/.codex/hooks` and `/.claude/hooks`.
- When the activation/guard hooks fail to start, the intended guardrail flow (`agent worktree -> edit -> PR -> cleanup`) is not consistently enforced.

## What Changes

- Update `.codex/settings.json` hook commands to target `/.codex/hooks/*`.
- Update `.claude/settings.json` hook commands to target `/.claude/hooks/*`.
- Add regression coverage in `test/install.test.js` to fail fast if stale `/.agents/hooks/` references reappear.

## Impact

- Affected surfaces:
  - Codex session hooks (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`)
  - Claude session hooks (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`)
- Risk is low because behavior changes are configuration-path fixes plus test coverage.
- Result: hook execution returns to normal, restoring branch/worktree guard enforcement during sessions.
