## MODIFIED Requirements

### Requirement: System supports SFTP protocol for file operations
The system SHALL use SFTP protocol over SSH for secure file transfer.

#### Scenario: File upload via multipart form
- **WHEN** user selects local file for upload via the file browser toolbar or drag-and-drop
- **THEN** system sends the file as multipart/form-data to the proxy server, which streams the content to the remote server via SFTP write stream

#### Scenario: File upload via context menu
- **WHEN** user right-clicks a directory and selects "Upload"
- **THEN** system prompts file selection, sends the file as multipart/form-data with the target remote directory path, and the proxy server streams the content to the remote server via SFTP

#### Scenario: File download via file list click
- **WHEN** user clicks a file in the file browser list
- **THEN** proxy server creates an SFTP read stream from the remote path and pipes it directly to the HTTP response with appropriate Content-Disposition headers

#### Scenario: File download via context menu
- **WHEN** user right-clicks a file and selects "Download"
- **THEN** proxy server creates an SFTP read stream from the remote path and pipes it directly to the HTTP response with appropriate Content-Disposition headers

### Requirement: System displays transfer progress
The system SHALL show progress indicator during file transfers.

#### Scenario: Large file upload progress
- **WHEN** user uploads file larger than 10MB
- **THEN** system displays percentage progress based on bytes written to the SFTP stream

#### Scenario: Interrupted transfer
- **WHEN** network connection drops during transfer
- **THEN** system shows error and cleans up SFTP connection resources
