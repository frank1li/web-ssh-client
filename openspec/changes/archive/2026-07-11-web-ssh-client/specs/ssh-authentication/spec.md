# SSH Authentication Capability

## ADDED Requirements

### Requirement: System supports password authentication
The system SHALL allow users to authenticate using SSH password.

#### Scenario: Password entry
- **WHEN** user enters password in input field
- **THEN** system transmits password securely over SSH protocol

#### Scenario: Password visibility toggle
- **WHEN** user clicks password visibility toggle
- **THEN** system shows/hides password characters

### Requirement: System supports SSH key authentication
The system SHALL allow users to authenticate using SSH public/private key pairs.

#### Scenario: Key selection
- **WHEN** user selects SSH key from dropdown
- **THEN** system uses corresponding private key for authentication

#### Scenario: Key import
- **WHEN** user uploads public key file
- **THEN** system stores key for future connections

### Requirement: System supports custom SSH port
The system SHALL allow users to specify non-standard SSH port.

#### Scenario: Default port
- **WHEN** user does not specify port
- **THEN** system uses default port 22

#### Scenario: Custom port
- **WHEN** user enters custom port number
- **THEN** system connects to specified port

---

# SSH Session Manager Capability

## ADDED Requirements

### Requirement: System supports multiple simultaneous sessions
The system SHALL allow users to maintain multiple SSH connections simultaneously.

#### Scenario: New session
- **WHEN** user creates new SSH connection
- **THEN** system opens new tab for the session

#### Scenario: Session switching
- **WHEN** user clicks on session tab
- **THEN** system switches focus to selected session

### Requirement: System persists session metadata
The system SHALL save connection configuration for each session.

#### Scenario: Session reload
- **WHEN** user refreshes browser page
- **THEN** system restores all saved session configurations

#### Scenario: Session deletion
- **WHEN** user closes session tab
- **THEN** system removes session metadata after confirmation

### Requirement: System handles connection reconnection
The system SHALL automatically reconnect when network connection drops.

#### Scenario: Network interruption
- **WHEN** network connection drops unexpectedly
- **THEN** system attempts reconnection with exponential backoff

#### Scenario: Reconnection success
- **WHEN** reconnection attempt succeeds
- **THEN** system restores terminal state and notifies user

### Requirement: System displays connection status
The system SHALL show real-time connection status for each session.

#### Scenario: Connected state
- **WHEN** SSH connection is active
- **THEN** system displays "Connected" indicator with timestamp

#### Scenario: Disconnected state
- **WHEN** SSH connection drops
- **THEN** system displays "Disconnected" indicator and reconnection status
