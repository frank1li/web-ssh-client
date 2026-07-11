const SessionManager = require('../server/models/sessionManager');

describe('SessionManager', () => {
  beforeEach(() => {
    SessionManager.clearAll();
  });

  describe('createSession', () => {
    test('creates a new session with valid config', () => {
      const session = SessionManager.createSession({
        hostname: '192.168.1.1',
        port: 22,
        username: 'admin',
        authType: 'password'
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.hostname).toBe('192.168.1.1');
      expect(session.port).toBe(22);
      expect(session.username).toBe('admin');
      expect(session.status).toBe('disconnected');
    });

    test('applies default port 22', () => {
      const session = SessionManager.createSession({
        hostname: 'example.com',
        username: 'root'
      });
      expect(session.port).toBe(22);
    });

    test('throws on missing hostname', () => {
      expect(() => {
        SessionManager.createSession({ username: 'admin' });
      }).toThrow('hostname and username are required');
    });
  });

  describe('getSession', () => {
    test('returns session by id', () => {
      const created = SessionManager.createSession({
        hostname: 'example.com',
        username: 'admin'
      });

      const retrieved = SessionManager.getSession(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
    });

    test('returns sanitized session (no conn/auth)', () => {
      const created = SessionManager.createSession({
        hostname: 'example.com',
        username: 'admin'
      });

      const retrieved = SessionManager.getSession(created.id);
      expect(retrieved.auth).toBeUndefined();
      expect(retrieved.conn).toBeUndefined();
    });

    test('returns undefined for unknown id', () => {
      expect(SessionManager.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    test('updates session status', () => {
      const created = SessionManager.createSession({
        hostname: 'example.com',
        username: 'admin'
      });

      SessionManager.updateStatus(created.id, 'connected');
      expect(SessionManager.getSession(created.id).status).toBe('connected');
    });
  });

  describe('deleteSession', () => {
    test('deletes a session', () => {
      const created = SessionManager.createSession({
        hostname: 'example.com',
        username: 'admin'
      });

      expect(SessionManager.deleteSession(created.id)).toBe(true);
      expect(SessionManager.getSession(created.id)).toBeUndefined();
    });

    test('returns false for unknown session', () => {
      expect(SessionManager.deleteSession('nonexistent')).toBe(false);
    });
  });

  describe('listSessions', () => {
    test('lists all sessions', () => {
      SessionManager.createSession({ hostname: 'host1', username: 'user1' });
      SessionManager.createSession({ hostname: 'host2', username: 'user2' });

      const list = SessionManager.listSessions();
      expect(list.length).toBe(2);
    });
  });

  describe('buildConnectConfig', () => {
    test('builds config for password auth', () => {
      const created = SessionManager.createSession({
        hostname: 'example.com',
        port: 2222,
        username: 'admin',
        authType: 'password'
      });

      const raw = SessionManager.getRawSession(created.id);
      raw.auth = { password: 'secret' };

      const config = SessionManager.buildConnectConfig(raw);
      expect(config.host).toBe('example.com');
      expect(config.port).toBe(2222);
      expect(config.username).toBe('admin');
      expect(config.password).toBe('secret');
      expect(config.keepaliveInterval).toBe(10000);
    });
  });
});
