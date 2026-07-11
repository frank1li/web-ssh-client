#!/usr/bin/env python3
"""Mock SSH Server — standalone SSH server with a virtual Linux filesystem.

Provides an SSH interface (shell + SFTP) backed by an in-memory fake Linux
environment. Useful for testing SSH clients without a real SSH server.

Usage:
    python mock_server.py
    python mock_server.py --port 2222
    python mock_server.py --config my-config.json
"""

import argparse
import json
import logging
import os
import signal
import socket
import sys
import threading
import time

from paramiko import RSAKey, SSHException

from virtual_fs import VirtualFilesystem, HybridFilesystem
from mock_handler import handle_connection

# Default paths relative to this script's directory
_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CONFIG_PATH = os.path.join(_HERE, "config.json")
_DEFAULT_HOST_KEY_PATH = os.path.join(_HERE, "host_key")

_DEFAULT_CONFIG = {
    "host": "0.0.0.0",
    "port": 2222,
    "auth": {"username": "mock", "password": "mock"},
    "host_key": _DEFAULT_HOST_KEY_PATH,
    "root_dir": os.path.join(_HERE, "mock-root"),
    "log_file": None,
}


# ── Configuration ─────────────────────────────────────────────────────────


def load_config(cli_args):
    """Load config from JSON file (if exists), then overlay CLI arguments.

    Returns a merged config dict.
    """
    config = dict(_DEFAULT_CONFIG)

    # Load config file if present
    config_path = cli_args.config or _DEFAULT_CONFIG_PATH
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                file_config = json.load(f)
            config.update(file_config)
        except (json.JSONDecodeError, OSError) as e:
            logging.warning("Could not load config file '%s': %s", config_path, e)

    # CLI overrides
    if cli_args.host is not None:
        config["host"] = cli_args.host
    if cli_args.port is not None:
        config["port"] = cli_args.port
    if cli_args.username is not None:
        config["auth"]["username"] = cli_args.username
    if cli_args.password is not None:
        config["auth"]["password"] = cli_args.password
    if cli_args.host_key is not None:
        config["host_key"] = cli_args.host_key
    if cli_args.root_dir is not None:
        config["root_dir"] = cli_args.root_dir
    if cli_args.log_file is not None:
        config["log_file"] = os.path.abspath(cli_args.log_file)

    return config


# ── Logging ────────────────────────────────────────────────────────────────


def logging_setup(config):
    """Configure logging: terminal output (INFO+) and optional file (DEBUG+).

    Call once at startup before any log messages.
    """
    log_level = getattr(logging, config.get("log_level", "DEBUG"))
    fmt = logging.Formatter("[%(asctime)s] %(levelname)s %(message)s",
                            datefmt="%Y-%m-%d %H:%M:%S")

    # Root logger
    root = logging.getLogger()
    root.setLevel(log_level)

    # Remove any pre-existing handlers (in case of re-init)
    root.handlers.clear()

    # Always log to stderr at INFO level
    stream = logging.StreamHandler(sys.stderr)
    stream.setLevel(logging.INFO)
    stream.setFormatter(fmt)
    root.addHandler(stream)

    # Optional log file at DEBUG level
    log_file = config.get("log_file")
    if log_file:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(log_file)), exist_ok=True)
        except OSError:
            pass
        fh = logging.FileHandler(log_file, mode="a", encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        root.addHandler(fh)
        logging.info("Logging to file: %s", log_file)


# ── Host key management ───────────────────────────────────────────────────


def load_or_generate_host_key(key_path):
    """Load an existing RSA host key or generate a new 2048-bit one."""
    key_path = os.path.abspath(key_path)
    key_dir = os.path.dirname(key_path)
    if key_dir and not os.path.exists(key_dir):
        os.makedirs(key_dir, exist_ok=True)

    if os.path.exists(key_path):
        try:
            key = RSAKey.from_private_key_file(key_path)
            logging.info("Loaded existing host key from %s", key_path)
            return key
        except SSHException as e:
            logging.warning("Could not load host key '%s': %s", key_path, e)

    # Generate a new key
    logging.info("Generating new RSA host key (2048-bit)...")
    key = RSAKey.generate(bits=2048)
    try:
        key.write_private_key_file(key_path)
        logging.info("Saved host key to %s", key_path)
    except OSError as e:
        logging.warning("Could not save host key: %s", e)

    return key


# ── Server ─────────────────────────────────────────────────────────────────


class MockServer:
    """TCP server that accepts SSH connections and dispatches them."""

    def __init__(self, config):
        self.config = config
        self._shutdown_event = threading.Event()
        self._server_socket = None
        self._threads = []
        self._fs = None

    def run(self):
        """Start the TCP listener and accept connections in a loop."""
        host = self.config["host"]
        port = self.config["port"]

        self._server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_socket.settimeout(1.0)  # So we can poll the shutdown event

        try:
            self._server_socket.bind((host, port))
            self._server_socket.listen(100)
        except OSError as e:
            logging.error("Could not bind to %s:%s — %s", host, port, e)
            sys.exit(1)

        fs = HybridFilesystem(VirtualFilesystem(), self.config["root_dir"])
        self._fs = fs
        self.config["host_key_obj"] = load_or_generate_host_key(self.config["host_key"])

        auth = self.config["auth"]
        logging.info("Mock SSH Server started on %s:%s", host, port)
        logging.info("  Credentials: %s / %s", auth['username'], auth['password'])
        logging.info("  Host key: %s", os.path.abspath(self.config['host_key']))
        logging.info("  Root dir: %s", os.path.abspath(self.config['root_dir']))
        logging.info("Press Ctrl+C to stop.")

        while not self._shutdown_event.is_set():
            try:
                client_sock, addr = self._server_socket.accept()
            except socket.timeout:
                continue
            except OSError:
                break

            logging.info("Connection from %s:%s", addr[0], addr[1])
            t = threading.Thread(
                target=handle_connection,
                args=(client_sock, addr, fs, self.config),
                daemon=True,
            )
            t.start()
            self._threads.append(t)

        self._cleanup()

    def stop(self):
        """Signal graceful shutdown."""
        logging.info("Shutting down...")
        self._shutdown_event.set()
        if self._server_socket:
            try:
                self._server_socket.close()
            except OSError:
                pass

    def _cleanup(self):
        """Wait for active threads to finish."""
        logging.info("Waiting for %s active connections to close...", len(self._threads))
        for t in self._threads:
            t.join(timeout=5)
        logging.info("Goodbye.")


# ── CLI ────────────────────────────────────────────────────────────────────


def build_parser():
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        description="Mock SSH Server — virtual Linux SSH server for testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  %(prog)s                         # default (port 2222)\n"
            "  %(prog)s --port 2222              # custom port\n"
            "  %(prog)s --host 127.0.0.1         # bind to localhost only\n"
            "  %(prog)s --username admin --password secret\n"
        ),
    )
    parser.add_argument(
        "--host",
        help="Bind address (default: 0.0.0.0)",
    )
    parser.add_argument(
        "-p", "--port",
        type=int,
        help="SSH port (default: 2222)",
    )
    parser.add_argument(
        "-u", "--username",
        help="Authentication username (default: mock)",
    )
    parser.add_argument(
        "--password",
        help="Authentication password (default: mock)",
    )
    parser.add_argument(
        "--host-key",
        help="Path to RSA host key file (default: ./host_key)",
    )
    parser.add_argument(
        "--root-dir",
        help="Path to real filesystem root directory for SFTP (default: ./mock-root)",
    )
    parser.add_argument(
        "--log-file",
        help="Path to log file (default: stderr only)",
    )
    parser.add_argument(
        "-c", "--config",
        help=f"Path to JSON config file (default: {_DEFAULT_CONFIG_PATH})",
    )
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    config = load_config(args)

    logging_setup(config)
    logging.info("Starting Mock SSH Server...")
    server = MockServer(config)

    # Register signal handlers for graceful shutdown
    def _signal_handler(signum, frame):
        server.stop()

    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _signal_handler)
    try:
        signal.signal(signal.SIGINT, _signal_handler)
    except ValueError:
        pass  # signal() may fail in some environments

    server.run()


if __name__ == "__main__":
    main()
