## Definition of Done

This change is complete only when **all** of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks (test failure, conflict, ambiguous result), append a `BLOCKED:` line under section 5 explaining the blocker and **STOP**. Do not tick remaining cleanup boxes; do not silently skip the cleanup pipeline.

## Handoff

- Handoff: change=`agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05`; implementation-branch=`agent/codex/vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17`; scope=`logo.png packaging for the Active Agents extension, delta-only runtime audit, mirrored source parity, focused tests/docs`; result=`merged via PR #322`; action=`no pending implementation work remains in this change; only post-merge bookkeeping verification was required`.
- Copy prompt: `PR #322` already merged. Do not resume the old implementation sandbox; open a new helper lane from `main` only if a fresh follow-up is needed.

## 1. Specification

- [x] 1.1 Finalize proposal scope around extension branding, install payload behavior, mirrored extension-source parity, and delta-only runtime follow-up.
- [x] 1.2 Define normative requirements in `specs/vscode-active-agents-extension/spec.md`.

## 2. Planning

- [x] 2.1 Create an execution-ready plan workspace under `openspec/plan/agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05/`.
- [x] 2.2 Replace generic role task scaffolds with concrete lanes for planner, architect, critic, executor, writer, and verifier.
- [x] 2.3 Fold the architecture/critique conclusions back into the implementation lane: keep mirrored sources, bundle `icon.png`, and skip runtime rewrites because the requested state-group/change/lock behavior already ships.

## 3. Implementation

- [x] 3.1 Package a branded extension icon using the existing repo `logo.png` and wire it into the installed extension manifest.
- [x] 3.2 Audit the current Active Agents code/specs against the requested runtime brief and land only the still-missing delta. Result: no `extension.js` or `session-schema.js` changes were needed.
- [x] 3.3 Keep `vscode/guardex-active-agents/*`, `templates/vscode/guardex-active-agents/*`, docs, and focused tests aligned.

## 4. Verification

- [x] 4.1 Run focused extension/install coverage, including `node --test test/vscode-active-agents-session-state.test.js`.
- [x] 4.2 Run `openspec validate agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05 --type change --strict`.
- [x] 4.3 Run `openspec validate --specs` (`No items found to validate`) and a manual install smoke check proving `icon.png` lands in the installed extension payload.

## 5. Cleanup (mandatory; run before claiming completion)

- [x] 5.1 Finalization already completed on the implementation lane via `gx branch finish --branch agent/codex/vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17 --base main --via-pr --wait-for-merge --cleanup`.
- [x] 5.2 Recorded merge evidence: `https://github.com/recodeee/gitguardex/pull/322` reached `MERGED` at `2026-04-22T14:31:31Z`.
- [x] 5.3 Confirmed cleanup evidence on the current repo state: `git worktree list --porcelain` no longer lists the implementation worktree and `git branch -a` shows no surviving refs matching `vscode-active-agents-logo-and-runtime`.
