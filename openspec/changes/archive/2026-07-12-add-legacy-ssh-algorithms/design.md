## Context

The SSH connection is established via the `ssh2` npm package's `Client` class. The connection config is built by `sessionManager.buildConnectConfig()` which currently only sets `host`, `port`, `username`, `readyTimeout`, `keepaliveInterval`, `keepaliveCountMax`, and credentials. No `algorithms` option is specified, so ssh2 uses its built-in defaults which exclude many legacy algorithms (e.g., `diffie-hellman-group1-sha1`, CBC ciphers, `ssh-rsa` host keys).

When connecting to an older SSH server like Levinux (Dropbear), the handshake fails because there's no overlap between the algorithms the server supports and what the client offers.

## Goals / Non-Goals

**Goals:**
- Add an `algorithms` configuration to `buildConnectConfig()` with legacy algorithm support
- Control via `SSH_LEGACY_ALGORITHMS=true` environment variable (default: off)
- Keep modern security defaults when the env var is not set

**Non-Goals:**
- Per-session algorithm selection from the frontend UI
- Algorithm auto-detection or fallback retry logic
- Changes to the existing connection UX

## Decisions

### Decision 1: Environment variable toggle, not a UI setting

**Approach:** Add `SSH_LEGACY_ALGORITHMS` env var (default `false`). When `true`, `buildConnectConfig()` prepends legacy algorithms to the default algorithm lists.

**Rationale:** The ssh2 library doesn't export its default algorithm lists directly, but they're well-known from the source code. We hardcode the extended list including both legacy and modern algorithms — ssh2 will negotiate the best mutually-supported algorithm.

**Alternative considered:** Always including legacy algorithms. Rejected because it reduces security posture for users who only connect to modern servers.

**Alternative considered:** UI toggle in the connection form. Rejected because it adds UI complexity for a niche use case.

### Decision 2: Algorithm order — legacy first, modern fallback

**Approach:** List legacy algorithms first, followed by modern defaults. ssh2 picks the first algorithm from its list that the server also supports, so legacy-first ensures old servers find a match quickly.

**Legacy algorithms to add:**

| Category | Algorithms added for legacy mode |
|---|---|
| kex | `diffie-hellman-group1-sha1`, `diffie-hellman-group14-sha1`, `diffie-hellman-group-exchange-sha1` |
| cipher | `aes256-cbc`, `aes192-cbc`, `aes128-cbc`, `3des-cbc`, `blowfish-cbc`, `twofish256-cbc`, `twofish128-cbc` |
| hmac | `hmac-sha1`, `hmac-sha1-96`, `hmac-md5`, `hmac-md5-96` |
| serverHostKey | `ssh-rsa`, `ssh-dss` |

## Risks / Trade-offs

- [Risk] Enabling legacy algorithms reduces cryptographic security → Mitigation: Only enabled when `SSH_LEGACY_ALGORITHMS=true` is explicitly set; the default stays at ssh2's secure defaults
- [Risk] Some legacy algorithms (like `ssh-dss`, `diffie-hellman-group1-sha1`) are known to be weak → Mitigation: Listed last in the priority order; only used if the server doesn't support anything stronger
