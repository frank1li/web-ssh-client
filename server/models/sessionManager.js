/**
 * Session Manager - Handles SSH session lifecycle
 * Create, store, retrieve, and delete session objects with metadata tracking.
 */

const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS, 10) || 10;
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT, 10) || 30000;

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.timeoutTimers = new Map();
  }

  /**
   * Create a new session with metadata
   * @param {Object} config - Connection configuration
   * @param {string} config.hostname - Remote hostname
   * @param {number} config.port - SSH port (default 22)
   * @param {string} config.username - SSH username
   * @param {string} config.authType - Authentication type ('password' or 'key')
   * @returns {Object} Created session object
   */
  createSession(config) {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error('Maximum number of sessions reached');
    }

    if (!config.hostname || !config.username) {
      throw new Error('hostname and username are required');
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const session = {
      id: sessionId,
      hostname: config.hostname,
      port: parseInt(config.port, 10) || 22,
      username: config.username,
      authType: config.authType || 'password',
      auth: config.auth || {},
      createdAt: now,
      lastActivity: now,
      status: 'disconnected',
      statusChangedAt: now,
      conn: null,
      sftp: null,
      metadata: config.metadata || {},
      error: null
    };

    this.sessions.set(sessionId, session);
    return this._sanitize(session);
  }

  /**
   * Get a session by ID
   * @param {string} sessionId
   * @returns {Object|undefined} Session object or undefined
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? this._sanitize(session) : undefined;
  }

  /**
   * Get raw session (includes connection references, for internal use)
   * @param {string} sessionId
   * @returns {Object|undefined}
   */
  getRawSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session status
   * @param {string} sessionId
   * @param {string} status - 'connecting' | 'connected' | 'disconnected' | 'error'
   * @param {string} [error] - Optional error message
   */
  updateStatus(sessionId, status, error) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.statusChangedAt = new Date();
    session.lastActivity = new Date();
    if (error) session.error = error;

    if (status === 'connected') {
      this._clearTimeout(sessionId);
    }

    if (status === 'disconnected' || status === 'error') {
      session.conn = null;
      session.sftp = null;
    }
  }

  /**
   * Update session activity timestamp
   * @param {string} sessionId
   */
  updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Delete a session
   * @param {string} sessionId
   * @returns {boolean} Whether deletion was successful
   */
  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this._clearTimeout(sessionId);
    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * List all sessions (sanitized, no connection refs)
   * @returns {Array} Array of session objects
   */
  listSessions() {
    return Array.from(this.sessions.values()).map(s => this._sanitize(s));
  }

  /**
   * Get count of active sessions
   * @returns {number}
   */
  getActiveCount() {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'connected' || session.status === 'connecting') {
        count++;
      }
    }
    return count;
  }

  /**
   * Set connection timeout for a session
   * @param {string} sessionId
   * @param {Function} callback - Called on timeout
   * @param {number} [ms] - Timeout in ms (default: CONNECTION_TIMEOUT)
   */
  setConnectionTimeout(sessionId, callback, ms) {
    this._clearTimeout(sessionId);
    const timer = setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session && session.status === 'connecting') {
        this.updateStatus(sessionId, 'error', 'Connection timed out');
        this.deleteSession(sessionId);
        callback(sessionId);
      }
      this.timeoutTimers.delete(sessionId);
    }, ms || CONNECTION_TIMEOUT);
    this.timeoutTimers.set(sessionId, timer);
  }

  /**
   * Clear all sessions and timers
   */
  clearAll() {
    for (const sessionId of this.timeoutTimers.keys()) {
      this._clearTimeout(sessionId);
    }
    this.sessions.clear();
  }

  /**
   * Create a plain object with connection properties for SSH
   * @param {Object} session
   * @returns {Object} SSH connection config
   */
  buildConnectConfig(session) {
    const config = {
      host: session.hostname,
      port: session.port,
      username: session.username,
      readyTimeout: CONNECTION_TIMEOUT,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    };

    if (session.authType === 'password') {
      config.password = session.auth.password;
    } else if (session.authType === 'key') {
      config.privateKey = session.auth.privateKey;
      if (session.auth.passphrase) {
        config.passphrase = session.auth.passphrase;
      }
    }

    // Enable legacy SSH algorithms for older servers (e.g., Levinux/Dropbear)
    // Set SSH_DISABLE_LEGACY_ALGORITHMS=true to disable and use strict modern defaults
    if (process.env.SSH_DISABLE_LEGACY_ALGORITHMS !== 'true') {
      config.algorithms = {
        kex: [
          'diffie-hellman-group1-sha1',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group16-sha512',
          'diffie-hellman-group18-sha512'
        ],
        cipher: [
          'aes256-cbc',
          'aes192-cbc',
          'aes128-cbc',
          '3des-cbc',
          'aes256-gcm',
          'aes128-gcm',
          'aes256-ctr',
          'aes192-ctr',
          'aes128-ctr'
        ],
        hmac: [
          'hmac-sha1',
          'hmac-sha1-96',
          'hmac-md5',
          'hmac-md5-96',
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1-etm@openssh.com',
          'hmac-sha2-256-etm@openssh.com',
          'hmac-sha2-512-etm@openssh.com'
        ],
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'ssh-ed25519'
        ]
      };
    }

    return config;
  }

  /**
   * Clear timeout timer for session
   */
  _clearTimeout(sessionId) {
    const timer = this.timeoutTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(sessionId);
    }
  }

  /**
   * Remove sensitive/connection data from session for external use
   */
  _sanitize(session) {
    return {
      id: session.id,
      hostname: session.hostname,
      port: session.port,
      username: session.username,
      authType: session.authType,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      status: session.status,
      statusChangedAt: session.statusChangedAt,
      metadata: session.metadata,
      error: session.error
    };
  }
}

module.exports = new SessionManager();
