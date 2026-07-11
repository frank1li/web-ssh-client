/**
 * Error handling middleware and utilities
 */

// Application error class
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode || 500;
    this.code = code || 'INTERNAL_ERROR';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Not found handler (skips noise from browser probes)
function notFoundHandler(req, res, next) {
  const url = req.originalUrl;

  // 浏览器/Chrome 的常规探测请求，静默处理
  if (url === '/favicon.ico' || url.startsWith('/.well-known/')) {
    return res.status(204).end();
  }

  next(new AppError(`Not found: ${url}`, 404, 'NOT_FOUND'));
}

// Global error handler
function globalErrorHandler(err, req, res, next) {
  const url = req.originalUrl;

  // 静默忽略浏览器常见探测请求
  if (url === '/favicon.ico' || url.startsWith('/.well-known/')) {
    return res.status(204).end();
  }

  // 仅对非 404 错误或重要的 404 打印日志
  if (err.statusCode !== 404) {
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
  }

  if (err.name === 'AppError') {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }

  // SSH connection errors
  if (err.message && (
    err.message.includes('Authentication') ||
    err.message.includes('authentication') ||
    err.message.includes('All configured authentication methods failed')
  )) {
    return res.status(401).json({
      error: 'Authentication failed. Check your credentials.',
      code: 'AUTH_FAILED'
    });
  }

  // Connection timeout
  if (err.message && (
    err.message.includes('timed out') ||
    err.message.includes('ETIMEDOUT') ||
    err.message.includes('Timeout')
  )) {
    return res.status(504).json({
      error: 'Connection timed out. Server may be unreachable.',
      code: 'TIMEOUT'
    });
  }

  // DNS/network errors
  if (err.message && (
    err.message.includes('ENOTFOUND') ||
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ECONNRESET')
  )) {
    return res.status(502).json({
      error: `Cannot connect to remote host: ${err.message}`,
      code: 'CONNECTION_ERROR'
    });
  }

  // Default 500
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
}

// Input validation middleware
function validateSessionInput(req, res, next) {
  const { hostname, username } = req.body;

  if (req.method === 'POST' && req.path === '/sessions') {
    if (!hostname || typeof hostname !== 'string') {
      return res.status(400).json({ error: 'Valid hostname is required', code: 'VALIDATION' });
    }
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Valid username is required', code: 'VALIDATION' });
    }
    if (hostname.trim().length > 255) {
      return res.status(400).json({ error: 'Hostname too long', code: 'VALIDATION' });
    }
    if (hostname.trim().length === 0) {
      return res.status(400).json({ error: 'Hostname cannot be empty', code: 'VALIDATION' });
    }
    if (username.trim().length === 0) {
      return res.status(400).json({ error: 'Username cannot be empty', code: 'VALIDATION' });
    }
  }

  next();
}

module.exports = {
  AppError,
  notFoundHandler,
  globalErrorHandler,
  validateSessionInput
};
