<!-- multiagent-safety:START -->
## Multi-Agent Execution Contract (GX)

0. Session plan comment + read gate (required)

- Before editing, each agent must post a short session comment/handoff note that includes:
  - plan/change name (or checkpoint id),
  - owned files/scope,
  - intended action.
- Before deleting/replacing code, each agent must read the latest session comments/handoffs first and confirm the target code is in their owned scope.
- If ownership is unclear or overlaps, stop that edit, post a blocker comment, and let the leader/integrator reassign scope.
- For git isolation, each agent must start on a dedicated branch via `scripts/agent-branch-start.sh "<task-or-plan>" "<agent-name>"`.
- In-place branch mode is disallowed: never switch the active local/base checkout to an agent branch.
- Primary-checkout immutability: agents MUST NOT run `git checkout <branch>` on any repo's primary working tree, including nested repos inside the parent workspace (e.g. tool repos nested under the product repo). Keep each repo's primary checkout on its base/protected branch; use `git worktree add` for feature work. The `.githooks/post-checkout` hook auto-reverts primary-checkout branch switches when an agent session is detected; bypass only with `GUARDEX_ALLOW_PRIMARY_BRANCH_SWITCH=1` when truly intentional.
- Treat the base branch (`main` or the user's current local base branch) as read-only while the agent branch is active.
- Agent completion defaults to `scripts/codex-agent.sh`, which auto-finishes the branch (auto-commit changed files, push/create PR, attempt merge, and pull the local base branch after merge).
- OMX completion policy: when a task is done, the agent must commit the task changes, push the agent branch, and create/update a PR for those changes (via `codex-agent` or `agent-branch-finish`).
- Auto-finish now waits for required checks/merge and then cleans merged sandbox branch/worktree by default.
- Use `--no-cleanup` only when you explicitly need to keep a merged sandbox for audit/debug follow-up.
- If codex-agent auto-finish cannot complete, immediately run `scripts/agent-branch-finish.sh --branch "<agent-branch>" --base dev --via-pr --wait-for-merge` and keep the branch open until checks/review pass.
- If merge/rebase conflicts block auto-finish, run a conflict-resolution review pass in that sandbox branch, then rerun `agent-branch-finish.sh --base dev --via-pr --wait-for-merge` until merged.
- Completion is not valid until these are true: commit exists on the agent branch, branch is pushed to `origin`, and PR/merge status is produced by `agent-branch-finish.sh` or `codex-agent`.
- For every new task, including follow-up work in the same chat/session, if an assigned agent sub-branch/worktree is already open, continue in that sub-branch; otherwise create a fresh one from the current local base snapshot with `scripts/agent-branch-start.sh`.
- Never implement directly on the local/base branch checkout; keep it unchanged and perform all edits in the agent sub-branch/worktree.
- If the change publishes or bumps a version, the same change must also update release notes/changelog entries.

1. Explicit ownership before edits

- Assign each agent clear file/module ownership.
- Do not edit files outside your assigned scope unless the leader reassigns ownership.

2. Preserve parallel safety

- Assume other agents are editing nearby code concurrently.
- Never revert unrelated changes authored by others.
- If another change conflicts with your approach, adapt and report the conflict in handoff.

3. Verify before completion

- Run required local checks for the area you changed.
- Do not mark work complete without command output evidence.

4. Required handoff format (every agent)

- Files changed
- Behavior touched
- Verification commands + results
- Risks / follow-ups

## OpenSpec Workspaces (required for agent sub-branch changes)

OMX Codex execution flows must use OpenSpec. `scripts/codex-agent.sh` bootstraps
per-branch OpenSpec workspaces automatically:

```text
openspec/changes/<agent-branch-slug>/
openspec/plan/<agent-branch-slug>/
```

For manual `scripts/agent-branch-start.sh` usage, enable auto-bootstrap with
`GUARDEX_OPENSPEC_AUTO_INIT=true` or scaffold manually before implementation:

```bash
bash scripts/openspec/init-change-workspace.sh "<change-slug>" "<capability-slug>"
bash scripts/openspec/init-plan-workspace.sh "<plan-slug>"
```

Expected change shape:

```text
openspec/changes/<change-slug>/
  .openspec.yaml
  proposal.md
  tasks.md
  specs/<capability-slug>/spec.md
```

Expected plan shape:

```text
openspec/plan/<plan-slug>/
  summary.md
  checkpoints.md
  planner/plan.md
  planner/tasks.md
  architect/tasks.md
  critic/tasks.md
  executor/tasks.md
  writer/tasks.md
  verifier/tasks.md
```
<!-- multiagent-safety:END -->
