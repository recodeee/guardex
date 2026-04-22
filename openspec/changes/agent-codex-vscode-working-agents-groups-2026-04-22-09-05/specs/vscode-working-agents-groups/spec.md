## ADDED Requirements

### Requirement: Active Agents highlights currently working lanes
The VS Code Active Agents companion SHALL separate actively editing Guardex lanes from idle-thinking lanes inside the `ACTIVE AGENTS` section.

#### Scenario: Working and thinking sessions render in separate groups
- **WHEN** a repo has both live `working` and `thinking` Guardex sessions
- **THEN** the repo node contains an `ACTIVE AGENTS` section
- **AND** that section contains `WORKING NOW` and `THINKING` child groups
- **AND** the working group appears before the thinking group.

#### Scenario: Repo summary exposes working counts
- **WHEN** a repo has one or more live working sessions
- **THEN** the repo row description includes the working count in addition to the active session count
- **AND** the Source Control badge tooltip mentions how many active sessions are currently working.

#### Scenario: Working sessions use a distinct visual affordance
- **WHEN** a live Guardex session is inferred as `working`
- **THEN** its row uses a distinct codicon from `thinking` rows
- **AND** the row still keeps the existing activity/count/elapsed description text.
