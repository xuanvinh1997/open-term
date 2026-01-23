use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write, Cursor};
use std::path::Path;
use std::sync::Arc;
use suppaftp::FtpStream;
use thiserror::Error;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Error, Debug)]
pub enum FtpTransferError {
    #[error("FTP error: {0}")]
    Ftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Transfer cancelled")]
    Cancelled,
}

impl From<suppaftp::FtpError> for FtpTransferError {
    fn from(e: suppaftp::FtpError) -> Self {
        FtpTransferError::Ftp(e.to_string())
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
}

pub struct FtpTransfer {
    stream: Arc<Mutex<FtpStream>>,
    cancelled: Arc<Mutex<bool>>,
}

// Safety: FtpStream is wrapped in Mutex for thread-safe access
unsafe impl Sync for FtpTransfer {}
unsafe impl Send for FtpTransfer {}

impl FtpTransfer {
    pub fn new(stream: Arc<Mutex<FtpStream>>) -> Self {
        Self {
            stream,
            cancelled: Arc::new(Mutex::new(false)),
        }
    }

    pub fn cancel(&self) {
        *self.cancelled.lock() = true;
    }

    pub fn download<F>(
        &self,
        remote_path: &str,
        local_path: &str,
        mut progress_callback: F,
    ) -> Result<(), FtpTransferError>
    where
        F: FnMut(u64, u64),
    {
        let mut stream = self.stream.lock();

        // Get file size
        let total_size = stream.size(remote_path)
            .map_err(|e| FtpTransferError::Ftp(e.to_string()))? as u64;

        // Download file to a buffer using retr_as_buffer
        let data = stream.retr_as_buffer(remote_path)
            .map_err(|e| FtpTransferError::Ftp(e.to_string()))?;

        drop(stream); // Release the lock before writing to local file

        // Check if cancelled
        if *self.cancelled.lock() {
            return Err(FtpTransferError::Cancelled);
        }

        // Write to local file with progress updates
        let mut local_file = File::create(local_path)?;
        let bytes = data.into_inner();
        let chunk_size = 32768usize; // 32KB chunks for progress updates
        let mut transferred: u64 = 0;

        for chunk in bytes.chunks(chunk_size) {
            if *self.cancelled.lock() {
                return Err(FtpTransferError::Cancelled);
            }

            local_file.write_all(chunk)?;
            transferred += chunk.len() as u64;
            progress_callback(transferred, total_size);
        }

        local_file.flush()?;
        Ok(())
    }

    pub fn upload<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        mut progress_callback: F,
    ) -> Result<(), FtpTransferError>
    where
        F: FnMut(u64, u64),
    {
        // Get local file size
        let metadata = std::fs::metadata(local_path)?;
        let total_size = metadata.len();

        // Open local file
        let mut local_file = File::open(local_path)?;

        // Check if cancelled
        if *self.cancelled.lock() {
            return Err(FtpTransferError::Cancelled);
        }

        // Read file in chunks and track progress
        let chunk_size = 32768usize; // 32KB chunks
        let mut buffer = Vec::new();
        let mut temp_buffer = vec![0u8; chunk_size];
        let mut transferred: u64 = 0;

        // Read entire file with progress updates
        loop {
            if *self.cancelled.lock() {
                return Err(FtpTransferError::Cancelled);
            }

            let bytes_read = local_file.read(&mut temp_buffer)?;
            if bytes_read == 0 {
                break;
            }

            buffer.extend_from_slice(&temp_buffer[..bytes_read]);
            transferred += bytes_read as u64;
            
            // Report progress during read
            progress_callback(transferred / 2, total_size); // Show 0-50% during read
        }

        // Upload using put_file
        let mut stream = self.stream.lock();
        let mut cursor = Cursor::new(&buffer);

        // Report 50% before upload starts
        progress_callback(total_size / 2, total_size);

        stream.put_file(remote_path, &mut cursor)
            .map_err(|e| FtpTransferError::Ftp(e.to_string()))?;

        // Report completion
        progress_callback(total_size, total_size);

        Ok(())
    }

    /// Upload a folder recursively
    pub fn upload_folder<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        mut progress_callback: F,
    ) -> Result<(), FtpTransferError>
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
        let remote_root_str = remote_root.to_string_lossy().to_string();

        {
            let mut stream = self.stream.lock();
            let _ = stream.mkdir(&remote_root_str);
        }

        // Walk through local directory
        for entry in WalkDir::new(local_path).into_iter().filter_map(|e| e.ok()) {
            if *self.cancelled.lock() {
                return Err(FtpTransferError::Cancelled);
            }

            let entry_path = entry.path();
            let relative_path = entry_path.strip_prefix(local_base).unwrap_or(entry_path);
            let remote_entry_path = remote_root.join(relative_path);
            let remote_entry_str = remote_entry_path.to_string_lossy().to_string();

            if entry.file_type().is_dir() {
                // Create directory on remote
                let mut stream = self.stream.lock();
                let _ = stream.mkdir(&remote_entry_str);
            } else if entry.file_type().is_file() {
                // Upload file
                let file_name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                progress_callback(transferred, total_size, &file_name);

                // Read file
                let mut local_file = File::open(entry_path)?;
                let mut buffer = Vec::new();
                local_file.read_to_end(&mut buffer)?;
                let file_size = buffer.len() as u64;

                if *self.cancelled.lock() {
                    return Err(FtpTransferError::Cancelled);
                }

                // Upload
                let mut stream = self.stream.lock();
                let mut cursor = Cursor::new(&buffer);
                stream.put_file(&remote_entry_str, &mut cursor)
                    .map_err(|e| FtpTransferError::Ftp(e.to_string()))?;

                transferred += file_size;
                progress_callback(transferred, total_size, &file_name);
            }
        }

        Ok(())
    }
}
