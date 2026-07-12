## Context

The web SSH client has SFTP file transfer capabilities implemented but broken. Analysis of the code reveals:

- **Upload**: The frontend sends files via `FormData` (multipart/form-data), but the Express server only has `express.json()` middleware with no multipart parser (`multer`). This causes `req.body` to be empty, triggering the "localPath and remotePath required" error. Additionally, even if parsed, `sftpService.uploadFile()` reads from a server-local path via `fs.createReadStream(localPath)` — it expects the file already on the server's filesystem, not an uploaded binary.

- **Download** (file list click): The `POST /api/sessions/:id/download` endpoint downloads the remote file to the server's local disk (`fs.createWriteStream(localPath)`), then returns `res.json()` — the actual file content never reaches the browser. The frontend then calls `res.blob()` on the JSON response, producing a corrupted download.

- **Download** (right-click context menu): Uses `GET /api/sessions/:id/download-file?path=...` which streams the SFTP read stream directly to the HTTP response — this works correctly.

## Goals / Non-Goals

**Goals:**
- Fix file upload: support multipart/form-data, stream uploaded file content through SFTP to remote host
- Fix file list click download: stream remote file content directly in HTTP response body
- Keep right-click context menu download working (already correct)

**Non-Goals:**
- No changes to the file browser UI or context menu
- No changes to directory listing, delete, rename, mkdir operations
- No changes to WebSocket/terminal functionality
- No changes to the mock SSH server

## Decisions

1. **Add `multer` for file upload parsing** — Multer is the standard Express multipart middleware. It handles file buffering to `req.file.buffer`, which we can stream into the SFTP write stream. Alternative (busboy) is lower-level; multer is more ergonomic for this use case.

2. **Upload: stream from memory via multer buffer** — `multer` stores uploaded file in `req.file.buffer` (MemoryStorage). We'll create a readable stream from the buffer and pipe it to `sftp.createWriteStream(remotePath)`. Alternative (DiskStorage + `fs.createReadStream`) adds unnecessary I/O; in-memory is simpler and sufficient for typical web file sizes. If large-file support becomes an issue later, switch to DiskStorage.

3. **Download: switch to streaming response** — The POST `/download` endpoint should mirror the existing `GET /download-file` streaming approach: create an SFTP read stream, pipe it directly to `res`, and set appropriate `Content-Disposition` and `Content-Type` headers. Remove the server-local `fs.createWriteStream` path entirely.

4. **Consolidate download paths? No** — Keep both code paths (right-click uses GET, file list click uses POST). They serve different UI entry points. Both should use the same streaming mechanism under the hood. The POST variant is useful for programmatic clients that need to send extra parameters.

## Risks / Trade-offs

- [Memory pressure] `multer` with `MemoryStorage` buffers entire upload in RAM. For very large files (>500MB), this could cause issues. Mitigation: configure multer with a reasonable `fileSize` limit (e.g., 1GB) and consider switching to `DiskStorage` if needed later.
- [SFTP stream reliability] Network interruption during upload/download could leave the transfer in an unknown state. Mitigation: the existing `stream.on('error')` handlers clean up resources; the proxy server's session timeout handles stale connections.
