## Why

- The README conflict diagram currently shows only two agents.
- That visual undersells the real failure mode in parallel AI workflows where many agents can collide on the same shared files.

## What Changes

- Update the Mermaid diagram in `README.md` to show multiple agents (A-E) editing the same target surface.
- Preserve the looped failure narrative from conflicts to lost code and rework.
- Keep scope docs-only with no CLI/runtime behavior changes.

## Impact

- Affected surface: top-level README visualization.
- Risk: low, diagram-only change.
- Rollout: immediate on merge, no migration or operational steps.
