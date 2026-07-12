## ADDED Requirements

### Requirement: Confirmation before closing session tab
The system SHALL show a confirmation dialog before closing an SSH session when the user clicks the tab close button.

#### Scenario: User confirms close
- **WHEN** user clicks the close button on a session tab
- **AND** clicks "OK" on the confirmation dialog
- **THEN** the session SHALL be closed and the tab removed

#### Scenario: User cancels close
- **WHEN** user clicks the close button on a session tab
- **AND** clicks "Cancel" on the confirmation dialog
- **THEN** the session SHALL remain open and the tab SHALL remain visible
