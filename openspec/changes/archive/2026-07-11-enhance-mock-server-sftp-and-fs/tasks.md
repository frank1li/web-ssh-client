## 1. Setup and Configuration

- [x] 1.1 Add `--root-dir` / `--root` CLI argument to `build_parser()` in `mock_server.py`
- [x] 1.2 Add `root_dir` config key to `_DEFAULT_CONFIG` and `load_config()` merge logic
- [x] 1.3 Add `--root-dir` to README usage section

## 2. Hybrid Filesystem

- [x] 2.1 Implement `HybridFilesystem` class wrapping `VirtualFilesystem` + real disk path
- [x] 2.2 Implement `readdir()` merging virtual and real directory listings
- [x] 2.3 Implement `stat()` / `read()` with real-FS-first, virtual-FS-fallback lookup
- [x] 2.4 Implement `write()`, `mkdir()`, `rmdir()`, `unlink()`, `rename()` delegating to real FS
- [x] 2.5 Implement path safety check preventing traversal outside root directory
- [x] 2.6 Add `normalize_path()`, `exists()`, `is_dir()`, `is_file()` delegation methods

## 3. Multi-Channel Connection Handling

- [x] 3.1 Restructure `handle_connection()` to run shell in daemon thread
- [x] 3.2 Add accept loop accepting additional channels (SFTP)
- [x] 3.3 Add thread tracking and clean shutdown when all channels close
- [x] 3.4 Update `MockSSHServer` to reset event per-channel

## 4. SFTP on Real Filesystem

- [x] 4.1 Convert `MockSFTPServer` to use `HybridFilesystem` instead of `VirtualFilesystem`
- [x] 4.2 Update `MockSFTPHandle.read()` to read from real file handle (not in-memory node)
- [x] 4.3 Update `MockSFTPHandle.write()` to write to real file handle
- [x] 4.4 Update `list_folder()` to return entries from hybrid FS
- [x] 4.5 Update `stat()`/`lstat()` to return attributes from hybrid FS
- [x] 4.6 Update `open()` to create/open real files on disk
- [x] 4.7 Update `mkdir()`/`rmdir()`/`remove()`/`rename()` to operate on real FS

## 5. Touch Command

- [x] 5.1 Implement `_cmd_touch()` in `ShellHandler` (create empty file or update mtime)
- [x] 5.2 Register `touch` in the command dispatch table and `_COMMANDS` string
- [x] 5.3 Add `touch` to help output and README command table

## 6. Testing

- [x] 6.1 Test multi-channel: connect SFTP while shell is active, list root directory
- [x] 6.2 Test file upload via SFTP and verify it appears on disk
- [x] 6.3 Test file download via SFTP from the real filesystem
- [x] 6.4 Test `touch` command creates new file and updates mtime on existing file
- [x] 6.5 Test path traversal prevention (e.g., `../../../etc/passwd`)
- [x] 6.6 Test with custom `--root-dir` pointing to a non-existent path (auto-creation)
