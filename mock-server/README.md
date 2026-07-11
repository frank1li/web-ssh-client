# Mock SSH Server

A standalone Python SSH server with an in-memory virtual Linux filesystem for testing the Web SSH client without a real SSH server.

## Quick Start

```bash
cd mock-server
pip install -r requirements.txt
python mock_server.py
```

Then connect from the Web SSH client using:
- **Host**: `localhost`
- **Port**: `2222`
- **Username**: `mock`
- **Password**: `mock`

## Requirements

- Python 3.8+
- `paramiko` and `cryptography` (installed via `requirements.txt`)

## Usage

```
python mock_server.py [options]

Options:
  --host HOST         Bind address (default: 0.0.0.0)
  -p, --port PORT     SSH port (default: 2222)
  -u, --username USER Authentication username (default: mock)
  --password PASS     Authentication password (default: mock)
  --host-key PATH     Path to RSA host key file (default: ./host_key)
  --root-dir PATH     Path to real filesystem root for SFTP (default: ./mock-root)
  --log-file PATH     Path to log file (default: terminal stderr only)
  -c, --config PATH   Path to JSON config file (default: ./config.json)
```

### Configuration file

Create `config.json` in the `mock-server/` directory:

```json
{
    "host": "0.0.0.0",
    "port": 2222,
    "auth": {
        "username": "mock",
        "password": "mock"
    },
    "host_key": "./host_key"
}
```

CLI flags override config file values. Missing config file falls back to defaults.

### Host key

On first run, a 2048-bit RSA host key is automatically generated and cached in `host_key`. Subsequent runs reuse it.

## Features

### Shell (14 built-in commands)

| Command | Description |
|---------|-------------|
| `ls` | List directory contents (supports `-l`, `-a`, `-la`) |
| `cd` | Change directory |
| `pwd` | Print working directory |
| `cat` | Display file contents |
| `echo` | Repeat text |
| `whoami` | Show current user |
| `id` | Show user identity |
| `uname` | Show system info (`-a`, `-r`, `-m`, `-s`) |
| `date` | Show current date and time |
| `clear` | Clear terminal |
| `exit` | Disconnect |
| `help` | List commands |
| `history` | Show command history |
| `touch` | Create empty file or update file timestamp |

### SFTP

Full SFTP support: list directory, stat, read, write, create directory, delete, rename.

## Virtual Filesystem

Standard Linux top-level directories: `/bin`, `/boot`, `/dev`, `/etc`, `/home`, `/lib`, `/media`, `/mnt`, `/opt`, `/proc`, `/root`, `/run`, `/sbin`, `/srv`, `/sys`, `/tmp`, `/usr`, `/var`.

Files include representative content (e.g., `/etc/hostname`, `/proc/cpuinfo`, `/home/user/.bashrc`).

The filesystem is in-memory — all changes are lost when the server restarts.

## Architecture

```
mock-server/
├── requirements.txt     # Python dependencies
├── mock_server.py       # Entry point, config, CLI, server loop
├── mock_handler.py      # SSH ServerInterface, shell, SFTP handler
├── virtual_fs.py        # Virtual filesystem tree and seed data
├── config.json          # Optional user configuration
├── host_key             # Auto-generated RSA host key (cached)
└── README.md            # This file
```
