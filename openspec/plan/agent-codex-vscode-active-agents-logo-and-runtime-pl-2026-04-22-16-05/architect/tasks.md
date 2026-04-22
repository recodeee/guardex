# architect tasks

## 1. Spec

- [x] 1.1 Keep `vscode/guardex-active-agents/` and `templates/vscode/guardex-active-agents/` mirrored for this lane; do not widen scope into source-tree canonicalization.
- [x] 1.2 Lock the packaged-icon strategy to a committed `icon.png` inside each extension tree, derived from the existing repo `logo.png`.

## 2. Tests

- [x] 2.1 Define compatibility checks for VS Code manifest `icon` metadata, installer payload copying, and mirrored-source parity.
- [x] 2.2 Validate that the runtime follow-up preserves grouped `ACTIVE AGENTS` / `CHANGES`, lock-aware rows, and `AGENT.lock` fallback behavior by leaving `extension.js` and `session-schema.js` untouched.

## 3. Implementation

- [x] 3.1 Compare the viable options: in-place patch, source-tree canonicalization, or installer-time asset injection.
- [x] 3.2 Record the chosen architecture and guardrails in `planner/plan.md`.
- [x] 3.3 Publish architecture sign-off notes through the phase board and implementation notes.

## 4. Checkpoints

- [x] [A1] READY - Architecture review checkpoint

### A1 Acceptance Criteria

- [x] The icon strategy is fixed to a bundled asset inside the installable extension payload.
- [x] The lane keeps `vscode/` and `templates/` mirrored instead of widening into source-tree canonicalization.
- [x] Runtime/provider behavior remains unchanged unless the audit proved a missing delta.

### A1 Verification Evidence

- [x] `planner/plan.md` ADR documents the preferred in-place patch and rejected alternatives.
- [x] `phases.md` marks the architecture phase complete with the bundled-icon decision.
- [x] `checkpoints.md` records the architecture checkpoint in the root chronology.

## 5. Collaboration

- [x] 5.1 Owner recorded this lane before edits in the root checkpoint log.
- [x] 5.2 N/A - solo lane.

## 6. Cleanup

- [x] 6.1 Finalization already completed on `agent/codex/vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17` via `gx branch finish --base main --via-pr --wait-for-merge --cleanup`.
- [x] 6.2 Recorded merge evidence: `PR #322` is `MERGED` (`https://github.com/recodeee/gitguardex/pull/322`, merged at `2026-04-22T14:31:31Z`).
- [x] 6.3 Confirmed cleanup evidence: current `git worktree list --porcelain` and `git branch -a` output no longer shows the original implementation worktree or surviving refs.
