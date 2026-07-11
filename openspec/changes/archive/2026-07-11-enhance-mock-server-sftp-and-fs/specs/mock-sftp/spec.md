## ADDED Requirements

### Requirement: SFTP list folder on real filesystem

The SFTP server SHALL list directory contents from a real directory on disk, configurable via `root_dir`.

#### Scenario: List root directory
- **WHEN** client requests `list_folder("/")`
- **THEN** the server returns entries from the configured root directory on disk

#### Scenario: List subdirectory
- **WHEN** client requests `list_folder("/home/user")`
- **THEN** the server returns entries from `<root_dir>/home/user/` on disk

#### Scenario: List non-existent directory
- **WHEN** client requests `list_folder("/nonexistent")`
- **THEN** the server returns `SFTP_NO_SUCH_FILE`

### Requirement: SFTP stat on real filesystem

The SFTP server SHALL return file/directory attributes from the real filesystem.

#### Scenario: Stat existing file
- **WHEN** client requests `stat("/etc/hostname")`
- **THEN** the server returns valid attributes (mode, size, mtime)

#### Scenario: Stat non-existent path
- **WHEN** client requests `stat("/nonexistent")`
- **THEN** the server returns `SFTP_NO_SUCH_FILE`

### Requirement: SFTP open/read/close for file download

The SFTP server SHALL allow reading files from the real filesystem.

#### Scenario: Read existing file
- **WHEN** client opens a file for reading and calls `read()`
- **THEN** the server returns the file content from disk

#### Scenario: Read non-existent file
- **WHEN** client opens a non-existent file for reading without O_CREAT
- **THEN** the server returns `SFTP_NO_SUCH_FILE`

### Requirement: SFTP open/write/close for file upload

The SFTP server SHALL allow writing files to the real filesystem.

#### Scenario: Upload new file
- **WHEN** client opens a file with O_WRONLY|O_CREAT and writes data
- **THEN** the file is created on disk under `<root_dir>/<path>`

#### Scenario: Overwrite existing file
- **WHEN** client opens an existing file for writing and writes data
- **THEN** the file content on disk is replaced

### Requirement: SFTP mkdir/rmdir/remove/rename on real filesystem

The SFTP server SHALL support directory and file management operations on the real filesystem.

#### Scenario: Create directory
- **WHEN** client requests `mkdir("/newdir")`
- **THEN** the directory is created on disk under `<root_dir>/newdir`

#### Scenario: Remove empty directory
- **WHEN** client requests `rmdir("/empty-dir")` on an empty directory
- **THEN** the directory is deleted from disk

#### Scenario: Remove file
- **WHEN** client requests `remove("/file.txt")`
- **THEN** the file is deleted from disk

#### Scenario: Rename file or directory
- **WHEN** client requests `rename("/old", "/new")`
- **THEN** the file/directory is moved on disk

### Requirement: Path safety

The SFTP server SHALL prevent path traversal outside the configured root directory.

#### Scenario: Path traversal attempt
- **WHEN** client requests `stat("/../../../etc/passwd")`
- **THEN** the server safely resolves the path within `<root_dir>` and returns `SFTP_NO_SUCH_FILE` or the file if it exists inside root_dir

### Requirement: Root directory auto-creation

The server SHALL create the root directory on startup if it does not exist.

#### Scenario: First run
- **WHEN** the server starts with a `root_dir` that does not exist
- **THEN** the directory is created automatically
