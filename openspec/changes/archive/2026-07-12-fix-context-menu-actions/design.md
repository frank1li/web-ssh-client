## Context

The file browser's context menu and toolbar provide file operations (upload, download, mkdir, delete, rename) on the remote server via SFTP. All context menu actions share a common bug: `_hideContextMenu()` is called before reading `this._contextTarget`, causing the target path to always be `null`. Additionally, the file list toolbar lacks a download button — the only download mechanism is via clicking a file (with an extra confirm dialog) or the broken context menu.

The fix is limited to the frontend `client/public/app.js`; no server-side changes are needed since the API routes already work correctly.

## Goals / Non-Goals

**Goals:**
- Fix all 5 context menu actions so they correctly use the right-click target's path
- Add a Download button to the file list toolbar for the currently visible directory
- Ensure the existing Upload toolbar button continues to work correctly

**Non-Goals:**
- No server-side API changes
- No restructuring of the context menu system
- No drag-and-drop download
- No multi-file selection or batch operations

## Decisions

### Decision 1: Save `_contextTarget` before hiding the menu

**Approach:** In each context action handler, read `this._contextTarget` into a local variable **before** calling `this._hideContextMenu()`.

```js
// Before (broken):
_contextUpload() {
    this._hideContextMenu();          // _contextTarget = null
    const target = this._contextTarget;  // target is null
    ...
}

// After (fixed):
_contextUpload() {
    const target = this._contextTarget;  // save first
    this._hideContextMenu();
    ...
}
```

**Alternative considered:** Modify `_hideContextMenu()` to not clear `_contextTarget`. Rejected because it would leave stale state that could cause subtle bugs if `_showContextMenu` isn't called before the next action.

**Files affected:** `client/public/app.js`

### Decision 2: Add Download button to file list toolbar

**Approach:** Add a "Download" button next to the existing "Upload" button in the file list toolbar (inside `_setupFileUpload()`). The button triggers `_downloadFile()` for the currently selected file in the file list.

The download uses `this.currentFilePath` combined with the filename from `_downloadFile` to construct the remote path. Since `_downloadFile` already handles path construction correctly from `currentFilePath`, the button can call `_downloadFile` with an input prompt or better — use a hidden "current selection" state.

**Better approach:** Keep it simple. When the download button is clicked, if there's a selected file (via `this.currentFilePath` and the last clicked file), call the existing `_downloadFile()` method. Since there's no explicit "selected file" state in the file list, the simplest UX is to either:
1. Have the button read `currentFilePath` and prompt for filename, or
2. Track the last-clicked filename in `_renderFileList`

**Chosen approach:** Option 2 — add a `_selectedFile` property that tracks which file was last clicked in the file list, then the download button uses it. This avoids an extra prompt dialog and feels natural.

**Files affected:** `client/public/app.js`

## Risks / Trade-offs

- **No risk of regression** — the context menu fix only reorders existing operations; the download button is an addition that doesn't affect existing upload/delete/rename flows
- **Context menu path depends on tree node path construction** — if a future change modifies how tree paths are built, context menu paths could break. This is mitigated by the path logic being centralized in `_renderTreeNode`.
