# dmux-style multi-agent cockpit

GitGuardex cockpit gives one terminal workspace for launching and
inspecting multiple guarded agent lanes. It borrows the practical shape
of a dmux-style control surface, but it is not a dmux clone. GitGuardex
keeps safety as the core and adds orchestration around the existing
branch, worktree, lock, and PR finish model.

## Mental model

Each task gets its own `agent/*` branch and worktree. The cockpit and
`gx agents ...` commands are control surfaces over those lanes:

1. Start a lane with `gx agents start`.
2. Inspect status, changed files, locks, and diffs.
3. Let the agent work inside its sandbox.
4. Finish through the PR-only merge and cleanup flow.

The base checkout stays protected. Agents do not work directly on
`main`, `dev`, or `master`.

## Start the cockpit

```bash
gx cockpit
```

By default this creates or reuses a tmux session named `guardex` in the
repo root and opens a control pane running:

```bash
gx agents status
```

Useful variants:

```bash
gx cockpit --session guardex-dev
gx cockpit --session guardex-dev --attach
gx cockpit --target /path/to/repo
```

`gx cockpit` requires tmux. If tmux is missing, GitGuardex exits with a
clear install-and-retry error instead of falling back to a half-working
session.

## Start agent lanes

Start Codex:

```bash
gx agents start "fix auth tests" \
  --agent codex \
  --base main \
  --claim test/auth.test.js \
  --claim src/auth/session.js
```

Start Claude Code:

```bash
gx agents start "update setup docs" \
  --agent claude \
  --base main \
  --claim README.md \
  --claim docs/agents-cockpit.md
```

Dry-run first when you want to see the branch, worktree, and launch
command without creating anything:

```bash
gx agents start "fix auth tests" --agent codex --base main --dry-run
gx agents start "update setup docs" --agent claude --base main --dry-run
```

Codex lanes use `.omx/agent-worktrees`. Claude lanes use
`.omc/agent-worktrees`. Both produce `agent/<agent>/<task-slug>-<time>`
branches.

## Inspect running work

Show agent service status:

```bash
gx agents status
```

List changed files for one lane:

```bash
gx agents files --branch agent/codex/fix-auth-tests-2026-04-29-21-30
gx agents files --branch agent/codex/fix-auth-tests-2026-04-29-21-30 --json
```

Show one lane's diff against its recorded base branch:

```bash
gx agents diff --branch agent/codex/fix-auth-tests-2026-04-29-21-30
gx agents diff --branch agent/codex/fix-auth-tests-2026-04-29-21-30 --json
```

Show files locked by one lane:

```bash
gx agents locks --branch agent/codex/fix-auth-tests-2026-04-29-21-30
gx agents locks --branch agent/codex/fix-auth-tests-2026-04-29-21-30 --json
```

These inspection commands are lane-scoped. They require `--branch` so a
human or cockpit pane must choose which sandbox to inspect.

## Finish a lane

Finish by branch:

```bash
gx agents finish --branch agent/codex/fix-auth-tests-2026-04-29-21-30 --base main
```

Finish by session id when a session record is available:

```bash
gx agents finish --session session-finish-1 --base main
```

`gx agents finish` delegates to the existing Guardex finish flow for the
selected session branch. The normal finish path commits the sandbox,
pushes the branch, opens or updates a PR, waits for merge when requested
by finish flags, and prunes the worktree.

For a PR-only handoff without waiting for merge:

```bash
gx agents finish \
  --branch agent/codex/fix-auth-tests-2026-04-29-21-30 \
  --no-wait-for-merge \
  --no-cleanup
```

Use that only when the lane must remain open for review. The default
team completion path should still end in merged PR evidence and worktree
cleanup.

## Safety model

GitGuardex orchestration is built on the same safety model as the lower
level branch workflow:

- Isolated worktrees: each task runs in its own filesystem sandbox under
  `.omx/agent-worktrees` or `.omc/agent-worktrees`.
- File locks: `--claim <path>` claims files immediately after branch
  creation, and `gx agents locks --branch <agent/...>` shows ownership.
- Protected base branches: `main`, `dev`, and `master` stay protected by
  hooks; agents work on `agent/*` branches instead.
- PR-only finish: completed agent work flows through PR creation,
  merge-state verification, and cleanup instead of direct base commits.

The cockpit does not weaken these rules. It gives a control pane and
shorter commands for the same guarded lifecycle.

## Common flows

Codex implementation lane:

```bash
gx cockpit --session guardex
gx agents start "implement checkout retry" \
  --agent codex \
  --base main \
  --claim src/checkout/retry.js \
  --claim test/checkout-retry.test.js
gx agents files --branch agent/codex/implement-checkout-retry-2026-04-29-21-30
gx agents diff --branch agent/codex/implement-checkout-retry-2026-04-29-21-30
gx agents finish --branch agent/codex/implement-checkout-retry-2026-04-29-21-30 --base main
```

Claude documentation lane:

```bash
gx cockpit --session guardex-docs --attach
gx agents start "refresh onboarding docs" \
  --agent claude \
  --base main \
  --claim README.md \
  --claim docs/onboarding.md
gx agents files --branch agent/claude/refresh-onboarding-docs-2026-04-29-21-31
gx agents diff --branch agent/claude/refresh-onboarding-docs-2026-04-29-21-31
gx agents finish --branch agent/claude/refresh-onboarding-docs-2026-04-29-21-31 --base main
```

## Migration note

If you have used dmux-style terminal orchestration, treat GitGuardex as
a guarded orchestration layer, not a terminal multiplexer clone. The
cockpit helps you see and drive multiple agents, but the product
boundary remains repo safety: isolated sandboxes, file ownership, base
branch protection, and PR-only completion.
