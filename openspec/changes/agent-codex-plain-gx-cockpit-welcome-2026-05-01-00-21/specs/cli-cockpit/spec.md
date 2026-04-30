## ADDED Requirements

### Requirement: plain interactive gx opens cockpit

Guardex SHALL route a no-argument `gx` invocation from an interactive terminal to the GitGuardex cockpit control view.

#### Scenario: interactive no-argument launch

- **GIVEN** stdin and stdout are TTYs
- **AND** `GUARDEX_LEGACY_STATUS` is not enabled
- **WHEN** the user runs `gx`
- **THEN** Guardex SHALL open the cockpit control view instead of printing status output.

#### Scenario: non-interactive no-argument launch

- **GIVEN** stdin or stdout is not a TTY
- **WHEN** the user runs `gx`
- **THEN** Guardex SHALL print the existing compact status output.

#### Scenario: legacy status escape hatch

- **GIVEN** stdin and stdout are TTYs
- **AND** `GUARDEX_LEGACY_STATUS=1`
- **WHEN** the user runs `gx`
- **THEN** Guardex SHALL print the existing status output instead of opening the cockpit.

#### Scenario: explicit status command

- **WHEN** the user runs `gx status`
- **THEN** Guardex SHALL print status output.

### Requirement: default cockpit launch falls back safely

Guardex SHALL prefer Kitty for the default interactive cockpit launch when Kitty remote control is available, then fall back to tmux, then fall back to an inline cockpit control render.

#### Scenario: Kitty unavailable

- **GIVEN** Kitty remote control is unavailable
- **WHEN** the default cockpit launcher runs
- **THEN** Guardex SHALL try the tmux cockpit backend.

#### Scenario: terminal backends unavailable

- **GIVEN** Kitty and tmux cockpit launch both fail
- **WHEN** the default cockpit launcher runs
- **THEN** Guardex SHALL render the cockpit control view inline in the current terminal.
