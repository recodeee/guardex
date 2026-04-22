# Plan Phases: agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05

One entry per phase. Checkbox marks map to: `x` = completed, `>` = in progress, space = pending.
Indented sub-bullets are optional metadata consumed by the Plans UI:

- `session`: which agent kind runs the phase (`codex` / `claude`).
- `checkpoints`: comma-separated role checkpoint ids delivered within the phase.
- `summary`: one short sentence rendered under the phase title.

One phase is intended to fit into a single Codex or Claude session task.

- [x] [PH01] Audit shipped Active Agents behavior and capture the follow-up scope
  - session: codex
  - checkpoints: P1
  - summary: Confirm the real gap list: root `logo.png` exists, installer copies only extension folders, and grouped state/lock fallback behavior already ships.

- [x] [PH02] Decide icon packaging and source-of-truth rules
  - session: codex
  - checkpoints: A1, C1
  - summary: Keep mirrored `vscode/` + `templates/` sources for now and ship a bundled `icon.png` inside each installable extension tree.

- [x] [PH03] Ship branding plus only the missing runtime delta
  - session: codex
  - checkpoints: E1
  - summary: Added the branded icon and manifest wiring; the runtime audit found no missing `extension.js` or `session-schema.js` behavior to patch.

- [x] [PH04] Refresh docs and focused regression coverage
  - session: codex
  - checkpoints: W1, V1
  - summary: Synced README copy, extended the install payload test, and verified the bundled icon via both focused tests and a manual install smoke check.

- [x] [PH05] Validate and finish the lane
  - session: codex
  - checkpoints: E1, V1
  - summary: Focused verification passed, `PR #322` merged, and the original implementation branch/worktree no longer appears in current `git branch -a` or `git worktree list --porcelain` output.
