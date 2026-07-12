## Why

The file tree's right-click context menu hides the Download and Rename options for directories, and the Delete button shows but fails because `sftp.unlink()` does not work on directories. Users need the ability to navigate into a directory via right-click and to delete directories.

## What Changes

- Show Download in context menu for directories — clicking it navigates the file list panel to that directory
- Show Rename in context menu for directories — allows renaming directories on the remote server
- Fix Delete for directories in the context menu — use `sftp.rmdir()` instead of `sftp.unlink()` when the target is a directory
- Add `deleteDirectory` method to `sftpService` for server-side directory deletion

## Capabilities

### New Capabilities
- `directory-context-ops`: Context menu operations (download, rename, delete) on directory nodes in the file tree

### Modified Capabilities
- (none)

## Impact

- **client/public/app.js**: Update `_showContextMenu()` to show Download and Rename for directories; update `_contextDownload()` to navigate into directories; update `_contextDelete()` to pass directory type to the API
- **server/routes/api.js**: Add route for directory deletion (or modify existing delete route to handle both files and directories)
- **server/services/sftpService.js**: Add `deleteDirectory()` method using `sftp.rmdir()`
