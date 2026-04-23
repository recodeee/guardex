## Why

The VS Code Active Agents panel already exposes working-state groups, lock state, inspect actions, and session-owned changes, but the main tree is still optimized for filesystem grouping instead of operator triage. When several lanes are active at once, the user still has to drill through worktree grouping and raw change trees before they can answer the high-value questions: who is active now, what task each lane owns, what changed recently, what is risky, and which repo drift is unassigned.

## What Changes

- Replace the primary repo view with a task-first operator layout: `Overview`, `Working now`, `Idle / thinking`, `Unassigned changes`, and `Advanced details`.
- Render active sessions as compact task rows that prioritize task title, agent, state, changed-file count, lock count, freshness, recent-change summary, and inline risk markers.
- Move raw worktree/path trees behind a collapsed `Advanced details` section instead of using them as the default scan path.
- Surface repo-level overview counts for working lanes, idle lanes, unassigned changes, locked files, and conflicts.
- Update the focused Active Agents tests and extension manifests for the new layout contract.

## Impact

- Affected surfaces: `vscode/guardex-active-agents/*`, `templates/vscode/guardex-active-agents/*`, `test/vscode-active-agents-session-state.test.js`, and this change workspace.
- No session-file schema or launcher contract changes; the panel still reads the existing Active Agents, lock-registry, and inspect data.
