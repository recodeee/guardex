## ADDED Requirements

### Requirement: readme-multi-agent-mermaid behavior
The README conflict Mermaid diagram SHALL depict a multi-agent collision model, not a two-agent-only model.

#### Scenario: Multiple concurrent agents are visualized
- **WHEN** the README Mermaid diagram is rendered
- **THEN** it shows at least three concurrent agents feeding the same shared target surface
- **AND** the downstream conflict loop remains visible.

#### Scenario: Failure loop remains explicit
- **WHEN** a reader scans the conflict portion of the diagram
- **THEN** they can see conflict/overwrite leading to lost code and rework
- **AND** the cycle loops back to conflict risk.
