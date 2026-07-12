## 1. Server Dependency Setup

- [x] 1.1 Install `multer` npm package for multipart/form-data parsing

## 2. Fix Server Upload Route

- [x] 2.1 Add multer configuration (MemoryStorage, file size limit) to `server/routes/api.js`
- [x] 2.2 Modify the POST `/upload` route to use multer middleware, accept `remotePath` from form fields and `file` buffer from multer, remove the `localPath` requirement
- [x] 2.3 Add `uploadFromBuffer()` method to `server/services/sftpService.js` that accepts a Buffer, creates a readable stream from it, and pipes to the SFTP write stream with progress tracking

## 3. Fix Server Download Route

- [x] 3.1 Modify the POST `/download` route in `server/routes/api.js` to stream the SFTP file directly to the HTTP response (set Content-Disposition, Content-Type, Content-Length headers; pipe SFTP read stream to `res`)
- [x] 3.2 Remove the server-local `fs.createWriteStream` path from `server/services/sftpService.js` download method (or keep the method but the route no longer calls it for local disk write)

## 4. Fix Frontend Download Handler

- [x] 4.1 Update `_downloadFile()` in `client/public/app.js` to handle the streamed binary response from the POST `/download` endpoint (the response is now the actual file content instead of JSON)

## 5. Verification

- [ ] 5.1 Test upload via file browser toolbar button — file appears on remote server
- [ ] 5.2 Test upload via right-click context menu — file appears in the correct remote directory
- [ ] 5.3 Test upload via drag-and-drop — file appears on remote server
- [ ] 5.4 Test download via file list click — browser downloads the correct file content
- [ ] 5.5 Test download via right-click context menu — browser downloads the correct file content (regression check)
- [ ] 5.6 Verify error handling for missing session, missing file, and disconnected state
