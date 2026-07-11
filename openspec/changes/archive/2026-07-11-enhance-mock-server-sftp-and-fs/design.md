## Context

The mock SSH server currently uses a single-channel connection handler: `transport.accept()` returns one channel, and if it's a shell, `ShellHandler.start()` blocks the thread until the session ends. When the Web SSH client's file manager opens an SFTP channel on the same SSH connection, it's never processed. Additionally, the in-memory virtual filesystem (`VirtualFilesystem`) cannot persist uploaded files — they're lost on server restart.

## Goals / Non-Goals

**Goals:**
- Support concurrent shell + SFTP channels on a single SSH connection
- SFTP operations (list, stat, read, write, mkdir, rmdir, remove, rename) on a real filesystem directory
- Configurable root directory via CLI (`--root-dir`) and config.json
- `touch` command in the interactive shell
- Backward compatibility: existing shell commands continue to work unchanged

**Non-Goals:**
- Not replacing the virtual FS entirely — system paths (`/etc`, `/proc`, `/bin`) remain virtual
- No authentication changes
- No Windows/Unix path compatibility layer (uses OS-native paths)

## Decisions

### 1. Multi-channel connection handling

**Decision:** Restructure `handle_connection()` to run shell in a daemon thread and loop accepting additional channels for SFTP.

```
handle_connection()
├── transport.start_server()
├── channel = transport.accept()    // first channel
├── if shell → start ShellHandler in daemon thread
├── loop:
│   ├── channel = transport.accept(timeout=2)
│   ├── if sftp → start SFTPServer in daemon thread
│   ├── if timeout and no live threads → break
│   └── if channel closed → break
└── transport.close()
```

**Why:** paramiko's `transport.accept()` can be called repeatedly to accept multiple channels on the same connection. Running each handler in a thread allows concurrent shell + SFTP. A 2-second accept timeout lets us detect when all channels are closed.

**Alternatives considered:**
- Single-thread with select/poll: Not necessary — threads are simpler and the connection count is low (one user at a time).
- Fork per channel: Overkill for a mock server.

### 2. Hybrid filesystem — virtual overlay + real FS

**Decision:** Create a `HybridFilesystem` class that wraps both `VirtualFilesystem` (read-only overlay for system paths) and a real disk path (read-write for all paths).

Lookup order:
1. Check real FS path first → if file exists, return it
2. Fall back to virtual FS

Write operations always go to the real FS. This ensures uploaded files persist on disk and shadow virtual FS entries with the same name.

```
HybridFilesystem
├── virtual: VirtualFilesystem  (in-memory, pre-seeded)
├── root_dir: str               (path to real directory on disk)
│
├── readdir(path) → merge virtual + real directory listings
├── read(path) → real FS first, fall back to virtual
├── write(path) → real FS only
├── stat(path) → real FS first, fall back to virtual
└── mkdir/rmdir/unlink/rename → real FS only
```

**Why:** This gives us the best of both worlds — users see a realistic Linux environment with `/etc`, `/proc`, etc., while uploaded/downloaded files are real on-disk files that persist and can be verified.

**Alternatives considered:**
- Pure virtual FS: Can't persist uploads. ❌ (current state, doesn't meet requirements)
- Pure real FS: Would need to create fake Linux files on disk at startup. Messy — `/proc/cpuinfo` can't be a real file in a real /proc. ❌
- Separate FS per subsystem (virtual for shell, real for SFTP): Desynchronized — files uploaded via SFTP would be invisible in shell. ❌

### 3. Root directory configuration

**Decision:** Add `--root-dir` CLI flag and `root_dir` config.json key. Default to `./mock-root` relative to the mock-server directory. The directory is created on startup if it doesn't exist.

### 4. touch command

**Decision:** Simple — resolve the path, create empty file if not exists, update mtime if exists. Register in the command dispatch table and add to `_COMMANDS` and `help`.

## Risks / Trade-offs

- **Concurrency**: Shell and SFTP handlers run in separate threads accessing the same filesystem. For a mock/testing server this is acceptable — no locking needed.
- **Relative paths in real FS**: The hybrid FS must normalize paths to prevent escaping the root directory. The real FS access should use `os.path.realpath()` and verify it stays within `root_dir`.
- **Windows path separators**: Virtual paths use `/` internally. When mapping to real FS, `/` → `os.sep` conversion is needed on Windows.
