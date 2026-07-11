/**
 * Logger - SSH proxy server logging utility
 * Supports terminal and file output with configurable log levels.
 *
 * Usage:
 *   const log = require('./utils/logger');
 *   log.info('SSH connection established', { sessionId: 'xxx', host: '...' });
 *   log.error('Connection failed', err);
 *   log.debug('Raw SSH data', { bytes: 1024 });
 */

const fs = require('fs');
const path = require('path');

// Log levels
const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

class Logger {
  constructor() {
    this.level = this._parseLevel(process.env.LOG_LEVEL || 'INFO');
    this.fileStream = null;
    this.filePath = null;

    // Initialize file logging if configured
    const logFile = process.env.LOG_FILE;
    if (logFile) {
      this._initFileLog(logFile);
    }
  }

  /**
   * Parse log level from string
   */
  _parseLevel(level) {
    const key = level.toUpperCase();
    return LEVELS[key] !== undefined ? LEVELS[key] : LEVELS.INFO;
  }

  /**
   * Initialize file logging
   */
  _initFileLog(filePath) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
      this.filePath = filePath;
      console.log(`[Logger] Logging to file: ${filePath}`);
    } catch (err) {
      console.error(`[Logger] Failed to open log file: ${filePath}`, err.message);
    }
  }

  /**
   * Format a log entry
   */
  _format(level, message, meta) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    return `[${timestamp}] [${LEVEL_NAMES[level]}] ${message}${metaStr}`;
  }

  /**
   * Write log entry to terminal and/or file
   */
  _write(level, message, meta) {
    if (level < this.level) return;

    const entry = this._format(level, message, meta);

    // Terminal output (with color for errors/warnings)
    if (level === LEVELS.ERROR) {
      console.error(entry);
    } else if (level === LEVELS.WARN) {
      console.warn(entry);
    } else {
      console.log(entry);
    }

    // File output
    if (this.fileStream) {
      this.fileStream.write(entry + '\n');
    }
  }

  debug(message, meta) {
    this._write(LEVELS.DEBUG, message, meta);
  }

  info(message, meta) {
    this._write(LEVELS.INFO, message, meta);
  }

  warn(message, meta) {
    this._write(LEVELS.WARN, message, meta);
  }

  error(message, meta) {
    this._write(LEVELS.ERROR, message, meta);
  }

  /**
   * SSH-specific debug logging
   */
  sshDebug(sessionId, event, details) {
    this.debug(`[SSH:${sessionId}] ${event}`, details);
  }

  sshInfo(sessionId, event, details) {
    this.info(`[SSH:${sessionId}] ${event}`, details);
  }

  sshWarn(sessionId, event, details) {
    this.warn(`[SSH:${sessionId}] ${event}`, details);
  }

  sshError(sessionId, event, details) {
    this.error(`[SSH:${sessionId}] ${event}`, details);
  }

  /**
   * Close file stream (call on shutdown)
   */
  close() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

module.exports = new Logger();
