## 1. Setup

- [x] 1.1 Create `mock-server/` directory with `requirements.txt` (paramiko, cryptography)
- [x] 1.2 Add `.gitignore` entry for `mock-server/host_key` and `mock-server/config.json` (if user-modified)

## 2. Virtual Filesystem

- [x] 2.1 Implement `VirtualNode` class with name, is_dir, content, children, and attrs properties
- [x] 2.2 Implement `VirtualFilesystem` class with tree structure, path resolution, and node CRUD operations
- [x] 2.3 Seed filesystem with all standard Linux top-level directories (`/bin`, `/boot`, `/dev`, `/etc`, `/home`, `/lib`, `/media`, `/mnt`, `/opt`, `/proc`, `/root`, `/run`, `/sbin`, `/srv`, `/sys`, `/tmp`, `/usr`, `/var`)
- [x] 2.4 Add representative content files: `/etc/hostname`, `/etc/passwd`, `/etc/hosts`, `/etc/resolv.conf`, `/etc/os-release`, `/proc/cpuinfo`, `/proc/meminfo`, `/proc/version`, `/proc/uptime`, `/home/user/.bashrc`, `/home/user/.profile`
- [x] 2.5 Create `/home/user/documents/readme.txt` with welcome content
- [x] 2.6 Add helper methods for readdir, stat, open/read/close, write, mkdir, rmdir, unlink, rename operations

## 3. Mock SSH Handler

- [x] 3.1 Implement `MockSSHServer` class (paramiko `ServerInterface`) with password auth and channel opening
- [x] 3.2 Implement shell channel handler: cooked-mode input buffering, character echo, backspace handling
- [x] 3.3 Implement command parser and dispatcher for built-in commands
- [x] 3.4 Implement `ls` command with long-format output (`-l` flag)
- [x] 3.5 Implement `cd` and `pwd` commands with working directory tracking
- [x] 3.6 Implement `cat` command with virtual FS file reading
- [x] 3.7 Implement `echo`, `whoami`, `id`, `uname`, `date` commands
- [x] 3.8 Implement `clear` (ANSI escape), `exit` (session close), `help` (list commands)
- [x] 3.9 Implement ANSI-colored shell prompt (`user@mock-server:~$ `)

## 4. Mock SFTP Handler

- [x] 4.1 Implement `MockSFTPServer` class (paramiko `SFTPServerInterface`) with list_folder
- [x] 4.2 Implement stat and lstat operations
- [x] 4.3 Implement open/read/close for file downloads
- [x] 4.4 Implement open/write/close for file uploads
- [x] 4.5 Implement mkdir, rmdir, remove, rename operations

## 5. Server Entry Point

- [x] 5.1 Implement config loading from JSON file with defaults
- [x] 5.2 Implement CLI argument parsing (--port, --host, --config, --host-key)
- [x] 5.3 Implement RSA host key auto-generation and caching
- [x] 5.4 Implement TCP server loop accepting SSH connections
- [x] 5.5 Implement graceful shutdown (SIGINT/SIGTERM handler)
- [x] 5.6 Add logging to stdout with connection/disconnection events

## 6. Testing and Documentation

- [x] 6.1 Add README section in `mock-server/README.md` with usage instructions
- [x] 6.2 Test connection from Web UI (localhost:2222, mock/mock)
- [x] 6.3 Test all 12 shell commands produce expected output
- [x] 6.4 Test SFTP file browsing and file upload/download from Web UI
- [x] 6.5 Test with invalid credentials (should be rejected)
- [x] 6.6 Verify clean shutdown and host key persistence
