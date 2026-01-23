use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LocalBrowserError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Path error: {0}")]
    Path(String),
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

pub fn list_directory(path: &str) -> Result<Vec<FileEntry>, LocalBrowserError> {
    let path_buf = PathBuf::from(path);
    
    if !path_buf.exists() {
        return Err(LocalBrowserError::Path(format!("Path does not exist: {}", path)));
    }
    
    if !path_buf.is_dir() {
        return Err(LocalBrowserError::Path(format!("Path is not a directory: {}", path)));
    }

    let entries = fs::read_dir(&path_buf)?;
    let mut files: Vec<FileEntry> = Vec::new();

    for entry_result in entries {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue, // Skip entries we can't read
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue, // Skip entries we can't get metadata for
        };

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        let entry_path = entry.path();
        let full_path = entry_path.to_string_lossy().to_string();

        let file_type = if metadata.is_dir() {
            FileType::Directory
        } else if metadata.is_symlink() {
            FileType::Symlink
        } else if metadata.is_file() {
            FileType::File
        } else {
            FileType::Other
        };

        let size = metadata.len();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64);

        #[cfg(unix)]
        let permissions = {
            use std::os::unix::fs::PermissionsExt;
            Some(metadata.permissions().mode())
        };

        #[cfg(not(unix))]
        let permissions = None;

        files.push(FileEntry {
            name,
            path: full_path,
            file_type,
            size,
            modified,
            permissions,
        });
    }

    // Sort: directories first, then alphabetically by name
    files.sort_by(|a, b| {
        match (&a.file_type, &b.file_type) {
            (FileType::Directory, FileType::Directory) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            (FileType::Directory, _) => std::cmp::Ordering::Less,
            (_, FileType::Directory) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(files)
}

pub fn get_home_dir() -> Result<String, LocalBrowserError> {
    let home = dirs::home_dir()
        .ok_or_else(|| LocalBrowserError::Path("Could not determine home directory".to_string()))?;
    
    Ok(home.to_string_lossy().to_string())
}

pub fn get_downloads_dir() -> Result<String, LocalBrowserError> {
    let downloads = dirs::download_dir()
        .ok_or_else(|| LocalBrowserError::Path("Could not determine downloads directory".to_string()))?;
    
    Ok(downloads.to_string_lossy().to_string())
}
