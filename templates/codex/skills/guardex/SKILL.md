---
name: guardex
description: "Check, repair, or bootstrap multi-agent safety guardrails in this repository."
---

# GuardeX (Codex skill)

Use when branch safety, lock ownership, or guardrail setup may be broken.

## Fast path

1. `gx status` — one-glance health check.
2. If degraded, `gx doctor` — repair + verify in one pass.
3. If issues remain, `gx status --strict` and address each finding.

## Bootstrap (missing guardrails)

```sh
gx setup      # install + repair + verify
gx status     # confirm green
```

## Notes

- Isolation: `scripts/codex-agent.sh "<task>" "<agent>"` is the one-command sandbox start/finish loop.
- Completion: auto-finish keeps the branch until explicit `gx cleanup`.
- Never bypass protected-branch safeguards.

## Bulk finish

```sh
gx finish --all                # commit + PR + merge all ready agent/* branches
gx cleanup                     # prune merged/stale branches and worktrees
```

If a branch fails with stale rebase/worktree state:

```sh
git -C "<worktree>" rebase --abort || true
gx finish --branch "<agent-branch>" --cleanup
```
