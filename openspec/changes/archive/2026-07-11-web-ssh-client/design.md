# Web-Based SSH Client - Technical Design

## Context

This design implements a browser-based SSH client that allows users to connect to remote servers through a web interface. The system consists of a Node.js proxy server that handles SSH protocol forwarding and a React frontend that provides terminal emulation and file management UI.

## Goals / Non-Goals

**Goals:**
- Provide seamless SSH terminal access from any modern browser
- Support multi-session management with tab-based navigation
- Enable file upload/download through SFTP protocol
- Allow custom SSH port configuration
- Support both password and SSH key authentication
- Self-hosted deployment for local network use

**Non-Goals:**
- Mobile browser support
- SFTP server functionality (client only)
- Advanced features like port forwarding, X11 forwarding
- Enterprise features (SSO, audit logging, compliance)

## Decisions

### Architecture: Proxy-Based Design

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Terminal  │  │   File UI   │  │     Session Manager │  │
│  │   Pane      │  │   Explorer  │  │     (Multi-tab)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVER COMPONENT                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    SSH Proxy Server                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │ │
│  │  │ Session  │  │ Auth     │  │ Port     │  │ Key   │ │ │
│  │  │ Manager  │  │ Handler  │  │ Forwarder│  │ Manager│ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           │ libssh2 / node-ssh2              │
│                           ▼                                  │
│                    ┌─────────────┐                          │
│                    │  SSH Server │                          │
│                    │  (libssh2)  │                          │
│                    └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SSH Protocol
                              ▼
                    ┌─────────────┐
                    │  SSH Daemon │
                    │  (sshd)     │
                    └─────────────┘
```

### Decision 1: Node.js + libssh2 for Backend

**Chosen:** Node.js with node-ssh2 library

**Rationale:**
- Mature ecosystem with extensive SSH libraries
- Native WebSocket support via ws/uWebSockets.js
- Easy deployment (single binary, no compilation)
- Large community and documentation

**Alternatives Considered:**
- **Go + gorilla/websocket**: Excellent performance but smaller ecosystem
- **Python + websockets**: Good for scripting but slower I/O
- **Rust**: High performance but steeper learning curve

### Decision 2: xterm.js for Terminal Emulation

**Chosen:** xterm.js library

**Rationale:**
- Industry-standard terminal emulation
- Canvas-based rendering for performance
- PTY (pseudo-TTY) emulation support
- Active maintenance and browser compatibility

**Alternatives Considered:**
- **WebSSH**: Full terminal but heavier, less flexible
- **term.js**: Lightweight but limited features
- **libvterm**: C library, requires compilation

### Decision 3: WebSocket for Terminal I/O

**Chosen:** WebSocket protocol for bidirectional terminal data

**Rationale:**
- Full-duplex communication essential for terminal
- Low latency for interactive commands
- Native browser support
- Simple protocol (text/binary frames)

**Alternatives Considered:**
- **HTTP Polling**: Higher latency, more overhead
- **Server-Sent Events**: One-way only, insufficient
- **HTTP/2 Streams**: Complex to implement

### Decision 4: SFTP for File Operations

**Chosen:** SFTP protocol over SSH

**Rationale:**
- Built into SSH protocol, no additional setup
- Standardized across all SSH implementations
- Supports streaming for large files
- Secure (encrypted over SSH)

**Alternatives Considered:**
- **FTP over HTTP**: Not secure, requires separate server
- **WebDAV**: Limited browser support, complex
- **Custom protocol**: Would require server-side implementation

### Decision 5: Single-Server Architecture

**Chosen:** All functionality in single Node.js process

**Rationale:**
- Simpler deployment and maintenance
- Lower resource overhead (only 10 sessions max)
- Easier debugging and monitoring
- Sufficient for expected load

**Alternatives Considered:**
- **Docker per session**: Overkill for 10 sessions
- **Microservices**: Unnecessary complexity
- **Proxy + Local SSH**: More secure but harder to deploy

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Browser compatibility** | PTY emulation varies | Test on Chrome, Firefox, Edge; fallback to basic terminal |
| **Large file transfers** | Memory pressure | Chunked uploads, streaming downloads with progress indicators |
| **Session persistence** | Connection drops | Reconnection logic with exponential backoff |
| **Security** | SSH keys exposed | Never store private keys on server; use SSH agent forwarding |
| **Performance** | High I/O load | Connection pooling, async I/O, non-blocking architecture |
| **Single point of failure** | Server down = no access | Run as system service; consider failover for production |

### Performance Trade-offs

```n
┌─────────────────────────────────────────────────────────────┐
│                    PERFORMANCE TRADE-OFFS                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Single Server (Chosen)                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Pros: Simple, low overhead, easy deployment          │   │
│  │  Cons: Single point of failure, max 10 sessions       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Docker Per Session                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Pros: Isolation, unlimited sessions, auto cleanup    │   │
│  │  Cons: Higher overhead, complex orchestration         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Proxy + Local SSH                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Pros: Best security, native SSH performance          │   │
│  │  Cons: Complex architecture, harder to deploy         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Migration Plan

### Deployment Steps

1. **Install Dependencies**
   ```bash
   npm install express ws node-ssh2 bcryptjs
   ```

2. **Configure SSH Access**
   - Ensure SSH daemon is running on target servers
   - Configure SSH keys for authentication (if using key auth)

3. **Start Proxy Server**
   ```bash
   node server.js
   ```

4. **Access via Browser**
   - Navigate to `http://localhost:3000`
   - Configure SSH connection parameters

### Rollback Strategy

- **Immediate Rollback**: Stop the proxy server; SSH clients remain unaffected
- **Data Loss**: None - no persistent state stored
- **Recovery**: Restart proxy server; all sessions reset (expected behavior)

## Open Questions

1. **SSH Key Storage**: Should we support storing public keys for quick reconnection?
2. **Session Recovery**: Should we persist session state for quick resume?
3. **Multi-Factor Auth**: Should we integrate with 2FA providers?
4. **Command History**: Should we store and search command history?
5. **Clipboard Integration**: Should we enable system clipboard copy/paste?
