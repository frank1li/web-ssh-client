# Web-Based SSH Client

## Why

Developers and system administrators frequently need to connect to remote servers from their browsers for quick access, especially when working across multiple machines or in environments where desktop SSH clients are unavailable. Existing web SSH solutions are often either overly complex, lack essential features, or have poor user experience. This change introduces a lightweight, self-hosted web SSH client that provides a seamless terminal experience directly in the browser.

## What Changes

- **New Web SSH Client Application**: A browser-based SSH client with terminal emulation and file management capabilities
- **SSH Proxy Server**: Node.js-based proxy server handling authentication, session management, and SSH protocol forwarding
- **Multi-Session Support**: Users can maintain multiple SSH connections simultaneously with tab-based navigation
- **File Operations**: UI-based file upload and download through SFTP protocol
- **Custom Configuration**: Support for custom SSH ports, authentication methods (password and key-based)

## Capabilities

### New Capabilities
- **ssh-terminal**: Terminal emulation and SSH session management with PTY support
- **ssh-file-transfer**: SFTP-based file upload and download with progress indicators
- **ssh-authentication**: Password and SSH key-based authentication handling
- **ssh-session-manager**: Multi-tab session management with connection persistence

## Impact

- **New Dependencies**: node-ssh2, ws (WebSocket), xterm.js (frontend)
- **New Services**: SSH proxy server running on localhost
- **Browser Requirements**: Modern browser with WebSocket support (Chrome, Firefox, Edge)
- **Network**: Requires outbound SSH connectivity to target servers
