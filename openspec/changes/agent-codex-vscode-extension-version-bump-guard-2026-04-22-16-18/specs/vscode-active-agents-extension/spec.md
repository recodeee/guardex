## MODIFIED Requirements

### Requirement: Active Agents extension installs a visible current plugin version

The Active Agents VS Code companion SHALL expose a higher extension version whenever shipped plugin files change on a branch, and the live/template manifests SHALL stay aligned.

#### Scenario: Plugin edits require a version bump

- **GIVEN** a branch changes any shipped Active Agents extension files under `vscode/guardex-active-agents/**`, `templates/vscode/guardex-active-agents/**`, or `scripts/install-vscode-active-agents-extension.js`
- **WHEN** the focused extension regression suite runs
- **THEN** `vscode/guardex-active-agents/package.json` SHALL declare a version greater than the base branch version
- **AND** `templates/vscode/guardex-active-agents/package.json` SHALL match that same version exactly
