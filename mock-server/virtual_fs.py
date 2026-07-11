"""In-memory virtual Linux filesystem for the mock SSH server."""

import os
import stat
import time


class VirtualNode:
    """A node in the virtual filesystem tree (file or directory)."""

    def __init__(self, name, is_dir=False, content=b"", permissions=None):
        self.name = name
        self.is_dir = is_dir
        self.content = content if not is_dir else b""
        self.children = {} if is_dir else None
        self.permissions = permissions or (stat.S_IFDIR | 0o755 if is_dir else stat.S_IFREG | 0o644)
        self.owner = "root"
        self.group = "root"
        self.mtime = int(time.time())

    @property
    def size(self):
        if self.is_dir:
            return 4096
        return len(self.content)

    def copy(self, new_name=None):
        """Create a shallow copy of this node."""
        node = VirtualNode(
            name=new_name or self.name,
            is_dir=self.is_dir,
            content=self.content,
            permissions=self.permissions,
        )
        node.owner = self.owner
        node.group = self.group
        node.mtime = self.mtime
        if self.is_dir and self.children:
            for child_name, child in self.children.items():
                node.children[child_name] = child.copy()
        return node

    def to_attr(self):
        """Return a dict of stat-like attributes (paramiko SFTPAttributes compatible)."""
        return {
            "st_mode": self.permissions,
            "st_size": self.size,
            "st_uid": 0 if self.owner == "root" else 1000,
            "st_gid": 0 if self.group == "root" else 1000,
            "st_mtime": self.mtime,
            "st_atime": self.mtime,
        }


def _mkdir(fs, path):
    """Helper to create a directory node in the filesystem dict."""
    parts = [p for p in path.split("/") if p]
    current = fs
    for part in parts:
        if part not in current:
            node = VirtualNode(part, is_dir=True)
            current[part] = node
        current = current[part].children
    return current


def _mkfile(fs, path, content=b"", permissions=None):
    """Helper to create a file node in the filesystem dict."""
    parts = [p for p in path.split("/") if p]
    filename = parts[-1]
    parent_parts = parts[:-1]
    current = fs
    for part in parent_parts:
        current = current[part].children
    node = VirtualNode(filename, content=content, permissions=permissions)
    current[filename] = node
    return node


def _make_seed_filesystem():
    """Build and return the root VirtualNode with a complete Linux filesystem tree."""
    root = VirtualNode("", is_dir=True, permissions=stat.S_IFDIR | 0o755)

    top_dirs = [
        "bin", "boot", "dev", "etc", "home", "lib", "media", "mnt",
        "opt", "proc", "root", "run", "sbin", "srv", "sys", "tmp", "usr", "var",
    ]
    for d in top_dirs:
        _mkdir(root.children, d)

    # --- /etc ---
    _mkfile(root.children, "etc/hostname", b"mock-server\n")
    _mkfile(root.children, "etc/passwd", (
        b"root:x:0:0:root:/root:/bin/bash\n"
        b"mock:x:1000:1000:Mock User,,,:/home/mock:/bin/bash\n"
        b"user:x:1001:1001:Regular User,,,:/home/user:/bin/bash\n"
    ))
    _mkfile(root.children, "etc/shadow", (
        b"root:!:19876:0:99999:7:::\n"
        b"mock:$6$salt$hash:19876:0:99999:7:::\n"
        b"user:$6$salt$hash:19876:0:99999:7:::\n"
    ))
    _mkfile(root.children, "etc/group", (
        b"root:x:0:\n"
        b"users:x:100:\n"
        b"mock:x:1000:\n"
        b"user:x:1001:\n"
    ))
    _mkfile(root.children, "etc/hosts", (
        b"127.0.0.1\tlocalhost\n"
        b"127.0.1.1\tmock-server\n"
        b"::1\tlocalhost ip6-localhost ip6-loopback\n"
    ))
    _mkfile(root.children, "etc/resolv.conf", (
        b"nameserver 8.8.8.8\n"
        b"nameserver 8.8.4.4\n"
    ))
    _mkfile(root.children, "etc/fstab", (
        b"# /etc/fstab: static file system information\n"
        b"UUID=1234-5678\t/\text4\terrors=remount-ro\t0\t1\n"
        b"UUID=9abc-def0\t/home\text4\tdefaults\t0\t2\n"
    ))
    _mkfile(root.children, "etc/os-release", (
        b"NAME=\"MockOS\"\n"
        b"VERSION=\"1.0\"\n"
        b"ID=mockos\n"
        b"PRETTY_NAME=\"MockOS 1.0\"\n"
        b"VERSION_CODENAME=mock\n"
    ))
    _mkfile(root.children, "etc/shells", (
        b"/bin/bash\n/bin/sh\n/usr/bin/zsh\n/usr/bin/fish\n"
    ))
    _mkfile(root.children, "etc/issue", b"MockOS 1.0 \\n \\l\n\n")

    _mkdir(root.children, "etc/ssh")
    _mkfile(root.children, "etc/ssh/sshd_config", (
        b"Port 22\n"
        b"PermitRootLogin yes\n"
        b"PasswordAuthentication yes\n"
        b"PubkeyAuthentication yes\n"
    ))

    _mkdir(root.children, "etc/nginx")
    _mkfile(root.children, "etc/nginx/nginx.conf", (
        b"worker_processes 1;\n"
        b"events { worker_connections 1024; }\n"
        b"http {\n"
        b"    server {\n"
        b"        listen 80;\n"
        b"        server_name localhost;\n"
        b"    }\n"
        b"}\n"
    ))

    _mkdir(root.children, "etc/init.d")
    _mkfile(root.children, "etc/init.d/ssh", b"#!/bin/sh\nexit 0\n", permissions=stat.S_IFREG | 0o755)

    # --- /proc ---
    _mkfile(root.children, "proc/cpuinfo", (
        b"processor\t: 0\n"
        b"vendor_id\t: GenuineMock\n"
        b"cpu family\t: 42\n"
        b"model\t\t: 1\n"
        b"model name\t: Mock CPU v1.0\n"
        b"cpu MHz\t\t: 2400.000\n"
        b"cache size\t: 4096 KB\n"
    ))
    _mkfile(root.children, "proc/meminfo", (
        b"MemTotal:        4048576 kB\n"
        b"MemFree:         2048576 kB\n"
        b"MemAvailable:    3048576 kB\n"
        b"Buffers:          104576 kB\n"
        b"Cached:           500000 kB\n"
        b"SwapTotal:       1048576 kB\n"
        b"SwapFree:        1048576 kB\n"
    ))
    _mkfile(root.children, "proc/version", (
        b"Linux version 6.8.0-mock (build@mock-server) "
        b"(gcc (MockGCC) 14.0.1) #1 SMP MockOS 1.0\n"
    ))
    _mkfile(root.children, "proc/uptime", b"12345.67 98765.43\n")

    _mkdir(root.children, "proc/1")

    # --- /dev ---
    _mkfile(root.children, "dev/null", b"")
    _mkfile(root.children, "dev/zero", b"\x00" * 4096)
    _mkfile(root.children, "dev/random", b"")

    _mkdir(root.children, "dev/pts")

    # --- /home ---
    _mkdir(root.children, "home/user")
    _mkfile(root.children, "home/user/.bashrc", (
        b'# ~/.bashrc: executed by bash(1) for non-login shells.\n'
        b'export PS1=\'\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ \'\n'
        b'alias ll=\'ls -l\'\n'
        b'alias la=\'ls -la\'\n'
        b'alias grep=\'grep --color=auto\'\n'
    ))
    _mkfile(root.children, "home/user/.profile", (
        b'# ~/.profile: executed by Bourne-compatible login shells.\n'
        b'if [ "$BASH" ]; then\n'
        b'    if [ -f ~/.bashrc ]; then\n'
        b'        . ~/.bashrc\n'
        b'    fi\n'
        b'fi\n'
        b'export EDITOR=nano\n'
    ))
    _mkfile(root.children, "home/user/.gitconfig", (
        b'[user]\n'
        b'\tname = Mock User\n'
        b'\temail = mock@example.com\n'
    ))

    _mkdir(root.children, "home/user/.ssh")
    _mkfile(root.children, "home/user/.ssh/authorized_keys", (
        b"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ mock-key-for-testing\n"
    ))
    _mkfile(root.children, "home/user/.ssh/id_rsa.pub", (
        b"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ mock-key-for-testing\n"
    ))

    _mkdir(root.children, "home/user/documents")
    _mkfile(root.children, "home/user/documents/readme.txt", (
        b"Welcome to the Mock SSH Server!\n"
        b"================================\n"
        b"\n"
        b"This is a virtual Linux environment for testing the Web SSH client.\n"
        b"\n"
        b"Available commands:\n"
        b"  ls, cd, pwd, cat, echo, whoami, id, uname, date,\n"
        b"  clear, exit, help\n"
        b"\n"
        b"The filesystem is in-memory and will reset when the server restarts.\n"
    ))

    _mkdir(root.children, "home/user/downloads")
    _mkdir(root.children, "home/user/Desktop")
    _mkdir(root.children, "home/user/Projects")

    # --- /root ---
    _mkfile(root.children, "root/.bashrc", b'export PS1=\'root@mock-server:~# \'\n')

    # --- /tmp --- (empty)

    # --- /usr ---
    _mkdir(root.children, "usr/bin")
    _mkdir(root.children, "usr/lib")
    _mkdir(root.children, "usr/share")
    _mkdir(root.children, "usr/share/man")
    _mkdir(root.children, "usr/local")
    _mkdir(root.children, "usr/local/bin")

    # --- /var ---
    _mkdir(root.children, "var/log")
    _mkfile(root.children, "var/log/syslog", (
        b"Jan  1 00:00:01 mock-server systemd[1]: Starting Mock SSH Server...\n"
        b"Jan  1 00:00:02 mock-server systemd[1]: Started Mock SSH Server.\n"
        b"Jan  1 00:00:03 mock-server sshd[42]: Server listening on 0.0.0.0 port 22.\n"
    ), permissions=stat.S_IFREG | 0o640)
    _mkfile(root.children, "var/log/auth.log", (
        b"Jan  1 00:00:03 mock-server sshd[42]: Starting OpenSSH: MockOS\n"
        b"Jan  1 00:00:05 mock-server sshd[43]: Accepted password for mock from 127.0.0.1 port 54321\n"
    ), permissions=stat.S_IFREG | 0o640)
    _mkfile(root.children, "var/log/dmesg", (
        b"[    0.000000] Mock kernel booting...\n"
        b"[    0.001000] CPU: Mock CPU v1.0 detected\n"
        b"[    0.002000] Memory: 4048576K available\n"
    ))

    _mkdir(root.children, "var/spool")
    _mkdir(root.children, "var/spool/mail")
    _mkdir(root.children, "var/tmp")
    _mkdir(root.children, "var/cache")

    # --- /bin ---
    _mkfile(root.children, "bin/bash", (
        b"#!/bin/bash\n"
    ), permissions=stat.S_IFREG | 0o755)
    _mkfile(root.children, "bin/sh", b"", permissions=stat.S_IFREG | 0o755)
    _mkfile(root.children, "bin/ls", b"", permissions=stat.S_IFREG | 0o755)
    _mkfile(root.children, "bin/cat", b"", permissions=stat.S_IFREG | 0o755)

    # --- /sbin ---
    _mkfile(root.children, "sbin/init", b"", permissions=stat.S_IFREG | 0o755)

    # --- /boot ---
    _mkdir(root.children, "boot/grub")
    _mkfile(root.children, "boot/grub/grub.cfg", (
        b"set default=0\n"
        b"set timeout=5\n"
        b"menuentry 'MockOS' {\n"
        b"    linux /vmlinuz root=/dev/sda1 ro\n"
        b"}\n"
    ))

    # --- /lib ---
    _mkdir(root.children, "lib/modules")

    # --- /mnt --- (empty)
    # --- /media --- (empty)
    # --- /opt --- (empty)
    # --- /srv --- (empty)
    # --- /sys --- (empty)
    # --- /run --- (empty)
    # --- /dev/pts --- (empty)

    return root


class VirtualFilesystem:
    """In-memory virtual filesystem with path resolution and CRUD operations."""

    def __init__(self):
        self.root = _make_seed_filesystem()

    def _resolve(self, path):
        """Resolve a path string to a VirtualNode. Returns None if not found."""
        path = path.replace("\\", "/")
        if path == "/":
            return self.root
        parts = [p for p in path.split("/") if p]
        current = self.root
        for part in parts:
            if part == "..":
                # Can't go above root
                continue
            if part == ".":
                continue
            if part not in current.children:
                return None
            current = current.children[part]
        return current

    def _resolve_parent(self, path):
        """Resolve path to (parent_node, child_name). Returns (None, None) on failure."""
        path = path.replace("\\", "/")
        normal = os.path.normpath(path).replace("\\", "/")
        parent_path = os.path.dirname(normal) or "/"
        child_name = os.path.basename(normal)
        if parent_path == "/":
            return self.root, child_name
        parent = self._resolve(parent_path)
        if parent is None or not parent.is_dir:
            return None, None
        return parent, child_name

    def exists(self, path):
        """Check if a path exists in the virtual filesystem."""
        return self._resolve(path) is not None

    def is_dir(self, path):
        """Check if path is a directory."""
        node = self._resolve(path)
        return node is not None and node.is_dir

    def is_file(self, path):
        """Check if path is a file."""
        node = self._resolve(path)
        return node is not None and not node.is_dir

    def readdir(self, path):
        """List directory contents. Returns list of (name, attr_dict) or None."""
        node = self._resolve(path)
        if node is None or not node.is_dir:
            return None
        entries = [(".", node.to_attr()), ("..", node.to_attr())]
        for name, child in sorted(node.children.items()):
            entries.append((name, child.to_attr()))
        return entries

    def stat(self, path):
        """Get file/directory attributes dict. Returns None if not found."""
        node = self._resolve(path)
        if node is None:
            return None
        return node.to_attr()

    def read(self, path):
        """Read file content. Returns bytes or None."""
        node = self._resolve(path)
        if node is None or node.is_dir:
            return None
        return node.content

    def write(self, path, data):
        """Write data to a file. Creates parent path if needed. Returns True on success."""
        parent, name = self._resolve_parent(path)
        if parent is None:
            return False
        if name in parent.children:
            node = parent.children[name]
            if node.is_dir:
                return False
            node.content = data if isinstance(data, bytes) else data.encode()
            node.mtime = int(time.time())
        else:
            node = VirtualNode(
                name,
                content=data if isinstance(data, bytes) else data.encode(),
            )
            parent.children[name] = node
        return True

    def mkdir(self, path):
        """Create a directory. Returns True on success."""
        parent, name = self._resolve_parent(path)
        if parent is None:
            return False
        if name in parent.children:
            return False  # Already exists
        node = VirtualNode(name, is_dir=True)
        parent.children[name] = node
        return True

    def rmdir(self, path):
        """Remove an empty directory. Returns True on success."""
        parent, name = self._resolve_parent(path)
        if parent is None:
            return False
        if name not in parent.children:
            return False
        node = parent.children[name]
        if not node.is_dir:
            return False
        if node.children:
            return False  # Not empty
        del parent.children[name]
        return True

    def unlink(self, path):
        """Delete a file. Returns True on success."""
        parent, name = self._resolve_parent(path)
        if parent is None:
            return False
        if name not in parent.children:
            return False
        node = parent.children[name]
        if node.is_dir:
            return False
        del parent.children[name]
        return True

    def rename(self, old_path, new_path):
        """Rename/move a file or directory. Returns True on success."""
        old_parent, old_name = self._resolve_parent(old_path)
        if old_parent is None or old_name not in old_parent.children:
            return False
        new_parent, new_name = self._resolve_parent(new_path)
        if new_parent is None:
            return False
        node = old_parent.children[old_name]
        if new_name in new_parent.children:
            return False
        node.name = new_name
        new_parent.children[new_name] = node
        del old_parent.children[old_name]
        return True

    def normalize_path(self, path, cwd="/"):
        """Resolve a potentially relative path against a working directory."""
        if path.startswith("~"):
            path = "/home/user" + path[1:]
        if not path.startswith("/"):
            path = os.path.join(cwd, path)
        return os.path.normpath(path).replace("\\", "/")
