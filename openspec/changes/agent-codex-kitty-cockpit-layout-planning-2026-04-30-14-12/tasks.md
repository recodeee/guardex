## Definition of Done

This change is complete only when all of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks, append a `BLOCKED:` line under section 4 explaining the blocker and stop.

## 1. Specification

- [x] 1.1 Capture Kitty cockpit planner behavior.
- [x] 1.2 Define normative requirements in `specs/cockpit-kitty-layout/spec.md`.

## 2. Implementation

- [x] 2.1 Add a pure Kitty cockpit layout planner.
- [x] 2.2 Emit deterministic command steps for control, agent area, agent terminals, and focus.
- [x] 2.3 Keep worktree and lock creation outside the planner.
- [x] 2.4 Add focused regression coverage.

## 3. Verification

- [x] 3.1 Run focused Node tests for Kitty cockpit layout and tmux cockpit compatibility.
  - Evidence: `node --test test/cockpit-kitty-layout.test.js test/cockpit-layout.test.js test/tmux-session.test.js test/cockpit-terminal-backend.test.js` passed 20/20.
- [x] 3.2 Run `openspec validate agent-codex-kitty-cockpit-layout-planning-2026-04-30-14-12 --type change --strict`.
  - Evidence: command passed.
- [x] 3.3 Run `openspec validate --specs`.
  - Evidence: command passed with `No items found to validate.`

## 4. Cleanup

- [x] 4.1 Run `gx branch finish --branch agent/codex/kitty-cockpit-layout-planning-2026-04-30-14-12 --base main --via-pr --wait-for-merge --cleanup`.
  - Evidence: PR https://github.com/recodeee/gitguardex/pull/503 reached `MERGED` at 2026-04-30T12:22:16Z.
- [x] 4.2 Record PR URL and final merge state.
  - Evidence: `gh pr list --state all --head agent/codex/kitty-cockpit-layout-planning-2026-04-30-14-12 --json number,url,state,mergedAt,headRefName,baseRefName,title` returned PR #503 `MERGED`.
- [x] 4.3 Confirm sandbox worktree cleanup.
  - Evidence: `git worktree list` no longer shows `.omx/agent-worktrees/gitguardex__codex__kitty-cockpit-layout-planning-2026-04-30-14-12`; `git branch --list "agent/codex/kitty-cockpit-layout-planning-2026-04-30-14-12"` returned no local branch.
