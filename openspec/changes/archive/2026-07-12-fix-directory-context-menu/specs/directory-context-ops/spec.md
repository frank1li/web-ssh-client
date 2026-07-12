## ADDED Requirements

### Requirement: Download on directory navigates file list
When the user right-clicks a directory in the file tree and selects "Download", the file list panel SHALL navigate to that directory.

#### Scenario: Navigate into directory via Download menu
- **WHEN** user right-clicks directory `/home/jianqli/` in the file tree
- **AND** selects "Download" from the context menu
- **THEN** the file list panel SHALL display the contents of `/home/jianqli/`

### Requirement: Rename on directory renames the directory
When the user right-clicks a directory in the file tree and selects "Rename", the directory SHALL be renamed on the remote server.

#### Scenario: Rename directory via context menu
- **WHEN** user right-clicks directory `/home/jianqli/projects` in the file tree
- **AND** selects "Rename" from the context menu
- **AND** enters new name `archived-projects`
- **THEN** the directory SHALL be renamed to `/home/jianqli/archived-projects`

### Requirement: Delete directory removes remote directory
When the user right-clicks a directory in the file tree and selects "Delete", the directory SHALL be deleted from the remote server. The operation SHALL use `sftp.rmdir()` which requires the directory to be empty.

#### Scenario: Delete empty directory via context menu
- **WHEN** user right-clicks empty directory `/home/jianqli/tmp` in the file tree
- **AND** selects "Delete" from the context menu
- **AND** confirms the deletion prompt
- **THEN** directory `/home/jianqli/tmp` SHALL be deleted from the remote server

#### Scenario: Delete non-empty directory shows error
- **WHEN** user right-clicks non-empty directory `/home/jianqli/projects` in the file tree
- **AND** selects "Delete" from the context menu
- **AND** confirms the deletion prompt
- **THEN** the system SHALL show an error message indicating the directory is not empty
