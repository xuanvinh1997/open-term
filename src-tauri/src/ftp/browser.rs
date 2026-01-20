use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use suppaftp::FtpStream;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum FtpBrowserError {
    #[error("FTP error: {0}")]
    Ftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Path error: {0}")]
    Path(String),
    #[error("Parse error: {0}")]
    Parse(String),
}

impl From<suppaftp::FtpError> for FtpBrowserError {
    fn from(e: suppaftp::FtpError) -> Self {
        FtpBrowserError::Ftp(e.to_string())
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

pub struct FtpBrowser {
    stream: Arc<Mutex<FtpStream>>,
    current_path: Mutex<PathBuf>,
}

// Safety: FtpStream is wrapped in Mutex for thread-safe access
unsafe impl Sync for FtpBrowser {}
unsafe impl Send for FtpBrowser {}

impl FtpBrowser {
    pub fn new(stream: Arc<Mutex<FtpStream>>) -> Self {
        Self {
            stream,
            current_path: Mutex::new(PathBuf::from("/")),
        }
    }

    pub fn stream(&self) -> Arc<Mutex<FtpStream>> {
        self.stream.clone()
    }

    pub fn current_path(&self) -> String {
        self.current_path.lock().to_string_lossy().to_string()
    }

    pub fn set_path(&self, path: &str) {
        *self.current_path.lock() = PathBuf::from(path);
    }

    pub fn pwd(&self) -> Result<String, FtpBrowserError> {
        let mut stream = self.stream.lock();
        let path = stream.pwd().map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(path)
    }

    pub fn cwd(&self, path: &str) -> Result<(), FtpBrowserError> {
        let mut stream = self.stream.lock();
        stream.cwd(path).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(())
    }

    pub fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>, FtpBrowserError> {
        let mut stream = self.stream.lock();

        // Change to the target directory
        stream.cwd(path).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;

        // Get current path after cwd
        let current_path_str = stream.pwd().map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;

        // Get detailed list
        let list = stream.list(None).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;

        let mut files: Vec<FileEntry> = list
            .into_iter()
            .filter_map(|line| self.parse_list_line(&line, &current_path_str))
            .filter(|entry| entry.name != "." && entry.name != "..")
            .collect();

        // Sort: directories first, then by name
        files.sort_by(|a, b| {
            match (&a.file_type, &b.file_type) {
                (FileType::Directory, FileType::Directory) => {
                    a.name.to_lowercase().cmp(&b.name.to_lowercase())
                }
                (FileType::Directory, _) => std::cmp::Ordering::Less,
                (_, FileType::Directory) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(files)
    }

    /// Parse a line from FTP LIST command output (Unix-style format)
    fn parse_list_line(&self, line: &str, parent_path: &str) -> Option<FileEntry> {
        // Unix-style: drwxr-xr-x  2 user group  4096 Jan  1 12:00 dirname
        // Windows-style: 01-01-24  12:00PM       <DIR>          dirname

        let parts: Vec<&str> = line.split_whitespace().collect();

        if parts.len() < 4 {
            return None;
        }

        // Try Unix-style parsing first
        if let Some(first_char) = line.chars().next() {
            if first_char == 'd' || first_char == '-' || first_char == 'l' {
                return self.parse_unix_list_line(line, parent_path);
            }
        }

        // Try Windows/DOS-style parsing
        self.parse_dos_list_line(line, parent_path)
    }

    fn parse_unix_list_line(&self, line: &str, parent_path: &str) -> Option<FileEntry> {
        let parts: Vec<&str> = line.split_whitespace().collect();

        if parts.len() < 9 {
            return None;
        }

        let permissions_str = parts[0];
        let first_char = permissions_str.chars().next()?;

        let file_type = match first_char {
            'd' => FileType::Directory,
            'l' => FileType::Symlink,
            '-' => FileType::File,
            _ => FileType::Other,
        };

        // Parse permissions (convert rwx to octal)
        let permissions = self.parse_unix_permissions(permissions_str);

        // Size is typically at index 4
        let size: u64 = parts[4].parse().unwrap_or(0);

        // Name is the last part (index 8 onwards, joined for names with spaces)
        let name = parts[8..].join(" ");

        // Handle symlinks: "name -> target"
        let name = if file_type == FileType::Symlink {
            name.split(" -> ").next().unwrap_or(&name).to_string()
        } else {
            name
        };

        let path = if parent_path == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", parent_path, name)
        };

        Some(FileEntry {
            name,
            path,
            file_type,
            size,
            modified: None, // Could parse date but it's complex
            permissions,
        })
    }

    fn parse_dos_list_line(&self, line: &str, parent_path: &str) -> Option<FileEntry> {
        // Format: 01-01-24  12:00PM       <DIR>          dirname
        // Or:     01-01-24  12:00PM              12345 filename.txt

        let parts: Vec<&str> = line.split_whitespace().collect();

        if parts.len() < 4 {
            return None;
        }

        let is_dir = parts.iter().any(|&p| p == "<DIR>");
        let file_type = if is_dir {
            FileType::Directory
        } else {
            FileType::File
        };

        let (size, name_start) = if is_dir {
            // Find <DIR> position, name comes after
            let dir_pos = parts.iter().position(|&p| p == "<DIR>")?;
            (0u64, dir_pos + 1)
        } else {
            // Size is before the name (usually index 2)
            let size: u64 = parts[2].parse().unwrap_or(0);
            (size, 3)
        };

        if name_start >= parts.len() {
            return None;
        }

        let name = parts[name_start..].join(" ");

        let path = if parent_path == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", parent_path, name)
        };

        Some(FileEntry {
            name,
            path,
            file_type,
            size,
            modified: None,
            permissions: None,
        })
    }

    fn parse_unix_permissions(&self, perms: &str) -> Option<u32> {
        if perms.len() < 10 {
            return None;
        }

        let chars: Vec<char> = perms.chars().collect();
        let mut mode: u32 = 0;

        // Owner permissions (chars 1-3)
        if chars.get(1) == Some(&'r') {
            mode |= 0o400;
        }
        if chars.get(2) == Some(&'w') {
            mode |= 0o200;
        }
        if chars.get(3) == Some(&'x') || chars.get(3) == Some(&'s') {
            mode |= 0o100;
        }

        // Group permissions (chars 4-6)
        if chars.get(4) == Some(&'r') {
            mode |= 0o040;
        }
        if chars.get(5) == Some(&'w') {
            mode |= 0o020;
        }
        if chars.get(6) == Some(&'x') || chars.get(6) == Some(&'s') {
            mode |= 0o010;
        }

        // Others permissions (chars 7-9)
        if chars.get(7) == Some(&'r') {
            mode |= 0o004;
        }
        if chars.get(8) == Some(&'w') {
            mode |= 0o002;
        }
        if chars.get(9) == Some(&'x') || chars.get(9) == Some(&'t') {
            mode |= 0o001;
        }

        Some(mode)
    }

    pub fn mkdir(&self, path: &str) -> Result<(), FtpBrowserError> {
        let mut stream = self.stream.lock();
        stream.mkdir(path).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(())
    }

    pub fn rmdir(&self, path: &str) -> Result<(), FtpBrowserError> {
        let mut stream = self.stream.lock();
        stream.rmdir(path).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(())
    }

    pub fn delete(&self, path: &str) -> Result<(), FtpBrowserError> {
        let mut stream = self.stream.lock();
        stream.rm(path).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(())
    }

    pub fn rename(&self, from: &str, to: &str) -> Result<(), FtpBrowserError> {
        let mut stream = self.stream.lock();
        stream.rename(from, to).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(())
    }

    pub fn size(&self, path: &str) -> Result<u64, FtpBrowserError> {
        let mut stream = self.stream.lock();
        let size = stream.size(path).map_err(|e| FtpBrowserError::Ftp(e.to_string()))?;
        Ok(size as u64)
    }
}
