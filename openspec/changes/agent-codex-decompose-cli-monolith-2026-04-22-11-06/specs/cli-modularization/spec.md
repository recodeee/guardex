## ADDED Requirements

### Requirement: Thin CLI entrypoint
The CLI SHALL keep `bin/multiagent-safety.js` as a thin bootstrap surface that delegates command execution into `src/cli`.

#### Scenario: Entrypoint delegates into src/cli
- **WHEN** the published CLI binary is executed
- **THEN** `bin/multiagent-safety.js` loads the modular runtime from `src/cli/main.js`
- **AND** command dispatch logic no longer depends on the monolithic file body.

### Requirement: Module seams mirror operational responsibility
The CLI SHALL separate major operational seams into dedicated modules under `src/` instead of keeping them in one file.

#### Scenario: Responsibilities live under dedicated src modules
- **WHEN** a maintainer inspects the refactored CLI
- **THEN** argument parsing and dispatch live under `src/cli`
- **AND** output formatting lives under `src/output`
- **AND** git/worktree helpers live under `src/git`
- **AND** managed-file and template logic live under `src/scaffold` and `src/hooks`
- **AND** toolchain and self-update logic live under `src/toolchain`
- **AND** protected-base sandbox and finish flows live under `src/sandbox` and `src/finish`.

### Requirement: Refactor preserves targeted CLI behavior
The modularization SHALL preserve the current command surface for targeted verified flows.

#### Scenario: Targeted CLI regressions stay green after extraction
- **WHEN** the focused install/metadata/command regression suites and packaging checks are run after the extraction
- **THEN** they pass without command-name regressions
- **AND** the published package still contains the runtime files required by the extracted `src/**` modules.
