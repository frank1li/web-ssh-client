## 1. Show Download and Rename for Directories in Context Menu

- [x] 1.1 Update `_showContextMenu()` in `client/public/app.js` — remove the `display: none` guards for `download` and `rename` when type is `directory`

## 2. Make Download on Directory Navigate File List

- [x] 2.1 Update `_contextDownload()` in `client/public/app.js` — when target type is `directory`, call `_loadFileList(target.path)` instead of returning early

## 3. Add Backend Directory Deletion Support

- [x] 3.1 Add `deleteDirectory()` method to `server/services/sftpService.js` using `sftp.rmdir()`
- [x] 3.2 Add DELETE `/sessions/:id/directories` route to `server/routes/api.js` that calls `deleteDirectory()`

## 4. Make Delete Work for Directories

- [x] 4.1 Update `_contextDelete()` in `client/public/app.js` — when target type is `directory`, call the DELETE `/directories` endpoint instead of the files endpoint
