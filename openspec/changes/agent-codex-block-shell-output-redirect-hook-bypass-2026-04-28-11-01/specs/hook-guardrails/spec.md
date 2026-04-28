## ADDED Requirements

### Requirement: Hook guards block protected-branch shell output writes
The managed Codex, Claude, and Agents `skill_guard.py` hooks SHALL treat shell output redirection to files as mutating behavior before applying the read-only Bash allowlist.

#### Scenario: Allowlisted command redirects output to a file
- **WHEN** a non-agent shell on protected `main` runs a command such as `cat > target-file`
- **THEN** the guard blocks the command
- **AND** the block message identifies the protected branch.

#### Scenario: Read-only diagnostics redirect stderr
- **WHEN** a read-only shell command uses `2>&1` or sends stderr to `/dev/null`
- **THEN** the guard continues to allow the command.
