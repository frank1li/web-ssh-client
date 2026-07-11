const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const logger = require('./utils/logger');
const sessionManager = require('./models/sessionManager');
const sshHandler = require('./services/sshHandler');
const routes = require('./routes/api');
const { notFoundHandler, globalErrorHandler, validateSessionInput } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

// Serve xterm.js from node_modules
app.use('/vendor/xterm', express.static(path.join(__dirname, '../node_modules/xterm')));
app.use('/vendor/xterm-addon-fit', express.static(path.join(__dirname, '../node_modules/xterm-addon-fit')));

// API routes
app.use('/api', validateSessionInput, routes);

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Serve SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// WebSocket connection for terminal I/O
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    ws.close(1008, 'Session ID required');
    return;
  }

  const session = sessionManager.getRawSession(sessionId);
  if (!session) {
    ws.close(1008, 'Invalid session');
    return;
  }

  logger.sshInfo(sessionId, 'WebSocket connected');

  let stream = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      sessionManager.updateActivity(sessionId);

      switch (data.type) {
        case 'auth:password':
          logger.sshInfo(sessionId, 'Auth via password received');
          try {
            await sshHandler.connectWithPassword(sessionId, { password: data.password });
            stream = await sshHandler.openShell(sessionId, {
              cols: data.cols || 80,
              rows: data.rows || 24
            });
            _pipeStream(ws, stream);
            ws.send(JSON.stringify({ type: 'connected' }));
            logger.sshInfo(sessionId, 'Terminal session active');
          } catch (err) {
            logger.sshError(sessionId, 'Password auth failed', { error: err.message });
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
          }
          break;

        case 'auth:key':
          logger.sshInfo(sessionId, 'Auth via SSH key received');
          try {
            await sshHandler.connectWithKey(sessionId, {
              privateKey: data.privateKey,
              passphrase: data.passphrase
            });
            stream = await sshHandler.openShell(sessionId, {
              cols: data.cols || 80,
              rows: data.rows || 24
            });
            _pipeStream(ws, stream);
            ws.send(JSON.stringify({ type: 'connected' }));
            logger.sshInfo(sessionId, 'Terminal session active');
          } catch (err) {
            logger.sshError(sessionId, 'SSH key auth failed', { error: err.message });
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
          }
          break;

        case 'terminal:input':
          if (stream && stream.writable) {
            stream.write(data.data);
          }
          break;

        case 'resize':
          if (stream) {
            logger.sshDebug(sessionId, 'Terminal resize', { cols: data.cols, rows: data.rows });
            stream.setWindow(data.rows || 24, data.cols || 80, 0, 0);
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          logger.warn(`Unknown WebSocket message type: ${data.type}`, { sessionId });
      }
    } catch (err) {
      logger.error('WebSocket message error', { sessionId, error: err.message });
    }
  });

  ws.on('close', () => {
    logger.sshInfo(sessionId, 'WebSocket disconnected');
    if (stream) {
      stream.close();
    }
    sshHandler.disconnect(sessionId);
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { sessionId, error: err.message });
    if (stream) stream.close();
    sshHandler.disconnect(sessionId);
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  ws.on('pong', () => {
    // connection alive
  });

  ws.on('close', () => clearInterval(heartbeat));
});

/**
 * Pipe SSH stream to WebSocket
 */
function _pipeStream(ws, stream) {
  stream.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'terminal:output', data: data.toString('utf-8') }));
    }
  });

  stream.stderr.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'terminal:output', data: data.toString('utf-8') }));
    }
  });

  stream.on('close', (code) => {
    ws.send(JSON.stringify({ type: 'session:closed', code }));
  });
}

// Start server
server.reuseAddress = true;
server.listen(PORT, () => {
  logger.info(`SSH Proxy Server started`, { port: PORT });
  logger.info(`Open http://localhost:${PORT} in your browser`);
  if (process.env.LOG_FILE) {
    logger.info(`Logs also writing to: ${process.env.LOG_FILE}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down SSH Proxy Server...');
  sessionManager.clearAll();
  server.close(() => {
    logger.close();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  sessionManager.clearAll();
  server.close(() => {
    logger.close();
    process.exit(0);
  });
});

module.exports = { app, server, wss };
