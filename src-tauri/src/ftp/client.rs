use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use suppaftp::FtpStream;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum FtpError {
    #[error("FTP error: {0}")]
    Ftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Connection error: {0}")]
    Connection(String),
    #[error("Authentication failed: {0}")]
    Auth(String),
}

impl From<suppaftp::FtpError> for FtpError {
    fn from(e: suppaftp::FtpError) -> Self {
        FtpError::Ftp(e.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FtpAuthMethod {
    Anonymous,
    Password { username: String, password: String },
}

pub struct FtpClient {
    stream: Arc<Mutex<FtpStream>>,
    host: String,
    port: u16,
}

// Safety: FtpStream is wrapped in Mutex for thread-safe access
unsafe impl Sync for FtpClient {}
unsafe impl Send for FtpClient {}

impl FtpClient {
    pub fn connect(host: &str, port: u16, auth: &FtpAuthMethod) -> Result<Self, FtpError> {
        let addr = format!("{}:{}", host, port);
        let mut stream = FtpStream::connect(&addr)
            .map_err(|e| FtpError::Connection(e.to_string()))?;

        // Authenticate
        match auth {
            FtpAuthMethod::Anonymous => {
                stream
                    .login("anonymous", "anonymous@")
                    .map_err(|e| FtpError::Auth(e.to_string()))?;
            }
            FtpAuthMethod::Password { username, password } => {
                stream
                    .login(username, password)
                    .map_err(|e| FtpError::Auth(e.to_string()))?;
            }
        }

        // Switch to binary mode for file transfers
        stream
            .transfer_type(suppaftp::types::FileType::Binary)
            .map_err(|e| FtpError::Ftp(e.to_string()))?;

        Ok(Self {
            stream: Arc::new(Mutex::new(stream)),
            host: host.to_string(),
            port,
        })
    }

    pub fn stream(&self) -> Arc<Mutex<FtpStream>> {
        self.stream.clone()
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn quit(&self) -> Result<(), FtpError> {
        let mut stream = self.stream.lock();
        stream.quit().map_err(|e| FtpError::Ftp(e.to_string()))
    }
}

impl Drop for FtpClient {
    fn drop(&mut self) {
        let _ = self.quit();
    }
}
