## ADDED Requirements

### Requirement: Active Agents defaults to an operator-first task layout
The VS Code Active Agents companion SHALL prioritize active task ownership and risk scanning over raw worktree and folder completeness.

#### Scenario: Repo view shows task-first operator sections
- **WHEN** a repo has one or more visible Guardex sessions
- **THEN** the repo view contains an `Overview` section
- **AND** it contains a `Working now` section above `Idle / thinking`
- **AND** it contains an `Unassigned changes` section when repo drift is not clearly owned by a live session
- **AND** it keeps raw worktree/path trees under a collapsed `Advanced details` section rather than as the default primary view.

### Requirement: Session rows summarize work and risk inline
The VS Code Active Agents companion SHALL render each session row as a compact task-first summary instead of leading with branch or folder grouping.

#### Scenario: Working row answers operator triage questions
- **WHEN** a session appears in `Working now` or `Idle / thinking`
- **THEN** its primary label is the task title or best available task summary
- **AND** its row description includes the agent name, session state, changed-file count when present, lock count when present, and a human-readable freshness label
- **AND** expanding the row reveals recent-change summary, top changed files, and branch/worktree details
- **AND** conflicts, stale state, lock ownership, or refresh deltas appear inline or in the expanded summary without requiring the raw path tree first.

### Requirement: Repo overview summarizes actionable counts
The VS Code Active Agents companion SHALL expose repo-level counts for high-value operator decisions.

#### Scenario: Overview row reports working, idle, unassigned, locked, and conflict counts
- **WHEN** the provider refreshes a repo entry
- **THEN** the overview surface reports working-agent count, idle-agent count, unassigned-change count, locked-file count, and conflict count
- **AND** the repo row and badge tooltip reuse those counts instead of only reporting active/dead totals.
