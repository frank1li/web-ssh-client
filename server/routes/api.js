const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const sessionManager = require('../models/sessionManager');
const sshHandler = require('../services/sshHandler');
const sftpService = require('../services/sftpService');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/sessions - Create new session
router.post('/sessions', (req, res) => {
  try {
    const { hostname, port, username, authType, metadata } = req.body;
    const session = sessionManager.createSession({ hostname, port, username, authType, metadata });
    logger.info(`Session created: ${session.id}`, { hostname, username, port });
    res.json(session);
  } catch (err) {
    const status = err.message.includes('Maximum') ? 429 : 400;
    logger.warn('Session creation failed', { error: err.message });
    res.status(status).json({ error: err.message });
  }
});

// GET /api/sessions - List all sessions
router.get('/sessions', (req, res) => {
  res.json(sessionManager.listSessions());
});

// GET /api/sessions/:id - Get session details
router.get('/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// DELETE /api/sessions/:id - Delete session
router.delete('/sessions/:id', (req, res) => {
  const id = req.params.id;
  logger.sshInfo(id, 'Deleting session');
  sshHandler.disconnect(id);
  const deleted = sessionManager.deleteSession(id);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session deleted' });
});

// POST /api/sessions/:id/connect - Connect with password
router.post('/sessions/:id/connect', async (req, res) => {
  const id = req.params.id;
  try {
    const { authType, password, privateKey, passphrase } = req.body;

    logger.sshInfo(id, 'API connect request', { authType });

    if (authType === 'key') {
      await sshHandler.connectWithKey(id, { privateKey, passphrase });
    } else {
      await sshHandler.connectWithPassword(id, { password });
    }

    res.json({ success: true, sessionId: id });
  } catch (err) {
    logger.sshError(id, 'API connect failed', { error: err.message });
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sessions/:id/disconnect
router.post('/sessions/:id/disconnect', (req, res) => {
  const id = req.params.id;
  logger.sshInfo(id, 'API disconnect request');
  sshHandler.disconnect(id);
  res.json({ message: 'Disconnected' });
});

// GET /api/sessions/:id/status
router.get('/sessions/:id/status', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ status: session.status, lastActivity: session.lastActivity, error: session.error });
});

// ============================================================
// SFTP Routes
// ============================================================

// GET /api/sessions/:id/files?path=/ - List directory
router.get('/sessions/:id/files', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const remotePath = req.query.path || '/';
    const files = await sftpService.listDirectory(req.params.id, rawSession.conn, remotePath);
    res.json({ path: remotePath, files });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sessions/:id/upload - Upload file
router.post('/sessions/:id/upload', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const { localPath, remotePath } = req.body;
    if (!localPath || !remotePath) {
      return res.status(400).json({ error: 'localPath and remotePath required' });
    }

    await sftpService.uploadFile(req.params.id, rawSession.conn, localPath, remotePath);
    res.json({ message: 'Upload complete', remotePath });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sessions/:id/download - Download file
router.post('/sessions/:id/download', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const { remotePath, localPath } = req.body;
    if (!remotePath || !localPath) {
      return res.status(400).json({ error: 'remotePath and localPath required' });
    }

    await sftpService.downloadFile(req.params.id, rawSession.conn, remotePath, localPath);
    res.json({ message: 'Download complete', localPath });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sessions/:id/mkdir - Create directory
router.post('/sessions/:id/mkdir', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const { remotePath } = req.body;
    if (!remotePath) return res.status(400).json({ error: 'remotePath required' });

    await sftpService.createDirectory(req.params.id, rawSession.conn, remotePath);
    res.json({ message: 'Directory created', remotePath });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/sessions/:id/files - Delete file
router.delete('/sessions/:id/files', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const { remotePath } = req.body;
    if (!remotePath) return res.status(400).json({ error: 'remotePath required' });

    await sftpService.deleteFile(req.params.id, rawSession.conn, remotePath);
    res.json({ message: 'File deleted', remotePath });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sessions/:id/rename - Rename file or directory
router.post('/sessions/:id/rename', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });

    await sftpService.rename(req.params.id, rawSession.conn, oldPath, newPath);
    res.json({ message: 'Rename complete', oldPath, newPath });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/sessions/:id/download-file?path=... - Stream file download
router.get('/sessions/:id/download-file', async (req, res) => {
  try {
    const rawSession = sessionManager.getRawSession(req.params.id);
    if (!rawSession) return res.status(404).json({ error: 'Session not found' });
    if (!rawSession.conn || rawSession.status !== 'connected') {
      return res.status(400).json({ error: 'Session not connected' });
    }

    const remotePath = req.query.path;
    if (!remotePath) return res.status(400).json({ error: 'path query parameter required' });

    const filename = remotePath.split('/').pop() || 'download';
    const { stream, sftp, stat } = await sftpService.createReadStream(req.params.id, rawSession.conn, remotePath);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);

    stream.pipe(res);
    stream.on('error', (err) => {
      logger.sshError(req.params.id, 'Download stream error', { error: err.message });
      sftp.end();
      if (!res.headersSent) res.status(502).json({ error: err.message });
    });
    stream.on('end', () => sftp.end());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
