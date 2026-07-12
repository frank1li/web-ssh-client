// ============================================================
// Web SSH Client - Main Application
// ============================================================

class SSHSession {
  constructor(config) {
    this.id = config.id;
    this.hostname = config.hostname;
    this.port = config.port;
    this.username = config.username;
    this.authType = config.authType;
    this.status = 'disconnected';
    this.ws = null;
    this.terminal = null;
    this.fitAddon = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  async createTerminal(container) {
    this.fitAddon = new FitAddon.FitAddon();
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'Consolas', 'Courier New', monospace",
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#89b4fa',
        selectionBackground: '#45475a',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8'
      },
      allowTransparency: true,
      cols: 80,
      rows: 24
    });

    this.terminal.open(container);
    this.fitAddon.fit();
    this._setupTerminalListeners();
    return this.terminal;
  }

  _setupTerminalListeners() {
    this.terminal.onResize(({ cols, rows }) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    this.terminal.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'terminal:input', data }));
      }
    });
  }

  connect(wsUrl, authData) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${wsUrl}?sessionId=${this.id}`);
      this.status = 'connecting';

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timed out'));
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        // Send authentication
        if (this.authType === 'password') {
          this.ws.send(JSON.stringify({
            type: 'auth:password',
            password: authData.password,
            cols: this.terminal ? this.terminal.cols : 80,
            rows: this.terminal ? this.terminal.rows : 24
          }));
        } else if (this.authType === 'key') {
          this.ws.send(JSON.stringify({
            type: 'auth:key',
            privateKey: authData.privateKey,
            passphrase: authData.passphrase,
            cols: this.terminal ? this.terminal.cols : 80,
            rows: this.terminal ? this.terminal.rows : 24
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'connected':
              this.status = 'connected';
              this.reconnectAttempts = 0;
              resolve();
              break;
            case 'terminal:output':
              if (this.terminal) {
                this.terminal.write(msg.data);
              }
              break;
            case 'session:closed':
              this.status = 'disconnected';
              this._handleDisconnect();
              break;
            case 'error':
              this.status = 'error';
              reject(new Error(msg.message));
              break;
            case 'pong':
              break;
            default:
              console.log('Unknown message:', msg.type);
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        this.status = 'error';
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this._handleDisconnect();
      };
    });
  }

  _handleDisconnect() {
    this.status = 'disconnected';
    App.updateSessionStatus(this);
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
          this.ws = null;
        }
      }, delay);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
  }

  fit() {
    if (this.fitAddon) {
      try {
        this.fitAddon.fit();
      } catch (e) {
        // ignore fit errors
      }
    }
  }
}

// ============================================================
// Application Controller
// ============================================================

const App = {
  sessions: new Map(),
  activeSessionId: null,
  wsBaseUrl: null,
  httpBaseUrl: '/api',
  currentTreePath: '/',
  dirCache: {},
  expandedDirs: new Set(),
  _selectedFile: null,

  init() {
    this.wsBaseUrl = this._getWsUrl();
    this._bindEvents();
    this._loadSavedSessions();
    this._updateStatusBar();
  },

  _getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  },

  _bindEvents() {
    // Auth type toggle (full form)
    document.getElementById('auth-type').addEventListener('change', (e) => {
      const isKey = e.target.value === 'key';
      document.getElementById('password-group').style.display = isKey ? 'none' : '';
      document.getElementById('key-group').style.display = isKey ? '' : 'none';
      document.getElementById('passphrase-group').style.display = isKey ? '' : 'none';
    });

    // Auth type toggle (mini panel)
    document.getElementById('mini-auth-type').addEventListener('change', (e) => {
      const isKey = e.target.value === 'key';
      document.getElementById('mini-password-group').style.display = isKey ? 'none' : '';
      document.getElementById('mini-key-group').style.display = isKey ? '' : 'none';
      document.getElementById('mini-passphrase-group').style.display = isKey ? '' : 'none';
    });

    // Password visibility toggle
    document.getElementById('toggle-password').addEventListener('click', () => {
      const pwd = document.getElementById('password');
      pwd.type = pwd.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('mini-toggle-password').addEventListener('click', () => {
      const pwd = document.getElementById('mini-password');
      pwd.type = pwd.type === 'password' ? 'text' : 'password';
    });

    // Connect button (full form)
    document.getElementById('connect-btn').addEventListener('click', () => this._handleConnect());

    // Connect button (mini panel)
    document.getElementById('mini-connect-btn').addEventListener('click', () => this._handleMiniConnect());

    // New session button - show mini panel when sessions exist
    document.getElementById('new-session-btn').addEventListener('click', () => this._showMiniPanel());

    // Mini panel close
    document.getElementById('mini-panel-close').addEventListener('click', () => this._hideMiniPanel());
    document.getElementById('mini-panel-backdrop').addEventListener('click', () => this._hideMiniPanel());

    // File panel toggle
    document.getElementById('toggle-file-panel').addEventListener('click', () => {
      const panel = document.getElementById('file-panel');
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });

    // Enter key submits connect (full form)
    document.querySelectorAll('#connection-form input, #connection-form select').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._handleConnect();
      });
    });

    // Enter key submits connect (mini panel)
    document.querySelectorAll('#new-session-panel input, #new-session-panel select').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._handleMiniConnect();
      });
    });

    // ESC closes mini panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('new-session-panel').style.display !== 'none') {
        this._hideMiniPanel();
      }
    });

    // Window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        for (const session of this.sessions.values()) {
          session.fit();
        }
      }, 200);
    });

    // Context menu actions (event delegation)
    document.getElementById('context-menu').addEventListener('click', (e) => {
      const item = e.target.closest('.context-item');
      if (!item) return;
      const action = item.dataset.action;
      switch (action) {
        case 'download': this._contextDownload(); break;
        case 'upload': this._contextUpload(); break;
        case 'mkdir': this._contextMkdir(); break;
        case 'delete': this._contextDelete(); break;
        case 'rename': this._contextRename(); break;
      }
    });

    // Click outside closes context menu
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('context-menu');
      if (menu.style.display !== 'none' && !menu.contains(e.target)) {
        this._hideContextMenu();
      }
    });

    // Prevent browser default context menu on file tree
    document.getElementById('file-tree').addEventListener('contextmenu', (e) => {
      // Only prevent if not already handled by a tree-node
      if (!e.target.closest('.tree-node')) {
        e.preventDefault();
      }
    });
  },

  async _handleConnect() {
    const hostname = document.getElementById('hostname').value.trim();
    const port = parseInt(document.getElementById('port').value, 10) || 22;
    const username = document.getElementById('username').value.trim();
    const authType = document.getElementById('auth-type').value;
    const password = document.getElementById('password').value;
    const privateKey = document.getElementById('private-key').value;
    const passphrase = document.getElementById('passphrase').value;

    // Validation
    if (!hostname) return this._showError('Hostname is required');
    if (!username) return this._showError('Username is required');
    if (authType === 'password' && !password) return this._showError('Password is required');
    if (authType === 'key' && !privateKey) return this._showError('Private key is required');

    const btn = document.getElementById('connect-btn');
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    this._hideError();

    try {
      // Create session via API
      const res = await fetch(`${this.httpBaseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, port, username, authType })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create session');
      }

      const data = await res.json();
      const session = new SSHSession(data);

      // Create terminal
      const container = document.getElementById('terminal-container');
      container.innerHTML = '';
      await session.createTerminal(container);

      this.sessions.set(session.id, session);
      this.activeSessionId = session.id;

      // Connect via WebSocket
      await session.connect(this.wsBaseUrl, { password, privateKey, passphrase });

      // Show main layout
      this._showMainLayout();
      this._addSessionTab(session);
      this._renderFileTree();
      this._updateStatusBar();
      this._saveSessions();

    } catch (err) {
      this._showError(err.message || 'Connection failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }

    // Load file browser if connected
    if (this.sessions.get(this.activeSessionId)?.status === 'connected') {
      this._loadFileList('/');
      this._setupFileUpload();
    }
  },

  _showMainLayout() {
    document.getElementById('connection-form').style.display = 'none';
    document.getElementById('main-layout').style.display = 'flex';
  },

  _showConnectionForm() {
    // Only used for initial state (no sessions) - clear everything
    // Disconnect any active session
    for (const [id, session] of this.sessions) {
      session.disconnect();
      fetch(`${this.httpBaseUrl}/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    this.sessions.clear();
    this.activeSessionId = null;

    document.getElementById('main-layout').style.display = 'none';
    document.getElementById('connection-form').style.display = '';

    // Reset form
    document.getElementById('connect-btn').textContent = 'Connect';
    document.getElementById('connect-btn').disabled = false;
    document.getElementById('tabs').innerHTML = '';
    this._hideError();
    this._updateStatusBar();
    // Clear file tree
    document.getElementById('file-tree').innerHTML = '';
    this.dirCache = {};
    this.expandedDirs = new Set();
    this.currentTreePath = '/';
  },

  // Show floating mini-panel for new session (without disrupting existing sessions)
  _showMiniPanel() {
    // Reset mini panel form
    document.getElementById('mini-hostname').value = '';
    document.getElementById('mini-port').value = '22';
    document.getElementById('mini-username').value = '';
    document.getElementById('mini-auth-type').value = 'password';
    document.getElementById('mini-password').value = '';
    document.getElementById('mini-private-key').value = '';
    document.getElementById('mini-passphrase').value = '';
    document.getElementById('mini-password-group').style.display = '';
    document.getElementById('mini-key-group').style.display = 'none';
    document.getElementById('mini-passphrase-group').style.display = 'none';

    const btn = document.getElementById('mini-connect-btn');
    btn.disabled = false;
    btn.textContent = 'Connect';
    this._hideMiniError();

    document.getElementById('new-session-panel').style.display = 'flex';
    document.getElementById('mini-panel-backdrop').style.display = '';
    document.getElementById('mini-hostname').focus();
  },

  _hideMiniPanel() {
    document.getElementById('new-session-panel').style.display = 'none';
    document.getElementById('mini-panel-backdrop').style.display = 'none';
  },

  // Connect from mini panel - creates new session without disrupting existing ones
  async _handleMiniConnect() {
    const hostname = document.getElementById('mini-hostname').value.trim();
    const port = parseInt(document.getElementById('mini-port').value, 10) || 22;
    const username = document.getElementById('mini-username').value.trim();
    const authType = document.getElementById('mini-auth-type').value;
    const password = document.getElementById('mini-password').value;
    const privateKey = document.getElementById('mini-private-key').value;
    const passphrase = document.getElementById('mini-passphrase').value;

    if (!hostname) return this._showMiniError('Hostname is required');
    if (!username) return this._showMiniError('Username is required');
    if (authType === 'password' && !password) return this._showMiniError('Password is required');
    if (authType === 'key' && !privateKey) return this._showMiniError('Private key is required');

    const btn = document.getElementById('mini-connect-btn');
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    this._hideMiniError();

    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, port, username, authType })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create session');
      }

      const data = await res.json();
      const session = new SSHSession(data);

      // Create terminal in a new container div temporarily
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
      await session.createTerminal(tempDiv);

      this.sessions.set(session.id, session);
      this.activeSessionId = session.id;

      // Connect via WebSocket
      await session.connect(this.wsBaseUrl, { password, privateKey, passphrase });

      // Show main layout if not already shown
      this._showMainLayout();

      // Move terminal to the real container
      const container = document.getElementById('terminal-container');
      container.innerHTML = '';
      session.terminal.open(container);
      session.fit();
      document.body.removeChild(tempDiv);

      // Add tab and update UI
      this._addSessionTab(session);
      this._renderFileTree();
      this._updateStatusBar();
      this._saveSessions();

      // Close mini panel
      this._hideMiniPanel();

    } catch (err) {
      this._showMiniError(err.message || 'Connection failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }

    if (this.sessions.get(this.activeSessionId)?.status === 'connected') {
      this._loadFileList('/');
      this._setupFileUpload();
    }
  },

  _addSessionTab(session) {
    const tabs = document.getElementById('tabs');
    const tab = document.createElement('div');
    tab.className = 'tab active';
    tab.dataset.sessionId = session.id;
    tab.innerHTML = `
      <span>${session.username}@${session.hostname}:${session.port}</span>
      <button class="tab-close" data-session-id="${session.id}">&times;</button>
    `;

    // Deactivate other tabs
    tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    // Tab click - switch session
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) return;
      this._switchSession(session.id);
    });

    // Close button
    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      const name = `${session.username}@${session.hostname}:${session.port}`;
      if (confirm(`Close session ${name}?`)) {
        this._closeSession(session.id);
      }
    });

    tabs.appendChild(tab);
  },

  _switchSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.activeSessionId = sessionId;

    // Reset file tree for the new session
    this.dirCache = {};
    this.expandedDirs = new Set();
    this.currentTreePath = '/';

    // Update tabs
    document.querySelectorAll('#tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.sessionId === sessionId);
    });

    // Update terminal container
    const container = document.getElementById('terminal-container');
    container.innerHTML = '';
    if (session.terminal) {
      session.terminal.open(container);
      session.fit();
    }

    this._renderFileTree();
    this._updateStatusBar();
  },

  _closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.disconnect();
    this.sessions.delete(sessionId);

    // Remove tab
    const tab = document.querySelector(`.tab[data-session-id="${sessionId}"]`);
    if (tab) tab.remove();

    // Delete from server
    fetch(`${this.httpBaseUrl}/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});

    // Switch to another session
    if (this.sessions.size > 0) {
      const nextId = this.sessions.keys().next().value;
      this._switchSession(nextId);
    } else {
      this._showConnectionForm();
    }

    this._renderFileTree();
    this._updateStatusBar();
    this._saveSessions();
  },

  _renderFileTree() {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = '';

    const session = this.sessions.get(this.activeSessionId);
    if (!session || session.status !== 'connected') {
      tree.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:12px;">Not connected</div>';
      return;
    }

    // Render root node
    this._renderTreeNode(tree, '/', 0);
  },

  async _ensureDirLoaded(dirPath) {
    if (!this.dirCache) this.dirCache = {};
    if (!this.expandedDirs) this.expandedDirs = new Set();
    if (this.dirCache[dirPath]) return this.dirCache[dirPath];
    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}/files?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) return [];
      const data = await res.json();
      const sorted = [
        ...data.files.filter(f => f.type === 'directory').sort((a, b) => a.filename.localeCompare(b.filename)),
        ...data.files.filter(f => f.type === 'file').sort((a, b) => a.filename.localeCompare(b.filename))
      ];
      this.dirCache[dirPath] = sorted;
      return sorted;
    } catch {
      return [];
    }
  },

  async _renderTreeNode(container, dirPath, depth) {
    const children = await this._ensureDirLoaded(dirPath);
    const isExpanded = this.expandedDirs && this.expandedDirs.has(dirPath);

    // Parent directory node
    const node = document.createElement('div');
    node.className = `tree-node${dirPath === this.currentTreePath ? ' active' : ''}`;
    node.style.setProperty('--tree-depth', depth);

    const arrow = document.createElement('span');
    arrow.className = `tree-arrow${isExpanded ? ' expanded' : ''}`;
    if (children.some(c => c.type === 'directory')) {
      arrow.textContent = '▶';
    } else {
      arrow.className += ' placeholder';
      arrow.textContent = '▶';
    }
    node.appendChild(arrow);

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = dirPath === '/' ? '📁' : '📂';
    node.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = dirPath === '/' ? '/' : dirPath.split('/').filter(Boolean).pop();
    node.appendChild(name);

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (children.some(c => c.type === 'directory')) {
        this._toggleDir(dirPath);
      }
    });

    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e.clientX, e.clientY, dirPath, 'directory');
    });

    container.appendChild(node);

    // Children (if expanded)
    if (isExpanded) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      container.appendChild(childContainer);

      for (const entry of children) {
        if (entry.type === 'directory') {
          await this._renderTreeNode(childContainer, dirPath === '/' ? `/${entry.filename}` : `${dirPath}/${entry.filename}`, depth + 1);
        } else {
          this._renderFileNode(childContainer, dirPath, entry, depth + 1);
        }
      }
    }
  },

  _renderFileNode(container, dirPath, entry, depth) {
    const node = document.createElement('div');
    const fullPath = dirPath === '/' ? `/${entry.filename}` : `${dirPath}/${entry.filename}`;
    node.className = `tree-node${fullPath === this.currentTreePath ? ' active' : ''}`;
    node.style.setProperty('--tree-depth', depth);

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow placeholder';
    arrow.textContent = '▶';
    node.appendChild(arrow);

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '📄';
    node.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = entry.filename;
    node.appendChild(name);

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentTreePath = fullPath;
      this._renderFileTree();
    });

    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e.clientX, e.clientY, fullPath, 'file', entry.size);
    });

    container.appendChild(node);
  },

  async _toggleDir(dirPath) {
    if (!this.expandedDirs) this.expandedDirs = new Set();
    if (this.expandedDirs.has(dirPath)) {
      this.expandedDirs.delete(dirPath);
    } else {
      this.expandedDirs.add(dirPath);
    }
    // Clear cache to refresh on next expand
    delete this.dirCache[dirPath];
    await this._renderFileTree();
  },

  // Context menu
  _showContextMenu(x, y, path, type, size) {
    this._contextTarget = { path, type, size };
    const menu = document.getElementById('context-menu');

    // Show/hide items based on file type
    menu.querySelectorAll('.context-item').forEach(item => {
      const action = item.dataset.action;
      item.style.display = '';
    });

    menu.style.display = '';
    // Position within viewport
    const maxX = window.innerWidth - menu.offsetWidth - 10;
    const maxY = window.innerHeight - menu.offsetHeight - 10;
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';
  },

  _hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
    this._contextTarget = null;
  },

  async _contextDownload() {
    const target = this._contextTarget;
    this._hideContextMenu();
    if (!target) return;
    if (target.type === 'directory') {
      this._loadFileList(target.path);
      return;
    }

    try {
      const res = await fetch(
        `${this.httpBaseUrl}/sessions/${this.activeSessionId}/download-file?path=${encodeURIComponent(target.path)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = target.path.split('/').pop() || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  },

  _contextUpload() {
    const target = this._contextTarget;
    this._hideContextMenu();
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const remotePath = target && target.type === 'directory'
        ? (target.path === '/' ? `/${file.name}` : `${target.path}/${file.name}`)
        : `/${file.name}`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('remotePath', remotePath);

      try {
        const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}/upload`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        // Refresh the parent directory
        const parentPath = target && target.type === 'directory' ? target.path : '/';
        delete this.dirCache[parentPath];
        await this._renderFileTree();
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    };
    input.click();
  },

  async _contextMkdir() {
    const target = this._contextTarget;
    this._hideContextMenu();
    const name = prompt('Folder name:');
    if (!name) return;

    const parentPath = target && target.type === 'directory' ? target.path : '/';
    const remotePath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;

    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remotePath })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      delete this.dirCache[parentPath];
      await this._renderFileTree();
    } catch (err) {
      alert('Failed to create folder: ' + err.message);
    }
  },

  async _contextDelete() {
    const target = this._contextTarget;
    this._hideContextMenu();
    if (!target) return;

    if (!confirm(`Delete "${target.path.split('/').pop()}"?`)) return;

    const isDir = target.type === 'directory';
    const endpoint = isDir ? '/directories' : '/files';

    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}${endpoint}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remotePath: target.path })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const parentPath = target.path.split('/').slice(0, -1).join('/') || '/';
      delete this.dirCache[parentPath];
      await this._renderFileTree();
      if (isDir) {
        this._loadFileList(parentPath);
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  },

  async _contextRename() {
    const target = this._contextTarget;
    this._hideContextMenu();
    if (!target) return;

    const oldName = target.path.split('/').pop() || '';
    const newName = prompt('Rename to:', oldName);
    if (!newName || newName === oldName) return;

    const parentPath = target.path.split('/').slice(0, -1).join('/') || '/';
    const newPath = parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`;

    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: target.path, newPath })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      delete this.dirCache[parentPath];
      await this._renderFileTree();
    } catch (err) {
      alert('Rename failed: ' + err.message);
    }
  },

  updateSessionStatus(session) {
    this._updateStatusBar();
    this._renderFileTree();

    // Update status dot in sidebar
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    indicator.className = `status-dot ${session ? session.status : 'disconnected'}`;
    text.textContent = session ? session.status.charAt(0).toUpperCase() + session.status.slice(1) : 'Disconnected';
  },

  _updateStatusBar() {
    const session = this.sessions.get(this.activeSessionId);
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (session) {
      indicator.className = `status-dot ${session.status}`;
      text.textContent = session.status.charAt(0).toUpperCase() + session.status.slice(1);
    } else {
      indicator.className = 'status-dot disconnected';
      text.textContent = 'No session';
    }
  },

  _saveSessions() {
    const data = [];
    for (const session of this.sessions.values()) {
      data.push({
        id: session.id,
        hostname: session.hostname,
        port: session.port,
        username: session.username,
        authType: session.authType,
        status: session.status
      });
    }
    localStorage.setItem('ssh_sessions', JSON.stringify(data));
  },

  _loadSavedSessions() {
    try {
      const data = JSON.parse(localStorage.getItem('ssh_sessions') || '[]');
      if (data.length > 0) {
        console.log('Saved sessions found:', data.length);
      }
    } catch (e) {
      // ignore
    }
  },

  // ============================================================
  // File Browser
  // ============================================================

  currentFilePath: '/',

  async _loadFileList(path) {
    if (!this.activeSessionId) return;
    const list = document.getElementById('file-list');
    list.innerHTML = '<div class="file-item">Loading...</div>';

    try {
      const res = await fetch(
        `${this.httpBaseUrl}/sessions/${this.activeSessionId}/files?path=${encodeURIComponent(path)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      this.currentFilePath = data.path;
      document.getElementById('current-path').textContent = data.path;
      this._renderFileList(data.files);
    } catch (err) {
      list.innerHTML = `<div class="file-item error">Error: ${err.message}</div>`;
    }
  },

  _renderFileList(files) {
    const list = document.getElementById('file-list');
    list.innerHTML = '';

    // Parent directory entry
    if (this.currentFilePath !== '/') {
      const parentItem = document.createElement('div');
      parentItem.className = 'file-item';
      parentItem.innerHTML = `
        <span class="file-icon">📁</span>
        <span class="file-name">..</span>
      `;
      parentItem.addEventListener('click', () => {
        const parent = this.currentFilePath.split('/').slice(0, -1).join('/') || '/';
        this._loadFileList(parent);
      });
      list.appendChild(parentItem);
    }

    // Directories first, then files
    const sorted = [
      ...files.filter(f => f.type === 'directory').sort((a, b) => a.filename.localeCompare(b.filename)),
      ...files.filter(f => f.type === 'file').sort((a, b) => a.filename.localeCompare(b.filename))
    ];

    for (const file of sorted) {
      const item = document.createElement('div');
      item.className = 'file-item';
      const icon = file.type === 'directory' ? '📁' : this._getFileIcon(file.filename);
      const size = file.type === 'file' ? this._formatSize(file.size) : '';

      item.innerHTML = `
        <span class="file-icon">${icon}</span>
        <span class="file-name">${file.filename}</span>
        <span class="file-size">${size}</span>
      `;

      if (file.type === 'directory') {
        item.addEventListener('click', () => {
          const newPath = this.currentFilePath === '/'
            ? `/${file.filename}`
            : `${this.currentFilePath}/${file.filename}`;
          this._loadFileList(newPath);
        });
      } else {
        item.addEventListener('click', () => {
          this._selectedFile = file.filename;
          if (confirm(`Download ${file.filename}?`)) {
            this._downloadFile(file.filename);
          }
        });
      }

      list.appendChild(item);
    }
  },

  _getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      js: '📜', ts: '📘', json: '📋', md: '📝', txt: '📄',
      html: '🌐', css: '🎨', py: '🐍', java: '☕', go: '🔵',
      rs: '🦀', sh: '⚡', yml: '⚙', yaml: '⚙', toml: '⚙',
      conf: '⚙', cfg: '⚙', log: '📋', zip: '📦', tar: '📦',
      gz: '📦', bz2: '📦', rar: '📦', png: '🖼', jpg: '🖼',
      jpeg: '🖼', gif: '🖼', svg: '🖼', pdf: '📕', doc: '📕'
    };
    return icons[ext] || '📄';
  },

  _formatSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  },

  async _downloadFile(filename) {
    if (!this.activeSessionId) return;
    const remotePath = this.currentFilePath === '/'
      ? `/${filename}`
      : `${this.currentFilePath}/${filename}`;

    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remotePath })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  },

  async _uploadFile(file) {
    if (!this.activeSessionId) return;
    const remotePath = this.currentFilePath === '/'
      ? `/${file.name}`
      : `${this.currentFilePath}/${file.name}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('remotePath', remotePath);

    try {
      const progressEl = document.getElementById('upload-progress');
      const fillEl = document.getElementById('progress-fill');
      const textEl = document.getElementById('progress-text');
      progressEl.style.display = 'flex';
      fillEl.style.width = '0%';
      textEl.textContent = '0%';

      const res = await fetch(`${this.httpBaseUrl}/sessions/${this.activeSessionId}/upload`, {
        method: 'POST',
        body: formData
      });

      fillEl.style.width = '100%';
      textEl.textContent = '100%';

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 2000);

      this._loadFileList(this.currentFilePath);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
  },

  _showError(msg) {
    const el = document.getElementById('connection-error');
    el.textContent = msg;
    el.style.display = '';
  },

  _hideError() {
    document.getElementById('connection-error').style.display = 'none';
  },

  _showMiniError(msg) {
    const el = document.getElementById('mini-connection-error');
    el.textContent = msg;
    el.style.display = '';
  },

  _hideMiniError() {
    document.getElementById('mini-connection-error').style.display = 'none';
  },

  // File upload handler
  _setupFileUpload() {
    const fileList = document.getElementById('file-list');

    const onDrop = async (e) => {
      e.preventDefault();
      fileList.style.border = 'none';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await this._uploadFile(files[0]);
      }
    };

    const onDragOver = (e) => {
      e.preventDefault();
      fileList.style.border = '2px dashed var(--accent)';
    };

    const onDragLeave = () => {
      fileList.style.border = 'none';
    };

    fileList.addEventListener('drop', onDrop);
    fileList.addEventListener('dragover', onDragOver);
    fileList.addEventListener('dragleave', onDragLeave);

    // Also add upload via input
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'btn-small';
    uploadBtn.textContent = 'Upload';
    uploadBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        if (e.target.files[0]) this._uploadFile(e.target.files[0]);
      };
      input.click();
    });

    const toolbar = document.querySelector('.file-toolbar');
    toolbar.insertBefore(uploadBtn, document.getElementById('current-path'));

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-small';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => {
      if (this._selectedFile) {
        this._downloadFile(this._selectedFile);
      } else {
        alert('Click a file in the list first to select it for download.');
      }
    });
    toolbar.insertBefore(downloadBtn, document.getElementById('current-path'));
  }
};

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => App.init());
