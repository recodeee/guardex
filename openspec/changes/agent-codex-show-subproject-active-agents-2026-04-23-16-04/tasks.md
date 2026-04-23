## Definition of Done

This change is complete only when **all** of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks (test failure, conflict, ambiguous result), append a `BLOCKED:` line under section 4 explaining the blocker and **STOP**. Do not tick remaining cleanup boxes; do not silently skip the cleanup pipeline.

## Handoff

- Handoff: change=`agent-codex-show-subproject-active-agents-2026-04-23-16-04`; branch=`agent/codex/show-subproject-active-agents-2026-04-23-16-04`; scope=`VS Code Active Agents nested subproject discovery, labels, watchers, template parity, and focused regression`; action=`show nested gitguardex-style managed worktrees at top level as workspace -> subproject, verify, then finish via PR merge cleanup`.
- Completion: PR=`https://github.com/recodeee/gitguardex/pull/378`; state=`MERGED`; merge_commit=`4b070696b1ca39a5d30d826b7224ef982c66eb51`; cleanup_evidence=`source worktree absent from git worktree list; local and remote source refs absent after git fetch --prune origin`.

## 1. Specification

- [x] 1.1 Define nested subproject discovery and labeling requirements.
- [x] 1.2 Keep completion and cleanup evidence requirements explicit.

## 2. Implementation

- [x] 2.1 Discover plain managed-worktree repos from `.omx/.omc/agent-worktrees/*/.git`.
- [x] 2.2 Keep workspace roots in the candidate scan while filtering nested managed-worktree copies.
- [x] 2.3 Render nested repo labels as `workspace -> subproject`.
- [x] 2.4 Add a managed-worktree `.git` watcher for refresh.
- [x] 2.5 Mirror extension changes in `templates/vscode/guardex-active-agents/extension.js`.
- [x] 2.6 Bump live/template Active Agents manifests for extension install refresh.

## 3. Verification

- [x] 3.1 Run `node --test test/vscode-active-agents-session-state.test.js`.
- [x] 3.2 Run `openspec validate agent-codex-show-subproject-active-agents-2026-04-23-16-04 --type change --strict`.
- [x] 3.3 Run `openspec validate --specs`.
- [x] 3.4 Run `npm test`.

## 4. Cleanup (mandatory; run before claiming completion)

- [x] 4.1 Run `gx branch finish --branch agent/codex/show-subproject-active-agents-2026-04-23-16-04 --base main --via-pr --wait-for-merge --cleanup`.
- [x] 4.2 Record the PR URL and final merge state (`MERGED`) in the completion handoff.
- [x] 4.3 Confirm the sandbox worktree is gone (`git worktree list` no longer shows the agent path; `git branch -a` shows no surviving local/remote refs for the branch).
