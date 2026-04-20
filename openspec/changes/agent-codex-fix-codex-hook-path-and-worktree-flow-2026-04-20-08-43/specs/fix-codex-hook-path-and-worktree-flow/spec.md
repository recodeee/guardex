## ADDED Requirements

### Requirement: fix-codex-hook-path-and-worktree-flow behavior
The repository hook settings SHALL reference existing in-repo hook script locations so prompt and tool guardrails run without missing-file errors.

#### Scenario: Baseline acceptance
- **WHEN** `.codex/settings.json` is loaded
- **THEN** each hook command path points to `/.codex/hooks/*.py`
- **AND** no hook command path references `/.agents/hooks/`.

#### Scenario: Claude settings path correctness
- **WHEN** `.claude/settings.json` is loaded
- **THEN** each hook command path points to `/.claude/hooks/*.py`
- **AND** no hook command path references `/.agents/hooks/`.

#### Scenario: Regression guard
- **WHEN** install/regression tests are run in a normal test environment
- **THEN** a dedicated test asserts hook command paths match local hook directories
- **AND** the test fails if stale `/.agents/hooks/` references are introduced.
