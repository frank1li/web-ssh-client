## ADDED Requirements

### Requirement: Legacy SSH algorithm support via environment variable
The system SHALL support connecting to older SSH servers by enabling legacy algorithms through the `SSH_LEGACY_ALGORITHMS` environment variable. When set to `true`, the SSH client SHALL include legacy key exchange, cipher, HMAC, and host key algorithms in its negotiation list.

#### Scenario: Connect to legacy server with legacy algorithms enabled
- **WHEN** environment variable `SSH_LEGACY_ALGORITHMS=true` is set
- **AND** the user connects to an older SSH server (e.g., Levinux running Dropbear)
- **THEN** the SSH handshake SHALL complete successfully using a mutually-supported algorithm

#### Scenario: Connect to legacy server with default settings
- **WHEN** environment variable `SSH_LEGACY_ALGORITHMS` is not set or set to `false`
- **AND** the user connects to an older SSH server (e.g., Levinux running Dropbear)
- **THEN** the SSH handshake SHALL fail with an algorithm negotiation error (the default secure behavior)

#### Scenario: Connect to modern server with legacy mode enabled
- **WHEN** environment variable `SSH_LEGACY_ALGORITHMS=true` is set
- **AND** the user connects to a modern SSH server (e.g., OpenSSH 8+)
- **THEN** the SSH handshake SHALL complete successfully using the best mutually-supported algorithm
