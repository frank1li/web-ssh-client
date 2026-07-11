const { Client } = require('ssh2');
const sessionManager = require('../models/sessionManager');
const logger = require('../utils/logger');

class SSHHandler {
  /**
   * Connect to an SSH server using password authentication
   */
  connectWithPassword(sessionId, authConfig) {
    const session = sessionManager.getRawSession(sessionId);
    if (!session) throw new Error('Session not found');

    session.auth = { password: '***' }; // never store plaintext in logs
    session.authType = 'password';

    logger.sshInfo(sessionId, 'Authenticating with password', {
      host: session.hostname,
      port: session.port,
      username: session.username
    });

    // Store actual password for connection
    session.auth = { password: authConfig.password };
    return this._connect(sessionId);
  }

  /**
   * Connect to an SSH server using key authentication
   */
  connectWithKey(sessionId, authConfig) {
    const session = sessionManager.getRawSession(sessionId);
    if (!session) throw new Error('Session not found');

    session.auth = {
      privateKey: authConfig.privateKey ? `${authConfig.privateKey.substring(0, 40)}...(truncated)` : undefined,
      passphrase: authConfig.passphrase ? '***' : undefined
    };
    session.authType = 'key';

    logger.sshInfo(sessionId, 'Authenticating with SSH key', {
      host: session.hostname,
      port: session.port,
      username: session.username,
      hasPassphrase: !!authConfig.passphrase
    });

    session.auth = {
      privateKey: authConfig.privateKey,
      passphrase: authConfig.passphrase || undefined
    };
    return this._connect(sessionId);
  }

  /**
   * Internal connect method with full SSH event logging
   */
  _connect(sessionId) {
    return new Promise((resolve, reject) => {
      const session = sessionManager.getRawSession(sessionId);
      if (!session) return reject(new Error('Session not found'));

      sessionManager.updateStatus(sessionId, 'connecting');
      const conn = new Client();
      session.conn = conn;

      const config = sessionManager.buildConnectConfig(session);

      logger.sshInfo(sessionId, 'Connecting', {
        host: config.host,
        port: config.port,
        username: config.username,
        authType: session.authType,
        timeout: config.readyTimeout
      });

      conn.on('ready', () => {
        logger.sshInfo(sessionId, 'SSH connection established', {
          host: config.host,
          port: config.port,
          username: config.username,
          authType: session.authType
        });
        sessionManager.updateStatus(sessionId, 'connected');
        sessionManager.setConnectionTimeout(sessionId, () => {});
        resolve({ success: true, sessionId });
      });

      conn.on('error', (err) => {
        logger.sshError(sessionId, 'SSH connection error', {
          error: err.message,
          code: err.code,
          level: err.level
        });
        sessionManager.updateStatus(sessionId, 'error', err.message);
        reject(err);
      });

      conn.on('close', () => {
        logger.sshInfo(sessionId, 'SSH connection closed');
        sessionManager.updateStatus(sessionId, 'disconnected');
      });

      conn.on('end', () => {
        logger.sshDebug(sessionId, 'SSH connection ended');
        sessionManager.updateStatus(sessionId, 'disconnected');
      });

      conn.on('handshake', (negotiated) => {
        logger.sshDebug(sessionId, 'SSH handshake complete', {
          kex: negotiated.kex,
          hostKey: negotiated.hostKey,
          cs: {
            cipher: negotiated.cs.cipher,
            mac: negotiated.cs.mac,
            compress: negotiated.cs.compress,
            lang: negotiated.cs.lang
          },
          sc: {
            cipher: negotiated.sc.cipher,
            mac: negotiated.sc.mac,
            compress: negotiated.sc.compress,
            lang: negotiated.sc.lang
          }
        });
      });

      conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish, promptsList) => {
        logger.sshDebug(sessionId, 'Keyboard-interactive auth prompted', {
          name,
          instructions,
          promptCount: prompts.length
        });
        if (session.auth.password) {
          finish([session.auth.password]);
        } else {
          finish([]);
        }
      });

      conn.on('banner', (message) => {
        logger.sshDebug(sessionId, 'SSH banner received', { message: message.substring(0, 200) });
      });

      // Set connection timeout
      sessionManager.setConnectionTimeout(sessionId, (sid) => {
        logger.sshWarn(sessionId, 'Connection timed out', { timeout: config.readyTimeout });
        reject(new Error('Connection timed out'));
      });

      conn.connect(config);
    });
  }

  /**
   * Disconnect an SSH session
   */
  disconnect(sessionId) {
    const session = sessionManager.getRawSession(sessionId);
    if (session && session.conn) {
      logger.sshInfo(sessionId, 'Disconnecting SSH session');
      session.conn.end();
      session.conn = null;
    }
    sessionManager.updateStatus(sessionId, 'disconnected');
  }

  /**
   * Open a shell session with logging
   */
  openShell(sessionId, termOpts = {}) {
    return new Promise((resolve, reject) => {
      const session = sessionManager.getRawSession(sessionId);
      if (!session || !session.conn) return reject(new Error('No active connection'));
      if (session.status !== 'connected') return reject(new Error('Session not connected'));

      const opts = {
        term: termOpts.term || 'xterm-256color',
        cols: termOpts.cols || 80,
        rows: termOpts.rows || 24
      };

      logger.sshDebug(sessionId, 'Opening shell', opts);

      session.conn.shell(opts, (err, stream) => {
        if (err) {
          logger.sshError(sessionId, 'Failed to open shell', { error: err.message });
          return reject(err);
        }

        logger.sshInfo(sessionId, 'Shell opened');

        stream.on('close', (code) => {
          logger.sshDebug(sessionId, 'Shell stream closed', { code });
        });

        stream.on('error', (err) => {
          logger.sshWarn(sessionId, 'Shell stream error', { error: err.message });
        });

        resolve(stream);
      });
    });
  }

  /**
   * Execute a command with logging
   */
  exec(sessionId, command) {
    return new Promise((resolve, reject) => {
      const session = sessionManager.getRawSession(sessionId);
      if (!session || !session.conn) return reject(new Error('No active connection'));

      logger.sshInfo(sessionId, 'Executing command', { command: command.substring(0, 200) });

      session.conn.exec(command, (err, stream) => {
        if (err) {
          logger.sshError(sessionId, 'Command execution failed', { error: err.message });
          return reject(err);
        }
        resolve(stream);
      });
    });
  }

  /**
   * Start SFTP session with logging
   */
  openSFTP(sessionId) {
    return new Promise((resolve, reject) => {
      const session = sessionManager.getRawSession(sessionId);
      if (!session || !session.conn) return reject(new Error('No active connection'));

      logger.sshInfo(sessionId, 'Opening SFTP session');

      session.conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP session failed', { error: err.message });
          return reject(err);
        }
        session.sftp = sftp;
        logger.sshDebug(sessionId, 'SFTP session ready');
        resolve(sftp);
      });
    });
  }
}

module.exports = new SSHHandler();
