/**
 * Connection configuration model
 * Validates and normalizes SSH connection parameters
 */

function validatePort(port) {
  const p = parseInt(port, 10);
  if (isNaN(p) || p < 1 || p > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }
  return { valid: true, port: p };
}

function validateHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return { valid: false, error: 'Hostname is required' };
  }
  const trimmed = hostname.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Hostname cannot be empty' };
  }
  if (trimmed.length > 255) {
    return { valid: false, error: 'Hostname too long' };
  }
  return { valid: true, hostname: trimmed };
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  const trimmed = username.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Username cannot be empty' };
  }
  return { valid: true, username: trimmed };
}

function validateAuthType(authType) {
  if (!authType) return { valid: true, authType: 'password' };
  if (authType !== 'password' && authType !== 'key') {
    return { valid: false, error: 'authType must be "password" or "key"' };
  }
  return { valid: true, authType };
}

/**
 * Validate a complete connection configuration
 * @param {Object} config
 * @returns {Object} { valid: boolean, error?: string, config?: Object }
 */
function validateConnectionConfig(config) {
  const hostResult = validateHostname(config.hostname);
  if (!hostResult.valid) return { valid: false, error: hostResult.error };

  const userResult = validateUsername(config.username);
  if (!userResult.valid) return { valid: false, error: userResult.error };

  const portResult = validatePort(config.port || 22);
  if (!portResult.valid) return { valid: false, error: portResult.error };

  const authResult = validateAuthType(config.authType);
  if (!authResult.valid) return { valid: false, error: authResult.error };

  return {
    valid: true,
    config: {
      hostname: hostResult.hostname,
      username: userResult.username,
      port: portResult.port,
      authType: authResult.authType
    }
  };
}

module.exports = {
  validateConnectionConfig,
  validatePort,
  validateHostname,
  validateUsername,
  validateAuthType
};
