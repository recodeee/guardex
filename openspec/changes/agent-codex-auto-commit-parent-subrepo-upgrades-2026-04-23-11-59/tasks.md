# Tasks

## 1. Spec

- [x] Define parent gitlink auto-commit behavior and controls.

## 2. Tests

- [x] Add regression coverage for nested repo finish creating a parent gitlink commit.

## 3. Implementation

- [x] Add parent gitlink detection and path-scoped parent commit to `agent-branch-finish`.
- [x] Pass parent gitlink controls through `gx finish`.
- [x] Compare gitlink index SHA to nested HEAD so parent `diff.ignoreSubmodules=all` does not hide pointer upgrades.
- [x] Stage the gitlink with `git update-index --cacheinfo` so registered submodule ignore settings cannot suppress the pointer update.

## 4. Cleanup

- [x] Run focused verification.
- [x] Commit and finish via PR with merge + cleanup evidence.

Verification:
- `bash -n scripts/agent-branch-finish.sh`
- `bash -n templates/scripts/agent-branch-finish.sh`
- `node --test test/cli-args-dispatch.test.js test/finish.test.js`
- `openspec validate agent-codex-auto-commit-parent-subrepo-upgrades-2026-04-23-11-59 --strict`
- `git diff --check`
- `npm test`

Finish evidence:
- PR #359 `https://github.com/recodeee/gitguardex/pull/359` merged at `2026-04-23T10:10:42Z`.
- PR #361 `https://github.com/recodeee/gitguardex/pull/361` merged at `2026-04-23T10:14:01Z`.
- PR #362 `https://github.com/recodeee/gitguardex/pull/362` merged at `2026-04-23T10:16:57Z`.
- Source worktrees and local branches for the three implementation PRs were removed manually after `/tmp` worktree root metadata prevented automatic branch deletion.
- `git fetch origin --prune` removed stale remote-tracking refs for all three implementation branches; no matching local or remote-tracking refs remain.
- Parent `recodee` gitlink auto-commit attempted after PR #361 and #362; protected-branch hook blocked direct parent `dev` commits, leaving `gitguardex` staged to nested HEAD for a parent agent-branch commit.
