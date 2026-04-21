## Why

- `gx setup`, `gx install`, and `gx fix` still hard-block on protected `main`, even though the CLI/help surface says protected-base maintenance should run through a sandbox branch/worktree.
- The current bootstrap path makes first-time setup on protected `main` awkward: the user has to override the guard or manually start a branch before Guardex can bootstrap the repo.

## What Changes

- Run protected-`main` setup/install/fix work inside sandbox branches instead of failing in-place.
- Auto-commit sandboxed maintenance changes, attempt the existing PR finish flow when GitHub auth is available, and only clean the sandbox when it is safe to discard.
- Keep direct `--allow-protected-base-write` as the explicit opt-in for in-place maintenance.

## Impact

- Affects `bin/multiagent-safety.js` protected-branch maintenance flow and the protected-main regression coverage in `test/install.test.js`.
- Preserves the existing doctor sandbox path; this change aligns the other bootstrap/repair entrypoints with that model.
- Main risk is cleanup semantics: sandbox branches must not be pruned when auto-finish is skipped, pending, or fails.

Handoff: continuing this lane in `bin/multiagent-safety.js` and `test/install.test.js` to align protected-main sandbox expectations, rerun focused verification, and finish the OpenSpec validation pass.
