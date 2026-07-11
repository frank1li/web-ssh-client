## ADDED Requirements

### Requirement: SSH Server accepts connections

The mock server SHALL run a TCP listener that accepts SSH connections using the SSH protocol (paramiko Transport).

#### Scenario: Server listens on configured port
- **WHEN** the mock server starts
- **THEN** it SHALL bind a TCP socket on the configured host and port

#### Scenario: Client connects successfully
- **WHEN** an SSH client connects to the server's port
- **THEN** the server SHALL complete the SSH transport handshake

---

### Requirement: Password authentication

The server SHALL accept password authentication using a configurable set of credentials.

#### Scenario: Correct credentials
- **WHEN** a client authenticates with username `mock` and password `mock`
- **THEN** the server SHALL accept the authentication

#### Scenario: Wrong password
- **WHEN** a client authenticates with the correct username but wrong password
- **THEN** the server SHALL reject the authentication

#### Scenario: Wrong username
- **WHEN** a client authenticates with a non-existent username
- **THEN** the server SHALL reject the authentication

#### Scenario: Configurable credentials
- **WHEN** the config file specifies `username: admin` and `password: secret`
- **THEN** the server SHALL accept `admin`/`secret` as valid credentials
- **AND** reject `mock`/`mock`

---

### Requirement: RSA host key

The server SHALL present an RSA host key during SSH handshake. On first run, it SHALL generate a new key and cache it to disk for reuse.

#### Scenario: Host key auto-generation
- **WHEN** the server starts for the first time and no host key file exists
- **THEN** it SHALL generate a 2048-bit RSA key
- **AND** save it to the configured host key path

#### Scenario: Host key reuse
- **WHEN** the server starts and a host key file already exists
- **THEN** it SHALL load the existing key from the file

---

### Requirement: Interactive shell

After authentication, the server SHALL provide an interactive shell session with a prompt and built-in commands.

#### Scenario: Shell prompt displayed
- **WHEN** a client opens a shell session
- **THEN** the server SHALL send a shell prompt string (e.g., `user@mock-server:~$ `)

#### Scenario: Command echo and execution
- **WHEN** a client types a command and presses Enter
- **THEN** the server SHALL echo the typed characters
- **AND** execute the command
- **AND** display the output
- **AND** display a new prompt

#### Scenario: Unknown command
- **WHEN** a client types an unrecognized command
- **THEN** the server SHALL display `command not found` or similar

---

### Requirement: Shell commands

The interactive shell SHALL support the following built-in commands: `ls`, `cd`, `pwd`, `cat`, `echo`, `whoami`, `id`, `uname`, `date`, `clear`, `exit`, `help`.

#### Scenario: ls lists directory contents
- **WHEN** a client runs `ls`
- **THEN** the server SHALL list the files and directories in the current working directory

#### Scenario: cd changes directory
- **WHEN** a client runs `cd /etc`
- **THEN** the server SHALL update the current working directory to `/etc`

#### Scenario: cd with .. moves up
- **WHEN** a client runs `cd ..`
- **THEN** the server SHALL move the working directory up one level

#### Scenario: pwd shows current path
- **WHEN** a client runs `pwd`
- **THEN** the server SHALL output the absolute path of the current working directory

#### Scenario: cat displays file content
- **WHEN** a client runs `cat /etc/hostname`
- **THEN** the server SHALL output the content of the specified file

#### Scenario: cat on directory shows error
- **WHEN** a client runs `cat /etc`
- **THEN** the server SHALL display an error (e.g., `Is a directory`)

#### Scenario: echo outputs text
- **WHEN** a client runs `echo hello world`
- **THEN** the server SHALL output `hello world`

#### Scenario: whoami shows username
- **WHEN** a client runs `whoami`
- **THEN** the server SHALL output the authenticated username

#### Scenario: id shows user info
- **WHEN** a client runs `id`
- **THEN** the server SHALL output user ID information (uid, gid, groups)

#### Scenario: uname shows system info
- **WHEN** a client runs `uname -a`
- **THEN** the server SHALL output kernel/system information

#### Scenario: date shows current time
- **WHEN** a client runs `date`
- **THEN** the server SHALL output the current date and time

#### Scenario: clear clears screen
- **WHEN** a client runs `clear`
- **THEN** the server SHALL send ANSI escape codes to clear the terminal

#### Scenario: exit closes session
- **WHEN** a client runs `exit`
- **THEN** the server SHALL close the shell session

#### Scenario: help lists commands
- **WHEN** a client runs `help`
- **THEN** the server SHALL list all available built-in commands

---

### Requirement: Virtual Linux filesystem

The server SHALL maintain an in-memory filesystem with standard Linux top-level directories and representative files.

#### Scenario: Standard directories exist at root
- **WHEN** a client runs `ls /`
- **THEN** the server SHALL show at least: `bin`, `boot`, `dev`, `etc`, `home`, `lib`, `media`, `mnt`, `opt`, `proc`, `root`, `run`, `sbin`, `srv`, `sys`, `tmp`, `usr`, `var`

#### Scenario: /proc contains virtual files
- **WHEN** a client runs `ls /proc`
- **THEN** the server SHALL list files including `cpuinfo`, `meminfo`, `uptime`, `version`

#### Scenario: /home/user exists
- **WHEN** a client runs `ls /home`
- **THEN** the server SHALL show a `user` directory

#### Scenario: /etc contains configuration files
- **WHEN** a client runs `ls /etc`
- **THEN** the server SHALL list files including `hostname`, `passwd`, `hosts`, `resolv.conf`

---

### Requirement: SFTP support

The server SHALL support SFTP subsystem for file operations: list directory, stat file, read file, write file, create directory, delete file, delete directory, rename.

#### Scenario: SFTP list directory
- **WHEN** a client requests SFTP readdir on `/`
- **THEN** the server SHALL return directory entries

#### Scenario: SFTP stat file
- **WHEN** a client requests SFTP stat on `/etc/hostname`
- **THEN** the server SHALL return file attributes (size, mtime, permissions, type)

#### Scenario: SFTP read file
- **WHEN** a client opens `/etc/hostname` for reading
- **THEN** the server SHALL return the file content

#### Scenario: SFTP write file
- **WHEN** a client uploads a file to `/home/user/upload.txt`
- **THEN** the server SHALL create the file in the virtual filesystem

#### Scenario: SFTP create directory
- **WHEN** a client creates `/home/user/newdir`
- **THEN** the server SHALL create the directory in the virtual filesystem

#### Scenario: SFTP delete file
- **WHEN** a client deletes `/tmp/test.txt`
- **THEN** the server SHALL remove the file from the virtual filesystem

#### Scenario: SFTP rename
- **WHEN** a client renames `/tmp/a.txt` to `/tmp/b.txt`
- **THEN** the server SHALL update the filename in the virtual filesystem

---

### Requirement: Config file

The server SHALL read configuration from `config.json` (or YAML) in the `mock-server/` directory, with CLI flags overriding file values.

#### Scenario: Default config
- **WHEN** no config file exists
- **THEN** the server SHALL use defaults (port 2222, auth mock/mock, host 0.0.0.0)

#### Scenario: Config file overrides defaults
- **WHEN** a config file exists with `port: 2222`
- **THEN** the server SHALL listen on the configured port

#### Scenario: CLI flag overrides config file
- **WHEN** a config file sets `port: 2222` and CLI flag `--port 2223`
- **THEN** the server SHALL listen on the CLI-specified port
