# GitGuardex Active Agents

Local VS Code companion for Guardex-managed repos.

## Quick Start

Use the dedicated Active Agents sidebar icon to create or inspect Guardex sandboxes quickly.

1. Install from a Guardex-wired repo:

```sh
node scripts/install-vscode-active-agents-extension.js
```

2. Reload the VS Code window.
3. In the Activity Bar, open the `Active Agents` hive icon under Source Control. Use `Start agent` to enter a task + agent name and launch the repo Guardex agent runner. The companion prefers `bash scripts/codex-agent.sh` when present, falls back to `npm run agent:codex --`, and only uses `gx branch start` as a last resort.

What it does:

- Bundles a local GitGuardex icon so repo installs show branded extension metadata inside VS Code.
- Bundles the optional `GitGuardex File Icons` theme for OpenSpec, agent worktree, and hook files in Explorer.
- Adds a dedicated `Active Agents` Activity Bar container with a hive icon and live badge count for active sessions.
- Renders one repo node per live Guardex workspace with grouped `ACTIVE AGENTS` and `CHANGES` sections.
- Splits live sessions inside `ACTIVE AGENTS` into `BLOCKED`, `WORKING NOW`, `THINKING`, `STALLED`, and `DEAD` groups so stuck, active, and inactive lanes stand out immediately.
- Mirrors the same live state in the VS Code status bar so the selected session or active-agent count stays visible outside the tree.
- Shows one row per live Guardex sandbox session inside those activity groups, with changed-file rows nested under sessions that are touching files.
- Labels session rows with provider identity and snapshot context; snapshot-backed rows use a one-letter snapshot badge such as `N` for `nagyviktor@edixa.com`.
- Shows raw agent branch groups with the `git-branch` icon instead of the generic folder icon.
- Shows repo-root git changes in a sibling `CHANGES` section when the guarded repo itself is dirty.
- Derives session state from dirty worktree status, git conflict markers, heartbeat freshness, PID liveness, and recent file mtimes, surfaces working/dead/conflict counts in the repo/header summary, and shows changed-file counts for active edits.
- Uses distinct VS Code codicons for each session state, including animated `loading~spin` for `WORKING NOW`.
- Reads repo-local presence files from `.omx/state/active-sessions/`, expects `lastHeartbeatAt` freshness, and falls back to managed worktree-root `AGENT.lock` telemetry when the launcher session file is absent.
- Publishes `guardex.hasAgents` and `guardex.hasConflicts` context keys for other VS Code contributions.
