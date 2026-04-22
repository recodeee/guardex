## ADDED Requirements

### Requirement: doctor sweep classifies manual conflict work as actionable skips
The human-readable `gx doctor` auto-finish sweep SHALL classify recoverable manual conflict states as skip/manual-action rows instead of hard failures.

#### Scenario: auto-finish rebase conflict becomes a skip/manual-action row
- **GIVEN** a ready local `agent/*` branch exists during `gx doctor`
- **AND** `scripts/agent-branch-finish.sh` stops because it needs a human to continue or abort a source-probe rebase
- **WHEN** doctor prints the auto-finish summary
- **THEN** the summary SHALL not count that branch as failed
- **AND** the branch detail SHALL be emitted as a skip/manual-action row with the rebase instructions preserved in verbose mode

#### Scenario: true auto-finish failures remain failures
- **GIVEN** a ready local `agent/*` branch exists during `gx doctor`
- **AND** `scripts/agent-branch-finish.sh` fails for a reason other than a recoverable manual conflict
- **WHEN** doctor prints the auto-finish summary
- **THEN** the summary SHALL still count that branch as failed
- **AND** the branch detail SHALL remain a failed row
