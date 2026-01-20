use super::session::{SessionInfo, SshConnectionInfo, TerminalSession};
use crate::ssh::AuthMethod;
use crate::ssh::SshClient;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub struct TerminalManager {
    sessions: RwLock<HashMap<String, TerminalSession>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub fn create_local_session(&self) -> Result<SessionInfo, String> {
        let id = Uuid::new_v4().to_string();
        let session = TerminalSession::new_local(id.clone())
            .map_err(|e| format!("Failed to create terminal session: {}", e))?;

        let info = SessionInfo::from(&session);
        self.sessions.write().insert(id, session);
        Ok(info)
    }

    pub fn create_ssh_session(
        &self,
        host: &str,
        port: u16,
        username: &str,
        auth: &AuthMethod,
    ) -> Result<SessionInfo, String> {
        let id = Uuid::new_v4().to_string();
        let session = TerminalSession::new_ssh(id.clone(), host, port, username, auth)
            .map_err(|e| format!("Failed to create SSH session: {}", e))?;

        let info = SessionInfo::from(&session);
        self.sessions.write().insert(id, session);
        Ok(info)
    }

    pub fn write_to_session(&self, session_id: &str, data: &[u8]) -> Result<usize, String> {
        let sessions = self.sessions.read();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.write(data).map_err(|e| e.to_string())
    }

    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.read();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.resize(cols, rows).map_err(|e| e.to_string())
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.remove(session_id) {
            session.stop();
            Ok(())
        } else {
            Err(format!("Session not found: {}", session_id))
        }
    }

    pub fn get_session_info(&self, session_id: &str) -> Option<SessionInfo> {
        let sessions = self.sessions.read();
        sessions.get(session_id).map(SessionInfo::from)
    }

    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.read();
        sessions.values().map(SessionInfo::from).collect()
    }

    pub fn get_ssh_client(&self, session_id: &str) -> Option<Arc<SshClient>> {
        let sessions = self.sessions.read();
        sessions.get(session_id).and_then(|s| s.get_ssh_client())
    }

    pub fn get_ssh_connection_info(&self, session_id: &str) -> Option<SshConnectionInfo> {
        let sessions = self.sessions.read();
        sessions.get(session_id).and_then(|s| s.get_ssh_connection_info())
    }

    pub fn start_output_reader(&self, session_id: &str, app_handle: AppHandle) -> Result<(), String> {
        let sessions = self.sessions.read();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        let reader = session
            .get_reader()
            .ok_or_else(|| "No reader available".to_string())?;

        let id = session_id.to_string();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        let event_name = format!("terminal-output-{}", id);
                        if app_handle.emit(&event_name, data).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        // Handle WouldBlock for non-blocking SSH sessions
                        if e.kind() == std::io::ErrorKind::WouldBlock {
                            // Sleep briefly before trying again to avoid busy-waiting
                            std::thread::sleep(std::time::Duration::from_millis(10));
                            continue;
                        }
                        eprintln!("Error reading from session: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(())
    }
}
