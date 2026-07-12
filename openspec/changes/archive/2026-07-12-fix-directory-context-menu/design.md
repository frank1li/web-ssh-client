## Context

The file tree context menu currently hides Download and Rename options when right-clicking a directory node, and the Delete option fails because the backend `sftpService.deleteFile()` uses `sftp.unlink()` which only works on files, not directories. These issues were identified during testing after the previous `fix-context-menu-actions` change.

The scope is limited to three changes in the context menu behavior for directory nodes, plus a new backend method for directory deletion.

## Goals / Non-Goals

**Goals:**
- Show Download in context menu for directories — clicking navigates the file list to that directory
- Show Rename in context menu for directories — allows renaming remote directories
- Delete works for directories — uses `sftp.rmdir()` on the backend

**Non-Goals:**
- Recursive directory deletion (rmdir only works on empty directories)
- Drag-and-drop improvements
- Changes to the file list panel

## Decisions

### Decision 1: Download on directory navigates the file list

**Approach:** When `_contextDownload()` is called with a directory target, instead of returning early (current behavior), call `_loadFileList(target.path)` to navigate the file list panel into that directory. This matches user expectation of "go into this directory to browse files."

**Alternative considered:** Downloading a directory as a zip/tar archive. Rejected because it adds significant complexity (streaming, compression, temp files) beyond the current scope.

### Decision 2: Directory deletion uses existing API route with type-aware backend

**Approach:** Add a `deleteDirectory()` method to `sftpService` using `sftp.rmdir()`. The frontend `_contextDelete()` checks `target.type` — if `directory`, calls `/api/sessions/:id/directories` with `DELETE` method; if `file`, uses the existing `/api/sessions/:id/files` DELETE route.

**Alternative considered:** Modifying the existing DELETE `/files` route to detect directories. Rejected because it's cleaner to keep the separation — adding a new route `/directories` for directory-specific operations.

**Alternative 2:** Using a single delete route that checks the type server-side. Rejected because the frontend already knows the type from the context target, and explicit routes are more maintainable.

### Decision 3: Rename for directories uses existing rename route

**Approach:** The existing `/rename` API route already handles both files and directories (uses `sftp.rename()` which works on both). Only the frontend visibility guard needs to be removed.

## Risks / Trade-offs

- [Risk] `sftp.rmdir()` only works on empty directories → Mitigation: Error message will indicate "Directory not empty" if the user tries to delete a non-empty directory
- [Risk] Navigating file list via Download context menu might be unexpected → Mitigation: Menu label stays "Download" which implies "access contents"
