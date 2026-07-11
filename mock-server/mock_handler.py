"""SSH server interface, interactive shell, and SFTP handler for the mock server."""

import os
import stat
import time
import threading
import datetime

import paramiko
from paramiko import (
    AUTH_SUCCESSFUL, AUTH_FAILED,
    OPEN_SUCCEEDED, OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED,
    SFTP_OK,
    SFTPHandle, SFTPAttributes, SFTPServerInterface,
)


# ── SSH Server Interface ──────────────────────────────────────────────────


class MockSSHServer(paramiko.ServerInterface):
    """Handles SSH protocol negotiation: auth, channel, and subsystem requests."""

    def __init__(self, allowed_username, allowed_password):
        self.allowed_username = allowed_username
        self.allowed_password = allowed_password
        self.event = threading.Event()
        self.subsystem = None

    def check_auth_password(self, username, password):
        if username == self.allowed_username and password == self.allowed_password:
            return AUTH_SUCCESSFUL
        return AUTH_FAILED

    def get_allowed_auths(self, username):
        return "password"

    def check_channel_request(self, kind, chanid):
        if kind == "session":
            return OPEN_SUCCEEDED
        return OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

    def check_channel_shell_request(self, channel):
        self.subsystem = "shell"
        self.event.set()
        return True

    def check_channel_pty_request(self, channel, term, width, height, pixel_width, pixel_height, modes):
        return True

    def check_channel_env_request(self, channel, name, value):
        return True

    def check_channel_exec_request(self, channel, command):
        result = self._exec_command(channel, command.decode("utf-8", errors="replace"))
        channel.send(result.encode("utf-8", errors="replace"))
        channel.close()
        return True

    def check_channel_subsystem_request(self, channel, name):
        self.subsystem = name
        self.event.set()
        return True

    def check_channel_window_change_request(self, channel, width, height, pw, ph):
        return True

    def _exec_command(self, channel, command):
        """Execute a command (for exec channel requests, currently limited)."""
        parts = command.strip().split()
        if not parts:
            return ""
        cmd = parts[0]
        if cmd == "echo":
            return " ".join(parts[1:]) + "\n"
        if cmd == "whoami":
            return self.allowed_username + "\n"
        if cmd == "uname" and "-a" in parts:
            return "Linux mock-server 6.8.0-mock #1 SMP MockOS 1.0 x86_64 GNU/Linux\n"
        return f"{cmd}: command not found\n"


# ── Permissions string helper ─────────────────────────────────────────────


def _stat_mode_string(mode):
    """Convert a stat mode integer to an ls -l style string (e.g. 'drwxr-xr-x')."""
    s = ""
    if stat.S_ISDIR(mode):
        s += "d"
    elif stat.S_ISLNK(mode):
        s += "l"
    else:
        s += "-"
    s += "r" if mode & stat.S_IRUSR else "-"
    s += "w" if mode & stat.S_IWUSR else "-"
    s += "x" if mode & stat.S_IXUSR else "-"
    s += "r" if mode & stat.S_IRGRP else "-"
    s += "w" if mode & stat.S_IWGRP else "-"
    s += "x" if mode & stat.S_IXGRP else "-"
    s += "r" if mode & stat.S_IROTH else "-"
    s += "w" if mode & stat.S_IWOTH else "-"
    s += "x" if mode & stat.S_IXOTH else "-"
    return s


# ── Interactive Shell ──────────────────────────────────────────────────────


class ShellHandler:
    """Cooked-mode interactive shell with built-in commands and virtual FS.

    Receives raw keystrokes from the SSH channel, echoes characters, buffers
    input until Enter, then parses and executes one of the built-in commands.
    """

    _COLORS = {
        "green": "\033[01;32m",
        "blue": "\033[01;34m",
        "reset": "\033[00m",
    }

    _COMMANDS = (
        "ls  cd  pwd  cat  echo  whoami  id  "
        "uname  date  clear  exit  help"
    )

    def __init__(self, channel, fs, username="mock"):
        self.channel = channel
        self.fs = fs
        self.username = username
        self.hostname = "mock-server"
        self.cwd = "/home/user"
        self._buffer = ""

    # ── Public API ──────────────────────────────────────────────────────

    def start(self):
        """Run the shell loop (blocking). Sends prompt, reads input, dispatches."""
        self.channel.send(self._prompt())
        while True:
            try:
                data = self.channel.recv(1024)
            except (EOFError, OSError):
                break
            if not data:
                break

            for byte in data:
                char = bytes([byte])

                if char in (b"\r", b"\n"):  # Enter
                    self.channel.send(b"\r\n")
                    cmd = self._buffer.strip()
                    self._buffer = ""
                    if cmd:
                        try:
                            self._execute(cmd)
                        except SystemExit:
                            return
                    self.channel.send(self._prompt())

                elif char == b"\x7f":  # Backspace
                    if self._buffer:
                        self._buffer = self._buffer[:-1]
                        self.channel.send(b"\b \b")  # Erase on terminal

                elif char == b"\x03":  # Ctrl+C
                    self._buffer = ""
                    self.channel.send(b"^C\r\n")
                    self.channel.send(self._prompt())

                elif char == b"\x04":  # Ctrl+D
                    if not self._buffer:
                        self.channel.send(b"\r\n")
                        return

                elif 0x20 <= byte <= 0x7e:  # Printable ASCII
                    self._buffer += char.decode()
                    self.channel.send(char)

        self.channel.close()

    # ── Prompt ──────────────────────────────────────────────────────────

    def _prompt(self):
        """Return a coloured shell prompt like ``user@mock-server:~$ ``."""
        short = self.cwd.replace("/home/user", "~")
        c = self._COLORS
        return f"{c['green']}{self.username}@{self.hostname}{c['reset']}:{c['blue']}{short}{c['reset']}$ "

    def _writeline(self, text=""):
        """Append CRLF and send *text* to the channel."""
        self.channel.send(text + "\r\n")

    # ── Command dispatch ────────────────────────────────────────────────

    def _execute(self, cmdline):
        parts = cmdline.split()
        cmd = parts[0]
        args = parts[1:]

        handler = {
            "ls": self._cmd_ls,
            "cd": self._cmd_cd,
            "pwd": self._cmd_pwd,
            "cat": self._cmd_cat,
            "echo": self._cmd_echo,
            "whoami": self._cmd_whoami,
            "id": self._cmd_id,
            "uname": self._cmd_uname,
            "date": self._cmd_date,
            "clear": self._cmd_clear,
            "exit": self._cmd_exit,
            "help": self._cmd_help,
        }.get(cmd)

        if handler:
            handler(args)
        else:
            self._writeline(
                f"bash: {cmd}: command not found"
                f" (try 'help' for available commands)"
            )

    # ── Built-in commands ───────────────────────────────────────────────

    def _cmd_ls(self, args):
        target = self.cwd
        show_all = False
        long_format = False

        # Parse flags and optional path
        for arg in args:
            if arg.startswith("-") and not arg.startswith("--"):
                show_all = show_all or ("a" in arg[1:])
                long_format = long_format or ("l" in arg[1:])
            else:
                target = self.fs.normalize_path(arg, self.cwd)

        entries = self.fs.readdir(target)
        if entries is None:
            self._writeline(
                f"ls: cannot access '{target}': No such file or directory"
            )
            return

        if long_format:
            self._writeline("total 80")
            for name, attr in entries:
                if name.startswith(".") and not show_all:
                    continue
                mode_str = _stat_mode_string(attr["st_mode"])
                nlink = 2 if stat.S_ISDIR(attr["st_mode"]) else 1
                owner = "mock" if attr["st_uid"] == 1000 else "root"
                group = "mock" if attr["st_gid"] == 1000 else "root"
                size = attr["st_size"]
                mtime = time.strftime(
                    "%b %d %H:%M", time.localtime(attr["st_mtime"])
                )
                self._writeline(
                    f"{mode_str} {nlink} {owner} {group} "
                    f"{size:>8} {mtime} {name}"
                )
        else:
            items = []
            for name, _ in entries:
                if name.startswith(".") and not show_all:
                    continue
                items.append(name)
            # Columnated output
            cols = 4
            col_width = max((len(i) for i in items), default=20) + 2
            for i, name in enumerate(items):
                self.channel.send(name.ljust(col_width))
                if (i + 1) % cols == 0:
                    self.channel.send(b"\r\n")
            if items:
                self.channel.send(b"\r\n")

    def _cmd_cd(self, args):
        if not args or args[0] in ("~", "--"):
            target = "/home/user"
        else:
            target = self.fs.normalize_path(args[0], self.cwd)

        node = self.fs._resolve(target)
        if node is None:
            self._writeline(f"cd: {args[0]}: No such file or directory")
        elif not node.is_dir:
            self._writeline(f"cd: {args[0]}: Not a directory")
        else:
            self.cwd = target

    def _cmd_pwd(self, args):
        self._writeline(self.cwd)

    def _cmd_cat(self, args):
        if not args:
            self._writeline("")
            return
        path = self.fs.normalize_path(args[0], self.cwd)
        content = self.fs.read(path)
        if content is None:
            node = self.fs._resolve(path)
            if node and node.is_dir:
                self._writeline(f"cat: {args[0]}: Is a directory")
            else:
                self._writeline(f"cat: {args[0]}: No such file or directory")
        else:
            self.channel.send(content + b"\r\n")

    def _cmd_echo(self, args):
        self._writeline(" ".join(args))

    def _cmd_whoami(self, args):
        self._writeline(self.username)

    def _cmd_id(self, args):
        self._writeline(
            f"uid=1000({self.username}) gid=1000({self.username}) "
            f"groups=1000({self.username}),4(adm),27(sudo)"
        )

    def _cmd_uname(self, args):
        if "-a" in args:
            self._writeline(
                "Linux mock-server 6.8.0-mock #1 SMP MockOS 1.0 "
                "x86_64 GNU/Linux"
            )
        elif "-r" in args:
            self._writeline("6.8.0-mock")
        elif "-m" in args:
            self._writeline("x86_64")
        elif "-s" in args or not args:
            self._writeline("Linux")
        else:
            self._writeline("Linux mock-server 6.8.0-mock")

    def _cmd_date(self, args):
        self._writeline(
            time.strftime("%a %b %d %H:%M:%S %Z %Y")
        )

    def _cmd_clear(self, args):
        self.channel.send("\033[2J\033[H")

    def _cmd_exit(self, args):
        self.channel.send(b"\r\n")
        self.channel.close()
        raise SystemExit()

    def _cmd_help(self, args):
        self._writeline(
            "Available commands:\r\n"
            "  ls       List directory contents\r\n"
            "  cd       Change the current directory\r\n"
            "  pwd      Print the current working directory\r\n"
            "  cat      Display the contents of a file\r\n"
            "  echo     Repeat text back to the terminal\r\n"
            "  whoami   Show the current username\r\n"
            "  id       Display user identity information\r\n"
            "  uname    Show system/kernel information\r\n"
            "  date     Show the current date and time\r\n"
            "  clear    Clear the terminal screen\r\n"
            "  exit     Disconnect from this session\r\n"
            "  help     Show this help message"
        )


# ── SFTP Handler ──────────────────────────────────────────────────────────


class MockSFTPHandle(SFTPHandle):
    """A file handle for a virtual file, used for read/write/close."""

    def __init__(self, path, flags, node):
        super().__init__(flags=flags)
        self.path = path
        self.node = node
        self._closed = False

    def read(self, offset, length):
        if self._closed:
            return b""
        return self.node.content[offset:offset + length]

    def write(self, offset, data):
        if self._closed:
            return SFTP_OK
        content = self.node.content
        if offset + len(data) > len(content):
            # Extend file content with zeros if writing beyond current EOF
            new_content = bytearray(content)
            if offset > len(new_content):
                new_content.extend(b"\x00" * (offset - len(new_content)))
            new_content[offset:offset + len(data)] = data
            self.node.content = bytes(new_content)
        else:
            before = content[:offset]
            after = content[offset + len(data):]
            self.node.content = before + data + after
        return SFTP_OK

    def close(self):
        self._closed = True
        return SFTP_OK


class MockSFTPServer(SFTPServerInterface):
    """SFTP server interface backed by the virtual filesystem."""

    def __init__(self, server, fs=None, *args, **kwargs):
        """server is the MockSSHServer instance (passed by SFTPServer)."""
        super().__init__(server, *args, **kwargs)
        self.fs = fs

    def _build_attr(self, attr_dict):
        """Build a paramiko SFTPAttributes from our attr dict."""
        attr = SFTPAttributes()
        attr.st_mode = attr_dict["st_mode"]
        attr.st_size = attr_dict["st_size"]
        attr.st_uid = attr_dict["st_uid"]
        attr.st_gid = attr_dict["st_gid"]
        attr.st_mtime = attr_dict["st_mtime"]
        attr.st_atime = attr_dict["st_atime"]
        return attr

    def list_folder(self, path):
        try:
            entries = self.fs.readdir(path)
        except Exception:
            return paramiko.SFTP_NO_SUCH_FILE
        if entries is None:
            return paramiko.SFTP_NO_SUCH_FILE
        result = []
        for name, attr_dict in entries:
            sf_attr = self._build_attr(attr_dict)
            sf_attr.filename = name
            result.append(sf_attr)
        return result

    def stat(self, path):
        try:
            attr_dict = self.fs.stat(path)
        except Exception:
            return paramiko.SFTP_NO_SUCH_FILE
        if attr_dict is None:
            return paramiko.SFTP_NO_SUCH_FILE
        return self._build_attr(attr_dict)

    def lstat(self, path):
        return self.stat(path)

    def open(self, path, flags, attr):
        node = self.fs._resolve(path)
        if node is None:
            # File doesn't exist — create if O_CREAT is set
            if flags & os.O_CREAT:
                self.fs.write(path, b"")
                node = self.fs._resolve(path)
                if node is None:
                    return paramiko.SFTP_FAILURE
            else:
                return paramiko.SFTP_NO_SUCH_FILE
        if node.is_dir:
            return paramiko.SFTP_FAILURE

        return MockSFTPHandle(path, flags, node)

    def mkdir(self, path, attr):
        try:
            if self.fs.mkdir(path):
                return SFTP_OK
            if self.fs.exists(path):
                return paramiko.SFTP_FAILURE
            return paramiko.SFTP_PERMISSION_DENIED
        except Exception:
            return paramiko.SFTP_FAILURE

    def rmdir(self, path):
        try:
            if self.fs.rmdir(path):
                return SFTP_OK
            return paramiko.SFTP_NO_SUCH_FILE
        except Exception:
            return paramiko.SFTP_FAILURE

    def remove(self, path):
        try:
            if self.fs.unlink(path):
                return SFTP_OK
            return paramiko.SFTP_NO_SUCH_FILE
        except Exception:
            return paramiko.SFTP_FAILURE

    def rename(self, oldpath, newpath):
        try:
            if self.fs.rename(oldpath, newpath):
                return SFTP_OK
            return paramiko.SFTP_NO_SUCH_FILE
        except Exception:
            return paramiko.SFTP_FAILURE


# ── Connection dispatcher ──────────────────────────────────────────────────


def handle_connection(client_sock, addr, fs, config):
    """Handle a single SSH client connection.

    Runs the transport handshake → auth → channel dispatch in a blocking
    fashion (intended to be called from a thread).
    """
    transport = paramiko.Transport(client_sock)
    transport.add_server_key(config["host_key_obj"])

    server = MockSSHServer(config["auth"]["username"], config["auth"]["password"])

    try:
        transport.start_server(server=server)
    except paramiko.SSHException:
        transport.close()
        return

    # Accept a channel (first channel opened by the client)
    channel = transport.accept(30)
    if channel is None:
        transport.close()
        return

    # Wait for the shell/subsystem request callback to fire
    server.event.wait(10)

    try:
        if server.subsystem == "shell":
            ShellHandler(channel, fs, username=config["auth"]["username"]).start()
        elif server.subsystem == "sftp":
            sftp = paramiko.SFTPServer(channel, "sftp", server, MockSFTPServer, fs=fs)
            sftp.start()
            sftp.join()
        else:
            channel.close()
    except (EOFError, OSError, paramiko.SSHException):
        pass
    finally:
        transport.close()
