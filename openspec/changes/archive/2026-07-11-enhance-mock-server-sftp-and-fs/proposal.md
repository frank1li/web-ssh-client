## Why

The mock SSH server's SFTP support is non-functional for file browsing because the single-channel architecture blocks SFTP channels while the shell is active. Upload/download is impossible since the in-memory virtual filesystem doesn't persist to disk. Additionally, basic commands like `touch` are missing, limiting realistic testing.

## What Changes

- Restructure connection handler to support multiple channels (shell + SFTP) on the same SSH connection
- Replace the purely in-memory virtual FS with a hybrid: virtual FS for system paths (read-only overlay) + real filesystem on disk for user-writable paths
- Add `--root-dir` CLI option and `root_dir` config.json key to specify a temp directory as the real FS root
- Add `touch` command to the interactive shell

## Capabilities

### New Capabilities
- `mock-sftp`: SFTP file operations (list, stat, read, write, mkdir, rmdir, remove, rename) on a real filesystem directory with configurable root path
- `mock-shell-commands`: Extended shell command set including `touch`

### Modified Capabilities

None (this is the first spec-driven change for the mock server).

## Impact

- `mock-server/mock_handler.py`: Rewrite `handle_connection()` to accept multiple channels; add `touch` command to `ShellHandler`
- `mock-server/mock_server.py`: Add `--root-dir` CLI flag and config loading
- `mock-server/virtual_fs.py`: Add hybrid FS layer that delegates to real disk for user paths
- `mock-server/README.md`: Document new features and configuration options
