const { validateConnectionConfig, validatePort, validateHostname, validateUsername, validateAuthType } = require('../server/models/connectionConfig');

describe('Connection Config Validation', () => {
  describe('validateHostname', () => {
    test('accepts valid hostname', () => {
      expect(validateHostname('192.168.1.1').valid).toBe(true);
      expect(validateHostname('example.com').valid).toBe(true);
    });

    test('rejects empty hostname', () => {
      expect(validateHostname('').valid).toBe(false);
      expect(validateHostname(null).valid).toBe(false);
    });

    test('rejects hostname too long', () => {
      expect(validateHostname('a'.repeat(256)).valid).toBe(false);
    });
  });

  describe('validatePort', () => {
    test('accepts default port 22', () => {
      const result = validatePort(22);
      expect(result.valid).toBe(true);
      expect(result.port).toBe(22);
    });

    test('accepts custom port', () => {
      const result = validatePort(2222);
      expect(result.valid).toBe(true);
      expect(result.port).toBe(2222);
    });

    test('rejects invalid ports', () => {
      expect(validatePort(0).valid).toBe(false);
      expect(validatePort(65536).valid).toBe(false);
      expect(validatePort(-1).valid).toBe(false);
    });
  });

  describe('validateUsername', () => {
    test('accepts valid username', () => {
      expect(validateUsername('root').valid).toBe(true);
      expect(validateUsername('admin').valid).toBe(true);
    });

    test('rejects empty username', () => {
      expect(validateUsername('').valid).toBe(false);
      expect(validateUsername(null).valid).toBe(false);
    });
  });

  describe('validateAuthType', () => {
    test('defaults to password', () => {
      expect(validateAuthType().authType).toBe('password');
    });

    test('accepts password and key', () => {
      expect(validateAuthType('password').authType).toBe('password');
      expect(validateAuthType('key').authType).toBe('key');
    });

    test('rejects invalid auth types', () => {
      expect(validateAuthType('invalid').valid).toBe(false);
    });
  });

  describe('validateConnectionConfig', () => {
    test('validates complete config', () => {
      const result = validateConnectionConfig({
        hostname: 'example.com',
        username: 'admin',
        port: 22,
        authType: 'password'
      });
      expect(result.valid).toBe(true);
    });

    test('applies defaults for optional fields', () => {
      const result = validateConnectionConfig({
        hostname: 'example.com',
        username: 'admin'
      });
      expect(result.valid).toBe(true);
      expect(result.config.port).toBe(22);
      expect(result.config.authType).toBe('password');
    });

    test('rejects config with missing hostname', () => {
      const result = validateConnectionConfig({
        username: 'admin'
      });
      expect(result.valid).toBe(false);
    });
  });
});
