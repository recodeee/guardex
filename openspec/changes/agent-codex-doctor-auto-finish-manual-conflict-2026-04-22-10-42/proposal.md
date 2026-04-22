## Why

- `gx doctor` currently counts recoverable auto-finish rebase conflicts as hard failures even when the repo itself is safe and the only remaining work is a manual conflict resolution step.
- That makes long doctor sweeps look broken or unsafe when the real state is narrower: the branch cannot be auto-finished yet and needs a human to rebase or merge it.

## What Changes

- Reclassify recoverable auto-finish conflict states during `gx doctor` from `[fail]` to a manual-action `[skip]` status.
- Keep the compact default summary actionable and keep `--verbose-auto-finish` useful by preserving the raw tail text behind the skip line.
- Add install-test coverage for the new summary counts and color behavior.

## Impact

- Affects only doctor auto-finish reporting for branches that hit recoverable rebase or merge conflicts.
- Keeps true auto-finish failures red and failed; only manual-resolution conflict cases move to the skip/pending bucket.
- Main risk: conflict detection could miss a new finish-script wording, so the pattern matching should stay narrow and test-backed.
