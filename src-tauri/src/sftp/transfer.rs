use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ssh2::{Session, Sftp};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Error, Debug)]
pub enum TransferError {
    #[error("SFTP error: {0}")]
    Sftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Transfer cancelled")]
    Cancelled,
}

impl From<ssh2::Error> for TransferError {
    fn from(e: ssh2::Error) -> Self {
        TransferError::Sftp(e.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TransferStatus {
    Pending,
    InProgress,
    Completed,
    Failed(String),
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub id: String,
    pub filename: String,
    pub local_path: String,
    pub remote_path: String,
    pub is_upload: bool,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub status: TransferStatus,
}

impl TransferProgress {
    pub fn new(
        filename: String,
        local_path: String,
        remote_path: String,
        is_upload: bool,
        total_bytes: u64,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            filename,
            local_path,
            remote_path,
            is_upload,
            total_bytes,
            transferred_bytes: 0,
            status: TransferStatus::Pending,
        }
    }

    pub fn progress_percent(&self) -> f64 {
        if self.total_bytes == 0 {
            return 100.0;
        }
        (self.transferred_bytes as f64 / self.total_bytes as f64) * 100.0
    }
}

pub struct FileTransfer {
    sftp: Arc<Mutex<Sftp>>,
    session: Arc<Mutex<Session>>,
    cancelled: Arc<Mutex<bool>>,
}

// Safety: Sftp and Session are wrapped in Mutex for thread-safe access
unsafe impl Sync for FileTransfer {}
unsafe impl Send for FileTransfer {}

impl FileTransfer {
    pub fn new(sftp: Arc<Mutex<Sftp>>, session: Arc<Mutex<Session>>) -> Self {
        Self {
            sftp,
            session,
            cancelled: Arc::new(Mutex::new(false)),
        }
    }

    pub fn cancel(&self) {
        *self.cancelled.lock() = true;
    }

    /// Execute an SFTP operation with blocking mode enabled
    fn with_blocking<T, F>(&self, f: F) -> T
    where
        F: FnOnce(&Sftp) -> T,
    {
        let session = self.session.lock();
        session.set_blocking(true);

        let sftp = self.sftp.lock();
        let result = f(&sftp);

        // Restore non-blocking mode
        session.set_blocking(false);

        result
    }

    pub fn download<F>(
        &self,
        remote_path: &str,
        local_path: &str,
        mut progress_callback: F,
    ) -> Result<(), TransferError>
    where
        F: FnMut(u64, u64),
    {
        // Set blocking mode for the entire transfer operation
        let session = self.session.lock();
        session.set_blocking(true);

        let sftp = self.sftp.lock();
        let remote = Path::new(remote_path);

        // Get file size
        let stat = sftp.stat(remote)?;
        let total_size = stat.size.unwrap_or(0);

        // Open remote file
        let mut remote_file = sftp.open(remote)?;

        // Create local file
        let mut local_file = File::create(local_path)?;

        let mut buffer = [0u8; 32768]; // 32KB buffer
        let mut transferred: u64 = 0;

        loop {
            if *self.cancelled.lock() {
                session.set_blocking(false);
                return Err(TransferError::Cancelled);
            }

            let bytes_read = remote_file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }

            local_file.write_all(&buffer[..bytes_read])?;
            transferred += bytes_read as u64;
            progress_callback(transferred, total_size);
        }

        local_file.flush()?;
        session.set_blocking(false);
        Ok(())
    }

    pub fn upload<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        mut progress_callback: F,
    ) -> Result<(), TransferError>
    where
        F: FnMut(u64, u64),
    {
        // Set blocking mode for the entire transfer operation
        let session = self.session.lock();
        session.set_blocking(true);

        let sftp = self.sftp.lock();
        let remote = Path::new(remote_path);

        // Get local file size
        let local_file_meta = std::fs::metadata(local_path)?;
        let total_size = local_file_meta.len();

        // Open local file
        let mut local_file = File::open(local_path)?;

        // Create remote file
        let mut remote_file = sftp.create(remote)?;

        let mut buffer = [0u8; 32768]; // 32KB buffer
        let mut transferred: u64 = 0;

        loop {
            if *self.cancelled.lock() {
                session.set_blocking(false);
                return Err(TransferError::Cancelled);
            }

            let bytes_read = local_file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }

            remote_file.write_all(&buffer[..bytes_read])?;
            transferred += bytes_read as u64;
            progress_callback(transferred, total_size);
        }

        remote_file.flush()?;
        session.set_blocking(false);
        Ok(())
    }

    /// Upload a folder recursively
    pub fn upload_folder<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        mut progress_callback: F,
    ) -> Result<(), TransferError>
    where
        F: FnMut(u64, u64, &str), // (transferred, total, current_file)
    {
        let local_base = Path::new(local_path);
        let remote_base = Path::new(remote_path);

        // Calculate total size first
        let mut total_size: u64 = 0;
        for entry in WalkDir::new(local_path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(metadata) = entry.metadata() {
                    total_size += metadata.len();
                }
            }
        }

        let mut transferred: u64 = 0;

        // Create the root remote directory
        let folder_name = local_base
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "upload".to_string());
        let remote_root = remote_base.join(&folder_name);

        // Set blocking mode for the entire folder upload
        let session = self.session.lock();
        session.set_blocking(true);

        {
            let sftp = self.sftp.lock();
            let _ = sftp.mkdir(&remote_root, 0o755);
        }

        // Walk through local directory
        for entry in WalkDir::new(local_path).into_iter().filter_map(|e| e.ok()) {
            if *self.cancelled.lock() {
                session.set_blocking(false);
                return Err(TransferError::Cancelled);
            }

            let entry_path = entry.path();
            let relative_path = entry_path.strip_prefix(local_base).unwrap_or(entry_path);
            let remote_entry_path = remote_root.join(relative_path);

            if entry.file_type().is_dir() {
                // Create directory on remote
                let sftp = self.sftp.lock();
                let _ = sftp.mkdir(&remote_entry_path, 0o755);
            } else if entry.file_type().is_file() {
                // Upload file
                let file_name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                progress_callback(transferred, total_size, &file_name);

                let sftp = self.sftp.lock();
                let mut local_file = File::open(entry_path)?;
                let mut remote_file = sftp.create(&remote_entry_path)?;

                let mut buffer = [0u8; 32768];
                loop {
                    if *self.cancelled.lock() {
                        session.set_blocking(false);
                        return Err(TransferError::Cancelled);
                    }

                    let bytes_read = local_file.read(&mut buffer)?;
                    if bytes_read == 0 {
                        break;
                    }

                    remote_file.write_all(&buffer[..bytes_read])?;
                    transferred += bytes_read as u64;
                    progress_callback(transferred, total_size, &file_name);
                }

                remote_file.flush()?;
            }
        }

        session.set_blocking(false);
        Ok(())
    }
}
