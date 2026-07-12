## Why

Some SSH servers (like Levinux with Dropbear) use legacy key exchange, cipher, and host key algorithms that the `ssh2` library's default algorithm list no longer includes. Connecting to such servers fails with "no matching key exchange algorithm" or similar handshake errors.

## What Changes

- Add an `algorithms` configuration to the SSH connect config in `buildConnectConfig()` that extends the default algorithm list with common legacy algorithms (kex, cipher, hmac, serverHostKey)
- Make the legacy algorithm support toggleable via an environment variable (`SSH_LEGACY_ALGORITHMS=true`) so users can choose between maximum security (default) and maximum compatibility (legacy mode)

## Capabilities

### New Capabilities
- `legacy-ssh-algorithms`: Support for connecting to older SSH servers with legacy key exchange, cipher, HMAC, and host key algorithms

### Modified Capabilities
- (none)

## Impact

- **server/models/sessionManager.js**: Update `buildConnectConfig()` to include legacy algorithms when `SSH_LEGACY_ALGORITHMS=true` env var is set
