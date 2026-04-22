## Definition of Done

This change is complete only when **all** of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks (test failure, conflict, ambiguous result), append a `BLOCKED:` line under section 4 explaining the blocker and **STOP**. Do not tick remaining cleanup boxes; do not silently skip the cleanup pipeline.

Handoff: 2026-04-22 09:05Z codex owns `templates/vscode/guardex-active-agents/*`, `test/vscode-active-agents-session-state.test.js`, `README.md`, and this change workspace to make actively working Guardex lanes easier to spot in VS Code.

## 1. Specification

- [x] 1.1 Finalize proposal scope and acceptance criteria for `agent-codex-vscode-working-agents-groups-2026-04-22-09-05`.
- [x] 1.2 Define normative requirements in `specs/vscode-working-agents-groups/spec.md`.

## 2. Implementation

- [x] 2.1 Split the `ACTIVE AGENTS` section into visible `WORKING NOW` and `THINKING` groups, preserving live session rows.
- [x] 2.2 Surface working counts in the repo row / view badge summary and add a distinct icon for working lanes.
- [x] 2.3 Update README guidance and focused regression tests for the new grouping behavior.

## 3. Verification

- [x] 3.1 Run `node --test test/vscode-active-agents-session-state.test.js`.
- [x] 3.2 Run `openspec validate agent-codex-vscode-working-agents-groups-2026-04-22-09-05 --type change --strict`.
- [x] 3.3 Run `openspec validate --specs`.

## 4. Cleanup

- [ ] 4.1 Run the cleanup pipeline: `bash scripts/agent-branch-finish.sh --branch agent/codex/vscode-working-agents-groups-2026-04-22-09-05 --base main --via-pr --wait-for-merge --cleanup`.
- [ ] 4.2 Record the PR URL and final merge state (`MERGED`) in the completion handoff.
- [ ] 4.3 Confirm the sandbox worktree is gone (`git worktree list` no longer shows the agent path; `git branch -a` shows no surviving local/remote refs for the branch).
