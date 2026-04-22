## Definition of Done

This change is complete only when **all** of the following are true:

- Every checkbox below is checked.
- The agent branch reaches `MERGED` state on `origin` and the PR URL + state are recorded in the completion handoff.
- If any step blocks (test failure, conflict, ambiguous result), append a `BLOCKED:` line under section 4 explaining the blocker and **STOP**. Do not tick remaining cleanup boxes; do not silently skip the cleanup pipeline.

## Handoff

- Handoff: change=`agent-codex-mirror-recodee-token-and-caveman-agents-2026-04-22-23-28`; branch=`agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28`; scope=`templates/AGENTS.multiagent-safety.md, checked-in AGENTS.md, focused AGENTS prompt/setup regressions`; action=`mirror recodee-style token/caveman rules into the managed template and finish the sandbox`.
- Copy prompt: Continue `agent-codex-mirror-recodee-token-and-caveman-agents-2026-04-22-23-28` on branch `agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28`. Work inside the existing sandbox, review `openspec/changes/agent-codex-mirror-recodee-token-and-caveman-agents-2026-04-22-23-28/tasks.md`, continue from the current state instead of creating a new sandbox, and when the work is done run `gx branch finish --branch agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28 --base main --via-pr --wait-for-merge --cleanup`.

## 1. Specification

- [x] 1.1 Finalize proposal scope and acceptance criteria for `agent-codex-mirror-recodee-token-and-caveman-agents-2026-04-22-23-28`.
- [x] 1.2 Define normative requirements in `specs/managed-repo-agents-contract/spec.md`.

## 2. Implementation

- [x] 2.1 Extend the managed AGENTS template and checked-in managed block with repo-generic `Token / Context Budget` and `OMX Caveman Style` sections.
- [x] 2.2 Add/update focused regression coverage for setup/install output and `gx prompt --snippet`.

## 3. Verification

- [x] 3.1 Run `node --test test/setup.test.js test/prompt.test.js`.
- [x] 3.2 Run `openspec validate agent-codex-mirror-recodee-token-and-caveman-agents-2026-04-22-23-28 --type change --strict`.
- [x] 3.3 Run `openspec validate --specs`.

Verification evidence:
- `node --test test/setup.test.js test/prompt.test.js` (pass, 51/51 setup tests + 9/9 prompt tests)
- `openspec validate agent-codex-mirror-recodee-token-and-caveman-agents-2026-04-22-23-28 --type change --strict` (pass)
- `openspec validate --specs` (`No items found to validate.`)
- `diff -u <(sed -n "/<!-- multiagent-safety:START -->/,/<!-- multiagent-safety:END -->/p" AGENTS.md) templates/AGENTS.multiagent-safety.md` (clean; no output)
- `git -C /home/deadpool/Documents/recodee/gitguardex status --short` (clean primary checkout)

## 4. Cleanup (mandatory; run before claiming completion)

- [x] 4.1 Run the cleanup pipeline: `gx branch finish --branch agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28 --base main --via-pr --wait-for-merge --cleanup`. This handles commit -> push -> PR create -> merge wait -> worktree prune in one invocation.
- [x] 4.2 Record the PR URL and final merge state (`MERGED`) in the completion handoff.
- [x] 4.3 Confirm the sandbox worktree is gone (`git worktree list` no longer shows the agent path; `git branch -a` shows no surviving local/remote refs for the branch).

Cleanup evidence:
- `gx branch finish --branch agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28 --base main --via-pr --wait-for-merge --cleanup` completed successfully from the primary checkout.
- `gh pr view "agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28" --repo recodeee/gitguardex --json number,url,state,mergedAt,headRefName,baseRefName` returned PR `#349`, `https://github.com/recodeee/gitguardex/pull/349`, state `MERGED`, merged at `2026-04-22T21:38:08Z`.
- `git worktree list` no longer shows `/home/deadpool/Documents/recodee/gitguardex/.omx/agent-worktrees/agent__codex__mirror-recodee-token-and-caveman-agents-2026-04-22-23-28`.
- `git branch -a --list "agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28" "remotes/origin/agent/codex/mirror-recodee-token-and-caveman-agents-2026-04-22-23-28"` returned no surviving refs.
