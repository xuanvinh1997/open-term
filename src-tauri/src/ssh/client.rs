use super::auth::AuthMethod;
use parking_lot::Mutex;
use ssh2::{Channel, Session, Sftp};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    Connection(String),
    #[error("Authentication failed: {0}")]
    Authentication(String),
    #[error("Channel error: {0}")]
    Channel(String),
    #[error("SFTP error: {0}")]
    Sftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("SSH2 error: {0}")]
    Ssh2(#[from] ssh2::Error),
}

pub struct SshClient {
    session: Arc<Mutex<Session>>,
    host: String,
    port: u16,
    username: String,
}

// Safety: Session is wrapped in Mutex for thread-safe access
unsafe impl Sync for SshClient {}
unsafe impl Send for SshClient {}

impl SshClient {
    pub fn connect(
        host: &str,
        port: u16,
        username: &str,
        auth: &AuthMethod,
    ) -> Result<Self, SshError> {
        let addr = format!("{}:{}", host, port);
        let tcp = TcpStream::connect(&addr)
            .map_err(|e| SshError::Connection(format!("Failed to connect to {}: {}", addr, e)))?;

        tcp.set_nonblocking(false)?;

        let mut session = Session::new()?;
        session.set_tcp_stream(tcp);
        session.handshake()?;

        // Authenticate
        match auth {
            AuthMethod::Password { password } => {
                session
                    .userauth_password(username, password)
                    .map_err(|e| SshError::Authentication(e.to_string()))?;
            }
            AuthMethod::PublicKey {
                private_key_path,
                passphrase,
            } => {
                let key_path = Path::new(private_key_path);
                session
                    .userauth_pubkey_file(
                        username,
                        None,
                        key_path,
                        passphrase.as_deref(),
                    )
                    .map_err(|e| SshError::Authentication(e.to_string()))?;
            }
            AuthMethod::Agent => {
                let mut agent = session.agent()?;
                agent.connect()?;
                agent.list_identities()?;

                let identities = agent.identities()?;
                let mut authenticated = false;

                for identity in identities {
                    if agent.userauth(username, &identity).is_ok() {
                        authenticated = true;
                        break;
                    }
                }

                if !authenticated {
                    return Err(SshError::Authentication(
                        "No valid identity found in SSH agent".to_string(),
                    ));
                }
            }
        }

        if !session.authenticated() {
            return Err(SshError::Authentication("Authentication failed".to_string()));
        }

        // Keep session in blocking mode initially - we'll switch channels to non-blocking after setup
        Ok(Self {
            session: Arc::new(Mutex::new(session)),
            host: host.to_string(),
            port,
            username: username.to_string(),
        })
    }

    pub fn open_channel(&self) -> Result<SshChannel, SshError> {
        let mut session = self.session.lock();

        // Ensure blocking mode for channel setup
        session.set_blocking(true);

        let mut channel = session.channel_session()?;
        channel.request_pty("xterm-256color", None, Some((80, 24, 0, 0)))?;
        channel.shell()?;

        // Switch to non-blocking mode for I/O operations
        session.set_blocking(false);

        Ok(SshChannel {
            channel: Arc::new(Mutex::new(channel)),
        })
    }

    pub fn open_sftp(&self) -> Result<SftpSession, SshError> {
        let mut session = self.session.lock();

        // Ensure blocking mode for SFTP setup
        session.set_blocking(true);

        let sftp = session.sftp()?;

        // Restore non-blocking mode for terminal channel I/O
        session.set_blocking(false);

        Ok(SftpSession {
            sftp: Arc::new(Mutex::new(sftp)),
            session: self.session.clone(),
        })
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn username(&self) -> &str {
        &self.username
    }
}

pub struct SshChannel {
    channel: Arc<Mutex<Channel>>,
}

// Safety: Channel is wrapped in Mutex for thread-safe access
unsafe impl Sync for SshChannel {}
unsafe impl Send for SshChannel {}

impl SshChannel {
    pub fn write(&self, data: &[u8]) -> Result<usize, SshError> {
        let mut channel = self.channel.lock();

        // Handle non-blocking write with retry
        let mut total_written = 0;
        let mut remaining = data;

        while !remaining.is_empty() {
            match channel.write(remaining) {
                Ok(0) => break,
                Ok(n) => {
                    total_written += n;
                    remaining = &remaining[n..];
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Brief sleep and retry for non-blocking mode
                    std::thread::sleep(std::time::Duration::from_millis(1));
                    continue;
                }
                Err(e) => return Err(SshError::Io(e)),
            }
        }

        // Flush with retry for non-blocking mode
        loop {
            match channel.flush() {
                Ok(_) => break,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                    continue;
                }
                Err(e) => return Err(SshError::Io(e)),
            }
        }

        Ok(total_written)
    }

    pub fn read(&self, buf: &mut [u8]) -> Result<usize, SshError> {
        let mut channel = self.channel.lock();
        channel.read(buf).map_err(SshError::from)
    }

    pub fn resize(&self, cols: u32, rows: u32) -> Result<(), SshError> {
        let mut channel = self.channel.lock();
        channel.request_pty_size(cols, rows, None, None)?;
        Ok(())
    }

    pub fn close(&self) -> Result<(), SshError> {
        let mut channel = self.channel.lock();
        channel.send_eof()?;
        channel.wait_close()?;
        Ok(())
    }

    pub fn get_reader(&self) -> Arc<Mutex<Channel>> {
        self.channel.clone()
    }
}

pub struct SftpSession {
    sftp: Arc<Mutex<Sftp>>,
    session: Arc<Mutex<Session>>,
}

// Safety: Sftp is wrapped in Mutex for thread-safe access
unsafe impl Sync for SftpSession {}
unsafe impl Send for SftpSession {}

impl SftpSession {
    pub fn sftp(&self) -> Arc<Mutex<Sftp>> {
        self.sftp.clone()
    }

    pub fn session(&self) -> Arc<Mutex<Session>> {
        self.session.clone()
    }
}
