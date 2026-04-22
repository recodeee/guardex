## MODIFIED Requirements

### Requirement: Module seams mirror operational responsibility
The CLI SHALL keep version comparison, interactive stdin reading, and JSONC parsing in single-sourced shared helpers instead of redefining custom parser logic in command modules.

#### Scenario: Toolchain and release flows reuse the same version/stdin helpers
- **WHEN** maintainers inspect `src/toolchain/index.js` and `src/cli/main.js`
- **THEN** semver comparison and interactive stdin line reading come from shared helpers under `src/core`
- **AND** `src/toolchain/index.js` and `src/cli/main.js` do not reintroduce local copies of those helpers.

#### Scenario: Scaffold JSONC parsing uses a standards-based parser
- **WHEN** Guardex reads repo-owned JSONC-style files such as shared VS Code settings
- **THEN** comments and trailing commas are parsed through `jsonc-parser`
- **AND** escaped string content is preserved without custom comment-stripping logic.
