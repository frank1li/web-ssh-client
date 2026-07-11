## Context

The Web SSH client uses `ssh2` to connect to real SSH servers. To enable offline development and testing, we need a standalone SSH server that speaks the real SSH protocol but serves a fake Linux filesystem. The mock server must be cross-platform and have zero impact on the existing codebase — the existing Node.js server connects to it as if it were any other SSH server.

Python is chosen over Node.js for the mock because:
- Cross-platform without native compilation issues (paramiko has Windows wheels)
- Easier to run in test/CI environments without a full Node runtime
- Clear separation of concerns from the main application

## Goals / Non-Goals

**Goals:**
- A standalone Python SSH server that accepts SSH connections and SFTP sessions
- In-memory virtual Linux filesystem with standard top-level directories
- Interactive shell with 12 built-in commands for basic navigation and exploration
- Full SFTP support (list, stat, read, write, delete, rename, mkdir)
- Configurable port, credentials, and host key via config file
- Auto-generated RSA host key cached on disk
- No modifications to existing Node.js or client code

**Non-Goals:**
- No support for public key authentication (password-only for mock)
- No real command execution (all commands are shell built-ins)
- No SSH agent forwarding, port forwarding, or tunneling
- No multi-user simulation (single virtual user)
- No disk-persistent filesystem (in-memory, resets on restart)

## Decisions

### Architecture: paramiko ServerInterface + SFTPServerInterface

Use `paramiko.Transport` with a custom `ServerInterface` for SSH connection handling and a custom `SFTPServerInterface` for file operations. This is the standard approach for implementing SSH servers in Python.

**Alternatives considered:**
- **Twisted Conch**: More powerful but heavier dependency, steeper learning curve
- **asyncssh**: Pure async, good but less widespread than paramiko
- **DIY with raw sockets**: Not viable — SSH protocol is complex

### Shell: cooked-mode line input with stream-based I/O

The mock shell operates in "cooked" mode — it echoes characters, handles backspace, buffers input until Enter, then parses and executes the command. This avoids needing a PTY or terminal emulation.

- Incoming data (keystrokes) → buffer + echo → on \r → parse → execute → output + prompt
- ANSI-colored prompt and output for realism
- Command parser splits by whitespace, dispatches to handler functions

### Virtual Filesystem: in-memory tree of Node objects

```
VirtualNode {
    name: str
    is_dir: bool
    content: bytes (file only)
    children: dict[str, VirtualNode] (dir only)
    attrs: { permissions, owner, group, size, mtime }
}
```

- Pre-seeded with ~20 standard Linux directories at `/`
- Each directory contains representative fake files with plausible content
- File contents are static strings/bytes, stored in memory
- `stat` returns synthesized attributes from the node

### Configuration: JSON file with sensible defaults

A `config.json` (or YAML if PyYAML is available) in the `mock-server/` directory:
```json
{
    "host": "0.0.0.0",
    "port": 2222,
    "auth": { "username": "mock", "password": "mock" },
    "host_key": "./host_key"
}
```

### Project structure

```
mock-server/
├── requirements.txt         # paramiko, cryptography
├── mock_server.py           # Entry point: CLI arg parser + server loop
├── virtual_fs.py            # VirtualNode tree, filesystem seed data, FS operations
└── mock_handler.py          # SSH ServerInterface + Shell + SFTP ServerInterface
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| paramiko ServerInterface has subtle API requirements | Base on paramiko's `loopback.py` example (part of official docs) |
| Shell input parsing is basic — no job control, pipes, redirects | MVP explicitly scoped to 12 commands; complex input causes "command not found" |
| SFTP client (Web UI) may expect specific readdir/stat behavior | Test against the actual Web UI file browser flow |
| No PTY means some terminal behaviors differ from real SSH | Prompt and output styled with ANSI codes for visual realism |
| Port 22 requires root on Linux/macOS | Default to 2222, document that 22 needs admin |
