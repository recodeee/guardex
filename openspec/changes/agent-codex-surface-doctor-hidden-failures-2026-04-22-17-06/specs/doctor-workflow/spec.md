## ADDED Requirements

### Requirement: compact doctor auto-finish output surfaces failures before truncating skips
The human-readable compact `gx doctor` auto-finish sweep SHALL keep failed branch results visible when the detail list is truncated.

#### Scenario: compact output promotes a failed row ahead of skipped rows
- **GIVEN** the auto-finish sweep contains more branch details than the compact visible limit
- **AND** at least one failed branch result appears after several skipped rows in raw branch iteration order
- **WHEN** `gx doctor` prints the compact auto-finish summary
- **THEN** a failed branch detail SHALL still appear in the visible compact rows
- **AND** hidden branch results SHALL be summarized with status counts so remaining hidden failures stay explicit
