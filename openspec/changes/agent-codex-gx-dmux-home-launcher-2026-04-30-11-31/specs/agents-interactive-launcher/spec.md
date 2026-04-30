## ADDED Requirements

### Requirement: Empty panel prompts for task before launch

`gx agents start --panel` SHALL allow the panel to open without a task and collect the task inside the launcher before creating any agent lane.

#### Scenario: TTY panel starts in task input mode

- **WHEN** an operator runs `gx agents start --panel` in a TTY
- **THEN** the GitGuardex launcher SHALL render before any branch/worktree is created
- **AND** the launcher SHALL show a task input prompt
- **AND** printable keys SHALL update the task shown by the launcher
- **AND** Enter SHALL launch only after the task is non-empty.

#### Scenario: scripted panel dry-run renders home without task plans

- **WHEN** `gx agents start --panel --dry-run` runs without a TTY and without a task
- **THEN** the output SHALL render the GitGuardex home panel
- **AND** the output SHALL not render dry-run branch plans until a task exists.

### Requirement: Plain gx opens the interactive launcher home

Plain interactive `gx` SHALL open the same GitGuardex home launcher instead of status output.

#### Scenario: no-argument interactive gx shows home launcher

- **WHEN** an operator runs `gx` with no arguments in a TTY
- **THEN** the command SHALL open the interactive GitGuardex launcher
- **AND** the launcher SHALL ask for the task before launch.

#### Scenario: non-interactive gx keeps status behavior

- **WHEN** `gx` runs with no arguments outside a TTY
- **THEN** the command SHALL keep the existing status behavior.
