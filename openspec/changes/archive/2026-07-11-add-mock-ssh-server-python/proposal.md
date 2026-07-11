## Why

The current Web SSH client requires a real SSH server to test against, creating a dependency on external infrastructure. When developing or demoing without network access to an SSH server, the entire application is untestable. A standalone mock SSH server solves this — it speaks real SSH protocol so the existing Node.js code connects to it unchanged, while providing a controllable fake Linux filesystem for predictable testing.

## What Changes

- Add a new `mock-server/` directory containing a standalone Python SSH server
- The mock server speaks real SSH protocol (via paramiko) on a configurable port
- Provides an in-memory virtual Linux filesystem with ~20 standard top-level directories
- Supports interactive shell with 12 built-in commands (ls, cd, pwd, cat, echo, whoami, id, uname, date, clear, exit, help)
- Supports SFTP for file browsing, upload, download, delete, rename, and directory creation
- Accepts fixed credentials (`mock`/`mock` by default), configurable via YAML/JSON config file
- Auto-generates RSA host key on first run, cached for reuse
- No changes to existing Node.js server or client code

## Capabilities

### New Capabilities
- `mock-ssh-server`: A standalone Python SSH server with virtual filesystem, interactive shell, and SFTP support for testing the Web SSH client without a real SSH server.

### Modified Capabilities

<!-- No existing capabilities are modified -->

## Impact

- **New dependency**: Python 3.8+ and `paramiko` (pure Python SSH implementation with Windows wheels)
- **New directory**: `mock-server/` with 3-4 Python files and a `requirements.txt`
- **No changes** to existing `server/`, `client/`, or test code
- **No changes** to `package.json` or Node.js dependencies
- **Testing**: the mock server is entirely separate — start it, connect via the Web UI with `localhost:<port>`, test everything
