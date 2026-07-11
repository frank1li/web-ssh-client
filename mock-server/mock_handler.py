"""SSH server interface, interactive shell, and SFTP handler for the mock server."""

import logging
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

logger = logging.getLogger(__name__)


# ── SSH Server Interface ──────────────────────────────────────────────────


class MockSSHServer(paramiko.ServerInterface):
    """Handles SSH protocol negotiation: auth, channel, and subsystem requests."""

    def __init__(self, allowed_username, allowed_password):
        self.allowed_username = allowed_username
        self.allowed_password = allowed_password
        self.event = threading.Event()
        self._subsystem_types = {}
        self._lock = threading.Lock()

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
        with self._lock:
            self._subsystem_types[channel.chanid] = "shell"
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
        with self._lock:
            self._subsystem_types[channel.chanid] = name
        self.event.set()
        return True

    def check_channel_window_change_request(self, channel, width, height, pw, ph):
        return True

    def pop_channel_type(self, channel):
        """Get and remove the stored subsystem/shell type for a channel."""
        with self._lock:
            return self._subsystem_types.pop(channel.chanid, None)

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
        "uname  date  clear  exit  help  history  touch"
    )

    def __init__(self, channel, fs, username="mock"):
        self.channel = channel
        self.fs = fs
        self.username = username
        self.hostname = "mock-server"
        self.cwd = "/home/user"
        self._buffer = ""
        self._history = []
        self._history_index = -1
        self._saved_line = ""
        self._escape_buf = None
        self._load_history()

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
                # ── Escape sequence (arrow keys) ──────────────────────
                if self._escape_buf is not None:
                    self._escape_buf += bytes([byte])
                    if len(self._escape_buf) >= 3:
                        if self._escape_buf == b"\x1b[A":
                            self._history_up()
                        elif self._escape_buf == b"\x1b[B":
                            self._history_down()
                        self._escape_buf = None
                    elif len(self._escape_buf) == 2 and self._escape_buf[1:2] != b"[":
                        # Not a CSI sequence, discard
                        self._escape_buf = None
                    continue

                if byte == 0x1b:  # Start of escape sequence
                    self._escape_buf = b"\x1b"
                    continue

                # ── Normal byte processing ────────────────────────────
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
                        self._add_history(cmd)
                    self.channel.send(self._prompt())

                elif char == b"\x7f":  # Backspace
                    if self._buffer:
                        self._buffer = self._buffer[:-1]
                        self.channel.send(b"\b \b")

                elif char == b"\x03":  # Ctrl+C
                    self._buffer = ""
                    self._history_index = -1
                    self.channel.send(b"^C\r\n")
                    self.channel.send(self._prompt())

                elif char == b"\x04":  # Ctrl+D
                    if not self._buffer:
                        self.channel.send(b"\r\n")
                        return

                elif char == b"\t":  # Tab completion
                    self._tab_complete()

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

    # ── Tab completion ──────────────────────────────────────────────────

    def _show_completions(self, matches):
        """Print completion candidates and re-display the prompt + buffer."""
        if not matches:
            return
        self.channel.send(b"\r\n")
        # Columnated output
        cols = 4
        col_w = max(len(m) for m in matches) + 2
        for i, m in enumerate(matches):
            self.channel.send(m.ljust(col_w).encode())
            if (i + 1) % cols == 0:
                self.channel.send(b"\r\n")
        self.channel.send(b"\r\n")
        self.channel.send(self._prompt().encode())
        self.channel.send(self._buffer.encode())

    def _tab_complete(self):
        """Handle Tab: try to complete the current buffer word."""
        if not self._buffer:
            self._show_completions(self._COMMANDS.split())
            return

        parts = self._buffer.split()
        starting_new_word = self._buffer.endswith(" ")

        # ── Command completion (first word) ──────────────────────────
        if len(parts) == 1 and not starting_new_word:
            prefix = parts[0].lower()
            matches = [c for c in self._COMMANDS.split() if c.startswith(prefix)]
            if len(matches) == 1 and matches[0] != prefix:
                suffix = matches[0][len(prefix):] + " "
                self._buffer += suffix
                self.channel.send(suffix.encode())
            elif len(matches) > 1:
                self._show_completions(matches)
            return

        # ── Path completion (arguments) ──────────────────────────────
        # Determine directory and prefix
        if starting_new_word:
            dir_abs = self.cwd
            raw_prefix = ""
        else:
            word = parts[-1]
            if "/" in word:
                dir_path = word[:word.rfind("/")] or "/"
                raw_prefix = word[word.rfind("/") + 1:]
            else:
                dir_path = self.cwd
                raw_prefix = word
            dir_abs = self.fs.normalize_path(dir_path, self.cwd)

        entries = self.fs.readdir(dir_abs)
        if entries is None:
            return

        matches = []
        for name, attr in entries:
            if name in (".", ".."):
                continue
            if name.startswith(raw_prefix):
                display = name
                if stat.S_ISDIR(attr["st_mode"]):
                    display += "/"
                matches.append(display)
        matches.sort()

        if len(matches) == 1:
            suffix = matches[0][len(raw_prefix):]
            self._buffer += suffix
            self.channel.send(suffix.encode())
        elif len(matches) > 1:
            common = os.path.commonprefix(matches)
            if len(common) > len(raw_prefix):
                suffix = common[len(raw_prefix):]
                self._buffer += suffix
                self.channel.send(suffix.encode())
            else:
                self._show_completions(matches)

    # ── Command history ─────────────────────────────────────────────────

    def _add_history(self, cmd):
        """Add a command to history and persist."""
        if not cmd or (self._history and self._history[-1] == cmd):
            return  # Don't dup consecutive identical commands
        self._history.append(cmd)
        self._history_index = -1
        self._save_history()

    def _load_history(self):
        """Load history from ~/.mock_ssh_history."""
        path = os.path.join(os.path.expanduser("~"), ".mock_ssh_history")
        try:
            with open(path, "r", encoding="utf-8") as f:
                self._history = [line.rstrip("\n") for line in f if line.strip()]
        except (FileNotFoundError, OSError):
            self._history = []
        self._history_index = -1

    def _save_history(self):
        """Append the latest command to the history file (max 1000 entries)."""
        path = os.path.join(os.path.expanduser("~"), ".mock_ssh_history")
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(self._history[-1] + "\n")
            # Trim to last 1000 lines
            if len(self._history) > 1000:
                self._history = self._history[-1000:]
                with open(path, "w", encoding="utf-8") as f:
                    for cmd in self._history:
                        f.write(cmd + "\n")
        except OSError:
            pass

    def _history_up(self):
        """Navigate backward in history (Up arrow)."""
        if not self._history:
            return
        if self._history_index == -1:
            # First press — save current line
            self._saved_line = self._buffer
            self._history_index = len(self._history) - 1
        elif self._history_index > 0:
            self._history_index -= 1
        else:
            return  # Already at oldest entry
        self._replace_buffer(self._history[self._history_index])

    def _history_down(self):
        """Navigate forward in history (Down arrow)."""
        if self._history_index == -1:
            return  # Already at the bottom (new input)
        self._history_index += 1
        if self._history_index >= len(self._history):
            self._history_index = -1
            self._replace_buffer(self._saved_line)
            self._saved_line = ""
        else:
            self._replace_buffer(self._history[self._history_index])

    def _replace_buffer(self, text):
        """Replace the current line on the terminal and update _buffer."""
        # Erase current line
        cur_len = len(self._buffer)
        if cur_len > 0:
            self.channel.send(b"\b \b" * cur_len)
        self._buffer = text
        self.channel.send(text.encode())

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
            "history": self._cmd_history,
            "touch": self._cmd_touch,
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

        if not self.fs.exists(target):
            self._writeline(f"cd: {args[0]}: No such file or directory")
        elif not self.fs.is_dir(target):
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
            if self.fs.is_dir(path):
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

    def _cmd_history(self, args):
        """Show command history with line numbers."""
        if not self._history:
            self._writeline("  (history empty)")
            return
        for i, cmd in enumerate(self._history, 1):
            self._writeline(f"  {i:4d}  {cmd}")

    def _cmd_touch(self, args):
        if not args:
            self._writeline("touch: missing file operand")
            return
        path = self.fs.normalize_path(args[0], self.cwd)
        if self.fs.exists(path):
            self.fs.write(path, self.fs.read(path) or b"")
        else:
            self.fs.write(path, b"")

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
            "  help     Show this help message\r\n"
            "  history  Show command history\r\n"
            "  touch    Create an empty file or update file timestamp"
        )


# ── SFTP Handler ──────────────────────────────────────────────────────────


class MockSFTPHandle_VirtualNode(SFTPHandle):
    """A file handle backed by an in-memory VirtualNode (read-only fallback)."""

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


class MockSFTPHandle_File(SFTPHandle):
    """A file handle backed by a real file on disk (read/write)."""

    def __init__(self, fh, flags):
        super().__init__(flags=flags)
        self.fh = fh

    def read(self, offset, length):
        try:
            self.fh.seek(offset)
            return self.fh.read(length)
        except OSError:
            return b""

    def write(self, offset, data):
        try:
            self.fh.seek(offset)
            self.fh.write(data)
            logger.debug("[file_handle.write] offset=%s len=%s", offset, len(data))
            return SFTP_OK
        except OSError:
            return paramiko.SFTP_FAILURE

    def close(self):
        try:
            self.fh.close()
            logger.debug("[file_handle.close] closed")
            return SFTP_OK
        except OSError:
            return paramiko.SFTP_FAILURE


class MockSFTPServer(SFTPServerInterface):
    """SFTP server interface backed by the hybrid filesystem."""

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
        # Get the real filesystem path if possible
        real = None
        if hasattr(self.fs, '_safe_real_path'):
            real = self.fs._safe_real_path(path)
        logger.debug("[open] path=%s flags=%o real=%s", path, flags, real)
        logger.debug("[open] O_CREAT=%s O_WRONLY=%s O_RDWR=%s",
                     bool(flags & os.O_CREAT), bool(flags & os.O_WRONLY), bool(flags & os.O_RDWR))

        # Writing / creating — always use real FS
        if flags & (os.O_CREAT | os.O_WRONLY | os.O_RDWR):
            write_ok = self.fs.write(path, b"")
            logger.debug("[open] write(b'') -> %s", write_ok)
            if real:
                file_exists = os.path.isfile(real)
                logger.debug("[open] real=%s file_exists=%s", real, file_exists)
                if file_exists:
                    try:
                        fh = open(real, "r+b")
                        logger.debug("[open] opened file handle: %s", fh)
                        return MockSFTPHandle_File(fh, flags)
                    except OSError as e:
                        logger.debug("[open] open error: %s", e)
                        return paramiko.SFTP_FAILURE
            logger.debug("[open] falling through to virtual FS")
            return paramiko.SFTP_FAILURE

        # Reading — try real FS first
        if real and os.path.isfile(real):
            try:
                fh = open(real, "rb")
                logger.debug("[open] reading from real FS: %s", real)
                return MockSFTPHandle_File(fh, flags)
            except OSError:
                return paramiko.SFTP_NO_SUCH_FILE

        # Fall back to virtual FS (read-only static content)
        logger.debug("[open] fallback to virtual FS for: %s", path)
        node = self.fs.virtual._resolve(path)
        if node is None:
            return paramiko.SFTP_NO_SUCH_FILE
        if node.is_dir:
            return paramiko.SFTP_FAILURE

        return MockSFTPHandle_VirtualNode(path, flags, node)

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


def _run_sftp(channel, server, fs):
    """Run an SFTP server on the given channel."""
    sftp = paramiko.SFTPServer(channel, "sftp", server, MockSFTPServer, fs=fs)
    sftp.start()
    sftp.join()


def handle_connection(client_sock, addr, fs, config):
    """Handle a single SSH client connection with multi-channel support.

    Shell and SFTP channels are accepted concurrently, each running in its
    own daemon thread. The loop exits when all channels close.
    """
    transport = paramiko.Transport(client_sock)
    transport.add_server_key(config["host_key_obj"])

    server = MockSSHServer(config["auth"]["username"], config["auth"]["password"])

    try:
        transport.start_server(server=server)
    except paramiko.SSHException:
        transport.close()
        return

    active_threads = []

    while True:
        channel = transport.accept(2)
        if channel is not None:
            # Determine what type of channel this is (shell / sftp / exec)
            chan_type = server.pop_channel_type(channel)
            if chan_type is None:
                # Callback hasn't fired yet — wait for it
                server.event.clear()
                server.event.wait(10)
                server.event.clear()
                chan_type = server.pop_channel_type(channel)

            logger.debug("[handle_connection] accepted channel %s: type=%s", channel.chanid, chan_type)

            if chan_type == "shell":
                t = threading.Thread(
                    target=ShellHandler(channel, fs,
                                        username=config["auth"]["username"]).start,
                    daemon=True,
                )
                t.start()
                active_threads.append(t)
            elif chan_type == "sftp":
                t = threading.Thread(
                    target=_run_sftp,
                    args=(channel, server, fs),
                    daemon=True,
                )
                t.start()
                active_threads.append(t)
            else:
                channel.close()
        else:
            # Timeout — prune dead threads and exit if all done
            active_threads = [t for t in active_threads if t.is_alive()]
            if not active_threads:
                break

    transport.close()
