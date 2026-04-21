## 1. Specification

- [x] 1.1 Finalize proposal scope and acceptance criteria for `improve-gx-doctor-output-and-speed`.
- [x] 1.2 Define normative requirements in `specs/doctor-workflow/spec.md`.

## 2. Implementation

- [x] 2.1 Make recursive `gx doctor` show visible per-target progress instead of buffering nested output until each repo finishes.
- [x] 2.2 Respect doctor `--no-wait-for-merge` inside the auto-finish sweep and keep the default sweep output compact.
- [x] 2.3 Add focused install-test coverage for progress lines, no-wait forwarding, and compact-versus-verbose auto-finish rendering.

## 3. Verification

- [x] 3.1 Run focused doctor/install verification (`node --test --test-name-pattern "doctor" test/install.test.js`, `node --check bin/multiagent-safety.js`).
- [x] 3.2 Run `openspec validate agent-codex-improve-gx-doctor-output-and-speed-2026-04-21-14-15 --type change --strict`.
- [x] 3.3 Run `openspec validate --specs`.

Verification note: `node --check bin/multiagent-safety.js` passed. `node --test --test-name-pattern "doctor" test/install.test.js` passed with 17 doctor-focused tests, including the new no-wait forwarding and compact-versus-verbose output regressions. `openspec validate agent-codex-improve-gx-doctor-output-and-speed-2026-04-21-14-15 --type change --strict` passed, and `openspec validate --specs` returned `No items found to validate.`

## 4. Completion

- [x] 4.1 Finish the agent branch via PR merge + cleanup (`gx finish --via-pr --wait-for-merge --cleanup` or `bash scripts/agent-branch-finish.sh --branch <agent-branch> --base <base-branch> --via-pr --wait-for-merge --cleanup`).
- [x] 4.2 Record PR URL + final `MERGED` state in the completion handoff.
- [x] 4.3 Confirm sandbox cleanup (`git worktree list`, `git branch -a`) or capture a `BLOCKED:` handoff if merge/cleanup is pending.

Completion evidence:
- PR: `#230` <https://github.com/recodeee/gitguardex/pull/230>
- Final state: `MERGED` into `main` at `2026-04-21T12:34:20Z`
- Merge/cleanup path: `bash scripts/agent-branch-finish.sh --branch "agent/codex/improve-gx-doctor-output-and-speed-2026-04-21-14-15" --base main --via-pr --wait-for-merge --cleanup`
- Cleanup confirmation: sandbox worktree `/home/deadpool/Documents/recodee/gitguardex/.omx/agent-worktrees/agent__codex__improve-gx-doctor-output-and-speed-2026-04-21-14-15` is gone; `git branch -a | rg "improve-gx-doctor-output-and-speed|main$|origin/main"` shows only `main` and `origin/main`
- Follow-up note: prune preserved one unrelated dirty merged worktree (`agent/codex/fix-codex-agent-autofinish-and-nested-gi-2026-04-21-13-28`) while cleaning the doctor-improvement branch, which is expected under the current cleanup policy
