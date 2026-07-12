## 1. Fix Context Menu Action Handlers

- [x] 1.1 Fix `_contextUpload()` — save `_contextTarget` before calling `_hideContextMenu()` so the upload path correctly resolves to the right-clicked directory
- [x] 1.2 Fix `_contextDownload()` — save `_contextTarget` before calling `_hideContextMenu()` so the download path correctly resolves to the right-clicked file
- [x] 1.3 Fix `_contextMkdir()` — save `_contextTarget` before calling `_hideContextMenu()` so the new directory is created under the right-clicked directory
- [x] 1.4 Fix `_contextDelete()` — save `_contextTarget` before calling `_hideContextMenu()` so the correct remote path is deleted
- [x] 1.5 Fix `_contextRename()` — save `_contextTarget` before calling `_hideContextMenu()` so the correct remote path is renamed

## 2. Add Download Button to File List Toolbar

- [x] 2.1 Add `_selectedFile` property to track the last-clicked file in the file list (set in `_renderFileList` file click handler)
- [x] 2.2 Add "Download" button to file list toolbar in `_setupFileUpload()` that downloads `_selectedFile`
