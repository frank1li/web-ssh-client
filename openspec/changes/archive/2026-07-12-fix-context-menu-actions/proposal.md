## Why

The file browser's right-click context menu actions (upload, download, mkdir, delete, rename) are all broken because `_hideContextMenu()` clears the context target before the action handler reads it. Additionally, the file list toolbar lacks a download button, making it impossible to download files without using the broken context menu or the awkward click-to-confirm flow.

## What Changes

- Fix `_hideContextMenu()` call ordering in all context action handlers (`_contextUpload`, `_contextDownload`, `_contextMkdir`, `_contextDelete`, `_contextRename`) — save `_contextTarget` before hiding the menu
- Add a "Download" button to the file list toolbar that downloads the currently selected file
- Ensure the upload toolbar button and context menu correctly use the target directory path

## Capabilities

### New Capabilities
- `file-browser-context`: Context menu operations (upload, download, mkdir, delete, rename) on the file tree, with correct path resolution

### Modified Capabilities
- (none)

## Impact

- **client/public/app.js**: Fix `_contextUpload`, `_contextDownload`, `_contextMkdir`, `_contextDelete`, `_contextRename` methods; add download toolbar button
