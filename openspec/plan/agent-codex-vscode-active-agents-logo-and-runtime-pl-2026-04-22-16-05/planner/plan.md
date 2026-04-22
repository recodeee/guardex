# ExecPlan: agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Follow repository guidance in `openspec/plan/PLANS.md`.

## Purpose / Big Picture

After this plan lands, the `GitGuardex Active Agents` VS Code extension shows GitGuardex branding instead of the default placeholder icon, and any follow-up runtime work is limited to gaps that still exist after inspecting the shipped extension. Operators should be able to install the local extension, reload VS Code, and see the branded icon on the extension details page without losing the current `ACTIVE AGENTS` / `CHANGES` tree behavior.

## Progress

- [x] (2026-04-22 14:10Z) Capture initial scope, acceptance criteria, and the real packaging/runtime constraints from the current repo.
- [x] (2026-04-22 14:18Z) Draft architecture/tradeoff plan and verification strategy for branding plus delta-only runtime follow-up.
- [x] (2026-04-22 14:24Z) Publish execution-ready handoff with explicit lanes, files, and verification steps.
- [x] (2026-04-22 14:31Z) Merge the implementation lane as `PR #322` after focused tests, OpenSpec validation, and install smoke evidence.
- [x] (2026-04-22 14:43Z) Merge the bookkeeping reconciliation lane as `PR #326` so the cleanup record stays aligned with the merged implementation lane.

## Surprises & Discoveries

- Observation: The repo already has a root `logo.png`, but the local installer copies only `vscode/guardex-active-agents/` or `templates/vscode/guardex-active-agents/`, so the extension details page cannot see the root asset today.
  Evidence: `logo.png`, `scripts/install-vscode-active-agents-extension.js`
- Observation: The Active Agents extension already implements grouped activity buckets, repo `CHANGES`, lock-aware change rows, and `AGENT.lock` fallback discovery, so the requested runtime brief overstates the missing scope.
  Evidence: `vscode/guardex-active-agents/README.md`, `vscode/guardex-active-agents/session-schema.js`, `openspec/changes/agent-codex-vscode-working-agents-groups-2026-04-22-09-05/specs/vscode-working-agents-groups/spec.md`
- Observation: Extension sources are duplicated under both `vscode/guardex-active-agents/` and `templates/vscode/guardex-active-agents/`, and tests still reference the template copy in places.
  Evidence: `vscode/guardex-active-agents/*`, `templates/vscode/guardex-active-agents/*`, `test/vscode-active-agents-session-state.test.js`

## Decision Log

- Decision: Use OpenSpec plan workspace as source of truth for this planning cycle.
  Rationale: Keeps planning artifacts in-repo and reviewable.
  Date/Author: 2026-04-22 / codex
- Decision: Prefer an in-place follow-up on the existing extension surfaces instead of a provider rewrite.
  Rationale: The branding gap is real, but most runtime items from the user brief are already present; a rewrite would duplicate shipped behavior and widen risk.
  Date/Author: 2026-04-22 / codex
- Decision: Ship the branded icon from inside the extension payload, sourced from the existing repo `logo.png`.
  Rationale: VS Code extension manifest icons must resolve from the installed extension directory; referencing the repo root would not survive local install.
  Date/Author: 2026-04-22 / codex
- Decision: Do not split this plan into parallel waves.
  Rationale: The work stayed narrow, the runtime slice audited to no-op, and a single owner kept the bookkeeping truthful.
  Date/Author: 2026-04-22 / codex

## Outcomes & Retrospective

The plan completed as intended: the branded icon shipped in `PR #322`, the runtime scope stayed delta-only, and `PR #326` reconciled the cleanup bookkeeping so the plan artifacts match the merged lane.

## Completion Evidence

- Implementation PR:
  - `PR #322`
  - URL: `https://github.com/recodeee/gitguardex/pull/322`
  - head: `agent/codex/vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17`
  - merge commit: `14a08b67ffcc3f51193134ead568b07dd716bd39`
  - merged at: `2026-04-22T14:31:31Z`
- Cleanup-bookkeeping PR:
  - `PR #326`
  - URL: `https://github.com/recodeee/gitguardex/pull/326`
  - head: `agent/codex/record-active-agents-logo-merge-evidence-2026-04-22-16-36`
  - merge commit: `68d520e08aa2dd3b3f4c43d5bac0d13771abb5de`
  - merged at: `2026-04-22T14:43:27Z`
- Current repo state:
  - `git worktree list --porcelain` shows no surviving original implementation worktree
  - `git branch -a | rg 'vscode-active-agents-logo-and-runtime-(im|pl)-2026-04-22'` finds no surviving implementation or plan-slug refs

## Context and Orientation

- `logo.png`: existing brand source at the repo root.
- `vscode/guardex-active-agents/package.json`: manifest surface that needs `icon` metadata for the extension details page.
- `vscode/guardex-active-agents/extension.js`: Source Control tree provider, actions, watchers, and repo/session rendering.
- `vscode/guardex-active-agents/session-schema.js`: session-state parsing, repo-root change derivation, lock metadata, and `AGENT.lock` fallback.
- `templates/vscode/guardex-active-agents/*`: mirrored extension source still used by tests and installer fallback paths.
- `scripts/install-vscode-active-agents-extension.js`: local install helper that copies the extension source tree into `~/.vscode/extensions`.
- `test/vscode-active-agents-session-state.test.js`: focused regression surface for session schema behavior, install payload checks, and extension activation.
- Prior OpenSpec changes worth preserving rather than redoing:
  - `openspec/changes/agent-codex-vscode-active-agents-extension-2026-04-21-17-38/`
  - `openspec/changes/agent-codex-vscode-active-agents-scm-provider-layout-2026-04-21-23-22/`
  - `openspec/changes/agent-codex-vscode-working-agents-groups-2026-04-22-09-05/`
  - `openspec/changes/agent-codex-vscode-active-agents-live-worktree-telem-2026-04-22-13-43/`
  - `openspec/changes/agent-codex-vscode-tree-lock-decorations-clean-2026-04-22-11-09/`

## RALPLAN-DR Summary

### Principles

- Make the smallest change that fixes the real operator-visible gap.
- Ship assets from the installed extension payload, not repo-root-only paths.
- Preserve already-landed Active Agents behavior and avoid duplicate implementations.
- Keep mirrored extension surfaces consistent unless the change intentionally collapses them.
- Prove the work with focused extension/install validation instead of repo-wide noise.

### Decision Drivers

- The extension details page branding gap is user-visible now.
- The current code already satisfies much of the requested runtime brief.
- Installer/tests and duplicated source trees can drift unless the plan names them explicitly.

### Viable Options

1. Patch the current extension in place and keep the runtime scope delta-only. Preferred.
   Pros: smallest blast radius, reuses current tests and installer flow, fixes the visible gap first.
   Cons: requires discipline to keep `vscode/` and `templates/` aligned.
2. Collapse to a single canonical extension source before adding branding/runtime follow-up.
   Pros: removes duplication risk long-term.
   Cons: larger refactor than the current ask, higher chance of unrelated drift, not necessary to ship the branding fix.
3. Add installer-time asset injection without touching extension sources.
   Pros: avoids editing duplicate source trees.
   Cons: hides the real manifest/package truth, complicates tests, and makes the extension source misleading.

## ADR

### Decision

Use an in-place follow-up on the existing Active Agents extension, package a copy of `logo.png` inside the installable extension tree, and gate any runtime changes behind an audit that proves the behavior is still missing.

### Drivers

- Visible branding defect in VS Code extension details.
- Existing runtime functionality already covers grouped states, repo changes, and lock/fallback behavior.
- Installer/tests depend on the extension folder contents, not on the repo root.

### Alternatives Considered

- Canonicalize to one source tree first.
- Inject the icon only at install time.

### Why Chosen

It fixes the visible defect fast, keeps the diff reviewable, and avoids reopening already-merged runtime work.

### Consequences

- Execution must explicitly keep the mirrored `vscode/` and `templates/` trees in sync, or collapse them intentionally in the same change.
- Runtime edits may end up being no-ops if the audit shows the requested items already ship.

### Follow-ups

- If mirrored source drift keeps recurring after this lane, open a separate change to canonicalize the extension source tree.

## Plan of Work

1. Audit current behavior against the requested brief.
   Confirm exactly which requested items already exist in `package.json`, `extension.js`, `session-schema.js`, prior OpenSpec specs, and the installer/test surfaces. Convert the brief into a delta list before code edits.
2. Package the branded icon.
   Choose the asset path inside `vscode/guardex-active-agents/` and `templates/vscode/guardex-active-agents/`, copy/derive from `logo.png`, and wire the manifest `icon` field so the local install payload carries the brand into VS Code.
3. Apply runtime delta only if still missing.
   Touch `extension.js`, `session-schema.js`, or install/test/docs files only for behaviors that remain absent after audit. Keep current grouped buckets, `CHANGES`, lock-awareness, and `AGENT.lock` fallback intact.
4. Sync docs and tests.
   Update extension README/root README install guidance if needed, and extend focused test coverage to prove icon packaging plus any runtime delta.
5. Validate and finish.
   Run focused tests plus OpenSpec validation, then commit with Lore trailers and finish through `gx branch finish --via-pr --wait-for-merge --cleanup`.

## Concrete Steps

List exact commands with working directory and short expected outcomes.

    cd /home/deadpool/Documents/recodee/gitguardex/.omx/agent-worktrees/agent__codex__vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17
    rg -n "icon|loading~spin|AGENT.lock|active-sessions|CHANGES" vscode/guardex-active-agents templates/vscode/guardex-active-agents test/vscode-active-agents-session-state.test.js
    # Confirm the delta list before editing code.

    cd /home/deadpool/Documents/recodee/gitguardex/.omx/agent-worktrees/agent__codex__vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17
    node --test test/vscode-active-agents-session-state.test.js
    # Focused extension/install regression coverage.

    cd /home/deadpool/Documents/recodee/gitguardex/.omx/agent-worktrees/agent__codex__vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17
    openspec validate agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05 --type change --strict
    openspec validate --specs
    # Validate the new change artifacts and repo specs.

    cd /home/deadpool/Documents/recodee/gitguardex/.omx/agent-worktrees/agent__codex__vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17
    gx branch finish --branch agent/codex/vscode-active-agents-logo-and-runtime-im-2026-04-22-16-17 --base main --via-pr --wait-for-merge --cleanup
    # Commit, push, PR, merge wait, and sandbox prune.

## Validation and Acceptance

- Installed extension directory contains the branded icon asset and manifest metadata.
- Reloaded VS Code shows the branded icon on the extension details page instead of the generic placeholder.
- Existing `ACTIVE AGENTS` / `CHANGES` grouped behavior still works; if runtime code changed, focused tests cover the new branch.
- `vscode/` and `templates/` extension sources either remain behaviorally synced or are intentionally collapsed with installer/tests updated in the same change.
- `openspec validate ... --strict` and `openspec validate --specs` pass before finish.

## Idempotence and Recovery

- Re-running the installer should prune the older local extension copy and reinstall the current version with the branded asset.
- If the runtime audit finds no remaining missing behavior, the implementation may stop after the icon/docs/tests work without forcing extra provider changes.
- If mirrored source updates become too error-prone mid-flight, pause and either collapse to one canonical source in the same change or split that refactor into a follow-up change before mixing in runtime edits.

## Artifacts and Notes

- Branding source: `logo.png`
- Install path: `scripts/install-vscode-active-agents-extension.js`
- Extension sources: `vscode/guardex-active-agents/*`, `templates/vscode/guardex-active-agents/*`
- Focused tests: `test/vscode-active-agents-session-state.test.js`
- Prior spec anchors:
  - `openspec/changes/agent-codex-vscode-active-agents-extension-2026-04-21-17-38/specs/vscode-active-agents-extension/spec.md`
  - `openspec/changes/agent-codex-vscode-working-agents-groups-2026-04-22-09-05/specs/vscode-working-agents-groups/spec.md`
  - `openspec/changes/agent-codex-vscode-tree-lock-decorations-clean-2026-04-22-11-09/specs/vscode-active-agents-extension/spec.md`

## Interfaces and Dependencies

- VS Code extension manifest contract: `package.json` `icon` path must point at a bundled asset.
- Installer contract: `fs.cpSync(sourceDir, targetDir, ...)` copies only the selected extension directory tree.
- Session-schema contract: runtime follow-up must preserve exported parsing/derivation behavior expected by `test/vscode-active-agents-session-state.test.js`.
- OpenSpec contract: change spec stays under `specs/vscode-active-agents-extension/spec.md`; plan workspace remains the execution source of truth.

## Revision Note

- 2026-04-22 14:24Z: Replaced scaffold with an execution-ready plan for Active Agents branding plus delta-only runtime follow-up.
- 2026-04-22 14:43Z: Recorded the merged implementation and cleanup-bookkeeping evidence so the root plan artifacts now match the finished lane.
