## Why

- Recodee exposed a Guardex hook gap: after `Write` was blocked on protected `dev`, Claude could attempt the same file write through an allowlisted Bash command such as `cat > file`. Guardex should classify shell redirection before treating commands like `cat`, `printf`, or `echo` as read-only.

## What Changes

- Add shell output-redirection detection to the managed `.codex`, `.claude`, and `.agents` `skill_guard.py` hooks.
- Preserve safe diagnostic redirection such as `2>&1` and `2>/dev/null`.
- Add setup-level regression coverage that imports each managed hook copy and proves the bypass is blocked.

## Impact

- Affects only PreToolUse Bash classification in managed hook copies.
- Legitimate file-writing Bash commands on protected branches now block and must use `gx pivot` / an agent worktree.
