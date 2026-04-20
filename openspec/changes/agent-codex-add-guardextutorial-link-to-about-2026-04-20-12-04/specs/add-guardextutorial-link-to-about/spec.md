## ADDED Requirements

### Requirement: add-guardextutorial-link-to-about behavior
The system SHALL expose `https://guardextutorial.com` on the frontend How-it-works page and in npm homepage metadata.

#### Scenario: Frontend brand subtitle link
- **WHEN** a user opens the frontend How-it-works page
- **THEN** the GuardeX subtitle includes a clickable `https://guardextutorial.com` link
- **AND** clicking it opens in a new tab/window safely (`rel="noopener noreferrer"`).

#### Scenario: npm homepage metadata
- **WHEN** package metadata is read from root `package.json`
- **THEN** the `homepage` field equals `https://guardextutorial.com`
- **AND** npm publish metadata reflects the same URL after the next publish.
