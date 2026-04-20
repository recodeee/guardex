<!-- multiagent-safety:START -->
## Multi-Agent Safety Contract

**Repo toggle.** `GUARDEX_ON=0|false|no|off` disables this contract. `GUARDEX_ON=1|true|yes|on` re-enables it.

**Isolation.** One task = one `agent/*` branch + worktree. Start `scripts/agent-branch-start.sh "<task>" "<agent>"`. Base branches stay read-only. No `git checkout` on primary worktrees; use `git worktree add`. `.githooks/post-checkout` auto-reverts primary-branch switches unless `GUARDEX_ALLOW_PRIMARY_BRANCH_SWITCH=1`.

**Ownership.** Claim before edits: `scripts/agent-file-locks.py claim --branch "<agent-branch>" <file...>`. Delete only claimed paths.

**Handoff.** Post a one-line note before edits. Re-read latest handoffs before replacing nearby work.

**Completion.** Finish with `scripts/agent-branch-finish.sh --branch "<agent-branch>" --via-pr --wait-for-merge --cleanup` or `gx finish --all`. Done = commit pushed, PR URL recorded, state=`MERGED`, sandbox pruned. If blocked, append `BLOCKED:` and stop.

**Parallel safety.** Never revert unrelated edits. Report conflicts.

**Reporting.** Completion handoff includes files changed, behavior touched, verification commands/results, and risks/follow-ups.

**OpenSpec.** Keep `openspec/changes/<slug>/tasks.md` current. End task scaffolds with PR merge + sandbox cleanup evidence. Run `openspec validate --specs` before archive.

**Version bumps.** If a change bumps a published version, the same PR updates release notes/changelog.
<!-- multiagent-safety:END -->
