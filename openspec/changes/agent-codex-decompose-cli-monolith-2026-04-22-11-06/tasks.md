## Definition of Done

This change is complete only when **all** of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks (test failure, conflict, ambiguous result), append a `BLOCKED:` line under section 4 explaining the blocker and **STOP**. Do not tick remaining cleanup boxes; do not silently skip the cleanup pipeline.

## Handoff

- Handoff: change=`agent-codex-decompose-cli-monolith-2026-04-22-11-06`; branch=`agent/codex/decompose-cli-monolith-2026-04-22-11-06`; scope=`bin/multiagent-safety.js`, new `src/**` runtime modules, packaging metadata, and targeted CLI regression tests; action=`decompose the monolithic CLI into seam-owned modules while preserving the command surface`.
- Copy prompt: Continue `agent-codex-decompose-cli-monolith-2026-04-22-11-06` on branch `agent/codex/decompose-cli-monolith-2026-04-22-11-06`. Work inside the existing sandbox, review `openspec/changes/agent-codex-decompose-cli-monolith-2026-04-22-11-06/tasks.md`, continue from the current state instead of creating a new sandbox, and when the work is done run `gx branch finish --branch agent/codex/decompose-cli-monolith-2026-04-22-11-06 --base dev --via-pr --wait-for-merge --cleanup`.

## 1. Specification

- [x] 1.1 Finalize proposal scope and acceptance criteria for `agent-codex-decompose-cli-monolith-2026-04-22-11-06`.
- [x] 1.2 Define normative requirements in `specs/cli-modularization/spec.md`.

## 2. Implementation

- [x] 2.1 Add shared `src/context.js` / `src/core/runtime.js` foundations for constants, process helpers, and low-level utilities.
- [x] 2.2 Extract low-risk seams into `src/output`, `src/git`, `src/scaffold`, `src/hooks`, and `src/toolchain`.
- [x] 2.3 Extract higher-coupling seams into `src/sandbox`, `src/finish`, and `src/cli`.
- [x] 2.4 Reduce `bin/multiagent-safety.js` to a thin launcher that boots `src/cli/main.js`.
- [x] 2.5 Update publish packaging / metadata so installed CLIs ship the new `src/**` runtime.

## 3. Verification

- [x] 3.1 Add/update targeted regression coverage for the thin entrypoint, representative command routes, and package shipping of `src/**`.
- [x] 3.2 Run syntax checks for the entrypoint and extracted modules (`node --check bin/multiagent-safety.js` plus `node --check` on `src/**`).
- [x] 3.3 Run focused install/metadata/command regression suites.
- [x] 3.4 Run `npm pack --dry-run` to confirm `src/**` ships in the package.
- [x] 3.5 Run `openspec validate agent-codex-decompose-cli-monolith-2026-04-22-11-06 --type change --strict`.
- [x] 3.6 Run `openspec validate --specs`.

## 4. Cleanup (mandatory; run before claiming completion)

- [x] 4.1 Run the cleanup pipeline: `gx branch finish --branch agent/codex/decompose-cli-monolith-2026-04-22-11-06 --base dev --via-pr --wait-for-merge --cleanup`. This handles commit -> push -> PR create -> merge wait -> worktree prune in one invocation.
- [x] 4.2 Record the PR URL and final merge state (`MERGED`) in the completion handoff.
- [x] 4.3 Confirm the sandbox worktree is gone (`git worktree list` no longer shows the agent path; `git branch -a` shows no surviving local/remote refs for the branch).

Completion handoff: PR https://github.com/recodeee/gitguardex/pull/294 state=`MERGED` merged_at=`2026-04-22T10:38:31Z`; `git worktree list` no longer shows `.omx/agent-worktrees/agent__codex__decompose-cli-monolith-2026-04-22-11-06`; `git branch -a --list 'agent/codex/decompose-cli-monolith-2026-04-22-11-06' 'origin/agent/codex/decompose-cli-monolith-2026-04-22-11-06'` returns no refs after `git fetch --prune origin`.
