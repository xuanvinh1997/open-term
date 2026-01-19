use super::pty::PtyHandle;
use crate::ssh::{AuthMethod, SshClient};
use crate::ssh::client::SshChannel;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ssh2::Channel;
use std::io::Read;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SessionType {
    Local,
    Ssh { host: String, port: u16, username: String },
}

enum SessionBackend {
    Local(PtyHandle),
    Ssh {
        client: Arc<SshClient>,
        channel: SshChannel,
        auth: AuthMethod,
    },
}

/// SSH connection details needed to create a new connection
#[derive(Clone)]
pub struct SshConnectionInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
}

pub struct TerminalSession {
    pub id: String,
    pub session_type: SessionType,
    pub title: String,
    backend: Option<SessionBackend>,
    running: Arc<Mutex<bool>>,
}

// Safety: All internal types are wrapped in thread-safe primitives
unsafe impl Sync for TerminalSession {}

impl TerminalSession {
    pub fn new_local(id: String) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let pty = PtyHandle::new(80, 24)?;
        pty.spawn_shell()?;

        Ok(Self {
            id,
            session_type: SessionType::Local,
            title: "Local Terminal".to_string(),
            backend: Some(SessionBackend::Local(pty)),
            running: Arc::new(Mutex::new(true)),
        })
    }

    pub fn new_ssh(
        id: String,
        host: &str,
        port: u16,
        username: &str,
        auth: &AuthMethod,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = SshClient::connect(host, port, username, auth)?;
        let channel = client.open_channel()?;

        let title = format!("{}@{}:{}", username, host, port);

        Ok(Self {
            id,
            session_type: SessionType::Ssh {
                host: host.to_string(),
                port,
                username: username.to_string(),
            },
            title,
            backend: Some(SessionBackend::Ssh {
                client: Arc::new(client),
                channel,
                auth: auth.clone(),
            }),
            running: Arc::new(Mutex::new(true)),
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<usize, std::io::Error> {
        match &self.backend {
            Some(SessionBackend::Local(pty)) => pty.write(data),
            Some(SessionBackend::Ssh { channel, .. }) => {
                channel.write(data).map_err(|e: crate::ssh::client::SshError| {
                    std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
                })
            }
            None => Err(std::io::Error::new(
                std::io::ErrorKind::NotConnected,
                "No backend available",
            )),
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match &self.backend {
            Some(SessionBackend::Local(pty)) => pty.resize(cols, rows),
            Some(SessionBackend::Ssh { channel, .. }) => {
                channel.resize(cols as u32, rows as u32)?;
                Ok(())
            }
            None => Err("No backend available".into()),
        }
    }

    pub fn is_running(&self) -> bool {
        *self.running.lock()
    }

    pub fn stop(&self) {
        *self.running.lock() = false;
        if let Some(SessionBackend::Ssh { channel, .. }) = &self.backend {
            let _ = channel.close();
        }
    }

    pub fn get_reader(&self) -> Option<SessionReader> {
        match &self.backend {
            Some(SessionBackend::Local(pty)) => Some(SessionReader::Local(pty.get_reader())),
            Some(SessionBackend::Ssh { channel, .. }) => {
                Some(SessionReader::Ssh(channel.get_reader()))
            }
            None => None,
        }
    }

    pub fn get_ssh_client(&self) -> Option<Arc<SshClient>> {
        match &self.backend {
            Some(SessionBackend::Ssh { client, .. }) => Some(client.clone()),
            _ => None,
        }
    }

    /// Get SSH connection info for creating a separate SFTP connection
    pub fn get_ssh_connection_info(&self) -> Option<SshConnectionInfo> {
        match (&self.session_type, &self.backend) {
            (
                SessionType::Ssh { host, port, username },
                Some(SessionBackend::Ssh { auth, .. }),
            ) => Some(SshConnectionInfo {
                host: host.clone(),
                port: *port,
                username: username.clone(),
                auth: auth.clone(),
            }),
            _ => None,
        }
    }
}

pub enum SessionReader {
    Local(Arc<Mutex<Box<dyn Read + Send>>>),
    Ssh(Arc<Mutex<Channel>>),
}

impl SessionReader {
    pub fn read(&self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        match self {
            SessionReader::Local(reader) => {
                let mut guard = reader.lock();
                guard.read(buf)
            }
            SessionReader::Ssh(channel) => {
                let mut guard = channel.lock();
                guard.read(buf)
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub session_type: SessionType,
    pub title: String,
}

impl From<&TerminalSession> for SessionInfo {
    fn from(session: &TerminalSession) -> Self {
        Self {
            id: session.id.clone(),
            session_type: session.session_type.clone(),
            title: session.title.clone(),
        }
    }
}
