# /guardex

Run a GuardeX check-and-repair for the current repo.

## Steps

1. `gx status` — if green, stop.
2. If degraded, `gx doctor`.
3. If still degraded, `gx status --strict` and summarize each finding with a fix.
4. Report verdict: `Repo is guarded` or `Repo is not guarded` (list blockers).

Keep output short, include the exact commands you ran.
