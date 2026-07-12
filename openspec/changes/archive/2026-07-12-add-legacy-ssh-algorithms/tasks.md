## 1. Add Legacy Algorithm Support to SSH Connect Config

- [x] 1.1 Update `buildConnectConfig()` in `server/models/sessionManager.js` — when `SSH_LEGACY_ALGORITHMS=true` env var is set, add `algorithms` config with legacy kex, cipher, hmac, and serverHostKey algorithms to the SSH connection config
