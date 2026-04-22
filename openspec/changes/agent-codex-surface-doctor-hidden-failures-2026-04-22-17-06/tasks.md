## 1. Specification

- [x] 1.1 Finalize proposal scope and acceptance criteria for `surface-doctor-hidden-failures`.
- [x] 1.2 Define normative requirements in `specs/doctor-workflow/spec.md`.

## 2. Implementation

- [x] 2.1 Reorder compact doctor auto-finish details so failures surface before skipped rows when output truncates.
- [x] 2.2 Include hidden compact-result status counts so truncated failures stay explicit even when not all failed rows fit.
- [x] 2.3 Add focused output-level regression coverage for compact doctor rendering.

## 3. Verification

- [x] 3.1 Run focused verification (`node --test test/output.test.js`, `node --check src/output/index.js`).
- [x] 3.2 Run `openspec validate agent-codex-surface-doctor-hidden-failures-2026-04-22-17-06 --type change --strict`.
- [x] 3.3 Run `openspec validate --specs`.

## 4. Completion

- [ ] 4.1 Finish the agent branch via PR merge + cleanup (`gx finish --via-pr --wait-for-merge --cleanup` or `bash scripts/agent-branch-finish.sh --branch <agent-branch> --base <base-branch> --via-pr --wait-for-merge --cleanup`).
- [ ] 4.2 Record PR URL + final `MERGED` state in the completion handoff.
- [ ] 4.3 Confirm sandbox cleanup (`git worktree list`, `git branch -a`) or capture a `BLOCKED:` handoff if merge/cleanup is pending.
