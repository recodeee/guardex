## Definition of Done

This change is complete only when **all** of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks (test failure, conflict, ambiguous result), append a `BLOCKED:` line under section 4 explaining the blocker and **STOP**. Do not tick remaining cleanup boxes; do not silently skip the cleanup pipeline.

## Handoff

- Handoff: change=`agent-codex-extract-git-scaffold-doctor-di-2026-04-22-15-38`; branch=`agent/codex/extract-doctor-sandbox-module-2026-04-22-15-38`; scope=`src/cli/main.js`, `src/git/index.js`, `src/scaffold/index.js`, `src/doctor/index.js`, `src/sandbox/index.js`, `src/toolchain/index.js`, `src/finish/index.js`, `test/cli-args-dispatch.test.js`; action=`extract the remaining git/scaffold/doctor helper seams and delete the DI factory wrappers without changing CLI behavior`.

## 1. Specification

- [x] 1.1 Finalize the git/scaffold/doctor/DI extraction scope and acceptance criteria for `agent-codex-extract-git-scaffold-doctor-di-2026-04-22-15-38`.
- [x] 1.2 Confirm no capability spec delta is required because this change is a behavior-preserving internal extraction and cleanup pass.

## 2. Implementation

- [x] 2.1 Extend focused regression coverage so the remaining helper clusters and DI wrapper functions are behavior-locked before cleanup.
- [x] 2.2 Move the remaining git/worktree helpers from `src/cli/main.js` into `src/git/index.js` and update callers.
- [x] 2.3 Move the remaining scaffold/template/JSONC/settings helpers from `src/cli/main.js` into `src/scaffold/index.js` and update callers.
- [x] 2.4 Extract the protected-main doctor sandbox lifecycle and related sandbox helpers into `src/doctor/index.js` and route `src/cli/main.js` through it.
- [x] 2.5 Convert `src/sandbox/index.js`, `src/toolchain/index.js`, and `src/finish/index.js` to direct modules and delete the cached factory wrappers from `src/cli/main.js`.

## 3. Verification

- [x] 3.1 Run `node --check src/cli/main.js src/git/index.js src/scaffold/index.js src/doctor/index.js src/sandbox/index.js src/finish/index.js src/toolchain/index.js`.
- [x] 3.2 Run `node --test test/cli-args-dispatch.test.js`.
- [x] 3.3 Run focused CLI regression suites covering setup, doctor, install, metadata, and finish-adjacent behavior.
- [x] 3.4 Run `npm test`.
- [x] 3.5 Run `openspec validate agent-codex-extract-git-scaffold-doctor-di-2026-04-22-15-38 --type change --strict`.
- [x] 3.6 Run `openspec validate --specs`.

Verified on 2026-04-22:
- `node --check src/cli/main.js src/git/index.js src/scaffold/index.js src/doctor/index.js src/sandbox/index.js src/finish/index.js src/toolchain/index.js`
- `node --test test/cli-args-dispatch.test.js test/doctor.test.js test/install.test.js test/metadata.test.js test/finish.test.js test/setup.test.js`
- `npm test` -> `209` pass, `0` fail, `1` skip
- `openspec validate agent-codex-extract-git-scaffold-doctor-di-2026-04-22-15-38 --type change --strict`
- `openspec validate --specs` -> `No items found to validate.`

## 4. Cleanup (mandatory; run before claiming completion)

- [x] 4.1 Run `gx branch finish --branch agent/codex/extract-doctor-sandbox-module-2026-04-22-15-38 --base main --via-pr --wait-for-merge --cleanup`.
- [x] 4.2 Record the PR URL and final merge state (`MERGED`) in the completion handoff.
- [x] 4.3 Confirm the sandbox worktree is gone (`git worktree list` no longer shows the agent path; `git branch -a` shows no surviving local/remote refs for the branch).

Cleanup verified on 2026-04-22:
- `gx branch finish --branch agent/codex/extract-doctor-sandbox-module-2026-04-22-15-38 --base main --via-pr --wait-for-merge --cleanup`
- PR `#323` `MERGED`: `https://github.com/recodeee/gitguardex/pull/323`
- `gx cleanup --base main`
- `git worktree list` -> only `/home/deadpool/Documents/recodee/gitguardex [main]`
- `git fetch origin --prune`
- `git branch -a --list "*extract-doctor-sandbox-module-2026-04-22-15-38*"` -> no refs
