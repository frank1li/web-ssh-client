## ADDED Requirements

### Requirement: touch command

The shell SHALL support a `touch` command that creates an empty file or updates the modification time of an existing file.

#### Scenario: Create new file with touch
- **WHEN** user runs `touch /home/user/newfile.txt`
- **THEN** an empty file `/home/user/newfile.txt` is created in the virtual filesystem

#### Scenario: Update existing file mtime
- **WHEN** user runs `touch /home/user/.bashrc` on an existing file
- **THEN** the file's modification time is updated to the current time

#### Scenario: Touch in current directory
- **WHEN** user runs `touch newfile.txt` from `/home/user`
- **THEN** the file `/home/user/newfile.txt` is created

#### Scenario: Touch with absolute path
- **WHEN** user runs `touch /tmp/test.tmp`
- **THEN** the file `/tmp/test.tmp` is created

### Requirement: touch command appears in help

The `touch` command SHALL be listed in the help output alongside existing commands.

#### Scenario: Help lists touch
- **WHEN** user runs `help`
- **THEN** the output includes `touch` in the list of available commands
