use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ssh2::{Session, Sftp};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SftpError {
    #[error("SFTP error: {0}")]
    Sftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Path error: {0}")]
    Path(String),
}

impl From<ssh2::Error> for SftpError {
    fn from(e: ssh2::Error) -> Self {
        SftpError::Sftp(e.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FileType {
    File,
    Directory,
    Symlink,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub file_type: FileType,
    pub size: u64,
    pub modified: Option<i64>,
    pub permissions: Option<u32>,
}

pub struct SftpBrowser {
    pub sftp: Arc<Mutex<Sftp>>,
    pub session: Arc<Mutex<Session>>,
    current_path: Mutex<PathBuf>,
}

// Safety: Sftp is wrapped in Mutex for thread-safe access
unsafe impl Sync for SftpBrowser {}
unsafe impl Send for SftpBrowser {}

impl SftpBrowser {
    pub fn new(sftp: Arc<Mutex<Sftp>>, session: Arc<Mutex<Session>>) -> Self {
        Self {
            sftp,
            session,
            current_path: Mutex::new(PathBuf::from("/")),
        }
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

    pub fn current_path(&self) -> String {
        self.current_path.lock().to_string_lossy().to_string()
    }

    pub fn set_path(&self, path: &str) {
        *self.current_path.lock() = PathBuf::from(path);
    }

    pub fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>, SftpError> {
        let path_str = path.to_string();
        self.with_blocking(|sftp| {
            let path = Path::new(&path_str);
            let entries = sftp.readdir(path)?;

            let mut files: Vec<FileEntry> = entries
                .into_iter()
                .filter_map(|(entry_path, stat)| {
                    let name = entry_path.file_name()?.to_string_lossy().to_string();

                    // Skip . and ..
                    if name == "." || name == ".." {
                        return None;
                    }

                    let file_type = if stat.is_dir() {
                        FileType::Directory
                    } else if stat.file_type().is_symlink() {
                        FileType::Symlink
                    } else if stat.is_file() {
                        FileType::File
                    } else {
                        FileType::Other
                    };

                    Some(FileEntry {
                        name,
                        path: entry_path.to_string_lossy().to_string(),
                        file_type,
                        size: stat.size.unwrap_or(0),
                        modified: stat.mtime.map(|t| t as i64),
                        permissions: stat.perm,
                    })
                })
                .collect();

            // Sort: directories first, then by name
            files.sort_by(|a, b| {
                match (&a.file_type, &b.file_type) {
                    (FileType::Directory, FileType::Directory) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                    (FileType::Directory, _) => std::cmp::Ordering::Less,
                    (_, FileType::Directory) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });

            Ok(files)
        })
    }

    pub fn stat(&self, path: &str) -> Result<FileEntry, SftpError> {
        let path_str = path.to_string();
        self.with_blocking(|sftp| {
            let path_buf = Path::new(&path_str);
            let stat = sftp.stat(path_buf)?;

            let name = path_buf
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "/".to_string());

            let file_type = if stat.is_dir() {
                FileType::Directory
            } else if stat.file_type().is_symlink() {
                FileType::Symlink
            } else if stat.is_file() {
                FileType::File
            } else {
                FileType::Other
            };

            Ok(FileEntry {
                name,
                path: path_str.clone(),
                file_type,
                size: stat.size.unwrap_or(0),
                modified: stat.mtime.map(|t| t as i64),
                permissions: stat.perm,
            })
        })
    }

    pub fn mkdir(&self, path: &str) -> Result<(), SftpError> {
        let path_str = path.to_string();
        self.with_blocking(|sftp| {
            sftp.mkdir(Path::new(&path_str), 0o755)?;
            Ok(())
        })
    }

    pub fn rmdir(&self, path: &str) -> Result<(), SftpError> {
        let path_str = path.to_string();
        self.with_blocking(|sftp| {
            sftp.rmdir(Path::new(&path_str))?;
            Ok(())
        })
    }

    pub fn delete(&self, path: &str) -> Result<(), SftpError> {
        let path_str = path.to_string();
        self.with_blocking(|sftp| {
            sftp.unlink(Path::new(&path_str))?;
            Ok(())
        })
    }

    pub fn rename(&self, old_path: &str, new_path: &str) -> Result<(), SftpError> {
        let old = old_path.to_string();
        let new = new_path.to_string();
        self.with_blocking(|sftp| {
            sftp.rename(
                Path::new(&old),
                Path::new(&new),
                None,
            )?;
            Ok(())
        })
    }

    pub fn realpath(&self, path: &str) -> Result<String, SftpError> {
        let path_str = path.to_string();
        self.with_blocking(|sftp| {
            let real = sftp.realpath(Path::new(&path_str))?;
            Ok(real.to_string_lossy().to_string())
        })
    }
}
