## Why

SFTP file upload and download are broken in the web SSH client. Upload returns "localPath and remotePath required" error because the server cannot parse FormData (missing multer middleware). Download via file list click has no effect — the server writes the file to its own local disk and returns JSON, while the frontend expects a binary blob. These are core features of the file transfer module that must work for the product to be usable.

## What Changes

- Add `multer` middleware to the Express server to handle multipart/form-data file upload
- Fix the upload flow: receive uploaded file binary via multer, write to temp location, then stream through SFTP to remote host
- Fix the POST `/download` endpoint: stream SFTP file contents directly in the HTTP response (matching the approach used by the streaming `GET /download-file` endpoint)
- Fix the frontend `_downloadFile()` to properly receive and trigger browser download of the streamed binary response
- Keep the existing `GET /download-file` streaming endpoint as-is — it works correctly for right-click context menu downloads

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `ssh-file-transfer`: Fix file upload and download implementations. Upload endpoint needs to accept multipart form data and stream through SFTP. Download endpoint needs to stream file contents in response instead of saving to server local disk.

## Impact

- **Server**: Add `multer` npm dependency; modify `api.js` upload route to use multer; modify `api.js` download route to stream response; modify `sftpService.js` to support streaming write from buffer/temp file
- **Frontend**: Fix `_downloadFile()` to handle binary stream response correctly
- No breaking API changes — the HTTP interface contract remains the same
