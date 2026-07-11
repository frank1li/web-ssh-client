# Web SSH Client

A browser-based SSH client with terminal emulation, multi-session management, and SFTP file transfer capabilities.

## Features

- **Terminal Emulation**: Full xterm.js-based terminal with ANSI color support
- **Multi-Session Management**: Connect to multiple SSH servers simultaneously with tab-based navigation
- **SFTP File Transfer**: Browse remote files, upload, and download files through the browser
- **Password & Key Authentication**: Support for both password and SSH private key authentication
- **Custom SSH Port**: Support for non-standard SSH ports
- **Connection Persistence**: Session metadata saved in browser localStorage
- **Dark Theme**: Modern dark UI design suitable for terminal work

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd web-ssh-client

# Install dependencies
npm install

# Start the server
npm start
```

### Usage

1. Open `http://localhost:3000` in your browser
2. Enter SSH connection details (hostname, port, username)
3. Choose authentication method (password or SSH key)
4. Click Connect to establish the SSH session
5. Use the terminal as you would in a normal SSH client
6. Use the File Browser panel to transfer files via SFTP

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server listen port |
| `MAX_SESSIONS` | 10 | Maximum concurrent SSH sessions |
| `CONNECTION_TIMEOUT` | 30000 | Connection timeout in ms |
| `DEFAULT_SSH_PORT` | 22 | Default SSH port |

## Project Structure

```
web-ssh-client/
├── server/
│   ├── index.js              # Express server + WebSocket handler
│   ├── models/
│   │   ├── sessionManager.js # Session lifecycle management
│   │   └── connectionConfig.js # Connection validation
│   ├── services/
│   │   ├── sshHandler.js     # SSH connection handler
│   │   └── sftpService.js    # SFTP file operations
│   ├── routes/
│   │   └── api.js            # REST API routes
│   └── middleware/
│       └── errorHandler.js   # Error handling middleware
├── client/
│   └── public/
│       ├── index.html        # SPA entry point
│       ├── styles.css        # Application styles
│       └── app.js            # Client application logic
├── tests/
│   ├── connectionConfig.test.js
│   └── sessionManager.test.js
├── package.json
└── .env.example
```

## API Endpoints

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/sessions/:id/connect` | Connect session (password) |
| POST | `/api/sessions/:id/disconnect` | Disconnect session |
| GET | `/api/sessions/:id/status` | Get session status |

### File Transfer

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/:id/files?path=/` | List directory |
| POST | `/api/sessions/:id/upload` | Upload file |
| POST | `/api/sessions/:id/download` | Download file |
| POST | `/api/sessions/:id/mkdir` | Create directory |
| DELETE | `/api/sessions/:id/files` | Delete file |

### WebSocket Protocol

Connect to `ws://localhost:3000?sessionId=<id>` for terminal I/O.

**Client → Server:**
```json
{"type": "auth:password", "password": "...", "cols": 80, "rows": 24}
{"type": "auth:key", "privateKey": "...", "passphrase": "...", "cols": 80, "rows": 24}
{"type": "terminal:input", "data": "ls -la\n"}
{"type": "resize", "cols": 120, "rows": 40}
{"type": "ping"}
```

**Server → Client:**
```json
{"type": "connected"}
{"type": "terminal:output", "data": "..."}
{"type": "error", "message": "..."}
{"type": "session:closed", "code": 0}
{"type": "pong"}
```

## Deployment

### Production

```bash
NODE_ENV=production npm start
```

For production deployment:
- Run behind a reverse proxy (nginx, Caddy)
- Enable HTTPS for secure WebSocket connections
- Set `MAX_SESSIONS` appropriately for your environment
- Consider running as a systemd service

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
```

## Security Considerations

- SSH private keys are never persisted on the server
- All SSH traffic is encrypted natively by the SSH protocol
- WebSocket connections should be secured with WSS in production
- No user authentication is implemented - restrict network access
- Session data is stored in-memory only
- Input validation is performed on all connection parameters

## Testing

```bash
npm test
npm run test:watch
```

## License

Apache License 2.0
