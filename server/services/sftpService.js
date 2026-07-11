const Client = require('ssh2').Client;
const logger = require('../utils/logger');

class SFTPService {
  /**
   * List directory contents
   */
  listDirectory(sessionId, conn, remotePath) {
    logger.sshInfo(sessionId, 'SFTP list directory', { path: remotePath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP list failed', { error: err.message, path: remotePath });
          return reject(err);
        }

        sftp.readdir(remotePath, (err, list) => {
          sftp.end();
          if (err) {
            logger.sshError(sessionId, 'SFTP readdir failed', { error: err.message, path: remotePath });
            return reject(err);
          }

          const files = list.map(item => ({
            filename: item.filename,
            longname: item.longname,
            type: item.attrs.isDirectory() ? 'directory' : 'file',
            size: item.attrs.size,
            mode: item.attrs.mode,
            uid: item.attrs.uid,
            gid: item.attrs.gid,
            atime: item.attrs.atime,
            mtime: item.attrs.mtime
          }));

          resolve(files);
        });
      });
    });
  }

  /**
   * Upload a file to remote server
   */
  uploadFile(sessionId, conn, localPath, remotePath, onProgress) {
    logger.sshInfo(sessionId, 'SFTP upload start', { localPath, remotePath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP upload init failed', { error: err.message });
          return reject(err);
        }

        const writeStream = sftp.createWriteStream(remotePath);
        const fs = require('fs');
        const readStream = fs.createReadStream(localPath);
        const totalBytes = fs.statSync(localPath).size;
        let writtenBytes = 0;

        writeStream.on('open', () => {
          readStream.pipe(writeStream);
        });

        writeStream.on('error', (err) => {
          logger.sshError(sessionId, 'SFTP upload write failed', { error: err.message, remotePath });
          readStream.destroy();
          reject(err);
        });

        writeStream.on('close', () => {
          logger.sshInfo(sessionId, 'SFTP upload complete', { remotePath, bytes: totalBytes });
          sftp.end();
          resolve();
        });

        readStream.on('data', (chunk) => {
          writtenBytes += chunk.length;
          if (onProgress) onProgress(writtenBytes, totalBytes);
        });
      });
    });
  }

  /**
   * Download a file from remote server
   */
  downloadFile(sessionId, conn, remotePath, localPath, onProgress) {
    logger.sshInfo(sessionId, 'SFTP download start', { remotePath, localPath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP download init failed', { error: err.message });
          return reject(err);
        }

        sftp.stat(remotePath, (err, stat) => {
          if (err) {
            logger.sshError(sessionId, 'SFTP stat failed', { error: err.message, remotePath });
            sftp.end();
            return reject(err);
          }

          const readStream = sftp.createReadStream(remotePath);
          const fs = require('fs');
          const writeStream = fs.createWriteStream(localPath);
          const totalBytes = stat.size;
          let downloadedBytes = 0;

          readStream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (onProgress) onProgress(downloadedBytes, totalBytes);
          });

          readStream.pipe(writeStream);

          writeStream.on('finish', () => {
            logger.sshInfo(sessionId, 'SFTP download complete', { remotePath, bytes: totalBytes });
            sftp.end();
            resolve();
          });

          writeStream.on('error', (err) => {
            logger.sshError(sessionId, 'SFTP download write failed', { error: err.message, localPath });
            readStream.destroy();
            reject(err);
          });
        });
      });
    });
  }

  /**
   * Get file info (stat)
   */
  stat(sessionId, conn, remotePath) {
    logger.sshDebug(sessionId, 'SFTP stat', { path: remotePath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP stat init failed', { error: err.message });
          return reject(err);
        }
        sftp.stat(remotePath, (err, stat) => {
          sftp.end();
          if (err) {
            logger.sshError(sessionId, 'SFTP stat failed', { error: err.message, path: remotePath });
            return reject(err);
          }
          resolve({
            size: stat.size,
            mode: stat.mode,
            uid: stat.uid,
            gid: stat.gid,
            atime: stat.atime,
            mtime: stat.mtime,
            isDirectory: stat.isDirectory()
          });
        });
      });
    });
  }

  /**
   * Delete a remote file
   */
  deleteFile(sessionId, conn, remotePath) {
    logger.sshInfo(sessionId, 'SFTP delete', { path: remotePath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP delete init failed', { error: err.message });
          return reject(err);
        }
        sftp.unlink(remotePath, (err) => {
          sftp.end();
          if (err) {
            logger.sshError(sessionId, 'SFTP delete failed', { error: err.message, path: remotePath });
            return reject(err);
          }
          logger.sshInfo(sessionId, 'SFTP delete complete', { path: remotePath });
          resolve();
        });
      });
    });
  }

  /**
   * Create a remote directory
   */
  createDirectory(sessionId, conn, remotePath) {
    logger.sshInfo(sessionId, 'SFTP mkdir', { path: remotePath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP mkdir init failed', { error: err.message });
          return reject(err);
        }
        sftp.mkdir(remotePath, (err) => {
          sftp.end();
          if (err) {
            logger.sshError(sessionId, 'SFTP mkdir failed', { error: err.message, path: remotePath });
            return reject(err);
          }
          logger.sshInfo(sessionId, 'SFTP mkdir complete', { path: remotePath });
          resolve();
        });
      });
    });
  }

  /**
   * Create a readable stream for downloading a remote file
   * Returns { stream, sftp, stat } - caller must clean up sftp
   */
  createReadStream(sessionId, conn, remotePath) {
    logger.sshInfo(sessionId, 'SFTP read stream', { path: remotePath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP read stream init failed', { error: err.message });
          return reject(err);
        }
        sftp.stat(remotePath, (err, stat) => {
          if (err) {
            logger.sshError(sessionId, 'SFTP stat for stream failed', { error: err.message, path: remotePath });
            sftp.end();
            return reject(err);
          }
          if (stat.isDirectory()) {
            sftp.end();
            return reject(new Error('Cannot download a directory'));
          }
          const stream = sftp.createReadStream(remotePath);
          resolve({ stream, sftp, stat });
        });
      });
    });
  }

  /**
   * Rename a remote file or directory
   */
  rename(sessionId, conn, oldPath, newPath) {
    logger.sshInfo(sessionId, 'SFTP rename', { oldPath, newPath });
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.sshError(sessionId, 'SFTP rename init failed', { error: err.message });
          return reject(err);
        }
        sftp.rename(oldPath, newPath, (err) => {
          sftp.end();
          if (err) {
            logger.sshError(sessionId, 'SFTP rename failed', { error: err.message, oldPath, newPath });
            return reject(err);
          }
          logger.sshInfo(sessionId, 'SFTP rename complete', { oldPath, newPath });
          resolve();
        });
      });
    });
  }
}

module.exports = new SFTPService();
